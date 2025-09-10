// /static/js/page-pos.js  (drop-in)
import { $, jfetch, toast, initTopbar } from './api.js';

const API = '/api/v1';
const DETAIL_PAGE = './pos-detail.html';
const posUrl = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;

const state = { page: 1, page_size: 20, q: '' };

const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
const qs = (s, r = document) => r.querySelector(s);

function safeHTML(s) { return String(s ?? '').replaceAll('<','&lt;'); }
function safeDate(dt) { if (!dt) return ''; const d = new Date(dt); return isNaN(d) ? '' : d.toLocaleString(); }

function ensureTable() {
  // ต้องมี <table><tbody id="tblBody"></tbody></table>
  let tbody = qs('#tblBody');
  if (tbody) return tbody;

  // ถ้าไม่มี ให้สร้าง table อย่างง่ายใต้ปุ่ม Reload
  const after = qs('#btnReload')?.closest('.card') || qs('main') || document.body;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>PO Number</th>
          <th>Customer Code</th>
          <th>Customer Name</th>
          <th>Description</th>
          <th>Created</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="tblBody"><tr><td colspan="6" class="empty">Loading…</td></tr></tbody>
    </table>`;
  after.appendChild(wrap.firstElementChild);
  return qs('#tblBody');
}

function renderRows(items) {
  const tbody = ensureTable();
  if (!items?.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No data</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(x => `
    <tr data-id="${x.id}">
      <td><a href="${posUrl(x.id)}">${x.po_number ?? ''}</a></td>
      <td>${x.customer?.code ?? ''}</td>
      <td>${x.customer?.name ?? ''}</td>
      <td>${safeHTML(x.note)}</td>
      <td>${safeDate(x.created_at)}</td>
      <td class="act">
        <button class="link" data-act="open">Open</button>
        <button class="link" data-act="del">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function load() {
  const page_size = Number(qs('#pageSize')?.value || state.page_size);
  state.page_size = page_size;
  state.q = qs('#q')?.value?.trim() || '';

  const params = new URLSearchParams({ page: state.page, page_size: state.page_size });
  if (state.q) params.set('q', state.q);

  const data = await jfetch(`${API}/pos?${params.toString()}`);
  renderRows(data.items || []);
}

async function createPO() {
  const customerId = Number(qs('#c_customer_id')?.value || 0);
  const note = qs('#c_note')?.value || '';
  if (!customerId) { toast('Please select customer'); return; }
  const po = await jfetch(`${API}/pos`, { method: 'POST', json: { customer_id: customerId, note } });
  toast('Created');
  location.href = posUrl(po.id);
}

function hookEvents() {
  on(qs('#btnReload'), 'click', () => { state.page = 1; load(); });
  on(qs('#q'), 'keydown', (e) => { if (e.key === 'Enter') { state.page = 1; load(); }});

  on(document, 'click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const id = Number(tr?.dataset.id || 0);
    if (!id) return;

    if (btn.dataset.act === 'open') location.href = posUrl(id);
    if (btn.dataset.act === 'del') {
      if (!confirm('Delete this PO?')) return;
      await jfetch(`${API}/pos/${id}`, { method: 'DELETE' });
      toast('Deleted');
      load();
    }
  });

  on(qs('#btnCreate'), 'click', createPO);
}

function init() {
  initTopbar?.();
  hookEvents();
  load();
}

document.addEventListener('DOMContentLoaded', init);
