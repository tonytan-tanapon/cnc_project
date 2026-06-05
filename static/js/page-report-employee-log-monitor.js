import {
    jfetch
}
    from "./api.js";

let table;

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

    for (let i = 0; i < 10; i++) {

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
            "S",
            "M",
            "T",
            "W",
            "TH",
            "F",
            "S"
        ];

        const dayShort =
            dayNames[d.getDay()];

        columns.push({

            title: `${dayShort}<br>${key.slice(5)}`,

            field: key,

            width: 85,

            hozAlign: "center",

            headerHozAlign: "center",

            headerVertical: false,

            cssClass: isMonday
                ? "monday-col"
                : "",

            formatter(cell){

  const v =
    cell.getValue();

  if(!v){
    return "";
  }

  return `
    <span
      style="
        font-size:11px;
        font-weight:600;
        color:#2563eb;
      "
      title="${v}"
    >
      ${v}
    </span>
  `;
}

        });

    }

   

    return columns;
}

async function loadData() {
    const rows =
        await jfetch(
            "/api/v1/reports_traveler/employee-log-monitor"
        );
    table.setData(rows);
}
async function exportExcel() {

    const rows =
        table.getData("active");

    const wsData = [];

    const header = [
        "OP",
        "Nickname"
    ];

    for(let i=0;i<10;i++){

        const d = new Date();

        d.setDate(
            d.getDate() - i
        );

        const dayNames = [
            "S","M","T","W","TH","F","S"
        ];

        const dayShort =
            dayNames[d.getDay()];

        header.push(
            `${dayShort} ${d.toISOString().slice(0,10)}`
        );
    }

    wsData.push(header);

    rows.forEach(r => {

        const row = [
            r.emp_op,
            r.nickname
        ];

        for(let i=0;i<10;i++){

            const d = new Date();

            d.setDate(
                d.getDate() - i
            );

            const key =
                d.toISOString().slice(0,10);

            row.push(
                r[key] || ""
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
        ...Array(10).fill({ wch: 18 })
    ];

    XLSX.utils.book_append_sheet(
        wb,
        ws,
        "Employee Log"
    );

    XLSX.writeFile(
        wb,
        `Employee_Log_${new Date().toISOString().slice(0,10)}.xlsx`
    );
}

async function init() {

    table = new Tabulator(
        "#listBody",
        {

            layout: "fitColumns",

            columns:
                buildColumns(),

            initialSort: [
                {
                    column: "emp_op",
                    dir: "asc"
                }
            ],

            rowFormatter(row) {

                const d =
                    row.getData();

                if (
                    d.missing_days >= 5
                ) {
                    row.getElement()
                        .classList
                        .add("late-row");
                }
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
    .getElementById(
      "btnExport"
    )
    .onclick =
    exportExcel;

}

init();