import {
    jfetch
}
    from "./api.js";

let table;

let partFilter = "";

let daysBack = 30;

function applyPartFilter() {

    const input =
        document.getElementById("partFilter");

    partFilter =
        input.value
            .trim()
            .toLowerCase();

    if (!partFilter) {

        table.clearFilter();
        refreshTableRows();

        return;
    }

    table.setFilter(function (data) {

       for (let i = 0; i < daysBack; i++) {

            const d = new Date();
            d.setDate(d.getDate() - i);

            const key =
                d.toISOString().slice(0, 10);

            const items =
                data[key] || [];

            const found =
                items.some(v =>
                    String(v.part_no || "")
                        .toLowerCase()
                        .includes(partFilter)
                );

            if (found) {
                return true;
            }
        }

        return false;
    });

    refreshTableRows();
}

function buildColumns() {

    const columns = [

        {
            title: "OP",
            field: "emp_op",
            width: 90,
            frozen: true
        },

        {
            title: "Nickname",
            field: "nickname",
            width: 160,
            frozen: true
        }

    ];

    for (let i = 0; i < daysBack; i++) {
        const d = new Date();
        d.setDate(
            d.getDate() - i
        );

        const key =
            d.toISOString()
                .slice(0, 10);

        const isMonday =
            d.getDay() === 1;

        const dayNames = [
            "SUN",
            "MON",
            "TUE",
            "WED",
            "THU",
            "FRI",
            "SAT"
        ];

        const dayShort =
            dayNames[d.getDay()];

        const mmdd =
            `${String(d.getMonth() + 1).padStart(2, "0")}/` +
            `${String(d.getDate()).padStart(2, "0")}`;

        columns.push({

            title: `${dayShort}<br>${mmdd}`,

            field: key,
            width: 100,
            hozAlign: "center",
            headerHozAlign: "center",
            headerVertical: false,
            cssClass: isMonday
                ? "monday-col"
                : "",

            formatter(cell) {

                let items = cell.getValue();

                if (!items || !items.length) {
                    return "";
                }

                // ถ้ากำลังค้นหา Part
                // ให้แสดงเฉพาะ Part ที่ match
                if (partFilter) {
                    items = items.filter(v =>
                        String(v.part_no || "")
                            .toLowerCase()
                            .includes(partFilter)
                    );
                }

                if (!items.length) {
                    return "";
                }

                return items.map(v => `
        <a
            class="part-item"
            href="/static/traveler-detail.html?lot_id=${v.lot_id}"
            target="_blank"
        >
            <span class="part-no">
                ${v.part_no}
            </span>

            <span class="part-op">
                OP#${v.step_code || ""}
            </span>
        </a>
    `).join("");
            }
        });
    }
    return columns;
}

async function loadData() {
    const rows = await jfetch(
        `/api/v1/reports_traveler/employee-log-monitor?days_back=${daysBack}`
    );
    table.setData(rows);
    console.log("Data loaded:", rows);
}

async function exportExcel() {
    const rows =
        table.getData("active");
    const wsData = [];

    const header = ["OP", "Nickname"];

     for (let i = 0; i < daysBack; i++) {

        const d = new Date();

        d.setDate(
            d.getDate() - i
        );

        const dayNames = [
            "SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"
        ];

        const dayShort = dayNames[d.getDay()];

        header.push(`${dayShort} ${d.toISOString().slice(0, 10)}`);
    }

    wsData.push(header);

    rows.forEach(r => {

        const row = [
            r.emp_op,
            r.nickname
        ];

         for (let i = 0; i < daysBack; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            let items = r[key] || [];

            if (partFilter) {
                items = items.filter(v =>
                    String(v.part_no || "")
                        .toLowerCase()
                        .includes(partFilter)
                );
            }

            row.push(
                items
                    .map(v => `${v.part_no} OP#${v.step_code || ""}`)
                    .join("\n")
            );
        }

        wsData.push(row);

    });

    const wb =
        XLSX.utils.book_new();

    const ws =
        XLSX.utils.aoa_to_sheet(
            wsData
        );

    // Auto width
    ws["!cols"] = [
        { wch: 8 },
        { wch: 20 },
        ...Array(daysBack).fill({ wch: 18 })
    ];

    XLSX.utils.book_append_sheet(
        wb,
        ws,
        "Employee Log"
    );

    XLSX.writeFile(        wb,`Employee_Log_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
}

function refreshTableRows() {

    table.getRows().forEach(row => {
        row.reformat();
    });

    table.redraw(true);
}
async function init() {

    table = new Tabulator(
        "#listBody",
        {
            layout: "fitColumns",

            columns: buildColumns(),

            initialSort: [
                {
                    column: "emp_op",
                    dir: "asc"
                }
            ],

            rowFormatter(row) {

                const d = row.getData();

                if (d.missing_days >= 5) {
                    row.getElement()
                        .classList
                        .add("late-row");
                }

                const cells = row
                    .getElement()
                    .querySelectorAll(".tabulator-cell");

                cells.forEach(cell => {
                    cell.style.alignItems = "flex-start";
                });

                row.normalizeHeight();
            }
        }
    );

    await loadData();

    table.on("tableBuilt", () => {

        table.getColumns().forEach(col => {

            const field = col.getField();
            if (!field || !field.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return;
            }
            const d = new Date(field);

            if (d.getDay() === 1) {

                col.getElement().style.background =
                    "#fef08a";

                col.getElement().style.fontWeight =
                    "bold";
            }

        });

    });

    // document
    //     .getElementById("_q")
    //     .addEventListener(
    //         "keyup",
    //         function () {
    //             const q =
    //                 this.value
    //                     .toLowerCase();

    //             table.setFilter(
    //                 function (data) {

    //                     return (
    //                         String(
    //                             data.nickname || ""
    //                         )
    //                             .toLowerCase()
    //                             .includes(q)

    //                         ||

    //                         String(
    //                             data.emp_op || ""
    //                         )
    //                             .toLowerCase()
    //                             .includes(q)
    //                     );

    //                 }
    //             );

    //         }
    //     );

    // document
    //     .getElementById(
    //         "btnRefresh"
    //     )
    //     .onclick =
    //     loadData;

    document
        .getElementById("btnExport")
        .onclick = exportExcel;

// ==============================
// DAYS BACK
// ==============================

document
    .getElementById("daysBack")
    .addEventListener(
        "change",
        async function () {

            daysBack = parseInt(this.value, 10);

            // สร้าง column ใหม่
            table.setColumns(
                buildColumns()
            );

            // โหลดข้อมูลตามจำนวนวันที่เลือก
            await loadData();

            // ถ้ามี Part filter อยู่
            if (partFilter) {
                applyPartFilter();
            }

            table.redraw(true);
        }
    );
    // ==============================
    // PART FILTER
    // ==============================

    document
        .getElementById("partFilter")
        .addEventListener(
            "input",
            applyPartFilter
        );


    document
        .getElementById("btnClearPart")
        .addEventListener(
            "click",
            function () {

                document.getElementById("partFilter").value = "";

                partFilter = "";

                table.clearFilter();

                refreshTableRows();
            }
        );

}

init();