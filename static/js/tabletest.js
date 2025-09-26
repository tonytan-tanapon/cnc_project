// /static/js/page-customers.js
import { $, jfetch, toast } from "./api.js";
import { escapeHtml } from "./utils.js";

/* CONFIG */
const ENDPOINTS = {
  listKeyset: "/customers/keyset", // keyset/cursor listing
  base: "/customers", // CRUD base
  byId: (id) => `/customers/${encodeURIComponent(id)}`,
};

const LIST_EL_IDS = {
  inputSearch: "_q",
  selPerPage: "_per_page",
  pageInfo: "_page_info",
  listBody: "listBody",
};

const CTRL_IDS = {
  hint: "hint",
  errorBox: "errorBox",
  view: "detailView",
  btnEdit: "btnEdit",
  btnNew: "btnNew",
  btnSave: "btnSave",
  btnCancel: "btnCancel",
  btnDelete: "btnDelete",
};

const FIELD_KEYS = ["name", "code", "contact", "email", "phone", "address"];
const FIELD_LABELS = {
  code: "Code",
  name: "Name",
  contact: "Contact",
  email: "Email",
  phone: "Phone",
  address: "Address",
};
const FIELD_INPUT_TYPE = {
  name: "text",
  code: "text",
  contact: "text",
  email: "email",
  phone: "text",
  address: "textarea",
};

/* STATE */
let els = {};
let selectedId = null;
let initial = null; // ข้อมูลลูกค้าที่โหลดล่าสุด
let mode = "view"; // view | edit | create
let tempEdits = {}; // ค่า draft ตอนแก้ไข
let prevSelectedIdBeforeNew = null;
let isSubmitting = false;

let table = null; // Tabulator instance
let cursorBook = {}; // mapping page -> cursor (สำหรับ keyset)
let currentPage = 1;
let pageSize = 20;

/* UTILS */
const trim = (v) => (v == null ? "" : String(v).trim());
const setAriaDisabled = (node, disabled) => {
  if (!node) return;
  node.disabled = disabled;
  node.setAttribute("aria-disabled", String(disabled));
  node.classList.toggle("is-busy", !!disabled);
};
function setBusy(b) {
  [
    CTRL_IDS.btnEdit,
    CTRL_IDS.btnNew,
    CTRL_IDS.btnSave,
    CTRL_IDS.btnCancel,
    CTRL_IDS.btnDelete,
  ].forEach((id) => setAriaDisabled(els[id], b));
  if (els[CTRL_IDS.hint]) els[CTRL_IDS.hint].textContent = b ? "Working…" : "";
}
function primeTempEdits(base) {
  return FIELD_KEYS.reduce((acc, k) => {
    acc[k] = base?.[k] ?? "";
    return acc;
  }, {}); // ✅ has the {} initial value
}
function getWorkingData() {
  const base = mode === "create" ? {} : initial ?? {};
  return { ...base, ...tempEdits };
}
function focusField(key) {
  const el = els[CTRL_IDS.view]?.querySelector(
    `.kv-input[data-field="${CSS.escape(key)}"]`
  );
  el?.focus();
}
function setError(message) {
  if (!els[CTRL_IDS.errorBox]) return;
  if (!message) {
    els[CTRL_IDS.errorBox].style.display = "none";
    els[CTRL_IDS.errorBox].textContent = "";
  } else {
    els[CTRL_IDS.errorBox].style.display = "";
    els[CTRL_IDS.errorBox].textContent = message;
  }
}

/* MODE + RENDER (single entry point) */
function applyMode(nextMode) {
  if (nextMode) mode = nextMode;
  const editing = mode === "edit" || mode === "create";

  // ปุ่ม
  if (els[CTRL_IDS.btnSave])
    els[CTRL_IDS.btnSave].style.display = editing ? "" : "none";
  if (els[CTRL_IDS.btnCancel])
    els[CTRL_IDS.btnCancel].style.display = editing ? "" : "none";
  if (els[CTRL_IDS.btnEdit])
    els[CTRL_IDS.btnEdit].style.display = editing ? "none" : "";
  if (els[CTRL_IDS.btnNew])
    els[CTRL_IDS.btnNew].style.display = editing ? "none" : "";

  // เนื้อหา
  renderKV(getWorkingData());
}

