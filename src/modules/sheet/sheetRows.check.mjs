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
/* ⚠️ 2026-10-13 (хэрэглэгч: «бүх гүйцэтгэлийг 01-ийн батлагдсан хэсгээс нэгтгэ»): синтетик блок нь ЗӨВХӨН
   опт-ин `blockless` замд (блокгүй багцын БАГЦЫН түвшний нэгтгэл — `blockProgress.loadInfra*`). Анхдагч
   (блоктой) зам ба `sheetBlockKeys` урьдын адил опт-ингүй — `mon:building` join-д хуурамч блок ОРОХГҮЙ. */
assert.ok(!/synthetic:\s*true|fillSchema/.test(SRC), 'sheetRows нь synthetic/fillSchema-г шууд дуудаж байна — зөвхөн schemaOf(pkg, fill) замаар');
/* ⚠️ 2026-10-09: бөглөх бүдүүвч (`{ fill: true }`) синтетик блок өгнө — ЗӨВХӨН `fill` аргументтай `schemaOf`-д */
assert.ok(/fill \? \{ fill: true \} : \{\}/.test(SRC), 'schemaOf: бөглөх бүдүүвч ЗӨВХӨН `fill` аргументаар');
assert.equal([...SRC.matchAll(/fill:\s*true/g)].length, 2, 'sheetRows: `{ fill: true }` schemaOf-оос гадна (эсвэл тайлбараас өөр газар) гарсан');
assert.ok(/schemaOf\(pkg, blockless\)/.test(SRC), 'loadSheetRows: бөглөх бүдүүвч ЗӨВХӨН `blockless` опт-инээр');
assert.ok(/!blockless \|\| p\.floors == null/.test(SRC), 'loadSheetRows: `blockless` замд ЗӨВХӨН блокгүй багц');
{
  const a = SRC.indexOf('export async function sheetBlockKeys');
  const b = SRC.indexOf('export async function sheetBlocklessKeys');
  assert.ok(a >= 0 && b > a, 'sheetBlockKeys / sheetBlocklessKeys олдсонгүй');
  const body = SRC.slice(a, b);
  assert.ok(/schemaOf\(pkg\)/.test(body) && !/schemaOf\(pkg, /.test(body), 'sheetBlockKeys синтетик блок авч байна — блокийн хуваарьт хуурамч блок орно');
}
{
  const BP = fs.readFileSync('src/lib/blockProgress.ts', 'utf8');
  assert.ok(/const loadRows = memo\(fetchConstruction, \['BAGTS_SHEET'\]\)/.test(BP), 'loadBlockProgress/History нь блокгүй замыг уншиж байна');
  assert.ok(/return compute\(await fetchConstruction\(\)\);/.test(BP), 'loadBlockProgressFresh нь блокгүй замыг уншиж байна');
  assert.ok(/memo\(\(\) => fetchConstruction\(true\)/.test(BP), 'loadInfra* нь блокгүй замаар уншихгүй байна');
}
console.log('✅ sheetRows — синтетик блок ЗӨВХӨН блокгүй (blockless) замд, блокийн замд ОРОХГҮЙ');

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
  F('objectid', 'esriFieldTypeOID'), F('f_', 'esriFieldTypeString'), F('Ажил', 'esriFieldTypeString'),
  F('хувийн_жин_шинэ'), F('хувийн_жин_шинэ1'), F('хувийн_жин_одоо_байгаа'),
  F('обьём__шинэ'), F('нэгж_өртөг__шинэ'), F('мөнгөн_дүн__шинэ'),
  F('төлөвлөгөөт_гүйцтэгэл'), F('Гүйцэтгэл'), F('төлөвлөгөө_биеэлэлт'),
  F('f5_1_гүйцэтгэл'), F('F5_1_төлөвлөгөөт'),
  /* зорилтот — СҮҮЛД */
  F('хувийн_жин'), F('хувийн_жин1'), F('хувийн_жин__одоо_байгаа'),
  F('Обьём'), F('нэгж_өртөг'), F('мөнгөн_дүн'), F('инженерийн_төлөвлөсөн_обьём'),
  F('төлөвлөгөөт_гүйцэтгэл'), F('бодит_гүйцэтгэл'), F('төлөвлөгөө_биелэлт'),
  F('шинэчлэгдсэн_огноо', 'esriFieldTypeDate'), F('obyem_sum'),
];
const sc3 = resolveSchema(oldFirst).f;
assert.deepEqual(
  { wC: sc3.wC, wD: sc3.wD, wE: sc3.wE, vol: sc3.vol, unit: sc3.unit, money: sc3.money, plan: sc3.plan, act: sc3.act, ratio: sc3.ratio, asOf: sc3.asOf, plannedVol: sc3.plannedVol, obyemSum: sc3.obyemSum },
  { wC: 'хувийн_жин', wD: 'хувийн_жин1', wE: 'хувийн_жин__одоо_байгаа', vol: 'Обьём', unit: 'нэгж_өртөг', money: 'мөнгөн_дүн', plan: 'төлөвлөгөөт_гүйцэтгэл', act: 'бодит_гүйцэтгэл', ratio: 'төлөвлөгөө_биелэлт', asOf: 'шинэчлэгдсэн_огноо', plannedVol: 'инженерийн_төлөвлөсөн_обьём', obyemSum: 'obyem_sum' },
  'зорилтот ба хуучин зэрэг байхад зорилтот сонгогдох ёстой',
);
/* Зорилтот БАЙХГҮЙ (хуучин бүтэц) — fuzzy хэвээр ажиллана */
const legacy = resolveSchema(oldFirst.slice(0, 14)).f;
assert.equal(legacy.vol, 'обьём__шинэ');
assert.equal(legacy.wC, 'хувийн_жин_шинэ');
assert.equal(legacy.wD, 'хувийн_жин_шинэ1');
assert.equal(legacy.wE, 'хувийн_жин_одоо_байгаа');
assert.equal(legacy.plan, 'төлөвлөгөөт_гүйцтэгэл');
assert.equal(legacy.act, 'Гүйцэтгэл');
assert.equal(legacy.ratio, 'төлөвлөгөө_биеэлэлт');
/* Синтетик блок: мөрийн хуваарийн багана яг нэрээр */
const syn3 = resolveSchema([...oldFirst.slice(0, 12), F('төлөвлөгөөт_хуваарь__эхлэх', 'esriFieldTypeDate'), F('төлөвлөгөөт_хуваарь__дуусах', 'esriFieldTypeDate'), F('ажил_гүйцэтгэл'), F('төлөвлөгөөт_гүйцэтгэл')], { synthetic: true });
assert.equal(syn3.start[0], 'төлөвлөгөөт_хуваарь__эхлэх');
assert.equal(syn3.end[0], 'төлөвлөгөөт_хуваарь__дуусах');
assert.equal(syn3.plan[0], 'төлөвлөгөөт_гүйцэтгэл');
console.log('✅ resolveSchema — зорилтот ба хуучин зэрэг байвал зорилтот; зорилтотгүй бол fuzzy');



/* ── 5. ХАДГАЛАГДСАН ОГНООГ UTC ӨДӨРТ ТЭГШИТГЭХ (2026-10-08) ──
 * Хуучин мөрүүдэд ОРОН НУТГИЙН шөнө дунд (УБ: өмнөх өдрийн 16:00Z) хадгалагдсан огноо бий;
 * `msToDay`/`spanFrac` UTC-ээр боддог тул тэд нэг өдрөөр гулсдаг байв. `normDayMs` нь
 * хамгийн ойрын UTC шөнө дунд руу буулгана (`loadRows` · `sheetRows` хоёул). */
{
  const { normDayMs, msToDay } = await import('@/modules/sheet/bagtsSheet.ts');
  const DAY = 86_400_000;
  const mid = Date.parse('2026-03-01T00:00:00Z');
  assert.equal(normDayMs(mid), mid, 'UTC шөнө дунд хэвээр');
  assert.equal(normDayMs(mid + 8 * 3_600_000), mid, '+8 цаг (08:00Z) → тэр өдөр');
  assert.equal(normDayMs(mid - 8 * 3_600_000), mid, 'УБ-ын шөнө дунд (өмнөх өдрийн 16:00Z) → 03-01, 02-28 БИШ');
  assert.equal(msToDay(normDayMs(Date.parse('2026-02-28T16:00:00Z'))), '2026-03-01', 'сарын 1 өмнөх сар руу гулсахгүй');
  assert.equal(normDayMs(mid + 11 * 3_600_000), mid, '+11 цаг → доош');
  assert.equal(normDayMs(mid + 13 * 3_600_000), mid + DAY, '+13 цаг → дараагийн өдөр');
  assert.equal(normDayMs(null), null, 'null хэвээр (null ≠ 0)');
  assert.equal(normDayMs(NaN), null, 'NaN → null');
  /* Эх код: `sheetRows` ба `loadRows` хоёул `normDayMs`-ээр уншина */
  assert.match(SRC, /start: withDates && sc\.start\[i\] \? normDayMs\(/, 'sheetRows.start normDayMs-ээр');
  assert.match(SRC, /end: withDates && sc\.end\[i\] \? normDayMs\(/, 'sheetRows.end normDayMs-ээр');
  /* ⚠️ 2026-10-09: агшны огноо (`fillDate` → `date`) ч мөн normDayMs-ээр */
  assert.match(SRC, /const date = msToDay\(normDayMs\(ms\)\);/, 'sheetRows.date normDayMs-ээр');
  const SHEET = fs.readFileSync('src/modules/sheet/bagtsSheet.ts', 'utf8');
  assert.match(SHEET, /start: sc\.start\.map\(\(x\) => \(x \? normDayMs\(num\(a\[x\]\)\) : null\)\)/, 'loadRows.start normDayMs-ээр');
  assert.match(SHEET, /asOf = normDayMs\(num\(a\[sc\.f\.asOf\]\)\)/, 'loadRows.asOf normDayMs-ээр');
  /* ⚠️ 2026-10-08: гэрээний ба бодит огноо ч нэг дүрмээр (илгээлтийн тулгалт зөрдөг байв) */
  for (const f of ['gStart', 'gEnd', 'aStart', 'aEnd']) {
    assert.match(SHEET, new RegExp(`${f}: sc\\.${f}\\.map\\(\\(x\\) => \\(x \\? normDayMs\\(num\\(a\\[x\\]\\)\\) : null\\)\\)`), `loadRows.${f} normDayMs-ээр`);
  }
}
console.log('✅ normDayMs — локал шөнө дунд → UTC өдөр (loadRows · sheetRows)');

/* ── 6. ТАСАРСАН ХУУЛБАРЫГ ХАСНА (2026-10-12, A8) ──
 * Унасан батлалтын хагас жааз / яг одоо бичигдэж буй жааз дашбоард руу батлагдаагүй утга оруулахгүй.
 * Жинхэнэ бүтцийн богиносолт (дараагийн хуулбар ижил урттай) хасагдахгүй. */
{
  const { truncatedSnaps } = await import('./sheetRows.ts');
  const d = (lens) => [...truncatedSnaps(lens)].sort((a, b) => a - b);
  assert.deepEqual(d([1471, 1471, 1471]), [], 'бүгд бүтэн');
  assert.deepEqual(d([1471, 500, 1471]), [1], 'дунд тасарсан — ард бүтэн жааз');
  assert.deepEqual(d([1471, 1471, 1000]), [2], 'сүүлийнх тасарсан/бичигдэж буй');
  assert.deepEqual(d([1471, 500, 1471, 1000]), [1, 3], 'хоёр тасарсан');
  assert.deepEqual(d([1471, 1400, 1400, 1400]), [], 'бүтэц жинхэнээр богиноссон — дараагийнх ижил урт → үлдэнэ');
  assert.deepEqual(d([500, 1471]), [], 'эхний хуулбар харьцуулах зүйлгүй');
  assert.deepEqual(d([6, 3, 6]), [1], 'constructionOnly (Б-мөр л) — хагас жааз цөөн Б-мөртэй');
  assert.deepEqual(d([1471, 0, 1471]), [], 'хоосон хуулбар тоологдохгүй');
  assert.match(SRC, /const drop = truncatedSnaps\(lens\);/, 'loadSheetRows тасарсан хуулбарыг хасахгүй байна');
}
console.log('✅ sheetRows — тасарсан хуулбар дашбоард руу орохгүй');

console.log('\nsheetRows.check: ok');
