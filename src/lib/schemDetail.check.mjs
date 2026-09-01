/**
 * ЗАНГИЛААНЫ ДЭЛГЭРЭНГҮЙН ШАЛГУУР.
 *
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/schemDetail.check.mjs
 *
 * ⚠️ ЛОГИК ХУУЛБАРЛААГҮЙ — ЖИНХЭНЭ `nodeDetail`-ыг импортлоно.
 *
 * Ямар БОДИТ алдаанаас хамгаалж байгаа вэ:
 *
 *  1. МЭДЭЭЛЭЛГҮЙ нь ТЭГ болох. Энэ репогийн хамгийн олон давтагдсан алдаа —
 *     `schem.check.mjs` зангилааны метрикт барьдаг ч ДЭЛГЭРЭНГҮЙ самбарын
 *     хүснэгтийн нүд бол шинэ гадаргуу: тэнд «төсөвгүй багц» гэж 0 бичвэл
 *     тайлан чимээгүй худал болно.
 *  2. НЭГ АЖИЛ = НЭГ МӨР. Хяналтын хүснэгтэд мөр бүр НЭГ ТОЙРОГ. Түүхий мөрөөр
 *     жагсаавал 8 ажил 30 болж, зангилааны тоо ба самбарын хүснэгт ЗӨРНӨ.
 *  3. ТАНИГДААГҮЙ ТӨЛӨВ нуугдах. Тэдгээрийг нэрээр нь заахгүй бол хэрэглэгч
 *     аль зөвшөөрөл эвдэрснийг мэдэхгүй тул засаж ч чадахгүй.
 *  4. БАГЦААР ЗАДАРДАГГҮЙ зангилаа багц сонгоход өөрчлөгдөх. `buildSchem`-ийн
 *     `projectWide` дүрэмтэй зөрвөл нэг агшинд хоёр өөр тоо гарна.
 *  5. ЭХ СУРВАЛЖИЙН ТӨЛӨВ `failed`-тэй зөрөх. Тэр үед самбар «бүгд хэвийн»
 *     гэж ХУДАЛ хэлж, унасан үйлчилгээ далдлагдана.
 */

import assert from 'node:assert/strict';
import { nodeDetail, NODE_SOURCE } from './schemDetail.ts';
import { NODES, SOURCE_NAME } from './schem.ts';
import { STATUS, F as HF } from './hyanalt.ts';
import { TOLOV } from './zovshoorol.ts';

const EMPTY = {
  headline: null, clearance: null, overall: null, progress: null,
  finance: null, habea: null, zov: null, review: null, bagts: null,
  failed: Object.values(SOURCE_NAME),
};

/* ══════════════════ 1. Зангилаа ↔ эх сурвалжийн зураглал ══════════════════ */

for (const n of NODES) {
  assert.ok(NODE_SOURCE[n.id], `эх сурвалжийн зураглалд зангилаа алга: ${n.id}`);
  for (const k of NODE_SOURCE[n.id]) {
    assert.ok(SOURCE_NAME[k], `${n.id}: танигдахгүй эх сурвалж «${k}»`);
  }
}
assert.equal(
  Object.keys(NODE_SOURCE).length, NODES.length,
  'NODE_SOURCE-д илүүдэл эсвэл дутуу зангилаа',
);

/* ══════════════════ 2. ГОЛ ХАМГААЛАЛТ — мэдээлэлгүй ≠ тэг ══════════════════ */

for (const n of NODES) {
  const d = nodeDetail(EMPTY, n.id, null);
  for (const m of d.metrics) {
    assert.equal(
      m.value, null,
      `${n.id} · «${m.label}»: эх сурвалж унасан атлаа утга гарлаа (${m.value})`,
    );
  }
  /* Хүснэгт огт гарах ёсгүй — задлах өгөгдөл байхгүй */
  assert.equal(d.tables.length, 0, `${n.id}: өгөгдөлгүй атлаа хүснэгт зурав`);
  /* Унасан эх сурвалж бүр ИЛ тэмдэглэгдэнэ */
  for (const s of d.sources) {
    assert.equal(s.ok, false, `${n.id}: унасан эх сурвалж «${s.name}» хэвийн гэж тэмдэглэгдэв`);
  }
}

