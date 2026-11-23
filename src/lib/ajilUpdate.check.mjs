/**
 * ХҮЛЭЭГДЭЖ БУЙ НЭМЭЛТ АЖЛЫН ИЛГЭЭЛТИЙГ ЗАСАХ (`ajilBatlah.updateAjil`) ба ТОКЕНЫ
 * ТУСЛАХУУД (`authToken`) — 2026-09-29.
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/ajilUpdate.check.mjs
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
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ features: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    r = await updateAjil({ oid: 1, me: 'zohiogch_a', payload: pay([row]) });
  } finally {
    globalThis.fetch = realFetch;
  }
}
assert.equal(r.ok, false); assert.match(r.error, /Илгээлт олдсонгүй/, `буруу шалтгаан: ${r.error}`);
CAPS._syncRemoteCaps([]);
WHO.setCurrentUser(null);
console.log('✅ updateAjil — эрх → нэр → агуулга → сүлжээ');

/* 2б. 2026-11-23 — `submitAjil` багцын түлхүүр ба бүлгийг тулгана; `markApplied` · `markRestored` · `claimAjil` ·
   `releaseAjilClaim` эрхийн шалгалттай (урьд нь хэн ч шууд дуудаж чаддаг байв). Сүлжээ рүү БИЧИХ хүсэлт гарахгүй. */
{
  const A = await import('@/lib/ajilBatlah.ts');
  const { PKGS } = await import('@/modules/sheet/bagts.pkg.ts');
  const { AUTH } = await import('@/lib/services.ts');
  const pk = PKGS[0];
  const other = PKGS.find((p) => p.group !== pk.group);
  assert.ok(pk && other, 'шалгуурт хоёр өөр бүлгийн багц хэрэгтэй');
  CAPS._syncRemoteCaps([{ user: 'zohiogch_a', caps: ['addRow'] }]);
  WHO.setCurrentUser('zohiogch_a');
  const realFetch = globalThis.fetch;
  let writes = 0;
  const stored = { [A.F.oid]: 1, [A.F.status]: A.AJIL_STATUS.approved, [A.F.author]: 'zohiogch_a', [A.F.pkgGroup]: pk.group, [A.F.reason]: null, [A.F.approver]: null };
  globalThis.fetch = async (url) => {
    if (String(url).includes('applyEdits')) writes += 1;
    return new Response(JSON.stringify({ features: [{ attributes: stored }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const send = (pkgKey, pkgGroup, payKey = pkgKey) => A.submitAjil({ pkgKey, pkgGroup, author: 'zohiogch_a', payload: { v: 1, pkgKey: payKey, adds: [row] } });
    let x = await send(pk.key, other.group);
    assert.equal(x.ok, false); assert.match(x.error, /зөрж байна/, `өөр бүлгээр илгээв: ${x.error}`);
    x = await send('ugui_bagts', pk.group);
    assert.equal(x.ok, false); assert.match(x.error, /зөрж байна/, `үл мэдэгдэх түлхүүр: ${x.error}`);
    x = await send(pk.key, pk.group, other.key);
    assert.equal(x.ok, false); assert.match(x.error, /зөрж байна/, `агуулгын түлхүүр зөрсөн: ${x.error}`);

    assert.ok(AUTH.appId, 'шалгуурт нэвтрэлт асаалттай байх ёстой');
    WHO._setWriteGuards(true);
    /* бусдын нэрээр түгжихгүй / тайлахгүй */
    const c = await A.claimAjil({ oid: 1, me: 'batlagch_b', want: A.AJIL_STATUS.approved });
    assert.match(String(c), /өөрийн нэрээр/, `бусдын нэрээр түгжив: ${c}`);
    await A.releaseAjilClaim({ oid: 1, me: 'batlagch_b' });
    /* зохиогч биш, батлагч биш хүн түгжихгүй, «Буулгасан» / «Сэргээсэн» гэж тэмдэглэхгүй */
    WHO.setCurrentUser('hen_negen');
    const c2 = await A.claimAjil({ oid: 1, me: 'hen_negen', want: A.AJIL_STATUS.approved });
    assert.match(String(c2), /батлах эрхгүй/, `хамааралгүй хүн түгжив: ${c2}`);
    const m = await A.markApplied(1);
    assert.equal(m.ok, false); assert.match(m.error, /батлах эрхгүй/, `батлагч биш хүн «Буулгасан» гэж тэмдэглэв: ${m.error}`);
    stored[A.F.status] = A.AJIL_STATUS.returned;
    const m2 = await A.markRestored(1);
    assert.equal(m2.ok, false); assert.match(m2.error, /илгээсэн хүн өөрөө/, `зохиогч биш хүн «Сэргээсэн» гэж тэмдэглэв: ${m2.error}`);
    assert.equal(writes, 0, 'эрхгүй дуудлага сүлжээнд бичив');
  } finally {
    WHO._setWriteGuards(false);
    globalThis.fetch = realFetch;
    CAPS._syncRemoteCaps([]);
    WHO.setCurrentUser(null);
  }
}
console.log('✅ submitAjil түлхүүр↔бүлэг · markApplied/markRestored/claimAjil/releaseAjilClaim эрхийн шалгалт');

/* 3. Эх код: ИЖИЛ мөрийг шинэчилнэ (шинэ илгээлт биш), төлөв хөндөхгүй, дараа нь дахин уншина */
{
  const L = fs.readFileSync('src/lib/ajilBatlah.ts', 'utf8');
  const i = L.indexOf('export async function updateAjil');
  assert.ok(i > 0, 'updateAjil алга');
  const body = L.slice(i);
  assert.ok(/updates: JSON\.stringify/.test(body) && !/adds: JSON\.stringify/.test(body), 'updateAjil шинэ мөр нэмж байна');
  assert.ok(!/\[F\.status\]:/.test(body), 'updateAjil төлөвийг өөрчилж байна — `pending` хэвээр байх ёстой');
  assert.ok(/AJIL_STATUS\.pending/.test(body) && /const after = await query/.test(body), 'updateAjil бичсэний дараа төлөвийг дахин шалгахгүй');
  const iClaim = body.indexOf('await claimAjil({ oid: args.oid, me, want: AJIL_STATUS.pending })');
  const iUpd = body.indexOf('updates: JSON.stringify');
  assert.ok(iClaim > 0 && iClaim < iUpd, 'updateAjil түгжээ авалгүй бичиж байна');
  assert.ok(/finally \{\s*await releaseAjilClaim\(\{ oid: args\.oid, me \}\)/.test(body), 'updateAjil түгжээг тайлахгүй');
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
    const orgUrl = `${(process.env.NEXT_PUBLIC_ENT_DATA ?? '').trim().replace(/\/+$/, '')}/A/FeatureServer/0/query`;
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
