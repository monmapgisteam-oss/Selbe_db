/**
 * CEO · QAQC ҮЗҮҮЛЭЛТИЙН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/qaqc.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. ТОЛГОЙН/БҮЛГИЙН МӨР ТООЛОГДОХ — excel-ийн хоосон толгой ба эвхэгддэг
 *      бүлгийн мөр «баримтгүй ажил» болж тоо хөөрөгдөнө. ⚠️ `loadQaqcRows`
 *      бүх мөрийг `group: false`-оор өгдөг тул бүлэг нь ЗӨВХӨН
 *      `attachOrFlat` (бөглөх хуудасны мод) дараа мэдэгдэнэ — 10-р шалгуур
 *      тэр бодит замыг (түүхий мөр + хуудасны мөр → бүлэг) дамжуулна.
 *   2. ЗАЙ = БАРИМТ. Зөвхөн зайнаас бүрдсэн нүд «бөглөгдсөн» гэж тоологдох.
 *   3. `null` → 0. Нэг ч багц уншигдаагүй / ажлын мөргүй үед «0 баримтгүй,
 *      ногоон» гэж ХУДАЛ гарах.
 *   4. ХУВИЙН ХЭМЖЭЭС. `pct` нүдэнд 0–1 бутархай өгвөл «50%» нь «0.5%» болно.
 *   5. БОСГО. 9/10 нь улаан, 5/10 шар, 4/10 ногоон, 0/0 мэдэгдэхгүй.
 *   6. ЭРЭМБЭ. Муу багц эхэнд, хагас мөрд дутуу олонтой нь эхэнд.
 *   7. ТАСЛАЛТ ЧИМЭЭГҮЙ. 300-аас дээш мөр таслагдвал «… бас N мөр» ил үлдэнэ.
 *   8. УНАЛТ НУУГДАХ. Унасан багц `failedSources`, `issues`, `facts`-д НЭРЭЭР.
 *   9. ХЯЗГААРЛАГЧ. `limiter(3)` нэг зэрэг 3-аас илүү ажил явуулахгүй,
 *      унасан ажил бусдыг зогсоохгүй, байр алдагдахгүй.
 *  10. МОД ХОЛБОГДОХГҮЙ БОЛ ЧИМЭЭГҮЙ ХӨӨРӨГДӨХ. Хуудас унасан/зөрсөн багц
 *      хавтгайгаар тоологдож бүлгийн мөр «ажил» болно — `flat` туг,
 *      `issues`, `facts`-д НЭРЭЭР/ТООГООР ил гарах ёстой; багц унасанд
 *      ТООЛОГДОХГҮЙ (`failedSources` хоосон хэвээр).
 */
import assert from 'node:assert/strict';
import {
  QAQC_EMPTY_BAD_SHARE, QAQC_EMPTY_WARN_SHARE, attachOrFlat, computeQaqc, limiter,
  qaqcEmptyLevel, summarizePkg, worstFirst,
} from './qaqc.ts';
import { QAQC_COLS } from '@/lib/qaqc';
import { ROW_CAP } from './kpi.ts';

const N = QAQC_COLS.length;
const docs = (...filled) => QAQC_COLS.map((_, i) => (filled.includes(i) ? `d${i}` : null));
const row = (oid, no, work, d = docs(), extra = {}) => ({
  oid, no, work, des: '', depth: 0, group: false, docs: d, ...extra,
});
const P1 = { key: 'b1_9f', label: 'Багц 1 · 9 давхар' };
const P2 = { key: 'b2_9f', label: 'Багц 2 · 9 давхар' };
/** Мод холбогдсон багц — `flat: false` */
const ok = (pkg, rows) => ({ pkg, rows, flat: false });

