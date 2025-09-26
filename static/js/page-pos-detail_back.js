// /static/js/page-pos-detail.js (v2)
import { $, jfetch, toast } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

const qs = new URLSearchParams(location.search);
const poId = qs.get("id"); // ถ้ามี = โหมด view/edit, ถ้าไม่มี = โหมด create

/* ---------- STATE ---------- */
let mode = poId ? "view" : "create"; // view | edit | create
let initial = null; // PO object ปัจจุบัน
let tempEdits = {}; // draft สำหรับ header
let isSubmitting = false;
let selectedCustomer = null; // {id, code, name}

// fields + labels (เหมือนโครง customers)
const FIELD_KEYS = ["po_number", "customer", "description", "created_at"];
const FIELD_LABELS = {
  po_number: "PO No.",
  customer: "Customer",
  description: "Description",
  created_at: "Created",
};
const INPUT_TYPE = { po_number: "text", description: "textarea" };

/* ---------- EL REFS ---------- */
const hintEl = $("po_hint");
const errEl = $("po_error");
const viewEl = $("po_view");
const subTitle = $("po_subTitle");
const btnEdit = $("po_btnEdit");
const btnNew = $("po_btnNew");
const btnSave = $("po_btnSave");
const btnCancel = $("po_btnCancel");
const btnDelete = $("po_btnDelete");

/* ---------- UTILS ---------- */
const safe = (s) => String(s ?? "").replaceAll("<", "&lt;");
const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleString();
};
const trim = (v) => (v == null ? "" : String(v).trim());
function setBusy(b) {
  [btnEdit, btnNew, btnSave, btnCancel, btnDelete].forEach((el) => {
    if (!el) return;
    el.disabled = !!b;
    el.setAttribute("aria-disabled", String(b));
  });
  if (hintEl) hintEl.textContent = b ? "Working…" : "";
}
function setError(msg) {
  if (!errEl) return;
  if (!msg) {
    errEl.style.display = "none";
    errEl.textContent = "";
  } else {
    errEl.style.display = "";
    errEl.textContent = msg;
  }
}

