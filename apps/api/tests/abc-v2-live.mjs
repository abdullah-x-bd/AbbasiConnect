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
}finally{
  if(created){try{await req("/abc/account","DELETE");console.log("PASS QA account cleanup");}
    catch(e){console.warn("Cleanup:",String(e));}}
}
console.log("ABC V2 TEST COMPLETE");