/* 1–2 — ангилал: толгой/бүлэг хасагдана, зай нь баримт биш */
{
  const rows = [
    row(1, '', ''),                                  // excel толгой — тоолохгүй
    row(2, '1', 'Бүлэг', docs(), { group: true }),   // бүлгийн мөр — тоолохгүй
    row(3, '1.1', 'Ухалт'),                          // хоосон
    row(4, '1.2', 'Бетон', docs(0, 3)),              // хагас
    row(5, '1.3', 'Арматур', docs(...QAQC_COLS.keys())), // бүрэн
    row(6, '1.4', 'Зай', QAQC_COLS.map(() => '   ')), // зөвхөн зай — хоосон
    row(7, '', 'Дугааргүй', docs(8)),                 // № хоосон ч ажилтай — хагас
  ];
  const s = summarizePkg(P1, rows);
  assert.equal(s.total, 5);
  assert.equal(s.empty, 2);
  assert.equal(s.partial, 2);
  /* `filled` нь upstream `filledCount` — `null` биш бүхнийг тоолно (зай ч орно).
     Бодит татацад `toRows` зайг аль хэдийн `null` болгодог тул зөрүү гарахгүй. */
  assert.equal(s.filled, 2 + N + 1 + N);
  assert.equal(s.share, 2 / 5);
  assert.deepEqual(s.emptyRows.map((r) => r.oid), [3, 6]);
  assert.deepEqual(s.partialRows[0].missing, QAQC_COLS.filter((_, i) => i !== 0 && i !== 3).map((c) => c.short));
  assert.equal(s.partialRows[1].missing.length, N - 1);
}

/* 3 — null ≠ 0 */
{
  const none = computeQaqc([], ['Багц 1 · 9 давхар', 'Багц 2 · 9 давхар']);
  assert.equal(none.value, '—');
  assert.equal(none.level, 'unknown');
  assert.deepEqual(none.facts, ['2 багц уншигдаагүй']);
  assert.deepEqual(none.failedSources, ['Багц 1 · 9 давхар', 'Багц 2 · 9 давхар']);
  assert.equal(none.issues.length, 2);
  assert.equal(none.issues[0].tone, 'warn');
  assert.match(none.issues[0].text, /Багц 1 · 9 давхар/);
  assert.equal(none.tables.length, 3);
  assert.equal(none.tables[0].rows.length, 0);

  const noWorks = computeQaqc([ok(P1, [row(1, '', '')])], []);
  assert.equal(noWorks.value, '—');
  assert.equal(noWorks.level, 'unknown');
  assert.equal(noWorks.facts.length, 0);
  assert.equal(noWorks.tables[0].rows[0][4].v, null);      // хувь null, 0 биш
  assert.equal(noWorks.tables[0].rows[0][1].v, 0);         // ажлын тоо 0 — бодит хэмжилт
}

/* 4–6 — хэмжээс, босго, эрэмбэ */
{
  const r1 = [row(1, '1', 'а'), row(2, '2', 'б', docs(0)), row(3, '3', 'в', docs(...QAQC_COLS.keys())), row(4, '4', 'г')];
  const r2 = [row(1, '1', 'д', docs(0, 1, 2)), row(2, '2', 'е'), row(3, '3', 'ж'), row(4, '4', 'з'), row(5, '5', 'и', docs(5))];
  const k = computeQaqc([ok(P1, r1), ok(P2, r2)], []);
  assert.equal(k.value, '5');
  assert.equal(k.unit, 'ажил баримтгүй');
  assert.equal(k.level, 'warn');                            // 5/9 = 55.6%
  assert.deepEqual(k.facts, ['55.6% нийт 9 ажлаас', '3 ажил хагас бүрдсэн']);
  assert.deepEqual(k.failedSources, []);
  assert.equal(k.issues.length, 0);
  assert.equal(k.asOf, null);

  const [byPkg, emptyT, partialT] = k.tables;
  assert.equal(byPkg.title, 'Багцаар');
  assert.equal(byPkg.cols.length, 5);
  assert.equal(byPkg.rows[0][0].v, P2.label);               // 3/5 = 60% муу нь эхэнд
  assert.equal(byPkg.rows[1][0].v, P1.label);               // 2/4 = 50%
  assert.equal(byPkg.rows[0][4].kind, 'pct');
  assert.equal(byPkg.rows[0][4].v, 60);                     // 0–100, 0.6 БИШ
  assert.equal(byPkg.rows[1][4].v, 50);
  assert.deepEqual(byPkg.rows[0].slice(1, 4).map((c) => c.v), [5, 3, 2]);

  assert.equal(emptyT.title, 'Баримтгүй ажлууд');
  assert.deepEqual(emptyT.rows.map((r) => `${r[0].v}|${r[1].v}|${r[2].v}`), [
    `${P2.label}|2|е`, `${P2.label}|3|ж`, `${P2.label}|4|з`,
    `${P1.label}|1|а`, `${P1.label}|4|г`,
  ]);

  assert.equal(partialT.title, 'Хагас бүрдсэн ажлууд');
  assert.equal(partialT.cols.length, 4);
  /* Багц 2 дотор: «и» (8 дутуу) эхэнд, «д» (6 дутуу) дараа; Багц 1: «б» (8 дутуу) */
  assert.deepEqual(partialT.rows.map((r) => `${r[0].v}|${r[2].v}`), [
    `${P2.label}|и`, `${P2.label}|д`, `${P1.label}|б`,
  ]);
  assert.equal(partialT.rows[1][3].v, QAQC_COLS.slice(3).map((c) => c.short).join(', '));
}

