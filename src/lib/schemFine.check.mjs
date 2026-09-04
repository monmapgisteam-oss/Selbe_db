/**
 * НАРИЙВЧИЛСАН СХЕМИЙН ШАЛГУУР (24 карт).
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/schemFine.check.mjs
 *
 * Ямар БОДИТ алдаанаас хамгаалж байгаа вэ:
 *
 *  1. ИРМЭГ ЧИМЭЭГҮЙ АЛГА БОЛОХ. `from`/`to`-д үсэг алдвал SVG нь тэр замыг
 *     зүгээр л зурахгүй — алдаа гарахгүй, шалгаж байж л мэдэгдэнэ.
 *  2. ХОЁР КАРТ НЭГ НҮДЭНД. 24 карт гараар байрлуулсан тул `(col,row)`
 *     давхардвал нэг нь нөгөөгийнхөө доор БҮРЭН нуугдана.
 *  3. БУЦААЛТ АЛГАСАХ. Буцаалт нь ЯВСАН ЗАМААРАА, НЭГ АЛХМААР — «менежер
 *     буцаахад инженер алгасагдана» гэсэн худал зураг гарч болзошгүй.
 *  4. САМБАРЫН БҮЛЭГ ЗӨРӨХ. Карт бүр `SchemId` бүлэгтэй холбогдоно; буруу
 *     бичвэл дарахад ӨӨР шатны дэлгэрэнгүй нээгдэнэ.
 *  5. ТАЙЛБАРГҮЙ КАРТ. Карт дээр ТОО ГАРАХГҮЙ болсон тул тайлбар нь цорын
 *     ганц агуулга — хоосон эсвэл хэт богино байвал карт утгагүй хайрцаг
 *     болно.
 */

import assert from 'node:assert/strict';
import {
  FINE_NODES, FINE_EDGES, FINE_BY_ID, GEO_FINE, fineOrder,
} from './schemFine.ts';
import { NODES, layoutOf, edgePath } from './schem.ts';
import { VIEWS } from './services.ts';

/* ══════════════════ 1. Топологи ══════════════════ */

const ids = FINE_NODES.map((n) => n.id);
assert.equal(new Set(ids).size, ids.length, 'картын id давхардсан');
assert.ok(ids.length >= 20, 'нарийвчилсан схем хэт цөөн карттай болжээ');

const cells = new Set(FINE_NODES.map((n) => `${n.col}:${n.row}`));
assert.equal(cells.size, FINE_NODES.length, 'хоёр карт нэг (col,row) нүдэнд');

for (const e of FINE_EDGES) {
  assert.ok(FINE_BY_ID[e.from], `ирмэгийн from олдсонгүй: ${e.from}`);
  assert.ok(FINE_BY_ID[e.to], `ирмэгийн to олдсонгүй: ${e.to}`);
  assert.notEqual(e.from, e.to, `өөр рүүгээ заасан ирмэг: ${e.from}`);
}
/* Ирмэг давхардаагүй */
const eKeys = FINE_EDGES.map((e) => `${e.from}>${e.to}:${e.kind}`);
assert.equal(new Set(eKeys).size, eKeys.length, 'ирмэг давхардсан');

/**
 * ⚠️ ЗҮҮН ТИЙШ УРСГАЛ БАЙХГҮЙ (`back`-ээс бусад) — ухарсан сум нь «энэ шат
 * өмнөхөө буцаадаг» гэж уншигдана. Нэг баганад байх нь зөвшөөрөгдөнө, гэхдээ
 * тэр үед ЗААВАЛ ДООШ явна.
 */
for (const e of FINE_EDGES) {
  if (e.kind === 'back') continue;
  const a = FINE_BY_ID[e.from];
  const b = FINE_BY_ID[e.to];
  assert.ok(b.col >= a.col, `зүүн тийш ирмэг: ${e.from} → ${e.to}`);
  if (b.col === a.col) {
    assert.ok(b.row > a.row, `нэг баганад ДЭЭШ заасан ирмэг: ${e.from} → ${e.to}`);
  }
}

/**
 * Тасарсан карт байхгүй.
 * ⚠️ ГАРАХ ирмэггүй байж БОЛОХ картууд: урсгалын төгсгөл (`tailan`) ба
 *    ангилал/сөрөг үр дүнгийн картууд — тэдгээрээс цааш урсдаг зүйл БАЙХГҮЙ.
 */
