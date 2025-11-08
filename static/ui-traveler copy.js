// /static/js/ui-traveler.js
import { jfetch, toast } from "/static/js/api.js";

let firstLoad = true;
const travelerNo = new URLSearchParams(location.search).get("traveler_no");
let activeTarget = null;
let activeType = null;
let currentUOM = "pcs";
let originalValue = null;
let manualRejectEdit = false; // tracks if user manually edits reject

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
    bottom: "40px",              // move to bottom
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
    document.querySelectorAll(".unit-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentUOM = btn.dataset.uom;
    document.querySelector("#uomLabel").textContent = `${currentUOM}`;
    // toastCenter(`📏 Unit set to ${currentUOM}`, true);
  });
});

// ✅ Default to PCS
document.querySelector('.unit-btn[data-uom="pcs"]').classList.add("active");

  /// ===== AUTO-FOCUS SCANNER INPUT =====
  document.addEventListener("click", (e) => {
  const scannerInput = document.getElementById("scannerInput");
  if (!scannerInput) return;

  // only refocus if click is NOT inside an input, textarea, or keypad
  if (!e.target.closest("input, textarea, #keypad")) {
    scannerInput.focus({ preventScroll: true });
  }
});

  // ✅ Only show custom keypad (no keyboard)
  document.querySelectorAll(".action-box").forEach((box) => {
    box.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }

      const target = box.querySelector(".qty-display");
      const type = box.dataset.type;
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
    console.log("OK button clicked", activeTarget, activeType);
    if (!activeTarget || !activeType) return;

    const val = +activeTarget.textContent.trim() || 0;

    const safeNum = (selector) => {
      const el = document.querySelector(selector);
      const n = el ? Number(el.textContent.trim()) : 0;
      return isNaN(n) ? 0 : n;
    };

    let qty_receive = safeNum("#receiveQty");
    let qty_accept = safeNum("#acceptQty");
    let qty_reject = safeNum("#rejectQty");
    const remark = document.querySelector("#remarkInput")?.value.trim() || "";

    if (activeType === "receive") qty_receive = val;
    if (activeType === "accept") {
      qty_accept = val;
      if (!manualRejectEdit) {
        if (qty_accept < qty_receive) {
          qty_reject = Math.max(0, qty_receive - qty_accept);
          document.querySelector("#rejectQty").textContent = qty_reject;
        } else if (qty_accept === qty_receive) {
          qty_reject = 0;
          document.querySelector("#rejectQty").textContent = 0;
        }
      }
    }
    if (activeType === "reject") {
      qty_reject = val;
      manualRejectEdit = true;
    }

    if (qty_accept > qty_receive) {
      toastCenter("⚠️ Accept cannot be greater than Receive!", false);
      const acceptEl = document.querySelector("#acceptQty");
      if (acceptEl && originalValue !== null) {
        acceptEl.textContent = originalValue;
        updateDisplay(originalValue);
      }
      hideKeypad(true);
      return;
    }

    const payload = { qty_receive, qty_accept, qty_reject, remark };
    console.log("🔢 Sending payload:", payload);

    try {
      const travelerData = await jfetch(`/api/v1/travelers/by_no/${travelerNo}`);
      const stepId = travelerData?.active_step?.id;
      if (!stepId) {
        toastCenter("No active step found", false);
        return;
      }
      await jfetch(`/api/v1/travelers/traveler_steps/${stepId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      toastCenter(`💾 Updated ${activeType} = ${val} ${currentUOM}`, true);
      setTimeout(loadOperation, 600);
      hideKeypad();
    } catch (err) {
      console.error("❌ PATCH error", err);
      toastCenter(err.message || "Auto-update failed", false);
    }
  });

  document.querySelector(".close-btn").addEventListener("click", () => hideKeypad(true));

  // ===== CONFIRM BUTTON =====
  document.querySelector("#btnConfirm").addEventListener("click", async () => {
    const qty_receive = +document.querySelector("#receiveQty").textContent || 0;
    const qty_accept = +document.querySelector("#acceptQty").textContent || 0;
    const qty_reject = +document.querySelector("#rejectQty").textContent || 0;
    const remark = document.querySelector("#remarkInput").value.trim();

    if (qty_accept > qty_receive) {
      toastCenter("⚠️ Accept cannot be greater than Receive!", false);
      return;
    }

    const payload = { qty_receive, qty_accept, qty_reject, remark };

    try {
      const resp = await jfetch(`/api/v1/travelers/by_no/${travelerNo}/record`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      console.log("✅ CONFIRM record:", resp);
      toast("✅ Step marked as PASSED");
      await loadOperation();
    } catch (err) {
      console.error("❌ CONFIRM error", err);
      toast(err.message || "Save failed", false);
    }
  });

  // Load first data
  loadOperation();
});

/* ===== AUTO-SAVE REMARK ===== */
let remarkTimer = null;
const AUTO_SAVE_DELAY = 500;

document.querySelector("#remarkInput").addEventListener("input", () => {
  clearTimeout(remarkTimer);
  remarkTimer = setTimeout(async () => {
    const remark = document.querySelector("#remarkInput").value.trim();
    if (!remark) return;

    try {
      const travelerData = await jfetch(`/api/v1/travelers/by_no/${travelerNo}`);
      const stepId = travelerData?.active_step?.id;
      if (!stepId) {
        toast("No active step found", false);
        return;
      }
      const payload = { remark };
      await jfetch(`/api/v1/travelers/traveler_steps/${stepId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      console.log("💬 Auto-saved remark");
      toast("📝 Remark auto-saved");
    } catch (err) {
      console.error("❌ Remark save error", err);
      toast("Failed to save remark", false);
    }
  }, AUTO_SAVE_DELAY);
});

