// /static/js/page-pos.js (v12 - Tabulator list)
import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

/* ==== endpoints ==== */
const ENDPOINTS = {
  list: (p) => `/pos?${p}`, // expects {items,total}
  base: `/pos`,
  byId: (id) => `/pos/${encodeURIComponent(id)}`,
};

/* ==== list refs ==== */
const inputSearch = $("po_q");
const selPerPage = $("po_per_page");
const btnPrevTop = $("po_prev");
const btnNextTop = $("po_next");
const pageInfoTop = $("po_page_info");
const btnPrevBot = $("po_prev2");
const btnNextBot = $("po_next2");
const pageInfoBot = $("po_page_info2");
const tableBody = $("po_table");
const btnReload = $("po_reload");

/* ==== detail refs ==== */
const hintEl = $("po_hint");
const errEl = $("po_error");
const viewEl = $("po_view");
const btnEdit = $("po_btnEdit");
const btnNew = $("po_btnNew");
const btnSave = $("po_btnSave");
const btnCancel = $("po_btnCancel");
const btnDelete = $("po_btnDelete");

/* ==== state ==== */
let table = null;                 // Tabulator instance
let selectedId = null;            // PO id selected from list
let initial = null;               // current PO detail
let mode = "view";                // view | edit | create
let tempEdits = {};               // draft changes
let isSubmitting = false;
let currentPage = 1;
let pageSize = Number(selPerPage?.value || 20);
let totalItems = 0;

const FIELD_KEYS = ["po_number", "customer", "description", "created_at"];
const FIELD_LABELS = {
  po_number: "PO No.",
  customer: "Customer",
  description: "Description",
  created_at: "Created",
};
const INPUT_TYPE = { po_number: "text", description: "textarea" };

/* ==== config: autocomplete ==== */
const OPEN_CUSTOMER_SUGGEST_ON_FOCUS = true;
const MIN_CHARS_FOR_CUSTOMER = 0;

/* ==== utils ==== */
const safe = (s) => String(s ?? "").replaceAll("<", "&lt;");
const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleString();
};
const debounce = (fn, ms = 300) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};
const trim = (v) => (v == null ? "" : String(v).trim());

function setBusy(b) {
  [btnEdit, btnNew, btnSave, btnCancel, btnDelete].forEach((el) => {
    if (!el) return;
    el.disabled = !!b;
    el.setAttribute("aria-disabled", String(b));
    el.classList.toggle("is-busy", !!b);
  });
  if (hintEl) hintEl.textContent = b ? "Working…" : "";
}
function setError(msg) {
  if (!errEl) return;
  if (!msg) { errEl.style.display = "none"; errEl.textContent = ""; }
  else { errEl.style.display = ""; errEl.textContent = msg; }
}

/* ===================== Autocomplete (Customer) ===================== */
let selectedCustomer = null; // { id, code, name }

async function searchCustomers(term) {
  const q = (term || "").trim();

  if (OPEN_CUSTOMER_SUGGEST_ON_FOCUS && q.length === 0) {
    try {
      const res = await jfetch(`/customers/keyset?limit=10`);
      const items = Array.isArray(res) ? res : res.items ?? [];
      return items.map((x) => ({
        id: x.id ?? x.customer_id ?? x.customerId,
        code: x.code ?? "",
        name: x.name ?? "",
      }));
    } catch { return []; }
  }
  if (!q) return [];
  try {
    const res = await jfetch(`/customers?q=${encodeURIComponent(q)}&page=1&page_size=10`);
    const items = Array.isArray(res) ? res : res.items ?? [];
    return items.map((x) => ({
      id: x.id ?? x.customer_id ?? x.customerId,
      code: x.code ?? "",
      name: x.name ?? "",
    }));
  } catch {
    try {
      const res2 = await jfetch(`/customers/keyset?q=${encodeURIComponent(q)}&limit=10`);
      const items2 = Array.isArray(res2) ? res2 : res2.items ?? [];
      return items2.map((x) => ({
        id: x.id ?? x.customer_id ?? x.customerId,
        code: x.code ?? "",
        name: x.name ?? "",
      }));
    } catch { return []; }
  }
}

