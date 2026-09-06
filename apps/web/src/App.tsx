import { FormEvent, useEffect, useMemo, useState } from "react";

type Member = {
  id: string;
  displayName: string;
  username: string;
  age?: number | null;
  gender?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  occupation?: string;
  education?: string;
  about?: string;
  maritalStatus?: string | null;
  heightCm?: number | null;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  languages?: string;
  interests?: string;
  contactVerified?: boolean;
  aadhaarVerified?: boolean;
  isDirectoryVisible?: boolean;
  role?: string;
};

type Module = "home" | "rishte" | "family" | "community" | "messages" | "settings";
const TOKEN_KEY = "abbasiconnect_token";
const API_URL = import.meta.env.VITE_API_URL ?? "/api";

async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function fmt(value?: string | null) {
  if (!value) return "Not specified";
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function MemberLine({ member }: { member: Member }) {
  return <div className="member-line"><strong>{member.displayName}</strong><span>@{member.username}</span><small>{[member.age ? `${member.age} yrs` : "", member.occupation, member.city].filter(Boolean).join(" · ")}</small></div>;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<Member | null>(null);
  const [module, setModule] = useState<Module>("home");
  const [entry, setEntry] = useState<"home" | "signin" | "register">("home");
  const [error, setError] = useState("");
  const [login, setLogin] = useState({ username: "", password: "" });
  const [register, setRegister] = useState({ displayName: "", username: "", password: "", contact: "", otp: "", dateOfBirth: "", gender: "", city: "", state: "", country: "India" });
  const [challenge, setChallenge] = useState<{ id: string; developmentCode?: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return setLoading(false);
    api("/auth/session")
      .then((data) => {
        if (data.mode === "admin") window.location.replace("/admin");
        else setMember(data.user);
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      const data = await api("/auth/sign-in", { method: "POST", body: JSON.stringify({ username: login.username.toLowerCase(), password: login.password }) });
      localStorage.setItem(TOKEN_KEY, data.token);
      if (data.mode === "admin") return window.location.assign("/admin");
      setMember(data.user); setModule("home");
    } catch (e) { setError(e instanceof Error ? e.message : "Sign in failed"); }
  }

  async function requestOtp() {
    setError("");
    try {
      const data = await api("/auth/request-otp", { method: "POST", body: JSON.stringify({ contact: register.contact }) });
      setChallenge({ id: data.challengeId, developmentCode: data.developmentCode });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not request OTP"); }
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!challenge) return setError("Request an OTP first");
    try {
      const data = await api("/auth/register", { method: "POST", body: JSON.stringify({
        challengeId: challenge.id, otp: register.otp, contact: register.contact, displayName: register.displayName,
        username: register.username.toLowerCase(), password: register.password, dateOfBirth: register.dateOfBirth || undefined,
        gender: register.gender || undefined, city: register.city || undefined, state: register.state || undefined, country: register.country,
      }) });
      localStorage.setItem(TOKEN_KEY, data.token); setMember(data.user); setModule("home");
    } catch (e) { setError(e instanceof Error ? e.message : "Registration failed"); }
  }

  function logout() { localStorage.removeItem(TOKEN_KEY); setMember(null); setModule("home"); setEntry("home"); }

  if (loading) return <main className="center-screen">Opening AbbasiConnect…</main>;

  if (!member) return <main className="auth-shell"><section className="auth-card">
    <div className="wordmark">ABBASI CONNECT</div>
    <h1>One community. Connected families.</h1>
    <p className="lede">Family trees, Rishte, community posts and private messages. Text only. No profile photographs.</p>
    {entry === "home" && <div className="entry-grid"><button className="entry-choice" onClick={() => setEntry("register")}><strong>Create account</strong><span>Join with a phone number or email</span></button><button className="entry-choice secondary" onClick={() => setEntry("signin")}><strong>Sign in</strong><span>Members and administrators use the same login</span></button></div>}
    {entry === "signin" && <form className="stack" onSubmit={signIn}><h2>Sign in</h2><label>Username<input value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} required /></label><label>Password<input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} required /></label>{error && <p className="error">{error}</p>}<div className="button-row"><button type="button" className="ghost" onClick={() => setEntry("home")}>Back</button><button>Sign in</button></div></form>}
    {entry === "register" && <form className="stack" onSubmit={createAccount}><h2>Create your account</h2><div className="form-grid two"><label>Name<input value={register.displayName} onChange={(e) => setRegister({ ...register, displayName: e.target.value })} required /></label><label>Username<input value={register.username} onChange={(e) => setRegister({ ...register, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })} minLength={3} required /></label><label>Phone or email<input value={register.contact} onChange={(e) => setRegister({ ...register, contact: e.target.value })} placeholder="+91… or name@example.com" required /></label><label>Password<input type="password" minLength={8} value={register.password} onChange={(e) => setRegister({ ...register, password: e.target.value })} required /></label><label>Date of birth, optional<input type="date" value={register.dateOfBirth} onChange={(e) => setRegister({ ...register, dateOfBirth: e.target.value })} /></label><label>Gender, optional<select value={register.gender} onChange={(e) => setRegister({ ...register, gender: e.target.value })}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label><label>City<input value={register.city} onChange={(e) => setRegister({ ...register, city: e.target.value })} /></label><label>State<input value={register.state} onChange={(e) => setRegister({ ...register, state: e.target.value })} /></label></div><div className="otp-row"><button type="button" className="secondary" onClick={requestOtp}>Request OTP</button>{challenge?.developmentCode && <div className="dev-code"><span>Development OTP</span><strong>{challenge.developmentCode}</strong></div>}<label>OTP<input inputMode="numeric" maxLength={6} value={register.otp} onChange={(e) => setRegister({ ...register, otp: e.target.value.replace(/\D/g, "").slice(0, 6) })} required /></label></div><p className="fine-print">WhatsApp/SMS is not connected yet. Development mode displays the OTP here. Aadhaar is optional and can be linked later.</p>{error && <p className="error">{error}</p>}<div className="button-row"><button type="button" className="ghost" onClick={() => setEntry("home")}>Back</button><button>Create account</button></div></form>}
  </section></main>;

  return <main className="app-shell">
    <header className="topbar"><button className="brand-button" onClick={() => setModule("home")}>AbbasiConnect</button><div className="top-member"><span>{member.displayName}</span><small>@{member.username}</small></div><button className="ghost" onClick={() => setModule("settings")}>Account</button><button className="ghost" onClick={logout}>Log out</button></header>
    {module === "home" ? <Home member={member} open={setModule} /> : <div className="page-wrap"><button className="back-link" onClick={() => setModule("home")}>← All services</button>{module === "rishte" && <Rishte me={member} />}{module === "family" && <Family me={member} />}{module === "community" && <Community me={member} />}{module === "messages" && <Messages me={member} />}{module === "settings" && <Settings member={member} setMember={setMember} />}</div>}
  </main>;
}

