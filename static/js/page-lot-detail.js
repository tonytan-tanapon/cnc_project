async function loadRevisionsForPart(partId, opts = {}) {
  // opts: { preferId, preferText }
  const sel = $('lot_rev');
  if (!sel) return;

  sel.disabled = true;
  sel.innerHTML = `<option value="">Loading…</option>`;
  selectedRevisionId = null;

  try {
    // ✅ Matches your FastAPI router: @parts_router.get("/{part_id}/revisions")
    const rows = await jfetch(`/parts/${encodeURIComponent(partId)}/revisions`);
    // rows is a plain array of RevOut, not {items:[]}
    const revs = Array.isArray(rows) ? rows : [];

    if (!revs.length) {
      sel.innerHTML = `<option value="">— No revision —</option>`;
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
  } catch (e) {
    console.error('loadRevisionsForPart error:', e);
    sel.innerHTML = `<option value="">— No revision —</option>`;
    toast('Load revisions failed', false);
  } finally {
    sel.disabled = false;
  }
}
