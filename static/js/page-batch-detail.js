// /static/js/page-batch-detail.js (v4) — material autocomplete + qty_used editable
import { $, jfetch, toast } from './api.js';
import { attachAutocomplete } from './autocomplete.js';

const qs = new URLSearchParams(location.search);
const batchId = qs.get('id');

let initial = null;             // original batch from server
let selectedMaterial = null;    // { id, code, name, spec?, uom? }

/* ---------------- helpers ---------------- */
function fmtDateOnly(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function fmtLocalDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : d.toLocaleString();
}
function readNum(elId) {
  const v = $(elId)?.value ?? '';
  return v === '' ? null : Number(v);
}
function readStr(elId) {
  const v = $(elId)?.value ?? '';
  const s = v.trim();
  return s === '' ? null : s;
}
function setBusy(b) {
  $('btnSave')?.toggleAttribute('disabled', b);
  $('btnReset')?.toggleAttribute('disabled', b);
  $('btnDelete')?.toggleAttribute('disabled', b);
  $('hint').textContent = b ? 'Working…' : '';
}
function materialDisplay(it) {
  if (!it) return '';
  const spec = it.spec ? ` · ${it.spec}` : '';
  const uom  = it.uom  ? ` (${it.uom})` : '';
  return `${it.code ?? ''} — ${it.name ?? ''}${spec}${uom}`.trim();
}

/* --------- material search (like page-pos.js) ---------- */
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

// If the API didn’t embed material, resolve label from /materials/lookup
async function resolveMaterialLabel(mid) {
  if (!mid) return;
  try {
    const res = await jfetch(`/materials/lookup?ids=${mid}`);
    const m = (Array.isArray(res) ? res : [])[0];
    if (m) {
      $('bd_material').value = `${m.code ? `[${m.code}] ` : ''}${m.name ?? ''}`.trim();
    } else {
      $('bd_material').value = `#${mid}`;
    }
  } catch {
    $('bd_material').value = `#${mid}`;
  }
}

// Resolve when user typed but didn’t pick; if exactly 1 match, use it.
async function resolveMaterialIfNeeded() {
  if (selectedMaterial?.id) return selectedMaterial;
  const term = ($('bd_material')?.value || '').trim();
  if (!term) return null;
  const list = await searchMaterials(term);
  if (list.length === 1) {
    selectedMaterial = list[0];
    $('bd_material').value = materialDisplay(selectedMaterial);
    $('bd_material_id_val').value = String(selectedMaterial.id);
    updateMaterialLink(selectedMaterial.id);
    return selectedMaterial;
  }
  return null;
}

/* --------------- fill & read --------------- */
function updateMaterialLink(mid) {
  const matLink = $('bd_material_link');
  if (!matLink) return;
  matLink.href = mid ? `/static/materials-detail.html?id=${encodeURIComponent(mid)}` : '#';
  matLink.toggleAttribute('disabled', !mid);
}

function fillForm(b) {
  $('bd_no').value = b.batch_no ?? '';

  // Material field + hidden id
  const mid = b.material_id ?? b.material?.id ?? null;
  if (b.material) {
    $('bd_material').value = `${b.material.code ? `[${b.material.code}] ` : ''}${b.material.name ?? ''}`;
  } else if (mid != null) {
    $('bd_material').value = '';     // wait for lookup to fill
    resolveMaterialLabel(mid);       // async label resolve
  } else {
    $('bd_material').value = '';
  }
  $('bd_material_id_val').value = mid != null ? String(mid) : '';

  // Keep snapshot
  selectedMaterial = mid != null ? {
    id: mid,
    code: b.material?.code ?? '',
    name: b.material?.name ?? '',
    spec: b.material?.spec ?? '',
    uom:  b.material?.uom  ?? '',
  } : null;

  updateMaterialLink(mid);

  $('bd_supplier_id').value = b.supplier_id ?? '';
  $('bd_supplier_batch_no').value = b.supplier_batch_no ?? '';
  $('bd_mill_name').value = b.mill_name ?? '';
  $('bd_mill_heat_no').value = b.mill_heat_no ?? '';
  $('bd_received_at').value = fmtDateOnly(b.received_at);

  $('bd_qty_received').value = b.qty_received ?? '';
  $('bd_qty_used').value = b.qty_used ?? ''; // EDITABLE now

  $('bd_location').value = b.location ?? '';
  $('bd_cert_file').value = b.cert_file ?? '';

  const certLink = $('bd_cert_link');
  if (certLink) {
    const url = b.cert_file || '';
    certLink.href = url || '#';
    certLink.toggleAttribute('disabled', !url);
  }

  $('bd_created_at').textContent = fmtLocalDateTime(b.created_at);
  const avail = Number(b.qty_received ?? 0) - Number(b.qty_used ?? 0);
  $('bd_available').textContent = isNaN(avail) ? '—' : avail.toLocaleString();

  document.title = `Batch · ${b.batch_no ?? b.id}`;
}

