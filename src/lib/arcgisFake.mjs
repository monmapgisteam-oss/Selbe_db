/**
 * ЕРӨНХИЙ ХУУРАМЧ ArcGIS FEATURE SERVICE — бичих замын ЗАН ҮЙЛИЙН шалгуурт (2026-10-26, аудит T2).
 *   `aclE2E.fake.mjs`-ийн загвараар (тэр нь зөвхөн `Selbe_Permissions`-ийн 4 талбартай НЭГ хүснэгт), харин энд
 *   ОЛОН хүснэгт, REST (`fetch` — `…/query` · `…/applyEdits` · давхаргын мета) ба SDK (`FeatureLayer` ·
 *   `IdentityManager`) хоёуланг нэг санах ойн өгөгдлөөр.
 */
import { register } from 'node:module';

/** @typedef {Record<string, unknown>} Row */

export const fake = {
  /** layer URL (`…/FeatureServer/<№>`) → хүснэгт */
  tables: new Map(),
  /** `…/sharing/rest/search`-ийн `results` */
  searchResults: [],
  /** `IdentityManager.findCredential`-ийн хариу — `null` бол нэвтрээгүй */
  cred: /** @type {{ token: string, userId: string } | null} */ (null),
  /** Бүртгэлгүй хүсэлтүүд — хоосон байх ЁСТОЙ */
  unexpected: /** @type {string[]} */ ([]),
  /** Бүх хүсэлтийн тэмдэглэл: `{ via: 'rest'|'sdk'|'search', op, url, params }` */
  log: /** @type {{ via: string, op: string, url: string, params: Record<string, unknown> }[]} */ ([]),
  /** Нэмэлт REST чиглүүлэгч: `(url, params) => body | undefined` (давхаргын мета г.м.) — эхэлж шалгагдана */
  routes: /** @type {((url: string, params: Record<string, string>) => unknown)[]} */ ([]),
  /** Бичилтийн ДАРАА дуудагдана `(table, op)` — зэрэг бичигчийг дуурайх (жиш. мөрийн `at`-ийг өөрчлөх) */
  afterEdit: /** @type {null | ((t: FakeTable, op: string) => void)} */ (null),
  reset() {
    this.tables.clear();
    this.searchResults = [];
    this.cred = null;
    this.unexpected = [];
    this.log = [];
    this.routes = [];
    this.afterEdit = null;
  },
  /** Тэмдэглэлээс шүүх — `count('rest', 'applyEdits')` */
  count(via, op) { return this.log.filter((x) => (!via || x.via === via) && (!op || x.op === op)).length; },
};

/**
 * Хүснэгт бүртгэх.
 * @param {string} url  давхаргын бүтэн хаяг (`…/FeatureServer/0`)
 * @param {{ oid?: string, rows?: Row[], maxRecordCount?: number, fields?: string[] }} [o]
 */
export function addTable(url, o = {}) {
  const t = new FakeTable(url.replace(/\/+$/, ''), o);
  fake.tables.set(t.url, t);
  return t;
}

class FakeTable {
  constructor(url, { oid = 'objectid', rows = [], maxRecordCount = 2000, fields } = {}) {
    this.url = url;
    this.oid = oid;
    this.maxRecordCount = maxRecordCount;
    this.fields = fields;
    /** @type {Row[]} */
    this.rows = [];
    this.next = 1;
    /** `true` бол уншилт бүр 200 + `{error}` (REST) / шидэлт (SDK) */
    this.failReads = false;
    /** `true` бол мөр бүрийн бичилт амжилтгүй (`success:false` / `error`) */
    this.failWrites = false;
    for (const r of rows) this.insert(r);
  }

  insert(r) {
    const row = { ...r };
    if (row[this.oid] == null) row[this.oid] = this.next;
    this.next = Math.max(this.next, Number(row[this.oid]) + 1);
    this.rows.push(row);
    return row;
  }

  byOid(id) { return this.rows.find((r) => r[this.oid] === Number(id)); }

