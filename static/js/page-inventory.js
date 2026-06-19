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
      width: 120,
      hozAlign: "right",
      formatter(cell) {
        return Number(
          cell.getValue() || 0
        ).toLocaleString();
      }
    },

    {
      title: "Shipped",
      field: "ship_qty",
      width: 120,
      hozAlign: "right",
      formatter(cell) {
        return Number(
          cell.getValue() || 0
        ).toLocaleString();
      }
    },

    {
      title: "Stock",
      field: "stock_qty",
      width: 120,
      hozAlign: "right",
      formatter(cell) {
        return Number(
          cell.getValue() || 0
        ).toLocaleString();
      }
    },

    {
      title: "Part Total",
      field: "part_rev_total_qty",
      width: 140,
      hozAlign: "right",
      formatter(cell) {
        return Number(
          cell.getValue() || 0
        ).toLocaleString();
      }
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
        const row =
          cell.getRow().getData();

        console.log(
          "Transfer",
          row
        );

        toast(
          `Transfer ${row.lot_no}`
        );
      }
    }
  ];
}

function initTable() {
  table = new Tabulator(
    "#listBody",
    {
      layout: "fitColumns",
      height: "100%",
      placeholder: "No inventory",
      columns: makeColumns(),
    }
  );
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