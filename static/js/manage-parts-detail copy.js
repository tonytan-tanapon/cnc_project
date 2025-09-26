// /static/js/manage-parts-detail.js  (v22 — preload + save selections by ID)
import { $, jfetch, showToast as toast, initTopbar } from './api.js';

const fmtQty = (v) => (v == null ? '' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 }));
const debounce = (fn, ms=300)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} };
const sortAlpha = (arr, key) => [...arr].sort((a, b) =>
  (key ? a[key] : a).localeCompare((key ? b[key] : b), undefined, { numeric: true, sensitivity: 'base' })
);

// ---- DOM refs
const tableMount  = $('p_table');
const inputSearch = $('p_q');

let table = null;
let currentSearch = '';
let allRows = [];

let lookups = {
  processes: [], // [{id, code, name}]
  finishes:  [], // [{id, code, name}]
};
let idCutting = null;
let idHeat    = null;

const fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? '' : d.toLocaleDateString();
};

// ---- styles (once)
(() => {
  if (!document.getElementById('parts-detail-styles')) {
    const st = document.createElement('style');
    st.id = 'parts-detail-styles';
    st.textContent = `
      .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.04);margin-bottom:12px}
      .card .hd{padding:12px 14px;border-bottom:1px solid #eef2f7;font-weight:700}
      .card .bd{padding:12px 14px}
      .fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .f .lab{font-size:12px;color:#64748b;margin-bottom:4px}
      .f .val{font-size:16px;font-weight:600}
      .filters{display:flex;flex-wrap:wrap;align-items:center;gap:16px}
      .fg{border:none;padding:0;background:transparent}
      .ttl-inline{font-weight:700;margin-right:8px;font-size:13px;color:#0f172a}
      .chips{display:flex;flex-wrap:wrap;gap:14px;align-items:center}
      .chip{display:inline-flex;align-items:center;gap:6px;padding:0;margin:0;background:transparent;border:none;white-space:nowrap}
      .chip input{margin-right:6px}
      .fg input[type="text"]{width:320px;max-width:40vw;height:32px;border:1px solid #e5e7eb;border-radius:8px;padding:4px 8px}
      .tabulator .tabulator-footer{display:none}
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
  return { part_id, customer_id, part_revision_id: part_revision_id ? Number(part_revision_id) : null };
}
function buildQS(params){
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k,v])=>{ if (v !== undefined && v !== null && v !== '') usp.set(k, String(v)); });
  return usp.toString();
}

// ---- header & filters scaffold
function ensureHeaderCard(){
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
    <div class="hd">Filters</div>
    <div class="bd">
      <div id="filters_panel" class="filters">
        <!-- Cutting & Heat -->
        <div class="fg" id="fg_basic">
          <div class="chips">
            <label class="chip"><input type="checkbox" id="g_cutting"><span>Cutting</span></label>
            <label class="chip"><input type="checkbox" id="g_heat"><span>Heat Treating & Stress Relieve</span></label>
          </div>
        </div>
        <!-- Manufacturing Processes group -->
        <div class="fg" id="fg_mproc">
          <div class="chips">
            <span class="ttl-inline">Manufacturing Processes</span>
            <span id="g_mproc"></span>
          </div>
        </div>
        <!-- Chemical Finishing group -->
        <div class="fg" id="fg_chem">
          <div class="chips">
            <span class="ttl-inline">Chemical Finishing</span>
            <span id="g_chem"></span>
          </div>
        </div>
        <!-- Other -->
        <div class="fg" id="fg_other">
          <div class="chips">
            <span class="ttl-inline">Other</span>
            <input type="text" id="g_other_text" placeholder="Type other process / keyword..." />
          </div>
        </div>
      </div>
    </div>
  `;

  const anchor = inputSearch?.closest('.toolbar') || inputSearch || tableMount;
  if (anchor?.parentNode) anchor.parentNode.insertBefore(wrap, anchor);
  else if (tableMount?.parentNode) tableMount.parentNode.insertBefore(wrap, tableMount);
  else document.body.prepend(wrap);
  return wrap;
}

// ---- lookups (fetch IDs)
async function fetchLookups(){
  const [procs, fins] = await Promise.all([
    jfetch('/lookups/processes'),
    jfetch('/lookups/finishes'),
  ]);
  lookups.processes = sortAlpha(procs?.items || [], 'name');
  lookups.finishes  = sortAlpha(fins?.items || [], 'name');

  // find IDs for "Cutting" and "Heat Treating & Stress Relieve"
  idCutting = (lookups.processes.find(p => p.name === 'Cutting') || {}).id || null;
  idHeat    = (lookups.processes.find(p => p.name === 'Heat Treating & Stress Relieve') || {}).id || null;
}

// ---- render filters with data-id attributes (so we can save by ID)
function renderFilters(){
  const elMproc = document.getElementById('g_mproc');
  const elChem  = document.getElementById('g_chem');
  const cbCut   = document.getElementById('g_cutting');
  const cbHeat  = document.getElementById('g_heat');

  // set ids on basic checkboxes
  if (cbCut)  cbCut.dataset.id  = idCutting ?? '';
  if (cbHeat) cbHeat.dataset.id = idHeat ?? '';

  // manufacturing: all processes except the two basics
  const mprocs = lookups.processes.filter(p => p.id !== idCutting && p.id !== idHeat);
  elMproc.innerHTML = '';
  for (const p of mprocs) {
    const l = document.createElement('label');
    l.className = 'chip';
    l.innerHTML = `<input type="checkbox" data-id="${p.id}" data-kind="process"><span>${p.name}</span>`;
    elMproc.appendChild(l);
  }

  // chemical finishing
  elChem.innerHTML = '';
  for (const f of lookups.finishes) {
    const l = document.createElement('label');
    l.className = 'chip';
    l.innerHTML = `<input type="checkbox" data-id="${f.id}" data-kind="finish"><span>${f.name}</span>`;
    elChem.appendChild(l);
  }

  // wire saving
  const saveNow = debounce(saveSelectionsToDB, 200);
  [elMproc, elChem].forEach(el => el.addEventListener('change', () => { applyFiltersToTable(); saveNow(); }));
  cbCut?.addEventListener('change', () => { applyFiltersToTable(); saveNow(); });
  cbHeat?.addEventListener('change', () => { applyFiltersToTable(); saveNow(); });
  document.getElementById('g_other_text')?.addEventListener('input', debounce(() => { applyFiltersToTable(); saveSelectionsToDB(); }, 400));
}

// ---- preload saved selections (GET /part-selections/{part_id})
async function preloadSelectionsIntoUI(){
  const { part_id } = qsParams();
  if (!part_id) return;

  try{
    const data = await jfetch(`/part-selections/${part_id}`); // { process_ids:[], finish_ids:[], others:[] }

    // basics
    if (idCutting && data.process_ids?.includes(idCutting)) {
      const cb = document.getElementById('g_cutting');
      if (cb) cb.checked = true;
    }
    if (idHeat && data.process_ids?.includes(idHeat)) {
      const cb = document.getElementById('g_heat');
      if (cb) cb.checked = true;
    }

    // processes
    const elMproc = document.getElementById('g_mproc');
    data.process_ids?.forEach(pid => {
      if (pid === idCutting || pid === idHeat) return;
      const inp = elMproc?.querySelector(`input[type=checkbox][data-id="${pid}"]`);
      if (inp) inp.checked = true;
    });

    // finishes
    const elChem = document.getElementById('g_chem');
    data.finish_ids?.forEach(fid => {
      const inp = elChem?.querySelector(`input[type=checkbox][data-id="${fid}"]`);
      if (inp) inp.checked = true;
    });

    // other (first value)
    const otherTxt = document.getElementById('g_other_text');
    if (otherTxt && Array.isArray(data.others) && data.others.length) {
      otherTxt.value = data.others[0];
    }
  }catch(e){
    console.warn('Preload selections failed', e);
  }
}

// ---- persist selections (POST /part-selections/{part_id})
async function saveSelectionsToDB(){
  const { part_id } = qsParams();
  if (!part_id) return;

  // collect selected IDs
  const elMproc = document.getElementById('g_mproc');
  const elChem  = document.getElementById('g_chem');
  const cbCut   = document.getElementById('g_cutting');
  const cbHeat  = document.getElementById('g_heat');
  const otherTxt= document.getElementById('g_other_text');

  const procIds = new Set();
  const finIds  = new Set();

  // basics
  if (cbCut?.checked && cbCut.dataset.id)  procIds.add(Number(cbCut.dataset.id));
  if (cbHeat?.checked && cbHeat.dataset.id) procIds.add(Number(cbHeat.dataset.id));

  // manufacturing
  elMproc?.querySelectorAll('input[type=checkbox]:checked').forEach(cb => {
    const id = Number(cb.dataset.id);
    if (id) procIds.add(id);
  });

  // chemical
  elChem?.querySelectorAll('input[type=checkbox]:checked').forEach(cb => {
    const id = Number(cb.dataset.id);
    if (id) finIds.add(id);
  });

  const payload = {
    process_ids: [...procIds],
    finish_ids:  [...finIds],
    others:      (otherTxt?.value || '').trim() ? [otherTxt.value.trim()] : [],
  };

  try{
    await jfetch(`/part-selections/${part_id}`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload),
    });
    // toast?.('Saved', true); // optional
  }catch(e){
    toast?.('Failed to save selections: ' + (e?.message || ''), false);
  }
}

