import { jfetch, toast } from "./api.js";

/**
 * Normalize record according to entity
 * Pass a function (normalizeFn) per page
 */
export function buildAutosaveHandlers({
  endpoint,
  normalizeFn,
  buildPayloadFn,
  requiredField = "name",
  debounceMs = 400,
}) {
  const patchTimers = new WeakMap();
  const createInFlight = new WeakSet();

  async function autosaveCell(cell, opts = {}) {
    const { fromHistory = false, revert } = opts;
    const row = cell.getRow();
    const d = row.getData();
    const field = cell.getField();
    const oldVal = fromHistory ? undefined : cell.getOldValue();
    const newVal = cell.getValue();

    // Required field validation
    if (field === requiredField && !String(newVal || "").trim()) {
      toast(`${requiredField} required`, false);
      if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
      else if (typeof revert === "function") revert();
      return;
    }

    const payload = buildPayloadFn(d);

    // CREATE
    if (!d.id) {
      if (!payload[requiredField]) return;
      if (createInFlight.has(row)) return;
      createInFlight.add(row);
      try {
        const created = await jfetch(endpoint, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const norm = normalizeFn(created || d);
        row.update({ ...norm });
        toast(`Created "${norm[requiredField]}"`);
      } catch (e) {
        if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
        else if (typeof revert === "function") revert();
        toast(e?.message || "Create failed", false);
      } finally {
        createInFlight.delete(row);
      }
      return;
    }

    // UPDATE (debounced)
    if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));
    const t = setTimeout(async () => {
      patchTimers.delete(row);
      try {
        const updated = await jfetch(`${endpoint}/${encodeURIComponent(d.id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        const norm = normalizeFn(updated || d);
        row.update({ ...d, ...norm, id: norm.id ?? d.id });
        toast(`Saved "${norm[requiredField]}"`);
      } catch (e) {
        if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
        else if (typeof revert === "function") revert();
        toast(e?.message || "Save failed", false);
      }
    }, debounceMs);
    patchTimers.set(row, t);
  }

  async function deleteRow(row) {
    const d = row.getData();
    if (!d.id) {
      row.delete();
      return;
    }
    if (!confirm("Delete this record?")) return;
    try {
      await jfetch(`${endpoint}/${encodeURIComponent(d.id)}`, { method: "DELETE" });
      row.delete();
      toast("Deleted");
    } catch (e) {
      toast(e?.message || "Delete failed", false);
    }
  }

  return { autosaveCell, deleteRow };
}
