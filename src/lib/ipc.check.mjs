/**
 * ХӨРӨНГӨ ОРУУЛАЛТЫН ГҮЙЦЭТГЭЛИЙН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ipc.check.mjs
 *
 * Хамгаалж буй БОДИТ алдаанууд:
 *   1. ГРЕЙН ХӨӨРӨГДӨХ (№1 эрсдэл). Мөр = ГҮЙЛГЭЭ, гэрээний талбар мөрд
 *      ДАВТАГДАНА. Багц-4.1 нь 7 мөртэй тул `tosov_niit`-ийг мөрөөр SUM
 *      хийвэл төсөв 7 ДАХИН гарна — `reportData.ts`-ийн «5.4 дахин
 *      хөөрөгдөх» алдааны ЯГ ЭНЭ ЛЭ хэлбэр.
 *   2. ДИАПАЗОН МӨР БУРУУ ЭЗЭНД. `bagtsKey('Багц-1-4')` = `'БАГЦ14'` нь
 *      БОДИТ «Багц 14»-ийн ЯГ түлхүүр. Хэн нэг нь `pkgKeyOf`-ийг
 *      `bagtsKey` болгож «хялбарчилвал» 876,465,164 ₮ буруу багцад
 *      наалдана — энэ тест үүнийг барина.
 *   3. `null` → `0` ДАРАГДАХ (2026-09-04-ний I30 алдааны хэлбэр). `dun`
 *      хоосон 2 мөр амьдаар байна; `?? 0` дарвал «олгосон 0 ₮» гэсэн ХУДАЛ
 *      хэмжилт үүснэ. ХОЁР ТАЛ: жинхэнэ `0` нь `null` БОЛОХ ЁСГҮЙ.
 *   4. УРЬДЧИЛГААГ ДУГААРЛАХ. `ipc_dugaar` урьдчилгаад ҮРГЭЛЖ null;
 *      `padStart` дээр «IPC-00» гэсэн ХУДАЛ код гарна.
 *   5. «ОЛГОСОН» гэдгийг ЗӨВХӨН гүйцэтгэлээр тоолох. Хэрэглэгчийн шийдвэр:
 *      олгосон = урьдчилгаа + гүйцэтгэл (бүх санхүүжилт).
 *   6. КОДГҮЙ ГЭРЭЭ ХАЯГДАХ. `geree_kod` хоосон мөр (ХО-0045) 533 сая ₮-ийн
 *      төсөвтэй — бүлэглэлтээс унавал чимээгүй алга болно.
 *   7. IPC ДУГААРЫН ЦООРХОЙ АНЗААРАГДАХГҮЙ ӨНГӨРӨХ — акт бүртгэгдээгүйн дохио.
 *   8. ХАДГАЛАГДСАН `hemnelt_hetrelt` ↔ БОДОГДСОН зөрөх. Амьдаар 45/45
 *      таарсан; зөрвөл эх сурвалж эвдэрсний дохио.
 */
import assert from 'node:assert/strict';
import {
  groupHo, hoTotals, paidByPkg, unlinkedPays,
  sumPaid, sumPaidByKind, ipcNumbers, ipcSeqOk, ipcGaps,
} from './ipc.ts';
import { HO_IPC, hoAmount, hoPayCode, hoSaving, num } from './services.ts';

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;
const { advance, work } = HO_IPC.kinds;

/** Төлбөрийн мөр үүсгэгч — гэрээний талбар нь мөр БҮРД давтагдана */
const row = (oid, o = {}) => ({ OBJECTID: oid, ...o });
const pay = (oid, code, pkg, kind, dun, extra = {}) => row(oid, {
  [C.code]: code, [C.pkg]: pkg,
  [P.kind]: kind, [P.amount]: dun, ...extra,
});

