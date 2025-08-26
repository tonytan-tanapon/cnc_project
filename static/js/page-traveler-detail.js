// /static/js/page-traveler-detail.js
import { $, jfetch, toast, initTopbar } from './api.js';

const qs = new URLSearchParams(location.search);
const travelerId = qs.get('id');

let originalTraveler = null;

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

// ---------- Traveler ----------
function fillTraveler(t){
  $('lot_id').value = t.lot_id ?? '';
  $('created_by_id').value = t.created_by_id ?? '';
  $('status').value = t.status ?? '';
  $('notes').value = t.notes ?? '';
  $('t_sub').textContent = `#${t.id} — Lot ${t.lot_id ?? ''}`;
  document.title = `Traveler · #${t.id}`;
}
function readTraveler(){
  return {
    lot_id: numOrNull($('lot_id')?.value),
    created_by_id: numOrNull($('created_by_id')?.value),
    status: strOrNull($('status')?.value),
    notes: strOrNull($('notes')?.value),
  };
}
function setBusyT(b){
  ['btnSaveT','btnResetT','btnDeleteT'].forEach(id => { const el = $(id); if (el) el.disabled = b; });
  $('t_hint').textContent = b ? 'Working…' : '';
}
async function loadTraveler(){
  if (!travelerId){
    $('errorBox').style.display = '';
    $('errorBox').textContent = 'Missing ?id= in URL';
    return;
  }
  try{
    const t = await jfetch(`/travelers/${encodeURIComponent(travelerId)}`);
    originalTraveler = t;
    fillTraveler(t);
  }catch(e){
    $('errorBox').style.display = '';
    $('errorBox').textContent = e?.message || 'Load failed';
  }
}
async function saveTraveler(){
  const payload = readTraveler();
  setBusyT(true);
  try{
    const t = await jfetch(`/travelers/${encodeURIComponent(travelerId)}`, {
      method: 'PUT', body: JSON.stringify(payload)
    });
    originalTraveler = t;
    fillTraveler(t);
    toast('Traveler saved');
  }catch(e){
    toast(e?.message || 'Save failed', false);
  }finally{
    setBusyT(false);
  }
}
async function deleteTraveler(){
  if (!confirm('ลบ Traveler นี้?\nThis action cannot be undone.')) return;
  setBusyT(true);
  try{
    await jfetch(`/travelers/${encodeURIComponent(travelerId)}`, { method: 'DELETE' });
    toast('Deleted');
    location.href = '/static/travelers.html';
  }catch(e){
    toast(e?.message || 'Delete failed', false);
  }finally{
    setBusyT(false);
  }
}

// ---------- Steps ----------
let steps = [];
let selectedStepId = null; // สำหรับ finish (selected)

