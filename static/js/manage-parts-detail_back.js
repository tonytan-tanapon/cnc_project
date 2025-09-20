// /static/js/page-parts.js  (v12 – Lot/PO/Qty view; local pagination; pager on right)
import { $, jfetch, showToast as toast, initTopbar } from './api.js';

const esc = (s) => String(s ?? '')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#39;');

const fmtQty = (v) => (v == null ? '' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 }));
const debounce = (fn, ms=250)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} };

// ---- DOM
const inputSearch = $('p_q');          // optional search input
const selPerPage  = $('p_per_page');   // optional external page-size select
const tableMount  = $('p_table');
const btnReload   = $('p_reload');

let table = null;
const DEFAULT_PAGE_SIZE = true;

// ---- Right-align Tabulator footer (pager + size)
(() => {
  if (document.getElementById('tab-foot-right')) return;
  const st = document.createElement('style');
  st.id = 'tab-foot-right';
  st.textContent = `
    .tabulator .tabulator-footer{
      display:flex;align-items:center;justify-content:flex-end;gap:10px
    }
    .tabulator .tabulator-footer .tabulator-paginator{order:1}
    .tabulator .tabulator-footer .tabulator-page-size{order:2}
    .tabulator .tabulator-footer .tabulator-page-size select{width:84px;height:28px;padding:2px 6px}
  `;
  document.head.appendChild(st);
})();

// ---- Build QS for endpoint
function buildQS(params){
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k,v])=>{
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  });
  return usp.toString();
}

// ---- Fetch rows: /data/lots/by-part-customer-rev -> {items:[{lot_no,po_number,qty}], count}
async function fetchRows() {
  const usp = new URLSearchParams(location.search);
  const part_id         = Number(usp.get('part_id')) || null;
  const customer_id     = Number(usp.get('customer_id')) || null;
  const part_revision_id= Number(usp.get('part_revision_id')) || Number(usp.get('revision_id')) || null;

  if (!part_id || !customer_id) {
    toast?.('Missing part_id or customer_id', false);
    return [];
  }

  const qs = buildQS({ part_id, customer_id, revision_id: part_revision_id });
  const res = await jfetch(`/data/detail?${qs}`);
  return Array.isArray(res?.items) ? res.items : [];
}

// ---- Init Tabulator (local pagination)
function initTable(){
  if (!tableMount) return;

  table = new Tabulator(tableMount, {
    layout: "fitColumns",
    height: "80vh",
    placeholder: "No rows",
    index: "lot_no",

    pagination: true,
    paginationMode: "local",
    paginationSize: DEFAULT_PAGE_SIZE,
    paginationSizeSelector: [20, 50, 100, 200, true],   // true = "All"
    paginationCounter: "rows",

    columns: [
      { title: "No.", field: "_no", width: 70, hozAlign: "right", headerHozAlign: "right", headerSort: false,
        formatter: (cell) => cell.getRow().getPosition(true)
      },
      { title: "Lot Number", field: "lot_no", minWidth: 150, headerSort: true },
      { title: "PO Number",  field: "po_number", minWidth: 150, headerSort: true },
      { title: "Qty",        field: "qty", width: 120, hozAlign: "right", headerHozAlign: "right",
        formatter: (cell) => fmtQty(cell.getValue())
      },
    ],
  });

  // After built: wire resize observers
  table.on("tableBuilt", () => {
    const ro = new ResizeObserver(() => table.redraw(true));
    ro.observe(tableMount);
    window.addEventListener("resize", () => table.redraw(true));
  });
}

// ---- Load + fill data (single call; local pagination handles paging)
async function loadData(){
  try {
    const rows = await fetchRows();
    table?.setData(rows);
    // apply current search if present
    if (inputSearch?.value) applySearch(inputSearch.value);
  } catch (e) {
    toast?.(e?.message || 'Load failed', false);
  }
}

// ---- Client-side search over lot_no / po_number
function applySearch(q){
  if (!table) return;
  const s = (q || '').trim().toUpperCase();
  if (!s) {
    table.clearFilter(true);
    return;
  }
  table.setFilter((data) => {
    return (String(data.lot_no || '').toUpperCase().includes(s) ||
            String(data.po_number || '').toUpperCase().includes(s));
  });
}

/* ---------- bindings ---------- */
inputSearch?.addEventListener('input', debounce(() => applySearch(inputSearch.value), 250));

if (selPerPage){
  selPerPage.value = String(DEFAULT_PAGE_SIZE);
  selPerPage.addEventListener('change', () => {
    const v = selPerPage.value === 'all' ? true : Number(selPerPage.value || DEFAULT_PAGE_SIZE);
    table?.setPageSize(v === true ? true : Number(v));
  });
}

btnReload?.addEventListener('click', () => loadData());

document.addEventListener('DOMContentLoaded', async () => {
  initTopbar?.();
  initTable();
  await loadData();
});
