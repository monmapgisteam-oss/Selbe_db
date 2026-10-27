/**
 * ТӨСЛИЙН ТӨЛӨВЛӨГӨӨНИЙ АМЬД ОРОЛТЫН АДАПТЕРУУД — сүлжээгүй шалгуур (stub-аар).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/projectPlanInputs.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. ТҮЛХҮҮР. Excel-ийн «Багц-4.2» · «БАГЦ-5.1» · блок «6/1» нь системийн «Багц 4-2» · «Багц 5.1»-ийн
 *      `buildingKey`/`bagtsKey`-тэй таарна; олон багцын мөр («БАГЦ-6.1, 6.2») аль ч багцад наалдахгүй.
 *   2. null ≠ 0. Хуваарьтай атлаа тайлагнаагүй блок 0; хуваарьт ч үгүй блок `undefined` (мэдэхгүй); эх унасан → null.
 *   3. ХУВААРЬ БЛОК ТУС БҮРЭЭР. `planCurve`-ийн блокийн ДУНДАЖ биш — блок бүрийн огноогоор; хуваарьгүй блок null
 *      (0 БИШ); 9F/12F-ийн давхардсан шошгод ЭХНИЙ хуудас давамгайлна; алдаатай огноо (эхлэх > дуусах, 1899) хаягдана.
 *   4. ГАЗАР. Нэгж талбарын ТООГООР; зөвхөн хилээр хүрэлцсэн талбар тоологдохгүй; шугам огтолсон талбар тоологдоно.
 *   5. Excel мөр алга → хоосон төлөв (алдаа биш); бүтэн фикстураар adapter-ууд computePlan-д зөв урсана.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  toStoredRow, compareDdKod, sortPlanRows,
  blockActualOf, pkgActualOf, blockPlannedOf, makeSchedules, monthlyOf,
  makeParcelIndex, parcelHits, landPctOf, landPctMap, landKeyOf, landKeysOf, landOf, landLayerIdsOf, EMPTY_AREA_PCT,
  assemblePlan, emptyPlan, planMonths, __test,
} from './projectPlanInputs.ts';
import { buildTree, ubToday } from './projectPlan.ts';
import { planCurve } from '@/modules/sheet/bagtsSheet.ts';

const D = (iso) => Date.parse(`${iso}T00:00:00Z`);
const near = (a, b, tol, msg) => {
  if (a == null || b == null) return assert.equal(a, b, msg);
  assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b}`);
};

/* ══════════ 1. Мөр уншилт ба эрэмбэ ══════════ */
{
  const r = toStoredRow({
    OBJECTID: 7, dd_kod: ' 5.2.1 ', ETSEG_KOD: '5.2', tuvshin: 2, bagts: 'Багц-1', blok: '', ajil_uilchilgee: 'x',
    ho_dun_geree: '1200', heseg_ezleh_huvi: 0.25, geree_ehleh: D('2026-01-01'), guitsetgel_huvi: '  ', Cashflow_ID: 12,
  });
  assert.equal(r.dd_kod, '5.2.1', 'dd_kod тайрагдана');
  assert.equal(r.etseg_kod, '5.2', 'том/жижиг үсэг үл ялган уншина');
  assert.equal(r.blok, null, 'хоосон блок null');
  assert.equal(r.ho_dun_geree, 1200, 'мөрөөр ирсэн тоо');
  assert.equal(r.guitsetgel_huvi, null, 'хоосон мөр 0 БИШ — null');
  assert.equal(r.cashflow_id, 12);
  assert.equal(r.objectid, 7);
  assert.ok(compareDdKod('1.9', '1.10') < 0, '«1.9» < «1.10» (байгалийн)');
  assert.ok(compareDdKod('1', '1.1') < 0, 'эцэг хүүхдээсээ өмнө');
  assert.ok(compareDdKod('2', '1.99') > 0);
  const s = sortPlanRows([{ dd_kod: '1.10', objectid: 1 }, { dd_kod: '2', objectid: 2 }, { dd_kod: '1', objectid: 3 }, { dd_kod: '1.2', objectid: 4 }]);
  assert.deepEqual(s.map((x) => x.dd_kod), ['1', '1.2', '1.10', '2']);
  console.log('✅ 1. мөр уншилт ба dd_kod-ын эрэмбэ');
}

