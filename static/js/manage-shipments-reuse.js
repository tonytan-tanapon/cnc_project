// /static/js/manage-shipment-items.js
import { $, jfetch, toast } from "./api.js";


/* ===== CONFIG ===== */
const ENDPOINTS = {
  base: (shipmentId) => `/customer_shipments/${shipmentId}/items`,
  item: (itemId) => `/customer_shipments/items/${itemId}`,
  shipment: (id) => `/customer_shipments/${id}`,
};
const JSON_HEADERS = { "Content-Type": "application/json" };

const UI = { table: "listBody", add: "_add", title: "shipmentTitle" };
let table = null;
let shipmentId = null;

/* ===== Helpers ===== */
function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleString();
}

function getShipmentId() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  return id ? parseInt(id) : null;
}

/* ===== Table Columns ===== */
function makeColumns() {
  return [
    { title: "ID", field: "id", width: 80, hozAlign: "right" },
    {
      title: "PO Line",
      field: "po_line_id",
      width: 120,
      hozAlign: "right",
      editor: "input",
    },
    {
      title: "Lot",
      field: "lot_id",
      width: 120,
      hozAlign: "right",
      editor: "input",
    },
    {
      title: "Qty",
      field: "qty",
      width: 100,
      hozAlign: "right",
      editor: "number",
    },
    {
      title: "Note",
      field: "note",
      minWidth: 200,
      editor: "input",
      cssClass: "wrap",
    },
    {
      title: "Created",
      field: "created_at",
      width: 160,
      formatter: (c) => fmtDate(c.getValue()),
    },
    {
      title: "Actions",
      field: "_actions",
      width: 120,
      hozAlign: "center",
      headerSort: false,
      formatter: () => `
        <div class="row-actions">
          <button class="btn-small btn-danger" data-act="del">Delete</button>
        </div>`,
      cellClick: async (e, cell) => {
        const btn = e.target.closest("button[data-act='del']");
        if (!btn) return;
        const row = cell.getRow();
        await deleteItem(row);
      },
    },
  ];
}

/* ===== CRUD ===== */
async function loadItems() {
  if (!shipmentId) return;
  try {
    const res = await jfetch(ENDPOINTS.base(shipmentId));
    table.setData(res);
  } catch (e) {
    toast("Load failed", false);
  }
}

async function createItem() {
  try {
    const payload = { qty: 0 };
    const res = await jfetch(ENDPOINTS.base(shipmentId), {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
    toast("Item created");
    await loadItems();
  } catch (e) {
    toast("Create failed", false);
  }
}

async function deleteItem(row) {
  const data = row.getData();
  if (!confirm(`Delete item #${data.id}?`)) return;
  try {
    await jfetch(ENDPOINTS.item(data.id), { method: "DELETE" });
    row.delete();
    toast("Deleted");
  } catch (e) {
    toast("Delete failed", false);
  }
}

/* ===== Table Init ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    height: "100%",
    placeholder: "No items",
    reactiveData: true,
    columns: makeColumns(),
  });

  table.on("cellEdited", async (cell) => {
    const row = cell.getRow();
    const data = row.getData();
    try {
      await jfetch(ENDPOINTS.item(data.id), {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          po_line_id: data.po_line_id,
          lot_id: data.lot_id,
          qty: data.qty,
          note: data.note,
        }),
      });
      toast(`Updated item ${data.id}`);
    } catch (e) {
      toast("Save failed", false);
    }
  });
}

/* ===== Shipment Header ===== */
async function loadShipmentHeader() {
  try {
    const res = await jfetch(ENDPOINTS.shipment(shipmentId));
    $(`#${UI.title}`).textContent = `Shipment #${res.id} (${res.po_number || ""})`;
  } catch {
    $(`#${UI.title}`).textContent = "Shipment Items";
  }
}

/* ===== Boot ===== */
document.addEventListener("DOMContentLoaded", async () => {
  shipmentId = getShipmentId();
  if (!shipmentId) {
    toast("Missing shipment id", false);
    return;
  }

  initTable();
  await loadShipmentHeader();
  await loadItems();

  $(`#${UI.add}`).addEventListener("click", createItem);
});
