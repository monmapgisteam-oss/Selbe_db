/**
 * «ЧАНАР (QAQC)»-ИЙН НООРОГИЙН НЭГТГЭЛ — цэвэр функцийн шалгуур (сүлжээгүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/qaqcDraft.check.mjs
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас). Хамгаалж буй алдаанууд:
 *   1. АРИЛГАСАН НҮД БУЦАЖ ИРЭХ — Б төхөөрөмж дээр арилгасан нүд А-гийн хуучин
 *      ноорогоос «зөвхөн нэг талд байгаа нүд» болж амилдаг байв (булш алга).
 *   2. БҮХЭЛ НООРОГ «СҮҮЛД БИЧСЭН НЬ ЯЛНА» — нүд бүрийн агшин байхгүй тул
 *      шинэ ноорогийн ХУУЧИН нүд нөгөө талын ШИНЭ нүдийг дардаг байв.
 *   3. ХУУЧИН ФОРМАТ (агшингүй) өгөгдөл алдалгүй уншигдах ёстой.
 *   4. Булш хязгааргүй өсөх — 30 хоног ба талбарын хэмжээгээр хязгаарлагдана.
 *   5. Цаг зөрсөн төхөөрөмж — ХАРСАН утгаа засвал хэрэглэгчийн үйлдэл ялна.
 */
import assert from 'node:assert/strict';
import {
  adoptQaqcDraft,
  applyPendDiff,
  draftFromState,
  draftIncludes,
  emptyQaqcDraftState,
  mergeQaqcDrafts,
  nextStamp,
  parseQaqcDraft,
  pruneQaqcDraft,
  serializeQaqcDraft,
  TOMB_TTL_MS,
} from './qaqcDraft.ts';

const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 9, 1, 9, 0, 0);
/** Түлхүүр → утга (амьд нүд) — харьцуулахад */
const live = (d) => Object.fromEntries((d?.cells ?? []).map(([k, v]) => [k, v]));
const dead = (d) => Object.fromEntries((d?.gone ?? []).map(([k, t]) => [k, t]));
/** Дарааллаас үл хамаарах дүрс — солигдох чанарыг шалгахад */
const canon = (d) => d && JSON.stringify({
  cells: [...d.cells].sort((a, b) => a[0].localeCompare(b[0])),
  gone: [...d.gone].sort((a, b) => a[0].localeCompare(b[0])),
});
/** Энгийн ноорог үүсгэгч (шинэ формат). ⚠️ `now` = ноорогийн агшин — жижиг
    агшинтай (100, 200 …) булш 30 хоногийн шүүлтүүрт таслагдахгүйн тулд. */
const doc = (cells, gone = [], rowKeys) => {
  const t = Math.max(0, ...cells.map((c) => c[2]), ...gone.map((g) => g[1]));
  return parseQaqcDraft(JSON.stringify({ v: 2, t, cells, gone, ...(rowKeys ? { rowKeys } : {}) }), { now: t });
};
/** Лампорт цаг (Qaqc.tsx-ийн `stamp`-тай ижил) */
const mkClock = (now, start = 0) => {
  let last = start;
  return { stamp: () => (last = nextStamp(last, now())), see: (t) => { last = Math.max(last, t); }, get: () => last };
};

