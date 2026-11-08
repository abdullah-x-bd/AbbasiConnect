import test from "node:test";
import assert from "node:assert/strict";
import {
  VOICE_MAX_DURATION_MS,VOICE_SILENCE_WARNING_MS,VOICE_SILENCE_END_MS,
  VOICE_ALLOWED_OFF_TOPIC,VOICE_STARTED_KEY,VOICE_UNRELATED_KEY,
  isVoiceDistraction,isVoiceRepeatRequest,unrelatedCount,countVoiceReply,voiceCallExpired,
  voiceNoAnswerDecision,VOICE_WAIT_FOR_SPEECH_MS,VOICE_WAIT_STARTED_KEY,VOICE_NO_ANSWER_KEY
} from "../src/abc/voice-policy.ts";

test("four-minute hard limit and thirty-second silence cutoff",()=>{
  assert.equal(VOICE_MAX_DURATION_MS,240000);
  assert.equal(VOICE_SILENCE_WARNING_MS,20000);
  assert.equal(VOICE_SILENCE_END_MS,30000);
  assert.ok(VOICE_SILENCE_WARNING_MS<VOICE_SILENCE_END_MS);
  const started=1000000;
  const state={[VOICE_STARTED_KEY]:started};
  assert.equal(voiceCallExpired(state,started+239999),false);
  assert.equal(voiceCallExpired(state,started+240000),true);
  assert.equal(voiceCallExpired({},started+240000),false);
});
test("only unrelated replies count, including mixed fact-and-distraction replies",()=>{
  for(const classification of ["VALID","INVALID","AMBIGUOUS","UNKNOWN","DECLINED","STOP","PAUSE","CORRECTION"]){
    assert.equal(isVoiceDistraction({classification,off_topic:false}),false,classification);
  }
  for(const classification of ["OFF_TOPIC","PARTIALLY_OFF_TOPIC"]){
    assert.equal(isVoiceDistraction({classification,off_topic:false}),true);
  }
  assert.equal(isVoiceDistraction({classification:"VALID",off_topic:true}),true);
});
test("fifth unrelated voice answer forcibly ends session without losing prior count",()=>{
  let declines={};
  for(let attempt=1;attempt<=VOICE_ALLOWED_OFF_TOPIC;attempt++){
    const result=countVoiceReply(declines,{classification:"OFF_TOPIC",off_topic:true});
    declines=result.next;
    assert.equal(result.count,attempt);
    assert.equal(result.end,false);
  }
  const normal=countVoiceReply(declines,{classification:"VALID",off_topic:false});
  assert.equal(normal.count,4);
  assert.equal(normal.end,false);
  const fifth=countVoiceReply(normal.next,{classification:"PARTIALLY_OFF_TOPIC",off_topic:true});
  assert.equal(fifth.count,5);
  assert.equal(fifth.end,true);
  assert.equal(fifth.next[VOICE_UNRELATED_KEY],5);
  assert.equal(unrelatedCount(fifth.next),5);
  assert.equal(countVoiceReply(fifth.next,{classification:"OFF_TOPIC",off_topic:true}).count,5);
});
test("unrelated counter cannot be accidentally reset by unrelated field declines",()=>{
  const state={"family.father.profession":3,[VOICE_UNRELATED_KEY]:2};
  const result=countVoiceReply(state,{classification:"UNKNOWN",off_topic:false});
  assert.equal(result.next["family.father.profession"],3);
  assert.equal(result.count,2);
});

test("polite repeat requests in either language never incur unrelated strikes",()=>{
  for(const utterance of ["Repeat that","Please repeat the question",
    "Could you repeat that?","Say that again.","Dobara batayein",
    "Samajh nahi aaya","Kya kaha?"]){
    assert.equal(isVoiceRepeatRequest(utterance),true,utterance);
  }
  for(const utterance of ["Tell me a joke","Explain the news",
    "Repeat the question and then tell me a story","Tell me about OpenAI"]){
    assert.equal(isVoiceRepeatRequest(utterance),false,utterance);
  }
});

test("15-second waiting state repeats once then pauses without asking forever",()=>{
  const now=1000000;
  assert.equal(VOICE_WAIT_FOR_SPEECH_MS,15000);
  const waiting={[VOICE_WAIT_STARTED_KEY]:now,[VOICE_NO_ANSWER_KEY]:0};
  assert.equal(voiceNoAnswerDecision(waiting,now+14200),"too_soon");
  assert.equal(voiceNoAnswerDecision(waiting,now+14400),"repeat");
  assert.equal(voiceNoAnswerDecision({...waiting,[VOICE_NO_ANSWER_KEY]:1},now+15000),"end");
  assert.equal(voiceNoAnswerDecision({},now+30000),"too_soon");
});
