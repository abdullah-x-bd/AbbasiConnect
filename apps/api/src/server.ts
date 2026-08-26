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
const passwordSchema = z.string().min(8).max(72);
const maritalStatusSchema = z.enum(["NEVER_MARRIED", "DIVORCED", "WIDOWED", "ANNULLED", "SEPARATED"]);
const reportReasonSchema = z.enum(["SPAM", "HARASSMENT", "IMPERSONATION", "FALSE_INFORMATION", "INAPPROPRIATE", "OTHER"]);

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

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    if (!request.user?.userId || request.user.userId === "__registration__") return reply.code(401).send({ error: "Unauthorized" });
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
  return Boolean(await prisma.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { blockerId: true },
  }));
}

async function relationship(viewerId: string, targetId: string) {
  const interest = await prisma.matchInterest.findFirst({
    where: { OR: [{ senderId: viewerId, receiverId: targetId }, { senderId: targetId, receiverId: viewerId }] },
    orderBy: { updatedAt: "desc" },
  });
  if (!interest) return { status: "NONE", direction: null, interestId: null };
  return {
    status: interest.status,
    direction: interest.senderId === viewerId ? "OUTGOING" : "INCOMING",
    interestId: interest.id,
  };
}

function profileFields(user: any) {
  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    age: ageFromDate(user.dateOfBirth),
    gender: user.gender,
    city: user.city,
    state: user.state,
    country: user.country,
    heightCm: user.heightCm,
    maritalStatus: user.maritalStatus,
    education: user.education,
    occupation: user.occupation,
    profileCreatedBy: user.profileCreatedBy,
    about: user.about,
    familyDetails: user.familyDetails,
    languages: user.languages,
    interests: user.interests,
    preferredMinAge: user.preferredMinAge,
    preferredMaxAge: user.preferredMaxAge,
    preferredMinHeightCm: user.preferredMinHeightCm,
    preferredMaxHeightCm: user.preferredMaxHeightCm,
    preferredLocations: user.preferredLocations,
    preferredEducation: user.preferredEducation,
    preferredOccupation: user.preferredOccupation,
    partnerNotes: user.partnerNotes,
    verifiedAt: user.verifiedAt,
    isProfileActive: user.isProfileActive,
  };
}

app.get("/health", async () => ({ ok: true, service: "abbasiconnect-api", mode: "matrimonial" }));

