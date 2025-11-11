import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

let currentPartId = null;
let partMaterials = [];
let pendingSelectedMaterial = null;
const lotId = new URLSearchParams(location.search).get("lot_id");

if (!lotId) {
  toast("Missing lot_id in URL", false);
  throw new Error("Missing lot_id");
}

/* ---------------- ENDPOINTS ---------------- */
const ENDPOINTS = {
  lotHeader: `/api/v1/lot-uses/lot/${encodeURIComponent(lotId)}/header`,
  materialInventory: `/api/v1/inventory/materials`,
  allocateMaterial: `/api/v1/lot-uses/allocate`,
  lotAllocations: `/api/v1/lot-uses/${encodeURIComponent(lotId)}`,
  lotHistory: `/api/v1/lot-uses/history/${encodeURIComponent(lotId)}`,
  lotSummary: `/api/v1/lot-uses/lot/${encodeURIComponent(lotId)}/summary`,
};

let tables = { material: null, allocation: null, history: null };

/* ---------------- LOAD LOT HEADER ---------------- */
async function loadLotHeader() {
  try {
    const lot = await jfetch(ENDPOINTS.lotHeader);
    currentPartId = lot.part?.part_id ?? null;
    console.log("📦 Lot Info:", lot);
    console.log("🔧 currentPartId:", currentPartId);
    const summary = await jfetch(ENDPOINTS.lotSummary);
    console.log("📊 Lot summary:", summary);

    const el = document.querySelector("#lotHeader");
    if (!el) return;

    let summaryHtml =
      Array.isArray(summary) && summary.length
        ? summary
            .map(
              (s) =>
                `${s.material_name}: <b>${(s.total_qty ?? 0).toFixed(2)} ${
                  s.uom ?? ""
                }</b>`
            )
            .join(", ")
        : "<i>No materials allocated</i>";

    el.innerHTML = `
      <div class="lot-grid">
        <div><b>Lot No:</b> ${lot.lot_no ?? "-"}</div>
        <div><b>Part No:</b> ${lot.part?.part_no ?? "-"}</div>
        <div><b>Revision:</b> ${lot.revision ?? "-"}</div>
        <div><b>Planned Qty:</b> ${lot.planned_qty ?? "?"}</div>
        <div><b>Status:</b> ${lot.status ?? "-"}</div>
        <div><b>PO:</b> ${lot.po ?? "-"}</div>
      </div>
      <div class="lot-summary">
        <b>Allocated:</b> ${summaryHtml}
      </div>`;
  } catch (err) {
    console.error("❌ Lot header load error:", err);
    toast("Failed to load lot info", false);
  }
}

/* ---------------- LOAD MATERIALS OF PART ---------------- */
async function loadPartMaterials() {
  if (!currentPartId) {
    console.warn("⚠️ No currentPartId");
    return;
  }
  try {
    const res = await jfetch(`/parts/${currentPartId}/materials`);
    partMaterials = Array.isArray(res?.items) ? res.items : res;
    console.log("📗 Loaded part materials:", partMaterials);
    renderMaterialChips(partMaterials);
  } catch (e) {
    console.error("❌ Failed to load part materials:", e);
  }
}

function renderMaterialChips(list) {
  const wrap = document.getElementById("mat_list");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (!Array.isArray(list) || !list.length) {
    wrap.innerHTML = `<i>No materials yet.</i>`;
    return;
  }

  for (const m of list) {
    const chip = document.createElement("span");
    chip.className = "chip--pill";
    chip.innerHTML = `
      <span>${m.code ? `<strong>${m.code}</strong> — ` : ""}${
      m.name ?? ""
    }</span>
      <span class="x" data-id="${m.id}" title="Remove">×</span>
    `;
    chip.querySelector(".x").addEventListener("click", async () => {
      await deletePartMaterial(m.id, m.code);
    });
    wrap.appendChild(chip);
  }
}

