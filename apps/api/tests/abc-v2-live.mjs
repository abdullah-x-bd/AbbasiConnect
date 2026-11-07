import assert from "node:assert/strict";
import {randomInt} from "node:crypto";
const root=process.env.ABC_API_URL||"https://abbasiconnect-api.onrender.com";
const phone="+999"+String(randomInt(1000000000,9999999999));
const pin=String(randomInt(1000,9999));
let token="",created=false;
async function req(path,method="GET",body,status=200){
  const res=await fetch(root+path,{method,headers:{
    ...(token?{Authorization:"Bearer "+token}:{}),
    ...(body===undefined?{}:{"content-type":"application/json"})
  },body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(100000)});
  const json=await res.json().catch(()=>({}));
  assert.equal(res.status,status,path+" status "+res.status+" "+String(json.error||""));
  return json;
}
try{
  assert.equal((await req("/abc/health")).ok,true);
  const a=await req("/abc/signup","POST",{phone,pin},201);created=true;token=a.token;
  assert.equal(a.member.phoneVerified,false);
  assert.equal(a.session.phase,"COLLECTING");
  console.log("PASS immediate PIN registration");
  await req("/abc/signup","POST",{phone,pin},409);
  await req("/abc/choice","POST",{field:"looking_for",value:"bride"});
  const ch=await req("/abc/choice","POST",{field:"profile_for",value:"self"});
  assert.equal(ch.session.currentQuestion,"candidate.full_name");
  assert.ok(ch.session.messages[0].text.includes("Candidate ka poora naam"));
  console.log("PASS minimal setup and bilingual question");
  const response=await req("/abc/reply","POST",{text:"My name is Sajid Alam. I am 29 years old and live in Delhi. My family is originally from Aligarh.",version:ch.session.version});
  assert.equal(response.session.profile.candidate.full_name,"Sajid Alam");
  const login=await req("/abc/login","POST",{phone,pin});
  token=login.token;assert.equal(login.phase,"COLLECTING");
  const saved=await req("/abc/state");
  assert.equal(saved.session.profile.candidate.full_name,"Sajid Alam");
  assert.ok(saved.session.messages.length>2);
  console.log("PASS live AI and saved progress after login");

  const fields={
    "candidate.full_name":"Sajid Alam","candidate.gender":"male","candidate.age_years":29,
    "candidate.height_cm":175,"candidate.marital_status":"never married",
    "candidate.current_location.city":"Delhi","candidate.ancestral_location.city_or_town":"Aligarh",
    "candidate.education.highest_qualification":"Bachelor's degree",
    "candidate.education.two_sentence_description":"I completed a bachelor's degree. I studied engineering in Delhi.",
    "candidate.occupation.profession_or_role":"Engineer",
    "candidate.languages":[{name:"English",can_speak:true,can_read:true,can_write:true}],
    "family.father.name":"Khalid Alam","family.father.profession":"Business owner",
    "family.father.education":"High school","family.mother.name":"Sana Alam",
    "family.mother.profession":"Homemaker","family.mother.education":"Graduate",
    "family.siblings.brothers_count":1,"family.siblings.sisters_count":2
  };
  let final;
  for(const [path,value] of Object.entries(fields)){
    const item=await req("/abc/edit","POST",{path,value});
    final=item.session;
  }
  assert.equal(final.phase,"REVIEW");
  assert.equal(final.progress,100);
  assert.deepEqual(final.missingRequired,[]);
  console.log("PASS only required JSON fields control interview completion");
  const done=await req("/abc/review","POST",{confirmed:true,candidateConsent:true});
  assert.equal(done.session.phase,"COMPLETE");
  const me=await req("/abc/me");
  assert.equal(me.phase,"COMPLETE");
  assert.equal(me.member.phoneVerified,false);
  await req("/abc/publish","POST",{visible:true},403);
  await req("/abc/discover");
  console.log("PASS Explore available, unverified number never falsely published");
  const again=await req("/abc/login","POST",{phone,pin});
  assert.equal(again.phase,"COMPLETE");
  console.log("PASS completed login after app reinstall");

}finally{
  if(created){try{await req("/abc/account","DELETE");console.log("PASS QA account cleanup");}
    catch(e){console.warn("Cleanup:",String(e));}}
}
console.log("ABC V2 TEST COMPLETE");
