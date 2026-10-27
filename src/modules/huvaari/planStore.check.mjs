/**
 * «ХУВААРЬ»-ИЙН НООРОГ — 191-ИЙН МӨРИЙН ХАДГАЛАЛТ (`huvaariStore`) ШАЛГУУР (2026-10-26). Сүлжээгүй — хуурамч Enterprise
 * (`draftRows.fake.mjs`).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/huvaari/planStore.check.mjs
 *
 *   1. Жааз солигдох — уншилтад нүдийг КОДООР одоогийн oid руу (хуучин oid шинэ жаазад ӨӨР ажилд давтагдсан ч буруу ажилд
 *      наалдахгүй; код алга → `synOid`); tombstone ч; `merge`-ийн дүрэм; `rk` дагана.
 *   2. Бичихийн өмнөх давхардал (`collapseCells`) — хуучин/шинэ oid-ын ижил ажил × блок ГАНЦ (шинэ нь); hook-ийн «зөөсөн»
 *      tombstone зөөсөн нүдийг устгахгүй; жинхэнэ шинэ tombstone ялна.
 *   3. Горим — багана алга → JSON (`blob`), сүлжээ → `rows-wait` (бичихгүй, `local`), бүрэн → `rows`; `legacyPending`.
 *   4. Шилжүүлэлт — 80,000 тэмдэгтээс ТОМ (b71 маягийн) JSON ноорог засагчийн анхны нээлтээр мөр болно, JSON ХӨНДӨГДӨХГҮЙ,
 *      уншигч (засах эрхгүй) шилжүүлэхгүй ч JSON-оор харна; эргэлт ЯГ.
 *   5. Ажил × блок бүрд огноо (төлөвлөгөөт/гэрээний багана), ажил × блок × сар бүрд обьём (`sar_obyem`: `blok` · `sar_txt` ·
 *      `obyem`, 0 = тэг), хамтрагч өөр жаазаар нээнэ — кодоор зөв ажил.
 *   6. Цэвэрлэлт (илгээлт/«Ноорог хаях») — `applyClear` → толгойн `tseverlesen_at`, мөр хоосорно, дахин нээхэд ноорог хоосон;
 *      илгээх агшны хуулбар (`n:hsub:<OBJECTID>`) давхардалгүй.
 */
import assert from 'node:assert/strict';
import { makeFake } from '../../lib/draftRows.fake.mjs';
import { COL, planDkey, planFromRows, planToRows, viewOf } from '../../lib/draftRows.ts';
import { resetRowsCache, rowsReady, rowsTestHooks } from '../../lib/draftRowsRemote.ts';
import { alignToFrame, collapseCells, legacyPending, prepareStore, rowStore, synOid } from '../../lib/huvaariStore.ts';
import { applyClear, hdKey, kA, kH, kM, kR, kS, merge, serialize, sig } from '../../lib/huvaariDraft.ts';
import { REMOTE_MAX } from '../../lib/draftRemote.ts';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const D = 86_400_000;
const NOW = Date.now();
const URL = 'https://fake/ent/Guitsetgel_talbe/FeatureServer/191';
const row = (des, no = '1', work = 'Ажил') => ({ spans: [], ham: null, aStart: [], aEnd: [], hun: null, mashin: null, des, no, work });
const ctxOf = (pairs, bld = ['5/1', '5/2']) => ({ n: bld.length, rows: new Map(pairs.map(([oid, des]) => [oid, row(des, `${des}`, `Ажил ${des}`)])), bld });
const hd = (entries, del = [], rk = [], extra = {}) => ({
  t: NOW, kind: 'plan', pkg: 'b71', by: { user: 'bat', at: NOW }, base: { at: 1, n: 2 },
  entries: new Map(entries), del: new Map(del), ...(rk.length ? { rk: new Map(rk) } : {}), ...extra,
});
const e = (val, at, user = 'bat') => ({ val, at, user });
const sp = (a, b) => ({ start: a * D, end: b * D });
const fresh = (opt) => {
  const f = makeFake(URL, opt);
  resetRowsCache();
  rowsTestHooks({ post: f.post, url: URL, me: 'bat', reset: true, imgs: new Map() });
  return f;
};
const asClient = (imgs, me) => rowsTestHooks({ imgs, me });
const strip = (x) => sig({ ...x, rk: undefined, t: 0, by: { user: '', at: 0 }, base: { at: 0, n: x.base.n } });
const noAt = (x) => strip({ ...x, entries: new Map([...x.entries].map(([k, v]) => [k, { ...v, at: 0, user: '' }])) });

