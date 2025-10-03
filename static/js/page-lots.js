// /static/js/page-lots.js — optimized infinite scroll (keyset DESC)

import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const ENDPOINTS = {
  base: "/lots",
  keyset: "/lots/keyset",
  parts: "/parts",
  pos: "/pos",
};

const FIRST_PAGE_LIMIT = 200;   // bigger first paint
const PER_PAGE = 100;           // subsequent pages
const UI = { q: "_q", btnAdd: "_add", tableMount: "listBody" };
const DEBUG = false;

const FETCH_COOLDOWN_MS = 200;  // debounce server hits
const NEAR_BOTTOM_PX = 60;

/* ===== STATE ===== */
let els = {};
let table = null;

// keyset
let cursorNext = null;   // fetch id < cursorNext
let hasMore = true;
let loading = false;
let currentKeyword = "";

// mirrors
let loadedIds = new Set();
let minLoadedId = Infinity;
let dataStore = [];
let loadVersion = 0;

// timers & helpers
let lastFetchAt = 0;
let rAFToken = 0;

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());
const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const dbg = (...a) => DEBUG && console.debug(...a);

function nowMs(){ return performance?.now?.() || Date.now(); }
function underCooldown(){ return nowMs() - lastFetchAt < FETCH_COOLDOWN_MS; }
function markFetched(){ lastFetchAt = nowMs(); }
function raf(fn){ return new Promise(res => requestAnimationFrame(() => res(fn()))); }

function throttleForceCheck(){
  if (rAFToken) return;
  rAFToken = requestAnimationFrame(() => {
    rAFToken = 0;
    window.dispatchEvent(new Event("scroll"));
  });
}

/* ===== Lookup helpers ===== */
async function resolvePartId(partCodeOrName){
  const q = trim(partCodeOrName);
  if (!q) return null;
  try{
    const res = await jfetch(`${ENDPOINTS.parts}?q=${encodeURIComponent(q)}`);
    const arr = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
    const exact = arr.find(p => (p.part_no || "").toUpperCase() === q.toUpperCase());
    return (exact?.id != null) ? exact.id : (arr.length === 1 ? arr[0].id : null);
  }catch{ return null; }
}
async function resolvePoId(t){
  const v = trim(t);
  if (!v) return null;
  const asNum = toNum(v);
  if (asNum) return asNum;
  try{
    const all = await jfetch(ENDPOINTS.pos); // if huge, add a server lookup with ?q=
    const arr = Array.isArray(all) ? all : [];
    const hit = arr.find(p => (p.po_number || "").toUpperCase() === v.toUpperCase());
    return hit?.id ?? null;
  }catch{ return null; }
}

/* ===== Normalize row ===== */
function normalizeRow(r){
  const id = toNum(r.id);
  if (id != null && id < minLoadedId) minLoadedId = id;
  return {
    id,
    lot_no: r.lot_no ?? "",
    planned_qty: Number(r.planned_qty ?? 0),
    status: r.status ?? "in_process",
    started_at: r.started_at ?? null,
    finished_at: r.finished_at ?? null,

    part_id: r.part_id ?? r.part?.id ?? null,
    part_no: r.part?.part_no ?? "",
    part_name: r.part?.name ?? "",
    part_revision_id: r.part_revision_id ?? r.part_revision?.id ?? null,
    part_rev: r.part_revision?.rev ?? "",

    po_id: r.po_id ?? r.po?.id ?? null,
    po_number: r.po?.po_number ?? "",
  };
}

