import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

export const T={
  paper:"#FCFCFA",white:"#FFFFFF",ink:"#182626",muted:"#627270",faint:"#8F9B98",
  accent:"#1E6257",light:"#E7F2EF",border:"#E2E9E6",line:"#F0F3F2",
  danger:"#A44646",soft:"#F7F9F8"
};
export const st=StyleSheet.create({
  page:{flex:1,backgroundColor:T.paper},inner:{paddingHorizontal:24,paddingTop:24,paddingBottom:42,flexGrow:1},
  logo:{fontSize:35,fontWeight:"800",letterSpacing:-1.7,color:T.ink},
  app:{fontSize:14,color:T.muted,fontWeight:"600",marginTop:5,letterSpacing:.1},
  h:{fontSize:29,color:T.ink,fontWeight:"700",letterSpacing:-.65,lineHeight:37},
  sub:{fontSize:16,color:T.muted,lineHeight:24,marginTop:7},
  roman:{fontSize:16,color:T.accent,lineHeight:23,marginTop:3},
  note:{fontSize:13,color:T.faint,lineHeight:19},
  button:{minHeight:56,borderRadius:16,backgroundColor:T.accent,alignItems:"center",justifyContent:"center",
    paddingVertical:13,paddingHorizontal:16},
  secondary:{backgroundColor:T.white,borderWidth:1,borderColor:T.border},
  btnTitle:{fontSize:17,color:T.white,fontWeight:"700",textAlign:"center"},
  btnRoman:{fontSize:13,color:"#D4EBE5",marginTop:3,textAlign:"center",fontWeight:"500"},
  input:{borderWidth:1.5,borderColor:T.border,borderRadius:15,minHeight:58,backgroundColor:T.white,
    color:T.ink,fontSize:19,paddingHorizontal:16,paddingVertical:12},
  inputLabel:{fontSize:14,color:T.ink,fontWeight:"600",marginBottom:10},
  topline:{height:1,backgroundColor:T.border,marginVertical:21},
  divider:{height:1,backgroundColor:T.line,marginVertical:14},
  back:{minWidth:50,minHeight:45,justifyContent:"center"},
  card:{borderWidth:1,borderColor:T.border,borderRadius:20,padding:18,backgroundColor:T.white},
  chip:{backgroundColor:T.light,borderRadius:99,paddingHorizontal:10,paddingVertical:5},
  badge:{fontSize:12,color:T.accent,fontWeight:"700"},
  tabbar:{flexDirection:"row",borderTopWidth:1,borderTopColor:T.border,backgroundColor:T.white,
    paddingHorizontal:12,paddingTop:7,paddingBottom:5},
  tab:{flex:1,alignItems:"center",paddingVertical:8,gap:3},
  tabTxt:{fontSize:13,color:T.muted,fontWeight:"600"},
  tabSmall:{fontSize:10,color:T.faint},
  bubble:{maxWidth:"87%",paddingHorizontal:15,paddingVertical:13,borderRadius:18,marginBottom:10},
  aiBubble:{alignSelf:"flex-start",backgroundColor:T.white,borderWidth:1,borderColor:T.border,borderBottomLeftRadius:5},
  myBubble:{alignSelf:"flex-end",backgroundColor:T.accent,borderBottomRightRadius:5},
  bubbleText:{color:T.ink,fontSize:17,lineHeight:25},
  progress:{height:4,backgroundColor:T.border,borderRadius:4,overflow:"hidden"},
  progressFill:{height:"100%",backgroundColor:T.accent,borderRadius:4},
});
export function Paragraph({en,roman,style}: {en:string;roman?:string;style?:any}){
  return <View style={style}><Text style={st.sub}>{en}</Text>{roman?<Text style={st.roman}>{roman}</Text>:null}</View>;
}
export function H({en,roman,center=false}:{en:string;roman:string;center?:boolean}){
  return <View style={{marginBottom:24}}><Text style={[st.h,center&&{textAlign:"center"}]}>{en}</Text>
    <Text style={[st.roman,center&&{textAlign:"center"}]}>{roman}</Text></View>;
}
export function Btn({en,roman,onPress,secondary=false,disabled=false,compact=false,outlined=false}:{
  en:string;roman:string;onPress:()=>void;secondary?:boolean;disabled?:boolean;compact?:boolean;outlined?:boolean
}){
  return <Pressable accessibilityRole="button" accessibilityLabel={en+" / "+roman} onPress={onPress} disabled={disabled}
    style={[st.button,(secondary||outlined)&&st.secondary,compact&&{minHeight:48,paddingVertical:8},disabled&&{opacity:.48}]}>
    <Text style={[st.btnTitle,(secondary||outlined)&&{color:T.accent},compact&&{fontSize:15}]}>{en}</Text>
    <Text style={[st.btnRoman,(secondary||outlined)&&{color:T.muted},compact&&{fontSize:12}]}>{roman}</Text>
  </Pressable>;
}
export function Field({label,roman,value,onChangeText,placeholder,secure=false,numeric=false,...props}:{
  label:string;roman?:string;value:string;onChangeText:(t:string)=>void;placeholder?:string;secure?:boolean;numeric?:boolean;
}&Omit<TextInputProps,"value"|"onChangeText">){
  return <View style={{marginBottom:19}}><Text style={st.inputLabel}>{label}{roman?" / "+roman:""}</Text>
    <TextInput {...props} accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={T.faint}
      value={value} onChangeText={onChangeText} secureTextEntry={secure} keyboardType={numeric?"number-pad":"default"}
      style={[st.input,props.multiline&&{minHeight:110,textAlignVertical:"top"}]} />
  </View>;
}
export function Circle({text,onPress,kind="secondary",label,size=49,disabled=false}:{
  text:string;onPress:()=>void;kind?:"secondary"|"accent";label:string;size?:number;disabled?:boolean
}){
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled}
    style={{width:size,height:size,borderRadius:size/2,alignItems:"center",justifyContent:"center",
      borderWidth:kind==="secondary"?1:0,borderColor:T.border,backgroundColor:kind==="accent"?T.accent:T.white,opacity:disabled?.48:1}}>
    <Text style={{fontSize:22,fontWeight:"600",color:kind==="accent"?T.white:T.accent}}>{text}</Text>
  </Pressable>;
}
export function Back({onPress}: {onPress:()=>void}){
  return <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={st.back} onPress={onPress}>
    <Text style={{color:T.ink,fontSize:28,fontWeight:"400"}}>‹</Text>
  </Pressable>;
}
export function Hr(){return <View style={st.divider}/>}
