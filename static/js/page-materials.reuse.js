// /static/js/page-materials.reuse.js
import { $, jfetch, toast } from "./api.js";
import { escapeHtml, showLoading, hideLoading } from "./utils.js";
import { createListPager } from "./list-pager.js?v=2";
import { renderTableX } from "./tablex.js";
import { createToggler } from "./toggler.js";

/* ---------------- Generic Factory (Reusable) ---------------- */

function createPagedTablePage(config) {
  // destructure config
  const {
    ids, // DOM ids mapping
    endpoints, // { listKeyset, create, byId, detailPage }
    columns, // renderTableX columns
    pageSizeDefault = 20,
    queryKey = "q",
    debounceMs = 300,

    // create payload & reset inputs
    makeCreatePayload,
    afterCreateReset,

    // optional helpers
    getRowId = (r) => r.id ?? r.material_id ?? r.materialId,
    makeDetailUrl = (id) =>
      `${endpoints.detailPage}?id=${encodeURIComponent(id)}`,
    emptyHtml = '<div class="muted">No data</div>',
    fmtDate = (v) => {
      if (!v) return "";
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
    },
  } = config;

  // attach utils to config (for use in columns render)
  const shared = { getRowId, makeDetailUrl, fmtDate };

  /* ---- UI refs ---- */
  const inputSearch = $(ids.search);
  const selPerPage = $(ids.perPage);
  const btnPrevTop = $(ids.prevTop);
  const btnNextTop = $(ids.nextTop);
  const pageInfoTop = $(ids.pageInfoTop);
  const btnPrevBottom = $(ids.prevBottom);
  const btnNextBottom = $(ids.nextBottom);
  const pageInfoBottom = $(ids.pageInfoBottom);
  const tableContainer = $(ids.tableContainer);

  const btnToggleCreate = $(ids.toggleCreateBtn);
  const createCard = $(ids.createCard);
  const btnCreate = $(ids.createBtn);

  // detail link helper (exposed globally if needed)
  const gotoDetail = (id) => {
    if (id != null) location.href = shared.makeDetailUrl(id);
  };
  if (config.exposeGotoDetail) window[config.exposeGotoDetail] = gotoDetail;

  /* ---- render ---- */
  function renderTable(container, rows, ctx = {}) {
    renderTableX(container, rows, {
      rowStart: Number(ctx.rowStart || 0),
      getRowId: shared.getRowId,
      onRowClick: (r) => {
        const rid = shared.getRowId(r);
        if (rid != null) gotoDetail(rid);
      },
      columns,
      emptyHtml,
    });
  }

  /* ---- pager ---- */
  let lp = createListPager({
    url: endpoints.listKeyset,
    pageSize: Number(selPerPage?.value || pageSizeDefault),
    container: tableContainer,
    render: renderTable,
    pageInfoEls: [pageInfoTop, pageInfoBottom],
    prevButtons: [btnPrevTop, btnPrevBottom],
    nextButtons: [btnNextTop, btnNextBottom],
    queryKey,
  });

  /* ---- create handler ---- */
  async function createItem() {
    const payload = makeCreatePayload();
    if (!payload) return; // creator handled validation & toast internally
    try {
      showLoading(tableContainer);
      await jfetch(endpoints.create, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast(config.messages?.created || "Created");
      afterCreateReset?.();
      createTg?.close();
      await lp.reloadFirst();
    } catch (e) {
      console.error(e);
      toast(e?.message || "Create failed", false);
    } finally {
      hideLoading(tableContainer);
    }
  }

  /* ---- boot wiring ---- */
  let createTg;
  function boot() {
    // toggler
    createTg = createToggler({
      trigger: btnToggleCreate,
      panel: createCard,
      persistKey: ids.persistKey || `${ids.tableContainer}:create`,
      focusTarget: `#${ids.createDefaultFocus || ""}`,
      closeOnEsc: true,
      closeOnOutside: true,
      group: ids.group || "top-actions",
      onOpen: () => {
        if (btnToggleCreate) btnToggleCreate.textContent = "× Cancel";
      },
      onClose: () => {
        if (btnToggleCreate) btnToggleCreate.textContent = "+ Add";
      },
    });
    if (btnToggleCreate)
      btnToggleCreate.textContent = createTg.isOpen() ? "× Cancel" : "+ Add";

    // search / perPage
    lp.bindSearch(inputSearch, { debounceMs });
    lp.bindPerPage(selPerPage);

    // create
    btnCreate?.addEventListener("click", createItem);

    // reload button (optional)
    $(ids.reloadBtn)?.addEventListener("click", () => lp.reloadFirst());

    // initial load with fallback (ถ้า keyset ไม่พร้อม)
    lp.reloadFirst().catch(async () => {
      // fallback to offset endpoint (ถ้ามี)
      if (!endpoints.list) return; // no fallback
      const alt = createListPager({
        url: endpoints.list,
        pageSize: Number(selPerPage?.value || pageSizeDefault),
        container: tableContainer,
        render: renderTable,
        pageInfoEls: [pageInfoTop, pageInfoBottom],
        prevButtons: [btnPrevTop, btnPrevBottom],
        nextButtons: [btnNextTop, btnNextBottom],
        queryKey,
      });
      alt.bindSearch(inputSearch, { debounceMs });
      alt.bindPerPage(selPerPage);
      lp = alt; // swap pager
      await alt.reloadFirst();
    });
  }

  return { boot, lpRef: () => lp, gotoDetail, fmtDate: shared.fmtDate };
}

/* ---------------- Materials Config (ใช้ได้ทันที) ---------------- */

const materialsPage = createPagedTablePage({
  ids: {
    search: "m_q",
    perPage: "m_per_page",
    prevTop: "m_prev",
    nextTop: "m_next",
    pageInfoTop: "m_page_info",
    prevBottom: "m_prev2",
    nextBottom: "m_next2",
    pageInfoBottom: "m_page_info2",
    tableContainer: "m_table",
    toggleCreateBtn: "m_toggle_create",
    createCard: "m_create_card",
    createBtn: "m_create",
    reloadBtn: "m_reload",
    createDefaultFocus: "m_name",
  },
  endpoints: {
    listKeyset: "/materials/keyset",
    list: "/materials", // fallback (optional)
    create: "/materials",
    byId: (id) => `/materials/${encodeURIComponent(id)}`,
    detailPage: "./materials-detail.html",
  },
  // expose function name for click from elsewhere (optional)
  exposeGotoDetail: "gotoMaterialDetail",

  // columns for renderTableX (No. handled by renderTableX via __no)
  columns: [
    { key: "__no", title: "No.", width: "64px", align: "right" },
    {
      key: "code",
      title: "Code",
      width: "140px",
      render: (r) => {
        const id = r.id ?? r.material_id ?? r.materialId;
        const code = escapeHtml(r.code ?? "");
        return id
          ? `<a href="./materials-detail.html?id=${encodeURIComponent(
              id
            )}" class="code-link">${code}</a>`
          : code;
      },
    },
    { key: "name", title: "Name" },
    {
      key: "spec",
      title: "Spec",
      width: "220px",
      render: (r) => escapeHtml(r.spec ?? ""),
    },
    { key: "uom", title: "UoM", width: "100px", align: "center" },
    {
      key: "remark",
      title: "Remark",
      width: "240px",
      render: (r) => escapeHtml(r.remark ?? ""),
    },
    {
      key: "created_at",
      title: "Created",
      width: "180px",
      align: "right",
      render: (r) => {
        const d = new Date(r.created_at);
        return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
      },
    },
  ],

  // payload/validation for create
  makeCreatePayload: () => {
    const code = $("m_code")?.value.trim() || "";
    const name = $("m_name")?.value.trim() || "";
    const spec = $("m_spec")?.value.trim() || null;
    const uom = $("m_uom")?.value.trim() || null;
    const remark = $("m_remark")?.value.trim() || null;

    if (!name) {
      toast("Enter material name", false);
      $("#m_name")?.focus?.();
      return null;
    }
    return { code, name, spec, uom, remark };
  },
  afterCreateReset: () => {
    ["m_code", "m_name", "m_spec", "m_remark"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    // ถ้าต้องการเก็บ uom คงค่าไว้ก็ไม่ต้องรีเซ็ต
  },

  messages: { created: "Material created" },
});

/* ---- boot ---- */
document.addEventListener("DOMContentLoaded", () => {
  materialsPage.boot();
});
