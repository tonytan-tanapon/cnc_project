import { jfetch, toast } from "./api.js";

let tqwHistory = [];
let selectedHintIndex = 0;
const qs = new URLSearchParams(location.search);

const lotId = qs.get("lot_id");
const inspectionId = qs.get("inspection_id");

let inspection = null;
let inspectionItems = [];

let activeInput = null;
let activeRow = null;


function enableKeyboard() {

    document
        .getElementById("keyboard")
        .classList.remove("disabled");

}

function disableKeyboard() {

    document
        .getElementById("keyboard")
        .classList.add("disabled");

}


document.addEventListener("click", (e) => {

    if (
        !e.target.classList.contains("actual") &&
        !e.target.classList.contains("tqw")
    ) {
        return;
    }

    selectInput(e.target);

});

document.addEventListener("click", (e) => {

    if (
        e.target.classList.contains("actual") ||
        e.target.classList.contains("tqw") ||
        e.target.closest("#keyboard") ||
        e.target.closest(".tqw-dropdown")
    ) {
        return;
    }
    activeInput = null;
    activeRow = null;

    document
        .querySelectorAll(".tqw-dropdown")
        .forEach(x => x.classList.remove("show"));

    disableKeyboard();

});

function selectInput(input) {

    // กลับไปใช้ Custom Keyboard
    document.querySelectorAll(".actual,.tqw").forEach(i => {
        i.setAttribute("readonly", "");
        i.setAttribute("inputmode", "none");
        i.blur();
    });

    document
        .querySelectorAll("tr.active-row")
        .forEach(r => r.classList.remove("active-row"));

    activeInput = input;
    activeRow = input.closest("tr");

    activeRow.classList.add("active-row");

    enableKeyboard();

    input.focus();

    input.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}

document.addEventListener("input", (e) => {

    if (
        !e.target.classList.contains("actual") &&
        !e.target.classList.contains("tqw") &&
        !e.target.classList.contains("remark")
    ) {
        return;
    }

    const row = e.target.closest("tr");
    const id = Number(row.dataset.id);

    const item = inspectionItems.find(x => x.id === id);

    if (!item) return;

    if (e.target.classList.contains("actual")) {
        item.actual_value = e.target.value;
    }

    if (e.target.classList.contains("tqw")) {
        item.tqw = e.target.value;
    }

    if (e.target.classList.contains("remark")) {
        item.notes = e.target.value;
    }

    saveItem(item).catch(console.error);

});

