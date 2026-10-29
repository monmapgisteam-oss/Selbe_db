/**
 * Барилгын хяналтын ЗҮҮН САМБАРЫН шүүлтүүд амьд үйлчилгээн дээр АЖИЛЛАЖ байгаа
 * эсэхийг шалгана.  node src/lib/filters.check.mjs
 *
 * Хамгаалж буй алдаа: буруу SQL нь ArcGIS дээр чимээгүй унадаг — газрын зураг
 * зүгээр л хариу өгөхгүй, консольд ч юу ч гарахгүй. Тиймээс шүүлт бүрийн WHERE
 * -ийг ЖИНХЭНЭ давхарга дээр гүйлгэж, зөвшөөрөгдсөн эсэхийг баталгаажуулна.
 * (Жишээ нь `TRIM`-ийг эдгээр FeatureServer таньдаггүй.)
 */
import assert from 'node:assert/strict';

if (process.env.SELBE_LIVE_SKIP) {
  console.log('⏭ амьд шалгуур алгасав — үйлчилгээ Organization-only, ARCGIS_ADMIN_TOKEN алга');
  process.exit(0);
}

const { BAGTS_AJLUUD, SELBE_ET } = await import('@/lib/services.ts');
const { arcgisPost } = await import('@/lib/query.ts');
const URL_ = `${BAGTS_AJLUUD}/0/query`;

const F = { bagts: 'bagts', contractor: 'bar_comp' };
const sqlStr = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** WHERE-ийг ЖИНХЭНЭ давхарга дээр гүйлгэнэ — зөвшөөрөгдөөгүй бол алдана. */
async function count(where) {
  const j = await arcgisPost(URL_, { where, returnCountOnly: 'true' }).catch((e) => ({ error: { message: e.message } }));
  assert.ok(!j.error, `SQL татгалзав «${where}»: ${j.error?.message || '(хоосон мессеж)'}`);
  return j.count;
}

const q = async (p) => {
  const j = await arcgisPost(URL_, { returnGeometry: 'false', ...p });
  return (j.features || []).map((f) => f.attributes);
};

const total = await count('1=1');
const rows = await q({
  where: '1=1',
  outFields: `objectid,${F.bagts},${F.contractor}`,
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
const someOids = rows.slice(0, 25).map((r) => r.objectid);
const oidN = await count(`objectid IN (${someOids.join(',')})`);
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
await assert.rejects(() => count(`TRIM(${F.contractor}) = ''`), /татгалзав/);

// 4. 3D-ийн НИЙЛҮҮЛСЭН хэлбэр: бүсийн шүүлт AND тодруулга нэг
//    definitionExpression-д (`MapCanvas.tsx` — хэсэг бүр хаалтад).
const bagts = rows[0][F.bagts];
const merged = `(${F.bagts} = ${sqlStr(bagts)}) AND (objectid IN (${someOids.join(',')}))`;
const both = await count(merged);
const only = await count(`${F.bagts} = ${sqlStr(bagts)}`);
assert.ok(both > 0 && both <= only, `нийлүүлсэн шүүлт ${both}/${only}`);

/* ── 6. «Бүртгэгдээгүй / Тодорхойгүй» бүлгийн шүүлт (`groupWhere` → `blankWhere`) ──
 */
const FACETS = [[`${SELBE_ET}/99`, 'zoriulalt'], [`${SELBE_ET}/99`, 'bar_comp'], [`${SELBE_ET}/100`, 'zoriulalt']];

const post = async (url, p) => arcgisPost(`${url}/query`, p).catch((e) => ({ error: { message: e.message } }));

let checked = 0;
for (const [u, field] of FACETS) {
  const g = await post(u, {
    where: '1=1', outFields: field, groupByFieldsForStatistics: field,
    outStatistics: '[{"statisticType":"count","onStatisticField":"objectid","outStatisticFieldName":"c"}]',
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

  const old = await post(u, { where: `${field} IS NULL OR TRIM(${field}) = ''`, returnCountOnly: 'true' });
  assert.ok(old.error, `TRIM() гэнэт ажиллав — blankWhere-ийг эргэж харна уу (${field})`);
  checked += 1;
}
assert.ok(checked >= 3, `хоосон бүлгийн шалгалт хэт цөөн: ${checked}`);

console.log(`ok · ${new Set(rows.map((r) => r[F.bagts])).size} багц, `
  + `OID-жагсаалт ${someOids.length}, ${comps.size} компани, ${checked} хоосон-бүлэг, `
  + `3D-нийлүүлэлт — бүгд ${total} блок дээр хүчинтэй`);
