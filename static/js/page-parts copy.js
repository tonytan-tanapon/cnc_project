// /static/js/page-part.js
import { jfetch, renderTable, showToast as toast } from "/static/js/api.js?v=4";

const $ = (id) => document.getElementById(id);
const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

/* =========================
   Global state (pagination)
========================= */
const state = {
  page: 1,
  perPage: 20,
  pages: 1,
  total: 0,
  q: "",
};

/* =========================
   Config & helpers (UI)
========================= */
const DETAIL_PAGE = "/static/part-detail.html";
const partUrl = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;

const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

// inject styles (rev highlight + pager)
function ensureStyles() {
  if (!document.getElementById("rev-cell-style")) {
    const style = document.createElement("style");
    style.id = "rev-cell-style";
    style.textContent = `
      .rev-cell { white-space: nowrap }
      .rev-current {
        padding: 2px 6px;
        border: 1px solid #0ea5e9;
        border-radius: 999px;
        box-shadow: 0 0 0 2px rgba(14,165,233,.15) inset;
        color: #0b6ea6;
        font-weight: 600;
      }

      .pager { display:flex; align-items:center; gap:8px; justify-content:flex-end; margin-top:8px; flex-wrap:wrap }
      .pager .btn { min-height:32px }
      .pager .btn[disabled] { opacity:.5; cursor:not-allowed }
      .pager .count { color:#64748b; margin-left:8px }
      .pager .spacer { flex:1 }
      .pager select { padding:4px 8px; border:1px solid #e2e8f0; border-radius:8px; }
      .pager .btn.page { padding:4px 10px }
      .pager .btn.page.active,
      .pager .btn.page[aria-current="page"] {
        background:#0ea5e9; color:#fff; border-color:#0ea5e9;
      }
      .pager .dots { padding:0 6px; color:#94a3b8; user-select:none }
    `;
    document.head.appendChild(style);
  }
}
ensureStyles();

/* =========================
   Revisions cache & fetch
========================= */
const revCacheDetail = new Map(); // part_id -> [{rev, is_current}]

async function getRevisions(partId) {
  if (revCacheDetail.has(partId)) return revCacheDetail.get(partId);
  const rows = await jfetch(`/part-revisions?part_id=${encodeURIComponent(partId)}`);
  const list = Array.isArray(rows) ? rows : [];
  const normalized = list
    .map((r) => ({ rev: String(r.rev || "").toUpperCase(), is_current: !!r.is_current }))
    .filter((x) => x.rev)
    .sort((a, b) => a.rev.localeCompare(b.rev, undefined, { sensitivity: "base" }));
  revCacheDetail.set(partId, normalized);
  return normalized;
}

/* =========================
   Parts list renderer
========================= */
function linkifyPartNoCells(holder, rows) {
  const table = holder.querySelector("table");
  if (!table) return;

  const ths = [...table.querySelectorAll("thead th")];
  const pnIdx = ths.findIndex((th) => {
    const t = (th.textContent || th.innerText || "").trim().toLowerCase();
    return t === "part_no" || t === "part no" || t === "partno";
  });
  if (pnIdx < 0) return;

  const trs = table.querySelectorAll("tbody tr");
  trs.forEach((tr, i) => {
    const row = rows[i];
    if (!row || row.id == null) return;
    const td = tr.children[pnIdx];
    if (!td) return;
    const label = (td.textContent || row.part_no || `#${row.id}`).trim();
    td.innerHTML = `<a class="pn-link" href="${partUrl(row.id)}">${escapeHtml(label)}</a>`;
  });
}

function fillRevColumn(holder, rows) {
  const table = holder.querySelector("table");
  if (!table) return;

  const ths = [...table.querySelectorAll("thead th")];
  const findIdx = (label) =>
    ths.findIndex((th) => (th.textContent || th.innerText || "").trim().toLowerCase() === label);

  const revIdx = findIdx("rev");
  if (revIdx < 0) return;

  const trs = [...table.querySelectorAll("tbody tr")];
  const token = String(Date.now());
  holder.dataset.revFillToken = token;

  trs.forEach((tr, i) => {
    const row = rows[i];
    if (!row || row.id == null) return;
    const td = tr.children[revIdx];
    if (!td) return;
    td.classList.add("rev-cell");
    td.textContent = "…";

    getRevisions(row.id)
      .then((list) => {
        if (holder.dataset.revFillToken !== token) return;

        if (!list.length) {
          td.textContent = "-";
          return;
        }

        const html = list
          .map(({ rev, is_current }) =>
            is_current
              ? `<span class="rev-current">${escapeHtml(rev)}</span>`
              : escapeHtml(rev)
          )
          .join(", ");
        td.innerHTML = html;
      })
      .catch(() => {
        if (holder.dataset.revFillToken !== token) return;
        td.textContent = "-";
      });
  });
}

