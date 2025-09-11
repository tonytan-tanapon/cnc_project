// /static/js/page-part-detail.js  (TableX + guards)
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

/* ---------------- Revisions (TableX ถ้ามี rev_table) ---------------- */
let revisions = [];
const revTableEl = $("rev_table");   // ถ้ามี div id="rev_table" จะใช้ TableX
const revBodyEl  = $("revBody");     // ถ้ายังใช้ <tbody id="revBody"> เดิม จะ fallback

function renderRevisions() {
  // 1) ถ้ามี container สำหรับ TableX → ใช้ TableX
  if (revTableEl) {
    const rows = revisions.map(r => ({
      id: r.id,
      rev: r.rev ?? "",
      description: r.description ?? "",
    }));

    renderTableX(revTableEl, rows, {
      rowStart: 0,
      getRowId: r => r.id,
      columns: [
        { key: '__no',       title: 'No.',         width: '64px', align: 'right' },
        { key: 'rev',        title: 'Rev',         width: '120px' },
        { key: 'description',title: 'Description', grow: 1, render: r => escapeHtml(r.description) },
        { key: '__act',      title: '',            width: '180px', align: 'right',
          render: r => `
            <button class="btn-small" data-edit="${r.id}">Edit</button>
            <button class="btn-small" data-del="${r.id}">Delete</button>
          `
        },
      ],
      emptyText: 'No revisions',
    });
    return;
  }

  // 2) ไม่มีก็ fallback เป็นตารางเดิม
  if (!revBodyEl) return;
  if (!revisions.length) {
    revBodyEl.innerHTML = `<tr><td colspan="3" class="empty">No revisions</td></tr>`;
    return;
  }
  revBodyEl.innerHTML = revisions.map(r => `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.rev ?? "")}</td>
      <td>${escapeHtml(r.description ?? "")}</td>
      <td style="text-align:right; white-space:nowrap">
        <button class="btn ghost btn-sm" data-edit="${r.id}">Edit</button>
        <button class="btn danger btn-sm" data-del="${r.id}">Delete</button>
      </td>
    </tr>
  `).join("");
}

// เดเลเกตปุ่มแก้/ลบ เมื่อใช้ TableX
revTableEl?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-edit],button[data-del],button[data-makecur]');
  if (!btn) return;
  const id = Number(btn.dataset.edit || btn.dataset.del || btn.dataset.makecur);
  if (!id) return;
  if (btn.dataset.edit) editRevision(id);
  if (btn.dataset.del) deleteRevision(id);
  if (btn.dataset.makecur) setRevisionCurrent(id);
});


// เดเลเกตปุ่มแก้/ลบ สำหรับ fallback table
revBodyEl?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-edit],button[data-del],button[data-makecur]');
  if (!btn) return;
  const id = Number(btn.dataset.edit || btn.dataset.del || btn.dataset.makecur);
  if (!id) return;
  if (btn.dataset.edit) editRevision(id);
  if (btn.dataset.del) deleteRevision(id);
  if (btn.dataset.makecur) setRevisionCurrent(id);
});
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

async function loadRevisions() {
  if (!Number.isFinite(partId)) return;
  try {
    const rows = await jfetch(`/parts/${encodeURIComponent(partId)}/revisions`);
    revisions = Array.isArray(rows) ? rows : [];
    renderRevisions();
  } catch (e) {
    revisions = [];
    renderRevisions();
    toast(e?.message || "Load revisions failed", false);
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
    await jfetch(`/parts/revisions/${encodeURIComponent(id)}`, { method: "DELETE" });
    revisions = revisions.filter((x) => x.id !== id);
    renderRevisions();
    toast("Revision deleted");
  } catch (e) {
    toast(e?.message || "Delete revision failed", false);
  }
}

async function editRevision(id) {
  const row = revisions.find(r => r.id === id);
  if (!row) return;
  const newRev = prompt('Rev', row.rev ?? '')?.trim().toUpperCase();
  if (newRev == null) return;
  const newSpec = prompt('Spec', row.spec ?? '')?.trim();
  if (newSpec == null) return;
  const newDwg = prompt('Drawing File', row.drawing_file ?? '')?.trim();
  if (newDwg == null) return;

  try {
    const upd = await jfetch(`/parts/revisions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ rev: newRev, spec: newSpec, drawing_file: newDwg }),
    });
    const idx = revisions.findIndex(r => r.id === id);
    if (idx >= 0) revisions[idx] = upd;
    renderRevisions();
    toast('Revision updated');
  } catch (e) {
    toast(e?.message || 'Update revision failed', false);
  }
}

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