const TERMINAL = new Set(['tailan', 'zovWait', 'zovNo', 'gazLeft', 'barNo', 'ers', 'habInc']);
const hasIn = new Set(FINE_EDGES.filter((e) => e.kind !== 'back').map((e) => e.to));
const hasOut = new Set(FINE_EDGES.filter((e) => e.kind !== 'back').map((e) => e.from));
for (const n of FINE_NODES) {
  if (n.id !== 'plan') assert.ok(hasIn.has(n.id), `орох ирмэггүй: ${n.id}`);
  if (!TERMINAL.has(n.id)) assert.ok(hasOut.has(n.id), `гарах ирмэггүй: ${n.id}`);
}

/**
 * ⚠️ ХЯНАЛТЫН ГИНЖ БЭХЛЭГДСЭН. Дөрвөн шат нь ЯГ дараалсан `main` ирмэгтэй,
 * буцаалт нь НЭГ АЛХМААР ухардаг (`hyanalt.ts`-ийн баримтжуулсан дүрэм).
 */
const CHAIN = ['hyCo', 'hyEng', 'hyMgr', 'hyDir'];
for (let i = 0; i + 1 < CHAIN.length; i += 1) {
  assert.ok(
    FINE_EDGES.some((e) => e.from === CHAIN[i] && e.to === CHAIN[i + 1] && e.kind === 'main'),
    `хяналтын гинж тасарсан: ${CHAIN[i]} → ${CHAIN[i + 1]}`,
  );
  assert.ok(
    FINE_EDGES.some((e) => e.from === CHAIN[i + 1] && e.to === CHAIN[i] && e.kind === 'back'),
    `буцаалт алга: ${CHAIN[i + 1]} → ${CHAIN[i]}`,
  );
}
const backs = FINE_EDGES.filter((e) => e.kind === 'back');
assert.equal(backs.length, 3, 'буцаалт ЯГ гурав — шат бүрээс нэг алхам ухарна');
for (const e of backs) {
  const a = CHAIN.indexOf(e.from); const b = CHAIN.indexOf(e.to);
  assert.ok(a >= 0 && b >= 0, `хяналтаас гадуур буцаалт: ${e.from} → ${e.to}`);
  assert.equal(a - b, 1, `буцаалт нэгээс олон шат алгасав: ${e.from} → ${e.to}`);
}

/**
 * ⚠️ ЗӨВШӨӨРЛИЙН ГУРВАН ТӨЛӨВ НЬ ГИНЖ БИШ, САЛАА. Гинжээр холбовол
 *    «хүлээгдэж буй нь татгалзсан болж хувирдаг» гэсэн худал ойлголт төрнө.
 */
for (const leaf of ['zovOk', 'zovWait', 'zovNo']) {
  const from = FINE_EDGES.filter((e) => e.kind !== 'back' && e.to === leaf).map((e) => e.from);
  assert.deepEqual(from, ['zov'], `${leaf} нь «zov»-оос ШУУД гарах ёстой`);
}
for (const leaf of ['gazOk', 'gazLeft']) {
  const from = FINE_EDGES.filter((e) => e.kind !== 'back' && e.to === leaf).map((e) => e.from);
  assert.deepEqual(from, ['gaz'], `${leaf} нь «gaz»-аас ШУУД гарах ёстой`);
}

/**
 * ⚠️ САНХҮҮГИЙН ИРМЭГ БҮГД `feed`. Кодод төлөвийн машин байхгүй тул `main`
 *    болговол «гэрээ байгуулмагц олголт автоматаар явна» гэж уншигдана.
 */
for (const e of FINE_EDGES) {
  const isFin = (id) => id.startsWith('fin');
  if (isFin(e.to) && e.kind !== 'back') {
    assert.equal(e.kind, 'feed', `санхүү рүү заасан ирмэг «main» болжээ: ${e.from} → ${e.to}`);
  }
}

