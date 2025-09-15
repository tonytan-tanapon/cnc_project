// /static/js/page-pos-all.js
import { $, jfetch, toast } from "./api.js";

/* =================== Helpers =================== */
const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleString();
};
const trim = (v) => (v == null ? "" : String(v).trim());
const debounce = (fn, ms = 220) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

/* =================== State =================== */
let poId = new URLSearchParams(location.search).get("id");
let original = null; // PO header (ล่าสุดที่โหลด)
let mode = "view"; // view | edit | create
let tempEdits = {}; // draft edits
let isSubmitting = false;
let selectedCustomer = null; // {id, code, name}

/* =================== Elements =================== */
const els = {
  search: $("po_search"),

  hint: $("po_hint"),
  error: $("po_error"),
  subTitle: $("po_subTitle"),
  view: $("po_view"),

  btnEdit: $("po_btnEdit"),
  btnNew: $("po_btnNew"),
  btnSave: $("po_btnSave"),
  btnCancel: $("po_btnCancel"),
  btnDelete: $("po_btnDelete"),

  btnAddLine: $("btnAddLine"),
  linesBody: $("tblLinesBody"),
};

/* =================== Busy =================== */
const setAriaDisabled = (node, disabled) => {
  if (!node) return;
  node.disabled = disabled;
  node.setAttribute("aria-disabled", String(disabled));
  node.classList.toggle("is-busy", !!disabled);
};
function setBusy(b) {
  [
    els.btnEdit,
    els.btnNew,
    els.btnSave,
    els.btnCancel,
    els.btnDelete,
    els.btnAddLine,
  ].forEach((el) => setAriaDisabled(el, b));
  if (els.hint) els.hint.textContent = b ? "Working…" : "";
}

/* =================== MODE + RENDER =================== */
const FIELD_ORDER = ["po_number", "customer", "description", "created_at"];
const FIELD_LABEL = {
  po_number: "PO No.",
  customer: "Customer",
  description: "Description",
  created_at: "Created",
};
const INPUT_TYPE = {
  po_number: "text",
  customer: "text", // จะสร้าง input id="po_cust" ตอนโหมด edit/create
  description: "textarea",
};

function applyMode(next) {
  if (next) mode = next;
  const editing = mode === "edit" || mode === "create";

  // ปุ่ม
  if (els.btnSave) els.btnSave.style.display = editing ? "" : "none";
  if (els.btnCancel) els.btnCancel.style.display = editing ? "" : "none";
  if (els.btnEdit) els.btnEdit.style.display = editing ? "none" : "";
  // New โชว์เสมอ (ใช้สร้างเอกสารใหม่)
  if (els.btnAddLine)
    els.btnAddLine.disabled = !poId || editing || mode === "create";

  renderKV(getWorkingData());
}

function primeTempEdits(base) {
  return {
    po_number: base?.po_number ?? "",
    customer: base?.customer
      ? `${String(base.customer.code || "").toUpperCase()}${
          base.customer.name ? " — " + base.customer.name : ""
        }`
      : "",
    description: base?.description ?? "",
    created_at: base?.created_at ?? "",
  };
}
function getWorkingData() {
  const base = mode === "create" ? {} : original ?? {};
  const shadow = primeTempEdits(base);
  return { ...shadow, ...tempEdits };
}

function focusField(key) {
  const el = els.view?.querySelector(
    `.kv-input${key ? `[data-field="${CSS.escape(key)}"]` : ""}`
  );
  el?.focus();
}

function renderKV(data = {}) {
  const holder = els.view;
  if (!holder) return;

  const empty = !poId && mode !== "create";
  if (empty) {
    holder.innerHTML = `<div class="muted">ค้นหา PO ด้านบน แล้วกด Enter/เลือกผลลัพธ์เพื่อโหลดรายละเอียด</div>`;
    if (els.subTitle) els.subTitle.textContent = "—";
    return;
  }

  const editing = mode === "edit" || mode === "create";

  const rows = FIELD_ORDER.map((key) => {
    const label = FIELD_LABEL[key];
    const current = Object.prototype.hasOwnProperty.call(tempEdits, key)
      ? tempEdits[key]
      : data[key] ?? "";

    let valHtml;
    if (
      editing &&
      (key === "po_number" || key === "description" || key === "customer")
    ) {
      if (key === "description") {
        valHtml = `<textarea class="kv-input" data-field="${key}" rows="3">${escapeHtml(
          String(current ?? "")
        )}</textarea>`;
      } else if (key === "customer") {
        valHtml = `<input class="kv-input" id="po_cust" data-field="customer" type="text" placeholder="e.g. C0001 — Company" value="${escapeHtml(
          String(current ?? "")
        )}" />`;
      } else {
        valHtml = `<input class="kv-input" data-field="${key}" type="${
          INPUT_TYPE[key] || "text"
        }" value="${escapeHtml(String(current ?? ""))}" />`;
      }
    } else {
      const text =
        key === "created_at" ? fmtDate(current) : trim(current) || "—";
      valHtml = escapeHtml(String(text));
    }

    return `
      <div class="kv-row${editing ? " editing" : ""}" data-key="${key}">
        <div class="kv-key">${escapeHtml(label)}</div>
        <div class="kv-val" data-key="${key}">${valHtml}</div>
      </div>
    `;
  });

  holder.innerHTML = rows.join("");

  // dblclick → edit
  holder.querySelectorAll(".kv-row").forEach((row) => {
    row.addEventListener("dblclick", () => {
      if (!original && mode !== "create") return;
      tempEdits = primeTempEdits(original);
      applyMode("edit");
      focusField(
        row.dataset.key === "created_at" ? "po_number" : row.dataset.key
      );
    });
  });

  // bind inputs
  if (editing) {
    holder.querySelectorAll(".kv-input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const k = e.target.dataset.field;
        tempEdits[k] = e.target.value;
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
          e.preventDefault();
          savePO();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelEdits();
        }
      });
    });

    // attach Customer autocomplete เฉพาะตอนแก้ไข/สร้าง
    const custInput = $("po_cust");
    if (custInput && !custInput.dataset.acReady) {
      attachCustomerAutocomplete(custInput);
      custInput.dataset.acReady = "1";
    }
  }

  // subtitle
  if (els.subTitle) {
    els.subTitle.textContent = original
      ? `#${original.id} — ${original.po_number ?? ""}`
      : mode === "create"
      ? "(New PO)"
      : "—";
  }
}

