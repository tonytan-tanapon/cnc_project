// /static/js/page-pos.js
import { $, jfetch, toast, initTopbar } from './api.js';

const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

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

/* ========================= Autocomplete (customer_code) ========================= */
let selectedCustomer = null; // {id, code, name} ที่เลือกไว้ล่าสุด
let acBox;                  // กล่องแสดงรายการ
let acItems = [];           // รายการที่โชว์อยู่
let acActive = -1;          // index ที่ถูก focus
let acTarget;               // input element (po_cust)

function ensureAcBox() {
  if (acBox) return acBox;
  acBox = document.createElement('div');
  acBox.className = 'ac-box';
  acBox.style.position = 'absolute';
  acBox.style.zIndex = '9999';
  acBox.style.minWidth = '240px';
  acBox.style.maxHeight = '260px';
  acBox.style.overflow = 'auto';
  acBox.style.background = '#fff';
  acBox.style.border = '1px solid #e2e8f0';
  acBox.style.borderRadius = '10px';
  acBox.style.boxShadow = '0 10px 20px rgba(2,6,23,.08), 0 2px 6px rgba(2,6,23,.06)';
  acBox.style.display = 'none';
  document.body.appendChild(acBox);
  return acBox;
}

function positionAcBox(input) {
  const r = input.getBoundingClientRect();
  acBox.style.left = `${window.scrollX + r.left}px`;
  acBox.style.top = `${window.scrollY + r.bottom + 4}px`;
  acBox.style.width = `${r.width}px`;
}

function hideAc() {
  if (!acBox) return;
  acBox.style.display = 'none';
  acItems = [];
  acActive = -1;
}

function renderAc(list) {
  const box = ensureAcBox();
  acItems = list || [];
  acActive = -1;
  if (acItems.length === 0) {
    hideAc();
    return;
  }
  box.innerHTML = acItems
    .map(
      (c, i) => `
      <div class="ac-item" data-i="${i}" style="padding:8px 10px; cursor:pointer; display:flex; gap:8px; align-items:center">
        <span class="badge" style="font-size:11px">${escapeHtml(c.code ?? '')}</span>
        <div style="flex:1">
          <div style="font-weight:600">${escapeHtml(c.name ?? '')}</div>
          <div class="hint" style="font-size:12px; color:#64748b">#${c.id}</div>
        </div>
      </div>`
    )
    .join('');
  [...box.querySelectorAll('.ac-item')].forEach((el) => {
    el.addEventListener('mouseenter', () => {
      setActive(parseInt(el.dataset.i, 10));
    });
    el.addEventListener('mousedown', (e) => {
      e.preventDefault(); // กัน blur ก่อนเลือก
      chooseActive(parseInt(el.dataset.i, 10));
    });
  });
  box.style.display = '';
}

function setActive(i) {
  acActive = i;
  [...acBox.querySelectorAll('.ac-item')].forEach((el, idx) => {
    el.style.background = idx === acActive ? 'rgba(0,0,0,.04)' : '';
  });
}

function chooseActive(i) {
  if (i < 0 || i >= acItems.length) return;
  const c = acItems[i];
  selectedCustomer = { id: c.id, code: (c.code || '').toUpperCase(), name: c.name || '' };
  acTarget.value = selectedCustomer.code;
  hideAc();
}

function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const fetchSuggest = debounce(async (term) => {
  if (!term || term.length < 1) {
    renderAc([]);
    return;
  }
  try {
    const list = await jfetch(`/customers?q=${encodeURIComponent(term)}`);
    // map เฉพาะ field ที่ใช้
    const rows = (list || []).map((x) => ({ id: x.id, code: (x.code || '').toUpperCase(), name: x.name || '' }));
    renderAc(rows.slice(0, 20));
    positionAcBox(acTarget);
  } catch {
    renderAc([]);
  }
}, 220);

