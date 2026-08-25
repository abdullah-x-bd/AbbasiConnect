import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { z } from "zod";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { devIdentitySchema } from "./auth/dev.js";
import { hashIdentityReference, makeUsername } from "./identity.js";
import type { AuthTokenPayload } from "./types.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: config.webOrigin,
});

await app.register(jwt, {
  secret: config.jwtSecret,
});

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthTokenPayload;
    user: AuthTokenPayload;
  }
}

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

app.get("/health", async () => ({
  ok: true,
  service: "abbasiconnect-api",
}));

app.post("/auth/dev-aadhaar", async (request, reply) => {
  const body = devIdentitySchema.safeParse(request.body);

  if (!body.success) {
    return reply.code(400).send({ error: "Invalid login payload" });
  }

  const identityRefHash = hashIdentityReference(body.data.reference);

  let user = await prisma.user.findUnique({
    where: { identityRefHash },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        identityRefHash,
        displayName: body.data.displayName,
        username: makeUsername(body.data.displayName, identityRefHash),
      },
    });
  }

  const token = app.jwt.sign({ userId: user.id }, { expiresIn: "30d" });

  return {
    token,
    user: {
      id: user.id,
      displayName: user.displayName,
      username: user.username,
      bio: user.bio,
    },
  };
});

app.get("/auth/me", { preHandler: requireAuth }, async (request, reply) => {
  const user = await prisma.user.findUnique({
    where: { id: request.user.userId },
    select: {
      id: true,
      displayName: true,
      username: true,
      bio: true,
      createdAt: true,
    },
  });

  if (!user) return reply.code(404).send({ error: "User not found" });
  return user;
});

app.get("/feed", { preHandler: requireAuth }, async () => {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      author: {
        select: {
          id: true,
          displayName: true,
          username: true,
        },
      },
    },
  });

  return { posts };
});

app.post("/posts", { preHandler: requireAuth }, async (request, reply) => {
  const body = z.object({
    body: z.string().trim().min(1).max(1000),
  }).safeParse(request.body);

  if (!body.success) {
    return reply.code(400).send({ error: "Post must be between 1 and 1000 characters" });
  }

  const post = await prisma.post.create({
    data: {
      body: body.data.body,
      authorId: request.user.userId,
    },
    include: {
      author: {
        select: {
          id: true,
          displayName: true,
          username: true,
        },
      },
    },
  });

  return reply.code(201).send(post);
});

app.get("/users/:username", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ username: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid username" });

  const user = await prisma.user.findUnique({
    where: { username: params.data.username },
    select: {
      id: true,
      displayName: true,
      username: true,
      bio: true,
      createdAt: true,
      posts: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      _count: {
        select: {
          followers: true,
          following: true,
        },
      },
    },
  });

  if (!user) return reply.code(404).send({ error: "User not found" });
  return user;
});

app.post("/users/:id/follow", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid user id" });

  if (params.data.id === request.user.userId) {
    return reply.code(400).send({ error: "You cannot follow yourself" });
  }

  const target = await prisma.user.findUnique({ where: { id: params.data.id } });
  if (!target) return reply.code(404).send({ error: "User not found" });

  await prisma.follow.upsert({
    where: {
      followerId_followingId: {
        followerId: request.user.userId,
        followingId: params.data.id,
      },
    },
    create: {
      followerId: request.user.userId,
      followingId: params.data.id,
    },
    update: {},
  });

  return { ok: true };
});

app.delete("/users/:id/follow", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid user id" });

  await prisma.follow.deleteMany({
    where: {
      followerId: request.user.userId,
      followingId: params.data.id,
    },
  });

  return { ok: true };
});

const close = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({
  port: config.port,
  host: "0.0.0.0",
});