// ---- simple local filter (does not hit DB)
function applyFiltersToTable(){
  if (!table) return;
  const search = (inputSearch?.value || '').trim().toLowerCase();
  let rows = allRows;
  if (search) {
    rows = rows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(search)));
  }
  table.setData(rows);
}

// ---- fetch rows & meta
async function fetchDetail(){
  const { part_id, customer_id, part_revision_id } = qsParams();
  if (!part_id || !customer_id){
    toast?.('Missing part_id or customer_id', false);
    return { items: [], meta: null };
  }
  const qs = buildQS({
    view: 'detail',
    part_id,
    customer_id,
    revision_id: part_revision_id ?? undefined,
  });
  const res = await jfetch(`/data_detail?${qs}`);
  const items = Array.isArray(res?.items) ? res.items : [];
  const meta  = res?.meta ?? null;
  return { items, meta };
}

// ---- Tabulator
function initTable(){
  if (!tableMount) return;
  /* global Tabulator */
  table = new Tabulator(tableMount, {
    layout: "fitColumns",
    height: "auto",
    placeholder: "No rows",
    index: "lot_no",
    pagination: false,
    columns: [
      { title: "No.", field: "_no", width: 60, hozAlign: "right", headerHozAlign: "right", headerSort: false,
        formatter: (cell) => cell.getRow().getPosition(true)
      },
      { title: "Lot Number", field: "lot_no", minWidth: 110, headerSort: true },
      { title: "PO Number",  field: "po_number", minWidth: 110, headerSort: true },
      { title: "Prod Qty",  field: "lot_qty", width: 110, hozAlign: "right", headerHozAlign: "right",
        formatter: (cell) => fmtQty(cell.getValue())
      },
      { title: "PO Date",   field: "po_due_date", minWidth: 130, sorter: "date",
        formatter: (cell) => fmtDate(cell.getValue())
      },
      { title: "Qty PO",   field: "qty", width: 110, hozAlign: "right", headerHozAlign: "right",
        formatter: (cell) => fmtQty(cell.getValue())
      },
      { title: "Due Date", field: "lot_due_date", minWidth: 130, sorter: "date",
        formatter: (cell) => fmtDate(cell.getValue())
      },
      { title: "Qty", field: "qty", width: 110, hozAlign: "right", headerHozAlign: "right",
        formatter: (cell) => fmtQty(cell.getValue())
      },
      // placeholders...
      { title: "First article No:", field: "", minWidth: 140, headerSort: false, formatter: ()=>"" },
      { title: "*Remark Product Control", field: "", minWidth: 180, headerSort: false, formatter: ()=>"" },
      { title: "Tracking no.", field: "", minWidth: 130, headerSort: false, formatter: ()=>"" },
      { title: "Real Shipped Date", field: "", minWidth: 150, headerSort: false, formatter: ()=>"" },
      { title: "INCOMING STOCK", field: "", minWidth: 140, headerSort: false, formatter: ()=>"" },
      { title: "QA Inspection/AQL", field: "", minWidth: 150, headerSort: false, formatter: ()=>"" },
      { title: "Name Inspection", field: "", minWidth: 140, headerSort: false, formatter: ()=>"" },
      { title: "*Remark (QA Inspection)", field: "", minWidth: 180, headerSort: false, formatter: ()=>"" },
      { title: "Rework/Repair", field: "", minWidth: 130, headerSort: false, formatter: ()=>"" },
      { title: "*Remark (Rework)", field: "", minWidth: 150, headerSort: false, formatter: ()=>"" },
      { title: "Qty Reject", field: "", minWidth: 120, headerSort: false, formatter: ()=>"" },
      { title: "*Remark (Reject)", field: "", minWidth: 150, headerSort: false, formatter: ()=>"" },
      { title: "Incoming Rework", field: "", minWidth: 150, headerSort: false, formatter: ()=>"" },
      { title: "Finish goods in stock", field: "", minWidth: 190, headerSort: false, formatter: ()=>"" },
      { title: "Qty Take Out", field: "", minWidth: 130, headerSort: false, formatter: ()=>"" },
      { title: "Date Take Out Stock", field: "", minWidth: 170, headerSort: false, formatter: ()=>"" },
      { title: "WIP\tWIP Cont.", field: "", minWidth: 140, headerSort: false, formatter: ()=>"" },
      { title: "QTY Rework", field: "", minWidth: 120, headerSort: false, formatter: ()=>"" },
      { title: "Green Tag No.", field: "", minWidth: 140, headerSort: false, formatter: ()=>"" },
      { title: "Rework w/Lot", field: "", minWidth: 140, headerSort: false, formatter: ()=>"" },
      { title: "QTY Prod", field: "", minWidth: 110, headerSort: false, formatter: ()=>"" },
      { title: "QTY Shipped", field: "", minWidth: 130, headerSort: false, formatter: ()=>"" },
      { title: "Residual", field: "", minWidth: 110, headerSort: false, formatter: ()=>"" },
      { title: "QTY Use", field: "", minWidth: 110, headerSort: false, formatter: ()=>"" },
    ],
  });
}

