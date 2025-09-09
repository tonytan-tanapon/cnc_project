// /static/js/page-pos-detail.js
import { $, jfetch, toast } from './api.js';

const qs = new URLSearchParams(location.search);
const poId = qs.get('id');

let original = null;            // สำหรับ Reset
let selectedCustomer = null;    // { id, code, name } ที่เลือกจาก autocomplete

const customersDetailUrl = (id) =>
  `/static/customers-detail.html?id=${encodeURIComponent(id)}`;

/* ---------- helpers: customer fetch/resolve ---------- */
async function fetchCustomerById(id) {
  if (!id) return null;
  try {
    const c = await jfetch(`/customers/${encodeURIComponent(id)}`);
    return {
      id: c.id,
      code: (c.code || '').toUpperCase(),
      name: c.name || '',
    };
  } catch {
    return null;
  }
}

async function resolveCustomerIdFromCode(code) {
  if (!code) return null;
  try {
    const list = await jfetch(`/customers?q=${encodeURIComponent(code)}`);
    const exact = (list || []).find(
      (c) => (c.code || '').toUpperCase() === code.toUpperCase()
    );
    return exact ? exact.id : null;
  } catch {
    return null;
  }
}

function updateCustomerLink(cust /* {id, code, name} | null */) {
  const a = $('link_cust');
  if (!a) return;
  if (cust) {
    a.href = customersDetailUrl(cust.id);
    a.textContent = cust.code;
    a.title = cust.name ? `${cust.code} — ${cust.name}` : cust.code;
  } else {
    a.href = '#';
    a.textContent = '';
    a.removeAttribute('title');
  }
}

/* ---------- form fill/read ---------- */
function fillFormBasic(po) {
  $('po_no').value = po.po_number ?? '';
  $('po_desc').value = po.description ?? '';
  $('subTitle').textContent = `#${po.id} — ${po.po_number ?? ''}`;
}

async function fillForm(po) {
  fillFormBasic(po);

  // แสดง customer_code + เก็บ selectedCustomer
  const cust = await fetchCustomerById(po.customer_id);
  selectedCustomer = cust;
  $('po_cust').value = cust?.code || '';
  updateCustomerLink(cust);
}

function readForm() {
  return {
    po_number: ($('po_no').value ?? '').trim().toUpperCase() || null,
    customer_code: ($('po_cust').value ?? '').trim().toUpperCase() || null,
    description: ($('po_desc').value ?? '').trim() || null,
  };
}

function setBusy(b) {
  ['btnSave', 'btnReset', 'btnDelete'].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = b;
  });
  $('hint').textContent = b ? 'Working…' : '';
}

/* ---------- autocomplete ---------- */
let acBox;          // กล่อง suggestion
let acItems = [];   // [{id, code, name}]
let acActive = -1;  // index ที่โฟกัส
let acTarget;       // input element

function ensureAcBox() {
  if (acBox) return acBox;
  acBox = document.createElement('div');
  acBox.className = 'ac-box';
  Object.assign(acBox.style, {
    position: 'absolute',
    zIndex: '9999',
    minWidth: '240px',
    maxHeight: '260px',
    overflow: 'auto',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    boxShadow: '0 10px 20px rgba(2,6,23,.08), 0 2px 6px rgba(2,6,23,.06)',
    display: 'none',
  });
  document.body.appendChild(acBox);
  return acBox;
}

