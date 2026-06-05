
let employees = [];
let machines = [];

const COLUMN_ORDER = [

  "status",
  "op",
  "name",
  "date",
  "good",
  "bad",

  "operator",
  "machine",

  "note",

  "receive",
  "accept",
  "reject",
  "remain",

  "supplier_po",
  "supplier",
  "heat_lot",

  "mat_type",
  "mat_size",
  "mat_length",
  "mat_qty",
  "mat_uom",

  "send_date",
  "recv_date",




];

const HEADER_MAP = {

  op: `
    <th class="col-op">OP</th>
  `,

  name: `
    <th class="col-name">Name</th>
  `,

  status: `
    <th class="col-status">Status</th>
  `,

  date: `
    <th class="col-date">Date</th>
  `,

  good: `
    <th class="col-good">Good</th>
  `,

  bad: `
    <th class="col-bad">Bad</th>
  `,

  operator: `
    <th class="col-operator">Operator</th>
  `,

  machine: `
    <th class="col-machine">Machine</th>
  `,

  note: `
    <th class="col-note">Note</th>
  `,

  supplier_po: `
    <th class="col-supplier-po">Supplier PO</th>
  `,

  supplier: `
    <th class="col-supplier">Supplier</th>
  `,

  heat_lot: `
    <th class="col-heat-lot">Heat Lot</th>
  `,

  mat_type: `
    <th class="col-mat-type">Mat Type</th>
  `,

  mat_size: `
    <th class="col-mat-size">Mat Size</th>
  `,

  mat_length: `
    <th class="col-mat-length">Length</th>
  `,

  mat_qty: `
    <th class="col-mat-qty">Qty</th>
  `,

  mat_uom: `
    <th class="col-mat-uom">UOM</th>
  `,

  send_date: `
    <th class="col-send-date">Send Date</th>
  `,

  recv_date: `
    <th class="col-recv-date">Recv Date</th>
  `,

  receive: `
    <th class="col-receive">Receive</th>
  `,

  accept: `
    <th class="col-accept">Accept</th>
  `,

  reject: `
    <th class="col-reject">Reject</th>
  `,

  remain: `
    <th class="col-remain">Remain</th>
  `,

};

