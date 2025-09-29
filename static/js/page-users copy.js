// /static/js/page-users.js — Autosave + Tab/Shift+Tab + Undo/Redo + Delete-only
// Client-emulated pagination (Show All default). No backend change needed.
import { $, jfetch, toast } from "./api.js";

/* ===== CONFIG ===== */
const ENDPOINTS = {
  base: "/users",
  byId: (id) => `/users/${encodeURIComponent(id)}`,
  setPw: (id) => `/users/${encodeURIComponent(id)}/set-password`,
};
const JSON_HEADERS = { "Content-Type": "application/json" };
const UI = { q: "_q", add: "_add", table: "listBody" };

/* ===== Pagination (client-emulated) ===== */
const DEFAULT_PAGE_SIZE = true; // true = Show All
const PAGE_SIZE_CHOICES = [20, 50, 100, 200, true];

/* ===== STATE ===== */
let els = {};
let table = null;
let isBuilt = false;
let cacheAllUsers = []; // raw from backend
let totalItems = 0;

/* ===== AUTOSAVE GUARDS ===== */
const createInFlight = new WeakSet();
const patchTimers = new Map();
const PATCH_DEBOUNCE_MS = 350;
const suppressAutosaveRows = new WeakSet();

/* ===== HELPERS ===== */
const trim = (v) => (v == null ? "" : String(v).trim());

function normalizeRow(u) {
  return {
    id: u.id ?? u.user_id ?? u.userId ?? null,
    username: u.username ?? "",
    email: u.email ?? "",
    employee_id: u.employee_id ?? null,
    is_superuser: !!u.is_superuser,
    is_active: u.is_active == null ? true : !!u.is_active,
    password: "", // editable; used only for create or set-password
    created_at: u.created_at ?? "",
    last_login_at: u.last_login_at ?? "",
  };
}

function buildUpdatePayload(d) {
  // สำคัญ: ไม่ใส่ password ใน PATCH/PUT
  return {
    username: trim(d.username) || null,
    email: d.email ? trim(d.email) : null,
    employee_id:
      d.employee_id != null && String(d.employee_id).trim() !== ""
        ? Number(d.employee_id)
        : null,
    is_superuser: !!d.is_superuser,
    is_active: d.is_active == null ? true : !!d.is_active,
  };
}
function buildCreatePayload(d) {
  // create ต้องมี password
  return {
    username: trim(d.username) || null,
    email: d.email ? trim(d.email) : null,
    employee_id:
      d.employee_id != null && String(d.employee_id).trim() !== ""
        ? Number(d.employee_id)
        : null,
    is_superuser: !!d.is_superuser,
    is_active: d.is_active == null ? true : !!d.is_active,
    password: d.password ? String(d.password) : null,
  };
}

function safeRowUpdate(row, obj) {
  try {
    table?.cancelEdit?.();
  } catch {}
  try {
    if (row?.getElement?.()) row.update(obj);
    else if (obj?.id != null) table?.updateData([{ ...obj }]);
  } catch {}
  requestAnimationFrame(() => {
    try {
      row?.reformat?.();
    } catch {}
    try {
      table?.redraw(true);
    } catch {}
  });
}

/* ===== DELETE ===== */
async function deleteRow(row) {
  const d = row.getData();
  if (!d.id) {
    row.delete();
    return;
  }
  if (
    !confirm(
      `Delete user "${
        d.username || d.email || d.id
      }"?\nThis action cannot be undone.`
    )
  )
    return;
  try {
    await jfetch(ENDPOINTS.byId(d.id), { method: "DELETE" });
    row.delete();
    toast("Deleted");
    cacheAllUsers = cacheAllUsers.filter((x) => (x.id ?? x.user_id) !== d.id);
    table?.replaceData();
  } catch (e) {
    toast(e?.message || "Delete failed", false);
  }
}

