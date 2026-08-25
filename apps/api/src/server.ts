import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
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

const usernameSchema = z.string().trim().toLowerCase().min(3).max(24).regex(/^[a-z0-9_]+$/);
const reportReasonSchema = z.enum(["SPAM", "HARASSMENT", "IMPERSONATION", "ABUSE", "OTHER"]);

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    const member = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { suspendedAt: true },
    });
    if (!member || member.suspendedAt) return reply.code(403).send({ error: "Account unavailable" });
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

async function requireModerator(request: FastifyRequest, reply: FastifyReply) {
  const authResult = await requireAuth(request, reply);
  if (authResult) return authResult;
  const member = await prisma.user.findUnique({
    where: { id: request.user.userId },
    select: { role: true },
  });
  if (!member || member.role === "MEMBER") return reply.code(403).send({ error: "Moderator access required" });
}

async function blockedIdsFor(userId: string) {
  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(blocks.map((block) => block.blockerId === userId ? block.blockedId : block.blockerId))];
}

async function areBlocked(a: string, b: string) {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { blockerId: true },
  });
  return Boolean(block);
}

function guessNameFromFile(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\b(aadhaar|aadhar|card|front|back|scan|image|img|photo)\b/gi, " ").replace(/\s+/g, " ").trim();
  if (!base || /^\d+$/.test(base)) return "";
  return base.replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 80);
}

function publicUser(user: { id: string; displayName: string; username: string; bio: string; role: string; verifiedAt: Date }) {
  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    bio: user.bio,
    role: user.role,
    verifiedAt: user.verifiedAt,
  };
}

app.get("/health", async () => ({ ok: true, service: "abbasiconnect-api" }));

app.post("/auth/dev-aadhaar/scan", async (request, reply) => {
  const body = z.object({
    fileName: z.string().min(1).max(255),
    imageDataUrl: z.string().startsWith("data:image/").max(8_000_000),
  }).safeParse(request.body);

  if (!body.success) return reply.code(400).send({ error: "Upload a valid test image under 6 MB" });

  return {
    mode: "development-simulator",
    extracted: {
      displayName: guessNameFromFile(body.data.fileName),
    },
    note: "The development scanner does not persist the uploaded image. Replace this adapter with verified OCR/QR and Aadhaar verification in production.",
  };
});

app.post("/auth/dev-aadhaar", async (request, reply) => {
  const body = z.object({
    displayName: z.string().trim().min(2).max(80),
    username: usernameSchema.optional(),
    reference: z.string().trim().min(4).max(100),
    last4: z.string().regex(/^\d{4}$/).optional(),
  }).safeParse(request.body);

  if (!body.success) return reply.code(400).send({ error: "Invalid verification payload" });

  const identityRefHash = hashIdentityReference(body.data.reference);
  let user = await prisma.user.findUnique({ where: { identityRefHash } });

  if (!user) {
    if (!body.data.username) return reply.code(400).send({ error: "Choose a username to create your account" });
    const taken = await prisma.user.findUnique({ where: { username: body.data.username }, select: { id: true } });
    if (taken) return reply.code(409).send({ error: "That username is already taken" });

    user = await prisma.user.create({
      data: {
        identityRefHash,
        identityLast4: body.data.last4,
        displayName: body.data.displayName,
        username: body.data.username,
      },
    });
  }

  if (user.suspendedAt) return reply.code(403).send({ error: "Account unavailable" });

  const token = app.jwt.sign({ userId: user.id }, { expiresIn: "30d" });
  return { token, user: publicUser(user) };
});

app.get("/auth/me", { preHandler: requireAuth }, async (request, reply) => {
  const user = await prisma.user.findUnique({
    where: { id: request.user.userId },
    select: {
      id: true,
      displayName: true,
      username: true,
      bio: true,
      role: true,
      verifiedAt: true,
      createdAt: true,
      _count: { select: { followers: true, following: true, posts: true } },
    },
  });
  if (!user) return reply.code(404).send({ error: "User not found" });
  return user;
});

