const TOKEN_KEY = "abbasiconnect_token";
const API_URL = import.meta.env.VITE_API_URL ?? "/api";
const EVENT_NAME = "abbasiconnect:realtime";

let controller: AbortController | null = null;
let activeToken: string | null = null;
let reconnectTimer: number | null = null;

function emit(detail: any) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

function clearReconnect() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function parseFrames(buffer: string) {
  let rest = buffer;
  while (true) {
    const boundary = rest.indexOf("\n\n");
    if (boundary < 0) break;
    const frame = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);
    const data = frame.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) continue;
    try {
      emit(JSON.parse(data));
    } catch {
      // Ignore malformed event frames and keep the stream alive.
    }
  }
  return rest;
}

async function connect(token: string, signal: AbortSignal) {
  const response = await fetch(`${API_URL}/realtime/events`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
    cache: "no-store",
    signal,
  });
  if (!response.ok || !response.body) throw new Error("Realtime connection unavailable");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    buffer = parseFrames(buffer);
  }
}

function scheduleReconnect(token: string) {
  clearReconnect();
  reconnectTimer = window.setTimeout(() => {
    if (localStorage.getItem(TOKEN_KEY) === token) syncRealtimeConnection();
  }, 1500);
}

export function syncRealtimeConnection() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    stopRealtimeConnection();
    return;
  }
  if (controller && activeToken === token && !controller.signal.aborted) return;

  stopRealtimeConnection();
  activeToken = token;
  controller = new AbortController();
  const signal = controller.signal;
  void connect(token, signal).catch(() => {
    if (!signal.aborted && localStorage.getItem(TOKEN_KEY) === token) scheduleReconnect(token);
  });
}

export function stopRealtimeConnection() {
  clearReconnect();
  controller?.abort();
  controller = null;
  activeToken = null;
}

export function onRealtime(handler: (detail: any) => void) {
  const listener = (event: Event) => handler((event as CustomEvent).detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
