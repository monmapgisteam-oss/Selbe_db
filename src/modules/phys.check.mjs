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
import { loadBlockHistory } from '../lib/blockProgress.ts';
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
    /* C: сүүлийн бичилт нь null (цэвэрлэгдсэн) — хуваагчид ОРОХГҮЙ */
    ['Багц 9|9/3', [{ date: '2026-01-15', pct: 90 }, { date: '2026-02-01', pct: null }]],
    /* Бүгд null багц — Map-д ОРОХГҮЙ */
    ['Багц 8|8/1', [{ date: '2026-01-01', pct: null }]],
  ]);
  const { phys, physCnt, physAt } = buildPhys(hist, axis, '2026-04');
  const k = [...phys.keys()].find((x) => x.includes('9'));
  assert.ok(k, 'Багц 9 Map-д байх ёстой');
  assert.equal(phys.size, 1, 'бүгд null багц Map-д орохгүй (null ≠ 0)');
  const m = phys.get(k);
  /* ТОГТМОЛ хуваагч = 2 (A, B); B хараахан тайлагнаагүй сард 0% */
  assert.equal(m.get('2026-01'), (10 + 0) / 2, '01: A=10, B=0 → 5');
  assert.equal(m.get('2026-02'), (10 + 20) / 2, '02: A=10, B=20 → 15');
  assert.equal(m.get('2026-03'), (30 + 20) / 2, '03: A=30, B=20 → 25');
  /* ДАВТСАН цэг гарахгүй: 04-д шинэ бичилт алга; 05 нь ирээдүй */
  assert.equal(m.has('2026-04'), false, 'шинэ бичилтгүй сард цэг ГАРАХГҮЙ (carry-forward биш)');
  assert.equal(m.has('2026-05'), false, 'ирээдүйн сард цэг гарахгүй');
  assert.equal(physCnt.get(k).get('2026-01'), 2, 'хуваагч тогтмол 2');
  assert.equal(physCnt.get(k).get('2026-03'), 2, 'хуваагч тогтмол 2');
  /* Хэмжилтийн огноо — тухайн цэгийн хамгийн сүүлийн бичилт */
  assert.equal(physAt.get(k).get('2026-02'), '2026-02-20');
  assert.equal(physAt.get(k).get('2026-03'), '2026-03-05');
  console.log('phys.check: оффлайн дүрэм ok (тогтмол хуваагч · давталтгүй · physAt)');
}

/* ── 1+. АМЬД ӨГӨГДӨЛ ── */
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
