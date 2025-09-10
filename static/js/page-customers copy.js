// /static/js/page-customers.js
import { $, jfetch, toast } from './api.js';
import { debounce, showLoading, hideLoading, escapeHtml } from './utils.js';
import { CursorPager2D } from './pagination.js?v=2'; // กันแคชค้าง

/* ----------------- CONFIG ----------------- */
const DETAIL_PAGE = './customers-detail.html';

/* ----------------- helpers ----------------- */

function customerUrl(id) { return `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`; }
function gotoDetail(id) { if (id) location.href = customerUrl(id); }
window.gotoDetail = gotoDetail;

/* ----------------- state ----------------- */
let state = { perPage: 20, q: '' };
let reachedEarliest = false; // ไม่มี prev ต่อแล้ว
let reachedLatest   = false; // ไม่มี next ต่อแล้ว

/* ----------------- UI refs ----------------- */
const btnToggleCreate  = document.getElementById('btnToggleCreate');
const createCard       = document.getElementById('createCard');
const btnCreate        = document.getElementById('c_create');

const inputSearch      = $('c_q');
const btnReload        = $('c_reload');
const selPerPage       = $('c_per_page');

const btnPrevTop       = $('c_prev');
const btnNextTop       = $('c_next');
const pageInfoTop      = $('c_page_info');

const btnPrevBottom    = $('c_prev2');
const btnNextBottom    = $('c_next2');
const pageInfoBottom   = $('c_page_info2');

const tableContainer   = $('c_table');
const btnPing          = document.getElementById('btnPing');

/* ----------------- create form toggle ----------------- */
function showCreate(){ createCard.hidden = false; btnToggleCreate.textContent = '× Cancel'; document.getElementById('c_name')?.focus(); }
function hideCreate(){ createCard.hidden = true;  btnToggleCreate.textContent = '+ Add'; }
btnToggleCreate?.addEventListener('click', () => { createCard.hidden ? showCreate() : hideCreate(); });

/* ----------------- create customer ----------------- */
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
    ['c_code','c_name','c_contact','c_email','c_phone','c_addr'].forEach(id => { const el = $(id); if (el) el.value=''; });
    hideCreate();
    await reloadFirst(); // หน้าแรกของ keyset
  } catch (e) {
    toast(e?.message || 'Create failed', false);
  }
}

