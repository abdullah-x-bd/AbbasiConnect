import React,{useEffect,useRef,useState} from "react";
import {
  ActivityIndicator,Alert,Image,Keyboard,KeyboardAvoidingView,Platform,Pressable,
  ScrollView,StyleSheet,Text,TextInput,View,type ScrollViewInstance
} from "react-native";
import {SafeAreaProvider,SafeAreaView} from "react-native-safe-area-context";
import {AudioModule,RecordingPresets,setAudioModeAsync,useAudioRecorder} from "expo-audio";
import * as Speech from "expo-speech";
import * as ImagePicker from "expo-image-picker";
import {File,Paths,Directory} from "expo-file-system";
import * as Sharing from "expo-sharing";
import {BiodataScreen,EnrichmentScreen,EXTRA_FIELDS,type ExtraField} from "./ExtraScreens";
import {api,clearTokens,restoreTokens,setMemberToken,
  type Session,type Account,type Candidate} from "./api";
import {T,st,H,Btn,Field,Circle,Back,Hr} from "./minimal-ui";

type Screen="loading"|"welcome"|"signupPhone"|"registered"|"verify"|"pinSignup"|"signin"|
  "language"|"purpose"|"for"|"relation"|"marital"|"chat"|"photoOffer"|"done"|"review"|
  "explore"|"interests"|"profile"|"paused"|"biodata"|"enrich";
type Interest={id:string;name:string;status:string;note?:string};
const PREVIEW=process.env.EXPO_PUBLIC_ABC_PREVIEW==="1";
const SCREENS:Screen[]=["welcome","signupPhone","registered","verify","pinSignup","signin",
  "language","purpose","for","relation","marital","chat","photoOffer","done","review",
  "explore","interests","profile","paused","biodata","enrich"];
