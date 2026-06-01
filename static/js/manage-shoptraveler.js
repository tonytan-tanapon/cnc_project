// /static/js/manage-shoptraveler.js

import { $, jfetch, toast } from "./api.js";

/* ===================================== */
/* CONFIG */
/* ===================================== */

const API_URL =
    "/api/v1/reports/shop-traveler-status";

const UI = {
    q: "_q",
    reload: "_reload",
    export: "_export",
    table: "listBody",
};

/* ===================================== */
/* STATE */
/* ===================================== */

let els = {};
let table = null;

/* ===================================== */
/* FORMAT */
/* ===================================== */

function formatDate(v) {

    if (!v) return "";

    const d = new Date(v);

    const mm =
        String(d.getMonth() + 1)
            .padStart(2, "0");

    const dd =
        String(d.getDate())
            .padStart(2, "0");

    const yy =
        String(d.getFullYear())
            .slice(-2);

    return `${mm}/${dd}/${yy}`;
}

/* ===================================== */
/* EXPORT */
/* ===================================== */

function exportExcel() {

    table.download(
        "xlsx",
        "shop_traveler_status.xlsx",
        {

            sheetName:
                "ShopTraveler",

            downloadDataFormatter:
                (data) => {

                    return data.map((d) => ({

                        Lot:
                            d.lot_no,

                        Part:
                            d.part_no,

                        Rev:
                            d.rev,

                        Customer:
                            d.customer_code,

                        "Current OP":
                            d.step_code,

                        "Current Step":
                            d.step_name,

                        "OP Status":
                            d.op_status,

                        Progress:
                            d.progress_percent,

                        Operator:
                            d.operator_name,

                        Machine:
                            d.machine_code,

                        Receive:
                            d.total_receive,

                        Accept:
                            d.total_accept,

                        Reject:
                            d.total_reject,

                        Remain:
                            d.remain_qty,

                        "Last Activity":
                            formatDate(
                                d.last_work_date
                            ),

                    }));
                },
        }
    );
}

/* ===================================== */
/* COLUMNS */
/* ===================================== */

