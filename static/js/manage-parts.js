// /static/js/page-parts.js  (v11.4 – Lots via /data, pager on right, Part->manage-part-detail)
import { $, jfetch, showToast as toast, initTopbar } from "./api.js";

const lotDetailUrl = (id) =>
  `/static/lot-detail.html?id=${encodeURIComponent(id)}`;
const poDetailUrl = (id) =>
  `/static/pos-detail.html?id=${encodeURIComponent(id)}`;
const managePartDetailUrl = (partId, revId, custId) =>
  `/static/manage-part-detail.html?part_id=${encodeURIComponent(
    partId ?? ""
  )}` +
  `&part_revision_id=${encodeURIComponent(revId ?? "")}` +
  `&customer_id=${encodeURIComponent(custId ?? "")}`;

const safe = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const fmtDate = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
};
const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

const inputSearch = $("p_q");
const selPerPage = $("p_per_page"); // optional external selector
const tableMount = $("p_table");
const btnReload = $("p_reload");

let table = null;
let totalItems = 0;
const DEFAULT_PAGE_SIZE = true;

// ---- footer to the right
(() => {
  if (document.getElementById("tab-foot-right")) return;
  const st = document.createElement("style");
  st.id = "tab-foot-right";
  st.textContent = `
    .tabulator .tabulator-footer{display:flex;align-items:center;justify-content:flex-end;gap:10px}
    .tabulator .tabulator-footer .tabulator-paginator{order:1}
    .tabulator .tabulator-footer .tabulator-page-size{order:2}
    .tabulator .tabulator-footer .tabulator-page-size select{width:84px;height:28px;padding:2px 6px}
  `;
  document.head.appendChild(st);
})();

function initTable() {
  // console.log("initTable");
  if (!tableMount) return;

  table = new Tabulator(tableMount, {
    layout: "fitColumns",
    height: "80vh",
    placeholder: "No lots found",
    index: "id",

    pagination: true,
    paginationMode: "remote",
    paginationSize: DEFAULT_PAGE_SIZE,
    paginationSizeSelector: [20, 50, 100, 200, true], // true = Show All
    paginationCounter: "rows",

    ajaxURL: "/data",
    // ✅ use params.size here (don’t call table.getPageSize() during init)
    ajaxRequestFunc: async (_url, _cfg, params) => {
      const page = params.page || 1;
      const showAll = params.size === true;
      const size = showAll
        ? DEFAULT_PAGE_SIZE
        : Number(params.size) || DEFAULT_PAGE_SIZE;

      const q = (inputSearch?.value || "").trim();
      const usp = new URLSearchParams();
      usp.set("page", String(page));
      if (showAll) usp.set("all", "1");
      else usp.set("page_size", String(size));
      if (q) usp.set("q", q);
      usp.set("_", String(Date.now()));

      const resp = await jfetch(`/data?${usp.toString()}`);
      const items = Array.isArray(resp) ? resp : resp.items ?? [];
      // console
      totalItems = Number(resp?.total ?? items.length);
      // console.log(items);
      // Map fields; backend should include customer_id and part_revision_id.
      const rows = items.map((r) => ({
        id: r.id,
        lot_no: r.lot_no ?? "",
        po_id: r.po_id ?? null,
        po_number: r.po_number ?? (r.po_id ? String(r.po_id) : ""),
        customer_code: r.customer_code ?? "",
        customer_id: r.customer_id ?? null, // ← use if backend returns it
        po_date: r.po_date ?? null,

        part_id: r.part_id ?? null,
        part_no: r.part_no ?? "",
        part_name: r.part_name ?? r.name ?? null,
        part_rev: r.part_rev ?? "",
        part_revision_id: r.part_revision_id ?? null, // ← keep for navigation

        prod_qty: r.planned_qty ?? null,
        qty_po: r.qty_po ?? null,
      }));

      const last_page = showAll
        ? 1
        : Math.max(1, Math.ceil((totalItems || rows.length) / size));
      return { data: rows, last_page };
    },

    columns: [
      {
        title: "No.",
        field: "_rowno",
        width: 60,
        hozAlign: "center",
        headerHozAlign: "right",
        headerSort: false,
        formatter: (cell) => {
          const pos = cell.getRow().getPosition(true);
          const cur = table.getPage() || 1;
          const ps = table.getPageSize();
          const eff =
            ps === true
              ? totalItems || cell.getTable().getDataCount()
              : ps || DEFAULT_PAGE_SIZE;
          return (cur - 1) * eff + pos;
        },
      },
      {
        title: "Customer",
        field: "customer_code",
        minWidth: 110,
        headerSort: true,
      },
      {
        title: "Part No",
        field: "part_no",
        minWidth: 110,
        headerSort: true,
        formatter: (cell) => {
          const d = cell.getData();
          if (!d?.part_id) return safe(cell.getValue() ?? "");
          const href = managePartDetailUrl(
            d.part_id,
            d.part_revision_id,
            d.customer_id
          );
          return `<a class="link" href="${href}">${safe(d.part_no ?? "")}</a>`;
        },
        cellClick: (e, cell) => {
          e.stopPropagation();
          const d = cell.getData();
          if (!d?.part_id) return;
          location.href = managePartDetailUrl(
            d.part_id,
            d.part_revision_id,
            d.customer_id
          );
        },
      },

      {
        title: "Description",
        field: "part_name",
        minWidth: 110,
        headerSort: true,
      },

      { title: "Current Stock", minWidth: 110, headerSort: true },

      { title: "Rework/WIP", minWidth: 110, headerSort: true },
      { title: "Last Update", minWidth: 110, headerSort: true },
      { title: "Ship Date", minWidth: 110, headerSort: true },
      { title: "FAIR/LONG FORM/NOTE", minWidth: 110, headerSort: true },
      { title: "Due Date", minWidth: 110, headerSort: true },
      { title: "Start MFG Date", minWidth: 110, headerSort: true },
      { title: "Shop Traveler Date", minWidth: 110, headerSort: true },
      { title: "Status", minWidth: 110, headerSort: true },
      { title: "Need auto close", minWidth: 110, headerSort: true },
      { title: "Urgent job", minWidth: 110, headerSort: true },
    ],
  });

  // hook resize AFTER built
  table.on("tableBuilt", () => {
    const ro = new ResizeObserver(() => table.redraw(true));
    ro.observe(tableMount);
    window.addEventListener("resize", () => table.redraw(true));
  });
}

/* ---------- bindings (avoid double-requests) ---------- */

// Search → single request via setPage(1)
inputSearch?.addEventListener(
  "input",
  debounce(() => {
    table?.setPage(1);
  }, 250)
);

// Optional external page-size selector
if (selPerPage) {
  selPerPage.value = String(DEFAULT_PAGE_SIZE);
  selPerPage.addEventListener("change", () => {
    const v =
      selPerPage.value === "all"
        ? true
        : Number(selPerPage.value || DEFAULT_PAGE_SIZE);
    table?.setPageSize(v === true ? true : Number(v));
  });
}

btnReload?.addEventListener("click", () => table?.replaceData());

document.addEventListener("DOMContentLoaded", () => {
  // console.log("part");

  initTopbar?.();
  initTable();
});
