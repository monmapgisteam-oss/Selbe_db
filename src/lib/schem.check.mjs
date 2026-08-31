/**
 * СХЕМИЙН ЗАГВАРЫН ШАЛГУУР.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/schem.check.mjs
 *
 * Ямар БОДИТ алдаанаас хамгаалж байгаа вэ:
 *
 *  1. ИРМЭГ ЧИМЭЭГҮЙ АЛГА БОЛОХ. `from`/`to`-д үсэг алдвал SVG нь тэр замыг
 *     зүгээр л зурахгүй — алдаа гарахгүй, шалгаж байж л мэдэгдэнэ.
 *  2. ХОЁР ЗАНГИЛАА НЭГ НҮДЭНД. `(col,row)` давхардвал нэг нь нөгөөгийнхөө
 *     доор бүрэн нуугдана.
 *  3. МЭДЭЭЛЭЛГҮЙ нь ТЭГ болж харагдах. Энэ репогийн хамгийн олон давтагдсан
 *     алдаа — «goliin utguud haragdahgui bn» гэж хоёр удаа шүүмжлүүлсэн.
 *     Бүх эх сурвалж унасан үед аль ч метрик 0 БАЙЖ БОЛОХГҮЙ.
 *  4. NaN нь УЛААН тэмдэг болох. `loadHeadline` унасан талбараа `NaN`-аар
 *     тэмдэглэдэг; `NaN >= 60` нь false тул шууд `grade`-д өгвөл сүлжээний
 *     доголдол «санхүү муу» гэсэн худал дохио болно.
 *  5. `ViewKey` нэр солигдох. Зангилааны `view` нь `VIEWS`-д байхгүй болвол
 *     дархад юу ч болохгүй — ажиллах үед биш ЭНД баригдана.
 */

import assert from 'node:assert/strict';
import {
  NODES, EDGES, NODE_BY_ID, GEO, TH,
  layout, edgePath, topoOrder, buildSchem, stageRail, fin, grade, ageDays,
} from './schem.ts';
import { VIEWS } from './services.ts';
import { STATUS, OWNER, STAGE_ORDER, F as HF } from './hyanalt.ts';
import { TOLOV } from './zovshoorol.ts';

/* ══════════════════ 1. Топологи ══════════════════ */

const ids = NODES.map((n) => n.id);
assert.equal(new Set(ids).size, ids.length, 'зангилааны id давхардсан');

for (const e of EDGES) {
  assert.ok(NODE_BY_ID[e.from], `ирмэгийн from олдсонгүй: ${e.from}`);
  assert.ok(NODE_BY_ID[e.to], `ирмэгийн to олдсонгүй: ${e.to}`);
  assert.notEqual(e.from, e.to, `өөр рүүгээ заасан ирмэг: ${e.from}`);
}

/* Нэг нүдэнд хоёр зангилаа байж болохгүй */
const cells = new Set(NODES.map((n) => `${n.col}:${n.row}`));
assert.equal(cells.size, NODES.length, 'хоёр зангилаа нэг (col,row) нүдэнд');

/**
 * ⚠️ ЗҮҮН ТИЙШ УРСГАЛ БАЙХГҮЙ (`back`-ээс бусад). Ухарсан сум нь «энэ шат
 * өмнөхөө буцаадаг» гэж уншигдана — жинхэнэ буцаалт ЗӨВХӨН хяналтад бий.
 *
 * Нэг баганад байх нь зөвшөөрөгдөнө (ж: хяналт → санхүүжилт нь босоо), гэхдээ
 * тэр үед ЗААВАЛ ДООШ явна — дээш заасан сум нь мөн ухралт мэт уншигдана.
 */
for (const e of EDGES) {
  if (e.kind === 'back') continue;
  const a = NODE_BY_ID[e.from];
  const b = NODE_BY_ID[e.to];
  assert.ok(b.col >= a.col, `зүүн тийш ирмэг: ${e.from} → ${e.to}`);
  if (b.col === a.col) {
    assert.ok(b.row > a.row, `нэг баганад ДЭЭШ заасан ирмэг: ${e.from} → ${e.to}`);
  }
}

