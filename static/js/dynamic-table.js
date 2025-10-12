// ✅ dynamic-table.js — keyset lazy-load + autosave + Undo/Redo + Tab nav + polling fallback
import { jfetch, toast } from "./api.js";

export function initDynamicTable(config) {
  const mount =
    document.querySelector("#table") || document.querySelector("#listBody");
  if (!mount) return console.error("❌ No table element found");

  const ENDPOINTS = {
    base: config.apiBase, // e.g. /api/v1/suppliers/suppliers
    keyset: config.apiKeyset, // e.g. /api/v1/suppliers/keyset
    nextCode: config.apiNextCode, // e.g. /api/v1/suppliers/next-code
  };

  /* ===== Keyset State ===== */
  let cursor = null;
  let hasMore = true;
  let loading = false;
  let poller = null;

  /* ===== Autosave (debounce per-row) ===== */
  const patchTimers = new Map();
  const PATCH_DEBOUNCE_MS = 350;

  /* ===== Helpers: Tab navigation ===== */
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
    placeholder: "Loading suppliers...",
    history: true, // ✅ เปิด Undo/Redo
    historySize: 500, // buffer กว้างพอ
    columns: [
      ...config.columns.map((c) => ({ ...c, editor: c.editor ?? "input" })), // inline edit ทุกคอลัมน์ตาม config
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
          if (confirm(`Delete "${d.name || d.code || d.id}" ?`))
            await deleteRow(row);
        },
      },
    ],
  });

  /* ===== Lazy-load: first page ===== */
  async function loadFirst() {
    try {
      loading = true;
      const res = await jfetch(`${ENDPOINTS.keyset}?limit=50`);
      table.setData(res.items || []);
      cursor = res.next_cursor;
      hasMore = !!res.has_more;
      await waitTableBuilt();
      attachSentinel();
      startPolling(); // ✅ polling fallback
      await autoFillViewport(); // preload ให้เต็มหน้าจอ
    } catch (e) {
      toast("Load failed: " + e.message, false);
    } finally {
      loading = false;
    }
  }

  /* ===== Lazy-load: next page ===== */
  async function loadMore() {
    if (loading || !hasMore) return;
    loading = true;
    try {
      const qs = new URLSearchParams({
        limit: "50",
        cursor: String(cursor ?? ""),
      });
      const res = await jfetch(`${ENDPOINTS.keyset}?${qs}`);
      if (Array.isArray(res.items) && res.items.length) {
        table.addData(res.items);
        cursor = res.next_cursor;
        hasMore = !!res.has_more;
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.warn("Lazy load failed:", e);
    } finally {
      loading = false;
    }
  }

  /* ===== Autosave (PUT/POST) ===== */
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
        row.update(res); // sync server truth
        toast(`💾 Saved ${res.name || res.code || res.id}`);
      } catch (e) {
        toast("Save failed: " + e.message, false);
      }
    }, PATCH_DEBOUNCE_MS);
    patchTimers.set(row, t);
  });

  async function deleteRow(row) {
    const d = row.getData();
    if (!d?.id) {
      row.delete();
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

  /* ===== Sentinel + Observer ===== */
  function attachSentinel() {
    const holder =
      mount.querySelector(".tabulator-tableholder") ||
      mount.querySelector(".tabulator-tableHolder") || // บางธีมใช้ H ใหญ่
      null;
    if (!holder) return;

    let sentinel = document.getElementById("lazy-sentinel");
    if (!sentinel) {
      sentinel = document.createElement("div");
      sentinel.id = "lazy-sentinel";
      sentinel.style.cssText = "height:1px;width:100%";
      holder.appendChild(sentinel);
    }

    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root: holder, rootMargin: "120px 0px", threshold: 0 }
    );
    ob.observe(sentinel);
  }

  /* ===== Polling fallback (กัน IO พลาด) ===== */
  function startPolling() {
    if (poller) clearInterval(poller);
    poller = setInterval(() => {
      if (!hasMore || loading) return;
      const holder =
        mount.querySelector(".tabulator-tableholder") ||
        mount.querySelector(".tabulator-tableHolder");
      if (!holder) return;
      const nearBottom =
        holder.scrollTop + holder.clientHeight >= holder.scrollHeight - 60;
      if (nearBottom) loadMore();
    }, 600); // ✅ ทุก 600 ms
  }

  /* ===== Wait table DOM ready ===== */
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

  /* ===== Preload to fill viewport ===== */
  async function autoFillViewport(maxLoops = 8) {
    let loops = 0;
    const holder =
      mount.querySelector(".tabulator-tableholder") ||
      mount.querySelector(".tabulator-tableHolder");
    if (!holder) return;
    while (
      hasMore &&
      holder.scrollHeight <= holder.clientHeight + 10 &&
      loops < maxLoops
    ) {
      await loadMore();
      loops += 1;
    }
  }

  /* ===== Tab Navigation (per-cell) ===== */
  table.on("cellEditing", (cell) => {
    // ใส่ keydown handler ให้ input ใน cell ที่กำลังแก้
    setTimeout(() => {
      const input = cell
        .getElement()
        ?.querySelector("input, textarea, [contenteditable='true']");
      if (!input) return;
      const handler = (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          focusSiblingEditable(cell, e.shiftKey ? -1 : +1);
        }
      };
      input.addEventListener("keydown", handler);
      input.addEventListener(
        "blur",
        () => input.removeEventListener("keydown", handler),
        { once: true }
      );
    }, 0);
  });

  /* ===== System-wide shortcuts: Undo/Redo (Ctrl/Cmd+Z/Y) ===== */
  document.addEventListener("keydown", (e) => {
    if (!table) return;

    const tag = (document.activeElement?.tagName || "").toLowerCase();
    const inEditable =
      /(input|textarea)/.test(tag) || document.activeElement?.isContentEditable;
    const isEditingCell = !!document.querySelector(
      ".tabulator-cell.tabulator-editing"
    );

    const k = e.key.toLowerCase();

    // Alt shortcuts work always
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        table.undo();
        return;
      }
      if (k === "z" && e.shiftKey) {
        e.preventDefault();
        table.redo();
        return;
      }
    }

    // Ctrl/Cmd when not typing in editor
    if (
      (e.ctrlKey || e.metaKey) &&
      !e.altKey &&
      !(inEditable || isEditingCell)
    ) {
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        table.undo();
        return;
      }
      if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        table.redo();
        return;
      }
    }
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
      // สร้างบน server ก่อนเพื่อให้ได้ id แล้วค่อย addRow
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const row = await table.addRow(created, true);
      row.getCell("name")?.edit(true); // focus ช่องแรก
      toast("Added");
    } catch (e) {
      toast("Add failed: " + e.message, false);
    }
  };

  /* ===== Boot ===== */
  loadFirst();
  return table;
}
