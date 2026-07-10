// page-attendance-detail.js

const API = "/api/v1/reports/attendance-detail";

const employeeId =
    new URLSearchParams(location.search)
        .get("employee_id");

const table = new Tabulator("#listBody", {

    layout: "fitDataStretch",

    height: "100%",

    ajaxURL: API,

    ajaxParams: {

        employee_id: employeeId,

        date_from: "",

        date_to: ""

    },

    placeholder: "No attendance data",

    columns: [

        {
            title: "Date",
            field: "work_date",
            width: 110
        },

        {
            title: "Day",
            field: "day_name",
            width: 70
        },

        {
            title: "Status",
            field: "attendance_status",
            width: 130,

            formatter(cell) {

                const v = cell.getValue();

                if (v === "Absent") {
                    return `<span style="
                color:#d32f2f;
                font-weight:bold;
            ">${v}</span>`;
                }

                if (v === "Late") {
                    return `<span style="
                color:#ff9800;
                font-weight:bold;
            ">${v}</span>`;
                }

                return v;
            }
        },

        {
    title: "Clock In",
    field: "clock_in_at",
    width: 140,

    formatter(cell) {

        const v = cell.getValue();

        if (!v) return "";

        const d = new Date(v);

        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const yy = String(d.getFullYear()).slice(-2);

        const hh = String(d.getHours()).padStart(2, "0");
        const mi = String(d.getMinutes()).padStart(2, "0");

        return `${mm}/${dd}/${yy} ${hh}:${mi}`;
    }
},
{
    title: "Clock Out",
    field: "clock_out_at",
    width: 140,

    formatter(cell) {

        const v = cell.getValue();

        if (!v) return "";

        const d = new Date(v);

        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const yy = String(d.getFullYear()).slice(-2);

        const hh = String(d.getHours()).padStart(2, "0");
        const mi = String(d.getMinutes()).padStart(2, "0");

        return `${mm}/${dd}/${yy} ${hh}:${mi}`;
    }
},

        {
            title: "Work",
            field: "work_hours",
            hozAlign: "right",
            formatter: "money",
            formatterParams: {
                precision: 2
            }
        },

        {
            title: "OT",
            field: "ot_hours",
            hozAlign: "right",
            formatter: "money",
            formatterParams: {
                precision: 2
            }
        },
        {
            title: "",
            
        },
        // {
        //     title: "Late",
        //     field: "late_minutes",
        //     hozAlign: "right"
        // },

        // {
        //     title: "Leave",
        //     field: "leave_type"
        // },

        // {
        //     title: "Holiday",
        //     field: "holiday_name"
        // }
        

    ],

    ajaxResponse(url, params, response) {

        //--------------------------------------------------
        // Employee Info
        //--------------------------------------------------

        const emp = response.employee || {};

        document.getElementById("employeeName").textContent =
            emp.employee_name || "";

        document.getElementById("empCode").textContent =
            emp.emp_code || "";

        document.getElementById("department").textContent =
            emp.department || "";

        document.getElementById("position").textContent =
            emp.position || "";

        document.getElementById("firstWorkDate").textContent =
            emp.first_work_date
                ? new Date(emp.first_work_date).toLocaleDateString()
                : "";

        document.getElementById("lastWorkDate").textContent =
            emp.last_work_date || "";

        //--------------------------------------------------
        // Summary Card
        //--------------------------------------------------

        const s = response.summary || {};

        document.getElementById("presentDays").textContent =
            s.present_days;

        document.getElementById("lateDays").textContent =
            s.late_days;

        document.getElementById("absentDays").textContent =
            s.absent_days;

        document.getElementById("halfDays").textContent =
            s.half_days;

        document.getElementById("vacationDays").textContent =
            s.vacation_days;

        document.getElementById("sickDays").textContent =
            s.sick_days;

        document.getElementById("holidayDays").textContent =
            s.holiday_days;

        document.getElementById("workHours").textContent =
            Number(s.work_hours || 0).toFixed(2);

        document.getElementById("otHours").textContent =
            Number(s.ot_hours || 0).toFixed(2);

        document.getElementById("attendanceRate").textContent =
            Number(s.attendance_percent || 0).toFixed(2) + "%";

        return response.data;

    }

});


//--------------------------------------------------
// Search
//--------------------------------------------------

document.getElementById("btnSearch").onclick = function () {

    table.setData(API, {

        employee_id: employeeId,

        date_from:
            document.getElementById("dateFrom").value,

        date_to:
            document.getElementById("dateTo").value

    });

};


//--------------------------------------------------
// Back
//--------------------------------------------------

document.getElementById("btnBack").onclick = function () {

    history.back();

};