/**
 * Тасарсан зангилаа байхгүй.
 * ⚠️ ГАРАХ ирмэггүй байж БОЛОХ зангилаанууд: `tailan` (урсгалын төгсгөл) ба
 *    хажуугийн хэмжүүрүүд (`habea`, `ersdel`). Тэдгээр нь шат БИШ тул хаашаа
 *    ч урсдаггүй — «ХАБЭА дуусмагц санхүүжилт олгогдоно» гэсэн хамаарал
 *    байхгүй. Харин ОРОХ ирмэггүй нь зөвхөн эхлэл (`tolovlolt`).
 */
const TERMINAL = new Set(['tailan', 'habea', 'ersdel']);
const hasIn = new Set(EDGES.filter((e) => e.kind !== 'back').map((e) => e.to));
const hasOut = new Set(EDGES.filter((e) => e.kind !== 'back').map((e) => e.from));
for (const n of NODES) {
  if (n.id !== 'tolovlolt') assert.ok(hasIn.has(n.id), `орох ирмэггүй: ${n.id}`);
  if (!TERMINAL.has(n.id)) assert.ok(hasOut.has(n.id), `гарах ирмэггүй: ${n.id}`);
}

/**
 * ⚠️ САЛАА БА НИЙЛЭЛТИЙН ХЭЛБЭР БЭХЛЭГДСЭН. Схемийн гол санаа нь «зэрэг явах
 * ажлууд» — хэн нэгэн санамсаргүй шулуун гинж болговол энэ унана.
 */
const succ = (id) => EDGES.filter((e) => e.kind === 'main' && e.from === id).map((e) => e.to);
const pred = (id) => EDGES.filter((e) => e.kind === 'main' && e.to === id).map((e) => e.from);
assert.equal(succ('tolovlolt').length, 2, 'төлөвлөгөөнөөс хоёр салаа гарах ёстой');
assert.equal(pred('huvaari').length, 2, 'хуваарь хоёр урсгалыг нийлүүлэх ёстой');
assert.equal(
  EDGES.filter((e) => e.kind === 'back').length, 1,
  'жинхэнэ буцаалт ЯГ нэг — гүйцэтгэлийн хяналт',
);

/* Топологийн дараалал хүчинтэй */
const order = topoOrder();
assert.equal(order.length, NODES.length, 'топологийн дараалалд зангилаа дутсан');
const pos = new Map(order.map((id, i) => [id, i]));
for (const e of EDGES) {
  if (e.kind === 'back') continue;
  assert.ok(pos.get(e.from) < pos.get(e.to), `топологи зөрчсөн: ${e.from} → ${e.to}`);
}
/* Тогтвортой — хоёр удаа дуудахад ижил */
assert.deepEqual(topoOrder(), order, 'topoOrder тогтворгүй');

/* ══════════════════ 2. Харагдацын түлхүүр ══════════════════ */

const viewKeys = new Set(VIEWS.map((v) => v.key));
for (const n of NODES) {
  if (n.view == null) continue;
  assert.ok(viewKeys.has(n.view), `байхгүй харагдац руу заасан: ${n.id} → ${n.view}`);
}

/* ══════════════════ 3. Байрлал ══════════════════ */

const L = layout(NODES);
assert.ok(L.w > 0 && L.h > 0, 'layout хэмжээ тэг');
assert.equal(Object.keys(L.box).length, NODES.length, 'layout зангилаа дутсан');

/* Хайрцгууд огтлолцохгүй (AABB) */
const boxes = NODES.map((n) => ({ id: n.id, ...L.box[n.id] }));
for (let i = 0; i < boxes.length; i++) {
  for (let k = i + 1; k < boxes.length; k++) {
    const a = boxes[i]; const b = boxes[k];
    const over = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.ok(!over, `хайрцаг огтлолцов: ${a.id} ↔ ${b.id}`);
  }
}
/* Торны томъёотой нийцнэ */
const maxC = Math.max(...NODES.map((n) => n.col));
assert.equal(
  L.w, GEO.pad * 2 + (maxC + 1) * GEO.w + maxC * GEO.gapX,
  'layout өргөн зөрсөн',
);
/* Цэвэр функц */
assert.deepEqual(layout(NODES), L, 'layout цэвэр биш');

const p = edgePath(L.box.tolovlolt, L.box.zovshoorol, 'main');
assert.ok(p.startsWith('M ') && p.includes('C '), 'edgePath буруу хэлбэртэй');
const pb = edgePath(L.box.hyanalt, L.box.barilga, 'back');
assert.ok(pb.startsWith('M ') && pb.includes('C '), 'буцах замын хэлбэр буруу');
assert.notEqual(p, pb, 'буцах зам нь урагшлахтай ижил байж болохгүй');

