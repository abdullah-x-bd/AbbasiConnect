import { FormEvent, useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  displayName: string;
  username: string;
  bio?: string;
};

type Post = {
  id: string;
  body: string;
  createdAt: string;
  author: User;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

function getToken() {
  return localStorage.getItem("abbasiconnect_token");
}

async function api(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(data.error ?? "Request failed");
  }

  return response.json();
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [reference, setReference] = useState("");
  const [postBody, setPostBody] = useState("");

  const remaining = useMemo(() => 1000 - postBody.length, [postBody]);

  async function loadFeed() {
    const data = await api("/feed");
    setPosts(data.posts);
  }

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    Promise.all([api("/auth/me"), api("/feed")])
      .then(([me, feed]) => {
        setUser(me);
        setPosts(feed.posts);
      })
      .catch(() => {
        localStorage.removeItem("abbasiconnect_token");
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("/auth/dev-aadhaar", {
        method: "POST",
        body: JSON.stringify({ displayName, reference }),
      });
      localStorage.setItem("abbasiconnect_token", data.token);
      setUser(data.user);
      await loadFeed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  async function createPost(event: FormEvent) {
    event.preventDefault();
    if (!postBody.trim()) return;
    setError("");

    try {
      const post = await api("/posts", {
        method: "POST",
        body: JSON.stringify({ body: postBody }),
      });
      setPosts((current) => [post, ...current]);
      setPostBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish post");
    }
  }

  function logout() {
    localStorage.removeItem("abbasiconnect_token");
    setUser(null);
    setPosts([]);
  }

  if (loading) {
    return <main className="center-screen">Loading AbbasiConnect...</main>;
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-mark">AC</div>
          <h1>AbbasiConnect</h1>
          <p className="muted">A simple, text-first network for verified people.</p>

          <form onSubmit={login} className="stack">
            <label>
              Your name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Abdullah Abbasi"
                minLength={2}
                required
              />
            </label>

            <label>
              Development Aadhaar reference
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="DEV-ABBASI-001"
                minLength={4}
                required
              />
            </label>

            <p className="fine-print">
              Development simulator only. Do not enter a real Aadhaar number.
            </p>

            {error && <p className="error">{error}</p>}
            <button type="submit">Verify and enter</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <strong>AbbasiConnect</strong>
          <span className="tagline">text only</span>
        </div>
        <button className="ghost" onClick={logout}>Log out</button>
      </header>

      <div className="layout">
        <aside className="profile-card">
          <div className="initials">{user.displayName.slice(0, 2).toUpperCase()}</div>
          <h2>{user.displayName}</h2>
          <p className="handle">@{user.username}</p>
          <p className="muted">Verified member</p>
        </aside>

        <section className="feed-column">
          <form className="composer" onSubmit={createPost}>
            <textarea
              value={postBody}
              onChange={(event) => setPostBody(event.target.value)}
              placeholder="Write something..."
              maxLength={1000}
              rows={4}
            />
            <div className="composer-footer">
              <span className="muted">{remaining} characters</span>
              <button type="submit" disabled={!postBody.trim()}>Post</button>
            </div>
          </form>

          {error && <p className="error panel">{error}</p>}

          <div className="feed">
            {posts.length === 0 ? (
              <div className="empty-state">
                <h3>No posts yet</h3>
                <p>Write the first post on AbbasiConnect.</p>
              </div>
            ) : (
              posts.map((post) => (
                <article className="post" key={post.id}>
                  <div className="post-meta">
                    <strong>{post.author.displayName}</strong>
                    <span>@{post.author.username}</span>
                    <span>·</span>
                    <time>{new Date(post.createdAt).toLocaleString()}</time>
                  </div>
                  <p>{post.body}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
