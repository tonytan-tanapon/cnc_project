// /static/js/page-batches.js (v12) — keyset + tablex + toggler + attachAutocomplete for Material + label lookup + id fallbacks
import { $, jfetch, toast } from './api.js';
import { escapeHtml } from './utils.js';
import { createListPager } from './list-pager.js?v=2';
import { renderTableX } from './tablex.js';
import { createToggler } from './toggler.js';
import { attachAutocomplete } from './autocomplete.js';

/* ---- CONFIG / helpers ---- */
const DETAIL_PAGE = './batches-detail.html';
const batchUrl = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;
const gotoDetail = (id) => { if (id != null) location.href = batchUrl(id); };
window.gotoDetail = gotoDetail;

const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : d.toLocaleString();
};
const asDec = (v) => (v == null ? 0 : Number(v)); // display only

/* ---- UI refs (match your HTML) ---- */
const inputSearch      = $('b_q');
const selPerPage       = $('b_per_page');
const btnPrevTop       = $('b_prev');
const btnNextTop       = $('b_next');
const pageInfoTop      = $('b_page_info');
const btnPrevBottom    = $('b_prev2');
const btnNextBottom    = $('b_next2');
const pageInfoBottom   = $('b_page_info2');
const tableContainer   = $('b_table');
const btnReload        = $('b_reload');

const btnToggleCreate  = $('b_toggle_create');
const createCard       = $('b_create_card');
const btnCreate        = $('b_create');

/* ===================== Material autocomplete (like page-pos.js) ===================== */
/* HTML recommendations:
   <input id="b_material" placeholder="Search material…">
   <input id="b_material_id_val" type="hidden">
   If you keep old numeric input <input id="b_mid" type="number"> it will still work (no autocomplete).
*/
const matInput = $('b_material') || $('b_material_id') || $('b_mid'); // prefer #b_material
const matHidden = $('b_material_id_val'); // optional hidden
let selectedMaterial = null; // { id, code, name, spec?, uom? }
const preMaterialId = Number(new URLSearchParams(location.search).get('material_id') || 0);

const matLabelCache = new Map(); // id -> "[CODE] Name"
function labelFromMaterialObj(m) {
  const code = m?.code ? `[${m.code}] ` : '';
  return `${code}${m?.name ?? ''}`.trim() || '';
}

async function fillMaterialLabels(rows) {
  const ids = Array.from(new Set(
    rows.map(r => r.material_id).filter(id => id != null && !matLabelCache.has(id))
  ));
  if (!ids.length) return;
  try {
    const res = await jfetch(`/materials/lookup?ids=${ids.join(",")}`);
    (Array.isArray(res) ? res : []).forEach(m => {
      matLabelCache.set(m.id, labelFromMaterialObj(m));
    });
  } catch { /* ignore */ }
}

async function searchMaterials(term) {
  const q = (term || '').trim();
  if (!q) return [];
  try {
    const res = await jfetch(`/materials?q=${encodeURIComponent(q)}&page=1&per_page=10`);
    const items = Array.isArray(res) ? res : (res.items ?? []);
    return items.map(x => ({
      id: x.id ?? x.material_id ?? x.materialId,
      code: x.code ?? '',
      name: x.name ?? '',
      spec: x.spec ?? '',
      uom:  x.uom  ?? '',
    }));
  } catch (_) {
    try {
      const res2 = await jfetch(`/materials/keyset?q=${encodeURIComponent(q)}&limit=10`);
      const items2 = Array.isArray(res2) ? res2 : (res2.items ?? []);
      return items2.map(x => ({
        id: x.id ?? x.material_id ?? x.materialId,
        code: x.code ?? '',
        name: x.name ?? '',
        spec: x.spec ?? '',
        uom:  x.uom  ?? '',
      }));
    } catch {
      return [];
    }
  }
}

function materialDisplay(it) {
  if (!it) return '';
  const spec = it.spec ? ` · ${it.spec}` : '';
  const uom  = it.uom  ? ` (${it.uom})` : '';
  return `${it.code} — ${it.name}${spec}${uom}`;
}

async function resolveMaterialIfNeeded() {
  if (selectedMaterial?.id) return selectedMaterial;
  const term = (matInput?.value || '').trim();
  if (!term) return null;
  const list = await searchMaterials(term);
  if (list.length === 1) {
    selectedMaterial = list[0];
    if (matInput) matInput.value = materialDisplay(selectedMaterial);
    if (matHidden) matHidden.value = String(selectedMaterial.id);
    return selectedMaterial;
  }
  return null;
}

