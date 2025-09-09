// /static/js/collapse.js
// Simple reusable collapsible/toggle sections (vanilla JS)
// For headers, sidebars, accordions, FAQs, etc.

/**
 * attachCollapse(trigger, target, opts)
 *
 * @param {HTMLElement|string} trigger - element or selector for button/header
 * @param {HTMLElement|string} target - element or selector for section to show/hide
 * @param {Object} opts
 * @param {boolean} [opts.startOpen=false] - whether section starts open
 * @param {string} [opts.activeClass='open'] - CSS class to toggle on target
 * @param {boolean} [opts.accordion=false] - if true, close siblings in same group
 * @param {string} [opts.group] - optional group name for accordion
 * @param {(open:boolean)=>void} [opts.onToggle]
 */
export function attachCollapse(trigger, target, opts = {}){
  const t = typeof trigger === 'string' ? document.querySelector(trigger) : trigger;
  const s = typeof target === 'string' ? document.querySelector(target) : target;
  const activeClass = opts.activeClass || 'open';
  if (!t || !s) return;

  let open = !!opts.startOpen;
  if (open) s.classList.add(activeClass); else s.classList.remove(activeClass);

  t.addEventListener('click', ()=>{
    open = !open;
    if (opts.accordion && opts.group){
      document.querySelectorAll(`[data-collapse-group="${opts.group}"]`).forEach(el=>{
        if (el!==s) el.classList.remove(activeClass);
      });
    }
    s.classList.toggle(activeClass, open);
    if (opts.group) s.dataset.collapseGroup = opts.group;
    opts.onToggle?.(open);
  });
}

/* ---------------- Example usage ---------------- */
// <button id="btnHead">Toggle Header</button>
// <header id="mainHead">My Header Content</header>
//
// import { attachCollapse } from './collapse.js';
// attachCollapse('#btnHead', '#mainHead', { startOpen:true, activeClass:'show' });

/* Accordion example */
// <h3 class="faq-q">Q1</h3><div class="faq-a">Answer1</div>
// <h3 class="faq-q">Q2</h3><div class="faq-a">Answer2</div>
//
// document.querySelectorAll('.faq-q').forEach((q,i)=>{
//   const a = q.nextElementSibling;
//   attachCollapse(q,a,{ accordion:true, group:'faq', activeClass:'visible' });
// });

/* ---------------- CSS idea ---------------- */
// .open, .show, .visible { display:block; }
// .faq-a { display:none; }
// .faq-a.visible { display:block; padding:8px; border-left:2px solid #ccc; }
