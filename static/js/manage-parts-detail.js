// /static/js/manage-parts-detail.js  (v20 — local filtering wired, optional PO Due column)
import { $, jfetch, showToast as toast, initTopbar } from './api.js';

const fmtQty = (v) => (v == null ? '' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 }));
const debounce = (fn, ms=250)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} };
// put near the top of the file
const sortAlpha = (arr) => [...arr].sort((a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
);

// ---- DOM refs
const tableMount  = $('p_table');
const inputSearch = $('p_q');

let table = null;
let currentSearch = '';
let allRows = []; // NEW: keep original rows for local filtering

const fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? '' : d.toLocaleDateString(); // or toLocaleString() if you want time
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

      /* ALL FILTERS INLINE */
      .filters{display:flex;flex-wrap:wrap;align-items:center;gap:16px}
      .fg{border:none;padding:0;background:transparent}
      .ttl-inline{font-weight:700;margin-right:8px;font-size:13px;color:#0f172a}
      .chips{display:flex;flex-wrap:wrap;gap:14px;align-items:center}

      /* minimalist checkboxes: no chip borders, no wrap */
      .chip{
        display:inline-flex;align-items:center;gap:6px;padding:0;margin:0;background:transparent;border:none;
        white-space: nowrap; flex-wrap: nowrap;
      }
      .chip input{margin-right:6px}
      .chip span{ white-space: inherit; }

      .btnlink{border:none;background:transparent;color:#2563eb;cursor:pointer;font-size:12px;padding:0 6px}
      .btnlink:hover{color:#1d4ed8;text-decoration:underline}

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

        <!-- Cutting & Heat: plain inline checkboxes -->
        <div class="fg" id="fg_basic">
          <div class="chips">
            <label class="chip"><input type="checkbox" id="g_cutting" value="Cutting"><span>Cutting</span></label>
            <label class="chip"><input type="checkbox" id="g_heat" value="Heat Treating & Stress Relieve"><span>Heat Treating & Stress Relieve</span></label>
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

  const anchor =
    inputSearch?.closest('.toolbar') ||
    inputSearch ||
    tableMount;

  if (anchor?.parentNode) {
    anchor.parentNode.insertBefore(wrap, anchor);
  } else if (tableMount?.parentNode) {
    tableMount.parentNode.insertBefore(wrap, tableMount);
  } else {
    document.body.prepend(wrap);
  }
  return wrap;
}

// ---- fill header meta (filters are static)
function fillHeaderMeta(meta){
  ensureHeaderCard();
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

  setupStaticFilters();
}

// ---- static filters
function setupStaticFilters(){
  ensureHeaderCard();

  const byId = (id)=>document.getElementById(id);
  const elMproc = byId('g_mproc');
  const elChem  = byId('g_chem');
  const btnMAll = byId('btn_mproc_all');
  const btnMNon = byId('btn_mproc_none');
  const btnCAll = byId('btn_chem_all');
  const btnCNon = byId('btn_chem_none');
  const cbCut   = byId('g_cutting');
  const cbHeat  = byId('g_heat');
  const otherTxt= byId('g_other_text');

  const manufacturing = sortAlpha([
    'Gear Cutting','Double Disc','Honing','Grinding','Gun drilling',
    'Broaching','Marking','Thread rolling'
  ]);

  const chemical = sortAlpha([
    'Anodize','Chem Film','Coating Processes','Magnetic Particle Inspection',
    'Passivate','Plating','Prime & Paint'
  ]);

  const makeChip = (value) => {
    const l = document.createElement('label');
    l.className = 'chip';
    l.innerHTML = `<input type="checkbox" value="${value}"><span>${value}</span>`;
    return l;
  };

  elMproc.innerHTML = '';
  manufacturing.forEach(v => elMproc.appendChild(makeChip(v)));
  elChem.innerHTML = '';
  chemical.forEach(v => elChem.appendChild(makeChip(v)));

  const toggleAll = (wrap, checked) => {
    wrap.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = !!checked; });
  };
  const getChecked = (wrap) => Array.from(wrap.querySelectorAll('input[type=checkbox]:checked')).map(i=>i.value);

  btnMAll?.addEventListener('click', ()=>{ toggleAll(elMproc, true); applyFiltersToTable(); });
  btnMNon?.addEventListener('click', ()=>{ toggleAll(elMproc, false); applyFiltersToTable(); });
  btnCAll?.addEventListener('click', ()=>{ toggleAll(elChem, true); applyFiltersToTable(); });
  btnCNon?.addEventListener('click', ()=>{ toggleAll(elChem, false); applyFiltersToTable(); });

  [elMproc, elChem].forEach(el => el.addEventListener('change', applyFiltersToTable));
  cbCut?.addEventListener('change', applyFiltersToTable);
  cbHeat?.addEventListener('change', applyFiltersToTable);
  otherTxt?.addEventListener('input', debounce(applyFiltersToTable, 200));

  window.getPartsDetailFilters = () => ({
    cutting: !!cbCut?.checked,
    heat:    !!cbHeat?.checked,
    mprocs:  getChecked(elMproc),
    chemical:getChecked(elChem),
    other:   (otherTxt?.value || '').trim()
  });

  applyFiltersToTable();
}

// ---- filtering (local only; combines search + filters)
function applyFiltersToTable(){
  // update date to database 
}

// ---- fetch rows & meta (show ALL rows; no pagination)
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
  console.log(items)
  const meta  = res?.meta ?? null;
  return { items, meta };
}