function renderPartsTable(holder, rows, baseIndex = 0) {
  const data = (rows || []).map((r, i) => ({
    No: baseIndex + i + 1,
    part_no: r.part_no ?? "",
    name: r.name ?? "",
    Rev: "",
    description: r.description ?? "",
    default_uom: r.default_uom ?? "",
    status: r.status ?? "",
  }));

  renderTable(holder, data);

  const table = holder.querySelector("table");
  if (table) {
    const ths = [...table.querySelectorAll("thead th")];
    const noIdx = ths.findIndex((th) => (th.textContent || "").trim().toLowerCase() === "no");
    if (noIdx >= 0) {
      ths[noIdx].style.width = "56px";
      table.querySelectorAll("tbody tr").forEach((tr) => {
        const td = tr.children[noIdx];
        if (td) td.style.textAlign = "left"; // ชิดซ้าย
      });
    }
  }

  linkifyPartNoCells(holder, rows);
  fillRevColumn(holder, rows);
}

/* =========================
   Pager UI (First/Prev/1..N/Next/Last + …)
========================= */
function ensurePagerContainer() {
  let el = $("p_pager");
  if (el) return el;
  const tableHolder = $("p_table");
  el = document.createElement("div");
  el.id = "p_pager";
  el.className = "pager";
  tableHolder?.parentNode?.insertBefore(el, tableHolder.nextSibling);
  return el;
}

// สร้างรายการเลขหน้าแบบมี boundaries/siblings + dots
function buildPageItems(page, pages, boundaries = 1, siblings = 1) {
  const items = [];
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  const start = range(1, Math.min(boundaries, pages));
  const end = range(Math.max(pages - boundaries + 1, boundaries + 1), pages);

  const low = Math.max(page - siblings, boundaries + 1);
  const high = Math.min(page + siblings, pages - boundaries);

  items.push(...start);

  if (low > boundaries + 1) items.push("dots");
  items.push(...range(low, Math.max(low, high)));
  if (high < pages - boundaries) items.push("dots");

  end.forEach((p) => {
    if (!items.includes(p)) items.push(p);
  });

  // ลบหมายเลขที่เกินจริง
  return items.filter((x) => x === "dots" || (x >= 1 && x <= pages));
}

function renderPager() {
  const pager = ensurePagerContainer();
  const { page, pages, total, perPage } = state;

  const items = buildPageItems(page, pages, 1, 1); // boundaries=1, siblings=1

  // ปุ่มเลขหน้า
  const pagesHtml = items
    .map((it) => {
      if (it === "dots") return `<span class="dots">…</span>`;
      const active = it === page ? ' aria-current="page" class="btn page active"' : ' class="btn page"';
      return `<button${active} data-page="${it}" type="button">${it}</button>`;
    })
    .join("");

  pager.innerHTML = `
    <div class="spacer"></div>
    <label>Per page</label>
    <select id="pp_select">
      ${[10,20,50,100].map(n => `<option value="${n}" ${n===perPage?'selected':''}>${n}</option>`).join("")}
    </select>

    <button class="btn ghost" id="btnFirst" ${page<=1?'disabled':''}>« First</button>
    <button class="btn ghost" id="btnPrev" ${page<=1?'disabled':''}>‹ Prev</button>

    ${pagesHtml}

    <button class="btn ghost" id="btnNext" ${page>=pages?'disabled':''}>Next ›</button>
    <button class="btn ghost" id="btnLast" ${page>=pages?'disabled':''}>Last »</button>

    <span class="count">Page ${page} / ${pages} · Total ${total}</span>
  `;

  // events
  $("#pp_select")?.addEventListener("change", (e) => {
    state.perPage = Number(e.target.value) || 20;
    state.page = 1;
    loadParts();
  });

  $("#btnFirst")?.addEventListener("click", () => {
    if (state.page > 1) { state.page = 1; loadParts(); }
  });
  $("#btnPrev")?.addEventListener("click", () => {
    if (state.page > 1) { state.page -= 1; loadParts(); }
  });
  $("#btnNext")?.addEventListener("click", () => {
    if (state.page < state.pages) { state.page += 1; loadParts(); }
  });
  $("#btnLast")?.addEventListener("click", () => {
    if (state.page < state.pages) { state.page = state.pages; loadParts(); }
  });

  // เลขหน้า
  pager.querySelectorAll("button[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = Number(btn.dataset.page);
      if (!Number.isFinite(p)) return;
      if (p !== state.page) {
        state.page = p;
        loadParts();
      }
    });
  });
}

