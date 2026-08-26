import { FormEvent, useEffect, useMemo, useState } from "react";

type Role = "MEMBER" | "MODERATOR" | "ADMIN";
type User = {
  id: string;
  displayName: string;
  username: string;
  bio: string;
  role?: Role;
  verifiedAt?: string;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  age?: number | null;
  gender?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  _count?: { followers: number; following: number; posts?: number };
  isFollowing?: boolean;
};

type Post = {
  id: string;
  body: string;
  createdAt: string;
  author: Pick<User, "id" | "displayName" | "username">;
  likedByMe: boolean;
  _count: { likes: number; replies: number };
};

type Profile = User & { posts: Post[] };
type Report = {
  id: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
  reporter: Pick<User, "id" | "displayName" | "username">;
  reportedUser?: (Pick<User, "id" | "displayName" | "username"> & { suspendedAt?: string | null }) | null;
  post?: { id: string; body: string; hiddenAt?: string | null } | null;
};

type Tab = "feed" | "search" | "profile" | "moderation";
type AuthView = "landing" | "signin" | "register";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const TOKEN_KEY = "abbasiconnect_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(data.error ?? "Request failed");
  }
  return response.json();
}

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function calculateAge(dateOfBirth: string) {
  if (!dateOfBirth) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const month = today.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("feed");

  const [authView, setAuthView] = useState<AuthView>("landing");
  const [registerStep, setRegisterStep] = useState<1 | 2 | 3>(1);
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [identityName, setIdentityName] = useState("");
  const [reference, setReference] = useState("");
  const [last4, setLast4] = useState("");
  const [registrationToken, setRegistrationToken] = useState("");
  const [scanning, setScanning] = useState(false);

  const [regName, setRegName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regDob, setRegDob] = useState("");
  const [regGender, setRegGender] = useState("");
  const [regCity, setRegCity] = useState("");
  const [regState, setRegState] = useState("");
  const [regCountry, setRegCountry] = useState("India");
  const [regBio, setRegBio] = useState("");

  const [signinUsername, setSigninUsername] = useState("");
  const [signinPassword, setSigninPassword] = useState("");

  const [postBody, setPostBody] = useState("");
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, Post[]>>({});
  const [replyBody, setReplyBody] = useState<Record<string, string>>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editCountry, setEditCountry] = useState("India");
  const [moderationReports, setModerationReports] = useState<Report[]>([]);

  const remaining = useMemo(() => 1000 - postBody.length, [postBody]);
  const registrationAge = useMemo(() => calculateAge(regDob), [regDob]);
  const canModerate = user?.role === "MODERATOR" || user?.role === "ADMIN";

  function hydrateEditFields(me: User) {
    setEditName(me.displayName ?? "");
    setEditUsername(me.username ?? "");
    setEditBio(me.bio ?? "");
    setEditEmail(me.email ?? "");
    setEditPhone(me.phone ?? "");
    setEditGender(me.gender ?? "");
    setEditCity(me.city ?? "");
    setEditState(me.state ?? "");
    setEditCountry(me.country ?? "India");
  }

  async function refreshMe() {
    const me = await api("/auth/me");
    setUser(me);
    hydrateEditFields(me);
  }

  async function refreshFeed() {
    const data = await api("/feed");
    setPosts(data.posts);
  }

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    Promise.all([api("/auth/me"), api("/feed")])
      .then(([me, feed]) => {
        setUser(me);
        hydrateEditFields(me);
        setPosts(feed.posts);
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  async function scanAadhaar(event: FormEvent) {
    event.preventDefault();
    if (!aadhaarFile) return;
    setError("");
    setScanning(true);
    try {
      const imageDataUrl = await readImage(aadhaarFile);
      const data = await api("/auth/dev-aadhaar/scan", {
        method: "POST",
        body: JSON.stringify({ fileName: aadhaarFile.name, imageDataUrl }),
      });
      const detected = data.extracted?.displayName || "";
      setIdentityName(detected);
      setRegName(detected);
      setRegisterStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read Aadhaar image");
    } finally {
      setScanning(false);
    }
  }

  async function verifyIdentity(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("/auth/dev-aadhaar/verify", {
        method: "POST",
        body: JSON.stringify({ identityName, reference, last4: last4 || undefined }),
      });
      setRegistrationToken(data.registrationToken);
      setRegName(data.identityName || identityName);
      setRegisterStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Identity verification failed");
    }
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (regPassword !== regConfirm) return setError("Passwords do not match");
    if (!regEmail.trim() && !regPhone.trim()) return setError("Enter at least an email address or contact number");
    try {
      const data = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          registrationToken,
          displayName: regName,
          username: regUsername.toLowerCase(),
          password: regPassword,
          email: regEmail || undefined,
          phone: regPhone || undefined,
          dateOfBirth: regDob,
          gender: regGender || undefined,
          city: regCity || undefined,
          state: regState || undefined,
          country: regCountry,
          bio: regBio || undefined,
        }),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      await Promise.all([refreshMe(), refreshFeed()]);
      setTab("feed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account creation failed");
    }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("/auth/sign-in", {
        method: "POST",
        body: JSON.stringify({ username: signinUsername.toLowerCase(), password: signinPassword }),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      await Promise.all([refreshMe(), refreshFeed()]);
      setTab("feed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  async function createPost(event: FormEvent) {
    event.preventDefault();
    if (!postBody.trim()) return;
    const post = await api("/posts", { method: "POST", body: JSON.stringify({ body: postBody }) });
    setPosts((current) => [post, ...current]);
    setPostBody("");
  }

  async function toggleLike(post: Post) {
    await api(`/posts/${post.id}/like`, { method: post.likedByMe ? "DELETE" : "POST" });
    const patch = (item: Post) => item.id === post.id
      ? { ...item, likedByMe: !item.likedByMe, _count: { ...item._count, likes: item._count.likes + (item.likedByMe ? -1 : 1) } }
      : item;
    setPosts((items) => items.map(patch));
    setReplies((current) => Object.fromEntries(Object.entries(current).map(([key, items]) => [key, items.map(patch)])));
  }

  async function openReplies(postId: string) {
    if (replyOpen === postId) return setReplyOpen(null);
    const data = await api(`/posts/${postId}/replies`);
    setReplies((current) => ({ ...current, [postId]: data.replies }));
    setReplyOpen(postId);
  }

  async function sendReply(event: FormEvent, postId: string) {
    event.preventDefault();
    const body = replyBody[postId]?.trim();
    if (!body) return;
    const reply = await api(`/posts/${postId}/replies`, { method: "POST", body: JSON.stringify({ body }) });
    setReplies((current) => ({ ...current, [postId]: [...(current[postId] ?? []), reply] }));
    setReplyBody((current) => ({ ...current, [postId]: "" }));
    setPosts((items) => items.map((item) => item.id === postId ? { ...item, _count: { ...item._count, replies: item._count.replies + 1 } } : item));
  }

  async function reportPost(post: Post) {
    const details = window.prompt("What is wrong with this post?", "");
    if (details === null) return;
    await api("/reports", { method: "POST", body: JSON.stringify({ postId: post.id, reason: "OTHER", details }) });
    window.alert("Report submitted.");
  }

  async function searchMembers(event?: FormEvent) {
    event?.preventDefault();
    if (!searchQuery.trim()) return;
    const data = await api(`/users/search?q=${encodeURIComponent(searchQuery)}`);
    setSearchResults(data.users);
  }

  async function viewProfile(target: Pick<User, "username">) {
    const profile = await api(`/users/${encodeURIComponent(target.username)}`);
    setSelectedProfile(profile);
    setTab("profile");
  }

  async function toggleFollow(target: User) {
    await api(`/users/${target.id}/follow`, { method: target.isFollowing ? "DELETE" : "POST" });
    const updated = { ...target, isFollowing: !target.isFollowing };
    setSearchResults((items) => items.map((item) => item.id === target.id ? updated : item));
    if (selectedProfile?.id === target.id) setSelectedProfile({ ...selectedProfile, isFollowing: updated.isFollowing });
  }

  async function blockMember(target: User) {
    if (!window.confirm(`Block @${target.username}?`)) return;
    await api(`/users/${target.id}/block`, { method: "POST" });
    setSearchResults((items) => items.filter((item) => item.id !== target.id));
    setSelectedProfile(null);
    setTab("feed");
    await refreshFeed();
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: editName,
          username: editUsername.toLowerCase(),
          bio: editBio,
          email: editEmail || undefined,
          phone: editPhone || undefined,
          gender: editGender || undefined,
          city: editCity || undefined,
          state: editState || undefined,
          country: editCountry,
        }),
      });
      await refreshMe();
      setEditingProfile(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    }
  }

  async function loadModeration() {
    const data = await api("/moderation/reports");
    setModerationReports(data.reports);
  }

  async function moderate(report: Report, action: string) {
    const note = window.prompt("Optional moderator note", "") ?? "";
    await api(`/moderation/reports/${report.id}`, { method: "PATCH", body: JSON.stringify({ action, note }) });
    await loadModeration();
    await refreshFeed();
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setPosts([]);
    setSelectedProfile(null);
    setAuthView("landing");
  }

  function resetRegistration() {
    setRegisterStep(1);
    setAadhaarFile(null);
    setIdentityName("");
    setReference("");
    setLast4("");
    setRegistrationToken("");
    setError("");
  }

  if (loading) return <main className="center-screen">Loading AbbasiConnect...</main>;

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card wide-auth">
          <div className="brand-mark">AC</div>
          <h1>AbbasiConnect</h1>
          <p className="muted">Verified people. Text-first social connection.</p>

          {authView === "landing" && (
            <div className="auth-choice">
              <button onClick={() => { resetRegistration(); setAuthView("register"); }}>Register</button>
              <button className="ghost" onClick={() => { setError(""); setAuthView("signin"); }}>Sign in</button>
            </div>
          )}

          {authView === "signin" && (
            <form onSubmit={signIn} className="stack">
              <div className="step-label">Sign in</div>
              <label>Username<div className="input-prefix"><span>@</span><input value={signinUsername} onChange={(e) => setSigninUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} minLength={3} required autoComplete="username" /></div></label>
              <label>Password<input type="password" value={signinPassword} onChange={(e) => setSigninPassword(e.target.value)} required autoComplete="current-password" /></label>
              {error && <p className="error">{error}</p>}
              <div className="button-row"><button type="button" className="ghost" onClick={() => setAuthView("landing")}>Back</button><button type="submit">Sign in</button></div>
            </form>
          )}

          {authView === "register" && registerStep === 1 && (
            <form onSubmit={scanAadhaar} className="stack">
              <div className="step-label">Register · step 1 of 3</div>
              <h2>Verify who you are</h2>
              <label>Upload Aadhaar card photo<input type="file" accept="image/*" onChange={(e) => setAadhaarFile(e.target.files?.[0] ?? null)} required /></label>
              <p className="fine-print">The card image is read for onboarding and is not stored in the social database.</p>
              {error && <p className="error">{error}</p>}
              <div className="button-row"><button type="button" className="ghost" onClick={() => setAuthView("landing")}>Back</button><button type="submit" disabled={!aadhaarFile || scanning}>{scanning ? "Reading card..." : "Continue"}</button></div>
            </form>
          )}

          {authView === "register" && registerStep === 2 && (
            <form onSubmit={verifyIdentity} className="stack">
              <div className="step-label">Register · step 2 of 3</div>
              <h2>Confirm Aadhaar identity</h2>
              <label>Name read from Aadhaar<input value={identityName} onChange={(e) => { setIdentityName(e.target.value); setRegName(e.target.value); }} minLength={2} required /></label>
              <label>Development Aadhaar verification reference<input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="DEV-ABBASI-001" minLength={4} required /></label>
              <label>Aadhaar last 4, optional in development<input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="1234" /></label>
              <p className="fine-print">This development reference stands in for successful live Aadhaar authentication. It becomes a unique internal identity link, so one verified identity maps to one account.</p>
              {error && <p className="error">{error}</p>}
              <div className="button-row"><button type="button" className="ghost" onClick={() => setRegisterStep(1)}>Back</button><button type="submit">Verify Aadhaar</button></div>
            </form>
          )}

          {authView === "register" && registerStep === 3 && (
            <form onSubmit={createAccount} className="stack registration-form">
              <div className="step-label">Register · step 3 of 3</div>
              <h2>Create your account</h2>
              <p className="verified-strip">Identity verified for <strong>{identityName}</strong></p>
              <div className="form-grid">
                <label className="full">Name<input value={regName} onChange={(e) => setRegName(e.target.value)} minLength={2} maxLength={80} required /></label>
                <label>Username<div className="input-prefix"><span>@</span><input value={regUsername} onChange={(e) => setRegUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} minLength={3} maxLength={24} required /></div></label>
                <label>Date of birth<input type="date" value={regDob} onChange={(e) => setRegDob(e.target.value)} required />{registrationAge !== null && registrationAge >= 0 && <small>Age: {registrationAge}</small>}</label>
                <label>Email<input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="name@example.com" /></label>
                <label>Contact number<input value={regPhone} onChange={(e) => setRegPhone(e.target.value)} placeholder="+91..." inputMode="tel" /></label>
                <label>Password<input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} minLength={8} maxLength={72} required autoComplete="new-password" /></label>
                <label>Confirm password<input type="password" value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)} minLength={8} maxLength={72} required autoComplete="new-password" /></label>
                <label>Gender, optional<input value={regGender} onChange={(e) => setRegGender(e.target.value)} placeholder="Optional" maxLength={32} /></label>
                <label>City, optional<input value={regCity} onChange={(e) => setRegCity(e.target.value)} maxLength={80} /></label>
                <label>State, optional<input value={regState} onChange={(e) => setRegState(e.target.value)} maxLength={80} /></label>
                <label>Country<input value={regCountry} onChange={(e) => setRegCountry(e.target.value)} maxLength={80} required /></label>
                <label className="full">Short bio, optional<textarea value={regBio} onChange={(e) => setRegBio(e.target.value)} maxLength={280} rows={3} /></label>
              </div>
              <p className="fine-print">At least one contact method, email or phone, is required. Email, phone and date of birth are private account information.</p>
              {error && <p className="error">{error}</p>}
              <div className="button-row"><button type="button" className="ghost" onClick={() => setRegisterStep(2)}>Back</button><button type="submit">Create account</button></div>
            </form>
          )}
        </section>
      </main>
    );
  }

  function PostCard({ post, compact = false }: { post: Post; compact?: boolean }) {
    return (
      <article className={`post ${compact ? "reply-post" : ""}`}>
        <button className="author-link" onClick={() => viewProfile(post.author)}>{post.author.displayName} <span>@{post.author.username}</span></button>
        <time className="post-time">{new Date(post.createdAt).toLocaleString()}</time>
        <p>{post.body}</p>
        <div className="post-actions">
          <button className={post.likedByMe ? "action active" : "action"} onClick={() => toggleLike(post)}>Like {post._count.likes}</button>
          {!compact && <button className="action" onClick={() => openReplies(post.id)}>Reply {post._count.replies}</button>}
          <button className="action" onClick={() => reportPost(post)}>Report</button>
        </div>
        {!compact && replyOpen === post.id && (
          <div className="reply-area">
            {(replies[post.id] ?? []).map((reply) => <PostCard key={reply.id} post={reply} compact />)}
            <form className="reply-form" onSubmit={(event) => sendReply(event, post.id)}>
              <input value={replyBody[post.id] ?? ""} onChange={(event) => setReplyBody((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="Write a reply..." maxLength={1000} />
              <button type="submit">Reply</button>
            </form>
          </div>
        )}
      </article>
    );
  }

  const ownProfile = !selectedProfile || selectedProfile.id === user.id;

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={() => { setTab("feed"); setSelectedProfile(null); }}>AbbasiConnect</button>
        <nav>
          <button className={tab === "feed" ? "nav-active" : ""} onClick={() => { setTab("feed"); setSelectedProfile(null); }}>Feed</button>
          <button className={tab === "search" ? "nav-active" : ""} onClick={() => setTab("search")}>Find people</button>
          <button className={tab === "profile" && ownProfile ? "nav-active" : ""} onClick={() => { setSelectedProfile(null); setTab("profile"); }}>Profile</button>
          {canModerate && <button className={tab === "moderation" ? "nav-active" : ""} onClick={() => { setTab("moderation"); loadModeration(); }}>Moderation</button>}
        </nav>
        <button className="ghost" onClick={logout}>Sign out</button>
      </header>

      <div className="layout">
        <aside className="profile-card">
          <div className="initials">{user.displayName.slice(0, 2).toUpperCase()}</div>
          <h2>{user.displayName}</h2>
          <p className="handle">@{user.username}</p>
          <p className="muted">Aadhaar-linked verified member</p>
          {user.age !== null && user.age !== undefined && <p>{user.age} years old</p>}
          {(user.city || user.state) && <p>{[user.city, user.state].filter(Boolean).join(", ")}</p>}
        </aside>

        <section className="feed-column">
          {error && <p className="error panel">{error}</p>}
          {tab === "feed" && <><form className="composer" onSubmit={createPost}><textarea value={postBody} onChange={(e) => setPostBody(e.target.value)} placeholder="Write something..." maxLength={1000} rows={4} /><div className="composer-footer"><span className="muted">{remaining} characters</span><button type="submit" disabled={!postBody.trim()}>Post</button></div></form><div className="feed">{posts.map((post) => <PostCard key={post.id} post={post} />)}</div></>}

          {tab === "search" && <section className="panel section-card"><h2>Find people</h2><form className="search-row" onSubmit={searchMembers}><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search name or @username" /><button type="submit">Search</button></form><div className="people-list">{searchResults.map((member) => <article className="person-row" key={member.id}><div><button className="author-link" onClick={() => viewProfile(member)}>{member.displayName} <span>@{member.username}</span></button><p>{member.bio}</p></div><div className="button-row compact"><button onClick={() => toggleFollow(member)}>{member.isFollowing ? "Unfollow" : "Follow"}</button><button className="ghost" onClick={() => blockMember(member)}>Block</button></div></article>)}</div></section>}

          {tab === "profile" && !selectedProfile && <section className="panel section-card"><div className="section-heading"><div><h2>{user.displayName}</h2><p className="handle">@{user.username}</p></div><button className="ghost" onClick={() => setEditingProfile((v) => !v)}>{editingProfile ? "Cancel" : "Edit profile"}</button></div><p>{user.bio}</p><div className="stats"><span>{user._count?.followers ?? 0} followers</span><span>{user._count?.following ?? 0} following</span><span>{user._count?.posts ?? 0} posts</span></div><div className="account-details"><h3>Account details</h3><p><strong>Email:</strong> {user.email || "Not set"}</p><p><strong>Contact:</strong> {user.phone || "Not set"}</p><p><strong>Date of birth:</strong> {user.dateOfBirth || "Not set"}{user.age !== null && user.age !== undefined ? ` (${user.age})` : ""}</p><p><strong>Gender:</strong> {user.gender || "Not set"}</p><p><strong>Location:</strong> {[user.city, user.state, user.country].filter(Boolean).join(", ") || "Not set"}</p><p><strong>Identity:</strong> Aadhaar-linked</p></div>{editingProfile && <form className="stack edit-form" onSubmit={saveProfile}><label>Name<input value={editName} onChange={(e) => setEditName(e.target.value)} required /></label><label>Username<input value={editUsername} onChange={(e) => setEditUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} required /></label><label>Email<input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} /></label><label>Contact number<input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /></label><label>Gender<input value={editGender} onChange={(e) => setEditGender(e.target.value)} /></label><label>City<input value={editCity} onChange={(e) => setEditCity(e.target.value)} /></label><label>State<input value={editState} onChange={(e) => setEditState(e.target.value)} /></label><label>Country<input value={editCountry} onChange={(e) => setEditCountry(e.target.value)} /></label><label>Bio<textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} maxLength={280} /></label><button type="submit">Save profile</button></form>}</section>}

          {tab === "profile" && selectedProfile && <><section className="panel section-card"><h2>{selectedProfile.displayName}</h2><p className="handle">@{selectedProfile.username}</p><p>{selectedProfile.bio}</p>{(selectedProfile.city || selectedProfile.state) && <p>{[selectedProfile.city, selectedProfile.state, selectedProfile.country].filter(Boolean).join(", ")}</p>}<div className="stats"><span>{selectedProfile._count?.followers ?? 0} followers</span><span>{selectedProfile._count?.following ?? 0} following</span></div>{selectedProfile.id !== user.id && <div className="button-row"><button onClick={() => toggleFollow(selectedProfile)}>{selectedProfile.isFollowing ? "Unfollow" : "Follow"}</button><button className="ghost" onClick={() => blockMember(selectedProfile)}>Block</button></div>}</section><div className="feed">{selectedProfile.posts.map((post) => <PostCard key={post.id} post={post} />)}</div></>}

          {tab === "moderation" && canModerate && <section className="panel section-card"><h2>Moderation queue</h2><div className="report-list">{moderationReports.map((report) => <article className="report-card" key={report.id}><strong>{report.reason} · {report.status}</strong><p>{report.details || "No details supplied"}</p><p>Reporter: @{report.reporter.username}</p>{report.reportedUser && <p>Member: @{report.reportedUser.username}</p>}{report.post && <blockquote>{report.post.body}</blockquote>}<div className="button-row compact"><button onClick={() => moderate(report, "REVIEW")}>Review</button>{report.post && <button onClick={() => moderate(report, report.post?.hiddenAt ? "RESTORE_POST" : "HIDE_POST")}>{report.post.hiddenAt ? "Restore post" : "Hide post"}</button>}{report.reportedUser && <button onClick={() => moderate(report, report.reportedUser?.suspendedAt ? "RESTORE_USER" : "SUSPEND_USER")}>{report.reportedUser.suspendedAt ? "Restore user" : "Suspend user"}</button>}<button className="ghost" onClick={() => moderate(report, "DISMISS")}>Dismiss</button></div></article>)}</div></section>}
        </section>
      </div>
    </main>
  );
}
