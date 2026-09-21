/**
 * БАГЦ АЖЛЫН ОНОО — цэвэр, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/scorecard.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. `null` ≠ 0 — өгөгдөлгүй бүлэг 0 оноо болж нийт дунджийг чимээгүй буулгах.
 *   2. Урьдчилгаа олголт (биет явцаас түрүүлсэн) «эрсдэл» гэж торгуулах.
 *   3. Цэг-олон өнцөгтийн тест нүхтэй бүсэд буруу, блок → бүсийн оноо зохиох.
 *   4. Бүлэглэлт: хасагдсан ажил дундажид орох, хамгийн муу нь доор үлдэх.
 */
import assert from 'node:assert/strict';
import {
  scorePerf, scoreFin, scoreLand, scorePlan, scoreHse, scoreQual, scoreLevel, dimLevel, scorePermit,
  totalOf, groupByType, projectDims, pointInRings, ringCenter, blockZoneScores, meanOf, DIMS, workIssues,
  statusCounts, dimStatusCounts, passFilter, NO_FILTER, workStatus, statusByType,
} from './scorecard.ts';

const DAY = 86_400_000;
const now = Date.UTC(2026, 8, 17);

/* ── Түвшин ── */
assert.equal(scoreLevel(null), 'unknown');
assert.equal(scoreLevel(80), 'good');
assert.equal(scoreLevel(79.9), 'warn');
assert.equal(scoreLevel(50), 'warn');
assert.equal(scoreLevel(49), 'bad');

/* ── meanOf: null алгасна, 0 тоологдоно ── */
assert.equal(meanOf([null, null]), null);
assert.equal(meanOf([0, 100, null]), 50);

/* ── 1. Гүйцэтгэл ── */
assert.equal(scorePerf({ lag: { planned: 30, actual: 30 }, start: null, end: null, progress: null, now }).score, 100);
assert.equal(scorePerf({ lag: { planned: 30, actual: 10 }, start: null, end: null, progress: null, now }).score, 50);
assert.equal(scorePerf({ lag: { planned: 10, actual: 40 }, start: null, end: null, progress: null, now }).score, 100, 'түрүүлсэн нь торгуулгүй');
assert.equal(scorePerf({ lag: { planned: 80, actual: 0 }, start: null, end: null, progress: null, now }).score, 0, '0-ээс доош буухгүй');
{
  /* Муруйгүй: шугаман төлөвлөгөө — хугацааны тал өнгөрсөн → 50% */
  const r = scorePerf({ lag: null, start: now - 50 * DAY, end: now + 50 * DAY, progress: 40, now });
  assert.equal(r.score, 75, 'төл. 50, бодит 40 → 10пп × 2.5');
}
assert.equal(scorePerf({ lag: null, start: now - DAY, end: now + DAY, progress: null, now }).score, null, 'гүйцэтгэл хэмжигдээгүй → null, 0 биш');

/* ── 2. Санхүүжилт ── */
assert.equal(scoreFin({ contracted: true, start: null, now, cost: 100, contract: 100, paidPct: null, actual: null }).score, 100);
assert.equal(scoreFin({ contracted: false, start: now - DAY, now, cost: 100, contract: null, paidPct: null, actual: null }).score, 0, 'хугацаа өнгөрсөн, гэрээгүй');
assert.equal(scoreFin({ contracted: false, start: now + DAY, now, cost: 100, contract: null, paidPct: null, actual: null }).score, null, 'эхлээгүй, гэрээгүй — дүгнэхгүй');
assert.equal(scoreFin({ contracted: true, start: null, now, cost: 100, contract: 110, paidPct: null, actual: null }).score, 75, 'гэрээ 10% их → 50 ба 100-ийн дундаж');
/* ⚠️ 2026-09-21: `geree_dun > 0` атлаа тайлбар нь «Гэрээлсэн дүн» биш мөр — ГЭРЭЭТЭЙ гэж тооцно */
assert.equal(scoreFin({ contracted: false, start: now - DAY, now, cost: 100, contract: 100, paidPct: null, actual: null }).score, 100, 'гэрээний дүнтэй бол хугацаа өнгөрсөн ч «гэрээгүй» БИШ');
assert.equal(scoreFin({ contracted: false, start: now - DAY, now, cost: 100, contract: 100, paidPct: null, actual: null }).facts[0].value, 'байгуулсан');
assert.equal(scoreFin({ contracted: true, start: null, now, cost: 100, contract: 100, paidPct: 35, actual: 10 }).score, 100, 'урьдчилгаа 25пп түрүүлсэн — хэвийн');
assert.equal(scoreFin({ contracted: true, start: null, now, cost: 100, contract: 100, paidPct: 10, actual: 50 }).score, (100 + 100 + 40) / 3, 'олголт 40пп хоцорсон');

