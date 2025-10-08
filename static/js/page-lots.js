// /static/js/page-lots.js — Production Lots (manual Save/Cancel; Tabulator)
import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

/* ================== CONFIG ================== */
const JSON_HEADERS = { "Content-Type": "application/json" };
const ENDPOINTS = {
  base: "/lots",
  keyset: "/lots/keyset", // DESC: newest -> oldest, supports ?q=&cursor=&limit=
  parts: "/parts",
  pos: "/pos",
  usedMaterials: "/lots/used-materials", // supports ?lot_ids=1&lot_ids=2 or CSV
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
const nowMs = () =>
  typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
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

    // detail list of used materials
    mat_used: [],

    // manual edit state
    _dirty: false,
    _original: null,
  };
}

/* ================== ENRICH DATA ================== */
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

/* -------- Used Materials (robust with fallbacks) -------- */
let USED_MAT_AVAILABLE = true;
function toQuery(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

async function fetchLotUsedMaterialsMap(lotIds) {
  if (!USED_MAT_AVAILABLE) return {};
  if (!lotIds?.length) return {};
  const ids = lotIds.map(String);

  const tryCalls = [
    // ✅ FastAPI มาตรฐาน: ?lot_ids=1&lot_ids=2&lot_ids=3
    `${ENDPOINTS.usedMaterials}?${ids
      .map((x) => `lot_ids=${encodeURIComponent(x)}`)
      .join("&")}`,
    // CSV: ?lot_ids=1,2,3
    `${ENDPOINTS.usedMaterials}?${toQuery({ lot_ids: ids.join(",") })}`,
    // array style: ?lot_ids[]=1&lot_ids[]=2
    `${ENDPOINTS.usedMaterials}?${ids
      .map((x) => `lot_ids[]=${encodeURIComponent(x)}`)
      .join("&")}`,
    // generic: ?ids=1,2,3
    `${ENDPOINTS.usedMaterials}?${toQuery({ ids: ids.join(",") })}`,
  ];

  for (const url of tryCalls) {
    try {
      const res = await jfetch(url);
      if (res && typeof res === "object") return res;
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg.includes("404") || msg.includes("422")) continue;
      continue;
    }
  }
  USED_MAT_AVAILABLE = false;
  return {};
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

async function refreshUsedForRows(rows) {
  if (!USED_MAT_AVAILABLE) return;
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
      return items.map((p) => ({ id: p.id, po_number: p.po_number ?? "" }));
    } else {
      const res = await jfetch(
        `/pos?q=${encodeURIComponent(q)}&page=1&page_size=10`
      );
      const items = Array.isArray(res) ? res : res.items ?? [];
      return items.map((p) => ({ id: p.id, po_number: p.po_number ?? "" }));
    }
  } catch {
    return [];
  }
}

/* ================== EDIT STATE HELPERS ================== */
function snapshotRow(d) {
  return {
    id: d.id ?? null,
    lot_no: d.lot_no ?? "",
    planned_qty: Number(d.planned_qty ?? 0),
    status: d.status ?? "in_process",
    started_at: d.started_at ?? null,
    finished_at: d.finished_at ?? null,
    part_id: d.part_id ?? null,
    part_no: d.part_no ?? "",
    part_name: d.part_name ?? "",
    part_revision_id: d.part_revision_id ?? null,
    part_rev: d.part_rev ?? "",
    po_id: d.po_id ?? null,
    po_number: d.po_number ?? "",
    traveler_ids: Array.isArray(d.traveler_ids) ? [...d.traveler_ids] : [],
    mat_summary: Array.isArray(d.mat_summary) ? [...d.mat_summary] : [],
    used_qty: d.used_qty ?? 0,
    mat_used: Array.isArray(d.mat_used) ? [...d.mat_used] : [],
  };
}

function markDirty(row) {
  const d = row.getData();
  if (!d._original) d._original = snapshotRow(d);
  if (!d._dirty) row.update({ _dirty: true }, true);
}

function clearDirty(row) {
  const d = row.getData();
  if (d._dirty || d._original)
    row.update({ _dirty: false, _original: null }, true);
}

function validateRow(d) {
  if (!trim(d.lot_no)) return "Lot No cannot be empty";
  if (d.part_no && !d.part_id) return "Pick a Part from the list";
  if (d.po_number && !d.po_id) return "Pick a PO from the list";
  if (!Number.isFinite(Number(d.planned_qty))) return "Planned qty invalid";
  return null;
}

function buildPayload(d) {
  return {
    lot_no: trim(d.lot_no) || null,
    part_id: d.part_id ?? null,
    part_revision_id: d.part_revision_id ?? null,
    po_id: d.po_id ?? null,
    planned_qty: Number(d.planned_qty ?? 0),
    status: d.status || "in_process",
  };
}

