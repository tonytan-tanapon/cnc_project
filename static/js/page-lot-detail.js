// --- tiny helpers ---

const lotId = new URLSearchParams(location.search).get("lot_id");
async function jfetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `${res.status}: ${res.statusText}${text ? " — " + text : ""}`
    );
  }
  return res.json();
}
function toast(msg, ok = true) {
  const el = document.getElementById("toast");
  const txt = document.getElementById("toastText");
  if (!el || !txt) {
    alert(msg);
    return;
  }
  txt.textContent = msg;
  el.style.background = ok ? "rgba(17, 24, 39, .95)" : "rgba(153, 27, 27, .95)";
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 1600);
}

// ================================


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
      id: "material_link",
      href: `/static/manage-lot-materials.html?lot_id=${encodeURIComponent(lotId)}`,
      title: "Materials",
    },
    {
      id: "shippment_link",
      href: `/static/manage-lot-shippments.html?lot_id=${encodeURIComponent(lotId)}`,
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

async function loadLotDetail() {
  const lotId = new URLSearchParams(location.search).get("lot_id");

  const res = await jfetch(`/api/v1/lot-summary?lot_id=${lotId}`);
  const lot = res.items?.[0];

  if (!lot) return;

  renderLotTable(lot);
}
function editableField(field, value, lotId, type = "text") {
  const isNote = field === "note";

  return `
    <span 
      id="${field}Text" 
      style="${isNote ? "white-space: pre-wrap; display:block;" : ""}"
    >
      ${value ?? "-"}
    </span>

    ${
      isNote
        ? `<textarea id="${field}Input"
            style="display:none; width:50%; min-height:80px;">${value ?? ""}</textarea>`
        : `<input id="${field}Input"
            type="${type}"
            value="${value ?? ""}"
            style="display:none; width:150px;">`
    }

    <button onclick="editField('${field}')">✏️</button>
    <button style="display:none;" onclick="saveField('${field}', ${lotId})">💾</button>
    <button style="display:none;" onclick="cancelField('${field}')">❌</button>
  `;
}

function editField(field) {
  const textEl = document.getElementById(field + "Text");
  const inputEl = document.getElementById(field + "Input");

  if (!textEl || !inputEl) return;

  textEl.style.display = "none";
  inputEl.style.display = "inline-block";

  const container = inputEl.parentElement;
  const editBtn = container.querySelector("button:nth-of-type(1)");
  const saveBtn = container.querySelector("button:nth-of-type(2)");
  const cancelBtn = container.querySelector("button:nth-of-type(3)");

  editBtn.style.display = "none";
  saveBtn.style.display = "inline-block";
  cancelBtn.style.display = "inline-block";
}
async function saveField(field, lotId) {
  const input = document.getElementById(field + "Input");

  const newValue =
    input.type === "number" ? Number(input.value) : input.value;

  await jfetch(`/api/v1/lots/${encodeURIComponent(lotId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [field]: newValue }),
  });

  document.getElementById(field + "Text").textContent = newValue;
  exitFieldEdit(field);
  toast("Updated!");
}
function cancelField(field) {
  const text = document.getElementById(field + "Text").textContent;
  document.getElementById(field + "Input").value = text;
  exitFieldEdit(field);
}

function exitFieldEdit(field) {
  const textEl = document.getElementById(field + "Text");
  const inputEl = document.getElementById(field + "Input");

  const container = inputEl.parentElement;
  const editBtn = container.querySelector("button:nth-of-type(1)");
  const saveBtn = container.querySelector("button:nth-of-type(2)");
  const cancelBtn = container.querySelector("button:nth-of-type(3)");

  textEl.style.display = "inline";
  inputEl.style.display = "none";

  editBtn.style.display = "inline-block";
  saveBtn.style.display = "none";
  cancelBtn.style.display = "none";
}




function renderLotTable(d) {
  console.log("test",d)
  const tbody = document.getElementById("lotDetailBody");
  tbody.innerHTML = "";

  const rows = [
  ["Lot", editableField("lot_no", d.lot_no, d.lot_id)],

  ["Lot Plan QTY", editableField("planned_qty", d.lot_qty, d.lot_id, "number")],
  ["Lot PO QTY", editableField("lot_planned_ship_qty", d.lot_planned_ship_qty, d.lot_id, "number")],
  // ["Lot Remaining to Ship", d.lot_remaining_to_ship],

  ["Lot Due Date", editableField("lot_due_date", d.lot_due_date?.split("T")[0], d.lot_id, "date")],
  ["Lot PO Date", d.lot_po_date],
  ["Lot PO Due Date", d.lot_po_duedate],
  // ["Lot Last Ship Date", d.lot_last_ship_date],

  ["Lot Status", d.lot_status],
  ["Note", editableField("note", d.note, d.lot_id)],

  ["PO Number", d.po_number],
  // ["PO Due Date", d.po_due_date],
  // ["PO Qty Total", d.po_qty_total],
  // ["PO Shipped Total", d.po_shipped_total],
  // ["PO Remaining Qty", d.po_remaining_qty],

  ["Part No", d.part_no],
  ["Part Name", d.part_name],
  ["Revision Code", d.revision_code],

  ["Customer Code", d.customer_code],
  // ["Customer Name", d.customer_name],

  // ["Shipment Status", d.shipment_status],

  ["Created At", d.created_at],
  ["Days Left", d.days_left],
];



  rows.forEach(([label, value]) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight:600; width:200px;">${label}</td>
      <td>${value ?? ""}</td>
    `;
    tbody.appendChild(tr);
  });
}



document.addEventListener("DOMContentLoaded", () => {
  loadLotDetail();

  
  const lotId = new URLSearchParams(location.search).get("lot_id");
   makeLotLinks(lotId);
  if (!lotId) return toast("Missing lot_id in URL", false);

  // =================== TABLES ===================
 

  
  // boot
 
  loadLotDetail();


});


window.editField = editField;
window.saveField = saveField;
window.cancelField = cancelField;