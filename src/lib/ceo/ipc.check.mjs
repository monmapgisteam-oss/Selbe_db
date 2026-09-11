/**
 * IPC ҮЗҮҮЛЭЛТИЙН ШАЛГУУР — сүлжээгүй, жинхэнэ `computeIpc`-ийг импортолно.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/ipc.check.mjs
 *
 * ⚠️ 2026-09-09: эх сурвалж `IPC_LOG` (`ipc_0813/172`, тест өгөгдөл) →
 *    `HO_IPC` (`HO_guitsetgel_arcgis_csv/196`). СУУТГАЛ · «төлөх ёстой
 *    огноо» · «ХЯНАГДАЖ БАЙНА» төлөв гурав шинэ эхэд ОГТ БАЙХГҮЙ тул
 *    тэдгээрийн тест (хугацаа хэтэрсэн · хянагдаж буй акт · сөрөг олгох
 *    дүн) БҮРЭН ХАСАГДСАН — байхгүй ойлголтыг тестлэх нь худал итгэл.
 *
 * Ямар БОДИТ алдаанаас хамгаалж байгаа вэ:
 *  1. ГРЕЙН — мөр = НЭГ ГҮЙЛГЭЭ, гэрээний талбар `geree_kod` бүрд
 *     ДАВТАГДАНА. Мөрөөр SUM хийвэл Багц-4.1 (7 мөр) -ийн төсөв 7 ДАХИН
 *     давхардана (`reportData.ts`-ийн «5.4 дахин хөөрөгдөх» алдааны хэлбэр).
 *     Энэ файлын №1 батламж.
 *  2. `dun` хоосон мөр 0 болж нийлбэрийг доош татах (2026-09-04, I30 акт
 *     −2.07 тэрбум). Дүнгүй мөр нийлбэрт ОРОХГҮЙ, бүгд дүнгүй бол «—».
 *     Харин `dun: 0` нь ЖИНХЭНЭ тэг — `null` БИШ (дүрмийн хоёр тал).
 *  3. Диапазон мөр («Багц-1-4») буруу багцад наалдах: `bagtsKey('Багц-1-4')`
 *     = `БАГЦ14` = БОДИТ Багц 14. `pkgKeyOf` тэднийг `''` болгодог тул
 *     «Багцад холбогдоогүй төлбөр» хүснэгтэд ЗААВАЛ ил гарна.
 *  4. Урьдчилгаа мөрд `ipc_dugaar` ҮРГЭЛЖ null — `padStart` нь «IPC-00»
 *     гэсэн худал код гаргахгүй, «Урьдчилгаа» гэж нэрлэнэ.
 *  5. «Олгосон» = урьдчилгаа + гүйцэтгэл (хэрэглэгчийн шийдвэр) — зөвхөн
 *     гүйцэтгэлийг тоолвол унана.
 *  6. Кодгүй гэрээ (ХО-0045) ХАЯГДАХГҮЙ — 533 сая ₮ чимээгүй алга болохгүй.
 *  7. Жагсаалт БҮРЭН, нэртэй — 300-аас дээш бол «… бас N мөр» мөр ил.
 */

import assert from 'node:assert/strict';
import {
  computeIpc, summarize, ipcLevel, dayOf, todayOf, epochOf,
} from './ipc.ts';
import { HO_IPC } from '../services.ts';
import { ROW_CAP } from './kpi.ts';

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;
const { advance, work } = HO_IPC.kinds;

/* ⚠️ Өдрийн ДУНД (12:00Z) — локал өдөр нь UTC−12…UTC+11 бүсэд 2026-09-06 */
const NOW = Date.UTC(2026, 8, 6, 12, 0, 0);
assert.equal(todayOf(NOW), '2026-09-06');