  /** Асуулга — `{ where, outFields, orderBy, offset, count, stats }` */
  query({ where = '1=1', outFields = ['*'], orderBy = [], offset = 0, count, stats }) {
    const hit = this.rows.filter(compileWhere(where));
    if (stats?.length) {
      const attributes = {};
      for (const s of stats) {
        const vals = hit.map((r) => r[s.onStatisticField]).filter((v) => v != null).map(Number);
        const name = s.outStatisticFieldName ?? `${s.statisticType}_${s.onStatisticField}`;
        attributes[name] = s.statisticType === 'max' ? (vals.length ? Math.max(...vals) : null)
          : s.statisticType === 'min' ? (vals.length ? Math.min(...vals) : null)
            : s.statisticType === 'count' ? vals.length
              : s.statisticType === 'sum' ? (vals.length ? vals.reduce((a, b) => a + b, 0) : null)
                : (() => { throw new Error(`хуурамч: танигдахгүй statisticType ${s.statisticType}`); })();
      }
      return { features: [{ attributes }], exceededTransferLimit: false };
    }
    const sorted = sortRows(hit, orderBy.length ? orderBy : [`${this.oid} ASC`]);
    const lim = Math.min(count ?? this.maxRecordCount, this.maxRecordCount);
    const page = sorted.slice(offset, offset + lim);
    const all = outFields.includes('*');
    return {
      features: page.map((r) => ({ attributes: all ? { ...r } : Object.fromEntries(outFields.map((f) => [f, r[f] ?? null])) })),
      exceededTransferLimit: offset + lim < sorted.length,
    };
  }

  /** Бичилт — нэгдсэн хэлбэр; мөр бүрийн `{ objectId, ok }` */
  edit({ adds = [], updates = [], deletes = [] }) {
    const out = { adds: [], updates: [], deletes: [] };
    for (const a of adds) {
      if (this.failWrites) { out.adds.push({ objectId: -1, ok: false }); continue; }
      const row = this.insert({ ...a, [this.oid]: undefined });
      out.adds.push({ objectId: row[this.oid], ok: true });
    }
    for (const u of updates) {
      const id = Number(u[this.oid]);
      const row = this.byOid(id);
      if (this.failWrites || !row) { out.updates.push({ objectId: id, ok: false }); continue; }
      Object.assign(row, u);
      out.updates.push({ objectId: id, ok: true });
    }
    for (const d of deletes) {
      const id = Number(d);
      const has = !!this.byOid(id);
      if (this.failWrites || !has) { out.deletes.push({ objectId: id, ok: false }); continue; }
      this.rows = this.rows.filter((r) => r[this.oid] !== id);
      out.deletes.push({ objectId: id, ok: true });
    }
    fake.afterEdit?.(this, 'applyEdits');
    return out;
  }
}

/* ══════════ `where` ══════════ */

/** `AND`-аар (литерал дотор биш) хуваана */
function splitAnd(w) {
  const parts = [];
  let q = false;
  let start = 0;
  for (let i = 0; i < w.length; i += 1) {
    if (w[i] === "'") { q = !q; continue; }
    if (q) continue;
    const m = /^\s+AND\s+/i.exec(w.slice(i));
    if (m) { parts.push(w.slice(start, i)); i += m[0].length - 1; start = i + 1; }
  }
  parts.push(w.slice(start));
  return parts.map((s) => s.trim()).filter(Boolean);
}

