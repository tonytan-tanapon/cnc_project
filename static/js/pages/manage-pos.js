console.log("manage-pos.js loaded");

import { ManagedTable } from "../core/tabulator.js";
import { jfetch, toast } from "../core/api.js";
import { ENDPOINTS, normalize, buildPayload, requiredReady } from "../modules/pos.js";
import { attachAutocomplete } from "../core/autocomplete.js";

document.addEventListener("DOMContentLoaded", async () => {
  const columns = [
    { title: "PO No.", field: "po_number", editor: "input" },
    {
      title: "Customer",
      field: "customer_disp",
      editor: "input", // (replace with your autocomplete editor)
    },
    {
      title: "Description",
      field: "description",
      editor: "input",
    },
    { title: "Created", field: "created_at", formatter: "datetime" },
  ];

  const mt = new ManagedTable({
    mount: "#listBody",
    columns,
    endpoint: ENDPOINTS,
    normalize,
    buildPayload,
    requiredReady,
  });
  await mt.loadKeyset();
  // optional: form for new PO
  document
    .getElementById("poForm")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      // handle form with mt.autosaveCell or POST
    });
});
