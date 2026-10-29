/**
 * ЭРХИЙН E2E ШАЛГУУРЫН ХУУРАМЧ ArcGIS — `aclE2E*.check.mjs`-ийн нийтлэг орчин (2026-09-30).
 *
 * ХҮСНЭГТ: `Selbe_Permissions/0`-ийн дөрвөн талбар (`OBJECTID · username · role ·
 *    views · docs`) — `permsRemote.createTable`-ийн тодорхойлолттой ижил.
 */
import { register } from 'node:module';
import { setMaxListeners } from 'node:events';

/* ══════════ 1. Хөтөчийн глобалууд ══════════ */
const g = globalThis;
const et = new EventTarget();
setMaxListeners(0, et);
const mem = new Map();
g.window = g;
g.addEventListener = et.addEventListener.bind(et);
g.removeEventListener = et.removeEventListener.bind(et);
g.dispatchEvent = et.dispatchEvent.bind(et);
g.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(String(k), String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};

/** `window.confirm`-ийн бүх асуулт — шалгуур уншиж, дараа нь `takeConfirms()`-оор цэвэрлэнэ */
export const confirms = [];
let answer = true;
/** Дараагийн асуултуудын хариу (анхдагч — «OK») */
export const setConfirmAnswer = (v) => { answer = v; };
g.confirm = (msg) => { confirms.push(String(msg)); return answer; };
export const takeConfirms = () => confirms.splice(0, confirms.length);

/* ══════════ 2. Хуурамч хүснэгт ══════════ */
const TABLE = `${String(process.env.NEXT_PUBLIC_ENT_DATA ?? '').replace(/\/+$/, '')}/SYS_Selbe_Permissions/FeatureServer`;

export const fake = {
  /** @type {{OBJECTID:number, username:string, role:string|null, views:string|null, docs:number}[]} */
  rows: [],
  oid: 1,
  /** Явагдаж буй хүсэлтийн тоо — `settle()` */
  inflight: 0,
  /** applyEdits дуудлагын тоо */
  edits: 0,
  /** true бол applyEdits бүр алдаа (200 + error) буцаана */
  failWrites: false,
  /** Хүсэлт бүрийн хоцрол (мс) — уралдааны шалгуурт */
  latency: 0,
  /** Хүлээгээгүй `fetch` URL-ууд — хоосон байх ЁСТОЙ */
  unexpected: [],
  /** Хүснэгтийн эзэн — хатуу super байх ёстой (`permsRemote.findTableUrl`) */
  owner: '',
  /**
   * `true` бол хүснэгтийн хайлт ХООСОН, уншилт ШИДНЭ (2026-10-26: хүснэгт шууд хаягаар нээгддэг тул) — remote нэг ч удаа уншигдаагүй сешнийг
   * дуурайна (`initRemote` → false). `permsRemote` зөвхөн ОЛДСОН URL-ыг кэшилдэг тул
   * анхны амжилттай уншилтаас ӨМНӨ л утгатай (2026-09-30).
   */
  searchDown: false,
  failReads: false,
  seed(rows) {
    for (const r of rows) this.rows.push({ objectid: this.oid++, role: null, docs: 0, ...r });
  },
  /** Угтвар + хэрэглэгчийн мөрүүд (давхардлыг ч харуулна) */
  find(username) { return this.rows.filter((r) => r.username.toLowerCase() === username.toLowerCase()); },
  /** Угтвартай мөрийн `views` JSON (байхгүй бол `undefined`) */
  json(prefix, user) {
    const hit = this.find(prefix + user.toLowerCase());
    if (hit.length > 1) throw new Error(`давхар мөр: ${prefix}${user}`);
    return hit.length ? JSON.parse(hit[0].views) : undefined;
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wait = async () => { if (fake.latency) await sleep(Math.random() * fake.latency); };

/** `where` задлах — `permsRemote`-ийн хэлбэрүүд (2026-10-19: + `OBJECTID = n` — `removeMalformedRow`) */
function match(where) {
  if (where === '1=1') return () => true;
  const o = /^objectid = (\d+)$/.exec(where);
  if (o) return (r) => r.objectid === Number(o[1]);
  const m = /^LOWER\(username\) = '((?:[^']|'')*)'$/.exec(where);
  if (!m) throw new Error(`хуурамч FeatureLayer: танигдахгүй where «${where}»`);
  const key = m[1].replace(/''/g, "'");
  return (r) => r.username.toLowerCase() === key;
}