function attachAutocomplete(input) {
  acTarget = input;
  input.setAttribute('autocomplete', 'off');
  input.placeholder = input.placeholder || 'Customer code (พิมพ์เพื่อค้นหา)';

  input.addEventListener('input', () => {
    const term = (input.value || '').trim();
    // ถ้าพิมพ์ต่างจากที่เลือกไว้ ให้ล้าง selection
    if (!selectedCustomer || selectedCustomer.code !== term.toUpperCase()) {
      selectedCustomer = null;
    }
    fetchSuggest(term);
    ensureAcBox();
    positionAcBox(input);
  });

  input.addEventListener('focus', () => {
    const term = (input.value || '').trim();
    fetchSuggest(term);
    ensureAcBox();
    positionAcBox(input);
  });

  input.addEventListener('blur', () => {
    // หน่วงนิดหน่อยเพื่อให้ mousedown ในรายการทันทำงาน
    setTimeout(hideAc, 100);
  });

  input.addEventListener('keydown', (e) => {
    if (acBox?.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(acActive + 1, acItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(acActive - 1, 0));
    } else if (e.key === 'Enter') {
      if (acActive >= 0) {
        e.preventDefault();
        chooseActive(acActive);
      }
    } else if (e.key === 'Escape') {
      hideAc();
    }
  });

  window.addEventListener('resize', () => acBox && positionAcBox(input));
  window.addEventListener('scroll', () => acBox && positionAcBox(input), true);
}

/* ========================= List renderer (แสดง customer_code) ========================= */
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

/* ========================= Load & Create ========================= */
async function loadPOs() {
  const holder = $('po_table');
  try {
    const rows = await jfetch('/pos');
    // ทำแผนที่ id -> code เพื่อแสดงผลสวย ๆ
    let id2code = new Map();
    try {
      const customers = await jfetch('/customers');
      id2code = new Map(customers.map((c) => [c.id, (c.code || '').toUpperCase()]));
    } catch {
      // เงียบ ๆ ถ้าโหลดลูกค้าไม่ได้ จะ fallback เป็น #id
    }
    renderPosTable(holder, rows, id2code);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast('โหลด PO ไม่สำเร็จ: ' + e.message, false);
  }
}

async function resolveCustomerIdFromCode(code) {
  if (!code) return null;
  // ถ้าเลือกจากรายการแล้ว และ code ตรงกัน ใช้เลย
  if (selectedCustomer && selectedCustomer.code === code.toUpperCase()) {
    return selectedCustomer.id;
  }
  // ไม่ได้เลือกจากรายการ => ค้นหาแบบ exact (ตาม code)
  try {
    const list = await jfetch(`/customers?q=${encodeURIComponent(code)}`);
    const exact = (list || []).find((c) => (c.code || '').toUpperCase() === code.toUpperCase());
    return exact ? exact.id : null;
  } catch {
    return null;
  }
}

// สร้าง PO ใหม่ (ใช้ customer_code แต่ส่ง customer_id)
async function createPO() {
  const po_no = ($('po_no')?.value || '').trim(); // ว่าง/"AUTO"/"AUTOGEN" = autogen หลังบ้าน
  const desc = ($('po_desc')?.value || '').trim();
  const code = ($('po_cust')?.value || '').trim().toUpperCase();

  if (!code) {
    toast('กรุณาใส่ Customer Code', false);
    return;
  }

  const custId = await resolveCustomerIdFromCode(code);
  if (!custId) {
    toast('ไม่พบลูกค้าจากรหัสที่พิมพ์ กรุณาเลือกจากรายการแนะนำ', false);
    $('po_cust')?.focus();
    return;
  }

  const payload = {
    po_number: po_no,
    description: desc || null,
    customer_id: custId,
  };

  try {
    await jfetch('/pos', { method: 'POST', body: JSON.stringify(payload) });
    toast('PO created');
    ['po_no', 'po_desc', 'po_cust'].forEach((id) => {
      const el = $(id);
      if (el) el.value = '';
    });
    selectedCustomer = null;
    await loadPOs();
  } catch (e) {
    toast(e.message, false);
  }
}

/* ========================= Bootstrap ========================= */
document.addEventListener('DOMContentLoaded', () => {
  initTopbar();

  // เปลี่ยนช่อง po_cust ให้เป็น code + autocomplete
  const custInput = $('po_cust');
  if (custInput) {
    custInput.placeholder = 'Customer code (พิมพ์เพื่อค้นหา)';
    attachAutocomplete(custInput);
  }

  on($('po_reload'), 'click', loadPOs);
  on($('po_create'), 'click', createPO);

  // Enter ที่ช่อง code -> สร้างเร็ว
  on($('po_cust'), 'keydown', (e) => {
    if (e.key === 'Enter') createPO();
  });

  // Fallback: คลิกพื้นที่อื่นในแถวก็ไปหน้า detail
  const holder = $('po_table');
  if (holder) {
    holder.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (a) return; // ถ้าคลิกลิงก์จริง ให้เบราว์เซอร์นำทางเอง
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const id = tr.dataset.id;
      if (id) location.href = posUrl(id);
    });
  }

  loadPOs();
});
