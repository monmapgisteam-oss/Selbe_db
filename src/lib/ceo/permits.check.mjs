/**
 * CEO «Зөвшөөрөл» үзүүлэлтийн ЦЭВЭР тооцооны шалгуур (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ceo/permits.check.mjs
 *
 * Хамгаалж буй зүйлс:
 *   · `null` (үйлчилгээ унасан) ≠ `[]` (бүртгэл хоосон) — unknown vs neutral;
 *   · танигдаагүй төлөв нь bad, зөвхөн хүлээгдэж буй нь warn;
 *   · шийдэгдээгүй мөр бүр НЭРЭЭР нь хүснэгтэд, муу нь эхэнд;
 *   · багцын тоолуур мөрийн тоотой ЯГ таарна (танигдаагүй ч тоологдоно);
 *   · asOf нь хамгийн сүүлийн огноо, огноогүй бол null.
 */
import assert from 'node:assert/strict';
import { computePermits, compareZov, TOLOV_RANK } from './permits.ts';
import { TOLOV } from '@/lib/zovshoorol.ts';

const z = (o) => ({
  oid: 1, bagts: 'Багц 1', shat: 1, ner: 'Нэр', selbe: '', tolov: TOLOV.ok,
  ognoo: null, dugaar: '', baiguullaga: '', hariutsagch: '', tailbar: '', ...o,
});

/* 1. Үйлчилгээ уншигдаагүй → unknown, «—», failedSources */
{
  const r = computePermits(null);
  assert.equal(r.level, 'unknown');
  assert.equal(r.value, '—');
  assert.equal(r.failedSources.length, 1);
  assert.deepEqual(r.tables, []);
  assert.deepEqual(r.facts, []);
  assert.equal(r.asOf, null);
}

/* 2. Хоосон бүртгэл → neutral (null-аас ЯЛГААТАЙ) */
{
  const r = computePermits([]);
  assert.equal(r.level, 'neutral');
  assert.equal(r.value, '0');
  assert.deepEqual(r.failedSources, []);
  assert.equal(r.asOf, null);
}

/* 3. Бүгд зөвшөөрсөн → good, шийдэгдээгүй хүснэгт ГАРАХГҮЙ, багцаар ГАРНА */
{
  const r = computePermits([
    z({ oid: 1, ognoo: 1_000 }),
    z({ oid: 2, shat: 2, ognoo: 5_000 }),
  ]);
  assert.equal(r.level, 'good');
  assert.equal(r.value, '0');
  assert.equal(r.tables.length, 1);
  assert.equal(r.tables[0].rows.length, 1);
  assert.equal(r.tables[0].rows[0][1].v, 2, 'зөвшөөрсөн тоолуур');
  assert.equal(r.asOf, 5_000, 'asOf = хамгийн сүүлийн огноо');
  assert.deepEqual(r.issues, []);
}

/* 4. Зөвхөн хүлээгдэж буй → warn; issues хоосон (bad биш) */
{
  const r = computePermits([z({ oid: 1, tolov: TOLOV.wait })]);
  assert.equal(r.level, 'warn');
  assert.equal(r.value, '1');
  assert.deepEqual(r.issues, []);
  assert.equal(r.tables[0].rows.length, 1);
}

/* 5. Танигдаагүй төлөв ГАНЦ ч байвал bad + нэртэй issue */
{
  const r = computePermits([
    z({ oid: 1, ner: 'Гал түймрийн дүгнэлт' }),
    z({ oid: 2, shat: 2, ner: 'Хог хаягдал', tolov: 'unknown' }),
  ]);
  assert.equal(r.level, 'bad');
  assert.equal(r.value, '1');
  assert.equal(r.issues.length, 1);
  assert.match(r.issues[0].text, /Хог хаягдал/);
  assert.match(r.issues[0].text, /танигдаагүй/);
  assert.equal(r.issues[0].tone, 'bad');
}

