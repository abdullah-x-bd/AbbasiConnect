import React,{useEffect,useRef,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,Text,View} from "react-native";
import {mediaDevices,RTCPeerConnection,RTCSessionDescription} from "react-native-webrtc";
import {api,type Session} from "./api";
import {T,st,Btn,BrandLogo} from "./minimal-ui";

type LiveEvent={
  type:string;delta?:string;start_ms?:number;end_ms?:number;offset_ms?:number;audio_end_ms?:number;
  delegation?:{id:string;target:string};error?:{message?:string};
};
type SpokenPiece={text:string;start:number;end:number};
type Props={
  session:Session;preview?:boolean;
  onSession:(updated:Session)=>void;
  onSwitchToChat:()=>Promise<void>;
  onEnd:(reason?:"manual"|"silence"|"time_limit"|"connection_lost")=>void;
};

function displayError(error:unknown):string{
  return error instanceof Error?error.message:"The voice connection was interrupted.";
}
function clip(text:string):string{return text.trim().slice(0,440);}
const MAX_CALL_MS=4*60*1000;
const SILENCE_WARNING_MS=20*1000;
const SILENCE_END_MS=30*1000;
const UNRELATED_LIMIT=4;

// Audio is carried by WebRTC media tracks. Only event/transcript metadata goes
// over the data channel; no private API key or application database is exposed.
export default function VoiceCall({session,preview=false,onSession,onSwitchToChat,onEnd}:Props){
  const [status,setStatus]=useState<"connecting"|"connected"|"ended"|"error">(preview?"connected":"connecting");
  const [muted,setMuted]=useState(false);
  const [assistant,setAssistant]=useState("");
  const [userCaption,setUserCaption]=useState("");
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(0);
  const [secondsLeft,setSecondsLeft]=useState(MAX_CALL_MS/1000);
  const [unrelatedCount,setUnrelatedCount]=useState(0);
  const [silenceWarning,setSilenceWarning]=useState(false);
  const sessionRef=useRef(session);
  const rtcRef=useRef<any>(null);
  const micRef=useRef<any>(null);
  const dcRef=useRef<any>(null);
  const activeRef=useRef(true);
  const connectedRef=useRef(false);
  const busyRef=useRef(false);
  const pendingRef=useRef<{id:string;offset:number}|null>(null);
  const handledRef=useRef(new Set<string>());
  const transcriptRef=useRef<SpokenPiece[]>([]);
  const lastCutRef=useRef(0);
  const timerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const closeTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const watchdogRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const fallbackRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const startedAtRef=useRef<number|null>(null);
  const lastActivityRef=useRef(Date.now());
  const silenceWarnedRef=useRef(false);
  const lastSpeechEndRef=useRef(0);
  const greetedRef=useRef(false);
  const onEndRef=useRef(onEnd);
  const onSessionRef=useRef(onSession);
  useEffect(()=>{
    sessionRef.current=session;onSessionRef.current=onSession;onEndRef.current=onEnd;
  },[session,onSession,onEnd]);

  function send(type:string,details:Record<string,unknown>={}){
    const channel=dcRef.current;
    if(channel?.readyState==="open"){
      channel.send(JSON.stringify({type,event_id:"abc_"+Date.now()+"_"+Math.floor(Math.random()*10000),...details}));
    }
  }
  function notifySpeech(question:string,delegationId:string|null){
    send("session.commentary.append",{
      delegation_id:delegationId,
      content:clip(question)
    });
  }
  function shutdown(){
    activeRef.current=false;
    if(timerRef.current)clearTimeout(timerRef.current);
    if(closeTimerRef.current)clearTimeout(closeTimerRef.current);
    if(fallbackRef.current)clearTimeout(fallbackRef.current);
    if(watchdogRef.current)clearInterval(watchdogRef.current);
    try{send("session.close");}catch{}
    try{dcRef.current?.close();}catch{}
    try{micRef.current?.getTracks().forEach((track:any)=>track.stop());}catch{}
    try{rtcRef.current?.close();}catch{}
    rtcRef.current=null;dcRef.current=null;micRef.current=null;
    connectedRef.current=false;
  }

  function endVoice(reason:"manual"|"silence"|"time_limit"|"connection_lost"){
    if(!activeRef.current)return;
    shutdown();
    setStatus("ended");
    onEndRef.current(reason);
  }
  function markActivity(){
    lastActivityRef.current=Date.now();
    silenceWarnedRef.current=false;
    setSilenceWarning(false);
  }
  function startWatchdog(){
    if(startedAtRef.current||!activeRef.current)return;
    const now=Date.now();
    startedAtRef.current=now;
    lastActivityRef.current=now;
    watchdogRef.current=setInterval(()=>{
      if(!activeRef.current)return;
      const elapsed=Date.now()-now;
      setSecondsLeft(Math.max(0,Math.ceil((MAX_CALL_MS-elapsed)/1000)));
      if(elapsed>=MAX_CALL_MS){endVoice("time_limit");return;}
      if(busyRef.current)return; // do not treat slow validation as silence
      const idle=Date.now()-lastActivityRef.current;
      if(idle>=SILENCE_END_MS){endVoice("silence");return;}
      if(idle>=SILENCE_WARNING_MS&&!silenceWarnedRef.current){
        silenceWarnedRef.current=true;
        setSilenceWarning(true);
        notifySpeech("Are you still there? Please answer the current ABC question. The call will end if there is no response.",null);
      }
    },1000);
  }
  function markConnected(){
    if(!activeRef.current)return;
    if(!connectedRef.current){
      connectedRef.current=true;
      setStatus("connected");
      startWatchdog();
    }
  }
  function sendOpeningQuestion(){
    if(greetedRef.current||dcRef.current?.readyState!=="open")return;
    greetedRef.current=true;
    const initial=[...sessionRef.current.messages].reverse().find(m=>m.role==="assistant")?.text||
      "Please tell me your full name and age.";
    notifySpeech("Welcome to ABC. Ask ONLY this profile question and listen: "+initial,null);
  }
  function scheduleTurnFallback(offset:number){
    // A distracted live model may answer directly without delegating. Every
    // completed audio turn still reaches the trusted ABC classification API.
    if(fallbackRef.current)clearTimeout(fallbackRef.current);
    fallbackRef.current=setTimeout(()=>{
      if(!activeRef.current||offset<=lastCutRef.current)return;
      if(pendingRef.current?.id)return; // the model delegated this turn
      pendingRef.current={id:"local_"+offset,offset};
      void flushDelegation();
    },1900);
  }
  async function flushDelegation(){
    if(!activeRef.current||busyRef.current||!pendingRef.current)return;
    const pending=pendingRef.current;
    if(handledRef.current.has(pending.id))return;
    const selected=transcriptRef.current.filter(x=>x.end>lastCutRef.current&&
      x.start<=pending.offset+500);
    const heard=selected.map(x=>x.text).join("").trim();
    if(!heard){
      // Allow transcript events to arrive slightly after delegation was created.
      if(timerRef.current)clearTimeout(timerRef.current);
      timerRef.current=setTimeout(()=>{if(activeRef.current)void flushDelegation();},450);
      return;
    }
    pendingRef.current=null;
    handledRef.current.add(pending.id);
    busyRef.current=true;
    setUserCaption(clip(heard));
    lastCutRef.current=Math.max(lastCutRef.current,pending.offset,...selected.map(x=>x.end));
    transcriptRef.current=transcriptRef.current.filter(x=>x.end>lastCutRef.current);
    try{
      const before=sessionRef.current;
      const data=await api<{session:Session;voiceDistractionCount?:number;voiceTermination?:string}>("/abc/reply",{
        method:"POST",body:{text:heard,version:before.version}
      });
      if(!activeRef.current)return;
      sessionRef.current=data.session;
      setSaved(data.session.progress);
      setUnrelatedCount(data.voiceDistractionCount||0);
      if(data.voiceTermination==="off_topic_limit"||
         data.session.profile.registration?.onboarding_mode!=="voice"){
        shutdown();
        onSessionRef.current(data.session); // automatically continue in Chat
        return;
      }
      onSessionRef.current(data.session);
      if(data.session.phase!=="COLLECTING"){
        shutdown(); // the completion screen now handles review
        return;
      }
      const next=data.session.messages.at(-1)?.text||"Please continue with the next answer.";
      const delegationId=pending.id.startsWith("local_")?null:pending.id;
      if(data.classification==="OFF_TOPIC"||data.classification==="PARTIALLY_OFF_TOPIC"){
        send("session.instructions.append",{
          delegation_id:delegationId,
          content:"This was an unrelated response. Do not discuss its topic. Redirect immediately to the backend's profile question. Say only one or two short sentences."
        });
        notifySpeech("Please stay with the matrimonial profile questions. Ask this question and listen: "+next,delegationId);
      }else{
        notifySpeech("Ask the following saved ABC profile question naturally, then listen: "+next,delegationId);
      }
    }catch(exc){
      if(!activeRef.current)return;
      if(/four-minute|voice call has ended/i.test(displayError(exc))){
        endVoice("time_limit");
        return;
      }
      setError("Your answer was not saved. "+displayError(exc));
      // Do not invent a saved answer or silently skip this question.
      notifySpeech("The answer could not be saved. Please ask the person to repeat their last answer.",
        pending.id.startsWith("local_")?null:pending.id);
    }finally{busyRef.current=false;}
  }
  function handleLiveEvent(raw:string){
    if(!activeRef.current)return;
    let msg:LiveEvent;
    try{msg=JSON.parse(raw);}catch{return;}
    if(msg.type==="session.started"){
      markConnected();
      sendOpeningQuestion();
      return;
    }
    if(msg.type==="session.output_transcript.delta"&&msg.delta){
      markActivity();
      setAssistant(old=>clip((old+" "+msg.delta).slice(-400)));
      return;
    }
    if(msg.type==="input_audio_buffer.speech_started"){
      markActivity();
      if(fallbackRef.current)clearTimeout(fallbackRef.current);
      lastSpeechEndRef.current=0;
      return;
    }
    if(msg.type==="input_audio_buffer.speech_stopped"){
      markActivity();
      lastSpeechEndRef.current=Number(msg.audio_end_ms)||0;
      if(lastSpeechEndRef.current>lastCutRef.current)
        scheduleTurnFallback(lastSpeechEndRef.current);
      return;
    }
    if(msg.type==="session.input_transcript.delta"&&msg.delta){
      markActivity();
      transcriptRef.current.push({
        text:msg.delta,start:Number(msg.start_ms)||0,end:Number(msg.end_ms)||0
      });
      setUserCaption(old=>clip((old+msg.delta).slice(-400)));
      if(pendingRef.current){
        if(timerRef.current)clearTimeout(timerRef.current);
        timerRef.current=setTimeout(()=>void flushDelegation(),300);
      }
      if(lastSpeechEndRef.current>lastCutRef.current&&!pendingRef.current)
        scheduleTurnFallback(lastSpeechEndRef.current);
      return;
    }
    if(msg.type==="session.delegation.created"&&msg.delegation?.target==="client"){
      const offset=Number(msg.offset_ms)||0;
      if(offset>0&&offset<=lastCutRef.current){
        notifySpeech("This user turn has already been checked by ABC. Follow the most recent saved profile question.",msg.delegation.id);
        return;
      }
      if(fallbackRef.current)clearTimeout(fallbackRef.current);
      pendingRef.current={id:msg.delegation.id,offset};
      send("session.thinking.append",{delegation_id:msg.delegation.id,content:""});
      if(timerRef.current)clearTimeout(timerRef.current);
      timerRef.current=setTimeout(()=>void flushDelegation(),480);
      return;
    }
    if(msg.type==="error"){setError(msg.error?.message||"The voice service reported an error.");}
    if(msg.type==="session.closed")endVoice("connection_lost");
  }
  useEffect(()=>{
    activeRef.current=true;
    if(preview)return ()=>shutdown();
    let started=false;
    (async()=>{
      try{
        const webrtc=mediaDevices as any;
        const stream=await webrtc.getUserMedia({audio:true,video:false});
        if(!activeRef.current){stream.getTracks().forEach((t:any)=>t.stop());return;}
        micRef.current=stream;
        const pc:any=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
        rtcRef.current=pc;
        for(const track of stream.getAudioTracks())pc.addTrack(track,stream);
        // Remote audio tracks play through the native WebRTC audio route.
        pc.ontrack=(event:any)=>{
          if(event.track?.kind==="audio")event.track.enabled=true;
        };
        const dc:any=pc.createDataChannel("oai-events");
        dcRef.current=dc;
        dc.onmessage=(event:any)=>handleLiveEvent(String(event.data));
        dc.onopen=()=>{markConnected();sendOpeningQuestion();};
        dc.onerror=()=>setError("The live audio channel had an error.");
        dc.onclose=()=>{if(activeRef.current)endVoice("connection_lost");};
        const offer=await pc.createOffer({offerToReceiveAudio:true});
        await pc.setLocalDescription(offer);
        // OpenAI's SDP exchange needs the final ICE candidates; avoid racing
        // immediately after setLocalDescription on slower Android networks.
        await new Promise<void>((resolve)=>{
          if(pc.iceGatheringState==="complete"){resolve();return;}
          let settled=false;
          const finish=()=>{if(settled)return;settled=true;clearTimeout(timeout);resolve();};
          const timeout=setTimeout(finish,5500);
          pc.onicegatheringstatechange=()=>{if(pc.iceGatheringState==="complete")finish();};
        });
        const sdp=pc.localDescription?.sdp||offer.sdp;
        if(!sdp)throw Error("Audio offer unavailable.");
        const joined=await api<{sessionId:string;answer:string;session:Session;maxDurationMs:number}>("/abc/live/connect",{
          method:"POST",body:{sdp}
        });
        if(!activeRef.current)return;
        // The server increments the profile version when the paid call starts.
        // Without syncing this, the first voice reply would be rejected as stale.
        sessionRef.current=joined.session;
        onSessionRef.current(joined.session);
        await pc.setRemoteDescription(new RTCSessionDescription({type:"answer",sdp:joined.answer}));
        started=true;
        markConnected();
        sendOpeningQuestion();
      }catch(exc){
        if(activeRef.current){setError(displayError(exc));setStatus("error");shutdown();}
      }
    })();
    return ()=>{if(started||activeRef.current)shutdown();};
  },[preview]);

  function toggleMute(){
    const next=!muted;
    setMuted(next);
    for(const track of micRef.current?.getAudioTracks()||[])track.enabled=!next;
    send(next?"session.input_audio.mute":"session.input_audio.unmute");
  }
  async function swapToChat(){
    shutdown();
    await onSwitchToChat();
  }
  return <View style={[st.page,{flex:1}]}>
    <View style={{flexDirection:"row",alignItems:"center",padding:20,gap:14,borderBottomColor:T.border,borderBottomWidth:1}}>
      <BrandLogo size={58}/>
      <View style={{flex:1}}>
        <Text style={{color:T.ink,fontSize:21,fontWeight:"700"}}>ABC Voice Call</Text>
        <Text style={st.note}>{status==="connecting"?"Connecting / Jud rahe hain":
          status==="connected"?"Listening / Sun rahe hain":
          status==="error"?"Connection failed / Call nahi lagi":"Call ended / Call khatam"}</Text>
      </View>
    </View>
    <View style={{paddingHorizontal:24,paddingTop:24}}>
      <View style={st.progress}><View style={[st.progressFill,{width:(session.progress||saved)+"%"}]}/></View>
      <View style={{flexDirection:"row",justifyContent:"space-between",marginTop:7}}>
        <Text style={st.note}>{Math.floor(secondsLeft/60)}:{String(secondsLeft%60).padStart(2,"0")} remaining</Text>
        <Text style={st.note}>{session.progress||saved}% saved</Text>
      </View>
    </View>
    <ScrollView contentContainerStyle={{flexGrow:1,justifyContent:"center",alignItems:"center",padding:24,gap:20}}>
      <View style={{height:130,width:130,borderRadius:70,backgroundColor:T.light,
        justifyContent:"center",alignItems:"center",borderWidth:2,borderColor:T.border}}>
        {status==="connecting"?<ActivityIndicator color={T.accent} size="large"/>:
          <Text style={{fontSize:54,color:T.accent}}>{muted?"×":"◉"}</Text>}
      </View>
      <Text style={{color:T.ink,textAlign:"center",fontWeight:"700",fontSize:24}}>
        {status==="connected"?(muted?"Microphone muted":"You can speak naturally"):
          status==="connecting"?"Starting your call…":"Your call is stopped"}
      </Text>
      <Text style={[st.sub,{textAlign:"center"}]}>
        Aap bolte jaayein. ABC aapse baat karke jawaab save karega.
      </Text>
      {assistant?<View style={[st.card,{width:"100%"}]}>
        <Text style={st.note}>ABC</Text>
        <Text style={{color:T.ink,fontSize:16,marginTop:5}}>{assistant}</Text>
      </View>:null}
      {userCaption?<View style={[st.card,{width:"100%"}]}>
        <Text style={st.note}>You / Aap</Text>
        <Text style={{color:T.ink,fontSize:16,marginTop:5}}>{userCaption}</Text>
      </View>:null}
      {unrelatedCount>0?<Text style={[st.note,{textAlign:"center"}]}>
        Unrelated replies: {unrelatedCount}/{UNRELATED_LIMIT}. The fifth ends the call.
      </Text>:null}
      {silenceWarning?<Text style={[st.note,{color:T.danger,textAlign:"center"}]}>
        No response detected. The call will end after 30 seconds of silence.
      </Text>:null}
      {error?<Text accessibilityRole="alert" style={{color:T.danger,textAlign:"center"}}>{error}</Text>:null}
    </ScrollView>
    <View style={{padding:20,borderTopColor:T.border,borderTopWidth:1,gap:10}}>
      <Btn en={muted?"Unmute microphone":"Mute microphone"} roman={muted?"Mic chalu karein":"Mic band karein"}
        secondary disabled={status!=="connected"} onPress={toggleMute}/>
      <Btn en="Switch to Chat" roman="Chat par jaayein" secondary onPress={()=>void swapToChat()}/>
      <Btn en="End Call" roman="Call khatam karein" onPress={()=>endVoice("manual")}/>
    </View>
  </View>;
}
