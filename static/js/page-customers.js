// /static/js/page-customers.js  (เรียกใช้แบบสั้น)
import { $, jfetch, toast } from "./api.js";
import { escapeHtml } from "./utils.js";
import { createListPager } from "./list-pager.js?v=2";
import { renderTableX } from "./tablex.js";
import { createToggler } from "./toggler.js";

/* ---- CONFIG / helpers ---- */
const DETAIL_PAGE = "./customers-detail.html";

// API endpoint
const TABLE_CONTROL_KEYSET = "/customers/keyset";
const CREATE_TABLE_ENDPOINT = "/customers"; // POST

const pageDetailUrl = (id) => `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`;
const gotoDetail = (id) => {
  if (id) location.href = pageDetailUrl(id);
};
window.gotoDetail = gotoDetail;

/* ---- create data ex customer ---- */
// CHANGE ME: ปรับ payload ตามฟิลด์ที่ต้องการ
async function createDataROW() {
  const payload = {
    code: $("_code")?.value.trim() || "",
    name: $("_name")?.value.trim(),
    contact: $("_contact")?.value.trim() || null,
    email: $("_email")?.value.trim() || null,
    phone: $("_phone")?.value.trim() || null,
    address: $("_addr")?.value.trim() || null,
  };
  if (!payload.name) return toast("Enter customer name", false);

  try {
    await jfetch(CREATE_TABLE_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast("Customer created");
    ["c_code", "c_name", "c_contact", "c_email", "c_phone", "c_addr"].forEach(
      (id) => {
        const el = $(id);
        if (el) el.value = "";
      }
    );
    // ปิดด้วย toggler (แทน hideCreate เดิม)
    createTg?.close();
    await lp.reloadFirst();
  } catch (e) {
    toast(e?.message || "Create failed", false);
  }
}

/* ---- UI refs ---- */
// Table elements
const inputSearch = $("_q");
const selPerPage = $("_per_page");
const btnPrevTop = $("_prev");
const btnNextTop = $("_next");
const pageInfoTop = $("_page_info");
const btnPrevBottom = $("_prev2");
const btnNextBottom = $("_next2");
const pageInfoBottom = $("_page_info2");
const tableContainer = $("_table");

// Create elements for taggler
const btnToggleCreate = document.getElementById("btnToggleCreate");
const createCard = document.getElementById("createCard");
const btnCreate = document.getElementById("_create");

/* ---- render (ใช้ tablex + No. + fallback id) ---- */
// param container: table body element, ex <tbody>
// param rows: array ของ object (ข้อมูลแต่ละแถว)
// param ctx: context เพิ่มเติม (เช่น rowStart สำหรับคำนวณ No.)
// ex . renderTable(tbodyEl, rows, {rowStart: 20})
function renderTable(container, rows, ctx = {}) {
  renderTableX(
    container, // table body element, ex <tbody>
    rows,
    {
      rowStart: Number(ctx.rowStart || 0), // สำหรับคำนวณ No.
      getRowId: (r) => r.id ?? r.customer_id ?? r.customerId,
      onRowClick: (r) => {
        const rid = r.id ?? r.customer_id ?? r.customerId;
        if (rid != null) gotoDetail(rid);
      },
      // คอลัมน์ที่จะแสดง
      // render: (row) => html string หรือ text
      // ถ้า key = __no จะเป็นเลขลำดับ  (1,2,3...)
      // width: กำหนดความกว้าง (px, %, em, rem)
      // align: left, right, center
      //  { key: "name", title: "Name" },  1 คอลัมน์ชื่อ Name, ดึงจาก row.name
      columns: [
        { key: "__no", title: "No.", width: "64px", align: "right" },
        {
          key: "code",
          title: "Code",
          width: "120px",
          render: (r) => {
            const rid = r.id ?? r.customer_id ?? r.customerId; // fallback id
            const code = escapeHtml(r.code ?? "");
            return rid // ถ้ามี id ให้ลิงก์ไปหน้ารายละเอียด
              ? `<a href="${pageDetailUrl(rid)}" class="code-link">${code}</a>` //****** สิ่งที่จะแสดง ******
              : code; // no link
          },
        },
        { key: "name", title: "Name" },
        { key: "contact", title: "Contact", width: "200px" },
        { key: "email", title: "Email", width: "240px" },
        { key: "phone", title: "Phone", width: "140px" },
      ],
    }
  );
}

/* ---- list pager (ค้นหา + เพจจิ้ง reuse) ---- */
const lp = createListPager({
  url: TABLE_CONTROL_KEYSET,
  pageSize: 20,
  container: tableContainer,
  render: renderTable,
  pageInfoEls: [pageInfoTop, pageInfoBottom],
  prevButtons: [btnPrevTop, btnPrevBottom],
  nextButtons: [btnNextTop, btnNextBottom],
  queryKey: "q", // backend รับพารามิเตอร์ชื่อ q
});

/* ---- boot ---- */
let createTg; // toggler สำหรับ create card, toggler คืออะไร ดูใน toggler.js
document.addEventListener("DOMContentLoaded", () => {
  // toggler สำหรับ create section (อย่าผูกคลิกซ้ำ)
  createTg = createToggler({
    trigger: btnToggleCreate,
    panel: createCard,
    persistKey: "customers:create", // จำสถานะเปิด/ปิด (ถ้าไม่ต้องการจำ ให้ตั้งเป็น null)
    focusTarget: "#_name", // โฟกัสที่ช่องชื่อลูกค้า
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
  // sync ปุ่มเริ่มต้นตามสถานะที่ restore มา
  btnToggleCreate.textContent = createTg.isOpen() ? "× Cancel" : "+ Add";

  // bind search + per-page
  lp.bindSearch(inputSearch, { debounceMs: 300 });
  lp.bindPerPage(selPerPage);

  // create
  btnCreate?.addEventListener("click", createDataROW);

  // first load
  lp.reloadFirst();
});
