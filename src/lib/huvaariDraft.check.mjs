/**
 * «ХУВААРЬ»-ИЙН ХУВААЛЦСАН НООРОГИЙН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/huvaariDraft.check.mjs
 *
 * Хамгаалж буй дүрмүүд (2026-09-23):
 *   1. ТҮЛХҮҮРТ `|` ОРОХГҮЙ — `draftRemote.readLegacyDrafts`-ийн `%|<багц>`
 *      хайлт хуваарийн мөрийг гүйцэтгэлийн хуучин ноорог гэж уншиж УСТГАХ байв.
 *   2. Зөвхөн ӨӨРЧЛӨГДСӨН нүд сериалчлагдана; эргэх хөрвүүлэлт алдагдалгүй.
 *   3. Нийлүүлэлт: нүд бүрээр ШИНЭ `at` ялна; tombstone нь хуучин нүдийг
 *      хаяж, шинэ нүдэнд хаягдана; 7 хоногоос хуучин tombstone арилна.
 *   4. Сэргээхэд сервер өөрчлөгдсөн нүд ХУУЧИРСАН гэж хасагдана (`bv`),
 *      серверийнхтэй ижил болсон нүд ноорогт орохгүй.
 *   5. Эвдэрсэн JSON → `null`; эвдэрсэн НЭГ нүд л орхигдоно.
 */
import assert from 'node:assert/strict';
import {
  hdKey, kS, kH, kA, kR, kM, kN, parseKey, mapsToCells, cellsToMaps, resOfVal,
  serialize, parse, merge, sig, users, isEmpty, HD_DEL_TTL, remapDraft, identityRemap,
  hlcNext, maxStamp, dropCleared, applyClear, hdClearMarkKey, serializeMark, parseMark, mergeMark, coversMark,
} from './huvaariDraft.ts';

/* ── 1. Түлхүүр ── */
for (const pk of ['b32', 'b33_9f', 'b4_2_12f', 'b10']) {
  for (const kind of ['plan', 'geree']) {
    const k = hdKey(kind, pk);
    assert.ok(!k.includes('|'), `түлхүүрт | орсон: ${k}`);
    /* `LIKE '%|<багц>'` нь `|<багц>`-аар ТӨГСДӨГ мөрийг олно */
    assert.ok(!k.endsWith(`|${pk}`), `legacy LIKE таарна: ${k}`);
  }
}
assert.equal(hdKey('geree', 'b32'), 'plan:geree:b32');
assert.deepEqual(parseKey(kS(12, 3)), { type: 's', oid: 12, blk: 3 });
assert.deepEqual(parseKey(kH(12)), { type: 'h', oid: 12 });
assert.deepEqual(parseKey(kA(12, 0)), { type: 'a', oid: 12, blk: 0 });
assert.deepEqual(parseKey(kR(12)), { type: 'r', oid: 12 });
assert.deepEqual(parseKey(kM('5|9F')), { type: 'm', key: '5|9F' });
/* Сарын нөөц бүхэл тоо (2026-09-24) — Integer мөрийн талбарт нийлдэг */
assert.deepEqual([...resOfVal([['2026-01', 2.8, null], ['2026-02', null, 1.1], ['x', null, null]])],
  [['2026-01', { hun: 2, mashin: null }], ['2026-02', { hun: null, mashin: 1 }]], 'resOfVal floor · хоосон сар хасагдана');
assert.deepEqual(parseKey(kN('5|9F')), { type: 'n', key: '5|9F' });
assert.equal(parseKey('n:'), null);
assert.equal(parseKey('x:1'), null);
assert.equal(parseKey('s:1'), null);
console.log('✅ түлхүүр');

/* ── Фикстур: 2 блоктой багц, 3 мөр ── */
const D = 86_400_000;
const sp = (a, b) => ({ start: a * D, end: b * D });
const rows = new Map([
  [10, { spans: [sp(1, 5), null], ham: null, aStart: [null, null], aEnd: [null, null], hun: null, mashin: null }],
  [11, { spans: [sp(3, 8), sp(10, 12)], ham: '18FS3', aStart: [2 * D, null], aEnd: [null, null], hun: 4, mashin: 1 }],
  [12, { spans: [null, null], ham: null, aStart: [null, null], aEnd: [null, null], hun: null, mashin: null }],
]);
const srvMonths = new Map([['5|9F', new Map([['2026-01', 10], ['2026-02', 5]])]]);
/* ⚠️ `undefined` = сервер МЭДЭГДЭХГҮЙ (ачаалагдаагүй); задаргаагүй = ХООСОН Map */
/* Сарын нөөц (2026-09-24) — зэрэгцээ */
const srvRes = new Map([['5|9F', new Map([['2026-01', { hun: 4, mashin: 1 }]])]]);
const ctx = { n: 2, rows, months: (k) => srvMonths.get(k) ?? new Map(), monthsRes: (k) => srvRes.get(k) ?? new Map() };
const empty = () => ({ draft: new Map(), ham: new Map(), aDraft: new Map(), resDraft: new Map(), obDraft: new Map(), obRes: new Map() });