/* ── 1. ХУУЧИН ФОРМАТ — өгөгдөл алдалгүй уншигдана ── */
{
  const old = JSON.stringify({ t: NOW - DAY, cells: [['5:1', 'MA-001'], ['6:2', 'MIR-7']], rowKeys: [[5, '1.1 ¦ Суурь'], [6, '1.2 ¦ Хана']] });
  const d = parseQaqcDraft(old, { now: NOW, ttlMs: 14 * DAY });
  assert.ok(d, 'хуучин формат уншигдах ёстой');
  assert.deepEqual(live(d), { '5:1': 'MA-001', '6:2': 'MIR-7' }, 'хуучин нүд бүгд үлдэнэ');
  for (const [, , t] of d.cells) assert.equal(t, NOW - DAY, 'агшингүй нүд ноорогийн ерөнхий агшныг авна');
  assert.deepEqual(new Map(d.rowKeys), new Map([[5, '1.1 ¦ Суурь'], [6, '1.2 ¦ Хана']]), 'мөрийн танигч хадгалагдана');
  assert.equal(d.gone.length, 0);
  /* Локал TTL нь зөвхөн локалд — алсынх хугацаагаар хаягдахгүй */
  const stale = JSON.stringify({ t: NOW - 20 * DAY, cells: [['5:1', 'x']] });
  assert.equal(parseQaqcDraft(stale, { now: NOW, ttlMs: 14 * DAY }), null, 'локал хуулбар 14 хоногт хүчингүй');
  assert.ok(parseQaqcDraft(stale, { now: NOW, ttlMs: null }), 'алсын хуулбар хугацаагаар ХЭЗЭЭ Ч хаягдахгүй');
  /* Эвдэрсэн оролт */
  assert.equal(parseQaqcDraft('{bad', { now: NOW }), null);
  assert.equal(parseQaqcDraft(JSON.stringify({ cells: [] }), { now: NOW }), null, 't-гүй бол null');
  assert.equal(parseQaqcDraft(JSON.stringify({ t: NOW, cells: [] }), { now: NOW }), null, 'хоосон ноорог = null');
  /* Хуучин ба шинэ формат холилдоно — хуучин нүд алдагдахгүй */
  const nw = doc([['7:0', 'FIC-1', NOW]]);
  assert.deepEqual(live(mergeQaqcDrafts(d, nw)), { '5:1': 'MA-001', '6:2': 'MIR-7', '7:0': 'FIC-1' });
}
console.log('✅ хуучин (агшингүй) формат өгөгдөл алдалгүй уншигдана');

/* ── 2. АРИЛГАСАН НҮД БУЦАЖ ИРЭХГҮЙ (хэрэглэгчийн мэдээлсэн алдаа) ──
   А төхөөрөмжид X=«MA-1» ноорог (локал). Б нээж, X-ийг харж, арилгана.
   А дахин нээхэд: урьд нь X нь «зөвхөн нэг талд» тул БУЦАЖ ирдэг байв. */
{
  const t0 = NOW - 3600_000;
  const aLocal = doc([['5:1', 'MA-1', t0], ['6:1', 'MA-2', t0]]);
  /* Б: сэргээж аваад (адоптаар), X-ийг арилгана */
  const clockB = mkClock(() => NOW);
  clockB.see(aLocal.t);
  const ad = adoptQaqcDraft(aLocal, emptyQaqcDraftState(), () => true, clockB.stamp);
  assert.equal(ad.count, 2);
  const prev = { ...ad.cells };
  const next = { ...prev };
  delete next['5:1'];
  const r = applyPendDiff(ad.st, prev, next, clockB.stamp);
  assert.ok(r.changed);
  const bDoc = draftFromState(r.st, () => undefined);
  assert.ok('5:1' in dead(bDoc), 'арилгасан нүд БУЛШ болно');
  /* А: локал (хуучин X-тэй) + алсын (Б-гийн булштай) → X ҮЛДЭХГҮЙ */
  const m1 = mergeQaqcDrafts(aLocal, bDoc);
  const m2 = mergeQaqcDrafts(bDoc, aLocal);
  assert.deepEqual(live(m1), { '6:1': 'MA-2' }, 'арилгасан нүд буцаж амилах ёсгүй');
  assert.equal(canon(m1), canon(m2), 'нэгтгэл солигддог');
  /* Давтан нэгтгэсэн ч (А-гийн хуучин хуулбар дахин ирсэн ч) арилгасан хэвээр */
  assert.deepEqual(live(mergeQaqcDrafts(m1, aLocal)), { '6:1': 'MA-2' });
  /* Хуучин ФОРМАТТАЙ А-гийн хуулбар (агшингүй) ч мөн адил */
  const aOld = parseQaqcDraft(JSON.stringify({ t: t0, cells: [['5:1', 'MA-1'], ['6:1', 'MA-2']] }), { now: NOW });
  assert.deepEqual(live(mergeQaqcDrafts(aOld, bDoc)), { '6:1': 'MA-2' }, 'хуучин форматын хуулбараас ч амилахгүй');
  /* Сериалчлал → задлал дамжсан ч булш хадгалагдана */
  const round = parseQaqcDraft(serializeQaqcDraft(bDoc, { now: NOW }), { now: NOW });
  assert.deepEqual(live(mergeQaqcDrafts(aLocal, round)), { '6:1': 'MA-2' });
}
console.log('✅ нэг төхөөрөмж дээр арилгасан нүд нөгөөгийн ноорогоос буцаж ирэхгүй');

