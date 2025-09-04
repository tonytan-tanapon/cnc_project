// /static/js/api.js
export const $ = (id) => document.getElementById(id);

const KEY_API_BASE = "apiBase";
export function getAPIBase() {
  const v = (localStorage.getItem(KEY_API_BASE) || "").trim();
  return v || "/api/v1";
}
export function setAPIBase(v) {
  const base = (v || "").trim() || "/api/v1";
  localStorage.setItem(KEY_API_BASE, base);
  return base;
}
export function withBase(path) {
  const base = getAPIBase();
  if (/^https?:\/\//i.test(path)) return path;
  const left = base.endsWith("/") ? base.slice(0, -1) : base;
  const right = path.startsWith("/") ? path : "/" + path;
  return left + right;
}

function isJSON(res) {
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json");
}
export async function jfetch(path, init = {}) {
  const url = withBase(path);
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let msg = `${res.status}: `;
    try {
      if (isJSON(res)) {
        const data = await res.json();
        msg += data?.detail || data?.message || JSON.stringify(data);
      } else {
        msg += await res.text();
      }
    } catch {
      msg += res.statusText || "Request failed";
    }
    throw new Error(msg);
  }
  return isJSON(res) ? res.json() : res.text();
}

// export async function jfetch(url, opts = {}) {
//   const res = await fetch(url, {
//     method: opts.method || 'GET',
//     headers: {
//       'Content-Type': 'application/json',
//       ...(opts.headers || {}),
//     },
//     body: opts.body,
//     credentials: 'include', // if you use cookies/sessions; remove if not
//   });

//   if (res.status === 401 || res.status === 403) {
//     // DO NOT redirect on kiosk. Just throw so the page stays put.
//     const text = await res.text().catch(() => '');
//     const err = new Error(text || 'Unauthorized');
//     err.status = res.status;
//     throw err;
//   }

//   if (!res.ok) {
//     const text = await res.text().catch(() => '');
//     const err = new Error(text || res.statusText);
//     err.status = res.status;
//     throw err;
//   }

//   // 204 no content
//   if (res.status === 204) return null;

//   const ct = res.headers.get('content-type') || '';
//   return ct.includes('application/json') ? res.json() : res.text();
// }

export function showToast(msg, ok = true) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    const span = document.createElement("span");
    span.id = "toastText";
    t.appendChild(span);
    document.body.appendChild(t);
  }
  const span = t.querySelector("#toastText") || t.firstChild;
  span.textContent = msg;
  t.style.borderColor = ok ? "#27d17d" : "#ef4444";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}
export const toast = showToast;

export function renderTable(el, rows) {
  if (!el) return;
  if (!rows || rows.length === 0) {
    el.innerHTML = '<div class="hint">ไม่มีข้อมูล</div>';
    return;
  }
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v) => {
    if (v == null) return "";
    if (typeof v === "object") return '<span class="badge">obj</span>';
    return String(v).replace(/[&<>"]/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[s]));
  };
  const thead = `<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map(
      (r) =>
        `<tr>${cols.map((c) => `<td data-col="${c}">${esc(r[c])}</td>`).join("")}</tr>`
    )
    .join("")}</tbody>`;
  el.innerHTML = `<div style="overflow:auto"><table>${thead}${tbody}</table></div>`;
}

export function initTopbar() {
  const baseInput = document.getElementById("apiBase");
  if (baseInput) {
    baseInput.value = getAPIBase();
    baseInput.addEventListener("change", () => {
      const v = setAPIBase(baseInput.value);
      showToast(`API base = ${v}`);
    });
    baseInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        baseInput.dispatchEvent(new Event("change"));
        e.preventDefault();
      }
    });
  }

  const btnPing = document.getElementById("btnPing");
  if (btnPing) {
    btnPing.addEventListener("click", async () => {
      try {
        await jfetch("/customers");
        showToast("API OK ✅");
      } catch (err) {
        showToast(`Ping failed: ${err.message}`, false);
      }
    });
  }
}