/* ── 2. Map → нүд → Map эргэх ── */
{
  const m = empty();
  m.draft.set(10, [sp(2, 6), null]);            // блок 0 өөрчлөгдсөн, блок 1 ижил
  m.draft.set(11, [sp(3, 8), sp(10, 12)]);      // серверийнхтэй ИЖИЛ → нүдгүй
  m.ham.set(11, '18FS3');                       // ижил → нүдгүй
  m.ham.set(10, '11SS0');
  m.aDraft.set(11, { start: [2 * D, 4 * D], end: [null, null] });   // блок 1-ийн эхэлсэн
  m.resDraft.set(11, { hun: 6, mashin: 1 });
  m.obDraft.set('5|9F', new Map([['2026-02', 5], ['2026-01', 15]]));
  m.obDraft.set('7|9F', new Map());             // серверт ч хоосон → нүдгүй
  m.obRes.set('5|9F', new Map([['2026-02', { hun: 2, mashin: null }], ['2026-01', { hun: 4, mashin: 1 }]]));
  m.obRes.set('7|9F', new Map([['2026-01', { hun: null, mashin: null }]]));   // утгагүй = серверийн хоосонтой ижил → нүдгүй
  const cells = mapsToCells(m, ctx);
  assert.deepEqual([...cells.keys()].sort(), [kA(11, 1), kH(10), kM('5|9F'), kN('5|9F'), kR(11), kS(10, 0)].sort());
  assert.deepEqual(cells.get(kN('5|9F')), { val: [['2026-01', 4, 1], ['2026-02', 2, null]], bv: [['2026-01', 4, 1]] }, 'нөөц эрэмбэлэгдсэн, null хэвээр');
  assert.deepEqual(cells.get(kS(10, 0)), { val: sp(2, 6), bv: sp(1, 5) });
  assert.deepEqual(cells.get(kM('5|9F')).val, [['2026-01', 15], ['2026-02', 5]], 'сар эрэмбэлэгдсэн');

  const d = {
    t: 1000, kind: 'plan', pkg: 'b32', by: { user: 'a', at: 1000 },
    entries: new Map([...cells].map(([k, c]) => [k, { ...c, at: 900, user: 'a' }])),
    del: new Map([['s:99:0', 500]]), base: { at: 800, n: 2 },
  };
  const s = serialize(d);
  assert.ok(!s.includes('undefined'));
  const back = parse(s);
  assert.ok(back);
  assert.equal(back.t, 1000); assert.equal(back.kind, 'plan'); assert.equal(back.pkg, 'b32');
  assert.deepEqual(back.del, d.del);
  assert.deepEqual(back.base, d.base);
  assert.equal(back.entries.size, cells.size);
  for (const [k, e] of d.entries) assert.deepEqual(back.entries.get(k), e, `нүд ${k} эргэх`);
  assert.equal(sig(back), sig(d), 'гарын үсэг t-ээс хамаарахгүй');
  assert.notEqual(serialize(back), serialize({ ...d, t: 2000 }));

  const ap = cellsToMaps(back.entries, ctx);
  assert.equal(ap.stale, 0); assert.equal(ap.applied, 6); assert.deepEqual(ap.dropped, []);
  assert.deepEqual([...ap.maps.obRes.get('5|9F')], [['2026-01', { hun: 4, mashin: 1 }], ['2026-02', { hun: 2, mashin: null }]]);
  assert.ok(s.includes('"mres"'), 'wire-д mres');
  assert.deepEqual(ap.maps.draft.get(10), [sp(2, 6), null], 'муж серверийн массиваас угсарна');
  assert.equal(ap.maps.ham.get(10), '11SS0');
  assert.deepEqual(ap.maps.aDraft.get(11), { start: [2 * D, 4 * D], end: [null, null] });
  assert.deepEqual(ap.maps.resDraft.get(11), { hun: 6, mashin: 1 });
  assert.deepEqual([...ap.maps.obDraft.get('5|9F')], [['2026-01', 15], ['2026-02', 5]]);
  assert.equal(ap.rows, 3, 'ялгаатай мөр: 10, 11, обьём 5|9F (нөөц нь ижил мөр)');
  /* дахин нүд болгоход ижил */
  assert.deepEqual([...mapsToCells(ap.maps, ctx)].sort(), [...cells].sort());
  assert.deepEqual(users(back), ['a']);
  assert.equal(isEmpty(back), false);
}
console.log('✅ эргэх хөрвүүлэлт');

