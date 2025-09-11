// /static/js/page-part.js  (v7 - TableX + Revisions inline)
// Requirements: api.js (export $, jfetch, showToast, initTopbar), tablex.js (export renderTableX)

import { $, jfetch, showToast as toast, initTopbar } from './api.js';
import { renderTableX } from './tablex.js';

/* ---------- helpers ---------- */
const partDetail = (id) => `./part-detail.html?id=${encodeURIComponent(id)}`;
const safe = (s) => String(s ?? '').replaceAll('<', '&lt;');
const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : d.toLocaleString();
};
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- UI refs ---------- */
const inputSearch = $('p_q');
const selPerPage  = $('p_per_page');
const btnPrevTop  = $('p_prev');
const btnNextTop  = $('p_next');
const pageInfoTop = $('p_page_info');
const btnPrevBot  = $('p_prev2');
const btnNextBot  = $('p_next2');
const pageInfoBot = $('p_page_info2');
const tableEl     = $('p_table');
const btnReload   = $('p_reload');

/* Create form */
const inNo    = $('p_no');
const inName  = $('p_name');
const inDesc  = $('p_desc');
const inUom   = $('p_uom');
const inStat  = $('p_status');
const btnCreate = $('p_create');

/* ---------- state ---------- */
const state = {
  page: 1,
  pageSize: Number(selPerPage?.value || 20),
  q: '',
  total: 0,
  items: [],
};

/* ---------- pager utils ---------- */
function computeTotalPages() {
  if (!state.pageSize) return 1;
  if (state.total) return Math.max(1, Math.ceil(state.total / state.pageSize));
  return state.items.length < state.pageSize && state.page === 1 ? 1 : state.page;
}

function syncPager() {
  const pages = computeTotalPages();
  const label = `Page ${state.page}${state.total ? ` / ${pages}` : ''}`;
  if (pageInfoTop) pageInfoTop.textContent = label;
  if (pageInfoBot) pageInfoBot.textContent = label;

  const canPrev = state.page > 1;
  const canNext = state.total ? state.page < pages : state.items.length === state.pageSize;

  [btnPrevTop, btnPrevBot].forEach(b => b && b.toggleAttribute('disabled', !canPrev));
  [btnNextTop, btnNextBot].forEach(b => b && b.toggleAttribute('disabled', !canNext));
}

/* ---------- revisions render ---------- */
function renderRevisionsInline(part) {
  const revs = Array.isArray(part.revisions) ? part.revisions : [];
  if (!revs.length) return `<span class="muted">—</span>`;
  return revs
    .map(r => {
      const cls = r.is_current ? 'rev current' : 'rev';
      return `<span class="${cls}" title="Revision ${safe(r.rev)}">${safe(r.rev)}</span>`;
    })
    .join(`<span class="rev-sep">, </span>`);
}

/* ---------- render ---------- */
function renderRows() {
  const rows = state.items.map(p => ({
    id: p.id,
    part_no: p.part_no,
    name: p.name ?? '',
    uom: p.uom ?? 'ea',
    description: p.description ?? '',
    status: p.status ?? 'active',
    created_at: p.created_at ?? null, // อาจไม่มีคอลัมน์นี้ในแบ็กเอนด์
    revisions: p.revisions ?? [],     // ใช้จาก include=revisions
  }));

  renderTableX(tableEl, rows, {
    rowStart: (state.page - 1) * state.pageSize,
    getRowId: r => r.id,
    onRowClick: r => { if (r?.id) location.href = partDetail(r.id); },
    columns: [
      { key: '__no',       title: 'No.',        width: '64px',  align: 'right' },
      { key: 'part_no',    title: 'Part No.',   width: '160px',
        render: r => `<a class="code-link" href="${partDetail(r.id)}">${safe(r.part_no ?? '')}</a>` },
      { key: 'name',       title: 'Name',       grow: 1,        render: r => safe(r.name ?? '') },

      // ✅ New column: Revisions (comma-separated, highlight current)
      { key: 'revisions',  title: 'Revisions',  grow: 1.2,      render: r => renderRevisionsInline(r) },

      { key: 'uom',        title: 'UoM',        width: '90px',  render: r => safe(r.uom ?? '') },
      { key: 'description',title: 'Description',grow: 2,        render: r => safe(r.description ?? '') },
      { key: 'status',     title: 'Status',     width: '110px', render: r => safe(r.status ?? '') },
      { key: 'created_at', title: 'Created',    width: '180px', render: r => fmtDate(r.created_at) },
      { key: '__act',      title: '',           width: '200px', align: 'right',
        render: r => `
          <button class="btn-small" data-act="edit" data-id="${r.id}">Edit</button>
          <button class="btn-small" data-act="del"  data-id="${r.id}">Delete</button>
        `
      },
    ],
    emptyText: 'No parts found',
  });
}

