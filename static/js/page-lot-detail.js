// --- tiny helpers ---
async function jfetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `${res.status}: ${res.statusText}${text ? " — " + text : ""}`
    );
  }
  return res.json();
}
function toast(msg, ok = true) {
  const el = document.getElementById("toast");
  const txt = document.getElementById("toastText");
  if (!el || !txt) {
    alert(msg);
    return;
  }
  txt.textContent = msg;
  el.style.background = ok ? "rgba(17, 24, 39, .95)" : "rgba(153, 27, 27, .95)";
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 1600);
}

// ================================
document.addEventListener("DOMContentLoaded", () => {
  const lotId = new URLSearchParams(location.search).get("lot_id");
  if (!lotId) return toast("Missing lot_id in URL", false);

  const elLotNo = document.getElementById("lot_no");
  const elPlanned = document.getElementById("plannedQtyInput");
  const elDueDate = document.getElementById("dueDateInput");
  const btnSavePlanned = document.getElementById("btnSavePlanned");
  const btnCancelPlanned = document.getElementById("btnCancelPlanned");
  const elFinished = document.getElementById("finishedQty");
  const elStatus = document.getElementById("lotStatus");
  const elProg = document.getElementById("progressBar");
  const elProgLabel = document.getElementById("progressLabel");

  const btnMat = document.getElementById("btnViewMaterials");
  const btnTrav = document.getElementById("btnViewTravelers");
  const btnShip = document.getElementById("btnViewShipments");
  const btnRefresh = document.getElementById("btnRefresh");

  let originalPlannedQty = null;
  let originalDueDate = null;

  // ====== load header ======
  async function loadHeader() {
    try {
      const lot = await jfetch(`/api/v1/lots/${encodeURIComponent(lotId)}`);
      console.log(lot);
      console.log(lot.lot_no);
      originalPlannedQty = lot.planned_qty ?? 0;
      originalDueDate = lot.lot_due_date ?? null;
      elLotNo.textContent = "📄 Lot Detail: " + lot.lot_no;
      elPlanned.value = originalPlannedQty;
      elDueDate.value = originalDueDate ? lot.lot_due_date.split("T")[0] : "";
      elFinished.textContent = lot.finished_qty ?? "-";
      elStatus.textContent = lot.status ?? "-";

      hideEditButtons();

      const inv = await jfetch(
        `/api/v1/lot-shippments/lot/${encodeURIComponent(lotId)}/part-inventory`
      );
      const p = Math.max(0, Math.min(100, inv?.progress_percent ?? 0));
      elProg.style.width = `${p}%`;
      elProgLabel.textContent = `Progress: ${p}% (Finished ${
        inv.finished_qty ?? 0
      } / Planned ${inv.planned_qty ?? 0})`;
    } catch (err) {
      console.error(err);
      toast("Failed to load header", false);
    }
  }

  function showEditButtons() {
    btnSavePlanned.style.display = "inline-block";
    btnCancelPlanned.style.display = "inline-block";
  }
  function hideEditButtons() {
    btnSavePlanned.style.display = "none";
    btnCancelPlanned.style.display = "none";
  }

  // ตรวจจับการเปลี่ยนค่าทั้งสองช่อง
  function checkChanges() {
    const qtyChanged =
      parseFloat(elPlanned.value) !== parseFloat(originalPlannedQty);
    const dateChanged =
      elDueDate.value !==
      (originalDueDate ? originalDueDate.split("T")[0] : "");
    if (qtyChanged || dateChanged) showEditButtons();
    else hideEditButtons();
  }

  elPlanned.addEventListener("input", checkChanges);
  elDueDate.addEventListener("change", checkChanges);

  // SAVE
  btnSavePlanned.addEventListener("click", async () => {
    const qty = parseFloat(elPlanned.value);
    const date = elDueDate.value || null;
    if (isNaN(qty) || qty < 0) return toast("Invalid planned qty", false);

    try {
      await jfetch(`/api/v1/lots/${encodeURIComponent(lotId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planned_qty: qty,
          lot_due_date: date,
        }),
      });
      toast("✅ Lot updated successfully");
      originalPlannedQty = qty;
      originalDueDate = date;
      hideEditButtons();
      await loadHeader();
      await refreshAll();
    } catch (err) {
      console.error(err);
      toast("Update failed", false);
    }
  });

  // CANCEL
  btnCancelPlanned.addEventListener("click", () => {
    elPlanned.value = originalPlannedQty;
    elDueDate.value = originalDueDate ? originalDueDate.split("T")[0] : "";
    hideEditButtons();
  });

  // =================== TABLES ===================
  let tblMat = null;
  let tblTrav = null;
  let tblShip = null;

  function initTables() {
    /* global Tabulator */
    tblMat = new Tabulator("#materialTable", {
      layout: "fitColumns",
      placeholder: "No material usage",
      columns: [
        { title: "Batch", field: "batch_no", minWidth: 120 },
        { title: "Material", field: "material_name", minWidth: 160 },
        { title: "Qty", field: "qty", hozAlign: "right", width: 90 },
        { title: "UOM", field: "uom", width: 80, hozAlign: "center" },
        {
          title: "Used At",
          field: "used_at",
          minWidth: 140,
          formatter: (c) =>
            c.getValue() ? new Date(c.getValue()).toLocaleString() : "",
        },
      ],
    });

    tblTrav = new Tabulator("#travelerTable", {
      layout: "fitColumns",
      placeholder: "No travelers",
      columns: [
        { title: "Traveler No", field: "traveler_no", minWidth: 140 },
        { title: "Status", field: "status", width: 110 },
        {
          title: "Prod Due",
          field: "production_due_date",
          minWidth: 130,
          formatter: (c) =>
            c.getValue() ? new Date(c.getValue()).toLocaleDateString() : "",
        },
        { title: "Notes", field: "notes", minWidth: 200 },
      ],
    });

    tblShip = new Tabulator("#shipmentTable", {
      layout: "fitColumns",
      placeholder: "No shipments",
      columns: [
        { title: "Shipment No", field: "shipment_no", minWidth: 140 },
        {
          title: "Date",
          field: "date",
          minWidth: 120,
          formatter: (c) =>
            c.getValue() ? new Date(c.getValue()).toLocaleDateString() : "",
        },
        { title: "Customer", field: "customer_name", minWidth: 160 },
        { title: "Qty", field: "qty", hozAlign: "right", width: 90 },
        { title: "UOM", field: "uom", width: 80, hozAlign: "center" },
        { title: "Status", field: "status", width: 110, hozAlign: "center" },
      ],
    });
  }

  async function loadMaterials() {
    const rows = await jfetch(`/api/v1/lot-uses/${encodeURIComponent(lotId)}`);
    tblMat?.setData(rows || []);
  }

  async function loadTravelers() {
    let rows = [];
    try {
      rows = await jfetch(
        `/api/v1/travelers?lot_id=${encodeURIComponent(lotId)}`
      );
    } catch {
      rows = await jfetch(`/api/v1/travelers?q=${encodeURIComponent(lotId)}`);
    }
    tblTrav?.setData(rows || []);
  }

  async function loadShipments() {
    const rows = await jfetch(
      `/api/v1/lot-shippments/${encodeURIComponent(lotId)}`
    );
    tblShip?.setData(rows || []);
  }

  async function refreshAll() {
    await Promise.all([
      loadMaterials(),
      loadTravelers(),
      loadShipments(),
      loadHeader(),
    ]);
  }

  // scroll shortcuts
  btnMat?.addEventListener("click", () =>
    document
      .querySelector("#materialTable")
      ?.scrollIntoView({ behavior: "smooth" })
  );
  btnTrav?.addEventListener("click", () =>
    document
      .querySelector("#travelerTable")
      ?.scrollIntoView({ behavior: "smooth" })
  );
  btnShip?.addEventListener("click", () =>
    document
      .querySelector("#shipmentTable")
      ?.scrollIntoView({ behavior: "smooth" })
  );
  btnRefresh?.addEventListener("click", () => refreshAll());

  // boot
  initTables();
  refreshAll();
});