const sampleProfile:any={
  schema_version:"1.0.0",
  registration:{preferred_language:"roman",preferred_script:"roman",looking_for:"bride",
    profile_for:"self",candidate_consent_confirmed:true},
  candidate:{full_name:"Faizan Ali",gender:"male",age_years:27,height_cm:178,
    weight_kg:null,marital_status:"never married",current_location:{city:"Delhi",state:"Delhi",country:"India"},
    ancestral_location:{city_or_town:"Aligarh",district:"Aligarh",state:"Uttar Pradesh",country:"India"},
    education:{highest_qualification:"Bachelor's degree",two_sentence_description:"I studied engineering. I graduated from Delhi."},
    occupation:{profession_or_role:"Engineer"},languages:[{name:"Urdu",can_speak:true,can_read:true,can_write:false}],
    profile_photo:null},
  family:{father:{name:"Ahmed Ali",profession:"Teacher",education:"Master's degree"},
    mother:{name:"Fatima",profession:"Homemaker",education:"Bachelor's degree"},
    siblings:{brothers_count:1,sisters_count:2}},
  partner_preferences:{}
};
const sampleMessages:any[]=[
  {role:"assistant",text:"What is the candidate's full name?\nCandidate ka poora naam kya hai?",at:"2026-11-08T00:00:00Z"},
  {role:"user",text:"Faizan Ali. Main 27 saal ka hoon, Delhi mein rehta hoon.",at:"2026-11-08T00:00:10Z"},
  {role:"assistant",text:"Thank you. What is your father's profession?\nShukriya. Aapke walid kya kaam karte hain?",at:"2026-11-08T00:00:11Z"}
];
const sampleSession:Session={
  id:"preview",phase:"COLLECTING",profile:sampleProfile,fieldStates:{},messages:sampleMessages,
  currentQuestion:"family.father.profession",progress:46,missingRequired:["family.father.profession"],
  version:3,reviewConfirmed:false,phone:"+919876543210",visible:false
};
const sampleAccount:Account={member:{id:"preview",phone:"+919876543210"},profile:sampleProfile,visible:false,phase:"COMPLETE"};
const categories:{id:string;label:string;roman:string;paths:string[]}[]=[
  {id:"candidate",label:"About the candidate",roman:"Umeedwar ke baare mein",paths:[
    "candidate.full_name","candidate.gender","candidate.age_years","candidate.height_cm","candidate.marital_status",
    "candidate.current_location.city","candidate.ancestral_location.city_or_town",
    "candidate.education.highest_qualification","candidate.education.two_sentence_description",
    "candidate.occupation.profession_or_role","candidate.languages"]},
  {id:"family",label:"Family",roman:"Khandaan",paths:[
    "family.father.name","family.father.profession","family.father.education",
    "family.mother.name","family.mother.profession","family.mother.education",
    "family.siblings.brothers_count","family.siblings.sisters_count"]},
];
const niceNames:Record<string,string>={
  "candidate.full_name":"Name","candidate.gender":"Gender","candidate.age_years":"Age",
  "candidate.height_cm":"Height (cm)","candidate.marital_status":"Marital status",
  "candidate.current_location.city":"City","candidate.ancestral_location.city_or_town":"Ancestral town",
  "candidate.education.highest_qualification":"Qualification",
  "candidate.education.two_sentence_description":"Education details",
  "candidate.occupation.profession_or_role":"Work / study","candidate.languages":"Languages",
  "family.father.name":"Father's name","family.father.profession":"Father's work",
  "family.father.education":"Father's education","family.mother.name":"Mother's name",
  "family.mother.profession":"Mother's work","family.mother.education":"Mother's education",
  "family.siblings.brothers_count":"Brothers","family.siblings.sisters_count":"Sisters"
};
const niceRoman:Record<string,string>={
  "candidate.full_name":"Naam","candidate.gender":"Jins","candidate.age_years":"Umr",
  "candidate.height_cm":"Qad","candidate.marital_status":"Shaadi ki haalat",
  "candidate.current_location.city":"Rehne ka shehar",
  "candidate.ancestral_location.city_or_town":"Aabai shehar",
  "candidate.education.highest_qualification":"Taleem",
  "candidate.education.two_sentence_description":"Taleem ki tafseel",
  "candidate.occupation.profession_or_role":"Kaam ya padhai",
  "candidate.languages":"Zubanein","family.father.name":"Walid ka naam",
  "family.father.profession":"Walid ka kaam","family.father.education":"Walid ki taleem",
  "family.mother.name":"Walida ka naam","family.mother.profession":"Walida ka kaam",
  "family.mother.education":"Walida ki taleem",
  "family.siblings.brothers_count":"Bhai","family.siblings.sisters_count":"Behnein"
};
function readAt(obj:any,path:string):any{
  return path.split(".").reduce((val,key)=>val&&typeof val==="object"?val[key]:undefined,obj);
}
function formatValue(v:any):string{
  if(v===null||v===undefined||v==="")return "Not provided / Nahi bataya";
  if(Array.isArray(v))return v.map(x=>typeof x==="string"?x:x?.name||JSON.stringify(x)).join(", ");
  return String(v);
}
function accountPage(phase:string,profile:any):Screen{
  if(phase==="COMPLETE")return "explore";
  if(phase==="REVIEW")return profile.registration?.photo_prompt_seen?"done":"photoOffer";
  if(phase==="VERIFY_PHONE"||phase==="SET_PIN")return "done";
  if(phase==="BLOCKED_REQUIRED"||phase==="PAUSED")return "paused";
  if(!profile.registration?.preferred_language)return "language";
  if(!profile.registration?.looking_for)return "purpose";
  if(!profile.registration?.profile_for)return "for";
  if(profile.registration.profile_for==="relative"&&!profile.registration.registrant_relationship_to_candidate)return "relation";
  if(!profile.candidate?.marital_status)return "marital";
  return "chat";
}
function App(){
  const [screen,setScreen]=useState<Screen>("loading");
  const [session,setSession]=useState<Session|null>(PREVIEW?sampleSession:null);
  const [account,setAccount]=useState<Account|null>(PREVIEW?sampleAccount:null);
  const [phone,setPhone]=useState(PREVIEW?"+919876543210":"+91");
  const [pin,setPin]=useState("");
  const [confirmPin,setConfirmPin]=useState("");
  const [text,setText]=useState("");
  const [relationship,setRelationship]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [image,setImage]=useState<string|null>(null);
  const [photoSaved,setPhotoSaved]=useState(false);
  const [recording,setRecording]=useState(false);
  const [consent,setConsent]=useState(false);
  const [city,setCity]=useState("");
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [interests,setInterests]=useState<{sent:Interest[];received:Interest[]}>({sent:[],received:[]});
  const [editPath,setEditPath]=useState("");
  const [editValue,setEditValue]=useState("");
  const [previewIndex,setPreviewIndex]=useState(0);
  const [biodataUri,setBiodataUri]=useState<string|null>(null);
  const [biodataFileUri,setBiodataFileUri]=useState<string|null>(null);
  const [biodataFileName,setBiodataFileName]=useState("ABC-Biodata.jpg");
  const [extraPath,setExtraPath]=useState("");
  const [extraValue,setExtraValue]=useState("");
  const [extraBack,setExtraBack]=useState<"done"|"profile">("done");
  const [biodataBack,setBiodataBack]=useState<"done"|"profile">("done");
  const scrollRef=useRef<ScrollViewInstance|null>(null);
  const recorder=useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  async function task(f:()=>Promise<void>){
    if(busy)return;
    setBusy(true);setError("");
    try{await f();}
    catch(e){setError(e instanceof Error?e.message:"Something went wrong. Please try again. / Dobara koshish karein.");}
    finally{setBusy(false);}
  }
  function goState(s:Session){
    setSession(s);
    setScreen(accountPage(s.phase,s.profile));
  }
  async function refreshAccount(){
    const acc=await api<Account>("/abc/me");
    setAccount(acc);
    return acc;
  }
  async function refreshSession(){
    const data=await api<{session:Session}>("/abc/state");
    goState(data.session);
    return data.session;
  }
  useEffect(()=>{
    if(PREVIEW){setScreen("welcome");return;}
    void (async()=>{
      try{
        const {member}=await restoreTokens();
        if(member){
          const acc=await refreshAccount();
          const data=await api<{session:Session}>("/abc/state");
          setSession(data.session);setScreen(accountPage(acc.phase,data.session.profile));return;
        }
      }catch{await clearTokens().catch(()=>undefined);}
      setScreen("welcome");
    })();
  },[]);
  useEffect(()=>{
    if(!PREVIEW&&account&&(screen==="chat"||screen==="profile"))void openPhoto();
  },[screen,account?.member?.id]);
  useEffect(()=>{
    if(screen!=="chat")return;
    const listener=Keyboard.addListener("keyboardDidShow",()=>
      requestAnimationFrame(()=>scrollRef.current?.scrollToEnd({animated:true})));
    return ()=>listener.remove();
  },[screen]);
  function previewNext(){
    const i=(previewIndex+1)%SCREENS.length;
    setPreviewIndex(i);
    setError("");setScreen(SCREENS[i]);
  }
  function speakMessage(answer:string){
    if(PREVIEW)return;
    void Speech.stop();
    const lang=session?.profile.registration?.preferred_language;
    Speech.speak(answer.replace(/\n/g,". "),{
      language:lang==="en"?"en-IN":lang==="ur"?"ur-PK":"hi-IN",
      rate:.9,pitch:1
    });
  }
  async function choose(field:string,value:string){
    if(PREVIEW){
      setScreen(field==="preferred_language"?"purpose":
        field==="looking_for"?"for":
        field==="profile_for"?(value==="relative"?"relation":"marital"):
        field==="registrant_relationship_to_candidate"?"marital":"chat");
      return;
    }
    await task(async()=>{
      const d=await api<{session:Session}>("/abc/choice",{method:"POST",body:{field,value}});
      goState(d.session);
    });
  }
  async function signup(){
    if(pin.length!==4||pin!==confirmPin){setError("Enter the same four-digit PIN twice. / Dono PIN ek jaise hon.");return;}
    if(PREVIEW){setScreen("language");return;}
    await task(async()=>{
      const result=await api<{token:string;session:Session}>("/abc/signup",{method:"POST",body:{phone:phone.trim(),pin}});
      await setMemberToken(result.token);
      setPin("");setConfirmPin("");
      await refreshAccount();
      goState(result.session);
    });
  }
  async function signin(){
    if(PREVIEW){setScreen("chat");return;}
    await task(async()=>{
      const result=await api<{token:string}>("/abc/login",{method:"POST",body:{phone:phone.trim(),pin}});
      await setMemberToken(result.token);
      setPin("");
      const a=await refreshAccount();
      const d=await api<{session:Session}>("/abc/state");
      setSession(d.session);setScreen(accountPage(a.phase,d.session.profile));
    });
  }
  async function sendAnswer(answer:string){
    if(!answer.trim()||!session)return;
    await task(async()=>{
      const result=await api<{session:Session}>("/abc/reply",{
        method:"POST",body:{text:answer.trim(),version:session.version}
      });
      setText("");
      goState(result.session);
    });
  }
  async function startVoice(){
    if(PREVIEW){setRecording(true);return;}
    await task(async()=>{
      const permission=await AudioModule.requestRecordingPermissionsAsync();
      if(!permission.granted)throw Error("Microphone permission is needed. / Mic ki ijazat dein.");
      await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    });
  }
  async function stopVoice(){
    if(PREVIEW){setRecording(false);setText("Main Delhi mein rehta hoon.");return;}
    await task(async()=>{
      await recorder.stop();
      setRecording(false);
      if(!recorder.uri)throw Error("No recording was captured. / Awaaz nahi mili.");
      const data=await new File(recorder.uri).base64();
      if(data.length>1200000)throw Error("Please use a shorter voice answer. / Chhoti recording karein.");
      const result=await api<{text:string}>("/abc/audio/transcribe",{
        method:"POST",body:{data,format:"m4a"}
      });
      setText(current=>current.trim()?current.trim()+" "+result.text:result.text);
    });
  }
  async function checkPhone(){
    if(PREVIEW){setScreen("verify");return;}
    await task(async()=>{
      const result=await api<{registered:boolean}>("/abc/phone/check",{method:"POST",body:{phone:phone.trim()}});
      setScreen(result.registered?"registered":"verify");
    });
  }
  async function skipPhotoPrompt(){
    if(PREVIEW){setScreen("done");return;}
    await task(async()=>{
      const result=await api<{session:Session}>("/abc/photo/prompt",{method:"POST",body:{}});
      goState(result.session);
    });
  }
  async function pickPhoto(){
    if(PREVIEW){setPhotoSaved(true);if(screen==="photoOffer")setScreen("done");return;}
    await task(async()=>{
      const selection=await ImagePicker.launchImageLibraryAsync({
        mediaTypes:["images"],allowsEditing:true,aspect:[1,1],quality:.55,base64:true
      });
      if(selection.canceled||!selection.assets[0])return;
      const item=selection.assets[0];
      if(!item.base64)throw Error("This photo could not be read. / Tasveer nahi padh sake.");
      const mime=item.mimeType==="image/png"?"image/png":"image/jpeg";
      if(item.base64.length>1250000)throw Error("Choose a smaller photo. / Chhoti tasveer chunen.");
      await api("/abc/photo",{method:"POST",body:{base64:item.base64,mime}});
      setImage("data:"+mime+";base64,"+item.base64);
      setPhotoSaved(true);
      const state=await api<{session:Session}>("/abc/state");
      setSession(state.session);
      if(screen==="photoOffer")setScreen("done");
    });
  }
  async function deletePhoto(){
    if(PREVIEW){setImage(null);setPhotoSaved(false);return;}
    await task(async()=>{await api("/abc/photo",{method:"DELETE"});
      setImage(null);setPhotoSaved(false);
      const state=await api<{session:Session}>("/abc/state");setSession(state.session);});
  }
  async function openPhoto(){
    if(PREVIEW)return;
    try{
      const value=await api<{dataUri:string|null}>("/abc/photo");
      setImage(value.dataUri);setPhotoSaved(Boolean(value.dataUri));
    }catch{/* Photo is optional. */}
  }

  function optionalSelect(field:ExtraField){
    setExtraPath(field.path);
    const value=field.path?readAt(session?.profile||account?.profile,field.path):"";
    setExtraValue(Array.isArray(value)?value.join(", "):value==null?"":String(value));
  }
  function openExtras(back:"done"|"profile"){
    setExtraBack(back);setExtraPath("");setExtraValue("");setScreen("enrich");
  }
  async function saveExtra(){
    if(!extraPath||!session)return;
    if(PREVIEW){setExtraPath("");return;}
    await task(async()=>{
      const value=extraPath==="partner_preferences.preferred_cities_or_regions"?
        extraValue.split(",").map(x=>x.trim()).filter(Boolean):extraValue.trim();
      const result=await api<{session:Session}>("/abc/enrichment",{method:"POST",body:{
        path:extraPath,value,version:session.version
      }});
      setSession(result.session);setExtraPath("");setExtraValue("");
      await refreshAccount();
      setScreen("enrich");
    });
  }
  async function openBiodata(back:"done"|"profile"){
    setBiodataBack(back);
    if(PREVIEW){setScreen("biodata");return;}
    await task(async()=>{
      // A relative's profile must be confirmed before it is exported.
      if(session?.phase==="REVIEW"){
        const result=await api<{session:Session}>("/abc/review",{method:"POST",body:{
          confirmed:true,candidateConsent:session.profile.registration.profile_for==="self"||consent
        }});
        setSession(result.session);
      }
      const img=await api<{mimeType:string;filename:string;width:number;height:number;base64:string}>("/abc/biodata");
      if(img.mimeType!=="image/jpeg"||!img.base64||img.width!==1080||img.height!==1350)
        throw Error("The biodata image was not generated. / Biodata tasveer nahi bani.");
      const safeName=String(readAt(session?.profile||account?.profile,"candidate.full_name")||"Candidate")
        .replace(/[^A-Za-z0-9 ]/g,"").trim().replace(/\s+/g,"-").slice(0,36);
      const filename="ABC-Biodata-"+(safeName||"Candidate")+".jpg";
      const file=new File(Paths.document,filename);
      await file.write(img.base64,{encoding:"base64"});
      setBiodataUri("data:image/jpeg;base64,"+img.base64);
      setBiodataFileUri(file.uri);setBiodataFileName(filename);
      setScreen("biodata");
    });
  }
  async function saveBiodata(){
    if(PREVIEW){Alert.alert("Preview","Saving is enabled in the real app.");return;}
    if(!biodataFileUri)return;
    await task(async()=>{
      if(Platform.OS==="android"){
        const folder=await Directory.pickDirectoryAsync();
        if(!folder)return;
        const source=new File(biodataFileUri);
        await source.copy(new File(folder,biodataFileName));
        Alert.alert("JPEG saved / Save ho gaya","Your ABC biodata is saved in the selected folder.");
      }else{
        if(await Sharing.isAvailableAsync())
          await Sharing.shareAsync(biodataFileUri,{mimeType:"image/jpeg",dialogTitle:"Save ABC biodata"});
      }
    });
  }
  async function shareBiodata(){
    if(PREVIEW){Alert.alert("Preview","Sharing is enabled in the real app.");return;}
    if(!biodataFileUri)return;
    await task(async()=>{
      if(!await Sharing.isAvailableAsync())throw Error("Sharing is unavailable on this phone.");
      await Sharing.shareAsync(biodataFileUri,{mimeType:"image/jpeg",dialogTitle:"Share ABC biodata"});
    });
  }

  async function completeInterview(){
    if(PREVIEW){setScreen("explore");return;}
    await task(async()=>{
      if(session?.phase==="REVIEW"){
        const r=await api<{session:Session}>("/abc/review",{
          method:"POST",body:{confirmed:true,candidateConsent:session.profile.registration.profile_for==="self"||consent}
        });
        setSession(r.session);
      }
      await refreshAccount();
      setScreen("explore");
    });
  }
  async function search(){
    if(PREVIEW){setScreen("explore");return;}
    await task(async()=>{
      const d=await api<{candidates:Candidate[]}>("/abc/discover?city="+encodeURIComponent(city));
      setCandidates(d.candidates||[]);
      setScreen("explore");
    });
  }
  async function interestsPage(){
    if(PREVIEW){setScreen("interests");return;}
    await task(async()=>{
      const d=await api<{sent:Interest[];received:Interest[]}>("/abc/interests");
      setInterests(d);setScreen("interests");
    });
  }
  async function interest(id:string){
    await task(async()=>{
      await api("/abc/interests/"+id,{method:"POST",body:{note:""}});
      Alert.alert("Sent / Bhej diya","Interest sent. / Aapki dilchaspi bhej di gayi.");
    });
  }
  async function decide(id:string,action:"ACCEPT"|"DECLINE"|"WITHDRAW"){
    await task(async()=>{await api("/abc/interests/"+id,{method:"PATCH",body:{action}});
      const d=await api<{sent:Interest[];received:Interest[]}>("/abc/interests");setInterests(d);});
  }
  async function logout(){
    await clearTokens();setAccount(null);setSession(null);setImage(null);
    setText("");setPhone("+91");setScreen("welcome");
  }
  async function resume(){
    await task(async()=>{const r=await api<{session:Session}>("/abc/resume",{method:"POST",body:{}});goState(r.session);});
  }
  async function saveEdit(){
    if(!editPath||!session)return;
    await task(async()=>{
      let v:any=editValue;
      if(["candidate.age_years","candidate.height_cm","family.siblings.brothers_count","family.siblings.sisters_count"].includes(editPath))v=Number(editValue);
      if(editPath==="candidate.languages")v=JSON.parse(editValue);
      const d=await api<{session:Session}>("/abc/edit",{method:"POST",body:{path:editPath,value:v}});
      setEditPath("");setEditValue("");goState(d.session);
      if(d.session.phase==="REVIEW"||d.session.phase==="COMPLETE")setScreen("review");
    });
  }
  function edit(path:string){
    setEditPath(path);
    const value=readAt(session?.profile,path);
    setEditValue(Array.isArray(value)?JSON.stringify(value):value==null?"":String(value));
  }
  const profile=session?.profile||account?.profile||sampleProfile;
  const forRelative=profile.registration?.profile_for==="relative";
  function header(title:string,back:()=>void,small?:string){
    return <View style={styles.header}>
      <Back onPress={back}/>
      <View style={{flex:1}}><Text style={styles.headerText}>{title}</Text>{small?<Text style={styles.headerSmall}>{small}</Text>:null}</View>
      <Text style={styles.headerABC}>ABC</Text>
    </View>;
  }
  function footer(active:"explore"|"interests"|"profile"){
    return <View style={st.tabbar}>
      {([["explore","Explore","Rishte"],["interests","Interests","Dilchaspi"],["profile","Profile","Meri profile"]] as const).map(([id,en,roman])=>
        <Pressable key={id} accessibilityRole="tab" accessibilityLabel={en} onPress={()=>{
          if(id==="explore")void search();else if(id==="interests")void interestsPage();else{setScreen("profile");void openPhoto();}
        }} style={st.tab}>
          <Text style={[st.tabTxt,id===active&&{color:T.accent,fontWeight:"800"}]}>{en}</Text>
          <Text style={[st.tabSmall,id===active&&{color:T.accent}]}>{roman}</Text>
        </Pressable>)}
    </View>;
  }
  function choicePage(title:string,roman:string,options:{en:string;roman:string;value:string}[],field:string){
    return <View style={st.page}>
      {header("ABC",()=>setScreen(field==="looking_for"?"pinSignup":field==="profile_for"?"purpose":"for"))}
      <View style={[st.inner,{justifyContent:"center",paddingBottom:84}]}>
        <H en={title} roman={roman}/>
        {options.map(o=><View key={o.value} style={{marginBottom:14}}>
          <Btn en={o.en} roman={o.roman} secondary onPress={()=>void choose(field,o.value)}/>
        </View>)}
      </View>
    </View>;
  }
  function chatScreen(){
    const messages=session?.messages||[];
    return <KeyboardAvoidingView style={st.page} behavior={Platform.OS==="ios"?"padding":"height"} keyboardVerticalOffset={0}>
      {header("Conversation",()=>Alert.alert("Saved / Save ho gaya","Your answers remain saved. / Jawaab save rahenge."),"Baat-cheet")}
      <View style={{paddingHorizontal:22,paddingBottom:10}}>
        <View style={st.progress}><View style={[st.progressFill,{width:(session?.progress||0)+"%"}]}/></View>
      </View>
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal:16,paddingTop:13,paddingBottom:32}}
        onContentSizeChange={()=>scrollRef.current?.scrollToEnd({animated:true})} style={{flex:1}}>
        {messages.map((m,i)=><View key={i} style={[st.bubble,m.role==="assistant"?st.aiBubble:st.myBubble]}>
          <Pressable disabled={m.role!=="assistant"} accessibilityRole={m.role==="assistant"?"button":"text"}
            accessibilityLabel={m.role==="assistant"?"Listen to the question":"Your reply"}
            onPress={()=>{if(m.role==="assistant")speakMessage(m.text);}}>
            <Text style={[st.bubbleText,m.role==="user"&&{color:T.white}]}>{m.text}</Text>
          </Pressable>
        </View>)}
        {photoSaved?<View style={{alignSelf:"flex-end",backgroundColor:T.light,padding:11,borderRadius:14,marginBottom:12}}>
          <Text style={{fontSize:14,color:T.accent}}>Photo saved / Tasveer save hai</Text>
          {image?<Image source={{uri:image}} style={{height:68,width:68,borderRadius:12,marginTop:8}}/>:null}
        </View>:null}
        {busy?<View style={{padding:8,flexDirection:"row",gap:8,alignItems:"center"}}>
          <ActivityIndicator color={T.accent}/><Text style={st.note}>Checking / Dekh rahe hain…</Text>
        </View>:null}
      </ScrollView>
      <View style={styles.composer}>
        <Circle text="+" label="Add optional profile photo" onPress={()=>void pickPhoto()} disabled={busy}/>
        <TextInput style={styles.composeInput}
          placeholder={profile.registration?.preferred_language==="en"?"Type your answer…":"Apna jawab likhein…"}
          accessibilityLabel="Your answer" multiline placeholderTextColor={T.faint}
          value={text} onChangeText={setText} onFocus={()=>
            requestAnimationFrame(()=>scrollRef.current?.scrollToEnd({animated:true}))}/>
        <Circle text={recording?"■":"🎤"} kind="accent" size={43} disabled={busy}
          label={recording?"Stop voice recording":"Start voice recording"}
          onPress={()=>recording?void stopVoice():void startVoice()}/>
        <Circle text="↑" kind="accent" size={46} disabled={busy||recording||!text.trim()}
          label="Send answer" onPress={()=>void sendAnswer(text)}/>
      </View>
    </KeyboardAvoidingView>;
  }
  function reviewPage(){
    return <View style={st.page}>
      {header("Your answers",()=>setScreen("done"),"Aapke jawaab")}
      <ScrollView contentContainerStyle={st.inner} keyboardShouldPersistTaps="handled">
        {categories.map(cat=><View key={cat.id} style={{marginBottom:20}}>
          <Text style={{fontSize:19,fontWeight:"700",color:T.ink}}>{cat.label}</Text>
          <Text style={[st.note,{marginBottom:10}]}>{cat.roman}</Text>
          <View style={st.card}>{cat.paths.map((path,i)=><View key={path}>
            {i>0?<Hr/>:null}
            <Pressable accessibilityRole="button" accessibilityLabel={"Edit "+niceNames[path]}
              onPress={()=>edit(path)} style={{flexDirection:"row",alignItems:"center",gap:9}}>
              <View style={{flex:1}}><Text style={st.note}>{niceNames[path]} / {niceRoman[path]}</Text>
                <Text style={{fontSize:15,color:T.ink,marginTop:4,lineHeight:22}}>{formatValue(readAt(profile,path))}</Text>
              </View>
              <Text style={{fontSize:14,color:T.accent}}>Edit</Text>
            </Pressable>
          </View>)}</View>
        </View>)}
        {editPath?<View style={[st.card,{marginBottom:18}]}>
          <Text style={st.inputLabel}>{niceNames[editPath]||editPath}</Text>
          <Field label="Correction" roman="Sahi jawaab" value={editValue} onChangeText={setEditValue}
            multiline={editValue.length>55}/>
          <Btn en="Save answer" roman="Jawaab save karein" onPress={()=>void saveEdit()}/>
          <View style={{height:8}}/><Btn en="Cancel" roman="Rehne dein" secondary onPress={()=>setEditPath("")}/>
        </View>:null}
        <Btn en="Done" roman="Ho gaya" onPress={()=>setScreen("done")}/>
      </ScrollView>
    </View>;
  }
  function showExplore(){
    return <View style={st.page}>
      <View style={styles.exploreHeader}><Text style={st.logo}>ABC</Text>
        <Text style={[st.note,{marginTop:3}]}>Explore / Rishte dekhein</Text></View>
      <ScrollView contentContainerStyle={{paddingHorizontal:21,paddingTop:10,paddingBottom:25}} keyboardShouldPersistTaps="handled">
        <View style={styles.search}>
          <Text style={{fontSize:20,color:T.faint,marginRight:10}}>⌕</Text>
          <TextInput style={{flex:1,fontSize:16,color:T.ink}} placeholder="City / Shehar" accessibilityLabel="Search city"
            placeholderTextColor={T.faint} value={city} onChangeText={setCity} onSubmitEditing={()=>void search()}/>
          <Pressable accessibilityRole="button" accessibilityLabel="Search profiles" onPress={()=>void search()}>
            <Text style={{fontSize:15,fontWeight:"700",color:T.accent}}>Go</Text>
          </Pressable>
        </View>
        {!candidates.length?<View style={{alignItems:"center",paddingTop:80,paddingHorizontal:10}}>
          <View style={{width:64,height:64,borderRadius:32,backgroundColor:T.light,alignItems:"center",justifyContent:"center",marginBottom:20}}>
            <Text style={{fontSize:30,color:T.accent}}>♡</Text>
          </View>
          <Text style={{fontSize:22,fontWeight:"700",color:T.ink,textAlign:"center"}}>No profiles here yet</Text>
          <Text style={[st.sub,{textAlign:"center"}]}>Abhi yahan koi profile nahi hai.</Text>
          <Text style={[st.note,{textAlign:"center",marginTop:12}]}>Profiles appear when members choose to share them.</Text>
        </View>:candidates.map(c=><View key={c.profileId} style={[st.card,{marginBottom:13}]}>
          <View style={{flexDirection:"row",gap:12,alignItems:"center"}}>
            <View style={styles.avatar}><Text style={{fontSize:23,color:T.accent,fontWeight:"700"}}>{String(c.name||"?").slice(0,1)}</Text></View>
            <View style={{flex:1}}><Text style={{fontSize:19,fontWeight:"700",color:T.ink}}>{c.name}</Text>
              <Text style={st.note}>{[c.age?c.age+" years":null,c.city,c.education].filter(Boolean).join(" · ")}</Text></View>
          </View>
          {c.occupation?<Text style={[st.sub,{marginTop:10}]}>{c.occupation}</Text>:null}
          <View style={{marginTop:15}}><Btn compact en="I'm interested" roman="Dilchaspi hai"
            onPress={()=>void interest(c.profileId)}/></View>
        </View>)}
      </ScrollView>
      {footer("explore")}
    </View>;
  }
  function interestsScreen(){
    return <View style={st.page}>
      <View style={styles.exploreHeader}><Text style={{fontSize:26,fontWeight:"700",color:T.ink}}>Interests</Text>
        <Text style={st.roman}>Dilchaspi</Text></View>
      <ScrollView contentContainerStyle={st.inner}>
        <Text style={styles.groupTitle}>Received / Jo aaye</Text>
        {!interests.received.length?<View style={styles.empty}><Text style={st.sub}>No interests yet.</Text>
          <Text style={st.roman}>Abhi koi interest nahi aaya.</Text></View>:interests.received.map(x=><View key={x.id} style={[st.card,{marginBottom:12}]}>
          <Text style={styles.groupTitle}>{x.name}</Text><Text style={st.note}>{x.status}</Text>
          {x.status==="PENDING"?<View style={{flexDirection:"row",gap:10,marginTop:15}}>
            <View style={{flex:1}}><Btn compact en="Accept" roman="Qubool" onPress={()=>void decide(x.id,"ACCEPT")}/></View>
            <View style={{flex:1}}><Btn compact secondary en="Decline" roman="Mana karein" onPress={()=>void decide(x.id,"DECLINE")}/></View>
          </View>:null}</View>)}
        <Text style={[styles.groupTitle,{marginTop:25}]}>Sent / Jo bheje</Text>
        {!interests.sent.length?<View style={styles.empty}><Text style={st.sub}>Nothing sent yet.</Text>
          <Text style={st.roman}>Abhi kuch nahi bheja.</Text></View>:interests.sent.map(x=><View key={x.id} style={[st.card,{marginBottom:12}]}>
          <Text style={styles.groupTitle}>{x.name}</Text><Text style={st.note}>{x.status}</Text>
          {x.status==="PENDING"?<Btn compact secondary en="Withdraw" roman="Wapas lein" onPress={()=>void decide(x.id,"WITHDRAW")}/>:null}
        </View>)}
      </ScrollView>{footer("interests")}
    </View>;
  }
  function profileScreen(){
    return <View style={st.page}>
      <View style={styles.exploreHeader}><Text style={{fontSize:26,fontWeight:"700",color:T.ink}}>My profile</Text>
        <Text style={st.roman}>Meri profile</Text></View>
      <ScrollView contentContainerStyle={st.inner}>
        <View style={{alignItems:"center",marginBottom:27}}>
          {image?<Image source={{uri:image}} style={{height:96,width:96,borderRadius:48}}/>:
            <View style={[styles.avatar,{width:96,height:96,borderRadius:48}]}>
              <Text style={{fontSize:34,color:T.accent}}>{String(profile.candidate?.full_name||"A").slice(0,1)}</Text>
            </View>}
          <Text style={{fontSize:24,color:T.ink,fontWeight:"700",marginTop:14}}>{profile.candidate?.full_name||"Your name"}</Text>
          <Text style={st.sub}>{[profile.candidate?.age_years?profile.candidate.age_years+" years":null,
            profile.candidate?.current_location?.city].filter(Boolean).join(" · ")}</Text>
          <View style={{height:16}}/>
          <Btn compact secondary en={image?"Change photo":"Add photo"} roman="Tasveer lagayein" onPress={()=>void pickPhoto()}/>
          {image?<Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={()=>void deletePhoto()}
            style={{marginTop:12}}><Text style={st.note}>Remove photo / Tasveer hataein</Text></Pressable>:null}
        </View>
        <View style={st.card}>
          <Text style={styles.groupTitle}>Your information</Text>
          <Text style={[st.note,{marginBottom:12}]}>Aapki jaankari</Text>
          {["candidate.education.highest_qualification","candidate.occupation.profession_or_role",
            "candidate.ancestral_location.city_or_town","family.siblings.brothers_count",
            "family.siblings.sisters_count"].map((x,i)=><View key={x}>
            {i>0?<Hr/>:null}
            <Text style={st.note}>{niceNames[x]} / {niceRoman[x]}</Text>
            <Text style={[st.sub,{color:T.ink,marginTop:2}]}>{formatValue(readAt(profile,x))}</Text>
          </View>)}
        </View>
        <View style={{height:18}}/>
        <Btn en="Download Bio Data" roman="Biodata JPEG banayein" onPress={()=>void openBiodata("profile")}/>
        <View style={{height:12}}/>
        <Btn secondary en="Add More Details" roman="Aur jaankari dein" onPress={()=>openExtras("profile")}/>
        <View style={{height:18}}/>
        <Btn secondary en="Sign out" roman="Logout karein" onPress={()=>void logout()}/>
        <View style={{height:20}}/>
        <Text style={[st.note,{textAlign:"center"}]}>
          Phone verification is not active in this test version. / Is version mein SMS tasdeeq abhi band hai.
        </Text>
      </ScrollView>{footer("profile")}
    </View>;
  }

  function content(){
    if(screen==="loading")return <View style={{flex:1,justifyContent:"center",alignItems:"center"}}>
      <Text style={st.logo}>ABC</Text><ActivityIndicator style={{marginTop:20}} color={T.accent}/></View>;
    if(screen==="welcome")return <View style={[st.page,{paddingHorizontal:28,justifyContent:"center"}]}>
      <View style={{alignItems:"center",marginBottom:75}}>
        <Text style={[st.logo,{fontSize:59,letterSpacing:-3}]}>ABC</Text>
        <Text style={[st.app,{fontSize:18,textAlign:"center",marginTop:10}]}>Abbasi Bahishti Connections</Text>
      </View>
      <Btn en="Sign up" roman="Naya account banayein" onPress={()=>setScreen("signupPhone")}/>
      <View style={{height:13}}/>
      <Btn en="Log in" roman="Login karein" secondary onPress={()=>setScreen("signin")}/>
    </View>;
    if(screen==="signupPhone")return <View style={st.page}>
      {header("Sign up",()=>setScreen("welcome"),"Naya account")}
      <View style={[st.inner,{justifyContent:"center",paddingBottom:95}]}>
        <H en="Your mobile number" roman="Apna mobile number batayein"/>
        <Field label="Phone number" roman="Mobile number" value={phone} numeric onChangeText={setPhone}
          placeholder="+91 98765 43210" autoComplete="tel"/>
        <Btn en="Continue" roman="Aage badhein" disabled={phone.replace(/\D/g,"").length<10}
          onPress={()=>setScreen("verify")}/>
      </View></View>;
    if(screen==="verify")return <View style={st.page}>
      {header("Verify number",()=>setScreen("signupPhone"),"Number ki tasdeeq")}
      <View style={[st.inner,{justifyContent:"center",paddingBottom:85}]}>
        <View style={{alignItems:"center",marginBottom:24}}>
          <View style={[styles.avatar,{width:84,height:84,borderRadius:42}]}>
            <Text style={{fontSize:38,color:T.accent}}>✓</Text></View>
        </View>
        <H en="Continue with this number?" roman="Isi number se aage badhein?" center/>
        <Text style={[styles.phoneText,{textAlign:"center",marginBottom:25}]}>{phone}</Text>
        <View style={[st.card,{backgroundColor:T.soft,marginBottom:26}]}>
          <Text style={st.note}>SMS verification is not active yet.</Text>
          <Text style={[st.note,{marginTop:4}]}>Abhi SMS se tasdeeq nahi ho rahi. Yeh test version hai.</Text>
        </View>
        <Btn en="Verify & continue" roman="Aage badhein" onPress={()=>setScreen("pinSignup")}/>
      </View></View>;
    if(screen==="pinSignup")return <View style={st.page}>
      {header("Create PIN",()=>setScreen("verify"),"PIN banayein")}
      <View style={[st.inner,{justifyContent:"center",paddingBottom:85}]}>
        <H en="Choose a 4-digit PIN" roman="Chaar number ka PIN banayein"/>
        <Field label="PIN" roman="Chaar digit" value={pin} onChangeText={setPin} numeric secure
          maxLength={4} placeholder="••••"/>
        <Field label="Repeat PIN" roman="PIN dobara likhein" value={confirmPin}
          onChangeText={setConfirmPin} numeric secure maxLength={4} placeholder="••••"/>
        <Btn en="Create account" roman="Account banayein" disabled={busy||pin.length!==4||confirmPin.length!==4}
          onPress={()=>void signup()}/>
        <Text style={[st.note,{textAlign:"center",marginTop:16}]}>
          Your account and future answers are saved. / Account aur jawaab save rahenge.
        </Text>
      </View></View>;
    if(screen==="signin")return <View style={st.page}>
      {header("Log in",()=>setScreen("welcome"),"Login karein")}
      <View style={[st.inner,{justifyContent:"center",paddingBottom:95}]}>
        <H en="Welcome back" roman="Dobara khush aamdeed"/>
        <Field label="Mobile number" roman="Phone number" value={phone} numeric onChangeText={setPhone}/>
        <Field label="Your PIN" roman="Apna PIN" value={pin} numeric secure onChangeText={setPin} maxLength={6}/>
        <Btn en="Log in" roman="Login karein" disabled={busy||pin.length<4||!phone.trim()} onPress={()=>void signin()}/>
      </View></View>;
    if(screen==="purpose")return choicePage("Looking for a…","Aap kise dhoond rahe hain?",[
      {en:"Bride",roman:"Dulhan",value:"bride"},
      {en:"Groom",roman:"Dulha",value:"groom"}
    ],"looking_for");
    if(screen==="for")return choicePage("Whose profile is this?","Yeh profile kiski hai?",[
      {en:"My own",roman:"Meri apni",value:"self"},
      {en:"A family member's",roman:"Ghar waale ki",value:"relative"}
    ],"profile_for");
    if(screen==="relation")return <View style={st.page}>
      {header("Relationship",()=>setScreen("for"),"Rishta kya hai?")}
      <View style={[st.inner,{justifyContent:"center",paddingBottom:85}]}>
        <H en="How are you related?" roman="Aapka unse kya rishta hai?"/>
        {[["Mother","Walida"],["Father","Walid"],["Brother / sister","Bhai / Behen"]].map(([en,roman])=>
          <View key={en} style={{marginBottom:11}}><Btn secondary en={en} roman={roman}
            onPress={()=>void choose("registrant_relationship_to_candidate",en)}/></View>)}
        <View style={{height:5}}/>
        <Field label="Or enter another relationship" roman="Ya rishta likhein" value={relationship}
          onChangeText={setRelationship} placeholder="Uncle / Chacha…"/>
        <Btn en="Continue" roman="Aage badhein" disabled={!relationship.trim()}
          onPress={()=>void choose("registrant_relationship_to_candidate",relationship.trim())}/>
      </View></View>;
    if(screen==="chat"||screen==="chatPhoto"||screen==="recording")return chatScreen();
    if(screen==="paused")return <View style={st.page}>
      {header("Paused",()=>setScreen("welcome"),"Thoda ruk gaye")}
      <View style={[st.inner,{justifyContent:"center",paddingBottom:75}]}>
        <H en="Your answers are saved." roman="Aapke jawaab save hain."/>
        <Text style={[st.sub,{marginBottom:27}]}>You can return whenever you're ready.</Text>
        <Btn en="Continue questions" roman="Sawaal jaari rakhein" onPress={()=>void resume()}/>
      </View></View>;
    if(screen==="done")return <View style={st.page}>
      {header("All done",()=>setScreen("chat"),"Ho gaya")}
      <View style={[st.inner,{justifyContent:"center",paddingBottom:70}]}>
        <View style={{alignItems:"center",marginBottom:26}}>
          <View style={[styles.avatar,{width:90,height:90,borderRadius:45}]}>
            <Text style={{fontSize:43,color:T.accent}}>✓</Text>
          </View>
        </View>
        <H en="We have all the details. Thank you!" roman="Saari jaankari mil gayi. Bahut shukriya!" center/>
        {forRelative?<Pressable accessibilityRole="checkbox" accessibilityState={{checked:consent}}
          accessibilityLabel="I have the candidate's permission" onPress={()=>setConsent(x=>!x)}
          style={{flexDirection:"row",alignItems:"center",gap:12,marginBottom:24}}>
          <View style={{width:24,height:24,borderRadius:6,borderColor:T.accent,borderWidth:1.5,
            backgroundColor:consent?T.accent:T.white,alignItems:"center",justifyContent:"center"}}>
            {consent?<Text style={{color:T.white}}>✓</Text>:null}
          </View>
          <View style={{flex:1}}><Text style={st.inputLabel}>I have the candidate's permission.</Text>
            <Text style={st.note}>Unki razaamandi hai.</Text></View>
        </Pressable>:null}
        <Btn en="Explore Rishte" roman="Rishte dekhein" disabled={forRelative&&!consent} onPress={()=>void completeInterview()}/>
        <View style={{height:12}}/>
        <Btn en="Check my answers" roman="Jawaab dekh lein" secondary onPress={()=>setScreen("review")}/>
        <View style={{height:12}}/>
        <Btn en="Download Bio Data" roman="Biodata JPEG banayein" secondary
          disabled={busy||(forRelative&&!consent)} onPress={()=>void openBiodata("done")}/>
        <View style={{height:12}}/>
        <Btn en="Add More Details" roman="Aur jaankari dein" secondary onPress={()=>openExtras("done")}/>
      </View></View>;
    if(screen==="biodata")return <BiodataScreen jpegUri={biodataUri} profile={profile}
      photoUri={image} busy={busy} onBack={()=>setScreen(biodataBack)}
      onSave={()=>void saveBiodata()} onShare={()=>void shareBiodata()}/>;
    if(screen==="enrich")return <EnrichmentScreen profile={profile} busy={busy} selected={extraPath}
      value={extraValue} setValue={setExtraValue} select={optionalSelect}
      onSave={()=>void saveExtra()} onBack={()=>setScreen(extraBack)}/>;
    if(screen==="review")return reviewPage();
    if(screen==="explore")return showExplore();
    if(screen==="interests")return interestsScreen();
    if(screen==="profile")return profileScreen();
    return null;
  }
  return <SafeAreaProvider><SafeAreaView style={st.page}>
    {content()}
    {error?<View style={styles.error}>
      <Text style={{color:T.danger,flex:1,fontSize:13}}>{error}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" onPress={()=>setError("")}>
        <Text style={{fontSize:18,color:T.danger}}>×</Text></Pressable>
    </View>:null}
    {busy&&screen!=="chat"&&screen!=="recording"?<View style={styles.busy}><ActivityIndicator color={T.accent}/></View>:null}
    {PREVIEW?<Pressable accessibilityRole="button" accessibilityLabel="Next preview screen"
      onPress={previewNext} style={{position:"absolute",right:0,top:98,width:72,height:72,opacity:.01}}>
      <View style={{flex:1}}/></Pressable>:null}
  </SafeAreaView></SafeAreaProvider>;
}
const styles=StyleSheet.create({
  header:{height:66,backgroundColor:T.paper,paddingHorizontal:20,flexDirection:"row",alignItems:"center",
    borderBottomColor:T.line,borderBottomWidth:1,gap:7},
  headerText:{fontSize:18,color:T.ink,fontWeight:"700"},
  headerSmall:{fontSize:12,color:T.muted,marginTop:1},
  headerABC:{fontSize:19,fontWeight:"800",color:T.accent,letterSpacing:-.4},
  composer:{flexDirection:"row",paddingHorizontal:12,paddingVertical:10,backgroundColor:T.white,
    borderTopColor:T.border,borderTopWidth:1,alignItems:"flex-end",gap:9},
  composeInput:{flex:1,fontSize:17,color:T.ink,borderWidth:1,borderColor:T.border,
    borderRadius:24,paddingVertical:13,paddingHorizontal:15,minHeight:50,maxHeight:128,backgroundColor:T.paper},
  recordOverlay:{position:"absolute",top:0,bottom:0,left:0,right:0,backgroundColor:"rgba(12,30,27,.6)",
    justifyContent:"center",paddingHorizontal:24},
  recordCard:{padding:28,backgroundColor:T.white,borderRadius:25,alignItems:"center"},
  exploreHeader:{paddingHorizontal:22,paddingTop:18,paddingBottom:15},
  search:{borderWidth:1,borderColor:T.border,borderRadius:16,paddingHorizontal:15,minHeight:53,
    flexDirection:"row",alignItems:"center",marginBottom:24,backgroundColor:T.white},
  avatar:{width:55,height:55,borderRadius:28,backgroundColor:T.light,alignItems:"center",justifyContent:"center"},
  empty:{marginVertical:10,paddingVertical:18,paddingHorizontal:18,borderWidth:1,borderColor:T.border,
    borderRadius:18,backgroundColor:T.white},
  groupTitle:{fontSize:19,fontWeight:"700",color:T.ink,marginBottom:7},
  phoneText:{fontSize:24,fontWeight:"700",color:T.ink},
  error:{marginHorizontal:10,marginBottom:8,padding:12,borderRadius:11,backgroundColor:"#FFF1F1",flexDirection:"row",gap:8},
  busy:{position:"absolute",right:20,bottom:85,backgroundColor:T.white,padding:10,borderRadius:30}
});
export default App;
