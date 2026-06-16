// /static/js/page-batch-ledger.js
import { $, jfetch, toast } from "./api.js";
let materialOptions = {};
let supplierOptions = {};
/* ===== CONFIG ===== */
const ENDPOINT = "/reports/materials/batches";
const PER_PAGE = 50;
const UI = {
  q: "_q",
  from: "_from",
  to: "_to",
  apply: "_apply",
  exportBtn: "_export",
  tableMount: "listBody",
};
const NEAR_BOTTOM_PX = 60;
const FETCH_COOLDOWN_MS = 250;

/* ===== STATE ===== */
let table = null;
let tableBuilt = false;      // <-- NEW: track when Tabulator is ready
let loading = false;
let hasMore = true;
let skip = 0;

const filt = { q: "", received_from: "", received_to: "" };

let lastFetchAt = 0;
const nowMs = () => performance?.now?.() || Date.now();
const underCooldown = () => nowMs() - lastFetchAt < FETCH_COOLDOWN_MS;
const markFetched = () => { lastFetchAt = nowMs(); };


async function loadMaterialOptions() {

  const rows =
    await jfetch("/materials/options");

  materialOptions = {};

  const dl =
    document.getElementById("materialList");

  dl.innerHTML = "";

  rows.forEach(r => {

    materialOptions[r.label] = r.value;

    const opt =
      document.createElement("option");

    opt.value = r.label;

    dl.appendChild(opt);
  });
}

async function loadSupplierOptions() {

  const rows =
    await jfetch("/suppliers/options");

  supplierOptions = {};

  const dl =
    document.getElementById("supplierList");

  dl.innerHTML = "";

  rows.forEach(r => {

    supplierOptions[r.label] = r.value;

    const opt =
      document.createElement("option");

    opt.value = r.label;

    dl.appendChild(opt);
  });
}
/* ===== COLUMNS ===== */
function makeColumns() {
  return [
    // { title: "No.", width: 70, headerSort: false, formatter: "rownum" },
    { title: "Batch No", field: "batch_no", width: 110 },

    { title: "Size", field: "size_text", width: 100 },
    { title: "Length", field: "length_text", width: 100 },
    { title: "Heat Lot", field: "heat_lot", width: 100 },


    { title: "Material", field: "material_code", width: 160 },
    { title: "Type", field: "material_type", width: 120 },

    { title: "Spec", field: "material_spec", width: 220 },
    { title: "Supplier", field: "supplier_code", width: 140 },
    // {
    //   title: "Received At",
    //   field: "received_at",
    //   width: 150,
    //   formatter: (cell) => (cell.getValue() ? new Date(cell.getValue()).toLocaleDateString() : ""),
    // },
    // { title: "Qty Received", field: "qty_received", width: 140, hozAlign: "right", formatter: (c) => numFmt(c.getValue()) },
    // { title: "Qty Used", field: "qty_used", width: 120, hozAlign: "right", formatter: (c) => numFmt(c.getValue()) },
    // { title: "Available", field: "qty_available", width: 120, hozAlign: "right", formatter: (c) => numFmt(c.getValue()) },
    { title: "Location", field: "location", width: 140 },
  ];
}
function numFmt(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 3 }) : "";
}

/* ===== QUERY ===== */
function buildQueryParams(skipVal = 0) {
  const usp = new URLSearchParams();
  usp.set("limit", String(PER_PAGE));
  usp.set("skip", String(skipVal));
  if (filt.q) usp.set("q", filt.q);
  if (filt.received_from) usp.set("received_from", filt.received_from);
  if (filt.received_to) usp.set("received_to", filt.received_to);
  return usp.toString();
}

/* ===== FETCHERS ===== */
async function fetchPage() {
  const url = `${ENDPOINT}?${buildQueryParams(skip)}`;
  const res = await jfetch(url);
  return Array.isArray(res?.items) ? res.items : [];
}

/* ===== LOADERS ===== */
async function resetAndLoadFirst() {
  if (!tableBuilt) return;              // <-- guard until ready
  loading = false;
  hasMore = true;
  skip = 0;

  try {
    table.clearData();                  // <-- safer than setData before built
    await loadNext();
    ensureInfiniteTriggers();           // create scroll listeners after build
  } catch (e) {
    toast(e?.message || "Load failed", false);
  }
}

async function loadNext() {
  if (!tableBuilt || loading || !hasMore) return;
  if (underCooldown()) {
    await new Promise((r) => setTimeout(r, 1 + (FETCH_COOLDOWN_MS - (nowMs() - lastFetchAt))));
  }
  loading = true;

  try {
    const items = await fetchPage();
    markFetched();

    if (!items.length) {
      hasMore = false;
      return;
    }
    await table.addData(items, false);
    skip += items.length;
  } catch (e) {
    hasMore = false;
    toast(e?.message || "Load more failed", false);
  } finally {
    loading = false;
  }
}

