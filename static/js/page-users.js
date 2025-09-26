// /static/js/page-users.js  (fixed to match HTML ids: usr_* + existing u_table)
// ใช้กับหน้า Users ที่มี element IDs: usr_username, usr_email, usr_password, usr_employee_id,
// usr_is_superuser, usr_create, usr_q, usr_reload, u_table, apiBase, btnPing, toast, toastText

// -----------------------------
// Small utils
// -----------------------------
const $ = (id) => document.getElementById(id);

const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

function showToast(msg, ok = true) {
  const el = $("toast");
  const txt = $("toastText");
  if (!el || !txt) { alert(msg); return; }
  txt.textContent = msg;
  el.classList.remove("show", "ok", "err");
  el.classList.add("show", ok ? "ok" : "err");
  setTimeout(() => el.classList.remove("show"), 2200);
}

// -----------------------------
// API base + jfetch
// -----------------------------
function getApiBase() {
  const raw = $("apiBase")?.value?.trim();
  return raw && raw !== "" ? raw : "/api/v1";
}

async function jfetch(path, opt = {}) {
  const url = getApiBase().replace(/\/+$/, "") + path;
  const headers = Object.assign(
    { "Content-Type": "application/json" },
    opt.headers || {}
  );
  const res = await fetch(url, { ...opt, headers });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || res.statusText || "Request failed";
    throw new Error(msg);
  }
  return data;
}

// -----------------------------
// Roles & Permissions helpers
// -----------------------------
async function fetchUserRoles(userId) {
  return jfetch(`/users/${userId}/roles`);
}
async function fetchUserPermissions(userId) {
  return jfetch(`/users/${userId}/permissions`);
}

