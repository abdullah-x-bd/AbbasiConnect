// Hard limits are enforced by ABC, not merely suggested to the voice model.
export const VOICE_MAX_DURATION_MS=4*60*1000;
export const VOICE_SILENCE_WARNING_MS=20*1000;
export const VOICE_SILENCE_END_MS=30*1000;
export const VOICE_ALLOWED_OFF_TOPIC=4;
export const VOICE_STARTED_KEY="__abc_voice_started_at";
export const VOICE_UNRELATED_KEY="__abc_voice_unrelated_count";

export type VoiceClassification={
  classification:string;
  off_topic:boolean;
};

// Do not punish a refused question, an unknown answer, a correct answer, or
// recognition noise labeled INVALID. Count only genuinely unrelated requests.
// Requests to repeat an ABC question are on-topic and must not use a strike.
export function isVoiceRepeatRequest(text:string):boolean{
  const input=text.toLowerCase().replace(/[.!?।؟]+/g,"").trim().replace(/\s+/g," ");
  return /^(please )?(repeat( that| the question| it)?|say (that|it|the question) again|ask (that|the question) again|what was the question|can you (please )?repeat( that| the question)?|could you (please )?repeat( that| the question)?|can you say that again|i did not hear (you|that)|i didn't hear (you|that)|dobara (boliye|bolen|bataiye|batayein|poochhiye|puchiye)|phir se (boliye|bataiye|batayein|poochhiye|puchiye)|samajh nahi aaya|suna nahi|kya kaha)$/.test(input);
}
export function isVoiceDistraction(x:VoiceClassification):boolean{
  return Boolean(x.off_topic)||x.classification==="OFF_TOPIC"||
    x.classification==="PARTIALLY_OFF_TOPIC";
}
export function unrelatedCount(declines:Record<string,number>):number{
  const count=declines[VOICE_UNRELATED_KEY];
  return Number.isSafeInteger(count)&&count>0?Math.min(count,VOICE_ALLOWED_OFF_TOPIC+1):0;
}
export function countVoiceReply(
  declines:Record<string,number>,classification:VoiceClassification
):{next:Record<string,number>;count:number;end:boolean}{
  const count=Math.min(VOICE_ALLOWED_OFF_TOPIC+1,
    unrelatedCount(declines)+(isVoiceDistraction(classification)?1:0));
  return {next:{...declines,[VOICE_UNRELATED_KEY]:count},
    count,end:count>VOICE_ALLOWED_OFF_TOPIC};
}
export function voiceCallExpired(
  declines:Record<string,number>,now:number=Date.now()
):boolean{
  const started=declines[VOICE_STARTED_KEY];
  return typeof started==="number"&&Number.isFinite(started)&&started>0&&
    now-started>=VOICE_MAX_DURATION_MS;
}
