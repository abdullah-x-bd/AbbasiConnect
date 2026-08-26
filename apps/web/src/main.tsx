import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AdminDashboard from "./AdminDashboard";
import "./styles.css";
import "./admin.css";

const TOKEN_KEY = "abbasiconnect_token";
const MODE_KEY = "abbasiconnect_session_mode";

// Keep one visible sign-in experience. The matrimonial API is tried first.
// If those credentials are not a member login, the same form transparently
// checks the internal admin API. Admin sessions are then routed to /admin.
const originalFetch = window.fetch.bind(window);
const patchedWindow = window as Window & { __abbasiUnifiedLoginPatched?: boolean };

if (!patchedWindow.__abbasiUnifiedLoginPatched) {
  patchedWindow.__abbasiUnifiedLoginPatched = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const cleanUrl = url.split("?")[0];

    if (localStorage.getItem(MODE_KEY) === "admin" && cleanUrl.endsWith("/auth/me")) {
      window.location.replace("/admin");
      return new Promise<Response>(() => undefined);
    }

    const response = await originalFetch(input, init);

    if (cleanUrl.endsWith("/auth/sign-in") && !response.ok) {
      const adminResponse = await originalFetch("/admin-api/login", init);
      if (adminResponse.ok) {
        localStorage.setItem(MODE_KEY, "admin");
        return adminResponse;
      }
    }

    return response;
  };
}

function adminLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(MODE_KEY);
  window.location.assign("/");
}

const adminRoute = window.location.pathname === "/admin";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {adminRoute ? <AdminDashboard onLogout={adminLogout} /> : <App />}
  </React.StrictMode>,
);
