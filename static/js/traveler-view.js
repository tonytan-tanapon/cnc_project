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

  // 🔥 fallback (สำคัญมาก)
  if (prevStepAccept === 0) {
    console.warn("⚠️ planned_qty is 0, fallback to first step logs");

    const firstStep = steps[0];
    if (firstStep && firstStep.logs && firstStep.logs.length > 0) {
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
    // NO LOG CASE
    // =========================
    if (logs.length === 0) {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td><b>${step.seq}</b></td>
        <td></td>

        

        <td contenteditable="true"
          onkeydown="if(event.key==='Enter'){
            createFromInline(${step.id}, 'qty_accept', this.innerText);
            this.blur(); return false;
          }">0</td>

        <td contenteditable="true"
          onkeydown="if(event.key==='Enter'){
            createFromInline(${step.id}, 'qty_reject', this.innerText);
            this.blur(); return false;
          }">0</td>

        <td>-</td>

        <td>${stepRecv}</td>
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
      if (rej > 0) tr.classList.add("reject");

      let opCell = "";

      let stepRecvCell = "";
      let stepAcceptCell = "";
      let stepRejectCell = "";
      let remainCell = "";
      let actionCell = "";

      // 🔥 MERGE HERE
      if (firstRow) {
        opCell = `<td rowspan="${rowspan}"><b>${step.seq}</b></td>`;


        stepRecvCell = `<td rowspan="${rowspan}"><b>${stepRecv}</b></td>`;
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

load();




// =======================
// BUILD CELL
// =======================
function buildEditableCell(log, step_id, field, value) {

  if (log.id) {
    return `
      <td contenteditable="true"
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
      <td contenteditable="true"
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
// ADD LOG
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
}


// =======================
// CREATE INLINE
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
// UPDATE QTY ONLY
// =======================
function safeNum(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

async function updateField(log_id, field, value) {

  if (!log_id) return;

  const row = document.querySelector(`[data-log-id="${log_id}"]`) || event?.target?.closest("tr");

  // 🔥 get current row values
  const acceptCell = row.children[2];
  const rejectCell = row.children[3];
  const stepRecvCell = row.children[5];

  let accept = safeNum(acceptCell.innerText);
  let reject = safeNum(rejectCell.innerText);
  const receive = safeNum(stepRecvCell.innerText);

  // update value being edited
  if (field === "qty_accept") accept = safeNum(value);
  if (field === "qty_reject") reject = safeNum(value);

  console.log("VALIDATION:", { receive, accept, reject });

  // 🔥 VALIDATION RULE
  // 🔥 หา OP (step number)
  const opCell = row.children[0];
  const op = Number(opCell.innerText);

  // 🔥 skip validation ถ้าเป็น step แรก
  if (op !== 1 && (accept + reject > receive)) {
    alert(`❌ Accept + Reject (${accept + reject}) > Receive (${receive})`);
    load();
    return;
  }

  // ✅ send to backend
  await fetch(`/api/v1/step-logs/${log_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      [field]: Number(value)
    })
  });

  load();
}

// =======================
// UPDATE DATE
// =======================
async function updateDate(log_id, value) {
  if (!log_id) return;

  await fetch(`/api/v1/step-logs/${log_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      work_date: value
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