/**
 * БИЕТ ГҮЙЦЭТГЭЛИЙН «МЭДЭЭЛЭЛГҮЙ ≠ 0%» — ЖИВЭЭР шалгана.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/phys.check.mjs
 *
 * Хамгаалж буй алдаа (2026-08-27): `MonthPt.phys` нь бөглөгдөөгүй сард 0
 * буцаадаг байв. Үр дүнд нь «Гүйцэтгэлийн явц» график дээр:
 *   · бөглөгдөөгүй багц (жиш. Багц 2) дээр «Бодит гүйцэтгэл» ба «Зөрүү»
 *     ХОЁУЛАА чимээгүй алга болж, зөвхөн төлөвлөгөөний тасархай шугам үлддэг;
 *   · бөглөгдсөн багц дээр эхний ЖИНХЭНЭ 0%-ийн саруудыг `> 0` шүүлт таслаж,
 *     муруй хожуу сараас эхэлдэг байв.
 *
 * ⚠️ 2026-09-25: ХУУЛБАР БИШ — `Finance.loadFinDataRaw`-ийн бүтээлт
 *    `src/lib/finPhys.ts`-д гарсан тул тэр функцийг ШУУД импортолно. Урьд нь
 *    энд логикийн гар хуулбар байсан (дээрээс нь `cfMonthAxis()` нь МӨР
 *    буцаадаг атал `m.label`-ийг уншдаг байсан тул ирээдүйн сарын шүүлт огт
 *    ажилладаггүй байв).
 * ⚠️ 2026-09-25: ШИНЭ ДҮРМҮҮД (`finPhys.ts`-ийн толгой): тогтмол хуваагч ·
 *    давтсан (carry-forward) цэггүй · хэмжилтийн огноо (`physAt`). Эдгээрийг
 *    доорх ОФФЛАЙН жишээгээр батална (амьд өгөгдлөөс үл хамаарна).
 *
 * ⚠️ ХАТУУ ТОО ТАВИХГҮЙ: гүйцэтгэл дөнгөж орж эхэлж байгаа тул «≥N багц»
 *    гэсэн хязгаар өгөгдөл бөглөгдөх хүртэл улаан байх бөгөөд жинхэнэ
 *    эвдрэлийг далдална. ДҮРЭМ дээр л тогтоно.
 */
import assert from 'node:assert/strict';
import { loadBlockHistory, progressSeries } from '../lib/blockProgress.ts';
import { buildPhys } from '../lib/finPhys.ts';
import { cfMonthAxis } from '../lib/services.ts';

