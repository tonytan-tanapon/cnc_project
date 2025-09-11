import { $, jfetch, toast } from './api.js';
import { renderTableX } from './tablex.js';

let partId;
let revisions = [];
const revTableEl = $('rev_table');

function renderRevs() {
  const rows = revisions.map(r => ({
    id:r.id, rev:r.rev||'', spec:r.spec||'', drawing:r.drawing_file||'', is_current: !!r.is_current
  }));
  renderTableX(revTableEl, rows, {
    getRowId:r=>r.id,
    columns:[
      { key:'__no', title:'No.', width:'64px', align:'right' },
      { key:'rev', title:'Rev', width:'80px' },
      { key:'spec', title:'Spec', grow:1 },
      { key:'drawing', title:'Drawing', width:'200px' },
      { key:'is_current', title:'Current', width:'110px', render:r=> r.is_current? '<span class="badge">current</span>':'' },
      { key:'__act', title:'', width:'220px', align:'right',
        render:r=>`
          <button class="btn-small" data-cur="${r.id}">Set Current</button>
          <button class="btn-small" data-edit="${r.id}">Edit</button>
          <button class="btn-small" data-del="${r.id}">Delete</button>`
      },
    ],
    emptyText: 'No revisions',
  });
}

async function loadRevs() {
  const rows = await jfetch(`/parts/${encodeURIComponent(partId)}/revisions`);
  revisions = Array.isArray(rows)? rows: [];
  renderRevs();
}

async function addRev() {
  const rev = $('r_rev')?.value?.trim()?.toUpperCase() || '';
  const spec = $('r_spec')?.value?.trim() || null;
  const drawing_file = $('r_dwg')?.value?.trim() || null;
  const is_current = ($('r_current')?.value === 'true');
  if (!rev) return toast('Enter Rev', false);
  await jfetch(`/parts/${encodeURIComponent(partId)}/revisions`, {
    method:'POST',
    body: JSON.stringify({ rev, spec, drawing_file, is_current }),
  });
  await loadRevs();
  ['r_rev','r_spec','r_dwg'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
  $('r_current') && ($('r_current').value='false');
}

revTableEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-cur],button[data-edit],button[data-del]');
  if (!btn) return;
  const id = Number(btn.dataset.cur || btn.dataset.edit || btn.dataset.del);
  if (!id) return;

  if (btn.dataset.cur) {
    await jfetch(`/parts/revisions/${id}`, { method:'PATCH', body: JSON.stringify({ is_current: true })});
    await loadRevs(); return;
  }
  if (btn.dataset.edit) {
    const r = revisions.find(x=>x.id===id); if (!r) return;
    const rev = prompt('Rev', r.rev||'')?.trim()?.toUpperCase(); if (rev==null) return;
    const spec = prompt('Spec', r.spec||'')?.trim(); if (spec==null) return;
    const drawing_file = prompt('Drawing', r.drawing_file||'')?.trim(); if (drawing_file==null) return;
    await jfetch(`/parts/revisions/${id}`, { method:'PATCH', body: JSON.stringify({ rev, spec, drawing_file })});
    await loadRevs(); return;
  }
  if (btn.dataset.del) {
    if (!confirm('Delete?')) return;
    await jfetch(`/parts/revisions/${id}`, { method:'DELETE' });
    await loadRevs(); return;
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  const pid = Number(new URLSearchParams(location.search).get('id'));
  if (!Number.isFinite(pid) || pid <= 0) { toast('Missing id', false); return; }
  partId = pid;
  $('r_add')?.addEventListener('click', (e)=>{ e.preventDefault(); addRev(); });
  await loadRevs();
});
