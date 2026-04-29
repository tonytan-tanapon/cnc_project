async function load() {
  const qs = new URLSearchParams(location.search);
  const traveler_id = qs.get("traveler_id");

  if (!traveler_id) {
    alert("Missing traveler_id");
    return;
  }

  const traveler = await fetch(`/api/v1/travelers/${traveler_id}`)
    .then(r => r.json());

  document.getElementById("title").innerText =
    `Traveler #${traveler.traveler_no || traveler.id}`;

  document.getElementById("meta").innerText =
    `Lot: ${traveler.lot_no || "-"} | Status: ${traveler.status}`;

  const steps = await fetch(`/api/v1/traveler-steps?traveler_id=${traveler_id}`)
    .then(r => r.json());

  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";

  let totalRecv = 0;
  let totalAccept = 0;
  let totalReject = 0;

  let prevStepAccept = traveler.planned_qty || 0;

  steps.forEach(step => {

    let stepRecv = 0;
    let stepAccept = 0;
    let stepReject = 0;

    const logs = (step.logs && step.logs.length > 0)
      ? step.logs
      : [null];

    // 🔥 FIRST PASS → calculate totals first
    logs.forEach(log => {
      const recv = Number(log?.qty_receive || 0);
      const acc  = Number(log?.qty_accept || 0);
      const rej  = Number(log?.qty_reject || 0);

      stepRecv += recv;
      stepAccept += acc;
      stepReject += rej;
    });

    // 🔥 correct remain
    const remain = prevStepAccept - stepRecv;

    let firstRow = true;
    const rowspan = logs.length;

    logs.forEach(log => {

      const recv = Number(log?.qty_receive || 0);
      const acc  = Number(log?.qty_accept || 0);
      const rej  = Number(log?.qty_reject || 0);

      totalRecv += recv;
      totalAccept += acc;
      totalReject += rej;

      const tr = document.createElement("tr");

      if (rej > 0) tr.classList.add("reject");

      let opCell = "";
      let remainCell = "";

      if (firstRow) {
        opCell = `<td rowspan="${rowspan}"><b>${step.seq}</b></td>`;
        remainCell = `<td rowspan="${rowspan}"><b>${remain}</b></td>`;
        firstRow = false;
      }

      tr.innerHTML = `
        ${opCell}
        <td>${log?.work_date || "-"}</td>
        <td>${recv}</td>
        <td>${acc}</td>
        <td>${rej}</td>
        <td>${log?.operator_name || "-"}</td>
        <td>${stepRecv}</td>
        <td>${stepAccept}</td>
        <td>${stepReject}</td>
        ${remainCell}
      `;

      tbody.appendChild(tr);
    });

    // 🔥 update for next step
    prevStepAccept = stepAccept;
  });

  const summary = document.createElement("tr");
  summary.style.background = "#111";
  summary.style.color = "#fff";

  summary.innerHTML = `
    <td colspan="6"><b>GRAND TOTAL</b></td>
    <td><b>${totalRecv}</b></td>
    <td><b>${totalAccept}</b></td>
    <td><b>${totalReject}</b></td>
    <td></td>
  `;

  tbody.appendChild(summary);
}

load();