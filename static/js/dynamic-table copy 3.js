// ✅ dynamic-table.js — Optimized for real-time UX (Tabulator v6)
console.log("⚡ dynamic-table.js (fast edition) loaded");

export function initDynamicTable(config) {
  const editingRows = new Set();
  const originalSnapshots = new Map();

  const table = new Tabulator("#table", {
    ajaxURL: config.apiKeyset || config.apiBase,
    ajaxConfig: "GET",
    layout: "fitColumns",
    reactiveData: true,
    pagination: false,
    placeholder: "No data found",
    height: "100%",
    columns: [
      ...(config.columns || []),
      {
        title: "Actions",
        field: "_actions",
        hozAlign: "center",
        width: 150,
        headerSort: false,
        formatter: (cell) => {
          const row = cell.getRow();
          const id = row.getData().id;
          const isEditing = editingRows.has(id);
          return isEditing
            ? `<button class="btn-save">💾</button>
               <button class="btn-cancel">✖</button>`
            : `<button class="btn-edit">✏️</button>
               <button class="btn-delete">🗑</button>`;
        },
        cellClick: async (e, cell) => {
          const row = cell.getRow();
          const btn = e.target.closest("button");
          if (!btn) return;
          if (btn.classList.contains("btn-edit")) startEdit(row);
          else if (btn.classList.contains("btn-save")) await saveRow(row, btn);
          else if (btn.classList.contains("btn-cancel")) cancelEdit(row);
          else if (btn.classList.contains("btn-delete")) {
            if (confirm("Delete this record?")) await deleteRow(row);
          }
        },
      },
    ],
    ajaxResponse: (url, params, res) => res?.items ?? res ?? [],
  });

  // ─── Edit ───
  function startEdit(row) {
    const id = row.getData().id;
    if (editingRows.has(id)) return;
    editingRows.add(id);
    originalSnapshots.set(id, { ...row.getData() });
    row.getElement().classList.add("row-edited");
    row.getCells().forEach((c) => {
      const f = c.getColumn().getField();
      if (f && f !== "_actions")
        c.getColumn().updateDefinition({ editor: "input" });
    });
    refreshActions(row);

    const firstEditable = row
      .getCells()
      .find((c) => c.getColumn().getDefinition().editor);
    if (firstEditable) requestAnimationFrame(() => firstEditable.edit(true));
  }

  // ─── Save (optimistic update) ───
  async function saveRow(row, btn) {
    const id = row.getData().id;
    const payload = { ...row.getData() };

    btn.disabled = true;
    btn.textContent = "⏳";

    // optimistic: ปิด editor ทันทีเพื่อความไว
    exitEdit(row, false);

    try {
      const res = await fetch(`${config.apiBase}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      row.update(updated);
      console.log(`✅ Saved ${id}`);
    } catch (err) {
      // revert snapshot ถ้า fail
      const snap = originalSnapshots.get(id);
      if (snap) row.update(snap);
      alert("Save failed: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "💾";
    }
  }

  function cancelEdit(row) {
    const id = row.getData().id;
    const snap = originalSnapshots.get(id);
    if (snap) row.update(snap);
    exitEdit(row);
  }

  function exitEdit(row, clear = true) {
    const id = row.getData().id;
    if (clear) editingRows.delete(id);
    row.getElement().classList.remove("row-edited");
    row.getCells().forEach((cell) => {
      const f = cell.getColumn().getField();
      if (f && f !== "_actions")
        cell.getColumn().updateDefinition({ editor: false });
    });
    refreshActions(row);
  }

  async function deleteRow(row) {
    const id = row.getData().id;
    row.getElement().style.opacity = "0.5";
    try {
      const res = await fetch(`${config.apiBase}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      row.delete();
    } catch (err) {
      alert("Delete failed: " + err.message);
      row.getElement().style.opacity = "1";
    }
  }

  function refreshActions(row) {
    const actionCell = row.getCell("_actions");
    if (actionCell && typeof actionCell.getElement === "function") {
      const el = actionCell.getElement();
      el.innerHTML = actionCell
        .getColumn()
        .getDefinition()
        .formatter(actionCell);
    }
  }

  // ─── Keyboard ───
  table.on("cellEditing", (cell) => {
    const input = cell.getElement().querySelector("input,textarea");
    if (!input || input.dataset.hooked) return;
    input.dataset.hooked = "1";
    input.addEventListener("keydown", (e) => {
      const row = cell.getRow();
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
        saveRow(
          row,
          cell
            .getRow()
            .getCell("_actions")
            .getElement()
            .querySelector(".btn-save")
        );
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit(row);
      }
    });
  });

  // ─── Double click ───
  table.on("cellDblClick", (e, cell) => {
    const row = cell.getRow();
    const field = cell.getColumn().getField();
    if (field === "_actions") return;
    if (!editingRows.has(row.getData().id)) startEdit(row);
    requestAnimationFrame(() => cell.edit(true));
  });

  // ─── Add ───
  async function addNewRow() {
    try {
      const res = await fetch(config.apiNextCode);
      const js = await res.json();
      const code = js.next_code || "AUTO";
      const payload = { code, name: "New Supplier" };
      const createRes = await fetch(config.apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!createRes.ok) throw new Error(await createRes.text());
      const newRow = await createRes.json();
      table.addRow(newRow, true);
    } catch (err) {
      alert("Add failed: " + err.message);
    }
  }

  window.addNewRow = addNewRow;
  return { table, addNewRow };
}
