import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { hashIdentityReference } from "./identity.js";
import { scanAadhaarImage } from "./aadhaarOcr.js";
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

type RegistrationTokenPayload = AuthTokenPayload & {
  kind: "registration";
  identityRefHash: string;
  identityName: string;
  identityLast4?: string;
};

const usernameSchema = z.string().trim().toLowerCase().min(3).max(24).regex(/^[a-z0-9_]+$/);
const reportReasonSchema = z.enum(["SPAM", "HARASSMENT", "IMPERSONATION", "ABUSE", "OTHER"]);
const passwordSchema = z.string().min(8).max(72);

function normalizePhone(value?: string) {
  if (!value) return undefined;
  const normalized = value.replace(/[\s()-]/g, "");
  return normalized || undefined;
}

function ageFromDate(date?: Date | null) {
  if (!date) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  const monthDifference = today.getUTCMonth() - date.getUTCMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getUTCDate() < date.getUTCDate())) age -= 1;
  return age;
}

function guessNameFromFile(fileName: string) {
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(aadhaar|aadhar|card|front|back|scan|image|img|photo)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base || /^\d+$/.test(base)) return "";
  return base.replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 80);
}

function publicUser(user: {
  id: string;
  displayName: string;
  username: string;
  bio: string;
  role: string;
  verifiedAt: Date;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}) {
  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    bio: user.bio,
    role: user.role,
    verifiedAt: user.verifiedAt,
    city: user.city ?? null,
    state: user.state ?? null,
    country: user.country ?? "India",
  };
}

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    if (!request.user?.userId) return reply.code(401).send({ error: "Unauthorized" });
    const member = await prisma.user.findUnique({ where: { id: request.user.userId }, select: { suspendedAt: true } });
    if (!member || member.suspendedAt) return reply.code(403).send({ error: "Account unavailable" });
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

async function requireModerator(request: FastifyRequest, reply: FastifyReply) {
  const authResult = await requireAuth(request, reply);
  if (authResult) return authResult;
  const member = await prisma.user.findUnique({ where: { id: request.user.userId }, select: { role: true } });
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
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { blockerId: true },
  });
  return Boolean(block);
}

const postSelect = (viewerId: string) => ({
  id: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, displayName: true, username: true } },
  likes: { where: { userId: viewerId }, select: { userId: true } },
  _count: { select: { likes: true, replies: true } },
} as const);

function shapePost(post: {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; displayName: string; username: string };
  likes: { userId: string }[];
  _count: { likes: number; replies: number };
}) {
  return { ...post, likedByMe: post.likes.length > 0, likes: undefined };
}

app.get("/health", async () => ({ ok: true, service: "abbasiconnect-api" }));