/* ══════════ 1. Жааз солигдох — кодоор одоогийн oid руу ══════════ */
{
  /* Жааз A: 100 = код 5, 101 = код 6. Жааз B (дахин импорт): код 5 = 300, код 6 алга, 100 = код 9 (давтагдсан oid) */
  const B = ctxOf([[300, 5], [100, 9], [301, 7], [302, 7]]);
  const d = hd(
    [[kS(100, 0), e(sp(1, 5), NOW - 10)], [kH(101), e('2FS', NOW - 9)], [kS(400, 1), e(sp(2, 3), NOW - 8)], [kR(500, 0), e([3, null], NOW - 7)]],
    [[kA(100, 1), NOW - 5]],
    [[100, { des: 5, no: '5', work: 'Ажил 5' }], [101, { des: 6, no: '6', work: 'Ажил 6' }], [400, { des: 7, no: '7', work: 'Ажил 7' }], [500, { des: null, no: '', work: 'Нэргүй' }]],
  );
  const a = alignToFrame(d, B);
  ok(a.entries.get(kS(300, 0))?.val.start === D && !a.entries.has(kS(100, 0)), 'код 5 → ОДООГИЙН oid 300 (хуучин 100 нь өөр ажил)');
  ok(a.del.has(kA(300, 1)) && !a.del.has(kA(100, 1)), 'tombstone ч кодоор зөөгдөнө');
  ok(a.entries.get(kH(101))?.val === '2FS', 'код 6 жаазад алга, oid 101 ч алга → хэвээр (hook-ийн identityRemap)');
  ok(a.entries.has(kS(400, 1)), 'давхардсан код (7 — хоёр мөр) → зөөхгүй');
  ok(a.entries.has(kR(500, 0)), 'кодгүй → хэвээр');
  ok(a.rk.get(300)?.des === 5, 'rk шинэ oid-д');
  /* Код жаазад алга БӨГӨӨД хуучин oid нь өөр кодтой ажил → synOid */
  const d2 = hd([[kS(100, 0), e(sp(1, 2), NOW)]], [], [[100, { des: 42, no: '4', work: 'Хуучин' }]]);
  const a2 = alignToFrame(d2, B);
  ok(a2.entries.has(kS(synOid(42), 0)) && !a2.entries.has(kS(100, 0)), 'oid 100 = код 9 (өөр), код 42 алга → synOid (буруу ажилд наалдахгүй)');
  ok(synOid(42) < -1e9 && synOid(42) > -(2 ** 31) && a2.rk.get(synOid(42))?.des === 42, 'synOid — сөрөг, int32, rk кодтой');
  /* Нэг түлхүүрт нийлсэн: шинэ нь ялна; tombstone `merge`-ийн дүрмээр */
  const d3 = hd([[kS(100, 0), e(sp(1, 2), NOW - 50)], [kS(300, 0), e(sp(7, 8), NOW - 40)]], [[kA(300, 1), NOW - 1]], [[100, { des: 5, no: '5', work: '' }]]);
  const a3 = alignToFrame({ ...d3, entries: new Map([...d3.entries, [kA(100, 1), e([D, null], NOW - 3)]]) }, B);
  ok(a3.entries.get(kS(300, 0))?.val.start === 7 * D, 'нийлсэн түлхүүр — ШИНЭ нүд');
  ok(!a3.entries.has(kA(300, 1)) && a3.del.get(kA(300, 1)) === NOW - 1, 'хожуу tombstone зөөсөн нүдийг дарна');
  ok(alignToFrame(d, null) === d && alignToFrame(d, { n: 1, rows: new Map() }) === d, 'жааз ачаалагдаагүй → хөндөхгүй');
  ok(alignToFrame(hd([[kS(300, 0), e(sp(1, 2), NOW)]], [], [[300, { des: 5, no: '', work: '' }]]), B).entries.has(kS(300, 0)), 'аль хэдийн зөв → хэвээр');
  console.log('✅ 1. Жааз солигдох — кодоор одоогийн oid руу');
}

