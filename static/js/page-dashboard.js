// /static/js/page-dashboard.js
import { jfetch, toast } from "./api.js";
const $ = (id) => document.getElementById(id);

async function loadLotsSummary() {
  const holder = $("dashLots");
  if (!holder) return;
  try {
    const rows = await jfetch("/lots");
    const list = Array.isArray(rows) ? rows : [];
    const total = list.length;
    const inproc = list.filter((x) => x.status === "in_process").length;
    const completed = list.filter((x) => x.status === "completed").length;
    const hold = list.filter((x) => x.status === "hold").length;

    holder.innerHTML = `
      <div class="grid">
        <div class="col-3"><div class="card"><b>Total</b><div style="font-size:22px">${total}</div></div></div>
        <div class="col-3"><div class="card"><b>In Process</b><div style="font-size:22px">${inproc}</div></div></div>
        <div class="col-3"><div class="card"><b>Completed</b><div style="font-size:22px">${completed}</div></div></div>
        <div class="col-3"><div class="card"><b>Hold</b><div style="font-size:22px">${hold}</div></div></div>
      </div>
    `;
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด Lots summary ไม่สำเร็จ: " + e.message, false);
  }
}

async function loadSubconSummary() {
  const holder = $("dashSubcon");
  if (!holder) return;
  try {
    const rows = await jfetch("/subcon/orders");
    const list = Array.isArray(rows) ? rows : [];
    const open = list.filter((o) => o.status !== "closed").length;

    holder.innerHTML = `
      <div class="grid">
        <div class="col-6"><div class="card"><b>Orders</b><div style="font-size:22px">${list.length}</div></div></div>
        <div class="col-6"><div class="card"><b>Open</b><div style="font-size:22px">${open}</div></div></div>
      </div>
    `;
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลด Subcon summary ไม่สำเร็จ: " + e.message, false);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btnLots = $("btnDashLots");
  const btnSub = $("btnDashSubcon");

  if (btnLots) btnLots.addEventListener("click", loadLotsSummary);
  if (btnSub) btnSub.addEventListener("click", loadSubconSummary);

  // โหลดครั้งแรก
  loadLotsSummary();
  loadSubconSummary();
});
