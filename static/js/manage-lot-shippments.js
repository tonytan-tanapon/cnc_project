// /static/js/manage-lot-shippments.js
import { $, jfetch, toast } from "./api.js";

/* ========= CONFIG ========= */
const lotId = new URLSearchParams(location.search).get("lot_id");
if (!lotId) {
  toast("Missing lot_id in URL", false);
  throw new Error("Missing lot_id");
}

const ENDPOINTS = {
  lotHeader: `/api/v1/lot-shippments/lot/${lotId}/header`,
  lotShipments: `/api/v1/lot-shippments/${lotId}`,
  createShipment: `/api/v1/lot-shippments`,
  partInventory: `/api/v1/lot-shippments/lot/${lotId}/part-inventory/all`,
  allocatePart: `/api/v1/lot-shippments/allocate-part`,
  returnPart: `/api/v1/lot-shippments/return-part`,
};

/* ========= STATE ========= */
let tablePart = null;
let tableShipment = null;
let allShipments = [];

/* Utility: inline update handler */
function updateField(fieldName) {
  return async (cell) => {
    const row = cell.getRow().getData();
    const newVal = cell.getValue();

    try {
      await jfetch(`/api/v1/lot-shippments/${row.id}/update-fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldName]: newVal }),
      });
      toast(`Updated ${fieldName}`);
      loadShipmentTable();
    } catch (err) {
      console.error("❌ inline update failed:", err);
      toast("Update failed", false);
      cell.restoreOldValue();
    }
  };
}

/* ========= LOAD LOT HEADER ========= */
async function loadLotHeader() {
  try {
    const lot = await jfetch(ENDPOINTS.lotHeader);
    const hdr = document.getElementById("lotHeader");

    hdr.innerHTML = `
      <div class="lot-grid">
        <div><b>Lot No:</b> ${lot.lot_no}</div>
        <div><b>Part No:</b> ${lot.part_no ?? "-"}</div>
        <div><b>Planned Qty:</b> ${lot.planned_qty ?? "-"}</div>
        <div><b>Finished Qty:</b> ${lot.finished_qty ?? "-"}</div>
        <div><b>Status:</b> ${lot.status ?? "-"}</div>
        <div><b>Due Date:</b> ${
          lot.due_date ? new Date(lot.due_date).toLocaleDateString() : "-"
        }</div>
      </div>
    `;
  } catch (err) {
    console.error("loadLotHeader:", err);
    toast("Failed to load lot info", false);
  }
}

/* ========= LOAD SHIPMENT LIST ========= */
async function loadShipmentsList() {
  try {
    allShipments = await jfetch(ENDPOINTS.lotShipments);
  } catch (err) {
    toast("Failed to load shipments", false);
    allShipments = [];
  }
}

/* ========= PART INVENTORY TABLE ========= */
function initPartTable() {
  tablePart = new Tabulator("#partTable", {
    layout: "fitColumns",
    height: "350px",
    placeholder: "No part inventory data",

    columns: [
      { title: "Lot No", field: "lot_no", width: 120 },
      { title: "Part No", field: "part_no" },
      { title: "Planned Qty", field: "planned_qty", hozAlign: "right" },
      { title: "Shipped Qty", field: "shipped_qty", hozAlign: "right" },
      { title: "Available", field: "available_qty", hozAlign: "right" },
      { title: "UOM", field: "uom", width: 80, hozAlign: "center" },

      {
        title: "Shipment",
        field: "shipment_id",
        editor: "list",
        width: 160,
        editorParams: () => ({
          values: allShipments.reduce((acc, s) => {
            acc[s.id] = `${s.shipment_no} (${s.status})`;
            return acc;
          }, {}),
        }),
        formatter: (cell) => {
          const id = Number(cell.getValue());
          const s = allShipments.find((x) => x.id === id);
          return s
            ? `${s.shipment_no} <small style="color:#999">(${s.status})</small>`
            : `<span style="color:#ccc">(none)</span>`;
        },
      },

      { title: "QTY", field: "qty_input", editor: "number", width: 100 },

      {
        title: "Action",
        formatter: (cell) => {
          const row = cell.getRow().getData();
          if (row.available_qty != null)
            return `<button data-act="allocate" class="btn-mini btn-green">Allocate</button>`;
          if (row.source_lot_ids)
            return `<button data-act="return" class="btn-mini btn-red">Return</button>`;
          return "";
        },
        cellClick: async (e, cell) => handlePartAction(e, cell),
      },
    ],
  });

  loadPartInventory();
}

/* ========= LOAD PART INVENTORY ========= */
async function loadPartInventory() {
  try {
    const data = await jfetch(ENDPOINTS.partInventory);
    tablePart.setData(data);
  } catch (err) {
    toast("Failed to load part inventory", false);
  }
}

/* ========= ACTION HANDLER ========= */
async function handlePartAction(e, cell) {
  const row = cell.getRow().getData();
  const act = e.target.dataset.act;
  const qtyValue = Number(row.qty_input || row.qty || 0);

  if (qtyValue <= 0) return toast("Invalid quantity", false);

  try {
    if (act === "allocate") {
      await jfetch(ENDPOINTS.allocatePart, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_lot_id: row.lot_id,
          target_lot_id: Number(lotId),
          shipment_id: Number(row.shipment_id),
          qty: qtyValue,
        }),
      });

      toast("Allocated successfully");
    }

    if (act === "return") {
      await jfetch(ENDPOINTS.returnPart, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_lot_id: row.source_lot_ids[0],
          target_lot_id: Number(lotId),
          qty: qtyValue,
        }),
      });

      toast("Returned successfully");
    }

    await Promise.all([
      loadPartInventory(),
      loadShipmentTable(),
      loadLotHeader(),
    ]);
  } catch (err) {
    toast("Action failed", false);
  }
}
async function downloadCofC(row) {
  const url = `/api/v1/lot-shippments/${row.id}/download/cofc`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      toast("Failed to download CofC", false);
      return;
    }

    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `CofC_${row.shipment_no}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    toast("Error downloading CofC", false);
  }
}

async function downloadLabel(row, size) {
  const shipmentId = row.id;

  try {
    const url = `/api/v1/lot-shippments/${shipmentId}/download/label/${size}`;

    const res = await fetch(url);
    if (!res.ok) {
      toast("Failed to download label", false);
      return;
    }

    const blob = await res.blob();
    const filename = `Label_${shipmentId}_${size}.docx`;

    // force download
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    console.error(err);
    toast("Label download error", false);
  }
}
/* ========= SHIPMENT TABLE (INLINE EDIT ENABLED) ========= */
function initShipmentTable() {
  tableShipment = new Tabulator("#shipmentTable", {
    layout: "fitColumns",
    height: "100%",
    placeholder: "No shipment data",

    columns: [
      { title: "Shipment No", field: "shipment_no" },

      {
        title: "Date",
        field: "shipped_date",
        editor: "input",
        editorParams: { elementAttributes: { type: "date" } },
        width: 130,
        cellEdited: updateField("shipped_date"),
        formatter: (cell) => {
          const v = cell.getValue();
          return v ? new Date(v).toLocaleDateString() : "-";
        },
      },

      { title: "Customer", field: "customer_name" },

      {
        title: "Tracking #",
        field: "tracking_number",
        editor: "input",
        width: 160,
        cellEdited: updateField("tracking_number"),
      },

      {
        title: "Qty",
        field: "qty",
        editor: "number",
        width: 80,
        cellEdited: async (cell) => {
          const row = cell.getRow().getData();
          const newQty = Number(cell.getValue());

          if (isNaN(newQty) || newQty <= 0) {
            toast("Invalid QTY", false);
            cell.restoreOldValue();
            return;
          }

          try {
            await jfetch(`/api/v1/lot-shippments/${row.id}/update-fields`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ qty: newQty }),
            });

            toast("✅ Updated Qty");
            await loadShipmentTable();
            await loadPartInventory();
          } catch (err) {
            console.error("Qty update failed:", err);
            toast("❌ Failed to update Qty", false);
            cell.restoreOldValue();
          }
        },
      },

      {
        title: "Status",
        field: "status",
        editor: "select",
        editorParams: { values: ["pending", "shipped", "cancelled"] },
        width: 110,
        cellEdited: updateField("status"),
        formatter: (cell) => {
          const v = cell.getValue();
          const colors = {
            pending: "#fbbf24",
            shipped: "#22c55e",
            cancelled: "#ef4444",
          };
          return `<span style="
            background:${colors[v] || "#ccc"};
            color:#fff;padding:3px 8px;border-radius:6px;
            text-transform:capitalize;
          ">${v}</span>`;
        },
      },

      {
        title: "CofC",
        width: 90,
        formatter: () => `<button class="btn-mini btn-blue">DOC</button>`,
        cellClick: (e, cell) => downloadCofC(cell.getRow().getData()),
      },

      {
        title: "Label",
        width: 120,
        formatter: () => `
            <div class="label-buttons">
              <button class="btn-mini btn-orange" data-size="80">80</button>
              <button class="btn-mini btn-blue" data-size="60">60</button>
              <button class="btn-mini btn-green" data-size="30">30</button>
            </div>
          `,
        cellClick: (e, cell) => {
          const row = cell.getRow().getData();
          const size = e.target.dataset.size;
          if (!size) return;

          downloadLabel(row, Number(size)); // ← ส่ง size ไปด้วย
        },
      },

      {
        title: "Delete",
        width: 90,
        formatter: () => `<button class="btn-mini btn-red">Delete</button>`,
        cellClick: async (e, cell) => {
          const row = cell.getRow().getData();

          if (!confirm(`Delete shipment ${row.shipment_no}?`)) return;

          try {
            await jfetch(`/api/v1/lot-shippments/${row.id}`, {
              method: "DELETE",
            });

            toast("Shipment deleted");
            await loadShipmentTable();
          } catch (err) {
            toast("Delete failed", false);
          }
        },
      },
    ],
  });

  loadShipmentTable();
}

/* ========= LOAD SHIPMENTS ========= */
async function loadShipmentTable() {
  try {
    const rows = await jfetch(ENDPOINTS.lotShipments);
    tableShipment.setData(rows);
  } catch (err) {
    toast("Failed to load shipments", false);
  }
}

/* ========= TOOLBAR ========= */
function initToolbar() {
  const btn = document.getElementById("btnCreateShipment");
  btn.addEventListener("click", async () => {
    try {
      await jfetch(ENDPOINTS.createShipment, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lot_id: Number(lotId) }),
      });

      toast("New shipment created");

      await loadShipmentsList();
      await loadShipmentTable();
      await loadPartInventory();
    } catch (err) {
      toast("Create failed", false);
    }
  });
}

/* ========= BOOT ========= */
document.addEventListener("DOMContentLoaded", async () => {
  await loadLotHeader();
  await loadShipmentsList();

  initPartTable();
  initShipmentTable();
  initToolbar();
});
