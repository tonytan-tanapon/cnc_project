// /static/js/page-widgets.js
import { $, jfetch, toast } from './api.js';
import { renderTableX } from './tablex.js';
import { createListPager } from './list-pager.js';
import { createToggler } from './toggler.js';

const detailUrl = id => `/static/widget-detail.html?id=${encodeURIComponent(id)}`;
const gotoDetail = id => { if (id) location.href = detailUrl(id); };
window.gotoDetail = gotoDetail;

// refs
const inputQ  = $('w_q');
const selPP   = $('w_per_page');
const tbl     = $('w_table');
const btnPrev = $('w_prev'), btnNext = $('w_next'), info = $('w_page_info');
const btnPrev2= $('w_prev2'),btnNext2= $('w_next2'),info2= $('w_page_info2');
const btnCreate = $('w_create');

function renderTable(container, rows, ctx={}) {
  renderTableX(container, rows, {
    rowStart: Number(ctx.rowStart||0),
    getRowId: r => r.id,
    onRowClick: r => gotoDetail(r.id),
    columns: [
      { key:'__no', title:'No.', width:'64px', align:'right' },
      { key:'code', title:'Code', width:'140px',
        render:r=>`<a class="code-link" href="${detailUrl(r.id)}">${r.code}</a>` },
      { key:'name', title:'Name', grow:1 },
      { key:'uom',  title:'UoM', width:'80px' },
      { key:'status', title:'Status', width:'110px' },
    ],
    emptyText: 'No data',
  });
}

const lp = createListPager({
  url: '/widgets',               // ← endpoint list
  pageSize: 20,
  container: tbl,
  render: renderTable,
  pageInfoEls: [info, info2],
  prevButtons: [btnPrev, btnPrev2],
  nextButtons: [btnNext, btnNext2],
  queryKey: 'q',
});

async function createOne() {
  const payload = {
    code: $('w_code')?.value.trim(),
    name: $('w_name')?.value.trim() || null,
    uom:  $('w_uom')?.value.trim()  || null,
    status: $('w_status')?.value || 'active',
    note: $('w_note')?.value.trim() || '',
  };
  if (!payload.code) return toast('Enter code', false);
  try {
    await jfetch('/widgets', { method:'POST', body: JSON.stringify(payload) });
    toast('Created');
    ['w_code','w_name','w_uom','w_note'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
    await lp.reloadFirst();
  } catch(e) { toast(e?.message || 'Create failed', false); }
}

// boot
let tg;
document.addEventListener('DOMContentLoaded', () => {
  tg = createToggler({
    trigger: $('btnToggleCreate'),
    panel:   $('createCard'),
    persistKey: 'widgets:create',
    onOpen:  () => $('btnToggleCreate').textContent='× Cancel',
    onClose: () => $('btnToggleCreate').textContent='+ Add',
  });
  $('btnToggleCreate').textContent = tg.isOpen()? '× Cancel': '+ Add';

  lp.bindSearch(inputQ, { debounceMs: 300 });
  lp.bindPerPage(selPP);
  $('w_reload')?.addEventListener('click', () => lp.reloadSame());

  btnCreate?.addEventListener('click', (e)=>{ e.preventDefault(); createOne(); });

  lp.reloadFirst();
});
