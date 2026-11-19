/**
 * БАГЦЫН НЭРИЙН НЭГ СТАНДАРТ БИЧЛЭГ (2026-11-19) — `canonPkg` · `canonPkgText` · `pkgTextHas` · `scopeHas`.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/services/pkgCanon.check.mjs
 *
 * Дүрэм:
 *   1. «Багц 4-1»/«Багц 4.1»/«БАГЦ-4.1»/«БАГЦ - 19.1»/«Багц5_1» → «Багц-4.1»/«Багц-19.1»/«Багц-5.1»; тэг, «.0» хасна.
 *   2. «<багц> · үлдэгдэл» шошгын эх л стандарт болно.
 *   3. Диапазон/жагсаалт («Багц 1,2», «БАГЦ 1- 4»), дотоод түлхүүр («БАГЦ41»), чөлөөт текст — ХЭВЭЭР.
 *   4. `PKGS`-ийн `group`/`name` бүгд стандарт; зураастай дэд кодын жагсаалт `PKGS`-ийг хамарна.
 *   5. `scopeHas` — `null` хязгааргүй, `*` бүх багц, хуучин/шинэ бичлэг нэг багц, хоосон нэр хэзээ ч үгүй.
 */
import assert from 'node:assert/strict';
const { canonPkg, canonPkgText, pkgTextHas, sameBagts, PKG_SUB_CODES } = await import('@/lib/services/fields.ts');
const { scopeHas, ALL_BAGTS } = await import('@/lib/scopedAcl.ts');
const { PKGS } = await import('@/modules/sheet/bagts.pkg.ts');

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };

ok('canonPkg: ганц багцын нэр', () => {
  const cases = [
    ['Багц 4-1', 'Багц-4.1'], ['Багц 4.1', 'Багц-4.1'], ['БАГЦ-4.1', 'Багц-4.1'], ['БАГЦ - 19.1', 'Багц-19.1'],
    ['Багц5_1', 'Багц-5.1'], ['Багц 1', 'Багц-1'], ['Багц -3.2', 'Багц-3.2'], ['  багц 2  ', 'Багц-2'],
    ['Багц 05.1', 'Багц-5.1'], ['Багц 10.0', 'Багц-10'], ['БАГЦ-4-1', 'Багц-4.1'], ['Багц 2.3-1', 'Багц-2.3.1'],
    ['Багц 6-10', 'Багц-6.10'], ['Багц-4.1', 'Багц-4.1'], ['Багц–4.2', 'Багц-4.2'],
  ];
  for (const [a, b] of cases) assert.equal(canonPkg(a), b, a);
});

ok('canonPkg: «<багц> · үлдэгдэл» шошго', () => {
  assert.equal(canonPkg('Багц 4-1 · 9 давхар'), 'Багц-4.1 · 9 давхар');
  assert.equal(canonPkg('Багц 1·12 давхар'), 'Багц-1 · 12 давхар');
  assert.equal(canonPkg('Багц-4.2 · 12 давхар'), 'Багц-4.2 · 12 давхар');
});

ok('canonPkg: диапазон, жагсаалт, дотоод түлхүүр, чөлөөт текст — хэвээр', () => {
  for (const v of ['Багц 1,2', 'БАГЦ 1- 4', 'Багц 1-4', 'БАГЦ 1-6\nБАГЦ 8-17', 'БАГЦ41', 'БАГЦ1', 'b41_9f', 'CF:1',
    'plan:12', 'Бүх багц', 'Тухайлсан', '', 'Суурийн холболтын ажил', 'Багц Т · 1']) {
    assert.equal(canonPkg(v), v, JSON.stringify(v));
  }
  assert.equal(canonPkg(null), null);
  assert.equal(canonPkg(undefined), undefined);
  assert.equal(canonPkg(41), 41);
});

ok('canonPkgText / pkgTextHas: хуучин ба шинэ бичлэг хоорондоо таарна', () => {
  const old = 'Гүйцэтгэл · 2026.09.07 · Багц 4-1 · 9 давхар';
  assert.equal(canonPkgText(old), 'Гүйцэтгэл · 2026.09.07 · Багц-4.1 · 9 давхар');
  assert.ok(pkgTextHas(old, 'Багц-4.1 · 9 давхар'));
  assert.ok(pkgTextHas('Гүйцэтгэл · 2026.09.07 · Багц-4.1 · 9 давхар', 'Багц 4-1 · 9 давхар'));
  assert.ok(!pkgTextHas(old, 'Багц-4.2 · 9 давхар'));
  assert.ok(!pkgTextHas('Гүйцэтгэл · 2026.09.07 · Багц-1 · 12 давхар', 'Багц-1 · 9 давхар'));
  assert.ok(!pkgTextHas(old, ''));
  assert.equal(canonPkgText('БАГЦ 1- 4 ба БАГЦ41'), 'БАГЦ 1- 4 ба БАГЦ41');
  assert.ok(sameBagts('Багц 4-1', 'Багц-4.1') && !sameBagts('', '') && !sameBagts('Багц-4.1', 'Багц-4.2'));
});

ok('PKGS: group ба name стандарт бичлэгтэй; зураастай дэд код PKGS-ийг хамарна', () => {
  for (const p of PKGS) {
    assert.equal(canonPkg(p.group), p.group, p.key);
    assert.equal(canonPkg(p.name), p.name, p.key);
    assert.ok(p.name === p.group || p.name.startsWith(`${p.group} · `), p.key);
    const m = /^Багц-(\d+\.\d+)$/.exec(p.group);
    if (m) assert.ok(PKG_SUB_CODES.has(m[1]), `PKG_SUB_CODES-д алга: ${m[1]}`);
  }
});

ok('scopeHas: хязгааргүй, бүх багц, хуучин/шинэ бичлэг, хоосон нэр', () => {
  assert.equal(scopeHas(null, 'Багц-4.1'), true);
  assert.equal(scopeHas(undefined, 'Багц-4.1'), true);
  assert.equal(scopeHas([], 'Багц-4.1'), false);
  assert.equal(scopeHas([ALL_BAGTS], 'Багц-4.1'), true);
  assert.equal(scopeHas(['Багц 4-1'], 'Багц-4.1'), true);
  assert.equal(scopeHas(['Багц-4.1'], 'Багц 4-1'), true);
  assert.equal(scopeHas(['Багц-4.1'], 'Багц-4.2'), false);
  assert.equal(scopeHas(['Багц-4.1'], ''), false);
  assert.equal(scopeHas([''], ''), false);
});

console.log(`pkgCanon: ${n} шалгалт давлаа`);
