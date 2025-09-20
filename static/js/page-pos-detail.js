// /static/js/page-pos-detail.js (v3 – Tabulator lines)
import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

const qs = new URLSearchParams(location.search);
const poIdQS = qs.get("id"); // if present => view/edit, else => create

/* ---------- STATE ---------- */
let mode = poIdQS ? "view" : "create"; // view | edit | create
let initial = null;     // current PO object
let tempEdits = {};     // draft header
let isSubmitting = false;
let selectedCustomer = null; // {id, code, name}
let linesTable = null;  // Tabulator instance

// fields + labels
const FIELD_KEYS = ["po_number", "customer", "description", "created_at"];
const FIELD_LABELS = {
  po_number: "PO No.",
  customer: "Customer",
  description: "Description",
  created_at: "Created",
};
const INPUT_TYPE = { po_number: "text", description: "textarea" };

/* ---------- EL REFS ---------- */
const hintEl = $("po_hint");
const errEl = $("po_error");
const viewEl = $("po_view");
const subTitle = $("po_subTitle");
const btnEdit = $("po_btnEdit");
const btnNew = $("po_btnNew");
const btnSave = $("po_btnSave");
const btnCancel = $("po_btnCancel");
const btnDelete = $("po_btnDelete");
const btnAddLine = $("btnAddLine");

/* ---------- UTILS ---------- */
const safe = (s) => String(s ?? "").replaceAll("<", "&lt;");
const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleString();
};
const trim = (v) => (v == null ? "" : String(v).trim());

