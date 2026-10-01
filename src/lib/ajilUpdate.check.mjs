/**
 * ХҮЛЭЭГДЭЖ БУЙ НЭМЭЛТ АЖЛЫН ИЛГЭЭЛТИЙГ ЗАСАХ (`ajilBatlah.updateAjil`) ба ТОКЕНЫ
 * ТУСЛАХУУД (`authToken`) — 2026-09-29.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ajilUpdate.check.mjs
 *
 * ⚠️ Дүрмүүд СҮЛЖЭЭНЭЭС ӨМНӨ шалгагдах ёстой (`decideAjil`/`withdrawAjil`-ийн ижил
 *    шалтгаан): ArcGIS уншигдахгүй орчинд «хүснэгт олдсонгүй» гэсэн буруу шалтгаанаар
 *    дүрэм чимээгүй алга болохгүй.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* ── window/localStorage shim — 'use client' модулиудад ── */
const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;

const { updateAjil } = await import('@/lib/ajilBatlah.ts');
const CAPS = await import('@/lib/caps.ts');
const WHO = await import('@/lib/who.ts');

const row = { oid: -5, parentNo: 'Б.', parentWork: 'БАРИЛГА', parentIdx: 3, no: '12', work: 'Хашаа', vol: 10, unit: 5 };
const pay = (adds) => ({ v: 1, pkgKey: 'b1_9f', adds });

/* 1. Эрхгүй бол шиднэ (консолоос дуудсан хэн ч засахгүй) */
CAPS._syncRemoteCaps([]);
WHO.setCurrentUser('zohiogch_a');
await assert.rejects(updateAjil({ oid: 1, me: 'zohiogch_a', payload: pay([row]) }), /эрхгүй/, 'эрхгүй хүн засаж чадав');

/* 2. Эрхтэй — нэр · хоосон агуулга · өөр нэр · сүлжээ гэсэн дараалал */
CAPS._syncRemoteCaps([{ user: 'zohiogch_a', caps: ['addRow'] }]);
let r = await updateAjil({ oid: 1, me: '   ', payload: pay([row]) });
assert.equal(r.ok, false); assert.match(r.error, /тодорхойгүй/, `нэргүй: ${r.error}`);
r = await updateAjil({ oid: 1, me: 'zohiogch_a', payload: pay([]) });
assert.equal(r.ok, false); assert.match(r.error, /мөр алга/, `хоосон агуулга: ${r.error}`);
r = await updateAjil({ oid: 1, me: 'batlagch_b', payload: pay([row]) });
assert.equal(r.ok, false); assert.match(r.error, /илгээсэн хүн өөрөө/, `өөр нэрээр засах өнгөрөв: ${r.error}`);
r = await updateAjil({ oid: 1, me: 'zohiogch_a', payload: pay([row]) });
assert.equal(r.ok, false); assert.match(r.error, /хүснэгт олдсонгүй/, `буруу шалтгаан: ${r.error}`);
CAPS._syncRemoteCaps([]);
WHO.setCurrentUser(null);
console.log('✅ updateAjil — эрх → нэр → агуулга → сүлжээ');

/* 3. Эх код: ИЖИЛ мөрийг шинэчилнэ (шинэ илгээлт биш), төлөв хөндөхгүй, дараа нь дахин уншина */
{
  const L = fs.readFileSync('src/lib/ajilBatlah.ts', 'utf8');
  const i = L.indexOf('export async function updateAjil');
  assert.ok(i > 0, 'updateAjil алга');
  const body = L.slice(i);
  assert.ok(/updates: JSON\.stringify/.test(body) && !/adds: JSON\.stringify/.test(body), 'updateAjil шинэ мөр нэмж байна');
  assert.ok(!/\[F\.status\]:/.test(body), 'updateAjil төлөвийг өөрчилж байна — `pending` хэвээр байх ёстой');
  assert.ok(/AJIL_STATUS\.pending/.test(body) && /const after = await query/.test(body), 'updateAjil бичсэний дараа төлөвийг дахин шалгахгүй');
}
console.log('✅ updateAjil — ижил мөр, төлөв хэвээр, дараах шалгалт');

