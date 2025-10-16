// /static/js/page-pos-detail.js — v7 AUTOSAVE lines (safe editors, debounce patch, create on part pick)
import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

const qs = new URLSearchParams(location.search);
const poIdQS = qs.get("id"); // present => view/edit, else => create

/* ---------- STATE ---------- */
let initial = null; // current PO from server
let isSubmitting = false;
let selectedCustomer = null; // {id, code, name}

/* lines table */
let linesTable = null;

/* AUTOSAVE state */
const createInFlight = new WeakSet();
const patchTimers = new Map();
const PATCH_DEBOUNCE_MS = 350;

/* ---------- EL REFS ---------- */
const hintEl = $("po_hint");
const errEl = $("po_error");
const subTitle = $("po_subTitle");

const elPoNumber = $("po_po_number");
const elCustomer = $("po_customer");
const elDesc = $("po_description");
const elCreated = $("po_created");

/* Header action buttons (created dynamically) */
let btnHdrSave = null;
let btnHdrCancel = null;

/* ---------- UTILS ---------- */
const safe = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const fmtDate = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d) ? "—" : d.toLocaleString();
};
const trim = (v) => (v == null ? "" : String(v).trim());

function setBusy(b) {
  hintEl.textContent = b ? "Working…" : "";
}
function setError(msg) {
  errEl.style.display = msg ? "" : "none";
  errEl.textContent = msg || "";
}

/* Highlight dirty row (optional visual cue) */
function setDirtyClass(row, on) {
  const el = typeof row.getElement === "function" ? row.getElement() : null;
  if (el && el.classList) {
    if (on) el.classList.add("is-dirty");
    else el.classList.remove("is-dirty");
  }
}

/* Dates → ISO (YYYY-MM-DD) for API */
function toISODate(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  // Try parse string like "MM/DD/YYYY" or "YYYY-MM-DD"
  const d = new Date(v);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  // If it's already an ISO-like date "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  return null;
}

/* ---------- Inject small styles ---------- */
(function injectOnce() {
  if (document.getElementById("pos-detail-actions-css")) return;
  const st = document.createElement("style");
  st.id = "pos-detail-actions-css";
  st.textContent = `
    .btn-mini{font:inherit;padding:6px 10px;border-radius:8px;border:1px solid #e5e7eb;background:#f8fafc;cursor:pointer}
    .btn-mini:hover{background:#f1f5f9}
    .btn-primary{background:#2563eb;color:#fff;border-color:#1d4ed8}
    .btn-primary:hover{background:#1d4ed8}
    .btn-danger{background:#ef4444;color:#fff;border-color:#dc2626}
    .btn-danger:hover{background:#dc2626}
    .btn-secondary{background:#6b7280;color:#fff;border-color:#4b5563}
    .btn-secondary:hover{background:#4b5563}
    .hdr-actions{display:flex;gap:8px;align-items:center}
    .tabulator-row.is-dirty{background:#fff7ed}
  `;
  document.head.appendChild(st);
})();

/* ---------- Customer autocomplete (header) ---------- */
async function searchCustomers(term) {
  const q = (term || "").trim();
  try {
    if (!q) {
      const res0 = await jfetch(`/customers/keyset?limit=10`);
      const items0 = Array.isArray(res0) ? res0 : res0.items ?? [];
      return items0.map((x) => ({
        id: x.id,
        code: x.code ?? "",
        name: x.name ?? "",
      }));
    }
    const res = await jfetch(
      `/customers?q=${encodeURIComponent(q)}&page=1&page_size=10`
    );
    const items = Array.isArray(res) ? res : res.items ?? [];
    return items.map((x) => ({
      id: x.id,
      code: x.code ?? "",
      name: x.name ?? "",
    }));
  } catch {
    return [];
  }
}
function initCustomerAutocomplete() {
  attachAutocomplete(elCustomer, {
    fetchItems: searchCustomers,
    getDisplayValue: (it) => (it ? `${it.code} — ${it.name}` : ""),
    renderItem: (it) =>
      `<div class="ac-row"><b>${safe(it.code)}</b> — ${safe(it.name)}</div>`,
    openOnFocus: true,
    minChars: 0,
    debounceMs: 200,
    maxHeight: 260,
    onPick: async (it) => {
      selectedCustomer = it;
      elCustomer.value = `${it.code} — ${it.name}`;
      markHeaderDirty(true);
    },
  });
  elCustomer.addEventListener("input", () => {
    selectedCustomer = null;
    markHeaderDirty(true);
  });
}

