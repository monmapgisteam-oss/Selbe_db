/**
 * blockProgress-ийн ТҮЛХҮҮР ЖИШИХИЙГ шалгана (амьд үйлчилгээ рүү).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/blockProgress.check.mjs
 *
 * Хамгаалж буй алдаа: блокийн нэр багц бүрд давтагддаг («5/1» долоон багцад)
 * бөгөөд багцын нэр гурван эх сурвалжид гурван янз бичигдсэн. Түлхүүр буруу
 * бол барилга ӨӨР барилгын гүйцэтгэлийг зүүнэ.
 */
import assert from 'node:assert/strict';
import { loadBlockProgress } from './blockProgress.ts';

if (process.env.SELBE_LIVE_SKIP) {
  console.log('⏭ амьд шалгуур алгасав — үйлчилгээ Organization-only, ARCGIS_ADMIN_TOKEN алга');
  process.exit(0);
}

const { BAGTS_AJLUUD } = await import('@/lib/services.ts');
const { arcgisPost } = await import('@/lib/query.ts');
const BLDG = `${BAGTS_AJLUUD}/0`;

// services.ts-ийн хуулбар — тэндээ өөрчилвөл ЭНДЭЭ ч өөрчил.
const bagtsKey = (v) => String(v ?? '').toUpperCase().replace(/[^0-9А-ЯӨҮA-Z]/g, '');
const blockKey = (v) => String(v ?? '').trim().split(/\s+/)[0];
const buildingKey = (b, k) => `${bagtsKey(b)}|${blockKey(k)}`;

const q = async (url, params) => {
  const j = await arcgisPost(`${url}/query`, { returnGeometry: 'false', ...params });
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
const blds = await q(BLDG, { where: '1=1', outFields: 'bagts,blok', resultRecordCount: '2000' });
const layerKeys = new Set(blds.map((b) => buildingKey(b.bagts, b.blok)));
const KNOWN_ORPHAN = new Set(['БАГЦ2|5/8', 'БАГЦ1|29/3']);
const orphan = [...prog.keys()].filter((k) => !layerKeys.has(k) && !KNOWN_ORPHAN.has(k));
assert.equal(orphan.length, 0,
  `гүйцэтгэлтэй атлаа давхаргад БАЙХГҮЙ блок: ${orphan.join(', ')}`);
const healed = [...KNOWN_ORPHAN].filter((k) => layerKeys.has(k) || !prog.has(k));
if (healed.length) console.log(`⚠️ KNOWN_ORPHAN-ийн ${healed.join(', ')} арилжээ — жагсаалтаас хасаж болно`);
else console.log(`⚠️ мэдэгдэж буй зөрүү: ${[...KNOWN_ORPHAN].join(', ')} (өгөгдөл засагдтал зурагт наалдахгүй)`);

console.log(`давхарга ${blds.length} барилга · гүйцэтгэлтэй ${prog.size}`
  + ` (${((prog.size / blds.length) * 100).toFixed(0)}%)`);

/* 3б. ДАВХАРДСАН БАГЦ|БЛОК түлхүүр — давхардвал хоёр ӨӨР барилга нэг блокийн
   гүйцэтгэлийн %-ийг зурагт зүүдэг (аль нэг нь ХУДАЛ будагдана). */
const KNOWN_DUP = new Set(['БАГЦ1|29/1', 'БАГЦ2|5/6']);
const keyCount = new Map();
for (const b of blds) {
  const k = buildingKey(b.bagts, b.blok);
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
