import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AdminDashboard from "./AdminDashboard";
import "./styles.css";
import "./admin.css";

const TOKEN_KEY = "abbasiconnect_token";

function adminLogout() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.assign("/");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname === "/admin" ? <AdminDashboard onLogout={adminLogout} /> : <App />}
  </React.StrictMode>,
);
