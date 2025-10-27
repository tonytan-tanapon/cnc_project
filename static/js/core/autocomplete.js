// /static/js/autocomplete.js
// Lightweight, reusable autocomplete for any entity (customers, parts, employees, ...)
// Vanilla JS, no dependencies.

/** utility for external usage in renderers */
export function acEscapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Attach autocomplete behavior to an <input> element.
 *
 * @param {HTMLInputElement} inputEl - the text input to enhance
 * @param {Object} opts
 * @param {(term:string) => Promise<Array<any>>} opts.fetchItems - async function returning items
 * @param {(item:any) => string} opts.getDisplayValue - value to set in input when picked (e.g., "CODE — NAME")
 * @param {(item:any) => string} [opts.renderItem] - returns HTML for each row; default uses getDisplayValue
 * @param {(item:any) => void} [opts.onPick] - called when an item is selected
 * @param {boolean | 'first10'} [opts.openOnFocus=false] - if true, open with current term; if 'first10', open with empty query
 * @param {number} [opts.minChars=1] - minimum characters before searching (ignored when forcing on focus)
 * @param {number} [opts.debounceMs=200] - debounce time for input
 * @param {number} [opts.maxHeight=280] - dropdown max height (px)
 * @param {number} [opts.zIndex=1000] - dropdown z-index
 * @param {(err:any) => void} [opts.onError] - error handler
 * @returns {{ destroy: () => void, hide: () => void, show: () => void }}
 */
export function attachAutocomplete(inputEl, opts) {
  const cfg = {
    renderItem: (it) => acEscapeHtml(cfg.getDisplayValue(it)),
    onPick: () => {},
    openOnFocus: false, // false | true | 'first10'
    minChars: 1,
    debounceMs: 200,
    maxHeight: 280,
    zIndex: 1000,
    onError: (e) => console.error('[autocomplete]', e),
    ...opts,
  };

  if (!inputEl || !(inputEl instanceof HTMLInputElement)) {
    throw new Error('attachAutocomplete: inputEl must be an <input>');
  }
  if (typeof cfg.fetchItems !== 'function') throw new Error('fetchItems must be a function');
  if (typeof cfg.getDisplayValue !== 'function') throw new Error('getDisplayValue must be a function');

  // State (per-input instance)
  let box = null;
  let items = [];
  let active = -1;
  let lastTerm = '';
  let destroyed = false;

  // Utils -----------------------------------------------------------
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function ensureBox() {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'ac-box';
    Object.assign(box.style, {
      position: 'absolute',
      zIndex: cfg.zIndex,
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      background: '#fff',
      boxShadow: '0 8px 24px rgba(0,0,0,.1)',
      maxHeight: cfg.maxHeight + 'px',
      overflowY: 'auto',
      display: 'none',
    });
    document.body.appendChild(box);
    return box;
  }

  // function placeBox() {
  //   if (!box) return;
  //   const rect = inputEl.getBoundingClientRect();
  //   const top = window.scrollY + rect.bottom + 4;
  //   const left = window.scrollX + rect.left;
  //   box.style.top = `${top}px`;
  //   box.style.left = `${left}px`;
  //   box.style.minWidth = `${rect.width}px`;
  // }


  function placeBox() {
  if (!box) return;

  const rect = inputEl.getBoundingClientRect();
  const listHeight = box.offsetHeight || cfg.maxHeight;
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  let top;

  // 🩹 พลิกขึ้นบนถ้าด้านล่างไม่พอแต่ด้านบนยังพอ
  if (spaceBelow < listHeight && spaceAbove > spaceBelow) {
    top = window.scrollY + rect.top - listHeight - 4;  // show above input
  } else {
    top = window.scrollY + rect.bottom + 4;            // show below input
  }

  const left = window.scrollX + rect.left;
  box.style.top = `${top}px`;
  box.style.left = `${left}px`;
  box.style.minWidth = `${rect.width}px`;
  box.style.position = "absolute";
  box.style.zIndex = cfg.zIndex;
}

  function hide() {
    if (!box) return;
    box.style.display = 'none';
    box.innerHTML = '';
    items = [];
    active = -1;
  }

  function show() {
    if (!box) return;
    if (box.innerHTML.trim()) box.style.display = 'block';
  }

  function highlight(idx) {
    active = idx;
    [...box.querySelectorAll('.ac-item')].forEach((el, i) => {
      el.style.background = i === active ? 'rgba(0,0,0,.04)' : '';
    });
  }

  function pick(idx) {
    const it = items[idx];
    if (!it) return;
    inputEl.value = cfg.getDisplayValue(it);
    cfg.onPick(it);
    hide();
  }

  function render(list) {
    items = list || [];
    box.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'ac-empty';
      empty.textContent = 'No matches';
      Object.assign(empty.style, { padding: '10px 12px', color: '#6b7280' });
      box.appendChild(empty);
      show();
      return;
    }

    items.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'ac-item';
      row.innerHTML = `<div style="display:flex; gap:8px; align-items:center; padding:8px 12px; cursor:pointer">${cfg.renderItem(it)}</div>`;
      row.addEventListener('mouseenter', () => highlight(idx));
      row.addEventListener('mouseleave', () => highlight(-1));
      row.addEventListener('mousedown', (e) => { e.preventDefault(); pick(idx); });
      box.appendChild(row);
    });
    show();
  }

  // Core searchers --------------------------------------------------
  // Debounced search (for typing)
  const doSearchDebounced = debounce(async (term) => {
    try {
      const trimmed = (term ?? '').trim();
      if (trimmed.length < cfg.minChars) { hide(); return; }
      lastTerm = trimmed;
      const data = await cfg.fetchItems(trimmed);
      if (!destroyed && trimmed === lastTerm) {
        render(Array.isArray(data) ? data : (data?.items ?? []));
      }
    } catch (e) {
      cfg.onError(e);
    }
  }, cfg.debounceMs);

  // Immediate search (forced; ignores minChars) — for focus-open use cases
  async function doSearchImmediate(term) {
    try {
      const q = (term ?? '').trim();
      lastTerm = q;
      const data = await cfg.fetchItems(q);
      if (!destroyed && q === lastTerm) {
        render(Array.isArray(data) ? data : (data?.items ?? []));
      }
    } catch (e) {
      cfg.onError(e);
    }
  }

  // Wire events -----------------------------------------------------
  ensureBox();
  inputEl.setAttribute('autocomplete', 'off');

  const onInput = () => { placeBox(); doSearchDebounced(inputEl.value); };
  const onFocus = () => {
    placeBox();
    if (cfg.openOnFocus === 'first10') {
      // แสดง 10 รายการแรกทันที (caller ต้องทำให้ fetchItems('') คืน 10 อันแรก)
      doSearchImmediate('');
    } else if (cfg.openOnFocus === true) {
      // เปิดด้วยค่าที่พิมพ์อยู่ (แม้น้อยกว่า minChars ก็ force)
      doSearchImmediate(inputEl.value);
    }
  };
  const onBlur = () => setTimeout(hide, 120); // allow mouse click
  const onKey = (e) => {
    const max = items.length;
    if (!max || box.style.display === 'none') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight((active + 1) % max); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight((active - 1 + max) % max); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) pick(active); }
    else if (e.key === 'Escape') { hide(); }
  };

  inputEl.addEventListener('input', onInput);
  inputEl.addEventListener('focus', onFocus);
  inputEl.addEventListener('blur', onBlur);
  inputEl.addEventListener('keydown', onKey);
  window.addEventListener('resize', placeBox);
  window.addEventListener('scroll', placeBox, true);

  function destroy() {
    destroyed = true;
    inputEl.removeEventListener('input', onInput);
    inputEl.removeEventListener('focus', onFocus);
    inputEl.removeEventListener('blur', onBlur);
    inputEl.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', placeBox);
    window.removeEventListener('scroll', placeBox, true);
    if (box && box.parentNode) box.parentNode.removeChild(box);
    box = null; items = []; active = -1;
  }

  return { destroy, hide, show };
}