function renderSteps(){
  if (!steps || steps.length === 0){
    $('steps_table').innerHTML = '<div class="empty">No steps</div>';
    return;
  }
  const body = steps.map(s => `
    <tr data-id="${escapeHtml(s.id)}">
      <td>
        <label style="display:inline-flex;gap:6px;align-items:center;cursor:pointer;">
          <input type="radio" name="selStep" value="${escapeHtml(s.id)}" />
          #${escapeHtml(s.id)}
        </label>
      </td>
      <td>${escapeHtml(s.seq ?? '')}</td>
      <td>${escapeHtml(s.station ?? '')}</td>
      <td>${escapeHtml(s.step_name ?? '')}</td>
      <td>${escapeHtml(s.step_code ?? '')}</td>
      <td>${escapeHtml(s.operator_id ?? '')}</td>
      <td>${String(s.qa_required) === 'true' ? '<span class="badge">QA</span>' : ''}</td>
      <td style="white-space:nowrap;display:flex;gap:6px;align-items:center">
        <button class="btn" data-act="start">Start</button>
        <button class="btn" data-act="edit">Edit</button>
        <button class="btn danger" data-act="delete">Delete</button>
      </td>
    </tr>
  `).join('');
  $('steps_table').innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th style="width:120px">Step</th>
          <th style="width:80px">Seq</th>
          <th style="width:140px">Station</th>
          <th>Step Name</th>
          <th style="width:140px">Code</th>
          <th style="width:120px">Operator</th>
          <th style="width:80px">QA</th>
          <th style="width:240px">Actions</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    <style>
      .table button.btn { padding:6px 10px; border-radius:8px }
    </style>
  `;

  // bind row actions
  $('steps_table').querySelectorAll('input[name="selStep"]').forEach(radio => {
    radio.addEventListener('change', (e) => selectedStepId = Number(e.target.value));
  });
  $('steps_table').querySelector('tbody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const tr = e.target.closest('tr[data-id]');
    const id = Number(tr?.dataset?.id);
    if (!id) return;
    if (btn.dataset.act === 'start') startStep(id);
    else if (btn.dataset.act === 'edit') openEditStep(id);
    else if (btn.dataset.act === 'delete') deleteStep(id);
  });
}

async function loadSteps(){
  try{
    steps = await jfetch(`/traveler-steps?traveler_id=${encodeURIComponent(travelerId)}`);
    renderSteps();
  }catch(e){
    $('steps_table').innerHTML = `<div class="hint">${e.message}</div>`;
    toast('โหลด Steps ไม่สำเร็จ: ' + e.message, false);
  }
}

async function addStep(){
  const payload = {
    traveler_id: Number(travelerId),
    seq: numOrNull($('s_seq')?.value) || 1,
    station: strOrNull($('s_station')?.value),
    step_name: strOrNull($('s_name')?.value),
    step_code: strOrNull($('s_code')?.value),
    operator_id: numOrNull($('s_op')?.value),
    qa_required: ($('s_qa')?.value || 'false') === 'true',
  };
  if (!payload.step_name){
    toast('ใส่ Step Name ก่อน', false);
    return;
  }
  try{
    await jfetch('/traveler-steps', { method:'POST', body: JSON.stringify(payload) });
    toast('Step added');
    ['s_station','s_name','s_code','s_op'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    await loadSteps();
  }catch(e){
    toast('เพิ่ม Step ไม่สำเร็จ: ' + e.message, false);
  }
}

async function startStep(id){
  try{
    await jfetch(`/traveler-steps/${id}/start`, { method:'POST' });
    toast('Step started');
    await loadSteps();
  }catch(e){
    toast('เริ่ม Step ไม่สำเร็จ: ' + e.message, false);
  }
}

async function finishSelected(){
  const id = selectedStepId;
  if (!id){
    toast('เลือก Step (radio) ก่อน', false);
    return;
  }
  const result = strOrNull($('s_result')?.value);
  if (!result){
    toast('ระบุ result: passed/failed/skipped', false);
    return;
  }
  const qs = new URLSearchParams({ result });
  const qa_result = strOrNull($('s_qa_result')?.value);
  const qa_notes = strOrNull($('s_qa_notes')?.value);
  if (qa_result) qs.set('qa_result', qa_result);
  if (qa_notes) qs.set('qa_notes', qa_notes);
  try{
    await jfetch(`/traveler-steps/${id}/finish?${qs.toString()}`, { method:'POST' });
    toast('Step finished');
    await loadSteps();
  }catch(e){
    toast('ปิด Step ไม่สำเร็จ: ' + e.message, false);
  }
}

// ----- Edit/Delete Step -----
function openEditStep(id){
  const s = steps.find(x => Number(x.id) === Number(id));
  if (!s){ toast('Step not found', false); return; }

  // ใช้ prompt แบบเร็ว ๆ (ถ้าต้องการฟอร์มเต็ม บอกได้ จะใส่ panel สวย ๆ ให้)
  const seq = Number(prompt('Seq', s.seq ?? 1) ?? s.seq ?? 1);
  const station = prompt('Station', s.station ?? '') ?? s.station ?? '';
  const step_name = prompt('Step Name', s.step_name ?? '') ?? s.step_name ?? '';
  const step_code = prompt('Step Code', s.step_code ?? '') ?? s.step_code ?? '';
  const operator_id = Number(prompt('Operator ID', s.operator_id ?? '') || s.operator_id || 0) || null;
  const qa_required = (prompt('QA required? true/false', String(!!s.qa_required)) || String(!!s.qa_required)).toLowerCase() === 'true';

  saveStep(id, { seq, station, step_name, step_code, operator_id, qa_required });
}

async function saveStep(id, patch){
  try{
    await jfetch(`/traveler-steps/${id}`, { method:'PUT', body: JSON.stringify(patch) });
    toast('Step updated');
    await loadSteps();
  }catch(e){
    toast('อัปเดต Step ไม่สำเร็จ: ' + e.message, false);
  }
}

async function deleteStep(id){
  if (!confirm('ลบ Step นี้?')) return;
  try{
    await jfetch(`/traveler-steps/${id}`, { method:'DELETE' });
    toast('Step deleted');
    await loadSteps();
  }catch(e){
    toast('ลบ Step ไม่สำเร็จ: ' + e.message, false);
  }
}

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', () => {
  initTopbar();

  $('btnSaveT')?.addEventListener('click', saveTraveler);
  $('btnResetT')?.addEventListener('click', () => { if (originalTraveler) fillTraveler(originalTraveler); });
  $('btnDeleteT')?.addEventListener('click', deleteTraveler);

  $('s_create')?.addEventListener('click', addStep);
  $('s_finish_selected')?.addEventListener('click', finishSelected);

  loadTraveler().then(loadSteps);
});
