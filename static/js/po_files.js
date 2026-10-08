const form = document.getElementById("searchForm");
const input = document.getElementById("poNumber");
const button = document.getElementById("searchButton");
const status = document.getElementById("status");
const tbody = document.getElementById("fileRows");
const table = document.getElementById("fileTable");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const poNumber = input.value.trim();
  if (!poNumber) return;

  button.disabled = true;
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

    status.textContent = data.count
      ? `${data.count} file(s) found.`
      : "No files found.";

    for (const file of data.files) {
      const row = document.createElement("tr");

      const values = [
        file.name,
        file.folder === "." ? "—" : file.folder,
        `${(file.size_bytes / 1024).toFixed(1)} KB`,
        file.created_at
            ? new Date(file.created_at).toLocaleString()
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
      tbody.appendChild(row);
    }

    table.hidden = data.count === 0;
  } catch (error) {
    status.textContent = error.message || "Cannot connect to server.";
  } finally {
    button.disabled = false;
  }
});