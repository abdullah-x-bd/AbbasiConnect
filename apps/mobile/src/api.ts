import * as SecureStore from "expo-secure-store";

const ROOT = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");
const TOKEN_KEY = "abbasiconnect.native.session";
let bearer: string | null = null;

export function baseUrl() {
  if (!ROOT || !/^https:\/\//i.test(ROOT)) {
    throw new Error("Set EXPO_PUBLIC_API_URL to your deployed HTTPS backend URL in apps/mobile/.env");
  }
  return ROOT;
}
export function token() { return bearer; }
export async function loadToken() {
  bearer = await SecureStore.getItemAsync(TOKEN_KEY);
  return bearer;
}
export async function saveToken(value: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, value);
  bearer = value;
}
export async function clearToken() {
  bearer = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  if (!path.startsWith("/")) throw new Error("Invalid API path");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (bearer) headers.Authorization = "Bearer " + bearer;
  let response: Response;
  try {
    response = await fetch(baseUrl() + path, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal
    });
  } catch (error) {
    throw new Error("Could not connect to AbbasiConnect. Check your connection and API address.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || "Request failed (" + response.status + ")");
    (error as any).status = response.status;
    throw error;
  }
  return result as T;
}

export async function mediaData(path: string) {
  const result = await api<{ dataUrl: string }>(path);
  return result.dataUrl;
}
