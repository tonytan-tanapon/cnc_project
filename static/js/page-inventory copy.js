import { $, jfetch, toast } from "./api.js";

const ENDPOINTS = {
  list: (qs) => `/part_inventory?${qs}`,
};



const UI = {
  q: "_q",
  add: "_add",
  table: "listBody",
};

let table = null;
let els = {};

function bindAdd() {

  els._add.addEventListener("click", () => {

    table.addRow({

      id: null,

      part_no: "",
      rev: "",
      lot_no: "",

      prod_qty: 0,
      ship_qty: 0,
      stock_qty: 0,

      isNew: true

    }, true);

  });

}

function makeColumns() {
  return [

    {
      title: "Part",
      field: "part_no",
      width: 180,
      editor: "input"
    },

    {
      title: "Rev",
      field: "rev",
      width: 80,
      editor: "input"
    },

    {
      title: "Lot",
      field: "lot_no",
      width: 180,
      editor: "input"
    },

    {
      title: "Produced",
      field: "prod_qty",
      editor: "input",
      width: 120,
      hozAlign: "right",
    },

    {
      title: "Shipped",
      field: "ship_qty",
      editor: "input",
      width: 120,
      hozAlign: "right",
    },

    {
      title: "Stock",
      field: "stock_qty",
      editor: "input",
      width: 120,
      hozAlign: "right",
    },

    {
      title: "Part Total",
      field: "part_rev_total_qty",
      width: 140,
      hozAlign: "right",
    },

    {
      title: "",
      width: 120,
      hozAlign: "center",

      formatter() {
        return `
          <button class="btn btn-sm btn-primary">
            Transfer
          </button>
        `;
      },

      cellClick(e, cell) {
        const row = cell.getRow().getData();

        console.log("Transfer", row);

        toast(`Transfer ${row.lot_no}`);
      }
    }
  ];
}

function initTable() {

  table = new Tabulator("#listBody", {
    layout: "fitColumns",
    height: "100%",
    data: [],
    columns: makeColumns(),

    editable: true,
    reactiveData: true,
  });


  table.on("cellEdited", async (cell) => {

    const row = cell.getRow().getData();

    try {

      let url;
      let method;

      if (row.id) {

        url = `/api/v1/part_inventory/${row.id}`;
        method = "PUT";

      } else {

        url = "/api/v1/part_inventory";
        method = "POST";

      }

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({

          part_no: row.part_no,
          rev: row.rev,
          lot_no: row.lot_no,

          prod_qty: Number(row.prod_qty || 0),
          ship_qty: Number(row.ship_qty || 0),
          stock_qty: Number(row.stock_qty || 0)

        })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      toast("Saved");

      await loadData();

    } catch (err) {

      toast(err.message, false);

    }

  });
}

async function loadData(
  keyword = ""
) {
  try {

    const qs =
      new URLSearchParams({
        q: keyword,
      });

    const rows =
      await jfetch(
        ENDPOINTS.list(
          qs.toString()
        )
      );

    table.setData(rows);

  } catch (e) {

    console.error(e);

    toast(
      e.message ||
      "Load failed",
      false
    );
  }
}

function bindSearch() {

  const box =
    els[UI.q];

  let timer;

  box.addEventListener(
    "input",
    () => {

      clearTimeout(
        timer
      );

      timer =
        setTimeout(
          () => {

            loadData(
              box.value.trim()
            );

          },
          300
        );
    }
  );
}

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    console.log(
      "Tabulator Version:",
      Tabulator.prototype.version
    );

    Object.values(UI)
      .forEach(
        id => {
          els[id] = $(id);
        }
      );

    initTable();

    bindSearch();
    bindAdd();

    await loadData();
  }
);