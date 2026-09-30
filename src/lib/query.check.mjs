/**
 * `query.ts`-ийн ХУВААЛЦСАН ХҮСЭЛТИЙН ЦӨМ (`arcgisPost` · `request`) — 2026-09-30.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/query.check.mjs
 *
 * ⚠️ Сүлжээгүй: `globalThis.fetch`-ийг орлуулна. Шалгах зүйл — урьд нь ~20 файлын
 *    шууд `fetch` тойрдог байсан хамгаалалтууд НЭГ газарт ажиллаж байгаа эсэх:
 *    timeout · 200-аар ирдэг `{error}` · 498 → токен шинэчлээд НЭГ удаа дахин ·
 *    429 backoff · JSON биш хариу · `token: 'org'` горим · `slot: false` ·
 *    `authToken.arcgisPost` бүрхүүл (импортын тойрог ажилладаг).
 */
import assert from 'node:assert/strict';
import { arcgisPost, ArcGISError, queryCount } from '@/lib/query';
import * as A from '@/lib/authToken';

const realFetch = globalThis.fetch;
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const URL_ = 'https://x/arcgis/rest/services/A/FeatureServer/0';

/* ── 200-аар ирдэг {error} → ArcGISError (code · details · url) ── */
{
  globalThis.fetch = async () => ok({ error: { code: 400, message: 'Invalid URL', details: ['d1'] } });
  const e = await arcgisPost(`${URL_}/query`, {}).catch((x) => x);
  assert.ok(e instanceof ArcGISError, 'ArcGISError биш');
  assert.equal(e.message, 'Invalid URL');
  assert.equal(e.code, 400);
  assert.deepEqual(e.details, ['d1']);
  assert.equal(e.url, `${URL_}/query`);
  /* мессеж хоосон бол details, тэр ч хоосон бол «ArcGIS алдаа» */
  globalThis.fetch = async () => ok({ error: { code: 500, details: ['зөвхөн details'] } });
  assert.equal((await arcgisPost(URL_, {}).catch((x) => x)).message, 'зөвхөн details');
  /* describe: замын сүүл + код */
  globalThis.fetch = async () => ok({ error: { code: 400, message: 'Invalid URL' } });
  const d = await arcgisPost(`${URL_}/query`, {}, { describe: true }).catch((x) => x);
  assert.equal(d.message, 'Invalid URL [A/FeatureServer/0/query 400]');
  console.log('✅ 200-аар ирдэг {error} → ArcGISError (code · details · describe)');
}

/* ── HTTP алдаа · JSON биш хариу ── */
{
  globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } });
  const e = await arcgisPost(URL_, {}).catch((x) => x);
  assert.ok(e instanceof ArcGISError);
  assert.equal(e.message, 'HTTP 502');
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } });
  const j = await arcgisPost(URL_, {}).catch((x) => x);
  assert.ok(j instanceof ArcGISError);
  assert.match(j.message, /JSON биш/);
  console.log('✅ HTTP 502 → «HTTP 502» · HTML хариу → «JSON биш» (SyntaxError биш)');
}

/* ── Хүсэлтийн хэлбэр: POST · form бие · f=json · токен URL-д ОРОХГҮЙ ── */
{
  const cred = { token: 'tok-1', expires: Date.now() + 3_600_000, refreshToken: async () => {} };
  A.registerIdentity({ findCredential: () => cred }, 'https://www.arcgis.com/sharing');
  let seen;
  globalThis.fetch = async (url, init) => { seen = { url: String(url), init }; return ok({ fine: 1 }); };
  const r = await arcgisPost(`${URL_}/query`, { where: '1=1', token: 'хуучин' });
  assert.deepEqual(r, { fine: 1 });
  assert.equal(seen.init.method, 'POST');
  assert.ok(!seen.url.includes('token'), 'токен URL-д орсон');
  const b = new URLSearchParams(String(seen.init.body));
  assert.equal(b.get('f'), 'json');
  assert.equal(b.get('where'), '1=1');
  assert.equal(b.get('token'), 'tok-1', '`always`: одоогийн токен дуудагчийнхыг дарна');
  assert.ok(seen.init.signal instanceof AbortSignal, 'timeout signal алга');
  /* `org` горим: org биш URL → дуудагчийн токен л явна */
  await arcgisPost(URL_, { token: 'хуучин' }, { token: 'org' });
  assert.equal(new URLSearchParams(String(seen.init.body)).get('token'), 'хуучин');
  await arcgisPost(URL_, {}, { token: 'org' });
  assert.equal(new URLSearchParams(String(seen.init.body)).get('token'), null, 'org биш URL-д токен явж болохгүй');
  A.registerIdentity(null, '');
  console.log('✅ POST · form · f=json · токен зөвхөн биед · always/org горим');
}

