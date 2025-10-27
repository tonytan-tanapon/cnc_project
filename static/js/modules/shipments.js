console.log("manage-shipments-reuse.js loaded");

import { ManagedTable } from "./core/table.js";
import { ENDPOINTS, normalize, buildPayload } from "./shipments.js";

// document.addEventListener("DOMContentLoaded", () => {
//   const columns = [
//     { title: "PO No", field: "po_number", width: 150 },
//     { title: "Ship To", field: "ship_to", editor: "input" },
//     { title: "Carrier", field: "carrier", editor: "input" },
//     { title: "Shipped At", field: "shipped_at", formatter: "datetime" },
//   ];
//   new ManagedTable({
//     mount: "#listBody",
//     columns,
//     endpoint: ENDPOINTS,
//     normalize,
//     buildPayload,
//   });
// });
