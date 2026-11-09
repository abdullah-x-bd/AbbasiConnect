import assert from "node:assert/strict";
import {randomInt} from "node:crypto";
const root=process.env.ABC_API_URL||"https://abbasiconnect-api.onrender.com";
const phone="+999"+String(randomInt(1000000000,9999999999));
const pin=String(randomInt(1000,9999));
let token="",created=false;
async function req(path,method="GET",body,status=200){
  const r=await fetch(root+path,{
    method,headers:{...(token?{Authorization:"Bearer "+token}:{}),
      ...(body===undefined?{}:{"content-type":"application/json"})},
    body:body===undefined?undefined:JSON.stringify(body),
    signal:AbortSignal.timeout(95000)
  });
  const j=await r.json().catch(()=>({}));
  assert.equal(r.status,status,path+" unexpected "+r.status+": "+String(j.error||""));
  return j;
}
try{
  const a=await req("/abc/signup","POST",{phone,pin},201);
  created=true;token=a.token;
  for(const [field,value] of [
    ["preferred_language","roman"],["looking_for","bride"],
    ["profile_for","self"],["marital_status","never married"],
    ["onboarding_mode","voice"]
  ])await req("/abc/choice","POST",{field,value});
  let state=(await req("/abc/state")).session;
  assert.equal(state.currentQuestion,"candidate.full_name");
  const intro=await req("/abc/reply","POST",{
    text:"My name is Sajid Alam and I am 29 years old.",
    version:state.version,voiceTurnId:"abc_clarification_name_0001"
  });
  state=intro.session;
  assert.equal(state.fieldStates["candidate.full_name"],"answered");
  assert.equal(state.fieldStates["candidate.age_years"],"answered");
  assert.equal(state.currentQuestion,"candidate.current_location.city",
    "The next question must ask for current and ancestral cities");
  for(const [i,phrase] of [
    "आबाई शहेर का क्या मतलब होता है",
    "हाँ, लेकिन आबाई शहर का मतलब क्या होता है"
  ].entries()){
    const reply=await req("/abc/reply","POST",{
      text:phrase,version:state.version,
      voiceTurnId:"abc_clarification_location_"+String(i).padStart(4,"0")
    });
    assert.equal(reply.classification,"CLARIFICATION");
    assert.equal(reply.changesAccepted,0);
    assert.equal(reply.voiceDistractionCount,0,"question about ABC vocabulary is on-topic");
    assert.match(reply.authorizedVoiceReply,/khandaan/);
    assert.doesNotMatch(reply.authorizedVoiceReply,/The user is asking|BACKEND_DIRECTIVE/);
    assert.equal(reply.session.currentQuestion,"candidate.current_location.city");
    assert.equal(reply.session.fieldStates["candidate.current_location.city"],"not_asked");
    state=reply.session;
  }
  const actual=await req("/abc/reply","POST",{
    text:"I currently live in Delhi and my ancestral town is Aligarh.",
    version:state.version,voiceTurnId:"abc_clarification_location_answer_0001"
  });
  assert.equal(actual.session.fieldStates["candidate.current_location.city"],"answered");
  assert.equal(actual.voiceDistractionCount,0);
  console.log("PASS real voice glossary: Hindi explanations on-topic, no repeats, next location answer saved");
}finally{
  if(created&&token){
    try{await req("/abc/account","DELETE",{pin});}
    catch(e){console.error("ABC test account cleanup failed:",String(e));}
  }
}
