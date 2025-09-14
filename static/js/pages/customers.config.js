import { $, toast } from "../api.js";
import { escapeHtml, getRowId } from "../core/utils.js";

export const customersConfig = {
  endpoints: {
    base: "/customers",
    listKeyset: "/customers/keyset",
    byId: (id) => `/customers/${encodeURIComponent(id)}`,
  },
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "code", label: "Code", type: "text" },
    { key: "contact", label: "Contact", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "address", label: "Address", type: "textarea" },
  ],
  ids: {
    // detail buttons/containers
    hint: "hint",
    errorBox: "errorBox",
    view: "detailView",
    btnEdit: "btnEdit",
    btnNew: "btnNew",
    btnSave: "btnSave",
    btnCancel: "btnCancel",
    btnDelete: "btnDelete",
    // list
    inputSearch: "_q",
    selPerPage: "_per_page",
    btnPrevTop: "_prev_top",
    btnNextTop: "_next_top",
    btnPrev: "_prev",
    btnNext: "_next",
    pageInfo: "_page_info",
    listBody: "listBody",
  },
  resolveEls() {
    const ids = this.ids;
    const pick = (k) => $(ids[k]);
    return {
      view: pick("view"),
      errorBox: pick("errorBox"),
      btnEdit: pick("btnEdit"),
      btnNew: pick("btnNew"),
      btnSave: pick("btnSave"),
      btnCancel: pick("btnCancel"),
      btnDelete: pick("btnDelete"),
      inputSearch: pick("inputSearch"),
      selPerPage: pick("selPerPage"),
      btnPrevTop: pick("btnPrevTop"),
      btnNextTop: pick("btnNextTop"),
      btnPrev: pick("btnPrev"),
      btnNext: pick("btnNext"),
      pageInfo: pick("pageInfo"),
      listBody: pick("listBody"),
    };
  },
  busyEls: {}, // ส่ง map ปุ่มถ้าต้องการ disable ทีเดียว
  toggleButtons({ editing }) {
    const e = $(this.ids.btnEdit),
      n = $(this.ids.btnNew),
      s = $(this.ids.btnSave),
      c = $(this.ids.btnCancel);
    if (e) e.style.display = editing ? "none" : "";
    if (n) n.style.display = editing ? "none" : "";
    if (s) s.style.display = editing ? "" : "none";
    if (c) c.style.display = editing ? "" : "none";
  },
  bindInputs(viewEl, editor) {
    viewEl.querySelectorAll(".kv-input").forEach((inp) => {
      inp.addEventListener("input", (e) =>
        editor.updateField(e.target.dataset.field, e.target.value)
      );
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") $(this.ids.btnSave)?.click();
        if (e.key === "Escape") $(this.ids.btnCancel)?.click();
      });
    });
  },
  onSaved: () => toast("Saved"),
  onDeleted: () => toast("Deleted"),
  messages: { confirmDelete: "Delete?\nThis action cannot be undone." },
  toast,
  getRowId,
  syncListRow(listBody, id, updated) {
    const node = listBody?.querySelector(
      `.cust-item[data-id="${CSS.escape(String(id))}"]`
    );
    if (node) {
      node.querySelector(".cust-code").textContent = updated.code ?? "—";
      node.querySelector(".cust-name").textContent =
        updated.name ?? "(no name)";
      node.querySelector(".cust-sub").textContent =
        updated.contact || updated.email || updated.phone || "";
    }
  },
  removeListRow(listBody, id) {
    listBody
      ?.querySelector(`.cust-item[data-id="${CSS.escape(String(id))}"]`)
      ?.remove();
  },
  perPageDefault: 20,
  debounceMs: 300,
  queryKey: "q",
};
