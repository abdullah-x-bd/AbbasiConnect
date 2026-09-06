import { useEffect, useState } from "react";
import type { Member, Module } from "./App";
import { onRealtime } from "./realtime";
import { Avatar, EmptyState, Icon, LoadingState, PageHeading } from "./ui";

const truncate = (value: string, max = 115) => {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};
const API_URL = import.meta.env.VITE_API_URL ?? "/api";
async function summaryApi(path: string) {
  const token = localStorage.getItem("abbasiconnect_token");
  const response = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error("Request failed");
  return response.json();
}

export default function Home({ member, open }: { member: Member; open: (module: Module) => void }) {
  const [summaries, setSummaries] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let alive = true;
    const paths: Record<string, string> = { community: "/community/feed", family: "/family/me", rishte: "/rishte/me", messages: "/messages-secure/threads" };
    async function refresh(type: string) {
      if (!paths[type]) return;
      try {
        const result = await summaryApi(paths[type]);
        if (alive) { setSummaries(current => ({ ...current, [type]: result })); setErrors(current => ({ ...current, [type]: false })); }
      } catch { if (alive) setErrors(current => ({ ...current, [type]: true })); }
    }
    Object.keys(paths).forEach(type => { void refresh(type); });
    const unsubscribe = onRealtime(detail => { if (detail?.type) void refresh(detail.type); });
    return () => { alive = false; unsubscribe(); };
  }, []);

  const posts = Array.isArray(summaries.community?.posts) ? summaries.community.posts.slice(0, 3) : [];
  const links = Array.isArray(summaries.family?.links) ? summaries.family.links : [];
  const verified = links.filter((link: any) => link.status === "VERIFIED").length;
  const invited = links.filter((link: any) => link.status === "INVITED").length;
  const listing = summaries.rishte?.profile;
  const threads = Array.isArray(summaries.messages?.threads) ? summaries.messages.threads : [];
  const recentNames = threads.slice(0, 2).map((thread: any) => thread.member?.displayName).filter(Boolean);
  function waiting(type: string) { return errors[type] ? <p className="muted">This summary is temporarily unavailable.</p> : !summaries[type] ? <LoadingState label="Loading your overview…"/> : null; }

  return <div className="home-wrap">
    <PageHeading icon="home" title={`Welcome, ${member.displayName}`} description="Your family, your connections, your community."><span className="home-account"><Avatar name={member.displayName} id={member.id} small/>@{member.username}</span></PageHeading>
    <div className="home-columns">
      <section className="home-activity panel">
        <div className="section-heading"><div><span className="section-kicker">From the community</span><h2>Recent conversations</h2></div><button className="text-button" onClick={() => open("community")}>View board <Icon name="arrow"/></button></div>
        {waiting("community") || (posts.length ? <div className="activity-list">{posts.map((post: any) => <article className="activity-item" key={post.id}><Avatar name={post.author?.displayName || "Member"}/><div><div className="activity-meta"><strong>{post.author?.displayName || "Member"}</strong>{post.createdAt && <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</time>}</div><p>{truncate(post.body || "")}</p></div></article>)}</div> : <EmptyState icon="community" title="A little quiet here">Community updates will appear here.</EmptyState>)}
        <div className="activity-footer"><span>Something to share?</span><button className="secondary" onClick={() => open("community")}><Icon name="edit"/> Write an update</button></div>
      </section>
      <aside className="home-rail">
        <section className="home-family-summary"><div className="section-heading"><div className="summary-title"><Icon name="family"/><h2>Your family</h2></div><button className="icon-button" aria-label="Open family tree" onClick={() => open("family")}><Icon name="arrow"/></button></div>{waiting("family") || <><div className="summary-value"><strong>{verified}</strong><span>verified family {verified === 1 ? "link" : "links"}</span></div><p>{invited ? `${invited} ${invited === 1 ? "invitation" : "invitations"} waiting to be claimed.` : "No unclaimed family invitations."}</p></>}</section>
        <section className="home-summary panel"><div className="section-heading"><div className="summary-title"><Icon name="rishte"/><h2>Your Rishte listing</h2></div><button className="icon-button" aria-label="Open Rishte" onClick={() => open("rishte")}><Icon name="arrow"/></button></div>{waiting("rishte") || <><span className={`status-pill ${listing?.isActive ? "" : "neutral"}`}>{!listing ? "Not listed" : listing.isActive ? "Visible" : "Paused"}</span><p>{!listing ? "You have not created a Rishte listing." : listing.headline ? truncate(listing.headline, 75) : "Your Rishte listing has no headline yet."}</p></>}</section>
        <section className="home-summary panel"><div className="section-heading"><div className="summary-title"><Icon name="messages"/><h2>Messages</h2></div><button className="icon-button" aria-label="Open messages" onClick={() => open("messages")}><Icon name="arrow"/></button></div>{waiting("messages") || <><div className="summary-value compact-value"><strong>{threads.length}</strong><span>{threads.length === 1 ? "conversation" : "conversations"}</span></div><p>{recentNames.length ? `Recent: ${recentNames.join(", ")}` : "No conversations yet."}</p></>}</section>
      </aside>
    </div>
    <footer className="home-footer"><span>AbbasiConnect</span><span>A place for the people who matter.</span></footer>
  </div>;
}
