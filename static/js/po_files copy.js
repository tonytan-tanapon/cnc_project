const form = document.getElementById("searchForm");
const input = document.getElementById("poNumber");
const button = document.getElementById("searchButton");
const status = document.getElementById("status");
const tbody = document.getElementById("fileRows");
const table = document.getElementById("fileTable");
const headers = Array.from(table.querySelectorAll("thead th"));

let files = [];
let sortColumn = null;
let sortAscending = true;

const labels = headers.map((header) => header.textContent.trim());
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function getSortValue(file, column) {
  switch (column) {
    case 0:
      return file.name || "";
    case 1:
      return file.folder || "";
    case 2:
      return Number(file.size_bytes) || 0;
    case 3: {
      const timestamp = Date.parse(file.created_at);
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
    const arrow = selected ? (sortAscending ? "▲" : "▼") : "↕";

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

function renderFiles() {
  const sortedFiles = [...files];

  if (sortColumn !== null) {
    sortedFiles.sort((a, b) => {
      const valueA = getSortValue(a, sortColumn);
      const valueB = getSortValue(b, sortColumn);

      // Keep missing dates at the bottom in either direction.
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
      file.name,
      file.folder === "." ? "—" : file.folder,
      `${(file.size_bytes / 1024).toFixed(1)} KB`,
      createdDate && !Number.isNaN(createdDate.getTime())
        ? createdDate.toLocaleString()
        : "—",
    ];

    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    }

    const cell = document.createElement("td");
    const link = document.createElement("a");

    link.href = file.download_url;
    link.textContent = "Download";
    link.download = file.name;

    cell.appendChild(link);
    row.appendChild(cell);
    fragment.appendChild(row);
  }

  tbody.replaceChildren(fragment);
  table.hidden = files.length === 0;
  updateHeaders();
}

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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const poNumber = input.value.trim();
  if (!poNumber) return;

  button.disabled = true;
  files = [];
  tbody.replaceChildren();
  table.hidden = true;
  status.textContent = "Searching...";

  try {
    const params = new URLSearchParams({
      po_number: poNumber,
    });

    const response = await fetch(`/api/v1/po_files/search?${params}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "Search failed."
      );
    }

    files = data.files || [];

    status.textContent = files.length
      ? `${files.length} file(s) found.`
      : "No files found.";

    renderFiles();
  } catch (error) {
    status.textContent = error.message || "Cannot connect to server.";
  } finally {
    button.disabled = false;
  }
});