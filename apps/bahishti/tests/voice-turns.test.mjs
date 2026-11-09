import test from "node:test";
import assert from "node:assert/strict";
import {VoiceTurnCollector,audioLevels,humanTimer,
  shouldDrainStraySpeech,STRAY_SPEECH_QUIET_MS,STRAY_SPEECH_MAX_DRAIN_MS
} from "../src/voice-turns.ts";

test("fragments are assembled in delivery order without losing spaces",()=>{
 const x=new VoiceTurnCollector();
 x.add({event_id:"a",delta:"My name is ",start_ms:100,end_ms:500},1000);
 x.add({event_id:"b",delta:"Abdullah and ",start_ms:500,end_ms:1500},1300);
 x.add({event_id:"c",delta:"I live in Delhi.",start_ms:1500,end_ms:2250},1800);
 x.micActivity(1700);x.micQuiet();
 assert.equal(x.ready(3000,true),false);
 assert.equal(x.ready(4000,true),true);
 const turn=x.commit();
 assert.equal(turn.text,"My name is Abdullah and I live in Delhi.");
 assert.equal(turn.fragments,3);
 assert.equal(turn.endMs,2250);
});
test("natural mid-sentence pauses don't prematurely commit",()=>{
 const x=new VoiceTurnCollector();
 x.add({event_id:"1",delta:"My father is ",start_ms:0,end_ms:600},1000);
 x.micActivity(1000);x.micQuiet();
 assert.equal(x.ready(2300,true),false);
 x.micActivity(2750);x.micQuiet();
 x.add({event_id:"2",delta:"a government officer.",start_ms:2800,end_ms:4000},3000);
 assert.equal(x.ready(4400,true),false);
 assert.equal(x.ready(5200,true),true);
 assert.equal(x.commit().text,"My father is a government officer.");
});
test("transcript-only fallback is conservative and never uses delegation offset to cut words",()=>{
 const x=new VoiceTurnCollector();
 x.add({delta:"Main Aligarh se ",start_ms:600,end_ms:950},1000);
 x.add({delta:"hoon.",start_ms:950,end_ms:1080},3000);
 assert.equal(x.ready(6200,false),false);
 assert.equal(x.ready(6400,false),true);
 assert.equal(x.commit().text,"Main Aligarh se hoon.");
});
test("duplicate packets are suppressed but repeated spoken words are preserved",()=>{
 const x=new VoiceTurnCollector();
 assert.equal(x.add({event_id:"same",delta:"yes ",start_ms:0,end_ms:100},100),true);
 assert.equal(x.add({event_id:"same",delta:"yes ",start_ms:0,end_ms:100},200),false);
 x.add({event_id:"new",delta:"yes",start_ms:100,end_ms:200},300);
 assert.equal(x.commit().text,"yes yes");
});
test("audio levels use microphone and inbound speaker tracks if available",()=>{
 const stats=new Map();
 stats.set("src",{type:"media-source",kind:"audio",audioLevel:0.052});
 stats.set("in",{type:"inbound-rtp",kind:"audio",totalAudioEnergy:0.06,totalSamplesDuration:0.4});
 const value=audioLevels(stats,{inEnergy:0,inDuration:0,outEnergy:0,outDuration:0});
 assert.equal(value.mic,0.052);
 assert.ok(value.speaker>0.25);
 assert.equal(audioLevels(null).mic,null);
});
test("time formatting",()=>assert.equal(humanTimer(125),"2:05"));

test("remote audio track levels are never mistaken for microphone speech",()=>{
 const stats=new Map([["remote",{type:"track",kind:"audio",isRemote:true,audioLevel:0.3}]]);
 const result=audioLevels(stats);
 assert.equal(result.mic,null);
 assert.equal(result.speaker,null);
});

test("an unsolicited voice response must go quiet before the next authorized question",()=>{
  const last=10000;
  assert.equal(STRAY_SPEECH_QUIET_MS,1800);
  assert.equal(STRAY_SPEECH_MAX_DRAIN_MS,5500);
  assert.equal(shouldDrainStraySpeech(0,10100),false);
  assert.equal(shouldDrainStraySpeech(last,last+100),true);
  assert.equal(shouldDrainStraySpeech(last,last+1799),true);
  assert.equal(shouldDrainStraySpeech(last,last+1800),false);
  assert.equal(shouldDrainStraySpeech(last,last+3000),false);
});