app.post("/auth/dev-aadhaar/scan", async (request, reply) => {
  const body = z.object({
    fileName: z.string().min(1).max(255),
    imageDataUrl: z.string().startsWith("data:image/").max(8_000_000),
  }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Upload a valid test image under 6 MB" });
  try {
    const scan = await scanAadhaarImage(body.data.imageDataUrl);
    return {
      mode: "development-ocr",
      extracted: { displayName: scan.displayName || guessNameFromFile(body.data.fileName), confidence: scan.confidence },
      note: "The image is OCR-read in memory and is not written to the AbbasiConnect database.",
    };
  } catch (error) {
    request.log.error(error);
    return reply.code(422).send({ error: "OCR could not read this image. Try a clearer front-facing image." });
  }
});

app.post("/auth/dev-aadhaar/verify", async (request, reply) => {
  const body = z.object({
    identityName: z.string().trim().min(2).max(100),
    reference: z.string().trim().min(4).max(100),
    last4: z.string().regex(/^\d{4}$/).optional(),
  }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Invalid identity verification payload" });

  const identityRefHash = hashIdentityReference(body.data.reference);
  const existing = await prisma.user.findUnique({ where: { identityRefHash }, select: { id: true } });
  if (existing) return reply.code(409).send({ error: "This Aadhaar-linked identity already has an account. Sign in instead." });

  const registrationToken = app.jwt.sign({
    userId: "__registration__",
    kind: "registration",
    identityRefHash,
    identityName: body.data.identityName,
    identityLast4: body.data.last4,
  } satisfies RegistrationTokenPayload, { expiresIn: "15m" });

  return { verified: true, registrationToken, identityName: body.data.identityName, expiresInMinutes: 15 };
});

app.post("/auth/register", async (request, reply) => {
  const body = z.object({
    registrationToken: z.string().min(20),
    displayName: z.string().trim().min(2).max(80),
    username: usernameSchema,
    password: passwordSchema,
    email: z.string().trim().max(254).optional(),
    phone: z.string().trim().max(30).optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    gender: z.string().trim().max(32).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    country: z.string().trim().min(2).max(80).default("India"),
    bio: z.string().trim().max(280).optional(),
  }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Check the registration details and try again" });

  let registration: RegistrationTokenPayload;
  try {
    registration = app.jwt.verify<RegistrationTokenPayload>(body.data.registrationToken);
  } catch {
    return reply.code(401).send({ error: "Aadhaar verification has expired. Verify again." });
  }
  if (registration.kind !== "registration" || !registration.identityRefHash) return reply.code(401).send({ error: "Invalid registration proof" });

  const email = body.data.email?.toLowerCase() || undefined;
  const phone = normalizePhone(body.data.phone);
  if (!email && !phone) return reply.code(400).send({ error: "Enter at least an email address or contact number" });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.code(400).send({ error: "Enter a valid email address" });
  if (phone && !/^\+?[1-9]\d{7,14}$/.test(phone)) return reply.code(400).send({ error: "Enter a valid contact number with country code" });

  const dateOfBirth = new Date(`${body.data.dateOfBirth}T00:00:00.000Z`);
  const today = new Date();
  if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth > today || dateOfBirth.getUTCFullYear() < 1900) return reply.code(400).send({ error: "Enter a valid date of birth" });

  const conflicts = await prisma.user.findFirst({
    where: {
      OR: [
        { identityRefHash: registration.identityRefHash },
        { username: body.data.username },
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
      ],
    },
    select: { identityRefHash: true, username: true, email: true, phone: true },
  });
  if (conflicts) {
    if (conflicts.identityRefHash === registration.identityRefHash) return reply.code(409).send({ error: "This Aadhaar-linked identity already has an account" });
    if (conflicts.username === body.data.username) return reply.code(409).send({ error: "That username is already taken" });
    if (email && conflicts.email === email) return reply.code(409).send({ error: "That email address is already registered" });
    if (phone && conflicts.phone === phone) return reply.code(409).send({ error: "That contact number is already registered" });
  }

  const passwordHash = await bcrypt.hash(body.data.password, 12);
  try {
    const user = await prisma.user.create({
      data: {
        identityRefHash: registration.identityRefHash,
        identityLast4: registration.identityLast4,
        identityName: registration.identityName,
        displayName: body.data.displayName,
        username: body.data.username,
        passwordHash,
        email,
        phone,
        dateOfBirth,
        gender: body.data.gender || null,
        city: body.data.city || null,
        state: body.data.state || null,
        country: body.data.country,
        bio: body.data.bio || "",
      },
    });
    const token = app.jwt.sign({ userId: user.id }, { expiresIn: "30d" });
    return reply.code(201).send({ token, user: publicUser(user) });
  } catch (error) {
    request.log.error(error);
    return reply.code(409).send({ error: "Account details conflict with an existing account" });
  }
});

app.post("/auth/sign-in", async (request, reply) => {
  const body = z.object({ username: usernameSchema, password: z.string().min(1).max(72) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Enter your username and password" });
  const user = await prisma.user.findUnique({ where: { username: body.data.username } });
  if (!user || !user.passwordHash) return reply.code(401).send({ error: "Incorrect username or password" });
  if (user.suspendedAt) return reply.code(403).send({ error: "Account unavailable" });
  const valid = await bcrypt.compare(body.data.password, user.passwordHash);
  if (!valid) return reply.code(401).send({ error: "Incorrect username or password" });
  const token = app.jwt.sign({ userId: user.id }, { expiresIn: "30d" });
  return { token, user: publicUser(user) };
});

app.get("/auth/me", { preHandler: requireAuth }, async (request, reply) => {
  const user = await prisma.user.findUnique({
    where: { id: request.user.userId },
    select: {
      id: true, displayName: true, username: true, email: true, phone: true, dateOfBirth: true,
      gender: true, city: true, state: true, country: true, bio: true, role: true, verifiedAt: true,
      createdAt: true, _count: { select: { followers: true, following: true, posts: true } },
    },
  });
  if (!user) return reply.code(404).send({ error: "User not found" });
  return { ...user, dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? null, age: ageFromDate(user.dateOfBirth) };
});

app.patch("/users/me", { preHandler: requireAuth }, async (request, reply) => {
  const body = z.object({
    displayName: z.string().trim().min(2).max(80), username: usernameSchema, bio: z.string().trim().max(280),
    email: z.string().trim().max(254).optional(), phone: z.string().trim().max(30).optional(),
    gender: z.string().trim().max(32).optional(), city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(), country: z.string().trim().min(2).max(80).optional(),
  }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Invalid profile details" });

  const email = body.data.email?.toLowerCase() || undefined;
  const phone = normalizePhone(body.data.phone);
  if (!email && !phone) return reply.code(400).send({ error: "Keep at least an email address or contact number on the account" });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.code(400).send({ error: "Enter a valid email address" });
  if (phone && !/^\+?[1-9]\d{7,14}$/.test(phone)) return reply.code(400).send({ error: "Enter a valid contact number" });

  const taken = await prisma.user.findFirst({
    where: { NOT: { id: request.user.userId }, OR: [{ username: body.data.username }, ...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
    select: { username: true, email: true, phone: true },
  });
  if (taken?.username === body.data.username) return reply.code(409).send({ error: "That username is already taken" });
  if (email && taken?.email === email) return reply.code(409).send({ error: "That email is already registered" });
  if (phone && taken?.phone === phone) return reply.code(409).send({ error: "That contact number is already registered" });

  return prisma.user.update({
    where: { id: request.user.userId },
    data: {
      displayName: body.data.displayName, username: body.data.username, bio: body.data.bio,
      email: email ?? null, phone: phone ?? null, gender: body.data.gender || null,
      city: body.data.city || null, state: body.data.state || null, country: body.data.country || "India",
    },
    select: {
      id: true, displayName: true, username: true, email: true, phone: true, gender: true,
      city: true, state: true, country: true, bio: true, role: true, verifiedAt: true, dateOfBirth: true,
    },
  });
});

app.get("/users/search", { preHandler: requireAuth }, async (request, reply) => {
  const query = z.object({ q: z.string().trim().min(1).max(80) }).safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "Enter a search term" });
  const blocked = await blockedIdsFor(request.user.userId);
  const users = await prisma.user.findMany({
    where: {
      id: { notIn: [request.user.userId, ...blocked] }, suspendedAt: null,
      OR: [{ displayName: { contains: query.data.q, mode: "insensitive" } }, { username: { contains: query.data.q.toLowerCase(), mode: "insensitive" } }],
    },
    take: 30, orderBy: { displayName: "asc" },
    select: {
      id: true, displayName: true, username: true, bio: true, city: true, state: true, country: true, verifiedAt: true,
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
      id: true, displayName: true, username: true, bio: true, city: true, state: true, country: true,
      verifiedAt: true, suspendedAt: true,
      followers: { where: { followerId: request.user.userId }, select: { followerId: true } },
      posts: { where: { parentId: null, hiddenAt: null }, orderBy: { createdAt: "desc" }, take: 50, select: postSelect(request.user.userId) },
      _count: { select: { followers: true, following: true } },
    },
  });
  if (!user || user.suspendedAt) return reply.code(404).send({ error: "User not found" });
  if (user.id !== request.user.userId && await areBlocked(user.id, request.user.userId)) return reply.code(404).send({ error: "User not found" });
  return { ...user, suspendedAt: undefined, isFollowing: user.followers.length > 0, followers: undefined, posts: user.posts.map(shapePost) };
});

app.post("/users/:id/follow", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid user id" });
  if (params.data.id === request.user.userId) return reply.code(400).send({ error: "You cannot follow yourself" });
  if (await areBlocked(params.data.id, request.user.userId)) return reply.code(404).send({ error: "User not found" });
  const target = await prisma.user.findUnique({ where: { id: params.data.id }, select: { suspendedAt: true } });
  if (!target || target.suspendedAt) return reply.code(404).send({ error: "User not found" });
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: request.user.userId, followingId: params.data.id } },
    create: { followerId: request.user.userId, followingId: params.data.id }, update: {},
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
  if (!params.success) return reply.code(400).send({ error: "Invalid user id" });
  if (params.data.id === request.user.userId) return reply.code(400).send({ error: "You cannot block yourself" });
  await prisma.$transaction([
    prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: request.user.userId, blockedId: params.data.id } },
      create: { blockerId: request.user.userId, blockedId: params.data.id }, update: {},
    }),
    prisma.follow.deleteMany({ where: { OR: [{ followerId: request.user.userId, followingId: params.data.id }, { followerId: params.data.id, followingId: request.user.userId }] } }),
  ]);
  return { ok: true };
});

