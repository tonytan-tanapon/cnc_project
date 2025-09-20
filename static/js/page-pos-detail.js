// /static/js/page-pos-detail.js (v5)
import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

const qs = new URLSearchParams(location.search);
const poIdQS = qs.get("id"); // present => view/edit, else => create

/* ---------- STATE ---------- */
let initial = null; // current PO from server
let isSubmitting = false;
let selectedCustomer = null; // {id, code, name}

let linesTable = null;

/* ---------- EL REFS ---------- */
const hintEl = $("po_hint");
const errEl = $("po_error");
const subTitle = $("po_subTitle");

const elPoNumber = $("po_po_number");
const elCustomer = $("po_customer");
const elDesc = $("po_description");
const elCreated = $("po_created");

/* ---------- UTILS ---------- */
const safe = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const fmtDate = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d) ? "—" : d.toLocaleString();
};
const trim = (v) => (v == null ? "" : String(v).trim());
function setBusy(b) {
  hintEl.textContent = b ? "Working…" : "";
}
function setError(msg) {
  errEl.style.display = msg ? "" : "none";
  errEl.textContent = msg || "";
}

/* ---------- Customer autocomplete (header) ---------- */
async function searchCustomers(term) {
  const q = (term || "").trim();
  try {
    if (!q) {
      const res0 = await jfetch(`/customers/keyset?limit=10`);
      const items0 = Array.isArray(res0) ? res0 : res0.items ?? [];
      return items0.map((x) => ({
        id: x.id,
        code: x.code ?? "",
        name: x.name ?? "",
      }));
    }
    const res = await jfetch(
      `/customers?q=${encodeURIComponent(q)}&page=1&page_size=10`
    );
    const items = Array.isArray(res) ? res : res.items ?? [];
    return items.map((x) => ({
      id: x.id,
      code: x.code ?? "",
      name: x.name ?? "",
    }));
  } catch {
    return [];
  }
}
function initCustomerAutocomplete() {
  attachAutocomplete(elCustomer, {
    fetchItems: searchCustomers,
    getDisplayValue: (it) => (it ? `${it.code} — ${it.name}` : ""),
    renderItem: (it) =>
      `<div class="ac-row"><b>${safe(it.code)}</b> — ${safe(it.name)}</div>`,
    openOnFocus: true,
    minChars: 0,
    debounceMs: 200,
    maxHeight: 260,
    onPick: async (it) => {
      selectedCustomer = it;
      elCustomer.value = `${it.code} — ${it.name}`;
      await saveHeaderField("customer_id", it.id);
    },
  });
  elCustomer.addEventListener("input", () => {
    selectedCustomer = null;
  });
}

/* ---------- Header load / autosave ---------- */
async function loadHeader() {
  if (!poIdQS) {
    initial = null;
    subTitle.textContent = "(new)";
    elPoNumber.value = "";
    elCustomer.value = "";
    elDesc.value = "";
    elCreated.textContent = "—";
    document.title = `PO · (new)`;
    return;
  }
  setBusy(true);
  setError("");
  try {
    const po = await jfetch(`/pos/${encodeURIComponent(poIdQS)}`);
    initial = po;
    subTitle.textContent = `#${po.id} — ${po.po_number ?? ""}`;
    document.title = `PO · ${po.po_number ?? po.id}`;
    elPoNumber.value = po.po_number ?? "";
    const c = po.customer || null;
    selectedCustomer = c ? { id: c.id, code: c.code, name: c.name } : null;
    elCustomer.value = c?.code ? `${c.code} — ${c.name ?? ""}` : "";
    elDesc.value = po.description ?? "";
    elCreated.textContent = fmtDate(po.created_at);
  } catch (e) {
    setError(e?.message || "Load failed");
    initial = null;
    subTitle.textContent = "—";
  } finally {
    setBusy(false);
  }
}