// ---------------- Example usages ----------------
// 1) Customers
// import { attachAutocomplete, acEscapeHtml } from './autocomplete.js';
// const customerInput = document.getElementById('po_customer_input');
// const hiddenId = document.getElementById('po_customer_id');
// attachAutocomplete(customerInput, {
//   fetchItems: (q) => jfetch(
//     (q && q.trim())
//       ? `/customers?q=${encodeURIComponent(q.trim())}&page=1&per_page=20`
//       : `/customers?page=1&per_page=10`
//   ),
//   getDisplayValue: (it) => `${it.code ?? ''} — ${it.name ?? ''}`,
//   renderItem: (it) => `
//     <div style="font-weight:600">${(it.code ?? '').toString()}</div>
//     <div style="color:#6b7280">— ${acEscapeHtml(it.name ?? '')}</div>
//   `,
//   onPick: (it) => { hiddenId.value = it.id; },
//   openOnFocus: 'first10',  // ⬅️ โฟกัสแล้วแสดง 10 รายการแรกทันที
//   // minChars: 1 — ปล่อยค่าเดิมได้ เพราะ focus ใช้ immediate fetch ที่ไม่สน minChars
// });

// 2) Parts (show part_no and description)
// const partInput = document.getElementById('line_part_input');
// const partHidden = document.getElementById('line_part_id');
// attachAutocomplete(partInput, {
//   fetchItems: (q) => jfetch(`/parts?q=${encodeURIComponent(q || '')}&limit=12`),
//   getDisplayValue: (it) => `${it.part_no ?? ''} — ${it.description ?? ''}`,
//   renderItem: (it) => `
//     <div style="font-weight:600">${acEscapeHtml(it.part_no ?? '')}</div>
//     <div style="color:#6b7280">— ${acEscapeHtml(it.description ?? '')}</div>
//   `,
//   onPick: (it) => { partHidden.value = it.id; },
//   openOnFocus: 'first10',   // เปิด 10 รายการแรกของ parts ตาม backend
// });

// 3) Revisions (dependent on selected Part)
// const revInput = document.getElementById('line_rev_input');
// const revHidden = document.getElementById('line_rev_id');
// const currentPartId = () => partHidden.value;
// attachAutocomplete(revInput, {
//   fetchItems: (q) => {
//     const pid = currentPartId();
//     if (!pid) return Promise.resolve([]);
//     return jfetch(`/parts/${encodeURIComponent(pid)}/revisions?q=${encodeURIComponent(q || '')}`);
//   },
//   getDisplayValue: (it) => `Rev ${it.rev ?? ''}`,
//   onPick: (it) => { revHidden.value = it.id; },
//   minChars: 0,              // อนุญาตให้โชว์ได้แม้ไม่พิมพ์
//   openOnFocus: true,        // โฟกัสแล้วเปิดด้วยค่าที่มี (หรือว่าง)
// });

// 4) Employees by code or name
// attachAutocomplete(document.getElementById('emp_input'), {
//   fetchItems: (q) => jfetch(`/employees?q=${encodeURIComponent(q || '')}`),
//   getDisplayValue: (it) => `${it.emp_code ?? ''} — ${it.name ?? ''}`,
//   onPick: (it) => { document.getElementById('employee_id').value = it.id; },
//   openOnFocus: 'first10',
// });