/* `failed` хоосон бол бүх эх сурвалж хэвийн */
{
  const d = nodeDetail({ ...EMPTY, failed: [] }, 'barilga', null);
  assert.equal(d.sources.length, 3, 'барилга гурван эх сурвалжтай');
  assert.ok(d.sources.every((s) => s.ok), 'failed хоосон атлаа эх сурвалж унасан гэв');
}
/* Нэг нь унавал ЗӨВХӨН тэр нь тэмдэглэгдэнэ */
{
  const d = nodeDetail({ ...EMPTY, failed: [SOURCE_NAME.overall] }, 'barilga', null);
  const bad = d.sources.filter((s) => !s.ok).map((s) => s.name);
  assert.deepEqual(bad, [SOURCE_NAME.overall], 'унасан эх сурвалж буруу тэмдэглэгдэв');
}
/* Хуваарь — амьд эх сурвалжгүй, гэхдээ ШАЛТГААН нь ИЛ гарна */
{
  const d = nodeDetail(EMPTY, 'huvaari', null);
  assert.equal(d.sources.length, 0, 'хуваарь эх сурвалжгүй байх ёстой');
  assert.ok(d.issues.length > 0, 'хуваарийн шалтгаан ил бичигдээгүй');
}

/* ══════════════════ 3. Зөвшөөрөл ══════════════════ */

const zov = (over) => ({
  oid: 1, bagts: 'Багц 1', shat: 1, ner: 'Ажлын зураг', selbe: '',
  tolov: TOLOV.ok, ognoo: null, dugaar: '', baiguullaga: '', hariutsagch: '', tailbar: '',
  ...over,
});

{
  const src = {
    ...EMPTY,
    failed: [],
    zov: [
      zov({ oid: 1, tolov: TOLOV.ok }),
      zov({ oid: 2, tolov: TOLOV.wait }),
      zov({ oid: 3, tolov: 'unknown', ner: 'Гал түймрийн дүгнэлт' }),
      zov({ oid: 4, tolov: TOLOV.ok, bagts: 'Багц 2' }),
    ],
  };
  const d = nodeDetail(src, 'zovshoorol', null);
  const by = (label) => d.metrics.find((m) => m.label.includes(label));
  assert.equal(by('Нийт зөвшөөрөл').value, 4, 'нийт зөвшөөрлийн тоо');
  assert.equal(by('Танигдаагүй').value, 1, 'танигдаагүй төлөв тоологдоогүй');

  /* ⚠️ ТАНИГДААГҮЙГ НЭР ЗААЖ ХЭЛНЭ — эс тэгвээс аль мөр болохыг мэдэхгүй */
  assert.ok(
    d.issues.some((i) => i.text.includes('Гал түймрийн дүгнэлт') && i.tone === 'bad'),
    'танигдаагүй төлөвтэй зөвшөөрөл нэрээрээ жагсаагдсангүй',
  );

  const byPkg = d.tables.find((t) => t.cols[0] === 'Багц');
  assert.ok(byPkg, 'багцын задаргаа алга');
  assert.equal(byPkg.rows.length, 2, 'хоёр багц гарах ёстой');

  /* Багц сонгоогүй үед мөр тус бүрийн хүснэгт ГАРАХГҮЙ (хэдэн зуун мөр) */
  assert.equal(d.tables.length, 1, 'багц сонгоогүй атлаа мөрийн жагсаалт зурав');

  /* Багц сонгоход — зөвхөн ТЭР багцын мөрүүд */
  const one = nodeDetail(src, 'zovshoorol', 'Багц 2');
  assert.equal(one.metrics.find((m) => m.label.includes('Нийт')).value, 1, 'багцын шүүлт ажиллаагүй');
  assert.equal(one.tables.length, 2, 'багц сонгоход мөрийн жагсаалт гарах ёстой');
  assert.equal(one.tables[1].rows.length, 1, 'мөрийн жагсаалт буруу шүүгдэв');
}

/* ⚠️ Бичиглэлийн зөрүү: «Багц 4-1» ↔ «Багц 4.1» — түүхий тэнцлээр шүүвэл хоосорно */
{
  const d = nodeDetail(
    { ...EMPTY, failed: [], zov: [zov({ bagts: 'Багц 4-1', tolov: TOLOV.no })] },
    'zovshoorol', 'Багц 4.1',
  );
  assert.equal(
    d.metrics.find((m) => m.label.includes('Зөвшөөрөөгүй')).value, 1,
    'багцын бичиглэлийн зөрүү шүүлтийг таслав',
  );
}

/* Үйлчилгээ унасан (`null`) ба мөр байхгүй (`[]`) нь ӨӨР */
{
  const dead = nodeDetail({ ...EMPTY, zov: null }, 'zovshoorol', null);
  assert.equal(dead.metrics[0].value, null, 'үйлчилгээ унасан → null');
  const none = nodeDetail({ ...EMPTY, failed: [], zov: [] }, 'zovshoorol', null);
  assert.equal(none.metrics[0].value, 0, '[] бол ЖИНХЭНЭ тэг');
}

/* ══════════════════ 4. Барилга — багцын задаргаа ══════════════════ */

