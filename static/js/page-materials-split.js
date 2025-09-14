// /static/js/page-materials-split.js
import { $, jfetch, toast } from "./api.js";
import { escapeHtml } from "./utils.js";
import { createListPager } from "./list-pager.js?v=2";

/* ---------------- CONFIG ---------------- */

const ENDPOINTS = {
  listKeyset: "/materials/keyset",
  base: "/materials",
  byId: (id) => `/materials/${encodeURIComponent(id)}`, // GET/PUT/DELETE
};

const LIST_EL_IDS = {
  inputSearch: "m_q",
  selPerPage: "m_per_page",
  btnPrevTop: "m_prev_top",
  btnNextTop: "m_next_top",
  btnPrev: "m_prev",
  btnNext: "m_next",
  pageInfo: "m_page_info",
  listBody: "m_list_body", // container แสดงรายการ
};

const CTRL_IDS = {
  btnEdit: "m_btn_edit",
  btnNew: "m_btn_new",
  btnSave: "m_btn_save",
  btnCancel: "m_btn_cancel",
  btnDelete: "m_btn_delete",
  hint: "m_hint",
  errorBox: "m_error",
  view: "m_detail",
};

const FIELD_KEYS = ["name", "code", "spec", "uom", "remark"];
const FIELD_LABELS = {
  code: "Code",
  name: "Name",
  spec: "Spec",
  uom: "UoM",
  remark: "Remark",
};
const FIELD_INPUT_TYPE = {
  name: "text",
  code: "text",
  spec: "text",
  uom: "text",
  remark: "textarea",
};

/* ---------------- STATE ---------------- */

let els = {};
let selectedId = null; // id ที่เลือกทางซ้าย
let initial = null; // material object ล่าสุด
let mode = "view"; // view | edit | create
let tempEdits = {}; // draft ทุกฟิลด์
let prevSelectedIdBeforeNew = null; // สำหรับ New→Cancel

/* ---------------- UTILS ---------------- */

const trim = (v) => (v == null ? "" : String(v).trim());
function setBusy(b) {
  [
    CTRL_IDS.btnEdit,
    CTRL_IDS.btnNew,
    CTRL_IDS.btnSave,
    CTRL_IDS.btnCancel,
    CTRL_IDS.btnDelete,
  ].forEach((id) => {
    els[id] && (els[id].disabled = b);
  });
  els[CTRL_IDS.hint] && (els[CTRL_IDS.hint].textContent = b ? "Working…" : "");
}
function setMode(next) {
  mode = next;
  const editing = mode === "edit" || mode === "create";
  els[CTRL_IDS.btnSave].style.display = editing ? "" : "none";
  els[CTRL_IDS.btnCancel].style.display = editing ? "" : "none";
  els[CTRL_IDS.btnEdit].style.display = editing ? "none" : "";
  els[CTRL_IDS.btnNew].style.display = editing ? "none" : "";
}
function getWorkingData() {
  const base = mode === "create" ? {} : initial ?? {};
  return { ...base, ...tempEdits };
}

/* ---------------- DETAIL RENDER ---------------- */

function renderKV(data = {}) {
  const holder = els[CTRL_IDS.view];
  if (!holder) return;

  const empty = !data || (Object.keys(data).length === 0 && mode !== "create");
  if (empty) {
    holder.innerHTML = `<div class="muted">Select a material on the left</div>`;
    return;
  }

  const isEditing = mode === "edit" || mode === "create";
  const rows = FIELD_KEYS.map((key) => {
    const label = FIELD_LABELS[key];
    const current = Object.prototype.hasOwnProperty.call(tempEdits, key)
      ? tempEdits[key]
      : data[key] ?? "";
    const safeText = trim(current) === "" ? "—" : escapeHtml(String(current));

    let valHtml;
    if (isEditing) {
      if (FIELD_INPUT_TYPE[key] === "textarea") {
        valHtml = `<textarea class="kv-input" data-field="${key}" rows="3">${escapeHtml(
          String(current ?? "")
        )}</textarea>`;
      } else {
        valHtml = `<input class="kv-input" data-field="${key}" type="${
          FIELD_INPUT_TYPE[key] || "text"
        }" value="${escapeHtml(String(current ?? ""))}" />`;
      }
    } else {
      valHtml = safeText;
    }

    return `
      <div class="kv-row${isEditing ? " editing" : ""}" data-key="${key}">
        <div class="kv-key">${escapeHtml(label)}</div>
        <div class="kv-val" data-key="${key}">${valHtml}</div>
      </div>
    `;
  });

  holder.innerHTML = rows.join("");

  // dblclick แถวไหน => เข้า edit ทุกฟิลด์และ focus แถวที่คลิก
  holder.querySelectorAll(".kv-row").forEach((row) => {
    row.addEventListener("dblclick", () => {
      const key = row.dataset.key;
      if (mode === "view") {
        const base = initial ?? {};
        tempEdits = FIELD_KEYS.reduce((acc, k) => {
          acc[k] = base[k] ?? "";
          return acc;
        }, {});
        setMode("edit");
        renderKV(getWorkingData());
        focusField(key);
      } else {
        focusField(key);
      }
    });
  });

  // key handlers ตอน edit/create
  if (isEditing) {
    holder.querySelectorAll(".kv-input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const k = e.target.dataset.field;
        tempEdits[k] = e.target.value;
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          saveDetail();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelEdits();
        }
      });
    });
  }
}

