/**
 * БЛОКИЙН ГҮЙЦЭТГЭЛ — ИРЭЭДҮЙН ОГНООНЫ ТАСЛАЛТ ба ГАЗРЫН ЗУРГИЙН ТҮЛХҮҮРИЙН ЗӨРҮҮ (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/blockProgressCutoff.check.mjs
 *
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»):
 *   1. Өнөөдрөөс ХОЙШ огноотой хэмжилт газрын зургийн будалт (`compute`) ба багцын
 *      жагсаалт (`history` → `finPhys` → `physLatest`) ХОЁУЛАНД хасагдана — урьд нь зураг
 *      огт таслалтгүй, жагсаалт сараар таслагддаг тул нэг блок хоёр дэлгэцэд өөр хувьтай.
 *   2. `mapKeyIssues` — давхардсан полигон · footprint-гүй хэмжилт · багцын нэр буруу байж
 *      болзошгүй блокийг админд засуулах жагсаалт (өгөгдлийг засахгүй, тоонд нөлөөгүй).
 */
import assert from 'node:assert/strict';
import { compute, history, progressCutoff, isFutureDay, mapKeyIssues, pkgProgressOf } from './blockProgress.ts';
import { buildPhys } from './finPhys.ts';
import { TASK_SHEET, buildingKey } from './services.ts';
import { kpiComplete } from './ceo/kpi.ts';

const TS = TASK_SHEET.fields;
const row = (bagts, block, date, pct, no = TASK_SHEET.constructionNo) => ({
  [TS.bagts]: bagts, [TS.no]: no, [TS.work]: 'Барилга угсралтын ажил', [TS.date]: date, [TS.block]: block, [TS.progress]: pct,
});

/* ── 1. Таслалт ── */
{
  const today = '2026-10-01';
  assert.equal(isFutureDay('2026-10-02', today), true);
  assert.equal(isFutureDay('2026-10-01', today), false, 'өнөөдрийн хэмжилт тооцогдоно');
  assert.match(progressCutoff(), /^\d{4}-\d{2}-\d{2}$/);

  const rows = [
    row('Багц 1', '5/1', '2026-09-20', 0.30),
    row('Багц 1', '5/1', '2026-10-15', 0.90), /* ИРЭЭДҮЙ — буруу огноо сонгосон бөглөлт */
    row('Багц 1', '5/2', '2026-11-03', 0.50), /* зөвхөн ирээдүйд хэмжигдсэн блок */
  ];
  const pm = compute(rows, today);
  const k1 = buildingKey('Багц 1', '5/1');
  assert.equal(pm.get(k1)?.overall, 30, 'зураг: ирээдүйн 90% ялах ёсгүй (сүүлийн ӨНӨӨДРИЙН хүртэлх 30%)');
  assert.equal(pm.has(buildingKey('Багц 1', '5/2')), false, 'зөвхөн ирээдүйд хэмжигдсэн блок — «мэдээлэлгүй»');

  const h = history(rows, today);
  assert.deepEqual(h.get(k1)?.map((p) => p.date), ['2026-09-20'], 'түүх: ирээдүйн цэг хасагдана');
  assert.equal(h.has(buildingKey('Багц 1', '5/2')), false);

  /* Жагсаалт (`finPhys` → сарын сүүлийн утга) ба зураг (`pkgProgressOf`) НЭГ тоо —
     одоогийн сард ирээдүйн өдөртэй бичилт байсан ч (урьд нь жагсаалт түүнийг авдаг байв). */
  const sameMonth = [
    row('Багц 2', '1', '2026-09-28', 0.20),
    row('Багц 2', '1', '2026-10-25', 0.80), /* энэ сард, гэхдээ ирээдүйн өдөр */
  ];
  const pm2 = compute(sameMonth, today);
  const { phys } = buildPhys(history(sameMonth, today), ['2026-09', '2026-10'], '2026-10');
  const listPct = phys.get('БАГЦ2')?.get('2026-09');
  assert.equal(pkgProgressOf(pm2).get('БАГЦ2')?.pct, 20, 'зураг/багцын хувь 20%');
  assert.equal(listPct, 20, 'жагсаалт 20% (ирээдүйн 80% орохгүй)');
  assert.equal(phys.get('БАГЦ2')?.has('2026-10'), false, '10-р сард ирээдүйн бичилтээс цэг үүсэхгүй');
}

/* ── 2. Газрын зургийн түлхүүрийн зөрүү ── */
{
  const features = [
    buildingKey('Багц 1', '29/1'), buildingKey('Багц 1', '29/1'), /* давхардсан полигон */
    buildingKey('Багц 1', '29/2'),
    buildingKey('Багц 2', '29/3'), /* «Багц 2» гэж буруу бичигдсэн 29/3 */
    buildingKey('Багц 2', '5/6'), buildingKey('Багц 2', '5/6'),
  ];
  const measured = [
    buildingKey('Багц 1', '29/1'), buildingKey('Багц 1', '29/2'),
    buildingKey('Багц 1', '29/3'), /* footprint-гүй (буруу багцтай) */
    buildingKey('Багц 2', '5/8'), /* footprint огт алга */
  ];
  const r = mapKeyIssues(features, measured);
  assert.deepEqual(r.dup, ['БАГЦ1|29/1', 'БАГЦ2|5/6'].sort());
  assert.deepEqual(r.orphan, ['БАГЦ1|29/3', 'БАГЦ2|5/8'].sort());
  assert.deepEqual(r.relabel, [{ measured: 'БАГЦ1|29/3', feature: 'БАГЦ2|29/3' }], '29/3 — багцын нэр буруу байж болзошгүй');
  const clean = mapKeyIssues([buildingKey('Багц 1', '1')], [buildingKey('Багц 1', '1')]);
  assert.deepEqual(clean, { dup: [], orphan: [], relabel: [] });
}

/* ── 3. CEO картын кэшийн `keep` — эх унасан картыг кэшлэхгүй ── */
{
  assert.equal(kpiComplete({ failedSources: [] }), true);
  assert.equal(kpiComplete({ failedSources: ['QAQC Багц 3.1'] }), false);
}

console.log('blockProgressCutoff.check: OK');
