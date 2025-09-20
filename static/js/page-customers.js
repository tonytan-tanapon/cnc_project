// /static/js/page-customers.js — show ALL, inline CRUD, +Add, delete per row (auto-fetch-all)
import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const ENDPOINTS = { base: "/customers" };
// ถ้าต้องการบังคับใช้ param แบบไหน ให้ตั้งค่าตามนี้ได้: "auto" | "all-param" | "paged"
const FETCH_ALL_STRATEGY = "auto";
// per_page สูงสุดตามที่แบ็กเอนด์อนุญาต (โค้ดเดิมคุณ le=100)
const PAGED_PER_PAGE = 100;

const UI = { q: "_q", btnAdd: "_add", tableMount: "listBody" };

/* ===== STATE ===== */
let els = {};
let table = null;

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());

function buildPayload(row) {
  return {
    name: trim(row.name) || null,
    code: row.code ? String(row.code).toUpperCase() : null,
    contact: row.contact ? trim(row.contact) : null,
    email: row.email ? trim(row.email) : null,
    phone: row.phone ? trim(row.phone) : null,
    address: row.address ? trim(row.address) : null,
  };
}
function normalizeRow(r) {
  return {
    id: r.id ?? r.customer_id ?? r.customerId,
    code: r.code ?? "",
    name: r.name ?? "",
    contact: r.contact ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    address: r.address ?? "",
  };
}

/* ===== TABLE ===== */
function makeColumns() {
  return [
    {
      title: "No.",
      width: 60,
      hozAlign: "right",
      headerHozAlign: "right",
      headerSort: false,
      formatter: "rownum",
    },
    { title: "Code", field: "code", width: 80, editor: "input" },
    {
      title: "Name",
      field: "name",
      minWidth: 160,
      editor: "input",
      validator: "required",
    },
    { title: "Contact", field: "contact", width: 110, editor: "input" },
    { title: "Email", field: "email", width: 110, editor: "input" },
    { title: "Phone", field: "phone", width: 110, editor: "input" },
    {
      title: "Address",
      field: "address",
      widthGrow: 3,
      minWidth: 220,
      maxWidth: 600,
      editor: "input",
      cssClass: "wrap",
    },
    {
      title: "Actions",
      field: "_actions",
      width: 100,
      hozAlign: "right",
      headerSort: false,
      formatter: () =>
        `<button class="btn-small btn-danger" data-act="del">Delete</button>`,
      cellClick: async (e, cell) => {
        const btn = e.target.closest("button[data-act='del']");
        if (!btn) return;
        const row = cell.getRow();
        const d = row.getData();
        if (!d.id) {
          row.delete();
          table.redraw(true);
          return;
        }
        if (!confirm("Delete this customer?\nThis action cannot be undone."))
          return;
        try {
          await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(d.id)}`, {
            method: "DELETE",
          });
          toast("Deleted");
          row.delete();
          table.redraw(true);
        } catch (err) {
          toast(err?.message || "Delete failed", false);
        }
      },
    },
  ];
}

function initTable() {
  table = new Tabulator(`#${UI.tableMount}`, {
    layout: "fitColumns",
    // height: "calc(100vh - 180px)",
    height: "75vh",
    // height: "100%",
    columns: makeColumns(),
    placeholder: "No customers",
    reactiveData: true,
    index: "id",
  });

  table.on("tableBuilt", () => {
    requestAnimationFrame(() => table.redraw(true));
    setTimeout(() => table.redraw(true), 0);
  });

  // AUTOSAVE เมื่อแก้ไขจบ
  table.on("cellEdited", async (cell) => {
    const row = cell.getRow();
    const d = row.getData();
    if (!trim(d.name)) {
      toast("Name required", false);
      return;
    }
    const payload = buildPayload(d);

    try {
      if (!d.id) {
        const created = await jfetch(ENDPOINTS.base, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (created && typeof created === "object")
          row.update(normalizeRow(created));
        else await loadAll(els[UI.q]?.value || "");
        toast("Created");
      } else {
        const updated = await jfetch(
          `${ENDPOINTS.base}/${encodeURIComponent(d.id)}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        );
        if (updated && typeof updated === "object")
          row.update(normalizeRow(updated));
        else await loadAll(els[UI.q]?.value || "");
        toast("Saved");
      }
      table.redraw(true);
    } catch (e) {
      toast(e?.message || "Save failed", false);
    }
  });
}

/* ===== FETCH ALL HELPERS ===== */
async function tryFetchAllParam(keyword = "") {
  // ยิงด้วย all=1 (รองรับ “ทางเลือก A”)
  const usp = new URLSearchParams();
  usp.set("all", "1");
  if (keyword) usp.set("q", keyword);
  const res = await jfetch(`${ENDPOINTS.base}?${usp.toString()}`);
  const items = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
  const total = res?.total ?? items.length;
  return { items, total, pages: res?.pages ?? 1 };
}

async function fetchAllByPaging(keyword = "") {
  // ไล่ดึงทุกหน้า (รองรับแบ็กเอนด์เดิมของคุณ)
  const perPage = PAGED_PER_PAGE;
  let page = 1;
  const all = [];
  while (true) {
    const usp = new URLSearchParams();
    usp.set("page", String(page));
    usp.set("per_page", String(perPage));
    if (keyword) usp.set("q", keyword);
    const res = await jfetch(`${ENDPOINTS.base}?${usp.toString()}`);
    const items = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
    if (!items?.length) break;
    all.push(...items);
    const pages = res?.pages;
    if (pages && page >= pages) break;
    if (!pages && items.length < perPage) break;
    page += 1;
  }
  return all;
}

/* ===== LOAD ALL ===== */
async function loadAll(keyword = "") {
  try {
    let records = [];

    if (FETCH_ALL_STRATEGY === "all-param" || FETCH_ALL_STRATEGY === "auto") {
      let ok = false;
      try {
        const { items, total, pages } = await tryFetchAllParam(keyword);
        records = items;
        // ถ้า backend ยังส่งมาไม่ครบ (เผื่อบางระบบ all=1 แต่ยังจำกัด per_page)
        if (
          records.length < (total || records.length) ||
          (pages && pages > 1)
        ) {
          // fallback ไปแบบแบ่งหน้า
          records = await fetchAllByPaging(keyword);
        }
        ok = true;
      } catch {
        if (FETCH_ALL_STRATEGY === "all-param")
          throw new Error("Backend doesn't support all=1");
        // auto -> ตกลงไปใช้ paged
      }
      if (ok) {
        table?.setData(records.map(normalizeRow));
        table?.redraw(true);
        return;
      }
    }

    // โหมดบังคับ paged หรือ auto แล้ว all=1 ใช้ไม่ได้
    records = await fetchAllByPaging(keyword);
    table?.setData(records.map(normalizeRow));
    table?.redraw(true);
  } catch (e) {
    toast("Load failed", false);
    table?.setData([]);
    table?.redraw(true);
  }
}

/* ===== BINDINGS ===== */
function bindSearch() {
  const box = els[UI.q];
  if (!box) return;
  let t;
  box.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => loadAll(box.value), 300);
  });
}
function bindAdd() {
  const btn = els[UI.btnAdd];
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const row = await table.addRow(
      { code: "", name: "", contact: "", email: "", phone: "", address: "" },
      true
    );
    row.getCell("name")?.edit(true);
    table.redraw(true);
  });
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  initTable();
  bindSearch();
  bindAdd();
  loadAll();
});
