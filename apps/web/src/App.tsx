import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  decryptMessage,
  encryptMessage,
  myPublicKey,
  prepareSecureMessaging,
  secureMessagingUnlocked,
  unlockSecureMessaging,
} from "./e2ee";
import { onRealtime, stopRealtimeConnection, syncRealtimeConnection } from "./realtime";
import Home from "./Home";
import FamilyTree from "./FamilyTree";
import { Avatar, BrandMark, EmptyState, Icon, LoadingState, Notice, PageHeading, PostImage, prepareImage, profileImageUpdated, useAction, type IconName } from "./ui";

export type Member = {
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

export type Module = "home" | "rishte" | "family" | "community" | "messages" | "settings";
const TOKEN_KEY = "abbasiconnect_token";
const API_URL = import.meta.env.VITE_API_URL ?? "/api";
const BASE_URL = import.meta.env.BASE_URL || "/";

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
  return (
    <div className="member-line">
      <Avatar name={member.displayName} id={member.id}/>
      <div className="member-copy"><strong>{member.displayName}</strong>
      <span>@{member.username}</span>
      <small>{[member.age ? `${member.age} yrs` : "", member.occupation, member.city].filter(Boolean).join(" · ")}</small></div>
    </div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<Member | null>(null);
  const [module, setModule] = useState<Module>("home");
  const [entry, setEntry] = useState<"home" | "signin" | "register">("home");
  const [error, setError] = useState("");
  const [login, setLogin] = useState({ username: "", password: "" });
  const [register, setRegister] = useState({
    displayName: "",
    username: "",
    password: "",
    contact: "",
    otp: "",
    dateOfBirth: "",
    gender: "",
    city: "",
    state: "",
    country: "India",
  });
  const [challenge, setChallenge] = useState<{ id: string; developmentCode?: string } | null>(null);
  const { working, perform } = useAction(setError);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.querySelector<HTMLElement>("#main-content h1")?.focus({ preventScroll: true });
  }, [module]);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return setLoading(false);
    api("/auth/session")
      .then((data) => {
        if (data.mode === "admin") window.location.replace(`${BASE_URL}?admin=1`);
        else {
          setMember(data.user);
          syncRealtimeConnection();
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        stopRealtimeConnection();
      })
      .finally(() => setLoading(false));
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("/auth/sign-in", {
        method: "POST",
        body: JSON.stringify({ username: login.username.toLowerCase(), password: login.password }),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      if (data.mode === "admin") return window.location.assign(`${BASE_URL}?admin=1`);
      setMember(data.user);
      setModule("home");
      syncRealtimeConnection();
      prepareSecureMessaging(api, login.password, data.user.id).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    }
  }

  async function requestOtp() {
    setError("");
    if (!register.contact.trim()) return setError("Enter your phone number or email first");
    try {
      const data = await api("/auth/request-otp-dev", {
        method: "POST",
        body: JSON.stringify({ contact: register.contact }),
      });
      setChallenge({ id: data.challengeId, developmentCode: data.developmentCode });
      if (data.developmentCode) setRegister((current) => ({ ...current, otp: data.developmentCode }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not request OTP");
    }
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (register.password.length < 8) return setError("Password must be at least 8 characters");
    if (!/^\d{6}$/.test(register.otp)) return setError("OTP must be the 6-digit code shown above");
    if (!challenge) return setError("Request an OTP first");
    try {
      const data = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          challengeId: challenge.id,
          otp: register.otp,
          contact: register.contact,
          displayName: register.displayName,
          username: register.username.toLowerCase(),
          password: register.password,
          dateOfBirth: register.dateOfBirth || undefined,
          gender: register.gender || undefined,
          city: register.city || undefined,
          state: register.state || undefined,
          country: register.country,
        }),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      setMember(data.user);
      setModule("home");
      syncRealtimeConnection();
      await prepareSecureMessaging(api, register.password, data.user.id).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
    }
  }

  function logout() {
    stopRealtimeConnection();
    localStorage.removeItem(TOKEN_KEY);
    setMember(null);
    setModule("home");
    setEntry("home");
  }

  if (loading) return <main className="center-screen"><BrandMark/><LoadingState label="Opening AbbasiConnect…"/></main>;

  if (!member) {
    return <main className="auth-shell">
      <aside className="auth-story">
        <div className="auth-brand"><BrandMark/><span>AbbasiConnect</span></div>
        <div className="auth-story-content">
          <div className="auth-connection-art" aria-hidden="true"><svg viewBox="0 0 360 210" fill="none"><path d="M60 150V110H180V60M300 150V110H180M180 110v40"/><rect x="153" y="22" width="54" height="54" rx="12"/><rect x="33" y="146" width="54" height="54" rx="12"/><rect x="153" y="146" width="54" height="54" rx="12"/><rect x="273" y="146" width="54" height="54" rx="12"/><circle cx="180" cy="49" r="8"/><circle cx="60" cy="173" r="8"/><circle cx="180" cy="173" r="8"/><circle cx="300" cy="173" r="8"/></svg></div>
          <span className="section-kicker">A shared sense of belonging</span>
          <h2>Our community, connected.</h2>
          <p>A place to keep family close, make meaningful introductions, and stay part of the conversation.</p>
          <div className="auth-services"><span><Icon name="family"/> Family tree</span><span><Icon name="rishte"/> Rishte</span><span><Icon name="community"/> Community</span><span><Icon name="messages"/> Messages</span></div>
        </div>
        <span className="auth-footnote">Made for the connections that matter.</span>
      </aside>
      <section className={`auth-card ${entry === "register" ? "registration-card" : ""}`}>
        <div className="auth-mobile-brand"><BrandMark/>AbbasiConnect</div>
        {entry === "home" && <div className="auth-welcome">
          <span className="section-kicker">Welcome to AbbasiConnect</span>
          <h1>Make yourself at home.</h1>
          <p>Sign in to reconnect with your community, or join us by creating an account.</p>
          <div className="entry-grid"><button onClick={() => { setError(""); setEntry("signin"); }}>Sign in <Icon name="arrow"/></button><button className="secondary" onClick={() => { setError(""); setEntry("register"); }}>Create account</button></div>
          <div className="auth-note"><Icon name="lock"/><span>Your family tree is shared with your approval.</span></div>
        </div>}
        {entry === "signin" && <form className="stack" onSubmit={event => { event.preventDefault(); void perform(() => signIn(event)); }} aria-busy={working}>
          <div className="form-title"><button type="button" className="icon-button" aria-label="Back to welcome" onClick={() => { setError(""); setEntry("home"); }}><Icon name="back"/></button><div><h1>Welcome back</h1><p>Sign in to your community.</p></div></div>
          <label>Username<input autoComplete="username" autoCapitalize="none" spellCheck={false} value={login.username} onChange={e => setLogin({ ...login, username: e.target.value })} required/></label>
          <label>Password<input type="password" autoComplete="current-password" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} required/></label>
          <Notice>{error}</Notice>
          <button disabled={working}>{working ? "Signing in…" : "Sign in"}<Icon name="arrow"/></button>
        </form>}
        {entry === "register" && <form className="stack" onSubmit={event => { event.preventDefault(); void perform(() => createAccount(event)); }} aria-busy={working}>
          <div className="form-title"><button type="button" className="icon-button" aria-label="Back to welcome" onClick={() => { setError(""); setEntry("home"); }}><Icon name="back"/></button><div><h1>Join the community</h1><p>A few details to get you started.</p></div></div>
          <div className="form-grid two">
            <label>Name<input autoComplete="name" value={register.displayName} onChange={e => setRegister({ ...register, displayName: e.target.value })} required/></label>
            <label>Username<input autoComplete="username" autoCapitalize="none" spellCheck={false} value={register.username} onChange={e => setRegister({ ...register, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })} minLength={3} required/></label>
            <label>Phone or email<input autoComplete="email" value={register.contact} onChange={e => setRegister({ ...register, contact: e.target.value })} placeholder="+91… or name@example.com" required/></label>
            <label>Password<input type="password" autoComplete="new-password" minLength={8} value={register.password} onChange={e => setRegister({ ...register, password: e.target.value })} required/><small className="field-note">8 characters minimum</small></label>
            <label>Date of birth<input type="date" autoComplete="bday" value={register.dateOfBirth} onChange={e => setRegister({ ...register, dateOfBirth: e.target.value })}/></label>
            <label>Gender<select value={register.gender} onChange={e => setRegister({ ...register, gender: e.target.value })}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label>
            <label>City<input autoComplete="address-level2" value={register.city} onChange={e => setRegister({ ...register, city: e.target.value })}/></label>
            <label>State<input autoComplete="address-level1" value={register.state} onChange={e => setRegister({ ...register, state: e.target.value })}/></label>
          </div>
          <div className="otp-box"><div className="otp-head"><div><strong>Verify your contact</strong><small>Request your six digit verification code.</small></div><button type="button" className="secondary" disabled={working} onClick={() => void perform(requestOtp)}>Request OTP</button></div>
            {challenge?.developmentCode && <p className="test-otp">Testing code <strong>{challenge.developmentCode}</strong></p>}
            <label>Verification code<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} placeholder="6 digit code" value={register.otp} onChange={e => setRegister({ ...register, otp: e.target.value.replace(/\D/g, "").slice(0, 6) })} required/></label>
          </div>
          <Notice>{error}</Notice><button disabled={working}>{working ? "Please wait…" : "Create account"}<Icon name="arrow"/></button>
        </form>}
      </section>
    </main>;
  }

  const navigation: { id: Module; label: string; icon: IconName }[] = [
    { id: "rishte", label: "Rishte", icon: "rishte" },
    { id: "family", label: "Family tree", icon: "family" },
    { id: "community", label: "Community", icon: "community" },
    { id: "messages", label: "Messages", icon: "messages" },
  ];
  return <div className={`app-shell module-${module}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="topbar"><div className="topbar-inner">
      <button className="brand-button" aria-label="AbbasiConnect home" onClick={() => setModule("home")}><BrandMark/><span>AbbasiConnect</span></button>
      <nav className="main-nav" aria-label="Main navigation">{navigation.map(item => <button key={item.id} className={module === item.id ? "active" : ""} aria-current={module === item.id ? "page" : undefined} onClick={() => setModule(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav>
      <div className="top-member"><Avatar name={member.displayName} id={member.id} small/><span><strong>{member.displayName}</strong><small>@{member.username}</small></span></div>
      <div className="account-actions"><button className={`header-action ${module === "settings" ? "active" : ""}`} aria-current={module === "settings" ? "page" : undefined} onClick={() => setModule("settings")}><Icon name="account"/><span>Account</span></button><button className="header-action" onClick={logout}><Icon name="logout"/><span>Log out</span></button></div>
    </div></header>
    <main id="main-content" tabIndex={-1}>
      {module === "home" ? <Home member={member} open={setModule}/> : <div className="page-wrap" key={module}>
        <button className="back-link" onClick={() => setModule("home")}><Icon name="back"/> Home</button>
        {module === "rishte" && <Rishte me={member}/>}
        {module === "family" && <Family me={member}/>}
        {module === "community" && <Community me={member}/>}
        {module === "messages" && <Messages me={member}/>}
        {module === "settings" && <Settings member={member} setMember={setMember}/>}
      </div>}
    </main>
  </div>;
}

function Rishte({ me }: { me: Member }) {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [mine, setMine] = useState<any>(null);
  const [interests, setInterests] = useState<any>({ received: [], sent: [] });
  const [error, setError] = useState("");
  const { working, perform } = useAction(setError);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ q: "", city: "", gender: "" });
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ isActive: true, headline: "", bio: "", familyNote: "", lookingFor: "" });

  async function load(refreshEdit = true) {
    try {
      const params = new URLSearchParams();
      Object.entries(filter).forEach(([key, value]) => value && params.set(key, value));
      const [a, b, c] = await Promise.all([
        api(`/rishte${params.toString() ? `?${params}` : ""}`),
        api("/rishte/me"),
        api("/rishte/interests"),
      ]);
      setProfiles(a.profiles);
      setMine(b.profile);
      if (b.profile && refreshEdit) setEdit({ isActive: b.profile.isActive, headline: b.profile.headline, bio: b.profile.bio, familyNote: b.profile.familyNote, lookingFor: b.profile.lookingFor });
      setInterests(c);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Rishte");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => onRealtime((detail) => { if (detail?.type === "rishte") void load(false); }), [filter.q, filter.city, filter.gender]);

  async function save(event: FormEvent) {
    event.preventDefault();
    await api("/rishte/me", { method: "PUT", body: JSON.stringify(edit) });
    setEditing(false);
    await load();
  }

  async function removeListing() {
    if (!window.confirm("Remove your Rishte listing?")) return;
    await api("/rishte/me", { method: "DELETE" });
    setMine(null);
    setEditing(false);
    await load();
  }

  async function toggleListing() {
    await api("/rishte/me", { method: "PUT", body: JSON.stringify({ ...edit, isActive: !edit.isActive }) });
    await load();
  }

  async function send(profile: any) {
    const message = window.prompt("Optional note", "") ?? "";
    await api(`/rishte/${profile.id}/interest`, { method: "POST", body: JSON.stringify({ message }) });
    await load();
  }

  async function act(id: string, action: string) {
    await api(`/rishte/interests/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    await load();
  }

  return (
    <section>
      <PageHeading icon="rishte" title="Rishte" description="Meaningful introductions within the community."/>
      <Notice>{error}</Notice>
      <div className="split-layout">
        <div>
          <form className="filters" onSubmit={event => { event.preventDefault(); void perform(() => load()); }} aria-label="Search Rishte listings">
            <label>Find a member<input placeholder="Name, education, occupation" value={filter.q} onChange={e => setFilter({ ...filter, q: e.target.value })}/></label>
            <label>City<input placeholder="Any city" value={filter.city} onChange={e => setFilter({ ...filter, city: e.target.value })}/></label>
            <label>Gender<select value={filter.gender} onChange={e => setFilter({ ...filter, gender: e.target.value })}><option value="">Any gender</option><option>Male</option><option>Female</option><option>Other</option></select></label>
            <button disabled={working}><Icon name="search"/>Search</button>
          </form>
          <div className="card-list" aria-busy={loading}>
            {loading && <LoadingState label="Finding community listings…"/>}
            {profiles.map(profile => <article className="plain-card rishte-card" key={profile.id}>
              <div className="card-head"><MemberLine member={profile}/><span className="verify-chip"><Icon name="check"/>Verified</span></div>
              <div className="profile-story">
                {profile.rishte.headline && <h3>{profile.rishte.headline}</h3>}
                <p>{profile.rishte.bio || profile.about || "No introduction yet."}</p>
                {profile.rishte.familyNote && <div className="profile-detail"><strong>Family</strong><p>{profile.rishte.familyNote}</p></div>}
                {profile.rishte.lookingFor && <div className="profile-detail"><strong>Looking for</strong><p>{profile.rishte.lookingFor}</p></div>}
              </div>
              <div className="button-row">{profile.relationship?.status === "NONE" ? <button disabled={working} onClick={() => void perform(() => send(profile))}><Icon name="rishte"/>Send interest</button> : <span className="status-pill">{fmt(profile.relationship?.status)}</span>}</div>
            </article>)}
            {!loading && !error && !profiles.length && <EmptyState icon="search" title="No matching listings">Try a different name, city, or gender.</EmptyState>}
          </div>
        </div>
        <aside className="side-panel rishte-side" aria-label="Your listing and interests">
          {loading && !mine ? <LoadingState label="Loading your listing…"/> : !mine && !editing ? <div className="listing-empty"><Icon name="rishte"/><h2>Your listing</h2><p>You are not listed in Rishte. Introduce yourself when you are ready.</p><button onClick={() => setEditing(true)}><Icon name="plus"/>Create listing</button></div> : mine && !editing ? <div className="listing-summary">
            <div className="card-head"><h2>Your listing</h2><span className={mine.isActive ? "status-pill" : "muted-chip"}>{mine.isActive ? "Visible" : "Paused"}</span></div>
            <h3>{mine.headline || "Rishte listing"}</h3>{mine.bio && <p>{mine.bio}</p>}
            <div className="button-row"><button onClick={() => setEditing(true)}><Icon name="edit"/>Edit</button><button className="ghost" disabled={working} onClick={() => void perform(toggleListing)}>{mine.isActive ? "Pause" : "Publish"}</button><button className="text-button danger-link" disabled={working} onClick={() => void perform(removeListing)}>Delete</button></div>
          </div> : <form className="stack" onSubmit={event => { event.preventDefault(); void perform(() => save(event)); }} aria-busy={working}>
            <div className="card-head"><h2>{mine ? "Edit listing" : "Create listing"}</h2>{mine && <button type="button" className="text-button" onClick={() => setEditing(false)}>Cancel</button>}</div>
            <label>Headline<input value={edit.headline} onChange={e => setEdit({ ...edit, headline: e.target.value })}/></label>
            <label>About<textarea rows={4} value={edit.bio} onChange={e => setEdit({ ...edit, bio: e.target.value })}/></label>
            <label>Family note<textarea rows={3} value={edit.familyNote} onChange={e => setEdit({ ...edit, familyNote: e.target.value })}/></label>
            <label>Looking for<textarea rows={3} value={edit.lookingFor} onChange={e => setEdit({ ...edit, lookingFor: e.target.value })}/></label>
            <button disabled={working}>{working ? "Saving…" : "Save listing"}</button>
          </form>}
          <hr/><div className="card-head"><h3>Incoming interests</h3><span className="count-badge">{interests.received.length}</span></div>
          {interests.received.map((interest: any) => <div className="request-row" key={interest.id}><MemberLine member={interest.member}/><span className="status-pill neutral">{fmt(interest.status)}</span>{interest.status === "PENDING" && <div className="button-row"><button disabled={working} onClick={() => void perform(() => act(interest.id, "ACCEPT"))}>Accept</button><button className="ghost" disabled={working} onClick={() => void perform(() => act(interest.id, "DECLINE"))}>Decline</button></div>}</div>)}
          {!loading && !interests.received.length && <p className="muted">New interests will appear here.</p>}
        </aside>
      </div>
    </section>
  );
}

