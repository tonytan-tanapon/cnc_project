
let employees = [];
let machines = [];

let pendingUpdates = {};
function queueUpdate(log_id, field, value) {

  if (!pendingUpdates[log_id]) {
    pendingUpdates[log_id] = {};
  }

  pendingUpdates[log_id][field] = value;

  console.log("PENDING:", pendingUpdates);

  // highlight edited row
  const row = document.querySelector(
    `[data-log-id="${log_id}"]`
  );

  if (row) {
    row.style.background = "#fef3c7";
  }
}
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



  steps.forEach(step => {

    const logs = step.logs || [];

    const stepAccept = Number(step.total_accept || 0);
    const stepReject = Number(step.total_reject || 0);
    const stepRecv = Number(step.total_receive || 0);

    const remain = stepRecv - (stepAccept + stepReject);

    // =========================
    // NO LOG
    // =========================
    if (logs.length === 0) {

      const tr = document.createElement("tr");

      tr.setAttribute("data-receive", stepRecv);
      tr.setAttribute("data-op", step.code);

      tr.style.background =
        getStatusColor(step.status);

      tr.innerHTML = `

    <td><b>${step.step_code || step.seq}</b></td>

    <td>${step.step_name || ""}</td>

    <td>
      ${buildStatusDropdown(step)}
    </td>

    <td>-</td>

    <td contenteditable="true"
      onkeydown="if(event.key==='Enter'){
        createFromInline(
          ${step.id},
          'qty_accept',
          this.innerText
        );
        this.blur();
        return false;
      }">0</td>

    <td contenteditable="true"
      onkeydown="if(event.key==='Enter'){
        createFromInline(
          ${step.id},
          'qty_reject',
          this.innerText
        );
        this.blur();
        return false;
      }">0</td>

    <td>-</td>

    <td>-</td>

    <td>
      <textarea
        rows="2"
        style="width:100%; resize:vertical"
        onblur="createFromInline(
          ${step.id},
          'note',
          this.value
        )"
      ></textarea>
    </td>

    <!-- supplier -->
    <td>-</td>
    <td>-</td>
    <td>-</td>

    <!-- material -->
    <td>-</td> <!-- material_type -->
    <td>-</td> <!-- material_size -->
    <td>-</td> <!-- material_length -->
    <td>-</td> <!-- material_qty -->
    <td>-</td> <!-- material_uom -->

    <!-- supplier dates -->
    <td>-</td> <!-- supplier_send_date -->
    <td>-</td> <!-- supplier_receive_date -->

    <td>${stepRecv}</td>
    <td>${stepAccept}</td>
    <td>${stepReject}</td>
    <td>${remain}</td>

    <td>
      <button onclick="addLog(${step.id})">
        ➕
      </button>
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
        tr.setAttribute(
          "data-log-id",
          log.id
        );
      }

      tr.setAttribute(
        "data-receive",
        stepRecv
      );

      tr.setAttribute(
        "data-op",
        step.seq
      );

      if (rej > 0) {
        tr.classList.add("reject");
      }

      let opCell = "";
      let nameCell = "";
      let statusCell = "";

      let stepRecvCell = "";
      let stepAcceptCell = "";
      let stepRejectCell = "";
      let remainCell = "";
      let actionCell = "";

      if (firstRow) {

        opCell = `
      <td rowspan="${rowspan}">
        <b>${step.step_code || step.seq}</b>
      </td>
    `;

        nameCell = `
      <td rowspan="${rowspan}">
        ${step.step_name || ""}
      </td>
    `;

        statusCell = `
      <td rowspan="${rowspan}">
        ${buildStatusDropdown(step)}
      </td>
    `;

        stepRecvCell = `
      <td rowspan="${rowspan}">
        <b>${stepRecv}</b>
      </td>
    `;

        stepAcceptCell = `
      <td rowspan="${rowspan}">
        <b>${stepAccept}</b>
      </td>
    `;

        stepRejectCell = `
      <td rowspan="${rowspan}">
        <b>${stepReject}</b>
      </td>
    `;

        remainCell = `
      <td rowspan="${rowspan}">
        <b>${remain}</b>
      </td>
    `;

        actionCell = `
      <td rowspan="${rowspan}">
        <button onclick="addLog(${step.id})">
          ➕
        </button>
      </td>
    `;

        firstRow = false;
      }

      tr.innerHTML = `

    ${opCell}
    ${nameCell}
    ${statusCell}

    <td>
      <input
        type="date"
        value="${log.work_date || ''}"
        onchange="updateDate(
          ${log.id},
          this.value
        )"
      >
    </td>

    ${buildEditableCell(
        log,
        step.id,
        "qty_accept",
        acc
      )}

    ${buildEditableCell(
        log,
        step.id,
        "qty_reject",
        rej
      )}

    <td>
      <select onchange="
        updateField(
          ${log.id},
          'operator_id',
          this.value
        )">

        <option value="">-</option>

        ${employees.map(e => `
          <option
            value="${e.id}"

            ${Number(e.id) ===
          Number(log.operator_id)
          ? "selected"
          : ""}

          >
            ${e.nickname || e.emp_code}
          </option>
        `).join("")}

      </select>
    </td>

    <td>
      <select onchange="
        updateField(
          ${log.id},
          'machine_id',
          this.value
        )">

        <option value="">-</option>

        ${machines.map(m => `
          <option
            value="${m.id}"

            ${Number(m.id) ===
              Number(log.machine_id)
              ? "selected"
              : ""}

          >
            ${m.code}
          </option>
        `).join("")}

      </select>
    </td>

    <!-- NOTE -->

    <td>
      <textarea
        rows="2"
        style="width:100%; resize:vertical"

        onblur="
          updateField(
            ${log.id},
            'note',
            this.value
          )
        "

      >${log.note || ""}</textarea>
    </td>

    <!-- SUPPLIER PO -->

    <td contenteditable="true"

      onkeydown="
        if(event.key==='Enter'){

          updateField(
            ${log.id},
            'supplier_po',
            this.innerText
          );

          this.blur();

          return false;
        }
      "

    >${log.supplier_po || ""}</td>

    <!-- SUPPLIER -->

    <td contenteditable="true"

      onkeydown="
        if(event.key==='Enter'){

          updateField(
            ${log.id},
            'supplier_name',
            this.innerText
          );

          this.blur();

          return false;
        }
      "

    >${log.supplier_name || ""}</td>

    <!-- LOT -->

    <td contenteditable="true"

      onkeydown="
        if(event.key==='Enter'){

          updateField(
            ${log.id},
            'supplier_lot',
            this.innerText
          );

          this.blur();

          return false;
        }
      "

    >${log.supplier_lot || ""}</td>
        <!-- MATERIAL TYPE -->
    <td contenteditable="true"
      onkeydown="
        if(event.key==='Enter'){
          updateField(
            ${log.id},
            'material_type',
            this.innerText
          );
          this.blur();
          return false;
        }
      "
    >${log.material_type || ""}</td>

    <!-- MATERIAL SIZE -->
    <td contenteditable="true"
      onkeydown="
        if(event.key==='Enter'){
          updateField(
            ${log.id},
            'material_size',
            this.innerText
          );
          this.blur();
          return false;
        }
      "
    >${log.material_size || ""}</td>

    <!-- MATERIAL LENGTH -->
    <td contenteditable="true"
      onkeydown="
        if(event.key==='Enter'){
          updateField(
            ${log.id},
            'material_length',
            this.innerText
          );
          this.blur();
          return false;
        }
      "
    >${log.material_length || ""}</td>

    <!-- MATERIAL QTY -->
    <td contenteditable="true"
      onkeydown="
        if(event.key==='Enter'){
          updateField(
            ${log.id},
            'material_qty',
            this.innerText
          );
          this.blur();
          return false;
        }
      "
    >${log.material_qty || ""}</td>

    <!-- MATERIAL UOM -->
    <td contenteditable="true"
      onkeydown="
        if(event.key==='Enter'){
          updateField(
            ${log.id},
            'material_uom',
            this.innerText
          );
          this.blur();
          return false;
        }
      "
    >${log.material_uom || ""}</td>

    <!-- SEND DATE -->
    <td>
      <input
        type="date"
        value="${log.supplier_send_date || ''}"
        onchange="
          updateField(
            ${log.id},
            'supplier_send_date',
            this.value
          )
        "
      >
    </td>

    <!-- RECEIVE DATE -->
    <td>
      <input
        type="date"
        value="${log.supplier_receive_date || ''}"
        onchange="
          updateField(
            ${log.id},
            'supplier_receive_date',
            this.value
          )
        "
      >
    </td>

    ${stepRecvCell}
    ${stepAcceptCell}
    ${stepRejectCell}
    ${remainCell}

    <td>
      <button onclick="
        deleteLog(${log.id})
      ">
        🗑
      </button>
    </td>
  `;

      tbody.appendChild(tr);
    });

    prevStepAccept = stepAccept;
  });

  const stepSelect = document.getElementById("input_step");
  stepSelect.innerHTML =
    '<option value="">Select OP</option>' +

    steps.map(step => {

      const opLabel =
        step.step_code ||
        step.code ||
        step.op_no ||
        step.seq;

      return `
      <option value="${step.id}">
        ${opLabel}
      </option>
    `;
    }).join("");
}

document.addEventListener("input", function (e) {
  if (e.target.tagName === "TEXTAREA") {
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
  }
});


async function autoUpdateStepStatus(step_id, newStatus, currentStatus) {
  if (newStatus === currentStatus) return; // no change

  try {
    await fetch(`/api/v1/traveler-steps/${step_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });

    console.log("AUTO STATUS UPDATE:", step_id, newStatus);

  } catch (err) {
    console.error("Auto update failed", err);
  }
}


