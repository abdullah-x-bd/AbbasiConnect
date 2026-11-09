import test from "node:test";
import assert from "node:assert/strict";
import {normalizeCity,approximateCityKm,parsePreferredAge,mutualSeeks,exploreCandidates}
  from "../src/abc/discovery.ts";

const viewer={registration:{looking_for:"bride",candidate_consent_confirmed:true},
  candidate:{gender:"male",age_years:24,current_location:{city:"Delhi"},
    marital_status:"never married",education:{highest_qualification:"Bachelor's degree"},
    occupation:{profession_or_role:"Engineer"}},
  partner_preferences:{preferred_age_range:"21-26",preferred_cities_or_regions:["Delhi"],
    marital_status_preference:"never married"}};
function female(id,city,age=22,overrides={}){
  const profile={registration:{looking_for:"groom",candidate_consent_confirmed:true},
    candidate:{gender:"female",age_years:age,full_name:"Test Candidate "+id,
      height_cm:165,marital_status:"never married",
      current_location:{city},education:{highest_qualification:"Graduate"},
      occupation:{profession_or_role:"Teacher"}},partner_preferences:{preferred_age_range:"23-29"}};
  return {id,phase:"COMPLETE",visible:true,profile:{...profile,...overrides},
    account:{id:"account_"+id,phoneVerified:false},updatedAt:new Date("2026-11-09T10:00:00Z")};
}
test("Delhi, Dilli, New Delhi and Hindi variants are one selectable city",()=>{
  for(const c of ["Delhi","Dilli","New Delhi","नई दिल्ली","दिल्ली","دہلی"])
    assert.equal(normalizeCity(c),"Delhi",c);
  assert.equal(approximateCityKm("Delhi","Dilli"),0);
  assert.ok(approximateCityKm("Delhi","Aligarh")>100);
  assert.equal(approximateCityKm("Unknown city","Delhi"),null);
});
test("never show private, incomplete, nonconsenting or nonreciprocal profiles",()=>{
  const good=female("1","Dilli");
  const records=[good,{...female("2","Delhi"),visible:false},
    {...female("3","Delhi"),phase:"COLLECTING"},
    female("4","Delhi",22,{registration:{looking_for:"groom",candidate_consent_confirmed:false}}),
    female("5","Delhi",22,{registration:{looking_for:"bride",candidate_consent_confirmed:true}}),
    {...female("6","Delhi"),account:null}];
  const result=exploreCandidates(viewer,records);
  assert.deepEqual(result.candidates.map(x=>x.profileId),["1"]);
  assert.equal(result.candidates[0].verified,false);
  assert.equal(result.candidates[0].publicId,"ABC-1");
  assert.equal(mutualSeeks(viewer,good.profile),true);
  assert.equal(mutualSeeks(viewer,{...good.profile,registration:{looking_for:"bride"}}),false);
});
test("city search and genuine filters apply before pagination, never before relevance",()=>{
  const records=[female("1","Dilli",24),female("2","Aligarh",28),
    female("3","Delhi",21),female("4","Delhi",25)];
  const result=exploreCandidates(viewer,records,{city:"Delhi",ageMin:22,ageMax:25,limit:1,page:1});
  assert.equal(result.total,2);
  assert.equal(result.candidates.length,1);
  assert.equal(result.hasMore,true);
  assert.deepEqual(result.cities.find(x=>x.name==="Delhi"),{name:"Delhi",count:3});
  const second=exploreCandidates(viewer,records,{city:"Dilli",ageMin:22,ageMax:25,limit:1,page:2});
  assert.equal(second.total,2);
  assert.notEqual(result.candidates[0].profileId,second.candidates[0].profileId);
});
test("reciprocal relevance, nearest-first and basic filters are deterministic",()=>{
  const near=female("1","Dilli",25);
  const far=female("2","Aligarh",22);
  const results=exploreCandidates(viewer,[far,near]);
  assert.equal(results.candidates[0].profileId,"1");
  assert.ok(results.candidates[0].matchReasons.includes("Same city"));
  assert.equal(results.candidates[0].distanceKm,0);
  const nearest=exploreCandidates(viewer,[far,near],{sort:"nearest"});
  assert.equal(nearest.candidates[0].profileId,"1");
  assert.equal(exploreCandidates(viewer,[near,far],{maritalStatus:"divorced"}).total,0);
  assert.equal(exploreCandidates(viewer,[near,far],{education:"graduate"}).total,2);
  assert.equal(exploreCandidates(viewer,[near,far],{heightMin:170}).total,0);
  assert.equal(exploreCandidates(viewer,[near,far],{occupation:"teacher"}).total,2);
  assert.deepEqual(parsePreferredAge("25-30"),{min:25,max:30});
  assert.equal(parsePreferredAge("unspecified"),null);
});
test("many older published profiles remain eligible rather than getting lost behind newest 70",()=>{
  const records=Array.from({length:120},(_,i)=>female(String(i+1),"Delhi",22));
  const results=exploreCandidates(viewer,records,{page:3,limit:40});
  assert.equal(results.total,120);
  assert.equal(results.candidates.length,40);
  assert.equal(results.hasMore,false);
});
