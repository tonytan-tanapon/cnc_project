import { escapeHtml, getRowId } from "../core/utils.js";

export function renderList(container, rows, ctx, onClickRow) {
  if (!container) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    container.innerHTML = `<div class="muted" style="padding:12px">No data</div>`;
    return;
  }
  const rowStart = Number(ctx?.rowStart || 0);
  container.innerHTML = rows
    .map((r, i) => {
      const id = getRowId(r);
      const no = rowStart + i + 1;
      const code = escapeHtml(r.code ?? "");
      const name = escapeHtml(r.name ?? "");
      const sub = escapeHtml(r.contact || r.email || r.phone || "");
      return `<div class="cust-item" data-id="${id}">
              <div class="cust-no">${no}</div>
              <div class="cust-code">${code || "—"}</div>
              <div><div class="cust-name">${
                name || "(no name)"
              }</div><div class="cust-sub">${sub}</div></div>
            </div>`;
    })
    .join("");
  container.querySelectorAll(".cust-item").forEach((el) => {
    el.addEventListener("click", () => onClickRow?.(el.dataset.id));
  });
}
export const highlight = (container, id) => {
  container
    ?.querySelectorAll(".cust-item")
    ?.forEach((n) =>
      n.classList.toggle("active", String(n.dataset.id) === String(id))
    );
};
