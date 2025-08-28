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
const numOrZero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

function statusBadge(s) {
  const st = String(s?.status || 'pending').toLowerCase();

  const cls = (st === 'running' || st === 'in_progress') ? 'blue'
           : st === 'passed'   ? 'green'
           : st === 'failed'   ? 'red'
           : st === 'skipped'  ? 'gray'
           : 'gray';

  const labelMap = {
    running: 'Running',
    in_progress: 'In Progress',
    passed: 'Passed',
    failed: 'Failed',
    skipped: 'Skipped',
    pending: 'Pending',
  };
  const label = labelMap[st] || (st.charAt(0).toUpperCase() + st.slice(1));
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

function renderSteps(){
  if (!steps || steps.length === 0){
    $('steps_table').innerHTML = '<div class="empty">No steps</div>';
    return;
  }

  const body = steps.map(s => {
    const id = escapeHtml(s.id);
    const st = String(s.status || 'pending').toLowerCase();

    let actionBtns = '';
    if (st === 'pending') {
      actionBtns = `
        <button class="btn" data-act="start">Start</button>
        <button class="btn ok" data-act="finish_pass">Pass</button>
        <button class="btn warn" data-act="finish_skip">Skip</button>
        <button class="btn danger" data-act="finish_fail">Fail</button>
      `;
    } else if (st === 'in_progress' || st === 'running') {
      actionBtns = `
        <button class="btn ok" data-act="finish_pass">Pass</button>
        <button class="btn warn" data-act="finish_skip">Skip</button>
        <button class="btn danger" data-act="finish_fail">Fail</button>
      `;
    } else {
      actionBtns = `<button class="btn" data-act="restart">Restart</button>`;
    }

    const qtyR = Number(s.qty_receive ?? 0);
    const qtyA = Number(s.qty_accept  ?? 0);
    const qtyX = Number(s.qty_reject  ?? 0);

    return `
<tr data-id="${id}">
  <td>
    <label style="display:inline-flex;gap:6px;align-items:center;cursor:pointer;">
      <input type="radio" name="selStep" value="${id}" />
      #${escapeHtml(s.id)}
    </label>
  </td>
  <td>${escapeHtml(s.seq ?? '')}</td>
  <td>${escapeHtml(s.station ?? '')}</td>
  <td>${escapeHtml(s.step_name ?? '')}</td>
  <td>${escapeHtml(s.step_code ?? '')}</td>
  <td>${escapeHtml(s.operator_id ?? '')}</td>
  <td>${statusBadge(s)}</td>
  <td style="text-align:right">${qtyR}</td>
  <td style="text-align:right">${qtyA}</td>
  <td style="text-align:right">${qtyX}</td>
  <td><div class="hstack">${actionBtns}</div></td>
  <td>
    <div class="hstack">
      <button class="btn" data-act="edit">Edit</button>
      <button class="btn danger" data-act="delete">Delete</button>
    </div>
  </td>
</tr>`;
  }).join('');

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
      <th style="width:120px">Status</th>
      <th style="width:110px">Qty Recv</th>
      <th style="width:110px">Qty Accept</th>
      <th style="width:110px">Qty Reject</th>
      <th style="width:320px">Action</th>
      <th style="width:160px">Manage</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>
<style>
  .table button.btn { padding:6px 10px; border-radius:8px }
  .hstack { display:flex; gap:8px; align-items:center; white-space:nowrap; }
  .badge { padding:2px 6px; border-radius:6px; font-size:12px; color:#fff; }
  .badge.blue { background:#2563eb; }
  .badge.green{ background:#16a34a; }
  .badge.red  { background:#b91c1c; }
  .badge.gray { background:#6b7280; }
  .btn.ok    { background:#16a34a; color:#fff; }
  .btn.warn  { background:#d97706; color:#fff; }
  .btn.danger{ background:#b91c1c; color:#fff; }
</style>`;

  // radios
  $('steps_table').querySelectorAll('input[name="selStep"]').forEach(r => {
    r.addEventListener('change', e => selectedStepId = Number(e.target.value));
  });

  // buttons
  $('steps_table').querySelector('tbody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const tr = e.target.closest('tr[data-id]');
    const id = Number(tr?.dataset?.id);
    if (!id) return;

    const act = btn.dataset.act;
    if (act === 'start')          return startStep(id);
    if (act === 'finish_pass')    return finishStep(id, 'passed');
    if (act === 'finish_fail')    return finishStep(id, 'failed');
    if (act === 'finish_skip')    return finishStep(id, 'skipped');
    if (act === 'restart')        return restartStep?.(id);
    if (act === 'edit')           return openEditStep(id);
    if (act === 'delete')         return deleteStep(id);
  });
}

// ----- finish with qtys -----
function askQtysForStep(step) {
  // default จากค่าปัจจุบัน ช่วยลดการพิมพ์ซ้ำ
  const dRecv = String(step?.qty_receive ?? 0);
  const dAcc  = String(step?.qty_accept  ?? 0);
  const dRej  = String(step?.qty_reject  ?? 0);

  const qRecv = prompt('Qty Receive', dRecv);
  if (qRecv === null) return null; // cancel
  const qAcc  = prompt('Qty Accept', dAcc);
  if (qAcc === null) return null;
  const qRej  = prompt('Qty Reject', dRej);
  if (qRej === null) return null;

  const qty_receive = numOrZero(qRecv);
  const qty_accept  = numOrZero(qAcc);
  const qty_reject  = numOrZero(qRej);

  if (qty_accept + qty_reject > qty_receive) {
    alert('qty_accept + qty_reject ต้องไม่เกิน qty_receive');
    return null;
  }
  return { qty_receive, qty_accept, qty_reject };
}

async function finishStep(id, result, qa_result = null, qa_notes = null){
  try{
    const step = steps.find(x => Number(x.id) === Number(id));
    const qtys = askQtysForStep(step);
    if (!qtys) return; // user cancel or invalid

    const qs = new URLSearchParams({ result });
    if (qa_result) qs.set('qa_result', qa_result);
    if (qa_notes)  qs.set('qa_notes', qa_notes);

    // ส่งผ่าน query string (เข้ากับ backend ปัจจุบัน)
    qs.set('qty_receive', String(qtys.qty_receive));
    qs.set('qty_accept',  String(qtys.qty_accept));
    qs.set('qty_reject',  String(qtys.qty_reject));

    await jfetch(`/traveler-steps/${id}/finish?${qs.toString()}`, { method:'POST' });
    toast(`Step ${result}`);
    await loadSteps();
  }catch(e){
    toast('ปิด Step ไม่สำเร็จ: ' + e.message, false);
  }
}

// ถ้า backend มี endpoint สำหรับ reset/reopen step
async function restartStep(id){
  try{
    await jfetch(`/traveler-steps/${id}/restart`, { method:'POST' });
    toast('Step restarted');
    await loadSteps();
  }catch(e){
    toast('รีสตาร์ท Step ไม่สำเร็จ: ' + e.message, false);
  }
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

  // reuse finishStep (จะถาม qty ด้วย)
  await finishStep(id, result,
    strOrNull($('s_qa_result')?.value),
    strOrNull($('s_qa_notes')?.value)
  );
}

// ----- Edit/Delete Step -----
function openEditStep(id){
  const s = steps.find(x => Number(x.id) === Number(id));
  if (!s){ toast('Step not found', false); return; }

  // ใช้ prompt แบบเร็ว ๆ
  const seq = Number(prompt('Seq', s.seq ?? 1) ?? s.seq ?? 1);
  const station = prompt('Station', s.station ?? '') ?? s.station ?? '';
  const step_name = prompt('Step Name', s.step_name ?? '') ?? s.step_name ?? '';
  const step_code = prompt('Step Code', s.step_code ?? '') ?? s.step_code ?? '';
  const operator_id = Number(prompt('Operator ID', s.operator_id ?? '') || s.operator_id || 0) || null;
  const qa_required = (prompt('QA required? true/false', String(!!s.qa_required)) || String(!!s.qa_required)).toLowerCase() === 'true';

  // ใหม่: แก้ qty
  const qty_receive = numOrZero(prompt('Qty Receive', String(s.qty_receive ?? 0)));
  const qty_accept  = numOrZero(prompt('Qty Accept',  String(s.qty_accept  ?? 0)));
  const qty_reject  = numOrZero(prompt('Qty Reject',  String(s.qty_reject  ?? 0)));
  if (qty_accept + qty_reject > qty_receive) {
    toast('qty_accept + qty_reject ต้องไม่เกิน qty_receive', false);
    return;
  }

  saveStep(id, { seq, station, step_name, step_code, operator_id, qa_required, qty_receive, qty_accept, qty_reject });
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
