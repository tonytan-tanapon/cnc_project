// /static/js/api.js
export const $ = (id) => document.getElementById(id);

const KEY_API_BASE = "apiBase";
export function getAPIBase() {
  // sanitize: อนุญาต "" หรือ "/api/v<number>"
  let v = (localStorage.getItem(KEY_API_BASE) || "").trim();
  if (v && !/^\/api\/v\d+$/i.test(v)) {
    // ถ้ามีค่าประหลาด (เผลอตั้งเป็น path อื่น) ให้รีเซ็ตเป็น /api/v1
    v = "/api/v1";
    localStorage.setItem(KEY_API_BASE, v);
  }
  return v || "/api/v1";
}
export function setAPIBase(v) {
  v = (v || "").trim();
  if (v && !/^\/api\/v\d+$/i.test(v)) v = "/api/v1";
  localStorage.setItem(KEY_API_BASE, v || "/api/v1");
  return getAPIBase();
}

/** ต่อ base อย่างปลอดภัย (กันต่อซ้ำ) */
export function withBase(path) {
  const base = (getAPIBase() || "").trim();
  if (/^https?:\/\//i.test(path)) return path;

  const left = base ? (base.endsWith("/") ? base.slice(0, -1) : base) : "";
  const right = path.startsWith("/") ? path : "/" + path;

  // กันกรณี path ขึ้นต้นด้วย base อยู่แล้ว
  if (left && (right === left || right.startsWith(left + "/"))) {
    return right;
  }
  return left + right;
}

function isJSON(res) {
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json");
}

// /** jfetch: ใช้กับทุก API เพื่อให้ base ตรงกันหมด */
// export async function jfetch(path, init = {}) {
//   const url = withBase(path);
//   const res = await fetch(url, {
//     headers: { "content-type": "application/json", ...(init.headers || {}) },
//     ...init,
//   });

//   if (!res.ok) {
//     let msg = `${res.status}: `;
//     try {
//       if (isJSON(res)) {
//         const data = await res.json();
//         msg += data?.detail || data?.message || JSON.stringify(data);
//       } else {
//         msg += await res.text();
//       }
//     } catch {
//       msg += res.statusText || "Request failed";
//     }
//     throw new Error(msg);
//   }
//   return isJSON(res) ? res.json() : res.text();
// }
/** jfetch: ใช้กับทุก API เพื่อให้ base ตรงกันหมด */
function _hasBody(res) {
  // no-body statuses per spec
  if (res.status === 204 || res.status === 205 || res.status === 304)
    return false;
  return true; // keep old behavior for 200/201 even if body is empty
}
function _isJSON(res) {
  const ct = res.headers.get("content-type") || "";
  return /\bapplication\/json\b/i.test(ct);
}

export async function jfetch(path, init = {}) {
  const url = withBase(path);
  const res = await fetch(url, {
    headers: { "content-type": "application/json", ...(init.headers || {}) },
    ...init,
  });

  if (!res.ok) {
    let msg = `${res.status}: `;
    try {
      if (_hasBody(res) && _isJSON(res)) {
        const data = await res.json();
        msg += data?.detail || data?.message || JSON.stringify(data);
      } else if (_hasBody(res)) {
        msg += await res.text();
      } else {
        msg += res.statusText || "Request failed";
      }
    } catch {
      msg += res.statusText || "Request failed";
    }
    throw new Error(msg);
  }

  // ✅ success: tolerate empty/no-content responses (e.g., DELETE 204)
  if (!_hasBody(res)) return null;

  // keep old behavior for everything else
  return _isJSON(res) ? res.json() : res.text();
}

// /static/js/api.js
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
  const text =
    msg === undefined || msg === null ? (ok ? "OK" : "Error") : String(msg);
  span.textContent = text; // ✅ ไม่มี undefined แล้ว
  t.style.borderColor = ok ? "#27d17d" : "#ef4444";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}
export const toast = showToast;

export function renderTable(el, rows) {
  /* ...ของเดิม... */
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
        await jfetch("/customers/keyset?limit=1");
        showToast("API OK ✅");
      } catch (err) {
        showToast(`Ping failed: ${err.message}`, false);
      }
    });
  }
}
