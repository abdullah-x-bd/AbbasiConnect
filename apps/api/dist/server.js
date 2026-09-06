import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { hashIdentityReference } from "./identity.js";
const app = Fastify({ logger: true });
await app.register(cors, { origin: config.webOrigin });
await app.register(jwt, { secret: config.jwtSecret });
const usernameSchema = z.string().trim().toLowerCase().min(3).max(24).regex(/^[a-z0-9_]+$/);
const passwordSchema = z.string().min(8).max(72);
const maritalStatusSchema = z.enum(["NEVER_MARRIED", "DIVORCED", "WIDOWED", "ANNULLED", "SEPARATED"]);
const relationSchema = z.enum(["PARENT", "CHILD", "SIBLING", "SPOUSE", "OTHER"]);
const reportReasonSchema = z.enum(["SPAM", "HARASSMENT", "IMPERSONATION", "FALSE_INFORMATION", "INAPPROPRIATE", "OTHER"]);
const production = process.env.NODE_ENV === "production";
const adminUsername = process.env.ADMIN_USERNAME ?? (production ? "" : "admin");
const adminPassword = process.env.ADMIN_PASSWORD ?? (production ? "" : "AbbasiAdmin123!");
function normalizePhone(value) {
    if (!value)
        return undefined;
    const normalized = value.replace(/[\s()-]/g, "");
    return normalized || undefined;
}
function normalizeContact(value) {
    const trimmed = value.trim();
    if (trimmed.includes("@"))
        return trimmed.toLowerCase();
    return normalizePhone(trimmed) ?? trimmed;
}
function safeEqual(left, right) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
}
function ageFromDate(date) {
    if (!date)
        return null;
    const today = new Date();
    let age = today.getUTCFullYear() - date.getUTCFullYear();
    const monthDifference = today.getUTCMonth() - date.getUTCMonth();
    if (monthDifference < 0 || (monthDifference === 0 && today.getUTCDate() < date.getUTCDate()))
        age -= 1;
    return age;
}
function memberSummary(user) {
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
function fullMe(user) {
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
async function requireMember(request, reply) {
    try {
        await request.jwtVerify();
        if (!request.user?.userId || request.user.scope === "admin")
            return reply.code(401).send({ error: "Member sign-in required" });
        const user = await prisma.user.findUnique({ where: { id: request.user.userId }, select: { suspendedAt: true } });
        if (!user || user.suspendedAt)
            return reply.code(403).send({ error: "Account unavailable" });
    }
    catch {
        return reply.code(401).send({ error: "Member sign-in required" });
    }
}
async function requireModerator(request, reply) {
    const result = await requireMember(request, reply);
    if (result)
        return result;
    const user = await prisma.user.findUnique({ where: { id: request.user.userId }, select: { role: true } });
    if (!user || user.role === "MEMBER")
        return reply.code(403).send({ error: "Moderator access required" });
}
async function requireAdmin(request, reply) {
    try {
        await request.jwtVerify();
        if (request.user.scope !== "admin" || request.user.userId !== "__admin__")
            return reply.code(403).send({ error: "Admin access required" });
    }
    catch {
        return reply.code(401).send({ error: "Admin sign-in required" });
    }
}
function inviteCode() {
    return randomBytes(5).toString("hex").toUpperCase();
}
async function blocked(a, b) {
    return Boolean(await prisma.block.findFirst({
        where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
        select: { blockerId: true },
    }));
}
app.get("/health", async () => ({ ok: true, service: "abbasiconnect-api", mode: "community-platform" }));
// Authentication and simple development OTP. In production this adapter can be replaced by WhatsApp/SMS/email OTP.
app.post("/auth/request-otp", async (request, reply) => {
    const body = z.object({ contact: z.string().trim().min(5).max(254) }).safeParse(request.body);
    if (!body.success)
        return reply.code(400).send({ error: "Enter a valid phone number or email" });
    const contact = normalizeContact(body.data.contact);
    const isEmail = contact.includes("@");
    if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))
        return reply.code(400).send({ error: "Enter a valid email address" });
    if (!isEmail && !/^\+?[1-9]\d{7,14}$/.test(contact))
        return reply.code(400).send({ error: "Enter a phone number with country code" });
    const code = String(randomInt(100000, 1000000));
    const challenge = await prisma.otpChallenge.create({
        data: {
            contact,
            channel: isEmail ? "EMAIL_DEV" : "WHATSAPP_DEV",
            codeHash: await bcrypt.hash(code, 10),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
    });
    return {
        challengeId: challenge.id,
        expiresInMinutes: 10,
        channel: challenge.channel,
        ...(production ? {} : { developmentCode: code }),
        note: production ? "OTP sent" : "Development mode: use the displayed OTP. No WhatsApp/SMS provider is connected yet.",
    };
});
app.post("/auth/register", async (request, reply) => {
    const body = z.object({
        challengeId: z.string().uuid(),
        otp: z.string().regex(/^\d{6}$/),
        contact: z.string().trim().min(5).max(254),
        displayName: z.string().trim().min(2).max(80),
        username: usernameSchema,
        password: passwordSchema,
        dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        gender: z.string().trim().max(32).optional(),
        city: z.string().trim().max(80).optional(),
        state: z.string().trim().max(80).optional(),
        country: z.string().trim().min(2).max(80).default("India"),
    }).safeParse(request.body);
    if (!body.success)
        return reply.code(400).send({ error: "Check the registration details" });
    const contact = normalizeContact(body.data.contact);
    const challenge = await prisma.otpChallenge.findUnique({ where: { id: body.data.challengeId } });
    if (!challenge || challenge.contact !== contact || challenge.usedAt || challenge.expiresAt < new Date())
        return reply.code(401).send({ error: "OTP expired or invalid" });
    if (!await bcrypt.compare(body.data.otp, challenge.codeHash))
        return reply.code(401).send({ error: "Incorrect OTP" });
    const isEmail = contact.includes("@");
    const email = isEmail ? contact : undefined;
    const phone = isEmail ? undefined : contact;
    const dateOfBirth = body.data.dateOfBirth ? new Date(`${body.data.dateOfBirth}T00:00:00.000Z`) : null;
    if (dateOfBirth && Number.isNaN(dateOfBirth.getTime()))
        return reply.code(400).send({ error: "Invalid date of birth" });
    const conflict = await prisma.user.findFirst({
        where: { OR: [{ username: body.data.username }, ...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
        select: { username: true, email: true, phone: true },
    });
    if (conflict)
        return reply.code(409).send({ error: "Username or contact is already registered" });
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
    if (!body.success)
        return reply.code(400).send({ error: "Enter your username and password" });
    if (adminUsername && adminPassword && safeEqual(body.data.username, adminUsername) && safeEqual(body.data.password, adminPassword)) {
        return { mode: "admin", token: app.jwt.sign({ userId: "__admin__", scope: "admin" }, { expiresIn: "8h" }), user: { displayName: "Administrator", username: adminUsername, role: "ADMIN" } };
    }
    const username = body.data.username.toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username))
        return reply.code(401).send({ error: "Incorrect username or password" });
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user?.passwordHash || !await bcrypt.compare(body.data.password, user.passwordHash))
        return reply.code(401).send({ error: "Incorrect username or password" });
    if (user.suspendedAt)
        return reply.code(403).send({ error: "Account unavailable" });
    return { mode: "member", token: app.jwt.sign({ userId: user.id }, { expiresIn: "30d" }), user: fullMe(user) };
});
app.get("/auth/session", async (request, reply) => {
    try {
        await request.jwtVerify();
        if (request.user.scope === "admin")
            return { mode: "admin", user: { displayName: "Administrator", username: adminUsername, role: "ADMIN" } };
        const user = await prisma.user.findUnique({ where: { id: request.user.userId } });
        if (!user || user.suspendedAt)
            return reply.code(401).send({ error: "Session unavailable" });
        return { mode: "member", user: fullMe(user) };
    }
    catch {
        return reply.code(401).send({ error: "Session unavailable" });
    }
});
app.get("/auth/me", { preHandler: requireMember }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.userId } });
    if (!user)
        return reply.code(404).send({ error: "User not found" });
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
    if (!body.success)
        return reply.code(400).send({ error: "Invalid profile details" });
    const dateOfBirth = body.data.dateOfBirth ? new Date(`${body.data.dateOfBirth}T00:00:00.000Z`) : null;
    const user = await prisma.user.update({
        where: { id: request.user.userId },
        data: { ...body.data, dateOfBirth, city: body.data.city || null, state: body.data.state || null, gender: body.data.gender || null },
    });
    return fullMe(user);
});
// Optional Aadhaar link. This stores only a hash/reference and metadata, never a card image.
app.post("/identity/aadhaar-dev", { preHandler: requireMember }, async (request, reply) => {
    const body = z.object({ reference: z.string().trim().min(4).max(100), name: z.string().trim().min(2).max(100), last4: z.string().regex(/^\d{4}$/).optional() }).safeParse(request.body);
    if (!body.success)
        return reply.code(400).send({ error: "Invalid Aadhaar development reference" });
    const identityRefHash = hashIdentityReference(body.data.reference);
    const conflict = await prisma.user.findFirst({ where: { identityRefHash, id: { not: request.user.userId } }, select: { id: true } });
    if (conflict)
        return reply.code(409).send({ error: "This identity reference is already linked" });
    await prisma.user.update({ where: { id: request.user.userId }, data: { identityRefHash, identityName: body.data.name, identityLast4: body.data.last4, aadhaarVerifiedAt: new Date() } });
    return { ok: true, aadhaarVerified: true };
});
// Community member directory. Only minimal public profile data is returned.
app.get("/directory", { preHandler: requireMember }, async (request, reply) => {
    const query = z.object({ q: z.string().trim().max(80).optional() }).safeParse(request.query);
    if (!query.success)
        return reply.code(400).send({ error: "Invalid search" });
    const q = query.data.q;
    const users = await prisma.user.findMany({
        where: {
            id: { not: request.user.userId }, suspendedAt: null, isDirectoryVisible: true,
            ...(q ? { OR: [
                    { displayName: { contains: q, mode: "insensitive" } },
                    { username: { contains: q.toLowerCase(), mode: "insensitive" } },
                    { city: { contains: q, mode: "insensitive" } },
                    { occupation: { contains: q, mode: "insensitive" } },
                ] } : {}),
        },
        orderBy: { displayName: "asc" }, take: 100,
    });
    return { members: users.map(memberSummary) };
});
// Family graph.
app.post("/family/members", { preHandler: requireMember }, async (request, reply) => {
    const body = z.object({ relativeName: z.string().trim().min(2).max(100), relation: relationSchema, relationLabel: z.string().trim().max(80).optional() }).safeParse(request.body);
    if (!body.success)
        return reply.code(400).send({ error: "Invalid family member" });
    const link = await prisma.familyLink.create({ data: { ownerId: request.user.userId, relativeName: body.data.relativeName, relation: body.data.relation, relationLabel: body.data.relationLabel || "", inviteCode: inviteCode() } });
    return reply.code(201).send({ link });
});
app.post("/family/claim", { preHandler: requireMember }, async (request, reply) => {
    const body = z.object({ code: z.string().trim().min(6).max(16) }).safeParse(request.body);
    if (!body.success)
        return reply.code(400).send({ error: "Enter a valid family code" });
    const link = await prisma.familyLink.findUnique({ where: { inviteCode: body.data.code.toUpperCase() } });
    if (!link || link.status !== "INVITED" || link.ownerId === request.user.userId)
        return reply.code(404).send({ error: "Family code is invalid or already used" });
    const updated = await prisma.familyLink.update({ where: { id: link.id }, data: { relativeUserId: request.user.userId, status: "VERIFIED" } });
    return { ok: true, link: updated };
});
app.get("/family/me", { preHandler: requireMember }, async (request) => {
    const [links, incomingAccess, outgoingAccess] = await Promise.all([
        prisma.familyLink.findMany({
            where: { OR: [{ ownerId: request.user.userId }, { relativeUserId: request.user.userId }] },
            orderBy: { createdAt: "asc" },
            include: { owner: true, relativeUser: true },
        }),
        prisma.familyTreeAccess.findMany({ where: { targetId: request.user.userId }, orderBy: { updatedAt: "desc" }, include: { requester: true } }),
        prisma.familyTreeAccess.findMany({ where: { requesterId: request.user.userId }, orderBy: { updatedAt: "desc" }, include: { target: true } }),
    ]);
    return {
        links: links.map((link) => ({
            id: link.id, relativeName: link.relativeName, relation: link.relation, relationLabel: link.relationLabel, inviteCode: link.inviteCode, status: link.status,
            owner: memberSummary(link.owner), relativeUser: link.relativeUser ? memberSummary(link.relativeUser) : null,
        })),
        incomingAccess: incomingAccess.map((item) => ({ id: item.id, status: item.status, member: memberSummary(item.requester) })),
        outgoingAccess: outgoingAccess.map((item) => ({ id: item.id, status: item.status, member: memberSummary(item.target) })),
    };
});
app.post("/family/access/:targetId", { preHandler: requireMember }, async (request, reply) => {
    const params = z.object({ targetId: z.string().uuid() }).safeParse(request.params);
    if (!params.success || params.data.targetId === request.user.userId)
        return reply.code(400).send({ error: "Invalid tree request" });
    const target = await prisma.user.findUnique({ where: { id: params.data.targetId }, select: { id: true, suspendedAt: true } });
    if (!target || target.suspendedAt)
        return reply.code(404).send({ error: "Member not found" });
    const access = await prisma.familyTreeAccess.upsert({
        where: { requesterId_targetId: { requesterId: request.user.userId, targetId: params.data.targetId } },
        create: { requesterId: request.user.userId, targetId: params.data.targetId },
        update: { status: "PENDING" },
    });
    return reply.code(201).send({ access });
});
app.patch("/family/access/:id", { preHandler: requireMember }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ action: z.enum(["APPROVE", "DECLINE", "REVOKE"]) }).safeParse(request.body);
    if (!params.success || !body.success)
        return reply.code(400).send({ error: "Invalid access action" });
    const access = await prisma.familyTreeAccess.findUnique({ where: { id: params.data.id } });
    if (!access)
        return reply.code(404).send({ error: "Request not found" });
    if ((body.data.action === "APPROVE" || body.data.action === "DECLINE") && access.targetId !== request.user.userId)
        return reply.code(403).send({ error: "Only the tree owner can respond" });
    if (body.data.action === "REVOKE" && access.requesterId !== request.user.userId && access.targetId !== request.user.userId)
        return reply.code(403).send({ error: "Not allowed" });
    const status = body.data.action === "APPROVE" ? "APPROVED" : body.data.action === "DECLINE" ? "DECLINED" : "REVOKED";
    return prisma.familyTreeAccess.update({ where: { id: access.id }, data: { status } });
});
app.get("/family/tree/:userId", { preHandler: requireMember }, async (request, reply) => {
    const params = z.object({ userId: z.string().uuid() }).safeParse(request.params);
    if (!params.success)
        return reply.code(400).send({ error: "Invalid tree" });
    const targetId = params.data.userId;
    if (targetId !== request.user.userId) {
        const access = await prisma.familyTreeAccess.findUnique({ where: { requesterId_targetId: { requesterId: request.user.userId, targetId } } });
        if (access?.status !== "APPROVED")
            return reply.code(403).send({ error: "This family tree is private. Request access first." });
    }
    const root = await prisma.user.findUnique({ where: { id: targetId } });
    if (!root)
        return reply.code(404).send({ error: "Member not found" });
    const visited = new Set();
    const queue = [targetId];
    const users = new Map();
    const edges = [];
    const unregistered = [];
    while (queue.length && visited.size < 100) {
        const current = queue.shift();
        if (visited.has(current))
            continue;
        visited.add(current);
        const user = await prisma.user.findUnique({ where: { id: current } });
        if (user)
            users.set(user.id, memberSummary(user));
        const links = await prisma.familyLink.findMany({ where: { OR: [{ ownerId: current }, { relativeUserId: current }] }, include: { owner: true, relativeUser: true } });
        for (const link of links) {
            const guestId = `guest:${link.id}`;
            if (!edges.some((edge) => edge.id === link.id))
                edges.push({ id: link.id, from: link.ownerId, to: link.relativeUserId ?? guestId, relation: link.relation, relationLabel: link.relationLabel, status: link.status });
            if (link.relativeUserId) {
                users.set(link.owner.id, memberSummary(link.owner));
                if (link.relativeUser)
                    users.set(link.relativeUser.id, memberSummary(link.relativeUser));
                if (!visited.has(link.ownerId))
                    queue.push(link.ownerId);
                if (!visited.has(link.relativeUserId))
                    queue.push(link.relativeUserId);
            }
            else if (!unregistered.some((item) => item.id === guestId)) {
                unregistered.push({ id: guestId, displayName: link.relativeName, registered: false });
            }
        }
    }
    return { rootId: targetId, nodes: [...users.values()].map((item) => ({ ...item, registered: true })).concat(unregistered), edges };
});
// Rishte is opt-in and contains no photos.
app.get("/rishte", { preHandler: requireMember }, async (request, reply) => {
    const query = z.object({ q: z.string().trim().max(80).optional(), gender: z.string().trim().max(32).optional(), city: z.string().trim().max(80).optional() }).safeParse(request.query);
    if (!query.success)
        return reply.code(400).send({ error: "Invalid filters" });
    const profiles = await prisma.rishteProfile.findMany({
        where: {
            isActive: true,
            user: {
                id: { not: request.user.userId }, suspendedAt: null,
                ...(query.data.gender ? { gender: { equals: query.data.gender, mode: "insensitive" } } : {}),
                ...(query.data.city ? { city: { contains: query.data.city, mode: "insensitive" } } : {}),
                ...(query.data.q ? { OR: [
                        { displayName: { contains: query.data.q, mode: "insensitive" } },
                        { occupation: { contains: query.data.q, mode: "insensitive" } },
                        { education: { contains: query.data.q, mode: "insensitive" } },
                    ] } : {}),
            },
        },
        include: { user: true }, orderBy: { updatedAt: "desc" }, take: 100,
    });
    const interests = await prisma.matchInterest.findMany({ where: { OR: [{ senderId: request.user.userId }, { receiverId: request.user.userId }] } });
    return { profiles: profiles.map((profile) => ({ ...memberSummary(profile.user), rishte: { headline: profile.headline, bio: profile.bio, familyNote: profile.familyNote, lookingFor: profile.lookingFor }, relationship: (() => { const i = interests.find((x) => x.senderId === profile.userId || x.receiverId === profile.userId); return i ? { id: i.id, status: i.status, direction: i.senderId === request.user.userId ? "OUTGOING" : "INCOMING" } : { status: "NONE" }; })() })) };
});
app.get("/rishte/me", { preHandler: requireMember }, async (request) => {
    const profile = await prisma.rishteProfile.findUnique({ where: { userId: request.user.userId } });
    return { profile };
});
app.put("/rishte/me", { preHandler: requireMember }, async (request, reply) => {
    const body = z.object({ isActive: z.boolean(), headline: z.string().trim().max(180), bio: z.string().trim().max(1500), familyNote: z.string().trim().max(1000), lookingFor: z.string().trim().max(1000) }).safeParse(request.body);
    if (!body.success)
        return reply.code(400).send({ error: "Invalid Rishte profile" });
    const profile = await prisma.rishteProfile.upsert({ where: { userId: request.user.userId }, create: { userId: request.user.userId, ...body.data }, update: body.data });
    return { profile };
});
app.post("/rishte/:userId/interest", { preHandler: requireMember }, async (request, reply) => {
    const params = z.object({ userId: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ message: z.string().trim().max(500).optional() }).safeParse(request.body ?? {});
    if (!params.success || !body.success || params.data.userId === request.user.userId)
        return reply.code(400).send({ error: "Invalid interest" });
    const target = await prisma.rishteProfile.findUnique({ where: { userId: params.data.userId }, include: { user: true } });
    if (!target?.isActive || target.user.suspendedAt || await blocked(request.user.userId, params.data.userId))
        return reply.code(404).send({ error: "Rishte profile unavailable" });
    const reverse = await prisma.matchInterest.findUnique({ where: { senderId_receiverId: { senderId: params.data.userId, receiverId: request.user.userId } } });
    if (reverse?.status === "PENDING")
        return { matched: true, interest: await prisma.matchInterest.update({ where: { id: reverse.id }, data: { status: "ACCEPTED" } }) };
    const interest = await prisma.matchInterest.upsert({ where: { senderId_receiverId: { senderId: request.user.userId, receiverId: params.data.userId } }, create: { senderId: request.user.userId, receiverId: params.data.userId, message: body.data.message || "" }, update: { status: "PENDING", message: body.data.message || "" } });
    return reply.code(201).send({ matched: interest.status === "ACCEPTED", interest });
});
app.get("/rishte/interests", { preHandler: requireMember }, async (request) => {
    const [received, sent] = await Promise.all([
        prisma.matchInterest.findMany({ where: { receiverId: request.user.userId, status: { not: "WITHDRAWN" } }, include: { sender: true }, orderBy: { updatedAt: "desc" } }),
        prisma.matchInterest.findMany({ where: { senderId: request.user.userId, status: { not: "WITHDRAWN" } }, include: { receiver: true }, orderBy: { updatedAt: "desc" } }),
    ]);
    return { received: received.map((i) => ({ id: i.id, status: i.status, message: i.message, member: memberSummary(i.sender) })), sent: sent.map((i) => ({ id: i.id, status: i.status, message: i.message, member: memberSummary(i.receiver) })) };
});
app.patch("/rishte/interests/:id", { preHandler: requireMember }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ action: z.enum(["ACCEPT", "DECLINE", "WITHDRAW"]) }).safeParse(request.body);
    if (!params.success || !body.success)
        return reply.code(400).send({ error: "Invalid action" });
    const interest = await prisma.matchInterest.findUnique({ where: { id: params.data.id } });
    if (!interest)
        return reply.code(404).send({ error: "Interest not found" });
    if (body.data.action === "WITHDRAW") {
        if (interest.senderId !== request.user.userId)
            return reply.code(403).send({ error: "Not allowed" });
        return prisma.matchInterest.update({ where: { id: interest.id }, data: { status: "WITHDRAWN" } });
    }
    if (interest.receiverId !== request.user.userId)
        return reply.code(403).send({ error: "Not allowed" });
    return prisma.matchInterest.update({ where: { id: interest.id }, data: { status: body.data.action === "ACCEPT" ? "ACCEPTED" : "DECLINED" } });
});
// Community feed. Text only.
app.get("/community/posts", { preHandler: requireMember }, async () => {
    const posts = await prisma.post.findMany({ where: { author: { suspendedAt: null } }, include: { author: true }, orderBy: { createdAt: "desc" }, take: 100 });
    return { posts: posts.map((post) => ({ id: post.id, body: post.body, createdAt: post.createdAt, author: memberSummary(post.author) })) };
});
app.post("/community/posts", { preHandler: requireMember }, async (request, reply) => {
    const body = z.object({ body: z.string().trim().min(1).max(2500) }).safeParse(request.body);
    if (!body.success)
        return reply.code(400).send({ error: "Post must contain 1 to 2500 characters" });
    const post = await prisma.post.create({ data: { authorId: request.user.userId, body: body.data.body }, include: { author: true } });
    return reply.code(201).send({ post: { id: post.id, body: post.body, createdAt: post.createdAt, author: memberSummary(post.author) } });
});
app.delete("/community/posts/:id", { preHandler: requireMember }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success)
        return reply.code(400).send({ error: "Invalid post" });
    const post = await prisma.post.findUnique({ where: { id: params.data.id } });
    if (!post || post.authorId !== request.user.userId)
        return reply.code(403).send({ error: "Not allowed" });
    await prisma.post.delete({ where: { id: post.id } });
    return { ok: true };
});
// Private direct messaging.
app.post("/messages/threads/:userId", { preHandler: requireMember }, async (request, reply) => {
    const params = z.object({ userId: z.string().uuid() }).safeParse(request.params);
    if (!params.success || params.data.userId === request.user.userId)
        return reply.code(400).send({ error: "Invalid member" });
    const other = await prisma.user.findUnique({ where: { id: params.data.userId }, select: { id: true, suspendedAt: true } });
    if (!other || other.suspendedAt || await blocked(request.user.userId, other.id))
        return reply.code(404).send({ error: "Member unavailable" });
    const [userOneId, userTwoId] = [request.user.userId, other.id].sort();
    const thread = await prisma.directThread.upsert({ where: { userOneId_userTwoId: { userOneId, userTwoId } }, create: { userOneId, userTwoId }, update: {} });
    return { thread };
});
app.get("/messages/threads", { preHandler: requireMember }, async (request) => {
    const threads = await prisma.directThread.findMany({ where: { OR: [{ userOneId: request.user.userId }, { userTwoId: request.user.userId }] }, include: { userOne: true, userTwo: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" } });
    return { threads: threads.map((thread) => ({ id: thread.id, member: memberSummary(thread.userOneId === request.user.userId ? thread.userTwo : thread.userOne), lastMessage: thread.messages[0] ?? null, updatedAt: thread.updatedAt })) };
});
app.get("/messages/threads/:id", { preHandler: requireMember }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success)
        return reply.code(400).send({ error: "Invalid thread" });
    const thread = await prisma.directThread.findUnique({ where: { id: params.data.id }, include: { userOne: true, userTwo: true, messages: { include: { sender: true }, orderBy: { createdAt: "asc" }, take: 300 } } });
    if (!thread || (thread.userOneId !== request.user.userId && thread.userTwoId !== request.user.userId))
        return reply.code(404).send({ error: "Thread not found" });
    await prisma.message.updateMany({ where: { threadId: thread.id, senderId: { not: request.user.userId }, readAt: null }, data: { readAt: new Date() } });
    return { id: thread.id, member: memberSummary(thread.userOneId === request.user.userId ? thread.userTwo : thread.userOne), messages: thread.messages.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt, senderId: m.senderId, sender: memberSummary(m.sender) })) };
});
app.post("/messages/threads/:id/messages", { preHandler: requireMember }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ body: z.string().trim().min(1).max(2000) }).safeParse(request.body);
    if (!params.success || !body.success)
        return reply.code(400).send({ error: "Invalid message" });
    const thread = await prisma.directThread.findUnique({ where: { id: params.data.id } });
    if (!thread || (thread.userOneId !== request.user.userId && thread.userTwoId !== request.user.userId))
        return reply.code(404).send({ error: "Thread not found" });
    const message = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({ data: { threadId: thread.id, senderId: request.user.userId, body: body.data.body } });
        await tx.directThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
        return created;
    });
    return reply.code(201).send({ message });
});
app.post("/reports", { preHandler: requireMember }, async (request, reply) => {
    const body = z.object({ reportedUserId: z.string().uuid().optional(), postId: z.string().uuid().optional(), reason: reportReasonSchema, details: z.string().trim().max(1000).optional() }).safeParse(request.body);
    if (!body.success || (!body.data.reportedUserId && !body.data.postId))
        return reply.code(400).send({ error: "Invalid report" });
    const report = await prisma.report.create({ data: { reporterId: request.user.userId, reportedUserId: body.data.reportedUserId, postId: body.data.postId, reason: body.data.reason, details: body.data.details || "" } });
    return reply.code(201).send({ report });
});
app.post("/profiles/:id/block", { preHandler: requireMember }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success || params.data.id === request.user.userId)
        return reply.code(400).send({ error: "Invalid member" });
    await prisma.block.upsert({ where: { blockerId_blockedId: { blockerId: request.user.userId, blockedId: params.data.id } }, create: { blockerId: request.user.userId, blockedId: params.data.id }, update: {} });
    return { ok: true };
});
// Moderator report queue.
app.get("/moderation/reports", { preHandler: requireModerator }, async () => ({ reports: await prisma.report.findMany({ orderBy: { createdAt: "desc" }, include: { reporter: true, reportedUser: true, post: true } }) }));
// Integrated administration. Admin is not a matrimonial/community member record.
app.get("/admin/overview", { preHandler: requireAdmin }, async () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [users, recentUsers, activeRishte, familyLinks, verifiedFamilyLinks, pendingTreeRequests, posts, messages, interests, acceptedInterests, reports, openReports] = await Promise.all([
        prisma.user.count(), prisma.user.count({ where: { createdAt: { gte: weekAgo } } }), prisma.rishteProfile.count({ where: { isActive: true } }), prisma.familyLink.count(), prisma.familyLink.count({ where: { status: "VERIFIED" } }), prisma.familyTreeAccess.count({ where: { status: "PENDING" } }), prisma.post.count(), prisma.message.count(), prisma.matchInterest.count(), prisma.matchInterest.count({ where: { status: "ACCEPTED" } }), prisma.report.count(), prisma.report.count({ where: { status: "OPEN" } }),
    ]);
    return { generatedAt: new Date(), metrics: { users, recentUsers, activeRishte, familyLinks, verifiedFamilyLinks, pendingTreeRequests, posts, messages, interests, acceptedInterests, reports, openReports } };
});
app.get("/admin/users", { preHandler: requireAdmin }, async (request, reply) => {
    const query = z.object({ q: z.string().trim().max(100).optional() }).safeParse(request.query);
    if (!query.success)
        return reply.code(400).send({ error: "Invalid search" });
    const q = query.data.q;
    const users = await prisma.user.findMany({ where: q ? { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { username: { contains: q.toLowerCase(), mode: "insensitive" } }, { email: { contains: q.toLowerCase(), mode: "insensitive" } }, { phone: { contains: q } }] } : {}, include: { rishteProfile: true, _count: { select: { familyLinksCreated: true, posts: true, messages: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
    return { users: users.map((u) => ({ ...fullMe(u), rishteActive: Boolean(u.rishteProfile?.isActive), familyLinks: u._count.familyLinksCreated, postCount: u._count.posts, messageCount: u._count.messages, aadhaarVerified: Boolean(u.aadhaarVerifiedAt) })) };
});
app.patch("/admin/users/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ action: z.enum(["SUSPEND", "RESTORE", "MAKE_MODERATOR", "MAKE_MEMBER", "HIDE_DIRECTORY", "SHOW_DIRECTORY"]) }).safeParse(request.body);
    if (!params.success || !body.success)
        return reply.code(400).send({ error: "Invalid admin action" });
    const data = body.data.action === "SUSPEND" ? { suspendedAt: new Date() } : body.data.action === "RESTORE" ? { suspendedAt: null } : body.data.action === "MAKE_MODERATOR" ? { role: "MODERATOR" } : body.data.action === "MAKE_MEMBER" ? { role: "MEMBER" } : body.data.action === "HIDE_DIRECTORY" ? { isDirectoryVisible: false } : { isDirectoryVisible: true };
    try {
        return { user: await prisma.user.update({ where: { id: params.data.id }, data }) };
    }
    catch {
        return reply.code(404).send({ error: "User not found" });
    }
});
app.get("/admin/reports", { preHandler: requireAdmin }, async () => ({ reports: await prisma.report.findMany({ orderBy: { createdAt: "desc" }, include: { reporter: true, reportedUser: true, post: true, reviewedBy: true }, take: 300 }) }));
app.patch("/admin/reports/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ action: z.enum(["REVIEW", "DISMISS", "SUSPEND_USER", "RESTORE_USER"]), note: z.string().trim().max(1000).optional() }).safeParse(request.body);
    if (!params.success || !body.success)
        return reply.code(400).send({ error: "Invalid admin action" });
    const report = await prisma.report.findUnique({ where: { id: params.data.id } });
    if (!report)
        return reply.code(404).send({ error: "Report not found" });
    if (report.reportedUserId && body.data.action === "SUSPEND_USER")
        await prisma.user.update({ where: { id: report.reportedUserId }, data: { suspendedAt: new Date() } });
    if (report.reportedUserId && body.data.action === "RESTORE_USER")
        await prisma.user.update({ where: { id: report.reportedUserId }, data: { suspendedAt: null } });
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
