 const token =
      localStorage.getItem("token");

    if (!token) {
      location.href = "/static/login.html";
    }



import { $, jfetch, toast } from "/static/js/api.js";

const tblBody = document.getElementById("tblBody");
const tblFoot = document.getElementById("tblFoot");
let showingPayee = false;
const leaveTblBody =
    document.getElementById("leaveTblBody");

const getQS = (k) => new URLSearchParams(location.search).get(k);

function currency(v) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
    }).format(Number(v || 0));
}

function fmtDate(v) {
    if (!v) return "";
    return new Date(v).toLocaleDateString("en-US");
}

function fmtTime(v) {
    if (!v) return "";

    const d = new Date(v);

    return d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function fmtMDY(v) {

    if (!v) return "";

    return v.substring(5, 7) + "/" +
        v.substring(8, 10) + "/" +
        v.substring(2, 4);
}
async function loadPayroll() {

    const employee_id = getQS("employee_id");
    const pp_id = getQS("pp_id");

    const rate =
        Number(document.getElementById("rate")?.value || 0);

    const ot_rate =
        Number(document.getElementById("ot_rate")?.value || rate * 1.5);



    try {
        console.log("rate =", rate);
        console.log("ot_rate =", ot_rate);
        const employee_id = getQS("employee_id");
        const payroll =
            await jfetch(
                `/payroll_service/calculate?employee_id=${employee_id}&pp_id=${pp_id}&rate=${rate}&ot_rate=${ot_rate}`
            );
        console.log(payroll);
        console.log(payroll.rows);

        const header = document.getElementById("header");


        const start =
            fmtMDY(
                payroll.pay_period.start_at.substring(0, 10)
            );

        const end =
            fmtMDY(
                payroll.pay_period.end_at.substring(0, 10)
            );

        header.textContent =
            `Payroll — ${payroll.employee.name} (${start} → ${end})`;

        let depText = "";

        if (
            payroll.employee.payroll_dependents?.length
        ) {

            depText =
                `<div style="
            margin-top:10px;
            font-size:14px;
            color:#374151;
        ">
        <b>Dependents under ${payroll.employee.name}:</b><br>
        ${payroll.employee.payroll_dependents
                    .map(
                        d =>
                            `•  ${d.name}`
                    )
                    .join("<br>")
                }
        </div>`;
        }

        header.textContent =
            `Payroll — ${payroll.employee.name} (${start} → ${end})`;

        const payeeInfo =
            document.getElementById("payeeInfo");

        if (depText) {

            payeeInfo.style.display =
                "block";

            payeeInfo.innerHTML =
                depText;
        }
        else {

            payeeInfo.style.display =
                "none";

            payeeInfo.innerHTML = "";
        }

        const btnPayee =
            document.getElementById("btnPayee");

        const exportPayeeBtn =
            document.getElementById("exportPayeeBtn");

        if (
            payroll.employee.payroll_emp_id &&
            payroll.employee.payroll_emp_id !== payroll.employee.id
        ) {

            btnPayee.style.display =
                "inline-block";

            exportPayeeBtn.style.display =
                "inline-block";

            btnPayee.onclick = async () => {

                showingPayee = !showingPayee;

                const employee_id =
                    getQS("employee_id");

                const pp_id =
                    getQS("pp_id");

                const rate =
                    Number(document.getElementById("rate").value || 0);

                const ot_rate =
                    Number(
                        document.getElementById("ot_rate").value
                        || rate * 1.5
                    );

                const payroll =
                    await jfetch(
                        `/payroll_service/calculate?employee_id=${employee_id}&pp_id=${pp_id}&rate=${rate}&ot_rate=${ot_rate}&show_payee=${showingPayee}`
                    );

                btnPayee.textContent =
                    showingPayee
                        ? "Return"
                        : "Payee";

                const start =
                    fmtMDY(
                        payroll.pay_period.start_at.substring(0, 10)
                    );

                const end =
                    fmtMDY(
                        payroll.pay_period.end_at.substring(0, 10)
                    );

                let depText = "";

                if (
                    payroll.employee.payroll_dependents?.length
                ) {
                    depText =
                        `<div style="
            margin-top:10px;
            font-size:14px;
            color:#374151;
        ">
        <b>Dependents under ${payroll.employee.name}:</b><br>
        ${payroll.employee.payroll_dependents
                            .map(
                                d =>
                                    `•  ${d.name}`
                            )
                            .join("<br>")
                        }
        </div>`;
                }

                document.getElementById("header").textContent =
                    `Payroll — ${payroll.employee.name} (${start} → ${end})`;

                const payeeInfo =
                    document.getElementById("payeeInfo");

                if (depText) {

                    payeeInfo.style.display =
                        "block";

                    payeeInfo.innerHTML =
                        depText;
                }
                else {

                    payeeInfo.style.display =
                        "none";

                    payeeInfo.innerHTML = "";
                }

                renderPayroll(payroll);
            };
        }
        else {
            btnPayee.style.display =
                "none";
            exportPayeeBtn.style.display =
                "none";
        }

        renderPayroll(payroll);

    } catch (err) {
        console.error(err);

        tblBody.innerHTML = `
      <tr>
        <td colspan="16" class="empty">
          Failed to load payroll
        </td>
      </tr>
    `;
    }
}

function renderPayroll(payroll) {

    tblBody.innerHTML = "";

    if (!payroll.rows?.length) {

        tblBody.innerHTML = `
      <tr>
        <td colspan="16" class="empty">
          No records
        </td>
      </tr>
    `;

        return;
    }

    let lastWeekKey = null;

    payroll.rows.forEach((row, idx) => {

        const dateKey = row.date;

        const weekKey =
            weekKeyLocal(dateKey, 1);

        const tr = document.createElement("tr");

        const otAlert =
            Number(row.ot_hours || 0) > 2;

        const breakAlert =
            (
                Number(row.break_hours || 0) > 0 &&
                Number(row.break_hours || 0) < (10 / 60)
            )
            ||
            Number(row.break_hours || 0) > 1;


        // ===== Row Color =====

        if (row.six_day_ot) {

            tr.style.backgroundColor = "#fff8c4";

        }
        else if (otAlert) {

            tr.style.backgroundColor = "#fee2e2";
            tr.style.borderLeft = "4px solid red";

        }
        else if (breakAlert) {

            tr.style.backgroundColor = "#ffedd5";
            tr.style.borderLeft = "4px solid orange";

        }


        const clockInAlert =
            row.clock_in &&
            fmtTime(row.clock_in) < "08:00";

        const clockOutAlert =
            row.clock_out &&
            fmtTime(row.clock_out) > "19:00";

        tr.innerHTML = `
  <td class="actions">
    <button class="editBtn"
            data-id="${row.id}">
        🖉
    </button>

    <button class="deleteBtn"
            data-id="${row.id}">
        🗑️
    </button>
</td>
  

<td class="center-cell">${idx + 1}</td>

<td class="center-cell">${fmtMDY(row.date)}</td>

<td class="center-cell ${otAlert
                ? 'cell-alert cell-alert-border'
                : ''
            }">
    ${fmtTime(row.clock_in)}
</td>

<td class="center-cell">
    ${fmtTime(row.start_break)}
</td>

<td class="center-cell">
    ${fmtTime(row.stop_break)}
</td>

<td class="center-cell ${otAlert
                ? 'cell-alert cell-alert-border'
                : ''
            }">
    ${fmtTime(row.clock_out)}
</td>

  <td class="num ${breakAlert ? "cell-alert cell-alert-border" : ""
            }">
    ${Number(row.break_hours || 0).toFixed(2)}
</td>

  <td class="num">
    ${Number(row.reg_hours || 0).toFixed(2)}
  </td>
        
  <td class="num ${otAlert ? "cell-alert cell-alert-border" : ""
            }">
    ${Number(row.ot_hours || 0).toFixed(2)}
</td>

  <td class="num">
    ${currency(row.rate)}
  </td>

  <td class="num">
    ${currency(row.ot_rate)}
  </td>

  <td class="num">
    ${currency(row.pay_reg)}
  </td>

  <td class="num">
    ${currency(row.pay_ot)}
  </td>

  <td class="num">
    ${currency(row.pay_total)}
  </td>

  <td>${row.note || ""}</td>
`;


        if (lastWeekKey !== null && weekKey !== lastWeekKey) {

            const sep = document.createElement("tr");

            sep.innerHTML = `
        <td colspan="16"
            style="
              background:#f4f4f5;
              height:6px;
              border:0">
        </td>
    `;

            tblBody.appendChild(sep);
        }

        lastWeekKey = weekKey;

        tblBody.appendChild(tr);

        const editBtn = tr.querySelector(".editBtn");
        const deleteBtn = tr.querySelector(".deleteBtn");

        editBtn.addEventListener("click", () => {
            editRow(tr, row);
        });

        deleteBtn.addEventListener("click", async () => {

            if (!confirm("Delete this record ?"))
                return;

            try {

                await jfetch(
                    `/time-entries/manual/${row.id}`,
                    {
                        method: "DELETE"
                    }
                );
                toast("Deleted");

                loadPayroll();

            } catch (err) {

                console.error(err);

                toast("Delete Failed");
            }
        });

    });

    tblFoot.innerHTML = `
<tr>
  <td colspan="8" class="num">
    Total
  </td>

  <td class="num">
    ${Number(payroll.total_reg_hours).toFixed(2)}
  </td>

  <td class="num">
    ${Number(payroll.total_ot_hours).toFixed(2)}
  </td>

  <td></td>
  <td></td>

  <td class="num">
    ${currency(payroll.total_pay_reg)}
  </td>

  <td class="num">
    ${currency(payroll.total_pay_ot)}
  </td>

  <td class="num">
    ${currency(payroll.total_pay)}
  </td>

  <td></td>
</tr>
`;
}

function weekKeyLocal(
    dateISO,
    weekStartsOn = 1
) {

    const d =
        new Date(dateISO + "T00:00:00");

    const day =
        d.getDay();

    const diff =
        (day - weekStartsOn + 7) % 7;

    const weekStart =
        new Date(d);

    weekStart.setDate(
        d.getDate() - diff
    );

    return weekStart
        .toISOString()
        .substring(0, 10);
}
function editRow(tr, row) {

    tr.innerHTML = `
        <td class="actions">
            <button class="saveEditBtn">
                💾
            </button>

            <button class="cancelEditBtn">
                ❌
            </button>
        </td>

        <td></td>

        <td>
            <input type="date"
                   value="${row.date}">
        </td>

        <td>
            <input type="time"
                   value="${fmtInputTime(row.clock_in)}">
        </td>

        <td>
            <input type="time"
                   value="${fmtInputTime(row.start_break)}">
        </td>

        <td>
            <input type="time"
                   value="${fmtInputTime(row.stop_break)}">
        </td>

        <td>
            <input type="time"
                   value="${fmtInputTime(row.clock_out)}">
        </td>

        <td colspan="9">
            Edit Mode
        </td>
    `;

    tr.querySelector(".cancelEditBtn")
        .addEventListener("click", loadPayroll);

    tr.querySelector(".saveEditBtn")
        .addEventListener("click", async () => {

            const inputs =
                tr.querySelectorAll("input");

            const workDate =
                inputs[0].value;

            const clockIn =
                inputs[1].value;

            const breakStart =
                inputs[2].value;

            const breakEnd =
                inputs[3].value;

            const clockOut =
                inputs[4].value;

            console.log({
                rowId: row.id,
                workDate,
                clockIn,
                breakStart,
                breakEnd,
                clockOut
            });

            // TODO:
            // PUT /time-entries/{id}

            try {

                await jfetch(
                    `/time-entries/manual/${row.id}`,
                    {
                        method: "PATCH",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({

                            clock_in_at:
                                `${workDate}T${clockIn}:00`,

                            clock_out_at:
                                clockOut
                                    ? `${workDate}T${clockOut}:00`
                                    : null,

                            status:
                                clockOut
                                    ? "closed"
                                    : "open"
                        })
                    }
                );

                // =====================
                // Update Break
                // =====================

                if (row.break_id && breakStart && breakEnd) {

                    await jfetch(
                        `/breaks/manual/${row.break_id}`,
                        {
                            method: "PATCH",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({

                                start_at:
                                    new Date(
                                        `${workDate}T${breakStart}:00`
                                    ).toISOString(),

                                end_at:
                                    new Date(
                                        `${workDate}T${breakEnd}:00`
                                    ).toISOString(),
                            })
                        }
                    );
                }
                else if (!row.break_id && breakStart && breakEnd) {

                    await jfetch(
                        "/breaks/manual",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({

                                time_entry_id: row.id,

                                break_type: "lunch",

                                start_at:
                                    new Date(
                                        `${workDate}T${breakStart}:00`
                                    ).toISOString(),

                                end_at:
                                    new Date(
                                        `${workDate}T${breakEnd}:00`
                                    ).toISOString(),
                            })
                        }
                    );
                }
                else if (
                    row.break_id &&
                    !breakStart &&
                    !breakEnd
                ) {

                    await jfetch(
                        `/breaks/manual/${row.break_id}`,
                        {
                            method: "DELETE"
                        }
                    );
                }

                toast("Updated");

                loadPayroll();

            }
            catch (err) {

                console.error(err);

                toast("Update Failed");
            }

        });
}