function makeColumns() {

    return [

        /* ===================================== */
        /* LOT */
        /* ===================================== */

        {
            title: "Lot",
            field: "lot_no",
            width: 80,

            formatter: (cell) => {

                const row =
                    cell.getRow().getData();

                return `

          <div style="
            display:flex;
            align-items:center;
            gap:6px;
          ">

            <a
              href="/static/traveler-detail.html?lot_id=${row.lot_id}"
              style="
                color:#2563eb;
                text-decoration:underline;
                font-weight:600;
              "
            >
              ${row.lot_no || ""}
            </a>

          </div>

        `;
            },
        },

        /* ===================================== */
        /* PART */
        /* ===================================== */

        {
            title: "Part",
            field: "part_no",
            width: 100,

            formatter: (cell) => {

                const row =
                    cell.getRow().getData();

                return `

                <div class="op-card">

                    <div class="op-title">
                        ${row.part_no || ""}
                    </div>

                    <div class="op-sub">
                        REV: ${row.rev || "-"}
                    </div>

                </div>

            `;
            },
        },

        /* ===================================== */
        /* CUSTOMER */
        /* ===================================== */
        {
            title: "Customer",
            field: "customer_code",
            width: 80,
        },

        /* ===================================== */
        /* CURRENT OP */
        /* ===================================== */
        {
            title: "OP",
            field: "current_op",
            width: 160,

            formatter: (cell) => {

                const row =
                    cell.getRow().getData();

                return `

<div class="op-card">

    <div style="
        font-weight:700;
        color:#2563eb;
        font-size:14px;
    ">
        ${row.current_op || "-"}
    </div>

    <div class="op-sub">
        ${row.current_operation || ""}
    </div>

</div>

        `;
            },
        },
        /* ===================================== */
        /* OPERATOR */
        /* ===================================== */

        /* ===================================== */
        /* OPERATOR */
        /* ===================================== */

        {
            title: "Operator",
            field: "current_operator",
            width: 80,
            sorter: "string",

            formatter: (cell) => {

                return `
            <div>
                ${cell.getValue() || "-"}
            </div>
        `;
            },
        },

        /* ===================================== */
        /* MACHINE */
        /* ===================================== */

        {
            title: "Machine",
            field: "current_machine",
            width: 80,
            sorter: "string",
        },

        /* ===================================== */
        /* RECEIVE */
        /* ===================================== */

        {
            title: "Incomming",
            field: "current_receive",
            width: 90,
            hozAlign: "right",
        },

        /* ===================================== */
        /* ACCEPT */
        /* ===================================== */

        {
            title: "Accept",
            field: "current_accept",
            width: 90,
            hozAlign: "right",
        },

        /* ===================================== */
        /* REJECT */
        /* ===================================== */

        {
            title: "Reject",
            field: "current_reject",
            width: 90,
            hozAlign: "right",
        },

        /* ===================================== */
        /* REMAIN */
        /* ===================================== */

        {
            title: "Remain",
            field: "current_remain",
            width: 90,
            hozAlign: "right",
        },

        {
            title: "First Input",
            field: "first_input_qty",
            width: 110,
            hozAlign: "right",
        },

        {
            title: "Final Good",
            field: "final_good_qty",
            width: 110,
            hozAlign: "right",
        },

        {
            title: "Yield %",
            field: "production_yield",
            width: 110,
            hozAlign: "right",

            formatter: function (cell) {

                const v =
                    Number(
                        cell.getValue() || 0
                    );

                let color = "#ef4444";

                if (v >= 95)
                    color = "#10b981";

                else if (v >= 80)
                    color = "#f59e0b";

                return `
            <div style="
                font-weight:700;
                color:${color};
            ">
                ${v.toFixed(2)}%
            </div>
        `;
            }
        },
        /* ===================================== */
        /* PROGRESS */
        /* ===================================== */
        {
            title: "% Progress",
            field: "progress_percent",
            width: 120,
            hozAlign: "center",

            sorter: (a, b) => {
                return Number(a || 0) - Number(b || 0);
            },

            formatter: (cell) => {

                const v =
                    Number(
                        cell.getValue() || 0
                    );

                let color =
                    "#ef4444";

                if (v >= 100)
                    color = "#10b981";

                else if (v >= 50)
                    color = "#f59e0b";

                else if (v > 0)
                    color = "#3b82f6";

                return `
            <div
            class="progress-bar"
            style="
                position:relative;
                height:22px;
            "
            >

            <div
                class="progress-inner"
                style="
                width:${v}%;
                background:${color};
                height:100%;
                "
            ></div>

            <div style="
                position:absolute;
                top:0;
                left:0;
                width:100%;
                height:100%;

                display:flex;
                align-items:center;
                justify-content:center;

                color:black;
                font-weight:700;
                font-size:12px;
            ">

                ${v.toFixed(0)}%

            </div>

            </div>
            `;
            },
        },



        /* ===================================== */
        /* STATUS */
        /* ===================================== */

        {
            title: "OP Status",
            field: "current_status",
            width: 110,
            hozAlign: "center",

            formatter: (cell) => {

                const v =
                    String(
                        cell.getValue() || ""
                    ).toLowerCase();

                const colors = {

                    pending:
                        "#6b7280",

                    running:
                        "#3b82f6",

                    // passed:
                    //     "#10b981",

                    failed:
                        "#ef4444",

                };

                return `

                <span style="
                    background:${colors[v] || "#6b7280"};
                    color:white;
                    padding:4px 8px;
                    border-radius:8px;
                    font-weight:700;
                    display:inline-block;
                    min-width:80px;
                    text-align:center;
                ">

                 ${v}

                </span>

        `;
            },
        },

        /* ===================================== */
        /* PREVIOUS OP */
        /* ===================================== */

        // {
        //     title: "Previous OP",
        //     field: "previous_op_code",
        //     width: 130,

        //     formatter: (cell) => {

        //         const row =
        //             cell.getRow().getData();

        //         return `

        //   <div class="op-card">

        //     <div style="
        //       font-weight:700;
        //       color:#6b7280;
        //     ">
        //       ${row.previous_op_code || "-"}
        //     </div>

        //     <div class="op-sub">
        //       ${row.previous_op_name || ""}
        //     </div>

        //   </div>

        // `;
        //     },
        // },


        {
            title: "Lot Status",
            field: "lot_status",
            width: 140,
            hozAlign: "center",

            editor: "select",

            editorParams: {
                values: {
                    not_start: "Not Start",
                    in_process: "In Process",
                    shipped: "Shipped",
                    completed: "Completed",
                    canceled: "Canceled",
                }
            },

            formatter: (cell) => {
                const v = cell.getValue();
                const colors = {
                    not_start: "#6b7280",
                    in_process: "#3b82f6",
                    hold: "#f59e0b",
                    completed: "#10b981",
                    canceled: "#ef4444",
                };

                return `
        <span style="
            background:${colors[v] || "#6b7280"};
            color:white;
            padding:4px 8px;
            border-radius:6px;
            font-weight:600;
        ">
            ${v || ""}
        </span>
        `;
            },

            cellEdited: async (cell) => {
                const row =
                    cell.getRow().getData();

                try {
                    await jfetch(
                        `/api/v1/lots/${row.lot_id}/status`,
                        {
                            method: "PUT",
                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                status:
                                    cell.getValue()
                            })
                        }
                    );
                    toast("Lot status updated");

                } catch (err) {
                    toast("Update failed", false);
                    cell.restoreOldValue();
                }
            }
        },

        /* ===================================== */
        /* LAST ACTIVITY */
        /* ===================================== */

        {
            title: "Last Activity",
            field: "last_work_date",
            width: 120,
            formatter: (cell) =>
                formatDate(
                    cell.getValue()
                ),
        },
    ];
}