/* ===== Columns ===== */
function makeColumns(){
  return [
    { title: "No.", width: 60, headerSort:false, formatter:"rownum" },
    { title: "Lot No", field:"lot_no", width:160, editor:"input" },
    { title: "Part No", field:"part_no", width:160, editor:"input", headerTooltip: "Type exact Part No, we'll resolve to ID" },
    { title: "PO No", field:"po_number", width:140, editor:"input", headerTooltip: "Type exact PO Number (optional)" },
    { title: "Planned", field:"planned_qty", width:110, hozAlign:"right", editor:"number",
      mutatorEdit: v => Number.isFinite(Number(v)) ? Number(v) : 0,
      formatter: cell => Number(cell.getValue() ?? 0).toLocaleString(undefined,{maximumFractionDigits:3})
    },
    { title: "Status", field:"status", width:130, editor:"select",
      editorParams:{ values:["in_process","completed","hold"] }
    },
    { title:"Started", field:"started_at", width:160, headerSort:false,
      formatter: (cell)=>{
        const ts = cell.getValue();
        if(!ts) return "";
        const d = new Date(ts); if(isNaN(d)) return String(ts);
        return d.toLocaleString();
      }
    },
    { title:"Finished", field:"finished_at", width:160, headerSort:false,
      formatter: (cell)=>{
        const ts = cell.getValue();
        if(!ts) return "";
        const d = new Date(ts); if(isNaN(d)) return String(ts);
        return d.toLocaleString();
      }
    },
    { title:"Actions", field:"_act", width:140, hozAlign:"center", headerSort:false, cssClass:"actions-cell",
      formatter: (cell)=>`
        <div class="row-actions">
          <a class="btn-small" href="/static/lot-detail.html?id=${encodeURIComponent(cell.getRow().getData().id||"")}">Open</a>
          <button class="btn-small btn-danger" data-act="del">Delete</button>
        </div>`,
      cellClick: (e, cell)=>{
        const btn = e.target.closest("button[data-act='del']");
        if (!btn) return;
        deleteRow(cell.getRow());
      }
    },
  ];
}

/* ===== Loader badge ===== */
let loaderEl = null;
function ensureLoader(){
  if (loaderEl) return loaderEl;
  loaderEl = document.createElement("div");
  loaderEl.style.cssText = "text-align:center;padding:8px;color:#64748b;font-size:12px;";
  loaderEl.textContent = "Loading…";
  const holder = document.querySelector(`#${UI.tableMount} .tabulator-tableHolder, #${UI.tableMount} .tabulator-tableholder`);
  const root = document.querySelector(`#${UI.tableMount}`)?.closest(".tabulator");
  (holder || root || document.body).appendChild(loaderEl);
  return loaderEl;
}
function showLoader(on){ ensureLoader().style.display = on ? "block" : "none"; }

/* ===== Autosave ===== */
const createInFlight = new WeakSet();
const patchTimers = new Map();
const PATCH_MS = 350;

function buildPayload(row){
  return {
    lot_no: trim(row.lot_no) || null,
    part_id: row.part_id ?? null,
    part_revision_id: row.part_revision_id ?? null,
    po_id: row.po_id ?? null,
    planned_qty: Number(row.planned_qty ?? 0),
    status: row.status || "in_process",
  };
}