function setBusy(b) {
  [btnEdit, btnNew, btnSave, btnCancel, btnDelete, btnAddLine].forEach((el) => {
    if (!el) return;
    el.disabled = !!b;
    el.setAttribute("aria-disabled", String(b));
    el.classList.toggle("is-busy", !!b);
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
// ------- async suggests for Tabulator cell editors -------
async function suggestParts(term) {
  const q = (term || "").trim();
  const url = q
    ? `/parts?q=${encodeURIComponent(q)}&page=1&per_page=20`
    : `/parts?page=1&per_page=10`;
  try {
    const resp = await jfetch(url);
    const arr = Array.isArray(resp) ? resp : resp.items || [];
    return arr.map(p => ({
      id: p.id,
      part_no: String(p.part_no || "").toUpperCase(),
      name: p.name || "",
    }));
  } catch {
    return [];
  }
}

async function suggestRevisions(partId, term) {
  if (!partId) return [];
  const tryUrls = [
    `/part-revisions?part_id=${encodeURIComponent(partId)}`,
    `/parts/${encodeURIComponent(partId)}/revisions`,
  ];
  for (const url of tryUrls) {
    try {
      const data = await jfetch(url);
      const arr = Array.isArray(data) ? data : data?.items || [];
      const list = (arr || []).map(r => ({
        id: r.id,
        rev: r.rev || r.revision || r.code || "",
        is_current: !!(r.is_current ?? r.current ?? r.active),
      }));
      if (list.length || url.includes("/revisions")) return list;
    } catch {}
  }
  return [];
}

/* ---------- Customer autocomplete ---------- */
async function searchCustomers(term) {
  const q = (term || "").trim();
  try {
    if (!q) {
      const res0 = await jfetch(`/customers/keyset?limit=10`);
      const items0 = Array.isArray(res0) ? res0 : res0.items ?? [];
      return items0.map((x) => ({ id: x.id, code: x.code ?? "", name: x.name ?? "" }));
    }
    const res = await jfetch(`/customers?q=${encodeURIComponent(q)}&page=1&page_size=10`);
    const items = Array.isArray(res) ? res : res.items ?? [];
    return items.map((x) => ({ id: x.id, code: x.code ?? "", name: x.name ?? "" }));
  } catch {
    return [];
  }
}
// ------- Tabulator custom editor: Part Autocomplete -------
function partAutocompleteEditor(cell, onRendered, success, cancel) {
  const startVal = String(cell.getValue() ?? "");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = startVal;
  input.autocomplete = "off";
  input.style.width = "100%";

  // Wire your shared autocomplete helper
  attachAutocomplete(input, {
    fetchItems: suggestParts,
    getDisplayValue: (it) => (it ? `${it.part_no} — ${it.name}` : ""),
    renderItem: (it) =>
      `<div class="ac-row"><b>${safe(it.part_no)}</b> — ${safe(it.name)}</div>`,
    openOnFocus: true,
    minChars: 0,
    debounceMs: 200,
    maxHeight: 260,
    onPick: (it) => {
      // 1) Commit the visible cell value
      success(it.part_no);
      // 2) Also update backing fields in the row
      const row = cell.getRow();
      // clear any stale revision on part change
      row.update({
        part_id: it.id,
        part_no: it.part_no,
        revision_id: null,
        revision_text: "",
      });
    },
  });

  onRendered(() => {
    input.focus();
    input.select();
  });

  // keyboard: Enter -> commit typed value (try to resolve), Esc -> cancel
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const raw = input.value.trim();
      if (!raw) { success(""); return; }
      // Try to resolve typed part to id if user didn't pick from list
      const found = await resolvePart(raw);
      if (found) {
        const row = cell.getRow();
        row.update({
          part_id: found.id,
          part_no: found.part_no,
          revision_id: null,
          revision_text: "",
        });
        success(found.part_no);
      } else {
        toast("Unknown Part No", false);
        // keep editor open
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  // blur -> do not auto-commit unresolved text (prevents stale state)
  input.addEventListener("blur", () => {
    // optional: cancel on blur if not resolved
    // cancel();
  });

  return input;
}

// ------- Tabulator custom editor: Revision Autocomplete (depends on part) -------
function revisionAutocompleteEditor(cell, onRendered, success, cancel) {
  const row = cell.getRow();
  const rowData = row.getData();
  const partId = rowData.part_id;

  if (!partId) {
    // No part chosen yet
    const span = document.createElement("span");
    span.textContent = "Select part first";
    span.style.opacity = "0.7";
    // auto close shortly so user can pick part
    setTimeout(() => cancel(), 700);
    return span;
  }

  const startVal = String(cell.getValue() ?? "");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = startVal;
  input.autocomplete = "off";
  input.style.width = "100%";

  attachAutocomplete(input, {
    fetchItems: (term) => suggestRevisions(partId, term),
    getDisplayValue: (it) => (it ? String(it.rev) : ""),
    renderItem: (it) =>
      `<div class="ac-row"><b>${safe(it.rev)}</b>${it.is_current ? ' <span class="muted">(current)</span>' : ""}</div>`,
    openOnFocus: true,
    minChars: 0,
    debounceMs: 200,
    maxHeight: 240,
    onPick: (it) => {
      // commit visible value
      success(it.rev);
      // sync backing id field
      row.update({ revision_id: it.id, revision_text: it.rev });
    },
  });

  onRendered(() => {
    input.focus();
    input.select();
  });

  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const raw = input.value.trim();
      if (!raw) { success(""); row.update({ revision_id: null, revision_text: "" }); return; }
      const rid = await resolveRevision(partId, raw);
      if (rid) {
        row.update({ revision_id: rid, revision_text: raw });
        success(raw);
      } else {
        toast("Unknown revision for this part", false);
        // keep editor open
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  return input;
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
    onPick: (it) => {
      selectedCustomer = it || null;
      input.value = it ? `${it.code} — ${it.name}` : "";
    },
    openOnFocus: true,
    minChars: 0,
    debounceMs: 200,
    maxHeight: 260,
  });

  input.addEventListener("input", () => { selectedCustomer = null; });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); cancelEdits(); }
  });
  return input;
}