app.post("/auth/dev-aadhaar/scan", async (request, reply) => {
  const body = z.object({ fileName: z.string().min(1).max(255), imageDataUrl: z.string().startsWith("data:image/").max(8_000_000) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Upload a valid test image under 6 MB" });
  try {
    const scan = await scanAadhaarImage(body.data.imageDataUrl);
    return {
      mode: "development-ocr",
      extracted: { displayName: scan.displayName || guessNameFromFile(body.data.fileName), confidence: scan.confidence },
      note: "The Aadhaar image is OCR-read in memory only and is never used as a matrimonial profile photo.",
    };
  } catch (error) {
    request.log.error(error);
    return reply.code(422).send({ error: "OCR could not read this image. Try a clearer front-facing image." });
  }
});

app.post("/auth/dev-aadhaar/verify", async (request, reply) => {
  const body = z.object({ identityName: z.string().trim().min(2).max(100), reference: z.string().trim().min(4).max(100), last4: z.string().regex(/^\d{4}$/).optional() }).safeParse(request.body);
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
    gender: z.string().trim().min(1).max(32),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    country: z.string().trim().min(2).max(80).default("India"),
    heightCm: z.number().int().min(120).max(230).optional(),
    maritalStatus: maritalStatusSchema,
    education: z.string().trim().min(2).max(180),
    occupation: z.string().trim().min(2).max(180),
    profileCreatedBy: z.string().trim().min(2).max(32).default("SELF"),
    about: z.string().trim().max(1500).optional(),
    familyDetails: z.string().trim().max(1200).optional(),
    languages: z.string().trim().max(300).optional(),
    interests: z.string().trim().max(500).optional(),
  }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Check the registration and matrimonial profile details" });

  let registration: RegistrationTokenPayload;
  try { registration = app.jwt.verify<RegistrationTokenPayload>(body.data.registrationToken); }
  catch { return reply.code(401).send({ error: "Aadhaar verification has expired. Verify again." }); }
  if (registration.kind !== "registration" || !registration.identityRefHash) return reply.code(401).send({ error: "Invalid registration proof" });

  const email = body.data.email?.toLowerCase() || undefined;
  const phone = normalizePhone(body.data.phone);
  if (!email && !phone) return reply.code(400).send({ error: "Enter at least an email address or contact number" });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.code(400).send({ error: "Enter a valid email address" });
  if (phone && !/^\+?[1-9]\d{7,14}$/.test(phone)) return reply.code(400).send({ error: "Enter a valid contact number with country code" });

  const dateOfBirth = new Date(`${body.data.dateOfBirth}T00:00:00.000Z`);
  const age = ageFromDate(dateOfBirth);
  if (Number.isNaN(dateOfBirth.getTime()) || !age || age < 18 || age > 100) return reply.code(400).send({ error: "Matrimonial profiles must be for adults aged 18 or older" });

  const conflicts = await prisma.user.findFirst({
    where: { OR: [{ identityRefHash: registration.identityRefHash }, { username: body.data.username }, ...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
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
        gender: body.data.gender,
        city: body.data.city || null,
        state: body.data.state || null,
        country: body.data.country,
        heightCm: body.data.heightCm,
        maritalStatus: body.data.maritalStatus,
        education: body.data.education,
        occupation: body.data.occupation,
        profileCreatedBy: body.data.profileCreatedBy,
        about: body.data.about || "",
        familyDetails: body.data.familyDetails || "",
        languages: body.data.languages || "",
        interests: body.data.interests || "",
      },
    });
    const token = app.jwt.sign({ userId: user.id }, { expiresIn: "30d" });
    return reply.code(201).send({ token, user: profileFields(user) });
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
  if (!await bcrypt.compare(body.data.password, user.passwordHash)) return reply.code(401).send({ error: "Incorrect username or password" });
  const token = app.jwt.sign({ userId: user.id }, { expiresIn: "30d" });
  return { token, user: profileFields(user) };
});

app.get("/auth/me", { preHandler: requireAuth }, async (request, reply) => {
  const user = await prisma.user.findUnique({ where: { id: request.user.userId } });
  if (!user) return reply.code(404).send({ error: "User not found" });
  return { ...profileFields(user), email: user.email, phone: user.phone, dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? null, identityVerified: true, role: user.role };
});

app.patch("/profiles/me", { preHandler: requireAuth }, async (request, reply) => {
  const body = z.object({
    displayName: z.string().trim().min(2).max(80),
    username: usernameSchema,
    email: z.string().trim().max(254).optional(),
    phone: z.string().trim().max(30).optional(),
    gender: z.string().trim().min(1).max(32),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    country: z.string().trim().min(2).max(80),
    heightCm: z.number().int().min(120).max(230).nullable().optional(),
    maritalStatus: maritalStatusSchema,
    education: z.string().trim().max(180),
    occupation: z.string().trim().max(180),
    profileCreatedBy: z.string().trim().min(2).max(32),
    about: z.string().trim().max(1500),
    familyDetails: z.string().trim().max(1200),
    languages: z.string().trim().max(300),
    interests: z.string().trim().max(500),
    preferredMinAge: z.number().int().min(18).max(100).nullable().optional(),
    preferredMaxAge: z.number().int().min(18).max(100).nullable().optional(),
    preferredMinHeightCm: z.number().int().min(120).max(230).nullable().optional(),
    preferredMaxHeightCm: z.number().int().min(120).max(230).nullable().optional(),
    preferredLocations: z.string().trim().max(400),
    preferredEducation: z.string().trim().max(300),
    preferredOccupation: z.string().trim().max(300),
    partnerNotes: z.string().trim().max(1200),
    isProfileActive: z.boolean(),
  }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Invalid profile details" });
  if (body.data.preferredMinAge && body.data.preferredMaxAge && body.data.preferredMinAge > body.data.preferredMaxAge) return reply.code(400).send({ error: "Minimum preferred age cannot exceed maximum preferred age" });
  if (body.data.preferredMinHeightCm && body.data.preferredMaxHeightCm && body.data.preferredMinHeightCm > body.data.preferredMaxHeightCm) return reply.code(400).send({ error: "Minimum preferred height cannot exceed maximum preferred height" });

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
  if (email && taken?.email === email) return reply.code(409).send({ error: "That email address is already registered" });
  if (phone && taken?.phone === phone) return reply.code(409).send({ error: "That contact number is already registered" });

  const user = await prisma.user.update({ where: { id: request.user.userId }, data: { ...body.data, email, phone } });
  return { ...profileFields(user), email: user.email, phone: user.phone, dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? null, identityVerified: true, role: user.role };
});

app.get("/profiles/browse", { preHandler: requireAuth }, async (request, reply) => {
  const query = z.object({
    q: z.string().trim().max(80).optional(),
    gender: z.string().trim().max(32).optional(),
    city: z.string().trim().max(80).optional(),
    maritalStatus: maritalStatusSchema.optional(),
    minAge: z.coerce.number().int().min(18).max(100).optional(),
    maxAge: z.coerce.number().int().min(18).max(100).optional(),
    minHeight: z.coerce.number().int().min(120).max(230).optional(),
    maxHeight: z.coerce.number().int().min(120).max(230).optional(),
  }).safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "Invalid browse filters" });

  const blocked = await blockedIdsFor(request.user.userId);
  const q = query.data.q;
  const users = await prisma.user.findMany({
    where: {
      id: { notIn: [request.user.userId, ...blocked] },
      suspendedAt: null,
      isProfileActive: true,
      ...(query.data.gender ? { gender: { equals: query.data.gender, mode: "insensitive" } } : {}),
      ...(query.data.city ? { city: { contains: query.data.city, mode: "insensitive" } } : {}),
      ...(query.data.maritalStatus ? { maritalStatus: query.data.maritalStatus } : {}),
      ...(q ? { OR: [
        { displayName: { contains: q, mode: "insensitive" } },
        { username: { contains: q.toLowerCase(), mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { education: { contains: q, mode: "insensitive" } },
        { occupation: { contains: q, mode: "insensitive" } },
      ] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const filtered = users.filter((user) => {
    const age = ageFromDate(user.dateOfBirth);
    if (query.data.minAge && (!age || age < query.data.minAge)) return false;
    if (query.data.maxAge && (!age || age > query.data.maxAge)) return false;
    if (query.data.minHeight && (!user.heightCm || user.heightCm < query.data.minHeight)) return false;
    if (query.data.maxHeight && (!user.heightCm || user.heightCm > query.data.maxHeight)) return false;
    return true;
  });

  const ids = filtered.map((user) => user.id);
  const [relations, shortlists] = await Promise.all([
    prisma.matchInterest.findMany({ where: { OR: [{ senderId: request.user.userId, receiverId: { in: ids } }, { receiverId: request.user.userId, senderId: { in: ids } }] } }),
    prisma.shortlist.findMany({ where: { userId: request.user.userId, targetId: { in: ids } } }),
  ]);

  return { profiles: filtered.map((user) => {
    const relation = relations.find((item) => item.senderId === user.id || item.receiverId === user.id);
    return {
      ...profileFields(user),
      relationship: relation ? { status: relation.status, direction: relation.senderId === request.user.userId ? "OUTGOING" : "INCOMING", interestId: relation.id } : { status: "NONE", direction: null, interestId: null },
      shortlisted: shortlists.some((item) => item.targetId === user.id),
    };
  }) };
});

app.get("/profiles/:username", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ username: z.string().min(1).max(24) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid username" });
  const user = await prisma.user.findUnique({ where: { username: params.data.username.toLowerCase() } });
  if (!user || user.suspendedAt || (!user.isProfileActive && user.id !== request.user.userId)) return reply.code(404).send({ error: "Profile not found" });
  if (user.id !== request.user.userId && await areBlocked(user.id, request.user.userId)) return reply.code(404).send({ error: "Profile not found" });

  const relation = user.id === request.user.userId ? { status: "SELF", direction: null, interestId: null } : await relationship(request.user.userId, user.id);
  const shortlisted = user.id === request.user.userId ? false : Boolean(await prisma.shortlist.findUnique({ where: { userId_targetId: { userId: request.user.userId, targetId: user.id } } }));
  const canSeeContact = user.id === request.user.userId || relation.status === "ACCEPTED";
  return { ...profileFields(user), relationship: relation, shortlisted, contact: canSeeContact ? { email: user.email, phone: user.phone } : null };
});

app.post("/profiles/:id/interest", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ message: z.string().trim().max(500).optional() }).safeParse(request.body ?? {});
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid interest request" });
  if (params.data.id === request.user.userId) return reply.code(400).send({ error: "You cannot send interest to yourself" });
  if (await areBlocked(request.user.userId, params.data.id)) return reply.code(404).send({ error: "Profile not found" });

  const target = await prisma.user.findUnique({ where: { id: params.data.id }, select: { id: true, suspendedAt: true, isProfileActive: true } });
  if (!target || target.suspendedAt || !target.isProfileActive) return reply.code(404).send({ error: "Profile not found" });

  const reverse = await prisma.matchInterest.findUnique({ where: { senderId_receiverId: { senderId: params.data.id, receiverId: request.user.userId } } });
  if (reverse?.status === "PENDING") {
    const accepted = await prisma.matchInterest.update({ where: { id: reverse.id }, data: { status: "ACCEPTED" } });
    return { matched: true, interest: accepted };
  }
  if (reverse?.status === "ACCEPTED") return { matched: true, interest: reverse };

  const existing = await prisma.matchInterest.findUnique({ where: { senderId_receiverId: { senderId: request.user.userId, receiverId: params.data.id } } });
  if (existing?.status === "ACCEPTED") return { matched: true, interest: existing };
  const interest = await prisma.matchInterest.upsert({
    where: { senderId_receiverId: { senderId: request.user.userId, receiverId: params.data.id } },
    create: { senderId: request.user.userId, receiverId: params.data.id, message: body.data.message || "" },
    update: { status: "PENDING", message: body.data.message || "" },
  });
  return reply.code(201).send({ matched: false, interest });
});

app.patch("/interests/:id", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ action: z.enum(["ACCEPT", "DECLINE", "WITHDRAW"]) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid interest action" });
  const interest = await prisma.matchInterest.findUnique({ where: { id: params.data.id } });
  if (!interest) return reply.code(404).send({ error: "Interest not found" });
  if (body.data.action === "WITHDRAW") {
    if (interest.senderId !== request.user.userId) return reply.code(403).send({ error: "Only the sender can withdraw this interest" });
    return prisma.matchInterest.update({ where: { id: interest.id }, data: { status: "WITHDRAWN" } });
  }
  if (interest.receiverId !== request.user.userId) return reply.code(403).send({ error: "Only the recipient can respond to this interest" });
  return prisma.matchInterest.update({ where: { id: interest.id }, data: { status: body.data.action === "ACCEPT" ? "ACCEPTED" : "DECLINED" } });
});

app.get("/interests", { preHandler: requireAuth }, async (request) => {
  const [received, sent] = await Promise.all([
    prisma.matchInterest.findMany({ where: { receiverId: request.user.userId, status: { not: "WITHDRAWN" } }, orderBy: { updatedAt: "desc" }, include: { sender: true } }),
    prisma.matchInterest.findMany({ where: { senderId: request.user.userId, status: { not: "WITHDRAWN" } }, orderBy: { updatedAt: "desc" }, include: { receiver: true } }),
  ]);
  return {
    received: received.map((item) => ({ id: item.id, status: item.status, message: item.message, createdAt: item.createdAt, profile: profileFields(item.sender), contact: item.status === "ACCEPTED" ? { email: item.sender.email, phone: item.sender.phone } : null })),
    sent: sent.map((item) => ({ id: item.id, status: item.status, message: item.message, createdAt: item.createdAt, profile: profileFields(item.receiver), contact: item.status === "ACCEPTED" ? { email: item.receiver.email, phone: item.receiver.phone } : null })),
  };
});

app.post("/profiles/:id/shortlist", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid profile id" });
  if (params.data.id === request.user.userId) return reply.code(400).send({ error: "You cannot shortlist yourself" });
  if (await areBlocked(request.user.userId, params.data.id)) return reply.code(404).send({ error: "Profile not found" });
  const target = await prisma.user.findUnique({ where: { id: params.data.id }, select: { id: true } });
  if (!target) return reply.code(404).send({ error: "Profile not found" });
  await prisma.shortlist.upsert({ where: { userId_targetId: { userId: request.user.userId, targetId: params.data.id } }, create: { userId: request.user.userId, targetId: params.data.id }, update: {} });
  return { ok: true };
});

app.delete("/profiles/:id/shortlist", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid profile id" });
  await prisma.shortlist.deleteMany({ where: { userId: request.user.userId, targetId: params.data.id } });
  return { ok: true };
});

app.get("/shortlist", { preHandler: requireAuth }, async (request) => {
  const blocked = await blockedIdsFor(request.user.userId);
  const items = await prisma.shortlist.findMany({ where: { userId: request.user.userId, targetId: { notIn: blocked }, target: { suspendedAt: null, isProfileActive: true } }, orderBy: { createdAt: "desc" }, include: { target: true } });
  const profiles = [];
  for (const item of items) profiles.push({ ...profileFields(item.target), relationship: await relationship(request.user.userId, item.targetId), shortlisted: true });
  return { profiles };
});

app.post("/profiles/:id/block", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success || params.data.id === request.user.userId) return reply.code(400).send({ error: "Invalid profile" });
  await prisma.$transaction([
    prisma.block.upsert({ where: { blockerId_blockedId: { blockerId: request.user.userId, blockedId: params.data.id } }, create: { blockerId: request.user.userId, blockedId: params.data.id }, update: {} }),
    prisma.matchInterest.deleteMany({ where: { OR: [{ senderId: request.user.userId, receiverId: params.data.id }, { senderId: params.data.id, receiverId: request.user.userId }] } }),
    prisma.shortlist.deleteMany({ where: { OR: [{ userId: request.user.userId, targetId: params.data.id }, { userId: params.data.id, targetId: request.user.userId }] } }),
  ]);
  return { ok: true };
});