/* ══════════ 2. Бичихийн өмнөх давхардал ══════════ */
{
  const B = ctxOf([[5490, 10], [5491, 11]]);
  const rk = [[37000, { des: 10, no: '1', work: 'A' }], [37001, { des: 11, no: '2', work: 'B' }]];
  /* b1_9f-ийн бодит хэлбэр: хуучин жаазны 37000 (хамтрагчийн) ба шинэ 5490 — ижил код 10 */
  const d = hd([
    [kS(37000, 0), e(sp(1, 2), NOW - 100, 'g1')], [kS(5490, 0), e(sp(1, 9), NOW - 50, 'admin')],
    [kS(37001, 0), e(sp(3, 4), NOW - 10, 'g1')], [kS(5491, 0), e(sp(3, 5), NOW - 20, 'admin')],
    [kS(37000, 1), e(sp(6, 7), NOW - 30, 'g1')], [kS(5490, 1), e(sp(6, 7), NOW - 30, 'admin')],
  ], [], rk);
  const c = collapseCells(d, B);
  eq([...c.entries.keys()].sort(), [kS(37001, 0), kS(5490, 0), kS(5490, 1)].sort(), 'ажил × блок бүрд ГАНЦ — шинэ нь (тэнцвэл одоогийн oid)');
  ok(c.entries.get(kS(5490, 0)).val.end === 9 * D, 'шинэ утга шинэ агшинтай (хуучин утга дээш гарахгүй)');
  /* hook-ийн «хуучин түлхүүрээс зөөсөн» tombstone (жаазад алга oid, агшин = одоо) зөөсөн нүдийг устгахгүй */
  const moved = hd([[kS(5490, 0), e(sp(1, 2), NOW - 100)]], [[kS(37000, 0), NOW]], rk);
  const cm = collapseCells(moved, B);
  ok(cm.entries.has(kS(5490, 0)) && !cm.del.has(kS(37000, 0)), 'зөөсөн тэмдэг (жаазад алга oid) нүдийг устгахгүй, өөрөө хаягдана');
  /* Жинхэнэ устгал (одоогийн oid, хожуу) ялна — нүд хасагдаж tombstone ганц */
  const real = hd([[kS(37000, 0), e(sp(1, 2), NOW - 100)]], [[kS(5490, 0), NOW - 5], [kS(37000, 0), NOW - 200]], rk);
  const cr = collapseCells(real, B);
  ok(!cr.entries.size && cr.del.get(kS(5490, 0)) === NOW - 5 && cr.del.size === 1, 'одоогийн oid дээрх хожуу устгал ялна');
  /* Сарын нүд, давхардалгүй ноорог — хөндөхгүй */
  const plain = hd([[kM('10|5/1'), e([['2026-01', 0]], NOW)], [kS(5490, 0), e(sp(1, 2), NOW)]], [], rk);
  ok(collapseCells(plain, B) === plain, 'давхардалгүй → ижил объект');
  const rk2 = new Map([...d.rk, [5490, { des: 10, no: '1', work: 'A' }], [5491, { des: 11, no: '2', work: 'B' }]]);
  ok(collapseCells({ ...d, rk: rk2 }, null).entries.size === 3, 'жаазгүй ч rk-ийн кодоор нийлүүлнэ');
  ok(collapseCells(d, null).entries.size === 6, 'код мэдэгдэхгүй oid → `o<oid>` (нийлүүлэхгүй)');
  console.log('✅ 2. Бичихийн өмнөх давхардал — ажил × блок бүрд ганц');
}

/* ══════════ 3. Горим · хуучин табын тэмдэг ══════════ */
{
  fresh({ noColumns: true });
  const s0 = await prepareStore(hdKey('plan', 'b71'), { canWrite: true, ctx: null });
  ok(s0.mode === 'blob' && /notebook/.test(s0.note ?? ''), 'багана алга → JSON (super-т notebook тайлбар)');
  const f = fresh();
  f.metaDown = true;
  const s1 = await prepareStore(hdKey('plan', 'b71'), { canWrite: true, ctx: null });
  ok(s1.mode === 'rows-wait', 'сүлжээ → rows-wait');
  const w = await s1.save(hdKey('plan', 'b71'), hd([[kH(1), e('1FS', NOW)]]), { expectAt: null, ctx: null });
  ok(!w.ok && w.local && (await s1.readAt('x')) === undefined, 'rows-wait — алсад бичихгүй (`local`), уншихгүй');
  ok(!f.edits.length, 'rows-wait — JSON руу ч бичээгүй');
  f.metaDown = false;
  ok((await prepareStore(hdKey('plan', 'b71'), { canWrite: true, ctx: null })).mode === 'rows' && (await rowsReady()).mode === 'rows', 'сэргэмэгц rows');
  ok(legacyPending(1_800_000_000_000.25) && !legacyPending(1_800_000_000_000) && !legacyPending(null) && !legacyPending(undefined), 'legacyPending — бутархай хувилбар');
  console.log('✅ 3. Горим — blob · rows-wait · rows');
}

