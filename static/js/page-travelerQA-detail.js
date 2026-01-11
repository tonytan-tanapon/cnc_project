// /static/js/page-travelerQA-detail.js
import { $, jfetch, toast, initTopbar } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";

const qs = new URLSearchParams(location.search);
const lotId = qs.get("lot_id");

let currentInspection = null;
let qaTable = null;

/* ---------- Helpers ---------- */

const opColorMap = new Map();   // เก็บว่า OP ไหนใช้สีอะไร
let opColorIndex = 0;

const OP_COLORS = ["op-group-a", "op-group-b"]; // 2 สี

function getOpColor(op) {
  if (!opColorMap.has(op)) {
    opColorMap.set(op, OP_COLORS[opColorIndex % OP_COLORS.length]);
    opColorIndex++;
  }
  return opColorMap.get(op);
}

const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function setError(msg) {
  const e = $("errorBox");
  if (!e) return;
  e.style.display = msg ? "" : "none";
  e.textContent = msg || "";
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
      id: "inspection_link",
      href: `/static/travelerQA-detail.html?lot_id=${encodeURIComponent(lotId)}`,
      title: "Traveler",
    },
    {
      id: "material_link",
      href: `/static/manage-lot-materials.html?lot_id=${encodeURIComponent(
        lotId
      )}`,
      title: "Materials",
    },
    {
      id: "shippment_link",
      href: `/static/manage-lot-shippments.html?lot_id=${encodeURIComponent(
        lotId
      )}`,
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

/* ---------- Load Inspection ---------- */
async function loadInspection() {
  if (!lotId) {
    toast("Missing lot_id", false);
    return;
  }

  let qa = await jfetch(`/qa-inspections/by-lot/${lotId}`);

  if (!qa) {
    qa = await jfetch(`/qa-inspections`, {
      method: "POST",
      body: JSON.stringify({ lot_id: Number(lotId) }),
    });
  }

  currentInspection = qa;

  const title = $("inspectionTitle");
  if (title) title.textContent = `QA Inspection · Lot ${lotId}`;
}

/* ---------- Load Items ---------- */
async function loadInspectionItems() {
  if (!currentInspection?.id) return;

  opColorMap.clear();     // 👈 reset map
  opColorIndex = 0;      // 👈 reset index

  const rows = await jfetch(
    `/qa-inspections/${currentInspection.id}/items`
  );

  qaTable.setData(rows || []);
}
/* ---------- Autocomplete ---------- */
async function searchEmployees(term) {
  const q = (term || "").trim();
  const url = `/employees/keyset?limit=10${
    q ? `&q=${encodeURIComponent(q)}` : ""
  }`;

  try {
    const res = await jfetch(url);
    const items = Array.isArray(res) ? res : res.items || [];
    return items.map((e) => ({
      id: e.id,
      label: e.emp_code || String(e.id),
    }));
  } catch {
    return [];
  }
}

/* ---------- Inspector field ---------- */
function initInspectorAutocomplete() {
  const el = $("inspector_id");
  if (!el) return;

  attachAutocomplete(el, {
    fetchItems: searchEmployees,
    getDisplayValue: (it) => (it ? it.label : ""),
    renderItem: (it) => `<div>${escapeHtml(it.label)}</div>`,
    openOnFocus: true,
    minChars: 0,
    onPick: (it) => {
      el.value = it.label;
      el.dataset.id = it.id;
    },
  });
}

/* ---------- Build QA Table ---------- */
function initQATable() {
  const holder = document.getElementById("qa_table");
  if (!holder) return;

  qaTable = new Tabulator(holder, {
  layout: "fitColumns",
  height: "100%",
  reactiveData: true,
  
  rowFormatter: function (row) {
    
    const data = row.getData();
    const op = data.op_no;
    console.log(data,op)
    if (!op) return;

    const cls = getOpColor(op);
    console.log(cls)
    const el = row.getElement();
    el.classList.remove("op-group-a", "op-group-b"); // reset
    el.classList.add(cls);
  },

    columns: [
      { title: "Seq", field: "seq", width: 80, editor: "number" },
       
      { title: "OP", field: "op_no", width: 100, editor: "input" },
      { title: "Bubble", field: "bb_no", width: 100, editor: "input" },
      {
        title: "Dimension",
        field: "dimension",
        width: 300,
        editor: "input",
      },
      {
        title: "Actual",
        field: "actual_value",
        width: 120,
        editor: "input",
      },
      { title: "TQW", field: "tqw", width: 120, editor: "input" },   
      {
    title: "Date",
    field: "qa_time_stamp",          // 👈 ใช้จาก backend
    width: 160,
    formatter: (cell) => {
  const v = cell.getValue();
  if (!v) return "";
  const d = new Date(v);

  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);

  return `${mm}/${dd}/${yy}`;
},
  },
      {
        title: "Result",
        field: "result",
        width: 100,
        editor: "select",
        editorParams: { values: ["pass", "fail"] },
      },
      { title: "Notes", field: "notes", width: 200, editor: "input" },
      {
        title: "Operator",
        field: "emp_id",
        width: 120,
        editor: "number",
      },
      {
        title: "Del",
        width: 80,
        hozAlign: "center",
        formatter: () => "❌",
        cellClick: async (e, cell) => {
          const row = cell.getRow();
          const d = row.getData();
          if (d.id) {
            await jfetch(`/qa-inspections/qa-items/${d.id}`, {
              method: "DELETE",
            });
          }
          row.delete();
        },
      },
    ],
  });

  // Auto save
  qaTable.on("cellEdited", async (cell) => {
  const row = cell.getRow();
  const d = row.getData();
  const inspectionId = currentInspection.id;

  const payload = {
    seq: Number(d.seq),
    op_no: d.op_no || null,
    bb_no: d.bb_no || null,
    dimension: d.dimension || null,
    actual_value: d.actual_value || null,
    result: d.result || null,
    notes: d.notes || null,
    emp_id: d.emp_id ? Number(d.emp_id) : null,
  };

  try {
    if (!d.id) {
      const created = await jfetch(
        `/qa-inspections/${inspectionId}/items`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
      row.update(created);
      toast("Item added");
    } else {
      await jfetch(`/qa-inspections/qa-items/${d.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      toast("Saved");
    }
  } catch (err) {
    console.error("QA save error:", err);
    toast(err?.message || "Save failed", false);
  }
});

}

/* ---------- Add Row ---------- */
function initAddRowButton() {
  const btn = $("btnAddRow");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (!qaTable) return;

    const data = qaTable.getData();
    const lastSeq = data.length
      ? Math.max(...data.map((r) => Number(r.seq || 0)))
      : 0;

    const nextSeq = lastSeq + 10;

    const newRow = {
      seq: nextSeq,
      op_no: "",
      bb_no: "",
      dimension: "",
      actual_value: "",
      result: "",
      notes: "",
      emp_id: "",
    };

    const row = await qaTable.addRow(newRow, false, "bottom");
    row.getCell("op_no")?.edit();
  });
}

async function btnAddTemplate() {
  if (!currentInspection?.id) {
    alert("Inspection ID not found");
    return;
  }
  
  const inspectionId = currentInspection.id;
  console.log("Applying QA template to inspectionId:", inspectionId);

  try {
    // 1️⃣ ขอ QA template ที่ active
    const tmpl = await jfetch(
      `/api/v1/qa-inspections/templates/active?inspection_id=${encodeURIComponent(
        inspectionId
      )}`
    );
    console.log(tmpl)
    const templateId = tmpl.id;
    console.log("Using QA templateId:", templateId);

    // 2️⃣ apply QA template
    const res = await fetch(
      `/api/v1/qa-inspections/apply-template/${encodeURIComponent(
        inspectionId
      )}?template_id=${encodeURIComponent(templateId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!res.ok) {
      throw new Error(await res.text());
    }

    toast("QA Template applied");
    await loadInspectionItems(); // reload QA table

  } catch (err) {
    console.error(err);
    toast(err?.message || "Failed to apply QA template", false);
  }
}


async function btnExportInspection() {
  // try {
  //   const res = await fetch(`/api/v1/traveler_drawing/drawing/${travelerId}`, {
  //     method: "POST",
  //   });

  //   if (!res.ok) {
  //     const txt = await res.text().catch(() => "");
  //     console.error("Download error:", res.status, txt);
  //     toast("Download failed");
  //     return;
  //   }
  //   console.log(res);
  //   const blob = await res.blob();
  //   const a = document.createElement("a");
  //   a.href = URL.createObjectURL(blob);
  //   a.download = `drawing_${travelerId}.bat`;
  //   a.click();
  //   URL.revokeObjectURL(a.href);
  // } catch (err) {
  //   console.error("Download exception:", err);
  //   toast("Download failed (exception)");
  // }
}
/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  initTopbar();
  initInspectorAutocomplete();
  initQATable();
  initAddRowButton();
  makeLotLinks(lotId);


  $("btnAddTemplate").addEventListener("click", btnAddTemplate);
  $("btnExportInspection").addEventListener("click", btnExportInspection);
  try {
    await loadInspection();
    await loadInspectionItems();
  } catch (e) {
    setError(e?.message || "Failed to load inspection");
  }
});
