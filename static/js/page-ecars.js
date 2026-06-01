import {
    $,
    jfetch,
    toast
}
    from "./api.js";

const API =
    "/ecars";

let table;

function makeColumns() {

    return [



        {
            title: "ECAR No",
            field: "ecar_no",
            editor: "input",
            width: 120
        },
        {
            title: "Lot",
            field: "lot_no",
            width: 120,

            editor: "list",

            editorParams: {

                autocomplete: true,

                filterRemote: true,

                valuesURL:
                    "/api/v1/ecars/lots/search"
            }
        },
        {
            title: "Part No",
            field: "part_no",
            width: 120
        },
        {
            title: "Part Name",
            field: "part_name",
            width: 200
        },
        {
            title: "PO",
            field: "po_no",
            width: 120
        },
        {
            title: "Customer",
            field: "customer_code",
            width: 120
        },
        {
            title: "Shipped",
            field: "shipped_qty",
            editor: "number",
            width: 100
        },
        {
            title: "RTV",
            field: "rtv_qty",
            editor: "number",
            width: 100
        },
        {
            title: "Rework",
            field: "customer_rework_qty",
            editor: "number",
            width: 100
        },
        {
            title: "Use As Is",
            field: "use_as_is_qty",
            editor: "number",
            width: 100
        },
        {
            title: "Defect %",
            field: "defect_percent",
            width: 100,

            mutator: function (value, data) {

                const shipped =
                    Number(data.shipped_qty || 0);

                const defect =
                    Number(data.rtv_qty || 0) +
                    Number(data.customer_rework_qty || 0) +
                    Number(data.use_as_is_qty || 0);

                if (!shipped) return "0.00";

                return (
                    defect / shipped * 100
                ).toFixed(2);
            }
        },
        {
            title: "Remark",
            field: "remark",
            editor: "input",
            width: 250
        },
        {
            title: "Status",
            field: "status",
            editor: "list",
            width: 120,
            editorParams: {
                values: [
                    "open",
                    "investigating",
                    "waiting_customer",
                    "closed"
                ]
            }
        },

        {
            title: "",
            width: 80,
            hozAlign: "center",
            formatter: function () {
                return `
            <button class="btn-danger">
                Delete
            </button>
        `;
            },
            cellClick: async function (e, cell) {

                const row =
                    cell.getRow();

                await deleteECAR(row);

            }
        },

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

async function createECAR() {

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

    data.shipped_qty =
        Number(data.shipped_qty || 0);

    data.rtv_qty =
        Number(data.rtv_qty || 0);

    data.customer_rework_qty =
        Number(data.customer_rework_qty || 0);

    data.use_as_is_qty =
        Number(data.use_as_is_qty || 0);

    data.defect_percent =
        Number(data.defect_percent || 0);

    await jfetch(
        `${API}/${data.id}`,
        {
            method: "PATCH",
            body: JSON.stringify(data)
        }
    );

    toast("Saved");
}

async function deleteECAR(row) {

    const data =
        row.getData();

    if (
        !confirm(
            `Delete ${data.ecar_no || data.id}?`
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
                        "No ECAR Found"
                }
            );



        table.on("cellEdited", async (cell) => {

            const row =
                cell.getRow();

            const data =
                row.getData();

            // =========================
            // AUTO DEFECT %
            // =========================

            if (
                [
                    "shipped_qty",
                    "rtv_qty",
                    "customer_rework_qty",
                    "use_as_is_qty"
                ].includes(cell.getField())
            ) {

                const shipped =
                    Number(data.shipped_qty || 0);

                const rtv =
                    Number(data.rtv_qty || 0);

                const rework =
                    Number(data.customer_rework_qty || 0);

                const useAsIs =
                    Number(data.use_as_is_qty || 0);

                let defectPercent = 0;

                if (shipped > 0) {

                    defectPercent =
                        (
                            rtv +
                            rework +
                            useAsIs
                        ) / shipped * 100;
                }

                await row.update({

                    // เก็บเป็น Number ไม่ใช่ String
                    defect_percent:
                        Number(
                            defectPercent.toFixed(2)
                        )

                });
            }

            // =========================
            // LOT LOOKUP
            // =========================

            if (cell.getField() === "lot_no") {

                const info =
                    await jfetch(
                        `/ecars/lookup/lot/${encodeURIComponent(cell.getValue())}`
                    );

                await row.update({

                    lot_id: info.lot_id,
                    lot_no: info.lot_no,
                    customer_code: info.customer_code,

                    po_no: info.po_no,

                    part_no: info.part_no,

                    part_name: info.part_name,

                    rev: info.rev

                });
            }

            await saveRow(row);

        });


        document.getElementById("_add")
            .addEventListener(
                "click",
                createECAR
            );

        document.getElementById("_q")
            .addEventListener(
                "input",
                (e) => {
                    loadData(e.target.value);
                }
            );

        loadData();



    }
);