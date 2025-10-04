// /static/js/page-lots.js — Production Lots (Tabulator style like Customers)
import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

/* ================== CONFIG ================== */
// เพิ่มไว้บนสุดใกล้ ๆ CONFIG
const JSON_HEADERS = { "Content-Type": "application/json" };
const ENDPOINTS = {
  base: "/lots",
  keyset: "/lots/keyset", // DESC: newest -> oldest, supports ?q=&cursor=&limit=
  parts: "/parts",
  pos: "/pos",
  // NEW: used-materials summary per lot
  usedMaterials: "/lots/used-materials", // expects ?lot_ids=1,2,3
};
const safe = (s) => String(s ?? "").replaceAll("<", "&lt;");
const FIRST_PAGE_LIMIT = 200; // bigger first paint
const PER_PAGE = 100; // subsequent pages
const UI = { q: "_q", btnAdd: "_add", tableMount: "listBody" };
const FETCH_COOLDOWN_MS = 250;
const NEAR_BOTTOM_PX = 60;

/* ================== STATE ================== */
let els = {};
let table = null;
let cursorNext = null; // fetch id < cursorNext
let hasMore = true;
let loading = false;
let currentKeyword = "";
let loadedIds = new Set();
let minLoadedId = Infinity;
let loadVersion = 0;
let lastFetchAt = 0;

/* ================== HELPERS ================== */
const trim = (v) => (v == null ? "" : String(v).trim());
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const nowMs = () => performance?.now?.() || Date.now();
const underCooldown = () => nowMs() - lastFetchAt < FETCH_COOLDOWN_MS;
const markFetched = () => {
  lastFetchAt = nowMs();
};

/* ---------- Resolves (fallback auto-resolve by text) ---------- */
async function resolvePartId(partCodeOrName) {
  const q = trim(partCodeOrName);
  if (!q) return null;
  try {
    const res = await jfetch(`${ENDPOINTS.parts}?q=${encodeURIComponent(q)}`);
    const arr = Array.isArray(res?.items)
      ? res.items
      : Array.isArray(res)
      ? res
      : [];
    const exact = arr.find(
      (p) => (p.part_no || "").toUpperCase() === q.toUpperCase()
    );
    if (exact?.id != null) return exact.id;
    return arr.length === 1 && arr[0].id != null ? arr[0].id : null;
  } catch {
    return null;
  }
}

async function resolvePoId(text) {
  const v = trim(text);
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  try {
    const all = await jfetch(ENDPOINTS.pos);
    const arr = Array.isArray(all) ? all : [];
    const hit = arr.find(
      (p) => (p.po_number || "").toUpperCase() === v.toUpperCase()
    );
    return hit?.id ?? null;
  } catch {
    return null;
  }
}

/* ---------- Normalizer ---------- */
function normalizeRow(r) {
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

    traveler_ids: Array.isArray(r.traveler_ids) ? r.traveler_ids : [],

    // BOM summary (per part)
    mat_summary: [],

    // total consumption (all materials)
    used_qty: 0,

    // NEW: detail list of used materials (from LotMaterialUse)
    // [{ material_code, batch_no, qty, uom, supplier, po_number }]
    mat_used: [],
  };
}

/* ================== ENRICH DATA ================== */
// GET /reports/lot-consumption?lot_ids=1,2 → { "1": "35.000", "2": "0.000" }
async function fetchLotConsumptionMap(lotIds) {
  if (!lotIds?.length) return {};
  const qs = lotIds.join(",");
  try {
    const res = await jfetch(
      `/reports/lot-consumption?lot_ids=${encodeURIComponent(qs)}`
    );
    return res || {};
  } catch {
    return {};
  }
}

// GET /parts/{id}/materials → BOM array
async function fetchPartMaterialsMap(partIds) {
  const out = {};
  const uniq = [...new Set((partIds || []).filter(Boolean))];

  await Promise.all(
    uniq.map(async (pid) => {
      try {
        const res = await jfetch(`/parts/${pid}/materials`);
        const arr = Array.isArray(res)
          ? res
          : Array.isArray(res?.items)
          ? res.items
          : [];

        out[pid] = arr.map((m) => ({
          material_id: m.material_id ?? m.id ?? null,
          material_code: m.material_code ?? m.code ?? "",
          name: m.name ?? "",
          qty_per: m.qty_per ?? m.qty ?? null,
          uom: m.uom ?? null,
        }));
      } catch {
        out[pid] = [];
      }
    })
  );

  return out;
}

