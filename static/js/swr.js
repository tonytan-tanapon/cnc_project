// ============================================================================
// /static/js/swr.js
// Small, dependency-free SWR (stale-while-revalidate) helper
// - Cache by key (string)
// - Stale-while-revalidate with TTLs
// - De-dup concurrent requests
// - Subscribers (onUpdate) per key
// - mutate(key, data|fn) for optimistic updates
// - prefetch(key, fetcher)
// - Retry w/ backoff (optional)
// - Works great with CursorPager or plain fetchers
// ============================================================================

const _cache = new Map(); // key -> { data, error, ts, ttl, subs:Set, inFlight:Promise|null }
const _global = { dedupMs: 1000, defaultTTL: 30_000, retries: 1, retryDelayMs: 800 };

function _now(){ return Date.now(); }
function _ensure(key){
  if (!_cache.has(key)) _cache.set(key, { data: undefined, error: null, ts: 0, ttl: _global.defaultTTL, subs: new Set(), inFlight: null });
  return _cache.get(key);
}

export function setSWRConfig({ dedupMs, defaultTTL, retries, retryDelayMs }={}){
  if (dedupMs!=null) _global.dedupMs = dedupMs;
  if (defaultTTL!=null) _global.defaultTTL = defaultTTL;
  if (retries!=null) _global.retries = retries;
  if (retryDelayMs!=null) _global.retryDelayMs = retryDelayMs;
}

export function getCacheSnapshot(){
  const out = {}; _cache.forEach((v,k)=>{ out[k] = { ts:v.ts, ttl:v.ttl, hasData: v.data!==undefined, hasError: !!v.error }; });
  return out;
}

export function subscribe(key, fn){ const st=_ensure(key); st.subs.add(fn); return () => st.subs.delete(fn); }
function _notify(st){ st.subs.forEach(fn=>{ try{ fn(st.data, st.error); }catch{} }); }

export async function mutate(key, updater){
  const st = _ensure(key);
  const prev = st.data;
  try{
    const next = (typeof updater === 'function') ? updater(prev) : updater;
    st.data = next; st.error = null; st.ts = _now();
    _notify(st);
    return next;
  }catch(e){ st.error = e; _notify(st); throw e; }
}

async function _withRetry(fetcher){
  let attempt = 0, err;
  while (attempt <= _global.retries){
    try{ return await fetcher(); }catch(e){ err = e; if (attempt===_global.retries) break; await new Promise(r=>setTimeout(r, _global.retryDelayMs * (attempt+1))); attempt++; }
  }
  throw err;
}

export async function swr(key, fetcher, { ttl, revalidate=true } = {}){
  const st = _ensure(key);
  const freshEnough = _now() - st.ts < (ttl ?? st.ttl);
  // Return cached immediately
  if (st.data !== undefined && freshEnough){ return { data: st.data, error: st.error, fromCache: true, promise: null }; }

  // De-dup in-flight
  if (st.inFlight){ return { data: st.data, error: st.error, fromCache: st.data!==undefined, promise: st.inFlight }; }

  // Start fetch
  const job = _withRetry(fetcher).then((res)=>{
    st.data = res; st.error = null; st.ts = _now(); st.ttl = ttl ?? st.ttl; st.inFlight = null; _notify(st); return res;
  }).catch((e)=>{ st.error = e; st.inFlight = null; _notify(st); throw e; });

  st.inFlight = job;
  if (revalidate===false){ // caller will await promise manually if needed
    return { data: st.data, error: st.error, fromCache: st.data!==undefined, promise: job };
  }
  return { data: st.data, error: st.error, fromCache: st.data!==undefined, promise: job };
}

export async function prefetch(key, fetcher, opts){ return swr(key, fetcher, opts).promise; }
export function clear(key){ if (key) _cache.delete(key); else _cache.clear(); }

// Key helpers -------------------------------------------------------
export function makeKey(url, params={}){
  const usp = new URLSearchParams(); Object.entries(params).forEach(([k,v])=>{ if(v!==undefined && v!==null && v!=='') usp.set(k, String(v)); });
  const qs = usp.toString(); return qs ? `${url}?${qs}` : url;
}

// Example jfetch-based fetcher
export function fetchJSON(url, init){ return fetch(url, { headers:{'Accept':'application/json'}, ...init }).then(r=> r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))); }

