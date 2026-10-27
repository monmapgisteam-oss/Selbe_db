/**
 * ТӨСЛИЙН ТӨЛӨВЛӨГӨӨ · БИЕЛЭЛТИЙН ХӨДӨЛГҮҮР — Excel-тэй тулгах шалгуур (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/projectPlan.check.mjs
 *
 * Фикстур (`projectPlan.fixture.json`) = Excel 261007 V3-ын «Төсөл төлөвлөгөө биелэлт»-ийн 905 мөр
 * ХАДГАЛАХ хэлбэрээр (зөвхөн тогтмол нүд, Excel-ийн нэгжээр 0–1) + Excel-ийн өөрийн навч/тогтмол
 * N…S утгууд (`ov`) + томьёотой нүдний кэшлэгдсэн үр дүн (`expect`).
 *
 * Хамгаалж буй алдаанууд:
 *   1. ТОМЬЁО. Нийт · үе шат · багц · блокийн E, F, G, H–M, N–W нь Excel-тэй 1e-9-өөр таарна.
 *      Бүтэн тулгалт (6,308 томьёо нүд) scratch-д хийгдсэн; энд гол мөрүүд.
 *   2. F-ИЙН ХОС (F86 = F721). Газар чөлөөлөлт/Зөвшөөрөл/Сонгон/Бэлтгэл хэсгийн 649 мөр жингээ
 *      Барилга угсралт ажлын ижил багц/блокоос хуулна — буруу багцын «5/1» тааралдвал жин
 *      чимээгүй солигдоно.
 *   3. НЭГЖ. Гаралт 0–100; хадгалсан F/G бутархай (0–1), S 0–100 — холилдвол бүх хувь 100 дахин гажна.
 *   4. null ≠ 0. Хэмжилтгүй навч эцгийн нийлбэрт орохгүй; бүх хүүхэд null бол эцэг null.
 *   5. «Нийслэл төсөв» хэсэг эцгийн нийлбэрт ОРОХГҮЙ (E718 = SUM(E719,E842,E858)).
 *
 * ⚠️ Excel-ийн ӨӨРИЙН ГАЖУУ томьёо (бүтцээс зөрсөн) — `fx.anom`-оор Excel-ийн утгыг дарж тулгана:
 *    Q9/R9/S9 нь «Нийслэл төсөв» F70·X70-г НЭМДЭГ (N9/O9/P9 нэмдэггүй); Q879/S879 нь ах дүүс
 *    885–888-ыг SUMPRODUCT-ын мужид оруулсан. Хөдөлгүүр эдгээрийг ДАГАХГҮЙ (дүрмээр бодно) —
 *    доорх «цэвэр дүрэм» хэсэг ялгааг тогтооно.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildTree, computePlan, monthlySeries, monthEnds, linearPlanned, blockStatus, phaseKind, ubToday, orderPlanRows,
} from './projectPlan.ts';

const fx = JSON.parse(readFileSync(new URL('./projectPlan.fixture.json', import.meta.url), 'utf8'));
const DAY = 86_400_000;
const fromSerial = (s) => (s == null ? null : (s - 25569) * DAY);
const toSerial = (ms) => (ms == null ? null : ms / DAY + 25569);
const d = (iso) => Date.parse(`${iso}T00:00:00Z`);
const near = (a, b, tol, msg) => {
  if (a == null || b == null) return assert.equal(a, b, msg);
  assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b}`);
};
const MET = ['N', 'O', 'P', 'Q', 'R', 'S'];

/* ── Фикстур → хадгалах мөр (0–100) ──
   ⚠️ 2026-10-26: фикстур Excel-ийн H…M-ийг БАЙРЛАЛААР (r[9]…r[14]) хадгалсан. ЗӨВ зураглал (cf-wave2):
   H/I → geree_*, J/K «Гүйцэтгэгч» → guits_*, L/M «Газар чөлөөлөлт/бодит» → gazar_*. Хөдөлгүүрийн гаралтын
   түлхүүр нь ХАДГАЛСАН ТАЛБАРААР (J/K = gazar_*, L/M = guits_*) тул Excel-ийн J/K/L/M-ийг `XL_DATE`-ээр
   хөрвүүлж тулгана. */