function buildCustomerInput(current) {
  const input = document.createElement("input");
  input.className = "kv-input";
  input.dataset.field = "customer";
  input.placeholder = "Type to search…";
  input.autocomplete = "off";
  input.value = current?.code ? `${current.code} — ${current.name ?? ""}` : "";

  selectedCustomer = current?.id
    ? { id: current.id, code: current.code ?? "", name: current.name ?? "" }
    : null;

  attachAutocomplete(input, {
    fetchItems: searchCustomers,
    getDisplayValue: (it) => (it ? `${it.code} — ${it.name}` : ""),
    renderItem: (it) => `<div class="ac-row"><b>${it.code}</b> — ${it.name}</div>`,
    onPick: (it) => { selectedCustomer = it || null; input.value = it ? `${it.code} — ${it.name}` : ""; },
    openOnFocus: true,
    minChars: MIN_CHARS_FOR_CUSTOMER,
    debounceMs: 200,
    maxHeight: 260,
  });

  input.addEventListener("input", () => { selectedCustomer = null; });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); cancelEdits(); }
  });
  return input;
}

/* ===================== MODE SHIM ===================== */
function applyMode(nextMode) {
  if (nextMode) mode = nextMode;
  renderDetail(getWorkingData());
}

/* ===================== DETAIL (CRUD) ===================== */
function primeEdits(base) {
  return {
    po_number: base?.po_number ?? "",
    customer: base?.customer ? {
      id: base.customer.id, code: base.customer.code, name: base.customer.name,
    } : null,
    description: base?.description ?? "",
    created_at: base?.created_at ?? null,
  };
}
function getWorkingData() {
  const base = mode === "create" ? {} : (initial ?? {});
  return { ...base, ...tempEdits };
}
function focusField(key) {
  const el = viewEl?.querySelector(`.kv-input[data-field="${CSS.escape(key)}"]`);
  el?.focus();
}

function renderDetail(data = {}) {
  if (!viewEl) return;

  const empty = !data || (Object.keys(data).length === 0 && mode !== "create");
  if (empty) { viewEl.innerHTML = `<div class="muted">Select a PO on the left</div>`; return; }

  const editing = mode === "edit" || mode === "create";
  const pick = (k, fallback = "") =>
    Object.prototype.hasOwnProperty.call(tempEdits, k) ? tempEdits[k] : (data[k] ?? fallback);

  const rows = FIELD_KEYS.map((key) => {
    const label = FIELD_LABELS[key];
    const current = pick(key, null);

    let valHtml = "";
    if (!editing) {
      if (key === "customer") {
        valHtml = current ? `${safe(current.code ?? "")} — ${safe(current.name ?? "")}` : "—";
      } else if (key === "created_at") {
        valHtml = fmtDate(current);
      } else {
        const text = trim(current ?? "");
        valHtml = text === "" ? "—" : safe(text);
      }
    } else {
      if (key === "customer") {
        valHtml = '<div data-field="customer"></div>';
      } else if (INPUT_TYPE[key] === "textarea") {
        valHtml = `<textarea class="kv-input" data-field="${key}" rows="3">${safe(current ?? "")}</textarea>`;
      } else if (key === "created_at") {
        valHtml = fmtDate(current) || "—";
      } else {
        valHtml = `<input class="kv-input" data-field="${key}" type="${INPUT_TYPE[key] || "text"}" value="${safe(current ?? "")}" />`;
      }
    }

    return `
      <div class="kv-row${editing ? " editing" : ""}" data-key="${key}">
        <div class="kv-key">${safe(label)}</div>
        <div class="kv-val" data-key="${key}">${valHtml}</div>
      </div>
    `;
  }).join("");

  viewEl.innerHTML = rows;

  // dblclick -> edit
  viewEl.querySelectorAll(".kv-row").forEach((row) => {
    row.addEventListener("dblclick", () => {
      const key = row.dataset.key;
      if (mode === "view") {
        tempEdits = primeEdits(initial);
        applyMode("edit");
        focusField(key);
      } else {
        focusField(key);
      }
    });
  });

  if (editing) {
    // customer autocomplete input
    const custHolder =
      viewEl.querySelector('.kv-val[data-key="customer"] [data-field="customer"]') ||
      viewEl.querySelector('.kv-val[data-key="customer"] div[data-field="customer"]') ||
      viewEl.querySelector('.kv-val[data-key="customer"]');
    if (custHolder) {
      const input = buildCustomerInput(pick("customer", null));
      custHolder.replaceChildren(input);
    }

    // inputs
    viewEl.querySelectorAll(".kv-input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const k = e.target.dataset.field;
        tempEdits[k] = e.target.value;
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "TEXTAREA") {
          e.preventDefault(); saveDetail();
        } else if (e.key === "Escape") {
          e.preventDefault(); cancelEdits();
        }
      });
    });
  }

  // buttons visibility
  btnSave.style.display = editing ? "" : "none";
  btnCancel.style.display = editing ? "" : "none";
  btnEdit.style.display = editing ? "none" : "";
  btnNew.style.display = editing ? "none" : "";
}