// -----------------------------
// Render table
// -----------------------------
function renderUsersTable(holder, rows) {
  if (!holder) { showToast('ไม่พบ element id="u_table"', false); return; }
  if (!Array.isArray(rows) || rows.length === 0) {
    holder.innerHTML = `<div class="hint">No users.</div>`;
    return;
  }

  const thead = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Username / Email</th>
        <th>Active</th>
        <th>Superuser</th>
        <th>Employee</th>
        <th>Created</th>
        <th>Last Login</th>
        <th>Roles</th>
        <th>Permissions</th>
        <th>Actions</th>
      </tr>
    </thead>
  `;

  const tbody = rows.map(u => {
    const roles = (u._roles || []).map(r => r.code).join(", ");
    const perms = (u._permissions || []).map(p => p.code).join(", ");

    const actBtn = u.is_active
      ? `<button class="btn btn-sm" data-action="deactivate" data-id="${u.id}">Deactivate</button>`
      : `<button class="btn btn-sm" data-action="activate" data-id="${u.id}">Activate</button>`;

    return `
      <tr>
        <td>${u.id}</td>
        <td>
          <div><b>${u.username ?? ""}</b></div>
          <div class="muted">${u.email ?? ""}</div>
        </td>
        <td>${u.is_active ? "Yes" : "No"}</td>
        <td>${u.is_superuser ? "Yes" : "No"}</td>
        <td>${u.employee_id ?? ""}</td>
        <td>${u.created_at ?? ""}</td>
        <td>${u.last_login_at ?? ""}</td>
        <td style="max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${roles}">${roles}</td>
        <td style="max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${perms}">${perms}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">
          ${actBtn}
          <button class="btn btn-sm" data-action="setpw" data-id="${u.id}">Set Password</button>
          <button class="btn btn-sm" data-action="assign-role" data-id="${u.id}">Assign Role</button>
          <button class="btn btn-sm" data-action="unassign-role" data-id="${u.id}">Unassign Role</button>
          <button class="btn btn-sm danger" data-action="delete" data-id="${u.id}">Delete</button>
        </td>
      </tr>
    `;
  }).join("");

  holder.innerHTML = `
    <table class="table">
      ${thead}
      <tbody>${tbody}</tbody>
    </table>
  `;

  // wire actions
  holder.querySelectorAll("button[data-action]").forEach(btn => {
    const action = btn.getAttribute("data-action");
    const id = Number(btn.getAttribute("data-id"));
    btn.addEventListener("click", async () => {
      try {
        if (action === "activate")        await activateUser(id);
        else if (action === "deactivate") await deactivateUser(id);
        else if (action === "setpw")      await setPasswordPrompt(id);
        else if (action === "assign-role")   await assignRolePrompt(id);
        else if (action === "unassign-role") await unassignRolePrompt(id);
        else if (action === "delete")     await deleteUserConfirm(id);
        await loadUsers();
      } catch (e) {
        showToast(e.message || String(e), false);
      }
    });
  });
}

// -----------------------------
// Load & Create
// -----------------------------
async function loadUsers() {
  const holder = $("u_table");
  if (!holder) {
    showToast('ไม่พบ element id="u_table" ในหน้า HTML', false);
    return;
  }

  try {
    const keyword = $("usr_q")?.value?.trim();
    let users = await jfetch(`/users`);

    // enrich roles/permissions
    users = await Promise.all(users.map(async (u) => {
      try {
        const [roles, perms] = await Promise.all([
          fetchUserRoles(u.id),
          fetchUserPermissions(u.id),
        ]);
        return { ...u, _roles: roles, _permissions: perms };
      } catch {
        return { ...u, _roles: [], _permissions: [] };
      }
    }));

    // client filter
    const filtered = keyword
      ? users.filter(u =>
          (u.username ?? "").toLowerCase().includes(keyword.toLowerCase()) ||
          (u.email ?? "").toLowerCase().includes(keyword.toLowerCase())
        )
      : users;

    renderUsersTable(holder, filtered);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    showToast("โหลด Users ไม่สำเร็จ: " + e.message, false);
  }
}

async function createUser() {
  const usernameEl = $("usr_username");
  const emailEl = $("usr_email");
  const pwEl = $("usr_password");
  const empEl = $("usr_employee_id");
  const suEl = $("usr_is_superuser");

  const payload = {
    username: strOrNull(usernameEl?.value),
    email: strOrNull(emailEl?.value),
    password: strOrNull(pwEl?.value),
    employee_id: empEl && empEl.value !== "" ? Number(empEl.value) : null,
    is_superuser: !!(suEl && suEl.checked),
  };

  if (!payload.username || !payload.password) {
    showToast("กรอก Username และ Password ก่อน", false);
    return;
  }

  try {
    await jfetch(`/users`, { method: "POST", body: JSON.stringify(payload) });
    showToast("User created");
    // clear form
    if (usernameEl) usernameEl.value = "";
    if (emailEl) emailEl.value = "";
    if (pwEl) pwEl.value = "";
    if (empEl) empEl.value = "";
    if (suEl) suEl.checked = false;

    await loadUsers();
  } catch (e) {
    showToast("Create user failed: " + e.message, false);
  }
}

// -----------------------------
// User actions
// -----------------------------
async function activateUser(userId) {
  await jfetch(`/users/${userId}/activate`, { method: "POST" });
  showToast("User activated");
}

async function deactivateUser(userId) {
  await jfetch(`/users/${userId}/deactivate`, { method: "POST" });
  showToast("User deactivated");
}

async function setPasswordPrompt(userId) {
  const pw = prompt("Enter new password (>= 6 chars):");
  if (!pw) return;
  if (pw.length < 6) { showToast("Password too short", false); return; }
  await jfetch(`/users/${userId}/set-password`, {
    method: "POST",
    body: JSON.stringify({ new_password: pw })
  });
  showToast("Password updated");
}

async function assignRolePrompt(userId) {
  const roleCode = prompt("Enter role code (e.g. ADMIN, QA, OPERATOR):");
  if (!roleCode) return;
  await jfetch(`/users/${userId}/roles`, {
    method: "POST",
    body: JSON.stringify({ role_code: roleCode.trim().toUpperCase() })
  });
  showToast("Role assigned");
}

async function unassignRolePrompt(userId) {
  const roleCode = prompt("Enter role code to unassign:");
  if (!roleCode) return;
  await jfetch(`/users/${userId}/roles/${encodeURIComponent(roleCode.trim().toUpperCase())}`, {
    method: "DELETE"
  });
  showToast("Role unassigned");
}

async function deleteUserConfirm(userId) {
  if (!confirm(`Delete user #${userId}?`)) return;
  await jfetch(`/users/${userId}`, { method: "DELETE" });
  showToast("User deleted");
}

// -----------------------------
// Ping
// -----------------------------
async function pingApi() {
  try {
    const pong = await jfetch(`/ping`);
    showToast(`Ping OK: ${typeof pong === "string" ? pong : "OK"}`);
  } catch (e) {
    showToast(`Ping failed: ${e.message}`, false);
  }
}

// -----------------------------
// Events
// -----------------------------
document.addEventListener("DOMContentLoaded", () => {
  const apiBaseInput = $("apiBase");
  if (apiBaseInput && !apiBaseInput.value) apiBaseInput.value = "/api/v1";

  $("usr_create")?.addEventListener("click", createUser);
  $("usr_reload")?.addEventListener("click", loadUsers);
  $("usr_q")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadUsers();
  });

  $("btnPing")?.addEventListener("click", pingApi);

  loadUsers();
});
