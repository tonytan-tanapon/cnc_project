// /static/js/pagination.js
// ตัวช่วยเพจจิ้งแบบ Cursor (สองทิศ) และ Offset (ทางเลือก)
// ใช้ fetch แบบ native (อย่าลืม type="module" เวลา import)

//
// ──────────────────────────────────────────────────────────────────────────────
//  CursorPager2D (มาตรฐานใหม่) — endpoint ต้องคืน { items, next_cursor, prev_cursor, has_more }
//  - first(extra) → หน้าแรก (ไม่ส่ง cursor/before)
//  - next(extra)  → ส่ง cursor=<id สุดท้ายของหน้าเดิม>
//  - prev(extra)  → ส่ง before=<id แรกของหน้าเดิม>
//  หมายเหตุ: เซิร์ฟเวอร์ตอบ items เป็นลำดับ ASC เสมอ
// ──────────────────────────────────────────────────────────────────────────────
export class CursorPager2D {
  /**
   * @param {Object} opts
   * @param {string} opts.url                 - endpoint เช่น '/api/v1/customers/keyset'
   * @param {number} [opts.pageSize=25]       - limit ต่อหน้า
   * @param {(json:any)=>any[]} [opts.getItems]    - map json → items
   * @param {(json:any)=>any}   [opts.getNext]     - map json → next_cursor
   * @param {(json:any)=>any}   [opts.getPrev]     - map json → prev_cursor
   * @param {(json:any)=>bool}  [opts.getHasMore]  - map json → has_more
   */
  constructor({ url, pageSize = 25, getItems, getNext, getPrev, getHasMore }) {
    this.url = url;
    this.pageSize = pageSize;
    this._getItems = getItems || (r => r.items || []);
    this._getNext  = getNext  || (r => r.next_cursor ?? null);
    this._getPrev  = getPrev  || (r => r.prev_cursor ?? null);
    this._getHM    = getHasMore || (r => !!r.has_more);

    this._cursor = null;   // สำหรับ next
    this._before = null;   // สำหรับ prev
    this._busy = false;
    this.meta = null;      // เก็บ response ล่าสุด (เผื่อใช้)
    this.pageIndex = 1;    // นับหน้าแบบ UX (1-based)
  }

  reset() {
    this._cursor = null;
    this._before = null;
    this._busy = false;
    this.meta = null;
    this.pageIndex = 1;
  }
  get busy() { return this._busy; }

  async _fetch(params = {}) {
    const usp = new URLSearchParams();
    const p = { limit: this.pageSize, ...params };
    Object.entries(p).forEach(([k,v]) => {
      if (v != null && v !== '') usp.set(k, String(v));
    });
    const res = await fetch(`${this.url}?${usp.toString()}`, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async first(extra = {}) {
    if (this._busy) return { items: [], hasMore: false };
    this._busy = true;
    try {
      const json = await this._fetch({ ...extra, limit: this.pageSize });
      const items = this._getItems(json);
      this._cursor = this._getNext(json);
      this._before = this._getPrev(json);
      this.meta = json;
      this.pageIndex = 1;
      return { items, hasMore: this._getHM(json), meta: json };
    } finally { this._busy = false; }
  }

  async next(extra = {}) {
    if (this._busy) return { items: [], hasMore: false };
    this._busy = true;
    try {
      const json = await this._fetch({ ...extra, cursor: this._cursor, limit: this.pageSize });
      const items = this._getItems(json);
      this._cursor = this._getNext(json);
      this._before = this._getPrev(json);
      this.meta = json;
      this.pageIndex += 1;
      return { items, hasMore: this._getHM(json), meta: json };
    } finally { this._busy = false; }
  }

  async prev(extra = {}) {
    if (this._busy) return { items: [], hasMore: false };
    this._busy = true;
    try {
      const json = await this._fetch({ ...extra, before: this._before, limit: this.pageSize });
      const items = this._getItems(json);
      this._cursor = this._getNext(json);
      this._before = this._getPrev(json);
      this.meta = json;
      this.pageIndex = Math.max(1, this.pageIndex - 1);
      return { items, hasMore: this._getHM(json), meta: json };
    } finally { this._busy = false; }
  }
}

//
// ──────────────────────────────────────────────────────────────────────────────
//  OffsetPager (ตัวเลือก) — สำหรับ endpoint เดิมที่ใช้ page/per_page/total/pages
// ──────────────────────────────────────────────────────────────────────────────
export class OffsetPager {
  constructor({ url, perPage = 20 }) {
    this.url = url;
    this.perPage = perPage;
    this.page = 1;
    this.pages = 1;
    this.exhausted = false;
    this.busy = false;
    this.meta = null;
  }
  reset() { this.page = 1; this.pages = 1; this.exhausted = false; this.meta = null; }
  async next(params = {}) {
    if (this.busy || this.exhausted) return { items: [], hasMore: !this.exhausted };
    this.busy = true;
    try {
      const usp = new URLSearchParams();
      Object.entries(params).forEach(([k,v]) => { if (v!=null && v!=='') usp.set(k, v); });
      usp.set('page', String(this.page));
      usp.set('per_page', String(this.perPage));
      const res = await fetch(`${this.url}?${usp.toString()}`, { headers: { 'Accept':'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items = json.items || [];
      this.meta = json;
      this.pages = Number(json.pages || 1);
      const hasMore = this.page < this.pages;
      this.exhausted = !hasMore;
      this.page += 1;
      return { items, hasMore, meta: json };
    } finally { this.busy = false; }
  }
}