function fmtInputTime(v) {

    if (!v)
        return "";

    const d = new Date(v);

    return d.toLocaleTimeString(
        "en-CA",
        {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }
    );
}

document
    .getElementById("recalc")
    .addEventListener("click", loadPayroll);

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        await loadPayroll();


    }
);

document
    .getElementById("addBtn")
    .addEventListener("click", addNewRow);

function addNewRow() {

    const today = new Date();

    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    const todayStr = `${yyyy}-${mm}-${dd}`;

    const tr = document.createElement("tr");

    tr.innerHTML = `
    <td class="actions">
      <button class="saveBtn">💾</button>
      <button class="cancelBtn">❌</button>
    </td>

    <td>NEW</td>

    <td>
      <input type="date" value="${todayStr}">
    </td>

    <td>
      <input type="time" value="08:00">
    </td>

    <td>
      <input type="time">
    </td>

    <td>
      <input type="time">
    </td>

    <td>
      <input type="time" value="16:00">
    </td>

    <td colspan="9">
      New Entry
    </td>
  `;

    document
        .getElementById("tblBody")
        .prepend(tr);


    const saveBtn = tr.querySelector(".saveBtn");

    saveBtn.addEventListener("click", async () => {

        try {

            const inputs = tr.querySelectorAll("input");

            const workDate = inputs[0].value;
            const clockIn = inputs[1].value;
            const breakStart = inputs[2].value;
            const breakEnd = inputs[3].value;
            const clockOut = inputs[4].value;

            const employee_id =
                Number(getQS("employee_id"));

            // =====================
            // Save Time Entry
            // =====================

            const te = await jfetch(
                "/time-entries/manual",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({

                        employee_id,

                        clock_in_at:
                            new Date(
                                `${workDate}T${clockIn}:00`
                            ).toISOString(),

                        clock_out_at:
                            clockOut
                                ? new Date(
                                    `${workDate}T${clockOut}:00`
                                ).toISOString()
                                : null,

                        status:
                            clockOut
                                ? "closed"
                                : "open"
                    })
                }
            );

            console.log("TE =", te);

            // =====================
            // Save Break
            // =====================

            if (
                breakStart &&
                breakEnd
            ) {

                await jfetch(
                    "/breaks/manual",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json"
                        },
                        body: JSON.stringify({

                            time_entry_id:
                                te.id,

                            break_type:
                                "lunch",

                            start_at:
                                new Date(
                                    `${workDate}T${breakStart}:00`
                                ).toISOString(),

                            end_at:
                                new Date(
                                    `${workDate}T${breakEnd}:00`
                                ).toISOString(),
                        })
                    }
                );
            }

            toast("Saved");

            await loadPayroll();

        }
        catch (err) {

            console.error(err);

            toast("Save Failed");
        }

    });

    const cancelBtn = tr.querySelector(".cancelBtn");

    cancelBtn.addEventListener("click", () => {
        tr.remove();
    });

}


document
    .getElementById("exportBtn")
    .addEventListener("click", () => {

        const employee_id =
            getQS("employee_id");

        const pp_id =
            getQS("pp_id");

        const rate =
            Number(document.getElementById("rate").value || 0);

        const ot_rate =
            Number(
                document.getElementById("ot_rate").value
                || rate * 1.5
            );

        window.open(
            `/api/v1/payroll_service/export_excel?employee_id=${employee_id}&pp_id=${pp_id}&rate=${rate}&ot_rate=${ot_rate}&show_payee=${showingPayee}`
        );
    });


document
    .getElementById("exportPayeeBtn")
    .addEventListener("click", () => {

        const employee_id =
            getQS("employee_id");

        const pp_id =
            getQS("pp_id");

        const rate =
            Number(
                document.getElementById("rate").value || 0
            );

        const ot_rate =
            Number(
                document.getElementById("ot_rate").value
                || rate * 1.5
            );

        window.open(
            `/api/v1/payroll_service/export_payee?employee_id=${employee_id}` +
            `&pp_id=${pp_id}` +
            `&rate=${rate}` +
            `&ot_rate=${ot_rate}`
        );
    });