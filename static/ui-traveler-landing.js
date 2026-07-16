import { $, jfetch, toast } from "/static/js/api.js?v=1";
const API_BASE = ""; // same origin
const api = (p) => `${API_BASE}${p}`;

const manualInput = document.getElementById("manualInput");
const btnGo = document.getElementById("btnGo");
const scanInput = document.getElementById("scanInput");
const result = document.getElementById("result");
const lotSearch =
    document.getElementById("lotSearch");
let currentSortField = "lot_no";

let currentSortDir = "asc";

let cachedRows = [];

let scanTimer = null;
let traver_id = null;
let traveler_no = null;
function renderLots(rows) {

    const tbody =
        document.querySelector("#lotTable tbody");

    tbody.innerHTML = "";

    rows.sort((a, b) => {

        const av =
            String(a[currentSortField] || "").toLowerCase();

        const bv =
            String(b[currentSortField] || "").toLowerCase();

        return currentSortDir === "asc"
            ? av.localeCompare(bv)
            : bv.localeCompare(av);

    });

    rows.forEach(row => {

        const tr = document.createElement("tr");

        const opStatusClass =
            row.op_status === "running"
                ? "status-running"
                : row.op_status === "passed"
                ? "status-passed"
                : "status-pending";

        tr.innerHTML = `
            <td>${row.lot_no || "-"}</td>
            <td>${row.part_no || "-"}</td>
            <td>${row.part_rev || "-"}</td>
            <td style="font-weight:700;color:#2563eb;">
                ${row.current_op || "-"}
            </td>
            <td style="font-weight:700;color:#059669;">
                ${row.current_machine || "-"}
            </td>
            <td>
                <span class="status-badge ${opStatusClass}">
                    ${row.op_status || "-"}
                </span>
            </td>
        `;

        tr.onclick = async () => {

            const traveler = await jfetch(
                api(`/travelers/by-lot-code/${encodeURIComponent(row.lot_no)}`)
            );

            if (!traveler || !traveler.traveler_no) {
                alert("Traveler not found");
                return;
            }

            traveler_no = traveler.traveler_no;

            const pin = await showPinPad();

            if (!pin) return;

            if (!(await verifyPin(pin))) {
                alert("❌ Invalid PIN");
                return;
            }

            openMachineSelect(row.lot_no, pin);

        };

        tbody.appendChild(tr);

    });

}
async function verifyLot(code) {

  try {

    const data = await jfetch(
      api(`/travelers/by-lot-code/${encodeURIComponent(code)}`)
    );

    console.log("Fetched lot data:", data);

    if (!data || !data.traveler_no) {
      return false;
    }

    // ✅ IMPORTANT
    traveler_no = data.traveler_no;

    console.log("traveler_no =", traveler_no);

    return true;

  } catch (err) {

    console.error(err);

    return false;
  }
}

async function verifyPin(pin) {
  // ✅ MOCK verification logic
  // In real app, replace with server call or real logic
  const data = await jfetch(
    api(`/employees/by-code/${encodeURIComponent(pin)}`)
  );
  console.log("Fetched employee data:", data);

  if (data && data.id) return true;
  return false; // only "1234" is valid
}

// ✅ ONE function used by BOTH manual + scan
async function handleCode(value, source = "scan") {
  // verifyLot(code)
  const code = (value || "").trim();

  if (!code) return;

  console.log(`✅ handleCode (${source}):`, code);
  result.textContent = `${source.toUpperCase()}: ${code}`;
  //check Lot no
  const isLotValid = await verifyLot(code);
  if (!isLotValid) {

    alert("❌ Invalid Lot Number");

    return;
  }

  // 🔐 Ask for PIN
  const pin = await showPinPad();

  // ❌ user closed keypad
  if (!pin) {
    result.textContent = "PIN cancelled";
    return;
  }

  console.log("🔑 PIN entered:", pin);

  // ✅ IMPORTANT: await here
  const isValid = await verifyPin(pin);
  console.log("PIN valid?", isValid);

  if (!isValid) {

    alert("❌ Invalid PIN");

    return;
  }

  // 🎯 SUCCESS
  //   alert(`✅ Access granted\nCode: ${code}`);
  openMachineSelect(traveler_no, pin);
  // 👉 REAL ACTION
  // location.href = `/static/ui-traveler.html?traveler_no=${encodeURIComponent(
  //   traveler_no
  // )}&seq=${encodeURIComponent(0)}&traveler_emp=${encodeURIComponent(pin)}`;
}

