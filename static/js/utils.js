// /static/js/utils.js
// One-file utility kit you can reuse across pages (no deps)
// Exports: jfetch, toast, confirmBox, debounce, throttle,
//          escapeHtml, formatMoney, formatHours, parseHours,
//          formatDate, formatDateTime, exportCSV,
//          makeModal, showLoading, hideLoading,
//          makeSortableTable

/* ----------------------------- Fetch helper ----------------------------- */
export async function jfetch(url, opts = {}) {
  const headers = { 'Accept': 'application/json', ...(opts.headers || {}) };
  let body = opts.body;
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch(url, { ...opts, headers, body });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (data && (data.message || data.error?.message)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/* ----------------------------- UI: Toast ----------------------------- */
let _toastHost;
function ensureToastHost(){
  if (_toastHost) return _toastHost;
  const div = document.createElement('div');
  Object.assign(div.style, {
    position: 'fixed', inset: 'auto 16px 16px 16px', display: 'grid', gap: '8px', zIndex: 9999,
    pointerEvents: 'none'
  });
  document.body.appendChild(div); _toastHost = div; return div;
}
export function toast(msg, type = 'success', ms = 2500){
  const host = ensureToastHost();
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style, {
    background: type==='error' ? '#fee2e2' : '#111',
    color: type==='error' ? '#991b1b' : '#fff',
    padding: '10px 12px', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.12)',
    pointerEvents: 'auto'
  });
  host.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .25s'; setTimeout(()=>el.remove(), 250); }, ms);
}

/* ----------------------------- UI: Confirm Box ----------------------------- */
export async function confirmBox(message, { okText = 'OK', cancelText = 'Cancel' } = {}){
  return new Promise((resolve)=>{
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { position:'fixed', inset:0, background:'rgba(0,0,0,.32)', display:'grid', placeItems:'center', zIndex:10000 });
    const card = document.createElement('div');
    Object.assign(card.style, { background:'#fff', borderRadius:'12px', padding:'16px', width:'min(420px, calc(100% - 32px))', boxShadow:'0 10px 30px rgba(0,0,0,.2)' });
    card.innerHTML = `<div style="margin-bottom:12px">${escapeHtml(message)}</div>
      <div style="display:flex; gap:8px; justify-content:flex-end">
        <button data-act="cancel">${escapeHtml(cancelText)}</button>
        <button data-act="ok">${escapeHtml(okText)}</button>
      </div>`;
    wrap.appendChild(card); document.body.appendChild(wrap);
    wrap.addEventListener('click', (e)=>{ if(e.target===wrap) { document.body.removeChild(wrap); resolve(false); } });
    card.querySelector('[data-act="cancel"]').addEventListener('click', ()=>{ document.body.removeChild(wrap); resolve(false); });
    card.querySelector('[data-act="ok"]').addEventListener('click', ()=>{ document.body.removeChild(wrap); resolve(true); });
  });
}

/* ----------------------------- Utils ----------------------------- */
export const debounce = (fn, ms=200)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); } };
export const throttle = (fn, ms=200)=>{ let t=0; return (...a)=>{ const n=Date.now(); if(n-t>=ms){ t=n; fn(...a); } } };
export const escapeHtml = (s)=> String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

/* ----------------------------- Formatters ----------------------------- */
const moneyFmt = new Intl.NumberFormat(undefined, { style:'currency', currency:'USD' });
export const formatMoney = (n)=> moneyFmt.format(Number(n||0));
export const formatHours = (h)=> (Number(h||0)).toFixed(2);
export const parseHours = (s)=>{ const x = parseFloat(String(s).replace(/[^0-9.\-]/g,'')); return isFinite(x)? x : 0; };
export const formatDate = (d)=>{ const x=new Date(d); return isNaN(x)? '' : x.toISOString().slice(0,10); };
export const formatDateTime = (d)=>{ const x=new Date(d); if(isNaN(x)) return ''; const iso=x.toISOString(); return iso.slice(0,10)+' '+iso.slice(11,19); };

/* ----------------------------- CSV Export ----------------------------- */
export function exportCSV(filename, rows){
  const toCSV = (v)=>`"${String(v ?? '').replaceAll('"','""')}"`;
  const cols = Object.keys(rows?.[0] || {});
  const lines = [ cols.map(c=>toCSV(c)).join(','), ...rows.map(r=> cols.map(c=>toCSV(r[c])).join(',')) ];
  const blob = new Blob([lines.join('\n')], { type:'text/csv;charset=utf-8;' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename || 'data.csv' });
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

/* ----------------------------- Modal ----------------------------- */
export function makeModal(){
  const overlay = document.createElement('div');
  Object.assign(overlay.style, { position:'fixed', inset:0, background:'rgba(0,0,0,.4)', display:'none', placeItems:'center', zIndex:10000 });
  const panel = document.createElement('div');
  Object.assign(panel.style, { background:'#fff', borderRadius:'14px', width:'min(720px, calc(100% - 32px))', maxHeight:'80vh', overflow:'auto', boxShadow:'0 12px 36px rgba(0,0,0,.25)' });
  overlay.appendChild(panel); document.body.appendChild(overlay);
  return {
    el: overlay,
    panel,
    open(html){ panel.innerHTML = html; overlay.style.display='grid'; },
    close(){ overlay.style.display='none'; panel.innerHTML=''; },
    destroy(){ overlay.remove(); }
  };
}

/* ----------------------------- Loading Overlay ----------------------------- */
const LO_CLASS = 'loading-overlay';
export function showLoading(target){
  const box = target || document.body;
  const overlay = document.createElement('div'); overlay.className = LO_CLASS;
  Object.assign(overlay.style, { position:'absolute', inset:0, background:'rgba(255,255,255,.6)', display:'grid', placeItems:'center' });
  const spinner = document.createElement('div'); spinner.textContent = 'Loading…'; spinner.style.padding='8px 12px'; spinner.style.border='1px solid #e5e7eb'; spinner.style.borderRadius='10px';
  overlay.appendChild(spinner);
  const pos = getComputedStyle(box).position; if (pos==='static' || !pos) box.style.position='relative';
  box.appendChild(overlay);
}
export function hideLoading(target){
  const box = target || document.body;
  const o = box.querySelector('.'+LO_CLASS); if (o) o.remove();
}

/* ----------------------------- Sortable Table ----------------------------- */
export function makeSortableTable(table){
  const THS = table.tHead?.querySelectorAll('th'); if (!THS) return;
  THS.forEach((th, idx)=>{
    th.style.cursor = 'pointer';
    th.addEventListener('click', ()=>{
      const dir = th.dataset.sort === 'asc' ? 'desc' : 'asc';
      THS.forEach(h=> h.removeAttribute('data-sort'));
      th.dataset.sort = dir;
      const tbody = table.tBodies[0];
      const rows = [...tbody.rows];
      rows.sort((a,b)=>{
        const A = a.cells[idx]?.textContent?.trim() ?? '';
        const B = b.cells[idx]?.textContent?.trim() ?? '';
        const nA = parseFloat(A.replace(/[^0-9.\-]/g,''));
        const nB = parseFloat(B.replace(/[^0-9.\-]/g,''));
        const bothNum = !isNaN(nA) && !isNaN(nB);
        const cmp = bothNum ? (nA - nB) : A.localeCompare(B);
        return dir==='asc' ? cmp : -cmp;
      });
      tbody.innerHTML = '';
      rows.forEach(r=> tbody.appendChild(r));
    });
  });
}
