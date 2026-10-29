/**
 * `query.ts`-ийн ХУВААЛЦСАН ХҮСЭЛТИЙН ЦӨМ (`arcgisPost` · `request`) — 2026-09-30.
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/query.check.mjs
 */
import assert from 'node:assert/strict';
import { arcgisPost, ArcGISError, queryCount, groups } from '@/lib/query';
import * as A from '@/lib/authToken';

const realFetch = globalThis.fetch;
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const URL_ = 'https://x/arcgis/rest/services/A/FeatureServer/0';
const HJ = (process.env.NEXT_PUBLIC_ENT_DATA ?? '').trim().replace(/\/+$/, '');
assert.ok(HJ, 'NEXT_PUBLIC_ENT_DATA хоосон — .env ачаалагдаагүй');
const ORG = `${HJ}/A/FeatureServer/0`;

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
  const r = await arcgisPost(`${ORG}/query`, { where: '1=1', token: 'хуучин' });
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

  const FOREIGN = 'https://gadny.example.org/arcgis/rest/services/B/FeatureServer/0';
  const warns = [];
  const realWarn = console.warn;
  console.warn = (...a) => { warns.push(a.join(' ')); };
  try {
    await arcgisPost(`${FOREIGN}/query`, { where: '1=1' });
    assert.equal(new URLSearchParams(String(seen.init.body)).get('token'), null, 'гадны хост руу хэрэглэгчийн токен явав');
    await arcgisPost(`${FOREIGN}/query`, {});
    await arcgisPost('https://evil.example.com/arcgis/rest/services/HJzgwvlNIXssnQar/x', {});
    assert.equal(new URLSearchParams(String(seen.init.body)).get('token'), null, 'org сегмент агуулсан гадны хост');
    await arcgisPost(`${FOREIGN}/query`, { token: 'өөрийн' });
    assert.equal(new URLSearchParams(String(seen.init.body)).get('token'), 'өөрийн', 'дуудагчийн ил токен хэвээр байх ёстой');
  } finally {
    console.warn = realWarn;
  }
  assert.equal(warns.length, 2, `хост бүрд нэг анхааруулга: ${JSON.stringify(warns)}`);
  assert.ok(warns.every((w) => !w.includes('tok-1')), 'анхааруулгад токен орсон');
  /* Портал (`<portal>/sharing/rest/*`) → токен явна */
  await arcgisPost('https://www.arcgis.com/sharing/rest/search', { q: 'x' });
  assert.equal(new URLSearchParams(String(seen.init.body)).get('token'), 'tok-1', 'портал руу токен явах ёстой');
  /* Порталын нэртэй төстэй өөр хост — үгүй */
  await arcgisPost('https://www.arcgis.com.evil.io/sharing/rest/search', {});
  assert.equal(new URLSearchParams(String(seen.init.body)).get('token'), null);
  A.registerIdentity(null, '');
  console.log('✅ POST · form · f=json · токен зөвхөн биед · always/org горим · always → зөвхөн org/портал хост');
}

