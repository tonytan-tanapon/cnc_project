// /static/js/page-customers.js
import { $, jfetch, toast } from './api.js'; 

/* ----------------- CONFIG ----------------- */
const DETAIL_PAGE = './customers-detail.html';

/* ----------------- helpers ----------------- */
function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function customerUrl(id) {
  return `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;
}

function gotoDetail(id) {
  if (!id) return;
  location.href = customerUrl(id);
}
window.gotoDetail = gotoDetail;

/* ----------------- table renderer ----------------- */
function renderCustomersTable(container, rows) {

  // container is html element to show. ex const container = $('c_table'); 
  // rows is data recieving from server. ex const rows = await jfetch(url);
  // if empty rows
  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="empty">No customers</div>';
    return;
  }

  // function getID(r){
  //      return r.id || r.customer_id || r.customerId || '' 
  // }
  const getId = (r) => r.id ?? r.customer_id ?? r.customerId ?? ''; 

  // define data in bodyHTML
  // loop data in rows
  // return data in each row 
  const bodyHTML = rows.map(r => { // in ecah row do somthing
    const rid = getId(r);  // get id 
    // make link
    // ex codeCell = <a href="./customers-detail.html?id=5" class="code-link">C0005</a>
    const codeCell = rid
      ? `<a href="${customerUrl(rid)}" class="code-link">${escapeHtml(r.code ?? '')}</a>`  // ? if True
      : `<span>${escapeHtml(r.code ?? '')}</span>`;                                        // : if False

    // const nameCell = rid
    //   ? `<a href="${customerUrl(rid)}" class="name-link">${escapeHtml(r.name ?? '')}</a>`
    //   : `<span>${escapeHtml(r.name ?? '')}</span>`;

    // return each rows  
    return `
      <tr class="click-row" data-id="${escapeHtml(rid)}" tabindex="0" title="Open detail">
        <td>${codeCell}</td>
        <td>${escapeHtml(r.name ?? '')}</td>
        <td>${escapeHtml(r.contact ?? '')}</td>
        <td>${escapeHtml(r.email ?? '')}</td>
        <td>${escapeHtml(r.phone ?? '')}</td>
      </tr>
    `;
  }).join('');


  // add bodyHTML to real table.
  // note colume name show be same with original in HTML
  container.innerHTML = `
    <table class="table customers-table">
      <thead>
        <tr>
          <th style="width:120px">Code</th>
          <th>Name</th>
          <th style="width:200px">Contact</th>
          <th style="width:240px">Email</th>
          <th style="width:140px">Phone</th>
        </tr>
      </thead>
      <tbody>${bodyHTML}</tbody>
    </table>
    <style>
      .customers-table a { text-decoration: underline; }
      .click-row { cursor: pointer; }
      .click-row:focus { outline: 2px solid #77aaff; outline-offset: 2px; }
      .customers-table tr:hover { background: rgba(0,0,0,.03); }
    </style>
  `;
}

/* ----------------- data ops ----------------- */
async function loadCustomers() {
  const q = $('c_q')?.value?.trim();  //serach box
  const url = '/customers' + (q ? `?q=${encodeURIComponent(q)}` : '');
 
  try {
    
    const rows = await jfetch(url); // get row from APIs

    const container = $('c_table'); 
    if (!container) return; // if not found container return. in fact we should have container to show the data 
    renderCustomersTable(container, rows); // show data in table by sending container and rows
  } catch (e) {
    $('c_table').innerHTML = `<div class="hint">${escapeHtml(e.message ?? 'Error')}</div>`;
  }
}

async function createCustomer() {
  // Set payload as data in each text box as JSON format 
  const payload = {
    code: $('c_code')?.value.trim() || '',
    name: $('c_name').value.trim(),
    contact: $('c_contact').value.trim() || null,
    email: $('c_email').value.trim() || null,
    phone: $('c_phone').value.trim() || null,
    address: $('c_addr').value.trim() || null,
  };
 
  if (!payload.name) {
    toast('Enter customer name', false);
    return;
  }

  try {
    await jfetch('/customers', { method: 'POST', body: JSON.stringify(payload) });
    toast('Customer created');

    // clear form
    ['c_code','c_name','c_contact','c_email','c_phone','c_addr'].forEach(id => $(id).value = '');
    await loadCustomers();
  } catch (e) {
    toast(e.message || 'Create failed', false);
  }
}

/* ----------------- boot ----------------- */
document.addEventListener('DOMContentLoaded', () => {
  $('c_create')?.addEventListener('click', createCustomer); // if c_create click go to createCustomer()
  $('c_reload')?.addEventListener('click', loadCustomers);  // if c_reload click go to loadCustomers()
  $('c_q')?.addEventListener('keydown', e => { loadCustomers(); }); // if keydown only
  // $('c_q')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadCustomers(); }); // if keydown and enter
  const container = $('c_table');
  if (container) {              // if click row of table 
    container.addEventListener('click', (e) => {
      const isAnchor = e.target.closest('a[href]');
      if (isAnchor) return;
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const id = tr.dataset.id;
      if (id) gotoDetail(id);
    });
  }

  loadCustomers();
});
