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
  scorePerf, scoreFin, scoreLand, scoreHse, scoreLevel, dimLevel, scorePermit,
  totalOf, groupByType, projectDims, meanOf, DIMS, workIssues,
  statusCounts, dimStatusCounts, passFilter, NO_FILTER, workStatus, statusByType, perfNoCurve, workDimLevel,
  perfPartial, scoreAlerts, perfNotStarted,
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
/* ⚠️ 2026-10-22 (аудит): `coverage: 100` — хуваарь бүрэн хамарсан (дүгнэгдэнэ); дутуу хамралт доор (§1б) */
assert.equal(scorePerf({ lag: { planned: 30, actual: 30, coverage: 100 }, start: null, end: null, progress: null, now }).score, 100);
assert.equal(scorePerf({ lag: { planned: 30, actual: 10, coverage: 100 }, start: null, end: null, progress: null, now }).score, 50);
assert.equal(scorePerf({ lag: { planned: 10, actual: 40, coverage: 100 }, start: null, end: null, progress: null, now }).score, 100, 'түрүүлсэн нь торгуулгүй');
assert.equal(scorePerf({ lag: { planned: 80, actual: 0, coverage: 100 }, start: null, end: null, progress: null, now }).score, 0, '0-ээс доош буухгүй');
/* ── 1б. ⚠️ 2026-10-22 (аудит): ХУВААРЬ ДУТУУ (< 95%) — оноо `null` (100 БИШ), шалтгаан ил ──
   Багц 3.3: хамралт 8.6% тул төлөвлөсөн 8.6 < бодит 25.1 → урьд нь 100 оноо «Хэвийн» гардаг байв. */
{
  const p = scorePerf({ lag: { planned: 8.6, actual: 25.1, coverage: 8.6 }, start: now - 50 * DAY, end: now + 50 * DAY, progress: 40, now });
  assert.equal(p.score, null, 'дутуу хамралт → null (огнооны шугам + Cashflow руу ч БУУХГҮЙ)');
  assert.deepEqual(p.facts.map((f) => f.value), ['8.6%', '25.1%', '8.6%'], 'төлөвлөсөн · бодит · хамралт');
  assert.equal(p.facts[2].label, 'Хуваарийн хамралт');
  assert.equal(p.issues?.[0]?.tone, 'info');
  assert.ok(p.issues[0].text.includes('8.6%'), p.issues[0].text);
  /* хамралт мэдэгдэхгүй (null/алга) — дүгнэхгүй */
  assert.equal(scorePerf({ lag: { planned: 30, actual: 10, coverage: null }, start: null, end: null, progress: null, now }).score, null);
  assert.equal(scorePerf({ lag: { planned: 30, actual: 10 }, start: null, end: null, progress: null, now }).score, null, 'хамралтгүй lag → дүгнэхгүй');
  /* хил: 95 — дүгнэнэ, 94.9 — үгүй */
  assert.equal(scorePerf({ lag: { planned: 30, actual: 10, coverage: 95 }, start: null, end: null, progress: null, now }).score, 50);
  assert.equal(scorePerf({ lag: { planned: 30, actual: 10, coverage: 94.9 }, start: null, end: null, progress: null, now }).score, null);
  assert.deepEqual(perfPartial({ planned: 1, actual: 2, coverage: null }).facts[2].value, '—', 'хамралт null → «—» (0% биш)');
  /* нийт дунджид ОРОХГҮЙ */
  const dims = Object.fromEntries(DIMS.map((k) => [k, { score: null, facts: [] }]));
  dims.perf = p; dims.fin = { score: 60, facts: [] };
  assert.equal(totalOf(dims), 60, 'дутуу хуваарийн гүйцэтгэл нийт оноонд орохгүй');
}
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
/* ⚠️ 2026-09-21 (дахин аудит): ГЭРЭЭТЭЙ = ЗӨВХӨН `note === CONTRACTED`. `geree_dun > 0`
   атлаа тайлбар нь «Гэрээлсэн дүн» биш мөр ГЭРЭЭГҮЙ — дүн нь төсөвтэй ч харьцуулагдахгүй. */
{
  const r = scoreFin({ contracted: false, start: now - DAY, now, cost: 100, contract: 120, paidPct: null, actual: null });
  assert.equal(r.score, 0, 'geree_dun бөглөгдсөн ч тайлбар CONTRACTED биш → гэрээгүй, хугацаа өнгөрсөн');
  assert.equal(r.facts[0].value, 'эхлэх хугацаа өнгөрсөн, гэрээгүй');
  assert.equal(r.facts.length, 1, 'гэрээгүй мөрийн `contract`-ыг «Гэрээ ба төсвийн зөрүү»-д хэрэглэхгүй');
}
assert.equal(scoreFin({ contracted: true, start: null, now, cost: 100, contract: 100, paidPct: 35, actual: 10 }).score, 100, 'урьдчилгаа 25пп түрүүлсэн — хэвийн');
assert.equal(scoreFin({ contracted: true, start: null, now, cost: 100, contract: 100, paidPct: 10, actual: 50 }).score, (100 + 100 + 40) / 3, 'олголт 40пп хоцорсон');

