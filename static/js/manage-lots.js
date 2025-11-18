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
  if (isNaN(d)) return "";

  return d.toLocaleDateString("en-US", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  });
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
    lot_created: r.created_at ?? null,
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

    customer_id: r.customer_id ?? null,
    customer_code: r.customer_code ?? "",
    customer_name: r.customer_name ?? "",

    ship_qty: r.ship_qty ?? 0,
    // ship_date: r.ship_date ?? null,
    ship_date: r.ship_date ? r.ship_date.split(" ")[0] : null,

    traveler_id: r.traveler_id ?? null,
  };
}

let currentSortBy = "lot_id";
let currentSortDir = "asc";

async function loadKeyset(after = null, sortBy = null, sortDir = null) {
  await waitForTableBuilt();
  if (ksLoading || ksDone) return;

  ksLoading = true;
  const mySeq = ++ksSeq;

  try {
    const usp = new URLSearchParams();
    usp.set("limit", "200");

    if (searchText) usp.set("q", searchText);

    // use global sort if not provided
    const sb = sortBy ?? currentSortBy;
    const sd = sortDir ?? currentSortDir;

    if (sb) usp.set("sort_by", sb);
    if (sd) usp.set("sort_dir", sd);

    if (after) {
      usp.set("after_value", after.value ?? "");
      usp.set("after_lot_id", after.lot_id ?? 0);
    }

    const res = await jfetch(`/api/v1/lot-summary?${usp}`);

    if (mySeq !== ksSeq) return;

    const rows = (res.items || []).map(normalizeRow);

    if (!after) table.setData(rows);
    else await table.addData(rows);

    if (rows.length) {
      const last = rows.at(-1);
      cursor = sb
        ? { key: sb, value: last[sb], lot_id: last.lot_id }
        : { key: "lot_id", value: last.lot_id, lot_id: last.lot_id };
    } else {
      ksDone = true;
      cursor = null;
    }
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
      {
        title: "PO<br>Date",
        field: "lot_created",
        minWidth: 82,
        headerSort: true,
        formatter: (c) => fmtDate(c.getValue()),
      },
      {
        title: "Cust.",
        field: "customer_code",
        minWidth: 80,
        headerSort: true,
      },

      // LOT NUMBER
      {
        title: "Lot",
        field: "lot_no",
        minWidth: 80,
        headerSort: true,
      },
      // {
      //   title: "Lot",
      //   field: "lot_no",
      //   minWidth: 80,
      //   headerSort: true,
      //   formatter: (cell) => {
      //     const r = cell.getRow().getData();
      //     if (!r.lot_id) return r.lot_no || "—";
      //     return `<a href="/static/lot-detail.html?lot_id=${r.lot_id}" style="color:#2563eb;">${r.lot_no}</a>`;
      //   },
      //   cellClick: (_, cell) => {
      //     const r = cell.getRow().getData();
      //     if (r.lot_id)
      //       location.href = `/static/lot-detail.html?lot_id=${r.lot_id}`;
      //   },
      // },

      // PO NUMBER
      {
        title: "PO",
        minWidth: 80,
        headerSort: true,
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
        title: "Part",
        field: "part_no",
        minWidth: 120,
        headerSort: true,
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

      {
        title: "Desc.",
        field: "part_name",
        minWidth: 120,
        headerSort: true,
      },
      {
        title: "Rev",
        field: "revision_code",
        minWidth: 50,
        headerSort: true,
      },

      // PROD QTY
      {
        title: "Prod<br>Qty",
        field: "lot_qty",
        width: 80,
        headerSort: true,
        hozAlign: "right",
        formatter: (c) => fmtQty(c.getValue()),
      },

      // // PROD ALLOCATE
      // {
      //   title: "Lot<br>QTY",
      //   field: "lot_qty",
      //   width: 70,
      //   headerSort: true,
      //   hozAlign: "right",
      //   formatter: (c) => fmtQty(c.getValue()),
      // },

      // PROD DATE
      {
        title: "Prod<br>Date",
        field: "lot_due_date",
        minWidth: 82,
        headerSort: true,
        formatter: (c) => fmtDate(c.getValue()),
      },

      // PO QTY
      {
        title: "PO<br>Qty",
        field: "qty",
        width: 70,
        headerSort: true,
        hozAlign: "right",
        formatter: (c) => fmtQty(c.getValue()),
      },

      // PO DATE
      {
        title: "PO<br>Date",
        field: "po_due_date",
        minWidth: 82,
        headerSort: true,
        formatter: (c) => fmtDate(c.getValue()),
      },

      // SHIP QTY
      // SHIP QTY
      {
        title: "Ship<br>Qty",
        field: "ship_qty",
        width: 70,
        headerSort: true,
        hozAlign: "right",
        sorter: "number", // ⭐ force number sorting (ใช้ค่าจริงจาก DB)
        formatter: (c) => fmtQty(c.getValue()),
      },

      // SHIP DATE  ⭐ NEW
      {
        title: "Ship<br>Date",
        field: "ship_date",
        minWidth: 82,
        headerSort: true,
        sorter: "string", // <— ใช้ string ก็เรียงถูก เพราะ YYYY-MM-DD sortable
        formatter: (c) => fmtDate(c.getValue()),
      },

      // TRAVELERS
      {
        title: "Travelers",
        width: 80,
        headerSort: true,
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
        width: 80,
        headerSort: true,
        formatter: (cell) => {
          const r = cell.getRow().getData();
          if (!r.lot_id) return "—";
          return `<a href="/static/manage-lot-materials.html?lot_id=${r.lot_id}" style="color:#2563eb;">Materials</a>`;
        },
      },

      // SHIPMENTS
      {
        title: "Shipments",
        width: 80,
        headerSort: true,
        formatter: (cell) => {
          const r = cell.getRow().getData();
          if (!r.lot_id) return "—";
          return `<a href="/static/manage-lot-shippments.html?lot_id=${r.lot_id}" style="color:#2563eb;">Shipments</a>`;
        },
      },

      // EXTRA
      { title: "FAIR", field: "fair", minWidth: 80, headerSort: true },
      {
        title: "*Remark Product Control",
        field: "remark",
        minWidth: 150,
        headerSort: true,
      },
      {
        title: "Tracking No.",
        field: "tracking_no",
        minWidth: 140,
        headerSort: true,
      },
      {
        title: "Real Shipped Date",
        field: "real_ship_date",
        minWidth: 140,
        headerSort: true,
      },
      {
        title: "INCOMING STOCK",
        field: "incoming_stock",
        minWidth: 140,
        headerSort: true,
      },
    ],
  });
  table.on("sorterChanged", function (sorters) {
    const s = sorters[0];
    if (!s) return;

    const sortField = s.field;
    const sortDir = s.dir;

    // ⭐ จำค่าที่ sort ไว้
    currentSortBy = sortField;
    currentSortDir = sortDir;

    cursor = null;
    ksDone = false;
    ksSeq++;
    table.clearData();

    loadKeyset(null, sortField, sortDir);
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

    loadKeyset(null, currentSortBy, currentSortDir);
  }, 300)
);
// -------- Boot -------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  initTopbar?.();
  initTable();

  await waitForTableBuilt();
  cursor = null;
  ksDone = false;
  loadKeyset(null, currentSortBy, currentSortDir);
});
