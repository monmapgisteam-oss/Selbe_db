/**
 * «Барилгын хяналт»-ын эх сурвалжийг шалгана — ЖИВЭЭР (live).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/monitor.check.mjs
 *
 * Хамгаалж буй алдаа: энэ хуудас гүйцэтгэлээ бөглөх хуудсуудаас авдаг. Гурван
 * зүйл ЧИМЭЭГҮЙ эвдэрч болно:
 *   1. Барилгын давхарга ↔ хуудасны БЛОКИЙН НЭР таарахгүй болвол (`buildingKey`)
 *      бүх бар «мэдээлэлгүй» болно — хуудас хоосон харагдана.
 *   2. Шатлал (`levelFromNo`) эвдэрвэл навч ажлын тоолол (Дууссан/Явцтай/
 *      Эхлээгүй) худал болно.
 *   3. Цагираг (сүүлийн утга) ба муруйн төгсгөл ЗӨРВӨЛ нэг хуудас хоёр өөр
 *      тоо харуулна.
 *
 * ⚠️ ЭХ СУРВАЛЖ (2026-08-27-нд СОЛИГДСОН): урьд нь `Selbe_guitsetgel_consolidated`
 * (499, хаагдсан) руу ӨӨРИЙН асуулга явуулж логикийг бүтнээр хуулбарладаг байв.
 * Одоо порталын ЖИНХЭНЭ шугамыг дуудна — тест ба портал ЯГ нэг тоо хардаг.
 */
import assert from 'node:assert/strict';
import { loadBlockProgress, loadBlockHistory, progressSeries } from '../lib/blockProgress.ts';
import { loadSheetRows } from './sheet/sheetRows.ts';

/* ⚠️ Org-only үйлчилгээ, токенгүй → алгасна (`tools/ts-alias.mjs`, 2026-09-17). */
if (process.env.SELBE_LIVE_SKIP) {
  console.log('⏭ амьд шалгуур алгасав — үйлчилгээ Organization-only, ARCGIS_ADMIN_TOKEN алга');
  process.exit(0);
}

/* ⚠️ 2026-08-24: monmap-ын `building_GOL_barigdaj_ehelsen` УСТСАН (алдаа 499).
   Блокийн бүртгэл нэгтгэсэн `data`/112 руу шилжив — ижил 113 блок, `BAGTS` ба
   `BLOK` талбар хэвээр тул нийлүүлэх түлхүүр (`buildingKey`) өөрчлөгдөөгүй. */
/* ⚠️ 2026-10-20: Enterprise — `TD` (AGOL түлхүүр) нь `query.ts`-ээр Enterprise руу зураглагдаж, талбарын нэр эх хэлбэрээрээ ирнэ. */
const { BAGTS_AJLUUD } = await import('@/lib/services.ts');
const { queryFeatures } = await import('@/lib/query.ts');
const BLDG = `${BAGTS_AJLUUD}/0`;

// services.ts-ийн хуулбар — тэндээ өөрчилвөл ЭНДЭЭ ч өөрчил.
const bagtsKey = (v) => String(v ?? '').toUpperCase().replace(/[^0-9А-ЯӨҮA-Z]/g, '');
const blockKey = (v) => String(v ?? '').trim().split(/\s+/)[0];
const buildingKey = (bagts, block) => `${bagtsKey(bagts)}|${blockKey(block)}`;

async function query(url, params) {
  return queryFeatures(url, { where: params.where ?? '1=1', outFields: String(params.outFields ?? '*').split(',').map((s) => s.trim()) });
}

/* 1 — Барилгын давхарга ↔ гүйцэтгэлийн түлхүүр */

const blocks = await query(BLDG, { where: '1=1', outFields: 'objectid,bagts,blok' });
assert.ok(blocks.length > 0, 'барилгын давхарга хоосон');

const prog = await loadBlockProgress();
assert.ok(prog.size > 0, 'бөглөх хуудсуудаас нэг ч блок уншигдсангүй — шугам тасарсан');

const matched = blocks.filter((b) => prog.has(buildingKey(b.bagts, b.blok)));
/* ⚠️ ХАТУУ ХУВЬ ТАВИХГҮЙ: бөглөх хуудсууд НИЙТЛЭГДСЭН үедээ л өгөгдөл өгдөг
   бөгөөд 2026-08-27-нд 7 багцаас 2 нь нийтлэгдсэн. «>50% таарна» гэж шаардвал
   тест байнга улаан байж, ЖИНХЭНЭ эвдрэлийг далдална. Гол шалгуур нь ЧИГЛЭЛ:
   гүйцэтгэлтэй блок бүр давхаргад БАЙХ ёстой (эсрэгээр нь биш). */
