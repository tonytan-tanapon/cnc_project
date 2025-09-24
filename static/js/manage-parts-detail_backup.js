// /static/js/manage-parts-detail.js  (v12.6 – header inserted above search)
import { $, jfetch, showToast as toast, initTopbar } from './api.js';

const fmtQty = (v) => (v == null ? '' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 }));
const debounce = (fn, ms=250)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} };

// ---- DOM refs
const tableMount  = $('p_table');
const inputSearch = $('p_q');

let table = null;
const DEFAULT_PAGE_SIZE = 100;

// ---- styles (once)
(() => {
  if (!document.getElementById('tab-foot-right')) {
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
  }
  if (!document.getElementById('part-header-style')) {
    const st = document.createElement('style');
    st.id = 'part-header-style';
    st.textContent = `
      .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.04);margin-bottom:12px}
      .card .hd{padding:12px 14px;border-bottom:1px solid #eef2f7;font-weight:700}
      .card .bd{padding:12px 14px}
      .fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .f .lab{font-size:12px;color:#64748b;margin-bottom:4px}
      .f .val{font-size:16px;font-weight:600}
    `;
    document.head.appendChild(st);
  }
})();

// ---- QS helpers
function qsParams(){
  const usp = new URLSearchParams(location.search);
  const part_id          = usp.get('part_id') ? Number(usp.get('part_id')) : null;
  const customer_id      = usp.get('customer_id') ? Number(usp.get('customer_id')) : null;
  const part_revision_id = (usp.get('part_revision_id') ?? usp.get('revision_id'));
  return {
    part_id,
    customer_id,
    part_revision_id: part_revision_id ? Number(part_revision_id) : null,
  };
}
function buildQS(params){
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k,v])=>{
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  });
  return usp.toString();
}

// ---- inject the header ABOVE THE SEARCH (or its .toolbar)
function ensureHeaderCard(){
  // If it already exists, do nothing
  let wrap = document.getElementById('p_header');
  if (wrap) return wrap;

  wrap = document.createElement('div');
  wrap.id = 'p_header';
  wrap.className = 'card';
  wrap.innerHTML = `
    <div class="hd">Part</div>
    <div class="bd">
      <div class="fields">
        <div class="f"><div class="lab">Part No</div>   <div id="h_part_no"   class="val">—</div></div>
        <div class="f"><div class="lab">Part Name</div> <div id="h_part_name" class="val">—</div></div>
        <div class="f"><div class="lab">Revision</div>  <div id="h_part_rev"  class="val">—</div></div>
        <div class="f"><div class="lab">Customer</div>  <div id="h_customer"  class="val">—</div></div>
      </div>
    </div>
  `;

  // Find the best anchor: toolbar containing the search, or the search input itself
  const anchor =
    inputSearch?.closest('.toolbar') ||
    inputSearch ||
    tableMount; // fallback

  if (anchor?.parentNode) {
    anchor.parentNode.insertBefore(wrap, anchor); // <-- insert header BEFORE search area
  } else if (tableMount?.parentNode) {
    tableMount.parentNode.insertBefore(wrap, tableMount);
  } else {
    document.body.prepend(wrap);
  }
  return wrap;
}

// ---- fill header data
async function loadHeader(){
  ensureHeaderCard();
  const { part_id, part_revision_id, customer_id } = qsParams();

  const elPartNo   = document.getElementById('h_part_no');
  const elPartName = document.getElementById('h_part_name');
  const elPartRev  = document.getElementById('h_part_rev');
  const elCust     = document.getElementById('h_customer');

  let part = null;
  try { if (part_id) part = await jfetch(`/parts/${part_id}`); } catch {}
  elPartNo.textContent   = part?.part_no ?? '—';
  elPartName.textContent = part?.name ?? '—';

  let revText = '';
  if (part_id){
    try{
      const revs = await jfetch(`/parts/${part_id}/revisions`);
      const list = Array.isArray(revs) ? revs : [];
      const exact   = part_revision_id ? list.find(r => r.id === part_revision_id) : null;
      const current = list.find(r => r.is_current);
      revText = exact?.rev || exact?.code || current?.rev || current?.code || '';
    }catch{}
  }
  elPartRev.textContent = revText || '—';

  let custLabel = '';
  if (customer_id){
    try {
      const c = await jfetch(`/customers/${customer_id}`);
      custLabel = c?.code || c?.name || String(customer_id);
    } catch {
      custLabel = String(customer_id);
    }
  }
  elCust.textContent = custLabel || '—';
}

// ---- rows for table
async function fetchRows(){
  const { part_id, customer_id, part_revision_id } = qsParams();
  if (!part_id || !customer_id){
    toast?.('Missing part_id or customer_id', false);
    return [];
  }
  const qs = buildQS({ part_id, customer_id, revision_id: part_revision_id });
  const res = await jfetch(`/data/detail?${qs}`);
  return Array.isArray(res?.items) ? res.items : [];
}