/* ---------- Customer autocomplete (เหมือนหน้า POS หลัก) ---------- */
async function searchCustomers(term) {
  const q = (term || "").trim();
  try {
    if (!q) {
      // first 10
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
function buildCustomerInput(current) {
  const input = document.createElement("input");
  input.className = "kv-input";
  input.dataset.field = "customer";
  input.placeholder = "Type to search…";
  input.autocomplete = "off";
  input.value = current?.code ? `${current.code} — ${current.name ?? ""}` : "";

  selectedCustomer = current?.id
    ? { id: current.id, code: current.code ?? "", name: current.name ?? "" }
    : null;

  attachAutocomplete(input, {
    fetchItems: searchCustomers,
    getDisplayValue: (it) => (it ? `${it.code} — ${it.name}` : ""),
    renderItem: (it) =>
      `<div class="ac-row"><b>${it.code}</b> — ${it.name}</div>`,
    onPick: (it) => {
      selectedCustomer = it || null;
      input.value = it ? `${it.code} — ${it.name}` : "";
    },
    openOnFocus: true,
    minChars: 0,
    debounceMs: 200,
    maxHeight: 260,
  });

  input.addEventListener("input", () => {
    selectedCustomer = null;
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdits();
    }
  });
  return input;
}

/* ---------- HEADER RENDER ---------- */
function primeEdits(base) {
  return {
    po_number: base?.po_number ?? "",
    customer: base?.customer
      ? {
          id: base.customer.id,
          code: base.customer.code,
          name: base.customer.name,
        }
      : null,
    description: base?.description ?? "",
    created_at: base?.created_at ?? null,
  };
}
function getWorkingData() {
  const base = mode === "create" ? {} : initial ?? {};
  return { ...base, ...tempEdits };
}
function focusField(key) {
  const el = viewEl?.querySelector(
    `.kv-input[data-field="${CSS.escape(key)}"]`
  );
  el?.focus();
}
function applyMode(nextMode) {
  if (nextMode) mode = nextMode;
  renderHeader(getWorkingData());
}
function renderHeader(data = {}) {
  if (!viewEl) return;

  const empty = !data || (Object.keys(data).length === 0 && mode !== "create");
  if (empty) {
    viewEl.innerHTML = `<div class="muted">No PO selected</div>`;
    return;
  }

  const editing = mode === "edit" || mode === "create";
  const pick = (k, def = "") =>
    Object.prototype.hasOwnProperty.call(tempEdits, k)
      ? tempEdits[k]
      : data[k] ?? def;

  const rows = FIELD_KEYS.map((key) => {
    const label = FIELD_LABELS[key];
    const cur = pick(key, null);

    let valHtml = "";
    if (!editing) {
      if (key === "customer") {
        valHtml = cur
          ? `${safe(cur.code ?? "")} — ${safe(cur.name ?? "")}`
          : "—";
      } else if (key === "created_at") {
        valHtml = fmtDate(cur);
      } else {
        const text = trim(cur ?? "");
        valHtml = text === "" ? "—" : safe(text);
      }
    } else {
      if (key === "customer") {
        valHtml = '<div data-field="customer"></div>';
      } else if (INPUT_TYPE[key] === "textarea") {
        valHtml = `<textarea class="kv-input" data-field="${key}" rows="3">${safe(
          cur ?? ""
        )}</textarea>`;
      } else if (key === "created_at") {
        valHtml = fmtDate(cur) || "—";
      } else {
        valHtml = `<input class="kv-input" data-field="${key}" type="${
          INPUT_TYPE[key] || "text"
        }" value="${safe(cur ?? "")}" />`;
      }
    }

    return `
      <div class="kv-row${editing ? " editing" : ""}" data-key="${key}">
        <div class="kv-key">${safe(label)}</div>
        <div class="kv-val" data-key="${key}">${valHtml}</div>
      </div>
    `;
  }).join("");

  viewEl.innerHTML = rows;

  // subtitle
  subTitle.textContent = initial?.id
    ? `#${initial.id} — ${initial.po_number ?? ""}`
    : "(new)";

  // dblclick -> edit
  viewEl.querySelectorAll(".kv-row").forEach((row) => {
    row.addEventListener("dblclick", () => {
      const key = row.dataset.key;
      if (mode === "view") {
        tempEdits = primeEdits(initial);
        applyMode("edit");
        focusField(key);
      } else {
        focusField(key);
      }
    });
  });

  if (editing) {
    // mount autocomplete for customer
    const holder = viewEl.querySelector('.kv-val[data-key="customer"]');
    if (holder) {
      holder.replaceChildren(buildCustomerInput(pick("customer", null)));
    }

    // bind text inputs
    viewEl.querySelectorAll(".kv-input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const k = e.target.dataset.field;
        tempEdits[k] = e.target.value;
      });
      input.addEventListener("keydown", (e) => {
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          e.target.tagName !== "TEXTAREA"
        ) {
          e.preventDefault();
          saveHeader();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelEdits();
        }
      });
    });
  }

  // toggle buttons
  btnSave.style.display = editing ? "" : "none";
  btnCancel.style.display = editing ? "" : "none";
  btnEdit.style.display = editing ? "none" : "";
  btnNew.style.display = editing ? "none" : "";
}

