import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AdminDashboard from "./AdminDashboard";
import { installFamilyTreeEnhancer } from "./familyTreeEnhancer";
import { installExperienceEnhancer } from "./experienceEnhancer";
import "./styles.css";
import "./family-tree.css";
import "./admin.css";
import "./polish.css";
import "./dashboard.css";

const TOKEN_KEY = "abbasiconnect_token";
const baseUrl = import.meta.env.BASE_URL || "/";
const params = new URLSearchParams(window.location.search);
const adminRoute = params.get("admin") === "1" || window.location.pathname.endsWith("/admin");

function adminLogout() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.assign(baseUrl);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {adminRoute ? <AdminDashboard onLogout={adminLogout} /> : <App />}
  </React.StrictMode>,
);

installFamilyTreeEnhancer();
installExperienceEnhancer();
