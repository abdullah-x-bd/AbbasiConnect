import { FormEvent, useEffect, useMemo, useState } from "react";

type Role = "MEMBER" | "MODERATOR" | "ADMIN";
type Relationship = { status: string; direction: "OUTGOING" | "INCOMING" | null; interestId: string | null };
type Profile = {
  id: string;
  displayName: string;
  username: string;
  age?: number | null;
  gender?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  heightCm?: number | null;
  maritalStatus?: string | null;
  education: string;
  occupation: string;
  profileCreatedBy: string;
  about: string;
  familyDetails: string;
  languages: string;
  interests: string;
  preferredMinAge?: number | null;
  preferredMaxAge?: number | null;
  preferredMinHeightCm?: number | null;
  preferredMaxHeightCm?: number | null;
  preferredLocations: string;
  preferredEducation: string;
  preferredOccupation: string;
  partnerNotes: string;
  isProfileActive: boolean;
  verifiedAt?: string;
  relationship?: Relationship;
  shortlisted?: boolean;
  contact?: { email?: string | null; phone?: string | null } | null;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  role?: Role;
};

type InterestItem = {
  id: string;
  status: string;
  message: string;
  createdAt: string;
  profile: Profile;
  contact?: { email?: string | null; phone?: string | null } | null;
};

type Report = {
  id: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
  reporter: { id: string; displayName: string; username: string };
  reportedUser: { id: string; displayName: string; username: string; suspendedAt?: string | null };
};

type Tab = "browse" | "interests" | "shortlist" | "me" | "moderation";
type EntryMode = "home" | "register" | "signin";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const TOKEN_KEY = "abbasiconnect_token";
const maritalStatuses = [
  ["NEVER_MARRIED", "Never married"],
  ["DIVORCED", "Divorced"],
  ["WIDOWED", "Widowed"],
  ["ANNULLED", "Annulled"],
  ["SEPARATED", "Separated"],
];

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