/* ---------- HEADER RENDER ---------- */
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
  const base = mode === "create" ? {} : initial ?? {};
  return { ...base, ...tempEdits };
}
function focusField(key) {
  const el = viewEl?.querySelector(`.kv-input[data-field="${CSS.escape(key)}"]`);
  el?.focus();
}
function applyMode(nextMode) {
  if (nextMode) mode = nextMode;
  renderHeader(getWorkingData());
}
function renderHeader(data = {}) {
  if (!viewEl) return;

  const empty = !data || (Object.keys(data).length === 0 && mode !== "create");
  if (empty) {
    viewEl.innerHTML = `<div class="muted">No PO selected</div>`;
    return;
  }

  const editing = mode === "edit" || mode === "create";
  const pick = (k, def = "") =>
    Object.prototype.hasOwnProperty.call(tempEdits, k) ? tempEdits[k] : data[k] ?? def;

  const rows = FIELD_KEYS.map((key) => {
    const label = FIELD_LABELS[key];
    const cur = pick(key, null);

    let valHtml = "";
    if (!editing) {
      if (key === "customer") {
        valHtml = cur ? `${safe(cur.code ?? "")} — ${safe(cur.name ?? "")}` : "—";
      } else if (key === "created_at") {
        valHtml = fmtDate(cur);
      } else {
        const text = trim(cur ?? "");
        valHtml = text === "" ? "—" : safe(text);
      }
    } else {
      if (key === "customer") {
        valHtml = '<div data-field="customer"></div>';
      } else if (INPUT_TYPE[key] === "textarea") {
        valHtml = `<textarea class="kv-input" data-field="${key}" rows="3">${safe(cur ?? "")}</textarea>`;
      } else if (key === "created_at") {
        valHtml = fmtDate(cur) || "—";
      } else {
        valHtml = `<input class="kv-input" data-field="${key}" type="${INPUT_TYPE[key] || "text"}" value="${safe(cur ?? "")}" />`;
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

  // subtitle
  subTitle.textContent = initial?.id ? `#${initial.id} — ${initial.po_number ?? ""}` : "(new)";

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
    const holder = viewEl.querySelector('.kv-val[data-key="customer"]');
    if (holder) holder.replaceChildren(buildCustomerInput(pick("customer", null)));

    viewEl.querySelectorAll(".kv-input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const k = e.target.dataset.field;
        tempEdits[k] = e.target.value;
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "TEXTAREA") {
          e.preventDefault(); saveHeader();
        } else if (e.key === "Escape") {
          e.preventDefault(); cancelEdits();
        }
      });
    });
  }

  // toggle buttons
  btnSave.style.display = editing ? "" : "none";
  btnCancel.style.display = editing ? "" : "none";
  btnEdit.style.display = editing ? "none" : "";
  btnNew.style.display = editing ? "none" : "";
}

