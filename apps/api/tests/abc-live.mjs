import assert from "node:assert/strict";
const base=process.env.ABC_API_URL||"https://abbasiconnect-api.onrender.com";
let sessionToken="";
const sessions=[];
async function request(path,method="GET",body,expected=200){
  const response=await fetch(base+path,{method,headers:{
    ...(sessionToken?{authorization:"Bearer "+sessionToken}:{}),
    ...(body!==undefined?{"content-type":"application/json"}:{})
  },body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(125000)});
  const result=await response.json().catch(()=>({}));
  assert.equal(response.status,expected,path+" expected "+expected+" received "+response.status+": "+String(result.error||""));
  return result;
}
try{
  const health=await request("/abc/health");
  assert.equal(health.service,"abbasi-bahishti-connections");
  console.log("PASS ABC service reachable");
  await request("/abc/state","GET",undefined,401);
  console.log("PASS login required for private profile");
  let created=await request("/abc/start","POST",{},201);
  sessionToken=created.token;sessions.push(sessionToken);
  assert.equal(created.session.profile.candidate.full_name,null);
  for(const [field,value] of [["preferred_language","en"],["looking_for","bride"],["profile_for","self"]]){
    const data=await request("/abc/choice","POST",{field,value});
    assert.equal(data.session.profile.registration[field],value);
  }
  const before=(await request("/abc/state")).session;
  assert.equal(before.currentQuestion,"candidate.full_name");
  console.log("PASS separate ABC registration and first question");
  await request("/abc/edit","POST",{path:"candidate.age_years",value:900},400);
  await request("/abc/edit","POST",{path:"candidate.role",value:"administrator"},400);
  console.log("PASS profile field validation");
  if(health.aiConfigured){
    const data=await request("/abc/reply","POST",{
      text:"My full name is Aftab Karim. I am 27 years old and currently live in Delhi. My family is originally from Aligarh.",
      version:before.version
    });
    assert.equal(data.session.profile.candidate.full_name,"Aftab Karim");
    assert.equal(data.session.profile.candidate.age_years,27);
    assert.equal(data.session.profile.candidate.current_location.city,"Delhi");
    assert.equal(data.session.profile.candidate.ancestral_location.city_or_town,"Aligarh");
    console.log("PASS live structured model extraction across four fields");
  }else console.log("SKIP live AI: Render model key unavailable");
  created=await request("/abc/start","POST",{},201);
  sessionToken=created.token;sessions.push(sessionToken);
  for(const [field,value] of [["preferred_language","en"],["looking_for","groom"],["profile_for","self"]])
    await request("/abc/choice","POST",{field,value});
  const state=(await request("/abc/state")).session;
  const first=await request("/abc/skip","POST",{version:state.version});
  assert.equal(first.session.phase,"COLLECTING");
  const second=await request("/abc/skip","POST",{version:first.session.version});
  assert.equal(second.session.phase,"BLOCKED_REQUIRED");
  const resumed=await request("/abc/resume","POST",{});
  assert.equal(resumed.session.phase,"COLLECTING");
  console.log("PASS mandatory-answer refusal and resume state machine");
}finally{
  for(const t of sessions){
    sessionToken=t;
    try{await request("/abc/draft","DELETE");}catch(e){console.warn("Session cleanup needs attention",String(e).slice(0,100));}
  }
}
console.log("ABC live integration verified");