/* ══════════ 2. Бодит гүйцэтгэлийн адаптер ══════════ */
{
  const blocks = new Map([
    ['БАГЦ42|6/1', { overall: 37.5, date: '2026-10-01', phases: [] }],
    ['БАГЦ1|5/1', { overall: 100, date: '2026-10-01', phases: [] }],
  ]);
  const universe = new Map([['БАГЦ42', ['БАГЦ42|5/1', 'БАГЦ42|6/1', 'БАГЦ42|6/2']], ['БАГЦ1', ['БАГЦ1|5/1']]]);
  const infra = new Map([['БАГЦ51', { pct: 36, blocks: 1, total: 1 }], ['БАГЦ10', { pct: 0, blocks: 0, total: 1 }]]);
  const act = blockActualOf({ blocks, universe, infra });
  assert.equal(act('Багц-4.2', '6/1'), 37.5, 'Excel «Багц-4.2» = систем «Багц 4-2» (9F/12F нэг багц)');
  assert.equal(act('Багц-4.2', '6/2'), 0, 'хуваарьт байгаа, тайлагнаагүй → 0 (2026-10-01 шийдвэр)');
  assert.equal(act('Багц-4.2', '6/9'), undefined, 'хуваарьт ч үгүй → undefined (мэдэхгүй)');
  assert.equal(act('Багц-1', '5/1'), 100);
  assert.equal(blockActualOf({ blocks: null, universe, infra })('Багц-1', '5/1'), null, 'эх унасан → null');
  const pk = pkgActualOf({ blocks, universe, infra });
  assert.equal(pk('Багц-5.1'), 36, '«Багц-5.1» → «БАГЦ51»');
  assert.equal(pk('БАГЦ-10'), 0, 'тайлагнаагүй блокгүй багц 0 (pkgProgressOf)');
  assert.equal(pk('БАГЦ-6.1, 6.2'), undefined, 'олон багцын мөр аль ч багцад наалдахгүй');
  assert.equal(pk('БАГЦ 1- 4'), undefined, 'диапазон «1-4» ≠ Багц 14');
  assert.equal(pk('Багц-6.3'), undefined, 'бөглөх хуудасгүй багц → мэдэхгүй');
  assert.equal(pkgActualOf({ blocks, universe, infra: null })('Багц-5.1'), null);
  console.log('✅ 2. бодит гүйцэтгэл — түлхүүр, 0 vs мэдэхгүй vs унасан');
}