/* ── 0. ОФФЛАЙН ДҮРЭМ ── */
{
  const axis = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
  const hist = new Map([
    /* A: 01-д 10%, 03-д 30% */
    ['Багц 9|9/1', [{ date: '2026-01-10', pct: 10 }, { date: '2026-03-05', pct: 30 }]],
    /* B: 02-д анх 20% */
    ['Багц 9|9/2', [{ date: '2026-02-20', pct: 20 }]],
    /* C: 01-д 90%, 02-д цэвэрлэгдсэн (null) — ⚠️ 2026-10-12: `latest` дүрмээр 02-оос 0%, хуваагчид ОРНО */
    ['Багц 9|9/3', [{ date: '2026-01-15', pct: 90 }, { date: '2026-02-01', pct: null }]],
    /* Бүгд null багц — Map-д ОРОХГҮЙ */
    ['Багц 8|8/1', [{ date: '2026-01-01', pct: null }]],
  ]);
  const { phys, physCnt, physAt } = buildPhys(hist, axis, '2026-04');
  const k = [...phys.keys()].find((x) => x.includes('9'));
  assert.ok(k, 'Багц 9 Map-д байх ёстой');
  assert.equal(phys.size, 1, 'бүгд null багц Map-д орохгүй (null ≠ 0)');
  const m = phys.get(k);
  /* ТОГТМОЛ хуваагч = 3 (A, B, C); B хараахан тайлагнаагүй сард 0%; C цэвэрлэгдсэнээс хойш 0% */
  assert.equal(m.get('2026-01'), (10 + 0 + 90) / 3, '01: A=10, B=0, C=90');
  assert.equal(m.get('2026-02'), (10 + 20 + 0) / 3, '02: A=10, B=20, C=0 (цэвэрлэгдсэн → тэр агшинд 0)');
  assert.equal(m.get('2026-03'), (30 + 20 + 0) / 3, '03: A=30, B=20, C=0');
  /* ДАВТСАН цэг гарахгүй: 04-д шинэ бичилт алга; 05 нь ирээдүй */
  assert.equal(m.has('2026-04'), false, 'шинэ бичилтгүй сард цэг ГАРАХГҮЙ (carry-forward биш)');
  assert.equal(m.has('2026-05'), false, 'ирээдүйн сард цэг гарахгүй');
  assert.equal(physCnt.get(k).get('2026-01'), 3, 'хуваагч тогтмол 3');
  assert.equal(physCnt.get(k).get('2026-03'), 3, 'хуваагч тогтмол 3');
  /* Хэмжилтийн огноо — тухайн цэгийн хамгийн сүүлийн бичилт */
  assert.equal(physAt.get(k).get('2026-01'), '2026-01-15');
  assert.equal(physAt.get(k).get('2026-02'), '2026-02-20');
  assert.equal(physAt.get(k).get('2026-03'), '2026-03-05');
  console.log('phys.check: оффлайн дүрэм ok (тогтмол хуваагч · давталтгүй · physAt)');

  /* ⚠️ 2026-10-12 (гүйцэтгэлийн аудит): цэвэрлэгдсэн (`null`) бичилт — жагсаалт (`buildPhys`) ба
     дашбоардын цуваа (`progressSeries('latest')`) НЭГ тоо. Урьд нь buildPhys сүүлийн бичилт нь null
     блокийг бүх сараас хасч, бусад блокт null-ыг алгасаж өмнөх утгыг авдаг (90 → 90), цуваа 90 → 0. */
  {
    const h2 = new Map([
      ['Багц 9|9/1', [{ date: '2026-01-10', pct: 40 }, { date: '2026-02-05', pct: null }, { date: '2026-03-02', pct: 60 }]],
      ['Багц 9|9/2', [{ date: '2026-01-20', pct: 20 }]],
    ]);
    const b = buildPhys(h2, axis, '2026-04');
    const mb = b.phys.get('БАГЦ9');
    assert.equal(mb.get('2026-01'), (40 + 20) / 2, '01: 30');
    assert.equal(mb.get('2026-02'), (0 + 20) / 2, '02: цэвэрлэгдсэн блок тэр агшинд 0 (өмнөх 40-өөр НӨХӨХГҮЙ)');
    assert.equal(mb.get('2026-03'), (60 + 20) / 2, '03: дахин утга орвол тоологдоно');
    assert.equal(b.physAt.get('БАГЦ9').get('2026-02'), '2026-02-05', 'null бичилт ч «шинэ бичилт» — цэг ба огноо');
    const series = progressSeries(h2, [...h2.keys()], 'month', 'latest');
    assert.deepEqual(
      series.map((p) => [p.label, p.overall]),
      ['2026-01', '2026-02', '2026-03'].map((l) => [l, mb.get(l)]),
      'buildPhys == progressSeries(latest) — сар бүр',
    );
    /* Explicit clearing after a measurement resets both monthly and daily history. */
    const h3 = new Map([['Багц 9|9/1', [{ date: '2026-01-10', pct: 40 }, { date: '2026-02-05', pct: null }]]]);
    const b3 = buildPhys(h3, axis, '2026-04');
    assert.equal(b3.phys.get('БАГЦ9').get('2026-02'), 0, 'clearing must stop carry-forward');
    assert.equal(progressSeries(h3, [...h3.keys()], 'month', 'latest').find((p) => p.label === '2026-02').overall, 0);
    assert.equal(progressSeries(h3, [...h3.keys()], 'day', 'latest').at(-1).overall, 0);
    assert.equal(progressSeries(h3, [...h3.keys()], 'day', 'peak').at(-1).overall, 40, 'peak mode unchanged');
    const never = new Map([['Багц 9|9/1', [{ date: '2026-01-10', pct: null }]]]);
    assert.deepEqual(progressSeries(never, [...never.keys()], 'day', 'latest'), [], 'never measured is not zero');
    assert.equal(buildPhys(never, axis, '2026-04').phys.size, 0);
    console.log('phys.check: цэвэрлэгдсэн бичилт ok (latest дүрэм · цуваатай нэг тоо)');
  }

  /* ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): блокийн ХУВААРЬ (`universe`) өгвөл хуваагч нь
     багцын БҮХ блок — тайлагнаагүй блок 0%. Дээрх (хуваарьгүй) тохиолдол нь нөөц зам. */
  const uni = new Map([
    ['БАГЦ9', ['БАГЦ9|9/1', 'БАГЦ9|9/2', 'БАГЦ9|9/3', 'БАГЦ9|9/4']],
    ['БАГЦ8', ['БАГЦ8|8/1', 'БАГЦ8|8/2']],
  ]);
  const u = buildPhys(hist, axis, '2026-04', uni);
  const mu = u.phys.get('БАГЦ9');
  /* 9/3 (цэвэрлэгдсэн) ба 9/4 (огт тайлагнаагүй) — 0%-иар хуваарьт: хуваагч 4 */
  assert.equal(mu.get('2026-03'), (30 + 20 + 0 + 0) / 4, '03: хуваагч = хуваарийн 4 блок');
  assert.equal(u.physCnt.get('БАГЦ9').get('2026-03'), 4);
  assert.equal(u.physN.get('БАГЦ9'), 4);
  /* Огт тайлагнаагүй багц — `phys`-д цэггүй («тайлагнасан багц» биш), `physN`-д 0%-ийн хуваарь */
  assert.equal(u.phys.has('БАГЦ8'), false, 'тайлагнаагүй багц цэг үүсгэв');
  assert.equal(u.physN.get('БАГЦ8'), 2);
  /* РЕГРЕСС: 4 блокийн зөвхөн A нь 100% → 25% */
  const r = buildPhys(
    new Map([['Багц 7|A', [{ date: '2026-03-01', pct: 100 }]]]),
    axis, '2026-04', new Map([['БАГЦ7', ['БАГЦ7|A', 'БАГЦ7|B', 'БАГЦ7|C', 'БАГЦ7|D']]]),
  );
  assert.equal(r.phys.get('БАГЦ7').get('2026-03'), 25, '4 блокийн 1 нь 100% → 25% (100% БИШ)');
  console.log('phys.check: блокийн хуваарь ok (тайлагнаагүй блок/багц 0%)');
}