/* RENDER: key:value (+ inputs เมื่อ edit/create) */
function renderKV(data = {}) {
  const holder = els[CTRL_IDS.view];
  if (!holder) return;

  const empty = !data || (Object.keys(data).length === 0 && mode !== "create");
  if (empty) {
    holder.innerHTML = `<div class="muted">Select a customer on the left</div>`;
    return;
  }

  const isEditing = mode === "edit" || mode === "create";
  const rows = FIELD_KEYS.map((key) => {
    const label = FIELD_LABELS[key];
    const current = Object.prototype.hasOwnProperty.call(tempEdits, key)
      ? tempEdits[key]
      : data[key] ?? "";
    const safeText = trim(current) === "" ? "—" : escapeHtml(String(current));

    let valHtml;
    if (isEditing) {
      if (FIELD_INPUT_TYPE[key] === "textarea") {
        valHtml = `<textarea class="kv-input" data-field="${key}" rows="3">${escapeHtml(
          String(current ?? "")
        )}</textarea>`;
      } else {
        valHtml = `<input class="kv-input" data-field="${key}" type="${
          FIELD_INPUT_TYPE[key] || "text"
        }" value="${escapeHtml(String(current ?? ""))}" />`;
      }
    } else {
      valHtml = safeText;
    }

    return `
      <div class="kv-row${isEditing ? " editing" : ""}" data-key="${key}">
        <div class="kv-key">${escapeHtml(label)}</div>
        <div class="kv-val" data-key="${key}">${valHtml}</div>
      </div>
    `;
  });

  holder.innerHTML = rows.join("");

  // double-click แถวไหน => เข้าโหมดแก้ (focus แถวที่คลิก)
  holder.querySelectorAll(".kv-row").forEach((row) => {
    row.addEventListener("dblclick", () => {
      const key = row.dataset.key;
      if (mode === "view") {
        tempEdits = primeTempEdits(initial);
        applyMode("edit");
        focusField(key);
      } else {
        focusField(key);
      }
    });
  });

  // key handlers ตอน edit/create
  if (isEditing) {
    holder.querySelectorAll(".kv-input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const k = e.target.dataset.field;
        tempEdits[k] = e.target.value;
      });
      input.addEventListener("keydown", (e) => {
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          e.target.tagName !== "TEXTAREA"
        ) {
          e.preventDefault();
          saveDetail();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelEdits();
        }
      });
    });
  }
}