/* ══ 1. ГРЕЙН — гэрээний талбар ДАХИН ТООЛОГДОХГҮЙ ══ */
{
  // Багц-4.1-ийн 3 мөр; `tosov_niit` 100 нь мөр БҮРД давтагдсан
  const rows = [
    pay(1, 'Багц-4.1', 'Багц-4.1', work, 10, { [C.budgetTotal]: 100, [C.contractTotal]: 90 }),
    pay(2, 'Багц-4.1', 'Багц-4.1', work, 20, { [C.budgetTotal]: 100, [C.contractTotal]: 90 }),
    pay(3, 'Багц-4.1', 'Багц-4.1', work, 30, { [C.budgetTotal]: 100, [C.contractTotal]: 90 }),
  ];
  const g = groupHo(rows);
  assert.equal(g.length, 1, '3 мөр = 1 гэрээ');
  assert.equal(g[0].budgetTotal, 100, '⚠️ 300 БИШ — гэрээний талбар ДАХИН тоологдохгүй');
  assert.equal(g[0].contractTotal, 90, '⚠️ 270 БИШ');
  assert.equal(g[0].paidTotal, 60, 'төлбөр нь ХАРИН нийлүүлэгдэнэ');
  assert.equal(g[0].pays.length, 3, 'эх мөрүүд хадгалагдана');

  const t = hoTotals(rows);
  assert.equal(t.budget, 100, '⚠️ НИЙТ түвшинд ч 300 БИШ');
  assert.equal(t.contract, 90);
  assert.equal(t.paid, 60);
  assert.equal(t.contracts, 1);
  assert.equal(t.pays, 3);
}

/* ══ 2. ДИАПАЗОН МӨР — багцад ОГТ наалдахгүй ══ */
{
  const rows = [
    pay(1, 'Багц-14', 'Багц 14', work, 1000),
    // ⚠️ `bagtsKey('Багц-1-4')` = 'БАГЦ14' — дээрх БОДИТ Багц 14-тэй МӨРГӨЛДӨНӨ
    pay(2, 'Багц-1-4', 'Багц-1-4', work, 876_465_164),
    pay(3, 'олон', 'БАГЦ-10,  БАГЦ-11, БАГЦ-13, БАГЦ-15', work, 5_094_952_269),
  ];
  const m = paidByPkg(rows);
  assert.equal(m.get('БАГЦ14'), 1000,
    '⚠️ Диапазон мөр Багц 14-т НААЛДААГҮЙ байх ёстой (pkgKeyOf, bagtsKey БИШ)');
  assert.equal(m.size, 1, 'диапазон 2 мөр Map-д ОГТ орохгүй');

  const un = unlinkedPays(rows);
  assert.equal(un.length, 2, 'холбогдоогүй 2 мөр ИЛ гарна');

  // ⚠️ БАГЦЫН MAP-ЫН НИЙЛБЭР ≠ НИЙТ — энэ дүрмийг тестээр бэхжүүлнэ
  const byPkgSum = [...m.values()].reduce((a, v) => a + v, 0);
  assert.equal(hoTotals(rows).paid, 5_971_418_433);
  assert.notEqual(byPkgSum, hoTotals(rows).paid,
    '⚠️ Багцын Map-ыг нийлүүлж төслийн нийт ГАРГАЖ БОЛОХГҮЙ');
}

/* ══ 3. `null ≠ 0` — ХОЁР ТАЛ ══ */
{
  // (а) хэмжигдээгүй нь 0 БОЛОХГҮЙ
  assert.equal(hoAmount({ [P.amount]: null }), null);
  assert.equal(hoAmount({ [P.amount]: '' }), null);
  assert.equal(hoAmount({}), null);
  assert.equal(hoAmount({ [P.amount]: 'тоо биш' }), null);
  // (б) жинхэнэ ТЭГ нь `null` БОЛОХГҮЙ
  assert.equal(hoAmount({ [P.amount]: 0 }), 0, '⚠️ жинхэнэ тэг төлбөр — null БИШ');

  // БҮХ мөр хоосон бол нийлбэр `null`, `0` БИШ
  assert.equal(sumPaid([{ [P.amount]: null }, { [P.amount]: '' }]), null,
    '⚠️ 0 буцаавал «төлбөргүй гэрээ» нь «0 ₮ олгосон» гэж ХУДЛААР баталгаажна');
  assert.equal(sumPaid([]), null);
  assert.equal(sumPaid([{ [P.amount]: 0 }]), 0, 'ганц тэг → 0');
  assert.equal(sumPaid([{ [P.amount]: null }, { [P.amount]: 5 }]), 5, 'хоосныг АЛГАСНА');

  // Гэрээ бүхэлдээ төлбөргүй (амьдаар БАГЦ-6.3)
  const g = groupHo([pay(1, 'Багц-6.3', 'Багц-6.3', work, null, { [C.contractTotal]: 500 })]);
  assert.equal(g[0].paidTotal, null, '⚠️ 0 БИШ null');
  assert.equal(g[0].paidPct, null, '⚠️ хэмжигдээгүйгээс хувь БОДОГДОХГҮЙ');

  // Хуваарь 0 → Infinity БИШ null
  const z = groupHo([pay(1, 'Г', 'Г', work, 10, { [C.contractTotal]: 0 })]);
  assert.equal(z[0].paidPct, null, '⚠️ 0-д хуваахгүй');
}

