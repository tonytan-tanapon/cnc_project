import { jfetch } from "./api.js";
import { attachAutocomplete } from "./autocomplete.js";
const ENDPOINT = "/material-traceability";
const lotId = new URLSearchParams(location.search).get("lot_id");

let table;
let batchOptions = [];
let toastTimer;

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");

  document.getElementById("toastText").textContent = message;

  toast.style.background =
    type === "success" ? "#1f2937" : "#991b1b";

  toast.style.display = "block";

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.display = "none";
  }, 3500);
}

function button(text, className = "") {
  const el = document.createElement("button");

  el.type = "button";
  el.className = `btn ${className}`;
  el.textContent = text;

  return el;
}

function makeColumns() {
  return [
    {
      title: "QR Download",
      width: 145,
      hozAlign: "center",

      formatter() {
        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.gap = "6px";

        container.append(
          button("4", "qr4"),
          button("30", "qr30")
        );

        return container;
      },

      async cellClick(e, cell) {
        const target = e.target.closest("button");
        if (!target) return;

        const qty = target.classList.contains("qr30") ? 30 : 4;
        const row = cell.getRow().getData();

        try {
          const response = await fetch(
            `/api/v1${ENDPOINT}/export-docx/` +
            `${row.lot_material_use_id}?qty=${qty}`
          );

          if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
          }

          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");

          link.href = url;
          link.download = `qr_${qty}.docx`;

          document.body.appendChild(link);
          link.click();
          link.remove();

          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
          console.error(error);
          showToast("Failed to download QR document", "danger");
        }
      }
    },
    {
      title: "QR",
      field: "lot_material_use_id",
      width: 110,
      hozAlign: "center",

      formatter(cell) {
        const img = document.createElement("img");

        img.src =
          `/api/v1${ENDPOINT}/qr/` +
          encodeURIComponent(cell.getValue());

        img.alt = "Material QR code";
        img.style.width = "80px";
        img.style.height = "80px";
        img.style.cursor = "pointer";

        return img;
      },

      cellClick(e, cell) {
        window.open(
          `/api/v1${ENDPOINT}/qr/` +
          encodeURIComponent(cell.getValue()),
          "_blank",
          "noopener"
        );
      }
    },
  
    {
      title: "Mat PO",
      field: "batch_no",
      width: 100
    },
    {
      title: "Type",
      field: "material_type",
      width: 100
    },
    {
      title: "Spec",
      field: "material_spec",
      width: 200
    },
    {
      title: "Supplier",
      field: "supplier_name",
      width: 180
    },
    {
      title: "Heat Lot",
      field: "heat_lot",
      width: 130
    },
    {
      title: "Size",
      field: "size_text",
      width: 100
    },

    {
      title: "Cutting Note",
      field: "cutting_note",
      minWidth: 160,
      formatter: "textarea"
    },
    {
      title: "PO Note",
      field: "po_note",
      minWidth: 250,
      formatter: "textarea"
    },

    {
      title: "Delete",
      width: 85,
      hozAlign: "center",

      formatter() {
        return button("Delete", "delete-material");
      },

      async cellClick(e, cell) {
        if (!e.target.closest(".delete-material")) return;

        const row = cell.getRow().getData();

        if (!confirm(
          `Remove this material allocation from Lot ${row.lot_no}?`
        )) {
          return;
        }

        try {
          await jfetch(
            `${ENDPOINT}/lot-material-use/${row.lot_material_use_id}`,
            { method: "DELETE" }
          );
        } catch (error) {
          console.error(error);
          showToast("Failed to remove allocation", "danger");
          return;
        }

        showToast("Material allocation removed");
        await loadData();
      }
    }
  ];
}

async function loadData() {
  if (!lotId || !/^\d+$/.test(lotId) || Number(lotId) <= 0) {
    showToast("Missing or invalid lot_id", "danger");
    return;
  }

  try {
    const rows = await jfetch(
      `${ENDPOINT}?lot_id=${encodeURIComponent(lotId)}`
    );

    await table.setData(rows);
  } catch (error) {
    console.error(error);
    showToast("Failed to load material allocations", "danger");
  }
}

