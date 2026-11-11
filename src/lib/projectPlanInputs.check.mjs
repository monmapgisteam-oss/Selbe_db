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
 *   4. ГАЗАР (2026-11-11). Хувь зөвхөн үе шатын мөрөнд (төслийн нийт, landTotal); багц/блокийн мөр null.
 *   5. Excel мөр алга → хоосон төлөв (алдаа биш); бүтэн фикстураар adapter-ууд computePlan-д зөв урсана.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  toStoredRow, compareDdKod, sortPlanRows,
  blockActualOf, prepActualOf, pkgActualOf, blockPlannedOf, makeSchedules, monthlyOf, makeDateSpans, linkPlanDates,
  assemblePlan, emptyPlan, planMonths, liveProgressOf, pkgPlannedOf, pkgSpanOf, CF_SHEET_GROUP, __test,
} from './projectPlanInputs.ts';
import { bagtsKey } from './services.ts';
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
    zahiramj_unet_tsaas: '500', ZAHIRAMJ_NZD_NUUTS: '',
  });
  assert.equal(r.zahiramj_unet_tsaas, 500, 'эх үүсвэр — мөрөөр ирсэн тоо (2026-11-03)');
  assert.equal(r.zahiramj_nzd_nuuts, null, 'хоосон эх үүсвэр null (0 биш)');
  assert.equal(r.zahiramj_borluulalt_dun, null, 'ирээгүй эх үүсвэр null');
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

  /* 2026-11-05: Бэлтгэл ажлын блок — «А. Бэлтгэл ажил» (`prep`: тусдаа `PrepMap`, `blocks`-оос хамааралгүй): бичлэгтэй →
     утга (хоосон нүд 0); «Б.» хоосон тул `blocks`-д байхгүй блок ч `prep`-ээс (Багц-4.2 6/6 = 80); бичлэггүй атлаа
     хуваарьт → 0; хуваарьт ч үгүй → undefined; эх унасан/алга → null */
  const prep = new Map([
    ['БАГЦ1|5/1', 87.5],
    ['БАГЦ42|6/1', null],
    ['БАГЦ42|6/6', 80],
  ]);
  const pa = prepActualOf({ blocks, universe, infra, prep });
  assert.equal(pa('Багц-1', '5/1'), 87.5, 'А. мөрийн ялагч нүд');
  assert.equal(pa('Багц-4.2', '6/1'), 0, 'хуудас байгаа, А. нүд хоосон → 0');
  assert.equal(pa('Багц-4.2', '6/6'), 80, '«Б.» хоосон (blocks-д алга) блок ч А. утгаа авна');
  assert.equal(pa('Багц-4.2', '5/1'), 0, 'хуваарьт байгаа, бичлэггүй → 0');
  assert.equal(pa('Багц-4.2', '6/9'), undefined, 'хуваарьт ч үгүй → undefined (хадгалсан утга)');
  assert.equal(prepActualOf({ blocks, universe, infra, prep: null })('Багц-1', '5/1'), null, 'эх унасан → null');
  assert.equal(prepActualOf({ blocks, universe, infra })('Багц-1', '5/1'), null, 'prep алга → null');
  assert.equal(prepActualOf({ blocks, universe: null, infra, prep })('Багц-4.2', '5/1'), null, 'хуваарь унасан, бичлэггүй → null');
  console.log('✅ 2. бодит гүйцэтгэл — түлхүүр, 0 vs мэдэхгүй vs унасан · бэлтгэлийн «А.»');
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
  assert.equal(bp('Багц-4.1', 'Бүгд', D('2026-02-05')), undefined, '«Бүгд» хуваарьгүй → undefined');
  assert.equal(blockPlannedOf(null)('Багц-4.1', 'Бүгд', D('2026-02-05')), null, '«Бүгд» + хуваарь унасан → null');
  {
    const whole = makeSchedules([{ ...nine, key: 'w', group: 'Багц 4-1', bld: ['Бүгд'] }]);
    near(blockPlannedOf(whole)('Багц-4.1', 'Бүгд', D('2026-01-10')), 75, 1e-9, '«Бүгд» Хуваарьт орвол тэндээс');
  }
  /* сарын задаргаа (monthly) нь `planPct`-ийн үүрэгтэй */
  const withM = makeSchedules([{ ...nine, monthly: (des, blok) => (blok === '5/1' ? 0.5 : null) }]);
  near(withM.at('Багц 4-2', '5/1', D('2026-01-05')), 50, 1e-9, 'сарын задаргаа огнооноос давамгайлна');
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
  {
    const ds = makeDateSpans([nine], ['БАГЦ41']);
    assert.deepEqual(ds.get('Багц-4.2', '5/1', 'barilga').guits, [D('2026-01-01'), D('2026-02-10')], 'Б. дэд мод MIN/MAX');
    assert.deepEqual(ds.get('Багц-4.2', '5/1', 'barilga').geree, [null, null], 'гэрээний огноо хоосон → хоосон');
    assert.deepEqual(ds.get('Багц-4.2', '5/1', 'beltgel').guits, [D('2025-01-01'), D('2025-01-31')], 'А. мөр → бэлтгэл');
    /* 10 хуудасны 9-д дугаар ЛАТИН «A» — кирилл жиших үед бэлтгэлийн огноо алга болж 5.1-ийн төлөвлөгөөт хувь 3.44 байв */
    const latin = { ...nine, group: 'Багц 1', rows: nine.rows.map((r) => (r.oid === 1 ? { ...r, no: 'A. БЭЛТГЭЛ АЖИЛ' } : r)) };
    assert.deepEqual(makeDateSpans([latin]).get('Багц-1', '5/1', 'beltgel').guits, [D('2025-01-01'), D('2025-01-31')], 'латин A. мөр → бэлтгэл');
    assert.deepEqual(ds.get('Багц-4.2', '6/1', 'barilga').guits, [null, null], 'огноогүй блок → хоосон');
    assert.deepEqual(ds.get('Багц-4.2', '6/2', 'barilga').guits, [null, null], 'урвуу · sane биш хос хаягдана');
    assert.deepEqual(ds.get('Багц-4.2', 'Бүгд', 'barilga').guits, [D('2026-01-01'), D('2026-02-10')], '«Бүгд» = багцын MIN/MAX');
    assert.deepEqual(ds.get('Багц-4.2', null, 'barilga').guits, [D('2026-01-01'), D('2026-02-10')], 'блокгүй мөр = багцын MIN/MAX');
    assert.equal(ds.get('Багц-9.1', '1', 'barilga'), undefined, 'хуудасгүй багц → undefined (хоосон)');
    assert.equal(ds.get('БАГЦ 1-4', null, 'barilga'), undefined, 'олон багц → undefined');
    assert.equal(ds.get('Багц-4.1', '5/1', 'barilga'), null, 'хуудас уншигдаагүй → null (хадгалсан хэвээр)');
    const t = buildTree([
      { objectid: 1, dd_kod: '1', uy_shat: 'Газар чөлөөлөлт', ajil_uilchilgee: 'Газар', gazar_ehleh: D('2025-01-01'), gazar_duusah: D('2025-06-01'), geree_ehleh: D('2025-01-01'), geree_duusah: D('2025-12-31') },
      { objectid: 2, dd_kod: '2', uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'Барилга угсралт', geree_ehleh: D('2025-01-01'), geree_duusah: D('2027-12-31'), guits_ehleh: D('2025-01-01'), guits_duusah: D('2027-12-31') },
      { objectid: 3, dd_kod: '2.1', etseg_kod: '2', uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'Барилга угсралтын ажил' },
      { objectid: 4, dd_kod: '2.1.1', etseg_kod: '2.1', uy_shat: 'Барилга угсралт', bagts: 'Багц-4.2', blok: '5/1', ajil_uilchilgee: 'блок', geree_ehleh: D('2025-01-01'), guits_ehleh: D('2025-02-01'), guits_duusah: D('2025-03-01') },
      { objectid: 5, dd_kod: '2.1.2', etseg_kod: '2.1', uy_shat: 'Барилга угсралт', bagts: 'Багц-9.1', ajil_uilchilgee: 'хуудасгүй', guits_ehleh: D('2025-02-01'), guits_duusah: D('2025-03-01') },
    ]);
    const L = new Map(linkPlanDates(t, ds).map((r) => [r.objectid, r]));
    assert.equal(L.get(1).gazar_ehleh, D('2025-01-01'), '2026-11-04: «Газар чөлөөлөлтийн огноо» хуудсанд оруулсан огноо хадгалагдана');
    assert.equal(L.get(1).geree_ehleh, D('2025-01-01'), 'бусад үе шатны гэрээний огноо хөндөгдөхгүй');
    assert.equal(L.get(2).geree_ehleh, D('2025-01-01'), '2026-11-05: барилга угсралтын эцэг мөрийн хадгалсан ГЭРЭЭНИЙ огноо хэвээр (Хуваарь зөвхөн навчид)');
    assert.deepEqual([L.get(2).guits_ehleh, L.get(2).guits_duusah], [null, null], 'эцэг мөрийн гүйцэтгэгчийн огноо хоосон — блокуудын Хуваариас нэгтгэгдэнэ');
    assert.deepEqual([L.get(4).guits_ehleh, L.get(4).guits_duusah, L.get(4).geree_ehleh], [D('2026-01-01'), D('2026-02-10'), null], 'блок = Хуваарь (хоосон ч)');
    assert.deepEqual([L.get(5).guits_ehleh, L.get(5).guits_duusah], [null, null], 'хуудасгүй багц хоосон');
    const keep = new Map(linkPlanDates(t, null).map((r) => [r.objectid, r]));
    assert.equal(keep.get(4).guits_ehleh, D('2025-02-01'), 'Хуваарь уншигдаагүй → хадгалсан хэвээр');
  }
  /* 2026-11-06: мөр ба сарын задаргаа хоёулаа унавал нэг хуудас `failed`-д НЭГ удаа (мэдэгдэлд давхардахгүй) */
  assert.match(readFileSync(new URL('./projectPlanInputs.ts', import.meta.url), 'utf8'), /failed: \[\.\.\.new Set\(failed\)\]\.map\(\(k\) => `schedule:\$\{k\}`\)/, 'schedule: түлхүүр давхардахгүй');
  /* 2026-11-06: олон багцын нэртэй мөр (`cashflow_id` 18 · 42) өөрийн хүснэгттэйгээ холбогдоно; бусад диапазон мөр хэвээр */
  {
    const G = 'Суурийн холболтын ажил';
    assert.equal(CF_SHEET_GROUP.get(18), G);
    const sheet = {
      key: 'suuri', group: G, bld: ['Ажил'],
      rows: [
        srow({ oid: 1, no: 'Б', depth: 0, group: true, start: [null], end: [null] }),
        srow({ oid: 2, no: '1', depth: 1, start: [D('2026-05-30')], end: [D('2026-12-30')] }),
      ],
    };
    const t = buildTree([
      { objectid: 1, dd_kod: '5', uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'Барилга угсралт' },
      { objectid: 2, dd_kod: '5.2', etseg_kod: '5', uy_shat: 'Барилга угсралт', ajil_uilchilgee: 'Барилга угсралт ажил' },
      { objectid: 3, dd_kod: '5.2.8', etseg_kod: '5.2', uy_shat: 'Барилга угсралт', bagts: 'БАГЦ 1- 4', cashflow_id: 18, ajil_uilchilgee: G, ho_dun_geree: 10 },
      { objectid: 4, dd_kod: '5.2.9', etseg_kod: '5.2', uy_shat: 'Барилга угсралт', bagts: 'БАГЦ 1- 6', cashflow_id: 99, ajil_uilchilgee: 'Өөр диапазон', ho_dun_geree: 10, guits_ehleh: D('2026-01-01'), guits_duusah: D('2026-02-01') },
    ]);
    const ds = makeDateSpans([sheet]);
    const L = new Map(linkPlanDates(t, ds).map((r) => [r.objectid, r]));
    assert.deepEqual([L.get(3).guits_ehleh, L.get(3).guits_duusah], [D('2026-05-30'), D('2026-12-30')], 'мөр 18 — хүснэгтийн огноо');
    assert.deepEqual([L.get(4).guits_ehleh, L.get(4).guits_duusah], [null, null], 'бусад диапазон мөр — урьдын дүрэм');
    const n18 = t.nodes.find((n) => n.row.objectid === 3);
    const n99 = t.nodes.find((n) => n.row.objectid === 4);
    const infra = new Map([[bagtsKey(G), { pct: 50, blocks: 1, total: 1 }]]);
    const pa = pkgActualOf({ blocks: new Map(), universe: new Map(), infra });
    assert.equal(pa('БАГЦ 1- 4', n18), 50, 'мөр 18 — хүснэгтийн гүйцэтгэл');
    assert.equal(pa('БАГЦ 1- 4'), undefined, 'зангилаагүй/бусад — диапазон хоосон түлхүүр');
    assert.equal(pa('БАГЦ 1- 6', n99), undefined);
    const sc = makeSchedules([sheet]);
    near(pkgPlannedOf(sc)('БАГЦ 1- 4', D('2026-12-30'), n18), 100, 1e-9, 'мөр 18 — хүснэгтийн төлөвлөгөө');
    assert.equal(pkgPlannedOf(sc)('БАГЦ 1- 6', D('2026-12-30'), n99), undefined);
    assert.deepEqual(pkgSpanOf(sc)('БАГЦ 1- 4', n18), [D('2026-05-30'), D('2026-12-30')], 'мөр 18 — L/M');
  }
  console.log('✅ 3. хуваарь — блок бүрээр, хуваарьгүй null, 9F давамгайлал, алдаатай огноо, огнооны муж');
}