/* ══ 4. УРЬДЧИЛГАА vs ГҮЙЦЭТГЭЛ — ялгаж, дугаарлахгүй ══ */
{
  // ⚠️ Урьдчилгаа мөрд `ipc_dugaar` ҮРГЭЛЖ null (амьдаар 20/20)
  assert.equal(hoPayCode({ [P.kind]: advance, [P.ipcNo]: null }), 'Урьдчилгаа',
    '⚠️ «IPC-00» гэсэн ХУДАЛ код гарах ЁСГҮЙ');
  assert.equal(hoPayCode({ [P.kind]: work, [P.ipcNo]: 3 }), 'IPC-03');
  assert.equal(hoPayCode({ [P.kind]: work, [P.ipcNo]: 12 }), 'IPC-12');
  // Гүйцэтгэл боловч дугааргүй → дугаар зохиохгүй
  assert.equal(hoPayCode({ [P.kind]: work, [P.ipcNo]: null }), 'Гүйцэтгэл');
  // Ангилагдаагүй (`tulult_turul` хоосон, амьдаар 2 мөр) — урьдчилгаа БОЛОХГҮЙ
  assert.equal(hoPayCode({ [P.kind]: null, [P.ipcNo]: null }), 'Гүйцэтгэл');
}

/* ══ 5. «ОЛГОСОН» = урьдчилгаа + гүйцэтгэл ══ */
{
  const rows = [
    pay(1, 'Багц-1', 'Багц-1', advance, 314),
    pay(2, 'Багц-1', 'Багц-1', work, 216),
    pay(3, 'Багц-1', 'Багц-1', null, 7),   // ангилагдаагүй
  ];
  const t = hoTotals(rows);
  assert.equal(t.advance, 314);
  assert.equal(t.work, 216);
  assert.equal(t.paid, 537,
    '⚠️ «Олгосон» нь БҮХ төлбөр — зөвхөн гүйцэтгэлийг тоолвол унана');
  assert.equal(sumPaidByKind(rows, advance), 314);
  assert.equal(sumPaidByKind(rows, work), 216);

  const g = groupHo(rows)[0];
  assert.equal(g.advanceTotal, 314);
  assert.equal(g.workTotal, 216);
  assert.equal(g.paidTotal, 537);
  // ⚠️ Ангилагдаагүй мөр нь ХОЁР төрлийн АЛЬ Ч ГҮЙД ороогүй ч НИЙТ-д БАЙНА
  assert.equal(g.advanceTotal + g.workTotal, 530, 'хоёр төрлийн нийлбэр < нийт');
}

/* ══ 6. КОДГҮЙ ГЭРЭЭ ХАЯГДАХГҮЙ (амьдаар ХО-0045) ══ */
{
  const rows = [
    pay(1, 'Багц-1', 'Багц-1', work, 10, { [C.budgetTotal]: 50 }),
    pay(2, null, null, null, null, { [C.budgetTotal]: 533_100_000 }),
  ];
  const g = groupHo(rows);
  assert.equal(g.length, 2, '⚠️ кодгүй мөр ТУСДАА гэрээ — хаягдахгүй');
  const noCode = g.find((c) => c.code === '');
  assert.ok(noCode, 'кодгүй гэрээ олдоно');
  assert.equal(noCode.budgetTotal, 533_100_000, '⚠️ төсөв нь чимээгүй алга болохгүй');
  assert.equal(noCode.key, '', 'багцгүй тул түлхүүр хоосон');
  assert.equal(hoTotals(rows).budget, 533_100_050, 'нийт төсөвт ҮЛДЭНЭ');
}