function focusField(key) {
  els[CTRL_IDS.view]
    ?.querySelector(`.kv-input[data-field="${CSS.escape(key)}"]`)
    ?.focus();
}

/* ---------------- LIST RENDER ---------------- */

function highlightSelected() {
  els[LIST_EL_IDS.listBody]?.querySelectorAll(".mat-item")?.forEach((n) => {
    n.classList.toggle("active", String(n.dataset.id) === String(selectedId));
  });
}

function renderList(container, rows, ctx = {}) {
  if (!container) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    container.innerHTML = `<div class="muted" style="padding:12px">No materials</div>`;
    selectedId = null;
    initial = null;
    mode = "view";
    tempEdits = {};
    renderKV({});
    setMode("view");
    document.title = "Materials · Topnotch MFG";
    return;
  }

  const rowStart = Number(ctx.rowStart || 0);

  container.innerHTML = rows
    .map((r, i) => {
      const id = r.id ?? r.material_id ?? r.materialId;
      const no = rowStart + i + 1;
      const code = escapeHtml(r.code ?? "");
      const name = escapeHtml(r.name ?? "");
      // ใช้ spec หรือ uom เป็นบรรทัดย่อย
      const sub = escapeHtml(r.spec || r.uom || "");
      return `<div class="mat-item" data-id="${id}">
        <div class="mat-no">${no}</div>
        <div class="mat-code">${code || "—"}</div>
        <div>
          <div class="mat-name">${name || "(no name)"}</div>
          <div class="mat-sub">${sub}</div>
        </div>
      </div>`;
    })
    .join("");

  container.querySelectorAll(".mat-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.id;
      if (!id || String(id) === String(selectedId)) return;
      selectMaterial(id);
    });
  });

  const idsInPage = Array.from(container.querySelectorAll(".mat-item"))
    .map((x) => x.dataset.id)
    .filter(Boolean)
    .map(String);

  if (!selectedId || !idsInPage.includes(String(selectedId))) {
    selectedId = idsInPage[0];
    highlightSelected();
    loadDetail(selectedId);
  } else {
    highlightSelected();
  }
}

/* ---------------- DATA IO ---------------- */

async function loadDetail(id) {
  setBusy(true);
  try {
    const m = await jfetch(ENDPOINTS.byId(id));
    initial = m;
    mode = "view";
    tempEdits = {};
    renderKV(m);
    setMode("view");
    document.title = `Material · ${m.name ?? m.code ?? m.id}`;
    els[CTRL_IDS.errorBox] && (els[CTRL_IDS.errorBox].style.display = "none");
  } catch (e) {
    if (els[CTRL_IDS.errorBox]) {
      els[CTRL_IDS.errorBox].style.display = "";
      els[CTRL_IDS.errorBox].textContent = e?.message || "Load failed";
    }
    initial = null;
    mode = "view";
    tempEdits = {};
    renderKV({});
    setMode("view");
  } finally {
    setBusy(false);
  }
}

function buildPayload() {
  const data = getWorkingData();
  return {
    name: trim(data.name),
    code: data.code ? String(data.code).toUpperCase() : null,
    spec: data.spec ? trim(data.spec) : null,
    uom: data.uom ? trim(data.uom) : null,
    remark: data.remark ? trim(data.remark) : null,
  };
}

