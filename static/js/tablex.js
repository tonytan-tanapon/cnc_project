// /static/js/tablex.js
import { escapeHtml } from "./utils.js";
// render table แบบง่ายๆ (ไม่มี sort/resize/scroll)
export function renderTableX(
  container,
  rows,
  {
    columns = [], // [{ key, title, width, align, render?(row) }]
    onRowClick, // (row) => void
    rowStart = 0, // ใช้ทำคอลัมน์ No.
    getRowId = (r) => r.id, // หา id ของแถว
    className = "table tablex",
  } = {}
) {
  if (!rows?.length) {
    container.innerHTML = '<div class="empty">No data</div>';
    return;
  }

  const th = columns
    .map(
      (c) =>
        `<th${c.width ? ` style="width:${c.width}"` : ""}${
          c.align ? ` class="t-${c.align}"` : ""
        }>${escapeHtml(c.title || c.key)}</th>`
    )
    .join("");

  const tr = rows
    .map((r, i) => {
      const cells = columns
        .map((c) => {
          if (c.key === "__no")
            return `<td class="t-right">${rowStart + i + 1}</td>`;
          const v = c.render ? c.render(r) : r[c.key] ?? "";
          return `<td${c.align ? ` class="t-${c.align}"` : ""}>${
            typeof v === "string" ? v : escapeHtml(String(v))
          }</td>`;
        })
        .join("");
      const rid = escapeHtml(getRowId(r) ?? "");
      return `<tr data-id="${rid}" tabindex="0">${cells}</tr>`;
    })
    .join("");

  container.innerHTML = `
    <table class="${className}">
      <thead><tr>${th}</tr></thead>
      <tbody>${tr}</tbody>
    </table>
    <style>
      .tablex .t-right{text-align:right}.tablex .t-center{text-align:center}
      .tablex tr:hover{background:rgba(0,0,0,.03)} .tablex tr{cursor:pointer}
    </style>
  `;

  if (onRowClick) {
    container.querySelector("tbody")?.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      const id = tr.dataset.id;
      const row = rows.find((r) => String(getRowId(r)) === id);
      if (row) onRowClick(row);
    });
  }
}
