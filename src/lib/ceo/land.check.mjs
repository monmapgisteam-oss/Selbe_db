/**
 * CEO KPI «Нэгж талбар / газар чөлөөлөлт» — цэвэр тооцооны шалгуур.
 *
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/ceo/land.check.mjs
 *
 * Хамгаалж буй бодит алдаанууд:
 *  1. МЭДЭЭЛЭЛГҮЙ нь ТЭГ болох — талбайгүй мөр «0 га» биш «—».
 *  2. `areaAlt` нөөц — `area` хоосон үед л, `area`=0 бол 0 хэвээр.
 *  3. Эх ХЭСЭГЧЛЭН унахад тоо ЗОХИОХГҮЙ — давхцал унавал давхцлын хүснэгт,
 *     баримт, анхааруулга гарахгүй; `failedSources`-д нэр нь орно.
 *  4. Төлөвгүй мөр чимээгүй алга болохгүй — тусдаа шалтгаанаар харагдана.
 *  5. Жагсаалт БҮРЭН, эрэмбэтэй, 300-аас хэтэрвэл тасалсан тоо ИЛ.
 */

import assert from 'node:assert/strict';
import { computeLand, parseParcels, byReason, sumAreaM2, NO_STATUS, SOURCE, lastEditOf } from './land.ts';
import { ROW_CAP } from './kpi.ts';
import { PARCEL_LEFT } from '../services.ts';

const F = PARCEL_LEFT.fields;
const OID = PARCEL_LEFT.oid;

/** Түүхий ArcGIS мөр угсрах */
const raw = (oid, status, area, extra = {}) => ({
  [OID]: oid,
  [F.status]: status,
  [F.area]: area,
  [F.areaAlt]: null,
  [F.parcelNo]: `146180${oid}`,
  [F.owner]: `Эзэмшигч ${oid}`,
  [F.address]: 'Хандгайтын гудамж',
  [F.landuse]: ' ',
  [F.note]: null,
  ...extra,
});

const parcels = parseParcels([
  raw(1, 'зөвшилцөх', 475),
  raw(2, 'зөвшилцөх', 10290),
  raw(3, 'зөвшилцөх', 137),
  raw(4, 'татгалзсан', 2199),
  raw(5, 'татгалзсан', 700),
  raw(6, 'маргаантай', 361),
  raw(7, 'гэрээлсэн', null, { [F.areaAlt]: 500 }),   // areaAlt нөөц
  raw(8, 'гэрээлсэн', 0),
  raw(9, null, null),                                 // төлөвгүй, талбайгүй
]);
const clearance = { cleared: 1945, remaining: 9, remainingHa: 1.4162, total: 1954, pct: 99.54 };
const overlaps = { total: 4, byPkg: [{ name: 'Багц 1 · 9 давхар', parcels: 1 }, { name: 'Багц 6.5 · ХТП/РП', parcels: 3 }] };

/* ══════════ 1. parseParcels — нөөц талбай, төлөвгүй, хоосон текст ══════════ */

assert.equal(parcels.length, 9);
assert.equal(parcels[6].areaM2, 500, 'area хоосон → areaAlt');
assert.equal(parcels[7].areaM2, null, 'area=0, нөөцгүй → null (0 БИШ)');
{
  const [z1, z2, z3] = parseParcels([
    raw(30, 'зөвшилцөх', 0, { [F.areaAlt]: 0, SHAPE__Area: 336.4 }),
    raw(31, 'зөвшилцөх', 0, { [F.areaAlt]: 120 }),
    raw(32, 'зөвшилцөх', 278, { SHAPE__Area: 277.6 }),
  ]);
  assert.equal(z1.areaM2, 336.4, 'area=0 ба Талб_1=0 → полигоны талбай');
  assert.equal(z2.areaM2, 120, 'area=0 → Талб_1');
  assert.equal(z3.areaM2, 278, 'area_m2 тэргүүнд');
  /* Хуваагдсан нэгж талбар (ижил дугаар + ижил талбай, 2 полигон) — нийлбэрт НЭГ удаа */
  const split = parseParcels([
    raw(40, 'зөвшилцөх', 685, { [F.parcelNo]: '1461802706' }),
    raw(41, 'зөвшилцөх', 685, { [F.parcelNo]: '1461802706' }),
    raw(42, 'зөвшилцөх', 100),
  ]);
  assert.equal(split.length, 3, 'хүснэгтэд полигон бүр хэвээр');
  assert.equal(sumAreaM2(split), 785, '685 давхар тоологдохгүй');
  const sr = byReason(split);
  assert.equal(sr.length, 1);
  assert.equal(sr[0].n, 3, 'тоо — мөр бүр');
  assert.equal(sr[0].ha, 785 / 10_000, 'byReason: хуваагдсан талбай давхар тоологдохгүй');
  /* Зориулалт: landuse_de бүтэн ?? Zoriulalt (тасархайг бүтэн нэрээр нөхнө) */
  const [u1, u2, u3] = parseParcels([
    raw(50, 'зөвшилцөх', 1, { [F.landuseFull]: 'Худалдаа, нийтийн үйлчилгээний газар, төв, цогцолбор', [F.landuse]: ' ' }),
    raw(51, 'зөвшилцөх', 1, { [F.landuseFull]: ' ', [F.landuse]: 'Гэр, орон сууцны хашааны га' }),
    raw(52, 'зөвшилцөх', 1, { [F.landuseFull]: ' ', [F.landuse]: 'Амины орон сууц' }),
  ]);
  assert.equal(u1.landuse, 'Худалдаа, нийтийн үйлчилгээний газар, төв, цогцолбор');
  assert.equal(u2.landuse, 'Гэр, орон сууцны хашааны газар', 'тасархай (50 байт) → бүтэн нэр');
  assert.equal(u3.landuse, 'Амины орон сууц', 'бүтэн нэр мэдэгдэхгүй — өөрөө');
}
assert.equal(parcels[8].areaM2, null, 'хоёулаа хоосон → null');
assert.equal(parcels[8].reason, NO_STATUS(), 'төлөвгүй мөр тусдаа шалтгаантай');
assert.equal(parcels[0].landuse, null, '" " зориулалт → null («—»)');
assert.equal(parcels[0].parcelNo, '1461801');
/* 2026-10-09: «Бүрэн чөлөөлсөн»-ийн ХУВИЛБАР бичиглэл саад БИШ (`land.isClearedStatus`-тэй ижил) */
assert.deepEqual(
  parseParcels([raw(20, 'Бүрэн чөлөөлсөн.', 1), raw(21, ' бүрэн  чөлөөлсөн ', 1), raw(22, 'зөвшилцөх', 1)]).map((p) => p.oid),
  [22],
);