assert.ok(matched.length > 0,
  'нэг ч блокийн нэр таарсангүй — хуудасны бүх бар «мэдээлэлгүй» болно');

/* 2 — Шатлал бүтэн бөгөөд № -тэй зөрөхгүй */

const one = matched[0];
const mine = await loadSheetRows({ group: one.bagts, block: blockKey(one.blok) });
assert.ok(mine.length > 0, `«${one.blok}» блокийн мөр олдсонгүй`);

for (const r of mine) {
  assert.ok(r.level == null || (r.level >= 1 && r.level <= 5),
    `шатлал хүрээнээс гарсан: ${r.level} (№ «${r.no}»)`);
  // Навч (5) хэзээ ч бутархай №-тэй байхгүй — бутархай нь бүлгийн мөр (4).
  if (r.level === 5) assert.ok(!r.no.includes('.'), `навч мөр бутархай №-тэй: ${r.no}`);
}

/* 3 — Үе шат тархаах (А. / Б.) ба навчийн тоолол */

const rowKey = (r) => `${r.section}|${r.level ?? ''}|${r.work}`;

// Хэсгийн нэрийг мөрийн дараалллаас стампална (`BuildingPanel.stampSections`)
const batches = new Map();
for (const r of mine) {
  // ⚠️ Хуулбар (sheet+snap) түлхүүрт ЗААВАЛ орно — нэг өдөрт хоёр нийтлэлт бий
  const k = `${r.sheet}#${r.snap}|${r.block}`;
  (batches.get(k) ?? batches.set(k, []).get(k)).push(r);
}
/* ⚠️ ХЭСЭГ ба ҮЕ ШАТЫГ НЭГ дамжлагад стампална — хоёр дамжлага болговол
   `rowKey` нь өөр хэсэгтэй бүтэж, үе шатны зураглал мөрөндөө таарахгүй. */
const stamped = [];
const phase = new Map();
for (const arr of batches.values()) {
  arr.sort((a, b) => a.ord - b.ord);
  let sec = '';
  let cur = '';
  for (const r of arr) {
    if (r.level !== 5) sec = r.work;
    if (r.level === 1) cur = r.no;
    const s = { ...r, section: sec };
    stamped.push(s);
    phase.set(rowKey(s), cur);
  }
}

const win = new Map();
for (const r of [...stamped].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ord - b.ord))) {
  win.set(rowKey(r), r);
}

let done = 0, going = 0, idle = 0;
for (const [k, r] of win) {
  if (r.level !== 5 || phase.get(k) !== 'Б.') continue;
  const p = r.progress ?? 0;
  if (p >= 1) done += 1; else if (p > 0) going += 1; else idle += 1;
}
const leaves = done + going + idle;
assert.ok(leaves > 0, 'Б. үе шатын навч ажил олдсонгүй — үе шат тархаахад алдаа');
const allLeaves = [...win.values()].filter((r) => r.level === 5).length;

/* ⚠️ ҮЕ ШАТ ТАРХААХ нь ажиллаж байгааг ЭСРЭГ талаас нь барина.
   Урьд нь «Бэлтгэл (А.)-ийн навч тоололд ОРСОН эсэх»-ийг шалгадаг байв — тэр нь
   нэгтгэсэн хүснэгтэд А.-ийн мөрүүд бутархай жинтэй тул навч (түвшин 5) болдогт
   тулгуурлаж байсан. Бөглөх хуудсанд А.-ийн 8 мөр ЖИНГҮЙ (null) тул levelFromNo
   тэднийг ангилал (3) гэж үзнэ — навч ОГТ гарахгүй бөгөөд хуучин шалгуур мөнхөд
   унана. Оронд нь: (а) А. үе шат ерөөс СТАМПЛАГДСАН эсэх, (б) Б.-ээс ГАДУУРХ
   навч тоололд ОРООГҮЙ эсэхийг шалгана. */
const phases = new Set([...phase.values()]);
assert.ok([...phases].some((p) => p && p !== 'Б.'),
  'үе шат тархаагүй — стамплагдсан: ' + JSON.stringify([...phases]));
for (const [k, r] of win) {
  if (r.level !== 5) continue;
  if (phase.get(k) === 'Б.') continue;
  assert.fail('Б.-ээс ГАДУУР навч тоололд орох эрсдэлтэй: «' + r.work + '» (үе шат ' + phase.get(k) + ')');
}
assert.equal(leaves, allLeaves,
  'Б.-ийн навчийн тоо нийт навчтай таарсангүй — үе шатны зураглал алдагдав');