/* ══ 7. IPC ДУГААРЫН ДАРААЛАЛ ══ */
{
  const seq = (...ns) => ns.map((n, i) =>
    pay(i + 1, 'Г', 'Г', n == null ? advance : work, 1, { [P.ipcNo]: n }));

  // Амьд хэв маяг: 1..n цоорхойгүй + урьдчилгаа (дугааргүй)
  assert.deepEqual(ipcNumbers(seq(null, 1, 2, 3)), [1, 2, 3],
    '⚠️ урьдчилгаа дугаарын цуваанд ОРОХГҮЙ');
  assert.equal(ipcSeqOk(seq(null, 1, 2, 3)), true);
  assert.deepEqual(ipcGaps(seq(null, 1, 2, 3)), []);

  // Цоорхой = өгөгдөл дутуугийн ДОХИО
  assert.equal(ipcSeqOk(seq(1, 2, 4)), false);
  assert.deepEqual(ipcGaps(seq(1, 2, 4)), [3]);

  // 1-ээс эхлээгүй нь ч цоорхой
  assert.equal(ipcSeqOk(seq(2, 3)), false);
  assert.deepEqual(ipcGaps(seq(2, 3)), [1]);

  // Дугаар ОГТ байхгүй (зөвхөн урьдчилгаа) — шалгах зүйл алга
  assert.equal(ipcSeqOk(seq(null, null)), true);
  assert.deepEqual(ipcGaps(seq(null, null)), []);
}

/* ══ 8. ХЭМНЭЛТ — БОДОГДОНО, хадгалагдсантай тулгана ══ */
{
  const r = { [C.budgetTotal]: 2_090_198, [C.contractTotal]: 2_005_710,
              [C.saving]: 84_488 };
  assert.equal(hoSaving(r), 84_488, 'бодогдсон = төсөв − гэрээт');
  assert.equal(hoSaving(r), num(r[C.saving]),
    '⚠️ Хадгалагдсан `hemnelt_hetrelt` -тэй ТААРНА (амьдаар 45/45). Зөрвөл эх эвдэрсэн');
  // Хэмжигдээгүй бол хэмнэлт Ч хэмжигдэхгүй
  assert.equal(hoSaving({ [C.budgetTotal]: 100 }), null);
  assert.equal(hoSaving({ [C.contractTotal]: 100 }), null);
  assert.equal(hoSaving({}), null);
  // Хэтрэлт (сөрөг) нь ЗӨВ утга — таслахгүй
  assert.equal(hoSaving({ [C.budgetTotal]: 90, [C.contractTotal]: 100 }), -10);

  const g = groupHo([{ OBJECTID: 1, [C.code]: 'Г', ...r, [P.amount]: 1 }]);
  assert.equal(g[0].saving, 84_488);
  assert.equal(hoTotals([{ OBJECTID: 1, [C.code]: 'Г', ...r }]).saving, 84_488);
}

/* ══ 8-Б. AUTO МӨР — гэрээний талбарыг ХООСРУУЛАХГҮЙ (2026-09-11) ══

   ⚠️ ЭНЭ БОЛ БОДИТ, ХЭМЖСЭН АЛДАА. `ipcAuto.autoInsert` нь гэрээний талбарыг
   ОГТ бичдэггүй тул AUTO мөр бүр ХООСОН төсөвтэй. Амьдаар 52 мөрийн 7 нь
   AUTO. Хуучин «эхний мөрөөр dedup» дүрмээр AUTO мөр бүлгийн эхэнд ирвэл
   тухайн гэрээний төсөв `null` болж, нийт төсөв 2,090.2 → 166.1 тэрбум ₮
   болж ЧИМЭЭГҮЙ уначихдаг байв. Одоо «утгатай эхний мөр»-өөс авна. */
{
  const AUTO = { [P.id]: 'AUTO|БАГЦ1|2026-09-09' };
  const real = pay(1, 'Багц-1', 'Багц-1', work, 10,
    { [C.budgetTotal]: 373_645_400_000, [C.contractTotal]: 373_298_048_361,
      [C.contractor]: 'Гүйцэтгэгч ХХК' });
  // ⚠️ AUTO мөр ЭХЭНД — амьд өгөгдөлд OID нь сүүлд байгаа нь САНАМСРААР
  const autoFirst = row(46, {
    [C.code]: 'Багц-1', [C.pkg]: 'Багц 1', [P.kind]: work, [P.amount]: 5, ...AUTO,
  });

  for (const rows of [[autoFirst, real], [real, autoFirst]]) {
    const g = groupHo(rows);
    assert.equal(g.length, 1, 'AUTO мөр ТУСДАА гэрээ болохгүй — кодоороо нийлнэ');
    assert.equal(g[0].budgetTotal, 373_645_400_000,
      '⚠️ AUTO мөр ЭХЭНД ирсэн ч төсөв `null` БОЛОХГҮЙ (дарааллаас хамаарахгүй)');
    assert.equal(g[0].contractTotal, 373_298_048_361, '⚠️ гэрээт төсөв мөн адил');
    assert.equal(g[0].contractor, 'Гүйцэтгэгч ХХК',
      '⚠️ бичвэр талбар ч утгатай мөрөөс — AUTO мөрийн хоосон утга ДАРАХГҮЙ');
    assert.equal(g[0].saving, 373_645_400_000 - 373_298_048_361,
      '⚠️ хэмнэлт нь СОНГОСОН хоёр утгаас бодогдоно (нэг мөрөөс БИШ)');
    assert.equal(g[0].paidTotal, 15, 'төлбөр нь ХОЁУЛАНГААС нийлнэ');
    assert.equal(hoTotals(rows).budget, 373_645_400_000,
      '⚠️ НИЙТ төсөв дарааллаас ҮЛ ХАМААРНА');
  }
}

