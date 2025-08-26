// /static/js/page-customer-detail.js
import { $, jfetch, toast } from './api.js';

// ดึง id จาก query string
const qs = new URLSearchParams(location.search);
const customerId = qs.get('id');

let initial = null; // เก็บไว้สำหรับ Reset

function fillForm(data) {
  $('c_code').value    = data.code    ?? '';
  $('c_name').value    = data.name    ?? '';
  $('c_phone').value   = data.phone   ?? '';
  $('c_contact').value = data.contact ?? '';
  $('c_email').value   = data.email   ?? '';
  $('c_addr').value    = data.address ?? '';
}

function readForm() {
  return {
    code: ($('c_code').value ?? '').trim() || null,
    name: ($('c_name').value ?? '').trim(),
    phone: ($('c_phone').value ?? '').trim() || null,
    contact: ($('c_contact').value ?? '').trim() || null,
    email: ($('c_email').value ?? '').trim() || null,
    address: ($('c_addr').value ?? '').trim() || null,
  };
}

function setBusy(b) {
  $('btnSave').disabled = b;
  $('btnReset').disabled = b;
  $('btnDelete').disabled = b;
  $('hint').textContent = b ? 'Working…' : '';
}

async function loadCustomer() {
  if (!customerId) {
    $('errorBox').style.display = '';
    $('errorBox').textContent = 'Missing ?id= in URL';
    setBusy(true);
    return;
  }
  setBusy(true);
  try {
    const c = await jfetch(`/customers/${encodeURIComponent(customerId)}`);
    initial = c;
    fillForm(c);
    $('subTitle').textContent = `#${c.id} — ${c.name ?? c.code ?? ''}`;
    document.title = `Customer · ${c.name ?? c.code ?? c.id}`;
  } catch (e) {
    $('errorBox').style.display = '';
    $('errorBox').textContent = e?.message || 'Load failed';
    setBusy(true);
    return;
  } finally {
    setBusy(false);
  }
}

async function saveCustomer() {
  const payload = readForm();
  if (!payload.name) {
    toast('กรอก Name ก่อน', false);
    $('c_name').focus();
    return;
  }
  // เคส code ว่าง = ให้เป็น null (ฝั่ง backend อนุญาตแก้ code ได้)
  if (payload.code && typeof payload.code === 'string') {
    payload.code = payload.code.toUpperCase();
  }

  setBusy(true);
  try {
    // ตาม router ของคุณใช้ PUT /customers/{id}
    const updated = await jfetch(`/customers/${encodeURIComponent(customerId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    initial = updated;
    fillForm(updated);
    $('subTitle').textContent = `#${updated.id} — ${updated.name ?? updated.code ?? ''}`;
    toast('Saved');
  } catch (e) {
    // ตัวอย่าง error เด่น ๆ ที่เจอจาก backend:
    // 409 "Customer code already exists"
    // 400 "'name' is required"
    toast(e?.message || 'Save failed', false);
  } finally {
    setBusy(false);
  }
}

async function deleteCustomer() {
  if (!confirm('ลบลูกค้ารายนี้?\nThis action cannot be undone.')) return;
  setBusy(true);
  try {
    await jfetch(`/customers/${encodeURIComponent(customerId)}`, { method: 'DELETE' });
    toast('Deleted');
    // กลับหน้า list
    location.href = '/static/customers.html';
  } catch (e) {
    // eg. 400 "Customer has POs; cannot delete"
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
  $('btnSave').addEventListener('click', saveCustomer);
  $('btnReset').addEventListener('click', resetForm);
  $('btnDelete').addEventListener('click', deleteCustomer);

  // Enter ที่ช่อง name = save เร็ว ๆ
  $('c_name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveCustomer();
  });

  loadCustomer();
});