let seq = 0;
/** Нэг ТӨЛБӨРИЙН мөр — гэрээний талбарууд нь `o`-гоор ДАВТАГДАЖ өгөгдөнө */
const pay = (o = {}) => ({
  [P.id]: `ХО-${String(++seq).padStart(4, '0')}`,
  [C.code]: 'code' in o ? o.code : 'Багц-1',
  [C.pkg]: 'pkg' in o ? o.pkg : 'Багц-1',
  [C.project]: o.project ?? 'Сэлбэ дэд төв',
  [C.contractor]: o.contractor ?? 'ББСМО ХХК',
  [C.workType]: o.workType ?? 'Барилга угсралт',
  [C.contractNo]: o.contractNo ?? '34/2025',
  [C.budgetTotal]: 'budget' in o ? o.budget : 100,
  [C.contractTotal]: 'contract' in o ? o.contract : 90,
  [P.kind]: 'kind' in o ? o.kind : work,
  [P.ipcNo]: 'ipcNo' in o ? o.ipcNo : null,
  [P.amount]: 'amount' in o ? o.amount : null,
  [P.payDate]: o.payDate ?? null,
  [P.year]: o.year ?? 2026,
});

/* ══════════════ 1. Хоосон эх ══════════════ */
{
  const r = computeIpc([], NOW);
  assert.equal(r.level, 'unknown');
  assert.equal(r.value, '—');
  assert.deepEqual(r.facts, []);
  assert.deepEqual(r.tables, []);
  assert.deepEqual(r.issues, []);
  assert.equal(r.asOf, null);
  assert.deepEqual(r.failedSources, []);
}

/* ══════════════ 2. Огнооны туслахууд ══════════════ */
assert.equal(dayOf('2026-08-10'), '2026-08-10');
assert.equal(dayOf('2026-08-10T00:00:00'), '2026-08-10');
assert.equal(dayOf(Date.UTC(2026, 7, 10)), '2026-08-10');
assert.equal(dayOf(''), null);
assert.equal(dayOf(null), null);
assert.equal(dayOf('юу ч биш'), null);
assert.equal(epochOf('2026-08-10'), Date.parse('2026-08-10'));
assert.equal(epochOf(null), null);

/* ══════════════ 3. ГРЕЙН — гэрээний талбар ДАВХАРДАХГҮЙ ══════════════
   Энэ файлын ХАМГИЙН ЧУХАЛ батламж: нэг гэрээний 3 мөрд `tosov_niit` тус
   бүр 100 гэж бичигдсэн ч гэрээний нийт төсөв нь 100, 300 БИШ. */
{
  seq = 0;
  const rows = [
    pay({ amount: 10, ipcNo: 1 }),
    pay({ amount: 20, ipcNo: 2 }),
    pay({ amount: 30, ipcNo: 3 }),
  ];
  const s = summarize(rows);
  assert.equal(s.contracts, 1);
  assert.equal(s.pays, 3);
  assert.equal(s.budget, 100, 'төсөв ГЭРЭЭНД НЭГ УДАА — 300 БИШ');
  assert.equal(s.contract, 90, 'гэрээт төсөв ГЭРЭЭНД НЭГ УДАА');
  assert.equal(s.saving, 10, 'хэмнэлт = 100 − 90, БОДОГДСОН');
  assert.equal(s.paid, 60, 'төлбөр нь мөр бүрээр НИЙЛҮҮЛНЭ');
  assert.equal(s.paidPct, (60 / 90) * 100, 'хувь нь 0–100, pct() 100-аар үржүүлдэггүй');

  const r = computeIpc(rows, NOW);
  const t1 = r.tables[0];
  assert.equal(t1.rows.length, 1, '3 мөр → 1 гэрээний мөр');
  assert.equal(t1.rows[0][4].v, 100, 'хүснэгтийн төсөв ч 100');
  assert.equal(t1.rows[0][6].v, 60);
}

/* ══════════════ 4. null ≠ 0 — ХОЁР ТАЛ ══════════════ */
{
  seq = 0;
  /* (а) БҮГД хоосон → нийлбэр `null` → «—», 0 ₮ БИШ */
  const r = computeIpc([pay({ amount: null }), pay({ amount: '' })], NOW);
  assert.equal(r.value, '—', 'бүгд дүнгүй бол «—», 0 ₮ БИШ');
  assert.equal(r.level, 'warn', 'дүнгүй мөр нь өгөгдлийн цоорхойн дохио');
  const s = summarize([pay({ amount: null })]);
  assert.equal(s.paid, null);
  assert.equal(s.noAmount, 1);

  /* (б) ЖИНХЭНЭ тэг төлбөр — `null` БИШ, нийлбэрт орно */
  seq = 0;
  const z = summarize([pay({ amount: 0 })]);
  assert.equal(z.paid, 0, 'dun 0 нь жинхэнэ тэг олголт');
  assert.equal(z.noAmount, 0, '0 нь «бүртгэгдээгүй» БИШ');
  assert.equal(ipcLevel(z), 'good', 'тэг олголт нь өгөгдлийн алдаа БИШ');
}

