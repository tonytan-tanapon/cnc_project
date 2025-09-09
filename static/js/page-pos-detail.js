// /static/js/page-pos-detail.js
import { $, jfetch, toast } from './api.js';

const DEBUG = false;
const dlog = (...args) => { if (DEBUG) console.log('[PO-D]', ...args); };

const qs = new URLSearchParams(location.search);
const poId = qs.get('id');

let original = null;            // สำหรับ Reset
let selectedCustomer = null;    // { id, code, name } ที่เลือกจาก autocomplete
const OPEN_PART_SUGGEST_ON_FOCUS = false;
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

  dlog('showHeaderEditor');

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
  dlog('hideHeaderEditor');
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
  const cust = await fetchCustomerById(po.customer_id);
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
  $('hint').textContent = b ? 'Working…' : '';
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
    dlog('loadPO ok', po);
  } catch (e) {
    $('errorBox').style.display = '';
    $('errorBox').textContent = e?.message || 'Load failed';
    dlog('loadPO ERR', e);
  } finally {
    setBusy(false);
  }
}

async function savePO() {
  const form = readForm();
  dlog('savePO readForm', form);

  if (!form.customer_code) {
    toast('กรุณาใส่ Customer Code', false);
    $('po_cust').focus();
    return;
  }

  const customer_id = await resolveCustomerIdFromCode(form.customer_code);
  dlog('savePO customer_id', customer_id);
  if (!customer_id) {
    toast('ไม่พบลูกค้าจากรหัสที่กรอก', false);
    $('po_cust').focus();
    return;
  }

  const payload = { po_number: form.po_number, customer_id, description: form.description };

  setBusy(true);
  try {
    const updated = await jfetch(`/pos/${encodeURIComponent(poId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    original = updated;

    const cust = await fetchCustomerById(updated.customer_id);
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

  const rows = editingLineId === 'new'
    ? [{ __isNew: true, id: null }].concat(poLines)
    : poLines.slice();

  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="7" class="empty">No lines</td></tr>`;
    return;
  }

  tb.innerHTML = rows.map(row => {
    const isEdit = editingLineId === row.id || (row.__isNew && editingLineId === 'new');

    if (!isEdit) {
  const qty   = fmtQty(row.qty_ordered);
  const price = fmtMoney(row.unit_price);
  const due   = row.due_date ?? '';

  // 👇 เพิ่มสองบรรทัดนี้แทนของเดิม
  const partId = (row.part?.id ?? row.part_id ?? null);
  const partNo = row.part?.part_no ?? (row.part_id ?? '');

  // 👇 ถ้ามี id ให้ลิงก์ไปหน้า part-detail
  const partNoCell = partId
    ? `<a href="${partDetailUrl(partId)}" class="link">${escapeHtml(String(partNo))}</a>`
    : `${escapeHtml(String(partNo))}`;

  const rev   = row.rev?.rev ?? (row.revision_id ?? '');
  const notes = escapeHtml(row.notes ?? '');
  return `
    <tr data-id="${row.id}">
      <td>${partNoCell}</td>
      <td>${escapeHtml(String(rev))}</td>
      <td style="text-align:right">${qty}</td>
      <td style="text-align:right">${price}</td>
      <td>${escapeHtml(due)}</td>
      <td>${notes}</td>
      <td style="text-align:right; white-space:nowrap">
        <button class="btn ghost btn-sm" data-edit="${row.id}">Edit</button>
        <button class="btn danger btn-sm" data-del="${row.id}">Delete</button>
      </td>
    </tr>`;
}
 else {
      const rid = row.__isNew ? 'new' : row.id;
      const partNo = row.part?.part_no ?? '';
      const rev = row.rev?.rev ?? '';
      const qty = row.qty_ordered ?? '';
      const price = row.unit_price ?? '';
      const due = row.due_date ?? '';
      const notes = row.notes ?? '';
      const partId = (row.part_id ?? row.part?.id) ?? '';          // fallback part.id
      const revisionId = (row.revision_id ?? row.rev?.id) ?? '';   // fallback rev.id

      return `
        <tr data-id="${row.id ?? ''}" data-editing="1">
          <td>
            <input id="r_part_code_${rid}" value="${escapeHtml(partNo)}" placeholder="e.g. P-10001" />
            <input id="r_part_id_${rid}" type="hidden" value="${escapeHtml(String(partId))}">
          </td>
          <td>
            <input id="r_rev_${rid}" value="${escapeHtml(String(rev))}" list="revOptions_${rid}" placeholder="e.g. A" />
            <datalist id="revOptions_${rid}"></datalist>
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
            <input id="r_notes_${rid}" value="${escapeHtml(String(notes))}">
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

  // ---- attach autocomplete + เติม rev list ให้แถวที่กำลังแก้ไข ----
  if (editingLineId != null) {
    const rid = editingLineId;
    const partInputEl = $(`r_part_code_${rid}`);
    if (partInputEl) attachRowPartAutocomplete(rid, partInputEl);

    // ถ้าเป็นแถวเดิม (rid != 'new') เติมรายการ Rev จาก part_id หรือ part.id
    if (rid !== 'new') {
      const rowData = poLines.find(x => x.id === Number(rid));
      const partIdCandidate = (rowData?.part_id ?? rowData?.part?.id) ?? null;
      const prevRevId = (rowData?.revision_id ?? rowData?.rev?.id) ?? null;
      const prevRevText = rowData?.rev?.rev ?? '';

      dlog('edit-row attach rev datalist', { rid, partIdCandidate, prevRevId, prevRevText, rowData });

      if (partIdCandidate) {
        loadRevisionsForInto(partIdCandidate, rid).then(() => {
          // จับคู่ตาม id
          if (prevRevId) {
            const dl = $(`revOptions_${rid}`);
            const match = [...(dl?.children || [])].find(o => (o.getAttribute('data-id') || '') === String(prevRevId));
            if (match) {
              $(`r_rev_${rid}`).value = match.value;
              $(`r_revision_id_${rid}`).value = String(prevRevId);
              dlog('matched by revision_id', { value: match.value, id: prevRevId });
              return;
            }
          }
          // จับคู่ตาม rev text
          if (prevRevText) {
            const dl = $(`revOptions_${rid}`);
            const opt = [...(dl?.children || [])].find(o => (o.value || '') === String(prevRevText));
            if (opt) {
              $(`r_rev_${rid}`).value = opt.value;
              $(`r_revision_id_${rid}`).value = opt.getAttribute('data-id') || '';
              dlog('matched by rev text', { value: opt.value, id: opt.getAttribute('data-id') });
              return;
            }
          }
          dlog('no previous rev to match; keep default');
        });
      } else {
        dlog('NO partIdCandidate – skip loading revs');
      }
    }

    // sync rev -> revision_id
    const revInput = $(`r_rev_${rid}`);
    revInput?.addEventListener('change', () => {
      const dl = $(`revOptions_${rid}`);
      let matchId = '';
      if (dl) {
        const opt = [...dl.children].find(o => o.value === revInput.value.trim());
        if (opt) matchId = opt.getAttribute('data-id') || '';
      }
      $(`r_revision_id_${rid}`).value = matchId;
      dlog('rev change -> set revision_id', { rid, rev: revInput.value, matchId });
    });

    revInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const dl = $(`revOptions_${rid}`);
        if (!dl) return;
        const opt = [...dl.children].find(o => o.value === revInput.value.trim());
        if (opt) {
          $(`r_revision_id_${rid}`).value = opt.getAttribute('data-id') || '';
          e.preventDefault();
          $(`r_qty_${rid}`)?.focus();
          dlog('rev Enter -> matched', { rid, value: opt.value, id: opt.getAttribute('data-id') });
        }
      }
    });
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
  // $(`r_part_code_new`)?.focus();
}
// function startAddLine() {
//   if (editingLineId != null) { cancelEdit(); }
//   editingLineId = 'new';
//   renderLines();
//   const el = $(`r_part_code_new`);
//   if (el) {
//     el.focus(); 
//     // ไม่เรียก suggest ใด ๆ ที่นี่
//   }
// }



function cancelEdit() {
  dlog('cancelEdit');
  editingLineId = null;
  renderLines();
}

async function saveLineInline(rid) {
  const isNew = rid === 'new';
  const payload = {
    part_id: numOrNull($(`r_part_id_${rid}`).value),
    revision_id: numOrNull($(`r_revision_id_${rid}`).value),
    part_code: strOrNull($(`r_part_code_${rid}`).value),
    rev: strOrNull($(`r_rev_${rid}`).value),
    qty_ordered: numOrNull($(`r_qty_${rid}`).value),
    unit_price: numOrNull($(`r_price_${rid}`).value),
    due_date: strOrNull($(`r_due_${rid}`).value),
    notes: strOrNull($(`r_notes_${rid}`).value),
  };
  dlog('saveLineInline payload', { rid, isNew, payload });

  if (!payload.part_id && !payload.part_code) {
    toast('Enter Part No', false);
    return;
  }

  try {
    if (isNew) {
      const created = await jfetch(`/pos/${encodeURIComponent(poId)}/lines`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      poLines.unshift(created);
      toast('Line added');
      dlog('saveLineInline created', created);
    } else {
      const updated = await jfetch(`/pos/${encodeURIComponent(poId)}/lines/${rid}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const idx = poLines.findIndex(x => x.id === Number(rid));
      if (idx >= 0) poLines[idx] = updated;
      toast('Line updated');
      dlog('saveLineInline updated', updated);
    }
    editingLineId = null;
    renderLines();
  } catch (e) {
    toast(e?.message || 'Save failed', false);
    dlog('saveLineInline ERR', e);
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

// 1) แทนที่ฟังก์ชัน fetchPartSuggest เดิมทั้งหมดด้วยเวอร์ชันนี้
// รองรับทั้ง response เป็น array และแบบมี {items, total, ...}
function normalizeItems(resp) {
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === 'object') return resp.items || [];
  return [];
}

const fetchPartSuggest = debounce(async (term) => {
  try {
    // ขอแบบมีหน้าให้ชัด (กัน backend คืนมาเยอะเกิน)
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

// 2) ใน attachRowPartAutocomplete ให้เรียก fetchPartSuggest แม้ term ว่างตอน focus
function attachRowPartAutocomplete(rid, input) {
  currentPartRid = rid;
  partInput = input;
  input.setAttribute('autocomplete', 'off');

  input.addEventListener('input', () => {
    const term = (input.value || '').trim();
    $(`r_part_id_${rid}`).value = '';
    resetRevChoicesInto(rid);
    fetchPartSuggest(term);               // <-- จะดึงล่าสุด 10 ถ้า term ว่าง
    ensurePartBox(); positionPartBox(input);
  });

  input.addEventListener('focus', () => {
    const term = (input.value || '').trim();
    fetchPartSuggest(term);               // <-- โชว์ล่าสุด 10 ตอนเพิ่งโฟกัส
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
  hidePartAc();
  await loadRevisionsForInto(p.id, rid);
}

function resetRevChoicesInto(rid) {
  const dl = $(`revOptions_${rid}`);
  if (dl) dl.innerHTML = '';
  const revInput = $(`r_rev_${rid}`);
  if (revInput) revInput.value = '';
  const h = $(`r_revision_id_${rid}`);
  if (h) h.value = '';
  dlog('resetRevChoicesInto', rid);
}

/* ========= FIXED: ใช้ /part-revisions?part_id=... ตาม backend ========= */
async function fetchPartRevisions(partId) {
  const url = `/part-revisions?part_id=${encodeURIComponent(partId)}`;
  const data = await jfetch(url); // FastAPI ของคุณกำหนด response_model=List[PartRevisionOut]
  // data = [{id, part_id, rev, is_current, ...}]
  const rows = (Array.isArray(data) ? data : []).map(r => ({
    id: r.id,
    rev: r.rev,
    is_current: !!r.is_current,
  }));
  dlog('fetchPartRevisions OK', { url, count: rows.length });
  return rows;
}

async function loadRevisionsForInto(partId, rid) {
  try {
    const revs = await fetchPartRevisions(partId);
    const dl = $(`revOptions_${rid}`);
    if (!dl) return;

    dl.innerHTML = revs
      .map(r => `<option value="${escapeHtml(r.rev)}" data-id="${r.id}"></option>`)
      .join('');

    const current = revs.find(r => r.is_current);
    if (current) {
      $(`r_rev_${rid}`).value = current.rev;
      $(`r_revision_id_${rid}`).value = current.id;
      dlog('loadRevisionsForInto -> current', { rid, partId, current });
    } else if (revs.length > 0) {
      $(`r_rev_${rid}`).value = revs[0].rev;
      $(`r_revision_id_${rid}`).value = revs[0].id;
      dlog('loadRevisionsForInto -> first', { rid, partId, first: revs[0] });
    } else {
      $(`r_rev_${rid}`).value = '';
      $(`r_revision_id_${rid}`).value = '';
      dlog('loadRevisionsForInto -> empty list', { rid, partId });
    }
  } catch (e) {
    resetRevChoicesInto(rid);
    dlog('loadRevisionsForInto ERR', { partId, rid, err: e });
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
