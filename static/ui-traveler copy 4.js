// /static/js/ui-traveler.js
import { jfetch, toast } from "/static/js/api.js";

let firstLoad = true;
let activeTarget = null;
let activeType = null;
let currentUOM = "pcs";
let originalValue = null;
let currentReceive = 0;
let manualRejectEdit = false; // tracks if user manually edits reject
let selectedLogDate = null;
let selectedLogId = null;
let currentLotId = null;
let manualRowSelected = false;
let currentStepData = null;   // ✅ FIX สำคัญ
let currentMachineId = null;

const machineIdFromURL = new URLSearchParams(location.search).get("machine_id");

const travelerNo = new URLSearchParams(location.search).get("traveler_no");
const travelerStep = new URLSearchParams(location.search).get("seq");
const travelerEmp = new URLSearchParams(location.search).get("traveler_emp");



function getLADate() {
  return new Date()
    .toLocaleString("sv-SE", {
      timeZone: "America/Los_Angeles"
    })
    .slice(0, 10);
}
/* ===== KEYPAD CONTROL ===== */
function showKeypad(target, type) {

  // ⭐ reset old row selection
  if (!document.querySelector(".active-row")) {
    selectedLogDate = null;
  }

  // ✅ Prevent tablet keyboard from appearing
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
  document.querySelectorAll("input, textarea").forEach((el) => {
    if (el.id !== "remarkInput") el.setAttribute("readonly", "readonly");
  });

  activeTarget = target;
  activeType = type;

  // ✅ Update visible label at top of keypad
  const labelEl = document.querySelector("#keypadTypeLabel");
  if (labelEl) {
    labelEl.textContent =
      type === "receive"
        ? "Receive"
        : type === "accept"
          ? "Accept"
          : type === "reject"
            ? "Reject"
            : "";
    labelEl.style.color =
      type === "receive"
        ? "#2563eb"
        : type === "accept"
          ? "#16a34a"
          : type === "reject"
            ? "#dc2626"
            : "#111";
  }

  document.querySelector("#keypad").style.display = "flex";
  document.querySelector("#uomLabel").textContent = "PCS";

  const currentVal = activeTarget.textContent.trim() || "0";
  document.querySelector("#keypadDisplay").textContent = currentVal;

  originalValue = currentVal;
  isFirstKeyPress = true;
}

/* ===== DISABLE PHYSICAL KEYBOARD WHILE KEYPAD ACTIVE ===== */
function disablePhysicalKeyboard() {
  document.addEventListener(
    "keydown",
    (e) => {
      const keypadVisible =
        document.querySelector("#keypad").style.display === "flex";
      if (keypadVisible) {
        e.preventDefault();
        e.stopPropagation();
        console.log("🔒 Physical keyboard blocked:", e.key);
      }
    },
    true
  );
}
disablePhysicalKeyboard();

function updateDisplay(val) {
  const display = document.querySelector("#keypadDisplay");
  if (display) display.textContent = val;
}

function hideKeypad(cancel = false) {
  document.querySelector("#keypad").style.display = "none";

  // ✅ Re-enable remark input typing
  document.querySelectorAll("input, textarea").forEach((el) => {
    el.removeAttribute("readonly");
  });

  // ✅ Restore previous value if canceled
  if (cancel && activeTarget && originalValue !== null) {
    activeTarget.textContent = originalValue;
    updateDisplay(originalValue);
  }

  activeTarget = null;
  activeType = null;
  originalValue = null;
}

/* ===== DOM READY ===== */
let isFirstKeyPress = true;

function toastCenter(message, success = true, duration = 1500) {
  // Remove old toast if any
  const old = document.querySelector(".toast-center");
  if (old) old.remove();

  // Create toast element
  const div = document.createElement("div");
  div.className = "toast-center";
  div.textContent = message;

  // ✅ Style (bottom-centered)
  Object.assign(div.style, {
    position: "fixed",
    bottom: "40px", // move to bottom
    left: "50%",
    transform: "translateX(-50%)",
    background: success ? "rgba(46, 204, 113, 0.9)" : "rgba(231, 76, 60, 0.9)",
    color: "#fff",
    padding: "14px 22px",
    borderRadius: "8px",
    fontSize: "18px",
    fontWeight: "600",
    zIndex: "9999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    opacity: "0",
    transition: "opacity 0.3s ease, transform 0.3s ease",
  });

  document.body.appendChild(div);

  // Animate in (slide up)
  setTimeout(() => {
    div.style.opacity = "1";
    div.style.transform = "translateX(-50%) translateY(-10px)";
  }, 50);

  // Fade out and remove
  setTimeout(() => {
    div.style.opacity = "0";
    div.style.transform = "translateX(-50%) translateY(0)";
    setTimeout(() => div.remove(), 300);
  }, duration);
}