/* ══════════ 4. Шилжүүлэлт — 80k-аас том JSON ══════════ */
{
  const f = fresh();
  const key = hdKey('plan', 'b71');
  const n = 3;
  const bld = ['5/1', '5/2', '5/3'];
  const ent = [];
  const rk = [];
  for (let i = 0; i < 700; i += 1) {
    const oid = 1000 + i;
    rk.push([oid, { des: 50_000 + i, no: `${i}`, work: `Ажил ${i}` }]);
    for (let b = 0; b < n; b += 1) ent.push([kS(oid, b), e(sp(100 + (i % 50), 120 + (i % 70)), NOW - 1000 - i, i % 2 ? 'bat' : 'dorj')]);
    if (i % 3 === 0) ent.push([kM(`${50_000 + i}|5/1`), e([['2026-01', 0], ['2026-02', 12.5]], NOW - 500 - i)]);
    if (i % 5 === 0) ent.push([kH(oid), e(`${i}FS`, NOW - 300 - i)]);
  }
  const big = hd(ent, [[kA(1000, 0), NOW - 50]], rk, { pkg: 'b71', base: { at: 5, n } });
  const body = serialize(big);
  ok(body.length > REMOTE_MAX, `JSON ${body.length} > ${REMOTE_MAX} (өнөөгийн хязгаарт гацдаг)`);
  const L = f.seed({ dkey: key, usr: 'old', pkg: key, at: NOW - 1, payload: body });
  const frame = { n, rows: new Map(rk.map(([oid, id]) => [oid, row(id.des, id.no, id.work)])), bld };
  /* Уншигч (засах эрхгүй) — шилжүүлэхгүй ч JSON-оор харна */
  const sr = await prepareStore(key, { canWrite: false, ctx: frame });
  ok(sr.mode === 'rows' && !f.all().some((a) => a.dkey === planDkey('plan', 'b71')), 'уншигч шилжүүлэхгүй');
  const r0 = await sr.read(key, { full: true, ctx: frame });
  ok(r0.ok && noAt(r0.draft) === noAt(merge(big, null)), 'уншигч хуучин JSON-ыг ЯГ харна');
  /* Засагч нээнэ → мөр */
  const sw = await prepareStore(key, { canWrite: true, ctx: frame });
  const mine = f.all().filter((a) => a.dkey === planDkey('plan', 'b71'));
  ok(sw.mode === 'rows' && mine.length > 2000, `засагчийн нээлт → ${mine.length} мөр (2000-аас олон — хуудаслалт)`);
  ok(f.rows.get(L).payload === body, 'хуучин JSON ХӨНДӨГДӨӨГҮЙ');
  ok(mine.find((a) => a.mur_turul === 'tolgoi')?.[COL.legacy] === NOW - 1, 'толгойд `huuchin_at` = JSON-ы агшин');
  ok(f.edits.every((x) => (x.adds?.length ?? 0) + (x.ups?.length ?? 0) + (x.dels?.length ?? 0) <= 500), 'applyEdits ≤ 500');
  /* Өөр клиент уншина — эргэлт ЯГ (агшнаас бусад; анхны уншилтын агшин = мөрийн дээд — баримтжуулсан) */
  asClient(new Map(), 'tsetseg');
  const r1 = await rowStore.read(key, { full: true, ctx: frame });
  ok(r1.ok && noAt(r1.draft) === noAt(merge(big, null)), 'мөрөөс сэргээсэн ноорог = JSON');
  ok(Number.isInteger(r1.at) && !legacyPending(r1.at), 'шингээгдсэн — хувилбар бүхэл (хуучин таб алга)');
  /* Хуучин таб JSON-д дахин бичнэ → уншилт шингээнэ, хувилбар бутархай (hook хэлнэ) */
  const old2 = { ...big, t: NOW + 5, entries: new Map([...big.entries, [kH(1001), e('77SS', NOW + 4, 'old')]]) };
  f.rows.set(L, { ...f.rows.get(L), at: NOW + 5, payload: serialize(old2), last_edited_date: f.now() });
  const at2 = await rowStore.readAt(key);
  ok(legacyPending(at2), 'хуучин табын бичилт → бутархай хувилбар');
  const r2 = await rowStore.read(key, { ctx: frame });
  ok(r2.ok && r2.draft.entries.get(kH(1001))?.val === '77SS', 'хуучин табын нүд уншилтад нийлсэн');
  const s2 = await rowStore.save(key, r2.draft, { expectAt: r2.at, ctx: frame });
  ok(s2.ok && !legacyPending(await rowStore.readAt(key)), 'засагчийн бичилт шингээлтийг баталгаажуулна');
  console.log('✅ 4. Шилжүүлэлт — 80k-аас том JSON мөр болно, JSON хэвээр');
}

