/**
 * 6 ТҮВШНИЙ ХУВААРЬ ДЭЭР БАГЦЫН ХАМААРАЛ ЗАСАХ — цэвэр логик (2026-11-24).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs --import ./tools/test-users.mjs src/lib/levelLinkEdit.check.mjs
 *
 *   1. 6 түвшний мөр (`p:` · `f:` · `b:` · `g:` · `n:`) → холбож болох ажлууд (`linkableIds`-ийн дүрмээр).
 *   2. Зурагдсан зураас (`crossLinks` → `levelLinks`) ба мөр нь ижил ажлууд руу буцаж тааралдана (`linePairs` · `rowWorks`).
 *   3. Хадгалаагүй нэмэлт зурагдана (`stagedLinks`), хадгалах бүлэглэлт хадгалдаг мөр тутамд нэг (`groupChanges`).
 */
import assert from 'node:assert/strict';

const { buildGraph, nodeId, refOf } = await import('./workDeps.ts');
const { crossLinks, levelLinks, phaseKey } = await import('./levelPlan.ts');
const {
  editIndex, rowWorks, linePairs, linePick, stagedLinks, groupChanges, savedLines, orphanLines, xIdOf, pairOf,
} = await import('./levelLinkEdit.ts');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };

/* Бөглөх хуудасны мөр (`levelPlan.check`-ийн хэлбэр) — oid = des */
const D = (iso) => Date.parse(`${iso}T00:00:00Z`);
const r = (no, work, depth, des, group, s0 = null, e0 = null, raw = {}) => ({
  oid: des, no, work, depth, group, des, ham: null, start: [s0, s0], end: [e0, e0], raw,
});
const A = [
  r('А.', 'Бэлтгэл', 0, 1, false, D('2026-01-01'), D('2026-01-31')),
  r('Б.', 'Барилга', 0, 2, true),
  r('Б1', 'Карказ', 1, 3, true),
  r('1', 'Суурь', 2, 4, true),
  r('1.1', 'Цутгалт', 3, 5, false, D('2026-02-01'), D('2026-03-31')),
  r('2', 'Хана', 2, 6, true, D('2026-04-01'), D('2026-05-31')),
  r('Б2', 'Дотор', 1, 7, true),
  r('1', 'Шал', 2, 8, true, D('2026-06-01'), D('2026-06-30')),
];
const B = [
  r('Б.', 'Барилга', 0, 1, true),
  r('1', 'Дулаан', 1, 2, false, D('2026-05-01'), D('2026-07-31'), { bagts_hamaaral: JSON.stringify([{ p: 'a', k: '2 ¦ Хана' }]) }),
];
const toWork = (rows) => rows.map((x) => ({ oid: x.oid, no: x.no, work: x.work, depth: x.depth, group: x.group, des: x.des, val: x.raw.bagts_hamaaral ?? null }));
const sheets = [{ p: 'a', rows: toWork(A), field: true }, { p: 'b', rows: toWork(B), field: true }];
const g = buildGraph(sheets);
const KEY = { a: 'БАГЦ1', b: 'БАГЦ2' };
const root = { index: 0, parent: null, pkg: null };
const pkgs = [
  { key: 'БАГЦ1', node: { index: 3, parent: root, pkg: 'Багц-1' }, blocks: [], label: 'Багц-1' },
  { key: 'БАГЦ2', node: { index: 4, parent: root, pkg: 'Багц-2' }, blocks: [], label: 'Багц-2' },
];
const ix = editIndex(g, sheets, (p) => KEY[p] ?? '', pkgs);
const id = (p, no, work, o = 0) => nodeId(p, `${no} ¦ ${work}`, o);
const BELTGEL = id('a', 'А.', 'Бэлтгэл');
const SUURI = id('a', '1', 'Суурь');
const HANA = id('a', '2', 'Хана');
const SHAL = id('a', '1', 'Шал');
const DULAAN = id('b', '1', 'Дулаан');