/* ── 3. Нийлүүлэлт ── */
const mk = (entries, del = [], t = 1000) => ({
  t, kind: 'plan', pkg: 'b32', by: { user: 'x', at: t },
  entries: new Map(entries), del: new Map(del), base: { at: 1, n: 2 },
});
const cell = (val, at, user, bv = null) => ({ val, at, user, bv });
{
  const NOW = 1_000_000;
  const remote = mk([
    [kS(10, 0), cell(sp(2, 6), 500, 'a')],
    [kS(11, 0), cell(sp(4, 9), 700, 'b')],
    [kH(10), cell('11SS0', 600, 'b')],
  ], [[kR(11), 650]], 700);
  const local = mk([
    [kS(10, 0), cell(sp(2, 7), 800, 'me')],   // шинэ → ялна
    [kS(11, 0), cell(sp(4, 8), 600, 'me')],   // хуучин → алсынх ялна
    [kR(11), cell([5, null], 600, 'me')],     // алсын tombstone (650) шинэ → хаягдана
    [kM('5|9F'), cell([['2026-01', 1]], 900, 'me')],
  ], [[kH(10), 650]], 900);                   // локал tombstone (650) > алсын нүд (600) → хаягдана
  const m = merge(remote, local, NOW);
  assert.deepEqual(m.entries.get(kS(10, 0)).val, sp(2, 7));
  assert.deepEqual(m.entries.get(kS(11, 0)).val, sp(4, 9));
  assert.equal(m.entries.has(kR(11)), false, 'алсын tombstone хуучин нүдийг хаяна');
  assert.equal(m.entries.has(kH(10)), false, 'локал tombstone алсын хуучин нүдийг хаяна');
  assert.ok(m.entries.has(kM('5|9F')), 'зөвхөн локалд байгаа нүд үлдэнэ');
  assert.equal(m.t, 900);
  assert.deepEqual(users(m), ['b', 'me']);
  assert.deepEqual([...m.del].sort(), [[kH(10), 650], [kR(11), 650]].sort(), 'tombstone хэвээр (хожуу ирэх хуулбарт)');
  /* Гарын үсэг нь нийлүүлэх ДАРААЛАЛ, `by`, `t`-ээс хамаарахгүй — эс бөгөөс хоёр клиент мөнхөд дахин бичнэ */
  const m2 = merge(local, remote, NOW);
  assert.equal(sig(m), sig(m2), 'эрэмбэ хамаарахгүй');
  assert.equal(sig(m), sig({ ...m, t: 5, by: { user: 'z', at: 5 }, base: { at: 99, n: 2 } }));
  assert.notEqual(sig(m), sig({ ...m, del: new Map() }), 'tombstone гарын үсэгт орно');

  /* Tombstone-оос ХОЖУУ дахин бичигдсэн нүд ялж, tombstone арилна */
  const again = merge(m, mk([[kR(11), cell([7, null], 700, 'me')]], [], 950), NOW);
  assert.deepEqual(again.entries.get(kR(11)).val, [7, null]);
  assert.equal(again.del.has(kR(11)), false);

  /* Тэнцсэн `at` → a (алс) ялна */
  const tie = merge(mk([[kH(12), cell('A', 100, 'a')]]), mk([[kH(12), cell('B', 100, 'b')]]), NOW);
  assert.equal(tie.entries.get(kH(12)).val, 'A');

  /* 7 хоногоос хуучин tombstone арилна */
  const old = merge(mk([], [[kH(12), NOW - HD_DEL_TTL - 1]]), mk([[kH(12), cell('C', 10, 'c')]]), NOW);
  assert.equal(old.entries.get(kH(12)).val, 'C');
  assert.equal(old.del.size, 0);

  /* Нэг тал хоосон */
  assert.equal(merge(null, null), null);
  assert.equal(merge(remote, null, NOW).entries.size, 3);
  assert.equal(merge(null, local, NOW).entries.size, 4);
}
console.log('✅ нийлүүлэлт');