app.delete("/users/:id/block", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid user id" });
  await prisma.block.deleteMany({ where: { blockerId: request.user.userId, blockedId: params.data.id } });
  return { ok: true };
});

app.get("/feed", { preHandler: requireAuth }, async (request) => {
  const blocked = await blockedIdsFor(request.user.userId);
  const posts = await prisma.post.findMany({
    where: { parentId: null, hiddenAt: null, authorId: { notIn: blocked }, author: { suspendedAt: null } },
    orderBy: { createdAt: "desc" }, take: 100, select: postSelect(request.user.userId),
  });
  return { posts: posts.map(shapePost) };
});

app.post("/posts", { preHandler: requireAuth }, async (request, reply) => {
  const body = z.object({ body: z.string().trim().min(1).max(1000) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Post must be between 1 and 1000 characters" });
  const post = await prisma.post.create({ data: { body: body.data.body, authorId: request.user.userId }, select: postSelect(request.user.userId) });
  return reply.code(201).send(shapePost(post));
});

app.get("/posts/:id/replies", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid post id" });
  const blocked = await blockedIdsFor(request.user.userId);
  const replies = await prisma.post.findMany({
    where: { parentId: params.data.id, hiddenAt: null, authorId: { notIn: blocked }, author: { suspendedAt: null } },
    orderBy: { createdAt: "asc" }, select: postSelect(request.user.userId),
  });
  return { replies: replies.map(shapePost) };
});

app.post("/posts/:id/replies", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ body: z.string().trim().min(1).max(1000) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid reply" });
  const parent = await prisma.post.findUnique({ where: { id: params.data.id }, select: { authorId: true, hiddenAt: true } });
  if (!parent || parent.hiddenAt) return reply.code(404).send({ error: "Post not found" });
  if (await areBlocked(parent.authorId, request.user.userId)) return reply.code(404).send({ error: "Post not found" });
  const post = await prisma.post.create({ data: { body: body.data.body, authorId: request.user.userId, parentId: params.data.id }, select: postSelect(request.user.userId) });
  return reply.code(201).send(shapePost(post));
});

