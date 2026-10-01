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
  layout, layoutOf, edgePath, edgeLabelAt, housingWeight, pkgRow,
  topoOrder, buildSchem, stageRail, fin, grade, ageDays, PROJECT_WIDE,
} from './schem.ts';
import { FINE_NODES, FINE_EDGES, GEO_FINE } from './schemFine.ts';
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
assert.equal(all.length, 11, 'төлөвийн тоо өөрчлөгдсөн — схемийг дахин шалга');
for (const st of all) {
  assert.ok(STAGE_ORDER.includes(OWNER[st]), `${st}: эзэн нь мэдэгдэхгүй`);
}

/**
 * ⚠️ МӨР БҮР НЭГ ТОЙРОГ, ажил БИШ. Тиймээс өөр ажлыг загварчлахдаа `ajil`-ыг
 *    ЗААВАЛ ялгана — эс тэгвээс `groupWorks` тэдгээрийг НЭГ ажлын дараалсан
 *    тойрог гэж үзэж, зөвхөн сүүлийнхийг тоолно.
 */
const row = (st, bagts = 'Багц 1', ajil = st) => ({
  [HF.status]: st, [HF.bagts]: bagts, [HF.ajil]: ajil,
  [HF.company]: 'Гүйцэтгэгч', [HF.ergelt]: 1,
});
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
assert.equal(rail.length, 6, 'зурвас зургаан шаттай (2026-09-23)');
assert.equal(rail.find((x) => x.stage === 'engineer').n, 1);

/* «Шилжүүлсэн» нь аль ч шатны гар дээр биш — `OWNER` нь түүнийг `chief` гэдэг */
const railDone = stageRail({ ...EMPTY, review: [row(STATUS.transferred)] });
assert.equal(
  railDone.find((x) => x.stage === 'chief').n, 0,
  'дууссан ажил газрын даргын гар дээр тоологдов',
);

/**
 * ⚠️ НЭГ АЖИЛ = НЭГ ТОО. Дахин илгээх бүрд ШИНЭ мөр үүсдэг тул мөрөөр тоолвол
 *    удирдлагын самбар 8 ажил харуулж байхад схем ижил агшинд 30 гэж харуулна.
 */
const cyc = (st, ergelt, oid) => ({
  [HF.status]: st, [HF.bagts]: 'Багц 1', [HF.ajil]: 'Суурийн бетон',
  [HF.company]: 'Гүйцэтгэгч', [HF.ergelt]: ergelt, OBJECTID: oid,
});
const cycles = [
  cyc(STATUS.engineerReturned, 1, 11),
  cyc(STATUS.engineerReview, 2, 12),
  cyc(STATUS.managerReview, 3, 13),
];
const many = buildSchem({ ...EMPTY, review: cycles });
assert.equal(many.hyanalt.metrics[0].value, 1, 'нэг ажлын гурван тойрог тус тусад нь тоологдов');
assert.equal(many.hyanalt.metrics[1].value, 0, 'сүүлийн тойрог буцаагдаагүй');
const cycRail = stageRail({ ...EMPTY, review: cycles });
assert.equal(cycRail.find((x) => x.stage === 'manager').n, 1, 'ажил сүүлийн шатандаа байх ёстой');
assert.equal(cycRail.find((x) => x.stage === 'engineer').n, 0, 'хуучин тойрог зурваст үлдэв');

/**
 * ⚠️ БИЧИГЛЭЛИЙН ЗӨРҮҮ: `building_GOL` нь «Багц 4.1», хяналтын хүснэгт нь
 *    «Багц 4-1». Түүхий тэнцлээр шүүвэл хүлээгдэж буй ажлууд алга болж,
 *    зангилаа ХУДАЛ НОГООН болно.
 */
const spell = buildSchem(
  { ...EMPTY, review: [row(STATUS.engineerReview, 'Багц 4-1')] },
  'Багц 4.1',
);
assert.equal(spell.hyanalt.metrics[0].value, 1, 'багцын бичиглэлийн зөрүү шүүлтийг таслав');
assert.equal(
  buildSchem({ ...EMPTY, review: [row(STATUS.engineerReview, 'Багц 3-2')] }, 'Багц 4.1')
    .hyanalt.metrics[0].value,
  0,
  'өөр багцын мөр шүүлтээр орж ирэв',
);

/* Зөвшөөрлийн багцын шүүлт мөн бичиглэлээс хамаарахгүй */
assert.equal(
  buildSchem({ ...EMPTY, zov: [mk(TOLOV.no, 'Багц 4-1')] }, 'Багц 4.1').zovshoorol.health,
  'bad',
  'зөвшөөрлийн багцын бичиглэл таарсангүй',
);

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