function getStatusColor(status) {
  return {
    pending: "#e5e7eb",
    running: "#bfdbfe",
    passed: "#bbf7d0",
    failed: "#fecaca",
    skipped: "#fde68a"
  }[status] || "white";
}

function buildStatusDropdown(step) {
  const statuses = ["pending", "running", "passed", "failed", "skipped"];

  return `
    <select onchange="updateStepStatus(${step.id}, this.value, this)">
      ${statuses.map(s => `
        <option value="${s}" ${s === step.status ? "selected" : ""}>
          ${s}
        </option>
      `).join("")}
    </select>
  `;
}

async function updateStepStatus(step_id, status, el) {
  try {
    await fetch(`/api/v1/traveler-steps/${step_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: status   // this works because backend uses exclude_unset
      })
    });

    // update UI instantly
    const op = el.closest("tr").getAttribute("data-op");

    // 🔥 update ALL rows in same step
    document.querySelectorAll(`tr[data-op="${op}"]`).forEach(r => {
      r.style.background = getStatusColor(status);
    });

  } catch (err) {
    console.error(err);
    alert("Update failed");
  }
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
function createFromInline(
  step_id,
  field,
  value
) {

  let payload = {
    step_id,
    qty_accept: 0,
    qty_reject: 0,
  };

  // =========================
  // STRING FIELDS
  // =========================

  if (

    field === "note" ||

    field === "supplier_po" ||

    field === "supplier_name" ||

    field === "supplier_lot" ||
    field === "material_type" ||
    field === "material_size" ||
    field === "material_length" ||
    field === "material_uom"

  ) {

    payload[field] =
      value.trim() || null;
  }

  // =========================
  // NUMBER FIELDS
  // =========================

  else {

    const num = Number(value);

    if (isNaN(num)) return;

    payload[field] = num;
  }

  console.log(
    "INLINE CREATE PAYLOAD:",
    payload
  );

  fetch(`/api/v1/step-logs`, {

    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify(payload)

  })
    .then(async res => {

      if (!res.ok) {

        const err = await res.json()
          .catch(() => ({}));

        alert(
          "❌ " +
          (err.detail || "Create failed")
        );

        return;
      }

      load();
    });
}

async function saveAllRows() {

  const entries = Object.entries(
    pendingUpdates
  );

  for (const [log_id, fields] of entries) {

    let payload = {};

    for (const [field, value] of Object.entries(fields)) {

      if (
        field === "qty_accept" ||
        field === "qty_reject" ||
        field === "operator_id" ||
        field === "machine_id" ||
        field === "material_qty"
      ) {

        payload[field] =
          Number(value) || 0;

      } else {

        payload[field] =
          value?.trim?.() || null;
      }
    }

    console.log(
      "SAVE PAYLOAD:",
      log_id,
      payload
    );

    await fetch(
      `/api/v1/step-logs/${log_id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify(payload)
      }
    );
  }

  alert("✅ Saved");

  pendingUpdates = {};

  load();
}
// =======================
// UPDATE FIELD (FIXED)
// =======================
async function updateField(log_id, field, value) {
  console.log("UPDATE FIELD >>:", { log_id, field, value });
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
  // if (op !== 1 && (accept + reject > receive)) {
  //   alert(`❌ Accept + Reject > Receive`);
  //   load();
  //   return;
  // }

  let payload = {};


  if (field === "qty_accept" || field === "qty_reject") {
    payload[field] = Number(value) || 0;

  } else if (

    field === "operator_id" ||

    field === "machine_id" ||

    field === "supplier_id"

  ) {
    payload[field] = value ? Number(value) : null;   // 🔥 FIX HERE

  } else {
    payload[field] = value.trim() || null;
  }
  console.log("UPDATE PAYLOAD:", payload);


  await fetch(`/api/v1/step-logs/${log_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  // 🔥 force DOM update BEFORE calc
  if (field === "qty_accept") {
    row.querySelector('[data-field="qty_accept"]').innerText = payload.qty_accept;
  }
  if (field === "qty_reject") {
    row.querySelector('[data-field="qty_reject"]').innerText = payload.qty_reject;
  }

  // 🔥 now correct values


  // 🔥 wait a bit to ensure DB commit finished
  setTimeout(() => {
    load();
  }, 100);
}

// =======================
// OTHER
// =======================
async function updateDate(
  log_id,
  value
) {

  const payload = {
    work_date: value
  };

  const res = await fetch(
    `/api/v1/step-logs/${log_id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );
  console.log("UPDATE DATE RESPONSE:", res);
  if (!res.ok) {

    const err = await res.json()
      .catch(() => ({}));

    alert(
      "❌ " +
      (err.detail || "Update failed")
    );

    load();

    return;
  }

  load();
}

// async function addLog(step_id) {
//   fetch(`/api/v1/step-logs`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(payload)
//   })
//     .then(async res => {
//       if (!res.ok) {
//         const err = await res.json().catch(() => ({}));
//         alert("❌ " + (err.detail || "Create failed"));
//         return;
//       }
//       load();
//     });
// }

function addLog(step_id) {

  const payload = {
    step_id,
    qty_accept: 0,
    qty_reject: 0,
    work_date: new Date().toISOString().slice(0, 10) // today
  };

  fetch(`/api/v1/step-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("❌ " + (err.detail || "Create failed"));
        return;
      }
      load();
    });
}

async function deleteLog(log_id) {
  if (!confirm("Delete this log?")) return;

  await fetch(`/api/v1/step-logs/${log_id}`, {
    method: "DELETE"
  });

  load();
}

async function loadMaster() {
  const eRes = await fetch("/api/v1/employees").then(r => r.json());
  const mRes = await fetch("/api/v1/machines").then(r => r.json());

  // 🔥 normalize
  employees = Array.isArray(eRes) ? eRes : [];
  machines = Array.isArray(mRes) ? mRes : [];

  document.getElementById("input_operator").innerHTML =
    '<option value="">Operator</option>' +
    employees.map(e => `<option value="${e.id}">${e.emp_code}</option>`).join("");

  document.getElementById("input_machine").innerHTML =
    '<option value="">Machine</option>' +
    machines.map(m => `<option value="${m.id}">${m.code}</option>`).join("");

}

async function submitTopInput() {
  const step_id = Number(document.getElementById("input_step").value);
  const work_date = document.getElementById("input_date").value;
  const qty_accept = Number(document.getElementById("input_accept").value || 0);
  const qty_reject = Number(document.getElementById("input_reject").value || 0);
  const operator_id = document.getElementById("input_operator").value || null;
  const machine_id = document.getElementById("input_machine").value || null;
  const note = document.getElementById("input_note").value.trim() || null;
  const supplier_po =
    document.getElementById(
      "input_supplier_po"
    )?.value.trim() || null;

  const supplier_name =
    document.getElementById(
      "input_supplier_name"
    )?.value.trim() || null;

  const supplier_lot =
    document.getElementById(
      "input_supplier_lot"
    )?.value.trim() || null;

    const material_type =
  document.getElementById(
    "input_material_type"
  )?.value.trim() || null;

const material_size =
  document.getElementById(
    "input_material_size"
  )?.value.trim() || null;

const material_length =
  document.getElementById(
    "input_material_length"
  )?.value.trim() || null;

const material_uom =
  document.getElementById(
    "input_material_uom"
  )?.value.trim() || null;

const material_qty =
  Number(
    document.getElementById(
      "input_material_qty"
    )?.value || 0
  );

const supplier_send_date =
  document.getElementById(
    "input_supplier_send_date"
  )?.value || null;

const supplier_receive_date =
  document.getElementById(
    "input_supplier_receive_date"
  )?.value || null;

  if (!step_id) {
    alert("Select OP");
    return;
  }

  const payload = {

    step_id,

    work_date,

    qty_accept,

    qty_reject,

    operator_id:
      operator_id
        ? Number(operator_id)
        : null,

    machine_id:
      machine_id
        ? Number(machine_id)
        : null,

    note,

    supplier_po,
    supplier_name,
    supplier_lot,
    material_type,
material_size,
material_length,
material_uom,
material_qty,

supplier_send_date,
supplier_receive_date,
  };

  const res = await fetch(`/api/v1/step-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert("❌ " + (err.detail || "Create failed"));
    return;
  }

  // 🔥 clear inputs
  document.getElementById("input_accept").value = "";
  document.getElementById("input_reject").value = "";
  document.getElementById("input_note").value = "";
  document.getElementById(
    "input_supplier_po"
  ).value = "";

  document.getElementById(
    "input_supplier_name"
  ).value = "";

  document.getElementById(
    "input_supplier_lot"
  ).value = "";

  load();
}

(async () => {
  await loadMaster();
  await load();
})();