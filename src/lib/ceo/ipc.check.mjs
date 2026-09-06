/**
 * IPC ҮЗҮҮЛЭЛТИЙН ШАЛГУУР — сүлжээгүй, жинхэнэ `computeIpc`-ийг импортолно.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/ipc.check.mjs
 *
 * Ямар БОДИТ алдаанаас хамгаалж байгаа вэ:
 *  1. IPC18 хоосон акт 0 болж нийлбэрийг доош татах (2026-09-04, I30 акт
 *     −2.07 тэрбум). Дүнгүй акт нийлбэрт ОРОХГҮЙ, бүгд дүнгүй бол «—».
 *  2. Хугацаа хэтэрсэн эсэхийг ӨДРӨӨР харьцуулах — өнөөдөр төлөх акт
 *     «хэтэрсэн» биш; өчигдрийнх хэтэрсэн.
 *  3. Жагсаалт БҮРЭН, нэртэй — 300-аас дээш бол «… бас N мөр» мөр ил.
 *  4. Гүйлгээ (`paid`) нь бодит тул 0 = 0, харин олгох дүн null = null.
 */

import assert from 'node:assert/strict';
import {
  computeIpc, toAct, summarize, ipcLevel, dayOf, todayOf, isOverdue, overdueDays,
} from './ipc.ts';
import { IPC_LOG } from '../services.ts';
import { ROW_CAP } from './kpi.ts';

const F = IPC_LOG.fields;
const { approved, review } = IPC_LOG.statuses;

/* ⚠️ Өдрийн ДУНД (12:00Z) — локал өдөр нь UTC−12…UTC+11 бүсэд 2026-09-06 */
const NOW = Date.UTC(2026, 8, 6, 12, 0, 0);
assert.equal(todayOf(NOW), '2026-09-06');

