// /static/js/inline-crud.js
// Reusable inline edit/create/delete for table rows (vanilla JS)
// Works with any REST-ish backend. Optional integration with CursorPager & autocomplete.

/**
 * makeInlineTable
 *
 * @param {HTMLTableElement} table - <table> with <thead> and <tbody>
 * @param {Object} cfg
 * @param {Array<{key:string,label?:string,width?:string,readonly?:boolean,
 *                render?:(val,row)=>string, editor?:'text'|'number'|'select'|'autocomplete'|((td,row)=>HTMLElement),
 *                options?:Array<{value:string,label:string}>|(()=>Promise<any[]>), // for select
 *                ac?:{ attach:(input:HTMLInputElement, onPick:(item)=>void)=>void, // for autocomplete
 *                     getValue:(row:any)=>string, // shown in input when not editing
 *                     setRow?:(row:any,item:any)=>void // how to map picked item back to row }
 *               }>} cfg.columns - column definitions
 * @param {() => Promise<{ items:any[], hasMore?:boolean }>} cfg.load - fetch first/next page (you control pagination outside or use CursorPager)
 * @param {(row:any) => Promise<any>} cfg.create - create new row (server returns canonical row)
 * @param {(row:any) => Promise<any>} cfg.update - update row
 * @param {(row:any) => Promise<void>} cfg.remove - delete row
 * @param {Object} [cfg.keys] - primary key mapping
 * @param {string} [cfg.keys.id='id'] - unique id field
 * @param {boolean} [cfg.optimistic=false] - apply changes before server confirm
 * @param {(msg:string,type?:'ok'|'error') => void} [cfg.toast]
 * @param {HTMLElement} [cfg.loadMoreBtn] - if provided, clicking loads more
 * @param {(row:any)=>boolean} [cfg.editable] - gate to allow edit per row
 * @param {(row:any)=>boolean} [cfg.deletable] - gate to allow delete per row
 * @returns {{ reload:()=>Promise<void>, addBlank:()=>void }}
 */
