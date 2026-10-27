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
import { compute, history, progressCutoff, isFutureDay, mapKeyIssues, pkgProgressOf, winnerCells } from './blockProgress.ts';
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
  /* ⚠️ 2026-10-01: багцын хувь блокийн хуваарьтай (`universe`) — тайлагнаагүй блок 0%.
     Энд хуваарь = хэмжигдсэн ганц блок тул утга өөрчлөгдөхгүй. */
  const uni = new Map([['БАГЦ2', [buildingKey('Багц 2', '1')]]]);
  const { phys } = buildPhys(history(sameMonth, today), ['2026-09', '2026-10'], '2026-10', uni);
  const listPct = phys.get('БАГЦ2')?.get('2026-09');
  assert.equal(pkgProgressOf(pm2, uni).get('БАГЦ2')?.pct, 20, 'зураг/багцын хувь 20%');
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

/* ── 2б. ⚠️ 2026-10-21 (аудит): `history` — ӨӨР хуудасны хоосон нүд хэмжилтийг ДАРАХГҮЙ (`compute`-ийн дүрэм) ── */
{
  const today = '2026-10-20';
  const k = buildingKey('Багц 4-2', '6/1');
  const sh = (r, sheet) => ({ ...r, sheet });
  /* 9F хэмжилттэй, 12F ижил блокт ХООСОН нүд (сүүлийн огноотой, мөн ижил өдөр) */
  const rows = [
    sh(row('Багц 4-2', '6/1', '2026-09-01', 0.40), 'b42_9f'),
    sh(row('Багц 4-2', '6/1', '2026-09-01', null), 'b42_12f'),  /* ижил өдөр — «сүүлийнх ялна» гэж дарахгүй */
    sh(row('Багц 4-2', '6/1', '2026-10-01', null), 'b42_12f'),  /* шинэ огноо — цэг болохгүй */
  ];
  const h = history(rows, today);
  assert.deepEqual(h.get(k), [{ date: '2026-09-01', pct: 40 }], '12F-ийн хоосон нүд 9F-ийн 40%-ийг дарахгүй');
  assert.equal(compute(rows, today).get(k)?.overall, 40, 'зурагтай (compute) нэг тоо');

  /* 12F УТГАТАЙ болбол хоёулаа цэг; 9F-ийн дараагийн null (өөр хуудас утгатай) мөн хаягдана */
  const both = [
    ...rows,
    sh(row('Багц 4-2', '6/1', '2026-10-05', 0.60), 'b42_12f'),
    sh(row('Багц 4-2', '6/1', '2026-10-10', null), 'b42_9f'),
  ];
  assert.deepEqual(history(both, today).get(k)?.map((p) => [p.date, p.pct]),
    [['2026-09-01', 40], ['2026-10-05', 60]]);

  /* НЭГ хуудас дотор null = нүд цэвэрлэгдсэн (хуучин дүрэм хэвээр) */
  const cleared = [
    sh(row('Багц 4-2', '6/1', '2026-09-01', 0.40), 'b42_9f'),
    sh(row('Багц 4-2', '6/1', '2026-10-01', null), 'b42_9f'),
  ];
  assert.deepEqual(history(cleared, today).get(k)?.map((p) => p.pct), [40, null], 'нэг хуудасны null цэг хэвээр');

  /* Хуудасны түлхүүргүй мөр (хуучин кэш) — хуучин дүрмээр: null цэг үлдэнэ */
  const legacy = [
    sh(row('Багц 4-2', '6/1', '2026-09-01', 0.40), 'b42_9f'),
    row('Багц 4-2', '6/1', '2026-10-01', null),
  ];
  assert.deepEqual(history(legacy, today).get(k)?.map((p) => p.pct), [40, null]);

  /* Ирээдүйн огноотой утга «утгатай хуудас» гэж тоологдохгүй — 12F-ийн зөвхөн ирээдүйд хэмжигдсэн бол 9F-ийн null хэвээр */
  const fut = [
    sh(row('Багц 4-2', '6/1', '2026-09-01', 0.40), 'b42_9f'),
    sh(row('Багц 4-2', '6/1', '2026-10-01', null), 'b42_9f'),
    sh(row('Багц 4-2', '6/1', '2026-11-01', 0.90), 'b42_12f'),
  ];
  assert.deepEqual(history(fut, today).get(k)?.map((p) => p.pct), [40, null]);
}

