import { $, jfetch, renderTable, toast } from '/static/js/api.js';

async function loadCustomers() {
  const q = $('c_q')?.value?.trim();
  try {
    const rows = await jfetch('/customers' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    renderTable($('c_table'), rows);
  } catch (e) {
    $('c_table').innerHTML = `<div class="hint">${e.message}</div>`;
  }
}

async function createCustomer() {
  const payload = {
    code: $('c_code').value.trim(),
    name: $('c_name').value.trim(),
    contact: $('c_contact').value.trim() || null,
    email: $('c_email').value.trim() || null,
    phone: $('c_phone').value.trim() || null,
    address: $('c_addr').value.trim() || null,
  };
  if (!payload.name) return toast('กรอกชื่อลูกค้าก่อน', false);

  try {
    await jfetch('/customers',{ method:'POST', body: JSON.stringify(payload) });
    toast('Customer created');
    ['c_code','c_name','c_contact','c_email','c_phone','c_addr'].forEach(id => $(id).value = '');
    await loadCustomers();
  } catch (e) {
    toast(e.message, false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('c_create')?.addEventListener('click', createCustomer);
  $('c_reload')?.addEventListener('click', loadCustomers);
  $('c_q')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadCustomers(); });
  loadCustomers();
});
