import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as SMS from "expo-sms";
import * as Speech from "expo-speech";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { File } from "expo-file-system";
import {
  api,clearTokens,restoreTokens,setDraftToken,setMemberToken,prettyField,pathValue,
  type Session,type Profile,type Lang,type Account,type Candidate
} from "./api";

const C={cream:"#FBF7F0",burgundy:"#572637",berry:"#8D4051",gold:"#C99A5D",ink:"#382D2E",
  muted:"#81777A",line:"#E8DDD3",white:"#FFFFFF",blush:"#F5E7E4",green:"#427960",red:"#B24A52"};
const radius=18;
type Screen="loading"|"welcome"|"setup"|"chat"|"review"|"verify"|"pin"|"login"|"home"|"discover"|"interests"|"account"|"paused";
const trilingual={
  language:"Which language are you comfortable with?\nआप किस भाषा में बात करना पसंद करेंगे?\nآپ کس زبان میں بات کرنا پسند کریں گے؟",
  seeking:"Who are you looking for?",
  profile:"Who are you creating this matrimonial profile for?"
};
const LANG_OPTIONS:[Lang,string,string][]=[
  ["en","English","English"],["hi","हिन्दी","Hindi"],["ur","اردو","Urdu"],["roman","Roman Urdu / Hinglish","Roman Urdu"]
];
const PHRASES:Record<Lang,{send:string;skip:string;typing:string;ready:string;next:string;}> = {
  en:{send:"Send answer",skip:"Prefer not to say",typing:"Type your answer…",ready:"Your profile is ready to review",next:"Continue"},
  hi:{send:"जवाब भेजें",skip:"नहीं बताना चाहते",typing:"अपना जवाब लिखें…",ready:"आपकी प्रोफ़ाइल तैयार है",next:"आगे बढ़ें"},
  ur:{send:"جواب بھیجیں",skip:"نہیں بتانا چاہتے",typing:"اپنا جواب لکھیے…",ready:"آپ کی پروفائل تیار ہے",next:"آگے بڑھیں"},
  roman:{send:"Jawab bhejein",skip:"Nahi batana chahte",typing:"Apna jawab likhein…",ready:"Aapki profile tayyar hai",next:"Aage badhein"}
};
const langLocale:Record<Lang,string>={en:"en-IN",hi:"hi-IN",ur:"ur-PK",roman:"hi-IN"};

function Brand({small=false}:{small?:boolean}){
  return <View style={{alignItems:"center",marginBottom:small?8:26}}>
    <View style={[s.logo,small&&{width:44,height:44,borderRadius:15,marginBottom:6}]}>
      <Text style={[s.logoText,small&&{fontSize:16}]}>ABC</Text>
    </View>
    <Text style={[s.brand,small&&{fontSize:19}]}>ABBASI BAHISHTI</Text>
    <Text style={[s.brandSub,small&&{fontSize:10}]}>C O N N E C T I O N S</Text>
  </View>;
}
function CTA({title,onPress,secondary=false,disabled=false,compact=false,danger=false}:{
 title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean;compact?:boolean;danger?:boolean
}){
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
    style={[s.button,secondary&&s.buttonOutline,compact&&{minHeight:40,paddingVertical:9},danger&&{backgroundColor:C.red},disabled&&{opacity:.45}]}>
    <Text style={[s.buttonText,secondary&&{color:C.burgundy},compact&&{fontSize:13}]}>{title}</Text>
  </Pressable>;
}
function In({label,value,onChange,placeholder,secure=false,numeric=false,multiline=false}:{
  label:string;value:string;onChange:(v:string)=>void;placeholder?:string;secure?:boolean;numeric?:boolean;multiline?:boolean
}){
  return <View style={{marginBottom:14}}>
    <Text style={s.label}>{label}</Text>
    <TextInput accessibilityLabel={label} style={[s.input,multiline&&{minHeight:92,textAlignVertical:"top"}]}
      placeholderTextColor="#A89A9C" placeholder={placeholder} value={value} onChangeText={onChange}
      secureTextEntry={secure} keyboardType={numeric?"number-pad":"default"} multiline={multiline}
      autoCapitalize={secure?"none":"sentences"} />
  </View>;
}
function Card({children}:{children:React.ReactNode}){return <View style={s.card}>{children}</View>;}
function Section({title,subtitle}:{title:string;subtitle?:string}){return <View style={{marginBottom:16}}>
  <Text style={s.h2}>{title}</Text>{subtitle?<Text style={s.muted}>{subtitle}</Text>:null}
</View>;}
function Line({name,value}:{name:string;value:unknown}){
  const display=value===null||value===undefined?"Not provided":Array.isArray(value)?JSON.stringify(value):typeof value==="object"?JSON.stringify(value):String(value);
  return <View style={{paddingVertical:9,borderBottomWidth:1,borderBottomColor:C.line}}>
    <Text style={{color:C.muted,fontSize:11,marginBottom:3}}>{name}</Text>
    <Text style={{color:C.ink,fontSize:14}}>{display}</Text>
  </View>;
}