function positionAcBox(input) {
  if (!acBox) return;
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
        <span class="badge" style="font-size:11px">${escapeHtml(c.code)}</span>
        <div style="flex:1">
          <div style="font-weight:600">${escapeHtml(c.name)}</div>
          <div class="hint" style="font-size:12px; color:#64748b">#${c.id}</div>
        </div>
      </div>`
    )
    .join('');
  [...box.querySelectorAll('.ac-item')].forEach((el) => {
    el.addEventListener('mouseenter', () => setActive(parseInt(el.dataset.i, 10)));
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
  selectedCustomer = { id: c.id, code: c.code, name: c.name };
  acTarget.value = c.code;
  updateCustomerLink(selectedCustomer);
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
    const rows = (list || []).map((x) => ({
      id: x.id,
      code: (x.code || '').toUpperCase(),
      name: x.name || '',
    }));
    renderAc(rows.slice(0, 20));
    ensureAcBox();
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
    const term = (input.value || '').trim().toUpperCase();
    // ถ้าพิมพ์ต่างจากที่เลือกไว้ ให้ล้าง selection
    if (!selectedCustomer || selectedCustomer.code !== term) {
      selectedCustomer = null;
      updateCustomerLink(null);
    }
    fetchSuggest(term);
    ensureAcBox();
    positionAcBox(input);
  });

  input.addEventListener('focus', () => {
    const term = (input.value || '').trim().toUpperCase();
    fetchSuggest(term);
    ensureAcBox();
    positionAcBox(input);
  });

  input.addEventListener('blur', () => {
    setTimeout(hideAc, 100); // เผื่อเวลาคลิกรายการ
  });

  input.addEventListener('keydown', (e) => {
    if (!acBox || acBox.style.display === 'none') return;
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

const escapeHtml = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/* ---------- load / save / delete ---------- */
async function loadPO() {
  if (!poId) {
    $('errorBox').style.display = '';
    $('errorBox').textContent = 'Missing ?id= in URL';
    setBusy(true);
    return;
  }
  setBusy(true);
  try {
    const po = await jfetch(`/pos/${encodeURIComponent(poId)}`);
    original = po;
    await fillForm(po);
    document.title = `PO · ${po.po_number ?? po.id}`;

    // ติดตั้ง autocomplete หลังเติมค่าเริ่มต้น
    const custInput = $('po_cust');
    if (custInput) attachAutocomplete(custInput);
  } catch (e) {
    $('errorBox').style.display = '';
    $('errorBox').textContent = e?.message || 'Load failed';
  } finally {
    setBusy(false);
  }
}

async function savePO() {
  const form = readForm();

  if (!form.customer_code) {
    toast('กรุณาใส่ Customer Code', false);
    $('po_cust').focus();
    return;
  }

  // ใช้ selectedCustomer ถ้ารหัสตรงกัน → เร็วกว่า
  let customer_id = null;
  if (selectedCustomer && selectedCustomer.code === form.customer_code) {
    customer_id = selectedCustomer.id;
  } else {
    customer_id = await resolveCustomerIdFromCode(form.customer_code);
  }

  if (!customer_id) {
    toast('ไม่พบลูกค้าจากรหัสที่กรอก', false);
    $('po_cust').focus();
    return;
  }

  const payload = {
    po_number: form.po_number,
    customer_id,
    description: form.description,
  };

  setBusy(true);
  try {
    const updated = await jfetch(`/pos/${encodeURIComponent(poId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    original = updated;
    // หลังบันทึก โหลดข้อมูลลูกค้ามาอัปเดตลิงก์และค่าให้ตรง
    const cust = await fetchCustomerById(updated.customer_id);
    selectedCustomer = cust;
    $('po_cust').value = cust?.code || form.customer_code;
    updateCustomerLink(cust);

    fillFormBasic(updated);
    toast('Saved');
  } catch (e) {
    toast(e?.message || 'Save failed', false);
  } finally {
    setBusy(false);
  }
}

async function deletePO() {
  if (!confirm('ลบ PO นี้?\nThis action cannot be undone.')) return;
  setBusy(true);
  try {
    await jfetch(`/pos/${encodeURIComponent(poId)}`, { method: 'DELETE' });
    toast('Deleted');
    location.href = '/static/pos.html';
  } catch (e) {
    toast(e?.message || 'Delete failed', false);
  } finally {
    setBusy(false);
  }
}

function resetForm() {
  if (!original) return;
  fillForm(original);
  toast('Reset');
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // แนะนำให้ input ใน pos-detail.html เป็น:
  // <input id="po_cust" type="text" style="text-transform: uppercase" />

  $('btnSave').addEventListener('click', savePO);
  $('btnReset').addEventListener('click', resetForm);
  $('btnDelete').addEventListener('click', deletePO);

  // Enter ที่ช่อง po_no → save เร็ว ๆ
  $('po_no').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') savePO();
  });

  loadPO();
});


/* ===================== PO Lines ===================== */
let poLines = [];
let editingLineId = null;

async function loadLines() {
  if (!poId) return;
  try {
    const rows = await jfetch(`/pos/${encodeURIComponent(poId)}/lines`);
    poLines = rows || [];
    renderLines();
  } catch (e) {
    console.error(e);
    poLines = [];
    renderLines();
  }
}