/* ----------------- render table ----------------- */
function renderCustomersTable(container, rows) {
  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="empty">No customers</div>';
    return;
  }
  const bodyHTML = rows.map(r => {
    const rid = r.id ?? r.customer_id ?? r.customerId ?? '';
    const codeCell = rid
      ? `<a href="${customerUrl(rid)}" class="code-link">${escapeHtml(r.code ?? '')}</a>`
      : `<span>${escapeHtml(r.code ?? '')}</span>`;
    return `
      <tr class="click-row" data-id="${escapeHtml(rid)}" tabindex="0" title="Open detail">
        <td>${codeCell}</td>
        <td>${escapeHtml(r.name ?? '')}</td>
        <td>${escapeHtml(r.contact ?? '')}</td>
        <td>${escapeHtml(r.email ?? '')}</td>
        <td>${escapeHtml(r.phone ?? '')}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="table customers-table">
      <thead>
        <tr>
          <th style="width:120px">Code</th>
          <th>Name</th>
          <th style="width:200px">Contact</th>
          <th style="width:240px">Email</th>
          <th style="width:140px">Phone</th>
        </tr>
      </thead>
      <tbody>${bodyHTML}</tbody>
    </table>
    <style>
      .customers-table a { text-decoration: underline; }
      .click-row { cursor: pointer; }
      .click-row:focus { outline: 2px solid #77aaff; outline-offset: 2px; }
      .customers-table tr:hover { background: rgba(0,0,0,.03); }
    </style>
  `;

  // row click (ignore anchor)
  const isAnchor = (el) => el?.closest('a[href]');
  container.querySelector('tbody')?.addEventListener('click', (e) => {
    if (isAnchor(e.target)) return;
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    if (id) gotoDetail(id);
  });
}

/* ----------------- pager (keyset 2D) ----------------- */
let pager = new CursorPager2D({
  url: '/customers/keyset',
  pageSize: state.perPage,
});

function recreatePager() {
  pager = new CursorPager2D({
    url: '/customers/keyset',
    pageSize: state.perPage,
  });
}

function updatePagerUI() {
  const info = `Page ${pager.pageIndex}`;
  if (pageInfoTop) pageInfoTop.textContent = info;
  if (pageInfoBottom) pageInfoBottom.textContent = info;

  const disablePrev = reachedEarliest || pager.pageIndex <= 1;
  const disableNext = reachedLatest;

  [btnPrevTop, btnPrevBottom].forEach(b => { if (b) b.disabled = disablePrev; });
  [btnNextTop, btnNextBottom].forEach(b => { if (b) b.disabled = disableNext; });
}

async function reloadFirst() {
  // เปลี่ยน base หรือ perPage → recreate pager
  recreatePager();
  reachedEarliest = false;
  reachedLatest   = false;
  showLoading(tableContainer);
  const { items, hasMore } = await pager.first({ q: state.q || undefined });
  hideLoading(tableContainer);
  renderCustomersTable(tableContainer, items || []);
  reachedLatest = !hasMore; // ถ้าไม่มีหน้าถัดไป
  updatePagerUI();
}
async function goNext() {
  if (reachedLatest) return;
  showLoading(tableContainer);
  const { items, hasMore } = await pager.next({ q: state.q || undefined });
  hideLoading(tableContainer);
  if ((items || []).length) renderCustomersTable(tableContainer, items);
  reachedEarliest = false;
  reachedLatest   = !hasMore;
  updatePagerUI();
}
async function goPrev() {
  if (reachedEarliest || pager.pageIndex <= 1) return;
  showLoading(tableContainer);
  const { items, hasMore } = await pager.prev({ q: state.q || undefined });
  hideLoading(tableContainer);
  if ((items || []).length) renderCustomersTable(tableContainer, items);
  reachedEarliest = !hasMore; // ไม่มี prev ต่อแล้ว
  reachedLatest   = false;    // ยังไปหน้า next ได้
  updatePagerUI();
}

/* ----------------- boot ----------------- */
document.addEventListener('DOMContentLoaded', () => {
  // Create
  btnCreate?.addEventListener('click', createCustomer);
  btnReload?.addEventListener('click', () => reloadFirst());

  // Search (debounce)
  const onType = debounce(() => {
    state.q = inputSearch?.value?.trim() || '';
    reloadFirst();
  }, 300);
  inputSearch?.addEventListener('input', onType);

  // Per page
  selPerPage?.addEventListener('change', () => {
    state.perPage = Number(selPerPage.value) || 20;
    reloadFirst();
  });

  // Pager buttons
  btnPrevTop?.addEventListener('click', goPrev);
  btnPrevBottom?.addEventListener('click', goPrev);
  btnNextTop?.addEventListener('click', goNext);
  btnNextBottom?.addEventListener('click', goNext);

  // Esc → close create form
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !createCard.hasAttribute('hidden')) hideCreate();
  });

  // Ping (optional helper)
  // ตรงที่ bind ปุ่ม Ping ใน api.js หรือหน้า page-*.js
  btnPing?.addEventListener('click', async () => {
    try {
      await jfetch('/customers/keyset?limit=1'); // ✅ jfetch ต่อ base ให้เอง
      toast('API OK ✅');                         // ข้อความชัดเจน ไม่พึ่งตัวแปรอื่น
    } catch (e) {
      toast(`Ping error: ${e?.message ?? 'Unknown error'}`, false);
    }
  });

      // First load
      reloadFirst();
});
