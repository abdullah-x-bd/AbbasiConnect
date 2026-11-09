import assert from "node:assert/strict";
import {randomInt} from "node:crypto";
const root=process.env.ABC_API_URL||"https://abbasiconnect-api.onrender.com";
const accounts=[];
async function request(token,path,method="GET",body,status=200){
  const r=await fetch(root+path,{method,headers:{
    ...(token?{Authorization:"Bearer "+token}:{}),
    ...(body===undefined?{}:{"content-type":"application/json"})
  },body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(95000)});
  const result=await r.json().catch(()=>({}));
  assert.equal(r.status,status,path+" returned "+r.status+": "+String(result.error||""));
  return result;
}
const fields={
  "candidate.full_name":"", // filled per account
  "candidate.age_years":24,"candidate.height_cm":175,
  "candidate.current_location.city":"Delhi",
  "candidate.ancestral_location.city_or_town":"Aligarh",
  "candidate.education.highest_qualification":"Bachelor's degree",
  "candidate.education.two_sentence_description":"I studied engineering in Delhi. I attended university there.",
  "candidate.occupation.profession_or_role":"Engineer",
  "candidate.languages":[{name:"English",can_speak:true,can_read:true,can_write:true}],
  "family.father.name":"Test Father","family.father.profession":"Teacher",
  "family.mother.name":"Test Mother","family.mother.profession":"Homemaker",
  "family.siblings.brothers_count":1,"family.siblings.sisters_count":0
};
async function createMember(seeking,name,city,age){
  const phone="+999"+String(randomInt(1000000000,9999999999));
  const pin=String(randomInt(1000,9999));
  const result=await request("","/abc/signup","POST",{phone,pin},201);
  const member={token:result.token,pin,phone,id:result.session.id};
  accounts.push(member);
  for(const [field,value] of [
    ["preferred_language","roman"],["looking_for",seeking],
    ["profile_for","self"],["marital_status","never married"],
    ["onboarding_mode","chat"]
  ])await request(member.token,"/abc/choice","POST",{field,value});
  const current={...fields,
    "candidate.full_name":name,"candidate.current_location.city":city,
    "candidate.age_years":age};
  let state=null;
  for(const [path,value] of Object.entries(current)){
    const reply=await request(member.token,"/abc/edit","POST",{path,value});
    state=reply.session;
  }
  assert.equal(state.phase,"REVIEW",name+" must reach review");
  const done=await request(member.token,"/abc/review","POST",{confirmed:true,candidateConsent:true});
  assert.equal(done.session.phase,"COMPLETE");
  assert.equal(done.session.visible,false);
  const me=await request(member.token,"/abc/me");
  assert.equal(me.member.phoneVerified,false);
  assert.equal(me.visible,false);
  return member;
}
try{
  const health=await request("","/abc/health");
  assert.equal(health.discoveryContract,"reciprocal-ranking-v1");
  const a=await createMember("bride","Pilot Test Male","Delhi",24);
  const b=await createMember("groom","Pilot Test Female","Dilli",22);
  const before=await request(a.token,"/abc/discover");
  assert.ok(!before.candidates.some(c=>c.profileId===b.id),
    "Unpublished candidate must never be discoverable");
  assert.equal((await request(b.token,"/abc/publish","POST",{visible:true})).visible,true);
  const found=await request(a.token,"/abc/discover?city=Delhi&sort=nearest&limit=20");
  const candidate=found.candidates.find(c=>c.profileId===b.id);
  assert.ok(candidate,"Opposite seeking profile from Dilli must appear in Delhi search");
  assert.equal(candidate.distanceKm,0);
  assert.equal(candidate.verified,false);
  assert.ok(candidate.publicId.startsWith("ABC-"));
  assert.ok(!found.candidates.some(c=>c.profileId===a.id),"Own candidate not returned");
  assert.equal(found.cities.some(c=>c.name==="Delhi"),true);
  assert.equal((await request(a.token,"/abc/discover?city=Dilli")).candidates.some(c=>c.profileId===b.id),true);
  assert.equal((await request(a.token,"/abc/discover?ageMin=23")).candidates.some(c=>c.profileId===b.id),false);
  assert.equal((await request(a.token,"/abc/discover?ageMax=22")).candidates.some(c=>c.profileId===b.id),true);
  assert.equal((await request(a.token,"/abc/discover?maritalStatus=divorced")).candidates.some(c=>c.profileId===b.id),false);
  await request(a.token,"/abc/discover?seeking=groom","GET",undefined,400);
  const pref=await request(a.token,"/abc/match-preferences","POST",{
    ageMin:20,ageMax:26,cities:["Dilli","Aligarh"],
    maritalStatus:"never married",education:"graduate",occupation:""
  });
  assert.deepEqual(pref.preferences.preferred_cities_or_regions,["Delhi","Aligarh"]);
  const ranked=await request(a.token,"/abc/discover?sort=relevance");
  assert.ok(ranked.candidates.some(c=>c.profileId===b.id));
  assert.equal((await request(b.token,"/abc/publish","POST",{visible:false})).visible,false);
  assert.equal((await request(a.token,"/abc/discover")).candidates.some(c=>c.profileId===b.id),false);
  console.log("PASS reciprocal pilot discovery, publish privacy, Dilli/Delhi, filters, nearest sorting, preferences and self exclusion");
}finally{
  for(const member of accounts.reverse()){
    try{await request(member.token,"/abc/account","DELETE",{pin:member.pin});}
    catch(e){console.error("Test account cleanup failed",String(e).slice(0,250));}
  }
}