/* ══════════ 5. Нэгтгэл — фикстур ба хоосон төлөв ══════════ */
{
  const today = D('2026-10-26');
  const e = emptyPlan(today);
  assert.equal(e.empty, true);
  assert.equal(e.tree.nodes.length, 0);
  { const a = ubToday(); const t0 = emptyPlan().result.today; assert.ok([a, ubToday()].includes(t0), 'emptyPlan today = ubToday()'); }
  assert.equal(assemblePlan([], { actual: { blocks: null, universe: null, infra: null }, sched: null }, today).empty, true,
    'Excel мөр алга → хоосон төлөв (алдаа биш)');

  const fx = JSON.parse(readFileSync(new URL('./projectPlan.fixture.json', import.meta.url), 'utf8'));
  const DAY = 86_400_000;
  const fromSerial = (v) => (v == null ? null : (v - 25569) * DAY);
  const s = (i) => (i == null ? null : fx.strs[i]);
  const rows = fx.rows.map((r, i) => ({
    objectid: i + 1, dd_kod: r[0], etseg_kod: r[1], uy_shat: r[2], bagts: s(r[3]), blok: r[4], ajil_uilchilgee: s(r[5]),
    ho_dun_geree: r[6], heseg_ezleh_huvi: r[7], tusul_ezleh_huvi: r[8],
    geree_ehleh: fromSerial(r[9]), geree_duusah: fromSerial(r[10]),
    guits_ehleh: fromSerial(r[11]), guits_duusah: fromSerial(r[12]),
    gazar_ehleh: fromSerial(r[13]), gazar_duusah: fromSerial(r[14]),
  }));
  const tree = buildTree(rows);

  /* stub: Багц 1-ийн бүх блок 50%, Багц-5.1 36%; хуваарь: Багц 1·5/1 л */
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
  const p = assemblePlan(rows, { actual: { blocks, universe, infra }, sched }, today, ['x']);
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
  /* 2026-11-11: багц/блокоор газрын хувь бодохгүй (хадгалсан утга ч биш) */
  assert.equal(g.S, null, 'газар чөлөөлөлтийн блок — хувьгүй');
  const g2 = p.result.values.get(p.tree.nodes[find((n) => n.phase === 'gazar' && n.pkg === 'Багц-1' && n.blok === '5/2' && !n.children.length)]);
  assert.equal(g2.S, null, 'газар чөлөөлөлтийн блок — хувьгүй');
  const inf = p.result.values.get(p.tree.nodes[find((n) => n.phase === 'barilga' && n.sub === 'barilga' && n.pkg === 'Багц-5.1' && !n.children.length)]);
  assert.equal(inf.S, 36, 'блокгүй багц (Багц-5.1 → БАГЦ51)');
  /* 2026-11-04: «Газар чөлөөлөлт» үе шатын мөр — төслийн нийт талбарын тоогоор (landTotal); 2026-11-11: багцын мөр хувьгүй */
  {
    const iPh = find((n) => n.depth === 1 && n.phase === 'gazar');
    assert.ok(iPh >= 0, 'газар чөлөөлөлтийн үе шатын мөр');
    const pw = p.result.values.get(p.tree.nodes[iPh]);
    const pt = assemblePlan(rows, { actual: { blocks, universe, infra }, sched, landTotal: 91.4 }, today);
    const vt = pt.result.values.get(pt.tree.nodes[iPh]);
    assert.equal(vt.S, 91.4, 'үе шатын мөр = landTotal');
    assert.equal(pw.S, null, 'landTotal-гүй бол хувьгүй (багцын мөрүүд null)');
    assert.equal(pt.result.values.get(pt.tree.nodes[find((n) => n.phase === 'gazar' && n.pkg === 'Багц-1' && n.blok === '5/1' && !n.children.length)]).S, null, 'блокийн мөр хувьгүй');
    const pn = assemblePlan(rows, { actual: { blocks, universe, infra }, sched, landTotal: null }, today);
    assert.equal(pn.result.values.get(pn.tree.nodes[iPh]).S, null, 'landTotal null = хувьгүй');
  }
  /* сарын цуваа */
  assert.equal(p.months.length, planMonths(p.result).length);
  assert.ok(p.months.length > 12, 'сарын тэнхлэг төслийн мужаар');
  const ser = p.monthly.get(node);
  assert.equal(ser.length, p.months.length);
  const iDec = p.months.findIndex((t) => new Date(t).toISOString().startsWith('2026-12'));
  near(ser[iDec], sched.at('Багц 1', '5/1', p.months[iDec]), 1e-12, 'сарын цуваа = Хуваарь');
  assert.ok(p.monthly.get(p.tree.root).some((x) => x != null), 'үндсэн мөрийн цуваа бодогдсон');
  console.log('✅ 5. нэгтгэл — хоосон төлөв, фикстур дээр адаптерууд урсана');

  /* ══════════ 6. Гэрээний АМЬД гүйцэтгэл — liveProgressOf (2026-10-27) ══════════ */
  {
    const iB = find((n) => n.phase === 'barilga' && n.sub === 'barilga' && n.pkg === 'Багц-1' && !n.blok && n.children.length > 0);
    const iG = find((n) => n.phase === 'gazar' && n.pkg === 'Багц-1' && !n.blok && n.children.length > 0);
    assert.ok(iB >= 0 && iG >= 0, 'Багц-1-ийн барилга · газрын багцын мөр');
    tree.nodes[iB].row.cashflow_id = 11;
    tree.nodes[iG].row.cashflow_id = 12;
    /* давхар cashflow_id — pre-order-ийн ЭХНИЙХ (багцын мөр) ялна, блок биш */
    tree.nodes[bi].row.cashflow_id = 11;
    const p2 = assemblePlan(rows, { actual: { blocks, universe, infra }, sched }, today);
    const lv = liveProgressOf(p2);
    assert.deepEqual([...lv.keys()].sort(), [11, 12], 'зөвхөн cashflow_id-тай мөр');
    const vB = p2.result.values.get(p2.tree.nodes[iB]);
    const vG = p2.result.values.get(p2.tree.nodes[iG]);
    assert.equal(lv.get(11).S, vB.S, 'S = мөрийн computePlan S (блокуудын Σ F·X: 5/1 = 50, 5/2 = 0)');
    assert.ok(vB.S != null && vB.S > 0 && vB.S < 50, 'багцын S блокуудын жигнэлт');
    assert.equal(lv.get(11).stages.guitsetgel_huvi, vB.S, 'build = өөрийн S');
    assert.equal(lv.get(11).stages.gazar_chuluulult, null, 'газар — багцаар хувьгүй (2026-11-11)');
    assert.equal(vG.S, null);
    assert.equal(lv.get(11).stages.tezu, null, 'Багц-1-д ТЭЗҮ-ийн мөргүй → null (0 биш)');
    assert.equal(lv.get(12).S, vG.S);
    assert.equal(lv.get(12).stages.guitsetgel_huvi, vG.S);
    assert.equal(liveProgressOf(emptyPlan(today)).size, 0, 'хоосон төлөв → хоосон');
    /* 2026-11-06: «БАГЦ 1- 4» ба «БАГЦ-14» үе шатын хувиа хуваалцахгүй (bagtsKey хоёуланд БАГЦ14) */
    {
      const R = (objectid, dd_kod, etseg_kod, uy_shat, o = {}) => ({ objectid, dd_kod, etseg_kod, uy_shat, ajil_uilchilgee: `w${objectid}`, ...o });
      const r2 = [
        R(1, '4', null, 'Зөвшөөрөл'),
        R(2, '4.1', '4', 'Зөвшөөрөл', { bagts: 'БАГЦ 1- 4', guitsetgel_huvi: 100, heseg_ezleh_huvi: 0.5 }),
        R(3, '4.2', '4', 'Зөвшөөрөл', { bagts: 'БАГЦ-14', guitsetgel_huvi: 20, heseg_ezleh_huvi: 0.5 }),
        R(4, '5', null, 'Барилга угсралт'),
        R(5, '5.2', '5', 'Барилга угсралт', { ajil_uilchilgee: 'Барилга угсралт ажил' }),
        R(6, '5.2.1', '5.2', 'Барилга угсралт', { bagts: 'БАГЦ 1- 4', cashflow_id: 71 }),
        R(7, '5.2.2', '5.2', 'Барилга угсралт', { bagts: 'БАГЦ-14', cashflow_id: 72 }),
      ];
      const lv2 = liveProgressOf(assemblePlan(r2, { actual: { blocks: new Map(), universe: new Map(), infra: new Map() }, sched: null }, today));
      assert.equal(lv2.get(71).stages.zuwshuurul, 100, '«БАГЦ 1- 4» — өөрийн зөвшөөрөл');
      assert.equal(lv2.get(72).stages.zuwshuurul, 20, '«БАГЦ-14» — өөрийн зөвшөөрөл');
    }
    console.log('✅ 6. liveProgressOf — cashflow_id → амьд S · үе шатны хувь');
  }
}

/* 2026-11-04: `geree_*` хүснэгтэд алга — «Гэрээ (хавсралт 5)» ижил мөрийн `guits_*`-ийг авна */
{
  const r = toStoredRow({ objectid: 1, dd_kod: '1', guits_ehleh: 100, guits_duusah: 200, geree_ehleh: 5, geree_duusah: 6 });
  assert.equal(r.guits_ehleh, 100);
  assert.equal(r.geree_ehleh, 100, 'гэрээний эхлэх = guits_ehleh');
  assert.equal(r.geree_duusah, 200, 'гэрээний дуусах = guits_duusah');
}

console.log('projectPlanInputs.check: бүгд ✅');
