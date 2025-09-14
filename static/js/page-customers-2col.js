// /static/js/page-customers-split.js
import { $, jfetch, toast } from "./api.js";
import { escapeHtml } from "./utils.js";
import { createListPager } from "./list-pager.js?v=2";

/* ---------------- CONFIG ---------------- */

const ENDPOINTS = {
  listKeyset: "/customers/keyset",
  byId: (id) => `/customers/${encodeURIComponent(id)}`, // GET/PUT/DELETE
};

const LIST_EL_IDS = {
  inputSearch: "_q",
  selPerPage: "_per_page",
  btnPrev: "_prev",
  btnNext: "_next",
  pageInfo: "_page_info",
  listBody: "listBody", // container แสดงรายการลูกค้า
};

const CTRL_IDS = {
  btnSave: "btnSave",
  btnReset: "btnReset",
  btnDelete: "btnDelete",
  hint: "hint",
  errorBox: "errorBox",
};

const FIELD_MAP = {
  code: "c_code",
  name: "c_name",
  phone: "c_phone",
  contact: "c_contact",
  email: "c_email",
  address: "c_addr",
};

/* ---------------- STATE ---------------- */

let els = {};
let selectedId = null; // id ลูกค้าที่เลือกทางซ้าย
let initial = null; // customer object ที่โหลดล่าสุด (ใช้ Reset)

/* ---------------- UTILS ---------------- */

const trim = (v) => (v == null ? "" : String(v).trim());
const trimOrNull = (v) => {
  const s = trim(v);
  return s === "" ? null : s;
};

function setBusy(b) {
  els[CTRL_IDS.btnSave] && (els[CTRL_IDS.btnSave].disabled = b);
  els[CTRL_IDS.btnReset] && (els[CTRL_IDS.btnReset].disabled = b);
  els[CTRL_IDS.btnDelete] && (els[CTRL_IDS.btnDelete].disabled = b);
  els[CTRL_IDS.hint] && (els[CTRL_IDS.hint].textContent = b ? "Working…" : "");
}

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
  // uppercase code
  if (payload.code && typeof payload.code === "string") {
    payload.code = payload.code.toUpperCase();
  }
  return payload;
}

function highlightSelected() {
  const items = els[LIST_EL_IDS.listBody]?.querySelectorAll(".cust-item");
  items?.forEach((it) => {
    it.classList.toggle("active", String(it.dataset.id) === String(selectedId));
  });
}

function renderList(container, rows) {
  if (!container) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    container.innerHTML = `<div class="hint" style="padding:12px">No customers</div>`;
    return;
  }

  container.innerHTML = rows
    .map((r) => {
      const id = r.id ?? r.customer_id ?? r.customerId;
      const code = escapeHtml(r.code ?? "");
      const name = escapeHtml(r.name ?? "");
      const sub = escapeHtml(r.contact || r.email || r.phone || "");
      return `
        <div class="cust-item" data-id="${id}">
          <div class="cust-code">${code || "—"}</div>
          <div>
            <div class="cust-name">${name || "(no name)"}</div>
            <div class="cust-sub">${sub}</div>
          </div>
        </div>
      `;
    })
    .join("");

  // bind click
  container.querySelectorAll(".cust-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.id;
      if (!id) return;
      if (String(id) === String(selectedId)) return; // same
      selectCustomer(id);
    });
  });

  // refresh selected style
  highlightSelected();
}

/* ---------------- DATA IO (DETAIL) ---------------- */

async function loadDetail(id) {
  setBusy(true);
  try {
    const c = await jfetch(ENDPOINTS.byId(id));
    initial = c;
    fillForm(c);
    document.title = `Customer · ${c.name ?? c.code ?? c.id}`;
    els[CTRL_IDS.errorBox] && (els[CTRL_IDS.errorBox].style.display = "none");
  } catch (e) {
    if (els[CTRL_IDS.errorBox]) {
      els[CTRL_IDS.errorBox].style.display = "";
      els[CTRL_IDS.errorBox].textContent = e?.message || "Load failed";
    }
    initial = null;
    fillForm({});
  } finally {
    setBusy(false);
  }
}

