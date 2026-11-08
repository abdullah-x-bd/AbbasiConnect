import React,{useEffect,useRef,useState} from "react";
import {ActivityIndicator,ScrollView,Text,View} from "react-native";
import {mediaDevices,RTCPeerConnection,RTCSessionDescription} from "react-native-webrtc";
import {api,type Session} from "./api";
import {T,st,Btn,BrandLogo} from "./minimal-ui";
import {VoiceTurnCollector,audioLevels,humanTimer} from "./voice-turns";

type Reason="manual"|"silence"|"time_limit"|"connection_lost";
type Phase="connecting"|"asking"|"waiting"|"listening"|"processing"|"ended";
type Event={
  type:string;event_id?:string;client_event_id?:string;
  delta?:string;start_ms?:number;end_ms?:number;offset_ms?:number;
  delegation?:{id:string;target:string};
  error?:{message?:string;client_event_id?:string};
};
type Props={
  session:Session;preview?:boolean;onSession:(next:Session)=>void;
  onSwitchToChat:()=>Promise<void>;onEnd:(reason?:Reason)=>void;
};

const CALL_MS=4*60*1000;
const START_SPEAK_MS=15*1000;
const MIC_THRESHOLD=0.027;
const BARGE_IN_THRESHOLD=0.045;
const OUTPUT_THRESHOLD=0.022;
const QUIET_PLAYBACK_MS=1550;

function explain(error:unknown):string{
  return error instanceof Error?error.message:"The audio connection was interrupted.";
}
function clip(s:string){return s.trim().slice(-440);}
function sleep(ms:number){return new Promise<void>(resolve=>setTimeout(resolve,ms));}