if (matInput && matInput.tagName === 'INPUT' && matInput.type !== 'number') {
  // Attach autocomplete only on text inputs
  attachAutocomplete(matInput, {
    fetchItems: searchMaterials,
    getDisplayValue: (it) => materialDisplay(it),
    renderItem: (it) =>
      `<div class="ac-row"><b>${escapeHtml(it.code)}</b> — ${escapeHtml(it.name)}${it.spec ? ' · ' + escapeHtml(it.spec) : ''}${it.uom ? ' (' + escapeHtml(it.uom) + ')' : ''}</div>`,
    onPick: (it) => {
      selectedMaterial = it || null;
      matInput.value = it ? materialDisplay(it) : '';
      if (matHidden) matHidden.value = it ? String(it.id) : '';
    },
    openOnFocus: true,
    minChars: 1,
    debounceMs: 200,
    maxHeight: 260,
  });

  matInput.addEventListener('input', () => { selectedMaterial = null; if (matHidden) matHidden.value = ''; });

  if (preMaterialId) {
    jfetch(`/materials/${preMaterialId}`).then(m => {
      selectedMaterial = {
        id: m.id,
        code: m.code ?? '',
        name: m.name ?? '',
        spec: m.spec ?? '',
        uom:  m.uom  ?? '',
      };
      matInput.value = materialDisplay(selectedMaterial);
      if (matHidden) matHidden.value = String(m.id);
    }).catch(() => {});
  }
}

/* ===================== Table / Pager ===================== */
async function renderBatchesTable(container, rows, ctx = {}) {
  // ensure labels are ready before drawing
  await fillMaterialLabels(rows);

  renderTableX(container, rows, {
    rowStart: Number(ctx.rowStart || 0),
    getRowId: r => r.id ?? r.batch_id ?? r.batchId,
    onRowClick: r => {
      const rid = r.id ?? r.batch_id ?? r.batchId;
      if (rid != null) gotoDetail(rid);
    },
    columns: [
      { key: '__no', title: 'No.', width: '64px', align: 'right' },
      {
        key: 'batch_no', title: 'Batch No', width: '140px',
        render: r => {
          const rid = r.id ?? r.batch_id ?? r.batchId;
          const txt = escapeHtml(r.batch_no ?? '');
          return rid ? `<a href="${batchUrl(rid)}" class="code-link">${txt}</a>` : txt;
        }
      },
      {
        key: 'material_id', title: 'Material', width: '240px',
        render: r => {
          const label = r.material ? labelFromMaterialObj(r.material)
                       : matLabelCache.get(r.material_id) || (r.material_id != null ? `#${r.material_id}` : '');
          const mid = r.material?.id ?? r.material_id;
          return mid
            ? `<a href="/static/materials-detail.html?id=${encodeURIComponent(mid)}">${escapeHtml(label)}</a>`
            : escapeHtml(label);
        }
      },
      { key: 'supplier_batch_no', title: 'Supplier Batch', width: '160px', render: r => escapeHtml(r.supplier_batch_no ?? '') },
      { key: 'mill_heat_no', title: 'Heat No', width: '120px', render: r => escapeHtml(r.mill_heat_no ?? '') },
      { key: 'received_at', title: 'Received', width: '180px', align: 'right', render: r => fmtDate(r.received_at) },
      {
        key: 'qty_received', title: 'Qty Recv', width: '110px', align: 'right',
        render: r => asDec(r.qty_received).toLocaleString()
      },
      {
        key: 'qty_used', title: 'Used', width: '100px', align: 'right',
        render: r => asDec(r.qty_used).toLocaleString()
      },
      {
        key: 'qty_avail', title: 'Available', width: '120px', align: 'right',
        render: r => {
          const avail = asDec(r.qty_received) - asDec(r.qty_used);
          return avail.toLocaleString();
        }
      },
      { key: 'location', title: 'Location', width: '140px', render: r => escapeHtml(r.location ?? '') },
    ],
    emptyHtml: '<div class="muted">No batches</div>',
  });
}

/* ---- list pager ---- */
// let lp = createListPager({
//   url: '/batches/keyset',
//   pageSize: Number(selPerPage?.value || 20),
//   container: tableContainer,
//   render: renderBatchesTable, // async renderer supported
//   pageInfoEls: [pageInfoTop, pageInfoBottom],
//   prevButtons: [btnPrevTop, btnPrevBottom],
//   nextButtons: [btnNextTop, btnNextBottom],
//   queryKey: 'q',
// });

/* ===================== Create Batch ===================== */
function readStr(id) { const v = $(id)?.value ?? ''; return v.trim(); }