/* ── 3. «ХАДГАЛАХ» / «НООРОГ УСТГАХ»-ЫН ДАРАА ч (бүх нүд булш) ── */
{
  const t0 = NOW - DAY;
  const stale = doc([['5:1', 'хуучин', t0], ['9:3', 'өөр нүд', t0]]);
  const clock = mkClock(() => NOW);
  clock.see(t0);
  const st0 = adoptQaqcDraft(doc([['5:1', 'шинэ', t0 + 1]]), emptyQaqcDraftState(), () => true, clock.stamp).st;
  /* хадгалсан: pend {5:1} → {} */
  const { st } = applyPendDiff(st0, { '5:1': 'шинэ' }, {}, clock.stamp);
  const saved = draftFromState(st, () => undefined);
  assert.deepEqual(live(saved), {});
  const m = mergeQaqcDrafts(stale, saved);
  assert.deepEqual(live(m), { '9:3': 'өөр нүд' }, 'хадгалсан нүд хуучин ноорогоос амилахгүй, ХАРААГҮЙ нүд үлдэнэ');
}
console.log('✅ хадгалсан нүд буцаж амилахгүй · хараагүй нүд үлдэнэ');

/* ── 4. НҮД БҮРЭЭР ШИНЭ НЬ ЯЛНА (бүхэл ноорогоор биш) ── */
{
  /* А: ерөнхийдөө ШИНЭ ноорог (t=300), гэхдээ X нь ХУУЧИН (100) */
  const a = doc([['1:0', 'a-X', 100], ['3:0', 'a-Z', 300]]);
  /* Б: ерөнхийдөө ХУУЧИН (t=200), гэхдээ X нь ШИНЭ (200) */
  const b = doc([['1:0', 'b-X', 200], ['2:0', 'b-Y', 150]]);
  const m = mergeQaqcDrafts(a, b);
  assert.deepEqual(live(m), { '1:0': 'b-X', '2:0': 'b-Y', '3:0': 'a-Z' },
    'нүд бүр өөрийн агшнаар — ерөнхий шинэ ноорогийн хуучин нүд ялахгүй');
  assert.equal(canon(m), canon(mergeQaqcDrafts(b, a)), 'солигддог');
  assert.equal(m.t, 300, 'ерөнхий агшин = хамгийн их');
  /* Шинэ утга хуучин булшийг ялна; шинэ булш хуучин утгыг ялна */
  assert.deepEqual(live(mergeQaqcDrafts(doc([], [['1:0', 100]]), doc([['1:0', 'v', 200]]))), { '1:0': 'v' });
  assert.deepEqual(live(mergeQaqcDrafts(doc([], [['1:0', 300]]), doc([['1:0', 'v', 200]]))), {});
  /* Тэнцүү агшин: амьд нь булшийг ялна (ажил хадгалагдана); хоёр амьд — тодорхой, солигддог */
  assert.deepEqual(live(mergeQaqcDrafts(doc([], [['1:0', 200]]), doc([['1:0', 'v', 200]]))), { '1:0': 'v' });
  const x = mergeQaqcDrafts(doc([['1:0', 'aaa', 200]]), doc([['1:0', 'bbb', 200]]));
  const y = mergeQaqcDrafts(doc([['1:0', 'bbb', 200]]), doc([['1:0', 'aaa', 200]]));
  assert.deepEqual(live(x), live(y), 'тэнцүү агшинтай хоёр утга — дарааллаас үл хамааран ижил');
  /* Нэг тал null */
  assert.equal(mergeQaqcDrafts(null, null), null);
  assert.equal(mergeQaqcDrafts(a, null), a);
}
console.log('✅ нүд бүрээр шинэ нь ялна · тэнцүүд тодорхой · солигддог');

/* ── 5. МӨРИЙН ТАНИГЧ — тухайн нүдийг дагуулсных (хамгийн шинэ) ── */
{
  const a = doc([['5:1', 'x', 100]], [], [[5, 'хуучин танигч']]);
  const b = doc([['5:2', 'y', 200]], [], [[5, 'шинэ танигч']]);
  const m = mergeQaqcDrafts(a, b);
  assert.equal(new Map(m.rowKeys).get(5), 'шинэ танигч');
  /* Зөвхөн булштай мөрийн танигч хадгалагдахгүй */
  const g = draftFromState({ cells: new Map(), gone: new Map([['8:0', 5]]) }, () => 'танигч');
  assert.equal(g.rowKeys, undefined);
}
console.log('✅ мөрийн танигч амьд нүдтэй мөрд л, хамгийн шинэ нь');

