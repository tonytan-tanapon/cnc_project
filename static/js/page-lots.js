// /static/js/page-lots.js (v2.1) — TableX + attachAutocomplete + pager + tokenized search
import { $, jfetch, toast, initTopbar } from '/static/js/api.js';
import { renderTableX } from '/static/js/tablex.js';
import { attachAutocomplete } from '/static/js/autocomplete.js';

/* ---------------- element refs ---------------- */
const inputSearch = $('l_q') || $('globalSearch');
const selPerPage  = $('l_per_page');
const btnReload   = $('l_reload');
const tableEl     = $('l_table');

const lotNoEl     = $('l_no');
const partEl      = $('l_part');
const revSelEl    = $('l_rev_id');
const poEl        = $('l_poid');
const qtyEl       = $('l_qty');
const statusEl    = $('l_status');
const btnCreate   = $('l_create');

const LOT_DETAIL_URL = (id) => `/static/lot-detail.html?id=${encodeURIComponent(id)}`;
const PO_PATH = '/pos';

/* ---------------- utils ---------------- */
const esc = (s) => String(s ?? '')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#39;');

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
};

const debounce = (fn, ms=250)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

/* ---------------- state ---------------- */
const state = {
  page: 1,
  pageSize: Number(selPerPage?.value || 20),
  q: '',
  total: 0,
  items: [],
};

/* ---------------- Part autocomplete + revisions ---------------- */
let selectedPart = null;        // { id, part_no, name }
let selectedRevisionId = null;  // number|null

function resetRevisionSelect(placeholder = '— Select revision —') {
  if (!revSelEl) return;
  revSelEl.disabled = true;
  revSelEl.innerHTML = `<option value="">${placeholder}</option>`;
  selectedRevisionId = null;
}

resetRevisionSelect(); // initial

async function loadRevisionsForPart(partId) {
  if (!revSelEl) return;
  selectedRevisionId = null;

  revSelEl.disabled = true;
  revSelEl.innerHTML = `<option value="">Loading…</option>`;

  try {
    // Try multiple endpoints for compatibility
    const endpoints = [
      `/part-revisions?part_id=${partId}`,
      `/part_revisions?part_id=${partId}`,
      `/parts/${partId}/revisions`,
    ];
    let res = null, list = [];
    for (const url of endpoints) {
      try {
        const r = await jfetch(url);
        list = Array.isArray(r) ? r : (r?.items ?? []);
        if (Array.isArray(list)) { res = list; break; }
      } catch { /* try next */ }
    }
    const rows = Array.isArray(res) ? res : [];

    if (!rows.length) {
      // No revisions: optional revision
      revSelEl.innerHTML = `<option value="">— No revision —</option>`;
      revSelEl.disabled = false;
      selectedRevisionId = null;
      return;
    }

    // Render options
    revSelEl.innerHTML = rows.map(r =>
      `<option value="${r.id}" ${r.is_current ? 'selected' : ''}>${esc(r.rev || '')}${r.is_current ? ' (current)' : ''}</option>`
    ).join('');

    // Pick current if available, else first
    const current = rows.find(r => r.is_current) || rows[0];
    selectedRevisionId = current?.id ?? null;
    if (selectedRevisionId) revSelEl.value = String(selectedRevisionId);
  } catch (e) {
    console.error('loadRevisionsForPart error:', e);
    resetRevisionSelect('— No revision —');
    toast('Load revisions failed', false);
  } finally {
    revSelEl.disabled = false;
  }
}

async function searchParts(term) {
  const q = (term || '').trim();

  // When empty: show first 10 parts (for open-on-focus UX)
  if (!q) {
    try {
      const res = await jfetch(`/parts?page=1&per_page=10`);
      const items = Array.isArray(res) ? res : (res.items ?? []);
      return items.map(p => ({
        id: p.id ?? p.part_id,
        part_no: p.part_no ?? '',
        name: p.name ?? '',
      }));
    } catch { return []; }
  }

  try {
    // main: offset list
    const res = await jfetch(`/parts?q=${encodeURIComponent(q)}&page=1&per_page=10`);
    const items = Array.isArray(res) ? res : (res.items ?? []);
    return items.map(p => ({
      id: p.id ?? p.part_id,
      part_no: p.part_no ?? '',
      name: p.name ?? '',
    }));
  } catch {
    // fallback: keyset if you have it
    try {
      const res2 = await jfetch(`/parts/keyset?q=${encodeURIComponent(q)}&limit=10`);
      const items2 = Array.isArray(res2) ? res2 : (res2.items ?? []);
      return items2.map(p => ({
        id: p.id ?? p.part_id,
        part_no: p.part_no ?? '',
        name: p.name ?? '',
      }));
    } catch { return []; }
  }
}