/* ── 4. Сэргээхэд хуучирсан нүд ── */
{
  const entries = new Map([
    [kS(10, 0), cell(sp(2, 6), 1, 'a', sp(1, 5))],      // суурь = сервер → орно
    [kS(11, 1), cell(sp(9, 13), 1, 'a', sp(10, 11))],   // суурь ≠ сервер (10,12) → хуучирсан
    [kH(11), cell('1FS0', 1, 'a', '18FS3')],            // орно
    [kH(10), cell('', 1, 'a', '')],                     // серверийнхтэй ижил → орохгүй, dropped
    [kS(99, 0), cell(sp(1, 2), 1, 'a')],                // мөр алга → хуучирсан
    [kS(10, 5), cell(sp(1, 2), 1, 'a')],                // блок хүрээнээс гадуур → хуучирсан
    [kM('5|9F'), cell([['2026-01', 10], ['2026-02', 5]], 1, 'a', [['2026-01', 10], ['2026-02', 5]])], // ижил → dropped
    [kM('9|9F'), cell([['2026-03', 2]], 1, 'a', [['2026-03', 1]])],   // суурь ≠ сервер (хоосон) → хуучирсан
    ['bogus', cell(1, 1, 'a')],
  ]);
  const ap = cellsToMaps(entries, ctx);
  assert.equal(ap.applied, 2);
  assert.equal(ap.stale, 4);
  assert.deepEqual(ap.dropped.sort(), [kS(11, 1), kH(10), kS(99, 0), kS(10, 5), kM('5|9F'), kM('9|9F'), 'bogus'].sort());
  /* ⚠️ Хуучирсан нүд `staleKeys`-д ТУСДАА — дуудагч тэдэнд tombstone тавихгүй (бусдын нүдийг устгахгүй) */
  assert.deepEqual(ap.staleKeys.sort(), [kS(11, 1), kS(99, 0), kS(10, 5), kM('9|9F')].sort());
  /* ⚠️ 2026-09-25 аудит: `bv` ЗӨРСӨН хэсэг тусдаа — «мөр алга»/блок гадуурх нь ОРОХГҮЙ
     (бусдын шинэ жаазын нүдэд tombstone тавихгүй) */
  assert.deepEqual(ap.bvKeys.sort(), [kS(11, 1), kM('9|9F')].sort());
  /* Сервер МЭДЭГДЭХГҮЙ (задаргаа ачаалагдаагүй) → сарын нүд тулгагдахгүй, ХАЯГДАХГҮЙ */
  const unk = cellsToMaps(new Map([[kM('9|9F'), cell([['2026-03', 2]], 1, 'a', [['2026-03', 1]])]]), { ...ctx, months: () => undefined });
  assert.equal(unk.applied, 1); assert.equal(unk.stale, 0);
  assert.deepEqual([...unk.maps.obDraft.get('9|9F')], [['2026-03', 2]]);
  const unkCells = mapsToCells({ ...empty(), obDraft: new Map([['9|9F', new Map([['2026-03', 2]])]]) }, { ...ctx, months: () => undefined });
  assert.deepEqual(unkCells.get(kM('9|9F')), { val: [['2026-03', 2]], bv: undefined }, 'мэдэгдэхгүй суурь → bv-гүй');
  assert.deepEqual(ap.maps.draft.get(10), [sp(2, 6), null]);
  assert.equal(ap.maps.draft.has(11), false);
  assert.equal(ap.maps.ham.get(11), '1FS0');
  /* Сарын нөөц: суурь ≠ сервер → хуучирсан; серверийнхтэй ижил → dropped; мэдэгдэхгүй → орно */
  const rn = cellsToMaps(new Map([
    [kN('5|9F'), cell([['2026-01', 9, 1]], 1, 'a', [['2026-01', 3, 1]])],   // суурь зөрсөн → stale
    [kN('8|9F'), cell([], 1, 'a', [])],                                     // ижил (хоосон) → dropped
    [kN('9|9F'), cell([['2026-03', 1, null]], 1, 'a', [])],                 // серверт хоосон, суурь хоосон → орно
  ]), ctx);
  assert.equal(rn.stale, 1); assert.equal(rn.applied, 1);
  assert.deepEqual(rn.staleKeys, [kN('5|9F')]);
  assert.deepEqual([...rn.maps.obRes.get('9|9F')], [['2026-03', { hun: 1, mashin: null }]]);
  const rnUnk = cellsToMaps(new Map([[kN('5|9F'), cell([['2026-01', 9, 1]], 1, 'a', [['2026-01', 3, 1]])]]), { ...ctx, monthsRes: () => undefined });
  assert.equal(rnUnk.applied, 1, 'сервер мэдэгдэхгүй → тулгахгүй');
  /* Хуучин wire (`mres`-гүй) уншигдана */
  const oldWire = parse(JSON.stringify({ v: 1, t: 5, kind: 'plan', pkg: 'b', by: { user: 'a', at: 5 }, spans: [], ham: [], actual: [], res: [], months: [['5|9F', [['2026-01', 1]], 4, 'u']], del: [], base: { at: 1, n: 2 } }));
  assert.equal(oldWire.entries.size, 1);
  assert.ok(oldWire.entries.has(kM('5|9F')));
  const badRes = parse(JSON.stringify({ v: 1, t: 5, kind: 'plan', pkg: 'b', by: { user: 'a', at: 5 }, spans: [], ham: [], actual: [], res: [], months: [], mres: [['5|9F', 'x', 4, 'u'], [3, [], 4, 'u']], del: [], base: { at: 1, n: 2 } }));
  assert.deepEqual(badRes.entries.get(kN('5|9F')).val, [], 'эвдэрсэн нөөц → хоосон');
  assert.equal(badRes.entries.size, 1);
  /* `bv`-гүй нүд шууд орно */
  const ap2 = cellsToMaps(new Map([[kS(11, 1), { val: sp(9, 13), at: 1, user: 'a' }]]), ctx);
  assert.equal(ap2.applied, 1);
  assert.deepEqual(ap2.maps.draft.get(11), [sp(3, 8), sp(9, 13)]);
}
console.log('✅ хуучирсан нүд');

/* ── 4б. ⚠️ 2026-10-08: ХУУЧИН (16:00Z — УБ-ын шөнө дунд) `bv`/`val` тэгшлэгдэнэ.
 * Мөрүүд одоо `normDayMs`-ээр (UTC шөнө дунд) уншигддаг тул 2026-10-08-аас өмнө түүхий агшнаар
 * бичигдсэн нүд «хуучирсан» гэж худлаа хаягддаг байв. ── */
{
  const H8 = 8 * 3_600_000;
  const leg = (a, b) => ({ start: a * D - H8, end: b * D - H8 });
  const ap = cellsToMaps(new Map([
    [kS(10, 0), cell(leg(2, 6), 1, 'a', leg(1, 5))],            // суурь 16:00Z = сервер 00:00Z → орно, утга ч тэгшлэгдэнэ
    [kS(11, 0), cell(leg(3, 8), 1, 'a', leg(3, 8))],            // тэгшлээд серверийнхтэй ижил → dropped (хуучирсан БИШ)
    [kA(11, 0), cell([3 * D - H8, null], 1, 'a', [2 * D - H8, null])], // бодит огноо ч мөн
  ]), ctx);
  assert.equal(ap.stale, 0, '16:00Z суурь хуучирсан гэж хаягдав');
  assert.equal(ap.applied, 2);
  assert.deepEqual(ap.dropped, [kS(11, 0)]);
  assert.deepEqual(ap.maps.draft.get(10), [sp(2, 6), null], 'утга UTC шөнө дунд руу тэгшлэгдээгүй');
  assert.deepEqual(ap.maps.aDraft.get(11).start, [3 * D, null]);
  /* Жинхэнэ зөрүү (өөр өдөр) хэвээр хуучирсан */
  const st = cellsToMaps(new Map([[kS(10, 0), cell(leg(2, 6), 1, 'a', leg(1, 6))]]), ctx);
  assert.equal(st.stale, 1, 'жинхэнэ зөрүү алга болов');
}
console.log('✅ хуучин 16:00Z нүд тэгшлэгдэнэ — хуучирсан биш');

