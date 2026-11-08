import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomInt, randomUUID, timingSafeEqual, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  FIELDS,FIELD_MAP,freshProfile,freshStates,getLanguage,getPath,setPath,normalizeField,nextQuestion,reconcileFieldStates,
  missingRequired,allFieldsResolved,percentComplete,safeHistory,localized,inferCandidateGender,
  type ChatMessage,type FieldStates,type Phase,type Profile,type SessionData,type Lang
} from "./fields.js";
import { extract,interview,openRouterConfigured,transcribeAudio,cleanProfileValue } from "./llm.js";
import { renderBiodataJpeg,BIODATA_WIDTH,BIODATA_HEIGHT } from "./biodata.js";
import {
  VOICE_MAX_DURATION_MS,VOICE_STARTED_KEY,VOICE_ALLOWED_OFF_TOPIC,
  unrelatedCount,countVoiceReply,voiceCallExpired,isVoiceRepeatRequest,isVoiceAlreadyProvided,
  VOICE_WAIT_STARTED_KEY,VOICE_NO_ANSWER_KEY,voiceNoAnswerDecision
} from "./voice-policy.js";

const PHONE=/^\+[1-9]\d{7,14}$/;
const VERIFY_REGEX=/\bABC\s+VERIFY\s+(\d{6})\b/i;
const PIN=/^\d{4,6}$/;
const NEW_PIN=/^\d{4}$/;
const MAX_MESSAGES=110;
type Draft=SessionData&{draftNonce:string;phone:string|null;visible:boolean;createdAt:Date;updatedAt:Date};
function normalizePhone(input:string){
  const x=input.replace(/[\s()\-]/g,"");
  if(!PHONE.test(x))throw new Error("Enter a full mobile number with country code, for example +91...");
  return x;
}
function safeEq(a:string,b:string){
  const ba=Buffer.from(a);const bb=Buffer.from(b);
  return ba.length===bb.length&&timingSafeEqual(ba,bb);
}
function readDraft(x:any):Draft {
  return {
    id:x.id,phase:x.phase as Phase,profile:x.profile as Profile,
    fieldStates:reconcileFieldStates(x.profile as Profile,(x.fieldStates||{}) as FieldStates),
    messages:(x.messages||[]) as ChatMessage[],
    currentQuestion:x.currentQuestion,declines:(x.declines||{}) as Record<string,number>,
    lastClass:null,reviewConfirmed:x.reviewConfirmed,version:x.version,draftNonce:x.draftNonce,
    phone:x.phone,visible:x.visible,createdAt:x.createdAt,updatedAt:x.updatedAt
  };
}
// The profile and field statuses, never historical assistant text, are the
// authority for the question currently allowed to be spoken.
function activeQuestion(d:Draft){
  if(d.phase!=="COLLECTING")return null;
  const deferred=new Set(Object.keys(d.declines).filter(path=>
    FIELD_MAP.has(path)&&d.declines[path]>=3&&d.fieldStates[path]!=="answered"));
  return nextQuestion(d.profile,d.fieldStates,deferred);
}
function client(d:Draft){
  const q=activeQuestion(d);
  return {id:d.id,phase:d.phase,profile:d.profile,fieldStates:d.fieldStates,messages:d.messages,
    currentQuestion:q?.path??null,currentQuestionText:q?.ask[getLanguage(d.profile)]??null,
    currentQuestionTargets:q?.targetPaths??(q?[q.path]:[]),
    progress:percentComplete(d.fieldStates),
    missingRequired:missingRequired(d.fieldStates),reviewConfirmed:d.reviewConfirmed,
    phone:d.phone,visible:d.visible,version:d.version};
}
function note(role:"user"|"assistant",text:string,field?:string):ChatMessage{return {role,text,at:new Date().toISOString(),field};}
function requiredSummary(d:Draft){
  const r=missingRequired(d.fieldStates);
  return {ready:r.length===0 && allFieldsResolved(d.fieldStates),remaining:r};
}
function setupComplete(p:Profile){
  return Boolean(p.registration?.preferred_language&&p.registration?.looking_for&&p.registration?.profile_for&&
    (p.registration.profile_for!=="relative"||p.registration.registrant_relationship_to_candidate)&&p.candidate?.marital_status&&["chat","voice"].includes(p.registration.onboarding_mode));
}
function shortMessage(text:string){return text.trim().slice(0,460);}
function perKeyThrottle(){
  const map=new Map<string,{count:number;until:number}>();
  return (key:string,max:number,windowMs:number)=>{
    const now=Date.now();const row=map.get(key);
    if(!row||row.until<now){map.set(key,{count:1,until:now+windowMs});return true;}
    if(row.count>=max)return false;
    row.count++;return true;
  };
}
const throttle=perKeyThrottle();

