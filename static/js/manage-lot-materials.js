import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const lotId = new URLSearchParams(location.search).get("lot_id");
if (!lotId) {
  toast("Missing lot_id in URL", false);
  throw new Error("Missing lot_id");
}

const ENDPOINTS = {
  lotHeader: `/api/v1/lot-uses/lot/${encodeURIComponent(lotId)}/header`,
  partInventory: `/api/v1/inventory/parts`,
  materialInventory: `/api/v1/inventory/materials`,
  allocateMaterial: `/api/v1/lot-uses/allocate`,
  receiveBatch: `/api/v1/batches/receive`,
  createMaterialPO: `/api/v1/material-pos`,
  lotAllocations: `/api/v1/lot-uses/${encodeURIComponent(lotId)}`,
  returnAllocation: `/api/v1/lot-uses/return`,
  lotHistory: `/api/v1/lot-uses/history/${encodeURIComponent(lotId)}`,
  lotSummary: `/api/v1/lot-uses/lot/${encodeURIComponent(lotId)}/summary`,
};

let tables = { part: null, material: null, allocation: null, history: null };

/* ===== LOT HEADER ===== */
/* ===== LOT HEADER ===== */
async function loadLotHeader() {
  try {
    const lot = await jfetch(ENDPOINTS.lotHeader);
    console.log("Lot Info:", lot);
    const summary = await jfetch(ENDPOINTS.lotSummary);

    const el = document.querySelector("#lotHeader");
    if (!el) {
      console.warn("⚠️ lotHeader element not found in DOM");
      return;
    }

    let summaryHtml =
      Array.isArray(summary) && summary.length
        ? summary
            .map(
              (s) =>
                `${s.material_name}: <b>${(s.total_qty ?? 0).toFixed(2)} ${
                  s.uom ?? ""
                }</b>`
            )
            .join(", ")
        : "<i>No materials allocated</i>";

    el.innerHTML = `
      <div class="lot-grid">
        <div><b>Lot No:</b> ${lot.lot_no ?? "-"}</div>
        <div><b>Part No:</b> ${lot.part?.part_no ?? "-"}</div>
        <div><b>Revision:</b> ${lot.revision ?? "-"}</div>
        <div><b>Planned Qty:</b> ${lot.planned_qty ?? "?"}</div>
        <div><b>Due Date:</b> ${lot.due_date ?? "-"}</div>
        <div><b>Status:</b> ${lot.status ?? "-"}</div>
        <div><b>PO:</b> ${lot.po ?? "-"}</div>
        <div><b>Note:</b> ${lot.note ?? ""}</div>
      </div>
      <div class="lot-summary">
        <b>Allocated:</b> ${summaryHtml}
      </div>`;

    // ✅ บังคับ reflow หลังอัปเดต
    el.offsetHeight;
  } catch (err) {
    console.error("Lot header load error:", err);
    toast("Failed to load lot info", false);
  }
}
/* ===== PART TABLE ===== */
function initPartTable() {
  tables.part = new Tabulator("#partTable", {
    ajaxURL: ENDPOINTS.partInventory,
    layout: "fitColumns",
    placeholder: "No part data",
    columns: [
      { title: "Part No", field: "part_no" },
      { title: "Rev", field: "rev", width: 80 },
      { title: "On Hand", field: "on_hand", hozAlign: "right" },
      { title: "Allocated", field: "allocated", hozAlign: "right" },
    ],
  });
}

/* ===== MATERIAL INVENTORY ===== */
function initMaterialTable() {
  tables.material = new Tabulator("#materialTable", {
    layout: "fitColumns",
    placeholder: "No material data",
    columns: [
      { title: "Batch No", field: "batch_no" },
      { title: "Material", field: "name" },

      { title: "#Available", field: "qty_available", hozAlign: "right" },
      {
        title: "UOM",
        field: "uom",
        width: 80,
        hozAlign: "center",
        formatter: (cell) => cell.getValue() || "-",
      },
      {
        title: "QTY Allocate",
        field: "allocate",
        editor: "number",
        editorParams: { step: "1", min: 0 },
      },

      {
        title: "Action",
        formatter: () => `<a href="#" class="link link-green">Allocate</a>`,
        cellClick: async (e, cell) => {
          const row = cell.getRow().getData();
          const qtyValue = Number(row.allocate) || 0;
          const available = Number(row.qty_available) || 0;

          if (qtyValue <= 0)
            return toast("⚠️ Enter valid allocation quantity", false);
          if (qtyValue > available)
            return toast(
              `❌ Cannot allocate ${qtyValue}. Only ${available} available.`,
              false
            );

          try {
            await jfetch(ENDPOINTS.allocateMaterial, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lot_id: Number(lotId),
                material_code: row.material_code || row.code,
                qty: String(qtyValue),
                strategy: "fifo",
              }),
            });

            toast(`✅ Allocated ${qtyValue} ${row.name}`);
            await loadMaterialTable();
            await loadAllocationTable();
            await loadLotHeader();
            await loadHistoryTable?.();
          } catch (err) {
            toast(err?.message || "Allocation failed", false);
          }
        },
      },
    ],
  });

  loadMaterialTable();
}

async function loadMaterialTable() {
  const res = await jfetch(ENDPOINTS.materialInventory);
  const filtered = res.filter((r) => (Number(r.qty_available) || 0) > 0);
  tables.material.setData(filtered);
}

