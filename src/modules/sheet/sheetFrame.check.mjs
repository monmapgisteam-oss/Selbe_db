/**
 * ИЛГЭЭЛТИЙН ЖААЗЫН ЦЭВЭР ФУНКЦУУДЫН ШАЛГУУР.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/sheet/sheetFrame.check.mjs
 *
 * ⚠️ Логик ХУУЛБАРЛААГҮЙ — `sheetFrame.ts`-ийн ЖИНХЭНЭ функцуудыг импортолж
 * шалгана. Тэндээ зассан зүйл энд шууд тусна.
 *
 * Хамгаалж буй алдаанууд:
 *   1. ObjectID шилжилт — архивт шинэ жааз нэмэгдсэний дараа илгээлтийн
 *      түлхүүр таарахгүй болж засвар ЧИМЭЭГҮЙ унтрах (`unmoved` тоологдох ёстой).
 *   2. Давхардсан (№ + Ажил) түлхүүрт буруу мөр сонгох.
 *   3. Overlay нь суурь мөрүүдийг mutate хийх — компанийн хуудас, хянагчийн
 *      харагдац хоёул нэг `rows`-оос салаалдаг тул нэг нь нөгөөгөө бузарлана.
 *   4. `""` → 0 (`null ≠ 0` дүрэм зөрчигдөх), сөрөг обьём, тоо биш утга.
 *   5. Батлагдсаны дараа нэмсэн мөр ДАВХАР орох.
 *   6. Жаазанд `buglusun_ognoo` мөр бүрд, `asOf` зөвхөн 0-р мөрд, бүлгийн
 *      мөрд обьём бичигдэхгүй.
 */
import assert from 'node:assert/strict';
import {
  buildFrame, buildOidMap, insertAdds, moveKeys, overlaySubmission, rowKeyOf,
} from './sheetFrame.ts';

const nBld = 2;
/** Хиймэл бүдүүвч — 2 блок; 2-р блокт обьёмын талбар АЛГА (Багц 4-2·9F-ийн хэлбэр). */
const sc = {
  bld: ['5/1', '5/2'],
  act: ['a0', 'a1'],
  plan: ['p0', 'p1'],
  obyem: ['o0', null],
  start: ['s0', 's1'],
  end: ['e0', 'e1'],
  f: {
    no: 'no', work: 'work', wC: 'wC', wD: 'wD', wE: 'wE', vol: 'vol', obyemSum: 'osum',
    unit: 'unit', money: 'money', plan: 'plan', act: 'act', ratio: 'ratio', asOf: 'asof',
    fillDate: 'fill', gun: 'gun', des: null, ham: null, oid: 'OBJECTID',
  },
};
const hasObyem = sc.obyem.map((f) => !!f);

const D = (s) => Date.parse(`${s}T00:00:00Z`);

/** Нэг мөр — `loadRows`-ийн гаргадаг хэлбэрээр. */
const row = (oid, no, work, depth, group, extra = {}) => ({
  oid, no, des: null, ham: null, work, depth, group,
  wC: null, wD: null, vol: null, unit: null, money: null,
  act: [null, null], obyem: [null, null], start: [null, null], end: [null, null],
  raw: { OBJECTID: oid, no, work },
  ...extra,
});

/**
 * 3 түвшний бүлэг + навчнууд. «1 ¦ Шороо» ДАВХАРДСАН (3 ба 6-р мөр) — Багц 1-ийн
 * «10 · БУСАД АЖИЛ» шиг.
 *   0 G0 БАРИЛГА
 *   1  G1 СУУРЬ
 *   2   G2 1.1 Ухах
 *   3    L 1 Шороо      vol 100 unit 10, obyem [5, 3], start0 2026-08-01, end0 2026-08-20
 *   4    L 2 Бетон      vol 50 unit 20, obyem [8, null]
 *   5  G1 ЗООРЬ
 *   6   L 1 Шороо       vol 10 unit 1
 */
const mkRows = (base) => [
  row(base + 0, '1', 'БАРИЛГА', 0, true),
  row(base + 1, '1', 'СУУРЬ', 1, true),
  row(base + 2, '1.1', 'Ухах', 2, true),
  row(base + 3, '1', 'Шороо', 3, false, {
    vol: 100, unit: 10, obyem: [5, 3], start: [D('2026-08-01'), null], end: [D('2026-08-20'), null],
  }),
  row(base + 4, '2', 'Бетон', 3, false, { vol: 50, unit: 20, obyem: [8, null] }),
  row(base + 5, '2', 'ЗООРЬ', 1, true),
  row(base + 6, '1', 'Шороо', 2, false, { vol: 10, unit: 1 }),
];