export async function registerAbcRoutes(app:FastifyInstance){
  async function requireDraft(request:FastifyRequest):Promise<Draft|null>{
    try{
      await request.jwtVerify();
      if(request.user.scope==="abc_member"){
        const acc=await prisma.abcAccount.findUnique({where:{id:request.user.userId},include:{registration:true}});
        return acc?readDraft(acc.registration):null;
      }
      if(request.user.scope!=="abc_draft"||!request.user.abcNonce)return null;
      const item=await prisma.abcRegistration.findUnique({where:{id:request.user.userId}});
      if(!item||item.draftNonce!==request.user.abcNonce||item.phase==="COMPLETE")return null;
      return readDraft(item);
    }catch{return null;}
  }
  async function requireAccount(request:FastifyRequest){
    try{
      await request.jwtVerify();
      if(request.user.scope!=="abc_member")return null;
      return await prisma.abcAccount.findUnique({where:{id:request.user.userId},include:{registration:true}});
    }catch{return null;}
  }
  async function store(d:Draft,changes:Partial<Draft>) {
    const profile=changes.profile??d.profile;
    const states=reconcileFieldStates(profile,changes.fieldStates??d.fieldStates);
    const declines=changes.declines??d.declines;
    const deferred=new Set(Object.keys(declines).filter(path=>
      FIELD_MAP.has(path)&&declines[path]>=3&&states[path]!=="answered"));
    const canonical=nextQuestion(profile,states,deferred);
    const currentQuestion=changes.currentQuestion!==undefined?changes.currentQuestion:
      changes.profile!==undefined||changes.fieldStates!==undefined?canonical?.path??null:d.currentQuestion;
    const updated=await prisma.abcRegistration.updateMany({
      where:{id:d.id,version:d.version},
      data:{
        ...(changes.phase!==undefined?{phase:changes.phase}:{}),
        ...(changes.profile!==undefined?{profile:changes.profile as any}:{}),
        fieldStates:states as any,
        ...(changes.messages!==undefined?{messages:changes.messages as any}:{}),
        ...(changes.declines!==undefined?{declines:changes.declines as any}:{}),
        currentQuestion,
        ...(changes.reviewConfirmed!==undefined?{reviewConfirmed:changes.reviewConfirmed}:{}),
        ...(changes.phone!==undefined?{phone:changes.phone}:{}),
        ...(changes.visible!==undefined?{visible:changes.visible}:{}),
        version:{increment:1}
      }
    });
    if(updated.count!==1)throw new Error("Your profile changed on another device. Refresh and try again.");
    return readDraft(await prisma.abcRegistration.findUniqueOrThrow({where:{id:d.id}}));
  }
  function authError(reply:FastifyReply){return reply.code(401).send({error:"ABC session expired. Please sign in or resume registration."});}
  function validationError(reply:FastifyReply,error:unknown){
    return reply.code(400).send({error:error instanceof Error?error.message:"Invalid request"});
  }
  app.get("/health",async()=>({
    ok:true,service:"abbasi-bahishti-connections",aiConfigured:openRouterConfigured(),
    smsConfigured:Boolean(process.env.ABC_SMS_NUMBER&&process.env.ABC_SMS_WEBHOOK_SECRET),
    model:process.env.ABC_OPENROUTER_MODEL||"google/gemini-3.1-flash-lite",
    voiceContract:"canonical-question-v2"
  }));

  // An early, rate-limited duplicate-number check, before verification or PIN.
  app.post("/phone/check",async(request,reply)=>{
    const body=z.object({phone:z.string().trim().max(30)}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Enter a valid mobile number"});
    let phone:string;try{phone=normalizePhone(body.data.phone);}catch(e){return validationError(reply,e);}
    if(!throttle("abc-phone-check:"+request.ip,50,60*60*1000))
      return reply.code(429).send({error:"Too many number checks. Please try later."});
    const existing=await prisma.abcAccount.findUnique({where:{phone},select:{id:true}});
    return {registered:Boolean(existing)};
  });

  // Early account creation for the redesigned ABC flow.
  // "Continue" on the phone screen is intentionally a demo step, not SMS verification.
  // phoneVerified remains FALSE until a real receiving gateway confirms ownership.
  app.post("/signup",async(request,reply)=>{
    const body=z.object({phone:z.string().trim().max(30),pin:z.string().regex(NEW_PIN)}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Enter a phone number and exactly four PIN digits"});
    let phone:string;try{phone=normalizePhone(body.data.phone);}catch(e){return validationError(reply,e);}
    if(!throttle("abc-register:"+request.ip,12,60*60*1000))
      return reply.code(429).send({error:"Too many signups from this connection. Try again later."});
    if(await prisma.abcAccount.findUnique({where:{phone}}))
      return reply.code(409).send({error:"This number is already registered. Please sign in."});
    const profile=freshProfile();
    const states=freshStates();
    const pinHash=await bcrypt.hash(body.data.pin,12);
    try{
      const account=await prisma.$transaction(async tx=>{
        const registration=await tx.abcRegistration.create({data:{
          phone,phase:"COLLECTING",profile:profile as any,fieldStates:states as any,
          messages:[] as any,declines:{} as any,currentQuestion:null
        }});
        return tx.abcAccount.create({data:{registrationId:registration.id,phone,
          pinHash,phoneVerified:false}});
      },{maxWait:12000,timeout:30000});
      const token=app.jwt.sign({userId:account.id,scope:"abc_member"},{expiresIn:"14d"});
      return reply.code(201).send({token,member:{id:account.id,phone:account.phone,phoneVerified:false},
        session:client(readDraft(await prisma.abcRegistration.findUniqueOrThrow({where:{id:account.registrationId}}))),
        verificationMode:"DEMO_UNVERIFIED"});
    }catch(e){
      request.log.warn({reason:String(e).slice(0,140)},"ABC early account signup rejected");
      return reply.code(409).send({error:"Account already exists for this number. Try signing in."});
    }
  });

  app.post("/start",async(request,reply)=>{
    if(!throttle("abc-start:"+request.ip,40,60*60*1000))return reply.code(429).send({error:"Too many new registrations. Please try later."});
    const profile=freshProfile(),states=freshStates();
    const created=await prisma.abcRegistration.create({data:{
      profile:profile as any,fieldStates:states as any,messages:[] as any,declines:{} as any,phase:"COLLECTING"
    }});
    const token=app.jwt.sign({userId:created.id,scope:"abc_draft",abcNonce:created.draftNonce},{expiresIn:"30d"});
    return reply.code(201).send({token,session:client(readDraft(created))});
  });
  app.get("/state",async(request,reply)=>{
    const d=await requireDraft(request);if(!d)return authError(reply);
    return {session:client(d),setupComplete:setupComplete(d.profile)};
  });
  app.delete("/draft",async(request,reply)=>{
    const d=await requireDraft(request);if(!d)return authError(reply);
    await prisma.abcRegistration.delete({where:{id:d.id}});
    return {ok:true};
  });
  // Live voice sessions are paid, authenticated, short-lived and created on the
  // server. The OpenAI API key is NEVER returned to the Android application.
  app.post("/live/connect",async(request,reply)=>{
    const draft=await requireDraft(request);
    if(!draft)return authError(reply);
    if(draft.phase!=="COLLECTING"||!setupComplete(draft.profile)||
      draft.profile.registration.onboarding_mode!=="voice")
      return reply.code(409).send({error:"Choose Voice Call during onboarding first"});
    if(unrelatedCount(draft.declines)>VOICE_ALLOWED_OFF_TOPIC)
      return reply.code(409).send({error:"Voice Call ended after five unrelated replies. Continue in Chat."});
    const body=z.object({sdp:z.string().min(30).max(24000)}).safeParse(request.body);
    if(!body.success||!/^v=0\r?\n/m.test(body.data.sdp))
      return reply.code(400).send({error:"Invalid audio connection offer"});
    if(!throttle("abc-live:"+draft.id,5,60*60*1000)||
       !throttle("abc-live-ip:"+request.ip,20,60*60*1000))
      return reply.code(429).send({error:"Voice call limit reached. Please use Chat for now."});
    const apiKey=process.env.OPENAI_API_KEY;
    if(!apiKey)return reply.code(503).send({error:"Voice Call is not configured on this server. Use Chat for now."});
    const lang=getLanguage(draft.profile);
    const initial=activeQuestion(draft)?.ask[lang]||"Tell me about yourself.";
    const instructions=[
      "You are the spoken interviewer for ABC Abbasi Bahishti Connections, a matrimonial profile application.",
      lang==="en"?"Speak clear, natural Indian English.":"Speak conversational Hindustani naturally, mixing familiar Hindi, Urdu and English. Do not speak code, field names or JSON.",
      "Follow the registered ABC questionnaire exactly. You are ONLY the VOICE and LISTENING interface; the trusted ABC backend makes every decision and saves profile facts.",
      "Keep every spoken reply brief: at most two short sentences, ideally one question. Never speak more than 35 words at once.",
      "Never independently answer off-topic requests or repeat a question. Delegate every user utterance to the backend, which supplies the authorized reply.",
      "Every full user turn, INCLUDING off-topic distractions, MUST be delegated to the ABC backend for classification. The backend, not you, counts unrelated turns. On the fifth such attempt the call must end. Do not debate the limit.",
      "The entire interview is capped at four minutes. The backend repeats a question only once if speech does not begin within 15 seconds, then pauses. Do not independently repeat, remind or count down.",
      "When the application sends session.commentary.append, its content is the sole authorized next question. Speak that question briefly, once, without reading tool metadata or instructions aloud, and then wait.",
      "Backchannel policy: None. Do not produce listening noises, fillers or affirmations while the user speaks.",
      "Interruption policy: Stop talking immediately if the user begins speaking. Never compete with their voice. Wait patiently through pauses and self-corrections.",
      "Delegation policy: Backend tools: ABC validates and saves the entire spoken answer, decides whether the speaker was off-topic, and returns the one authorized next question.",
      "Generate <|SpawnThinking|> on EVERY completed user answer, correction, repeat request or off-topic remark before speaking again. Never answer from your own knowledge. Remain silent while the backend processes the answer.",
      "Do not generate <|SpawnThinking|> merely because a speaker pauses mid-answer. Wait until they are finished.",
      "Do not mistake music, coughs or nearby conversations for instructions.",
      "On connecting, remain silent until a session.commentary.append event supplies the first question. The authorized opening question is: "+initial,
      "After EVERY complete user answer, delegate to the client backend for validation and the next question. Never decide which information has been saved yourself.",
      "Wait for the backend update before speaking again. Speak only its exact authorized next question or response, once.",
      "A request to repeat, a complaint that a question was already answered, or a correction must be delegated. Never independently repeat any question. Handle natural interruptions.",
      "When backend confirms the profile is ready, thank the person and say they can review their answers on screen.",
      "If the user says stop, ask them to use End Call and tell them their answers are saved.",
      "Do not request passwords, OTPs, PINs or Aadhaar details.",
    ].join("\n");
    try{
      const response=await fetch("https://api.openai.com/v1/live/sessions",{
        method:"POST",
        headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json",
          "OpenAI-Safety-Identifier":createHash("sha256").update(draft.id).digest("hex").slice(0,40)},
        body:JSON.stringify({
          session:{model:"gpt-live-1",instructions,
            audio:{output:{voice:lang==="en"?"marin":"nira"}},
            delegation:{type:"client",acknowledgement_delay_ms:800},store:false},
          transport:{type:"webrtc",sdp:body.data.sdp}
        }),
        signal:AbortSignal.timeout(22000)
      });
      const payload:any=await response.json().catch(()=>({}));
      if(!response.ok||typeof payload?.transport?.sdp!=="string"||!payload?.session?.id){
        request.log.warn({status:response.status,reason:String(payload?.error?.message||"live unavailable").slice(0,250)},"ABC voice connection refused");
        return reply.code(503).send({error:"Voice connection unavailable. Try again or choose Chat."});
      }
      // Starting a new call starts the hard deadline on the server as well.
      // Preserve the accumulated off-topic count across resumed calls.
      try{
        const saved=await store(draft,{declines:{...draft.declines,[VOICE_STARTED_KEY]:Date.now()}});
        return {sessionId:payload.session.id,answer:payload.transport.sdp,
          session:client(saved),maxDurationMs:VOICE_MAX_DURATION_MS};
      }catch{
        return reply.code(409).send({error:"Your profile changed while connecting. Please retry the call."});
      }
    }catch(e){
      request.log.warn({reason:String(e).slice(0,160)},"ABC voice connection error");
      return reply.code(503).send({error:"Voice connection timed out. Use Chat or try again."});
    }
  });

  // The app reports only confirmed question playback and timeout. The
  // backend owns the repeat count, stored profile and final pause decision.
  app.post("/live/wait",async(request,reply)=>{
    const d=await requireDraft(request);if(!d)return authError(reply);
    const current=activeQuestion(d);
    if(d.profile.registration.onboarding_mode!=="voice"||!current)
      return reply.code(409).send({error:"No active voice question"});
    const parsed=z.object({action:z.enum(["ready","timeout"]),
      version:z.number().int().nonnegative(),questionPath:z.string().max(150)}).safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"Invalid voice timer event"});
    if(parsed.data.version!==d.version||parsed.data.questionPath!==current.path)
      return reply.code(409).send({error:"Voice question changed. Refresh and retry."});
    if(voiceCallExpired(d.declines))return reply.code(409).send({error:"Voice Call reached four minutes."});
    const lang=getLanguage(d.profile);
    const question=current.ask[lang];
    if(parsed.data.action==="ready"){
      const updated=await store(d,{declines:{...d.declines,[VOICE_WAIT_STARTED_KEY]:Date.now()}});
      return {session:client(updated),action:"wait",question};
    }
    const decision=voiceNoAnswerDecision(d.declines);
    if(decision==="too_soon")return {session:client(d),action:"wait",question};
    if(decision==="repeat"){
      const updated=await store(d,{declines:{...d.declines,
        [VOICE_NO_ANSWER_KEY]:1,[VOICE_WAIT_STARTED_KEY]:0}});
      return {session:client(updated),action:"repeat",question};
    }
    const updated=await store(d,{phase:"PAUSED",declines:{...d.declines,[VOICE_WAIT_STARTED_KEY]:0},
      messages:safeHistory([...d.messages,note("assistant",
        localized(lang,"No answer was heard. Your progress is saved.",
          "Jawaab nahi mila. Aapki progress save hai.","آپ کے جواب محفوظ ہیں۔",
          "Jawaab nahi mila. Aapki progress save hai."))])});
    return {session:client(updated),action:"end",reason:"silence"};
  });

  app.post("/choice",async(request,reply)=>{
    const d=await requireDraft(request);if(!d)return authError(reply);
    if(d.phase!=="COLLECTING")return reply.code(409).send({error:"The interview is not collecting answers"});
    const body=z.object({field:z.enum(["preferred_language","looking_for","profile_for","candidate_consent_confirmed","registrant_relationship_to_candidate","marital_status","onboarding_mode"]),value:z.union([z.string().max(100),z.boolean()])}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Invalid selection"});
    const {field,value}=body.data;const p=structuredClone(d.profile),reg=p.registration;
    const states={...d.fieldStates};
    const allowed:Record<string,unknown[]>={
      preferred_language:["en","hi","ur","roman"],looking_for:["bride","groom"],
      profile_for:["self","relative"],candidate_consent_confirmed:[true,false],
      marital_status:["never married","divorced","widowed","separated","annulled","other"],onboarding_mode:["chat","voice"]
    };
    if(field in allowed&&!allowed[field].includes(value))return reply.code(400).send({error:"Invalid selection"});
    if(field==="registrant_relationship_to_candidate"&&(typeof value!=="string"||value.trim().length<2))return reply.code(400).send({error:"Describe your relationship"});
    let normalizedChoice=value;
    if(field==="registrant_relationship_to_candidate"){
      try{normalizedChoice=(await cleanProfileValue(value,"script","Registrant relationship")).value as string;}
      catch{return reply.code(503).send({error:"Please re-enter the relationship in Roman letters."});}
    }
    if(field==="profile_for"&&!reg.looking_for)return reply.code(409).send({error:"Choose bride or groom first"});
    if(field==="candidate_consent_confirmed"&&reg.profile_for!=="relative")return reply.code(400).send({error:"Consent selection is for relative registrations"});
    if(field==="marital_status"){
      if(!reg.looking_for||!reg.profile_for)return reply.code(409).send({error:"Finish initial choices first"});
      p.candidate.marital_status=value;
      states["candidate.marital_status"]="answered";
    }else reg[field]=normalizedChoice;
    if(field==="looking_for"&&states["candidate.gender"]!=="answered"){
      p.candidate.gender=inferCandidateGender(value as "bride"|"groom");
      states["candidate.gender"]="answered";
    }
    if(field==="preferred_language")reg.preferred_script=value;
    if(field==="profile_for"&&value==="self")reg.candidate_consent_confirmed=true;
    const next=setupComplete(p)?nextQuestion(p,states):null;
    const msgs=[...d.messages];
    if(next&&!d.currentQuestion)msgs.push(note("assistant",next.ask[getLanguage(p)],next.path));
    const changed=await store(d,{profile:p,fieldStates:states,messages:safeHistory(msgs),currentQuestion:next?.path??null});
    return {session:client(changed),setupComplete:setupComplete(p)};
  });
  app.post("/reply",async(request,reply)=>{
    const d=await requireDraft(request);if(!d)return authError(reply);
    const body=z.object({text:z.string().trim().min(1).max(1500),
      version:z.number().int().nonnegative(),
      voiceTurnId:z.string().regex(/^[A-Za-z0-9_-]{12,96}$/).optional()}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Enter an answer (up to 1500 characters)"});
    const turnKey=body.data.voiceTurnId&&d.profile.registration.onboarding_mode==="voice"?
      "__abc_voice_turn_"+createHash("sha256").update(body.data.voiceTurnId).digest("hex").slice(0,16):null;
    // Idempotent retries must work even when the first attempt completed the
    // interview, and before checking the caller's now-stale version.
    if(turnKey&&d.declines[turnKey]===1)
      return {session:client(d),duplicate:true,voiceDistractionCount:unrelatedCount(d.declines),
        changesAccepted:0};
    const current=activeQuestion(d);
    if(d.phase!=="COLLECTING"||!setupComplete(d.profile)||!current)
      return reply.code(409).send({error:"Complete your initial choices first"});
    const target=current.path;
    if(body.data.version!==d.version)return reply.code(409).send({error:"This interview has changed. Refresh and retry."});
    if(d.profile.registration.onboarding_mode==="voice"&&voiceCallExpired(d.declines))
      return reply.code(409).send({error:"The four-minute voice call has ended. Continue in Chat.",
        voiceTermination:"time_limit"});
    if(d.messages.length>=MAX_MESSAGES)return reply.code(429).send({error:"Interview limit reached. Please contact support."});
    if(!throttle("abc-reply:"+d.id,14,60*1000))return reply.code(429).send({error:"Too many replies. Please wait a moment."});
    const lang=getLanguage(d.profile),userText=body.data.text;
    const isVoice=d.profile.registration.onboarding_mode==="voice";
    const wasAlreadyProvided=isVoice&&isVoiceAlreadyProvided(userText);
    if(isVoice&&isVoiceRepeatRequest(userText)){
      // Repeat requests are legitimate interviewing controls, not distractions.
      // Preserve the current question without sending an extra extraction call.
      const question=current.ask[lang];
      const repeats={...d.declines};
      if(turnKey)repeats[turnKey]=1;
      const saved=await store(d,{declines:repeats,messages:safeHistory([...d.messages,
        note("user",userText,target),note("assistant",shortMessage(question),target)])});
      return {session:client(saved),changesAccepted:0,classification:"REPEAT",
        voiceDistractionCount:unrelatedCount(d.declines),voiceTermination:null};
    }
    const context={profile:d.profile,fieldStates:d.fieldStates,currentQuestion:target,recent:d.messages,language:lang};
    // A complaint that this was already said is a request to recover earlier
    // user facts, NOT a new invalid answer. Re-examine only user utterances.
    const priorUserText=d.messages.filter(m=>m.role==="user").slice(-12)
      .map(m=>m.text).join("\n").slice(-1150);
    const extractionText=wasAlreadyProvided&&priorUserText?
      (priorUserText+"\n"+userText).slice(-1500):userText;
    let extracted;
    try{
      extracted=wasAlreadyProvided&&!priorUserText?
        {classification:"VALID" as const,changes:[],declined_fields:[],unknown_fields:[],clarification:"",off_topic:false}:
        await extract(context,extractionText);
      // The intent has already been recognized by the application. Do not let
      // an extractor classification turn a legitimate objection into a strike.
      if(wasAlreadyProvided){extracted.classification="VALID";extracted.off_topic=false;}
    }catch(e){request.log.warn({type:"abc_extraction",reason:String(e).slice(0,150)},"ABC AI unavailable");return reply.code(503).send({error:"ABC interview is temporarily unavailable. Your last answer was not lost; please retry."});}
    let profile=d.profile;
    const states={...d.fieldStates};
    let declines={...d.declines};
    if(isVoice){
      declines[VOICE_WAIT_STARTED_KEY]=0;
      declines[VOICE_NO_ANSWER_KEY]=0;
      if(turnKey)declines[turnKey]=1;
    }
    let voiceDistractionCount=isVoice?unrelatedCount(declines):0;
    let endForDistractions=false;
    if(isVoice){
      const strike=countVoiceReply(declines,extracted);
      declines=strike.next;
      voiceDistractionCount=strike.count;
      endForDistractions=strike.end;
    }
    let count=0,issue="";
    for(const change of extracted.changes){
      if(!FIELD_MAP.has(change.path)||change.confidence==="LOW")continue;
      // Recover only missing details. Old conversation must not silently
      // overwrite corrected or already validated profile values.
      if(wasAlreadyProvided&&states[change.path]==="answered")continue;
      const evidence=change.evidence.trim();
      if(!evidence||!extractionText.toLocaleLowerCase().includes(evidence.toLocaleLowerCase()))continue;
      let value:unknown;try{value=JSON.parse(change.value_json);}catch{
        // Models often send literal text instead of a JSON-escaped string inside value_json.
        // Safe for text-only fields; arrays and numbers must remain parseable JSON.
        const kind=FIELD_MAP.get(change.path)?.kind;
        if(["text","education_description","gender","marital"].includes(kind||""))value=change.value_json;
        else continue;
      }
      try{
        const normalized=await cleanProfileValue(value,"script",FIELD_MAP.get(change.path)?.label||change.path);
        value=normalized.value;
        if(normalized.uncertain&&(change.path.endsWith(".name")||change.path==="candidate.full_name")){
          if(change.path===target)issue="Please confirm the Roman spelling of this name";
          continue;
        }
      }catch(error){
        request.log.warn({reason:String(error).slice(0,160)},"ABC profile romanization failed");
        return reply.code(503).send({error:"Please review this answer's Roman spelling and retry."});
      }
      const valid=normalizeField(change.path,value);
      if(!valid.ok){if(change.path===target)issue=valid.error;continue;}
      profile=setPath(profile,change.path,valid.value);
      states[change.path]=valid.complete?"answered":"needs_clarification";
      if(valid.complete)declines[change.path]=0;
      count++;
    }
    // Never put a person in the same-question loop after they objected.
    // If history contains no verifiable answer, defer the specific field
    // without marking it answered; other questions can continue.
    if(wasAlreadyProvided&&states[target]!=="answered")
      declines[target]=Math.max(3,declines[target]||0);
    if(target&&!count&&!wasAlreadyProvided){
      if(extracted.declined_fields.includes(target)||extracted.classification==="DECLINED"){
        if(FIELD_MAP.get(target)?.required){
          declines[target]=(declines[target]||0)+1;issue="This information is required to complete your ABC profile";
          states[target]="needs_clarification";
        }else{states[target]="declined";}
      }else if(extracted.unknown_fields.includes(target)||extracted.classification==="UNKNOWN"){
        if(FIELD_MAP.get(target)?.allowUnknown)states[target]="unknown";
        else if(FIELD_MAP.get(target)?.required){states[target]="needs_clarification";issue="We need a clear answer for this required field";}
        else states[target]="unknown";
      }else if(extracted.classification==="PAUSE"||extracted.classification==="STOP"){
        const p=await store(d,{phase:"PAUSED",declines,
          messages:safeHistory([...d.messages,note("user",userText),note("assistant",localized(lang,
            "Your progress is saved. You can resume when ready.","Aapke jawaab save hain.",
            "آپ کے جواب محفوظ ہیں۔","Aapke jawaab save hain."))])});
        return {session:client(p)};
      }else issue=extracted.clarification||issue||(extracted.off_topic||extracted.classification==="OFF_TOPIC"?"Let's continue with your profile":"Please give a clear answer");
    }
    // Deferred required fields remain incomplete, but do not consume endless AI calls.
    const nonresponsive=!wasAlreadyProvided&&!count&&(extracted.off_topic||
      ["OFF_TOPIC","INVALID","PARTIALLY_OFF_TOPIC"].includes(extracted.classification));
    if(target&&nonresponsive)declines[target]=(declines[target]||0)+1;
    const deferred=new Set(Object.keys(declines).filter(path=>
      FIELD_MAP.has(path)&&declines[path]>=3&&states[path]!=="answered"));
    const complete=missingRequired(states).length===0&&allFieldsResolved(states);
    const available=complete?null:nextQuestion(profile,states,deferred);
    const blocked=!complete&&!available;
    const phase:Phase=blocked?"BLOCKED_REQUIRED":complete?"REVIEW":"COLLECTING";
    const next=phase==="COLLECTING"?available:null;
    const directive=blocked?"BLOCKED":complete?"READY":
      target&&(declines[target]||0)===1&&extracted.classification==="DECLINED"?"REQUIRED_REFUSAL":
      next?.path===target?"RETRY":"ASK";
    const history=[...d.messages,note("user",userText,target)];
    let message:string;
    if(phase==="REVIEW")message=localized(lang,"Your profile is ready to review.","Aapki profile tayyar hai.","آپ کی پروفائل تیار ہے۔","Profile tayyar hai. Ek baar check kar lein.");
    else if(phase==="BLOCKED_REQUIRED")message=localized(lang,
      "Some essential answers are still missing. Your progress is saved. Resume to complete them.",
      "Kuch zaroori jawab reh gaye hain. Aapke jawab save hain.",
      "کچھ ضروری جواب باقی ہیں۔ آپ کی پیش رفت محفوظ ہے۔",
      "Kuch zaroori jawab reh gaye hain. Aapke jawab save hain. Baad mein poora karein.");
    else if(next){
      // Routine questions come from the fixed question bank, saving an LLM call.
      message=next.ask[lang];
      if(next.path===target&&issue)message=issue+". "+message;
      if(wasAlreadyProvided&&next.path!==target){
        const prefix=count>0?
          localized(lang,"I found the earlier information. ","Aapka pehle diya hua jawab mil gaya. ",
            "Aapka pehle diya hua jawab mil gaya. ","Pehle diya hua jawab mil gaya. "):
          localized(lang,"I could not verify that earlier detail, so I will leave it for now. ",
            "Pehla jawab pakka nahi mil saka, abhi isse chhodte hain. ",
            "Pehla jawab pakka nahi mil saka, abhi isse chhodte hain. ",
            "Pehla jawab pakka nahi mil saka, abhi isse chhodte hain. ");
        message=prefix+message;
      }
      if(!count&&extracted.classification==="AMBIGUOUS"){
        const talk=await interview({ctx:{profile,fieldStates:states,currentQuestion:next.path,recent:history,language:lang},
          next,directive,validationIssue:issue||extracted.clarification,latestUserMessage:userText});
        message=talk.message;
      }
    }else message="Your answers are saved.";
    if(endForDistractions){
      // The fifth unrelated reply terminates voice mode, without deleting any
      // correctly extracted answer, or modifying the current questionnaire.
      profile=structuredClone(profile);
      profile.registration.onboarding_mode="chat";
      message=localized(lang,
        "Voice Call ended after five unrelated replies. Your answers are saved. Continue in Chat.",
        "Paanch baar topic badalne par voice call khatam ho gayi. Jawaab save hain. Chat se jaari rakhein.",
        "پانچ غیر متعلقہ جوابوں کے بعد وائس کال ختم ہوئی۔ آپ کے جواب محفوظ ہیں۔ چیٹ سے جاری رکھیں۔",
        "Paanch baar topic badalne par voice call khatam ho gayi. Jawaab save hain. Chat se jaari rakhein.");
    }
    history.push(note("assistant",shortMessage(message),next?.path));
    try{
      const saved=await store(d,{phase,profile,fieldStates:states,declines,currentQuestion:next?.path??null,messages:safeHistory(history)});
      return {session:client(saved),changesAccepted:count,classification:extracted.classification,
        ...(isVoice?{authorizedVoiceReply:shortMessage(message),voiceDistractionCount,
          voiceTermination:endForDistractions?"off_topic_limit":null}:{})};
    }catch(e){return reply.code(409).send({error:String(e).slice(0,200)});}
  });
  app.post("/skip",async(request,reply)=>{
    const d=await requireDraft(request);if(!d)return authError(reply);
    const active=activeQuestion(d);
    if(d.phase!=="COLLECTING"||!active)return reply.code(409).send({error:"There is no active question"});
    const body=z.object({version:z.number().int()}).safeParse(request.body);
    if(!body.success||body.data.version!==d.version)return reply.code(409).send({error:"Refresh your interview before skipping"});
    const current=active.path,def=FIELD_MAP.get(current)!;
    const states={...d.fieldStates},declines={...d.declines};
    let phase:Phase="COLLECTING",msg="";
    if(def.required){
      declines[current]=(declines[current]||0)+1;
      if(declines[current]>=3){
        msg="We will return to this essential answer later.";
      }else msg="This information is required to complete your profile. Please answer so we can continue.";
      states[current]="needs_clarification";
    }else{states[current]="declined";}
    const deferred=new Set(Object.keys(declines).filter(path=>FIELD_MAP.has(path)&&declines[path]>=3));
    const next=nextQuestion(d.profile,states,deferred);
    if(!next)phase="BLOCKED_REQUIRED";
    if(next)msg=next.ask[getLanguage(d.profile)];
    else msg="Essential answers remain. Your progress is saved. Resume when you are ready.";
    const saved=await store(d,{fieldStates:states,declines,phase,currentQuestion:next?.path??null,
      messages:safeHistory([...d.messages,note("user","Prefer not to say",current),note("assistant",msg,next?.path)])});
    return {session:client(saved)};
  });
  app.post("/resume",async(request,reply)=>{
    const d=await requireDraft(request);if(!d)return authError(reply);
    if(!["PAUSED","BLOCKED_REQUIRED"].includes(d.phase))return reply.code(409).send({error:"Interview is not paused"});
    const next=nextQuestion(d.profile,d.fieldStates);
    const msg=next?next.ask[getLanguage(d.profile)]:localized(getLanguage(d.profile),"Your profile is ready.","Profile tayyar hai.","پروفائل تیار ہے۔","Profile tayyar hai.");
    const saved=await store(d,{phase:next?"COLLECTING":"REVIEW",currentQuestion:next?.path??null,
      declines:{...d.declines,[next?.path||""]:0},messages:safeHistory([...d.messages,note("assistant",msg,next?.path)])});
    return {session:client(saved)};
  });
  app.post("/edit",async(request,reply)=>{
    const d=await requireDraft(request);if(!d)return authError(reply);
    if(!["COLLECTING","REVIEW","VERIFY_PHONE","COMPLETE"].includes(d.phase))return reply.code(409).send({error:"Profile cannot be edited now"});
    const body=z.object({path:z.string(),value:z.unknown()}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Invalid edit"});
    let cleanedValue:unknown;
    try{cleanedValue=(await cleanProfileValue(body.data.value,"script",FIELD_MAP.get(body.data.path)?.label||body.data.path)).value;}
    catch{return reply.code(503).send({error:"Please check the Roman spelling and retry this edit."});}
    const valid=normalizeField(body.data.path,cleanedValue);
    if(!valid.ok)return reply.code(400).send({error:valid.error});
    const profile=setPath(d.profile,body.data.path,valid.value),states={...d.fieldStates,[body.data.path]:valid.complete?"answered":"needs_clarification" as any};
    const next=nextQuestion(profile,states);
    const complete=missingRequired(states).length===0&&allFieldsResolved(states);
    const phase:Phase=complete?(d.phase==="COMPLETE"?"COMPLETE":"REVIEW"):"COLLECTING";
    const saved=await store(d,{profile,fieldStates:states,phase,currentQuestion:next?.path??null,
      reviewConfirmed:complete&&d.reviewConfirmed});
    return {session:client(saved)};
  });
  app.post("/review",async(request,reply)=>{
    const d=await requireDraft(request);if(!d)return authError(reply);
    if(d.phase!=="REVIEW"||!allFieldsResolved(d.fieldStates)||missingRequired(d.fieldStates).length)return reply.code(409).send({error:"Some required answers are still missing"});
    const body=z.object({confirmed:z.literal(true),candidateConsent:z.boolean()}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Confirm the profile before continuing"});
    if(d.profile.registration.profile_for==="relative"&&!body.data.candidateConsent)return reply.code(400).send({error:"Please confirm you have the candidate's permission"});
    const profile=structuredClone(d.profile);
    profile.registration.candidate_consent_confirmed=body.data.candidateConsent||profile.registration.profile_for==="self";
    const saved=await store(d,{profile,reviewConfirmed:true,phase:request.user.scope==="abc_member"?"COMPLETE":"VERIFY_PHONE"});
    return {session:client(saved)};
  });
  app.post("/verification/start",async(request,reply)=>{
    const d=await requireDraft(request);if(!d)return authError(reply);
    if(d.phase!=="VERIFY_PHONE"||!d.reviewConfirmed)return reply.code(409).send({error:"Confirm your profile first"});
    if(!process.env.ABC_SMS_NUMBER||!process.env.ABC_SMS_WEBHOOK_SECRET)return reply.code(503).send({error:"ABC SMS verification is not configured yet. Your profile is safely saved."});
    const body=z.object({phone:z.string().max(30)}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Enter a mobile number"});
    let phone:string;try{phone=normalizePhone(body.data.phone);}catch(e){return validationError(reply,e);}
    if(!throttle("abc-sms:"+d.id,3,30*60*1000))return reply.code(429).send({error:"Too many verification requests. Please try later."});
    const existing=await prisma.abcAccount.findUnique({where:{phone}});
    if(existing)return reply.code(409).send({error:"This mobile number is already registered"});
    const code=String(randomInt(100000,1000000));
    await prisma.abcSmsChallenge.create({data:{registrationId:d.id,phone,codeHash:await bcrypt.hash(code,10),
      expiresAt:new Date(Date.now()+10*60*1000)}});
    const updated=await store(d,{phone});
    return {session:client(updated),number:process.env.ABC_SMS_NUMBER,message:"ABC VERIFY "+code,expiresInSeconds:600};
  });
  // The gateway must be explicitly configured with an authenticated HTTPS webhook.
  // Inbound SMS is never accepted from unauthenticated callers.
  app.post("/sms/inbound",async(request,reply)=>{
    const secret=process.env.ABC_SMS_WEBHOOK_SECRET;
    if(!secret||secret.length<24)return reply.code(503).send({error:"Gateway not configured"});
    const supplied=String(request.headers.authorization||"").replace(/^Bearer\s+/i,"");
    if(!safeEq(supplied,secret))return reply.code(401).send({error:"Unauthorized gateway"});
    const body=z.object({
      from:z.string().max(30).optional(),phoneNumber:z.string().max(30).optional(),sender:z.string().max(30).optional(),
      message:z.string().max(250).optional(),text:z.string().max(250).optional()
    }).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Invalid SMS payload"});
    let sender:string;try{sender=normalizePhone(body.data.from||body.data.phoneNumber||body.data.sender||"");}catch{return reply.code(400).send({error:"Invalid sender number"});}
    if(!throttle("abc-inbound:"+sender,15,15*60*1000))return reply.code(429).send({error:"Rate limit"});
    const content=body.data.message||body.data.text||"";
    const match=content.match(VERIFY_REGEX);
    if(!match)return {ok:true,matched:false};
    const challenges=await prisma.abcSmsChallenge.findMany({where:{
      phone:sender,purpose:"REGISTER",verifiedAt:null,usedAt:null,expiresAt:{gt:new Date()},attempts:{lt:5}
    },orderBy:{createdAt:"desc"},take:5,include:{registration:true}});
    for(const challenge of challenges){
      if(challenge.registration.phase!=="VERIFY_PHONE")continue;
      await prisma.abcSmsChallenge.update({where:{id:challenge.id},data:{attempts:{increment:1}}});
      if(!await bcrypt.compare(match[1],challenge.codeHash))continue;
      await prisma.$transaction(async tx=>{
        await tx.abcSmsChallenge.update({where:{id:challenge.id},data:{verifiedAt:new Date(),usedAt:new Date()}});
        await tx.abcRegistration.update({where:{id:challenge.registrationId},data:{phase:"SET_PIN",phone:sender}});
      });
      return {ok:true,matched:true};
    }
    return {ok:true,matched:false};
  });
  app.get("/verification/status",async(request,reply)=>{
    const d=await requireDraft(request);if(!d)return authError(reply);
    return {phase:d.phase,verified:d.phase==="SET_PIN",phone:d.phone};
  });
  app.post("/pin/create",async(request,reply)=>{
    const d=await requireDraft(request);if(!d)return authError(reply);
    if(d.phase!=="SET_PIN"||!d.phone)return reply.code(409).send({error:"Verify your mobile number first"});
    const body=z.object({pin:z.string().regex(PIN)}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Enter a six-digit PIN"});
    const checked=await prisma.abcSmsChallenge.findFirst({where:{registrationId:d.id,phone:d.phone,verifiedAt:{not:null}},orderBy:{createdAt:"desc"}});
    if(!checked)return reply.code(403).send({error:"Mobile verification missing"});
    const hash=await bcrypt.hash(body.data.pin,12);
    try{
      const account=await prisma.$transaction(async tx=>{
        const user=await tx.abcAccount.create({data:{registrationId:d.id,phone:d.phone!,pinHash:hash,phoneVerified:true}});
        await tx.abcRegistration.update({where:{id:d.id},data:{phase:"COMPLETE",draftNonce:randomUUID(),reviewConfirmed:true}});
        return user;
      });
      const token=app.jwt.sign({userId:account.id,scope:"abc_member"},{expiresIn:"14d"});
      return reply.code(201).send({token,member:{id:account.id,phone:account.phone},phase:"COMPLETE"});
    }catch{return reply.code(409).send({error:"This phone number or registration is already in use"});}
  });
  app.post("/login",async(request,reply)=>{
    const body=z.object({phone:z.string().max(30),pin:z.string().regex(PIN)}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Enter mobile number and six-digit PIN"});
    let phone:string;try{phone=normalizePhone(body.data.phone);}catch(e){return validationError(reply,e);}
    if(!throttle("abc-login:"+phone,25,15*60*1000))return reply.code(429).send({error:"Too many login attempts"});
    const acc=await prisma.abcAccount.findUnique({where:{phone},include:{registration:true}});
    if(!acc)return reply.code(401).send({error:"Incorrect mobile number or PIN"});
    if(acc.lockedUntil&&acc.lockedUntil>new Date())return reply.code(429).send({error:"Account temporarily locked. Try again later."});
    const match=await bcrypt.compare(body.data.pin,acc.pinHash);
    if(!match){
      const count=acc.failedAttempts+1;
      await prisma.abcAccount.update({where:{id:acc.id},data:{failedAttempts:count,
        lockedUntil:count>=5?new Date(Date.now()+30*60*1000):null}});
      return reply.code(401).send({error:"Incorrect mobile number or PIN"});
    }
    await prisma.abcAccount.update({where:{id:acc.id},data:{failedAttempts:0,lockedUntil:null}});
    const token=app.jwt.sign({userId:acc.id,scope:"abc_member"},{expiresIn:"14d"});
    return {token,member:{id:acc.id,phone:acc.phone,phoneVerified:acc.phoneVerified},phase:acc.registration.phase};
  });
  app.get("/me",async(request,reply)=>{
    const acc=await requireAccount(request);
    if(!acc)return reply.code(401).send({error:"ABC login required"});
    return {member:{id:acc.id,phone:acc.phone,phoneVerified:acc.phoneVerified},profile:acc.registration.profile,
      visible:acc.registration.visible,phase:acc.registration.phase};
  });
  app.post("/publish",async(request,reply)=>{
    const acc=await requireAccount(request);if(!acc)return reply.code(401).send({error:"ABC login required"});
    const body=z.object({visible:z.boolean()}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Choose visibility"});
    const reg=acc.registration;
    if(body.data.visible&&reg.phase!=="COMPLETE")return reply.code(409).send({error:"Finish the interview first"});
    if(body.data.visible&&(!acc.phoneVerified))return reply.code(403).send({error:"SMS verification must be enabled before making your profile public"});
    if(body.data.visible&&!((reg.profile as any)?.registration?.candidate_consent_confirmed))return reply.code(403).send({error:"Candidate consent is required before publishing"});
    await prisma.abcRegistration.update({where:{id:reg.id},data:{visible:body.data.visible}});
    return {visible:body.data.visible};
  });
  app.get("/discover",async(request,reply)=>{
    const acc=await requireAccount(request);if(!acc)return reply.code(401).send({error:"ABC login required"});
    const q=z.object({city:z.string().max(60).optional(),seeking:z.enum(["bride","groom"]).optional()}).safeParse(request.query);
    if(!q.success)return reply.code(400).send({error:"Invalid filter"});
    const records=await prisma.abcRegistration.findMany({where:{phase:"COMPLETE",visible:true,
      account:{isNot:{id:acc.id}}},orderBy:{updatedAt:"desc"},take:70});
    const candidates=records.filter(x=>{
      const p=x.profile as any;
      return (!q.data.city||String(p?.candidate?.current_location?.city||"").toLowerCase().includes(q.data.city.toLowerCase()))
      &&(!q.data.seeking||p?.registration?.looking_for===q.data.seeking);
    }).map(x=>{
      const p=x.profile as any,c=p.candidate;
      return {profileId:x.id,hasPhoto:Boolean(x.photoData),name:c?.full_name,age:c?.age_years,
        gender:c?.gender,city:c?.current_location?.city,height_cm:c?.height_cm,
        education:c?.education?.highest_qualification,occupation:c?.occupation?.profession_or_role,
        introduction:c?.personal_introduction,looking_for:p.registration?.looking_for};
    });
    return {candidates};
  });
  app.post("/interests/:registrationId",async(request,reply)=>{
    const acc=await requireAccount(request);if(!acc)return reply.code(401).send({error:"ABC login required"});
    const id=(request.params as any)?.registrationId;
    if(typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id))return reply.code(400).send({error:"Invalid candidate"});
    const target=await prisma.abcAccount.findUnique({where:{registrationId:id},include:{registration:true}});
    if(!target||!target.registration.visible||target.id===acc.id)return reply.code(404).send({error:"Candidate unavailable"});
    const body=z.object({note:z.string().max(400).default("")}).safeParse(request.body??{});
    if(!body.success)return reply.code(400).send({error:"Interest note too long"});
    const interest=await prisma.abcInterest.upsert({where:{fromId_toId:{fromId:acc.id,toId:target.id}},
      create:{fromId:acc.id,toId:target.id,note:body.data.note},update:{note:body.data.note,status:"PENDING"}});
    return {interest:{id:interest.id,status:interest.status}};
  });
  app.get("/interests",async(request,reply)=>{
    const acc=await requireAccount(request);if(!acc)return reply.code(401).send({error:"ABC login required"});
    const records=await prisma.abcInterest.findMany({where:{OR:[{fromId:acc.id},{toId:acc.id}]},
      include:{from:{include:{registration:true}},to:{include:{registration:true}}},orderBy:{updatedAt:"desc"},take:60});
    return {sent:records.filter(r=>r.fromId===acc.id).map(r=>({id:r.id,status:r.status,note:r.note,name:(r.to.registration.profile as any)?.candidate?.full_name})),
      received:records.filter(r=>r.toId===acc.id).map(r=>({id:r.id,status:r.status,note:r.note,name:(r.from.registration.profile as any)?.candidate?.full_name}))};
  });
  app.patch("/interests/:id",async(request,reply)=>{
    const acc=await requireAccount(request);if(!acc)return reply.code(401).send({error:"ABC login required"});
    const body=z.object({action:z.enum(["ACCEPT","DECLINE","WITHDRAW"])}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Invalid decision"});
    const id=(request.params as any).id;
    const interest=await prisma.abcInterest.findUnique({where:{id}});
    if(!interest)return reply.code(404).send({error:"Interest unavailable"});
    if(body.data.action==="WITHDRAW"&&interest.fromId!==acc.id)return reply.code(403).send({error:"Not your request"});
    if(body.data.action!=="WITHDRAW"&&interest.toId!==acc.id)return reply.code(403).send({error:"Not your incoming interest"});
    const updated=await prisma.abcInterest.update({where:{id},data:{status:body.data.action==="WITHDRAW"?"WITHDRAWN":body.data.action==="ACCEPT"?"ACCEPTED":"DECLINED"}});
    return {id:updated.id,status:updated.status};
  });

  // A fresh PIN is required before deleting the account and all its data.
  // Cascading relations remove photos, interests and SMS challenges.
  app.delete("/account",async(request,reply)=>{
    const acc=await requireAccount(request);
    if(!acc)return reply.code(401).send({error:"ABC sign-in required"});
    const body=z.object({pin:z.string().regex(PIN)}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Enter your account PIN to delete your profile"});
    if(!throttle("abc-delete:"+acc.id,6,15*60*1000))
      return reply.code(429).send({error:"Too many deletion attempts. Please try later."});
    if(!await bcrypt.compare(body.data.pin,acc.pinHash))
      return reply.code(403).send({error:"The PIN is incorrect. Your account has not been deleted."});
    await prisma.abcRegistration.delete({where:{id:acc.registrationId}});
    return {deleted:true};
  });

  // Images are stored separately from JSON so the LLM is never sent photo bytes.
  // The JSON retains only a small pointer and explicit upload status.
  app.post("/photo",async(request,reply)=>{
    const acc=await requireAccount(request);if(!acc)return reply.code(401).send({error:"Sign in to add a photo"});
    const body=z.object({base64:z.string().min(100).max(1250000),mime:z.enum(["image/jpeg","image/png"])}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Choose a JPEG or PNG image smaller than 900 KB"});
    const buffer=Buffer.from(body.data.base64,"base64");
    const isJpeg=buffer.length>=4&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255;
    const isPng=buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    if(buffer.length>930000||buffer.length<100||(body.data.mime==="image/jpeg"&&!isJpeg)||(body.data.mime==="image/png"&&!isPng))
      return reply.code(400).send({error:"This image is unsupported or too large"});
    const dataUri="data:"+body.data.mime+";base64,"+buffer.toString("base64");
    const profile=structuredClone(acc.registration.profile as any);
    profile.candidate.profile_photo={uploaded:true,mime:body.data.mime,updatedAt:new Date().toISOString()};
    profile.registration.photo_prompt_seen=true;
    await prisma.abcRegistration.update({where:{id:acc.registrationId},data:{photoData:dataUri,profile:profile as any,version:{increment:1}}});
    return {ok:true,photo:profile.candidate.profile_photo};
  });
  app.post("/photo/prompt",async(request,reply)=>{
    const acc=await requireAccount(request);if(!acc)return reply.code(401).send({error:"Sign in first"});
    const profile=structuredClone(acc.registration.profile as any);
    profile.registration.photo_prompt_seen=true;
    const saved=await store(readDraft(acc.registration),{profile});
    return {session:client(saved)};
  });
  app.get("/photo",async(request,reply)=>{
    const acc=await requireAccount(request);if(!acc)return reply.code(401).send({error:"Sign in first"});
    const r=await prisma.abcRegistration.findUnique({where:{id:acc.registrationId},select:{photoData:true}});
    return {dataUri:r?.photoData||null};
  });
  app.delete("/photo",async(request,reply)=>{
    const acc=await requireAccount(request);if(!acc)return reply.code(401).send({error:"Sign in first"});
    const profile=structuredClone(acc.registration.profile as any);
    profile.candidate.profile_photo=null;
    await prisma.abcRegistration.update({where:{id:acc.registrationId},data:{photoData:null,profile:profile as any,version:{increment:1}}});
    return {ok:true};
  });
  app.get("/public-photo/:id",async(request,reply)=>{
    const acc=await requireAccount(request);if(!acc)return reply.code(401).send({error:"Sign in first"});
    const id=(request.params as any).id;
    if(typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id))return reply.code(400).send({error:"Invalid profile"});
    const r=await prisma.abcRegistration.findUnique({where:{id},select:{visible:true,phase:true,photoData:true}});
    if(!r||!r.visible||r.phase!=="COMPLETE")return reply.code(404).send({error:"Photo unavailable"});
    return {dataUri:r.photoData||null};
  });

  // This short, private JPEG is generated on demand from the saved database JSON.
  // Include account contact only in the exported JPEG. PIN and verification status stay private.
  app.get("/biodata",async(request,reply)=>{
    const acc=await requireAccount(request);
    if(!acc)return reply.code(401).send({error:"Please log in first"});
    if(!["REVIEW","COMPLETE"].includes(acc.registration.phase))
      return reply.code(409).send({error:"Finish the basic interview before downloading biodata"});
    if(!throttle("abc-biodata:"+acc.id,10,60*1000))
      return reply.code(429).send({error:"Please wait before generating another biodata"});
    const profile=acc.registration.profile as Profile;
    if(profile.registration?.profile_for==="relative"&&!profile.registration.candidate_consent_confirmed)
      return reply.code(403).send({error:"Please confirm that the candidate agreed to this biodata"});
    try{
      const jpeg=await renderBiodataJpeg(profile,acc.registration.photoData,acc.phone);
      return {mimeType:"image/jpeg",filename:"ABC-Biodata.jpg",
        width:BIODATA_WIDTH,height:BIODATA_HEIGHT,base64:jpeg.toString("base64")};
    }catch(error){
      request.log.error({reason:String(error).slice(0,200)},"ABC biodata render error");
      return reply.code(503).send({error:"Biodata is temporarily unavailable. Please try again."});
    }
  });
  // The extra details are entirely voluntary and cannot undo onboarding.
  app.get("/enrichment",async(request,reply)=>{
    const acc=await requireAccount(request);
    if(!acc)return reply.code(401).send({error:"Please log in first"});
    const options=FIELDS.filter(f=>!f.required).map(f=>({path:f.path,label:f.label,kind:f.kind}));
    return {fields:options,profile:acc.registration.profile};
  });
  // Prepare the draft without saving. The member reviews the cleaned result first.
  app.post("/enrichment/prepare",async(request,reply)=>{
    const acc=await requireAccount(request);
    if(!acc)return reply.code(401).send({error:"ABC login required"});
    if(!["COMPLETE","REVIEW"].includes(acc.registration.phase))
      return reply.code(409).send({error:"Finish the basic questions first"});
    const body=z.object({path:z.string().max(150),text:z.string().trim().min(1).max(1000)}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Enter a short optional detail"});
    const def=FIELD_MAP.get(body.data.path);
    if(!def||def.required)return reply.code(400).send({error:"This optional field is not allowed"});
    try{
      const cleaned=await cleanProfileValue(body.data.text,"polish",def.label);
      const value=String(cleaned.value);
      const structured=def.kind==="list"?value.split(",").map(x=>x.trim()).filter(Boolean):value;
      const valid=normalizeField(def.path,structured);
      if(!valid.ok)return reply.code(400).send({error:valid.error});
      const previewToken=app.jwt.sign({
        scope:"abc_enrichment_preview",userId:acc.id,registrationId:acc.registrationId,
        path:def.path,value:structured,version:acc.registration.version
      },{expiresIn:"10m"});
      return {text:value,uncertain:cleaned.uncertain,valid:true,previewToken};
    }catch(error){
      request.log.warn({reason:String(error).slice(0,160)},"ABC optional detail cleanup failed");
      return reply.code(503).send({error:"We could not clean this detail yet. Nothing was saved."});
    }
  });
  app.post("/enrichment",async(request,reply)=>{
    const acc=await requireAccount(request);
    if(!acc)return reply.code(401).send({error:"Please log in first"});
    if(!["COMPLETE","REVIEW"].includes(acc.registration.phase))
      return reply.code(409).send({error:"Complete the basic questions first"});
    const body=z.object({path:z.string().max(150),value:z.unknown(),version:z.number().int().nonnegative(),
      previewToken:z.string().max(4000).optional()}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Invalid optional detail"});
    if(body.data.version!==acc.registration.version)
      return reply.code(409).send({error:"Profile has changed. Refresh before editing."});
    const def=FIELD_MAP.get(body.data.path);
    if(!def||def.required)return reply.code(400).send({error:"Only optional fields can be added here"});
    let cleanedValue:unknown;
    if(body.data.previewToken){
      try{
        const signed=app.jwt.verify<any>(body.data.previewToken);
        if(signed.scope!=="abc_enrichment_preview"||signed.userId!==acc.id||
          signed.registrationId!==acc.registrationId||signed.path!==def.path||
          signed.version!==body.data.version||JSON.stringify(signed.value)!==JSON.stringify(body.data.value))
          return reply.code(409).send({error:"The reviewed detail has changed. Clean and review it again."});
        cleanedValue=signed.value;
      }catch{return reply.code(403).send({error:"Your cleaned draft expired. Please review it again."});}
    }else{
      try{cleanedValue=(await cleanProfileValue(body.data.value,"polish",def.label)).value;}
      catch(error){
        request.log.warn({reason:String(error).slice(0,160)},"ABC enrichment save cleanup failed");
        return reply.code(503).send({error:"The optional detail could not be cleaned. Nothing was saved."});
      }
    }
    const valid=normalizeField(body.data.path,cleanedValue);
    if(!valid.ok)return reply.code(400).send({error:valid.error});
    const profile=setPath(acc.registration.profile as Profile,body.data.path,valid.value);
    const states:FieldStates={...(acc.registration.fieldStates as FieldStates),
      [body.data.path]:valid.complete?"answered":"needs_clarification"};
    const saved=await store(readDraft(acc.registration),{profile,fieldStates:states});
    return {session:client(saved)};
  });

  app.post("/audio/transcribe",async(request,reply)=>{
    const d=await requireDraft(request);if(!d)return authError(reply);
    if(!["COLLECTING","REVIEW","COMPLETE"].includes(d.phase))return reply.code(409).send({error:"Speech input is unavailable right now"});
    const body=z.object({data:z.string().max(1200000),format:z.enum(["m4a","wav","mp3"]),path:z.string().max(150).optional()}).safeParse(request.body);
    if(!body.success)return reply.code(400).send({error:"Invalid audio clip"});
    const optionalField=body.data.path?FIELD_MAP.get(body.data.path):undefined;
    if(body.data.path&&(!optionalField||optionalField.required))
      return reply.code(400).send({error:"Invalid optional field for voice input"});
    const account=optionalField?await requireAccount(request):null;
    if(optionalField&&!account)return reply.code(401).send({error:"Sign in to add optional details"});
    if(!throttle("abc-audio:"+d.id,12,60*60*1000))return reply.code(429).send({error:"Audio limit reached"});
    try{
      const transcript=await transcribeAudio(body.data.data,body.data.format);
      const normalized=await cleanProfileValue(transcript,"speech",optionalField?.label||"Dictated ABC answer");
      const text=String(normalized.value);
      if(optionalField&&account){
        const value=optionalField.kind==="list"?text.split(",").map(v=>v.trim()).filter(Boolean):text;
        const valid=normalizeField(optionalField.path,value);
        if(valid.ok){
          // Reuse the cleaned text as the exact, user-visible draft at Save.
          const previewToken=app.jwt.sign({
            scope:"abc_enrichment_preview",userId:account.id,registrationId:account.registrationId,
            path:optionalField.path,value:valid.value,version:account.registration.version
          },{expiresIn:"10m"});
          return {text,uncertain:normalized.uncertain,previewToken};
        }
      }
      return {text,uncertain:normalized.uncertain};
    }catch(error){
      request.log.warn({reason:String(error).slice(0,160)},"ABC cleaned transcription failed");
      return reply.code(503).send({error:"Speech cleanup is unavailable. Please type your answer."});
    }
  });
}
