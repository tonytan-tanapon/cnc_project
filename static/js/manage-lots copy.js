// /static/js/manage-parts-lots.js
import { $, jfetch, showToast as toast, initTopbar } from "./api.js";

// -------- Formatters -------------------------------------------------
function fmtQty(v) {
  if (v == null) return "";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
}
function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleDateString();
}

// -------- State -------------------------------------------------------
let table = null;
let isBuilt = false;

const tableMount = document.getElementById("p_table"); // ← ❗ MUST HAVE

function waitForTableBuilt() {
  if (isBuilt) return Promise.resolve();
  return new Promise((resolve) => {
    if (table) table.on("tableBuilt", () => resolve());
  });
}

// -------- Keyset State -----------------------------------------------
let cursor = null;
let ksLoading = false;
let ksDone = false;
let ksSeq = 0;
// search text state
let searchText = "";
const debounce = (fn, ms = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};
// -------- Normalizer -------------------------------------------------
function normalizeRow(row) {
  const r = {};
  for (const [k, v] of Object.entries(row)) {
    r[k.toLowerCase().trim()] = v;
  }

  return {
    lot_id: r.lot_id ?? null,
    lot_no: r.lot_no ?? "",
    lot_qty: r.lot_qty ?? null,
    lot_due_date: r.lot_due_date ?? null,

    part_id: r.part_id ?? null,
    part_no: r.part_no ?? "",
    part_name: r.part_name ?? "",

    revision_id: r.revision_id ?? null,
    revision_code: r.revision_code ?? "",

    po_id: r.po_id ?? null,
    po_number: r.po_number ?? "",
    qty: r.po_qty ?? null,
    po_due_date: r.po_due_date ?? null,

    // ⭐ ADD THESE
    customer_id: r.customer_id ?? null,
    customer_code: r.customer_code ?? "",
    customer_name: r.customer_name ?? "",

    ship_qty: r.ship_qty ?? 0,
    traveler_id: r.traveler_id ?? null,
  };
}

// -------- Load Keyset -----------------------------------------------
async function loadKeyset(after = null) {
  await waitForTableBuilt();
  if (ksLoading || ksDone) return;

  ksLoading = true;
  const mySeq = ++ksSeq;

  try {
    const usp = new URLSearchParams();
    usp.set("limit", "200");
    if (searchText) usp.set("q", searchText);
    if (after) usp.set("after_id", String(after));

    const res = await jfetch(`/api/v1/lot-summary?${usp.toString()}`);

    if (mySeq !== ksSeq) return;

    // 🟩 Debug ตรงนี้ ช่วยจับ key เพี้ยน
    console.log("🔥 RAW FIRST ROW =", res.items?.[0]);
    console.log("🔥 RAW KEYS =", Object.keys(res.items?.[0] || {}));

    console.log("cursor BEFORE load =", cursor);

    const rows = (res.items || []).map(normalizeRow);

    console.log("📦 Batch loaded =", rows.length, "rows");
    console.log("📊 Total so far =", table.getDataCount());

    if (!after) table.setData(rows);
    else await table.addData(rows);

    // 🟩 หลัง add ข้อมูลแล้ว ค่อยอัปเดต cursor
    cursor = rows.length ? rows.at(-1).lot_id : null;

    console.log("cursor AFTER load =", cursor);

    ksDone = rows.length === 0;
  } catch (err) {
    toast("Load failed: " + err.message, false);
  } finally {
    ksLoading = false;
  }
}

// -------- Infinite Scroll -------------------------------------------
function bindInfiniteScroll() {
  const holder = document.querySelector("#p_table .tabulator-tableholder");
  if (!holder) return;

  const sentinel = document.createElement("div");
  sentinel.style.height = "1px";
  sentinel.style.width = "100%";
  holder.appendChild(sentinel);

  const io = new IntersectionObserver(
    (entries) => {
      const e = entries[0];
      if (!e.isIntersecting) return;
      if (ksLoading || ksDone) return;
      loadKeyset(cursor);
    },
    { root: holder, threshold: 0, rootMargin: "0px 0px 200px 0px" }
  );

  io.observe(sentinel);
}