function setupSortableHeaders() {

  const headers =
    document.querySelectorAll("#lotTable th");

  const fields = [
    "lot_no",
    "part_no",
    "part_rev",
    "current_op",
    "current_machine",

    "op_status"
  ];

  headers.forEach((th, index) => {

    th.onclick = async () => {

      const field = fields[index];

      if (!field) return;

      // toggle asc/desc
      if (currentSortField === field) {

        currentSortDir =
          currentSortDir === "asc"
            ? "desc"
            : "asc";

      } else {

        currentSortField = field;

        currentSortDir = "asc";
      }

      // update arrows
      headers.forEach(h => {

        h.querySelector(".sort-arrow")
          ?.remove();
      });

      const arrow =
        document.createElement("span");

      arrow.className = "sort-arrow";

      arrow.innerText =
        currentSortDir === "asc"
          ? "▲"
          : "▼";

      th.appendChild(arrow);

      await loadInProcessLots();
    };
  });
}

async function loadInProcessLots() {

  try {

    cachedRows = await jfetch(
      api("api/v1/lots/in-process")
    );

    const rows = [...cachedRows];

    console.log("LOTS =", rows);

    const tbody = document.querySelector("#lotTable tbody");

    tbody.innerHTML = "";

cachedRows = rows;

renderLots(cachedRows);

  } catch (err) {

    console.error(err);

  }
}


// ======================================
// LOT NUMBER KEYPAD
// ======================================

const btnLotPad = document.getElementById("btnLotPad");

const lotOverlay = document.getElementById("lotOverlay");

const lotDisplay = document.getElementById("lotDisplay");

const lotKeys = document.getElementById("lotKeys");

const closeLotOverlay =
  document.getElementById("closeLotOverlay");

const lotOkBtn =
  document.getElementById("lotOkBtn");

const lotClearBtn =
  document.getElementById("lotClearBtn");

let lotValue = "";

// OPEN
btnLotPad?.addEventListener("click", () => {

  lotValue = "";

  renderLotDisplay();

  lotOverlay.style.display = "flex";
});

// CLOSE
closeLotOverlay?.addEventListener("click", () => {

  lotOverlay.style.display = "none";
});

// DISPLAY
function renderLotDisplay() {

  lotDisplay.innerText =
    "L" + (lotValue || "-----");
}

// CREATE KEYS
// CREATE KEYS
// CREATE KEYS
const layout = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["R", "0", "-"]
];

layout.flat().forEach(key => {

  const btn =
    document.createElement("button");

  btn.className = "pin-btn";

  btn.innerText = key;

  btn.onclick = () => {

    if (lotValue.length >= 20)
      return;

    lotValue += key;

    renderLotDisplay();
  };

  lotKeys.appendChild(btn);
});

// CLEAR
lotClearBtn?.addEventListener("click", () => {

  lotValue = lotValue.slice(0, -1);

  renderLotDisplay();
});


// OK
lotOkBtn?.addEventListener("click", async () => {

  if (!lotValue) return;

  // USE RAW LOT NUMBER
  let finalLot =
    "L" + lotValue.trim().toUpperCase();



  console.log(
    "Selected Lot:",
    finalLot
  );

  // CLOSE OVERLAY
  lotOverlay.style.display = "none";

  // USE NORMAL FLOW
  await handleCode(finalLot, "manual");

});


