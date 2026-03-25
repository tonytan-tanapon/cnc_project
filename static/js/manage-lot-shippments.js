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
    console.log("LOT Header", lot)
    
    hdr.innerHTML = `
  <div class="lot-vertical">
  <div><b>Customer:</b> ${lot.customer_code ?? "-"}</div>
  <div><b>Part No:</b> ${lot.part_no ?? "-"}</div>      
    <div><b>Lot No:</b> ${lot.lot_no}</div>

    <div><b>PO No:</b> ${lot.po_number ?? "-"}</div>
      
   
    <div><b>Status:</b> ${lot.status ?? "-"}</div>
  
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
    // console.log("av df dsf", data)
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

function downloadCofC(row) {
  const url = `/api/v1/lot-shippments/${row.id}/download/cofc`;
  return downloadDoc(url, "cofc.docx", "Failed to download CofC");
}

function downloadPacking(row) {
  const url = `/api/v1/lot-shippments/${row.id}/download/packing`;
  return downloadDoc(url, "packing.docx", "Failed to download Packing List");
}
function downloadPackingFA(row) {
  const url = `/api/v1/lot-shippments/${row.id}/download/packingFA`;
  return downloadDoc(url, "packing.docx", "Failed to download Packing List");
}

async function downloadDoc(url, fallbackName, errorMsg = "Download failed") {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      toast(errorMsg, false);
      return;
    }

    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition");

    let filename = fallbackName;
    if (disposition && disposition.includes("filename=")) {
      filename = disposition.split("filename=")[1].replace(/["']/g, "");
    }

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    toast(errorMsg, false);
  }
}

async function downloadLabel(row, size, type) {
  const shipmentId = row.id;

  // ✅ ALWAYS define params first
  const params = new URLSearchParams();

  // size is part of path, not query (already correct)
  if (type) params.set("type", type); // fair | cmm | box \ number

  const url =
    `/api/v1/lot-shippments/${shipmentId}/download/label/${size}` +
    (params.toString() ? `?${params.toString()}` : "");

  try {
    const res = await fetch(url);
    if (!res.ok) {
      toast("Failed to download label", false);
      return;
    }

    let downloadName = `label_${shipmentId}_${size}.docx`;
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
    link.download = downloadName;
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

  // customer name lookup พร้อม fallback
  const customerName = cusKey[cusCode] || "UNKNOWN_CUSTOMER";

  // path ใช้ \\ ต้อง escape ให้ BAT ใช้ได้ (BAT รับ \ ปกติ)
  const folderPath = `Z:\\Topnotch Group\\Public\\${year}\\Inspection Report ${year}\\${customerName}`;
  const template = `Z:\\Topnotch Group\\Public\\template.xlsx`;
  const fullFile = `${folderPath}\\${partNo} ${dateCreate} ${lotNo}.xlsx`;
  console.log(fullFile);

  const batContent = [
    "@echo off",
    `echo Lot: ${lotNo}`,
    `echo Part: ${partNo}`,
    `echo Rev: ${rev}`,
    `echo Customer Code: ${cusCode}`,
    "",
    // check folder if not exist → create
    `if not exist "${folderPath}" mkdir "${folderPath}"`,
    // copy Excel template ถ้า file ยังไม่มี
    `if not exist "${fullFile}" copy "${template}" "${fullFile}"`,
    // open file
    `start "" "${fullFile}"`,
    // "pause",
  ].join("\r\n");

  const blob = new Blob([batContent], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `InspectionReport_${lotNo}_${partNo}_${cusCode}.bat`;
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
        title: "Lot Use",
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
  title: "Docs",
  width: 140,
  hozAlign: "center",
  formatter: () => `
    <div style="display:flex; flex-direction:column; gap:6px; align-items:center;">
      <button class="btn-mini btn-blue" data-action="cofc">CofC</button>
      <button class="btn-mini btn-green" data-action="packing">Packing</button>
      <button class="btn-mini btn-green" data-action="packingfa">PackingFA</button>
    </div>
  `,
  cellClick: (e, cell) => {
    const action = e.target?.dataset?.action;
    const rowData = cell.getRow().getData();

    if (action === "cofc") downloadCofC(rowData);
    if (action === "packing") downloadPacking(rowData);
    if (action === "packingfa") downloadPackingFA(rowData);
  },
},
      {
        title: "Label",
        width: 150,
        formatter: () => `
  <div class="label-buttons">
    <!-- SIZE -->
    <button class="btn-mini btn-orange" data-action="size" data-size="80">80</button>
    <button class="btn-mini btn-blue"   data-action="size" data-size="60">60</button>
    <button class="btn-mini btn-green"  data-action="size" data-size="30">30</button>

    <!-- TYPE -->
    <button class="btn-mini btn-gray" data-action="type" data-type="fair">Fair</button>
    <button class="btn-mini btn-gray" data-action="type" data-type="cmm">CMM</button>
    <button class="btn-mini btn-gray" data-action="type" data-type="number">#</button>
    <button class="btn-mini btn-gray" data-action="type" data-type="box">Box</button>
  </div>
`,

        cellClick: async (e, cell) => {
          const btn = e.target.closest("button");
          if (!btn) return;

          const row = cell.getRow().getData();

          const action = btn.dataset.action;   // ✅ works now
          var size = btn.dataset.size;       // string | undefined
          var type = btn.dataset.type;       // string | undefined
          if (size === undefined) {
            size = 30; // default size
          }
          if (type === undefined) {
            type = 'label'; // default type
          }
          console.log("Button clicked:", {
            action,
            size,
            type,
            shipmentId: row.id,
          });
          await downloadLabel(row, Number(size), type);
          return;


        },

      },

       {
        title: "Note",
        field: "note",
       editor: "input",
        width: 80,
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


function makeLotLinks(lotId) {
  if (!lotId) return;

  const links = [
    {
      id: "lot_link",
      href: `/static/lot-detail.html?lot_id=${encodeURIComponent(lotId)}`,
      title: "Traveler",
    },
    {
      id: "traveler_link",
      href: `/static/traveler-detail.html?lot_id=${encodeURIComponent(lotId)}`,
      title: "Traveler",
    },
    {
      id: "material_link",
      href: `/static/manage-lot-materials.html?lot_id=${encodeURIComponent(lotId)}`,
      title: "Materials",
    },
    {
      id: "shippment_link",
      href: `/static/manage-lot-shippments.html?lot_id=${encodeURIComponent(lotId)}`,
      title: "Shipment",
    },
  ];

  links.forEach(({ id, href, title }) => {
    const el = document.getElementById(id);
    if (!el) return;

    const a = document.createElement("a");
    a.href = href;
    a.title = title;
    // a.target = "_blank";
    a.style.textDecoration = "none";
    a.style.color = "inherit";
    a.style.cursor = "pointer";

    // move existing content (icon + text) inside <a>
    while (el.firstChild) {
      a.appendChild(el.firstChild);
    }

    el.replaceWith(a);
  });
}

/* ========= BOOT ========= */
document.addEventListener("DOMContentLoaded", async () => {
  await loadLotHeader();
  await loadShipmentsList();



  initPartTable();
  initShipmentTable();
  initToolbar();

  makeLotLinks(lotId);
});
