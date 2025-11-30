// /static/js/manage-lot-shippments.js
import { $, jfetch, toast } from "./api.js";

/* ========= CONFIG ========= */

const lotId = new URLSearchParams(location.search).get("lot_id");
if (!lotId) {
  toast("Missing lot_id in URL", false);
  throw new Error("Missing lot_id");
}
let TABLE_HEADER = null; // 👈 เก็บ header data
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
    TABLE_HEADER = lot; // 👈 เก็บลง state
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

    // 🟡 DEBUG SHIPMENT LIST จาก server
    console.log("📦 Shipment list from server:", allShipments);
  } catch (err) {
    console.error("❌ Failed to load shipments:", err);
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

      {
        title: "QTY",
        field: "qty",
        editor: "number",
        width: 100,

        formatter: (cell) => {
          const data = cell.getRow().getData();
          const available = data.available_qty ?? 0;

          // ✅ set default qty = available_qty
          if (!data.qty || data.qty === 0) {
            data.qty = available;
          }

          // ✅ ใส่ background สีเหลืองเฉพาะ column นี้
          return `<div style="background:yellow; padding:4px; border-radius:4px;">
              <span>${data.qty}</span>
            </div>`;
        },
      },

      ,
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

    // ✅ กรองเฉพาะ Available > 0
    const filtered = data.filter((row) => row.available_qty > 0);

    tablePart.setData(filtered);
    toast(`Loaded ${filtered.length} lot(s) with available qty`);
  } catch (err) {
    console.error("❌ Failed to load part inventory:", err);
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

    // ✅ ใช้ filename จาก backend header
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition");

    let filename = "cofc.docx"; // fallback
    if (disposition && disposition.includes("filename=")) {
      filename = disposition.split("filename=")[1].replace(/["']/g, "");
    }

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename; // ✅ Browser จะใช้ชื่อ cofc_xxx_xxx.docx
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    toast("Error downloading CofC", false);
  }
}

async function downloadLabel(row, size) {
  const shipmentId = row.id;

  // 🌟 อ่านค่าจาก checkbox FAIR ใน row นั้น
  const fairCheckbox = document.querySelector(
    `.fair-checkbox[data-id="${shipmentId}"]`
  );
  const fair = fairCheckbox ? fairCheckbox.checked : false;

  // สร้าง query param ส่งไป backend
  const params = new URLSearchParams();
  params.set("size", size);
  if (fair) params.set("fair", "true"); // ✅ ถ้ามี FAIR ให้ส่ง fair=true

  const url = `/api/v1/lot-shippments/${shipmentId}/download/label/${size}?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      toast("Failed to download label", false);
      return;
    }

    // ✅ ดึง filename จาก header backend
    let downloadName = `label_${shipmentId}_${size}.docx`; // fallback
    const disposition = res.headers.get("Content-Disposition");

    if (disposition && disposition.includes("filename=")) {
      downloadName = disposition
        .split("filename=")[1]
        .replace(/["']/g, "")
        .trim();
    }

    const blob = await res.blob();

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = downloadName; // ✅ ใช้ชื่อจาก server
    document.body.appendChild(link);
    link.click();
    link.remove();

    toast("Label downloaded");
  } catch (err) {
    console.error("Label download error:", err);
    toast("Error downloading label", false);
  }
}

function logShipmentRow(row) {
  console.log("====== Shipment Log ======");

  const h = TABLE_HEADER || {};

  console.log("Shipment ID:", row.id);
  console.log("Shipment No:", row.shipment_no);

  // 👇 ถ้าไม่มีใน row → อ่านจาก header state
  console.log("Lot No:", row.lot_no ?? h.lot_no ?? "-");
  console.log("Part No:", row.part_no ?? h.part_no ?? "-");
  console.log("Revision:", row.rev ?? h.part_rev ?? "-");

  // Customer Code
  console.log("Customer Code:", row.customer_code ?? h.customer_code ?? "-");

  // Shipment Date
  console.log("Date:", row.date ?? new Date().toLocaleDateString());

  console.log("=========================");
}

async function downloadReport(row) {
  const year = 2025;
  const h = TABLE_HEADER || {};

  const lotNo = h.lot_no || "UNKNOWN_LOT";
  const partNo = h.part_no || "UNKNOWN_PART";
  const rev = row.rev || h.part_rev || "UNKNOWN_REV";
  const cusCode = row.customer_code || h.customer_code || "UNKNOWN_CUS";
  const dateCreate = "11-12-25";
  const cusKey = {
    AF6182: "Aero Fluid",
    BE5503: "BEI",
    "AUTO-EMBEIN-458674": "EMBE",
    Resource: "Resource",
    SIE: "SIE",
    SA8884: "Skurka",
    TS1046: "T-System",
  };

  // dict lookup (เหมือน Python dict)
  console.log(cusKey[cusCode]); // → "BEI"
  const folderPath = `Z:\\Topnotch Group\\Public\\${year}\\Inspection Report ${year}\\${cusKey[cusCode]}`;

  const fullFile = `${folderPath}\\${partNo} ${dateCreate} ${lotNo}.xlsx`;
  console.log(fullFile);
  const batContent = [
    "@echo off",
    `echo Lot: ${lotNo}`,
    `echo Part: ${partNo}`,
    `echo Rev: ${rev}`,
    `echo Customer Code: ${cusCode}`,
    "",
    'if not exist "' + folderPath + '" mkdir "' + folderPath + '"',
    'if not exist "' + fullFile + '" echo (empty report) > "' + fullFile + '"',
    'start "" "' + fullFile + '"',
    "pause",
  ].join("\r\n");

  const blob = new Blob([batContent], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `open_${lotNo}_${partNo}_${cusCode}_${rev}.bat`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// function generateFullPath(row, partNo, filename) {
//   const folderPath = `Z:\\Topnotch Group\\Public\\2025\\Inspection Report 2025\\${row.customer_code}\\${partNo}`;

//   const fullFile = `${folderPath}\\${filename}`;
//   return { folderPath, fullFile };
// }

// async function downloadReport(row) {
//   const filename = `${row.part_no}.xlsx`; // หรืออะไรก็ได้ที่ UI มีอยู่แล้ว
//   const { folderPath, fullFile } = generateFullPath(row, row.part_no, filename);
//   console.log(fullFile);
//   const batLines = [
//     "@echo off",
//     `echo Shipment for Customer: ${row.customername}`,
//     `echo Part: ${row.part_no}`,
//     `echo Rev: ${row.rev}`,
//     "",
//     `if not exist "${folderPath}" mkdir "${folderPath}"`,
//     `if not exist "${fullFile}" echo Empty report created > "${fullFile}"`,
//     `start "" "${fullFile}"`,
//     "pause",
//   ];

//   const blob = new Blob([batLines.join("\r\n")], { type: "text/plain" });
//   const a = document.createElement("a");
//   a.href = URL.createObjectURL(blob);
//   a.download = `open_${row.part_no}_REV_${row.rev}.bat`;
//   a.click();
//   URL.revokeObjectURL(a.href);
// }

/* ========= SHIPMENT TABLE (INLINE EDIT ENABLED) ========= */
function initShipmentTable() {
  tableShipment = new Tabulator("#shipmentTable", {
    layout: "fitColumns",
    height: "100%",
    placeholder: "No shipment data",

    columns: [
      { title: "#Ship", field: "shipment_no", width: 95 },

      {
        title: "Date",
        field: "date", // 👈 ต้องตรงกับ response จาก server
        editor: "input",
        editorParams: { elementAttributes: { type: "date" } },
        width: 90,

        formatter: (cell) => {
          let v = cell.getValue();

          // ✅ Default = today ถ้า server ไม่ได้ส่งมา
          if (!v) {
            v = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
          }

          const d = new Date(v);
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          const yy = String(d.getFullYear()).slice(-2);

          return `<div style=" padding:4px; border-radius:6px;">
              ${mm}/${dd}/${yy}
            </div>`;
        },

        cellEdited: async (cell) => {
          const row = cell.getRow().getData();
          const newDate = cell.getValue(); // YYYY-MM-DD จาก input date

          try {
            await jfetch(`/api/v1/lot-shippments/${row.id}/update-fields`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ shipped_date: newDate }), // 👈 backend ต้องรับ key นี้
            });

            toast("✅ Updated date");
            await loadShipmentTable(); // redraw table update พอ ไม่ต้อง refresh page
          } catch (err) {
            console.error("date update failed:", err);
            toast("❌ Failed to update date", false);
            cell.restoreOldValue();
          }
        },
      },

      { title: "Cus.", field: "customer_code", width: 80 },

      {
        title: "Tracking #",
        field: "tracking_number",
        editor: "input",
        width: 160,
        cellEdited: updateField("tracking_number"),
      },
      {
        title: "Lot",
        field: "lots",
        formatter: (cell) => {
          const lots = cell.getValue() || [];
          return lots.map((l) => l.lot_no).join(", "); // แสดงเฉพาะ lot_no
        },

        width: 100,
      },
      {
        title: "Allocated",
        field: "allocated_lots",
        width: 150,
        formatter: (cell) => {
          const row = cell.getRow().getData();
          const lots = cell.getValue();
          if (!lots || !Array.isArray(lots) || !lots.length) {
            return `<span style="color:#ccc">(no alloc)</span>`;
          }

          return lots
            .map((lot) => {
              const disabled =
                row.status === "shipped" ? "disabled btn-disabled" : "";
              return `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <span>${lot.lot_no}, (${lot.qty}) </span>
        <button data-act="return-one"
                data-lot-id="${lot.lot_id}"
                data-qty="${lot.qty}"
                class="btn-mini btn-orange ${disabled}">
          Return
        </button>
      </div>
    `;
            })
            .join("");
        },
        cellClick: async (e, cell) => {
          const btn = e.target;
          if (btn.dataset.act !== "return-one") return;

          const row = cell.getRow().getData();
          if (row.status === "shipped") {
            return toast("⛔ Cannot return, shipment already shipped", false);
          }

          const sourceLotId = Number(btn.dataset.lotId);
          const shipmentId = row.id;

          try {
            await jfetch(ENDPOINTS.returnPart, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source_lot_id: sourceLotId,
                target_lot_id: Number(lotId),
                qty: Number(btn.dataset.qty),
                shipment_id: shipmentId,
              }),
            });

            toast("✅ Return success");

            await loadShipmentTable();
            await loadPartInventory();
            cell.getRow().update({}); // redraw row
          } catch (err) {
            console.error("Return error:", err);
            toast("❌ Return failed", false);
          }
        },
      },
      {
        title: "Qty",
        field: "qty",
        editor: "number",
        width: 80,

        formatter: (cell) => {
          const v = cell.getValue() ?? 0;
          return `<div style="
        background: yellow;
        padding: 4px 8px;
        border-radius: 6px;
      ">${v}</div>`;
        },

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
        title: "#Label",
        field: "label_controls", // ฟิลด์ dummy ไม่ต้องมีจริงใน backend
        width: 130,

        formatter: (cell) => {
          const row = cell.getRow().getData();

          return `
      <div style="display:flex; align-items:center; gap:8px;">
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
          <input type="checkbox" 
                 class="fair-checkbox" 
                 data-id="${row.id}" 
                 ${row.fair ? "checked" : ""}>
          FAIR
        </label>

        <input type="number" 
               class="label-input" 
               data-id="${row.id}"
               value="${row.label_value ?? ""}"
               style="width:60px; padding:2px 4px; border:1px solid #ccc; border-radius:4px;">
      </div>
    `;
        },

        cellClick: (e, cell) => {
          const target = e.target;
          const row = cell.getRow().getData();

          // ---- Handle Checkbox (FAIR) ----
          if (target.classList.contains("fair-checkbox")) {
            const newVal = target.checked;
            console.log("FAIR changed:", row.id, newVal);

            // 🟢 ส่งค่ากลับ server (optional)
            // await jfetch(`/api/v1/...`, {method:"PATCH", body:JSON.stringify({fair:newVal})})
          }

          // ---- Handle Number Input ----
          if (target.classList.contains("label-input")) {
            target.addEventListener("change", async () => {
              const newVal = Number(target.value);
              console.log("Number changed:", row.id, newVal);

              // 🟢 ส่งค่ากลับ server (optional)
              // await jfetch(`/api/v1/...`, {method:"PATCH", body:JSON.stringify({label_value:newVal})})
            });
          }
        },
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
        cellClick: async (e, cell) => {
          const row = cell.getRow().getData();
          const size = e.target.dataset.size;
          if (!size) return;
          await downloadLabel(row, Number(size)); // ✅ เรียกฟังก์ชันใหม่แทน
        },
      },
      {
        title: "Report",
        width: 100,
        formatter: () =>
          `<button class="btn-mini btn-orange" data-act="report">Report</button>`,
        cellClick: async (e, cell) => {
          const row = cell.getRow().getData();
          if (e.target.dataset.act === "report") {
            logShipmentRow(row); // 👈 log detail row
            await downloadReport(row);
          }
        },
      },
      {
        title: "Delete",
        width: 90,
        formatter: () => `<button class="btn-mini btn-red">Delete</button>`,
        cellClick: async (e, cell) => {
          const rowComponent = cell.getRow();
          const row = rowComponent.getData();

          if (!confirm(`Delete shipment ${row.shipment_no}?`)) return;

          try {
            // 1) Call API ลบข้อมูล
            await jfetch(`/api/v1/lot-shippments/delete/${row.id}`, {
              method: "DELETE",
            });

            toast("✅ Shipment deleted");

            // 2) ลบ row ออกจากตารางทันที (UI feedback เร็ว)
            rowComponent.delete();

            // 3) โหลดข้อมูลใหม่มาใส่ table ทั้งหมด เพื่อ update state
            const rows = await jfetch(ENDPOINTS.lotShipments);
            tableShipment.setData(rows); // 👈 update table

            // 4) ถ้ามี inventory ที่เกี่ยวข้องก็ update ด้วย
            await loadPartInventory();
          } catch (err) {
            console.error("Delete error:", err);
            toast("❌ Delete failed", false);
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
    console.log("🔍 rows sample:", rows[0]);

    rows.forEach((r) => {
      if (!r.shipped_at) {
        r.shipped_at = new Date().toISOString().split("T")[0]; // ✅ วันนี้ YYYY-MM-DD
      }
    });

    tableShipment.setData(rows);
  } catch (err) {
    console.error("❌ loadShipmentTable error:", err);
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
