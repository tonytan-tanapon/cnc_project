// /static/js/page-suppliers.js
// Infinite scroll (keyset DESC) + autosave create/patch + delete
import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const ENDPOINTS = { 
  base: "/api/v1/suppliers", 
  keyset: "/api/v1/suppliers/keyset" 
};
const PER_PAGE = 50;
const UI = { q: "_q", btnAdd: "_add", tableMount: "listBody" };
const DEBUG = false;

/* ===== STATE ===== */
let els = {};
let table = null;
let cursorNext = null;
let hasMore = true;
let loading = false;
let currentKeyword = "";

let loadedIds = new Set();
let minLoadedId = Infinity;
let dataStore = [];
let loadVersion = 0;

let observers = [];
let sentinelEl = null;
let loaderEl = null;
let pollerId = null;

const createInFlight = new WeakSet();
const patchTimers = new Map();
const PATCH_DEBOUNCE_MS = 350;

const FETCH_COOLDOWN_MS = 250;
const POLLING_INTERVAL_MS = 600;
const NEAR_BOTTOM_PX = 60;

let lastFetchAt = 0;
let rAFToken = 0;

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());
const toNumId = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const dbg = (...a) => DEBUG && console.debug(...a);

function nowMs() { return performance?.now?.() || Date.now(); }
function underCooldown() { return nowMs() - lastFetchAt < FETCH_COOLDOWN_MS; }
function markFetched() { lastFetchAt = nowMs(); }
function throttleForceCheck() {
  if (rAFToken) return;
  rAFToken = requestAnimationFrame(() => {
    rAFToken = 0;
    window.dispatchEvent(new Event("scroll"));
    getTableHolder()?.dispatchEvent(new Event("scroll"));
  });
}

function buildPayload(row) {
  return {
    name: trim(row.name) || null,
    code: row.code ? String(row.code).toUpperCase() : null,
    contact: trim(row.contact || "") || null,
    email: trim(row.email || "") || null,
    phone: trim(row.phone || "") || null,
    address: trim(row.address || "") || null,
    payment_terms: trim(row.payment_terms || "") || null,
  };
}

function normalizeRow(r) {
  const id = toNumId(r.id ?? r.supplier_id ?? r.supplierId ?? null);
  if (id != null && id < minLoadedId) minLoadedId = id;
  return {
    id,
    code: r.code ?? "",
    name: r.name ?? "",
    contact: r.contact ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    address: r.address ?? "",
    payment_terms: r.payment_terms ?? "",
  };
}

/* ===== DOM utils ===== */
function getTableRoot() {
  return (
    table?.getElement?.() ||
    document.querySelector(`#${UI.tableMount}`)?.closest(".tabulator") ||
    null
  );
}
function getTableHolder() {
  const root = getTableRoot();
  return (
    root?.querySelector(".tabulator-tableHolder") ||
    root?.querySelector(".tabulator-tableholder") ||
    null
  );
}
function isScrollable(el) {
  if (!el) return false;
  const s = getComputedStyle(el);
  return /(auto|scroll|overlay)/.test(s.overflowY || s.overflow || "");
}
function closestScrollable(el) {
  let p = el?.parentElement;
  while (p) {
    if (isScrollable(p)) return p;
    p = p.parentElement;
  }
  return null;
}

/* ===== Loader badge ===== */
function ensureLoader() {
  if (loaderEl) return loaderEl;
  loaderEl = document.createElement("div");
  loaderEl.id = "sup-loading";
  loaderEl.style.cssText =
    "text-align:center;padding:8px;color:#64748b;font-size:12px;";
  loaderEl.textContent = "Loading…";
  const holder = getTableHolder();
  const root = getTableRoot();
  if (holder) holder.appendChild(loaderEl);
  else if (root) root.appendChild(loaderEl);
  return loaderEl;
}
function showLoader(on) { ensureLoader().style.display = on ? "block" : "none"; }