async function openMachineSelect(code, pin) {

  console.log("🔥 OPEN MACHINE SELECT");

  const res = await fetch("/api/v1/machines");
  const machines = await res.json();

  const list = document.getElementById("machineList");
  list.innerHTML = "";

  machines.forEach(m => {
    const btn = document.createElement("button");
    btn.className = "machine-btn";
    btn.innerText = m.code || m.name;

    btn.onclick = () => {
      console.log("SELECT MACHINE:", m);

      location.href =
        `/static/ui-traveler.html?traveler_no=${encodeURIComponent(traveler_no)}`
        + `&seq=0`
        + `&traveler_emp=${encodeURIComponent(pin)}`
        + `&machine_id=${m.id}`;
    };

    list.appendChild(btn);
  });

  document.getElementById("machineOverlay").style.display = "flex";
}

lotSearch.addEventListener("input", async () => {

    const q = lotSearch.value.trim();

    const url = q
        ? `/api/v1/lots/in-process?q=${encodeURIComponent(q)}`
        : `/api/v1/lots/in-process`;

    const rows = await jfetch(api(url));

    renderLots(rows);

});
// Default focus = scanner
window.addEventListener("DOMContentLoaded", async () => {

  // scanInput.focus();

  await loadInProcessLots();
  setupSortableHeaders();

});

// Click outside manual -> refocus scan
// document.addEventListener("click", (e) => {
//   if (e.target === manualInput || e.target === btnGo) return;
//   scanInput.focus({ preventScroll: true });
// });

// document.addEventListener("click", (e) => {

//     if (
//         e.target.closest("#lotSearch") ||
//         e.target.closest("#manualInput") ||
//         e.target.closest("#btnGo")
//     ) {
//         return;
//     }

//     scanInput.focus({ preventScroll: true });

// });

// Manual: Go button
btnGo.addEventListener("click", async () => {
  await handleCode(manualInput.value, "manual");
  manualInput.value = "";
  // scanInput.focus({ preventScroll: true });
});

// Manual: press Enter = same as Go
manualInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    btnGo.click();
  }
});

// Scan: auto trigger after scan finishes typing
// scanInput.addEventListener("input", () => {
//   clearTimeout(scanTimer);
//   scanTimer = setTimeout(async () => {
//     const value = scanInput.value;
//     scanInput.value = "";
//     await handleCode(value, "scan");
//     scanInput.focus({ preventScroll: true });
//   }, 150);
// });

/////////////////
let pinValue = "";
let pinResolve = null;

// Build keypad
(function buildPinPad() {
  const keys = document.getElementById("pinKeys");
  keys.innerHTML = ""; // reset

  const layout = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    ["del", 0, "clear"],
  ];

  layout.forEach((row) => {
    row.forEach((key) => {
      const btn = document.createElement("button");

      btn.className = "pin-btn";

      if (key === "del") {
        btn.textContent = "⌫";
        btn.onclick = () => deletePin();
      } else if (key === "clear") {
        btn.textContent = "Clear";
        btn.onclick = () => clearPin();
      } else {
        btn.textContent = key;
        btn.onclick = () => pressPin(key);
      }

      keys.appendChild(btn);
    });
  });
})();
function deletePin() {
  pinValue = pinValue.slice(0, -1);
  updatePinDisplay();
}

function clearPin() {
  pinValue = "";
  updatePinDisplay();
}
function showPinPad() {
  pinValue = "";
  updatePinDisplay();
  document.getElementById("pinOverlay").style.display = "flex";

  return new Promise((resolve) => {
    pinResolve = resolve;
  });
}

function hidePinPad() {
  document.getElementById("pinOverlay").style.display = "none";
}

function pressPin(n) {
  if (pinValue.length >= 4) return;
  pinValue += String(n);
  updatePinDisplay();

  if (pinValue.length === 4) {
    setTimeout(() => {
      pinResolve(pinValue);

      hidePinPad();
    }, 150);
  }
}

function updatePinDisplay() {
  const display = document.getElementById("pinDisplay");

  let html = "";
  for (let i = 0; i < 4; i++) {
    if (i < pinValue.length) {
      html += `<span class="pin-dot filled">•</span>`;
    } else {
      html += `<span class="pin-dot">-</span>`;
    }
  }

  display.innerHTML = html;
}
// Clear
// document.getElementById("pinClear").onclick = () => {
//   pinValue = "";
//   updatePinDisplay();
// };

// Close
document.getElementById("pinClose").onclick = () => {
  hidePinPad();
};
