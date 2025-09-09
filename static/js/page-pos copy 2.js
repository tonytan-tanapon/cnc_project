// /static/js/page-pos.js
import { $, jfetch, initTopbar } from './api.js'; // ถ้าต้องการใช้ $/initTopbar เดิมของคุณ
import {
  debounce,
  toast,
  showLoading,
  hideLoading,
  CursorPager2D,
  attachAutocomplete,
} from './ui-kit.js?v=3'; // barrel รวม helpers

const DETAIL_PAGE = './pos-detail.html';
const CUSTOMER_DETAIL_PAGE = './customers-detail.html';

const escapeHtml = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const posUrl = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;
const customerUrl = (id) => `${CUSTOMER_DETAIL_PAGE}?id=${encodeURIComponent(id)}`;

/* ---------------- API base helpers ---------------- */
function getAPIBase() {
  const v = document.getElementById('apiBase')?.value?.trim();
  const base = v || '';
  return base.replace(/\/+$/, '');
}
function api(path) {
  // path เช่น '/pos/keyset'
  return `${getAPIBase()}${path.startsWith('/') ? '' : '/'}${path}`;
}

/* ---------------- State ---------------- */
let selectedCustomer = null; // { id, code, name }
let reachedEarliest = false;
let reachedLatest = false;

const state = {
  q: '',
  perPage: 20,
};

/* ---------------- Attach Autocomplete (reuse) ---------------- */
async function fetchCustomerAC(term) {
  const url = api(`/customers/keyset?limit=20&q=${encodeURIComponent(term || '')}`);
  const res = await jfetch(url);
  return (res?.items || []).map((c) => ({
    id: c.id,
    code: (c.code || '').toUpperCase(),
    name: c.name || '',
  }));
}

function setupCustomerAC(input) {
  attachAutocomplete(input, {
    fetchItems: fetchCustomerAC,
    getDisplayValue: (c) => `${c.code}${c.name ? ' - ' + c.name : ''}`,
    onPick: (c) => {
      selectedCustomer = c;
    },
    // optionally add renderItem to customise row, แต่ค่า default ก็สวยอยู่
  });
}