// -------- Table ------------------------------------------------------
function initTable() {
  if (!tableMount) return;

  table = new Tabulator(tableMount, {
    layout: "fitColumns",
    height: "600px",
    placeholder: "No rows",
    index: "lot_id",
    reactiveData: true,
    pagination: false,

    columns: [
      // LOT NUMBER
      {
        title: "Lot Number",
        field: "lot_no",
        minWidth: 120,
        formatter: (cell) => {
          const r = cell.getRow().getData();
          if (!r.lot_id) return r.lot_no || "—";
          return `<a href="/static/lot-detail.html?lot_id=${r.lot_id}" style="color:#2563eb;">${r.lot_no}</a>`;
        },
        cellClick: (_, cell) => {
          const r = cell.getRow().getData();
          if (r.lot_id)
            location.href = `/static/lot-detail.html?lot_id=${r.lot_id}`;
        },
      },

      // PO NUMBER
      {
        title: "PO No",
        minWidth: 120,
        formatter: (cell) => {
          const r = cell.getRow().getData();
          if (!r.po_id) return r.po_number || "—";
          return `<a href="/static/manage-pos-detail.html?id=${r.po_id}" style="color:#2563eb;">${r.po_number}</a>`;
        },
        cellClick: (_, cell) => {
          const r = cell.getRow().getData();
          if (r.po_id)
            location.href = `/static/manage-pos-detail.html?id=${r.po_id}`;
        },
      },
      // PART NUMBER
      {
        title: "Part No",
        field: "part_no",
        minWidth: 140,
        formatter: (cell) => {
          const r = cell.getRow().getData();
          if (!r.part_id) return r.part_no || "—";

          return `
      <a 
        href="/static/manage-part-detail.html?part_id=${r.part_id}&customer_id=${r.customer_id}"
        style="color:#2563eb;"
      >
        ${r.part_no}
      </a>
    `;
        },
        cellClick: (_, cell) => {
          const r = cell.getRow().getData();
          if (r.part_id) {
            location.href = `/static/manage-part-detail.html?part_id=${r.part_id}&customer_id=${r.customer_id}`;
          }
        },
      },
      // PROD QTY
      {
        title: "Prod Qty",
        field: "lot_qty",
        width: 110,
        hozAlign: "right",
        formatter: (c) => fmtQty(c.getValue()),
      },

      // PROD ALLOCATE
      {
        title: "Prod Allocate",
        field: "lot_qty",
        width: 110,
        hozAlign: "right",
        formatter: (c) => fmtQty(c.getValue()),
      },

      // PROD DATE
      {
        title: "Prod Date",
        field: "lot_due_date",
        minWidth: 110,
        formatter: (c) => fmtDate(c.getValue()),
      },

      // PO QTY
      {
        title: "PO Qty",
        field: "qty",
        width: 110,
        hozAlign: "right",
        formatter: (c) => fmtQty(c.getValue()),
      },

      // PO DATE
      {
        title: "PO Date",
        field: "po_due_date",
        minWidth: 110,
        formatter: (c) => fmtDate(c.getValue()),
      },

      // SHIP QTY
      {
        title: "Ship Qty",
        field: "ship_qty",
        width: 110,
        hozAlign: "right",
        formatter: (c) => fmtQty(c.getValue()),
      },

      // TRAVELERS
      {
        title: "Travelers",
        width: 120,
        formatter: (cell) => {
          const r = cell.getRow().getData();
          // ไม่มี traveler → แสดงขีด
          if (!r.traveler_id) return "—";

          // มี traveler → ลิงก์ clickable
          return `
      <a href="/static/traveler-detail.html?id=${r.traveler_id}"
         style="color:#2563eb; text-decoration:underline;">
         View Traveler
      </a>
    `;
        },
        cellClick: (_, cell) => {
          const r = cell.getRow().getData();
          if (!r.traveler_id) return; // ไม่มี → ไม่ต้องทำอะไร
          location.href = `/static/traveler-detail.html?id=${r.traveler_id}`;
        },
      },

      // MATERIALS
      {
        title: "Materials",
        width: 120,
        formatter: (cell) => {
          const r = cell.getRow().getData();
          if (!r.lot_id) return "—";
          return `<a href="/static/manage-lot-materials.html?lot_id=${r.lot_id}" style="color:#2563eb;">Materials</a>`;
        },
      },

      // SHIPMENTS
      {
        title: "Shipments",
        width: 120,
        formatter: (cell) => {
          const r = cell.getRow().getData();
          if (!r.lot_id) return "—";
          return `<a href="/static/manage-lot-shippments.html?lot_id=${r.lot_id}" style="color:#2563eb;">Shipments</a>`;
        },
      },

      // EXTRA
      { title: "FAIR", field: "fair", minWidth: 80 },
      { title: "*Remark Product Control", field: "remark", minWidth: 150 },
      { title: "Tracking No.", field: "tracking_no", minWidth: 140 },
      { title: "Real Shipped Date", field: "real_ship_date", minWidth: 140 },
      { title: "INCOMING STOCK", field: "incoming_stock", minWidth: 140 },
    ],
  });

  table.on("tableBuilt", () => {
    isBuilt = true;
    bindInfiniteScroll();
  });
}
document.getElementById("p_q")?.addEventListener(
  "input",
  debounce(async (e) => {
    searchText = e.target.value.trim();

    // reset state
    cursor = null;
    ksDone = false;
    ksSeq++;
    table?.clearData();

    loadKeyset(null);
  }, 300)
);
// -------- Boot -------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  initTopbar?.();
  initTable();

  await waitForTableBuilt();
  cursor = null;
  ksDone = false;
  loadKeyset(null);
});