// NEW: GET /lots/used-materials?lot_ids=1,2 → { "1":[{material_code,batch_no,qty,uom,supplier,po_number}], ... }
async function fetchLotUsedMaterialsMap(lotIds) {
  if (!lotIds?.length) return {};
  const qs = lotIds.join(",");
  try {
    const res = await jfetch(
      `${ENDPOINTS.usedMaterials}?lot_ids=${encodeURIComponent(qs)}`
    );
    // expected object map
    return res || {};
  } catch {
    return {};
  }
}

async function refreshUsageForRows(rows) {
  const lotIds = rows.map((r) => r.getData?.().id).filter(Boolean);
  if (!lotIds.length) return;
  const consMap = await fetchLotConsumptionMap(lotIds);
  const updates = [];
  for (const id of lotIds) {
    const raw = consMap[String(id)] ?? consMap[id] ?? 0;
    const n = Number(raw);
    updates.push({ id, used_qty: Number.isFinite(n) ? n : raw });
  }
  if (updates.length) await table?.updateOrAddData(updates, "id");
}

async function refreshMaterialsForRows(rows) {
  const partIds = [
    ...new Set(rows.map((r) => r.getData?.().part_id).filter(Boolean)),
  ];
  if (!partIds.length) return;
  const matMap = await fetchPartMaterialsMap(partIds);
  const updates = rows.map((r) => {
    const d = r.getData?.() || {};
    return { id: d.id, mat_summary: matMap[d.part_id] || [] };
  });
  if (updates.length) await table?.updateOrAddData(updates, "id");
}

// NEW: refresh used-materials detail list
async function refreshUsedForRows(rows) {
  const lotIds = rows.map((r) => r.getData?.().id).filter(Boolean);
  if (!lotIds.length) return;
  const usedMap = await fetchLotUsedMaterialsMap(lotIds);
  const updates = lotIds.map((id) => ({
    id,
    mat_used: Array.isArray(usedMap?.[id])
      ? usedMap[id]
      : Array.isArray(usedMap?.[String(id)])
      ? usedMap[String(id)]
      : [],
  }));
  if (updates.length) await table?.updateOrAddData(updates, "id");
}

/* ================== AUTOCOMPLETE (fetchers) ================== */
async function fetchParts(term) {
  const q = (term || "").trim();
  try {
    if (!q) {
      const res = await jfetch(`/parts/keyset?limit=10`);
      const items = Array.isArray(res) ? res : res.items ?? [];
      return items.map((p) => ({
        id: p.id,
        part_no: p.part_no ?? p.code ?? "",
        name: p.name ?? "",
        part_revision_id: p.part_revision_id ?? p.part_revision?.id ?? null,
        rev: p.part_revision?.rev ?? p.rev ?? "",
      }));
    } else {
      const res = await jfetch(
        `/parts?q=${encodeURIComponent(q)}&page=1&page_size=10`
      );
      const items = Array.isArray(res) ? res : res.items ?? [];
      return items.map((p) => ({
        id: p.id,
        part_no: p.part_no ?? p.code ?? "",
        name: p.name ?? "",
        part_revision_id: p.part_revision_id ?? p.part_revision?.id ?? null,
        rev: p.part_revision?.rev ?? p.rev ?? "",
      }));
    }
  } catch {
    return [];
  }
}

async function fetchPOs(term) {
  const q = (term || "").trim();
  try {
    if (!q) {
      const res = await jfetch(`/pos/keyset?limit=10`);
      const items = Array.isArray(res) ? res : res.items ?? [];
      return items.map((p) => ({
        id: p.id,
        po_number: p.po_number ?? "",
      }));
    } else {
      const res = await jfetch(
        `/pos?q=${encodeURIComponent(q)}&page=1&page_size=10`
      );
      const items = Array.isArray(res) ? res : res.items ?? [];
      return items.map((p) => ({
        id: p.id,
        po_number: p.po_number ?? "",
      }));
    }
  } catch {
    return [];
  }
}

