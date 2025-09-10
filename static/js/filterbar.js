// /static/js/filterbar.js
export function bindFilterBar(lp, {
  searchInput,               // <input>
  perPageSelect,             // <select>
  filters = {},              // { statusSelect: {key:'status', el:HTMLElement} }
  debounceMs = 300,
}) {
  lp.bindSearch?.(searchInput, { debounceMs });
  lp.bindPerPage?.(perPageSelect);

  const unsubs = [];
  Object.values(filters||{}).forEach(({ key, el }) => {
    if (!key || !el) return;
    const h = () => lp.setFilters({ [key]: el.value });
    el.addEventListener('change', h);
    unsubs.push(() => el.removeEventListener('change', h));
  });

  return () => { unsubs.forEach(fn => fn()); };
}
