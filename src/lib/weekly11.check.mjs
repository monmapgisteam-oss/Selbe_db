/**
 * 2026-11-11-НИЙ 5 САЙЖРУУЛАЛТЫН ЦЭВЭР ШАЛГУУР (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/weekly11.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. Батлах үеийн өсөлт (`fillGainOf`): блок · багц (төсвийн жингээр, мэдэгдээгүй жин = дундаж) · төсөл (G × өсөлт,
 *      «А.» бэлтгэлийн блокоор нэмэгдэнэ); блокгүй хуудас — ганц блок.
 *   2. Бэлтгэл ажил: бөглөх хуудасгүй мөр нийлбэр, жинд орохгүй (`skip`), хуудастай нь 100% жинтэй болно.
 *   3. Зураг төслийн жин: ах дүү бүгд хадгалсан жинтэй бол төсвийн хувиас түрүүлнэ.
 *   4. Ирэх 7 хоногийн обьём (`weekPct`, `makeSchedules`): суурь дээр 7 хоногт шугаман нэмэгдэнэ; оруулгагүй бол суурь.
 *   5. Өмнөх 7 хоног (`negRowsFromPlan`): `prevWeek`-ээс actPw, gainWk = act − actPw.
 */
import assert from 'node:assert/strict';
import { fillGainOf } from './fillGain.ts';
import { buildTree, computePlan } from './projectPlan.ts';
import { makeSchedules } from './projectPlanInputs.ts';
import { weekPct, weekStart, nextWeekStart, weekEdits, toPkgWeek, TURUL_WEEK } from './huvaariObyem.ts';
import { negRowsFromPlan } from './negtgel.ts';

