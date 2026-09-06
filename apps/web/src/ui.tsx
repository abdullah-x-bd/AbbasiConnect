import { useEffect, useRef, useState, type ReactNode } from "react";

export type IconName = "home" | "rishte" | "family" | "community" | "messages" | "account" | "logout" | "arrow" | "back" | "search" | "plus" | "check" | "lock" | "heart" | "share" | "send" | "edit" | "shield" | "close" | "image";

const paths: Record<IconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
  rishte: <><path d="M12 20S3 14.8 3 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 9 2.8C21 14.8 12 20 12 20Z" /></>,
  family: <><rect x="9" y="3" width="6" height="5" rx="1.5"/><rect x="2" y="16" width="6" height="5" rx="1.5"/><rect x="16" y="16" width="6" height="5" rx="1.5"/><path d="M12 8v4M5 16v-4h14v4"/></>,
  community: <><circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M21 20v-3a6 6 0 0 0-3-5"/></>,
  messages: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-9.5A8.5 8.5 0 0 1 10.5 4h2a8.5 8.5 0 0 1 8.5 7.5Z"/>,
  account: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  logout: <><path d="M9 3H4v18h5M14 8l5 4-5 4M8 12h11"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  back: <path d="M20 12H4m6-6-6 6 6 6"/>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  plus: <path d="M12 4v16M4 12h16"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  heart: <path d="M12 20S3 14.8 3 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 9 2.8C21 14.8 12 20 12 20Z"/>,
  share: <><path d="M12 15V3m-5 5 5-5 5 5M5 12v8h14v-8"/></>,
  send: <><path d="m3 3 19 9-19 9 4-9-4-9ZM7 12h15"/></>,
  edit: <><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6ZM14 20h7"/></>,
  shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/></>,
};

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect x="5.5" y="5.5" width="25" height="25" rx="7" stroke="currentColor" strokeWidth="2"/><path d="M11 25 18 10l7 15M14 20h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

const TOKEN_KEY = "abbasiconnect_token";
const API_URL = import.meta.env.VITE_API_URL ?? "/api";
const PROFILE_IMAGE_EVENT = "abbasiconnect:profile-image-updated";
const profileImageCache = new Map<string, string | null>();

async function mediaImage(path: string) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return typeof data.dataUrl === "string" ? data.dataUrl : null;
}

export function profileImageUpdated(id: string) {
  profileImageCache.delete(id);
  window.dispatchEvent(new CustomEvent(PROFILE_IMAGE_EVENT, { detail: { id, revision: Date.now() } }));
}

function useProfileImage(id?: string) {
  const [source, setSource] = useState<string | null>(() => id && profileImageCache.has(id) ? profileImageCache.get(id)! : null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!id) return;
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.id === id) setRevision(Number(detail.revision) || Date.now());
    };
    window.addEventListener(PROFILE_IMAGE_EVENT, refresh);
    return () => window.removeEventListener(PROFILE_IMAGE_EVENT, refresh);
  }, [id]);
  useEffect(() => {
    if (!id) { setSource(null); return; }
    let alive = true;
    const cached = revision === 0 ? profileImageCache.get(id) : undefined;
    if (cached !== undefined) { setSource(cached); return; }
    void mediaImage(`/media/profile/${id}?v=${revision}`).then((value) => {
      if (!alive) return;
      profileImageCache.set(id, value);
      setSource(value);
    });
    return () => { alive = false; };
  }, [id, revision]);
  return source;
}

export function Avatar({ name, small = false, id, preview }: { name: string; small?: boolean; id?: string; preview?: string | null }) {
  const fetched = useProfileImage(id);
  const [broken, setBroken] = useState(false);
  const source = preview !== undefined ? preview : fetched;
  useEffect(() => setBroken(false), [source]);
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join("").toLocaleUpperCase();
  return <span className={`avatar${small ? " avatar-small" : ""}`} aria-hidden="true">{source && !broken ? <img src={source} alt="" onError={() => setBroken(true)}/> : initials || "A"}</span>;
}

export function PostImage({ postId, alt }: { postId: string; alt: string }) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void mediaImage(`/media/posts/${postId}`).then((value) => { if (alive) setSource(value); });
    return () => { alive = false; };
  }, [postId]);
  return source ? <img className="post-image" src={source} alt={alt} loading="lazy"/> : null;
}

export async function prepareImage(file: File, maxDimension = 1200, startingQuality = .8) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("This image could not be opened"));
      element.src = objectUrl;
    });
    let dimension = maxDimension;
    let quality = startingQuality;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = Math.min(1, dimension / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image processing is unavailable in this browser");
      context.drawImage(image, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/webp", quality);
      if (dataUrl.length <= 650_000) return dataUrl;
      dimension = Math.max(520, Math.round(dimension * .78));
      quality = Math.max(.56, quality - .08);
    }
    throw new Error("This image is still too large after compression. Choose a smaller image.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function PageHeading({ title, description, icon, children }: { title: string; description: string; icon: IconName; children?: ReactNode }) {
  return <header className="page-heading"><div className="heading-icon"><Icon name={icon}/></div><div className="heading-copy"><h1 tabIndex={-1}>{title}</h1><p>{description}</p></div>{children && <div className="heading-extra">{children}</div>}</header>;
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon}/></span><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div className="loading-state" role="status"><span className="loading-dot"/>{label}</div>;
}

export function Notice({ children, kind = "error" }: { children: ReactNode; kind?: "error" | "success" }) {
  if (!children) return null;
  return <p className={`notice ${kind}`} role={kind === "error" ? "alert" : "status"}><Icon name={kind === "error" ? "shield" : "check"}/><span>{children}</span></p>;
}

export function useAction(onError: (message: string) => void) {
  const [working, setWorking] = useState(false);
  const pending = useRef(false);
  async function perform(action: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setWorking(true);
    onError("");
    try { await action(); }
    catch (error) { onError(error instanceof Error ? error.message : "Something went wrong. Please try again."); }
    finally { pending.current = false; setWorking(false); }
  }
  return { working, perform };
}