/* ================== AUTOCOMPLETE (editors) ================== */
function partEditor(cell, onRendered, success, cancel) {
  const start = String(cell.getValue() ?? "");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = start;
  input.autocomplete = "off";
  input.style.width = "100%";

  attachAutocomplete(input, {
    fetchItems: fetchParts,
    getDisplayValue: (it) =>
      it
        ? `${it.part_no}${it.name ? " — " + it.name : ""}${
            it.rev ? " (rev " + it.rev + ")" : ""
          }`
        : "",
    renderItem: (it) =>
      `<div class="ac-row"><b>${safe(it.part_no)}</b>${
        it.name ? " — " + safe(it.name) : ""
      }${it.rev ? " <em>(rev " + safe(it.rev) + ")</em>" : ""}</div>`,
    openOnFocus: true,
    minChars: 0,
    debounceMs: 200,
    maxHeight: 260,
    onPick: (it) => {
      const row = cell.getRow();
      row.update({
        po_id: it.id,
        po_number: it.po_number,
      });
      // ให้ Tabulator เห็นการเปลี่ยนค่าแน่ ๆ
      success(`${it.po_number}`);

      // บังคับ autosave อีกชั้น (กันเคส success แล้วไม่ยิง cellEdited)
      // ทำแบบ async เพื่อให้ Tabulator อัพเดตค่าเสร็จก่อน
      setTimeout(() => autosaveCell(cell), 0);
    },
  });

  onRendered(() => {
    input.focus();
    input.select();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const d = cell.getRow().getData();
      if (!d.part_id) {
        toast("Pick a part from the list", false);
        return;
      }
      success(input.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener("input", () => {
    const row = cell.getRow();
    row.update({ part_id: null, part_revision_id: null, part_rev: "" });
  });

  return input;
}

function poEditor(cell, onRendered, success, cancel) {
  const start = String(cell.getValue() ?? "");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = start;
  input.autocomplete = "off";
  input.style.width = "100%";

  attachAutocomplete(input, {
    fetchItems: fetchPOs,
    getDisplayValue: (it) => (it ? `${it.po_number}` : ""),
    renderItem: (it) =>
      `<div class="ac-row"><b>${safe(it.po_number)}</b></div>`,
    openOnFocus: true,
    minChars: 0,
    debounceMs: 200,
    maxHeight: 260,
    onPick: (it) => {
      const row = cell.getRow();
      row.update({
        po_id: it.id,
        po_number: it.po_number,
      });
      success(`${it.po_number}`);
    },
  });

  onRendered(() => {
    input.focus();
    input.select();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const d = cell.getRow().getData();
      if (!d.po_id) {
        toast("Pick a PO from the list", false);
        return;
      }
      success(input.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener("input", () => {
    const row = cell.getRow();
    row.update({ po_id: null });
  });

  return input;
}

/* ================== ENRICH/HYDRATE LABELS (by ids) ================== */
async function ensureLabelsForRows(rows) {
  const partIds = [...new Set(rows.map((r) => r.part_id).filter(Boolean))];
  const poIds = [...new Set(rows.map((r) => r.po_id).filter(Boolean))];

  // parts
  if (partIds.length) {
    try {
      const res = await jfetch(
        `/parts/lookup?ids=${encodeURIComponent(partIds.join(","))}`
      );
      const arr = Array.isArray(res) ? res : res.items ?? [];
      const byId = new Map(arr.map((p) => [p.id, p]));
      for (const r of rows) {
        if ((!r.part_no || !r.part_name) && r.part_id && byId.has(r.part_id)) {
          const p = byId.get(r.part_id);
          r.part_no = p.part_no ?? p.code ?? "";
          r.part_name = p.name ?? "";
        }
      }
    } catch {}
  }

  // pos
  if (poIds.length) {
    try {
      const res = await jfetch(
        `/pos/lookup?ids=${encodeURIComponent(poIds.join(","))}`
      );
      const arr = Array.isArray(res) ? res : res.items ?? [];
      const byId = new Map(arr.map((p) => [p.id, p]));
      for (const r of rows) {
        if (!r.po_number && r.po_id && byId.has(r.po_id)) {
          const p = byId.get(r.po_id);
          r.po_number = p.po_number ?? "";
        }
      }
    } catch {}
  }
}

/* ================== AUTOSAVE ================== */
const createInFlight = new WeakSet();
const patchTimers = new Map();
const PATCH_MS = 350;

function buildPayload(d) {
  return {
    lot_no: trim(d.lot_no) || null,
    part_id: d.part_id ?? null,
    part_revision_id: d.part_revision_id ?? null, // optional
    po_id: d.po_id ?? null,
    planned_qty: Number(d.planned_qty ?? 0),
    status: d.status || "in_process",
  };
}

async function ensureResolvedIdsForRow(d) {
  if (trim(d.part_no) && !d.part_id) {
    const pid = await resolvePartId(d.part_no);
    if (pid) d.part_id = pid;
  }
  if (trim(d.po_number) && !d.po_id) {
    const poid = await resolvePoId(d.po_number);
    if (poid) d.po_id = poid;
  }
}

async function autosaveCell(cell) {
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

  // บังคับให้เลือกจาก list เพื่อกัน false positives
  if (fld === "part_no" && d.part_id == null) {
    toast("Pick a part from the list", false);
    cell.setValue(oldVal, true);
    return;
  }
  // เผื่อกรณีผู้ใช้พิมพ์เองไม่กดเลือกจากลิสต์
  if (fld === "po_number" && d.po_number && d.po_id == null) {
    toast("Pick a PO from the list", false);
    cell.setValue(oldVal, true);
    return;
  }

  await ensureResolvedIdsForRow(d);
  const payload = buildPayload(d);

  // CREATE (no id yet)
  if (!d.id) {
    if (!payload.part_id) return; // wait until part resolved
    if (createInFlight.has(row)) return;
    createInFlight.add(row);
    try {
      const body = { ...payload };
      if (!trim(body.lot_no)) body.lot_no = "AUTO";
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        headers: JSON_HEADERS, // ✅ ใส่ header
        body: JSON.stringify(body),
      });
      const norm = normalizeRow(created || d);
      row.update({ ...norm }); // ok to replace after create
      if (norm.id != null) loadedIds.add(norm.id);
      toast(`Lot "${norm.lot_no}" created`);
    } catch (e) {
      cell.setValue(oldVal, true);
      toast(e?.message || "Create failed", false);
    } finally {
      createInFlight.delete(row);
    }
    return;
  }

  if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));
  const t = setTimeout(async () => {
    patchTimers.delete(row);
    try {
      // autosaveCell() — ส่วน PATCH
      const updated = await jfetch(
        `${ENDPOINTS.base}/${encodeURIComponent(d.id)}`,
        {
          method: "PATCH",
          headers: JSON_HEADERS, // ✅ ใส่ header
          body: JSON.stringify(payload),
        }
      );

      const norm = normalizeRow(updated || d);
      const fields = [
        "lot_no",
        "planned_qty",
        "status",
        "part_id",
        "part_no",
        "part_name",
        "part_revision_id",
        "part_rev",
        "po_id",
        "po_number",
        "started_at",
        "finished_at",
      ];
      for (const f of fields) {
        const cur = row.getData()[f];
        const nxt = norm[f];
        if (cur !== nxt) row.getCell(f)?.setValue(nxt, true);
      }
      toast(`Saved "${norm.lot_no || norm.id}"`);
    } catch (e) {
      cell.setValue(oldVal, true);
      toast(e?.message || "Save failed", false);
      try {
        const fresh = await jfetch(
          `${ENDPOINTS.base}/${encodeURIComponent(d.id)}`
        );
        const norm = normalizeRow(fresh || d);
        const fields = [
          "lot_no",
          "planned_qty",
          "status",
          "part_id",
          "part_no",
          "part_name",
          "part_revision_id",
          "part_rev",
          "po_id",
          "po_number",
          "started_at",
          "finished_at",
        ];
        for (const f of fields) row.getCell(f)?.setValue(norm[f], true);
      } catch {}
    }
  }, PATCH_MS);
  patchTimers.set(row, t);
}

/* ================== COLUMNS ================== */
function makeColumns() {
  return [
    { title: "No.", width: 60, headerSort: false, formatter: "rownum" },
    { title: "Lot No", field: "lot_no", width: 160, editor: "input" },
    {
      title: "Part No",
      field: "part_no",
      width: 160,
      editor: partEditor,
      headerTooltip: "Pick a Part (type to search)",
    },
    { title: "PO No", field: "po_number", width: 140, editor: poEditor },

    {
      title: "Material",
      field: "mat_summary",
      widthGrow: 2,
      width: 160,
      cssClass: "wrap",
      formatter: (cell) => {
        const arr = cell.getValue();
        if (!Array.isArray(arr) || !arr.length)
          return "<span class='muted'>—</span>";
        return arr
          .map((m) => {
            const code = m.material_code || `#${m.material_id ?? ""}`;
            const qty = m.qty_per ?? m.qty ?? "";
            const uom = m.uom ? ` ${m.uom}` : "";
            return `${code}${qty !== "" ? ` (${qty} per${uom})` : ""}`;
          })
          .join(", ");
      },
    },

    // NEW: Used Mat (detail from LotMaterialUse)
    {
      title: "Used Mat",
      field: "mat_used",
      widthGrow: 2,
      width: 180,
      cssClass: "wrap",
      headerTooltip:
        "Material actually consumed by this lot (from LotMaterialUse)",
      formatter: (cell) => {
        const arr = cell.getValue();
        if (!Array.isArray(arr) || !arr.length)
          return "<span class='muted'>—</span>";
        // show: CODE (BATCH:QTY UOM) and optionally supplier/PO if present
        return arr
          .map((u) => {
            const code = u.material_code || u.code || "";
            const batch = u.batch_no ? ` ${u.batch_no}` : "";
            const qty =
              u.qty != null
                ? `: ${Number(u.qty).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}${u.uom ? " " + u.uom : ""}`
                : "";
            const sup = u.supplier ? ` [${u.supplier}]` : "";
            const po = u.po_number ? ` {PO:${u.po_number}}` : "";
            return `${code}${batch}${qty}${sup}${po}`;
          })
          .join(", ");
      },
    },

    {
      title: "Used Qty",
      field: "used_qty",
      width: 110,
      hozAlign: "right",
      formatter: (cell) => {
        const v = cell.getValue();
        const n = Number(v);
        if (Number.isFinite(n))
          return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
        return (v ?? "").toString();
      },
    },

    {
      title: "Planned",
      field: "planned_qty",
      width: 110,
      hozAlign: "right",
      editor: "number",
      mutatorEdit: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0),
      formatter: (cell) =>
        Number(cell.getValue() ?? 0).toLocaleString(undefined, {
          maximumFractionDigits: 3,
        }),
    },

    {
      title: "Status",
      field: "status",
      width: 130,
      editor: "select",
      editorParams: { values: ["in_process", "completed", "hold"] },
    },

    {
      title: "Started",
      field: "started_at",
      width: 160,
      headerSort: false,
      formatter: (cell) => {
        const ts = cell.getValue();
        if (!ts) return "";
        const d = new Date(ts);
        return isNaN(d) ? String(ts) : d.toLocaleString();
      },
    },
    {
      title: "Finished",
      field: "finished_at",
      width: 160,
      headerSort: false,
      formatter: (cell) => {
        const ts = cell.getValue();
        if (!ts) return "";
        const d = new Date(ts);
        return isNaN(d) ? String(ts) : d.toLocaleString();
      },
    },

    {
      title: "Shop Traveler",
      field: "_trav",
      width: 150,
      hozAlign: "center",
      headerSort: false,
      formatter: (cell) => {
        const d = cell.getRow().getData();
        return Array.isArray(d.traveler_ids) && d.traveler_ids.length
          ? `<a class="btn-small" href="/static/traveler-detail.html?id=${encodeURIComponent(
              d.traveler_ids[0]
            )}">Open</a>`
          : `<button class="btn-small" data-act="mktrav">Create</button>`;
      },
      cellClick: async (e, cell) => {
        const d = cell.getRow().getData();
        const btn = e.target.closest("button[data-act='mktrav']");
        if (!btn) return;
        if (!d.id) return toast("Save lot first", false);
        try {
          const t = await jfetch("/travelers", {
            method: "POST",
            body: JSON.stringify({ lot_id: d.id }),
          });
          toast("Traveler created");
          if (t?.id) {
            const ids = Array.isArray(d.traveler_ids)
              ? [...d.traveler_ids, t.id]
              : [t.id];
            cell.getRow().update({ traveler_ids: ids }, true);
            location.href = `/static/traveler-detail.html?id=${encodeURIComponent(
              t.id
            )}`;
          }
        } catch (err) {
          toast(err?.message || "Create traveler failed", false);
        }
      },
    },

    {
      title: "Allocate",
      field: "_alloc",
      width: 120,
      hozAlign: "center",
      headerSort: false,
      formatter: () =>
        `<button class="btn-small" data-act="alloc">Allocate</button>`,
      cellClick: async (e, cell) => {
        const d = cell.getRow().getData();
        const btn = e.target.closest("button[data-act='alloc']");
        if (!btn) return;
        if (!d.id) return toast("Save lot first", false);
        const mat = prompt("Material code or ID…");
        if (!mat) return;
        const qty = Number(prompt("Qty…"));
        if (!Number.isFinite(qty) || qty <= 0) {
          toast("Invalid qty", false);
          return;
        }
        const asNum = Number(mat);
        const payload = { lot_id: d.id, qty };
        if (Number.isFinite(asNum) && asNum > 0) payload.material_id = asNum;
        else payload.material_code = String(mat);
        try {
          await jfetch("/lot-uses/allocate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          toast("Allocated successfully");
          // refresh totals + detail list
          await refreshUsageForRows([cell.getRow()]);
          await refreshUsedForRows([cell.getRow()]);
        } catch (err) {
          toast(err?.message || "Allocate failed", false);
        }
      },
    },

    {
      title: "Actions",
      field: "_act",
      width: 140,
      hozAlign: "center",
      headerSort: false,
      cssClass: "actions-cell",
      formatter: (cell) => `
        <div class="row-actions">
          <a class="btn-small" href="/static/lot-detail.html?id=${encodeURIComponent(
            cell.getRow().getData().id || ""
          )}">Open</a>
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

/* ================== DELETE ================== */
async function deleteRow(row) {
  const d = row.getData();
  if (!d) return;
  if (!d.id) {
    row.delete();
    return;
  }
  if (!confirm(`Delete lot "${d.lot_no || d.id}"?\nThis cannot be undone.`))
    return;
  try {
    await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(d.id)}`, {
      method: "DELETE",
    });
    row.delete();
    loadedIds.delete(d.id);
    toast("Deleted");
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

/* ================== TABLE ================== */
function initTable() {
  table = new Tabulator(`#${UI.tableMount}`, {
    layout: "fitColumns",
    height: "520px",
    columns: makeColumns(),
    placeholder: "No lots",
    reactiveData: true,
    index: "id",
    history: true,
  });

  table.on("cellEdited", autosaveCell);

  // Load only after Tabulator is fully ready
  table.on("tableBuilt", async () => {
    await Promise.resolve();
    resetAndLoadFirst();
  });

  // Infinite scroll trigger
  const onScrollGeneric = () => {
    const root = document
      .querySelector(`#${UI.tableMount}`)
      ?.closest(".tabulator");
    const holder = root?.querySelector(
      ".tabulator-tableHolder, .tabulator-tableholder"
    );
    if (!hasMore || loading) return;
    if (holder) {
      const near =
        holder.scrollTop + holder.clientHeight >=
        holder.scrollHeight - NEAR_BOTTOM_PX;
      if (near) return loadNextPageIfNeeded();
    }
    const rect = (
      root || document.getElementById(UI.tableMount)
    )?.getBoundingClientRect?.();
    if (rect && rect.bottom <= window.innerHeight + NEAR_BOTTOM_PX)
      return loadNextPageIfNeeded();
  };
  window.addEventListener("scroll", onScrollGeneric, { passive: true });
}

/* ================== SEARCH & ADD ================== */
function bindSearch() {
  const box = els[UI.q];
  if (!box) return;
  let t;
  const doSearch = () => resetAndLoadFirst((box.value || "").trim());
  box.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(doSearch, 300);
  });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSearch();
    }
  });
}