async function deleteRow(row){
  const d = row.getData();
  if (!d) return;
  if (!d.id){ row.delete(); return; }
  if (!confirm(`Delete lot "${d.lot_no || d.id}"?\nThis cannot be undone.`)) return;
  try{
    await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(d.id)}`, { method:"DELETE" });
    row.delete();
    loadedIds.delete(d.id);
    dataStore = dataStore.filter(x => x.id !== d.id);
    toast("Deleted");
  }catch(e){
    toast(e?.message || "Delete failed", false);
  }
}

async function ensureResolvedIdsForRow(d){
  if (trim(d.part_no) && !d.part_id){
    const pid = await resolvePartId(d.part_no);
    if (pid) d.part_id = pid;
  }
  if (trim(d.po_number) && !d.po_id){
    const poid = await resolvePoId(d.po_number);
    if (poid) d.po_id = poid;
  }
}

async function autosaveCell(cell){
  const row = cell.getRow();
  const d = row.getData();
  const fld = cell.getField();
  const newVal = cell.getValue();
  const oldVal = cell.getOldValue();

  if (fld === "lot_no" && !trim(newVal)) {
    toast("Lot No cannot be empty", false);
    cell.setValue(oldVal, true);
    return;
  }

  await ensureResolvedIdsForRow(d);
  const payload = buildPayload(d);

  if (!d.id){
    if (!payload.part_id) return; // wait until resolvable part
    if (createInFlight.has(row)) return;
    createInFlight.add(row);
    try{
      const body = { ...payload };
      if (!trim(body.lot_no)) body.lot_no = "AUTO";
      const created = await jfetch(ENDPOINTS.base, { method:"POST", body: JSON.stringify(body) });
      const norm = normalizeRow(created || d);
      row.update({ ...norm });
      if (norm.id != null) loadedIds.add(norm.id);
      toast(`Lot "${norm.lot_no}" created`);
    }catch(e){
      cell.setValue(oldVal, true);
      toast(e?.message || "Create failed", false);
    }finally{
      createInFlight.delete(row);
    }
    return;
  }

  if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));
  const t = setTimeout(async ()=>{
    patchTimers.delete(row);
    try{
      const updated = await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(d.id)}`, {
        method:"PATCH",
        body: JSON.stringify(payload),
      });
      const norm = normalizeRow(updated || d);
      const fields = [
        "lot_no","planned_qty","status","part_id","part_no","part_name",
        "part_revision_id","part_rev","po_id","po_number","started_at","finished_at"
      ];
      for (const f of fields){
        const cur = row.getData()[f];
        const nxt = norm[f];
        if (cur !== nxt) row.getCell(f)?.setValue(nxt, true);
      }
      toast(`Saved "${norm.lot_no || norm.id}"`);
    }catch(e){
      cell.setValue(oldVal, true);
      toast(e?.message || "Save failed", false);
      try{
        const fresh = await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(d.id)}`);
        const norm = normalizeRow(fresh || d);
        const fields = [
          "lot_no","planned_qty","status","part_id","part_no","part_name",
          "part_revision_id","part_rev","po_id","po_number","started_at","finished_at"
        ];
        for (const f of fields) row.getCell(f)?.setValue(norm[f], true);
      }catch{}
    }
  }, PATCH_MS);
  patchTimers.set(row, t);
}

/* ===== Fetchers (keyset DESC) ===== */
async function fetchFirstPage(keyword, version){
  if (underCooldown()){
    await new Promise(r => setTimeout(r, Math.max(0, FETCH_COOLDOWN_MS - (nowMs()-lastFetchAt))));
  }
  const usp = new URLSearchParams();
  usp.set("limit", String(FIRST_PAGE_LIMIT));
  if (keyword) usp.set("q", keyword);
  const url = `${ENDPOINTS.keyset}?${usp.toString()}`;
  dbg("[lots:first] GET", url);
  const res = await jfetch(url);
  markFetched();
  if (version !== loadVersion) return null;
  return {
    items: Array.isArray(res?.items) ? res.items : [],
    nextCursor: toNum(res?.next_cursor ?? null),
    hasMore: !!res?.has_more,
  };
}

async function fetchNextPage(version){
  if (!hasMore || cursorNext == null) return null;
  if (underCooldown()) return null;
  const usp = new URLSearchParams();
  usp.set("limit", String(PER_PAGE));
  usp.set("cursor", String(cursorNext));
  if (currentKeyword) usp.set("q", currentKeyword);
  const url = `${ENDPOINTS.keyset}?${usp.toString()}`;
  dbg("[lots:next] GET", url);
  const res = await jfetch(url);
  markFetched();
  if (version !== loadVersion) return null;
  return {
    items: Array.isArray(res?.items) ? res.items : [],
    nextCursor: toNum(res?.next_cursor ?? null),
    hasMore: !!res?.has_more,
  };
}

/* ===== Append ===== */
async function appendRows(rows){
  if (!rows?.length) return;
  const fresh = [];
  for (const r of rows){
    if (!r.id || loadedIds.has(r.id)) continue;
    loadedIds.add(r.id);
    if (r.id < minLoadedId) minLoadedId = r.id;
    fresh.push(r);
  }
  if (!fresh.length) return;

  const prevLen = table?.getData()?.length || 0;
  await table?.addData(fresh, false);
  const afterLen = table?.getData()?.length || 0;
  if (afterLen === prevLen){
    await table?.updateOrAddData(fresh, "id");
  }
  dataStore = table?.getData() || [];
}

/* ===== Loaders ===== */
async function resetAndLoadFirst(keyword=""){
  loadVersion += 1;
  const my = loadVersion;
  loading = false;
  hasMore = true;
  cursorNext = null;
  currentKeyword = keyword || "";
  loadedIds = new Set();
  minLoadedId = Infinity;
  dataStore = [];

  try { table?.setData([]); table?.clearHistory?.(); } catch {}
  showLoader(true);

  try{
    loading = true;
    const res = await fetchFirstPage(currentKeyword, my);
    if (!res) return;
    const rows = res.items.map(normalizeRow);
    await appendRows(rows);
    cursorNext = res.nextCursor ?? (rows.length ? rows[rows.length-1].id : null);
    hasMore = res.hasMore && cursorNext != null;

    // (optional) Fill tall view quickly, but only a little
    await autofillViewport(my, 2);  // was 6
  }catch(e){
    toast(e?.message || "Load failed", false);
  }finally{
    if (my === loadVersion){ loading = false; showLoader(false); }
  }
}

async function loadNextPageIfNeeded(){
  if (!hasMore || loading) return;
  const my = loadVersion;
  if (underCooldown()) return;
  loading = true; showLoader(true);
  try{
    const res = await fetchNextPage(my);
    if (!res) return;
    const rows = res.items.map(normalizeRow);
    await appendRows(rows);
    const fallbackLast = rows.length ? rows[rows.length-1].id : null;
    if (rows.length === 0 && Number.isFinite(minLoadedId)){
      cursorNext = minLoadedId - 1;
      hasMore = true;
    }else{
      cursorNext = res.nextCursor != null ? res.nextCursor : (fallbackLast ?? cursorNext);
      hasMore = res.hasMore && cursorNext != null;
    }
  }catch(e){
    hasMore = false;
    toast(e?.message || "Load more failed", false);
  }finally{
    if (my === loadVersion){ loading = false; showLoader(false); }
  }
}

async function autofillViewport(version, maxLoops=2){
  const root = document.querySelector(`#${UI.tableMount}`)?.closest(".tabulator");
  const holder = root?.querySelector(".tabulator-tableHolder, .tabulator-tableholder");
  let loops = 0;
  const needMore = ()=>{
    if (holder && holder.scrollHeight <= holder.clientHeight + 4) return true;
    const rect = (root || document.getElementById(UI.tableMount))?.getBoundingClientRect?.();
    if (rect) return rect.bottom <= window.innerHeight + 60;
    return false;
  };
  while (version === loadVersion && hasMore && !loading && loops < maxLoops){
    if (!needMore()) break;
    await loadNextPageIfNeeded();
    loops += 1;
  }
}

