/* =================== BASIC HELPERS =================== */

const leaveSection = document.getElementById("leaveSection");
const payrollStart = leaveSection?.dataset.ppStart;

// fallback to current year
const payrollYear = payrollStart
  ? new Date(payrollStart).getFullYear()
  : new Date().getFullYear();


let totalLeaveHours = 0;
let showAllLeaves = false; // ✅ default = show ONLY payroll period
const qs = new URL(location.href).searchParams;
const employeeId = Number(qs.get("employee_id"));

const toast = (m) => alert(m);

const jfetch = (url, opt = {}) =>
  fetch(url, opt).then(async (r) => {
    if (!r.ok) {
      let msg = r.statusText;
      try {
        const j = await r.json();
        msg = j?.detail || msg;
      } catch { }
      throw new Error(msg);
    }
    return r.json();
  });

function fmtDTLocal(v) {
  if (!v) return "";
  const d = new Date(v);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`; // ✅ local time
}

const fmtHours = (h) =>
  h === null || h === undefined ? "" : Number(h).toFixed(2);


function calcHours(fromISO, toISO, leaveType = "") {
  if (!fromISO || !toISO) return "";

  const start = new Date(fromISO);
  const end = new Date(toISO);

  if (end <= start) return "";

  // ✅ Vacation = workdays × 8 hrs
  if (leaveType === "vacation" || leaveType === "holiday") {
    let hours = 0;

    const d = new Date(start);
    d.setHours(0, 0, 0, 0);

    const endDate = new Date(end);
    endDate.setHours(0, 0, 0, 0);

    while (d <= endDate) {
      const day = d.getDay(); // 0=Sun, 6=Sat
      if (day !== 0 && day !== 6) {
        hours += 8;
      }
      d.setDate(d.getDate() + 1);
    }

    return hours.toFixed(2);
  }


  // ✅ Other leave types = exact hours
  return ((end - start) / 3600000).toFixed(2);
}


function overlapsPeriod(leaveFrom, leaveTo, ps, pe) {
  if (!ps || !pe) return false;

  const lf = new Date(leaveFrom);
  const lt = new Date(leaveTo);
  const pStart = new Date(ps);
  const pEnd = new Date(pe);

  return lf <= pEnd && lt >= pStart;
}


/* =================== LOAD DATA =================== */
async function loadLeaves() {
  if (!employeeId) return;

  const leaves = await jfetch(`/api/v1/leaves?employee_id=${employeeId}`);


  // ✅ calculate YEAR totals by type
  const typeTotals = calcLeaveTypeTotals(leaves, payrollYear);

  // ✅ render
  const totalsEl = document.getElementById("leaveTypeTotals");

  if (totalsEl) {
    totalsEl.innerHTML = Object.entries(typeTotals)
      .map(
        ([type, hrs]) =>
          `<strong>${type}</strong>: ${hrs.toFixed(2)} hrs`
      )
      .join(" &nbsp; | &nbsp; ");
  }


  renderTimeLeaves(leaves);
}


function fmtDT_DDMMYY_HHMM(v) {
  if (!v) return "";

  const d = new Date(v);

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);

  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return `${mm}/${dd}/${yy} ${hh}:${mi}`;
}
function defaultWorkTime(hours, minutes) {
  const d = new Date();

  d.setHours(hours, minutes, 0, 0);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  // ✅ local time format for datetime-local
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

/* =================== RENDER =================== */
let yearlyTotalLeaveHours = 0;

// ✅ TOTAL = ALL leaves in the payroll year

function renderTimeLeaves(leaves) {
  const tb = getLeaveBody();
  tb.innerHTML = "";

  const leaveSection = document.getElementById("leaveSection");
  const payrollStart = leaveSection?.dataset.ppStart;
  const payrollEnd = leaveSection?.dataset.ppEnd;

  const thAction = document.querySelector("#leaveSection thead th:first-child");
  if (thAction && !thAction.querySelector(".leaveAddBtn")) {
    const btn = document.createElement("button");
    btn.className = "leaveAddBtn";
    btn.textContent = "➕";
    btn.title = "Add Time Leave";

    Object.assign(btn.style, {
      border: "none",
      background: "none",
      cursor: "pointer",
      fontSize: "1.1rem",
      color: "#2563eb",
      marginLeft: "6px",
    });

    btn.onclick = addLeaveRow;
    thAction.appendChild(btn);
  }
  const payrollYear = payrollStart
    ? new Date(payrollStart).getFullYear()
    : new Date().getFullYear();

  let index = 1;
  let periodTotal = 0;
  let yearlyTotal = 0;

  leaves.forEach((lv) => {
    if (!lv.start_at) return;

    /* ===== YEAR TOTAL (always count) ===== */
    if (isSameYear(lv.start_at, payrollYear)) {
      yearlyTotal += Number(lv.hours || 0);
    }

    /* ===== FILTER ROWS ===== */
    const inPeriod = overlapsPeriod(
      lv.start_at,
      lv.end_at,
      payrollStart,
      payrollEnd
    );

    if (!showAllLeaves && !inPeriod) return;

    /* ===== PERIOD TOTAL ===== */
    periodTotal += Number(lv.hours || 0);

    const tr = document.createElement("tr");
    tr.dataset.id = lv.id;

    if (inPeriod) {
      tr.style.backgroundColor = "#fff8c4"; // highlight
    }

    tr.innerHTML = `
      <td class="actions">
        <button class="editBtn">🖉</button>
        <button class="delBtn">🗑️</button>
      </td>
      <td>${index++}</td>
      <td>${lv.leave_type ?? "vacation"}</td>
      <td class="mono">${fmtDT_DDMMYY_HHMM(lv.start_at)}</td>
      <td class="mono">${fmtDT_DDMMYY_HHMM(lv.end_at)}</td>
      <td class="num mono">${fmtHours(lv.hours)}</td>
      <td>${lv.is_paid ? "✔" : ""}</td>
      <td>${lv.status}</td>
      <td class="left">${lv.notes ?? ""}</td>
    `;

    tb.appendChild(tr);
    wireLeaveRow(tr, lv);
  });

  /* ===== DISPLAY TOTALS ===== */
  const totalEl = document.getElementById("leaveTotalHours");
  if (totalEl) {
    totalEl.textContent =
      showAllLeaves
        ? `(Year ${payrollYear}: ${yearlyTotal.toFixed(2)} hrs)`
        : `(${payrollYear}: ${yearlyTotal.toFixed(2)} hrs)`;
  }
}
function calcLeaveTypeTotals(leaves, year) {
  const totals = {};

  leaves.forEach((lv) => {
    if (!lv.start_at) return;

    // ✅ only count leaves in the selected year
    if (new Date(lv.start_at).getFullYear() !== year) return;

    const type = lv.leave_type || "unknown";

    totals[type] = (totals[type] || 0) + Number(lv.hours || 0);
  });

  return totals;
}

function isSameYear(dateISO, year) {
  return new Date(dateISO).getFullYear() === year;
}
/* =================== ADD =================== */
const getLeaveBody = () =>
  document.querySelector("#leaveSection #leaveTblBody");

function addLeaveRow() {
  const tb = getLeaveBody();

  const tr = document.createElement("tr");
  tr.classList.add("editing");

  tr.innerHTML = `
<td class="actions">
  <button class="saveBtn">💾</button>
  <button class="cancelBtn">❌</button>
</td>
<td>–</td>

<td>
  <select>
    <option value="vacation">Vacation</option>
    <option value="sick">Sick</option>
    <option value="personal">Personal</option>
    <option value="unpaid">Unpaid</option>
    <option value="holiday">Holiday</option>
  </select>
</td>

<td><input type="datetime-local"></td>
<td><input type="datetime-local"></td>
<td class="num mono"></td>

<td>
  <select>
    <option value="true">Paid</option>
    <option value="false">Unpaid</option>
  </select>
</td>

<td>
  <select>
    <option>approved</option>
    <option>pending</option>
    <option>rejected</option>
  </select>
</td>

<td><input></td>
`;


  tb.prepend(tr);

  const fromInput = tr.children[3].querySelector("input");
  const toInput = tr.children[4].querySelector("input");
  const hoursCell = tr.children[5];
  const leaveTypeSelect = tr.children[2].querySelector("select");
  fromInput.value = defaultWorkTime(8, 0);
  toInput.value = defaultWorkTime(16, 0);

  const updateHours = () => {
    hoursCell.textContent = calcHours(
      fromInput.value,
      toInput.value,
      leaveTypeSelect.value
    );
  };

  fromInput.onchange = updateHours;
  toInput.onchange = updateHours;
  leaveTypeSelect.onchange = updateHours;

  tr.querySelector(".cancelBtn").onclick = () => tr.remove();

  tr.querySelector(".saveBtn").onclick = async () => {
    if (!fromInput.value || !toInput.value) {
      toast("From / To required");
      return;
    }
    console.log(hoursCell.textContent)
    await jfetch("/api/v1/leaves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id: employeeId,
        leave_type: tr.children[2].querySelector("select").value,

        start_at: new Date(fromInput.value).toISOString(),
        end_at: new Date(toInput.value).toISOString(),

        hours: Number(hoursCell.textContent || 0),

        is_paid: tr.children[6].querySelector("select").value === "true",
        status: tr.children[7].querySelector("select").value,
        notes: tr.children[8].querySelector("input").value,
      }),
    });

    loadLeaves();
  };
}


/* =================== EDIT / DELETE =================== */

function wireLeaveRow(tr, lv) {
  const btnEdit = tr.querySelector(".editBtn");
  const btnDel = tr.querySelector(".delBtn");

  btnDel.onclick = async () => {
    if (!confirm("Delete this leave?")) return;
    await jfetch(`/api/v1/leaves/${lv.id}`, { method: "DELETE" });
    // toast("Deleted");
    loadLeaves();
  };

  btnEdit.onclick = () => {
    if (tr.classList.contains("editing")) return;
    tr.classList.add("editing");

    const cells = tr.children;
    const original = tr.innerHTML;

    /* ===== Actions ===== */
    cells[0].innerHTML = `
    <button class="saveBtn">💾</button>
    <button class="cancelBtn">❌</button>
  `;

    /* ===== Leave Type ===== */
    cells[2].innerHTML = `
<select>
  <option value="vacation" ${lv.leave_type === "vacation" ? "selected" : ""}>Vacation</option>
  <option value="sick" ${lv.leave_type === "sick" ? "selected" : ""}>Sick</option>
  <option value="personal" ${lv.leave_type === "personal" ? "selected" : ""}>Personal</option>
  <option value="unpaid" ${lv.leave_type === "unpaid" ? "selected" : ""}>Unpaid</option>
  <option value="holiday" ${lv.leave_type === "holiday" ? "selected" : ""}>Holiday</option>
</select>
`;

    /* ===== From / To ===== */
    cells[3].innerHTML = `<input type="datetime-local" value="${fmtDTLocal(lv.start_at)}">`;
    cells[4].innerHTML = `<input type="datetime-local" value="${fmtDTLocal(lv.end_at)}">`;

    /* ===== Paid ===== */
    cells[6].innerHTML = `
    <select>
      <option value="true" ${lv.is_paid ? "selected" : ""}>Paid</option>
      <option value="false" ${!lv.is_paid ? "selected" : ""}>Unpaid</option>
    </select>
  `;

    /* ===== Status ===== */
    cells[7].innerHTML = `
    <select>
      <option value="approved" ${lv.status === "approved" ? "selected" : ""}>approved</option>
      <option value="pending" ${lv.status === "pending" ? "selected" : ""}>pending</option>
      <option value="rejected" ${lv.status === "rejected" ? "selected" : ""}>rejected</option>
    </select>
  `;

    /* ===== Notes ===== */
    cells[8].innerHTML = `<input value="${lv.notes ?? ""}">`;

    const fromInput = cells[3].querySelector("input");
    const toInput = cells[4].querySelector("input");
    const leaveTypeSelect = cells[2].querySelector("select");
    function updateHours() {
      cells[5].textContent = calcHours(fromInput.value, toInput.value, leaveTypeSelect.value);
    }
    fromInput.onchange = updateHours;
    toInput.onchange = updateHours;

    /* ===== Cancel ===== */
    tr.querySelector(".cancelBtn").onclick = () => {
      tr.innerHTML = original;
      wireLeaveRow(tr, lv);
    };

    /* ===== Save ===== */
    tr.querySelector(".saveBtn").onclick = async () => {
      try {
        const payload = {
          leave_type: cells[2].querySelector("select").value,

          start_at: fromInput.value
            ? new Date(fromInput.value).toISOString()
            : null,

          end_at: toInput.value
            ? new Date(toInput.value).toISOString()
            : null,

          hours: Number(cells[5].textContent || 0),

          is_paid: cells[6].querySelector("select").value === "true",

          status: cells[7].querySelector("select").value,

          notes: cells[8].querySelector("input").value || null,
        };

        const res = await fetch(`/api/v1/leaves/${lv.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json();
          alert(err.detail || "Save failed");
          return;
        }

        loadLeaves();
      } catch (err) {
        console.error(err);
        alert(err.message || "Unexpected error");
      }
    };
  };
}
document.getElementById("toggleLeaveBtn").onclick = () => {
  showAllLeaves = !showAllLeaves;

  document.getElementById("toggleLeaveBtn").textContent =
    showAllLeaves ? "Hide" : "Show all";

  loadLeaves(); // re-render
};
/* =================== INIT =================== */

document.addEventListener("DOMContentLoaded", loadLeaves);


