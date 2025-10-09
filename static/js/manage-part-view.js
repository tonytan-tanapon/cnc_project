// /static/js/page-lots.js — Lots Browser (auto-search + nav safe)
import { jfetch, toast } from "./api.js";

const SEARCH_DEBOUNCE_MS = 250;
const safe = (s) => String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");

let table = null;
let currentQuery = "";

function initTable() {
  const holder = document.getElementById("listBody");
  const grid = document.createElement("div");
  holder.innerHTML = "";
  holder.appendChild(grid);

  let ready = false;
  const safeRedraw = () => { if (!ready || !grid.offsetWidth) return; try { table.redraw(true); } catch {} };

  table = new Tabulator(grid, {
    layout: "fitColumns",
    height: "100%",
    placeholder: "No data",
    reactiveData: true,
    index: "lot_id",
    columns: [
      { title: "No.", field: "_rowno", width: 70, hozAlign:"right",
        headerHozAlign:"right", headerSort:false, formatter: (c)=> c.getRow().getPosition(true) },
      {
        title: "Part No.", field: "part_no", width: 180, headerSort: true,
        formatter: (cell) => {
          const d = cell.getData();
          return d.part_id
            ? `<a class="link" href="/static/part-detail.html?id=${encodeURIComponent(d.part_id)}">${safe(d.part_no)}</a>`
            : safe(d.part_no || "");
        },
      },
      { title: "Part Name", field: "part_name", width: 240, headerSort: true },
      { title: "Revision", field: "revision", width: 110, hozAlign:"center", headerHozAlign:"center" },
      {
        title: "PO No.", field: "po_no", width: 160,
        formatter: (cell) => {
          const d = cell.getData();
          return d.po_id
            ? `<a class="link" href="/static/po-detail.html?id=${encodeURIComponent(d.po_id)}">${safe(d.po_no || "")}</a>`
            : safe(d.po_no || "");
        },
      },
      {
        title: "Lot No.", field: "lot_no", width: 160,
        formatter: (cell) => {
          const d = cell.getData();
          return d.lot_id
            ? `<a class="link" href="/static/lot-detail.html?id=${encodeURIComponent(d.lot_id)}">${safe(d.lot_no || "")}</a>`
            : safe(d.lot_no || "");
        },
      },
      { title: "Customer", field: "customer_code", width: 120, hozAlign:"center", headerHozAlign:"center" },
      {
        title: "PO Due", field: "po_due_date", width: 140, hozAlign:"center", headerHozAlign:"center",
        formatter: (c) => c.getValue() ? new Date(c.getValue()).toLocaleDateString() : "",
      },
      {
        title: "Lot Start", field: "lot_start", width: 160, hozAlign:"center", headerHozAlign:"center",
        formatter: (c) => c.getValue() ? new Date(c.getValue()).toLocaleString() : "",
      },
      {
        title: "Lot Due", field: "lot_due_date", width: 140, hozAlign:"center", headerHozAlign:"center",
        formatter: (c) => c.getValue() ? new Date(c.getValue()).toLocaleDateString() : "",
      },
    ],
  });

  table.on("tableBuilt", () => { ready = true; requestAnimationFrame(safeRedraw); setTimeout(safeRedraw, 0); });
  const ro = new ResizeObserver(safeRedraw); ro.observe(holder);
  window.addEventListener("resize", safeRedraw);
}

async function reload() {
  try {
    const pageSize = 500;
    const url = currentQuery
      ? `/lots/browse?q=${encodeURIComponent(currentQuery)}&page=1&page_size=${pageSize}`
      : `/lots/browse?page=1&page_size=${pageSize}`;
    const res = await jfetch(url);
    const items = Array.isArray(res) ? res : (res.items ?? []);
    table?.setData(items);
  } catch (e) {
    table?.setData([]);
    toast(e?.message || "Load failed", false);
  }
}

function wireTopbar() {
  const input = document.getElementById("_q");
  const btnAdd = document.getElementById("_add"); // ใช้หรือซ่อนได้

  let timer = null, lastSent = "";
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = (input.value || "").trim();
      if (q === lastSent) return;
      lastSent = q;
      currentQuery = q;
      await reload();
    }, SEARCH_DEBOUNCE_MS);
  };

  input.addEventListener("input", schedule);
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(timer);
      const q = (input.value || "").trim();
      if (q === lastSent) return;
      lastSent = q; currentQuery = q;
      await reload();
    }
  });

  // ถ้าไม่ใช้ +Add ก็ซ่อนไป
  if (btnAdd) btnAdd.style.display = "none";
}

document.addEventListener("DOMContentLoaded", async () => {
  document.title = "Lots · Topnotch – MFG";
  initTable();
  wireTopbar();
  await reload();
});
