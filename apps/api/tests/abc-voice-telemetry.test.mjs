import test from "node:test";
import assert from "node:assert/strict";
import {voiceTelemetryBatchSchema,safeAssistantPreview,safeVoiceDetail,
  VOICE_EVENT_RETENTION_DAYS} from "../src/abc/voice-telemetry.ts";

const base={callId:"abc_1794300000000_9a81b",events:[{
  sequence:1,elapsedMs:1250,eventType:"output_unexpected",phase:"processing",
  questionSequence:2,questionPath:"candidate.age_years",
  preview:"अच्छा तो इसके बारे में और कुछ बताएं",detail:"transcript_out_of_turn"
}]};

test("accepts private, bounded per-call speech event records",()=>{
  const accepted=voiceTelemetryBatchSchema.safeParse(base);
  assert.equal(accepted.success,true,JSON.stringify(accepted.error?.issues));
  assert.equal(accepted.data.events[0].eventType,"output_unexpected");
  assert.equal(VOICE_EVENT_RETENTION_DAYS,14);
});
test("never accepts raw audio, user transcripts, arbitrary event types or unbounded batches",()=>{
  for(const obj of [
    {...base,events:[{...base.events[0],userTranscript:"My name is Abdullah"}]},
    {...base,events:[{...base.events[0],audio:"base64data"}]},
    {...base,events:[{...base.events[0],eventType:"raw_microphone"}]},
    {...base,events:Array.from({length:26},(_,i)=>({...base.events[0],sequence:i+1}))},
    {...base,callId:"other_user_id"},
    {...base,events:[{...base.events[0],preview:"a".repeat(301)}]}
  ])assert.equal(voiceTelemetryBatchSchema.safeParse(obj).success,false);
});
test("redacts private contact data from assistant previews and excludes user-bearing event types",()=>{
  const phrase="अच्छा तो बताएं, email abc@example.com, phone +91 98765 43210, visit https://example.org.";
  const preview=safeAssistantPreview("output_unexpected",phrase);
  assert.ok(preview?.includes("अच्छा तो"));
  assert.ok(!preview?.includes("abc@example.com"));
  assert.ok(!preview?.includes("98765"));
  assert.ok(!preview?.includes("example.org"));
  assert.equal(safeAssistantPreview("user_speech_started",phrase),null);
  assert.equal(safeVoiceDetail("deferred answer: My name is Abdullah"),"deferredanswer:MynameisAbdullah".slice(0,80));
});