function buildHeader() {

  const row =
    document.getElementById(
      "thead-row"
    );

  row.innerHTML =
    COLUMN_ORDER
      .map(c => HEADER_MAP[c])
      .join("");
}

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

  // =========================
  // TRAVELER
  // =========================

  const traveler = await fetch(
    `/api/v1/travelers/${traveler_id}`
  ).then(r => r.json());

  document.getElementById("title").innerText =
    `Traveler #${traveler.traveler_no || traveler.id}`;

  document.getElementById("meta").innerText =
    `Lot: ${traveler.lot_no || "-"} | Status: ${traveler.status}`;

  // =========================
  // STEPS
  // =========================

  const steps = await fetch(
    `/api/v1/traveler-steps?traveler_id=${traveler_id}`
  ).then(r => r.json());

  const tbody =
    document.getElementById("tbody");

  tbody.innerHTML = "";

  // =========================
  // LOOP STEP
  // =========================

  steps.forEach(step => {

    const logs = step.logs || [];

    const stepAccept =
      Number(step.total_accept || 0);

    const stepReject =
      Number(step.total_reject || 0);

    const stepRecv =
      Number(step.total_receive || 0);

    const remain =
      stepRecv - (
        stepAccept + stepReject
      );

    // ==================================================
    // NO LOG
    // ==================================================

    if (logs.length === 0) {

      const tr =
        document.createElement("tr");

      tr.setAttribute(
        "data-receive",
        stepRecv
      );

      tr.setAttribute(
        "data-op",
        step.code
      );

      tr.style.background =
        getStatusColor(step.status);

      const CELL_MAP = {

        op: `
<td class="col-op">
  <b>${step.step_code || step.seq}</b>
</td>
`,

        name: `
<td class="col-name">
  ${step.step_name || ""}
</td>
`,

        status: `
<td class="col-status">
  ${buildStatusDropdown(step)}
</td>
`,

        date: `
<td class="col-date">-</td>
`,

        good: `
<td class="col-good"
    contenteditable="true"

    onblur="
      ensureLogThenUpdate(
        ${step.id},
        'qty_accept',
        this.innerText,
        this
      )
    "
>
  0
</td>
`,

        bad: `
<td class="col-bad"
    contenteditable="true"

    onblur="
      ensureLogThenUpdate(
        ${step.id},
        'qty_reject',
        this.innerText,
        this
      )
    "
>
  0
</td>
`,

        operator: `
<td class="col-operator">-</td>
`,

        machine: `
<td class="col-machine">-</td>
`,

        note: `
<td class="col-note">

<textarea
  rows="2"

  onblur="
  ensureLogThenUpdate(
    ${step.id},
    'note',
    this.value,
    this
  )
"
></textarea>

</td>
`,

        supplier_po: `
<td class="col-supplier-po">-</td>
`,

        supplier: `
<td class="col-supplier">-</td>
`,

        heat_lot: `
<td class="col-heat-lot">-</td>
`,

        mat_type: `
<td class="col-mat-type">-</td>
`,

        mat_size: `
<td class="col-mat-size">-</td>
`,

        mat_length: `
<td class="col-mat-length">-</td>
`,

        mat_qty: `
<td class="col-mat-qty">-</td>
`,

        mat_uom: `
<td class="col-mat-uom">-</td>
`,

        send_date: `
<td class="col-send-date">-</td>
`,

        recv_date: `
<td class="col-recv-date">-</td>
`,

        receive: `
<td class="col-receive">
  ${stepRecv}
</td>
`,

        accept: `
<td class="col-accept">
  ${stepAccept}
</td>
`,

        reject: `
<td class="col-reject">
  ${stepReject}
</td>
`,

        remain: `
<td class="col-remain">
  ${remain}
</td>
`,


      };

      tr.innerHTML =
        COLUMN_ORDER
          .map(
            c => CELL_MAP[c] || ""
          )
          .join("");

      tbody.appendChild(tr);

      return;
    }

    // ==================================================
    // WITH LOGS
    // ==================================================

    let firstRow = true;

    const rowspan = logs.length;

    logs.forEach(log => {

      const acc =
        Number(log.qty_accept || 0);

      const rej =
        Number(log.qty_reject || 0);

      const tr =
        document.createElement("tr");

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
        step.step_code || ""
      );

      if (rej > 0) {
        tr.classList.add("reject");
      }

      let opCell = "";
      let nameCell = "";
      let statusCell = "";

      let recvCell = "";
      let acceptCell = "";
      let rejectCell = "";
      let remainCell = "";
      let actionCell = "";

      if (firstRow) {

        opCell = `
<td class="col-op"
    rowspan="${rowspan}">
  <b>${step.step_code || step.seq}</b>
</td>
`;

        nameCell = `
<td class="col-name"
    rowspan="${rowspan}">
  ${step.step_name || ""}
</td>
`;

        statusCell = `
<td class="col-status"
    rowspan="${rowspan}">
  ${buildStatusDropdown(step)}
</td>
`;

        recvCell = `
<td class="col-receive"
    rowspan="${rowspan}">
  <b>${stepRecv}</b>
</td>
`;

        acceptCell = `
<td class="col-accept"
    rowspan="${rowspan}">
  <b>${stepAccept}</b>
</td>
`;

        rejectCell = `
<td class="col-reject"
    rowspan="${rowspan}">
  <b>${stepReject}</b>
</td>
`;

        remainCell = `
<td class="col-remain"
    rowspan="${rowspan}">
  <b>${remain}</b>
</td>
`;

        actionCell = `
<td class="col-action"
    rowspan="${rowspan}">

  <button onclick="addLog(${step.id})">
    ➕
  </button>

</td>
`;

        firstRow = false;
      }

      const CELL_MAP = {

        op: opCell,

        name: nameCell,

        status: statusCell,

        date: `
<td class="col-date">

<div
  style="
    display:flex;
    align-items:center;
    gap:6px;
  "
>

  <button
    onclick="deleteLog(${log.id})"
    style="
      background:#ef4444;
      color:white;
      border:none;
      width:26px;
      height:26px;
      border-radius:4px;
      cursor:pointer;
      flex-shrink:0;
    "
  >
    🗑
  </button>

  <input
    type="date"
    value="${log.work_date || ''}"

    onchange="
      queueUpdate(
        ${log.id},
        'work_date',
        this.value
      )
    "
  >

</div>

</td>
`,

        good: buildEditableCell(
          log,
          step.id,
          "qty_accept",
          acc
        ),

        bad: buildEditableCell(
          log,
          step.id,
          "qty_reject",
          rej
        ),

        operator: `
<td class="col-operator">

<select onchange="
  queueUpdate(
    ${log.id},
    'operator_id',
    this.value
  )
">

<option value="">-</option>

${employees.map(e => `
<option
  value="${e.id}"
  ${Number(e.id) === Number(log.operator_id)
            ? "selected"
            : ""}
>
  ${e.emp_op} - ${e.nickname}
</option>
`).join("")}

</select>

</td>
`,

        machine: `
<td class="col-machine">

<select onchange="
  queueUpdate(
    ${log.id},
    'machine_id',
    this.value
  )
">

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
`,

        note: `
<td class="col-note">

<textarea
  rows="2"

  onblur="
    queueUpdate(
      ${log.id},
      'note',
      this.value
    )
  "
>${log.note || ""}</textarea>

</td>
`,

        supplier_po: `
<td class="col-supplier-po"
    contenteditable="true"

    onblur="
      queueUpdate(
        ${log.id},
        'supplier_po',
        this.innerText
      )
    "
>
  ${log.supplier_po || ""}
</td>
`,

        supplier: `
<td class="col-supplier"
    contenteditable="true"

    onblur="
      queueUpdate(
        ${log.id},
        'supplier_name',
        this.innerText
      )
    "
>
  ${log.supplier_name || ""}
</td>
`,

        heat_lot: `
<td class="col-heat-lot"
    contenteditable="true"

    onblur="
      queueUpdate(
        ${log.id},
        'supplier_lot',
        this.innerText
      )
    "
>
  ${log.supplier_lot || ""}
</td>
`,

        mat_type: `
<td class="col-mat-type"
    contenteditable="true"

    onblur="
      queueUpdate(
        ${log.id},
        'material_type',
        this.innerText
      )
    "
>
  ${log.material_type || ""}
</td>
`,

        mat_size: `
<td class="col-mat-size"
    contenteditable="true"

    onblur="
      queueUpdate(
        ${log.id},
        'material_size',
        this.innerText
      )
    "
>
  ${log.material_size || ""}
</td>
`,

        mat_length: `
<td class="col-mat-length"
    contenteditable="true"

    onblur="
      queueUpdate(
        ${log.id},
        'material_length',
        this.innerText
      )
    "
>
  ${log.material_length || ""}
</td>
`,

        mat_qty: `
<td class="col-mat-qty"
    contenteditable="true"

    onblur="
      queueUpdate(
        ${log.id},
        'material_qty',
        this.innerText
      )
    "
>
  ${log.material_qty || ""}
</td>
`,

        mat_uom: `
<td class="col-mat-uom"
    contenteditable="true"

    onblur="
      queueUpdate(
        ${log.id},
        'material_uom',
        this.innerText
      )
    "
>
  ${log.material_uom || ""}
</td>
`,

        send_date: `
<td class="col-send-date">

<input
  type="date"
  value="${log.supplier_send_date || ''}"

  onchange="
    queueUpdate(
      ${log.id},
      'supplier_send_date',
      this.value
    )
  "
>

</td>
`,

        recv_date: `
<td class="col-recv-date">

<input
  type="date"
  value="${log.supplier_receive_date || ''}"

  onchange="
    queueUpdate(
      ${log.id},
      'supplier_receive_date',
      this.value
    )
  "
>

</td>
`,

        receive: recvCell,

        accept: acceptCell,

        reject: rejectCell,

        remain: remainCell,


      };

      tr.innerHTML =
        COLUMN_ORDER
          .map(
            c => CELL_MAP[c] || ""
          )
          .join("");

      tbody.appendChild(tr);

    });

  });

  // =========================
  // STEP DROPDOWN
  // =========================

  const stepSelect =
    document.getElementById(
      "input_step"
    );

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

