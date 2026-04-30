async function load() {
  const qs = new URLSearchParams(location.search);
  const traveler_id = qs.get("traveler_id");

  if (!traveler_id) {
    alert("Missing traveler_id");
    return;
  }

  const traveler = await fetch(`/api/v1/travelers/${traveler_id}`)
    .then(r => r.json());

  document.getElementById("title").innerText =
    `Traveler #${traveler.traveler_no || traveler.id}`;

  document.getElementById("meta").innerText =
    `Lot: ${traveler.lot_no || "-"} | Status: ${traveler.status}`;

  const steps = await fetch(`/api/v1/traveler-steps?traveler_id=${traveler_id}`)
    .then(r => r.json());

  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";

  let prevStepAccept = traveler.planned_qty || 0;

  steps.forEach(step => {

    let stepAccept = 0;
    let stepReject = 0;

    const logs = (step.logs && step.logs.length > 0)
      ? step.logs
      : [{}];

    logs.forEach(log => {
      stepAccept += Number(log.qty_accept || 0);
      stepReject += Number(log.qty_reject || 0);
    });

    const stepRecv = prevStepAccept;
    const remain = stepRecv - (stepAccept + stepReject);

    let firstRow = true;
    const rowspan = logs.length;

    logs.forEach((log, index) => {

      const acc = Number(log.qty_accept || 0);
      const rej = Number(log.qty_reject || 0);

      const tr = document.createElement("tr");
      if (rej > 0) tr.classList.add("reject");

      let opCell = "";
      let remainCell = "";
      let actionCell = "";

      if (firstRow) {
        opCell = `<td rowspan="${rowspan}"><b>${step.seq}</b></td>`;
        remainCell = `<td rowspan="${rowspan}"><b>${remain}</b></td>`;

        // 🔥 ADD BUTTON HERE
        actionCell = `
          <td rowspan="${rowspan}">
            <button onclick="addLog(${step.id})">➕</button>
          </td>
        `;

        firstRow = false;
      }

      tr.innerHTML = `
        ${opCell}
        <td>${log.work_date || "-"}</td>

        <!-- RECEIVE -->
        <td>${stepRecv}</td>

        ${buildEditableCell(log, step.id, "qty_accept", acc)}
        ${buildEditableCell(log, step.id, "qty_reject", rej)}

        <td>${log.operator_name || "-"}</td>
        <td>${stepRecv}</td>
        <td>${stepAccept}</td>
        <td>${stepReject}</td>
        ${remainCell}

        ${log.id ? `
          <td>
            <button onclick="deleteLog(${log.id})">🗑</button>
          </td>
        ` : actionCell}
      `;

      tbody.appendChild(tr);
    });

    prevStepAccept = stepAccept;
  });
}

load();


// =======================
// BUILD CELL
// =======================
function buildEditableCell(log, step_id, field, value) {

  if (log.id) {
    return `
      <td contenteditable="true"
          onkeydown="if(event.key==='Enter'){this.blur(); return false;}"
          onblur="updateField(${log.id}, '${field}', this.innerText)">
        ${value}
      </td>
    `;
  } else {
    return `
      <td contenteditable="true"
          onkeydown="if(event.key==='Enter'){this.blur(); return false;}"
          onblur="createFromInline(${step_id}, '${field}', this.innerText)">
        ${value}
      </td>
    `;
  }
}


// =======================
// ADD LOG (🔥 BUTTON)
// =======================
async function addLog(step_id) {

  await fetch(`/api/v1/step-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      step_id,
      qty_accept: 0,
      qty_reject: 0
    })
  });

  load();

  // 🔥 focus first editable cell
  setTimeout(() => {
    const cell = document.querySelector("td[contenteditable]");
    if (cell) cell.focus();
  }, 100);
}


// =======================
// CREATE FROM INLINE
// =======================
async function createFromInline(step_id, field, value) {
  const num = Number(value);
  if (isNaN(num) || num === 0) return;

  let payload = {
    step_id,
    qty_accept: 0,
    qty_reject: 0,
  };

  payload[field] = num;

  await fetch(`/api/v1/step-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  load();
}


// =======================
// UPDATE
// =======================
async function updateField(log_id, field, value) {
  if (!log_id) return;

  const num = Number(value);
  if (isNaN(num)) {
    alert("Invalid number");
    load();
    return;
  }

  await fetch(`/api/v1/step-logs/${log_id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      [field]: num
    })
  });

  load();
}


// =======================
// DELETE
// =======================
async function deleteLog(log_id) {
  if (!confirm("Delete this log?")) return;

  await fetch(`/api/v1/step-logs/${log_id}`, {
    method: "DELETE"
  });

  load();
}