/* ---------- Header load ---------- */
async function loadHeader() {
  if (!poIdQS) {
    initial = null;
    subTitle.textContent = "(new)";
    elPoNumber.value = "";
    elCustomer.value = "";
    elDesc.value = "";
    elCreated.textContent = "—";
    document.title = `PO · (new)`;
    markHeaderDirty(false);
    return;
  }
  setBusy(true);
  setError("");
  try {
    const po = await jfetch(`/pos/${encodeURIComponent(poIdQS)}`);
    initial = po;
    subTitle.textContent = `#${po.id} — ${po.po_number ?? ""}`;
    document.title = `PO · ${po.po_number ?? po.id}`;
    elPoNumber.value = po.po_number ?? "";
    const c = po.customer || null;
    selectedCustomer = c ? { id: c.id, code: c.code, name: c.name } : null;
    elCustomer.value = c?.code ? `${c.code} — ${c.name ?? ""}` : "";
    elDesc.value = po.description ?? "";
    elCreated.textContent = fmtDate(po.created_at);
    markHeaderDirty(false);
  } catch (e) {
    setError(e?.message || "Load failed");
    initial = null;
    subTitle.textContent = "—";
  } finally {
    setBusy(false);
  }
}

/* ---------- Header Save/Cancel (manual) ---------- */
function getHeaderDraft() {
  return {
    po_number: (elPoNumber.value ?? "").trim(),
    customer_id: selectedCustomer?.id ?? null,
    description: (elDesc.value ?? "").trim(),
  };
}
function markHeaderDirty(on) {
  if (btnHdrSave) btnHdrSave.style.display = on ? "" : "none";
  if (btnHdrCancel) btnHdrCancel.style.display = on ? "" : "none";
}
async function saveHeaderManual() {
  if (isSubmitting) return;
  const draft = getHeaderDraft();
  if (!draft.customer_id) {
    toast("Select Customer !!", false);
    return;
  }
  try {
    isSubmitting = true;
    setBusy(true);
    if (!initial?.id) {
      const created = await jfetch(`/pos`, {
        method: "POST",
        body: JSON.stringify(draft),
      });
      toast("PO created");
      location.replace(
        `/static/pos-detail.html?id=${encodeURIComponent(created.id)}`
      );
      return;
    } else {
      const patch = {};
      if (draft.po_number !== (initial.po_number ?? ""))
        patch.po_number = draft.po_number;
      const curCid = initial?.customer?.id ?? null;
      if ((draft.customer_id ?? null) !== curCid)
        patch.customer_id = draft.customer_id;
      if (draft.description !== (initial.description ?? ""))
        patch.description = draft.description;

      if (Object.keys(patch).length) {
        await jfetch(`/pos/${encodeURIComponent(initial.id)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        toast("Saved");
        await loadHeader();
      } else {
        markHeaderDirty(false);
      }
    }
  } catch (e) {
    toast(e?.message || "Save failed", false);
  } finally {
    isSubmitting = false;
    setBusy(false);
  }
}
async function cancelHeaderManual() {
  if (!initial?.id) {
    elPoNumber.value = "";
    elCustomer.value = "";
    selectedCustomer = null;
    elDesc.value = "";
    markHeaderDirty(false);
    return;
  }
  elPoNumber.value = initial.po_number ?? "";
  if (initial.customer) {
    selectedCustomer = {
      id: initial.customer.id,
      code: initial.customer.code,
      name: initial.customer.name,
    };
    elCustomer.value = `${initial.customer.code} — ${
      initial.customer.name ?? ""
    }`;
  } else {
    selectedCustomer = null;
    elCustomer.value = "";
  }
  elDesc.value = initial.description ?? "";
  markHeaderDirty(false);
}
function wireHeaderDirtyOnly() {
  const onDirty = () => markHeaderDirty(true);
  elPoNumber.addEventListener("input", onDirty);
  elPoNumber.addEventListener("change", onDirty);
  elDesc.addEventListener("input", onDirty);
  elDesc.addEventListener("change", onDirty);
}

/* Create header Save/Cancel buttons near subtitle */
function ensureHeaderButtons() {
  if (!subTitle) return;
  if (document.getElementById("hdr-actions")) return;

  const wrap = document.createElement("div");
  wrap.id = "hdr-actions";
  wrap.className = "hdr-actions";

  btnHdrSave = document.createElement("button");
  btnHdrSave.className = "btn-mini btn-primary";
  btnHdrSave.textContent = "Save";
  btnHdrSave.style.display = "none";
  btnHdrSave.addEventListener("click", saveHeaderManual);

  btnHdrCancel = document.createElement("button");
  btnHdrCancel.className = "btn-mini btn-secondary";
  btnHdrCancel.textContent = "Cancel";
  btnHdrCancel.style.display = "none";
  btnHdrCancel.addEventListener("click", cancelHeaderManual);

  subTitle.insertAdjacentElement("afterend", wrap);
  wrap.appendChild(btnHdrSave);
  wrap.appendChild(btnHdrCancel);
}

/* ---------- Lines helpers ---------- */
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
function numOrNull(v) {
  const n = Number(v);
  return isFinite(n) ? n : null;
}
function strOrNull(v) {
  v = (v ?? "").trim();
  return v || null;
}

/* Build payload for API */
function buildLinePayload(row) {
  const payload = {};

  if (row.part_id != null) payload.part_id = row.part_id;
  if (row.revision_id != null) payload.revision_id = row.revision_id;
  if (row.qty != null) payload.qty = numOrNull(row.qty);
  if (row.unit_price != null) payload.unit_price = numOrNull(row.unit_price);
  if (row.note != null) payload.note = strOrNull(row.note);

  // Due 1
  if (row.due_date === "" || row.due_date == null) {
    payload.due_date = null; // 👈 send null
  } else {
    const iso1 = toISODate(row.due_date);
    if (iso1) payload.due_date = iso1;
  }

  // Due 2
  if (row.second_due_date === "" || row.second_due_date == null) {
    payload.second_due_date = null; // 👈 send null
  } else {
    const iso2 = toISODate(row.second_due_date);
    if (iso2) payload.second_due_date = iso2;
  }

  // DO NOT delete the keys when they are null; we want to clear on server
  // (keep any existing deletions for other fields, but not the dates)
  if (payload.qty == null) delete payload.qty;
  if (payload.unit_price == null) delete payload.unit_price;
  if (!payload.note) delete payload.note;

  return payload;
}

function normalizeServerLine(row) {
  return {
    id: row.id,
    part_id: row.part?.id ?? row.part_id ?? null,
    part_no: row.part?.part_no ?? row.part_no ?? "",
    revision_id: row.revision?.id ?? row.rev?.id ?? row.revision_id ?? null,
    revision_text: row.revision?.rev ?? row.rev?.rev ?? row.revision_text ?? "",
    qty: row.qty ?? row.qty_ordered ?? null,
    unit_price: row.unit_price ?? null,
    due_date: row.due_date ?? "",
    second_due_date: row.second_due_date ?? "",
    note: row.note ?? row.notes ?? "",
    part: row.part ?? null,
    rev: row.rev ?? row.revision ?? null,
  };
}

/* ---------- AUTOSAVE for lines ---------- */
function autosaveRow(row, { immediate = false } = {}) {
  const d = row.getData();
  const poid = initial?.id ?? poIdQS;
  if (!poid) {
    toast("Save header first", false);
    markHeaderDirty(true);
    return;
  }

  // Require part for create/update when other fields present
  const hasAny =
    d.part_id ||
    d.revision_id != null ||
    d.qty != null ||
    d.unit_price != null ||
    d.due_date ||
    d.second_due_date ||
    d.note;
  if (!d.id && !d.part_id) {
    // Not enough to create yet
    return;
  }
  if (hasAny && !d.part_id) {
    toast("Select Part first", false);
    return;
  }

  const payload = buildLinePayload(d);

  // CREATE
  if (!d.id) {
    if (createInFlight.has(row)) return;
    createInFlight.add(row);
    jfetch(`/pos/${encodeURIComponent(poid)}/lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((created) => {
        const norm = normalizeServerLine(created);
        row.update(norm);
        setDirtyClass(row, false);
        toast("POS added");
      })
      .catch((e) => {
        const msg = String(e?.message || "").toLowerCase();
        if (msg.includes("second_due_date") && msg.includes("earlier")) {
          toast("Due 2 cannot be earlier than Due 1", false);
        } else {
          toast(e?.message || "Create failed", false);
        }
      })
      .finally(() => {
        createInFlight.delete(row);
        setTimeout(() => {
          try {
            linesTable.redraw(true);
          } catch {}
        }, 0);
      });
    return;
  }

  // PATCH (debounced)
  if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));
  const apply = () => {
    patchTimers.delete(row);
    jfetch(`/pos/${encodeURIComponent(poid)}/lines/${d.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((updated) => {
        const norm = normalizeServerLine(updated || d);
        // Update fields individually to avoid editor history churn
        const fields = [
          "part_id",
          "part_no",
          "revision_id",
          "revision_text",
          "qty",
          "unit_price",
          "due_date",
          "second_due_date",
          "note",
        ];
        for (const f of fields) {
          const cur = row.getData()[f];
          const nxt = norm[f];
          if (cur !== nxt) row.getCell(f)?.setValue(nxt, true);
        }
        setDirtyClass(row, false);
        toast("Saved");
      })
      .catch(async (e) => {
        const msg = String(e?.message || "").toLowerCase();
        if (
          msg.includes("revision_id does not belong") ||
          msg.includes("belongs to part")
        ) {
          row.update({ revision_id: null, revision_text: "" });
          toast(
            "Selected revision doesn’t belong to this part. Cleared revision.",
            false
          );
        } else if (msg.includes("second_due_date") && msg.includes("earlier")) {
          toast("Due 2 cannot be earlier than Due 1", false);
        } else {
          // Try refresh from server
          try {
            const fresh = await jfetch(
              `/pos/${encodeURIComponent(poid)}/lines/${d.id}`
            );
            row.update(normalizeServerLine(fresh));
          } catch {}
          toast(e?.message || "Save failed", false);
        }
      })
      .finally(() => {
        setTimeout(() => {
          try {
            linesTable.redraw(true);
          } catch {}
        }, 0);
      });
  };
  if (immediate) apply();
  else patchTimers.set(row, setTimeout(apply, PATCH_DEBOUNCE_MS));
}

/* ---------- Lines editors (safe: close editor first) ---------- */
function partAutocompleteEditor(cell, onRendered, success, cancel) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = cell.getValue() || "";
  input.autocomplete = "off";

  async function fetchParts(term) {
    const q = (term || "").trim();
    const url = q
      ? `/parts?q=${encodeURIComponent(q)}&page=1&page_size=10`
      : `/parts?page=1&page_size=10`;
    const res = await jfetch(url);
    const items = Array.isArray(res) ? res : res.items || [];
    return items.map((p) => ({ id: p.id, part_no: p.part_no, name: p.name }));
  }

  attachAutocomplete(input, {
    fetchItems: fetchParts,
    getDisplayValue: (it) => (it ? `${it.part_no} — ${it.name}` : ""),
    renderItem: (it) => `<div><b>${it.part_no}</b> — ${it.name}</div>`,
    onPick: (it) => {
      // close editor first
      success(it.part_no);
      const row = cell.getRow();
      setTimeout(() => {
        row.update({
          part_id: it.id,
          part_no: it.part_no,
          revision_id: null,
          revision_text: "",
        });
        setDirtyClass(row, true);
        autosaveRow(row, { immediate: true }); // create/update right away after part set
      }, 0);
    },
    minChars: 0,
    openOnFocus: true,
  });

  onRendered(() => {
    input.focus();
    input.select();
  });
  return input;
}

function revisionAutocompleteEditor(cell, onRendered, success, cancel) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = cell.getValue() || "";
  input.autocomplete = "off";

  const partId = cell.getRow().getData().part_id;
  if (!partId) {
    input.placeholder = "Select part first";
    return input;
  }

  async function _fetchRevisions() {
    const url = `/parts/${partId}/revisions`;
    const res = await jfetch(url);
    const items = Array.isArray(res) ? res : res.items || [];
    return items.map((r) => ({
      id: r.id,
      rev: r.rev || r.code,
      is_current: r.is_current,
    }));
  }

  attachAutocomplete(input, {
    fetchItems: _fetchRevisions,
    getDisplayValue: (it) => (it ? it.rev : ""),
    renderItem: (it) =>
      `<div><b>${it.rev}</b> ${it.is_current ? "(current)" : ""}</div>`,
    onPick: (it) => {
      success(it.rev); // close editor first
      const row = cell.getRow();
      setTimeout(() => {
        row.update({ revision_id: it.id, revision_text: it.rev });
        setDirtyClass(row, true);
        autosaveRow(row);
      }, 0);
    },
    minChars: 0,
    openOnFocus: true,
  });

  onRendered(() => {
    input.focus();
    input.select();
  });
  return input;
}

/* ---------- Install Tabulator (Lines) ---------- */
function initLinesTable() {
  const holder = document.getElementById("po_lines_table");
  if (!holder) return;

  let ready = false;
  const safeRedraw = () => {
    if (!ready || !holder.offsetWidth) return;
    try {
      linesTable.redraw(true);
    } catch {}
  };

  linesTable = new Tabulator(holder, {
    layout: "fitColumns",
    height: "calc(100vh - 420px)",
    placeholder: "No lines",
    selectableRows: false,
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
            ? `<a class="link" href="/static/part-detail.html?id=${encodeURIComponent(
                pid
              )}">${safe(String(pno))}</a>`
            : safe(String(pno || ""));
        },
      },
      {
        title: "Revision",
        field: "revision_text",
        width: 140,
        editor: revisionAutocompleteEditor,
      },
      {
        title: "Qty",
        field: "qty",
        width: 120,
        hozAlign: "right",
        headerHozAlign: "right",
        editor: "number",
        editorParams: { step: "1" },
        formatter: (c) => fmtQty(c.getValue()),
      },
      {
        title: "Unit Price",
        field: "unit_price",
        width: 140,
        hozAlign: "right",
        headerHozAlign: "right",
        editor: "number",
        editorParams: { step: "0.01" },
        formatter: (c) => fmtMoney(c.getValue()),
      },
      {
        title: "Due 1",
        field: "due_date",
        width: 150,
        editor: "date",
        formatter: (c) =>
          c.getValue() ? new Date(c.getValue()).toLocaleDateString() : "",
      },
      {
        title: "Due 2",
        field: "second_due_date",
        width: 150,
        editor: "date",
        formatter: (c) =>
          c.getValue() ? new Date(c.getValue()).toLocaleDateString() : "",
      },
      { title: "Notes", field: "note", editor: "input" },
      {
        title: "Actions",
        field: "_actions",
        width: 120,
        hozAlign: "center",
        headerSort: false,
        formatter: () => `
          <div>
            <button class="btn-mini btn-danger" data-act="del">Delete</button>
          </div>
        `,
        cellClick: async (e, cell) => {
          const btn = e.target.closest("button[data-act='del']");
          if (!btn) return;
          await deleteLine(cell.getRow());
        },
      },
    ],
  });

  // AUTOSAVE on cell edit (debounced per-row)
  linesTable.on("cellEdited", (cell) => {
    const row = cell.getRow();
    setDirtyClass(row, true);
    setTimeout(() => {
      // If a date field was cleared, autosave will send null now
      autosaveRow(row);
    }, 0);
  });

  linesTable.on("tableBuilt", () => {
    ready = true;
    requestAnimationFrame(safeRedraw);
    setTimeout(safeRedraw, 0);
  });
  const ro = new ResizeObserver(safeRedraw);
  ro.observe(holder);
  window.addEventListener("resize", safeRedraw);
}

