// /static/js/page-lot-detail.js
import { $, jfetch, toast } from './api.js';
import { attachAutocomplete } from './autocomplete.js';

const DEBUG = false;
const dlog = (...a) => { if (DEBUG) console.log('[LOT-D]', ...a); };

const qs = new URLSearchParams(location.search);
const lotId = qs.get('id');

const PO_PATH = '/pos';
const partDetailUrl = (id) => `/static/part-detail.html?id=${encodeURIComponent(id)}`;
const poDetailUrl   = (id) => `/static/pos-detail.html?id=${encodeURIComponent(id)}`;
const lotListUrl    = '/static/lots.html';

/* ---------------- helpers ---------------- */
const escapeHtml = (s) => String(s ?? '')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#39;');

function setBusy(b) {
  ['btnSave','btnReset','btnDelete'].forEach(id => { const el = $(id); if (el) el.disabled = b; });
  $('hint') && ($('hint').textContent = b ? 'Working…' : '');
}

function toLocalDT(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2,'0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth()+1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}
function fromLocalDT(inputValue) {
  const v = (inputValue || '').trim();
  if (!v) return null;
  return v; // keep as local string; backend parses
}

/* ---------------- state ---------------- */
let original = null;
let selectedPart = null;        // { id, part_no, name }
let selectedRevisionId = null;  // number|null
let selectedPO = null;          // { id, po_number, description }

/* ---------------- header view toggle ---------------- */
let headerOpen = false;
function showHeaderEditor() {
  const sec = $('page-lot-detail');
  if (!sec) return;
  sec.hidden = false;
  $('btnHeaderEdit').textContent = 'Cancel';
  headerOpen = true;
  // Do NOT force-open autocompletes here
}
function hideHeaderEditor() {
  const sec = $('page-lot-detail');
  if (!sec) return;
  if (original) fillForm(original); // reset before hide
  sec.hidden = true;
  $('btnHeaderEdit').textContent = 'Edit Lot';
  headerOpen = false;
}

/* ---------------- Part + Revision helpers ---------------- */
function resetRevisionSelect(placeholder = '— Select revision —') {
  const sel = $('lot_rev');
  if (!sel) return;
  sel.disabled = true;
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  selectedRevisionId = null;
}

async function loadRevisionsForPart(partId, opts = {}) {
  // opts: { preferId, preferText }
  const sel = $('lot_rev');
  if (!sel) return;

  sel.disabled = true;
  sel.innerHTML = `<option value="">Loading…</option>`;
  selectedRevisionId = null;

  try {
    const endpoints = [
      `/part-revisions?part_id=${partId}`,
      `/part_revisions?part_id=${partId}`,
      `/parts/${partId}/revisions`,
    ];
    let rows = [];
    for (const url of endpoints) {
      try {
        const r = await jfetch(url);
        const arr = Array.isArray(r) ? r : (r?.items ?? []);
        if (Array.isArray(arr)) { rows = arr; break; }
      } catch { /* try next */ }
    }

    if (!rows.length) {
      sel.innerHTML = `<option value="">— No revision —</option>`;
      sel.disabled = false;
      return;
    }

    sel.innerHTML = rows.map(r =>
      `<option value="${r.id}" ${r.is_current ? 'selected' : ''}>${escapeHtml(r.rev || '')}${r.is_current ? ' (current)' : ''}</option>`
    ).join('');

    // default choice: preferId > preferText > current > first
    let chosenId = null;
    if (opts.preferId && rows.some(r => r.id === opts.preferId)) {
      chosenId = String(opts.preferId);
    } else if (opts.preferText) {
      const f = rows.find(r => String(r.rev) === String(opts.preferText));
      if (f) chosenId = String(f.id);
    } else {
      const cur = rows.find(r => r.is_current) || rows[0];
      chosenId = cur ? String(cur.id) : '';
    }
    sel.value = chosenId ?? '';
    selectedRevisionId = sel.value ? Number(sel.value) : null;
  } catch (e) {
    console.error('loadRevisionsForPart error:', e);
    resetRevisionSelect('— No revision —');
    toast('Load revisions failed', false);
  } finally {
    sel.disabled = false;
  }
}

/* ---------------- Autocomplete: Part ---------------- */
async function searchParts(term) {
  const q = (term || '').trim();
  if (!q) {
    try {
      const res = await jfetch(`/parts?page=1&per_page=10`);
      const items = Array.isArray(res) ? res : (res.items ?? []);
      return items.map(p => ({ id: p.id, part_no: p.part_no ?? '', name: p.name ?? '' }));
    } catch { return []; }
  }
  try {
    const res = await jfetch(`/parts?q=${encodeURIComponent(q)}&page=1&per_page=20`);
    const items = Array.isArray(res) ? res : (res.items ?? []);
    return items.map(p => ({ id: p.id, part_no: p.part_no ?? '', name: p.name ?? '' }));
  } catch { return []; }
}

attachAutocomplete($('lot_part'), {
  fetchItems: searchParts,
  getDisplayValue: it => it ? `${it.part_no} — ${it.name}` : '',
  renderItem: it => `<div class="ac-row"><b>${escapeHtml(it.part_no)}</b> — ${escapeHtml(it.name || '')}</div>`,
  onPick: async (it) => {
    selectedPart = it || null;
    $('lot_part').value = it ? `${it.part_no} — ${it.name}` : '';
    const a = $('link_part'), h = $('partNameHint');
    if (a) a.href = it ? partDetailUrl(it.id) : '#';
    if (a) a.textContent = it ? it.part_no : '';
    if (h) h.textContent = it ? (it.name || '') : '';
    resetRevisionSelect();
    if (it?.id) await loadRevisionsForPart(it.id);
  },
  openOnFocus: false,   // ✅ don't open on focus/load
  minChars: 1,          // ✅ only open after typing
  debounceMs: 200,
  maxHeight: 260,
});

$('lot_part')?.addEventListener('input', () => {
  selectedPart = null;
  const a = $('link_part'); if (a) { a.href='#'; a.textContent=''; }
  const h = $('partNameHint'); if (h) h.textContent='';
  resetRevisionSelect();
});
$('lot_rev')?.addEventListener('change', () => {
  const v = Number(($('lot_rev').value || '').trim());
  selectedRevisionId = Number.isFinite(v) && v > 0 ? v : null;
});

/* ---------------- Autocomplete: PO ---------------- */
async function searchPOs(term) {
  const q = (term || '').trim();
  if (!q) {
    try {
      const res = await jfetch(`${PO_PATH}?page=1&page_size=10`);
      const items = Array.isArray(res) ? res : (res.items ?? []);
      return items.map(p => ({ id: p.id, po_number: p.po_number ?? String(p.id), description: p.description ?? '' }));
    } catch { return []; }
  }
  try {
    const res = await jfetch(`${PO_PATH}?q=${encodeURIComponent(q)}&page=1&page_size=20`);
    const items = Array.isArray(res) ? res : (res.items ?? []);
    return items.map(p => ({ id: p.id, po_number: p.po_number ?? String(p.id), description: p.description ?? '' }));
  } catch { return []; }
}

attachAutocomplete($('lot_poid'), {
  fetchItems: searchPOs,
  getDisplayValue: it => it ? `${it.po_number} — ${it.description || ''}` : '',
  renderItem: it => `<div class="ac-row"><b>${escapeHtml(it.po_number)}</b> — ${escapeHtml(it.description || '')}</div>`,
  onPick: (it) => {
    selectedPO = it || null;
    $('lot_poid').value = it ? `${it.po_number} — ${it.description || ''}` : '';
    const a = $('link_po');
    if (a) { a.href = it ? poDetailUrl(it.id) : '#'; a.textContent = it ? it.po_number : ''; }
  },
  openOnFocus: false,   // ✅ don't open on focus/load
  minChars: 1,          // ✅ only open after typing
  debounceMs: 200,
  maxHeight: 260,
});
$('lot_poid')?.addEventListener('input', () => {
  selectedPO = null;
  const a = $('link_po'); if (a) { a.href='#'; a.textContent=''; }
});

/* ---------------- fill / read ---------------- */
function fillFormBasic(l) {
  $('lot_no').value = l.lot_no ?? '';
  $('lot_qty').value = Number(l.planned_qty ?? 0);
  $('lot_status').value = l.status ?? 'in_process';
  $('lot_started').value = toLocalDT(l.started_at);
  $('lot_finished').value = toLocalDT(l.finished_at);
  $('subTitle').textContent = `#${l.id} — ${l.lot_no ?? ''}`;
}

async function fillForm(lot) {
  fillFormBasic(lot);

  // Part (text + link) and revisions
  const part = lot.part || null;
  const a = $('link_part'), h = $('partNameHint');
  if (part) {
    $('lot_part').value = `${part.part_no ?? ''}${part.name ? ' — ' + part.name : ''}`;
    if (a) { a.href = partDetailUrl(part.id); a.textContent = part.part_no ?? ''; }
    if (h) h.textContent = part.name ?? '';
    selectedPart = { id: part.id, part_no: part.part_no ?? '', name: part.name ?? '' };
    await loadRevisionsForPart(part.id, { preferId: lot.part_revision_id });
  } else {
    $('lot_part').value = '';
    if (a) { a.href = '#'; a.textContent = ''; }
    if (h) h.textContent = '';
    selectedPart = null;
    resetRevisionSelect();
  }

  // PO (text + link)
  const po = lot.po || null;
  const apo = $('link_po');
  if (po) {
    $('lot_poid').value = `${po.po_number ?? po.id}${po.description ? ' — ' + po.description : ''}`;
    if (apo) { apo.href = poDetailUrl(po.id); apo.textContent = po.po_number ?? po.id; }
    selectedPO = { id: po.id, po_number: po.po_number ?? String(po.id), description: po.description ?? '' };
  } else {
    $('lot_poid').value = '';
    if (apo) { apo.href = '#'; apo.textContent = ''; }
    selectedPO = null;
  }

  // Travelers (if any)
  renderTravelers(lot);
}

function readForm() {
  return {
    lot_no: ($('lot_no').value ?? '').trim().toUpperCase() || null,
    part_id: selectedPart?.id ?? null,
    part_revision_id: selectedRevisionId ?? (Number($('lot_rev')?.value || 0) || null),
    po_id: selectedPO?.id ?? null,
    planned_qty: Number($('lot_qty').value || 0) || 0,
    status: $('lot_status').value || 'in_process',
    started_at: fromLocalDT($('lot_started').value),
    finished_at: fromLocalDT($('lot_finished').value),
  };
}

/* ---------------- load / save / delete ---------------- */
async function loadLot() {
  if (!lotId) {
    const eb = $('errorBox'); if (eb) { eb.style.display=''; eb.textContent='Missing ?id='; }
    setBusy(true);
    return;
  }
  setBusy(true);
  try {
    const lot = await jfetch(`/lots/${encodeURIComponent(lotId)}`);
    original = lot;
    await fillForm(lot);
    document.title = `Lot · ${lot.lot_no ?? lot.id}`;
    dlog('loadLot ok', lot);
  } catch (e) {
    const eb = $('errorBox'); if (eb) { eb.style.display=''; eb.textContent = e?.message || 'Load failed'; }
    dlog('loadLot ERR', e);
  } finally {
    setBusy(false);
  }
}

async function saveLot() {
  const form = readForm();
  dlog('saveLot form', form);

  if (!form.part_id) {
    toast('Please choose a Part', false);
    $('lot_part')?.focus();
    return;
  }

  setBusy(true);
  try {
    const payload = {
      lot_no: form.lot_no,
      part_id: form.part_id,
      part_revision_id: form.part_revision_id,
      po_id: form.po_id,
      planned_qty: form.planned_qty,
      status: form.status,
      started_at: form.started_at,
      finished_at: form.finished_at,
    };
    const updated = await jfetch(`/lots/${encodeURIComponent(lotId)}`, {
      method: 'PUT',             // ✅ FastAPI router uses PUT
      body: JSON.stringify(payload),
    });
    original = updated;
    await fillForm(updated);
    toast('Saved');
    hideHeaderEditor();
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('revision') && msg.includes('belong')) {
      $('lot_rev') && ($('lot_rev').value = '');
      selectedRevisionId = null;
      toast('Selected revision doesn’t belong to this part. Cleared — try again.', false);
    } else {
      toast(e?.message || 'Save failed', false);
    }
    dlog('saveLot ERR', e);
  } finally {
    setBusy(false);
  }
}

