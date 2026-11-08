import sharp from "sharp";

export const BIODATA_WIDTH=1200;
export const BIODATA_HEIGHT=1800;
type Profile = Record<string,any>;

function get(obj:any,path:string):any {
  return path.split(".").reduce((x:any,p)=>x&&typeof x==="object"?x[p]:undefined,obj);
}
function present(v:unknown):string|null {
  if(v===null||v===undefined||v==="")return null;
  if(Array.isArray(v)){
    const values=v.map(x=>typeof x==="string"?x:typeof x?.name==="string"?x.name:null).filter(Boolean);
    return values.length?values.join(", "):null;
  }
  if(typeof v==="number"&&Number.isFinite(v))return String(v);
  if(typeof v!=="string")return null;
  const value=v.trim().replace(/\s+/g," ");
  return value&&value.toLowerCase()!=="null"?value:null;
}
function escapeXml(s:string):string {
  return s.replace(/[\u0000-\u001f\u007f]/g," ").replace(/&/g,"&amp;")
    .replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
function cap(s:string,length:number):string {
  const chars=Array.from(s);return chars.length>length?chars.slice(0,length-1).join("")+"…":s;
}
function wrap(value:string|null,maxPerLine:number,lines=2):string[] {
  if(!value)return [];
  const words=value.split(/\s+/);const result:string[]=[];let line="";
  for(const word of words){
    const candidate=line?line+" "+word:word;
    if(Array.from(candidate).length>maxPerLine&&line){result.push(line);line=word;}
    else line=candidate;
  }
  if(line)result.push(line);
  if(result.length>lines){
    result.splice(lines);
    result[lines-1]=cap(result[lines-1],Math.max(3,maxPerLine-2)).replace(/[.,; ]+$/,"")+"…";
  }
  return result.map(x=>cap(x,maxPerLine));
}
function text(x:number,y:number,value:string,size=28,weight=400,fill="#253533",extra=""){
  return '<text x="'+x+'" y="'+y+'" font-family="DejaVu Sans, Arial, sans-serif" font-size="'+size+
    '" font-weight="'+weight+'" fill="'+fill+'" '+extra+'>'+escapeXml(value)+'</text>';
}
function multiline(x:number,y:number,value:string|null,max:number,lines=2,size=26,weight=500,color="#253533"){
  return wrap(value,max,lines).map((v,i)=>text(x,y+i*(size+10),v,size,weight,color)).join("");
}
function record(x:number,y:number,label:string,value:unknown,opts:{max?:number;wide?:boolean}={}){
  const val=present(value);if(!val)return "";
  const max=opts.max??(opts.wide?53:26);
  return text(x,y,label.toUpperCase(),18,750,"#648078",'letter-spacing="1.6"')+
    multiline(x,y+37,val,max,opts.wide?2:1,27,520);
}
function label(x:number,y:number,name:string){
  return text(x,y,name.toUpperCase(),21,800,"#1E6257",'letter-spacing="3.3"');
}
function divider(y:number){return '<line x1="68" y1="'+y+'" x2="1132" y2="'+y+'" stroke="#D9E5DF" stroke-width="2"/>';}
function tidyName(s:unknown):string{return cap(present(s)||"Matrimonial Profile",35);}

export function biodataSvg(profile:Profile):string {
  const fullName=tidyName(get(profile,"candidate.full_name"));
  const age=present(get(profile,"candidate.age_years"));
  const height=present(get(profile,"candidate.height_cm"));
  const city=present(get(profile,"candidate.current_location.city"));
  const summary=[age?age+" years":null,height?height+" cm":null,city].filter(Boolean).join("   ·   ");
  const currentStatus=present(get(profile,"candidate.marital_status"));
  const ancestral=present(get(profile,"candidate.ancestral_location.city_or_town"));
  const qualification=present(get(profile,"candidate.education.highest_qualification"));
  const work=present(get(profile,"candidate.occupation.profession_or_role"));
  const languages=present(get(profile,"candidate.languages"));
  const about=present(get(profile,"candidate.personal_introduction"))||
    present(get(profile,"candidate.education.two_sentence_description"));
  const looking=get(profile,"registration.looking_for")==="groom"?"Groom":
    get(profile,"registration.looking_for")==="bride"?"Bride":null;
  const preferences=[
    present(get(profile,"partner_preferences.preferred_age_range"))&&("Age "+present(get(profile,"partner_preferences.preferred_age_range"))),
    present(get(profile,"partner_preferences.preferred_cities_or_regions")),
    present(get(profile,"partner_preferences.education_preference"))
  ].filter(Boolean).join(" · ");
  const initials=(fullName.split(/\s+/).slice(0,2).map(s=>s[0]||"").join("")||"ABC").toUpperCase();
  const tile='<rect x="68" y="55" width="72" height="72" rx="18" fill="#1E6257"/>'+
    text(84,102,"ABC",22,850,"#FFFFFF");
  let out='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">';
  out+='<rect width="1200" height="1800" fill="#FCFCFA"/>';
  out+='<rect width="1200" height="15" fill="#1E6257"/>';
  out+=tile+text(160,86,"ABBASI BAHISHTI",24,800,"#263A35",'letter-spacing="1.6"');
  out+=text(160,117,"CONNECTIONS",17,500,"#6B827B",'letter-spacing="4.2"');
  out+=text(1132,96,"BIODATA",20,750,"#1E6257",'text-anchor="end" letter-spacing="3"');
  out+=divider(164);
  const nameSize=fullName.length>25?46:fullName.length>19?51:58;
  out+=text(68,258,fullName,nameSize,800,"#1A2D2A");
  out+=text(68,312,summary||"Matrimonial Profile",25,500,"#60736D");
  // Photo is composite-added after SVG rendering. For missing images, show initials.
  out+='<rect x="867" y="205" width="265" height="295" rx="22" fill="#E5F0EC"/>';
  out+=text(999,373,initials,75,800,"#72958B",'text-anchor="middle"');
  out+=label(68,426,"Personal details");
  out+=divider(445);
  out+=record(68,495,"Age",age?age+" years":null);
  out+=record(390,495,"Height",height?height+" cm":null);
  out+=record(68,590,"Current city",city);
  out+=record(390,590,"Ancestral town",ancestral);
  out+=record(68,685,"Marital status",currentStatus);
  out+=record(390,685,"Languages",languages);
  out+=record(68,780,"Education",qualification,{wide:true,max:42});
  out+=record(68,875,"Occupation / activity",work,{wide:true,max:42});
  out+=label(68,1001,"Family");
  out+=divider(1021);
  const dadName=get(profile,"family.father.name");
  const dadJob=get(profile,"family.father.profession");
  const dadEdu=get(profile,"family.father.education");
  const mumName=get(profile,"family.mother.name");
  const mumJob=get(profile,"family.mother.profession");
  const mumEdu=get(profile,"family.mother.education");
  out+=record(68,1075,"Father",dadName);
  out+=record(607,1075,"Mother",mumName);
  out+=record(68,1169,"Father's work",dadJob);
  out+=record(607,1169,"Mother's work",mumJob);
  out+=record(68,1263,"Father's education",dadEdu);
  out+=record(607,1263,"Mother's education",mumEdu);
  const brothers=get(profile,"family.siblings.brothers_count");
  const sisters=get(profile,"family.siblings.sisters_count");
  out+=record(68,1362,"Brothers",brothers);
  out+=record(607,1362,"Sisters",sisters);
  // A short description is prioritized; partner preferences are kept compact.
  if(about){
    out+=label(68,1465,"A little about me");
    out+=multiline(68,1512,about,79,2,24,500,"#334640");
  }
  const prefY=about?1587:1480;
  if(looking||preferences){
    out+=text(68,prefY,"LOOKING FOR",18,750,"#648078",'letter-spacing="1.8"');
    out+=multiline(68,prefY+38,[looking,preferences].filter(Boolean).join("  ·  "),85,2,23,520);
  }
  out+=divider(1690);
  out+=text(68,1739,"ABC",30,850,"#1E6257");
  out+=text(139,1738,"Abbasi Bahishti Connections",22,600,"#4A625A");
  out+=text(1132,1738,"Prepared for sharing",17,430,"#738880",'text-anchor="end"');
  out+="</svg>";
  return out;
}

export async function renderBiodataJpeg(profile:Profile,photoData:string|null):Promise<Buffer>{
  const svg=Buffer.from(biodataSvg(profile));
  // The SVG is generated entirely from escaped text, never from user HTML.
  let base=sharp(svg,{density:72});
  if(photoData&&/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(photoData)){
    const raw=Buffer.from(photoData.slice(photoData.indexOf(",")+1),"base64");
    if(raw.length<=1_000_000&&raw.length>50){
      try{
        const mask=Buffer.from('<svg width="265" height="295"><rect width="265" height="295" rx="22" fill="white"/></svg>');
        const img=await sharp(raw,{limitInputPixels:12_000_000}).rotate()
          .resize(265,295,{fit:"cover",position:"centre"})
          .composite([{input:mask,blend:"dest-in"}]).png().toBuffer();
        base=base.composite([{input:img,left:867,top:205}]);
      }catch{/* Invalid older photo records fall back to the initials. */}
    }
  }
  return base.jpeg({quality:91,mozjpeg:true}).toBuffer();
}
