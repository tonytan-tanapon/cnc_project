// /static/js/page-view-due-date-monitor.js
import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const ENDPOINT = "/reports/due-date-monitor";
const PER_PAGE = 100;
const FETCH_COOLDOWN_MS = 250;
const NEAR_BOTTOM_PX = 60;
const SEARCH_DEBOUNCE_MS = 250;

/* ===== STATE ===== */
let table = null;
let tableBuilt = false;
let loading = false;
let hasMore = true;
let skip = 0;
let lastFetchAt = 0;

let sortBy = "po_line_due_date";
let sortDir = "asc"; // 'asc' | 'desc'
let q = ""; // คำค้น

const nowMs = () => performance?.now?.() || Date.now();
const underCooldown = () => nowMs() - lastFetchAt < FETCH_COOLDOWN_MS;
const markFetched = () => { lastFetchAt = nowMs(); };

/* ===== COLUMNS ===== */
function makeColumns() {
  const dateFmt = (cell) => {
    const v = cell.getValue();
    return v ? String(v).slice(0, 10) : "";
  };

  return [
    { title: "Part No", field: "part_no", width: 150, sorter: "string" },
    { title: "Rev", field: "revision", width: 80, hozAlign: "center", sorter: "string" },
    { title: "Lot No", field: "lot_no", width: 140, sorter: "string" },
    { title: "PO No", field: "po_no", width: 130, sorter: "string" },
    { title: "Customer", field: "customer_no", width: 140, sorter: "string" },

    { title: "PO Qty", field: "po_qty", width: 100, hozAlign: "right", sorter: "number" },
    { title: "Lot Qty", field: "lot_qty", width: 100, hozAlign: "right", sorter: "number" },

    { title: "PO Due Date", field: "po_line_due_date", width: 140, sorter: "string", formatter: dateFmt },
    { title: "Lot Due Date", field: "lot_due_date", width: 140, sorter: "string", formatter: dateFmt },
    { title: "Start Date", field: "lot_started_at", width: 140, sorter: "string", formatter: dateFmt },

    { title: "PO Due date", field: "days_until_po_due", width: 130, hozAlign: "right", sorter: "number" },
    { title: "Lot Due date", field: "days_until_lot_due", width: 130, hozAlign: "right", sorter: "number" },
    { title: "Prod Start", field: "days_until_lot_start", width: 130, hozAlign: "right", sorter: "number" },

    { title: "Status", field: "lot_status", width: 120, sorter: "string" },
  ];
}

/* ===== FETCH ===== */
async function fetchPage() {
  const usp = new URLSearchParams();
  usp.set("limit", String(PER_PAGE));
  usp.set("skip", String(skip));
  usp.set("sort_by", sortBy);
  usp.set("sort_dir", sortDir);
  const qTrim = (q || "").trim();
  if (qTrim) usp.set("q", qTrim);

  const res = await jfetch(`${ENDPOINT}?${usp.toString()}`);
  return Array.isArray(res?.items) ? res.items : [];
}

/* ===== LOADERS ===== */
async function resetAndLoadFirst() {
  if (!tableBuilt) return;
  skip = 0;
  hasMore = true;
  try {
    table.clearData();
    await loadNext();
    ensureInfiniteScroll();
  } catch (e) {
    toast(e?.message || "Load failed", false);
  }
}

async function loadNext() {
  if (!tableBuilt || loading || !hasMore) return;
  if (underCooldown()) {
    await new Promise(r => setTimeout(r, 1 + (FETCH_COOLDOWN_MS - (nowMs() - lastFetchAt))));
  }
  loading = true;
  try {
    const items = await fetchPage();
    markFetched();
    if (!items.length) {
      hasMore = false;
      return;
    }
    await table.addData(items, false);
    skip += items.length;
  } catch (e) {
    hasMore = false;
    toast(e?.message || "Load more failed", false);
  } finally {
    loading = false;
  }
}

/* ===== SEARCH (auto debounce) ===== */
function bindSearch() {
  const input = document.getElementById("_q");
  if (!input) return;

  let timer = null;
  let lastSent = "";

  const run = async () => {
    const v = (input.value || "").trim();
    if (v === lastSent) return;
    lastSent = v;
    q = v;
    await resetAndLoadFirst();
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(run, SEARCH_DEBOUNCE_MS);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(timer);
      run();
    }
    if (e.key === "Escape") {
      input.value = "";
      clearTimeout(timer);
      lastSent = "";
      q = "";
      resetAndLoadFirst();
    }
  });
}

/* ===== SCROLL ===== */
function ensureInfiniteScroll() {
  if (ensureInfiniteScroll._bound) return;

  // รอให้ tableHolder โผล่
  const bind = () => {
    const holder = document.querySelector(".tabulator-tableHolder");
    const root = document.querySelector("#listBody")?.closest(".tabulator");
    if (!holder) { requestAnimationFrame(bind); return; }

    const onScroll = () => {
      if (loading || !hasMore) return;
      if (holder && holder.scrollTop + holder.clientHeight >= holder.scrollHeight - NEAR_BOTTOM_PX) {
        loadNext(); return;
      }
      const rect = (root || document.body).getBoundingClientRect?.();
      if (rect && rect.bottom <= window.innerHeight + NEAR_BOTTOM_PX) {
        loadNext(); return;
      }
    };
    holder.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    ensureInfiniteScroll._bound = true;
  };
  bind();
}

/* ===== INIT ===== */
document.addEventListener("DOMContentLoaded", () => {
  table = new Tabulator("#listBody", {
    layout: "fitDataFill",
    height: "80vh",
    columns: makeColumns(),
    placeholder: "Loading...",
    reactiveData: true,
    initialSort: [{ column: "po_line_due_date", dir: "asc" }], // OK: ใช้ชื่อ field
  });

  // เมื่อผู้ใช้คลิกหัวคอลัมน์เพื่อ sort → refetch ฝั่งเซิร์ฟเวอร์
  table.on("sortChanged", (sorters) => {
    if (Array.isArray(sorters) && sorters.length) {
      const s = sorters[0];
      // บางครั้ง Tabulator ให้ `s.field` ว่าง ให้ดึงจาก column object แทน
      const f = s.field || (s.column && typeof s.column.getField === "function" ? s.column.getField() : null);
      sortBy = f || "po_line_due_date";
      sortDir = s.dir || "asc";
      resetAndLoadFirst();
    }
  });

  table.on("tableBuilt", () => {
    tableBuilt = true;
    resetAndLoadFirst();
  });

  bindSearch(); // auto search
});