/* ===== GROUP BY BATCH ===== */
function groupAllocationsByBatch(data) {
  const grouped = {};
  for (const row of data) {
    const key = row.batch_no || row.batch || "UNKNOWN";
    if (!grouped[key]) {
      grouped[key] = {
        ...row,
        qty_total: 0,
        qty_return_total: 0,
      };
    }
    grouped[key].qty_total += Number(row.qty || 0);
    grouped[key].qty_return_total += Number(row.qty_return || 0);
  }
  return Object.values(grouped);
}

/* ===== ALLOCATION TABLE ===== */
function initAllocationTable() {
  tables.allocation = new Tabulator("#allocationTable", {
    layout: "fitColumns",
    placeholder: "No allocation records",
    columns: [
      { title: "Batch", field: "batch_no" },
      { title: "Material", field: "material_name" },
      {
        title: "Qty (Allocated)",
        field: "qty_total",
        hozAlign: "right",
        editor: false,
      },
      {
        title: "UOM",
        field: "uom",
        width: 80,
        hozAlign: "center",
        formatter: (cell) => cell.getValue() || "-",
      },
      {
        title: "Qty Return",
        field: "qty_return_total",
        hozAlign: "right",
        editor: "number",
        editorParams: { step: "1", min: 0 },
      },

      {
        title: "Action",
        formatter: () => `<a href="#" class="link link-red">↩️ Return</a>`,
        cellClick: async (e, cell) => {
          const row = cell.getRow().getData();
          const returnQty = Number(row.qty_return_total) || 0;

          if (returnQty <= 0)
            return toast("⚠️ Enter a valid Qty Return first", false);
          if (returnQty > Number(row.qty_total))
            return toast(
              `❌ Return qty cannot exceed allocated (${row.qty_total})`,
              false
            );
          if (
            !confirm(
              `↩️ Return ${returnQty} ${row.uom} of ${row.material_name}?`
            )
          )
            return;

          try {
            await jfetch(`/api/v1/lot-uses/return-auto`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lot_id: Number(lotId),
                material_code: row.material_code || row.code,
                qty: String(returnQty),
              }),
            });

            toast(`↩️ Returned ${returnQty} ${row.uom} (${row.material_name})`);
            await loadAllocationTable();
            await loadMaterialTable();
            await loadLotHeader();
            await loadHistoryTable?.();
          } catch (err) {
            toast(`❌ Return failed: ${err.message}`, false);
          }
        },
      },
    ],
  });

  loadAllocationTable();
}

async function loadAllocationTable() {
  try {
    const res = await jfetch(ENDPOINTS.lotAllocations);
    const grouped = groupAllocationsByBatch(res);
    tables.allocation.setData(grouped);
  } catch (err) {
    toast(err?.message || "Failed to load allocation table", false);
  }
}

/* ===== HISTORY TABLE ===== */
function initHistoryTable() {
  tables.history = new Tabulator("#historyTable", {
    layout: "fitColumns",
    placeholder: "No history records",
    columns: [
      { title: "Action", field: "action", width: 120 },
      { title: "Material", field: "material_code" },
      { title: "Batch", field: "batch_id" },
      { title: "Qty", field: "qty", hozAlign: "right" },
      { title: "UOM", field: "uom", width: 80 },
      {
        title: "Date",
        field: "created_at",
        formatter: (cell) => {
          const d = new Date(cell.getValue());
          return d.toLocaleString();
        },
      },
    ],
  });

  loadHistoryTable();
}

async function loadHistoryTable() {
  try {
    const res = await jfetch(ENDPOINTS.lotHistory);
    tables.history.setData(res);
  } catch (err) {
    toast(err?.message || "Failed to load history", false);
  }
}

/* ===== TOOLBAR ===== */
function initToolbar() {
  const btnCreatePO = $("#btnCreatePO");
  const btnReceiveBatch = $("#btnReceiveBatch");
  const btnViewInventory = $("#btnViewInventory");
  const btnViewAllocations = $("#btnViewAllocations");
  const btnViewHistory = $("#btnViewHistory");

  on(btnCreatePO, "click", async () => {
    await jfetch(ENDPOINTS.createMaterialPO, { method: "POST" });
    toast("🧾 New Material PO Created");
    await loadMaterialTable();
  });

  on(btnReceiveBatch, "click", async () => {
    await jfetch(ENDPOINTS.receiveBatch, { method: "POST" });
    toast("📦 Batch Received");
    await loadMaterialTable();
  });

  on(btnViewInventory, "click", () => {
    toast("📋 Viewing Material Inventory");
    loadMaterialTable();
  });

  on(btnViewAllocations, "click", () => {
    toast("🔗 Viewing Allocations");
    loadAllocationTable();
  });

  on(btnViewHistory, "click", async () => {
    toast("📜 Viewing History");
    await loadHistoryTable();
  });
}

function on(el, event, handler) {
  if (!el) return;
  el.addEventListener(event, handler);
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", async () => {
  // ✅ รอให้ nav-loader โหลด sidebar เสร็จก่อน
  const navReady = new Promise((resolve) => {
    const slot = document.querySelector("[data-nav-slot]");
    if (!slot) return resolve();
    const obs = new MutationObserver(() => {
      if (slot.innerHTML.trim() !== "") {
        obs.disconnect();
        resolve();
      }
    });
    obs.observe(slot, { childList: true });
  });

  await navReady; // ✅ รอ sidebar โหลดครบจริง ๆ

  // ✅ DOM พร้อมทั้งหมดแล้ว เริ่มโหลดข้อมูล
  await loadLotHeader();
  initPartTable();
  initMaterialTable();
  initAllocationTable();
  initHistoryTable();
  initToolbar();

  console.log("✅ manage-lot-materials initialized successfully");
});