/* ── 498 → шинэчлээд НЭГ удаа дахин; хоёр дахь 498 → алдаа ── */
{
  let n = 0;
  const cred = { token: 'a', expires: Date.now() + 3_600_000, refreshToken: async () => { n += 1; cred.token = `r${n}`; } };
  A.registerIdentity({ findCredential: () => cred }, 'https://www.arcgis.com/sharing');
  const seen = [];
  globalThis.fetch = async (_u, init) => {
    seen.push(new URLSearchParams(String(init.body)).get('token'));
    return ok(seen.length === 1 ? { error: { code: 498, message: 'Invalid token.' } } : { ok: 1 });
  };
  assert.deepEqual(await arcgisPost(URL_, {}), { ok: 1 });
  assert.deepEqual(seen, ['a', 'r1'], 'шинэчилсэн токеноор дахин оролдоогүй');
  seen.length = 0;
  globalThis.fetch = async (_u, init) => {
    seen.push(new URLSearchParams(String(init.body)).get('token'));
    return ok({ error: { code: 498, message: 'Invalid token.' } });
  };
  const e = await arcgisPost(URL_, {}).catch((x) => x);
  assert.equal(e.code, 498);
  assert.equal(seen.length, 2, 'ЯГ нэг удаа дахин оролдох ёстой');
  /* `org` горимд дуудагч өөрөө токен өгсөн бол дахин оролдохгүй (тэр токен хэвээр явна) */
  seen.length = 0;
  await arcgisPost(URL_, { token: 'мине' }, { token: 'org' }).catch(() => {});
  assert.deepEqual(seen, ['мине']);
  /* authToken.arcgisPost бүрхүүл — импортын тойрог, describe, код */
  seen.length = 0;
  const w = await A.arcgisPost(`${URL_}/query`, {}).catch((x) => x);
  assert.equal(w.code, 498);
  assert.match(w.message, /Invalid token\. \[A\/FeatureServer\/0\/query 498\]/);
  A.registerIdentity(null, '');
  console.log('✅ 498 → refresh → нэг удаа дахин · org+дуудагчийн токен → дахин үгүй · authToken бүрхүүл');
}

/* ── 429 → backoff → дахин; rate-limit мессеж 200-аар ч мөн ── */
{
  let calls = 0;
  globalThis.fetch = async () => (++calls === 1 ? { ok: false, status: 429, json: async () => ({}) } : ok({ count: 7 }));
  const t0 = Date.now();
  assert.equal(await queryCount(URL_), 7);
  assert.equal(calls, 2);
  assert.ok(Date.now() - t0 >= 350, 'backoff хүлээгээгүй');
  calls = 0;
  globalThis.fetch = async () => ok(++calls === 1 ? { error: { message: 'Unable to perform query. Too many requests.' } } : { count: 3 });
  assert.equal(await queryCount(URL_), 3);
  assert.equal(calls, 2);
  console.log('✅ 429 / «Too many requests» → backoff → дахин (request() ч ижил цөмөөр)');
}

/* ── Timeout: signal-ыг хүндэлдэг stub → TimeoutError → ArcGISError ── */
{
  /* Жинхэнэ fetch шиг: аль хэдийн цуцлагдсан signal → шууд няцаана */
  globalThis.fetch = (_u, init) =>
    new Promise((_r, rej) => {
      if (init.signal.aborted) rej(init.signal.reason);
      init.signal.addEventListener('abort', () => rej(init.signal.reason));
    });
  const e = await arcgisPost(URL_, {}, { timeoutMs: 40 }).catch((x) => x);
  assert.ok(e instanceof ArcGISError, `ArcGISError биш: ${e}`);
  assert.match(e.message, /хугацаа хэтэрлээ/);
  /* Хэрэглэгчийн цуцлалт — ArcGISError БИШ, шууд дамжина (дахин оролдохгүй) */
  const ac = new AbortController();
  const p = arcgisPost(URL_, {}, { signal: ac.signal }).catch((x) => x);
  ac.abort(new DOMException('user', 'AbortError'));
  const u = await p;
  assert.equal(u.name, 'AbortError');
  console.log('✅ timeout → ArcGISError · хэрэглэгчийн abort → шууд дамжина');
}

/* ── Сүлжээний TypeError → нэг удаа дахин; slot:false ч ажиллана ── */
{
  let calls = 0;
  globalThis.fetch = async () => { if (++calls === 1) throw new TypeError('Failed to fetch'); return ok({ n: 1 }); };
  assert.deepEqual(await arcgisPost(URL_, {}, { slot: false }), { n: 1 });
  assert.equal(calls, 2);
  console.log('✅ сүлжээний глитч → нэг удаа дахин · slot:false');
}

globalThis.fetch = realFetch;
console.log('\nquery.check: ok');
