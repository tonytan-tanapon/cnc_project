// /static/js/list-pager.js?v=3
// Reusable list pager (ค้นหา + เพจจิ้ง + UI ปุ่ม/เลขหน้า) สำหรับ CursorPager2D
import { CursorPager2D } from "./pagination.js?v=3";
import { showLoading, hideLoading } from "./utils.js";
import { toast } from "./api.js";

// debounce เล็กๆ ให้ self-contained
const debounce = (fn, ms = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

// UI updater (เลขหน้า/ปุ่ม)
function makePagerUI(
  pager,
  { pageInfoEls = [], prevButtons = [], nextButtons = [] } = {}
) {
  const infos = (
    Array.isArray(pageInfoEls) ? pageInfoEls : [pageInfoEls]
  ).filter(Boolean);
  const prevs = (
    Array.isArray(prevButtons) ? prevButtons : [prevButtons]
  ).filter(Boolean);
  const nexts = (
    Array.isArray(nextButtons) ? nextButtons : [nextButtons]
  ).filter(Boolean);

  const update = (busy = false) => {
    const text = `Page ${pager.pageIndex}`;
    infos.forEach((el) => {
      el.textContent = text;
    });

    const canPrev = !!(pager.nav && pager.nav.hasPrev);
    const canNext = !!(pager.nav && pager.nav.hasNext);
    const disablePrev = busy || !canPrev;
    const disableNext = busy || !canNext;

    prevs.forEach((b) => {
      b.disabled = disablePrev;
      b.setAttribute("aria-disabled", String(disablePrev));
    });
    nexts.forEach((b) => {
      b.disabled = disableNext;
      b.setAttribute("aria-disabled", String(disableNext));
    });
  };

  return { update };
}

/**
 * สร้างคอนโทรลเลอร์เพจลิสต์ที่ reuse ได้
 * @param {Object} opts
 * @param {string}   opts.url
 * @param {number}   [opts.pageSize=20]
 * @param {HTMLElement} opts.container
 * @param {(container:HTMLElement, rows:any[], ctx:{rowStart:number,pageIndex:number,pageSize:number})=>void} opts.render
 * @param {HTMLElement|HTMLElement[]} [opts.pageInfoEls]
 * @param {HTMLButtonElement|HTMLButtonElement[]} [opts.prevButtons]
 * @param {HTMLButtonElement|HTMLButtonElement[]} [opts.nextButtons]
 * @param {string}   [opts.queryKey='q']
 * @param {object}   [opts.initialFilters]
 * @param {()=>Object} [opts.getExtraParams]
 * @param {(params:Object)=>Object} [opts.transformParams]   // ★ เพิ่ม: ดัดแปลง params ก่อนยิง
 * @param {(resp:any)=>{items:any[]}} [opts.transformResponse] // ★ เพิ่ม: map response → {items}
 * @param {(container:HTMLElement, ctx:any)=>void} [opts.emptyRenderer] // ★ เพิ่ม: render ว่าง
 * @param {(params:Object, phase:'first'|'next'|'prev')=>void} [opts.onBeforeFetch] // ★ เพิ่ม hook
 * @param {(rows:any[], ctx:any)=>void} [opts.onAfterRender]  // ★ เพิ่ม hook
 * @param {(err:any, phase:'first'|'next'|'prev')=>void} [opts.onError] // ★ เพิ่ม hook
 */
export function createListPager(opts) {
  const {
    url,
    pageSize = 20,
    container,
    render, // (container, rows, ctx) => void
    pageInfoEls,
    prevButtons,
    nextButtons,
    queryKey = "q",
    initialFilters = {},
    getExtraParams,
    transformParams,
    transformResponse,
    emptyRenderer,
    onBeforeFetch,
    onAfterRender,
    onError,
  } = opts || {};

  if (!url)
    throw new Error(
      "createListPager: opts.url is required, e.g. '/customers/keyset'"
    );
  if (!container)
    throw new Error(
      "createListPager: opts.container is required (HTMLElement)"
    );
  if (typeof render !== "function")
    throw new Error("createListPager: opts.render must be a function");

  // ---- state ----
  const state = {
    pageSize,
    query: "",
    filters: { ...(initialFilters || {}) },
  };

  // ---- pager & UI ----
  let pager = new CursorPager2D({ url, pageSize: state.pageSize });
  let ui = makePagerUI(pager, { pageInfoEls, prevButtons, nextButtons });

  const baseParams = () => {
    const extra =
      typeof getExtraParams === "function" ? getExtraParams() || {} : {};
    const qParam = state.query ? { [queryKey]: state.query } : {};
    return { ...qParam, ...(state.filters || {}), ...extra };
  };

  const buildParams = () => {
    const raw = baseParams();
    return typeof transformParams === "function"
      ? transformParams(raw) || raw
      : raw;
  };

  const mapResp = (resp) => {
    if (typeof transformResponse === "function") {
      const out = transformResponse(resp);
      if (out && Array.isArray(out.items)) return out;
    }
    // ดีฟอลต์: resp = { items }
    return { items: resp?.items ?? [] };
  };

  const recreatePager = () => {
    pager = new CursorPager2D({ url, pageSize: state.pageSize });
    ui = makePagerUI(pager, { pageInfoEls, prevButtons, nextButtons });
  };

  // ---- core fetch flow ----
  async function run(phase, fetchFn) {
    ui.update(true);
    showLoading(container);
    const params = buildParams();

    try {
      onBeforeFetch?.(params, phase);
    } catch (_) {} // อย่าทำให้การดัก event พัง flow หลัก

    try {
      const raw = await fetchFn(params);
      const { items } = mapResp(raw);

      // ctx ส่งให้ renderer
      const ctx = {
        rowStart: (pager.pageIndex - 1) * state.pageSize,
        pageIndex: pager.pageIndex,
        pageSize: state.pageSize,
      };

      if (!items || items.length === 0) {
        if (typeof emptyRenderer === "function") {
          emptyRenderer(container, ctx);
        } else {
          container.innerHTML = `<div class="muted" style="padding:12px">No data</div>`;
        }
      } else {
        render(container, items, ctx);
      }

      try {
        onAfterRender?.(items || [], ctx);
      } catch (_) {}

      ui.update(false);
    } catch (e) {
      toast(e?.message || `${phase} failed`, false);
      try {
        onError?.(e, phase);
      } catch (_) {}
      ui.update(false);
    } finally {
      hideLoading(container);
    }
  }

  // ---- actions ----
  async function reloadFirst() {
    recreatePager();
    await run("first", (params) => pager.first(params));
  }
  async function goNext() {
    if (!pager.nav?.hasNext) return;
    await run("next", (params) => pager.next(params));
  }
  async function goPrev() {
    if (!pager.nav?.hasPrev) return;
    await run("prev", (params) => pager.prev(params));
  }

  // ---- search / filters / perPage APIs ----
  function setQuery(q, { immediate = true } = {}) {
    state.query = (q ?? "").trim();
    return immediate ? reloadFirst() : Promise.resolve();
  }
  function setFilters(obj = {}, { immediate = true } = {}) {
    state.filters = { ...(state.filters || {}), ...(obj || {}) };
    return immediate ? reloadFirst() : Promise.resolve();
  }
  function replaceFilters(obj = {}, { immediate = true } = {}) {
    state.filters = { ...(obj || {}) };
    return immediate ? reloadFirst() : Promise.resolve();
  }
  function setPageSize(n) {
    const v = Number(n) || pageSize;
    state.pageSize = v;
    return reloadFirst();
  }

  // ---- wiring helpers (คืน unbinders สำหรับ teardown) ----
  function bindSearch(
    inputEl,
    { debounceMs = 300, normalize = (s) => s } = {}
  ) {
    if (!inputEl) return () => {};
    const handler = debounce(
      () => setQuery(normalize(inputEl.value ?? ""), { immediate: true }),
      debounceMs
    );
    inputEl.addEventListener("input", handler);
    return () => inputEl.removeEventListener("input", handler);
  }

  function bindPerPage(selectEl) {
    if (!selectEl) return () => {};
    const onChange = () => setPageSize(selectEl.value);
    selectEl.addEventListener("change", onChange);
    return () => selectEl.removeEventListener("change", onChange);
  }

  function bindButtons({ prevButtons, nextButtons } = {}) {
    const unsubs = [];
    (Array.isArray(prevButtons) ? prevButtons : [prevButtons])
      .filter(Boolean)
      .forEach((b) => {
        const fn = () => goPrev();
        b.addEventListener("click", fn);
        unsubs.push(() => b.removeEventListener("click", fn));
      });
    (Array.isArray(nextButtons) ? nextButtons : [nextButtons])
      .filter(Boolean)
      .forEach((b) => {
        const fn = () => goNext();
        b.addEventListener("click", fn);
        unsubs.push(() => b.removeEventListener("click", fn));
      });
    return () => unsubs.forEach((u) => u());
  }

  // auto-wire ถ้าส่งปุ่มมา
  const unbindButtons = bindButtons({ prevButtons, nextButtons });

  return {
    // refs
    get pager() {
      return pager;
    },
    get state() {
      return { ...state };
    },

    // actions
    reloadFirst,
    goNext,
    goPrev,

    // search/filters/perPage
    setQuery,
    setFilters,
    replaceFilters,
    setPageSize,

    // wiring
    bindSearch,
    bindPerPage,
    updateUI: () => ui.update(false),

    // teardown (ถ้าหน้าถูก dispose)
    destroy: () => {
      try {
        unbindButtons?.();
      } catch (_) {}
      // หมายเหตุ: ถ้ามี unbind จาก bindSearch/bindPerPage ให้ผู้ใช้เรียกเองตามที่คืนออกไป
    },
  };
}