/* ══════════════════ 4. fin / grade ══════════════════ */

assert.equal(fin(NaN), null, 'NaN нь null болох ёстой');
assert.equal(fin(undefined), null);
assert.equal(fin(null), null);
assert.equal(fin(0), 0, '0 бол ЖИНХЭНЭ утга — null болгож болохгүй');
assert.equal(fin(Infinity), null);

assert.equal(grade(null, 90, 60), 'none', 'мэдэхгүй нь none байх ёстой');
assert.equal(grade(90, 90, 60), 'good', 'босго дээр good');
assert.equal(grade(89.9, 90, 60), 'warn');
assert.equal(grade(60, 90, 60), 'warn', 'босго дээр warn');
assert.equal(grade(59.9, 90, 60), 'bad');
assert.equal(grade(0, 90, 60), 'bad', '0 нь хэмжигдсэн тэг — bad, none БИШ');

assert.equal(ageDays(undefined), null);
assert.equal(ageDays('эвдэрсэн'), null);
assert.equal(ageDays('2026-08-01', Date.parse('2026-08-15T00:00:00Z')), 14);

/* ══════════════════ 5. ҮНЭН ЗӨВ — бүх эх сурвалж унасан ══════════════════ */

const EMPTY = {
  headline: null, clearance: null, overall: null, progress: null,
  finance: null, habea: null, zov: null, review: null, bagts: null,
  failed: ['бүгд'],
};

const dead = buildSchem(EMPTY);
assert.equal(Object.keys(dead).length, NODES.length, 'зангилаа дутсан');
for (const n of NODES) {
  const st = dead[n.id];
  assert.ok(st, `төлөв алга: ${n.id}`);
  assert.equal(st.health, 'none', `${n.id}: мэдээлэлгүй үед health нь none байх ёстой`);
  for (const m of st.metrics) {
    /* ⚠️ ЭНЭ БОЛ ГОЛ ХАМГААЛАЛТ — мэдээлэлгүйг ТЭГ гэж зурахгүй */
    assert.equal(
      m.value, null,
      `${n.id} · «${m.label}»: эх сурвалж унасан атлаа утга гарлаа (${m.value})`,
    );
    assert.notEqual(m.value, 0, `${n.id} · «${m.label}»: мэдээлэлгүй нь 0 болов`);
  }
}
assert.equal(stageRail(EMPTY), null, 'хяналтын зурвас мэдээлэлгүй үед null');

/* NaN нь улаан дохио болохгүй */
const nanSrc = {
  ...EMPTY,
  headline: { areaHa: NaN, population: NaN, investTotal: NaN },
  finance: { budget: NaN, contractAmount: NaN, paid: NaN, byBagts: {} },
};
const nanOut = buildSchem(nanSrc);
for (const m of nanOut.sankhuu.metrics) {
  assert.equal(m.value, null, `NaN нь ${m.label}-д тоо болж үлдэв`);
}
assert.equal(nanOut.sankhuu.health, 'none', 'NaN нь bad биш none байх ёстой');
assert.equal(nanOut.tolovlolt.metrics[0].value, null, 'NaN талбай');

/* Тэг төсөв — хуваалт NaN/Infinity болохгүй */
const zeroBudget = buildSchem({
  ...EMPTY,
  finance: { budget: 0, contractAmount: 0, paid: 0, byBagts: {} },
});
assert.equal(zeroBudget.sankhuu.health, 'none', 'тэг төсөвт хувь гаргаж болохгүй');

/* ══════════════════ 6. Зөвшөөрөл — null ба [] нь ӨӨР ══════════════════ */

const zovNull = buildSchem({ ...EMPTY, zov: null });
assert.equal(zovNull.zovshoorol.health, 'none', 'үйлчилгээ унасан → none');
assert.equal(zovNull.zovshoorol.metrics[0].value, null);

const zovEmpty = buildSchem({ ...EMPTY, zov: [] });
assert.equal(zovEmpty.zovshoorol.health, 'none', 'мөр байхгүй → none');
assert.equal(zovEmpty.zovshoorol.metrics[0].value, 0, '[] бол ЖИНХЭНЭ тэг');

