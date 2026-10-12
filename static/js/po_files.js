const form = document.getElementById("searchForm");
const input = document.getElementById("poNumber");
const button = document.getElementById("searchButton");
const status = document.getElementById("status");
const tbody = document.getElementById("fileRows");
const table = document.getElementById("fileTable");
const headers = Array.from(table.querySelectorAll("thead th"));

const typeAll = document.getElementById("typeAll");
const yearAll = document.getElementById("yearAll");

const typeCheckboxes = Array.from(
  document.querySelectorAll('input[name="fileType"]')
);

const yearCheckboxes = Array.from(
  document.querySelectorAll('input[name="fileYear"]')
);

// Optional PDF preview elements.
const pdfPanel = document.getElementById("pdfPanel");
const pdfPreview = document.getElementById("pdfPreview");
const pdfTitle = document.getElementById("pdfTitle");
const closePreview = document.getElementById("closePreview");

let files = [];
let sortColumn = null;
let sortAscending = true;
let hasSearched = false;
let searching = false;
let warnings = [];

const labels = headers.map(header => header.textContent.trim());

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

// Normalize folder/type names for matching.
function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const typeNames = new Map(
  typeCheckboxes.map(checkbox => [
    normalize(checkbox.value),
    checkbox.value,
  ])
);

function getFileType(file) {
  // Prefer an explicit type supplied by the API.
  const explicitType = file.type || file.file_type;

  if (explicitType) {
    const matched = typeNames.get(normalize(explicitType));
    if (matched) return matched;
  }

  const folder = normalize(file.folder);

  // Adjust these rules if your actual folder names differ.
  if (
    folder.includes("scanneddrawingwithlot") ||
    folder.includes("scanwithlot")
  ) {
    return "ScanWithLot";
  }

  if (
    folder.includes("suppliercert") ||
    folder.includes("suppliercertificate")
  ) {
    return "Supplier Cert";
  }

  if (
    folder.includes("supplierpo") ||
    folder.includes("supplierpurchaseorder")
  ) {
    return "Supplier PO";
  }

  if (
    folder.includes("cofc") ||
    folder.includes("certificateofconformance") ||
    folder.includes("certificateofconformity")
  ) {
    return "CofC";
  }

  if (folder.includes("material")) {
    return "Material";
  }

  return null;
}

function getFileYear(file) {
  // Prefer an explicit year supplied by the API.
  if (file.year != null && /^\d{4}$/.test(String(file.year))) {
    return String(file.year);
  }

  // Example: "2026/CustomerA/Supplier PO"
  const folders = String(file.folder || "").split(/[\\/]/);

  return folders.find(folder => /^20\d{2}$/.test(folder)) || null;
}

function getSelectedValues(checkboxes) {
  return new Set(
    checkboxes
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.value)
  );
}

function getFilteredFiles() {
  const selectedTypes = getSelectedValues(typeCheckboxes);
  const selectedYears = getSelectedValues(yearCheckboxes);

  return files.filter(file => {
    // "All" includes unknown types and years outside the listed years.
    const matchesType =
      typeAll.checked || selectedTypes.has(getFileType(file));

    const matchesYear =
      yearAll.checked || selectedYears.has(getFileYear(file));

    return matchesType && matchesYear;
  });
}

function hidePdfPreview() {
  if (!pdfPanel || !pdfPreview) return;

  pdfPanel.hidden = true;
  pdfPreview.removeAttribute("src");

  if (pdfTitle) {
    pdfTitle.textContent = "PDF preview";
  }
}