async function loadBatchOptions() {
  batchOptions = await jfetch(`${ENDPOINT}/batch-options`);

  // Reuse the existing Batch No input as an existing-batch selector.
  const input = document.getElementById("batchNoInput");
  input.placeholder = "Search and select an existing batch…";

  const datalist = document.createElement("datalist");
  datalist.id = "allocationBatchOptions";

  for (const item of batchOptions) {
    const option = document.createElement("option");
    option.value = item.label;
    datalist.appendChild(option);
  }

  document.body.appendChild(datalist);
  input.setAttribute("list", datalist.id);
}

function bindAddBatch() {
  const saveButton = document.getElementById("btnSaveBatch");
  const input = document.getElementById("batchNoInput");

  saveButton.textContent = "+ Add Batch";

  saveButton.addEventListener("click", async () => {
    const batch = batchOptions.find(
      item => item.label === input.value.trim()
    );

    if (!batch) {
      showToast("Please select a valid existing batch", "danger");
      return;
    }

    saveButton.disabled = true;

    try {
      await jfetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          lot_id: Number(lotId),
          batch_id: batch.value
        })
      });

      input.value = "";
      showToast("Material allocation added");

      await loadData();
    } catch (error) {
      console.error(error);
      showToast("Failed to add material allocation", "danger");
    } finally {
      saveButton.disabled = false;
    }
  });
}
let currentPartId = null;
let partMaterials = [];
let pendingSelectedMaterial = null;

function makeLotLinks() {
  const id = encodeURIComponent(lotId);

  const links = [
    ["lot_link", `/static/lot-detail.html?lot_id=${id}`],
    ["material_link", `/static/manage-lot-materials.html?lot_id=${id}`],
    ["traveler_link", `/static/traveler-detail.html?lot_id=${id}`],
    ["shippment_link", `/static/manage-lot-shippments.html?lot_id=${id}`]
  ];

  for (const [elementId, href] of links) {
    const container = document.getElementById(elementId);
    if (!container) continue;

    const link = document.createElement("a");
    link.href = href;
    link.textContent = container.textContent;
    link.style.textDecoration = "none";
    link.style.color = "inherit";

    container.replaceChildren(link);
  }
}

async function loadLotHeader() {
  const container = document.getElementById("lotHeader");

  try {
    const lot = await jfetch(
      `/api/v1/lot-uses/lot/${encodeURIComponent(lotId)}/header`
    );

    currentPartId = lot.part?.part_id ?? null;

    const fields = [
      ["Lot No", lot.lot_no],
      ["Part No", lot.part?.part_no],
      ["Revision", lot.revision],
      ["Planned Qty", lot.planned_qty],
      ["Status", lot.status],
      ["PO", lot.po]
    ];

    container.replaceChildren();

    for (const [label, value] of fields) {
      const item = document.createElement("div");
      const heading = document.createElement("b");

      heading.textContent = `${label}: `;
      item.append(
        heading,
        document.createTextNode(String(value ?? "-"))
      );

      container.appendChild(item);
    }

    return true;
  } catch (error) {
    console.error("Failed to load lot header:", error);
    container.textContent = "Failed to load lot information.";
    showToast("Failed to load lot information", "danger");

    return false;
  }
}

async function loadPartMaterials() {
  if (!currentPartId) return;

  try {
    const response = await jfetch(
      `/parts/${currentPartId}/materials`
    );

    partMaterials = Array.isArray(response)
      ? response
      : response?.items ?? [];

    renderMaterialChips();
  } catch (error) {
    console.error(error);
    showToast("Failed to load part materials", "danger");
  }
}