/* ══════════════ 5. ТӨЛБӨРГҮЙ ГЭРЭЭ хүснэгт ══════════════
   `paidTotal === null` л орно; `paidTotal === 0` ОРОХГҮЙ. */
{
  seq = 0;
  const r = computeIpc([
    pay({ code: 'Багц-1', amount: 50, ipcNo: 1 }),
    pay({ code: 'Багц-6.3', pkg: 'Багц-6.3', amount: null }),
    pay({ code: 'Багц-7', pkg: 'Багц-7', amount: 0 }),
  ], NOW);
  const t = r.tables.find((x) => x.rows.length && x.cols.length === 4);
  assert.ok(t, '«Төлбөргүй гэрээ» хүснэгт бий');
  assert.deepEqual(t.rows.map((x) => x[0].v), ['Багц-6.3'],
    'зөвхөн ХЭМЖИГДЭЭГҮЙ гэрээ; 0 ₮ олгосон гэрээ ОРОХГҮЙ');
}

/* ══════════════ 6. ДИАПАЗОН мөр — багцад холбогдохгүй ══════════════
   `bagtsKey('Багц-1-4')` = `БАГЦ14` = БОДИТ Багц 14-ийн түлхүүр. `pkgKeyOf`
   `''` буцаадаг тул дүн буруу эзэнд наалдахгүй, гэхдээ АЛДАГДАХГҮЙ. */
{
  seq = 0;
  const rows = [
    pay({ code: 'Багц-1', pkg: 'Багц-1', amount: 100, ipcNo: 1 }),
    pay({ code: 'Багц-1-4', pkg: 'Багц-1-4', amount: 876, ipcNo: 1 }),
    pay({ code: 'БАГЦ-10,11,13,15', pkg: 'БАГЦ-10,  БАГЦ-11, БАГЦ-13, БАГЦ-15', amount: 5094, ipcNo: 1 }),
  ];
  const s = summarize(rows);
  assert.equal(s.unlinked, 2, 'хоёр диапазон мөр багцад холбогдохгүй');
  assert.equal(s.unlinkedPaid, 876 + 5094);
  assert.equal(s.paid, 100 + 876 + 5094, 'нийтэд АЛДАГДАХГҮЙ');
  assert.equal(ipcLevel(s), 'warn');

  const r = computeIpc(rows, NOW);
  const t = r.tables.find((x) => x.cols.length === 5);
  assert.ok(t, '«Багцад холбогдоогүй төлбөр» хүснэгт ЗААВАЛ');
  assert.equal(t.rows.length, 2);
  assert.deepEqual(t.rows.map((x) => x[3].v), [876, 5094]);
}

/* ══════════════ 7. Урьдчилгаа — дугаарлахгүй, «олгосон»-д ОРНО ══════════ */
{
  seq = 0;
  const rows = [
    pay({ kind: advance, ipcNo: null, amount: 314 }),
    pay({ kind: work, ipcNo: 1, amount: 216 }),
  ];
  const s = summarize(rows);
  assert.equal(s.advance, 314);
  assert.equal(s.work, 216);
  assert.equal(s.paid, 530, '«олгосон» = урьдчилгаа + гүйцэтгэл');

  const r = computeIpc(rows, NOW);
  assert.equal(r.value, '530 ₮');
  assert.equal(r.unit, 'олгосон санхүүжилт');
  assert.deepEqual(r.facts, [
    '1 гэрээ · 2 төлбөр', 'урьдчилгаа 314 ₮', 'гүйцэтгэл 216 ₮',
    'гэрээнд эзлэх 588.9%', 'хэмнэлт 10 ₮',
  ]);
  /* Урьдчилгаа мөрд `ipc_dugaar` null — «IPC-00» гэж БУРУУ дугаарлахгүй */
  assert.equal(r.issues.length, 0, 'бүх мөр эрүүл — анхааруулга алга');
}