/* ── 6. БУЛШНЫ ХЯЗГААР — 30 хоног ба талбарын хэмжээ ── */
{
  const oldT = NOW - TOMB_TTL_MS - 1;
  const d = parseQaqcDraft(JSON.stringify({ v: 2, t: NOW, cells: [['1:0', 'v', NOW]], gone: [['2:0', oldT], ['3:0', NOW - DAY]] }), { now: NOW });
  assert.deepEqual(Object.keys(dead(d)), ['3:0'], '30 хоногоос хуучин булш хаягдана');
  assert.equal(pruneQaqcDraft(doc([], [['2:0', oldT + 2]]), NOW + 10), null, 'зөвхөн хуучирсан булштай ноорог = хоосон');
  /* Хэмжээ: амьд нүд ХЭЗЭЭ Ч хаягдахгүй, хамгийн хуучин булш эхэлж */
  const cells = [['1:0', 'MA-001', NOW]];
  const gone = Array.from({ length: 1000 }, (_, i) => [`${100 + i}:0`, NOW - (1000 - i) * 1000]);
  const big = doc(cells, gone);
  const full = serializeQaqcDraft(big, { now: NOW });
  const cap = Math.floor(full.length / 2);
  const cut = serializeQaqcDraft(big, { now: NOW, maxLen: cap });
  assert.ok(cut && cut.length <= cap, 'хязгаарт багтана');
  const back = parseQaqcDraft(cut, { now: NOW });
  assert.deepEqual(live(back), { '1:0': 'MA-001' }, 'амьд нүд хаягдахгүй');
  const kept = back.gone.map(([, t]) => t);
  assert.ok(kept.length > 0 && kept.length < 1000);
  assert.ok(Math.min(...kept) > Math.min(...gone.map((g) => g[1])), 'ХАМГИЙН ХУУЧИН булш эхэлж хаягдана');
  assert.equal(Math.max(...kept), Math.max(...gone.map((g) => g[1])), 'хамгийн шинэ булш үлдэнэ');
  /* Амьд нүд өөрөө багтахгүй бол null (дуудагч «хэт том» гэнэ) */
  assert.equal(serializeQaqcDraft(doc([['1:0', 'x'.repeat(500), NOW]]), { now: NOW, maxLen: 100 }), null);
}
console.log('✅ булш 30 хоног · хэмжээнд багтаахдаа хуучин булш эхэлж · амьд нүд хэзээ ч');

/* ── 7. БИЧИГДЭХ ФОРМАТ — зөвхөн шинэ (v:2), хуучин уншигчтай нийцтэй ── */
{
  const s = serializeQaqcDraft(doc([['5:1', 'MA-1', NOW]], [['6:1', NOW]]), { now: NOW });
  const o = JSON.parse(s);
  assert.equal(o.v, 2);
  assert.equal(typeof o.t, 'number');
  /* Хуучин `mergeDraft`: `new Map(cells)` → түлхүүр → утга (3 дахь элементийг үл тоох) */
  assert.deepEqual(Object.fromEntries(new Map(o.cells)), { '5:1': 'MA-1' }, 'хуучин bundle шинэ ноорогийг уншиж чадна');
  assert.deepEqual(o.gone, [['6:1', NOW]]);
}
console.log('✅ зөвхөн шинэ формат бичигдэнэ · хуучин уншигчтай нийцтэй');

/* ── 8. PEND-ИЙН ШИЛЖИЛТ → агшин/булш ── */
{
  const clock = mkClock(() => 1000);
  let st = emptyQaqcDraftState();
  let r = applyPendDiff(st, {}, {}, clock.stamp);
  assert.equal(r.changed, false);
  assert.equal(r.st, st, 'өөрчлөлтгүй бол ижил объект');
  r = applyPendDiff(st, {}, { 'a:1': 'x' }, clock.stamp);
  st = r.st;
  const t1 = st.cells.get('a:1').t;
  /* утга ижил → агшин хэвээр (жиш. сэргээлтээр орж ирсэн нүд) */
  r = applyPendDiff(st, { 'a:1': 'x' }, { 'a:1': 'x' }, clock.stamp);
  assert.equal(r.changed, false);
  assert.equal(r.st.cells.get('a:1').t, t1);
  /* утга өөрчлөгдсөн → ШИНЭ агшин (цаг ухарсан ч) */
  r = applyPendDiff(st, { 'a:1': 'x' }, { 'a:1': 'y' }, clock.stamp);
  assert.ok(r.st.cells.get('a:1').t > t1, 'засвар бүр өмнөхөөсөө шинэ');
  st = r.st;
  /* арилгасан → булш, амьдаас хасагдана */
  r = applyPendDiff(st, { 'a:1': 'y' }, {}, clock.stamp);
  assert.ok(!r.st.cells.has('a:1') && r.st.gone.get('a:1') > st.cells.get('a:1').t);
  /* дахин бичвэл булш арилна */
  r = applyPendDiff(r.st, {}, { 'a:1': 'z' }, clock.stamp);
  assert.ok(r.st.cells.has('a:1') && !r.st.gone.has('a:1'));
  /* ⚠️ `prev`-д БАЙГААГҮЙ нүдийг (сэргээлтээр төлөвт нэмэгдсэн ч `pend`-д хараахан ороогүй) булшлахгүй */
  const st2 = { cells: new Map([['b:1', { v: 'q', t: 5 }]]), gone: new Map() };
  r = applyPendDiff(st2, {}, {}, clock.stamp);
  assert.equal(r.changed, false);
  assert.ok(r.st.cells.has('b:1'));
}
console.log('✅ pend-ийн шилжилт: засвар → шинэ агшин, арилгалт → булш, ижил → хэвээр');