function renderMaterialChips() {
  const container = document.getElementById("mat_list");
  container.replaceChildren();

  if (!partMaterials.length) {
    container.textContent = "No materials yet.";
    return;
  }

  for (const material of partMaterials) {
    const chip = document.createElement("span");
    chip.className = "chip--pill";

    const label = document.createElement("span");
    label.textContent = material.name ?? material.code ?? "";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "x";
    remove.textContent = "×";
    remove.title = "Remove material from this part";
    remove.style.border = "none";
    remove.style.background = "transparent";

    remove.addEventListener("click", async () => {
      if (!confirm(
        `Remove ${label.textContent} from this part?`
      )) return;

      remove.disabled = true;

      try {
        await jfetch(
          `/parts/${currentPartId}/materials/${material.id}`,
          { method: "DELETE" }
        );

        showToast("Part material removed");
        await loadPartMaterials();
      } catch (error) {
        console.error(error);
        showToast("Failed to remove material", "danger");
      } finally {
        remove.disabled = false;
      }
    });

    chip.append(label, remove);
    container.appendChild(chip);
  }
}

function initMaterialAutocomplete() {
  const input = document.getElementById("mat_ac_input");
  const addButton = document.getElementById("mat_add_btn");

  const displayValue = material =>
    material.code
      ? `${material.code} — ${material.name ?? ""}`
      : material.name ?? "";

  async function fetchItems(query) {
    const response = await jfetch(
      `/lookups/materials?q=${encodeURIComponent(query || "")}`
    );

    return Array.isArray(response)
      ? response
      : response?.items ?? [];
  }

  // Register before autocomplete so selecting an item can set it again.
  input.addEventListener("input", () => {
    pendingSelectedMaterial = null;
  });

  attachAutocomplete(input, {
    minChars: 0,
    fetchItems,
    getDisplayValue: displayValue,
    renderItem: displayValue,
    onSelectItem(material) {
      pendingSelectedMaterial = material;
    }
  });

  input.addEventListener("focus", () => {
    if (!input.value) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  addButton.addEventListener("click", async () => {
    if (!currentPartId) {
      showToast("Lot has no available part information", "danger");
      return;
    }

    addButton.disabled = true;

    try {
      let material = pendingSelectedMaterial;

      if (!material) {
        const query = input.value.trim();

        if (!query) {
          showToast("Please select a material", "danger");
          return;
        }

        const items = await fetchItems(query);
        const normalized = query.toLowerCase();

        material = items.find(item =>
          displayValue(item).toLowerCase() === normalized ||
          String(item.code ?? "").toLowerCase() === normalized ||
          String(item.name ?? "").toLowerCase() === normalized
        );
      }

      if (!material) {
        showToast("Please pick a material from the list", "danger");
        return;
      }

      const alreadyAdded = partMaterials.some(item =>
        String(item.material_id) === String(material.id) ||
        (
          material.code &&
          String(item.code) === String(material.code)
        )
      );

      if (alreadyAdded) {
        showToast("Material already added", "danger");
        return;
      }

      await jfetch(`/parts/${currentPartId}/materials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          material_id: material.id
        })
      });

      input.value = "";
      pendingSelectedMaterial = null;

      showToast("Part material added");
      await loadPartMaterials();
    } catch (error) {
      console.error(error);
      showToast("Failed to add material", "danger");
    } finally {
      addButton.disabled = false;
    }
  });
}

async function init() {
  if (!lotId || !/^\d+$/.test(lotId) || Number(lotId) <= 0) {
    showToast("Missing or invalid lot_id in the page URL", "danger");
    document.getElementById("btnSaveBatch").disabled = true;
    document.getElementById("mat_add_btn").disabled = true;
    return;
  }

  makeLotLinks();
  initMaterialAutocomplete();

  // Load lot information independently from the material table.
  const headerReady = await loadLotHeader();

  if (headerReady) {
    await loadPartMaterials();
  }

  try {
    await loadBatchOptions();

    table = new Tabulator("#materialTable", {
      layout: "fitColumns",
      placeholder: "No materials allocated to this lot",
      movableColumns: true,
      pagination: false,
      columns: makeColumns()
    });

    table.on("tableBuilt", () => {
      void loadData();
    });

    bindAddBatch();
  } catch (error) {
    console.error(error);
    showToast("Failed to initialize material table", "danger");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  void init();
}