/* 6. Холимог: эрэмбэ (no → unknown → wait), багцын тоолуур, facts, asOf */
{
  const rows = [
    z({ oid: 1, bagts: 'Багц 2', shat: 3, ner: 'W', tolov: TOLOV.wait }),
    z({ oid: 2, bagts: 'Багц 1', shat: 2, ner: 'U', tolov: 'unknown' }),
    z({ oid: 3, bagts: 'Багц 3', shat: 1, ner: 'N3', tolov: TOLOV.no, ognoo: 9_000 }),
    z({ oid: 4, bagts: 'Багц 1', shat: 5, ner: 'N1', tolov: TOLOV.no, ognoo: 7_000 }),
    z({ oid: 5, bagts: 'Багц 1', shat: 1, ner: 'OK', ognoo: 3_000 }),
    z({ oid: 6, bagts: '', shat: 0, ner: '', tolov: TOLOV.wait }),
  ];
  const r = computePermits(rows);
  assert.equal(r.level, 'bad');
  assert.equal(r.value, '5', 'wait 2 + no 2 + unknown 1');
  assert.equal(r.asOf, 9_000);
  assert.equal(r.facts.length, 4);
  assert.ok(r.facts.some((f) => f.includes('2') && f.includes('зөвшөөрөөгүй')));
  assert.ok(r.facts.some((f) => f.includes('1 / 6')), 'зөвшөөрсөн 1 / 6');

  /* Хүснэгт 1 — шийдэгдээгүй 5 мөр, муу нь эхэнд */
  const t1 = r.tables[0];
  assert.equal(t1.cols.length, 7);
  assert.equal(t1.rows.length, 5);
  assert.deepEqual(t1.rows.map((row) => row[2].v), ['N1', 'N3', 'U', null, 'W'],
    'эрэмбэ: no (Багц 1, Багц 3) → unknown → wait (хоосон багц эхэнд, дараа нь Багц 2)');
  for (const row of t1.rows) assert.equal(row.length, 7);
  /* Хоосон талбар → null («—»), 0 биш; shat = 0 → null */
  const blank = t1.rows[3];
  assert.equal(blank[0].v, null);
  assert.equal(blank[1].v, null);
  assert.equal(blank[2].v, null);

  /* Хүснэгт 2 — багцаар, тоолуурын нийлбэр = мөрийн тоо */
  const t2 = r.tables[1];
  assert.equal(t2.cols.length, 5);
  assert.equal(t2.rows.length, 4, '3 нэртэй багц + 1 тодорхойгүй');
  const sum = t2.rows.reduce((a, row) => a + row[1].v + row[2].v + row[3].v + row[4].v, 0);
  assert.equal(sum, rows.length, 'танигдаагүй ч тоологдоно');
  assert.equal(t2.rows[0][0].v, 'Багц 1', 'хамгийн муу багц эхэнд');
  assert.deepEqual(t2.rows[0].slice(1).map((c) => c.v), [1, 0, 1, 1]);

  /* issues — no + unknown = 3, муу нь эхэнд */
  assert.equal(r.issues.length, 3);
  assert.match(r.issues[0].text, /^Багц 1 · N1 — /);
  assert.match(r.issues[2].text, /U — танигдаагүй/);
}

/* 7. Эрэмбийн тогтмол — муу нь бага тоотой */
assert.ok(TOLOV_RANK[TOLOV.no] < TOLOV_RANK.unknown);
assert.ok(TOLOV_RANK.unknown < TOLOV_RANK[TOLOV.wait]);
assert.ok(TOLOV_RANK[TOLOV.wait] < TOLOV_RANK[TOLOV.ok]);
assert.ok(compareZov(z({ tolov: TOLOV.no }), z({ tolov: TOLOV.wait })) < 0);
assert.ok(compareZov(z({ shat: 1 }), z({ shat: 2 })) < 0);

console.log('✅ permits.check — 7 бүлэг шалгуур давлаа');
