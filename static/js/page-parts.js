// /static/js/page-parts.js  (v8 - Tabulator)
import { $, jfetch, showToast as toast, initTopbar } from './api.js';

const partDetail = (id) => `./part-detail.html?id=${encodeURIComponent(id)}`;

/* ---------- helpers ---------- */
const safe = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : d.toLocaleString();
};
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const renderRevisionsInline = (revs) => {
  const list = Array.isArray(revs) ? revs : [];
  if (!list.length) return `<span class="muted">—</span>`;
  return list.map(r => {
    const cls = r.is_current ? 'rev current' : 'rev';
    return `<span class="${cls}" title="Revision ${safe(r.rev)}">${safe(r.rev)}</span>`;
  }).join(`<span class="rev-sep">, </span>`);
};

/* ---------- UI refs ---------- */
const inputSearch = $('p_q');
const selPerPage  = $('p_per_page');
const btnPrevTop  = $('p_prev');
const btnNextTop  = $('p_next');
const pageInfoTop = $('p_page_info');
const btnPrevBot  = $('p_prev2');
const btnNextBot  = $('p_next2');
const pageInfoBot = $('p_page_info2');
const tableMount  = $('p_table');
const btnReload   = $('p_reload');

/* Create form */
const inNo      = $('p_no');
const inName    = $('p_name');
const inDesc    = $('p_desc');
const inUom     = $('p_uom');
const inStatus  = $('p_status');
const btnCreate = $('p_create');

/* ---------- state ---------- */
let table = null;
let totalItems = 0;
let pageSize = Number(selPerPage?.value || 20);

/* ---------- next code helper ---------- */
async function peekNextPartNo() {
  try {
    const res = await jfetch('/parts/next-code'); // { next_code: "P00001", ... }
    if (inNo && !inNo.value) {
      inNo.value = res?.next_code || '';
    }
  } catch {_}
}

/* ---------- pager label ---------- */
function updatePagerLabel() {
  if (!table) return;
  const cur = table.getPage() || 1;
  const size = table.getPageSize() || pageSize;
  const totalPages = totalItems ? Math.max(1, Math.ceil(totalItems / size)) : cur;
  const label = totalItems ? `Page ${cur} / ${totalPages}` : `Page ${cur}`;
  if (pageInfoTop) pageInfoTop.textContent = label;
  if (pageInfoBot) pageInfoBot.textContent = label;

  const canPrev = cur > 1;
  const canNext = totalItems ? cur < totalPages : (table.getDataCount() === size);
  [btnPrevTop, btnPrevBot].forEach(b => b?.toggleAttribute('disabled', !canPrev));
  [btnNextTop, btnNextBot].forEach(b => b?.toggleAttribute('disabled', !canNext));
}

