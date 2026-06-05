

import {
    $,
    jfetch,
    toast
}
    from "./api.js";

const API =
    "/icars";

let table;

function makeColumns() {

    return [



        {
            title: "Date",
            field: "issue_date",
            width: 110,

            formatter: function (cell) {

                const v = cell.getValue();

                if (!v) return "";

                const d = new Date(v);

                const day =
                    String(d.getDate()).padStart(2, "0");

                const month =
                    String(d.getMonth() + 1).padStart(2, "0");

                const year =
                    d.getFullYear();

                return `${day}/${month}/${year}`;
            },

            editor: function (cell, onRendered, success) {

                const input =
                    document.createElement("input");

                input.type = "date";

                const value =
                    cell.getValue();

                input.value =
                    value || "";

                onRendered(() => {
                    input.focus();
                });

                input.addEventListener(
                    "change",
                    () => success(input.value)
                );

                input.addEventListener(
                    "blur",
                    () => success(input.value)
                );

                return input;
            }
        },

        {
            title: "No",
            field: "icar_no",
            editor: "input",
            width: 80
        },
        {
            title: "Operator",
            field: "operator_name",
            editor: "input",
            width: 80
        },
        {
            title: "Lot",
            field: "lot_no",
            width: 100,

            editor: "list",

            editorParams: {

                autocomplete: true,

                filterRemote: true,

                valuesURL: "/api/v1/icars/lots/search"
            }
        },

        {
            title: "Part No",
            field: "part_no",

            width: 100
        },

        {
            title: "Part Name",
            field: "part_name",

            width: 180
        },

        {
            title: "Rev",
            field: "rev",

            width: 80
        },

        {
            title: "PO",
            field: "po_no",

            width: 140
        },

        {
            title: "Customer",
            field: "customer_code",

            width: 80
        },





        {
            title: "Lot Qty",
            field: "lot_qty",
            editor: "number",
            width: 80
        },

        {
            title: "Defect Qty",
            field: "defect_qty",
            editor: "number",
            width: 100
        },

        {
            title: "Defect %",
            field: "defect_percent",
            width: 100,

            formatter: function (cell) {

                const row = cell.getRow().getData();

                const lotQty =
                    Number(row.lot_qty || 0);

                const defectQty =
                    Number(row.defect_qty || 0);

                if (lotQty <= 0) {
                    return "0.00";
                }

                return (
                    (defectQty / lotQty) * 100
                ).toFixed(2);
            }
        },


        {
            title: "Remark",
            field: "remark",
            editor: "input",
            width: 200
        },

        {
            title: "Word",

            width: 90,

            formatter: () =>
                "<button class='btn'>📄 Word</button>",

            cellClick: (e, cell) => {

                const row =
                    cell.getRow()
                        .getData();

                window.location =
                    `/api/v1/icars/${row.id}/export-word`;

            }
        },

        {
            title: "Status",
            field: "status",
            editor: "list",
            width: 120,
            editorParams: {
                values: [
                    "open",
                    "pending",
                    "approved",
                    "closed"
                ]
            }
        },

        {
            title: "Delete",
            formatter: () =>
                "<button class='btn '>Delete</button>",

            width: 100,

            cellClick: (e, cell) => {

                deleteICAR(
                    cell.getRow()
                );

            }
        }

    ];

}

async function loadData(q = "") {

    const url =
        q
            ? `${API}/keyset?q=${encodeURIComponent(q)}`
            : `${API}/keyset`;

    const result =
        await jfetch(url);

    table.setData(
        result.items || []
    );

}

async function createICAR() {

    const result =
        await jfetch(
            API,
            {
                method: "POST",
                body: JSON.stringify({
                    status: "open"

                })
            }
        );

    table.addData(
        [result],
        true
    );

}

async function saveRow(row) {

    const data =
        row.getData();

    await jfetch(
        `${API}/${data.id}`,
        {
            method: "PATCH",
            body: JSON.stringify(data)
        }
    );

    toast("Saved");

}

async function deleteICAR(row) {

    const data =
        row.getData();

    if (
        !confirm(
            `Delete ${data.icar_no || data.id}?`
        )
    ) {
        return;
    }

    await jfetch(
        `${API}/${data.id}`,
        {
            method: "DELETE"
        }
    );

    row.delete();

    toast("Deleted");

}

document.addEventListener(
    "DOMContentLoaded",
    () => {

        table =
            new Tabulator(
                "#listBody",
                {
                    layout: "fitColumns",

                    height: "100%",

                    columns:
                        makeColumns(),

                    placeholder:
                        "No ICAR Found"
                }
            );

        const params =
            new URLSearchParams(
                window.location.search
            );

        const q =
            params.get("q") || "";

        if (q) {

            document.getElementById("_q").value =
                q;

            loadData(q);

        } else {

            loadData();

        }



        table.on("cellEdited", async (cell) => {

            const row =
                cell.getRow();

            const data =
                row.getData();

            // =========================
            // AUTO DEFECT %
            // =========================

            if (
                cell.getField() === "lot_qty" ||
                cell.getField() === "defect_qty"
            ) {

                const lotQty =
                    Number(data.lot_qty || 0);

                const defectQty =
                    Number(data.defect_qty || 0);

                const defectPercent =
                    lotQty > 0
                        ? (defectQty / lotQty) * 100
                        : 0;

                data.defect_percent =
                    Number(defectPercent.toFixed(2));

                await row.update({
                    defect_percent:
                        data.defect_percent
                });
            }

            // =========================
            // LOT LOOKUP
            // =========================

            if (cell.getField() === "lot_no") {

                const info =
                    await jfetch(
                        `/icars/lookup/lot/${encodeURIComponent(cell.getValue())}`
                    );

                console.log(info);

                await row.update({

                    lot_id: info.lot_id,

                    customer_code: info.customer_code,

                    po_no: info.po_no,

                    part_no: info.part_no,

                    part_name: info.part_name,

                    rev: info.rev

                });


                console.log(
    "ROW AFTER UPDATE",
    row.getData()
);
            }

            await saveRow(row);

        });


        document.getElementById("_add")
            .addEventListener(
                "click",
                createICAR
            );

        document.getElementById("_q")
            .addEventListener(
                "input",
                (e) => {
                    loadData(e.target.value);
                }
            );





    }
);