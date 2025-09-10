// /static/js/toggler.js
// Reusable show/hide/toggle for sections (e.g. create form)
// - Imperative API: createToggler({...})
// - Declarative: autoInitToggles() scans [data-toggle] triggers

const $$ = (sel, root=document) => (typeof sel === 'string' ? root.querySelector(sel) : sel);
const focusables = 'a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
const uid = () => 'tg_' + Math.random().toString(36).slice(2, 9);

function ensureId(el) { if (!el.id) el.id = uid(); return el.id; }

function setAria(trigger, panel, open) {
  if (!trigger) return;
  const id = ensureId(panel);
  trigger.setAttribute('aria-controls', id);
  trigger.setAttribute('aria-expanded', String(!!open));
}

function setHidden(panel, open) {
  if (!panel) return;
  if (open) panel.removeAttribute('hidden');
  else panel.setAttribute('hidden', '');
  panel.classList.toggle('is-open', !!open);       // เผื่ออยากทำ transition ใน CSS
}

function firstFocusable(panel, selector) {
  if (!panel) return null;
  if (selector) return $$(selector, panel) || null;
  return panel.querySelector(focusables);
}

function persist(key, val) {
  try { localStorage.setItem(key, JSON.stringify(!!val)); } catch {}
}
function restore(key, fallback=false) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : !!JSON.parse(raw);
  } catch { return fallback; }
}

function closeOthersInGroup(group, except) {
  if (!group) return;
  document.querySelectorAll(`[data-toggle][data-toggle-group="${group}"]`).forEach(btn => {
      const inst = btn._togglerInstance;
      if (inst && inst !== except) inst.close();
  });
}

/**
 * @param {Object} opts
 * @param {HTMLElement|string} opts.trigger    ปุ่ม/ลิงก์ที่เอาไว้กด
 * @param {HTMLElement|string} opts.panel      ส่วนที่จะซ่อน/แสดง
 * @param {boolean} [opts.initialOpen]         เปิดตั้งต้น (ถ้าไม่ส่ง จะดูจาก persistKey)
 * @param {string}  [opts.persistKey]          key ใน localStorage เพื่อจำสถานะ
 * @param {boolean} [opts.closeOnEsc=true]
 * @param {boolean} [opts.closeOnOutside=false]
 * @param {string}  [opts.focusTarget]         selector ภายใน panel ที่จะโฟกัสเมื่อเปิด
 * @param {string}  [opts.group]               ชื่อกลุ่ม (เปิดทีละอัน)
 * @param {() => void} [opts.onOpen]
 * @param {() => void} [opts.onClose]
 */
export function createToggler(opts) {
  const trigger = $$(opts.trigger);
  const panel   = $$(opts.panel);
  if (!trigger || !panel) throw new Error('createToggler: invalid trigger/panel');

  const persistKey     = opts.persistKey || null;
  const closeOnEsc     = opts.closeOnEsc ?? true;
  const closeOnOutside = opts.closeOnOutside ?? false;
  const group          = opts.group || null;
  const focusTarget    = opts.focusTarget || null;
  const onOpen         = opts.onOpen || (()=>{});
  const onClose        = opts.onClose || (()=>{});

  // สถานะเริ่มต้น
  let open = (persistKey != null)
    ? restore(persistKey, !!opts.initialOpen)
    : !!opts.initialOpen;

  setHidden(panel, open);
  setAria(trigger, panel, open);
  if (open && group) closeOthersInGroup(group, null);

  // outside click
  function handleOutside(e) {
    if (!open) return;
    if (panel.contains(e.target) || trigger.contains(e.target)) return;
    api.close();
  }

  // esc
  function handleEsc(e) {
    if (!open) return;
    if (e.key === 'Escape') api.close();
  }

  function bindGlobal() {
    if (closeOnOutside) document.addEventListener('mousedown', handleOutside);
    if (closeOnEsc)     document.addEventListener('keydown', handleEsc);
  }
  function unbindGlobal() {
    if (closeOnOutside) document.removeEventListener('mousedown', handleOutside);
    if (closeOnEsc)     document.removeEventListener('keydown', handleEsc);
  }

  const api = {
    isOpen: () => open,
    open: () => {
      if (open) return;
      if (group) closeOthersInGroup(group, api);
      open = true;
      setHidden(panel, true);
      setAria(trigger, panel, true);
      if (persistKey) persist(persistKey, true);
      const f = firstFocusable(panel, focusTarget);
      if (f) { setTimeout(()=>f.focus(), 0); }
      bindGlobal();
      onOpen();
    },
    close: () => {
      if (!open) return;
      open = false;
      setHidden(panel, false);
      setAria(trigger, panel, false);
      if (persistKey) persist(persistKey, false);
      unbindGlobal();
      onClose();
    },
    toggle: () => (open ? api.close() : api.open()),
    destroy: () => {
      unbindGlobal();
      trigger.removeEventListener('click', api.toggle);
      delete trigger._togglerInstance;
    }
  };

  trigger.addEventListener('click', (e) => { e.preventDefault?.(); api.toggle(); });
  trigger._togglerInstance = api;

  // คืน instance ให้ใช้งานต่อ
  return api;
}

/**
 * Declarative: สร้าง toggle อัตโนมัติจาก data-attributes
 * ตัวอย่างปุ่ม:
 *   <button
 *     data-toggle
 *     data-toggle-target="#createCard"
 *     data-toggle-persist="customers:create"
 *     data-toggle-esc="1"
 *     data-toggle-outside="1"
 *     data-toggle-focus="#c_name"
 *     data-toggle-group="top-bars">
 *     + Add
 *   </button>
 */
export function autoInitToggles(root=document) {
  const triggers = root.querySelectorAll('[data-toggle]');
  const instances = [];
  triggers.forEach((btn) => {
    const targetSel = btn.getAttribute('data-toggle-target');
    const panel = targetSel ? $$(targetSel, root) : null;
    if (!panel) return;

    const instance = createToggler({
      trigger: btn,
      panel,
      persistKey: btn.getAttribute('data-toggle-persist') || null,
      initialOpen: btn.hasAttribute('data-open'),
      closeOnEsc: btn.getAttribute('data-toggle-esc') !== '0',
      closeOnOutside: btn.getAttribute('data-toggle-outside') === '1',
      focusTarget: btn.getAttribute('data-toggle-focus') || null,
      group: btn.getAttribute('data-toggle-group') || null,
    });
    instances.push(instance);
  });
  return instances;
}

// CSS แนะนำ (ใส่ครั้งเดียวใน global.css):
// [hidden]{display:none!important}
// .is-open{ /* ใช้สำหรับ transition optional */ }