function Home({ member, open }: { member: Member; open: (module: Module) => void }) {
  return <div className="home-wrap"><section className="home-intro"><div><p className="eyebrow">WELCOME, {member.displayName.toUpperCase()}</p><h1>Your community, in one place.</h1><p>Start with your family. Everything else grows from verified people and relationships.</p></div><div className="identity-strip"><span className={member.contactVerified ? "ok-dot" : "dot"}></span><div><strong>Contact verified</strong><small>Aadhaar remains optional</small></div></div></section><section className="module-grid"><button className="module-card" onClick={() => open("rishte")}><span className="module-number">01</span><h2>Rishte</h2><p>Opt in to a clean, text-only list of eligible community members.</p><b>Open Rishte →</b></button><button className="module-card" onClick={() => open("family")}><span className="module-number">02</span><h2>Family Tree</h2><p>Build your family graph, connect relatives by code and control who can view it.</p><b>Open Family Tree →</b></button><button className="module-card" onClick={() => open("community")}><span className="module-number">03</span><h2>Community</h2><p>Share text updates and announcements with the wider community.</p><b>Open Community →</b></button><button className="module-card" onClick={() => open("messages")}><span className="module-number">04</span><h2>Messages</h2><p>Private one-to-one conversations between registered members.</p><b>Open Messages →</b></button></section></div>;
}