/* Топологийн дараалал */
const order = fineOrder();
assert.equal(order.length, FINE_NODES.length, 'топологийн дараалалд карт дутсан');
const pos = new Map(order.map((id, i) => [id, i]));
for (const e of FINE_EDGES) {
  if (e.kind === 'back') continue;
  assert.ok(pos.get(e.from) < pos.get(e.to), `топологи зөрчсөн: ${e.from} → ${e.to}`);
}
assert.deepEqual(fineOrder(), order, 'fineOrder тогтворгүй');

/* ══════════════════ 2. Харагдац ба бүлэг ══════════════════ */

const viewKeys = new Set(VIEWS.map((v) => v.key));
const groups = new Set(NODES.map((n) => n.id));
for (const n of FINE_NODES) {
  if (n.view != null) assert.ok(viewKeys.has(n.view), `байхгүй харагдац: ${n.id} → ${n.view}`);
  assert.ok(groups.has(n.group), `танигдахгүй бүлэг: ${n.id} → ${n.group}`);
  assert.ok(n.title && n.desc, `${n.id}: гарчиг эсвэл тайлбар хоосон`);
}
/* Бүлэг бүр НАРИЙН схемд төлөөлөлтэй — «Ерөнхий»-гөөс шат алдагдаагүй */
for (const g of groups) {
  assert.ok(
    FINE_NODES.some((n) => n.group === g),
    `«Ерөнхий» схемийн «${g}» шат нарийн схемд ОГТ байхгүй`,
  );
}

/**
 * ⚠️ ТАЙЛБАР НЬ ЦОРЫН ГАНЦ АГУУЛГА (2026-09-01, хэрэглэгч: «үр дүн харуулах огт
 * хэрэггүй, зөвхөн ямар ажиллагаа хийгддэг тайлбар байхад л болно»). Карт дээр
 * тоо гарахаа больсон тул хоосон эсвэл нэг үгтэй тайлбар нь картыг утгагүй
 * хайрцаг болгоно.
 */
for (const n of FINE_NODES) {
  assert.ok(n.desc.length >= 30, `${n.id}: тайлбар хэт богино — «${n.desc}»`);
  assert.ok(n.desc.length <= 110, `${n.id}: тайлбар хэт урт, картад багтахгүй (${n.desc.length})`);
  assert.notEqual(n.desc, n.title, `${n.id}: тайлбар нь гарчгаа давтав`);
}
const descs = FINE_NODES.map((n) => n.desc);
assert.equal(new Set(descs).size, descs.length, 'хоёр карт ижил тайлбартай');

/* ══════════════════ 3. Байрлал ══════════════════ */

const L = layoutOf(FINE_NODES, GEO_FINE);
assert.ok(L.w > 0 && L.h > 0, 'layout хэмжээ тэг');
assert.equal(Object.keys(L.box).length, FINE_NODES.length, 'layout карт дутсан');

/* Хайрцгууд огтлолцохгүй (AABB) */
const boxes = FINE_NODES.map((n) => ({ id: n.id, ...L.box[n.id] }));
for (let i = 0; i < boxes.length; i++) {
  for (let k = i + 1; k < boxes.length; k++) {
    const a = boxes[i]; const b = boxes[k];
    const over = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.ok(!over, `хайрцаг огтлолцов: ${a.id} ↔ ${b.id}`);
  }
}
/**
 * ⚠️ ХАРЬЦАА. Ердийн дэлгэц ≈2:1. Хэрэв зураг хэт өндөр эсвэл хэт өргөн бол
 *    масштаб 0.62-оос доош унаж, схем БОСОО ЖАГСААЛТ болж хувирна — 24 карт
 *    нэг багана болвол «схем» гэдэг санаа алдагдана.
 */
const ratio = L.w / L.h;
assert.ok(ratio > 1.6 && ratio < 3.6, `харьцаа тохиромжгүй: ${ratio.toFixed(2)}`);

const p = edgePath(L.box.plan, L.box.zov, 'main');
assert.ok(p.startsWith('M ') && p.includes('C '), 'edgePath буруу хэлбэртэй');
assert.deepEqual(layoutOf(FINE_NODES, GEO_FINE), L, 'layoutOf цэвэр биш');

console.log(`schemFine.check: ok — ${FINE_NODES.length} карт · ${FINE_EDGES.length} ирмэг · `
  + 'топологи ✓ салаа ✓ буцаалт ✓ байрлал ✓ бүлэг ✓ тайлбар ✓');