/* ---------- IO: load/save/delete header ---------- */
async function loadHeader() {
  if (!poId) {
    // create mode
    initial = null;
    tempEdits = primeEdits({});
    applyMode("create");
    return;
  }
  setBusy(true);
  setError("");
  try {
    const po = await jfetch(`/pos/${encodeURIComponent(poId)}`);
    initial = po;
    tempEdits = {};
    applyMode("view");
    document.title = `PO · ${po.po_number ?? po.id}`;
  } catch (e) {
    setError(e?.message || "Load failed");
    initial = null;
    tempEdits = {};
    applyMode("view");
  } finally {
    setBusy(false);
  }
}
function buildHeaderPayload() {
  const data = getWorkingData();
  const customer_id = selectedCustomer?.id ?? data.customer?.id ?? null;
  return {
    po_number: trim(data.po_number) || null,
    customer_id,
    description: data.description ? trim(data.description) : "",
  };
}
async function saveHeader() {
  if (isSubmitting) return;
  const payload = buildHeaderPayload();
  if (!payload.customer_id) {
    toast("Select Customer !!", false);
    focusField("customer");
    return;
  }
  setBusy(true);
  isSubmitting = true;
  try {
    if (mode === "create" || !initial?.id) {
      const created = await jfetch(`/pos`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast("PO created");
      initial = created;
      tempEdits = {};
      mode = "view";
      renderHeader(initial);
      // redirect to self with id
      location.replace(
        `/static/pos-detail.html?id=${encodeURIComponent(created.id)}`
      );
      return;
    } else {
      const updated = await jfetch(`/pos/${encodeURIComponent(initial.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      toast("Saved");
      initial = updated;
      tempEdits = {};
      mode = "view";
      renderHeader(initial);
    }
  } catch (e) {
    toast(e?.message || "Save failed", false);
  } finally {
    isSubmitting = false;
    setBusy(false);
  }
}
function cancelEdits() {
  tempEdits = {};
  mode = "view";
  renderHeader(initial || {});
}
async function deleteHeader() {
  if (!initial?.id) return;
  if (!confirm("ลบ PO นี้?\nThis action cannot be undone.")) return;
  setBusy(true);
  try {
    await jfetch(`/pos/${encodeURIComponent(initial.id)}`, {
      method: "DELETE",
    });
    toast("Deleted");
    location.href = "/static/pos.html";
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  } finally {
    setBusy(false);
  }
}

/* ---------- LINES (นำมาจากสคริปต์เดิม ปรับ id ให้ตรง) ---------- */
let poLines = [];
let editingLineId = null; // 'new' | number
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

async function loadLines() {
  if (!initial?.id && !poId) return; // create mode ยังไม่มีบรรทัด
  const id = initial?.id ?? poId;
  try {
    const rows = await jfetch(`/pos/${encodeURIComponent(id)}/lines`);
    poLines = rows || [];
    renderLines();
  } catch (e) {
    poLines = [];
    renderLines();
  }
}
function renderLines() {
  const tb = $("tblLinesBody");
  if (!tb) return;

  const rows =
    editingLineId === "new"
      ? [{ __isNew: true, id: null }].concat(poLines)
      : poLines.slice();

  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="8" class="empty">No lines</td></tr>`;
    return;
  }

  tb.innerHTML = rows
    .map((row, idxInRows) => {
      const displayNo = row.__isNew
        ? ""
        : editingLineId === "new"
        ? idxInRows
        : idxInRows + 1;
      const isEdit =
        editingLineId === row.id || (row.__isNew && editingLineId === "new");

      if (!isEdit) {
        const qty = fmtQty(row.qty);
        const price = fmtMoney(row.unit_price);
        const due = row.due_date ?? "";
        const partId = row.part?.id ?? row.part_id ?? null;
        const partNo = row.part?.part_no ?? row.part_id ?? "";

        const revText =
          row.revision?.rev ?? row.rev?.rev ?? row.revision_id ?? "";
        const note = row.note ?? row.notes ?? "";

        return `
      <tr data-id="${row.id}">
        <td style="text-align:right">${safe(String(displayNo))}</td>
        <td>${
          partId
            ? `<a href="/static/part-detail.html?id=${encodeURIComponent(
                partId
              )}" class="link">${safe(String(partNo))}</a>`
            : safe(String(partNo))
        }</td>
        <td>${safe(String(revText ?? ""))}</td>
        <td style="text-align:right">${qty}</td>
        <td style="text-align:right">${price}</td>
        <td>${safe(String(due))}</td>
        <td>${safe(String(note))}</td>
        <td style="text-align:right; white-space:nowrap">
          <button class="btn ghost btn-sm" data-edit="${row.id}">Edit</button>
          <button class="btn danger btn-sm" data-del="${row.id}">Delete</button>
        </td>
      </tr>`;
      } else {
        const rid = row.__isNew ? "new" : row.id;
        const partNo = row.part?.part_no ?? "";
        const revText = row.revision?.rev ?? row.rev?.rev ?? "";
        const qty = row.qty ?? "";
        const price = row.unit_price ?? "";
        const due = row.due_date ?? "";
        const note = row.note ?? row.notes ?? "";
        const partId = row.part_id ?? row.part?.id ?? "";
        const revisionId =
          row.revision_id ?? row.revision?.id ?? row.rev?.id ?? "";

        return `
      <tr data-id="${row.id ?? ""}" data-editing="1">
        <td style="text-align:right">${safe(String(displayNo))}</td>
        <td>
          <input id="r_part_code_${rid}" value="${safe(
          partNo
        )}" placeholder="e.g. P-10001" />
          <input id="r_part_id_${rid}" type="hidden" value="${safe(
          String(partId)
        )}">
        </td>
        <td>
          <select id="r_rev_select_${rid}" disabled>
            <option value="">— Select revision —</option>
          </select>
          <input id="r_revision_id_${rid}" type="hidden" value="${safe(
          String(revisionId)
        )}">
        </td>
        <td style="text-align:right">
          <input id="r_qty_${rid}" type="number" step="1" value="${safe(
          String(qty)
        )}" style="text-align:right; width:120px">
        </td>
        <td style="text-align:right">
          <input id="r_price_${rid}" type="number" step="1" value="${safe(
          String(price)
        )}" style="text-align:right; width:140px">
        </td>
        <td><input id="r_due_${rid}" type="date" value="${safe(
          String(due)
        )}"></td>
        <td><input id="r_notes_${rid}" value="${safe(String(note))}"></td>
        <td style="text-align:right; white-space:nowrap">
          <button class="btn btn-sm" data-save="${rid}">Save</button>
          <button class="btn ghost btn-sm" data-cancel="${rid}">Cancel</button>
          ${
            row.__isNew
              ? ""
              : `<button class="btn danger btn-sm" data-del="${rid}">Delete</button>`
          }
        </td>
      </tr>`;
      }
    })
    .join("");

  tb.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => startEdit(+b.dataset.edit))
  );
  tb.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => deleteLine(+b.dataset.del))
  );
  tb.querySelectorAll("[data-save]").forEach((b) =>
    b.addEventListener("click", () => saveLineInline(b.dataset.save))
  );
  tb.querySelectorAll("[data-cancel]").forEach((b) =>
    b.addEventListener("click", cancelEdit)
  );

  if (editingLineId != null) {
    const rid = editingLineId;
    const sel = $(`r_rev_select_${rid}`);
    sel?.addEventListener("change", () => {
      $(`r_revision_id_${rid}`).value = sel.value || "";
    });

    const partInputEl = $(`r_part_code_${rid}`);
    if (partInputEl) attachRowPartAutocomplete(rid, partInputEl);

    if (rid !== "new") {
      const rowData = poLines.find((x) => x.id === Number(rid));
      const partIdCandidate = rowData?.part_id ?? rowData?.part?.id ?? null;
      const prevRevId =
        rowData?.revision_id ??
        rowData?.revision?.id ??
        rowData?.rev?.id ??
        null;
      const prevRevText = rowData?.revision?.rev ?? rowData?.rev?.rev ?? "";
      if (partIdCandidate) {
        loadRevisionsForInto(partIdCandidate, rid, {
          preferId: prevRevId,
          preferText: prevRevText,
        });
      } else {
        resetRevChoicesInto(rid);
      }
    }
  }
}
function startEdit(id) {
  if (editingLineId != null) cancelEdit();
  editingLineId = id;
  renderLines();
}
function startAddLine() {
  if (mode === "create" && !initial?.id) {
    toast("Save header first", false);
    return;
  }
  if (editingLineId != null) cancelEdit();
  editingLineId = "new";
  renderLines();
}
function cancelEdit() {
  editingLineId = null;
  renderLines();
}

async function saveLineInline(rid) {
  const isNew = rid === "new";
  const id = initial?.id ?? poId;

  const partId = numOrNull($(`r_part_id_${rid}`).value);
  const revSel = $(`r_rev_select_${rid}`);
  const revHidden = $(`r_revision_id_${rid}`);
  const revRaw = (revSel?.value || revHidden?.value || "").trim();
  const revId = numOrNull(revRaw);

  const payload = {
    part_id: partId,
    qty: numOrNull($(`r_qty_${rid}`).value),
    unit_price: numOrNull($(`r_price_${rid}`).value),
    note: strOrNull($(`r_notes_${rid}`).value),
  };

  if (!payload.part_id) {
    toast("Enter Part No", false);
    return;
  }

  const partIdForRev = revListPartId[rid];
  if (revId && partIdForRev === partId) payload.revision_id = revId;
  else if (revId && partIdForRev !== partId) {
    const hid = $(`r_revision_id_${rid}`);
    if (hid) hid.value = "";
    if (revSel) revSel.value = "";
    toast("Revision cleared: it didn’t belong to the selected part.", false);
  }

  if (payload.qty == null) delete payload.qty;
  if (payload.unit_price == null) delete payload.unit_price;
  if (payload.note == null) delete payload.note;

  try {
    if (isNew) {
      const created = await jfetch(`/pos/${encodeURIComponent(id)}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      poLines.unshift(created);
      toast("Line added");
    } else {
      const updated = await jfetch(
        `/pos/${encodeURIComponent(id)}/lines/${rid}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const idx = poLines.findIndex((x) => x.id === Number(rid));
      if (idx >= 0) poLines[idx] = updated;
      toast("Line updated");
    }
    editingLineId = null;
    renderLines();
  } catch (e) {
    const msg = String(e?.message || "").toLowerCase();
    if (
      msg.includes("revision_id does not belong") ||
      msg.includes("belongs to part")
    ) {
      const hid = $(`r_revision_id_${rid}`);
      if (hid) hid.value = "";
      if (revSel) revSel.value = "";
      toast(
        "Selected revision doesn’t belong to this part. Revision cleared — try saving again.",
        false
      );
    } else {
      toast(e?.message || "Save failed", false);
    }
  }
}
async function deleteLine(id) {
  const poid = initial?.id ?? poId;
  if (!confirm("Delete line?")) return;
  try {
    await jfetch(`/pos/${encodeURIComponent(poid)}/lines/${id}`, {
      method: "DELETE",
    });
    poLines = poLines.filter((x) => x.id !== Number(id));
    toast("Line deleted");
    renderLines();
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

/* ---- Part+Revision autocomplete utils (ยกจากสคริปต์เดิม) ---- */
let partAcBox,
  partItems = [],
  partActive = -1,
  partInput;
let currentPartRid = null;
function ensurePartBox() {
  if (partAcBox) return partAcBox;
  partAcBox = document.createElement("div");
  Object.assign(partAcBox.style, {
    position: "absolute",
    zIndex: "9999",
    minWidth: "240px",
    maxHeight: "260px",
    overflow: "auto",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    boxShadow: "0 10px 20px rgba(2,6,23,.08), 0 2px 6px rgba(2,6,23,.06)",
    display: "none",
  });
  partAcBox.className = "ac-box";
  document.body.appendChild(partAcBox);
  return partAcBox;
}
function positionPartBox(input) {
  const r = input.getBoundingClientRect();
  partAcBox.style.left = `${window.scrollX + r.left}px`;
  partAcBox.style.top = `${window.scrollY + r.bottom + 4}px`;
  partAcBox.style.width = `${r.width}px`;
}
function hidePartAc() {
  if (!partAcBox) return;
  partAcBox.style.display = "none";
  partItems = [];
  partActive = -1;
}
function setPartActive(i) {
  partActive = i;
  [...partAcBox.querySelectorAll(".ac-item")].forEach((el, idx) => {
    el.style.background = idx === partActive ? "rgba(0,0,0,.04)" : "";
  });
}
function renderPartAc(list) {
  const box = ensurePartBox();
  partItems = list || [];
  partActive = -1;
  if (!partItems.length) {
    hidePartAc();
    return;
  }
  box.innerHTML = list
    .map(
      (p, i) =>
        `<div class="ac-item" data-i="${i}" style="padding:8px 10px; cursor:pointer; display:flex; gap:8px; align-items:center"><span class="badge" style="font-size:11px">${safe(
          p.part_no
        )}</span><div style="flex:1"><div style="font-weight:600">${safe(
          p.name || ""
        )}</div></div></div>`
    )
    .join("");
  [...box.querySelectorAll(".ac-item")].forEach((el) => {
    el.addEventListener("mouseenter", () =>
      setPartActive(parseInt(el.dataset.i, 10))
    );
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (currentPartRid != null)
        choosePartForRow(currentPartRid, parseInt(el.dataset.i, 10));
    });
  });
  box.style.display = "";
  if (partInput) positionPartBox(partInput);
}
function normalizeItems(resp) {
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === "object") return resp.items || [];
  return [];
}
function debounce(fn, ms = 220) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

const fetchPartSuggest = debounce(async (term) => {
  try {
    const url =
      !term || term.trim().length === 0
        ? `/parts?page=1&per_page=10`
        : `/parts?q=${encodeURIComponent(term)}&page=1&per_page=20`;
    const resp = await jfetch(url);
    const rows = normalizeItems(resp).map((p) => ({
      id: p.id,
      part_no: (p.part_no || "").toUpperCase(),
      name: p.name || "",
    }));
    renderPartAc(rows.slice(0, 20));
  } catch {
    renderPartAc([]);
  }
}, 220);

const revFetchToken = {}; // map: rid -> running token
const revListPartId = {}; // map: rid -> part_id ล่าสุด
function attachRowPartAutocomplete(rid, input) {
  currentPartRid = rid;
  partInput = input;
  input.setAttribute("autocomplete", "off");
  input.addEventListener("input", () => {
    const term = (input.value || "").trim();
    $(`r_part_id_${rid}`).value = "";
    resetRevChoicesInto(rid);
    fetchPartSuggest(term);
    ensurePartBox();
    positionPartBox(input);
  });
  input.addEventListener("focus", () => {
    const term = (input.value || "").trim();
    fetchPartSuggest(term);
    ensurePartBox();
    positionPartBox(input);
  });
  input.addEventListener("blur", () => setTimeout(hidePartAc, 100));
  input.addEventListener("keydown", (e) => {
    if (!partAcBox || partAcBox.style.display === "none") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPartActive(Math.min(partActive + 1, partItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPartActive(Math.max(partActive - 1, 0));
    } else if (e.key === "Enter") {
      if (partActive >= 0) {
        e.preventDefault();
        choosePartForRow(rid, partActive);
      }
    } else if (e.key === "Escape") {
      hidePartAc();
    }
  });
}
async function choosePartForRow(rid, idx) {
  if (idx < 0 || idx >= partItems.length) return;
  const p = partItems[idx];
  $(`r_part_code_${rid}`).value = (p.part_no || "").toUpperCase();
  $(`r_part_id_${rid}`).value = p.id;
  const sel = $(`r_rev_select_${rid}`);
  if (sel) {
    sel.disabled = true;
    sel.innerHTML = `<option value="">Loading…</option>`;
  }
  hidePartAc();
  await loadRevisionsForInto(p.id, rid);
}
function resetRevChoicesInto(rid) {
  const sel = $(`r_rev_select_${rid}`);
  const hid = $(`r_revision_id_${rid}`);
  if (sel) {
    sel.disabled = true;
    sel.innerHTML = `<option value="">— Select revision —</option>`;
  }
  if (hid) hid.value = "";
  revListPartId[rid] = undefined;
}
async function fetchPartRevisions(partId) {
  const tries = [
    `/part-revisions?part_id=${encodeURIComponent(partId)}`,
    `/parts/${encodeURIComponent(partId)}/revisions`,
  ];
  for (const url of tries) {
    try {
      const data = await jfetch(url);
      const arr = Array.isArray(data) ? data : data?.items || [];
      if (Array.isArray(arr)) {
        const rows = arr.map((r) => ({
          id: r.id,
          rev: r.rev || r.revision || r.code || "",
          is_current: !!(r.is_current ?? r.current ?? r.active),
        }));
        if (rows.length || url.includes("/revisions")) return rows;
      }
    } catch {}
  }
  return [];
}
async function loadRevisionsForInto(partId, rid, opts = {}) {
  revFetchToken[rid] = (revFetchToken[rid] || 0) + 1;
  const my = revFetchToken[rid];
  const sel = $(`r_rev_select_${rid}`);
  const hid = $(`r_revision_id_${rid}`);
  if (!sel || !hid) return;
  sel.disabled = true;
  sel.innerHTML = `<option value="">Loading…</option>`;
  hid.value = "";
  try {
    const revs = await fetchPartRevisions(partId);
    if (my !== revFetchToken[rid]) return;
    sel.innerHTML = [`<option value="">— No revision —</option>`]
      .concat(
        revs.map((r) => `<option value="${r.id}">${safe(r.rev)}</option>`)
      )
      .join("");
    sel.disabled = false;
    revListPartId[rid] = partId;

    let chosenId = null;
    if (opts.preferId && revs.some((r) => r.id === opts.preferId))
      chosenId = String(opts.preferId);
    else if (opts.preferText) {
      const f = revs.find((r) => String(r.rev) === String(opts.preferText));
      if (f) chosenId = String(f.id);
    } else {
      const cur = revs.find((r) => r.is_current);
      if (cur) chosenId = String(cur.id);
      else if (revs[0]) chosenId = String(revs[0].id);
    }

    sel.value = chosenId ?? "";
    hid.value = sel.value || "";
  } catch {
    sel.disabled = false;
    sel.innerHTML = `<option value="">— No revision —</option>`;
    hid.value = "";
  }
}

/* ---------- helpers ---------- */
function numOrNull(v) {
  const n = Number(v);
  return isFinite(n) ? n : null;
}
function strOrNull(v) {
  v = (v ?? "").trim();
  return v ? v : null;
}

/* ---------- EVENTS ---------- */
btnEdit?.addEventListener("click", () => {
  if (!initial) return;
  tempEdits = primeEdits(initial);
  applyMode("edit");
  focusField("po_number");
});
btnNew?.addEventListener("click", () => {
  initial = null;
  tempEdits = primeEdits({});
  applyMode("create");
  focusField("po_number");
});
btnSave?.addEventListener("click", saveHeader);
btnCancel?.addEventListener("click", () => {
  tempEdits = {};
  applyMode("view");
});

btnDelete?.addEventListener("click", deleteHeader);
$("btnAddLine")?.addEventListener("click", startAddLine);

/* ---------- BOOT ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  await loadHeader();
  await loadLines();
});