const XL_DATE = { H: 'H', I: 'I', J: 'L', K: 'M', L: 'J', M: 'K' };
const s = (i) => (i == null ? null : fx.strs[i]);
const stored = fx.rows.map((r) => ({
  dd_kod: r[0], etseg_kod: r[1], uy_shat: r[2], bagts: s(r[3]), blok: r[4], ajil_uilchilgee: s(r[5]),
  ho_dun_geree: r[6],
  heseg_ezleh_huvi: r[7], // бутархай (0–1) — импорттой ижил
  tusul_ezleh_huvi: r[8],
  geree_ehleh: fromSerial(r[9]), geree_duusah: fromSerial(r[10]),
  guits_ehleh: fromSerial(r[11]), guits_duusah: fromSerial(r[12]),
  gazar_ehleh: fromSerial(r[13]), gazar_duusah: fromSerial(r[14]),
}));
const ovOf = (withAnom) => (n) => {
  const a = fx.ov[n.code];
  const o = {};
  if (a) MET.forEach((m, i) => { if (a[i] !== 'x') o[m] = a[i] == null ? null : a[i] * 100; });
  if (withAnom && fx.anom[n.code]) for (const [m, v] of Object.entries(fx.anom[n.code])) o[m] = v * 100;
  return Object.keys(o).length ? o : undefined;
};

const tree = buildTree(stored);
assert.deepEqual(tree.issues, [], 'фикстурын мод цэвэр (давхардсан код, олдоогүй эцэг/хос алга)');
assert.equal(tree.nodes.length, 905);
assert.deepEqual(tree.root.children.map((p) => p.phase),
  ['tezu', 'zurag', 'gazar', 'zovshoorol', 'songon', 'barilga', 'huleelgeh', 'zugshruulelt'], 'үе шатын дараалал');

/* ── 1. Excel-тэй тулгалт (гажуу нүдийг Excel-ийн утгаар дарж) ── */
const TODAY = d('2026-10-07');
const res = computePlan(tree, { override: ovOf(true) }, TODAY);
const DATE = new Set(['H', 'I', 'J', 'K', 'L', 'M']);
let cells = 0;
for (const [code, exp] of Object.entries(fx.expect)) {
  const v = code === '' ? res.values.get(tree.root) : res.get(code);
  assert.ok(v, `мөр ${code}`);
  for (const [c, ex] of Object.entries(exp)) {
    let ours = DATE.has(c) ? v[XL_DATE[c]] : v[c];
    if (DATE.has(c)) ours = toSerial(ours);
    else if (c !== 'E' && ours != null) ours /= 100;
    /* ⚠️ Excel хоосон/0 ↔ манай null («мэдэхгүй») — зориуд (null ≠ 0) */
    if (ours == null && (ex == null || ex === 0)) { cells++; continue; }
    near(ours, ex, c === 'E' ? 1e-3 : DATE.has(c) ? 1e-6 : 1e-9, `${c} ${code || 'нийт'}`);
    cells++;
  }
}
assert.ok(cells >= 380, `тулгасан нүд ${cells}`);

/* Гол тоонууд — нүдээр харж болохуйц (Excel-ийн дэлгэц дээрх) */
const root = res.values.get(tree.root);
near(root.E, 2_495_841_880_529.33, 1e-2, 'E6 төслийн төсөв');
near(root.G, 100, 1e-9, 'G6 = Σ үе шатын G');
near(root.N, 71.853, 1e-3, 'N6 Гэрээ');
near(root.O, 63.731, 1e-3, 'O6 Газар чөлөөлөлт');
near(root.P, 59.395, 1e-3, 'P6 Гүйцэтгэгч');
near(root.S, 39.341, 1e-3, 'S6 Гүйцэтгэл');
near(root.T, 54.752, 1e-3, 'T6 = S/N');
near(res.get('5').N, 65.846, 1e-3, 'N528 Барилга угсралт');
near(res.get('5.2.1.1').N, 97.251, 1e-3, 'N720 Багц-1 = SUMPRODUCT(блокууд)');
near(res.get('5.2.1.1').P, 71.704, 1e-3, 'P720');
assert.equal(res.get('5.2.1.1').status, null, 'багцын мөрөнд төлөв алга');