// ---- load header meta (no side-effects)
function fillHeaderMeta(meta){
  const elPartNo   = document.getElementById('h_part_no');
  const elPartName = document.getElementById('h_part_name');
  const elPartRev  = document.getElementById('h_part_rev');
  const elCust     = document.getElementById('h_customer');
  const p = meta?.part || {};
  const r = meta?.revision || {};
  const c = meta?.customer || {};
  elPartNo.textContent   = p.part_no ?? '—';
  elPartName.textContent = p.name ?? '—';
  elPartRev.textContent  = r.rev ?? '—';
  elCust.textContent     = c.code || c.name || '—';
}

// ---- load
async function loadData(){
  const { items, meta } = await fetchDetail();
  allRows = items;
  fillHeaderMeta(meta);
  table?.setData(items);
  applyFiltersToTable();
}

// ---- search
function onSearchChange(){
  currentSearch = (inputSearch?.value || '').trim();
  applyFiltersToTable();
}

/* ---------- boot ---------- */
inputSearch?.addEventListener('input', debounce(onSearchChange, 250));

document.addEventListener('DOMContentLoaded', async () => {
  console.log("part-deatil")
  initTopbar?.();
  ensureHeaderCard();
  initTable();
  try{
    await fetchLookups();      // 1) get IDs
    renderFilters();           // 2) render checkboxes with data-id
    await loadData();          // 3) table + header
    await preloadSelectionsIntoUI(); // 4) pre-check boxes from DB
  }catch(e){
    toast?.(e?.message || 'Init failed', false);
  }
});
