/**
 * Барилгын хяналтын ЗҮҮН САМБАРЫН шүүлтүүд амьд үйлчилгээн дээр АЖИЛЛАЖ байгаа
 * эсэхийг шалгана.  node src/lib/filters.check.mjs
 *
 * Хамгаалж буй алдаа: буруу SQL нь ArcGIS дээр чимээгүй унадаг — газрын зураг
 * зүгээр л хариу өгөхгүй, консольд ч юу ч гарахгүй. Тиймээс шүүлт бүрийн WHERE
 * -ийг ЖИНХЭНЭ давхарга дээр гүйлгэж, зөвшөөрөгдсөн эсэхийг баталгаажуулна.
 * (Жишээ нь `TRIM()`-ийг энэ FeatureServer таньдаггүй.)
 */
import assert from 'node:assert/strict';

const URL_ = 'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services'
  + '/building_GOL_barigdaj_ehelsen/FeatureServer/2/query';

const STAGE_NA = -1;
const F = { bagts: 'BAGTS', contractor: 'BAR_COMP', progress: 'GUITS_HV' };
const STAGES = ['A_BELTGEL', 'GAZAR', 'SUURI', 'KARKAS', 'HANA', 'DEEVER',
  'HAALGA', 'SHAL', 'DOTOR', 'GADNA', 'LIFT', 'HALAALT'];
const LEVELS = [[0, 25], [25, 50], [50, 75], [75, 101]];
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
const rows = await q({ where: '1=1', outFields: `${F.bagts},${F.contractor}`, resultRecordCount: '2000' });

// 1. Гүйцэтгэлийн ангилал
for (const [lo, hi] of LEVELS) await count(`${F.progress} >= ${lo} AND ${F.progress} < ${hi}`);

// 2. Багц тус бүрээр
for (const b of new Set(rows.map((r) => r[F.bagts]))) {
  const n = await count(`${F.bagts} = ${sqlStr(b)}`);
  assert.ok(n > 0, `«${b}» багц юу ч тодруулахгүй`);
}

// 3. Ажлын үе шат — өмнө нь ДАРЖ БОЛДОГГҮЙ байсан (onSelect алга)
for (const f of STAGES) {
  const n = await count(`${f} > ${STAGE_NA}`);
  assert.ok(n > 0 && n <= total, `«${f}» үе шат ${n}/${total}`);
}

// 4. Гүйцэтгэгч компани — мөн адил дарж болдоггүй байсан
const comps = new Set(rows.map((r) => String(r[F.contractor] ?? '').trim()));
for (const c of comps) {
  const where = c === ''
    ? `${F.contractor} IS NULL OR ${F.contractor} = '' OR ${F.contractor} = ' '`
    : `${F.contractor} = ${sqlStr(c)}`;
  const n = await count(where);
  assert.ok(n > 0, `«${c || 'Тодорхойгүй'}» компани юу ч тодруулахгүй`);
}
// ⚠️ Регресс: `TRIM()`-ийг энэ үйлчилгээ ТАНИХГҮЙ (тиймээс хэрэглэж БОЛОХГҮЙ).
await assert.rejects(() => count(`TRIM(${F.contractor}) = ''`), /татгалзав/);

// 5. 3D-ийн НИЙЛҮҮЛСЭН хэлбэр: бүсийн шүүлт AND тодруулга нэг definitionExpression-д.
//    (SceneView `featureEffect`-ийг үл тоомсорлодог тул 3D-д ингэж шүүнэ.)
const bagts = rows[0][F.bagts];
const merged = `(${F.bagts} = ${sqlStr(bagts)}) AND (SUURI > ${STAGE_NA})`;
const both = await count(merged);
const only = await count(`${F.bagts} = ${sqlStr(bagts)}`);
assert.ok(both > 0 && both <= only, `нийлүүлсэн шүүлт ${both}/${only}`);

console.log(`ok · ${LEVELS.length} ангилал, ${new Set(rows.map((r) => r[F.bagts])).size} багц, `
  + `${STAGES.length} үе шат, ${comps.size} компани, 3D-нийлүүлэлт — бүгд ${total} блок дээр хүчинтэй`);