/* ── 2026-10-01: 498 ШУУРГА — олон хүсэлт зэрэг 498 → НЭГ шинэчлэлт ──
   Хариунууд ӨӨР ӨӨР цагт ирнэ: заримынх нь шинэчлэлт ДУУССАНЫ ДАРАА ирдэг — тэд
   «токен аль хэдийн солигдсон» гэж шинэчлэлгүйгээр шинэ токеноор дахин илгээнэ. */
{
  let refreshes = 0;
  const cred = {
    token: 'old',
    expires: Date.now() + 3_600_000,
    refreshToken: async () => { refreshes += 1; await new Promise((r) => setTimeout(r, 15)); cred.token = `new${refreshes}`; },
  };
  A.registerIdentity({ findCredential: () => cred }, 'https://www.arcgis.com/sharing');
  const sentTokens = [];
  let i = 0;
  globalThis.fetch = async (_u, init) => {
    const tok = new URLSearchParams(String(init.body)).get('token');
    sentTokens.push(tok);
    const k = i++;
    /* хуучин токеноор явсан хүсэлт 0..60мс-ийн дараа 498 — шинэчлэлтийн өмнө ч, дараа ч */
    if (tok === 'old') {
      await new Promise((r) => setTimeout(r, (k % 7) * 10));
      return ok({ error: { code: 498, message: 'Invalid token.' } });
    }
    return ok({ ok: tok });
  };
  const res = await Promise.all(Array.from({ length: 20 }, () => arcgisPost(`${ORG}/query`, {}, { slot: false })));
  assert.equal(refreshes, 1, `НЭГ л шинэчлэлт байх ёстой, ${refreshes} болов`);
  assert.ok(res.every((r) => r.ok === 'new1'), 'бүгд шинэ токеноор амжилттай байх ёстой');
  assert.equal(sentTokens.filter((t) => t === 'old').length, 20);
  assert.equal(sentTokens.filter((t) => t === 'new1').length, 20);

  /* Хүсэлт явснаас хойш токен солигдсон (өөр зам шинэчилсэн) → шинэчлэхгүй, шууд дахин */
  refreshes = 0;
  sentTokens.length = 0;
  cred.token = 'old';
  globalThis.fetch = async (_u, init) => {
    const tok = new URLSearchParams(String(init.body)).get('token');
    sentTokens.push(tok);
    if (tok === 'old') { cred.token = 'other'; return ok({ error: { code: 498, message: 'Invalid token.' } }); }
    return ok({ ok: tok });
  };
  assert.deepEqual(await arcgisPost(`${ORG}/query`, {}, { slot: false }), { ok: 'other' });
  assert.equal(refreshes, 0, 'токен аль хэдийн солигдсон — шинэчлэх ёсгүй');
  assert.deepEqual(sentTokens, ['old', 'other']);

  /* Шинэчлэлт БҮТЭЭГҮЙ (токен хэвээр) → 30с дотор ижил токеноос дахин шинэчлэхгүй, давтахгүй */
  let n2 = 0;
  const stuck = { token: 'stuck', expires: Date.now() + 3_600_000, refreshToken: async () => { n2 += 1; throw new Error('offline'); } };
  A.registerIdentity({ findCredential: () => stuck }, 'https://www.arcgis.com/sharing');
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return ok({ error: { code: 498, message: 'Invalid token.' } }); };
  for (let k = 0; k < 5; k++) {
    const e = await arcgisPost(`${ORG}/query`, {}, { slot: false }).catch((x) => x);
    assert.equal(e.code, 498);
  }
  assert.equal(n2, 1, `бүтэлгүй шинэчлэлтийг давтав: ${n2}`);
  assert.equal(calls, 5, 'токен өөрчлөгдөөгүй бол ижил токеноор дахин илгээх утгагүй');
  A.registerIdentity(null, '');
  console.log('✅ 498 шуурга → нэг шинэчлэлт · солигдсон токен → шинэчлэлгүй дахин · бүтэлгүй шинэчлэлт давтагдахгүй');
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
  assert.deepEqual(await arcgisPost(ORG, {}), { ok: 1 });
  assert.deepEqual(seen, ['a', 'r1'], 'шинэчилсэн токеноор дахин оролдоогүй');
  A.registerIdentity({ findCredential: () => cred }, 'https://www.arcgis.com/sharing');
  seen.length = 0;
  globalThis.fetch = async (_u, init) => {
    seen.push(new URLSearchParams(String(init.body)).get('token'));
    return ok({ error: { code: 498, message: 'Invalid token.' } });
  };
  const e = await arcgisPost(ORG, {}).catch((x) => x);
  assert.equal(e.code, 498);
  assert.equal(seen.length, 2, 'ЯГ нэг удаа дахин оролдох ёстой');
  const nBefore = n;
  seen.length = 0;
  for (let k = 0; k < 3; k++) {
    globalThis.fetch = async (_u, init) => {
      seen.push(new URLSearchParams(String(init.body)).get('token'));
      return ok({ error: { code: 499, message: 'Token Required' } });
    };
    const e499 = await arcgisPost(ORG, {}).catch((x) => x);
    assert.equal(e499.code, 499);
  }
  assert.equal(n, nBefore, `хүлээлтийн дотор дахин хүчээр шинэчлэв: ${n - nBefore}`);
  assert.equal(seen.length, 3, 'хүлээлтийн дотор ижил токеноор давтах утгагүй');
  globalThis.fetch = async (_u, init) => {
    seen.push(new URLSearchParams(String(init.body)).get('token'));
    return ok({ error: { code: 498, message: 'Invalid token.' } });
  };
  /* `org` горимд дуудагч өөрөө токен өгсөн бол дахин оролдохгүй (тэр токен хэвээр явна) */
  seen.length = 0;
  await arcgisPost(URL_, { token: 'мине' }, { token: 'org' }).catch(() => {});
  assert.deepEqual(seen, ['мине']);
  /* authToken.arcgisPost бүрхүүл — импортын тойрог, describe, код */
  seen.length = 0;
  const w = await A.arcgisPost(`${ORG}/query`, {}).catch((x) => x);
  assert.equal(w.code, 498);
  assert.match(w.message, /Invalid token\. \[(Hosted\/)?A\/FeatureServer\/0\/query 498\]/);
  A.registerIdentity(null, '');
  console.log('✅ 498 → refresh → нэг удаа дахин · 30с хүлээлт цагаар (шинэ токеноор 499 → дахин шинэчлэлгүй) · org+дуудагчийн токен → дахин үгүй · authToken бүрхүүл');
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
  /* 503 reads and layer metadata retain the same safe replay behavior. */
  for (const url of [`${URL_}/query`, URL_]) {
    calls = 0;
    globalThis.fetch = async () => (++calls === 1 ? { ok: false, status: 503 } : ok({ count: 9 }));
    assert.deepEqual(await arcgisPost(url, {}, { slot: false }), { count: 9 });
    assert.equal(calls, 2);
    calls = 0;
    globalThis.fetch = async () => ok(++calls === 1 ? { error: { code: 429, message: 'Rate limit exceeded' } } : { count: 8 });
    assert.deepEqual(await arcgisPost(url, {}, { slot: false }), { count: 8 });
    assert.equal(calls, 2);
  }
  console.log('✅ query/metadata: 429 / 503 / rate-limit body → backoff → retry');
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

