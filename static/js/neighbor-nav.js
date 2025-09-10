// /static/js/neighbor-nav.js
import { jfetch } from './api.js';

export function createNeighborNav({ keysetPath, getId = r => r.id }) {
  async function fetchNextId(currentId) {
    const r = await jfetch(`${keysetPath}?limit=1&cursor=${encodeURIComponent(currentId)}`);
    return r?.items?.length ? getId(r.items[0]) : null;
  }
  async function fetchPrevId(currentId) {
    const r = await jfetch(`${keysetPath}?limit=1&before=${encodeURIComponent(currentId)}`);
    return r?.items?.length ? getId(r.items[0]) : null;
  }
  return { fetchNextId, fetchPrevId };
}
