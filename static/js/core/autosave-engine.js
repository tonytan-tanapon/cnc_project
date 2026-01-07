export function createAutosaveEngine({
  tableRef,
  endpoints,
  buildCreatePayload,
  buildUpdatePayload,
  normalizeRow,
  requiredReady,
  onCreateSuccess,
  onUpdateSuccess,
  suppressSet,
  debounceMs = 350,
}) {
  const createInFlight = new WeakSet();
  const patchTimers = new Map();

  async function autosaveCell(cell, opts = {}) {
    const { fromHistory = false, revert } = opts;
    const row = cell.getRow();
    if (suppressSet?.has(row)) return;

    const d = row.getData();

    // CREATE
    if (!d.id) {
      if (!requiredReady(d)) return;
      if (createInFlight.has(row)) return;

      createInFlight.add(row);
      try {
        const created = await jfetch(endpoints.base, {
          method: "POST",
          body: JSON.stringify(buildCreatePayload(d)),
        });
        const norm = normalizeRow(created);
        onCreateSuccess?.(row, norm, d);
      } catch (e) {
        revert?.();
        throw e;
      } finally {
        createInFlight.delete(row);
      }
      return;
    }

    // UPDATE (debounced)
    clearTimeout(patchTimers.get(row));
    patchTimers.set(
      row,
      setTimeout(async () => {
        try {
          const updated = await jfetch(endpoints.byId(d.id), {
            method: "PATCH",
            body: JSON.stringify(buildUpdatePayload(d)),
          });
          const norm = normalizeRow(updated);
          onUpdateSuccess?.(row, norm, d);
        } catch (e) {
          revert?.();
          throw e;
        }
      }, debounceMs)
    );
  }

  return { autosaveCell };
}