/* ---------- Tabulator init ---------- */
function initTable() {
  if (!tableMount) return;

  table = new Tabulator(tableMount, {
    layout: "fitColumns",
    height: "calc(100vh - 420px)",
    selectableRows: false,
    reactiveData: false,
    placeholder: "No parts found",
    index: "id",

    pagination: true,
    paginationMode: "remote",
    paginationSize: pageSize,

    ajaxURL: "/parts",           // not used directly; we use ajaxRequestFunc
    ajaxRequestFunc: async (_url, _config, params) => {
      // params.page, params.size, params.sorters, params.filters
      const page = params.page || 1;
      const size = params.size || pageSize;

      const q = (inputSearch?.value || "").trim();
      const usp = new URLSearchParams();
      usp.set("page", String(page));
      usp.set("page_size", String(size));
      usp.set("include", "revisions");
      if (q) usp.set("q", q);
      usp.set("_", String(Date.now()));

      const data = await jfetch(`/parts?${usp.toString()}`);
      const items = data.items ?? [];
      totalItems = Number(data.total ?? 0);

      // map -> flat fields used by columns
      const rows = items.map(p => ({
        id: p.id,
        part_no: p.part_no,
        name: p.name ?? '',
        uom: p.uom ?? 'ea',
        description: p.description ?? '',
        status: p.status ?? 'active',
        created_at: p.created_at ?? null,
        revisions: p.revisions ?? [],
      }));

      // Tabulator expects {data, last_page}
      const last_page = totalItems && size ? Math.max(1, Math.ceil(totalItems / size)) : page;
      return { data: rows, last_page };
    },

    columns: [
      { title: "No.", field: "_rowno", width: 70, hozAlign: "right", headerHozAlign: "right", headerSort: false,
        formatter: (cell) => {
          const pos = cell.getRow().getPosition(true);
          const curPage = table.getPage() || 1;
          const size = table.getPageSize() || pageSize;
          return (curPage - 1) * size + pos;
        },
      },
      { title: "Part No.", field: "part_no", width: 160, headerSort: true,
        formatter: (cell) => {
          const d = cell.getData();
          return `<a class="code-link" href="${partDetail(d.id)}">${safe(d.part_no ?? "")}</a>`;
        },
        cellClick: (e, cell) => {
          // allow link click default; rowClick will also navigate
          e.stopPropagation();
          const d = cell.getData();
          if (d?.id) location.href = partDetail(d.id);
        },
      },
      { title: "Name", field: "name", headerSort: true, minWidth: 200 },
      { title: "Revisions", field: "revisions", headerSort: false, minWidth: 220,
        formatter: (cell) => renderRevisionsInline(cell.getValue()),
      },
      { title: "UoM", field: "uom", width: 90, headerSort: false },
      { title: "Description", field: "description", headerSort: false, minWidth: 240 },
      { title: "Status", field: "status", width: 110, headerSort: true },
      { title: "Created", field: "created_at", width: 180, headerSort: true,
        formatter: (cell) => fmtDate(cell.getValue()),
      },
      { title: "", field: "_actions", width: 180, hozAlign: "right", headerSort: false,
        formatter: (cell) => {
          const d = cell.getData();
          const id = d?.id ? Number(d.id) : 0;
          return `
            <button class="btn-small" data-act="edit" data-id="${id}">Edit</button>
            <button class="btn-small" data-act="del"  data-id="${id}">Delete</button>
          `;
        },
        cellClick: async (e, cell) => {
          const btn = e.target.closest('button[data-act]');
          if (!btn) return;
          const id = Number(btn.dataset.id);
          if (!id) return;
          if (btn.dataset.act === 'edit') {
            location.href = partDetail(id);
            return;
          }
          if (btn.dataset.act === 'del') {
            if (!confirm('Delete this part?')) return;
            try {
              await jfetch(`/parts/${id}`, { method: 'DELETE' });
              toast('Deleted');
              // refresh current page
              table.replaceData();
            } catch (err) {
              toast(err?.message || 'Delete failed', false);
            }
          }
        },
      },
    ],
  });

  // navigate by clicking row anywhere (except on buttons/links)
  table.on("rowClick", (_e, row) => {
    const d = row.getData();
    if (d?.id) location.href = partDetail(d.id);
  });

  // Keep external pager in sync
  table.on("pageLoaded", () => updatePagerLabel());
  table.on("dataProcessed", () => updatePagerLabel());
  table.on("dataLoaded", () => updatePagerLabel());

  // Make sure flex containers don’t cause horizontal overflow
  requestAnimationFrame(() => table.redraw(true));
  window.addEventListener("resize", () => table.redraw(true));
  new ResizeObserver(() => table.redraw(true)).observe(tableMount);
}

/* ---------- create ---------- */
async function createPart() {
  const raw_no = inNo?.value?.trim().toUpperCase();
  const part_no = raw_no || 'AUTO';   // let backend autogen when supported
  const name = inName?.value?.trim() || null;
  const description = inDesc?.value?.trim() || '';
  const uom = inUom?.value?.trim() || null;
  const status = inStatus?.value || 'active';

  try {
    await jfetch('/parts', {
      method: 'POST',
      body: JSON.stringify({ part_no, name, description, uom, status }),
    });
    toast('Created');

    // clear inputs
    [inNo, inName, inDesc, inUom].forEach(el => el && (el.value = ''));
    if (inStatus) inStatus.value = 'active';

    await peekNextPartNo();
    // reload from first page
    table?.setPage(1);
    table?.replaceData();
  } catch (e) {
    toast(e?.message || 'Create failed', false);
  }
}

/* ---------- bindings ---------- */
inputSearch?.addEventListener('input', debounce(() => {
  table?.setPage(1);
  table?.replaceData();
}, 250));

selPerPage?.addEventListener('change', () => {
  pageSize = Number(selPerPage.value || 20);
  table?.setPageSize(pageSize);
  table?.setPage(1);
});

btnReload?.addEventListener('click', () => table?.replaceData());

[btnPrevTop, btnPrevBot].forEach(b => b?.addEventListener('click', () => {
  const cur = table?.getPage() || 1;
  if (cur > 1) table?.setPage(cur - 1);
}));
[btnNextTop, btnNextBot].forEach(b => b?.addEventListener('click', () => {
  const cur = table?.getPage() || 1;
  table?.setPage(cur + 1);
}));

// Create
btnCreate?.addEventListener('click', createPart);

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initTopbar?.();
  peekNextPartNo();
  initTable();
});
