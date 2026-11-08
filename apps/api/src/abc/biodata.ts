import sharp from "sharp";

/**
 * ABC WhatsApp biodata, portrait 4:5. The client and live tests depend on these dimensions.
 * All private candidate data is escaped before it reaches SVG.
 */
export const BIODATA_WIDTH = 1080;
export const BIODATA_HEIGHT = 1350;
type Profile = Record<string, any>;

const INK="#22342F";
const MUTED="#63746E";
const TEAL="#1E6257";
const LIGHT="#E8F2ED";
const PAGE="#FDFDFA";
const LEFT=54;
const RIGHT=1026;

function at(obj:Profile,path:string):unknown {
  return path.split(".").reduce((x:any,key)=>x&&typeof x==="object"?x[key]:undefined,obj);
}
function value(raw:unknown):string|null {
  if(raw===null||raw===undefined||raw==="")return null;
  if(typeof raw==="number"&&Number.isFinite(raw))return String(raw);
  if(Array.isArray(raw)){
    const items=raw.map(x=>typeof x==="string"?x:(x&&typeof x==="object"&&typeof x.name==="string"?x.name:null)).filter(Boolean);
    return items.length?items.join(", "):null;
  }
  if(typeof raw!=="string")return null;
  const s=raw.replace(/\s+/g," ").trim();
  return s&&s.toLowerCase()!=="null"?s:null;
}
function xml(input:string):string {
  return input.replace(/[\u0000-\u001f\u007f]/g," ")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
function ellipsis(s:string,max:number):string {
  const chars=Array.from(s);
  return chars.length>max?chars.slice(0,max-1).join("").trimEnd()+"…":s;
}
function wrap(s:string|null,max:number,maxLines=2):string[] {
  if(!s)return [];
  const words=s.split(/\s+/),lines:string[]=[];
  let line="";
  for(const word of words){
    const trial=line?line+" "+word:word;
    if(Array.from(trial).length>max&&line){lines.push(line);line=word;}
    else line=trial;
  }
  if(line)lines.push(line);
  const shown=lines.slice(0,maxLines).map(x=>ellipsis(x,max));
  if(lines.length>maxLines&&shown.length)shown[shown.length-1]=ellipsis(shown[shown.length-1],max-1).replace(/…?$/,"")+"…";
  return shown;
}
function txt(x:number,y:number,s:string,size=24,weight=500,color=INK,extra=""):string {
  return '<text x="'+x+'" y="'+y+'" font-family="DejaVu Sans, Arial, sans-serif" font-size="'+size+
    '" font-weight="'+weight+'" fill="'+color+'" '+extra+'>'+xml(s)+'</text>';
}
function lines(x:number,y:number,s:string|null,chars:number,count=1,size=26,weight=620,color=INK,leading=32):string {
  return wrap(s,chars,count).map((line,i)=>txt(x,y+i*leading,line,size,weight,color)).join("");
}
function field(x:number,y:number,label:string,data:unknown,maxChars=26):string {
  const v=value(data);
  if(!v)return "";
  return txt(x,y,label,18,650,MUTED)+lines(x,y+34,v,maxChars,1,27,700,INK);
}
function section(x:number,y:number,title:string):string {
  return txt(x,y,title,21,800,TEAL);
}
function safeName(raw:unknown):string {
  return value(raw)||"Matrimonial Bio Data";
}
function optionalPrefs(profile:Profile):string|null {
  const parts=[
    value(at(profile,"partner_preferences.preferred_age_range")),
    value(at(profile,"partner_preferences.preferred_cities_or_regions")),
    value(at(profile,"partner_preferences.education_preference")),
    value(at(profile,"partner_preferences.profession_preference")),
    value(at(profile,"partner_preferences.other_preferences"))
  ].filter((x):x is string=>Boolean(x));
  return parts.length?parts.join(" · "):null;
}

export function biodataSvg(profile:Profile):string {
  const name=safeName(at(profile,"candidate.full_name"));
  const age=value(at(profile,"candidate.age_years"));
  const height=value(at(profile,"candidate.height_cm"));
  const city=value(at(profile,"candidate.current_location.city"));
  const marital=value(at(profile,"candidate.marital_status"));
  const ancestral=value(at(profile,"candidate.ancestral_location.city_or_town"));
  const education=value(at(profile,"candidate.education.highest_qualification"));
  const work=value(at(profile,"candidate.occupation.profession_or_role"));
  const languages=value(at(profile,"candidate.languages"));

  const father=value(at(profile,"family.father.name"));
  const fatherWork=value(at(profile,"family.father.profession"));
  const fatherEducation=value(at(profile,"family.father.education"));
  const mother=value(at(profile,"family.mother.name"));
  const motherWork=value(at(profile,"family.mother.profession"));
  const motherEducation=value(at(profile,"family.mother.education"));
  const brothers=at(profile,"family.siblings.brothers_count");
  const sisters=at(profile,"family.siblings.sisters_count");
  const about=value(at(profile,"candidate.personal_introduction"))||
    value(at(profile,"candidate.education.two_sentence_description"));
  const preferences=optionalPrefs(profile);
  const initials=name.split(/\s+/).slice(0,2).map(n=>n[0]||"").join("").toUpperCase();

  let svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+BIODATA_WIDTH+
    '" height="'+BIODATA_HEIGHT+'" viewBox="0 0 '+BIODATA_WIDTH+' '+BIODATA_HEIGHT+'">';
  svg+='<rect width="1080" height="1350" fill="'+PAGE+'"/>';
  svg+='<rect width="1080" height="8" fill="'+TEAL+'"/>';
  svg+=txt(LEFT,59,"Abbasi Bahishti Connections",28,800,INK);
  svg+=txt(RIGHT,59,"BIO DATA",22,800,TEAL,'text-anchor="end" letter-spacing="1.8"');
  svg+='<line x1="54" y1="86" x2="1026" y2="86" stroke="#DBE6E0" stroke-width="2"/>';

  // Name and personal facts are intentionally prominent at WhatsApp preview size.
  const nameLines=wrap(name,25,2);
  const nameSize=name.length>33?42:50;
  svg+=nameLines.map((part,i)=>txt(LEFT,165+i*55,part,nameSize,800,INK)).join("");
  svg+=field(LEFT,268,"Age / Umar",age?age+" years":null,20);
  svg+=field(390,268,"Height / Qad",height?height+" cm":null,20);
  svg+=field(LEFT,348,"City / Shehar",city,26);
  svg+=field(390,348,"Marital status / Shaadi ki haalat",marital,23);

  // Original profile photo is placed here in the final JPEG.
  svg+='<rect x="824" y="125" width="202" height="248" rx="16" fill="'+LIGHT+'"/>';
  svg+=txt(925,266,ellipsis(initials||"A",3),63,800,"#87A79B",'text-anchor="middle"');

  svg+=section(LEFT,445,"PERSONAL / ZAATI MALUMAT");
  svg+=field(LEFT,493,"Education / Taleem",education,31);
  svg+=field(550,493,"Work / Kaam",work,27);
  svg+=field(LEFT,584,"Ancestral place / Aabai shehar",ancestral,31);
  svg+=field(550,584,"Languages / Zubanein",languages,27);

  const hasFamily=[father,fatherWork,fatherEducation,mother,motherWork,motherEducation,
    value(brothers),value(sisters)].some(Boolean);
  if(hasFamily){
    svg+=section(LEFT,689,"FAMILY / KHANDAAN");
    svg+=field(LEFT,738,"Father / Walid",father,28);
    svg+=field(550,738,"Mother / Walida",mother,28);
    svg+=field(LEFT,825,"Father's work / Walid ka kaam",fatherWork,28);
    svg+=field(550,825,"Mother's work / Walida ka kaam",motherWork,28);
    svg+=field(LEFT,912,"Father's education / Walid ki taleem",fatherEducation,28);
    svg+=field(550,912,"Mother's education / Walida ki taleem",motherEducation,28);
    svg+=field(LEFT,999,"Brothers / Bhai",brothers,15);
    svg+=field(550,999,"Sisters / Behnein",sisters,15);
  }

  // The short description is intentionally more prominent than match preferences.
  if(about){
    svg+=section(LEFT,1093,"ABOUT / MERE BAARE MEIN");
    svg+=lines(LEFT,1133,about,76,2,23,530,INK,29);
  }
  // A generic bride/groom selection is never useful on a biodata. Only
  // user-entered preferences qualify for this optional one-line block.
  if(preferences){
    const y=about?1208:1100;
    svg+=section(LEFT,y,"PREFERENCES / PASAND");
    svg+=lines(LEFT,y+35,preferences,77,1,22,540,INK,29);
  }

  svg+='<line x1="54" y1="1288" x2="1026" y2="1288" stroke="#DBE6E0" stroke-width="2"/>';
  svg+=txt(LEFT,1321,"Prepared by ABC Abbasi Bahishti Connections",19,650,TEAL);
  svg+="</svg>";
  return svg;
}

export async function renderBiodataJpeg(profile:Profile,photoData:string|null):Promise<Buffer>{
  const svg=Buffer.from(biodataSvg(profile));
  let base=sharp(svg,{density:72});
  if(photoData&&/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(photoData)){
    const raw=Buffer.from(photoData.slice(photoData.indexOf(",")+1),"base64");
    if(raw.length<=1_000_000&&raw.length>50){
      try{
        const mask=Buffer.from('<svg width="202" height="248"><rect width="202" height="248" rx="16" fill="white"/></svg>');
        const photo=await sharp(raw,{limitInputPixels:12_000_000}).rotate()
          .resize(202,248,{fit:"cover",position:"centre"})
          .composite([{input:mask,blend:"dest-in"}]).png().toBuffer();
        base=base.composite([{input:photo,left:824,top:125}]);
      }catch{/* Older or corrupt optional photos fall back to a blank initials portrait. */}
    }
  }
  return base.jpeg({quality:92,mozjpeg:true}).toBuffer();
}