/* ── 3. Газар чөлөөлөлт ── */
assert.equal(scoreLand({ isLandWork: false, landPct: 70, hasFootprint: false, overlap: 0, overlapFailed: false }).score, null, 'газрын зураглалгүй → null');
assert.equal(scoreLand({ isLandWork: false, landPct: 70, hasFootprint: true, overlap: 0, overlapFailed: false }).score, 100);
assert.equal(scoreLand({ isLandWork: false, landPct: 70, hasFootprint: true, overlap: 4, overlapFailed: false }).score, 80);
assert.equal(scoreLand({ isLandWork: false, landPct: 70, hasFootprint: true, overlap: null, overlapFailed: true }).score, null, 'огтлолцол татагдаагүй → «цэвэр» гэж хэлэхгүй');
assert.equal(scoreLand({ isLandWork: true, landPct: 71.4, hasFootprint: false, overlap: null, overlapFailed: false }).score, 71.4);

/* ── 4. Ерөнхий төлөвлөгөө ── */
assert.equal(scorePlan({ blockScores: [], failingZones: [] }).score, null);
assert.equal(scorePlan({ blockScores: [60, 80], failingZones: ['A-1'] }).score, 70);

/* ── 5. ХАБЭА — ЗӨВХӨН ажлын байрны үзлэг ── */
assert.equal(scoreHse({ active: false, inspections: [] }).score, null, 'идэвхгүй, үзлэггүй → «—»');
assert.equal(scoreHse({ active: false, inspections: [] }).pending, undefined);
assert.equal(scoreHse({ active: true, inspections: [] }).pending, true, 'идэвхтэй талбай, үзлэг ороогүй → хүлээгдэж (0 биш)');
{
  const r = scoreHse({ active: true, inspections: [
    { at: now - DAY, conf: 40, major: 2, minor: 3, obs: 7 },
    { at: now - 3 * DAY, conf: 45, major: 0, minor: 10, obs: 0 },
  ] });
  assert.equal(r.score, 85, '85 нийцсэн ÷ (85 + 2 + 13) — ажиглалт хуваарьт орохгүй');
  assert.equal(dimLevel('hse', r.score), 'warn', '70–90 улбар шар');
}
assert.equal(dimLevel('hse', 90), 'good', '90 ба түүнээс дээш ногоон');
assert.equal(dimLevel('hse', 69.9), 'bad', '70 хүртэл улаан');
assert.equal(dimLevel('perf', 85), 'good', 'бусад бүлэг 80/50 хэвээр');
assert.equal(scoreHse({ active: true, inspections: [{ at: now, conf: 0, major: 0, minor: 0, obs: 3 }] }).pending, true, 'зөвхөн ажиглалттай үзлэг — дүгнэх зүйлгүй');

/* ── Зөвшөөрөл ── */
assert.equal(scorePermit({ counts: null }).score, null, 'бүртгэлгүй → «—»');
assert.equal(scorePermit({ counts: { ok: 0, wait: 0, no: 0, unknown: 0 } }).score, null);
{
  const r = scorePermit({ counts: { ok: 6, wait: 1, no: 1, unknown: 0 } });
  assert.equal(r.score, 75, '6 / 8');
  assert.deepEqual(r.issues.map((i) => i.tone), ['bad', 'warn'], 'татгалзсан — заавал, хүлээгдэж — анхаарах');
  assert.equal(scorePermit({ counts: { ok: 8, wait: 0, no: 0, unknown: 0 } }).issues.length, 0);
}