async function loadDetail(id) {
  setBusy(true); setError("");
  try {
    const data = await jfetch(ENDPOINTS.byId(id));
    initial = data; tempEdits = {}; mode = "view"; renderDetail(initial);
  } catch (e) {
    setError(e?.message || "Load failed");
    initial = null; tempEdits = {}; mode = "view"; renderDetail({});
  } finally { setBusy(false); }
}

function buildPayload() {
  const data = getWorkingData();
  const customer_id = selectedCustomer?.id ?? data.customer?.id ?? null;
  return {
    po_number: trim(data.po_number) || null,
    customer_id,
    description: data.description ? trim(data.description) : "",
  };
}

async function saveDetail() {
  if (isSubmitting) return;

  const payload = buildPayload();
  if (!payload.customer_id) {
    toast("Select Customer !!", false);
    focusField("customer");
    return;
  }

  setBusy(true); isSubmitting = true;
  try {
    if (mode === "create" || !selectedId) {
      const created = await jfetch(ENDPOINTS.base, { method: "POST", body: JSON.stringify(payload) });
      toast("PO created");
      selectedId = created.id;
      initial = created; tempEdits = {}; mode = "view"; renderDetail(initial);
      reloadTableFirstPage(true /* keepSelection */);
    } else {
      const updated = await jfetch(ENDPOINTS.byId(selectedId), { method: "PUT", body: JSON.stringify(payload) });
      toast("Saved");
      initial = updated; tempEdits = {}; mode = "view"; renderDetail(initial);

      // update row in table if visible
      if (table) {
        const r = table.getRow(String(selectedId)) || table.getRow(Number(selectedId));
        if (r) {
          r.update({
            po_number: updated.po_number,
            customer_code: updated.customer?.code ?? "",
            customer_name: updated.customer?.name ?? "",
            description: updated.description ?? "",
            created_at: updated.created_at ?? null,
          });
        }
      }
    }
  } catch (e) {
    toast(e?.message || "Save failed", false);
  } finally { isSubmitting = false; setBusy(false); }
}

function cancelEdits() {
  tempEdits = {}; mode = "view"; renderDetail(initial || {});
}

async function deleteDetail() {
  if (!selectedId) return;
  if (!confirm("Delete?\nThis action cannot be undone.")) return;
  setBusy(true);
  try {
    await jfetch(ENDPOINTS.byId(selectedId), { method: "DELETE" });
    toast("Deleted");
    selectedId = null; initial = null; tempEdits = {}; mode = "view"; renderDetail({});
    reloadTableFirstPage();
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  } finally { setBusy(false); }
}

async function selectPo(id, opts = {}) {
  selectedId = id;
  await loadDetail(id);
  if (!opts?.silentScroll) { /* no-op for Tabulator */ }
}

/* ===================== Tabulator (List) ===================== */
function makeColumns() {
  return [
    {
      title: "No.",
      field: "_rowno",
      width: 72,
      hozAlign: "right",
      headerHozAlign: "right",
      headerSort: false,
      formatter: (cell) => {
        const pos = cell.getRow().getPosition(true); // 1-based index in current page
        return (currentPage - 1) * pageSize + pos;
      },
    },
    { title: "PO No.", field: "po_number", width: 140, headerSort: true, formatter: (cell) => {
        const v = cell.getValue() ?? "";
        return `<a href="javascript:void(0)">${safe(v)}</a>`;
      }
    },
    { title: "Customer", field: "customer_disp", width: 260, headerSort: true },
    { title: "Description", field: "description", headerSort: false, tooltip: true },
    { title: "Created", field: "created_at", width: 180, headerSort: true, formatter: (cell) => fmtDate(cell.getValue()) },
  ];
}

function computeLastPage(total, size) {
  if (!total || !size) return currentPage; // fallback
  return Math.max(1, Math.ceil(total / size));
}

function updatePageInfo() {
  const totalPages = computeLastPage(totalItems, pageSize);
  const label = `Page ${currentPage} / ${totalPages} • ${pageSize}/page${totalItems ? ` • total ${totalItems}` : ""}`;
  if (pageInfoTop) pageInfoTop.textContent = label;
  if (pageInfoBot) pageInfoBot.textContent = label;

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  [btnPrevTop, btnPrevBot].forEach((b) => b?.toggleAttribute("disabled", !canPrev));
  [btnNextTop, btnNextBot].forEach((b) => b?.toggleAttribute("disabled", !canNext));
}