/* ---------- IO: load/save/delete header ---------- */
async function loadHeader() {
  if (!poIdQS) {
    initial = null;
    tempEdits = primeEdits({});
    applyMode("create");
    return;
  }
  setBusy(true);
  setError("");
  try {
    const po = await jfetch(`/pos/${encodeURIComponent(poIdQS)}`);
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
      const created = await jfetch(`/pos`, { method: "POST", body: JSON.stringify(payload) });
      toast("PO created");
      initial = created;
      tempEdits = {};
      mode = "view";
      renderHeader(initial);
      // redirect to self with id (keep history clean)
      location.replace(`/static/pos-detail.html?id=${encodeURIComponent(created.id)}`);
      return;
    } else {
      const updated = await jfetch(`/pos/${encodeURIComponent(initial.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      toast("Saved");
      initial = updated;
      tempEdits = {};
      mode = "view";
      renderHeader(initial);
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
    await jfetch(`/pos/${encodeURIComponent(initial.id)}`, { method: "DELETE" });
    toast("Deleted");
    location.href = "/static/pos.html";
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  } finally {
    setBusy(false);
  }
}

/* ============= LINES: Tabulator Grid ============= */
// Helpers used by lines
function numOrNull(v) { const n = Number(v); return isFinite(n) ? n : null; }
function strOrNull(v) { v = (v ?? "").trim(); return v ? v : null; }

// Resolve part text (part_no) to {id, part_no, name}
async function resolvePart(text) {
  const t = (text || "").trim();
  if (!t) return null;
  try {
    const resp = await jfetch(`/parts?q=${encodeURIComponent(t)}&page=1&per_page=1`);
    const arr = Array.isArray(resp) ? resp : resp.items || [];
    const it = arr[0];
    if (it?.id) return { id: it.id, part_no: String(it.part_no || "").toUpperCase(), name: it.name || "" };
  } catch {}
  return null;
}
// Fetch revisions for a part_id
async function fetchRevisions(partId) {
  const tryUrls = [
    `/part-revisions?part_id=${encodeURIComponent(partId)}`,
    `/parts/${encodeURIComponent(partId)}/revisions`,
  ];
  for (const url of tryUrls) {
    try {
      const data = await jfetch(url);
      const arr = Array.isArray(data) ? data : data?.items || [];
      if (Array.isArray(arr)) {
        return arr.map(r => ({
          id: r.id,
          rev: r.rev || r.revision || r.code || "",
          is_current: !!(r.is_current ?? r.current ?? r.active),
        }));
      }
    } catch {}
  }
  return [];
}
// Resolve revision text (like 'A') for a given partId to id
async function resolveRevision(partId, revText) {
  if (!partId || !revText) return null;
  const revs = await fetchRevisions(partId);
  const found = revs.find(r => String(r.rev) === String(revText));
  return found ? found.id : null;
}

// Build payload to POST/PATCH
function buildLinePayload(rowData) {
  const payload = {};
  if (rowData.part_id != null) payload.part_id = rowData.part_id;
  if (rowData.revision_id != null) payload.revision_id = rowData.revision_id;
  if (rowData.qty != null) payload.qty = numOrNull(rowData.qty);
  if (rowData.unit_price != null) payload.unit_price = numOrNull(rowData.unit_price);
  if (rowData.note != null) payload.note = strOrNull(rowData.note);
  if (rowData.due_date != null) payload.due_date = strOrNull(rowData.due_date); // <-- add this

  if (payload.qty == null) delete payload.qty;
  if (payload.unit_price == null) delete payload.unit_price;
  if (payload.note == null) delete payload.note;
  if (!payload.due_date) delete payload.due_date; // keep payload clean

  return payload;
}


function fmtMoney(n) {
  return n == null ? "" : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtQty(n) {
  return Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

// Install Tabulator
function initLinesTable() {
  const holder = document.getElementById("po_lines_table");
  if (!holder) return;

  let tableReady = false;

  // Helper that only redraws when the table is fully ready & visible
  const safeRedraw = () => {
    if (!tableReady) return;
    if (!holder.isConnected) return;
    // Avoid redrawing when the container has no layout width (e.g. hidden tab)
    if (!holder.offsetWidth) return;
    try {
      linesTable.redraw(true);
    } catch (_) {
      /* no-op: avoid crashing on transient states */
    }
  };

  linesTable = new Tabulator(holder, {
    layout: "fitColumns",
    height: "calc(100vh - 420px)",
    placeholder: "No lines",
    selectableRows: false,        // <-- replace deprecated `selectable`
    reactiveData: true,
    index: "id",

    columns: [
      {
        title: "No.",
        field: "_rowno",
        width: 70,
        hozAlign: "right",
        headerHozAlign: "right",
        headerSort: false,
        formatter: (cell) => cell.getRow().getPosition(true),
      },
      {
        title: "Part No.",
        field: "part_no",
        width: 200,
        editor: partAutocompleteEditor,
        formatter: (cell) => {
          const d = cell.getData();
          const pid = d.part_id ?? d.part?.id ?? null;
          const pno = d.part_no ?? d.part?.part_no ?? "";
          return pid
            ? `<a class="link" href="/static/part-detail.html?id=${encodeURIComponent(pid)}">${safe(String(pno))}</a>`
            : safe(String(pno || ""));
        },
      },
      { title: "Revision", field: "revision_text", width: 140, editor: revisionAutocompleteEditor },
      {
        title: "Qty",
        field: "qty",
        width: 120,
        hozAlign: "right",
        headerHozAlign: "right",
        formatter: (cell) => fmtQty(cell.getValue()),
        editor: "number",
        editorParams: { step: "1" },
      },
      {
        title: "Unit Price",
        field: "unit_price",
        width: 140,
        hozAlign: "right",
        headerHozAlign: "right",
        formatter: (cell) => fmtMoney(cell.getValue()),
        editor: "number",
        editorParams: { step: "0.01" },
      },
      { title: "Due", field: "due_date", width: 160, editor: "input" },
      { title: "Notes", field: "note", editor: "input" },
      {
        title: "Actions",
        field: "_actions",
        width: 260,               // was 180
        minWidth: 240,            // ensures room for 3 buttons
        hozAlign: "right",
        headerHozAlign: "right",
        headerSort: false,
        cssClass: "cell-actions", // <-- add this
        formatter: () => `
          <button class="btn-small" data-act="save">Save</button>
          <button class="btn-small secondary" data-act="cancel">Cancel</button>
          <button class="btn-small btn-danger" data-act="del">Delete</button>
        `,
        cellClick: async (e, cell) => {
          const btn = e.target.closest("button[data-act]");
          if (!btn) return;
          const act = btn.dataset.act;
          const row = cell.getRow();
          if (act === "cancel") {
            row.reformat();
            if (!row.getData().id) {
              row.delete();
            } else {
              await reloadLines();
            }
          } else if (act === "del") {
            await handleDeleteRow(row);
          } else if (act === "save") {
            await handleSaveRow(row);
          }
        },
      },
    ],
  });

  // Only mark ready & redraw after Tabulator has finished building
  linesTable.on("tableBuilt", () => {
    tableReady = true;
    // first stable layout pass (after fonts/layout settle)
    requestAnimationFrame(safeRedraw);
    setTimeout(safeRedraw, 0); // extra safety for some flex layouts
  });

  // Redraw on window resize (guarded)
  const onResize = () => safeRedraw();
  window.addEventListener("resize", onResize);

  // Redraw when the container size changes
  const ro = new ResizeObserver(onResize);
  ro.observe(holder);

  // (optional) cleanup if you ever tear the page down dynamically:
  // return () => { ro.disconnect(); window.removeEventListener("resize", onResize); };
}


function normalizeServerLine(row) {
  // Map server line -> table row
  return {
    id: row.id,
    part_id: row.part?.id ?? row.part_id ?? null,
    part_no: row.part?.part_no ?? row.part_no ?? "",
    revision_id: row.revision?.id ?? row.rev?.id ?? row.revision_id ?? null,
    revision_text: row.revision?.rev ?? row.rev?.rev ?? row.revision_text ?? "",
    qty: row.qty ?? null,
    unit_price: row.unit_price ?? null,
    due_date: row.due_date ?? "",
    note: row.note ?? row.notes ?? "",
    part: row.part ?? null,  // keep original for link formatter fallback
    rev: row.rev ?? row.revision ?? null,
  };
}

async function reloadLines() {
  if (!initial?.id && !poIdQS) {
    linesTable?.setData([]);
    return;
  }
  const id = initial?.id ?? poIdQS;
  try {
    const rows = await jfetch(`/pos/${encodeURIComponent(id)}/lines`);
    const mapped = (rows || []).map(normalizeServerLine);
    linesTable?.setData(mapped);
  } catch {
    linesTable?.setData([]);
  }
}

btnAddLine?.addEventListener("click", () => {
  if (mode === "create" && !initial?.id) {
    toast("Save header first", false);
    return;
  }
  // add an editable row at top
  linesTable?.addRow({
    part_no: "",
    revision_text: "",
    qty: null,
    unit_price: null,
    due_date: "",
    note: "",
  }, true /* add at top */);
});

/* ----- Save/Delete handlers ----- */
async function handleDeleteRow(row) {
  const d = row.getData();
  const id = d.id;
  const poid = initial?.id ?? poIdQS;
  if (!id) {
    row.delete();
    return;
  }
  if (!confirm("Delete line?\nThis action cannot be undone.")) return;
  try {
    await jfetch(`/pos/${encodeURIComponent(poid)}/lines/${id}`, { method: "DELETE" });
    toast("Deleted");
    row.delete();
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

async function handleSaveRow(row) {
  const poid = initial?.id ?? poIdQS;
  if (!poid) {
    toast("Save header first", false);
    return;
  }

  // Get current edit values
  const d = row.getData();
  let { id, part_id, part_no, revision_id, revision_text } = d;
  const qty = d.qty;
  const unit_price = d.unit_price;
  const note = d.note;
  const due_date = d.due_date; // if you later support due_date on server, include it

  // Resolve part/revision if needed
  if (!part_id && part_no) {
    const rp = await resolvePart(part_no);
    if (!rp) { toast("Unknown Part No", false); return; }
    part_id = rp.id;
    part_no = rp.part_no;
  }
  if (revision_text && part_id && !revision_id) {
    const rid = await resolveRevision(part_id, revision_text);
    revision_id = rid ?? null; // allow empty
  }

  const payload = buildLinePayload({ part_id, revision_id, qty, unit_price, note });
  try {
    if (!id) {
      // create
      const created = await jfetch(`/pos/${encodeURIComponent(poid)}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast("Line added");
      // merge server echo
      row.update(normalizeServerLine(created));
    } else {
      // update
      const updated = await jfetch(`/pos/${encodeURIComponent(poid)}/lines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast("Line updated");
      row.update(normalizeServerLine(updated));
    }
  } catch (e) {
    const msg = String(e?.message || "").toLowerCase();
    if (msg.includes("revision_id does not belong") || msg.includes("belongs to part")) {
      row.update({ revision_id: null });
      toast("Selected revision doesn’t belong to this part. Cleared revision.", false);
    } else {
      toast(e?.message || "Save failed", false);
    }
  }
}

/* ---------- EVENTS (header) ---------- */
btnEdit?.addEventListener("click", () => {
  if (!initial) return;
  tempEdits = primeEdits(initial);
  applyMode("edit");
  focusField("po_number");
});
btnNew?.addEventListener("click", () => {
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

/* ---------- BOOT ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  // Init Tabulator first (empty)
  initLinesTable();

  // Load header + then lines
  await loadHeader();
  await reloadLines();
});
