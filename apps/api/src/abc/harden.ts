/**
 * Supabase Data API must not expose these Fastify-owned tables.
 * Re-run after prisma db push; safe and idempotent.
 */
import { prisma } from "../db.js";

const tables=["AbcRegistration","AbcAccount","AbcSmsChallenge","AbcInterest",
  "User","OtpChallenge","FamilyLink","FamilyTreeAccess","RishteProfile","MatchInterest",
  "Shortlist","Post","PostLike","PostComment","DirectThread","Message","Block","Report"];
try{
  for(const table of tables){
    await prisma.$executeRawUnsafe('ALTER TABLE public."'+table+'" ENABLE ROW LEVEL SECURITY');
    await prisma.$executeRawUnsafe('REVOKE ALL PRIVILEGES ON TABLE public."'+table+'" FROM anon, authenticated');
    const result=await prisma.$queryRawUnsafe<{rls:boolean}[]>('SELECT relrowsecurity AS rls FROM pg_class WHERE oid = $1::regclass','public."'+table+'"');
    if(!result[0]?.rls)throw Error("RLS not enabled for "+table);
    console.log("ABC secured table:",table);
  }
}finally{await prisma.$disconnect();}