/* ===== COLUMNS ===== */
function makeColumns() {
  return [
    { title: "No.", width: 60, headerSort: false, formatter: "rownum" },
    { title: "Code", field: "code", width: 110, editor: "input" },
    { title: "Name", field: "name", minWidth: 160, editor: "input", validator: "required" },
    { title: "Contact", field: "contact", width: 140, editor: "input" },
    { title: "Email", field: "email", width: 200, editor: "input" },
    { title: "Phone", field: "phone", width: 140, editor: "input" },
    { title: "Address", field: "address", widthGrow: 3, minWidth: 220, maxWidth: 600, editor: "input", cssClass: "wrap" },
    { title: "Payment terms", field: "payment_terms", width: 160, editor: "input" },
    {
      title: "Actions",
      field: "_actions",
      width: 120,
      hozAlign: "center",
      headerSort: false,
      cssClass: "actions-cell",
      formatter: () => `
        <div class="row-actions">
          <button class="btn-small btn-danger" data-act="del">Delete</button>
        </div>`,
      cellClick: (e, cell) => {
        const btn = e.target.closest("button[data-act='del']");
        if (!btn) return;
        deleteRow(cell.getRow());
      },
    },
  ];
}

/* ===== Tab / Shift+Tab ===== */
function getEditableFieldsLive(tab) {
  return tab
    .getColumns(true)
    .map((c) => ({ field: c.getField(), def: c.getDefinition() }))
    .filter((c) => c.field && c.def && !!c.def.editor)
    .map((c) => c.field);
}
function focusSiblingEditable(cell, dir) {
  const row = cell.getRow();
  const tab = row.getTable();
  const fields = getEditableFieldsLive(tab);
  const curFieldIdx = fields.indexOf(cell.getField());
  if (curFieldIdx === -1) return;
  const rows = tab.getRows();
  const curRowIdx = rows.indexOf(row);
  let nextFieldIdx = curFieldIdx + dir, nextRowIdx = curRowIdx;
  if (nextFieldIdx >= fields.length) { nextFieldIdx = 0; nextRowIdx = Math.min(curRowIdx + 1, rows.length - 1); }
  else if (nextFieldIdx < 0) { nextFieldIdx = fields.length - 1; nextRowIdx = Math.max(curRowIdx - 1, 0); }
  const targetRow = rows[nextRowIdx];
  if (!targetRow) return;
  const targetCell = targetRow.getCell(fields[nextFieldIdx]);
  if (!targetCell) return;
  targetCell.edit(true);
  const input = targetCell.getElement()?.querySelector("input, textarea, [contenteditable='true']");
  if (input) {
    const v = input.value;
    input.focus();
    if (typeof v === "string") input.setSelectionRange(v.length, v.length);
  }
}