/* ── 3. Газар чөлөөлөлт ── */
assert.equal(scoreLand({ isLandWork: false, landPct: 70, hasFootprint: false, overlap: 0, overlapFailed: false }).score, null, 'газрын зураглалгүй → null');
assert.equal(scoreLand({ isLandWork: false, landPct: 70, hasFootprint: true, overlap: 0, overlapFailed: false }).score, 100);
assert.equal(scoreLand({ isLandWork: false, landPct: 70, hasFootprint: true, overlap: 4, overlapFailed: false }).score, 80);
assert.equal(scoreLand({ isLandWork: false, landPct: 70, hasFootprint: true, overlap: null, overlapFailed: true }).score, null, 'огтлолцол татагдаагүй → «цэвэр» гэж хэлэхгүй');
assert.equal(scoreLand({ isLandWork: true, landPct: 71.4, hasFootprint: false, overlap: null, overlapFailed: false }).score, 71.4);
/* ⚠️ 2026-10-09: газрын бус ажилд 1 давхцал (95 оноо) = CEO газрын карттай нэг `overlapLevel` → bad */
{
  const one = scoreLand({ isLandWork: false, landPct: 70, hasFootprint: true, overlap: 1, overlapFailed: false });
  assert.equal(one.score, 95);
  assert.equal(one.level, 'bad', '≥1 давхцал = bad (pctLevel(95)=good биш)');
  assert.equal(one.issues[0].tone, 'bad');
  assert.equal(workDimLevel({ dims: { land: one } }, 'land'), 'bad');
  const zero = scoreLand({ isLandWork: false, landPct: 70, hasFootprint: true, overlap: 0, overlapFailed: false });
  assert.equal(workDimLevel({ dims: { land: zero } }, 'land'), 'good');
  const lw = scoreLand({ isLandWork: true, landPct: 96, hasFootprint: false, overlap: null, overlapFailed: false });
  assert.equal(lw.level, undefined, 'газар чөлөөлөлтийн ажил pctLevel хэвээр');
  assert.equal(workDimLevel({ dims: { land: lw } }, 'land'), 'good');
}

/* ⚠️ 2026-10-27: «Ерөнхий төлөвлөгөө» (scorePlan · blockZoneScores) ХАСАГДСАН — шалгуур нь ч хасагдав */
assert.deepEqual(DIMS, ['perf', 'fin', 'land', 'permit', 'hse'], 'plan бүлэг алга');

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

/* ── 6. Чанар ── ⚠️ 2026-10-23: QAQC хасагдсан — «Чанар» (qual) хэмжүүр ба `scoreQual` устсан */

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
    oid, name: `w${oid}`, pkgLabel: '', key: '', type, cost, contract: null, cancelled, isLandWork: false, total,
    dims: Object.fromEntries(DIMS.map((d) => [d, { score: total, facts: [] }])),
  });
  const g = groupByType([mk(1, 'A', 90, 10), mk(2, 'A', 30, 5), mk(3, 'A', null, 1), mk(4, 'B', 50, 100), mk(5, 'A', 0, 1, true)]);
  assert.equal(g[0].type, 'B', 'төсвөөр буурах эрэмбэ');
  assert.deepEqual(g[1].works.map((w) => w.oid), [5, 2, 1, 3], 'хамгийн бага оноо эхэнд, оноогүй нь сүүлд');
  /* ⚠️ 2026-09-30: ТӨСВӨӨР жигнэнэ — (90×10 + 30×5) / 15 = 70 (энгийн дундаж 60 байв) */
  assert.equal(g[1].total, 70, 'төсвөөр жигнэсэн; хасагдсан ажил (0) дунджид орохгүй');
  assert.equal(g[1].dims.perf, 70);
  assert.equal(projectDims([mk(1, 'A', 90, 1), mk(2, 'A', null, 1)]).total, 90);
  {
    const p = mk(7, 'A', null, 1);
    /* ⚠️ 2026-10-23: QAQC хасагдсан — хүлээгдэж буй төлвийг «Зөвшөөрөл» хэмжүүрээр шалгана */
    p.dims.permit = { score: null, facts: [], pending: true };
    assert.equal(projectDims([p]).pending.permit, true, 'оноогүй + хүлээгдэж буй → бүлэг «хүлээгдэж»');
    assert.equal(projectDims([mk(8, 'A', 60, 1), p]).pending.permit, false, 'оноотой ажил байвал дундаж харагдана');
  }
}