/* ══════════ 5. Ажил × блок огноо · сар бүрийн обьём · хамтрагч өөр жаазаар ══════════ */
{
  const f = fresh();
  const A = new Map(); const Bc = new Map();
  const key = hdKey('geree', 'b2_9f');
  const fa = ctxOf([[100, 5], [101, 6]]);
  const fb = ctxOf([[300, 5], [100, 9], [301, 6]]);
  asClient(A, 'a');
  ok((await rowStore.read(key, { full: true, ctx: fa })).ok, 'A хоосныг уншина');
  const d = { ...hd([
    [kS(100, 0), e(sp(10, 20), NOW + 1, 'a')], [kS(100, 1), e(sp(11, 21), NOW + 1, 'a')], [kA(101, 1), e([12 * D, null], NOW + 2, 'a')],
    [kM('5|5/1'), e([['2026-01', 0], ['2026-03', 7]], NOW + 3, 'a')], [kR(101), e([4, 0], NOW + 4, 'a')],
  ]), kind: 'geree', pkg: 'b2_9f' };
  ok((await rowStore.save(key, d, { expectAt: null, ctx: fa })).ok, 'A бичнэ');
  const mine = f.all().filter((a) => a.dkey === planDkey('geree', 'b2_9f'));
  const w0 = mine.find((a) => a.mur_key === 'w:d5:0');
  ok(w0 && w0[COL.gs] === 10 * D && w0[COL.ge] === 20 * D && w0[COL.ps] == null && w0.blok === '5/1' && w0.des_dugaar === 5 && w0.noorog_turul === 'geree',
    'гэрээний муж → geree_ehleh/duusah, ажил × блок мөр (код · блок)');
  const w1 = mine.find((a) => a.mur_key === 'w:d6:1');
  ok(w1 && w1[COL.as] === 12 * D && listed(w1).has(COL.ae), 'бодит огноо — эхлэх, дуусах «ил хоосон» (null ≠ 0)');
  const ms = mine.filter((a) => a.mur_turul === 'sar_obyem').sort((x, y) => String(x.sar_txt).localeCompare(String(y.sar_txt)));
  eq(ms.map((a) => [a.blok, a.sar_txt, a.obyem, a.sar_too]), [['5/1', '2026-01', 0, 2], ['5/1', '2026-03', 7, 2]], 'сар бүрд мөр: blok · sar_txt · obyem (0 = тэг) · sar_too');
  const wr = mine.find((a) => a.mur_key === 'w:d6');
  ok(wr && wr.hun_huch === 4 && wr.mashin_mehanizm === 0 && wr.blok_idx == null, 'ажлын мөр: hun_huch · mashin_mehanizm (0 хадгалагдана)');
  /* B — өөр жааз (дахин импорт): код 5 = 300, oid 100 = код 9 */
  asClient(Bc, 'b');
  const rb = await rowStore.read(key, { full: true, ctx: fb });
  ok(rb.ok && rb.draft.entries.get(kS(300, 1))?.val.start === 11 * D && !rb.draft.entries.has(kS(100, 0)), 'B: код 5-ын муж ӨӨРИЙН жаазны 300-д (100 = өөр ажил)');
  ok(rb.draft.entries.has(kA(301, 1)) && rb.draft.entries.has(kR(301)), 'B: код 6 → 301');
  /* B засна (жааз B-ийн oid-оор) → A уншихад жааз A-ийн oid-оор */
  const db = { ...rb.draft, entries: new Map([...rb.draft.entries, [kS(300, 0), e(sp(30, 40), NOW + 50, 'b')]]), t: NOW + 50 };
  ok((await rowStore.save(key, db, { expectAt: rb.at, ctx: fb })).ok, 'B бичнэ');
  ok(f.all().filter((a) => a.mur_key === 'w:d5:0').length === 1 && f.all().find((a) => a.mur_key === 'w:d5:0').mur_oid === 300, 'нэг мөр (кодоор), `mur_oid` шинэчлэгдэнэ');
  asClient(A, 'a');
  const ra = await rowStore.read(key, { ctx: fa });
  ok(ra.ok && ra.draft.entries.get(kS(100, 0))?.val.start === 30 * D && !ra.draft.entries.has(kS(300, 0)), 'A: B-гийн засвар жааз A-ийн oid 100-д');
  console.log('✅ 5. Огноо ажил × блок · сар бүрд обьём · өөр жааз');
}

