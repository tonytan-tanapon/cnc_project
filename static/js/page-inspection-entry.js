import { jfetch, toast } from "./api.js";

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
        e.target.closest("#keyboard")
    ) {
        return;
    }

    activeInput = null;
    activeRow = null;

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

                    if (!activeRow) return;

                    const nextRow = activeRow.nextElementSibling;

                    if (!nextRow) return;

                    let nextInput;

                    if (activeInput.classList.contains("actual")) {

                        nextInput = nextRow.querySelector(".actual");

                    } else {

                        nextInput = nextRow.querySelector(".tqw");

                    }

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

                    const id = Number(activeRow.dataset.id);

                    const item = inspectionItems.find(x => x.id === id);

                    if (item) {

                        if (activeInput.classList.contains("actual")) {

                            item.actual_value = activeInput.value;

                        }

                        if (activeInput.classList.contains("tqw")) {

                            item.tqw = activeInput.value;

                        }

                        saveItem(item)
                            .catch(console.error);

                    }

                    return;

                }

                activeInput.value += btn.dataset.key;

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
                    }

                    saveItem(item).catch(console.error);
                }

            };

        });

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

    // document.getElementById("inspectionNo").textContent =
    //     inspection.id ?? "";

    document.getElementById("lotNo").textContent =
        lot.lot_no ?? "";

    document.getElementById("partNo").textContent =
        lot.part?.part_no ?? "";

    document.getElementById("revision").textContent =
        lot.part_revision?.rev ?? "";

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

    <input
        class="tqw"
        readonly
        inputmode="none"
        value="${item.tqw ?? ""}">

    <span class="tqw-hint">${item.tqw ?? ""}</span>

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

function loadTqwHistory() {

    const list = document.getElementById("tqwHistory");

    list.innerHTML = "";

    const values = [
        ...new Set(
            inspectionItems
                .map(x => (x.tqw ?? "").trim())
                .filter(v => v)
        )
    ];

    values.forEach(v => {

        list.insertAdjacentHTML(
            "beforeend",
            `<option value="${v}"></option>`
        );

    });

}
async function saveItem(item) {

    console.log("Saving...", item);

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

    console.log("Saved", updated);

}

document.addEventListener("DOMContentLoaded", async () => {

    if (!inspectionId) {
        toast("Missing inspection_id", false);
        return;
    }

    initKeyboard();

    await loadInspection();

});

