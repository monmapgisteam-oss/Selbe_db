/**
 * БАГЦ ХООРОНДЫН АЖЛЫН ХАМААРАЛ — `workDeps.ts`-ийн цэвэр логик (2026-10-22).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/workDeps.check.mjs
 *
 * ⚠️ Гол гэрээ: холбоос нь OBJECTID БИШ «№ ¦ Ажил» + давтамж (+ Des_dugaar) — шинэ архивын жаазад (бүх oid
 *    өөр) ижил мөрөнд тулгагдана; давтамж зөрвөл ТААМАГЛАХГҮЙ (өнчин гэж ИЛ); эвдэрсэн бичлэг шидэнэ;
 *    дугуй · өөртөө · нэг хуудас · 8000-аас урт хориотой; бичилт нь одоогийн утга дээр нэгтгэнэ.
 */
import assert from 'node:assert/strict';
import {
  parseRefs, refsJson, sizeError, sameRefs, applyRefChange, pathsOf, buildGraph, resolveRef, refOf, reachesPre,
  linkError, checkNext, locateRow, pkgPairs, pkgDeps, upstreamOf, downstreamOf, legacyPkgKey, legacyCovered,
  sectionsOf, nodeMatches, nodeId, refId, dependentsOf, rebaseChange, WORK_DEPS_MAX, WORK_DEPS_FIELD,
} from './workDeps.ts';
import { resolveSchema } from '@/modules/sheet/bagts.pkg.ts';
import { buildFrame } from '@/modules/sheet/sheetFrame.ts';

/* ── Хиймэл хуудсууд: A (b1_9f) — давхардсан шошготой; B (b31_9f); C (b71) ── */
const R = (oid, no, work, depth, group = false, des = null, val = undefined) => ({ oid, no, work, depth, group, des, val });
const A = (base, valOf = {}) => [
  R(base + 1, 'Б18', 'Блок 1', 0, true, 1),
  R(base + 2, '1', 'Шороо', 1, false, 2, valOf[2]),
  R(base + 3, '2', 'Суурь', 1, false, 3, valOf[3]),
  R(base + 4, 'Б19', 'Блок 2', 0, true, 4),
  R(base + 5, '1', 'Шороо', 1, false, 5, valOf[5]),
  R(base + 6, '2', 'Суурь', 1, false, 6, valOf[6]),
];
const B = (base, valOf = {}) => [
  R(base + 1, 'А.', 'Шугам', 0, true, 1),
  R(base + 2, '1', 'Ус', 1, false, 2, valOf[2]),
  R(base + 3, '2', 'Цахилгаан', 1, false, 3, valOf[3]),
];
const C = (base, valOf = {}) => [R(base + 1, '1', 'Зам', 0, false, 1, valOf[1])];

/* ── Бичиглэл ── */
{
  const refs = [{ p: 'b31_9f', k: '1 ¦ Ус', d: 2 }, { p: 'b1_9f', k: '1 ¦ Шороо', o: 1, n: 2, d: 5 }];
  assert.deepEqual(parseRefs(refsJson(refs)), refs);
  assert.equal(refsJson([]), null, 'хоосон → null (талбар цэвэр)');
  assert.deepEqual(parseRefs(null), []);
  assert.deepEqual(parseRefs('  '), []);
  assert.deepEqual(parseRefs('[{"p":"b71","k":"1 ¦ Зам","o":0,"n":1}]'), [{ p: 'b71', k: '1 ¦ Зам' }], '0/1 анхдагчийг шахна');
  assert.equal(parseRefs('[{"p":"b71","k":"1 ¦ Зам"},{"p":"b71","k":"1 ¦ Зам","d":1}]').length, 1, 'давхардал нэг болно');
  assert.throws(() => parseRefs('{"p":"b71"}'), 'массив биш — шидэнэ');
  assert.throws(() => parseRefs('not json'), 'JSON биш — шидэнэ');
  assert.throws(() => parseRefs('[{"p":"b71"}]'), 'k дутуу — шидэнэ (чимээгүй хаяхгүй)');
  assert.throws(() => parseRefs('[{"p":"b71","k":"x","o":2,"n":2}]'), 'o ≥ n — шидэнэ');
  assert.equal(WORK_DEPS_FIELD, 'bagts_hamaaral');
  const long = Array.from({ length: 200 }, (_, i) => ({ p: 'b1_9f', k: `${i} ¦ ${'Урт нэртэй ажил '.repeat(3)}` }));
  assert.ok(refsJson(long).length > WORK_DEPS_MAX);
  assert.match(sizeError(refsJson(long)), /8000/, '8000-аас урт — ил шалтгаан');
  assert.equal(sizeError(refsJson(refs)), null);
  assert.ok(sameRefs(refs, [refs[1], refs[0]]), 'дараалал хамаагүй');
  assert.ok(!sameRefs(refs, [refs[0]]));
  console.log('✅ бичиглэл · хэмжээ');
}

