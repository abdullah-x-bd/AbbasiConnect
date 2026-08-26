import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { adminPage } from "./adminPage.js";

const app = Fastify({ logger: true });
await app.register(jwt, { secret: config.jwtSecret });

const production = process.env.NODE_ENV === "production";
const adminUsername = process.env.ADMIN_USERNAME ?? (production ? "" : "admin");
const adminPassword = process.env.ADMIN_PASSWORD ?? (production ? "" : "AbbasiAdmin123!");
const adminPort = Number(process.env.ADMIN_PORT ?? 3002);

if (!adminUsername || !adminPassword) {
  throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD are required for the admin console in production");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function ageFromDate(date?: Date | null) {
  if (!date) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  const monthDifference = today.getUTCMonth() - date.getUTCMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getUTCDate() < date.getUTCDate())) age -= 1;
  return age;
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return reply.code(401).send({ error: "Unauthorized admin session" });
  try {
    const payload = app.jwt.verify<{ scope?: string }>(header.slice(7));
    if (payload.scope !== "admin") return reply.code(401).send({ error: "Unauthorized admin session" });
  } catch {
    return reply.code(401).send({ error: "Unauthorized admin session" });
  }
}

app.get("/", async (_request, reply) => reply.type("text/html; charset=utf-8").send(adminPage));
app.get("/admin", async (_request, reply) => reply.type("text/html; charset=utf-8").send(adminPage));
app.get("/health", async () => ({ ok: true, service: "abbasiconnect-admin", mode: "admin" }));

app.post("/admin/api/login", async (request, reply) => {
  const body = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Enter the admin username and password" });
  if (!safeEqual(body.data.username, adminUsername) || !safeEqual(body.data.password, adminPassword)) {
    return reply.code(401).send({ error: "Incorrect admin credentials" });
  }
  return { token: app.jwt.sign({ scope: "admin" }, { expiresIn: "8h" }), expiresInHours: 8 };
});

app.get("/admin/api/overview", { preHandler: requireAdmin }, async () => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    totalUsers, activeUsers, pausedUsers, suspendedUsers, moderators, recentCount,
    totalInterests, pendingInterests, acceptedInterests, declinedInterests, withdrawnInterests,
    shortlistCount, blockCount,
    totalReports, openReports, reviewedReports, actionedReports, dismissedReports,
    recentUsers, distributionUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { suspendedAt: null, isProfileActive: true } }),
    prisma.user.count({ where: { suspendedAt: null, isProfileActive: false } }),
    prisma.user.count({ where: { suspendedAt: { not: null } } }),
    prisma.user.count({ where: { role: "MODERATOR" } }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.matchInterest.count(),
    prisma.matchInterest.count({ where: { status: "PENDING" } }),
    prisma.matchInterest.count({ where: { status: "ACCEPTED" } }),
    prisma.matchInterest.count({ where: { status: "DECLINED" } }),
    prisma.matchInterest.count({ where: { status: "WITHDRAWN" } }),
    prisma.shortlist.count(),
    prisma.block.count(),
    prisma.report.count(),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.report.count({ where: { status: "REVIEWED" } }),
    prisma.report.count({ where: { status: "ACTIONED" } }),
    prisma.report.count({ where: { status: "DISMISSED" } }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 12, select: { id: true, displayName: true, username: true, dateOfBirth: true, gender: true, city: true, occupation: true, role: true, isProfileActive: true, suspendedAt: true, createdAt: true } }),
    prisma.user.findMany({ select: { gender: true, city: true, maritalStatus: true } }),
  ]);

  function distribution(values: Array<string | null | undefined>, limit?: number) {
    const map = new Map<string, number>();
    for (const raw of values) {
      const label = raw?.trim() || "Not specified";
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, limit ?? 100);
  }

  return {
    generatedAt: new Date(),
    metrics: {
      users: { total: totalUsers, active: activeUsers, paused: pausedUsers, suspended: suspendedUsers, moderators, last7Days: recentCount },
      interests: { total: totalInterests, pending: pendingInterests, accepted: acceptedInterests, declined: declinedInterests, withdrawn: withdrawnInterests },
      shortlists: shortlistCount,
      blocks: blockCount,
      reports: { total: totalReports, open: openReports, reviewed: reviewedReports, actioned: actionedReports, dismissed: dismissedReports },
    },
    distributions: {
      gender: distribution(distributionUsers.map((user) => user.gender)),
      cities: distribution(distributionUsers.map((user) => user.city), 10),
      maritalStatus: distribution(distributionUsers.map((user) => user.maritalStatus)),
    },
    recentUsers: recentUsers.map((user) => ({ ...user, age: ageFromDate(user.dateOfBirth) })),
  };
});

