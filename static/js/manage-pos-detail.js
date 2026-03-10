// /static/js/manage-pos-detail.js — v7.1 AUTOSAVE lines (safe editors, debounce patch, create on part pick, multi-lot/traveler, secondary fetch)
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
  return isNaN(d)
    ? "—"
    : d.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
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
  const d = new Date(v);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
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
    .link{color:#2563eb;text-decoration:none}
    .link:hover{text-decoration:underline}
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
    appendTo: document.body,
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

/* ---------- EDIT MODE CONTROL ---------- */
let isReadOnly = true; // default mode
const editingRows = new WeakSet();

function setReadMode(on) {
  isReadOnly = on;
  if (linesTable) {
    linesTable.setEditable(!on);
  }
}
function toggleRowEdit(row, on = true) {
  if (!row) return;
  if (on) {
    editingRows.add(row);
    row.getElement().classList.add("is-editing");
  } else {
    editingRows.delete(row);
    row.getElement().classList.remove("is-editing");
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

  console.log("test",draft)
  try {
    isSubmitting = true;
    setBusy(true);
    if (!initial?.id) {
        console.log("post")
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
        console.log("patch",initial.id,patch)
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
    elCustomer.value = `${initial.customer.code} — ${initial.customer.name ?? ""
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
  if (!subTitle) return; // check element id to show in html
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
    payload.due_date = null;
  } else {
    const iso1 = toISODate(row.due_date);
    if (iso1) payload.due_date = iso1;
  }

  // Due 2
  if (row.second_due_date === "" || row.second_due_date == null) {
    payload.second_due_date = null;
  } else {
    const iso2 = toISODate(row.second_due_date);
    if (iso2) payload.second_due_date = iso2;
  }

  if (payload.qty == null) delete payload.qty;
  if (payload.unit_price == null) delete payload.unit_price;
  if (!payload.note) delete payload.note;

  return payload;
}

/* ---------- Normalizer (now supports arrays) ---------- */
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

    // arrays (fallback จากฟิลด์เดี่ยวถ้ามี)
    lots: Array.isArray(row.lots)
      ? row.lots
      : row.lot_id && row.lot_no
        ? [{ id: row.lot_id, lot_no: row.lot_no }]
        : [],

    travelers: Array.isArray(row.travelers)
      ? row.travelers
      : row.traveler_id && row.traveler_no
        ? [{ id: row.traveler_id, traveler_no: row.traveler_no }]
        : [],
  };
}

/* ---------- AUTOSAVE for lines ---------- */

async function autosaveRow(row, { immediate = false } = {}) {
  const d = row.getData();
  console.log(d)
  const poid = initial?.id ?? poIdQS;
  if (!poid) {
    toast("Save header first", false);
    markHeaderDirty(true);
    return;
  }

  const hasAny =
    d.part_id ||
    d.revision_id != null ||
    d.qty != null ||
    d.unit_price != null ||
    d.due_date ||
    d.second_due_date ||
    d.note;

  if (!d.id && !d.part_id) return;
  if (hasAny && !d.part_id) {
    toast("Select Part first", false);
    return;
  }

  const payload = buildLinePayload(d);

  // ✅ CREATE
  if (!d.id) {
    if (createInFlight.has(row)) return;
    createInFlight.add(row);
    try {
      const created = await jfetch(`/pos/${encodeURIComponent(poid)}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const norm = normalizeServerLine(created);
      row.update(norm);
      setDirtyClass(row, false);
      toast("Line added");

      // ✅ Auto-create Lot & Traveler right after new line created
      try {
        await createLotAndTravelerForRow(row);
        toast("Auto-created lot/traveler");
      } catch (err) {
        console.warn("Auto-create Lot/Traveler failed:", err);
      }
    } catch (e) {
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("second_due_date") && msg.includes("earlier")) {
        toast("Due 2 cannot be earlier than Due 1", false);
      } else {
        toast(e?.message || "Create failed", false);
      }
    } finally {
      createInFlight.delete(row);
      setTimeout(() => {
        try {
          linesTable.redraw(true);
        } catch { }
      }, 0);
    }
    return;
  }

  // ✅ PATCH (debounced)
  if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));
  const apply = async () => {
    patchTimers.delete(row);

    const keepRevId = d.revision_id;
    const keepRevText = d.revision_text;

    try {
      const updated = await jfetch(
        `/pos/${encodeURIComponent(poid)}/lines/${d.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const norm = normalizeServerLine(updated || d);

      // 🧩 ป้องกันไม่ให้ server overwrite revision ที่เพิ่งตั้งเอง
      if (d.id && !norm.revision_id && keepRevId) {
        norm.revision_id = keepRevId;
        norm.revision_text = keepRevText;
      }

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
    } catch (e) {
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
        try {
          const fresh = await jfetch(
            `/pos/${encodeURIComponent(poid)}/lines/${d.id}`
          );
          row.update(normalizeServerLine(fresh));
        } catch { }
        toast(e?.message || "Save failed", false);
      }
    } finally {
      setTimeout(() => {
        try {
          linesTable.redraw(true);
        } catch { }
      }, 0);
    }
  };

  if (immediate) await apply();
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
      success(it.part_no);
      const row = cell.getRow();

      (async () => {
        // ✅ อัปเดต part ทันที
        row.update({
          part_id: it.id,
          part_no: it.part_no,
          revision_id: null,
          revision_text: "",
        });
        setDirtyClass(row, true);
        // await autosaveRow(row, { immediate: true });
// just mark dirty, don't save
setDirtyClass(row, true);

        // ✅ ดึง revision ปัจจุบัน
        try {
          const revs = await jfetch(`/parts/${it.id}/revisions`);
          
          const current = (revs || []).find(
            (r) => r.is_current || r.isCurrent || r.current
          );
          if (current) {
            row.update({
              revision_id: current.id,
              revision_text: current.rev || current.code || "",
            });

          
            // ✅ รอ 0.5 วิ แล้วบันทึก revision ไป backend
            // setTimeout(() => autosaveRow(row, { immediate: true }), 500);
            // just mark dirty, don't save
setDirtyClass(row, true);

            toast(`Auto-selected current revision: ${current.rev}`);
          } else {
            toast("No current revision found", false);
          }
        } catch (e) {
          console.error("Revision fetch failed:", e);
          toast("Load revision failed", false);
        }
      })();
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
      success(it.rev);
      const row = cell.getRow();
      setTimeout(() => {
        row.update({ revision_id: it.id, revision_text: it.rev });
        setDirtyClass(row, true);
        // autosaveRow(row);
        setDirtyClass(row, true);
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

/* ---------- Build Lot+Traveler (multi) ---------- */
async function createLotAndTravelerForRow(row) {
  const d = row.getData();
  
  const poid = initial?.id ?? poIdQS;
  if (!poid || !d?.id) {
    toast("Missing PO or line", false);
    return;
  }

  const body = {
    planned_qty: d.qty ?? null,
    lot_due_date: toISODate(d.due_date) ?? null,
    part_revision_id: d.revision_id ?? null,
  };
  try {
    const res = await jfetch(
      `/po-lines/${encodeURIComponent(d.id)}/lot-traveler`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const lots = Array.isArray(d.lots) ? d.lots.slice() : [];
    lots.unshift({ id: res.lot_id, lot_no: res.lot_no });

    const travelers = Array.isArray(d.travelers) ? d.travelers.slice() : [];
    travelers.unshift({ id: res.traveler_id, traveler_no: res.traveler_no });

    // ✅ อัปเดตข้อมูลใน row
    row.update({ lots, travelers });

    toast("Lot & Traveler created");

    // ✅ Force refresh render (สำคัญมาก)
    row.reformat(); // ให้ formatter ทั้ง Materials / Shipments ทำงานใหม่
    setTimeout(() => {
      linesTable.redraw(true); // เผื่อ tabulator ยัง hold layout
    }, 100);
  } catch (e) {
    toast(e?.message || "Create lot/traveler failed", false);
  }
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
    } catch { }
  };

  linesTable = new Tabulator(holder, {
    layout: "fitColumns",
    height: "calc(100vh - 420px)",
    placeholder: "No lines",
    selectableRows: false,
    reactiveData: true,
    index: "id",

    columns: [
      // {
      //   title: "No.",
      //   field: "_rowno",
      //   width: 70,
      //   hozAlign: "right",
      //   headerHozAlign: "right",
      //   headerSort: false,
      //   formatter: (cell) => cell.getRow().getPosition(true),
      // },
      {
        title: "Part No.",
        field: "part_no",
        width: 120,
        editor: partAutocompleteEditor,
        formatter: (cell) => {
          const d = cell.getData();
          const pid = d.part_id ?? d.part?.id ?? null;
          const pno = d.part_no ?? d.part?.part_no ?? "";
          const revId =
            d.revision_id ??
            d.revision?.id ??
            d.rev?.id ??
            d.revision?.revision_id ??
            null;
          const custId = selectedCustomer?.id ?? initial?.customer?.id ?? null;

          if (!pid) return safe(String(pno || ""));

          const href = `/static/manage-part-detail.html?part_id=${encodeURIComponent(pid)}${custId ? `&customer_id=${encodeURIComponent(custId)}` : ""}`;

          return `<a class="link" href="${href}" >${safe(String(pno))}</a>`;
        },
      },
      {
        title: "Revision",
        field: "revision_text",
        width: 80,
        editor: revisionAutocompleteEditor,
      },
      {
        title: "Qty",
        field: "qty",
        width: 70,
        hozAlign: "right",
        headerHozAlign: "right",
        editor: "number",
        editorParams: { step: "1" },
        formatter: (c) => fmtQty(c.getValue()),
      },
      {
        title: "Price",
        field: "unit_price",
        width: 80,
        hozAlign: "right",
        headerHozAlign: "right",
        editor: "number",
        editorParams: { step: "0.01" },
        formatter: (c) => fmtMoney(c.getValue()),
      },

      {
        title: "Due 1",
        field: "due_date",
        width: 90,
        editor: "date",

        formatter: (c) => {
          const val = c.getValue();
          if (!val) return "";

          // รับได้ทั้ง "YYYY-MM-DD" และ ISO string
          const datePart = String(val).split("T")[0];
          const [y, m, d] = datePart.split("-");
          if (!y || !m || !d) return "";

          const mm = String(m).padStart(2, "0");
          const dd = String(d).padStart(2, "0");
          const yy = String(y).slice(-2);

          return `${mm}/${dd}/${yy}`;
        },
      }
      ,

      {
        title: "Due 2",
        field: "second_due_date",
        width: 90,
        editor: "date",

        formatter: (c) => {
          const val = c.getValue();
          if (!val) return "";

          // รองรับทั้ง YYYY-MM-DD และ ISO
          const datePart = String(val).split("T")[0];
          const [y, m, d] = datePart.split("-");
          if (!y || !m || !d) return "";

          const mm = String(m).padStart(2, "0");
          const dd = String(d).padStart(2, "0");
          const yy = String(y).slice(-2);

          return `${mm}/${dd}/${yy}`;
        },
      }
      ,
      { title: "Notes", field: "note", editor: "input", width: 120 },

      // --- Multi-Lot & Multi-Traveler renderers ---
      {
        title: `Lot`,
        field: "lots",
        width: 110,
        headerSort: false,

        formatter: (cell) => {
          const lots = cell.getValue() || [];

          const lotHtml = lots.length
            ? lots
              .map(
                (l) => `
              <span style="white-space: nowrap;">
                <a class="link"
                   href="/static/lot-detail.html?lot_id=${encodeURIComponent(l.id)}"
                   title="Open materials for ${safe(l.lot_no)}">
                  ${safe(l.lot_no)}
                </a>
                <a href="#"
                   class="link text-red-500"
                   data-lotid="${l.id}"
                   title="Delete ${safe(l.lot_no)}">❌</a>
              </span>
            `
              )
              .join("<br>")
            : "";

          // ✅ แค่ append ปุ่ม Add ต่อท้าย
          return `
      ${lotHtml}
      ${lotHtml ? "<br>" : ""}
      <div style="margin-top:4px; text-align:center;">
        <button
          class="btn-mini btn-primary"
          data-act="build"
        >
          Add
        </button>
      </div>
    `;
        },

        cellClick: async (e, cell) => {
          const row = cell.getRow();
          const d = row.getData();

          /* ===== delete lot (เหมือนเดิม) ===== */
          const delLink = e.target.closest("a[data-lotid]");
          if (delLink) {
            e.preventDefault();

            const lotId = delLink.dataset.lotid;
            if (!confirm(`Delete lot ${lotId}? This action cannot be undone.`))
              return;

            try {
              await jfetch(`/lots/${encodeURIComponent(lotId)}`, {
                method: "DELETE",
              });
              toast(`Deleted lot ${lotId}`);

              const newLots = (d.lots || []).filter(
                (l) => String(l.id) !== lotId
              );

              const newTravelers = (d.travelers || []).filter((t, i) => {
                const lot = d.lots?.[i];
                return lot && String(lot.id) !== lotId;
              });

              row.update({ lots: newLots, travelers: newTravelers });
              row.reformat();
              setTimeout(() => linesTable.redraw(true), 100);
            } catch (err) {
              toast(err?.message || "Delete failed", false);
            }
            return;
          }

          /* ===== add lot (เหมือนคอลัมน์เดิม Lot/Traveler) ===== */
          const addBtn = e.target.closest("button[data-act='build']");
          if (addBtn) {
            e.preventDefault();
            await createLotAndTravelerForRow(row);
          }
        },
      },

      {
        title: "Traveler",
        field: "travelers",
        width: 100,
        headerSort: false,
        formatter: (cell) => {
          const lots = cell.getRow().getData().lots || [];
          if (!lots.length) return "";
          return lots
            .map(
              (l) =>
                `<a class="link" href="/static/traveler-detail.html?lot_id=${encodeURIComponent(
                  l.id
                )}" title="Open materials for ${safe(l.lot_no)}">
            ${safe(l.lot_no)}
          </a>`
            )
            .join("<br>");
        },
      },

      {
        title: "Materials",
        field: "materials",
        width: 100,
        headerSort: false,
        formatter: (cell) => {
          const lots = cell.getRow().getData().lots || [];
          if (!lots.length) return "";
          return lots
            .map(
              (l) =>
                `<a class="link" href="/static/manage-lot-materials.html?lot_id=${encodeURIComponent(
                  l.id
                )}" title="Open materials for ${safe(l.lot_no)}">
            ${safe(l.lot_no)}
          </a>`
            )
            .join("<br>");
        },
      },
      {
        title: "Shipments",
        field: "shipments",
        width: 100,
        headerSort: false,
        formatter: (cell) => {
          const lots = cell.getRow().getData().lots || [];
          if (!lots.length) return "";
          return lots
            .map(
              (l) =>
                `<a class="link" href="/static/manage-lot-shippments.html?lot_id=${encodeURIComponent(
                  l.id
                )}" title="Open shipments for ${safe(l.lot_no)}">
            ${safe(l.lot_no)}
          </a>`
            )
            .join("<br>");
        },
      },
      {
  title: "Actions",
  field: "_actions",
  width: 120,
  hozAlign: "center",
  headerSort: false,

  formatter: () => `
  <div>
    <button class="btn-mini btn-primary" data-act="save">Save</button>
    <button class="btn-mini btn-danger" data-act="del">Delete</button>
  </div>
