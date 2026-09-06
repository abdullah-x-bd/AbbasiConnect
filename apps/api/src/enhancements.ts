import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { prisma } from "./db.js";

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

function normalizeContact(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return trimmed.replace(/[\s()-]/g, "");
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

async function familyComponentIds(startId: string) {
  const visited = new Set<string>();
  const queue = [startId];
  while (queue.length && visited.size < 150) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const links = await prisma.familyLink.findMany({
      where: {
        status: "VERIFIED",
        OR: [{ ownerId: current }, { relativeUserId: current }],
      },
      select: { ownerId: true, relativeUserId: true },
    });
    for (const link of links) {
      if (!visited.has(link.ownerId)) queue.push(link.ownerId);
      if (link.relativeUserId && !visited.has(link.relativeUserId)) queue.push(link.relativeUserId);
    }
  }
  return [...visited];
}

export async function registerEnhancements(app: FastifyInstance) {
  // Temporary development OTP endpoint used until a real delivery provider is configured.
  // It deliberately returns the code so the public demo registration flow can be tested.
  app.post("/auth/request-otp-dev", async (request, reply) => {
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
    return { challengeId: challenge.id, developmentCode: code, expiresInMinutes: 10 };
  });

  // Search only when the user asks, and never return anyone already in the same verified family component.
  app.get("/family/search", { preHandler: requireMember }, async (request, reply) => {
    const query = z.object({ q: z.string().trim().min(2).max(80) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "Enter at least two characters" });
    const excluded = await familyComponentIds(request.user.userId);
    const q = query.data.q;
    const users = await prisma.user.findMany({
      where: {
        id: { notIn: excluded },
        suspendedAt: null,
        isDirectoryVisible: true,
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          { username: { contains: q.toLowerCase(), mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { displayName: "asc" },
      take: 20,
    });
    return { members: users.map(memberSummary) };
  });

  app.delete("/rishte/me", { preHandler: requireMember }, async (request) => {
    await prisma.rishteProfile.deleteMany({ where: { userId: request.user.userId } });
    return { ok: true };
  });

  // Community feed with likes and comments.
  app.get("/community/feed", { preHandler: requireMember }, async (request) => {
    const posts = await prisma.post.findMany({
      where: { author: { suspendedAt: null } },
      include: {
        author: true,
        likes: { where: { userId: request.user.userId }, select: { userId: true } },
        comments: { include: { author: true }, orderBy: { createdAt: "asc" }, take: 50 },
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return {
      posts: posts.map((post) => ({
        id: post.id,
        body: post.body,
        createdAt: post.createdAt,
        author: memberSummary(post.author),
        likedByMe: post.likes.length > 0,
        likeCount: post._count.likes,
        commentCount: post._count.comments,
        comments: post.comments.map((comment) => ({
          id: comment.id,
          body: comment.body,
          createdAt: comment.createdAt,
          author: memberSummary(comment.author),
        })),
      })),
    };
  });

  app.post("/community/posts/:id/like", { preHandler: requireMember }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid post" });
    const post = await prisma.post.findUnique({ where: { id: params.data.id }, select: { id: true } });
    if (!post) return reply.code(404).send({ error: "Post not found" });
    const key = { postId_userId: { postId: post.id, userId: request.user.userId } };
    const existing = await prisma.postLike.findUnique({ where: key });
    if (existing) {
      await prisma.postLike.delete({ where: key });
      return { liked: false };
    }
    await prisma.postLike.create({ data: { postId: post.id, userId: request.user.userId } });
    return { liked: true };
  });

  app.post("/community/posts/:id/comments", { preHandler: requireMember }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ body: z.string().trim().min(1).max(1000) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Comment must contain 1 to 1000 characters" });
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

  // E2EE identity. The public key and password-wrapped private-key backup may be stored on the server.
  // The plaintext private key is generated and used only in the browser.
  app.get("/crypto/me", { preHandler: requireMember }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { e2eePublicKey: true, e2eeEncryptedPrivateKey: true, e2eeKeySalt: true, e2eeKeyIv: true, e2eeKeyVersion: true },
    });
    if (!user) return reply.code(404).send({ error: "User not found" });
    return {
      configured: Boolean(user.e2eePublicKey && user.e2eeEncryptedPrivateKey && user.e2eeKeySalt && user.e2eeKeyIv),
      publicKey: user.e2eePublicKey,
      encryptedPrivateKey: user.e2eeEncryptedPrivateKey,
      salt: user.e2eeKeySalt,
      iv: user.e2eeKeyIv,
      version: user.e2eeKeyVersion,
    };
  });

  app.put("/crypto/me", { preHandler: requireMember }, async (request, reply) => {
    const body = z.object({
      publicKey: z.string().min(100).max(12000),
      encryptedPrivateKey: z.string().min(100).max(24000),
      salt: z.string().min(8).max(128),
      iv: z.string().min(8).max(128),
      version: z.number().int().min(1).max(10).default(1),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid encryption key bundle" });
    await prisma.user.update({
      where: { id: request.user.userId },
      data: {
        e2eePublicKey: body.data.publicKey,
        e2eeEncryptedPrivateKey: body.data.encryptedPrivateKey,
        e2eeKeySalt: body.data.salt,
        e2eeKeyIv: body.data.iv,
        e2eeKeyVersion: body.data.version,
      },
    });
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
    if (!other || other.suspendedAt) return reply.code(404).send({ error: "Member unavailable" });
    const [userOneId, userTwoId] = [request.user.userId, other.id].sort();
    const thread = await prisma.directThread.upsert({ where: { userOneId_userTwoId: { userOneId, userTwoId } }, create: { userOneId, userTwoId }, update: {} });
    return { thread, recipientEncryptionReady: Boolean(other.e2eePublicKey) };
  });

  app.get("/messages-secure/threads", { preHandler: requireMember }, async (request) => {
    const threads = await prisma.directThread.findMany({
      where: { OR: [{ userOneId: request.user.userId }, { userTwoId: request.user.userId }] },
      include: { userOne: true, userTwo: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
    });
    return {
      threads: threads.map((thread) => {
        const other = thread.userOneId === request.user.userId ? thread.userTwo : thread.userOne;
        const last = thread.messages[0];
        return {
          id: thread.id,
          member: memberSummary(other),
          encryptionReady: Boolean(other.e2eePublicKey),
          lastMessage: last ? { createdAt: last.createdAt, encrypted: last.encrypted, body: last.encrypted ? null : last.body } : null,
          updatedAt: thread.updatedAt,
        };
      }),
    };
  });

  app.get("/messages-secure/threads/:id", { preHandler: requireMember }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid thread" });
    const thread = await prisma.directThread.findUnique({
      where: { id: params.data.id },
      include: { userOne: true, userTwo: true, messages: { orderBy: { createdAt: "asc" }, take: 300 } },
    });
    if (!thread || (thread.userOneId !== request.user.userId && thread.userTwoId !== request.user.userId)) return reply.code(404).send({ error: "Thread not found" });
    const other = thread.userOneId === request.user.userId ? thread.userTwo : thread.userOne;
    await prisma.message.updateMany({ where: { threadId: thread.id, senderId: { not: request.user.userId }, readAt: null }, data: { readAt: new Date() } });
    return {
      id: thread.id,
      member: memberSummary(other),
      otherPublicKey: other.e2eePublicKey,
      encryptionReady: Boolean(other.e2eePublicKey),
      messages: thread.messages.map((message) => message.encrypted ? {
        id: message.id,
        encrypted: true,
        ciphertext: message.ciphertext,
        iv: message.iv,
        wrappedKey: message.senderId === request.user.userId ? message.senderKey : message.recipientKey,
        encryptionVersion: message.encryptionVersion,
        createdAt: message.createdAt,
        senderId: message.senderId,
      } : {
        id: message.id,
        encrypted: false,
        body: message.body,
        createdAt: message.createdAt,
        senderId: message.senderId,
      }),
    };
  });

  app.post("/messages-secure/threads/:id/messages", { preHandler: requireMember }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({
      ciphertext: z.string().min(1).max(12000),
      iv: z.string().min(8).max(128),
      senderKey: z.string().min(20).max(12000),
      recipientKey: z.string().min(20).max(12000),
      encryptionVersion: z.number().int().min(1).max(10).default(1),
    }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid encrypted message" });
    const thread = await prisma.directThread.findUnique({ where: { id: params.data.id }, include: { userOne: true, userTwo: true } });
    if (!thread || (thread.userOneId !== request.user.userId && thread.userTwoId !== request.user.userId)) return reply.code(404).send({ error: "Thread not found" });
    const other = thread.userOneId === request.user.userId ? thread.userTwo : thread.userOne;
    const me = thread.userOneId === request.user.userId ? thread.userOne : thread.userTwo;
    if (!other.e2eePublicKey || !me.e2eePublicKey) return reply.code(409).send({ error: "Both members must enable secure messaging before sending" });
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          threadId: thread.id,
          senderId: request.user.userId,
          body: "",
          encrypted: true,
          ciphertext: body.data.ciphertext,
          iv: body.data.iv,
          senderKey: body.data.senderKey,
          recipientKey: body.data.recipientKey,
          encryptionVersion: body.data.encryptionVersion,
        },
      });
      await tx.directThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
      return created;
    });
    return reply.code(201).send({ message: { id: message.id, encrypted: true, createdAt: message.createdAt } });
  });
}