// ---- Tabulator table
function initTable(){
  if (!tableMount) return;
  table = new Tabulator(tableMount, {
    layout: "fitColumns",
    height: "auto", // global page scrollbar
    placeholder: "No rows",
    index: "lot_no",

    pagination: true,
    paginationMode: "local",
    paginationSize: DEFAULT_PAGE_SIZE,
    paginationSizeSelector: [20, 50, 100, 200, true],
    paginationCounter: "rows",

    columns: [
      { title: "No.", field: "_no", width: 60, hozAlign: "right", headerHozAlign: "right", headerSort: false,
        formatter: (cell) => cell.getRow().getPosition(true)
      },
      { title: "Lot Number", field: "lot_no", minWidth: 110, headerSort: true },
      { title: "PO Number",  field: "po_number", minWidth: 110, headerSort: true },
      { title: "Prod Qty",  field: "aa", minWidth: 110, headerSort: true },
      { title: "PO Date",  field: "po_number", minWidth: 110, headerSort: true },
      { title: "Qty PO",  field: "po_number", minWidth: 110, headerSort: true },
      { title: "Due Date",  field: "po_number", minWidth: 110, headerSort: true },
      { title: "Qty",        field: "qty", width: 110, hozAlign: "right", headerHozAlign: "right",
        formatter: (cell) => fmtQty(cell.getValue())
      },
      { title: "First article No:",  field: "po_number", minWidth: 110, headerSort: true },
    { title: "*Remark Product Control",  field: "po_number", minWidth: 110, headerSort: true },
    { title: "Tracking no.",  field: "po_number", minWidth: 110, headerSort: true },
    { title: "Real Shipped Date",  field: "po_number", minWidth: 110, headerSort: true },
    { title: "INCOMING STOCK",  field: "po_number", minWidth: 110, headerSort: true },
    
    { title: "QA Inspection/AQL",  field: "po_number", minWidth: 110, headerSort: true },
    { title: "Name Inspection" ,  field: "po_number", minWidth: 110, headerSort: true },
    { title: "*Remark (QA Inspection)",  field: "po_number", minWidth: 110, headerSort: true },
    { title: "Rework/Repair",  field: "po_number", minWidth: 110, headerSort: true },
    { title: "*Remark (Rework)",  field: "po_number", minWidth: 110, headerSort: true },
    { title: "Qty Reject",  field: "po_number", minWidth: 110, headerSort: true },
    { title: "*Remark (Reject)",  field: "po_number", minWidth: 110, headerSort: true },
    { title: "Incoming Rework",  field: "po_number", minWidth: 110, headerSort: true },
    { title: "Finish goods in stock",  field: "po_number", minWidth: 110, headerSort: true },
    { title: "Lot Number",  field: "po_number", minWidth: 110, headerSort: true },    
    { title: "",  field: "po_number", minWidth: 110, headerSort: true },
    { title: "PO Number",  field: "po_number", minWidth: 110, headerSort: true }, 
    { title: "Qty Take Out",  field: "po_number", minWidth: 110, headerSort: true }, 
    { title: "Date Take Out Stock",  field: "po_number", minWidth: 110, headerSort: true }, 
    { title: "WIP	WIP Cont.",  field: "po_number", minWidth: 110, headerSort: true }, 
    { title: "QTY Rework",  field: "po_number", minWidth: 110, headerSort: true }, 
    { title: "Green Tag No.",  field: "po_number", minWidth: 110, headerSort: true }, 
    { title: "Rework w/Lot",  field: "po_number", minWidth: 110, headerSort: true }, 
    { title: "QTY Prod",  field: "po_number", minWidth: 110, headerSort: true }, 
    { title: "QTY Shipped",  field: "po_number", minWidth: 110, headerSort: true }, 
    { title: "Residual",  field: "po_number", minWidth: 110, headerSort: true }, 
    { title: "QTY Use",  field: "po_number", minWidth: 110, headerSort: true }, 

    // 							 	QTY Use	Balance	Scrap Later	From Lot	ST Status	Note	Date
																																						
    ],

  });

  table.on("tableBuilt", () => {
    const ro = new ResizeObserver(() => table.redraw(true));
    ro.observe(tableMount);
    window.addEventListener("resize", () => table.redraw(true));
  });
}

// ---- load
async function loadData(){
  try{
    await loadHeader();
    const rows = await fetchRows();
    table?.setData(rows);
    if (inputSearch?.value) applySearch(inputSearch.value);
  }catch(e){
    toast?.(e?.message || 'Load failed', false);
  }
}

// ---- search
function applySearch(q){
  if (!table) return;
  const s = (q || '').trim().toUpperCase();
  if (!s) { table.clearFilter(true); return; }
  table.setFilter((data) =>
    String(data.lot_no || '').toUpperCase().includes(s) ||
    String(data.po_number || '').toUpperCase().includes(s)
  );
}

/* ---------- boot ---------- */
inputSearch?.addEventListener('input', debounce(() => applySearch(inputSearch.value), 250));

document.addEventListener('DOMContentLoaded', async () => {
  initTopbar?.();
  initTable();
  await loadData();
});
