import { makeApi } from "../core/api-client.js";
import { setBusy } from "../core/utils.js";
import { renderKV, focusField } from "./detail-pane.js";
import { renderList, highlight } from "./list-pane.js";
import { makeEditor } from "./inline-editor.js";
import { createListPager } from "../core/list-pager.js"; // ของเดิมคุณ

export function createEntityPage(cfg) {
  const api = makeApi(cfg.endpoints);
  const ed = makeEditor({ fields: cfg.fields });

  const els = cfg.resolveEls(); // คืน object refs ปุ่ม/คอนเทนเนอร์
  let selectedId = null;
  let lp;
  let prevSelectedIdBeforeNew = null;

  const toView = () => {
    ed.setMode("view");
    cfg.toggleButtons({ editing: false });
  };
  const toEdit = (focusKey = "name") => {
    ed.setMode("edit");
    renderKV(els.view, ed.getWorking(), cfg.fields, true);
    cfg.bindInputs(els.view, ed);
    cfg.toggleButtons({ editing: true });
    focusField(els.view, focusKey);
  };
  const toCreate = () => {
    prevSelectedIdBeforeNew = selectedId;
    selectedId = null;
    ed.setInitial(null);
    ed.setDraftEmpty();
    ed.setMode("create");
    renderKV(els.view, ed.getWorking(), cfg.fields, true);
    cfg.bindInputs(els.view, ed);
    cfg.toggleButtons({ editing: true });
    focusField(els.view, "name");
  };

  async function loadDetail(id) {
    setBusy(cfg.busyEls, true, cfg.ids.hint);
    try {
      const ent = await api.getById(id);
      ed.setInitial(ent);
      renderKV(els.view, ent, cfg.fields, false);
      els.errorBox && (els.errorBox.style.display = "none");
      toView();
      cfg.onAfterLoad?.(ent);
    } catch (e) {
      els.errorBox && (els.errorBox.style.display = "");
      els.errorBox && (els.errorBox.textContent = e?.message || "Load failed");
      ed.setInitial(null);
      renderKV(els.view, {}, cfg.fields, false);
      toView();
    } finally {
      setBusy(cfg.busyEls, false, cfg.ids.hint);
    }
  }

  async function save() {
    const payload = ed.toPayload();
    if (!payload.name) {
      cfg.toast("Enter Name", false);
      if (ed.mode === "view") toEdit("name");
      return;
    }
    setBusy(cfg.busyEls, true, cfg.ids.hint);
    try {
      if (ed.mode === "create" || !selectedId) {
        const created = await api.create(payload);
        selectedId = cfg.getRowId(created);
        ed.setInitial(created);
        ed.clearDraft();
        renderKV(els.view, created, cfg.fields, false);
        toView();
        await lp.reloadFirst();
        cfg.onSaved?.(created);
      } else {
        const updated = await api.update(selectedId, payload);
        ed.setInitial(updated);
        ed.clearDraft();
        renderKV(els.view, updated, cfg.fields, false);
        toView();
        cfg.onSaved?.(updated);
        // sync list item quickly
        cfg.syncListRow?.(els.listBody, selectedId, updated);
      }
    } catch (e) {
      cfg.toast(e?.message || "Save failed", false);
    } finally {
      setBusy(cfg.busyEls, false, cfg.ids.hint);
    }
  }

  async function removeSel() {
    if (!selectedId) return;
    if (!confirm(cfg.messages.confirmDelete || "Delete?")) return;
    setBusy(cfg.busyEls, true, cfg.ids.hint);
    try {
      await api.remove(selectedId);
      cfg.toast("Deleted");
      cfg.removeListRow?.(els.listBody, selectedId);
      selectedId = null;
      ed.setInitial(null);
      renderKV(els.view, {}, cfg.fields, false);
      toView();
      cfg.onDeleted?.();
    } catch (e) {
      cfg.toast(e?.message || "Delete failed", false);
    } finally {
      setBusy(cfg.busyEls, false, cfg.ids.hint);
    }
  }

  // public select
  async function select(id) {
    selectedId = id;
    highlight(els.listBody, id);
    await loadDetail(id);
  }

  // boot
  function init() {
    // buttons
    els.btnEdit?.addEventListener("click", () => {
      if (!ed.getInitial()) return;
      ed.setDraftFromInitial();
      toEdit("name");
    });
    els.btnNew?.addEventListener("click", () => toCreate());
    els.btnSave?.addEventListener("click", save);
    els.btnCancel?.addEventListener("click", () => {
      if (ed.mode === "create" && !ed.getInitial() && prevSelectedIdBeforeNew) {
        const back = prevSelectedIdBeforeNew;
        prevSelectedIdBeforeNew = null;
        toView();
        select(back);
      } else {
        renderKV(els.view, ed.getInitial() || {}, cfg.fields, false);
        toView();
      }
    });
    els.btnDelete?.addEventListener("click", removeSel);

    // dblclick row => edit all, focus that key
    els.view?.addEventListener("dblclick", (e) => {
      const row = e.target.closest(".kv-row");
      if (!row) return;
      const key = row.dataset.key || "name";
      if (ed.mode === "view") {
        ed.setDraftFromInitial();
        toEdit(key);
      } else {
        focusField(els.view, key);
      }
    });

    // pager
    lp = createListPager({
      url: cfg.endpoints.listKeyset,
      pageSize: cfg.perPageDefault || 20,
      container: els.listBody,
      render: (container, rows, ctx) => {
        renderList(container, rows, ctx, (id) => select(id));
        // auto select first in page
        const ids = [...container.querySelectorAll(".cust-item")]
          .map((n) => n.dataset.id)
          .filter(Boolean);
        if (!selectedId && ids.length) {
          select(ids[0]);
        }
      },
      pageInfoEls: [els.pageInfo],
      prevButtons: [els.btnPrevTop, els.btnPrev],
      nextButtons: [els.btnNextTop, els.btnNext],
      queryKey: cfg.queryKey || "q",
    });
    lp.bindSearch(els.inputSearch, { debounceMs: cfg.debounceMs || 300 });
    lp.bindPerPage(els.selPerPage);

    renderKV(els.view, {}, cfg.fields, false);
    toView();
    lp.reloadFirst();
  }

  return { init, select };
}
