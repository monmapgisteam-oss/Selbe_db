/**
 * `progressSeries(…, 'latest')` ба `latestMean` — НЭГЖ шалгуур (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/blockProgressSeries.check.mjs
 *
 * ⚠️ 2026-09-30: Дашбоардын «Дундаж гүйцэтгэл» бөгж ба «Барилга угсралтын явц»
 *    цувааны сүүлийн цэг ЯГ таарах ёстой (өмнө нь бөгж: тайлагнасан багцын бүх
 *    блок + сүүлийн утга; цуваа: БҮХ блок + өссөн дүн — хоёр өөр тоо). Хоёулаа:
 *    хэмжигдсэн блок л хуваарьт (null ≠ 0), утга нь сүүлийн хэмжилт.
 * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): хуваарь = хамрах хүрээний БҮХ блок,
 *    тайлагнаагүй блок 0% — дээрх «null ≠ 0» хуваарийн дүрэм ХҮЧИНГҮЙ. Доорх
 *    хүлээгдэж буй утгууд шинэ дүрмээр (урьдын 40 → 24, 25 → 10, 30 → 18).
 *    `blockProgress.check.mjs` нь амьд (LIVE) тул энэ шалгуур тусдаа.
 */
import assert from 'node:assert/strict';
import { progressSeries, latestMean, pkgProgressOf, universeKeys } from './blockProgress.ts';

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

/* 1. Бөгж: ⚠️ 2026-10-01 — БҮХ блокоор, тайлангүй 0% — (40+10+70)/5 = 24 (урьд нь хэмжигдсэн
      блокоор л /3 = 40; C|9 ба A|3 хуваарьт ОРДОГГҮЙ байв).
      ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): давхардсан A|1 НЭГ удаа (урьд нь 2 — газрын
      зургийн давхардсан полигон тоонд ордог байв). */
{
  const r = latestMean(pmOf(hist), keys);
  assert.equal(r.pct, 24, '⚠️ 2026-10-01: тайлангүй блок (A|3, C|9) 0%-иар хуваарьт орно');
  assert.equal(r.blocks, 3, 'давхардсан A|1 нэг удаа тоологдоно (цуваатай ижил дүрэм)');
  assert.equal(r.total, 5);
  /* ⚠️ 2026-10-01: хэмжилтгүй (ачаалалт АМЖИЛТТАЙ, нэг ч блок тайлагнаагүй) → 0%; null нь хуваарь хоосон үед л */
  assert.equal(latestMean(new Map(), keys).pct, 0, '⚠️ 2026-10-01: бүх блок тайлагнаагүй бол 0% (урьд нь null)');
  assert.equal(latestMean(new Map(), []).pct, null, 'хуваарь хоосон бол null — 0 БИШ');
}

/* 2. ⚠️ ГОЛ ИНВАРИАНТ: цувааны СҮҮЛИЙН цэг == бөгж (сар ба өдрөөр) */
for (const grain of ['month', 'day']) {
  const s = progressSeries(hist, keys, grain, 'latest');
  const last = s[s.length - 1];
  const ring = latestMean(pmOf(hist), keys);
  assert.equal(last.overall, ring.pct, `${grain}: сүүлийн цэг == бөгж`);
  assert.equal(last.blocks, ring.blocks, `${grain}: хуваарь == бөгжийн блок`);
}

/* 3. 'latest' — агшин бүрд тухайн үеийн сүүлийн утга. ⚠️ 2026-10-01: хуваарь ТОГТМОЛ (5 блок) —
      урьд нь тухайн агшинд хэмжигдсэн блокоор хуваадаг байв. */
{
  const s = progressSeries(hist, keys, 'month', 'latest');
  assert.deepEqual(s.map((p) => p.label), ['2026-06', '2026-07', '2026-08']);
  /* 06: A|1=20, A|3=30 → 50/5 (⚠️ 2026-10-01: давхардсан A|1 нэг удаа; хуваарь 5 — урьд нь /2 = 25) */
  assert.equal(s[0].overall, 10);
  assert.equal(s[0].blocks, 2);
  /* 07: A|1=50, A|2=10, A|3=30 → 90/5 (урьд нь /3 = 30) */
  assert.equal(s[1].overall, 18);
}

/* 4. Анхдагч 'peak' ХӨНДӨГДӨӨГҮЙ — хуваарь БҮХ түлхүүр, өссөн дүн */
{
  const s = progressSeries(hist, keys, 'month');
  const last = s[s.length - 1];
  /* A|1 peak 50 + A|2 10 + A|3 peak 30 + B|1 70 = 160 / 5 (давхардалгүй түлхүүр) */
  assert.equal(last.overall, 32);
  assert.equal(last.blocks, 4);
}

/* 5. ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр) РЕГРЕСС: 4 блоктой багцын зөвхөн A нь 100% тайлагнасан
      → багц 25%, 100% БИШ. Хуваарь нь бөглөх хуудасны блок (`universe`), Map-д хэмжилтгүй
      блок байхгүй ч 0%-иар орно. */
{
  const pm = new Map([['БАГЦ9|A', { overall: 100, date: '2026-09-30', phases: [] }]]);
  const uni = new Map([
    ['БАГЦ9', ['БАГЦ9|A', 'БАГЦ9|B', 'БАГЦ9|C', 'БАГЦ9|D']],
    ['БАГЦ8', ['БАГЦ8|1', 'БАГЦ8|2']],             // ОГТ тайлагнаагүй багц
  ]);
  const m = pkgProgressOf(pm, uni);
  assert.equal(m.get('БАГЦ9')?.pct, 25, '4 блокийн 1 нь 100% → 25% (100% БИШ)');
  assert.equal(m.get('БАГЦ9')?.blocks, 1);
  assert.equal(m.get('БАГЦ9')?.total, 4);
  assert.equal(m.get('БАГЦ8')?.pct, 0, 'огт тайлагнаагүй багц 0% (Map-д ОРНО)');
  assert.equal(m.get('БАГЦ8')?.blocks, 0);
  /* Хуваарьгүй (бөглөх хуудас уншигдаагүй) багц — Map-д ОРОХГҮЙ («—», 0 БИШ) */
  assert.equal(m.has('БАГЦ7'), false);
  /* Хуваарьт ороогүй хэмжилт ч хаягдахгүй — хуваарь өргөснө */
  const m2 = pkgProgressOf(new Map([...pm, ['БАГЦ9|E', { overall: 50, date: '2026-09-30', phases: [] }]]), uni);
  assert.equal(m2.get('БАГЦ9')?.pct, 30, '(100 + 50) / 5');
  /* Бөгж ба багцын хувь НЭГ хуваарь — `universeKeys` */
  assert.equal(latestMean(pm, universeKeys(pm, uni, ['БАГЦ9'])).pct, 25);
}

console.log('blockProgressSeries.check: OK');
