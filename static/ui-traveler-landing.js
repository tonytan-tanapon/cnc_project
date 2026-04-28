import { $, jfetch, toast } from "/static/js/api.js?v=1";
const API_BASE = ""; // same origin
const api = (p) => `${API_BASE}${p}`;

const manualInput = document.getElementById("manualInput");
const btnGo = document.getElementById("btnGo");
const scanInput = document.getElementById("scanInput");
const result = document.getElementById("result");

let scanTimer = null;
let traver_id = null;
let traveler_no = null;

async function verifyLot(code) {
  // ✅ MOCK verification logic
  // In real app, replace with server call or real logic
  const data = await jfetch(
    api(`/travelers/by-lot-code/${encodeURIComponent(code)}`)
  );
  console.log("Fetched lot data:", data);

  if (data && data.id) traveler_no = data.traveler_no;
  return true;
  return false; // only "1234" is valid
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
    alert("❌ Invalid Lot Number. Please re-enter.");
    return handleCode(code, source); // 🔁 retry
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
    alert("❌ Invalid PIN. Please re-enter.");
    return handleCode(code, source); // 🔁 retry
  }

  // 🎯 SUCCESS
  //   alert(`✅ Access granted\nCode: ${code}`);

  // 👉 REAL ACTION
  location.href = `/static/ui-traveler.html?traveler_no=${encodeURIComponent(
    traveler_no
  )}&seq=${encodeURIComponent(0)}&traveler_emp=${encodeURIComponent(pin)}`;
}

// Default focus = scanner
window.addEventListener("DOMContentLoaded", () => {
  scanInput.focus();
});

// Click outside manual -> refocus scan
document.addEventListener("click", (e) => {
  if (e.target === manualInput || e.target === btnGo) return;
  scanInput.focus({ preventScroll: true });
});

// Manual: Go button
btnGo.addEventListener("click", async () => {
  await handleCode(manualInput.value, "manual");
  manualInput.value = "";
  scanInput.focus({ preventScroll: true });
});

// Manual: press Enter = same as Go
manualInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    btnGo.click();
  }
});

// Scan: auto trigger after scan finishes typing
scanInput.addEventListener("input", () => {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(async () => {
    const value = scanInput.value;
    scanInput.value = "";
    await handleCode(value, "scan");
    scanInput.focus({ preventScroll: true });
  }, 150);
});

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
document.getElementById("pinClear").onclick = () => {
  pinValue = "";
  updatePinDisplay();
};

// Close
document.getElementById("pinClose").onclick = () => {
  hidePinPad();
};
