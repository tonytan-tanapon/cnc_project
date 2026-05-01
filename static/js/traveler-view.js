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

  let prevStepAccept = Number(traveler.planned_qty || 0);

  if (prevStepAccept === 0) {
    const firstStep = steps[0];
    if (firstStep?.logs?.length > 0) {
      prevStepAccept = firstStep.logs.reduce((sum, l) => {
        return sum + Number(l.qty_accept || 0);
      }, 0);
    }
  }

  steps.forEach(step => {

    const logs = step.logs || [];

    const stepAccept = Number(step.total_accept || 0);
    const stepReject = Number(step.total_reject || 0);
    const stepRecv = Number(prevStepAccept || 0);

    const remain = stepRecv - (stepAccept + stepReject);

    // =========================
    // NO LOG
    // =========================
    if (logs.length === 0) {
      const tr = document.createElement("tr");

      

      // 🔥 ADD THIS
      tr.setAttribute("data-receive", stepRecv);
      tr.setAttribute("data-op", step.seq);

      tr.innerHTML = `
        <td><b>${step.seq}</b></td>
        <td></td>

        <td data-field="qty_accept" contenteditable="true"
          onkeydown="if(event.key==='Enter'){
            createFromInline(${step.id}, 'qty_accept', this.innerText);
            this.blur(); return false;
          }">0</td>

        <td data-field="qty_reject" contenteditable="true"
          onkeydown="if(event.key==='Enter'){
            createFromInline(${step.id}, 'qty_reject', this.innerText);
            this.blur(); return false;
          }">0</td>

        <td>-</td>
        <td>-</td>

        <td data-field="receive">${stepRecv}</td>
        <td>${stepAccept}</td>
        <td>${stepReject}</td>
        <td>${remain}</td>

        <td>
          <button onclick="addLog(${step.id})">➕</button>
        </td>
      `;

      tbody.appendChild(tr);
      return;
    }

    // =========================
    // WITH LOGS
    // =========================
    let firstRow = true;
    const rowspan = logs.length;

    logs.forEach(log => {

      const acc = Number(log.qty_accept || 0);
      const rej = Number(log.qty_reject || 0);

      const tr = document.createElement("tr");

      if (log.id) {
        tr.setAttribute("data-log-id", log.id);
      }

      // 🔥 ADD THESE (CRITICAL)
      tr.setAttribute("data-receive", stepRecv);
      tr.setAttribute("data-op", step.seq);

      if (rej > 0) tr.classList.add("reject");

      let opCell = "";
      let stepRecvCell = "";
      let stepAcceptCell = "";
      let stepRejectCell = "";
      let remainCell = "";
      let actionCell = "";

      if (firstRow) {
        opCell = `<td rowspan="${rowspan}"><b>${step.seq}</b></td>`;

        stepRecvCell = `<td data-field="receive" rowspan="${rowspan}"><b>${stepRecv}</b></td>`;
        stepAcceptCell = `<td rowspan="${rowspan}"><b>${stepAccept}</b></td>`;
        stepRejectCell = `<td rowspan="${rowspan}"><b>${stepReject}</b></td>`;
        remainCell = `<td rowspan="${rowspan}"><b>${remain}</b></td>`;

        actionCell = `
          <td rowspan="${rowspan}">
            <button onclick="addLog(${step.id})">➕</button>
          </td>
        `;

        firstRow = false;
      }

      tr.innerHTML = `
        ${opCell}

        <td>
          <input type="date"
            value="${log.work_date || ''}"
            onchange="updateDate(${log.id}, this.value)">
        </td>

        ${buildEditableCell(log, step.id, "qty_accept", acc)}
        ${buildEditableCell(log, step.id, "qty_reject", rej)}

        <td>${log.operator_name || "-"}</td>

        <td data-field="machine" contenteditable="true"
          onkeydown="if(event.key==='Enter'){
            updateField(${log.id}, 'machine', this.innerText);
            this.blur();
            return false;
          }">
          ${log.machine_name || ""}
        </td>

        ${stepRecvCell}
        ${stepAcceptCell}
        ${stepRejectCell}
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


// =======================
// BUILD CELL
// =======================
function buildEditableCell(log, step_id, field, value) {

  if (log.id) {
    return `
      <td data-field="${field}" contenteditable="true"
        onkeydown="if(event.key==='Enter'){
          updateField(${log.id}, '${field}', this.innerText);
          this.blur();
          return false;
        }">
        ${value}
      </td>
    `;
  } else {
    return `
      <td data-field="${field}" contenteditable="true"
        onkeydown="if(event.key==='Enter'){
          createFromInline(${step_id}, '${field}', this.innerText);
          this.blur();
          return false;
        }">
        ${value}
      </td>
    `;
  }
}


// =======================
// CREATE INLINE
// =======================
async function createFromInline(step_id, field, value) {
  const num = Number(value);
  if (isNaN(num)) return;

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
// UPDATE FIELD (FIXED)
// =======================
async function updateField(log_id, field, value) {

  const row = document.querySelector(`[data-log-id="${log_id}"]`);
  if (!row) return;

  const acceptCell = row.querySelector('[data-field="qty_accept"]');
  const rejectCell = row.querySelector('[data-field="qty_reject"]');

  if (!acceptCell || !rejectCell) return;

  let accept = Number(acceptCell.innerText) || 0;
  let reject = Number(rejectCell.innerText) || 0;

  if (field === "qty_accept") accept = Number(value) || 0;
  if (field === "qty_reject") reject = Number(value) || 0;

  // 🔥 FIX: get from attribute (NOT DOM cell)
  const receive = Number(row.getAttribute("data-receive")) || 0;
  const op = Number(row.getAttribute("data-op")) || 0;

  console.log("CHECK:", { accept, reject, receive, op });

  // validation
  if (op !== 1 && (accept + reject > receive)) {
    alert(`❌ Accept + Reject > Receive`);
    load();
    return;
  }

  let payload = {};

    if (field === "qty_accept" || field === "qty_reject") {
      payload[field] = Number(value) || 0;
    } else {
      payload[field] = value.trim() || null;
    }

    await fetch(`/api/v1/step-logs/${log_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

  load();
}


// =======================
// OTHER
// =======================
async function updateDate(log_id, value) {
  await fetch(`/api/v1/step-logs/${log_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ work_date: value })
  });
  load();
}

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
}

async function deleteLog(log_id) {
  if (!confirm("Delete this log?")) return;

  await fetch(`/api/v1/step-logs/${log_id}`, {
    method: "DELETE"
  });

  load();
}

load();