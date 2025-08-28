// /static/js/page-travelers.js
import { $, jfetch, toast, initTopbar } from './api.js';

const DETAIL_PAGE = '/static/traveler-detail.html';

const escapeHtml = (s) =>
  String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

function tUrl(id){ return `${DETAIL_PAGE}?id=${encodeURIComponent(id)}`; }

function renderTravelerTable(holder, rows){
  if (!rows || rows.length === 0){
    holder.innerHTML = '<div class="empty">No travelers</div>';
    return;
  }
  const body = rows.map(r => `
    <tr data-id="${escapeHtml(r.id)}" class="click-row" title="Open traveler">
      <td><a href="${tUrl(r.id)}">#${escapeHtml(r.id)}</a></td>
      <td>${escapeHtml(r.lot_id ?? '')}</td>
      <td>${escapeHtml(r.status ?? '')}</td>
      <td>${escapeHtml(r.created_by_id ?? '')}</td>
      <td>${escapeHtml(r.notes ?? '')}</td>
    </tr>
  `).join('');
  holder.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th style="width:100px">Traveler</th>
          <th style="width:120px">Lot</th>
          <th style="width:140px">Status</th>
          <th style="width:140px">Created by</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    <style>
      .click-row { cursor:pointer; }
      .click-row:hover { background: rgba(0,0,0,.03); }
    </style>
  `;
}

async function loadTravelers(){
  const holder = $('t_table');
  try{
    const q = $('t_q')?.value?.trim();
    const rows = await jfetch('/travelers' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    renderTravelerTable(holder, rows);
  }catch(e){
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
    toast('โหลด Travelers ไม่สำเร็จ: ' + e.message, false);
  }
}

// ---------- Lot Autocomplete ----------
const lotAC = {
  anchor: null,
  box: null,
  items: [],
  active: -1,
  selectedId: null,   // lot_id ที่เลือกจริง
  displayText: '',

  ensureBox(){
    if (this.box) return;
    // dropdown กล่องลอย
    this.box = document.createElement('div');
    this.box.className = 'ac-dropdown';
    this.box.style.cssText =
      'position:fixed;z-index:9999;background:#fff;border:1px solid #e5e7eb;border-radius:12px;'+
      'box-shadow:0 10px 30px rgba(0,0,0,.15);max-height:300px;overflow:auto;display:none;';
    document.body.appendChild(this.box);

    // style รายการ
    if (!document.getElementById('ac-style')) {
      const style = document.createElement('style');
      style.id = 'ac-style';
      style.textContent = `
        .ac-item{display:flex;gap:10px;padding:10px 12px;cursor:pointer}
        .ac-item.active,.ac-item:hover{background:#f8fafc}
        .ac-text{display:flex;flex-direction:column}
        .ac-name{font-weight:700}
        .ac-meta{font-size:12px;color:#64748b}
        .badge{display:inline-block;padding:.2rem .6rem;border:1px solid #e2e8f0;border-radius:999px;font-size:12px}
        .ac-empty{padding:10px 12px;color:#64748b}
      `;
      document.head.appendChild(style);
    }

    // click เลือก
    this.box.addEventListener('click', (e)=>{
      const it = e.target.closest('.ac-item');
      if (it) this.choose(Number(it.dataset.idx));
    });
  },

  place(){
    if (!this.anchor || !this.box) return;
    const r = this.anchor.getBoundingClientRect();
    this.box.style.left  = `${r.left}px`;
    this.box.style.top   = `${r.bottom + 6}px`;
    this.box.style.width = `${r.width}px`;
  },

  async search(q){
    if (!q){ this.render([]); return; }
    try {
      // ถ้า backend มี /lots?q= ใช้อันนี้; ถ้าไม่มีให้ดึงทั้งหมดแล้ว filter ฝั่งหน้า
      const rows = await jfetch(`/lots?q=${encodeURIComponent(q)}`).catch(()=>null);
      let list = Array.isArray(rows) ? rows : [];

      // เผื่อไม่มี ?q= ใน backend → fallback โหลดทั้งหมดแล้วกรอง
      if (!list.length) {
        const all = await jfetch('/lots').catch(()=>[]);
        const Q = q.toUpperCase();
        list = (all||[]).filter(x =>
          (x.lot_no||'').toUpperCase().includes(Q) ||
          String(x.id||'').includes(q)
        );
      }

      // จำกัดผลลัพธ์
      this.render(list.slice(0, 20));
    } catch {
      this.render([]);
    }
  },

  render(list){
    this.ensureBox();
    this.items = Array.isArray(list) ? list : [];
    this.active = -1;
    this.box.innerHTML = this.items.length
      ? this.items.map((r,i)=>`
          <div class="ac-item" data-idx="${i}">
            <span class="badge">${escapeHtml(r.lot_no || '')}</span>
            <div class="ac-text">
              <div class="ac-name">Lot #${escapeHtml(r.id)}</div>
              <div class="ac-meta">
                Part: ${escapeHtml(r.part_no || r.part_id || '')}
                ${r.po_id ? ` · PO: ${escapeHtml(r.po_id)}` : ''}
              </div>
            </div>
          </div>`).join('')
      : `<div class="ac-empty">No results</div>`;
    this.place();
    this.box.style.display = 'block';
  },

  choose(idx){
    const r = this.items[idx]; if (!r) return;
    this.selectedId = r.id;
    this.displayText = r.lot_no || String(r.id);
    this.anchor.value = this.displayText;
    this.anchor.dataset.id = String(r.id);
    this.hide();
  },

  hide(){ if (this.box) this.box.style.display = 'none'; },

  highlight(move){
    if (!this.items.length) return;
    this.active = (this.active + move + this.items.length) % this.items.length;
    [...this.box.querySelectorAll('.ac-item')]
      .forEach((el,i)=> el.classList.toggle('active', i===this.active));
    const el = this.box.querySelector(`.ac-item[data-idx="${this.active}"]`);
    if (el) el.scrollIntoView({ block:'nearest' });
  }
};

function initLotAutocomplete(){
  const input = $('t_lot'); if (!input) return;
  lotAC.anchor = input; lotAC.ensureBox(); lotAC.place();

  const debounce = (fn, ms=200)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms);} };
  const doSearch = debounce(()=> {
    const q = input.value.trim();
    if (!q) { lotAC.render([]); return; }
    lotAC.search(q);
  }, 180);

  input.addEventListener('input', doSearch);
  input.addEventListener('focus', ()=>{ if (input.value.trim()) doSearch(); lotAC.place(); });
  input.addEventListener('blur',  ()=> setTimeout(()=> lotAC.hide(), 120));
  window.addEventListener('resize', ()=> lotAC.place());
  window.addEventListener('scroll', ()=> lotAC.place());

  input.addEventListener('keydown', (e)=>{
    if (lotAC.box.style.display !== 'block') return;
    if (e.key==='ArrowDown'){ e.preventDefault(); lotAC.highlight(+1); }
    if (e.key==='ArrowUp'){   e.preventDefault(); lotAC.highlight(-1); }
    if (e.key==='Enter'){     if (lotAC.active>=0){ e.preventDefault(); lotAC.choose(lotAC.active); } }
    if (e.key==='Escape') lotAC.hide();
  });
}

// แปลงค่าที่พิมพ์เป็น lot_id (รองรับพิมพ์เลข id หรือ lot_no ตรง ๆ)
async function resolveLotIdFromTyped(){
  const t = ($('t_lot')?.value || '').trim();
  if (!t) return null;
  const n = Number(t);
  if (Number.isFinite(n) && n > 0) return n;

  // หา exact match จาก lot_no
  try{
    const all = await jfetch('/lots');
    const hit = (all||[]).find(x => (x.lot_no||'').toUpperCase() === t.toUpperCase());
    return hit ? hit.id : null;
  }catch{
    return null;
  }
}


async function createTraveler(){
  // พยายามเอา lot_id จาก autocomplete ก่อน
  let lot_id = Number(lotAC.selectedId || $('t_lot')?.dataset?.id || 0) || null;
  if (!lot_id) lot_id = await resolveLotIdFromTyped();   // fallback จากข้อความที่พิมพ์

  const created_by_id = numOrNull($('t_emp')?.value);
  const status = strOrNull($('t_status')?.value) || 'open';
  const notes = strOrNull($('t_notes')?.value);

  if (!lot_id){
    toast('กรุณาเลือก/ระบุ Lot ให้ชัดเจน', false);
    $('t_lot')?.focus();
    return;
  }

  const payload = { lot_id, created_by_id, status, notes };
  try{
    const t = await jfetch('/travelers', { method: 'POST', body: JSON.stringify(payload) });
    toast('Traveler created (id: ' + t.id + ')');
    // reset ฟอร์ม
    ['t_emp','t_notes'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    lotAC.selectedId = null;
    const lotInput = $('t_lot'); if (lotInput){ lotInput.value=''; lotInput.dataset.id=''; }
    await loadTravelers();
  }catch(e){
    toast('สร้าง Traveler ไม่สำเร็จ: ' + e.message, false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTopbar();
  initLotAutocomplete();  // ✅ เปิดใช้ autocomplete ให้ #t_lot
  $('t_create')?.addEventListener('click', createTraveler);
  $('t_reload')?.addEventListener('click', loadTravelers);
  $('t_q')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadTravelers(); });

  // คลิกพื้นที่ว่างของแถวก็เปิด detail
  $('t_table')?.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a) return;
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    location.href = tUrl(tr.dataset.id);
  });

  loadTravelers();
});
