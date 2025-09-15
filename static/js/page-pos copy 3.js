// /static/js/page-pos.js (v10)
import { $, jfetch, toast } from './api.js';
import { renderTableX } from './tablex.js';
import { attachAutocomplete } from './autocomplete.js';

const posUrl = (id) => `./pos-detail.html?id=${encodeURIComponent(id)}`;

/* --- element refs (id ตรง ๆ) --- */
const inputSearch = $('po_q');
const selPerPage  = $('po_per_page');
const btnPrevTop  = $('po_prev');
const btnNextTop  = $('po_next');
const pageInfoTop = $('po_page_info');
const btnPrevBot  = $('po_prev2');
const btnNextBot  = $('po_next2');
const pageInfoBot = $('po_page_info2');
const table       = $('po_table');
const btnReload   = $('po_reload');

const poNoEl      = $('po_no');
const poCustEl    = $('po_cust');
const poDescEl    = $('po_desc');
const btnCreate   = $('po_create');

const state = { page: 1, pageSize: Number(selPerPage?.value || 20), q: '', total: 0, items: [] };
// page-pos.js (top or near your config)
const OPEN_CUSTOMER_SUGGEST_ON_FOCUS = false;  // true = show first 10 on focus
const MIN_CHARS_FOR_CUSTOMER = 2;              // require 2 chars before searching

/* ===================== Autocomplete (Customer) ===================== */
let selectedCustomer = null; // { id, code, name }

async function searchCustomers(term) {
  const q = (term || '').trim();
  if (!q) return [];
  // พยายามรูปแบบหลักก่อน: /customers?q=&page=&page_size=
  try {
    const res = await jfetch(`/customers?q=${encodeURIComponent(q)}&page=1&page_size=10`);
    const items = Array.isArray(res) ? res : (res.items ?? []);
    return items.map(x => ({
      id: x.id ?? x.customer_id ?? x.customerId,
      code: x.code ?? '',
      name: x.name ?? '',
    }));
  } catch (_) {
    // fallback: /customers/keyset?q=
    try {
      const res2 = await jfetch(`/customers/keyset?q=${encodeURIComponent(q)}&limit=10`);
      const items2 = Array.isArray(res2) ? res2 : (res2.items ?? []);
      return items2.map(x => ({
        id: x.id ?? x.customer_id ?? x.customerId,
        code: x.code ?? '',
        name: x.name ?? '',
      }));
    } catch {
      return [];
    }
  }
}

attachAutocomplete(poCustEl, {
  fetchItems: searchCustomers,
  getDisplayValue: (it) => it ? `${it.code} — ${it.name}` : '',
  renderItem: (it) => `<div class="ac-row"><b>${it.code}</b> — ${it.name}</div>`,
  onPick: (it) => {
    selectedCustomer = it || null;
    poCustEl.value = it ? `${it.code} — ${it.name}` : '';
  },
  openOnFocus: true,
  minChars: 1,
  debounceMs: 200,
  maxHeight: 260,
});

// ถ้าผู้ใช้พิมพ์แก้เอง ให้ล้าง selection เพื่อบังคับ validate ตอน create
poCustEl?.addEventListener('input', () => { selectedCustomer = null; });

/* ===================== Table / Pager ===================== */
function safe(s){ return String(s ?? '').replaceAll('<','&lt;'); }
function fmtDate(s){ if(!s) return ''; const d=new Date(s); return isNaN(d)?'':d.toLocaleString(); }
const debounce = (fn,ms=300)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};};

function computeTotalPages() {
  if (state.total && state.pageSize) return Math.max(1, Math.ceil(state.total / state.pageSize));
  return state.items.length < state.pageSize && state.page === 1 ? 1 : state.page;
}

function syncPager() {
  const totalPages = computeTotalPages();
  const label = `Page ${state.page}${state.total ? ` / ${totalPages}` : ''}`;
  if (pageInfoTop) pageInfoTop.textContent = label;
  if (pageInfoBot) pageInfoBot.textContent = label;

  const canPrev = state.page > 1;
  const canNext = state.total ? state.page < totalPages : state.items.length === state.pageSize;

  [btnPrevTop, btnPrevBot].forEach(b => b && b.toggleAttribute('disabled', !canPrev));
  [btnNextTop, btnNextBot].forEach(b => b && b.toggleAttribute('disabled', !canNext));
}