/* ── 1. Мөр → ажил ── */
eq(rowWorks('p:БАГЦ1', ix), [BELTGEL, SUURI, HANA, SHAL], 'багцын мөр — холбож болох бүх ажил (3-р давхрын бүлэг; дээд бүлэг · доторх мөр орохгүй)');
eq(rowWorks(`f:БАГЦ1#${phaseKey('Б1', 'Карказ')}`, ix), [SUURI, HANA], 'дэд үе шатын мөр — тэр үе шатын бүлгүүд');
eq(rowWorks(`f:БАГЦ1#${phaseKey('Б2', 'Дотор')}`, ix), [SHAL], 'Б2 — нэг бүлэг (шууд сонгогдоно)');
eq(rowWorks('b:БАГЦ1|5/1', ix), rowWorks('p:БАГЦ1', ix), 'блокийн мөр — багцын бүх ажил (багцын хамаарал блокгүй)');
eq(rowWorks(`g:БАГЦ1|5/1#${phaseKey('1', 'Суурь')}`, ix), [SUURI], 'дэд бүлгийн мөр — тэр бүлэг');
eq(rowWorks(`g:БАГЦ1|5/1#${phaseKey('Б2', 'Дотор')}`, ix), [SHAL], 'Б2…Б5-ийн дэд бүлэг = үе шат');
eq(rowWorks('n:3', ix), rowWorks('p:БАГЦ1', ix), 'L1-ийн мөр — модны зангилааны багц');
eq(rowWorks('n:0', ix), [...rowWorks('p:БАГЦ1', ix), ...rowWorks('p:БАГЦ2', ix)], 'L1-ийн дээд зангилаа — доорх бүх багц');
eq(rowWorks('p:БАГЦ2', ix), [id('b', 'Б.', 'Барилга'), DULAAN], '3-р давхрын бүлэггүй хуудас — бүх мөр холбогдоно');
eq(rowWorks('p:БАГЦ9', ix), [], 'мэдэгдэхгүй багц — ажилгүй');
eq(rowWorks('zz', ix), [], 'буруу түлхүүр — ажилгүй');
eq(rowWorks(`g:БАГЦ1|5/1#${phaseKey('1.1', 'Цутгалт')}`, ix), [], 'бүлэг доторх мөр — холбохгүй');
ok(rowWorks('p:БАГЦ1', ix) === rowWorks('p:БАГЦ1', ix), 'санах ой — мөр тутамд нэг тооцоо');

/* ── 2. Зурагдсан зураас ↔ мөр ↔ ажил ── */
const xs = crossLinks([
  { p: 'a', pkg: 'БАГЦ1', rows: A, bld: ['5/1'], bham: 'bagts_hamaaral' },
  { p: 'b', pkg: 'БАГЦ2', rows: B, bld: ['Ажил'], bham: 'bagts_hamaaral' },
]);
eq(xs.length, 1, 'нэг багц хоорондын холбоо');
eq(xs[0].id, xIdOf(DULAAN, HANA), 'зураасны id = `xIdOf` (crossLinks-тэй ижил хэлбэр)');
eq(linePairs([xs[0].id, 'БАГЦ1:5:0']), [[HANA, DULAAN].sort()], 'зураасны id → ажлын хос; Хуваарийн уялдааг алгасна');
const hana = ix.ends.get(HANA);
eq({ pkg: hana.pkg, blok: hana.blok, phase: hana.phase, group: hana.group },
  { pkg: xs[0].a.pkg, blok: xs[0].a.blok, phase: xs[0].a.phase, group: xs[0].a.group }, 'мөрийн төгсгөл = crossLinks-ийн төгсгөл');
for (const lvl of [2, 3, 4]) {
  const rl = levelLinks(xs, lvl, pkgs).find((x) => x.und.size);
  ok(rl && rowWorks(rl.from[0], ix).includes(HANA) && rowWorks(rl.to[0], ix).includes(DULAAN), `L${lvl}: зураасны мөр хоёул тэр ажлыг агуулна`);
}
const tilde = nodeId('z', '1 ¦ А~Б', 2);
eq(linePairs([xIdOf(tilde, SUURI)]), [[tilde, SUURI].sort()], 'нэрэнд «~» орсон ч хос зөв задарна');

