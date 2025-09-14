// /static/js/list-pager.js?v=2
// Reusable list pager (ค้นหา + เพจจิ้ง + UI ปุ่ม/เลขหน้า)
// ใช้กับ CursorPager2D จาก pagination.js
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
      if (b) {
        b.disabled = disablePrev;
        b.setAttribute("aria-disabled", String(disablePrev));
      }
    });
    nexts.forEach((b) => {
      if (b) {
        b.disabled = disableNext;
        b.setAttribute("aria-disabled", String(disableNext));
      }
    });
  };

  return { update };
}

/**
 * สร้างคอนโทรลเลอร์เพจลิสต์ที่ reuse ได้
 * @param {Object} opts             - options ต่าง ๆ (จำเป็นต้องระบุ url, container, render)
 * @param {string} opts.url                 - keyset endpoint (relative) เช่น '/customers/keyset'
 * @param {number} [opts.pageSize=20]    - จำนวนรายการต่อหน้า (ดีฟอลต์ 20)
 * @param {HTMLElement} opts.container      - element ที่จะเรนเดอร์ตาราง เข้าไป (เช่น <tbody>)
 * @param {(container:HTMLElement, rows:any[])=>void} opts.render - ฟังก์ชันเรนเดอร์ตาราง (รับ container กับ array ของ row objects)
 * @param {HTMLElement|HTMLElement[]} [opts.pageInfoEls] - element ที่จะแสดงเลขหน้า (เช่น <span>)
 * @param {HTMLButtonElement|HTMLButtonElement[]} [opts.prevButtons] - ปุ่มก่อนหน้า
 * @param {HTMLButtonElement|HTMLButtonElement[]} [opts.nextButtons]  - ปุ่มถัดไป
 * @param {string} [opts.queryKey='q']      - ชื่อพารามิเตอร์ค้นหา (ดีฟอลต์ q)
 * @param {object} [opts.initialFilters]    - ฟิลเตอร์อื่น ๆ เริ่มต้น
 * @param {()=>Object} [opts.getExtraParams]- คืน params เพิ่มเติมทุกครั้ง (optional)
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
  } = opts || {};

  if (!url)
    throw new Error(
      "createListPager: opts.url is required ex /customers/keysetin API"
    );
  if (!container)
    throw new Error(
      "createListPager: opts.container is required ex tbody id, <tbody>"
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

  const buildParams = () => {
    const extra =
      typeof getExtraParams === "function" ? getExtraParams() || {} : {};
    const qParam = state.query ? { [queryKey]: state.query } : {};
    return { ...qParam, ...(state.filters || {}), ...extra };
  };

  const recreatePager = () => {
    pager = new CursorPager2D({ url, pageSize: state.pageSize });
    ui = makePagerUI(pager, { pageInfoEls, prevButtons, nextButtons });
  };

  // ---- actions ----
  async function reloadFirst() {
    recreatePager();
    ui.update(true);
    showLoading(container);
    try {
      const { items } = await pager.first(buildParams());
      const ctx = {
        rowStart: (pager.pageIndex - 1) * state.pageSize,
        pageIndex: pager.pageIndex,
        pageSize: state.pageSize,
      };
      render(container, items || [], ctx);
      ui.update(false);
    } catch (e) {
      toast(e?.message || "Load failed", false);
      ui.update(false);
    } finally {
      hideLoading(container);
    }
  }

  async function goNext() {
    if (!pager.nav?.hasNext) return;
    ui.update(true);
    showLoading(container);
    try {
      const { items } = await pager.next(buildParams());
      if (items?.length) {
        const ctx = {
          rowStart: (pager.pageIndex - 1) * state.pageSize,
          pageIndex: pager.pageIndex,
          pageSize: state.pageSize,
        };
        render(container, items, ctx);
      }
      ui.update(false);
    } catch (e) {
      toast(e?.message || "Next failed", false);
      ui.update(false);
    } finally {
      hideLoading(container);
    }
  }

  async function goPrev() {
    if (!pager.nav?.hasPrev) return;
    ui.update(true);
    showLoading(container);
    try {
      const { items } = await pager.prev(buildParams());
      if (items?.length) {
        const ctx = {
          rowStart: (pager.pageIndex - 1) * state.pageSize,
          pageIndex: pager.pageIndex,
          pageSize: state.pageSize,
        };
        render(container, items, ctx);
      }
      ui.update(false);
    } catch (e) {
      toast(e?.message || "Prev failed", false);
      ui.update(false);
    } finally {
      hideLoading(container);
    }
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

  // ---- wiring helpers (reuse ได้ทุกเพจ) ----
  function bindSearch(
    inputEl,
    { debounceMs = 300, normalize = (s) => s } = {}
  ) {
    if (!inputEl) return () => {};
    const handler = debounce(() => {
      setQuery(normalize(inputEl.value ?? ""), { immediate: true });
    }, debounceMs);
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
    (Array.isArray(prevButtons) ? prevButtons : [prevButtons])
      .filter(Boolean)
      .forEach((b) => b.addEventListener("click", goPrev));
    (Array.isArray(nextButtons) ? nextButtons : [nextButtons])
      .filter(Boolean)
      .forEach((b) => b.addEventListener("click", goNext));
  }

  // auto-wire ถ้าส่งปุ่มมา
  bindButtons({ prevButtons, nextButtons });

  return {
    // return functions & state
    // state & refs
    get pager() {
      return pager;
    },
    get state() {
      return { ...state };
    },

    // core actions
    reloadFirst,
    goNext,
    goPrev,

    // search/filters/perPage
    setQuery,
    setFilters,
    replaceFilters,
    setPageSize,

    // wiring helpers
    bindSearch,
    bindPerPage,
    updateUI: () => ui.update(false),
  };
}