/* ── 2026-09-30: БИЕ УНШИЛТ ГАЦВАЛ ч timeout · хэрэглэгчийн цуцлалт · слот суллагдана ──
   Урьд цаг хэмжигч толгой ирмэгц цэвэрлэгддэг байсан тул `res.json` үүрд хүлээж
   слотоо суллахгүй байв (энэ блок засваргүй кодод ГАЦНА — `guard` барина). */
{
  /* Толгой ирсэн, бие signal цуцлагдтал ИРЭХГҮЙ (жинхэнэ хөтөч шиг reason-оор няцаана) */
  const stalledBody = (reasonOf) => (_u, init) => Promise.resolve({
    ok: true,
    status: 200,
    json: () => new Promise((_r, rej) => {
      if (init.signal.aborted) rej(reasonOf(init.signal));
      init.signal.addEventListener('abort', () => rej(reasonOf(init.signal)));
    }),
  });
  /** Засваргүй код үүрд хүлээдэг — 3 сек-ийн хамгаалалт (дараа нь цэвэрлэнэ) */
  const race = async (p, ms = 3000) => {
    let t;
    const guard = new Promise((r) => { t = setTimeout(() => r('HANG'), ms); });
    try { return await Promise.race([p, guard]); } finally { clearTimeout(t); }
  };

  globalThis.fetch = stalledBody((s) => s.reason);
  const e = await race(arcgisPost(URL_, {}, { timeoutMs: 40 }).catch((x) => x));
  assert.notEqual(e, 'HANG', 'бие уншилт гацахад timeout ажиллаагүй — слот үүрд эзлэгдэнэ');
  assert.ok(e instanceof ArcGISError, `ArcGISError биш: ${e}`);
  assert.match(e.message, /хугацаа хэтэрлээ/);

  /* Зарим хөтөч биеийг reason-оос үл хамааран AbortError-оор няцаадаг — шалтгаанаар ялгана */
  globalThis.fetch = stalledBody(() => new DOMException('The user aborted a request.', 'AbortError'));
  const e2 = await race(arcgisPost(URL_, {}, { timeoutMs: 40 }).catch((x) => x));
  assert.ok(e2 instanceof ArcGISError, `timeout нь түүхий AbortError болж гарав: ${e2}`);
  assert.match(e2.message, /хугацаа хэтэрлээ/);
  /* fetch өөрөө (толгойноос өмнө) AbortError-оор няцаасан timeout ч мөн */
  globalThis.fetch = (_u, init) => new Promise((_r, rej) => {
    init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
  });
  const e3 = await race(arcgisPost(URL_, {}, { timeoutMs: 40 }).catch((x) => x));
  assert.ok(e3 instanceof ArcGISError && /хугацаа хэтэрлээ/.test(e3.message), `толгойн өмнөх timeout: ${e3}`);

  /* Хэрэглэгч бие уншиж байхад цуцалбал — timeout БИШ, AbortError шууд */
  globalThis.fetch = stalledBody((s) => s.reason);
  const ac = new AbortController();
  const p = arcgisPost(URL_, {}, { signal: ac.signal }).catch((x) => x);
  setTimeout(() => ac.abort(new DOMException('user', 'AbortError')), 20);
  const u = await race(p);
  assert.notEqual(u, 'HANG', 'бие уншиж байхад хэрэглэгчийн цуцлалт хүрсэнгүй');
  assert.equal(u.name, 'AbortError');
  assert.ok(!(u instanceof ArcGISError), 'хэрэглэгчийн цуцлалтыг timeout гэж андуурав');

  /* Слот суллагдана: 14 гацсан хүсэлт (хязгаар ≤12) — бүгд timeout-оор дуусна */
  globalThis.fetch = stalledBody((s) => s.reason);
  const all = await race(Promise.all(
    Array.from({ length: 14 }, (_, i) => arcgisPost(URL_, { i: String(i) }, { timeoutMs: 40 }).catch((x) => x)),
  ), 5000);
  assert.notEqual(all, 'HANG', 'гацсан биетэй хүсэлтүүд слотоо суллаагүй — дараалал царцав');
  assert.ok(all.every((x) => x instanceof ArcGISError), 'бүгд timeout алдаа байх ёстой');

  /* JSON биш хариуны зан ӨӨРЧЛӨГДӨӨГҮЙ: уншилтын ердийн алдаа → «JSON биш», дахин оролдохгүй */
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: true, status: 200, json: async () => { throw new TypeError('network error'); } }; };
  const j = await arcgisPost(URL_, {}).catch((x) => x);
  assert.ok(j instanceof ArcGISError && /JSON биш/.test(j.message), `JSON биш зан өөрчлөгдөв: ${j}`);
  assert.equal(calls, 1, 'биеийн уншилтын алдаанд дахин илгээж болохгүй (applyEdits давхардана)');
  console.log('✅ бие гацвал timeout · AbortError-ын timeout ч ялгагдана · хэрэглэгчийн цуцлалт · слот суллагдана');
}