app.get("/admin/api/users", { preHandler: requireAdmin }, async (request, reply) => {
  const query = z.object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(["active", "paused", "suspended"]).optional(),
  }).safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "Invalid member filters" });

  const q = query.data.q;
  const users = await prisma.user.findMany({
    where: {
      ...(query.data.status === "active" ? { suspendedAt: null, isProfileActive: true } : {}),
      ...(query.data.status === "paused" ? { suspendedAt: null, isProfileActive: false } : {}),
      ...(query.data.status === "suspended" ? { suspendedAt: { not: null } } : {}),
      ...(q ? { OR: [
        { displayName: { contains: q, mode: "insensitive" } },
        { username: { contains: q.toLowerCase(), mode: "insensitive" } },
        { email: { contains: q.toLowerCase(), mode: "insensitive" } },
        { phone: { contains: q } },
        { city: { contains: q, mode: "insensitive" } },
        { occupation: { contains: q, mode: "insensitive" } },
      ] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true, displayName: true, username: true, email: true, phone: true, dateOfBirth: true, gender: true,
      city: true, state: true, country: true, heightCm: true, maritalStatus: true, education: true, occupation: true,
      profileCreatedBy: true, isProfileActive: true, role: true, suspendedAt: true, createdAt: true, verifiedAt: true,
      identityRefHash: true, identityLast4: true,
    },
  });

  return { users: users.map(({ identityRefHash, ...user }) => ({ ...user, age: ageFromDate(user.dateOfBirth), identityVerified: Boolean(identityRefHash) })) };
});

app.patch("/admin/api/users/:id", { preHandler: requireAdmin }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ action: z.enum(["SUSPEND", "RESTORE", "PAUSE", "ACTIVATE", "MAKE_MODERATOR", "MAKE_MEMBER"]) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid administrative action" });

  const data = body.data.action === "SUSPEND" ? { suspendedAt: new Date() }
    : body.data.action === "RESTORE" ? { suspendedAt: null }
    : body.data.action === "PAUSE" ? { isProfileActive: false }
    : body.data.action === "ACTIVATE" ? { isProfileActive: true }
    : body.data.action === "MAKE_MODERATOR" ? { role: "MODERATOR" as const }
    : { role: "MEMBER" as const };

  try {
    const user = await prisma.user.update({ where: { id: params.data.id }, data });
    return { ok: true, user: { id: user.id, username: user.username, role: user.role, suspendedAt: user.suspendedAt, isProfileActive: user.isProfileActive } };
  } catch {
    return reply.code(404).send({ error: "Member not found" });
  }
});

app.get("/admin/api/interests", { preHandler: requireAdmin }, async () => {
  const interests = await prisma.matchInterest.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      sender: { select: { id: true, displayName: true, username: true } },
      receiver: { select: { id: true, displayName: true, username: true } },
    },
  });
  return { interests };
});

app.get("/admin/api/reports", { preHandler: requireAdmin }, async () => {
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      reporter: { select: { id: true, displayName: true, username: true } },
      reportedUser: { select: { id: true, displayName: true, username: true, suspendedAt: true } },
      reviewedBy: { select: { id: true, displayName: true, username: true } },
    },
  });
  return { reports };
});

app.patch("/admin/api/reports/:id", { preHandler: requireAdmin }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ action: z.enum(["REVIEW", "DISMISS", "SUSPEND_USER", "RESTORE_USER"]), note: z.string().trim().max(1000).optional() }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid report action" });
  const report = await prisma.report.findUnique({ where: { id: params.data.id } });
  if (!report) return reply.code(404).send({ error: "Report not found" });

  if (body.data.action === "SUSPEND_USER") await prisma.user.update({ where: { id: report.reportedUserId }, data: { suspendedAt: new Date() } });
  if (body.data.action === "RESTORE_USER") await prisma.user.update({ where: { id: report.reportedUserId }, data: { suspendedAt: null } });
  const status = body.data.action === "DISMISS" ? "DISMISSED" : body.data.action === "REVIEW" ? "REVIEWED" : "ACTIONED";
  const updated = await prisma.report.update({ where: { id: report.id }, data: { status, moderationNote: body.data.note || "" } });
  return { ok: true, report: updated };
});

const close = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({ port: adminPort, host: "0.0.0.0" });
app.log.info({ adminPort, adminUsername, developmentDefaultCredential: !production && !process.env.ADMIN_PASSWORD }, "AbbasiConnect admin console ready");
