export async function loadPartial(selector, url) {
  const host = document.querySelector(selector);
  if (!host) return;

  const res = await fetch(url);
  if (!res.ok) return;

  host.innerHTML = await res.text();
}
