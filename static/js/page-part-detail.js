// /static/js/page-part-detail.js — POS-edge layout + Tabulator
// - Separate "Current" and "Delete" columns
// - "+ Add Revision" creates next Rev and marks it current
import { $, jfetch, showToast as toast } from "/static/js/api.js";

let partId = null;
let originalPart = null;

/* ---------- small utils ---------- */
const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const byId = (id) => document.getElementById(id);
const setText = (id, txt) => {
  const el = byId(id);
  if (el) el.textContent = txt;
};

function setHint(b) {
  setText("part_hint", b ? "Working…" : "");
}
function setError(msg) {
  const el = byId("part_error");
  if (!el) return;
  el.style.display = msg ? "" : "none";
  el.textContent = msg || "";
}

/* ---------- header (inputs) ---------- */
function fillHeader(p) {
  byId("part_no").value = p.part_no ?? "";
  byId("part_name").value = p.name ?? "";
  byId("part_desc").value = p.description ?? "";
  byId("part_uom").value = p.uom ?? "";
  byId("part_status").value = p.status ?? "active";
  byId("part_created").textContent = p.created_at
    ? new Date(p.created_at).toLocaleString()
    : "—";

  setText("part_subTitle", `#${p.id} — ${p.part_no ?? ""}`);
  document.title = `Part · ${p.part_no ?? p.id}`;
}

function readHeader() {
  const val = (id) => (byId(id)?.value ?? "").trim();
  return {
    part_no: val("part_no").toUpperCase() || null,
    name: val("part_name") || null,
    description: val("part_desc") || null,
    uom: val("part_uom") || null,
    status: val("part_status") || "active",
  };
}

let hdrSaveBtn = null,
  hdrResetBtn = null;
function ensureHeaderButtons() {
  const bar = document.querySelector("#partPanel > div"); // title row
  if (!bar || byId("hdr-actions")) return;

  const wrap = document.createElement("div");
  wrap.id = "hdr-actions";
  wrap.className = "hdr-actions";
  wrap.style.marginLeft = "auto";

  hdrSaveBtn = document.createElement("button");
  hdrSaveBtn.className = "btn-mini btn-primary";
  hdrSaveBtn.textContent = "Save";
  hdrSaveBtn.style.display = "none";
  hdrSaveBtn.addEventListener("click", savePart);

  hdrResetBtn = document.createElement("button");
  hdrResetBtn.className = "btn-mini";
  hdrResetBtn.textContent = "Reset";
  hdrResetBtn.style.display = "none";
  hdrResetBtn.addEventListener("click", () => {
    if (originalPart) {
      fillHeader(originalPart);
      markHeaderDirty(false);
    }
  });

  wrap.appendChild(hdrSaveBtn);
  wrap.appendChild(hdrResetBtn);
  bar.appendChild(wrap);
}
function markHeaderDirty(on) {
  if (hdrSaveBtn) hdrSaveBtn.style.display = on ? "" : "none";
  if (hdrResetBtn) hdrResetBtn.style.display = on ? "" : "none";
}
function wireHeaderDirty() {
  ["part_no", "part_name", "part_desc", "part_uom", "part_status"].forEach(
    (id) => {
      const el = byId(id);
      if (!el) return;
      el.addEventListener("input", () => markHeaderDirty(true));
      el.addEventListener("change", () => markHeaderDirty(true));
    }
  );
}

/* ---------- part load/save ---------- */
async function loadPart() {
  if (!Number.isFinite(partId)) return;
  setHint(true);
  try {
    const p = await jfetch(`/parts/${encodeURIComponent(partId)}`);
    originalPart = p;
    fillHeader(p);
    markHeaderDirty(false);
  } catch (e) {
    setError(e?.message || "Load failed");
  } finally {
    setHint(false);
  }
}