export function makeInlineTable(table, cfg){
  const T = table;
  const TB = T.tBodies[0] || T.createTBody();
  const toast = cfg.toast || ((m)=>console.log('[inline]', m));
  const ID = (cfg.keys && cfg.keys.id) || 'id';
  const canEdit = cfg.editable || (()=>true);
  const canDel  = cfg.deletable || (()=>true);
  const optimistic = !!cfg.optimistic;

  // --- Helpers ---
  const esc = (s) => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const q = (sel, el=document) => el.querySelector(sel);
  const h = (html) => { const d=document.createElement('template'); d.innerHTML=html.trim(); return d.content.firstElementChild; };

  function colValue(col, row){
    if (col.ac && col.ac.getValue) return col.ac.getValue(row);
    return row[col.key];
  }

  function renderCell(col, row){
    if (col.render) return col.render(row[col.key], row);
    return esc(colValue(col, row));
  }

  function rowHtml(row){
    const controls = `
      <button class="btn-edit" data-act="edit">Edit</button>
      <button class="btn-del" data-act="del">Delete</button>`;
    return `
      <tr data-id="${esc(row[ID])}" data-mode="view">
        ${cfg.columns.map(c=>`<td data-key="${esc(c.key)}">${renderCell(c,row)}</td>`).join('')}
        <td class="td-actions">${controls}</td>
      </tr>`;
  }

  function editorFor(col, row){
    if (typeof col.editor === 'function') return col.editor(document.createElement('td'), row);

    const input = document.createElement('input');
    input.type = col.editor === 'number' ? 'number' : 'text';
    input.value = colValue(col, row) ?? '';
    input.style.width = '100%';

    if (col.editor === 'select'){
      const sel = document.createElement('select');
      sel.style.width = '100%';
      const applyOpts = (opts)=>{
        sel.innerHTML = '';
        (opts||[]).forEach(o=>{
          const op=document.createElement('option');
          op.value = o.value ?? o.id ?? '';
          op.textContent = o.label ?? o.name ?? String(op.value);
          sel.appendChild(op);
        });
        const v = row[col.key];
        if (v!==undefined && v!==null) sel.value = String(v);
      };
      if (typeof col.options === 'function'){
        Promise.resolve(col.options()).then(applyOpts);
      } else applyOpts(col.options);
      sel._getValue = ()=> sel.value;
      return sel;
    }

    if (col.editor === 'autocomplete' && col.ac?.attach){
      col.ac.attach(input, (item)=>{
        if (col.ac.setRow) col.ac.setRow(row, item); else row[col.key] = item?.id;
        input.value = col.ac.getValue ? col.ac.getValue(row) : (item?.label || '');
      });
    }

    input._getValue = ()=> input.type==='number' ? (input.value===''? null : Number(input.value)) : input.value;
    return input;
  }

  function toEdit(tr){
    if (!tr || tr.dataset.mode === 'edit') return;
    const row = tr._row;
    tr.dataset.mode = 'edit';
    [...tr.children].forEach((td,i)=>{
      const col = cfg.columns[i];
      if (!col || col.readonly){ return; }
      td.innerHTML = '';
      const ed = editorFor(col, row);
      td.appendChild(ed);
    });
    const act = tr.querySelector('.td-actions');
    act.innerHTML = '<button data-act="save">Save</button> <button data-act="cancel">Cancel</button>';
  }

  function toView(tr){
    if (!tr || tr.dataset.mode === 'view') return;
    const row = tr._row;
    tr.dataset.mode = 'view';
    [...tr.children].forEach((td,i)=>{
      const col = cfg.columns[i];
      if (!col) return;
      td.innerHTML = i < cfg.columns.length ? renderCell(col, row) : td.innerHTML;
    });
    const act = tr.querySelector('.td-actions');
    act.innerHTML = '<button class="btn-edit" data-act="edit">Edit</button> <button class="btn-del" data-act="del">Delete</button>';
  }

  function collect(tr){
    const row = tr._row;
    [...tr.children].forEach((td,i)=>{
      const col = cfg.columns[i];
      if (!col || col.readonly) return;
      const ed = td.querySelector('input,select,textarea');
      if (!ed) return;
      const v = ed._getValue ? ed._getValue() : ed.value;
      row[col.key] = v;
    });
    return row;
  }

  function insertRow(row){
    const tr = h(rowHtml(row));
    tr._row = row;
    TB.appendChild(tr);
    return tr;
  }

  function replaceRow(tr, row){
    const newTr = h(rowHtml(row));
    newTr._row = row;
    TB.replaceChild(newTr, tr);
    return newTr;
  }

  function addBlank(){
    const blank = {}; cfg.columns.forEach(c=> blank[c.key] = c.ac?.getValue ? '' : '');
    const tr = insertRow({ ...blank, [ID]: `tmp_${Date.now()}` });
    toEdit(tr);
  }

  async function reload(){
    TB.innerHTML = '<tr><td colspan="'+ (cfg.columns.length+1) +'" class="empty">Loading…</td></tr>';
    const { items } = await cfg.load();
    TB.innerHTML = '';
    items.forEach(r=> insertRow(r));
  }

  // --- Event delegation ---
  TB.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const tr = e.target.closest('tr');
    if (!tr) return;
    const act = btn.dataset.act;
    if (act === 'edit'){
      if (!canEdit(tr._row)) return;
      toEdit(tr);
    } else if (act === 'cancel'){
      toView(tr);
    } else if (act === 'save'){
      const rowBefore = { ...tr._row };
      const payload = collect(tr);
      try{
        if (String(payload[ID]).startsWith('tmp_')){
          if (optimistic) toView(tr);
          const created = await cfg.create(payload);
          replaceRow(tr, created);
          toast('Created','ok');
        } else {
          if (optimistic) toView(tr);
          const updated = await cfg.update(payload);
          replaceRow(tr, updated);
          toast('Saved','ok');
        }
      }catch(err){
        console.error(err);
        tr._row = rowBefore; // revert mem
        toView(tr);
        toast('Save failed','error');
      }
    } else if (act === 'del'){
      if (!canDel(tr._row)) return;
      if (!confirm('Delete this row?')) return;
      try{
        await cfg.remove(tr._row);
        tr.remove();
        toast('Deleted','ok');
      }catch(err){
        console.error(err);
        toast('Delete failed','error');
      }
    }
  });

  // external load more button
  cfg.loadMoreBtn?.addEventListener('click', async ()=>{
    const { items, hasMore } = await cfg.load();
    items.forEach(r=> insertRow(r));
    if (!hasMore) cfg.loadMoreBtn.hidden = true;
  });

  return { reload, addBlank };
}

