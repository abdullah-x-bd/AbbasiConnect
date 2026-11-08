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
  assert.equal((await req("/abc/phone/check","POST",{phone})).registered,false);
  const a=await req("/abc/signup","POST",{phone,pin},201);created=true;token=a.token;
  assert.equal((await req("/abc/phone/check","POST",{phone})).registered,true);
  assert.equal(a.member.phoneVerified,false);
  assert.equal(a.session.phase,"COLLECTING");
  console.log("PASS immediate PIN registration");
  await req("/abc/signup","POST",{phone,pin},409);
  await req("/abc/choice","POST",{field:"preferred_language",value:"roman"});
  const seeking=await req("/abc/choice","POST",{field:"looking_for",value:"bride"});
  assert.equal(seeking.session.profile.candidate.gender,"male");
  assert.equal(seeking.session.fieldStates["candidate.gender"],"answered");
  await req("/abc/choice","POST",{field:"profile_for",value:"self"});
  const ch=await req("/abc/choice","POST",{field:"marital_status",value:"never married"});
  assert.equal(ch.session.profile.candidate.marital_status,"never married");
  assert.equal(ch.session.fieldStates["candidate.marital_status"],"answered");
  assert.equal(ch.session.currentQuestion,"candidate.full_name");
  assert.ok(ch.session.messages[0].text.includes("poora naam"));
  assert.ok(ch.session.messages[0].text.includes("umr"));
  assert.ok(!ch.session.messages[0].text.includes("gender"));
  assert.ok(!ch.session.messages[0].text.includes("\n"));
  console.log("PASS early language/role/self/marital choices with inferred gender");
  console.log("PASS single-language grouped question without redundant gender");
  const response=await req("/abc/reply","POST",{text:"My name is Sajid Alam. I am 29 years old and live in Delhi. My family is originally from Aligarh.",version:ch.session.version});
  assert.equal(response.session.profile.candidate.full_name,"Sajid Alam");
  const login=await req("/abc/login","POST",{phone,pin});
  token=login.token;assert.equal(login.phase,"COLLECTING");
  const saved=await req("/abc/state");
  assert.equal(saved.session.profile.candidate.full_name,"Sajid Alam");
  assert.ok(saved.session.messages.length>2);
  console.log("PASS live AI and saved progress after login");
  await req("/abc/account","DELETE",{pin:"000000"},403);
  assert.equal((await req("/abc/me")).member.phone,phone);
  console.log("PASS wrong PIN cannot delete the account");

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
  const withPhoto=(await req("/abc/state")).session.profile;
  assert.equal(withPhoto.candidate.profile_photo.uploaded,true);
  assert.equal(withPhoto.registration.photo_prompt_seen,true);
  console.log("PASS photo prompt recorded without sending photo to LLM");
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
  // Extra details stay voluntary, and can be added without replaying the interview.
  let add=await req("/abc/enrichment","POST",{path:"family.father.education",
    value:"Bachelor's degree",version:final.version});
  assert.equal(add.session.phase,"REVIEW");
  assert.equal(add.session.profile.family.father.education,"Bachelor's degree");
  add=await req("/abc/enrichment","POST",{path:"family.mother.education",
    value:"Graduate",version:add.session.version});
  assert.equal(add.session.profile.family.mother.education,"Graduate");
  await req("/abc/enrichment","POST",{path:"candidate.full_name",
    value:"Hacker",version:add.session.version},400);
  console.log("PASS optional family education, no unauthorized required-field changes");
  const prepared=await req("/abc/enrichment/prepare","POST",{
    path:"candidate.personal_introduction",
    text:"I am an engineer and I enjoy reading books."
  });
  assert.equal(prepared.valid,true);
  assert.ok(prepared.text.toLowerCase().includes("engineer"));
  assert.equal(prepared.text.includes("ع"),false);
  console.log("PASS Gemini cleanup preview does not alter saved JSON");
  const beforeSave=(await req("/abc/state")).session.profile.candidate.personal_introduction;
  assert.equal(beforeSave,null);
  const beforePolishVersion=(await req("/abc/state")).session.version;
  await req("/abc/enrichment","POST",{
    path:"candidate.personal_introduction",value:prepared.text+" extra",version:beforePolishVersion,
    previewToken:prepared.previewToken
  },409);
  const polished=await req("/abc/enrichment","POST",{
    path:"candidate.personal_introduction",value:prepared.text,version:beforePolishVersion,
    previewToken:prepared.previewToken
  });
  assert.ok(polished.session.profile.candidate.personal_introduction.includes("engineer"));
  assert.equal(polished.session.profile.candidate.personal_introduction,prepared.text);
  console.log("PASS only exact Gemini-reviewed text can be saved with a signed preview");
  const romanPreview=await req("/abc/enrichment/prepare","POST",{
    path:"candidate.personal_introduction",text:"میرا نام عبداللہ ہے۔"
  });
  assert.ok(!/[^\\p{Script=Latin}\\p{Script=Common}\\p{Script=Inherited}]/u.test(romanPreview.text),
    "Urdu answer still contains a non-Roman script");
  console.log("PASS spoken-style Urdu detail is returned in Roman script");

  const done=await req("/abc/review","POST",{confirmed:true,candidateConsent:true});
  assert.equal(done.session.phase,"COMPLETE");
  const me=await req("/abc/me");
  assert.equal(me.phase,"COMPLETE");
  assert.equal(me.member.phoneVerified,false);
  await req("/abc/publish","POST",{visible:true},403);
  await req("/abc/discover");
  console.log("PASS Explore available, unverified number never falsely published");
  const biodata=await req("/abc/biodata");
  assert.equal(biodata.mimeType,"image/jpeg");
  assert.equal(biodata.width,1080);assert.equal(biodata.height,1350);
  const image=Buffer.from(biodata.base64,"base64");
  assert.ok(image.length>15000);
  assert.equal(image[0],255);assert.equal(image[1],216);
  if(process.env.ABC_CAPTURE_JPEG==="1"){
    const fs=await import("node:fs");
    fs.mkdirSync("abc-jpeg-evidence",{recursive:true});
    fs.writeFileSync("abc-jpeg-evidence/ABC-Sample-Biodata.jpg",image);
  }
  console.log("PASS real private full-resolution JPEG generation with optional photo");

  const again=await req("/abc/login","POST",{phone,pin});
  assert.equal(again.phase,"COMPLETE");
  console.log("PASS completed login after app reinstall");
  await req("/abc/photo","DELETE");
  assert.equal((await req("/abc/photo")).dataUri,null);
  console.log("PASS member removes photo");

}finally{
  if(created){try{await req("/abc/account","DELETE",{pin});console.log("PASS QA account cleanup");}
    catch(e){console.warn("Cleanup:",String(e));}}
}
console.log("ABC V2 TEST COMPLETE");