attachAutocomplete(partEl, {
  fetchItems: searchParts,
  getDisplayValue: it => it ? `${it.part_no} — ${it.name}` : '',
  renderItem: it => `<div class="ac-row"><b>${esc(it.part_no)}</b> — ${esc(it.name)}</div>`,
  onPick: async (it) => {
    selectedPart = it || null;
    partEl.value = it ? `${it.part_no} — ${it.name}` : '';
    resetRevisionSelect();
    if (it?.id) await loadRevisionsForPart(it.id);
  },
  openOnFocus: true,   // will call fetch with current value; we support empty → first 10
  minChars: 0,         // allow showing suggestions even when empty
  debounceMs: 200,
  maxHeight: 260,
});

partEl?.addEventListener('input', () => {
  selectedPart = null;
  resetRevisionSelect();
});

revSelEl?.addEventListener('change', () => {
  const v = Number(revSelEl.value || 0);
  selectedRevisionId = Number.isFinite(v) && v > 0 ? v : null;
});

/* ---------------- PO autocomplete ---------------- */
let selectedPO = null; // { id, po_number, description }

async function searchPOs(term) {
  const q = (term || '').trim();

  // When empty: show first 10 POs
  if (!q) {
    try {
      const res = await jfetch(`${PO_PATH}?page=1&page_size=10`);
      const items = Array.isArray(res) ? res : (res.items ?? []);
      return items.map(p => ({
        id: p.id,
        po_number: p.po_number ?? String(p.id),
        description: p.description ?? '',
      }));
    } catch { return []; }
  }

  try {
    const res = await jfetch(`${PO_PATH}?q=${encodeURIComponent(q)}&page=1&page_size=10`);
    const items = Array.isArray(res) ? res : (res.items ?? []);
    return items.map(p => ({
      id: p.id,
      po_number: p.po_number ?? String(p.id),
      description: p.description ?? '',
    }));
  } catch { return []; }
}

attachAutocomplete(poEl, {
  fetchItems: searchPOs,
  getDisplayValue: it => it ? `${it.po_number} — ${it.description || ''}` : '',
  renderItem: it => `<div class="ac-row"><b>${esc(it.po_number)}</b> — ${esc(it.description || '')}</div>`,
  onPick: (it) => {
    selectedPO = it || null;
    poEl.value = it ? `${it.po_number} — ${it.description || ''}` : '';
  },
  openOnFocus: true,
  minChars: 0,      // show suggestions on focus even when empty
  debounceMs: 200,
  maxHeight: 260,
});
poEl?.addEventListener('input', () => { selectedPO = null; });

/* ---------------- table render ---------------- */
function renderLotsTable(container, rows, ctx={}) {
  renderTableX(container, rows, {
    rowStart: ctx.rowStart || 0,
    getRowId: r => r.id,
    onRowClick: r => { if (r?.id) location.href = LOT_DETAIL_URL(r.id); },
    columns: [
      { key: '__no',       title: 'No.',         width: '64px',  align: 'right' },
      { key: 'lot_no',     title: 'Lot No.',     width: '160px',
        render: r => r?.id
          ? `<a href="${LOT_DETAIL_URL(r.id)}">${esc(r.lot_no ?? '')}</a>`
          : esc(r.lot_no ?? '') },
      { key: 'part_no',    title: 'Part Number', width: '200px',
        render: r => esc(r.part?.part_no ?? r.part_no ?? '') },
      { key: 'po_number',  title: 'PO Number',   width: '160px',
        render: r => esc(r.po?.po_number ?? r.po_number ?? '') },
      { key: 'travs',      title: 'Travelers',   width: '220px',
        render: r => (r.traveler_ids ?? [])
          .map(id => `<a href="/static/traveler-detail.html?id=${id}">#${id}</a>`).join(', ') },
      { key: 'planned_qty',title: 'Planned Qty', width: '120px', align: 'right',
        render: r => String(r.planned_qty ?? 0) },
      { key: 'started_at', title: 'Started',     width: '180px',
        render: r => esc(fmtDate(r.started_at)) },
      { key: 'finished_at',title: 'Finished',    width: '180px',
        render: r => esc(fmtDate(r.finished_at)) },
      { key: 'status',     title: 'Status',      width: '140px',
        render: r => esc(r.status ?? '') },
    ],
    emptyText: 'No lots found',
  });
}

