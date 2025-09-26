// /static/js/page-pos.js (v11)
import { $, jfetch, toast } from "./api.js";
import { renderTableX } from "./tablex.js";
import { attachAutocomplete } from "./autocomplete.js";

const ENDPOINTS = {
  list: (p) => `/pos?${p}`,
  base: `/pos`,
  byId: (id) => `/pos/${encodeURIComponent(id)}`,
};
const posUrl = (id) => `./pos-detail.html?id=${encodeURIComponent(id)}`;

/* ---- list refs ---- */
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

/* ---- detail refs ---- */
const hintEl = $("po_hint");
const errEl = $("po_error");
const viewEl = $("po_view");
const btnEdit = $("po_btnEdit");
const btnNew = $("po_btnNew");
const btnSave = $("po_btnSave");
const btnCancel = $("po_btnCancel");
const btnDelete = $("po_btnDelete");

/* ---- state ---- */
const state = {
  page: 1,
  pageSize: Number(selPerPage?.value || 20),
  q: "",
  total: 0,
  items: [],
};
let selectedId = null; // PO id selected from list
let initial = null; // current PO detail
let mode = "view"; // view | edit | create
let tempEdits = {}; // draft changes
let isSubmitting = false;
const FIELD_KEYS = ["po_number", "customer", "description", "created_at"];
const FIELD_LABELS = {
  po_number: "PO No.",
  customer: "Customer",
  description: "Description",
  created_at: "Created",
};
const INPUT_TYPE = { po_number: "text", description: "textarea" }; // customer uses autocomplete input
// --- compatibility shim (เหมือนหน้า Customers) ---
function applyMode(nextMode) {
  if (nextMode) mode = nextMode;
  // ในหน้า POS เราใช้ renderDetail เป็นตัวจัดปุ่ม/ฟอร์มทั้งหมด
  renderDetail(getWorkingData());
}
/* ---- config: autocomplete ---- */
const OPEN_CUSTOMER_SUGGEST_ON_FOCUS = true; // ✅ เปิดลิสต์ตอนโฟกัส
const MIN_CHARS_FOR_CUSTOMER = 0; // ✅ 0 เมื่อเปิด suggest-on-focus

/* ===================== utils ===================== */
const safe = (s) => String(s ?? "").replaceAll("<", "&lt;");
const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleString();
};
const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
const trim = (v) => (v == null ? "" : String(v).trim());

function setBusy(b) {
  [btnEdit, btnNew, btnSave, btnCancel, btnDelete].forEach((el) => {
    if (!el) return;
    el.disabled = !!b;
    el.setAttribute("aria-disabled", String(b));
  });
  if (hintEl) hintEl.textContent = b ? "Working…" : "";
}
function setError(msg) {
  if (!errEl) return;
  if (!msg) {
    errEl.style.display = "none";
    errEl.textContent = "";
  } else {
    errEl.style.display = "";
    errEl.textContent = msg;
  }
}

/* ===================== Autocomplete (Customer) ===================== */
let selectedCustomer = null; // { id, code, name }

async function searchCustomers(term) {
  const q = (term || "").trim();

  // ถ้าเปิด suggest-on-focus และยังไม่มีคำ ให้ยิง keyset 10 แถวแรก
  if (OPEN_CUSTOMER_SUGGEST_ON_FOCUS && q.length === 0) {
    try {
      const res = await jfetch(`/customers/keyset?limit=10`);
      const items = Array.isArray(res) ? res : res.items ?? [];
      return items.map((x) => ({
        id: x.id ?? x.customer_id ?? x.customerId,
        code: x.code ?? "",
        name: x.name ?? "",
      }));
    } catch {
      return [];
    }
  }

  if (!q) return [];

  try {
    const res = await jfetch(
      `/customers?q=${encodeURIComponent(q)}&page=1&page_size=10`
    );
    const items = Array.isArray(res) ? res : res.items ?? [];
    return items.map((x) => ({
      id: x.id ?? x.customer_id ?? x.customerId,
      code: x.code ?? "",
      name: x.name ?? "",
    }));
  } catch {
    try {
      const res2 = await jfetch(
        `/customers/keyset?q=${encodeURIComponent(q)}&limit=10`
      );
      const items2 = Array.isArray(res2) ? res2 : res2.items ?? [];
      return items2.map((x) => ({
        id: x.id ?? x.customer_id ?? x.customerId,
        code: x.code ?? "",
        name: x.name ?? "",
      }));
    } catch {
      return [];
    }
  }
}

/* สร้าง input element สำหรับ field=customer พร้อม autocomplete */
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
    renderItem: (it) =>
      `<div class="ac-row"><b>${it.code}</b> — ${it.name}</div>`,
    onPick: (it) => {
      selectedCustomer = it || null;
      input.value = it ? `${it.code} — ${it.name}` : "";
    },
    openOnFocus: true, // ✅ เปิดเมื่อโฟกัส
    minChars: MIN_CHARS_FOR_CUSTOMER,
    debounceMs: 200,
    maxHeight: 260,
  });

  input.addEventListener("input", () => {
    selectedCustomer = null;
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdits();
    }
  });

  return input;
}