const old = mkRows(100);   // хуудсыг нээх үеийн жааз
const fresh = mkRows(200); // хооронд нь архивт нэмэгдсэн ШИНЭ жааз
const rowKeys = old.map((r) => [r.oid, rowKeyOf(r)]);

/* ═══ 1. buildOidMap ═══ */
{
  const m = buildOidMap(rowKeys, fresh);
  assert.equal(m.get(100), 200, 'үндэс мөр зөөгдөв');
  assert.equal(m.get(103), 203, 'давхардсан түлхүүр — ОЙРХОН (3→3) сонгогдов');
  assert.equal(m.get(106), 206, 'давхардсан түлхүүр — ОЙРХОН (6→6) сонгогдов');
  assert.equal(m.size, 7, 'бүх мөр зөөгдөв');

  // Шинэ жаазанд 2-р индексээс мөр НЭМЭГДСЭН → индекс гулссан ч ойрхныг олно
  const shifted = [...fresh.slice(0, 3), row(299, '9', 'Шинэ', 3, false), ...fresh.slice(3)];
  const m2 = buildOidMap(rowKeys, shifted);
  assert.equal(m2.get(103), 203, 'гулссан индекст ч 3→4 (ойр) сонгогдов, 6→7 биш');
  assert.equal(m2.get(106), 206, 'гулссан индекст 6→7 сонгогдов');

  assert.equal(buildOidMap([], fresh).size, 0, 'хоосон rowKeys → хоосон map');
  assert.equal(buildOidMap(rowKeys, []).size, 0, 'хоосон жааз → хоосон map');
  assert.equal(buildOidMap([[1, 'x ¦ y']], fresh).size, 0, 'олдохгүй түлхүүр map-д ОРОХГҮЙ');
}

/* ═══ 2. moveKeys ═══ */
{
  const m = buildOidMap(rowKeys, fresh);
  const src = { '103:0': '12', '104:1:s': '2026-09-01', '-1:0': '7', '999:0': 'x' };
  const { out, unmoved } = moveKeys(m, src);
  assert.equal(out['203:0'], '12', 'нүдний түлхүүр шинэ oid руу зөөгдөв');
  assert.equal(out['204:1:s'], '2026-09-01', 'огнооны түлхүүр (3 хэсэгтэй) зөөгдөв');
  assert.equal(out['-1:0'], '7', 'сөрөг (түр) oid ХЭВЭЭР');
  assert.deepEqual(unmoved, ['999:0'], 'олдохгүй oid → unmoved');
  assert.ok(!('999:0' in out) && !('103:0' in out), 'хуучин түлхүүр out-д үлдээгүй');

  const e = moveKeys(new Map(), src);
  assert.deepEqual(e.out, src, 'хоосон map → бүгд хэвээр');
  assert.equal(e.unmoved.length, 0, 'хоосон map → unmoved байхгүй');
}

/* ═══ 3. insertAdds ═══ */
{
  const add = { oid: -1, parentNo: '1.1', parentWork: 'Ухах', parentIdx: 2, no: '3', work: 'Арматур', vol: 4, unit: 25 };
  const out = insertAdds(old, [add], sc, nBld);
  assert.equal(old.length, 7, 'суурь массив уртсаагүй');
  assert.equal(out.length, 8, 'мөр нэмэгдэв');
  assert.equal(out[5].oid, -1, 'ах дүү (Бетон)-ийн АРД орлоо — бүлгийн төгсгөлд');
  assert.equal(out[5].depth, 3, 'гүн нь өмнөх мөрийнх');
  assert.equal(out[5].group, false);
  assert.deepEqual(out[5].raw, { no: '3', work: 'Арматур', vol: 4, unit: 25 }, 'raw зөвхөн 4 талбар');
  assert.equal(out[5].wC, null, 'жин ОРООГҮЙ — computeAll бодно');

  const orphan = { ...add, oid: -2, parentNo: '7', parentWork: 'БАЙХГҮЙ' };
  assert.equal(insertAdds(old, [orphan], sc, nBld).length, 7, 'эцэггүй add алгасагдав');
  assert.equal(insertAdds(old, [], sc, nBld), old, 'add-гүй бол суурь өөрөө');
}

/* ═══ 4. overlaySubmission ═══ */
const sub = (over = {}) => ({
  v: 1, pkgKey: 'p', user: 'u', at: 1, fillMs: D('2026-09-04'), base: null, asOf: null,
  cells: [], dates: [], adds: [], rowKeys, ...over,
});

