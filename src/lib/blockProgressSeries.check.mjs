/**
 * `progressSeries(…, 'latest')` ба `latestMean` — НЭГЖ шалгуур (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/blockProgressSeries.check.mjs
 *
 * ⚠️ 2026-09-30: Дашбоардын «Дундаж гүйцэтгэл» бөгж ба «Барилга угсралтын явц»
 *    цувааны сүүлийн цэг ЯГ таарах ёстой (өмнө нь бөгж: тайлагнасан багцын бүх
 *    блок + сүүлийн утга; цуваа: БҮХ блок + өссөн дүн — хоёр өөр тоо). Хоёулаа:
 *    хэмжигдсэн блок л хуваарьт (null ≠ 0), утга нь сүүлийн хэмжилт.
 *    `blockProgress.check.mjs` нь амьд (LIVE) тул энэ шалгуур тусдаа.
 */
import assert from 'node:assert/strict';
import { progressSeries, latestMean } from './blockProgress.ts';

/** `compute`-ийн дүрэм: блок бүрийн СҮҮЛИЙН бичлэг; `null` (цэвэрлэгдсэн) бол Map-д ОРОХГҮЙ */
const pmOf = (hist) => {
  const m = new Map();
  for (const [k, pts] of hist) {
    const last = pts[pts.length - 1];
    if (last && last.pct != null) m.set(k, { overall: last.pct, date: last.date, phases: [] });
  }
  return m;
};

const hist = new Map([
  ['A|1', [{ date: '2026-06-10', pct: 20 }, { date: '2026-07-10', pct: 50 }, { date: '2026-08-10', pct: 40 }]], // буурсан — сүүлийнх (40)
  ['A|2', [{ date: '2026-07-15', pct: 10 }]],
  ['A|3', [{ date: '2026-06-20', pct: 30 }, { date: '2026-08-05', pct: null }]], // цэвэрлэгдсэн → хуваарьт орохгүй
  ['B|1', [{ date: '2026-08-01', pct: 70 }]],
]);
/* ⚠️ Давхардсан түлхүүр (A|1 хоёр удаа) ба ТАЙЛАНГҮЙ блок (C|9) — `BagtsRow.keys`-ийн flatMap шиг */
const keys = ['A|1', 'A|1', 'A|2', 'A|3', 'B|1', 'C|9'];

/* 1. Бөгж: хэмжигдсэн блокоор л — (40+40+10+70)/4 = 40; C|9 ба A|3 хуваарьт ОРОХГҮЙ */
{
  const r = latestMean(pmOf(hist), keys);
  assert.equal(r.pct, 40);
  assert.equal(r.blocks, 4, 'давхардсан A|1 хоёр удаа тоологдоно (цуваатай ижил жагсаалт)');
  assert.equal(r.total, 6);
  assert.equal(latestMean(new Map(), keys).pct, null, '⚠️ хэмжилтгүй бол null — 0 БИШ');
}

/* 2. ⚠️ ГОЛ ИНВАРИАНТ: цувааны СҮҮЛИЙН цэг == бөгж (сар ба өдрөөр) */
for (const grain of ['month', 'day']) {
  const s = progressSeries(hist, keys, grain, 'latest');
  const last = s[s.length - 1];
  const ring = latestMean(pmOf(hist), keys);
  assert.equal(last.overall, ring.pct, `${grain}: сүүлийн цэг == бөгж`);
  assert.equal(last.blocks, ring.blocks, `${grain}: хуваарь == бөгжийн блок`);
}

/* 3. 'latest' — агшин бүрд тухайн үеийн сүүлийн утга, хэмжигдсэн блокоор хуваана */
{
  const s = progressSeries(hist, keys, 'month', 'latest');
  assert.deepEqual(s.map((p) => p.label), ['2026-06', '2026-07', '2026-08']);
  /* 06: A|1=20 (×2), A|3=30 → (20+20+30)/3 */
  assert.equal(s[0].overall, 70 / 3);
  assert.equal(s[0].blocks, 3);
  /* 07: A|1=50 (×2), A|2=10, A|3=30 → 140/4 */
  assert.equal(s[1].overall, 35);
}

/* 4. Анхдагч 'peak' ХӨНДӨГДӨӨГҮЙ — хуваарь БҮХ түлхүүр, өссөн дүн */
{
  const s = progressSeries(hist, keys, 'month');
  const last = s[s.length - 1];
  /* A|1 peak 50 (×2) + A|2 10 + A|3 peak 30 + B|1 70 = 210 / 6 */
  assert.equal(last.overall, 35);
  assert.equal(last.blocks, 5);
}

console.log('blockProgressSeries.check: OK');