`,

 cellClick: async (e, cell) => {
  const row = cell.getRow();
  const act = e.target.closest("button")?.dataset?.act;

  if (act === "save") {
    await autosaveRow(row, { immediate: true });
    toast("Line saved");
    return;
  }

  if (act === "del") {
    await deleteLine(row);
  }
},

}

      // {
      //   title: "Lot/Traveler",
      //   field: "_build",
      //   width: 140,
      //   hozAlign: "center",
      //   headerSort: false,
      //   formatter: () =>
      //     `<button class="btn-mini btn-primary" data-act="build">Add</button>`,
      //   cellClick: async (e, cell) => {
      //     const btn = e.target.closest("button[data-act='build']");
      //     if (!btn) return;
      //     await createLotAndTravelerForRow(cell.getRow());
      //   },
      // },

  //     {
  //       title: "Actions",
  //       field: "_actions",
  //       width: 160,
  //       hozAlign: "center",
  //       headerSort: false,
  //       formatter: () => `
  //   <div>
  //     <button class="btn-mini btn-secondary" data-act="edit">✎ Edit</button>
  //     <button class="btn-mini btn-danger" data-act="del">Delete</button>
  //   </div>
  // `,
  //       cellClick: async (e, cell) => {
  //         const btn = e.target.closest("button[data-act]");
  //         if (!btn) return;
  //         const act = btn.dataset.act;
  //         const row = cell.getRow();

  //         if (act === "edit") {
  //           // Switch to edit mode for that row
  //           toggleRowEdit(row, true);
  //           setReadMode(false);
  //           const firstEditable = row
  //             .getCells()
  //             .find((c) => c.getColumn().getDefinition().editor);
  //           if (firstEditable) firstEditable.edit(true);
  //           toast("Editing mode");
  //           return;
  //         }
  //         if (act === "del") {
  //           await deleteLine(row);
  //         }
  //       },
  //     },
    ],
  });

  // AUTOSAVE on cell edit (debounced per-row)
  linesTable.on("cellEdited", (cell) => {
  const row = cell.getRow();
  setDirtyClass(row, true); // just mark dirty, no save
})

  linesTable.on("tableBuilt", () => {
    ready = true;
    requestAnimationFrame(safeRedraw);
    setTimeout(safeRedraw, 0);
  });
  const ro = new ResizeObserver(safeRedraw);
  ro.observe(holder);
  window.addEventListener("resize", safeRedraw);

  // Double-click to enter edit mode
  linesTable.on("rowDblClick", (e, row) => {
    toggleRowEdit(row, true);
    setReadMode(false);
    const firstEditable = row
      .getCells()
      .find((c) => c.getColumn().getDefinition().editor);
    if (firstEditable) firstEditable.edit(true);
    toast("Editing mode");
  });
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
    lots: [],
    travelers: [],
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

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    // when window restored, force Tabulator to re-enable editors
    setTimeout(() => {
      try {
        linesTable.redraw(true);
        // refocus any active editor if present
        const active = document.querySelector(".tabulator-editing");
        if (active) {
          active.focus();
          active.select?.();
        }
      } catch { }
    }, 100);
  }
});
/* ---------- Delete line ---------- */
async function deleteLine(row) {
  const d = row.getData();
  if (!d) return;
  if (!d.id) {
    row.delete();
    return;
  }
  if (!confirm("Delete line?\nThis action cannot be undone.")) return;
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

/* ---------- Secondary fetch to keep links after refresh ---------- */
async function enrichLinesWithLinks() {
  const rows = linesTable?.getRows() || [];
  await Promise.all(
    rows.map(async (r) => {
      const d = r.getData();
      if (!d?.id) return;
      try {
        const links = await jfetch(
          `/po-lines/${encodeURIComponent(d.id)}/links`
        );
        r.update({
          lots: Array.isArray(links?.lots) ? links.lots : [],
          travelers: Array.isArray(links?.travelers) ? links.travelers : [],
        });
      } catch {
        // ignore
      }
    })
  );
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

    // ✅ enrich links
    await enrichLinesWithLinks();

    // ✅ บังคับ redraw ทั้งตาราง + defer ให้ layout ready ก่อน
    requestAnimationFrame(() => {
      try {
        linesTable.redraw(true);
      } catch (err) {
        console.warn("redraw failed", err);
      }
    });
  } catch (err) {
    console.warn("reloadLines failed", err);
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