/* ── Зам («Б18 → 1») ── */
{
  const p = pathsOf(A(0));
  assert.deepEqual(p[2].path, ['Б18', '2']);
  assert.equal(p[2].parent, 0);
  assert.deepEqual(p[4].path, ['Б19', '1']);
  assert.equal(p[0].parent, -1);
  console.log('✅ зам · эцэг');
}

/* ── Граф: давхардсан шошго · тогтвортой түлхүүр · өнчин ── */
const sheets = (aVals = {}, bVals = {}, cVals = {}, baseA = 100, baseB = 500, baseC = 900) => [
  { p: 'b1_9f', rows: A(baseA, aVals), field: true },
  { p: 'b31_9f', rows: B(baseB, bVals), field: true },
  { p: 'b71', rows: C(baseC, cVals), field: false },
];
{
  /* Блок 2-ын «1 ¦ Шороо» (2-р тохиолдол) нь B-ийн «1 ¦ Ус»-аас хамаарна */
  const g0 = buildGraph(sheets());
  const sh2 = g0.nodes.get(nodeId('b1_9f', '1 ¦ Шороо', 1));
  assert.equal(sh2.oid, 105);
  assert.equal(sh2.n, 2);
  const ref = refOf(sh2);
  assert.deepEqual(ref, { p: 'b1_9f', k: '1 ¦ Шороо', o: 1, n: 2, d: 5 });
  const us = refOf(g0.nodes.get(nodeId('b31_9f', '1 ¦ Ус')));
  const val = refsJson([us]);
  const g = buildGraph(sheets({ 5: val }));
  const e = g.pre.get(sh2.id);
  assert.equal(e.length, 1);
  assert.equal(e[0].to, nodeId('b31_9f', '1 ¦ Ус'));
  assert.deepEqual(g.post.get(nodeId('b31_9f', '1 ¦ Ус')), [sh2.id], 'урвуу индекс');

  /* ⚠️ ШИНЭ ЖААЗ — бүх OBJECTID өөр (архивын хуулбар); холбоос ижил мөрөнд тулгагдана */
  const g2 = buildGraph(sheets({ 5: val }, {}, {}, 7000, 8000, 9000));
  const sh2b = g2.nodes.get(sh2.id);
  assert.equal(sh2b.oid, 7005, 'шинэ жаазын мөр');
  assert.equal(g2.pre.get(sh2.id)[0].to, nodeId('b31_9f', '1 ¦ Ус'));
  assert.equal(g2.nodes.get(g2.pre.get(sh2.id)[0].to).oid, 8002);
  assert.equal(locateRow(A(7000), ref).oid, 7005, 'бичихийн өмнөх дахин уншилт — ижил ажил');

  /* Өнчин: шошго алга / хуудас уншигдаагүй / давтамж зөрсөн — ИЛ (`why`), хаягдахгүй */
  const gone = refsJson([{ p: 'b31_9f', k: '9 ¦ Алга' }, { p: 'b71', k: '1 ¦ Зам' }]);
  const g3 = buildGraph([{ p: 'b1_9f', rows: A(0, { 2: gone }), field: true }, { p: 'b31_9f', rows: B(500), field: true }, { p: 'b71', rows: null, field: false }]);
  const oe = g3.pre.get(nodeId('b1_9f', '1 ¦ Шороо'));
  assert.deepEqual(oe.map((x) => x.why), ['missing', 'unloaded']);
  assert.ok(g3.failed.has('b71'));
  /* Шинэ жаазад ижил шошготой ГУРАВ ДАХЬ мөр нэмэгдсэн — `n` зөрнө → хоёрдмол (Des_dugaar-гүй бол) */
  const rowsAdded = [...A(0), R(7, '1', 'Шороо', 1, false, 7)];
  const gA = buildGraph([{ p: 'b1_9f', rows: rowsAdded, field: false }]);
  assert.deepEqual(resolveRef(gA, { p: 'b1_9f', k: '1 ¦ Шороо', o: 1, n: 2 }), { to: null, why: 'ambiguous' }, 'ТААМАГЛАХГҮЙ');
  assert.equal(resolveRef(gA, { p: 'b1_9f', k: '1 ¦ Шороо', o: 1, n: 2, d: 5 }).to, nodeId('b1_9f', '1 ¦ Шороо', 1), 'Des_dugaar таарвал тэр мөр');
  /* Эвдэрсэн бичлэг — граф унахгүй, `bad`-д */
  const gb = buildGraph([{ p: 'b1_9f', rows: A(0, { 3: '{oops' }), field: true }]);
  assert.equal(gb.bad.length, 1);
  assert.equal(gb.pre.size, 0);
  /* Талбаргүй хуудасны утгыг уншихгүй */
  const gc = buildGraph([{ p: 'b71', rows: C(0, { 1: val }), field: false }, { p: 'b31_9f', rows: B(500), field: true }]);
  assert.equal(gc.pre.size, 0);
  console.log('✅ граф · шинэ жааз · өнчин · хоёрдмол · эвдэрсэн');
}

