const qs = new URLSearchParams(location.search);
const step_id = qs.get("step_id");
const traveler_id = qs.get("traveler_id");
console.log("Step ID:", step_id);
console.log("Traveler ID:", traveler_id);

if (!step_id) {
  alert("Missing step_id");
  throw new Error("No step_id");
}

document.getElementById("form").addEventListener("submit", async (e) => {


  e.preventDefault();

  const payload = {
    step_id: Number(step_id),
    work_date: document.getElementById("work_date").value || null,
    qty_accept: Number(document.getElementById("qty_accept").value || 0),
    qty_reject: Number(document.getElementById("qty_reject").value || 0),
    operator_name: document.getElementById("operator_name").value || null
  };

  console.log("Payload:", payload);

  try {
    const res = await fetch(`/api/v1/step-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      alert("Error: " + err);
      return;
    }

  //   // ✅ redirect back
  //   if (traveler_id) {
  //     location.href = `/static/traveler-detail.html?traveler_id=${traveler_id}`;
  //   } else {
  //     history.back();
  //   }

  } catch (err) {
    alert("Failed to save");
  }
});