/* ══════════ 2. null ≠ 0 — нийлбэр ══════════ */

assert.equal(sumAreaM2([]), null);
assert.equal(sumAreaM2(parcels.filter((p) => p.areaM2 == null)), null, 'бүгд талбайгүй → null, 0 биш');
assert.equal(sumAreaM2(parcels), 475 + 10290 + 137 + 2199 + 700 + 361 + 500 + 0);

const reasons = byReason(parcels);
assert.deepEqual(reasons.map((r) => r.reason), ['зөвшилцөх', 'татгалзсан', 'гэрээлсэн', 'маргаантай', NO_STATUS()],
  'тоогоор буурах; тэнцвэл га-гаар буурах');
assert.equal(reasons.find((r) => r.reason === NO_STATUS()).ha, null, 'талбайгүй бүлгийн га null');
assert.equal(reasons.find((r) => r.reason === 'гэрээлсэн').ha, 0.05);

/* ══════════ 3. Бүрэн амжилт ══════════ */

const ok = computeLand({ clearance, parcels, overlaps, failed: [] });
assert.equal(ok.value, '9');
assert.equal(ok.level, 'bad', 'давхцал 4 → улаан (overlapLevel-д дунд түвшин байхгүй)');
assert.equal(ok.asOf, null);
assert.deepEqual(ok.failedSources, []);
assert.ok(ok.facts.some((f) => f.includes('99.5%')), `хувь баримт: ${ok.facts}`);
assert.ok(ok.facts.includes('1.5 га үлдсэн'), `га баримт (14662 м² → 1.5 га, давхар tr): ${ok.facts}`);
assert.ok(ok.facts.includes('Чөлөөлсөн 99.5%'), `хувь баримт толины түлхүүрээр: ${ok.facts}`);
assert.ok(ok.facts.includes('4 давхцсан талбар'), `давхцлын баримт толины түлхүүрээр: ${ok.facts}`);
assert.ok(ok.facts.some((f) => f.startsWith('4 ')), `давхцлын баримт: ${ok.facts}`);
assert.ok(ok.facts.some((f) => f === 'зөвшилцөх 3'), `гол шалтгаан: ${ok.facts}`);
assert.ok(ok.facts.every((f) => /\d/.test(f)), 'баримт бүр тоотой');

assert.equal(ok.tables.length, 3);
const [tReason, tParcels, tOverlap] = ok.tables;
assert.equal(tReason.rows.length, 5);
assert.deepEqual(tReason.rows[0].map((c) => c.v), ['зөвшилцөх', 3, (475 + 10290 + 137) / 10_000]);
assert.equal(tReason.rows[0][2].kind, 'ha');
assert.equal(tReason.rows.at(-1)[2].v, null, 'төлөвгүй бүлгийн га нүд «—»');

assert.equal(tParcels.rows.length, 9, 'үлдсэн мөр БҮР нэртэй');
assert.equal(tParcels.cols.length, 7);
assert.deepEqual(tParcels.cols.slice(0, 1).concat(tParcels.cols[4]), ['Кадастрын дугаар', 'Талбай (м²)'], 'толинд байгаа баганын нэр');
assert.equal(tOverlap.title, SOURCE.overlaps(), 'давхцлын хүснэгт ба эх сурвалжийн нэр ижил');
assert.deepEqual(
  tParcels.rows.map((r) => r[0].v),
  ['1461802', '1461801', '1461803', '1461804', '1461805', '1461807', '1461808', '1461806', '1461809'],
  'шалтгааны эрэмбэ (том бүлэг эхэнд), дотроо талбай буурах, null сүүлд',
);
assert.equal(tParcels.rows[0][1].v, 'Эзэмшигч 2');
assert.equal(tParcels.rows[0][4].v, 10290);
assert.equal(tParcels.rows.at(-1)[4].v, null, 'талбайгүй мөрийн м² «—», 0 биш');
assert.equal(tParcels.rows.at(-1)[5].v, null);

