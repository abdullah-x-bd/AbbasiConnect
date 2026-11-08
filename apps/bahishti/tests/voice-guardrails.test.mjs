import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const voice=readFileSync(new URL("../src/VoiceCall.tsx",import.meta.url),"utf8");
const app=readFileSync(new URL("../src/AppV2.tsx",import.meta.url),"utf8");
const policy=readFileSync(new URL("../../api/src/abc/voice-policy.ts",import.meta.url),"utf8");

test("hard four-minute voice limit and 20/30-second silence limits on both sides",()=>{
  assert.match(voice,/const MAX_CALL_MS=4\*60\*1000/);
  assert.match(voice,/const SILENCE_WARNING_MS=20\*1000/);
  assert.match(voice,/const SILENCE_END_MS=30\*1000/);
  assert.match(policy,/VOICE_MAX_DURATION_MS=4\*60\*1000/);
  assert.match(policy,/VOICE_SILENCE_END_MS=30\*1000/);
  assert.doesNotMatch(voice,/12\*60\*1000/);
});
test("live voice captures every turn even if GPT-Live does not delegate it",()=>{
  assert.match(voice,/input_audio_buffer\.speech_stopped/);
  assert.match(voice,/session\.input_transcript\.delta/);
  assert.match(voice,/scheduleTurnFallback\(lastTimestamp\)/);
  assert.match(voice,/pendingRef\.current=\{id:"local_"/);
  assert.match(voice,/api<\{session:Session;voiceDistractionCount/);
});
test("fifth unrelated turn returns the user to Chat, but repeat requests are exempt",()=>{
  assert.match(voice,/voiceTermination==="off_topic_limit"/);
  assert.match(voice,/const UNRELATED_LIMIT=4/);
  assert.match(app,/Voice Call ended after five unrelated replies/);
  assert.match(policy,/isVoiceRepeatRequest/);
});
test("text chat still accepts dictated input but does not play assistant responses",()=>{
  assert.doesNotMatch(app,/speakMessage\(/);
  assert.doesNotMatch(app,/Speech\.speak\(/);
  assert.match(app,/Start voice recording/);
  assert.match(app,/Switch to Chat/);
});
test("paid live opening follows session.started and version syncs after connect",()=>{
  assert.match(voice,/sessionStartedRef\.current=true/);
  assert.match(voice,/onSessionRef\.current\(joined\.session\)/);
  assert.match(voice,/connectedRef\.current/);
});
