/**
 * МЕТАГИЙН КЭШ · НЭГДСЭН INTERCEPTOR · СЕРВЕРИЙН ИТГЭМЖЛЭЛ — шалгуур (2026-10-22, гүйцэтгэл).
 *   SELBE_ENT_OFF=1 node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/metaCache.check.mjs
 *
 * Шалгах зүйл:
 *   · `metaKey` — зөвхөн GET/JSON мета (`FeatureServer[/№]` · `MapServer` · `ImageServer` · `VectorTileServer`), параметр нь
 *     зөвхөн `f` (+ `returnAdvancedSymbols`); `/query` · `/applyEdits` · дэд нөөц · өөр параметр · ил токен · POST → `null`;
 *   · `sharedCopy` — гүн хуулбар, `editingInfo.*LastEditDate` → `null` (refresh «өөрчлөгдөөгүй» гэж худал хэлэхгүй);
 *   · `createMetaCache` — эзэн/хүлээгч/хит, TTL, алдаа хадгалахгүй, `clear` явж буйг хадгалуулахгүй, хэт удсан эзэн;
 *   · `makeEntInterceptor` — итгэмжлэлийг хүсэлтийн ӨМНӨ (нэвтэрсэн үед л, цонхгүй, уналтын дараа завсарлага),
 *     ХӨРВҮҮЛСЭН хариу кэшлэгдэнэ, зэрэг хүсэлт нэг татлага, бичилт кэшийг хаяна, хэрэглэгч бүр тусдаа;
 *   · `authToken.primeServerCredential` — хэзээ ч шидэхгүй, хугацаа хэтэрвэл `false`.
 */
import assert from 'node:assert/strict';
import {
  metaKey, sharedCopy, mutatesData, createMetaCache, META_URL_RE,
} from './metaCache.ts';
import { makeEntInterceptor } from './entInterceptor.ts';
import { entDictFor } from './services/entMap.ts';
import { registerIdentity, primeServerCredential } from './authToken.ts';