/* ── Сүлжээний TypeError → нэг удаа дахин; slot:false ч ажиллана ── */
{
  let calls = 0;
  globalThis.fetch = async () => { if (++calls === 1) throw new TypeError('Failed to fetch'); return ok({ n: 1 }); };
  assert.deepEqual(await arcgisPost(URL_, {}, { slot: false }), { n: 1 });
  assert.equal(calls, 2);
  console.log('✅ сүлжээний глитч → нэг удаа дахин · slot:false');
}

/* ── Writes must not replay after transport, HTTP, or rate-limit body failures. ── */
{
  const failures = [
    () => { throw new TypeError('Failed to fetch'); },
    ...[429, 500, 502, 503, 504].map((status) => () => ({ ok: false, status })),
    () => ok({ error: { code: 429, message: 'Too many requests.' } }),
  ];
  for (const ep of [
    'applyEdits', 'addFeatures', 'updateFeatures', 'deleteFeatures', 'addAttachment',
    'updateAttachment', 'deleteAttachments', 'calculate', 'append',
    'createService', 'addToDefinition', 'updateDefinition', 'deleteFromDefinition', 'share', 'unshare', 'addItem', 'updateItem', 'deleteItems',
    'customMutation', // Unknown endpoints must not gain an unsafe retry by omission.
  ]) {
    for (const fail of failures) {
      let calls = 0;
      globalThis.fetch = async () => (++calls === 1 ? fail() : ok({ success: true }));
      await assert.rejects(arcgisPost(`${URL_}/${ep}`, {}, { slot: false }));
      assert.equal(calls, 1, `${ep}: ambiguous failure replayed a write`);
    }
  }
  console.log('✅ writes: transport / HTTP 429,500,502,503,504 / rate-limit body → exactly one attempt');
}

