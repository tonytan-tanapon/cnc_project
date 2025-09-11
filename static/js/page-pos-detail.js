// /static/js/page-pos-detail.js
import { $, jfetch, toast } from './api.js';

const DEBUG = false;
const dlog = (...args) => { if (DEBUG) console.log('[PO-D]', ...args); };

const qs = new URLSearchParams(location.search);
const poId = qs.get('id');

let original = null;            // สำหรับ Reset
let selectedCustomer = null;    // { id, code, name } ที่เลือกจาก autocomplete
const customersDetailUrl = (id) =>
  `/static/customers-detail.html?id=${encodeURIComponent(id)}`;
const partDetailUrl = (id) =>
  `/static/part-detail.html?id=${encodeURIComponent(id)}`;

/* ---------------- helpers ---------------- */
const escapeHtml = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/* ---------- Toggle: Header Edit / Cancel ---------- */
let headerOpen = false;

function showHeaderEditor() {
  const sec = $('page-po-detail');
  if (!sec) return;
  sec.hidden = false;
  $('btnHeaderEdit').textContent = 'Cancel';
  headerOpen = true;

  // attach autocomplete ให้ช่องลูกค้าตอนฟอร์มถูกแสดง (หลีกเลี่ยงปัญหาคำนวณตำแหน่งตอน hidden)
  const custInput = $('po_cust');
  if (custInput && !custInput.dataset.acReady) {
    attachCustomerAutocomplete(custInput);
    custInput.dataset.acReady = '1';
  }
  if (custInput) {
    custInput.focus();
    const term = (custInput.value || '').trim();
    fetchCustomerSuggest(term);
    ensureCustAcBox();
    positionCustAcBox(custInput);
  }
}

function hideHeaderEditor() {
  const sec = $('page-po-detail');
  if (!sec) return;
  if (original) resetForm();           // รีเซ็ตก่อนซ่อน
  sec.hidden = true;
  $('btnHeaderEdit').textContent = 'Edit PO';
  headerOpen = false;
}

/* ---------- helpers: customer fetch/resolve ---------- */
async function fetchCustomerById(id) {
  if (!id) return null;
  try {
    const c = await jfetch(`/customers/${encodeURIComponent(id)}`);
    const out = { id: c.id, code: (c.code || '').toUpperCase(), name: c.name || '' };
    dlog('fetchCustomerById', id, out);
    return out;
  } catch (e) {
    dlog('fetchCustomerById ERR', e);
    return null;
  }
}

async function resolveCustomerIdFromCode(codeOrText) {
  if (!codeOrText) return null;
  const code = String(codeOrText).split('-')[0].trim().toUpperCase();
  if (selectedCustomer && code.startsWith(selectedCustomer.code)) {
    dlog('resolveCustomerId: from selectedCustomer', selectedCustomer);
    return selectedCustomer.id;
  }
  try {
    const url = `/customers?q=${encodeURIComponent(code)}&page=1&per_page=20`;
    const data = await jfetch(url);
    const list = Array.isArray(data) ? data : (data?.items || data?.results || data?.data || data?.list || []);
    const exact = (list || []).find((c) => (c.code || '').toUpperCase() === code);
    dlog('resolveCustomerIdFromCode', { code, url, listLen: list?.length, exact });
    return exact ? exact.id : null;
  } catch (e) {
    dlog('resolveCustomerIdFromCode ERR', e);
    return null;
  }
}