/* ══════════ 3. Хуваарь — блок тус бүрээр ══════════ */
const srow = (o) => ({
  oid: o.oid, no: o.no, des: o.des ?? null, ham: null, work: o.work ?? 'w', depth: o.depth, group: !!o.group,
  wC: null, wD: null, vol: o.vol ?? 1, unit: o.unit ?? 1, money: null, act: [], obyem: [], plannedVol: null, raw: {},
  start: o.start, end: o.end, gStart: [], gEnd: [], aStart: [], aEnd: [], hun: null, mashin: null,
});
{
  /* 9F: блок 5/1 (хоёр ажил), 6/1 (огноогүй — хуваарьгүй), 6/2 (алдаатай огноо — урвуу ба 1899) */
  const nine = {
    key: 'b42_9f', group: 'Багц 4-2', bld: ['5/1', '6/1', '6/2'],
    rows: [
      srow({ oid: 1, no: 'А. БЭЛТГЭЛ АЖИЛ', depth: 0, group: true, start: [D('2025-01-01'), null, null], end: [D('2025-01-31'), null, null] }),
      srow({ oid: 2, no: 'Б. БАРИЛГА УГСРАЛТЫН АЖИЛ', depth: 0, group: true, start: [null, null, null], end: [null, null, null] }),
      srow({ oid: 3, no: '1', depth: 1, vol: 3, start: [D('2026-01-01'), null, D('2026-06-01')], end: [D('2026-01-10'), null, D('2026-01-01')] }),
      srow({ oid: 4, no: '2', depth: 1, vol: 1, start: [D('2026-02-01'), null, D('1899-12-30')], end: [D('2026-02-10'), null, D('2026-03-01')] }),
    ],
  };
  /* 12F: «6/1» давхардсан шошго — ХУВААРЬТАЙ; 9F-ийнх хуваарьгүй тул энэ нь орно. «5/1» — 9F давамгайлна. */
  const twelve = {
    key: 'b42_12f', group: 'Багц 4-2', bld: ['6/1', '5/1'],
    rows: [
      srow({ oid: 1, no: 'Б.', depth: 0, group: true, start: [null, null], end: [null, null] }),
      srow({ oid: 2, no: '1', depth: 1, start: [D('2027-01-01'), D('2030-01-01')], end: [D('2027-01-10'), D('2030-12-31')] }),
    ],
  };
  const sc = makeSchedules([nine, twelve]);
  const bp = blockPlannedOf(sc);
  /* 5/1: 75% жин (vol 3) ажил 1-10 сарын 1-нд, 25% 2-р сард */
  assert.equal(bp('Багц-4.2', '5/1', D('2025-12-31')), 0, 'хуваарь эхлэхээс өмнө 0 (хуваарьтай блок)');
  near(bp('Багц-4.2', '5/1', D('2026-01-10')), 75, 1e-9, 'эхний ажил дууссан → 75 (жин vol×unit)');
  near(bp('Багц-4.2', '5/1', D('2026-01-05')), 75 * 5 / 10, 1e-9, 'шугаман, өдрийн төгсгөлөөр (spanFrac)');
  near(bp('Багц-4.2', '5/1', D('2026-03-01')), 100, 1e-9, 'хоёулаа дууссан');
  /* `planCurve`-тэй тулгалт — блокийн нэг багана */
  const one = nine.rows.map((r) => ({ ...r, start: [r.start[0]], end: [r.end[0]] }));
  near(bp('Багц-4.2', '5/1', D('2026-02-05')), planCurve(one, 1, [D('2026-02-05')])[0][1] * 100, 1e-12, 'planCurve-тэй ЯГ ижил');
  assert.equal(bp('Багц-4.2', '6/9', D('2026-02-05')), null, 'шошго алга → null');
  near(bp('БАГЦ-4.2', '6/1', D('2027-01-10')), 100, 1e-9, '9F-ийн 6/1 хуваарьгүй → 12F-ийнх');
  assert.equal(bp('Багц-4.2', '6/2', D('2026-12-31')), null, 'алдаатай огноо (урвуу · 1899) хаягдана → хуваарьгүй');
  assert.ok(sc.has('Багц 4-2', '5/1') && !sc.has('Багц 4-2', '6/2'));
  near(bp('Багц-4.2', '5/1', D('2030-06-01')), 100, 1e-9, '«5/1» 9F давамгайлна (12F-ийн 2030-ийнх биш)');
  /* `prime` — олон өдрийг нэг дор; дараагийн асуулт ижил утга */
  sc.prime([D('2026-01-03'), D('2026-01-03') + 3_600_000, D('2026-02-03')]);
  near(bp('Багц-4.2', '5/1', D('2026-01-03') + 7_200_000), 75 * 3 / 10, 1e-9, 'өдрөөр кэшлэнэ');
  assert.equal(blockPlannedOf(null)('Багц-1', '5/1', D('2026-01-01')), null, 'хуваарь унасан → null (шугаман руу УНАХГҮЙ)');
  /* сарын задаргаа (monthly) нь `planPct`-ийн үүрэгтэй */
  const withM = makeSchedules([{ ...nine, monthly: (des, blok) => (blok === '5/1' ? 0.5 : null) }]);
  near(withM.at('Багц 4-2', '5/1', D('2026-01-05')), 50, 1e-9, 'сарын задаргаа огнооноос давамгайлна');
  /* ⚠️ 2026-10-26 (хяналтын олдвор): задаргаатай УРВУУ мөр «бүрэн төлөвлөгдсөн» болохгүй — callback ЭХ огноо авна */
  {
    const rows = [
      srow({ oid: 1, no: 'Б.', depth: 0, group: true, start: [null], end: [null] }),
      srow({ oid: 2, no: '1', des: 1, depth: 1, start: [D('2026-01-01')], end: [D('2026-01-31')] }),
      srow({ oid: 3, no: '2', des: 2, depth: 1, start: [D('2026-02-28')], end: [D('2026-02-01')] }),
    ];
    const ob = new Map([[2, new Map([['5/1', new Map([['2026-02', 10]])]])]]);
    const monthly = monthlyOf(ob);
    const inv = makeSchedules([{ key: 't', group: 'Багц 1', bld: ['5/1'], rows, monthly }]);
    const t = D('2026-03-15');
    /* planProgress.loadPlanCurve-ийн зам: эх хуудас + planPct эх огноогоор */
    const ref = planCurve(rows, 1, [t], (row, b, asOf) => monthly(row.des, '5/1', row.start[b], row.end[b], asOf))[0][0] * 100;
    near(ref, 50, 1e-9, 'Хуваарийн замаар урвуу мөр = хуваарьгүй (эцэгт 0)');
    near(inv.at('Багц 1', '5/1', t), ref, 1e-9, 'adapter = Хуваарь (урвуу мөр задаргаатай ч P-г өсгөхгүй)');
    assert.equal(monthlyOf(null), undefined);
    assert.equal(monthlyOf(new Map()), undefined, 'хоосон задаргаа → огнооны зам');
    near(monthly(2, '5/1', D('1899-12-30'), D('2026-02-01'), t), 1, 1e-9, 'sane биш огноо → бүтэн сараар (planProgress-тэй ижил)');
  }
  console.log('✅ 3. хуваарь — блок бүрээр, хуваарьгүй null, 9F давамгайлал, алдаатай огноо');
}