/* ── Хориг: өөртөө · нэг хуудас · дугуй ── */
{
  const a1 = nodeId('b1_9f', '1 ¦ Шороо');

  const b2 = nodeId('b31_9f', '2 ¦ Цахилгаан');
  /* a1 ← b1 (a1 нь b1-ээс хамаарна), b1 ← b2 */
  const g = buildGraph(sheets({ 2: refsJson([{ p: 'b31_9f', k: '1 ¦ Ус' }]) }, { 2: refsJson([{ p: 'b31_9f', k: '2 ¦ Цахилгаан' }]) }));
  /* ⚠️ нэг хуудасны холбоос граф дээр байсан ч (гараар бичсэн) уншигдана; нэмэхэд хориотой */
  assert.ok(reachesPre(g, a1, b2), 'a1 → b1 → b2');
  assert.ok(linkError(g, a1, a1), 'өөртөө');
  assert.ok(linkError(g, a1, nodeId('b1_9f', '2 ¦ Суурь')), 'нэг хуудас');
  assert.match(linkError(g, b2, a1), /Дугуй|дугуй/, 'b2 ← a1 нь дугуй (a1 → b1 → b2)');
  assert.equal(linkError(g, nodeId('b71', '1 ¦ Зам'), a1), null);
  /* `dependentsOf` ≡ `linkError`-ийн дугуй (сонгогч нэг давалтаар) */
  assert.deepEqual([...dependentsOf(g, b2)].sort(), [a1, nodeId('b31_9f', '1 ¦ Ус')].sort());
  for (const id of g.nodes.keys()) assert.equal(dependentsOf(g, b2).has(id), reachesPre(g, id, b2) && id !== b2, id);
  /* checkNext — зөвхөн НЭМЭГДСЭНийг шалгана; өнчин хуучин холбоосыг хасах боломжтой */
  const cur = [{ p: 'b31_9f', k: '9 ¦ Алга' }];
  assert.equal(checkNext(g, a1, cur, [...cur, refOf(g.nodes.get(nodeId('b71', '1 ¦ Зам')))]), null);
  assert.equal(checkNext(g, a1, cur, []), null, 'өнчнийг хасах — зөвшөөрнө');
  assert.ok(checkNext(g, b2, [], [refOf(g.nodes.get(a1))]), 'дугуй нэмэлт — шалтгаан');
  assert.ok(checkNext(g, a1, [], [{ p: 'b31_9f', k: '9 ¦ Алга' }]), 'олдохгүй ажлыг нэмэхгүй');
  /* ⚠️ 2026-10-22 (аудит): ижил `refId`-тай хоёрдмол (өнчин) хуучин холбоос нь ШИНЭ холбоосыг дугуйн шалгалтаас
     чөлөөлөхгүй — хуудсанд гурав дахь «1 ¦ Шороо» нэмэгдсэн, эхнийх нь (o:0) B-ийн «1 ¦ Ус»-аас хамаарна */
  const rows3 = [...A(0, { 2: refsJson([{ p: 'b31_9f', k: '1 ¦ Ус' }]) }), R(7, '1', 'Шороо', 1, false, 7)];
  const g3 = buildGraph([{ p: 'b1_9f', rows: rows3, field: true }, { p: 'b31_9f', rows: B(500), field: true }]);
  const us = nodeId('b31_9f', '1 ¦ Ус');
  const stale = [{ p: 'b1_9f', k: '1 ¦ Шороо', n: 2 }];
  assert.equal(resolveRef(g3, stale[0]).why, 'ambiguous');
  assert.match(checkNext(g3, us, stale, [refOf(g3.nodes.get(nodeId('b1_9f', '1 ¦ Шороо')))]) ?? '', /Дугуй|дугуй/, 'ижил refId — дугуй БАРИГДАНА');
  assert.equal(checkNext(g3, us, stale, stale), null, 'яг ижил хуучин холбоос — шалгахгүй (хасах/хадгалах боломжтой)');
  console.log('✅ өөртөө · нэг хуудас · дугуй · шалгалт');
}