function Rishte({ me }: { me: Member }) {
  const [profiles, setProfiles] = useState<any[]>([]); const [mine, setMine] = useState<any>(null); const [interests, setInterests] = useState<any>({ received: [], sent: [] }); const [error, setError] = useState(""); const [filter, setFilter] = useState({ q: "", city: "", gender: "" });
  const [edit, setEdit] = useState({ isActive: false, headline: "", bio: "", familyNote: "", lookingFor: "" });
  async function load() { try { const params = new URLSearchParams(); Object.entries(filter).forEach(([k, v]) => v && params.set(k, v)); const [a,b,c] = await Promise.all([api(`/rishte${params.toString() ? `?${params}` : ""}`), api("/rishte/me"), api("/rishte/interests")]); setProfiles(a.profiles); setMine(b.profile); setEdit(b.profile ? { isActive: b.profile.isActive, headline: b.profile.headline, bio: b.profile.bio, familyNote: b.profile.familyNote, lookingFor: b.profile.lookingFor } : edit); setInterests(c); } catch(e){setError(e instanceof Error?e.message:"Could not load Rishte");} }
  useEffect(() => { load(); }, []);
  async function save(event: FormEvent) { event.preventDefault(); await api("/rishte/me", { method: "PUT", body: JSON.stringify(edit) }); await load(); }
  async function send(profile: any) { const message = window.prompt("Optional note", "") ?? ""; await api(`/rishte/${profile.id}/interest`, { method: "POST", body: JSON.stringify({ message }) }); await load(); }
  async function act(id: string, action: string) { await api(`/rishte/interests/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }); await load(); }
  return <section><div className="page-heading"><div><p className="eyebrow">RISHTE</p><h1>Eligible members</h1><p>Only people who explicitly opt in appear here. No images are used.</p></div></div>{error && <p className="error">{error}</p>}<div className="split-layout"><div><form className="filters" onSubmit={(e) => { e.preventDefault(); load(); }}><input placeholder="Name, education, occupation" value={filter.q} onChange={(e)=>setFilter({...filter,q:e.target.value})}/><input placeholder="City" value={filter.city} onChange={(e)=>setFilter({...filter,city:e.target.value})}/><select value={filter.gender} onChange={(e)=>setFilter({...filter,gender:e.target.value})}><option value="">Any gender</option><option>Male</option><option>Female</option><option>Other</option></select><button>Search</button></form><div className="card-list">{profiles.map((p) => <article className="plain-card" key={p.id}><div className="card-head"><MemberLine member={p}/><span className="verify-chip">{p.contactVerified ? "Verified contact" : "Member"}</span></div><h3>{p.rishte.headline || "Rishte profile"}</h3><p>{p.rishte.bio || p.about || "No introduction yet."}</p>{p.rishte.familyNote && <p><strong>Family</strong> {p.rishte.familyNote}</p>}{p.rishte.lookingFor && <p><strong>Looking for</strong> {p.rishte.lookingFor}</p>}<div className="button-row">{p.relationship?.status === "NONE" && <button onClick={() => send(p)}>Send interest</button>}{p.relationship?.status !== "NONE" && <span className="status-pill">{fmt(p.relationship.status)}</span>}<button className="ghost" onClick={() => api(`/messages/threads/${p.id}`, { method: "POST" }).then((d)=>window.alert(`Message thread ready: ${d.thread.id}`))}>Message</button></div></article>)}{!profiles.length && <div className="empty-state">No Rishte profiles match these filters.</div>}</div></div><aside className="side-panel"><h2>Your Rishte listing</h2><form className="stack" onSubmit={save}><label className="toggle-row"><input type="checkbox" checked={edit.isActive} onChange={(e)=>setEdit({...edit,isActive:e.target.checked})}/>List me in Rishte</label><label>Headline<input value={edit.headline} onChange={(e)=>setEdit({...edit,headline:e.target.value})}/></label><label>About<textarea rows={4} value={edit.bio} onChange={(e)=>setEdit({...edit,bio:e.target.value})}/></label><label>Family note<textarea rows={3} value={edit.familyNote} onChange={(e)=>setEdit({...edit,familyNote:e.target.value})}/></label><label>Looking for<textarea rows={3} value={edit.lookingFor} onChange={(e)=>setEdit({...edit,lookingFor:e.target.value})}/></label><button>Save Rishte profile</button></form><hr/><h3>Incoming interests</h3>{interests.received.map((i:any)=><div className="request-row" key={i.id}><MemberLine member={i.member}/><span>{fmt(i.status)}</span>{i.status==="PENDING"&&<div className="button-row"><button onClick={()=>act(i.id,"ACCEPT")}>Accept</button><button className="ghost" onClick={()=>act(i.id,"DECLINE")}>Decline</button></div>}</div>)}{!interests.received.length&&<p className="muted">None yet.</p>}</aside></div></section>;
}

function Family({ me }: { me: Member }) {
  const [data, setData] = useState<any>({ links: [], incomingAccess: [], outgoingAccess: [] }); const [directory, setDirectory] = useState<Member[]>([]); const [tree, setTree] = useState<any>(null); const [search, setSearch] = useState(""); const [error, setError] = useState(""); const [relative, setRelative] = useState({ relativeName: "", relation: "SIBLING", relationLabel: "" }); const [claim, setClaim] = useState("");
  async function load() { try { const [family, members] = await Promise.all([api("/family/me"), api(`/directory${search ? `?q=${encodeURIComponent(search)}` : ""}`)]); setData(family); setDirectory(members.members); } catch(e){setError(e instanceof Error?e.message:"Could not load family");} }
  useEffect(()=>{ load(); viewTree(me.id); },[]);
  async function addRelative(e:FormEvent){e.preventDefault(); const r=await api("/family/members",{method:"POST",body:JSON.stringify(relative)}); setRelative({relativeName:"",relation:"SIBLING",relationLabel:""}); await load(); window.alert(`Family code: ${r.link.inviteCode}`);}
  async function claimCode(e:FormEvent){e.preventDefault(); await api("/family/claim",{method:"POST",body:JSON.stringify({code:claim})});setClaim("");await load();await viewTree(me.id);}
  async function requestAccess(id:string){await api(`/family/access/${id}`,{method:"POST"});await load();}
  async function actAccess(id:string,action:string){await api(`/family/access/${id}`,{method:"PATCH",body:JSON.stringify({action})});await load();}
  async function viewTree(id:string){try{setTree(await api(`/family/tree/${id}`));}catch(e){setError(e instanceof Error?e.message:"Tree unavailable");}}
  return <section><div className="page-heading"><div><p className="eyebrow">FAMILY TREE</p><h1>Build the family graph</h1><p>Add relatives before or after they register. Verified connections become shared family links.</p></div><button onClick={()=>viewTree(me.id)}>View my tree</button></div>{error&&<p className="error">{error}</p>}<div className="family-layout"><div><section className="panel"><h2>Your family links</h2><div className="family-links">{data.links.map((l:any)=><article className="family-link" key={l.id}><div><strong>{l.owner.id===me.id?l.relativeName:l.owner.displayName}</strong><span>{fmt(l.relationLabel||l.relation)} · {fmt(l.status)}</span></div>{l.status==="INVITED"&&<code>{l.inviteCode}</code>}</article>)}{!data.links.length&&<p className="muted">No family links yet.</p>}</div><form className="inline-form" onSubmit={addRelative}><input placeholder="Relative's name" value={relative.relativeName} onChange={(e)=>setRelative({...relative,relativeName:e.target.value})} required/><select value={relative.relation} onChange={(e)=>setRelative({...relative,relation:e.target.value})}><option value="PARENT">Parent</option><option value="CHILD">Child</option><option value="SIBLING">Sibling</option><option value="SPOUSE">Spouse</option><option value="OTHER">Other</option></select><input placeholder="Label, e.g. Brother" value={relative.relationLabel} onChange={(e)=>setRelative({...relative,relationLabel:e.target.value})}/><button>Add</button></form><form className="inline-form compact" onSubmit={claimCode}><input placeholder="Enter family code" value={claim} onChange={(e)=>setClaim(e.target.value.toUpperCase())}/><button>Connect my account</button></form></section><section className="panel tree-panel"><div className="card-head"><h2>Tree viewer</h2>{tree&&<span>{tree.nodes.length} people</span>}</div>{tree?<><div className="tree-nodes">{tree.nodes.map((n:any)=><div className={n.registered?"tree-node":"tree-node guest"} key={n.id}><strong>{n.displayName}</strong><small>{n.registered?`@${n.username}`:"Not registered"}</small></div>)}</div><div className="edge-list">{tree.edges.map((e:any)=><div key={e.id}><span>{tree.nodes.find((n:any)=>n.id===e.from)?.displayName}</span><b>— {fmt(e.relationLabel||e.relation)} →</b><span>{tree.nodes.find((n:any)=>n.id===e.to)?.displayName}</span></div>)}</div></>:<p className="muted">Choose a tree to view.</p>}</section></div><aside className="side-panel"><h2>Find a family</h2><form className="search-row" onSubmit={(e)=>{e.preventDefault();load();}}><input placeholder="Search members" value={search} onChange={(e)=>setSearch(e.target.value)}/><button>Search</button></form>{directory.slice(0,20).map((m)=><div className="request-row" key={m.id}><MemberLine member={m}/><div className="button-row"><button className="ghost" onClick={()=>requestAccess(m.id)}>Request tree</button>{data.outgoingAccess.find((a:any)=>a.member.id===m.id)?.status==="APPROVED"&&<button onClick={()=>viewTree(m.id)}>View</button>}</div></div>)}<hr/><h3>Tree access requests</h3>{data.incomingAccess.map((a:any)=><div className="request-row" key={a.id}><MemberLine member={a.member}/><span>{fmt(a.status)}</span>{a.status==="PENDING"&&<div className="button-row"><button onClick={()=>actAccess(a.id,"APPROVE")}>Approve</button><button className="ghost" onClick={()=>actAccess(a.id,"DECLINE")}>Decline</button></div>}</div>)}{!data.incomingAccess.length&&<p className="muted">No pending requests.</p>}</aside></div></section>;
}

function Community({ me }: { me: Member }) {
  const [posts,setPosts]=useState<any[]>([]);const [body,setBody]=useState("");const [error,setError]=useState("");
  async function load(){try{setPosts((await api("/community/posts")).posts);}catch(e){setError(e instanceof Error?e.message:"Could not load community");}}
  useEffect(()=>{load();},[]);
  async function publish(e:FormEvent){e.preventDefault();await api("/community/posts",{method:"POST",body:JSON.stringify({body})});setBody("");await load();}
  async function remove(id:string){await api(`/community/posts/${id}`,{method:"DELETE"});await load();}
  return <section className="narrow-page"><div className="page-heading"><div><p className="eyebrow">COMMUNITY</p><h1>Community board</h1><p>Text updates, announcements and discussion. No media uploads.</p></div></div>{error&&<p className="error">{error}</p>}<form className="composer" onSubmit={publish}><textarea rows={4} placeholder="Share something with the community…" value={body} onChange={(e)=>setBody(e.target.value)} maxLength={2500}/><div><small>{body.length}/2500</small><button disabled={!body.trim()}>Post</button></div></form><div className="feed">{posts.map((p:any)=><article className="post" key={p.id}><div className="post-meta"><MemberLine member={p.author}/><time>{new Date(p.createdAt).toLocaleString()}</time></div><p>{p.body}</p>{p.author.id===me.id&&<button className="text-button danger" onClick={()=>remove(p.id)}>Delete</button>}</article>)}</div></section>;
}

function Messages({ me }: { me: Member }) {
  const [threads,setThreads]=useState<any[]>([]);const [active,setActive]=useState<any>(null);const [members,setMembers]=useState<Member[]>([]);const [q,setQ]=useState("");const [text,setText]=useState("");
  async function load(){const [t,d]=await Promise.all([api("/messages/threads"),api(`/directory${q?`?q=${encodeURIComponent(q)}`:""}`)]);setThreads(t.threads);setMembers(d.members);}
  useEffect(()=>{load();},[]);
  async function open(id:string){setActive(await api(`/messages/threads/${id}`));}
  async function start(id:string){const d=await api(`/messages/threads/${id}`,{method:"POST"});await load();await open(d.thread.id);}
  async function send(e:FormEvent){e.preventDefault();if(!active||!text.trim())return;await api(`/messages/threads/${active.id}/messages`,{method:"POST",body:JSON.stringify({body:text})});setText("");await open(active.id);await load();}
  return <section><div className="page-heading"><div><p className="eyebrow">MESSAGES</p><h1>Private conversations</h1></div></div><div className="messages-layout"><aside className="thread-list"><h3>Conversations</h3>{threads.map((t:any)=><button className={active?.id===t.id?"thread active":"thread"} key={t.id} onClick={()=>open(t.id)}><MemberLine member={t.member}/>{t.lastMessage&&<small className="preview">{t.lastMessage.body}</small>}</button>)}<hr/><form className="search-row" onSubmit={(e)=>{e.preventDefault();load();}}><input placeholder="Find member" value={q} onChange={(e)=>setQ(e.target.value)}/><button>Find</button></form>{members.slice(0,8).map((m)=><button className="thread" key={m.id} onClick={()=>start(m.id)}><MemberLine member={m}/><small>Start conversation</small></button>)}</aside><div className="chat-panel">{active?<><div className="chat-head"><MemberLine member={active.member}/></div><div className="chat-log">{active.messages.map((m:any)=><div className={m.senderId===me.id?"bubble mine":"bubble"} key={m.id}><p>{m.body}</p><small>{new Date(m.createdAt).toLocaleString()}</small></div>)}</div><form className="chat-compose" onSubmit={send}><input placeholder="Write a message" value={text} onChange={(e)=>setText(e.target.value)}/><button>Send</button></form></>:<div className="empty-state">Choose a conversation or start a new one.</div>}</div></div></section>;
}

function Settings({ member, setMember }: { member: Member; setMember: (m: Member)=>void }) {
  const [edit,setEdit]=useState({displayName:member.displayName,city:member.city||"",state:member.state||"",country:member.country||"India",gender:member.gender||"",dateOfBirth:member.dateOfBirth||"",education:member.education||"",occupation:member.occupation||"",about:member.about||"",languages:member.languages||"",interests:member.interests||"",isDirectoryVisible:member.isDirectoryVisible!==false});
  const [aadhaar,setAadhaar]=useState({reference:"",name:member.displayName,last4:""});
  async function save(e:FormEvent){e.preventDefault();const m=await api("/auth/me",{method:"PATCH",body:JSON.stringify({...edit,dateOfBirth:edit.dateOfBirth||undefined,gender:edit.gender||undefined,city:edit.city||undefined,state:edit.state||undefined})});setMember(m);window.alert("Profile saved");}
  async function linkAadhaar(e:FormEvent){e.preventDefault();await api("/identity/aadhaar-dev",{method:"POST",body:JSON.stringify({reference:aadhaar.reference,name:aadhaar.name,last4:aadhaar.last4||undefined})});window.alert("Optional Aadhaar development reference linked");}
  return <section className="narrow-page"><div className="page-heading"><div><p className="eyebrow">ACCOUNT</p><h1>Your community profile</h1></div></div><form className="panel stack" onSubmit={save}><div className="form-grid two"><label>Name<input value={edit.displayName} onChange={(e)=>setEdit({...edit,displayName:e.target.value})}/></label><label>Date of birth<input type="date" value={edit.dateOfBirth} onChange={(e)=>setEdit({...edit,dateOfBirth:e.target.value})}/></label><label>Gender<input value={edit.gender} onChange={(e)=>setEdit({...edit,gender:e.target.value})}/></label><label>City<input value={edit.city} onChange={(e)=>setEdit({...edit,city:e.target.value})}/></label><label>State<input value={edit.state} onChange={(e)=>setEdit({...edit,state:e.target.value})}/></label><label>Country<input value={edit.country} onChange={(e)=>setEdit({...edit,country:e.target.value})}/></label><label>Education<input value={edit.education} onChange={(e)=>setEdit({...edit,education:e.target.value})}/></label><label>Occupation<input value={edit.occupation} onChange={(e)=>setEdit({...edit,occupation:e.target.value})}/></label><label>Languages<input value={edit.languages} onChange={(e)=>setEdit({...edit,languages:e.target.value})}/></label><label>Interests<input value={edit.interests} onChange={(e)=>setEdit({...edit,interests:e.target.value})}/></label></div><label>About<textarea rows={5} value={edit.about} onChange={(e)=>setEdit({...edit,about:e.target.value})}/></label><label className="toggle-row"><input type="checkbox" checked={edit.isDirectoryVisible} onChange={(e)=>setEdit({...edit,isDirectoryVisible:e.target.checked})}/>Allow other registered members to find me in the community directory</label><button>Save account</button></form><form className="panel stack" onSubmit={linkAadhaar}><h2>Optional identity link</h2><p className="muted">Aadhaar is not required to use AbbasiConnect. This development adapter stores only a hashed reference and optional last four digits, never an image.</p><label>Development Aadhaar reference<input value={aadhaar.reference} onChange={(e)=>setAadhaar({...aadhaar,reference:e.target.value})}/></label><label>Name on identity<input value={aadhaar.name} onChange={(e)=>setAadhaar({...aadhaar,name:e.target.value})}/></label><label>Last four, optional<input maxLength={4} value={aadhaar.last4} onChange={(e)=>setAadhaar({...aadhaar,last4:e.target.value.replace(/\D/g,"").slice(0,4)})}/></label><button className="secondary">Link optional identity</button></form></section>;
}
