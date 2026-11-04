/**
 * ЖААЗ ТУХАЙН ӨДРИЙН АЖЛЫГ ХАДГАЛНА (2026-11-04, хэрэглэгч: «бөглөлт бүр тухайн өдрийнхийг л хадгална, нийлбэр архиваар
 * бодогдоно»). Хамгаалж буй гэрээ:
 *   1. `priorObyem` — өмнөх өдрүүдийн жаазуудын `*_obyem` мөрийн түлхүүрээр нийлбэрлэгдэнэ; нэг өдрийн хоёр жаазаас сүүлийнх л.
 *   2. `loadRows` — санах ойд `obyem` = хуримтлал, `obyemDay` = тэр өдрийнх, `obyemBase` = ачаалсан хуримтлал.
 *   3. `buildFrame` — жаазанд бичигдэх `*_obyem` = шинэ хуримтлал − ачаалсан хуримтлал; шинэ мөр бүтнээрээ; цэвэрлэсэн нүд −base.
 *   4. `snapshotDayOf` — IPC-ийн AUTO мөр тухайн өдрийн дүн.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/sheet/perDay.check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fake, addTable } from '@/lib/arcgisFake.mjs';
import { loadRows, priorObyem, dropPriorCache, frameRowKeys } from './bagtsSheet.ts';
import { buildFrame, dayObyem, dayObyemSum } from './sheetFrame.ts';
import { snapshotDayOf, snapshotOf } from '@/lib/ipcLink';

const D = (s) => Date.parse(`${s}T00:00:00Z`);
const URL = 'https://gis.selbecity.mn/map/rest/services/Hosted/Test_sheet/FeatureServer/9';
const pkg = { key: 'tst', url: URL, group: 'Багц Т', label: 'Багц Т', floors: 9 };
const sc = {
  bld: ['5/1', '5/2'], act: ['a0', 'a1'], plan: ['p0', 'p1'], obyem: ['o0', 'o1'],
  start: [null, null], end: [null, null], gStart: [null, null], gEnd: [null, null], aStart: [null, null], aEnd: [null, null],
  f: {
    oid: 'objectid', no: 'no', work: 'work', gun: 'gun', wC: null, wD: null, wE: null, vol: 'vol', obyemSum: 'osum', unit: 'unit',
    money: null, plan: null, act: null, ratio: null, asOf: 'asof', fillDate: 'fill', des: null, ham: null, hunHuch: null, mashin: null,
    plannedVol: null,
  },
  synthetic: false,
};
const T = addTable(URL, { oid: 'objectid' });
/* Жааз: 3 мөр (Б толгой, 1 Шороо, 2 Бетон) */
const frame = (day, vals, tag = '') => {
  const f = day ? D(day) + 12 * 3600_000 : null;
  const rows = [
    { no: 'Б', work: `БАРИЛГА${tag}`, gun: 0, fill: f, vol: null, unit: null, o0: null, o1: null, osum: null },
    { no: '1', work: 'Шороо', gun: 1, fill: f, vol: 100, unit: 10, o0: vals[0][0], o1: vals[0][1], osum: (vals[0][0] ?? 0) + (vals[0][1] ?? 0) },
    { no: '2', work: 'Бетон', gun: 1, fill: f, vol: 50, unit: 20, o0: vals[1][0], o1: vals[1][1], osum: (vals[1][0] ?? 0) + (vals[1][1] ?? 0) },
  ];
  return rows.map((r) => T.insert(r));
};
frame('2026-01-01', [[5, 3], [8, null]]);
frame('2026-01-10', [[9, 9], [9, 9]]);          // ижил өдрийн ХУУЧИН (тасарсан гэж үзэхгүй, урт тэнцүү) — сүүлийнх л тоологдоно
frame('2026-01-10', [[2, null], [1, 4]]);
frame('2026-01-20', [[1, 1], [null, null]]);

/* ── 1. priorObyem ── */
{
  const pr = await priorObyem(pkg, sc, '2026-01-20');
  const k = (no, work) => `${no} ¦ ${work} #0`;
  assert.deepEqual(pr.get(k('1', 'Шороо')), [7, 3], '01-01 + 01-10 (сүүлийн жааз): 5+2, 3+null');
  assert.deepEqual(pr.get(k('2', 'Бетон')), [9, 4], '8+1, null+4');
  assert.deepEqual(pr.get(k('Б', 'БАРИЛГА')), [null, null], 'бүлгийн мөр хоосон');
  const pr1 = await priorObyem(pkg, sc, '2026-01-05');
  assert.deepEqual(pr1.get(k('1', 'Шороо')), [5, 3], 'зөвхөн 01-01');
  assert.equal((await priorObyem(pkg, sc, '2026-01-01')).size, 0, 'өмнөх жаазгүй');
  const q0 = fake.count('rest', 'query');
  await priorObyem(pkg, sc, '2026-01-20');
  assert.equal(fake.count('rest', 'query'), q0, 'кэш — дахин татахгүй');
  dropPriorCache(pkg.key);
  await priorObyem(pkg, sc, '2026-01-20');
  assert.equal(fake.count('rest', 'query'), q0 + 1, 'кэш хаягдсаны дараа дахин татна');
  assert.deepEqual(frameRowKeys([{ attributes: { no: '1', work: 'x' } }, { attributes: { no: '1', work: 'x' } }], sc), ['1 ¦ x #0', '1 ¦ x #1'], 'давхар мөр ялгарна');
  console.log('✅ priorObyem — өмнөх жаазуудын нийлбэр · ижил өдрийн сүүлийн жааз · кэш');
}

