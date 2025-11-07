// /static/js/ui-traveler.js
import { jfetch, toast } from "/static/js/api.js";

let firstLoad = true;
const travelerNo = new URLSearchParams(location.search).get("traveler_no");
let activeTarget = null;
let activeType = null;
let currentUOM = "pcs";

// ===== KEYPAD CONTROL =====
function showKeypad(target, type) {
  activeTarget = target;
  activeType = type;
  document.querySelector("#keypad").style.display = "flex";
  document.querySelector("#uomLabel").textContent = `Unit: ${currentUOM}`;

  const currentVal = activeTarget.textContent.trim() || "0";
  document.querySelector("#keypadDisplay").textContent = currentVal;

  isFirstKeyPress = true; // 🆕 reset when opening keypad
}

function hideKeypad() {
  document.querySelector("#keypad").style.display = "none";
  activeTarget = null;
  activeType = null;
}

// helper
function updateDisplay(val) {
  document.querySelector("#keypadDisplay").textContent = val;
}

// ===== DOM READY =====
let isFirstKeyPress = true;

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
  document.querySelector(".ok-btn").addEventListener("click", async () => {
    if (!activeTarget || !activeType) {
      console.warn("⚠️ Missing activeTarget or activeType");
      return;
    }

    const val = +activeTarget.textContent.trim() || 0;
    hideKeypad();

    const payload = {
      qty_receive: +document.querySelector("#receiveQty").textContent || 0,
      qty_accept: +document.querySelector("#acceptQty").textContent || 0,
      qty_reject: +document.querySelector("#rejectQty").textContent || 0,
      remark: document.querySelector("#remarkInput").value.trim(),
    };

    if (activeType === "receive") payload.qty_receive = val;
    if (activeType === "accept") payload.qty_accept = val;
    if (activeType === "reject") payload.qty_reject = val;

    try {
      const travelerData = await jfetch(`/api/v1/travelers/by_no/${travelerNo}`);
      
      const stepId = travelerData?.active_step?.id;
      if (!stepId) {
        toast("No active step found", false);
        return;
      }

      await jfetch(`/api/v1/travelers/traveler_steps/${stepId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      toast(`💾 Updated ${activeType} = ${val} ${currentUOM}`);
      await loadOperation();
    } catch (err) {
      console.error("❌ PATCH error", err);
      toast(err.message || "Auto-update failed", false);
    }
  });

  // ปุ่ม Close keypad
  document.querySelector(".close-btn").addEventListener("click", hideKeypad);

  // ===== CONFIRM BUTTON =====
  document.querySelector("#btnConfirm").addEventListener("click", async () => {
    const qty_receive = +document.querySelector("#receiveQty").textContent || 0;
    const qty_accept = +document.querySelector("#acceptQty").textContent || 0;
    const qty_reject = +document.querySelector("#rejectQty").textContent || 0;
    const remark = document.querySelector("#remarkInput").value.trim();

    if (qty_accept > qty_receive) {
      toast("⚠️ Accept quantity cannot be greater than Receive quantity!", false);
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

// ===== AUTO-SAVE REMARK =====
document.querySelector("#remarkInput").addEventListener("keydown", async (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const remark = e.target.value.trim();

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
      console.log("💬 Remark auto-saved:", resp);
      toast("📝 Remark saved");
    } catch (err) {
      console.error("❌ Remark save error", err);
      toast("Failed to save remark", false);
    }
  }
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

// // ===== QR SCANNER DETECTION =====
// let scanBuffer = "";
// let scanTimer;
// const SCAN_DELAY = 150; // ms after scanner stops typing

// function handleScanInput(char) {
//   scanBuffer += char;
//   clearTimeout(scanTimer);

//   scanTimer = setTimeout(async () => {
//     const value = scanBuffer.trim();

//     scanBuffer = "";
//     if (!value) return;

//     console.log("📥 Scanned dd :", value);

//     const opDisplay = document.querySelector("#operatorName");
//     opDisplay.textContent = "Operator: " + value;

//     try {
//       // after scanning QR or loading traveler:
//       const traveler = await jfetch(`/api/v1/travelers/by_no/${travelerNo}`);

//       const activeStep = traveler.active_step;
//       if (!activeStep || !activeStep.id) {
//         toast("⚠️ No active step found");
//         return;
//       }

//       const stepId = activeStep.id; // 👈 use this

//       // then PATCH to backend
//       await jfetch(`/api/v1/travelers/traveler_steps/${stepId}`, {
//         method: "PATCH",
//         body: JSON.stringify({
//          operator_code: value,
//         }),
//       });

//       toast(`✅ Step ${activeStep.seq} marked as passed`);
//       await loadOperation();
//     } catch (err) {
//       console.error("❌ Operator scan update failed:", err);
//       toast("Failed to update operator", false);
//     }
//   }, SCAN_DELAY);
// }

// // Listen for keyboard scanner input
// window.addEventListener("keydown", (e) => {
//   if (e.key.length === 1) {
//     handleScanInput(e.key);
//   }
//   if (e.key === "Enter") {
//     e.preventDefault();
//     handleScanInput("\n");
//   }
// });
