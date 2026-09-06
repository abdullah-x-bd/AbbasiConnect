const TOKEN_KEY = "abbasiconnect_token";
const API_URL = import.meta.env.VITE_API_URL ?? "/api";

async function memberApi(path: string) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error("Request failed");
  return response.json();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function moduleButton(label: string, navText: string) {
  const button = el("button", "dashboard-link", label);
  button.type = "button";
  button.addEventListener("click", () => {
    const target = [...document.querySelectorAll<HTMLButtonElement>(".desktop-nav button")]
      .find((item) => item.textContent?.trim().toLowerCase() === navText.toLowerCase());
    target?.click();
  });
  return button;
}

function loadingLine() {
  return el("p", "dashboard-muted", "Loading…");
}

function truncate(value: string, max = 115) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

async function fillCommunity(container: HTMLElement) {
  try {
    const data = await memberApi("/community/feed");
    container.replaceChildren();
    const posts = Array.isArray(data.posts) ? data.posts.slice(0, 3) : [];
    if (!posts.length) {
      container.append(el("p", "dashboard-muted", "No community posts yet."));
      return;
    }
    for (const post of posts) {
      const row = el("div", "dashboard-activity-row");
      const meta = el("div", "dashboard-activity-meta");
      meta.append(el("strong", "", post.author?.displayName || "Member"));
      if (post.createdAt) meta.append(el("span", "", new Date(post.createdAt).toLocaleDateString()));
      row.append(meta, el("p", "", truncate(post.body || "")));
      container.append(row);
    }
  } catch {
    container.replaceChildren(el("p", "dashboard-muted", "Community activity is temporarily unavailable."));
  }
}

async function fillFamily(container: HTMLElement) {
  try {
    const data = await memberApi("/family/me");
    const links = Array.isArray(data.links) ? data.links : [];
    const verified = links.filter((item: any) => item.status === "VERIFIED");
    const invited = links.filter((item: any) => item.status === "INVITED");
    container.replaceChildren();
    const number = el("strong", "dashboard-number", String(verified.length));
    const label = el("span", "dashboard-number-label", verified.length === 1 ? "verified family link" : "verified family links");
    container.append(number, label);
    if (invited.length) container.append(el("p", "dashboard-muted", `${invited.length} invitation${invited.length === 1 ? "" : "s"} waiting to be claimed.`));
    else container.append(el("p", "dashboard-muted", "No unclaimed family invitations."));
  } catch {
    container.replaceChildren(el("p", "dashboard-muted", "Family summary unavailable."));
  }
}

async function fillRishte(container: HTMLElement) {
  try {
    const data = await memberApi("/rishte/me");
    const profile = data.profile;
    container.replaceChildren();
    if (!profile) {
      container.append(el("strong", "dashboard-status", "Not listed"), el("p", "dashboard-muted", "You have not created a Rishte listing."));
      return;
    }
    container.append(
      el("strong", profile.isActive ? "dashboard-status live" : "dashboard-status", profile.isActive ? "Visible" : "Paused"),
      el("p", "dashboard-muted", profile.headline ? truncate(profile.headline, 75) : "Your Rishte listing has no headline yet."),
    );
  } catch {
    container.replaceChildren(el("p", "dashboard-muted", "Rishte status unavailable."));
  }
}

async function fillMessages(container: HTMLElement) {
  try {
    const data = await memberApi("/messages-secure/threads");
    const threads = Array.isArray(data.threads) ? data.threads : [];
    container.replaceChildren();
    container.append(el("strong", "dashboard-number", String(threads.length)), el("span", "dashboard-number-label", threads.length === 1 ? "conversation" : "conversations"));
    const recent = threads.slice(0, 2).map((item: any) => item.member?.displayName).filter(Boolean);
    container.append(el("p", "dashboard-muted", recent.length ? `Recent: ${recent.join(", ")}` : "No conversations yet."));
  } catch {
    container.replaceChildren(el("p", "dashboard-muted", "Message summary unavailable."));
  }
}

