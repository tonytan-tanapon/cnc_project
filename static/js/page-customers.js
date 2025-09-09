// /static/js/page-customers.js
import { $, jfetch, toast } from './api.js';

/* ----------------- CONFIG ----------------- */
const DETAIL_PAGE = './customers-detail.html';

/* ----------------- helpers ----------------- */
function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function customerUrl(id) {
  return `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;
}
function gotoDetail(id) {
  if (!id) return;
  location.href = customerUrl(id);
}
window.gotoDetail = gotoDetail;

/* ----------------- debounce helper ----------------- */
function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ----------------- state (pagination/search) ----------------- */
let state = {
  page: 1,
  perPage: 20,
  q: '',
  total: 0,
  pages: 1,
};

/* ----------------- UI refs ----------------- */
const btnToggleCreate = document.getElementById('btnToggleCreate');
const createCard = document.getElementById('createCard');
const btnCreate = document.getElementById('c_create');

const inputSearch = $('c_q');
const btnReload = $('c_reload');
const selPerPage = $('c_per_page');

const btnPrevTop = $('c_prev');
const btnNextTop = $('c_next');
const pageInfoTop = $('c_page_info');

const btnPrevBottom = $('c_prev2');
const btnNextBottom = $('c_next2');
const pageInfoBottom = $('c_page_info2');

const tableContainer = $('c_table');

/* ----------------- create form toggle ----------------- */
function showCreate() {
  createCard.removeAttribute('hidden');
  btnToggleCreate.textContent = '× Cancel';
  document.getElementById('c_name')?.focus();
}
function hideCreate() {
  createCard.setAttribute('hidden', '');
  btnToggleCreate.textContent = '+ Add';
}
btnToggleCreate?.addEventListener('click', () => {
  if (createCard.hasAttribute('hidden')) showCreate(); else hideCreate();
});

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

  if (!payload.name) {
    toast('Enter customer name', false);
    return;
  }

  try {
    await jfetch('/customers', { method: 'POST', body: JSON.stringify(payload) });
    toast('Customer created');
    // reset form
    ['c_code','c_name','c_contact','c_email','c_phone','c_addr'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    hideCreate();
    state.page = 1; // กลับไปหน้าแรกเพื่อโชว์ลูกค้าใหม่
    await loadCustomers();
  } catch (e) {
    toast(e?.message || 'Create failed', false);
  }
}

/* ----------------- table renderer ----------------- */
function renderCustomersTable(container, rows) {
  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="empty">No customers</div>';
    return;
  }

  const getId = (r) => r.id ?? r.customer_id ?? r.customerId ?? '';

  const bodyHTML = rows.map(r => {
    const rid = getId(r);
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
      </tr>
    `;
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

  // row click
  const isAnchor = (el) => el?.closest('a[href]');
  container.querySelector('tbody')?.addEventListener('click', (e) => {
    if (isAnchor(e.target)) return;
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    if (id) gotoDetail(id);
  });
}

/* ----------------- pagination helpers ----------------- */
function updatePagerUI() {
  const { page, pages, total, perPage } = state;
  const info = `Page ${page} / ${pages} · ${total} items`;
  if (pageInfoTop) pageInfoTop.textContent = info;
  if (pageInfoBottom) pageInfoBottom.textContent = info;

  const disablePrev = page <= 1;
  const disableNext = page >= pages;

  [btnPrevTop, btnPrevBottom].forEach(b => { if (b) b.disabled = disablePrev; });
  [btnNextTop, btnNextBottom].forEach(b => { if (b) b.disabled = disableNext; });

  if (selPerPage && Number(selPerPage.value) !== perPage) {
    selPerPage.value = String(perPage);
  }
}

/* ----------------- data ops ----------------- */
async function loadCustomers() {
  const q = inputSearch?.value?.trim() ?? '';
  state.q = q;

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('page', String(state.page));
  params.set('per_page', String(state.perPage));

  const url = `/customers?${params.toString()}`;

  try {
    const data = await jfetch(url);
    const { items, total, page, per_page, pages } = data || {};

    state.total = Number(total) || 0;
    state.page = Number(page) || 1;
    state.perPage = Number(per_page) || 20;
    state.pages = Number(pages) || 1;

    renderCustomersTable(tableContainer, items || []);
    updatePagerUI();
  } catch (e) {
    tableContainer.innerHTML = `<div class="hint">${escapeHtml(e?.message ?? 'Error')}</div>`;
    state.total = 0; state.pages = 1;
    updatePagerUI();
  }
}

/* ----------------- boot ----------------- */
document.addEventListener('DOMContentLoaded', () => {
  btnCreate?.addEventListener('click', createCustomer);
  btnReload?.addEventListener('click', () => { state.page = 1; loadCustomers(); });

  // auto search while typing
  let composing = false;
  const loadCustomersDebounced = debounce(() => { state.page = 1; loadCustomers(); }, 300);

  inputSearch?.addEventListener('compositionstart', () => { composing = true; });
  inputSearch?.addEventListener('compositionend', () => { composing = false; loadCustomersDebounced(); });
  inputSearch?.addEventListener('input', () => { if (!composing) loadCustomersDebounced(); });

  // per-page
  selPerPage?.addEventListener('change', () => {
    state.perPage = Number(selPerPage.value) || 20;
    state.page = 1;
    loadCustomers();
  });

  // pager buttons
  const goPrev = () => { if (state.page > 1) { state.page -= 1; loadCustomers(); } };
  const goNext = () => { if (state.page < state.pages) { state.page += 1; loadCustomers(); } };

  btnPrevTop?.addEventListener('click', goPrev);
  btnPrevBottom?.addEventListener('click', goPrev);
  btnNextTop?.addEventListener('click', goNext);
  btnNextBottom?.addEventListener('click', goNext);

  // Esc → close create form
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !createCard.hasAttribute('hidden')) hideCreate();
  });

  loadCustomers();
});
