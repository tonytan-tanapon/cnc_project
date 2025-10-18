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
  lotHistory: `/api/v1/lot-uses/history/${encodeURIComponent(lotId)}`, // ✅ added
  lotSummary: `/api/v1/lot-uses/lot/${encodeURIComponent(lotId)}/summary`,
};

let tables = { part: null, material: null };
let currentView = "inventory"; // 'inventory' or 'allocation'

/* ===== LOAD LOT HEADER ===== */
async function loadLotHeader() {
  try {
    const lot = await jfetch(ENDPOINTS.lotHeader);
    const summary = await jfetch(ENDPOINTS.lotSummary);

    // Build summary string
    let summaryHtml = "";
    if (summary.length) {
      summaryHtml = summary
        .map(
          (s) =>
            `${s.material_name}: <b>${s.total_qty.toFixed(2)} ${s.uom}</b>`
        )
        .join(", ");
    } else {
      summaryHtml = "<i>No materials allocated</i>";
    }

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
      </div>
      <div class="lot-summary">
        <b>Allocated:</b> ${summaryHtml}
      </div>
    `;

    document.title = `Lot ${lot.lot_no} · Material Allocation`;
  } catch (err) {
    toast("Failed to load lot info", false);
  }
}

/* ===== INIT MATERIAL TABLE ===== */
function initMaterialTable() {
  tables.material = new Tabulator("#materialTable", {
    layout: "fitColumns",
    placeholder: "No material data",
    columns: [],
  });

  // ✅ Wait until Tabulator fully initialized
  tables.material.on("tableBuilt", () => {
    loadMaterialTable();
  });
}

/* ===== LOAD MATERIAL TABLE (toggle view) ===== */
/* ===== LOAD MATERIAL TABLE (toggle view) ===== */
async function loadMaterialTable() {
  if (currentView === "inventory") {
  // ---------- INVENTORY MODE ----------
  tables.material.setColumns([
    { title: "Code", field: "code", visible: false },
    { title: "Batch No", field: "batch_no" },
    { title: "Material", field: "name" },
    { title: "UOM", field: "uom", width: 80, hozAlign: "center" }, // ✅ added
    { title: "#Available", field: "qty_available", hozAlign: "right" },
    {
      title: "#Allocate / Return",
      field: "allocate",
      editor: "number",
      editorParams: { step: "0.01" },
    },
    {
      title: "Action",
      formatter: () =>
        `<a href="#" class="link link-green">Allocate</a> | <a href="#" class="link link-red">Return</a>`,
      cellClick: async (e, cell) => {
          const row = cell.getRow().getData();
          const action = e.target.textContent.trim().toLowerCase();
          const qtyValue = Number(row.allocate) || 0;
          const available = Number(row.qty_available) || 0;

          if (qtyValue <= 0) {
            toast("⚠️ Please enter a valid quantity", false);
            return;
          }

          if (!row.code) {
            toast("⚠️ Missing material code", false);
            return;
          }

          if (action === "allocate") {
            // ✅ Allocate
            if (qtyValue > available) {
              toast(
                `❌ Cannot allocate ${qtyValue}. Only ${available} available.`,
                false
              );
              return;
            }

            try {
              await jfetch(ENDPOINTS.allocateMaterial, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  lot_id: Number(lotId),
                  material_code: row.code,
                  qty: qtyValue,
                  strategy: "fifo",
                }),
              });

              toast(`✅ Allocated ${qtyValue} ${row.name}`);
              await loadMaterialTable(); // refresh
            } catch (err) {
              toast(err?.message || "Allocation failed", false);
            }
          }

          if (action === "return") {
            if (qtyValue <= 0) {
              toast("⚠️ Please enter a valid return quantity", false);
              return;
            }

            if (!confirm(`↩️ Return ${qtyValue} ${row.name} from this lot?`)) return;

            try {
              await jfetch(`/api/v1/lot-uses/return-auto`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  lot_id: Number(lotId),
                  material_code: row.code,
                  qty: qtyValue,
                }),
              });

              toast(`↩️ Returned ${qtyValue} ${row.name}`);
              await loadMaterialTable();
            } catch (err) {
              toast(err?.message || "Return failed", false);
            }
          }
        },
      },
    ]);

    // ✅ Load and filter available materials
    const res = await jfetch(ENDPOINTS.materialInventory);
    const filtered = res.filter((r) => (Number(r.qty_available) || 0) > 0);
    tables.material.setData(filtered);
  }

  else if (currentView === "allocation") {
    // ---------- ALLOCATION MODE ----------
    tables.material.setColumns([
      { title: "ID", field: "id", visible: false },
      { title: "Batch", field: "batch_no" },
      { title: "Material", field: "material_name" },
      { title: "Qty", field: "qty", hozAlign: "right" },
      { title: "UOM", field: "uom", width: 80 },
      {
        title: "Action",
        formatter: () => `<a href="#" class="link link-red">Return</a>`,
        cellClick: async (e, cell) => {
          const row = cell.getRow().getData();
          if (
            !confirm(
              `↩️ Return ${row.qty} ${row.uom} of ${row.material_name}?`
            )
          )
            return;

          try {
            await jfetch(`${ENDPOINTS.returnAllocation}/${row.id}`, {
              method: "POST",
            });
            toast(`↩️ Returned ${row.qty} ${row.uom}`);
            await loadMaterialTable();
          } catch (err) {
            toast(err?.message || "Return failed", false);
          }
        },
      },
    ]);

    const res = await jfetch(ENDPOINTS.lotAllocations);
    tables.material.setData(res);
  }


  else if (currentView === "history") {
    // ---------- HISTORY MODE ----------
    tables.material.setColumns([
      { title: "Action", field: "action", width: 110 },
      { title: "Material Code", field: "material_code", visible: false },
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
    ]);

    try {
      const res = await jfetch(ENDPOINTS.lotHistory);
      if (!res.length) toast("No history records found");
      tables.material.setData(res);
    } catch (err) {
      toast(err?.message || "Failed to load history", false);
    }
  }
}



/* ===== INIT PART TABLE ===== */
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

/* ===== TOOLBAR ACTIONS ===== */
function initToolbar() {
  const btnCreatePO = document.getElementById("btnCreatePO");
  const btnReceiveBatch = document.getElementById("btnReceiveBatch");
  const btnViewInventory = document.getElementById("btnViewInventory");
  const btnViewAllocations = document.getElementById("btnViewAllocations");
  const btnViewHistory = document.getElementById("btnViewHistory");
  if (!btnCreatePO || !btnReceiveBatch || !btnViewInventory || !btnViewAllocations || !btnViewHistory) {
  console.warn("⚠️ Toolbar buttons not found in DOM");
  return;
}

btnViewHistory.addEventListener("click", () => {
  currentView = "history";
  toast("📜 Viewing Material Allocation History");
  loadMaterialTable();
});

  btnCreatePO.addEventListener("click", async () => {
    try {
      await jfetch(ENDPOINTS.createMaterialPO, { method: "POST" });
      toast("🧾 New Material PO Created");
      await loadMaterialTable();
    } catch (err) {
      toast(err?.message || "Create PO failed", false);
    }
  });

  btnReceiveBatch.addEventListener("click", async () => {
    try {
      await jfetch(ENDPOINTS.receiveBatch, { method: "POST" });
      toast("📦 Batch Received");
      await loadMaterialTable();
    } catch (err) {
      toast(err?.message || "Receive batch failed", false);
    }
  });

  btnViewInventory.addEventListener("click", () => {
    currentView = "inventory";
    toast("📋 Viewing Material Inventory");
    loadMaterialTable();
  });

  btnViewAllocations.addEventListener("click", () => {
    currentView = "allocation";
    toast("🔗 Viewing Allocated Materials");
    loadMaterialTable();
  });
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadLotHeader();
    initPartTable();
    initMaterialTable();
    initToolbar();
  } catch (err) {
    console.error("❌ Initialization failed:", err);
    toast("Initialization error", false);
  }
});
