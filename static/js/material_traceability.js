import { $, jfetch } from "./api.js";

let lotOptions = [];
let batchOptions = [];

const ENDPOINT = "/material-traceability";
let table = null;

async function loadBatchOptions() {

    batchOptions =
        await jfetch("/material-traceability/batch-options");

    console.log(batchOptions);
}

function showToast(
    message,
    type = "success"
) {

    const el =
        document.getElementById(
            "appToast"
        );

    const body =
        el.querySelector(
            ".toast-body"
        );

    body.textContent = message;

    el.classList.remove(
        "text-bg-success",
        "text-bg-danger"
    );

    el.classList.add(
        type === "success"
            ? "text-bg-success"
            : "text-bg-danger"
    );

    const toast =
        bootstrap.Toast.getOrCreateInstance(el);

    toast.show();
}

function makeColumns() {
    return [

        {
            title: "",
            width: 80,
            hozAlign: "center",
            formatter() {
                return `
            <button class="btn btn-sm btn-primary">
                Edit
            </button>
        `;
            },
            cellClick(e, cell) {

                const row = cell.getRow().getData();

                location.href =
                    `/static/traveler-detail.html?lot_id=${row.lot_id}`;
            }
        },
        {
            title: "Lot No",
            field: "lot_no",
            // editor: "input",

            // async cellEdited(cell) {

            //     const oldValue = cell.getOldValue();

            //     try {

            //         const row = cell.getRow().getData();

            //         await jfetch(
            //             `/material-traceability/production-lots/${row.lot_id}`,
            //             {
            //                 method: "PUT",
            //                 headers: {
            //                     "Content-Type": "application/json"
            //                 },
            //                 body: JSON.stringify({
            //                     lot_no: row.lot_no
            //                 })
            //             }
            //         );

            //         showToast(
            //             "Batch updated successfully",
            //             "success"
            //         );

            //         await loadData(
            //             $("#_q")?.value || ""
            //         );

            //     } catch (err) {

            //         console.error(err);

            //         cell.setValue(oldValue, true);

            //         showToast(
            //             "Failed to update batch",
            //             "danger"
            //         );
            //     }
            // }
        },
        {
            title: "Part No",
            field: "part_no",
            width: 110
        },
        {
            title: "Batch",
            field: "batch_id",
            width: 300,

            formatter(cell) {

                const item = batchOptions.find(
                    x => x.value == cell.getValue()
                );

                return item?.label || "";
            },

            editor: "list",

            editorParams() {
                return {
                    values: batchOptions,

                    autocomplete: true,
                    filterFunc: function (term, label) {
                        return label
                            .toLowerCase()
                            .includes(term.toLowerCase());
                    },

                    listOnEmpty: true,
                    allowEmpty: false,
                    freetext: false
                };
            },

            async cellEdited(cell) {

                const oldValue = cell.getOldValue();

                try {

                    const row = cell.getRow().getData();

                    await jfetch(
                        `/material-traceability/lot-material-use/${row.lot_material_use_id}`,
                        {
                            method: "PUT",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                batch_id: row.batch_id
                            })
                        }
                    );

                    showToast(
                        "Batch updated successfully",
                        "success"
                    );

                    await loadData();

                } catch (err) {

                    console.error(err);

                    cell.setValue(oldValue, true);

                    showToast(
                        "Failed to update batch",
                        "danger"
                    );
                }
            }
        }
        ,


        // {
        //     title: "Lot",
        //     field: "lot_no",
        //     width: 130,
        //     formatter(cell) {

        //         const row = cell.getRow().getData();

        //         return `
        //             <a href="/static/traveler-detail.html?lot_id=${row.lot_id}">
        //             ${cell.getValue()}
        //             </a>
        //         `;
        //     }
        // },



        // {
        //     title: "Mat PO",
        //     field: "mat_po",
        //     width: 140
        // },
        {
            title: "Mat PO",
            field: "batch_no"
        },

        {
            title: "Type",
            field: "material_type",
            width: 100
        },

        {
            title: "Spec",
            field: "material_spec",
            width: 120
        },

        {
            title: "Supplier",
            field: "supplier_name",
            width: 180
        },
        {
            title: "Batch Size",
            field: "size_text",
            width: 150
        },
        {
            title: "Cutting Note",
            field: "cutting_note",
            minWidth: 100,
            formatter: "textarea"
        },

        {
            title: "PO Note",
            field: "po_note",
            minWidth: 250,
            formatter: "textarea"
        },




        {
            title: "Heat Lot",
            field: "heat_lot",
            width: 110
        },



        // {
        //     title: "Batch Length",
        //     field: "length_text",
        //     width: 150
        // },

        {
            title: "Del",
            width: 70,
            hozAlign: "center",

            formatter() {
                return `
             <button class="btn btn-sm btn-danger">
            🗑
        </button>
        `;
            },

            async cellClick(e, cell) {

                const row =
                    cell.getRow().getData();

                if (
                    !confirm(
                        `Delete Lot ${row.lot_no}?`
                    )
                ) {
                    return;
                }

                try {

                    await jfetch(
                        `/material-traceability/lot-material-use/${row.lot_material_use_id}`,
                        {
                            method: "DELETE"
                        }
                    );

                    showToast(
                        "Record deleted",
                        "success"
                    );

                    await loadData(
                        document.getElementById("_q")?.value || ""
                    );

                } catch (err) {

                    console.error(err);

                    showToast(
                        "Delete failed",
                        "danger"
                    );
                }
            }
        },


    ];
}