async function saveRow(row) {
  const d = row.getData();
  const err = validateRow(d);
  if (err) {
    toast(err, false);
    return;
  }
  if (trim(d.part_no) && !d.part_id)
    d.part_id = (await resolvePartId(d.part_no)) || d.part_id;
  if (trim(d.po_number) && !d.po_id)
    d.po_id = (await resolvePoId(d.po_number)) || d.po_id;

  const body = buildPayload(d);
  try {
    let res;
    if (!d.id) {
      if (!body.lot_no) body.lot_no = "AUTO";
      res = await jfetch(ENDPOINTS.base, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      const norm = normalizeRow(res || d);
      row.update({ ...norm }, true);
      toast(`Created "${norm.lot_no}"`);
    } else {
      res = await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(d.id)}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      const norm = normalizeRow(res || d);
      row.update({ ...norm }, true);
      toast(`Saved "${norm.lot_no || norm.id}"`);
    }

    await refreshUsageForRows([row]);
    await refreshMaterialsForRows([row]);
    await refreshUsedForRows([row]);
    clearDirty(row);
  } catch (e) {
    toast(e?.message || "Save failed", false);
  }
}

function cancelRow(row) {
  const d = row.getData();
  if (d._original) {
    row.update({ ...d._original }, true);
  } else if (!d.id) {
    row.delete();
    return;
  }
  clearDirty(row);
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
        part_id: it.id,
        part_no: it.part_no,
        part_name: it.name || "",
        part_revision_id: it.part_revision_id ?? null,
        part_rev: it.rev || "",
      });
      success(`${it.part_no}`);
      setTimeout(() => markDirty(row), 0);
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
      markDirty(cell.getRow());
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener("input", () => {
    const row = cell.getRow();
    row.update({ part_id: null, part_revision_id: null, part_rev: "" });
    markDirty(row);
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
      row.update({ po_id: it.id, po_number: it.po_number });
      success(`${it.po_number}`);
      setTimeout(() => markDirty(row), 0);
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
      markDirty(cell.getRow());
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener("input", () => {
    const row = cell.getRow();
    row.update({ po_id: null });
    markDirty(row);
  });

  return input;
}

/* ================== ENRICH/HYDRATE LABELS (by ids) ================== */
async function ensureLabelsForRows(rows) {
  const partIds = [...new Set(rows.map((r) => r.part_id).filter(Boolean))];
  const poIds = [...new Set(rows.map((r) => r.po_id).filter(Boolean))];

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
            headers: JSON_HEADERS,
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
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
          });
          toast("Allocated successfully");
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
      width: 200,
      hozAlign: "center",
      headerSort: false,
      cssClass: "actions-cell",
      formatter: (cell) => {
        const d = cell.getRow().getData();
        if (d._dirty) {
          return `
            <div class="row-actions">
              <button class="btn-small" data-act="save">Save</button>
              <button class="btn-small" data-act="cancel">Cancel</button>
              <button class="btn-small btn-danger" data-act="del">Delete</button>
            </div>`;
        }
        return `
          <div class="row-actions">
            <a class="btn-small" href="/static/lot-detail.html?id=${encodeURIComponent(
              d.id || ""
            )}">Open</a>
            <button class="btn-small btn-danger" data-act="del">Delete</button>
          </div>`;
      },
      cellClick: async (e, cell) => {
        const row = cell.getRow();
        const target = e.target.closest("button, a");
        if (!target) return;
        const act = target.getAttribute("data-act");
        if (act === "save") {
          await saveRow(row);
          return;
        }
        if (act === "cancel") {
          cancelRow(row);
          return;
        }
        if (act === "del") {
          await deleteRow(row);
          return;
        }
      },
    },
  ];
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

  // mark dirty on any cell change
  table.on("cellEdited", (cell) => {
    const row = cell.getRow();
    markDirty(row);
  });

  table.on("tableBuilt", async () => {
    await Promise.resolve();
    resetAndLoadFirst();
  });

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
        _dirty: true,
        _original: null,
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
    next_cursor: toNum(res?.next_cursor ?? null),
    has_more: !!res?.has_more,
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
    next_cursor: toNum(res?.next_cursor ?? null),
    has_more: !!res?.has_more,
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
    await ensureLabelsForRows(rows);
    await appendRows(rows);

    cursorNext =
      res.next_cursor ?? (rows.length ? rows[rows.length - 1].id : null);
    hasMore = res.has_more && cursorNext != null;

    const justAdded = table?.getRows("visible") || table?.getRows() || [];
    await refreshUsageForRows(justAdded);
    await refreshMaterialsForRows(justAdded);
    await refreshUsedForRows(justAdded);

    if (!USED_MAT_AVAILABLE) {
      table?.hideColumn?.("mat_used");
    }
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
    await ensureLabelsForRows(rows);
    await appendRows(rows);

    const newRows = rows.map((r) => table?.getRow?.(r.id)).filter(Boolean);
    await refreshUsageForRows(newRows);
    await refreshMaterialsForRows(newRows);
    await refreshUsedForRows(newRows);

    const fallbackLast = rows.length ? rows[rows.length - 1].id : null;
    if (rows.length === 0 && Number.isFinite(minLoadedId)) {
      cursorNext = minLoadedId - 1;
      hasMore = true;
    } else {
      cursorNext =
        res.next_cursor != null ? res.next_cursor : fallbackLast ?? cursorNext;
      hasMore = res.has_more && cursorNext != null;
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
