// /static/js/page-part-detail.js
import { $, jfetch, showToast as toast } from "/static/js/api.js";

const qs = new URLSearchParams(location.search);
const partId = qs.get("id");

let original = null;
let headerOpen = false;

const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function setBusyHead(b) {
  ["btnSavePart", "btnResetPart", "btnDeletePart"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = b;
  });
  $("hintPart").textContent = b ? "Working…" : "";
}

function fillHeader(p) {
  $("part_no").value = p.part_no ?? "";
  $("part_name").value = p.name ?? "";
  $("part_desc").value = p.description ?? "";
  $("part_uom").value = p.default_uom ?? "";
  $("part_status").value = p.status ?? "active";
  $("subTitle").textContent = `#${p.id} — ${p.part_no ?? ""}`;
}

function readHeader() {
  const v = (x) => (x ?? "").trim();
  return {
    part_no: v($("part_no").value).toUpperCase() || null,
    name: v($("part_name").value) || null,
    description: v($("part_desc").value) || null,
    default_uom: v($("part_uom").value) || null,
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
  if (!partId) {
    toast("Missing ?id=", false);
    return;
  }
  setBusyHead(true);
  try {
    const p = await jfetch(`/parts/${encodeURIComponent(partId)}`);
    original = p;
    fillHeader(p);
    document.title = `Part · ${p.part_no ?? p.id}`;
  } catch (e) {
    toast(e.message || "Load failed", false);
  } finally {
    setBusyHead(false);
  }
}

async function savePart() {
  const payload = readHeader();
  setBusyHead(true);
  try {
    const updated = await jfetch(`/parts/${encodeURIComponent(partId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    original = updated;
    fillHeader(updated);
    toast("Saved");
    hideHeaderEditor();
  } catch (e) {
    toast(e.message || "Save failed", false);
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
  if (!confirm("ลบ Part นี้?")) return;
  setBusyHead(true);
  try {
    await jfetch(`/parts/${encodeURIComponent(partId)}`, { method: "DELETE" });
    toast("Deleted");
    location.href = "/static/parts.html";
  } catch (e) {
    toast(e.message || "Delete failed", false);
  } finally {
    setBusyHead(false);
  }
}

/* ---------------- Revisions ---------------- */
let revisions = [];

function renderRevisions() {
  const tb = $("revBody");
  if (!revisions.length) {
    tb.innerHTML = `<tr><td colspan="5" class="empty">No revisions</td></tr>`;
    return;
  }
  tb.innerHTML = revisions
    .map((r) => {
      const cur = r.is_current ? `<span class="badge">current</span>` : "";
      return `
        <tr data-id="${r.id}">
          <td>${escapeHtml(r.rev ?? "")}</td>
          <td>${cur}</td>
          <td>${escapeHtml(r.drawing_file ?? "")}</td>
          <td>${escapeHtml(r.spec ?? "")}</td>
          <td style="text-align:right; white-space:nowrap">
            <button class="btn ghost btn-sm" data-makecur="${r.id}">Set Current</button>
            <button class="btn danger btn-sm" data-del="${r.id}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tb.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => deleteRevision(+b.dataset.del))
  );
  tb.querySelectorAll("[data-makecur]").forEach((b) =>
    b.addEventListener("click", () => setRevisionCurrent(+b.dataset.makecur))
  );
}

async function loadRevisions() {
  try {
    const rows = await jfetch(`/part-revisions?part_id=${encodeURIComponent(partId)}`);
    // คาดว่า backend คืน array ของ revision (id, part_id, rev, is_current, drawing_file, spec)
    revisions = Array.isArray(rows) ? rows : [];
    renderRevisions();
  } catch (e) {
    revisions = [];
    renderRevisions();
    toast(e.message || "Load revisions failed", false);
  }
}

async function addRevision() {
  const payload = {
    part_id: Number(partId),
    rev: ($("r_rev").value ?? "").trim().toUpperCase(),
    drawing_file: ($("r_dwg").value ?? "").trim() || null,
    spec: ($("r_spec").value ?? "").trim() || null,
    is_current: (($("r_current").value || "false") === "true"),
  };
  if (!payload.rev) {
    toast("Enter Rev", false);
    return;
  }
  try {
    const created = await jfetch(`/part-revisions`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    // เติมเข้า list แล้วค่อย refresh (กันกรณี backend ไม่ส่งครบ)
    revisions.unshift(created);
    await loadRevisions();
    ["r_rev","r_dwg","r_spec"].forEach(id => { const el = $(id); if (el) el.value = ""; });
    $("r_current").value = "false";
    toast("Revision Added");
  } catch (e) {
    toast(e.message || "Add revision failed", false);
  }
}

async function deleteRevision(id) {
  if (!confirm("Delete this revision?")) return;
  try {
    await jfetch(`/part-revisions/${encodeURIComponent(id)}`, { method: "DELETE" });
    revisions = revisions.filter((x) => x.id !== id);
    renderRevisions();
    toast("Revision deleted");
  } catch (e) {
    toast(e.message || "Delete revision failed", false);
  }
}

async function setRevisionCurrent(id) {
  // ถ้า backend มี PUT /part-revisions/{id} ให้ส่ง is_current=true
  try {
    const upd = await jfetch(`/part-revisions/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ is_current: true }),
    });
    // รีโหลดรายการเพื่อสะท้อน current ตัวใหม่ (และเคลียร์ตัวเก่า)
    await loadRevisions();
    toast("Set current");
  } catch (e) {
    // ถ้าไม่มี PUT endpoint: fall back call เฉพาะ endpoint set-current ถ้ามี
    toast(e.message || "Set current failed", false);
  }
}

// เพิ่ม Suggest ให้ #r_rev จากของเดิมของ part นี้
function initRevSuggestForCurrentPart(partId) {
  const input = document.getElementById('r_rev');
  if (!input || !partId) return;

  // สร้าง datalist ถ้ายังไม่มี
  let dl = document.getElementById('revOptionsSuggest');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'revOptionsSuggest';
    document.body.appendChild(dl);
  }
  input.setAttribute('list', 'revOptionsSuggest');

  // โหลดรายการ Rev ของ part นี้มาเป็นตัวช่วย
  jfetch(`/part-revisions?part_id=${encodeURIComponent(partId)}`)
    .then(rows => Array.isArray(rows) ? rows : [])
    .then(rows => {
      // A..Z
      const list = rows
        .map(r => (r.rev || '').toUpperCase())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

      dl.innerHTML = list.map(rv => `<option value="${rv}"></option>`).join('');
    })
    .catch(() => { dl.innerHTML = ''; });

  // force upper-case เมื่อพิมพ์
  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });
}

/* ---------------- boot ---------------- */
document.addEventListener("DOMContentLoaded", () => {
    const qs = new URLSearchParams(location.search);
  const partId = Number(qs.get('id'));
  if (Number.isFinite(partId)) {
    initRevSuggestForCurrentPart(partId);
  }


  $("btnHeaderEdit")?.addEventListener("click", () => {
    headerOpen ? hideHeaderEditor() : showHeaderEditor();
  });
  $("btnSavePart")?.addEventListener("click", savePart);
  $("btnResetPart")?.addEventListener("click", resetPart);
  $("btnDeletePart")?.addEventListener("click", deletePart);

  $("r_add")?.addEventListener("click", addRevision);

  // load
  loadPart().then(loadRevisions);
});