function renderPosTable(container, rows, ctx={}) {
  renderTableX(container, rows, {
    rowStart: ctx.rowStart || 0,
    getRowId: r => r.id,
    onRowClick: r => { if (r?.id) location.href = posUrl(r.id); },
    columns: [
      { key: '__no',        title: 'No.',        width: '64px',  align: 'right' },
      { key: 'po_number',   title: 'PO No.',     width: '140px',
        render: r => `<a href="${posUrl(r.id)}">${safe(r.po_number ?? '')}</a>` },
      { key: 'customer',    title: 'Customer',   width: '260px',
        render: r => `${safe(r.customer?.code ?? '')} — ${safe(r.customer?.name ?? '')}` },
      { key: 'description', title: 'Description', render: r => safe(r.description ?? '') },
      { key: 'created_at',  title: 'Created',    width: '180px', render: r => fmtDate(r.created_at) },
    ],
    emptyText: 'No POs found',
  });
}

async function loadPOs() {
  if (!table) return;
  table.innerHTML = `<div style="padding:12px">Loading…</div>`;
  try {
    const params = new URLSearchParams({
      page: String(state.page),
      page_size: String(state.pageSize),
      q: state.q || '',
      _: String(Date.now()),
    });
    const data = await jfetch(`/pos?${params.toString()}`);
    state.items = data.items ?? [];
    state.total = Number(data.total ?? 0);

    const rows = state.items.map(it => ({
      id: it.id,
      po_number: it.po_number,
      customer: it.customer,
      description: it.description ?? '',
      created_at: it.created_at,
    }));

    renderPosTable(table, rows, { rowStart: (state.page - 1) * state.pageSize });
    syncPager();
  } catch (e) {
    console.error(e);
    table.innerHTML = `<div style="padding:12px;color:#b91c1c">Load error</div>`;
    toast('Load POs failed');
    syncPager();
  }
}

/* ===================== Create PO ===================== */
// กรณีผู้ใช้ไม่กดเลือกลิสต์: ลอง resolve ให้ครั้งเดียวด้วยคำค้นปัจจุบัน
async function resolveCustomerIfNeeded() {
  if (selectedCustomer) return selectedCustomer;
  const term = (poCustEl?.value || '').trim();
  if (!term) return null;
  const list = await searchCustomers(term);
  if (list.length === 1) {
    selectedCustomer = list[0];
    poCustEl.value = `${selectedCustomer.code} — ${selectedCustomer.name}`;
    return selectedCustomer;
  }
  return null;
}

btnCreate?.addEventListener('click', async () => {
  try {
    const po_number   = (poNoEl?.value || '').trim() || null;
    const description = (poDescEl?.value || '').trim() || '';

    let cust = selectedCustomer;
    if (!cust) cust = await resolveCustomerIfNeeded();

    if (!cust?.id) {
      toast('Select Customer !!', false);
      poCustEl?.focus();
      return;
    }

    const payload = { po_number, customer_id: cust.id, description };
    await jfetch('/pos', { method: 'POST', body: JSON.stringify(payload) });

    toast('PO created');
    if (poNoEl) poNoEl.value = '';
    if (poCustEl) poCustEl.value = '';
    if (poDescEl) poDescEl.value = '';
    selectedCustomer = null;

    state.page = 1;
    await loadPOs();
  } catch (e) {
    console.error(e);
    toast(e?.message || 'Create PO failed', false);
  }
});

/* ===================== events ===================== */
inputSearch?.addEventListener('input', debounce(() => {
  state.q = inputSearch.value || '';
  state.page = 1;
  loadPOs();
}, 250));

selPerPage?.addEventListener('change', () => {
  state.pageSize = Number(selPerPage.value || 20);
  state.page = 1;
  loadPOs();
});

btnReload?.addEventListener('click', () => loadPOs());

[btnPrevTop, btnPrevBot].forEach(b => b?.addEventListener('click', () => {
  if (state.page > 1) { state.page--; loadPOs(); }
}));
[btnNextTop, btnNextBot].forEach(b => b?.addEventListener('click', () => {
  const totalPages = computeTotalPages();
  if (state.total ? state.page < totalPages : state.items.length === state.pageSize) {
    state.page++; loadPOs();
  }
}));

/* ===================== boot ===================== */
document.addEventListener('DOMContentLoaded', loadPOs);