/* F-ийн хос: Газар чөлөөлөлт · Багц-1 · 5/1 (мөр 86) = Барилга угсралт · Багц-1 · 5/1 (мөр 721) */
const g86 = tree.byCode.get('3.1.1.1');
assert.equal(g86.twin?.code, '5.2.1.1.1', 'F86 = F721');
near(res.get('3.1.1.1').F, res.get('5.2.1.1.1').F, 1e-12, 'хуулсан F');
assert.equal(tree.byCode.get('2.1.1').twin?.code, '5.2.1', 'F11 = F719 (нэрээр)');
assert.equal(tree.byCode.get('3.3.5.1').twin?.code, '5.2.3.1#3', 'F254 = F890 (Excel: Багц 18-аар)');
near(res.get('3.1').F, res.get('5.2.1').F, 1e-12, 'F84 = F719');

/* «Нийслэл төсөв» — эцгийн нийлбэрт орохгүй, өөрөө бодогдоно */
const n891 = tree.byCode.get('5.2.4');
assert.equal(n891.outside, true);
near(res.get('5.2').E, res.get('5.2.1').E + res.get('5.2.2').E + res.get('5.2.3').E, 1e-3, 'E718 891-гүй');
near(res.get('5.2.4').F, 7.0877, 1e-4, 'F891 = E891/E718 бодогдоно');

/* Блокийн төлөв (S-ээр) */
assert.equal(res.get('5.2.1.1.1').status, 'started', '5/1 · 25.7%');
assert.equal(res.get('3.1.1.1').status, 'done', 'Газар чөлөөлөлт · 5/1 · 100%');

/* ── 2. Цэвэр дүрэм (Excel-ийн гажууг ДАГАХГҮЙ) ── */
{
  const clean = computePlan(tree, { override: ovOf(false) }, TODAY);
  const c = clean.values.get(tree.root);
  near(c.N, root.N, 1e-9, 'N6 гажуугүй тул ижил');
  /* ⚠️ S9 (Excel 92.02) нь «Нийслэл төсөв» F70·S70-г нэмдэг — дүрмээр 91.37; S879 нь ах дүүсийг
     нэмдэг (Excel 6.09 → 0). Нийт S6: Excel 39.341 → 39.151. */
  near(clean.get('2').S, 91.3735, 1e-4, 'S9 цэвэр');
  near(clean.get('5.2.3.3').S, 0, 1e-12, 'S879 цэвэр');
  near(c.S, 39.1507, 1e-4, 'S6 цэвэр');
}

/* ── 3. Сарын хуримтлагдсан («…сараар») — 719 = Σ F × 8 багцын сарын % ── */
{
  const m0 = Date.UTC(2026, 7, 1);
  const months = monthEnds(m0, Date.UTC(2028, 11, 1));
  assert.equal(months.length, 29, '2026-08 … 2028-12');
  assert.equal(months[0], d('2026-08-31'));
  const ms = monthlySeries(res, months, {
    overrideMonthly: (n) => fx.monthly.ov[n.code]?.map((v) => (v == null ? null : v * 100)),
  });
  const got = ms.get(tree.byCode.get('5.2.1'));
  fx.monthly.expect['5.2.1'].forEach((ex, i) => near(got[i] / 100, ex, 1e-9, `сар ${i} · 719`));
}

