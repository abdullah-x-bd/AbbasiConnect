import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {freshProfile} from "../src/abc/fields.ts";
import {biodataSvg,renderBiodataJpeg,BIODATA_WIDTH,BIODATA_HEIGHT} from "../src/abc/biodata.ts";

function sample(){
  const p=freshProfile();
  p.registration.looking_for="bride";
  p.candidate.full_name="Faizan Ali";
  p.candidate.age_years=27;p.candidate.height_cm=178;
  p.candidate.marital_status="never married";
  p.candidate.current_location.city="Delhi";
  p.candidate.ancestral_location.city_or_town="Aligarh";
  p.candidate.education.highest_qualification="B.Tech";
  p.candidate.education.two_sentence_description="I studied engineering. I graduated in Delhi.";
  p.candidate.occupation.profession_or_role="Engineer";
  p.family.father.name="Ahmed Ali";p.family.father.profession="Teacher";
  p.family.father.education="MA";
  p.family.mother.name="Fatima Ali";p.family.mother.profession="Homemaker";
  p.family.mother.education="BA";
  p.family.siblings.brothers_count=1;p.family.siblings.sisters_count=2;
  p.candidate.personal_introduction="I enjoy reading and learning.";
  p.partner_preferences.preferred_age_range="23 to 28";
  return p;
}
test("biodata renders genuine shareable 1200 x 1800 JPEG",async()=>{
  const p=sample(),bytes=await renderBiodataJpeg(p,null);
  const metadata=await sharp(bytes).metadata();
  assert.equal(metadata.format,"jpeg");
  assert.equal(metadata.width,BIODATA_WIDTH);
  assert.equal(metadata.height,BIODATA_HEIGHT);
  assert.ok(bytes.length>10000);
  for(const phrase of ["Faizan Ali","Aligarh","Ahmed Ali","Fatima Ali","ABBASI BAHISHTI","Looking for"]){
    assert.ok(biodataSvg(p).toLowerCase().includes(phrase.toLowerCase()),"missing "+phrase);
  }
});
test("JPEG contains no mobile number or private PIN even if supplied in profile",async()=>{
  const p=sample();
  p.registration.phone="+911234567890";
  p.candidate.pin="1234";
  const svg=biodataSvg(p);
  assert.ok(!svg.includes("1234"));
  assert.ok(!svg.includes("+911234567890"));
});
test("user supplied XML and script content is escaped",async()=>{
  const p=sample();p.candidate.full_name='Ali & <Hassan> "ABC"';
  p.candidate.personal_introduction="<script>alert('test')</script>";
  const svg=biodataSvg(p);
  assert.ok(svg.includes("Ali &amp; &lt;Hassan&gt;"));
  assert.ok(!svg.includes("<script>"));
  const bytes=await renderBiodataJpeg(p,null);
  assert.equal((await sharp(bytes).metadata()).format,"jpeg");
});
test("uploaded profile photo is composited into JPEG",async()=>{
  const p=sample();
  const testImage=await sharp({
    create:{width:280,height:300,channels:3,background:{r:20,g:110,b:85}}
  }).png().toBuffer();
  const withPhoto=await renderBiodataJpeg(p,"data:image/png;base64,"+testImage.toString("base64"));
  const without=await renderBiodataJpeg(p,null);
  assert.notDeepEqual(withPhoto,without);
  assert.equal((await sharp(withPhoto).metadata()).width,1200);
});