/* ── 2в. ⚠️ 2026-10-21 (аудит): ялагчийн ГАНЦ дүрэм — `history`-ийн сүүлийн цэг == `compute`, мөрийн дарааллаас хамаарахгүй ── */
{
  const today = '2026-10-20';
  const k = buildingKey('Багц 4-2', '6/1');
  const sh = (r, sheet) => ({ ...r, sheet });
  /* 9F 40 (09-01) → 9F ИЖИЛ хуудсандаа цэвэрлэгдсэн (10-10) · 12F 30 (08-01): ялагч 12F-ийн 30 (утгатай хуудас) */
  const rows = [
    sh(row('Багц 4-2', '6/1', '2026-09-01', 0.40), 'b42_9f'),
    sh(row('Багц 4-2', '6/1', '2026-10-10', null), 'b42_9f'),
    sh(row('Багц 4-2', '6/1', '2026-08-01', 0.30), 'b42_12f'),
  ];
  const pm = compute(rows, today);
  assert.equal(pm.get(k)?.overall, 30, 'зураг: 9F цэвэрлэгдсэн тул 12F-ийн 30');
  assert.equal(pm.get(k)?.date, '2026-08-01');
  const h = history(rows, today).get(k);
  assert.deepEqual(h?.map((p) => [p.date, p.pct]), [['2026-08-01', 30], ['2026-09-01', 40], ['2026-10-10', 30]],
    'цуваа: 10-10-нд 9F цэвэрлэгдэхэд 12F-ийн 30 руу буцна (урьд сүүлийн цэг 40 байв)');
  assert.equal(h?.at(-1)?.pct, pm.get(k)?.overall, 'сүүлийн цэг == зураг');
  /* мөрийн дараалал (12F эхэнд) — урьд `compute` overall null болдог байв */
  const rev = [...rows].reverse();
  assert.equal(compute(rev, today).get(k)?.overall, 30, 'дарааллаас хамаарахгүй');
  assert.deepEqual(history(rev, today).get(k)?.map((p) => [p.date, p.pct]), h?.map((p) => [p.date, p.pct]));
  const wc = winnerCells(rows, today).get(k)?.get(TASK_SHEET.constructionNo);
  assert.equal(wc?.sheet, 'b42_12f'); assert.equal(wc?.pct, 30);
  /* бүх хуудас цэвэрлэгдсэн — ялагч null: зурагт алга, цуваа null-аар төгсөнө */
  const allNull = [...rows, sh(row('Багц 4-2', '6/1', '2026-10-12', null), 'b42_12f')];
  assert.equal(compute(allNull, today).has(k), false);
  assert.equal(history(allNull, today).get(k)?.at(-1)?.pct, null);
  /* ижил өдөр хоёр хуудас утгатай — сүүлийн мөр (их OID) ялна; «нэг өдөрт хоёр бичлэг» дүрэм хэвээр */
  const same = [
    sh(row('Багц 4-2', '6/1', '2026-09-01', 0.40), 'b42_9f'),
    sh(row('Багц 4-2', '6/1', '2026-09-01', 0.50), 'b42_12f'),
  ];
  assert.equal(compute(same, today).get(k)?.overall, 50);
  assert.deepEqual(history(same, today).get(k), [{ date: '2026-09-01', pct: 50 }]);
}

/* ── 3. CEO картын кэшийн `keep` — эх унасан картыг кэшлэхгүй ── */
{
  assert.equal(kpiComplete({ failedSources: [] }), true);
  assert.equal(kpiComplete({ failedSources: ['QAQC Багц 3.1'] }), false);
}

console.log('blockProgressCutoff.check: OK');
