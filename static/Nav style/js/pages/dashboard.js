// /static/js/pages/dashboard.js
import { $, jfetch, toast } from "../api.js";

let disposers = [];
function on(el, ev, fn) {
  if (!el) return;
  el.addEventListener(ev, fn);
  disposers.push(() => el.removeEventListener(ev, fn));
}

// ---------- actions ----------
async function loadLotsSummary() {
  const holder = $("dashLots");
  if (!holder) return;
  try {
    const rows = await jfetch("/lots");
    const total = rows.length;
    const inproc = rows.filter(x => x.status === "in_process").length;
    const completed = rows.filter(x => x.status === "completed").length;
    const hold = rows.filter(x => x.status === "hold").length;

    holder.innerHTML = `
      <div class="grid">
        <div class="col-3"><div class="card"><b>Total</b><div style="font-size:22px">${total}</div></div></div>
        <div class="col-3"><div class="card"><b>In Process</b><div style="font-size:22px">${inproc}</div></div></div>
        <div class="col-3"><div class="card"><b>Completed</b><div style="font-size:22px">${completed}</div></div></div>
        <div class="col-3"><div class="card"><b>Hold</b><div style="font-size:22px">${hold}</div></div></div>
      </div>`;
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลดสรุป Lots ไม่สำเร็จ: " + e.message, false);
  }
}

async function loadSubconSummary() {
  const holder = $("dashSubcon");
  if (!holder) return;
  try {
    const orders = await jfetch("/subcon/orders");
    const open = orders.filter(o => o.status !== "closed").length;
    holder.innerHTML = `
      <div class="grid">
        <div class="col-6"><div class="card"><b>Orders</b><div style="font-size:22px">${orders.length}</div></div></div>
        <div class="col-6"><div class="card"><b>Open</b><div style="font-size:22px">${open}</div></div></div>
      </div>`;
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลดสรุป Subcon ไม่สำเร็จ: " + e.message, false);
  }
}

// ---------- life-cycle ----------
export async function mount() {
  on($("btnDashLots"), "click", loadLotsSummary);
  on($("btnDashSubcon"), "click", loadSubconSummary);

  // Quick tiles -> กดแล้วให้ไปหน้าเป้าหมาย โดย simulate click ที่ sideNav
  on($("quickTiles"), "click", (e) => {
    const tile = e.target.closest(".tile[data-nav]");
    if (!tile) return;
    e.preventDefault();
    const page = tile.getAttribute("data-nav");
    const link = document.querySelector(`#sideNav a[data-page="${page}"]`);
    if (link) link.click();
    else toast("ไม่พบหน้า: " + page, false);
  });

  await Promise.all([loadLotsSummary(), loadSubconSummary()]);
}

export function unmount() {
  disposers.forEach(off => off());
  disposers = [];
}