/* ── Сүүлийн граф дээр шинэчлэх (`rebaseChange`, 2026-10-22 аудит) ── */
{
  /* Харагдац хуучирсан: «1 ¦ Шороо» хоёр байсан (o:1 → des 5); одоо гурав (төгсгөлд des 7 нэмэгдсэн) */
  const gNow = buildGraph([{ p: 'b1_9f', rows: [...A(0), R(7, '1', 'Шороо', 1, false, 7)], field: true }, { p: 'b31_9f', rows: B(500), field: true }]);
  const old = { p: 'b1_9f', k: '1 ¦ Шороо', o: 1, n: 2, d: 5 };
  const c = rebaseChange(gNow, [], { add: [old], remove: [] });
  assert.deepEqual(c.add, [{ p: 'b1_9f', k: '1 ¦ Шороо', o: 1, n: 3, d: 5 }], 'нэмэх холбоос сүүлийн жаазын o/n/d-тэй');
  /* Ижил ажил руу заасан хуучин бичлэг (d-ээр тулгагдсан, n хуучин) — ДАВХАР үлдэхгүй */
  const cur = [old, { p: 'b31_9f', k: '1 ¦ Ус' }];
  const next = applyRefChange(cur, rebaseChange(gNow, cur, { add: [old], remove: [] }));
  assert.deepEqual(next, [{ p: 'b1_9f', k: '1 ¦ Шороо', o: 1, n: 3, d: 5 }, { p: 'b31_9f', k: '1 ¦ Ус' }], 'байрандаа шинэчлэгдэнэ');
  /* Хасах: нэг ажил руу хоёр бичлэг заасан бол хоёул хасагдана */
  const twice = [old, { p: 'b1_9f', k: '1 ¦ Шороо', o: 1, n: 3, d: 5 }];
  assert.deepEqual(applyRefChange(twice, rebaseChange(gNow, twice, { add: [], remove: [twice[1]] })), []);
  /* Өнчин (тулгагдахгүй) — хэвээр, refId-аар хасагдана */
  const lost = { p: 'b31_9f', k: '9 ¦ Алга' };
  assert.deepEqual(rebaseChange(gNow, [lost], { add: [], remove: [lost] }).remove, [lost]);
  assert.deepEqual(applyRefChange([lost], rebaseChange(gNow, [lost], { add: [], remove: [lost] })), []);
  console.log('✅ сүүлийн граф дээр шинэчлэх');
}

/* ── Бичилтийн нэгтгэл (өөр хүний холбоос дарагдахгүй) ── */
{
  const x = { p: 'b31_9f', k: '1 ¦ Ус' };
  const y = { p: 'b71', k: '1 ¦ Зам' };
  const z = { p: 'b31_9f', k: '2 ¦ Цахилгаан' };
  /* Би x-ийг нэмж z-ийг хасна; хооронд нь өөр хүн y-г нэмсэн (серверийн одоогийн утга [z, y]) */
  const server = [z, y];
  assert.deepEqual(applyRefChange(server, { add: [x], remove: [z] }), [y, x], 'өөр хүний y хэвээр');
  assert.deepEqual(applyRefChange([x], { add: [x], remove: [] }), [x], 'нэмэх — idempotent');
  assert.deepEqual(applyRefChange([y], { add: [], remove: [x] }), [y], 'байхгүйг хасах — өөрчлөлтгүй');
  assert.deepEqual(applyRefChange([{ ...x, n: 1 }], { add: [{ ...x, d: 2 }], remove: [] }), [{ ...x, d: 2 }], 'дахин нэмэх — шинэ мэдээлэл');
  assert.equal(refId({ p: 'b71', k: '1 ¦ Зам' }), refId({ p: 'b71', k: '1 ¦ Зам', o: 0, n: 3 }));
  console.log('✅ нэгтгэл');
}

