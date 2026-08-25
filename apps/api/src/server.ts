import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

const PORT = Number(process.env.PORT ?? 3001);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-change-me";

await app.register(cors, {
  origin: WEB_ORIGIN,
});

await app.register(jwt, {
  secret: JWT_SECRET,
});

type TokenPayload = {
  userId: string;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}

async function requireAuth(request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

function makeIdentityHash(reference: string) {
  return createHash("sha256")
    .update(`abbasiconnect:v1:${reference}`)
    .digest("hex");
}

function makeUsername(displayName: string, identityHash: string) {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 18) || "abbasi";
  return `${base}${identityHash.slice(0, 6)}`;
}

app.get("/health", async () => ({
  ok: true,
  service: "abbasiconnect-api",
}));

app.post("/auth/dev-aadhaar", async (request, reply) => {
  const body = z.object({
    displayName: z.string().trim().min(2).max(80),
    reference: z.string().trim().min(4).max(100),
  }).safeParse(request.body);

  if (!body.success) {
    return reply.code(400).send({ error: "Invalid login payload" });
  }

  const identityRefHash = makeIdentityHash(body.data.reference);

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

app.get("/auth/me", { preHandler: requireAuth }, async (request: any, reply) => {
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

app.post("/posts", { preHandler: requireAuth }, async (request: any, reply) => {
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

app.get("/users/:username", { preHandler: requireAuth }, async (request: any, reply) => {
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

app.post("/users/:id/follow", { preHandler: requireAuth }, async (request: any, reply) => {
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

app.delete("/users/:id/follow", { preHandler: requireAuth }, async (request: any, reply) => {
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
  port: PORT,
  host: "0.0.0.0",
});