/* ── 5. Эвдэрсэн оролт ── */
{
  assert.equal(parse(''), null);
  assert.equal(parse(null), null);
  assert.equal(parse('{'), null);
  assert.equal(parse('{"v":2}'), null, 'өөр хувилбар');
  assert.equal(parse('[]'), null);
  const p = parse(JSON.stringify({
    v: 1, t: 5, kind: 'geree', pkg: 'b1', by: { user: 'A', at: 5 },
    spans: [[10, 0, { start: 1, end: 2 }, 3, 'u'], ['x', 0, null, 3, 'u'], [10, 1, null, 'bad', 'u']],
    ham: [[11, 'x', 4, 'U', null]], actual: 'nope', res: null, months: [['5|9F', 'bad', 4, 'u']],
    del: [['s:1:1', 9], ['bad', 9], ['s:1:2', 'x']], base: { at: 1, n: 2 },
  }));
  assert.ok(p);
  assert.equal(p.kind, 'geree');
  assert.equal(p.entries.size, 3, 'эвдэрсэн нүд л орхигдоно');
  assert.deepEqual(p.entries.get(kS(10, 0)), { val: { start: 1, end: 2 }, at: 3, user: 'u' });
  assert.deepEqual(p.entries.get(kH(11)), { val: 'x', at: 4, user: 'u', bv: null }, 'нэр жижиг үсгээр, bv null');
  assert.deepEqual(p.entries.get(kM('5|9F')).val, [], 'эвдэрсэн сар → хоосон');
  assert.deepEqual([...p.del], [['s:1:1', 9]]);
  assert.equal(p.by.user, 'a');
  /* Хоосон ноорог */
  const e = parse(serialize({ t: 1, kind: 'plan', pkg: 'b', by: { user: 'a', at: 1 }, entries: new Map(), del: new Map(), base: { at: 0, n: 0 } }));
  assert.equal(isEmpty(e), true);
  assert.deepEqual(users(e), []);
  assert.equal(e.cleared, undefined);
  /* ЦЭВЭРЛЭСЭН агшин (2026-09-24) — эргэх, нийлүүлэхэд ИХ нь үлдэнэ */
  const c = parse(serialize({ ...e, cleared: 777, del: new Map([[kH(1), 777]]) }));
  assert.equal(c.cleared, 777);
  assert.equal(merge(c, mk([[kH(1), cell('x', 5, 'z')]]), 1000).entries.size, 0, 'цэвэрлэлтийн tombstone хуучин нүдийг хаяна');
  assert.equal(merge(c, mk([[kH(1), cell('x', 5, 'z')]]), 1000).cleared, 777);
  assert.equal(merge({ ...c, cleared: 900 }, c, 1000).cleared, 900);
  assert.equal(sig(c), sig({ ...c, cleared: undefined }), 'cleared гарын үсэгт орохгүй — цэвэрлэлт нэг л удаа бичигдэнэ');
  assert.equal(parse('{"v":1,"t":1,"cleared":"x"}').cleared, undefined);
}
console.log('✅ эвдэрсэн оролт');

/* ── 6. remapDraft — «Улсын комисс» шинэ жааз: мөрийн түлхүүр шинэ oid руу, хуучинд tombstone (2026-09-25) ── */
{
  const d = mk([
    [kS(10, 0), cell({ start: 1, end: 2 }, 50, 'a')],
    [kH(10), cell('11FS0', 50, 'a')],
    [kA(11, 1), cell([1, null], 50, 'b')],
    [kR(12), cell({ hun: 1, mashin: null }, 50, 'b')],
    [kM('5|9F'), cell([['2026-01', 3]], 50, 'a')],
  ], [[kS(13, 0), 40]]);
  const map = new Map([[10, 110], [11, 111], [13, 113]]);
  const r = remapDraft(d, map, 777);
  assert.ok(r.entries.has(kS(110, 0)) && r.entries.has(kH(110)) && r.entries.has(kA(111, 1)), 'мөрийн түлхүүр шинэ oid руу зөөгдөнө');
  assert.ok(r.entries.has(kR(12)), 'зураглалд байхгүй oid хэвээр');
  assert.ok(r.entries.has(kM('5|9F')), 'сарын түлхүүр (des|блок) хөндөгдөхгүй');
  assert.equal(r.entries.has(kS(10, 0)), false, 'хуучин түлхүүр үлдэхгүй');
  assert.equal(r.del.get(kS(10, 0)), 777, 'хуучин түлхүүрт tombstone');
  assert.equal(r.del.get(kS(113, 0)), 40, 'tombstone ч зөөгдөнө');
  assert.equal(r.entries.get(kS(110, 0)).at, 50, 'мета хэвээр');
  assert.equal(d.entries.size, 5, 'оролт хөндөгдөөгүй');
  assert.equal(remapDraft(d, new Map()), d, 'хоосон зураглал — ижил объект');
}
console.log('✅ remapDraft');