/* ── ⚠️ 2026-09-30: нэгтгэл ТӨСВӨӨР жигнэсэн, нийт == харагдах бүлгийн дундажуудын дундаж ── */
{
  const none = () => Object.fromEntries(DIMS.map((d) => [d, { score: null, facts: [] }]));
  const mkw = (oid, cost, scores) => {
    const dims = none();
    for (const [d, v] of Object.entries(scores)) dims[d] = { score: v, facts: [] };
    return {
      oid, name: `w${oid}`, pkgLabel: '', key: '', type: 'T', cost, contract: null,
      cancelled: false, isLandWork: false, dims, total: totalOf(dims),
    };
  };
  /* 1.5 тэрбумын ажил 448 тэрбумынхтай ижил жинтэй БАЙХГҮЙ */
  const small = mkw(1, 1.5e9, { perf: 0, fin: 0 });
  const big = mkw(2, 448e9, { perf: 100, land: 50 });
  const p = projectDims([small, big]);
  assert.ok(p.dims.perf > 99, 'гүйцэтгэл — том ажил давамгайлна');
  assert.equal(p.dims.fin, 0, 'зөвхөн жижиг ажил оноотой бүлэг — өөрийн утга');
  assert.equal(p.dims.land, 50);
  /* ГОЛ ИНВАРИАНТ: нийт == хажууд харагдах бүлгүүдийн (null-гүй) дундаж */
  const shown = DIMS.map((d) => p.dims[d]).filter((v) => v != null);
  assert.equal(p.total, shown.reduce((a, b) => a + b, 0) / shown.length);
  const g = groupByType([small, big])[0];
  assert.deepEqual(g.dims, p.dims, 'нэг бүлэгт — бүлэг ба төсөл ижил');
  assert.equal(g.total, p.total);
  /* Төсөвгүй (0₮) ажлууд л оноотой бол — энгийн дундаж (оноог хаяхгүй) */
  const z = projectDims([mkw(3, 0, { hse: 80 }), mkw(4, 0, { hse: 40 })]);
  assert.equal(z.dims.hse, 60);
  assert.equal(z.total, 60);
}

/* ── Асуудлын эрэмбэ ── */
{
  const perf = scorePerf({ lag: { planned: 40, actual: 30, coverage: 100 }, start: null, end: null, progress: null, now }); // 75 → warn
  assert.equal(perf.issues.length, 1);
  assert.equal(perf.issues[0].tone, 'warn');
  const fin = scoreFin({ contracted: false, start: now - DAY, now, cost: 100, contract: null, paidPct: null, actual: null });
  assert.equal(fin.issues[0].tone, 'bad', 'гэрээгүй, хугацаа өнгөрсөн — заавал');
  const hse = scoreHse({ active: true, inspections: [{ at: now, conf: 95, major: 1, minor: 4, obs: 0 }] }); // 95% — ногоон ч ноцтой 1
  assert.equal(hse.issues.length, 1, 'нийцэл ≥90 боловч ноцтой үл нийцэл заавал гарна');
  assert.equal(hse.issues[0].tone, 'bad');
  assert.equal(scorePerf({ lag: { planned: 30, actual: 30, coverage: 100 }, start: null, end: null, progress: null, now }).issues.length, 0, 'хэвийн → асуудалгүй');

  const none = { score: null, facts: [] };
  const w = {
    oid: 1, name: 'w', pkgLabel: '', key: '', type: 'A', cost: 1, contract: null, cancelled: false, isLandWork: false, total: null,
    dims: { perf, fin, land: none, permit: none, hse },
  };
  const r = workIssues(w);
  /* ⚠️ 2026-10-23: QAQC хасагдсан — «дата» (info) жишээ нь QAQC байсан */
  assert.deepEqual(r.map((x) => x.tone), ['bad', 'bad', 'warn'], 'заавал → анхаарах');
  assert.equal(r[0].dim, 'fin', 'ижил зэрэгт бага оноотой (0) нь эхэнд');
}

