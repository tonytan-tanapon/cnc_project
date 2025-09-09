// 2) Parts (show part_no and description)
// const partInput = document.getElementById('line_part_input');
// const partHidden = document.getElementById('line_part_id');
// attachAutocomplete(partInput, {
//   fetchItems: (q) => jfetch(`/parts?q=${encodeURIComponent(q)}&limit=12`),
//   getDisplayValue: (it) => `${it.part_no ?? ''} — ${it.description ?? ''}`,
//   renderItem: (it) => `
//     <div style="font-weight:600">${escapeHtml(it.part_no ?? '')}</div>
//     <div style="color:#6b7280">— ${escapeHtml(it.description ?? '')}</div>
//   `,
//   onPick: (it) => { partHidden.value = it.id; }
// });

import { $, jfetch, toast, initTopbar } from './api.js';
import { attachAutocomplete } from './autocomplete.js';
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

/* ========================= Autocomplete ========================= */
let selectedCustomer = null; // {id, code, name}
let acBox;
let acItems = [];
let acActive = -1;
let acTarget;
let selectedCustomerId = null;
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
  if (acItems.length === 0) { hideAc(); return; }

  box.innerHTML = acItems.map((c, i) => `
    <div class="ac-item" data-i="${i}"
         style="padding:8px 10px; cursor:pointer; display:flex; gap:8px; align-items:center">
      <span class="badge" style="font-size:11px">${escapeHtml(c.code ?? '')}</span>
      <div style="flex:1; min-width:0">
        <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">
          ${escapeHtml(c.name ?? '')}
        </div>
      </div>
    </div>
  `).join('');

  [...box.querySelectorAll('.ac-item')].forEach((el) => {
    el.addEventListener('mouseenter', () => setActive(parseInt(el.dataset.i, 10)));
    el.addEventListener('mousedown', (e) => { e.preventDefault(); chooseActive(parseInt(el.dataset.i, 10)); });
  });

  if (!acTarget) return;
  box.style.display = '';
  positionAcBox(acTarget);
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
  // แสดงทั้ง code + name ในช่อง
  acTarget.value = `${selectedCustomer.code} - ${selectedCustomer.name}`.trim();
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
  try {
    let url;
    if (!term || term.length < 1) {
      url = `/customers?page=1&per_page=10`;
    } else {
      url = `/customers?q=${encodeURIComponent(term)}&page=1&per_page=20`;
    }
    const data = await jfetch(url);
    const list = data?.items ?? [];
    const rows = list.map((x) => ({ id: x.id, code: (x.code || '').toUpperCase(), name: x.name || '' }));
    renderAc(rows);
    if (acTarget) positionAcBox(acTarget);
  } catch {
    renderAc([]);
  }
}, 220);

/* ========================= List renderer ========================= */
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
    const ids = [...new Set((rows || []).map(r => r.customer_id).filter(Boolean))];

    let id2code = new Map();
    if (ids.length > 0) {
      try {
        const minis = await jfetch(`/customers/lookup?ids=${encodeURIComponent(ids.join(','))}`);
        id2code = new Map(minis.map(c => [c.id, (c.code || '').toUpperCase()]));
      } catch {
        // fallback
      }
    }
    renderPosTable(holder, rows, id2code);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast('โหลด PO ไม่สำเร็จ: ' + e.message, false);
  }
}

async function resolveCustomerIdFromCode(text) {
  const raw = (text || '').trim();
  if (!raw) return null;

  // // ถ้าเคยเลือกจาก list แล้ว ให้เชื่อถือ selection เป็นหลัก
  // if (selectedCustomer) {
  //   const startsWithCode = raw.toUpperCase().startsWith(selectedCustomer.code);
  //   if (startsWithCode) return selectedCustomer.id;
  // }

  // ถ้าไม่ได้เลือกจาก list ให้ดึง "code" ออกมาก่อน (รองรับรูปแบบ 'CODE - Name')
  const codeOnly = raw.split('-')[0].trim().toUpperCase();

  try {
    const data = await jfetch(`/customers?q=${encodeURIComponent(codeOnly)}&page=1&per_page=20`);
    const list = data?.items ?? [];
    const exact = list.find(c => (c.code || '').toUpperCase() === codeOnly);
    return exact ? exact.id : null;
  } catch {
    return null;
  }
}

// สร้าง PO ใหม่ แล้ว redirect ไปหน้า detail พร้อม id
async function createPO() {
  const po_no = ($('po_no')?.value || '').trim();
  const desc = ($('po_desc')?.value || '').trim();
  const code = ($('po_cust')?.value || '').trim();

  if (!code) {
    toast('Enter Customer Code', false);
    return;
  }

  const custId = selectedCustomerId ?? await resolveCustomerIdFromCode(code);
  if (!custId) {
    toast('Customer does not found !!', false);
    $('po_cust')?.focus();
    return;
  }

  const payload = {
    po_number: po_no,
    description: desc || null,
    customer_id: custId,
  };

  try {
    // 👇 สำคัญ: เก็บค่าที่สร้างกลับมา (ต้องมี id)
    const created = await jfetch('/pos', { method: 'POST', body: JSON.stringify(payload) });
    if (created?.id) {
      // ไปหน้ารายละเอียดทันที เช่น /static/pos-detail.html?id=45
      location.href = posUrl(created.id);
      return; // ไม่ต้องทำอะไรต่อแล้ว
    }

    // เผื่อกรณีแบ็กเอนด์ไม่คืน id (ไม่ควรเกิด)
    toast('PO created but no id returned', false);
    await loadPOs();
  } catch (e) {
    toast(e.message, false);
  }
}

/* ========================= Bootstrap ========================= */
document.addEventListener('DOMContentLoaded', () => {
  initTopbar();
  
  const custInput = $('po_cust');
  // if (custInput) {
  //   custInput.placeholder = 'Customer code or name';
  //   attachAutocomplete(custInput);
  // }
  if (custInput) {
    custInput.placeholder = 'Customer code or name';

    // reset selection ถ้ามีการพิมพ์ทับ
    custInput.addEventListener('input', () => { selectedCustomerId = null; });

    attachAutocomplete(custInput, {
      // ดึงรายการลูกค้า (รองรับไม่มีคำค้นด้วย)
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

      // ค่า text ที่จะใส่กลับลง <input> เมื่อเลือก
      getDisplayValue: (it) => `${it.code} - ${it.name}`.trim(),

      // หน้าตา item ใน dropdown (ไม่แสดง id ตามที่ต้องการ)
      renderItem: (it) => `
        <div style="padding:8px 10px; display:flex; gap:8px; align-items:center">
          <span class="badge" style="font-size:11px">${escapeHtml(it.code)}</span>
          <div style="font-weight:600">${escapeHtml(it.name)}</div>
        </div>
      `,

      // เมื่อเลือกแล้ว เก็บ id ไว้ใช้ตอน create
      onPick: (it) => {
        selectedCustomerId = it.id;
        // ถ้าต้องการเก็บใส่ hidden ด้วยก็ได้:
        // $('po_customer_id')?.value = it.id;
      },
      openOnFocus: 'first10',  // ⬅️ โฟกัสแล้วแสดง 10 รายการแรกทันที
    });
  }

  on($('po_reload'), 'click', loadPOs);
  on($('po_create'), 'click', createPO);

  on($('po_cust'), 'keydown', (e) => {
    if (e.key === 'Enter') createPO();
  });

  const holder = $('po_table');
  if (holder) {
    holder.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (a) return;
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const id = tr.dataset.id;
      if (id) location.href = posUrl(id);
    });
  }

  loadPOs();
});
