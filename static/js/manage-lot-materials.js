// /static/js/manage-lot-materials.js — v2.0
import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const lotId = new URLSearchParams(location.search).get("lot_id");
if (!lotId) {
  toast("Missing lot_id in URL", false);
  throw new Error("Missing lot_id");
}

const ENDPOINTS = {
  base: `/api/v1/lot-uses`,
  list: (lotId) => `/api/v1/lot-uses/${encodeURIComponent(lotId)}`,
  byId: (id) => `/api/v1/lot-uses/${encodeURIComponent(id)}`,
  allocate: `/api/v1/lot-uses/allocate`,
};
const JSON_HEADERS = { "Content-Type": "application/json" };

const UI = { add: "_add", table: "listBody" };

/* ===== STATE ===== */
let els = {};
let table = null;
let isBuilt = false;
const patchTimers = new Map();
const PATCH_DEBOUNCE_MS = 350;

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());
const safe = (s) => String(s ?? "").replaceAll("<", "&lt;");
const fmtQty = (v) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/* ===== Load Lot Header ===== */
async function loadLotHeader() {
  try {
    const lot = await jfetch(`/lots/${lotId}`);
    const el = document.getElementById("lotHeader");
    const partNo = lot.part?.part_no ?? "";
    const rev = lot.part_revision?.rev ? ` Rev ${lot.part_revision.rev}` : "";
    el.textContent = `Lot ${lot.lot_no} — ${partNo}${rev} (${lot.qty_planned ?? "?"} pcs)`;
    document.title = `Lot ${lot.lot_no} · Materials`;
  } catch (e) {
    toast("Failed to load lot info", false);
  }
}

/* ===== Columns ===== */
function makeColumns() {
  return [
    { title: "Material Code", field: "material_code", width: 160 },
    {
      title: "Batch",
      field: "batch_no",
      width: 160,
      formatter: (cell) => {
        const d = cell.getRow().getData();
        return d.batch_id
          ? `<a class="link" href="/static/manage-batch.html?id=${d.batch_id}">${safe(d.batch_no)}</a>`
          : safe(d.batch_no ?? "");
      },
    },
    {
      title: "Qty Used",
      field: "qty",
      width: 120,
      hozAlign: "right",
      headerHozAlign: "right",
      editor: "number",
      formatter: (cell) => fmtQty(cell.getValue()),
    },
    { title: "UOM", field: "uom", width: 100, editor: "input" },
    { title: "Note", field: "note", widthGrow: 2, editor: "input", cssClass: "wrap" },
    {
      title: "Used At",
      field: "used_at",
      width: 180,
      formatter: (cell) => new Date(cell.getValue()).toLocaleString(),
    },
    {
      title: "Actions",
      field: "_act",
      width: 120,
      hozAlign: "center",
      headerSort: false,
      formatter: () => `<button class="btn-mini btn-danger" data-del>Delete</button>`,
      cellClick: async (e, cell) => {
        const d = cell.getRow().getData();
        if (!confirm(`Delete allocation for ${d.material_code || "this item"}?`)) return;
        try {
          await jfetch(ENDPOINTS.byId(d.id), { method: "DELETE" });
          cell.getRow().delete();
          toast("Deleted");
        } catch (err) {
          toast(err?.message || "Delete failed", false);
        }
      },
    },
  ];
}