/* ── 6. Чанар ── */
assert.equal(scoreQual({ qaqc: null }).score, null);
assert.equal(scoreQual({ qaqc: { total: 10, empty: 4, partial: 2 } }).score, 50, '4 бүрэн + 2×0.5 = 5 / 10');
{
  const r = scoreQual({ qaqc: { total: 12, empty: 12, partial: 0 } });
  assert.equal(r.score, null, 'нэг ч баримт оруулаагүй → 0 оноо БИШ');
  assert.equal(r.pending, true, '«дата хүлээгдэж буй» гэж тэмдэглэгдэнэ');
}

/* ── Нийт: null бүлэг дунджид орохгүй ── */
{
  const dims = Object.fromEntries(DIMS.map((d) => [d, { score: null, facts: [] }]));
  dims.perf = { score: 40, facts: [] };
  dims.fin = { score: 80, facts: [] };
  assert.equal(totalOf(dims), 60);
}

/* ── Бүлэглэлт ── */
{
  const mk = (oid, type, total, cost, cancelled = false) => ({
    oid, name: `w${oid}`, pkgLabel: '', key: '', type, cost, contract: null, cancelled, total,
    dims: Object.fromEntries(DIMS.map((d) => [d, { score: total, facts: [] }])),
  });
  const g = groupByType([mk(1, 'A', 90, 10), mk(2, 'A', 30, 5), mk(3, 'A', null, 1), mk(4, 'B', 50, 100), mk(5, 'A', 0, 1, true)]);
  assert.equal(g[0].type, 'B', 'төсвөөр буурах эрэмбэ');
  assert.deepEqual(g[1].works.map((w) => w.oid), [5, 2, 1, 3], 'хамгийн бага оноо эхэнд, оноогүй нь сүүлд');
  assert.equal(g[1].total, 60, 'хасагдсан ажил (0) дунджид орохгүй');
  assert.equal(projectDims([mk(1, 'A', 90, 1), mk(2, 'A', null, 1)]).total, 90);
  {
    const p = mk(7, 'A', null, 1);
    p.dims.qual = { score: null, facts: [], pending: true };
    assert.equal(projectDims([p]).pending.qual, true, 'оноогүй + хүлээгдэж буй → бүлэг «хүлээгдэж»');
    assert.equal(projectDims([mk(8, 'A', 60, 1), p]).pending.qual, false, 'оноотой ажил байвал дундаж харагдана');
  }
}