/* ── Actual tableWrite → query: a commit followed by 503 stays an unknown outcome. ── */
{
  const { applyAll } = await import('@/lib/tableWrite');
  let calls = 0;
  let committedRows = 0;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    const body = new URLSearchParams(String(init.body));
    committedRows += JSON.parse(body.get('adds')).length;
    if (calls === 1) return { ok: false, status: 503 };
    return ok({ addResults: [{ objectId: committedRows, success: true }] });
  };
  await assert.rejects(applyAll(URL_, 'objectid', { adds: [{ amount: 55 }] }), (e) => e instanceof ArcGISError && e.status === 503);
  assert.equal(calls, 1);
  assert.equal(committedRows, 1, '503 after commit duplicated the added row');
  console.log('✅ tableWrite commit → 503: one committed row, error returned for reconciliation');
}

/* ── Explicit token rejection still allows one refreshed write attempt. ── */
{
  let refreshes = 0;
  let calls = 0;
  let commits = 0;
  const cred = { token: 'write-old', expires: Date.now() + 3_600_000, refreshToken: async () => { refreshes += 1; cred.token = 'write-new'; } };
  A.registerIdentity({ findCredential: () => cred }, 'https://www.arcgis.com/sharing');
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    if (new URLSearchParams(String(init.body)).get('token') === 'write-old') return ok({ error: { code: 498, message: 'Invalid token.' } });
    commits += 1;
    return ok({ addResults: [{ objectId: 1, success: true }] });
  };
  assert.deepEqual(await arcgisPost(`${ORG}/applyEdits`, { adds: '[{"attributes":{"amount":55}}]' }), { addResults: [{ objectId: 1, success: true }] });
  assert.equal(calls, 2);
  assert.equal(refreshes, 1);
  assert.equal(commits, 1);
  A.registerIdentity(null, '');
  console.log('✅ write rejected with 498 → refreshed token → one successful commit');
}

/* ── Caller cancellation during every transient backoff prevents another fetch. ── */
{
  for (const failure of ['network', 429, 500, 502, 503, 504, 'body']) {
    const ac = new AbortController();
    const reason = new DOMException('user canceled during retry backoff', 'AbortError');
    let calls = 0;
    let timer;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls > 1) return ok({ count: 1 });
      timer = setTimeout(() => ac.abort(reason), 20);
      if (failure === 'network') throw new TypeError('Failed to fetch');
      if (failure === 'body') return ok({ error: { code: 429, message: 'Rate limit exceeded' } });
      return { ok: false, status: failure };
    };
    try {
      await assert.rejects(arcgisPost(`${URL_}/query`, {}, { signal: ac.signal }), (e) => e === reason);
      assert.equal(calls, 1, `${failure}: canceled read retried fetch`);
    } finally { clearTimeout(timer); }
  }
  console.log('✅ cancellation during network / HTTP / body backoff prevents every retry');
}

