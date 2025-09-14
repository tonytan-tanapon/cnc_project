// /static/js/page-customer-detail.js
import { $, jfetch, toast } from "./api.js";

/* ───────────────── CONFIG ───────────────── */

// Query string: eg. customer-detail.html?id=123
const qs = new URLSearchParams(location.search);
const _id = qs.get("id");

// endpoint หลัก (รวมไว้จุดเดียว)
const ENDPOINTS = {
  base: "/customers",
  byId: (id) => `/customers/${encodeURIComponent(id)}`, // GET/PUT/DELETE
};

// id controls (ปุ่ม/กล่องข้อความ) รวมไว้แมปเดียว
const CTRL_IDS = {
  btnSave: "btnSave",
  btnReset: "btnReset",
  btnDelete: "btnDelete",
  hint: "hint",
  errorBox: "errorBox",
};

// ฟิลด์ฟอร์ม: { payloadKey: elementId }
const FIELD_MAP = {
  code: "c_code",
  name: "c_name",
  phone: "c_phone",
  contact: "c_contact",
  email: "c_email",
  address: "c_addr",
};

/* ───────────────── STATE ───────────────── */

let initial = null; // สำหรับ Reset
let els = {}; // element refs หลัง DOM พร้อม

/* ───────────────── UTILS ───────────────── */

const trim = (v) => (v == null ? "" : String(v).trim());
const trimOrNull = (v) => {
  const s = trim(v);
  return s === "" ? null : s;
};

/* ─────────────── FORM BIND/READ ─────────────── */

function fillForm(data = {}) {
  Object.entries(FIELD_MAP).forEach(([key, id]) => {
    const el = els[id];
    if (!el) return;
    el.value = data[key] ?? "";
  });
}

function readForm() {
  const payload = {};
  Object.entries(FIELD_MAP).forEach(([key, id]) => {
    const el = els[id];
    if (!el) return;
    payload[key] = key === "name" ? trim(el.value) : trimOrNull(el.value);
  });
  return payload;
}

function setBusy(b) {
  els[CTRL_IDS.btnSave] && (els[CTRL_IDS.btnSave].disabled = b);
  els[CTRL_IDS.btnReset] && (els[CTRL_IDS.btnReset].disabled = b);
  els[CTRL_IDS.btnDelete] && (els[CTRL_IDS.btnDelete].disabled = b);
  els[CTRL_IDS.hint] && (els[CTRL_IDS.hint].textContent = b ? "Working…" : "");
}

/* ───────────────── DATA IO ───────────────── */

async function loadCustomer() {
  if (!_id) {
    if (els[CTRL_IDS.errorBox]) {
      els[CTRL_IDS.errorBox].style.display = "";
      els[CTRL_IDS.errorBox].textContent = "Missing ?id= in URL";
    }
    setBusy(true);
    return;
  }
  setBusy(true);
  try {
    const c = await jfetch(ENDPOINTS.byId(_id));
    initial = c;
    fillForm(c);
    document.title = `Customer · ${c.name ?? c.code ?? c.id}`;
  } catch (e) {
    if (els[CTRL_IDS.errorBox]) {
      els[CTRL_IDS.errorBox].style.display = "";
      els[CTRL_IDS.errorBox].textContent = e?.message || "Load failed";
    }
  } finally {
    setBusy(false);
  }
}

async function saveCustomer() {
  const payload = readForm();

  if (!payload.name) {
    toast("Enter Name", false);
    els[FIELD_MAP.name]?.focus();
    return;
  }
  if (payload.code && typeof payload.code === "string") {
    payload.code = payload.code.toUpperCase();
  }

  setBusy(true);
  try {
    const updated = await jfetch(ENDPOINTS.byId(_id), {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    initial = updated;
    fillForm(updated);
    toast("Saved");
  } catch (e) {
    // ตัวอย่างจาก backend:
    // 409 "Customer code already exists"
    // 400 "'name' is required"
    toast(e?.message || "Save failed", false);
  } finally {
    setBusy(false);
  }
}

async function deleteCustomer() {
  if (!confirm("Delete?\nThis action cannot be undone.")) return;
  setBusy(true);
  try {
    await jfetch(ENDPOINTS.byId(_id), { method: "DELETE" });
    toast("Deleted");
    location.href = "/static/customers.html";
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  } finally {
    setBusy(false);
  }
}

function resetForm() {
  if (!initial) return;
  fillForm(initial);
  toast("Reset");
}

/* ───────────────── BOOT ───────────────── */

document.addEventListener("DOMContentLoaded", () => {
  // cache ฟิลด์ฟอร์ม
  Object.values(FIELD_MAP).forEach((id) => (els[id] = $(id)));
  // cache controls
  Object.values(CTRL_IDS).forEach((id) => (els[id] = $(id)));

  // bind events
  els[CTRL_IDS.btnSave] &&
    els[CTRL_IDS.btnSave].addEventListener("click", saveCustomer);
  els[CTRL_IDS.btnReset] &&
    els[CTRL_IDS.btnReset].addEventListener("click", resetForm);
  els[CTRL_IDS.btnDelete] &&
    els[CTRL_IDS.btnDelete].addEventListener("click", deleteCustomer);

  // Enter ที่ช่อง name = save เร็ว
  els[FIELD_MAP.name]?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveCustomer();
  });

  loadCustomer();
});
