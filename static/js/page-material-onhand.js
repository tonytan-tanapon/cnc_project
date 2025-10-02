// /static/js/page-material-onhand.js  (fixed: wait for tableBuilt, use clearData)
import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const ENDPOINT = "/reports/materials/on-hand";
const PER_PAGE = 50;
const UI = { q: "_q", exportBtn: "_export", tableMount: "listBody" };
const NEAR_BOTTOM_PX = 60;
const FETCH_COOLDOWN_MS = 250;

/* ===== STATE ===== */
let table = null;
let tableBuilt = false;   // <-- wait until Tabulator is ready
let loading = false;
let hasMore = true;
let skip = 0;
let lastFetchAt = 0;
let currentKeyword = "";

const nowMs = () => performance?.now?.() || Date.now();
const underCooldown = () => nowMs() - lastFetchAt < FETCH_COOLDOWN_MS;
const markFetched = () => { lastFetchAt = nowMs(); };

/* ===== COLUMNS ===== */
function makeColumns(){
  return [
    { title: "No.", width: 70, headerSort: false, formatter: "rownum" },
    { title: "Material Code", field: "material_code", width: 180 },
    { title: "Name", field: "material_name", minWidth: 220, widthGrow: 3 },
    {
      title: "On Hand",
      field: "total_on_hand",
      width: 140,
      hozAlign: "right",
      formatter: (cell)=> {
        const v = Number(cell.getValue() ?? 0);
        return Number.isFinite(v) ? v.toLocaleString(undefined,{maximumFractionDigits:3}) : "";
      }
    },
  ];
}

/* ===== QUERY / FETCH ===== */
function buildQueryParams(skipVal = 0){
  const usp = new URLSearchParams();
  usp.set("limit", String(PER_PAGE));
  usp.set("skip", String(skipVal));
  if (currentKeyword) usp.set("q", currentKeyword);
  return usp.toString();
}

async function fetchPage(){
  const url = `${ENDPOINT}?${buildQueryParams(skip)}`;
  const res = await jfetch(url);
  return Array.isArray(res?.items) ? res.items : [];
}

/* ===== LOADERS ===== */
async function resetAndLoadFirst(keyword = ""){
  if (!tableBuilt) return;     // <-- guard
  loading = false;
  hasMore = true;
  skip = 0;
  currentKeyword = keyword || "";

  try{
    table.clearData();         // <-- safer than setData before built
    await loadNext();
    ensureInfiniteTriggers();
  }catch(e){
    toast(e?.message || "Load failed", false);
  }
}

async function loadNext(){
  if (!tableBuilt || loading || !hasMore) return;
  if (underCooldown()){
    await new Promise(r=>setTimeout(r, 1 + (FETCH_COOLDOWN_MS - (nowMs()-lastFetchAt))));
  }
  loading = true;

  try{
    const items = await fetchPage();
    markFetched();

    if (!items.length){
      hasMore = false;
      return;
    }
    await table.addData(items, false);
    skip += items.length;

  }catch(e){
    hasMore = false;
    toast(e?.message || "Load more failed", false);
  }finally{
    loading = false;
  }
}

/* ===== UI (scroll, search, export) ===== */
function ensureInfiniteTriggers(){
  if (ensureInfiniteTriggers._bound) return;
  ensureInfiniteTriggers._bound = true;

  const holder = document.querySelector(".tabulator-tableHolder") || document.querySelector(".tabulator-tableholder");
  const root = document.querySelector(`#${UI.tableMount}`)?.closest(".tabulator");

  const onScroll = ()=>{
    if (loading || !hasMore) return;
    if (holder && (holder.scrollTop + holder.clientHeight >= holder.scrollHeight - NEAR_BOTTOM_PX)){
      loadNext(); return;
    }
    const rect = (root || document.body).getBoundingClientRect?.();
    if (rect && rect.bottom <= window.innerHeight + NEAR_BOTTOM_PX){
      loadNext(); return;
    }
  };
  holder?.addEventListener("scroll", onScroll, { passive:true });
  window.addEventListener("scroll", onScroll, { passive:true });
}

function bindSearch(){
  const box = $(UI.q);
  if (!box) return;
  let t;
  box.addEventListener("input", ()=>{
    clearTimeout(t);
    t = setTimeout(()=> resetAndLoadFirst(box.value), 300);
  });
}

function bindExport(){
  const btn = $(UI.exportBtn);
  if (!btn) return;
  btn.addEventListener("click", async ()=>{
    try{
      const usp = new URLSearchParams();
      usp.set("export","csv");
      if (currentKeyword) usp.set("q", currentKeyword);

      const url = `${ENDPOINT}?${usp.toString()}`;
      const blob = await fetch(url).then(r=>r.blob());
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "material_on_hand.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    }catch(e){
      toast(e?.message || "Export failed", false);
    }
  });
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", ()=>{
  table = new Tabulator(`#${UI.tableMount}`, {
    layout: "fitColumns",
    height: "560px",
    columns: makeColumns(),
    placeholder: "No data",
    reactiveData: true,
    index: "material_id",
    data: [],                     // <-- set initial data in constructor
  });

  table.on("tableBuilt", () => {  // <-- wait until ready
    tableBuilt = true;
    bindSearch();
    bindExport();
    resetAndLoadFirst();
  });
});