/* ── ЯВАГДАЖ БУЙ ИЖИЛ УНШИЛТЫН НЭГТГЭЛ — `arcgisPost` (2026-10-04, гүйцэтгэлийн аудит) ── */
{
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; await new Promise((r) => setTimeout(r, 20)); return ok({ features: [{ attributes: { a: 1 } }] }); };
  const Q = `${URL_}/query`;
  const [x, y] = await Promise.all([arcgisPost(Q, { where: '1=1', outFields: 'a' }), arcgisPost(Q, { outFields: 'a', where: '1=1' })]);
  assert.equal(calls, 1, 'ижил `/query` зэрэг явахад НЭГ л хүсэлт (параметрийн дараалал хамаагүй)');
  assert.deepEqual(x, y);
  assert.notEqual(x, y, 'хоёр дахь дуудагч ГҮН ХУУЛБАР авна — нэг обьект хуваалцахгүй');
  /* Дууссаны дараа КЭШ БИШ — дахин дуудвал шинэ хүсэлт */
  await arcgisPost(Q, { where: '1=1', outFields: 'a' });
  assert.equal(calls, 2, 'нэгтгэл нь зөвхөн ЯВАГДАЖ БУЙ хүсэлтэд — кэш биш');
  /* Мета (`?f=json`, параметргүй) ч нэгтгэгдэнэ */
  calls = 0;
  await Promise.all([arcgisPost(URL_, {}), arcgisPost(URL_, {})]);
  assert.equal(calls, 1, 'давхаргын мета зэрэг — нэг хүсэлт');
  /* Нэгтгэхгүй: бичих endpoint · `signal`-тай · `slot:false` · өөр горим (`token`) */
  calls = 0;
  await Promise.all([arcgisPost(`${URL_}/applyEdits`, { adds: '[]' }), arcgisPost(`${URL_}/applyEdits`, { adds: '[]' })]);
  assert.equal(calls, 2, 'applyEdits ХЭЗЭЭ Ч нэгтгэгдэхгүй — хоёр бичилт хоёулаа явна');
  calls = 0;
  const ac = new AbortController();
  await Promise.all([arcgisPost(Q, { where: 'w' }, { signal: ac.signal }), arcgisPost(Q, { where: 'w' })]);
  assert.equal(calls, 2, '`signal`-тай хүсэлт нэгтгэгдэхгүй (цуцлалт бусдад тусахгүй)');
  calls = 0;
  await Promise.all([arcgisPost(Q, { where: 's' }, { slot: false }), arcgisPost(Q, { where: 's' }, { slot: false })]);
  assert.equal(calls, 2, '`slot:false` нэгтгэгдэхгүй (слотын гацаа)');
  calls = 0;
  await Promise.all([arcgisPost(Q, { where: 't' }), arcgisPost(Q, { where: 't' }, { token: 'org' })]);
  assert.equal(calls, 2, 'өөр токены горим — өөр түлхүүр');
  /* `queryCount` (`request`) ба `arcgisPost(…/query, token:'org')` НЭГ нэгтгэлтэй */
  calls = 0;
  globalThis.fetch = async () => { calls += 1; await new Promise((r) => setTimeout(r, 20)); return ok({ count: 3 }); };
  const [c1, c2] = await Promise.all([
    queryCount(URL_, 'k=1'),
    arcgisPost(Q, { where: 'k=1', returnCountOnly: 'true' }, { token: 'org' }),
  ]);
  assert.equal(c1, 3); assert.equal(c2.count, 3);
  assert.equal(calls, 1, '`request()` ба `arcgisPost` ижил асуулгыг хуваалцана');
  /* Алдаа хуваалцагдаж, түлхүүр устна */
  calls = 0;
  globalThis.fetch = async () => { calls += 1; await new Promise((r) => setTimeout(r, 20)); return ok({ error: { code: 400, message: 'bad' } }); };
  const errs = await Promise.all([arcgisPost(Q, { where: 'e' }).catch((e) => e), arcgisPost(Q, { where: 'e' }).catch((e) => e)]);
  assert.ok(errs.every((e) => e instanceof ArcGISError), 'алдаа бүх хүлээгчид');
  assert.equal(calls, 1);
  await arcgisPost(Q, { where: 'e' }).catch(() => {});
  assert.equal(calls, 2, 'алдааны дараа дахин оролдлого шинэ хүсэлт');
  console.log('✅ ижил уншилтын нэгтгэл: /query · мета · бичилт/signal/slot:false/горим нэгтгэгдэхгүй · алдаа хуваалцана');
}