function prettyStatus(value?: string | null) {
  if (!value) return "Not specified";
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function locationOf(profile: Profile) {
  return [profile.city, profile.state, profile.country].filter(Boolean).join(", ");
}

export default function App() {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entryMode, setEntryMode] = useState<EntryMode>("home");
  const [tab, setTab] = useState<Tab>("browse");
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerStep, setRegisterStep] = useState(1);
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [identityName, setIdentityName] = useState("");
  const [reference, setReference] = useState("");
  const [last4, setLast4] = useState("");
  const [registrationToken, setRegistrationToken] = useState("");
  const [reg, setReg] = useState({
    displayName: "", username: "", password: "", confirmPassword: "", email: "", phone: "",
    dateOfBirth: "", gender: "", city: "", state: "", country: "India", heightCm: "",
    maritalStatus: "NEVER_MARRIED", education: "", occupation: "", profileCreatedBy: "SELF",
    about: "", familyDetails: "", languages: "", interests: "",
  });

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filters, setFilters] = useState({ q: "", gender: "", city: "", maritalStatus: "", minAge: "", maxAge: "" });
  const [received, setReceived] = useState<InterestItem[]>([]);
  const [sent, setSent] = useState<InterestItem[]>([]);
  const [shortlist, setShortlist] = useState<Profile[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<any>({});

  const registerAge = useMemo(() => {
    if (!reg.dateOfBirth) return null;
    const date = new Date(`${reg.dateOfBirth}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const m = today.getMonth() - date.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < date.getDate())) age -= 1;
    return age;
  }, [reg.dateOfBirth]);

  const canModerate = user?.role === "MODERATOR" || user?.role === "ADMIN";

  async function refreshMe() {
    const me = await api("/auth/me");
    setUser(me);
    setEdit({
      ...me,
      heightCm: me.heightCm ?? "",
      preferredMinAge: me.preferredMinAge ?? "",
      preferredMaxAge: me.preferredMaxAge ?? "",
      preferredMinHeightCm: me.preferredMinHeightCm ?? "",
      preferredMaxHeightCm: me.preferredMaxHeightCm ?? "",
    });
  }

  async function browseProfiles(event?: FormEvent) {
    event?.preventDefault();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    const data = await api(`/profiles/browse${params.toString() ? `?${params}` : ""}`);
    setProfiles(data.profiles);
  }

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    Promise.all([api("/auth/me"), api("/profiles/browse")])
      .then(([me, browse]) => {
        setUser(me);
        setEdit({ ...me });
        setProfiles(browse.profiles);
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("/auth/sign-in", { method: "POST", body: JSON.stringify({ username: loginUsername.toLowerCase(), password: loginPassword }) });
      localStorage.setItem(TOKEN_KEY, data.token);
      await refreshMe();
      await browseProfiles();
      setTab("browse");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  async function scanAadhaar(event: FormEvent) {
    event.preventDefault();
    if (!aadhaarFile) return;
    setError("");
    setScanning(true);
    try {
      const imageDataUrl = await readImage(aadhaarFile);
      const data = await api("/auth/dev-aadhaar/scan", { method: "POST", body: JSON.stringify({ fileName: aadhaarFile.name, imageDataUrl }) });
      setIdentityName(data.extracted?.displayName ?? "");
      setReg((current) => ({ ...current, displayName: data.extracted?.displayName ?? current.displayName }));
      setRegisterStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read Aadhaar card");
    } finally {
      setScanning(false);
    }
  }

  async function verifyAadhaar(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("/auth/dev-aadhaar/verify", {
        method: "POST",
        body: JSON.stringify({ identityName, reference, last4: last4 || undefined }),
      });
      setRegistrationToken(data.registrationToken);
      setRegisterStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    }
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (reg.password !== reg.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    try {
      const payload = {
        registrationToken,
        displayName: reg.displayName,
        username: reg.username.toLowerCase(),
        password: reg.password,
        email: reg.email || undefined,
        phone: reg.phone || undefined,
        dateOfBirth: reg.dateOfBirth,
        gender: reg.gender,
        city: reg.city || undefined,
        state: reg.state || undefined,
        country: reg.country,
        heightCm: reg.heightCm ? Number(reg.heightCm) : undefined,
        maritalStatus: reg.maritalStatus,
        education: reg.education,
        occupation: reg.occupation,
        profileCreatedBy: reg.profileCreatedBy,
        about: reg.about,
        familyDetails: reg.familyDetails,
        languages: reg.languages,
        interests: reg.interests,
      };
      const data = await api("/auth/register", { method: "POST", body: JSON.stringify(payload) });
      localStorage.setItem(TOKEN_KEY, data.token);
      await refreshMe();
      await browseProfiles();
      setTab("browse");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account creation failed");
    }
  }

  async function openProfile(profile: Profile) {
    try {
      const data = await api(`/profiles/${encodeURIComponent(profile.username)}`);
      setSelectedProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load profile");
    }
  }

  async function sendInterest(profile: Profile) {
    const message = window.prompt("Optional short note with your interest", "") ?? "";
    try {
      const data = await api(`/profiles/${profile.id}/interest`, { method: "POST", body: JSON.stringify({ message }) });
      if (data.matched) window.alert("Mutual interest. Contact details are now available to both of you.");
      await browseProfiles();
      if (selectedProfile?.id === profile.id) await openProfile(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send interest");
    }
  }

  async function toggleShortlist(profile: Profile) {
    await api(`/profiles/${profile.id}/shortlist`, { method: profile.shortlisted ? "DELETE" : "POST" });
    setProfiles((items) => items.map((item) => item.id === profile.id ? { ...item, shortlisted: !profile.shortlisted } : item));
    if (selectedProfile?.id === profile.id) setSelectedProfile({ ...selectedProfile, shortlisted: !profile.shortlisted });
    if (tab === "shortlist") await loadShortlist();
  }

  async function loadInterests() {
    const data = await api("/interests");
    setReceived(data.received);
    setSent(data.sent);
  }

  async function actOnInterest(id: string, action: "ACCEPT" | "DECLINE" | "WITHDRAW") {
    await api(`/interests/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    await loadInterests();
    await browseProfiles();
  }

  async function loadShortlist() {
    const data = await api("/shortlist");
    setShortlist(data.profiles);
  }

  async function reportProfile(profile: Profile) {
    const details = window.prompt("Tell us what is wrong with this profile", "");
    if (details === null) return;
    await api("/reports", { method: "POST", body: JSON.stringify({ reportedUserId: profile.id, reason: "OTHER", details }) });
    window.alert("Profile reported to moderation.");
  }

  async function blockProfile(profile: Profile) {
    if (!window.confirm(`Block @${profile.username}? Interests and shortlist links between you will be removed.`)) return;
    await api(`/profiles/${profile.id}/block`, { method: "POST" });
    setSelectedProfile(null);
    await browseProfiles();
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setError("");
    const numericOrNull = (value: any) => value === "" || value == null ? null : Number(value);
    try {
      const payload = {
        displayName: edit.displayName,
        username: String(edit.username).toLowerCase(),
        email: edit.email || undefined,
        phone: edit.phone || undefined,
        gender: edit.gender,
        city: edit.city || undefined,
        state: edit.state || undefined,
        country: edit.country || "India",
        heightCm: numericOrNull(edit.heightCm),
        maritalStatus: edit.maritalStatus,
        education: edit.education || "",
        occupation: edit.occupation || "",
        profileCreatedBy: edit.profileCreatedBy || "SELF",
        about: edit.about || "",
        familyDetails: edit.familyDetails || "",
        languages: edit.languages || "",
        interests: edit.interests || "",
        preferredMinAge: numericOrNull(edit.preferredMinAge),
        preferredMaxAge: numericOrNull(edit.preferredMaxAge),
        preferredMinHeightCm: numericOrNull(edit.preferredMinHeightCm),
        preferredMaxHeightCm: numericOrNull(edit.preferredMaxHeightCm),
        preferredLocations: edit.preferredLocations || "",
        preferredEducation: edit.preferredEducation || "",
        preferredOccupation: edit.preferredOccupation || "",
        partnerNotes: edit.partnerNotes || "",
        isProfileActive: Boolean(edit.isProfileActive),
      };
      const data = await api("/profiles/me", { method: "PATCH", body: JSON.stringify(payload) });
      setUser(data);
      setEdit({ ...data });
      setEditing(false);
      await browseProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    }
  }

  async function loadModeration() {
    const data = await api("/moderation/reports");
    setReports(data.reports);
  }

  async function moderate(report: Report, action: string) {
    const note = window.prompt("Optional moderator note", "") ?? "";
    await api(`/moderation/reports/${report.id}`, { method: "PATCH", body: JSON.stringify({ action, note }) });
    await loadModeration();
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setProfiles([]);
    setSelectedProfile(null);
    setEntryMode("home");
  }

  function changeTab(next: Tab) {
    setSelectedProfile(null);
    setTab(next);
    setError("");
    if (next === "browse") browseProfiles();
    if (next === "interests") loadInterests();
    if (next === "shortlist") loadShortlist();
    if (next === "moderation") loadModeration();
  }

  if (loading) return <main className="center-screen">Loading AbbasiConnect...</main>;

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card wide-auth">
          <div className="brand-mark">AC</div>
          <h1>AbbasiConnect</h1>
          <p className="muted">Verified, text-only matrimonial profiles. No photos.</p>

          {entryMode === "home" && (
            <div className="entry-grid">
              <button className="entry-choice" onClick={() => { setEntryMode("register"); setRegisterStep(1); setError(""); }}>
                <strong>Register</strong><span>Create an Aadhaar-linked matrimonial profile</span>
              </button>
              <button className="entry-choice secondary" onClick={() => { setEntryMode("signin"); setError(""); }}>
                <strong>Sign in</strong><span>Use your username and password</span>
              </button>
            </div>
          )}

          {entryMode === "signin" && (
            <form className="stack" onSubmit={signIn}>
              <div className="step-label">Sign in</div>
              <label>Username<input value={loginUsername} onChange={(event) => setLoginUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} placeholder="username" required /></label>
              <label>Password<input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required /></label>
              {error && <p className="error">{error}</p>}
              <div className="button-row"><button type="button" className="ghost" onClick={() => setEntryMode("home")}>Back</button><button type="submit">Sign in</button></div>
            </form>
          )}

          {entryMode === "register" && registerStep === 1 && (
            <form className="stack" onSubmit={scanAadhaar}>
              <div className="step-label">Register · step 1 of 3</div>
              <h2>Verify identity</h2>
              <label>Aadhaar card image<input type="file" accept="image/*" onChange={(event) => setAadhaarFile(event.target.files?.[0] ?? null)} required /></label>
              <p className="fine-print">The Aadhaar image is temporary verification input only. AbbasiConnect matrimonial profiles never contain photos.</p>
              {error && <p className="error">{error}</p>}
              <div className="button-row"><button type="button" className="ghost" onClick={() => setEntryMode("home")}>Back</button><button type="submit" disabled={!aadhaarFile || scanning}>{scanning ? "Reading card..." : "Read Aadhaar"}</button></div>
            </form>
          )}

          {entryMode === "register" && registerStep === 2 && (
            <form className="stack" onSubmit={verifyAadhaar}>
              <div className="step-label">Register · step 2 of 3</div>
              <h2>Confirm identity</h2>
              <label>Name read from Aadhaar<input value={identityName} onChange={(event) => { setIdentityName(event.target.value); setReg((current) => ({ ...current, displayName: event.target.value })); }} required /></label>
              <label>Development verification reference<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="DEV-ABBASI-001" minLength={4} required /></label>
              <label>Aadhaar last 4, optional in development<input value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" /></label>
              {error && <p className="error">{error}</p>}
              <div className="button-row"><button type="button" className="ghost" onClick={() => setRegisterStep(1)}>Back</button><button type="submit">Verify identity</button></div>
            </form>
          )}

          {entryMode === "register" && registerStep === 3 && (
            <form className="stack" onSubmit={createAccount}>
              <div className="step-label">Register · step 3 of 3</div>
              <h2>Create matrimonial profile</h2>
              <p className="verified-banner">Identity verified for <strong>{identityName}</strong></p>
              <div className="form-grid two">
                <label>Display name<input value={reg.displayName} onChange={(e) => setReg({ ...reg, displayName: e.target.value })} required /></label>
                <label>Username<input value={reg.username} onChange={(e) => setReg({ ...reg, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })} required minLength={3} /></label>
                <label>Date of birth<input type="date" value={reg.dateOfBirth} onChange={(e) => setReg({ ...reg, dateOfBirth: e.target.value })} required /></label>
                <label>Age<input value={registerAge ?? ""} readOnly placeholder="Calculated from DOB" /></label>
                <label>Gender<select value={reg.gender} onChange={(e) => setReg({ ...reg, gender: e.target.value })} required><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label>
                <label>Marital status<select value={reg.maritalStatus} onChange={(e) => setReg({ ...reg, maritalStatus: e.target.value })}>{maritalStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>Height in cm<input type="number" min="120" max="230" value={reg.heightCm} onChange={(e) => setReg({ ...reg, heightCm: e.target.value })} /></label>
                <label>Profile created by<select value={reg.profileCreatedBy} onChange={(e) => setReg({ ...reg, profileCreatedBy: e.target.value })}><option value="SELF">Self</option><option value="PARENT">Parent</option><option value="FAMILY">Family</option><option value="GUARDIAN">Guardian</option></select></label>
                <label>Education<input value={reg.education} onChange={(e) => setReg({ ...reg, education: e.target.value })} required /></label>
                <label>Occupation<input value={reg.occupation} onChange={(e) => setReg({ ...reg, occupation: e.target.value })} required /></label>
                <label>Email<input type="email" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} /></label>
                <label>Contact number<input value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} placeholder="+91..." /></label>
                <label>City<input value={reg.city} onChange={(e) => setReg({ ...reg, city: e.target.value })} /></label>
                <label>State<input value={reg.state} onChange={(e) => setReg({ ...reg, state: e.target.value })} /></label>
                <label>Country<input value={reg.country} onChange={(e) => setReg({ ...reg, country: e.target.value })} required /></label>
                <label>Languages<input value={reg.languages} onChange={(e) => setReg({ ...reg, languages: e.target.value })} placeholder="English, Hindi, Urdu" /></label>
              </div>
              <label>About you<textarea rows={4} value={reg.about} onChange={(e) => setReg({ ...reg, about: e.target.value })} placeholder="A short introduction" /></label>
              <label>Family details<textarea rows={3} value={reg.familyDetails} onChange={(e) => setReg({ ...reg, familyDetails: e.target.value })} /></label>
              <label>Interests<textarea rows={2} value={reg.interests} onChange={(e) => setReg({ ...reg, interests: e.target.value })} /></label>
              <div className="form-grid two">
                <label>Password<input type="password" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} minLength={8} required /></label>
                <label>Confirm password<input type="password" value={reg.confirmPassword} onChange={(e) => setReg({ ...reg, confirmPassword: e.target.value })} minLength={8} required /></label>
              </div>
              <p className="fine-print">At least one of email or contact number is required. Contact details stay private until an interest is accepted.</p>
              {error && <p className="error">{error}</p>}
              <div className="button-row"><button type="button" className="ghost" onClick={() => setRegisterStep(2)}>Back</button><button type="submit">Create profile</button></div>
            </form>
          )}
        </section>
      </main>
    );
  }

  function ProfileCard({ profile }: { profile: Profile }) {
    const relation = profile.relationship;
    return (
      <article className="match-card">
        <div className="match-head">
          <div>
            <button className="name-link" onClick={() => openProfile(profile)}>{profile.displayName}</button>
            <div className="handle">@{profile.username} · Aadhaar-linked identity</div>
          </div>
          <button className={profile.shortlisted ? "bookmark active" : "bookmark"} onClick={() => toggleShortlist(profile)}>{profile.shortlisted ? "Shortlisted" : "Shortlist"}</button>
        </div>
        <div className="facts">
          {profile.age && <span>{profile.age} years</span>}
          {profile.heightCm && <span>{profile.heightCm} cm</span>}
          {profile.maritalStatus && <span>{prettyStatus(profile.maritalStatus)}</span>}
          {locationOf(profile) && <span>{locationOf(profile)}</span>}
        </div>
        <div className="profile-lines"><p><strong>Education</strong> {profile.education || "Not specified"}</p><p><strong>Occupation</strong> {profile.occupation || "Not specified"}</p></div>
        {profile.about && <p className="about-preview">{profile.about}</p>}
        <div className="card-actions">
          <button className="ghost" onClick={() => openProfile(profile)}>View profile</button>
          {relation?.status === "NONE" && <button onClick={() => sendInterest(profile)}>Send interest</button>}
          {relation?.status === "PENDING" && relation.direction === "OUTGOING" && <span className="status-pill">Interest sent</span>}
          {relation?.status === "PENDING" && relation.direction === "INCOMING" && <span className="status-pill incoming">Interested in you</span>}
          {relation?.status === "ACCEPTED" && <span className="status-pill matched">Mutual interest</span>}
        </div>
      </article>
    );
  }

  if (selectedProfile) {
    const p = selectedProfile;
    return (
      <main className="app-shell">
        <Header />
        <div className="page-wrap narrow">
          <button className="ghost" onClick={() => setSelectedProfile(null)}>← Back</button>
          <section className="profile-detail">
            <div className="profile-title-row"><div><h1>{p.displayName}</h1><p className="handle">@{p.username} · verified identity</p></div><button className={p.shortlisted ? "bookmark active" : "bookmark"} onClick={() => toggleShortlist(p)}>{p.shortlisted ? "Shortlisted" : "Shortlist"}</button></div>
            <div className="facts large">
              {p.age && <span>{p.age} years</span>}{p.heightCm && <span>{p.heightCm} cm</span>}{p.gender && <span>{p.gender}</span>}{p.maritalStatus && <span>{prettyStatus(p.maritalStatus)}</span>}{locationOf(p) && <span>{locationOf(p)}</span>}
            </div>
            <Detail title="Education" value={p.education} />
            <Detail title="Occupation" value={p.occupation} />
            <Detail title="About" value={p.about} />
            <Detail title="Family" value={p.familyDetails} />
            <Detail title="Languages" value={p.languages} />
            <Detail title="Interests" value={p.interests} />
            <Detail title="Profile created by" value={prettyStatus(p.profileCreatedBy)} />
            <div className="detail-section"><h3>Partner preferences</h3><p>Age {p.preferredMinAge || "any"} to {p.preferredMaxAge || "any"}</p><p>Height {p.preferredMinHeightCm || "any"} to {p.preferredMaxHeightCm || "any"} cm</p><p>Locations {p.preferredLocations || "No preference listed"}</p><p>Education {p.preferredEducation || "No preference listed"}</p><p>Occupation {p.preferredOccupation || "No preference listed"}</p>{p.partnerNotes && <p>{p.partnerNotes}</p>}</div>
            {p.contact && <div className="contact-box"><h3>Contact unlocked</h3><p>This profile has accepted mutual interest with you.</p>{p.contact.email && <p><strong>Email</strong> {p.contact.email}</p>}{p.contact.phone && <p><strong>Phone</strong> {p.contact.phone}</p>}</div>}
            <div className="card-actions prominent">
              {p.relationship?.status === "NONE" && <button onClick={() => sendInterest(p)}>Send interest</button>}
              {p.relationship?.status === "PENDING" && p.relationship.direction === "OUTGOING" && <span className="status-pill">Interest sent</span>}
              {p.relationship?.status === "PENDING" && p.relationship.direction === "INCOMING" && <><button onClick={() => actOnInterest(p.relationship!.interestId!, "ACCEPT")}>Accept interest</button><button className="ghost" onClick={() => actOnInterest(p.relationship!.interestId!, "DECLINE")}>Decline</button></>}
              {p.relationship?.status === "ACCEPTED" && <span className="status-pill matched">Mutual interest</span>}
              <button className="ghost danger" onClick={() => reportProfile(p)}>Report</button><button className="ghost danger" onClick={() => blockProfile(p)}>Block</button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  function Header() {
    return (
      <header className="topbar">
        <button className="brand-button" onClick={() => changeTab("browse")}>AbbasiConnect</button>
        <nav className="nav-tabs">
          <button className={tab === "browse" ? "nav-active" : ""} onClick={() => changeTab("browse")}>Browse</button>
          <button className={tab === "interests" ? "nav-active" : ""} onClick={() => changeTab("interests")}>Interests</button>
          <button className={tab === "shortlist" ? "nav-active" : ""} onClick={() => changeTab("shortlist")}>Shortlist</button>
          <button className={tab === "me" ? "nav-active" : ""} onClick={() => changeTab("me")}>My profile</button>
          {canModerate && <button className={tab === "moderation" ? "nav-active" : ""} onClick={() => changeTab("moderation")}>Moderation</button>}
        </nav>
        <button className="ghost" onClick={logout}>Log out</button>
      </header>
    );
  }

  return (
    <main className="app-shell">
      <Header />
      <div className="page-wrap">
        {error && <div className="error panel"><button className="dismiss" onClick={() => setError("")}>×</button>{error}</div>}

        {tab === "browse" && <>
          <section className="page-heading"><div><h1>Browse profiles</h1><p>Verified text-only matrimonial profiles. No photographs.</p></div></section>
          <form className="filters" onSubmit={browseProfiles}>
            <input placeholder="Name, city, education, occupation" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
            <select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}><option value="">Any gender</option><option>Male</option><option>Female</option><option>Other</option></select>
            <input placeholder="City" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} />
            <select value={filters.maritalStatus} onChange={(e) => setFilters({ ...filters, maritalStatus: e.target.value })}><option value="">Any marital status</option>{maritalStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input type="number" min="18" max="100" placeholder="Min age" value={filters.minAge} onChange={(e) => setFilters({ ...filters, minAge: e.target.value })} />
            <input type="number" min="18" max="100" placeholder="Max age" value={filters.maxAge} onChange={(e) => setFilters({ ...filters, maxAge: e.target.value })} />
            <button type="submit">Apply filters</button>
          </form>
          <div className="match-grid">{profiles.length ? profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} />) : <div className="empty-state"><h3>No profiles found</h3><p>Try broadening your filters.</p></div>}</div>
        </>}

        {tab === "interests" && <section><div className="page-heading"><div><h1>Interests</h1><p>Requests, responses and mutual interests.</p></div></div>
          <h2>Received</h2><div className="interest-list">{received.length ? received.map((item) => <InterestRow key={item.id} item={item} received />) : <p className="muted">No interests received yet.</p>}</div>
          <h2 className="section-gap">Sent</h2><div className="interest-list">{sent.length ? sent.map((item) => <InterestRow key={item.id} item={item} />) : <p className="muted">No interests sent yet.</p>}</div>
        </section>}

        {tab === "shortlist" && <section><div className="page-heading"><div><h1>Shortlist</h1><p>Profiles you saved for later.</p></div></div><div className="match-grid">{shortlist.length ? shortlist.map((profile) => <ProfileCard key={profile.id} profile={profile} />) : <div className="empty-state"><h3>Your shortlist is empty</h3></div>}</div></section>}

        {tab === "me" && user && <section className="profile-detail">
          <div className="profile-title-row"><div><h1>{user.displayName}</h1><p className="handle">@{user.username} · your private account and matrimonial profile</p></div><button onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit profile"}</button></div>
          {!editing ? <>
            <div className="facts large"><span>{user.age} years</span>{user.heightCm && <span>{user.heightCm} cm</span>}<span>{prettyStatus(user.maritalStatus)}</span>{locationOf(user) && <span>{locationOf(user)}</span>}</div>
            <Detail title="Education" value={user.education} /><Detail title="Occupation" value={user.occupation} /><Detail title="About" value={user.about} /><Detail title="Family" value={user.familyDetails} /><Detail title="Languages" value={user.languages} /><Detail title="Interests" value={user.interests} />
            <div className="detail-section"><h3>Private account details</h3><p><strong>Email</strong> {user.email || "Not provided"}</p><p><strong>Phone</strong> {user.phone || "Not provided"}</p><p><strong>Date of birth</strong> {user.dateOfBirth || "Not provided"}</p><p><strong>Aadhaar identity</strong> Verified and linked</p></div>
            <div className="detail-section"><h3>Partner preferences</h3><p>Age {user.preferredMinAge || "any"} to {user.preferredMaxAge || "any"}</p><p>Preferred locations {user.preferredLocations || "Not set"}</p><p>{user.partnerNotes || "No additional preference notes"}</p></div>
            <p className={user.isProfileActive ? "active-state" : "inactive-state"}>{user.isProfileActive ? "Profile is visible in browse" : "Profile is paused and hidden from browse"}</p>
          </> : <ProfileEditor />}
        </section>}

        {tab === "moderation" && canModerate && <section><div className="page-heading"><div><h1>Moderation</h1><p>Review reported matrimonial profiles.</p></div></div><div className="report-list">{reports.map((report) => <article className="report-card" key={report.id}><div><strong>{report.reason}</strong> · {report.status}</div><p>Reported profile <strong>@{report.reportedUser.username}</strong></p><p>Reporter @{report.reporter.username}</p>{report.details && <blockquote>{report.details}</blockquote>}<div className="card-actions"><button onClick={() => moderate(report, "REVIEW")}>Mark reviewed</button><button onClick={() => moderate(report, "SUSPEND_USER")}>Suspend profile</button><button className="ghost" onClick={() => moderate(report, "RESTORE_USER")}>Restore</button><button className="ghost" onClick={() => moderate(report, "DISMISS")}>Dismiss</button></div></article>)}</div></section>}
      </div>
    </main>
  );

  function InterestRow({ item, received: isReceived = false }: { item: InterestItem; received?: boolean }) {
    return <article className="interest-row"><button className="member-main" onClick={() => openProfile(item.profile)}><strong>{item.profile.displayName}</strong><span>@{item.profile.username}</span><small>{item.profile.age ? `${item.profile.age} years · ` : ""}{item.profile.occupation}{locationOf(item.profile) ? ` · ${locationOf(item.profile)}` : ""}</small></button><div className="interest-side"><span className={`status-pill ${item.status === "ACCEPTED" ? "matched" : ""}`}>{prettyStatus(item.status)}</span>{item.message && <small>“{item.message}”</small>}{item.contact && <small>{item.contact.email || ""} {item.contact.phone || ""}</small>}{isReceived && item.status === "PENDING" && <div className="button-row"><button onClick={() => actOnInterest(item.id, "ACCEPT")}>Accept</button><button className="ghost" onClick={() => actOnInterest(item.id, "DECLINE")}>Decline</button></div>}{!isReceived && item.status === "PENDING" && <button className="ghost" onClick={() => actOnInterest(item.id, "WITHDRAW")}>Withdraw</button>}</div></article>;
  }

  function ProfileEditor() {
    const set = (key: string, value: any) => setEdit((current: any) => ({ ...current, [key]: value }));
    return <form className="stack" onSubmit={saveProfile}>
      <div className="form-grid two">
        <label>Display name<input value={edit.displayName || ""} onChange={(e) => set("displayName", e.target.value)} required /></label>
        <label>Username<input value={edit.username || ""} onChange={(e) => set("username", e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} required /></label>
        <label>Email<input type="email" value={edit.email || ""} onChange={(e) => set("email", e.target.value)} /></label>
        <label>Contact number<input value={edit.phone || ""} onChange={(e) => set("phone", e.target.value)} /></label>
        <label>Gender<select value={edit.gender || ""} onChange={(e) => set("gender", e.target.value)}><option>Male</option><option>Female</option><option>Other</option></select></label>
        <label>Marital status<select value={edit.maritalStatus || "NEVER_MARRIED"} onChange={(e) => set("maritalStatus", e.target.value)}>{maritalStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Height cm<input type="number" min="120" max="230" value={edit.heightCm ?? ""} onChange={(e) => set("heightCm", e.target.value)} /></label>
        <label>Profile created by<select value={edit.profileCreatedBy || "SELF"} onChange={(e) => set("profileCreatedBy", e.target.value)}><option value="SELF">Self</option><option value="PARENT">Parent</option><option value="FAMILY">Family</option><option value="GUARDIAN">Guardian</option></select></label>
        <label>Education<input value={edit.education || ""} onChange={(e) => set("education", e.target.value)} /></label>
        <label>Occupation<input value={edit.occupation || ""} onChange={(e) => set("occupation", e.target.value)} /></label>
        <label>City<input value={edit.city || ""} onChange={(e) => set("city", e.target.value)} /></label>
        <label>State<input value={edit.state || ""} onChange={(e) => set("state", e.target.value)} /></label>
        <label>Country<input value={edit.country || "India"} onChange={(e) => set("country", e.target.value)} /></label>
        <label>Languages<input value={edit.languages || ""} onChange={(e) => set("languages", e.target.value)} /></label>
      </div>
      <label>About<textarea rows={5} value={edit.about || ""} onChange={(e) => set("about", e.target.value)} /></label>
      <label>Family details<textarea rows={4} value={edit.familyDetails || ""} onChange={(e) => set("familyDetails", e.target.value)} /></label>
      <label>Interests<textarea rows={3} value={edit.interests || ""} onChange={(e) => set("interests", e.target.value)} /></label>
      <h3>Partner preferences</h3>
      <div className="form-grid two">
        <label>Minimum age<input type="number" min="18" max="100" value={edit.preferredMinAge ?? ""} onChange={(e) => set("preferredMinAge", e.target.value)} /></label>
        <label>Maximum age<input type="number" min="18" max="100" value={edit.preferredMaxAge ?? ""} onChange={(e) => set("preferredMaxAge", e.target.value)} /></label>
        <label>Minimum height cm<input type="number" min="120" max="230" value={edit.preferredMinHeightCm ?? ""} onChange={(e) => set("preferredMinHeightCm", e.target.value)} /></label>
        <label>Maximum height cm<input type="number" min="120" max="230" value={edit.preferredMaxHeightCm ?? ""} onChange={(e) => set("preferredMaxHeightCm", e.target.value)} /></label>
        <label>Preferred locations<input value={edit.preferredLocations || ""} onChange={(e) => set("preferredLocations", e.target.value)} /></label>
        <label>Preferred education<input value={edit.preferredEducation || ""} onChange={(e) => set("preferredEducation", e.target.value)} /></label>
        <label>Preferred occupation<input value={edit.preferredOccupation || ""} onChange={(e) => set("preferredOccupation", e.target.value)} /></label>
      </div>
      <label>Additional partner preference notes<textarea rows={4} value={edit.partnerNotes || ""} onChange={(e) => set("partnerNotes", e.target.value)} /></label>
      <label className="toggle-row"><input type="checkbox" checked={Boolean(edit.isProfileActive)} onChange={(e) => set("isProfileActive", e.target.checked)} />Show my profile in browse</label>
      <button type="submit">Save profile</button>
    </form>;
  }
}

function Detail({ title, value }: { title: string; value?: string | null }) {
  if (!value) return null;
  return <div className="detail-section"><h3>{title}</h3><p>{value}</p></div>;
}
