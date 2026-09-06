import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { hashIdentityReference } from "./identity.js";
import type { AuthTokenPayload } from "./types.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: config.webOrigin });
await app.register(jwt, { secret: config.jwtSecret });

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthTokenPayload;
    user: AuthTokenPayload;
  }
}

const usernameSchema = z.string().trim().toLowerCase().min(3, "Username must be at least 3 characters").max(24).regex(/^[a-z0-9_]+$/, "Username can contain only letters, numbers and underscores");
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(72, "Password is too long");
const relationSchema = z.enum(["PARENT", "CHILD", "SIBLING", "SPOUSE", "OTHER"]);
const reportReasonSchema = z.enum(["SPAM", "HARASSMENT", "IMPERSONATION", "FALSE_INFORMATION", "INAPPROPRIATE", "OTHER"]);
const production = process.env.NODE_ENV === "production";
const adminUsername = process.env.ADMIN_USERNAME ?? (production ? "" : "admin");
const adminPassword = process.env.ADMIN_PASSWORD ?? (production ? "" : "AbbasiAdmin123!");

function normalizePhone(value?: string | null) {
  if (!value) return undefined;
  const normalized = value.replace(/[\s()-]/g, "");
  return normalized || undefined;
}

function normalizeContact(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return normalizePhone(trimmed) ?? trimmed;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function ageFromDate(date?: Date | null) {
  if (!date) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  const md = today.getUTCMonth() - date.getUTCMonth();
  if (md < 0 || (md === 0 && today.getUTCDate() < date.getUTCDate())) age -= 1;
  return age;
}

function memberSummary(user: any) {
  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    age: ageFromDate(user.dateOfBirth),
    gender: user.gender,
    city: user.city,
    state: user.state,
    country: user.country,
    occupation: user.occupation,
    education: user.education,
    about: user.about,
    maritalStatus: user.maritalStatus,
    heightCm: user.heightCm,
    contactVerified: user.contactVerified,
    aadhaarVerified: Boolean(user.aadhaarVerifiedAt),
    role: user.role,
  };
}

function fullMe(user: any) {
  return {
    ...memberSummary(user),
    email: user.email,
    phone: user.phone,
    dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    languages: user.languages,
    interests: user.interests,
    isDirectoryVisible: user.isDirectoryVisible,
    suspendedAt: user.suspendedAt,
    createdAt: user.createdAt,
  };
}

async function requireMember(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    if (!request.user?.userId || request.user.scope === "admin") return reply.code(401).send({ error: "Member sign-in required" });
    const user = await prisma.user.findUnique({ where: { id: request.user.userId }, select: { suspendedAt: true } });
    if (!user || user.suspendedAt) return reply.code(403).send({ error: "Account unavailable" });
  } catch {
    return reply.code(401).send({ error: "Member sign-in required" });
  }
}

async function requireModerator(request: FastifyRequest, reply: FastifyReply) {
  const result = await requireMember(request, reply);
  if (result) return result;
  const user = await prisma.user.findUnique({ where: { id: request.user.userId }, select: { role: true } });
  if (!user || user.role === "MEMBER") return reply.code(403).send({ error: "Moderator access required" });
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    if (request.user.scope !== "admin" || request.user.userId !== "__admin__") return reply.code(403).send({ error: "Admin access required" });
  } catch {
    return reply.code(401).send({ error: "Admin sign-in required" });
  }
}

function inviteCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

async function blocked(a: string, b: string) {
  return Boolean(await prisma.block.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }, select: { blockerId: true } }));
}

async function familyComponentIds(startId: string) {
  const visited = new Set<string>();
  const queue = [startId];
  while (queue.length && visited.size < 150) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const links = await prisma.familyLink.findMany({
      where: { status: "VERIFIED", OR: [{ ownerId: current }, { relativeUserId: current }] },
      select: { ownerId: true, relativeUserId: true },
    });
    for (const link of links) {
      if (!visited.has(link.ownerId)) queue.push(link.ownerId);
      if (link.relativeUserId && !visited.has(link.relativeUserId)) queue.push(link.relativeUserId);
    }
  }
  return [...visited];
}

app.get("/health", async () => ({ ok: true, service: "abbasiconnect-api", mode: "community-platform-v2" }));

// ---------- Authentication ----------

