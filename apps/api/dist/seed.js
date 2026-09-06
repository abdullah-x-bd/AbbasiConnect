import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
const connectionString = process.env.DATABASE_URL;
if (!connectionString)
    throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const passwordHash = "$2b$12$CJEc014uABt1ITRSA2TE/uWjwGs.Jjl08IGDl.O8pOsbShD0.ckDi";
async function getOrMigrateDemoUser(legacyUsername, username, displayName) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
        return prisma.user.update({
            where: { id: existing.id },
            data: { displayName, passwordHash, contactVerified: true, verificationChannel: "SEED" },
        });
    }
    const legacy = await prisma.user.findUnique({ where: { username: legacyUsername } });
    if (legacy) {
        return prisma.user.update({
            where: { id: legacy.id },
            data: { username, displayName, passwordHash, contactVerified: true, verificationChannel: "SEED" },
        });
    }
    return prisma.user.create({
        data: {
            displayName,
            username,
            passwordHash,
            contactVerified: true,
            verificationChannel: "SEED",
            country: "India",
        },
    });
}
const user1 = await getOrMigrateDemoUser("abdullah_test", "user1", "User1");
const user2 = await getOrMigrateDemoUser("hamzah_test", "user2", "User2");
await prisma.familyLink.upsert({
    where: { inviteCode: "DEMO-BRO1" },
    create: {
        ownerId: user1.id,
        relativeUserId: user2.id,
        relativeName: user2.displayName,
        relation: "SIBLING",
        relationLabel: "Brother",
        inviteCode: "DEMO-BRO1",
        status: "VERIFIED",
    },
    update: {
        ownerId: user1.id,
        relativeUserId: user2.id,
        relativeName: user2.displayName,
        status: "VERIFIED",
    },
});
await prisma.rishteProfile.upsert({
    where: { userId: user2.id },
    create: {
        userId: user2.id,
        isActive: true,
        headline: "Family-verified demo profile",
        bio: "Demo Rishte profile used to test the community flow.",
        familyNote: "Connected to User1 as a verified sibling in the demo family tree.",
        lookingFor: "A compatible family and individual with shared values and educational interests.",
    },
    update: {
        isActive: true,
        headline: "Family-verified demo profile",
        bio: "Demo Rishte profile used to test the community flow.",
        familyNote: "Connected to User1 as a verified sibling in the demo family tree.",
    },
});
const existingPost = await prisma.post.findFirst({
    where: { authorId: user1.id, body: "Welcome to the AbbasiConnect community demo." },
});
if (!existingPost) {
    await prisma.post.create({ data: { authorId: user1.id, body: "Welcome to the AbbasiConnect community demo." } });
}
const [userOneId, userTwoId] = [user1.id, user2.id].sort();
const thread = await prisma.directThread.upsert({
    where: { userOneId_userTwoId: { userOneId, userTwoId } },
    create: { userOneId, userTwoId },
    update: {},
});
const existingMessage = await prisma.message.findFirst({
    where: { threadId: thread.id, body: "This is a demo family message." },
});
if (!existingMessage) {
    await prisma.message.create({
        data: { threadId: thread.id, senderId: user1.id, body: "This is a demo family message." },
    });
}
console.log("AbbasiConnect demo data ready");
await prisma.$disconnect();