/* ===== LOAD CURRENT STEP ===== */
async function loadOperation() {
  try {
    const data = await jfetch(`/api/v1/travelers/by_no/${travelerNo}`);
    console.log("travelerData", data);
    if (!data) return;

    let step = data.active_step || {};
    if (data.steps && step.id) {
      const full = data.steps.find((s) => s.id === step.id);
      if (full) step = { ...step, ...full };
    }

    currentUOM = step.uom || "pcs";
    const opText = step.operator_emp_code || step.operator_name || "—";
    const opLabel = step.seq ? `OP#${step.seq}` : "-";

    document.querySelector("#opCode").textContent = opLabel;
    document.querySelector("#opName").textContent = step.step_name || "-";
    document.querySelector("#opDesc").textContent = step.step_note || "";
    document.querySelector("#operatorName").textContent = "Operator: " + opText;

    document.querySelector("#receiveQty").textContent = step.qty_receive ?? 0;
    document.querySelector("#acceptQty").textContent = step.qty_accept ?? 0;
    document.querySelector("#rejectQty").textContent = step.qty_reject ?? 0;
    document.querySelector("#remarkInput").value =
      step.remark || step.step_note || "";

    if (!data.active_step) {
      const wrap = document.querySelector(".wrap");
      wrap.innerHTML = `
        <div style="
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          height:70vh;
          background:#f9fafb;
          border-radius:8px;
          text-align:center;
        ">
          <div style="font-size:72px;">🎉</div>
          <div style="font-size:26px; font-weight:700; margin-top:10px; color:#111;">
            Traveler <span style="color:#2563eb;">${travelerNo}</span> Completed !!
          </div>
        </div>`;
      toast("🎉 Traveler is fully completed!", true);
      return;
    }
  } catch (err) {
    console.error("❌ loadOperation failed", err);
    toast(err.message || "Load failed", false);
  }
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
      // just show machine code directly, or fetch from API
      document.getElementById("machinename").textContent = value;
      toastCenter(`🖥️ Machine selected: ${value}`, true);

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
    }
    else{


   
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
