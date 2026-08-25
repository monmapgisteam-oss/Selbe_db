/**
 * Барилгын хяналтын ЗҮҮН САМБАРЫН шүүлтүүд амьд үйлчилгээн дээр АЖИЛЛАЖ байгаа
 * эсэхийг шалгана.  node src/lib/filters.check.mjs
 *
 * Хамгаалж буй алдаа: буруу SQL нь ArcGIS дээр чимээгүй унадаг — газрын зураг
 * зүгээр л хариу өгөхгүй, консольд ч юу ч гарахгүй. Тиймээс шүүлт бүрийн WHERE
 * -ийг ЖИНХЭНЭ давхарга дээр гүйлгэж, зөвшөөрөгдсөн эсэхийг баталгаажуулна.
 * (Жишээ нь `TRIM()`-ийг эдгээр FeatureServer таньдаггүй.)
 *
 * ⚠️ 2026-08-24: эх сурвалж `building_GOL_barigdaj_ehelsen` (monmap) УСТСАН
 * (алдаа 499) — блокийн давхарга нэгтгэсэн `data`/112 руу шилжсэн. Шинэ
 * давхаргад `GUITS_HV` ба 16 үе шатын талбар БАЙХГҮЙ: гүйцэтгэл, үе шат,
 * гүйцэтгэгчийн бүлгүүд одоо «Гүйцэтгэл бөглөх» хүснэгтээс КЛИЕНТ дээр
 * бодогдож, давхаргыг `OBJECTID IN (…)` жагсаалтаар шүүнэ
 * (`BuildingPanel.tsx`-ийн `oidWhere`). Тиймээс энд шалгах SQL хэлбэрүүд:
 *   · `BAGTS = '…'`        — багцын шүүлт (`Dashboard.tsx`)
 *   · `OBJECTID IN (…)`    — бүлгийн тодруулга
 *   · `(…) AND (…)`        — 3D-ийн нийлүүлсэн definitionExpression
 *     (`MapCanvas.tsx`: хэсэг бүр хаалтад, ` AND `-ээр залгагдана)
 */
import assert from 'node:assert/strict';

const URL_ = 'https://services-ap1.arcgis.com/ACqsMOmNLi5wIdIh/arcgis/rest/services'
  + '/data/FeatureServer/112/query';

const F = { bagts: 'BAGTS', contractor: 'BAR_COMP' };
const sqlStr = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** WHERE-ийг ЖИНХЭНЭ давхарга дээр гүйлгэнэ — зөвшөөрөгдөөгүй бол алдана. */
async function count(where) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ where, returnCountOnly: 'true', f: 'json' }),
  });
  const j = await res.json();
  assert.ok(!j.error, `SQL татгалзав «${where}»: ${j.error?.message || '(хоосон мессеж)'}`);
  return j.count;
}

const q = async (p) => {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ returnGeometry: 'false', f: 'json', ...p }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return (j.features || []).map((f) => f.attributes);
};

const total = await count('1=1');
const rows = await q({
  where: '1=1',
  outFields: `OBJECTID,${F.bagts},${F.contractor}`,
  resultRecordCount: '2000',
});
assert.ok(total > 0 && rows.length === total, `давхарга дутуу: ${rows.length}/${total}`);

// 1. Багц тус бүрээр (`Dashboard.tsx`-ийн `BF.bagts = '…'` хэлбэр)
for (const b of new Set(rows.map((r) => r[F.bagts]))) {
  const n = await count(`${F.bagts} = ${sqlStr(b)}`);
  assert.ok(n > 0, `«${b}» багц юу ч тодруулахгүй`);
}

// 2. OID жагсаалт (`oidWhere`) — гүйцэтгэл/үе шат/гүйцэтгэгчийн бүлэг бүгд
//    клиент дээр бодогдоод энэ хэлбэрээр шүүгддэг тул ЯГ тоогоо буцаах ёстой.
const someOids = rows.slice(0, 25).map((r) => r.OBJECTID);
const oidN = await count(`OBJECTID IN (${someOids.join(',')})`);
assert.equal(oidN, someOids.length, `OID жагсаалт ${oidN} ≠ ${someOids.length}`);
// Хоосон бүлгийн зам — `oidWhere([])` нь `1=0` буцаадаг.
assert.equal(await count('1=0'), 0, '«1=0» шүүлт 0 биш');