assert.deepEqual(tOverlap.rows.map((r) => [r[0].v, r[1].v]), [['Багц 6.5 · ХТП/РП', 3], ['Багц 1 · 9 давхар', 1]],
  'давхцал буурах эрэмбээр');

assert.equal(ok.issues.filter((i) => i.tone === 'bad').length, 1);
assert.ok(ok.issues[0].text.startsWith('4 '), ok.issues[0].text);
const warns = ok.issues.filter((i) => i.tone === 'warn').map((i) => i.text);
assert.deepEqual(warns, ['татгалзсан: 2 талбар', 'маргаантай: 1 талбар'], 'зөвхөн маргаан/татгалзал');

/* ══════════ 4. Давхцал унасан — тоо зохиохгүй ══════════ */

const noOv = computeLand({ clearance, parcels, overlaps: null, failed: [SOURCE.overlaps()] });
assert.equal(noOv.tables.length, 2, 'давхцлын хүснэгт ГАРАХГҮЙ');
assert.ok(noOv.facts.every((f) => !f.includes('давхц')), 'давхцлын баримт гарахгүй');
assert.equal(noOv.issues.filter((i) => i.tone === 'bad').length, 0);
assert.equal(noOv.level, 'good', 'зөвхөн хувь → 99.5% ногоон');
assert.deepEqual(noOv.failedSources, [SOURCE.overlaps()]);

/* ══════════ 5. Нэгтгэл унасан — мөрийн тооноос ══════════ */

const noCl = computeLand({ clearance: null, parcels, overlaps, failed: [SOURCE.clearance()] });
assert.equal(noCl.value, '9', 'remaining = нэртэй мөрийн тоо');
assert.ok(noCl.facts.every((f) => !f.includes('%')), 'хувь баримт гарахгүй');
assert.equal(noCl.level, 'bad');

/* ══════════ 6. Мөрүүд унасан — нэгтгэлийн га руу унана ══════════ */

const noP = computeLand({ clearance, parcels: null, overlaps, failed: [SOURCE.parcels()] });
assert.equal(noP.value, '9');
assert.ok(noP.facts.some((f) => f.includes('1.4')), `live remainingHa: ${noP.facts}`);
assert.equal(noP.tables.length, 1, 'зөвхөн давхцлын хүснэгт');
assert.equal(noP.issues.filter((i) => i.tone === 'warn').length, 0);

/* ══════════ 7. Бүгд унасан → throw; давхцал 0 → good ══════════ */

assert.throws(() => computeLand({ clearance: null, parcels: null, overlaps: null, failed: [] }));
const clean = computeLand({ clearance: { ...clearance, remaining: 0 }, parcels: [], overlaps: { total: 0, byPkg: [] }, failed: [] });
assert.equal(clean.level, 'good');
assert.equal(clean.value, '0');
assert.equal(clean.issues.length, 0);
assert.ok(clean.facts.every((f) => !f.includes('га')), 'мөргүй → га баримт байхгүй (null, 0 биш)');

/* ══════════ 8. 300-аас хэтрэх — тасалсан тоо ИЛ ══════════ */

const many = parseParcels(Array.from({ length: ROW_CAP + 50 }, (_, i) => raw(i + 1, 'зөвшилцөх', 100 + i)));
const big = computeLand({ clearance: null, parcels: many, overlaps: null, failed: [] });
const tp = big.tables[1];
assert.equal(tp.rows.length, ROW_CAP + 1);
assert.ok(String(tp.rows.at(-1)[0].v).includes('50'), 'сүүлийн мөр тасалсан тоог заана');
assert.equal(tp.rows.at(-1).length, 7, 'тасалсан мөр багана тоотой таарна');

{
  const rowsEd = [{ last_edited_date: Date.UTC(2026, 8, 1) }, { last_edited_date: Date.UTC(2026, 8, 20) }, { last_edited_date: null }];
  assert.equal(lastEditOf(rowsEd, 'last_edited_date'), Date.UTC(2026, 8, 20));
  assert.equal(lastEditOf(rowsEd, null), null, 'Editor Tracking унтраалттай — null');
  assert.equal(lastEditOf([{ last_edited_date: null }], 'last_edited_date'), null, 'хоосон огноо 0 БИШ');
  const withAsOf = computeLand({ clearance, parcels, overlaps, failed: [], asOf: Date.UTC(2026, 8, 20) });
  assert.equal(withAsOf.asOf, Date.UTC(2026, 8, 20));
}

console.log('land.check: OK');
