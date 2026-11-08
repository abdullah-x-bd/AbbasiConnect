/**
 * Abbasi Bahishti Connections onboarding contract.
 *
 * This file is the single authoritative list of profile field paths,
 * validation rules, question order, and terminal states.
 * The language model is never authorized to add its own required fields.
 */
export type Lang = "en" | "hi" | "ur" | "roman";
export type FieldKind = "text" | "age" | "height" | "weight" | "count" | "education_description" | "languages" | "list" | "marital" | "gender";
export type FieldStatus = "not_asked" | "answered" | "unknown" | "declined" | "needs_clarification";
export type Phase = "COLLECTING" | "BLOCKED_REQUIRED" | "PAUSED" | "REVIEW" | "VERIFY_PHONE" | "SET_PIN" | "COMPLETE";
export type FieldDef = {
  path: string;
  kind: FieldKind;
  required: boolean;
  allowUnknown?: boolean;
  label: string;
  ask: Record<Lang, string>;
  targetPaths?: string[];
};

const q=(en:string,hi:string,ur:string,roman:string):Record<Lang,string>=>({en,hi,ur,roman});
const f=(path:string,kind:FieldKind,required:boolean,label:string,ask:Record<Lang,string>,allowUnknown=false):FieldDef=>({path,kind,required,label,ask,allowUnknown});
export const FIELDS: FieldDef[] = [
  f("candidate.full_name","text",true,"Candidate's full name",q("What is the candidate's full name?","उम्मीदवार का पूरा नाम क्या है?","امیدوار کا پورا نام کیا ہے؟","Candidate ka poora naam kya hai?")),
  f("candidate.gender","gender",true,"Candidate's gender",q("What is the candidate's gender?","उम्मीदवार का जेंडर क्या है?","امیدوار کی جنس کیا ہے؟","Candidate ka gender kya hai?")),
  f("candidate.age_years","age",true,"Age in years",q("How old is the candidate, in years?","उम्मीदवार की उम्र कितने साल है?","امیدوار کی عمر کتنے سال ہے؟","Candidate ki umr kitne saal hai?")),
  f("candidate.height_cm","height",true,"Height",q("What is the candidate's height? You can tell me in feet and inches or centimetres.","उम्मीदवार की लंबाई कितनी है? फीट या सेंटीमीटर में बता सकते हैं।","امیدوار کا قد کتنا ہے؟ فٹ یا سینٹی میٹر میں بتا سکتے ہیں۔","Candidate ka qad kitna hai? Feet ya centimetres mein bata sakte hain.")),
  f("candidate.weight_kg","weight",false,"Weight",q("Would you like to share the candidate's approximate weight in kilograms?","क्या आप उम्मीदवार का वज़न किलो में बताना चाहेंगे?","کیا آپ امیدوار کا وزن کلو میں بتانا چاہیں گے؟","Kya aap candidate ka wazan kilo mein batana chahenge?")),
  f("candidate.marital_status","marital",true,"Marital status",q("What is the candidate's current marital status?","उम्मीदवार की शादी से जुड़ी मौजूदा स्थिति क्या है?","امیدوار کی موجودہ ازدواجی حیثیت کیا ہے؟","Candidate ki marital status kya hai?")),
  f("candidate.current_location.city","text",true,"Current city",q("Which city does the candidate currently live in?","उम्मीदवार अभी किस शहर में रहते हैं?","امیدوار ابھی کس شہر میں رہتے ہیں؟","Candidate abhi kis shehar mein rehte hain?")),
  f("candidate.current_location.state","text",false,"Current state",q("And which state or province is that in?","वह किस राज्य या सूबे में है?","وہ کس ریاست یا صوبے میں ہے؟","Woh kis state ya sube mein hai?")),
  f("candidate.current_location.country","text",false,"Current country",q("Which country does the candidate live in?","उम्मीदवार किस देश में रहते हैं?","امیدوار کس ملک میں رہتے ہیں؟","Candidate kis mulk mein rehte hain?")),
  f("candidate.ancestral_location.city_or_town","text",true,"Ancestral city or town",q("Which town or city is the candidate's family originally from?","उम्मीदवार के परिवार का पुश्तैनी शहर या क़स्बा कौन-सा है?","امیدوار کے خاندان کا آبائی شہر یا قصبہ کون سا ہے؟","Candidate ke khandan ka aabai shehar ya qasba kya hai?")),
  f("candidate.ancestral_location.district","text",false,"Ancestral district",q("Do you know the family's ancestral district?","क्या पुश्तैनी ज़िला मालूम है?","کیا آبائی ضلع معلوم ہے؟","Kya aabai zila maloom hai?")),
  f("candidate.education.highest_qualification","text",true,"Highest qualification",q("What is the candidate's highest educational qualification?","उम्मीदवार की सबसे ऊँची शैक्षिक योग्यता क्या है?","امیدوار کی سب سے اونچی تعلیمی قابلیت کیا ہے؟","Candidate ki sabse aala taleemi qualification kya hai?")),
  f("candidate.education.institution","text",false,"Institution",q("Which school, college or university did they attend?","उन्होंने किस स्कूल, कॉलेज या यूनिवर्सिटी में पढ़ाई की है?","انہوں نے کس اسکول، کالج یا یونیورسٹی سے تعلیم حاصل کی؟","Unhone kis school, college ya university se taleem hasil ki?")),
  f("candidate.education.two_sentence_description","education_description",false,"Education in two sentences",q("Please describe the candidate's education in about two sentences, including what and where they studied.","दो वाक्यों में उम्मीदवार की पढ़ाई के बारे में बताइए, क्या पढ़ा और कहाँ पढ़ा।","دو جملوں میں امیدوار کی تعلیم بتائیے، کیا پڑھا اور کہاں پڑھا۔","Do jumlon mein candidate ki taleem batayein, kya aur kahan padha.")),
  f("candidate.occupation.profession_or_role","text",true,"Occupation or current activity",q("What does the candidate currently do, such as working, studying, running a business or something else?","उम्मीदवार इस समय क्या करते हैं, नौकरी, पढ़ाई, कारोबार या कुछ और?","امیدوار اس وقت کیا کرتے ہیں، ملازمت، تعلیم، کاروبار یا کچھ اور؟","Candidate aajkal kya karte hain, naukri, taleem, karobar ya kuch aur?")),
  f("candidate.occupation.employer_or_business","text",false,"Employer or business",q("Would you like to mention the employer or business name?","क्या आप नौकरी या कारोबार की जगह बताना चाहेंगे?","کیا آپ ملازمت یا کاروبار کی جگہ بتانا چاہیں گے؟","Kya aap employer ya business ka naam batana chahenge?")),
  f("candidate.languages","languages",false,"Languages and literacy",q("Which languages can the candidate speak? For each, tell me whether they can also read and write it.","उम्मीदवार कौन-सी भाषाएँ बोलते हैं? हर भाषा के लिए यह भी बताइए कि पढ़ और लिख सकते हैं या नहीं।","امیدوار کون سی زبانیں بولتے ہیں؟ ہر زبان کے لیے یہ بھی بتائیے کہ پڑھ اور لکھ سکتے ہیں یا نہیں۔","Candidate kaunsi zubanein bolte hain? Har zuban ko parh aur likh bhi sakte hain?")),
  f("family.father.name","text",true,"Father's name",q("What is the candidate's father's name?","उम्मीदवार के वालिद का नाम क्या है?","امیدوار کے والد کا نام کیا ہے؟","Candidate ke walid ka naam kya hai?"),true),
  f("family.father.profession","text",true,"Father's profession",q("What does the candidate's father do, or what was his profession?","उम्मीदवार के वालिद क्या करते हैं या क्या काम करते थे?","امیدوار کے والد کیا کرتے ہیں یا کیا کرتے تھے؟","Candidate ke walid kya karte hain ya kya kaam karte the?"),true),
  f("family.father.education","text",false,"Father's education",q("What is the candidate's father's educational background?","उम्मीदवार के वालिद की पढ़ाई कहाँ तक हुई है?","امیدوار کے والد کی تعلیم کہاں تک ہوئی ہے؟","Candidate ke walid ne kahan tak taleem hasil ki hai?"),true),
  f("family.mother.name","text",true,"Mother's name",q("What is the candidate's mother's name?","उम्मीदवार की वालिदा का नाम क्या है?","امیدوار کی والدہ کا نام کیا ہے؟","Candidate ki walida ka naam kya hai?"),true),
  f("family.mother.profession","text",true,"Mother's profession",q("What does the candidate's mother do, or what was her profession? Homemaker is also a valid answer.","उम्मीदवार की वालिदा क्या करती हैं या क्या काम करती थीं? गृहिणी भी एक सही जवाब है।","امیدوار کی والدہ کیا کرتی ہیں یا کیا کام کرتی تھیں؟ گھریلو خاتون بھی درست جواب ہے۔","Candidate ki walida kya karti hain? Homemaker bhi bilkul valid jawab hai."),true),
  f("family.mother.education","text",false,"Mother's education",q("What is the candidate's mother's educational background?","उम्मीदवार की वालिदा की पढ़ाई कहाँ तक हुई है?","امیدوار کی والدہ کی تعلیم کہاں تک ہوئی ہے؟","Candidate ki walida ne kahan tak taleem hasil ki hai?"),true),
  f("family.siblings.brothers_count","count",true,"Number of brothers",q("How many brothers does the candidate have?","उम्मीदवार के कितने भाई हैं?","امیدوار کے کتنے بھائی ہیں؟","Candidate ke kitne bhai hain?")),
  f("family.siblings.sisters_count","count",true,"Number of sisters",q("And how many sisters does the candidate have?","और उम्मीदवार की कितनी बहनें हैं?","اور امیدوار کی کتنی بہنیں ہیں؟","Aur candidate ki kitni behnein hain?")),
  f("family.family_introduction","text",false,"Family introduction",q("Would you like to say a little more about the family, including siblings if relevant?","क्या आप परिवार के बारे में कुछ और बताना चाहेंगे?","کیا آپ خاندان کے بارے میں کچھ اور بتانا چاہیں گے؟","Kya aap khandan ke baare mein kuch aur batana chahenge?")),
  f("candidate.personal_introduction","text",false,"Personal introduction",q("How would the candidate describe themselves in a few sentences?","उम्मीदवार अपने बारे में दो-तीन वाक्यों में क्या कहना चाहेंगे?","امیدوار اپنے بارے میں دو تین جملوں میں کیا کہنا چاہیں گے؟","Candidate apne baare mein do teen jumlon mein kya kahenge?")),
  f("partner_preferences.preferred_age_range","text",false,"Preferred partner age",q("Do you have a preferred age range for the prospective partner?","रिश्ते के लिए उम्र की कोई पसंद है?","رشتے کے لیے عمر کی کوئی ترجیح ہے؟","Rishte ke liye umr ki koi preference hai?")),
  f("partner_preferences.preferred_cities_or_regions","list",false,"Preferred locations",q("Are there any preferred cities or regions for a prospective partner?","रिश्ते के लिए किसी शहर या इलाके को पसंद करेंगे?","رشتے کے لیے کوئی شہر یا علاقہ ترجیح ہے؟","Rishte ke liye kisi shehar ya ilaqe ki preference hai?")),
  f("partner_preferences.education_preference","text",false,"Education preference",q("Do you have any preference about the prospective partner's education?","रिश्ते के लिए पढ़ाई के बारे में कोई पसंद है?","رشتے کے لیے تعلیم کی کوئی ترجیح ہے؟","Rishte ke liye taleem ki koi preference hai?")),
  f("partner_preferences.profession_preference","text",false,"Profession preference",q("Do you have any preference about the prospective partner's work or profession?","रिश्ते के लिए पेशे को लेकर कोई पसंद है?","رشتے کے لیے پیشے کے بارے میں کوئی ترجیح ہے؟","Rishte ke liye peshe ki koi preference hai?")),
  f("partner_preferences.other_preferences","text",false,"Other preferences",q("Anything else you would like us to know about the person you hope to meet?","जिस तरह का रिश्ता चाहते हैं, उसके बारे में कुछ और बताना चाहेंगे?","آپ جس طرح کا رشتہ چاہتے ہیں، اس کے بارے میں کچھ اور بتانا چاہیں گے؟","Aap jis tarah ka rishta chahte hain, uske bare mein kuch aur batana chahenge?"))
];
export const FIELD_MAP = new Map(FIELDS.map(x=>[x.path,x]));
export const LANGS:Lang[]=["en","hi","ur","roman"];
export const phases:Phase[]=["COLLECTING","BLOCKED_REQUIRED","PAUSED","REVIEW","VERIFY_PHONE","SET_PIN","COMPLETE"];
export type Profile = Record<string, any>;
export type FieldStates = Record<string,FieldStatus>;
export type ChatMessage = { role:"user"|"assistant";text:string;at:string;field?:string };
export type SessionData = {phase:Phase;profile:Profile;fieldStates:FieldStates;messages:ChatMessage[];currentQuestion:string|null;declines:Record<string,number>;lastClass:string|null;reviewConfirmed:boolean;version:number;id:string};

