/**
 * blockProgress-ийн ТҮЛХҮҮР ЖИШИХИЙГ шалгана (амьд үйлчилгээ рүү).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/blockProgress.check.mjs
 *
 * Хамгаалж буй алдаа: блокийн нэр багц бүрд давтагддаг («5/1» долоон багцад)
 * бөгөөд багцын нэр гурван эх сурвалжид гурван янз бичигдсэн. Түлхүүр буруу
 * бол барилга ӨӨР барилгын гүйцэтгэлийг зүүнэ.
 *
 * ⚠️ ЭХ СУРВАЛЖ (2026-08-27-нд СОЛИГДСОН): гүйцэтгэлийг урьд нь
 * `Selbe_guitsetgel_consolidated`-ээс ӨӨРИЙН асуулгаар авдаг байв — тэр
 * үйлчилгээ хаагдсан (499). Одоо порталын ЖИНХЭНЭ шугамыг (`blockProgress.ts`)
 * дуудна: тест ба портал хоёр ЯГ нэг тоо хардаг тул «тест ногоон атлаа портал
 * өөр» гэсэн зөрүү үүсэхгүй.
 */
import assert from 'node:assert/strict';
import { loadBlockProgress } from './blockProgress.ts';

const HJ = 'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services';
/* ⚠️ 2026-08-24: monmap-ын `building_GOL_barigdaj_ehelsen` УСТСАН (алдаа 499).
   Блокийн бүртгэл нэгтгэсэн `data`/112-т — ижил 113 блок, `BAGTS`/`BLOK`
   талбар хэвээр тул нийлүүлэх түлхүүр өөрчлөгдөөгүй. */
const BLDG = 'https://services-ap1.arcgis.com/ACqsMOmNLi5wIdIh/arcgis/rest/services'
  + '/data/FeatureServer/112';
const MASTER = `${HJ}/Tusliin_guitsetgel_master/FeatureServer/0`;

// services.ts-ийн хуулбар — тэндээ өөрчилвөл ЭНДЭЭ ч өөрчил.
const bagtsKey = (v) => String(v ?? '').toUpperCase().replace(/[^0-9А-ЯӨҮA-Z]/g, '');
const blockKey = (v) => String(v ?? '').trim().split(/\s+/)[0];
const buildingKey = (b, k) => `${bagtsKey(b)}|${blockKey(k)}`;

