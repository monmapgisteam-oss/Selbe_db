/**
 * «Барилгын хяналт» хуудсын эх сурвалжийг шалгана — ЖИВЭЭР (live).
 *   node src/modules/monitor.check.mjs
 *
 * Хамгаалж буй алдаа: энэ хуудас бүх гүйцэтгэлээ `Selbe_guitsetgel_consolidated`
 * хүснэгтээс авдаг болсон. Хоёр зүйл чимээгүй эвдэрч болно:
 *   1. Барилгын давхарга ↔ хүснэгтийн БЛОКИЙН НЭР таарахгүй болвол
 *      (`buildingKey`) бүх бар «мэдээлэлгүй» болно — хуудас хоосон харагдана.
 *   2. `tuvshin` (шатлал) эвдэрвэл навч ажлын тоолол (Дууссан/Явцтай/Эхлээгүй)
 *      худал болно.
 */
import assert from 'node:assert/strict';

const SHEET =
  'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/Selbe_guitsetgel_consolidated/FeatureServer/0';
const BLDG =
  'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/building_GOL_barigdaj_ehelsen/FeatureServer/2';

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

/* 1 — Барилгын давхарга ↔ хүснэгтийн блок таарч байна уу */

const blocks = await query(BLDG, { where: '1=1', outFields: 'FID,BAGTS,BLOK' });
const sheetTotals = await query(SHEET, {
  where: "dugaar='Б.' AND barilga_blok IS NOT NULL",
  outFields: 'bagts,barilga_blok,ognoo,guitsetgel',
});
const sheetKeys = new Set(sheetTotals.map((r) => buildingKey(r.bagts, r.barilga_blok)));
const matched = blocks.filter((b) => sheetKeys.has(buildingKey(b.BAGTS, b.BLOK)));

assert.ok(blocks.length > 0, 'барилгын давхарга хоосон');
assert.ok(
  matched.length / blocks.length > 0.5,
  `блокийн нэр таарахгүй байна: ${matched.length}/${blocks.length} — ` +
    'хуудасны бүх бар «мэдээлэлгүй» болно',
);

/* 2 — Шатлал (`tuvshin`) бүтэн бөгөөд № -тэй зөрөхгүй */

const one = matched[0];
const rows = await query(SHEET, {
  where: `torol='actual' AND barilga_blok LIKE '${blockKey(one.BLOK)} %'`,
  outFields: 'OBJECTID,bagts,ognoo,huvilbar,tuvshin,dugaar,ajil,angilal_b,guitsetgel',
  orderByFields: 'ognoo ASC, OBJECTID ASC',
});
const mine = rows.filter((r) => bagtsKey(r.bagts) === bagtsKey(one.BAGTS));
assert.ok(mine.length > 0, `«${one.BLOK}» блокийн мөр олдсонгүй`);

for (const r of mine) {
  const lvl = Number(r.tuvshin);
  assert.ok(lvl >= 1 && lvl <= 5, `шатлал хүрээнээс гарсан: ${r.tuvshin}`);
  // Навч (5) хэзээ ч бутархай №-тэй байхгүй — бутархай нь бүлгийн мөр (4).
  if (lvl === 5) assert.ok(!String(r.dugaar).includes('.'), `навч мөр бутархай №-тэй: ${r.dugaar}`);
}

/* 3 — Үе шат тархаах (А. / Б.) ба навчийн тоолол */

const rowKey = (a) => `${a.angilal_b ?? ''}|${a.tuvshin}|${a.ajil}`;
const phase = new Map();
const batches = new Map();
for (const r of mine) {
  const k = `${r.ognoo}|${r.huvilbar}`;
  (batches.get(k) ?? batches.set(k, []).get(k)).push(r);
}
for (const arr of batches.values()) {
  let cur = '';
  for (const r of arr) {
    if (Number(r.tuvshin) === 1) cur = String(r.dugaar);
    phase.set(rowKey(r), cur);
  }
}
const win = new Map();
for (const r of mine) win.set(rowKey(r), r);

