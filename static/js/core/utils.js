export const trim = (v) => (v == null ? "" : String(v).trim());
export const trimOrNull = (v) => {
  const s = trim(v);
  return s === "" ? null : s;
};
export const upper = (s) => (typeof s === "string" ? s.toUpperCase() : s);
export const escapeHtml = (s = "") =>
  s.replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ])
  );
export const getRowId = (r) => r?.id ?? r?.customer_id ?? r?.customerId ?? null;
export const toggle = (el, show) => {
  if (!el) return;
  el.style.display = show ? "" : "none";
};
export const setBusy = (els, b, hintId) => {
  Object.values(els).forEach((el) => el && (el.disabled = b));
  if (hintId && els[hintId]) els[hintId].textContent = b ? "Working…" : "";
};


//////////////////////////////////// reuseable fetch utils
export const safe = (s) => String(s ?? "").replace(/[<>&]/g, (m) => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;"
}[m]));

// export const trim = (v) => (v == null ? "" : String(v).trim());

export const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : d.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
};

export const debounce = (fn, ms = 300) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

