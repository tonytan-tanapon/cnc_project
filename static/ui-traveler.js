// /static/js/ui-traveler.js
import { jfetch, toast } from "/static/js/api.js";

let firstLoad = true;
let activeTarget = null;
let activeType = null;
let currentUOM = "pcs";
let originalValue = null;
let manualRejectEdit = false; // tracks if user manually edits reject

let currentStepData = null;   // ✅ FIX สำคัญ
let currentMachineId = null;

const machineIdFromURL = new URLSearchParams(location.search).get("machine_id");

const travelerNo = new URLSearchParams(location.search).get("traveler_no");
const travelerStep = new URLSearchParams(location.search).get("seq");
const travelerEmp = new URLSearchParams(location.search).get("traveler_emp");
console.log("Traveler No:", travelerNo, travelerStep, travelerEmp);


function getLADate() {
  const now = new Date();

  const la = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return la; // YYYY-MM-DD
}
/* ===== KEYPAD CONTROL ===== */
function showKeypad(target, type) {
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
  document.querySelector("#uomLabel").textContent = `${currentUOM}`;

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
  // ===== UNIT SELECTION =====
  document.querySelectorAll(".unit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".unit-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentUOM = btn.dataset.uom;
      document.querySelector("#uomLabel").textContent = `${currentUOM}`;
      // toastCenter(`📏 Unit set to ${currentUOM}`, true);
    });
  });

  // ✅ Default to PCS
  document.querySelector('.unit-btn[data-uom="pcs"]').classList.add("active");

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

  // ===== Keypad numeric keys =====
  document.querySelectorAll(".key").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!activeTarget) return;
      let val = activeTarget.textContent.trim();
      if (isFirstKeyPress) {
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

    const val = Number(activeTarget.textContent.trim()) || 0;

    // 🔥 ดึงค่าจริงล่าสุดจาก DB ก่อน
    const stepId = currentStepData?.id;

    if (!stepId) {
      toastCenter("Step not ready", false);
      return;
    }

    const logs = await jfetch(`/api/v1/step-logs?step_id=${stepId}`);
    console.log("STEP ID:", currentStepData?.id);

    const today = getLADate();

    const existing = logs.find(
      (l) => l.work_date?.slice(0, 10) === today
    );

    let qty_accept = existing?.qty_accept || 0;
    let qty_reject = existing?.qty_reject || 0;

    const remark = document.querySelector("#remarkInput")?.value.trim() || "";
    const operator_code = new URLSearchParams(location.search).get("traveler_emp");

    if (activeType === "accept") qty_accept = val;
    if (activeType === "reject") qty_reject = val;

    try {
      let operator_id = null;
      if (operator_code) {
        const emp = await jfetch(`/api/v1/employees/by-code/${operator_code}`);
        operator_id = emp?.id || null;
      }

      const stepId = currentStepData?.id;

      if (!stepId) {
        toastCenter("No active step found", false);
        return;
      }

      const today = getLADate();
      const logs = await jfetch(`/api/v1/step-logs?step_id=${stepId}`);

      const existing = logs.find(
        (l) => l.work_date?.slice(0, 10) === today
      );

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
        const today = getLADate();

        await jfetch(`/api/v1/step-logs`, {
          method: "POST",
          body: JSON.stringify({
            step_id: stepId,
            work_date: today,          // ⭐ FIX สำคัญ
            qty_accept,
            qty_reject,
            operator_id,
            machine_id: currentMachineId,
            note: remark,
          }),
        });
      }

      toastCenter(`💾 Saved ${activeType} = ${val}`, true);
      setTimeout(loadOperation, 500);
      hideKeypad();

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

      // 🔥 FIX: ใช้ตัวเดียว
      const stepId = currentStepData?.id || data?.active_step?.id;

      if (!stepId) {
        toastCenter("No active step found", false);
        return;
      }

      const remark = document.querySelector("#remarkInput").value.trim();

      const logs = await jfetch(`/api/v1/step-logs?step_id=${stepId}`);
      const today = getLADate();

      const existing = logs.find(
        (l) => l.work_date?.slice(0, 10) === today
      );

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
      const today = getLADate();

      const existing = logs.find(
        (l) => l.work_date?.slice(0, 10) === today
      );

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
/* ===== LOAD CURRENT STEP ===== */
async function loadOperation() {


  // =========================
  // ✅ MACHINE FROM LANDING ONLY
  // =========================
  let machineText = "-";

  if (machineIdFromURL) {
    currentMachineId = Number(machineIdFromURL);

    try {
      const m = await jfetch(`/api/v1/machines/${currentMachineId}`);

      machineText = m.name || m.code || currentMachineId;

    } catch (err) {
      console.error("machine fetch error", err);
      machineText = currentMachineId;
    }
  }

  document.querySelector("#machinename").textContent =
    "Machine: " + machineText;

  try {
    const travelerStep = new URLSearchParams(location.search).get("seq");
    const qs =
      travelerStep !== null ? `?seq=${encodeURIComponent(travelerStep)}` : "";

    // 🔥 เพิ่มบรรทัดนี้
    const data = await jfetch(`/api/v1/travelers/by_no/${travelerNo}${qs}`);


    console.log("🔥 FULL DATA:", data);
    if (!data) return;

    let step = data.active_step || {};
    currentStepData = step;   // ⭐ FIX ตัวนี้

    if (data.steps && step.id) {
      const full = data.steps.find((s) => s.id === step.id);
      if (full) step = { ...step, ...full };
    }

    const receive = step.qty_receive ?? 0;
    const accept = step.qty_accept ?? 0;
    const reject = step.qty_reject ?? 0;

    const remain = receive - (accept + reject);

    const el = document.querySelector("#remainText");

    if (el) {
      el.textContent = `Remain/Receive : ${remain} / ${receive}`;

      if (remain === 0) {
        el.style.color = "#16a34a";
      } else {
        el.style.color = "#dc2626";
      }
    }
    // =========================
    // 🔥 LOAD REMARK FROM STEP LOG (TODAY)
    // =========================
    if (step.id) {
      const logs = await jfetch(`/api/v1/step-logs?step_id=${step.id}`);

      const today = getLADate();

      const todayLog = logs.find(
        (l) => l.work_date?.slice(0, 10) === today
      );

      document.querySelector("#remarkInput").value =
        todayLog?.note || step.note || "";
    }
    // =========================
    // 🔥 LOAD REMARK FROM STEP LOG (TODAY)
    // =========================


    // =========================
    // OPERATOR
    // =========================
    const operator = step.operator || {};
    const emp_op = operator.emp_op || "—";
    const nickname = operator.nickname || "—";

    currentUOM = step.uom || "pcs";

    const opLabel = step.seq ? `OP#${step.seq}` : "-";
    const step_list = data.steps || [];

    let op_status;
    if (travelerStep) {
      op_status = step.status || "pending";
    } else {
      op_status = getFirstActiveStatus(step_list);
    }

    // =========================
    // UI
    // =========================
    const opListEl = document.querySelector("#op_list");
    opListEl.innerHTML = "";

    const header = document.createElement("div");
    header.className = "op-item header";
    header.innerHTML = `<div style="font-weight:700;">OP</div>`;
    opListEl.appendChild(header);

    step_list.forEach((s) => {
      const div = document.createElement("div");
      div.className = "op-item";
      div.style.borderLeft = `6px solid ${statusColor(s.status)}`;

      if (Number(s.seq) === Number(travelerStep)) {
        div.classList.add("active");
      }

      div.innerHTML = `<div style="font-weight:700;">${s.seq}</div>`;

      // 🔥 IMPORTANT: carry machine_id forward
      div.onclick = () => {
        location.href =
          `/static/ui-traveler.html?traveler_no=${encodeURIComponent(data.traveler_no)}`
          + `&seq=${encodeURIComponent(s.seq)}`
          + `&traveler_emp=${encodeURIComponent(travelerEmp)}`
          + `&machine_id=${currentMachineId}`;
      };

      opListEl.appendChild(div);
    });

    document.querySelector("#opCode").textContent = opLabel;

    const opStatusEl = document.querySelector("#op_status");
    opStatusEl.textContent = op_status;
    opStatusEl.style.display = "inline-block";
    opStatusEl.style.padding = "6px 14px";
    opStatusEl.style.borderRadius = "999px";
    opStatusEl.style.fontWeight = "700";
    opStatusEl.style.fontSize = "14px";
    opStatusEl.style.backgroundColor = statusColor(op_status);
    opStatusEl.style.color = "#fff";

    document.querySelector("#opName").textContent = step.step_name || "-";
    document.querySelector("#loginOP").textContent = `Login: ${travelerEmp}`;
    document.querySelector("#operatorName").textContent =
      `Operator: ${emp_op} (${nickname})`;

    // ✅ MACHINE DISPLAY (FINAL)
    document.querySelector("#machinename").textContent =
      "Machine: " + machineText;

    // document.querySelector("#receiveQty").textContent =
    //   step.qty_receive ?? 0;

    document.querySelector("#acceptQty").textContent =
      step.qty_accept ?? 0;

    document.querySelector("#rejectQty").textContent =
      step.qty_reject ?? 0;


    //     document.querySelector("#remainQty").textContent =
    // step.qty_remain ?? 0;

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