async function savePart() {
  if (!Number.isFinite(partId)) return;
  setHint(true);
  try {
    const payload = readHeader();
    const upd = await jfetch(`/parts/${encodeURIComponent(partId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    originalPart = upd;
    fillHeader(upd);
    markHeaderDirty(false);
    toast("Saved");
  } catch (e) {
    toast(e?.message || "Save failed", false);
  } finally {
    setHint(false);
  }
}

/* ---------- Revisions (Tabulator) ---------- */
let revTable = null;
let revRows = [];

function initRevTable() {
  const el = byId("rev_table");
  if (!el) return;

  /* global Tabulator */
  revTable = new Tabulator(el, {
    layout: "fitColumns",
    height: "100%",
    index: "id",
    placeholder: "No revisions",
    reactiveData: true,
    columns: [
   
      {
        title: "Rev",
        field: "rev",
        width: 140,
        editor: "input",
        formatter: (c) => {
          const v = String(c.getValue() ?? "");
          return esc(v);
        },
        cellEdited: (cell) => {
          const row = cell.getRow().getData();
          const val = String(cell.getValue() ?? "")
            .toUpperCase()
            .trim();
          cell.setValue(val, true); // force uppercase in UI
          patchRevision(row.id, { rev: val });
        },
      },
      {
        title: "Spec",
        field: "spec",
        width: 220,
        editor: "input",
        cellEdited: (cell) => {
          const row = cell.getRow().getData();
          patchRevision(row.id, {
            spec: String(cell.getValue() ?? "").trim() || null,
          });
        },
      },
      {
        title: "Drawing",
        field: "drawing_file",
        width: 220,
        editor: "input",
        cellEdited: (cell) => {
          const row = cell.getRow().getData();
          patchRevision(row.id, {
            drawing_file: String(cell.getValue() ?? "").trim() || null,
          });
        },
      },
      {
        title: "Description",
        field: "description",
        editor: "input",
        cellEdited: (cell) => {
          const row = cell.getRow().getData();
          patchRevision(row.id, {
            description: String(cell.getValue() ?? "").trim() || null,
          });
        },
      },

      /* === NEW: separate "Current" column === */
      {
        title: "Current",
        field: "_current",
        width: 140,
        headerSort: false,
        formatter: (cell) => {
          const d = cell.getRow().getData();
          return d.is_current
            ? `<span class="badge">current</span>`
            : `<button class="btn-mini" data-act="makecur">Make current</button>`;
        },
        cellClick: (e, cell) => {
          const btn = e.target.closest('button[data-act="makecur"]');
          if (!btn) return;
          const id = cell.getRow().getData().id;
          setRevisionCurrent(id);
        },
      },

      /* === NEW: separate "Delete" column === */
      {
        title: "Delete",
        field: "_del",
        width: 120,
        headerSort: false,
        formatter: () =>
          `<button class="btn-mini btn-danger" data-act="del">Delete</button>`,
        cellClick: (e, cell) => {
          const btn = e.target.closest('button[data-act="del"]');
          if (!btn) return;
          const id = cell.getRow().getData().id;
          deleteRevision(id);
        },
      },
    ],
  });
}

async function loadRevisions() {
  if (!Number.isFinite(partId)) return;
  try {
    const rows = await jfetch(`/parts/${encodeURIComponent(partId)}/revisions`);
    revRows = Array.isArray(rows) ? rows : [];
    revTable?.setData(revRows);
  } catch (e) {
    revRows = [];
    revTable?.setData([]);
    toast(e?.message || "Load revisions failed", false);
  }
}

async function patchRevision(id, payload) {
  try {
    const upd = await jfetch(`/parts/revisions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const idx = revRows.findIndex((r) => r.id === id);
    if (idx >= 0) revRows[idx] = upd;
    revTable?.getRow(id)?.update(upd);
    toast("Updated");
  } catch (e) {
    toast(e?.message || "Update failed", false);
    await loadRevisions();
  }
}

async function setRevisionCurrent(id) {
  try {
    await jfetch(`/parts/revisions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ is_current: true }),
    });
    await loadRevisions(); // refresh so only one shows current
    toast("Set current");
  } catch (e) {
    toast(e?.message || "Set current failed", false);
  }
}

async function deleteRevision(id) {
  if (!confirm("Delete this revision?")) return;
  try {
    await jfetch(`/parts/revisions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    revRows = revRows.filter((x) => x.id !== id);
    revTable?.setData(revRows);
    toast("Revision deleted");
  } catch (e) {
    toast(e?.message || "Delete revision failed", false);
  }
}

/* ---------- Add Revision (auto next A→B→C… and mark current) ---------- */
function alphaToNum(s) {
  let n = 0;
  for (const ch of s) {
    const x = ch.charCodeAt(0);
    if (x < 65 || x > 90) return NaN; // non A-Z
    n = n * 26 + (x - 64);
  }
  return n;
}
function numToAlpha(n) {
  if (!Number.isFinite(n) || n <= 0) return "A";
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function suggestNextRev() {
  const letters = (revRows || [])
    .map((r) =>
      String(r.rev || "")
        .trim()
        .toUpperCase()
    )
    .filter((rv) => rv && /^[A-Z]+$/.test(rv));
  if (!letters.length) return "A";
  let maxN = 0;
  for (const rv of letters) {
    const n = alphaToNum(rv);
    if (Number.isFinite(n) && n > maxN) maxN = n;
  }
  return numToAlpha(maxN + 1);
}

async function addRevision() {
  if (!Number.isFinite(partId)) return;
  const next = suggestNextRev();
  try {
    // NEW: create as current = true
    await jfetch(`/parts/${encodeURIComponent(partId)}/revisions`, {
      method: "POST",
      body: JSON.stringify({
        rev: next,
        spec: null,
        drawing_file: null,
        is_current: true, // 👈 make the new one current
      }),
    });
    await loadRevisions();
    // focus/scroll to the new current row
    const row = revTable
      ?.getRows()
      .find((r) => (r.getData()?.rev || "").toUpperCase() === next);
    if (row) revTable.scrollToRow(row);
    toast(`Revision ${next} added & set current`);
  } catch (e) {
    toast(e?.message || "Add revision failed", false);
  }
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  const raw = new URLSearchParams(location.search).get("id");
  const pid = Number(raw);
  if (!Number.isFinite(pid) || pid <= 0) {
    setError("Missing part id");
    return;
  }
  partId = pid;

  ensureHeaderButtons();
  wireHeaderDirty();
  initRevTable();

  byId("btnAddRev")?.addEventListener("click", addRevision);

  await loadPart();
  await loadRevisions();
});