/* ── 4. Амьд дүрмүүд — жижиг хиймэл мод ── */
assert.equal(linearPlanned(d('2026-01-01'), d('2026-01-10'), d('2025-12-31')), 0, 'эхлэхээс өмнө 0');
near(linearPlanned(d('2026-01-01'), d('2026-01-10'), d('2026-01-01')), 10, 1e-9, 'эхний өдөр 1/10');
near(linearPlanned(d('2026-01-01'), d('2026-01-10'), d('2026-01-05')), 50, 1e-9);
assert.equal(linearPlanned(d('2026-01-01'), d('2026-01-10'), d('2026-02-01')), 100);
assert.equal(linearPlanned(null, d('2026-01-10'), d('2026-01-05')), null, 'огноогүй → null (0 биш)');
assert.equal(linearPlanned(d('2026-02-01'), d('2026-01-10'), d('2026-01-05')), null, 'урвуу муж → null');
assert.equal(linearPlanned(-2209161600000, d('2026-01-10'), d('2026-01-05')), null, '1899 сериал → null');
assert.equal(blockStatus(0), 'notStarted');
assert.equal(blockStatus(0.5), 'started');
assert.equal(blockStatus(99.99999999999997), 'done', 'Excel-ийн 0.9999999999999998');
assert.equal(blockStatus(null), null);
assert.equal(phaseKind('Ажлын зураг төсөл'), 'zurag');
assert.equal(phaseKind('Сонгон шалгаруулалт'), 'songon');
{
  const D = (iso) => d(iso);
  const rows = [
    { dd_kod: '1', uy_shat: 'ТЭЗҮ', tusul_ezleh_huvi: 0.1, geree_ehleh: D('2026-01-01'), geree_duusah: D('2026-01-10') },
    { dd_kod: '1.1', etseg_kod: '1', heseg_ezleh_huvi: 1, guitsetgel_huvi: 40 },
    { dd_kod: '2', uy_shat: 'Газар чөлөөлөлт', tusul_ezleh_huvi: 0.1 },
    { dd_kod: '2.1', etseg_kod: '2', bagts: 'Багц-1', ajil_uilchilgee: 'Орон сууц' },
    { dd_kod: '2.1.1', etseg_kod: '2.1', bagts: '5/1', ajil_uilchilgee: '9 давхар' },
    { dd_kod: '2.1.2', etseg_kod: '2.1', bagts: '5/2', ajil_uilchilgee: '9 давхар' },
    { dd_kod: '5', uy_shat: 'Барилга угсралт', tusul_ezleh_huvi: 0.8 },
    { dd_kod: '5.2', etseg_kod: '5', ajil_uilchilgee: 'Барилга угсралт ажил', heseg_ezleh_huvi: 1 },
    { dd_kod: '5.2.1', etseg_kod: '5.2', bagts: 'Багц-1', ajil_uilchilgee: 'Орон сууц',
      guits_ehleh: D('2026-01-01'), guits_duusah: D('2026-12-31') },
    { dd_kod: '5.2.1.1', etseg_kod: '5.2.1', bagts: '5/1', ajil_uilchilgee: '9 давхар', ho_dun_geree: 300 },
    { dd_kod: '5.2.1.2', etseg_kod: '5.2.1', bagts: '5/2', ajil_uilchilgee: '9 давхар', ho_dun_geree: 100 },
    { dd_kod: '5.2.2', etseg_kod: '5.2', bagts: 'Багц-8', ajil_uilchilgee: 'Дэд станц', ho_dun_geree: 0 },
    { dd_kod: '5.2.9', etseg_kod: '5.2', ajil_uilchilgee: 'НИЙГМИЙН ДЭД БҮТЭЦ (Нийслэл төсөв)', ho_dun_geree: 999 },
  ];
  const t = buildTree(rows);
  assert.deepEqual(t.issues, []);
  const b1 = t.byCode.get('5.2.1.1');
  assert.equal(b1.pkg, 'Багц-1');
  assert.equal(b1.blok, '5/1');
  assert.equal(b1.sub, 'barilga');
  assert.equal(t.byCode.get('2.1.2').twin, t.byCode.get('5.2.1.2'), 'Газар чөлөөлөлтийн 5/2 → Барилгын 5/2');
  const calls = [];
  const today = D('2026-07-02');
  const r = computePlan(t, {
    blockActual: (pkg, blok) => (blok === '5/1' ? 50 : null),
    pkgActual: () => 20,
    blockPlanned: (pkg, blok, asOf) => { calls.push(asOf); return blok === '5/1' ? 60 : undefined; },
    land: (pkg, blok) => (blok === '5/1' ? 100 : 0),
  }, today);
  const v = (c) => r.get(c);
  /* E — нийлбэр, «Нийслэл төсөв» хасагдана */
  assert.equal(v('5.2.1').E, 400);
  assert.equal(v('5.2').E, 400, '999 нь гадна');
  /* F — E/E_эцэг; хос; G = F × G_эцэг (0–100) */
  near(v('5.2.1.1').F, 75, 1e-12);
  near(v('2.1.1').F, 75, 1e-12, 'хосоос');
  near(v('2.1').F, 100, 1e-12, '5.2.1 = 400/400');
  near(v('5.2.1.1').G, 60, 1e-12, '75% × 100% × 80%');
  /* S: блок → blockActual; блок мэдээлэлгүй (null) → нийлбэрт орохгүй */
  assert.equal(v('5.2.1.1').S, 50);
  assert.equal(v('5.2.1.2').S, null, 'null ≠ 0');
  near(v('5.2.1').S, 37.5, 1e-9, '0.75×50, 5/2 null нэмэгдэхгүй');
  assert.equal(v('5.2.2').S, 20, 'блокгүй навч → pkgActual');
  assert.equal(v('2.1.1').S, 100, 'газар чөлөөлөлт → land');
  assert.equal(v('1.1').S, 40, 'ТЭЗҮ → хадгалсан guitsetgel_huvi');
  /* P: блок → Хуваарь, Хуваарьгүй (undefined) → өвгийн L/M шугаман */
  assert.equal(v('5.2.1.1').P, 60);
  near(v('5.2.1.2').P, linearPlanned(D('2026-01-01'), D('2026-12-31'), today), 1e-9, 'өвгийн огноо');
  assert.ok(calls.includes(today + 7 * DAY) && calls.includes(today - 7 * DAY), 'Q = +7, R = −7 хоног');
  /* N: навч огноогүй → өвгийн H/I; T = S/N */
  assert.equal(v('1.1').N, 100);
  near(v('1.1').T, 40, 1e-9);
  /* ⚠️ 2026-10-26: J–M огноогүй үе шат (ТЭЗҮ…Сонгон) → O = P = N (гэрээний муж руу унана; Excel-тэй адил) */
  assert.equal(v('1.1').O, 100, 'газрын огноогүй → гэрээний муж');
  assert.equal(v('1.1').P, 100, 'гүйцэтгэгчийн огноогүй → гэрээний муж');
  assert.equal(v('1.1').Q, 100);
  assert.equal(v('1').P, 100, 'үе шатын P = Σ F·P');
  /* Бүх хүүхэд null → эцэг null; төлөвлөгөө 0 → биелэлт 0 */
  const r0 = computePlan(t, { override: (n) => (n.code === '1.1' ? { N: 0, S: 10 } : undefined) }, today);
  assert.equal(r0.get('1.1').T, 0, 'IF(N=0,0,…)');
  assert.equal(r0.get('2.1').P, null, 'огноогүй мод → null');
  assert.equal(r0.get('2.1').O, null, 'гэрээний муж ч алга → null (0 биш)');
  /* Төлөв */
  assert.equal(v('5.2.1.1').status, 'started');
  assert.equal(v('2.1.2').status, 'notStarted');
  assert.equal(v('2.1.1').status, 'done');
  /* Сарын цуваа: блок → blockPlanned, эцэг жигнэсэн */
  const ms = monthlySeries(r, monthEnds(D('2026-01-01'), D('2026-03-01')), {
    blockPlanned: (pkg, blok, asOf) => (blok === '5/1' ? (asOf >= D('2026-02-28') ? 40 : 10) : 0),
  });
  assert.deepEqual(ms.get(t.byCode.get('5.2.1')).map((x) => +x.toFixed(9)), [7.5, 30, 30]);
}

