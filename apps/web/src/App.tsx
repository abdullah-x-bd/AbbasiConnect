import { FormEvent, useEffect, useState } from "react";
import {
  decryptMessage,
  encryptMessage,
  myPublicKey,
  prepareSecureMessaging,
  secureMessagingUnlocked,
  unlockSecureMessaging,
} from "./e2ee";

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
      <strong>{member.displayName}</strong>
      <span>@{member.username}</span>
      <small>{[member.age ? `${member.age} yrs` : "", member.occupation, member.city].filter(Boolean).join(" · ")}</small>
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

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return setLoading(false);
    api("/auth/session")
      .then((data) => {
        if (data.mode === "admin") window.location.replace(`${BASE_URL}?admin=1`);
        else setMember(data.user);
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
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
      await prepareSecureMessaging(api, register.password, data.user.id).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setMember(null);
    setModule("home");
    setEntry("home");
  }

  if (loading) return <main className="center-screen">Opening AbbasiConnect…</main>;

  if (!member) {
    return (
      <main className="auth-shell">
        <section className="auth-card compact-auth">
          <div className="auth-brand">AbbasiConnect</div>
          {entry === "home" && (
            <>
              <h1>Community access</h1>
              <div className="entry-grid clean-entry">
                <button className="entry-choice" onClick={() => setEntry("register")}>Create account</button>
                <button className="entry-choice secondary" onClick={() => setEntry("signin")}>Sign in</button>
              </div>
            </>
          )}

          {entry === "signin" && (
            <form className="stack" onSubmit={signIn}>
              <div className="form-title"><button type="button" className="text-back" onClick={() => setEntry("home")}>←</button><h2>Sign in</h2></div>
              <label>Username<input value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} required /></label>
              <label>Password<input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} required /></label>
              {error && <p className="error">{error}</p>}
              <button>Sign in</button>
            </form>
          )}

          {entry === "register" && (
            <form className="stack" onSubmit={createAccount}>
              <div className="form-title"><button type="button" className="text-back" onClick={() => setEntry("home")}>←</button><h2>Create account</h2></div>
              <div className="form-grid two">
                <label>Name<input value={register.displayName} onChange={(e) => setRegister({ ...register, displayName: e.target.value })} required /></label>
                <label>Username<input value={register.username} onChange={(e) => setRegister({ ...register, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })} minLength={3} required /></label>
                <label>Phone or email<input value={register.contact} onChange={(e) => setRegister({ ...register, contact: e.target.value })} placeholder="+91… or name@example.com" required /></label>
                <label>Password<input type="password" minLength={8} value={register.password} onChange={(e) => setRegister({ ...register, password: e.target.value })} required /><small className="field-note">8 characters minimum</small></label>
                <label>Date of birth<input type="date" value={register.dateOfBirth} onChange={(e) => setRegister({ ...register, dateOfBirth: e.target.value })} /></label>
                <label>Gender<select value={register.gender} onChange={(e) => setRegister({ ...register, gender: e.target.value })}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label>
                <label>City<input value={register.city} onChange={(e) => setRegister({ ...register, city: e.target.value })} /></label>
                <label>State<input value={register.state} onChange={(e) => setRegister({ ...register, state: e.target.value })} /></label>
              </div>
              <div className="otp-box">
                <div className="otp-head"><strong>Verify contact</strong><button type="button" className="secondary" onClick={requestOtp}>Request OTP</button></div>
                {challenge?.developmentCode && <div className="test-otp">Testing code <strong>{challenge.developmentCode}</strong></div>}
                <label>OTP<input inputMode="numeric" maxLength={6} value={register.otp} onChange={(e) => setRegister({ ...register, otp: e.target.value.replace(/\D/g, "").slice(0, 6) })} required /></label>
              </div>
              {error && <p className="error">{error}</p>}
              <button>Create account</button>
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={() => setModule("home")}>AbbasiConnect</button>
        <nav className="desktop-nav">
          <button onClick={() => setModule("rishte")}>Rishte</button>
          <button onClick={() => setModule("family")}>Family tree</button>
          <button onClick={() => setModule("community")}>Community</button>
          <button onClick={() => setModule("messages")}>Messages</button>
        </nav>
        <div className="top-member"><span>{member.displayName}</span><small>@{member.username}</small></div>
        <button className="ghost" onClick={() => setModule("settings")}>Account</button>
        <button className="ghost" onClick={logout}>Log out</button>
      </header>
      {module === "home" ? (
        <Home member={member} open={setModule} />
      ) : (
        <div className="page-wrap">
          <button className="back-link" onClick={() => setModule("home")}>← Home</button>
          {module === "rishte" && <Rishte me={member} />}
          {module === "family" && <Family me={member} />}
          {module === "community" && <Community me={member} />}
          {module === "messages" && <Messages me={member} />}
          {module === "settings" && <Settings member={member} setMember={setMember} />}
        </div>
      )}
    </main>
  );
}

function Home({ member, open }: { member: Member; open: (module: Module) => void }) {
  return (
    <div className="home-wrap new-home">
      <div className="home-bar">
        <div><span>Signed in as</span><strong>{member.displayName}</strong></div>
        <span className="connection-mark" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
      <section className="service-index" aria-label="AbbasiConnect services">
        <button onClick={() => open("rishte")}><span>01</span><strong>Rishte</strong><b>→</b></button>
        <button onClick={() => open("family")}><span>02</span><strong>Family tree</strong><b>→</b></button>
        <button onClick={() => open("community")}><span>03</span><strong>Community</strong><b>→</b></button>
        <button onClick={() => open("messages")}><span>04</span><strong>Messages</strong><b>→</b></button>
      </section>
    </div>
  );
}

function Rishte({ me }: { me: Member }) {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [mine, setMine] = useState<any>(null);
  const [interests, setInterests] = useState<any>({ received: [], sent: [] });
  const [error, setError] = useState("");
  const [filter, setFilter] = useState({ q: "", city: "", gender: "" });
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ isActive: true, headline: "", bio: "", familyNote: "", lookingFor: "" });

  async function load() {
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
      if (b.profile) setEdit({ isActive: b.profile.isActive, headline: b.profile.headline, bio: b.profile.bio, familyNote: b.profile.familyNote, lookingFor: b.profile.lookingFor });
      setInterests(c);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Rishte");
    }
  }

  useEffect(() => { load(); }, []);

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
      <div className="page-heading simple-heading"><div><span className="section-kicker">Rishte</span><h1>Eligible members</h1></div></div>
      {error && <p className="error">{error}</p>}
      <div className="split-layout">
        <div>
          <form className="filters" onSubmit={(e) => { e.preventDefault(); load(); }}>
            <input placeholder="Name, education or occupation" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
            <input placeholder="City" value={filter.city} onChange={(e) => setFilter({ ...filter, city: e.target.value })} />
            <select value={filter.gender} onChange={(e) => setFilter({ ...filter, gender: e.target.value })}><option value="">Any gender</option><option>Male</option><option>Female</option><option>Other</option></select>
            <button>Search</button>
          </form>
          <div className="card-list">
            {profiles.map((profile) => (
              <article className="plain-card rishte-card" key={profile.id}>
                <div className="card-head"><MemberLine member={profile} /><span className="verify-chip">Verified</span></div>
                {profile.rishte.headline && <h3>{profile.rishte.headline}</h3>}
                <p>{profile.rishte.bio || profile.about || "No introduction yet."}</p>
                {profile.rishte.familyNote && <p><strong>Family</strong> {profile.rishte.familyNote}</p>}
                {profile.rishte.lookingFor && <p><strong>Looking for</strong> {profile.rishte.lookingFor}</p>}
                <div className="button-row">
                  {profile.relationship?.status === "NONE" ? <button onClick={() => send(profile)}>Send interest</button> : <span className="status-pill">{fmt(profile.relationship.status)}</span>}
                </div>
              </article>
            ))}
            {!profiles.length && <div className="empty-state">No matching listings.</div>}
          </div>
        </div>

        <aside className="side-panel rishte-side">
          {!mine && !editing ? (
            <div className="listing-empty"><h2>Your listing</h2><p>You are not listed in Rishte.</p><button onClick={() => setEditing(true)}>Create listing</button></div>
          ) : mine && !editing ? (
            <div className="listing-summary">
              <div className="card-head"><h2>Your listing</h2><span className={mine.isActive ? "status-pill" : "muted-chip"}>{mine.isActive ? "Visible" : "Paused"}</span></div>
              <h3>{mine.headline || "Rishte listing"}</h3>
              {mine.bio && <p>{mine.bio}</p>}
              <div className="button-row"><button onClick={() => setEditing(true)}>Edit</button><button className="ghost" onClick={toggleListing}>{mine.isActive ? "Pause" : "Publish"}</button><button className="text-button danger-link" onClick={removeListing}>Delete</button></div>
            </div>
          ) : (
            <form className="stack" onSubmit={save}>
              <div className="card-head"><h2>{mine ? "Edit listing" : "Create listing"}</h2>{mine && <button type="button" className="text-button" onClick={() => setEditing(false)}>Cancel</button>}</div>
              <label>Headline<input value={edit.headline} onChange={(e) => setEdit({ ...edit, headline: e.target.value })} /></label>
              <label>About<textarea rows={4} value={edit.bio} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} /></label>
              <label>Family note<textarea rows={3} value={edit.familyNote} onChange={(e) => setEdit({ ...edit, familyNote: e.target.value })} /></label>
              <label>Looking for<textarea rows={3} value={edit.lookingFor} onChange={(e) => setEdit({ ...edit, lookingFor: e.target.value })} /></label>
              <button>Save listing</button>
            </form>
          )}
          <hr />
          <h3>Incoming interests</h3>
          {interests.received.map((interest: any) => (
            <div className="request-row" key={interest.id}><MemberLine member={interest.member} /><span>{fmt(interest.status)}</span>{interest.status === "PENDING" && <div className="button-row"><button onClick={() => act(interest.id, "ACCEPT")}>Accept</button><button className="ghost" onClick={() => act(interest.id, "DECLINE")}>Decline</button></div>}</div>
          ))}
          {!interests.received.length && <p className="muted">None yet.</p>}
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

  useEffect(() => { loadFamily(); viewTree(me.id); }, []);

  async function addRelative(event: FormEvent) {
    event.preventDefault();
    const result = await api("/family/members", { method: "POST", body: JSON.stringify(relative) });
    setRelative({ relativeName: "", relation: "SIBLING", relationLabel: "" });
    await loadFamily();
    await viewTree(me.id);
    window.alert(`Family code: ${result.link.inviteCode}`);
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
      <div className="page-heading simple-heading"><div><span className="section-kicker">Family tree</span><h1>Your family</h1></div></div>
      {error && <p className="error">{error}</p>}
      <div className="family-layout">
        <div>
          <section className="panel tree-panel">
            <div className="card-head"><h2>Family tree</h2>{tree && <span>{tree.nodes.length} people</span>}</div>
            {tree ? <><div className="tree-nodes">{tree.nodes.map((node: any) => <div className={node.registered ? "tree-node" : "tree-node guest"} key={node.id}><strong>{node.displayName}</strong><small>{node.registered ? `@${node.username}` : "Not registered"}</small></div>)}</div><div className="edge-list">{tree.edges.map((edge: any) => <div key={edge.id}><span>{tree.nodes.find((node: any) => node.id === edge.from)?.displayName}</span><b>— {fmt(edge.relationLabel || edge.relation)} →</b><span>{tree.nodes.find((node: any) => node.id === edge.to)?.displayName}</span></div>)}</div></> : <p className="muted">Loading tree…</p>}
          </section>

          <section className="panel family-manage">
            <h2>Manage family</h2>
            <div className="family-links">{data.links.map((link: any) => <article className="family-link" key={link.id}><div><strong>{link.owner.id === me.id ? link.relativeName : link.owner.displayName}</strong><span>{fmt(link.relationLabel || link.relation)} · {fmt(link.status)}</span></div>{link.status === "INVITED" && <code>{link.inviteCode}</code>}</article>)}</div>
            <form className="inline-form" onSubmit={addRelative}><input placeholder="Relative's name" value={relative.relativeName} onChange={(e) => setRelative({ ...relative, relativeName: e.target.value })} required /><select value={relative.relation} onChange={(e) => setRelative({ ...relative, relation: e.target.value })}><option value="PARENT">Parent</option><option value="CHILD">Child</option><option value="SIBLING">Sibling</option><option value="SPOUSE">Spouse</option><option value="OTHER">Other</option></select><input placeholder="Label, e.g. Brother" value={relative.relationLabel} onChange={(e) => setRelative({ ...relative, relationLabel: e.target.value })} /><button>Add</button></form>
            <form className="inline-form compact" onSubmit={claimCode}><input placeholder="Family code" value={claim} onChange={(e) => setClaim(e.target.value.toUpperCase())} /><button>Connect account</button></form>
          </section>
        </div>

        <aside className="side-panel family-search-panel">
          <h2>Find another family</h2>
          <form className="search-row" onSubmit={searchFamilies}><input placeholder="Name or username" value={search} onChange={(e) => setSearch(e.target.value)} /><button>Search</button></form>
          {!searched && <p className="muted search-hint">Search for someone outside your connected family.</p>}
          {searched && directory.map((person) => {
            const access = data.outgoingAccess.find((item: any) => item.member.id === person.id);
            return <div className="request-row" key={person.id}><MemberLine member={person} /><div className="button-row">{access?.status === "APPROVED" ? <button onClick={() => viewTree(person.id)}>View tree</button> : access?.status === "PENDING" ? <span className="status-pill">Requested</span> : <button className="ghost" onClick={() => requestAccess(person.id)}>Request tree</button>}</div></div>;
          })}
          {searched && !directory.length && <p className="muted">No results outside your family.</p>}
          <hr />
          <h3>Access requests</h3>
          {data.incomingAccess.map((item: any) => <div className="request-row" key={item.id}><MemberLine member={item.member} /><span>{fmt(item.status)}</span>{item.status === "PENDING" && <div className="button-row"><button onClick={() => actAccess(item.id, "APPROVE")}>Approve</button><button className="ghost" onClick={() => actAccess(item.id, "DECLINE")}>Decline</button></div>}</div>)}
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
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  async function load() {
    try {
      setPosts((await api("/community/feed")).posts);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load community");
    }
  }

  useEffect(() => { load(); }, []);

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    await api("/community/posts", { method: "POST", body: JSON.stringify({ body }) });
    setBody("");
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
    const text = `${post.author.displayName}: ${post.body}`;
    if (navigator.share) {
      await navigator.share({ title: "AbbasiConnect", text });
      return;
    }
    await navigator.clipboard.writeText(text);
    window.alert("Post copied");
  }

  return (
    <section className="narrow-page community-page">
      <div className="page-heading simple-heading"><div><span className="section-kicker">Community</span><h1>Community board</h1></div></div>
      {error && <p className="error">{error}</p>}
      <form className="composer" onSubmit={publish}><textarea rows={3} placeholder="Write an update…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2500} /><div><small>{body.length}/2500</small><button disabled={!body.trim()}>Post</button></div></form>
      <div className="feed">
        {posts.map((post: any) => (
          <article className="post social-post" key={post.id}>
            <div className="post-meta"><MemberLine member={post.author} /><time>{new Date(post.createdAt).toLocaleString()}</time></div>
            <p>{post.body}</p>
            <div className="post-actions">
              <button className={post.likedByMe ? "post-action active" : "post-action"} onClick={() => like(post.id)}>Like{post.likeCount ? ` ${post.likeCount}` : ""}</button>
              <button className="post-action" onClick={() => document.getElementById(`comment-${post.id}`)?.focus()}>Comment{post.commentCount ? ` ${post.commentCount}` : ""}</button>
              <button className="post-action" onClick={() => share(post)}>Share</button>
              {post.author.id === me.id && <button className="post-action danger-link" onClick={() => remove(post.id)}>Delete</button>}
            </div>
            {post.comments.length > 0 && <div className="comments">{post.comments.map((item: any) => <div className="comment" key={item.id}><strong>{item.author.displayName}</strong><p>{item.body}</p></div>)}</div>}
            <form className="comment-form" onSubmit={(event) => comment(event, post.id)}><input id={`comment-${post.id}`} placeholder="Write a comment" value={commentDrafts[post.id] || ""} onChange={(e) => setCommentDrafts((current) => ({ ...current, [post.id]: e.target.value }))} /><button disabled={!commentDrafts[post.id]?.trim()}>Post</button></form>
          </article>
        ))}
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
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlocked, setUnlocked] = useState(secureMessagingUnlocked(me.id));

  async function load() {
    try {
      const result = await api("/messages-secure/threads");
      setThreads(result.threads);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages");
    }
  }

  useEffect(() => { load(); }, []);

  async function findMembers(event: FormEvent) {
    event.preventDefault();
    if (q.trim().length < 2) return;
    const result = await api(`/directory?q=${encodeURIComponent(q.trim())}`);
    setMembers(result.members);
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

  return (
    <section>
      <div className="page-heading simple-heading"><div><span className="section-kicker">Messages</span><h1>Conversations</h1></div><div className="secure-label"><span>●</span> End-to-end encrypted</div></div>
      {error && <p className="error">{error}</p>}
      {!unlocked && <form className="unlock-strip" onSubmit={unlock}><span>Secure messages are locked on this browser.</span><input type="password" placeholder="Account password" value={unlockPassword} onChange={(e) => setUnlockPassword(e.target.value)} /><button>Unlock</button></form>}
      <div className="messages-layout">
        <aside className="thread-list">
          <h3>Conversations</h3>
          {threads.map((thread: any) => <button className={active?.id === thread.id ? "thread active" : "thread"} key={thread.id} onClick={() => open(thread.id)}><MemberLine member={thread.member} />{thread.lastMessage && <small className="preview">{thread.lastMessage.encrypted ? "Encrypted message" : thread.lastMessage.body}</small>}</button>)}
          <hr />
          <form className="search-row" onSubmit={findMembers}><input placeholder="Find member" value={q} onChange={(e) => setQ(e.target.value)} /><button>Find</button></form>
          {members.slice(0, 8).map((person) => <button className="thread" key={person.id} onClick={() => start(person.id)}><MemberLine member={person} /><small>Start conversation</small></button>)}
        </aside>
        <div className="chat-panel">
          {active ? <><div className="chat-head"><MemberLine member={active.member} /><span className={active.encryptionReady ? "secure-state" : "secure-state pending"}>{active.encryptionReady ? "Encrypted" : "Waiting for secure setup"}</span></div><div className="chat-log">{active.messages.map((message: any) => <div className={message.senderId === me.id ? "bubble mine" : "bubble"} key={message.id}><p>{message.plain ?? "🔒 Unlock secure messages to read this"}</p>{message.legacy && <small className="legacy-note">Earlier unencrypted message</small>}<small>{new Date(message.createdAt).toLocaleString()}</small></div>)}</div><form className="chat-compose" onSubmit={send}><input placeholder="Write a message" value={text} onChange={(e) => setText(e.target.value)} disabled={!active.encryptionReady} /><button disabled={!text.trim() || !active.encryptionReady}>Send</button></form></> : <div className="empty-state">Choose a conversation.</div>}
        </div>
      </div>
    </section>
  );
}

