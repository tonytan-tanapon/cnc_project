// /static/js/page-part-detail.js  (TableX + guards + inline edit)
import { $, jfetch, showToast as toast } from "/static/js/api.js";
import { renderTableX } from "/static/js/tablex.js";

let partId = null;           // กำหนดตอน DOMContentLoaded
let original = null;
let headerOpen = false;

const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/* ---------------- Part header ---------------- */
function setBusyHead(b) {
  ["btnSavePart", "btnResetPart", "btnDeletePart"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = b;
  });
  const hint = $("hintPart");
  if (hint) hint.textContent = b ? "Working…" : "";
}

function fillHeader(p) {
  $("part_no").value = p.part_no ?? "";
  $("part_name").value = p.name ?? "";
  $("part_desc").value = p.description ?? "";
  $("part_uom").value = p.uom ?? "";
  $("part_status").value = p.status ?? "active";
  $("subTitle").textContent = `#${p.id} — ${p.part_no ?? ""}`;
}

function readHeader() {
  const v = (x) => (x ?? "").trim();
  return {
    part_no: v($("part_no").value).toUpperCase() || null,
    name: v($("part_name").value) || null,
    description: v($("part_desc").value) || null,
    uom: v($("part_uom").value) || null,
    status: $("part_status").value || "active",
  };
}

function showHeaderEditor() {
  const sec = $("sec-part");
  if (!sec) return;
  sec.hidden = false;
  $("btnHeaderEdit").textContent = "Cancel";
  headerOpen = true;
}
function hideHeaderEditor() {
  const sec = $("sec-part");
  if (!sec) return;
  sec.hidden = true;
  $("btnHeaderEdit").textContent = "Edit";
  headerOpen = false;
}

async function loadPart() {
  if (!Number.isFinite(partId)) return;   // กัน id หาย
  setBusyHead(true);
  try {
    const p = await jfetch(`/parts/${encodeURIComponent(partId)}`);
    original = p;
    fillHeader(p);
    document.title = `Part · ${p.part_no ?? p.id}`;
  } catch (e) {
    toast(e?.message || "Load failed", false);
  } finally {
    setBusyHead(false);
  }
}

