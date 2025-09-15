// /static/js/page-pos-all.js (v1)
import { $, jfetch, toast } from "./api.js";
import { renderTableX } from "./tablex.js";
import { attachAutocomplete } from "./autocomplete.js";

/* ====== LIST REFS ====== */
const inputSearch = $("po_q"),
  selPerPage = $("po_per_page"),
  btnPrevTop = $("po_prev"),
  btnNextTop = $("po_next"),
  pageInfoTop = $("po_page_info"),
  btnPrevBot = $("po_prev2"),
  btnNextBot = $("po_next2"),
  pageInfoBot = $("po_page_info2"),
  tableContainer = $("po_table"),
  btnReload = $("po_reload");

/* ====== DETAIL REFS ====== */
const hintEl = $("po_hint"),
  errEl = $("po_error"),
  viewEl = $("po_view"),
  subTitle = $("po_subTitle"),
  btnEdit = $("po_btnEdit"),
  btnNew = $("po_btnNew"),
  btnSave = $("po_btnSave"),
  btnCancel = $("po_btnCancel"),
  btnDelete = $("po_btnDelete");

const ENDPOINTS = {
  list: (p) => `/pos?${p}`,
  base: `/pos`,
  byId: (id) => `/pos/${encodeURIComponent(id)}`,
  lines: (id) => `/pos/${encodeURIComponent(id)}/lines`,
  partRevs: (partId) => `/part-revisions?part_id=${encodeURIComponent(partId)}`,
};

/* ====== LIST STATE ====== */
const L = {
  page: 1,
  pageSize: Number(selPerPage?.value || 20),
  q: "",
  total: 0,
  items: [],
};

/* ====== DETAIL STATE ====== */
let selectedId = null,
  initial = null,
  mode = "view",
  tempEdits = {},
  isSubmitting = false;
let selectedCustomer = null; // {id,code,name}

const FIELD_KEYS = ["po_number", "customer", "description", "created_at"];
const FIELD_LABELS = {
  po_number: "PO No.",
  customer: "Customer",
  description: "Description",
  created_at: "Created",
};
const INPUT_TYPE = { po_number: "text", description: "textarea" };

/* ====== UTILS ====== */
const safe = (s) => String(s ?? "").replaceAll("<", "&lt;");
const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleString();
};
const trim = (v) => (v == null ? "" : String(v).trim());
const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
function setBusy(b) {
  [btnEdit, btnNew, btnSave, btnCancel, btnDelete].forEach((el) => {
    if (!el) return;
    el.disabled = !!b;
    el.setAttribute("aria-disabled", String(b));
  });
  if (hintEl) hintEl.textContent = b ? "Working…" : "";
}
function setError(m) {
  if (!errEl) return;
  if (!m) {
    errEl.style.display = "none";
    errEl.textContent = "";
  } else {
    errEl.style.display = "";
    errEl.textContent = m;
  }
}