{
  const before = JSON.stringify(fresh);
  const s = sub({
    asOf: D('2026-09-03'),
    cells: [
      ['103:0', '12.5'],   // утга
      ['104:1', ''],       // хоосон → null (0 БИШ)
      ['104:0', 'abc'],    // тоо биш → хэвээр (8)
      ['106:0', '-4'],     // сөрөг → 0
      ['-1:0', '7'],       // нэмсэн мөрийн нүд
    ],
    dates: [
      ['103:0:s', '2026-09-01'],
      ['103:0:e', ''],     // арилгах → null
      ['104:1:e', '2026-10-15'],
    ],
    adds: [
      { oid: -1, parentNo: '1.1', parentWork: 'Ухах', parentIdx: 2, no: '3', work: 'Арматур', vol: 4, unit: 25 },
    ],
  });
  const ov = overlaySubmission(fresh, s, sc, nBld);
  assert.equal(JSON.stringify(fresh), before, 'суурь мөрүүд mutate болоогүй');
  assert.equal(ov.unmoved, 0, 'бүх түлхүүр тулгагдав');
  assert.equal(ov.rows.length, 8, 'add орлоо');
  assert.equal(ov.asOf, D('2026-09-03'), 'asOf дамжив');
  const byOid = new Map(ov.rows.map((r) => [r.oid, r]));
  assert.equal(byOid.get(203).obyem[0], 12.5, 'утга шинэ oid-той мөрөнд буув');
  assert.equal(byOid.get(204).obyem[1], null, '"" → null');
  assert.equal(byOid.get(204).obyem[0], 8, 'тоо биш → хэвээр');
  assert.equal(byOid.get(206).obyem[0], 0, 'сөрөг → 0');
  assert.equal(byOid.get(-1).obyem[0], 7, 'нэмсэн мөрийн нүд буув');
  assert.equal(byOid.get(203).start[0], D('2026-09-01'), 'эхлэх огноо буув');
  assert.equal(byOid.get(203).end[0], null, 'огноо "" → null');
  assert.equal(byOid.get(204).end[1], D('2026-10-15'), 'дуусах огноо буув');
  assert.deepEqual([...ov.cellKeys].sort(), ['-1:0', '203:0', '204:0', '204:1', '206:0'], 'cellKeys шинэ oid-оор');
  assert.deepEqual([...ov.dateKeys].sort(), ['203:0:e', '203:0:s', '204:1:e'], 'dateKeys шинэ oid-оор');
  assert.notEqual(ov.rows[3], fresh[3], 'мөр бүр шинэ объект');
  assert.notEqual(ov.rows[3].obyem, fresh[3].obyem, 'obyem массив хуулбар');
  assert.equal(ov.rows[3].raw, fresh[3].raw, 'raw хуваалцагдана (бичигдэхгүй)');
}

/* ── 4б. Ижил жааз (rowKeys-ийн oid rows-д байна) — зөөлт хийгдэхгүй ── */
{
  const ov = overlaySubmission(old, sub({ cells: [['103:0', '1']] }), sc, nBld);
  assert.equal(ov.unmoved, 0);
  assert.deepEqual(ov.cellKeys, ['103:0'], 'ижил жаазанд түлхүүр хэвээр');
  assert.equal(ov.rows[3].obyem[0], 1);
  assert.equal(ov.asOf, null, 'asOf null хэвээр');
}

/* ── 4в. Зөөгдөөгүй түлхүүр — чимээгүй алдагдахгүй ── */
{
  const ov = overlaySubmission(
    fresh,
    sub({ rowKeys: [[103, '1 ¦ Шороо'], [150, '9 ¦ БАЙХГҮЙ']], cells: [['103:0', '1'], ['150:0', '2']], dates: [['150:0:s', '2026-01-01']] }),
    sc, nBld,
  );
  assert.equal(ov.unmoved, 2, 'олдохгүй oid-ийн нүд ба огноо хоёулаа unmoved');
  assert.equal(ov.rows[3].obyem[0], 1, 'олдсон нь буусан хэвээр');
  // rowKeys огт байхгүй хуучин payload — түлхүүр мөрд олдохгүй бол мөн unmoved
  const ov2 = overlaySubmission(fresh, sub({ rowKeys: [], cells: [['103:0', '1']] }), sc, nBld);
  assert.equal(ov2.unmoved, 1, 'rowKeys-гүй, мөрд байхгүй oid → unmoved');
  assert.equal(ov2.cellKeys.length, 0);
}