export default function VoiceCall({session,preview=false,onSession,onSwitchToChat,onEnd}:Props){
  const [status,setStatus]=useState<"connecting"|"connected"|"error"|"ended">(preview?"connected":"connecting");
  const [phase,setPhaseState]=useState<Phase>(preview?"waiting":"connecting");
  const [micMuted,setMicMuted]=useState(false);
  const [assistantCaption,setAssistantCaption]=useState("");
  const [userCaption,setUserCaption]=useState("");
  const [error,setError]=useState("");
  const [secondsLeft,setSecondsLeft]=useState(CALL_MS/1000);
  const [unrelatedCount,setUnrelatedCount]=useState(0);
  const [repeatCount,setRepeatCount]=useState(0);
  const [waitSeconds,setWaitSeconds]=useState(15);
  const [saved,setSaved]=useState(session.progress);

  const phaseRef=useRef<Phase>("connecting");
  const sessionRef=useRef(session);
  const onSessionRef=useRef(onSession);
  const onEndRef=useRef(onEnd);
  const activeRef=useRef(true);
  const rtcRef=useRef<any>(null);
  const micRef=useRef<any>(null);
  const remoteAudioRef=useRef<any>(null);
  const audioAllowedRef=useRef(true);
  const channelRef=useRef<any>(null);
  const openaiReadyRef=useRef(false);
  const greetingSentRef=useRef(false);
  const collectorRef=useRef(new VoiceTurnCollector());
  const delegatedIdsRef=useRef<{id:string;offset:number}[]>([]);
  const delegationSeenRef=useRef(new Set<string>());
  const replyLockRef=useRef(false);
  const waitLockRef=useRef(false);
  const timeoutLockRef=useRef(false);
  const startedAtRef=useRef(0);
  const waitingAtRef=useRef(0);
  const questionIssuedRef=useRef(0);
  const questionSeqRef=useRef(0);
  const questionOutputRef=useRef(false);
  const outputLastAtRef=useRef(0);
  const outputTextLastAtRef=useRef(0);
  const outputSampledRef=useRef(false);
  const micSampledRef=useRef(false);
  const micConfirmedRef=useRef(false);
  const micPeakCountRef=useRef(0);
  const lastTurnFinalizedAtRef=useRef(0);
  const nextOutputLoggedRef=useRef(false);
  const micLastAtRef=useRef(0);
  const inputTextLastAtRef=useRef(0);
  const lastUserActivityRef=useRef(0);
  const statsRef=useRef({inEnergy:0,inDuration:0,outEnergy:0,outDuration:0});
  const meterBusyRef=useRef(false);
  const meterTimerRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const watchdogRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const callNonceRef=useRef("abc_"+Date.now());
  const utteranceNumberRef=useRef(0);
  const unrelatedRef=useRef(0);
  const seenOutputRef=useRef(false);

  useEffect(()=>{
    sessionRef.current=session;
    onSessionRef.current=onSession;
    onEndRef.current=onEnd;
  },[session,onSession,onEnd]);

  function setPhase(next:Phase){
    phaseRef.current=next;
    if(activeRef.current)setPhaseState(next);
  }
  function send(type:string,content:Record<string,unknown>={}){
    const dc=channelRef.current;
    if(dc?.readyState==="open"){
      dc.send(JSON.stringify({
        type,event_id:"abc_"+Date.now()+"_"+Math.floor(Math.random()*100000),...content
      }));
    }
  }
  function silentContext(text:string,id:string|null=null){
    send("session.thinking.append",{delegation_id:id,content:text.slice(0,700)});
  }
  function sayQuestion(question:string,id:string|null=null){
    // The startup prompt already tells GPT-Live to speak authorized questions
    // and then stop. Supply the QUESTION as commentary, not meta-instructions
    // that might themselves be spoken to the user.
    send("session.commentary.append",{delegation_id:id,content:clip(question)});
  }
  function audioAllowed(allowed:boolean){
    audioAllowedRef.current=allowed;
    const track=remoteAudioRef.current;
    if(track&&track.kind==="audio")try{track.enabled=allowed;}catch{}
  }
  function issueQuestion(question:string,id:string|null=null){
    if(!activeRef.current)return;
    questionIssuedRef.current=Date.now();
    questionSeqRef.current+=1;
    questionOutputRef.current=false;
    seenOutputRef.current=false;
    outputLastAtRef.current=0;
    outputTextLastAtRef.current=0;
    waitingAtRef.current=0;
    setAssistantCaption("");
    nextOutputLoggedRef.current=false;
    setPhase("asking");
    audioAllowed(true);
    sayQuestion(question,id);
  }
  function shutdown(){
    if(!activeRef.current)return;
    activeRef.current=false;
    if(meterTimerRef.current)clearInterval(meterTimerRef.current);
    if(watchdogRef.current)clearInterval(watchdogRef.current);
    try{send("session.close");}catch{}
    try{channelRef.current?.close();}catch{}
    try{micRef.current?.getTracks().forEach((t:any)=>t.stop());}catch{}
    try{rtcRef.current?.close();}catch{}
    channelRef.current=null;micRef.current=null;rtcRef.current=null;
    remoteAudioRef.current=null;
    setPhaseState("ended");
  }
  function end(reason:Reason){
    if(!activeRef.current)return;
    shutdown();
    onEndRef.current(reason);
  }
  function receivedSpeech(){
    if(micMuted||!activeRef.current)return;
    const p=phaseRef.current;
    lastUserActivityRef.current=Date.now();
    if(p==="waiting"||p==="asking"){
      setPhase("listening");
      audioAllowed(false); // Locally stop playback immediately on barge-in.
      silentContext("The caller has the floor. Stop all speech. Do not interrupt or respond yet.");
    }
  }

  async function markQuestionPlayed(sequence:number){
    if(!activeRef.current||phaseRef.current!=="asking"||waitLockRef.current)return;
    if(sequence!==questionSeqRef.current)return;
    waitLockRef.current=true;
    // Never start the countdown until after question playback ends.
    try{
      const d=await api<{session:Session;action:string}>("/abc/live/wait",{
        method:"POST",body:{action:"ready",version:sessionRef.current.version,
          questionPath:sessionRef.current.currentQuestion}
      });
      if(!activeRef.current)return;
      sessionRef.current=d.session;
      onSessionRef.current(d.session);
      if(phaseRef.current==="asking"){
        audioAllowed(false);
        setPhase("waiting");
        waitingAtRef.current=Date.now();
        setWaitSeconds(15);
      }
    }catch(exc){
      if(activeRef.current&&phaseRef.current==="asking"){
        setError("Could not start the answer timer: "+explain(exc));
        // Degrade to listening with no forced deadline rather than timing out
        // a caller whose actual playback completion is unknown.
        setPhase("waiting");
        waitingAtRef.current=0;
      }
    }finally{waitLockRef.current=false;}
  }

  async function handleNoAnswer(){
    if(timeoutLockRef.current||!activeRef.current||phaseRef.current!=="waiting")return;
    if(waitingAtRef.current===0)return;
    timeoutLockRef.current=true;
    try{
      const res=await api<{session:Session;action:"wait"|"repeat"|"end";question?:string}>("/abc/live/wait",{
        method:"POST",body:{action:"timeout",version:sessionRef.current.version,
          questionPath:sessionRef.current.currentQuestion}
      });
      if(!activeRef.current)return;
      sessionRef.current=res.session;
      onSessionRef.current(res.session);
      if(phaseRef.current!=="waiting")return;
      if(res.action==="repeat"){
        setRepeatCount(1);
        issueQuestion(res.question||"Please answer the current question.");
      }else if(res.action==="end"){
        shutdown(); // onSession changed the screen to the paused state
      }else waitingAtRef.current=Date.now();
    }catch(exc){
      if(activeRef.current){setError(explain(exc));waitingAtRef.current=Date.now();}
    }finally{timeoutLockRef.current=false;}
  }

  async function sendAnswer(text:string,turnId:string,delegationId:string|null){
    if(!activeRef.current)return;
    // A voice turn can finish while /live/wait is acknowledging question
    // playback. Wait for that write before sending the versioned answer.
    for(let i=0;i<40&&waitLockRef.current&&activeRef.current;i++)await sleep(80);
    if(!activeRef.current)return;
    const started=Date.now();
    let version=sessionRef.current.version;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const res=await api<{
          session:Session;voiceDistractionCount?:number;voiceTermination?:string;
          classification?:string;duplicate?:boolean;
        }>("/abc/reply",{method:"POST",body:{text,version,voiceTurnId:turnId}});
        if(!activeRef.current)return;
        sessionRef.current=res.session;
        setSaved(res.session.progress);
        const strikes=res.voiceDistractionCount||0;
        const wasDistracted=strikes>unrelatedRef.current;
        unrelatedRef.current=strikes;
        setUnrelatedCount(strikes);
        const elapsed=Date.now()-started;
        console.info("ABC_VOICE_TIMING",{stage:"backend_validated",ms:elapsed,turn:turnId.slice(-5)});
        if(res.voiceTermination==="off_topic_limit"||
           res.session.profile.registration?.onboarding_mode!=="voice"||
           res.session.phase!=="COLLECTING"){
          shutdown();
          onSessionRef.current(res.session);
          return;
        }
        onSessionRef.current(res.session);
        // If the caller continued speaking during backend processing, hold
        // onto that speech and validate it before uttering another question.
        if(collectorRef.current.hasText()){
          setPhase("listening");
          audioAllowed(false);
          return;
        }
        const question=res.session.currentQuestionText;
        if(!question){shutdown();return;}
        const lead=wasDistracted?"Please stay with the profile questions. ":"";
        setRepeatCount(0);
        issueQuestion(lead+question,delegationId);
        return;
      }catch(exc){
        if(!activeRef.current)return;
        const message=explain(exc);
        if(/four-minute|time limit/i.test(message)){end("time_limit");return;}
        // Refresh after a conflict or an uncertain network outcome. A retry
        // with the same turn ID is idempotent even if the previous save won.
        try{
          const latest=await api<{session:Session}>("/abc/state");
          if(!activeRef.current)return;
          sessionRef.current=latest.session;
          onSessionRef.current(latest.session);
          version=latest.session.version;
        }catch{}
        if(attempt<2){await sleep(550);continue;}
        setError("Your answer could not be confirmed. Please try speaking again. "+message);
        // Never replay historical dialogue after an HTTP failure.
        audioAllowed(false);
        setPhase("waiting");
        waitingAtRef.current=0;
      }
    }
  }

  async function processAnswer(){
    if(!activeRef.current||replyLockRef.current)return;
    const buffer=collectorRef.current;
    if(!buffer.ready(Date.now(),micConfirmedRef.current))return;
    const complete=buffer.commit();
    if(!complete||!complete.text)return;
    replyLockRef.current=true;
    setPhase("processing");
    audioAllowed(false);
    waitingAtRef.current=0;
    setUserCaption(clip(complete.text));
    const turnId=callNonceRef.current.replace(/[^A-Za-z0-9_-]/g,"").slice(0,62)+
      "_"+(++utteranceNumberRef.current);
    // A single user utterance can trigger multiple model delegations. Match
    // only a delegation near this utterance's audio timeline and discard older
    // duplicates, instead of assigning them to the next question.
    const eligible=delegatedIdsRef.current.filter(x=>x.offset<=complete.endMs+2500);
    const delegationId=eligible.length?eligible[eligible.length-1].id:null;
    delegatedIdsRef.current=delegatedIdsRef.current.filter(x=>x.offset>complete.endMs+2500);
    if(delegationId)silentContext("",delegationId);
    lastTurnFinalizedAtRef.current=Date.now();
    console.info("ABC_VOICE_TIMING",{stage:"turn_finalized",fragments:complete.fragments,
      utteranceAudioMs:complete.endMs-complete.startMs});
    try{
      await sendAnswer(complete.text,turnId,delegationId);
    }finally{
      replyLockRef.current=false;
      // User may begin another answer while the backend validates this one.
      // Keep its fragments intact; process on the next watchdog tick.
    }
  }

  async function sampleAudioLevels(){
    if(meterBusyRef.current||!activeRef.current||!rtcRef.current)return;
    meterBusyRef.current=true;
    try{
      const report=await rtcRef.current.getStats();
      if(!activeRef.current)return;
      const levels=audioLevels(report,statsRef.current);
      statsRef.current=levels.previous;
      const now=Date.now();
      if(levels.mic!==null){
        micSampledRef.current=true;
        const bargeIn=phaseRef.current==="asking";
        if(levels.mic>(bargeIn?BARGE_IN_THRESHOLD:MIC_THRESHOLD))
          micPeakCountRef.current+=1;
        else micPeakCountRef.current=0;
        const likelySpeech=micPeakCountRef.current>=(bargeIn?2:1);
        if(!micMuted&&likelySpeech){
          micConfirmedRef.current=true;
          micLastAtRef.current=now;
          collectorRef.current.micActivity(now);
          receivedSpeech();
        }else if(now-micLastAtRef.current>300){
          collectorRef.current.micQuiet();
        }
      }
      if(levels.speaker!==null){
        outputSampledRef.current=true;
        if(levels.speaker>OUTPUT_THRESHOLD){
          if(phaseRef.current==="asking"){
            questionOutputRef.current=true;
            seenOutputRef.current=true;
            outputLastAtRef.current=now;
            if(!nextOutputLoggedRef.current&&lastTurnFinalizedAtRef.current>0){
              nextOutputLoggedRef.current=true;
              console.info("ABC_VOICE_TIMING",{stage:"next_audio",sinceTurnMs:now-lastTurnFinalizedAtRef.current});
            }
          }else if(phaseRef.current==="waiting"||phaseRef.current==="listening"||
                   phaseRef.current==="processing"){
            // Out-of-turn voice is not played. The model may still generate it,
            // but it cannot talk over our interviewee through the remote track.
            audioAllowed(false);
          }
        }
      }
    }catch{
      // Not all react-native-webrtc Android builds expose audio-level stats.
      // In that case use longer transcript stabilization and never cut early.
    }finally{meterBusyRef.current=false;}
  }

  function handleLiveEvent(raw:string){
    if(!activeRef.current)return;
    let msg:Event;
    try{msg=JSON.parse(raw);}catch{return;}
    if(msg.type==="session.started"){
      openaiReadyRef.current=true;
      setStatus("connected");
      if(!greetingSentRef.current&&channelRef.current?.readyState==="open"){
        greetingSentRef.current=true;
        const opening=sessionRef.current.currentQuestionText;
        if(opening)issueQuestion(opening,null);
      }
      return;
    }
    if(msg.type==="session.output_transcript.delta"&&typeof msg.delta==="string"){
      if(phaseRef.current!=="asking"){
        audioAllowed(false);
        return;
      }
      questionOutputRef.current=true;
      seenOutputRef.current=true;
      outputTextLastAtRef.current=Date.now();
      setAssistantCaption(old=>clip(old+msg.delta!));
      return;
    }
    if(msg.type==="session.input_transcript.delta"&&typeof msg.delta==="string"){
      const now=Date.now();
      inputTextLastAtRef.current=now;
      lastUserActivityRef.current=now;
      const added=collectorRef.current.add({
        event_id:msg.event_id,delta:msg.delta,start_ms:msg.start_ms,end_ms:msg.end_ms
      },now);
      if(added){
        receivedSpeech();
        setUserCaption(old=>clip(old+msg.delta!));
        if(!micSampledRef.current)collectorRef.current.micQuiet();
      }
      return;
    }
    if(msg.type==="session.delegation.created"&&msg.delegation?.target==="client"){
      const id=msg.delegation.id;
      if(delegationSeenRef.current.has(id))return;
      delegationSeenRef.current.add(id);
      delegatedIdsRef.current.push({id,offset:Number(msg.offset_ms)||0});
      if(delegatedIdsRef.current.length>12)
        delegatedIdsRef.current=delegatedIdsRef.current.slice(-12);
      // Suppress tool acknowledgments, but NEVER assume a delegation timestamp
      // identifies the final word of a user turn.
      silentContext("",id);
      return;
    }
    if(msg.type==="error"){
      setError(msg.error?.message||"The voice provider reported an error.");
      return;
    }
    if(msg.type==="session.closed")end("connection_lost");
  }

  function watchdog(){
    if(!activeRef.current||!startedAtRef.current)return;
    const now=Date.now();
    const elapsed=now-startedAtRef.current;
    setSecondsLeft(Math.max(0,Math.ceil((CALL_MS-elapsed)/1000)));
    if(elapsed>=CALL_MS){end("time_limit");return;}
    const p=phaseRef.current;
    if(p==="asking"){
      // GPT-Live has no end-of-spoken-response event. Prefer actual RTP audio
      // levels; fall back to stable output transcript + grace period.
      const voiceFinished=outputSampledRef.current&&questionOutputRef.current&&
        outputLastAtRef.current>0&&now-outputLastAtRef.current>=QUIET_PLAYBACK_MS;
      const transcriptFinished=(!outputSampledRef.current||outputLastAtRef.current===0)&&
        outputTextLastAtRef.current>0&&now-outputTextLastAtRef.current>=1900;
      const noPlaybackFallback=now-questionIssuedRef.current>=7000&&!seenOutputRef.current;
      if(voiceFinished||transcriptFinished||noPlaybackFallback)
        void markQuestionPlayed(questionSeqRef.current);
    }else if(p==="waiting"){
      if(waitingAtRef.current){
        const timeLeft=Math.max(0,Math.ceil((START_SPEAK_MS-(now-waitingAtRef.current))/1000));
        setWaitSeconds(timeLeft);
        if(now-waitingAtRef.current>=START_SPEAK_MS)void handleNoAnswer();
      }
    }else if(p==="listening"){
      // There is no "transcript.done" in GPT-Live. Wait for locally observed
      // speech to stop, plus a network grace interval for late deltas.
      if(collectorRef.current.ready(now,micConfirmedRef.current))void processAnswer();
      // If sound was heard but no words were recognized, give another chance
      // rather than submitting an empty answer or counting a distraction.
      if(!collectorRef.current.hasText()&&lastUserActivityRef.current>0&&
        now-lastUserActivityRef.current>9500){
        setError("I didn't catch that answer. Please try speaking again.");
        const current=sessionRef.current.currentQuestionText;
        if(current)issueQuestion(current,null);
        lastUserActivityRef.current=0;
      }
    }else if(p==="processing"){
      // Never trigger a new question or repeat timer while saving a response.
    }
  }

  useEffect(()=>{
    activeRef.current=true;
    if(preview){setPhase("waiting");return ()=>shutdown();}
    (async()=>{
      try{
        const stream=await (mediaDevices as any).getUserMedia({
          audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
          video:false
        });
        if(!activeRef.current){stream.getTracks().forEach((t:any)=>t.stop());return;}
        micRef.current=stream;
        const pc:any=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
        rtcRef.current=pc;
        for(const track of stream.getAudioTracks())pc.addTrack(track,stream);
        pc.ontrack=(event:any)=>{
          if(event.track?.kind==="audio"){
            remoteAudioRef.current=event.track;
            audioAllowed(audioAllowedRef.current);
          }
        };
        const dc:any=pc.createDataChannel("oai-events");
        channelRef.current=dc;
        dc.onmessage=(event:any)=>handleLiveEvent(String(event.data));
        dc.onerror=()=>setError("The live audio channel encountered an error.");
        dc.onclose=()=>{if(activeRef.current)end("connection_lost");};
        const offer=await pc.createOffer({offerToReceiveAudio:true});
        await pc.setLocalDescription(offer);
        await new Promise<void>(resolve=>{
          if(pc.iceGatheringState==="complete"){resolve();return;}
          let done=false;
          const finish=()=>{
            if(done)return;done=true;clearTimeout(timeout);resolve();
          };
          const timeout=setTimeout(finish,5500);
          pc.onicegatheringstatechange=()=>{if(pc.iceGatheringState==="complete")finish();};
        });
        if(!activeRef.current)return;
        const sdp=pc.localDescription?.sdp||offer.sdp;
        if(!sdp)throw Error("Could not create microphone connection");
        const joined=await api<{sessionId:string;answer:string;session:Session}>("/abc/live/connect",{
          method:"POST",body:{sdp}
        });
        if(!activeRef.current)return;
        callNonceRef.current=joined.sessionId.replace(/[^A-Za-z0-9_-]/g,"");
        sessionRef.current=joined.session;
        onSessionRef.current(joined.session);
        await pc.setRemoteDescription(new RTCSessionDescription({type:"answer",sdp:joined.answer}));
        if(!activeRef.current)return;
        startedAtRef.current=Date.now();
        meterTimerRef.current=setInterval(()=>void sampleAudioLevels(),300);
        watchdogRef.current=setInterval(watchdog,300);
        if(openaiReadyRef.current&&dc.readyState==="open"&&!greetingSentRef.current){
          greetingSentRef.current=true;
          const opening=sessionRef.current.currentQuestionText;
          if(opening)issueQuestion(opening,null);
        }
      }catch(exc){
        if(activeRef.current){
          setStatus("error");
          setError(explain(exc));
          shutdown();
        }
      }
    })();
    return ()=>shutdown();
  },[preview]);

  function toggleMute(){
    const next=!micMuted;
    setMicMuted(next);
    for(const track of micRef.current?.getAudioTracks()||[])track.enabled=!next;
    send(next?"session.input_audio.mute":"session.input_audio.unmute");
  }
  async function switchToChat(){
    shutdown();
    await onSwitchToChat();
  }

  const phrase=phase==="connecting"?"Connecting / Jud rahe hain":
    phase==="asking"?"ABC is asking / Sawaal sun rahe hain":
    phase==="waiting"?"Your turn / Aap boliye":
    phase==="listening"?"Listening / Sun rahe hain":
    phase==="processing"?"Saving your answer / Jawaab save ho raha hai":"Call ended";
  return <View style={[st.page,{flex:1}]}>
    <View style={{flexDirection:"row",alignItems:"center",padding:20,gap:14,
      borderBottomColor:T.border,borderBottomWidth:1}}>
      <BrandLogo size={58}/>
      <View style={{flex:1}}>
        <Text style={{color:T.ink,fontSize:21,fontWeight:"700"}}>ABC Voice Call</Text>
        <Text style={st.note}>{status==="error"?"Connection failed":phrase}</Text>
      </View>
    </View>
    <View style={{paddingHorizontal:24,paddingTop:24}}>
      <View style={st.progress}>
        <View style={[st.progressFill,{width:(session.progress||saved)+"%"}]}/>
      </View>
      <View style={{flexDirection:"row",justifyContent:"space-between",marginTop:7}}>
        <Text style={st.note}>{humanTimer(secondsLeft)} remaining</Text>
        <Text style={st.note}>{session.progress||saved}% saved</Text>
      </View>
    </View>
    <ScrollView contentContainerStyle={{flexGrow:1,justifyContent:"center",alignItems:"center",
      padding:24,gap:20}}>
      <View style={{height:130,width:130,borderRadius:70,backgroundColor:T.light,
        justifyContent:"center",alignItems:"center",borderWidth:2,borderColor:T.border}}>
        {status==="connecting"?<ActivityIndicator color={T.accent} size="large"/>:
          <Text style={{fontSize:54,color:T.accent}}>{micMuted?"×":phase==="listening"?"◎":"◉"}</Text>}
      </View>
      <Text style={{color:T.ink,textAlign:"center",fontWeight:"700",fontSize:24}}>
        {micMuted?"Microphone muted":
          phase==="asking"?"Listen to ABC":
          phase==="waiting"?"You can answer now":
          phase==="listening"?"Take your time, we're listening":
          phase==="processing"?"Checking your answer":
          phase==="connecting"?"Starting your call…":"Your call has stopped"}
      </Text>
      <Text style={[st.sub,{textAlign:"center"}]}>
        {phase==="waiting"?
          (repeatCount?"Question repeated once. Start speaking in "+waitSeconds+" seconds.":
            "Start speaking in "+waitSeconds+" seconds. Take your time finishing."):
          "ABC waits for a complete answer before asking its next question."}
      </Text>
      {assistantCaption?<View style={[st.card,{width:"100%"}]}>
        <Text style={st.note}>ABC</Text>
        <Text style={{color:T.ink,fontSize:16,marginTop:5}}>{assistantCaption}</Text>
      </View>:null}
      {userCaption?<View style={[st.card,{width:"100%"}]}>
        <Text style={st.note}>You / Aap</Text>
        <Text style={{color:T.ink,fontSize:16,marginTop:5}}>{userCaption}</Text>
      </View>:null}
      {unrelatedCount>0?<Text style={[st.note,{textAlign:"center"}]}>
        Unrelated replies: {unrelatedCount}/4. A fifth ends the call.
      </Text>:null}
      {error?<Text accessibilityRole="alert" style={{color:T.danger,textAlign:"center"}}>
        {error}
      </Text>:null}
    </ScrollView>
    <View style={{padding:20,borderTopColor:T.border,borderTopWidth:1,gap:10}}>
      <Btn en={micMuted?"Unmute microphone":"Mute microphone"}
        roman={micMuted?"Mic chalu karein":"Mic band karein"}
        secondary disabled={status!=="connected"} onPress={toggleMute}/>
      <Btn en="Switch to Chat" roman="Chat par jaayein" secondary onPress={()=>void switchToChat()}/>
      <Btn en="End Call" roman="Call khatam karein" onPress={()=>end("manual")}/>
    </View>
  </View>;
}
