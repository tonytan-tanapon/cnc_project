import { jfetch, toast } from "../api.js";

/**
 * createAutosaveTable(config)
 */
export function createAutosaveTable({
  mountId,
  endpoints,
  columns,
  normalizeRow,
  buildPayload,
  validateRow,
  ui,
  fetchStrategy = "auto",
  pagedPerPage = 100,
}) {
  const createInFlight = new WeakSet();
  const patchTimers = new Map();
  const PATCH_DEBOUNCE_MS = 350;

  let table = new Tabulator(`#${mountId}`, {
    layout: "fitColumns",
    height: "100%",
    columns,
    index: "id",
    history: true,
    reactiveData: true,
    placeholder: "No data",
  });

  /* ---------- AUTOSAVE ---------- */
  async function autosaveCell(cell, opts = {}) {
    const { fromHistory = false, revert } = opts;
    const row = cell.getRow();
    const data = row.getData();

    if (validateRow && !validateRow(data, cell)) {
      if (revert) revert();
      return;
    }

    const payload = buildPayload(data);

    // CREATE
    if (!data.id) {
      if (createInFlight.has(row)) return;
      createInFlight.add(row);

      try {
        const created = await jfetch(endpoints.base, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        row.update(normalizeRow(created));
        toast("Created");
      } catch (e) {
        revert?.();
        toast(e.message || "Create failed", false);
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
          const updated = await jfetch(
            `${endpoints.base}/${encodeURIComponent(data.id)}`,
            { method: "PATCH", body: JSON.stringify(payload) }
          );
          row.update(normalizeRow(updated));
          toast("Saved");
        } catch (e) {
          revert?.();
          toast(e.message || "Save failed", false);
        }
      }, PATCH_DEBOUNCE_MS)
    );
  }

  /* ---------- EVENTS ---------- */
  table.on("cellEdited", autosaveCell);

  table.on("historyUndo", (_, cell) =>
    autosaveCell(cell, { fromHistory: true, revert: () => table.redo() })
  );

  table.on("historyRedo", (_, cell) =>
    autosaveCell(cell, { fromHistory: true, revert: () => table.undo() })
  );

  /* ---------- ADD ---------- */
  function addEmptyRow(template) {
    table.addRow(template, true).then((row) => {
      row.getCell(Object.keys(template)[0])?.edit(true);
    });
  }

  /* ---------- LOAD ---------- */
  async function loadAll(keyword = "") {
    const usp = new URLSearchParams(keyword ? { q: keyword } : {});
    const data = await jfetch(`${endpoints.base}?${usp}`);
    table.setData(data.map(normalizeRow));
  }

  return { table, loadAll, addEmptyRow };
}