/* 5 — босго дангаар */
assert.equal(QAQC_EMPTY_WARN_SHARE, 0.5);
assert.equal(QAQC_EMPTY_BAD_SHARE, 0.9);
assert.equal(qaqcEmptyLevel(9, 10), 'bad');
assert.equal(qaqcEmptyLevel(8, 10), 'warn');
assert.equal(qaqcEmptyLevel(5, 10), 'warn');
assert.equal(qaqcEmptyLevel(4, 10), 'good');
assert.equal(qaqcEmptyLevel(0, 10), 'good');
assert.equal(qaqcEmptyLevel(0, 0), 'unknown');
{
  const all = computeQaqc([ok(P1, [row(1, '1', 'а'), row(2, '2', 'б')])], []);
  assert.equal(all.level, 'bad');
  assert.equal(all.facts[0], '100.0% нийт 2 ажлаас');
}

/* 6 — worstFirst: хувьгүй багц сүүлд, тэнцвэл тоо */
{
  const a = summarizePkg(P1, [row(1, '1', 'а'), row(2, '2', 'б', docs(0))]);          // 1/2
  const b = summarizePkg(P2, [row(1, '1', 'а'), row(2, '2', 'б'), row(3, '3', 'в', docs(0)), row(4, '4', 'г', docs(0))]); // 2/4
  const c = summarizePkg({ key: 'x', label: 'Хоосон' }, []);                            // null
  const sorted = [c, a, b].sort(worstFirst).map((p) => p.pkg.label);
  assert.deepEqual(sorted, [P2.label, P1.label, 'Хоосон']);                            // тэнцүү 50% → 2 > 1
}

/* 7 — таслалт ил */
{
  const many = Array.from({ length: ROW_CAP + 7 }, (_, i) => row(i + 1, String(i + 1), `ажил ${i + 1}`));
  const k = computeQaqc([ok(P1, many)], []);
  const t = k.tables[1];
  assert.equal(t.rows.length, ROW_CAP + 1);
  assert.equal(t.rows[ROW_CAP][0].v, '… бас 7 мөр');
  assert.equal(t.rows[ROW_CAP].length, t.cols.length);
  assert.equal(k.value, String(ROW_CAP + 7));                                           // гол тоо ТАСЛАГДАХГҮЙ
}

/* 8 — хэсэгчилсэн уналт нэрээр */
{
  const k = computeQaqc([ok(P1, [row(1, '1', 'а')])], [P2.label]);
  assert.equal(k.level, 'bad');
  assert.deepEqual(k.failedSources, [P2.label]);
  assert.equal(k.facts.at(-1), '1 багц уншигдаагүй');
  assert.equal(k.issues[0].text, `${P2.label} — QAQC хүснэгт уншигдсангүй`);
}

/* 9 — хязгаарлагч */
{
  const run = limiter(3);
  let active = 0;
  let peak = 0;
  const tick = () => new Promise((r) => setTimeout(r, 2));
  const task = (i) => run(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await tick();
    active -= 1;
    if (i % 4 === 0) throw new Error(`fail ${i}`);
    return i;
  });
  const res = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => task(i)));
  assert.equal(peak, 3);
  assert.equal(active, 0);
  assert.deepEqual(res.map((r) => r.status), [
    'rejected', 'fulfilled', 'fulfilled', 'fulfilled', 'rejected',
    'fulfilled', 'fulfilled', 'fulfilled', 'rejected', 'fulfilled',
  ]);
  assert.equal(res[9].value, 9);
  /* Унасан ажлын байр чөлөөлөгдсөн — дараагийн 3 зэрэг явна */
  let again = 0;
  await Promise.all([1, 2, 3].map(() => run(async () => { again += 1; await tick(); })));
  assert.equal(again, 3);
}

