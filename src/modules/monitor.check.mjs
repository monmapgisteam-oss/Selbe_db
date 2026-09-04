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

/* ⚠️ 2026-08-24: monmap-ын `building_GOL_barigdaj_ehelsen` УСТСАН (алдаа 499).
   Блокийн бүртгэл нэгтгэсэн `data`/112 руу шилжив — ижил 113 блок, `BAGTS` ба
   `BLOK` талбар хэвээр тул нийлүүлэх түлхүүр (`buildingKey`) өөрчлөгдөөгүй. */
const BLDG =
  'https://services-ap1.arcgis.com/ACqsMOmNLi5wIdIh/arcgis/rest/services/data/FeatureServer/112';

// services.ts-ийн хуулбар — тэндээ өөрчилвөл ЭНДЭЭ ч өөрчил.
const bagtsKey = (v) => String(v ?? '').toUpperCase().replace(/[^0-9А-ЯӨҮA-Z]/g, '');
const blockKey = (v) => String(v ?? '').trim().split(/\s+/)[0];
const buildingKey = (bagts, block) => `${bagtsKey(bagts)}|${blockKey(block)}`;

async function query(url, params) {
  const out = [];
  for (let off = 0; ; ) {
    const res = await fetch(`${url}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        returnGeometry: 'false', f: 'json',
        resultRecordCount: '2000', resultOffset: String(off), ...params,
      }),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message);
    const fs = (j.features ?? []).map((f) => f.attributes);
    out.push(...fs);
    if (!j.exceededTransferLimit || !fs.length) return out;
    off += fs.length;
  }
}

/* 1 — Барилгын давхарга ↔ гүйцэтгэлийн түлхүүр */

const blocks = await query(BLDG, { where: '1=1', outFields: 'OBJECTID,BAGTS,BLOK' });
assert.ok(blocks.length > 0, 'барилгын давхарга хоосон');

const prog = await loadBlockProgress();
assert.ok(prog.size > 0, 'бөглөх хуудсуудаас нэг ч блок уншигдсангүй — шугам тасарсан');

const matched = blocks.filter((b) => prog.has(buildingKey(b.BAGTS, b.BLOK)));
/* ⚠️ ХАТУУ ХУВЬ ТАВИХГҮЙ: бөглөх хуудсууд НИЙТЛЭГДСЭН үедээ л өгөгдөл өгдөг
   бөгөөд 2026-08-27-нд 7 багцаас 2 нь нийтлэгдсэн. «>50% таарна» гэж шаардвал
   тест байнга улаан байж, ЖИНХЭНЭ эвдрэлийг далдална. Гол шалгуур нь ЧИГЛЭЛ:
   гүйцэтгэлтэй блок бүр давхаргад БАЙХ ёстой (эсрэгээр нь биш). */
assert.ok(matched.length > 0,
  'нэг ч блокийн нэр таарсангүй — хуудасны бүх бар «мэдээлэлгүй» болно');

/* 2 — Шатлал бүтэн бөгөөд № -тэй зөрөхгүй */

const one = matched[0];
const mine = await loadSheetRows({ group: one.BAGTS, block: blockKey(one.BLOK) });
assert.ok(mine.length > 0, `«${one.BLOK}» блокийн мөр олдсонгүй`);

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
assert.ok(daily.length > 0, 'цуваа хоосон');

const ringVals = keys.map((k) => prog.get(k).overall);
const ring = ringVals.reduce((a, b) => a + b, 0) / ringVals.length;
assert.ok(Math.abs(daily.at(-1).overall - ring) < 1e-9,
  `муруйн төгсгөл (${daily.at(-1).overall}) цагирагаас (${ring}) зөрж байна`);
assert.equal(monthly.at(-1).overall, daily.at(-1).overall, 'сарын төгсгөл өдрийнхөөс зөрсөн');

// Сарын цуваад ЦООРХОЙ байхгүй
const nextMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};
for (let i = 1; i < monthly.length; i++) {
  assert.equal(monthly[i].label, nextMonth(monthly[i - 1].label), 'сарын цуваад цоорхой үүссэн');
}

console.log(
  `monitor.check: ok — ${matched.length}/${blocks.length} блок таарсан · `
  + `«${one.BAGTS} ${one.BLOK}» ${leaves}/${allLeaves} ажил (${done}/${going}/${idle}) · `
  + `цуваа ${daily.length} өдөр / ${monthly.length} сар, төгсгөл ${ring.toFixed(2)}%`,
);
