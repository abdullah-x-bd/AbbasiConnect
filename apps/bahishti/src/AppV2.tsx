import React,{useEffect,useRef,useState} from "react";
import {
  ActivityIndicator,Alert,Image,Keyboard,KeyboardAvoidingView,Modal,Platform,Pressable,
  ScrollView,StatusBar,StyleSheet,Text,TextInput,View,type ScrollViewInstance
} from "react-native";
import {SafeAreaProvider,SafeAreaView} from "react-native-safe-area-context";
import {AudioModule,RecordingPresets,setAudioModeAsync,useAudioRecorder} from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import {File,Paths,Directory} from "expo-file-system";
import * as Sharing from "expo-sharing";
import {BiodataScreen,EnrichmentScreen,ExtraDetailScreen,EXTRA_FIELDS,type ExtraField} from "./ExtraScreens";
import VoiceCall from "./VoiceCall";
import {api,clearTokens,restoreTokens,setMemberToken,
  type Session,type Account,type Candidate,type DiscoverResponse,type MatchPreferences} from "./api";
import {T,st,H,Btn,Field,Circle,Back,Hr,BrandLogo} from "./minimal-ui";

type Screen="loading"|"welcome"|"signupPhone"|"registered"|"verify"|"pinSignup"|"signin"|
  "language"|"purpose"|"for"|"relation"|"marital"|"mode"|"chat"|"voice"|"voiceStopped"|"photoOffer"|"done"|"review"|
  "explore"|"interests"|"profile"|"matchPreferences"|"paused"|"biodata"|"enrich"|"enrichEdit"|"deleteAccount";
type Interest={id:string;name:string;status:string;note?:string};
const PREVIEW=process.env.EXPO_PUBLIC_ABC_PREVIEW==="1";
type ExploreSort="relevance"|"nearest";
type ExploreFilters={ageMin:string;ageMax:string;heightMin:string;heightMax:string;
  maritalStatus:string;education:string;occupation:string};