/* =================== Load / Save / Delete (header) =================== */
async function loadPO(id) {
  if (!id) return;
  setBusy(true);
  try {
    if (els.error) {
      els.error.style.display = "none";
      els.error.textContent = "";
    }
    const po = await jfetch(`/pos/${encodeURIComponent(id)}`);
    original = po;
    // derive selectedCustomer
    if (po.customer) {
      selectedCustomer = {
        id: po.customer.id,
        code: (po.customer.code || "").toUpperCase(),
        name: po.customer.name || "",
      };
    } else {
      selectedCustomer = null;
    }
    document.title = `PO · ${po.po_number ?? po.id}`;
    mode = "view";
    tempEdits = {};
    renderKV(primeTempEdits(po));
  } catch (e) {
    if (els.error) {
      els.error.style.display = "";
      els.error.textContent = e?.message || "Load failed";
    }
    toast(e?.message || "Load failed", false);
  } finally {
    setBusy(false);
  }
}

function buildPayload() {
  const data = getWorkingData();
  return {
    po_number: data.po_number ? String(data.po_number).toUpperCase() : null,
    description: data.description ? trim(data.description) : null,
  };
}

async function resolveCustomerIdFromInput() {
  const text = (getWorkingData().customer || "").trim();
  if (!text) return null;
  // allow "CODE — NAME" or "CODE - NAME" or just "CODE"
  const code = text.split(/[—-]/)[0].trim().toUpperCase();
  // if selectedCustomer already matches
  if (selectedCustomer && code.startsWith(selectedCustomer.code))
    return selectedCustomer.id;
  try {
    const data = await jfetch(
      `/customers?q=${encodeURIComponent(code)}&page=1&page_size=20`
    );
    const items = Array.isArray(data) ? data : data.items || [];
    const exact = items.find(
      (x) => String(x.code || "").toUpperCase() === code
    );
    return exact ? exact.id : null;
  } catch {
    return null;
  }
}