document.addEventListener("DOMContentLoaded", () => {


  // ✅ Default to PCS
  // document.querySelector('.unit-btn[data-uom="pcs"]').classList.add("active");

  // ✅ Only show custom keypad (no keyboard)
  document.querySelectorAll(".action-box").forEach((box) => {
    box.addEventListener("click", (e) => {

      const type = box.dataset.type;

      // ❌ BLOCK RECEIVE
      if (type === "receive") {
        toastCenter("Receive is auto-calculated", false);
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const target = box.querySelector(".qty-display");
      showKeypad(target, type);
    });
  });
  // ===== Backspace button =====
  document.querySelector(".backspace-btn").addEventListener("click", () => {
    if (!activeTarget) return;

    let val = activeTarget.textContent.trim();

    // remove last character
    val = val.slice(0, -1);

    // if empty -> 0
    if (val === "") val = "0";

    activeTarget.textContent = val;
    updateDisplay(val);
  });
  // ===== Keypad numeric keys =====
  document.querySelectorAll(".key").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!activeTarget) return;
      let val = activeTarget.textContent.trim();

      if (isFirstKeyPress || val === "0") {
        val = "";
        isFirstKeyPress = false;
      }

      val = val + btn.textContent.trim();
      activeTarget.textContent = val;
      updateDisplay(val);
    });
  });

  // ===== Clear button =====
  document.querySelector(".key-wide").addEventListener("click", () => {
    if (activeTarget) {
      activeTarget.textContent = "0";
      updateDisplay("0");
    }
  });


  // ===== OK button =====
  document.querySelector(".ok-btn").addEventListener("click", async () => {
    if (!activeTarget || !activeType) return;

    const stepId = currentStepData?.id;
    if (!stepId) {
      toastCenter("Step not ready", false);
      return;
    }

    const val = parseInt(activeTarget.textContent.trim());
    if (isNaN(val) || val < 0) {
      toastCenter("Invalid number", false);
      return;
    }

    try {


      // 🔥 LOAD LOGS ONCE
      const logs = await jfetch(`/api/v1/step-logs?step_id=${stepId}`);

      const targetDate =
        manualRowSelected
          ? selectedLogDate
          : getLADate();

      const existing = logs.find((l) => {
        const logDate = formatLADate(l.work_date);

        return logDate === targetDate;
      });

      let qty_accept = existing?.qty_accept || 0;
      let qty_reject = existing?.qty_reject || 0;

      // 🔥 APPLY CHANGE
      if (activeType === "accept") qty_accept = val;
      if (activeType === "reject") qty_reject = val;

      // 🔥 VALIDATION (IMPORTANT)
      const receive = currentReceive;

      const old_accept = existing?.qty_accept || 0;
      const old_reject = existing?.qty_reject || 0;

      // remove old value first

      const new_total =
        (qty_accept + qty_reject) - (old_accept + old_reject);

      const current_total = old_accept + old_reject;

      if (current_total + new_total > receive) {
        toastCenter("❌ Accept + Reject > Receive", false);
        // return;
      }

      const remark = document.querySelector("#remarkInput")?.value.trim() || "";

      let operator_id = null;
      if (travelerEmp) {
        const emp = await jfetch(`/api/v1/employees/by-code/${travelerEmp}`);
        operator_id = emp?.id || null;
      }

      // 🔥 SAVE
      if (existing) {
        await jfetch(`/api/v1/step-logs/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            qty_accept,
            qty_reject,
            operator_id,
            machine_id: currentMachineId,
            note: remark,
          }),
        });
      } else {
        await jfetch(`/api/v1/step-logs`, {
          method: "POST",
          body: JSON.stringify({
            step_id: stepId,
            work_date: targetDate,
            qty_accept,
            qty_reject,
            operator_id,
            machine_id: currentMachineId,
            note: remark,
          }),
        });
      }

      toastCenter(`💾 Saved ${activeType} = ${val}`, true);
      console.log("Updating lot status for:", currentLotId);
      // ⭐ UPDATE LOT STATUS
      if (currentLotId) {
        await jfetch(`/api/v1/lots/${currentLotId}/status`, {
          method: "PUT",
          body: JSON.stringify({
            status: "in_process"
          })
        });
        console.log("Lot status updated to in_process");
      }




      hideKeypad();

      setTimeout(loadOperation, 300);

    } catch (err) {
      console.error("❌ ERROR", err);
      toastCenter("Save failed", false);
    }
  });

  document
    .querySelector(".close-btn")
    .addEventListener("click", () => hideKeypad(true));

  document.querySelector("#btnConfirm").addEventListener("click", async () => {
    try {

      const travelerStep = new URLSearchParams(location.search).get("seq");
      const qs =
        travelerStep !== null ? `?seq=${encodeURIComponent(travelerStep)}` : "";

      const data = await jfetch(`/api/v1/travelers/by_no/${travelerNo}${qs}`);

      currentLotId = data.lot_id;
      console.log("✅ Lot ID loaded:", currentLotId);



      // 🔥 FIX: ใช้ตัวเดียว
      const stepId = currentStepData?.id || data?.active_step?.id;

      if (!stepId) {
        toastCenter("No active step found", false);
        return;
      }

      const remark = document.querySelector("#remarkInput").value.trim();


      const logs = await jfetch(`/api/v1/step-logs?step_id=${stepId}`);
      const targetDate =
        manualRowSelected
          ? selectedLogDate
          : getLADate();

      const existing = logs.find((l) => {
        const logDate = formatLADate(l.work_date);

        return logDate === targetDate;
      });

      const qty_accept = existing?.qty_accept || 0;
      const qty_reject = existing?.qty_reject || 0;
      const operator_id = existing?.operator_id || null;

      if (existing) {
        await jfetch(`/api/v1/step-logs/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            qty_accept,
            qty_reject,
            operator_id,
            machine_id: currentMachineId,
            note: remark,
          }),
        });
      } else {
        await jfetch(`/api/v1/step-logs`, {
          method: "POST",
          body: JSON.stringify({
            step_id: stepId,
            work_date: targetDate,
            qty_accept,
            qty_reject,
            note: remark || "",
          }),
        });
      }

      toastCenter("💬 Remark saved", true);

      setTimeout(loadOperation, 400);

    } catch (err) {
      console.error("❌ Confirm save error", err);
      toastCenter("Save failed", false);
    }
  });

  // Load first data
 
  loadOperation();
  console.log("UI Traveler loaded with traveler_no:", travelerNo);
});

