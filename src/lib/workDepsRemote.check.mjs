/**
 * `workDepsRemote.ts`-ийн ЗАН ҮЙЛИЙН шалгуур — хуурамч ArcGIS (давхаргын мета, REST) дээр ЖИНХЭНЭ экспортыг
 * ажиллуулна (2026-10-26, аудит T2).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/workDepsRemote.check.mjs
 */
import assert from 'node:assert/strict';
import { fake, assertNoUnexpected } from './arcgisFake.mjs';

const W = await import('@/lib/workDepsRemote.ts');
const { PKGS } = await import('@/modules/sheet/bagts.pkg.ts');
const { bagtsKey } = await import('@/lib/services.ts');

/* ── Давхаргын мета (`fillSchema` → `agsFetch(pkg.url, {})`) — горимоор ── */
const byUrl = new Map(PKGS.map((p) => [p.url.replace(/\/+$/, ''), p]));
/** `'fail'` — бүгд 200 + {error}; `Set` — тэдгээр хуудас л унана; бусад нь `bagts_hamaaral`-гүй мета */
let metaFail = /** @type {'fail' | Set<string>} */ ('fail');
fake.routes.push((url) => {
  const p = byUrl.get(url.replace(/\?.*$/, '').replace(/\/+$/, ''));
  if (!p) return undefined;
  if (metaFail === 'fail' || metaFail.has(p.key)) return { error: { code: 400, message: 'хуурамч: мета уншигдсангүй' } };
  return {
    objectIdField: 'objectid',
    fields: ['objectid', 'дугаар', 'ажил', 'gun', 'des_dugaar'].map((name) => ({ name, type: name === 'objectid' ? 'esriFieldTypeOID' : 'esriFieldTypeString' })),
  };
});
const reads = () => fake.log.filter((x) => /\/(query|applyEdits)$/.test(x.url)).length;

/* ── 1. Хуудас ↔ багцын түлхүүр ── */
{
  assert.ok(PKGS.length >= 20, `PKGS хэт цөөн (${PKGS.length})`);
  for (const p of PKGS) {
    const k = W.pkgKeyOfSheet(p.key);
    assert.equal(k, bagtsKey(p.group), `${p.key}: багцын түлхүүр`);
    const sheets = W.sheetsOfPkgKey(k);
    assert.ok(sheets.includes(p.key), `${p.key}: өөрийн багцын хуудсуудад алга`);
    assert.ok(sheets.every((s) => W.pkgKeyOfSheet(s) === k), `${k}: өөр багцын хуудас холилдов`);
  }
  assert.equal(W.pkgKeyOfSheet('байхгүй'), '');
  assert.deepEqual(W.sheetsOfPkgKey(''), []);
  assert.deepEqual(W.sheetsOfPkgKey('БАЙХГҮЙ999'), []);
  console.log(`✅ ${PKGS.length} хуудас ↔ багцын түлхүүр — хоёр чиглэлд нийцтэй`);
}

/* ── 2. Үл мэдэгдэх хуудас — сүлжээгүй татгалзана ── */
{
  const r = await W.saveWorkLinks({ p: 'байхгүй', k: 'x' }, { add: [], remove: [] });
  assert.equal(r.ok, false);
  assert.match(r.error, /Хуудас олдсонгүй/);
  assert.equal(fake.log.length, 0, 'үл мэдэгдэх хуудсанд сүлжээ рүү хандав');
  console.log('✅ saveWorkLinks — үл мэдэгдэх хуудас, сүлжээгүй');
}

/* ── 3. Бүх мета унав — ШИДНЭ («холбоогүй» гэж худал хэлэхгүй) ── */
{
  metaFail = 'fail';
  await assert.rejects(() => W.loadPkgDeps(), /мета уншигдсангүй/);
  assert.equal(reads(), 0);
  console.log('✅ loadPkgDeps — мета бүгд унахад шиднэ');
}

/* ── 4. Нэг хуудасны мета унав, бусад нь талбаргүй — ШИДНЭ ([] БИШ) ── */
{
  metaFail = new Set([PKGS[0].key]);
  await assert.rejects(() => W.loadPkgDeps(), /мета уншигдсангүй/, 'уншигдаагүй хуудастай үед [] буцаав (худал «холбоогүй»)');
  console.log(`✅ loadPkgDeps — ганц хуудас (${PKGS[0].key}) уншигдаагүй ч шиднэ`);
}

/* ── 5. Бүх мета OK, `bagts_hamaaral` нэг ч хуудсанд алга — мөр УНШИХГҮЙ `[]` ── */
{
  metaFail = new Set();
  assert.deepEqual(await W.loadPkgDeps(), { deps: [] });
  assert.equal(reads(), 0, 'талбаргүй үед хуудасны мөр уншив (дэмий 24 асуулга)');
  console.log('✅ loadPkgDeps — талбаргүй бол [] , мөрийн асуулгагүй');
}

/* ── 6. Талбаргүй хуудсанд хадгалах — ЮУ Ч БИЧИХГҮЙ ── */
{
  const p = PKGS[0];
  const r = await W.saveWorkLinks({ p: p.key, k: 'x', o: 1 }, { add: [{ p: PKGS[1].key, k: 'y', o: 2 }], remove: [] });
  assert.equal(r.ok, false);
  assert.match(r.error, /bagts_hamaaral/);
  assert.equal(reads(), 0, 'талбаргүй хуудсанд query/applyEdits явав');
  console.log('✅ saveWorkLinks — `bagts_hamaaral` талбаргүй хуудас, бичилтгүй');
}

assertNoUnexpected(assert);
console.log('✅ workDepsRemote: зан үйлийн шалгуур давлаа');
