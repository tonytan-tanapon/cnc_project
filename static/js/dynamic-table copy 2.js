// ✅ dynamic-table.js — for Tabulator v6.x
console.log("✅ dynamic-table.js (stable) loaded");

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
          else if (btn.classList.contains("btn-save")) await saveRow(row);
          else if (btn.classList.contains("btn-cancel")) cancelEdit(row);
          else if (btn.classList.contains("btn-delete")) {
            if (confirm("Delete this record?")) await deleteRow(row);
          }
        },
      },
    ],
    ajaxResponse: (url, params, res) => res?.items ?? res ?? [],
  });

  // ─── edit ───
  function startEdit(row) {
    const id = row.getData().id;
    if (editingRows.has(id)) return;
    editingRows.add(id);
    originalSnapshots.set(id, { ...row.getData() });
    row.getElement().classList.add("row-edited");

    row.getCells().forEach((cell) => {
      const field = cell.getColumn().getField();
      if (field && field !== "_actions") {
        cell.getColumn().updateDefinition({ editor: "input" });
      }
    });

    refreshActions(row);

    const firstEditable = row
      .getCells()
      .find((c) => c.getColumn().getDefinition().editor);
    if (firstEditable) firstEditable.edit(true);
  }

  async function saveRow(row) {
    const id = row.getData().id;
    const payload = { ...row.getData() };
    try {
      const res = await fetch(`${config.apiBase}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      row.update(updated);
      originalSnapshots.delete(id);
      exitEdit(row);
      console.log(`✅ Saved ${id}`);
    } catch (err) {
      alert("Save failed: " + err.message);
    }
  }

  function cancelEdit(row) {
    const id = row.getData().id;
    const snap = originalSnapshots.get(id);
    if (snap) row.update(snap);
    exitEdit(row);
  }

  function exitEdit(row) {
    const id = row.getData().id;
    editingRows.delete(id);
    row.getElement().classList.remove("row-edited");
    row.getCells().forEach((cell) => {
      const field = cell.getColumn().getField();
      if (field && field !== "_actions") {
        cell.getColumn().updateDefinition({ editor: false });
      }
    });
    refreshActions(row);
  }

  async function deleteRow(row) {
    const id = row.getData().id;
    try {
      const res = await fetch(`${config.apiBase}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      row.delete();
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  }

  function refreshActions(row) {
    if (typeof row.reformat === "function") row.reformat();
    else row.update({});
  }

  // ─── keyboard ───
  table.on("cellEditing", (cell) => {
    const input = cell.getElement().querySelector("input,textarea");
    if (!input || input.dataset.hooked) return;
    input.dataset.hooked = "1";
    input.addEventListener("keydown", (e) => {
      const row = cell.getRow();
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
        setTimeout(() => saveRow(row), 0);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit(row);
      }
    });
  });

  table.on("cellDblClick", (e, cell) => {
    const row = cell.getRow();
    const field = cell.getColumn().getField();
    if (field === "_actions") return;
    if (!editingRows.has(row.getData().id)) startEdit(row);
    setTimeout(() => cell.edit(true), 20);
  });

  // ─── add ───
  async function addNewRow() {
    try {
      const res = await fetch(config.apiNextCode);
      const js = await res.json();
      const code = js.next_code || "AUTO";
      const payload = {
        code,
        name: "New Supplier",
        contact: "",
        email: "",
        phone: "",
        address: "",
        payment_terms: "",
      };
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