function Settings({ member, setMember }: { member: Member; setMember: (member: Member) => void }) {
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

  async function save(event: FormEvent) {
    event.preventDefault();
    const updated = await api("/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ ...edit, dateOfBirth: edit.dateOfBirth || undefined, gender: edit.gender || undefined, city: edit.city || undefined, state: edit.state || undefined }),
    });
    setMember(updated);
    window.alert("Saved");
  }

  return (
    <section className="narrow-page account-page">
      <div className="page-heading simple-heading"><div><span className="section-kicker">Account</span><h1>Profile</h1></div></div>
      <form className="panel stack" onSubmit={save}>
        <div className="form-grid two">
          <label>Name<input value={edit.displayName} onChange={(e) => setEdit({ ...edit, displayName: e.target.value })} /></label>
          <label>Date of birth<input type="date" value={edit.dateOfBirth} onChange={(e) => setEdit({ ...edit, dateOfBirth: e.target.value })} /></label>
          <label>Gender<input value={edit.gender} onChange={(e) => setEdit({ ...edit, gender: e.target.value })} /></label>
          <label>City<input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></label>
          <label>State<input value={edit.state} onChange={(e) => setEdit({ ...edit, state: e.target.value })} /></label>
          <label>Country<input value={edit.country} onChange={(e) => setEdit({ ...edit, country: e.target.value })} /></label>
          <label>Education<input value={edit.education} onChange={(e) => setEdit({ ...edit, education: e.target.value })} /></label>
          <label>Occupation<input value={edit.occupation} onChange={(e) => setEdit({ ...edit, occupation: e.target.value })} /></label>
          <label>Languages<input value={edit.languages} onChange={(e) => setEdit({ ...edit, languages: e.target.value })} /></label>
          <label>Interests<input value={edit.interests} onChange={(e) => setEdit({ ...edit, interests: e.target.value })} /></label>
        </div>
        <label>About<textarea rows={5} value={edit.about} onChange={(e) => setEdit({ ...edit, about: e.target.value })} /></label>
        <label className="toggle-row"><input type="checkbox" checked={edit.isDirectoryVisible} onChange={(e) => setEdit({ ...edit, isDirectoryVisible: e.target.checked })} />Allow registered members to find my account</label>
        <button>Save changes</button>
      </form>
    </section>
  );
}