/* ── 9. СЭРГЭЭЛТИЙН ХҮЛЭЭН АВАЛТ ── */
{
  const clock = mkClock(() => 50);
  const stored = doc(
    [['1:0', 'хадгалсан', 100], ['2:0', 'тохирохгүй', 100], ['3:0', 'шинэ', 120]],
    [['4:0', 100]],
    [[1, 'танигч-1'], [2, 'хуучин танигч'], [3, 'танигч-3']],
  );
  /* Табад: 1:0-г сэргээлтийг хүлээх хооронд бичсэн (агшин 50 < 100) */
  const st = { cells: new Map([['1:0', { v: 'бичсэн', t: 50 }]]), gone: new Map() };
  clock.see(stored.t);
  const seen = [];
  const ad = adoptQaqcDraft(stored, st, (k, want) => { seen.push([k, want]); return k !== '2:0'; }, clock.stamp);
  assert.deepEqual(ad.cells, { '3:0': 'шинэ' }, 'зөвхөн хөндөөгүй, тохирох нүд pend-д орно');
  assert.equal(ad.count, 1);
  assert.equal(ad.dropped, 1);
  assert.equal(ad.st.cells.get('1:0').v, 'бичсэн', 'табад бичсэн нь ялна');
  assert.ok(ad.st.cells.get('1:0').t > 100, '…хадгалсанаас ШИНЭ агшин авна (дараагийн нэгтгэлд зөрөхгүй)');
  assert.equal(ad.st.gone.get('2:0'), 101, 'тохирохгүй нүд ТЭР хувилбараараа булшлагдана');
  assert.equal(ad.st.gone.get('4:0'), 100, 'хадгалсан булш табын төлөвт орно');
  assert.ok(seen.some(([k, w]) => k === '3:0' && w === 'танигч-3'), 'шалгагч мөрийн танигчийг авна');
  /* Үр дүнгийн ноорог хуучин хуулбартай нэгтгэхэд тохирохгүй нүд дахин гарахгүй */
  const after = mergeQaqcDrafts(stored, draftFromState(ad.st, () => undefined));
  assert.equal(live(after)['2:0'], undefined);
  assert.equal(live(after)['1:0'], 'бичсэн');
  /* Табад арилгасан нүд: хадгалсан нь ХУУЧИН бол арилгасан хэвээр, ШИНЭ бол буцаж орно */
  const st3 = { cells: new Map(), gone: new Map([['7:0', 300]]) };
  assert.deepEqual(adoptQaqcDraft(doc([['7:0', 'v', 200]]), st3, () => true, clock.stamp).cells, {});
  const ad4 = adoptQaqcDraft(doc([['7:0', 'v', 400]]), st3, () => true, clock.stamp);
  assert.deepEqual(ad4.cells, { '7:0': 'v' });
  assert.ok(!ad4.st.gone.has('7:0'));
}
console.log('✅ сэргээлт: табынх ялна · тохирохгүй нүд булшлагдана · булш дамжина');