function autoResizeTextarea(el) {

  el.style.height = "28px";

  const newHeight =
    Math.min(el.scrollHeight, 120);

  el.style.height =
    newHeight + "px";
}

document.addEventListener("input", function (e) {

  if (
    e.target.matches(
      ".col-note textarea"
    )
  ) {

    autoResizeTextarea(
      e.target
    );
  }
});

function showToast(message = "Saved successfully") {

  const toast =
    document.getElementById("toast");

  toast.innerText = message;

  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}
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

async function ensureLogThenUpdate(
  step_id,
  field,
  value,
  el
) {

  const tr =
    el.closest("tr") ||
    el.parentElement.closest("tr");

  // already created
  let log_id =
    tr.getAttribute("data-log-id");

  // =========================
  // CREATE FIRST
  // =========================

  if (!log_id) {

    const payload = {
      step_id,
      qty_accept: 0,
      qty_reject: 0,
      work_date:
        new Date()
          .toISOString()
          .slice(0, 10)
    };

    const res = await fetch(
      `/api/v1/step-logs`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    if (!res.ok) {
      alert("Create log failed");
      return;
    }

    const newLog = await res.json();

    log_id = newLog.id;

    tr.setAttribute(
      "data-log-id",
      log_id
    );
  }

  // =========================
  // UPDATE FIELD
  // =========================

  queueUpdate(
    Number(log_id),
    field,
    value
  );

  await saveAllRows();
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

// async function updateStepStatus(step_id, status, el) {
//   try {
//     await fetch(`/api/v1/traveler-steps/${step_id}`, {
//       method: "PUT",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         status: status   // this works because backend uses exclude_unset
//       })
//     });

//     // update UI instantly
//     const op = el.closest("tr").getAttribute("data-op");

//     // 🔥 update ALL rows in same step
//     document.querySelectorAll(`tr[data-op="${op}"]`).forEach(r => {
//       r.style.background = getStatusColor(status);
//     });

//   } catch (err) {
//     console.error(err);
//     alert("Update failed");
//   }
// }

async function updateStepStatus(step_id, status, el) {

  try {

    // =====================================
    // FIND CURRENT STEP
    // =====================================

    const tr =
      el.closest("tr");

    const op =
      tr.getAttribute("data-op");

    // =====================================
    // MATERIAL / M STEP
    // =====================================

    const isMaterial =

      String(op)
        .toUpperCase()
        .startsWith("M");

    // =====================================
    // AUTO FORCE PO
    // =====================================

    if (
      isMaterial &&
      status === "passed"
    ) {

      // find supplier_po cell
      const poCell =
        tr.querySelector(
          ".col-supplier-po"
        );

      // if empty -> auto fill "-"
      if (
        poCell &&
        !poCell.innerText.trim()
      ) {

        poCell.innerText = "-";

        // queue save
        const log_id =
          tr.getAttribute(
            "data-log-id"
          );

        if (log_id) {

          queueUpdate(
            Number(log_id),
            "supplier_po",
            "-"
          );
        }
      }
    }

    // =====================================
    // UPDATE STEP STATUS
    // =====================================

    await fetch(
      `/api/v1/traveler-steps/${step_id}`,
      {
        method: "PUT",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          status: status
        })
      }
    );

    // =====================================
    // SAVE PENDING LOG UPDATE
    // =====================================

    await saveAllRows();

    // =====================================
    // UPDATE UI COLOR
    // =====================================

    document
      .querySelectorAll(
        `tr[data-op="${op}"]`
      )
      .forEach(r => {

        r.style.background =
          getStatusColor(status);
      });

  } catch (err) {

    console.error(err);

    alert("Update failed");
  }
}