/* ===== UI BITS ===== */
function ensureInfiniteTriggers() {
  // set up once; if already attached, do nothing
  if (ensureInfiniteTriggers._bound) return;
  ensureInfiniteTriggers._bound = true;

  const holder =
    document.querySelector(".tabulator-tableHolder") ||
    document.querySelector(".tabulator-tableholder");
  const root = document.querySelector(`#${UI.tableMount}`)?.closest(".tabulator");

  const onScroll = () => {
    if (loading || !hasMore) return;
    if (holder && holder.scrollTop + holder.clientHeight >= holder.scrollHeight - NEAR_BOTTOM_PX) {
      loadNext(); return;
    }
    const rect = (root || document.body).getBoundingClientRect?.();
    if (rect && rect.bottom <= window.innerHeight + NEAR_BOTTOM_PX) {
      loadNext(); return;
    }
  };

  holder?.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
}

function bindFilters() {
  const inputQ = $(UI.q);
  const dFrom = $(UI.from);
  const dTo = $(UI.to);
  const btnApply = $(UI.apply);

  // Debounced search
  let t;
  inputQ?.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      filt.q = inputQ.value.trim();
      resetAndLoadFirst();
    }, 300);
  });

  // Apply for date range
  btnApply?.addEventListener("click", () => {
    filt.received_from = dFrom?.value || "";
    filt.received_to = dTo?.value || "";
    resetAndLoadFirst();
  });
}

function bindExport() {
  const btn = $(UI.exportBtn);
  btn?.addEventListener("click", async () => {
    try {
      const usp = new URLSearchParams();
      usp.set("export", "csv");
      if (filt.q) usp.set("q", filt.q);
      if (filt.received_from) usp.set("received_from", filt.received_from);
      if (filt.received_to) usp.set("received_to", filt.received_to);

      const url = `${ENDPOINT}?${usp.toString()}`;
      const blob = await fetch(url).then((r) => r.blob());
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "material_batch_ledger.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast(e?.message || "Export failed", false);
    }
  });
}

function bindAddPanel() {

  console.log("bindAddPanel loaded");

  const btn = document.getElementById("_add");

  console.log(btn);

  btn?.addEventListener("click", () => {

    console.log("ADD CLICKED");

    const panel =
      document.getElementById("addPanel");

    panel.style.display = "block";

  });

}


/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", async () => {

  await loadMaterialOptions();
  await loadSupplierOptions();

  // bind UI ก่อน
  bindFilters();
  bindExport();
  bindAddPanel();

  // SAVE BUTTON
  document.getElementById("_save")
    ?.addEventListener("click", async () => {

      console.log("SAVE CLICKED");

      try {

        const material_id =
          materialOptions[
          document.getElementById("_material_id").value
          ];

        const supplier_id =
          supplierOptions[
          document.getElementById("_supplier_id").value
          ];
        console.log(material_id);
        console.log(supplier_id);

        if (!material_id) {
          toast("Please select material", false);
          return;
        }

        if (!supplier_id) {
          toast("Please select supplier", false);
          return;
        }

        const payload = {
          batch_no:
            document.getElementById("_batch_no")?.value?.trim() || "",

          material_id,
          supplier_id,

          heat_lot:
            document.getElementById("_heat_lot")?.value?.trim() || "",

          size_text:
            document.getElementById("_size_text")?.value?.trim() || "",

          length_text:
            document.getElementById("_length_text")?.value?.trim() || "",

          qty_received:
            Number(
              document.getElementById("_qty_received")?.value || 0
            )
        };

        console.log(payload);

        await jfetch("/raw_batches/raw-batches", {
          method: "POST",
          body: JSON.stringify(payload)
        });
          
        toast("Saved");

        document.getElementById("addPanel").style.display = "none";

        document.getElementById("_batch_no").value = "";
        document.getElementById("_material_id").value = "";
        document.getElementById("_supplier_id").value = "";
        document.getElementById("_heat_lot").value = "";
        document.getElementById("_size_text").value = "";
        document.getElementById("_length_text").value = "";
        document.getElementById("_qty_received").value = "";
        await resetAndLoadFirst();

      } catch (e) {

        console.error("SAVE ERROR:", e);

        toast(
          e?.message || "Save failed",
          false
        );
      }
    });

  // TABLE
  table = new Tabulator(`#${UI.tableMount}`, {
    layout: "fitColumns",
    height: "600px",
    columns: makeColumns(),
    placeholder: "No data",
    reactiveData: true,
    index: "batch_id",
    data: [],
  });

  table.on("tableBuilt", () => {

    tableBuilt = true;

    resetAndLoadFirst();
  });

});