async function deleteLot() {
  if (!confirm('ลบ Lot นี้?\nThis action cannot be undone.')) return;
  setBusy(true);
  try {
    await jfetch(`/lots/${encodeURIComponent(lotId)}`, { method: 'DELETE' });
    toast('Deleted');
    location.href = lotListUrl;
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

/* ---------------- Travelers render (read-only list) ---------------- */
function renderTravelers(lot) {
  const tb = $('tblTravBody');
  if (!tb) return;
  const ids = lot.traveler_ids || lot.travs || [];
  if (!Array.isArray(ids) || !ids.length) {
    tb.innerHTML = `<tr><td colspan="4" class="empty">No travelers</td></tr>`;
    return;
  }
  tb.innerHTML = ids.map((id, i) => `
    <tr>
      <td style="text-align:right">${i+1}</td>
      <td><a href="/static/traveler-detail.html?id=${id}">#${id}</a></td>
      <td></td>
      <td></td>
    </tr>
  `).join('');
}

/* ---------------- boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  $('btnHeaderEdit')?.addEventListener('click', () => {
    headerOpen ? hideHeaderEditor() : showHeaderEditor();
  });
  $('btnSave')?.addEventListener('click', saveLot);
  $('btnReset')?.addEventListener('click', resetForm);
  $('btnDelete')?.addEventListener('click', deleteLot);
  $('btnPing')?.addEventListener('click', () => {
    jfetch('/health').then(()=>toast('API OK')).catch(()=>toast('API ไม่ตอบ'));
  });

  loadLot();
});