function Application(){
  const [screen,setScreen]=useState<Screen>("loading");
  const [session,setSession]=useState<Session|null>(null);
  const [account,setAccount]=useState<Account|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [draft,setDraft]=useState("");
  const [relationship,setRelationship]=useState("");
  const [phone,setPhone]=useState("");
  const [pin,setPin]=useState("");
  const [pinAgain,setPinAgain]=useState("");
  const [voiceEnabled,setVoiceEnabled]=useState(false);
  const [sendingNumber,setSendingNumber]=useState("");
  const [sendingText,setSendingText]=useState("");
  const [editing,setEditing]=useState("");
  const [editValue,setEditValue]=useState("");
  const [consent,setConsent]=useState(false);
  const [cityQuery,setCityQuery]=useState("");
  const [discovery,setDiscovery]=useState<Candidate[]>([]);
  const [interestData,setInterestData]=useState<{sent:any[];received:any[]}>({sent:[],received:[]});
  const recorder=useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording,setRecording]=useState(false);
  const chatRef=useRef<ScrollViewInstance|null>(null);
  const lang:Lang=(session?.profile?.registration?.preferred_script as Lang)||"en";
  const txt=PHRASES[lang]||PHRASES.en;

  function goSession(value:Session){
    setSession(value);setError("");
    if(!value.profile.registration.preferred_language||!value.profile.registration.looking_for||!value.profile.registration.profile_for
      ||(value.profile.registration.profile_for==="relative"&&!value.profile.registration.registrant_relationship_to_candidate)){
      setScreen("setup");return;
    }
    if(value.phase==="COLLECTING")setScreen("chat");
    else if(value.phase==="REVIEW")setScreen("review");
    else if(value.phase==="VERIFY_PHONE")setScreen("verify");
    else if(value.phase==="SET_PIN")setScreen("pin");
    else if(value.phase==="PAUSED"||value.phase==="BLOCKED_REQUIRED")setScreen("paused");
  }
  async function run(action:()=>Promise<void>){
    if(busy)return;
    setBusy(true);setError("");
    try{await action();}
    catch(e){setError(e instanceof Error?e.message:"Something went wrong. Please retry.");}
    finally{setBusy(false);}
  }
  useEffect(()=>{
    void (async()=>{
      try{
        const tokens=await restoreTokens();
        if(tokens.member){
          try{const a=await api<Account>("/abc/me");setAccount(a);setScreen("home");return;}
          catch{await clearTokens();}
        }
        if(tokens.draft){
          try{const data=await api<{session:Session}>("/abc/state",{token:tokens.draft});goSession(data.session);return;}
          catch{await clearTokens();}
        }
        setScreen("welcome");
      }catch{setScreen("welcome");}
    })();
  },[]);
  useEffect(()=>{
    if(screen!=="verify"||!session||!sendingText)return;
    const timer=setInterval(()=>{
      void api<{phase:string;verified:boolean}>("/abc/verification/status")
        .then(async status=>{
          if(status.verified){
            const data=await api<{session:Session}>("/abc/state");
            goSession(data.session);
          }
        }).catch(()=>undefined);
    },5500);
    return ()=>clearInterval(timer);
  },[screen,session?.id,sendingText]);
  async function newProfile(){
    await run(async()=>{
      const data=await api<{token:string;session:Session}>("/abc/start",{method:"POST",body:{}});
      await setDraftToken(data.token);goSession(data.session);
    });
  }
  async function choice(field:string,value:string|boolean){
    await run(async()=>{
      const data=await api<{session:Session}>("/abc/choice",{method:"POST",body:{field,value}});
      goSession(data.session);
    });
  }
  async function respond(){
    if(!session||!draft.trim())return;
    await run(async()=>{
      const data=await api<{session:Session}>("/abc/reply",{method:"POST",body:{text:draft.trim(),version:session.version}});
      setDraft("");goSession(data.session);
      const spoken=data.session.messages[data.session.messages.length-1];
      if(voiceEnabled&&spoken?.role==="assistant")Speech.speak(spoken.text,{language:langLocale[lang],rate:.96});
    });
  }
  async function skip(){
    if(!session)return;
    await run(async()=>{
      const result=await api<{session:Session}>("/abc/skip",{method:"POST",body:{version:session.version}});
      goSession(result.session);
    });
  }
  async function resume(){
    await run(async()=>{const result=await api<{session:Session}>("/abc/resume",{method:"POST",body:{}});
      goSession(result.session);});
  }
  async function recordVoice(){
    if(recording){
      await run(async()=>{
        await recorder.stop();
        setRecording(false);
        if(!recorder.uri)throw new Error("No audio recording was captured");
        const file=new File(recorder.uri);
        const data=await file.base64();
        if(data.length>1200000)throw new Error("Voice answer is too long. Try a shorter recording.");
        const result=await api<{text:string}>("/abc/audio/transcribe",{method:"POST",body:{format:"m4a",data}});
        setDraft(result.text);
      });
      return;
    }
    await run(async()=>{
      const permission=await AudioModule.requestRecordingPermissionsAsync();
      if(!permission.granted)throw new Error("Allow microphone access to record your answer.");
      await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});
      await recorder.prepareToRecordAsync();
      recorder.record();setRecording(true);
    });
  }
  function beginEdit(path:string){
    if(!session)return;
    setEditing(path);
    const value=pathValue(session.profile,path);
    setEditValue(value===null||value===undefined?"":typeof value==="object"?JSON.stringify(value):String(value));
  }
  async function saveEdit(){
    if(!session||!editing)return;
    await run(async()=>{
      const result=await api<{session:Session}>("/abc/edit",{method:"POST",body:{path:editing,value:editValue}});
      setEditing("");setEditValue("");goSession(result.session);
    });
  }
  async function review(){
    await run(async()=>{
      const result=await api<{session:Session}>("/abc/review",{method:"POST",body:{confirmed:true,candidateConsent:consent||session?.profile.registration.profile_for==="self"}});
      goSession(result.session);
    });
  }
  async function startSMS(){
    await run(async()=>{
      const result=await api<{session:Session;number:string;message:string}>("/abc/verification/start",{method:"POST",body:{phone:phone.trim()}});
      setSendingNumber(result.number);setSendingText(result.message);goSession(result.session);
      if(await SMS.isAvailableAsync())await SMS.sendSMSAsync([result.number],result.message);
    });
  }
  async function openSMS(){
    await run(async()=>{
      if(!sendingNumber||!sendingText)throw new Error("Request your verification code first");
      if(!await SMS.isAvailableAsync())throw new Error("SMS is not supported on this device");
      await SMS.sendSMSAsync([sendingNumber],sendingText);
    });
  }
  async function createPIN(){
    if(pin!==pinAgain){setError("PINs don't match");return;}
    await run(async()=>{
      const result=await api<{token:string}>("/abc/pin/create",{method:"POST",body:{pin}});
      await setMemberToken(result.token);
      const data=await api<Account>("/abc/me");setAccount(data);setPin("");setPinAgain("");setScreen("home");
    });
  }
  async function login(){
    await run(async()=>{
      const result=await api<{token:string}>("/abc/login",{method:"POST",body:{phone,pin}});
      await setMemberToken(result.token);
      const data=await api<Account>("/abc/me");setAccount(data);setPin("");setScreen("home");
    });
  }
  async function logout(){await clearTokens();setAccount(null);setSession(null);setSendingText("");setScreen("welcome");}
  async function publish(value:boolean){
    await run(async()=>{
      await api("/abc/publish",{method:"POST",body:{visible:value}});
      const updated=await api<Account>("/abc/me");setAccount(updated);
    });
  }
  async function loadDiscover(){
    await run(async()=>{
      const data=await api<{candidates:Candidate[]}>("/abc/discover?city="+encodeURIComponent(cityQuery));
      setDiscovery(data.candidates||[]);setScreen("discover");
    });
  }
  async function loadInterests(){
    await run(async()=>{
      const data=await api<{sent:any[];received:any[]}>("/abc/interests");
      setInterestData(data);setScreen("interests");
    });
  }
  async function expressInterest(id:string){
    await run(async()=>{
      await api("/abc/interests/"+encodeURIComponent(id),{method:"POST",body:{note:""}});
      Alert.alert("Sent","Your interest has been sent privately.");
    });
  }
  async function decideInterest(id:string,action:"ACCEPT"|"DECLINE"|"WITHDRAW"){
    await run(async()=>{
      await api("/abc/interests/"+id,{method:"PATCH",body:{action}});
      const data=await api<{sent:any[];received:any[]}>("/abc/interests");
      setInterestData(data);
    });
  }

  const r=session?.profile?.registration||{};
  const setupLanguage=!r.preferred_language;
  const setupSeeking=!r.looking_for;
  const setupFor=!r.profile_for;
  const setupRelationship=r.profile_for==="relative"&&!r.registrant_relationship_to_candidate;

  function screenContent(){
    if(screen==="loading")return <View style={{alignItems:"center",justifyContent:"center",flex:1}}>
      <Brand/><ActivityIndicator color={C.burgundy} size="large"/>
    </View>;
    if(screen==="welcome")return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.welcome}>
      <Brand/>
      <View style={s.hero}>
        <Text style={s.eyebrow}>A THOUGHTFUL WAY TO BEGIN</Text>
        <Text style={s.bigTitle}>Meaningful connections begin with a conversation.</Text>
        <Text style={s.body}>No lengthy forms. Tell us about yourself or a loved one, naturally, in your own language.</Text>
      </View>
      <CTA title="I'm new · Get started" onPress={()=>void newProfile()}/>
      <View style={{height:12}}/>
      <CTA title="I already have an account · Sign in" secondary onPress={()=>setScreen("login")}/>
      <Text style={[s.fine,{marginTop:26,textAlign:"center"}]}>Private by default. You decide when your matrimonial profile is visible.</Text>
    </ScrollView>;
    if(screen==="setup")return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.pad}>
      <Brand small/>
      <View style={s.progressTrack}><View style={[s.progressBar,{width:setupLanguage?"12%":setupSeeking?"30%":setupFor?"55%":"75%"}]}/></View>
      {setupLanguage?<Card>
        <Text style={[s.h2,{lineHeight:31}]}>{trilingual.language}</Text>
        <Text style={[s.muted,{marginBottom:18}]}>Choose the language of the interview. You can write in mixed Hindi, Urdu or English.</Text>
        {LANG_OPTIONS.map(([value,label,description])=><View key={value} style={{marginBottom:10}}>
          <CTA title={label} secondary onPress={()=>void choice("preferred_language",value)}/>
        </View>)}
      </Card>:setupSeeking?<Card>
        <Text style={s.eyebrow}>FIRST, A LITTLE CONTEXT</Text>
        <Section title="Are you looking for a bride or a groom?" subtitle="हम रिश्ता किसके लिए ढूँढ रहे हैं?  |  آپ دلہن ڈھونڈ رہے ہیں یا دولہا؟"/>
        <CTA title="Looking for a bride" onPress={()=>void choice("looking_for","bride")}/>
        <View style={{height:12}}/><CTA title="Looking for a groom" secondary onPress={()=>void choice("looking_for","groom")}/>
      </Card>:setupFor?<Card>
        <Text style={s.eyebrow}>ONE MORE THING</Text>
        <Section title="Whose profile are we creating?" subtitle="This helps us ask about the correct person."/>
        <CTA title="My own profile" onPress={()=>void choice("profile_for","self")}/>
        <View style={{height:12}}/><CTA title="For my son, daughter or a relative" secondary onPress={()=>void choice("profile_for","relative")}/>
      </Card>:setupRelationship?<Card>
        <Section title="Your relationship to the candidate" subtitle="How are you related to the person whose profile we are creating?"/>
        <In label="Relationship" value={relationship} onChange={setRelationship} placeholder="Mother, father, sibling, uncle..."/>
        <CTA title="Continue to conversation" disabled={!relationship.trim()} onPress={()=>void choice("registrant_relationship_to_candidate",relationship.trim())}/>
      </Card>:null}
    </ScrollView>;
    if(screen==="chat"&&session)return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":undefined}>
      <View style={s.chatTop}><Text style={s.eyebrow}>YOUR ABC CONVERSATION</Text>
        <Text style={[s.h2,{fontSize:20,marginBottom:5}]}>Getting to know your family</Text>
        <View style={s.progressTrack}><View style={[s.progressBar,{width:session.progress+"%"}]}/></View>
        <Text style={s.fine}>{session.progress}% of profile questions addressed</Text>
      </View>
      <ScrollView ref={chatRef} style={{flex:1}} contentContainerStyle={{padding:16,paddingBottom:24}}
        onContentSizeChange={()=>chatRef.current?.scrollToEnd({animated:true})}>
        {session.messages.map((m,i)=><View key={i} style={{alignItems:m.role==="assistant"?"flex-start":"flex-end",marginVertical:6}}>
          <View style={[s.bubble,m.role==="user"?s.userBubble:s.botBubble]}>
            <Text style={[s.bubbleText,m.role==="user"&&{color:C.white}]}>{m.text}</Text>
          </View>
          {m.role==="assistant"?<Text style={[s.fine,{marginTop:3,marginLeft:6}]}>ABC ASSISTANT</Text>:null}
        </View>)}
        {busy?<View style={{padding:12,alignItems:"flex-start"}}><ActivityIndicator color={C.gold}/><Text style={s.fine}>Checking your answer…</Text></View>:null}
      </ScrollView>
      <View style={s.compose}>
        <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <Text style={s.fine}>VOICE CONVERSATION</Text>
          <View style={{flexDirection:"row",alignItems:"center",gap:8}}><Text style={s.fine}>Read answers aloud</Text>
            <Switch value={voiceEnabled} onValueChange={setVoiceEnabled} trackColor={{true:C.gold}}/>
          </View>
        </View>
        <TextInput accessibilityLabel="Your answer" placeholder={txt.typing} placeholderTextColor="#A99B9A"
          multiline value={draft} onChangeText={setDraft} style={[s.input,{minHeight:54,maxHeight:116,textAlignVertical:"center"}]}/>
        <View style={{flexDirection:"row",gap:8,marginTop:8}}>
          <View style={{flex:1}}><CTA title={recording?"■ Stop & transcribe":"🎙 Speak"} compact secondary onPress={()=>void recordVoice()} disabled={busy}/></View>
          <View style={{flex:2}}><CTA title={txt.send} compact onPress={()=>void respond()} disabled={busy||!draft.trim()||recording}/></View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Skip question" disabled={busy}
          onPress={()=>void skip()} style={{paddingTop:13,alignItems:"center"}}>
          <Text style={{color:C.muted,fontSize:12}}>{txt.skip}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>;
    if(screen==="paused")return <ScrollView contentContainerStyle={s.pad}>
      <Brand small/><Card><Section title="Your progress is saved" subtitle={session?.phase==="BLOCKED_REQUIRED"
        ?"One required detail is missing, so ABC has paused registration."
        :"Your conversation is paused. You can continue whenever you're ready."}/>
        <CTA title="Resume interview" onPress={()=>void resume()}/>
        <View style={{height:12}}/><CTA title="Back to welcome" secondary onPress={()=>setScreen("welcome")}/>
      </Card>
    </ScrollView>;
    if(screen==="review"&&session)return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.pad}>
      <Brand small/><Section title={txt.ready} subtitle="Check every answer before proceeding. Tap any detail to correct it."/>
      <Card>
        <Text style={s.eyebrow}>CANDIDATE PROFILE</Text>
        <Line name="Looking for" value={r.looking_for}/>
        <Line name="Profile for" value={r.profile_for}/>
        {Object.keys(session.fieldStates).map(path=>{
          const value=pathValue(session.profile,path),status=session.fieldStates[path];
          return <Pressable key={path} accessibilityRole="button" accessibilityLabel={"Edit "+prettyField(path)}
            onPress={()=>beginEdit(path)} style={{paddingVertical:9,borderBottomWidth:1,borderBottomColor:C.line}}>
            <Text style={s.fine}>{path.replace(/^candidate\.|^family\.|^partner_preferences\./,"").replace(/\./g,"  ›  ").replace(/_/g," ")}</Text>
            <Text style={s.body}>{status==="declined"?"Declined":status==="unknown"?"Unknown":value===null?"Not provided":typeof value==="object"?JSON.stringify(value):String(value)}</Text>
            <Text style={{fontSize:11,color:C.berry}}>Edit answer</Text>
          </Pressable>;
        })}
      </Card>
      {editing?<Card>
        <Text style={s.h2}>Correct {prettyField(editing)}</Text>
        <In label={prettyField(editing)} value={editValue} onChange={setEditValue}
          multiline={editValue.length>90||editing.includes("description")} placeholder="Enter the corrected information"/>
        <CTA title="Save corrected answer" disabled={busy||!editValue.trim()} onPress={()=>void saveEdit()}/>
        <View style={{height:10}}/><CTA title="Cancel" secondary onPress={()=>setEditing("")}/>
      </Card>:null}
      {r.profile_for==="relative"?<Pressable accessibilityRole="checkbox" accessibilityState={{checked:consent}}
          onPress={()=>setConsent(v=>!v)} style={{flexDirection:"row",alignItems:"center",gap:10,marginBottom:16}}>
        <View style={{width:24,height:24,borderRadius:5,borderColor:C.berry,borderWidth:2,backgroundColor:consent?C.berry:C.white,alignItems:"center",justifyContent:"center"}}>
          {consent?<Text style={{color:C.white}}>✓</Text>:null}
        </View>
        <Text style={[s.body,{flex:1}]}>I confirm the candidate has agreed to this profile being created for them.</Text>
      </Pressable>:null}
      <CTA title="Everything is correct · Verify mobile" disabled={busy||(r.profile_for==="relative"&&!consent)} onPress={()=>void review()}/>
    </ScrollView>;
    if(screen==="verify")return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.pad}>
      <Brand small/><Section title="Verify your mobile" subtitle="One SMS from your own number verifies your registration, without WhatsApp Business."/>
      <Card>
        <Text style={s.eyebrow}>REVERSE SMS VERIFICATION</Text>
        <Text style={[s.body,{marginBottom:16}]}>Enter the number you will send an SMS from, including +91 or your country code.</Text>
        <In label="Mobile number" value={phone} onChange={setPhone} placeholder="+91XXXXXXXXXX"/>
        {!sendingText?<CTA title="Prepare verification SMS" disabled={busy||!phone.trim()} onPress={()=>void startSMS()}/>:<>
          <Line name="Send to ABC" value={sendingNumber}/>
          <Line name="Prefilled SMS" value={sendingText}/>
          <Text style={[s.muted,{marginVertical:12}]}>Your SMS app opens with the message ready. Press Send. ABC checks the sender number using its receiving gateway. The app never reads your personal SMS inbox.</Text>
          <CTA title="Open SMS composer" disabled={busy} onPress={()=>void openSMS()}/>
          <View style={{marginTop:14,flexDirection:"row",gap:9,alignItems:"center"}}><ActivityIndicator color={C.gold}/><Text style={s.muted}>Waiting for confirmation from the ABC gateway…</Text></View>
        </>}
      </Card>
      <Text style={[s.fine,{textAlign:"center",marginTop:14}]}>Your interview and profile are saved. You can return later if the receiving number is not configured yet.</Text>
    </ScrollView>;
    if(screen==="pin")return <ScrollView contentContainerStyle={s.pad}>
      <Brand small/><Section title="Your number is verified" subtitle="Create a six-digit PIN for future sign-ins."/>
      <Card><In label="Create six-digit PIN" value={pin} onChange={setPin} secure numeric/>
        <In label="Confirm six-digit PIN" value={pinAgain} onChange={setPinAgain} secure numeric/>
        <CTA title="Finish registration" disabled={busy||pin.length!==6||pinAgain.length!==6} onPress={()=>void createPIN()}/>
      </Card>
      <Text style={s.fine}>The PIN is never shared with the AI assistant. Only its secure hash is stored on the server.</Text>
    </ScrollView>;
    if(screen==="login")return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.pad}>
      <Brand/><Section title="Welcome back" subtitle="Sign in with your verified mobile number and six-digit PIN."/>
      <Card><In label="Registered mobile number" value={phone} onChange={setPhone} placeholder="+91XXXXXXXXXX"/>
        <In label="Six-digit PIN" secure numeric value={pin} onChange={setPin}/>
        <CTA title="Sign in to ABC" disabled={busy||!phone.trim()||pin.length!==6} onPress={()=>void login()}/>
      </Card>
      <CTA title="Back to welcome" secondary onPress={()=>setScreen("welcome")}/>
    </ScrollView>;
    if(screen==="home"&&account)return <ScrollView contentContainerStyle={s.pad}>
      <Brand small/><Text style={s.eyebrow}>YOUR ABC SPACE</Text>
      <Section title={"Assalamu alaikum, "+String(account.profile.candidate.full_name||"there").split(" ")[0]}
        subtitle="Your matrimonial profile is complete and secured."/>
      <Card>
        <Text style={s.eyebrow}>YOUR PROFILE</Text>
        <Text style={[s.h2,{marginBottom:5}]}>{account.profile.candidate.full_name}</Text>
        <Text style={s.muted}>{[account.profile.candidate.age_years+" years",
          account.profile.candidate.current_location?.city,account.profile.candidate.occupation?.profession_or_role].filter(Boolean).join(" · ")}</Text>
        <View style={{height:15}}/>
        <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}>
          <View style={{flex:1}}><Text style={s.label}>Visible in Rishte discovery</Text>
            <Text style={s.fine}>You control your visibility.</Text></View>
          <Switch value={account.visible} onValueChange={v=>void publish(v)} trackColor={{true:C.gold}}/>
        </View>
      </Card>
      <View style={{gap:11}}>
        <CTA title="Explore Rishte profiles" onPress={()=>void loadDiscover()}/>
        <CTA title="Interests & introductions" secondary onPress={()=>void loadInterests()}/>
        <CTA title="View my completed profile" secondary onPress={()=>setScreen("account")}/>
      </View>
      <View style={{height:20}}/><CTA title="Sign out" secondary compact onPress={()=>void logout()}/>
    </ScrollView>;
    if(screen==="account"&&account)return <ScrollView contentContainerStyle={s.pad}>
      <Section title="Your profile" subtitle="The information you confirmed during the interview."/>
      <Card>{["candidate.full_name","candidate.gender","candidate.age_years","candidate.height_cm",
        "candidate.current_location.city","candidate.ancestral_location.city_or_town",
        "candidate.education.highest_qualification","candidate.education.two_sentence_description",
        "candidate.occupation.profession_or_role","candidate.languages",
        "family.father.name","family.father.profession","family.father.education",
        "family.mother.name","family.mother.profession","family.mother.education",
        "family.siblings.brothers_count","family.siblings.sisters_count"].map(p=><Line key={p} name={p.replace(/\./g," · ").replace(/_/g," ")} value={pathValue(account.profile,p)}/>)}</Card>
      <CTA title="Back to dashboard" onPress={()=>setScreen("home")}/>
    </ScrollView>;
    if(screen==="discover")return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.pad}>
      <Section title="Discover Rishte" subtitle="Only profiles whose owners have opted in appear here."/>
      <Card><In label="Filter by city" value={cityQuery} onChange={setCityQuery} placeholder="Delhi, Aligarh..."/>
        <CTA title="Search profiles" compact onPress={()=>void loadDiscover()}/></Card>
      {discovery.length?discovery.map(person=><Card key={person.profileId}>
        <Text style={s.h2}>{person.name}</Text>
        <Text style={s.muted}>{[person.age?person.age+" years":"",person.city,person.education].filter(Boolean).join(" · ")}</Text>
        {person.occupation?<Text style={[s.body,{marginTop:10}]}>{person.occupation}</Text>:null}
        {person.introduction?<Text style={s.body}>{person.introduction}</Text>:null}
        <View style={{height:12}}/><CTA title="Express interest" compact onPress={()=>void expressInterest(person.profileId)}/>
      </Card>):<Card><Text style={s.muted}>No published matching profiles yet. You can check back later.</Text></Card>}
      <CTA title="Back to dashboard" secondary onPress={()=>setScreen("home")}/>
    </ScrollView>;
    if(screen==="interests")return <ScrollView contentContainerStyle={s.pad}>
      <Section title="Your interests" subtitle="Manage matrimonial introductions privately."/>
      <Text style={s.h2}>Received</Text>
      {!interestData.received?.length?<Card><Text style={s.muted}>No incoming interests yet.</Text></Card>:interestData.received.map(x=><Card key={x.id}>
        <Text style={s.h2}>{x.name}</Text><Text style={s.muted}>{x.status}</Text>
        {x.status==="PENDING"?<View style={{flexDirection:"row",gap:8,marginTop:12}}>
          <View style={{flex:1}}><CTA title="Accept" compact onPress={()=>void decideInterest(x.id,"ACCEPT")}/></View>
          <View style={{flex:1}}><CTA title="Decline" compact secondary onPress={()=>void decideInterest(x.id,"DECLINE")}/></View>
        </View>:null}
      </Card>)}
      <Text style={s.h2}>Sent</Text>
      {!interestData.sent?.length?<Card><Text style={s.muted}>You haven't sent any interests yet.</Text></Card>:interestData.sent.map(x=><Card key={x.id}>
        <Text style={s.h2}>{x.name}</Text><Text style={s.muted}>{x.status}</Text>
        {x.status==="PENDING"?<CTA title="Withdraw interest" compact secondary onPress={()=>void decideInterest(x.id,"WITHDRAW")}/>:null}
      </Card>)}
      <CTA title="Back to dashboard" secondary onPress={()=>setScreen("home")}/>
    </ScrollView>;
    return <View/>;
  }

  return <SafeAreaProvider><SafeAreaView style={{flex:1,backgroundColor:C.cream}}>
    <View style={s.topBar}><View style={{flexDirection:"row",alignItems:"center",gap:9}}>
      <View style={s.topMark}><Text style={{color:C.white,fontSize:11,fontWeight:"900"}}>ABC</Text></View>
      <Text style={{color:C.burgundy,fontSize:12,fontWeight:"800",letterSpacing:1.1}}>BAHISHTI CONNECTIONS</Text>
    </View><Text style={{color:C.gold,fontWeight:"700",fontSize:11}}>EST. WITH CARE</Text></View>
    {screenContent()}
    {error?<View style={s.errorBox}><Text accessibilityRole="alert" style={{color:C.red,fontSize:13,flex:1}}>{error}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" onPress={()=>setError("")}><Text style={{color:C.berry,fontWeight:"700"}}>✕</Text></Pressable>
    </View>:null}
    {busy&&screen!=="chat"?<View style={{position:"absolute",top:58,right:15}}><ActivityIndicator color={C.burgundy}/></View>:null}
  </SafeAreaView></SafeAreaProvider>;
}
export default Application;
const s=StyleSheet.create({
  topBar:{paddingHorizontal:18,paddingVertical:12,backgroundColor:C.white,borderBottomWidth:1,borderBottomColor:C.line,
    flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  topMark:{width:34,height:34,borderRadius:11,backgroundColor:C.burgundy,alignItems:"center",justifyContent:"center"},
  welcome:{paddingHorizontal:26,paddingTop:38,paddingBottom:50,flexGrow:1,justifyContent:"center"},
  pad:{padding:20,paddingBottom:45,flexGrow:1},
  logo:{width:78,height:78,borderRadius:25,backgroundColor:C.burgundy,justifyContent:"center",alignItems:"center",
    marginBottom:15,borderWidth:2,borderColor:C.gold},
  logoText:{fontWeight:"900",fontSize:27,color:C.white},
  brand:{fontWeight:"900",fontSize:23,color:C.burgundy,letterSpacing:1.1,textAlign:"center"},
  brandSub:{fontSize:11,color:C.gold,fontWeight:"800",letterSpacing:1.5,marginTop:4},
  hero:{alignItems:"center",marginBottom:32,paddingHorizontal:7},
  eyebrow:{fontSize:10,fontWeight:"800",letterSpacing:1.5,color:C.gold,marginBottom:10},
  bigTitle:{fontSize:29,lineHeight:37,fontWeight:"800",color:C.burgundy,textAlign:"center",marginBottom:12},
  h2:{fontSize:23,fontWeight:"800",color:C.burgundy,lineHeight:29,marginBottom:9},
  body:{fontSize:15,color:C.ink,lineHeight:24},
  muted:{fontSize:13,color:C.muted,lineHeight:20},
  fine:{fontSize:11,color:C.muted,lineHeight:17},
  label:{fontSize:13,color:C.burgundy,fontWeight:"700",marginBottom:7},
  card:{borderRadius:radius,padding:19,backgroundColor:C.white,borderWidth:1,borderColor:C.line,marginBottom:15},
  button:{minHeight:51,borderRadius:14,backgroundColor:C.burgundy,paddingHorizontal:16,paddingVertical:14,
    justifyContent:"center",alignItems:"center"},
  buttonOutline:{backgroundColor:C.white,borderColor:C.burgundy,borderWidth:1},
  buttonText:{fontSize:15,fontWeight:"800",color:C.white,textAlign:"center"},
  input:{borderWidth:1,borderColor:C.line,borderRadius:13,backgroundColor:C.white,color:C.ink,
    minHeight:48,paddingVertical:12,paddingHorizontal:13,fontSize:15},
  progressTrack:{height:6,borderRadius:9,backgroundColor:C.line,overflow:"hidden",marginBottom:12},
  progressBar:{height:"100%",backgroundColor:C.gold,borderRadius:9},
  chatTop:{padding:16,backgroundColor:C.white,borderBottomWidth:1,borderBottomColor:C.line},
  bubble:{padding:15,maxWidth:"88%",borderRadius:17,borderWidth:1},
  botBubble:{backgroundColor:C.white,borderColor:C.line,borderBottomLeftRadius:5},
  userBubble:{backgroundColor:C.burgundy,borderColor:C.burgundy,borderBottomRightRadius:5},
  bubbleText:{fontSize:15,lineHeight:23,color:C.ink},
  compose:{padding:13,paddingBottom:15,backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.line},
  errorBox:{flexDirection:"row",gap:10,alignItems:"center",margin:10,backgroundColor:"#FFF0F0",
    padding:12,borderRadius:11,borderWidth:1,borderColor:"#F0CBCB"}
});