let done = 0, going = 0, idle = 0;
for (const [k, r] of win) {
  if (Number(r.tuvshin) !== 5 || phase.get(k) !== 'Б.') continue;
  const p = Number(r.guitsetgel) || 0;
  if (p >= 1) done += 1; else if (p > 0) going += 1; else idle += 1;
}
const leaves = done + going + idle;
assert.ok(leaves > 0, 'Б. үе шатын навч ажил олдсонгүй — үе шат тархаахад алдаа');
assert.ok(
  leaves < [...win.values()].filter((r) => Number(r.tuvshin) === 5).length,
  'Бэлтгэл (А.) ажлын навч тоололд орсон байна',
);

/* 4 — Цаг хугацааны цуваа (blockProgress.ts: history + progressSeries) */

const hist = new Map();
for (const r of sheetTotals.slice().sort((a, b) => (a.ognoo < b.ognoo ? -1 : 1))) {
  const k = buildingKey(r.bagts, r.barilga_blok);
  const arr = hist.get(k) ?? [];
  const pct = r.guitsetgel == null ? null : r.guitsetgel * 100;
  const prev = arr.find((p) => p.date === r.ognoo);
  if (prev) prev.pct = pct; else arr.push({ date: r.ognoo, pct });
  hist.set(k, arr);
}

const keys = matched.map((b) => buildingKey(b.BAGTS, b.BLOK));
const mineHist = keys.map((k) => hist.get(k)).filter(Boolean);
const allDates = [...new Set(mineHist.flatMap((h) => h.map((p) => p.date)))].sort();
const at = (asOf) => {
  let sum = 0, n = 0;
  for (const h of mineHist) {
    let v = null;
    for (const p of h) { if (p.date > asOf) break; v = p.pct; }
    if (v != null) { sum += v; n += 1; }
  }
  return { overall: n ? sum / n : 0, blocks: n };
};

const daily = allDates.map((d) => ({ label: d, ...at(d) }));
assert.ok(daily.length >= 2, 'цуваа зурахад хангалттай огноо алга');

// Сүүлийн цэг нь хуудасны нийт дундажтай ЯГ таарах ёстой — эс бөгөөс цагираг
// нэг тоо, муруйн төгсгөл өөр тоо харуулна.
const ringVals = matched
  .map((b) => hist.get(buildingKey(b.BAGTS, b.BLOK))?.at(-1)?.pct)
  .filter((v) => v != null);
const ring = ringVals.reduce((a, b) => a + b, 0) / ringVals.length;
assert.ok(
  Math.abs(daily.at(-1).overall - ring) < 1e-9,
  `муруйн төгсгөл (${daily.at(-1).overall}) нийт дундажаас (${ring}) зөрж байна`,
);

// Сарын цуваа: эхнээс сүүлийн сар хүртэл ЦООРХОЙГҮЙ, төгсгөл нь өдрийнхтэй тэнцүү.
const nextMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};
const monthly = [];
for (let m = allDates[0].slice(0, 7); m <= allDates.at(-1).slice(0, 7); m = nextMonth(m)) {
  const snap = [...allDates].reverse().find((d) => d <= `${m}-99`);
  if (snap) monthly.push({ label: m, ...at(snap) });
}
for (let i = 1; i < monthly.length; i++) {
  assert.equal(monthly[i].label, nextMonth(monthly[i - 1].label), 'сарын цуваад цоорхой үүссэн');
}
assert.equal(monthly.at(-1).overall, daily.at(-1).overall, 'сарын төгсгөл өдрийнхөөс зөрсөн');
assert.ok(monthly.length >= daily.length - 2, 'сарын цуваа хэт цөөн цэгтэй');

console.log(
  `monitor.check: ok — ${matched.length}/${blocks.length} блок таарсан · ` +
    `«${one.BLOK}» ${leaves} ажил (${done}/${going}/${idle}) · ` +
    `цуваа ${daily.length} өдөр / ${monthly.length} сар, төгсгөл ${ring.toFixed(2)}%`,
);