async function savePO() {
  if (isSubmitting) return;
  const payload = buildPayload();

  // require customer when creating or changing
  const custId = await resolveCustomerIdFromInput();
  if (mode === "create" && !custId) {
    toast("Enter Customer (valid code)", false);
    focusField("customer");
    return;
  }
  if (custId) payload.customer_id = custId;

  setBusy(true);
  isSubmitting = true;
  try {
    if (mode === "create" || !poId) {
      const created = await jfetch(`/pos`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      poId = created.id;
      original = created;
      // sync selectedCustomer from created
      selectedCustomer = created?.customer
        ? {
            id: created.customer.id,
            code: String(created.customer.code || "").toUpperCase(),
            name: created.customer.name || "",
          }
        : null;

      tempEdits = {};
      mode = "view";
      toast("PO created");
      renderKV(primeTempEdits(created));
      await loadLines();
    } else {
      const updated = await jfetch(`/pos/${encodeURIComponent(poId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      original = updated;

      // keep selectedCustomer in sync when backend returns customer
      selectedCustomer = updated?.customer
        ? {
            id: updated.customer.id,
            code: String(updated.customer.code || "").toUpperCase(),
            name: updated.customer.name || "",
          }
        : selectedCustomer;

      tempEdits = {};
      mode = "view";
      toast("Saved");
      renderKV(primeTempEdits(updated));
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
  mode = original ? "view" : "create";
  renderKV(primeTempEdits(original || {}));
}

async function deletePO() {
  if (!poId) return;
  if (!confirm("ลบ PO นี้?\nThis action cannot be undone.")) return;
  setBusy(true);
  try {
    await jfetch(`/pos/${encodeURIComponent(poId)}`, { method: "DELETE" });
    toast("Deleted");
    poId = null;
    original = null;
    tempEdits = {};
    mode = "view";
    renderKV({}); // เคลียร์ฝั่งรายละเอียด
    renderLines([]); // เคลียร์ตารางไลน์
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  } finally {
    setBusy(false);
  }
}

/* =================== Autocomplete: PO search =================== */
let poBox,
  poItems = [],
  poActive = -1,
  poTarget;

function ensurePoBox() {
  if (poBox) return poBox;
  poBox = document.createElement("div");
  Object.assign(poBox.style, {
    position: "absolute",
    zIndex: "9999",
    minWidth: "260px",
    maxHeight: "300px",
    overflow: "auto",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    boxShadow: "0 10px 20px rgba(2,6,23,.08), 0 2px 6px rgba(2,6,23,.06)",
    display: "none",
  });
  poBox.className = "ac-box";
  document.body.appendChild(poBox);
  return poBox;
}
function positionPoBox(input) {
  const r = input.getBoundingClientRect();
  poBox.style.left = `${window.scrollX + r.left}px`;
  poBox.style.top = `${window.scrollY + r.bottom + 4}px`;
  poBox.style.width = `${r.width}px`;
}
function hidePoAc() {
  if (!poBox) return;
  poBox.style.display = "none";
  poItems = [];
  poActive = -1;
}
function setPoActive(i) {
  poActive = i;
  [...poBox.querySelectorAll(".ac-item")].forEach((el, idx) => {
    el.style.background = idx === poActive ? "rgba(0,0,0,.04)" : "";
  });
}
function renderPoAc(list) {
  const box = ensurePoBox();
  poItems = list || [];
  poActive = -1;
  if (!poItems.length || !poTarget) {
    hidePoAc();
    return;
  }

  box.innerHTML = poItems
    .map(
      (p, i) => `
    <div class="ac-item" data-i="${i}" style="padding:8px 10px; cursor:pointer; display:flex; gap:8px; align-items:center">
      <span class="badge" style="font-size:11px">${escapeHtml(
        p.po_number || ""
      )}</span>
      <div style="flex:1; min-width:0">
        <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">
          ${escapeHtml(p.customer_name || "")}
        </div>
        <div class="muted" style="font-size:12px">${escapeHtml(
          p.customer_code || ""
        )}</div>
      </div>
    </div>
  `
    )
    .join("");

  [...box.querySelectorAll(".ac-item")].forEach((el) => {
    el.addEventListener("mouseenter", () =>
      setPoActive(parseInt(el.dataset.i, 10))
    );
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      choosePoActive(parseInt(el.dataset.i, 10));
    });
  });

  box.style.display = "";
  positionPoBox(poTarget);
}
function normalizePosItems(resp) {
  const arr = Array.isArray(resp) ? resp : resp?.items || [];
  return (arr || []).map((x) => ({
    id: x.id,
    po_number: x.po_number || "",
    customer_code: x.customer?.code || x.customer_code || "",
    customer_name: x.customer?.name || x.customer_name || "",
  }));
}
const fetchPoSuggest = debounce(async (term) => {
  try {
    const hasTerm = !!(term && term.length >= 1);
    const url = hasTerm
      ? `/pos?q=${encodeURIComponent(term)}&page=1&page_size=20`
      : `/pos?page=1&page_size=10`;
    const data = await jfetch(url);
    renderPoAc(normalizePosItems(data).slice(0, 20));
  } catch {
    renderPoAc([]);
  }
}, 220);

function choosePoActive(i) {
  if (i < 0 || i >= poItems.length) return;
  const it = poItems[i];
  if (els.search) els.search.value = it.po_number || "";
  hidePoAc();
  if (it.id) {
    poId = it.id;
    loadPO(poId).then(loadLines);
  }
}

// โหลดจากข้อความค้นหา เมื่อกด Enter (แม้ไม่ได้คลิกรายการ)
async function tryLoadPoFromText(term) {
  const t = (term || "").trim();
  if (!t) return false;

  // 1) ถ้าเป็นตัวเลขล้วน → ลองเป็น id โดยตรง
  if (/^\d+$/.test(t)) {
    try {
      const po = await jfetch(`/pos/${encodeURIComponent(t)}`);
      if (po?.id) {
        poId = po.id;
        original = po;
        await loadPO(poId);
        await loadLines();
        return true;
      }
    } catch {}
  }

  // 2) ค้นหาโดย po_number/ลูกค้า
  try {
    const resp = await jfetch(
      `/pos?q=${encodeURIComponent(t)}&page=1&page_size=1`
    );
    const arr = Array.isArray(resp) ? resp : resp?.items || [];
    if (arr.length > 0 && arr[0]?.id) {
      poId = arr[0].id;
      await loadPO(poId);
      await loadLines();
      return true;
    }
  } catch {}

  toast("ไม่พบ PO ตามคำค้น", false);
  return false;
}

/* =================== Autocomplete: Customer (in header form) =================== */
let custAcBox,
  custAcItems = [],
  custAcActive = -1,
  custAcTarget;

function ensureCustAcBox() {
  if (custAcBox) return custAcBox;
  custAcBox = document.createElement("div");
  Object.assign(custAcBox.style, {
    position: "absolute",
    zIndex: "9999",
    minWidth: "240px",
    maxHeight: "260px",
    overflow: "auto",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    boxShadow: "0 10px 20px rgba(2,6,23,.08), 0 2px 6px rgba(2,6,23,.06)",
    display: "none",
  });
  custAcBox.className = "ac-box";
  document.body.appendChild(custAcBox);
  return custAcBox;
}
function positionCustAcBox(input) {
  const r = input.getBoundingClientRect();
  custAcBox.style.left = `${window.scrollX + r.left}px`;
  custAcBox.style.top = `${window.scrollY + r.bottom + 4}px`;
  custAcBox.style.width = `${r.width}px`;
}
function hideCustAc() {
  if (!custAcBox) return;
  custAcBox.style.display = "none";
  custAcItems = [];
  custAcActive = -1;
}
function setCustActive(i) {
  custAcActive = i;
  [...custAcBox.querySelectorAll(".ac-item")].forEach((el, idx) => {
    el.style.background = idx === custAcActive ? "rgba(0,0,0,.04)" : "";
  });
}
function renderCustAc(list) {
  const box = ensureCustAcBox();
  custAcItems = list || [];
  custAcActive = -1;
  if (!custAcItems.length || !custAcTarget) {
    hideCustAc();
    return;
  }
  box.innerHTML = custAcItems
    .map(
      (c, i) => `
    <div class="ac-item" data-i="${i}" style="padding:8px 10px; cursor:pointer; display:flex; gap:8px; align-items:center">
      <span class="badge" style="font-size:11px">${escapeHtml(
        (c.code || "").toUpperCase()
      )}</span>
      <div style="flex:1; min-width:0">
        <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escapeHtml(
          c.name || ""
        )}</div>
      </div>
    </div>
  `
    )
    .join("");
  [...box.querySelectorAll(".ac-item")].forEach((el) => {
    el.addEventListener("mouseenter", () =>
      setCustActive(parseInt(el.dataset.i, 10))
    );
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      chooseCustActive(parseInt(el.dataset.i, 10));
    });
  });
  box.style.display = "";
  positionCustAcBox(custAcTarget);
}
const fetchCustomerSuggest = debounce(async (term) => {
  try {
    const url =
      term && term.length >= 1
        ? `/customers?q=${encodeURIComponent(term)}&page=1&page_size=20`
        : `/customers?page=1&page_size=10`;
    const data = await jfetch(url);
    const rows = (Array.isArray(data) ? data : data.items || []).map((x) => ({
      id: x.id,
      code: (x.code || "").toUpperCase(),
      name: x.name || "",
    }));
    renderCustAc(rows.slice(0, 20));
  } catch {
    renderCustAc([]);
  }
}, 220);
function chooseCustActive(i) {
  if (i < 0 || i >= custAcItems.length) return;
  const c = custAcItems[i];
  selectedCustomer = {
    id: c.id,
    code: (c.code || "").toUpperCase(),
    name: c.name || "",
  };
  if (custAcTarget)
    custAcTarget.value = `${selectedCustomer.code}${
      selectedCustomer.name ? " — " + selectedCustomer.name : ""
    }`;
  hideCustAc();
}
function attachCustomerAutocomplete(input) {
  input.setAttribute("autocomplete", "off");
  let composing = false;
  input.addEventListener("compositionstart", () => {
    composing = true;
  });
  input.addEventListener("compositionend", () => {
    composing = false;
    custAcTarget = input;
    const t = (input.value || "").trim();
    fetchCustomerSuggest(t);
    ensureCustAcBox();
    positionCustAcBox(input);
  });
  input.addEventListener("input", () => {
    if (composing) return;
    custAcTarget = input;
    const t = (input.value || "").trim();
    if (
      !selectedCustomer ||
      !t.toUpperCase().startsWith((selectedCustomer.code || "").toUpperCase())
    ) {
      selectedCustomer = null;
    }
    fetchCustomerSuggest(t);
    ensureCustAcBox();
    positionCustAcBox(input);
  });
  input.addEventListener("focus", () => {
    custAcTarget = input;
    const t = (input.value || "").trim();
    fetchCustomerSuggest(t);
    ensureCustAcBox();
    positionCustAcBox(input);
  });
  input.addEventListener("blur", () => setTimeout(hideCustAc, 100));
  input.addEventListener("keydown", (e) => {
    if (!custAcBox || custAcBox.style.display === "none") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCustActive(Math.min(custAcActive + 1, custAcItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCustActive(Math.max(custAcActive - 1, 0));
    } else if (e.key === "Enter") {
      if (custAcActive >= 0) {
        e.preventDefault();
        chooseCustActive(custAcActive);
      }
    } else if (e.key === "Escape") {
      hideCustAc();
    }
  });
  window.addEventListener(
    "resize",
    () => custAcTarget && positionCustAcBox(custAcTarget)
  );
  window.addEventListener(
    "scroll",
    () => custAcTarget && positionCustAcBox(custAcTarget),
    true
  );
}

/* =================== PO Lines (inline) =================== */
let poLines = [];
let editingLineId = null; // 'new' | number

const fmtMoney = (n) =>
  n == null
    ? ""
    : Number(n).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
const fmtQty = (n) =>
  Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 });

async function loadLines() {
  if (!poId) {
    renderLines([]);
    return;
  }
  try {
    const rows = await jfetch(`/pos/${encodeURIComponent(poId)}/lines`);
    poLines = rows || [];
    renderLines();
  } catch {
    poLines = [];
    renderLines();
  }
}
function renderLines(forceRows) {
  const tb = els.linesBody;
  if (!tb) return;

  const rows =
    forceRows ??
    (editingLineId === "new"
      ? [{ __isNew: true, id: null }].concat(poLines)
      : poLines.slice());

  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="8" class="empty">No lines</td></tr>`;
    return;
  }

  tb.innerHTML = rows
    .map((row, idx) => {
      const displayNo = row.__isNew
        ? ""
        : editingLineId === "new"
        ? idx
        : idx + 1;
      const isEdit =
        editingLineId === row.id || (row.__isNew && editingLineId === "new");

      if (!isEdit) {
        const qty = fmtQty(row.qty);
        const price = fmtMoney(row.unit_price);
        const due = row.due_date ?? "";
        const partId = row.part?.id ?? row.part_id ?? null;
        const partNo = row.part?.part_no ?? row.part_id ?? "";
        const partNoCell = partId
          ? `<a href="/static/part-detail.html?id=${encodeURIComponent(
              partId
            )}" class="link">${escapeHtml(String(partNo))}</a>`
          : `${escapeHtml(String(partNo))}`;
        const revText =
          row.revision?.rev ?? row.rev?.rev ?? row.revision_id ?? "";
        const note = row.note ?? row.notes ?? "";

        return `
        <tr data-id="${row.id}">
          <td style="text-align:right">${escapeHtml(String(displayNo))}</td>
          <td>${partNoCell}</td>
          <td>${escapeHtml(String(revText ?? ""))}</td>
          <td style="text-align:right">${qty}</td>
          <td style="text-align:right">${price}</td>
          <td>${escapeHtml(due)}</td>
          <td>${escapeHtml(note)}</td>
          <td style="text-align:right; white-space:nowrap">
            <button class="btn ghost btn-small" data-edit="${
              row.id
            }">Edit</button>
            <button class="btn-small btn-danger" data-del="${
              row.id
            }">Delete</button>
          </td>
        </tr>`;
      } else {
        const rid = row.__isNew ? "new" : row.id;
        const partNo = row.part?.part_no ?? "";
        const revText = row.revision?.rev ?? row.rev?.rev ?? "";
        const qty = row.qty ?? "";
        const price = row.unit_price ?? "";
        const due = row.due_date ?? "";
        const note = row.note ?? row.notes ?? "";
        const partId = row.part_id ?? row.part?.id ?? "";
        const revisionId =
          row.revision_id ?? row.revision?.id ?? row.rev?.id ?? "";

        return `
        <tr data-id="${row.id ?? ""}" data-editing="1">
          <td style="text-align:right">${escapeHtml(String(displayNo))}</td>
          <td>
            <input id="r_part_code_${rid}" value="${escapeHtml(
          partNo
        )}" placeholder="e.g. P-10001" />
            <input id="r_part_id_${rid}" type="hidden" value="${escapeHtml(
          String(partId)
        )}">
          </td>
          <td>
            <select id="r_rev_select_${rid}" disabled>
              <option value="">— Select revision —</option>
            </select>
            <input id="r_revision_id_${rid}" type="hidden" value="${escapeHtml(
          String(revisionId)
        )}">
          </td>
          <td style="text-align:right">
            <input id="r_qty_${rid}" type="number" step="1" value="${escapeHtml(
          String(qty)
        )}" style="text-align:right; width:120px">
          </td>
          <td style="text-align:right">
            <input id="r_price_${rid}" type="number" step="1" value="${escapeHtml(
          String(price)
        )}" style="text-align:right; width:140px">
          </td>
          <td><input id="r_due_${rid}" type="date" value="${escapeHtml(
          String(due)
        )}"></td>
          <td><input id="r_notes_${rid}" value="${escapeHtml(
          String(note)
        )}"></td>
          <td style="text-align:right; white-space:nowrap">
            <button class="btn-small" data-save="${rid}">Save</button>
            <button class="btn-small secondary" data-cancel="${rid}">Cancel</button>
            ${
              row.__isNew
                ? ""
                : `<button class="btn-small btn-danger" data-del="${rid}">Delete</button>`
            }
          </td>
        </tr>`;
      }
    })
    .join("");

  // wire
  tb.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => startEdit(+b.dataset.edit))
  );
  tb.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => deleteLine(+b.dataset.del))
  );
  tb.querySelectorAll("[data-save]").forEach((b) =>
    b.addEventListener("click", () => saveLineInline(b.dataset.save))
  );
  tb.querySelectorAll("[data-cancel]").forEach((b) =>
    b.addEventListener("click", cancelEdit)
  );

  // attach autocomplete & keyboard to the editing row
  if (editingLineId != null) {
    const rid = editingLineId;

    // Enter/Esc ภายในแถว
    const rowEl = els.linesBody.querySelector(`[data-editing="1"]`);
    rowEl?.querySelectorAll("input,select").forEach((inp) => {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
          e.preventDefault();
          saveLineInline(String(rid));
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelEdit();
        }
      });
    });

    const sel = $(`r_rev_select_${rid}`);
    sel?.addEventListener("change", () => {
      $(`r_revision_id_${rid}`).value = sel.value || "";
    });

    const partInputEl = $(`r_part_code_${rid}`);
    if (partInputEl) attachRowPartAutocomplete(rid, partInputEl);

    if (rid !== "new") {
      const rowData = poLines.find((x) => x.id === Number(rid));
      const partIdCandidate = rowData?.part_id ?? rowData?.part?.id ?? null;
      const prevRevId =
        rowData?.revision_id ??
        rowData?.revision?.id ??
        rowData?.rev?.id ??
        null;
      const prevRevText = rowData?.revision?.rev ?? rowData?.rev?.rev ?? "";
      if (partIdCandidate) {
        loadRevisionsForInto(partIdCandidate, rid, {
          preferId: prevRevId,
          preferText: prevRevText,
        });
      } else {
        resetRevChoicesInto(rid);
      }
    }
  }
}