const lit = (s) => s.replace(/''/g, "'");
const tsMs = (s) => Date.parse(`${s.replace(' ', 'T')}Z`);
const likeRe = (p) => new RegExp(`^${lit(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 's');

function clause(c) {
  if (/^1\s*=\s*1$/.test(c)) return () => true;
  let m = /^LOWER\((\w+)\)\s*=\s*N?'((?:[^']|'')*)'$/i.exec(c);
  if (m) { const [, f, v] = m; return (r) => String(r[f] ?? '').toLowerCase() === lit(v); }
  m = /^(\w+)\s+(NOT\s+)?LIKE\s+N?'((?:[^']|'')*)'$/i.exec(c);
  if (m) { const [, f, not, p] = m; const re = likeRe(p); return (r) => re.test(String(r[f] ?? '')) !== !!not; }
  m = /^(\w+)\s+IN\s*\(([^)]*)\)$/i.exec(c);
  if (m) {
    const [, f, list] = m;
    const vals = list.split(',').map((x) => x.trim()).map((x) => (/^N?'/.test(x) ? lit(x.replace(/^N?'|'$/g, '')) : Number(x)));
    return (r) => vals.includes(typeof vals[0] === 'number' ? Number(r[f]) : String(r[f] ?? ''));
  }
  m = /^(\w+)\s*(=|<=|>=|<|>|<>)\s*(?:timestamp\s+'([^']+)'|N?'((?:[^']|'')*)'|(-?\d+(?:\.\d+)?))$/i.exec(c);
  if (m) {
    const [, f, op, ts, str, n] = m;
    const want = ts != null ? tsMs(ts) : str != null ? lit(str) : Number(n);
    const get = (r) => (ts != null ? Number(r[f]) : str != null ? String(r[f] ?? '') : Number(r[f]));
    return (r) => {
      const v = get(r);
      if (r[f] == null) return false;
      switch (op) {
        case '=': return v === want;
        case '<>': return v !== want;
        case '<=': return v <= want;
        case '>=': return v >= want;
        case '<': return v < want;
        default: return v > want;
      }
    };
  }
  throw new Error(`хуурамч ArcGIS: танигдахгүй where «${c}»`);
}

export function compileWhere(where) {
  const cs = splitAnd(String(where)).map(clause);
  return (r) => cs.every((f) => f(r));
}

function sortRows(rows, orderBy) {
  const keys = orderBy.flatMap((s) => String(s).split(',')).map((s) => s.trim()).filter(Boolean).map((s) => {
    const [f, dir] = s.split(/\s+/);
    return { f, desc: /^desc$/i.test(dir ?? '') };
  });
  return rows.slice().sort((a, b) => {
    for (const { f, desc } of keys) {
      const x = a[f];
      const y = b[f];
      if (x === y) continue;
      const c = x == null ? -1 : y == null ? 1 : x < y ? -1 : 1;
      return desc ? -c : c;
    }
    return 0;
  });
}

/* ══════════ REST (`fetch`) ══════════ */

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const parseList = (v) => (v == null || v === '' ? [] : String(v).trim().startsWith('[') ? JSON.parse(v) : String(v).split(','));

/** URL → `{ table, op }` (`op`: 'query' · 'applyEdits' · 'meta') */
function routeOf(url) {
  const u = url.replace(/\?.*$/, '').replace(/\/+$/, '');
  for (const t of fake.tables.values()) {
    if (u === t.url) return { table: t, op: 'meta' };
    if (u === `${t.url}/query`) return { table: t, op: 'query' };
    if (u === `${t.url}/applyEdits`) return { table: t, op: 'applyEdits' };
  }
  return null;
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const raw = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
  const params = Object.fromEntries(raw.entries());
  for (const fn of fake.routes) {
    const body = fn(url, params);
    if (body !== undefined) { fake.log.push({ via: 'rest', op: 'route', url, params }); return json(body); }
  }
  if (/\/sharing\/rest\/search$/.test(url.replace(/\?.*$/, ''))) {
    fake.log.push({ via: 'search', op: 'search', url, params });
    return json({ results: fake.searchResults });
  }
  const r = routeOf(url);
  if (!r) {
    fake.unexpected.push(`${init?.method ?? 'GET'} ${url}`);
    return json({ error: { code: 404, message: `хуурамч ArcGIS: бүртгэлгүй хаяг ${url}` } });
  }
  const { table: t, op } = r;
  fake.log.push({ via: 'rest', op, url, params });
  if (op === 'meta') {
    return json({ objectIdField: t.oid, maxRecordCount: t.maxRecordCount, fields: (t.fields ?? [t.oid]).map((name) => ({ name, type: name === t.oid ? 'esriFieldTypeOID' : 'esriFieldTypeString' })) });
  }
  if (op === 'query') {
    if (t.failReads) return json({ error: { code: 500, message: 'хуурамч: уншилт унав' } });
    return json(t.query({
      where: params.where,
      outFields: params.outFields ? params.outFields.split(',').map((s) => s.trim()) : ['*'],
      orderBy: params.orderByFields ? [params.orderByFields] : [],
      offset: Number(params.resultOffset ?? 0),
      count: params.resultRecordCount != null ? Number(params.resultRecordCount) : undefined,
      stats: params.outStatistics ? JSON.parse(params.outStatistics) : undefined,
    }));
  }
  const res = t.edit({
    adds: parseList(params.adds).map((f) => f.attributes),
    updates: parseList(params.updates).map((f) => f.attributes),
    deletes: parseList(params.deletes),
  });
  const conv = (xs) => xs.map((x) => (x.ok ? { objectId: x.objectId, success: true } : { objectId: x.objectId, success: false, error: { code: 500, description: 'хуурамч: бичилт татгалзав' } }));
  return json({ addResults: conv(res.adds), updateResults: conv(res.updates), deleteResults: conv(res.deletes) });
};

/* ══════════ SDK (`FeatureLayer` · `IdentityManager`) ══════════ */

class FakeFeatureLayer {
  constructor({ url }) {
    this.url = String(url).replace(/\/+$/, '');
    if (!fake.tables.has(this.url)) throw new Error(`хуурамч FeatureLayer: бүртгэлгүй хаяг ${url}`);
  }

  get table() { return fake.tables.get(this.url); }

  async load() { return this; }

  async queryFeatures(q) {
    await null;
    const t = this.table;
    fake.log.push({ via: 'sdk', op: 'query', url: this.url, params: { ...q } });
    if (t.failReads) throw new Error('хуурамч: уншилт унав');
    return t.query({
      where: q.where,
      outFields: q.outFields ?? ['*'],
      orderBy: q.orderByFields ?? [],
      offset: q.start ?? 0,
      count: q.num,
    });
  }

  async applyEdits(e) {
    await null;
    const t = this.table;
    fake.log.push({ via: 'sdk', op: 'applyEdits', url: this.url, params: { ...e } });
    const res = t.edit({
      adds: (e.addFeatures ?? []).map((f) => f.attributes),
      updates: (e.updateFeatures ?? []).map((f) => f.attributes),
      deletes: (e.deleteFeatures ?? []).map((d) => d.objectId),
    });
    const err = { code: 500, description: 'хуурамч: бичилт татгалзав' };
    const conv = (xs) => xs.map((x) => ({ objectId: x.objectId, error: x.ok ? null : err }));
    return { addFeatureResults: conv(res.adds), updateFeatureResults: conv(res.updates), deleteFeatureResults: conv(res.deletes) };
  }
}

globalThis.__arcgisFake_FeatureLayer = FakeFeatureLayer;
globalThis.__arcgisFake_esriId = { findCredential: () => fake.cred };

const hooks = `
const MAP = {
  '@arcgis/core/layers/FeatureLayer': 'export default globalThis.__arcgisFake_FeatureLayer;',
  '@arcgis/core/identity/IdentityManager': 'export default globalThis.__arcgisFake_esriId;',
};
export async function resolve(spec, ctx, next) {
  const src = MAP[spec] ?? MAP[spec.replace(/\\.js$/, '')];
  if (src) return { url: 'data:text/javascript,' + encodeURIComponent(src), shortCircuit: true };
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(hooks));

/** Төгсгөлийн баталгаа — бүртгэлгүй хүсэлт гараагүй */
export function assertNoUnexpected(assert) {
  assert.deepEqual(fake.unexpected, [], `хуурамч ArcGIS: бүртгэлгүй хүсэлт ${fake.unexpected.join(' · ')}`);
}