/* ── 7. HLC · нүд тус бүрийн `cleared` · хэсэгчилсэн цэвэрлэлт · тэмдэг (2026-10-04 аудит) ── */
{
  /* HLC: харсан дээдээс ХАТУУ ИХ, цаг урагшилбал цаг */
  assert.equal(hlcNext(0, 100), 100);
  assert.equal(hlcNext(500, 100), 501, 'цаг хоцорсон машин харсан нүднээс бага `at` авахгүй');
  assert.equal(hlcNext(500.7, 100), 501);
  assert.equal(hlcNext(50, 100), 100);
  const seenD = mk([[kH(1), cell('x', 900, 'b')], [kH(2), cell('y', 10, 'b')]], [[kS(3, 0), 950]], 1);
  assert.equal(maxStamp(seenD), 950, 'tombstone ч тоологдоно');
  assert.equal(maxStamp({ ...seenD, cleared: 990 }), 990);
  assert.equal(maxStamp(null), 0);
  /* Хоцорсон цагтай А (Date.now()=100) Б-гийн 900-д бичсэн нүдийг харсны дараа засвал ялна */
  const aEdit = mk([[kH(1), cell('A-шинэ', hlcNext(maxStamp(seenD), 100), 'a')]]);
  assert.equal(merge(seenD, aEdit, 1000).entries.get(kH(1)).val, 'A-шинэ', 'HLC: дараа хийсэн засвар ялна');
  /* Хоцорсон цагтай А-гийн tombstone Б-гийн нүдийг хаана */
  const aDel = mk([], [[kH(2), hlcNext(maxStamp(seenD), 5)]]);
  assert.equal(merge(seenD, aDel, 1000).entries.has(kH(2)), false, 'HLC tombstone хуучин нүдийг хаана');

  /* dropCleared — нүд тус бүрээр: цэвэрлэлтээс хойшхи нүд ҮЛДЭНЭ (урьд нь хуулбар бүтнээрээ хаягддаг байв) */
  const loc = { ...mk([[kH(1), cell('хуучин', 100, 'a')], [kH(2), cell('шинэ', 300, 'a')], [kH(3), cell('ижил', 200, 'a')]], [[kS(9, 0), 50]]), t: 150 };
  const dc = dropCleared(loc, 200);
  assert.deepEqual([...dc.entries.keys()], [kH(2)], 'at <= cleared хаягдана, шинэ нь үлдэнэ (t хуучин ч)');
  assert.equal(dc.cleared, 200);
  assert.equal(dc.del.get(kS(9, 0)), 50, 'tombstone хэвээр');
  assert.equal(dropCleared(loc, 0), loc, 'cleared байхгүй — ижил объект');
  assert.equal(loc.entries.size, 3, 'оролт хөндөгдөөгүй');

  /* applyClear — ЗӨВХӨН тэмдгийн нүд; хувилбарын `at + 1` нь хамтрагчийн шинэ хувилбарыг хаахгүй */
  const remote = mk([
    [kH(1), cell('илгээсэн', 100, 'a')],
    [kH(2), cell('хамтрагч-илгээлтэд-ороогүй', 150, 'b')],
    [kH(3), cell('хамтрагч-дараа-нь-зассан', 120, 'b')],
  ]);
  const keys = new Map([[kH(1), 101], [kH(3), 111]]);
  const cl = applyClear(remote, keys, 400);
  assert.equal(cl.entries.has(kH(1)), false, 'илгээлтэд орсон нүд хаагдана');
  assert.equal(cl.entries.get(kH(2)).val, 'хамтрагч-илгээлтэд-ороогүй', 'жагсаалтад ороогүй нүд ҮЛДЭНЭ');
  assert.equal(cl.entries.get(kH(3)).val, 'хамтрагч-дараа-нь-зассан', 'илгээснээс ШИНЭ хувилбар ҮЛДЭНЭ');
  assert.equal(cl.del.get(kH(1)), 101);
  assert.equal(cl.del.has(kH(3)), false, 'амьд үлдсэн нүдний tombstone арилна');
  assert.equal(cl.cleared, 400);
  assert.equal(remote.entries.size, 3, 'оролт хөндөгдөөгүй');
  assert.equal(sig(applyClear(cl, keys, 400)), sig(cl), 'идемпотент');
  /* Цэвэрлэлтийн өмнө эхэлсэн бичилт (хуучин нүдтэй) дараа нь буувал — дахин хэрэглэхэд хаагдана */
  const late = merge(cl, mk([[kH(1), cell('илгээсэн', 100, 'a')]]), 1000);
  assert.equal(late.entries.has(kH(1)), false, 'tombstone хуучин хувилбарыг хаасаар');
  /* Бусад машины хуучин локал хуулбар — `cleared`-ээр нүд бүрээр */
  const otherLocal = mk([[kH(2), cell('хамтрагч-илгээлтэд-ороогүй', 150, 'b')], [kH(4), cell('хуучин-офлайн', 90, 'b')]]);
  assert.deepEqual([...dropCleared(otherLocal, cl.cleared).entries.keys()], [], 'cleared-ээс хуучин бүх нүд хуулбараас хаагдана');

  /* Тэмдэг: сериалчлал · нийлүүлэлт · хамрах */
  assert.ok(!hdClearMarkKey('plan:plan:b32').includes('|'));
  const m1 = { ts: 400, keys: new Map([[kH(1), 101]]) };
  const m2 = { ts: 500, keys: new Map([[kH(1), 90], [kH(5), 480]]) };
  const rt = parseMark(serializeMark(m1));
  assert.equal(rt.ts, 400);
  assert.deepEqual([...rt.keys], [[kH(1), 101]]);
  assert.equal(parseMark('{'), null);
  assert.equal(parseMark(null), null);
  assert.equal(parseMark('{"ts":1,"keys":[["bad",3],["h:1","x"],["h:2",7]]}').keys.size, 1, 'эвдэрсэн мөр л орхигдоно');
  const mm = mergeMark(m1, m2);
  assert.equal(mm.ts, 500);
  assert.equal(mm.keys.get(kH(1)), 101, 'түлхүүр бүрт ИХ агшин');
  assert.equal(mm.keys.get(kH(5)), 480);
  assert.equal(mergeMark(null, m1), m1);
  assert.equal(coversMark(cl, m1), true, 'цэвэрлэсэн ноорог тэмдгийг хамарна');
  assert.equal(coversMark(remote, m1), false, 'cleared-гүй/нүд амьд — хамрахгүй');
  assert.equal(coversMark({ ...remote, cleared: 400 }, m1), false, 'хуучин хувилбар амьд — хамрахгүй');
  assert.equal(coversMark(cl, mm), false, 'шинэ тэмдэг (ts 500) — хамрахгүй');
  assert.equal(coversMark(null, m1), false);
}
console.log('✅ HLC · нүд тус бүрийн cleared · хэсэгчилсэн цэвэрлэлт');