/* =========================
   Parts (load/create)
========================= */
async function loadParts() {
  const holder = $("p_table");
  try {
    const q = $("p_q")?.value?.trim() || "";
    state.q = q;

    const params = new URLSearchParams();
    params.set("page", String(state.page));
    params.set("per_page", String(state.perPage));
    if (q) params.set("q", q);

    const resp = await jfetch("/parts?" + params.toString());

    // รองรับทั้งรูปแบบใหม่ (page object) และเก่า (array)
    let rows, meta;
    if (Array.isArray(resp)) {
      rows = resp;
      meta = { total: rows.length, page: 1, per_page: rows.length || state.perPage, pages: 1 };
    } else {
      rows = resp.items || [];
      meta = {
        total: resp.total ?? rows.length,
        page: resp.page ?? state.page,
        per_page: resp.per_page ?? state.perPage,
        pages: resp.pages ?? 1,
      };
    }

    state.total = meta.total;
    state.pages = meta.pages || 1;
    state.page = Math.min(Math.max(meta.page || 1, 1), state.pages);
    state.perPage = meta.per_page || state.perPage;

    if (state.page > state.pages && state.pages >= 1) {
      state.page = state.pages;
      await loadParts();
      return;
    }

    const baseIndex = (state.page - 1) * state.perPage;
    renderPartsTable(holder, rows, baseIndex);
    renderPager();
  } catch (e) {
    holder.innerHTML = `<div class="hint">${escapeHtml(e.message)}</div>`;
    toast("โหลด Parts ไม่สำเร็จ: " + e.message, false);
  }
}

async function createPart() {
  // ปล่อยว่างได้ -> backend autogen
  const userPN = strOrNull($("p_no")?.value);
  const payload = {
    part_no: userPN ? userPN.toUpperCase() : null,
    name: strOrNull($("p_name")?.value),
    description: strOrNull($("p_desc")?.value),
    default_uom: strOrNull($("p_uom")?.value) || "ea",
    status: $("p_status")?.value || "active",
  };

  try {
    const created = await jfetch("/parts", { method: "POST", body: JSON.stringify(payload) });
    toast("สร้าง Part สำเร็จ");
    if (created?.id) {
      // กลับไปหน้าแรกเพื่อให้เห็นรายการใหม่ หรือจะ jump ไป detail ก็ได้
      location.href = partUrl(created.id);
      return;
    }
    ["p_no", "p_name", "p_desc", "p_uom"].forEach((id) => { const el = $(id); if (el) el.value = ""; });
    if ($("p_status")) $("p_status").value = "active";
    state.page = 1;
    await loadParts();
  } catch (e) {
    toast("สร้าง Part ไม่สำเร็จ: " + e.message, false);
  }
}

/* =========================
   (optional) Part Revisions panel
========================= */
async function loadRevisions() {
  const pid = $("r_list_pid")?.value?.trim() || $("r_part_id")?.value?.trim();
  const holder = $("r_table");
  if (!holder) return;
  if (!pid) {
    holder.innerHTML = `<div class="hint">ใส่ Part ID ก่อน</div>`;
    return;
  }
  try {
    const rows = await jfetch(`/part-revisions?part_id=${encodeURIComponent(pid)}`);
    renderTable(holder, rows);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${escapeHtml(e.message)}</div>`;
    toast("โหลด Revisions ไม่สำเร็จ: " + e.message, false);
  }
}

async function createRevision() {
  const elPartId = $("r_part_id");
  if (!elPartId) return;

  const payload = {
    part_id: numOrNull(elPartId.value),
    rev: (strOrNull($("r_rev")?.value) || "").toUpperCase(),
    drawing_file: strOrNull($("r_dwg")?.value),
    spec: strOrNull($("r_spec")?.value),
    is_current: ($("r_current")?.value || "false") === "true",
  };

  if (!payload.part_id || !payload.rev) {
    toast("ต้องกรอก Part ID และ Rev", false);
    return;
  }

  try {
    await jfetch("/part-revisions", { method: "POST", body: JSON.stringify(payload) });
    toast("เพิ่ม Revision สำเร็จ");
    await loadRevisions();
    ["r_rev", "r_dwg", "r_spec"].forEach((id) => { const el = $(id); if (el) el.value = ""; });
    if ($("r_current")) $("r_current").value = "false";
  } catch (e) {
    toast("เพิ่ม Revision ไม่สำเร็จ: " + e.message, false);
  }
}

/* =========================
   init
========================= */
document.addEventListener("DOMContentLoaded", () => {
  // Parts
  $("p_create")?.addEventListener("click", createPart);
  $("p_reload")?.addEventListener("click", () => { state.page = 1; loadParts(); });
  $("p_q")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { state.page = 1; loadParts(); }
  });

  // Revisions (optional panel)
  $("r_create")?.addEventListener("click", createRevision);
  $("r_reload")?.addEventListener("click", loadRevisions);

  // first load
  loadParts();
});
