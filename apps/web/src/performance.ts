const TOKEN_KEY = "abbasiconnect_token";
const SESSION_CACHE_KEY = "abbasiconnect_last_verified_session";
const API_URL = import.meta.env.VITE_API_URL ?? "/api";
const REALTIME_EVENT = "abbasiconnect:realtime";

type Snapshot = {
  body: string;
  status: number;
  statusText: string;
  headers: [string, string][];
  storedAt: number;
};

type CachedSession = {
  tokenTail: string;
  body: string;
  storedAt: number;
};

const nativeFetch = window.fetch.bind(window);
const cache = new Map<string, Snapshot>();
const inflight = new Map<string, Promise<Snapshot>>();
let installed = false;
let warmTimer: number | null = null;

function apiUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit) {
  return (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function headersOf(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}

function pathOf(url: string) {
  try {
    return new URL(url, window.location.href).pathname;
  } catch {
    return url.split("?")[0];
  }
}

function isApiRequest(url: string) {
  try {
    const full = new URL(url, window.location.href);
    const api = new URL(API_URL, window.location.href);
    return full.origin === api.origin && full.pathname.startsWith(api.pathname.replace(/\/$/, ""));
  } catch {
    return url.startsWith(API_URL);
  }
}

function isCacheablePath(path: string) {
  if (path.endsWith("/realtime/events") || path.endsWith("/performance/bootstrap")) return false;
  if (path.includes("/auth/session") || path.includes("/auth/sign-in") || path.includes("/auth/register")) return false;
  if (path.includes("/auth/request-otp")) return false;
  return true;
}

function ttlFor(path: string) {
  if (path.includes("/messages-secure/")) return 4_000;
  if (path.includes("/community/")) return 5_000;
  if (path.includes("/family/")) return 12_000;
  if (path.includes("/rishte")) return 12_000;
  if (path.includes("/directory")) return 15_000;
  return 8_000;
}

function responseFrom(snapshot: Snapshot) {
  return new Response(snapshot.body, {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers: snapshot.headers,
  });
}

async function snapshotResponse(response: Response): Promise<Snapshot> {
  return {
    body: await response.text(),
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers.entries()],
    storedAt: Date.now(),
  };
}

function cacheKey(url: string, headers: Headers) {
  return `${headers.get("authorization") || "guest"} ${url}`;
}

function tokenTail(value?: string | null) {
  const token = value?.replace(/^Bearer\s+/i, "") || "";
  return token.slice(-18);
}

function readCachedSession(authorization: string | null) {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedSession;
    if (!cached.body || cached.tokenTail !== tokenTail(authorization)) return null;
    if (Date.now() - cached.storedAt > 7 * 24 * 60 * 60 * 1000) return null;
    return cached;
  } catch {
    return null;
  }
}

function storeSessionBody(body: string, authorization?: string | null, explicitToken?: string | null) {
  try {
    const data = JSON.parse(body);
    if (data?.mode !== "member" || !data?.user?.id) return;
    const auth = explicitToken
      ? `Bearer ${explicitToken}`
      : authorization || (localStorage.getItem(TOKEN_KEY) ? `Bearer ${localStorage.getItem(TOKEN_KEY)}` : "");
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ tokenTail: tokenTail(auth), body, storedAt: Date.now() } satisfies CachedSession));
  } catch {
    // Session caching is only a rendering optimization.
  }
}

function domainForPath(path: string) {
  if (path.includes("/messages-secure/") || path.includes("/crypto/")) return "messages";
  if (path.includes("/community/")) return "community";
  if (path.includes("/family/")) return "family";
  if (path.includes("/rishte")) return "rishte";
  if (path.includes("/auth/me") || path.includes("/identity/")) return "profile";
  return null;
}

function matchesDomain(url: string, domain: string) {
  const path = pathOf(url);
  if (domain === "messages") return path.includes("/messages-secure/") || path.includes("/crypto/");
  if (domain === "community") return path.includes("/community/");
  if (domain === "family") return path.includes("/family/");
  if (domain === "rishte") return path.includes("/rishte");
  if (domain === "profile") return path.includes("/auth/me") || path.includes("/directory") || path.includes("/rishte");
  return false;
}

export function invalidatePerformanceCache(domain?: string) {
  if (!domain) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    const url = key.slice(key.indexOf(" ") + 1);
    if (matchesDomain(url, domain)) cache.delete(key);
  }
}

