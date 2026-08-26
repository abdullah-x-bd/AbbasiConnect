export const adminPage = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AbbasiConnect Admin</title>
  <style>
    :root { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #171717; background: #f5f5f2; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; }
    button, input, select { font: inherit; }
    button { cursor: pointer; border: 0; border-radius: 9px; padding: 10px 14px; background: #171717; color: white; font-weight: 650; }
    button.secondary { background: white; color: #171717; border: 1px solid #d7d7d0; }
    button.danger { background: #8e2424; }
    button.small { padding: 7px 10px; font-size: 13px; }
    input, select { width: 100%; border: 1px solid #d7d7d0; border-radius: 9px; background: white; padding: 11px 12px; }
    .login-shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .login-card { width: min(430px, 100%); background: white; border: 1px solid #deded7; border-radius: 18px; padding: 30px; box-shadow: 0 18px 50px rgba(0,0,0,.05); }
    .mark { width: 45px; height: 45px; border-radius: 12px; display: grid; place-items: center; background: #171717; color: white; font-weight: 800; }
    h1, h2, h3, p { margin-top: 0; }
    .muted { color: #6c6c66; }
    .stack { display: grid; gap: 14px; }
    label { display: grid; gap: 7px; font-size: 14px; font-weight: 650; }
    .error { color: #9c1f1f; background: #fff0f0; border: 1px solid #efc7c7; padding: 10px 12px; border-radius: 9px; }
    .hidden { display: none !important; }
    .topbar { position: sticky; top: 0; z-index: 10; min-height: 64px; background: rgba(255,255,255,.96); border-bottom: 1px solid #deded7; display: flex; gap: 16px; align-items: center; padding: 10px 24px; }
    .brand { font-weight: 800; margin-right: auto; }
    .admin-badge { font-size: 12px; border: 1px solid #cfcfc7; border-radius: 999px; padding: 5px 9px; color: #55554f; }
    .nav { display: flex; gap: 5px; flex-wrap: wrap; }
    .nav button { background: transparent; color: #55554f; }
    .nav button.active { background: #eeeeea; color: #171717; }
    .shell { max-width: 1440px; margin: 0 auto; padding: 28px 24px 60px; }
    .page-head { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-bottom: 26px; }
    .stat { background: white; border: 1px solid #deded7; border-radius: 14px; padding: 18px; }
    .stat .number { font-size: 30px; font-weight: 800; line-height: 1; margin-bottom: 7px; }
    .stat .label { color: #696963; font-size: 13px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 22px; }
    .panel { background: white; border: 1px solid #deded7; border-radius: 14px; padding: 18px; overflow: hidden; }
    .panel h2 { font-size: 18px; }
    .dist-row { display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 9px 0; border-bottom: 1px solid #eeeeea; }
    .dist-row:last-child { border-bottom: 0; }
    .toolbar { display: grid; grid-template-columns: minmax(240px, 1fr) 190px auto; gap: 10px; margin-bottom: 14px; }
    .table-wrap { overflow-x: auto; border: 1px solid #deded7; border-radius: 14px; background: white; }
    table { border-collapse: collapse; width: 100%; min-width: 980px; }
    th, td { padding: 12px 14px; text-align: left; vertical-align: top; border-bottom: 1px solid #eeeeea; font-size: 13px; }
    th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #6b6b65; background: #fafaf8; position: sticky; top: 0; }
    tr:last-child td { border-bottom: 0; }
    .person { display: grid; gap: 3px; }
    .person strong { font-size: 14px; }
    .person span { color: #74746e; }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; background: #ededE8; padding: 4px 8px; font-size: 12px; white-space: nowrap; }
    .pill.good { background: #e5f3e8; color: #236034; }
    .pill.warn { background: #fff1cf; color: #795600; }
    .pill.bad { background: #f9dfdf; color: #842525; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .cards { display: grid; gap: 10px; }
    .event-card { border: 1px solid #deded7; border-radius: 12px; padding: 14px; background: white; }
    .event-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 7px; }
    .event-card p { margin-bottom: 6px; }
    .empty { color: #777771; padding: 30px; text-align: center; }
    code { background: #eeeeea; padding: 2px 5px; border-radius: 5px; }
    @media (max-width: 900px) { .stats { grid-template-columns: repeat(2,1fr); } .grid-2 { grid-template-columns: 1fr; } .topbar { align-items: flex-start; flex-wrap: wrap; } .brand { width: 100%; } .toolbar { grid-template-columns: 1fr; } }
    @media (max-width: 520px) { .stats { grid-template-columns: 1fr 1fr; } .shell { padding: 20px 12px 50px; } }
  </style>
</head>
<body>
  <section id="loginView" class="login-shell">
    <div class="login-card">
      <div class="mark">AC</div>
      <h1 style="margin-top:18px">Admin login</h1>
      <p class="muted">AbbasiConnect platform administration. Separate from matrimonial member accounts.</p>
      <form id="loginForm" class="stack">
        <label>Admin username<input id="username" autocomplete="username" required /></label>
        <label>Password<input id="password" type="password" autocomplete="current-password" required /></label>
        <div id="loginError" class="error hidden"></div>
        <button type="submit">Open admin overview</button>
      </form>
    </div>
  </section>

  <section id="appView" class="hidden">
    <header class="topbar">
      <div class="brand">AbbasiConnect</div>
      <span class="admin-badge">ADMIN CONSOLE</span>
      <nav class="nav">
        <button data-tab="overview" class="active">Overview</button>
        <button data-tab="members">Members</button>
        <button data-tab="interests">Interests</button>
        <button data-tab="reports">Reports</button>
      </nav>
      <button id="refreshButton" class="secondary small">Refresh</button>
      <button id="logoutButton" class="secondary small">Log out</button>
    </header>
    <main class="shell">
      <div id="globalError" class="error hidden"></div>

      <section id="tab-overview">
        <div class="page-head"><div><h1>Platform overview</h1><p class="muted">Bird's-eye view of AbbasiConnect activity and safety.</p></div><div id="generatedAt" class="muted"></div></div>
        <div id="stats" class="stats"></div>
        <div class="grid-2">
          <div class="panel"><h2>Interest funnel</h2><div id="interestDist"></div></div>
          <div class="panel"><h2>Profile health</h2><div id="profileHealth"></div></div>
          <div class="panel"><h2>Gender distribution</h2><div id="genderDist"></div></div>
          <div class="panel"><h2>Top cities</h2><div id="cityDist"></div></div>
          <div class="panel"><h2>Marital status</h2><div id="maritalDist"></div></div>
          <div class="panel"><h2>Report status</h2><div id="reportDist"></div></div>
        </div>
        <div class="panel"><h2>Recent registrations</h2><div id="recentUsers" class="cards"></div></div>
      </section>

      <section id="tab-members" class="hidden">
        <div class="page-head"><div><h1>Members</h1><p class="muted">Search accounts, inspect status and take administrative action.</p></div></div>
        <form id="memberSearch" class="toolbar">
          <input id="memberQuery" placeholder="Name, username, email, phone, city" />
          <select id="memberStatus"><option value="">All accounts</option><option value="active">Active profiles</option><option value="paused">Paused profiles</option><option value="suspended">Suspended</option></select>
          <button>Search</button>
        </form>
        <div class="table-wrap"><table><thead><tr><th>Member</th><th>Profile</th><th>Contact</th><th>Identity</th><th>Joined</th><th>Actions</th></tr></thead><tbody id="membersBody"></tbody></table></div>
      </section>

      <section id="tab-interests" class="hidden">
        <div class="page-head"><div><h1>Interests</h1><p class="muted">Latest matrimonial interest activity across the platform.</p></div></div>
        <div id="interestCards" class="cards"></div>
      </section>

      <section id="tab-reports" class="hidden">
        <div class="page-head"><div><h1>Reports</h1><p class="muted">Safety reports and moderation actions.</p></div></div>
        <div id="reportCards" class="cards"></div>
      </section>
    </main>
  </section>

  <script>
    const TOKEN_KEY = 'abbasiconnect_admin_token';
    let currentTab = 'overview';
    const qs = (id) => document.getElementById(id);
    const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const pretty = (value) => String(value || 'Not specified').toLowerCase().replaceAll('_',' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const date = (value) => value ? new Date(value).toLocaleString() : '—';

    async function request(path, options) {
      const headers = Object.assign({'Content-Type':'application/json'}, options && options.headers || {});
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) headers.Authorization = 'Bearer ' + token;
      const response = await fetch(path, Object.assign({}, options || {}, {headers}));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Request failed');
      return data;
    }

    function showError(message) {
      qs('globalError').textContent = message;
      qs('globalError').classList.remove('hidden');
    }
    function clearError() { qs('globalError').classList.add('hidden'); }

    qs('loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      qs('loginError').classList.add('hidden');
      try {
        const data = await request('/admin/api/login', {method:'POST', body: JSON.stringify({username: qs('username').value, password: qs('password').value})});
        localStorage.setItem(TOKEN_KEY, data.token);
        enterApp();
      } catch (error) {
        qs('loginError').textContent = error.message;
        qs('loginError').classList.remove('hidden');
      }
    });

    qs('logoutButton').addEventListener('click', () => { localStorage.removeItem(TOKEN_KEY); location.reload(); });
    qs('refreshButton').addEventListener('click', () => loadTab(currentTab));
    document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
    qs('memberSearch').addEventListener('submit', (event) => { event.preventDefault(); loadMembers(); });

    function switchTab(tab) {
      currentTab = tab;
      document.querySelectorAll('[id^="tab-"]').forEach((node) => node.classList.add('hidden'));
      qs('tab-' + tab).classList.remove('hidden');
      document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
      loadTab(tab);
    }

    async function enterApp() {
      qs('loginView').classList.add('hidden');
      qs('appView').classList.remove('hidden');
      try { await loadOverview(); }
      catch (error) {
        if (/unauthor/i.test(error.message)) { localStorage.removeItem(TOKEN_KEY); location.reload(); return; }
        showError(error.message);
      }
    }

    function stat(number, label) { return '<div class="stat"><div class="number">' + esc(number) + '</div><div class="label">' + esc(label) + '</div></div>'; }
    function rows(items) {
      return items.length ? items.map((item) => '<div class="dist-row"><span>' + esc(item.label) + '</span><strong>' + esc(item.count) + '</strong></div>').join('') : '<p class="muted">No data yet.</p>';
    }

    async function loadOverview() {
      clearError();
      try {
        const data = await request('/admin/api/overview');
        const m = data.metrics;
        qs('generatedAt').textContent = 'Updated ' + new Date(data.generatedAt).toLocaleTimeString();
        qs('stats').innerHTML = [
          stat(m.users.total, 'Total member accounts'), stat(m.users.active, 'Active profiles'), stat(m.users.suspended, 'Suspended accounts'), stat(m.users.last7Days, 'Registrations in 7 days'),
          stat(m.interests.total, 'Total interests'), stat(m.interests.accepted, 'Accepted interests'), stat(m.shortlists, 'Shortlist saves'), stat(m.reports.open, 'Open reports')
        ].join('');
        qs('interestDist').innerHTML = rows([
          {label:'Pending', count:m.interests.pending},{label:'Accepted',count:m.interests.accepted},{label:'Declined',count:m.interests.declined},{label:'Withdrawn',count:m.interests.withdrawn}
        ]);
        qs('profileHealth').innerHTML = rows([
          {label:'Visible and active',count:m.users.active},{label:'Paused by member',count:m.users.paused},{label:'Suspended by moderation',count:m.users.suspended},{label:'Moderators',count:m.users.moderators}
        ]);
        qs('genderDist').innerHTML = rows(data.distributions.gender);
        qs('cityDist').innerHTML = rows(data.distributions.cities);
        qs('maritalDist').innerHTML = rows(data.distributions.maritalStatus);
        qs('reportDist').innerHTML = rows([
          {label:'Open',count:m.reports.open},{label:'Reviewed',count:m.reports.reviewed},{label:'Actioned',count:m.reports.actioned},{label:'Dismissed',count:m.reports.dismissed}
        ]);
        qs('recentUsers').innerHTML = data.recentUsers.length ? data.recentUsers.map((u) => '<div class="event-card"><div class="event-meta"><strong>' + esc(u.displayName) + '</strong><span class="pill">@' + esc(u.username) + '</span>' + (u.suspendedAt ? '<span class="pill bad">Suspended</span>' : u.isProfileActive ? '<span class="pill good">Active</span>' : '<span class="pill warn">Paused</span>') + '</div><p>' + esc([u.age ? u.age + ' years' : '', u.gender, u.city, u.occupation].filter(Boolean).join(' · ')) + '</p><small class="muted">Joined ' + esc(date(u.createdAt)) + '</small></div>').join('') : '<p class="muted">No registrations yet.</p>';
      } catch (error) { showError(error.message); }
    }

    async function loadMembers() {
      clearError();
      try {
        const params = new URLSearchParams();
        if (qs('memberQuery').value) params.set('q', qs('memberQuery').value);
        if (qs('memberStatus').value) params.set('status', qs('memberStatus').value);
        const data = await request('/admin/api/users?' + params.toString());
        qs('membersBody').innerHTML = data.users.length ? data.users.map((u) => '<tr><td><div class="person"><strong>' + esc(u.displayName) + '</strong><span>@' + esc(u.username) + '</span><span>' + esc(pretty(u.role)) + '</span></div></td><td>' + esc([u.age ? u.age + ' yrs' : '', u.gender, u.maritalStatus ? pretty(u.maritalStatus) : '', u.city, u.occupation].filter(Boolean).join(' · ')) + '<br>' + (u.suspendedAt ? '<span class="pill bad">Suspended</span>' : u.isProfileActive ? '<span class="pill good">Visible</span>' : '<span class="pill warn">Paused</span>') + '</td><td>' + esc(u.email || '—') + '<br>' + esc(u.phone || '—') + '</td><td>' + (u.identityVerified ? '<span class="pill good">Linked</span>' : '<span class="pill bad">Missing</span>') + (u.identityLast4 ? '<br><small>Last 4: ' + esc(u.identityLast4) + '</small>' : '') + '</td><td>' + esc(date(u.createdAt)) + '</td><td><div class="actions">' + (u.suspendedAt ? '<button class="small" onclick="userAction(\'' + u.id + '\',\'RESTORE\')">Restore</button>' : '<button class="small danger" onclick="userAction(\'' + u.id + '\',\'SUSPEND\')">Suspend</button>') + (u.isProfileActive ? '<button class="small secondary" onclick="userAction(\'' + u.id + '\',\'PAUSE\')">Hide profile</button>' : '<button class="small secondary" onclick="userAction(\'' + u.id + '\',\'ACTIVATE\')">Show profile</button>') + (u.role === 'MODERATOR' ? '<button class="small secondary" onclick="userAction(\'' + u.id + '\',\'MAKE_MEMBER\')">Remove moderator</button>' : '<button class="small secondary" onclick="userAction(\'' + u.id + '\',\'MAKE_MODERATOR\')">Make moderator</button>') + '</div></td></tr>').join('') : '<tr><td colspan="6" class="empty">No member accounts found.</td></tr>';
      } catch (error) { showError(error.message); }
    }

    window.userAction = async (id, action) => {
      if ((action === 'SUSPEND' || action === 'PAUSE') && !confirm('Apply ' + pretty(action) + ' to this member?')) return;
      try { await request('/admin/api/users/' + id, {method:'PATCH', body: JSON.stringify({action})}); await loadMembers(); await loadOverview(); }
      catch (error) { showError(error.message); }
    };

    async function loadInterests() {
      clearError();
      try {
        const data = await request('/admin/api/interests');
        qs('interestCards').innerHTML = data.interests.length ? data.interests.map((item) => '<div class="event-card"><div class="event-meta"><span class="pill ' + (item.status === 'ACCEPTED' ? 'good' : item.status === 'PENDING' ? 'warn' : '') + '">' + esc(pretty(item.status)) + '</span><strong>@' + esc(item.sender.username) + ' → @' + esc(item.receiver.username) + '</strong></div>' + (item.message ? '<p>“' + esc(item.message) + '”</p>' : '') + '<small class="muted">Created ' + esc(date(item.createdAt)) + ' · Updated ' + esc(date(item.updatedAt)) + '</small></div>').join('') : '<div class="empty">No interests yet.</div>';
      } catch (error) { showError(error.message); }
    }

    async function loadReports() {
      clearError();
      try {
        const data = await request('/admin/api/reports');
        qs('reportCards').innerHTML = data.reports.length ? data.reports.map((r) => '<div class="event-card"><div class="event-meta"><span class="pill ' + (r.status === 'OPEN' ? 'bad' : '') + '">' + esc(pretty(r.status)) + '</span><strong>' + esc(pretty(r.reason)) + '</strong></div><p>Reported <strong>@' + esc(r.reportedUser.username) + '</strong> by @' + esc(r.reporter.username) + '</p>' + (r.details ? '<p>' + esc(r.details) + '</p>' : '') + (r.moderationNote ? '<p class="muted">Moderator note: ' + esc(r.moderationNote) + '</p>' : '') + '<div class="actions"><button class="small" onclick="reportAction(\'' + r.id + '\',\'REVIEW\')">Mark reviewed</button><button class="small danger" onclick="reportAction(\'' + r.id + '\',\'SUSPEND_USER\')">Suspend member</button><button class="small secondary" onclick="reportAction(\'' + r.id + '\',\'RESTORE_USER\')">Restore member</button><button class="small secondary" onclick="reportAction(\'' + r.id + '\',\'DISMISS\')">Dismiss</button></div></div>').join('') : '<div class="empty">No reports yet.</div>';
      } catch (error) { showError(error.message); }
    }

    window.reportAction = async (id, action) => {
      const note = prompt('Optional admin note', '') || '';
      try { await request('/admin/api/reports/' + id, {method:'PATCH', body: JSON.stringify({action, note})}); await loadReports(); await loadOverview(); }
      catch (error) { showError(error.message); }
    };

    function loadTab(tab) {
      if (tab === 'overview') return loadOverview();
      if (tab === 'members') return loadMembers();
      if (tab === 'interests') return loadInterests();
      if (tab === 'reports') return loadReports();
    }

    if (localStorage.getItem(TOKEN_KEY)) enterApp();
  </script>
</body>
</html>`;
