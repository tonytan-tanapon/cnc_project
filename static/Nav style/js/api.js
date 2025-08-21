// /static/js/api.js

// ---------- State: API Base ----------
let _apiBase = localStorage.getItem("apiBase") || "/api/v1";

export function getAPIBase() {
  return _apiBase;
}

export function setAPIBase(v) {
  _apiBase = (v || "/api/v1").trim() || "/api/v1";
  localStorage.setItem("apiBase", _apiBase);
}

// ---------- DOM helpers ----------
export const $ = (id) => document.getElementById(id);

// ---------- Toast ----------
export function showToast(msg, ok = true) {
  const t = $("toast");
  const span = $("toastText");
  if (!t || !span) return;
  span.textContent = msg;
  t.style.borderColor = ok ? "#27d17d" : "#ef4444";
  t.classList.add("show");
  clearTimeout(showToast._tid);
  showToast._tid = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- URL helper ----------
export function withBase(path) {
  // ถ้าเป็น absolute URL ก็ใช้ตามนั้น
  if (/^https?:\/\//i.test(path)) return path;
  const base = getAPIBase().replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

// ---------- Fetch helper ----------
async function _asJson(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) return res.json();
  return res.text();
}

export async function jfetch(path, init = {}) {
  const url = withBase(path);
  const headers = {
    "content-type": "application/json",
    ...(init.headers || {}),
  };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let errText;
    try {
      const data = await _asJson(res);
      errText = typeof data === "string" ? data : JSON.stringify(data);
    } catch {
      errText = res.statusText || "Request failed";
    }
    throw new Error(`${res.status}: ${errText}`);
  }
  return _asJson(res);
}

// ---------- Table renderer (ง่าย ๆ) ----------
export function renderTable(el, rows) {
  if (!el) return;
  if (!rows || rows.length === 0) {
    el.innerHTML = '<div class="hint">ไม่มีข้อมูล</div>';
    return;
  }
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const head = `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>`;
  const esc = (v) =>
    v == null
      ? ""
      : typeof v === "object"
        ? `<span class="badge">obj</span>`
        : String(v).replace(/[&<>"]/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[s]));
  const body = `<tbody>${rows
    .map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  el.innerHTML = `<div style="overflow:auto"><table>${head}${body}</table></div>`;
}

// ---------- Misc helpers ----------
export function qs(obj = {}) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v === null || v === undefined || v === "") return;
    p.set(k, String(v));
  });
  return p.toString();
}
export function showToast(msg, ok = true){ toast(msg, ok); }