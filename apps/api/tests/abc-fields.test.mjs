import test from "node:test";
import assert from "node:assert/strict";
import {FIELDS,FIELD_MAP,freshProfile,freshStates,normalizeField,setPath,getPath,nextQuestion,missingRequired,allFieldsResolved,CORE_GROUPS,groupProgress,inferCandidateGender,hasNonRomanScript} from "../src/abc/fields.ts";

test("all ABC fields have unique allowlisted paths and four language prompts",()=>{
  assert.equal(new Set(FIELDS.map(x=>x.path)).size,FIELDS.length);
  const p=freshProfile();
  for(const f of FIELDS){
    assert.equal(getPath(p,f.path)!==undefined,true, "missing "+f.path);
    for(const l of ["en","hi","ur","roman"])assert.ok(f.ask[l].length>10);
  }
  assert.equal(FIELD_MAP.has("__proto__.admin"),false);
});
test("profile starts blank, cannot silently complete",()=>{
  const p=freshProfile(),s=freshStates();
  assert.equal(p.candidate.age_years,null);
  assert.equal(nextQuestion(p,s).path,"candidate.full_name");
  assert.ok(missingRequired(s).length>=15);
  assert.equal(allFieldsResolved(s),false);
});
test("numeric values use strict adult and physical limits",()=>{
  assert.equal(normalizeField("candidate.age_years",27).ok,true);
  assert.equal(normalizeField("candidate.age_years",900).ok,false);
  assert.equal(normalizeField("candidate.age_years",17).ok,false);
  assert.equal(normalizeField("candidate.age_years","potato").ok,false);
  assert.equal(normalizeField("candidate.height_cm",178).ok,true);
  assert.equal(normalizeField("candidate.height_cm",900).ok,false);
  assert.equal(normalizeField("family.siblings.brothers_count",0).ok,true);
  assert.equal(normalizeField("family.siblings.sisters_count",-1).ok,false);
});
test("parent qualifications and two-sentence education validated",()=>{
  assert.equal(normalizeField("candidate.education.two_sentence_description","A degree").ok,false);
  assert.equal(normalizeField("candidate.education.two_sentence_description","I completed BTech. I studied in Delhi.").ok,true);
  assert.equal(normalizeField("family.mother.profession","Homemaker").ok,true);
});
test("language literacy is not inferred, nulls require clarification",()=>{
  const partial=normalizeField("candidate.languages",[{name:"Urdu",can_speak:true,can_read:null,can_write:null}]);
  assert.equal(partial.ok,true);
  assert.equal(partial.complete,false);
  const full=normalizeField("candidate.languages",[{name:"Urdu",can_speak:true,can_read:true,can_write:false}]);
  assert.equal(full.ok,true);
  assert.equal(full.complete,true);
  assert.equal(normalizeField("candidate.languages",[{name:"Urdu",can_speak:true,can_read:true,can_write:true},{name:"Urdu",can_speak:true,can_read:false,can_write:false}]).ok,false);
});
test("unknown path cannot edit profile and updates remain immutable",()=>{
  const first=freshProfile();
  assert.throws(()=>setPath(first,"candidate.role","admin"));
  const changed=setPath(first,"candidate.age_years",28);
  assert.equal(first.candidate.age_years,null);
  assert.equal(changed.candidate.age_years,28);
});
test("question order skips answered and declined optional fields",()=>{
  const p=freshProfile(),states=freshStates();
  states["candidate.full_name"]="answered";
  states["candidate.gender"]="answered";
  assert.equal(nextQuestion(p,states).path,"candidate.age_years");
  states["candidate.age_years"]="answered";
  states["candidate.height_cm"]="answered";
  states["candidate.weight_kg"]="declined";
  assert.equal(nextQuestion(p,states).path,"candidate.current_location.city");
  for(const def of FIELDS)states[def.path]="answered";
  assert.equal(nextQuestion(p,states),null);
  assert.equal(allFieldsResolved(states),true);
  assert.deepEqual(missingRequired(states),[]);
});

test("seven grouped questions cover exactly fifteen essential fields",()=>{
  assert.equal(CORE_GROUPS.length,7);
  const paths=CORE_GROUPS.flatMap(g=>g.paths);
  assert.equal(new Set(paths).size,paths.length);
  const core=FIELDS.filter(f=>f.required);
  assert.equal(paths.length,core.length);
  for(const def of core)assert.ok(paths.includes(def.path),"Missing "+def.path);
  const profile=freshProfile(),states=freshStates();
  const first=nextQuestion(profile,states);
  assert.deepEqual(first.targetPaths,["candidate.full_name","candidate.age_years","candidate.gender"]);
  assert.ok(first.ask.en.includes("name"));
  assert.ok(first.ask.roman.includes("naam"));
  states["candidate.full_name"]="answered";
  const next=nextQuestion(profile,states);
  assert.deepEqual(next.targetPaths,["candidate.age_years","candidate.gender"]);
  states["candidate.age_years"]="answered";states["candidate.gender"]="answered";
  assert.equal(nextQuestion(profile,states).path,"candidate.current_location.city");
  assert.deepEqual(groupProgress(states),{finished:1,total:7});
});
test("optional qualifications and interests never extend the basic interview",()=>{
  const states=freshStates(),profile=freshProfile();
  for(const def of FIELDS)if(def.required)states[def.path]="answered";
  assert.deepEqual(missingRequired(states),[]);
  assert.equal(nextQuestion(profile,states),null);
  assert.equal(allFieldsResolved(states),true);
  for(const path of ["family.father.education","family.mother.education","candidate.languages",
    "candidate.education.two_sentence_description","partner_preferences.other_preferences"]){
    assert.equal(states[path],"not_asked");
  }
});

test("partner role implies candidate gender, but the value remains editable",()=>{
  assert.equal(inferCandidateGender("bride"),"male");
  assert.equal(inferCandidateGender("groom"),"female");
  const profile=freshProfile();
  const first=setPath(profile,"candidate.gender",inferCandidateGender("bride"));
  assert.equal(first.candidate.gender,"male");
  assert.equal(setPath(first,"candidate.gender","female").candidate.gender,"female");
});
test("deferring a question never counts it as completed",()=>{
  const profile=freshProfile(),states=freshStates();
  assert.equal(nextQuestion(profile,states).path,"candidate.full_name");
  assert.equal(nextQuestion(profile,states,new Set(["candidate.full_name"])).path,"candidate.age_years");
  assert.ok(missingRequired(states).includes("candidate.full_name"));
  assert.equal(nextQuestion(profile,states,new Set(FIELDS.filter(x=>x.required).map(x=>x.path))),null);
  assert.equal(allFieldsResolved(states),false);
});

test("stored text rejects non-Roman scripts across text and collection fields",()=>{
  assert.equal(hasNonRomanScript("Abdullah"),false);
  assert.equal(hasNonRomanScript("عبداللہ"),true);
  assert.equal(hasNonRomanScript("अब्दुल्लाह"),true);
  assert.equal(hasNonRomanScript(["Delhi","Aligarh"]),false);
  assert.equal(hasNonRomanScript([{name:"اردو"}]),true);
  assert.equal(normalizeField("candidate.full_name","عبداللہ").ok,false);
  assert.equal(normalizeField("candidate.full_name","Abdullah").ok,true);
  assert.equal(normalizeField("partner_preferences.preferred_cities_or_regions",["Delhi","علیگڑھ"]).ok,false);
  assert.equal(normalizeField("candidate.languages",[{name:"اردو",can_speak:true,can_read:false,can_write:false}]).ok,false);
});
