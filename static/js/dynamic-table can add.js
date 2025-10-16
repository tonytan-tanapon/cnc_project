// ✅ dynamic-table.js — keyset lazy-load + autosave + Undo/Redo (Add/Delete/Cell) + Tab nav + polling fallback + remote sort
import { jfetch, toast } from "./api.js";

export function initDynamicTable(config) {
  const mount =
    document.querySelector("#table") || document.querySelector("#listBody");
  if (!mount) return console.error("❌ No table element found");

  const ENDPOINTS = {
    base: config.apiBase,
    keyset: config.apiKeyset,
    nextCode: config.apiNextCode,
  };

  /* ===== State ===== */
  let cursor = null;
  let hasMore = true;
  let loading = false;
  let sortBy = "id";
  let sortDir = "desc";

  // prevent multiple concurrent fetches
  let observer = null;
  let poller = null;
  let abortController = null;
  let lastQueryKey = "";

  const patchTimers = new Map();
  const PATCH_DEBOUNCE_MS = 350;

  const customUndoStack = [];
  const customRedoStack = [];

  /* ===== Helpers ===== */
  function getEditableFieldsLive(tab) {
    return tab
      .getColumns(true)
      .map((c) => ({ field: c.getField(), def: c.getDefinition() }))
      .filter((c) => c.field && c.def && !!c.def.editor)
      .map((c) => c.field);
  }

  function focusSiblingEditable(cell, dir) {
    const row = cell.getRow();
    const tab = row.getTable();
    const fields = getEditableFieldsLive(tab);
    const curFieldIdx = fields.indexOf(cell.getField());
    if (curFieldIdx === -1) return;
    const rows = tab.getRows();
    const curRowIdx = rows.indexOf(row);

    let nextFieldIdx = curFieldIdx + dir;
    let nextRowIdx = curRowIdx;
    if (nextFieldIdx >= fields.length) {
      nextFieldIdx = 0;
      nextRowIdx = Math.min(curRowIdx + 1, rows.length - 1);
    } else if (nextFieldIdx < 0) {
      nextFieldIdx = fields.length - 1;
      nextRowIdx = Math.max(curRowIdx - 1, 0);
    }

    const targetRow = rows[nextRowIdx];
    if (!targetRow) return;
    const targetCell = targetRow.getCell(fields[nextFieldIdx]);
    if (!targetCell) return;
    targetCell.edit(true);
    const input = targetCell
      .getElement()
      ?.querySelector("input, textarea, [contenteditable='true']");
    if (input) {
      const v = input.value;
      input.focus();
      if (typeof v === "string") input.setSelectionRange(v.length, v.length);
    }
  }

  /* ===== Table ===== */
  const table = new Tabulator(mount, {
    layout: "fitColumns",
    height: "600px",
    reactiveData: true,
    index: "id",
    placeholder: "Loading data...",
    history: true,
    historySize: 500,
    sortMode: "remote",
    columns: [
      ...config.columns.map((c) => ({ ...c, editor: c.editor ?? "input" })),
      {
        title: "Actions",
        field: "_actions",
        width: 92,
        hozAlign: "center",
        headerSort: false,
        formatter: () => `<button class="btn-delete" title="Delete">🗑</button>`,
        cellClick: async (e, cell) => {
          const btn = e.target.closest(".btn-delete");
          if (!btn) return;
          const row = cell.getRow();
          const d = row.getData();
          if (confirm(`Delete "${d.name || d.code || d.id}" ?`)) {
            await deleteRowWithHistory(row);
          }
        },
      },
    ],
  });

  window._activeTable = table;

  /* ===== Sort listener ===== */
  table.on("dataSorting", (sorters) => {
    const s = sorters && sorters[0] ? sorters[0] : { field: "id", dir: "desc" };
    sortBy = s.field || "id";
    sortDir = s.dir || "desc";
    cursor = null;
    hasMore = true;
    loading = false;

    // 🔧 FIX: ใช้ clearData() แทน setData([]) เพื่อไม่ให้เกิด loop
    table.clearData();
    table.clearHistory?.();

    loadFirst(sortBy, sortDir);
  });

  /* ===== Lazy-load with single-flight guard ===== */
  async function loadFirst(sort_by = "id", sort_dir = "desc") {
    const queryKey = `${sort_by}:${sort_dir}`;
    if (loading || lastQueryKey === queryKey) return;
    lastQueryKey = queryKey;
    loading = true;

    try {
      if (abortController) abortController.abort();
      abortController = new AbortController();

      clearInterval(poller);
      if (observer) observer.disconnect();

      const qs = new URLSearchParams({
        limit: "50",
        sort_by,
        sort_dir,
      });
      const res = await jfetch(`${ENDPOINTS.keyset}?${qs}`, {
        signal: abortController.signal,
      });

      table.clearData();
      table.setData(res.items || []);
      cursor = res.next_cursor ?? null;
      hasMore = !!res.has_more;

      await waitTableBuilt();
      attachSentinel();
      await autoFillViewport();
      startPolling();
    } catch (e) {
      if (e.name !== "AbortError") toast("Load failed: " + e.message, false);
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (loading || !hasMore) return;
    loading = true;

    try {
      if (abortController) abortController.abort();
      abortController = new AbortController();

      const qs = new URLSearchParams({
        limit: "50",
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      if (cursor != null) qs.set("cursor", String(cursor));

      const res = await jfetch(`${ENDPOINTS.keyset}?${qs}`, {
        signal: abortController.signal,
      });

      if (Array.isArray(res.items) && res.items.length) {
        table.addData(res.items);
        cursor = res.next_cursor ?? cursor;
        hasMore = !!res.has_more;
      } else {
        hasMore = false;
      }
    } catch (e) {
      if (e.name !== "AbortError") console.warn("Load more failed:", e);
    } finally {
      loading = false;
    }
  }

  /* ===== Sentinel + Polling ===== */
  function attachSentinel() {
    const holder =
      mount.querySelector(".tabulator-tableholder") ||
      mount.querySelector(".tabulator-tableHolder");
    if (!holder) return;

    let sentinel = document.getElementById("lazy-sentinel");
    if (!sentinel) {
      sentinel = document.createElement("div");
      sentinel.id = "lazy-sentinel";
      sentinel.style.cssText = "height:1px;width:100%";
      holder.appendChild(sentinel);
    }

    if (observer) observer.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading && hasMore) {
          loadMore();
        }
      },
      { root: holder, rootMargin: "200px 0px", threshold: 0 }
    );
    observer.observe(sentinel);
  }

  function startPolling() {
    if (poller) clearInterval(poller);
    poller = setInterval(() => {
      if (loading || !hasMore) return;
      const holder =
        mount.querySelector(".tabulator-tableholder") ||
        mount.querySelector(".tabulator-tableHolder");
      if (!holder) return;

      const nearBottom =
        holder.scrollTop + holder.clientHeight >= holder.scrollHeight - 60;
      if (nearBottom) loadMore();
    }, 1500);
  }

  async function autoFillViewport(maxLoops = 4) {
    let loops = 0;
    const holder =
      mount.querySelector(".tabulator-tableholder") ||
      mount.querySelector(".tabulator-tableHolder");
    if (!holder) return;
    while (
      hasMore &&
      holder.scrollHeight <= holder.clientHeight + 20 &&
      loops < maxLoops
    ) {
      await loadMore();
      loops++;
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  function waitTableBuilt() {
    return new Promise((resolve) => {
      if (
        mount.querySelector(".tabulator-tableholder") ||
        mount.querySelector(".tabulator-tableHolder")
      )
        return resolve();
      table.on("tableBuilt", () => requestAnimationFrame(resolve));
    });
  }

  /* ===== Autosave ===== */
  table.on("cellEdited", (cell) => {
    const row = cell.getRow();
    const data = row.getData();
    if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));
    const t = setTimeout(async () => {
      patchTimers.delete(row);
      try {
        const url = data.id
          ? `${ENDPOINTS.base}/${encodeURIComponent(data.id)}`
          : ENDPOINTS.base;
        const method = data.id ? "PUT" : "POST";
        const res = await jfetch(url, { method, body: JSON.stringify(data) });
        row.update(res);
        toast(`💾 Saved ${res.name || res.code || res.id}`);
      } catch (e) {
        toast("Save failed: " + e.message, false);
      }
    }, PATCH_DEBOUNCE_MS);
    patchTimers.set(row, t);
  });

  /* ===== Delete with history ===== */
  async function deleteRowWithHistory(row) {
    const d = row.getData();
    if (!d) return;
    customUndoStack.push({ type: "delete", data: { ...d } });
    customRedoStack.length = 0;
    if (!d.id) {
      row.delete();
      toast("Deleted");
      return;
    }
    try {
      await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(d.id)}`, {
        method: "DELETE",
      });
      row.delete();
      toast("Deleted");
    } catch (e) {
      toast("Delete failed: " + e.message, false);
    }
  }

  /* ===== Tab Navigation ===== */
  table.on("cellEditing", (cell) => {
    setTimeout(() => {
      const input = cell
        .getElement()
        ?.querySelector("input, textarea, [contenteditable='true']");
      if (!input) return;
      const keyHandler = (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          focusSiblingEditable(cell, e.shiftKey ? -1 : +1);
        } else if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        }
      };
      const blurHandler = () => {
        const current = cell.getValue();
        const val =
          input instanceof HTMLInputElement ||
          input instanceof HTMLTextAreaElement
            ? input.value
            : input.textContent;
        if (val !== current) cell.setValue(val, true);
        input.removeEventListener("keydown", keyHandler);
      };
      input.addEventListener("keydown", keyHandler);
      input.addEventListener("blur", blurHandler, { once: true });
    }, 0);
  });

  /* ===== Add Row ===== */
  window.addNewRow = async function () {
    try {
      const next = ENDPOINTS.nextCode ? await jfetch(ENDPOINTS.nextCode) : null;
      const code = next?.next_code || "AUTO";
      const payload = {
        code,
        name: "",
        contact: "",
        email: "",
        phone: "",
        address: "",
        payment_terms: "",
      };
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const row = await table.addRow(created, true);
      customUndoStack.push({
        type: "add",
        id: created.id,
        data: { ...created },
      });
      customRedoStack.length = 0;
      row.getCell("name")?.edit(true);
      toast("Added");
    } catch (e) {
      toast("Add failed: " + e.message, false);
    }
  };

  /* ===== Undo/Redo Autosave ===== */
  function setupUndoRedoAutosave(tab) {
    let debounceTimer = null;
    const PENDING = new Set();
    async function flush() {
      if (debounceTimer) clearTimeout(debounceTimer);
      const pendingRows = Array.from(PENDING);
      PENDING.clear();
      for (const row of pendingRows) {
        const data =
          row && typeof row.getData === "function" ? row.getData() : null;
        if (!data || !data.id) continue;
        try {
          await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(data.id)}`, {
            method: "PUT",
            body: JSON.stringify(data),
          });
          toast(`🔁 Synced ${data.name || data.code || data.id}`);
        } catch (e) {
          toast("Sync failed: " + e.message, false);
        }
      }
    }
    function schedule(row) {
      if (row) PENDING.add(row);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, 500);
    }
    tab.on("historyUndo", (a) => schedule(a?.component?.getRow?.()));
    tab.on("historyRedo", (a) => schedule(a?.component?.getRow?.()));
  }
  setupUndoRedoAutosave(table);

  /* ===== Custom Undo/Redo for Add/Delete ===== */
  async function customUndo() {
    const entry = customUndoStack.pop();
    if (!entry) return false;
    if (entry.type === "add") {
      const id = entry.id;
      try {
        if (id)
          await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
        table.getRow(id)?.delete();
      } catch {}
      customRedoStack.push(entry);
      toast("Undo add");
      return true;
    }
    if (entry.type === "delete") {
      const data = { ...entry.data };
      let restored = null;
      try {
        if (data.id) {
          restored = await jfetch(
            `${ENDPOINTS.base}/${encodeURIComponent(data.id)}`,
            { method: "PUT", body: JSON.stringify(data) }
          );
        } else {
          restored = await jfetch(ENDPOINTS.base, {
            method: "POST",
            body: JSON.stringify(data),
          });
        }
      } catch {
        restored = await jfetch(ENDPOINTS.base, {
          method: "POST",
          body: JSON.stringify(data),
        });
      }
      await table.addRow(restored || data, true);
      customRedoStack.push(entry);
      toast("Undo delete");
      return true;
    }
    return false;
  }

  async function customRedo() {
    const entry = customRedoStack.pop();
    if (!entry) return false;
    if (entry.type === "add") {
      const data = { ...entry.data };
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        body: JSON.stringify(data),
      });
      await table.addRow(created, true);
      entry.id = created.id;
      customUndoStack.push(entry);
      toast("Redo add");
      return true;
    }
    if (entry.type === "delete") {
      const id = entry.data?.id;
      try {
        if (id)
          await jfetch(`${ENDPOINTS.base}/${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
      } catch {}
      table.getRow(id)?.delete();
      customUndoStack.push(entry);
      toast("Redo delete");
      return true;
    }
    return false;
  }

  /* ===== Keyboard Shortcuts ===== */
  window.addEventListener(
    "keydown",
    async (e) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta || e.altKey) return;
      const active = document.activeElement;
      const tag = (active?.tagName || "").toLowerCase();
      const inEditable =
        /(input|textarea|select)/.test(tag) || active?.isContentEditable;
      const isEditing = !!document.querySelector(
        ".tabulator-cell.tabulator-editing"
      );
      if (inEditable || isEditing) return;
      const t = window._activeTable;
      if (!t) return;
      if (e.code === "KeyZ" && !e.shiftKey) {
        e.preventDefault();
        const handled = await customUndo();
        if (!handled) t.undo();
      } else if (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey)) {
        e.preventDefault();
        const handled = await customRedo();
        if (!handled) t.redo();
      }
    },
    true
  );

  /* ===== Init ===== */
  loadFirst();
  return table;
}
