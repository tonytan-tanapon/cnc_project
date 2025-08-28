// /static/js/page-lots.js
// ใช้ jfetch จาก /static/js/api.js โดยตรง (ตัวนั้นจัดการ API Base ให้แล้ว)
// Autocomplete Part + โหลด revision ปัจจุบัน + Autocomplete PO ด้วย po_number
// POST /lots พร้อม part_id / part_revision_id / po_id ที่ถูกต้อง

import { jfetch, renderTable, toast, initTopbar } from '/static/js/api.js';

const gid = (id) => document.getElementById(id);
const on  = (el, ev, fn) => el && el.addEventListener(ev, fn);

// ---------- ใช้ /pos ตาม routers/pos.py ----------
const PO_PATH = '/pos';

// ---------- Utils ----------
const esc = (s) => String(s ?? '')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#39;');

const debounce = (fn, ms=200) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms);} };

// ---------- สร้าง overlay dropdown ----------
function makeOverlay() {
  const el = document.createElement('div');
  el.className = 'ac-dropdown';
  el.style.cssText =
    'position:fixed;z-index:9999;background:#fff;border:1px solid #e5e7eb;border-radius:12px;' +
    'box-shadow:0 10px 30px rgba(0,0,0,.15);max-height:300px;overflow:auto;display:none;';
  document.body.appendChild(el);
  return el;
}
function placeOverlay(box, anchor) {
  const r = anchor.getBoundingClientRect();
  box.style.left  = `${r.left}px`;
  box.style.top   = `${r.bottom + 6}px`;
  box.style.width = `${r.width}px`;
}

