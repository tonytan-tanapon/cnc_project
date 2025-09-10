// /static/js/pagination.js
// Reusable keyset + offset pagers
// - ใช้ jfetch ภายใน เพื่อให้ API base เสถียร
// - commit state เฉพาะเมื่อมีรายการ (rollback เมื่อหน้าว่าง)
// - มี nav.hasPrev / nav.hasNext สำหรับ UI

import { jfetch, getAPIBase } from './api.js';

/** สร้าง path + query (ยังไม่ต่อ base เพราะ jfetch จัดการ) */
function buildPath(path, params = {}) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') usp.set(k, String(v));
  });
  const q = usp.toString();
  return q ? `${path}${path.includes('?') ? '&' : '?'}${q}` : path;
}

/**
 * CursorPager2D
 * สมมติ endpoint รูปแบบ:
 *   GET /keyset?limit=..            -> หน้าแรก
 *   GET /keyset?cursor=<id>&limit=  -> Next (ไป "เก่า" กว่า เมื่อใช้ลำดับ DESC)
 *   GET /keyset?before=<id>&limit=  -> Prev (ไป "ใหม่" กว่า เมื่อใช้ลำดับ DESC)
 * และคืนค่า:
 *   { items, next_cursor, prev_cursor, has_more }
 *
 * หมายเหตุ:
 * - .first(): nav = { hasPrev:false, hasNext:has_more }
 * - .next():  nav = { hasPrev:true,  hasNext:has_more }
 * - .prev():  nav = { hasPrev:has_more, hasNext:true }
 */
export class CursorPager2D {
  /**
   * @param {Object} opts
   * @param {string} opts.url                  relative path เช่น '/customers/keyset'
   * @param {number} [opts.pageSize=25]
   * @param {(json:any)=>any[]} [opts.getItems]    map json → items
   * @param {(json:any)=>any}   [opts.getNext]     map json → next_cursor
   * @param {(json:any)=>any}   [opts.getPrev]     map json → prev_cursor
   * @param {(json:any)=>bool}  [opts.getHasMore]  map json → has_more
   */
  constructor({ url, pageSize = 25, getItems, getNext, getPrev, getHasMore }) {
    this.url = url;
    this.pageSize = pageSize;
    this._getItems = getItems || (r => r.items || []);
    this._getNext  = getNext  || (r => r.next_cursor ?? null);
    this._getPrev  = getPrev  || (r => r.prev_cursor ?? null);
    this._getHM    = getHasMore || (r => !!r.has_more);

    this._cursor = null;
    this._before = null;
    this._busy = false;
    this.meta = null;
    this.pageIndex = 1;

    // ✅ nav เริ่มต้น (ให้ list-pager ใช้ปิด/เปิดปุ่ม)
    this.nav = { hasPrev: false, hasNext: false };
  }
  reset(){ this._cursor=null; this._before=null; this._busy=false; this.meta=null; this.pageIndex=1; this.nav={hasPrev:false,hasNext:false}; }
  get busy(){ return this._busy; }

  async _fetch(params = {}) {
    const path = buildPath(this.url, { limit: this.pageSize, ...params });
    return jfetch(path, { method: 'GET', headers: { 'Accept': 'application/json' } });
  }

  _applyNav(op, json) {
    const hasMore = this._getHM(json);
    if (op === 'first') {
      this.nav = { hasPrev: false, hasNext: hasMore };
    } else if (op === 'next') {
      this.nav = { hasPrev: this.pageIndex >= 1, hasNext: hasMore };
    } else if (op === 'prev') {
      this.nav = { hasPrev: hasMore, hasNext: true };
    }
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
      this._applyNav('first', json);               // ✅ ตั้ง nav
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
      this._applyNav('next', json);                // ✅ ตั้ง nav
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
      this._applyNav('prev', json);                // ✅ ตั้ง nav
      return { items, hasMore: this._getHM(json), meta: json };
    } finally { this._busy = false; }
  }
}

/** OffsetPager (คงแนวคิดเดียวกัน) */
export class OffsetPager {
  constructor({ url, perPage = 20 }) {
    this.url = url;
    this.perPage = perPage;
    this.page = 1;
    this.pages = 1;
    this.exhausted = false;
    this.busy = false;
    this.meta = null;
    this.nav = { hasPrev: false, hasNext: true };
  }
  reset(){ this.page=1; this.pages=1; this.exhausted=false; this.meta=null; this.nav={hasPrev:false, hasNext:true}; }

  async next(params = {}) {
    if (this.busy || this.exhausted) return { items: [], hasMore: !this.exhausted, meta: this.meta, nav: { ...this.nav } };
    this.busy = true;
    try {
      const path = buildPath(this.url, { ...params, page: String(this.page), per_page: String(this.perPage) });
      const json = await jfetch(path, { method: 'GET', headers: { 'Accept': 'application/json' } });
      const items = json.items || [];
      this.meta = json;
      this.pages = Number(json.pages || 1);
      const hasMore = this.page < this.pages;
      this.exhausted = !hasMore;
      this.nav = { hasPrev: this.page > 1, hasNext: hasMore };
      if (items.length) this.page += 1; // commit เมื่อมีรายการ
      return { items, hasMore, meta: json, nav: { ...this.nav } };
    } finally { this.busy = false; }
  }
}