const SRV = 'https://gis.example.mn/map/rest/services';
const ENT = `${SRV}/Hosted`;
const PORTAL_SHARING = 'https://gis.example.mn/portal/sharing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ══════════ metaKey ══════════ */
{
  const k = metaKey(`${ENT}/Svc/FeatureServer/3`, { query: { f: 'json' }, responseType: 'json' });
  assert.ok(k && k.includes('/Hosted/Svc/FeatureServer/3?f=json'), k);
  // query string ба query объект — ижил түлхүүр; pjson = json; undefined/null параметр үл тооцно; `/` төгсгөл
  assert.equal(metaKey(`${ENT}/Svc/FeatureServer/3/?f=pjson`, {}), k);
  assert.equal(metaKey(`${ENT}/Svc/FeatureServer/3`, { query: { f: 'json', token: undefined, gdbVersion: null } }), k);
  // returnAdvancedSymbols — түлхүүрт орно (өөр хариу)
  const ka = metaKey(`${ENT}/Svc/FeatureServer/3`, { query: { f: 'json', returnAdvancedSymbols: true } });
  assert.ok(ka && ka !== k && ka.includes('returnadvancedsymbols=true'));
  // үйлчилгээний үндэс · MapServer · ImageServer · VectorTileServer · бусад хост
  for (const u of [`${ENT}/Svc/FeatureServer`, `${SRV}/Ortho/MapServer`, `${SRV}/Ortho/ImageServer`, `${ENT}/Road/VectorTileServer`,
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer']) {
    assert.ok(metaKey(u, { query: { f: 'json' } }), u);
  }
  // хэрэглэгч бүр тусдаа
  assert.notEqual(metaKey(`${ENT}/Svc/FeatureServer/3`, { query: { f: 'json' } }, 'u1'), metaKey(`${ENT}/Svc/FeatureServer/3`, { query: { f: 'json' } }, 'u2'));
  // мета БИШ → null
  for (const u of [`${ENT}/Svc/FeatureServer/3/query`, `${ENT}/Svc/FeatureServer/3/applyEdits`, `${ENT}/Svc/FeatureServer/layers`,
    `${SRV}/Ortho/MapServer/tile/1/2/3`, `${ENT}/Road/VectorTileServer/resources/styles/root.json`, `${SRV}/Ortho/ImageServer/rasterFunctionInfos`,
    `${ENT}/Svc/SceneServer`, `${ENT}/Svc/FeatureServer/3/12/attachments`]) {
    assert.equal(metaKey(u, { query: { f: 'json' } }), null, u);
  }
  // өөр параметр · ил токен · f алга · POST · бие · зураг/массив хариу · буруу хаяг → null
  assert.equal(metaKey(`${ENT}/Svc/FeatureServer/3`, { query: { f: 'json', returnUpdates: true } }), null);
  assert.equal(metaKey(`${ENT}/Svc/FeatureServer/3`, { query: { f: 'json', _ts: 1 } }), null);
  assert.equal(metaKey(`${ENT}/Svc/FeatureServer/3`, { query: { f: 'json', token: 'x' } }), null);
  assert.equal(metaKey(`${ENT}/Svc/FeatureServer/3?f=json&token=x`, {}), null);
  assert.equal(metaKey(`${ENT}/Svc/FeatureServer/3`, { query: {} }), null);
  assert.equal(metaKey(`${ENT}/Svc/FeatureServer/3`, { query: { f: 'pbf' } }), null);
  assert.equal(metaKey(`${ENT}/Svc/FeatureServer/3`, { query: { f: 'json' }, method: 'post' }), null);
  assert.equal(metaKey(`${ENT}/Svc/FeatureServer/3`, { query: { f: 'json' }, body: 'x' }), null);
  assert.equal(metaKey(`${ENT}/Svc/FeatureServer/3`, { query: { f: 'json' }, responseType: 'array-buffer' }), null);
  assert.equal(metaKey(`${ENT}/Svc/FeatureServer/3`, { query: { f: 'json', outFields: ['a'] } }), null);
  assert.equal(metaKey('not a url', { query: { f: 'json' } }), null);
  // interceptor-ын `urls` RegExp — мета таарна, асуулга/тайл таарахгүй
  assert.ok(META_URL_RE.test('https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer'));
  assert.ok(META_URL_RE.test(`${ENT}/Svc/FeatureServer/3?f=json`));
  assert.ok(!META_URL_RE.test(`${ENT}/Svc/FeatureServer/3/query`));
  assert.ok(!META_URL_RE.test(`${SRV}/Ortho/MapServer/tile/1/2/3`));
}

/* ══════════ sharedCopy · mutatesData ══════════ */
{
  const src = { type: 'Feature Layer', fields: [{ name: 'A' }], editingInfo: { lastEditDate: 5, dataLastEditDate: 6, schemaLastEditDate: 7 } };
  const c = sharedCopy(src);
  assert.deepEqual(c.editingInfo, { lastEditDate: null, dataLastEditDate: null, schemaLastEditDate: null });
  assert.equal(src.editingInfo.lastEditDate, 5, 'эх хөндөгдөхгүй');
  c.fields[0].name = 'Z';
  assert.equal(src.fields[0].name, 'A', 'гүн хуулбар');
  assert.deepEqual(sharedCopy({ type: 'x', fields: [] }), { type: 'x', fields: [] });
  // бичилтийг АРГААР: ил POST/PUT/DELETE эсвэл бие (JS API applyEdits · хавсралт · upload); уншилт method-гүй
  for (const ro of [{ method: 'post' }, { method: 'POST' }, { method: 'delete' }, { method: 'put' }, { body: {} }]) {
    assert.ok(mutatesData(ro), JSON.stringify(ro));
  }
  for (const ro of [undefined, null, {}, { method: 'auto' }, { method: 'get' }, { method: 'head' }, { query: { f: 'json' } }]) {
    assert.ok(!mutatesData(ro), JSON.stringify(ro));
  }
}

/* ══════════ createMetaCache ══════════ */
{
  let t = 1_000;
  const m = createMetaCache({ ttlMs: 100, joinMs: 50, max: 2, now: () => t });
  const meta = { type: 'Feature Layer', fields: [], editingInfo: { lastEditDate: 42 } };
  const a = m.claim('a');
  assert.equal(a.kind, 'own');
  const w = m.claim('a');
  assert.equal(w.kind, 'wait', 'явж буй хүсэлтийг хүлээнэ');
  m.settle('a', a.ticket, meta);
  const got = await w.data;
  assert.equal(got.editingInfo.lastEditDate, null, 'хүлээгч — хуваалцсан хуулбар');
  const h1 = m.claim('a');
  assert.equal(h1.kind, 'hit');
  assert.equal(h1.data.editingInfo.lastEditDate, null);
  h1.data.fields.push('x');
  assert.equal(m.claim('a').data.fields.length, 0, 'хит бүр өөрийн хуулбар');
  meta.fields.push('mutated');
  assert.equal(m.claim('a').data.fields.length, 0, 'хадгалсан нь эзний объектоос салангид');
  t += 101;
  assert.equal(m.claim('a').kind, 'own', 'TTL дууссан');
  // алдаа · undefined хадгалагдахгүй, хүлээгч undefined авна
  const b = m.claim('b');
  const bw = m.claim('b');
  m.settle('b', b.ticket, { error: { code: 499 } });
  assert.equal(await bw.data, undefined);
  assert.equal(m.claim('b').kind, 'own');
  // clear — явж буй хариу хадгалагдахгүй, хүлээгч чөлөөлөгдөнө
  const c = m.claim('c');
  const cw = m.claim('c');
  m.clear();
  assert.equal(await cw.data, undefined);
  m.settle('c', c.ticket, meta);
  assert.equal(m.claim('c').kind, 'own', 'clear-ээс өмнө эхэлсэн татлага кэшид суухгүй');
  // хэт удсан эзэн — дараагийнх нь эзэн болно
  const d1 = m.claim('d');
  t += 60;
  const d2 = m.claim('d');
  assert.equal(d2.kind, 'own');
  m.settle('d', d1.ticket, meta); // хуучин эзний хариу ч үе таарвал хадгалагдана (ижил хаяг)
  // хамгийн их бичлэг — хуучнаас нь хаяна
  m.clear();
  for (const k of ['k1', 'k2', 'k3']) { const o = m.claim(k); m.settle(k, o.ticket, meta); }
  assert.equal(m.size, 2);
  assert.equal(m.claim('k1').kind, 'own', 'хамгийн хуучин нь хаягдсан');
}
{
  // хүлээлтийн дээд хугацаа (бодит цаг) — эзэн хариугүй алга болсон ч хүлээгч гацахгүй
  const m = createMetaCache({ joinMs: 30 });
  m.claim('x');
  const w = m.claim('x');
  const t0 = Date.now();
  assert.equal(await w.data, undefined);
  assert.ok(Date.now() - t0 < 1_000);
}

/* ══════════ makeEntInterceptor ══════════ */
const D = entDictFor({ oid: 'OBJECTID', f: ['OBJECTID', 'BAGTS'] });
const svcOf = (u) => u.replace(/\/(FeatureServer|MapServer|ImageServer|VectorTileServer)\b.*$/i, '/$1');

function fakeId({ portal = true, server = false, fail = false, hang = false } = {}) {
  const st = { cred: server ? { userId: 'u1' } : null, svcs: new Set(server ? [SRV] : []), calls: [] };
  st.id = {
    findCredential(url) {
      if (url === PORTAL_SHARING) return portal ? { userId: 'u1', scope: 'portal' } : undefined;
      if (!st.cred) return undefined;
      return st.svcs.has(url === SRV ? SRV : svcOf(url)) ? st.cred : undefined;
    },
    getCredential(url, opts) {
      st.calls.push([url, opts]);
      if (hang) return new Promise(() => {});
      if (fail || (!portal && !st.cred)) return Promise.reject(new Error('identity-manager:not-authenticated'));
      st.cred ??= { userId: 'u1' };
      st.svcs.add(url === SRV ? SRV : svcOf(url));
      return Promise.resolve(st.cred);
    },
  };
  return st;
}

function setup(opts = {}, extra = {}) {
  const st = fakeId(opts);
  let t = 10_000;
  const cache = createMetaCache({ now: () => t });
  const ic = makeEntInterceptor({
    entServer: SRV, isEntData: (u) => u.startsWith(`${ENT}/`), dictOf: () => D, id: () => st.id,
    sessionUrls: [PORTAL_SHARING, SRV], cache, now: () => t, ...extra,
  });
  const net = [];
  /** JS API `request`-ийн дүр: before → (сүлжээ) → after/error */
  const request = async (url, ro = {}, respond = () => ({})) => {
    const p = { url, requestOptions: { ...ro } };
    const pre = await ic.before(p);
    if (pre !== undefined) return { data: pre, cached: true, ro: p.requestOptions };
    net.push(url);
    try {
      const data = await respond(p);
      const r = { url, data, requestOptions: p.requestOptions };
      ic.after(r);
      return { data: r.data, cached: false, ro: p.requestOptions };
    } catch (e) {
      ic.error(Object.assign(new Error(String(e?.message ?? e)), { details: { url, requestOptions: p.requestOptions } }));
      throw e;
    }
  };
  return { st, ic, cache, net, request, tick: (ms) => { t += ms; } };
}

const rawMeta = () => ({
  type: 'Feature Layer', fields: [{ name: 'objectid' }, { name: 'bagts' }], objectIdField: 'objectid',
  supportedQueryFormats: 'JSON, geoJSON, PBF', editingInfo: { lastEditDate: 1_792_485_847_539 },
});
const L3 = `${ENT}/Svc/FeatureServer/3`;
const Q = { query: { f: 'json' }, responseType: 'json' };

{
  // urls: Enterprise сервер бүхэлдээ + бусад хостын мета
  const { ic } = setup();
  assert.equal(ic.urls[0], `${SRV}/`);
  assert.ok(ic.urls[1] instanceof RegExp);
}
{
  // ИТГЭМЖЛЭЛ хүсэлтийн ӨМНӨ: порталд нэвтэрсэн, үйлчилгээ бүртгэлгүй → getCredential(url, { prompt: false }) НЭГ удаа
  const { st, request } = setup({ portal: true });
  await request(L3, Q, rawMeta);
  assert.equal(st.calls.length, 1);
  assert.deepEqual(st.calls[0], [L3, { prompt: false }]);
  await request(`${L3}/query`, { query: { f: 'json', where: '1=1' } });
  await request(`${ENT}/Svc/FeatureServer/4`, Q, rawMeta);
  assert.equal(st.calls.length, 1, 'ижил үйлчилгээ — дахин дуудахгүй');
  await request(`${SRV}/Ortho/MapServer`, Q, () => ({ layers: [] }));
  assert.equal(st.calls.length, 2, 'Hosted биш үйлчилгээ (ортофото) ч бэлтгэгдэнэ');
}
{
  // серверийн үндсэнд итгэмжлэлтэй (entDocs-ийн тусдаа нэвтрэлт) ч таних
  const { st, request } = setup({ portal: false, server: true });
  await request(L3, Q, rawMeta);
  assert.equal(st.calls.length, 1);
}
{
  // нэвтрээгүй → огт оролдохгүй (нэргүй хүсэлт хэвээр); бусад хост → оролдохгүй
  const { st, request } = setup({ portal: false });
  await request(L3, Q, rawMeta);
  await request('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', Q, () => ({}));
  assert.equal(st.calls.length, 0);
}
{
  // authMode тодорхой · ил токен → оролдохгүй
  const { st, request } = setup();
  await request(L3, { ...Q, authMode: 'anonymous' }, rawMeta);
  await request(`${L3}/query`, { query: { f: 'json', token: 't' } });
  assert.equal(st.calls.length, 0);
}
{
  // бэлтгэл унасан → 30 с завсарлага (хүсэлт бүр дараалалд зогсохгүй), дараа нь дахин
  const { st, request, tick } = setup({ fail: true });
  await request(L3, Q, rawMeta);
  await request(`${ENT}/Other/FeatureServer/0`, Q, rawMeta);
  assert.equal(st.calls.length, 1);
  tick(31_000);
  await request(`${ENT}/Third/FeatureServer/0`, Q, rawMeta);
  assert.equal(st.calls.length, 2);
}
{
  // бэлтгэл гацсан → `preflightMs`-ийн дараа хүсэлт ердийнхөөрөө явна (гацахгүй)
  const { net, request } = setup({ hang: true }, { preflightMs: 20 });
  const t0 = Date.now();
  await request(L3, Q, rawMeta);
  assert.equal(net.length, 1);
  assert.ok(Date.now() - t0 < 1_000);
}
{
  // ХӨРВҮҮЛСЭН хариу кэшлэгдэнэ; эзэн бодит `lastEditDate`, дараагийнх нь `null` (refresh хуучрахгүй)
  const { net, request } = setup();
  const first = await request(L3, Q, rawMeta);
  assert.equal(first.cached, false);
  assert.deepEqual(first.data.fields.map((f) => f.name), ['OBJECTID', 'BAGTS']);
  assert.equal(first.data.objectIdField, 'OBJECTID');
  assert.equal(first.data.supportedQueryFormats, 'JSON');
  assert.equal(first.data.editingInfo.lastEditDate, 1_792_485_847_539);
  const second = await request(L3, Q, rawMeta);
  assert.equal(second.cached, true);
  assert.equal(net.length, 1, 'хоёр дахь нь сүлжээгүй');
  assert.deepEqual(second.data.fields.map((f) => f.name), ['OBJECTID', 'BAGTS'], 'кэш — аль хэдийн хөрвүүлсэн');
  assert.equal(second.data.supportedQueryFormats, 'JSON');
  assert.equal(second.data.editingInfo.lastEditDate, null);
  // эзний объектыг JS API засварлавал кэш хөндөгдөхгүй
  first.data.fields.push({ name: 'X' });
  assert.equal((await request(L3, Q, rawMeta)).data.fields.length, 2);
}
{
  // ЗЭРЭГ хүсэлтүүд → нэг татлага; хүлээгчид хуваалцсан хуулбар (итгэмжлэл бэлэн — дуудсан дарааллаар эзэн тодорно)
  const { st, net, request } = setup({ server: true });
  st.svcs.add(svcOf(L3));
  let release;
  const gate = new Promise((r) => { release = r; });
  const p1 = request(L3, Q, async () => { await gate; return rawMeta(); });
  const p2 = request(L3, Q, rawMeta);
  const p3 = request(L3, Q, rawMeta);
  await sleep(5);
  release();
  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  assert.equal(net.length, 1);
  assert.equal(r1.cached, false);
  assert.ok(r2.cached && r3.cached);
  assert.notEqual(r2.data, r3.data, 'тус бүр өөрийн хуулбар');
  assert.equal(r2.data.editingInfo.lastEditDate, null);
  assert.equal(r2.data.fields[1].name, 'BAGTS');
}
{
  // эзэн УНАСАН → хүлээгч өөрөө татна, алдаа кэшлэгдэхгүй
  const { st, net, request } = setup({ server: true });
  st.svcs.add(svcOf(L3));
  let release;
  const gate = new Promise((r) => { release = r; });
  const p1 = request(L3, Q, async () => { await gate; throw new Error('500'); });
  const p2 = request(L3, Q, rawMeta);
  await sleep(5);
  release();
  await assert.rejects(p1);
  const r2 = await p2;
  assert.equal(r2.cached, false);
  assert.equal(net.length, 2);
  assert.equal(r2.data.editingInfo.lastEditDate, 1_792_485_847_539, 'өөрөө татсан — бодит утга');
}
{
  // эзэн ЦУЦЛАГДСАН (signal) → хүлээгч чөлөөлөгдөж өөрөө татна
  const { st, net, request } = setup({ server: true });
  st.svcs.add(svcOf(L3));
  const ac = new AbortController();
  const p1 = request(L3, { ...Q, signal: ac.signal }, () => new Promise(() => {}));
  const p2 = request(L3, Q, rawMeta);
  await sleep(5);
  ac.abort();
  const r2 = await p2;
  assert.equal(r2.cached, false);
  assert.equal(net.length, 2);
  void p1;
}
{
  // JS API-ийн БИЧИЛТ (ил POST) → кэш хаягдана; GET асуулга хаяхгүй
  const { net, request } = setup();
  await request(L3, Q, rawMeta);
  await request(`${L3}/query`, { query: { f: 'json', where: '1=1' } }, () => ({ features: [] }));
  await request(L3, Q, rawMeta);
  assert.equal(net.filter((u) => u === L3).length, 1, 'уншилт кэшийг хаяхгүй');
  await request(`${L3}/applyEdits`, { method: 'post', query: { f: 'json', updates: '[]' } }, () => ({ updateResults: [] }));
  await request(L3, Q, rawMeta);
  assert.equal(net.filter((u) => u === L3).length, 2, 'бичилтийн дараа мета дахин татагдана');
  // бичилт УНАСАН ч хаяна (хагас бичигдсэн байж болно)
  await assert.rejects(request(`${L3}/addAttachment`, { body: {} }, () => { throw new Error('500'); }));
  await request(L3, Q, rawMeta);
  assert.equal(net.filter((u) => u === L3).length, 3);
}
{
  // хэрэглэгч солигдвол (итгэмжлэлийн userId) — өөр түлхүүр
  const { st, net, request } = setup();
  await request(L3, Q, rawMeta);
  st.cred.userId = 'u2';
  await request(L3, Q, rawMeta);
  assert.equal(net.length, 2);
}
{
  // асуулга кэшлэгдэхгүй, талбарын нэрийн хөрвүүлэлт урьдын адил
  const { net, request } = setup();
  const r = await request(`${L3}/query`, { query: { f: 'json', outFields: ['BAGTS'], where: '1=1' } },
    (p) => { assert.equal(p.requestOptions.query.outFields, 'bagts'); return { features: [{ attributes: { bagts: 'B1' } }] }; });
  assert.equal(r.data.features[0].attributes.BAGTS, 'B1');
  await request(`${L3}/query`, { query: { f: 'json', outFields: ['BAGTS'], where: '1=1' } }, () => ({ features: [] }));
  assert.equal(net.length, 2);
}
{
  // Enterprise биш мета (суурь зураг) — кэшлэгдэнэ, хөрвүүлэлтгүй
  const { net, request } = setup();
  const U = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
  await request(U, Q, () => ({ currentVersion: 10.9, layers: [{ name: 'a' }] }));
  const r = await request(U, Q, () => ({}));
  assert.equal(net.length, 1);
  assert.equal(r.data.layers[0].name, 'a');
}

/* ══════════ authToken.primeServerCredential ══════════ */
{
  // IdentityManager бүртгэгдээгүй / getCredential-гүй объект (Telegram бот) → false
  assert.equal(await primeServerCredential(SRV), false);
  registerIdentity({ findCredential: () => null }, PORTAL_SHARING);
  assert.equal(await primeServerCredential(SRV), false);
  // аль хэдийн бэлэн → дуудахгүй
  let calls = 0;
  registerIdentity({ findCredential: (u) => (u === SRV ? { token: 't' } : null), getCredential: () => { calls++; return Promise.resolve({}); } }, PORTAL_SHARING);
  assert.equal(await primeServerCredential(SRV), true);
  assert.equal(calls, 0);
  // амжилт → true, prompt: false
  let opts = null;
  registerIdentity({ findCredential: () => null, getCredential: (_u, o) => { opts = o; return Promise.resolve({}); } }, PORTAL_SHARING);
  assert.equal(await primeServerCredential(SRV), true);
  assert.deepEqual(opts, { prompt: false });
  // уналт → false (шидэхгүй)
  registerIdentity({ findCredential: () => null, getCredential: () => Promise.reject(new Error('x')) }, PORTAL_SHARING);
  assert.equal(await primeServerCredential(SRV), false);
  // гацалт → хугацааны дараа false
  registerIdentity({ findCredential: () => null, getCredential: () => new Promise(() => {}) }, PORTAL_SHARING);
  const t0 = Date.now();
  assert.equal(await primeServerCredential(SRV, 30), false);
  assert.ok(Date.now() - t0 < 1_000);
  // хоосон хаяг → false
  assert.equal(await primeServerCredential(''), false);
}

console.log('metaCache.check: OK');