const D = (iso) => Date.parse(`${iso}T00:00:00Z`);
const DAY = 86_400_000;
const near = (a, b, tol, msg) => assert.ok(a != null && Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b}`);

/* ── 1. fillGainOf ── */
{
  const universe = new Map([['БАГЦ2', ['БАГЦ2|5/1', 'БАГЦ2|5/2', 'БАГЦ2|5/3']]]);
  const weights = new Map([['БАГЦ2|5/1', 300], ['БАГЦ2|5/2', 100]]); // 5/3 жингүй → мэдэгдсэний дундаж (200)
  const nodes = [
    { pkg: 'Багц-2', blok: '5/1', phase: 'barilga', sub: 'barilga', children: [] },
    { pkg: 'Багц-2', blok: '5/2', phase: 'barilga', sub: 'barilga', children: [] },
    { pkg: 'Багц-2', blok: '5/1', phase: 'barilga', sub: 'beltgel', children: [] },
  ];
  const G = new Map([[nodes[0], 2], [nodes[1], 1], [nodes[2], 0.5]]);
  const g = fillGainOf('Багц 2', ['5/1', '5/2'], [0.1, 0], [0.2, null], false, universe, weights, { nodes, gOf: (n) => G.get(n) ?? null });
  assert.deepEqual(g.blocks, [{ block: '5/1', pct: 10 }], 'өөрчлөгдсөн блок л');
  near(g.pkg, (300 * 0.1 / 600) * 100, 1e-9, 'багц = Σ w·Δ ÷ Σ w (5/3 жин = 200)');
  near(g.project, 2 * 0.1 + 0.5 * 0.2, 1e-12, 'төсөл = G_Б·Δ_Б + G_А·Δ_А');
  const s = fillGainOf('Багц 6.1', ['Ажил'], [0.05], [null], true, null, null, { nodes: [{ pkg: 'Багц-6.1', blok: null, phase: 'barilga', sub: 'barilga', children: [] }], gOf: () => 4 });
  near(s.pkg, 5, 1e-12, 'блокгүй хуудас — ганц блок');
  near(s.project, 0.2, 1e-12);
  assert.equal(fillGainOf('Багц 2', ['5/1'], [0.1], [null], false, null, null, null).pkg, null, 'хуваарь алга → багц тооцохгүй');
  console.log('✅ 1. батлах үеийн өсөлт');
}

/* ── 2–3. computePlan: бэлтгэлийн хасалт ба зураг төслийн жин ── */
{
  const R = (objectid, dd_kod, etseg_kod, o = {}) => ({ objectid, dd_kod, etseg_kod, ajil_uilchilgee: `w${objectid}`, ...o });
  const rows = [
    R(1, '5', null, { uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'Барилга угсралт' }),
    R(2, '5.1', '5', { ajil_uilchilgee: 'Бэлтгэл ажил', heseg_ezleh_huvi: 1 }),
    R(3, '5.1.1', '5.1', { ajil_uilchilgee: 'Газар чөлөөлөлт', heseg_ezleh_huvi: 0.5, guitsetgel_huvi: 90 }),
    R(4, '5.1.3', '5.1', { ajil_uilchilgee: 'Талбайн бэлтгэл ажил', heseg_ezleh_huvi: 0.5 }),
    R(5, '5.1.3.1', '5.1.3', { bagts: 'Багц-1', ajil_uilchilgee: 'Багц-1', heseg_ezleh_huvi: 1 }),
    R(6, '5.1.3.1.1', '5.1.3.1', { blok: '5/1', heseg_ezleh_huvi: 1 }),
  ];
  const t = buildTree(rows);
  const r = computePlan(t, { prepActual: (pkg, blok) => (blok === '5/1' ? 40 : undefined) });
  assert.equal(r.get('5.1.1').S, null, 'хуудасгүй бэлтгэлийн мөр хувьгүй');
  assert.equal(r.get('5.1.1').F, null, 'жингүй');
  assert.equal(r.get('5.1.1').skip, true);
  near(r.get('5.1.3').F, 100, 1e-9, 'хуудастай мөр 100% жинтэй');
  near(r.get('5.1').S, 40, 1e-9, 'Бэлтгэл ажил = зөвхөн «А.»');
  assert.equal(computePlan(t, {}).get('5.1.1').S, 90, 'prepActual-гүй бол хасахгүй (хадгалсан)');

  const z = buildTree([
    R(10, '2', null, { uy_shat: 'Ажлын зураг төсөл', ajil_uilchilgee: 'Ажлын зураг төсөл' }),
    R(11, '2.1', '2', { ho_dun_geree: 900, heseg_ezleh_huvi: 0.2, guitsetgel_huvi: 100 }),
    R(12, '2.2', '2', { ho_dun_geree: 100, heseg_ezleh_huvi: 0.8, guitsetgel_huvi: 0 }),
  ]);
  near(computePlan(z).get('2.1').F, 20, 1e-9, 'ах дүү бүгд хадгалсан жинтэй — хадгалсан жин (төсөв 90% биш)');
  const z2 = buildTree([
    R(10, '2', null, { uy_shat: 'Ажлын зураг төсөл', ajil_uilchilgee: 'Ажлын зураг төсөл' }),
    R(11, '2.1', '2', { ho_dun_geree: 900, heseg_ezleh_huvi: 0.2 }),
    R(12, '2.2', '2', { ho_dun_geree: 100 }),
  ]);
  near(computePlan(z2).get('2.1').F, 90, 1e-9, 'нэг нь жингүй бол төсвийн хувь');
  console.log('✅ 2–3. бэлтгэлийн хасалт · зураг төслийн жин');
}

/* ── 4. Ирэх 7 хоногийн обьём ── */
{
  assert.equal(weekStart(D('2026-11-11')), D('2026-11-09'), 'Даваа гараг');
  assert.equal(nextWeekStart(D('2026-11-11')), D('2026-11-16'));
  const base = () => 0.2;
  const e = [{ week: D('2026-11-16'), obyem: 30, oid: 1 }];
  const T = D('2026-11-11'); // Лхагва: энэ долоо хоног 11-09, ирэх нь 11-16
  near(weekPct(e, 100, T + 7 * DAY, base, T), 0.5, 1e-12, 'ирэх 7 хоног = өнөөдрийн суурь + обьём ÷ нийт (бүтнээр, гарагаас үл хамаарна)');
  near(weekPct(e, 100, D('2026-11-09') + 7 * DAY, base, D('2026-11-09')), 0.5, 1e-12, 'Даваа гарагт ч бүтнээр');
  assert.equal(weekPct(e, 100, T, base, T), undefined, 'өнөөдрийн төлөвлөгөөт хувийг хөндөхгүй');
  assert.equal(weekPct(e, 100, T - 7 * DAY, base, T), undefined, 'өнгөрсөн өдрийг хөндөхгүй');
  assert.equal(weekPct(e, 100, T + 30 * DAY, base, T), undefined, '7 хоногоос цааш — суурь');
  assert.equal(weekPct(e, 100, D('2026-11-25') + 7 * DAY, base, D('2026-11-25')), undefined, 'өнгөрсөн долоо хоногийн оруулга үлдэгдэл нөлөөгүй');
  near(weekPct([{ week: D('2026-11-09'), obyem: 10, oid: 2 }], 100, T + 7 * DAY, base, T), 0.3, 1e-12, 'ирэх долоо хоногийнх алга бол энэ долоо хоногийн оруулга');
  assert.equal(weekPct(e, null, T + 7 * DAY, base, T), undefined, 'нийт обьёмгүй — суурь');
  near(weekPct([{ week: D('2026-11-16'), obyem: 500, oid: 1 }], 100, T + 7 * DAY, base, T), 1, 1e-12, '100%-аар таслана');
  const ed = weekEdits({ bagts: 'b1_9f', bagtsNer: 'Багц 1', des: 7, ajilNo: '3', ajilNer: 'w', negj: '', niit: 100 }, '5/1', D('2026-11-16'), 30, null);
  assert.equal(ed.adds[0].attributes.turul, TURUL_WEEK);
  assert.equal(ed.adds[0].attributes.dkey, 'b1_9f|doloo_hon|7|5/1|2026-11-16');
  assert.deepEqual(weekEdits({ bagts: 'x', bagtsNer: 'x', des: 1, ajilNo: '', ajilNer: '', negj: '', niit: 1 }, 'b', 0, null, 9).deletes, [9], 'хоосон = устгана');
  const pw = toPkgWeek([{ attributes: { objectid: 5, des_dugaar: 7, blok: '5/1', sar: '2026-11-16', obyem: 30 } }]);
  assert.deepEqual(pw.get(7).get('5/1'), [{ week: D('2026-11-16'), obyem: 30, oid: 5 }]);

  /* makeSchedules: долоо хоногийн оруулгатай ажил «Б.»-ийн төлөвлөгөөт хувийг өсгөнө */
  const srow = (o) => ({
    oid: o.oid, no: o.no, des: o.des ?? null, ham: null, work: 'w', depth: o.depth, group: !!o.group,
    wC: null, wD: null, vol: o.vol ?? 1, unit: 1, money: null, act: [], obyem: [], plannedVol: null, raw: {},
    start: o.start, end: o.end, gStart: [], gEnd: [], aStart: [], aEnd: [], hun: null, mashin: null,
  });
  const sheet = {
    key: 'b1_9f', group: 'Багц 1', bld: ['5/1'],
    rows: [
      srow({ oid: 1, no: 'Б.', depth: 0, group: true, start: [null], end: [null] }),
      srow({ oid: 2, no: '1', des: 7, depth: 1, vol: 100, start: [D('2026-01-01')], end: [D('2027-12-31')] }),
    ],
  };
  const { ubToday } = await import('./projectPlan.ts');
  const now = ubToday();
  const pwNow = toPkgWeek([{ attributes: { objectid: 5, des_dugaar: 7, blok: '5/1', sar: new Date(nextWeekStart(now)).toISOString().slice(0, 10), obyem: 30 } }]);
  const sh2 = { ...sheet, rows: sheet.rows.map((r) => ({ ...r, start: [now - 300 * DAY], end: [now + 300 * DAY] })) };
  const S0 = makeSchedules([sh2]), S1 = makeSchedules([{ ...sh2, weekly: pwNow }]);
  near(S1.at('Багц 1', '5/1', now + 7 * DAY), S0.at('Багц 1', '5/1', now) + 30, 1e-6, 'Q = P(өнөөдөр) + 30 ÷ 100');
  near(S1.at('Багц 1', '5/1', now), S0.at('Багц 1', '5/1', now), 1e-9, 'P өөрчлөгдөхгүй');
  near(S1.at('Багц 1', '5/1', now - 7 * DAY), S0.at('Багц 1', '5/1', now - 7 * DAY), 1e-9, 'R өөрчлөгдөхгүй');
  console.log('✅ 4. ирэх 7 хоногийн обьём');
}

/* ── 5. negRowsFromPlan — өмнөх 7 хоног ── */
{
  const t = buildTree([{ objectid: 1, dd_kod: '1', ajil_uilchilgee: 'ТЭЗҮ', uy_shat: 'ТЭЗҮ', guitsetgel_huvi: 60 }]);
  const result = computePlan(t);
  const plan = { empty: false, tree: t, result, inputs: {}, months: [], monthly: new Map(), failed: [], prevWeek: new Map([[t.nodes[0], 45]]) };
  const [row] = negRowsFromPlan(plan);
  near(row.actPw, 0.45, 1e-12, 'өмнөх 7 хоног 0–1');
  near(row.gainWk, 0.15, 1e-12, 'өсөлт = 0.60 − 0.45');
  const [row2] = negRowsFromPlan({ ...plan, prevWeek: undefined });
  assert.equal(row2.actPw, null, 'архив алга → хоосон');
  assert.equal(row2.gainWk, null);
  console.log('✅ 5. өмнөх 7 хоног');
}

console.log('weekly11.check: бүгд ✅');
