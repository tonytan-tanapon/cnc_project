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
}

function hideKeypad() {
  document.querySelector("#keypad").style.display = "none";
  activeTarget = null;
  activeType = null;
}

// ===== DOM READY =====
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
      if (val === "0") val = "";
      activeTarget.textContent = val + btn.textContent.trim();
    });
  });

  // ปุ่ม Clear
  document.querySelector(".key-wide").addEventListener("click", () => {
    if (activeTarget) activeTarget.textContent = "0";
  });

  // ✅ ปุ่ม OK → PATCH DB
  document.querySelector(".ok-btn").addEventListener("click", async () => {
    if (!activeTarget || !activeType) {
      console.warn("⚠️ Missing activeTarget or activeType");
      return;
    }

    // ✅ อ่านค่าก่อนปิด keypad (ป้องกัน null)
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
      const travelerData = await jfetch(
        `/api/v1/travelers/by_no/${travelerNo}`
      );
      const stepId = travelerData?.active_step?.id;
      if (!stepId) {
        toast("No active step found", false);
        return;
      }

      const resp = await jfetch(`/api/v1/travelers/traveler_steps/${stepId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      toast(`💾 Updated ${activeType} = ${val} ${currentUOM}`);
      await loadOperation(); // โหลดข้อมูลใหม่หลังบันทึก
    } catch (err) {
      console.error("❌ PATCH error", err);
      toast(err.message || "Auto-update failed", false);
    }
  });

  // ปุ่ม Close keypad
  document.querySelector(".close-btn").addEventListener("click", hideKeypad);

  // ===== CONFIRM BUTTON =====
  document.querySelector("#btnConfirm").addEventListener("click", async () => {
    const payload = {
      qty_receive: +document.querySelector("#receiveQty").textContent || 0,
      qty_accept: +document.querySelector("#acceptQty").textContent || 0,
      qty_reject: +document.querySelector("#rejectQty").textContent || 0,
      remark: document.querySelector("#remarkInput").value.trim(),
    };

    try {
      // ใช้ endpoint ที่มี logic: set passed + finished_at + advance next step
      const resp = await jfetch(
        `/api/v1/travelers/by_no/${travelerNo}/record`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
      console.log("✅ CONFIRM record:", resp);

      toast("✅ Step marked as PASSED");
      await loadOperation(); // โหลด step ปัจจุบันใหม่ (จะเป็น step ถัดไปถ้ามี)
    } catch (err) {
      console.error("❌ CONFIRM error", err);
      toast(err.message || "Save failed", false);
    }
  });

  loadOperation(); // โหลดครั้งแรก
});
// ===== AUTO-SAVE WHEN PRESS ENTER IN REMARKS =====
document
  .querySelector("#remarkInput")
  .addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // ป้องกันขึ้นบรรทัดใหม่
      const remark = e.target.value.trim();

      try {
        const travelerData = await jfetch(
          `/api/v1/travelers/by_no/${travelerNo}`
        );
        const stepId = travelerData?.active_step?.id;
        if (!stepId) {
          toast("No active step found", false);
          return;
        }

        const payload = { remark };

        const resp = await jfetch(
          `/api/v1/travelers/traveler_steps/${stepId}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );
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

    if (!data) return;

    let step = data.active_step || {};
    // รวมข้อมูลจาก steps array เพื่อให้ qty_* ถูกต้อง
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

    // ✅ แสดงค่าที่บันทึกไว้จริงจาก DB
    document.querySelector("#receiveQty").textContent = step.qty_receive ?? 0;
    document.querySelector("#acceptQty").textContent = step.qty_accept ?? 0;
    document.querySelector("#rejectQty").textContent = step.qty_reject ?? 0;
    document.querySelector("#remarkInput").value =
      step.remark || step.step_note || "";

    if (!data.active_step) {
      // 🎉 Traveler เสร็จหมดแล้ว
      const wrap = document.querySelector(".wrap");

      // ล้างเนื้อหาในหน้า
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
    </div>
  `;

      toast("🎉 Traveler is fully completed!", true);
      return; // จบ function
    }
  } catch (err) {
    console.error("❌ loadOperation failed", err);
    toast(err.message || "Load failed", false);
  }
}