/* ====== CUSTOMER AUTOCOMPLETE ====== */
async function searchCustomers(term) {
  const q = (term || "").trim();
  try {
    if (!q) {
      const r0 = await jfetch(`/customers/keyset?limit=10`);
      const it = Array.isArray(r0) ? r0 : r0.items ?? [];
      return it.map((x) => ({
        id: x.id,
        code: x.code ?? "",
        name: x.name ?? "",
      }));
    }
    const r = await jfetch(
      `/customers?q=${encodeURIComponent(q)}&page=1&page_size=10`
    );
    const it = Array.isArray(r) ? r : r.items ?? [];
    return it.map((x) => ({
      id: x.id,
      code: x.code ?? "",
      name: x.name ?? "",
    }));
  } catch {
    return [];
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
    renderItem: (it) =>
      `<div class="ac-row"><b>${it.code}</b> — ${it.name}</div>`,
    onPick: (it) => {
      selectedCustomer = it || null;
      input.value = it ? `${it.code} — ${it.name}` : "";
    },
    openOnFocus: true,
    minChars: 0,
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

/* ====== LIST ====== */
function computeTotalPages() {
  if (L.total && L.pageSize)
    return Math.max(1, Math.ceil(L.total / L.pageSize));
  return L.items.length < L.pageSize && L.page === 1 ? 1 : L.page;
}
function syncPager() {
  const totalPages = computeTotalPages();
  const label = `Page ${L.page}${L.total ? ` / ${totalPages}` : ""}`;
  pageInfoTop && (pageInfoTop.textContent = label);
  pageInfoBot && (pageInfoBot.textContent = label);
  const canPrev = L.page > 1;
  const canNext = L.total ? L.page < totalPages : L.items.length === L.pageSize;
  [btnPrevTop, btnPrevBot].forEach((b) =>
    b?.toggleAttribute("disabled", !canPrev)
  );
  [btnNextTop, btnNextBot].forEach((b) =>
    b?.toggleAttribute("disabled", !canNext)
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
  if (!tableContainer) return;
  tableContainer.innerHTML = `<div style="padding:12px">Loading…</div>`;
  try {
    const p = new URLSearchParams({
      page: String(L.page),
      page_size: String(L.pageSize),
      q: L.q || "",
      _: String(Date.now()),
    });
    const data = await jfetch(ENDPOINTS.list(p.toString()));
    L.items = data.items ?? [];
    L.total = Number(data.total ?? 0);
    const rows = L.items.map((it) => ({
      id: it.id,
      po_number: it.po_number,
      customer: it.customer,
      description: it.description ?? "",
      created_at: it.created_at,
    }));
    renderPosTable(tableContainer, rows, {
      rowStart: (L.page - 1) * L.pageSize,
    });
    syncPager();
    // auto-select first if none
    if (!selectedId && rows.length) selectPo(rows[0].id, { silent: true });
  } catch (e) {
    console.error(e);
    tableContainer.innerHTML = `<div style="padding:12px;color:#b91c1c">Load error</div>`;
    toast("Load POs failed");
    syncPager();
  }
}

/* ====== DETAIL (header) ====== */
function primeEdits(base) {
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
  return { ...base, ...tempEdits };
}
function focusField(key) {
  const el = viewEl?.querySelector(
    `.kv-input[data-field="${CSS.escape(key)}"]`
  );
  el?.focus();
}
function applyMode(next) {
  if (next) mode = next;
  renderHeader(getWorkingData());
}
function renderHeader(data = {}) {
  if (!viewEl) return;
  const empty = !data || (Object.keys(data).length === 0 && mode !== "create");
  if (empty) {
    viewEl.innerHTML = `<div class="muted">Select a PO on the left</div>`;
    subTitle.textContent = "—";
    toggleButtons(false);
    return;
  }

  const editing = mode === "edit" || mode === "create";
  const pick = (k, def = "") =>
    Object.prototype.hasOwnProperty.call(tempEdits, k)
      ? tempEdits[k]
      : data[k] ?? def;

  const rows = FIELD_KEYS.map((key) => {
    const label = FIELD_LABELS[key];
    const cur = pick(key, null);
    let valHtml = "";
    if (!editing) {
      if (key === "customer") {
        valHtml = cur
          ? `${safe(cur.code ?? "")} — ${safe(cur.name ?? "")}`
          : "—";
      } else if (key === "created_at") {
        valHtml = fmtDate(cur);
      } else {
        const t = trim(cur ?? "");
        valHtml = t === "" ? "—" : safe(t);
      }
    } else {
      if (key === "customer") {
        valHtml = '<div data-field="customer"></div>';
      } else if (INPUT_TYPE[key] === "textarea") {
        valHtml = `<textarea class="kv-input" data-field="${key}" rows="3">${safe(
          cur ?? ""
        )}</textarea>`;
      } else if (key === "created_at") {
        valHtml = fmtDate(cur) || "—";
      } else {
        valHtml = `<input class="kv-input" data-field="${key}" type="${
          INPUT_TYPE[key] || "text"
        }" value="${safe(cur ?? "")}" />`;
      }
    }
    return `<div class="kv-row${
      editing ? " editing" : ""
    }" data-key="${key}"><div class="kv-key">${safe(
      label
    )}</div><div class="kv-val" data-key="${key}">${valHtml}</div></div>`;
  }).join("");

  viewEl.innerHTML = rows;
  subTitle.textContent = initial?.id
    ? `#${initial.id} — ${initial.po_number ?? ""}`
    : "(new)";

  // dblclick to edit
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
    const holder = viewEl.querySelector('.kv-val[data-key="customer"]');
    if (holder)
      holder.replaceChildren(buildCustomerInput(pick("customer", null)));

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
          saveHeader();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelEdits();
        }
      });
    });
  }

  toggleButtons(editing);
}
function toggleButtons(editing) {
  btnSave.style.display = editing ? "" : "none";
  btnCancel.style.display = editing ? "" : "none";
  btnEdit.style.display = editing ? "none" : "";
  btnNew.style.display = editing ? "none" : "";
}
async function loadHeader(id) {
  if (!id) {
    // create mode
    initial = null;
    tempEdits = primeEdits({});
    applyMode("create");
    return;
  }
  setBusy(true);
  setError("");
  try {
    const po = await jfetch(ENDPOINTS.byId(id));
    initial = po;
    tempEdits = {};
    applyMode("view");
    document.title = `PO · ${po.po_number ?? po.id}`;
  } catch (e) {
    setError(e?.message || "Load failed");
    initial = null;
    tempEdits = {};
    applyMode("view");
  } finally {
    setBusy(false);
  }
}
function buildHeaderPayload() {
  const data = getWorkingData();
  const customer_id = selectedCustomer?.id ?? data.customer?.id ?? null;
  return {
    po_number: trim(data.po_number) || null,
    customer_id,
    description: data.description ? trim(data.description) : "",
  };
}
async function saveHeader() {
  if (isSubmitting) return;
  const payload = buildHeaderPayload();
  if (!payload.customer_id) {
    toast("Select Customer !!", false);
    focusField("customer");
    return;
  }
  setBusy(true);
  isSubmitting = true;
  try {
    if (mode === "create" || !initial?.id) {
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast("PO created");
      initial = created;
      tempEdits = {};
      mode = "view";
      renderHeader(initial);
      // list refresh + select
      L.page = 1;
      await loadPOs();
      await selectPo(created.id);
    } else {
      const updated = await jfetch(ENDPOINTS.byId(initial.id), {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      toast("Saved");
      initial = updated;
      tempEdits = {};
      mode = "view";
      renderHeader(initial);
      // sync row
      const row = L.items.find((x) => String(x.id) === String(selectedId));
      if (row) {
        row.po_number = updated.po_number;
        row.customer = updated.customer;
        row.description = updated.description ?? "";
      }
      renderPosTable(tableContainer, L.items, {
        rowStart: (L.page - 1) * L.pageSize,
      });
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
  mode = "view";
  renderHeader(initial || {});
}
async function deleteHeader() {
  if (!initial?.id) return;
  if (!confirm("ลบ PO นี้?\nThis action cannot be undone.")) return;
  setBusy(true);
  try {
    await jfetch(ENDPOINTS.byId(initial.id), { method: "DELETE" });
    toast("Deleted");
    // remove from list + refresh selection
    L.items = L.items.filter((x) => String(x.id) !== String(initial.id));
    renderPosTable(tableContainer, L.items, {
      rowStart: (L.page - 1) * L.pageSize,
    });
    initial = null;
    selectedId = null;
    tempEdits = {};
    mode = "view";
    renderHeader({});
    await loadPOs();
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  } finally {
    setBusy(false);
  }
}

/* ====== SELECT LIST ROW -> LOAD DETAIL + LINES ====== */
async function selectPo(id, { silent } = {}) {
  selectedId = id;
  highlightSelected();
  await loadHeader(id);
  await loadLines();
  if (!silent) {
    /* scroll into view if needed (optional) */
  }
}
function highlightSelected() {
  if (!tableContainer) return;
  tableContainer
    .querySelectorAll("tr[data-id], tr[data-row-id]")
    .forEach((tr) => {
      const rid = tr.dataset.id || tr.dataset.rowId;
      tr.classList.toggle("active", String(rid) === String(selectedId));
    });
}

/* ====== LINES ====== */
let poLines = [],
  editingLineId = null; // 'new' | number
function fmtMoney(n) {
  return n == null
    ? ""
    : Number(n).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}
function fmtQty(n) {
  return Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

async function loadLines() {
  if (!selectedId) {
    $(
      "tblLinesBody"
    ).innerHTML = `<tr><td colspan="8" class="empty">No lines</td></tr>`;
    return;
  }
  try {
    const rows = await jfetch(ENDPOINTS.lines(selectedId));
    poLines = rows || [];
    renderLines();
  } catch {
    poLines = [];
    renderLines();
  }
}
function renderLines() {
  const tb = $("tblLinesBody");
  if (!tb) return;
  const rows =
    editingLineId === "new"
      ? [{ __isNew: true, id: null }].concat(poLines)
      : poLines.slice();
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
        const qty = fmtQty(row.qty),
          price = fmtMoney(row.unit_price),
          due = row.due_date ?? "";
        const partId = row.part?.id ?? row.part_id ?? null;
        const partNo = row.part?.part_no ?? row.part_id ?? "";
        const revText =
          row.revision?.rev ?? row.rev?.rev ?? row.revision_id ?? "";
        const note = row.note ?? row.notes ?? "";
        return `<tr data-id="${row.id}">
        <td style="text-align:right">${safe(String(displayNo))}</td>
        <td>${
          partId
            ? `<a class="link" href="/static/part-detail.html?id=${encodeURIComponent(
                partId
              )}">${safe(String(partNo))}</a>`
            : safe(String(partNo))
        }</td>
        <td>${safe(String(revText ?? ""))}</td>
        <td style="text-align:right">${qty}</td>
        <td style="text-align:right">${price}</td>
        <td>${safe(String(due))}</td>
        <td>${safe(String(note))}</td>
        <td style="text-align:right; white-space:nowrap">
          <button class="btn ghost btn-sm" data-edit="${row.id}">Edit</button>
          <button class="btn danger btn-sm" data-del="${row.id}">Delete</button>
        </td>
      </tr>`;
      } else {
        const rid = row.__isNew ? "new" : row.id;
        const partNo = row.part?.part_no ?? "",
          qty = row.qty ?? "",
          price = row.unit_price ?? "",
          due = row.due_date ?? "",
          note = row.note ?? row.notes ?? "";
        const partId = row.part_id ?? row.part?.id ?? "",
          revId = row.revision_id ?? row.revision?.id ?? row.rev?.id ?? "";
        return `<tr data-id="${row.id ?? ""}" data-editing="1">
        <td style="text-align:right">${safe(String(displayNo))}</td>
        <td>
          <input id="r_part_code_${rid}" value="${safe(
          partNo
        )}" placeholder="e.g. P-10001"/>
          <input id="r_part_id_${rid}" type="hidden" value="${safe(
          String(partId)
        )}">
        </td>
        <td>
          <select id="r_rev_select_${rid}" disabled><option value="">— Select revision —</option></select>
          <input id="r_revision_id_${rid}" type="hidden" value="${safe(
          String(revId)
        )}">
        </td>
        <td style="text-align:right"><input id="r_qty_${rid}" type="number" step="1" value="${safe(
          String(qty)
        )}" style="text-align:right;width:120px"></td>
        <td style="text-align:right"><input id="r_price_${rid}" type="number" step="1" value="${safe(
          String(price)
        )}" style="text-align:right;width:140px"></td>
        <td><input id="r_due_${rid}" type="date" value="${safe(
          String(due)
        )}"></td>
        <td><input id="r_notes_${rid}" value="${safe(String(note))}"></td>
        <td style="text-align:right; white-space:nowrap">
          <button class="btn btn-sm" data-save="${rid}">Save</button>
          <button class="btn ghost btn-sm" data-cancel="${rid}">Cancel</button>
          ${
            row.__isNew
              ? ""
              : `<button class="btn danger btn-sm" data-del="${rid}">Delete</button>`
          }
        </td>
      </tr>`;
      }
    })
    .join("");

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

  if (editingLineId != null) {
    const rid = editingLineId;
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
      if (partIdCandidate)
        loadRevisionsForInto(partIdCandidate, rid, {
          preferId: prevRevId,
          preferText: prevRevText,
        });
      else resetRevChoicesInto(rid);
    }
  }
}
function startEdit(id) {
  if (editingLineId != null) cancelEdit();
  editingLineId = id;
  renderLines();
}
function startAddLine() {
  if (!selectedId) {
    toast("Select or create a PO first", false);
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
  const isNew = rid === "new";
  const payload = {
    part_id: numOrNull($(`r_part_id_${rid}`).value),
    qty: numOrNull($(`r_qty_${rid}`).value),
    unit_price: numOrNull($(`r_price_${rid}`).value),
    note: strOrNull($(`r_notes_${rid}`).value),
  };
  if (!payload.part_id) {
    toast("Enter Part No", false);
    return;
  }

  const revSel = $(`r_rev_select_${rid}`),
    revHidden = $(`r_revision_id_${rid}`);
  const revRaw = (revSel?.value || revHidden?.value || "").trim();
  const revId = numOrNull(revRaw);
  if (revId && revListPartId[rid] === payload.part_id)
    payload.revision_id = revId;
  else if (revId && revListPartId[rid] !== payload.part_id) {
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
      const created = await jfetch(ENDPOINTS.lines(selectedId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      poLines.unshift(created);
      toast("Line added");
    } else {
      const updated = await jfetch(`${ENDPOINTS.lines(selectedId)}/${rid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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
        "Selected revision doesn’t belong to this part. Revision cleared — try again.",
        false
      );
    } else toast(e?.message || "Save failed", false);
  }
}
async function deleteLine(id) {
  if (!confirm("Delete line?")) return;
  try {
    await jfetch(`${ENDPOINTS.lines(selectedId)}/${id}`, { method: "DELETE" });
    poLines = poLines.filter((x) => x.id !== Number(id));
    toast("Line deleted");
    renderLines();
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

/* ====== PART + REV AUTOCOMPLETE (inline) ====== */
let partAcBox,
  partItems = [],
  partActive = -1,
  partInput,
  currentPartRid = null;
const revFetchToken = {},
  revListPartId = {};
function ensurePartBox() {
  if (partAcBox) return partAcBox;
  const box = document.createElement("div");
  Object.assign(box.style, {
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
  box.className = "ac-box";
  document.body.appendChild(box);
  partAcBox = box;
  return box;
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
      (p, i) =>
        `<div class="ac-item" data-i="${i}" style="padding:8px 10px;cursor:pointer;display:flex;gap:8px;align-items:center"><span class="badge" style="font-size:11px">${safe(
          p.part_no
        )}</span><div style="flex:1"><div style="font-weight:600">${safe(
          p.name || ""
        )}</div></div></div>`
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
  if (partInput) positionPartBox(partInput);
}
function normalizeItems(resp) {
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === "object") return resp.items || [];
  return [];
}
const debounce220 = (fn) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), 220);
  };
};
const fetchPartSuggest = debounce220(async (term) => {
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
  } catch {
    renderPartAc([]);
  }
});
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
  const p = partItems[idx];
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
  const tries = [
    ENDPOINTS.partRevs(partId),
    `/parts/${encodeURIComponent(partId)}/revisions`,
  ];
  for (const url of tries) {
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
  const my = revFetchToken[rid];
  const sel = $(`r_rev_select_${rid}`);
  const hid = $(`r_revision_id_${rid}`);
  if (!sel || !hid) return;
  sel.disabled = true;
  sel.innerHTML = `<option value="">Loading…</option>`;
  hid.value = "";
  try {
    const revs = await fetchPartRevisions(partId);
    if (my !== revFetchToken[rid]) return;
    sel.innerHTML = [`<option value="">— No revision —</option>`]
      .concat(
        revs.map((r) => `<option value="${r.id}">${safe(r.rev)}</option>`)
      )
      .join("");
    sel.disabled = false;
    revListPartId[rid] = partId;
    let chosenId = null;
    if (opts.preferId && revs.some((r) => r.id === opts.preferId))
      chosenId = String(opts.preferId);
    else if (opts.preferText) {
      const f = revs.find((r) => String(r.rev) === String(opts.preferText));
      if (f) chosenId = String(f.id);
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

/* ====== helpers ====== */
function numOrNull(v) {
  const n = Number(v);
  return isFinite(n) ? n : null;
}
function strOrNull(v) {
  v = (v ?? "").trim();
  return v ? v : null;
}

/* ====== EVENTS ====== */
inputSearch?.addEventListener(
  "input",
  debounce(() => {
    L.q = inputSearch.value || "";
    L.page = 1;
    loadPOs();
  }, 250)
);
selPerPage?.addEventListener("change", () => {
  L.pageSize = Number(selPerPage.value || 20);
  L.page = 1;
  loadPOs();
});
btnReload?.addEventListener("click", () => loadPOs());
[btnPrevTop, btnPrevBot].forEach((b) =>
  b?.addEventListener("click", () => {
    if (L.page > 1) {
      L.page--;
      loadPOs();
    }
  })
);
[btnNextTop, btnNextBot].forEach((b) =>
  b?.addEventListener("click", () => {
    const totalPages = computeTotalPages();
    if (L.total ? L.page < totalPages : L.items.length === L.pageSize) {
      L.page++;
      loadPOs();
    }
  })
);

btnEdit?.addEventListener("click", () => {
  if (!initial) return;
  tempEdits = primeEdits(initial);
  applyMode("edit");
  focusField("po_number");
});
btnNew?.addEventListener("click", () => {
  selectedId = null;
  initial = null;
  tempEdits = primeEdits({});
  applyMode("create");
  focusField("po_number");
});
btnSave?.addEventListener("click", saveHeader);
btnCancel?.addEventListener("click", () => {
  tempEdits = {};
  applyMode("view");
});
btnDelete?.addEventListener("click", deleteHeader);
$("btnAddLine")?.addEventListener("click", startAddLine);

/* ====== BOOT ====== */
document.addEventListener("DOMContentLoaded", async () => {
  renderHeader({});
  await loadPOs();
});
