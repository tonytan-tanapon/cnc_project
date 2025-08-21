// /static/js/main.js
import { Router } from "/static/js/router.js";
import { getAPIBase, setAPIBase, jfetch, showToast } from "/static/js/api.js";

// ช่วยหยิบ element แบบสั้น ๆ
const $ = (id) => document.getElementById(id);

// ---------- ลงทะเบียนเพจ (lazy import) ----------
Router.registerPage("dash",       () => import("/static/js/pages/dashboard.js"));
Router.registerPage("customers",  () => import("/static/js/pages/customers.js"));
Router.registerPage("pos",        () => import("/static/js/pages/pos.js"));
Router.registerPage("materials",  () => import("/static/js/pages/materials.js"));
Router.registerPage("lots",       () => import("/static/js/pages/lots.js"));
Router.registerPage("employees",  () => import("/static/js/pages/employees.js"));
Router.registerPage("trav",       () => import("/static/js/pages/travelers.js"));
Router.registerPage("subcon",     () => import("/static/js/pages/subcon.js"));
Router.registerPage("suppliers",  () => import("/static/js/pages/suppliers.js"));
Router.registerPage("reports",    () => import("/static/js/pages/reports.js"));
Router.registerPage("customer-detail",    () => import("/static/js/pages/customer_detail.js"));


// ---------- Bootstrap UI ----------
function bindTopbar() {
  // sync ค่า API base กับ input
  const baseInput = $("apiBase");
  if (baseInput) {
    baseInput.value = getAPIBase();
    baseInput.addEventListener("change", () => {
      const v = (baseInput.value || "").trim() || "/api/v1";
      setAPIBase(v);
      showToast(`API base = ${v}`);
    });
    baseInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        baseInput.dispatchEvent(new Event("change"));
        e.preventDefault();
      }
    });
  }

  // ปุ่ม Ping: ยิง GET เบา ๆ ไป endpoint ที่ไม่เขียนทับข้อมูล
  const btnPing = $("btnPing");
  if (btnPing) {
    btnPing.addEventListener("click", async () => {
      try {
        // ใช้ /customers (GET) เป็น health-check ง่าย ๆ
        await jfetch("/customers");
        showToast("API OK ✅");
      } catch (err) {
        showToast(`Ping failed: ${err.message}`, false);
      }
    });
  }

  // ช่องค้นหา (เดโม่เล็ก ๆ)
  const globalSearch = $("globalSearch");
  if (globalSearch) {
    globalSearch.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const q = globalSearch.value.trim();
      if (!q) return;

      // heuristic ง่าย ๆ: มีคำบางอย่างให้เด้งหน้า
      if (/^po[-_]/i.test(q)) Router.showPage("pos");
      else if (/^lot[-_]/i.test(q)) Router.showPage("lots");
      else if (/^c(ust)?/i.test(q)) Router.showPage("customers");
      else Router.showPage("dash");
    });
  }
}

// ---------- เริ่มทำงาน ----------
document.addEventListener("DOMContentLoaded", () => {
  bindTopbar();
  // เริ่ม router (อ่านจาก hash ถ้ามี; ไม่งั้นใช้ "dash")
  Router.initRouter("dash");

  // prefetch เพจยอดนิยมเบา ๆ
  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => {
      import("/static/js/pages/customers.js").catch(()=>{});
      import("/static/js/pages/materials.js").catch(()=>{});
      import("/static/js/pages/lots.js").catch(()=>{});
    });
  }
});