/* ══════════ 4. Газар чөлөөлөлт — нэгж талбарын тоогоор ══════════ */
{
  const sq = (x, y, w = 10) => [[[x, y], [x, y + w], [x + w, y + w], [x + w, y], [x, y]]];
  /* 0: [0,10]², 1: [10,20]×[0,10] (хөрш), 2: [20,30]×[0,10], 3: [0,10]×[20,30] (хол) */
  const parcels = [
    { rings: sq(0, 0), cleared: true },
    { rings: sq(10, 0), cleared: false },
    { rings: sq(20, 0), cleared: true },
    { rings: sq(0, 20), cleared: false },
  ];
  const idx = makeParcelIndex(parcels);
  /* footprint [2,8]² — зөвхөн 0-ийн дотор */
  assert.deepEqual([...parcelHits(idx, [{ rings: sq(2, 2, 6) }])], [0], 'бүрэн багтсан объект');
  /* footprint [0,10]² — 0-тэй ЯГ ижил, 1-тэй хилээр л хүрэлцэнэ */
  assert.deepEqual([...parcelHits(idx, [{ rings: sq(0, 0) }])].sort(), [0], 'хилээр хүрэлцсэн хөрш тоологдохгүй');
  /* footprint [5,15]×[2,8] — 0 ба 1-ийг огтолно */
  const h = parcelHits(idx, [{ rings: [[[5, 2], [5, 8], [15, 8], [15, 2], [5, 2]]] }]);
  assert.deepEqual([...h].sort(), [0, 1], 'хоёр талбарыг огтолсон');
  assert.equal(landPctOf(idx, h), 50, '1 чөлөөлсөн ÷ 2 нийт');
  /* объект нэгж талбарыг бүрэн агуулна */
  assert.deepEqual([...parcelHits(idx, [{ rings: sq(-5, -5, 40) }])].sort(), [0, 1, 2, 3], 'том полигон бүгдийг агуулна');
  /* шугам 1 ба 2-ыг дайрна, 0-ийн хилээр явна */
  assert.deepEqual([...parcelHits(idx, [{ paths: [[[10, -5], [10, 5], [25, 5]]] }])].sort(), [1, 2], 'шугам: хилээр явсан хэсэг тоологдохгүй');
  /* цэг */
  assert.deepEqual([...parcelHits(idx, [{ pt: [5, 25] }])], [3]);
  assert.deepEqual([...parcelHits(idx, [{ pt: [10, 5] }])], [], 'хил дээрх цэг — хүрэлцэл');
  assert.equal(landPctOf(idx, new Set()), EMPTY_AREA_PCT, 'нэгж талбаргүй хүрээ');
  /* түлхүүр ба хувийн зураглал */
  assert.equal(landKeyOf('Багц-1', '5/1'), 'БАГЦ1|5/1');
  assert.equal(landKeyOf('БАГЦ-16.1', null), 'P|БАГЦ161');
  assert.equal(landKeyOf('БАГЦ-6.1, 6.2', null), 'P|', 'олон багц → хоосон түлхүүр');
  const footprints = new Map([['БАГЦ1|5/1', [{ rings: [[[5, 2], [5, 8], [15, 8], [15, 2], [5, 2]]] }]], ['БАГЦ1|5/2', [{ rings: sq(20, 0) }]]]);
  const pcts = landPctMap({ parcels: idx, footprints, infra: new Map(), failedPkgs: new Set() },
    ['БАГЦ1|5/1', 'БАГЦ1|5/2', 'БАГЦ1|5/9', 'P|БАГЦ1', 'P|', 'P|БАГЦ999']);
  assert.equal(pcts.get('БАГЦ1|5/1'), 50);
  assert.equal(pcts.get('БАГЦ1|5/2'), 100);
  assert.equal(pcts.get('БАГЦ1|5/9'), null, 'footprint-гүй блок → null (мэдэхгүй)');
  near(pcts.get('P|БАГЦ1'), 200 / 3, 1e-9, 'багц = бүх блокийн footprint (0,1,2 — 2/3)');
  assert.equal(pcts.get('P|'), null);
  assert.equal(pcts.get('P|БАГЦ999'), null);
  assert.equal(landPctMap({ parcels: null, footprints, infra: new Map(), failedPkgs: new Set() }, ['БАГЦ1|5/1']).get('БАГЦ1|5/1'), null, 'нэгж талбар унасан → null');
  /* дэд бүтцийн давхаргатай багц (PKG_BY_BAGTS-д БАГЦ161 бий) — давхарга нь унасан бол null */
  const inf = landPctMap({ parcels: idx, footprints, infra: new Map([['БАГЦ161', [{ rings: sq(20, 0) }]]]), failedPkgs: new Set(['БАГЦ171']) },
    ['P|БАГЦ161', 'P|БАГЦ171']);
  assert.equal(inf.get('P|БАГЦ161'), 100);
  assert.equal(inf.get('P|БАГЦ171'), null, 'давхарга унасан багц дутуу хүрээгээр бодогдохгүй');
  /* Excel ↔ каталогийн түлхүүрийн alias (БАГЦ71 → БАГЦ7; БАГЦ6n → БАГЦ6n + БАГЦnХОЛБОО) */
  const { PKG_BY_BAGTS } = await import('@/lib/services.ts');
  assert.deepEqual(landLayerIdsOf('БАГЦ71'), PKG_BY_BAGTS['БАГЦ7'], 'Excel «БАГЦ-7.1» = каталогийн Багц 7');
  assert.ok(PKG_BY_BAGTS['БАГЦ7'].length > 0);
  assert.deepEqual(landLayerIdsOf('БАГЦ61').sort(), [...PKG_BY_BAGTS['БАГЦ61'], ...PKG_BY_BAGTS['БАГЦ1ХОЛБОО']].sort(),
    'Багц-6.1 = цахилгаан + холбоо');
  assert.deepEqual(landLayerIdsOf('БАГЦ161'), PKG_BY_BAGTS['БАГЦ161'], 'alias-гүй багц өөрийнхөөрөө');
  assert.deepEqual(landLayerIdsOf(''), []);
  const al = landPctMap({ parcels: idx, footprints, infra: new Map([['БАГЦ71', [{ rings: sq(20, 0) }]]]), failedPkgs: new Set() }, ['P|БАГЦ71']);
  assert.equal(al.get('P|БАГЦ71'), 100, 'alias-аар давхаргатай багц давхаргаараа бодогдоно');
  assert.equal(landOf(pcts)('Багц-1', '5/1'), 50);
  assert.equal(landOf(pcts)('Багц-1', '29/9'), null);
  /* хотгор (U) нэгж талбарын дотоод цэг дотор нь */
  const U = [[[0, 0], [0, 10], [3, 10], [3, 3], [7, 3], [7, 10], [10, 10], [10, 0], [0, 0]]];
  const ip = __test.interiorPoint(U);
  assert.ok(ip && __test.strictlyIn(U, ip[0], ip[1]), 'хотгор хэлбэрийн дотоод цэг');
  console.log('✅ 4. газар — тоогоор, хүрэлцэл ≠ огтлолцол, footprint/давхарга, унасан → null');
}