/* ── Сэрэмжлүүлэг — caveat · scoreAlerts (2026-10-28) ── */
{
  const none = { score: null, facts: [] };
  const mk = (oid, pkgLabel, cost, perf, fin = none) => ({
    oid, name: `w${oid}`, pkgLabel, key: pkgLabel, type: 'A', cost, contract: null, cancelled: false, isLandWork: false, total: null,
    dims: { perf, fin, land: none, permit: none, hse: none },
  });
  const due = scorePerf({ lag: null, start: now + 30 * DAY, end: now + 200 * DAY, progress: 0, now });
  assert.equal(due.score, 100, 'дүрэм хэвээр — эхлээгүй ажил 100');
  assert.equal(due.caveat?.kind, 'notDue', 'харин сэрэмжлүүлэгтэй');
  const started = scorePerf({ lag: null, start: now - 30 * DAY, end: now + 30 * DAY, progress: 50, now });
  assert.equal(started.score, 100);
  assert.equal(started.caveat, undefined, 'эхэлсэн, хоцрогдолгүй — сэрэмжлүүлэггүй');
  assert.equal(scorePerf({ lag: null, start: null, end: null, progress: 10, now }).caveat?.kind, 'noDates');
  assert.equal(scorePerf({ lag: null, start: now - DAY, end: now + DAY, progress: null, now }).caveat?.kind, 'noProgress');
  assert.equal(scorePerf({ lag: { planned: 10, actual: 0, coverage: 100 }, start: now + DAY, end: now + 9 * DAY, progress: null, now }).caveat, undefined, 'хуваарьтай (lag) мөрд notDue хамаарахгүй');
  const part = perfPartial({ planned: 40, actual: 30, coverage: 84.3 });
  assert.equal(part.caveat?.kind, 'partial');
  assert.equal(part.caveat?.value, 84.3);
  assert.equal(perfNotStarted().caveat?.kind, 'notStarted');
  assert.equal(perfNoCurve().caveat?.kind, 'noCurve');
  const finNoAmt = scoreFin({ contracted: true, start: now - DAY, now, cost: 100, contract: null, paidPct: null, actual: null });
  assert.equal(finNoAmt.score, 100, 'оноо хэвээр');
  assert.equal(finNoAmt.caveat?.kind, 'noContractAmount');
  assert.equal(scoreFin({ contracted: true, start: now - DAY, now, cost: 100, contract: 90, paidPct: null, actual: null }).caveat, undefined);
  assert.equal(scoreFin({ contracted: false, start: null, now, cost: 100, contract: null, paidPct: null, actual: null }).caveat, undefined, 'гэрээгүй мөрд хамаарахгүй');

  const ws = [
    mk(1, 'Багц-1', 400, part),
    mk(2, 'Багц-2', 100, due),
    mk(3, 'Багц-3', 100, started, finNoAmt),
    mk(4, 'Багц-4', 100, scorePerf({ lag: null, start: null, end: null, progress: null, now })),
  ];
  const al = scoreAlerts(ws);
  assert.deepEqual(al.map((a) => a.kind), ['perfCoverage', 'notDue', 'dataGap']);
  assert.equal(al[0].tone, 'bad', 'оноотой өртөг 200/700 = 29% < 50 → bad');
  assert.match(al[0].text, /29%/);
  assert.match(al[0].text, /Багц-1 84%/, 'дутуу хуваарьтай багц хамралтаараа');
  assert.match(al[0].text, /1 ажил огноогүй/);
  assert.match(al[1].text, /^1 ажил эхлэх огноо ирээгүй/);
  assert.match(al[1].text, /Багц-2/);
  assert.match(al[2].text, /Багц-3/);
  assert.match(al[2].text, /Багц-4/);
  const good = [mk(1, 'A', 100, started), mk(2, 'B', 3, part)];
  assert.deepEqual(scoreAlerts(good), [], 'хамралт 97% ≥ 95 ба бусад сэрэмжлүүлэггүй → зурвасгүй');
  assert.deepEqual(scoreAlerts([{ ...mk(1, 'X', 100, due), cancelled: true }]), [], 'хасагдсан ажил орохгүй');
  assert.deepEqual(scoreAlerts([{ ...mk(1, 'X', 100, due), isLandWork: true }]), [], 'газрын мөр орохгүй');
  console.log('  ✓ сэрэмжлүүлэг — caveat · scoreAlerts');
}