/* ===== Columns ===== */
function makeColumns() {
  return [
    {
      title: "No.",
      field: "_rowno",
      width: 70,
      hozAlign: "right",
      headerHozAlign: "right",
      headerSort: false,
      formatter: (cell) => {
        const pos = cell.getRow().getPosition(true);
        const cur = table.getPage() || 1;
        const ps = table.getPageSize();
        const eff = ps === true ? totalItems || table.getDataCount() : ps || 1;
        return (cur - 1) * eff + pos;
      },
    },
    {
      title: "Username",
      field: "username",
      width: 160,
      editor: "input",
      validator: "required",
    },
    { title: "Email", field: "email", width: 240, editor: "input" },
    // ช่อง Password ใช้สร้าง user ใหม่ หรือ set-password สำหรับ user ที่มี id แล้ว
    { title: "Password", field: "password", width: 160, editor: "input" },
    { title: "Employee ID", field: "employee_id", width: 130, editor: "input" },
    {
      title: "Superuser",
      field: "is_superuser",
      width: 120,
      editor: "list",
      editorParams: { values: { true: "true", false: "false" } },
      formatter: (c) => (c.getValue() ? "true" : "false"),
      mutatorEdit: (v) => String(v) === "true" || v === true,
    },
    {
      title: "Active",
      field: "is_active",
      width: 110,
      editor: "list",
      editorParams: { values: { true: "true", false: "false" } },
      formatter: (c) => (c.getValue() ? "true" : "false"),
      mutatorEdit: (v) => String(v) === "true" || v === true,
    },
    { title: "Created", field: "created_at", width: 180 },
    { title: "Last Login", field: "last_login_at", width: 180 },
    {
      title: "Actions",
      field: "_actions",
      width: 120,
      hozAlign: "center",
      headerSort: false,
      cssClass: "actions-cell",
      formatter: () =>
        `<button class="btn-small btn-danger" data-act="del">Delete</button>`,
      cellClick: (e, cell) => {
        const btn = e.target.closest("button[data-act='del']");
        if (!btn) return;
        deleteRow(cell.getRow());
      },
    },
  ];
}

/* ===== Tab / Shift+Tab ===== */
function getEditableFieldsLive(tab) {
  return tab
    .getColumns(true)
    .map((c) => ({ field: c.getField(), def: c.getDefinition() }))
    .filter((c) => c.field && c.def && !!c.def.editor)
    .map((c) => c.field);
}
function focusSiblingEditable(cell, dir) {
  const row = cell.getRow();
  const tab = row.getTable();
  const fields = getEditableFieldsLive(tab);
  const curIdx = fields.indexOf(cell.getField());
  if (curIdx === -1) return;

  const rows = tab.getRows();
  const rIdx = rows.indexOf(row);

  let nf = curIdx + dir;
  let nr = rIdx;
  if (nf >= fields.length) {
    nf = 0;
    nr = Math.min(rIdx + 1, rows.length - 1);
  } else if (nf < 0) {
    nf = fields.length - 1;
    nr = Math.max(rIdx - 1, 0);
  }

  const tRow = rows[nr];
  const tField = fields[nf];
  const tCell = tRow?.getCell(tField);
  if (!tCell) return;

  tCell.edit(true);
  const el = tCell.getElement();
  const input =
    el && el.querySelector("input, textarea, [contenteditable='true']");
  if (input) {
    const v = input.value;
    input.focus();
    if (typeof v === "string") input.setSelectionRange(v.length, v.length);
  }
}

/* ===== AUTOSAVE ===== */
function isMethodNotAllowed(err) {
  const msg = (err && (err.message || String(err))) || "";
  const st = err?.status || err?.statusCode;
  return st === 405 || /method not allowed/i.test(msg);
}

