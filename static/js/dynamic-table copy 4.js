// ✅ dynamic-table.js — keyset + autosave + observer+polling fix
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

  let cursor = null;
  let hasMore = true;
  let loading = false;
  let poller = null;

  const table = new Tabulator(mount, {
    layout: "fitColumns",
    height: "600px",
    reactiveData: true,
    index: "id",
    placeholder: "Loading suppliers...",
    columns: [
      ...config.columns,
      {
        title: "Actions",
        field: "_actions",
        hozAlign: "center",
        width: 100,
        headerSort: false,
        formatter: () => `
          <div class="actions">
            <button class="btn-save">💾</button>
            <button class="btn-delete">🗑</button>
          </div>`,
        cellClick: async (e, cell) => {
          const btn = e.target.closest("button");
          if (!btn) return;
          const row = cell.getRow();
          const d = row.getData();
          if (btn.classList.contains("btn-save")) await saveRow(row);
          if (
            btn.classList.contains("btn-delete") &&
            confirm(`Delete "${d.name}"?`)
          )
            await deleteRow(row);
        },
      },
    ],
  });

  async function loadFirst() {
    try {
      loading = true;
      const res = await jfetch(`${ENDPOINTS.keyset}?limit=50`);
      table.setData(res.items || []);
      cursor = res.next_cursor;
      hasMore = res.has_more;
      await waitTableBuilt();
      attachSentinel();
      startPolling();
      await autoFillViewport();
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (loading || !hasMore) return;
    loading = true;
    try {
      const res = await jfetch(`${ENDPOINTS.keyset}?limit=50&cursor=${cursor}`);
      if (Array.isArray(res.items) && res.items.length) {
        table.addData(res.items);
        cursor = res.next_cursor;
        hasMore = res.has_more;
      } else hasMore = false;
    } finally {
      loading = false;
    }
  }

  async function saveRow(row) {
    const d = row.getData();
    const url = d.id ? `${ENDPOINTS.base}/${d.id}` : ENDPOINTS.base;
    const method = d.id ? "PUT" : "POST";
    try {
      const res = await jfetch(url, { method, body: JSON.stringify(d) });
      row.update(res);
      toast("Saved");
    } catch (e) {
      toast("Save failed: " + e.message, false);
    }
  }

  async function deleteRow(row) {
    const d = row.getData();
    try {
      await jfetch(`${ENDPOINTS.base}/${d.id}`, { method: "DELETE" });
      row.delete();
      toast("Deleted");
    } catch (err) {
      toast("Delete failed: " + err.message, false);
    }
  }

  // === Sentinel + Observer ===
  function attachSentinel() {
    const holder = mount.querySelector(".tabulator-tableholder");
    if (!holder) return;
    let sentinel = document.getElementById("lazy-sentinel");
    if (!sentinel) {
      sentinel = document.createElement("div");
      sentinel.id = "lazy-sentinel";
      sentinel.style.height = "1px";
      holder.appendChild(sentinel);
    }
    const ob = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    });
    ob.observe(sentinel);
  }

  // === Polling fallback ===
  function startPolling() {
    if (poller) clearInterval(poller);
    poller = setInterval(() => {
      if (!hasMore || loading) return;
      const holder = mount.querySelector(".tabulator-tableholder");
      if (!holder) return;
      const nearBottom =
        holder.scrollTop + holder.clientHeight >= holder.scrollHeight - 60;
      if (nearBottom) loadMore();
    }, 700);
  }

  function waitTableBuilt() {
    return new Promise((resolve) => {
      if (mount.querySelector(".tabulator-tableholder")) return resolve();
      table.on("tableBuilt", () => requestAnimationFrame(resolve));
    });
  }

  async function autoFillViewport() {
    const holder = mount.querySelector(".tabulator-tableholder");
    let loops = 0;
    while (
      hasMore &&
      holder.scrollHeight <= holder.clientHeight + 10 &&
      loops < 8
    ) {
      await loadMore();
      loops++;
    }
  }

  // === Add Row ===
  window.addNewRow = async function () {
    try {
      const next = await jfetch(ENDPOINTS.nextCode);
      const code = next?.next_code || "AUTO";
      const payload = {
        code,
        name: "New Supplier",
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
      table.addRow(created, true);
    } catch (e) {
      toast("Add failed: " + e.message, false);
    }
  };

  loadFirst();
  return table;
}