app.post("/posts/:id/like", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid post id" });
  const post = await prisma.post.findUnique({ where: { id: params.data.id }, select: { authorId: true, hiddenAt: true } });
  if (!post || post.hiddenAt || await areBlocked(post.authorId, request.user.userId)) return reply.code(404).send({ error: "Post not found" });
  await prisma.like.upsert({ where: { userId_postId: { userId: request.user.userId, postId: params.data.id } }, create: { userId: request.user.userId, postId: params.data.id }, update: {} });
  return { ok: true };
});

app.delete("/posts/:id/like", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid post id" });
  await prisma.like.deleteMany({ where: { userId: request.user.userId, postId: params.data.id } });
  return { ok: true };
});

app.post("/reports", { preHandler: requireAuth }, async (request, reply) => {
  const body = z.object({
    reportedUserId: z.string().uuid().optional(), postId: z.string().uuid().optional(), reason: reportReasonSchema,
    details: z.string().trim().max(1000).default(""),
  }).refine((value) => Boolean(value.reportedUserId || value.postId), { message: "Report a member or post" }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Invalid report" });
  let reportedUserId = body.data.reportedUserId;
  if (body.data.postId && !reportedUserId) {
    const post = await prisma.post.findUnique({ where: { id: body.data.postId }, select: { authorId: true } });
    if (!post) return reply.code(404).send({ error: "Post not found" });
    reportedUserId = post.authorId;
  }
  const report = await prisma.report.create({
    data: { reporterId: request.user.userId, reportedUserId, postId: body.data.postId, reason: body.data.reason, details: body.data.details },
    select: { id: true, status: true, createdAt: true },
  });
  return reply.code(201).send(report);
});

app.get("/moderation/reports", { preHandler: requireModerator }, async () => {
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" }, take: 100,
    include: {
      reporter: { select: { id: true, displayName: true, username: true } },
      reportedUser: { select: { id: true, displayName: true, username: true, suspendedAt: true } },
      post: { select: { id: true, body: true, hiddenAt: true } },
      reviewedBy: { select: { id: true, displayName: true, username: true } },
    },
  });
  return { reports };
});

app.patch("/moderation/reports/:id", { preHandler: requireModerator }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ action: z.enum(["REVIEW", "DISMISS", "HIDE_POST", "RESTORE_POST", "SUSPEND_USER", "RESTORE_USER"]), note: z.string().trim().max(1000).optional() }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid moderation action" });
  const report = await prisma.report.findUnique({ where: { id: params.data.id } });
  if (!report) return reply.code(404).send({ error: "Report not found" });

  if (body.data.action === "HIDE_POST" || body.data.action === "RESTORE_POST") {
    if (!report.postId) return reply.code(400).send({ error: "This report has no post" });
    await prisma.post.update({ where: { id: report.postId }, data: { hiddenAt: body.data.action === "HIDE_POST" ? new Date() : null } });
  }
  if (body.data.action === "SUSPEND_USER" || body.data.action === "RESTORE_USER") {
    if (!report.reportedUserId) return reply.code(400).send({ error: "This report has no member" });
    await prisma.user.update({ where: { id: report.reportedUserId }, data: { suspendedAt: body.data.action === "SUSPEND_USER" ? new Date() : null } });
  }

  const status = body.data.action === "DISMISS" ? "DISMISSED" : body.data.action === "REVIEW" ? "REVIEWED" : "ACTIONED";
  return prisma.report.update({
    where: { id: params.data.id },
    data: { status, reviewedById: request.user.userId, moderationNote: body.data.note || report.moderationNote },
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