/* ── 5. F-ийн хосын СУЛ тааруулга (⚠️ 2026-10-26, --keep-names): системийн нэр сүүл залгаастай, багц «18» ↔ «18.1» ── */
{
  const rows = [
    { dd_kod: '3', uy_shat: 'Газар чөлөөлөлт', tusul_ezleh_huvi: 0.1 },
    { dd_kod: '3.1', etseg_kod: '3', ajil_uilchilgee: 'Инженерийн бэлтгэл' },
    { dd_kod: '3.1.1', etseg_kod: '3.1', bagts: 'БАГЦ-7.1', ajil_uilchilgee: 'Хөрсний ус зайлуулах' },
    { dd_kod: '3.1.2', etseg_kod: '3.1', ajil_uilchilgee: 'Сэлбэ голын үерийн ус хуримтлуулах усан сангийн ажил' },
    { dd_kod: '3.2', etseg_kod: '3', ajil_uilchilgee: 'Авто зам, дугуйн зам' },
    { dd_kod: '3.2.1', etseg_kod: '3.2', bagts: 'Багц 18', ajil_uilchilgee: 'Авто зам /дугуй' },
    { dd_kod: '5', uy_shat: 'Барилга угсралт', tusul_ezleh_huvi: 0.9 },
    { dd_kod: '5.2', etseg_kod: '5', ajil_uilchilgee: 'Барилга угсралт ажил', heseg_ezleh_huvi: 1 },
    { dd_kod: '5.2.1', etseg_kod: '5.2', ajil_uilchilgee: 'Инженерийн бэлтгэл' },
    { dd_kod: '5.2.1.1', etseg_kod: '5.2.1', bagts: 'БАГЦ-7.1', ajil_uilchilgee: 'Хөрсний ус зайлуулах', ho_dun_geree: 100 },
    { dd_kod: '5.2.1.2', etseg_kod: '5.2.1', ajil_uilchilgee: 'Сэлбэ голын үерийн ус хуримтлуулах усан сангийн ажил -Оруулах тайлбарлана', ho_dun_geree: 300 },
    { dd_kod: '5.2.2', etseg_kod: '5.2', ajil_uilchilgee: 'Авто зам, дугуйн зам' },
    { dd_kod: '5.2.2.1', etseg_kod: '5.2.2', bagts: 'Багц 18.1', ajil_uilchilgee: 'Зам талбай-Хавсралт', ho_dun_geree: 50 },
  ];
  const t = buildTree(rows);
  assert.deepEqual(t.issues, [], 'сул тааруулгаар бүх навч хостой');
  assert.equal(t.byCode.get('3.1.2').twin?.code, '5.2.1.2', 'нэрийн угтвараар');
  assert.equal(t.byCode.get('3.2.1').twin?.code, '5.2.2.1', 'ах дүүсийн ижил байрлалаар');
  const r = computePlan(t, {}, d('2026-10-07'));
  near(r.get('3.1.2').F, 75, 1e-12, '300 / 400');
  near(r.get('3.2.1').F, 100, 1e-12);
  /* Сул тааруулга ЭЦГИЙН ХОСЫН хүүхдүүдээс л — ах дүүсийн тоо зөрвөл байрлалаар тааруулахгүй */
  const t2 = buildTree([...rows, { dd_kod: '3.2.2', etseg_kod: '3.2', ajil_uilchilgee: 'Гүүр' }]);
  assert.equal(t2.byCode.get('3.2.1').twin, null);
  assert.deepEqual(t2.issues, ['F-ийн хос олдсонгүй: 3.2.1 Багц 18 Авто зам /дугуй', 'F-ийн хос олдсонгүй: 3.2.2 Гүүр']);
  assert.deepEqual(buildTree([{ dd_kod: '9', etseg_kod: '8' }]).issues, ['эцэг олдсонгүй: 9 → 8']);
}