/* ── Багцын түвшин · хуучин холбоосын шилжилт ── */
{
  const g = buildGraph(sheets(
    { 2: refsJson([{ p: 'b31_9f', k: '1 ¦ Ус' }, { p: 'b31_9f', k: '2 ¦ Цахилгаан' }, { p: 'b31_9f', k: '9 ¦ Алга' }]) },
    { 2: refsJson([{ p: 'b71', k: '1 ¦ Зам' }]) },
  ));
  const pairs = pkgPairs(g);
  assert.deepEqual(pairs.sort((a, b) => a.to.localeCompare(b.to)), [
    { from: 'b31_9f', to: 'b1_9f', n: 2 }, { from: 'b71', to: 'b31_9f', n: 1 },
  ], 'өнчин тоологдохгүй');
  const key = { b1_9f: 'БАГЦ1', b1_12f: 'БАГЦ1', b31_9f: 'БАГЦ31', b71: 'БАГЦ71' };
  const deps = pkgDeps([...pairs, { from: 'b1_12f', to: 'b1_9f', n: 1 }], (p) => key[p]);
  assert.deepEqual(deps, [{ from: 'БАГЦ31', to: 'БАГЦ1' }, { from: 'БАГЦ71', to: 'БАГЦ31' }], '9F ↔ 12F (өөртөө) орохгүй');
  assert.deepEqual(upstreamOf(deps, 'БАГЦ1'), ['БАГЦ31']);
  assert.deepEqual(downstreamOf(deps, 'БАГЦ31'), ['БАГЦ1']);
  assert.equal(legacyPkgKey('energy:БАГЦ61'), 'БАГЦ61');
  assert.equal(legacyPkgKey('БАГЦ1'), 'БАГЦ1');
  assert.equal(legacyPkgKey('d:12'), '');
  const sheetsOf = (k) => Object.keys(key).filter((p) => key[p] === k);
  /* Хуучин { from: БАГЦ31, to: БАГЦ1 } = «Багц 1 нь 3.1-ээс хамаарна» → ажлын холбоо байгаа тул шилжсэн */
  assert.ok(legacyCovered(pairs, { from: 'БАГЦ31', to: 'БАГЦ1' }, sheetsOf));
  assert.ok(!legacyCovered(pairs, { from: 'БАГЦ1', to: 'БАГЦ31' }, sheetsOf), 'чиглэл чухал');
  assert.ok(!legacyCovered(pairs, { from: 'cf:3', to: 'БАГЦ1' }, sheetsOf), 'хуудасгүй — шилжихгүй');
  console.log('✅ багцын тойм · ТУХ · хуучин холбоос');
}

/* ── Харагдацын туслах ── */
{
  const g = buildGraph(sheets());
  const secs = sectionsOf(g, 'b1_9f');
  assert.equal(secs.length, 2);
  assert.equal(secs[0].id, nodeId('b1_9f', 'Б18 ¦ Блок 1'));
  assert.deepEqual(secs[1].items, [nodeId('b1_9f', '1 ¦ Шороо', 1), nodeId('b1_9f', '2 ¦ Суурь', 1)], 'бүлэг мөр сонгогдохгүй');
  const n = g.nodes.get(nodeId('b1_9f', '2 ¦ Суурь', 1));
  assert.ok(nodeMatches(n, 'б19'));
  assert.ok(nodeMatches(n, 'суурь'));
  assert.ok(!nodeMatches(n, 'шороо'));
  console.log('✅ хэсэг · хайлт');
}

/* ── Бүдүүвч ба архивын жааз: талбар таних, ДАМЖИХ ── */
{
  const F = (name, type = 'esriFieldTypeString') => ({ name, type });
  const base = [F('objectid', 'esriFieldTypeOID'), F('f_'), F('Ажил'), F('hamaaral'), F('buglusun_ognoo', 'esriFieldTypeDate')];
  assert.equal(resolveSchema(base).f.bham, null, 'талбаргүй → null (зөвхөн харах)');
  const sc = resolveSchema([...base, F('bagts_hamaaral')]);
  assert.equal(sc.f.bham, 'bagts_hamaaral');
  assert.equal(sc.f.ham, 'hamaaral', '`^hamaaral$` нь bagts_hamaaral-д ТААРАХГҮЙ');
  /* ⚠️ `buildFrame` нь `{...r.raw}` — шинэ жаазад талбар ДАМЖИНА (архив хамаарлыг устгахгүй) */
  const json = refsJson([{ p: 'b31_9f', k: '1 ¦ Ус' }]);
  const row = {
    oid: 1, no: '1', des: 1, ham: null, work: 'Шороо', depth: 0, group: false, wC: 1, wD: 1, vol: null, plannedVol: null,
    unit: null, money: null, act: [], obyem: [], start: [], end: [], gStart: [], gEnd: [], aStart: [], aEnd: [], hun: null, mashin: null,
    raw: { objectid: 1, f_: '1', Ажил: 'Шороо', bagts_hamaaral: json },
  };
  const fr = buildFrame([row], sc, 0, null, [], Date.UTC(2026, 9, 22));
  assert.equal(fr[0].bagts_hamaaral, json);
  console.log('✅ бүдүүвч · архивын жаазад дамжина');
}