/* ⚠️ 2026-10-01: хамралт нь `overall.weightSum` БИШ орон сууцны багцаас (`housingWeight`, §9) */
const partial = buildSchem({
  ...EMPTY,
  overall: { pct: 80, weightSum: 42, rows: 10 },
  bagts: [
    { key: 'БАГЦ1', label: 'Багц 1', progress: 80, blocks: 10, missing: 0, ail: 0, contractor: '' },
    { key: 'БАГЦ2', label: 'Багц 2', progress: null, blocks: 10, missing: 10, ail: 0, contractor: '' },
  ],
});
assert.ok(partial.barilga.note, 'дутуу хамралтад тэмдэглэл ЗААВАЛ гарна');

/* ── PROJECT_WIDE ≡ buildSchem-ийн `projectWide: true` (2026-09-25) ──
   Олонлог ба литерал салбарлавал «Дэлгэрэнгүй» самбар багцын тоог төслийн
   нийт гэж (эсвэл эсрэгээр) уншуулна. */
for (const [id, st] of Object.entries(buildSchem(EMPTY))) {
  assert.equal(!!st.projectWide, PROJECT_WIDE.has(id), `PROJECT_WIDE ↔ buildSchem зөрүү: ${id}`);
}

/* ══════════════════ 9. 2026-10-01 (хэрэглэгч: бүгдийг зас) ══════════════════ */

/* ── «Буцаасан» шошго ӨӨРИЙН ирмэг дээр, картуудтай давхцахгүй (ерөнхий ба нарийн) ──
   Урьд нь `max(доод ирмэг) + 34` — ерөнхийд сумнаасаа ~350px доор, нарийнд доорх картын ард. */
{
  /** SVG замыг цэгүүдээр дээжилнэ (M · L · Q · C) */
  const sample = (d) => {
    const t = d.match(/[MLQC]|-?\d+(?:\.\d+)?/g);
    const pts = [];
    let cur = null;
    let i = 0;
    const nx = () => Number(t[i++]);
    while (i < t.length) {
      const cmd = t[i++];
      if (cmd === 'M') { cur = [nx(), nx()]; pts.push(cur); continue; }
      if (cmd === 'L') {
        const p = [nx(), nx()];
        for (let k = 1; k <= 20; k++) pts.push([cur[0] + (p[0] - cur[0]) * k / 20, cur[1] + (p[1] - cur[1]) * k / 20]);
        cur = p; continue;
      }
      if (cmd === 'Q') {
        const c1 = [nx(), nx()]; const p = [nx(), nx()];
        for (let k = 1; k <= 20; k++) {
          const s = k / 20; const u = 1 - s;
          pts.push([u * u * cur[0] + 2 * u * s * c1[0] + s * s * p[0], u * u * cur[1] + 2 * u * s * c1[1] + s * s * p[1]]);
        }
        cur = p; continue;
      }
      if (cmd === 'C') {
        const c1 = [nx(), nx()]; const c2 = [nx(), nx()]; const p = [nx(), nx()];
        for (let k = 1; k <= 40; k++) {
          const s = k / 40; const u = 1 - s;
          pts.push([
            u * u * u * cur[0] + 3 * u * u * s * c1[0] + 3 * u * s * s * c2[0] + s * s * s * p[0],
            u * u * u * cur[1] + 3 * u * u * s * c1[1] + 3 * u * s * s * c2[1] + s * s * s * p[1],
          ]);
        }
        cur = p; continue;
      }
      throw new Error(`танихгүй команд ${cmd}`);
    }
    return pts;
  };
  const check = (name, nodes, edges, L) => {
    const labeled = edges.filter((e) => e.label);
    assert.ok(labeled.length > 0, `${name}: шошготой ирмэг алга`);
    for (const e of labeled) {
      const a = L.box[e.from]; const b = L.box[e.to];
      const at = edgeLabelAt(a, b, e.kind);
      /* 10px фонт — тэмдэгт ≈ 6.2px өргөн */
      const w = e.label.length * 6.2;
      const x0 = at.anchor === 'middle' ? at.x - w / 2 : at.x;
      const box = { x: x0, y: at.y - 9, w, h: 11 };
      for (const n of nodes) {
        const r = L.box[n.id];
        const over = box.x < r.x + r.w && r.x < box.x + box.w && box.y < r.y + r.h && r.y < box.y + box.h;
        assert.ok(!over, `${name} · ${e.from}→${e.to}: шошго «${n.id}» картыг давхцав`);
      }
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= L.w && box.y + box.h <= L.h, `${name}: шошго зурагнаас гарав`);
      const near = Math.min(...sample(edgePath(a, b, e.kind)).map(([px, py]) => Math.hypot(px - at.x, py - at.y)));
      assert.ok(near <= 14, `${name} · ${e.from}→${e.to}: шошго замаасаа ${near.toFixed(0)}px хол`);
    }
  };
  check('ерөнхий', NODES, EDGES, L);
  check('нарийн', FINE_NODES, FINE_EDGES, layoutOf(FINE_NODES, GEO_FINE));
}

