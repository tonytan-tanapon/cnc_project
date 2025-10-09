// /static/js/page-view-due-date-monitor.js
import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const ENDPOINT = "/reports/due-date-monitor";
const PER_PAGE = 100;
const FETCH_COOLDOWN_MS = 250;
const NEAR_BOTTOM_PX = 60;

/* ===== STATE ===== */
let table = null;
let tableBuilt = false;
let loading = false;
let hasMore = true;
let skip = 0;
let lastFetchAt = 0;
let sortBy = "po_line_due_date";
let sortDir = "asc"; // 'asc' | 'desc'

const nowMs = () => performance?.now?.() || Date.now();
const underCooldown = () => nowMs() - lastFetchAt < FETCH_COOLDOWN_MS;
const markFetched = () => { lastFetchAt = nowMs(); };

/* ===== COLUMNS (set sorter types) ===== */
function makeColumns() {
  // Note: We avoid Tabulator's datetime sorter that needs Luxon by defaulting to ISO strings or numeric days.
  return [
    // { title: "No.", formatter: "rownum", width: 60, headerSort: false },

    { title: "Part No", field: "part_no", width: 150, sorter: "string" },
    { title: "Rev", field: "revision", width: 80, hozAlign: "center", sorter: "string" },
    { title: "Lot No", field: "lot_no", width: 140, sorter: "string" },
    { title: "PO No", field: "po_no", width: 130, sorter: "string" },
    { title: "Customer", field: "customer_no", width: 140, sorter: "string" },

    { title: "PO Qty", field: "po_qty", width: 100, hozAlign: "right", sorter: "number" },
    { title: "Lot Qty", field: "lot_qty", width: 100, hozAlign: "right", sorter: "number" },

    // Dates: backend sorts, we just display
    { title: "PO Due Date", field: "po_line_due_date", width: 140, sorter: "string", formatter: dateFmt },
    { title: "Lot Due Date", field: "lot_due_date", width: 140, sorter: "string", formatter: dateFmt },
    { title: "Start Date", field: "lot_started_at", width: 140, sorter: "string", formatter: dateFmt },

    // Day deltas are numbers → easy client sorting but still request server sort
    { title: "PO Due date", field: "days_until_po_due", width: 130, hozAlign: "right", sorter: "number" },
    { title: "Lot Due date", field: "days_until_lot_due", width: 130, hozAlign: "right", sorter: "number" },
    { title: "Prod Start", field: "days_until_lot_start", width: 130, hozAlign: "right", sorter: "number" },

    { title: "Status", field: "lot_status", width: 120, sorter: "string" },
  ];
}

function dateFmt(cell) {
  const v = cell.getValue();
  return v ? String(v).slice(0, 10) : "";
}

/* ===== FETCH ===== */
async function fetchPage() {
  const usp = new URLSearchParams();
  usp.set("limit", String(PER_PAGE));
  usp.set("skip", String(skip));
  usp.set("sort_by", sortBy);
  usp.set("sort_dir", sortDir);
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

/* ===== SCROLL ===== */
function ensureInfiniteScroll() {
  if (ensureInfiniteScroll._bound) return;
  ensureInfiniteScroll._bound = true;

  const holder = document.querySelector(".tabulator-tableHolder");
  const root = document.querySelector("#listBody")?.closest(".tabulator");

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
  holder?.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
}

/* ===== INIT ===== */
document.addEventListener("DOMContentLoaded", () => {
  table = new Tabulator("#listBody", {
    layout: "fitDataFill",
    height: "80vh",
    columns: makeColumns(),
    placeholder: "Loading...",
    reactiveData: true,
    // We’ll react to header sorts and refetch from server:
    initialSort: [{ column: "po_line_due_date", dir: "asc" }],
  });

  // When user clicks a column to sort, ask the server for sorted data
  table.on("sortChanged", (sorters) => {
    // Tabulator returns an array; we only use the first sorter for server-side
    if (Array.isArray(sorters) && sorters.length) {
      const s = sorters[0];
      // Map Tabulator’s sorter info to our query params
      sortBy = s.field || "po_line_due_date";
      sortDir = s.dir || "asc";
      resetAndLoadFirst(); // refetch from page 1 with new sort
    }
  });

  table.on("tableBuilt", () => {
    tableBuilt = true;
    resetAndLoadFirst();
  });
});