const bagts = (over) => ({
  key: 'b1', label: 'Багц 1', progress: 50, missing: 0,
  blocks: 4, ail: 100, contractor: 'Гүйцэтгэгч', ...over,
});

{
  const rows = [
    bagts({ key: 'b1', label: 'Багц 1' }),
    bagts({ key: 'b2', label: 'Багц 2', progress: null, missing: 2, blocks: 5 }),
    bagts({ key: 'b3', label: 'Багц 3' }),
  ];
  const d = nodeDetail({
    ...EMPTY, failed: [], bagts: rows,
    overall: { pct: 40, weightSum: 58, rows: 12 },
    progress: { blocks: 13, overall: 40, date: '2026-08-30', stalled: 1 },
  }, 'barilga', null);

  const t = d.tables.find((x) => x.title === 'Багцаар');
  assert.ok(t, 'багцын хүснэгт алга');
  assert.equal(t.rows.length, rows.length, 'багцын мөрийн тоо зөрөв');
  /* ⚠️ Гүйцэтгэлгүй багцын нүд «—» — 0 БИШ */
  assert.equal(t.rows[1][1].v, null, 'гүйцэтгэлгүй багц тэг болов');

  assert.ok(
    d.issues.some((i) => i.text.includes('Багц 2') && i.text.includes('2')),
    'тайлангүй блоктой багц дурдагдсангүй',
  );
  assert.ok(d.issues.some((i) => i.text.includes('58')), 'дутуу жингийн анхааруулга алга');
  assert.ok(d.issues.some((i) => i.text.includes('зогссон')), 'зогссон блокийн анхааруулга алга');

  /* Багц сонгоход тэр багцын тоо гарна */
  const one = nodeDetail({ ...EMPTY, failed: [], bagts: rows }, 'barilga', 'Багц 2');
  assert.equal(one.metrics.find((m) => m.label === 'Блок').value, 5, 'багцын блокийн тоо');
  assert.equal(one.metrics.find((m) => m.label === 'Гүйцэтгэл').value, null, 'багцын гүйцэтгэл null');
}

/* ══════════════════ 5. Хяналт — НЭГ АЖИЛ = НЭГ МӨР ══════════════════ */

const cyc = (ergelt, oid, over) => ({
  [HF.status]: STATUS.engineerReview,
  [HF.bagts]: 'Багц 1',
  [HF.ajil]: 'Суурийн бетон',
  [HF.company]: 'Гүйцэтгэгч',
  [HF.ergelt]: ergelt,
  OBJECTID: oid,
  ...over,
});

{
  const review = [
    cyc(1, 11, { [HF.status]: STATUS.engineerReturned, [HF.engineerDecision]: 'Буцаасан' }),
    cyc(2, 12, { [HF.status]: STATUS.engineerReturned, [HF.engineerDecision]: 'Буцаасан' }),
    cyc(3, 13),
    cyc(4, 14),
    cyc(5, 15),
  ];
  const d = nodeDetail({ ...EMPTY, failed: [], review }, 'hyanalt', null);
  const by = (label) => d.metrics.find((m) => m.label === label);
  assert.equal(by('Нийт ажил').value, 1, 'нэг ажлын таван тойрог тус тусад нь тоологдов');
  assert.equal(by('Нийт тойрог (мөр)').value, 5, 'мөрийн тоо буруу');
  assert.equal(by('Хүлээгдэж буй').value, 1, 'хүлээгдэж буй ажлын тоо');

  const stage = d.tables.find((t) => t.title === 'Шатаар');
  assert.equal(stage.rows.length, 4, 'шатны хүснэгт дөрвөн мөртэй');

  const stuck = d.tables.find((t) => t.title === 'Буцаагдсан ажлууд');
  assert.ok(stuck, 'буцаагдсан ажлын хүснэгт алга');
  assert.equal(stuck.rows.length, 1, 'буцаагдсан ажил мөрөөр биш АЖЛААР жагсагдах ёстой');
  assert.equal(stuck.rows[0][3].v, 2, 'буцаалтын тоо');
  assert.equal(stuck.rows[0][4].v, 5, 'тойргийн тоо');
  assert.ok(d.issues.some((i) => i.tone === 'bad'), '2+ буцаалттай ажил анхааруулга болоогүй');
}

/* ══════════════════ 6. Санхүү — байхгүй багц null, 0 БИШ ══════════════════ */