app.delete("/profiles/:id/block", { preHandler: requireAuth }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid profile" });
  await prisma.block.deleteMany({ where: { blockerId: request.user.userId, blockedId: params.data.id } });
  return { ok: true };
});

app.post("/reports", { preHandler: requireAuth }, async (request, reply) => {
  const body = z.object({ reportedUserId: z.string().uuid(), reason: reportReasonSchema, details: z.string().trim().max(1000).optional() }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Invalid report" });
  if (body.data.reportedUserId === request.user.userId) return reply.code(400).send({ error: "You cannot report yourself" });
  const target = await prisma.user.findUnique({ where: { id: body.data.reportedUserId }, select: { id: true } });
  if (!target) return reply.code(404).send({ error: "Profile not found" });
  const report = await prisma.report.create({ data: { reporterId: request.user.userId, reportedUserId: body.data.reportedUserId, reason: body.data.reason, details: body.data.details || "" } });
  return reply.code(201).send(report);
});

app.get("/moderation/reports", { preHandler: requireModerator }, async () => {
  const reports = await prisma.report.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { reporter: { select: { id: true, displayName: true, username: true } }, reportedUser: { select: { id: true, displayName: true, username: true, suspendedAt: true } } } });
  return { reports };
});

app.patch("/moderation/reports/:id", { preHandler: requireModerator }, async (request, reply) => {
  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ action: z.enum(["REVIEW", "DISMISS", "SUSPEND_USER", "RESTORE_USER"]), note: z.string().trim().max(1000).optional() }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid moderation action" });
  const report = await prisma.report.findUnique({ where: { id: params.data.id } });
  if (!report) return reply.code(404).send({ error: "Report not found" });
  if (body.data.action === "SUSPEND_USER") await prisma.user.update({ where: { id: report.reportedUserId }, data: { suspendedAt: new Date() } });
  if (body.data.action === "RESTORE_USER") await prisma.user.update({ where: { id: report.reportedUserId }, data: { suspendedAt: null } });
  const status = body.data.action === "DISMISS" ? "DISMISSED" : body.data.action === "REVIEW" ? "REVIEWED" : "ACTIONED";
  return prisma.report.update({ where: { id: report.id }, data: { status, reviewedById: request.user.userId, moderationNote: body.data.note || "" } });
});

const close = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({ port: config.port, host: "0.0.0.0" });