// ---- Tabulator table (pagination disabled so ALL API rows are visible)
function initTable(){
  if (!tableMount) return;
  table = new Tabulator(tableMount, {
    layout: "fitColumns",
    height: "auto",
    placeholder: "No rows",
    index: "lot_no",

    pagination: false, // show ALL rows

    columns: [
      { title: "No.", field: "_no", width: 60, hozAlign: "right", headerHozAlign: "right", headerSort: false,
        formatter: (cell) => cell.getRow().getPosition(true)
      },
      { title: "Lot Number", field: "lot_no", minWidth: 110, headerSort: true },
      { title: "PO Number",  field: "po_number", minWidth: 110, headerSort: true },

      // keep your placeholders
      { title: "Prod Qty",  field: "lot_qty", width: 110, hozAlign: "right", headerHozAlign: "right",
        formatter: (cell) => fmtQty(cell.getValue())
      },
      { title: "PO Date",   field: "po_due_date", minWidth: 130, sorter: "date",
        formatter: (cell) => fmtDate(cell.getValue())
      },
      { title: "Qty PO",   field: "qty", width: 110, hozAlign: "right", headerHozAlign: "right",
        formatter: (cell) => fmtQty(cell.getValue())
      },


      // DUE DATES
      { title: "Due Date",      field: "lot_due_date", minWidth: 130, sorter: "date",
        formatter: (cell) => fmtDate(cell.getValue())
      },
     

      { title: "Qty", field: "qty", width: 110, hozAlign: "right", headerHozAlign: "right",
        formatter: (cell) => fmtQty(cell.getValue())
      },

      // placeholders unchanged
      { title: "First article No:",  field: "", minWidth: 140, headerSort: false, formatter: ()=>"" },
      { title: "*Remark Product Control", field: "", minWidth: 180, headerSort: false, formatter: ()=>"" },
      { title: "Tracking no.",  field: "", minWidth: 130, headerSort: false, formatter: ()=>"" },
      { title: "Real Shipped Date",  field: "", minWidth: 150, headerSort: false, formatter: ()=>"" },
      { title: "INCOMING STOCK",  field: "", minWidth: 140, headerSort: false, formatter: ()=>"" },
      { title: "QA Inspection/AQL",  field: "", minWidth: 150, headerSort: false, formatter: ()=>"" },
      { title: "Name Inspection" ,  field: "", minWidth: 140, headerSort: false, formatter: ()=>"" },
      { title: "*Remark (QA Inspection)",  field: "", minWidth: 180, headerSort: false, formatter: ()=>"" },
      { title: "Rework/Repair",  field: "", minWidth: 130, headerSort: false, formatter: ()=>"" },
      { title: "*Remark (Rework)",  field: "", minWidth: 150, headerSort: false, formatter: ()=>"" },
      { title: "Qty Reject",  field: "", minWidth: 120, headerSort: false, formatter: ()=>"" },
      { title: "*Remark (Reject)",  field: "", minWidth: 150, headerSort: false, formatter: ()=>"" },
      { title: "Incoming Rework",  field: "", minWidth: 150, headerSort: false, formatter: ()=>"" },
      { title: "Finish goods in stock",  field: "", minWidth: 190, headerSort: false, formatter: ()=>"" },
      { title: "Qty Take Out",  field: "", minWidth: 130, headerSort: false, formatter: ()=>"" },
      { title: "Date Take Out Stock",  field: "", minWidth: 170, headerSort: false, formatter: ()=>"" },
      { title: "WIP\tWIP Cont.",  field: "", minWidth: 140, headerSort: false, formatter: ()=>"" },
      { title: "QTY Rework",  field: "", minWidth: 120, headerSort: false, formatter: ()=>"" },
      { title: "Green Tag No.",  field: "", minWidth: 140, headerSort: false, formatter: ()=>"" },
      { title: "Rework w/Lot",  field: "", minWidth: 140, headerSort: false, formatter: ()=>"" },
      { title: "QTY Prod",  field: "", minWidth: 110, headerSort: false, formatter: ()=>"" },
      { title: "QTY Shipped",  field: "", minWidth: 130, headerSort: false, formatter: ()=>"" },
      { title: "Residual",  field: "", minWidth: 110, headerSort: false, formatter: ()=>"" },
      { title: "QTY Use",  field: "", minWidth: 110, headerSort: false, formatter: ()=>"" },
    ],
  });
}

// ---- load
async function loadData(){
  try{
    const { items, meta } = await fetchDetail();
    allRows = items;            // NEW: store original unfiltered
    fillHeaderMeta(meta);
    table?.setData(items);      // all rows visible (no pagination)
    applyFiltersToTable();      // apply initial filters/search
  }catch(e){
    toast?.(e?.message || 'Load failed', false);
  }
}

// ---- search
function onSearchChange(){
  currentSearch = (inputSearch?.value || '').trim();
  applyFiltersToTable();
}

/* ---------- boot ---------- */
inputSearch?.addEventListener('input', debounce(onSearchChange, 250));

document.addEventListener('DOMContentLoaded', async () => {
  initTopbar?.();
  ensureHeaderCard();
  initTable();
  await loadData();
});