async function autosaveCell(cell, opts = {}) {
  const { fromHistory = false, revert } = opts;

  const row = cell.getRow();
  if (suppressAutosaveRows.has(row)) return;

  const d = row.getData();
  const fld = cell.getField();
  const newVal = cell.getValue();
  const oldVal = fromHistory ? undefined : cell.getOldValue();

  // username required
  if (fld === "username" && !trim(newVal)) {
    suppressAutosaveRows.add(row);
    try {
      if (!fromHistory) cell.setValue(oldVal, true);
      else if (typeof revert === "function") revert();
    } finally {
      setTimeout(() => suppressAutosaveRows.delete(row), 0);
    }
    toast("Username required", false);
    return;
  }

  // ---- Special case: set-password ----
  if (fld === "password" && d.id) {
    const pw = String(newVal || "").trim();
    if (!pw) return; // ว่าง = ไม่ทำอะไร
    suppressAutosaveRows.add(row);
    try {
      await jfetch(ENDPOINTS.setPw(d.id), {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ new_password: pw }),
      });
      toast("Password updated");
      // เคลียร์ช่อง password ในตาราง
      safeRowUpdate(row, { ...d, password: "" });
    } catch (e) {
      // ย้อนค่าเดิม
      try {
        if (!fromHistory) cell.setValue(oldVal, true);
        else if (typeof revert === "function") revert();
      } catch {}
      toast(e?.message || "Set password failed", false);
    } finally {
      setTimeout(() => suppressAutosaveRows.delete(row), 0);
    }
    return;
  }

  // ---- CREATE ----
  if (!d.id) {
    const payload = buildCreatePayload(d);
    if (!payload.username || !payload.password) return; // ยังไม่พร้อม
    if (createInFlight.has(row)) return;

    createInFlight.add(row);
    try {
      const created = await jfetch(ENDPOINTS.base, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
      const norm = normalizeRow(created || d);
      suppressAutosaveRows.add(row);
      try {
        safeRowUpdate(row, { ...norm });
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }
      toast(`User "${norm.username}" created`);

      cacheAllUsers.push(created);
      totalItems = cacheAllUsers.length;
      table?.replaceData(); // ให้เพจจิ้งและลำดับ rownum อัปเดต
    } catch (e) {
      suppressAutosaveRows.add(row);
      try {
        if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
        else if (typeof revert === "function") revert();
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }
      toast(e?.message || "Create failed", false);
    } finally {
      createInFlight.delete(row);
    }
    return;
  }

  // ---- UPDATE (debounced), ไม่ส่ง password ----
  if (patchTimers.has(row)) clearTimeout(patchTimers.get(row));
  const t = setTimeout(async () => {
    patchTimers.delete(row);
    const payload = buildUpdatePayload(d);

    try {
      let updated;
      try {
        updated = await jfetch(ENDPOINTS.byId(d.id), {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify(payload),
        });
      } catch (err) {
        if (isMethodNotAllowed(err)) {
          updated = await jfetch(ENDPOINTS.byId(d.id), {
            method: "PUT",
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
          });
        } else {
          throw err;
        }
      }

      const norm = normalizeRow(updated || d);
      suppressAutosaveRows.add(row);
      try {
        safeRowUpdate(row, { ...d, ...norm, password: "" });
      } finally {
        // เคลียร์ password เสมอ
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }
      toast(`Saved "${norm.username}"`);

      // sync cache
      const idx = cacheAllUsers.findIndex(
        (x) => (x.id ?? x.user_id) === norm.id
      );
      if (idx >= 0) cacheAllUsers[idx] = updated;
    } catch (e) {
      suppressAutosaveRows.add(row);
      try {
        if (!fromHistory && oldVal !== undefined) cell.setValue(oldVal, true);
        else if (typeof revert === "function") revert();
      } finally {
        setTimeout(() => suppressAutosaveRows.delete(row), 0);
      }
      toast(e?.message || "Save failed", false);
    }
  }, PATCH_DEBOUNCE_MS);
  patchTimers.set(row, t);
}