async function saveDetail() {
  const payload = buildPayload();
  if (!payload.name) {
    toast("Enter Name", false);
    if (mode === "view") {
      setMode("edit");
      tempEdits = FIELD_KEYS.reduce((a, k) => {
        a[k] = initial?.[k] ?? "";
        return a;
      }, {});
    }
    renderKV(getWorkingData());
    focusField("name");
    return;
  }

  setBusy(true);
  try {
    if (mode === "create" || !selectedId) {
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast("Material created");
      selectedId = created.id ?? created.material_id ?? created.materialId;
      initial = created;
      mode = "view";
      tempEdits = {};
      renderKV(created);
      setMode("view");
      await lp.reloadFirst();
    } else {
      const updated = await jfetch(ENDPOINTS.byId(selectedId), {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      initial = updated;
      mode = "view";
      tempEdits = {};
      renderKV(updated);
      setMode("view");
      toast("Saved");
      // sync ฝั่งซ้ายเร็ว ๆ
      const node = els[LIST_EL_IDS.listBody]?.querySelector(
        `.mat-item[data-id="${CSS.escape(String(selectedId))}"]`
      );
      if (node) {
        node.querySelector(".mat-code").textContent = updated.code ?? "—";
        node.querySelector(".mat-name").textContent =
          updated.name ?? "(no name)";
        node.querySelector(".mat-sub").textContent =
          updated.spec || updated.uom || "";
      }
    }
  } catch (e) {
    toast(e?.message || "Save failed", false);
  } finally {
    setBusy(false);
  }
}

function cancelEdits() {
  tempEdits = {};
  if (mode === "create" && !initial) {
    if (prevSelectedIdBeforeNew) {
      const backId = prevSelectedIdBeforeNew;
      prevSelectedIdBeforeNew = null;
      mode = "view";
      selectMaterial(backId); // จะ loadDetail ให้อัตโนมัติ
      return;
    } else {
      renderKV({});
    }
  } else {
    renderKV(initial || {});
  }
  setMode("view");
}

async function deleteDetail() {
  if (!selectedId) return;
  if (!confirm("Delete?\nThis action cannot be undone.")) return;
  setBusy(true);
  try {
    await jfetch(ENDPOINTS.byId(selectedId), { method: "DELETE" });
    toast("Deleted");
    const node = els[LIST_EL_IDS.listBody]?.querySelector(
      `.mat-item[data-id="${CSS.escape(String(selectedId))}"]`
    );
    node?.remove();
    selectedId = null;
    initial = null;
    mode = "view";
    tempEdits = {};
    renderKV({});
    setMode("view");
    document.title = "Materials · Topnotch MFG";
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  } finally {
    setBusy(false);
  }
}

/* ---------------- SELECT LOGIC ---------------- */

async function selectMaterial(id) {
  selectedId = id;
  highlightSelected();
  await loadDetail(id);
}

/* ---------------- BOOT ---------------- */

let lp;
document.addEventListener("DOMContentLoaded", () => {
  // cache
  Object.values(LIST_EL_IDS).forEach((id) => (els[id] = $(id)));
  Object.values(CTRL_IDS).forEach((id) => (els[id] = $(id)));

  // Edit
  els[CTRL_IDS.btnEdit]?.addEventListener("click", () => {
    if (!initial) return;
    tempEdits = FIELD_KEYS.reduce((acc, k) => {
      acc[k] = initial?.[k] ?? "";
      return acc;
    }, {});
    setMode("edit");
    renderKV(getWorkingData());
    focusField("name");
  });

  // New
  els[CTRL_IDS.btnNew]?.addEventListener("click", () => {
    prevSelectedIdBeforeNew = selectedId;
    selectedId = null;
    initial = null;
    mode = "create";
    tempEdits = { name: "", code: "", spec: "", uom: "", remark: "" };
    setMode("create");
    renderKV(getWorkingData());
    focusField("name");
  });

  els[CTRL_IDS.btnSave]?.addEventListener("click", saveDetail);
  els[CTRL_IDS.btnCancel]?.addEventListener("click", cancelEdits);
  els[CTRL_IDS.btnDelete]?.addEventListener("click", deleteDetail);

  // pager
  lp = createListPager({
    url: ENDPOINTS.listKeyset,
    pageSize: Number(els[LIST_EL_IDS.selPerPage]?.value || 20),
    container: els[LIST_EL_IDS.listBody],
    render: (container, rows, ctx) => renderList(container, rows, ctx),
    pageInfoEls: [els[LIST_EL_IDS.pageInfo]],
    prevButtons: [els[LIST_EL_IDS.btnPrevTop], els[LIST_EL_IDS.btnPrev]],
    nextButtons: [els[LIST_EL_IDS.btnNextTop], els[LIST_EL_IDS.btnNext]],
    queryKey: "q",
  });

  lp.bindSearch(els[LIST_EL_IDS.inputSearch], { debounceMs: 300 });
  lp.bindPerPage(els[LIST_EL_IDS.selPerPage]);

  renderKV({});
  setMode("view");
  lp.reloadFirst();
});