function bindAdd() {
  const btn = els[UI.btnAdd];
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const row = await table.addRow(
      {
        lot_no: "AUTO",
        part_no: "",
        part_id: null,
        part_name: "",
        po_number: "",
        po_id: null,
        planned_qty: 0,
        status: "in_process",
        started_at: null,
        finished_at: null,
        traveler_ids: [],
        mat_summary: [],
        used_qty: 0,
        mat_used: [],
      },
      true
    );
    row.getCell("part_no")?.edit(true);
  });
}

/* ================== FETCHERS (KEYSET) ================== */
async function fetchFirstPage(keyword, version) {
  if (underCooldown()) {
    await new Promise((r) =>
      setTimeout(r, Math.max(0, FETCH_COOLDOWN_MS - (nowMs() - lastFetchAt)))
    );
  }
  const usp = new URLSearchParams();
  usp.set("limit", String(FIRST_PAGE_LIMIT));
  if (keyword) usp.set("q", keyword);
  const url = `${ENDPOINTS.keyset}?${usp.toString()}`;
  const res = await jfetch(url);
  markFetched();
  if (version !== loadVersion) return null;
  return {
    items: Array.isArray(res?.items) ? res.items : [],
    nextCursor: toNum(res?.next_cursor ?? null),
    hasMore: !!res?.has_more,
  };
}