async function createBatch() {
  // Resolve material id from: autocomplete object -> hidden -> numeric input fallback
  if (!selectedMaterial?.id && matInput && matInput.tagName === 'INPUT' && matInput.type !== 'number') {
    await resolveMaterialIfNeeded();
  }
  const matId =
    (selectedMaterial?.id != null ? Number(selectedMaterial.id) : null) ??
    (matHidden?.value ? Number(matHidden.value) : null) ??
    ($('b_mid')?.value ? Number($('b_mid').value) : null);

  if (!Number.isInteger(matId) || matId <= 0) {
    toast('Select Material !!', false);
    matInput?.focus();
    return;
  }

  // Support both old and new IDs
  const batch_no      = (readStr('b_batch_no') || readStr('b_no')) || 'AUTO';
  const supplier_id_s = $('b_supplier_id')?.value ?? $('b_sid')?.value ?? '';
  const supplier_id   = supplier_id_s !== '' ? Number(supplier_id_s) : null;

  const supplier_batch_no = readStr('b_supplier_batch_no') || null;
  const mill_name         = readStr('b_mill_name') || null;
  const mill_heat_no      = readStr('b_mill_heat_no') || null;

  const received_at = ($('b_received_at')?.value || $('b_recv')?.value || '') || null; // YYYY-MM-DD (date input)

  const qty_s = ($('b_qty_received')?.value ?? $('b_qty')?.value ?? '').trim();
  if (qty_s === '' || Number(qty_s) <= 0) {
    toast('Qty Received must be > 0', false);  // change to >= 0 if your schema allows 0
    ($('b_qty_received') || $('b_qty'))?.focus();
    return;
  }
  const qty_received = String(qty_s); // Decimal as string

  const cert_file = readStr('b_cert_file') || null;
  const location  = (readStr('b_location') || readStr('b_loc')) || null;

  const payload = {
    material_id: matId,
    batch_no,
    supplier_id,
    supplier_batch_no,
    mill_name,
    mill_heat_no,
    received_at,
    qty_received,
    cert_file,
    location,
  };
  console.log("batches")
  try {
    await jfetch('/batches', { method: 'POST', body: JSON.stringify(payload) });
    toast('Batch created');

    // Clear form (keep chosen material value visible)
    ['b_batch_no','b_no','b_supplier_id','b_sid','b_supplier_batch_no','b_mill_name','b_mill_heat_no',
     'b_received_at','b_recv','b_qty_received','b_qty','b_location','b_loc','b_cert_file']
      .forEach(id => { const el = $(id); if (el) el.value = ''; });

    createTg?.close();           // close only after success
    await lp.reloadFirst();
  } catch (e) {
    console.error(e);
    toast(e?.message || 'Create failed', false);
  }
}

/* ---- boot ---- */
let createTg;
document.addEventListener('DOMContentLoaded', async () => {
  // toggler for create section (stay open while picking autocomplete)
  createTg = createToggler({
    trigger: btnToggleCreate,
    panel: createCard,
    persistKey: 'batches:create',
    focusTarget: '#b_material, #b_mid',
    closeOnEsc: false,
    closeOnOutside: false, // important
    group: 'top-actions',
    onOpen:  () => { btnToggleCreate.textContent = '× Cancel'; },
    onClose: () => { btnToggleCreate.textContent = '+ Add'; },
  });
  btnToggleCreate.textContent = createTg.isOpen() ? '× Cancel' : '+ Add';

  // wire search + per-page + reload
  lp.bindSearch(inputSearch, { debounceMs: 300 });
  lp.bindPerPage(selPerPage);
  btnReload?.addEventListener('click', () => lp.reloadPage?.() ?? location.reload());

  // create handler
  btnCreate?.addEventListener('click', createBatch);

  // first load; fallback if /keyset not available
  try {
    await lp.reloadFirst();
  } catch {
    lp = createListPager({
      url: '/batches',
      pageSize: Number(selPerPage?.value || 20),
      container: tableContainer,
      render: renderBatchesTable, // still async
      pageInfoEls: [pageInfoTop, pageInfoBottom],
      prevButtons: [btnPrevTop, btnPrevBottom],
      nextButtons: [btnNextTop, btnNextBottom],
      queryKey: 'q',
    });
    lp.bindSearch(inputSearch, { debounceMs: 300 });
    lp.bindPerPage(selPerPage);
    await lp.reloadFirst();
  }

  // If only numeric #b_mid exists and ?material_id= provided, prefill it
  if (!selectedMaterial?.id && $('b_mid') && preMaterialId) {
    $('b_mid').value = String(preMaterialId);
  }
});
