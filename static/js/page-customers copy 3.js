// /static/js/page-customers.js
import { $, jfetch, toast } from "./api.js";
import { escapeHtml } from "./utils.js";
import { createListPager } from "./list-pager.js?v=2";
import { renderTableX } from "./tablex.js";
import { createToggler } from "./toggler.js";

/* ---------------- CONFIG ---------------- */

// ชื่อไฟล์หน้า detail (แก้ให้ตรงกับของคุณ)
const DETAIL_PAGE = "./customer-detail.html";

// endpoint หลัก
const TABLE_CONTROL_KEYSET = "/customers/keyset";
const CREATE_TABLE_ENDPOINT = "/customers"; // POST

// id ของ control ส่วนบนหน้า (ค้นหา/เพจจิ้ง/ตาราง)
const LIST_EL_IDS = {
  inputSearch: "_q",
  selPerPage: "_per_page",
  btnPrevTop: "_prev",
  btnNextTop: "_next",
  pageInfoTop: "_page_info",
  btnPrevBottom: "_prev2",
  btnNextBottom: "_next2",
  pageInfoBottom: "_page_info2",
  tableContainer: "_table",
};

// id ของฟอร์มสร้าง (prefix _ เพื่อไม่ชนกับฟอร์ม edit/detail)
const FIELD_MAP = {
  code: "_code",
  name: "_name",
  contact: "_contact",
  email: "_email",
  phone: "_phone",
  address: "_addr",
};

// ปุ่ม/แผงของ toggler (สร้างลูกค้าใหม่)
const CREATE_UI_IDS = {
  btnToggleCreate: "btnToggleCreate",
  createCard: "createCard",
  btnCreate: "_create",
};

/* ---------------- HELPERS ---------------- */

const pageDetailUrl = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;
const gotoDetail = (id) => {
  if (id != null) location.href = pageDetailUrl(id);
};
window.gotoDetail = gotoDetail; // เผื่อเรียกจาก onclick ในตาราง

const trim = (v) => (v == null ? "" : String(v).trim());
const trimOrNull = (v) => {
  const s = trim(v);
  return s === "" ? null : s;
};

// อ่านค่าจากฟอร์มสร้าง ตาม FIELD_MAP
function readCreatePayload(els) {
  const payload = {};
  Object.entries(FIELD_MAP).forEach(([key, id]) => {
    const el = els[id];
    if (!el) return;
    if (key === "name") {
      payload[key] = trim(el.value); // name บังคับต้องมีค่า
    } else {
      payload[key] = trimOrNull(el.value);
    }
  });
  // code → upper-case ถ้ามี
  if (payload.code && typeof payload.code === "string") {
    payload.code = payload.code.toUpperCase();
  }
  return payload;
}

// เคลียร์ฟอร์มสร้าง
function clearCreateForm(els) {
  Object.values(FIELD_MAP).forEach((id) => {
    const el = els[id];
    if (el) el.value = "";
  });
}

/* ---------------- RENDER TABLE ---------------- */

function renderTable(container, rows, ctx = {}) {
  renderTableX(container, rows, {
    rowStart: Number(ctx.rowStart || 0),
    getRowId: (r) => r.id ?? r.customer_id ?? r.customerId,
    onRowClick: (r) => {
      const rid = r.id ?? r.customer_id ?? r.customerId;
      if (rid != null) gotoDetail(rid);
    },
    columns: [
      { key: "__no", title: "No.", width: "64px", align: "right" },
      {
        key: "code",
        title: "Code",
        width: "120px",
        render: (r) => {
          const rid = r.id ?? r.customer_id ?? r.customerId;
          const code = escapeHtml(r.code ?? "");
          return rid
            ? `<a href="${pageDetailUrl(rid)}" class="code-link">${code}</a>`
            : code;
        },
      },
      { key: "name", title: "Name", render: (r) => escapeHtml(r.name ?? "") },
      {
        key: "contact",
        title: "Contact",
        width: "200px",
        render: (r) => escapeHtml(r.contact ?? ""),
      },
      {
        key: "email",
        title: "Email",
        width: "240px",
        render: (r) => escapeHtml(r.email ?? ""),
      },
      {
        key: "phone",
        title: "Phone",
        width: "140px",
        render: (r) => escapeHtml(r.phone ?? ""),
      },
    ],
  });
}

/* ---------------- BOOT ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  // เก็บ refs ทั้งหมดไว้ใน els
  const els = {};

  // refs: list/search/pager/table
  Object.entries(LIST_EL_IDS).forEach(([k, id]) => (els[id] = $(id)));

  // refs: create form
  Object.values(FIELD_MAP).forEach((id) => (els[id] = $(id)));

  // refs: toggler buttons/panel
  els[CREATE_UI_IDS.btnToggleCreate] = $(CREATE_UI_IDS.btnToggleCreate);
  els[CREATE_UI_IDS.createCard] = $(CREATE_UI_IDS.createCard);
  els[CREATE_UI_IDS.btnCreate] = $(CREATE_UI_IDS.btnCreate);

  // สร้าง list pager หลังจากได้ container แน่นอน
  const lp = createListPager({
    url: TABLE_CONTROL_KEYSET,
    pageSize: Number(els[LIST_EL_IDS.selPerPage]?.value || 20),
    container: els[LIST_EL_IDS.tableContainer],
    render: renderTable,
    pageInfoEls: [
      els[LIST_EL_IDS.pageInfoTop],
      els[LIST_EL_IDS.pageInfoBottom],
    ],
    prevButtons: [els[LIST_EL_IDS.btnPrevTop], els[LIST_EL_IDS.btnPrevBottom]],
    nextButtons: [els[LIST_EL_IDS.btnNextTop], els[LIST_EL_IDS.btnNextBottom]],
    queryKey: "q",
  });

  // ผูก search + per-page
  lp.bindSearch(els[LIST_EL_IDS.inputSearch], { debounceMs: 300 });
  lp.bindPerPage(els[LIST_EL_IDS.selPerPage]);

  // toggler (ถ้ามีปุ่ม/แผง)
  let createTg = null;
  const btnToggleCreate = els[CREATE_UI_IDS.btnToggleCreate];
  const createCard = els[CREATE_UI_IDS.createCard];
  if (btnToggleCreate && createCard) {
    createTg = createToggler({
      trigger: btnToggleCreate,
      panel: createCard,
      persistKey: "customers:create", // จำสถานะเปิด/ปิด (ตั้งเป็น null ถ้าไม่ต้องการจำ)
      focusTarget: `#${FIELD_MAP.name}`, // โฟกัสช่อง name
      closeOnEsc: true,
      closeOnOutside: true,
      group: "top-actions",
      onOpen: () => {
        btnToggleCreate.textContent = "× Cancel";
      },
      onClose: () => {
        btnToggleCreate.textContent = "+ Add";
      },
    });
    btnToggleCreate.textContent = createTg.isOpen() ? "× Cancel" : "+ Add";
  }

  // สร้างแถวใหม่
  const btnCreate = els[CREATE_UI_IDS.btnCreate];
  btnCreate?.addEventListener("click", async () => {
    const payload = readCreatePayload(els);
    if (!payload.name) {
      toast("Enter customer name", false);
      els[FIELD_MAP.name]?.focus();
      return;
    }
    try {
      await jfetch(CREATE_TABLE_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast("Customer created");
      clearCreateForm(els);
      // ปิด create panel ถ้ามี toggler
      createTg?.close();
      await lp.reloadFirst();
    } catch (e) {
      toast(e?.message || "Create failed", false);
    }
  });

  // โหลดหน้าแรก
  lp.reloadFirst();
});
