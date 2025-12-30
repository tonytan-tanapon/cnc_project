export function applyLotLinks({
  lotId,
  travelerId = null,
  openInNewTab = true,
} = {}) {
  if (!lotId) return;

  const target = openInNewTab ? "_blank" : "_self";

  const map = [
    {
      id: "traveler_link",
      href: travelerId
        ? `/static/traveler-detail.html?id=${encodeURIComponent(travelerId)}`
        : `/static/traveler-detail.html?lot_id=${encodeURIComponent(lotId)}`,
      title: "Traveler",
    },
    {
      id: "material_link",
      href: `/static/manage-lot-materials.html?lot_id=${encodeURIComponent(
        lotId
      )}`,
      title: "Materials",
    },
    {
      id: "shippment_link",
      href: `/static/manage-lot-shippments.html?lot_id=${encodeURIComponent(
        lotId
      )}`,
      title: "Shipment",
    },
  ];

  map.forEach(({ id, href, title }) => {
    const el = document.getElementById(id);
    if (!el) return;

    // prevent double-apply
    if (el.tagName === "A") {
      el.href = href;
      return;
    }

    const a = document.createElement("a");
    a.href = href;
    a.title = title;
    a.target = target;
    a.style.textDecoration = "none";
    a.style.color = "inherit";

    while (el.firstChild) {
      a.appendChild(el.firstChild);
    }

    el.replaceWith(a);
  });
}