function enhanceHome() {
  const home = document.querySelector<HTMLElement>(".new-home");
  if (!home || home.dataset.dashboardEnhanced === "1") return;
  const serviceIndex = home.querySelector<HTMLElement>(".service-index");
  if (!serviceIndex) return;

  home.dataset.dashboardEnhanced = "1";
  serviceIndex.remove();

  const header = home.querySelector<HTMLElement>(".home-bar");
  if (header) {
    const existing = header.querySelector("span");
    if (existing) existing.textContent = "Account overview";
  }

  const dashboard = el("section", "member-dashboard");
  const activity = el("section", "dashboard-activity");
  const activityHead = el("div", "dashboard-section-head");
  activityHead.append(el("div", "dashboard-heading", "Recent community"), moduleButton("Open community", "Community"));
  const activityBody = el("div", "dashboard-activity-list");
  activityBody.append(loadingLine());
  activity.append(activityHead, activityBody);

  const rail = el("aside", "dashboard-rail");

  const family = el("section", "dashboard-rail-section");
  const familyHead = el("div", "dashboard-section-head");
  familyHead.append(el("div", "dashboard-heading", "Family"), moduleButton("Open", "Family tree"));
  const familyBody = el("div", "dashboard-summary-body");
  familyBody.append(loadingLine());
  family.append(familyHead, familyBody);

  const rishte = el("section", "dashboard-rail-section");
  const rishteHead = el("div", "dashboard-section-head");
  rishteHead.append(el("div", "dashboard-heading", "Rishte"), moduleButton("Open", "Rishte"));
  const rishteBody = el("div", "dashboard-summary-body");
  rishteBody.append(loadingLine());
  rishte.append(rishteHead, rishteBody);

  const messages = el("section", "dashboard-rail-section");
  const messagesHead = el("div", "dashboard-section-head");
  messagesHead.append(el("div", "dashboard-heading", "Messages"), moduleButton("Open", "Messages"));
  const messagesBody = el("div", "dashboard-summary-body");
  messagesBody.append(loadingLine());
  messages.append(messagesHead, messagesBody);

  rail.append(family, rishte, messages);
  dashboard.append(activity, rail);
  home.append(dashboard);

  void fillCommunity(activityBody);
  void fillFamily(familyBody);
  void fillRishte(rishteBody);
  void fillMessages(messagesBody);
}

function refreshDashboardFromRealtime(detail: any) {
  const home = document.querySelector<HTMLElement>(".new-home");
  if (!home || home.dataset.dashboardEnhanced !== "1") return;
  const activity = home.querySelector<HTMLElement>(".dashboard-activity-list");
  const summaries = home.querySelectorAll<HTMLElement>(".dashboard-summary-body");
  if (detail?.type === "community" && activity) void fillCommunity(activity);
  if (detail?.type === "family" && summaries[0]) void fillFamily(summaries[0]);
  if (detail?.type === "rishte" && summaries[1]) void fillRishte(summaries[1]);
  if (detail?.type === "messages" && summaries[2]) void fillMessages(summaries[2]);
}

function enhanceMessageUnlock() {
  const form = document.querySelector<HTMLFormElement>(".unlock-strip");
  if (!form || form.dataset.explained === "1") return;
  form.dataset.explained = "1";

  const currentText = form.querySelector("span");
  if (currentText) {
    currentText.textContent = "";
    currentText.className = "unlock-copy";
    currentText.append(
      el("strong", "", "Unlock encrypted chats for this session"),
      el("small", "", "Enter your AbbasiConnect password. Your message key is unlocked in this browser and is forgotten when the browser session closes."),
    );
  }
  const input = form.querySelector<HTMLInputElement>('input[type="password"]');
  if (input) input.placeholder = "AbbasiConnect password";
  const button = form.querySelector<HTMLButtonElement>("button");
  if (button) button.textContent = "Unlock chats";
}

export function installExperienceEnhancer() {
  const run = () => {
    enhanceHome();
    enhanceMessageUnlock();
  };
  run();
  const observer = new MutationObserver(run);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("abbasiconnect:realtime", (event) => refreshDashboardFromRealtime((event as CustomEvent).detail));
}
