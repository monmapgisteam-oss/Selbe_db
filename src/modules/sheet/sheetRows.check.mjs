/**
 * «ГҮЙЦЭТГЭЛ БӨГЛӨХ» → «БАГЦЫН ГҮЙЦЭТГЭЛ» ХОЛБООСЫН ГЭРЭЭ — offline.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/sheet/sheetRows.check.mjs
 *
 * ⚠️ 2026-09-08: холбоосыг амьдаар тулгахад Багц 3.2 (12/12) ба Багц 4-1
 * (16/16) блок бүр ТААРСАН — зам зөв. Энэ файл тэр замын ХОЁР гэрээг барина:
 *
 *   1. `sheetRows` нь `bagts`-д `pkg.group` бичнэ, `pkg.label` БИШ.
 *      `buildingKey` нь `bagtsKey()`-ээр нормчилдог тул label орвол
 *      «БАГЦ29ДАВХАР» гэж тусдаа түлхүүр үүсч, PkgProg-д нэг блок хоёр
 *      удаа гарна. Одоо 9F/12F-ийн блокийн код ялгаатай (5/x vs 29/x) тул
 *      нийлэхгүй — гэвч тэр нь эх өгөгдлийн санамсаргүй тохироо.
 *   2. `bagtsKey` нь label ба group-ыг ЯЛГААТАЙ түлхүүрт хувиргадаг —
 *      «нийлүүлэх» гэсэн буруу таамаглал кодод орж ирвэл илэрнэ.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SRC = fs.readFileSync('src/modules/sheet/sheetRows.ts', 'utf8');

/* ── 1. bagts талбарт pkg.group л бичигдэнэ ── */
const pushes = [...SRC.matchAll(/bagts:\s*pkg\.(\w+)/g)].map((m) => m[1]);
assert.ok(pushes.length >= 1, '`bagts:` бичилт олдсонгүй');
for (const p of pushes) {
  assert.equal(p, 'group', `sheetRows нь bagts-д pkg.${p} бичиж байна — pkg.group байх ёстой`);
}
assert.ok(!/bagts:\s*pkg\.label/.test(SRC), 'bagts-д pkg.label орсон — PkgProg-д блок давхардана');
console.log('✅ sheetRows.bagts = pkg.group (label биш)');

/* ── 2. bagtsKey: label ба group нь ЯЛГААТАЙ түлхүүр ── */
const { bagtsKey, buildingKey } = await import('@/lib/services.ts');
const { PKGS } = await import('@/modules/sheet/bagts.pkg.ts');
for (const p of PKGS) {
  assert.notEqual(bagtsKey(p.group), bagtsKey(p.label),
    `${p.key}: group ба label нэг түлхүүрт нийлэв — buildingKey давхардлыг барихгүй`);
}
/* Нэг багцын 9F ба 12F хуудас ИЖИЛ group-тэй тул ижил түлхүүр — санаатай */
const b2 = PKGS.filter((p) => p.group === 'Багц 2');
assert.equal(b2.length, 2, 'Багц 2-т 2 хуудас байх ёстой');
assert.equal(bagtsKey(b2[0].group), bagtsKey(b2[1].group), '9F/12F нэг багцын group ижил түлхүүртэй байх ёстой');
/* Блокийн код ялгаатай тул buildingKey ялгаатай — өнөөдрийн бодит нөхцөл */
assert.notEqual(buildingKey('Багц 2', '5/1'), buildingKey('Багц 2', '29/1'));
assert.equal(buildingKey('Багц 2', '5/1'), buildingKey('Багц 2 ', ' 5/1 '), 'зай/хэлбэрээс үл хамаарах ёстой');
console.log('✅ bagtsKey — group≠label · 9F/12F нэг group · блок ялгаатай');

console.log('\nsheetRows.check: ok');
