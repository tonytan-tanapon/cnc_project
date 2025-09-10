// /static/js/page-part.js
// List + basic CRUD for Parts and inline view of Revisions
// Requires: api.js exporting $, jfetch, toast

import { $, jfetch, toast, initTopbar } from './api.js';

const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
const partDetail = (id) => `./part-detail.html?id=${encodeURIComponent(id)}`; // optional

let state = { page: 1, page_size: 20, q: '' };

function renderRows(items) {
  const tbody = $('#tblBody');
  if (!items.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty">No data</td></tr>'; return; }
  tbody.innerHTML = items.map(p => `
    <tr data-id="${p.id}">
      <td>${p.part_no}</td>
      <td>${p.name ?? ''}</td>
      <td>${p.uom ?? ''}</td>
      <td>${p.note ? p.note.replaceAll('<','&lt;') : ''}</td>
      <td class="act">
        <button class="link" data-act="rev">Revisions</button>
        <button class="link" data-act="edit">Edit</button>
        <button class="link" data-act="del">Delete</button>
      </td>
    </tr>
    <tr class="rev-row" data-for="${p.id}" hidden>
      <td colspan="5">
        <div class="rev-box">
          <div class="rev-list" id="rev-${p.id}">Loading…</div>
          <div class="rev-form">
            <input id="r_rev_${p.id}" placeholder="Rev e.g. A" />
            <input id="r_desc_${p.id}" placeholder="Description" />
            <button data-act="rev-add" data-id="${p.id}">Add Rev</button>
          </div>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderPager(total, page, page_size) {
  const el = $('#pager');
  const pages = Math.max(1, Math.ceil(total / page_size));
  el.innerHTML = `
    <button id="pPrev" ${page <= 1 ? 'disabled' : ''}>‹ Prev</button>
    <span>Page ${page}/${pages}</span>
    <button id="pNext" ${page >= pages ? 'disabled' : ''}>Next ›</button>
  `;
  $('#pPrev')?.addEventListener('click', () => { if (state.page > 1) { state.page--; load(); } });
  $('#pNext')?.addEventListener('click', () => { state.page++; load(); });
}

async function load() {
  const params = new URLSearchParams({ page: state.page, page_size: state.page_size });
  if (state.q) params.set('q', state.q);
  const data = await jfetch(`/parts?${params.toString()}`);
  renderRows(data.items || []);
  renderPager(data.total || 0, data.page || 1, data.page_size || 20);
}

async function loadRevs(partId) {
  const box = document.getElementById(`rev-${partId}`);
  if (!box) return;
  const rows = await jfetch(`/parts/${partId}/revisions`);
  if (!rows.length) { box.innerHTML = '<div class="muted">No revisions</div>'; return; }
  box.innerHTML = rows.map(r => `
    <div class="rev-item" data-rev="${r.id}">
      <b>${r.rev}</b> – ${r.description ?? ''}
      <button class="link" data-act="rev-del" data-id="${r.id}">Delete</button>
    </div>
  `).join('');
}

async function createPart() {
  const part_no = $('#c_part_no')?.value?.trim();
  const name = $('#c_name')?.value?.trim();
  const uom = $('#c_uom')?.value?.trim();
  const note = $('#c_note')?.value?.trim();
  if (!part_no) { toast('part_no required'); return; }
  await jfetch('/parts', { method: 'POST', json: { part_no, name, uom, note } });
  toast('Created');
  state.page = 1; load();
}

function hookEvents() {
  on($('#btnSearch'), 'click', () => { state.q = $('#q')?.value || ''; state.page = 1; load(); });
  on($('#q'), 'keydown', (e) => { if (e.key === 'Enter') { state.q = e.currentTarget.value; state.page = 1; load(); }});
  on($('#btnCreate'), 'click', createPart);

  on($('#tblBody'), 'click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const tr = btn.closest('tr[data-id]');
    const id = Number(tr?.dataset.id);

    if (btn.dataset.act === 'del') {
      if (!confirm('Delete this part?')) return;
      await jfetch(`/parts/${id}`, { method: 'DELETE' });
      toast('Deleted');
      load();
      return;
    }

    if (btn.dataset.act === 'edit') {
      location.href = partDetail(id); // optional detail page
      return;
    }

    if (btn.dataset.act === 'rev') {
      const revRow = document.querySelector(`.rev-row[data-for="${id}"]`);
      if (!revRow) return;
      const isHidden = revRow.hasAttribute('hidden');
      if (isHidden) { await loadRevs(id); revRow.removeAttribute('hidden'); }
      else revRow.setAttribute('hidden', '');
      return;
    }

    if (btn.dataset.act === 'rev-add') {
      const pid = Number(btn.dataset.id);
      const rev = document.getElementById(`r_rev_${pid}`)?.value?.trim();
      const description = document.getElementById(`r_desc_${pid}`)?.value?.trim();
      if (!rev) { toast('rev required'); return; }
      await jfetch(`/parts/${pid}/revisions`, { method: 'POST', json: { rev, description } });
      toast('Revision added');
      await loadRevs(pid);
      return;
    }

    if (btn.dataset.act === 'rev-del') {
      const rid = Number(btn.dataset.id);
      if (!confirm('Delete this revision?')) return;
      await jfetch(`/parts/revisions/${rid}`, { method: 'DELETE' });
      toast('Revision deleted');
      const revBox = btn.closest('.rev-item')?.parentElement;
      const pid = Number(revBox?.id?.split('rev-')[1]);
      if (pid) await loadRevs(pid);
    }
  });
}

function init() {
  initTopbar?.();
  hookEvents();
  load();
}

document.addEventListener('DOMContentLoaded', init);