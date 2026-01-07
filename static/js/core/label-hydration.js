export async function hydrateLabels({
  rows,
  idField,
  dispField,
  cache,
  fetchByIds,
  makeLabel,
}) {
  const ids = rows
    .map((r) => r[idField])
    .filter((id) => id && !cache.has(Number(id)));

  if (ids.length) {
    await fetchByIds([...new Set(ids)]);
  }

  for (const r of rows) {
    if (!r[dispField] && r[idField]) {
      const obj = cache.get(Number(r[idField]));
      if (obj) r[dispField] = makeLabel(obj);
    }
  }
}