async function fetchNextPage(version) {
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
  return {
    items: Array.isArray(res?.items) ? res.items : [],
    nextCursor: toNum(res?.next_cursor ?? null),
    hasMore: !!res?.has_more,
  };
}

/* ================== APPEND & LOADERS ================== */
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
}

async function resetAndLoadFirst(keyword = "") {
  loadVersion += 1;
  const my = loadVersion;
  loading = false;
  hasMore = true;
  cursorNext = null;
  currentKeyword = keyword || "";
  loadedIds = new Set();
  minLoadedId = Infinity;

  try {
    table?.setData([]);
    table?.clearHistory?.();
  } catch {}

  try {
    loading = true;
    const res = await fetchFirstPage(currentKeyword, my);
    if (!res) return;
    let rows = res.items.map(normalizeRow);
    await ensureLabelsForRows(rows); // <-- HYDRATE
    await appendRows(rows);

    cursorNext =
      res.nextCursor ?? (rows.length ? rows[rows.length - 1].id : null);
    hasMore = res.hasMore && cursorNext != null;

    const justAdded = table?.getRows("visible") || table?.getRows() || [];
    await refreshUsageForRows(justAdded);
    await refreshMaterialsForRows(justAdded);
    await refreshUsedForRows(justAdded); // NEW
  } catch (e) {
    toast(e?.message || "Load failed", false);
  } finally {
    if (my === loadVersion) loading = false;
  }
}