/* ── Орон зай ── */
{
  const outer = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  assert.equal(pointInRings(2, 2, [outer]), true);
  assert.equal(pointInRings(5, 5, [outer, hole]), false, 'нүхэн доторх цэг бүсэд ороогүй');
  assert.equal(pointInRings(11, 5, [outer]), false);
  assert.deepEqual(ringCenter([outer]), [5, 5], 'хаалтын давхар оройг тоолохгүй');

  const zones = [
    { id: 'Z1', rings: [outer], score: 70, failing: true },
    { id: 'Z2', rings: [[[20, 0], [30, 0], [30, 10], [20, 10], [20, 0]]], score: 90, failing: false },
  ];
  const blocks = [
    { key: 'БАГЦ1', rings: [[[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]] },
    { key: 'БАГЦ1', rings: [[[21, 1], [22, 1], [22, 2], [21, 2], [21, 1]]] },
    { key: 'БАГЦ2', rings: [[[50, 50], [51, 50], [51, 51], [50, 51], [50, 50]]] },
  ];
  const m = blockZoneScores(zones, blocks);
  assert.deepEqual(m.get('БАГЦ1'), { blockScores: [70, 90], failingZones: ['Z1'] });
  assert.equal(m.has('БАГЦ2'), false, 'бүсэд ороогүй блок — оноо ЗОХИОХГҮЙ');
}

/* ── Асуудлын эрэмбэ ── */
{
  const perf = scorePerf({ lag: { planned: 40, actual: 30 }, start: null, end: null, progress: null, now }); // 75 → warn
  assert.equal(perf.issues.length, 1);
  assert.equal(perf.issues[0].tone, 'warn');
  const fin = scoreFin({ contracted: false, start: now - DAY, now, cost: 100, contract: null, paidPct: null, actual: null });
  assert.equal(fin.issues[0].tone, 'bad', 'гэрээгүй, хугацаа өнгөрсөн — заавал');
  const hse = scoreHse({ active: true, inspections: [{ at: now, conf: 95, major: 1, minor: 4, obs: 0 }] }); // 95% — ногоон ч ноцтой 1
  assert.equal(hse.issues.length, 1, 'нийцэл ≥90 боловч ноцтой үл нийцэл заавал гарна');
  assert.equal(hse.issues[0].tone, 'bad');
  const qual = scoreQual({ qaqc: { total: 5, empty: 5, partial: 0 } });
  assert.equal(qual.issues[0].tone, 'info');
  assert.equal(scorePerf({ lag: { planned: 30, actual: 30 }, start: null, end: null, progress: null, now }).issues.length, 0, 'хэвийн → асуудалгүй');

  const none = { score: null, facts: [] };
  const w = {
    oid: 1, name: 'w', pkgLabel: '', key: '', type: 'A', cost: 1, contract: null, cancelled: false, total: null,
    dims: { perf, fin, land: none, plan: none, permit: none, hse, qual },
  };
  const r = workIssues(w);
  assert.deepEqual(r.map((x) => x.tone), ['bad', 'bad', 'warn', 'info'], 'заавал → анхаарах → дата');
  assert.equal(r[0].dim, 'fin', 'ижил зэрэгт бага оноотой (0) нь эхэнд');
  {
    const plan = scorePlan({ blockScores: [10], failingZones: [] }); // 10 → bad
    const w2 = { ...w, dims: { ...w.dims, plan } };
    const r2 = workIssues(w2).filter((x) => x.tone === 'bad');
    assert.equal(r2[r2.length - 1].dim, 'plan', 'Ерөнхий төлөвлөгөө бага оноотой ч ижил зэрэгт СҮҮЛД');
  }
}

/* ── Төлөв ба шүүлт ── */
{
  const none = { score: null, facts: [] };
  const mk = (oid, total, dims = {}, cancelled = false) => ({
    oid, name: `w${oid}`, pkgLabel: '', key: '', type: 'A', cost: 1, contract: null, cancelled, total,
    dims: { perf: none, fin: none, land: none, plan: none, permit: none, hse: none, qual: none, ...dims },
  });
  const ws = [
    mk(1, 30, { hse: { score: 60, facts: [] } }),
    mk(2, 65, { hse: { score: 95, facts: [] } }),
    mk(3, 90, { qual: { score: null, facts: [], pending: true } }),
    mk(4, null),
    mk(5, 10, {}, true),
  ];
  assert.equal(workStatus(ws[0]), 'bad');
  assert.deepEqual(statusCounts(ws), { bad: 1, warn: 1, good: 1, none: 1 }, 'хасагдсан ажил тоологдохгүй');
  const hse = dimStatusCounts(ws, 'hse');
  assert.equal(hse.bad, 1, 'ХАБЭА 60 → улаан (босго 70)');
  assert.equal(hse.good, 1, 'ХАБЭА 95 → ногоон');
  assert.equal(dimStatusCounts(ws, 'qual').pending, 1);
  assert.equal(passFilter(ws[4], NO_FILTER), true, 'шүүлтгүй үед хасагдсан ч харагдана');
  assert.deepEqual(ws.filter((w) => passFilter(w, { status: ['bad', 'warn'], types: [], problemDim: null })).map((w) => w.oid), [1, 2]);
  assert.deepEqual(ws.filter((w) => passFilter(w, { status: [], types: [], problemDim: 'hse' })).map((w) => w.oid), [1], 'ХАБЭА-д асуудалтай нь л');
  assert.deepEqual(ws.filter((w) => passFilter(w, { status: ['warn'], types: [], problemDim: 'hse' })).map((w) => w.oid), [], 'хэмжээс хооронд «БА»');
  const typed = [mk(10, 30), { ...mk(11, 30), type: 'B' }];
  assert.deepEqual(typed.filter((w) => passFilter(w, { status: ['bad'], types: ['B'], problemDim: null })).map((w) => w.oid), [11], 'төрлөөр шүүлт');
  assert.deepEqual(statusByType(typed).map((x) => [x.type, x.counts.bad]), [['A', 1], ['B', 1]]);
}

console.log('scorecard.check ✓');