function initKeyboard() {

    document
        .querySelectorAll(".key")
        .forEach(btn => {

            btn.onclick = () => {

                if (!activeInput)
                    return;

                if (btn.classList.contains("show-keyboard")) {

                    if (!activeInput) return;

                    activeInput.removeAttribute("readonly");
                    activeInput.removeAttribute("inputmode");

                    // บาง Tablet ต้อง blur ก่อน
                    activeInput.blur();

                    setTimeout(() => {
                        activeInput.focus();
                    }, 50);

                    return;
                }

                if (btn.classList.contains("clear")) {

                    activeInput.value = "";

                    const id = Number(activeRow.dataset.id);
                    const item = inspectionItems.find(x => x.id === id);

                    if (item) {

                        if (activeInput.classList.contains("actual")) {
                            item.actual_value = "";
                        } else {
                            item.tqw = "";
                        }

                        saveItem(item).catch(console.error);
                    }

                    return;
                }

                if (btn.classList.contains("enter")) {


                    const dropdown =
                        activeInput?.parentElement?.querySelector(".tqw-dropdown");

                    if (
                        dropdown &&
                        dropdown.classList.contains("show")
                    ) {

                        const selected =
                            dropdown.querySelector(".tqw-item.selected");

                        if (selected) {

                            selectHint(
                                activeInput,
                                selected.textContent,
                                dropdown
                            );

                            return;

                        }

                    }

                    if (!activeRow) return;

                    const nextRow = activeRow.nextElementSibling;

                    if (!nextRow) return;

                    let nextInput;

                    if (activeInput.classList.contains("actual")) {

                        nextInput = nextRow.querySelector(".actual");

                    } else {

                        nextInput = nextRow.querySelector(".tqw");

                    }

                    document
                        .querySelectorAll(".tqw-dropdown")
                        .forEach(x => x.classList.remove("show"));
                    selectInput(nextInput);

                    activeRow.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });

                    return;
                }

                if (btn.classList.contains("backspace")) {

                    activeInput.value =
                        activeInput.value.slice(0, -1);

                    updateHint(activeInput);

                    const id = Number(activeRow.dataset.id);

                    const item = inspectionItems.find(x => x.id === id);

                    if (item) {

                        if (activeInput.classList.contains("actual")) {

                            item.actual_value = activeInput.value;

                        }

                        if (activeInput.classList.contains("tqw")) {
                            item.tqw = activeInput.value;

                            loadTqwHistory();
                        }

                        saveItem(item).catch(console.error);

                    }

                    return;

                }

                activeInput.value += btn.dataset.key;
                updateHint(activeInput);

                if (activeInput.classList.contains("actual")) {
                    activeInput.value = normalizeValue(activeInput.value);
                }

                const id = Number(activeRow.dataset.id);

                const item = inspectionItems.find(x => x.id === id);

                if (item) {

                    if (activeInput.classList.contains("actual")) {
                        item.actual_value = activeInput.value;
                    }

                    if (activeInput.classList.contains("tqw")) {
                        item.tqw = activeInput.value;
                        loadTqwHistory();
                    }

                    saveItem(item).catch(console.error);
                }

            };

        });

}

function selectHint(input, value, dropdown) {

    input.value = value;

    const id = Number(activeRow.dataset.id);
    const item = inspectionItems.find(x => x.id === id);

    if (item) {
        item.tqw = value;

        loadTqwHistory();

        saveItem(item).catch(console.error);
    }

    dropdown.classList.remove("show");

    selectInput(input);
}

function normalizeValue(value) {

    if (value.startsWith(".")) {
        return "0" + value;
    }

    if (value.startsWith("-.")) {
        return value.replace("-.", "-0.");
    }

    return value;
}

async function loadInspection() {

    //------------------------------------
    // Inspection
    //------------------------------------

    inspection = await jfetch(
        `/qa-inspections/by-lot/${lotId}`
    );

    //------------------------------------
    // Lot
    //------------------------------------

    const lot = await jfetch(
        `/lots/${inspection.lot_id}`
    );
    console.log("Lot", lot);
    // document.getElementById("inspectionNo").textContent =
    //     inspection.id ?? "";

    document.getElementById("lotNo").textContent =
        lot.lot_no ?? "";

    document.getElementById("partNo").textContent =
        lot.part?.part_no ?? "";

    // document.getElementById("partName").textContent =
    //     lot.part?.part_name ?? "";

    document.getElementById("revision").textContent =
        lot.part_revision?.rev ?? "";

    document.getElementById("customer").textContent =
        lot.customer?.code ?? "";

    document.getElementById("poNo").textContent =
        lot.po?.po_number ?? "";

    //------------------------------------
    // Inspector
    //------------------------------------

    document.getElementById("inspector").value =
        inspection.inspector_name ?? "";

    //------------------------------------
    // Date
    //------------------------------------

    // if (inspection.inspection_date) {

    //     document.getElementById("inspectionDate").value =
    //         inspection.inspection_date.substring(0, 10);

    // }

    //------------------------------------
    // Items
    //------------------------------------

    inspectionItems =
        await jfetch(`/qa-inspections/${inspection.id}/items`);

    // ---------- Sort ----------
    const safeOp = (v) => {
        if (!v) return 9999;
        const m = String(v).match(/\d+/);
        return m ? parseInt(m[0], 10) : 9999;
    };

    const safeBb = (v) => {

        if (v === "-") return -1;

        if (!v) return 9999;

        const m = String(v).match(/\d+/);

        return m ? parseInt(m[0], 10) : 9999;
    };

    const grouped = {};

    inspectionItems.forEach(item => {

        const op = item.op_no || "999";

        if (!grouped[op])
            grouped[op] = [];

        grouped[op].push(item);

    });

    const sorted = [];

    Object.keys(grouped)
        .sort((a, b) => safeOp(a) - safeOp(b))
        .forEach(op => {

            grouped[op].sort(
                (a, b) => safeBb(a.bb_no) - safeBb(b.bb_no)
            );

            sorted.push(...grouped[op]);

        });

    inspectionItems = sorted;
    // --------------------------

    renderTable();
    loadTqwHistory();

    console.log(tqwHistory);

}

