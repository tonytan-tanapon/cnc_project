// /static/js/ui-traveler.js
import { jfetch, toast } from "/static/js/api.js";

let firstLoad = true;
const travelerNo = new URLSearchParams(location.search).get("traveler_no");
let activeTarget = null;
let activeType = null;
let currentUOM = "pcs";
let originalValue = null;
let manualRejectEdit = false; // tracks if user manually edits reject
// ===== KEYPAD CONTROL =====
function showKeypad(target, type) {
  activeTarget = target;
  console.log("showKeypad activeTarget:", target, type);
  activeType = type;
  document.querySelector("#keypad").style.display = "flex";
  document.querySelector("#uomLabel").textContent = `Unit: ${currentUOM}`;

  const currentVal = activeTarget.textContent.trim() || "0";
  document.querySelector("#keypadDisplay").textContent = currentVal;

  // ✅ store original before editing
  originalValue = currentVal;

  isFirstKeyPress = true; // 🆕 reset when opening keypad
}

// ===== DISABLE PHYSICAL KEYBOARD WHEN KEYPAD ACTIVE =====
function disablePhysicalKeyboard() {
  document.addEventListener(
    "keydown",
    (e) => {
      if (document.querySelector("#keypad").style.display === "flex") {
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

  // ✅ if cancel → restore previous value
  if (cancel && activeTarget && originalValue !== null) {
    activeTarget.textContent = originalValue;
    updateDisplay(originalValue);
  }

  activeTarget = null;
  activeType = null;
  originalValue = null;
}


// ===== DOM READY =====
let isFirstKeyPress = true;
function toastCenter(message, success = true, duration = 2000) {
  // Remove old toast if any
  const old = document.querySelector(".toast-center");
  if (old) old.remove();

  // Create toast element
  const div = document.createElement("div");
  div.className = "toast-center";
  div.textContent = message;

  // Style it (centered, floating)
  Object.assign(div.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: success ? "rgba(46, 204, 113, 0.9)" : "rgba(231, 76, 60, 0.9)",
    color: "#fff",
    padding: "14px 22px",
    borderRadius: "8px",
    fontSize: "18px",
    fontWeight: "600",
    zIndex: "9999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    opacity: "0",
    transition: "opacity 0.3s ease",
  });

  document.body.appendChild(div);

  // Animate in
  setTimeout(() => (div.style.opacity = "1"), 50);

  // Remove after duration
  setTimeout(() => {
    div.style.opacity = "0";
    setTimeout(() => div.remove(), 300);
  }, duration);
}
document.addEventListener("DOMContentLoaded", () => {
  // เปิด keypad เมื่อคลิกกล่อง qty
  document.querySelectorAll(".action-box").forEach((box) => {
    box.addEventListener("click", () => {
      const target = box.querySelector(".qty-display");
      const type = box.dataset.type;
      showKeypad(target, type);
    });
  });

  // ปุ่มตัวเลข
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

  // ปุ่ม Clear
  document.querySelector(".key-wide").addEventListener("click", () => {
    if (activeTarget) {
      activeTarget.textContent = "0";
      updateDisplay("0");
    }
  });

  // ✅ ปุ่ม OK → PATCH DB

  // ✅ OK button logic (auto-update + safe number handling)
document.querySelector(".ok-btn").addEventListener("click", async () => {
  console.log("OK button clicked", activeTarget, activeType);
  if (!activeTarget || !activeType) {
    console.warn("⚠️ Missing activeTarget or activeType");
    return;
  }

  const val = +activeTarget.textContent.trim() || 0;

  // Helper to safely read numeric DOM values
  const safeNum = (selector) => {
    const el = document.querySelector(selector);
    const n = el ? Number(el.textContent.trim()) : 0;
    return isNaN(n) ? 0 : n;
  };

  let qty_receive = safeNum("#receiveQty");
  let qty_accept = safeNum("#acceptQty");
  let qty_reject = safeNum("#rejectQty");
  const remark = document.querySelector("#remarkInput")?.value.trim() || "";

  // === Apply changed field ===
  if (activeType === "receive") {
    qty_receive = val;
  }

  if (activeType === "accept") {
    qty_accept = val;

    // ✅ Auto-calc reject only if accept < receive and not manual
    if (!manualRejectEdit) {
      if (qty_accept < qty_receive) {
        qty_reject = Math.max(0, qty_receive - qty_accept);
        const rejectEl = document.querySelector("#rejectQty");
        if (rejectEl) rejectEl.textContent = qty_reject;
      } else if (qty_accept === qty_receive) {
        qty_reject = 0;
        const rejectEl = document.querySelector("#rejectQty");
        if (rejectEl) rejectEl.textContent = 0;
      } else {
        console.log("⚠️ Skip reject auto-calc (accept > receive)");
      }
    }
  }

  if (activeType === "reject") {
    qty_reject = val;
    manualRejectEdit = true;
  }

  // === Validation ===
  if (qty_accept > qty_receive) {
    toastCenter("⚠️ Accept cannot be greater than Receive!", false);

    // ✅ Restore Accept to its previous value
    const acceptEl = document.querySelector("#acceptQty");
    if (acceptEl && originalValue !== null) {
      acceptEl.textContent = originalValue;
      updateDisplay(originalValue); // restore keypad
    }

    // ✅ Close keypad after showing warning
    hideKeypad(true);
    return; // 🚫 Stop update
  }

  // ✅ Build payload
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
    hideKeypad(); // ✅ close keypad after success
  } catch (err) {
    console.error("❌ PATCH error", err);
    toastCenter(err.message || "Auto-update failed", false);
  }
});


  // ปุ่ม Close keypad
  document.querySelector(".close-btn").addEventListener("click", () => hideKeypad(true));

  // ===== CONFIRM BUTTON =====
  document.querySelector("#btnConfirm").addEventListener("click", async () => {
    const qty_receive = +document.querySelector("#receiveQty").textContent || 0;
    const qty_accept = +document.querySelector("#acceptQty").textContent || 0;
    const qty_reject = +document.querySelector("#rejectQty").textContent || 0;
    const remark = document.querySelector("#remarkInput").value.trim();

    if (qty_accept > qty_receive) {
      // toast("⚠️ Accept quantity cannot be greater than Receive quantity!", false);
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

  // โหลดข้อมูลครั้งแรก
  loadOperation();
});


// ===== AUTO-SAVE REMARK (debounced) =====
let remarkTimer = null;
const AUTO_SAVE_DELAY = 500; // 1s after user stops typing

document.querySelector("#remarkInput").addEventListener("input", () => {
  clearTimeout(remarkTimer);
  remarkTimer = setTimeout(async () => {
    const remark = document.querySelector("#remarkInput").value.trim();
    if (!remark) return; // skip empty

    try {
      const travelerData = await jfetch(`/api/v1/travelers/by_no/${travelerNo}`);
      const stepId = travelerData?.active_step?.id;
      if (!stepId) {
        toast("No active step found", false);
        return;
      }

      const payload = { remark };
      const resp = await jfetch(`/api/v1/travelers/traveler_steps/${stepId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      console.log("💬 Auto-saved remark:", resp);
      toast("📝 Remark auto-saved");
    } catch (err) {
      console.error("❌ Remark save error", err);
      toast("Failed to save remark", false);
    }
  }, AUTO_SAVE_DELAY);
});


// ===== LOAD CURRENT STEP =====
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

///// SCANNER INPUT HANDLING /////

let typingTimer;
const doneTypingInterval = 200; // ms after scanner stops typing

// ✅ make it async
async function handleInput() {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(async () => {
    const input = document.getElementById("scannerInput");
    const value = input.value.trim();
    if (!value) return;

    console.log("📥 Scanned:", value);

    const opDisplay = document.querySelector("#operatorName");
    // if (opDisplay) opDisplay.textContent = "Operator: " + value;

    try {
      // ✅ fetch traveler info
      const traveler = await jfetch(`/api/v1/travelers/by_no/${travelerNo}`);

      const activeStep = traveler?.active_step;
      if (!activeStep || !activeStep.id) {
        toast("⚠️ No active step found");
        return;
      }

      const stepId = activeStep.id;

      // ✅ PATCH to backend
      await jfetch(`/api/v1/travelers/traveler_steps/${stepId}`, {
        method: "PATCH",
        body: JSON.stringify({ operator_code: value }),
      });

      toast(`✅ Step ${activeStep.seq} marked as passed`);
      await loadOperation();
    } catch (err) {
      console.error("❌ Operator scan update failed:", err);
      toast("Failed to update operator", false);
    }

    // ✅ reset scanner input
    input.value = "";
    input.focus(); // ensure scanner keeps focus
  }, doneTypingInterval);
}

// ✅ make it visible to HTML inline event
window.handleInput = handleInput;
window.onload = () => {
  const scannerInput = document.getElementById("scannerInput");
  if (!scannerInput) {
    console.error("❌ scannerInput element not found");
    return;
  }

  // Optional lock flag if you use remark typing lock elsewhere
  if (!scannerInput.dataset.lock) scannerInput.dataset.lock = "false";

  const isEditable = (el) =>
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.isContentEditable ||
      el.closest?.("#remarkInput, .remark-box")); // add your selectors here

  const safeFocus = () => {
    if (scannerInput.dataset.lock === "true") return;
    // Must be visible/focusable, see CSS note above
    scannerInput.focus({ preventScroll: true });
  };

  // Initial focus (some Androids ignore immediate focus; slight delay helps)
  setTimeout(safeFocus, 50);

  // 1) If scanner loses focus, try to refocus shortly after
  scannerInput.addEventListener("blur", () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (!isEditable(a)) safeFocus();
    }, 100);
  });

  // 2) Any pointer/tap on the page that isn't inside an editable → refocus
  // Use capture=true so overlays/modals don't block it.
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (scannerInput.dataset.lock === "true") return;
      if (!isEditable(e.target)) {
        // allow default click first (e.g., button), then refocus
        setTimeout(safeFocus, 0);
      }
    },
    true
  );

  // 3) If a scan starts and nothing editable is focused, redirect keystrokes
  document.addEventListener("keydown", (e) => {
    if (scannerInput.dataset.lock === "true") return;
    const a = document.activeElement;
    if (!isEditable(a)) {
      safeFocus();
      // optional: if char key, prevent page scroll/shortcuts
      // if (e.key.length === 1) e.preventDefault();
    }
  });

  // 4) When coming back to the tab/app
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      setTimeout(safeFocus, 50);
    }
  });

  // 5) Optional: click blank areas to force focus
  document.body.addEventListener("click", (e) => {
    if (scannerInput.dataset.lock === "true") return;
    if (!isEditable(e.target)) safeFocus();
  });
};



window.onload = () => {
  const scannerInput = document.getElementById("scannerInput");
  scannerInput.focus();
  console.log("scannerInput", scannerInput);


  function ensureFocus() {
    const active = document.activeElement;
    if (
      active.tagName !== "INPUT" &&
      active.tagName !== "TEXTAREA" &&
      active !== scannerInput
    ) {
      scannerInput.focus();
    }
  }

  setInterval(ensureFocus, 1000);
}


window.showKeypad = showKeypad;
window.activeType = activeType;
window.activeTarget = activeTarget;