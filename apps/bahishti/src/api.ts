import * as SecureStore from "expo-secure-store";

const ROOT=(process.env.EXPO_PUBLIC_API_URL||"https://abbasiconnect-api.onrender.com").replace(/\/+$/,"");
const DRAFT_KEY="abc.bahishti.draft.v1";
const MEMBER_KEY="abc.bahishti.member.v1";
let bearer:string|null=null;

export type Lang="en"|"hi"|"ur"|"roman";
export type Phase="COLLECTING"|"BLOCKED_REQUIRED"|"PAUSED"|"REVIEW"|"VERIFY_PHONE"|"SET_PIN"|"COMPLETE";
export type FieldStatus="not_asked"|"answered"|"unknown"|"declined"|"needs_clarification";
export type ChatMessage={role:"user"|"assistant";text:string;at:string;field?:string};
export type Profile={registration:Record<string,any>;candidate:Record<string,any>;family:Record<string,any>;partner_preferences:Record<string,any>;schema_version:string};
export type Session={id:string;phase:Phase;profile:Profile;fieldStates:Record<string,FieldStatus>;
  messages:ChatMessage[];currentQuestion:string|null;currentQuestionText?:string|null;currentQuestionTargets?:string[];
  progress:number;missingRequired:string[];version:number;
  reviewConfirmed:boolean;phone:string|null;visible:boolean};
export type Account={member:{id:string;phone:string};profile:Profile;visible:boolean;phase:Phase};
export type Candidate={profileId:string;name:string;age:number;gender:string;city:string;height_cm:number;education:string;occupation:string;introduction:string;looking_for:string};

export function getBearer(){return bearer;}
export async function restoreTokens(){
  const member=await SecureStore.getItemAsync(MEMBER_KEY);
  const draft=await SecureStore.getItemAsync(DRAFT_KEY);
  bearer=member||draft;return {member,draft};
}
export async function setDraftToken(token:string){await SecureStore.setItemAsync(DRAFT_KEY,token);bearer=token;}
export async function setMemberToken(token:string){
  await SecureStore.setItemAsync(MEMBER_KEY,token);
  await SecureStore.deleteItemAsync(DRAFT_KEY);
  bearer=token;
}
export async function useDraftToken(token:string){bearer=token;}
export async function clearTokens(){
  bearer=null;
  await Promise.all([SecureStore.deleteItemAsync(MEMBER_KEY),SecureStore.deleteItemAsync(DRAFT_KEY)]);
}
export async function api<T=any>(path:string,options:{method?:string;body?:unknown;token?:string}={}):Promise<T>{
  if(!path.startsWith("/abc/"))throw Error("Invalid ABC API path");
  const headers:Record<string,string>={Accept:"application/json"};
  if(options.body!==undefined)headers["Content-Type"]="application/json";
  const chosen=options.token??bearer;
  if(chosen)headers.Authorization="Bearer "+chosen;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),95000);
  let response:Response;
  try{
    response=await fetch(ROOT+path,{method:options.method||"GET",headers,
      body:options.body===undefined?undefined:JSON.stringify(options.body),signal:controller.signal});
  }catch{throw new Error("Network unavailable. Please check your connection and try again.");}
  finally{clearTimeout(timer);}
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.error||"Request failed ("+response.status+")");
  return payload as T;
}
export function pathValue(profile:Profile,path:string):unknown{
  return path.split(".").reduce((v:any,k)=>v&&typeof v==="object"?v[k]:undefined,profile as any);
}
export function prettyField(path:string):string{
  const last=path.split(".").pop()||path;
  return last.replace(/_/g," ").replace(/\b\w/g,x=>x.toUpperCase());
}