/* ---------------- paging helpers ---------------- */
function computeTotalPages() {
  if (state.total && state.pageSize) return Math.max(1, Math.ceil(state.total / state.pageSize));
  return state.items.length < state.pageSize && state.page === 1 ? 1 : state.page;
}
function syncPager() {
  // If you add pager labels/buttons, update here.
}

/* ---------------- load lots ---------------- */
async function loadLots() {
  if (!tableEl) return;
  tableEl.innerHTML = `<div style="padding:12px">Loading…</div>`;
  try {
    const params = new URLSearchParams({
      page: String(state.page),
      per_page: String(state.pageSize),
      q: state.q || '',
      _: String(Date.now()),
    });
    const data = await jfetch(`/lots?${params.toString()}`);

    // Accept either {items:[]} or [] for compatibility
    const items = Array.isArray(data) ? data : (data.items ?? []);
    state.items = items;
    state.total = Number((data && data.total) ?? 0);

    const rows = state.items.map(it => ({
      id: it.id,
      lot_no: it.lot_no,
      part_no: it.part?.part_no,
      po_number: it.po?.po_number,
      traveler_ids: it.traveler_ids ?? [],
      planned_qty: it.planned_qty,
      started_at: it.started_at,
      finished_at: it.finished_at,
      status: it.status,
      part: it.part ?? null,
      po: it.po ?? null,
      revision: it.revision ?? null,   // <- NEW
    }));

    renderLotsTable(tableEl, rows, { rowStart: (state.page - 1) * state.pageSize });
    syncPager();
  } catch (e) {
    console.error(e);
    tableEl.innerHTML = `<div style="padding:12px;color:#b91c1c">Load error</div>`;
    toast('Load lots failed');
  }
}

/* ---------------- create lot ---------------- */
async function resolvePartIfNeeded() {
  if (selectedPart) return selectedPart;
  const term = (partEl?.value || '').trim();
  if (!term) return null;
  const list = await searchParts(term);
  if (list.length === 1) {
    selectedPart = list[0];
    partEl.value = `${selectedPart.part_no} — ${selectedPart.name}`;
    resetRevisionSelect();
    if (selectedPart.id) {
      try {
        await loadRevisionsForPart(selectedPart.id);
      } catch {}
    }
    return selectedPart;
  }
  return null;
}

async function resolvePOIfNeeded() {
  if (selectedPO) return selectedPO;
  const term = (poEl?.value || '').trim();
  if (!term) return null;
  const list = await searchPOs(term);
  if (list.length === 1) {
    selectedPO = list[0];
    poEl.value = `${selectedPO.po_number} — ${selectedPO.description || ''}`;
    return selectedPO;
  }
  return null;
}

async function createLot() {
  try {
    const lot_no = (lotNoEl?.value || 'AUTO').trim().toUpperCase();

    if (!selectedPart) await resolvePartIfNeeded();
    if (!selectedPO)   await resolvePOIfNeeded();

    const part_id = selectedPart?.id || null;

    // Try selected value from <select>, else whatever we resolved, else null
    let part_revision_id = selectedRevisionId;
    if (!part_revision_id) {
      const v = Number(revSelEl?.value || 0);
      part_revision_id = Number.isFinite(v) && v > 0 ? v : null; // may stay null (optional)
    }

    const po_id = selectedPO?.id || null;

    if (!part_id) {
      toast('Please choose a Part', false);
      partEl?.focus();
      return;
    }

    const planned_qty = Number(qtyEl?.value || 0) || 0;
    const status = statusEl?.value || 'in_process';

    const payload = { lot_no, part_id, part_revision_id, po_id, planned_qty, status };
    await jfetch('/lots', { method: 'POST', body: JSON.stringify(payload) });

    toast('Lot created');
    // reset (keep status)
    ['l_no','l_part','l_poid','l_qty'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    resetRevisionSelect();
    selectedPart = null; selectedPO = null;

    state.page = 1;
    await loadLots();
  } catch (e) {
    console.error(e);
    toast(e?.message || 'Create failed', false);
  }
}

/* ---------------- events ---------------- */
inputSearch?.addEventListener('input', debounce(() => {
  state.q = inputSearch.value || '';
  state.page = 1;
  loadLots();
}, 250));

selPerPage?.addEventListener('change', () => {
  state.pageSize = Number(selPerPage.value || 20);
  state.page = 1;
  loadLots();
});
btnReload?.addEventListener('click', () => loadLots());
btnCreate?.addEventListener('click', createLot);

/* Optional: Enter to create directly from Part input */
partEl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createLot();
});
poEl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createLot();
});

/* ---------------- boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initTopbar?.();
  loadLots();
});
