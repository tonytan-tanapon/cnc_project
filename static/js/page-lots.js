// /static/js/page-lots.js
import { $, jfetch, renderTable, toast, initTopbar } from '/static/js/api.js';

const on  = (el, ev, fn) => el && el.addEventListener(ev, fn);
const val = (id) => ($(id)?.value ?? '').trim();

// ---------------- Autocomplete (Part) ----------------
const partAC = {
  anchor: null,    // input element
  box: null,       // dropdown container
  items: [],       // suggestions [{id, part_no, name}]
  active: -1,      // keyboard highlight index
  selectedId: null,// chosen part_id
  lastChosenCode: '',

  async search(q) {
    if (!q) {
      this.render([]);
      return;
    }
    try {
      const rows = await jfetch('/parts?q=' + encodeURIComponent(q));
      // คาดว่าแต่ละ row มี {id, part_no, name}
      this.render(rows || []);
    } catch {
      this.render([]);
    }
  },

  render(list) {
    this.items = Array.isArray(list) ? list.slice(0, 20) : [];
    this.active = -1;
    const html = this.items.map((r, i) => `
      <div class="ac-item" data-idx="${i}">
        <span class="badge">${escapeHtml(r.part_no || '')}</span>
        <div class="ac-text">
          <div class="ac-name">${escapeHtml(r.name || '')}</div>
          <div class="ac-meta">#${r.id}</div>
        </div>
      </div>
    `).join('') || `<div class="ac-empty">No results</div>`;
    this.box.innerHTML = html;
    this.box.style.display = 'block';
  },

  choose(idx) {
    const r = this.items[idx];
    if (!r) return;
    this.selectedId = r.id;
    this.lastChosenCode = r.part_no || '';
    this.anchor.value = r.part_no || '';
    this.anchor.dataset.id = String(r.id);
    this.hide();
  },

  clearSelectionIfTextChanged() {
    // ถ้าผู้ใช้แก้ไขข้อความเอง ให้ล้าง selection
    if ((this.anchor.value || '').toUpperCase() !== (this.lastChosenCode || '').toUpperCase()) {
      this.selectedId = null;
      this.anchor.dataset.id = '';
    }
  },

  hide() {
    this.box.style.display = 'none';
  },

  highlight(move) {
    if (!this.items.length) return;
    this.active = (this.active + move + this.items.length) % this.items.length;
    [...this.box.querySelectorAll('.ac-item')].forEach((el, i) => {
      el.classList.toggle('active', i === this.active);
    });
    const el = this.box.querySelector(`.ac-item[data-idx="${this.active}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
};

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

function debounce(fn, ms=200) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}

function initPartAutocomplete() {
  const input = $('lot_part');
  if (!input) return;

  // dropdown container
  const box = document.createElement('div');
  box.className = 'ac-dropdown';
  box.style.display = 'none';
  input.insertAdjacentElement('afterend', box);

  // bind state
  partAC.anchor = input;
  partAC.box = box;

  // typing -> search
  const doSearch = debounce(() => {
    partAC.clearSelectionIfTextChanged();
    const q = input.value.trim();
    if (!q) {
      partAC.render([]);
      return;
    }
    partAC.search(q);
  }, 180);

  on(input, 'input', doSearch);
  on(input, 'focus', () => { if (input.value) doSearch(); });
  on(input, 'blur', () => setTimeout(()=>partAC.hide(), 120)); // เว้นเวลาให้คลิกได้

  // mouse choose
  on(box, 'click', (e) => {
    const item = e.target.closest('.ac-item');
    if (!item) return;
    partAC.choose(Number(item.dataset.idx));
  });

  // keyboard
  on(input, 'keydown', (e) => {
    if (box.style.display !== 'block') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); partAC.highlight(+1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); partAC.highlight(-1); }
    if (e.key === 'Enter') {
      if (partAC.active >= 0) {
        e.preventDefault();
        partAC.choose(partAC.active);
      }
    }
    if (e.key === 'Escape') { partAC.hide(); }
  });

  // minimal styles (ถ้าคุณมีสไตล์อยู่แล้ว ลบส่วนนี้ได้)
  if (!document.getElementById('ac-style')) {
    const style = document.createElement('style');
    style.id = 'ac-style';
    style.textContent = `
      .ac-dropdown{
        position: absolute; z-index: 20; background: #fff; border:1px solid #e5e7eb;
        border-radius:12px; margin-top:6px; box-shadow: var(--shadow); width:100%;
        max-height: 300px; overflow:auto;
      }
      .ac-item{ display:flex; gap:10px; padding:10px 12px; cursor:pointer; }
      .ac-item.active, .ac-item:hover{ background:#f8fafc; }
      .ac-text{ display:flex; flex-direction:column; }
      .ac-name{ font-weight:700; }
      .ac-meta{ font-size:12px; color:#64748b; }
      .badge{ display:inline-block; padding:.2rem .6rem; border:1px solid #e2e8f0; border-radius:999px; font-size:12px; }
      .ac-empty{ padding:10px 12px; color:#64748b; }
    `;
    document.head.appendChild(style);
  }
}

// แปลงโค้ด → id ถ้าผู้ใช้พิมพ์เองแล้วกด Create
async function resolvePartIdFromCode(code) {
  if (!code) return null;
  try {
    const list = await jfetch('/parts?q=' + encodeURIComponent(code));
    const exact = (list || []).find(p => (p.part_no || '').toUpperCase() === code.toUpperCase());
    return exact ? exact.id : null;
  } catch { return null; }
}

// ---------------- Data ops ----------------
async function loadLots() {
  const holder = $('l_table');
  if (!holder) return;
  try {
    const rows = await jfetch('/lots');
    renderTable(holder, rows);
  } catch (e) {
    holder.innerHTML = `<div class="hint">${e.message}</div>`;
  }
}

async function createLot() {
  // lot_no: ว่าง/AUTO/AUTOGEN ให้หลังบ้าน gen เอง (รองรับโดย router เวอร์ชันล่าสุด)
  const lot_no = (val('lot_no') || 'AUTO').toUpperCase();

  // หาค่า part_id: จาก selection ใน autocomplete ก่อน
  let part_id = partAC.selectedId || Number(partAC.anchor?.dataset?.id || 0) || null;

  // ถ้ายังไม่มี (ผู้ใช้พิมพ์เอง) → resolve จาก part_no
  if (!part_id) {
    const code = val('lot_part');
    part_id = await resolvePartIdFromCode(code);
  }

  if (!part_id) {
    toast('โปรดเลือก Part จากรายการ (หรือพิมพ์รหัสให้ตรงแล้วกดเลือก)', false);
    $('lot_part')?.focus();
    return;
  }

  const po_id = Number(val('lot_po') || 0) || null;
  const planned_qty = Number(val('lot_qty') || 0) || 0;
  const status = val('lot_status') || 'in_process';

  const payload = { lot_no, part_id, po_id, planned_qty, status };

  try {
    await jfetch('/lots', { method: 'POST', body: JSON.stringify(payload) });
    toast('Lot created');
    // clear form (ยกเว้นสถานะ)
    ['lot_no','lot_part','lot_po','lot_qty'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    partAC.selectedId = null; partAC.anchor.dataset.id = ''; partAC.lastChosenCode = '';
    await loadLots();
  } catch (e) {
    toast(e.message || 'Create failed', false);
  }
}

// ---------------- Boot ----------------
document.addEventListener('DOMContentLoaded', () => {
  initTopbar?.();

  initPartAutocomplete();

  on($('l_reload'), 'click', loadLots);
  on($('l_create'), 'click', createLot);

  // Enter ที่ช่อง Part → ถ้ามีรายการ active ให้เลือก, ถ้าไม่มีก็พยายาม resolve ตอนกด Create
  on($('lot_part'), 'keydown', (e) => {
    if (e.key === 'Enter') {
      if (partAC.box.style.display === 'block' && partAC.active >= 0) {
        e.preventDefault();
        partAC.choose(partAC.active);
      } else {
        createLot();
      }
    }
  });

  loadLots();
});