// ------------------------------------------------------------------
// Autocomplete สำหรับ Part (+ โหลด/ผูก Revision)
// ------------------------------------------------------------------
const partAC = {
  anchor: null,
  box: null,
  items: [],
  active: -1,
  selectedId: null,        // part_id
  selectedRevId: null,     // part_revision_id
  lastChosenCode: '',

  ensureBox(){
    if (this.box) return;
    this.box = makeOverlay();

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

    this.box.addEventListener('click', (e)=>{
      const it = e.target.closest('.ac-item');
      if (it) this.choose(Number(it.dataset.idx));
    });
  },

  position(){ if (this.anchor && this.box) placeOverlay(this.box, this.anchor); },

  async search(q){
    if (!q){ this.render([]); return; }
    try{
      const rows = await jfetch(`/parts?q=${encodeURIComponent(q)}`); // [{id, part_no, name}]
      this.render(rows || []);
    }catch{ this.render([]); }
  },

  render(list){
    this.ensureBox();
    this.items = Array.isArray(list) ? list.slice(0, 20) : [];
    this.active = -1;
    this.box.innerHTML = this.items.length
      ? this.items.map((p,i)=>`
          <div class="ac-item" data-idx="${i}">
            <span class="badge">${esc(p.part_no||'')}</span>
            <div class="ac-text">
              <div class="ac-name">${esc(p.name||'')}</div>
              <div class="ac-meta">#${p.id}</div>
            </div>
          </div>`).join('')
      : `<div class="ac-empty">No results</div>`;
    this.position();
    this.box.style.display = 'block';
  },

  async choose(idx){
    const r = this.items[idx]; if (!r) return;
    this.selectedId = r.id;
    this.lastChosenCode = r.part_no || '';
    this.anchor.value = r.part_no || '';
    this.anchor.dataset.id = String(r.id);
    this.hide();
    await loadRevisionsForPart(r.id);   // เติม select และตั้ง selectedRevId
  },

  changedByTyping(){
    if ((this.anchor.value || '').toUpperCase() !== (this.lastChosenCode || '').toUpperCase()){
      this.selectedId = null;
      this.selectedRevId = null;
      this.anchor.dataset.id = '';
      const sel = gid('l_rev_id'); if (sel) sel.innerHTML = '';
    }
  },

  hide(){ if (this.box) this.box.style.display = 'none'; },

  highlight(move){
    if (!this.items.length) return;
    this.active = (this.active + move + this.items.length) % this.items.length;
    [...this.box.querySelectorAll('.ac-item')]
      .forEach((n,i)=> n.classList.toggle('active', i===this.active));
    const el = this.box.querySelector(`.ac-item[data-idx="${this.active}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
};

function initPartAutocomplete(){
  const input = gid('l_part'); if (!input) return;
  partAC.anchor = input; partAC.ensureBox(); partAC.position();

  const doSearch = debounce(()=>{
    partAC.changedByTyping();
    const q = input.value.trim();
    if (!q) { partAC.render([]); return; }
    partAC.search(q);
  }, 180);

  on(input,'input', doSearch);
  on(input,'focus', ()=>{ if (input.value.trim()) doSearch(); partAC.position(); });
  on(input,'blur',  ()=> setTimeout(()=> partAC.hide(), 120));
  on(window,'resize',()=> partAC.position());
  on(window,'scroll',()=> partAC.position());

  on(input,'keydown', (e)=>{
    if (partAC.box.style.display !== 'block') return;
    if (e.key==='ArrowDown'){ e.preventDefault(); partAC.highlight(+1); }
    if (e.key==='ArrowUp'){   e.preventDefault(); partAC.highlight(-1); }
    if (e.key==='Enter'){     if (partAC.active>=0){ e.preventDefault(); partAC.choose(partAC.active); } }
    if (e.key==='Escape') partAC.hide();
  });
}

// โหลด Revisions → เติม select#l_rev_id และตั้ง selectedRevId
async function loadRevisionsForPart(partId){
  const sel = gid('l_rev_id'); if (sel) sel.innerHTML = '';
  try{
    const revs = await jfetch(`/part-revisions?part_id=${partId}`);
    if (!Array.isArray(revs) || !revs.length){ partAC.selectedRevId = null; return; }

    if (sel) {
      sel.innerHTML = revs.map(r =>
        `<option value="${r.id}" ${r.is_current ? 'selected' : ''}>${esc(r.rev || '')}${r.is_current ? ' (current)' : ''}</option>`
      ).join('');
    }
    const current = revs.find(r => r.is_current) || revs[0];
    partAC.selectedRevId = current?.id ?? null;
  }catch{
    partAC.selectedRevId = null;
  }
}

// ถ้าไม่ได้คลิกเลือก → resolve จากข้อความที่พิมพ์ (พร้อมเติม select)
async function resolveFromTyped(){
  const input = gid('l_part');
  const code = (input?.value || '').trim();
  if (!code) return { part_id:null, part_revision_id:null };

  try{
    const rows = await jfetch(`/parts?q=${encodeURIComponent(code)}`);
    const pick = rows.find(p => (p.part_no||'').toUpperCase() === code.toUpperCase())
             ||  rows.find(p => (p.name||'').toLowerCase() === code.toLowerCase())
             ||  (rows.length === 1 ? rows[0] : null);
    if (!pick) return { part_id:null, part_revision_id:null };

    input.value = pick.part_no || input.value;
    input.dataset.id = String(pick.id);
    await loadRevisionsForPart(pick.id);

    return { part_id: pick.id, part_revision_id: partAC.selectedRevId };
  }catch{
    return { part_id:null, part_revision_id:null };
  }
}

// ------------------------------------------------------------------
// Autocomplete สำหรับ PO (ค้นด้วย po_number; endpoint /pos ไม่มีพารามิเตอร์ q)
// โหลดทั้งหมดครั้งเดียวแล้วกรองฝั่งหน้าเว็บ
// ------------------------------------------------------------------
const poAC = {
  anchor: null,
  box: null,
  items: [],
  active: -1,
  selectedId: null,   // po_id จริง
  displayText: '',
  _all: null,         // cache รายการทั้งหมด

  ensureBox(){
    if (this.box) return;
    this.box = makeOverlay();
    this.box.addEventListener('click', (e)=>{
      const it = e.target.closest('.ac-item');
      if (it) this.choose(Number(it.dataset.idx));
    });
  },

  position(){ if (this.anchor) placeOverlay(this.box, this.anchor); },

  async ensureAll(){
    if (Array.isArray(this._all)) return this._all;
    try {
      const rows = await jfetch(`${PO_PATH}`); // GET /pos → ทั้งหมด
      this._all = Array.isArray(rows) ? rows : [];
    } catch {
      this._all = [];
    }
    return this._all;
  },

  async search(q){
    const qU = (q||'').toUpperCase();
    if (!qU){ this.render([]); return; }
    const all = await this.ensureAll();
    // กรองด้วย po_number (และ description เผื่อสะดวก)
    const list = all.filter(p =>
      (p.po_number || '').toUpperCase().includes(qU) ||
      (p.description || '').toUpperCase().includes(qU)
    ).slice(0, 20);
    this.render(list);
  },

  render(list){
    this.ensureBox();
    this.items = Array.isArray(list) ? list : [];
    this.active = -1;
    this.box.innerHTML = this.items.length
      ? this.items.map((p,i)=>`
          <div class="ac-item" data-idx="${i}">
            <span class="badge">${esc(p.po_number || String(p.id))}</span>
            <div class="ac-text">
              <div class="ac-name">${esc(p.description || '')}</div>
              <div class="ac-meta">#${p.id}</div>
            </div>
          </div>`).join('')
      : `<div class="ac-empty">No results</div>`;
    this.position();
    this.box.style.display = 'block';
  },

  choose(idx){
    const r = this.items[idx]; if (!r) return;
    this.selectedId = r.id;
    this.displayText = r.po_number || String(r.id);
    this.anchor.value = this.displayText;
    this.anchor.dataset.id = String(r.id);
    this.hide();
  },

  hide(){ if (this.box) this.box.style.display='none'; },

  highlight(move){
    if (!this.items.length) return;
    this.active = (this.active + move + this.items.length) % this.items.length;
    [...this.box.querySelectorAll('.ac-item')]
      .forEach((el,i)=> el.classList.toggle('active', i===this.active));
    const el = this.box.querySelector(`.ac-item[data-idx="${this.active}"]`);
    if (el) el.scrollIntoView({ block:'nearest' });
  }
};

function initPoAutocomplete(){
  const input = gid('l_poid'); if (!input) return;
  poAC.anchor = input; poAC.ensureBox(); poAC.position();

  const doSearch = debounce(async ()=>{
    const q = input.value.trim();
    if (!q) { poAC.render([]); return; }
    await poAC.search(q);
  }, 180);

  on(input, 'input', doSearch);
  on(input, 'focus', ()=>{ if (input.value.trim()) poAC.search(input.value.trim()); poAC.position(); });
  on(input, 'blur',  ()=> setTimeout(()=> poAC.hide(), 120));
  on(window,'resize',()=> poAC.position());
  on(window,'scroll',()=> poAC.position());

  on(input, 'keydown', (e)=>{
    if (poAC.box.style.display !== 'block') return;
    if (e.key==='ArrowDown'){ e.preventDefault(); poAC.highlight(+1); }
    if (e.key==='ArrowUp'){   e.preventDefault(); poAC.highlight(-1); }
    if (e.key==='Enter'){     if (poAC.active>=0){ e.preventDefault(); poAC.choose(poAC.active); } }
    if (e.key==='Escape') poAC.hide();
  });
}

// แปลงค่าที่พิมพ์เป็น po_id:
// - ถ้าเป็นตัวเลข: ใช้เป็น id ได้เลย
// - ถ้าเป็นรหัส (เช่น "PO-2025-0001"): หา exact match ที่ po_number เท่ากัน (case-insensitive)
async function resolvePoIdFromTyped(){
  const t = (gid('l_poid')?.value || '').trim();
  if (!t) return null;
  const n = Number(t);
  if (Number.isFinite(n) && n > 0) return n;

  // หา exact po_number
  const all = await poAC.ensureAll();
  const hit = all.find(p => (p.po_number || '').toUpperCase() === t.toUpperCase());
  return hit ? hit.id : null;
}

// ------------------------------------------------------------------
// Lots ops
// ------------------------------------------------------------------
async function loadLots(){
  const holder = gid('l_table'); if (!holder) return;
  try{
    const rows = await jfetch('/lots');
    if (typeof renderTable === 'function') {
      renderTable(holder, rows);
    } else {
      // fallback ตารางง่าย ๆ
      const thead = `
        <thead><tr>
          <th>ID</th><th>Lot No</th><th>Part ID</th><th>Rev ID</th><th>PO</th><th>Planned</th><th>Status</th>
        </tr></thead>`;
      const tbody = rows.map(r => `
        <tr>
          <td>${r.id}</td>
          <td>${esc(r.lot_no || '')}</td>
          <td>${r.part_id ?? ''}</td>
          <td>${r.part_revision_id ?? ''}</td>
          <td>${r.po_id ?? ''}</td>
          <td>${r.planned_qty ?? 0}</td>
          <td>${esc(r.status || '')}</td>
        </tr>`).join('');
      holder.innerHTML = `<table>${thead}<tbody>${tbody}</tbody></table>`;
    }
  }catch(e){
    holder.innerHTML = `<div class="hint">โหลดรายการไม่ได้: ${esc(e.message||'error')}</div>`;
  }
}

async function createLot(){
  const lot_no = (gid('l_no')?.value || 'AUTO').trim().toUpperCase();

  // part_id + revision
  let part_id = partAC.selectedId || Number(partAC.anchor?.dataset?.id || 0) || null;
  let part_revision_id = partAC.selectedRevId || Number(gid('l_rev_id')?.value || 0) || null;

  if (!part_id || !part_revision_id){
    const r = await resolveFromTyped();
    part_id = part_id || r.part_id;
    part_revision_id = part_revision_id || r.part_revision_id;
  }

  if (!part_id){ toast('โปรดเลือก/ระบุ Part ให้ชัดเจน'); gid('l_part')?.focus(); return; }
  if (!part_revision_id){ toast('Part นี้ยังไม่มี Revision หรือยังไม่ได้เลือก'); return; }

  // po_id จาก autocomplete หรือที่พิมพ์เป็นตัวเลข/po_number
  let po_id = poAC.selectedId || Number(poAC.anchor?.dataset?.id || 0) || null;
  if (!po_id) po_id = await resolvePoIdFromTyped();

  const planned_qty = Number(gid('l_qty')?.value || 0) || 0;
  const status = gid('l_status')?.value || 'in_process';

  const payload = { lot_no, part_id, part_revision_id, po_id, planned_qty, status };

  try{
    await jfetch('/lots', { method:'POST', body: JSON.stringify(payload) });
    toast('Lot created');
    // reset ฟอร์ม
    ['l_no','l_part','l_poid','l_qty'].forEach(id=>{ const el = gid(id); if (el) el.value=''; });
    const sel = gid('l_rev_id'); if (sel) sel.innerHTML = '';
    if (partAC.anchor) { partAC.anchor.dataset.id = ''; }
    if (poAC.anchor)   { poAC.anchor.dataset.id   = ''; }
    partAC.selectedId = null; partAC.selectedRevId = null; partAC.lastChosenCode = '';
    poAC.selectedId = null;    poAC.displayText = '';
    await loadLots();
  }catch(e){
    toast(e.message || 'Create failed');
  }
}

// ------------------------------------------------------------------
// Boot
// ------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', ()=>{
  initTopbar?.();              // ให้ jfetch ตัวกลางรู้ base จากช่อง #apiBase

  initPartAutocomplete();
  initPoAutocomplete();

  // เปลี่ยน revision ด้วยตัวเองได้
  on(gid('l_rev_id'),'change', ()=>{
    const v = Number(gid('l_rev_id')?.value || 0);
    partAC.selectedRevId = v > 0 ? v : null;
  });

  on(gid('l_reload'), 'click', loadLots);
  on(gid('l_create'), 'click', createLot);

  // Enter ที่ช่อง Part
  on(gid('l_part'), 'keydown', (e)=>{
    if (e.key === 'Enter'){
      if (partAC.box?.style.display === 'block' && partAC.active >= 0){
        e.preventDefault();
        partAC.choose(partAC.active);
      }else{
        createLot();
      }
    }
  });
  // Enter ที่ช่อง PO
  on(gid('l_poid'), 'keydown', async (e)=>{
    if (e.key === 'Enter'){
      if (poAC.box?.style.display === 'block' && poAC.active >= 0){
        e.preventDefault();
        poAC.choose(poAC.active);
      }else{
        // เผื่อพิมพ์ po_number ตรง ๆ ให้ลอง resolve ก่อนยิง create
        await createLot();
      }
    }
  });

  // Ping ใช้ base เดียวกัน (jfetch จะดูแลให้)
  on(gid('btnPing'), 'click', ()=>{
    jfetch('/health').then(()=>toast('API OK')).catch(()=>toast('API ไม่ตอบ'));
  });

  loadLots();
});
