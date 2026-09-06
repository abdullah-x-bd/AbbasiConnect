import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installPerformanceLayer } from "./performance";
import "./styles.css";
import "./family-tree.css";
import "./admin.css";
import "./polish.css";
import "./dashboard.css";

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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {adminRoute ? (
      <React.Suspense fallback={<main className="center-screen">Opening administration…</main>}>
        <AdminDashboard onLogout={adminLogout} />
      </React.Suspense>
    ) : <App />}
  </React.StrictMode>,
);

if (!adminRoute) {
  void Promise.all([
    import("./familyTreeEnhancer"),
    import("./experienceEnhancer"),
  ]).then(([familyTree, experience]) => {
    familyTree.installFamilyTreeEnhancer();
    experience.installExperienceEnhancer();
  });
}