/* ── Төлөв ба шүүлт ── */
{
  const none = { score: null, facts: [] };
  const mk = (oid, total, dims = {}, cancelled = false) => ({
    oid, name: `w${oid}`, pkgLabel: '', key: '', type: 'A', cost: 1, contract: null, cancelled, isLandWork: false, total,
    dims: { perf: none, fin: none, land: none, permit: none, hse: none, ...dims },
  });
  const ws = [
    mk(1, 30, { hse: { score: 60, facts: [] } }),
    mk(2, 65, { hse: { score: 95, facts: [] } }),
    /* ⚠️ 2026-10-23: QAQC хасагдсан */
    mk(3, 90, { permit: { score: null, facts: [], pending: true } }),
    mk(4, null),
    mk(5, 10, {}, true),
  ];
  assert.equal(workStatus(ws[0]), 'bad');
  assert.deepEqual(statusCounts(ws), { bad: 1, warn: 1, good: 1, none: 1 }, 'хасагдсан ажил тоологдохгүй');
  const hse = dimStatusCounts(ws, 'hse');
  assert.equal(hse.bad, 1, 'ХАБЭА 60 → улаан (босго 70)');
  assert.equal(hse.good, 1, 'ХАБЭА 95 → ногоон');
  assert.equal(dimStatusCounts(ws, 'permit').pending, 1);
  assert.equal(passFilter(ws[4], NO_FILTER), true, 'шүүлтгүй үед хасагдсан ч харагдана');
  assert.deepEqual(ws.filter((w) => passFilter(w, { status: ['bad', 'warn'], types: [], problemDim: null })).map((w) => w.oid), [1, 2]);
  assert.deepEqual(ws.filter((w) => passFilter(w, { status: [], types: [], problemDim: 'hse' })).map((w) => w.oid), [1], 'ХАБЭА-д асуудалтай нь л');
  assert.deepEqual(ws.filter((w) => passFilter(w, { status: ['warn'], types: [], problemDim: 'hse' })).map((w) => w.oid), [], 'хэмжээс хооронд «БА»');
  const typed = [mk(10, 30), { ...mk(11, 30), type: 'B' }];
  assert.deepEqual(typed.filter((w) => passFilter(w, { status: ['bad'], types: ['B'], problemDim: null })).map((w) => w.oid), [11], 'төрлөөр шүүлт');
  assert.deepEqual(statusByType(typed).map((x) => [x.type, x.counts.bad]), [['A', 1], ['B', 1]]);
}

/* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): хуваарийн муруй уншигдаагүй барилгын мөр —
   Cashflow-ийн хувиар ЧИМЭЭГҮЙ оноолохгүй, картад ил тэмдэглэнэ */
{
  const d = perfNoCurve();
  assert.equal(d.score, null, 'муруйгүй үед оноо null («—»), огнооны шугамаар бодохгүй');
  assert.ok(d.facts.length === 1 && d.facts[0].value, 'картад «Хуваарийн муруй: уншигдсангүй»');
  assert.equal(d.issues?.[0]?.tone, 'info', 'гүйцэтгэгчийн дутагдал биш — info');
  /* нийт дунджид ОРОХГҮЙ (null) */
  const dims = Object.fromEntries(DIMS.map((k) => [k, { score: null, facts: [] }]));
  dims.perf = d; dims.fin = { score: 80, facts: [] };
  assert.equal(totalOf(dims), 80, 'муруйгүй гүйцэтгэл нийт оноонд орохгүй');
  /* scorecardLoad нь ЭНЭ функцээр (эх кодын тулгалт) */
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./scorecardLoad.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('lagUnknown ? perfNoCurve()'), 'scorecardLoad перф салаа perfNoCurve-ийг дуудахгүй байна');
  assert.ok(/\(b\) => b\.failed\.length === 0\);/.test(src), 'loadScoreBase хэсэгчилсэн үр дүнг кэшлэхгүй (keep)');
}

console.log('scorecard.check ✓');
