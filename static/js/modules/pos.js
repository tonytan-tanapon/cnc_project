import { fmtDate, trim } from "../core/utils.js";

export const ENDPOINTS = {
  base: "/pos",
  byId: (id) => `/pos/${encodeURIComponent(id)}`,
  keyset: (qs) => `/pos/keyset?${qs}`,
};

export const normalize = (po) => ({
  id: po.id,
  po_number: po.po_number ?? "",
  customer_id: po.customer?.id ?? null,
  customer_code: po.customer?.code ?? "",
  customer_name: po.customer?.name ?? "",
  customer_disp: po.customer
    ? `${po.customer.code} — ${po.customer.name}`
    : "",
  description: po.description ?? "",
  created_at: fmtDate(po.created_at),
});

export const buildPayload = (row) => ({
  po_number: trim(row.po_number) || null,
  customer_id: row.customer_id ?? null,
  description: row.description ? trim(row.description) : "",
});

export const requiredReady = (row) =>
  !!trim(row.po_number) && row.customer_id != null;
