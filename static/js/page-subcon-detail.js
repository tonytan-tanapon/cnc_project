// /static/js/page-subcon-detail.js — Header manual save + Lines autosave + Shipments/Receipts เบา ๆ
import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

const qs = new URLSearchParams(location.search);
const subconIdQS = qs.get("id");

/* ---------- STATE ---------- */
let initial = null;
let isSubmitting = false;
let selectedSupplier = null;

let linesTable = null;
let shipTable = null;
let rcptTable = null;

const createInFlight = new WeakSet();
const patchTimers = new Map();
const PATCH_DEBOUNCE_MS = 350;

/* ---------- EL REFS ---------- */
const subTitle = $("sc_subTitle");
const hintEl = $("sc_hint");
const errEl = $("sc_error");

const elRefNo = $("sc_ref_no");
const elSupplier = $("sc_supplier");
const elStatus = $("sc_status");
const elDue = $("sc_due");
const elNotes = $("sc_notes");
const elCreated = $("sc_created");

/* header btns */
let btnHdrSave = null,
  btnHdrCancel = null;

/* ---------- helpers ---------- */
const safe = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const trim = (v) => (v == null ? "" : String(v).trim());
const fmtDT = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d) ? "—" : d.toLocaleString();
};
const toISODate = (v) => {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const d = new Date(v);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  return null;
};
function setBusy(b) {
  hintEl.textContent = b ? "Working…" : "";
}
function setError(m) {
  errEl.style.display = m ? "" : "none";
  errEl.textContent = m || "";
}
function markHeaderDirty(on) {
  if (btnHdrSave) btnHdrSave.style.display = on ? "" : "none";
  if (btnHdrCancel) btnHdrCancel.style.display = on ? "" : "none";
}