function Family({ me }: { me: Member }) {
  const [data, setData] = useState<any>({ links: [], incomingAccess: [], outgoingAccess: [] });
  const [directory, setDirectory] = useState<Member[]>([]);
  const [tree, setTree] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const { working, perform } = useAction(setError);
  const [feedback, setFeedback] = useState("");
  const [relative, setRelative] = useState({ relativeName: "", relation: "SIBLING", relationLabel: "" });
  const [claim, setClaim] = useState("");

  async function loadFamily() {
    try {
      setData(await api("/family/me"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load family");
    }
  }

  async function searchFamilies(event?: FormEvent) {
    event?.preventDefault();
    if (search.trim().length < 2) return;
    try {
      const result = await api(`/family/search?q=${encodeURIComponent(search.trim())}`);
      setDirectory(result.members);
      setSearched(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    }
  }

  async function viewTree(id: string) {
    try {
      setTree(await api(`/family/tree/${id}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tree unavailable");
    }
  }

  useEffect(() => { void loadFamily(); void viewTree(me.id); }, []);
  useEffect(() => onRealtime((detail) => {
    if (detail?.type !== "family") return;
    void loadFamily();
    void viewTree(me.id);
    if (searched && search.trim().length >= 2) void searchFamilies();
  }), [me.id, searched, search]);

  async function addRelative(event: FormEvent) {
    event.preventDefault();
    const result = await api("/family/members", { method: "POST", body: JSON.stringify(relative) });
    setRelative({ relativeName: "", relation: "SIBLING", relationLabel: "" });
    await loadFamily();
    await viewTree(me.id);
    setFeedback(`Relative added. Family code: ${result.link.inviteCode}`);
  }

  async function claimCode(event: FormEvent) {
    event.preventDefault();
    await api("/family/claim", { method: "POST", body: JSON.stringify({ code: claim }) });
    setClaim("");
    await loadFamily();
    await viewTree(me.id);
  }

  async function requestAccess(id: string) {
    await api(`/family/access/${id}`, { method: "POST" });
    await loadFamily();
    if (searched) await searchFamilies();
  }

  async function actAccess(id: string, action: string) {
    await api(`/family/access/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    await loadFamily();
  }

  return (
    <section>
      <PageHeading icon="family" title="Your family" description="Every connection has a place."/>
      <Notice>{error}</Notice><Notice kind="success">{feedback}</Notice>
      <section className="panel tree-panel">
        <div className="tree-panel-heading"><div><span className="section-kicker">Connected across generations</span><h2>{tree?.rootId && tree.rootId !== me.id ? `${tree.nodes.find((node: any) => node.id === tree.rootId)?.displayName || "Member"}'s family tree` : "Family tree"}</h2></div>{tree && <span className="count-badge">{tree.nodes.length} {tree.nodes.length === 1 ? "person" : "people"}</span>}</div>
        {tree ? <FamilyTree tree={tree} memberId={me.id}/> : error ? <EmptyState icon="family" title="Family tree unavailable">Open Family tree again to retry.</EmptyState> : <LoadingState label="Bringing your family together…"/>}
      </section>
      <div className="family-layout">
        <section className="panel family-manage">
          <div className="section-heading"><div><h2>Manage family</h2><p className="muted">Add relatives or connect with a family code.</p></div><Icon name="family"/></div>
          <div className="family-links">{data.links.map((link: any) => <article className="family-link" key={link.id}><Avatar name={link.owner.id === me.id ? link.relativeName : link.owner.displayName} small/><div><strong>{link.owner.id === me.id ? link.relativeName : link.owner.displayName}</strong><span>{fmt(link.relationLabel || link.relation)} · {fmt(link.status)}</span></div>{link.status === "INVITED" && <div className="family-code"><small>Family code</small><code>{link.inviteCode}</code></div>}</article>)}</div>
          <form className="family-add-form" onSubmit={event => { event.preventDefault(); void perform(() => addRelative(event)); }} aria-busy={working}>
            <h3>Add a relative</h3><div className="form-grid two"><label>Relative’s name<input placeholder="Full name" value={relative.relativeName} onChange={e => setRelative({ ...relative, relativeName: e.target.value })} required/></label><label>Relationship<select value={relative.relation} onChange={e => setRelative({ ...relative, relation: e.target.value })}><option value="PARENT">Parent</option><option value="CHILD">Child</option><option value="SIBLING">Sibling</option><option value="SPOUSE">Spouse</option><option value="OTHER">Other</option></select></label></div>
            <div className="family-add-bottom"><label>Relationship label <span className="field-note">Optional</span><input placeholder="For example, Brother" value={relative.relationLabel} onChange={e => setRelative({ ...relative, relationLabel: e.target.value })}/></label><button disabled={working}><Icon name="plus"/>Add relative</button></div>
          </form>
          <form className="claim-form" onSubmit={event => { event.preventDefault(); void perform(() => claimCode(event)); }} aria-busy={working}><div><Icon name="family"/><h3>Have a family code?</h3></div><p>Connect your account to an existing family invitation.</p><div className="search-row"><label><span className="sr-only">Family code</span><input placeholder="Enter family code" autoCapitalize="characters" spellCheck={false} value={claim} onChange={e => setClaim(e.target.value.toUpperCase())}/></label><button className="secondary" disabled={working}>Connect account</button></div></form>
        </section>
        <aside className="side-panel family-search-panel">
          <h2>Find another family</h2><form className="search-row" onSubmit={event => { event.preventDefault(); void perform(() => searchFamilies(event)); }}><label><span className="sr-only">Name or username</span><input placeholder="Name or username" value={search} onChange={e => setSearch(e.target.value)}/></label><button disabled={working}>Search</button></form>
          {!searched && <p className="muted search-hint">Search for someone outside your connected family. Their approval is required to view their tree.</p>}
          {searched && directory.map(person => { const access = data.outgoingAccess.find((item: any) => item.member.id === person.id); return <div className="request-row" key={person.id}><MemberLine member={person}/><div className="button-row">{access?.status === "APPROVED" ? <button disabled={working} onClick={() => void perform(() => viewTree(person.id))}>View tree</button> : access?.status === "PENDING" ? <span className="status-pill">Requested</span> : <button className="ghost" disabled={working} onClick={() => void perform(() => requestAccess(person.id))}>Request tree</button>}</div></div>; })}
          {searched && !directory.length && <p className="muted">No results outside your family.</p>}
          <hr/><div className="card-head"><h3>Access requests</h3><Icon name="lock"/></div>
          {data.incomingAccess.map((item: any) => <div className="request-row" key={item.id}><MemberLine member={item.member}/><span className="status-pill neutral">{fmt(item.status)}</span>{item.status === "PENDING" && <div className="button-row"><button disabled={working} onClick={() => void perform(() => actAccess(item.id, "APPROVE"))}>Approve</button><button className="ghost" disabled={working} onClick={() => void perform(() => actAccess(item.id, "DECLINE"))}>Decline</button></div>}</div>)}
          {!data.incomingAccess.length && <p className="muted">No pending requests.</p>}
        </aside>
      </div>
    </section>
  );
}

function Community({ me }: { me: Member }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const { working, perform } = useAction(setError);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [postImage, setPostImage] = useState<string | null>(null);

  async function load() {
    try {
      setPosts((await api("/community/feed")).posts);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load community");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => onRealtime((detail) => { if (detail?.type === "community") void load(); }), []);

  async function choosePostImage(file?: File) {
    if (!file) return;
    setPostImage(await prepareImage(file));
    setError("");
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() && !postImage) return;
    if (postImage) await api("/media/posts", { method: "POST", body: JSON.stringify({ body: body.trim(), dataUrl: postImage }) });
    else await api("/community/posts", { method: "POST", body: JSON.stringify({ body }) });
    setBody("");
    setPostImage(null);
    await load();
  }

  async function remove(id: string) {
    await api(`/community/posts/${id}`, { method: "DELETE" });
    await load();
  }

  async function like(id: string) {
    await api(`/community/posts/${id}/like`, { method: "POST" });
    await load();
  }

  async function comment(event: FormEvent, id: string) {
    event.preventDefault();
    const text = commentDrafts[id]?.trim();
    if (!text) return;
    await api(`/community/posts/${id}/comments`, { method: "POST", body: JSON.stringify({ body: text }) });
    setCommentDrafts((current) => ({ ...current, [id]: "" }));
    await load();
  }

  async function share(post: any) {
    const text = post.body ? `${post.author.displayName}: ${post.body}` : `${post.author.displayName} shared a photo on AbbasiConnect.`;
    if (navigator.share) {
      await navigator.share({ title: "AbbasiConnect", text });
      return;
    }
    await navigator.clipboard.writeText(text);
    setFeedback("Post copied to your clipboard.");
  }

  return (
    <section className="narrow-page community-page">
      <PageHeading icon="community" title="Community board" description="Updates, conversations, and everyday connections."/>
      <Notice>{error}</Notice><Notice kind="success">{feedback}</Notice>
      <form className="composer" onSubmit={event => { event.preventDefault(); void perform(() => publish(event)); }} aria-busy={working}><div className="composer-header"><Avatar name={me.displayName} id={me.id} small/><strong>What would you like to share?</strong></div><label><span className="sr-only">Write an update</span><textarea rows={3} placeholder="Share a thought, an update, or a photo with the community…" value={body} onChange={e => setBody(e.target.value)} maxLength={2500}/></label>{postImage && <div className="composer-image-wrap"><img className="composer-image-preview" src={postImage} alt="Selected post"/><button type="button" className="image-remove" aria-label="Remove selected image" onClick={() => setPostImage(null)}><Icon name="close"/></button></div>}<div className="composer-footer"><div className="composer-media"><label className="image-upload"><Icon name="image"/>Add photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void perform(() => choosePostImage(file)); e.target.value = ""; }}/></label><small>{body.length} / 2500</small></div><button disabled={(!body.trim() && !postImage) || working}><Icon name="plus"/>{working ? "Please wait…" : "Post update"}</button></div></form>
      <div className="feed-heading"><h2>Latest from the community</h2></div>
      {loading && <LoadingState label="Loading community updates…"/>}
      {!loading && !error && !posts.length && <EmptyState icon="community" title="Start the conversation">Your community updates will appear here.</EmptyState>}
      <div className="feed" aria-busy={loading}>
        {posts.map((post: any) => <article className="post" key={post.id}>
          <div className="post-meta"><MemberLine member={post.author}/><time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString()}</time></div>{post.body && <p dir="auto">{post.body}</p>}<PostImage postId={post.id} alt={`Photo shared by ${post.author.displayName}`}/>
          <div className="post-actions"><button className={post.likedByMe ? "post-action active" : "post-action"} aria-pressed={post.likedByMe} disabled={working} onClick={() => void perform(() => like(post.id))}><Icon name="heart"/>Like{post.likeCount ? ` ${post.likeCount}` : ""}</button><button className="post-action" onClick={() => document.getElementById(`comment-${post.id}`)?.focus()}><Icon name="messages"/>Comment{post.commentCount ? ` ${post.commentCount}` : ""}</button><button className="post-action" onClick={() => void perform(() => share(post))}><Icon name="share"/>Share</button>{post.author.id === me.id && <button className="post-action danger-link" disabled={working} onClick={() => void perform(() => remove(post.id))}>Delete</button>}</div>
          {post.comments.length > 0 && <div className="comments">{post.comments.map((item: any) => <div className="comment" key={item.id}><Avatar name={item.author.displayName} id={item.author.id} small/><div><strong>{item.author.displayName}</strong><p dir="auto">{item.body}</p></div></div>)}</div>}
          <form className="comment-form" onSubmit={event => { event.preventDefault(); void perform(() => comment(event, post.id)); }}><Avatar name={me.displayName} id={me.id} small/><input aria-label={`Comment on ${post.author.displayName}'s post`} id={`comment-${post.id}`} placeholder="Write a comment…" value={commentDrafts[post.id] || ""} onChange={e => setCommentDrafts(current => ({ ...current, [post.id]: e.target.value }))}/><button className="secondary" disabled={!commentDrafts[post.id]?.trim() || working}>Post</button></form>
        </article>)}
      </div>
    </section>
  );
}

function Messages({ me }: { me: Member }) {
  const [threads, setThreads] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const { working, perform } = useAction(setError);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [searched, setSearched] = useState(false);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const pageRef = useRef<HTMLElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const previousThread = useRef<string | null>(null);
  const previousMessageIds = useRef(new Set<string>());
  const nearBottom = useRef(true);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlocked, setUnlocked] = useState(secureMessagingUnlocked(me.id));

  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => pageRef.current?.style.setProperty("--chat-viewport", `${viewport?.height || window.innerHeight}px`);
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => { viewport?.removeEventListener("resize", resize); window.removeEventListener("resize", resize); };
  }, []);

  useLayoutEffect(() => {
    if (!active || !logRef.current) return;
    const last = active.messages.at(-1);
    if (previousThread.current !== active.id || nearBottom.current || last?.senderId === me.id) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
      nearBottom.current = true;
    }
    previousThread.current = active.id;
    previousMessageIds.current = new Set(active.messages.map((message: any) => message.id));
  }, [active?.id, active?.messages.at(-1)?.id, opening, mobileThreadOpen]);

  async function showConversation(action: () => Promise<unknown>) {
    setMobileThreadOpen(true);
    setOpening(true);
    await perform(action);
    setOpening(false);
  }

  async function load() {
    try {
      const result = await api("/messages-secure/threads");
      setThreads(result.threads);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => onRealtime((detail) => {
    if (detail?.type !== "messages") return;
    void load();
    if (active?.id) void open(active.id);
  }), [active?.id]);

  async function findMembers(event: FormEvent) {
    event.preventDefault();
    if (q.trim().length < 2) return;
    const result = await api(`/directory?q=${encodeURIComponent(q.trim())}`);
    setMembers(result.members);
    setSearched(true);
  }

  async function open(id: string) {
    try {
      const result = await api(`/messages-secure/threads/${id}`);
      const messages = await Promise.all(result.messages.map(async (message: any) => {
        if (!message.encrypted) return { ...message, plain: message.body, legacy: true };
        try {
          return { ...message, plain: await decryptMessage(message, me.id) };
        } catch {
          return { ...message, plain: null, locked: true };
        }
      }));
      setActive({ ...result, messages });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open conversation");
    }
  }

  async function start(id: string) {
    const result = await api(`/messages-secure/threads/${id}`, { method: "POST" });
    await load();
    await open(result.thread.id);
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    try {
      await unlockSecureMessaging(api, unlockPassword, me.id);
      setUnlockPassword("");
      setUnlocked(true);
      setError("");
      if (active) await open(active.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unlock secure messages");
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!active || !text.trim()) return;
    if (!unlocked) return setError("Unlock secure messages first");
    if (!active.otherPublicKey) return setError(`${active.member.displayName} needs to sign in once before encrypted messages can be sent`);
    try {
      const ownKey = await myPublicKey(api, me.id);
      const encrypted = await encryptMessage(text.trim(), ownKey, active.otherPublicKey);
      await api(`/messages-secure/threads/${active.id}/messages`, { method: "POST", body: JSON.stringify(encrypted) });
      setText("");
      await open(active.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send message");
    }
  }

  return <section className="messages-page" ref={pageRef}>
    <PageHeading icon="messages" title="Conversations" description="A little closer, wherever you are."><span className="secure-label"><Icon name="lock"/>End-to-end encrypted</span></PageHeading>
    {!mobileThreadOpen && <Notice>{error}</Notice>}
    {!unlocked && <form className="unlock-strip" onSubmit={event => { event.preventDefault(); void perform(() => unlock(event)); }}><span>Secure messages are locked on this browser.</span><input type="password" autoComplete="current-password" aria-label="Account password" placeholder="Account password" value={unlockPassword} onChange={e => setUnlockPassword(e.target.value)}/><button disabled={working}>Unlock</button></form>}
    <div className={`messages-layout${mobileThreadOpen ? " thread-open" : ""}`}>
      <aside className="thread-list" aria-label="Conversations">
        <h2>Your conversations <span className="count-badge">{threads.length}</span></h2>
        {loading && <LoadingState label="Loading conversations…"/>}
        {!loading && !error && !threads.length && <EmptyState icon="messages" title="Say hello">Find a member below to start a conversation.</EmptyState>}
        {threads.map((thread: any) => <button className={active?.id === thread.id ? "thread active" : "thread"} key={thread.id} aria-current={active?.id === thread.id ? "true" : undefined} disabled={opening} onClick={() => void showConversation(() => open(thread.id))}><MemberLine member={thread.member}/>{thread.lastMessage && <small className="preview">{thread.lastMessage.encrypted ? "Encrypted message" : thread.lastMessage.body}</small>}</button>)}
        <div className="thread-search"><h3>Start a conversation</h3><form className="search-row" onSubmit={event => { event.preventDefault(); void perform(() => findMembers(event)); }}><input aria-label="Find a member" placeholder="Name or username" value={q} onChange={e => setQ(e.target.value)}/><button className="secondary" disabled={working}>Find</button></form>
          {members.slice(0, 8).map(person => <button className="thread" key={person.id} disabled={opening} onClick={() => void showConversation(() => start(person.id))}><MemberLine member={person}/><small className="preview">Start conversation</small></button>)}
          {searched && !members.length && <p className="muted">No matching members.</p>}
        </div>
      </aside>
      <div className="chat-panel">
        {mobileThreadOpen && <Notice>{error}</Notice>}
        {opening ? <><div className="chat-head"><button className="icon-button mobile-chat-back" aria-label="Back to conversations" onClick={() => setMobileThreadOpen(false)}><Icon name="back"/></button><h2>Opening conversation</h2></div><LoadingState label="Loading your messages…"/></> : active ? <>
          <div className="chat-head"><button className="icon-button mobile-chat-back" aria-label="Back to conversations" onClick={() => setMobileThreadOpen(false)}><Icon name="back"/></button><MemberLine member={active.member}/><span className={active.encryptionReady ? "secure-state" : "secure-state pending"}><Icon name="lock"/>{active.encryptionReady ? "Encrypted" : "Waiting for secure setup"}</span></div>
          <div className="chat-log" ref={logRef} role="log" aria-label={`Messages with ${active.member.displayName}`} aria-relevant="additions" onScroll={() => { const node = logRef.current; if (node) nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; }}>
            {!active.messages.length && <EmptyState icon="messages" title="Your conversation starts here">Send your first message when you are ready.</EmptyState>}
            {active.messages.map((message: any) => <div className={`bubble${message.senderId === me.id ? " mine" : ""}${previousThread.current === active.id && !previousMessageIds.current.has(message.id) ? " arriving" : ""}`} key={message.id}><p dir="auto">{message.plain ?? "Unlock secure messages to read this"}</p>{message.legacy && <small className="legacy-note">Earlier unencrypted message</small>}<small><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></small></div>)}
          </div>
          <form className="chat-compose" onSubmit={event => { event.preventDefault(); void perform(() => send(event)); }}><input aria-label="Write a message" placeholder="Write a message…" value={text} onChange={e => setText(e.target.value)} disabled={!active.encryptionReady}/><button disabled={!text.trim() || !active.encryptionReady || working}><Icon name="send"/>{working ? "Sending…" : "Send"}</button></form>
        </> : <><button className="text-button mobile-chat-back" onClick={() => setMobileThreadOpen(false)}><Icon name="back"/>Conversations</button><EmptyState icon="messages" title="Room for a conversation">Choose a conversation or find someone from the community.</EmptyState></>}
      </div>
    </div>
  </section>;
}

function Settings({ member, setMember }: { member: Member; setMember: (member: Member) => void }) {
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const { working, perform } = useAction(setError);
  const [profileImage, setProfileImage] = useState<string | null | undefined>(undefined);
  const [edit, setEdit] = useState({
    displayName: member.displayName,
    city: member.city || "",
    state: member.state || "",
    country: member.country || "India",
    gender: member.gender || "",
    dateOfBirth: member.dateOfBirth || "",
    education: member.education || "",
    occupation: member.occupation || "",
    about: member.about || "",
    languages: member.languages || "",
    interests: member.interests || "",
    isDirectoryVisible: member.isDirectoryVisible !== false,
  });

  async function chooseProfileImage(file?: File) {
    if (!file) return;
    setProfileImage(await prepareImage(file, 512, .82));
    setFeedback("Photo selected. Save changes to apply it.");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const updated = await api("/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ ...edit, dateOfBirth: edit.dateOfBirth || undefined, gender: edit.gender || undefined, city: edit.city || undefined, state: edit.state || undefined }),
    });
    if (profileImage !== undefined) {
      if (profileImage) await api("/media/profile", { method: "PUT", body: JSON.stringify({ dataUrl: profileImage }) });
      else await api("/media/profile", { method: "DELETE" });
      profileImageUpdated(member.id);
    }
    setMember(updated);
    setProfileImage(undefined);
    setError("");
    setFeedback("Your profile has been saved.");
  }

  return <section className="narrow-page account-page">
    <PageHeading icon="account" title="Your account" description="The details that help your community know you."/>
    <Notice>{error}</Notice>
    <form className="panel account-form" onSubmit={event => { event.preventDefault(); void perform(() => save(event)); }} aria-busy={working}>
      <div className="account-identity profile-photo-row"><Avatar name={member.displayName} id={member.id} preview={profileImage}/><div><h2>{member.displayName}</h2><p>@{member.username}</p></div><div className="profile-photo-actions"><label className="image-upload"><Icon name="image"/>Change photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void perform(() => chooseProfileImage(file)); e.target.value = ""; }}/></label><button type="button" className="text-button" onClick={() => { setProfileImage(null); setFeedback("Photo will be removed when you save changes."); }}>Remove photo</button></div></div>
      <section className="form-section"><h2>Personal details</h2><p>Your name and a little about you.</p><div className="form-grid two">
        <label>Name<input autoComplete="name" value={edit.displayName} onChange={e => setEdit({ ...edit, displayName: e.target.value })}/></label>
        <label>Date of birth<input type="date" autoComplete="bday" value={edit.dateOfBirth} onChange={e => setEdit({ ...edit, dateOfBirth: e.target.value })}/></label>
        <label>Gender<input value={edit.gender} onChange={e => setEdit({ ...edit, gender: e.target.value })}/></label>
        <label>Languages<input value={edit.languages} onChange={e => setEdit({ ...edit, languages: e.target.value })}/></label>
      </div></section>
      <section className="form-section"><h2>Where you are</h2><p>Keep your community connected across places.</p><div className="form-grid two">
        <label>City<input autoComplete="address-level2" value={edit.city} onChange={e => setEdit({ ...edit, city: e.target.value })}/></label>
        <label>State<input autoComplete="address-level1" value={edit.state} onChange={e => setEdit({ ...edit, state: e.target.value })}/></label>
        <label>Country<input autoComplete="country-name" value={edit.country} onChange={e => setEdit({ ...edit, country: e.target.value })}/></label>
      </div></section>
      <section className="form-section"><h2>A little more about you</h2><p>Your work, interests, and introduction.</p><div className="form-grid two">
        <label>Education<input value={edit.education} onChange={e => setEdit({ ...edit, education: e.target.value })}/></label>
        <label>Occupation<input value={edit.occupation} onChange={e => setEdit({ ...edit, occupation: e.target.value })}/></label>
        <label>Interests<input value={edit.interests} onChange={e => setEdit({ ...edit, interests: e.target.value })}/></label>
      </div><label className="full-width">About<textarea rows={5} value={edit.about} onChange={e => setEdit({ ...edit, about: e.target.value })}/></label></section>
      <section className="form-section"><h2>Directory visibility</h2><p>Choose whether members can find your account.</p><label className="toggle-row"><input type="checkbox" checked={edit.isDirectoryVisible} onChange={e => setEdit({ ...edit, isDirectoryVisible: e.target.checked })}/><span><strong>Allow registered members to find my account</strong><small>Your family tree still requires your approval to view.</small></span></label></section>
      <div className="form-footer"><Notice kind="success">{feedback}</Notice><button disabled={working}><Icon name="check"/>{working ? "Saving…" : "Save changes"}</button></div>
    </form>
  </section>;
}
