import { $, jfetch, showToast as toast } from "./api.js";

const API = "/api/v1/traveler-templates";

let table;

function columns() {
  return [
    { title: "ID", field: "id", width: 80 },

    {
      title: "Template Name",
      field: "template_name",
      editor: "input"
    },

    {
      title: "Part No",
      field: "part_no",
      formatter: (cell) => {
        const d = cell.getRow().getData();
        return d.part?.part_no || "";
      }
    },

    {
      title: "Revision",
      field: "rev_name",
      formatter: (cell) => {
        const d = cell.getRow().getData();
        return d.part_revision?.rev || "";
      }
    },

    {
      title: "Version",
      field: "version",
      width: 100
    },

    {
      title: "Note",
      field: "note",
      editor: "input"
    },

    {
      title: "Steps",
      field: "id",
      formatter: (cell) => {
        const id = cell.getValue();
        return `<a href="./traveler-template-detail.html?id=${id}">View</a>`;
      }
    },

    {
      title: "Actions",
      formatter: () => `<button data-act="del">Delete</button>`,
      width: 120,
      cellClick: (e, cell) => {
        if (e.target.dataset.act === "del") {
          deleteRow(cell.getRow());
        }
      }
    }
  ];
}

async function deleteRow(row) {
  const d = row.getData();
  if (!confirm("Delete template?")) return;

  await jfetch(`${API}/${d.id}`, { method: "DELETE" });
  row.delete();
  toast("Deleted");
}

function initTable() {
  table = new Tabulator("#listBody", {
    layout: "fitColumns",
    height: "100%",

    ajaxURL: API,

    ajaxResponse: (_url, _params, res) => {
      return res.items || res;
    },

    columns: columns()
  });
}

function bindAdd() {
  $("#_add").addEventListener("click", async () => {
    const created = await jfetch(API, {
      method: "POST",
      body: JSON.stringify({
        name: "New Template",
        version: 1
      })
    });

    table.addData([created], true);
  });
}

function bindSearch() {
  $("#_q").addEventListener("input", () => {
    const q = $("#_q").value;
    table.setFilter("name", "like", q);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTable();
  bindAdd();
  bindSearch();
});