/* ---------- supplier autocomplete ---------- */
async function searchSuppliers(term) {
  const q = (term || "").trim();
  try {
    const url = q
      ? `/suppliers?q=${encodeURIComponent(q)}&page=1&page_size=10`
      : `/suppliers?is_subcontractor=1&page=1&page_size=10`;
    const res = await jfetch(url);
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
function initSupplierAutocomplete() {
  attachAutocomplete(elSupplier, {
    fetchItems: searchSuppliers,
    getDisplayValue: (it) => (it ? `${it.code} — ${it.name}` : ""),
    renderItem: (it) =>
      `<div class="ac-row"><b>${safe(it.code)}</b> — ${safe(it.name)}</div>`,
    openOnFocus: true,
    minChars: 0,
    debounceMs: 200,
    maxHeight: 260,
    onPick: (it) => {
      selectedSupplier = it;
      elSupplier.value = `${it.code} — ${it.name}`;
      markHeaderDirty(true);
    },
  });
  elSupplier.addEventListener("input", () => {
    selectedSupplier = null;
    markHeaderDirty(true);
  });
}

/* ---------- header io ---------- */
async function loadHeader() {
  if (!subconIdQS) {
    initial = null;
    subTitle.textContent = "(new)";
    elRefNo.value = "";
    elSupplier.value = "";
    selectedSupplier = null;
    elStatus.value = "open";
    elDue.value = "";
    elNotes.value = "";
    elCreated.textContent = "—";
    document.title = `Subcon · (new)`;
    markHeaderDirty(false);
    return;
  }
  setBusy(true);
  setError("");
  try {
    const o = await jfetch(`/subcon/${encodeURIComponent(subconIdQS)}`);
    initial = o;
    subTitle.textContent = `#${o.id} — ${o.ref_no ?? ""}`;
    document.title = `Subcon · ${o.ref_no ?? o.id}`;
    elRefNo.value = o.ref_no ?? "";
    const s = o.supplier || null;
    selectedSupplier = s ? { id: s.id, code: s.code, name: s.name } : null;
    elSupplier.value = s?.code ? `${s.code} — ${s.name ?? ""}` : "";
    elStatus.value = o.status ?? "open";
    elDue.value = o.due_date ?? "";
    elNotes.value = o.notes ?? "";
    elCreated.textContent = fmtDT(o.created_at);
    markHeaderDirty(false);
  } catch (e) {
    setError(e?.message || "Load failed");
    initial = null;
    subTitle.textContent = "—";
  } finally {
    setBusy(false);
  }
}
function getHeaderDraft() {
  return {
    ref_no: trim(elRefNo.value),
    supplier_id: selectedSupplier?.id ?? null,
    status: trim(elStatus.value || "open"),
    due_date: toISODate(elDue.value),
    notes: trim(elNotes.value),
  };
}
async function saveHeaderManual() {
  if (isSubmitting) return;
  const draft = getHeaderDraft();
  if (!draft.supplier_id) {
    toast("Select Supplier !!", false);
    return;
  }
  try {
    isSubmitting = true;
    setBusy(true);
    if (!initial?.id) {
      const created = await jfetch(`/subcon`, {
        method: "POST",
        body: JSON.stringify(draft),
      });
      toast("Subcon created");
      location.replace(
        `/static/subcon-detail.html?id=${encodeURIComponent(created.id)}`
      );
      return;
    } else {
      const patch = {};
      if (draft.ref_no !== (initial.ref_no ?? "")) patch.ref_no = draft.ref_no;
      const curSid = initial?.supplier?.id ?? null;
      if ((draft.supplier_id ?? null) !== curSid)
        patch.supplier_id = draft.supplier_id;
      if (draft.status !== (initial.status ?? "open"))
        patch.status = draft.status;
      if ((draft.due_date ?? null) !== (initial.due_date ?? null))
        patch.due_date = draft.due_date;
      if (draft.notes !== (initial.notes ?? "")) patch.notes = draft.notes;
      if (Object.keys(patch).length) {
        await jfetch(`/subcon/${encodeURIComponent(initial.id)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        toast("Saved");
        await loadHeader();
        await reloadLines();
        await reloadShipments();
        await reloadReceipts();
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
function cancelHeaderManual() {
  if (!initial?.id) {
    elRefNo.value = "";
    elSupplier.value = "";
    selectedSupplier = null;
    elStatus.value = "open";
    elDue.value = "";
    elNotes.value = "";
    markHeaderDirty(false);
    return;
  }
  elRefNo.value = initial.ref_no ?? "";
  if (initial.supplier) {
    selectedSupplier = {
      id: initial.supplier.id,
      code: initial.supplier.code,
      name: initial.supplier.name,
    };
    elSupplier.value = `${initial.supplier.code} — ${
      initial.supplier.name ?? ""
    }`;
  } else {
    selectedSupplier = null;
    elSupplier.value = "";
  }
  elStatus.value = initial.status ?? "open";
  elDue.value = initial.due_date ?? "";
  elNotes.value = initial.notes ?? "";
  markHeaderDirty(false);
}
function wireHeaderDirtyOnly() {
  const onDirty = () => markHeaderDirty(true);
  [elRefNo, elStatus, elDue, elNotes].forEach((el) => {
    el.addEventListener("input", onDirty);
    el.addEventListener("change", onDirty);
  });
}
function ensureHeaderButtons() {
  const after = document.getElementById("sc_subTitle");
  if (!after) return;
  if (document.getElementById("hdr-actions")) return;
  const wrap = document.createElement("div");
  wrap.id = "hdr-actions";
  wrap.className = "hdr-actions";
  btnHdrSave = document.createElement("button");
  btnHdrSave.className = "btn-mini btn-primary";
  btnHdrSave.textContent = "Save";
  btnHdrCancel = document.createElement("button");
  btnHdrCancel.className = "btn-mini btn-secondary";
  btnHdrCancel.textContent = "Cancel";
  btnHdrSave.style.display = "none";
  btnHdrCancel.style.display = "none";
  btnHdrSave.addEventListener("click", saveHeaderManual);
  btnHdrCancel.addEventListener("click", cancelHeaderManual);
  after.insertAdjacentElement("afterend", wrap);
  wrap.appendChild(btnHdrSave);
  wrap.appendChild(btnHdrCancel);
}

/* ---------- Lines ---------- */
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
function buildLinePayload(row) {
  const p = {};
  if (row.traveler_step_id != null) p.traveler_step_id = row.traveler_step_id;
  if (row.qty_planned != null) p.qty_planned = numOrNull(row.qty_planned);
  if (row.unit_cost != null) p.unit_cost = numOrNull(row.unit_cost);
  return p;
}
function normalizeServerLine(r) {
  return {
    id: r.id,
    traveler_step_id: r.traveler_step_id ?? r.step?.id ?? null,
    lot_no: r.step?.traveler?.lot?.lot_no ?? r.lot_no ?? "",
    traveler_no: r.step?.traveler?.traveler_no ?? r.traveler_no ?? "",
    step_text: r.step
      ? `${r.step.seq ?? ""} — ${r.step.step_name ?? ""}`
      : r.step_text ?? "",
    qty_planned: r.qty_planned ?? null,
    unit_cost: r.unit_cost ?? null,
  };
}
async function searchSteps(term) {
  const q = (term || "").trim();
  try {
    const url = q
      ? `/traveler-steps?q=${encodeURIComponent(q)}&page=1&page_size=10`
      : `/traveler-steps?page=1&page_size=10`;
    const res = await jfetch(url);
    const items = Array.isArray(res) ? res : res.items ?? [];
    return items.map((s) => ({
      id: s.id,
      lot_no: s.traveler?.lot?.lot_no ?? s.lot_no ?? "",
      traveler_no: s.traveler?.traveler_no ?? s.traveler_no ?? "",
      step_seq: s.seq ?? s.step_seq ?? "",
      step_name: s.step_name ?? "",
    }));
  } catch {
    return [];
  }
}
function stepEditor(cell, onRendered, success) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = cell.getValue() || "";
  input.autocomplete = "off";
  attachAutocomplete(input, {
    fetchItems: searchSteps,
    getDisplayValue: (it) =>
      it
        ? `${it.lot_no} · ${it.traveler_no} · ${it.step_seq} — ${it.step_name}`
        : "",
    renderItem: (it) =>
      `<div><b>${safe(it.lot_no)}</b> · ${safe(it.traveler_no)} · ${safe(
        it.step_seq
      )} — ${safe(it.step_name)}</div>`,
    openOnFocus: true,
    minChars: 0,
    onPick: (it) => {
      success(`${it.step_seq} — ${it.step_name}`);
      const row = cell.getRow();
      setTimeout(() => {
        row.update({
          traveler_step_id: it.id,
          lot_no: it.lot_no,
          traveler_no: it.traveler_no,
          step_text: `${it.step_seq} — ${it.step_name}`,
        });
        autosaveLine(row, { immediate: true });
      }, 0);
    },
  });
  onRendered(() => {
    input.focus();
    input.select();
  });
  return input;
}
function initLinesTable() {
  const holder = document.getElementById("sc_lines_table");
  if (!holder) return;
  linesTable = new Tabulator(holder, {
    layout: "fitColumns",
    height: "calc(100vh - 480px)",
    placeholder: "No lines",
    reactiveData: true,
    index: "id",
    columns: [
      {
        title: "No.",
        width: 70,
        hozAlign: "right",
        headerHozAlign: "right",
        headerSort: false,
        formatter: (c) => c.getRow().getPosition(true),
      },
      { title: "Lot", field: "lot_no", width: 140 },
      { title: "Traveler", field: "traveler_no", width: 160 },
      { title: "Step", field: "step_text", minWidth: 220, editor: stepEditor },
      {
        title: "Qty",
        field: "qty_planned",
        width: 120,
        hozAlign: "right",
        headerHozAlign: "right",
        editor: "number",
        editorParams: { step: "1" },
        formatter: (c) => fmtQty(c.getValue()),
      },
      {
        title: "Unit Cost",
        field: "unit_cost",
        width: 140,
        hozAlign: "right",
        headerHozAlign: "right",
        editor: "number",
        editorParams: { step: "0.01" },
        formatter: (c) => fmtMoney(c.getValue()),
      },
      {
        title: "Actions",
        field: "_act",
        width: 120,
        hozAlign: "center",
        headerSort: false,
        formatter: () =>
          `<div><button class="btn-mini btn-danger" data-del="1">Delete</button></div>`,
        cellClick: async (e, cell) => {
          if (!e.target.closest("button[data-del]")) return;
          await deleteLine(cell.getRow());
        },
      },
    ],
  });
  linesTable.on("cellEdited", (cell) => autosaveLine(cell.getRow()));
}
function autosaveLine(row, { immediate = false } = {}) {
  const d = row.getData();
  const orderId = initial?.id ?? subconIdQS;
  if (!orderId) {
    toast("Save header first", false);
    markHeaderDirty(true);
    return;
  }
  if (!d.id && !d.traveler_step_id) return; // wait for step
  const payload = buildLinePayload(d);

  if (!d.id) {
    if (createInFlight.has(row)) return;
    createInFlight.add(row);
    jfetch(`/subcon/${encodeURIComponent(orderId)}/lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((created) => {
        row.update(normalizeServerLine(created));
        toast("Line added");
      })
      .catch((e) => {
        toast(e?.message || "Create failed", false);
      })
      .finally(() => createInFlight.delete(row));
    return;
  }

  // patch
  if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));
  const apply = () => {
    patchTimers.delete(row);
    jfetch(`/subcon/${encodeURIComponent(orderId)}/lines/${d.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((updated) => {
        row.update(normalizeServerLine(updated || d));
        toast("Saved");
      })
      .catch(async (e) => {
        try {
          const fresh = await jfetch(
            `/subcon/${encodeURIComponent(orderId)}/lines/${d.id}`
          );
          row.update(normalizeServerLine(fresh));
        } catch {}
        toast(e?.message || "Save failed", false);
      });
  };
  if (immediate) apply();
  else patchTimers.set(row, setTimeout(apply, PATCH_DEBOUNCE_MS));
}
async function deleteLine(row) {
  const d = row.getData();
  if (!d) return;
  if (!d.id) {
    row.delete();
    return;
  }
  if (!confirm("Delete line?")) return;
  const orderId = initial?.id ?? subconIdQS;
  try {
    await jfetch(`/subcon/${encodeURIComponent(orderId)}/lines/${d.id}`, {
      method: "DELETE",
    });
    row.delete();
    toast("Deleted");
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}
async function reloadLines() {
  const id = initial?.id ?? subconIdQS;
  if (!id) {
    linesTable?.setData([]);
    return;
  }
  try {
    const rows = await jfetch(`/subcon/${encodeURIComponent(id)}/lines`);
    linesTable?.setData((rows || []).map(normalizeServerLine));
  } catch {
    linesTable?.setData([]);
  }
}

/* ---------- Shipments (summary level) ---------- */
function normalizeShip(s) {
  return {
    id: s.id,
    shipped_at: s.shipped_at ?? null,
    carrier: s.carrier ?? "",
    tracking_no: s.tracking_no ?? "",
    status: s.status ?? "shipped",
  };
}
function initShipmentTable() {
  const el = document.getElementById("sc_ship_table");
  if (!el) return;
  shipTable = new Tabulator(el, {
    layout: "fitColumns",
    height: 300,
    placeholder: "No shipments",
    reactiveData: true,
    index: "id",
    columns: [
      {
        title: "No.",
        width: 70,
        hozAlign: "right",
        headerHozAlign: "right",
        headerSort: false,
        formatter: (c) => c.getRow().getPosition(true),
      },
      {
        title: "Shipped At",
        field: "shipped_at",
        width: 180,
        editor: false,
        formatter: (c) =>
          c.getValue() ? new Date(c.getValue()).toLocaleString() : "",
      },
      { title: "Carrier", field: "carrier", width: 160, editor: "input" },
      { title: "Tracking", field: "tracking_no", width: 180, editor: "input" },
      {
        title: "Status",
        field: "status",
        width: 140,
        editor: "select",
        editorParams: { values: ["shipped", "partially_received", "closed"] },
      },
      {
        title: "Actions",
        field: "_a",
        width: 120,
        hozAlign: "center",
        headerSort: false,
        formatter: () =>
          `<div><button class="btn-mini btn-danger" data-del>Delete</button></div>`,
        cellClick: async (e, cell) => {
          if (!e.target.closest("[data-del]")) return;
          await deleteShipment(cell.getRow());
        },
      },
    ],
  });
  shipTable.on("cellEdited", (cell) => autosaveShipment(cell.getRow()));
}
async function addShipment() {
  const id = initial?.id ?? subconIdQS;
  if (!id) {
    toast("Save header first", false);
    return;
  }
  try {
    const created = await jfetch(
      `/subcon/${encodeURIComponent(id)}/shipments`,
      { method: "POST", body: JSON.stringify({}) }
    );
    shipTable?.addData([normalizeShip(created)], true);
    toast("Shipment created");
  } catch (e) {
    toast(e?.message || "Create failed", false);
  }
}
async function autosaveShipment(row) {
  const d = row.getData();
  if (!d?.id) return;
  const id = initial?.id ?? subconIdQS;
  try {
    const patch = {
      carrier: d.carrier ?? "",
      tracking_no: d.tracking_no ?? "",
      status: d.status ?? "shipped",
    };
    const updated = await jfetch(
      `/subcon/${encodeURIComponent(id)}/shipments/${d.id}`,
      { method: "PATCH", body: JSON.stringify(patch) }
    );
    row.update(normalizeShip(updated));
  } catch (e) {
    toast(e?.message || "Save failed", false);
  }
}
async function deleteShipment(row) {
  const d = row.getData();
  if (!d?.id) {
    row.delete();
    return;
  }
  const id = initial?.id ?? subconIdQS;
  if (!confirm("Delete shipment?")) return;
  try {
    await jfetch(`/subcon/${encodeURIComponent(id)}/shipments/${d.id}`, {
      method: "DELETE",
    });
    row.delete();
    toast("Deleted");
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}
async function reloadShipments() {
  const id = initial?.id ?? subconIdQS;
  if (!id) {
    shipTable?.setData([]);
    return;
  }
  try {
    const rows = await jfetch(`/subcon/${encodeURIComponent(id)}/shipments`);
    shipTable?.setData((rows || []).map(normalizeShip));
  } catch {
    shipTable?.setData([]);
  }
}

/* ---------- Receipts (summary level) ---------- */
function normalizeRcpt(r) {
  return {
    id: r.id,
    received_at: r.received_at ?? null,
    doc_no: r.doc_no ?? "",
    status: r.status ?? "received",
  };
}
function initReceiptTable() {
  const el = document.getElementById("sc_rcpt_table");
  if (!el) return;
  rcptTable = new Tabulator(el, {
    layout: "fitColumns",
    height: 300,
    placeholder: "No receipts",
    reactiveData: true,
    index: "id",
    columns: [
      {
        title: "No.",
        width: 70,
        hozAlign: "right",
        headerHozAlign: "right",
        headerSort: false,
        formatter: (c) => c.getRow().getPosition(true),
      },
      {
        title: "Received At",
        field: "received_at",
        width: 180,
        formatter: (c) =>
          c.getValue() ? new Date(c.getValue()).toLocaleString() : "",
      },
      { title: "Doc No.", field: "doc_no", width: 160, editor: "input" },
      {
        title: "Status",
        field: "status",
        width: 140,
        editor: "select",
        editorParams: { values: ["received", "partial", "rejected"] },
      },
      {
        title: "Actions",
        field: "_a",
        width: 120,
        hozAlign: "center",
        headerSort: false,
        formatter: () =>
          `<div><button class="btn-mini btn-danger" data-del>Delete</button></div>`,
        cellClick: async (e, cell) => {
          if (!e.target.closest("[data-del]")) return;
          await deleteReceipt(cell.getRow());
        },
      },
    ],
  });
  rcptTable.on("cellEdited", (cell) => autosaveReceipt(cell.getRow()));
}
async function addReceipt() {
  const id = initial?.id ?? subconIdQS;
  if (!id) {
    toast("Save header first", false);
    return;
  }
  try {
    const created = await jfetch(`/subcon/${encodeURIComponent(id)}/receipts`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    rcptTable?.addData([normalizeRcpt(created)], true);
    toast("Receipt created");
  } catch (e) {
    toast(e?.message || "Create failed", false);
  }
}
async function autosaveReceipt(row) {
  const d = row.getData();
  if (!d?.id) return;
  const id = initial?.id ?? subconIdQS;
  try {
    const patch = { doc_no: d.doc_no ?? "", status: d.status ?? "received" };
    const updated = await jfetch(
      `/subcon/${encodeURIComponent(id)}/receipts/${d.id}`,
      { method: "PATCH", body: JSON.stringify(patch) }
    );
    row.update(normalizeRcpt(updated));
  } catch (e) {
    toast(e?.message || "Save failed", false);
  }
}
async function deleteReceipt(row) {
  const d = row.getData();
  if (!d?.id) {
    row.delete();
    return;
  }
  const id = initial?.id ?? subconIdQS;
  if (!confirm("Delete receipt?")) return;
  try {
    await jfetch(`/subcon/${encodeURIComponent(id)}/receipts/${d.id}`, {
      method: "DELETE",
    });
    row.delete();
    toast("Deleted");
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}
async function reloadReceipts() {
  const id = initial?.id ?? subconIdQS;
  if (!id) {
    rcptTable?.setData([]);
    return;
  }
  try {
    const rows = await jfetch(`/subcon/${encodeURIComponent(id)}/receipts`);
    rcptTable?.setData((rows || []).map(normalizeRcpt));
  } catch {
    rcptTable?.setData([]);
  }
}

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  ensureHeaderButtons();
  initSupplierAutocomplete();
  initLinesTable();
  initShipmentTable();
  initReceiptTable();

  await loadHeader();
  await reloadLines();
  await reloadShipments();
  await reloadReceipts();

  wireHeaderDirtyOnly();

  // Add buttons
  $("btnAddLine")?.addEventListener("click", async () => {
    if (!initial?.id && !subconIdQS) {
      toast("Save header first", false);
      markHeaderDirty(true);
      return;
    }
    const row = await linesTable.addRow(
      {
        lot_no: "",
        traveler_no: "",
        step_text: "",
        qty_planned: null,
        unit_cost: null,
      },
      true
    );
    row.getCell("step_text")?.edit(true);
  });
  $("btnAddShipment")?.addEventListener("click", addShipment);
  $("btnAddReceipt")?.addEventListener("click", addReceipt);
});