async function saveHeaderField(field, value) {
  // create/patch ตามสถานะ
  if (isSubmitting) return;
  try {
    isSubmitting = true;
    setBusy(true);
    if (!initial?.id) {
      // create
      const payload = {
        po_number: field === "po_number" ? trim(value) : trim(elPoNumber.value),
        customer_id:
          field === "customer_id" ? value : selectedCustomer?.id || null,
        description: field === "description" ? trim(value) : trim(elDesc.value),
      };
      if (!payload.customer_id) {
        toast("Select Customer !!", false);
        return;
      }
      const created = await jfetch(`/pos`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast("PO created");
      location.replace(
        `/static/pos-detail.html?id=${encodeURIComponent(created.id)}`
      );
      return;
    } else {
      // patch
      const patch = {};
      if (field === "po_number") patch.po_number = trim(value);
      else if (field === "customer_id") patch.customer_id = value || null;
      else if (field === "description") patch.description = trim(value);

      await jfetch(`/pos/${encodeURIComponent(initial.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      toast("Saved");
    }
  } catch (e) {
    toast(e?.message || "Save failed", false);
  } finally {
    isSubmitting = false;
    setBusy(false);
  }
}

/* autosave on blur / Enter */
function wireHeaderAutosave() {
  elPoNumber.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      elPoNumber.blur();
    }
  });
  elPoNumber.addEventListener("blur", () =>
    saveHeaderField("po_number", elPoNumber.value)
  );

  elDesc.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      elDesc.blur();
    }
  });
  elDesc.addEventListener("blur", () =>
    saveHeaderField("description", elDesc.value)
  );

  // customer: บันทึกตอน onPick ใน autocomplete -> saveHeaderField("customer_id", id)
}

/* ---------- Lines helpers ---------- */
function fmtMoney(n) {
  return n == null
    ? ""
    : Number(n).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}
function fmtQty(n) {
  return Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}
function numOrNull(v) {
  const n = Number(v);
  return isFinite(n) ? n : null;
}
function strOrNull(v) {
  v = (v ?? "").trim();
  return v || null;
}

async function resolvePart(text) {
  const t = (text || "").trim();
  if (!t) return null;
  try {
    const resp = await jfetch(
      `/parts?q=${encodeURIComponent(t)}&page=1&per_page=1`
    );
    const arr = Array.isArray(resp) ? resp : resp.items || [];
    const it = arr[0];
    if (it?.id)
      return {
        id: it.id,
        part_no: String(it.part_no || "").toUpperCase(),
        name: it.name || "",
      };
  } catch {}
  return null;
}
async function fetchRevisions(partId) {
  const tryUrls = [
    `/part-revisions?part_id=${encodeURIComponent(partId)}`,
    `/parts/${encodeURIComponent(partId)}/revisions`,
  ];
  for (const url of tryUrls) {
    try {
      const data = await jfetch(url);
      const arr = Array.isArray(data) ? data : data?.items || [];
      if (Array.isArray(arr))
        return arr.map((r) => ({
          id: r.id,
          rev: r.rev || r.revision || r.code || "",
          is_current: !!(r.is_current ?? r.current ?? r.active),
        }));
    } catch {}
  }
  return [];
}
async function resolveRevision(partId, revText) {
  if (!partId || !revText) return null;
  const revs = await fetchRevisions(partId);
  const found = revs.find((r) => String(r.rev) === String(revText));
  return found ? found.id : null;
}

function buildLinePayload(row) {
  const payload = {};
  if (row.part_id != null) payload.part_id = row.part_id;
  if (row.revision_id != null) payload.revision_id = row.revision_id;
  if (row.qty != null) payload.qty = numOrNull(row.qty);
  if (row.unit_price != null) payload.unit_price = numOrNull(row.unit_price);
  if (row.note != null) payload.note = strOrNull(row.note);
  if (row.due_date != null) payload.due_date = strOrNull(row.due_date);
  if (payload.qty == null) delete payload.qty;
  if (payload.unit_price == null) delete payload.unit_price;
  if (payload.note == null) delete payload.note;
  if (!payload.due_date) delete payload.due_date;
  return payload;
}
function normalizeServerLine(row) {
  return {
    id: row.id,
    part_id: row.part?.id ?? row.part_id ?? null,
    part_no: row.part?.part_no ?? row.part_no ?? "",
    revision_id: row.revision?.id ?? row.rev?.id ?? row.revision_id ?? null,
    revision_text: row.revision?.rev ?? row.rev?.rev ?? row.revision_text ?? "",
    qty: row.qty ?? null,
    unit_price: row.unit_price ?? null,
    due_date: row.due_date ?? "",
    note: row.note ?? row.notes ?? "",
    part: row.part ?? null,
    rev: row.rev ?? row.revision ?? null,
  };
}

/* ---------- Lines editors (built-in input + autosave) ---------- */
function partEditor(cell, onRendered, success, cancel) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.style.width = "100%";
  input.value = String(cell.getValue() ?? "");
  onRendered(() => {
    input.focus();
    input.select();
  });
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const raw = input.value.trim();
      if (!raw) {
        success("");
        return;
      }
      const found = await resolvePart(raw);
      if (!found) {
        toast("Unknown Part No", false);
        return;
      }
      const row = cell.getRow();
      row.update({
        part_id: found.id,
        part_no: found.part_no,
        revision_id: null,
        revision_text: "",
      });
      success(found.part_no);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  return input;
}
function revisionEditor(cell, onRendered, success, cancel) {
  const row = cell.getRow();
  const partId = row.getData().part_id;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.style.width = "100%";
  input.value = String(cell.getValue() ?? "");
  onRendered(() => {
    input.focus();
    input.select();
  });
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const raw = input.value.trim();
      if (!raw) {
        success("");
        row.update({ revision_id: null, revision_text: "" });
        return;
      }
      if (!partId) {
        toast("Select Part first", false);
        return;
      }
      const rid = await resolveRevision(partId, raw);
      if (!rid) {
        toast("Unknown revision for this part", false);
        return;
      }
      row.update({ revision_id: rid, revision_text: raw });
      success(raw);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  return input;
}
function partAutocompleteEditor(cell, onRendered, success, cancel) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = cell.getValue() || "";
  input.autocomplete = "off";

  // เรียก API /parts?q=...
  async function fetchParts(term) {
    const q = term.trim();
    const url = q
      ? `/parts?q=${encodeURIComponent(q)}&page=1&page_size=10`
      : `/parts?page=1&page_size=10`;
    const res = await jfetch(url);
    const items = Array.isArray(res) ? res : res.items || [];
    return items.map((p) => ({ id: p.id, part_no: p.part_no, name: p.name }));
  }

  // attachAutocomplete คือ helper ของคุณเอง
  attachAutocomplete(input, {
    fetchItems: fetchParts,
    getDisplayValue: (it) => (it ? `${it.part_no} — ${it.name}` : ""),
    renderItem: (it) => `<div><b>${it.part_no}</b> — ${it.name}</div>`,
    onPick: (it) => {
      const row = cell.getRow();
      row.update({
        part_id: it.id,
        part_no: it.part_no,
        revision_id: null, // reset rev เมื่อเปลี่ยน part
        revision_text: "",
      });
      success(it.part_no);
    },
    minChars: 0,
    openOnFocus: true,
  });

  onRendered(() => {
    input.focus();
    input.select();
  });
  return input;
}
function revisionAutocompleteEditor(cell, onRendered, success, cancel) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tabulator-editing";
  input.value = cell.getValue() || "";
  input.autocomplete = "off";

  const partId = cell.getRow().getData().part_id;
  if (!partId) {
    input.placeholder = "Select part first";
    return input;
  }

  async function fetchRevisions(term) {
    const url = `/parts/${partId}/revisions`;
    const res = await jfetch(url);
    const items = Array.isArray(res) ? res : res.items || [];
    return items.map((r) => ({
      id: r.id,
      rev: r.rev || r.code,
      is_current: r.is_current,
    }));
  }

  attachAutocomplete(input, {
    fetchItems: fetchRevisions,
    getDisplayValue: (it) => (it ? it.rev : ""),
    renderItem: (it) =>
      `<div><b>${it.rev}</b> ${it.is_current ? "(current)" : ""}</div>`,
    onPick: (it) => {
      const row = cell.getRow();
      row.update({ revision_id: it.id, revision_text: it.rev });
      success(it.rev);
    },
    minChars: 0,
    openOnFocus: true,
  });

  onRendered(() => {
    input.focus();
    input.select();
  });
  return input;
}

/* ---------- Install Tabulator (Lines) ---------- */
function initLinesTable() {
  const holder = document.getElementById("po_lines_table");
  if (!holder) return;

  let ready = false;
  const safeRedraw = () => {
    if (!ready || !holder.offsetWidth) return;
    try {
      linesTable.redraw(true);
    } catch {}
  };

  linesTable = new Tabulator(holder, {
    layout: "fitColumns",
    height: "calc(100vh - 420px)",
    placeholder: "No lines",
    selectableRows: false,
    reactiveData: true,
    index: "id",

    columns: [
      {
        title: "No.",
        field: "_rowno",
        width: 70,
        hozAlign: "right",
        headerHozAlign: "right",
        headerSort: false,
        formatter: (cell) => cell.getRow().getPosition(true),
      },
      {
        title: "Part No.",
        field: "part_no",
        width: 200,
        editor: partAutocompleteEditor,
        formatter: (cell) => {
          const d = cell.getData();
          const pid = d.part_id ?? d.part?.id ?? null;
          const pno = d.part_no ?? d.part?.part_no ?? "";
          return pid
            ? `<a class="link" href="/static/part-detail.html?id=${encodeURIComponent(
                pid
              )}">${safe(String(pno))}</a>`
            : safe(String(pno || ""));
        },
      },
      {
        title: "Revision",
        field: "revision_text",
        width: 140,
        editor: revisionAutocompleteEditor,
      },
      {
        title: "Qty",
        field: "qty",
        width: 120,
        hozAlign: "right",
        headerHozAlign: "right",
        editor: "number",
        editorParams: { step: "1" },
        formatter: (c) => fmtQty(c.getValue()),
      },
      {
        title: "Unit Price",
        field: "unit_price",
        width: 140,
        hozAlign: "right",
        headerHozAlign: "right",
        editor: "number",
        editorParams: { step: "0.01" },
        formatter: (c) => fmtMoney(c.getValue()),
      },
      { title: "Due", field: "due_date", width: 160, editor: "date" },
      { title: "Notes", field: "note", editor: "input" },
    ],

    // คลิกขวาที่แถว -> เมนูเพิ่ม/ลบ (ไม่ใช้ปุ่ม HTML)
    rowContextMenu: [
      {
        label: "➕ Add new line (top)",
        action: function (e, row) {
          linesTable.addRow(
            {
              part_no: "",
              revision_text: "",
              qty: null,
              unit_price: null,
              due_date: "",
              note: "",
            },
            true
          );
        },
      },
      {
        label: "🗑️ Delete line",
        action: async function (e, row) {
          const d = row.getData();
          if (!d.id) {
            row.delete();
            return;
          }
          if (!confirm("Delete line?\nThis action cannot be undone.")) return;
          const poid = initial?.id ?? poIdQS;
          try {
            await jfetch(`/pos/${encodeURIComponent(poid)}/lines/${d.id}`, {
              method: "DELETE",
            });
            toast("Deleted");
            row.delete();
          } catch (err) {
            toast(err?.message || "Delete failed", false);
          }
        },
      },
    ],
  });

  // built-in inline save via events (ไม่มีปุ่ม)
  linesTable.on("cellEdited", async (cell) => {
    const row = cell.getRow();
    const d = row.getData();

    // ถ้ายังไม่มี header -> สร้าง header อัตโนมัติก่อน
    if (!initial?.id && !poIdQS) {
      // บังคับให้สร้าง PO ก่อน โดยใช้ค่าปัจจุบันจากฟอร์ม
      await saveHeaderField("po_number", elPoNumber.value); // ภายใน saveHeaderField จะ create + redirect
      return;
    }

    const poid = initial?.id ?? poIdQS;
    let payload = buildLinePayload(d);

    try {
      if (!d.id) {
        // create
        const created = await jfetch(`/pos/${encodeURIComponent(poid)}/lines`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        row.update(normalizeServerLine(created));
        toast("Line added");
      } else {
        // update
        const updated = await jfetch(
          `/pos/${encodeURIComponent(poid)}/lines/${d.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        row.update(normalizeServerLine(updated));
        toast("Saved");
      }
    } catch (e) {
      const msg = String(e?.message || "").toLowerCase();
      if (
        msg.includes("revision_id does not belong") ||
        msg.includes("belongs to part")
      ) {
        row.update({ revision_id: null });
        toast(
          "Selected revision doesn’t belong to this part. Cleared revision.",
          false
        );
      } else {
        toast(e?.message || "Save failed", false);
      }
    }
  });

  linesTable.on("tableBuilt", () => {
    ready = true;
    requestAnimationFrame(safeRedraw);
    setTimeout(safeRedraw, 0);
  });
  const ro = new ResizeObserver(safeRedraw);
  ro.observe(holder);
  window.addEventListener("resize", safeRedraw);
}
// แถวใหม่มาตรฐาน (ปรับ default ได้)
function makeBlankLine() {
  return {
    part_no: "",
    revision_text: "",
    qty: null,
    unit_price: null,
    due_date: "",
    note: "",
  };
}

// ปุ่ม + Add ที่หัวตาราง
document.addEventListener("DOMContentLoaded", () => {
  const addBtn = document.getElementById("btnAddLine");
  if (!addBtn) return;
  addBtn.addEventListener("click", async () => {
    // ถ้ายังไม่มี PO (header ยังไม่ create) ให้บังคับสร้างก่อน
    if (!initial?.id && !poIdQS) {
      // ใช้ค่าที่พิมพ์ใน header ตอนนี้ไปสร้าง
      await saveHeaderField("po_number", elPoNumber.value);
      return; // saveHeaderField จะ redirect ให้เอง
    }

    // เพิ่มแถวที่ด้านบน แล้วเข้าโหมดแก้ไขคอลัมน์แรกทันที
    const row = await linesTable.addRow(makeBlankLine(), true);
    // เริ่มแก้ที่ Part No.
    const cell = row.getCell("part_no");
    if (cell) cell.edit(true);
  });
});

/* ---------- Lines IO ---------- */
async function reloadLines() {
  const id = initial?.id ?? poIdQS;
  if (!id) {
    linesTable?.setData([]);
    return;
  }
  try {
    const rows = await jfetch(`/pos/${encodeURIComponent(id)}/lines`);
    const mapped = (rows || []).map(normalizeServerLine);
    linesTable?.setData(mapped);
  } catch {
    linesTable?.setData([]);
  }
}

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  initCustomerAutocomplete();
  initLinesTable();

  await loadHeader();
  // โหลด lines หลัง header (รู้ id แล้ว)
  await reloadLines();

  wireHeaderAutosave();
});
