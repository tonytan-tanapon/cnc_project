// page-attendance-summary.js
 const token =
      localStorage.getItem("token");

    if (!token) {
      location.href = "/static/login-attendance.html";
    }



const API = "/api/v1/reports/attendance-summary";

const table = new Tabulator("#listBody", {
    layout: "fitDataStretch",

    height: "100%",

    ajaxURL: API,

    pagination: true,
    paginationMode: "remote",
    paginationSize: 50,

    dataReceiveParams: {
        data: "data",
        last_page: "last_page",
    },

    placeholder: "No attendance data",

    columns: [
        {
            title: "Employee",
            field: "name",
            width: 300,
            frozen: true,

            formatter(cell) {

                const row = cell.getRow().getData();

                return `
                    <a
                        href="/static/attendance-detail.html?employee_id=${row.employee_id}"
                        style="color:#1976d2;text-decoration:underline;">
                        ${cell.getValue()}
                    </a>
                `;
            }
        },
        {
            title: "First Work",
            field: "first_work_date",
            width: 120,
            formatter(cell) {

                if (!cell.getValue()) return "";

                return new Date(cell.getValue())
                    .toLocaleDateString();

            }
        },

        {
            title: "Last Work",
            field: "last_work_date",
            width: 120,
            formatter(cell) {

                if (!cell.getValue()) return "";

                return new Date(cell.getValue())
                    .toLocaleDateString();

            }
        },

        {
            title: "Present",
            field: "present_days",
            hozAlign: "center",
            width: 100
        },

        {
            title: "Late",
            field: "late_days",
            hozAlign: "center",
            width: 80,
            formatter: cell => {

                const v = Number(cell.getValue() || 0);

                if (v == 0)
                    return v;

                return `<span style="color:#ff9800;font-weight:bold">${v}</span>`;

            }
        },

        {
            title: "Absent",
            field: "absent_days",
            hozAlign: "center",
            width: 100,
            formatter: cell => {

                const v = Number(cell.getValue() || 0);

                if (v == 0)
                    return v;

                return `<span style="color:red;font-weight:bold">${v}</span>`;

            }
        },

        {
            title: "Half",
            field: "half_days",
            hozAlign: "center",
            width: 80
        },

        {
            title: "Vacation",
            field: "vacation_days",
            hozAlign: "center",
            width: 120
        },

        {
            title: "Sick",
            field: "sick_days",
            hozAlign: "center",
            width: 80
        },

        {
            title: "",
            
            hozAlign: "center",
            width: 80
        },

        // {
        //     title: "Holiday",
        //     field: "holiday_days",
        //     hozAlign: "center",
        //     width: 110
        // },

        // {
        //     title: "Hours",
        //     field: "work_hours",
        //     hozAlign: "right",
        //     width: 90,
        //     formatter: "money",
        //     formatterParams: {
        //         precision: 2
        //     }
        // },

        // {
        //     title: "OT",
        //     field: "ot_hours",
        //     hozAlign: "right",
        //     width: 90,
        //     formatter: "money",
        //     formatterParams: {
        //         precision: 2
        //     }
        // },

        // {
        //     title: "Late Min",
        //     field: "late_minutes",
        //     hozAlign: "right",
        //     width: 110
        // },

        // {
        //     title: "Attendance %",
        //     field: "attendance_percent",
        //     hozAlign: "center",
        //     width: 120,
        //     formatter(cell) {

        //         const v = Number(cell.getValue() || 0);

        //         let color = "#28a745";

        //         if (v < 95)
        //             color = "#ff9800";

        //         if (v < 90)
        //             color = "#f44336";

        //         return `<span style="font-weight:bold;color:${color}">
        //                     ${v.toFixed(1)}%
        //                 </span>`;

        //     }
        // }
        
    ],


    ajaxResponse(url, params, response) {
        console.log("Response =", response);
        return response;   // <-- สำคัญ
    }

});


//-----------------------------------------
// Search
//-----------------------------------------

document.getElementById("btnSearch").onclick = () => {

    table.setData(API, {
        q: document.getElementById("q").value,
        date_from: document.getElementById("dateFrom").value,
        date_to: document.getElementById("dateTo").value,
        department: document.getElementById("department").value
    });
};


//-----------------------------------------
// Enter Search
//-----------------------------------------

document.getElementById("q")
    .addEventListener("keypress", e => {
        if (e.key === "Enter")
            document.getElementById("btnSearch").click();
    });


//-----------------------------------------
// Export
//-----------------------------------------

document.getElementById("btnExport").onclick = () => {

    window.open(

        API +
        "/export?" +
        new URLSearchParams({

            q: document.getElementById("q").value,

            date_from: document.getElementById("dateFrom").value,

            date_to: document.getElementById("dateTo").value,

            department: document.getElementById("department").value

        })

    );

};