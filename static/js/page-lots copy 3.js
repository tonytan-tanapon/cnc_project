// /static/js/page-lots.js
// Uses jfetch/toast/initTopbar from /static/js/api.js
// Features: Part & PO autocomplete, auto-load current revision, create Lot,
// table shows Lot No (link), Part No (link), PO No (link), Travelers (links + quick create)

import { jfetch, toast, initTopbar } from '/static/js/api.js';

const gid = (id) => document.getElementById(id);
const on  = (el, ev, fn) => el && el.addEventListener(ev, fn);

// ---------- Paths ----------
const PO_PATH = '/pos';

// ---------- URL helpers ----------
const lotDetailUrl       = (id) => `/static/lot-detail.html?id=${encodeURIComponent(id)}`;
const partDetailUrl      = (id) => `/static/part-detail.html?id=${encodeURIComponent(id)}`;
const poDetailUrl        = (id) => `/static/pos-detail.html?id=${encodeURIComponent(id)}`;
const travelerDetailUrl  = (id) => `/static/traveler-detail.html?id=${encodeURIComponent(id)}`;

// ---------- Utils ----------
const esc = (s) => String(s ?? '')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#39;');

const debounce = (fn, ms=200) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms);} };

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  const y  = d.getFullYear();
  const m  = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${y}-${m}-${dd} ${hh}:${mm}`;
};

// ---------- Overlay dropdown ----------
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
// Part Autocomplete (+ load/link Revisions)
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
    await loadRevisionsForPart(r.id);   // fill select + set selectedRevId
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
    if (!partAC.box || partAC.box.style.display !== 'block') return;
    if (e.key==='ArrowDown'){ e.preventDefault(); partAC.highlight(+1); }
    if (e.key==='ArrowUp'){   e.preventDefault(); partAC.highlight(-1); }
    if (e.key==='Enter'){     if (partAC.active>=0){ e.preventDefault(); partAC.choose(partAC.active); } }
    if (e.key==='Escape') partAC.hide();
  });
}

// Load revisions for selected part → fill #l_rev_id and set partAC.selectedRevId
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

// Resolve typed part (if user didn't click a suggestion)
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
// PO Autocomplete (client-side filter after one fetch of /pos)
// ------------------------------------------------------------------
const poAC = {
  anchor: null,
  box: null,
  items: [],
  active: -1,
  selectedId: null,   // po_id
  displayText: '',
  _all: null,         // cache

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
      const rows = await jfetch(`${PO_PATH}`); // GET /pos → all
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
    if (!poAC.box || poAC.box.style.display !== 'block') return;
    if (e.key==='ArrowDown'){ e.preventDefault(); poAC.highlight(+1); }
    if (e.key==='ArrowUp'){   e.preventDefault(); poAC.highlight(-1); }
    if (e.key==='Enter'){     if (poAC.active>=0){ e.preventDefault(); poAC.choose(poAC.active); } }
    if (e.key==='Escape') poAC.hide();
  });
}

// Resolve typed value to po_id
async function resolvePoIdFromTyped(){
  const t = (gid('l_poid')?.value || '').trim();
  if (!t) return null;
  const n = Number(t);
  if (Number.isFinite(n) && n > 0) return n;

  const all = await poAC.ensureAll();
  const hit = all.find(p => (p.po_number || '').toUpperCase() === t.toUpperCase());
  return hit ? hit.id : null;
}

// ------------------------------------------------------------------
// Lookup helpers for table
// ------------------------------------------------------------------
async function buildLookups(rows){
  const partIds = [...new Set(rows.map(r => r.part_id).filter(Boolean))];
  const poIds   = [...new Set(rows.map(r => r.po_id).filter(Boolean))];

  const partMap = {};
  const poMap = {};

  await Promise.all([
    Promise.all(partIds.map(id =>
      jfetch(`/parts/${id}`).then(p => { partMap[id] = p; }).catch(()=>{})
    )),
    Promise.all(poIds.map(id =>
      jfetch(`${PO_PATH}/${id}`).then(po => { poMap[id] = po; }).catch(()=>{})
    ))
  ]);

  return { partMap, poMap };
}

// ------------------------------------------------------------------
// Load Lots → build table (Lot link + Travelers links + +Traveler)
// ------------------------------------------------------------------
async function loadLots(){
  const holder = gid('l_table'); if (!holder) return;
  try{
    const rows = await jfetch('/lots'); // [{id, lot_no, part_id, part_revision_id, po_id, planned_qty, started_at, finished_at, status, traveler_ids?}]
    const { partMap, poMap } = await buildLookups(rows);

    const thead = `
      <thead><tr>
        <th>Lot No</th>
        <th>Part Number</th>
        <th>PO Number</th>
        <th>Travelers</th>
        <th>Planned Qty</th>
        <th>Started At</th>
        <th>Finished At</th>
        <th>Status</th>
      </tr></thead>`;

    const tbody = rows.map(r => {
      const partNo = partMap[r.part_id]?.part_no || '';
      const poNo   = poMap[r.po_id]?.po_number || '';

      const lotNoCell  = r.id   ? `<a href="${lotDetailUrl(r.id)}">${esc(r.lot_no || '')}</a>` : esc(r.lot_no || '');
      const partCell   = r.part_id ? `<a href="${partDetailUrl(r.part_id)}">${esc(partNo)}</a>` : esc(partNo);
      const poCell     = r.po_id   ? `<a href="${poDetailUrl(r.po_id)}">${esc(poNo)}</a>`       : esc(poNo);

      const travelersHtml = (r.traveler_ids && r.traveler_ids.length)
        ? r.traveler_ids.map(id => `<a href="${travelerDetailUrl(id)}">#${id}</a>`).join(', ')
        : '<span class="muted">—</span>';

      const createTravBtn = r.id
        ? `<button class="btn-small" data-action="create-trav" data-lot="${r.id}">+ Traveler</button>`
        : '';

      return `
        <tr>
          <td>${lotNoCell}</td>
          <td>${partCell}</td>
          <td>${poCell}</td>
          <td>${travelersHtml} ${createTravBtn}</td>
          <td>${r.planned_qty ?? 0}</td>
          <td>${esc(fmtDate(r.started_at))}</td>
          <td>${esc(fmtDate(r.finished_at))}</td>
          <td>${esc(r.status || '')}</td>
        </tr>`;
    }).join('');

    holder.innerHTML = `<table>${thead}<tbody>${tbody}</tbody></table>`;
  }catch(e){
    holder.innerHTML = `<div class="hint">โหลดรายการไม่ได้: ${esc(e.message||'error')}</div>`;
  }
}