/* ══════════ 6. Цэвэрлэлт · илгээх агшны хуулбар ══════════ */
{
  const f = fresh();
  const key = hdKey('plan', 'b41_9f');
  const fr = ctxOf([[100, 5], [101, 6]]);
  const ents = [[kS(100, 0), e(sp(1, 2), NOW + 1)], [kS(101, 1), e(sp(3, 4), NOW + 2)], [kM('5|5/2'), e([['2026-02', 3]], NOW + 3)]];
  ok((await rowStore.read(key, { full: true, ctx: fr })).ok, 'уншина');
  ok((await rowStore.save(key, hd(ents, [], [], { pkg: 'b41_9f' }), { expectAt: null, ctx: fr })).ok, 'бичнэ');
  /* Илгээх агшны хуулбар — давхардсан хуучин oid ганц болно */
  const sub = hd([...ents, [kS(37000, 0), e(sp(9, 9), NOW - 9)]], [], [[37000, { des: 5, no: '', work: '' }]], { pkg: 'b41_9f' });
  ok(await rowStore.submitted(key, sub, fr, 777), 'хуулбар бичигдэнэ');
  const hs = f.all().filter((a) => a.dkey === 'n:hsub:777');
  ok(hs.filter((a) => a.mur_key === 'w:d5:0').length === 1 && hs.find((a) => a.mur_key === 'w:d5:0')[COL.ps] === D, 'хуулбарт ажил × блок ганц (шинэ утга)');
  ok(hs.every((a) => a.noorog_turul === 'huvaari_ilgeelt'), 'хуулбар — huvaari_ilgeelt');
  /* Илгээлтийн цэвэрлэлт (тэмдэг = илгээсэн нүд) */
  const r = await rowStore.read(key, { ctx: fr });
  const ts = NOW + 100;
  const cleared = applyClear(r.draft, new Map([...r.draft.entries].map(([k, v]) => [k, v.at + 1])), ts);
  ok((await rowStore.save(key, { ...cleared, t: ts }, { expectAt: r.at, ctx: fr })).ok, 'цэвэрлэлт бичигдэнэ');
  const left = f.all().filter((a) => a.dkey === planDkey('plan', 'b41_9f'));
  ok(left.find((a) => a.mur_turul === 'tolgoi')?.[COL.cleared] === ts, 'толгойд `tseverlesen_at`');
  ok(left.filter((a) => a.mur_turul === 'ajil' || a.mur_turul === 'sar_obyem').every((a) => a[COL.ps] == null && a[COL.mob] == null), 'утгын мөр хоосорсон');
  asClient(new Map(), 'other');
  const r2 = await rowStore.read(key, { full: true, ctx: fr });
  ok(r2.ok && r2.draft.entries.size === 0 && r2.draft.cleared === ts, 'дахин нээхэд ноорог хоосон, цэвэрлэлтийн агшинтай');
  /* Цэвэрлэлтээс хойш хамтрагчийн шинэ нүд амьд */
  const after = { ...r2.draft, entries: new Map([[kS(100, 1), e(sp(5, 6), ts + 10, 'other')]]), t: ts + 10 };
  ok((await rowStore.save(key, after, { expectAt: r2.at, ctx: fr })).ok, 'цэвэрлэлтийн дараах засвар');
  asClient(new Map(), 'third');
  const r3 = await rowStore.read(key, { full: true, ctx: fr });
  ok(r3.ok && r3.draft.entries.size === 1 && r3.draft.entries.get(kS(100, 1))?.val.start === 5 * D, 'цэвэрлэлтийн дараах нүд л үлдэнэ');
  console.log('✅ 6. Цэвэрлэлт · илгээх агшны хуулбар');
}

