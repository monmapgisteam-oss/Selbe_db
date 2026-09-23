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

/* ── 1б. Синтетик блок `mon:building` join-д ОРОХГҮЙ (2026-09-23) ──
 * `sheetRows` нь `blockProgress`/`negtgel`/`PkgProg`-ийн эх — блокгүй багцын
 * синтетик «Ажил» блок энд орвол `buildingKey('Багц 5.1','Ажил')` гэсэн хуурамч
 * барилга үүснэ. Тиймээс энд `loadSchema(pkg)` ЗӨВХӨН опт-ингүй дуудагдана. */
assert.ok(!/synthetic/.test(SRC), 'sheetRows нь loadSchema-г synthetic опт-интой дуудаж байна — mon:building join-д хуурамч блок орно');
console.log('✅ sheetRows — синтетик блок ОРОХГҮЙ (loadSchema опт-ингүй)');

/* ── 2. bagtsKey: label ба group нь ЯЛГААТАЙ түлхүүр ── */
const { bagtsKey, buildingKey } = await import('@/lib/services.ts');
const { PKGS } = await import('@/modules/sheet/bagts.pkg.ts');
/**
 * ⚠️ ЗӨВХӨН ОЛОН ХУУДАСТАЙ БАГЦАД (2026-09-16). Давхардлын эрсдэл нь нэг
 *    багц ХЭД ХЭДЭН хуудастай (9F · 12F) үед л үүснэ — тэнд `label` нь
 *    давхраараа ялгагдах ЁСТОЙ, эс бөгөөс `PkgProg`-д блок давхардана.
 *
 *    Нэмэлт багцууд (5.x · 6.x · 10) нь давхраар салдаггүй тул хуудас ГАНЦ
 *    бөгөөд `label === group` — давхардах зүйл байхгүй.
 */
const multi = PKGS.filter((x) => PKGS.filter((y) => y.group === x.group).length > 1);
assert.ok(multi.length >= 6, `олон хуудастай багц дор хаяж 6 байх ёстой, олдсон: ${multi.length}`);
for (const p of multi) {
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


/* ── 3. resolveSchema: ЗОРИЛТОТ ба ХУУЧИН нэр зэрэг байвал ЗОРИЛТОТ (2026-09-23) ──
 * ⚠️ 18 хуудас бүгд зорилтот нэртэй мөрийн багана авсан ч хуучин хувилбар
 *    (`Обьём__Шинэ` …) ХЭВЭЭР үлдсэн. Шинэ багана талбарын жагсаалтын СҮҮЛД
 *    байдаг тул fuzzy `find` хуучныг эхэлж олох эрсдэлтэй — энд хуучныг
 *    санаатайгаар ЭХЭНД тавьж, сонголт зорилтот руу унахыг барина. */
const { resolveSchema } = await import('@/modules/sheet/bagts.pkg.ts');
const F = (name, type = 'esriFieldTypeDouble') => ({ name, type });
const oldFirst = [
  F('ObjectID', 'esriFieldTypeOID'), F('F_', 'esriFieldTypeString'), F('Ажил', 'esriFieldTypeString'),
  F('Хувийн_жин_шинэ'), F('Хувийн_жин_шинэ1'), F('Хувийн_жин_одоо_байгаа'),
  F('Обьём__Шинэ'), F('Нэгж_өртөг__Шинэ'), F('Мөнгөн_дүн__Шинэ'),
  F('Төлөвлөгөөт_гүйцтэгэл'), F('Гүйцэтгэл'), F('Төлөвлөгөө_биеэлэлт'),
  F('F5_1_гүйцэтгэл'), F('F5_1_төлөвлөгөөт'),
  /* зорилтот — СҮҮЛД */
  F('Хувийн_жин'), F('Хувийн_жин1'), F('Хувийн_жин__Одоо_байгаа'),
  F('Обьём'), F('Нэгж_өртөг'), F('Мөнгөн_дүн'), F('Инженерийн_төлөвлөсөн_обьём'),
  F('Төлөвлөгөөт_гүйцэтгэл'), F('Бодит_гүйцэтгэл'), F('Төлөвлөгөө_биелэлт'),
  F('Шинэчлэгдсэн_огноо', 'esriFieldTypeDate'), F('obyem_sum'),
];
const sc3 = resolveSchema(oldFirst).f;
assert.deepEqual(
  { wC: sc3.wC, wD: sc3.wD, wE: sc3.wE, vol: sc3.vol, unit: sc3.unit, money: sc3.money, plan: sc3.plan, act: sc3.act, ratio: sc3.ratio, asOf: sc3.asOf, plannedVol: sc3.plannedVol, obyemSum: sc3.obyemSum },
  { wC: 'Хувийн_жин', wD: 'Хувийн_жин1', wE: 'Хувийн_жин__Одоо_байгаа', vol: 'Обьём', unit: 'Нэгж_өртөг', money: 'Мөнгөн_дүн', plan: 'Төлөвлөгөөт_гүйцэтгэл', act: 'Бодит_гүйцэтгэл', ratio: 'Төлөвлөгөө_биелэлт', asOf: 'Шинэчлэгдсэн_огноо', plannedVol: 'Инженерийн_төлөвлөсөн_обьём', obyemSum: 'obyem_sum' },
  'зорилтот ба хуучин зэрэг байхад зорилтот сонгогдох ёстой',
);
/* Зорилтот БАЙХГҮЙ (хуучин бүтэц) — fuzzy хэвээр ажиллана */
const legacy = resolveSchema(oldFirst.slice(0, 14)).f;
assert.equal(legacy.vol, 'Обьём__Шинэ');
assert.equal(legacy.wC, 'Хувийн_жин_шинэ');
assert.equal(legacy.wD, 'Хувийн_жин_шинэ1');
assert.equal(legacy.wE, 'Хувийн_жин_одоо_байгаа');
assert.equal(legacy.plan, 'Төлөвлөгөөт_гүйцтэгэл');
assert.equal(legacy.act, 'Гүйцэтгэл');
assert.equal(legacy.ratio, 'Төлөвлөгөө_биеэлэлт');
/* Синтетик блок: мөрийн хуваарийн багана яг нэрээр */
const syn3 = resolveSchema([...oldFirst.slice(0, 12), F('Төлөвлөгөөт_хуваарь__Эхлэх', 'esriFieldTypeDate'), F('Төлөвлөгөөт_хуваарь__Дуусах', 'esriFieldTypeDate'), F('Ажил_гүйцэтгэл'), F('Төлөвлөгөөт_гүйцэтгэл')], { synthetic: true });
assert.equal(syn3.start[0], 'Төлөвлөгөөт_хуваарь__Эхлэх');
assert.equal(syn3.end[0], 'Төлөвлөгөөт_хуваарь__Дуусах');
assert.equal(syn3.plan[0], 'Төлөвлөгөөт_гүйцэтгэл');
console.log('✅ resolveSchema — зорилтот ба хуучин зэрэг байвал зорилтот; зорилтотгүй бол fuzzy');



console.log('\nsheetRows.check: ok');