function startEdit(id) {
  if (editingLineId != null) cancelEdit();
  editingLineId = id;
  renderLines();
}
function startAddLine() {
  if (!poId) {
    toast("Create or select a PO first", false);
    return;
  }
  if (editingLineId != null) cancelEdit();
  editingLineId = "new";
  renderLines();
}
function cancelEdit() {
  editingLineId = null;
  renderLines();
}

async function saveLineInline(rid) {
  if (!poId) return;
  const isNew = rid === "new";
  const partId = numOrNull($(`r_part_id_${rid}`).value);
  const revSel = $(`r_rev_select_${rid}`);
  const revHidden = $(`r_revision_id_${rid}`);
  const revRaw = (revSel?.value || revHidden?.value || "").trim();
  const revId = numOrNull(revRaw);

  const payload = {
    part_id: partId,
    qty: numOrNull($(`r_qty_${rid}`).value),
    unit_price: numOrNull($(`r_price_${rid}`).value),
    note: strOrNull($(`r_notes_${rid}`).value),
  };

  if (!payload.part_id) {
    toast("Enter Part No", false);
    return;
  }

  const partIdForRev = revListPartId[rid];
  if (revId && partIdForRev === partId) {
    payload.revision_id = revId;
  } else if (revId && partIdForRev !== partId) {
    const hid = $(`r_revision_id_${rid}`);
    if (hid) hid.value = "";
    if (revSel) revSel.value = "";
    toast("Revision cleared: it didn’t belong to the selected part.", false);
  }

  if (payload.qty == null) delete payload.qty;
  if (payload.unit_price == null) delete payload.unit_price;
  if (payload.note == null) delete payload.note;

  try {
    if (isNew) {
      const created = await jfetch(`/pos/${encodeURIComponent(poId)}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      poLines.unshift(created);
      toast("Line added");
    } else {
      const updated = await jfetch(
        `/pos/${encodeURIComponent(poId)}/lines/${rid}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const idx = poLines.findIndex((x) => x.id === Number(rid));
      if (idx >= 0) poLines[idx] = updated;
      toast("Line updated");
    }
    editingLineId = null;
    renderLines();
  } catch (e) {
    const msg = String(e?.message || "").toLowerCase();
    if (
      msg.includes("revision_id does not belong") ||
      msg.includes("belongs to part")
    ) {
      const hid = $(`r_revision_id_${rid}`);
      if (hid) hid.value = "";
      if (revSel) revSel.value = "";
      toast(
        "Selected revision doesn’t belong to this part. Revision cleared — try saving again.",
        false
      );
    } else {
      toast(e?.message || "Save failed", false);
    }
  }
}

async function deleteLine(id) {
  if (!poId || !id) return;
  if (!confirm("Delete line?\nThis action cannot be undone.")) return;
  try {
    await jfetch(`/pos/${encodeURIComponent(poId)}/lines/${id}`, {
      method: "DELETE",
    });
    poLines = poLines.filter((x) => x.id !== id);
    toast("Deleted");
    renderLines();
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

/* ---- Autocomplete Part / Rev (inline row) ---- */
let partAcBox,
  partItems = [],
  partActive = -1,
  partInput;
let currentPartRid = null;
function ensurePartBox() {
  if (partAcBox) return partAcBox;
  partAcBox = document.createElement("div");
  Object.assign(partAcBox.style, {
    position: "absolute",
    zIndex: "9999",
    minWidth: "240px",
    maxHeight: "260px",
    overflow: "auto",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    boxShadow: "0 10px 20px rgba(2,6,23,.08), 0 2px 6px rgba(2,6,23,.06)",
    display: "none",
  });
  partAcBox.className = "ac-box";
  document.body.appendChild(partAcBox);
  return partAcBox;
}
function positionPartBox(input) {
  const r = input.getBoundingClientRect();
  partAcBox.style.left = `${window.scrollX + r.left}px`;
  partAcBox.style.top = `${window.scrollY + r.bottom + 4}px`;
  partAcBox.style.width = `${r.width}px`;
}
function hidePartAc() {
  if (!partAcBox) return;
  partAcBox.style.display = "none";
  partItems = [];
  partActive = -1;
}
function setPartActive(i) {
  partActive = i;
  [...partAcBox.querySelectorAll(".ac-item")].forEach((el, idx) => {
    el.style.background = idx === partActive ? "rgba(0,0,0,.04)" : "";
  });
}
function renderPartAc(list) {
  const box = ensurePartBox();
  partItems = list || [];
  partActive = -1;
  if (!partItems.length) {
    hidePartAc();
    return;
  }
  box.innerHTML = list
    .map(
      (p, i) => `
    <div class="ac-item" data-i="${i}" style="padding:8px 10px; cursor:pointer; display:flex; gap:8px; align-items:center">
      <span class="badge" style="font-size:11px">${escapeHtml(p.part_no)}</span>
      <div style="flex:1"><div style="font-weight:600">${escapeHtml(
        p.name || ""
      )}</div></div>
    </div>
  `
    )
    .join("");
  [...box.querySelectorAll(".ac-item")].forEach((el) => {
    el.addEventListener("mouseenter", () =>
      setPartActive(parseInt(el.dataset.i, 10))
    );
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (currentPartRid != null)
        choosePartForRow(currentPartRid, parseInt(el.dataset.i, 10));
    });
  });
  box.style.display = "";
}
function normalizeItems(resp) {
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === "object") return resp.items || [];
  return [];
}
const fetchPartSuggest = debounce(async (term) => {
  try {
    const url =
      !term || term.trim().length === 0
        ? `/parts?page=1&per_page=10`
        : `/parts?q=${encodeURIComponent(term)}&page=1&per_page=20`;
    const resp = await jfetch(url);
    const rows = normalizeItems(resp).map((p) => ({
      id: p.id,
      part_no: (p.part_no || "").toUpperCase(),
      name: p.name || "",
    }));
    renderPartAc(rows.slice(0, 20));
    ensurePartBox();
    if (partInput) positionPartBox(partInput);
  } catch {
    renderPartAc([]);
  }
}, 220);

