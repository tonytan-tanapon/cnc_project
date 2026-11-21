import { $, jfetch, toast, withBase } from "./api.js";

const ENDPOINTS = {
  list: "/inventory",
  rebuild: "/inventory/rebuild",
  adjust: "/inventory/adjust",
};

let table;

function fmtQty(value) {
  if (value === null || value === undefined || value === "") {
    return "0";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function makeColumns() {

  return [

    {
      title: "Lot",
      field: "lot_no",
      width: 100,
      sorter: (a, b) =>
        String(a ?? "").localeCompare(String(b ?? ""), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
    },

    {
      title: "Part",
      field: "part_no",
      width: 120,
    },

    {
      title: "Rev",
      field: "rev",
      width: 80,
    },
    {
  title: "Customer",
  field: "customer_no",
  width: 130,
},

    {
      title: "Start<br>QTY",
      field: "qty_start",
      hozAlign: "right",
      width: 90,
    },
    {
      title: "Final<br>QTY",
      field: "qty_final",
      hozAlign: "right",
      width: 90,
    },

    {
      title: "Produced (old)",
      field: "qty_produced",
      hozAlign: "right",
      width: 120,
    },

    {
      title: "Ship",
      field: "qty_shipped",
      hozAlign: "right",
      width: 100,
    },

    {
      title: "On Hand",
      field: "qty_on_hand",
      hozAlign: "right",
      width: 120,
    },
    {
      title: "Adjust",
      field: "qty_adjust",
      hozAlign: "right",
      width: 100,

      editor: "number",

      // formatter: (cell) => {
      //   const el = cell.getElement();

      //   el.style.setProperty("background-color", "#fff3b0", "important");
      //   el.style.setProperty("font-weight", "bold", "important");

      //   return fmtQty(cell.getValue());
      // },

      cellEdited: async function (cell) {
        const { lot_id } = cell.getRow().getData();
        const qty = Number(cell.getValue());
        const oldValue = cell.getOldValue();

        if (!Number.isFinite(qty)) {
          cell.setValue(oldValue, true);
          toast("Enter a valid adjustment");
          return;
        }

        try {
          await jfetch(ENDPOINTS.adjust, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lot_id, qty }),
          });
        } catch (err) {
          console.error("Adjustment save failed:", err);
          cell.setValue(oldValue, true);
          toast("Save failed");
          return;
        }

        try {
          await loadData();
          toast("Saved");
        } catch (err) {
          console.error("Inventory reload failed:", err);
          toast("Saved, but the table could not reload");
        }
      },
    },

    {
      title: "Counted<br>QTY",
      field: "counted_qty",
      hozAlign: "right",
      width: 110,
      editor: "number",
      editorParams: { min: 0 },

      editable: (cell) =>
        !String(cell.getRow().getData().from_lot ?? "").trim(),

      formatter: (cell) => {
        const el = cell.getElement();

        el.style.setProperty("background-color", "#fff3b0", "important");
        el.style.setProperty("font-weight", "bold", "important");

        const value = cell.getValue();
        return value == null ? "" : fmtQty(value);
      },

      cellEdited: async function (cell) {
        const { lot_id } = cell.getRow().getData();
        const value = cell.getValue();
        const counted_qty = Number(value);

        if (
          value == null ||
          String(value).trim() === "" ||
          !Number.isFinite(counted_qty) ||
          counted_qty < 0
        ) {
          cell.restoreOldValue();
          toast("Enter a valid counted quantity");
          return;
        }

        try {
          await jfetch(ENDPOINTS.adjust, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lot_id, counted_qty }),
          });
        } catch (err) {
          console.error("Counted quantity save failed:", err);
          cell.restoreOldValue();
          toast("Save failed");
          return;
        }

        try {
          await loadData();
          toast("Saved");
        } catch (err) {
          console.error("Inventory reload failed:", err);
          toast("Saved, but the table could not reload");
        }
      },
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
          "good",
          "checked",
          "not_checked",
          "used",
          "scrap",
          "rework",
        ],
      },

      cellEdited: async function (cell) {
        const lotId = cell.getRow().getData().lot_id;
        const status = cell.getValue();
        const oldValue = cell.getOldValue();

        try {
          await jfetch(ENDPOINTS.adjust, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lot_id: lotId,
              status,
            }),
          });
        } catch (err) {
          console.error("Status save failed:", err);
          cell.setValue(oldValue, true);
          toast("Save failed");
          return;
        }

        try {
          await loadData();
          toast("Saved");
        } catch (err) {
          console.error("Inventory reload failed:", err);
          toast("Saved, but the table could not reload");
        }
      },
    },

    {
      title: "Container",
      field: "container",
      width: 130,
      editor: "list",
      editorParams: {
        values: {
          "": "—",

          egg: "Egg",
          bag: "Bag",
          box: "Box",
          tray: "Tray",
          rework: "Rework",
          wip: "WIP",
          mrb: "MRB"
        },
      },

      cellEdited: async function (cell) {
        const oldValue = cell.getOldValue();
        const { lot_id } = cell.getRow().getData();

        try {
          await jfetch(ENDPOINTS.adjust, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lot_id,
              container: cell.getValue() ?? "",
            }),
          });
        } catch (err) {
          console.error("Container save failed:", err);
          cell.restoreOldValue();
          toast("Save failed");
          return;
        }

        toast("Saved");
      },
    },

    // {
    //   title: "Container",
    //   field: "container",
    //   width: 230,

    //   formatter: (cell) => {
    //     const current = cell.getValue() ?? "";
    //     const wrapper = document.createElement("div");

    //     wrapper.style.cssText =
    //       "display:flex; align-items:center; gap:12px; height:100%;";

    //     for (const [value, text] of [
    //       ["tray", "Tray"],
    //       ["bag", "Bag"],
    //       ["box", "Box"],
    //       ["egg", "Egg"],
    //       ["rework", "Rework"],
    //       ["wip", "WIP"],
    //       ["mrb", "MRB"]
    //     ]) {
    //       const label = document.createElement("label");
    //       label.style.cssText =
    //         "display:flex; align-items:center; gap:4px; cursor:pointer;";

    //       const radio = document.createElement("input");
    //       radio.type = "radio";
    //       radio.value = value;
    //       radio.checked = current === value;

    //       label.append(radio, document.createTextNode(text));
    //       wrapper.append(label);

    //       radio.addEventListener("click", (e) => e.stopPropagation());

    //       radio.addEventListener("change", async () => {
    //         const inputs = wrapper.querySelectorAll("input");
    //         inputs.forEach((input) => {
    //           input.disabled = true;
    //         });

    //         try {
    //           const { lot_id } = cell.getRow().getData();

    //           await jfetch(ENDPOINTS.adjust, {
    //             method: "POST",
    //             headers: { "Content-Type": "application/json" },
    //             body: JSON.stringify({
    //               lot_id,
    //               container: value,
    //             }),
    //           });
    //         } catch (err) {
    //           console.error("Container save failed:", err);

    //           inputs.forEach((input) => {
    //             input.checked = input.value === current;
    //             input.disabled = false;
    //           });

    //           toast("Save failed");
    //           return;
    //         }

    //         cell.setValue(value);
    //         toast("Saved");
    //       });
    //     }

    //     return wrapper;
    //   },
    // },

    {
      title: "Note",
      field: "note",
      width: 250,
      editor: "input",

      cellEdited: async function (cell) {
        const oldValue = cell.getOldValue();

        try {
          const row = cell.getRow().getData();

          const updated = await jfetch(ENDPOINTS.adjust, {
            method: "POST",
            body: JSON.stringify({
              lot_id: row.lot_id,
              note: cell.getValue()
            })
          });

          cell.getRow().update(updated);
          toast("Saved");

        } catch (err) {
          cell.setValue(oldValue, true);
          toast("Save failed");
        }
      }
    },

    {
      title: "Used by<br>Other Lots",
      field: "used_by_other_lots",
      hozAlign: "right",
      width: 130,
    },
    {
      title: "From Lot",
      field: "from_lot",
      width: 110,
    },
    {
      title: "From Lot<br>QTY",
      field: "from_lot_qty",
      hozAlign: "right",
      width: 95,
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
    columns: makeColumns(),

    initialSort: [
      { column: "lot_no", dir: "asc" },
    ],
  });
}

let inventoryRequestId = 0;

async function loadData() {
  const requestId = ++inventoryRequestId;
  const search = $("_q")?.value.trim() ?? "";
  const params = new URLSearchParams({ limit: "200" });

  if (search) {
    params.set("q", search);
  }

  // const rows = await jfetch(`${ENDPOINTS.list}?${params}`);
  const rows = await jfetch(`${ENDPOINTS.list}?${params}`, {
    cache: "no-store",
  });
  if (requestId === inventoryRequestId) {
    await table.setData(rows);
  }
}

function bindSearch() {
  const box = $("_q");
  if (!box) return;

  let timer;

  box.addEventListener("input", () => {
    clearTimeout(timer);

    timer = setTimeout(async () => {
      try {
        await loadData();
      } catch (err) {
        console.error("Inventory search failed:", err);
        toast("Search failed");
      }
    }, 300);
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