export function freshProfile():Profile {
  return {
    schema_version:"1.0.0",
    registration:{preferred_language:null,preferred_script:null,looking_for:null,profile_for:null,registrant_relationship_to_candidate:null,candidate_consent_confirmed:null},
    candidate:{full_name:null,gender:null,age_years:null,height_cm:null,weight_kg:null,marital_status:null,children_count:null,
      current_location:{city:null,state:null,country:null},
      ancestral_location:{city_or_town:null,district:null,state:null,country:null},
      education:{highest_qualification:null,degree_or_course:null,field_of_study:null,institution:null,two_sentence_description:null},
      occupation:{employment_status:null,profession_or_role:null,employer_or_business:null,work_city:null,income_range:null},
      languages:[],profile_photo:null,personal_introduction:null,interests_and_hobbies:[],additional_details:null},
    family:{father:{name:null,profession:null,education:null,additional_details:null},
      mother:{name:null,profession:null,education:null,additional_details:null},
      siblings:{brothers_count:null,sisters_count:null,brothers:[],sisters:[]},
      family_introduction:null,current_family_city:null,family_ancestral_city:null},
    partner_preferences:{preferred_age_range:null,height_range_cm:{minimum:null,maximum:null},preferred_cities_or_regions:[],education_preference:null,profession_preference:null,marital_status_preference:null,other_preferences:null}
  };
}
export function freshStates():FieldStates {
  return Object.fromEntries(FIELDS.map(x=>[x.path,"not_asked"])) as FieldStates;
}
export function getPath(object:Profile,path:string):unknown {
  return path.split(".").reduce((v:any,key)=>v && typeof v==="object"?v[key]:undefined,object);
}
export function setPath(object:Profile,path:string,value:unknown):Profile {
  if(!FIELD_MAP.has(path))throw Error("Unknown field");
  const copy=structuredClone(object);
  const parts=path.split(".");let dst:any=copy;
  for(let i=0;i<parts.length-1;i++){dst=dst[parts[i]];if(!dst||typeof dst!=="object")throw Error("Invalid field path");}
  dst[parts[parts.length-1]]=value;
  return copy;
}
export function normalizeField(path:string,raw:unknown): {ok:true;value:unknown;complete:boolean}|{ok:false;error:string} {
  const def=FIELD_MAP.get(path);if(!def)return {ok:false,error:"Field is not allowed"};
  let value:unknown=raw;
  if(typeof raw==="string"){value=raw.trim();if(!value)return {ok:false,error:"Answer was empty"};}
  if(def.kind==="age"||def.kind==="height"||def.kind==="weight"||def.kind==="count"){
    if(typeof value==="string"&&/^\d+(?:\.\d+)?$/.test(value))value=Number(value);
    if(typeof value!=="number"||!Number.isFinite(value))return {ok:false,error:"Expected a number"};
    const bounds=def.kind==="age"?[18,100]:def.kind==="height"?[100,250]:def.kind==="weight"?[25,400]:[0,30];
    if(value<bounds[0]||value>bounds[1])return {ok:false,error:"Value outside allowed range"};
    if((def.kind==="age"||def.kind==="count")&&!Number.isInteger(value))return {ok:false,error:"Whole number required"};
    return {ok:true,value,complete:true};
  }
  if(def.kind==="languages"){
    if(typeof value==="string"){try{value=JSON.parse(value);}catch{return {ok:false,error:"Expected language list"};}}
    if(!Array.isArray(value)||value.length<1||value.length>15)return {ok:false,error:"Please provide 1 to 15 languages"};
    const names=new Set<string>();
    const v=[];
    for(const item of value){
      if(!item||typeof item!=="object"||typeof item.name!=="string"||!item.name.trim()||item.name.length>50)return {ok:false,error:"Invalid language entry"};
      const name=item.name.trim();if(names.has(name.toLowerCase()))return {ok:false,error:"Duplicate language"};names.add(name.toLowerCase());
      for(const key of ["can_speak","can_read","can_write"])if(item[key]!==null&&typeof item[key]!=="boolean")return {ok:false,error:"Language abilities must be true, false or null"};
      v.push({name,can_speak:item.can_speak??null,can_read:item.can_read??null,can_write:item.can_write??null});
    }
    return {ok:true,value:v,complete:v.every(item=>item.can_speak!==null&&item.can_read!==null&&item.can_write!==null)};
  }
  if(def.kind==="list"){
    if(typeof value==="string"){try{value=JSON.parse(value);}catch{value=(value as string).split(",").map((x:string)=>x.trim());}}
    if(!Array.isArray(value)||value.length>20||!value.every(x=>typeof x==="string"&&x.trim().length>0&&x.length<=120))return {ok:false,error:"Expected a list of short place names"};
    return {ok:true,value:value.map((x:string)=>x.trim()),complete:true};
  }
  if(typeof value!=="string"||value.length>1000)return {ok:false,error:"Expected short text"};
  if(def.kind==="gender"&&!["male","female","other","self_described"].includes(value.toLowerCase()))return {ok:false,error:"Gender needs clarification"};
  if(def.kind==="marital"&&!["never married","divorced","widowed","separated","annulled","other"].includes(value.toLowerCase()))return {ok:false,error:"Marital status needs clarification"};
  if(def.kind==="education_description"){
    const sentences=value.split(/[.!?।؟]+/u).map(x=>x.trim()).filter(Boolean);
    if(sentences.length<2)return {ok:false,error:"Please provide two sentences about education"};
  }
  return {ok:true,value,complete:true};
}
export function getLanguage(profile:Profile):Lang {
  const v=profile?.registration?.preferred_script;
  return LANGS.includes(v)?v:"roman";
}
// Seven short clusters replace a long one-field-at-a-time interview.
// When a person supplies several answers together, missing fields in that
// cluster are recalculated and only those still missing are re-asked.
export type CoreGroup = {id:string;paths:string[];labelsEn:string[];labelsRoman:string[]};
export const CORE_GROUPS:CoreGroup[]=[
 {id:"identity",paths:["candidate.full_name","candidate.age_years","candidate.gender"],
  labelsEn:["candidate's full name","age in years","gender"],
  labelsRoman:["poora naam","umr saalon mein","gender"]},
 {id:"location",paths:["candidate.current_location.city","candidate.ancestral_location.city_or_town"],
  labelsEn:["current city","ancestral town or city"],
  labelsRoman:["abhi ka shehar","aabai shehar ya qasba"]},
 {id:"basics",paths:["candidate.height_cm","candidate.marital_status"],
  labelsEn:["height","marital status"],
  labelsRoman:["qad","shaadi ki haalat"]},
 {id:"work",paths:["candidate.education.highest_qualification","candidate.occupation.profession_or_role"],
  labelsEn:["highest qualification","current work or study"],
  labelsRoman:["sabse aala taleem","abhi ka kaam ya padhai"]},
 {id:"father",paths:["family.father.name","family.father.profession"],
  labelsEn:["father's name","father's profession"],
  labelsRoman:["walid ka naam","walid ka kaam"]},
 {id:"mother",paths:["family.mother.name","family.mother.profession"],
  labelsEn:["mother's name","mother's profession"],
  labelsRoman:["walida ka naam","walida ka kaam"]},
 {id:"siblings",paths:["family.siblings.brothers_count","family.siblings.sisters_count"],
  labelsEn:["number of brothers","number of sisters"],
  labelsRoman:["kitne bhai hain","kitni behnein hain"]}
];
export function isFieldSatisfied(def:FieldDef,states:FieldStates):boolean{
  const status=states[def.path]??"not_asked";
  return status==="answered"||(status==="unknown"&&Boolean(def.allowUnknown));
}
export function inferCandidateGender(lookingFor:"bride"|"groom"):"male"|"female" {
  // In this matrimonial flow the selected partner role implies candidate gender.
  // A profile edit can still correct the inference.
  return lookingFor==="bride"?"male":"female";
}
export function nextQuestion(profile:Profile,states:FieldStates,excluded:ReadonlySet<string>=new Set()):FieldDef|null {
  for(const group of CORE_GROUPS){
    const missing=group.paths.filter(path=>{
      const def=FIELD_MAP.get(path);
      return def&&def.required&&!excluded.has(path)&&!isFieldSatisfied(def,states);
    });
    if(!missing.length)continue;
    const main=FIELD_MAP.get(missing[0])!;
    if(missing.length===1)return {...main,targetPaths:missing};
    const pieces=missing.map(path=>group.paths.indexOf(path));
    const en=pieces.map(i=>group.labelsEn[i]).join(", ");
    const roman=pieces.map(i=>group.labelsRoman[i]).join(", ");
    const enQuestion="Please tell me the "+en+".";
    const romanQuestion="Batayein: "+roman+".";
    return {...main,targetPaths:missing,ask:{en:enQuestion,roman:romanQuestion,hi:romanQuestion,ur:romanQuestion}};
  }
  return null;
}
export function groupProgress(states:FieldStates){
  const finished=CORE_GROUPS.filter(g=>g.paths.every(path=>isFieldSatisfied(FIELD_MAP.get(path)!,states))).length;
  return {finished,total:CORE_GROUPS.length};
}
export function missingRequired(states:FieldStates):string[] {
  return FIELDS.filter(f=>f.required&&!["answered",...(f.allowUnknown?["unknown"]:[])].includes(states[f.path])).map(f=>f.path);
}
export function allFieldsResolved(states:FieldStates):boolean {
  return FIELDS.filter(f=>f.required).every(f=>states[f.path]==="answered"||(f.allowUnknown&&states[f.path]==="unknown"));
}
export function percentComplete(states:FieldStates):number {
  const required=FIELDS.filter(f=>f.required);
  const count=required.filter(f=>states[f.path]==="answered"||(f.allowUnknown&&states[f.path]==="unknown")).length;
  return Math.floor(100*count/Math.max(1,required.length));
}
export function safeHistory(messages:ChatMessage[]):ChatMessage[] {
  return messages.slice(-60).map(m=>({role:m.role,text:m.text.slice(0,1600),at:m.at,field:m.field}));
}
export function localized(lang:Lang,en:string,hi:string,ur:string,roman:string):string{return ({en,hi,ur,roman})[lang];}
