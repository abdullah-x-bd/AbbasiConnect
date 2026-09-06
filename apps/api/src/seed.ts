import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const passwordHash = await bcrypt.hash("TestUser123!", 12);

const abdullah = await prisma.user.upsert({
  where: { username: "abdullah_test" },
  create: {
    displayName: "Abdullah Test",
    username: "abdullah_test",
    passwordHash,
    phone: "+919999000001",
    contactVerified: true,
    verificationChannel: "SEED",
    dateOfBirth: new Date("2002-01-15T00:00:00.000Z"),
    gender: "Male",
    city: "New Delhi",
    state: "Delhi",
    country: "India",
    education: "BA Economics",
    occupation: "Researcher",
    about: "Demo account used to explore AbbasiConnect.",
    languages: "English, Hindi, Urdu",
  },
  update: { passwordHash, contactVerified: true },
});

const hamzah = await prisma.user.upsert({
  where: { username: "hamzah_test" },
  create: {
    displayName: "Hamzah Test",
    username: "hamzah_test",
    passwordHash,
    phone: "+919999000002",
    contactVerified: true,
    verificationChannel: "SEED",
    dateOfBirth: new Date("2003-05-20T00:00:00.000Z"),
    gender: "Male",
    city: "Aligarh",
    state: "Uttar Pradesh",
    country: "India",
    education: "MSc Digital Forensics",
    occupation: "Student",
    about: "Demo family member connected through the family graph.",
    languages: "English, Hindi, Urdu",
  },
  update: { passwordHash, contactVerified: true },
});

await prisma.familyLink.upsert({
  where: { inviteCode: "DEMO-BRO1" },
  create: {
    ownerId: abdullah.id,
    relativeUserId: hamzah.id,
    relativeName: hamzah.displayName,
    relation: "SIBLING",
    relationLabel: "Brother",
    inviteCode: "DEMO-BRO1",
    status: "VERIFIED",
  },
  update: { ownerId: abdullah.id, relativeUserId: hamzah.id, relativeName: hamzah.displayName, status: "VERIFIED" },
});

await prisma.rishteProfile.upsert({
  where: { userId: hamzah.id },
  create: {
    userId: hamzah.id,
    isActive: true,
    headline: "Family-verified profile from Aligarh",
    bio: "Interested in meeting families through a simple, text-only community process.",
    familyNote: "Connected to Abdullah Test as a verified sibling in the demo family tree.",
    lookingFor: "A compatible family and individual with shared values and educational interests.",
  },
  update: { isActive: true },
});

const existingPost = await prisma.post.findFirst({ where: { authorId: abdullah.id, body: "Welcome to the AbbasiConnect community demo." } });
if (!existingPost) await prisma.post.create({ data: { authorId: abdullah.id, body: "Welcome to the AbbasiConnect community demo." } });

const [userOneId, userTwoId] = [abdullah.id, hamzah.id].sort();
const thread = await prisma.directThread.upsert({
  where: { userOneId_userTwoId: { userOneId, userTwoId } },
  create: { userOneId, userTwoId },
  update: {},
});
const existingMessage = await prisma.message.findFirst({ where: { threadId: thread.id, body: "This is a demo family message." } });
if (!existingMessage) await prisma.message.create({ data: { threadId: thread.id, senderId: abdullah.id, body: "This is a demo family message." } });

console.log("AbbasiConnect demo data ready");
console.log("abdullah_test / TestUser123!");
console.log("hamzah_test / TestUser123!");
console.log("admin / AbbasiAdmin123! (development admin)");

await prisma.$disconnect();
