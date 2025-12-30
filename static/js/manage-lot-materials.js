import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

/* ---------------- GLOBAL STATE ---------------- */
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

/* ---------------- TABLES ---------------- */
let tables = { material: null, allocation: null, history: null };

/* ---------------- LOAD LOT HEADER ---------------- */
async function loadLotHeader() {
  try {
    const lot = await jfetch(ENDPOINTS.lotHeader);
    currentPartId = lot.part?.part_id ?? null;
    const summary = await jfetch(ENDPOINTS.lotSummary);

    const el = document.querySelector("#lotHeader");
    if (!el) return;

    let summaryHtml =
      Array.isArray(summary) && summary.length
        ? summary
            .map(
              (s) =>
                `${s.material_name}: <b>${(s.total_qty ?? 0).toFixed(2)} ${
                  s.qty_uom ?? ""
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
      <span>${m.name ?? ""}</span>
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
  if (!currentPartId || !material_id) return toast("Missing ID", false);
  if (partMaterials.some((m) => m.material_id === material_id))
    return toast("Material already added", true);

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

/* ---------------- AUTOCOMPLETE: ADD MATERIAL ---------------- */
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

/* ---------------- MATERIAL INVENTORY TABLE ---------------- */
function initMaterialTable() {
  tables.material = new Tabulator("#materialTable", {
    layout: "fitColumns",
    placeholder: "No material data",
    columns: [
      { title: "Material PO", field: "batch_no" },
      { title: "Material", field: "name" },
      { title: "#Available", field: "qty_available", hozAlign: "right" },
      { title: "UOM", field: "qty_uom", width: 80, hozAlign: "center" },
      {
        title: "Qty Allocate",
        field: "allocate",
        editor: "number",
        mutator: (value, data) => value ?? data.qty_available ?? 0,
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
            await loadMaterialTable();
            await loadHistoryTable();
          } catch (err) {
            toast(err?.message || "Allocation failed", false);
          }
        },
      },
    ],
  });

  loadMaterialTable();
}

async function loadMaterialTable() {
  if (!currentPartId) return;
  try {
    const allMaterials = await jfetch(ENDPOINTS.materialInventory);
    const partRes = await jfetch(`/parts/${currentPartId}/materials`);
    const partList = Array.isArray(partRes?.items)
      ? partRes.items
      : partRes || [];
    const allowedCodes = new Set(
      partList.map((m) => m.code?.trim().toLowerCase())
    );
    const filtered = allMaterials.filter(
      (r) =>
        allowedCodes.has(r.code?.trim().toLowerCase()) 
    );
    tables.material.setData(filtered);
  } catch (err) {
    console.error("❌ Failed to load filtered materials:", err);
  }
}

/* ---------------- ALLOCATION + HISTORY ---------------- */
async function loadAllocationTable() {
  console.log("get allocate")
  try {
    
    const res = await jfetch(ENDPOINTS.lotAllocations);
    console.log(res)
    tables.allocation.setData(res);
  } catch {
    toast("Failed to load allocation table", false);
  }
}

async function loadHistoryTable() {
  try {
    const res = await jfetch(ENDPOINTS.lotHistory);
    tables.history.setData(res);
  } catch {
    toast("Failed to load history", false);
  }
}

function initAllocationTable() {
  tables.allocation = new Tabulator("#allocationTable", {
    layout: "fitColumns",
    placeholder: "No allocation records",
    columns: [
      { title: "Material PO", field: "batch_no" },
      { title: "Material", field: "material_name" },
      { title: "Qty", field: "qty", hozAlign: "right" },
      { title: "UOM", field: "sty_uom", width: 80 },
      {
        title: "Action",
        formatter: () => `<a href="#" class="link link-red">Return</a>`,
        cellClick: async (e, cell) => {
          const row = cell.getRow().getData();
          // const confirmReturn = confirm(
          //   `Return ${row.qty} ${row.qty_uom} of ${row.material_name}?`
          // );
          // if (!confirmReturn) return;
          try {
            await jfetch(`/api/v1/lot-uses/return`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lot_id: Number(lotId),
                material_code: row.material_code,
                batch_no: row.batch_no,
                qty: row.qty,
              }),
            });
            toast(`↩️ Returned ${row.qty} ${row.qty_uom} of ${row.material_name}`);
            await loadAllocationTable();
            await loadLotHeader();
            await loadMaterialTable();
            await loadHistoryTable();
          } catch (err) {
            toast(err?.message || "Return failed", false);
          }
        },
      },
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

/* ---------------- INLINE ADD BATCH FORM ---------------- */
function initInlineAddBatchForm() {
  const batchNoInput = $("batchNoInput");
  const materialInput = $("materialInput");
  const qtyInput = $("qtyInput");
  const btnSave = $("btnSaveBatch");

  let selectedMaterial = null;

  const MAT_LOOKUP_URL = (q) => `/lookups/materials?q=${encodeURIComponent(q)}`;
  const fetchItems = async (q) => {
    try {
      const res = await jfetch(MAT_LOOKUP_URL(q || ""));
      return Array.isArray(res?.items) ? res.items : [];
    } catch {
      return [];
    }
  };
  const getDisplayValue = (m) => (m?.code ? `${m.name ?? ""}` : m?.name ?? "");
  const renderItem = (m) => `${m?.name ?? ""}`;
  const onSelectItem = (m) => (selectedMaterial = m || null);

  attachAutocomplete(materialInput, {
    minChars: 0,
    fetchItems,
    getDisplayValue,
    renderItem,
    onSelectItem,
  });

  materialInput.addEventListener("input", () => (selectedMaterial = null));
  materialInput.addEventListener("focus", () => {
    if (!materialInput.value)
      materialInput.dispatchEvent(new Event("input", { bubbles: true }));
  });

  btnSave?.addEventListener("click", async () => {
    const batchNo = batchNoInput.value.trim() || "AUTO";
    const qty = qtyInput.value.trim();
    const textInput = materialInput.value.trim();

    const cleanInput = textInput.split("—")[0].trim(); // 🧽 ตัดส่วนหลัง "—" ทิ้ง

    // 🧠 ถ้าไม่ได้เลือกจาก autocomplete แต่พิมพ์เอง → ค้นหาในฐานข้อมูลอีกที
    if (!selectedMaterial && cleanInput) {
      try {
        const res = await jfetch(
          `/lookups/materials?q=${encodeURIComponent(cleanInput)}`
        );
        const list = Array.isArray(res?.items) ? res.items : [];
        selectedMaterial =
          list.find((m) =>
            (m.code + " " + m.name)
              .toLowerCase()
              .includes(cleanInput.toLowerCase())
          ) || null;
      } catch (err) {
        console.warn("⚠️ Lookup failed:", err);
      }
    }

    if (!selectedMaterial) {
      toast("Please select a valid Material", false);
      return;
    }
    if (!qty || Number(qty) <= 0) {
      toast("Please enter a valid quantity", false);
      return;
    }

    const payload = {
      batch_no: batchNo,
      material_id: selectedMaterial.id,
      qty_received: String(qty),
      status: "active",
    };

    try {
      const res = await jfetch("/api/v1/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      toast(`✅ Created Materail PO ${res.batch_no || ""}`);
      batchNoInput.value = "";
      materialInput.value = "";
      qtyInput.value = "";
      selectedMaterial = null;
      await loadMaterialTable();
    } catch (err) {
      console.error("❌ Create batch failed:", err);
      toast(err?.message || "Create batch failed", false);
    }
  });
}



function makeLotLinks(lotId) {
  if (!lotId) return;

  const links = [
     {
      id: "lot_link",
      href: `/static/lot-detail.html?lot_id=${encodeURIComponent(lotId)}`,
      title: "Traveler",
    },
    {
      id: "traveler_link",
      href: `/static/traveler-detail.html?lot_id=${encodeURIComponent(lotId)}`,
      title: "Traveler",
    },
    {
      id: "material_link",
      href: `/static/manage-lot-materials.html?lot_id=${encodeURIComponent(lotId)}`,
      title: "Materials",
    },
    {
      id: "shippment_link",
      href: `/static/manage-lot-shippments.html?lot_id=${encodeURIComponent(lotId)}`,
      title: "Shipment",
    },
  ];

  links.forEach(({ id, href, title }) => {
    const el = document.getElementById(id);
    if (!el) return;

    const a = document.createElement("a");
    a.href = href;
    a.title = title;
    // a.target = "_blank";
    a.style.textDecoration = "none";
    a.style.color = "inherit";
    a.style.cursor = "pointer";

    // move existing content (icon + text) inside <a>
    while (el.firstChild) {
      a.appendChild(el.firstChild);
    }

    el.replaceWith(a);
  });
}
/* ---------------- BOOT ---------------- */
document.addEventListener("DOMContentLoaded", async () => {
  await loadLotHeader();
  await loadPartMaterials();
  initMaterialAutocomplete();
  initAllocationTable();
  initHistoryTable();
  initMaterialTable();
  await loadAllocationTable();
  await loadHistoryTable();
  initInlineAddBatchForm();

   makeLotLinks(lotId);
});