// -----------------------------
// USAGE EXAMPLES
// -----------------------------
// 1) Customers page (with CursorPager)
// import { CursorPager } from './pagination.js';
// import { makeInlineTable } from './inline-crud.js';
// const pager = new CursorPager({ url: '/api/v1/customers', pageSize: 25 });
// const T = document.querySelector('#customersTable');
// const btnMore = document.querySelector('#btnMore');
// const q = document.querySelector('#q');
// const CRUD = makeInlineTable(T, {
//   columns: [
//     { key: 'code', label: 'Code', editor: 'text' },
//     { key: 'name', label: 'Name', editor: 'text' },
//   ],
//   load: async () => {
//     const { items, hasMore } = await pager.next({ q: q.value.trim() });
//     return { items, hasMore };
//   },
//   create: (row) => jfetch('/api/v1/customers', { method: 'POST', body: row }),
//   update: (row) => jfetch(`/api/v1/customers/${encodeURIComponent(row.id)}`, { method: 'PUT', body: row }),
//   remove: (row) => jfetch(`/api/v1/customers/${encodeURIComponent(row.id)}`, { method: 'DELETE' }),
//   loadMoreBtn: btnMore,
//   toast: (m,t) => toast(m, t==='error'?'error':'success'),
// });
// document.addEventListener('DOMContentLoaded', ()=> CRUD.reload());
// q.addEventListener('input', debounce(()=>{ pager.reset(); CRUD.reload(); }, 250));
// function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms)} }

// 2) PO Lines with Part & Rev autocomplete columns
// import { attachAutocomplete } from './autocomplete.js';
// const linesTable = document.querySelector('#poLines');
// const partAC = {
//   attach: (input, onPick) => attachAutocomplete(input, {
//     fetchItems: (term) => jfetch(`/api/v1/parts?q=${encodeURIComponent(term)}&limit=12`),
//     getDisplayValue: it => `${it.part_no} — ${it.description ?? ''}`,
//     onPick: onPick,
//   }),
//   getValue: (row) => row.part_no ? `${row.part_no} — ${row.part_desc ?? ''}` : '',
//   setRow: (row, it) => { row.part_id = it.id; row.part_no = it.part_no; row.part_desc = it.description; }
// };
// const revAC = (getPartId) => ({
//   attach: (input, onPick) => attachAutocomplete(input, {
//     fetchItems: (term) => jfetch(`/api/v1/parts/${encodeURIComponent(getPartId())}/revisions?q=${encodeURIComponent(term)}`),
//     getDisplayValue: it => `Rev ${it.rev}`,
//     onPick: onPick,
//   }),
//   getValue: (row) => row.rev ? `Rev ${row.rev}` : '',
//   setRow: (row, it) => { row.rev_id = it.id; row.rev = it.rev; }
// });
// const CRUD2 = makeInlineTable(linesTable, {
//   columns: [
//     { key: 'part_no', label: 'Part', editor: 'autocomplete', ac: partAC },
//     { key: 'rev', label: 'Rev', editor: 'autocomplete', ac: revAC(()=>currentPartId) },
//     { key: 'qty', label: 'Qty', editor: 'number' },
//     { key: 'unit_price', label: 'Unit Price', editor: 'number' },
//   ],
//   load: async () => { /* your pager for /pos/{id}/lines */ },
//   create: (row) => jfetch(`/api/v1/pos/${poId}/lines`, { method: 'POST', body: row }),
//   update: (row) => jfetch(`/api/v1/pos/${poId}/lines/${row.id}`, { method: 'PUT', body: row }),
//   remove: (row) => jfetch(`/api/v1/pos/${poId}/lines/${row.id}`, { method: 'DELETE' }),
//   toast: (m,t)=>toast(m, t==='error'?'error':'success'),
//   optimistic: true,
// });