/* ==================== Usage Examples ====================
import { swr, makeKey, fetchJSON, subscribe, mutate, setSWRConfig } from './swr.js';

setSWRConfig({ defaultTTL: 15000, retries: 2 });

const key = makeKey('/api/v1/customers', { q:'ac', limit:25 });
const { data, promise } = await swr(key, ()=> fetchJSON(key)); // immediate cache (maybe undefined), plus promise
await promise; // optional: await fresh data

// Subscribe to updates
const unsub = subscribe(key, (data, err)=>{ renderTable(data?.items||[]); });

// Optimistic update
await mutate(key, (prev)=> ({ ...prev, items: [{id:999, code:'TMP', name:'New'}, ...(prev?.items||[]) ] }));

// Revalidate manually
await prefetch(key, ()=> fetchJSON(key));

unsub();
*/


// ============================================================================
// /static/js/shortcuts.js
// Simple keyboard shortcuts manager (vanilla JS)
// - registerShortcuts(map, opts)
// - supports: Mod (Ctrl/Cmd), Shift, Alt, meta combos, multi-target
// - preventDefault, scoped to element, enable/disable, teardown
// - works well with tables/forms (save/cancel, quick search, etc.)
// ============================================================================

function normKey(k){ return k.trim().toLowerCase(); }
function parseCombo(combo){
  // e.g. 'Mod+K', 'Ctrl+S', 'Shift+Enter', 'Alt+ArrowUp'
  const parts = combo.split('+').map(s=>s.trim());
  const mods = { mod:false, ctrl:false, shift:false, alt:false, meta:false };
  let key = '';
  for (const p of parts){
    const l = p.toLowerCase();
    if (l==='mod'){ mods.mod = true; }
    else if (l==='ctrl' || l==='control'){ mods.ctrl = true; }
    else if (l==='shift'){ mods.shift = true; }
    else if (l==='alt' || l==='option'){ mods.alt = true; }
    else if (l==='meta' || l==='cmd' || l==='command'){ mods.meta = true; }
    else { key = l; }
  }
  return { key, mods };
}

function matchEvent(e, parsed){
  const { key, mods } = parsed;
  const isMod = e.ctrlKey || e.metaKey; // Mod = Ctrl on Win/Linux, Cmd on macOS
  const keyOk = (key ? e.key.toLowerCase() === key : true);
  return keyOk &&
    (!!mods.shift === !!e.shiftKey) &&
    (!!mods.alt === !!e.altKey) &&
    // explicit ctrl/meta or generic mod
    ((mods.mod ? isMod : true)) &&
    ((mods.ctrl ? e.ctrlKey : true)) &&
    ((mods.meta ? e.metaKey : true));
}

export function registerShortcuts(map, { target=document, preventDefault=true, stopPropagation=false, enabled=true } = {}){
  // map: { 'Mod+K': handler, 'Ctrl+S': handler, 'Escape': handler }
  const entries = Object.entries(map).map(([combo, fn])=> ({ combo, fn, parsed: parseCombo(combo) }));
  const state = { enabled };
  function onKey(e){
    if (!state.enabled) return;
    for (const it of entries){
      if (matchEvent(e, it.parsed)){
        if (preventDefault) e.preventDefault();
        if (stopPropagation) e.stopPropagation();
        try { it.fn(e); } catch(err){ console.error('[shortcuts]', err); }
        break;
      }
    }
  }
  target.addEventListener('keydown', onKey);
  return {
    enable(){ state.enabled = true; },
    disable(){ state.enabled = false; },
    destroy(){ target.removeEventListener('keydown', onKey); },
  };
}

/* ==================== Usage Examples ====================
import { registerShortcuts } from './shortcuts.js';

// Global app shortcuts
const sc = registerShortcuts({
  'Mod+K': () => openCommandPalette(),
  'Ctrl+S': () => saveCurrentForm(),
  'Escape': () => closeEditorIfAny(),
});

// Scoped to a specific table element
const table = document.getElementById('dataTable');
const tableSC = registerShortcuts({
  'ArrowUp': () => focusPrevRow(),
  'ArrowDown': () => focusNextRow(),
  'Enter': () => startEditFocusedCell(),
  'Shift+Enter': () => saveRow(),
}, { target: table, preventDefault: true });

// Temporarily disable
tableSC.disable(); // later -> tableSC.enable();
// Cleanup
tableSC.destroy();
*/