/* ── 8. ⚠️ 2026-10-08: НЯГТ БИЧИГЛЭЛ — муж хоногоор, нэр индексээр, val === bv нүд орохгүй; ХУУЧИН хэлбэр уншигдсаар ── */
{
  const d = mk([
    [kS(10, 0), cell(sp(2, 6), 900, 'gtumenjargal', sp(1, 5))],
    [kS(11, 1), cell({ start: 5 * D + 3600_000, end: 7 * D + 3600_000 }, 900, 'bat', { start: 4 * D + 1, end: 6 * D })], // цагтай — ms-ээр
    [kS(12, 0), cell(null, 900, 'bat', sp(1, 2))],                 // арилгасан муж
    [kH(10), cell('11SS0', 900, 'gtumenjargal', '18FS3')],
    [kH(11), cell('18FS3', 900, 'bat', '18FS3')],                  // серверийнхтэй ижил → бичигдэхгүй
    [kM('5|9F'), cell([['2026-01', 1]], 900, 'bat')],              // bv-гүй → хэвээр
  ]);
  const s = serialize(d);
  const w = JSON.parse(s);
  assert.deepEqual(w.u, ['bat', 'gtumenjargal'], 'нэрсийн хүснэгт эрэмбэтэй');
  assert.deepEqual(w.spans[0], [10, 0, [2, 6], 900, 1, [1, 5]], 'муж хоногоор, нэр индексээр');
  assert.deepEqual(w.spans[1].slice(2, 3), [[5 * D + 3600_000, 7 * D + 3600_000]], 'цагтай огноо ms-ээр хэвээр');
  assert.deepEqual(w.spans[2][2], null, 'арилгасан муж null');
  assert.equal(w.ham.length, 1, 'val === bv нүд бичигдэхгүй');
  const back = parse(s);
  assert.equal(back.entries.size, 5);
  for (const k of [kS(10, 0), kS(11, 1), kS(12, 0), kH(10), kM('5|9F')]) assert.deepEqual(back.entries.get(k), d.entries.get(k), `эргэх ${k}`);
  assert.equal(sig(back), sig(d));
  /* Хуучин хэлбэр (объект муж · нэр мөрөөр · `u`-гүй) */
  const old = parse(JSON.stringify({
    v: 1, t: 5, kind: 'plan', pkg: 'b', by: { user: 'A', at: 5 },
    spans: [[10, 0, { start: 2 * D, end: 6 * D }, 900, 'Bat', { start: D, end: 5 * D }], [12, 0, null, 900, 'bat', null]],
    ham: [[10, '11SS0', 900, 'bat', '18FS3']], actual: [], res: [], months: [], del: [], base: { at: 1, n: 2 },
  }));
  assert.deepEqual(old.entries.get(kS(10, 0)), cell(sp(2, 6), 900, 'bat', sp(1, 5)), 'хуучин объект муж + bv');
  assert.deepEqual(old.entries.get(kS(12, 0)), cell(null, 900, 'bat', null));
  assert.equal(old.entries.get(kH(10)).user, 'bat');
  assert.equal(sig(old), sig(parse(serialize(old))), 'хуучин → шинэ хэлбэр ижил гарын үсэг');
  /* Хэмжээ: нэг мужийн нүд (val + bv + нэр) */
  const c1 = cell(sp(20370, 20376), 1760000000000, 'gtumenjargal', sp(20255, 20261));
  const one = mk([[kS(1234, 3), c1]]);
  const two = mk([[kS(1234, 3), c1], [kS(1235, 3), c1]]);
  const per = serialize(two).length - serialize(one).length;
  assert.ok(per < 60, `нэг мужийн нүд ${per} тэмдэгт (< 60)`);
  console.log(`   нэг мужийн нүд ≈ ${per} тэмдэгт (хуучин ≈ 130), нэрсийн хүснэгт нэг удаа`);
}
console.log('✅ нягт бичиглэл · хуучин хэлбэр уншигдана');