function updateCustomerLink(cust /* {id, code, name} | null */) {
  const a = $('link_cust');
  const h = $('custNameHint');
  if (!a || !h) return;
  if (cust) {
    a.href = customersDetailUrl(cust.id);
    a.textContent = cust.code;
    a.title = cust.name ? `${cust.code} — ${cust.name}` : cust.code;
    h.textContent = cust.name || '';
  } else {
    a.href = '#';
    a.textContent = '';
    a.removeAttribute('title');
    h.textContent = '';
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

  // ใช้ข้อมูล customer ที่ backend ส่งมาใน PoOut (po.customer)
  let cust = null;
  if (po.customer) {
    cust = {
      id: po.customer.id,
      code: (po.customer.code || '').toUpperCase(),
      name: po.customer.name || '',
    };
  } else if (po.customer_id) {
    // สำรอง: เผื่อรุ่นเก่ายังส่ง customer_id มา
    cust = await fetchCustomerById(po.customer_id);
  }

  selectedCustomer = cust;
  $('po_cust').value = cust ? `${cust.code}${cust.name ? ' - ' + cust.name : ''}` : '';
  updateCustomerLink(cust);
  dlog('fillForm', { po, cust });
}

function readForm() {
  return {
    po_number: ($('po_no').value ?? '').trim().toUpperCase() || null,
    customer_code: ($('po_cust').value ?? '').trim().toUpperCase() || null, // อาจเป็น "CODE - NAME"
    description: ($('po_desc').value ?? '').trim() || null,
  };
}

function setBusy(b) {
  ['btnSave', 'btnReset', 'btnDelete'].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = b;
  });
  $('hint') && ($('hint').textContent = b ? 'Working…' : '');
}

/* ---------- Autocomplete Customer (detail header) ---------- */
let custAcBox;          // div ของ suggestion
let custAcItems = [];   // [{id, code, name}]
let custAcActive = -1;  // index
let custAcTarget;       // input element

function ensureCustAcBox() {
  if (custAcBox) return custAcBox;
  custAcBox = document.createElement('div');
  Object.assign(custAcBox.style, {
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
  custAcBox.className = 'ac-box';
  document.body.appendChild(custAcBox);
  return custAcBox;
}

function positionCustAcBox(input) {
  if (!custAcBox || !input) return;
  const r = input.getBoundingClientRect();
  custAcBox.style.left = `${window.scrollX + r.left}px`;
  custAcBox.style.top = `${window.scrollY + r.bottom + 4}px`;
  custAcBox.style.width = `${r.width}px`;
}

function hideCustAc() {
  if (!custAcBox) return;
  custAcBox.style.display = 'none';
  custAcItems = [];
  custAcActive = -1;
}

function renderCustAc(list) {
  const box = ensureCustAcBox();
  custAcItems = list || [];
  custAcActive = -1;
  if (custAcItems.length === 0 || !custAcTarget) { hideCustAc(); return; }

  box.innerHTML = custAcItems.map((c, i) => `
    <div class="ac-item" data-i="${i}"
         style="padding:8px 10px; cursor:pointer; display:flex; gap:8px; align-items:center">
      <span class="badge" style="font-size:11px">${escapeHtml((c.code || '').toUpperCase())}</span>
      <div style="flex:1; min-width:0">
        <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">
          ${escapeHtml(c.name ?? '')}
        </div>
      </div>
    </div>
  `).join('');

  [...box.querySelectorAll('.ac-item')].forEach((el) => {
    el.addEventListener('mouseenter', () => setCustActive(parseInt(el.dataset.i, 10)));
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      chooseCustActive(parseInt(el.dataset.i, 10));
    });
  });

  box.style.display = '';
  positionCustAcBox(custAcTarget);
}

function setCustActive(i) {
  custAcActive = i;
  [...custAcBox.querySelectorAll('.ac-item')].forEach((el, idx) => {
    el.style.background = idx === custAcActive ? 'rgba(0,0,0,.04)' : '';
  });
}

function chooseCustActive(i) {
  if (i < 0 || i >= custAcItems.length) return;
  const c = custAcItems[i];
  selectedCustomer = { id: c.id, code: (c.code || '').toUpperCase(), name: c.name || '' };
  if (custAcTarget) custAcTarget.value = `${selectedCustomer.code}${selectedCustomer.name ? ' - ' + selectedCustomer.name : ''}`;
  updateCustomerLink(selectedCustomer);
  hideCustAc();
  dlog('chooseCustActive', selectedCustomer);
}