async function loadData(keyword = "") {

    try {


        let url = ENDPOINT;

        if (keyword) {
            url += `?q=${encodeURIComponent(keyword)}`;
        }

        const rows = await jfetch(url);

        table.setData(rows);


    } catch (err) {


        console.error(err);

    }
}

function initTable() {

    table = new Tabulator("#listBody", {
        
        height: "100%",
        placeholder: "No Material Traceability Records",
        movableColumns: true,
        pagination: true,
        paginationSize: 50,
        columns: makeColumns(),


        initialSort: [
            {
                column: "lot_no",
                dir: "desc"
            },

        ]


    });

    loadData();
}

function bindSearch() {

    const box =
        document.getElementById("_q");

    console.log("BOX =", box);

    if (!box) return;

    let timer;

    box.addEventListener("input", () => {
        console.log("SEARCH =", box.value);
        clearTimeout(timer);
        timer = setTimeout(() => {
            loadData(box.value);
        }, 300);

    });
}
async function loadModalOptions() {

    lotOptions =
        await jfetch(
            "/material-traceability/lot-options"
        );

    const lots = lotOptions;

    document.getElementById("lotList").innerHTML =
        lots.map(x =>
            `<option value="${x.label}"></option>`
        ).join("");

    const lotSelect =
        document.getElementById("_lot_id");

    lotSelect.innerHTML =
        lots.map(x =>
            `<option value="${x.value}">
                ${x.label}
            </option>`
        ).join("");

    document.getElementById("batchList").innerHTML =
        batchOptions.map(x =>
            `<option value="${x.label}"></option>`
        ).join("");
}
document.addEventListener("DOMContentLoaded", async () => {

    await loadBatchOptions();

    initTable();

    bindSearch();

    document
        .getElementById("_add")
        .addEventListener("click", async () => {

            await loadModalOptions();

            document
                .getElementById("addPanel")
                .style.display = "block";
        });

    document
        .getElementById("_save")
        .addEventListener("click", async () => {

            try {

                const lotLabel =
                    document.getElementById("_lot_id").value;

                const lot =
                    lotOptions.find(
                        x => x.label === lotLabel
                    );

                if (!lot) {
                    showToast(
                        "Please select valid lot",
                        "danger"
                    );
                    return;
                }

                const lot_id = lot.value;

                const batchLabel =
                    document.getElementById("_batch_id").value;

                const batch =
                    batchOptions.find(
                        x => x.label === batchLabel
                    );

                if (!batch) {
                    showToast(
                        "Please select valid batch",
                        "danger"
                    );
                    return;
                }

                const batch_id = batch.value;

                await jfetch(
                    "/material-traceability",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            lot_id,
                            batch_id
                        })
                    }
                );

                document
                    .getElementById("addPanel")
                    .style.display = "none";

                await loadData();

                showToast(
                    "Material Traceability added",
                    "success"
                );

            } catch (err) {

                console.error(err);

                showToast(
                    "Failed to add record",
                    "danger"
                );
            }
        });
    document
        .getElementById("_cancelAdd")
        .addEventListener("click", () => {

            document
                .getElementById("addPanel")
                .style.display = "none";
        });

});