/* ── 9. Шинэ жааз: танихуун (`rk`) · `identityRemap` · `remapDraft(keep)` (2026-10-09) ── */
{
  const sp = { start: 86_400_000, end: 2 * 86_400_000 };
  const d0 = {
    ...mk([[kS(10, 0), cell(sp, 50, 'me')], [kH(11), cell('5FS', 60, 'bat')], [kS(12, 0), cell(sp, 70, 'me')]], [[kS(110, 1), 40]]),
    rk: new Map([[10, { des: 5, no: '1.1', work: 'Бетон' }], [11, { des: null, no: '1.2', work: 'Арматур' }], [12, { des: 9, no: '9', work: 'Алга' }]]),
  };
  /* Сериал → задлах: танихуун эргэж ирнэ; `sig`-д ОРОХГҮЙ */
  const back = parse(serialize(d0));
  assert.deepEqual(back.rk.get(10), { des: 5, no: '1.1', work: 'Бетон' });
  assert.equal(sig(d0), sig({ ...d0, rk: undefined }), 'sig танихуунаас хамаарна — тойрог үүснэ');
  /* `max` — хэт том бол эхлээд нэргүй, дараа нь танихуунгүй (нүд хэзээ ч хасагдахгүй) */
  const full = serialize(d0);
  const lite = serialize(d0, full.length - 1);
  assert.ok(lite.length < full.length && parse(lite).rk.get(10).des === 5 && parse(lite).rk.get(10).work === '', 'нэргүй танихуун');
  assert.equal(parse(serialize(d0, 10)).entries.size, 3, 'хэт бага max — нүд хэвээр');
  /* Одоогийн мөрүүд: код 5 → 210, «1.2 Арматур» → 211; код 9 алга */
  const ctx = {
    n: 2,
    rows: new Map([
      [210, { spans: [null, null], ham: null, aStart: [], aEnd: [], hun: null, mashin: null, des: 5, no: '1.1x', work: 'Нэр өөрчлөгдсөн' }],
      [211, { spans: [null, null], ham: null, aStart: [], aEnd: [], hun: null, mashin: null, des: null, no: '1.2', work: 'Арматур' }],
    ]),
    months: () => undefined, monthsRes: () => undefined,
  };
  const im = identityRemap(d0, ctx);
  assert.deepEqual([...im.map], [[10, 210], [11, 211]], 'кодоор · № + нэрээр зөөнө');
  assert.deepEqual(im.lost, ['9 Алга'], 'олдоогүй мөр нэрээр');
  /* `keep` — бусдын хуучин нүд tombstone-гүй үлдэнэ, миний хуучин нүд tombstone */
  const r = remapDraft(d0, im.map, 999, (_k, e) => e.user !== 'me');
  assert.ok(r.entries.has(kS(210, 0)) && r.entries.has(kH(211)), 'шинэ түлхүүрт хуулбар');
  assert.ok(r.entries.has(kH(11)) && !r.del.has(kH(11)), 'бусдын хуучин нүд хэвээр');
  assert.equal(r.del.get(kS(10, 0)), 999, 'миний хуучин нүдэнд tombstone');
  /* Шинэ түлхүүрт ШИНЭ tombstone (буцаасан) байвал амилуулахгүй */
  const rev = { ...d0, del: new Map([[kS(210, 0), 80]]) };
  assert.equal(remapDraft(rev, new Map([[10, 210]]), 999).entries.has(kS(210, 0)), false, 'буцаасан нүд амилав');
  /* Шинэ түлхүүрт ШИНЭ нүд байвал дарахгүй */
  const newer = { ...d0, entries: new Map([...d0.entries, [kS(210, 0), cell(sp, 90, 'bat')]]) };
  assert.equal(remapDraft(newer, new Map([[10, 210]]), 999).entries.get(kS(210, 0)).at, 90, 'шинэ нүдийг хуучин дарав');
  /* Танихуунгүй (хуучин) ноорог — зөөхгүй, тоолно */
  assert.equal(identityRemap({ ...d0, rk: undefined }, ctx).unknown, 3);
}
console.log('✅ шинэ жааз — танихуунаар зөөнө');

console.log('✅ huvaariDraft: бүх шалгуур давлаа');
