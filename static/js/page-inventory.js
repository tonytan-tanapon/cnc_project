import { $, jfetch, toast } from "./api.js";

const ENDPOINTS = {
  list: (qs) => `/part_inventory?${qs}`,
};

const UI = {
  q: "_q",
  table: "listBody",
};

let table = null;
let els = {};

function makeColumns() {
  return [

    {
      title: "Part",
      field: "part_no",
      width: 180,
    },

    {
      title: "Rev",
      field: "rev",
      width: 80,
    },

    {
      title: "Lot",
      field: "lot_no",
      width: 180,
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

  table.on("cellClick", (e, cell) => {
    console.log(
      "CELL CLICK",
      cell.getField()
    );
  });

  table.on("cellEdited", async (cell) => {

    console.log(
      "CELL EDITED",
      cell.getField(),
      cell.getValue()
    );

    const row =
      cell.getRow().getData();

    try {

      const res = await fetch(
        `/api/v1/part_inventory/${row.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            prod_qty:
              Number(row.prod_qty || 0),

            ship_qty:
              Number(row.ship_qty || 0),

            stock_qty:
              Number(row.stock_qty || 0)
          })
        }
      );

      if (!res.ok) {
        throw new Error(
          await res.text()
        );
      }

      toast("Saved");

      await loadData(
  els._q?.value?.trim() || ""
);

    } catch (err) {

      console.error(err);

      toast(
        err.message,
        false
      );
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

    await loadData();
  }
);