/* ── 2026-10-09 (аудит №2): «Түр хаах»-ын дараа ард явдаг шалгалт цонхыг 10 мин БУЦААЖ ГАРГАХГҮЙ ── */
{
  const dead = { token: 'd1', expires: Date.now() + 10_000, refreshToken: async () => { throw Object.assign(new Error('invalid_grant'), { details: { httpStatus: 400 } }); } };
  A.registerIdentity({ findCredential: () => dead }, 'https://www.arcgis.com/sharing');
  A.authToken(); // сешнд токен харагдсан
  await A.ensureFreshToken(true);
  assert.equal(A.sessionDead(), true, 'эцсийн уналт → цонх');
  A.dismissSessionDead();
  assert.equal(A.sessionDead(), false);
  await A.ensureFreshToken(true); // AuthGate-ийн poll
  assert.equal(A.sessionDead(), false, 'хаасны дараа poll цонхыг дахин гаргав');
  globalThis.fetch = async () => ok({ error: { code: 498, message: 'Invalid token.' } });
  await arcgisPost(`${ORG}/query`, {}, { slot: false }).catch(() => {}); // тэмдэг/IoT poll
  assert.equal(A.sessionDead(), false, 'хаасны дараа query-ийн 498 цонхыг дахин гаргав');
  /* шинэ сешн чимээгүй цонхыг тэглэнэ */
  A.registerIdentity({ findCredential: () => dead }, 'https://www.arcgis.com/sharing');
  A.authToken();
  await A.ensureFreshToken(true);
  assert.equal(A.sessionDead(), true, 'шинэ сешнд чимээгүй цонх үлдэв');
  A.registerIdentity(null, '');
  console.log('✅ «Түр хаах» → 10 мин poll-оор цонх буцаж гарахгүй · шинэ сешн тэглэнэ');
}

/* ── 2026-10-21 (аудит): хавсралтын жагсаалт · queryAttachments · queryRelatedRecords · queryDomains — идемпотент
      УНШИЛТ тул сүлжээ/5xx/rate-limit-д дахин оролдоно (2026-10-05-ны «зөвхөн /query» хязгаарлалт эдгээрийг алдсан байв) ── */
{
  for (const url of [`${URL_}/7/attachments`, `${URL_}/queryAttachments`, `${URL_}/queryRelatedRecords`, `${URL_}/queryDomains`]) {
    for (const fail of [
      () => { throw new TypeError('Failed to fetch'); },
      () => ({ ok: false, status: 503 }),
      () => ({ ok: false, status: 502 }),
      () => ok({ error: { code: 429, message: 'Rate limit exceeded' } }),
    ]) {
      let calls = 0;
      globalThis.fetch = async () => (++calls === 1 ? fail() : ok({ attachmentInfos: [] }));
      assert.deepEqual(await arcgisPost(url, { f: 'json' }, { slot: false }), { attachmentInfos: [] }, url);
      assert.equal(calls, 2, `${url}: уншилт дахин оролдсонгүй`);
    }
  }
  /* Хавсралт БИЧИХ endpoint-ууд нэг л оролдлого хэвээр; `/<oid>/attachments/<id>` (татах) ч жагсаалт биш */
  for (const ep of ['7/addAttachment', '7/updateAttachment', '7/deleteAttachments', '7/attachments/3']) {
    let calls = 0;
    globalThis.fetch = async () => (++calls === 1 ? { ok: false, status: 503 } : ok({ success: true }));
    await assert.rejects(arcgisPost(`${URL_}/${ep}`, {}, { slot: false }));
    assert.equal(calls, 1, `${ep}: бичилт/татах дахин оролдов`);
  }
  console.log('✅ attachments · queryAttachments · queryRelatedRecords · queryDomains: сүлжээ/5xx/rate-limit → дахин; addAttachment г.м. нэг оролдлого');
}