/* ── 1+. АМЬД ӨГӨГДӨЛ ──
   ⚠️ 2026-10-26 (CI уналт f26c7f9): Enterprise хүрэгдэхгүй / амьд шалгалт алгасагдсан (`SELBE_LIVE_SKIP`) үед энэ
   хэсгийг алгасна — урьд нь хүсэлт устгагдсан AGOL руу явж хурдан алдаа авдаг тул анзаарагддаггүй байв. */
if (process.env.SELBE_LIVE_SKIP === '1') {
  console.log(`⏭ phys.check: амьд хэсэг алгасав (${process.env.SELBE_LIVE_SKIP_REASON || 'Enterprise хүрэгдэхгүй'})`);
} else {
const AXIS = cfMonthAxis();
const hist = await loadBlockHistory();
const now = new Date();
const nowYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const { phys, physAt } = buildPhys(hist, AXIS, nowYm);

/** `contractMonths`-ийн ЯГ тэр мөр: байхгүйг `null`, 0-ээр НӨХӨХГҮЙ */
const monthsOf = (k) => {
  const ph = phys.get(k);
  return AXIS.map((label) => ({ label, phys: ph?.get(label) ?? null }));
};

/* 1. Бүртгэлгүй багц — БҮХ сар `null`, нэг ч 0 БАЙХГҮЙ */
const empty = monthsOf('ЭНЭ_БАГЦ_БАЙХГҮЙ');
assert.equal(empty.length, AXIS.length, 'сарын тоо тэнхлэгтэй таарах ёстой');
assert.ok(empty.every((m) => m.phys === null),
  'бүртгэлгүй багцын сар бүр null байх ёстой — 0 бол «биет гүйцэтгэл тэг» гэсэн ХУДАЛ уншилт');

/* 2. Бүртгэлтэй багц бүр — `null` ба тоо ЯЛГАГДАНА, хувь нь хүрээндээ */
let withData = 0, zeroMeasured = 0, points = 0;
for (const k of phys.keys()) {
  const ms = monthsOf(k);
  const meas = ms.filter((m) => m.phys != null);
  if (!meas.length) continue;
  withData += 1;
  for (const m of meas) {
    points += 1;
    assert.ok(Number.isFinite(m.phys), `${k} · ${m.label}: тоо биш утга (${m.phys})`);
    assert.ok(m.phys >= -0.001 && m.phys <= 100.001, `${k} · ${m.label}: хувь хүрээнээс гарав (${m.phys})`);
    if (m.phys === 0) zeroMeasured += 1;
    /* Хэмжилтийн огноо нь ТУХАЙН сард (давтсан цэг биш) */
    const at = physAt.get(k)?.get(m.label);
    assert.ok(at && at.slice(0, 7) === m.label, `${k} · ${m.label}: physAt (${at}) тухайн сард биш`);
  }
  /* Хэмжилт нь ирээдүйн сард ОРОХГҮЙ */
  for (const m of ms) {
    if (m.label > nowYm) assert.equal(m.phys, null, `${k} · ${m.label}: ирээдүйн сард хэмжилт байж болохгүй`);
  }
}

/* 3. `null` нь `0`-ээс ЯЛГАГДАЖ байгааг ил баталгаажуулна */
const anyKey = [...phys.keys()].find((k) => monthsOf(k).some((m) => m.phys != null));
if (anyKey) {
  const anyMonths = monthsOf(anyKey);
  const nulls = anyMonths.filter((m) => m.phys === null).length;
  const nums = anyMonths.filter((m) => m.phys != null).length;
  assert.ok(nums > 0, 'дор хаяж нэг хэмжигдсэн сар байх ёстой');
  assert.ok(nulls + nums === anyMonths.length, 'сар бүр null эсвэл тоо — гуравдахь төлөв байхгүй');
}

console.log(
  `phys.check: ok — ${withData}/${phys.size} багц хэмжигдсэн · ${points} цэг`
  + ` · жинхэнэ 0% ${zeroMeasured} (эдгээр нь ХЭМЖИЛТ, null-аас ялгаатай)`,
);
}