/* ---------------- Table renderer ---------------- */
function renderPosTable(holder, rows, id2code = new Map()) {
  if (!rows || rows.length === 0) {
    holder.innerHTML = '<div class="empty">No POs</div>';
    return;
  }
  const body = rows
    .map((r) => {
      const rid = r.id ?? '';
      const poNo = escapeHtml(r.po_number ?? '');
      const custId = r.customer_id ?? null;
      const custCode = id2code.get(custId) || null;
      const custCell = custCode
        ? `<a href="${customerUrl(custId)}" title="Open customer #${custId}">${escapeHtml(custCode)}</a>`
        : (custId ? `<a href="${customerUrl(custId)}" title="Open customer #${custId}">#${custId}</a>` : `<span>-</span>`);
      return `
        <tr class="po-row" data-id="${escapeHtml(rid)}" title="Open PO detail">
          <td><a href="${posUrl(rid)}" class="po-link">${poNo || `#${rid}`}</a></td>
          <td>${custCell}</td>
          <td>${escapeHtml(r.description ?? '')}</td>
        </tr>
      `;
    })
    .join('');

  holder.innerHTML = `
    <table class="table pos-table">
      <thead>
        <tr>
          <th style="width:220px">PO No.</th>
          <th style="width:160px">Customer</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    <style>
      .pos-table a { text-decoration: underline; }
      .pos-table tr[data-id] { cursor: pointer; }
      .pos-table tr[data-id]:hover { background: rgba(0,0,0,.03); }
    </style>
  `;
}

/* ---------------- Pager (Cursor) ---------------- */
let pager = null;

function recreatePager() {
  pager = new CursorPager2D({
    url: api('/pos/keyset'),
    pageSize: state.perPage,
  });
}

function updatePagerUI() {
  // หน้า PO ต้นฉบับไม่มี Prev/Next; ถ้าอยากใส่ ให้เพิ่มปุ่มใน HTML แล้ว hook เหมือนหน้า Customers
  // ตรงนี้เลยไม่มีการอัปเดตปุ่ม แต่อ่านค่า pageIndex ได้จาก pager.pageIndex
}

async function reloadFirst() {
  recreatePager();
  reachedEarliest = false;
  reachedLatest = false;

  const holder = $('po_table');
  showLoading(holder);
  const { items, hasMore } = await pager.first({ q: state.q || undefined });
  hideLoading(holder);

  // ทำ map id->code เพื่อโชว์ในตาราง
  const ids = [...new Set((items || []).map((r) => r.customer_id).filter(Boolean))];
  let id2code = new Map();
  if (ids.length > 0) {
    try {
      const minis = await jfetch(api(`/customers/lookup?ids=${encodeURIComponent(ids.join(','))}`));
      id2code = new Map(minis.map((c) => [c.id, (c.code || '').toUpperCase()]));
    } catch {}
  }

  renderPosTable(holder, items, id2code);
  reachedLatest = !hasMore;
  updatePagerUI();
}

async function goNext() {
  if (reachedLatest) return;
  const holder = $('po_table');
  showLoading(holder);
  const { items, hasMore } = await pager.next({ q: state.q || undefined });
  hideLoading(holder);

  const ids = [...new Set((items || []).map((r) => r.customer_id).filter(Boolean))];
  let id2code = new Map();
  if (ids.length > 0) {
    try {
      const minis = await jfetch(api(`/customers/lookup?ids=${encodeURIComponent(ids.join(','))}`));
      id2code = new Map(minis.map((c) => [c.id, (c.code || '').toUpperCase()]));
    } catch {}
  }

  if ((items || []).length) renderPosTable(holder, items, id2code);
  reachedEarliest = false;
  reachedLatest = !hasMore;
  updatePagerUI();
}

async function goPrev() {
  if (reachedEarliest || pager.pageIndex <= 1) return;
  const holder = $('po_table');
  showLoading(holder);
  const { items, hasMore } = await pager.prev({ q: state.q || undefined });
  hideLoading(holder);

  const ids = [...new Set((items || []).map((r) => r.customer_id).filter(Boolean))];
  let id2code = new Map();
  if (ids.length > 0) {
    try {
      const minis = await jfetch(api(`/customers/lookup?ids=${encodeURIComponent(ids.join(','))}`));
      id2code = new Map(minis.map((c) => [c.id, (c.code || '').toUpperCase()]));
    } catch {}
  }

  if ((items || []).length) renderPosTable(holder, items, id2code);
  reachedEarliest = !hasMore;
  reachedLatest = false;
  updatePagerUI();
}

/* ---------------- Resolve customer by input ---------------- */
async function resolveCustomerIdFromInput(text) {
  const raw = (text || '').trim();
  if (!raw) return null;

  if (selectedCustomer) {
    // ถ้าเลือกจากรายการ AC แล้วยังเริ่มด้วย code เดิม ให้ใช้ id นั้นเลย
    const code = selectedCustomer.code || '';
    if (raw.toUpperCase().startsWith(code)) return selectedCustomer.id;
  }

  // แยก code หน้า 'CODE - Name'
  const codeOnly = raw.split('-')[0].trim().toUpperCase();
  try {
    const data = await jfetch(api(`/customers/keyset?limit=20&q=${encodeURIComponent(codeOnly)}`));
    const list = data?.items ?? [];
    const exact = list.find((c) => (c.code || '').toUpperCase() === codeOnly);
    return exact ? exact.id : null;
  } catch {
    return null;
  }
}

/* ---------------- Create PO ---------------- */
async function createPO() {
  const po_no = ($('po_no')?.value || '').trim();
  const desc = ($('po_desc')?.value || '').trim();
  const custText = ($('po_cust')?.value || '').trim();

  if (!custText) {
    toast('Enter Customer Code', false);
    $('po_cust')?.focus();
    return;
  }
  const custId = await resolveCustomerIdFromInput(custText);
  if (!custId) {
    toast('Customer not found', false);
    $('po_cust')?.focus();
    return;
  }

  const payload = {
    po_number: po_no,            // 'AUTO' หรือว่าง เพื่อ autogen ได้
    description: desc || null,
    customer_id: custId,
  };

  try {
    const created = await jfetch(api('/pos'), { method: 'POST', body: JSON.stringify(payload) });
    if (created?.id) {
      location.href = posUrl(created.id);
      return;
    }
    toast('PO created but no id returned', false);
    await reloadFirst();
  } catch (e) {
    toast(e?.message || 'Create failed', false);
  }
}

/* ---------------- Boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initTopbar?.(); // ถ้าฟังก์ชันนี้มีใน api.js

  // Attach autocomplete ให้ช่องลูกค้า
  const custInput = $('po_cust');
  if (custInput) {
    custInput.placeholder = custInput.placeholder || 'Customer code or name';
    setupCustomerAC(custInput);
  }

  // ปุ่ม
  $('po_reload')?.addEventListener('click', reloadFirst);
  $('po_create')?.addEventListener('click', createPO);
  $('po_cust')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createPO();
  });

  // เผื่ออยากใส่คิวรีค้นหาแบบพิมพ์หา PO แถวบน (เพิ่ม input id="po_q" เองได้)
  const qEl = $('po_q');
  if (qEl) {
    const onType = debounce(() => {
      state.q = qEl.value.trim();
      reloadFirst();
    }, 300);
    qEl.addEventListener('input', onType);
  }

  // เริ่มโหลด
  reloadFirst();
});
