// /static/js/page-travelers.js
import { $, jfetch, toast, initTopbar } from './api.js';

const DETAIL_PAGE = '/static/traveler-detail.html';

const escapeHtml = (s) =>
  String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

function tUrl(id){ return `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`; }

function renderTravelerTable(holder, rows){
  if (!rows || rows.length === 0){
    holder.innerHTML = '<div class="empty">No travelers</div>';
    return;
  }
  const body = rows.map(r => `
    <tr data-id="${escapeHtml(r.id)}" class="click-row" title="Open traveler">
      <td><a href="${tUrl(r.id)}">#${escapeHtml(r.id)}</a></td>
      <td>${escapeHtml(r.lot_id ?? '')}</td>
      <td>${escapeHtml(r.status ?? '')}</td>
      <td>${escapeHtml(r.created_by_id ?? '')}</td>
      <td>${escapeHtml(r.notes ?? '')}</td>
    </tr>
  `).join('');
  holder.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th style="width:100px">Traveler</th>
          <th style="width:120px">Lot</th>
          <th style="width:140px">Status</th>
          <th style="width:140px">Created by</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    <style>
      .click-row { cursor:pointer; }
      .click-row:hover { background: rgba(0,0,0,.03); }
    </style>
  `;
}

async function loadTravelers(){
  const holder = $('t_table');
  try{
    const q = $('t_q')?.value?.trim();
    const rows = await jfetch('/travelers' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    renderTravelerTable(holder, rows);
  }catch(e){
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast('โหลด Travelers ไม่สำเร็จ: ' + e.message, false);
  }
}

async function createTraveler(){
  const lot_id = numOrNull($('t_lot')?.value);
  const created_by_id = numOrNull($('t_emp')?.value);
  const status = strOrNull($('t_status')?.value) || 'open';
  const notes = strOrNull($('t_notes')?.value);

  if (!lot_id){
    toast('กรุณาใส่ Lot ID', false);
    return;
  }
  const payload = { lot_id, created_by_id, status, notes };
  try{
    const t = await jfetch('/travelers', { method: 'POST', body: JSON.stringify(payload) });
    toast('Traveler created (id: ' + t.id + ')');
    ['t_emp','t_notes'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    await loadTravelers();
  }catch(e){
    toast('สร้าง Traveler ไม่สำเร็จ: ' + e.message, false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTopbar();

  $('t_create')?.addEventListener('click', createTraveler);
  $('t_reload')?.addEventListener('click', loadTravelers);
  $('t_q')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadTravelers(); });

  // คลิกพื้นที่ว่างของแถวก็เปิด detail
  $('t_table')?.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a) return;
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    location.href = tUrl(tr.dataset.id);
  });

  loadTravelers();
});
