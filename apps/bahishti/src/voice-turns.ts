/**
 * ABC voice turn assembly. GPT-Live emits transcript deltas, not finalized user
 * turns. Never submit an utterance on an event's end_ms or delegation alone.
 * Keep text exactly as received and wait for an actual quiet interval.
 */
export type TranscriptDelta={event_id?:string;delta:string;start_ms?:number;end_ms?:number};
export type VoiceTranscript={text:string;startMs:number;endMs:number;fragments:number};

const QUIET_AFTER_VOICE_MS=2100;
const TRANSCRIPT_SETTLE_MS=1100;
const TRANSCRIPT_ONLY_QUIET_MS=3300;
const MAX_FRAGMENTS=120;

export class VoiceTurnCollector {
  private fragments:{text:string;start:number;end:number}[]=[];
  private seenIds=new Set<string>();
  private lastDeltaAt=0;
  private lastMicAt=0;
  private microphoneSpeaking=false;
  private signalSeen=false;
  private lastCommittedEnd=0;

  add(delta:TranscriptDelta,now:number):boolean {
    if(!delta.delta||typeof delta.delta!=="string")return false;
    if(delta.event_id&&this.seenIds.has(delta.event_id))return false;
    if(delta.event_id){
      this.seenIds.add(delta.event_id);
      if(this.seenIds.size>500)this.seenIds.clear();
    }
    const start=Number.isFinite(delta.start_ms)?Number(delta.start_ms):0;
    const end=Number.isFinite(delta.end_ms)?Number(delta.end_ms):start;
    // Hold text exactly, including intentional spaces and repeated words.
    this.fragments.push({text:delta.delta,start,end});
    if(this.fragments.length>MAX_FRAGMENTS)this.fragments=this.fragments.slice(-MAX_FRAGMENTS);
    this.lastDeltaAt=now;
    return true;
  }
  micActivity(now:number){
    this.lastMicAt=now;
    this.microphoneSpeaking=true;
    this.signalSeen=true;
  }
  micQuiet(){this.microphoneSpeaking=false;}
  hasText():boolean{return this.fragments.some(f=>f.text.trim().length>0);}
  isSpeaking():boolean{return this.microphoneSpeaking;}
  lastTextAt():number{return this.lastDeltaAt;}
  /**
   * Require silence *and* a grace period for late transcript packets. When
   * native audio-level stats are unavailable, use a longer transcript gap.
   */
  ready(now:number,audioMeterAvailable:boolean):boolean{
    if(!this.hasText()||this.microphoneSpeaking)return false;
    if(!this.lastDeltaAt||now-this.lastDeltaAt<TRANSCRIPT_SETTLE_MS)return false;
    if(audioMeterAvailable&&this.signalSeen)
      return now-this.lastMicAt>=QUIET_AFTER_VOICE_MS;
    return now-this.lastDeltaAt>=TRANSCRIPT_ONLY_QUIET_MS;
  }
  commit():VoiceTranscript|null{
    if(!this.hasText())return null;
    const parts=this.fragments;
    this.fragments=[];
    const valid=parts.filter(x=>x.text.length>0);
    this.lastCommittedEnd=Math.max(this.lastCommittedEnd,...valid.map(x=>x.end),0);
    this.lastDeltaAt=0;
    this.microphoneSpeaking=false;
    this.signalSeen=false;
    this.lastMicAt=0;
    return {text:valid.map(x=>x.text).join("").trim(),
      startMs:Math.min(...valid.map(x=>x.start)),endMs:Math.max(...valid.map(x=>x.end)),
      fragments:valid.length};
  }
  latestCommittedEndMs(){return this.lastCommittedEnd;}
  discard(){this.fragments=[];this.lastDeltaAt=0;this.signalSeen=false;this.microphoneSpeaking=false;}
}

/** Stats types vary across Android WebRTC builds. Never assume a level exists. */
export function audioLevels(stats:unknown,previous?:{inEnergy:number;inDuration:number;outEnergy:number;outDuration:number}){
  const rows:Record<string,any>[]=[];
  if(stats&&typeof (stats as any).forEach==="function")
    (stats as any).forEach((value:any)=>{if(value&&typeof value==="object")rows.push(value);});
  else if(Array.isArray(stats))rows.push(...stats.filter(x=>x&&typeof x==="object"));
  else if(stats&&typeof stats==="object")rows.push(...Object.values(stats as object).filter(x=>x&&typeof x==="object") as Record<string,any>[]);
  let mic:number|null=null,speaker:number|null=null;
  let inEnergy=previous?.inEnergy||0,inDuration=previous?.inDuration||0;
  let outEnergy=previous?.outEnergy||0,outDuration=previous?.outDuration||0;
  for(const row of rows){
    const kind=String(row.kind||row.mediaType||"").toLowerCase();
    const type=String(row.type||"").toLowerCase();
    const level=Number(row.audioLevel);
    const hasLevel=Number.isFinite(level)&&level>=0&&level<=1;
    if(type==="media-source"&&kind==="audio"&&hasLevel)
      mic=level;
    // Remote audio tracks can have their own audioLevel. Treating those as
    // microphone input makes ABC falsely interrupt itself while speaking.
    if(type==="inbound-rtp"&&kind==="audio"||type==="inbound-rtp"&&row.isRemote===true){
      const energy=Number(row.totalAudioEnergy),dur=Number(row.totalSamplesDuration);
      if(Number.isFinite(energy)&&Number.isFinite(dur)&&dur>inDuration&&energy>=inEnergy){
        speaker=Math.sqrt(Math.max(0,(energy-inEnergy)/(dur-inDuration)));
        inEnergy=energy;inDuration=dur;
      }
      else if(hasLevel)speaker=level;
    }
    if(type==="outbound-rtp"&&kind==="audio"){
      const energy=Number(row.totalAudioEnergy),dur=Number(row.totalSamplesDuration);
      if(mic===null&&Number.isFinite(energy)&&Number.isFinite(dur)&&dur>outDuration&&energy>=outEnergy)
        mic=Math.sqrt(Math.max(0,(energy-outEnergy)/(dur-outDuration)));
      if(Number.isFinite(energy)&&Number.isFinite(dur)){outEnergy=energy;outDuration=dur;}
    }
  }
  return {mic,speaker,previous:{inEnergy,inDuration,outEnergy,outDuration}};
}

export function humanTimer(seconds:number){return Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");}