function renderLines() {
  const tb = $('tblLinesBody');
  if (!poLines.length) {
    tb.innerHTML = `<tr><td colspan="7" class="empty">No lines</td></tr>`;
    return;
  }
  tb.innerHTML = poLines.map(row => {
    const qty = Number(row.qty_ordered ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
    const price = row.unit_price != null
      ? Number(row.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '';
    const due = row.due_date ?? '';
    const partNo = row.part?.part_no ?? (row.part_id ?? '');
    const rev = row.rev?.rev ?? (row.revision_id ?? '');
    const notes = escapeHtml(row.notes ?? '');

    return `
      <tr data-id="${row.id}">
        <td>${escapeHtml(partNo)}</td>
        <td>${escapeHtml(String(rev))}</td>
        <td style="text-align:right">${qty}</td>
        <td style="text-align:right">${price}</td>
        <td>${escapeHtml(due)}</td>
        <td>${notes}</td>
        <td style="text-align:right">
          <button class="btn ghost btn-sm" data-edit="${row.id}">Edit</button>
          <button class="btn danger btn-sm" data-del="${row.id}">Delete</button>
        </td>
      </tr>`;
  }).join('');

  // wire actions
  tb.querySelectorAll('[data-edit]').forEach(b => {
    b.addEventListener('click', () => openLineForm(getLineById(+b.dataset.edit)));
  });
  tb.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', () => deleteLine(+b.dataset.del));
  });
}

function getLineById(id) {
  return poLines.find(x => x.id === id);
}

/* ---------- Modal helpers ---------- */
function openLineForm(line /* or null */) {
  editingLineId = line?.id ?? null;
  $('lineModalTitle').textContent = editingLineId ? `Edit Line #${editingLineId}` : 'Add Line';

  $('f_part_code').value  = line?.part?.part_no ?? '';
  $('f_rev').value        = line?.rev?.rev ?? '';
  $('f_part_id').value    = line?.part_id ?? '';
  $('f_revision_id').value= line?.revision_id ?? '';
  $('f_qty').value        = line?.qty_ordered ?? '';
  $('f_price').value      = line?.unit_price ?? '';
  $('f_due').value        = line?.due_date ?? '';
  $('f_notes').value      = line?.notes ?? '';

  showModal(true);
}

function showModal(show) {
  const m = $('lineModal');
  m.style.display = show ? '' : 'none';
}

/* close handlers */
(function wireModalClose(){
  const m = $('lineModal');
  m.addEventListener('click', (e) => {
    if (e.target.matches('[data-close], .modal, .modal-backdrop')) {
      showModal(false);
    }
  });
})();

/* ---------- Save / Delete ---------- */
async function saveLine() {
  const payload = {
    // ยืดหยุ่น: จะกรอกผ่าน part_id/revision_id หรือ part_code/rev ก็ได้
    part_id: numOrNull($('f_part_id').value),
    revision_id: numOrNull($('f_revision_id').value),
    part_code: strOrNull($('f_part_code').value),
    rev: strOrNull($('f_rev').value),
    qty_ordered: numOrNull($('f_qty').value),
    unit_price: numOrNull($('f_price').value),
    due_date: strOrNull($('f_due').value),  // yyyy-mm-dd
    notes: strOrNull($('f_notes').value),
  };

  // เล็กน้อย: ต้องมีหนึ่งใน (part_id หรือ part_code)
  if (!payload.part_id && !payload.part_code) {
    toast('กรุณาใส่ Part ID หรือ Part No', false);
    return;
  }

  try {
    if (editingLineId) {
      const updated = await jfetch(`/pos/${encodeURIComponent(poId)}/lines/${editingLineId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      // update local
      const idx = poLines.findIndex(x => x.id === editingLineId);
      if (idx >= 0) poLines[idx] = updated;
      toast('Line updated');
    } else {
      const created = await jfetch(`/pos/${encodeURIComponent(poId)}/lines`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      poLines.unshift(created);
      toast('Line added');
    }
    renderLines();
    showModal(false);
  } catch (e) {
    toast(e?.message || 'Save failed', false);
  }
}

async function deleteLine(id) {
  if (!confirm('Delete this line?')) return;
  try {
    await jfetch(`/pos/${encodeURIComponent(poId)}/lines/${id}`, { method: 'DELETE' });
    poLines = poLines.filter(x => x.id !== id);
    renderLines();
    toast('Line deleted');
  } catch (e) {
    toast(e?.message || 'Delete failed', false);
  }
}

/* ---------- utils ---------- */
function numOrNull(v){ const n = Number(v); return isFinite(n) ? n : null }
function strOrNull(v){ v = (v ?? '').trim(); return v ? v : null }

/* ---------- boot (ต่อจากเดิม) ---------- */
document.addEventListener('DOMContentLoaded', () => {
  $('btnAddLine').addEventListener('click', () => openLineForm(null));
  $('btnLineSave').addEventListener('click', saveLine);

  // เมื่อโหลด PO แล้ว ค่อยโหลด Lines
  loadPO().then(loadLines);
});