const q = async (url, params) => {
  const res = await fetch(`${url}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ returnGeometry: 'false', f: 'json', ...params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return (j.features || []).map((f) => f.attributes);
};

// 1. Гурван эх сурвалжийн багцын нэр НЭГ түлхүүр рүү буулна.
assert.equal(bagtsKey('Багц 4.1'), bagtsKey('Багц 4-1'), 'давхарга ↔ хүснэгт');
assert.equal(bagtsKey('Багц 4.1'), bagtsKey('БАГЦ-4-1'), 'давхарга ↔ master');
assert.equal(bagtsKey('Багц 1'), 'БАГЦ1');
assert.equal(blockKey('5/1 барилга'), '5/1');
assert.equal(blockKey('5/1 блок'), '5/1');
// ...харин ӨӨР багц ХЭЗЭЭ Ч нийлэхгүй.
assert.notEqual(buildingKey('Багц 1', '5/1 барилга'), buildingKey('Багц 2', '5/1 барилга'));

// 2. Порталын шугамаас блокийн гүйцэтгэл.
const prog = await loadBlockProgress();
assert.ok(prog.size > 0, 'бөглөх хуудсуудаас нэг ч блок уншигдсангүй — шугам тасарсан');

for (const [key, cell] of prog) {
  assert.match(key, /^[0-9А-ЯӨҮA-Z]+\|\S+$/, `түлхүүрийн хэлбэр буруу: ${key}`);
  assert.ok(Number.isFinite(cell.overall) && cell.overall >= 0 && cell.overall <= 100,
    `${key}: overall буруу (${cell.overall})`);
  assert.match(String(cell.date), /^\d{4}-\d{2}-\d{2}$/, `${key}: огноо буруу (${cell.date})`);
  // Задаргаа нь ЯГ Б1…Б5 — «Суурь ухлагын ажил» гэх мэт гүн дэд ажил ОРОХГҮЙ.
  assert.ok(cell.phases.length <= 5, `${key}: дэд үе шат ${cell.phases.length} > 5`);
  for (const p of cell.phases) {
    assert.match(p.no, /^Б[1-5]$/, `${key}: дэд үе шатны № буруу (${p.no})`);
    assert.ok(p.pct == null || (p.pct >= 0 && p.pct <= 100), `${key}/${p.no}: ${p.pct}`);
  }
}

// 3. ТҮЛХҮҮР-ТААРУУЛАЛТ — гол чиглэл нь ГҮЙЦЭТГЭЛ → ДАВХАРГА.
//    Гүйцэтгэл гарсан блок давхаргад БАЙХГҮЙ бол зурагт будагдах юмгүй болно.
const blds = await q(BLDG, { where: '1=1', outFields: 'BAGTS,BLOK', resultRecordCount: '2000' });
const layerKeys = new Set(blds.map((b) => buildingKey(b.BAGTS, b.BLOK)));
/*
 * ⚠️ МЭДЭГДЭЖ БУЙ зөрүүний жагсаалт (2026-08-29). «БАГЦ2|5/8»-д гүйцэтгэл
 * нийтлэгдсэн ч /112-т 5/8 footprint алга (5/6 хоёр удаа — нэг нь магадгүй
 * 5/8-ийн бичилтийн алдаа). Өгөгдлийг ЗАСАХГҮЙ гэж хэрэглэгч шийдсэн тул
 * энэ НЭГ түлхүүрийг л тэсвэрлэнэ: shalguur нь ШИНЭ зөрүү гарвал урьдын адил
 * улаан болно. Давхаргад 5/8 нэмэгдвэл (эсвэл нэр засагдвал) доорх мөр
 * ӨӨРӨӨ илүүдэж, «цэвэрлэ» гэж сануулна.
 */
const KNOWN_ORPHAN = new Set(['БАГЦ2|5/8']);
const orphan = [...prog.keys()].filter((k) => !layerKeys.has(k) && !KNOWN_ORPHAN.has(k));
assert.equal(orphan.length, 0,
  `гүйцэтгэлтэй атлаа давхаргад БАЙХГҮЙ блок: ${orphan.join(', ')}`);
const healed = [...KNOWN_ORPHAN].filter((k) => layerKeys.has(k) || !prog.has(k));
if (healed.length) console.log(`⚠️ KNOWN_ORPHAN-ийн ${healed.join(', ')} арилжээ — жагсаалтаас хасаж болно`);
else console.log(`⚠️ мэдэгдэж буй зөрүү: ${[...KNOWN_ORPHAN].join(', ')} (өгөгдөл засагдтал зурагт наалдахгүй)`);

/* ⚠️ УРВУУ ЧИГЛЭЛД (давхарга → гүйцэтгэл) ХАТУУ ХЯЗГААР ТАВИХГҮЙ. Бөглөх
   хуудсуудад гүйцэтгэл дөнгөж орж эхэлж байгаа (2026-08-27-нд 113 блокоос 26)
   тул «≥85% таарна» гэх мэт шалгуур өгөгдөл бөглөгдөх хүртэл байнга улаан байж,
   ЖИНХЭНЭ эвдрэлийг далдална. Бүрхэлтийг ЗӨВХӨН мэдээлнэ. */
console.log(`давхарга ${blds.length} барилга · гүйцэтгэлтэй ${prog.size}`
  + ` (${((prog.size / blds.length) * 100).toFixed(0)}%)`);

/* 3б. ДАВХАРДСАН БАГЦ|БЛОК түлхүүр — давхардвал хоёр ӨӨР барилга нэг блокийн
   гүйцэтгэлийн %-ийг зурагт зүүдэг (аль нэг нь ХУДАЛ будагдана).
   ⚠️ 2026-08-24-ний амьд байдал: data/112-т ХОЁР мэдэгдэж буй давхардал бий —
   БАГЦ1|29/1 (OBJECTID 66, 113) ба БАГЦ2|5/6 (OBJECTID 79, 84). Геометрээр
   ~78–110 м зайтай ӨӨР барилгууд тул нэг нь үнэндээ 29/3, 5/8 байх ёстой
   (хүснэгтэд тэр хоёр блокийн тусдаа мөр бий ч давхаргад полигонгүй).
   ЭХ ӨГӨГДЛИЙГ MUST-ын data/112 дээр засах хүртэл эдгээрийг мэдэгдэж буй
   гэж үзээд, ШИНЭ давхардал гарвал унагана. */
const KNOWN_DUP = new Set(['БАГЦ1|29/1', 'БАГЦ2|5/6']);
const keyCount = new Map();
for (const b of blds) {
  const k = buildingKey(b.BAGTS, b.BLOK);
  keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
}
const dups = [...keyCount].filter(([, n]) => n > 1).map(([k]) => k);
const newDups = dups.filter((k) => !KNOWN_DUP.has(k));
if (dups.length)
  console.log(`⚠️ давхардсан түлхүүр ${dups.length}: ${dups.join(', ')} (мэдэгдэж буй ${dups.length - newDups.length})`);
assert.equal(newDups.length, 0,
  `ШИНЭ давхардсан БАГЦ|БЛОК түлхүүр: ${newDups.join(', ')} — эх давхаргын BLOK-ийг шалгана уу`);

// 4. `Tusliin_guitsetgel_master`-т Б-ийн мөр БАЙХГҮЙ — задаргааг тэндээс авч болохгүй
const noB = await q(MASTER, {
  where: "Ажил LIKE 'Б%' AND Түвшин <= 2", outFields: 'Ажил', resultRecordCount: '5',
});
assert.equal(noB.length, 0, `master-т Б-ийн мөр гарч ирэв: ${JSON.stringify(noB)}`);

// 5. master-ийн Багц ч мөн адил түлхүүрт буулна (самбарын задаргаа тэндээс).
const mb = await q(MASTER, {
  where: '1=1', outFields: 'Багц',
  groupByFieldsForStatistics: 'Багц',
  outStatistics: '[{"statisticType":"count","onStatisticField":"ObjectID","outStatisticFieldName":"n"}]',
});
const known = new Set(blds.map((b) => bagtsKey(b.BAGTS)));
for (const r of mb) assert.ok(known.has(bagtsKey(r['Багц'])), `master багц танигдсангүй: ${r['Багц']}`);

console.log(`ok · ${prog.size} барилгын Б. гүйцэтгэл, ${mb.length} master багц таарав`);
