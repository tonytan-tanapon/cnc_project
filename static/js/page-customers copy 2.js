// /static/js/page-customers.js  (เรียกใช้แบบสั้น)
import { $, jfetch, toast } from './api.js';
import { escapeHtml } from './utils.js';
import { createListPager } from './list-pager.js?v=2';
import { renderTableX } from './tablex.js';
import { createToggler } from './toggler.js';

/* ---- CONFIG / helpers ---- */
const DETAIL_PAGE = './customers-detail.html';
const customerUrl = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;
const gotoDetail = (id) => { if (id) location.href = customerUrl(id); };
window.gotoDetail = gotoDetail;

/* ---- UI refs ---- */
const inputSearch      = $('c_q');
const selPerPage       = $('c_per_page');
const btnPrevTop       = $('c_prev');
const btnNextTop       = $('c_next');
const pageInfoTop      = $('c_page_info');
const btnPrevBottom    = $('c_prev2');
const btnNextBottom    = $('c_next2');
const pageInfoBottom   = $('c_page_info2');
const tableContainer   = $('c_table');

const btnToggleCreate  = document.getElementById('btnToggleCreate');
const createCard       = document.getElementById('createCard');
const btnCreate        = document.getElementById('c_create');

/* ---- render (ใช้ tablex + No. + fallback id) ---- */
function renderCustomersTable(container, rows, ctx = {}) {
  renderTableX(container, rows, {
    rowStart: Number(ctx.rowStart || 0),
    getRowId: r => r.id ?? r.customer_id ?? r.customerId,
    onRowClick: r => {
      const rid = r.id ?? r.customer_id ?? r.customerId;
      if (rid != null) gotoDetail(rid);
    },
    columns: [
      { key: '__no', title: 'No.', width: '64px', align: 'right' },
      {
        key: 'code', title: 'Code', width: '120px',
        render: r => {
          const rid = r.id ?? r.customer_id ?? r.customerId;
          const code = escapeHtml(r.code ?? '');
          return rid ? `<a href="${customerUrl(rid)}" class="code-link">${code}</a>` : code;
        }
      },
      { key: 'name',    title: 'Name' },
      { key: 'contact', title: 'Contact', width: '200px' },
      { key: 'email',   title: 'Email',   width: '240px' },
      { key: 'phone',   title: 'Phone',   width: '140px' },
    ],
  });
}

/* ---- list pager (ค้นหา + เพจจิ้ง reuse) ---- */
const lp = createListPager({
  url: '/customers/keyset',
  pageSize: 20,
  container: tableContainer,
  render: renderCustomersTable,
  pageInfoEls: [pageInfoTop, pageInfoBottom],
  prevButtons: [btnPrevTop, btnPrevBottom],
  nextButtons: [btnNextTop, btnNextBottom],
  queryKey: 'q', // backend รับพารามิเตอร์ชื่อ q
});

/* ---- create customer ---- */
async function createCustomer() {
  const payload = {
    code: $('c_code')?.value.trim() || '',
    name: $('c_name')?.value.trim(),
    contact: $('c_contact')?.value.trim() || null,
    email: $('c_email')?.value.trim() || null,
    phone: $('c_phone')?.value.trim() || null,
    address: $('c_addr')?.value.trim() || null,
  };
  if (!payload.name) return toast('Enter customer name', false);

  try {
    await jfetch('/customers', { method: 'POST', body: JSON.stringify(payload) });
    toast('Customer created');
    ['c_code','c_name','c_contact','c_email','c_phone','c_addr']
      .forEach(id => { const el = $(id); if (el) el.value = ''; });
    // ปิดด้วย toggler (แทน hideCreate เดิม)
    createTg?.close();
    await lp.reloadFirst();
  } catch (e) {
    toast(e?.message || 'Create failed', false);
  }
}

/* ---- boot ---- */
let createTg;
document.addEventListener('DOMContentLoaded', () => {
  // toggler สำหรับ create section (อย่าผูกคลิกซ้ำ)
  createTg = createToggler({
    trigger: btnToggleCreate,
    panel: createCard,
    persistKey: 'customers:create',
    focusTarget: '#c_name',
    closeOnEsc: true,
    closeOnOutside: true,
    group: 'top-actions',
    onOpen:  () => { btnToggleCreate.textContent = '× Cancel'; },
    onClose: () => { btnToggleCreate.textContent = '+ Add'; },
  });
  // sync ปุ่มเริ่มต้นตามสถานะที่ restore มา
  btnToggleCreate.textContent = createTg.isOpen() ? '× Cancel' : '+ Add';

  // bind search + per-page
  lp.bindSearch(inputSearch, { debounceMs: 300 });
  lp.bindPerPage(selPerPage);

  // create
  btnCreate?.addEventListener('click', createCustomer);

  // first load
  lp.reloadFirst();
});