/* ── 2026-10-21 (аудит): `groups` — хэмжилтгүй бүлгийн статистик `stats`-д null хэвээр (`values`-д 0, нийцтэй) ── */
{
  const rows = [
    { f: 'A', n: 2, q: null }, { f: 'A', n: 1, q: null },
    { f: 'B', n: 3, q: 10 }, { f: 'B', n: 1, q: null },
    { f: '', n: 1, q: 0 }, { f: null, n: 1, q: null },
  ];
  const g = groups(rows, 'f', 'Хоосон', ['n', 'q']);
  const by = Object.fromEntries(g.map((x) => [x.label, x]));
  assert.equal(by.A.values.q, 0);
  assert.equal(by.A.stats.q, null, 'бүх мөр null → stats null');
  assert.equal(by.B.values.q, 10);
  assert.equal(by.B.stats.q, 10, 'зарим мөр null → нийлбэр');
  assert.equal(by['Хоосон'].stats.q, 0, 'бодит 0 нь 0 хэвээр (null ≠ 0)');
  assert.equal(by.A.stats.n, 3);
  assert.equal(by.A.values.n, 3);
  assert.deepEqual(g.map((x) => x.label), ['B', 'A', 'Хоосон'], 'эрэмбэ values.n-ээр хэвээр');
  console.log('✅ groups(): stats null-ийг хадгална · values 0 (нийцтэй) · эрэмбэ хэвээр');
}

/* ── 2026-10-22 (аудит): ТООН талбарын бүлгийн шүүлт хашилтгүй — `Code IN (N'1')` → Enterprise 500 «Invalid data type» ── */
{
  const { groupWhere } = await import('./query.ts');
  const rows = [{ Code: 1, n: 1108 }, { Code: 2, n: 1440 }, { Code: null, n: 3 }];
  const g = groups(rows, 'Code', 'Ангилалгүй', ['n']);
  const by = Object.fromEntries(g.map((x) => [x.label, x]));
  assert.equal(by['1'].num, true);
  assert.equal(groupWhere('Code', by['1']), 'Code IN (1)', 'тоон литерал хашилтгүй');
  assert.equal(groupWhere('Code', by['2']), 'Code IN (2)');
  assert.equal(groupWhere('Code', by['Ангилалгүй']), 'Code IS NULL', 'хоосон тоон бүлэг — зөвхөн NULL');
  const dbl = groups([{ v: 1.5, n: 1 }, { v: -2, n: 1 }], 'v', '—', ['n']);
  assert.deepEqual(dbl.map((x) => groupWhere('v', x)).sort(), ['v IN (-2)', 'v IN (1.5)']);
  /* Мөрөн талбар — хуучин хэлбэр (N'…' угтвар, хашилттай) */
  const s = groups([{ t: 'Зам', n: 1 }, { t: '1', n: 1 }, { t: '', n: 1 }], 't', 'Хоосон', ['n']);
  const bs = Object.fromEntries(s.map((x) => [x.label, x]));
  assert.equal(bs['1'].num, undefined, '«1» мөр нь тоо БИШ');
  assert.equal(groupWhere('t', bs['1']), "t IN (N'1')");
  assert.equal(groupWhere('t', bs['Зам']), "t IN (N'Зам')");
  assert.equal(groupWhere('t', bs['Хоосон']), "t IS NULL OR t IN (N'')");
  /* Тарилга: тоон гэж тэмдэглэгдсэн ч тоо биш утга → мөрөн хэлбэр (хашилттай) */
  assert.equal(groupWhere('x', { label: 'a', raws: ["1); DROP"], blank: false, values: {}, stats: {}, num: true }), "x IN (N'1); DROP')");
  console.log('✅ groupWhere: тоон талбар хашилтгүй · мөрөн хэвээр · хоосон тоон бүлэг IS NULL (2026-10-22)');
}

globalThis.fetch = realFetch;
console.log('\nquery.check: ok');