/* ---------------- ADD/DELETE MATERIAL ---------------- */
async function addMaterialById(material_id) {
  if (!currentPartId || !material_id) {
    console.log("⚠️ Missing currentPartId or material_id");
    return toast("Missing ID", false);
  }

  if (partMaterials.some((m) => m.material_id === material_id)) {
    return toast("Material already added", true);
  }
  console.log("➕ currentpartID:", currentPartId);
  try {
    await jfetch(`/parts/${currentPartId}/materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ material_id }),
    });
    toast("✅ Material added", true);
    await loadPartMaterials();
  } catch (e) {
    console.error(e);
    toast("❌ Failed to add material", false);
  }
}

async function deletePartMaterial(id, code) {
  try {
    await jfetch(`/parts/${currentPartId}/materials/${id}`, {
      method: "DELETE",
    });
    toast(`🗑️ Removed ${code}`);
    await loadPartMaterials();
  } catch (e) {
    toast("Failed to remove material", false);
  }
}

/* ---------------- AUTOCOMPLETE ---------------- */
function initMaterialAutocomplete() {
  const ip = document.getElementById("mat_ac_input");
  const btn = document.getElementById("mat_add_btn");
  if (!ip || !btn) return;

  let lastItems = [];
  const MAT_LOOKUP_URL = (q) => `/lookups/materials?q=${encodeURIComponent(q)}`;

  const fetchItems = async (q) => {
    try {
      const res = await jfetch(MAT_LOOKUP_URL(q || ""));
      const items = Array.isArray(res?.items) ? res.items : [];
      lastItems = items;
      console.log("🔍 Autocomplete items:", items);
      return items;
    } catch {
      lastItems = [];
      return [];
    }
  };

  const getDisplayValue = (m) =>
    m?.code ? `${m.code} — ${m.name ?? ""}` : m?.name ?? "";
  const renderItem = (m) =>
    `${m?.code ? `<strong>${m.code}</strong> — ` : ""}${m?.name ?? ""}`;

  const onSelectItem = (m) => (pendingSelectedMaterial = m || null);

  attachAutocomplete(ip, {
    minChars: 0,
    fetchItems,
    getDisplayValue,
    renderItem,
    onSelectItem,
  });

  ip.addEventListener("focus", () => {
    if (!ip.value) ip.dispatchEvent(new Event("input", { bubbles: true }));
  });
  ip.addEventListener("input", () => (pendingSelectedMaterial = null));

  btn.addEventListener("click", async () => {
    let m = pendingSelectedMaterial;
    if (!m) {
      const q = ip.value.trim();
      if (!q) return toast("Type or pick a material first", false);
      let items = lastItems;
      if (!items?.length) items = await fetchItems(q);
      const qLower = q.toLowerCase();
      m =
        items.find((x) => getDisplayValue(x).toLowerCase() === qLower) ||
        items.find((x) => x.name?.toLowerCase() === qLower) ||
        null;
      if (!m) return toast("Pick a material from list", false);
    }
    await addMaterialById(m.id);
    ip.value = "";
    pendingSelectedMaterial = null;
  });
}

/* ---------------- MATERIAL INVENTORY ---------------- */
function initMaterialTable() {
  tables.material = new Tabulator("#materialTable", {
    ajaxURL: ENDPOINTS.materialInventory,
    layout: "fitColumns",
    placeholder: "No material data",
    columns: [
      { title: "Batch No", field: "batch_no" },
      { title: "Material", field: "name" },
      { title: "#Available", field: "qty_available", hozAlign: "right" },
      { title: "UOM", field: "uom", width: 80, hozAlign: "center" },
      {
        title: "Qty Allocate",
        field: "allocate",
        editor: "number",
        editorParams: { step: "1", min: 0 },
      },
      {
        title: "Action",
        formatter: () => `<a href="#" class="link link-green">Allocate</a>`,
        cellClick: async (e, cell) => {
          const row = cell.getRow().getData();
          const qtyValue = Number(row.allocate) || 0;
          if (qtyValue <= 0)
            return toast("⚠️ Enter valid allocation quantity", false);
          try {
            await jfetch(ENDPOINTS.allocateMaterial, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lot_id: Number(lotId),
                material_code: row.material_code || row.code,
                qty: String(qtyValue),
                strategy: "fifo",
              }),
            });
            toast(`✅ Allocated ${qtyValue} ${row.name}`);
            await loadAllocationTable();
            await loadLotHeader();
          } catch (err) {
            toast(err?.message || "Allocation failed", false);
          }
        },
      },
    ],
  });
}

/* ---------------- ALLOCATION + HISTORY ---------------- */
async function loadAllocationTable() {
  try {
    const res = await jfetch(ENDPOINTS.lotAllocations);
    tables.allocation.setData(res);
  } catch (err) {
    toast("Failed to load allocation table", false);
  }
}

async function loadHistoryTable() {
  try {
    const res = await jfetch(ENDPOINTS.lotHistory);
    tables.history.setData(res);
  } catch (err) {
    toast("Failed to load history", false);
  }
}

function initAllocationTable() {
  tables.allocation = new Tabulator("#allocationTable", {
    layout: "fitColumns",
    placeholder: "No allocation records",
    columns: [
      { title: "Batch", field: "batch_no" },
      { title: "Material", field: "material_name" },
      { title: "Qty", field: "qty", hozAlign: "right" },
      { title: "UOM", field: "uom", width: 80 },
    ],
  });
}

function initHistoryTable() {
  tables.history = new Tabulator("#historyTable", {
    layout: "fitColumns",
    placeholder: "No history records",
    columns: [
      { title: "Action", field: "action", width: 120 },
      { title: "Material", field: "material_code" },
      { title: "Batch", field: "batch_id" },
      { title: "Qty", field: "qty", hozAlign: "right" },
      {
        title: "Date",
        field: "created_at",
        formatter: (cell) => new Date(cell.getValue()).toLocaleString(),
      },
    ],
  });
}

/* ---------------- BOOT ---------------- */
document.addEventListener("DOMContentLoaded", async () => {
  await loadLotHeader();
  await loadPartMaterials();
  initMaterialAutocomplete();
  initMaterialTable();
  initAllocationTable();
  initHistoryTable();
  await loadAllocationTable();
  await loadHistoryTable();
  console.log("✅ manage-lot-materials initialized successfully");
});