const mk = (tolov, bagts = 'Багц 1') => ({ oid: 1, bagts, shat: 1, tolov });
assert.equal(buildSchem({ ...EMPTY, zov: [mk(TOLOV.ok)] }).zovshoorol.health, 'good');
assert.equal(buildSchem({ ...EMPTY, zov: [mk(TOLOV.wait)] }).zovshoorol.health, 'warn');
assert.equal(buildSchem({ ...EMPTY, zov: [mk(TOLOV.no)] }).zovshoorol.health, 'bad');
assert.equal(
  buildSchem({ ...EMPTY, zov: [mk('unknown')] }).zovshoorol.health, 'bad',
  'танигдаагүй төлөв ч анхаарал шаардана (summarize-ийн alert дүрэм)',
);

/* Багцын шүүлт зөвшөөрөлд үйлчилнэ */
const twoPkg = { ...EMPTY, zov: [mk(TOLOV.no, 'Багц 1'), mk(TOLOV.ok, 'Багц 2')] };
assert.equal(buildSchem(twoPkg, 'Багц 2').zovshoorol.health, 'good', 'багцын шүүлт ажиллаагүй');
assert.equal(buildSchem(twoPkg, 'Багц 1').zovshoorol.health, 'bad');

/* ══════════════════ 7. Хяналт — 7 төлөв, «Шилжүүлсэн» тоологдохгүй ══════════════════ */

/* Төлөв бүр ЯГ нэг шатанд харьяалагдана */
const all = Object.values(STATUS);
assert.equal(all.length, 7, 'төлөвийн тоо өөрчлөгдсөн — схемийг дахин шалга');
for (const st of all) {
  assert.ok(STAGE_ORDER.includes(OWNER[st]), `${st}: эзэн нь мэдэгдэхгүй`);
}

const row = (st, bagts = 'Багц 1') => ({ [HF.status]: st, [HF.bagts]: bagts });
const rev = buildSchem({
  ...EMPTY,
  review: [
    row(STATUS.engineerReview),
    row(STATUS.managerReturned),
    row(STATUS.transferred),
  ],
});
assert.equal(rev.hyanalt.metrics[0].value, 2, '«Шилжүүлсэн» нь хүлээгдэж буйд орсон');
assert.equal(rev.hyanalt.metrics[1].value, 1, 'буцаасны тоо зөрсөн');
assert.equal(rev.hyanalt.health, 'warn');

const done = buildSchem({ ...EMPTY, review: [row(STATUS.transferred)] });
assert.equal(done.hyanalt.metrics[0].value, 0, 'дууссан ажил хүлээгдэхгүй');
assert.equal(done.hyanalt.health, 'good');

const rail = stageRail({ ...EMPTY, review: [row(STATUS.engineerReview)] });
assert.equal(rail.length, 4, 'зурвас дөрвөн шаттай');
assert.equal(rail.find((x) => x.stage === 'engineer').n, 1);

/* ══════════════════ 8. Босго ══════════════════ */

const withPct = (pct) => buildSchem({
  ...EMPTY, clearance: { cleared: 0, remaining: 0, remainingHa: 0, total: 1, pct },
});
assert.equal(withPct(TH.gazarPct.good).gazar.health, 'good');
assert.equal(withPct(TH.gazarPct.good - 0.1).gazar.health, 'warn');
assert.equal(withPct(TH.gazarPct.warn).gazar.health, 'warn');
assert.equal(withPct(TH.gazarPct.warn - 0.1).gazar.health, 'bad');

/* Хувь нь 0–100 масштаб — 0–1 өгвөл `pct()` нь «0.3%» гэж чимээгүй жижигрүүлнэ */
const full = buildSchem({
  ...EMPTY,
  overall: { pct: 100, weightSum: 100, rows: 10 },
  progress: { blocks: 10, overall: 100, date: '2026-08-30', stalled: 0 },
});
assert.equal(full.barilga.metrics[0].value, 100, 'гүйцэтгэл 0–100 масштабтай байх ёстой');
assert.equal(full.barilga.health, 'good');
assert.equal(full.barilga.note, undefined, 'бүрэн хамралтад тэмдэглэл гарах ёсгүй');

const partial = buildSchem({
  ...EMPTY, overall: { pct: 80, weightSum: 42, rows: 10 },
});
assert.ok(partial.barilga.note, 'дутуу хамралтад тэмдэглэл ЗААВАЛ гарна');

console.log('schem.check: ok — топологи ✓ байрлал ✓ мэдээлэлгүй≠тэг ✓ NaN ✓ хяналт ✓ босго ✓');
