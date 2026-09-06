import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installPerformanceLayer } from "./performance";
import "./styles.css";
import "./family-tree.css";
import "./admin.css";

const AdminDashboard = React.lazy(() => import("./AdminDashboard"));
const TOKEN_KEY = "abbasiconnect_token";
const baseUrl = import.meta.env.BASE_URL || "/";
const params = new URLSearchParams(window.location.search);
const adminRoute = params.get("admin") === "1" || window.location.pathname.endsWith("/admin");

function adminLogout() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.assign(baseUrl);
}

installPerformanceLayer();

const appFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  let path = url;
  try { path = new URL(url, window.location.href).pathname; } catch { path = url.split("?")[0]; }
  if (method === "POST" && /\/community\/posts\/[^/]+\/like$/.test(path) && init?.body == null) {
    return appFetch(input, { ...init, body: "{}" });
  }
  return appFetch(input, init);
}) as typeof window.fetch;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {adminRoute ? (
      <React.Suspense fallback={<main className="center-screen">Opening administration…</main>}>
        <AdminDashboard onLogout={adminLogout} />
      </React.Suspense>
    ) : <App />}
  </React.StrictMode>,
);