/* ===== IntersectionObserver sentinel ===== */
function installSentinel(){
  const root = document.querySelector(`#${UI.tableMount}`)?.closest(".tabulator");
  const holder = root?.querySelector(".tabulator-tableHolder, .tabulator-tableholder");
  const parent = holder || document.querySelector(`#${UI.tableMount}`);
  const sentinel = document.createElement("div");
  sentinel.id = "io-sentinel";
  sentinel.style.height = "1px";
  parent.appendChild(sentinel);

  const io = new IntersectionObserver(async entries=>{
    if (!hasMore || loading) return;
    if (entries.some(e=>e.isIntersecting)) await loadNextPageIfNeeded();
  }, { root: holder || null, rootMargin: "200px" });

  io.observe(sentinel);
}

/* ===== Table ===== */
function initTable(){
  table = new Tabulator(`#${UI.tableMount}`, {
    layout:"fitColumns",
    height:"520px",
    columns: makeColumns(),
    placeholder:"No lots",
    reactiveData:true,
    index:"id",
    history:true,
  });

  // Tab navigation across editable cells
  table.on("cellEditing", (cell)=>{
    setTimeout(()=>{
      const input = cell.getElement()?.querySelector("input, textarea, [contenteditable='true']");
      if (!input) return;
      const handler = (e)=>{
        if (e.key === "Tab"){
          e.preventDefault(); e.stopPropagation();
          const row = cell.getRow();
          const tab = row.getTable();
          const fields = tab.getColumns(true)
            .map(c=>({field:c.getField(), def:c.getDefinition()}))
            .filter(c=>c.field && c.def && !!c.def.editor)
            .map(c=>c.field);
          const curIdx = fields.indexOf(cell.getField());
          if (curIdx === -1) return;
          const rows = tab.getRows();
          const rowIdx = rows.indexOf(row);
          let nextIdx = curIdx + (e.shiftKey ? -1 : +1), nextRowIdx = rowIdx;
          if (nextIdx >= fields.length){ nextIdx = 0; nextRowIdx = Math.min(rowIdx+1, rows.length-1); }
          else if (nextIdx < 0){ nextIdx = fields.length-1; nextRowIdx = Math.max(rowIdx-1, 0); }
          const targetRow = rows[nextRowIdx];
          const targetCell = targetRow?.getCell(fields[nextIdx]);
          targetCell?.edit(true);
          const inp = targetCell?.getElement()?.querySelector("input, textarea, [contenteditable='true']");
          if (inp){ const v = inp.value; inp.focus(); if (typeof v === "string") inp.setSelectionRange(v.length, v.length); }
        }
      };
      input.addEventListener("keydown", handler);
      input.addEventListener("blur", ()=>input.removeEventListener("keydown", handler), { once:true });
    },0);
  });

  table.on("cellEdited", autosaveCell);
}