/* ===================== LIST / PAGER ===================== */
function computeTotalPages() {
  if (state.total && state.pageSize)
    return Math.max(1, Math.ceil(state.total / state.pageSize));
  return state.items.length < state.pageSize && state.page === 1
    ? 1
    : state.page;
}

function syncPager() {
  const totalPages = computeTotalPages();
  const label = `Page ${state.page}${state.total ? ` / ${totalPages}` : ""}`;
  if (pageInfoTop) pageInfoTop.textContent = label;
  if (pageInfoBot) pageInfoBot.textContent = label;

  const canPrev = state.page > 1;
  const canNext = state.total
    ? state.page < totalPages
    : state.items.length === state.pageSize;

  [btnPrevTop, btnPrevBot].forEach(
    (b) => b && b.toggleAttribute("disabled", !canPrev)
  );
  [btnNextTop, btnNextBot].forEach(
    (b) => b && b.toggleAttribute("disabled", !canNext)
  );
}

function renderPosTable(container, rows, ctx = {}) {
  renderTableX(container, rows, {
    rowStart: ctx.rowStart || 0,
    getRowId: (r) => r.id,
    onRowClick: (r) => {
      if (r?.id) selectPo(r.id);
    },
    columns: [
      { key: "__no", title: "No.", width: "64px", align: "right" },
      {
        key: "po_number",
        title: "PO No.",
        width: "140px",
        render: (r) =>
          `<a href="javascript:void(0)">${safe(r.po_number ?? "")}</a>`,
      },
      {
        key: "customer",
        title: "Customer",
        width: "260px",
        render: (r) =>
          `${safe(r.customer?.code ?? "")} — ${safe(r.customer?.name ?? "")}`,
      },
      {
        key: "description",
        title: "Description",
        render: (r) => safe(r.description ?? ""),
      },
      {
        key: "created_at",
        title: "Created",
        width: "180px",
        render: (r) => fmtDate(r.created_at),
      },
    ],
    emptyText: "No POs found",
  });
}

async function loadPOs() {
  if (!tableBody) return;
  tableBody.innerHTML = `<tr><td style="padding:12px">Loading…</td></tr>`;
  try {
    const params = new URLSearchParams({
      page: String(state.page),
      page_size: String(state.pageSize),
      q: state.q || "",
      _: String(Date.now()),
    });
    const data = await jfetch(ENDPOINTS.list(params.toString()));
    state.items = data.items ?? [];
    state.total = Number(data.total ?? 0);

    const rows = state.items.map((it) => ({
      id: it.id,
      po_number: it.po_number,
      customer: it.customer,
      description: it.description ?? "",
      created_at: it.created_at,
    }));

    renderPosTable(tableBody, rows, {
      rowStart: (state.page - 1) * state.pageSize,
    });
    syncPager();

    // auto-select แถวแรกถ้ายังไม่มี selection
    if (!selectedId && rows.length)
      selectPo(rows[0].id, { silentScroll: true });
  } catch (e) {
    console.error(e);
    tableBody.innerHTML = `<tr><td style="padding:12px;color:#b91c1c">Load error</td></tr>`;
    toast("Load POs failed");
    syncPager();
  }
}

/* ===================== DETAIL (CRUD) ===================== */
function primeEdits(base) {
  // base.customer เป็น {id,code,name}? ถ้า API คืนเป็น nested object ให้ใช้ได้เลย
  return {
    po_number: base?.po_number ?? "",
    customer: base?.customer
      ? {
          id: base.customer.id,
          code: base.customer.code,
          name: base.customer.name,
        }
      : null,
    description: base?.description ?? "",
    created_at: base?.created_at ?? null,
  };
}
function getWorkingData() {
  const base = mode === "create" ? {} : initial ?? {};
  // note: customer ใช้จาก selectedCustomer ถ้าอยู่ในโหมดแก้ไข
  return { ...base, ...tempEdits };
}