{
  const d = nodeDetail({
    ...EMPTY,
    failed: [],
    bagts: [bagts({ key: 'b1', label: 'Багц 1' }), bagts({ key: 'b2', label: 'Багц 2' })],
    finance: { budget: 1000, contractAmount: 900, paid: 300, byBagts: { b1: 600 } },
  }, 'sankhuu', null);

  const t = d.tables.find((x) => x.title === 'Багцаар');
  assert.equal(t.rows[0][1].v, 600, 'багцын төсөв');
  /* ⚠️ ГОЛ ШАЛГУУР: `byBagts`-д байхгүй багц «0 төгрөг» гэж ХУДЛАА гарахгүй */
  assert.equal(t.rows[1][1].v, null, 'төсөвгүй багц тэг болов — «санхүүжилтгүй» гэсэн худал зураг');

  assert.equal(d.metrics.find((m) => m.label === 'Олголтын хувь').value, 30, 'олголтын хувь');
  assert.equal(d.metrics.find((m) => m.label === 'Үлдэгдэл').value, 700, 'үлдэгдэл');

  /* Багц сонгоход олголт задардаггүй тул харьцаа ГАРАХГҮЙ */
  const one = nodeDetail({
    ...EMPTY,
    failed: [],
    bagts: [bagts({ key: 'b1', label: 'Багц 1' })],
    finance: { budget: 1000, contractAmount: 900, paid: 300, byBagts: { b1: 600 } },
  }, 'sankhuu', 'Багц 1');
  assert.equal(one.metrics.find((m) => m.label === 'Төсөвт өртөг').value, 600, 'багцын төсөв');
  assert.equal(one.metrics.find((m) => m.label === 'Олгосон').value, null, 'олголт багцаар задарлаа');
  assert.equal(one.metrics.find((m) => m.label === 'Олголтын хувь').value, null, 'багцад хувь гарав');
}

/* Тэг төсөв — хуваалт Infinity/NaN болохгүй */
{
  const d = nodeDetail({
    ...EMPTY, failed: [],
    finance: { budget: 0, contractAmount: 0, paid: 0, byBagts: {} },
  }, 'sankhuu', null);
  assert.equal(d.metrics.find((m) => m.label === 'Олголтын хувь').value, null, 'тэг төсөвт хувь гарав');
}

/* NaN нь тоо болж үлдэхгүй (`loadHeadline` унасан талбараа NaN-аар тэмдэглэдэг) */
{
  const d = nodeDetail({
    ...EMPTY, failed: [],
    headline: { areaHa: NaN, population: NaN, investTotal: NaN },
  }, 'tolovlolt', null);
  for (const m of d.metrics) assert.equal(m.value, null, `NaN нь «${m.label}»-д үлдэв`);
}

/* ══════════════════ 7. БАГЦААР ЗАДАРДАГГҮЙ зангилаа ══════════════════ */

/**
 * ⚠️ `buildSchem`-ийн `projectWide` дүрэмтэй ИЖИЛ байх ёстой: багц сонгосон ч
 *    эдгээр нь төслийн тоогоо хэвээр барина. Зөрвөл зангилаа ба самбар нэг
 *    агшинд ХОЁР ӨӨР тоо харуулна.
 */
{
  const src = {
    ...EMPTY,
    failed: [],
    clearance: { cleared: 8, remaining: 2, remainingHa: 1.5, total: 10, pct: 80 },
    habea: { workers: 200, tehnik: 30, incidents: 2 },
    progress: { blocks: 13, overall: 40, date: '2026-08-30', stalled: 1 },
    overall: { pct: 40, weightSum: 100, rows: 12 },
  };
  for (const id of ['gazar', 'habea', 'ersdel', 'tailan', 'tolovlolt']) {
    const a = nodeDetail(src, id, null).metrics.map((m) => m.value);
    const b = nodeDetail(src, id, 'Багц 1').metrics.map((m) => m.value);
    assert.deepEqual(b, a, `${id}: багц сонгоход төслийн тоо өөрчлөгдөв`);
  }
}

/* Тайлангийн нас — босго урвуу (их нь МУУ) */
{
  const old = nodeDetail({
    ...EMPTY, failed: [],
    progress: { blocks: 1, overall: 0, date: '2000-01-01', stalled: 0 },
  }, 'tailan', null);
  assert.ok(old.issues.some((i) => i.tone === 'bad'), 'хуучирсан тайлан улаан болсонгүй');
}

/* Цэвэр функц — хоёр удаа дуудахад ижил */
{
  const a = nodeDetail(EMPTY, 'barilga', null);
  const b = nodeDetail(EMPTY, 'barilga', null);
  assert.deepEqual(b, a, 'nodeDetail цэвэр биш');
}

console.log('schemDetail.check: ok — зураглал ✓ мэдээлэлгүй≠тэг ✓ зөвшөөрөл ✓ '
  + 'багцын задаргаа ✓ ажил≠мөр ✓ төсөвгүй багц ✓ projectWide ✓');