const revFetchToken = {};
const revListPartId = {};
function attachRowPartAutocomplete(rid, input) {
  currentPartRid = rid;
  partInput = input;
  input.setAttribute("autocomplete", "off");
  input.addEventListener("input", () => {
    const term = (input.value || "").trim();
    $(`r_part_id_${rid}`).value = "";
    resetRevChoicesInto(rid);
    fetchPartSuggest(term);
    ensurePartBox();
    positionPartBox(input);
  });
  input.addEventListener("focus", () => {
    const term = (input.value || "").trim();
    fetchPartSuggest(term);
    ensurePartBox();
    positionPartBox(input);
  });
  input.addEventListener("blur", () => setTimeout(hidePartAc, 100));
  input.addEventListener("keydown", (e) => {
    if (!partAcBox || partAcBox.style.display === "none") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPartActive(Math.min(partActive + 1, partItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPartActive(Math.max(partActive - 1, 0));
    } else if (e.key === "Enter") {
      if (partActive >= 0) {
        e.preventDefault();
        choosePartForRow(rid, partActive);
      }
    } else if (e.key === "Escape") {
      hidePartAc();
    }
  });
}
async function choosePartForRow(rid, idx) {
  if (idx < 0 || idx >= partItems.length) return;
  const p = partItems[idx]; // {id, part_no, name}
  $(`r_part_code_${rid}`).value = (p.part_no || "").toUpperCase();
  $(`r_part_id_${rid}`).value = p.id;

  const sel = $(`r_rev_select_${rid}`);
  if (sel) {
    sel.disabled = true;
    sel.innerHTML = `<option value="">Loading…</option>`;
  }

  hidePartAc();
  await loadRevisionsForInto(p.id, rid);
}
function resetRevChoicesInto(rid) {
  const sel = $(`r_rev_select_${rid}`);
  const hid = $(`r_revision_id_${rid}`);
  if (sel) {
    sel.disabled = true;
    sel.innerHTML = `<option value="">— Select revision —</option>`;
  }
  if (hid) hid.value = "";
  revListPartId[rid] = undefined;
}
async function fetchPartRevisions(partId) {
  const tryEndpoints = [
    `/part-revisions?part_id=${encodeURIComponent(partId)}`,
    `/parts/${encodeURIComponent(partId)}/revisions`,
  ];
  for (const url of tryEndpoints) {
    try {
      const data = await jfetch(url);
      const arr = Array.isArray(data) ? data : data?.items || [];
      if (Array.isArray(arr)) {
        const rows = arr.map((r) => ({
          id: r.id,
          rev: r.rev || r.revision || r.code || "",
          is_current: !!(r.is_current ?? r.current ?? r.active),
        }));
        if (rows.length || url.includes("/revisions")) return rows;
      }
    } catch {}
  }
  return [];
}
async function loadRevisionsForInto(partId, rid, opts = {}) {
  revFetchToken[rid] = (revFetchToken[rid] || 0) + 1;
  const myToken = revFetchToken[rid];
  const sel = $(`r_rev_select_${rid}`);
  const hid = $(`r_revision_id_${rid}`);
  if (!sel || !hid) return;

  sel.disabled = true;
  sel.innerHTML = `<option value="">Loading…</option>`;
  hid.value = "";
  try {
    const revs = await fetchPartRevisions(partId);
    if (myToken !== revFetchToken[rid]) return;

    sel.innerHTML = [`<option value="">— No revision —</option>`]
      .concat(
        revs.map((r) => `<option value="${r.id}">${escapeHtml(r.rev)}</option>`)
      )
      .join("");
    sel.disabled = false;
    revListPartId[rid] = partId;

    let chosenId = null;
    if (opts.preferId && revs.some((r) => r.id === opts.preferId))
      chosenId = String(opts.preferId);
    else if (opts.preferText) {
      const found = revs.find((r) => String(r.rev) === String(opts.preferText));
      if (found) chosenId = String(found.id);
    } else {
      const cur = revs.find((r) => r.is_current);
      if (cur) chosenId = String(cur.id);
      else if (revs[0]) chosenId = String(revs[0].id);
    }
    sel.value = chosenId ?? "";
    hid.value = sel.value || "";
  } catch {
    sel.disabled = false;
    sel.innerHTML = `<option value="">— No revision —</option>`;
    hid.value = "";
  }
}

/* ---------- utils ---------- */
function numOrNull(v) {
  const n = Number(v);
  return isFinite(n) ? n : null;
}
function strOrNull(v) {
  v = (v ?? "").trim();
  return v ? v : null;
}

/* =================== Resizer =================== */
(function setupSplitResizer() {
  const resizer = document.getElementById("splitResizer");
  if (!resizer) return;
  const root = document.documentElement;
  const saved = localStorage.getItem("pos:listW");
  if (saved) root.style.setProperty("--list-w", saved);

  let dragging = false,
    startX = 0,
    startW = 0;
  const leftPanel = resizer.previousElementSibling;

  resizer.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    startW = leftPanel.getBoundingClientRect().width;
    resizer.setPointerCapture?.(e.pointerId);
    document.body.classList.add("resizing");
  });
  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    let w = startW + dx;
    const min = 360,
      max = Math.min(window.innerWidth * 0.6, 860);
    w = Math.max(min, Math.min(max, w));
    root.style.setProperty("--list-w", w + "px");
  });
  window.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    const cur = getComputedStyle(root).getPropertyValue("--list-w").trim();
    localStorage.setItem("pos:listW", cur);
    document.body.classList.remove("resizing");
  });
})();