/* ===================================== */
/* FILTER */
/* ===================================== */

function applyFilter() {
    const q =
        els[UI.q]
            .value
            .trim()
            .toLowerCase();

    const status =
        document.querySelector(
            'input[name="lot_status"]:checked'
        )?.value || "";

    table.clearFilter(true);

    /* SEARCH */

    if (q) {
        table.addFilter((d) => {
            return (
                String(
                    d.lot_no || ""
                )
                    .toLowerCase()
                    .includes(q)

                ||

                String(
                    d.part_no || ""
                )
                    .toLowerCase()
                    .includes(q)

                ||

                String(
                    d.customer_code || ""
                )
                    .toLowerCase()
                    .includes(q)

                ||

                String(
                    d.current_op || ""
                )
                    .toLowerCase()
                    .includes(q)

            );
        });
    }

    /* STATUS */

    if (status) {
        table.addFilter(
            "current_status",
            "=",
            status
        );
    }
}

/* ===================================== */
/* LOAD */
/* ===================================== */

async function loadData() {

    els[UI.reload]
        .disabled = true;

    try {
        const rows =
            await jfetch(API_URL);

        console.log(
            "shop traveler rows",
            rows
        );
        table.setData(rows);

        applyFilter();

        table.setSort(
            "progress_percent",
            "desc"
        );

        toast(
            `Loaded ${rows.length} travelers`
        );

    } catch (err) {

        console.error(err);

        toast(
            err?.message ||
            "Load failed",
            false
        );
    }

    els[UI.reload]
        .disabled = false;
}

/* ===================================== */
/* INIT TABLE */
/* ===================================== */

function initTable() {

    table =
        new Tabulator(
            `#${UI.table}`,
            {
                layout:
                    "fitColumns",

                height:
                    "100%",

                placeholder:
                    "No traveler data",

                columns:
                    makeColumns(),

                initialSort: [
                    {
                        column:
                            "progress_percent",

                        dir:
                            "desc",
                    },
                ],
            }
        );

    window.table =
        table;
}

/* ===================================== */
/* START */
/* ===================================== */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        Object
            .values(UI)
            .forEach((id) => {

                els[id] = $(id);

            });

        initTable();
        loadData();
        /* SEARCH */

        els[UI.q]
            .addEventListener(
                "input",
                () => {

                    clearTimeout(
                        window._flt
                    );

                    window._flt =
                        setTimeout(
                            applyFilter,
                            300
                        );
                }
            );

        /* EXPORT */

        els[UI.export]
            .addEventListener(
                "click",
                exportExcel
            );

        /* RADIO */

        document
            .querySelectorAll(
                'input[name="lot_status"]'
            )
            .forEach((radio) => {

                radio
                    .addEventListener(
                        "change",
                        applyFilter
                    );

            });

        /* RELOAD */

        els[UI.reload]
            .addEventListener(
                "click",
                loadData
            );

    }
);