/* ===== Search & Add ===== */
function bindSearch(){
  const box = els[UI.q]; if (!box) return;
  let t;
  box.addEventListener("input", ()=>{
    clearTimeout(t);
    t = setTimeout(()=> resetAndLoadFirst(box.value), 300);
  });
}

function bindAdd(){
  const btn = els[UI.btnAdd]; if (!btn) return;
  btn.addEventListener("click", async ()=>{
    const row = await table.addRow({
      lot_no: "AUTO",
      part_no: "", part_id: null, part_name: "",
      po_number: "", po_id: null,
      planned_qty: 0,
      status: "in_process",
      started_at: null, finished_at: null,
    }, true);
    row.getCell("part_no")?.edit(true);
  });
}

/* ===== Boot ===== */
document.addEventListener("DOMContentLoaded", ()=>{
  Object.values(UI).forEach(id => (els[id] = $(id)));

  if (!document.getElementById("lot-actions-css")){
    const st = document.createElement("style");
    st.id = "lot-actions-css";
    st.textContent = `
      .row-actions{ display:flex; gap:6px; justify-content:center; }
      .btn-small{ font:inherit; padding:4px 8px; border:1px solid #e5e7eb; border-radius:6px; background:#f8fafc; cursor:pointer }
      .btn-small:hover{ background:#f1f5f9 }
      .btn-danger{ background:#ef4444; color:#fff; border-color:#dc2626 }
      .btn-danger:hover{ background:#dc2626 }
    `;
    document.head.appendChild(st);
  }

  initTable();
  bindSearch();
  bindAdd();

  table.on("tableBuilt", async () => {
    await Promise.resolve();
    installSentinel();       // single trigger for loading
    resetAndLoadFirst();     // first page (big)
  });
});