/* ===== AUTOSAVE ===== */
async function autosaveCell(cell) {
  const row = cell.getRow();
  const d = row.getData();
  if (!d.id) return;
  if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));

  const t = setTimeout(async () => {
    patchTimers.delete(row);
    try {
      const payload = { qty: d.qty, uom: d.uom, note: d.note };
      const res = await jfetch(ENDPOINTS.byId(d.id), {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
      row.update(res);
      toast("Saved");
    } catch (err) {
      toast(err?.message || "Save failed", false);
    }
  }, PATCH_DEBOUNCE_MS);
  patchTimers.set(row, t);
}

/* ===== DELETE ===== */
async function deleteRow(row) {
  const d = row.getData();
  if (!d?.id) {
    row.delete();
    return;
  }
  if (!confirm(`Delete allocation for ${d.material_code}?`)) return;
  try {
    await jfetch(ENDPOINTS.byId(d.id), { method: "DELETE" });
    row.delete();
    toast("Deleted");
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

/* ===== ALLOCATE ===== */
async function allocateDialog(table) {
  const matCode = prompt("Material code:");
  if (!matCode) return toast("Material code required", false);
  const qty = prompt("Quantity to allocate:");
  if (!qty || isNaN(qty)) return toast("Invalid quantity", false);

  try {
    const res = await jfetch(ENDPOINTS.allocate, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        lot_id: Number(lotId),
        material_code: matCode,
        qty: Number(qty),
        strategy: "fifo",
      }),
    });
    toast(`Allocated ${res.allocated_qty} (${res.items.length} batch${res.items.length > 1 ? "es" : ""})`);
    table.replaceData(ENDPOINTS.list(lotId));
  } catch (err) {
    toast(err?.message || "Allocation failed", false);
  }
}

/* ===== TABLE ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    ajaxURL: ENDPOINTS.list(lotId),
    height: "calc(100vh - 160px)",
    reactiveData: true,
    index: "id",
    placeholder: "No materials allocated",
    columns: makeColumns(),
    history: true,
  });

  table.on("tableBuilt", () => {
    isBuilt = true;
    requestAnimationFrame(() => table.redraw(true));
  });

  table.on("cellEdited", (cell) => autosaveCell(cell));

  table.on("historyUndo", (action, comp) => {
    if (action === "cellEdit" && comp?.getRow) {
      autosaveCell(comp, { fromHistory: true, revert: () => table.redo() });
    }
  });
  table.on("historyRedo", (action, comp) => {
    if (action === "cellEdit" && comp?.getRow) {
      autosaveCell(comp, { fromHistory: true, revert: () => table.undo() });
    }
  });

  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? table.redo() : table.undo();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      table.redo();
    } else if (e.key === "Delete") {
      const sel = table.getSelectedRows?.();
      if (sel && sel[0]) deleteRow(sel[0]);
    }
  });
}

/* ===== BOOT ===== */
/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", async () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  await loadLotHeader();
  initTable();

  // Create input form dynamically above table
  const topbar = document.querySelector(".list-topbar");
  if (topbar) {
    // Material code input
    const matInput = document.createElement("input");
    matInput.type = "text";
    matInput.id = "allocMat";
    matInput.placeholder = "Material Code";
    matInput.className = "search-lg";
    matInput.style.width = "160px";

    // Quantity input
    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.id = "allocQty";
    qtyInput.placeholder = "Qty";
    qtyInput.step = "0.001";
    qtyInput.style.width = "100px";
    qtyInput.style.textAlign = "right";

    // Allocate button
    const allocBtn = document.createElement("button");
    allocBtn.textContent = "Allocate";
    allocBtn.className = "btn";
    allocBtn.style.height = "36px";

    topbar.appendChild(matInput);
    topbar.appendChild(qtyInput);
    topbar.appendChild(allocBtn);

    // When user clicks Allocate button
    allocBtn.addEventListener("click", async () => {
      const matCode = matInput.value.trim();
      const qtyVal = Number(qtyInput.value);
      if (!matCode) return toast("Material code required", false);
      if (!qtyVal || qtyVal <= 0) return toast("Invalid quantity", false);

      try {
        const res = await jfetch(ENDPOINTS.allocate, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            lot_id: Number(lotId),
            material_code: matCode,
            qty: qtyVal,
            strategy: "fifo",
          }),
        });

        toast(
          `Allocated ${res.allocated_qty} (${res.items.length} batch${
            res.items.length > 1 ? "es" : ""
          })`
        );

        // Refresh table
        table.replaceData(ENDPOINTS.list(lotId));

        // Reset input
        matInput.value = "";
        qtyInput.value = "";
      } catch (err) {
        toast(err?.message || "Allocation failed", false);
      }
    });
  }

  // existing “+ Add” button (optional)
  const addBtn = els[UI.add];
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      await allocateDialog(table);
    });
  }
});