/* ── 4г. ДАВХАР add — батлагдсаны дараа архивт орсон мөр дахин орохгүй ── */
{
  // Архивын шинэ жаазанд «3 · Арматур» аль хэдийн ЖИНХЭНЭ мөр (oid 205) болсон
  const archived = [...fresh.slice(0, 5), row(299, '3', 'Арматур', 3, false, { vol: 4, unit: 25 }), ...fresh.slice(5)];
  const s = sub({
    cells: [['-1:0', '7']],
    adds: [
      { oid: -1, parentNo: '1.1', parentWork: 'Ухах', parentIdx: 2, no: '3', work: 'Арматур', vol: 4, unit: 25 },
      { oid: -2, parentNo: '1.1', parentWork: 'Ухах', parentIdx: 2, no: '4', work: 'Хэв', vol: 1, unit: 1 },
    ],
  });
  const ov = overlaySubmission(archived, s, sc, nBld);
  assert.equal(ov.rows.length, 9, 'давхар add алгасагдаж, шинэ add орлоо (8 + 1)');
  assert.equal(ov.rows.filter((r) => r.work === 'Арматур').length, 1, '«Арматур» ганц мөр');
  assert.equal(ov.unmoved, 0, 'давхар add-ын нүд unmoved-д ОРООГҮЙ');
  const arm = ov.rows.find((r) => r.work === 'Арматур');
  assert.equal(arm.oid, 299, 'архивын мөр хэвээр');
  assert.equal(arm.obyem[0], 7, 'add-ын нүд архивын мөрөнд буув');
  assert.deepEqual(ov.cellKeys, ['299:0'], 'түлхүүр архивын oid-оор');
  // Өөр бүлэгт ижил нэртэй мөр байвал давхардал гэж ҮЗЭХГҮЙ (эцгийн бүлэг дотор л)
  const s2 = sub({ adds: [{ oid: -3, parentNo: '2', parentWork: 'ЗООРЬ', parentIdx: 5, no: '3', work: 'Арматур', vol: 1, unit: 1 }] });
  assert.equal(overlaySubmission(archived, s2, sc, nBld).rows.length, 9, 'өөр бүлгийн ижил нэр — давхардал биш');
}

/* ═══ 5. buildFrame ═══ */
{
  const s = sub({
    cells: [['103:0', '12.5'], ['104:0', '']],
    adds: [{ oid: -1, parentNo: '1.1', parentWork: 'Ухах', parentIdx: 2, no: '3', work: 'Арматур', vol: 4, unit: 25 }],
  });
  const ov = overlaySubmission(fresh, s, sc, nBld);
  const asOf = D('2026-09-02');
  const fillMs = D('2026-09-04');
  const fr = buildFrame(ov.rows, sc, nBld, asOf, hasObyem, fillMs);
  assert.equal(fr.length, ov.rows.length, 'мөрийн тоо = rows');
  assert.ok(fr.every((a) => a.fill === fillMs), 'buglusun_ognoo мөр БҮРД');
  assert.equal(fr[0].asof, asOf, 'asOf 0-р мөрд');
  assert.ok(fr.slice(1).every((a) => a.asof === null), 'asOf бусад мөрд null');
  ov.rows.forEach((r, i) => {
    if (r.group) assert.equal(fr[i].o0, null, `бүлгийн мөрд обьём бичигдэхгүй (${r.work})`);
    assert.equal(fr[i].gun, r.depth, 'гүн мөр бүрд');
    assert.ok(!('o1' in fr[i]) || fr[i].o1 === undefined, 'талбаргүй блокт обьём БИЧИГДЭХГҮЙ');
  });
  assert.equal(fr[3].o0, 12.5, 'навчийн обьём');
  assert.equal(fr[3].a0, 0.125, 'хувь = обьём ÷ Обьём');
  assert.equal(fr[4].o0, null, '"" → null (0 биш)');
  assert.equal(fr[4].osum, null, 'бүх блок хоосон → obyemSum null');
  const add = fr.find((a) => a.work === 'Арматур');
  assert.ok(add && add.fill === fillMs && add.gun === 3, 'нэмсэн мөр жаазанд бүрэн');
  assert.ok(add.wC != null, 'шинэ мөрд жин бодогдож бичигдэв');
  assert.equal(fr[3].OBJECTID, 203, 'raw талбарууд хуулбарт үлдэнэ (applyAdds серверийнхийг хасна)');
  // fillDate байхгүй → throw
  assert.throws(
    () => buildFrame(ov.rows, { ...sc, f: { ...sc.f, fillDate: null } }, nBld, asOf, hasObyem, fillMs),
    /buglusun_ognoo/,
    'fillDate багана алга → зогсооно',
  );
  // pending зам (FillNew-ийн хуучин): нүдэн дээр буугаагүй засвар мөн тусна
  const fr2 = buildFrame(fresh, sc, nBld, asOf, hasObyem, fillMs, { '203:0': '20' }, {});
  assert.equal(fr2[3].o0, 20, 'pending засвар жаазанд орлоо');
}

console.log('sheetFrame.check: OK');
