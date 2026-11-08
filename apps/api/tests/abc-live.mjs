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
  for(const [field,value] of [["preferred_language","en"],["looking_for","bride"],["profile_for","self"],["marital_status","never married"]]){
    const data=await request("/abc/choice","POST",{field,value});
    assert.equal(field==="marital_status"?data.session.profile.candidate.marital_status:data.session.profile.registration[field],value);
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
    console.log("AI diagnostic:",JSON.stringify({classification:data.classification,accepted:data.changesAccepted,currentQuestion:data.session.currentQuestion,profile:{name:data.session.profile.candidate.full_name,age:data.session.profile.candidate.age_years,city:data.session.profile.candidate.current_location.city,ancestral:data.session.profile.candidate.ancestral_location.city_or_town},lastMessage:data.session.messages.at(-1)?.text?.slice(0,150)}));
    assert.equal(data.session.profile.candidate.full_name,"Aftab Karim");
    assert.equal(data.session.profile.candidate.age_years,27);
    assert.equal(data.session.profile.candidate.current_location.city,"Delhi");
    assert.equal(data.session.profile.candidate.ancestral_location.city_or_town,"Aligarh");
    console.log("PASS live structured model extraction across four fields");
  }else console.log("SKIP live AI: Render model key unavailable");
  created=await request("/abc/start","POST",{},201);
  sessionToken=created.token;sessions.push(sessionToken);
  for(const [field,value] of [["preferred_language","en"],["looking_for","groom"],["profile_for","self"],["marital_status","never married"]])
    await request("/abc/choice","POST",{field,value});
  const state=(await request("/abc/state")).session;
  const first=await request("/abc/skip","POST",{version:state.version});
  assert.equal(first.session.phase,"COLLECTING");
  const second=await request("/abc/skip","POST",{version:first.session.version});
  assert.equal(second.session.phase,"COLLECTING");
  const third=await request("/abc/skip","POST",{version:second.session.version});
  assert.equal(third.session.phase,"COLLECTING");
  assert.notEqual(third.session.currentQuestion,"candidate.full_name");
  assert.ok(third.session.missingRequired.includes("candidate.full_name"));
  assert.ok(third.session.progress<100);
  const persisted=(await request("/abc/state")).session;
  assert.equal(persisted.currentQuestion,third.session.currentQuestion);
  console.log("PASS three refused replies defer the required field without marking it complete");
  created=await request("/abc/start","POST",{},201);
  sessionToken=created.token;sessions.push(sessionToken);
  for(const [field,value] of [["preferred_language","en"],["looking_for","bride"],["profile_for","self"],["marital_status","never married"]])
    await request("/abc/choice","POST",{field,value});
  const values={
    "candidate.full_name":"ABC Test Candidate",
    "candidate.gender":"male",
    "candidate.age_years":27,
    "candidate.height_cm":175,
    "candidate.weight_kg":68,
    "candidate.marital_status":"never married",
    "candidate.current_location.city":"Delhi",
    "candidate.current_location.state":"Delhi",
    "candidate.current_location.country":"India",
    "candidate.ancestral_location.city_or_town":"Aligarh",
    "candidate.ancestral_location.district":"Aligarh",
    "candidate.education.highest_qualification":"Bachelor's degree",
    "candidate.education.institution":"ABC QA College",
    "candidate.education.two_sentence_description":"I studied engineering. I graduated from college in Delhi.",
    "candidate.occupation.profession_or_role":"Engineer",
    "candidate.occupation.employer_or_business":"ABC Test Employer",
    "candidate.languages":[{"name":"English","can_speak":true,"can_read":true,"can_write":true}],
    "family.father.name":"QA Father",
    "family.father.profession":"Engineer",
    "family.father.education":"Bachelor's degree",
    "family.mother.name":"QA Mother",
    "family.mother.profession":"Homemaker",
    "family.mother.education":"Bachelor's degree",
    "family.siblings.brothers_count":0,
    "family.siblings.sisters_count":1,
    "family.family_introduction":"ABC test family",
    "candidate.personal_introduction":"A researcher and engineer.",
    "partner_preferences.preferred_age_range":"23 to 29",
    "partner_preferences.preferred_cities_or_regions":["Delhi","Aligarh"],
    "partner_preferences.education_preference":"Bachelor's degree",
    "partner_preferences.profession_preference":"Any profession",
    "partner_preferences.other_preferences":"Kind and respectful"
  };
  let final;
  for(const [path,value] of Object.entries(values)){
    final=(await request("/abc/edit","POST",{path,value})).session;
  }
  assert.equal(final.phase,"REVIEW","Completed JSON must transition to review");
  assert.deepEqual(final.missingRequired,[]);
  assert.equal(final.progress,100);
  console.log("PASS entire profile JSON populated and deterministic review transition");
  const reviewed=await request("/abc/review","POST",{confirmed:true,candidateConsent:true});
  assert.equal(reviewed.session.phase,"VERIFY_PHONE");
  await request("/abc/pin/create","POST",{pin:"123456"},409);
  if(!health.smsConfigured)await request("/abc/verification/start","POST",{phone:"+919999999999"},503);
  console.log("PASS profile confirmation and strict phone/PIN gateway");

}finally{
  for(const t of sessions){
    sessionToken=t;
    try{await request("/abc/draft","DELETE");}catch(e){console.warn("Session cleanup needs attention",String(e).slice(0,100));}
  }
}
console.log("ABC live integration verified");