/* ══════════ 5. Нэгтгэл — фикстур ба хоосон төлөв ══════════ */
{
  const today = D('2026-10-26');
  const e = emptyPlan(today);
  assert.equal(e.empty, true);
  assert.equal(e.tree.nodes.length, 0);
  /* ⚠️ 2026-10-26: анхдагч өнөөдөр = УБ-ын хуанлийн өдөр (UTC-ээр тасалбал УБ-ын 00:00–08:00-д өчигдөр) */
  { const a = ubToday(); const t0 = emptyPlan().result.today; assert.ok([a, ubToday()].includes(t0), 'emptyPlan today = ubToday()'); }
  assert.equal(assemblePlan([], { actual: { blocks: null, universe: null, infra: null }, sched: null, land: new Map() }, today).empty, true,
    'Excel мөр алга → хоосон төлөв (алдаа биш)');

  const fx = JSON.parse(readFileSync(new URL('./projectPlan.fixture.json', import.meta.url), 'utf8'));
  const DAY = 86_400_000;
  const fromSerial = (v) => (v == null ? null : (v - 25569) * DAY);
  const s = (i) => (i == null ? null : fx.strs[i]);
  const rows = fx.rows.map((r, i) => ({
    objectid: i + 1, dd_kod: r[0], etseg_kod: r[1], uy_shat: r[2], bagts: s(r[3]), blok: r[4], ajil_uilchilgee: s(r[5]),
    ho_dun_geree: r[6], heseg_ezleh_huvi: r[7], tusul_ezleh_huvi: r[8],
    geree_ehleh: fromSerial(r[9]), geree_duusah: fromSerial(r[10]),
    /* ⚠️ 2026-10-26: фикстурын r[11]/r[12] = Excel J/K «Гүйцэтгэгч» → guits_*, r[13]/r[14] = L/M «Газар
       чөлөөлөлт/бодит» → gazar_* (cf-wave2-ийн тохиролцоо; өмнө нь эсрэгээр байв) */
    guits_ehleh: fromSerial(r[11]), guits_duusah: fromSerial(r[12]),
    gazar_ehleh: fromSerial(r[13]), gazar_duusah: fromSerial(r[14]),
  }));
  const tree = buildTree(rows);
  const keys = landKeysOf(tree);
  assert.ok(keys.includes('БАГЦ42|6/8') && keys.includes('P|БАГЦ161'), 'газрын навчны түлхүүрүүд');
  assert.ok(keys.includes('P|'), 'олон багцын газрын навч хоосон түлхүүртэй (холбогдохгүй)');

  /* stub: Багц 1-ийн бүх блок 50%, Багц-5.1 36%; хуваарь: Багц 1·5/1 л; газар: Багц 1·5/1 = 80 */
  const universe = new Map([['БАГЦ1', ['5/1', '5/2'].map((b) => `БАГЦ1|${b}`)]]);
  const blocks = new Map([['БАГЦ1|5/1', { overall: 50, date: '2026-10-01', phases: [] }]]);
  const infra = new Map([['БАГЦ51', { pct: 36, blocks: 1, total: 1 }]]);
  const sched = makeSchedules([{
    key: 'b1_9f', group: 'Багц 1', bld: ['5/1'],
    rows: [
      srow({ oid: 1, no: 'Б.', depth: 0, group: true, start: [null], end: [null] }),
      srow({ oid: 2, no: '1', depth: 1, start: [D('2026-01-01')], end: [D('2027-12-31')] }),
    ],
  }]);
  const land = new Map([['БАГЦ1|5/1', 80]]);
  const p = assemblePlan(rows, { actual: { blocks, universe, infra }, sched, land }, today, ['x']);
  assert.equal(p.empty, false);
  assert.deepEqual(p.failed, ['x']);
  const find = (pred) => tree.nodes.findIndex(pred);
  const bi = find((n) => n.phase === 'barilga' && n.sub === 'barilga' && n.pkg === 'Багц-1' && n.blok === '5/1' && !n.children.length);
  assert.ok(bi >= 0, 'Барилга угсралтын Багц-1 · 5/1 навч');
  const node = p.tree.nodes[bi];
  const v = p.result.values.get(node);
  assert.equal(v.S, 50, 'S = бөглөх хуудасны блок');
  assert.equal(v.status, 'started');
  const v2 = p.result.values.get(p.tree.nodes[find((n) => n.phase === 'barilga' && n.sub === 'barilga' && n.pkg === 'Багц-1' && n.blok === '5/2' && !n.children.length)]);
  assert.equal(v2.S, 0, 'тайлагнаагүй блок 0');
  assert.equal(v2.status, 'notStarted');
  assert.equal(v2.P, null, 'хуваарьгүй блок P = null (шугаман БИШ)');
  near(v.P, sched.at('Багц 1', '5/1', today), 1e-12, 'P = Хуваарь');
  near(v.Q, sched.at('Багц 1', '5/1', today + 7 * DAY), 1e-12, 'Q = +7 хоног');
  near(v.R, sched.at('Багц 1', '5/1', today - 7 * DAY), 1e-12, 'R = −7 хоног');
  const g = p.result.values.get(p.tree.nodes[find((n) => n.phase === 'gazar' && n.pkg === 'Багц-1' && n.blok === '5/1' && !n.children.length)]);
  assert.equal(g.S, 80, 'газар чөлөөлөлтийн блок');
  const g2 = p.result.values.get(p.tree.nodes[find((n) => n.phase === 'gazar' && n.pkg === 'Багц-1' && n.blok === '5/2' && !n.children.length)]);
  assert.equal(g2.S, null, 'газрын мэдээлэлгүй блок null');
  const inf = p.result.values.get(p.tree.nodes[find((n) => n.phase === 'barilga' && n.sub === 'barilga' && n.pkg === 'Багц-5.1' && !n.children.length)]);
  assert.equal(inf.S, 36, 'блокгүй багц (Багц-5.1 → БАГЦ51)');
  /* сарын цуваа */
  assert.equal(p.months.length, planMonths(p.result).length);
  assert.ok(p.months.length > 12, 'сарын тэнхлэг төслийн мужаар');
  const ser = p.monthly.get(node);
  assert.equal(ser.length, p.months.length);
  const iDec = p.months.findIndex((t) => new Date(t).toISOString().startsWith('2026-12'));
  near(ser[iDec], sched.at('Багц 1', '5/1', p.months[iDec]), 1e-12, 'сарын цуваа = Хуваарь');
  assert.ok(p.monthly.get(p.tree.root).some((x) => x != null), 'үндсэн мөрийн цуваа бодогдсон');
  console.log('✅ 5. нэгтгэл — хоосон төлөв, фикстур дээр адаптерууд урсана');
}

console.log('projectPlanInputs.check: бүгд ✅');