async function loadNextPageIfNeeded() {
  if (!hasMore || loading) return;
  const my = loadVersion;
  if (underCooldown()) return;
  loading = true;
  try {
    const res = await fetchNextPage(my);
    if (!res) return;
    let rows = res.items.map(normalizeRow);
    await ensureLabelsForRows(rows); // <-- HYDRATE
    await appendRows(rows);

    const newRows = rows.map((r) => table?.getRow?.(r.id)).filter(Boolean);
    await refreshUsageForRows(newRows);
    await refreshMaterialsForRows(newRows);
    await refreshUsedForRows(newRows); // NEW

    const fallbackLast = rows.length ? rows[rows.length - 1].id : null;
    if (rows.length === 0 && Number.isFinite(minLoadedId)) {
      cursorNext = minLoadedId - 1;
      hasMore = true;
    } else {
      cursorNext =
        res.nextCursor != null ? res.nextCursor : fallbackLast ?? cursorNext;
      hasMore = res.hasMore && cursorNext != null;
    }
  } catch (e) {
    hasMore = false;
    toast(e?.message || "Load more failed", false);
  } finally {
    if (my === loadVersion) loading = false;
  }
}

/* ================== BOOT ================== */
document.addEventListener("DOMContentLoaded", () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));

  // tiny styles for row actions
  if (!document.getElementById("lot-actions-css")) {
    const st = document.createElement("style");
    st.id = "lot-actions-css";
    st.textContent = `
      .row-actions{ display:flex; gap:6px; justify-content:center; }
      .btn-small{ font:inherit; padding:4px 8px; border:1px solid #e5e7eb; border-radius:6px; background:#f8fafc; cursor:pointer }
      .btn-small:hover{ background:#f1f5f9 }
      .btn-danger{ background:#ef4444; color:#fff; border-color:#dc2626 }
      .btn-danger:hover{ background:#dc2626 }
      .muted{ color:#9aa3b2 }
      .wrap{ white-space:normal; line-height:1.25; }
    `;
    document.head.appendChild(st);
  }

  initTable();
  bindSearch();
  bindAdd();
});
