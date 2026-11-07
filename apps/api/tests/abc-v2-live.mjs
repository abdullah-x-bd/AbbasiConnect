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

  // Generate a real, valid 16x16 PNG image with variable-colour pixels.
  const {deflateSync}=await import("node:zlib");
  function crc32(buffer){let crc=0xffffffff;for(const b of buffer){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
  function pngChunk(type,data){
    const t=Buffer.from(type);const len=Buffer.alloc(4);len.writeUInt32BE(data.length);
    const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));
    return Buffer.concat([len,t,data,crc]);
  }
  const pixels=Buffer.alloc(16*65);
  for(let i=0;i<16;i++)for(let x=0;x<16;x++){
    const offset=i*65+1+x*4;
    pixels[offset]=(i*17+x*7)%256;pixels[offset+1]=(x*13+i*9)%256;
    pixels[offset+2]=(i*19+x*23)%256;pixels[offset+3]=255;
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(16,0);ihdr.writeUInt32BE(16,4);ihdr[8]=8;ihdr[9]=6;
  const png=Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk("IHDR",ihdr),pngChunk("IDAT",deflateSync(pixels)),
    pngChunk("IEND",Buffer.alloc(0))
  ]);
  assert.ok(png.length>100);
  const upload=await req("/abc/photo","POST",{base64:png.toString("base64"),mime:"image/png"});
  assert.equal(upload.ok,true);
  const downloaded=await req("/abc/photo");
  assert.ok(downloaded.dataUri.startsWith("data:image/png;base64,"));
  assert.deepEqual(Buffer.from(downloaded.dataUri.split(",")[1],"base64"),png);
  assert.equal((await req("/abc/state")).session.profile.candidate.profile_photo.uploaded,true);
  console.log("PASS private optional image stored, restored and referenced in profile JSON");


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
  await req("/abc/photo","DELETE");
  assert.equal((await req("/abc/photo")).dataUri,null);
  console.log("PASS member removes photo");

}finally{
  if(created){try{await req("/abc/account","DELETE");console.log("PASS QA account cleanup");}
    catch(e){console.warn("Cleanup:",String(e));}}
}
console.log("ABC V2 TEST COMPLETE");