function listed(a) { return new Set(String(a[COL.empty] ?? '').split(',').filter(Boolean)); }

/* ══════════ 7. oid ДАХИН АШИГЛАГДСАН жааз — хоосон/устгалын хуучин мөр ӨӨР ажлын нүдийг зөөхгүй (2026-10-26) ══════════ */
{
  const at0 = NOW - 5 * D;
  const W = (oid, k, des, extra = {}) => ({ objectid: oid, [COL.turul]: 'ajil', [COL.key]: k, [COL.oid]: 5, [COL.des]: des, [COL.no]: `${des}`, [COL.work]: `Ажил ${des}`, [COL.blkIdx]: 0, [COL.at]: at0, [COL.usr]: 'a', ...extra });
  const H = { objectid: 1, [COL.turul]: 'tolgoi', [COL.key]: 'h', [COL.at]: NOW, [COL.usr]: 'a', [COL.blkIdx]: 1 };
  const ctx = { n: 1, rows: new Map([[5, row(200, '200', 'Ажил 200')], [17, row(100, '100', 'Ажил 100')]]), bld: [''] };
  const run = (rows) => {
    const view = viewOf(rows, 'plan');
    const d = planFromRows(view.get('h'), view, new Map(), { kind: 'plan', pkg: 'b71' }, NOW, ['']);
    const a = alignToFrame(d, ctx);
    return { d, a, want: [...planToRows(a, ctx, 'plan').rows.keys()].filter((k) => k.startsWith('w:')).sort() };
  };
  /* 7a. Хуучин жаазны ХООСОН мөр (A, код 100, oid 5) + шинэ жаазны амьд мөр (B, код 200, oid 5) */
  const r1 = run([H, W(11, 'w:d100:0', 100), W(12, 'w:d200:0', 200, { [COL.ps]: 3 * D, [COL.pe]: 9 * D, [COL.at]: NOW - D })]);
  ok(r1.d.rk.get(5)?.des === 200, 'rk — утгатай мөрөөс (хоосон хуучин мөр биш)');
  eq([...r1.a.entries.keys()], [kS(5, 0)], 'B-ийн огноо oid 5-д үлдэнэ (A руу зөөгдөхгүй)');
  eq(r1.want, ['w:d200:0'], 'бичилт B-ийн мөрөнд; w:d100:0 үүсэхгүй');
  /* 7b. A-ийн устгалын мөр (oid 5) B-ийн нүдийг устгахгүй */
  const r2 = run([H, { ...W(11, 'x:s:d100:0', 100), [COL.turul]: 'ustgal', [COL.at]: NOW }, W(12, 'w:d200:0', 200, { [COL.ps]: 3 * D, [COL.pe]: 9 * D })]);
  ok(r2.a.entries.has(kS(5, 0)) && !r2.a.del.has(kS(5, 0)) && r2.a.del.has(kS(17, 0)), 'A-ийн tombstone A руу (17), B-ийн нүд амьд');
  /* 7c. Хоёр АМЬД мөр нэг oid-той — хоёулаа үлдэж, тус бүр өөрийн ажилд */
  const r3 = run([H, W(11, 'w:d100:0', 100, { [COL.ps]: 1 * D, [COL.pe]: 2 * D }), W(12, 'w:d200:0', 200, { [COL.ps]: 3 * D, [COL.pe]: 9 * D, [COL.at]: NOW - D })]);
  ok(r3.a.entries.get(kS(17, 0))?.val.start === 1 * D && r3.a.entries.get(kS(5, 0))?.val.start === 3 * D, 'A → 17, B → 5 — нэг нь хаягдахгүй');
  eq(r3.want, ['w:d100:0', 'w:d200:0'], 'хоёр мөр хоёулаа бичигдэнэ');
  console.log('✅ 7. oid дахин ашиглагдсан жааз — хоосон/устгалын мөр өөр ажлыг зөөхгүй');
}

console.log(`planStore.check.mjs — БҮГД ТЭНЦЛЭЭ (${checks} шалгалт)`);
