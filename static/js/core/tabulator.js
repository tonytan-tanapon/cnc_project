import { jfetch, toast } from "./api.js";
import { fmtDate } from "./utils.js";

export class ManagedTable {
  constructor({ mount, columns, endpoint, normalize, buildPayload, requiredReady }) {
    this.endpoint = endpoint;
    this.normalize = normalize;
    this.buildPayload = buildPayload;
    this.requiredReady = requiredReady || (() => true);
    this.JSON_HEADERS = { "Content-Type": "application/json" };
    this.createInFlight = new WeakSet();
    this.patchTimers = new Map();
    this.PATCH_DEBOUNCE_MS = 350;
    this.cursor = null;
    this.ksDone = false;
    this.ksLoading = false;
    this.keyword = "";

    this.table = new Tabulator(mount, {
      layout: "fitColumns",
      height: "100%",
      data: [],
      columns,
      placeholder: "No records",
      reactiveData: true,
      index: "id",
      history: true,
    });

    this.table.on("cellEdited", (cell) => this.autosaveCell(cell));
  }
  async loadKeyset(keyword = "", afterId = null, limit = 200) {
    const url = `${this.endpoint.keyset(
      `q=${encodeURIComponent(keyword)}&limit=${limit}`
    )}`;
    const res = await jfetch(url);
    const items = Array.isArray(res) ? res : res.items ?? [];
    const rows = items.map(this.normalize);
    this.table.setData(rows);
  }
  async autosaveCell(cell) {
    const row = cell.getRow();
    const d = row.getData();
    const payload = this.buildPayload(d);

    if (!d.id) {
      if (!this.requiredReady(d)) return;
      if (this.createInFlight.has(row)) return;
      this.createInFlight.add(row);
      try {
        const created = await jfetch(this.endpoint.base, {
          method: "POST",
          headers: this.JSON_HEADERS,
          body: JSON.stringify(payload),
        });
        row.update(this.normalize(created));
        toast("Created");
      } catch (e) {
        toast(e.message || "Create failed", false);
      } finally {
        this.createInFlight.delete(row);
      }
      return;
    }

    if (this.patchTimers.has(row)) clearTimeout(this.patchTimers.get(row));
    const t = setTimeout(async () => {
      try {
        const updated = await jfetch(this.endpoint.byId(d.id), {
          method: "PATCH",
          headers: this.JSON_HEADERS,
          body: JSON.stringify(payload),
        });
        row.update(this.normalize(updated));
        toast("Saved");
      } catch (e) {
        toast(e.message || "Save failed", false);
      }
    }, this.PATCH_DEBOUNCE_MS);
    this.patchTimers.set(row, t);
  }

  async deleteRow(row) {
    const d = row.getData();
    if (!d.id) return row.delete();
    if (!confirm(`Delete ${d.id}?`)) return;
    await jfetch(this.endpoint.byId(d.id), { method: "DELETE" });
    row.delete();
    toast("Deleted");
  }
}
