import { FormEvent, useEffect, useState } from "react";
import { Avatar, BrandMark, EmptyState, Icon, LoadingState, Notice, PageHeading, useAction } from "./ui";

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
  return <article className="admin-metric"><span>{label}</span><strong>{value.toLocaleString()}</strong>{note && <small>{note}</small>}</article>;
}

export default function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const { working, perform } = useAction(setError);

  async function loadOverview() { setLoading(true); try { setOverview(await adminApi("/overview")); } catch (e) { setError(e instanceof Error ? e.message : "Could not load overview"); } finally { setLoading(false); } }
  async function loadUsers(event?: FormEvent) { event?.preventDefault(); setLoading(true); try { const data = await adminApi(`/users${query ? `?q=${encodeURIComponent(query)}` : ""}`); setUsers(data.users); } catch (e) { setError(e instanceof Error ? e.message : "Could not load members"); } finally { setLoading(false); } }
  async function loadReports() { setLoading(true); try { setReports((await adminApi("/reports")).reports); } catch (e) { setError(e instanceof Error ? e.message : "Could not load reports"); } finally { setLoading(false); } }
  useEffect(() => { loadOverview(); }, []);

  function change(next: Tab) { setTab(next); setError(""); if (next === "overview") loadOverview(); if (next === "members") loadUsers(); if (next === "reports") loadReports(); }
  async function userAction(id: string, action: string) { await adminApi(`/users/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }); await loadUsers(); await loadOverview(); }
  async function reportAction(id: string, action: string) { const note = window.prompt("Optional admin note", "") ?? ""; await adminApi(`/reports/${id}`, { method: "PATCH", body: JSON.stringify({ action, note }) }); await loadReports(); await loadOverview(); }

  return <div className="admin-shell">
    <a className="skip-link" href="#admin-content">Skip to content</a>
    <header className="admin-topbar"><div className="admin-topbar-inner">
      <div className="admin-brand"><BrandMark/><div><strong>AbbasiConnect</strong><span>Administration</span></div></div>
      <nav aria-label="Administration navigation"><button className={tab === "overview" ? "active" : ""} aria-current={tab === "overview" ? "page" : undefined} onClick={() => change("overview")}><Icon name="home"/>Overview</button><button className={tab === "members" ? "active" : ""} aria-current={tab === "members" ? "page" : undefined} onClick={() => change("members")}><Icon name="community"/>Members</button><button className={tab === "reports" ? "active" : ""} aria-current={tab === "reports" ? "page" : undefined} onClick={() => change("reports")}><Icon name="shield"/>Reports</button></nav>
      <button className="header-action" onClick={onLogout}><Icon name="logout"/><span>Log out</span></button>
    </div></header>
    <main className="admin-page" id="admin-content" tabIndex={-1}>
      <Notice>{error}</Notice>
      {tab === "overview" && <>
        <PageHeading icon="shield" title="Platform overview" description="A clear view of your community.">{overview && <small className="admin-updated">Updated {new Date(overview.generatedAt).toLocaleString()}</small>}</PageHeading>
        {!overview && loading && <LoadingState label="Loading the community overview…"/>}
        {overview && <>
          <div className="admin-metrics"><Metric label="Members" value={overview.metrics.users} note={`${overview.metrics.recentUsers} joined in 7 days`}/><Metric label="Active Rishte" value={overview.metrics.activeRishte}/><Metric label="Family links" value={overview.metrics.familyLinks} note={`${overview.metrics.verifiedFamilyLinks} verified`}/><Metric label="Tree requests" value={overview.metrics.pendingTreeRequests} note="pending"/><Metric label="Community posts" value={overview.metrics.posts}/><Metric label="Messages" value={overview.metrics.messages}/><Metric label="Rishte interests" value={overview.metrics.interests} note={`${overview.metrics.acceptedInterests} accepted`}/><Metric label="Open reports" value={overview.metrics.openReports} note={`${overview.metrics.reports} total`}/></div>
          <section className="admin-panel"><div className="section-heading"><div><span className="section-kicker">Community foundations</span><h2>What the platform is tracking</h2></div></div><div className="admin-summary-grid"><div><Icon name="account"/><h3>Identity</h3><p>Contact verification is required. Aadhaar remains optional.</p></div><div><Icon name="family"/><h3>Family graph</h3><p>Registered and invited relatives, claim codes and verified links.</p></div><div><Icon name="lock"/><h3>Privacy</h3><p>Family trees require owner approval before another member can view them.</p></div><div><Icon name="community"/><h3>Community</h3><p>Text posts, direct messages and opt-in Rishte listings.</p></div></div></section>
        </>}
      </>}
      {tab === "members" && <>
        <PageHeading icon="community" title="Members" description="Accounts and participation across the community."/>
        <form className="admin-filters" onSubmit={loadUsers}><label><span className="sr-only">Search members by name, username, email or phone</span><input placeholder="Name, username, email or phone" value={query} onChange={e => setQuery(e.target.value)}/></label><button disabled={loading}><Icon name="search"/>Search</button></form>
        {loading && !users.length && <LoadingState label="Loading members…"/>}
        {!loading && !error && !users.length && <EmptyState icon="search" title="No matching members">Try another name, username, email, or phone.</EmptyState>}
        <div className="admin-member-list">{users.map(u => <article className="admin-member" key={u.id}>
          <div className="admin-member-main"><div className="card-head"><div className="admin-member-identity"><Avatar name={u.displayName}/><div><h2>{u.displayName}</h2><p>@{u.username} <span>· {u.role}</span></p></div></div><span className={u.contactVerified ? "verify-chip" : "muted-chip"}>{u.contactVerified && <Icon name="check"/>}{u.contactVerified ? "Contact verified" : "Unverified"}</span></div>
            <div className="admin-facts"><span>{u.age ? `${u.age} yrs` : "Age unknown"}</span>{u.city && <span>{u.city}</span>}{u.occupation && <span>{u.occupation}</span>}</div>
            <dl className="admin-details"><div><dt>Contact</dt><dd>{u.email || u.phone || "Not provided"}</dd></div><div><dt>Aadhaar</dt><dd>{u.aadhaarVerified ? "Optional identity linked" : "Not linked"}</dd></div><div><dt>Rishte</dt><dd>{u.rishteActive ? "Listed" : "Not listed"}</dd></div><div><dt>Directory</dt><dd>{u.isDirectoryVisible ? "Visible" : "Hidden"}</dd></div></dl>
            <div className="admin-participation"><span><strong>{u.familyLinks}</strong> Family links</span><span><strong>{u.postCount}</strong> Posts</span><span><strong>{u.messageCount}</strong> Messages sent</span></div>
          </div>
          <div className="admin-member-actions"><span className="section-kicker">Account actions</span>{u.suspendedAt ? <button disabled={working} onClick={() => void perform(() => userAction(u.id, "RESTORE"))}>Restore</button> : <button className="danger" disabled={working} onClick={() => void perform(() => userAction(u.id, "SUSPEND"))}>Suspend</button>}{u.role === "MODERATOR" ? <button className="ghost" disabled={working} onClick={() => void perform(() => userAction(u.id, "MAKE_MEMBER"))}>Remove moderator</button> : <button className="ghost" disabled={working} onClick={() => void perform(() => userAction(u.id, "MAKE_MODERATOR"))}>Make moderator</button>}{u.isDirectoryVisible ? <button className="ghost" disabled={working} onClick={() => void perform(() => userAction(u.id, "HIDE_DIRECTORY"))}>Hide from directory</button> : <button className="ghost" disabled={working} onClick={() => void perform(() => userAction(u.id, "SHOW_DIRECTORY"))}>Show in directory</button>}</div>
        </article>)}</div>
      </>}
      {tab === "reports" && <>
        <PageHeading icon="shield" title="Reports" description="Review member and community post reports."/>
        {loading && !reports.length && <LoadingState label="Loading reports…"/>}
        {!loading && !error && !reports.length && <EmptyState icon="shield" title="No reports to review">Reports from the community will appear here.</EmptyState>}
        <div className="report-list">{reports.map(r => <article className="report-card" key={r.id}>
          <div className="card-head"><h2>{r.reason}</h2><span className="status-pill neutral">{r.status}</span></div><p className="report-author">Reported by @{r.reporter?.username}</p>
          {r.reportedUser && <p className="reported-member">Reported member <strong>@{r.reportedUser.username}</strong></p>}
          {r.post && <blockquote>{r.post.body}</blockquote>}{r.details && <p className="report-details">{r.details}</p>}
          <div className="button-row"><button disabled={working} onClick={() => void perform(() => reportAction(r.id, "REVIEW"))}><Icon name="check"/>Mark reviewed</button>{r.reportedUser && <button className="danger" disabled={working} onClick={() => void perform(() => reportAction(r.id, "SUSPEND_USER"))}>Suspend member</button>}<button className="ghost" disabled={working} onClick={() => void perform(() => reportAction(r.id, "DISMISS"))}>Dismiss</button></div>
        </article>)}</div>
      </>}
    </main>
  </div>;
}