async function saveDetail() {
  if (!selectedId) return;
  const payload = readForm();
  if (!payload.name) {
    toast("Enter Name", false);
    els[FIELD_MAP.name]?.focus();
    return;
  }
  setBusy(true);
  try {
    const updated = await jfetch(ENDPOINTS.byId(selectedId), {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    initial = updated;
    fillForm(updated);
    toast("Saved");
    // อัปเดตรายการฝั่งซ้าย (ชื่อ/โค้ด) แบบเร็ว ๆ
    const node = els[LIST_EL_IDS.listBody]?.querySelector(
      `.cust-item[data-id="${CSS.escape(String(selectedId))}"]`
    );
    if (node) {
      node.querySelector(".cust-code").textContent = updated.code ?? "—";
      node.querySelector(".cust-name").textContent =
        updated.name ?? "(no name)";
      node.querySelector(".cust-sub").textContent =
        updated.contact || updated.email || updated.phone || "";
    }
  } catch (e) {
    toast(e?.message || "Save failed", false);
  } finally {
    setBusy(false);
  }
}

async function deleteDetail() {
  if (!selectedId) return;
  if (!confirm("Delete?\nThis action cannot be undone.")) return;
  setBusy(true);
  try {
    await jfetch(ENDPOINTS.byId(selectedId), { method: "DELETE" });
    toast("Deleted");
    // ลบไอเท็มออกจาก list
    const node = els[LIST_EL_IDS.listBody]?.querySelector(
      `.cust-item[data-id="${CSS.escape(String(selectedId))}"]`
    );
    node?.remove();
    selectedId = null;
    initial = null;
    fillForm({});
    document.title = "Customer · Topnotch MFG";
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  } finally {
    setBusy(false);
  }
}

function resetDetail() {
  if (!initial) return;
  fillForm(initial);
  toast("Reset");
}

/* ---------------- SELECT LOGIC ---------------- */

async function selectCustomer(id) {
  selectedId = id;
  highlightSelected();
  await loadDetail(id);
}

/* ---------------- BOOT ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  // cache list controls
  Object.values(LIST_EL_IDS).forEach((id) => (els[id] = $(id)));
  // cache detail controls
  Object.values(CTRL_IDS).forEach((id) => (els[id] = $(id)));
  // cache detail fields
  Object.values(FIELD_MAP).forEach((id) => (els[id] = $(id)));

  // bind detail buttons
  els[CTRL_IDS.btnSave]?.addEventListener("click", saveDetail);
  els[CTRL_IDS.btnReset]?.addEventListener("click", resetDetail);
  els[CTRL_IDS.btnDelete]?.addEventListener("click", deleteDetail);
  els[FIELD_MAP.name]?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveDetail();
  });

  // list pager (ใช้ renderList แทนตาราง)
  const lp = createListPager({
    url: ENDPOINTS.listKeyset,
    pageSize: Number(els[LIST_EL_IDS.selPerPage]?.value || 20),
    container: els[LIST_EL_IDS.listBody],
    render: (container, rows) => renderList(container, rows),
    pageInfoEls: [els[LIST_EL_IDS.pageInfo]],
    prevButtons: [els[LIST_EL_IDS.btnPrev]],
    nextButtons: [els[LIST_EL_IDS.btnNext]],
    queryKey: "q",
    // เลือกอัตโนมัติแถวแรกในเพจเมื่อโหลดเสร็จ
    onAfterRender: async (rows) => {
      if (!rows || rows.length === 0) {
        selectedId = null;
        initial = null;
        fillForm({});
        document.title = "Customer · Topnotch MFG";
        return;
      }
      // ถ้า selectedId ยังไม่มีหรือไม่อยู่ในเพจนี้ เลือกคนแรก
      const idsInPage = rows
        .map((r) => r.id ?? r.customer_id ?? r.customerId)
        .map(String);
      if (!selectedId || !idsInPage.includes(String(selectedId))) {
        await selectCustomer(idsInPage[0]);
      } else {
        // แค่รีไฮไลต์ ไม่โหลดใหม่
        highlightSelected();
      }
    },
  });

  // bind search/perpage
  lp.bindSearch(els[LIST_EL_IDS.inputSearch], { debounceMs: 300 });
  lp.bindPerPage(els[LIST_EL_IDS.selPerPage]);

  // first load
  lp.reloadFirst();
});
