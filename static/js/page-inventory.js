import { $, jfetch, toast, withBase } from "./api.js";

const ENDPOINTS = {
  list: "/inventory",
  rebuild: "/inventory/rebuild",
  adjust: "/inventory/adjust",
};

let table;

function makeColumns() {

  return [

    {
      title: "Lot",
      field: "lot_no",
      width: 150,
    },

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
      title: "Stock",
      field: "qty_on_hand",
      hozAlign: "right",
      width: 100,
    },

    {
      title: "Adjust",
      field: "qty_adjust",
      hozAlign: "right",
      width: 100,


      editor: "number",
      formatter(cell) {
        cell.getElement().style.backgroundColor = "#fff3b0";
        return cell.getValue();
      },
      cellEdited: async function (cell) {

        const row = cell.getRow().getData();
        const value = Number(cell.getValue());
        const oldValue = Number(cell.getOldValue());

        try {

          const updated = await jfetch(
            ENDPOINTS.adjust,
            {
              method: "POST",
              body: JSON.stringify({
                lot_id: row.lot_id,
                qty: value
              })
            }
          );

          cell.getRow().update(updated);

          toast("Saved");

        } catch (err) {

          cell.setValue(oldValue, true);
          toast("Save failed");

        }
      }
    },



    {
      title: "Produced",
      field: "qty_produced",
      hozAlign: "right",
      width: 100,
    },

    {
      title: "Shipped",
      field: "qty_shipped",
      hozAlign: "right",
      width: 100,
    },

    // {
    //   title: "Scrap",
    //   field: "qty_scrap",
    //   hozAlign: "right",
    // },


    {
      title: "Status",
      field: "status",
      width: 140,
      editor: "list",
      editorParams: {
        values: [
          "normal",
          "checked",
          "not_checked"
        ]
      },

      cellEdited: async function (cell) {

        const row = cell.getRow().getData();

        const updated = await jfetch(
          ENDPOINTS.adjust,
          {
            method: "POST",
            body: JSON.stringify({
              lot_id: row.lot_id,
              qty: row.qty_adjust,
              note: row.note,
              status: cell.getValue()
            })
          }
        );

        cell.getRow().update(updated);

        toast("Saved");
      }
    },


    {
      title: "Note",
      field: "note",
      width: 250,
      editor: "input",

      cellEdited: async function (cell) {

        const row = cell.getRow().getData();

        try {

          const updated = await jfetch(
            ENDPOINTS.adjust,
            {
              method: "POST",
              body: JSON.stringify({
                lot_id: row.lot_id,
                qty: row.qty_adjust,
                note: cell.getValue()
              })
            }
          );

          cell.getRow().update(updated);

          toast("Saved");

        } catch (err) {

          toast("Save failed");

        }

      }
    },
    // {

    //   title: "",
    //   width: 100,

    //   formatter() {

    //     return `
    //                 <button class="btn btn-sm btn-primary">
    //                     Adjust
    //                 </button>
    //             `;

    //   },

    //   async cellClick(e, cell) {

    //     const row = cell.getRow().getData();

    //     const qty = prompt(
    //       `Adjust Qty (${row.lot_no})`,
    //       row.qty_adjust
    //     );

    //     if (qty === null) return;

    //     const updated = await jfetch(
    //       ENDPOINTS.adjust,
    //       {
    //         method: "POST",
    //         body: JSON.stringify({
    //           lot_id: row.lot_id,
    //           qty: Number(qty),
    //           note: "Manual"
    //         })
    //       }
    //     );

    //     cell.getRow().update({

    //       qty_adjust: updated.qty_adjust,
    //       qty_on_hand: updated.qty_on_hand,
    //       status: updated.status

    //     });

    //     toast("Adjusted");
    //   }

    // }

  ];

}

function initTable() {

  table = new Tabulator("#listBody", {

    layout: "fitColumns",

    height: "100%",

    data: [],

    columns: makeColumns()

  });

}

async function loadData() {

  const rows = await jfetch(
    ENDPOINTS.list
  );

  table.setData(rows);

}

function bindSearch() {

  const box = $("_q");

  if (!box) return;

  box.addEventListener("input", () => {

    const value = box.value.trim();

    table.setFilter([
      [
        {
          field: "lot_no",
          type: "like",
          value: value
        },
        {
          field: "part_no",
          type: "like",
          value: value
        }
      ]
    ]);

  });

}

function bindButtons() {

  $("_add").innerHTML = "Rebuild All";

  $("_add").onclick = async () => {

    await jfetch(
      ENDPOINTS.rebuild,
      {
        method: "POST"
      }
    );

    toast("Inventory Rebuilt");

    loadData();

  };

}

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    initTable();

    bindSearch();

    bindButtons();

    await loadData();

  }
);