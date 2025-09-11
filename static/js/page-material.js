// /static/js/page-materials.js  (keyset + tablex + toggler)
import { $, jfetch, toast } from './api.js';
import { escapeHtml } from './utils.js';
import { createListPager } from './list-pager.js?v=2';
import { renderTableX } from './tablex.js';
import { createToggler } from './toggler.js';

/* ---- CONFIG / helpers ---- */
const DETAIL_PAGE = './materials-detail.html';
const materialUrl = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;
const gotoDetail = (id) => { if (id != null) location.href = materialUrl(id); };
window.gotoDetail = gotoDetail;

const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : d.toLocaleString();
};

/* ---- UI refs (match your HTML ids) ---- */
const inputSearch      = $('m_q');
const selPerPage       = $('m_per_page');
const btnPrevTop       = $('m_prev');
const btnNextTop       = $('m_next');
const pageInfoTop      = $('m_page_info');
const btnPrevBottom    = $('m_prev2');
const btnNextBottom    = $('m_next2');
const pageInfoBottom   = $('m_page_info2');
const tableContainer   = $('m_table');

const btnToggleCreate  = $('m_toggle_create');
const createCard       = $('m_create_card');
const btnCreate        = $('m_create');

/* ---- render (tablex with No. and link to detail) ---- */
function renderMaterialsTable(container, rows, ctx = {}) {
  renderTableX(container, rows, {
    rowStart: Number(ctx.rowStart || 0),
    getRowId: r => r.id ?? r.material_id ?? r.materialId,
    onRowClick: r => {
      const rid = r.id ?? r.material_id ?? r.materialId;
      if (rid != null) gotoDetail(rid);
    },
    columns: [
      { key: '__no', title: 'No.', width: '64px', align: 'right' },
      {
        key: 'code', title: 'Code', width: '140px',
        render: r => {
          const rid = r.id ?? r.material_id ?? r.materialId;
          const code = escapeHtml(r.code ?? '');
          return rid ? `<a href="${materialUrl(rid)}" class="code-link">${code}</a>` : code;
        }
      },
      { key: 'name',   title: 'Name' },
      { key: 'spec',   title: 'Spec',   width: '220px', render: r => escapeHtml(r.spec ?? '') },
      { key: 'uom',    title: 'UoM',    width: '100px', align: 'center' },
      { key: 'remark', title: 'Remark', width: '240px', render: r => escapeHtml(r.remark ?? '') },
      { key: 'created_at', title: 'Created', width: '180px', align: 'right', render: r => fmtDate(r.created_at) },
    ],
    // Optional: empty message inside tablex
    emptyHtml: '<div class="muted">No materials</div>',
  });
}

/* ---- list pager (search + per-page + prev/next) ----
   Backend expected to support /materials/keyset?q=&page_size=&cursor=
   If your API is offset-based only, point url to '/materials' (it still works
   if your createListPager supports offset mode). */
const lp = createListPager({
  url: '/materials/keyset',
  pageSize: Number(selPerPage?.value || 20),
  container: tableContainer,
  render: renderMaterialsTable,
  pageInfoEls: [pageInfoTop, pageInfoBottom],
  prevButtons: [btnPrevTop, btnPrevBottom],
  nextButtons: [btnNextTop, btnNextBottom],
  queryKey: 'q',
});

/* ---- create material ---- */
async function createMaterial() {
  const payload = {
    code:   $('m_code')?.value.trim()   || '',
    name:   $('m_name')?.value.trim()   || '',
    spec:   $('m_spec')?.value.trim()   || null,
    uom:    $('m_uom')?.value.trim()    || null,
    remark: $('m_remark')?.value.trim() || null,
  };
  if (!payload.name) return toast('Enter material name', false);

  try {
    await jfetch('/materials', { method: 'POST', body: JSON.stringify(payload) });
    toast('Material created');

    // reset inputs (keep uom if you want by removing it from the list)
    ['m_code', 'm_name', 'm_spec', 'm_remark'].forEach(id => {
      const el = $(id);
      if (el) el.value = '';
    });

    // close the create panel (toggler) if open
    createTg?.close();

    // reload from first page to see newest item (or keep cursor, up to you)
    await lp.reloadFirst();
  } catch (e) {
    console.error(e);
    toast(e?.message || 'Create failed', false);
  }
}

/* ---- boot ---- */
let createTg;
document.addEventListener('DOMContentLoaded', () => {
  // toggler for create section
  createTg = createToggler({
    trigger: btnToggleCreate,
    panel: createCard,
    persistKey: 'materials:create',
    focusTarget: '#m_name',
    closeOnEsc: true,
    closeOnOutside: true,
    group: 'top-actions',
    onOpen:  () => { btnToggleCreate.textContent = '× Cancel'; },
    onClose: () => { btnToggleCreate.textContent = '+ Add'; },
  });
  btnToggleCreate.textContent = createTg.isOpen() ? '× Cancel' : '+ Add';

  // wire search + per-page
  lp.bindSearch(inputSearch, { debounceMs: 300 });
  lp.bindPerPage(selPerPage);

  // create handler
  btnCreate?.addEventListener('click', createMaterial);

  // first load
  lp.reloadFirst().catch(async () => {
    // Optional graceful fallback if keyset route doesn't exist:
    // Recreate with offset endpoint.
    const alt = createListPager({
      url: '/materials',
      pageSize: Number(selPerPage?.value || 20),
      container: tableContainer,
      render: renderMaterialsTable,
      pageInfoEls: [pageInfoTop, pageInfoBottom],
      prevButtons: [btnPrevTop, btnPrevBottom],
      nextButtons: [btnNextTop, btnNextBottom],
      queryKey: 'q',
    });
    // rebind search/per-page to the alt pager
    alt.bindSearch(inputSearch, { debounceMs: 300 });
    alt.bindPerPage(selPerPage);
    // swap
    // (Not strictly necessary to detach the first lp; we just stop using it.)
    await alt.reloadFirst();
  });
});