/* ── 2. loadRows — хуримтлал санах ойд, өдрийнх тусдаа ── */
{
  const r = await loadRows(pkg, sc, '2026-01-20');
  const sh = r.rows.find((x) => x.no === '1');
  const be = r.rows.find((x) => x.no === '2');
  assert.deepEqual(sh.obyemDay, [1, 1], 'жаазанд хадгалсан өдрийн ажил');
  assert.deepEqual(sh.obyem, [8, 4], 'хуримтлал = 7+1, 3+1');
  assert.deepEqual(sh.obyemBase, [8, 4], 'ачаалсан хуримтлал');
  assert.deepEqual(be.obyem, [9, 4], 'энэ өдөр хоосон бол хуримтлал өмнөхөөрөө');
  assert.deepEqual(be.obyemDay, [null, null]);
  const first = await loadRows(pkg, sc, '2026-01-01');
  assert.deepEqual(first.rows.find((x) => x.no === '1').obyem, [5, 3], 'анхны жааз — хуримтлал = өөрийнх');
  /* талбар хязгаарласан ч обьём татаж байвал огнооны талбар автоматаар нэмэгдэж хуримтлал бодогдоно */
  const lim = await loadRows(pkg, sc, '2026-01-20', ['objectid', 'no', 'work', 'gun', 'o0', 'o1']);
  assert.deepEqual(lim.rows.find((x) => x.no === '1').obyem, [8, 4], 'хязгаарласан талбартай ч хуримтлал');
  console.log('✅ loadRows — obyem хуримтлал · obyemDay өдрийнх · obyemBase');
}

/* ── 3. buildFrame — жаазанд өдрийн ажил бичигдэнэ ── */
{
  assert.equal(dayObyem(10, 7), 3);
  assert.equal(dayObyem(10, null), 10, 'суурьгүй (шинэ мөр) — бүтнээрээ');
  assert.equal(dayObyem(null, 7), -7, 'цэвэрлэсэн нүд — хуримтлал 0 болтол хасна');
  assert.equal(dayObyem(null, null), null);
  assert.equal(dayObyem(0.3, 0.1), 0.2, 'хөвөгч таслалын шуугиангүй');
  assert.equal(dayObyemSum(sc, [10, 4], [7, 4]), 3);
  const r = await loadRows(pkg, sc, '2026-01-20');
  const rows = r.rows.map((x) => ({ ...x, obyem: x.obyem.slice(), act: x.act.slice() }));
  const sh = rows.find((x) => x.no === '1');
  sh.obyem = [11, 4]; // 8 → 11 (өдрийн ажил 3), 4 хэвээр
  const be = rows.find((x) => x.no === '2');
  be.obyem = [null, 4]; // блок 0 цэвэрлэв (9 → 0), 4 хэвээр
  const fr = buildFrame(rows, sc, 2, null, [true, true], D('2026-02-01'));
  const f1 = fr.find((a) => a.no === '1');
  const f2 = fr.find((a) => a.no === '2');
  assert.equal(f1.o0, 3, 'өдрийн ажил = 11 − 8');
  assert.equal(f1.o1, 0, 'өөрчлөлтгүй блок 0');
  assert.equal(f1.osum, 3);
  assert.equal(f2.o0, -9, 'цэвэрлэсэн нүд −9');
  assert.equal(f2.o1, 0);
  assert.equal(f1.a0, 0.11, 'хувь хуримтлалаар хэвээр: 11 ÷ 100');
  console.log('✅ buildFrame — өдрийн ажил · цэвэрлэлт · хувь хуримтлалаар');
}

/* ── 4. IPC-ийн агшин — өдрийнх ба хуримтлал ── */
{
  const r = await loadRows(pkg, sc, '2026-01-20');
  const day = snapshotDayOf(r.rows, '2026-01-20');
  const cum = snapshotOf(r.rows, '2026-01-20');
  assert.equal(day.une, (1 + 1) * 10, 'AUTO мөрийн дүн = өдрийн ажил × нэгж үнэ');
  assert.equal(cum.une, (8 + 4) * 10 + (9 + 4) * 20, 'хуримтлал хэвээр бодогдоно');
  console.log('✅ snapshotDayOf — өдрийн дүн; snapshotOf — хуримтлал');
}

/* ── 5. Бичигчид: хяналтын дэлгэрэнгүй ба IPC AUTO мөр шинэ дүрмээр ── */
{
  const det = readFileSync('src/lib/hyanaltDetail.ts', 'utf8');
  assert.ok(det.includes('priorObyem(p, sc, msToDay(at))'), 'hyanaltDetail: «юунаас юу» өмнөх жаазуудын хуримтлалаар');
  const w = readFileSync('src/lib/ipcAutoWrite.ts', 'utf8');
  assert.ok(w.includes('snapshotDayOf(rows, day)') && !w.includes('snapshotOf(rows, day)'), 'ipcAutoWrite: AUTO мөр өдрийн дүнгээр');
  const mu = readFileSync('src/lib/materialUsage.ts', 'utf8');
  assert.ok(!mu.includes('row.raw[sc.f.obyemSum]'), 'materialUsage: хадгалсан obyem_sum (өдрийнх) хуримтлал гэж уншихгүй');
  console.log('✅ бичигчид — шинэ дүрмээр');
}
console.log('perDay.check: OK');
