/**
 * ABC discovery v1: deterministic, server-side eligibility, city matching,
 * candidate filters and explainable reciprocal preference ranking.
 * Never expose an unpublished, nonconsenting or own registration.
 */
export type DiscoverSort="relevance"|"nearest";
export type DiscoverQuery={
  city?:string;sort?:DiscoverSort;page?:number;limit?:number;
  ageMin?:number;ageMax?:number;heightMin?:number;heightMax?:number;
  maritalStatus?:string;education?:string;occupation?:string;
};
export type DiscoverRecord={
  id:string;phase:string;visible:boolean;profile:any;updatedAt:Date|string;
  account?:{id:string;phoneVerified:boolean}|null;
};
const cityAliases:Record<string,string>={
  "delhi":"Delhi","dilli":"Delhi","new delhi":"Delhi",
  "nayi dilli":"Delhi","नई दिल्ली":"Delhi","दिल्ली":"Delhi","دہلی":"Delhi",
  "علی گڑھ":"Aligarh","aligarh":"Aligarh","aligadh":"Aligarh","अलीगढ़":"Aligarh",
  "bengaluru":"Bengaluru","bangalore":"Bengaluru",
  "gurugram":"Gurugram","gurgaon":"Gurugram",
  "prayagraj":"Prayagraj","allahabad":"Prayagraj",
  "varanasi":"Varanasi","banaras":"Varanasi","benares":"Varanasi",
  "mumbai":"Mumbai","bombay":"Mumbai",
  "kolkata":"Kolkata","calcutta":"Kolkata",
  "chennai":"Chennai","madras":"Chennai",
  "noida":"Noida","greater noida":"Greater Noida","ghaziabad":"Ghaziabad",
  "lucknow":"Lucknow","kanpur":"Kanpur","jaipur":"Jaipur","agra":"Agra",
  "patna":"Patna","meerut":"Meerut","faridabad":"Faridabad",
  "hyderabad":"Hyderabad","pune":"Pune","ahmedabad":"Ahmedabad",
  "chandigarh":"Chandigarh","bhopal":"Bhopal"
};
export function normalizeCity(raw:unknown):string{
  const value=String(raw??"").normalize("NFKC").trim().replace(/\s+/g," ");
  if(!value)return "";
  const lower=value.toLocaleLowerCase();
  return cityAliases[lower]||value.replace(/\b\w/g,c=>c.toUpperCase());
}
// Approximate city-centre coordinates, never home or GPS locations.
const cityCentres:Record<string,[number,number]>={
  "Delhi":[28.6139,77.209],"Noida":[28.5355,77.391],"Greater Noida":[28.4744,77.503],
  "Ghaziabad":[28.6692,77.4538],"Gurugram":[28.4595,77.0266],"Faridabad":[28.4089,77.3178],
  "Aligarh":[27.8974,78.088],"Meerut":[28.9845,77.7064],"Agra":[27.1767,78.0081],
  "Lucknow":[26.8467,80.9462],"Kanpur":[26.4499,80.3319],
  "Jaipur":[26.9124,75.7873],"Chandigarh":[30.7333,76.7794],
  "Bhopal":[23.2599,77.4126],"Patna":[25.5941,85.1376],
  "Prayagraj":[25.4358,81.8463],"Varanasi":[25.3176,82.9739],
  "Mumbai":[19.076,72.8777],"Pune":[18.5204,73.8567],
  "Ahmedabad":[23.0225,72.5714],"Hyderabad":[17.385,78.4867],
  "Bengaluru":[12.9716,77.5946],"Chennai":[13.0827,80.2707],
  "Kolkata":[22.5726,88.3639]
};
export function approximateCityKm(a:unknown,b:unknown):number|null{
  const aa=cityCentres[normalizeCity(a)],bb=cityCentres[normalizeCity(b)];
  if(!aa||!bb)return null;
  const toRad=(x:number)=>x*Math.PI/180;
  const dLat=toRad(bb[0]-aa[0]),dLon=toRad(bb[1]-aa[1]);
  const hav=Math.sin(dLat/2)**2+Math.cos(toRad(aa[0]))*Math.cos(toRad(bb[0]))*Math.sin(dLon/2)**2;
  return Math.round(6371*2*Math.asin(Math.min(1,Math.sqrt(hav))));
}
export function parsePreferredAge(value:unknown):{min:number;max:number}|null{
  if(typeof value!=="string")return null;
  const m=value.match(/\b(1[89]|[2-8]\d|9[0-5])\s*(?:-|to|–)\s*(1[89]|[2-8]\d|9[0-5])\b/i);
  if(!m)return null;
  const min=Number(m[1]),max=Number(m[2]);
  return min<=max?{min,max}:null;
}
function str(v:unknown):string{return typeof v==="string"?v.trim():"";}
function positive(v:unknown):number|null{
  const n=Number(v);return Number.isFinite(n)&&n>0?n:null;
}
function mentions(preferred:string,actual:string):boolean{
  const a=preferred.toLocaleLowerCase(),b=actual.toLocaleLowerCase();
  return !!a&&!!b&&(a.includes(b)||b.includes(a));
}
function fitsPreference(preferences:any,other:any){
  const tests:{weight:number;match:boolean;reason:string}[]=[];
  const currentCity=normalizeCity(other?.candidate?.current_location?.city);
  const cities=Array.isArray(preferences?.preferred_cities_or_regions)?
    preferences.preferred_cities_or_regions.map(normalizeCity).filter(Boolean):[];
  if(cities.length)tests.push({weight:30,match:cities.includes(currentCity),reason:"Preferred city"});
  const ages=parsePreferredAge(preferences?.preferred_age_range);
  if(ages){
    const age=positive(other?.candidate?.age_years);
    if(age!==null)tests.push({weight:30,match:age>=ages.min&&age<=ages.max,reason:"Age preference"});
  }
  const marital=str(preferences?.marital_status_preference);
  if(marital)tests.push({weight:20,match:mentions(marital,str(other?.candidate?.marital_status)),reason:"Marital status preference"});
  const edu=str(preferences?.education_preference);
  if(edu)tests.push({weight:10,match:mentions(edu,str(other?.candidate?.education?.highest_qualification)),reason:"Education preference"});
  const profession=str(preferences?.profession_preference);
  if(profession)tests.push({weight:10,match:mentions(profession,str(other?.candidate?.occupation?.profession_or_role)),reason:"Occupation preference"});
  const total=tests.reduce((n,t)=>n+t.weight,0);
  const matched=tests.reduce((n,t)=>n+(t.match?t.weight:0),0);
  return {total,matched,reasons:tests.filter(t=>t.match).map(t=>t.reason)};
}
export function mutualSeeks(viewer:any,target:any):boolean{
  const viewerSeeks=viewer?.registration?.looking_for;
  const targetSeeks=target?.registration?.looking_for;
  if(viewerSeeks!=="bride"&&viewerSeeks!=="groom")return false;
  if(viewerSeeks==="bride")return targetSeeks==="groom"&&target?.candidate?.gender==="female";
  return targetSeeks==="bride"&&target?.candidate?.gender==="male";
}
export function exploreCandidates(viewer:any,records:DiscoverRecord[],input:DiscoverQuery={}){
  const city=str(input.city),origin=viewer?.candidate?.current_location?.city;
  const accepted=records.filter(row=>
    row.visible&&row.phase==="COMPLETE"&&Boolean(row.account)&&
    row.profile?.registration?.candidate_consent_confirmed===true&&
    mutualSeeks(viewer,row.profile));
  const citiesMap=new Map<string,number>();
  for(const row of accepted){
    const cityName=normalizeCity(row.profile?.candidate?.current_location?.city);
    if(cityName)citiesMap.set(cityName,(citiesMap.get(cityName)||0)+1);
  }
  const cities=[...citiesMap.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
    .map(([name,count])=>({name,count}));
  const wanted=normalizeCity(city).toLocaleLowerCase();
  const filtered=accepted.filter(row=>{
    const p=row.profile,c=p?.candidate||{};
    const normalized=normalizeCity(c.current_location?.city).toLocaleLowerCase();
    const age=positive(c.age_years),height=positive(c.height_cm);
    if(wanted&&!normalized.includes(wanted))return false;
    if(input.ageMin!==undefined&&(age===null||age<input.ageMin))return false;
    if(input.ageMax!==undefined&&(age===null||age>input.ageMax))return false;
    if(input.heightMin!==undefined&&(height===null||height<input.heightMin))return false;
    if(input.heightMax!==undefined&&(height===null||height>input.heightMax))return false;
    if(input.maritalStatus&&str(c.marital_status)!==input.maritalStatus)return false;
    if(input.education&&!str(c.education?.highest_qualification).toLocaleLowerCase().includes(input.education.toLocaleLowerCase()))return false;
    if(input.occupation&&!str(c.occupation?.profession_or_role).toLocaleLowerCase().includes(input.occupation.toLocaleLowerCase()))return false;
    return true;
  }).map(row=>{
    const p=row.profile,c=p.candidate||{};
    const a=fitsPreference(viewer?.partner_preferences||{},p);
    const b=fitsPreference(p?.partner_preferences||{},viewer);
    const dist=approximateCityKm(origin,c.current_location?.city);
    const sameCity=Boolean(origin)&&normalizeCity(origin)===normalizeCity(c.current_location?.city);
    const active=a.total+b.total;
    const alignment=active?Math.round(65*(a.matched+b.matched)/active):0;
    const proximity=sameCity?25:dist!==null&&dist<=150?12:dist!==null&&dist<=400?5:0;
    const relevance=alignment+proximity+(row.account?.phoneVerified?2:0);
    const reasons=[...new Set([
      ...(sameCity?["Same city"]:dist!==null&&dist<=150?["Nearby city"]:[]),
      ...a.reasons,...(b.matched>0?["Reciprocal preferences"]:[])
    ])].slice(0,3);
    return {
      profileId:row.id,publicId:"ABC-"+row.id.replace(/-/g,"").slice(0,8).toUpperCase(),
      hasPhoto:Boolean(c.profile_photo?.uploaded),verified:Boolean(row.account?.phoneVerified),
      name:str(c.full_name),age:positive(c.age_years),gender:str(c.gender),
      city:str(c.current_location?.city),height_cm:positive(c.height_cm),
      education:str(c.education?.highest_qualification),
      occupation:str(c.occupation?.profession_or_role),
      maritalStatus:str(c.marital_status),introduction:str(c.personal_introduction),
      looking_for:p.registration?.looking_for,distanceKm:dist,matchReasons:reasons,
      relevance,_updated:new Date(row.updatedAt).getTime()
    };
  });
  filtered.sort((a,b)=>{
    if(input.sort==="nearest"){
      const da=a.distanceKm??Number.POSITIVE_INFINITY,db=b.distanceKm??Number.POSITIVE_INFINITY;
      return da-db||b.relevance-a.relevance||b._updated-a._updated||a.profileId.localeCompare(b.profileId);
    }
    return b.relevance-a.relevance||b._updated-a._updated||a.profileId.localeCompare(b.profileId);
  });
  const page=input.page||1,limit=input.limit||20,start=(page-1)*limit;
  return {candidates:filtered.slice(start,start+limit).map(({relevance,_updated,...safe})=>safe),
    total:filtered.length,page,limit,hasMore:start+limit<filtered.length,cities,sort:input.sort||"relevance"};
}
