import {z} from "zod";

/**
 * Private diagnostics only. The client never sends microphone samples, user
 * transcripts, contact details or matrimonial answers to this endpoint.
 */
export const VOICE_EVENT_RETENTION_DAYS=14;
export const VOICE_EVENT_KINDS=[
  "call_connected","session_started","question_issued",
  "audio_enabled","audio_disabled","output_started","output_snapshot",
  "output_unexpected","stray_before_question","output_drain_started",
  "output_drain_finished","question_played",
  "user_speech_started","turn_finalized","answer_sent","answer_saved",
  "answer_failed","delegation_created","timeout","voice_error","call_ended"
] as const;

export const voiceEventSchema=z.object({
  sequence:z.number().int().min(1).max(1000),
  elapsedMs:z.number().int().min(0).max(3_600_000),
  eventType:z.enum(VOICE_EVENT_KINDS),
  phase:z.enum(["connecting","asking","waiting","listening","processing","ended"]),
  questionSequence:z.number().int().min(0).max(1000),
  questionPath:z.string().regex(/^[a-z0-9._]{1,150}$/).nullable().optional(),
  preview:z.string().max(300).optional(),
  detail:z.string().max(80).optional()
}).strict();

export const voiceTelemetryBatchSchema=z.object({
  callId:z.string().regex(/^abc_[A-Za-z0-9_-]{8,90}$/),
  events:z.array(voiceEventSchema).min(1).max(25)
}).strict();

const SPEECH_EVENTS=new Set<string>([
  "question_issued","output_started","output_snapshot",
  "output_unexpected","stray_before_question","question_played"
]);

export function safeAssistantPreview(eventType:string,raw?:string):string|null{
  if(!raw||!SPEECH_EVENTS.has(eventType))return null;
  // Even assistant output can accidentally echo a phone number or email.
  const cleaned=raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[email]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g,"[phone]")
    .replace(/https?:\/\/\S+/gi,"[link]")
    .replace(/\b\d{4,}\b/g,"[number]")
    .replace(/[\r\n\t]+/g," ").trim().slice(0,160);
  return cleaned||null;
}
export function safeVoiceDetail(detail?:string):string|null{
  return detail?detail.replace(/[^a-zA-Z0-9_:.+-]/g,"").slice(0,80)||null:null;
}