/* DATA IO: detail */
async function loadDetail(id) {
  setBusy(true);
  setError("");
  try {
    const c = await jfetch(ENDPOINTS.byId(id));
    initial = c;
    tempEdits = {};
    document.title = `Customer · ${c.name ?? c.code ?? c.id}`;
    applyMode("view");
  } catch (e) {
    setError(e?.message || "Load failed");
    initial = null;
    tempEdits = {};
    document.title = "Customers · Topnotch MFG";
    applyMode("view");
  } finally {
    setBusy(false);
  }
}
function buildPayload() {
  const data = getWorkingData();
  return {
    name: trim(data.name),
    code: data.code ? String(data.code).toUpperCase() : null,
    contact: data.contact ? trim(data.contact) : null,
    email: data.email ? trim(data.email) : null,
    phone: data.phone ? trim(data.phone) : null,
    address: data.address ? trim(data.address) : null,
  };
}
async function saveDetail() {
  if (isSubmitting) return;
  const payload = buildPayload();
  if (!payload.name) {
    toast("Enter Name", false);
    if (mode === "view") {
      tempEdits = primeTempEdits(initial);
      applyMode("edit");
    } else {
      applyMode(); // re-render
    }
    focusField("name");
    return;
  }

  setBusy(true);
  isSubmitting = true;
  try {
    if (mode === "create" || !selectedId) {
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast("Customer created");
      selectedId = created.id ?? created.customer_id ?? created.customerId;
      initial = created;
      tempEdits = {};
      applyMode("view");

      // reload หน้าแรกให้ state ใหม่เข้า
      reloadTableFirstPage();
    } else {
      const updated = await jfetch(ENDPOINTS.byId(selectedId), {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      initial = updated;
      tempEdits = {};
      applyMode("view");
      toast("Saved");

      // อัปเดตแถวใน Tabulator ถ้าอยู่ในหน้า
      if (table) {
        const row =
          table.getRow(String(selectedId)) || table.getRow(Number(selectedId));
        if (row) {
          row.update({
            code: updated.code ?? "—",
            name: updated.name ?? "(no name)",
            contact: updated.contact ?? null,
            email: updated.email ?? null,
            phone: updated.phone ?? null,
            address: updated.address ?? null,
          });
        }
      }
    }
  } catch (e) {
    toast(e?.message || "Save failed", false);
  } finally {
    isSubmitting = false;
    setBusy(false);
  }
}
function cancelEdits() {
  tempEdits = {};
  if (mode === "create" && !initial) {
    if (prevSelectedIdBeforeNew) {
      const backId = prevSelectedIdBeforeNew;
      prevSelectedIdBeforeNew = null;
      mode = "view";
      selectCustomer(backId);
      return;
    } else {
      selectedId = null;
      initial = null;
      document.title = "Customers · Topnotch MFG";
      renderKV({});
    }
  } else {
    renderKV(initial || {});
  }
  applyMode("view");
}
async function deleteDetail() {
  if (!selectedId) return;
  if (!confirm("Delete?\nThis action cannot be undone.")) return;
  setBusy(true);
  try {
    await jfetch(ENDPOINTS.byId(selectedId), { method: "DELETE" });
    toast("Deleted");

    // ลบแถวในตาราง
    if (table) {
      const r =
        table.getRow(String(selectedId)) || table.getRow(Number(selectedId));
      r?.delete();
    }

    selectedId = null;
    initial = null;
    tempEdits = {};
    document.title = "Customers · Topnotch MFG";
    renderKV({});
    applyMode("view");
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  } finally {
    setBusy(false);
  }
}

/* SELECT */
async function selectCustomer(id) {
  selectedId = id;
  await loadDetail(id);
}

/* ===== Tabulator (List) ===== */
function makeColumns() {
  return [
    {
      title: "No.",
      field: "_rowno",
      width: 72,
      hozAlign: "right",
      headerHozAlign: "right",
      headerSort: true,
      formatter: (cell) => {
        const pos = cell.getRow().getPosition(true); // 1-based
        return (currentPage - 1) * pageSize + pos;
      },
    },
    { title: "Code", field: "code", width: 130, headerSort: true },
    { title: "Name", field: "name", headerSort: true },
    { title: "Contact", field: "contact", width: 160, tooltip: true },
    { title: "Email", field: "email", width: 220, tooltip: true },
    { title: "Phone", field: "phone", width: 140, tooltip: true },
    { title: "Address", field: "address", widthGrow: 3, tooltip: true },
    // title คือ header text
    // field คือ key ใน data
    // width, widthGrow, minWidth, maxWidth
    // hozAlign: "left" | "center" | "right"
    // headerHozAlign: "left" | "center" | "right"
    // headerSort: true (default) | false
    // tooltip: true แสดง full text เมื่อ hover (ถ้าโดนตัด)
  ];
}

/** fetch แบบ keyset/cursor (ใช้ /customers/keyset) */
async function fetchKeyset(params) {
  const size = params.size || pageSize;
  const page = params.page || 1;

  const keyword = trim(els[LIST_EL_IDS.inputSearch]?.value || "");
  const usp = new URLSearchParams();
  usp.set("limit", size);
  if (keyword) usp.set("q", keyword);

  // จัดการ cursor ตามหน้า
  const cursor = cursorBook[page] || null;
  if (cursor) usp.set("cursor", cursor);

  // sort ตัวแรก (แล้วแต่ backend รองรับ)
  if (params.sorters?.length) {
    usp.set("sort", params.sorters[0].field);
    usp.set("order", params.sorters[0].dir);
  }

  const url = `${ENDPOINTS.listKeyset}?${usp.toString()}`;
  const res = await jfetch(url);
  const items = res.items ?? res.data ?? [];
  const nextCursor = res.next_cursor ?? res.next ?? null;

  // เก็บ cursor สำหรับหน้า+1
  if (page === 1) cursorBook = { 1: null };
  if (nextCursor) cursorBook[page + 1] = nextCursor;

  // keyset ไม่รู้ last_page แน่ชัด
  const last = nextCursor ? page + 1 : page;

  return { data: items, last_page: last };
}

function updatePageInfo() {
  const info = els[LIST_EL_IDS.pageInfo];
  if (!info) return;
  const hasNext = cursorBook[currentPage + 1] != null;
  info.textContent = `Page ${currentPage} • ${pageSize}/page${
    hasNext ? " • more…" : ""
  }`;
}

function initCustomersTable() {
  const container = els[LIST_EL_IDS.listBody];
  if (!container) return;

  pageSize = Number(els[LIST_EL_IDS.selPerPage]?.value || 20);

  table = new Tabulator(container, {
    layout: "fitColumns",
    height: "calc(100vh - 260px)",
    headerVisible: true,
    columns: makeColumns(),
    headerSortTristate: true,
    columnDefaults: { tooltip: true },
    reactiveData: false,

    // ✅ use keyset endpoint
    ajaxURL: ENDPOINTS.listKeyset,

    // Remote pagination
    pagination: true,
    paginationMode: "remote",
    paginationSize: pageSize,

    ajaxSorting: true,
    // sortMode: "remote",
    filterMode: "remote",
    selectableRows: 1,
    placeholder: "No customers",

    ajaxRequestFunc: async (url, config, params) => {
      const data = await fetchKeyset(params);
      return data; // { data: [...], last_page: N }
    },
  });

  // wait until table is ready before loading first page
  table.on("tableBuilt", () => {
    reloadTableFirstPage();
  });

  // เลือกแถว -> โหลด detail
  table.on("rowClick", async (e, row) => {
    const data = row.getData();
    const id = data.id ?? data.customer_id ?? data.customerId;
    if (!id) return;
    selectedId = String(id);
    await selectCustomer(id);
    row.select();
  });

  // อัปเดต page state
  table.on("pageLoaded", (pageno) => {
    currentPage = pageno;
    updatePageInfo();
  });

  // หลังโหลดเสร็จ ครั้งแรกเลือกแถวแรก
  table.on("dataLoaded", () => {
    const rows = table.getRows();
    if (rows?.length) {
      const first = rows[0];
      const d = first.getData();
      const id = d.id ?? d.customer_id ?? d.customerId;
      if (id && String(id) !== String(selectedId)) {
        selectedId = String(id);
        selectCustomer(id);
        first.select();
      }
    } else {
      selectedId = null;
      initial = null;
      tempEdits = {};
      document.title = "Customers · Topnotch MFG";
      applyMode("view");
    }
  });
}

/* Bind topbar & footer controls */
function reloadTableFirstPage() {
  cursorBook = { 1: null };
  currentPage = 1;
  table?.setPage(1);
}
function bindSearchBox() {
  const box = els[LIST_EL_IDS.inputSearch];
  if (!box) return;
  let t = null;
  box.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => reloadTableFirstPage(), 300);
  });
}
function bindPerPageSelect() {
  const sel = els[LIST_EL_IDS.selPerPage];
  if (!sel) return;
  sel.addEventListener("change", () => {
    pageSize = Number(sel.value || 20);
    table?.setPageSize(pageSize);
    reloadTableFirstPage();
  });
}

