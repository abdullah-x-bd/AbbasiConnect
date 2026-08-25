import { FormEvent, useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  displayName: string;
  username: string;
  bio: string;
  role?: "MEMBER" | "MODERATOR" | "ADMIN";
  verifiedAt?: string;
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
  post?: { id: string; body: string; hiddenAt?: string | null; authorId: string } | null;
};

type Tab = "feed" | "search" | "profile" | "moderation";

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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("feed");

  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [scanDone, setScanDone] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [reference, setReference] = useState("");
  const [last4, setLast4] = useState("");
  const [scanning, setScanning] = useState(false);

  const [postBody, setPostBody] = useState("");
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, Post[]>>({});
  const [replyBody, setReplyBody] = useState<Record<string, string>>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);

  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);

  const [moderationReports, setModerationReports] = useState<Report[]>([]);

  const remaining = useMemo(() => 1000 - postBody.length, [postBody]);
  const canModerate = user?.role === "MODERATOR" || user?.role === "ADMIN";

  async function refreshMe() {
    const me = await api("/auth/me");
    setUser(me);
    setEditName(me.displayName);
    setEditUsername(me.username);
    setEditBio(me.bio ?? "");
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
        setEditName(me.displayName);
        setEditUsername(me.username);
        setEditBio(me.bio ?? "");
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
      if (data.extracted?.displayName) setDisplayName(data.extracted.displayName);
      setScanDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not scan card");
    } finally {
      setScanning(false);
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("/auth/dev-aadhaar", {
        method: "POST",
        body: JSON.stringify({
          displayName,
          username: username.toLowerCase(),
          reference,
          last4: last4 || undefined,
        }),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      await Promise.all([refreshMe(), refreshFeed()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  }

  async function createPost(event: FormEvent) {
    event.preventDefault();
    if (!postBody.trim()) return;
    setError("");
    try {
      const post = await api("/posts", { method: "POST", body: JSON.stringify({ body: postBody }) });
      setPosts((current) => [post, ...current]);
      setPostBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish post");
    }
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
    if (replyOpen === postId) {
      setReplyOpen(null);
      return;
    }
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
    try {
      const data = await api(`/users/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
  }

  async function viewProfile(target: User | Pick<User, "username">) {
    try {
      const profile = await api(`/users/${encodeURIComponent(target.username)}`);
      setSelectedProfile(profile);
      setTab("profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load profile");
    }
  }

  async function toggleFollow(target: User) {
    await api(`/users/${target.id}/follow`, { method: target.isFollowing ? "DELETE" : "POST" });
    const updated = { ...target, isFollowing: !target.isFollowing };
    setSearchResults((items) => items.map((item) => item.id === target.id ? updated : item));
    if (selectedProfile?.id === target.id) setSelectedProfile({ ...selectedProfile, isFollowing: updated.isFollowing });
  }

  async function blockMember(target: User) {
    if (!window.confirm(`Block @${target.username}? You will no longer see each other's content.`)) return;
    await api(`/users/${target.id}/block`, { method: "POST" });
    setSearchResults((items) => items.filter((item) => item.id !== target.id));
    setSelectedProfile(null);
    setTab("feed");
    await refreshFeed();
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName: editName, username: editUsername.toLowerCase(), bio: editBio }),
      });
      await refreshMe();
      setEditingProfile(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    }
  }

  async function loadModeration() {
    try {
      const data = await api("/moderation/reports");
      setModerationReports(data.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load moderation queue");
    }
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
  }

  if (loading) return <main className="center-screen">Loading AbbasiConnect...</main>;

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card wide-auth">
          <div className="brand-mark">AC</div>
          <h1>AbbasiConnect</h1>
          <p className="muted">Verified people. Text-only social connection.</p>

          {!scanDone ? (
            <form onSubmit={scanAadhaar} className="stack">
              <div className="step-label">Step 1 of 2 · identity card</div>
              <label>
                Upload Aadhaar card photo
                <input type="file" accept="image/*" onChange={(event) => setAadhaarFile(event.target.files?.[0] ?? null)} required />
              </label>
              <p className="fine-print">Development build: use a test image, not a real Aadhaar card. The production adapter will extract and verify identity data without keeping the card image.</p>
              {error && <p className="error">{error}</p>}
              <button type="submit" disabled={!aadhaarFile || scanning}>{scanning ? "Reading card..." : "Read card"}</button>
            </form>
          ) : (
            <form onSubmit={register} className="stack">
              <div className="step-label">Step 2 of 2 · confirm account</div>
              <label>
                Name detected from Aadhaar
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Edit your display name" minLength={2} required />
              </label>
              <label>
                Choose username
                <div className="input-prefix"><span>@</span><input value={username} onChange={(event) => setUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} placeholder="abdullah" minLength={3} maxLength={24} required /></div>
              </label>
              <label>
                Development verification reference
                <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="DEV-ABBASI-001" minLength={4} required />
              </label>
              <label>
                Aadhaar last 4, optional in development
                <input value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1234" inputMode="numeric" />
              </label>
              <p className="fine-print">In production the verification provider will return the identity reference after Aadhaar verification. AbbasiConnect will keep the internal reference, not the uploaded card image.</p>
              {error && <p className="error">{error}</p>}
              <div className="button-row"><button className="ghost" type="button" onClick={() => setScanDone(false)}>Back</button><button type="submit">Verify and register</button></div>
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={() => setTab("feed")}>AbbasiConnect</button>
        <nav className="nav-tabs">
          <button className={tab === "feed" ? "nav-active" : ""} onClick={() => setTab("feed")}>Feed</button>
          <button className={tab === "search" ? "nav-active" : ""} onClick={() => setTab("search")}>Find people</button>
          <button className={tab === "profile" ? "nav-active" : ""} onClick={() => { setSelectedProfile(null); setTab("profile"); }}>Profile</button>
          {canModerate && <button className={tab === "moderation" ? "nav-active" : ""} onClick={() => { setTab("moderation"); loadModeration(); }}>Moderation</button>}
        </nav>
        <button className="ghost small" onClick={logout}>Log out</button>
      </header>

      <div className="layout">
        <aside className="profile-card">
          <div className="initials">{user.displayName.slice(0, 2).toUpperCase()}</div>
          <h2>{user.displayName}</h2>
          <p className="handle">@{user.username}</p>
          {user.bio && <p className="bio">{user.bio}</p>}
          <div className="verification-line">✓ Verified member</div>
          {user._count && <div className="profile-counts"><span><strong>{user._count.followers}</strong> followers</span><span><strong>{user._count.following}</strong> following</span></div>}
        </aside>

        <section className="feed-column">
          {error && <div className="error panel">{error}<button className="dismiss" onClick={() => setError("")}>×</button></div>}

          {tab === "feed" && <>
            <form className="composer" onSubmit={createPost}>
              <textarea value={postBody} onChange={(event) => setPostBody(event.target.value)} placeholder="Write something..." maxLength={1000} rows={4} />
              <div className="composer-footer"><span className="muted">{remaining} characters</span><button type="submit" disabled={!postBody.trim()}>Post</button></div>
            </form>
            <div className="feed">{posts.length ? posts.map((post) => <PostCard key={post.id} post={post} />) : <div className="empty-state"><h3>No posts yet</h3><p>Write the first post on AbbasiConnect.</p></div>}</div>
          </>}

          {tab === "search" && <section className="panel page-panel">
            <h2>Find people</h2>
            <form className="search-form" onSubmit={searchMembers}><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search name or @username" /><button type="submit">Search</button></form>
            <div className="member-list">{searchResults.map((member) => <div className="member-row" key={member.id}><button className="member-main" onClick={() => viewProfile(member)}><strong>{member.displayName}</strong><span>@{member.username}</span>{member.bio && <small>{member.bio}</small>}</button><div className="member-actions"><button className="ghost small" onClick={() => toggleFollow(member)}>{member.isFollowing ? "Following" : "Follow"}</button><button className="text-danger" onClick={() => blockMember(member)}>Block</button></div></div>)}</div>
          </section>}

          {tab === "profile" && selectedProfile && <section className="panel page-panel">
            <div className="profile-header"><div><h2>{selectedProfile.displayName}</h2><p className="handle">@{selectedProfile.username}</p><p>{selectedProfile.bio || "No bio yet."}</p><div className="profile-counts"><span><strong>{selectedProfile._count?.followers ?? 0}</strong> followers</span><span><strong>{selectedProfile._count?.following ?? 0}</strong> following</span></div></div>{selectedProfile.id !== user.id && <div className="button-row"><button onClick={() => toggleFollow(selectedProfile)}>{selectedProfile.isFollowing ? "Unfollow" : "Follow"}</button><button className="ghost" onClick={() => blockMember(selectedProfile)}>Block</button></div>}</div>
            <h3>Posts</h3><div className="feed">{selectedProfile.posts.map((post) => <PostCard key={post.id} post={post} />)}</div>
          </section>}

          {tab === "profile" && !selectedProfile && <section className="panel page-panel">
            <div className="section-heading"><div><h2>Your profile</h2><p className="handle">@{user.username}</p></div><button className="ghost" onClick={() => setEditingProfile((value) => !value)}>{editingProfile ? "Cancel" : "Edit profile"}</button></div>
            {editingProfile ? <form className="stack" onSubmit={saveProfile}><label>Display name<input value={editName} onChange={(event) => setEditName(event.target.value)} required /></label><label>Username<input value={editUsername} onChange={(event) => setEditUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} required /></label><label>Bio<textarea value={editBio} onChange={(event) => setEditBio(event.target.value)} maxLength={280} rows={4} /></label><button type="submit">Save changes</button></form> : <><p>{user.bio || "Add a short bio so people know who you are."}</p><div className="verification-line">✓ Aadhaar-verified account</div></>}
          </section>}

          {tab === "moderation" && canModerate && <section className="panel page-panel">
            <div className="section-heading"><div><h2>Moderation queue</h2><p className="muted">Open and reviewed community reports.</p></div><button className="ghost" onClick={loadModeration}>Refresh</button></div>
            <div className="report-list">{moderationReports.length === 0 ? <div className="empty-state"><h3>Queue clear</h3><p>No reports need review.</p></div> : moderationReports.map((report) => <article className="report-card" key={report.id}><div className="post-meta"><strong>{report.reason}</strong><span>{report.status}</span><span>·</span><time>{new Date(report.createdAt).toLocaleString()}</time></div><p><strong>Reporter:</strong> @{report.reporter.username}</p>{report.reportedUser && <p><strong>Reported member:</strong> @{report.reportedUser.username}</p>}{report.post && <blockquote>{report.post.body}</blockquote>}{report.details && <p>{report.details}</p>}<div className="moderation-actions"><button className="ghost small" onClick={() => moderate(report, "review")}>Mark reviewed</button>{report.post && <button className="small" onClick={() => moderate(report, report.post?.hiddenAt ? "restore_post" : "hide_post")}>{report.post.hiddenAt ? "Restore post" : "Hide post"}</button>}{report.reportedUser && <button className="small" onClick={() => moderate(report, report.reportedUser?.suspendedAt ? "restore_user" : "suspend_user")}>{report.reportedUser.suspendedAt ? "Restore user" : "Suspend user"}</button>}<button className="text-danger" onClick={() => moderate(report, "dismiss")}>Dismiss</button></div></article>)}</div>
          </section>}
        </section>
      </div>
    </main>
  );
}
