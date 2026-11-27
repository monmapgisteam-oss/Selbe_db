/**
 * 2026-11-11-НИЙ 5 САЙЖРУУЛАЛТЫН ЦЭВЭР ШАЛГУУР (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/weekly11.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. Батлах үеийн өсөлт (`fillGainOf`): блок · багц (төсвийн жингээр, мэдэгдээгүй жин = дундаж) · төсөл (G × өсөлт,
 *      «А.» бэлтгэлийн блокоор нэмэгдэнэ); блокгүй хуудас — ганц блок.
 *   2. Бэлтгэл ажил: бөглөх хуудасгүй мөр нийлбэр, жинд орохгүй (`skip`), хуудастай нь 100% жинтэй болно.
 *   3. Зураг төслийн жин: мөнгөтэй бүлэгт жин мөнгөөр (2026-11-16); мөнгөгүй бүлэгт гараар оруулсан жин.
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
  /* 2026-11-24: өөрчлөлтгүй бөглөлт — «тооцоолж чадсангүй» (null → «—») биш, 0 (→ «+0.00%») */
  const z = fillGainOf('Багц 2', ['5/1', '5/2'], [null, null], [null, null], false, universe, weights, { nodes, gOf: (n) => G.get(n) ?? null });
  assert.equal(z.pkg, 0, 'өөрчлөлтгүй → багц 0');
  assert.equal(z.project, 0, 'өөрчлөлтгүй → төсөл 0 (null биш)');
  assert.equal(fillGainOf('Багц 6.1', ['Ажил'], [null], [null], true, null, null, null).pkg, 0, 'блокгүй, өөрчлөлтгүй → 0');
  assert.equal(fillGainOf('Багц 2', ['5/1'], [0], [null], false, universe, weights, { nodes: [], gOf: () => 1 }).project, null, 'ТТБ-д мөр алга → тооцоолоогүй (—)');
  assert.equal(fillGainOf('Багц 2', ['5/1'], [0], [null], false, universe, weights, null).project, null, 'ТТБ уншигдаагүй → тооцоолоогүй (—)');
  {
    const { readFileSync } = await import('node:fs');
    const gs = readFileSync(new URL('../modules/Guitsetgel.tsx', import.meta.url), 'utf8');
    assert.ok(gs.includes('const signed = (v: number, d: number): string => (v < 0 ? `−${pct(-v, d)}` : `+${pct(v > 0 ? v : 0, d)}`);'), 'Guitsetgel: 0 → «+0.00%»');
  }
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
  near(computePlan(z).get('2.1').F, 90, 1e-9, 'мөнгөтэй бүлэг — гараар оруулсан 20% биш, мөнгөөр 90% (2026-11-16)');
  const z0 = buildTree([
    R(10, '2', null, { uy_shat: 'Ажлын зураг төсөл', ajil_uilchilgee: 'Ажлын зураг төсөл' }),
    R(11, '2.1', '2', { heseg_ezleh_huvi: 0.2 }),
    R(12, '2.2', '2', { heseg_ezleh_huvi: 0.8 }),
  ]);
  near(computePlan(z0).get('2.1').F, 20, 1e-9, 'мөнгөгүй бүлэг — гараар оруулсан жин');
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
  /* 2026-11-27: (өнөөдөр, asOf] мужийн энэ долоо хоногт орох өдрүүд — энэ долоо хоногийн оруулгаар, ирэх долоо хоногт орох
     өдрүүд — ирэх долоо хоногийн оруулгаар (долоо хоног бүрт өдөрт оруулга ÷ 7). Лхагваас: энэ долоо хоногт 5, ирэхэд 2 өдөр. */
  const e2 = [{ week: D('2026-11-09'), obyem: 14, oid: 2 }, ...e];
  near(weekPct(e2, 100, T + 7 * DAY, base, T), 0.2 + (14 * 5 / 7 + 30 * 2 / 7) / 100, 1e-12, 'Лхагва: 5/7 энэ + 2/7 ирэх');
  near(weekPct(e, 100, T + 7 * DAY, base, T), 0.2 + (30 * 2 / 7) / 100, 1e-12, 'энэ долоо хоногийнх алга — ирэхийн 2/7 л');
  /* Даваа гараг 2026-11-30: 11-30 = 50, 12-07 = 70, обьём 700, суурь 40% → 7 хоног бүгд энэ долоо хоногт: 40 + 50/700 ≈ 47.1% */
  const mon = D('2026-11-30');
  const em = [{ week: D('2026-11-30'), obyem: 50, oid: 3 }, { week: D('2026-12-07'), obyem: 70, oid: 4 }];
  near(weekPct(em, 700, mon + 7 * DAY, () => 0.4, mon), 0.4 + 50 / 700, 1e-12, 'Даваа — энэ долоо хоногийн утгаар (50% биш)');
  /* Баасан 2026-11-27-нд 11-30-нд оруулсан утга: 3 өдөр энэ (11-23), 4 өдөр ирэх (11-30) */
  const fri = D('2026-11-27');
  near(weekPct([{ week: D('2026-11-23'), obyem: 21, oid: 5 }, { week: D('2026-11-30'), obyem: 70, oid: 6 }], 700, fri + 7 * DAY, () => 0.4, fri),
    0.4 + (21 * 3 / 7 + 70 * 4 / 7) / 700, 1e-12, 'Баасан — 3/7 энэ + 4/7 ирэх');
  assert.equal(weekPct(e2, 100, T, base, T), undefined, 'өнөөдрийн төлөвлөгөөт хувийг хөндөхгүй');
  /* 2026-11-18: 7 хоногийн доторх өдрүүдэд шугаман — маргааш бүтэн обьём үсэрч нэмэгдэхгүй */
  near(weekPct(e2, 100, T + 1 * DAY, base, T), 0.2 + 0.14 / 7, 1e-12, 'маргааш = суурь + энэ долоо хоногийн обьёмын 1/7');
  near(weekPct(e2, 100, T + 6 * DAY, base, T), 0.2 + (14 * 5 / 7 + 30 / 7) / 100, 1e-12, 'ирэх долоо хоногийн 1 өдөр');
  assert.ok(weekPct(e2, 100, T + 2 * DAY, base, T) < weekPct(e2, 100, T + 6 * DAY, base, T), 'өдөр ахих тусам өснө');
  assert.equal(weekPct(e2, 100, T - 7 * DAY, base, T), undefined, 'өнгөрсөн өдрийг хөндөхгүй');
  assert.equal(weekPct(e2, 100, T + 30 * DAY, base, T), undefined, '7 хоногоос цааш — суурь');
  assert.equal(weekPct(e, 100, D('2026-11-25') + 7 * DAY, base, D('2026-11-25')), undefined, 'өнгөрсөн долоо хоногийн оруулга үлдэгдэл нөлөөгүй');
  near(weekPct([{ week: D('2026-11-09'), obyem: 14, oid: 2 }], 100, T + 7 * DAY, base, T), 0.3, 1e-12, 'ирэх долоо хоногийнх алга — энэ долоо хоногийн 5/7');
  near(weekPct(e, 100, T + 2 * DAY, () => 0.25, T), 0.25, 1e-12, 'оруулгагүй хэсэгт суурь (base(asOf))-аас доош орохгүй');
  assert.equal(weekPct(e2, null, T + 7 * DAY, base, T), undefined, 'нийт обьёмгүй — суурь');
  near(weekPct([{ week: D('2026-11-16'), obyem: 5000, oid: 1 }], 100, T + 7 * DAY, base, T), 1, 1e-12, '100%-аар таслана');
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
  /* 2026-11-27: энэ ба ирэх долоо хоногт ижил 30 — гарагаас үл хамааран 7 хоногт бүтэн 30 */
  const wk = (ms) => new Date(ms).toISOString().slice(0, 10);
  const pwNow = toPkgWeek([
    { attributes: { objectid: 5, des_dugaar: 7, blok: '5/1', sar: wk(nextWeekStart(now)), obyem: 30 } },
    { attributes: { objectid: 6, des_dugaar: 7, blok: '5/1', sar: wk(weekStart(now)), obyem: 30 } },
  ]);
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

/* 2026-11-27 (засвар №45): оруулгын цонхны тайлбар ба толгой тайлбар нь `weekPct`-ийн өдөр тутмын дүрмийг хэлнэ
   («бүтнээр нэмнэ» гэх хуучин амлалт үлдэхгүй) */
{
  const { readFileSync } = await import('node:fs');
  const pm = readFileSync(new URL('../modules/huvaari/PlanModal.tsx', import.meta.url), 'utf8');
  assert.ok(!pm.includes('сарын төлөвлөгөөн дээр энэ обьёмыг нэмж бодогдоно'), 'хуучин «бүтнээр нэмнэ» тайлбар алга');
  assert.ok(pm.includes('тухайн долоо хоногийн обьёмын 1/7'), 'өдөр бүрд 1/7');
  const ho = readFileSync(new URL('./huvaariObyem.ts', import.meta.url), 'utf8');
  assert.ok(!ho.includes('оруулсан обьём ÷ нийт обьём (бүтнээр)'), 'толгой тайлбар шинэчлэгдсэн');
  console.log('✅ 6. оруулгын тайлбар — өдөр тутмын дүрэм');
}

console.log('weekly11.check: бүгд ✅');