async function requestDevelopmentOtp(request: FastifyRequest, reply: FastifyReply) {
  const body = z.object({ contact: z.string().trim().min(5).max(254) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Enter a valid phone number or email" });
  const contact = normalizeContact(body.data.contact);
  const isEmail = contact.includes("@");
  if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return reply.code(400).send({ error: "Enter a valid email address" });
  if (!isEmail && !/^\+?[1-9]\d{7,14}$/.test(contact)) return reply.code(400).send({ error: "Use the full phone number with country code, for example +91…" });

  const code = String(randomInt(100000, 1000000));
  const challenge = await prisma.otpChallenge.create({
    data: {
      contact,
      channel: "DEVELOPMENT",
      codeHash: await bcrypt.hash(code, 10),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  return { challengeId: challenge.id, developmentCode: code, expiresInMinutes: 10, channel: "DEVELOPMENT" };
}

app.post("/auth/request-otp", requestDevelopmentOtp);
app.post("/auth/request-otp-dev", requestDevelopmentOtp);

app.post("/auth/register", async (request, reply) => {
  const body = z.object({
    challengeId: z.string().uuid("Request an OTP first"),
    otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
    contact: z.string().trim().min(5, "Enter your phone number or email").max(254),
    displayName: z.string().trim().min(2, "Enter your name").max(80),
    username: usernameSchema,
    password: passwordSchema,
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date of birth").optional(),
    gender: z.string().trim().max(32).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    country: z.string().trim().min(2).max(80).default("India"),
  }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message || "Check the registration details" });

  const contact = normalizeContact(body.data.contact);
  const challenge = await prisma.otpChallenge.findUnique({ where: { id: body.data.challengeId } });
  if (!challenge || challenge.contact !== contact || challenge.usedAt || challenge.expiresAt < new Date()) return reply.code(401).send({ error: "OTP expired or invalid" });
  if (!await bcrypt.compare(body.data.otp, challenge.codeHash)) return reply.code(401).send({ error: "Incorrect OTP" });

  const isEmail = contact.includes("@");
  const email = isEmail ? contact : undefined;
  const phone = isEmail ? undefined : contact;
  const dateOfBirth = body.data.dateOfBirth ? new Date(`${body.data.dateOfBirth}T00:00:00.000Z`) : null;
  if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) return reply.code(400).send({ error: "Invalid date of birth" });

  const conflict = await prisma.user.findFirst({ where: { OR: [{ username: body.data.username }, ...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] }, select: { id: true } });
  if (conflict) return reply.code(409).send({ error: "Username or contact is already registered" });

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        displayName: body.data.displayName,
        username: body.data.username,
        passwordHash: await bcrypt.hash(body.data.password, 12),
        email,
        phone,
        contactVerified: true,
        verificationChannel: challenge.channel,
        dateOfBirth,
        gender: body.data.gender || null,
        city: body.data.city || null,
        state: body.data.state || null,
        country: body.data.country,
      },
    });
    await tx.otpChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date(), userId: created.id } });
    return created;
  });

  const token = app.jwt.sign({ userId: user.id }, { expiresIn: "30d" });
  return reply.code(201).send({ mode: "member", token, user: fullMe(user) });
});

app.post("/auth/sign-in", async (request, reply) => {
  const body = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Enter your username and password" });

  if (adminUsername && adminPassword && safeEqual(body.data.username, adminUsername) && safeEqual(body.data.password, adminPassword)) {
    return { mode: "admin", token: app.jwt.sign({ userId: "__admin__", scope: "admin" }, { expiresIn: "8h" }), user: { displayName: "Administrator", username: adminUsername, role: "ADMIN" } };
  }

  const username = body.data.username.toLowerCase();
  const user = /^[a-z0-9_]{3,24}$/.test(username) ? await prisma.user.findUnique({ where: { username } }) : null;
  if (!user?.passwordHash || !await bcrypt.compare(body.data.password, user.passwordHash)) return reply.code(401).send({ error: "Incorrect username or password" });
  if (user.suspendedAt) return reply.code(403).send({ error: "Account unavailable" });
  return { mode: "member", token: app.jwt.sign({ userId: user.id }, { expiresIn: "30d" }), user: fullMe(user) };
});

app.get("/auth/session", async (request, reply) => {
  try {
    await request.jwtVerify();
    if (request.user.scope === "admin") return { mode: "admin", user: { displayName: "Administrator", username: adminUsername, role: "ADMIN" } };
    const user = await prisma.user.findUnique({ where: { id: request.user.userId } });
    if (!user || user.suspendedAt) return reply.code(401).send({ error: "Session unavailable" });
    return { mode: "member", user: fullMe(user) };
  } catch {
    return reply.code(401).send({ error: "Session unavailable" });
  }
});

app.get("/auth/me", { preHandler: requireMember }, async (request, reply) => {
  const user = await prisma.user.findUnique({ where: { id: request.user.userId } });
  if (!user) return reply.code(404).send({ error: "User not found" });
  return fullMe(user);
});