async function tabulatorRequest(params) {
  // Tabulator gives {page, size, sorters, filters}
  const page = params.page || 1;
  const size = params.size || pageSize;

  const q = (inputSearch?.value || "").trim();
  const usp = new URLSearchParams();
  usp.set("page", page);
  usp.set("page_size", size);
  if (q) usp.set("q", q);
  // optional sort (takes first sorter)
  if (params.sorters?.length) {
    const s = params.sorters[0];
    usp.set("sort", s.field);
    usp.set("order", s.dir); // "asc" | "desc"
  }
  // cache buster
  usp.set("_", String(Date.now()));

  const url = ENDPOINTS.list(usp.toString());
  const data = await jfetch(url); // expects {items,total}
  const items = data.items ?? [];
  totalItems = Number(data.total ?? 0);

  // Map to flat fields Tabulator columns expect
  const rows = items.map((it) => ({
    id: it.id,
    po_number: it.po_number,
    customer_code: it.customer?.code ?? "",
    customer_name: it.customer?.name ?? "",
    customer_disp: `${it.customer?.code ?? ""} — ${it.customer?.name ?? ""}`,
    description: it.description ?? "",
    created_at: it.created_at ?? null,
  }));

  // tell Tabulator
  const last_page = computeLastPage(totalItems, size);
  return { data: rows, last_page };
}

function initPosTable() {
  if (!tableBody) return;

  pageSize = Number(selPerPage?.value || 20);

  table = new Tabulator(tableBody, {
    layout: "fitColumns",
    height: "calc(100vh - 260px)",
    headerVisible: true,
    columns: makeColumns(),
    columnDefaults: { tooltip: true },
    placeholder: "No POs found",

    pagination: true,
    paginationMode: "remote",
    paginationSize: pageSize,
    ajaxSorting: true,
    filterMode: "remote",

    ajaxURL: ENDPOINTS.base, // not used directly (we use ajaxRequestFunc)
    ajaxRequestFunc: async (url, config, params) => {
      const res = await tabulatorRequest(params);
      return res; // {data, last_page}
    },
  });

  // first load
  table.on("tableBuilt", () => reloadTableFirstPage());

  // selection -> load detail
  table.on("rowClick", async (e, row) => {
    const d = row.getData();
    if (!d?.id) return;
    selectedId = d.id;
    await selectPo(selectedId);
    row.select();
  });

  // page state
  table.on("pageLoaded", (p) => {
    currentPage = p;
    updatePageInfo();
  });

  // after data load: auto-select first row
  table.on("dataLoaded", () => {
    const rows = table.getRows();
    if (rows?.length) {
      const first = rows[0];
      const d = first.getData();
      if (d?.id && String(d.id) !== String(selectedId)) {
        selectedId = d.id;
        selectPo(selectedId, { silentScroll: true });
        first.select();
      }
    } else {
      selectedId = null; initial = null; tempEdits = {}; mode = "view"; renderDetail({});
    }
  });
}

/* ===================== topbar/footer bindings ===================== */
function reloadTableFirstPage(keepSelection = false) {
  if (!keepSelection) selectedId = null;
  currentPage = 1;
  table?.setPage(1);
}
inputSearch?.addEventListener("input", debounce(() => reloadTableFirstPage(), 250));
selPerPage?.addEventListener("change", () => {
  pageSize = Number(selPerPage.value || 20);
  table?.setPageSize(pageSize);
  reloadTableFirstPage(true);
});
btnReload?.addEventListener("click", () => reloadTableFirstPage(true));

[btnPrevTop, btnPrevBot].forEach((b) =>
  b?.addEventListener("click", () => {
    if (currentPage > 1) table?.setPage(currentPage - 1);
  })
);
[btnNextTop, btnNextBot].forEach((b) =>
  b?.addEventListener("click", () => table?.setPage(currentPage + 1))
);

/* ===================== detail buttons ===================== */
btnEdit?.addEventListener("click", () => {
  if (!initial) return;
  tempEdits = primeEdits(initial);
  mode = "edit";
  renderDetail(getWorkingData());
  focusField("po_number");
});
btnNew?.addEventListener("click", () => {
  selectedId = null;
  initial = null;
  tempEdits = primeEdits({});
  mode = "create";
  renderDetail(getWorkingData());
  focusField("po_number");
});
btnSave?.addEventListener("click", saveDetail);
btnCancel?.addEventListener("click", cancelEdits);
btnDelete?.addEventListener("click", deleteDetail);

/* ===================== boot ===================== */
document.addEventListener("DOMContentLoaded", () => {
  renderDetail({});
  initPosTable();
  updatePageInfo(); // initial
});