async function savePart() {
  if (!Number.isFinite(partId)) return;
  const payload = readHeader();
  setBusyHead(true);
  try {
    const updated = await jfetch(`/parts/${encodeURIComponent(partId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    original = updated;
    fillHeader(updated);
    toast("Saved");
    hideHeaderEditor();
  } catch (e) {
    toast(e?.message || "Save failed", false);
  } finally {
    setBusyHead(false);
  }
}

function resetPart() {
  if (!original) return;
  fillHeader(original);
  toast("Reset");
}

async function deletePart() {
  if (!Number.isFinite(partId)) return;
  if (!confirm("ลบ Part นี้?")) return;
  setBusyHead(true);
  try {
    
    await jfetch(`/parts/${encodeURIComponent(partId)}`, { method: "DELETE" });
    toast("Deleted");
    location.href = "/static/parts.html";
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  } finally {
    setBusyHead(false);
  }
}

/* ---------------- Revisions (TableX + inline edit) ---------------- */
let revisions = [];
let editingId = null;      // id แถวที่กำลังแก้
let draft = null;          // ค่ากำลังแก้ (rev/spec/drawing_file/description)
const revTableEl = $("rev_table");   // ถ้ามี div id="rev_table" จะใช้ TableX
const revBodyEl  = $("revBody");     // ถ้ายังใช้ <tbody id="revBody"> เดิม จะ fallback

function renderRevisions() {
  const rows = revisions.map(r => {
    const isEditing = editingId === r.id;
    const d = isEditing ? draft : r;

    return {
      id: r.id,
      is_current: !!r.is_current,
      rev: d?.rev ?? r.rev ?? "",
      spec: d?.spec ?? r.spec ?? "",
      drawing_file: d?.drawing_file ?? r.drawing_file ?? "",
      description: d?.description ?? r.description ?? "",
    };
  });

  // ---------- ใช้ TableX ----------
  if (revTableEl) {
    renderTableX(revTableEl, rows, {
      rowStart: 0,
      getRowId: r => r.id,
      columns: [
        { key: '__no', title: 'No.', width: '64px', align: 'right' },
        {
          key: 'rev', title: 'Rev', width: '120px',
          render: r => (editingId === r.id)
            ? `<input class="in in-sm" data-fld="rev" value="${escapeHtml(r.rev)}" />`
            : `<span>${escapeHtml(r.rev)}</span>${r.is_current ? ' <span class="badge">current</span>' : ''}`
        },
        {
          key: 'spec', title: 'Spec', width: '160px',
          render: r => (editingId === r.id)
            ? `<input class="in in-sm" data-fld="spec" value="${escapeHtml(r.spec)}" />`
            : escapeHtml(r.spec)
        },
        {
          key: 'drawing_file', title: 'Drawing', width: '180px',
          render: r => (editingId === r.id)
            ? `<input class="in in-sm" data-fld="drawing_file" value="${escapeHtml(r.drawing_file)}" />`
            : escapeHtml(r.drawing_file)
        },
        {
          key: 'description', title: 'Description', grow: 1,
          render: r => (editingId === r.id)
            ? `<input class="in in-sm" data-fld="description" value="${escapeHtml(r.description)}" />`
            : escapeHtml(r.description)
        },
        {
          key: '__act', title: 'Action', width: '260px', align: 'right',
          render: r => (editingId === r.id)
            ? `
              <button class="btn-small" data-save="${r.id}">Save</button>
              <button class="btn-small ghost" data-cancel="${r.id}">Cancel</button>
            `
            : `
              <button class="btn-small" data-edit="${r.id}">Edit</button>
              <button class="btn-small danger" data-del="${r.id}">Delete</button>
              ${r.is_current ? '' : `<button class="btn-small ghost" data-makecur="${r.id}">Make current</button>`}
            `
        },
      ],
      emptyText: 'No revisions',
    });
    return;
  }

  // ---------- fallback <tbody> ----------
  if (!revBodyEl) return;

  if (!rows.length) {
    revBodyEl.innerHTML = `<tr><td colspan="5" class="empty">No revisions</td></tr>`;
    return;
  }

  revBodyEl.innerHTML = rows.map(r => {
    const isEditing = editingId === r.id;

    const revCell = isEditing
      ? `<input class="in in-sm" data-fld="rev" value="${escapeHtml(r.rev)}" />`
      : `<span>${escapeHtml(r.rev)}</span>${r.is_current ? ' <span class="badge">current</span>' : ''}`;

    const specCell = isEditing
      ? `<input class="in in-sm" data-fld="spec" value="${escapeHtml(r.spec)}" />`
      : escapeHtml(r.spec);

    const dwgCell = isEditing
      ? `<input class="in in-sm" data-fld="drawing_file" value="${escapeHtml(r.drawing_file)}" />`
      : escapeHtml(r.drawing_file);

    const descCell = isEditing
      ? `<input class="in in-sm" data-fld="description" value="${escapeHtml(r.description)}" />`
      : escapeHtml(r.description);

    const actCell = isEditing
      ? `
        <button class="btn btn-sm" data-save="${r.id}">Save</button>
        <button class="btn ghost btn-sm" data-cancel="${r.id}">Cancel</button>
      `
      : `
        <button class="btn ghost btn-sm" data-edit="${r.id}">Edit</button>
        <button class="btn danger btn-sm" data-del="${r.id}">Delete</button>
        ${r.is_current ? '' : `<button class="btn ghost btn-sm" data-makecur="${r.id}">Make current</button>`}
      `;

    return `
      <tr data-id="${r.id}">
        <td>${revCell}</td>
        <td>${specCell}</td>
        <td>${dwgCell}</td>
        <td>${descCell}</td>
        <td style="text-align:right; white-space:nowrap">${actCell}</td>
      </tr>
    `;
  }).join('');
}

/* ---------------- Actions: Edit/Save/Cancel/Make current/Delete ---------------- */
function collectDraftFromRow(rootEl) {
  const get = (name) => rootEl.querySelector(`[data-fld="${name}"]`)?.value ?? '';
  return {
    rev: (get('rev') || '').toUpperCase().trim(),
    spec: (get('spec') || '').trim() || null,
    drawing_file: (get('drawing_file') || '').trim() || null,
    description: (get('description') || '').trim() || null,
  };
}

function startEdit(id) {
  const row = revisions.find(r => r.id === id);
  if (!row) return;
  editingId = id;
  draft = {
    rev: row.rev ?? '',
    spec: row.spec ?? '',
    drawing_file: row.drawing_file ?? '',
    description: row.description ?? '',
  };
  renderRevisions();
  // โฟกัสช่องแรก
  (revTableEl || revBodyEl)?.querySelector('[data-fld="rev"]')?.focus();
}

async function saveEdit(id, rowEl) {
  if (!Number.isFinite(id)) return;
  const data = collectDraftFromRow(rowEl);
  if (!data.rev) {
    toast('Enter Rev', false);
    rowEl.querySelector('[data-fld="rev"]')?.focus();
    return;
  }
  try {
    const upd = await jfetch(`/parts/revisions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    const idx = revisions.findIndex(r => r.id === id);
    if (idx >= 0) revisions[idx] = upd;
    editingId = null;
    draft = null;
    renderRevisions();
    toast('Revision updated');
  } catch (e) {
    toast(e?.message || 'Update revision failed', false);
  }
}

function cancelEdit() {
  editingId = null;
  draft = null;
  renderRevisions();
}

async function setRevisionCurrent(id) {
  try {
    await jfetch(`/parts/revisions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_current: true }),
    });
    await loadRevisions();
    toast('Set current');
  } catch (e) {
    toast(e?.message || 'Set current failed', false);
  }
}

async function addRevision() {
  if (!Number.isFinite(partId)) return;

  const revEl  = $('r_rev');
  const specEl = $('r_spec');
  const dwgEl  = $('r_dwg');
  const curEl  = $('r_current');  // checkbox

  if (!revEl) { toast('Missing #r_rev in HTML', false); return; }

  const rev = (revEl?.value ?? '').trim().toUpperCase();
  const spec = (specEl?.value ?? '').trim() || null;
  const drawing_file = (dwgEl?.value ?? '').trim() || null;
  const is_current = !!(curEl?.checked);

  if (!rev) { toast('Enter Rev', false); revEl.focus(); return; }

  const url = `/parts/${encodeURIComponent(partId)}/revisions`;
  try {
    await jfetch(url, {
      method: 'POST',
      body: JSON.stringify({ rev, spec, drawing_file, is_current }),
    });
    await loadRevisions();
    if (revEl) revEl.value = '';
    if (specEl) specEl.value = '';
    if (dwgEl) dwgEl.value = '';
    if (curEl) curEl.checked = false;
    revEl?.focus();
    toast('Revision Added');
  } catch (e) {
    toast(e?.message || 'Add revision failed', false);
  }
}

async function deleteRevision(id) {
  if (!confirm("Delete this revision?")) return;
  try {
    await jfetch(`/parts/revisions/${encodeURIComponent(id)}`, { method: 'DELETE' })
    // await jfetch(`/parts/revisions/${encodeURIComponent(id)}`, { method: "DELETE" });
    revisions = revisions.filter((x) => x.id !== id);
    renderRevisions();
    toast("Revision deleted");
  } catch (e) {
    toast(e?.message || "Delete revision failed", false);
  }
}

// เดเลเกตปุ่มสำหรับ TableX (ปุ่มทั้งหมดอยู่คอลัมน์ Action)
revTableEl?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-edit],button[data-del],button[data-makecur],button[data-save],button[data-cancel]');
  if (!btn) return;
  const id = Number(btn.dataset.edit || btn.dataset.del || btn.dataset.makecur || btn.dataset.save || btn.dataset.cancel);
  if (!id) return;

  if (btn.dataset.edit) startEdit(id);
  if (btn.dataset.del) deleteRevision(id);
  if (btn.dataset.makecur) setRevisionCurrent(id);
  if (btn.dataset.save) {
    // ใน TableX เราจะหา container ใกล้ ๆ ที่มี inputs ของแถวนั้น
    const rowEl = btn.closest('[data-row-id]') || revTableEl;
    saveEdit(id, rowEl);
  }
  if (btn.dataset.cancel) cancelEdit();
});

// เดเลเกตปุ่ม fallback <tbody> (ปุ่มทั้งหมดอยู่คอลัมน์ Action)
revBodyEl?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-edit],button[data-del],button[data-makecur],button[data-save],button[data-cancel]');
  if (!btn) return;
  const id = Number(btn.dataset.edit || btn.dataset.del || btn.dataset.makecur || btn.dataset.save || btn.dataset.cancel);
  if (!id) return;

  if (btn.dataset.edit) startEdit(id);
  if (btn.dataset.del) deleteRevision(id);
  if (btn.dataset.makecur) setRevisionCurrent(id);
  if (btn.dataset.save) {
    const rowEl = btn.closest('tr') || revBodyEl;
    saveEdit(id, rowEl);
  }
  if (btn.dataset.cancel) cancelEdit();
});

/* ---------------- Suggest revs ---------------- */
function initRevSuggestForCurrentPart(pid) {
  const input = document.getElementById('r_rev');
  if (!input || !pid) return;

  let dl = document.getElementById('revOptionsSuggest');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'revOptionsSuggest';
    document.body.appendChild(dl);
  }
  input.setAttribute('list', 'revOptionsSuggest');

  jfetch(`/parts/${encodeURIComponent(pid)}/revisions`)
    .then(rows => Array.isArray(rows) ? rows : [])
    .then(rows => {
      const list = rows
        .map(r => (r.rev || '').toUpperCase())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      dl.innerHTML = list.map(rv => `<option value="${rv}"></option>`).join('');
    })
    .catch(() => { dl.innerHTML = ''; });

  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });
}

async function loadRevisions() {
  if (!Number.isFinite(partId)) return;
  try {
    const rows = await jfetch(`/parts/${encodeURIComponent(partId)}/revisions`);
    revisions = Array.isArray(rows) ? rows : [];
  } catch (e) {
    revisions = [];
    toast(e?.message || 'Load revisions failed', false);
  }
  renderRevisions();
}

/* ---------------- boot ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  const idRaw = new URLSearchParams(location.search).get('id');
  const pid = Number(idRaw);
  if (!Number.isFinite(pid) || pid <= 0) {
    toast("Missing part id", false);
    return;  // ไม่มี id → ไม่ยิง API ใด ๆ
  }
  partId = pid;

  initRevSuggestForCurrentPart(partId);

  $("btnHeaderEdit")?.addEventListener("click", () => {
    headerOpen ? hideHeaderEditor() : showHeaderEditor();
  });
  $("btnSavePart")?.addEventListener("click", savePart);
  $("btnResetPart")?.addEventListener("click", resetPart);
  $("btnDeletePart")?.addEventListener("click", deletePart);

  $("r_add")?.addEventListener("click", addRevision);

  loadPart().then(loadRevisions);
});

// (optional) สำหรับเรียกจากที่อื่น
function editRevision(id) { startEdit(id); }
