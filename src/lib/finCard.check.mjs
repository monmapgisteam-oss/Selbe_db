/**
 * КАРТЫН ӨГӨГДЛИЙН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/finCard.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. МӨР АЛДАГДАХ. Паспорт/хуваарь болгож салгахад оруулсан мөрийн тоо
 *      гаралтын тоотой ЯГ тэнцүү байх ёстой — алга болсон мөр засварт ч
 *      харагдахгүй.
 *   2. МАСТЕРГҮЙ ҮЕИЙН МӨР ХАЯГДАХ. Дата бохир үед гэрээний код нь мастергүй
 *      байж болно — тэдгээр нь `master: null` гэрээнд үлдэх ёстой.
 *   3. `null` ≠ `0`. Бүх мөр хоосон талбарын НИЙТ нь `null` — 0 гэж бичвэл
 *      «дүнгүй» ба «тэг» нэгдэж НИЙТ мөр худал уншигдана. Мөн дүнгүй актын
 *      цэвэр дүн `null`.
 *      ⚠️ 2026-09-04: урьд нь энд «`services.ipcNet` нь 0 болгодог — түүнийг
 *      энд ХЭРЭГЛЭХГҮЙ байгаагийн шалтгаан» гэж бичсэн нь ОДОО ХУДАЛ:
 *      `ipcNet` өөрөө `null` буцаадаг болов. `netOrNull` энд хэвээр үлдэх
 *      шалтгаан нь зөвхөн `services`-ийн ArcGIS хамаарлыг Node шалгуурт
 *      татахгүй байх явдал.
 *   4. ТАЛБАРЫН БҮРТГЭЛ ЗӨРӨХ. Хуваарийн талбарууд `CASHFLOW2`-ийн бодит
 *      кодуудтай таарахгүй бол багана чимээгүй хоосорно.
 */
import assert from 'node:assert/strict';
import {
  CF_PERIOD_FIELDS, splitContracts, sumOrNull,
  IPC_MAIN_FIELDS, dedOrNull, paidOrNull, netOrNull, netTotalOrNull,
  groupPeriodsByYear, usedFields, CF_KPI_FIELDS, CF_PASS_GROUPS,
} from './finCard.ts';
import { CASHFLOW2, IPC_LOG } from './services.ts';
import { FIN_FIELD_LABELS } from './financeFieldLabels.ts';

const CF = CASHFLOW2.fields;
const IP = IPC_LOG.fields;
const g = (row, oid = null) => ({ row, oid });
const total = (cs) => cs.reduce((a, c) => a + c.periods.length + (c.master ? 1 : 0), 0);

/* ── 1. Салгалт: мастер паспортдоо, үе хуваарьдаа, эх дараалал ── */
{
  const rows = [
    g({ [CF.geree]: 'G08', [CF.rowType]: 'ГЭРЭЭ', [CF.name]: 'Ажил 1' }, 15),
    g({ [CF.geree]: 'G08', [CF.rowType]: 'САР', [CF.year]: 2025, [CF.amount]: 100 }, 16),
    g({ [CF.geree]: 'G08', [CF.rowType]: 'САР', [CF.year]: 2026, [CF.amount]: 200 }, 17),
    g({ [CF.geree]: 'G09', [CF.rowType]: 'ГЭРЭЭ', [CF.name]: 'Ажил 2' }, 21),
    g({ [CF.geree]: 'G09', [CF.rowType]: 'ӨМНӨХ ШИЛЖҮҮЛСЭН', [CF.amount]: 5 }, 22),
  ];
  const cs = splitContracts(rows);
  assert.equal(cs.length, 2, 'хоёр гэрээ');
  assert.equal(total(cs), rows.length, 'мөр АЛДАГДААГҮЙ');
  assert.deepEqual(cs.map((c) => c.geree), ['G08', 'G09'], 'эх дараалал');
  assert.equal(cs[0].master.oid, 15);
  assert.deepEqual(cs[0].periods.map((p) => p.oid), [16, 17]);
  assert.equal(cs[1].periods.length, 1, 'ӨМНӨХ ШИЛЖҮҮЛСЭН нь үеийн мөр');
}

/* ── 2. Мастергүй үеийн мөр — хаягдахгүй ── */
{
  const cs = splitContracts([g({ [CF.geree]: 'G77', [CF.rowType]: 'САР', [CF.amount]: 9 }, 1)]);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].master, null, 'мастергүй — паспорт null');
  assert.equal(cs[0].periods.length, 1);
}

/* ── 3. ХОЁР мастер (дата бохир) — хоёр дахь нь үеийн мөрд, алга болохгүй ── */
{
  const cs = splitContracts([
    g({ [CF.geree]: 'G01', [CF.rowType]: 'ГЭРЭЭ' }, 1),
    g({ [CF.geree]: 'G01', [CF.rowType]: 'ГЭРЭЭ' }, 2),
  ]);
  assert.equal(cs[0].master.oid, 1);
  assert.equal(cs[0].periods.length, 1, 'давхар мастер ХАЯГДААГҮЙ');
}

/* ── 4. sumOrNull — null ≠ 0 ── */
{
  assert.equal(sumOrNull([{ a: 100 }, { a: null }, { a: 200 }], 'a'), 300);
  assert.equal(sumOrNull([{ a: null }, { a: '' }], 'a'), null, 'бүгд хоосон → null, 0 БИШ');
  assert.equal(sumOrNull([{ a: 0 }], 'a'), 0, 'бодит 0 нь 0 хэвээр');
  assert.equal(sumOrNull([], 'a'), null);
}

