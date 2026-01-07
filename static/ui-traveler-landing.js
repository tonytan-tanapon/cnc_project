import { $, jfetch, toast } from "/static/js/api.js?v=1";
const API_BASE = ""; // same origin
const api = (p) => `${API_BASE}${p}`;

const manualInput = document.getElementById("manualInput");
const btnGo = document.getElementById("btnGo");
const scanInput = document.getElementById("scanInput");
const result = document.getElementById("result");


let scanTimer = null;


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
  const code = (value || "").trim();
  if (!code) return;

  console.log(`✅ handleCode (${source}):`, code);
  result.textContent = `${source.toUpperCase()}: ${code}`;

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
  location.href = `/static/ui-traveler.html?traveler_no=${encodeURIComponent(code)}&traveler_step=${encodeURIComponent(0)}&traveler_emp=${encodeURIComponent(pin)}`;

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
  for (let i = 1; i <= 9; i++) addKey(i);
  addKey(0);

  function addKey(n) {
    const btn = document.createElement("button");
    btn.textContent = n;
    btn.style.fontSize = "20px";
    btn.style.padding = "14px";
    btn.onclick = () => pressPin(n);
    keys.appendChild(btn);
  }
})();

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
  document.getElementById("pinDisplay").textContent =
    pinValue.padEnd(4, "-").replace(/./g, "•");
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