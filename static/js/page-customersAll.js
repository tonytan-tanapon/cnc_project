// /static/js/page-customers.js
import { $, jfetch, toast } from "./api.js";
import { escapeHtml } from "./utils.js";
import { createListPager } from "./list-pager.js?v=2";

/* CONFIG */
const ENDPOINTS = {
  listKeyset: "/customers/keyset",
  base: "/customers",
  byId: (id) => `/customers/${encodeURIComponent(id)}`,
};

const LIST_EL_IDS = {
  inputSearch: "_q",
  selPerPage: "_per_page",
  btnPrevTop: "_prev_top",
  btnNextTop: "_next_top",
  btnPrev: "_prev",
  btnNext: "_next",
  pageInfo: "_page_info",
  listBody: "listBody",
};

const CTRL_IDS = {
  hint: "hint",
  errorBox: "errorBox",
  view: "detailView",
  btnEdit: "btnEdit",
  btnNew: "btnNew",
  btnSave: "btnSave",
  btnCancel: "btnCancel",
  btnDelete: "btnDelete",
};

const FIELD_KEYS = ["name", "code", "contact", "email", "phone", "address"];
const FIELD_LABELS = {
  code: "Code",
  name: "Name",
  contact: "Contact",
  email: "Email",
  phone: "Phone",
  address: "Address",
};
const FIELD_INPUT_TYPE = {
  name: "text",
  code: "text",
  contact: "text",
  email: "email",
  phone: "text",
  address: "textarea",
};

/* STATE */
let els = {};
let selectedId = null;
let initial = null; // ข้อมูลลูกค้าที่โหลดล่าสุด
let mode = "view"; // view | edit | create
let tempEdits = {}; // ค่า draft ของทุกฟิลด์ตอนแก้ไข
let prevSelectedIdBeforeNew = null; // จำ id ก่อนกด New เพื่อ Cancel กลับมา

/* UTILS */
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

/* RENDER: key:value + (edit/create => inputs ทุกแถว) */
function renderKV(data = {}) {
  const holder = els[CTRL_IDS.view];
  if (!holder) return;

  const empty = !data || (Object.keys(data).length === 0 && mode !== "create");
  if (empty) {
    holder.innerHTML = `<div class="muted">Select a customer on the left</div>`;
    return;
  }

  const isEditing = mode === "edit" || mode === "create";
  const rows = FIELD_KEYS.map((key) => {
    const label = FIELD_LABELS[key];
    const current = tempEdits.hasOwnProperty(key)
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

  // double-click แถวไหน => ถ้าอยู่ view ให้เข้าโหมดแก้ทุกฟิลด์ และ focus แถวที่คลิก
  holder.querySelectorAll(".kv-row").forEach((row) => {
    row.addEventListener("dblclick", () => {
      const key = row.dataset.key;
      if (mode === "view") {
        // เตรียม tempEdits จากค่าปัจจุบันทุกฟิลด์
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
  const el = els[CTRL_IDS.view]?.querySelector(
    `.kv-input[data-field="${CSS.escape(key)}"]`
  );
  el?.focus();
}

/* LIST SIDE */
function highlightSelected() {
  const nodes = els[LIST_EL_IDS.listBody]?.querySelectorAll(".cust-item");
  nodes?.forEach((n) =>
    n.classList.toggle("active", String(n.dataset.id) === String(selectedId))
  );
}
function renderList(container, rows, ctx = {}) {
  if (!container) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    container.innerHTML = `<div class="muted" style="padding:12px">No customers</div>`;
    selectedId = null;
    initial = null;
    mode = "view";
    tempEdits = {};
    renderKV({});
    setMode("view");
    document.title = "Customers · Topnotch MFG";
    return;
  }

  const rowStart = Number(ctx.rowStart || 0);

  container.innerHTML = rows
    .map((r, i) => {
      const id = r.id ?? r.customer_id ?? r.customerId;
      const no = rowStart + i + 1;
      const code = escapeHtml(r.code ?? "");
      const name = escapeHtml(r.name ?? "");
      const sub = escapeHtml(r.contact || r.email || r.phone || "");
      return `<div class="cust-item" data-id="${id}">
      <div class="cust-no">${no}</div>
      <div class="cust-code">${code || "—"}</div>
      <div>
        <div class="cust-name">${name || "(no name)"}</div>
        <div class="cust-sub">${sub}</div>
      </div>
    </div>`;
    })
    .join("");

  container.querySelectorAll(".cust-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.id;
      if (!id || String(id) === String(selectedId)) return;
      selectCustomer(id);
    });
  });

  const idsInPage = Array.from(container.querySelectorAll(".cust-item"))
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

/* DATA IO */
async function loadDetail(id) {
  setBusy(true);
  try {
    const c = await jfetch(ENDPOINTS.byId(id));
    initial = c;
    mode = "view";
    tempEdits = {};
    renderKV(c);
    setMode("view");
    document.title = `Customer · ${c.name ?? c.code ?? c.id}`;
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
    contact: data.contact ? trim(data.contact) : null,
    email: data.email ? trim(data.email) : null,
    phone: data.phone ? trim(data.phone) : null,
    address: data.address ? trim(data.address) : null,
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
      toast("Customer created");
      selectedId = created.id ?? created.customer_id ?? created.customerId;
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
      const node = els[LIST_EL_IDS.listBody]?.querySelector(
        `.cust-item[data-id="${CSS.escape(String(selectedId))}"]`
      );
      if (node) {
        node.querySelector(".cust-code").textContent = updated.code ?? "—";
        node.querySelector(".cust-name").textContent =
          updated.name ?? "(no name)";
        node.querySelector(".cust-sub").textContent =
          updated.contact || updated.email || updated.phone || "";
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
      selectCustomer(backId); // จะ loadDetail เอง
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
      `.cust-item[data-id="${CSS.escape(String(selectedId))}"]`
    );
    node?.remove();
    selectedId = null;
    initial = null;
    mode = "view";
    tempEdits = {};
    renderKV({});
    setMode("view");
    document.title = "Customers · Topnotch MFG";
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  } finally {
    setBusy(false);
  }
}

/* SELECT */
async function selectCustomer(id) {
  selectedId = id;
  highlightSelected();
  await loadDetail(id);
}

/* BOOT */
let lp;
document.addEventListener("DOMContentLoaded", () => {
  // cache
  Object.values(LIST_EL_IDS).forEach((id) => (els[id] = $(id)));
  Object.values(CTRL_IDS).forEach((id) => (els[id] = $(id)));

  // Edit: แก้ทุกฟิลด์
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

  // New: เข้าโหมดสร้าง, จดจำ id เดิมไว้สำหรับ Cancel
  els[CTRL_IDS.btnNew]?.addEventListener("click", () => {
    prevSelectedIdBeforeNew = selectedId;
    selectedId = null;
    initial = null;
    mode = "create";
    tempEdits = {
      name: "",
      code: "",
      contact: "",
      email: "",
      phone: "",
      address: "",
    };
    setMode("create");
    renderKV(getWorkingData());
    focusField("name");
  });

  els[CTRL_IDS.btnSave]?.addEventListener("click", saveDetail);
  els[CTRL_IDS.btnCancel]?.addEventListener("click", cancelEdits);
  els[CTRL_IDS.btnDelete]?.addEventListener("click", deleteDetail);

  // pager (ส่ง ctx เข้า render เพื่อคำนวณ No.)
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
