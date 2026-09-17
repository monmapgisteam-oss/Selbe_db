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

/* ⚠️ Org-only үйлчилгээ, токенгүй → алгасна (`tools/ts-alias.mjs`, 2026-09-17). */
if (process.env.SELBE_LIVE_SKIP) {
  console.log('⏭ амьд шалгуур алгасав — үйлчилгээ Organization-only, ARCGIS_ADMIN_TOKEN алга');
  process.exit(0);
}

/* ⚠️ 2026-09-17: линк код дотор байхгүй — `.env`-ийн NEXT_PUBLIC_ARCGIS_HJ (loader ачаална). */
const HJ = (process.env.NEXT_PUBLIC_ARCGIS_HJ ?? '').replace(/\/+$/, '');
if (!HJ) throw new Error('NEXT_PUBLIC_ARCGIS_HJ алга — `--import ./tools/ts-alias.mjs`-ээр ажиллуул (.env)');
/* ⚠️ 2026-08-24: monmap-ын `building_GOL_barigdaj_ehelsen` УСТСАН (алдаа 499).
   Блокийн бүртгэл нэгтгэсэн `data`/112-т — ижил 113 блок, `BAGTS`/`BLOK`
   талбар хэвээр тул нийлүүлэх түлхүүр өөрчлөгдөөгүй. */
const BLDG = `${HJ}/SELBE_ALL_DATA_last_0917/FeatureServer/112`;

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
/* ⚠️ 2026-09-17: «БАГЦ1|29/3» — хуудсанд (Багц 1 · 12F) гүйцэтгэлтэй атлаа давхаргад
   (/112, OBJECTID 99) `BAGTS = «Багц 2»` гэж бүртгэгдсэн — бусад 29/x бүгд Багц 1.
   AGOL дээр BAGTS-ийг «Багц 1» болгоход энэ мөр өөрөө илүүдэж сануулна. */
const KNOWN_ORPHAN = new Set(['БАГЦ2|5/8', 'БАГЦ1|29/3']);
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

/* 4. (2026-09-17) `Tusliin_guitsetgel_master` ҮЙЛЧИЛГЭЭ УСТГАГДСАН — код түүнийг хэзээ ч
   уншдаггүй байсан (зөвхөн энэ шалгуур) тул алхмыг хасав. */

/* 5. (2026-09-17) master-ийн багцын тулгалт мөн хасагдав — ижил шалтгаан. */

console.log(`ok · ${prog.size} барилгын Б. гүйцэтгэл`);