/* ── 5. Хуваарийн талбарууд бодит кодтой таарна ── */
{
  for (const n of CF_PERIOD_FIELDS) {
    assert.ok(n in FIN_FIELD_LABELS, `хуваарийн талбар ${n} толинд алга`);
  }
  assert.deepEqual(
    CF_PERIOD_FIELDS.slice(0, 3), [CF.year, CF.monthNo, CF.amount],
    'он · сар · дүн эхэнд',
  );
  assert.ok(CF_PERIOD_FIELDS.includes('CF010'), 'эх үүсвэрийн задаргаа орсон');
  assert.ok(!CF_PERIOD_FIELDS.includes(CF.budget), 'төсөв нь ПАСПОРТЫН талбар');
  assert.ok(!CF_PERIOD_FIELDS.includes(CF.rowType), 'мөрийн төрөл багана БИШ');
}

/* ── 6. IPC — суутгал · цэвэр · шилжүүлсэн null-ухаантай ── */
{
  const act = {
    [IP.gross]: 1000,
    [IP.clientDeduct]: 50, [IP.advanceRecovery]: 100, [IP.retention]: 30, [IP.authorDeduct]: 20,
    [IP.paid]: 400, [IP.paid2]: 200,
  };
  assert.equal(dedOrNull(act), 200);
  assert.equal(netOrNull(act), 800);
  assert.equal(paidOrNull(act), 600);

  const empty = { [IP.gross]: null };
  assert.equal(dedOrNull(empty), null, 'суутгалгүй → null (0 БИШ)');
  assert.equal(netOrNull(empty), null, 'дүнгүй актын цэвэр нь null (2026-09-04: ipcNet ч мөн null буцаадаг болов)');
  assert.equal(paidOrNull(empty), null);

  assert.equal(netOrNull({ [IP.gross]: 500 }), 500, 'суутгал хоосон бол цэвэр = бүтэн');
  assert.equal(netTotalOrNull([act, empty]), 800, 'дүнгүй акт нийтэд орохгүй');
  assert.equal(netTotalOrNull([empty]), null);
}

/* ── 7. IPC-ийн үндсэн баганууд толинд байгаа, тооцоологдох талбар давхардаагүй ── */
{
  for (const n of IPC_MAIN_FIELDS) {
    assert.ok(n in FIN_FIELD_LABELS, `IPC баганын талбар ${n} толинд алга`);
  }
  for (const d of IPC_LOG.deductions) {
    assert.ok(!IPC_MAIN_FIELDS.includes(d), 'суутгалын талбар үндсэн баганад давхардахгүй — бодогдсон нийлбэр нь тэнд');
  }
}
/* ── 8. Он дотроо сар сараар — эрэмбэ, бүлэглэлт, мөр алдагдахгүй ── */
{
  const P = (oid, year, mo, extra = {}) => ({ row: { [CF.year]: year, [CF.monthNo]: mo, ...extra }, oid });
  const ys = groupPeriodsByYear([
    P(1, 2026, 7), P(2, 2025, 10), P(3, 2026, 6), P(4, null, null), P(5, 2025, 12),
  ]);
  assert.deepEqual(ys.map((y) => y.year), ['2025', '2026', ''], 'он өсөхөөр, онгүй нь төгсгөлд');
  assert.deepEqual(ys[0].rows.map((r) => r.oid), [2, 5], 'он дотроо сараар');
  assert.deepEqual(ys[1].rows.map((r) => r.oid), [3, 1]);
  assert.equal(ys.reduce((a, y) => a + y.rows.length, 0), 5, 'мөр АЛДАГДААГҮЙ');
  assert.deepEqual(groupPeriodsByYear([]), []);
}
/* ── 9. Уншлагын карт — талбар АЛДАГДАХГҮЙ бүлэглэлт, утгатай нь л үлдэх ── */
{
  assert.deepEqual(usedFields([{ a: 1, b: null }, { a: null, b: '' }], ['a', 'b', 'c']), ['a'],
    'утгагүй талбар шүүгдэнэ');
  assert.deepEqual(usedFields([{ a: 0 }], ['a']), ['a'], 'бодит 0 нь УТГА');

  /* Паспортын БҮХ талбар яг нэг газар: нэр (CF017) толгойд, KPI, эсвэл бүлэгт */
  const covered = new Set([CF.name, ...CF_KPI_FIELDS, ...CF_PASS_GROUPS.flatMap((x) => x.fields)]);
  const expected = Object.keys(FIN_FIELD_LABELS)
    .filter((k) => k.startsWith('CF'))
    .filter((k) => k !== CF.geree && k !== CF.rowType)
    .filter((k) => !CF_PERIOD_FIELDS.includes(k));
  for (const k of expected) assert.ok(covered.has(k), `паспортын талбар ${k} бүлэглэлд АЛГА — мэдээлэл алдагдана`);
  for (const k of covered) assert.ok(expected.includes(k), `${k} нь паспортын талбар БИШ атлаа бүлэгт орсон`);
  const all = CF_PASS_GROUPS.flatMap((x) => x.fields);
  assert.equal(new Set(all).size, all.length, 'нэг талбар хоёр бүлэгт давхардаагүй');
}

console.log('finCard.check.mjs — БҮГД ТЭНЦЛЭЭ');