/* 4 — Цагираг ↔ муруйн төгсгөл ЯГ таарна */

const hist = await loadBlockHistory();
const keys = [...prog.keys()];
const daily = progressSeries(hist, keys, 'day');
const monthly = progressSeries(hist, keys, 'month');
const dailyL = progressSeries(hist, keys, 'day', 'latest');
const monthlyL = progressSeries(hist, keys, 'month', 'latest');
assert.ok(daily.length > 0, 'цуваа хоосон');
assert.ok(dailyL.length > 0, '«latest» цуваа хоосон');

const ringVals = keys.map((k) => prog.get(k).overall);
const ring = ringVals.reduce((a, b) => a + b, 0) / ringVals.length;
/* ⚠️ Муруй нь блок бүрийн ОРГИЛ (peak — буурдаггүй) утгаар, цагираг нь ОДООГИЙН
   утгаар бодогддог (2026-09-17): гүйцэтгэл засварлагдаж БУУРСАН блок байвал
   `peak` муруйн төгсгөл цагирагаас дээгүүр байх нь ХЭВИЙН.
   ⚠️ 2026-10-21: урьд нь `peak`-ийн зөрүүг «< 0.05 нэгж» гэж хязгаарладаг байв —
   бодит өгөгдөлд Багц 2-ын 22 блок 2026-10-04 → 10-11 хооронд хуудасны засвараар
   тус бүр ~0.79 нэгж буурч, зөрүү 0.17 болж шалгуур унасан (код зөв, өгөгдөл
   бодит). Засварын хэмжээ дур зоргийн тул дээд хязгаар нь ӨГӨГДЛИЙН таамаг —
   шалгуур биш. Оронд нь ЯГ тодорхой хоёр инвариант:
     · `'latest'` горимын төгсгөл == цагираг (1e-9) — `progressSeries`-ийн баримтжуулсан
       гэрээ (`latestMean`/`loadBlockProgress`-той ижил хуваарь, ижил утга);
     · `'peak'` горимын төгсгөл ≥ цагираг — оргил нь одоогийн утгаас ХЭЗЭЭ Ч доогуур биш. */
const latestGap = dailyL.at(-1).overall - ring;
assert.ok(Math.abs(latestGap) < 1e-9,
  `«latest» муруйн төгсгөл (${dailyL.at(-1).overall}) цагирагтай (${ring}) таарахгүй`);
const peakGap = daily.at(-1).overall - ring;
assert.ok(peakGap > -1e-9,
  `«peak» муруйн төгсгөл (${daily.at(-1).overall}) цагирагаас (${ring}) ДООГУУР`);
assert.equal(monthly.at(-1).overall, daily.at(-1).overall, 'сарын төгсгөл өдрийнхөөс зөрсөн (peak)');
assert.equal(monthlyL.at(-1).overall, dailyL.at(-1).overall, 'сарын төгсгөл өдрийнхөөс зөрсөн (latest)');

/* ⚠️ Сарын цуваа ДАРААЛСАН сар БИШ (2026-09-25 аудит): `progressSeries` тайлангүй
   (шинэ агшингүй) сарыг ЗОРИУДААР алгасдаг (`snap === prevSnap → continue`) —
   урьд нь энд «сар бүр дараалсан» гэж шаардаж, нэг сар нийтлэлгүй өнгөрөхөд
   зөв ажиллаж буй кодыг унагадаг байв. Шалгах зүйл: шошго ХАТУУ өсөх, цэг бүр
   ШИНЭ агшинтай, агшин нь тухайн сардаа. */
for (let i = 0; i < monthly.length; i++) {
  const pt = monthly[i];
  assert.ok(pt.date.startsWith(pt.label + '-'), `сарын цэгийн агшин (${pt.date}) ${pt.label} сард биш`);
  if (i === 0) continue;
  assert.ok(pt.label > monthly[i - 1].label, `сарын шошго өсөхгүй: ${monthly[i - 1].label} → ${pt.label}`);
  assert.ok(pt.date > monthly[i - 1].date, `сарын цэг шинэ агшингүй: ${monthly[i - 1].date} → ${pt.date}`);
}

console.log(
  `monitor.check: ok — ${matched.length}/${blocks.length} блок таарсан · `
  + `«${one.bagts} ${one.blok}» ${leaves}/${allLeaves} ажил (${done}/${going}/${idle}) · `
  + `цуваа ${daily.length} өдөр / ${monthly.length} сар, төгсгөл ${ring.toFixed(2)}%`,
);
