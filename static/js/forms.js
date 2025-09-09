// /static/js/forms.js
// Reusable form validation + helpers (vanilla JS)
// Works standalone or with inline-crud / utils.js

/**
 * validateForm(form, rules)
 *
 * @param {HTMLFormElement} form
 * @param {Object} rules - { fieldName: [ { rule, message } ] }
 *   rule: string | function(value, form) => boolean
 *     - 'required'
 *     - 'email'
 *     - 'number'
 *     - 'date'
 *     - function: custom boolean validator
 * @returns {{ valid: boolean, errors: Object<string,string[]> }}
 */
export function validateForm(form, rules){
  const errors = {};
  for (const [name, rs] of Object.entries(rules)){
    const input = form.elements[name];
    if (!input) continue;
    const value = input.value.trim();
    for (const r of rs){
      let ok = true;
      if (typeof r.rule === 'function') ok = r.rule(value, form);
      else if (r.rule === 'required') ok = value !== '';
      else if (r.rule === 'email') ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      else if (r.rule === 'number') ok = /^-?[0-9]+(\.[0-9]+)?$/.test(value);
      else if (r.rule === 'date') ok = !isNaN(new Date(value).getTime());
      if (!ok){
        if (!errors[name]) errors[name] = [];
        errors[name].push(r.message);
      }
    }
  }
  return { valid: Object.keys(errors).length===0, errors };
}

/**
 * attachValidation(form, rules, { onValid, onInvalid })
 * auto shows error messages under inputs
 */
export function attachValidation(form, rules, { onValid, onInvalid } = {}){
  const errBox = (input) => {
    let box = input.parentNode.querySelector('.err-msg');
    if (!box){ box = document.createElement('div'); box.className='err-msg'; box.style.cssText='color:#b91c1c; font-size:12px; margin-top:2px'; input.parentNode.appendChild(box); }
    return box;
  };

  form.addEventListener('submit', (e)=>{
    const { valid, errors } = validateForm(form, rules);
    [...form.elements].forEach(el=>{
      if (el.name){
        const box = errBox(el);
        box.textContent = errors[el.name]?.[0] || '';
      }
    });
    if (!valid){
      e.preventDefault();
      onInvalid?.(errors);
    } else {
      onValid?.();
    }
  });
}

/* ------------------- Example Usage ------------------- */
// <form id="signupForm">
//   <label>Email <input type="email" name="email"></label>
//   <label>Password <input type="password" name="password"></label>
//   <label>Age <input type="text" name="age"></label>
//   <button type="submit">Submit</button>
// </form>
//
// import { attachValidation } from './forms.js';
// const form = document.getElementById('signupForm');
// attachValidation(form, {
//   email: [ { rule: 'required', message: 'Email required' }, { rule: 'email', message: 'Invalid email' } ],
//   password: [ { rule: 'required', message: 'Password required' }, { rule: v => v.length>=6, message: 'At least 6 chars' } ],
//   age: [ { rule: 'number', message: 'Age must be number' } ]
// }, {
//   onValid: () => { console.log('Submit ok'); },
//   onInvalid: (errs) => { console.warn('Errors', errs); }
// });

/* ------------------- Extra Helpers ------------------- */
export function clearForm(form){ form.reset(); [...form.querySelectorAll('.err-msg')].forEach(b=>b.textContent=''); }
export function formToJSON(form){ const d={}; new FormData(form).forEach((v,k)=>{ d[k]=v; }); return d; }
export function fillForm(form, data){ for(const [k,v] of Object.entries(data)){ if(form.elements[k]) form.elements[k].value=v??''; } }