class FakeFeatureLayer {
  constructor({ url }) {
    if (!String(url).startsWith(TABLE)) throw new Error(`хуурамч FeatureLayer: өөр URL ${url}`);
  }

  async queryFeatures(q) {
    fake.inflight += 1;
    try {
      await wait();
      if (fake.failReads || fake.searchDown) throw new Error('fake read failure');
      const hit = fake.rows.filter(match(q.where)).sort((a, b) => a.objectid - b.objectid);
      const start = q.start ?? 0;
      const num = q.num ?? 2000;
      const page = hit.slice(start, start + num);
      return {
        features: page.map((r) => ({ attributes: { ...r } })),
        exceededTransferLimit: start + num < hit.length,
      };
    } finally {
      fake.inflight -= 1;
    }
  }

  async applyEdits(e) {
    fake.inflight += 1;
    fake.edits += 1;
    try {
      await wait();
      const err = fake.failWrites ? { code: 500, description: 'fake failure' } : null;
      const out = { addFeatureResults: [], updateFeatureResults: [], deleteFeatureResults: [] };
      for (const f of e.addFeatures ?? []) {
        if (err) { out.addFeatureResults.push({ objectId: -1, error: err }); continue; }
        const row = { role: null, docs: 0, ...f.attributes, objectid: fake.oid++ };
        fake.rows.push(row);
        out.addFeatureResults.push({ objectId: row.objectid, error: null });
      }
      for (const f of e.updateFeatures ?? []) {
        const id = f.attributes.objectid;
        const row = fake.rows.find((r) => r.objectid === id);
        if (err || !row) { out.updateFeatureResults.push({ objectId: id, error: err ?? { code: 404 } }); continue; }
        Object.assign(row, f.attributes);
        out.updateFeatureResults.push({ objectId: id, error: null });
      }
      for (const d of e.deleteFeatures ?? []) {
        const id = d.objectId;
        if (err) { out.deleteFeatureResults.push({ objectId: id, error: err }); continue; }
        fake.rows = fake.rows.filter((r) => r.objectid !== id);
        out.deleteFeatureResults.push({ objectId: id, error: null });
      }
      return out;
    } finally {
      fake.inflight -= 1;
    }
  }
}

g.__aclE2E_FeatureLayer = FakeFeatureLayer;
g.__aclE2E_esriId = {
  findCredential: () => ({ token: 'fake-token', userId: fake.owner }),
};

/* ══════════ 3. SDK модулийг хуурамч руу заах ══════════ */
const hooks = `
const MAP = {
  '@arcgis/core/layers/FeatureLayer': 'export default globalThis.__aclE2E_FeatureLayer;',
  '@arcgis/core/identity/IdentityManager': 'export default globalThis.__aclE2E_esriId;',
};
export async function resolve(spec, ctx, next) {
  const src = MAP[spec] ?? MAP[spec.replace(/\\.js$/, '')];
  if (src) return { url: 'data:text/javascript,' + encodeURIComponent(src), shortCircuit: true };
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(hooks));

/* ══════════ 4. fetch — зөвхөн хүснэгтийн хайлт ══════════ */
g.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (/\/sharing\/rest\/search$/.test(url)) {
    const body = {
      results: fake.searchDown ? [] : [{ title: 'Selbe_Permissions', url: TABLE, owner: fake.owner, access: 'org' }],
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url === `${TABLE}/230` || url === TABLE) return json({ type: 'Table', fields: [] });
  if (/\/Guitsetgel_talbe\/FeatureServer\/(189|191|192|193)\/query$/.test(url) && url.startsWith(TABLE.replace(/\/SYS_Selbe_Permissions\/FeatureServer$/, ''))) {
    return json({ features: [] });
  }
  fake.unexpected.push(`${init?.method ?? 'GET'} ${url}`);
  throw new TypeError(`aclE2E: сүлжээ хаалттай (${url})`);
};

/** Бүх бичилт/уншилт ба ACL-ийн дараалал дуустал хүлээнэ */
export async function settle(extra = () => false) {
  let idle = 0;
  const until = Date.now() + 10_000;
  const tick = () => new Promise((r) => (fake.latency ? setTimeout(r, 2) : setImmediate(r)));
  for (let i = 0; i < 2000 || Date.now() < until; i += 1) {
    await tick();
    idle = fake.inflight === 0 && !extra() ? idle + 1 : 0;
    if (idle < 6) continue;
    if (fake.latency) break;
    await new Promise((r) => setTimeout(r, 0));
    if (fake.inflight === 0 && !extra()) break;
    idle = 0;
  }
}