app.patch("/users/me", { preHandler: requireAuth }, async (request, reply) => {
  const body = z.object({
    displayName: z.string().trim().min(2).max(80),
    username: usernameSchema,
    bio: z.string().trim().max(280),
  }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Invalid profile details" });

  const taken = await prisma.user.findFirst({
    where: { username: body.data.username, NOT: { id: request.user.userId } },
    select: { id: true },
  });
  if (taken) return reply.code(409).send({ error: "That username is already taken" });

  return prisma.user.update({
    where: { id: request.user.userId },
    data: body.data,
    select: { id: true, displayName: true, username: true, bio: true, role: true, verifiedAt: true },
  });
});

app.get("/users/search", { preHandler: requireAuth }, async (request, reply) => {
  const query = z.object({ q: z.string().trim().min(1).max(80) }).safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "Enter a search term" });

  const blocked = await blockedIdsFor(request.user.userId);
  const users = await prisma.user.findMany({
    where: {
      id: { notIn: [request.user.userId, ...blocked] },
      suspendedAt: null,
      OR: [
        { displayName: { contains: query.data.q, mode: "insensitive" } },
        { username: { contains: query.data.q.toLowerCase(), mode: "insensitive" } },
      ],
    },
    take: 30,
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      displayName: true,
      username: true,
      bio: true,
      verifiedAt: true,
      followers: { where: { followerId: request.user.userId }, select: { followerId: true } },
      _count: { select: { followers: true, following: true } },
    },
  });

  return { users: users.map((user) => ({ ...user, isFollowing: user.followers.length > 0, followers: undefined })) };
});

app.get("/users/:username", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ username: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid username" });

  const user = await prisma.user.findUnique({
    where: { username: params.data.username.toLowerCase() },
    select: {
      id: true,
      displayName: true,
      username: true,
      bio: true,
      verifiedAt: true,
      suspendedAt: true,
      followers: { where: { followerId: request.user.userId }, select: { followerId: true } },
      posts: {
        where: { parentId: null, hiddenAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, displayName: true, username: true } },
          likes: { where: { userId: request.user.userId }, select: { userId: true } },
          _count: { select: { likes: true, replies: true } },
        },
      },
      _count: { select: { followers: true, following: true } },
    },
  });

  if (!user || user.suspendedAt) return reply.code(404).send({ error: "User not found" });
  if (user.id !== request.user.userId && await areBlocked(user.id, request.user.userId)) return reply.code(404).send({ error: "User not found" });

  return {
    ...user,
    suspendedAt: undefined,
    isFollowing: user.followers.length > 0,
    followers: undefined,
    posts: user.posts.map((post) => ({ ...post, likedByMe: post.likes.length > 0, likes: undefined })),
  };
});

app.get("/feed", { preHandler: requireAuth }, async (request) => {
  const blocked = await blockedIdsFor(request.user.userId);
  const posts = await prisma.post.findMany({
    where: {
      parentId: null,
      hiddenAt: null,
      authorId: { notIn: blocked },
      author: { suspendedAt: null },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, displayName: true, username: true } },
      likes: { where: { userId: request.user.userId }, select: { userId: true } },
      _count: { select: { likes: true, replies: true } },
    },
  });
  return { posts: posts.map((post) => ({ ...post, likedByMe: post.likes.length > 0, likes: undefined })) };
});

app.post("/posts", { preHandler: requireAuth }, async (request, reply) => {
  const body = z.object({ body: z.string().trim().min(1).max(1000) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Post must be between 1 and 1000 characters" });

  const post = await prisma.post.create({
    data: { body: body.data.body, authorId: request.user.userId },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, displayName: true, username: true } },
      _count: { select: { likes: true, replies: true } },
    },
  });
  return reply.code(201).send({ ...post, likedByMe: false });
});

app.get("/posts/:id/replies", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid post id" });
  const blocked = await blockedIdsFor(request.user.userId);

  const replies = await prisma.post.findMany({
    where: { parentId: params.data.id, hiddenAt: null, authorId: { notIn: blocked }, author: { suspendedAt: null } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, displayName: true, username: true } },
      likes: { where: { userId: request.user.userId }, select: { userId: true } },
      _count: { select: { likes: true, replies: true } },
    },
  });
  return { replies: replies.map((post) => ({ ...post, likedByMe: post.likes.length > 0, likes: undefined })) };
});

app.post("/posts/:id/replies", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ body: z.string().trim().min(1).max(1000) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid reply" });

  const parent = await prisma.post.findUnique({ where: { id: params.data.id }, select: { authorId: true, hiddenAt: true } });
  if (!parent || parent.hiddenAt) return reply.code(404).send({ error: "Post not found" });
  if (await areBlocked(parent.authorId, request.user.userId)) return reply.code(404).send({ error: "Post not found" });

  const post = await prisma.post.create({
    data: { body: body.data.body, authorId: request.user.userId, parentId: params.data.id },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, displayName: true, username: true } },
      _count: { select: { likes: true, replies: true } },
    },
  });
  return reply.code(201).send({ ...post, likedByMe: false });
});

app.post("/posts/:id/like", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid post id" });
  const post = await prisma.post.findUnique({ where: { id: params.data.id }, select: { authorId: true, hiddenAt: true } });
  if (!post || post.hiddenAt || await areBlocked(post.authorId, request.user.userId)) return reply.code(404).send({ error: "Post not found" });
  await prisma.like.upsert({
    where: { userId_postId: { userId: request.user.userId, postId: params.data.id } },
    create: { userId: request.user.userId, postId: params.data.id },
    update: {},
  });
  return { ok: true };
});

