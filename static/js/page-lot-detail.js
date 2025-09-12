
async function loadRevisionsForPart(partId, opts = {}) {
  const sel = $('lot_rev'); // <select id="lot_rev">
  if (!sel) return;

  sel.disabled = true;
  sel.innerHTML = `<option value="">Loading…</option>`;
  selectedRevisionId = null;

  try {
    const rows = await jfetch(`/parts/${encodeURIComponent(partId)}/revisions`);
    const revs = Array.isArray(rows) ? rows : [];

    if (!revs.length) {
      sel.innerHTML = `<option value="">— No revision —</option>`;
      // โหลด lots ของ part โดยไม่กรอง revision
      await loadLotsForPart(partId, null);
      return;
    }

    sel.innerHTML = revs.map(r =>
      `<option value="${r.id}" ${r.is_current ? 'selected' : ''}>
         ${escapeHtml(r.rev)}${r.is_current ? ' (current)' : ''}
       </option>`
    ).join('');

    // Default choice: preferId > preferText > current > first
    let chosenId = null;
    if (opts.preferId && revs.some(r => r.id === opts.preferId)) {
      chosenId = String(opts.preferId);
    } else if (opts.preferText) {
      const f = revs.find(r => String(r.rev) === String(opts.preferText));
      if (f) chosenId = String(f.id);
    } else {
      const cur = revs.find(r => r.is_current) || revs[0];
      chosenId = cur ? String(cur.id) : '';
    }

    sel.value = chosenId ?? '';
    selectedRevisionId = sel.value ? Number(sel.value) : null;

    // ✅ หลังเลือก revision เสร็จ โหลดตาราง Lots
    await loadLotsForPart(partId, selectedRevisionId);

    // ✅ ผูก event เปลี่ยน revision แล้วรีโหลด Lots
    sel.onchange = async () => {
      selectedRevisionId = sel.value ? Number(sel.value) : null;
      await loadLotsForPart(partId, selectedRevisionId);
    };

  } catch (e) {
    console.error('loadRevisionsForPart error:', e);
    sel.innerHTML = `<option value="">— No revision —</option>`;
    toast('Load revisions failed', false);
    // เผื่ออยากโชว์ lots แม้โหลด revision ไม่ได้
    await loadLotsForPart(partId, null);
  } finally {
    sel.disabled = false;
  }
}


function lotDetailUrl(id){ return `/static/lot-detail.html?id=${encodeURIComponent(id)}`; }
function partDetailUrl(id){ return `/static/part-detail.html?id=${encodeURIComponent(id)}`; }
function poDetailUrl(id){ return `/static/pos-detail.html?id=${encodeURIComponent(id)}`; }
function travelerDetailUrl(id){ return `/static/traveler-detail.html?id=${encodeURIComponent(id)}`; }
const esc = (s) => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
const fmtDate = (v) => v ? new Date(v).toLocaleString() : '';

async function buildLookups(rows){
  // ถ้าคุณมี endpoint lookup อยู่แล้วใช้ของเดิมได้เลย
  // ด้านล่างเป็นสเกลตัน (ป้องกัน undefined)
  return { partMap: {}, poMap: {} };
}

async function loadLotsForPart(partId, partRevisionId = null){
  const holder = $('lot_table'); // <div id="lot_table">
  if (!holder) return;

  holder.innerHTML = `<div class="hint">Loading lots…</div>`;

  try {
    // สร้าง query
    const q = new URLSearchParams();
    if (partId != null) q.set('part_id', String(partId));
    if (partRevisionId != null) q.set('part_revision_id', String(partRevisionId));
    // ใส่ per_page ถ้ารองรับ
    q.set('per_page', '50');

    const resp = await jfetch(`/lots?${q.toString()}`);
    const rows = Array.isArray(resp) ? resp : (resp?.items ?? []);

    // lookup (ถ้าต้องใช้)
    const { partMap, poMap } = await buildLookups(rows);

    // header
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

    // body
    const tbody = rows.length ? rows.map(r => {
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
        <tr data-id="${esc(r.id)}">
          <td>${lotNoCell}</td>
          <td>${partCell}</td>
          <td>${poCell}</td>
          <td>${travelersHtml} ${createTravBtn}</td>
          <td>${r.planned_qty ?? 0}</td>
          <td>${esc(fmtDate(r.started_at))}</td>
          <td>${esc(fmtDate(r.finished_at))}</td>
          <td>${esc(r.status || '')}</td>
        </tr>`;
    }).join('') : `<tr><td colspan="8" class="muted">No lots</td></tr>`;

    holder.innerHTML = `
      <table class="table">
        ${thead}
        <tbody>${tbody}</tbody>
      </table>`;

    // (ออปชัน) delegate ปุ่ม +Traveler
    holder.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button[data-action="create-trav"]');
      if (!btn) return;
      const lotId = Number(btn.dataset.lot);
      try {
        await jfetch(`/travelers`, {
          method: 'POST',
          body: JSON.stringify({ lot_id: lotId }),
          headers: { 'Content-Type': 'application/json' }
        });
        toast('Traveler created');
        // รีโหลดรายการให้เห็น traveler id ใหม่
        await loadLotsForPart(partId, partRevisionId);
      } catch (e) {
        console.error(e);
        toast('Create traveler failed', false);
      }
    });

  } catch (e) {
    console.error(e);
    holder.innerHTML = `<div class="hint">โหลดรายการไม่ได้: ${esc(e.message || 'error')}</div>`;
  }
}