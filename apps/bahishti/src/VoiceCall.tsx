import React,{useEffect,useRef,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,Text,View} from "react-native";
import {mediaDevices,RTCPeerConnection,RTCSessionDescription} from "react-native-webrtc";
import {api,type Session} from "./api";
import {T,st,Btn,BrandLogo} from "./minimal-ui";

type LiveEvent={
  type:string;delta?:string;start_ms?:number;end_ms?:number;offset_ms?:number;
  delegation?:{id:string;target:string};error?:{message?:string};
};
type SpokenPiece={text:string;start:number;end:number};
type Props={
  session:Session;preview?:boolean;
  onSession:(updated:Session)=>void;
  onSwitchToChat:()=>Promise<void>;
  onEnd:()=>void;
};

function displayError(error:unknown):string{
  return error instanceof Error?error.message:"The voice connection was interrupted.";
}
function clip(text:string):string{return text.trim().slice(0,440);}

// Audio is carried by WebRTC media tracks. Only event/transcript metadata goes
// over the data channel; no private API key or application database is exposed.
export default function VoiceCall({session,preview=false,onSession,onSwitchToChat,onEnd}:Props){
  const [status,setStatus]=useState<"connecting"|"connected"|"ended"|"error">(preview?"connected":"connecting");
  const [muted,setMuted]=useState(false);
  const [assistant,setAssistant]=useState("");
  const [userCaption,setUserCaption]=useState("");
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(0);
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
  const onSessionRef=useRef(onSession);
  useEffect(()=>{sessionRef.current=session;onSessionRef.current=onSession;},[session,onSession]);

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
    try{send("session.close");}catch{}
    try{dcRef.current?.close();}catch{}
    try{micRef.current?.getTracks().forEach((track:any)=>track.stop());}catch{}
    try{rtcRef.current?.close();}catch{}
    rtcRef.current=null;dcRef.current=null;micRef.current=null;
    connectedRef.current=false;
  }

  async function flushDelegation(){
    if(!activeRef.current||busyRef.current||!pendingRef.current)return;
    const pending=pendingRef.current;
    if(handledRef.current.has(pending.id))return;
    const selected=transcriptRef.current.filter(x=>x.end>lastCutRef.current&&
      x.start<=pending.offset+500);
    let heard=selected.map(x=>x.text).join("").trim();
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
    lastCutRef.current=Math.max(lastCutRef.current,...selected.map(x=>x.end));
    transcriptRef.current=transcriptRef.current.filter(x=>x.end>lastCutRef.current);
    try{
      const before=sessionRef.current;
      const data=await api<{session:Session}>("/abc/reply",{
        method:"POST",body:{text:heard,version:before.version}
      });
      if(!activeRef.current)return;
      sessionRef.current=data.session;
      onSessionRef.current(data.session);
      setSaved(data.session.progress);
      if(data.session.phase!=="COLLECTING"){
        notifySpeech("Thank you. Your answers have been saved. Please review the profile on the screen.",pending.id);
        closeTimerRef.current=setTimeout(()=>{shutdown();},2500);
      }else{
        const next=data.session.messages.at(-1)?.text||"Please continue with the next answer.";
        notifySpeech("The ABC backend saved the answer. Ask the following question naturally, then listen: "+next,pending.id);
      }
    }catch(exc){
      setError("Your answer was not saved. "+displayError(exc));
      // Allow the user to repeat rather than reporting an unconfirmed save.
      notifySpeech("The answer could not be saved. Please ask the person to repeat their last answer.",pending.id);
    }finally{busyRef.current=false;}
  }
  function handleLiveEvent(raw:string){
    if(!activeRef.current)return;
    let msg:LiveEvent;
    try{msg=JSON.parse(raw);}catch{return;}
    if(msg.type==="session.started"){
      connectedRef.current=true;setStatus("connected");
      const initial=[...sessionRef.current.messages].reverse().find(m=>m.role==="assistant")?.text||
        "Please tell me your full name and age.";
      notifySpeech("Welcome to ABC. Ask this question and listen: "+initial,null);
      return;
    }
    if(msg.type==="session.output_transcript.delta"&&msg.delta){
      setAssistant(old=>clip((old+" "+msg.delta).slice(-400)));
      return;
    }
    if(msg.type==="session.input_transcript.delta"&&msg.delta){
      transcriptRef.current.push({
        text:msg.delta,start:Number(msg.start_ms)||0,end:Number(msg.end_ms)||0
      });
      setUserCaption(old=>clip((old+msg.delta).slice(-400)));
      if(pendingRef.current){
        if(timerRef.current)clearTimeout(timerRef.current);
        timerRef.current=setTimeout(()=>void flushDelegation(),300);
      }
      return;
    }
    if(msg.type==="session.delegation.created"&&msg.delegation?.target==="client"){
      pendingRef.current={id:msg.delegation.id,offset:Number(msg.offset_ms)||0};
      if(timerRef.current)clearTimeout(timerRef.current);
      timerRef.current=setTimeout(()=>void flushDelegation(),480);
      return;
    }
    if(msg.type==="error"){setError(msg.error?.message||"The voice service reported an error.");}
    if(msg.type==="session.closed"){setStatus("ended");shutdown();}
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
        dc.onerror=()=>setError("The live audio channel had an error.");
        dc.onclose=()=>{if(activeRef.current)setStatus("ended");};
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
        const joined=await api<{sessionId:string;answer:string}>("/abc/live/connect",{
          method:"POST",body:{sdp}
        });
        if(!activeRef.current)return;
        await pc.setRemoteDescription(new RTCSessionDescription({type:"answer",sdp:joined.answer}));
        started=true;
        // Keep paid calls bounded; an interrupted interview remains resumable.
        closeTimerRef.current=setTimeout(()=>{
          if(activeRef.current){setError("Call limit reached. Your saved answers are safe.");shutdown();setStatus("ended");}
        },12*60*1000);
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
      <Text style={[st.note,{textAlign:"right",marginTop:6}]}>{session.progress||saved}% saved</Text>
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
      {error?<Text accessibilityRole="alert" style={{color:T.danger,textAlign:"center"}}>{error}</Text>:null}
    </ScrollView>
    <View style={{padding:20,borderTopColor:T.border,borderTopWidth:1,gap:10}}>
      <Btn en={muted?"Unmute microphone":"Mute microphone"} roman={muted?"Mic chalu karein":"Mic band karein"}
        secondary disabled={status!=="connected"} onPress={toggleMute}/>
      <Btn en="Switch to Chat" roman="Chat par jaayein" secondary onPress={()=>void swapToChat()}/>
      <Btn en="End Call" roman="Call khatam karein" onPress={()=>{shutdown();onEnd();}}/>
    </View>
  </View>;
}