app.patch("/auth/me", { preHandler: requireMember }, async (request, reply) => {
  const body = z.object({
    displayName: z.string().trim().min(2).max(80),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    country: z.string().trim().min(2).max(80),
    gender: z.string().trim().max(32).optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    education: z.string().trim().max(180),
    occupation: z.string().trim().max(180),
    about: z.string().trim().max(1500),
    languages: z.string().trim().max(300),
    interests: z.string().trim().max(500),
    isDirectoryVisible: z.boolean(),
  }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Invalid profile details" });
  const dateOfBirth = body.data.dateOfBirth ? new Date(`${body.data.dateOfBirth}T00:00:00.000Z`) : null;
  const user = await prisma.user.update({ where: { id: request.user.userId }, data: { ...body.data, dateOfBirth, city: body.data.city || null, state: body.data.state || null, gender: body.data.gender || null } });
  return fullMe(user);
});

app.post("/identity/aadhaar-dev", { preHandler: requireMember }, async (request, reply) => {
  const body = z.object({ reference: z.string().trim().min(4).max(100), name: z.string().trim().min(2).max(100), last4: z.string().regex(/^\d{4}$/).optional() }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Invalid identity reference" });
  const identityRefHash = hashIdentityReference(body.data.reference);
  const conflict = await prisma.user.findFirst({ where: { identityRefHash, id: { not: request.user.userId } }, select: { id: true } });
  if (conflict) return reply.code(409).send({ error: "This identity reference is already linked" });
  await prisma.user.update({ where: { id: request.user.userId }, data: { identityRefHash, identityName: body.data.name, identityLast4: body.data.last4, aadhaarVerifiedAt: new Date() } });
  return { ok: true };
});

// ---------- Directory and family ----------

app.get("/directory", { preHandler: requireMember }, async (request, reply) => {
  const query = z.object({ q: z.string().trim().max(80).optional() }).safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "Invalid search" });
  const q = query.data.q;
  const users = await prisma.user.findMany({
    where: { id: { not: request.user.userId }, suspendedAt: null, isDirectoryVisible: true, ...(q ? { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { username: { contains: q.toLowerCase(), mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }, { occupation: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: { displayName: "asc" },
    take: 100,
  });
  return { members: users.map(memberSummary) };
});

app.get("/family/search", { preHandler: requireMember }, async (request, reply) => {
  const query = z.object({ q: z.string().trim().min(2).max(80) }).safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "Enter at least two characters" });
  const excluded = await familyComponentIds(request.user.userId);
  const q = query.data.q;
  const users = await prisma.user.findMany({
    where: { id: { notIn: excluded }, suspendedAt: null, isDirectoryVisible: true, OR: [{ displayName: { contains: q, mode: "insensitive" } }, { username: { contains: q.toLowerCase(), mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] },
    orderBy: { displayName: "asc" },
    take: 20,
  });
  return { members: users.map(memberSummary) };
});

app.post("/family/members", { preHandler: requireMember }, async (request, reply) => {
  const body = z.object({ relativeName: z.string().trim().min(2).max(100), relation: relationSchema, relationLabel: z.string().trim().max(80).optional() }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Invalid family member" });
  const link = await prisma.familyLink.create({ data: { ownerId: request.user.userId, relativeName: body.data.relativeName, relation: body.data.relation, relationLabel: body.data.relationLabel || "", inviteCode: inviteCode() } });
  return reply.code(201).send({ link });
});

app.post("/family/claim", { preHandler: requireMember }, async (request, reply) => {
  const body = z.object({ code: z.string().trim().min(6).max(16) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Enter a valid family code" });
  const link = await prisma.familyLink.findUnique({ where: { inviteCode: body.data.code.toUpperCase() } });
  if (!link || link.status !== "INVITED" || link.ownerId === request.user.userId) return reply.code(404).send({ error: "Family code is invalid or already used" });
  const updated = await prisma.familyLink.update({ where: { id: link.id }, data: { relativeUserId: request.user.userId, status: "VERIFIED" } });
  return { ok: true, link: updated };
});

app.get("/family/me", { preHandler: requireMember }, async (request) => {
  const [links, incomingAccess, outgoingAccess] = await Promise.all([
    prisma.familyLink.findMany({ where: { OR: [{ ownerId: request.user.userId }, { relativeUserId: request.user.userId }] }, orderBy: { createdAt: "asc" }, include: { owner: true, relativeUser: true } }),
    prisma.familyTreeAccess.findMany({ where: { targetId: request.user.userId }, orderBy: { updatedAt: "desc" }, include: { requester: true } }),
    prisma.familyTreeAccess.findMany({ where: { requesterId: request.user.userId }, orderBy: { updatedAt: "desc" }, include: { target: true } }),
  ]);
  return {
    links: links.map((link) => ({ id: link.id, relativeName: link.relativeName, relation: link.relation, relationLabel: link.relationLabel, inviteCode: link.inviteCode, status: link.status, owner: memberSummary(link.owner), relativeUser: link.relativeUser ? memberSummary(link.relativeUser) : null })),
    incomingAccess: incomingAccess.map((item) => ({ id: item.id, status: item.status, member: memberSummary(item.requester) })),
    outgoingAccess: outgoingAccess.map((item) => ({ id: item.id, status: item.status, member: memberSummary(item.target) })),
  };
});

app.post("/family/access/:targetId", { preHandler: requireMember }, async (request, reply) => {
  const params = z.object({ targetId: z.string().uuid() }).safeParse(request.params);
  if (!params.success || params.data.targetId === request.user.userId) return reply.code(400).send({ error: "Invalid tree request" });
  if ((await familyComponentIds(request.user.userId)).includes(params.data.targetId)) return reply.code(409).send({ error: "This person is already in your connected family" });
  const target = await prisma.user.findUnique({ where: { id: params.data.targetId }, select: { id: true, suspendedAt: true } });
  if (!target || target.suspendedAt) return reply.code(404).send({ error: "Member not found" });
  const access = await prisma.familyTreeAccess.upsert({ where: { requesterId_targetId: { requesterId: request.user.userId, targetId: params.data.targetId } }, create: { requesterId: request.user.userId, targetId: params.data.targetId }, update: { status: "PENDING" } });
  return reply.code(201).send({ access });
});

app.patch("/family/access/:id", { preHandler: requireMember }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ action: z.enum(["APPROVE", "DECLINE", "REVOKE"]) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid access action" });
  const access = await prisma.familyTreeAccess.findUnique({ where: { id: params.data.id } });
  if (!access) return reply.code(404).send({ error: "Request not found" });
  if ((body.data.action === "APPROVE" || body.data.action === "DECLINE") && access.targetId !== request.user.userId) return reply.code(403).send({ error: "Only the tree owner can respond" });
  if (body.data.action === "REVOKE" && access.requesterId !== request.user.userId && access.targetId !== request.user.userId) return reply.code(403).send({ error: "Not allowed" });
  const status = body.data.action === "APPROVE" ? "APPROVED" : body.data.action === "DECLINE" ? "DECLINED" : "REVOKED";
  return prisma.familyTreeAccess.update({ where: { id: access.id }, data: { status } });
});

app.get("/family/tree/:userId", { preHandler: requireMember }, async (request, reply) => {
  const params = z.object({ userId: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid tree" });
  const targetId = params.data.userId;
  if (targetId !== request.user.userId) {
    const access = await prisma.familyTreeAccess.findUnique({ where: { requesterId_targetId: { requesterId: request.user.userId, targetId } } });
    if (access?.status !== "APPROVED") return reply.code(403).send({ error: "This family tree is private. Request access first." });
  }
  const root = await prisma.user.findUnique({ where: { id: targetId } });
  if (!root) return reply.code(404).send({ error: "Member not found" });

  const visited = new Set<string>();
  const queue = [targetId];
  const users = new Map<string, any>();
  const edges: any[] = [];
  const guests: any[] = [];
  while (queue.length && visited.size < 100) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const user = await prisma.user.findUnique({ where: { id: current } });
    if (user) users.set(user.id, memberSummary(user));
    const links = await prisma.familyLink.findMany({ where: { OR: [{ ownerId: current }, { relativeUserId: current }] }, include: { owner: true, relativeUser: true } });
    for (const link of links) {
      const guestId = `guest:${link.id}`;
      if (!edges.some((edge) => edge.id === link.id)) edges.push({ id: link.id, from: link.ownerId, to: link.relativeUserId ?? guestId, relation: link.relation, relationLabel: link.relationLabel, status: link.status });
      users.set(link.owner.id, memberSummary(link.owner));
      if (link.relativeUserId && link.relativeUser) {
        users.set(link.relativeUser.id, memberSummary(link.relativeUser));
        if (!visited.has(link.ownerId)) queue.push(link.ownerId);
        if (!visited.has(link.relativeUserId)) queue.push(link.relativeUserId);
      } else if (!guests.some((guest) => guest.id === guestId)) guests.push({ id: guestId, displayName: link.relativeName, registered: false });
    }
  }
  return { rootId: targetId, nodes: [...users.values()].map((item) => ({ ...item, registered: true })).concat(guests), edges };
});

// ---------- Rishte ----------

app.get("/rishte", { preHandler: requireMember }, async (request, reply) => {
  const query = z.object({ q: z.string().trim().max(80).optional(), gender: z.string().trim().max(32).optional(), city: z.string().trim().max(80).optional() }).safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "Invalid filters" });
  const profiles = await prisma.rishteProfile.findMany({
    where: { isActive: true, user: { id: { not: request.user.userId }, suspendedAt: null, ...(query.data.gender ? { gender: { equals: query.data.gender, mode: "insensitive" } } : {}), ...(query.data.city ? { city: { contains: query.data.city, mode: "insensitive" } } : {}), ...(query.data.q ? { OR: [{ displayName: { contains: query.data.q, mode: "insensitive" } }, { occupation: { contains: query.data.q, mode: "insensitive" } }, { education: { contains: query.data.q, mode: "insensitive" } }] } : {}) } },
    include: { user: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const interests = await prisma.matchInterest.findMany({ where: { OR: [{ senderId: request.user.userId }, { receiverId: request.user.userId }] } });
  return { profiles: profiles.map((profile) => ({ ...memberSummary(profile.user), rishte: { headline: profile.headline, bio: profile.bio, familyNote: profile.familyNote, lookingFor: profile.lookingFor }, relationship: (() => { const item = interests.find((interest) => interest.senderId === profile.userId || interest.receiverId === profile.userId); return item ? { id: item.id, status: item.status, direction: item.senderId === request.user.userId ? "OUTGOING" : "INCOMING" } : { status: "NONE" }; })() })) };
});

app.get("/rishte/me", { preHandler: requireMember }, async (request) => ({ profile: await prisma.rishteProfile.findUnique({ where: { userId: request.user.userId } }) }));

app.put("/rishte/me", { preHandler: requireMember }, async (request, reply) => {
  const body = z.object({ isActive: z.boolean(), headline: z.string().trim().max(180), bio: z.string().trim().max(1500), familyNote: z.string().trim().max(1000), lookingFor: z.string().trim().max(1000) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Invalid Rishte listing" });
  const profile = await prisma.rishteProfile.upsert({ where: { userId: request.user.userId }, create: { userId: request.user.userId, ...body.data }, update: body.data });
  return { profile };
});

app.delete("/rishte/me", { preHandler: requireMember }, async (request) => {
  await prisma.rishteProfile.deleteMany({ where: { userId: request.user.userId } });
  return { ok: true };
});

app.post("/rishte/:userId/interest", { preHandler: requireMember }, async (request, reply) => {
  const params = z.object({ userId: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ message: z.string().trim().max(500).optional() }).safeParse(request.body ?? {});
  if (!params.success || !body.success || params.data.userId === request.user.userId) return reply.code(400).send({ error: "Invalid interest" });
  const target = await prisma.rishteProfile.findUnique({ where: { userId: params.data.userId }, include: { user: true } });
  if (!target?.isActive || target.user.suspendedAt || await blocked(request.user.userId, params.data.userId)) return reply.code(404).send({ error: "Rishte listing unavailable" });
  const reverse = await prisma.matchInterest.findUnique({ where: { senderId_receiverId: { senderId: params.data.userId, receiverId: request.user.userId } } });
  if (reverse?.status === "PENDING") return { matched: true, interest: await prisma.matchInterest.update({ where: { id: reverse.id }, data: { status: "ACCEPTED" } }) };
  const interest = await prisma.matchInterest.upsert({ where: { senderId_receiverId: { senderId: request.user.userId, receiverId: params.data.userId } }, create: { senderId: request.user.userId, receiverId: params.data.userId, message: body.data.message || "" }, update: { status: "PENDING", message: body.data.message || "" } });
  return reply.code(201).send({ interest });
});

app.get("/rishte/interests", { preHandler: requireMember }, async (request) => {
  const [received, sent] = await Promise.all([
    prisma.matchInterest.findMany({ where: { receiverId: request.user.userId, status: { not: "WITHDRAWN" } }, include: { sender: true }, orderBy: { updatedAt: "desc" } }),
    prisma.matchInterest.findMany({ where: { senderId: request.user.userId, status: { not: "WITHDRAWN" } }, include: { receiver: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  return { received: received.map((item) => ({ id: item.id, status: item.status, message: item.message, member: memberSummary(item.sender) })), sent: sent.map((item) => ({ id: item.id, status: item.status, message: item.message, member: memberSummary(item.receiver) })) };
});

app.patch("/rishte/interests/:id", { preHandler: requireMember }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ action: z.enum(["ACCEPT", "DECLINE", "WITHDRAW"]) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid action" });
  const interest = await prisma.matchInterest.findUnique({ where: { id: params.data.id } });
  if (!interest) return reply.code(404).send({ error: "Interest not found" });
  if (body.data.action === "WITHDRAW") {
    if (interest.senderId !== request.user.userId) return reply.code(403).send({ error: "Not allowed" });
    return prisma.matchInterest.update({ where: { id: interest.id }, data: { status: "WITHDRAWN" } });
  }
  if (interest.receiverId !== request.user.userId) return reply.code(403).send({ error: "Not allowed" });
  return prisma.matchInterest.update({ where: { id: interest.id }, data: { status: body.data.action === "ACCEPT" ? "ACCEPTED" : "DECLINED" } });
});

// ---------- Community ----------

app.get("/community/feed", { preHandler: requireMember }, async (request) => {
  const posts = await prisma.post.findMany({
    where: { author: { suspendedAt: null } },
    include: { author: true, likes: { where: { userId: request.user.userId }, select: { userId: true } }, comments: { include: { author: true }, orderBy: { createdAt: "asc" }, take: 50 }, _count: { select: { likes: true, comments: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return { posts: posts.map((post) => ({ id: post.id, body: post.body, createdAt: post.createdAt, author: memberSummary(post.author), likedByMe: post.likes.length > 0, likeCount: post._count.likes, commentCount: post._count.comments, comments: post.comments.map((comment) => ({ id: comment.id, body: comment.body, createdAt: comment.createdAt, author: memberSummary(comment.author) })) })) };
});

app.get("/community/posts", { preHandler: requireMember }, async (request) => {
  const posts = await prisma.post.findMany({ where: { author: { suspendedAt: null } }, include: { author: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return { posts: posts.map((post) => ({ id: post.id, body: post.body, createdAt: post.createdAt, author: memberSummary(post.author) })) };
});

app.post("/community/posts", { preHandler: requireMember }, async (request, reply) => {
  const body = z.object({ body: z.string().trim().min(1).max(2500) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Post must contain 1 to 2500 characters" });
  const post = await prisma.post.create({ data: { authorId: request.user.userId, body: body.data.body }, include: { author: true } });
  return reply.code(201).send({ post: { id: post.id, body: post.body, createdAt: post.createdAt, author: memberSummary(post.author) } });
});

app.delete("/community/posts/:id", { preHandler: requireMember }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid post" });
  const post = await prisma.post.findUnique({ where: { id: params.data.id } });
  if (!post || post.authorId !== request.user.userId) return reply.code(403).send({ error: "Not allowed" });
  await prisma.post.delete({ where: { id: post.id } });
  return { ok: true };
});

app.post("/community/posts/:id/like", { preHandler: requireMember }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid post" });
  const post = await prisma.post.findUnique({ where: { id: params.data.id }, select: { id: true } });
  if (!post) return reply.code(404).send({ error: "Post not found" });
  const where = { postId_userId: { postId: post.id, userId: request.user.userId } };
  const existing = await prisma.postLike.findUnique({ where });
  if (existing) { await prisma.postLike.delete({ where }); return { liked: false }; }
  await prisma.postLike.create({ data: { postId: post.id, userId: request.user.userId } });
  return { liked: true };
});

app.post("/community/posts/:id/comments", { preHandler: requireMember }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ body: z.string().trim().min(1).max(1000) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid comment" });
  const post = await prisma.post.findUnique({ where: { id: params.data.id }, select: { id: true } });
  if (!post) return reply.code(404).send({ error: "Post not found" });
  const comment = await prisma.postComment.create({ data: { postId: post.id, authorId: request.user.userId, body: body.data.body }, include: { author: true } });
  return reply.code(201).send({ comment: { id: comment.id, body: comment.body, createdAt: comment.createdAt, author: memberSummary(comment.author) } });
});

app.delete("/community/comments/:id", { preHandler: requireMember }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid comment" });
  const comment = await prisma.postComment.findUnique({ where: { id: params.data.id } });
  if (!comment || comment.authorId !== request.user.userId) return reply.code(403).send({ error: "Not allowed" });
  await prisma.postComment.delete({ where: { id: comment.id } });
  return { ok: true };
});

// ---------- End-to-end encrypted messaging ----------

app.get("/crypto/me", { preHandler: requireMember }, async (request, reply) => {
  const user = await prisma.user.findUnique({ where: { id: request.user.userId }, select: { e2eePublicKey: true, e2eeEncryptedPrivateKey: true, e2eeKeySalt: true, e2eeKeyIv: true, e2eeKeyVersion: true } });
  if (!user) return reply.code(404).send({ error: "User not found" });
  return { configured: Boolean(user.e2eePublicKey && user.e2eeEncryptedPrivateKey && user.e2eeKeySalt && user.e2eeKeyIv), publicKey: user.e2eePublicKey, encryptedPrivateKey: user.e2eeEncryptedPrivateKey, salt: user.e2eeKeySalt, iv: user.e2eeKeyIv, version: user.e2eeKeyVersion };
});

app.put("/crypto/me", { preHandler: requireMember }, async (request, reply) => {
  const body = z.object({ publicKey: z.string().min(100).max(12000), encryptedPrivateKey: z.string().min(100).max(24000), salt: z.string().min(8).max(128), iv: z.string().min(8).max(128), version: z.number().int().min(1).max(10).default(1) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Invalid encryption key bundle" });
  await prisma.user.update({ where: { id: request.user.userId }, data: { e2eePublicKey: body.data.publicKey, e2eeEncryptedPrivateKey: body.data.encryptedPrivateKey, e2eeKeySalt: body.data.salt, e2eeKeyIv: body.data.iv, e2eeKeyVersion: body.data.version } });
  return { ok: true };
});

app.get("/crypto/users/:id/public-key", { preHandler: requireMember }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid member" });
  const user = await prisma.user.findUnique({ where: { id: params.data.id }, select: { e2eePublicKey: true, suspendedAt: true } });
  if (!user || user.suspendedAt) return reply.code(404).send({ error: "Member unavailable" });
  if (!user.e2eePublicKey) return reply.code(409).send({ error: "This member has not enabled secure messaging yet" });
  return { publicKey: user.e2eePublicKey, version: 1 };
});

app.post("/messages-secure/threads/:userId", { preHandler: requireMember }, async (request, reply) => {
  const params = z.object({ userId: z.string().uuid() }).safeParse(request.params);
  if (!params.success || params.data.userId === request.user.userId) return reply.code(400).send({ error: "Invalid member" });
  const other = await prisma.user.findUnique({ where: { id: params.data.userId }, select: { id: true, suspendedAt: true, e2eePublicKey: true } });
  if (!other || other.suspendedAt || await blocked(request.user.userId, other.id)) return reply.code(404).send({ error: "Member unavailable" });
  const [userOneId, userTwoId] = [request.user.userId, other.id].sort();
  const thread = await prisma.directThread.upsert({ where: { userOneId_userTwoId: { userOneId, userTwoId } }, create: { userOneId, userTwoId }, update: {} });
  return { thread, recipientEncryptionReady: Boolean(other.e2eePublicKey) };
});

app.get("/messages-secure/threads", { preHandler: requireMember }, async (request) => {
  const threads = await prisma.directThread.findMany({ where: { OR: [{ userOneId: request.user.userId }, { userTwoId: request.user.userId }] }, include: { userOne: true, userTwo: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" } });
  return { threads: threads.map((thread) => { const other = thread.userOneId === request.user.userId ? thread.userTwo : thread.userOne; const last = thread.messages[0]; return { id: thread.id, member: memberSummary(other), encryptionReady: Boolean(other.e2eePublicKey), lastMessage: last ? { createdAt: last.createdAt, encrypted: last.encrypted, body: last.encrypted ? null : last.body } : null, updatedAt: thread.updatedAt }; }) };
});

app.get("/messages-secure/threads/:id", { preHandler: requireMember }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid thread" });
  const thread = await prisma.directThread.findUnique({ where: { id: params.data.id }, include: { userOne: true, userTwo: true, messages: { orderBy: { createdAt: "asc" }, take: 300 } } });
  if (!thread || (thread.userOneId !== request.user.userId && thread.userTwoId !== request.user.userId)) return reply.code(404).send({ error: "Thread not found" });
  const other = thread.userOneId === request.user.userId ? thread.userTwo : thread.userOne;
  await prisma.message.updateMany({ where: { threadId: thread.id, senderId: { not: request.user.userId }, readAt: null }, data: { readAt: new Date() } });
  return { id: thread.id, member: memberSummary(other), otherPublicKey: other.e2eePublicKey, encryptionReady: Boolean(other.e2eePublicKey), messages: thread.messages.map((message) => message.encrypted ? { id: message.id, encrypted: true, ciphertext: message.ciphertext, iv: message.iv, wrappedKey: message.senderId === request.user.userId ? message.senderKey : message.recipientKey, encryptionVersion: message.encryptionVersion, createdAt: message.createdAt, senderId: message.senderId } : { id: message.id, encrypted: false, body: message.body, createdAt: message.createdAt, senderId: message.senderId }) };
});

app.post("/messages-secure/threads/:id/messages", { preHandler: requireMember }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ ciphertext: z.string().min(1).max(12000), iv: z.string().min(8).max(128), senderKey: z.string().min(20).max(12000), recipientKey: z.string().min(20).max(12000), encryptionVersion: z.number().int().min(1).max(10).default(1) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid encrypted message" });
  const thread = await prisma.directThread.findUnique({ where: { id: params.data.id }, include: { userOne: true, userTwo: true } });
  if (!thread || (thread.userOneId !== request.user.userId && thread.userTwoId !== request.user.userId)) return reply.code(404).send({ error: "Thread not found" });
  const other = thread.userOneId === request.user.userId ? thread.userTwo : thread.userOne;
  const me = thread.userOneId === request.user.userId ? thread.userOne : thread.userTwo;
  if (!other.e2eePublicKey || !me.e2eePublicKey) return reply.code(409).send({ error: "Both members must enable secure messaging before sending" });
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({ data: { threadId: thread.id, senderId: request.user.userId, body: "", encrypted: true, ciphertext: body.data.ciphertext, iv: body.data.iv, senderKey: body.data.senderKey, recipientKey: body.data.recipientKey, encryptionVersion: body.data.encryptionVersion } });
    await tx.directThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
    return created;
  });
  return reply.code(201).send({ message: { id: message.id, encrypted: true, createdAt: message.createdAt } });
});

// Legacy messaging endpoints remain read-compatible for existing demo data.
app.get("/messages/threads", { preHandler: requireMember }, async (request) => {
  const threads = await prisma.directThread.findMany({ where: { OR: [{ userOneId: request.user.userId }, { userTwoId: request.user.userId }] }, include: { userOne: true, userTwo: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" } });
  return { threads: threads.map((thread) => ({ id: thread.id, member: memberSummary(thread.userOneId === request.user.userId ? thread.userTwo : thread.userOne), lastMessage: thread.messages[0] ?? null, updatedAt: thread.updatedAt })) };
});

// ---------- Safety and administration ----------

app.post("/reports", { preHandler: requireMember }, async (request, reply) => {
  const body = z.object({ reportedUserId: z.string().uuid().optional(), postId: z.string().uuid().optional(), reason: reportReasonSchema, details: z.string().trim().max(1000).optional() }).safeParse(request.body);
  if (!body.success || (!body.data.reportedUserId && !body.data.postId)) return reply.code(400).send({ error: "Invalid report" });
  const report = await prisma.report.create({ data: { reporterId: request.user.userId, reportedUserId: body.data.reportedUserId, postId: body.data.postId, reason: body.data.reason, details: body.data.details || "" } });
  return reply.code(201).send({ report });
});

app.post("/profiles/:id/block", { preHandler: requireMember }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success || params.data.id === request.user.userId) return reply.code(400).send({ error: "Invalid member" });
  await prisma.block.upsert({ where: { blockerId_blockedId: { blockerId: request.user.userId, blockedId: params.data.id } }, create: { blockerId: request.user.userId, blockedId: params.data.id }, update: {} });
  return { ok: true };
});

app.get("/moderation/reports", { preHandler: requireModerator }, async () => ({ reports: await prisma.report.findMany({ orderBy: { createdAt: "desc" }, include: { reporter: true, reportedUser: true, post: true } }) }));

app.get("/admin/overview", { preHandler: requireAdmin }, async () => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [users, recentUsers, activeRishte, familyLinks, verifiedFamilyLinks, pendingTreeRequests, posts, messages, interests, acceptedInterests, reports, openReports] = await Promise.all([
    prisma.user.count(), prisma.user.count({ where: { createdAt: { gte: weekAgo } } }), prisma.rishteProfile.count({ where: { isActive: true } }), prisma.familyLink.count(), prisma.familyLink.count({ where: { status: "VERIFIED" } }), prisma.familyTreeAccess.count({ where: { status: "PENDING" } }), prisma.post.count(), prisma.message.count(), prisma.matchInterest.count(), prisma.matchInterest.count({ where: { status: "ACCEPTED" } }), prisma.report.count(), prisma.report.count({ where: { status: "OPEN" } }),
  ]);
  return { generatedAt: new Date(), metrics: { users, recentUsers, activeRishte, familyLinks, verifiedFamilyLinks, pendingTreeRequests, posts, messages, interests, acceptedInterests, reports, openReports } };
});

app.get("/admin/users", { preHandler: requireAdmin }, async (request, reply) => {
  const query = z.object({ q: z.string().trim().max(100).optional() }).safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "Invalid search" });
  const q = query.data.q;
  const users = await prisma.user.findMany({ where: q ? { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { username: { contains: q.toLowerCase(), mode: "insensitive" } }, { email: { contains: q.toLowerCase(), mode: "insensitive" } }, { phone: { contains: q } }] } : {}, include: { rishteProfile: true, _count: { select: { familyLinksCreated: true, posts: true, messages: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
  return { users: users.map((user) => ({ ...fullMe(user), rishteActive: Boolean(user.rishteProfile?.isActive), familyLinks: user._count.familyLinksCreated, postCount: user._count.posts, messageCount: user._count.messages, aadhaarVerified: Boolean(user.aadhaarVerifiedAt) })) };
});

app.patch("/admin/users/:id", { preHandler: requireAdmin }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ action: z.enum(["SUSPEND", "RESTORE", "MAKE_MODERATOR", "MAKE_MEMBER", "HIDE_DIRECTORY", "SHOW_DIRECTORY"]) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid admin action" });
  const data = body.data.action === "SUSPEND" ? { suspendedAt: new Date() } : body.data.action === "RESTORE" ? { suspendedAt: null } : body.data.action === "MAKE_MODERATOR" ? { role: "MODERATOR" as const } : body.data.action === "MAKE_MEMBER" ? { role: "MEMBER" as const } : body.data.action === "HIDE_DIRECTORY" ? { isDirectoryVisible: false } : { isDirectoryVisible: true };
  try { return { user: await prisma.user.update({ where: { id: params.data.id }, data }) }; } catch { return reply.code(404).send({ error: "User not found" }); }
});

app.get("/admin/reports", { preHandler: requireAdmin }, async () => ({ reports: await prisma.report.findMany({ orderBy: { createdAt: "desc" }, include: { reporter: true, reportedUser: true, post: true, reviewedBy: true }, take: 300 }) }));

app.patch("/admin/reports/:id", { preHandler: requireAdmin }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ action: z.enum(["REVIEW", "DISMISS", "SUSPEND_USER", "RESTORE_USER"]), note: z.string().trim().max(1000).optional() }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid admin action" });
  const report = await prisma.report.findUnique({ where: { id: params.data.id } });
  if (!report) return reply.code(404).send({ error: "Report not found" });
  if (report.reportedUserId && body.data.action === "SUSPEND_USER") await prisma.user.update({ where: { id: report.reportedUserId }, data: { suspendedAt: new Date() } });
  if (report.reportedUserId && body.data.action === "RESTORE_USER") await prisma.user.update({ where: { id: report.reportedUserId }, data: { suspendedAt: null } });
  const status = body.data.action === "DISMISS" ? "DISMISSED" : body.data.action === "REVIEW" ? "REVIEWED" : "ACTIONED";
  return { report: await prisma.report.update({ where: { id: report.id }, data: { status, moderationNote: body.data.note || "" } }) };
});

const close = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({ port: config.port, host: "0.0.0.0" });