/* ══════════════ 8. Кодгүй гэрээ ХАЯГДАХГҮЙ ══════════════ */
{
  seq = 0;
  const rows = [
    pay({ code: 'Багц-1', amount: 10, ipcNo: 1 }),
    pay({ code: null, pkg: null, amount: null, budget: 533, contract: 533 }),
  ];
  const s = summarize(rows);
  assert.equal(s.contracts, 2, 'кодгүй гэрээ ТУСДАА бүлэг');
  assert.equal(s.noCode, 1);
  assert.equal(s.budget, 100 + 533, 'кодгүй гэрээний төсөв нийтэд ҮЛДЭНЭ');
  assert.equal(ipcLevel(s), 'warn');

  const r = computeIpc(rows, NOW);
  assert.ok(r.issues.some((i) => /гэрээний код бүртгэгдээгүй/.test(i.text)));
  assert.ok(r.issues.every((i) => i.tone === 'warn'), 'bad дохио ЗОХИОХГҮЙ');
}

/* ══════════════ 9. IPC дугаарын ЦООРХОЙ — анхааруулга ══════════════ */
{
  seq = 0;
  const ok = computeIpc([
    pay({ ipcNo: 1, amount: 10 }), pay({ ipcNo: 2, amount: 20 }),
  ], NOW);
  assert.equal(ok.issues.length, 0, '1,2 — цоорхойгүй');

  seq = 0;
  const gap = computeIpc([
    pay({ ipcNo: 1, amount: 10 }), pay({ ipcNo: 2, amount: 20 }), pay({ ipcNo: 4, amount: 40 }),
  ], NOW);
  assert.ok(gap.issues.some((i) => /IPC дугаарын цоорхой: 3/.test(i.text)));
}

/* ══════════════ 10. Эрэмбэ — гэрээнд эзлэх хувь БАГА нь ЭХЭНД ══════════ */
{
  seq = 0;
  const r = computeIpc([
    pay({ code: 'A', pkg: 'Багц-1', contract: 100, amount: 90, ipcNo: 1 }),
    pay({ code: 'B', pkg: 'Багц-2', contract: 100, amount: 10, ipcNo: 1 }),
    pay({ code: 'D', pkg: 'Багц-3', contract: 100, amount: null }),
  ], NOW);
  const t1 = r.tables[0];
  assert.deepEqual(t1.rows.map((x) => x[0].v), ['B', 'A', 'D'],
    'хувь бага нь эхэнд, хэмжигдээгүй нь СҮҮЛД');
  assert.equal(t1.rows[2][7].v, null, 'хэмжигдээгүй хувь → «—», 0 БИШ');
  for (const row of t1.rows) assert.equal(row.length, 8);
}

/* ══════════════ 11. asOf — сүүлийн ГҮЙЛГЭЭНИЙ огноо ══════════════ */
{
  seq = 0;
  const r = computeIpc([
    pay({ amount: 1, ipcNo: 1, payDate: '2026-08-26' }),
    pay({ amount: 2, ipcNo: 2, payDate: '2026-07-01' }),
    pay({ amount: 3, ipcNo: 3, payDate: null }),
  ], NOW);
  assert.equal(r.asOf, Date.parse('2026-08-26'));

  seq = 0;
  const e = computeIpc([pay({ amount: 1, ipcNo: 1, payDate: Date.UTC(2026, 7, 1) })], NOW);
  assert.equal(e.asOf, Date.UTC(2026, 7, 1), 'epoch тоо ч ажиллана');

  seq = 0;
  const n = computeIpc([pay({ amount: 1, ipcNo: 1 })], NOW);
  assert.equal(n.asOf, null, 'гүйлгээний огноо огт байхгүй → null');
}

/* ══════════════ 12. Хязгаар — «… бас N мөр» ил ══════════════ */
{
  seq = 0;
  const many = Array.from({ length: ROW_CAP + 50 }, (_, i) => (
    pay({ code: `Багц-${i + 1}`, pkg: `Багц-${i + 1}`, amount: 10, ipcNo: 1 })
  ));
  const t = computeIpc(many, NOW).tables[0];
  assert.equal(t.rows.length, ROW_CAP + 1);
  assert.match(String(t.rows[ROW_CAP][0].v), /50/);
  assert.equal(t.rows[ROW_CAP].length, 8, 'тасалсан мөр ч 8 нүдтэй');
}

console.log('ipc.check: OK');