// ------------------------------------------------------------------
// Create Lot
// ------------------------------------------------------------------
async function createLot(){
  const lot_no = (gid('l_no')?.value || 'AUTO').trim().toUpperCase();

  // part + rev
  let part_id = partAC.selectedId || Number(partAC.anchor?.dataset?.id || 0) || null;
  let part_revision_id = partAC.selectedRevId || Number(gid('l_rev_id')?.value || 0) || null;

  if (!part_id || !part_revision_id){
    const r = await resolveFromTyped();
    part_id = part_id || r.part_id;
    part_revision_id = part_revision_id || r.part_revision_id;
  }

  if (!part_id){ toast('โปรดเลือก/ระบุ Part ให้ชัดเจน'); gid('l_part')?.focus(); return; }
  if (!part_revision_id){ toast('Part นี้ยังไม่มี Revision หรือยังไม่ได้เลือก'); return; }

  // po_id from AC or resolve
  let po_id = poAC.selectedId || Number(poAC.anchor?.dataset?.id || 0) || null;
  if (!po_id) po_id = await resolvePoIdFromTyped();

  const planned_qty = Number(gid('l_qty')?.value || 0) || 0;
  const status = gid('l_status')?.value || 'in_process';

  const payload = { lot_no, part_id, part_revision_id, po_id, planned_qty, status };

  try{
    await jfetch('/lots', { method:'POST', body: JSON.stringify(payload) });
    toast('Lot created');

    // reset form
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
  // tiny styles (button + muted), injected once
  if (!document.getElementById('page-lots-style')){
    const st = document.createElement('style');
    st.id = 'page-lots-style';
    st.textContent = `
      .btn-small{padding:4px 8px;font-size:12px;border:1px solid #e5e7eb;border-radius:6px;background:#111;color:#fff;cursor:pointer}
      .btn-small:hover{background:#333}
      .muted{color:#9aa3b2}
      #l_table table{width:100%;border-collapse:collapse}
      #l_table th,#l_table td{padding:8px 10px;border-bottom:1px solid #eee;text-align:left}
      #l_table thead th{white-space:nowrap}
    `;
    document.head.appendChild(st);
  }

  initTopbar?.(); // make jfetch know base from #apiBase if you use it

  initPartAutocomplete();
  initPoAutocomplete();

  // revision manual change
  on(gid('l_rev_id'),'change', ()=>{
    const v = Number(gid('l_rev_id')?.value || 0);
    partAC.selectedRevId = v > 0 ? v : null;
  });

  on(gid('l_reload'), 'click', loadLots);
  on(gid('l_create'), 'click', createLot);

  // Enter in Part field
  on(gid('l_part'), 'keydown', (e)=>{
    if (e.key === 'Enter'){
      if (partAC.box?.style.display === 'block' && partAC.active >= 0){
        e.preventDefault();
        partAC.choose(partAC.active);
      } else {
        createLot();
      }
    }
  });

  // Enter in PO field
  on(gid('l_poid'), 'keydown', async (e)=>{
    if (e.key === 'Enter'){
      if (poAC.box?.style.display === 'block' && poAC.active >= 0){
        e.preventDefault();
        poAC.choose(poAC.active);
      } else {
        await createLot();
      }
    }
  });

  // Ping (optional)
  on(gid('btnPing'), 'click', ()=>{
    jfetch('/health').then(()=>toast('API OK')).catch(()=>toast('API ไม่ตอบ'));
  });

  // Delegate: + Traveler button
  on(gid('l_table'), 'click', async (e) => {
    const btn = e.target.closest('[data-action="create-trav"]');
    if (!btn) return;
    const lotId = Number(btn.dataset.lot);
    if (!lotId) return;

    try {
      const t = await jfetch('/travelers', {
        method: 'POST',
        body: JSON.stringify({ lot_id: lotId })
      });
      toast('Traveler created');
      if (t?.id) {
        location.href = travelerDetailUrl(t.id);
      } else {
        await loadLots();
      }
    } catch (e2) {
      toast(e2.message || 'Create traveler failed');
    }
  });

  loadLots();
});
