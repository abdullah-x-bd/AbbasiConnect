import { FormEvent, useEffect, useState } from "react";

const TOKEN_KEY = "abbasiconnect_token";
const API_URL = import.meta.env.VITE_API_URL ?? "/api";
type Tab = "overview" | "members" | "reports";

async function adminApi(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}/admin${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Admin request failed");
  return data;
}

function Metric({ label, value, note }: { label: string; value: number; note?: string }) {
  return <article className="admin-metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

export default function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadOverview() { setLoading(true); try { setOverview(await adminApi("/overview")); } catch (e) { setError(e instanceof Error ? e.message : "Could not load overview"); } finally { setLoading(false); } }
  async function loadUsers(event?: FormEvent) { event?.preventDefault(); setLoading(true); try { const data = await adminApi(`/users${query ? `?q=${encodeURIComponent(query)}` : ""}`); setUsers(data.users); } catch (e) { setError(e instanceof Error ? e.message : "Could not load members"); } finally { setLoading(false); } }
  async function loadReports() { setLoading(true); try { setReports((await adminApi("/reports")).reports); } catch (e) { setError(e instanceof Error ? e.message : "Could not load reports"); } finally { setLoading(false); } }
  useEffect(() => { loadOverview(); }, []);

  function change(next: Tab) { setTab(next); setError(""); if (next === "overview") loadOverview(); if (next === "members") loadUsers(); if (next === "reports") loadReports(); }
  async function userAction(id: string, action: string) { await adminApi(`/users/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }); await loadUsers(); await loadOverview(); }
  async function reportAction(id: string, action: string) { const note = window.prompt("Optional admin note", "") ?? ""; await adminApi(`/reports/${id}`, { method: "PATCH", body: JSON.stringify({ action, note }) }); await loadReports(); await loadOverview(); }

  return <main className="admin-shell"><header className="admin-topbar"><div><div className="admin-brand">AbbasiConnect</div><span>Administration</span></div><nav><button className={tab === "overview" ? "admin-nav-active" : ""} onClick={() => change("overview")}>Overview</button><button className={tab === "members" ? "admin-nav-active" : ""} onClick={() => change("members")}>Members</button><button className={tab === "reports" ? "admin-nav-active" : ""} onClick={() => change("reports")}>Reports</button></nav><button className="ghost" onClick={onLogout}>Log out</button></header><div className="admin-page">{error && <p className="error">{error}</p>}{loading && <p className="muted">Loading…</p>}
    {tab === "overview" && overview && <><section className="page-heading"><div><p className="eyebrow">ADMIN</p><h1>Platform overview</h1><p>Bird’s-eye view of the community platform.</p></div><small>Updated {new Date(overview.generatedAt).toLocaleString()}</small></section><div className="admin-metrics"><Metric label="Members" value={overview.metrics.users} note={`${overview.metrics.recentUsers} joined in 7 days`} /><Metric label="Active Rishte" value={overview.metrics.activeRishte} /><Metric label="Family links" value={overview.metrics.familyLinks} note={`${overview.metrics.verifiedFamilyLinks} verified`} /><Metric label="Tree requests" value={overview.metrics.pendingTreeRequests} note="pending" /><Metric label="Community posts" value={overview.metrics.posts} /><Metric label="Messages" value={overview.metrics.messages} /><Metric label="Rishte interests" value={overview.metrics.interests} note={`${overview.metrics.acceptedInterests} accepted`} /><Metric label="Open reports" value={overview.metrics.openReports} note={`${overview.metrics.reports} total`} /></div><section className="admin-panel admin-wide"><h2>What the platform is tracking</h2><div className="admin-summary-grid"><div><strong>Identity</strong><p>Contact verification is required. Aadhaar remains optional.</p></div><div><strong>Family graph</strong><p>Registered and invited relatives, claim codes and verified links.</p></div><div><strong>Privacy</strong><p>Family trees require owner approval before another member can view them.</p></div><div><strong>Community</strong><p>Text posts, direct messages and opt-in Rishte listings.</p></div></div></section></>}
    {tab === "members" && <><section className="page-heading"><div><p className="eyebrow">ADMIN</p><h1>Members</h1><p>Search accounts and inspect community participation.</p></div></section><form className="admin-filters" onSubmit={loadUsers}><input placeholder="Name, username, email or phone" value={query} onChange={(e) => setQuery(e.target.value)} /><button>Search</button></form><div className="admin-member-list">{users.map((u) => <article className="admin-member" key={u.id}><div className="admin-member-main"><div className="card-head"><div><h3>{u.displayName}</h3><p>@{u.username} · {u.role}</p></div><span className="verify-chip">{u.contactVerified ? "Contact verified" : "Unverified"}</span></div><div className="facts"><span>{u.age ? `${u.age} yrs` : "Age unknown"}</span>{u.city && <span>{u.city}</span>}{u.occupation && <span>{u.occupation}</span>}</div><p><strong>Contact</strong> {u.email || u.phone || "Not provided"}</p><p><strong>Aadhaar</strong> {u.aadhaarVerified ? "Optional identity linked" : "Not linked"}</p><p><strong>Family links</strong> {u.familyLinks} · <strong>Posts</strong> {u.postCount} · <strong>Messages sent</strong> {u.messageCount}</p><p><strong>Rishte</strong> {u.rishteActive ? "Listed" : "Not listed"} · <strong>Directory</strong> {u.isDirectoryVisible ? "Visible" : "Hidden"}</p></div><div className="admin-member-actions">{u.suspendedAt ? <button onClick={() => userAction(u.id, "RESTORE")}>Restore</button> : <button className="danger" onClick={() => userAction(u.id, "SUSPEND")}>Suspend</button>}{u.role === "MODERATOR" ? <button className="ghost" onClick={() => userAction(u.id, "MAKE_MEMBER")}>Remove moderator</button> : <button className="ghost" onClick={() => userAction(u.id, "MAKE_MODERATOR")}>Make moderator</button>}{u.isDirectoryVisible ? <button className="ghost" onClick={() => userAction(u.id, "HIDE_DIRECTORY")}>Hide from directory</button> : <button className="ghost" onClick={() => userAction(u.id, "SHOW_DIRECTORY")}>Show in directory</button>}</div></article>)}</div></>}
    {tab === "reports" && <><section className="page-heading"><div><p className="eyebrow">ADMIN</p><h1>Reports</h1><p>Profile and community-post reports.</p></div></section><div className="report-list">{reports.map((r) => <article className="report-card" key={r.id}><div><strong>{r.reason}</strong> · {r.status}</div><p>Reporter @{r.reporter?.username}</p>{r.reportedUser && <p>Reported member <strong>@{r.reportedUser.username}</strong></p>}{r.post && <blockquote>{r.post.body}</blockquote>}{r.details && <p>{r.details}</p>}<div className="button-row"><button onClick={() => reportAction(r.id, "REVIEW")}>Mark reviewed</button>{r.reportedUser && <button className="danger" onClick={() => reportAction(r.id, "SUSPEND_USER")}>Suspend member</button>}<button className="ghost" onClick={() => reportAction(r.id, "DISMISS")}>Dismiss</button></div></article>)}</div></>}
  </div></main>;
}