/* 10 — бодит зам: түүхий мөр (бүгд group:false) + хуудасны мөр → бүлэг ялгагдана */
{
  const raw = [
    row(1, '1', 'Бүлэг'),                 // хуудсанд бүлэг
    row(2, '1.1', 'Ухалт'),               // хоосон навч
    row(3, '1.2', 'Бетон', docs(0)),      // хагас навч
  ];
  const sheet = [
    { no: '1', work: 'Бүлэг', depth: 0, group: true },
    { no: '1.1', work: 'Ухалт', depth: 1, group: false },
    { no: '1.2', work: 'Бетон', depth: 1, group: false },
  ];
  const joined = attachOrFlat(P1, raw, sheet);
  assert.equal(joined.flat, false);
  assert.deepEqual(joined.rows.map((r) => r.group), [true, false, false]);
  assert.deepEqual(joined.rows.map((r) => r.depth), [0, 1, 1]);
  const s = summarizePkg(joined.pkg, joined.rows, joined.flat);
  assert.equal(s.total, 2);                                  // бүлэг тоологдохгүй
  assert.equal(s.empty, 1);
  assert.equal(s.flat, false);

  /* Мөр зөрсөн (attachTree → null) ба хуудас огт байхгүй (null) — хоёул хавтгай */
  const skew = attachOrFlat(P1, raw, sheet.slice(0, 2));
  assert.equal(skew.flat, true);
  assert.deepEqual(skew.rows, raw);                          // түүхий мөр хэвээр
  const none = attachOrFlat(P1, raw, null);
  assert.equal(none.flat, true);
  const f = summarizePkg(none.pkg, none.rows, none.flat);
  assert.equal(f.total, 3);                                  // бүлэг «ажил» болж тоологдов
  assert.equal(f.flat, true);

  /*
   * Нэгтгэлд: flat багц НИЙЛБЭРТ ОРОХГҮЙ, харин issues/facts-д ил.
   *
   * ⚠️ 2026-09-07: урьд нь flat багцын мөр нийлбэрт ОРДОГ байсан тул
   *    бүлгийн гарчиг «баримтгүй ажил» гэж тоологдож, порталын НИЙТ
   *    үзүүлэлт хөөрөгддөг байв (Багц 3.3-д ~90 хуурамч мөр). Бүлгийг
   *    QAQC-ийн өөрийн өгөгдлөөр таних боломжгүй тул ХАСАХ нь цорын ганц
   *    үнэн зам — буруу тоо нь тооцоогүйгээс ДОР.
   */
  const k = computeQaqc([joined, attachOrFlat(P2, raw, null)], []);
  assert.deepEqual(k.failedSources, []);
  assert.equal(k.value, '1');                                // зөвхөн модтой багц (хавтгайн 2 хуурамч мөр хасагдав)
  assert.deepEqual(k.facts, ['50.0% нийт 2 ажлаас', '1 ажил хагас бүрдсэн', '1 багц мод холбогдоогүй']);
  assert.equal(k.issues.length, 1);
  assert.equal(k.issues[0].tone, 'warn');
  assert.equal(k.issues[0].text, `${P2.label} — QAQC хүснэгтийн мөр бөглөх хуудастай таарахгүй тул шатлал холбогдсонгүй. Бүлгийн мөрийг ажлаас ялгах боломжгүй тул энэ багц НИЙТ үзүүлэлтэд ОРООГҮЙ. QAQC хүснэгтийг эх хүснэгтийн шинэ хувилбараар дахин үүсгэх шаардлагатай.`);
  /* Унасан багц issues-д flat-аас ӨМНӨ */
  const k2 = computeQaqc([attachOrFlat(P2, raw, null)], [P1.label]);
  assert.deepEqual(k2.issues.map((i) => i.text), [
    `${P1.label} — QAQC хүснэгт уншигдсангүй`,
    `${P2.label} — QAQC хүснэгтийн мөр бөглөх хуудастай таарахгүй тул шатлал холбогдсонгүй. Бүлгийн мөрийг ажлаас ялгах боломжгүй тул энэ багц НИЙТ үзүүлэлтэд ОРООГҮЙ. QAQC хүснэгтийг эх хүснэгтийн шинэ хувилбараар дахин үүсгэх шаардлагатай.`,
  ]);
  assert.deepEqual(k2.facts.slice(-2), ['1 багц уншигдаагүй', '1 багц мод холбогдоогүй']);
}

console.log('ceo/qaqc.check: OK');
