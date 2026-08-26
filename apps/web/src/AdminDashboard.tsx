import { FormEvent, useEffect, useState } from "react";

const TOKEN_KEY = "abbasiconnect_token";

type AdminTab = "overview" | "members" | "interests" | "reports";

type Overview = {
  generatedAt: string;
  metrics: {
    users: { total: number; active: number; paused: number; suspended: number; moderators: number; last7Days: number };
    interests: { total: number; pending: number; accepted: number; declined: number; withdrawn: number };
    shortlists: number;
    blocks: number;
    reports: { total: number; open: number; reviewed: number; actioned: number; dismissed: number };
  };
  distributions: {
    gender: Array<{ label: string; count: number }>;
    cities: Array<{ label: string; count: number }>;
    maritalStatus: Array<{ label: string; count: number }>;
  };
  recentUsers: AdminUser[];
};

type AdminUser = {
  id: string;
  displayName: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  heightCm?: number | null;
  maritalStatus?: string | null;
  education?: string;
  occupation?: string;
  profileCreatedBy?: string;
  isProfileActive: boolean;
  role: string;
  suspendedAt?: string | null;
  createdAt: string;
  verifiedAt?: string;
  identityVerified?: boolean;
  identityLast4?: string | null;
};

type AdminInterest = {
  id: string;
  status: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  sender: { displayName: string; username: string };
  receiver: { displayName: string; username: string };
};

type AdminReport = {
  id: string;
  reason: string;
  details: string;
  status: string;
  moderationNote: string;
  createdAt: string;
  reporter: { displayName: string; username: string };
  reportedUser: { displayName: string; username: string; suspendedAt?: string | null };
};

async function adminApi(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`/admin-api${path}`, { ...options, headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Admin request failed" }));
    throw new Error(data.error ?? "Admin request failed");
  }
  return response.json();
}

