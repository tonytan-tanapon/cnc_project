// /static/js/pages/customer_detail.js
import { $, jfetch, toast } from "../api.js";

let disposers = [];
function on(el, ev, fn){ if(!el) return; el.addEventListener(ev, fn); disposers.push(()=>el.removeEventListener(ev, fn)); }
const esc = (v) => v == null ? "" : String(v).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]));

function getIdFromHash(){
  const hash = location.hash || "";
  const q = hash.split("?")[1] || "";
  const sp = new URLSearchParams(q);
  return Number(sp.get("id") || 0);
}

async function loadDetail(){
  const id = getIdFromHash();
  if(!id){ $("cust_view").innerHTML = `<div class="hint">ไม่พบ id</div>`; return; }

  try{
    const c = await jfetch(`/customers/${id}`);
    $("cust_title").textContent = `Customer: ${c.code} — ${c.name}`;
    $("cust_view").innerHTML = `
      <div class="card">
        <div class="grid">
          <div class="col-6"><b>Code</b><div>${esc(c.code)}</div></div>
          <div class="col-6"><b>Name</b><div>${esc(c.name)}</div></div>
          <div class="col-6"><b>Contact</b><div>${esc(c.contact)}</div></div>
          <div class="col-6"><b>Email</b><div>${esc(c.email)}</div></div>
          <div class="col-6"><b>Phone</b><div>${esc(c.phone)}</div></div>
          <div class="col-12"><b>Address</b><div>${esc(c.address)}</div></div>
          <div class="col-6"><b>Created</b><div>${esc(c.created_at)}</div></div>
          <div class="col-6"><b>Updated</b><div>${esc(c.updated_at)}</div></div>
        </div>
      </div>
    `;
  }catch(e){
    $("cust_view").innerHTML = `<div class="hint">${e.message}</div>`;
    toast("โหลดรายละเอียดลูกค้าไม่สำเร็จ: "+e.message, false);
  }
}

export async function mount(){
  on($("cust_back"), "click", () => { location.hash = "#/customers"; });
  await loadDetail();

  // ถ้า hash เปลี่ยน (เช่นเปิด detail อีกคน) ให้รีโหลด
  on(window, "hashchange", () => {
    const page = (location.hash.split("?")[0] || "").replace(/^#\/?/, "");
    if(page === "customer-detail") loadDetail();
  });
}

export function unmount(){
  disposers.forEach(fn=>fn());
  disposers = [];
}
