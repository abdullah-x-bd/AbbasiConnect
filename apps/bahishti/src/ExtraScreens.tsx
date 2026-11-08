import React from "react";
import {ActivityIndicator,Image,Pressable,ScrollView,Text,View} from "react-native";
import {T,st,Btn,Field,Back} from "./minimal-ui";

export type ExtraField={path:string;en:string;roman:string;help?:string};
export const EXTRA_FIELDS:ExtraField[]=[
  {path:"family.father.education",en:"Father's education",roman:"Walid ki taleem"},
  {path:"family.mother.education",en:"Mother's education",roman:"Walida ki taleem"},
  {path:"candidate.education.institution",en:"College or university",roman:"College ya university"},
  {path:"candidate.education.two_sentence_description",en:"More about education",roman:"Padhai ki tafseel",
    help:"Write two short sentences / Do chhote jumle likhein"},
  {path:"candidate.personal_introduction",en:"About the candidate",roman:"Apne baare mein",
    help:"A few sentences / Kuch jumle"},
  {path:"family.family_introduction",en:"About the family",roman:"Khandaan ke baare mein"},
  {path:"partner_preferences.preferred_age_range",en:"Preferred age",roman:"Umr ki pasand"},
  {path:"partner_preferences.preferred_cities_or_regions",en:"Preferred places",roman:"Shehar ki pasand",
    help:"Separate places with commas / Shehar comma se alag likhein"},
  {path:"partner_preferences.education_preference",en:"Preferred education",roman:"Taleem ki pasand"},
  {path:"partner_preferences.profession_preference",en:"Preferred occupation",roman:"Kaam ki pasand"},
  {path:"partner_preferences.other_preferences",en:"Other preferences",roman:"Aur pasand"}
];
function val(obj:any,path:string):string{
  const value=path.split(".").reduce((a:any,k)=>a&&typeof a==="object"?a[k]:undefined,obj);
  if(Array.isArray(value))return value.filter((v:any)=>typeof v==="string").join(", ");
  return typeof value==="string"?value:"";
}
function Header({en,roman,onBack}:{en:string;roman:string;onBack:()=>void}){
  return <View style={{height:67,paddingHorizontal:22,borderBottomWidth:1,borderColor:T.border,
    flexDirection:"row",alignItems:"center",gap:12}}>
    <Back onPress={onBack}/>
    <View style={{flex:1}}>
      <Text style={{fontSize:19,color:T.ink,fontWeight:"700"}}>{en}</Text>
      <Text style={{fontSize:12,color:T.muted,marginTop:2}}>{roman}</Text>
    </View><Text style={{fontSize:19,color:T.accent,fontWeight:"800"}}>ABC</Text>
  </View>;
}
export function BiodataScreen({jpegUri,profile,photoUri,busy,onBack,onSave,onShare}:{
  jpegUri:string|null;profile:any;photoUri:string|null;busy:boolean;
  onBack:()=>void;onSave:()=>void;onShare:()=>void
}){
  const c=profile?.candidate||{},f=profile?.family||{};
  return <View style={st.page}>
    <Header en="Your Bio Data" roman="Aapka biodata" onBack={onBack}/>
    <ScrollView contentContainerStyle={{padding:17,paddingBottom:35}} showsVerticalScrollIndicator={false}>
      <Text style={{color:T.muted,fontSize:14,marginBottom:12,textAlign:"center"}}>
        Ready to share / Share karne ke liye tayyar
      </Text>
      {jpegUri?
        <Image accessibilityLabel="Generated JPEG matrimonial biodata preview" source={{uri:jpegUri}}
          resizeMode="contain" style={{width:"100%",aspectRatio:1200/1800,borderRadius:12,backgroundColor:T.white,
            borderWidth:1,borderColor:T.border}}/>:
        <View style={{backgroundColor:"#FCFCFA",borderRadius:14,borderWidth:1,borderColor:T.border,
          minHeight:430,padding:22}}>
          <View style={{flexDirection:"row",alignItems:"center",gap:10,marginBottom:19}}>
            <View style={{width:40,height:40,borderRadius:10,backgroundColor:T.accent,
              alignItems:"center",justifyContent:"center"}}><Text style={{color:T.white,fontWeight:"800"}}>ABC</Text></View>
            <Text style={{color:T.ink,fontWeight:"700",fontSize:13}}>ABBASI BAHISHTI CONNECTIONS</Text>
          </View>
          <View style={{flexDirection:"row",gap:12,alignItems:"flex-start",marginBottom:19}}>
            <View style={{flex:1}}>
              <Text style={{color:T.ink,fontWeight:"800",fontSize:25}}>{c.full_name||"Candidate"}</Text>
              <Text style={{color:T.muted,fontSize:15,marginTop:7}}>
                {[c.age_years?c.age_years+" years":"",c.height_cm?c.height_cm+" cm":"",c.current_location?.city].filter(Boolean).join(" · ")}
              </Text>
            </View>
            {photoUri?<Image source={{uri:photoUri}} style={{width:90,height:112,borderRadius:9}}/>:
              <View style={{width:90,height:112,borderRadius:9,backgroundColor:T.light,
                alignItems:"center",justifyContent:"center"}}>
                <Text style={{color:T.accent,fontSize:32}}>{String(c.full_name||"A").slice(0,1)}</Text>
              </View>}
          </View>
          <Text style={{fontSize:15,fontWeight:"800",color:T.accent,marginBottom:7}}>PERSONAL DETAILS</Text>
          <Text style={{fontSize:15,color:T.ink,lineHeight:26}}>
            {c.education?.highest_qualification||""}
            {"\n"}{c.occupation?.profession_or_role||""}
            {"\n"}{c.ancestral_location?.city_or_town||""}
          </Text>
          <View style={{height:1,backgroundColor:T.border,marginVertical:18}}/>
          <Text style={{fontSize:15,fontWeight:"800",color:T.accent,marginBottom:7}}>FAMILY</Text>
          <Text style={{fontSize:14,color:T.ink,lineHeight:25}}>
            {f.father?.name||""} · {f.father?.profession||""}
            {"\n"}{f.mother?.name||""} · {f.mother?.profession||""}
            {"\n"}{f.siblings?.brothers_count??0} brothers · {f.siblings?.sisters_count??0} sisters
          </Text>
          <Text style={{fontSize:11,color:T.accent,marginTop:18}}>ABC · Abbasi Bahishti Connections</Text>
        </View>}
      {busy?<View style={{padding:19}}><ActivityIndicator color={T.accent}/></View>:null}
      <View style={{height:20}}/>
      <Btn en="Save JPEG" roman="JPEG phone mein rakhein" onPress={onSave} disabled={busy||!jpegUri}/>
      <View style={{height:12}}/>
      <Btn en="Share Bio Data" roman="Biodata share karein" secondary onPress={onShare} disabled={busy||!jpegUri}/>
      <Text style={[st.note,{marginTop:17,textAlign:"center"}]}>
        Full-size JPEG with ABC branding / Badi tasveer, ABC ke naam ke saath
      </Text>
    </ScrollView>
  </View>;
}
export function EnrichmentScreen({profile,busy,selected,value,setValue,select,onSave,onBack}:{
  profile:any;busy:boolean;selected:string;value:string;setValue:(x:string)=>void;
  select:(field:ExtraField)=>void;onSave:()=>void;onBack:()=>void
}){
  const selectedDef=EXTRA_FIELDS.find(x=>x.path===selected);
  return <View style={st.page}>
    <Header en="More details" roman="Aur jaankari" onBack={onBack}/>
    <ScrollView contentContainerStyle={{padding:20,paddingBottom:50}} keyboardShouldPersistTaps="handled">
      <Text style={[st.sub,{fontSize:16,marginBottom:18}]}>Optional, at your convenience.</Text>
      <Text style={[st.roman,{marginTop:-17,marginBottom:24}]}>Yeh zaroori nahi. Jab chahein likhein.</Text>
      <View style={st.card}>
        {EXTRA_FIELDS.map((field,i)=><View key={field.path}>
          {i>0?<View style={{height:1,backgroundColor:T.border,marginVertical:13}}/>:null}
          <Pressable accessibilityRole="button" accessibilityLabel={"Edit "+field.en}
            onPress={()=>select(field)} style={{flexDirection:"row",alignItems:"center",gap:9}}>
            <View style={{flex:1}}>
              <Text style={{fontSize:16,color:T.ink,fontWeight:"600"}}>{field.en}</Text>
              <Text style={{fontSize:13,color:T.muted,marginTop:2}}>{field.roman}</Text>
              {val(profile,field.path)?<Text numberOfLines={2}
                style={{fontSize:13,color:T.accent,marginTop:5}}>{val(profile,field.path)}</Text>:null}
            </View>
            <Text style={{color:T.accent,fontSize:17}}>›</Text>
          </Pressable>
        </View>)}
      </View>
      {selectedDef?<View style={[st.card,{marginTop:14}]}>
        <Text style={{fontSize:19,fontWeight:"700",color:T.ink,marginBottom:6}}>{selectedDef.en}</Text>
        <Text style={[st.roman,{marginBottom:13,marginTop:0}]}>{selectedDef.roman}</Text>
        {selectedDef.help?<Text style={[st.note,{marginBottom:13}]}>{selectedDef.help}</Text>:null}
        <Field label="Your answer" roman="Apna jawaab" value={value} onChangeText={setValue}
          multiline={selectedDef.path.includes("introduction")||selectedDef.path.includes("description")}/>
        <Btn en="Save" roman="Save karein" onPress={onSave} disabled={!value.trim()||busy}/>
        <View style={{height:10}}/>
        <Btn en="Cancel" roman="Rehne dein" secondary onPress={()=>select({path:"",en:"",roman:""})}/>
      </View>:null}
    </ScrollView>
  </View>;
}
