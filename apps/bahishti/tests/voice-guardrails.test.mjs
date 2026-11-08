import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const voice=readFileSync(new URL("../src/VoiceCall.tsx",import.meta.url),"utf8");
const app=readFileSync(new URL("../src/AppV2.tsx",import.meta.url),"utf8");
const backend=readFileSync(new URL("../../api/src/abc/routes.ts",import.meta.url),"utf8");
const policy=readFileSync(new URL("../../api/src/abc/voice-policy.ts",import.meta.url),"utf8");

test("four-minute deadline and 15-second start-to-speak repeat twice",()=>{
  assert.match(voice,/const CALL_MS=4\*60\*1000/);
  assert.match(voice,/const START_SPEAK_MS=15\*1000/);
  assert.match(policy,/VOICE_WAIT_FOR_SPEECH_MS=15_000/);
  assert.match(backend,/app.post\("\/live\/wait"/);
  assert.match(backend,/voiceNoAnswerDecision\(d.declines\)/);
});
test("speech turn is assembled by quiet audio and never by delegation offset",()=>{
  assert.match(voice,/VoiceTurnCollector/);
  assert.match(voice,/collectorRef\.current\.ready/);
  assert.doesNotMatch(voice,/pending\.offset\+500/);
  assert.doesNotMatch(voice,/scheduleTurnFallback/);
  assert.match(voice,/api<\{session:Session;action/);
});
test("microphone barge-in cuts assistant audio locally",()=>{
  assert.match(voice,/audioAllowed\(false\)/);
  assert.match(voice,/remoteAudioRef\.current/);
  assert.match(voice,/const levels=audioLevels\(report/);
  assert.match(voice,/session\.input_transcript\.delta/);
  assert.match(backend,/<\|SpawnThinking\|>/);
});
test("every completed answer gets an idempotency identifier and verified next question",()=>{
  assert.match(voice,/voiceTurnId:turnId/);
  assert.match(backend,/turnKey&&d\.declines\[turnKey\]===1/);
  assert.match(backend,/if\(turnKey\)declines\[turnKey\]=1/);
  assert.match(voice,/res\\.session\\.currentQuestionText/);
  assert.doesNotMatch(voice,/res\\.session\\.messages\\.at\\(-1\\)/);
  assert.match(backend,/currentQuestionText:q\\?\\.ask/);
});
test("text chat still offers microphone but never reads chat bubbles aloud",()=>{
  assert.doesNotMatch(app,/speakMessage\(/);
  assert.doesNotMatch(app,/Speech\.speak\(/);
  assert.match(app,/Start voice recording/);
  assert.match(app,/Switch to Chat/);
  assert.match(policy,/isVoiceRepeatRequest/);
});