function formatDate(dateString) {

    if (!dateString) return "";

    const d = new Date(dateString);

    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);

    return `${mm}/${dd}/${yy}`;
}
function renderTable() {

    const tbody =
        document.getElementById("inspectionBody");

    tbody.innerHTML = "";

    inspectionItems.forEach(item => {

        const dimension = String(item.dimension ?? "")
            .trim()
            .toUpperCase();

        // ข้ามแถว DATE และ DIMENSIONS
        if (
            dimension === "DATE" ||
            dimension === "DIMENSIONS"
        ) {
            return;
        }

        const dateText = formatDate(item.qa_time_stamp);

        tbody.insertAdjacentHTML(
            "beforeend",
            `
<tr data-id="${item.id}">

    <td>${item.op_no ?? ""}</td>

    <td>${item.bb_no ?? ""}</td>

    <td>${item.dimension ?? ""}</td>

    <td class="tqw-cell">

    <div class="tqw-wrapper">

        <input
            class="tqw"
            readonly
            inputmode="none"
            value="${item.tqw ?? ""}">

        <div class="tqw-dropdown"></div>

    </div>

</td>

    <td>
        <input
            class="actual"
            readonly
            inputmode="none"
            value="${item.actual_value ?? ""}">
    </td>

    <td>
        <input
            class="remark"
            value="${item.notes ?? ""}">
    </td>

    <td>${dateText}</td>

</tr>
`
        );

    });

}

function updateHint(input) {

    if (!input.classList.contains("tqw"))
        return;

    const dropdown =
        input.parentElement.querySelector(".tqw-dropdown");

    const text = input.value.trim();

    dropdown.innerHTML = "";
    selectedHintIndex = 0;

    if (!text) {

        dropdown.classList.remove("show");
        return;

    }

    const found = tqwHistory.filter(x =>
        x.startsWith(text) &&
        x !== text
    );

    if (found.length === 0) {

        dropdown.classList.remove("show");
        return;

    }

    found.forEach((v, index) => {

        const div = document.createElement("div");

        div.className = "tqw-item";

        if (index === 0) {
            div.classList.add("selected");
        }

        div.textContent = v;

        div.onclick = (e) => {

            e.preventDefault();
            e.stopPropagation();

            selectHint(input, v, dropdown);

        };

        dropdown.appendChild(div);

    });

    dropdown.classList.add("show");

}
function loadTqwHistory() {

    tqwHistory = [
        ...new Set(
            inspectionItems
                .map(x => (x.tqw ?? "").trim())
                .filter(Boolean)
        )
    ];

}


async function saveItem(item) {

    // console.log("Saving...", item);

    const updated = await jfetch(
        `/qa-inspections/qa-items/${item.id}`,
        {
            method: "PUT",
            body: JSON.stringify({
                actual_value: item.actual_value,
                tqw: item.tqw,
                notes: item.notes,
            }),
            headers: {
                "Content-Type": "application/json"
            }
        }
    );

    // console.log("Saved", updated);

}

document.addEventListener("DOMContentLoaded", async () => {

    if (!inspectionId) {
        toast("Missing inspection_id", false);
        return;
    }

    initKeyboard();

    await loadInspection();

});



document
    .getElementById("btnBack")
    .addEventListener("click", () => {

        history.back();

    });