function makeBlankLine() {
  return {
    part_no: "",
    revision_text: "",
    qty: null,
    unit_price: null,
    due_date: "",
    second_due_date: "",
    note: "",
  };
}

/* header + button for add line */
document.addEventListener("DOMContentLoaded", () => {
  const addBtn = document.getElementById("btnAddLine");
  if (!addBtn) return;
  addBtn.addEventListener("click", async () => {
    if (!initial?.id && !poIdQS) {
      toast("Save header first", false);
      markHeaderDirty(true);
      return;
    }
    const row = await linesTable.addRow(makeBlankLine(), true);
    const cell = row.getCell("part_no");
    if (cell) cell.edit(true);
    setDirtyClass(row, true);
  });
});

/* ---------- Delete line ---------- */
async function deleteLine(row) {
  const d = row.getData();
  if (!d) return;
  if (!d.id) {
    row.delete();
    return;
  }
  if (!confirm("Delete POS?\nThis action cannot be undone.")) return;
  const poid = initial?.id ?? poIdQS;
  try {
    await jfetch(`/pos/${encodeURIComponent(poid)}/lines/${d.id}`, {
      method: "DELETE",
    });
    row.delete();
    toast("Deleted");
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

/* ---------- Lines IO ---------- */
async function reloadLines() {
  const id = initial?.id ?? poIdQS;
  if (!id) {
    linesTable?.setData([]);
    return;
  }
  try {
    const rows = await jfetch(`/pos/${encodeURIComponent(id)}/lines`);
    const mapped = (rows || []).map(normalizeServerLine);
    linesTable?.setData(mapped);
  } catch {
    linesTable?.setData([]);
  }
}

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  ensureHeaderButtons(); // header still manual save
  initCustomerAutocomplete();
  initLinesTable();

  await loadHeader();
  await reloadLines();

  wireHeaderDirtyOnly();
});