/* ── Төсвийн жингийн хамралт — хуваарьт ДЭД БҮТЦИЙН багц орохгүй ── */
{
  const bg = (key, progress, blocks, missing = 0) => ({
    key, label: key, progress, blocks, missing, ail: 0, contractor: '',
  });
  const housing = [bg('БАГЦ1', 50, 4), bg('БАГЦ2', null, 5, 5)];
  const finance = { budget: 6000, contractAmount: 0, paid: 0, byBagts: { БАГЦ1: 600, БАГЦ2: 400, БАГЦ14: 5000 } };
  assert.equal(housingWeight({ bagts: housing, finance }), 60, 'хуваарь нь орон сууцны багцын төсөв (дэд бүтэц орохгүй)');
  /* ХО дүн огт алга — блокийн тоонд БҮРЭН шилжинэ */
  assert.equal(Math.round(housingWeight({ bagts: housing, finance: null }) * 10), 444, 'блокийн нөөц жин');
  assert.equal(housingWeight({ bagts: null, finance }), null, 'багцын жагсаалт унасан → null');
  /* Бүх орон сууцны багц хэмжигдсэн — `overall.weightSum` (дэд бүтэцтэй хуваарь) 10 байсан ч анхааруулга ГАРАХГҮЙ */
  const allIn = buildSchem({
    ...EMPTY,
    bagts: [bg('БАГЦ1', 50, 4), bg('БАГЦ2', 30, 5)],
    finance,
    overall: { pct: 40, weightSum: 10, rows: 9 },
  });
  assert.equal(allIn.barilga.note, undefined, 'дэд бүтцийн төсөв жингийн анхааруулга асаав');
  const half = buildSchem({ ...EMPTY, bagts: housing, finance, overall: { pct: 50, weightSum: 10, rows: 4 } });
  assert.ok(half.barilga.note?.includes('60'), 'орон сууцны дутуу хамралт (60%) тэмдэглэгдсэнгүй');
}

/* ── Ерөнхий «Барилга»: багцаар тайлагнасан блок, төслийн Σ тайлангүй ── */
{
  const bagts = [
    { key: 'БАГЦ31', label: 'Багц 3.1', progress: 40, blocks: 10, missing: 3, ail: 0, contractor: '' },
    { key: 'БАГЦ2', label: 'Багц 2', progress: 70, blocks: 6, missing: 2, ail: 0, contractor: '' },
  ];
  const src = { ...EMPTY, bagts, progress: { blocks: 11, overall: 50, date: '2026-09-30', stalled: 0 } };
  const m = (st, label) => st.barilga.metrics.find((x) => x.label === label).value;
  const one = buildSchem(src, 'Багц 3.1');
  assert.equal(m(one, 'Тайлагнасан блок'), 7, 'багцын тайлагнасан блок = блок − тайлангүй');
  assert.equal(m(one, 'Тайлангүй блок'), 3);
  const all = buildSchem(src);
  assert.equal(m(all, 'Тайлангүй блок'), 5, 'төслийн нийт тайлангүй = Σ багц');
  assert.equal(m(all, 'Тайлагнасан блок'), 11);
  /* URL-ын `bagtsKey` хэлбэр («БАГЦ31») ч таарна */
  assert.equal(m(buildSchem(src, 'БАГЦ31'), 'Тайлагнасан блок'), 7, 'bagtsKey хэлбэрийн багц таарсангүй');
  assert.equal(pkgRow(bagts, 'БАГЦ31')?.label, 'Багц 3.1');
  assert.equal(pkgRow(bagts, ''), null);
}

/* ── Хэсэгчилсэн ачаалал: багц сонгосон атал мөр алга → ТӨСЛИЙН тоо БИШ «—» ── */
{
  const src = {
    ...EMPTY,
    bagts: null,
    overall: { pct: 55, weightSum: 100, rows: 9 },
    progress: { blocks: 9, overall: 55, date: '2026-09-30', stalled: 0 },
    finance: { budget: 1000, contractAmount: 900, paid: 300, byBagts: { БАГЦ31: 200 } },
  };
  const st = buildSchem(src, 'Багц 3.1');
  for (const x of st.barilga.metrics) assert.equal(x.value, null, `барилга «${x.label}»: төслийн тоо багцын дор`);
  for (const x of st.sankhuu.metrics) assert.equal(x.value, null, `санхүү «${x.label}»: төслийн тоо багцын дор`);
  assert.equal(st.barilga.health, 'none');
  /* Багц сонгоогүй үед төслийн тоо хэвээр */
  assert.equal(buildSchem(src).barilga.metrics[0].value, 55);
  assert.equal(buildSchem(src).sankhuu.metrics[0].value, 1000);
}

console.log('schem.check: ok — топологи ✓ байрлал ✓ мэдээлэлгүй≠тэг ✓ NaN ✓ хяналт ✓ босго ✓ шошго ✓ жин ✓ багц ✓');
