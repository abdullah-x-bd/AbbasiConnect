// Hard limits are enforced by ABC, not merely suggested to the voice model.
export const VOICE_MAX_DURATION_MS=4*60*1000;
export const VOICE_SILENCE_WARNING_MS=15*1000;
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
/**
 * This is a complaint about interview state, NOT a request to hear the same
 * question again. Process it as a recovery request, never as off-topic speech.
 */
export function isVoiceAlreadyProvided(text:string):boolean{
  const t=text.toLowerCase().replace(/[.!?।؟,]+/g," ").replace(/\s+/g," ").trim();
  return /\b(already|before|earlier|previously)\b.{0,75}\b(answered|said|told|mentioned|shared|provided|gave|explained)\b/.test(t)||
    /\b(answered|said|told|mentioned|shared|provided|gave|explained)\b.{0,75}\b(already|before|earlier|previously)\b/.test(t)||
    /\b(i (have|'ve|had) (already )?(answered|told|said|mentioned|shared|provided)|you (already )?(asked|have asked) (me )?that)\b/.test(t)||
    /\b(pehle( hi)? (bata|bataya|bola|keh|kah|de diya)|bata (diya|chuka|chuki)|bataya (tha|hai)|pehle hi jawab|already bata)\b/.test(t);
}
/**
 * Asking what the questionnaire's own vocabulary means is on-topic.
 * Handle this deterministically before AI classification so it never counts
 * against the five genuinely unrelated requests allowed in a call.
 * Only the location question activates this narrow glossary.
 */
export function voiceQuestionClarification(
  text:string,questionPath:string,language:"en"|"roman"|"hi"|"ur"
):string|null {
  if(!["candidate.current_location.city","candidate.ancestral_location.city_or_town"].includes(questionPath))
    return null;
  const t=text.trim().toLocaleLowerCase();
  const term=/(?:aab[ae]i|aaba[ae]i|aabaayi|abayi|abay|ab[a-z]*\s*shehar|ancestral|आबाई|आबाइ|अबाई|अभय\s*(?:शहर|शहेर)|آبائی|آبای)/iu.test(t);
  const asking=/(?:matlab|meaning|mean\b|explain|samjha|samjh|kya\s+(?:hota|hai)|what\s+(?:is|does)|क्या.{0,18}(?:मतलब|है|होता)|मतलब|معنی|کیا\s+مطلب)/iu.test(t);
  if(!term||!asking)return null;
  switch(language){
    case "en":return "Ancestral city means the town your family originally comes from. What is your current city, and your ancestral city or town?";
    case "hi":return "आबाई शहर का मतलब वह शहर या कस्बा है जहाँ से आपका परिवार मूल रूप से आता है। बताइए, अभी का शहर और आबाई शहर क्या है?";
    case "ur":return "آبائی شہر سے مراد وہ شہر یا قصبہ ہے جہاں سے آپ کا خاندان اصل میں آیا ہے۔ آپ کا موجودہ اور آبائی شہر کون سا ہے؟";
    default:return "Aabai shehar ka matlab woh shehar ya qasba hai jahan se aapka khandaan asal mein aaya. Batayein: abhi ka shehar aur aabai shehar.";
  }
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

// Speech deadlines are enforced after confirmed question playback. Unlike a
// transcript gap, this never assumes that an already speaking user has stopped.
export const VOICE_WAIT_FOR_SPEECH_MS=15_000;
export const VOICE_WAIT_STARTED_KEY="__abc_voice_question_ready_at";
export const VOICE_NO_ANSWER_KEY="__abc_voice_no_answer_repeats";
export function voiceNoAnswerDecision(
  state:Record<string,number>,now:number=Date.now()
):"too_soon"|"repeat"|"end" {
  const started=state[VOICE_WAIT_STARTED_KEY];
  if(!Number.isFinite(started)||started<=0||now-started<VOICE_WAIT_FOR_SPEECH_MS-600)
    return "too_soon";
  return (state[VOICE_NO_ANSWER_KEY]||0)>=1?"end":"repeat";
}
