// /static/js/manage-parts-lots.js
import { jfetch, showToast as toast, initTopbar } from "./api.js";

/* ========= STATE ========= */
let page = 1;
let loading = false;
let done = false;
let sortBy = "lot_id"; // default
let sortDir = "asc";
let searchText = "";
let totalLoaded = 0;

const T_BODY = document.getElementById("p_tbody");
const WRAP = document.querySelector("#p_table .lot-table-scroll");
const LOADING_UI = document.getElementById("p_loading");
const STATUS_UI = document.getElementById("p_status");
const SEARCH_INPUT = document.getElementById("p_q");

/* ========= HELPERS ========= */
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

function fmtQty(v) {
  if (v == null) return "";
  return Number(v).toLocaleString(undefined, {
    maximumFractionDigits: 3,
  });
}

function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function updateStatus(text) {
  if (STATUS_UI) STATUS_UI.textContent = text;
}

/* ========= API CALL ========= */
async function loadMore() {
  if (loading || done) return;
  loading = true;
  LOADING_UI.style.display = "inline";

  try {
    const usp = new URLSearchParams({
      page: String(page),
      size: "200",
      sort_by: sortBy,
      sort_dir: sortDir,
    });

    if (searchText) usp.set("q", searchText);

    const res = await jfetch(`/api/v1/lot-summary?${usp}`);
    console.log(res);
    const items = res?.items || [];

    if (!items.length) {
      if (page === 1 && totalLoaded === 0) {
        updateStatus("No rows");
      }
      done = true;
      return;
    }
    console.log(items);
    appendRows(items);
    totalLoaded += items.length;
    page += 1;

    updateStatus(`Loaded ${totalLoaded.toLocaleString()} rows`);
  } catch (err) {
    console.error(err);
    toast?.("Failed to load data", false);
    if (page === 1 && totalLoaded === 0) {
      updateStatus("Error loading data");
    }
    done = true;
  } finally {
    loading = false;
    LOADING_UI.style.display = "none";
  }
}

/* ========= RENDER ========= */

function appendRows(items) {
  const frag = document.createDocumentFragment();

  for (const r of items) {
    const tr = document.createElement("tr");

    // รองรับ field จาก v_lot_summary (ดูจาก normalizer เดิม)
    const lotCreated = r.lot_created ?? r.created_at ?? null;
    const poCreated = r.lot_po_date ?? null;
    const lotQty = r.lot_qty ?? r.qty ?? null;
    const poQty = r.po_qty ?? r.qty ?? null;

    const poId = r.po_id;
    const poNumber = r.po_number ?? "";

    const partId = r.part_id;
    const customerId = r.customer_id;
    const partNo = r.part_no ?? "";
    const lotId = r.lot_id;
    const travelerId = r.traveler_id;

    tr.innerHTML = `
      <td>${fmtDate(poCreated)}</td>
      <td>${r.customer_code ?? ""}</td>
      
      <td>${r.lot_no ?? ""}</td>

      <td class="lot-links">
        ${
          poId
            ? `<a href="/static/manage-pos-detail.html?id=${poId}">${poNumber}</a>`
            : poNumber || "—"
        }
      </td>

      <td class="lot-links">
        ${
          partId
            ? `<a href="/static/manage-part-detail.html?part_id=${partId}&customer_id=${
                customerId ?? ""
              }">
                 ${partNo || "—"}
               </a>`
            : partNo || "—"
        }
      </td>

      <td>${r.part_name ?? ""}</td>
      <td>${r.revision_code ?? ""}</td>

      <td>${fmtDate(lotCreated)}</td>
      <td>${fmtDate(r.lot_due_date)}</td>
      <td style="text-align:right">${fmtQty(lotQty)}</td>

      <td>${fmtDate(r.po_due_date)}</td>
      <td style="text-align:right">${fmtQty(poQty)}</td>

      <td>${fmtDate(r.ship_date)}</td>
      <td style="text-align:right">${fmtQty(r.ship_qty)}</td>

      
      <td class="lot-links">
        ${
          travelerId
            ? `<a href="/static/traveler-detail.html?lot_id=${lotId}">Traveler</a>`
            : "—"
        }
      </td>
      

      <td class="lot-links">
        ${
          lotId
            ? `<a href="/static/manage-lot-materials.html?lot_id=${lotId}">Materials</a>`
            : "—"
        }
      </td>

      <td class="lot-links">
        ${
          lotId
            ? `<a href="/static/manage-lot-shippments.html?lot_id=${lotId}">Shipments</a>`
            : "—"
        }
      </td>
    `;

    frag.appendChild(tr);
  }

  T_BODY.appendChild(frag);
}

/* ========= SCROLL (INFINITE) ========= */

WRAP.addEventListener("scroll", () => {
  const { scrollTop, scrollHeight, clientHeight } = WRAP;
  if (scrollTop + clientHeight >= scrollHeight - 200) {
    loadMore();
  }
});

/* ========= SORT ========= */

function clearSortClasses() {
  document
    .querySelectorAll("thead th.sortable")
    .forEach((th) => th.classList.remove("sort-asc", "sort-desc"));
}

document.querySelectorAll("thead th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    const col = th.dataset.sort;
    if (!col) return;

    if (sortBy === col) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortBy = col;
      sortDir = "asc";
    }

    clearSortClasses();
    th.classList.add(sortDir === "asc" ? "sort-asc" : "sort-desc");

    resetAndLoad();
  });
});

/* ========= SEARCH ========= */

const onSearchInput = debounce((e) => {
  searchText = e.target.value.trim();
  resetAndLoad();
}, 300);

SEARCH_INPUT?.addEventListener("input", onSearchInput);

/* ========= RESET ========= */

function resetAndLoad() {
  page = 1;
  done = false;
  totalLoaded = 0;
  T_BODY.innerHTML = "";
  updateStatus("Loading…");
  loadMore();
}
/* ========= COLUMN RESIZE ========= */
function enableColumnResize() {
  document.querySelectorAll("th.resizable").forEach((th) => {
    const handle = document.createElement("div");
    handle.className = "resize-handle";
    th.appendChild(handle);

    let startX = 0;
    let startWidth = 0;

    handle.addEventListener("mousedown", (e) => {
      startX = e.clientX;
      startWidth = th.offsetWidth;

      document.documentElement.style.userSelect = "none";

      const onMouseMove = (eMove) => {
        const newWidth = startWidth + (eMove.clientX - startX);
        if (newWidth > 40) {
          th.style.width = newWidth + "px";

          // fix all TD in this column
          const index = Array.from(th.parentElement.children).indexOf(th);
          document
            .querySelectorAll(`#p_tbody tr td:nth-child(${index + 1})`)
            .forEach((td) => {
              td.style.width = newWidth + "px";
            });
        }
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.documentElement.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTopbar?.();
  enableColumnResize(); // เปิดให้คอลัมน์ขยายได้
  updateStatus("Loading…");
  loadMore();
});