// 3. Гүйцэтгэгчийн ТҮҮХИЙ утга SQL-д зөөвөрлөгдөх үү (нэрэнд «"», «'» орсон ч)
const comps = new Set(rows.map((r) => String(r[F.contractor] ?? '').trim()).values());
for (const c of comps) {
  if (c === '') continue; // хоосон бүлэг OID-оор шүүгддэг
  const n = await count(`${F.contractor} = ${sqlStr(c)}`);
  assert.ok(n > 0, `«${c}» компани юу ч тодруулахгүй`);
}
// ⚠️ Регресс: `TRIM()`-ийг энэ үйлчилгээ ТАНИХГҮЙ (тиймээс хэрэглэж БОЛОХГҮЙ).
await assert.rejects(() => count(`TRIM(${F.contractor}) = ''`), /татгалзав/);

// 4. 3D-ийн НИЙЛҮҮЛСЭН хэлбэр: бүсийн шүүлт AND тодруулга нэг
//    definitionExpression-д (`MapCanvas.tsx` — хэсэг бүр хаалтад).
const bagts = rows[0][F.bagts];
const merged = `(${F.bagts} = ${sqlStr(bagts)}) AND (OBJECTID IN (${someOids.join(',')}))`;
const both = await count(merged);
const only = await count(`${F.bagts} = ${sqlStr(bagts)}`);
assert.ok(both > 0 && both <= only, `нийлүүлсэн шүүлт ${both}/${only}`);

/* ── 6. «Бүртгэгдээгүй / Тодорхойгүй» бүлгийн шүүлт (`groupWhere` → `blankWhere`) ──
 * ⚠️ Энэ бол бүх каталогийн facet-д хамаатай: `TRIM()`-ийг эдгээр FeatureServer
 * ТАТГАЛЗДАГ тул хоосон мөр дарахад зурагт юу ч болдоггүй байв. Шинэ нөхцөл нь
 * тоологдсон ЯГ ижил тоог буцаах ёстой. */
/* ⚠️ 2026-08-24: эх сурвалж `Selbe_ET_20260721` (monmap) → нэгтгэсэн `data`
   (MUST). Хуучин үйлчилгээ АЛГА болсон (алдаа 499 «Item does not exist») тул
   энэ шалгалт чимээгүй 0 давхарга үзэж унаж байв. Давхаргын харгалзаа:
   ET/24 → data/108 («Барилга байгууламж»), ET/28 → data/106. Хоосон утга
   агуулсныг амьд шалгаж сонгосон: [108] zoriulalt 158 мөр, [108] Bar_comp
   315 мөр, [106] zoriulalt 12 мөр. */
const ET = 'https://services-ap1.arcgis.com/ACqsMOmNLi5wIdIh/arcgis/rest/services/data/FeatureServer';
const FACETS = [[108, 'zoriulalt'], [108, 'Bar_comp'], [106, 'zoriulalt']];

const post = async (url, p) => {
  const res = await fetch(`${url}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', ...p }),
  });
  return res.json();
};

let checked = 0;
for (const [n, field] of FACETS) {
  const u = `${ET}/${n}`;
  const g = await post(u, {
    where: '1=1', outFields: field, groupByFieldsForStatistics: field,
    outStatistics: '[{"statisticType":"count","onStatisticField":"OBJECTID","outStatisticFieldName":"c"}]',
  });
  const blanks = (g.features || []).map((f) => f.attributes)
    .filter((r) => r[field] == null || String(r[field]).trim() === '');
  if (!blanks.length) continue;

  const counted = blanks.reduce((a, r) => a + r.c, 0);
  const raws = blanks.filter((r) => r[field] != null).map((r) => String(r[field]));
  const where = [`${field} IS NULL`, ...(raws.length ? [`${field} IN (${raws.map(sqlStr).join(', ')})`] : [])].join(' OR ');

  const got = await post(u, { where, returnCountOnly: 'true' });
  assert.ok(!got.error, `хоосон бүлгийн SQL татгалзав: ${where}`);
  assert.equal(got.count, counted, `${field}: шүүлт ${got.count} ≠ тоологдсон ${counted}`);

  // ⚠️ Регресс: хуучин `TRIM()` хэлбэр нь ЭНЭ үйлчилгээнд УНАНА — буцааж болохгүй.
  const old = await post(u, { where: `${field} IS NULL OR TRIM(${field}) = ''`, returnCountOnly: 'true' });
  assert.ok(old.error, `TRIM() гэнэт ажиллав — blankWhere-ийг эргэж харна уу (${field})`);
  checked += 1;
}
assert.ok(checked >= 3, `хоосон бүлгийн шалгалт хэт цөөн: ${checked}`);

console.log(`ok · ${new Set(rows.map((r) => r[F.bagts])).size} багц, `
  + `OID-жагсаалт ${someOids.length}, ${comps.size} компани, ${checked} хоосон-бүлэг, `
  + `3D-нийлүүлэлт — бүгд ${total} блок дээр хүчинтэй`);