// =======================
// BUILD CELL
// =======================
function buildEditableCell(
  log,
  step_id,
  field,
  value
) {

  const cls =
    field === "qty_accept"
      ? "col-good"
      : field === "qty_reject"
        ? "col-bad"
        : "";

  if (log.id) {

    return `
      <td
        class="${cls}"

        data-field="${field}"

        contenteditable="true"

        onblur="
          queueUpdate(
            ${log.id},
            '${field}',
            this.innerText
          )
        "
      >
        ${value}
      </td>
    `;

  } else {

    return `
      <td
        class="${cls}"

        data-field="${field}"

        contenteditable="true"

        onblur="
          createFromInline(
            ${step_id},
            '${field}',
            this.innerText
          )
        "
      >
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
          value === ""
            ? null
            : Number(value);

      } else {

        payload[field] =
          value === ""
            ? null
            : value;
      }
    }

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



  pendingUpdates = {};

  showToast("✅ All rows saved");

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
  employees = (Array.isArray(eRes) ? eRes : [])
    .filter(e => e.emp_op)
    .sort((a, b) => {

      const opCompare =
        String(a.emp_op || "")
          .localeCompare(
            String(b.emp_op || "")
          );

      if (opCompare !== 0) {
        return opCompare;
      }

      return String(a.nickname || "")
        .localeCompare(
          String(b.nickname || "")
        );
    });
  machines = Array.isArray(mRes) ? mRes : [];
  console.log("EMPLOYEES:", employees);
  document.getElementById("input_operator").innerHTML =
    '<option value="">Operator</option>' +
    employees.map(e => `<option value="${e.id}">${e.emp_op}</option>`).join("");


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

  buildHeader();

  await loadMaster();

  await load();

})();

// Prevent multiline in single-line editable cells
document.addEventListener("keydown", async function (e) {

  const td = e.target;

  // =========================
  // GOOD / BAD
  // =========================

  const isGoodBad =

    td &&
    td.getAttribute("contenteditable") === "true" &&
    (
      td.classList.contains("col-good") ||
      td.classList.contains("col-bad")
    );

  if (isGoodBad && e.key === "Enter") {

    e.preventDefault();

    td.blur(); // trigger onblur save

    return;
  }

  // =========================
  // OTHER SINGLE LINE
  // =========================

  const singleLineCols = [
    "col-supplier-po",
    "col-supplier",
    "col-heat-lot",
    "col-mat-type",
    "col-mat-size",
    "col-mat-length",
    "col-mat-qty",
    "col-mat-uom"
  ];

  const isSingleLine =
    td &&
    td.getAttribute("contenteditable") === "true" &&
    singleLineCols.some(cls =>
      td.classList.contains(cls)
    );

  if (isSingleLine && e.key === "Enter") {

    e.preventDefault();

    td.blur();
  }
});