function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  return data.items || data.results || data.data || data.list || [];
}

const fetchCustomerSuggest = debounce(async (term) => {
  try {
    const hasTerm = !!(term && term.length >= 1);
    const url = hasTerm
      ? `/customers?q=${encodeURIComponent(term)}&page=1&per_page=20`
      : `/customers?page=1&per_page=10`;
    const data = await jfetch(url);
    const list = normalizeList(data);
    const rows = (list || []).map(x => ({
      id: x.id,
      code: (x.code || '').toUpperCase(),
      name: x.name || '',
    }));
    dlog('fetchCustomerSuggest', { term, url, count: rows.length });
    renderCustAc(rows.slice(0, 20));
  } catch (e) {
    dlog('fetchCustomerSuggest ERR', e);
    renderCustAc([]);
  }
}, 220);

function attachCustomerAutocomplete(input) {
  input.setAttribute('autocomplete', 'off');
  input.placeholder = input.placeholder || 'Customer code or name';
  let composing = false;

  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => {
    composing = false;
    custAcTarget = input;
    const term = (input.value || '').trim();
    fetchCustomerSuggest(term);
    ensureCustAcBox(); positionCustAcBox(input);
  });

  input.addEventListener('input', () => {
    if (composing) return;
    custAcTarget = input;
    const term = (input.value || '').trim();
    if (!selectedCustomer || !term.toUpperCase().startsWith((selectedCustomer.code || '').toUpperCase())) {
      selectedCustomer = null;
      updateCustomerLink(null);
    }
    fetchCustomerSuggest(term);
    ensureCustAcBox(); positionCustAcBox(input);
  });

  input.addEventListener('focus', () => {
    custAcTarget = input;
    const term = (input.value || '').trim();
    fetchCustomerSuggest(term);
    ensureCustAcBox(); positionCustAcBox(input);
  });

  input.addEventListener('blur', () => setTimeout(hideCustAc, 100));

  input.addEventListener('keydown', (e) => {
    if (!custAcBox || custAcBox.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setCustActive(Math.min(custAcActive + 1, custAcItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setCustActive(Math.max(custAcActive - 1, 0));
    } else if (e.key === 'Enter') {
      if (custAcActive >= 0) { e.preventDefault(); chooseCustActive(custAcActive); }
    } else if (e.key === 'Escape') { hideCustAc(); }
  });

  window.addEventListener('resize', () => custAcTarget && positionCustAcBox(custAcTarget));
  window.addEventListener('scroll', () => custAcTarget && positionCustAcBox(custAcTarget), true);
}

/* ---------- load / save / delete (PO header) ---------- */
async function loadPO() {
  if (!poId) {
    $('errorBox') && ( $('errorBox').style.display = '', $('errorBox').textContent = 'Missing ?id= in URL' );
    setBusy(true);
    return;
  }
  setBusy(true);
  try {
    const po = await jfetch(`/pos/${encodeURIComponent(poId)}`);
    original = po;
    await fillForm(po);
    document.title = `PO · ${po.po_number ?? po.id}`;
    dlog('loadPO ok', po);
  } catch (e) {
    $('errorBox') && ( $('errorBox').style.display = '', $('errorBox').textContent = e?.message || 'Load failed' );
    dlog('loadPO ERR', e);
  } finally {
    setBusy(false);
  }
}

async function savePO() {
  const form = readForm();
  dlog('savePO readForm', form);

  if (!form.customer_code) {
    toast('Enter Customer Code', false);
    $('po_cust')?.focus();
    return;
  }

  const customer_id = await resolveCustomerIdFromCode(form.customer_code);
  dlog('savePO customer_id', customer_id);
  if (!customer_id) {
    toast('ไม่พบลูกค้าจากรหัสที่กรอก', false);
    $('po_cust')?.focus();
    return;
  }

  const payload = { po_number: form.po_number, customer_id, description: form.description };

  setBusy(true);
  try {
    const updated = await jfetch(`/pos/${encodeURIComponent(poId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    original = updated;

    // ใช้ updated.customer (PoOut) เพื่อแสดงชื่อ/โค้ด
    let cust = null;
    if (updated.customer) {
      cust = {
        id: updated.customer.id,
        code: (updated.customer.code || '').toUpperCase(),
        name: updated.customer.name || '',
      };
    } else if (updated.customer_id) {
      cust = await fetchCustomerById(updated.customer_id);
    }

    selectedCustomer = cust;
    $('po_cust').value = cust ? `${cust.code}${cust.name ? ' - ' + cust.name : ''}` : form.customer_code;
    updateCustomerLink(cust);

    fillFormBasic(updated);
    toast('Saved');

    hideHeaderEditor();
    dlog('savePO ok', updated);
  } catch (e) {
    toast(e?.message || 'Save failed', false);
    dlog('savePO ERR', e);
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

/* ===================== PO Lines (inline edit) ===================== */
let poLines = [];
let editingLineId = null;   // 'new' หรือ number
function fmtMoney(n) { return n == null ? '' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtQty(n) { return Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 }); }

async function loadLines() {
  if (!poId) return;
  try {
    const rows = await jfetch(`/pos/${encodeURIComponent(poId)}/lines`);
    poLines = rows || [];
    dlog('loadLines ok', poLines);
    renderLines();
  } catch (e) {
    console.error(e);
    dlog('loadLines ERR', e);
    poLines = [];
    renderLines();
  }
}

function renderLines() {
  const tb = $('tblLinesBody');
  if (!tb) return;

  const rows = editingLineId === 'new'
    ? [{ __isNew: true, id: null }].concat(poLines)
    : poLines.slice();

  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="8" class="empty">No lines</td></tr>`;
    return;
  }

  tb.innerHTML = rows.map((row, idxInRows) => {
    // คำนวณเลขลำดับสำหรับแถวปัจจุบัน
    const displayNo = row.__isNew
      ? ''                       // แถว new ไม่แสดงเลข
      : (editingLineId === 'new' ? idxInRows : idxInRows + 1);

    const isEdit = editingLineId === row.id || (row.__isNew && editingLineId === 'new');

    if (!isEdit) {
      const qty   = fmtQty(row.qty);
      const price = fmtMoney(row.unit_price);
      const due   = row.due_date ?? ''; // อาจไม่มีใน schema → ว่างไว้

      const partId = (row.part?.id ?? row.part_id ?? null);
      const partNo = row.part?.part_no ?? (row.part_id ?? '');
      const partNoCell = partId
        ? `<a href="${partDetailUrl(partId)}" class="link">${escapeHtml(String(partNo))}</a>`
        : `${escapeHtml(String(partNo))}`;

      const revText = row.revision?.rev ?? (row.rev?.rev ?? (row.revision_id ?? ''));
      const note = row.note ?? row.notes ?? '';

      return `
        <tr data-id="${row.id}">
          <td class="no-col" style="text-align:right">${escapeHtml(String(displayNo))}</td>
          <td>${partNoCell}</td>
          <td>${escapeHtml(String(revText ?? ''))}</td>
          <td style="text-align:right">${qty}</td>
          <td style="text-align:right">${price}</td>
          <td>${escapeHtml(due)}</td>
          <td>${escapeHtml(note)}</td>
          <td style="text-align:right; white-space:nowrap">
            <button class="btn ghost btn-sm" data-edit="${row.id}">Edit</button>
            <button class="btn danger btn-sm" data-del="${row.id}">Delete</button>
          </td>
        </tr>`;
    } else {
      const rid = row.__isNew ? 'new' : row.id;
      const partNo = row.part?.part_no ?? '';
      const revText = row.revision?.rev ?? row.rev?.rev ?? '';
      const qty = row.qty ?? '';
      const price = row.unit_price ?? '';
      const due = row.due_date ?? '';
      const note = row.note ?? row.notes ?? '';
      const partId = (row.part_id ?? row.part?.id) ?? '';
      const revisionId = (row.revision_id ?? row.revision?.id ?? row.rev?.id) ?? '';

      return `
        <tr data-id="${row.id ?? ''}" data-editing="1">
          <td class="no-col" style="text-align:right">${escapeHtml(String(displayNo))}</td>
          <td>
            <input id="r_part_code_${rid}" value="${escapeHtml(partNo)}" placeholder="e.g. P-10001" />
            <input id="r_part_id_${rid}" type="hidden" value="${escapeHtml(String(partId))}">
          </td>
          <td>
            <select id="r_rev_select_${rid}" disabled>
              <option value="">— Select revision —</option>
            </select>
            <input id="r_revision_id_${rid}" type="hidden" value="${escapeHtml(String(revisionId))}">
          </td>
          <td style="text-align:right">
            <input id="r_qty_${rid}" type="number" step="1" value="${escapeHtml(String(qty))}" style="text-align:right; width:120px">
          </td>
          <td style="text-align:right">
            <input id="r_price_${rid}" type="number" step="1" value="${escapeHtml(String(price))}" style="text-align:right; width:140px">
          </td>
          <td>
            <input id="r_due_${rid}" type="date" value="${escapeHtml(String(due))}">
          </td>
          <td>
            <input id="r_notes_${rid}" value="${escapeHtml(String(note))}">
          </td>
          <td style="text-align:right; white-space:nowrap">
            <button class="btn btn-sm" data-save="${rid}">Save</button>
            <button class="btn ghost btn-sm" data-cancel="${rid}">Cancel</button>
            ${row.__isNew ? '' : `<button class="btn danger btn-sm" data-del="${rid}">Delete</button>`}
          </td>
        </tr>`;
    }
  }).join('');

  // wire: ปุ่มแถวปกติ
  tb.querySelectorAll('[data-edit]').forEach(b => {
    b.addEventListener('click', () => startEdit(+b.dataset.edit));
  });
  tb.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', () => deleteLine(+b.dataset.del));
  });

  // wire: ปุ่มแถวแก้ไข
  tb.querySelectorAll('[data-save]').forEach(b => {
    b.addEventListener('click', () => saveLineInline(b.dataset.save));
  });
  tb.querySelectorAll('[data-cancel]').forEach(b => {
    b.addEventListener('click', cancelEdit);
  });

  // ---- autocomplete + rev dropdown สำหรับแถวที่กำลังแก้ไข ----
  if (editingLineId != null) {
    const rid = editingLineId;

    // ซิงก์ select → hidden id
    const sel = $(`r_rev_select_${rid}`);
    sel?.addEventListener('change', () => {
      $(`r_revision_id_${rid}`).value = sel.value || '';
    });

    const partInputEl = $(`r_part_code_${rid}`);
    if (partInputEl) attachRowPartAutocomplete(rid, partInputEl);

    if (rid !== 'new') {
      const rowData = poLines.find(x => x.id === Number(rid));
      const partIdCandidate = (rowData?.part_id ?? rowData?.part?.id) ?? null;
      const prevRevId = (rowData?.revision_id ?? rowData?.revision?.id ?? rowData?.rev?.id) ?? null;
      const prevRevText = (rowData?.revision?.rev ?? rowData?.rev?.rev) ?? '';

      if (partIdCandidate) {
        loadRevisionsForInto(partIdCandidate, rid, { preferId: prevRevId, preferText: prevRevText });
      } else {
        resetRevChoicesInto(rid);
      }
    }
  }
}