/* ===== AUTOSAVE ===== */
async function autosaveCell(cell, opts = {}) {
  const { fromHistory = false, revert } = opts;
  const row = cell.getRow();
  const d = row.getData();
  const fld = cell.getField();
  const newVal = cell.getValue();
  const oldVal = fromHistory ? undefined : cell.getOldValue();

  if (fld === "name" && !trim(newVal)) {
    toast("Name required", false);
    if (!fromHistory) cell.setValue(oldVal, true);
    else if (typeof revert === "function") revert();
    return;
  }

  const payload = buildPayload(d);

  // CREATE
  if (!d.id) {
    if (!payload.name) return;
    if (createInFlight.has(row)) return;
    createInFlight.add(row);
    try {
      const created = await jfetch(ENDPOINTS.base, { method: "POST", body: JSON.stringify(payload) });
      const norm = normalizeRow(created || d);
      row.update({ ...norm });
      if (norm.id != null) loadedIds.add(norm.id);
      toast(`Supplier "${norm.name}" created`);
    } catch (e) {
      if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
      else if (typeof revert === "function") revert();
      toast(e?.message || "Create failed", false);
    } finally {
      createInFlight.delete(row);
    }
    return;
  }

  // PATCH (debounced)
  if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));
  const t = setTimeout(async () => {
    patchTimers.delete(row);
    try {
      const updated = await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(d.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const norm = normalizeRow(updated || d);
      const fields = ["code", "name", "contact", "email", "phone", "address", "payment_terms"];
      for (const f of fields) {
        const cur = row.getData()[f];
        const nxt = norm[f];
        if (cur !== nxt) row.getCell(f)?.setValue(nxt, true);
      }
      if (norm.id != null && norm.id !== d.id) {
        const raw = row.getData();
        raw.id = norm.id;
        row.reformat();
      }
      toast(`Saved changes to "${norm.code || norm.name}"`);
    } catch (e) {
      if (!fromHistory && oldVal !== undefined) {
        cell.setValue(oldVal, true);
      } else if (typeof revert === "function") {
        revert();
      } else {
        try {
          const fresh = await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(d.id)}`);
          const norm = normalizeRow(fresh || d);
          const fields = ["code", "name", "contact", "email", "phone", "address", "payment_terms"];
          for (const f of fields) row.getCell(f)?.setValue(norm[f], true);
        } catch {}
      }
      toast(e?.message || "Save failed", false);
    }
  }, PATCH_DEBOUNCE_MS);
  patchTimers.set(row, t);
}

/* ===== DELETE ===== */
async function deleteRow(row) {
  const d = row.getData();
  if (!d) return;
  if (!d.id) { row.delete(); return; }
  if (!confirm(`Delete supplier "${d.name || d.code || d.id}"?\nThis action cannot be undone.`)) return;
  try {
    await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(d.id)}`, { method: "DELETE" });
    row.delete();
    loadedIds.delete(d.id);
    dataStore = dataStore.filter((x) => x.id !== d.id);
    toast("Deleted");
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

/* ===== ADD ROW ===== */
async function addBlankRow() {
  const row = await table.addRow(
    { code: "", name: "", contact: "", email: "", phone: "", address: "", payment_terms: "" },
    true
  );
  row.getCell("name")?.edit(true);
}

/* ===== Append rows (dedup) ===== */
async function appendRows(rows) {
  if (!rows?.length) return;
  const fresh = [];
  for (const r of rows) {
    if (!r.id || loadedIds.has(r.id)) continue;
    loadedIds.add(r.id);
    if (r.id < minLoadedId) minLoadedId = r.id;
    fresh.push(r);
  }
  if (!fresh.length) return;

  const prevLen = table?.getData()?.length || 0;
  await table?.addData(fresh, false);
  const afterLen = table?.getData()?.length || 0;

  if (afterLen === prevLen) {
    await table?.updateOrAddData(fresh, "id");
  }
  dataStore = table?.getData() || [];

  if (loadedIds.size > 50000) {
    const keep = new Set(dataStore.map((x) => x.id));
    loadedIds = keep;
  }
}

/* ===== Table init ===== */
function initTable() {
  table = new Tabulator(`#${UI.tableMount}`, {
    layout: "fitColumns",
    height: "520px",
    columns: makeColumns(),
    placeholder: "No suppliers",
    reactiveData: true,
    index: "id",
    history: true,
    selectableRows: 1,
  });

  table.on("tableBuilt", async () => {
    setupInfiniteTriggers();
    startPolling();
    await new Promise((r) => requestAnimationFrame(r));
    table.redraw(true);
    resetAndLoadFirst();
  });

  table.on("cellEditing", (cell) => {
    setTimeout(() => {
      const input = cell.getElement()?.querySelector("input, textarea, [contenteditable='true']");
      if (!input) return;
      const handler = (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
          focusSiblingEditable(cell, e.shiftKey ? -1 : +1);
        }
      };
      input.addEventListener("keydown", handler);
      input.addEventListener("blur", () => input.removeEventListener("keydown", handler), { once: true });
    }, 0);
  });

  table.on("cellEdited", (cell) => {
    autosaveCell(cell);
  });
}

/* ===== Styles ===== */
function injectStylesOnce() {
  if (document.getElementById("sup-actions-css")) return;
  const st = document.createElement("style");
  st.id = "sup-actions-css";
  st.textContent = `
    .row-actions{ display:flex; gap:6px; justify-content:center; }
    .btn-small{ font:inherit; padding:4px 8px; border:1px solid #e5e7eb; border-radius:6px; background:#f8fafc; cursor:pointer }
    .btn-small:hover{ background:#f1f5f9 }
    .btn-danger{ background:#ef4444; color:#fff; border-color:#dc2626 }
    .btn-danger:hover{ background:#dc2626 }
    #listBody .tabulator-cell.actions-cell{ overflow:visible; }
    #listBody .tabulator-cell.wrap{ white-space:normal; word-break:break-word; }
  `;
  document.head.appendChild(st);
}

/* ===== Keyset fetchers ===== */
async function fetchFirstPageKeyset(keyword, version) {
  if (underCooldown()) {
    await new Promise((r) => setTimeout(r, FETCH_COOLDOWN_MS - (nowMs() - lastFetchAt)));
  }
  const usp = new URLSearchParams();
  usp.set("limit", String(PER_PAGE));
  if (keyword) usp.set("q", keyword);
  const url = `${ENDPOINTS.keyset}?${usp.toString()}`;
  const res = await jfetch(url);
  markFetched();
  if (version !== loadVersion) return null;
  const items = Array.isArray(res?.items) ? res.items : [];
  const next = toNumId(res?.next_cursor ?? null);
  const more = !!res?.has_more;
  return { items, nextCursor: next, hasMore: more };
}

async function fetchNextPageKeyset(version) {
  if (!hasMore || cursorNext == null) return null;
  if (underCooldown()) return null;
  const usp = new URLSearchParams();
  usp.set("limit", String(PER_PAGE));
  usp.set("cursor", String(cursorNext));
  if (currentKeyword) usp.set("q", currentKeyword);
  const url = `${ENDPOINTS.keyset}?${usp.toString()}`;
  const res = await jfetch(url);
  markFetched();
  if (version !== loadVersion) return null;
  const items = Array.isArray(res?.items) ? res.items : [];
  const next = toNumId(res?.next_cursor ?? null);
  const more = !!res?.has_more;
  return { items, nextCursor: next, hasMore: more };
}

/* ===== Loaders ===== */
async function resetAndLoadFirst(keyword = "") {
  loadVersion += 1;
  const myVersion = loadVersion;

  loading = false;
  hasMore = true;
  cursorNext = null;
  currentKeyword = keyword || "";
  loadedIds = new Set();
  minLoadedId = Infinity;
  dataStore = [];

  try {
    table?.setData([]);
    table?.clearHistory?.();
  } catch {}
  showLoader(true);

  try {
    loading = true;
    const res = await fetchFirstPageKeyset(currentKeyword, myVersion);
    if (!res) return;
    const { items, nextCursor, hasMore: more } = res;
    const rows = items.map(normalizeRow);
    await appendRows(rows);
    cursorNext = nextCursor ?? (rows.length ? rows[rows.length - 1].id : null);
    hasMore = more && cursorNext != null;
    await autofillViewport(myVersion, 6);
    throttleForceCheck();
  } catch (e) {
    toast(e?.message || "Load failed", false);
  } finally {
    if (myVersion === loadVersion) {
      loading = false;
      showLoader(false);
    }
  }
}

async function loadNextPageIfNeeded() {
  if (!hasMore || loading) return;
  const myVersion = loadVersion;
  if (underCooldown()) return;

  loading = true;
  showLoader(true);

  try {
    const res = await fetchNextPageKeyset(myVersion);
    if (!res) return;

    const { items, nextCursor, hasMore: more } = res;
    const rows = items.map(normalizeRow);
    await appendRows(rows);

    const fallbackLast = rows.length ? rows[rows.length - 1].id : null;
    if (rows.length === 0 && Number.isFinite(minLoadedId)) {
      cursorNext = minLoadedId - 1;
      hasMore = true;
    } else {
      cursorNext = nextCursor != null ? nextCursor : fallbackLast ?? cursorNext;
      hasMore = more && cursorNext != null;
    }
    throttleForceCheck();
  } catch (e) {
    hasMore = false;
    toast(e?.message || "Load more failed", false);
  } finally {
    if (myVersion === loadVersion) {
      loading = false;
      showLoader(false);
    }
  }
}

async function autofillViewport(version, maxLoops = 5) {
  const holder = getTableHolder();
  const mount = document.getElementById(UI.tableMount);
  let loops = 0;

  const needMore = () => {
    if (holder && holder.scrollHeight <= holder.clientHeight + 4) return true;
    const rect = mount?.getBoundingClientRect?.();
    if (rect) return rect.bottom <= window.innerHeight + 60;
    return false;
  };

  while (version === loadVersion && hasMore && !loading && loops < maxLoops) {
    if (!needMore()) break;
    await loadNextPageIfNeeded();
    loops += 1;
  }
}

/* ===== Infinite triggers ===== */
function setupInfiniteTriggers() {
  observers.forEach((ob) => ob.disconnect?.());
  observers = [];

  const holder = getTableHolder();
  const root = getTableRoot();
  const mount = document.getElementById(UI.tableMount);
  const scrollParent = closestScrollable(root);

  if (!sentinelEl) {
    sentinelEl = document.createElement("div");
    sentinelEl.id = "sup-infinite-sentinel";
    sentinelEl.style.cssText = "height:1px;width:100%;";
  }
  if (holder && !holder.contains(sentinelEl)) holder.appendChild(sentinelEl);
  else if (root && !root.contains(sentinelEl)) root.appendChild(sentinelEl);
  else if (mount?.parentElement && !mount.parentElement.contains(sentinelEl))
    mount.parentElement.appendChild(sentinelEl);

  const mkObserver = (rootEl) => {
    const ob = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) loadNextPageIfNeeded();
      },
      { root: rootEl || null, rootMargin: "120px 0px", threshold: 0 }
    );
    ob.observe(sentinelEl);
    observers.push(ob);
  };
  mkObserver(null);
  if (holder) mkObserver(holder);
  if (scrollParent && scrollParent !== holder) mkObserver(scrollParent);

  const onScrollGeneric = () => {
    if (!hasMore || loading) return;
    if (holder) {
      const near =
        holder.scrollTop + holder.clientHeight >=
        holder.scrollHeight - NEAR_BOTTOM_PX;
      if (near) return loadNextPageIfNeeded();
    }
    const rect = (root || mount)?.getBoundingClientRect?.();
    if (rect && rect.bottom <= window.innerHeight + NEAR_BOTTOM_PX)
      return loadNextPageIfNeeded();
    if (scrollParent) {
      const near2 =
        scrollParent.scrollTop + scrollParent.clientHeight >=
        scrollParent.scrollHeight - NEAR_BOTTOM_PX;
      if (near2) return loadNextPageIfNeeded();
    }
  };
  holder?.addEventListener("scroll", onScrollGeneric, { passive: true });
  scrollParent?.addEventListener("scroll", onScrollGeneric, { passive: true });
  window.addEventListener("scroll", onScrollGeneric, { passive: true });
}

/* ===== Polling fallback ===== */
function startPolling() {
  if (pollerId) clearInterval(pollerId);
  pollerId = setInterval(() => {
    if (!table || loading || !hasMore) return;
    const holder = getTableHolder();
    const root = getTableRoot();
    const mount = document.getElementById(UI.tableMount);

    let near = false;
    if (holder)
      near =
        near ||
        holder.scrollTop + holder.clientHeight >=
          holder.scrollHeight - NEAR_BOTTOM_PX;
    const rect = (root || mount)?.getBoundingClientRect?.();
    if (rect) near = near || rect.bottom <= window.innerHeight + NEAR_BOTTOM_PX;

    if (near) loadNextPageIfNeeded();
  }, POLLING_INTERVAL_MS);
}

/* ===== Search & Add ===== */
function bindSearch() {
  const box = els[UI.q];
  if (!box) return;
  let t;
  box.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => resetAndLoadFirst(box.value), 300);
  });
}
function bindAdd() {
  const btn = els[UI.btnAdd];
  if (!btn) return;
  btn.addEventListener("click", addBlankRow);
}

/* ===== Boot ===== */
document.addEventListener("DOMContentLoaded", () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  injectStylesOnce();
  initTable();
  bindSearch();
  bindAdd();
});
