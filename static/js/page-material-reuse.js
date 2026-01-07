import { $, toast } from "../api.js";
import { createAutosaveTable } from "../core/autosave-table.js";

const UI = { q: "_q", btnAdd: "_add", tableMount: "listBody" };

document.addEventListener("DOMContentLoaded", () => {
  const { table, loadAll, addEmptyRow } = createAutosaveTable({
    mountId: UI.tableMount,
    endpoints: { base: "/materials" },

    columns: [
      { title: "Code", field: "code", editor: "input", width: 110 },
      { title: "Name", field: "name", editor: "input", validator: "required" },
      { title: "Spec", field: "spec", editor: "input" },
      { title: "UoM", field: "uom", editor: "input", hozAlign: "center" },
      { title: "Remark", field: "remark", editor: "input" },
    ],

    normalizeRow: (r) => ({
      id: r.id ?? null,
      code: r.code ?? "",
      name: r.name ?? "",
      spec: r.spec ?? "",
      uom: r.uom ?? "",
      remark: r.remark ?? "",
    }),

    buildPayload: (r) => ({
      code: r.code?.toUpperCase() || null,
      name: r.name?.trim() || null,
      spec: r.spec?.trim() || null,
      uom: r.uom?.trim() || null,
      remark: r.remark?.trim() || null,
    }),

    validateRow: (row, cell) => {
      if (cell.getField() === "name" && !row.name) {
        toast("Name required", false);
        return false;
      }
      return true;
    },
  });

  $(UI.q)?.addEventListener("input", (e) => loadAll(e.target.value));
  $(UI.btnAdd)?.addEventListener("click", () =>
    addEmptyRow({ code: "", name: "", spec: "", uom: "", remark: "" })
  );

  loadAll();
});