/* ---------- load ---------- */
async function load() {
  if (!tableEl) return;
  tableEl.innerHTML = `<div style="padding:12px">Loading…</div>`;
  try {
    const params = new URLSearchParams({
      page: String(state.page),
      page_size: String(state.pageSize),
      include: 'revisions',                 // ✅ ดึง revisions มาพร้อมกัน
      ...(state.q ? { q: state.q } : {}),
      _: String(Date.now()),
    });
    const data = await jfetch(`/parts?${params.toString()}`);
    state.items = data.items ?? [];
    state.total = Number(data.total ?? 0);
    renderRows();
    syncPager();
  } catch (err) {
    console.error(err);
    tableEl.innerHTML = `<div style="padding:12px;color:#b91c1c">Load error</div>`;
    syncPager();
    toast('Load parts failed', false);
  }
}

/* ---------- create ---------- */
async function createPart() {
  const part_no = inNo?.value?.trim().toUpperCase();
  const name = inName?.value?.trim() || null;
  const description = inDesc?.value?.trim() || '';
  const uom = inUom?.value?.trim() || null;
  const status = inStat?.value || 'active';

  if (!part_no) { toast('Part No. required', false); inNo?.focus(); return; }

  try {
    await jfetch('/parts', {
      method: 'POST',
      body: JSON.stringify({ part_no, name, description, uom, status }),
    });
    toast('Created');
    // clear inputs
    [inNo, inName, inDesc, inUom].forEach(el => el && (el.value = ''));
    if (inStat) inStat.value = 'active';

    // reload list from first page
    state.page = 1;
    await load();
  } catch (e) {
    toast(e?.message || 'Create failed', false);
  }
}

/* ---------- bindings ---------- */
inputSearch?.addEventListener('input', debounce(() => {
  state.q = inputSearch.value || '';
  state.page = 1;
  load();
}, 250));

selPerPage?.addEventListener('change', () => {
  state.pageSize = Number(selPerPage.value || 20);
  state.page = 1;
  load();
});

btnReload?.addEventListener('click', () => load());

[btnPrevTop, btnPrevBot].forEach(b => b?.addEventListener('click', () => {
  if (state.page > 1) { state.page--; load(); }
}));
[btnNextTop, btnNextBot].forEach(b => b?.addEventListener('click', () => {
  const pages = computeTotalPages();
  if (state.total ? state.page < pages : state.items.length === state.pageSize) {
    state.page++; load();
  }
}));

// row actions (edit/delete)
tableEl?.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (!id) return;

  if (btn.dataset.act === 'edit') {
    location.href = partDetail(id);
    return;
  }
  if (btn.dataset.act === 'del') {
    if (!confirm('Delete this part?')) return;
    try {
      await jfetch(`/parts/${id}`, { method: 'DELETE' });
      toast('Deleted');
      if (state.items.length === 1 && state.page > 1) state.page--;
      load();
    } catch (e) {
      toast(e?.message || 'Delete failed', false);
    }
  }
});

// create button
btnCreate?.addEventListener('click', createPart);

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initTopbar?.();
  load();
});
