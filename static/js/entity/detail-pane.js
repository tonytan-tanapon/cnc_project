import { escapeHtml, trim } from "../core/utils.js";

export function renderKV(holder, data, fields, editing) {
  if (!holder) return;
  if ((!data || Object.keys(data).length === 0) && !editing) {
    holder.innerHTML = `<div class="muted">Select a record on the left</div>`;
    return;
  }
  holder.innerHTML = fields
    .map(({ key, label, type }) => {
      const raw = data?.[key] ?? "";
      const safe = trim(raw) === "" ? "—" : escapeHtml(String(raw));
      const val = editing
        ? type === "textarea"
          ? `<textarea class="kv-input" data-field="${key}" rows="3">${escapeHtml(
              String(raw ?? "")
            )}</textarea>`
          : `<input class="kv-input" data-field="${key}" type="${
              type || "text"
            }" value="${escapeHtml(String(raw ?? ""))}">`
        : safe;
      return `<div class="kv-row${editing ? " editing" : ""}" data-key="${key}">
              <div class="kv-key">${escapeHtml(label)}</div>
              <div class="kv-val" data-key="${key}">${val}</div>
            </div>`;
    })
    .join("");
}

export const focusField = (holder, key) =>
  holder?.querySelector(`.kv-input[data-field="${CSS.escape(key)}"]`)?.focus();