function readForm() {
  // material_id from selection or hidden
  const hid = $('bd_material_id_val')?.value || '';
  const material_id = selectedMaterial?.id != null
    ? Number(selectedMaterial.id)
    : (hid ? Number(hid) : null);

  return {
    material_id, // may change
    batch_no: readStr('bd_no'),
    supplier_id: readNum('bd_supplier_id'),
    supplier_batch_no: readStr('bd_supplier_batch_no'),
    mill_name: readStr('bd_mill_name'),
    mill_heat_no: readStr('bd_mill_heat_no'),
    received_at: (function() {
      const s = $('bd_received_at')?.value || '';
      return s || null; // "YYYY-MM-DD" or null
    })(),
    qty_received: (function() {
      const v = $('bd_qty_received')?.value ?? '';
      return v === '' ? null : String(v); // Decimal as string
    })(),
    qty_used: (function() {
      const v = $('bd_qty_used')?.value ?? '';
      return v === '' ? null : String(v); // Decimal as string
    })(),
    location: readStr('bd_location'),
    cert_file: readStr('bd_cert_file'),
  };
}

function diffPatch(orig, cur) {
  const patch = {};
  for (const k of Object.keys(cur)) {
    const a = orig?.[k];
    const b = cur[k];
    const na = (a === '' || a === undefined) ? null : a;
    const nb = (b === '' || b === undefined) ? null : b;
    if (na !== nb) patch[k] = b;
  }
  return patch;
}

/* --------------- CRUD --------------- */
async function loadBatch() {
  if (!batchId) {
    $('errorBox').style.display = '';
    $('errorBox').textContent = 'Missing ?id= in URL';
    setBusy(true);
    return;
  }
  setBusy(true);
  try {
    const b = await jfetch(`/batches/${encodeURIComponent(batchId)}`);
    initial = b;
    fillForm(b);
  } catch (e) {
    $('errorBox').style.display = '';
    $('errorBox').textContent = e?.message || 'Load failed';
    setBusy(true);
    return;
  } finally {
    setBusy(false);
  }
}

async function saveBatch() {
  // Resolve material if user typed but didn’t pick
  if (!selectedMaterial?.id && ($('bd_material')?.value || '').trim()) {
    await resolveMaterialIfNeeded();
  }

  const cur = readForm();

  // Target numbers considering simultaneous edits
  const recvTarget = cur.qty_received != null ? Number(cur.qty_received) : Number(initial?.qty_received ?? 0);
  const usedTarget = cur.qty_used     != null ? Number(cur.qty_used)     : Number(initial?.qty_used ?? 0);

  // Client-side guards (server also enforces)
  if (Number.isNaN(recvTarget) || recvTarget < 0) {
    toast('Qty Received must be a number ≥ 0', false);
    $('bd_qty_received')?.focus(); return;
  }
  if (Number.isNaN(usedTarget) || usedTarget < 0) {
    toast('Qty Used must be a number ≥ 0', false);
    $('bd_qty_used')?.focus(); return;
  }
  if (usedTarget > recvTarget) {
    toast('Qty Used must not exceed Qty Received', false);
    $('bd_qty_used')?.focus(); return;
  }

  // If material cleared accidentally, keep original id
  if (cur.material_id == null) {
    cur.material_id = initial?.material_id ?? initial?.material?.id ?? null;
  }

  const patch = diffPatch(initial, cur);
  if (Object.keys(patch).length === 0) {
    toast('No changes', true);
    return;
  }

  setBusy(true);
  try {
    const updated = await jfetch(`/batches/${encodeURIComponent(batchId)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    initial = updated;
    fillForm(updated);
    toast('Saved');
  } catch (e) {
    const msg = e?.message || (Array.isArray(e?.detail) ? e.detail.map(d=>d.msg).join(', ') : e?.detail) || 'Save failed';
    toast(msg, false);
  } finally {
    setBusy(false);
  }
}

async function deleteBatch() {
  if (!confirm('Delete Batch?\nThis action cannot be undone.')) return;
  setBusy(true);
  try {
    await jfetch(`/batches/${encodeURIComponent(batchId)}`, { method: 'DELETE' });
    toast('Deleted');
    location.href = '/static/batches.html';
  } catch (e) {
    const msg = e?.message || e?.detail || 'Delete failed';
    toast(msg, false);
  } finally {
    setBusy(false);
  }
}

function resetForm() {
  if (!initial) return;
  fillForm(initial);
  toast('Reset');
}

/* --------------- bind --------------- */
document.addEventListener('DOMContentLoaded', () => {
  // Material autocomplete
  attachAutocomplete($('bd_material'), {
    fetchItems: searchMaterials,
    getDisplayValue: (it) => materialDisplay(it),
    renderItem: (it) =>
      `<div class="ac-row"><b>${(it.code ?? '')}</b> — ${it.name ?? ''}${it.spec ? ' · ' + it.spec : ''}${it.uom ? ' (' + it.uom + ')' : ''}</div>`,
    onPick: (it) => {
      selectedMaterial = it || null;
      $('bd_material').value = it ? materialDisplay(it) : '';
      $('bd_material_id_val').value = it ? String(it.id) : '';
      updateMaterialLink(it?.id ?? null);
    },
    openOnFocus: true,
    minChars: 1,
    debounceMs: 200,
    maxHeight: 260,
  });

  // If user types after pick, clear selection so we validate/resolve on save
  $('bd_material')?.addEventListener('input', () => {
    selectedMaterial = null;
    $('bd_material_id_val').value = '';
  });

  $('btnSave')?.addEventListener('click', saveBatch);
  $('btnReset')?.addEventListener('click', resetForm);
  $('btnDelete')?.addEventListener('click', deleteBatch);

  // quick Enter-save on some fields
  ['bd_no','bd_mill_heat_no','bd_qty_received','bd_qty_used','bd_location'].forEach(id => {
    $(id)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveBatch();
    });
  });

  loadBatch();
});