/* BOOT */
document.addEventListener("DOMContentLoaded", () => {
  // cache
  Object.values(LIST_EL_IDS).forEach((id) => (els[id] = $(id)));
  Object.values(CTRL_IDS).forEach((id) => (els[id] = $(id)));

  // ปุ่มโหมด
  els[CTRL_IDS.btnEdit]?.addEventListener("click", () => {
    if (!initial) return;
    tempEdits = primeTempEdits(initial);
    applyMode("edit");
    focusField("name");
  });

  els[CTRL_IDS.btnNew]?.addEventListener("click", () => {
    prevSelectedIdBeforeNew = selectedId;
    selectedId = null;
    initial = null;
    tempEdits = primeTempEdits({});
    applyMode("create");
    focusField("name");
  });

  els[CTRL_IDS.btnSave]?.addEventListener("click", saveDetail);
  els[CTRL_IDS.btnCancel]?.addEventListener("click", cancelEdits);
  els[CTRL_IDS.btnDelete]?.addEventListener("click", deleteDetail);

  // === ใช้ Tabulator เป็น list ===
  initCustomersTable();
  bindSearchBox();
  bindPerPageSelect();

  // ฝั่ง details
  renderKV({});
  applyMode("view");

  // โหลดหน้าแรก
  reloadTableFirstPage();
});