/* ══ 8-В. ХОЁР ӨӨР non-null утга — ЧИМЭЭГҮЙ сонгохгүй, АНХААРУУЛНА ══

   ⚠️ Амьд өгөгдөлд мөнгөн талбарт ийм зөрчил АЛГА (2026-09-11). Гарвал энэ нь
   эх сурвалж дээр НЭГ гэрээ хоёр өөр төсөвтэй бичигдсэн гэсэн үг — кодоор
   шийдэх боломжгүй тул ЭХНИЙХИЙГ авч, console.warn-оор ил хэлнэ. */
{
  const warns = [];
  const orig = console.warn;
  console.warn = (m) => warns.push(String(m));
  try {
    const g = groupHo([
      pay(1, 'Багц-9', 'Багц-9', work, 1, { [C.budgetTotal]: 100 }),
      pay(2, 'Багц-9', 'Багц-9', work, 1, { [C.budgetTotal]: 999 }),
    ]);
    assert.equal(g[0].budgetTotal, 100, 'ЭХНИЙ non-null утгыг барина');
    assert.equal(warns.length, 1, '⚠️ ЧИМЭЭГҮЙ өнгөрөхгүй — ЯГ нэг анхааруулга');
    assert.ok(warns[0].includes('tosov_niit') && warns[0].includes('Багц-9'),
      'анхааруулга нь ГЭРЭЭ ба ТАЛБАРЫГ нэрлэнэ');
  } finally { console.warn = orig; }

  // ⚠️ `bagts`-ийн бичиглэлийн зөрүү нь анхааруулга ҮҮСГЭХГҮЙ: «Багц-4.1» ба
  //    «Багц 4-1» хоёр `bagtsKey`-ээр ИЖИЛ түлхүүрт унадаг тул холбоос эвдрэхгүй.
  const w2 = [];
  const o2 = console.warn;
  console.warn = (m) => w2.push(String(m));
  try {
    const g = groupHo([
      pay(1, 'Багц-4.1', 'Багц-4.1', work, 1),
      pay(2, 'Багц-4.1', 'Багц 4-1', work, 1),
    ]);
    assert.equal(w2.length, 0, '⚠️ багцын бичиглэл зөрсөн нь ЗӨРЧИЛ БИШ');
    assert.equal(g[0].key, 'БАГЦ41', 'хоёр бичиглэл НЭГ түлхүүрт');
  } finally { console.warn = o2; }
}

/* ══ 9. ДАРААЛАЛ хадгалагдана (OID эрэмбэ) ══ */
{
  const rows = [
    pay(1, 'Б', 'Б', work, 1), pay(2, 'А', 'А', work, 1),
    pay(3, 'Б', 'Б', work, 1), pay(4, 'В', 'В', work, 1),
  ];
  assert.deepEqual(groupHo(rows).map((c) => c.code), ['Б', 'А', 'В'],
    '⚠️ Эхний тааралдсан дараалал — цагаан толгойгоор ЭРЭМБЭЛЭХГҮЙ');
  assert.deepEqual(groupHo(rows)[0].pays.map((r) => r.OBJECTID), [1, 3],
    'бүлэг доторх мөрийн дараалал хадгалагдана');
}

/* ══ 10. ХУВЬ нь 0–100 (`pct()` 100-аар үржүүлдэггүй) ══ */
{
  const g = groupHo([pay(1, 'Г', 'Г', work, 265, { [C.contractTotal]: 1000 })]);
  assert.equal(g[0].paidPct, 26.5, '⚠️ 0.265 БИШ — pct() 0–100 хүлээж авна');
  assert.equal(hoTotals([pay(1, 'Г', 'Г', work, 265, { [C.contractTotal]: 1000 })]).paidPct, 26.5);
}

console.log('ipc.check.mjs — БҮГД ТЭНЦЛЭЭ');
