// /static/js/page-pos.js
import { $, jfetch, toast, initTopbar } from './api.js';
import { escapeHtml } from './utils.js';
import { attachAutocomplete } from './autocomplete.js';
import { renderTableX } from './tablex.js';
import { createToggler } from './toggler.js';

const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
const debounce = (fn, ms=300) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

/* ---------- URL helpers ---------- */
const DETAIL_PAGE = './pos-detail.html';
const CUSTOMER_DETAIL_PAGE = './customers-detail.html';
const posUrl      = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;
const customerUrl = (id) => `${CUSTOMER_DETAIL_PAGE}?id=${encodeURIComponent(id)}`;

/* ---------- state ---------- */
const state = { q: '' };

/* ---------- lookups (reuse ได้) ---------- */
async function lookupCustomerCodes(ids = []) {
  if (!ids.length) return new Map();
  try {
    const minis = await jfetch(`/customers/lookup?ids=${encodeURIComponent(ids.join(','))}`);
    return new Map(minis.map(c => [c.id, (c.code || '').toUpperCase()]));
  } catch {
    return new Map();
  }
}

async function resolveCustomerIdFromCode(text) {
  const codeOnly = (text || '').split('-')[0].trim().toUpperCase();
  if (!codeOnly) return null;
  try {
    const data = await jfetch(`/customers?q=${encodeURIComponent(codeOnly)}&page=1&per_page=20`);
    const list = data?.items ?? [];
    const exact = list.find(c => (c.code || '').toUpperCase() === codeOnly);
    return exact ? Number(exact.id) : null;  // บังคับเลข
  } catch { return null; }
}

/* ---------- table render ---------- */
function renderPosTable(container, rows, ctx = {}) {
  renderTableX(container, rows, {
    rowStart: Number(ctx.rowStart || 0),
    getRowId : r => r.id,
    onRowClick: r => { if (r?.id) location.href = posUrl(r.id); },
    columns: [
      { key: '__no', title: 'No.', width: '64px', align: 'right' },
      {
        key: 'po_number', title: 'PO No.', width: '220px',
        render: r => {
          const rid = r.id;
          const po  = escapeHtml(r.po_number ?? '');
          const label = po || `#${rid}`;
          return rid ? `<a href="${posUrl(rid)}" class="po-link">${label}</a>` : label;
        }
      },
      {
        key: 'customer_id', title: 'Customer', width: '160px',
        render: r => {
          const cid = r.customer_id;
          const code = r.__cust_code || null;
          if (!cid) return '<span>-</span>';
          const label = escapeHtml(code || `#${cid}`);
          return `<a href="${customerUrl(cid)}" title="Open customer #${cid}">${label}</a>`;
        }
      },
      { key: 'description', title: 'Description' },
    ],
  });
}

/* ---------- load list (รองรับค้นหา) ---------- */
async function loadPOs() {
  const holder = $('po_table');
  const q = (state.q || '').trim();
  try {
    // ใช้ keyset ที่รองรับ q และเรียงจากใหม่ไปเก่า (เอาหน้าแรกพอ)
    const url = `/pos/keyset?limit=100${ q ? `&q=${encodeURIComponent(q)}` : '' }`;
    const { items = [] } = await jfetch(url);

    const ids  = [...new Set(items.map(r => r.customer_id).filter(Boolean))];
    const id2code = await lookupCustomerCodes(ids);
    const enriched = items.map(r => ({ ...r, __cust_code: id2code.get(r.customer_id) || null }));

    renderPosTable(holder, enriched, { rowStart: 0 });
  } catch (e) {
    holder.innerHTML = `<div class="hint">${escapeHtml(e?.message || 'Load failed')}</div>`;
    toast('โหลด PO ไม่สำเร็จ: ' + (e?.message || e), false);
  }
}

/* ---------- create PO ---------- */
let selectedCustomerId = null;

async function createPO() {
  const po_no = ($('po_no')?.value || '').trim();
  const desc  = ($('po_desc')?.value || '').trim();
  const code  = ($('po_cust')?.value || '').trim();

  if (!code) { toast('Enter Customer Code', false); $('po_cust')?.focus(); return; }

  const cidMaybe = selectedCustomerId ?? await resolveCustomerIdFromCode(code);
  const cid = Number(cidMaybe);
  if (!Number.isInteger(cid) || cid <= 0) {
    toast('Customer not found', false);
    $('po_cust')?.focus();
    return;
  }

  const payload = {
    po_number: po_no ? po_no.toUpperCase() : null,  // ไม่กรอกให้เป็น null → server autogen
    description: desc || null,
    customer_id: cid,
  };

  console.log('POST /pos payload =', payload);

  try {
    const created = await jfetch('/pos', { method: 'POST', body: JSON.stringify(payload) });
    if (created?.po_number) toast(`Created PO ${created.po_number}`, true);
    if (created?.id) { location.href = posUrl(created.id); return; }
    toast('PO created but no id returned', false);
    await loadPOs();
  } catch (e) {
    toast(e?.message || 'Create failed', false);
  }
}

/* ---------- bootstrap ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initTopbar();

  // ค้นหา PO
  const inputSearch = $('po_q');
  if (inputSearch) {
    inputSearch.placeholder = 'Search PO no. / description / customer';
    inputSearch.addEventListener('input', debounce(() => {
      state.q = inputSearch.value || '';
      loadPOs();
    }, 300));
  }

  // Autocomplete ลูกค้า
  const custInput = $('po_cust');
  if (custInput) {
    custInput.placeholder = 'Customer code or name';
    custInput.addEventListener('input', () => { selectedCustomerId = null; });
    attachAutocomplete(custInput, {
      fetchItems: async (q) => {
        const url = (q && q.trim())
          ? `/customers?q=${encodeURIComponent(q.trim())}&page=1&per_page=20`
          : `/customers?page=1&per_page=10`;
        const data = await jfetch(url);
        return (data?.items ?? []).map(x => ({
          id: x.id,
          code: (x.code || '').toUpperCase(),
          name: x.name || ''
        }));
      },
      getDisplayValue: it => `${it.code} - ${it.name}`.trim(),
      renderItem: it => `
        <div style="padding:8px 10px; display:flex; gap:8px; align-items:center">
          <span class="badge" style="font-size:11px">${escapeHtml(it.code)}</span>
          <div style="font-weight:600">${escapeHtml(it.name)}</div>
        </div>`,
      onPick: it => { selectedCustomerId = Number(it.id); },  // ⬅️ บังคับเลขที่นี่ (ไม่มี onPick ลอยนอก object แล้ว)
      openOnFocus: 'first10',
    });
  }

  // ปุ่ม
  on($('po_reload'), 'click', loadPOs);
  on($('po_create'), 'click', createPO);
  on($('po_cust'), 'keydown', (e) => { if (e.key === 'Enter') createPO(); });

  // toggle create (ถ้ามี)
  const btnToggleCreate = document.getElementById('btnToggleCreate');
  const createCard      = document.getElementById('createCard');
  if (btnToggleCreate && createCard) {
    const tg = createToggler({
      trigger: btnToggleCreate,
      panel: createCard,
      persistKey: 'pos:create',
      focusTarget: '#po_cust',
      closeOnEsc: true,
      closeOnOutside: true,
      onOpen:  () => { btnToggleCreate.textContent = '× Cancel'; },
      onClose: () => { btnToggleCreate.textContent = '+ Add'; },
    });
    btnToggleCreate.textContent = tg.isOpen() ? '× Cancel' : '+ Add';
  }

  // โหลดครั้งแรก
  loadPOs();
});