function startEdit(id) {
  if (editingLineId != null) { cancelEdit(); }
  editingLineId = id;
  dlog('startEdit', id);
  renderLines();
}

function startAddLine() {
  if (editingLineId != null) { cancelEdit(); }
  editingLineId = 'new';
  dlog('startAddLine');
  renderLines();
}

function cancelEdit() {
  dlog('cancelEdit');
  editingLineId = null;
  renderLines();
}

async function saveLineInline(rid) {
  const isNew = rid === 'new';

  const revSel = $(`r_rev_select_${rid}`);
  // อ่านค่าแบบเดิม
  let payload = {
    part_id:     numOrNull($(`r_part_id_${rid}`).value),
    revision_id: numOrNull(revSel?.value || $(`r_revision_id_${rid}`).value),
    qty:         numOrNull($(`r_qty_${rid}`).value),
    unit_price:  numOrNull($(`r_price_${rid}`).value),
    note:        strOrNull($(`r_notes_${rid}`).value),
    // อย่าใส่ due_date ถ้า backend ยังไม่รองรับ
  };

  // guard เบื้องต้น
  if (!payload.part_id) {
    toast('Enter Part No', false);
    return;
  }
  if (payload.revision_id && !payload.part_id) {
    toast('เลือก Part ก่อน แล้วค่อยเลือก Revision', false);
    return;
  }

  // 🧹 Normalize: อย่าส่ง null ให้ฟิลด์ที่ schema คาดว่าเป็น number
  if (payload.qty == null)          delete payload.qty;         // ให้ backend ใช้ default=1
  if (payload.unit_price == null)   delete payload.unit_price;  // ให้ backend ใช้ default=0
  if (payload.revision_id == null)  delete payload.revision_id; // Optional อยู่แล้ว
  if (payload.note == null)         delete payload.note;        // ว่างก็ไม่ต้องส่ง

  // (ถ้าอยาก fix ค่าที่นี่ก็ได้)
  // payload.qty ??= 1;
  // payload.unit_price ??= 0;

  dlog('saveLineInline payload(normalized)', { rid, isNew, payload });

  try {
    if (isNew) {
      const created = await jfetch(`/pos/${encodeURIComponent(poId)}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // กันพลาด header
        body: JSON.stringify(payload),
      });
      poLines.unshift(created);
      toast('Line added');
    } else {
      const updated = await jfetch(`/pos/${encodeURIComponent(poId)}/lines/${rid}`, {
        method: 'PATCH', // ให้ตรง backend
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const idx = poLines.findIndex(x => x.id === Number(rid));
      if (idx >= 0) poLines[idx] = updated;
      toast('Line updated');
    }
    editingLineId = null;
    renderLines();
  } catch (e) {
    // ช่วย debug 422: แสดงรายละเอียด error จาก FastAPI (ถ้า jfetch โยนมา)
    dlog('saveLineInline ERR', e);
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
    dlog('deleteLine ok', id);
  } catch (e) {
    toast(e?.message || 'Delete failed', false);
    dlog('deleteLine ERR', e);
  }
}

/* ---- Autocomplete Part / Rev (inline row) ---- */
let partAcBox, partItems = [], partActive = -1, partInput;
let currentPartRid = null; // row id ที่กำลัง attach autocomplete

function ensurePartBox() {
  if (partAcBox) return partAcBox;
  partAcBox = document.createElement('div');
  Object.assign(partAcBox.style, {
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
  partAcBox.className = 'ac-box';
  document.body.appendChild(partAcBox);
  return partAcBox;
}
function positionPartBox(input) {
  const r = input.getBoundingClientRect();
  partAcBox.style.left = `${window.scrollX + r.left}px`;
  partAcBox.style.top  = `${window.scrollY + r.bottom + 4}px`;
  partAcBox.style.width= `${r.width}px`;
}
function hidePartAc() {
  if (!partAcBox) return;
  partAcBox.style.display = 'none';
  partItems = [];
  partActive = -1;
}
function setPartActive(i) {
  partActive = i;
  [...partAcBox.querySelectorAll('.ac-item')].forEach((el, idx) => {
    el.style.background = idx === partActive ? 'rgba(0,0,0,.04)' : '';
  });
}
function renderPartAc(list) {
  const box = ensurePartBox();
  partItems = list || [];
  partActive = -1;
  if (!partItems.length) { hidePartAc(); return; }
  box.innerHTML = list.map((p, i) => `
    <div class="ac-item" data-i="${i}" style="padding:8px 10px; cursor:pointer; display:flex; gap:8px; align-items:center">
      <span class="badge" style="font-size:11px">${escapeHtml(p.part_no)}</span>
      <div style="flex:1"><div style="font-weight:600">${escapeHtml(p.name || '')}</div></div>
    </div>
  `).join('');
  [...box.querySelectorAll('.ac-item')].forEach(el => {
    el.addEventListener('mouseenter', () => setPartActive(parseInt(el.dataset.i, 10)));
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (currentPartRid != null) choosePartForRow(currentPartRid, parseInt(el.dataset.i, 10));
    });
  });
  box.style.display = '';
}

function normalizeItems(resp) {
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === 'object') return resp.items || [];
  return [];
}

const fetchPartSuggest = debounce(async (term) => {
  try {
    const url = !term || term.trim().length === 0
      ? `/parts?page=1&per_page=10`
      : `/parts?q=${encodeURIComponent(term)}&page=1&per_page=20`;

    const resp = await jfetch(url);
    const rows = normalizeItems(resp).map(p => ({
      id: p.id,
      part_no: (p.part_no || '').toUpperCase(),
      name: p.name || '',
    }));

    renderPartAc(rows.slice(0, 20));
    ensurePartBox();
    if (partInput) positionPartBox(partInput);
  } catch (e) {
    renderPartAc([]);
  }
}, 220);

// token สำหรับโหลด revisions (กัน race) + จำว่า list นี้สัมพันธ์กับ part ไหน
const revFetchToken = {};   // map: rid -> running token
const revListPartId = {};   // map: rid -> part_id ล่าสุดที่ใช้โหลด rev

function attachRowPartAutocomplete(rid, input) {
  currentPartRid = rid;
  partInput = input;
  input.setAttribute('autocomplete', 'off');

  input.addEventListener('input', () => {
    const term = (input.value || '').trim();
    $(`r_part_id_${rid}`).value = '';
    resetRevChoicesInto(rid);
    fetchPartSuggest(term);               // ดึงล่าสุด 10 ถ้า term ว่าง
    ensurePartBox(); positionPartBox(input);
  });

  input.addEventListener('focus', () => {
    const term = (input.value || '').trim();
    fetchPartSuggest(term);               // โชว์ล่าสุด 10 ตอนเพิ่งโฟกัส
    ensurePartBox(); positionPartBox(input);
  });

  input.addEventListener('blur', () => setTimeout(hidePartAc, 100));

  input.addEventListener('keydown', (e) => {
    if (!partAcBox || partAcBox.style.display === 'none') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setPartActive(Math.min(partActive + 1, partItems.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setPartActive(Math.max(partActive - 1, 0)); }
    else if (e.key === 'Enter') { if (partActive >= 0) { e.preventDefault(); choosePartForRow(rid, partActive); } }
    else if (e.key === 'Escape') { hidePartAc(); }
  });
}

async function choosePartForRow(rid, idx) {
  if (idx < 0 || idx >= partItems.length) return;
  const p = partItems[idx]; // {id, part_no, name}
  const pn = (p.part_no || '').toUpperCase();

  $(`r_part_code_${rid}`).value = pn;
  $(`r_part_id_${rid}`).value   = p.id;

  // เตรียม dropdown rev
  const sel = $(`r_rev_select_${rid}`);
  if (sel) {
    sel.disabled = true;
    sel.innerHTML = `<option value="">Loading…</option>`;
  }

  hidePartAc();
  await loadRevisionsForInto(p.id, rid);   // auto pick current/first
}

function resetRevChoicesInto(rid) {
  const sel = $(`r_rev_select_${rid}`);
  const hid = $(`r_revision_id_${rid}`);
  if (sel) {
    sel.disabled = true;
    sel.innerHTML = `<option value="">— Select revision —</option>`;
  }
  if (hid) hid.value = '';
  dlog('resetRevChoicesInto', rid);
}

/* ========= ใช้ /part-revisions?part_id=... ========= */
/* ========= Robust: โหลด revisions แบบลอง 2 endpoint ========= */
async function fetchPartRevisions(partId) {
  // ถ้า jfetch ของคุณ “ไม่” เติม /api/v1 ให้อัตโนมัติ → เปลี่ยนเป็น '/api/v1/part-revisions...' และ '/api/v1/parts/.../revisions'
  const tryEndpoints = [
    `/part-revisions?part_id=${encodeURIComponent(partId)}`,   // แบบที่ 1
    `/parts/${encodeURIComponent(partId)}/revisions`,          // แบบที่ 2
  ];

  for (const url of tryEndpoints) {
    try {
      const data = await jfetch(url);
      // รองรับทั้ง array ตรง ๆ และ {items:[...]}
      const arr = Array.isArray(data) ? data : (data?.items || []);
      if (Array.isArray(arr)) {
        const rows = arr.map(r => ({
          id: r.id,
          rev: r.rev || r.revision || r.code || '',   // กันกรณี field ชื่อไม่ตรง
          is_current: !!(r.is_current ?? r.current ?? r.active),
        }));
        if (rows.length || url.includes('/revisions')) {
          dlog('fetchPartRevisions OK', { url, count: rows.length });
          return rows;
        }
      }
    } catch (e) {
      dlog('fetchPartRevisions FAIL', { url, err: e?.message || e });
    }
  }
  return [];
}


async function loadRevisionsForInto(partId, rid, opts = {}) {
  // opts: { preferId?: number|null, preferText?: string|null }
  revFetchToken[rid] = (revFetchToken[rid] || 0) + 1;
  const myToken = revFetchToken[rid];

  const sel = $(`r_rev_select_${rid}`);
  const hid = $(`r_revision_id_${rid}`);
  if (!sel || !hid) return;

  // UI: loading
  sel.disabled = true;
  sel.innerHTML = `<option value="">Loading…</option>`;
  hid.value = '';

  try {
    const revs = await fetchPartRevisions(partId); // [{id, rev, is_current}]
    if (myToken !== revFetchToken[rid]) return; // โดนรีเฟรชทับแล้ว

    // เติมตัวเลือก
    sel.innerHTML = [`<option value="">— No revision —</option>`]
      .concat(revs.map(r => `<option value="${r.id}">${escapeHtml(r.rev)}</option>`))
      .join('');

    sel.disabled = false;
    revListPartId[rid] = partId;

    // เลือก default: preferId > preferText > current > first > none
    let chosenId = null;

    if (opts.preferId && revs.some(r => r.id === opts.preferId)) {
      chosenId = String(opts.preferId);
    } else if (opts.preferText) {
      const found = revs.find(r => String(r.rev) === String(opts.preferText));
      if (found) chosenId = String(found.id);
    } else {
      const cur = revs.find(r => r.is_current);
      if (cur) chosenId = String(cur.id);
      else if (revs[0]) chosenId = String(revs[0].id);
    }

    sel.value = chosenId ?? '';
    hid.value = sel.value || '';
  } catch (e) {
    // fail → เคลียร์เป็น none
    sel.disabled = false;
    sel.innerHTML = `<option value="">— No revision —</option>`;
    hid.value = '';
  }
}

/* ---------- utils ---------- */
function numOrNull(v){ const n = Number(v); return isFinite(n) ? n : null }
function strOrNull(v){ v = (v ?? '').trim(); return v ? v : null }

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  $('btnHeaderEdit')?.addEventListener('click', () => {
    headerOpen ? hideHeaderEditor() : showHeaderEditor();
  });

  $('btnSave')?.addEventListener('click', savePO);
  $('btnReset')?.addEventListener('click', resetForm);
  $('btnDelete')?.addEventListener('click', deletePO);
  $('po_no')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') savePO(); });
  $('btnAddLine')?.addEventListener('click', startAddLine);

  loadPO().then(loadLines);
});
