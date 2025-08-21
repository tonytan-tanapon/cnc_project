// /static/js/nav.js
// ===== helpers พื้นฐาน =====
const $id = (id) => document.getElementById(id);

export function getAPIBase() {
  // อ่านจาก input ถ้ามี (ให้ทันทีแบบสด) ถ้าไม่มี ใช้ localStorage > ค่าดีฟอลต์
  const input = $id("apiBase");
  const v = (input?.value || "").trim();
  if (v) return v;
  return localStorage.getItem("apiBase") || "/api/v1";
}

export function setAPIBase(v) {
  const val = (v || "").trim() || "/api/v1";
  localStorage.setItem("apiBase", val);
  const input = $id("apiBase");
  if (input) input.value = val;
}

export async function jfetch(path, init = {}) {
  const base = getAPIBase();
  const url = base.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`);
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("json") ? res.json() : res.text();
}

export function toast(msg, ok = true) {
  const t = $id("toast");
  const tt = $id("toastText");
  if (!t || !tt) return;
  tt.textContent = msg;
  t.style.borderColor = ok ? "#27d17d" : "#ef4444";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

// ===== เนวิเกชัน/ท็อปบาร์ =====
function setActiveLink() {
  const links = document.querySelectorAll(".nav a");
  const here = location.pathname.replace(/\/+$/, "") || "/static/index.html";
  links.forEach((a) => {
    const target = (a.getAttribute("href") || "").replace(/\/+$/, "");
    a.classList.toggle("active", target === here || (here === "/static" && target === "/static/index.html"));
  });
}

function bindTopbar() {
  // API Base
  const input = $id("apiBase");
  if (input) {
    // sync เริ่มต้น
    input.value = getAPIBase();
    input.addEventListener("change", () => {
      setAPIBase(input.value);
      toast(`API Base = ${getAPIBase()}`);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        input.dispatchEvent(new Event("change"));
        e.preventDefault();
      }
    });
  }

  // Ping
  const btnPing = $id("btnPing");
  if (btnPing) {
    btnPing.addEventListener("click", async () => {
      try {
        await jfetch("/customers"); // ใช้ GET ที่ปลอดภัยเป็น health-check
        toast("API OK ✅");
      } catch (err) {
        toast(`Ping failed: ${err.message}`, false);
      }
    });
  }

  // Global search (เดโม่)
  const globalSearch = $id("globalSearch");
  if (globalSearch) {
    globalSearch.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const q = globalSearch.value.trim();
      if (!q) return;
      if (/^po[-_]/i.test(q)) location.href = "/static/pos.html";
      else if (/^lot[-_]/i.test(q)) location.href = "/static/lots.html";
      else if (/^c(ust)?/i.test(q)) location.href = "/static/customers.html";
      else location.href = "/static/index.html";
    });
  }
}

// ===== boot =====
document.addEventListener("DOMContentLoaded", () => {
  setActiveLink();
  bindTopbar();
});