function renderDetail(data = {}) {
  if (!viewEl) return;

  const empty = !data || (Object.keys(data).length === 0 && mode !== "create");
  if (empty) {
    viewEl.innerHTML = `<div class="muted">Select a PO on the left</div>`;
    return;
  }

  const editing = mode === "edit" || mode === "create";
  const pick = (k, fallback = "") =>
    Object.prototype.hasOwnProperty.call(tempEdits, k)
      ? tempEdits[k]
      : data[k] ?? fallback;

  const rows = FIELD_KEYS.map((key) => {
    const label = FIELD_LABELS[key];
    const current = pick(key, null);

    let valHtml = "";
    if (!editing) {
      if (key === "customer") {
        valHtml = current
          ? `${safe(current.code ?? "")} — ${safe(current.name ?? "")}`
          : "—";
      } else if (key === "created_at") {
        valHtml = fmtDate(current);
      } else {
        const text = trim(current ?? "");
        valHtml = text === "" ? "—" : safe(text);
      }
    } else {
      if (key === "customer") {
        valHtml = '<div data-field="customer"></div>'; // placeholder; ใส่ input ภายหลัง
      } else if (INPUT_TYPE[key] === "textarea") {
        valHtml = `<textarea class="kv-input" data-field="${key}" rows="3">${safe(
          current ?? ""
        )}</textarea>`;
      } else if (key === "created_at") {
        valHtml = fmtDate(current) || "—";
      } else {
        valHtml = `<input class="kv-input" data-field="${key}" type="${
          INPUT_TYPE[key] || "text"
        }" value="${safe(current ?? "")}" />`;
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

  // dblclick = เข้าสู่โหมดแก้ไข
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
    // ใส่ autocomplete ให้ field=customer
    const custHolder =
      viewEl.querySelector(
        '.kv-val[data-key="customer"] [data-field="customer"]'
      ) ||
      viewEl.querySelector(
        '.kv-val[data-key="customer"] div[data-field="customer"]'
      ) ||
      viewEl.querySelector('.kv-val[data-key="customer"]');
    if (custHolder) {
      const input = buildCustomerInput(pick("customer", null));
      custHolder.replaceChildren(input);
    }

    // bind inputs
    viewEl.querySelectorAll(".kv-input").forEach((input) => {
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

  // ปุ่มแสดง/ซ่อนตามโหมด
  btnSave.style.display = editing ? "" : "none";
  btnCancel.style.display = editing ? "" : "none";
  btnEdit.style.display = editing ? "none" : "";
  btnNew.style.display = editing ? "none" : "";
}

function focusField(key) {
  const el = viewEl?.querySelector(
    `.kv-input[data-field="${CSS.escape(key)}"]`
  );
  el?.focus();
}

async function loadDetail(id) {
  setBusy(true);
  setError("");
  try {
    const data = await jfetch(ENDPOINTS.byId(id));
    initial = data;
    tempEdits = {};
    mode = "view";
    renderDetail(initial);
  } catch (e) {
    setError(e?.message || "Load failed");
    initial = null;
    tempEdits = {};
    mode = "view";
    renderDetail({});
  } finally {
    setBusy(false);
  }
}

function buildPayload() {
  // รวมจาก tempEdits และ selectedCustomer เมื่อแก้ไข
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

  // ต้องมี customer_id
  const payload = buildPayload();
  if (!payload.customer_id) {
    toast("Select Customer !!", false);
    focusField("customer");
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
      toast("PO created");
      selectedId = created.id;
      initial = created;
      tempEdits = {};
      mode = "view";
      renderDetail(initial);
      state.page = 1;
      await loadPOs();
      highlightSelected();
    } else {
      const updated = await jfetch(ENDPOINTS.byId(selectedId), {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      toast("Saved");
      initial = updated;
      tempEdits = {};
      mode = "view";
      renderDetail(initial);
      // sync แถวในตาราง
      const row = state.items.find((x) => String(x.id) === String(selectedId));
      if (row) {
        row.po_number = updated.po_number;
        row.customer = updated.customer;
        row.description = updated.description ?? "";
      }
      renderPosTable(tableBody, state.items, {
        rowStart: (state.page - 1) * state.pageSize,
      });
      highlightSelected();
    }
  } catch (e) {
    toast(e?.message || "Save failed", false);
  } finally {
    isSubmitting = false;
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
    selectedId = null;
    initial = null;
    tempEdits = {};
    mode = "view";
    renderDetail({});
    await loadPOs();
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  } finally {
    setBusy(false);
  }
}

async function selectPo(id, opts = {}) {
  selectedId = id;
  highlightSelected();
  await loadDetail(id);
  if (!opts?.silentScroll) {
    // เลื่อนให้ row โผล่ (ถ้าต้องทำเพิ่มค่อยใส่)
  }
}

function highlightSelected() {
  if (!tableBody) return;
  tableBody.querySelectorAll("tr[data-row-id], tr[data-id]").forEach((tr) => {
    const rid = tr.dataset.rowId || tr.dataset.id;
    tr.classList.toggle("active", String(rid) === String(selectedId));
  });
}

/* ===================== events ===================== */
inputSearch?.addEventListener(
  "input",
  debounce(() => {
    state.q = inputSearch.value || "";
    state.page = 1;
    loadPOs();
  }, 250)
);

selPerPage?.addEventListener("change", () => {
  state.pageSize = Number(selPerPage.value || 20);
  state.page = 1;
  loadPOs();
});

btnReload?.addEventListener("click", () => loadPOs());

[btnPrevTop, btnPrevBot].forEach((b) =>
  b?.addEventListener("click", () => {
    if (state.page > 1) {
      state.page--;
      loadPOs();
    }
  })
);
[btnNextTop, btnNextBot].forEach((b) =>
  b?.addEventListener("click", () => {
    const totalPages = computeTotalPages();
    if (
      state.total
        ? state.page < totalPages
        : state.items.length === state.pageSize
    ) {
      state.page++;
      loadPOs();
    }
  })
);

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
btnCancel?.addEventListener("click", () => {
  tempEdits = {};
  mode = "view";
  renderDetail(initial || {});
});
btnDelete?.addEventListener("click", deleteDetail);

/* ===================== boot ===================== */
document.addEventListener("DOMContentLoaded", async () => {
  renderDetail({});
  await loadPOs();
});
