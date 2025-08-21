// /static/js/pages/customers.js
import { $, jfetch, toast } from "../api.js";

let disposers = [];
let rowsCache = [];
let editingId = null; // แถวที่กำลังแก้ไขอยู่

function on(el, ev, fn) {
  if (!el) return;
  el.addEventListener(ev, fn);
  disposers.push(() => el.removeEventListener(ev, fn));
}

const esc = (v) =>
  v == null ? "" : String(v).replace(/[&<>"]/g, s => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[s]));
const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

// ---------- render ----------
function renderTableCustom(target, rows) {
  const cols = ["id", "code", "name", "contact", "email", "phone", "address", "actions"];
  const thead = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>`;

  const body = rows.map(r => {
    const isEdit = editingId === r.id;

    const cell = (field, editable=false) => {
      if (!isEdit || !editable) return `<td>${esc(r[field])}</td>`;
      const id = `c_${field}_${r.id}`;
      return `<td><input id="${id}" value="${esc(r[field]??"")}" /></td>`;
    };

    const actions = isEdit
      ? `<button class="btn" data-action="save" data-id="${r.id}">Save</button>
         <button class="btn" data-action="cancel">Cancel</button>`
      : `<button class="btn" data-action="edit" data-id="${r.id}">Update</button>
         <button class="btn" data-action="delete" data-id="${r.id}">Delete</button>`;

    return `<tr data-row="${r.id}">
      <td>${r.id}</td>
      ${cell("code", true)}
      ${cell("name", true)}
      ${cell("contact", true)}
      ${cell("email", true)}
      ${cell("phone", true)}
      ${cell("address", true)}
      <td>${actions}</td>
    </tr>`;
  }).join("");

  target.innerHTML = `<div style="overflow:auto"><table>${thead}<tbody>${body}</tbody></table></div>`;
}

async function reloadAndRender() {
  const q = $("c_q")?.value?.trim();
  const path = "/customers" + (q ? `?q=${encodeURIComponent(q)}` : "");
  try {
    rowsCache = await jfetch(path);
    renderTableCustom($("c_table"), rowsCache);
  } catch (e) {
    $("c_table").innerHTML = `<div class="hint">${e.message}</div>`;
  }
}

// ---------- actions ----------
async function createCustomer() {
  const payload = {
    code: $("c_code").value.trim(),
    name: $("c_name").value.trim(),
    contact: strOrNull($("c_contact").value),
    email: strOrNull($("c_email").value),
    phone: strOrNull($("c_phone").value),
    address: strOrNull($("c_addr").value),
  };
  if (!payload.name) { toast("กรอกชื่อลูกค้าก่อนนะ", false); return; }

  try {
    await jfetch("/customers", { method: "POST", body: JSON.stringify(payload) });
    toast("สร้างลูกค้าเรียบร้อย");
    ["c_code","c_name","c_contact","c_email","c_phone","c_addr"].forEach(id => $(id).value="");
    await reloadAndRender();
  } catch (e) {
    toast(e.message, false);
  }
}

function startEdit(id) {
  editingId = id;
  renderTableCustom($("c_table"), rowsCache);
}

function cancelEdit() {
  editingId = null;
  renderTableCustom($("c_table"), rowsCache);
}

async function saveEdit(id) {
  // อ่านค่าจาก input ของแถวนั้น
  const get = (f) => document.getElementById(`c_${f}_${id}`)?.value ?? "";
  const payload = {
    code: strOrNull(get("code"))?.toUpperCase(),
    name: strOrNull(get("name")),
    contact: strOrNull(get("contact")),
    email: strOrNull(get("email")),
    phone: strOrNull(get("phone")),
    address: strOrNull(get("address")),
  };

  if (!payload.name) { toast("ชื่อห้ามว่าง", false); return; }

  try {
    await jfetch(`/customers/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    toast("บันทึกแล้ว");
    editingId = null;
    await reloadAndRender();
  } catch (e) {
    toast(e.message, false);
  }
}

async function deleteRow(id) {
  if (!confirm("ลบลูกค้ารายการนี้?")) return;
  try {
    await jfetch(`/customers/${id}`, { method: "DELETE" });
    toast("ลบสำเร็จ");
    await reloadAndRender();
  } catch (e) {
    toast(e.message, false);
  }
}

// ---------- life-cycle ----------
function onTableClick(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = Number(btn.dataset.id);

  if (action === "edit") startEdit(id);
  else if (action === "cancel") cancelEdit();
  else if (action === "save") saveEdit(id);
  else if (action === "delete") deleteRow(id);
}

export async function mount() {
  on($("c_create"), "click", createCustomer);
  on($("c_reload"), "click", reloadAndRender);
  on($("c_q"), "keydown", (e) => { if (e.key === "Enter") reloadAndRender(); });
  on($("c_table"), "click", onTableClick); // event delegation ให้ปุ่มในตาราง

  await reloadAndRender();
}

export function unmount() {
  disposers.forEach((off) => off());
  disposers = [];
  editingId = null;
  rowsCache = [];
}
