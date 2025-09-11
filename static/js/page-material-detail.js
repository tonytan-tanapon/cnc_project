// /static/js/page-material-detail.js
import { $, jfetch, toast } from './api.js';

// id จาก query string
const qs = new URLSearchParams(location.search);
const materialId = qs.get('id');

let initial = null; // เก็บสำหรับ reset

function fillForm(data) {
  $('m_code').value   = data.code   ?? '';
  $('m_name').value   = data.name   ?? '';
  $('m_spec').value   = data.spec   ?? '';
  $('m_uom').value    = data.uom    ?? '';
  $('m_remark').value = data.remark ?? '';
}

function readForm() {
  return {
    code:   ($('m_code').value   ?? '').trim() || null,
    name:   ($('m_name').value   ?? '').trim(),
    spec:   ($('m_spec').value   ?? '').trim()   || null,
    uom:    ($('m_uom').value    ?? '').trim()   || null,
    remark: ($('m_remark').value ?? '').trim()   || null,
  };
}

function setBusy(b) {
  $('btnSave').disabled = b;
  $('btnReset').disabled = b;
  $('btnDelete').disabled = b;
  $('hint').textContent = b ? 'Working…' : '';
}

async function loadMaterial() {
  if (!materialId) {
    $('errorBox').style.display = '';
    $('errorBox').textContent = 'Missing ?id= in URL';
    setBusy(true);
    return;
  }
  setBusy(true);
  try {
    const m = await jfetch(`/materials/${encodeURIComponent(materialId)}`); // get by id
    initial = m;
    fillForm(m);
    document.title = `Material · ${m.name ?? m.code ?? m.id}`;
  } catch (e) {
    $('errorBox').style.display = '';
    $('errorBox').textContent = e?.message || 'Load failed';
    setBusy(true);
    return;
  } finally {
    setBusy(false);
  }
}

async function saveMaterial() {
  const payload = readForm();
  if (!payload.name) {
    toast('กรอก Name ก่อน', false);
    $('m_name').focus();
    return;
  }
  // Uppercase code (ให้เหมือนลูกค้า)
  if (payload.code && typeof payload.code === 'string') {
    payload.code = payload.code.toUpperCase();
  }

  setBusy(true);
  try {
    const updated = await jfetch(`/materials/${encodeURIComponent(materialId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    initial = updated;
    fillForm(updated);
    toast('Saved');
  } catch (e) {
    // ตัวอย่างจาก backend:
    // 409 "Material code already exists"
    // 400 "name is required"
    toast(e?.message || 'Save failed', false);
  } finally {
    setBusy(false);
  }
}

async function deleteMaterial() {
  if (!confirm('Delete material?\nThis action cannot be undone.')) return;
  setBusy(true);
  try {
    await jfetch(`/materials/${encodeURIComponent(materialId)}`, { method: 'DELETE' });
    toast('Deleted');
    // กลับหน้า list
    location.href = '/static/materials.html';
  } catch (e) {
    // eg. 400 "Material has batches; cannot delete"
    toast(e?.message || 'Delete failed', false);
  } finally {
    setBusy(false);
  }
}

function resetForm() {
  if (!initial) return;
  fillForm(initial);
  toast('Reset');
}

document.addEventListener('DOMContentLoaded', () => {
  // ปุ่ม
  $('btnSave').addEventListener('click', saveMaterial);
  $('btnReset').addEventListener('click', resetForm);
  $('btnDelete').addEventListener('click', deleteMaterial);

  // Enter ที่ช่อง name = save เร็ว ๆ
  $('m_name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveMaterial();
  });

  loadMaterial();
});