const noExploreFilters=():ExploreFilters=>({
  ageMin:"",ageMax:"",heightMin:"",heightMax:"",
  maritalStatus:"",education:"",occupation:""
});
const maritalOptions=["never married","divorced","widowed","separated","annulled","other"];
const SCREENS:Screen[]=["welcome","signupPhone","registered","verify","pinSignup","signin",
  "language","purpose","for","relation","marital","mode","chat","voice","voiceStopped","photoOffer","done","review",
  "explore","interests","profile","deleteAccount","paused","biodata","enrich","enrichEdit"];
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
const sampleAccount:Account={member:{id:"preview",phone:"+919876543210",phoneVerified:false},profile:sampleProfile,visible:false,phase:"COMPLETE"};
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
  if(!profile.registration?.onboarding_mode)return "mode";
  return profile.registration.onboarding_mode==="voice"?"voice":"chat";
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
  const [voiceUncertain,setVoiceUncertain]=useState(false);
  const [voiceStopReason,setVoiceStopReason]=useState<"manual"|"silence"|"time_limit"|"connection_lost">("manual");
  const [consent,setConsent]=useState(false);
  const [city,setCity]=useState("");
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [exploreLoading,setExploreLoading]=useState(false);
  const [exploreError,setExploreError]=useState("");
  const [exploreTotal,setExploreTotal]=useState(0);
  const [explorePage,setExplorePage]=useState(1);
  const [exploreHasMore,setExploreHasMore]=useState(false);
  const [exploreCities,setExploreCities]=useState<{name:string;count:number}[]>([]);
  const [exploreSort,setExploreSort]=useState<ExploreSort>("relevance");
  const [exploreFilters,setExploreFilters]=useState<ExploreFilters>(noExploreFilters);
  const [filterDraft,setFilterDraft]=useState<ExploreFilters>(noExploreFilters);
  const [filterOpen,setFilterOpen]=useState(false);
  const [sortOpen,setSortOpen]=useState(false);
  const exploreRequestIdRef=useRef(0);
  const [prefAgeMin,setPrefAgeMin]=useState("");
  const [prefAgeMax,setPrefAgeMax]=useState("");
  const [prefCities,setPrefCities]=useState("");
  const [prefMarital,setPrefMarital]=useState("");
  const [prefEducation,setPrefEducation]=useState("");
  const [prefOccupation,setPrefOccupation]=useState("");
  const [interests,setInterests]=useState<{sent:Interest[];received:Interest[]}>({sent:[],received:[]});
  const [editPath,setEditPath]=useState("");
  const [editValue,setEditValue]=useState("");
  const [previewIndex,setPreviewIndex]=useState(0);
  const [biodataUri,setBiodataUri]=useState<string|null>(null);
  const [biodataFileUri,setBiodataFileUri]=useState<string|null>(null);
  const [biodataFileName,setBiodataFileName]=useState("ABC-Biodata.jpg");
  const [extraPath,setExtraPath]=useState("");
  const [extraValue,setExtraValue]=useState("");
  const [extraUncertain,setExtraUncertain]=useState(false);
  const [extraPreviewToken,setExtraPreviewToken]=useState("");
  const [extraRecording,setExtraRecording]=useState(false);
  const [deletePin,setDeletePin]=useState("");
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
  // Initial Explore navigation (login, completing interview, tab press) must
  // trigger the query. Previously the screen rendered empty until Go was tapped.
  useEffect(()=>{
    if(!PREVIEW&&screen==="explore"&&account?.member?.id)void loadExplore({page:1});
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
    if(SCREENS[i]==="enrichEdit"){
      setExtraPath("candidate.education.two_sentence_description");
      setExtraValue("I studied engineering in Delhi. I completed my degree there.");
      
    }
    setError("");setScreen(SCREENS[i]);
  }
  async function choose(field:string,value:string){
    if(PREVIEW){
      setScreen(field==="preferred_language"?"purpose":
        field==="looking_for"?"for":
        field==="profile_for"?(value==="relative"?"relation":"marital"):
        field==="registrant_relationship_to_candidate"?"marital":
        field==="marital_status"?"mode":
        field==="onboarding_mode"?(value==="voice"?"voice":"chat"):"mode");
      return;
    }
    await task(async()=>{
      const d=await api<{session:Session}>("/abc/choice",{method:"POST",body:{field,value}});
      goState(d.session);
    });
  }
  async function switchToChat(){
    if(PREVIEW){setScreen("chat");return;}
    await task(async()=>{
      const changed=await api<{session:Session}>("/abc/choice",{
        method:"POST",body:{field:"onboarding_mode",value:"chat"}
      });
      goState(changed.session);
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
      setText("");setVoiceUncertain(false);
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
      const result=await api<{text:string;uncertain?:boolean}>("/abc/audio/transcribe",{
        method:"POST",body:{data,format:"m4a"}
      });
      setText(current=>current.trim()?current.trim()+" "+result.text:result.text);
      setVoiceUncertain(Boolean(result.uncertain));
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
    const existing=readAt(session?.profile||account?.profile,field.path);
    setExtraValue(Array.isArray(existing)?existing.join(", "):existing==null?"":String(existing));
    setExtraUncertain(false);setExtraPreviewToken("");setExtraRecording(false);
    setScreen("enrichEdit");
  }
  function openExtras(back:"done"|"profile"){
    setExtraBack(back);setExtraPath("");setExtraValue("");
    setExtraUncertain(false);setExtraPreviewToken("");setScreen("enrich");
  }
  function cancelExtra(){
    setExtraPath("");setExtraValue("");setExtraUncertain(false);setExtraPreviewToken("");
    setScreen("enrich");
  }
  async function toggleExtraVoice(){
    if(extraRecording){
      if(PREVIEW){setExtraRecording(false);setExtraValue("Maine Delhi mein engineering padhi. Maine wahin degree poori ki.");return;}
      await task(async()=>{
        await recorder.stop();
        setExtraRecording(false);
        if(!recorder.uri)throw Error("No recording was captured.");
        const data=await new File(recorder.uri).base64();
        if(data.length>1200000)throw Error("Please speak for a shorter time.");
        const freshVoiceAnswer=!extraValue.trim();
        const result=await api<{text:string;uncertain?:boolean;previewToken?:string}>("/abc/audio/transcribe",{
          method:"POST",body:{data,format:"m4a",...(freshVoiceAnswer?{path:extraPath}:{})}
        });
        setExtraValue(old=>old.trim()?old.trim()+" "+result.text:result.text);
        // A clean, untouched voice answer is saved verbatim with its signed review token.
        setExtraPreviewToken(freshVoiceAnswer?(result.previewToken||""):"");
        setExtraUncertain(Boolean(result.uncertain));
      });
      return;
    }
    if(PREVIEW){setExtraRecording(true);return;}
    await task(async()=>{
      const permission=await AudioModule.requestRecordingPermissionsAsync();
      if(!permission.granted)throw Error("Microphone access is needed to dictate a detail.");
      await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});
      await recorder.prepareToRecordAsync();
      recorder.record();setExtraRecording(true);
    });
  }
  async function saveExtra(){
    if(!extraPath||!session||!extraValue.trim())return;
    if(PREVIEW){setExtraPath("");setScreen("enrich");return;}
    await task(async()=>{
      const value=extraPath==="partner_preferences.preferred_cities_or_regions"?
        extraValue.split(",").map(x=>x.trim()).filter(Boolean):extraValue.trim();
      const result=await api<{session:Session}>("/abc/enrichment",{method:"POST",body:{
        path:extraPath,value,version:session.version,...(extraPreviewToken?{previewToken:extraPreviewToken}:{})
      }});
      setSession(result.session);
      setExtraPath("");setExtraValue("");setExtraUncertain(false);setExtraPreviewToken("");
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
  async function loadExplore(options?:{
    city?:string;sort?:ExploreSort;filters?:ExploreFilters;page?:number;append?:boolean
  }){
    if(PREVIEW)return;
    const requestId=++exploreRequestIdRef.current;
    const chosenFilters=options?.filters??exploreFilters;
    const selectedCity=options?.city??city;
    const selectedSort=options?.sort??exploreSort;
    const page=options?.page??1;
    setExploreLoading(true);setExploreError("");
    const parts=[
      "city="+encodeURIComponent(selectedCity.trim()),
      "sort="+encodeURIComponent(selectedSort),
      "page="+page,"limit=20"
    ];
    for(const [key,value] of Object.entries(chosenFilters)){
      if(value.trim())parts.push(encodeURIComponent(key)+"="+encodeURIComponent(value.trim()));
    }
    try{
      const result=await api<DiscoverResponse>("/abc/discover?"+parts.join("&"),{timeoutMs:25000});
      if(requestId!==exploreRequestIdRef.current)return;
      setCandidates(old=>options?.append?[...old,...result.candidates]:result.candidates);
      setExploreCities(result.cities||[]);
      setExploreTotal(result.total);
      setExplorePage(result.page);
      setExploreHasMore(result.hasMore);
    }catch(e){
      if(requestId===exploreRequestIdRef.current)
        setExploreError(e instanceof Error?e.message:"Could not load profiles.");
    }finally{
      if(requestId===exploreRequestIdRef.current)setExploreLoading(false);
    }
  }
  async function search(){
    if(PREVIEW){setScreen("explore");return;}
    if(screen!=="explore"){setScreen("explore");return;}
    await loadExplore({page:1});
  }
  function applyCity(nextCity:string){
    setCity(nextCity);
    void loadExplore({city:nextCity,page:1});
  }
  function applyFilterDraft(){
    setExploreFilters({...filterDraft});
    setFilterOpen(false);
    void loadExplore({filters:filterDraft,page:1});
  }
  function clearExploreFilters(){
    const empty=noExploreFilters();
    setFilterDraft(empty);setExploreFilters(empty);
    setFilterOpen(false);
    void loadExplore({filters:empty,page:1});
  }
  function applyExploreSort(next:ExploreSort){
    setExploreSort(next);setSortOpen(false);
    void loadExplore({sort:next,page:1});
  }
  async function togglePublished(next:boolean){
    if(PREVIEW){setAccount(old=>old?{...old,visible:next}:old);return;}
    await task(async()=>{
      const data=await api<{visible:boolean}>("/abc/publish",{
        method:"POST",body:{visible:next}
      });
      setAccount(old=>old?{...old,visible:data.visible}:old);
      if(screen==="explore")await loadExplore({page:1});
    });
  }
  function openMatchPreferences(){
    const p=(session?.profile||account?.profile)?.partner_preferences||{};
    const match=String(p.preferred_age_range||"").match(/(\d{2})\s*[-–]\s*(\d{2})/);
    setPrefAgeMin(match?.[1]||"");
    setPrefAgeMax(match?.[2]||"");
    setPrefCities(Array.isArray(p.preferred_cities_or_regions)?
      p.preferred_cities_or_regions.join(", "):"");
    setPrefMarital(String(p.marital_status_preference||""));
    setPrefEducation(String(p.education_preference||""));
    setPrefOccupation(String(p.profession_preference||""));
    setScreen("matchPreferences");
  }
  async function saveMatchPreferences(){
    if(PREVIEW){setScreen("profile");return;}
    const ageMin=prefAgeMin.trim(),ageMax=prefAgeMax.trim();
    if(Boolean(ageMin)!==Boolean(ageMax)){
      setError("Please enter both ages, or leave both blank.");return;
    }
    const preferred:MatchPreferences={
      ageMin:ageMin?Number(ageMin):null,ageMax:ageMax?Number(ageMax):null,
      cities:prefCities.split(",").map(x=>x.trim()).filter(Boolean),
      maritalStatus:prefMarital||null,
      education:prefEducation.trim(),occupation:prefOccupation.trim()
    };
    await task(async()=>{
      const out=await api<{session:Session}>("/abc/match-preferences",{
        method:"POST",body:preferred
      });
      setSession(out.session);
      await refreshAccount();
      setScreen("profile");
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
    setText("");setPhone("+91");setDeletePin("");setScreen("welcome");
  }
  async function removeAccount(){
    if(PREVIEW){await logout();return;}
    await task(async()=>{
      await api<{deleted:boolean}>("/abc/account",{method:"DELETE",body:{pin:deletePin}});
      await logout();
    });
  }
  function confirmAccountDeletion(){
    Alert.alert("Delete your ABC account permanently?",
      "Your profile, saved answers, private photo and interests will be deleted. This cannot be undone.",
      [{text:"Cancel",style:"cancel"},
        {text:"Delete account",style:"destructive",onPress:()=>void removeAccount()}]);
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
      <BrandLogo size={48}/>
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
      {header("ABC",()=>setScreen(field==="preferred_language"?"welcome":
        field==="looking_for"?"language":field==="profile_for"?"purpose":
        field==="marital_status"?"for":field==="onboarding_mode"?"marital":"for"))}
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
          <Text style={[st.bubbleText,m.role==="user"&&{color:T.white}]}>{m.text}</Text>
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
          value={text} onChangeText={value=>{setText(value);setVoiceUncertain(false);}} onFocus={()=>
            requestAnimationFrame(()=>scrollRef.current?.scrollToEnd({animated:true}))}/>
        <Circle text={recording?"■":"🎤"} kind="accent" size={43} disabled={busy}
          label={recording?"Stop voice recording":"Start voice recording"}
          onPress={()=>recording?void stopVoice():void startVoice()}/>
        <Circle text="↑" kind="accent" size={46} disabled={busy||recording||!text.trim()}
          label="Send answer" onPress={()=>void sendAnswer(text)}/>
      </View>
      {voiceUncertain?<Text style={[st.note,{paddingHorizontal:16,paddingBottom:7,color:T.danger}]}>
        Please check the spelling of names before sending.
      </Text>:null}
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
    const activeFilters=Object.values(exploreFilters).filter(v=>Boolean(v.trim())).length;
    const narrow=(key:keyof ExploreFilters,value:string)=>
      setFilterDraft(current=>({...current,[key]:value}));
    return <View style={st.page}>
      <View style={[styles.exploreHeader,{flexDirection:"row",alignItems:"center",gap:12}]}>
        <BrandLogo size={64}/>
        <View style={{flex:1}}>
          <Text style={{fontSize:24,fontWeight:"700",color:T.accent}}>AbbasiConnect</Text>
          <Text style={[st.note,{marginTop:3}]}>Explore / Rishte dekhein</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{paddingHorizontal:21,paddingTop:8,paddingBottom:25}}
        keyboardShouldPersistTaps="handled">
        <Text style={[st.inputLabel,{marginBottom:7}]}>Sheher / City</Text>
        <View style={[styles.search,{marginBottom:10}]}>
          <Text style={{fontSize:20,color:T.faint,marginRight:10}}>⌕</Text>
          <TextInput style={{flex:1,fontSize:16,color:T.ink}}
            placeholder="All cities / Saare sheher" accessibilityLabel="Search city"
            placeholderTextColor={T.faint} value={city} onChangeText={setCity}
            onSubmitEditing={()=>void loadExplore({page:1})}/>
          {city.trim()?<Pressable accessibilityRole="button" accessibilityLabel="Clear city filter"
            onPress={()=>applyCity("")} style={{paddingHorizontal:9}}>
            <Text style={{fontSize:19,color:T.muted}}>×</Text>
          </Pressable>:null}
          <Pressable accessibilityRole="button" accessibilityLabel="Search profiles"
            onPress={()=>void loadExplore({page:1})}>
            <Text style={{fontSize:15,fontWeight:"700",color:T.accent}}>Go</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{gap:8,paddingBottom:18}}>
          {["All cities",...exploreCities.map(c=>c.name)].map((label,i)=>{
            const selected=i===0?!city.trim():city.trim().toLowerCase()===label.toLowerCase();
            return <Pressable key={label} accessibilityRole="button"
              accessibilityLabel={label} onPress={()=>applyCity(i===0?"":label)}
              style={[st.chip,{paddingHorizontal:14,paddingVertical:8,
                backgroundColor:selected?T.accent:T.light}]}>
              <Text style={{fontSize:13,fontWeight:"600",color:selected?T.white:T.ink}}>{label}</Text>
            </Pressable>;
          })}
        </ScrollView>
        {!account?.visible?<View style={[st.card,{marginBottom:17,backgroundColor:T.soft}]}>
          <Text style={{fontSize:16,fontWeight:"700",color:T.ink}}>Your profile is private</Text>
          <Text style={[st.note,{marginTop:5,marginBottom:12}]}>
            Only profiles that members choose to publish appear in Explore. Share your profile to be found by compatible members.
          </Text>
          <Btn en="Publish my profile" roman="Meri profile dikhayein" compact
            onPress={()=>void togglePublished(true)}/>
          {account?.member?.phoneVerified===false?<Text style={[st.note,{marginTop:8}]}>
            Pilot account: your phone number is not yet SMS verified.
          </Text>:null}
        </View>:null}
        <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <View style={{flex:1}}>
            <Text style={[styles.groupTitle,{marginBottom:2}]}>
              {exploreSort==="nearest"?"Nearest cities first":"Recommended for you"}
            </Text>
            <Text style={st.note}>{exploreTotal} compatible published profile{exploreTotal===1?"":"s"}</Text>
          </View>
          {exploreLoading?<ActivityIndicator color={T.accent} size="small"/>:null}
        </View>
        {exploreError?<View style={[st.card,{marginBottom:14}]}>
          <Text style={{color:T.danger}}>{exploreError}</Text>
          <View style={{marginTop:12}}><Btn compact secondary en="Try again" roman="Dobara dekhein"
            onPress={()=>void loadExplore({page:1})}/></View>
        </View>:null}
        {!exploreLoading&&!exploreError&&candidates.length===0?
          <View style={{alignItems:"center",paddingTop:46,paddingBottom:58,paddingHorizontal:10}}>
            <View style={{width:64,height:64,borderRadius:32,backgroundColor:T.light,
              alignItems:"center",justifyContent:"center",marginBottom:20}}>
              <Text style={{fontSize:30,color:T.accent}}>♡</Text>
            </View>
            <Text style={{fontSize:21,fontWeight:"700",color:T.ink,textAlign:"center"}}>
              No matching published profiles yet
            </Text>
            <Text style={[st.sub,{textAlign:"center"}]}>
              Try All cities or clear your filters. Private profiles stay hidden until published.
            </Text>
          </View>:candidates.map(c=><View key={c.profileId} style={[st.card,{marginBottom:13}]}>
          <View style={{flexDirection:"row",gap:12,alignItems:"center"}}>
            <View style={styles.avatar}>
              <Text style={{fontSize:23,color:T.accent,fontWeight:"700"}}>
                {String(c.name||"?").slice(0,1)}
              </Text>
            </View>
            <View style={{flex:1}}>
              <Text style={{fontSize:18,fontWeight:"700",color:T.ink}}>{c.name||"Candidate"}</Text>
              <Text style={st.note}>
                {[c.age?c.age+" years":null,c.city,c.education].filter(Boolean).join(" · ")}
              </Text>
              <Text style={[st.note,{fontSize:11,marginTop:2}]}>
                {c.publicId} · {c.verified?"Phone verified":"Phone not verified"}
              </Text>
            </View>
          </View>
          {c.occupation?<Text style={[st.sub,{marginTop:9}]}>{c.occupation}</Text>:null}
          {c.matchReasons.length?<View style={{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:11}}>
            {c.matchReasons.map(reason=><View key={reason} style={st.chip}>
              <Text style={st.badge}>{reason}</Text>
            </View>)}
          </View>:null}
          {exploreSort==="nearest"&&c.distanceKm!==null?
            <Text style={[st.note,{marginTop:9}]}>
              {c.distanceKm===0?"Same city":"Approx. "+c.distanceKm+" km between city centres"}
            </Text>:null}
          <View style={{marginTop:15}}>
            <Btn compact en="I'm interested" roman="Dilchaspi hai"
              onPress={()=>void interest(c.profileId)}/>
          </View>
        </View>)}
        {exploreHasMore&&!exploreError?<Btn en={exploreLoading?"Loading...":"Load more profiles"}
          roman="Aur rishte dekhein" compact secondary disabled={exploreLoading}
          onPress={()=>void loadExplore({page:explorePage+1,append:true})}/>:null}
      </ScrollView>
      <View style={styles.exploreActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Filter profiles"
          onPress={()=>{setFilterDraft({...exploreFilters});setFilterOpen(true);}}
          style={styles.exploreActionButton}>
          <Text style={styles.exploreActionText}>☷  Filter{activeFilters?" ("+activeFilters+")":""}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Sort profiles"
          onPress={()=>setSortOpen(true)} style={styles.exploreActionButton}>
          <Text style={styles.exploreActionText}>↕  Sort</Text>
        </Pressable>
      </View>
      {footer("explore")}
      <Modal animationType="slide" transparent visible={filterOpen}
        onRequestClose={()=>setFilterOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={[styles.groupTitle,{fontSize:23,marginBottom:3}]}>Filter Rishte</Text>
            <Text style={[st.note,{marginBottom:18}]}>Find the profiles that fit your preferences</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{flexGrow:0}}
              contentContainerStyle={{paddingBottom:12}}>
              <View style={{flexDirection:"row",gap:12}}>
                <View style={{flex:1}}><Field label="Age from" value={filterDraft.ageMin} numeric
                  onChangeText={v=>narrow("ageMin",v)} placeholder="18" maxLength={2}/></View>
                <View style={{flex:1}}><Field label="Age to" value={filterDraft.ageMax} numeric
                  onChangeText={v=>narrow("ageMax",v)} placeholder="40" maxLength={2}/></View>
              </View>
              <View style={{flexDirection:"row",gap:12}}>
                <View style={{flex:1}}><Field label="Height from (cm)" value={filterDraft.heightMin}
                  numeric onChangeText={v=>narrow("heightMin",v)} placeholder="150" maxLength={3}/></View>
                <View style={{flex:1}}><Field label="Height to (cm)" value={filterDraft.heightMax}
                  numeric onChangeText={v=>narrow("heightMax",v)} placeholder="190" maxLength={3}/></View>
              </View>
              <Text style={st.inputLabel}>Marital status</Text>
              <View style={{flexDirection:"row",flexWrap:"wrap",gap:7,marginBottom:16}}>
                {["Any",...maritalOptions].map(value=>{
                  const selected=filterDraft.maritalStatus===(value==="Any"?"":value);
                  return <Pressable key={value} accessibilityRole="button"
                    onPress={()=>narrow("maritalStatus",value==="Any"?"":value)}
                    style={[st.chip,{paddingVertical:9,backgroundColor:selected?T.accent:T.light}]}>
                    <Text style={{fontSize:13,color:selected?T.white:T.ink}}>{value}</Text>
                  </Pressable>;
                })}
              </View>
              <Field label="Education contains" value={filterDraft.education}
                onChangeText={v=>narrow("education",v)} placeholder="e.g. graduate" maxLength={100}/>
              <Field label="Occupation contains" value={filterDraft.occupation}
                onChangeText={v=>narrow("occupation",v)} placeholder="e.g. teacher" maxLength={100}/>
            </ScrollView>
            <View style={{gap:10,marginTop:5}}>
              <Btn en="Apply filters" roman="Filter lagayein" compact onPress={applyFilterDraft}/>
              <View style={{flexDirection:"row",gap:10}}>
                <View style={{flex:1}}><Btn en="Clear all" roman="Saaf karein" compact secondary
                  onPress={clearExploreFilters}/></View>
                <View style={{flex:1}}><Btn en="Cancel" roman="Rehne dein" compact secondary
                  onPress={()=>setFilterOpen(false)}/></View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      <Modal animationType="slide" transparent visible={sortOpen}
        onRequestClose={()=>setSortOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={[styles.groupTitle,{fontSize:23}]}>Sort Rishte</Text>
            <Text style={[st.note,{marginBottom:16}]}>Choose how profiles are ordered</Text>
            {([{id:"relevance",title:"Most relevant",description:"Prioritise reciprocal preferences and nearby cities"},
              {id:"nearest",title:"Nearest first",description:"Approximate distance between cities, not exact addresses"}
            ] as {id:ExploreSort;title:string;description:string}[]).map(option=>
              <Pressable key={option.id} accessibilityRole="radio"
                accessibilityState={{checked:exploreSort===option.id}}
                onPress={()=>applyExploreSort(option.id)}
                style={[st.card,{marginBottom:11,flexDirection:"row",alignItems:"center",gap:12,
                  borderColor:exploreSort===option.id?T.accent:T.border}]}>
                <Text style={{fontSize:23,color:T.accent}}>{exploreSort===option.id?"◉":"○"}</Text>
                <View style={{flex:1}}>
                  <Text style={{fontSize:16,color:T.ink,fontWeight:"700"}}>{option.title}</Text>
                  <Text style={st.note}>{option.description}</Text>
                </View>
              </Pressable>)}
            <Btn secondary compact en="Close" roman="Band karein" onPress={()=>setSortOpen(false)}/>
          </View>
        </View>
      </Modal>
    </View>;
  }
  function interestsScreen(){
    return <View style={st.page}>
      <View style={[styles.exploreHeader,{flexDirection:"row",alignItems:"center"}]}>
        <View style={{flex:1}}>
          <Text style={{fontSize:26,fontWeight:"700",color:T.ink}}>Interests</Text>
          <Text style={st.roman}>Dilchaspi</Text>
        </View><BrandLogo size={52}/>
      </View>
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
  function matchPreferencesScreen(){
    return <View style={st.page}>
      {header("Match preferences",()=>setScreen("profile"),"Rishte ki pasand")}
      <ScrollView contentContainerStyle={st.inner} keyboardShouldPersistTaps="handled">
        <H en="Who would you like to meet?" roman="Aapki pasand kya hai?"/>
        <Text style={[st.note,{marginBottom:20}]}>
          These preferences help rank matches in both directions. They are optional and never change your original interview answers.
        </Text>
        <View style={{flexDirection:"row",gap:12}}>
          <View style={{flex:1}}>
            <Field label="Preferred age from" value={prefAgeMin} numeric
              onChangeText={setPrefAgeMin} placeholder="21" maxLength={2}/>
          </View>
          <View style={{flex:1}}>
            <Field label="Preferred age to" value={prefAgeMax} numeric
              onChangeText={setPrefAgeMax} placeholder="30" maxLength={2}/>
          </View>
        </View>
        <Field label="Preferred cities" roman="Pasandeeda sheher" value={prefCities}
          onChangeText={setPrefCities} placeholder="Delhi, Aligarh, Lucknow"/>
        <Text style={[st.note,{marginTop:-12,marginBottom:17}]}>
          Separate multiple cities with commas. Delhi and Dilli are treated as the same city.
        </Text>
        <Text style={st.inputLabel}>Preferred marital status (optional)</Text>
        <View style={{flexDirection:"row",flexWrap:"wrap",gap:8,marginBottom:20}}>
          {["Any",...maritalOptions].map(value=>{
            const selected=prefMarital===(value==="Any"?"":value);
            return <Pressable key={value} accessibilityRole="button"
              onPress={()=>setPrefMarital(value==="Any"?"":value)}
              style={[st.chip,{paddingVertical:10,backgroundColor:selected?T.accent:T.light}]}>
              <Text style={{fontSize:13,color:selected?T.white:T.ink}}>{value}</Text>
            </Pressable>;
          })}
        </View>
        <Field label="Preferred education" value={prefEducation}
          onChangeText={setPrefEducation} placeholder="e.g. Bachelor's" maxLength={100}/>
        <Field label="Preferred profession" value={prefOccupation}
          onChangeText={setPrefOccupation} placeholder="e.g. teacher" maxLength={100}/>
        <Btn en="Save match preferences" roman="Pasand save karein"
          onPress={()=>void saveMatchPreferences()}/>
        <View style={{height:12}}/>
        <Btn en="Cancel" roman="Wapas" secondary onPress={()=>setScreen("profile")}/>
      </ScrollView>
    </View>;
  }
  function profileScreen(){
    return <View style={st.page}>
      <View style={[styles.exploreHeader,{flexDirection:"row",alignItems:"center"}]}>
        <View style={{flex:1}}>
          <Text style={{fontSize:26,fontWeight:"700",color:T.ink}}>My profile</Text>
          <Text style={st.roman}>Meri profile</Text>
        </View><BrandLogo size={52}/>
      </View>
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
        <View style={[st.card,{backgroundColor:account?.visible?T.white:T.soft}]}>
          <Text style={styles.groupTitle}>Profile visibility</Text>
          <Text style={[st.sub,{marginTop:2}]}>
            {account?.visible?"Published: compatible members can discover your profile.":
              "Private: your profile is hidden from other members."}
          </Text>
          <Text style={[st.note,{marginTop:6,marginBottom:13}]}>
            {account?.member?.phoneVerified?
              "Phone number verified.":
              "Pilot account: phone number not yet SMS verified. Publishing is optional."}
          </Text>
          <Btn en={account?.visible?"Make profile private":"Publish my profile"}
            roman={account?.visible?"Profile chhupayein":"Meri profile dikhayein"}
            compact secondary onPress={()=>void togglePublished(!account?.visible)}/>
        </View>
        <View style={{height:12}}/>
        <Btn en="My Match Preferences" roman="Munasib rishte ki pasand"
          secondary onPress={openMatchPreferences}/>
        <View style={{height:18}}/>
        <Btn en="Download Bio Data" roman="Biodata JPEG banayein" onPress={()=>void openBiodata("profile")}/>
        <View style={{height:12}}/>
        <Btn secondary en="Add More Details" roman="Aur jaankari dein" onPress={()=>openExtras("profile")}/>
        <View style={{height:18}}/>
        <Btn secondary en="Sign out" roman="Logout karein" onPress={()=>void logout()}/>
        <View style={{height:18}}/>
        <Pressable accessibilityRole="button" accessibilityLabel="Delete my account"
          onPress={()=>{setDeletePin("");setScreen("deleteAccount");}}
          style={{paddingVertical:14,alignItems:"center"}}>
          <Text style={{color:T.danger,fontSize:15,fontWeight:"700"}}>Delete my account / Account delete karein</Text>
        </Pressable>
        <View style={{height:20}}/>
        <Text style={[st.note,{textAlign:"center"}]}>
          Phone verification is not active in this test version. / Is version mein SMS tasdeeq abhi band hai.
        </Text>
      </ScrollView>{footer("profile")}
    </View>;
  }

  function content(){
    if(screen==="loading")return <View style={{flex:1,justifyContent:"center",alignItems:"center"}}>
      <BrandLogo size={120}/><ActivityIndicator style={{marginTop:20}} color={T.accent}/></View>;
    if(screen==="welcome")return <View style={[st.page,{paddingHorizontal:28,justifyContent:"center"}]}>
      <View style={{alignItems:"center",marginBottom:64}}>
        <BrandLogo size={252}/>
        <Text style={[st.app,{fontSize:19,textAlign:"center",marginTop:8,
          fontWeight:"700",color:T.accent,letterSpacing:.5}]}>Abbasi Bahishti Connections</Text>
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
        <Btn en="Continue" roman="Aage badhein" disabled={busy||phone.replace(/\D/g,"").length<10}
          onPress={()=>void checkPhone()}/>
      </View></View>;
    if(screen==="registered")return <View style={st.page}>
      {header("Already registered",()=>setScreen("signupPhone"),"Pehle se account hai")}
      <View style={[st.inner,{justifyContent:"center",paddingBottom:85}]}>
        <H en="This number is already registered." roman="Is number se account pehle se bana hua hai."/>
        <Text style={[styles.phoneText,{textAlign:"center",marginBottom:28}]}>{phone}</Text>
        <Btn en="Log in instead" roman="Login karein" onPress={()=>setScreen("signin")}/>
        <View style={{height:12}}/>
        <Btn en="Use another number" roman="Doosra number dein" secondary onPress={()=>setScreen("signupPhone")}/>
      </View>
    </View>;
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
    if(screen==="language")return choicePage("How should we talk?","Hum kis zubaan mein baat karein?",[
      {en:"Hinglish / Hindustani",roman:"Aapka naam kya hai? (default)",value:"roman"},
      {en:"English",roman:"What is your name?",value:"en"}
    ],"preferred_language");
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
    if(screen==="marital")return choicePage("Marital status","Shaadi ki haalat kya hai?",[
      {en:"Never married",roman:"Pehle shaadi nahi hui",value:"never married"},
      {en:"Divorced",roman:"Talaaq-shuda",value:"divorced"},
      {en:"Widowed",roman:"Bewa / Bewah",value:"widowed"},
      {en:"Separated",roman:"Alag rehte hain",value:"separated"},
      {en:"Other",roman:"Koi aur",value:"other"}
    ],"marital_status");
    if(screen==="mode")return choicePage("How would you like to answer?",
      "Aap kaise baat karna pasand karenge?",[
        {en:"Chat",roman:"Likh kar ya voice-to-text se jawaab dein",value:"chat"},
        {en:"Voice Call",roman:"ABC se seedhi awaaz mein baat karein",value:"voice"}
      ],"onboarding_mode");
    if(screen==="chat")return chatScreen();
    if(screen==="voice"&&session)return <VoiceCall session={session} preview={PREVIEW}
      onSession={updated=>{
        setSession(updated);
        if(updated.phase!=="COLLECTING")setScreen(accountPage(updated.phase,updated.profile));
        else if(updated.profile.registration?.onboarding_mode==="chat"){
          setError("Voice Call ended after five unrelated replies. Your answers are saved. Continue in Chat.");
          setScreen("chat");
        }
      }}
      onSwitchToChat={switchToChat}
      onEnd={reason=>{setVoiceStopReason(reason||"manual");setScreen("voiceStopped");}}/>;
    if(screen==="voiceStopped")return <View style={st.page}>
      {header("Voice Call",()=>setScreen("mode"),"Awaaz wali baat-cheet")}
      <View style={[st.inner,{justifyContent:"center",paddingBottom:85}]}>
        <H en={voiceStopReason==="silence"?"Call ended after silence":
          voiceStopReason==="time_limit"?"Four-minute call finished":
          voiceStopReason==="connection_lost"?"Voice connection ended":"Your answers are saved"}
          roman={voiceStopReason==="silence"?"Khamoshi par call khatam":
          voiceStopReason==="time_limit"?"Chaar minute poore ho gaye":"Jawaab save hain"} center/>
        <Text style={[st.sub,{textAlign:"center",marginBottom:28}]}>
          {voiceStopReason==="silence"?"There was no speaking for 30 seconds. Your saved answers remain available.":
            voiceStopReason==="time_limit"?"Your four-minute limit was reached. Your saved answers are safe.":
            voiceStopReason==="connection_lost"?"The voice connection was interrupted. Your saved answers remain available.":
            "Resume the call or continue in Chat. Your answers remain saved."}
        </Text>
        <Btn en="Resume Voice Call" roman="Call dobara karein" onPress={()=>setScreen("voice")}/>
        <View style={{height:12}}/>
        <Btn en="Switch to Chat" roman="Chat se jawaab dein" secondary onPress={()=>void switchToChat()}/>
      </View>
    </View>;
    if(screen==="photoOffer")return <View style={st.page}>
      {header("Profile photo",()=>setScreen("review"),"Tasveer")}
      <View style={[st.inner,{justifyContent:"center",paddingBottom:80}]}>
        <H en="Would you like to add a photo?" roman="Apni tasveer lagana chahenge?" center/>
        <Text style={[st.sub,{textAlign:"center",marginBottom:26}]}>
          Optional. You can add or change it later. / Yeh zaroori nahi hai.
        </Text>
        <Btn en="Add photo" roman="Tasveer lagayein" onPress={()=>void pickPhoto()} disabled={busy}/>
        <View style={{height:12}}/>
        <Btn en="Skip for now" roman="Abhi rehne dein" secondary onPress={()=>void skipPhotoPrompt()} disabled={busy}/>
      </View>
    </View>;
    if(screen==="paused")return <View style={st.page}>
      {header("Paused",()=>setScreen("welcome"),"Thoda ruk gaye")}
      <View style={[st.inner,{justifyContent:"center",paddingBottom:75}]}>
        <H en="Your answers are saved." roman="Aapke jawaab save hain."/>
        <Text style={[st.sub,{marginBottom:27}]}>You can return whenever you're ready.</Text>
        <Btn en="Continue questions" roman="Sawaal jaari rakhein" onPress={()=>void resume()}/>
      </View></View>;
    if(screen==="done")return <View style={st.page}>
      {header("All done",()=>setScreen(profile.registration?.onboarding_mode==="voice"?"voiceStopped":"chat"),"Ho gaya")}
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
    if(screen==="deleteAccount")return <View style={st.page}>
      {header("Delete account",()=>{setDeletePin("");setScreen("profile");},"Account hatayein")}
      <ScrollView contentContainerStyle={st.inner} keyboardShouldPersistTaps="handled">
        <H en="Delete your ABC account?" roman="Apna account hamesha ke liye hatayein?"/>
        <Text style={[st.sub,{marginBottom:25}]}>
          This will permanently remove your matrimonial profile, conversations, photo and interest requests.
        </Text>
        <Field label="Confirm with your PIN" roman="Apna PIN likhein"
          value={deletePin} onChangeText={setDeletePin} numeric secure maxLength={6}/>
        <Btn en="Delete account permanently" roman="Hamesha ke liye delete karein"
          onPress={confirmAccountDeletion} disabled={busy||deletePin.length<4}/>
        <View style={{height:13}}/>
        <Btn en="Cancel" roman="Wapas jaayein" secondary
          onPress={()=>{setDeletePin("");setScreen("profile");}}/>
      </ScrollView>
    </View>;
    if(screen==="biodata")return <BiodataScreen jpegUri={biodataUri} profile={profile}
      photoUri={image} busy={busy} onBack={()=>setScreen(biodataBack)}
      onSave={()=>void saveBiodata()} onShare={()=>void shareBiodata()}/>;
    if(screen==="enrich")return <EnrichmentScreen profile={profile} select={optionalSelect}
      onBack={()=>setScreen(extraBack)}/>;
    if(screen==="enrichEdit")return <ExtraDetailScreen
      field={EXTRA_FIELDS.find(x=>x.path===extraPath)||EXTRA_FIELDS[0]}
      value={extraValue} busy={busy} recording={extraRecording}
      uncertain={extraUncertain}
      onChange={value=>{setExtraValue(value);setExtraPreviewToken("");}}
      onMic={()=>void toggleExtraVoice()}
      onSave={()=>void saveExtra()} onCancel={cancelExtra}/>;
    if(screen==="review")return reviewPage();
    if(screen==="explore")return showExplore();
    if(screen==="interests")return interestsScreen();
    if(screen==="profile")return profileScreen();
    if(screen==="matchPreferences")return matchPreferencesScreen();
    return null;
  }
  return <SafeAreaProvider>
    <StatusBar barStyle="dark-content"/>
    <SafeAreaView style={st.page}>
    {content()}
    {error?<View style={styles.error}>
      <Text style={{color:T.danger,flex:1,fontSize:13}}>{error}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" onPress={()=>setError("")}>
        <Text style={{fontSize:18,color:T.danger}}>×</Text></Pressable>
    </View>:null}
    {busy&&screen!=="chat"?<View style={styles.busy}><ActivityIndicator color={T.accent}/></View>:null}
    {PREVIEW?<Pressable accessibilityRole="button" accessibilityLabel="Next preview screen"
      onPress={previewNext} style={{position:"absolute",right:0,top:98,width:72,height:72,opacity:.01}}>
      <View style={{flex:1}}/></Pressable>:null}
    </SafeAreaView>
  </SafeAreaProvider>;
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
  exploreActions:{flexDirection:"row",gap:10,paddingHorizontal:20,paddingVertical:10,
    backgroundColor:T.paper,borderTopColor:T.line,borderTopWidth:1},
  exploreActionButton:{flex:1,borderWidth:1,borderColor:T.border,backgroundColor:T.white,
    minHeight:46,borderRadius:13,alignItems:"center",justifyContent:"center"},
  exploreActionText:{color:T.accent,fontSize:15,fontWeight:"700"},
  modalBackdrop:{flex:1,justifyContent:"flex-end",backgroundColor:"rgba(15,35,22,.43)"},
  modalSheet:{backgroundColor:T.paper,paddingHorizontal:23,paddingTop:25,paddingBottom:33,
    borderTopLeftRadius:25,borderTopRightRadius:25,maxHeight:"88%"},
  avatar:{width:55,height:55,borderRadius:28,backgroundColor:T.light,alignItems:"center",justifyContent:"center"},
  empty:{marginVertical:10,paddingVertical:18,paddingHorizontal:18,borderWidth:1,borderColor:T.border,
    borderRadius:18,backgroundColor:T.white},
  groupTitle:{fontSize:19,fontWeight:"700",color:T.ink,marginBottom:7},
  phoneText:{fontSize:24,fontWeight:"700",color:T.ink},
  error:{marginHorizontal:10,marginBottom:8,padding:12,borderRadius:11,backgroundColor:"#FFF1F1",flexDirection:"row",gap:8},
  busy:{position:"absolute",right:20,bottom:85,backgroundColor:T.white,padding:10,borderRadius:30}
});
export default App;
