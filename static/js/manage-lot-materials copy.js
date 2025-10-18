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
  returnInventory: `/api/v1/inventory/return`,
  createMaterialPO: `/api/v1/material-pos`,
  lotAllocations: `/api/v1/lot-uses/${encodeURIComponent(lotId)}`,
};

let tables = { part: null, material: null };

/* ===== LOAD LOT DETAIL ===== */
async function loadLotHeader() {
  try {
    const lot = await jfetch(ENDPOINTS.lotHeader);
    const hdr = document.getElementById("lotHeader");
    hdr.innerHTML = `
      <div class="lot-grid">
        <div><b>Lot No:</b> ${lot.lot_no}</div>
        <div><b>Part No:</b> ${lot.part?.part_no ?? "-"}</div>
        <div><b>Revision:</b> ${lot.revision ?? "-"}</div>
        <div><b>Planned Qty:</b> ${lot.planned_qty ?? "?"}</div>
        <div><b>Due Date:</b> ${lot.due_date ?? "-"}</div>
        <div><b>Status:</b> ${lot.status ?? "-"}</div>
        <div><b>PO:</b> ${lot.po ?? "-"}</div>
        <div><b>Note:</b> ${lot.note ?? ""}</div>
      </div>`;
    document.title = `Lot ${lot.lot_no} · Material Allocation`;
  } catch (err) {
    toast("Failed to load lot info", false);
  }
}

/* ===== INIT PART INVENTORY ===== */
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
      {
        title: "Actions",
        formatter: () => `<a href="#" class="link">Allocate to Lot</a>`,
        cellClick: async (e, cell) => {
          const row = cell.getRow().getData();
          try {
            const res = await jfetch(ENDPOINTS.allocateMaterial, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lot_id: Number(lotId),
                material_code: row.code,
                qty: qtyToAllocate,
                strategy: "fifo",
              }),
            });

            toast(`✅ Allocated ${qtyToAllocate} from ${row.batch_no} to Lot #${lotId}`);

            // 🔄 Refresh both tables
            await tables.material.replaceData(ENDPOINTS.materialInventory);
            await tables.part.replaceData(ENDPOINTS.partInventory);

            // Optional: clear input after allocation
            cell.getRow().update({ allocate: null });
          } catch (err) {
            toast(err?.message || "Allocation failed", false);
          }
        },
      },
    ],
  });
}

/* ===== INIT MATERIAL INVENTORY ===== */
function initMaterialTable() {
  tables.material = new Tabulator("#materialTable", {
    ajaxURL: ENDPOINTS.materialInventory,
    layout: "fitColumns",
    placeholder: "No material data",
    columns: [
      { title: "Batch No", field: "batch_no" },
      { title: "Material", field: "name" },

      { title: "#Available", field: "qty_available", hozAlign: "right" },
      {
        title: "#Allocate", field: "allocate", editor: "number",
        editorParams: { step: "0.01" },
      },
      {
        title: "Actions",
        formatter: () => `<a href="#" class="link">Confirm allocate</a>`,
        cellClick: async (e, cell) => {
          const row = cell.getRow().getData();
          const qtyToAllocate = Number(row.allocate) || 0;
          const available = Number(row.qty_available) || 0;

          if (qtyToAllocate <= 0) {
            toast("⚠️ Please enter a valid allocation quantity", false);
            return;
          }

          if (qtyToAllocate > available) {
            toast(`❌ Cannot allocate ${qtyToAllocate}. Only ${available} available.`, false);
            return;
          }

          try {
            const res = await jfetch(ENDPOINTS.allocateMaterial, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lot_id: Number(lotId),
                material_code: row.code,
                qty: qtyToAllocate,
                strategy: "fifo",
              }),
            });

            toast(`✅ Allocated ${qtyToAllocate} from ${row.batch_no} to Lot #${lotId}`);

            // 🔄 Refresh material inventory (available stock)
            await tables.material.replaceData(ENDPOINTS.materialInventory);

            // 🔄 Optional: if you have another table showing current lot allocations
            if (tables.lotAllocations) {
              await tables.lotAllocations.replaceData(ENDPOINTS.lotAllocations);
            }

            // 🧹 Clear input field after allocation
            cell.getRow().update({ allocate: null });
          } catch (err) {
            toast(err?.message || "Allocation failed", false);
          }
        },
      },

      {
        title: "Actions",
        formatter: () => `<a href="#" class="link link-red">Return</a>`,
        cellClick: async (e, cell) => {
          const row = cell.getRow().getData();
          if (!confirm(`Return ${row.qty} of ${row.material_code}?`)) return;
          try {
            await jfetch(`/api/v1/lot-uses/return/${row.id}`, { method: "POST" });
            toast(`↩️ Returned ${row.qty} ${row.uom} to stock`);
            await tables.material.replaceData(ENDPOINTS.materialInventory); // refresh stock
            await tables.lotAllocations.replaceData(ENDPOINTS.lotAllocations); // refresh allocations
          } catch (err) {
            toast(err?.message || "Return failed", false);
          }
        },
      }
    ],
  });
}

/* ===== TOOLBAR ACTIONS ===== */
function initToolbar() {
  // ใช้ getElementById แทน $() เพื่อชัดเจนและปลอดภัยกว่า
  const btnCreatePO = document.getElementById("btnCreatePO");
  const btnReceiveBatch = document.getElementById("btnReceiveBatch");
  const btnReturn = document.getElementById("btnReturn");

  // ตรวจว่าปุ่มมีอยู่จริงก่อนผูก event
  if (!btnCreatePO || !btnReceiveBatch || !btnReturn) {
    console.warn("⚠️ Toolbar buttons not found in DOM");
    return;
  }

  // ===== Create PO =====
  btnCreatePO.addEventListener("click", async () => {
    try {
      await jfetch(ENDPOINTS.createMaterialPO, { method: "POST" });
      toast("🧾 New Material PO Created");
      tables.material?.replaceData(ENDPOINTS.materialInventory);
    } catch (err) {
      toast(err?.message || "Create PO failed", false);
    }
  });

  // ===== Receive Batch =====
  btnReceiveBatch.addEventListener("click", async () => {
    try {
      await jfetch(ENDPOINTS.receiveBatch, { method: "POST" });
      toast("📦 Batch Received");
      tables.material?.replaceData(ENDPOINTS.materialInventory);
    } catch (err) {
      toast(err?.message || "Receive batch failed", false);
    }
  });

  // ===== Return to Inventory =====
  btnReturn.addEventListener("click", async () => {
    try {
      await jfetch(ENDPOINTS.returnInventory, { method: "POST" });
      toast("↩️ Returned items to inventory");
      tables.part?.replaceData(ENDPOINTS.partInventory);
    } catch (err) {
      toast(err?.message || "Return failed", false);
    }
  });
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadLotHeader();    // โหลดข้อมูล lot
    initPartTable();          // โหลดตาราง Part
    initMaterialTable();      // โหลดตาราง Material
    initToolbar();            // ผูก event ปุ่ม toolbar
  } catch (err) {
    console.error("❌ Initialization failed:", err);
    toast("Initialization error", false);
  }
});