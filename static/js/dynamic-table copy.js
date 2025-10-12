// ✅ dynamic-table.js — Lazy load + Edit/Save/Cancel + Enter/Esc fix
console.log("✅ dynamic-table.js (lazy load + edit/save/cancel/fix) loaded");

export function initDynamicTable(config) {
  const editingRows = new Set();

  const table = new Tabulator("#table", {
    ajaxURL: config.apiKeyset || config.apiPage || config.apiBase,
    ajaxConfig: "GET",
    layout: "fitColumns",
    pagination: false, // lazy-load ใช้ keyset ไม่ใช่ pagination ธรรมดา
    reactiveData: true,
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
            ? `
              <button class="btn-save">💾 Save</button>
              <button class="btn-cancel">✖ Cancel</button>
            `
            : `
              <button class="btn-edit">✏️ Edit</button>
              <button class="btn-delete">🗑 Delete</button>
            `;
        },
        cellClick: async (e, cell) => {
          const row = cell.getRow();
          const data = row.getData();
          const id = data.id;
          const btn = e.target.closest("button");
          if (!btn) return;

          if (btn.classList.contains("btn-edit")) {
            startEdit(row);
          } else if (btn.classList.contains("btn-save")) {
            await saveRow(row);
          } else if (btn.classList.contains("btn-cancel")) {
            cancelEdit(row);
          } else if (btn.classList.contains("btn-delete")) {
            if (confirm("Delete this record?")) {
              await deleteRow(row);
            }
          }
        },
      },
    ],

    ajaxResponse: function (url, params, response) {
      if (response?.items) return response.items;
      if (Array.isArray(response)) return response;
      return [];
    },
  });

  // 🔹 Start editing a row
  function startEdit(row) {
    const id = row.getData().id;
    editingRows.add(id);
    row.getCells().forEach((cell) => {
      const field = cell.getColumn().getField();
      if (field && field !== "_actions") {
        cell.getColumn().updateDefinition({ editor: "input" });
      }
    });
    row.getElement().classList.add("row-edited");
    refreshActions(row);

    // focus first editable cell
    const firstEditable = row
      .getCells()
      .find((c) => c.getColumn().getDefinition().editor);
    if (firstEditable) firstEditable.edit(true);
  }

  // 🔹 Save row changes
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
      editingRows.delete(id);
      row.getElement().classList.remove("row-edited");

      // ✅ ปิดโหมด input ทุกช่อง
      row.getCells().forEach((cell) => {
        const col = cell.getColumn();
        const field = col.getField();
        if (field && field !== "_actions") {
          col.updateDefinition({ editor: false });
        }
      });
      refreshActions(row);
      console.log(`✅ Saved row ${id}`);
    } catch (err) {
      alert("Save failed: " + err.message);
    }
  }

  // 🔹 Cancel edit and reload original data
  async function cancelEdit(row) {
    const id = row.getData().id;
    editingRows.delete(id);
    row.getElement().classList.remove("row-edited");

    try {
      const res = await fetch(`${config.apiBase}/${id}`);
      if (res.ok) {
        const original = await res.json();
        row.update(original);
      }
    } catch (err) {
      console.warn("Failed to reload row:", err);
    }

    // disable editors
    row.getCells().forEach((cell) => {
      const col = cell.getColumn();
      const field = col.getField();
      if (field && field !== "_actions") {
        col.updateDefinition({ editor: false });
      }
    });

    refreshActions(row);
  }

  // 🔹 Delete row
  async function deleteRow(row) {
    const id = row.getData().id;
    try {
      const res = await fetch(`${config.apiBase}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      row.delete();
      console.log(`🗑 Deleted row ${id}`);
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  }

  // 🔹 Refresh action buttons
  function refreshActions(row) {
    row.update({});
  }

  // 🔹 Add new row
  window.addNewRow = async function () {
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
  };

  // 🔹 Handle Enter & Esc while editing
  table.on("cellEditing", (cell) => {
    const input = cell.getElement().querySelector("input, textarea");
    if (!input) return;

    input.addEventListener("keydown", (e) => {
      const row = cell.getRow();
      if (e.key === "Enter") {
        e.preventDefault();
        saveRow(row);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit(row);
      }
    });
  });

  // 🔹 Double-click to edit row
  table.on("rowDblClick", (e, row) => {
    const id = row.getData().id;
    if (!editingRows.has(id)) startEdit(row);
  });

  // 🔹 Lazy-load (keyset)
  let cursor = null;
  let loading = false;
  let done = false;

  async function loadMore() {
    if (loading || done) return;
    loading = true;

    try {
      const url = cursor
        ? `${config.apiKeyset}?cursor=${cursor}`
        : config.apiKeyset;
      const res = await fetch(url);
      const js = await res.json();

      if (Array.isArray(js.items)) {
        table.addData(js.items);
        cursor = js.next_cursor;
        done = !js.has_more;
      }
    } catch (err) {
      console.error("Lazy load failed:", err);
    } finally {
      loading = false;
    }
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadMore();
  });

  const sentinel = document.createElement("div");
  sentinel.className = "sentinel";
  sentinel.style.height = "1px";
  document.querySelector(".tabulator-tableholder")?.appendChild(sentinel);
  observer.observe(sentinel);

  return table;
}