let seq = 0;
const act = (o) => ({
  [F.id]: `I${++seq}`,
  [F.kind]: IPC_LOG.kinds.work,
  [F.no]: seq,
  [F.pkg]: 'Багц 4',
  [F.pkg2]: o.pkg2 ?? 'Багц 4-1',
  [F.contractor]: o.contractor ?? '"ББСМО" ХХК',
  [F.status]: o.status ?? approved,
  [F.gross]: o.gross ?? null,
  [F.clientDeduct]: o.deduct ?? null,
  [F.paid]: o.paid ?? null,
  [F.dueDate]: o.due ?? null,
  [F.payDate]: o.payDate ?? null,
  [F.periodFrom]: o.from ?? null,
  [F.periodTo]: o.to ?? null,
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

/* ══════════════ 3. Холимог багц ══════════════ */
seq = 0;
const rows = [
  // A1 — хэтэрсэн: net 90, paid 50, due 40, 2026-08-01
  act({ gross: 100, deduct: 10, paid: 50, due: '2026-08-01', payDate: '2026-08-15' }),
  // A2 — хянагдаж буй, ирээдүйн огноо: net 200, due 200
  act({ status: review, gross: 200, due: '2026-12-01', from: '2026-07-01', to: '2026-07-31' }),
  // A3 — IPC18 хоосон, гэвч гүйлгээ 30 (бодит)
  act({ gross: null, paid: 30, payDate: '2026-08-20' }),
  // A4 — бүрэн төлөгдсөн: due 0 → хүснэгт 1-д ОРОХГҮЙ
  act({ gross: 100, paid: 100, due: '2026-01-01' }),
  // A5 — сөрөг олголт (өгөгдлийн алдаа): net −40
  act({ gross: 10, deduct: 50, due: '2026-01-01' }),
  // A6 — үлдэгдэлтэй, огноогүй → хүснэгт 1-ийн СҮҮЛД
  act({ gross: 100, pkg2: '', contractor: 'Х ХХК' }),
  // A7 — хянагдаж буй БӨГӨӨД дүнгүй
  act({ status: review, gross: '' }),
  // A8 — ӨНӨӨДӨР төлөх: хэтэрсэн БИШ
  act({ gross: 50, due: '2026-09-06' }),
  // A9 — ӨЧИГДӨР төлөх: хэтэрсэн, 1 хоног
  act({ gross: 60, due: '2026-09-05' }),
];
const acts = rows.map(toAct);
const today = todayOf(NOW);

assert.equal(acts[0].code, 'IPC-01');
assert.equal(acts[5].pkg, 'Багц 4', 'дэд багц хоосон бол үндсэн багц');
assert.equal(acts[2].net, null, 'IPC18 хоосон → null, 0 БИШ');
assert.equal(acts[2].paid, 30, 'гүйлгээ нь бодит тоо');
assert.equal(acts[2].due, null, 'олгох дүн мэдэгдэхгүй бол үлдэгдэл ч мэдэгдэхгүй');
assert.equal(acts[6].net, null, '"" ч мөн хоосон');

assert.equal(isOverdue(acts[0], today), true);
assert.equal(overdueDays(acts[0], today), 36);
assert.equal(isOverdue(acts[7], today), false, 'өнөөдөр төлөх — хэтрээгүй');
assert.equal(isOverdue(acts[8], today), true, 'өчигдөр төлөх — хэтэрсэн');
assert.equal(overdueDays(acts[8], today), 1);
assert.equal(isOverdue(acts[3], today), false, 'due 0 — хэтэрсэнд тооцохгүй');
assert.equal(isOverdue(acts[4], today), false, 'сөрөг due — хэтэрсэнд тооцохгүй');
assert.equal(isOverdue(acts[5], today), false, 'огноогүй — хэтэрсэнд тооцохгүй');

const s = summarize(acts, today);
assert.equal(s.n, 9);
assert.equal(s.paidTotal, 180);
assert.equal(s.netTotal, 90 + 200 + 100 - 40 + 100 + 50 + 60);
assert.equal(s.dueTotal, 40 + 200 + 0 - 40 + 100 + 50 + 60);
assert.deepEqual(s.reviewing, { count: 2, net: 200 });
assert.equal(s.noAmount, 2);
assert.deepEqual(s.overdue, { count: 2, due: 100 });
assert.equal(s.negative, 1);
assert.equal(ipcLevel(s), 'bad');

const r = computeIpc(rows, NOW);
assert.equal(r.value, '410 ₮');
assert.equal(r.level, 'bad');
assert.deepEqual(r.facts, [
  '9 акт нийт', 'олгосон 180 ₮', 'хянагдаж буй 2 акт', 'хугацаа хэтэрсэн 2', 'дүнгүй 2 акт',
]);
assert.equal(r.asOf, Date.parse('2026-08-20'), 'asOf = сүүлийн гүйлгээний огноо');

/* Хүснэгт 1 — эрэмбэ: огноогоор өсөх, огноогүй сүүлд */
assert.equal(r.tables.length, 3);
const t1 = r.tables[0];
assert.equal(t1.cols.length, 8);
assert.deepEqual(t1.rows.map((x) => x[0].v), [
  'IPC-01', 'IPC-09', 'IPC-08', 'IPC-02', 'IPC-06',
]);
assert.deepEqual(t1.rows[0].slice(4, 7).map((c) => [c.v, c.kind]), [[90, 'mnt'], [50, 'mnt'], [40, 'mnt']]);
assert.equal(t1.rows[4][7].v, '—', 'огноогүй акт — «—»');
for (const row of t1.rows) assert.equal(row.length, 8);

/* Хүснэгт 2 — хянагдаж буй: дүнтэй нь эхэнд, дүнгүй нь null нүдтэй.
   Хамрах хугацаа = ХОЁР багана (эхлэх · дуусах), огноогүй бол «—». */
const t2 = r.tables[1];
assert.equal(t2.cols.length, 6);
assert.deepEqual(t2.rows.map((x) => x[0].v), ['IPC-02', 'IPC-07']);
assert.equal(t2.rows[0][5].v, 200);
assert.equal(t2.rows[1][5].v, null, 'дүнгүй акт → null нүд, 0 БИШ');
assert.equal(String(t2.rows[0][3].v).length > 5, true, 'хамрах хугацаа: эхлэх бичигдсэн');
assert.equal(String(t2.rows[0][4].v).length > 5, true, 'хамрах хугацаа: дуусах бичигдсэн');
assert.equal(t2.rows[1][3].v, '—');
assert.equal(t2.rows[1][4].v, '—');
for (const row of t2.rows) assert.equal(row.length, 6);

/* Хүснэгт 3 — дүнгүй */
const t3 = r.tables[2];
assert.deepEqual(t3.rows.map((x) => x[0].v).sort(), ['IPC-03', 'IPC-07']);

/* Анхааруулга — хэтэрсэн (хоног ихээр нь), дараа нь сөрөг олголт */
assert.equal(r.issues.length, 3);
assert.equal(r.issues[0].tone, 'bad');
assert.match(r.issues[0].text, /^IPC-01 · Багц 4-1 — 36 хоног хэтэрсэн, 40 ₮$/);
assert.match(r.issues[1].text, /^IPC-09 .* 1 хоног хэтэрсэн, 60 ₮$/);
assert.equal(r.issues[2].tone, 'warn');
assert.match(r.issues[2].text, /^IPC-05 · Багц 4-1 — олгох дүн сөрөг, -40 ₮$/);

/* ══════════════ 4. Бүгд дүнгүй → «—», warn ══════════════ */
{
  seq = 0;
  const rr = computeIpc([act({ gross: null, paid: 5 }), act({ gross: '' })], NOW);
  assert.equal(rr.value, '—', 'бүгд дүнгүй бол үлдэгдэл «—», 0 ₮ БИШ');
  assert.equal(rr.level, 'warn');
  assert.equal(rr.facts[1], 'олгосон 5 ₮');
  assert.equal(rr.tables.length, 1, 'зөвхөн «дүнгүй акт» хүснэгт');
  assert.equal(rr.tables[0].rows.length, 2);
  assert.equal(rr.asOf, null);
}

/* ══════════════ 5. Бүгд хэвийн → good ══════════════ */
{
  seq = 0;
  const rr = computeIpc([
    act({ gross: 100, paid: 100, due: '2026-01-01', payDate: '2026-02-01' }),
    act({ gross: 100, due: '2026-12-01' }),
  ], NOW);
  assert.equal(rr.level, 'good');
  assert.equal(rr.value, '100 ₮');
  assert.equal(rr.tables.length, 1);
  assert.equal(rr.issues.length, 0);
}

/* ══════════════ 6. Хязгаар — «… бас N мөр» ил ══════════════ */
{
  seq = 0;
  const many = Array.from({ length: ROW_CAP + 50 }, () => act({ gross: 100, due: '2026-12-01' }));
  const rr = computeIpc(many, NOW);
  const t = rr.tables[0];
  assert.equal(t.rows.length, ROW_CAP + 1);
  assert.match(String(t.rows[ROW_CAP][0].v), /50/);
  assert.equal(t.rows[ROW_CAP].length, 8, 'тасалсан мөр ч 8 нүдтэй');
}

/* ══════════════ 7. asOf epoch тоогоор ══════════════ */
{
  seq = 0;
  const rr = computeIpc([act({ gross: 1, payDate: Date.UTC(2026, 7, 1) })], NOW);
  assert.equal(rr.asOf, Date.UTC(2026, 7, 1));
}

console.log('ipc.check: OK');