/* ── 10. ArcGIS-д ДУТУУ зүйл байгаа эсэх (сэргээлтийн дараах илгээлт) ── */
{
  const remote = doc([['1:0', 'v', 100]], [['2:0', 100]]);
  assert.equal(draftIncludes(remote, null), true);
  assert.equal(draftIncludes(null, remote), false);
  assert.equal(draftIncludes(remote, doc([['1:0', 'v', 100]])), true, 'ижил зүйл — илгээх шаардлагагүй');
  assert.equal(draftIncludes(remote, doc([['1:0', 'v', 50]])), true, 'хуучин зүйл — илгээх шаардлагагүй');
  assert.equal(draftIncludes(remote, doc([], [['1:0', 150]])), false, 'локалд л байгаа шинэ булш → илгээнэ');
  assert.equal(draftIncludes(remote, doc([['3:0', 'x', 10]])), false, 'локалд л байгаа нүд → илгээнэ');
}
console.log('✅ ArcGIS-д дутуу булш/нүдийг таньна');

/* ── 11. ЦАГ ЗӨРСӨН ТӨХӨӨРӨМЖ — Лампорт ── */
{
  assert.equal(nextStamp(1000, 500), 1001, 'цаг ухарсан ч агшин өсөнө');
  assert.equal(nextStamp(1000, 2000), 2000);
  /* Б-гийн цаг 1 цагаар УРАГШАА: X-ийг «ирээдүйн» агшинтай бичсэн */
  const ahead = NOW + 3600_000;
  const bDoc = doc([['5:1', 'Б-гийн утга', ahead]]);
  /* А (зөв цагтай) сэргээж ХАРААД арилгана — урьдчилсан цаг ч А-г дарахгүй */
  const clockA = mkClock(() => NOW);
  clockA.see(bDoc.t);
  const ad = adoptQaqcDraft(bDoc, emptyQaqcDraftState(), () => true, clockA.stamp);
  const { st } = applyPendDiff(ad.st, ad.cells, {}, clockA.stamp);
  const aDoc = draftFromState(st, () => undefined);
  assert.deepEqual(live(mergeQaqcDrafts(bDoc, aDoc)), {}, 'ХАРСАН утгаа арилгавал цаг зөрсөн ч арилгалт ялна');
  /* Харьцуулалт: Лампортгүйгээр (зөвхөн NOW) арилгалт ялагдах байв */
  const naive = doc([], [['5:1', NOW]]);
  assert.deepEqual(live(mergeQaqcDrafts(bDoc, naive)), { '5:1': 'Б-гийн утга' });
}
console.log('✅ цаг зөрсөн ч хэрэглэгчийн харсан утгын засвар ялна (Лампорт)');

/* ── ⚠️ 2026-10-09: СЕРВЕРТ АЛЬ ХЭДИЙН БАЙГАА утга (`isSaved`) — pend-д орохгүй, булшлагдана ──
   Өөр төхөөрөмж дээр хадгалагдсан ч булш нь энд хүрээгүй хуучин ноорог «Хадгалах (N)»-ийг
   хөөрөгдөж, хадгалахад серверийн шинэ утгыг дарах эрсдэл үүсгэдэг байв. */
{
  const clock = mkClock(() => 50);
  const stored = doc([['1:0', 'M-1 ', 100], ['2:0', 'M-2', 100]]);
  clock.see(stored.t);
  const server = { '1:0': 'M-1', '2:0': 'M-9' };
  const ad = adoptQaqcDraft(stored, emptyQaqcDraftState(), () => true, clock.stamp,
    (k, v) => v.trim() === (server[k] ?? '').trim());
  assert.deepEqual(ad.cells, { '2:0': 'M-2' }, 'серверт байгаа (trim-тэй ижил) утга pend-д орохгүй');
  assert.equal(ad.count, 1);
  assert.equal(ad.same, 1);
  assert.equal(ad.dropped, 0);
  assert.equal(ad.st.gone.get('1:0'), 101, 'ТЭР хувилбараараа булшлагдана — алсын хуулбараас ч арилна');
  assert.equal(live(mergeQaqcDrafts(stored, draftFromState(ad.st, () => undefined)))['1:0'], undefined);
  /* `isSaved` өгөөгүй бол хуучин зан хэвээр */
  assert.equal(adoptQaqcDraft(stored, emptyQaqcDraftState(), () => true, clock.stamp).count, 2);
  /* Табад бичсэн нүдэд `isSaved` хамаарахгүй — табынх ялна */
  const st = { cells: new Map([['1:0', { v: 'шинэ', t: 200 }]]), gone: new Map() };
  const ad2 = adoptQaqcDraft(stored, st, () => true, clock.stamp, () => true);
  assert.equal(ad2.st.cells.get('1:0').v, 'шинэ');
}
console.log('✅ серверт байгаа утга ноорогоос сэргэхгүй');

console.log('\nqaqcDraft (lib).check: ok');