/* 4. Токены туслахууд */
{
  const T = await import('@/lib/authToken.ts');
  assert.equal(T.isTokenError(498, 'Invalid token.'), true);
  assert.equal(T.isTokenError(499, 'Token Required'), true);
  assert.equal(T.isTokenError(undefined, 'Invalid Token'), true);
  assert.equal(T.isTokenError(400, 'Invalid URL'), false, '«Invalid URL» нь токены алдаа биш — дахин оролдох шалтгаан биш');
  assert.equal(
    T.describeArcgisError('https://services.arcgis.com/ORG/arcgis/rest/services/Selbe_Huvaari_Batlah/FeatureServer/0/applyEdits?token=SECRET', 400, 'Invalid URL'),
    'Invalid URL [Selbe_Huvaari_Batlah/FeatureServer/0/applyEdits 400]',
  );
  assert.ok(!T.describeArcgisError('https://x/arcgis/rest/services/A/FeatureServer/0/query?token=SECRET', 498, 'Invalid token.').includes('SECRET'), 'алдааны мессежид токен орж байна');
  assert.equal(T.describeArcgisError('буруу', 400, 'Invalid URL'), 'Invalid URL');
  /* Нэвтрэлтгүй (Node) орчинд шинэчлэлт чимээгүй, амжилттай */
  await T.ensureFreshToken();
  await T.ensureFreshToken(true);

  /* Хугацаа дуусах дөхсөн бол шинэчилнэ; зэрэг дуудлага НЭГ шинэчлэлт; хангалттай хугацаатай бол үгүй */
  let n = 0;
  const cred = { token: 'a', expires: Date.now() + 10_000, refreshToken: async () => { n += 1; cred.token = 'b'; cred.expires = Date.now() + 3_600_000; } };
  T.registerIdentity({ findCredential: () => cred }, 'https://www.arcgis.com/sharing');
  await Promise.all([T.ensureFreshToken(), T.ensureFreshToken(), T.ensureFreshToken()]);
  assert.equal(n, 1, 'зэрэг дуудлага олон удаа шинэчлэв');
  assert.equal(T.authToken(), 'b');
  await T.ensureFreshToken();
  assert.equal(n, 1, 'хугацаа хангалттай байхад шинэчлэв');
  await T.ensureFreshToken(true);
  assert.equal(n, 2, '`force` шинэчлээгүй');

  /* arcgisPost: 498 → шинэчлээд НЭГ удаа дахин оролдоно; токен биеэр, шинэ утгаар */
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const tok = new URLSearchParams(String(init.body)).get('token');
    seen.push(tok);
    const body = seen.length === 1 ? { error: { code: 498, message: 'Invalid token.' } } : { ok: 1 };
    return { ok: true, status: 200, json: async () => body };
  };
  try {
    cred.refreshToken = async () => { n += 1; cred.token = 'c'; cred.expires = Date.now() + 3_600_000; };
    /* ⚠️ 2026-10-01: `token: 'always'` нь ЗӨВХӨН org/портал хостод токен залгана
       (`query.ts`) — байгууллагын (env HJ) хаягаар шалгана. */
    const orgUrl = `${(process.env.NEXT_PUBLIC_ARCGIS_HJ ?? '').trim().replace(/\/+$/, '')}/A/FeatureServer/0/query`;
    const j = await T.arcgisPost(orgUrl, { where: '1=1', token: 'хуучин' });
    assert.deepEqual(j, { ok: 1 });
    assert.deepEqual(seen, ['b', 'c'], 'дуудагчийн хуучин токен давамгайлсан эсвэл дахин оролдоогүй');
    /* Токены биш алдаанд дахин оролдохгүй, мессежид зам */
    seen.length = 0;
    globalThis.fetch = async () => { seen.push(1); return { ok: true, status: 200, json: async () => ({ error: { code: 400, message: 'Invalid URL' } }) }; };
    await assert.rejects(T.arcgisPost('https://x/arcgis/rest/services/A/FeatureServer/9/query', {}), /Invalid URL \[A\/FeatureServer\/9\/query 400\]/);
    assert.equal(seen.length, 1, '«Invalid URL»-д дахин оролдов');
  } finally {
    globalThis.fetch = realFetch;
    T.registerIdentity(null, '');
  }
}
console.log('✅ токен — хугацаанаас өмнө шинэчилнэ · 498-д нэг удаа дахин · алдаанд зам, токенгүй');

console.log('\najilUpdate.check: ok');