app.delete("/posts/:id/like", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid post id" });
  await prisma.like.deleteMany({ where: { userId: request.user.userId, postId: params.data.id } });
  return { ok: true };
});

app.post("/users/:id/follow", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success || params.data.id === request.user.userId) return reply.code(400).send({ error: "Invalid user" });
  const target = await prisma.user.findUnique({ where: { id: params.data.id }, select: { id: true, suspendedAt: true } });
  if (!target || target.suspendedAt || await areBlocked(params.data.id, request.user.userId)) return reply.code(404).send({ error: "User not found" });

  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: request.user.userId, followingId: params.data.id } },
    create: { followerId: request.user.userId, followingId: params.data.id },
    update: {},
  });
  return { ok: true };
});

app.delete("/users/:id/follow", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid user id" });
  await prisma.follow.deleteMany({ where: { followerId: request.user.userId, followingId: params.data.id } });
  return { ok: true };
});

app.post("/users/:id/block", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success || params.data.id === request.user.userId) return reply.code(400).send({ error: "Invalid user" });
  const target = await prisma.user.findUnique({ where: { id: params.data.id }, select: { id: true } });
  if (!target) return reply.code(404).send({ error: "User not found" });

  await prisma.$transaction([
    prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: request.user.userId, blockedId: params.data.id } },
      create: { blockerId: request.user.userId, blockedId: params.data.id },
      update: {},
    }),
    prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: request.user.userId, followingId: params.data.id },
          { followerId: params.data.id, followingId: request.user.userId },
        ],
      },
    }),
  ]);
  return { ok: true };
});

app.delete("/users/:id/block", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid user id" });
  await prisma.block.deleteMany({ where: { blockerId: request.user.userId, blockedId: params.data.id } });
  return { ok: true };
});

app.post("/reports", { preHandler: requireAuth }, async (request, reply) => {
  const body = z.object({
    postId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    reason: reportReasonSchema,
    details: z.string().trim().max(1000).default(""),
  }).refine((value) => Boolean(value.postId || value.userId), "Report target required").safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Invalid report" });

  if (body.data.postId) {
    const post = await prisma.post.findUnique({ where: { id: body.data.postId }, select: { id: true, authorId: true } });
    if (!post) return reply.code(404).send({ error: "Post not found" });
    body.data.userId ??= post.authorId;
  }

  const report = await prisma.report.create({
    data: {
      reporterId: request.user.userId,
      reportedUserId: body.data.userId,
      postId: body.data.postId,
      reason: body.data.reason,
      details: body.data.details,
    },
    select: { id: true, status: true, createdAt: true },
  });
  return reply.code(201).send(report);
});

app.get("/moderation/reports", { preHandler: requireModerator }, async () => {
  const reports = await prisma.report.findMany({
    where: { status: { in: ["OPEN", "REVIEWED"] } },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      reason: true,
      details: true,
      status: true,
      createdAt: true,
      reporter: { select: { id: true, displayName: true, username: true } },
      reportedUser: { select: { id: true, displayName: true, username: true, suspendedAt: true } },
      post: { select: { id: true, body: true, hiddenAt: true, authorId: true } },
    },
  });
  return { reports };
});

app.patch("/moderation/reports/:id", { preHandler: requireModerator }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({
    action: z.enum(["dismiss", "review", "hide_post", "restore_post", "suspend_user", "restore_user"]),
    note: z.string().trim().max(1000).default(""),
  }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid moderation request" });

  const report = await prisma.report.findUnique({
    where: { id: params.data.id },
    select: { id: true, postId: true, reportedUserId: true },
  });
  if (!report) return reply.code(404).send({ error: "Report not found" });

  const now = new Date();
  if (body.data.action === "hide_post" && report.postId) await prisma.post.update({ where: { id: report.postId }, data: { hiddenAt: now } });
  if (body.data.action === "restore_post" && report.postId) await prisma.post.update({ where: { id: report.postId }, data: { hiddenAt: null } });
  if (body.data.action === "suspend_user" && report.reportedUserId) await prisma.user.update({ where: { id: report.reportedUserId }, data: { suspendedAt: now } });
  if (body.data.action === "restore_user" && report.reportedUserId) await prisma.user.update({ where: { id: report.reportedUserId }, data: { suspendedAt: null } });

  const status = body.data.action === "dismiss" ? "DISMISSED" : body.data.action === "review" ? "REVIEWED" : "ACTIONED";
  return prisma.report.update({
    where: { id: params.data.id },
    data: {
      status,
      reviewedById: request.user.userId,
      moderationNote: body.data.note,
    },
    select: { id: true, status: true, moderationNote: true, updatedAt: true },
  });
});

const close = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({ port: config.port, host: "0.0.0.0" });