/* =================== Boot =================== */
document.addEventListener("DOMContentLoaded", () => {
  // search: pick PO to load
  els.search?.addEventListener("input", () => {
    poTarget = els.search;
    const t = (els.search.value || "").trim();
    fetchPoSuggest(t);
    ensurePoBox();
    positionPoBox(els.search);
  });
  els.search?.addEventListener("focus", () => {
    poTarget = els.search;
    const t = (els.search.value || "").trim();
    fetchPoSuggest(t);
    ensurePoBox();
    positionPoBox(els.search);
  });
  els.search?.addEventListener("blur", () => setTimeout(hidePoAc, 100));
  els.search?.addEventListener("keydown", async (e) => {
    if (!poBox || poBox.style.display === "none") {
      if (e.key === "Enter") {
        e.preventDefault();
        await tryLoadPoFromText(els.search.value);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPoActive(Math.min(poActive + 1, poItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPoActive(Math.max(poActive - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (poActive >= 0) {
        choosePoActive(poActive);
      } else {
        await tryLoadPoFromText(els.search.value);
      }
    } else if (e.key === "Escape") {
      hidePoAc();
    }
  });

  // buttons (header)
  els.btnEdit?.addEventListener("click", () => {
    if (!original) return;
    tempEdits = primeTempEdits(original);
    applyMode("edit");
    focusField("po_number");
  });
  els.btnNew?.addEventListener("click", () => {
    poId = null;
    original = null;
    selectedCustomer = null;
    tempEdits = primeTempEdits({});
    applyMode("create");
    renderLines([]); // clear lines
    focusField("po_number");
  });
  els.btnSave?.addEventListener("click", savePO);
  els.btnCancel?.addEventListener("click", cancelEdits);
  els.btnDelete?.addEventListener("click", deletePO);

  $("po_reload")?.addEventListener("click", () => {
    if (poId) {
      loadPO(poId).then(loadLines);
    } else {
      renderKV({}); // clear view
      renderLines([]); // clear lines
    }
  });
  els.btnAddLine?.addEventListener("click", startAddLine);

  // initial
  if (poId) {
    loadPO(poId).then(loadLines);
  } else {
    renderKV({});
    renderLines([]);
  }
  applyMode("view");
});