/* ── 3. Нэмэлт зураас · хадгалах бүлэглэлт ── */
const saved = savedLines(g);
eq(saved.map((l) => [l.host, l.b, l.kind]), [[DULAAN, HANA, 'saved']], 'хадгалсан нэг холбоо — Дулаан мөрд');
const add = (a, b, host) => ({ key: `+${host}#x`, pair: pairOf(a, b), a, b, host, ref: refOf(g.nodes.get(host === a ? b : a)), kind: 'add' });
const adds = [add(BELTGEL, DULAAN, BELTGEL), add(SHAL, DULAAN, SHAL), add(SUURI, DULAAN, SUURI)];
const st = stagedLinks([...adds, adds[0]], ix.ends);
eq(st.length, 3, 'нэмэлт бүр нэг зураас (давхардалгүй)');
ok(st.every((w) => w.und && !w.viol && w.id.startsWith('x:')), 'чиглэлгүй, зөрчилгүй');
eq(levelLinks(st, 2, pkgs).map((x) => [x.from[0], x.to[0], x.ids.size]), [['p:БАГЦ1', 'p:БАГЦ2', 3]], 'L2: багцын мөр хооронд нэг зураас');
const dels = new Map([[saved[0].key, saved[0].host]]);
const by = groupChanges(adds, saved, dels, orphanLines(g, dels));
eq([...by.keys()].sort(), [BELTGEL, SHAL, SUURI, DULAAN].sort(), 'хадгалдаг мөр тутамд нэг бичилт');
eq(by.get(DULAAN), { add: [], remove: [saved[0].ref] }, 'салгах — хадгалдаг мөрөөс хасна');
eq(by.get(SHAL).add, [refOf(g.nodes.get(DULAAN))], 'нэмэх — хадгалдаг мөрд нөгөө талын холбоос');
eq(groupChanges([], saved, new Map(), []).size, 0, 'өөрчлөлтгүй — бичихгүй');

/* ── 2026-11-27 (засвар): зураас дарахад зөвхөн ОДООГИЙН холбоо сэлгэгдэнэ — графт алга болсон холбооны хуучирсан зураас
      шинэ холбоо НЭМЭХГҮЙ (өөр хүн салгасан A~B-г «салгах» гэж дарахад дахин үүсдэг байв) ── */
{
  const has = (id) => g.nodes.has(id);
  const drawn = xIdOf(DULAAN, HANA);
  eq(linePick([drawn], saved, has), { ps: [[DULAAN, HANA].sort()], gone: 0 }, 'хадгалсан холбооны зураас — сэлгэнэ');
  eq(linePick([drawn], [], has), { ps: [], gone: 1 }, 'графт холбоо алга (өөр хүн салгасан) — сэлгэхгүй, нэмэхгүй');
  eq(linePick([xIdOf(BELTGEL, DULAAN)], [...saved, adds[0]], has).ps.length, 1, 'нэмэхээр тэмдэглэсэн зураас — буцааж болно');
  eq(linePick([drawn], saved.map((l) => ({ ...l, kind: 'del' })), has).gone, 0, 'устгахаар тэмдэглэсэн — буцааж болно');
  eq(linePick([drawn, xIdOf(SHAL, DULAAN), drawn], saved, has), { ps: [[DULAAN, HANA].sort()], gone: 1 }, 'нэгтгэсэн зураас — хуучирсныг тоолно, давхардалгүй');
  eq(linePick([drawn], saved, (id) => id !== HANA), { ps: [], gone: 0 }, 'ажил нь графт алга (хуудас уншигдаагүй) — чимээгүй алгасна');
  eq(linePick(['БАГЦ1:5:0'], saved, has), { ps: [], gone: 0 }, 'Хуваарийн уялдааны зураас — хамаагүй');
}

/* Өнчин — устгахаар тэмдэглэсэн нь хасах жагсаалтад */
const g2 = buildGraph([{ p: 'b', field: true, rows: [{ oid: 1, no: '1', work: 'Дулаан', depth: 0, group: false, des: 1, val: JSON.stringify([{ p: 'a', k: 'алга' }]) }] }]);
const or = orphanLines(g2, new Map([[`${nodeId('b', '1 ¦ Дулаан')}#a|алга|0`, nodeId('b', '1 ¦ Дулаан')]]));
eq(or.length, 1, 'өнчин нэг');
ok(or[0].del, 'устгахаар тэмдэглэгдсэн');
eq(groupChanges([], [], new Map(), or).get(nodeId('b', '1 ¦ Дулаан')).remove, [{ p: 'a', k: 'алга' }], 'өнчнийг хасна');

console.log(`levelLinkEdit.check ✓ (${n})`);
