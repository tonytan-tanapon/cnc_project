// /static/js/exporter.js
export function exportCSV(filename, columns, rows) {
  const header = columns.map(c => `"${(c.title||c.key||'').replaceAll('"','""')}"`).join(',');
  const lines = rows.map(r =>
    columns.map(c => {
      const v = typeof c.value === 'function' ? c.value(r) : r[c.key];
      const s = (v ?? '').toString().replaceAll('"','""');
      return `"${s}"`;
    }).join(',')
  );
  const csv = [header, ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  a.click(); URL.revokeObjectURL(a.href);
}