/* ===== TABLE ===== */
function initTable() {
  table = new Tabulator(`#${UI.table}`, {
    layout: "fitColumns",
    height: "100%",
    placeholder: "No users",
    reactiveData: true,
    index: "id",
    history: true,
    selectableRows: 1,

    pagination: true,
    paginationMode: "remote",
    paginationSize: DEFAULT_PAGE_SIZE, // true = Show All
    paginationSizeSelector: PAGE_SIZE_CHOICES,
    paginationCounter: "rows",

    ajaxURL: ENDPOINTS.base, // not used directly
    ajaxRequestFunc: async (_url, _config, params) => {
      const page = params.page || 1;
      const showAll = params.size === true;
      const size = showAll ? 0 : Number(params.size) || 50;

      if (!cacheAllUsers.length) {
        const list = await jfetch(ENDPOINTS.base);
        cacheAllUsers = Array.isArray(list) ? list : list?.items ?? [];
      }

      const keyword = (els[UI.q]?.value || "").trim().toLowerCase();
      const filtered = keyword
        ? cacheAllUsers.filter(
            (u) =>
              (u.username ?? "").toLowerCase().includes(keyword) ||
              (u.email ?? "").toLowerCase().includes(keyword)
          )
        : cacheAllUsers;

      totalItems = filtered.length;

      const start = showAll ? 0 : (page - 1) * size;
      const end = showAll ? filtered.length : start + size;
      const pageItems = filtered.slice(start, end);
      const rows = pageItems.map(normalizeRow);

      const last_page = showAll
        ? 1
        : Math.max(1, Math.ceil((totalItems || rows.length) / (size || 1)));
      return { data: rows, last_page };
    },

    columns: makeColumns(),
  });

  table.on("tableBuilt", () => {
    isBuilt = true;
    requestAnimationFrame(() => table.redraw(true));
  });

  // Tab / Shift+Tab
  table.on("cellEditing", (cell) => {
    setTimeout(() => {
      const el = cell.getElement();
      const input =
        el && el.querySelector("input, textarea, [contenteditable='true']");
      if (!input) return;
      const handler = (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function")
            e.stopImmediatePropagation();
          focusSiblingEditable(cell, e.shiftKey ? -1 : +1);
        }
      };
      input.addEventListener("keydown", handler);
      input.addEventListener(
        "blur",
        () => input.removeEventListener("keydown", handler),
        { once: true }
      );
    }, 0);
  });

  // Autosave hooks
  table.on("cellEdited", (cell) => {
    if (suppressAutosaveRows.has(cell.getRow())) return;
    autosaveCell(cell);
  });
  table.on("historyUndo", (action, component) => {
    if (
      action === "cellEdit" &&
      component &&
      typeof component.getRow === "function"
    ) {
      autosaveCell(component, {
        fromHistory: true,
        revert: () => table.redo(),
      });
    }
  });
  table.on("historyRedo", (action, component) => {
    if (
      action === "cellEdit" &&
      component &&
      typeof component.getRow === "function"
    ) {
      autosaveCell(component, {
        fromHistory: true,
        revert: () => table.undo(),
      });
    }
  });

  // Global keys
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? table.redo() : table.undo();
    } else if (e.key.toLowerCase() === "y") {
      e.preventDefault();
      table.redo();
    }
  });
}

/* ===== BINDINGS ===== */
function bindSearch() {
  const box = els[UI.q];
  if (!box) return;
  let t;
  box.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      table?.setPage(1);
      table?.replaceData(); // ใช้ cache + filter
    }, 300);
  });
}
function bindAdd() {
  const btn = els[UI.add];
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const row = await table.addRow(
      {
        id: null,
        username: "",
        email: "",
        password: "",
        employee_id: "",
        is_superuser: false,
        is_active: true,
        created_at: null,
        last_login_at: null,
      },
      true
    );
    row.getCell("username")?.edit(true);
  });
}

/* ===== BOOT ===== */
document.addEventListener("DOMContentLoaded", () => {
  Object.values(UI).forEach((id) => (els[id] = $(id)));
  initTable();
  bindSearch();
  bindAdd();
  // ปล่อยให้ Tabulator เรียก ajaxRequestFunc เอง
});