async function fetchSnapshot(input: RequestInfo | URL, init: RequestInit | undefined, key: string) {
  const existing = inflight.get(key);
  if (existing) return existing;

  const request = nativeFetch(input, init)
    .then(snapshotResponse)
    .then((snapshot) => {
      if (snapshot.status >= 200 && snapshot.status < 300) cache.set(key, snapshot);
      return snapshot;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}

function seedCache(path: string, data: any, token: string) {
  if (data === undefined || data === null) return;
  const url = `${API_URL}${path}`;
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  cache.set(cacheKey(url, headers), {
    body: JSON.stringify(data),
    status: 200,
    statusText: "OK",
    headers: [["content-type", "application/json"]],
    storedAt: Date.now(),
  });
}

function fallbackWarm(token: string, userId?: string) {
  const headers = { Authorization: `Bearer ${token}` };
  const paths = [
    "/community/feed",
    "/messages-secure/threads",
    "/family/me",
    "/rishte/me",
    "/rishte",
    "/rishte/interests",
  ];
  if (userId) paths.push(`/family/tree/${userId}`);
  for (const path of paths) void window.fetch(`${API_URL}${path}`, { headers }).catch(() => undefined);
}

function scheduleWarm(userId?: string) {
  if (warmTimer !== null) window.clearTimeout(warmTimer);
  warmTimer = window.setTimeout(() => {
    warmTimer = null;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    void nativeFetch(`${API_URL}/performance/bootstrap`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) throw new Error("Bootstrap unavailable");
      const data = await response.json();
      if (localStorage.getItem(TOKEN_KEY) !== token) return;
      const id = data.userId || userId;
      seedCache("/community/feed", data.communityFeed, token);
      seedCache("/messages-secure/threads", data.messageThreads, token);
      seedCache("/family/me", data.family, token);
      seedCache("/rishte/me", data.rishteMine, token);
      seedCache("/rishte", data.rishteProfiles, token);
      seedCache("/rishte/interests", data.rishteInterests, token);
      if (id) seedCache(`/family/tree/${id}`, data.familyTree, token);
    }).catch(() => fallbackWarm(token, userId));
  }, 40);
}

async function maybeWarmFromAuth(response: Response, path: string, authorization?: string | null) {
  if (!response.ok || (!path.includes("/auth/session") && !path.includes("/auth/sign-in") && !path.includes("/auth/register"))) return;
  try {
    const body = await response.clone().text();
    const data = JSON.parse(body);
    if (data?.mode !== "member") return;
    storeSessionBody(body, authorization, data.token || null);
    scheduleWarm(data.user?.id);
  } catch {
    // Prefetching is opportunistic; auth itself should never depend on it.
  }
}

function revalidateSession(input: RequestInfo | URL, init: RequestInit | undefined, authorization: string | null) {
  void nativeFetch(input, init).then((response) => {
    if (response.ok) {
      void maybeWarmFromAuth(response, "/auth/session", authorization);
      return;
    }
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(SESSION_CACHE_KEY);
      localStorage.removeItem(TOKEN_KEY);
      invalidatePerformanceCache();
      window.setTimeout(() => window.location.reload(), 0);
    }
  }).catch(() => {
    // Keep the last verified shell during a temporary network or Render wake failure.
  });
}

export function installPerformanceLayer() {
  if (installed) return;
  installed = true;

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = apiUrl(input);
    const method = methodOf(input, init);
    const headers = headersOf(input, init);
    const path = pathOf(url);

    if (!isApiRequest(url) || path.endsWith("/realtime/events")) return nativeFetch(input, init);

    if (method !== "GET") {
      const response = await nativeFetch(input, init);
      if (response.ok) {
        const domain = domainForPath(path);
        if (domain) invalidatePerformanceCache(domain);
        if (path.includes("/auth/sign-in") || path.includes("/auth/register")) invalidatePerformanceCache();
      }
      void maybeWarmFromAuth(response, path, headers.get("authorization"));
      return response;
    }

    if (path.includes("/auth/session") && headers.get("authorization")) {
      const cachedSession = readCachedSession(headers.get("authorization"));
      if (cachedSession) {
        revalidateSession(input, init, headers.get("authorization"));
        try {
          const data = JSON.parse(cachedSession.body);
          if (data?.user?.id) scheduleWarm(data.user.id);
        } catch {
          // Ignore a malformed local cache and let normal validation happen next time.
        }
        return new Response(cachedSession.body, { status: 200, headers: { "content-type": "application/json" } });
      }
      const response = await nativeFetch(input, init);
      void maybeWarmFromAuth(response, path, headers.get("authorization"));
      return response;
    }

    if (!isCacheablePath(path) || !headers.get("authorization")) {
      const response = await nativeFetch(input, init);
      void maybeWarmFromAuth(response, path, headers.get("authorization"));
      return response;
    }

    const key = cacheKey(url, headers);
    const existing = cache.get(key);
    const ttl = ttlFor(path);
    const age = existing ? Date.now() - existing.storedAt : Number.POSITIVE_INFINITY;

    if (existing && age <= ttl) return responseFrom(existing);

    if (existing && age <= 60_000) {
      void fetchSnapshot(input, init, key).catch(() => undefined);
      return responseFrom(existing);
    }

    const snapshot = await fetchSnapshot(input, init, key);
    return responseFrom(snapshot);
  }) as typeof window.fetch;

  window.addEventListener(REALTIME_EVENT, (event) => {
    const type = (event as CustomEvent)?.detail?.type;
    if (typeof type === "string") invalidatePerformanceCache(type);
  });
}