/* ===== AUTO-SAVE REMARK ===== */
let remarkTimer = null;
const AUTO_SAVE_DELAY = 500;

document.querySelector("#remarkInput").addEventListener("input", () => {
  clearTimeout(remarkTimer);

  remarkTimer = setTimeout(async () => {
    const remark = document.querySelector("#remarkInput").value.trim();

    try {
      const stepId = currentStepData?.id;
      if (!stepId) return;

      const logs = await jfetch(`/api/v1/step-logs?step_id=${stepId}`);

      // 🔥 FIX DATE
      const targetDate =
        manualRowSelected
          ? selectedLogDate
          : getLADate();

      const existing = logs.find((l) => {
        const logDate = formatLADate(l.work_date);
        return logDate === targetDate;
      });

      if (existing) {
        await jfetch(`/api/v1/step-logs/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            note: remark || "",   // 🔥 FIX: allow empty
          }),
        });
      } else {
        await jfetch(`/api/v1/step-logs`, {
          method: "POST",
          body: JSON.stringify({
            step_id: stepId,
            work_date: targetDate,
            note: remark || "",
          }),
        });
      }

      console.log("💬 Auto-saved:", remark);

    } catch (err) {
      console.error("❌ Auto-save error", err);
      toast("Failed to save remark", false);
    }
  }, AUTO_SAVE_DELAY);
});

function getFirstActiveStatus(steps) {
  if (!steps || steps.length === 0) return "pending";

  // 🔥 sort ก่อน (กัน bug)
  const sorted = [...steps].sort((a, b) => a.seq - b.seq);

  // 🔥 หา step แรกที่ยังไม่ผ่าน
  const firstActive = sorted.find(s => s.status !== "passed");

  if (!firstActive) return "passed";

  return firstActive.status;
}

function formatLADate(date) {
  if (!date) return "";

  // ✅ pure DATE from backend
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  // datetime fallback
  return new Date(date)
    .toLocaleString("sv-SE", {
      timeZone: "America/Los_Angeles",
    })
    .slice(0, 10);
}


/* ===== LOAD CURRENT STEP ===== */
function getTodayLog(logs) {
  const today = getLADate();
  console.log("Looking for today's log. Today =", today);
  return logs.find(
    l => l.work_date && formatLADate(l.work_date) === today
  );
}

function calcReceive(step, steps, allLogs, todayAccept, todayReject) {
  // STEP 1
  if (step.seq === 1) {
    return todayAccept + todayReject;
  }

  const prevStep = steps
    ?.filter(s => s.seq < step.seq)
    .sort((a, b) => b.seq - a.seq)[0];

  if (!prevStep?.id) return 0;

  const prevLogs = allLogs[prevStep.id] || [];

  return prevLogs.reduce(
    (sum, l) => sum + (Number(l.qty_accept || 0) + Number(l.qty_reject || 0)),
    0
  );
}


async function loadOperation() {

  
  // =========================
  // MACHINE
  // =========================
  let machineText = "-";

  if (machineIdFromURL) {
    currentMachineId = Number(machineIdFromURL);

    try {
      const m = await jfetch(`/api/v1/machines/${currentMachineId}`);
      machineText = m.name || m.code || currentMachineId;
    } catch {
      machineText = currentMachineId;
    }
  }

  document.querySelector("#machinename").textContent =
    "Machine: " + machineText;

  try {
    const qs = travelerStep ? `?seq=${encodeURIComponent(travelerStep)}` : "";
    const data = await jfetch(`/api/v1/travelers/by_no/${travelerNo}${qs}`);

    currentLotId = data.lot_id;
    console.log("✅ currentLotId loaded:", currentLotId);

    // ⭐ SHOW LOT + PART (CORRECT PLACE)
    document.querySelector("#lot_no").textContent =
      `Lot: ${data.lot?.lot_no || "-"}`;

    document.querySelector("#part_no").textContent =
      `Part: ${data.lot?.part?.part_no || "-"}`;

    document.querySelector("#part_rev").textContent =
      `Rev: ${data.lot?.part?.part_rev || "-"}`;

    if (!data) return;

    // =========================
    // 🔥 OP LIST (INSIDE loadOperation)
    // =========================
    const opListEl = document.querySelector("#op_list");

    if (opListEl) {
      opListEl.innerHTML = "";

      const steps = data.steps || [];

      steps.forEach((s) => {
        const div = document.createElement("div");

        div.className = "op-item";

        if (Number(s.seq) === Number(travelerStep)) {
          div.classList.add("active");
        }

        div.style.borderLeft = `10px solid ${statusColor(s.status)}`;

        div.innerHTML = `
  <div style="font-size:25px;font-weight:700;">${s.step_code}</div>
 </div>
`;

        div.onclick = () => {
          location.href =
            `/static/ui-traveler.html?traveler_no=${encodeURIComponent(travelerNo)}`
            + `&seq=${encodeURIComponent(s.seq)}`
            + `&traveler_emp=${encodeURIComponent(travelerEmp)}`
            + `&machine_id=${currentMachineId}`;
        };

        opListEl.appendChild(div);
      });
    }
    // =========================
    // STEP
    // =========================


    let step = data.active_step || {};



    if (!step.id && data.steps?.length) {
      step = data.steps.find(s => s.seq == travelerStep) || data.steps[0];
    }

    currentStepData = step;

    // =========================
    // 🔥 LOAD ALL LOGS (KEY FIX)
    // =========================
    const allLogs = {};

    for (const s of data.steps || []) {
      if (s.id) {
        allLogs[s.id] = await jfetch(`/api/v1/step-logs?step_id=${s.id}`);
      }
    }

    const logs = allLogs[step.id] || [];

    const todayLog = getTodayLog(logs);
    const activeLog = selectedLogDate
      ? logs.find(l =>
        formatLADate(l.work_date) === selectedLogDate
      )
      : getTodayLog(logs);

    const today = getLADate();

    // =========================
    // LEFT SIDE (TODAY)
    // =========================
    const accept = activeLog?.qty_accept || 0;
    const reject = activeLog?.qty_reject || 0;

    document.querySelector("#acceptQty").textContent = parseInt(accept || 0);
    document.querySelector("#rejectQty").textContent = parseInt(reject || 0);

    // =========================
    // RECEIVE (FIXED)
    // =========================
    const stepData = data.steps.find(s => s.id === step.id) || {};
    // console.log("Current Step Data:", stepData);


    const receive = stepData.qty_receive || 0;
    const remain = stepData.qty_remain || 0;

    currentReceive = receive;

    const el = document.querySelector("#remainText");
    if (el) {
      el.textContent = `Remain/Receive : ${remain} / ${receive}`;
      el.style.color = remain === 0 ? "#16a34a" : "#dc2626";
    }

    // =========================
    // 🔥 TOTAL (ADD HERE)
    // =========================
    const totalAccept = stepData.qty_accept || 0;
    const totalReject = stepData.qty_reject || 0;

    const elTotalAccept = document.querySelector("#totalAccept");
    const elTotalReject = document.querySelector("#totalReject");

    if (elTotalAccept) elTotalAccept.textContent = parseInt(totalAccept || 0);
    if (elTotalReject) elTotalReject.textContent = parseInt(totalReject || 0);

    // =========================
    // RIGHT SIDE TABLE
    // =========================
    const tbody = document.querySelector("#logTable tbody");

    if (tbody) {
      tbody.innerHTML = "";

      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:#999">No data</td></tr>`;
      } else {
        const totalAccept = logs.reduce(
          (sum, l) => sum + Number(l.qty_accept || 0),
          0
        );

        const totalReject = logs.reduce(
          (sum, l) => sum + Number(l.qty_reject || 0),
          0
        );

        logs
          .sort((a, b) => new Date(b.work_date) - new Date(a.work_date))
          .forEach((l) => {

            const tr = document.createElement("tr");

            const logDate = formatLADate(l.work_date);
            const today = getLADate();

            // ⭐ highlight on load
            if (
              selectedLogDate === logDate ||
              (!selectedLogDate && logDate === today)
            ) {
              tr.classList.add("active-row");
            }
            tr.style.cursor = "pointer";

            tr.onclick = () => {
              manualRowSelected = true;
              selectedLogDate = formatLADate(l.work_date);

              // remove old
              document.querySelectorAll("#logTable tbody tr")
                .forEach(r => r.classList.remove("active-row"));

              // add new
              tr.classList.add("active-row");

              document.querySelector("#acceptQty").textContent =
                parseInt(l.qty_accept || 0);

              document.querySelector("#rejectQty").textContent =
                parseInt(l.qty_reject || 0);

              // ✅ FIX REMARK
              document.querySelector("#remarkInput").value =
                l.note || "";

              toastCenter(`Editing ${selectedLogDate}`, true);
            };

            tr.innerHTML = `
      <td>
    ${l.work_date
                ? (() => {
                  const [y, m, d] = l.work_date.split("-");
                  return `${m}/${d}/${y.slice(2)}`;
                })()
                : "-"
              }
  </td>
      <td>${parseInt(l.qty_accept || 0)}</td>
      <td>${parseInt(l.qty_reject || 0)}</td>
      <td>${l.operator_nickname || l.operator_name || "-"}</td>
      <td>${l.machine_name || "-"}</td>
    `;

            tbody.appendChild(tr);
          });

        // 🔥 ADD TOTAL ROW HERE
        const totalRow = document.createElement("tr");

        totalRow.innerHTML = `
  <td style="font-weight:700;">Total</td>
  <td style="font-weight:700; color:#16a34a;">${parseInt(totalAccept || 0)}</td>
<td style="font-weight:700; color:#ef4444;">${parseInt(totalReject || 0)}</td>
  <td></td>
  <td></td>
`;

        totalRow.style.background = "#f9fafb";
        totalRow.style.borderTop = "2px solid #111";

        tbody.appendChild(totalRow);
      }
    }

    // =========================
    // REMARK
    // =========================


    let currentRemark = "";

    if (selectedLogDate) {


      const selectedLog = logs.find(l => {
        const logDate = formatLADate(l.work_date);




        return logDate === selectedLogDate;
      });

      currentRemark = selectedLog?.note || "";
    } else {
      currentRemark = todayLog?.note || step.note || "";
    }


    document.querySelector("#remarkInput").value = currentRemark;

    // =========================
    // OPERATOR
    // =========================

    let operatorText = travelerEmp || "—";

    console.log("Loading operator for code:", travelerEmp);

    try {

      if (travelerEmp) {

        const emp = await jfetch(
          `/api/v1/employees/by-code/${travelerEmp}`
        );

        console.log("emp =", emp);
    
        operatorText =
          
          emp.nickname ||
          emp.name ||
          emp.emp_code ||
          travelerEmp;

        console.log("operatorText =", operatorText);
      }

    } catch (err) {

      console.warn("Failed to load employee", err);
    }

    document.querySelector("#operatorName").textContent =
      `Operator: (${operatorText})`;

    // document.querySelector("#loginOP").textContent =
    //   `Login: ${travelerEmp}`;

    // =========================
    // STATUS
    // =========================
    const op_status = travelerStep
      ? step.status
      : getFirstActiveStatus(data.steps);

    const opStatusEl = document.querySelector("#op_status");
    opStatusEl.textContent = "status: " + op_status;
    opStatusEl.style.backgroundColor = statusColor(op_status);

    document.querySelector("#opName").textContent =
      step.step_name || "-";

    document.querySelector("#opCode").textContent =
      step.seq ? `OP#${step.step_code}` : "-";

  } catch (err) {
    console.error("❌ loadOperation failed", err);
    toast(err.message || "Load failed", false);
  }
}

function statusColor(status) {
  return (
    {
      passed: "#10b981",
      pending: "#6b7280",
      in_process: "#f59e0b",
      rejected: "#ef4444",
      running: "#3b82f6",
    }[status] || "#6b7280"
  );
}




/* ===== SCANNER INPUT HANDLING ===== */
let typingTimer;
const doneTypingInterval = 200;

async function handleInput() {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(async () => {
    const input = document.getElementById("scannerInput");
    const value = input.value.trim();
    if (!value) return;

    console.log("📥 Scanned:", value);

    // === CASE 1: Machine QR code ===
    // Example: prefix your QR with "MC:" or detect machine code pattern
    if (value.startsWith("m") || value.startsWith("cnc")) {
      try {
        const m = await jfetch(`/api/v1/machines/by_code/${value}`);

        currentMachineId = m.id;   // ✅ สำคัญ
        document.getElementById("machinename").textContent = m.name || value;

        toastCenter(`🖥️ Machine: ${m.name}`, true);

      } catch (err) {
        toastCenter("Machine not found", false);
      }

      input.value = "";
      input.focus({ preventScroll: true });
      return;
    }
    if (value.startsWith("e") || value.startsWith("E")) {
      // just show machine code directly, or fetch from API
      document.getElementById("machinename").textContent = value;
      toastCenter(`Employee selected: ${value}`, true);

      // optional: if you have a backend lookup for machine details
      // try {
      //   const machine = await jfetch(`/api/v1/machines/by_code/${value}`);
      //   document.getElementById("machinename").textContent = machine.name || value;
      //   toastCenter(`🖥️ Machine: ${machine.name}`, true);
      // } catch (err) {
      //   console.warn("Machine lookup failed", err);
      // }

      input.value = "";
      input.focus({ preventScroll: true });
      return; // stop further traveler logic
    } else {
      // === CASE 2: Operator / Traveler scan (existing logic) ===
      try {
        const traveler = await jfetch(`/api/v1/travelers/by_no/${travelerNo}`);
        const activeStep = traveler?.active_step;
        if (!activeStep || !activeStep.id) {
          toast("⚠️ No active step found");
          return;
        }

        const stepId = activeStep.id;
        await jfetch(`/api/v1/travelers/traveler_steps/${stepId}`, {
          method: "PATCH",
          body: JSON.stringify({ operator_code: value }),
        });

        toastCenter(`🖥️ Operator selected: ${value}`, true);
        await loadOperation();
      } catch (err) {
        console.error("❌ Operator scan update failed:", err);
        toastCenter("Failed to update operator", false);
      }
    }
    input.value = "";
    input.focus();
  }, doneTypingInterval);


}
window.handleInput = handleInput;

window.showKeypad = showKeypad;
window.activeType = activeType;
window.activeTarget = activeTarget;


document.getElementById("exitBtn").onclick = () => {
  window.location.href = "/static/ui-traveler-landing.html";
  // 🔁 change to your main page
};