function showPdfPreview(file) {
  if (!pdfPanel || !pdfPreview || !file.preview_url) return;

  if (pdfTitle) {
    pdfTitle.textContent = file.name;
  }

  pdfPreview.src = file.preview_url;
  pdfPanel.hidden = false;

  pdfPanel.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

if (closePreview) {
  closePreview.addEventListener("click", hidePdfPreview);
}

function getSortValue(file, column) {
  switch (column) {
    case 0:
      return file.name || "";

    case 1:
      return file.folder || "";

    case 2:
      return Number(file.size_bytes) || 0;

    case 3: {
      const timestamp = file.created_at
        ? Date.parse(file.created_at)
        : NaN;

      return Number.isNaN(timestamp) ? null : timestamp;
    }

    case 4:
      return file.name || "";

    default:
      return "";
  }
}

function updateHeaders() {
  headers.forEach((header, index) => {
    const selected = index === sortColumn;
    const arrow = selected
      ? (sortAscending ? "▲" : "▼")
      : "↕";

    header.querySelector("button").textContent =
      `${labels[index]} ${arrow}`;

    header.setAttribute(
      "aria-sort",
      selected
        ? (sortAscending ? "ascending" : "descending")
        : "none"
    );
  });
}

function updateStatus(visibleCount) {
  if (searching || !hasSearched) return;

  if (files.length === 0) {
    status.textContent = "No files found.";
  } else if (visibleCount === 0) {
    status.textContent =
      `No files match the selected filters. ${files.length} file(s) found.`;
  } else {
    status.textContent =
      `${visibleCount} of ${files.length} file(s) shown.`;
  }

  if (warnings.length > 0) {
  status.textContent += "\n" + warnings.join("\n");
}
}

function renderFiles() {
  const sortedFiles = getFilteredFiles();

  if (sortColumn !== null) {
    sortedFiles.sort((a, b) => {
      const valueA = getSortValue(a, sortColumn);
      const valueB = getSortValue(b, sortColumn);

      // Keep missing dates at the bottom in both directions.
      if (valueA === null && valueB === null) return 0;
      if (valueA === null) return 1;
      if (valueB === null) return -1;

      const result =
        typeof valueA === "number"
          ? valueA - valueB
          : collator.compare(valueA, valueB);

      return sortAscending ? result : -result;
    });
  }

  const fragment = document.createDocumentFragment();

  for (const file of sortedFiles) {
    const row = document.createElement("tr");

    const createdDate = file.created_at
      ? new Date(file.created_at)
      : null;

    const values = [
      file.name || "—",
      !file.folder || file.folder === "." ? "—" : file.folder,
      `${((Number(file.size_bytes) || 0) / 1024).toFixed(1)} KB`,
      createdDate && !Number.isNaN(createdDate.getTime())
        ? createdDate.toLocaleString()
        : "—",
    ];

    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    }

    const actionsCell = document.createElement("td");

    // Show Preview only when the HTML panel and API URL exist.
    if (pdfPanel && pdfPreview && file.preview_url) {
      const previewButton = document.createElement("button");
      previewButton.type = "button";
      previewButton.className = "preview-button";
      previewButton.textContent = "Preview";

      previewButton.addEventListener("click", () => {
        showPdfPreview(file);
      });

      actionsCell.appendChild(previewButton);
    }

    const link = document.createElement("a");
    link.href = file.download_url;
    link.textContent = "Download";
    link.download = file.name || "";

    actionsCell.appendChild(link);
    row.appendChild(actionsCell);
    fragment.appendChild(row);
  }

  tbody.replaceChildren(fragment);
  table.hidden = sortedFiles.length === 0;

  updateHeaders();
  updateStatus(sortedFiles.length);
}

function setupCheckboxGroup(allCheckbox, options) {
  function updateAllCheckbox() {
    const checkedCount = options.filter(
      option => option.checked
    ).length;

    allCheckbox.checked = checkedCount === options.length;
    allCheckbox.indeterminate =
      checkedCount > 0 && checkedCount < options.length;
  }

  function filtersChanged() {
    hidePdfPreview();
    renderFiles();
  }

  allCheckbox.addEventListener("change", () => {
    options.forEach(option => {
      option.checked = allCheckbox.checked;
    });

    updateAllCheckbox();
    filtersChanged();
  });

  options.forEach(option => {
    option.addEventListener("change", () => {
      updateAllCheckbox();
      filtersChanged();
    });
  });

  updateAllCheckbox();
}

setupCheckboxGroup(typeAll, typeCheckboxes);
setupCheckboxGroup(yearAll, yearCheckboxes);

headers.forEach((header, index) => {
  const sortButton = document.createElement("button");
  sortButton.type = "button";
  sortButton.className = "column-sort";

  header.replaceChildren(sortButton);

  sortButton.addEventListener("click", () => {
    sortAscending = sortColumn === index ? !sortAscending : true;
    sortColumn = index;
    renderFiles();
  });
});

updateHeaders();

form.addEventListener("submit", async event => {
  event.preventDefault();

  const poNumber = input.value.trim();
  if (!poNumber || searching) return;

  searching = true;
  hasSearched = false;
  button.disabled = true;

  files = [];
  warnings = [];
  tbody.replaceChildren();
  table.hidden = true;
  hidePdfPreview();

  status.textContent = "Searching...";

  try {
    const params = new URLSearchParams({
      po_number: poNumber,
    });

    const response = await fetch(
      `/api/v1/po_files/search?${params}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "Search failed."
      );
    }

    files = Array.isArray(data.files) ? data.files : [];
    warnings = Array.isArray(data.warnings) ? data.warnings : [];
    hasSearched = true;
  } catch (error) {
    status.textContent =
      error.message || "Cannot connect to server.";
  } finally {
    searching = false;
    button.disabled = false;

    if (hasSearched) {
      renderFiles();
    }
  }
});