function pretty(value?: string | null) {
  if (!value) return "Not specified";
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Metric({ label, value, note }: { label: string; value: number; note?: string }) {
  return <article className="admin-metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

function Distribution({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  return <section className="admin-panel"><h3>{title}</h3><div className="admin-distribution">{items.length ? items.map((item) => <div key={item.label}><span>{pretty(item.label)}</span><strong>{item.count}</strong></div>) : <p className="muted">No data yet.</p>}</div></section>;
}

export default function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [interests, setInterests] = useState<AdminInterest[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadOverview() {
    setLoading(true);
    try { setOverview(await adminApi("/overview")); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load overview"); }
    finally { setLoading(false); }
  }

  async function loadUsers(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      const data = await adminApi(`/users${params.toString() ? `?${params}` : ""}`);
      setUsers(data.users);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load members"); }
    finally { setLoading(false); }
  }

  async function loadInterests() {
    setLoading(true);
    try { setInterests((await adminApi("/interests")).interests); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load interests"); }
    finally { setLoading(false); }
  }

  async function loadReports() {
    setLoading(true);
    try { setReports((await adminApi("/reports")).reports); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load reports"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadOverview(); }, []);

  function changeTab(next: AdminTab) {
    setTab(next);
    setError("");
    if (next === "overview") loadOverview();
    if (next === "members") loadUsers();
    if (next === "interests") loadInterests();
    if (next === "reports") loadReports();
  }

  async function actOnUser(user: AdminUser, action: string) {
    await adminApi(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    await loadUsers();
    if (overview) await loadOverview();
  }

  async function actOnReport(report: AdminReport, action: string) {
    const note = window.prompt("Optional admin note", "") ?? "";
    await adminApi(`/reports/${report.id}`, { method: "PATCH", body: JSON.stringify({ action, note }) });
    await loadReports();
    if (overview) await loadOverview();
  }

  return <main className="admin-shell">
    <header className="admin-topbar">
      <div><div className="admin-brand">AbbasiConnect</div><span>Administration</span></div>
      <nav>
        <button className={tab === "overview" ? "admin-nav-active" : ""} onClick={() => changeTab("overview")}>Overview</button>
        <button className={tab === "members" ? "admin-nav-active" : ""} onClick={() => changeTab("members")}>Members</button>
        <button className={tab === "interests" ? "admin-nav-active" : ""} onClick={() => changeTab("interests")}>Interests</button>
        <button className={tab === "reports" ? "admin-nav-active" : ""} onClick={() => changeTab("reports")}>Reports</button>
      </nav>
      <button className="ghost" onClick={onLogout}>Log out</button>
    </header>

    <div className="admin-page">
      {error && <div className="error panel"><button className="dismiss" onClick={() => setError("")}>×</button>{error}</div>}
      {loading && <p className="muted">Loading admin data...</p>}

      {tab === "overview" && overview && <>
        <section className="page-heading"><div><h1>Platform overview</h1><p>System-wide view of AbbasiConnect activity and profile health.</p></div><small>Updated {new Date(overview.generatedAt).toLocaleString()}</small></section>
        <div className="admin-metrics">
          <Metric label="Member accounts" value={overview.metrics.users.total} note={`${overview.metrics.users.last7Days} joined in 7 days`} />
          <Metric label="Active profiles" value={overview.metrics.users.active} />
          <Metric label="Suspended" value={overview.metrics.users.suspended} />
          <Metric label="Accepted interests" value={overview.metrics.interests.accepted} note={`${overview.metrics.interests.pending} pending`} />
          <Metric label="Shortlist saves" value={overview.metrics.shortlists} />
          <Metric label="Open reports" value={overview.metrics.reports.open} />
        </div>
        <div className="admin-overview-grid">
          <section className="admin-panel"><h3>Interest funnel</h3><div className="admin-distribution"><div><span>Total</span><strong>{overview.metrics.interests.total}</strong></div><div><span>Pending</span><strong>{overview.metrics.interests.pending}</strong></div><div><span>Accepted</span><strong>{overview.metrics.interests.accepted}</strong></div><div><span>Declined</span><strong>{overview.metrics.interests.declined}</strong></div><div><span>Withdrawn</span><strong>{overview.metrics.interests.withdrawn}</strong></div></div></section>
          <section className="admin-panel"><h3>Profile health</h3><div className="admin-distribution"><div><span>Active</span><strong>{overview.metrics.users.active}</strong></div><div><span>Paused</span><strong>{overview.metrics.users.paused}</strong></div><div><span>Suspended</span><strong>{overview.metrics.users.suspended}</strong></div><div><span>Moderators</span><strong>{overview.metrics.users.moderators}</strong></div><div><span>Blocks</span><strong>{overview.metrics.blocks}</strong></div></div></section>
          <Distribution title="Gender distribution" items={overview.distributions.gender} />
          <Distribution title="Top cities" items={overview.distributions.cities} />
          <Distribution title="Marital status" items={overview.distributions.maritalStatus} />
          <section className="admin-panel"><h3>Report status</h3><div className="admin-distribution"><div><span>Total</span><strong>{overview.metrics.reports.total}</strong></div><div><span>Open</span><strong>{overview.metrics.reports.open}</strong></div><div><span>Reviewed</span><strong>{overview.metrics.reports.reviewed}</strong></div><div><span>Actioned</span><strong>{overview.metrics.reports.actioned}</strong></div><div><span>Dismissed</span><strong>{overview.metrics.reports.dismissed}</strong></div></div></section>
        </div>
        <section className="admin-panel admin-wide"><h3>Recent registrations</h3><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Member</th><th>Age</th><th>Gender</th><th>City</th><th>Occupation</th><th>Status</th><th>Joined</th></tr></thead><tbody>{overview.recentUsers.map((user) => <tr key={user.id}><td><strong>{user.displayName}</strong><small>@{user.username}</small></td><td>{user.age ?? "—"}</td><td>{user.gender || "—"}</td><td>{user.city || "—"}</td><td>{user.occupation || "—"}</td><td>{user.suspendedAt ? "Suspended" : user.isProfileActive ? "Active" : "Paused"}</td><td>{new Date(user.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div></section>
      </>}

      {tab === "members" && <>
        <section className="page-heading"><div><h1>Members</h1><p>Search every matrimonial account and manage platform access.</p></div></section>
        <form className="admin-filters" onSubmit={loadUsers}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, username, email, phone, city, occupation" /><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All accounts</option><option value="active">Active</option><option value="paused">Paused</option><option value="suspended">Suspended</option></select><button type="submit">Search</button></form>
        <div className="admin-member-list">{users.map((user) => <article className="admin-member" key={user.id}><div className="admin-member-main"><div><h3>{user.displayName}</h3><p>@{user.username} · {user.role}</p></div><div className="facts"><span>{user.age ? `${user.age} years` : "Age unknown"}</span>{user.gender && <span>{user.gender}</span>}{user.maritalStatus && <span>{pretty(user.maritalStatus)}</span>}{user.city && <span>{user.city}</span>}</div><p><strong>Occupation</strong> {user.occupation || "Not specified"}</p><p><strong>Contact</strong> {user.email || "No email"}{user.phone ? ` · ${user.phone}` : ""}</p><p><strong>Identity</strong> {user.identityVerified ? "Aadhaar-linked" : "Not linked"}{user.identityLast4 ? ` · ending ${user.identityLast4}` : ""}</p><p><strong>Joined</strong> {new Date(user.createdAt).toLocaleString()}</p></div><div className="admin-member-actions"><span className={`status-pill ${user.suspendedAt ? "" : user.isProfileActive ? "matched" : "incoming"}`}>{user.suspendedAt ? "Suspended" : user.isProfileActive ? "Active" : "Paused"}</span>{user.suspendedAt ? <button onClick={() => actOnUser(user, "RESTORE")}>Restore account</button> : <button className="danger" onClick={() => actOnUser(user, "SUSPEND")}>Suspend account</button>}{user.isProfileActive ? <button className="ghost" onClick={() => actOnUser(user, "PAUSE")}>Hide profile</button> : <button className="ghost" onClick={() => actOnUser(user, "ACTIVATE")}>Show profile</button>}{user.role === "MODERATOR" ? <button className="ghost" onClick={() => actOnUser(user, "MAKE_MEMBER")}>Remove moderator</button> : <button className="ghost" onClick={() => actOnUser(user, "MAKE_MODERATOR")}>Make moderator</button>}</div></article>)}</div>
      </>}

      {tab === "interests" && <>
        <section className="page-heading"><div><h1>Interest activity</h1><p>Birds-eye view of requests and accepted connections across the platform.</p></div></section>
        <div className="admin-feed">{interests.map((item) => <article className="admin-interest" key={item.id}><div><span className={`status-pill ${item.status === "ACCEPTED" ? "matched" : item.status === "PENDING" ? "incoming" : ""}`}>{pretty(item.status)}</span><h3>@{item.sender.username} → @{item.receiver.username}</h3><p>{item.sender.displayName} sent interest to {item.receiver.displayName}</p>{item.message && <blockquote>{item.message}</blockquote>}</div><small>{new Date(item.updatedAt).toLocaleString()}</small></article>)}</div>
      </>}

      {tab === "reports" && <>
        <section className="page-heading"><div><h1>Reports</h1><p>Review complaints and take platform-level moderation action.</p></div></section>
        <div className="report-list">{reports.map((report) => <article className="report-card" key={report.id}><div><strong>{pretty(report.reason)}</strong> · {pretty(report.status)}</div><p>Reported <strong>@{report.reportedUser.username}</strong> by @{report.reporter.username}</p>{report.details && <blockquote>{report.details}</blockquote>}{report.moderationNote && <p><strong>Admin note</strong> {report.moderationNote}</p>}<div className="card-actions"><button onClick={() => actOnReport(report, "REVIEW")}>Mark reviewed</button><button className="danger" onClick={() => actOnReport(report, "SUSPEND_USER")}>Suspend member</button><button className="ghost" onClick={() => actOnReport(report, "RESTORE_USER")}>Restore</button><button className="ghost" onClick={() => actOnReport(report, "DISMISS")}>Dismiss</button></div></article>)}</div>
      </>}
    </div>
  </main>;
}