/* ── 6. Өнөөдөр = Улаанбаатарын хуанлийн өдөр (⚠️ 2026-10-26) ── */
{
  assert.equal(ubToday(Date.UTC(2026, 9, 6, 17, 0)), d('2026-10-07'), 'УБ 01:00 → тэр өдөр (UTC-ээр өчигдөр)');
  assert.equal(ubToday(Date.UTC(2026, 9, 6, 15, 59)), d('2026-10-06'), 'УБ 23:59');
  assert.equal(ubToday(d('2026-10-07')), d('2026-10-07'), 'UTC шөнө дунд өөрчлөгдөхгүй');
  const a = ubToday();
  const r = computePlan(buildTree([]));
  assert.ok([a, ubToday()].includes(r.today), 'computePlan-ийн анхдагч today = ubToday()');
  /* УБ 03:00 (UTC-ээр өмнөх өдрийн 19:00) — шугаман хувь УБ-ын өдрөөр */
  near(linearPlanned(d('2026-01-01'), d('2026-01-10'), ubToday(Date.UTC(2026, 0, 4, 19))), 50, 1e-9, 'УБ 01-05 → 5/10');
}

/* ── 7. Excel-ийн ДАВХАРДСАН Д/Д (импорт `--kod=excel`, ⚠️ 2026-10-27) — objectid-ийн дараалал = Excel-ийн дараалал ──
   Excel 261007 V3-ын бодит хэв: «3» хоёр үе шат; «2.1.1» эцэг ба түүний хүүхэд ижил кодтой; мөр 858 «5.2.3» ба түүний
   гурван хүүхэд «5.2.3» (879 · 885 · 889), ач нар нь «5.2.3.1…» — 886 нь 885-ынх, 880 нь 879-ийнх; «2.3.3.1» таван ах дүү. */
{
  const R = (oid, dd, et, tv, name) => ({ objectid: oid, dd_kod: dd, etseg_kod: et, tuvshin: tv, ajil_uilchilgee: name });
  const excel = [
    R(1, '2', null, 0, 'Ажлын зураг төсөл'), R(2, '2.1', '2', 1, 'з1'), R(3, '2.1.1', '2.1', 2, 'з11'), R(4, '2.1.1', '2.1.1', 3, 'з111'),
    R(5, '2.1.2', '2.1.1', 3, 'з112'), R(6, '2.1.2', '2.1', 2, 'з12'),
    R(7, '2.3.3.1', '2.1', 2, 'A'), R(8, '2.3.3.1', '2.1', 2, 'B'), R(9, '2.3.3.1', '2.1', 2, 'C'),
    R(10, '3', null, 0, 'Газар чөлөөлөлт'), R(11, '3.1', '3', 1, 'г1'), R(12, '3', null, 0, 'Зөвшөөрөл'), R(13, '3.1', '3', 1, 'зв1'),
    R(14, '5', null, 0, 'Барилга угсралт'), R(15, '5.2.3', '5', 1, 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ'), R(16, '5.2.3.1', '5.2.3', 2, 'цахилгаан'),
    R(17, '5.2.3.1.1', '5.2.3.1', 3, 'Багц-6.1'), R(18, '5.2.3', '5.2.3', 2, 'эх үүсвэр'), R(19, '5.2.3.2', '5.2.3', 3, 'Багц-8'),
    R(20, '5.2.3', '5.2.3', 2, 'бэлтгэл'), R(21, '5.2.3.1', '5.2.3', 3, 'Багц-7.1'), R(22, '5.2.3', '5.2.3', 2, 'Авто зам'),
    R(23, '5.2.3.1', '5.2.3', 3, 'Багц 18'),
  ];
  /* сервер dd_kod-оор (мөрөөр) эрэмбэлж ирнэ — objectid-аар л Excel-ийн дараалал сэргэнэ */
  const shuffled = [...excel].sort((a, b) => a.dd_kod.localeCompare(b.dd_kod) || b.objectid - a.objectid);
  const ordered = orderPlanRows(shuffled, (a, b) => String(a).localeCompare(String(b)));
  assert.deepEqual(ordered.map((r) => r.objectid), excel.map((r) => r.objectid), 'давхардалтай — objectid-ийн дараалал');
  const t = buildTree(ordered);
  assert.deepEqual(t.issues.filter((x) => !x.startsWith('F-ийн хос')), [], 'шийдэгдэх давхардал анхааруулга БИШ (жингүй жишээ — хосын анхааруулга хамаагүй)');
  const par = Object.fromEntries(t.nodes.map((n) => [n.row.ajil_uilchilgee, n.parent.row?.ajil_uilchilgee ?? '']));
  assert.equal(par['з111'], 'з11', '«2.1.1»-ийн хүүхэд «2.1.1» — өөрөө биш, түвшин 2-ынх');
  assert.equal(par['з112'], 'з11');
  assert.equal(par['з12'], 'з1');
  assert.deepEqual(['A', 'B', 'C'].map((k) => par[k]), ['з1', 'з1', 'з1']);
  assert.deepEqual(t.nodes.find((n) => n.row.ajil_uilchilgee === 'з1').children.map((c) => c.row.ajil_uilchilgee),
    ['з11', 'з12', 'A', 'B', 'C'], 'ах дүүс Excel-ийн дарааллаар');
  assert.equal(par['г1'], 'Газар чөлөөлөлт', '«3.1» → хамгийн ойрын өмнөх «3»');
  assert.equal(par['зв1'], 'Зөвшөөрөл');
  assert.equal(par['эх үүсвэр'], 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ', '879 → 858 (түвшин 1, ах дүү «5.2.3» биш)');
  assert.equal(par['бэлтгэл'], 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ', '885 → 858 (879 биш)');
  assert.equal(par['Авто зам'], 'ИНЖЕНЕРИЙН ДЭД БҮТЭЦ');
  assert.equal(par['Багц-8'], 'эх үүсвэр', '880 → 879');
  assert.equal(par['Багц-7.1'], 'бэлтгэл', '886 → 885 (889 биш)');
  assert.equal(par['Багц 18'], 'Авто зам', '890 → 889');
  assert.equal(par['Багц-6.1'], 'цахилгаан');
  /* давтагдашгүй код — хуучин зан төлөв (байгалийн эрэмбэ), objectid-ээс үл хамаарна */
  const uniq = orderPlanRows([R(9, '1.10', '1', 1, 'x'), R(1, '2', null, 0, 'y'), R(5, '1', null, 0, 'z'), R(3, '1.9', '1', 1, 'w')],
    (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true }));
  assert.deepEqual(uniq.map((r) => r.dd_kod), ['1', '1.9', '1.10', '2']);
  /* objectid-гүй (хадгалаагүй) мөр төгсгөлд, эцгээ хамгийн ойрын өмнөхөөс */
  const add = orderPlanRows([...shuffled, { objectid: null, dd_kod: '2.1.2.1', etseg_kod: '2.1.2', tuvshin: 3, ajil_uilchilgee: 'шинэ' }],
    (a, b) => String(a).localeCompare(String(b)));
  assert.equal(add[add.length - 1].ajil_uilchilgee, 'шинэ');
  const t2 = buildTree(add);
  assert.equal(t2.nodes.find((n) => n.row.ajil_uilchilgee === 'шинэ').parent.row.ajil_uilchilgee, 'з12', 'түвшин 2-ын «2.1.2»');
}

console.log(`projectPlan.check: OK (${cells} Excel нүд)`);
