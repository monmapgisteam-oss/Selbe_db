/**
 * ЭРХИЙН НЭГДСЭН ТОЙМЫН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/erhOverview.check.mjs
 *
 * Хамгаалж буй зүйлс:
 *   1. `ALL_BAGTS` («*») нь БҮХ багцад тоологдоно — тэр тэмдгийг багцын
 *      нэр гэж уншвал «бүх багцын менежер» хаана ч харагдахгүй.
 *   2. ГАЦААГ УРЬДЧИЛЖ хэлнэ: батлагчгүй, зохиогч=батлагч, урсгалын цоорхой.
 *      Эдгээр нь одоо ЗӨВХӨН ажил зогссоны дараа мэдэгддэг.
 *   3. Бүх шат хоосон нь АНХААРУУЛГА БИШ — тэр багцад урсгал эхлээгүй.
 *   4. Том/жижиг үсэг, зайг тэсвэрлэнэ (`trim().toLowerCase()`).
 *   5. Матриц (2026-09-25): 17 багана, issue бүр өөрийн багана, viewOnly эзэн
 *      биш, өнчин эрх (super-т үгүй), эрхийн эх сурвалж (ALL → null).
 */
import assert from 'node:assert/strict';

/* ⚠️ `butetsPacks` (→ `services`) нь `window`/`localStorage` хүлээдэг — `butetsAcl.check`-ийн ижил shim (2026-09-25) */
const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;

const {
  userErh, pkgErh, allPkgErh, allUserErh, MATRIX_COLS, pkgMatrix, butetsRows, orphanCaps, capBacking, missingCaps,
} = await import('@/lib/erhOverview.ts');
const { BUTETS_PACKS } = await import('@/lib/butetsPacks.ts');
const { PKG_GROUPS } = await import('@/modules/sheet/bagts.pkg.ts');
const { STAGE_ORDER } = await import('@/lib/hyanalt.ts');

const G0 = PKG_GROUPS[0];
const G1 = PKG_GROUPS[1];

/** Хоосон эх сурвалж */
const empty = () => ({
  users: [], flow: [], qaqc: [], huvaari: [], obyem: [], chanar: [], caps: {}, views: {},
});

/* ── 1. ЭРХГҮЙ хүн — `any: false` ── */
{
  const src = { ...empty(), users: ['hen_ch'] };
  const u = userErh(src, 'hen_ch');
  assert.equal(u.any, false, 'эрхгүй хүн any:true гарав');
  assert.equal(u.flow, null);
  assert.equal(u.qaqc, null);
  assert.deepEqual(u.huvaari, []);
  assert.deepEqual(u.caps, []);
}
console.log('✅ эрхгүй аккаунт ялгагдана');

/* ── 2. `ALL_BAGTS` нь `null` (=бүх багц) ── */
{
  const src = {
    ...empty(),
    users: ['buh'],
    qaqc: [{ user: 'buh', bagts: ['*'] }],
    huvaari: [{ user: 'buh', grants: [{ role: 'author', bagts: ['*'] }] }],
  };
  const u = userErh(src, 'buh');
  assert.equal(u.qaqc, null, '«*» нь null (бүх багц) болох ёстой');
  assert.equal(u.huvaari[0].bagts, null);
  assert.equal(u.any, true);

  /* Бүх багцад тоологдоно */
  for (const g of PKG_GROUPS) {
    assert.deepEqual(pkgErh(src, g).qaqc, ['buh'], `${g}: «*»-тай хүн тоологдсонгүй`);
  }
}
console.log('✅ «*» = бүх багц, багц бүрд тоологдоно');

/* ── 3. Том/жижиг үсэг · зай ── */
{
  const src = {
    ...empty(),
    users: ['Batbayar'],
    qaqc: [{ user: '  BATBAYAR  ', bagts: [G0] }],
    caps: { batbayar: ['gazar'] },
  };
  const u = userErh(src, 'Batbayar');
  assert.deepEqual(u.qaqc, [G0], 'үсгийн хэлбэр/зайнаас болж олдсонгүй');
  assert.deepEqual(u.caps, ['gazar']);
}
console.log('✅ үсгийн хэлбэр · зай тэсвэртэй');

/* ══════════════════════════════════════════════════════════
 * 4. ГАЦААГ УРЬДЧИЛЖ ХЭЛНЭ — ЭНЭ ФАЙЛЫН ГОЛ ШАЛГУУР
 * ══════════════════════════════════════════════════════════ */

/* 4a. Зохиогч бий, батлагч АЛГА → илгээсэн хуваарийг хэн ч батлахгүй */
{
  const src = { ...empty(), huvaari: [{ user: 'a', grants: [{ role: 'author', bagts: [G0] }] }] };
  const p = pkgErh(src, G0);
  const bad = p.issues.filter((i) => i.tone === 'bad');
  assert.ok(bad.some((i) => i.key === 'huvaariNoApprover'),
    'батлагчгүй багц анхааруулга өгсөнгүй — илгээлт МӨНХӨД хүлээнэ');
}

/* 4b. Зохиогч = батлагч (цорын ганц) → `decidePlan` татгалзана, багц ГАЦНА */
{
  const src = {
    ...empty(),
    huvaari: [{ user: 'a', grants: [{ role: 'author', bagts: [G0] }, { role: 'approver', bagts: [G0] }] }],
  };
  const p = pkgErh(src, G0);
  assert.ok(p.issues.some((i) => i.key === 'huvaariSelfApprove' && i.tone === 'bad'),
    'зохиогч=батлагч гацаа илрээгүй');
}

/* 4c. Зохиогч=батлагч БОЛОВЧ өөр батлагч БАЙВАЛ гацахгүй */
{
  const src = {
    ...empty(),
    huvaari: [
      { user: 'a', grants: [{ role: 'author', bagts: [G0] }, { role: 'approver', bagts: [G0] }] },
      { user: 'b', grants: [{ role: 'approver', bagts: [G0] }] },
    ],
  };
  const p = pkgErh(src, G0);
  assert.ok(!p.issues.some((i) => i.key === 'huvaariSelfApprove'),
    'өөр батлагч байхад ХУДАЛ гацаа мэдээллэв');
}

/* 4d. Обьём — хуваарьтай ИЖИЛ дүрэм */
{
  const src = { ...empty(), obyem: [{ user: 'a', grants: [{ role: 'editor', bagts: [G0] }] }] };
  assert.ok(pkgErh(src, G0).issues.some((i) => i.key === 'obyemNoApprover'),
    'обьёмын батлагчгүй байдал илрээгүй');
}
console.log('✅ ГАЦАА урьдчилж илэрнэ (батлагчгүй · өөрийгөө батлах)');

/* ── 5. Урсгалын цоорхой ── */
{
  /* БҮГД хоосон = урсгал эхлээгүй → анхааруулга ХЭРЭГГҮЙ */
  const none = pkgErh(empty(), G0);
  assert.ok(!none.issues.some((i) => i.key === 'flowGap'),
    'урсгал огт эхлээгүй багцад ХУДАЛ анхааруулга гарав');

  /* ЗАРИМ нь хоосон = илгээлт тэр шатанд ЗОГСОНО */
  const partial = {
    ...empty(),
    flow: [{ user: 'a', stage: STAGE_ORDER[0], bagts: [G0] }],
  };
  assert.ok(pkgErh(partial, G0).issues.some((i) => i.key === 'flowGap'),
    'урсгалын цоорхой илрээгүй — илгээлт дунд нь зогсоно');
}
console.log('✅ урсгалын цоорхой — бүгд хоосон нь анхааруулга БИШ');

/* ── 5b. `viewOnly` томилгоо — шатны эзэн БИШ, цоорхойд тоологдоно (2026-09-24) ── */
{
  const src = {
    ...empty(),
    users: ['a', 'v'],
    flow: [
      { user: 'a', stage: STAGE_ORDER[0], bagts: [G0] },
      { user: 'v', stage: STAGE_ORDER[1], bagts: [G0], viewOnly: true },
    ],
  };
  const p = pkgErh(src, G0);
  assert.deepEqual(p.flow[STAGE_ORDER[1]], [], 'зөвхөн харагч шатны эзэн болж гарав');
  const gap = p.issues.find((i) => i.key === 'flowGap');
  assert.ok(gap, 'зөвхөн харагчтай шат цоорхой гэж тоологдсонгүй');
  assert.equal(gap.args[1], String(STAGE_ORDER.length - 1));
  assert.equal(userErh(src, 'v').flow.viewOnly, true);
  assert.equal(userErh(src, 'a').flow.viewOnly, false);
}
console.log('✅ viewOnly — эзэн биш, хүний картад туг');

/* ── 5c. Хатуу super — «эрх олгоогүй» БИШ (2026-09-24) ── */
{
  const src = { ...empty(), users: ['boss', 'hen_ch'], supers: ['BOSS'] };
  const u = userErh(src, 'boss');
  assert.equal(u.superUser, true);
  assert.equal(u.any, true, 'super «эрх олгоогүй» гэж гарав');
  assert.equal(userErh(src, 'hen_ch').superUser, false);
  assert.equal(allUserErh(src)[0].user, 'boss', 'super эхэнд эрэмбэлэгдсэнгүй');
}
console.log('✅ super — админ гэж ялгагдана');

/* ── 6. Багц ТУСГААРЛАГДСАН — нэг багцын томилгоо нөгөөд орохгүй ── */
{
  const src = {
    ...empty(),
    huvaari: [
      { user: 'a', grants: [{ role: 'author', bagts: [G0] }] },
      { user: 'b', grants: [{ role: 'approver', bagts: [G1] }] },
    ],
  };
  assert.deepEqual(pkgErh(src, G0).huvaari.author, ['a']);
  assert.equal(pkgErh(src, G0).huvaari.approver, undefined,
    'өөр багцын батлагч энэ багцад орж ирэв');
  assert.deepEqual(pkgErh(src, G1).huvaari.approver, ['b']);
}
console.log('✅ багц хоорондоо тусгаарлагдсан');

/* ── 7. Жагсаалт — эрхтэй нь ЭХЭНД ── */
{
  const src = {
    ...empty(),
    users: ['zzz_ergui', 'aaa_erhtei'],
    caps: { aaa_erhtei: ['gazar'] },
  };
  const all = allUserErh(src);
  assert.equal(all[0].user, 'aaa_erhtei', 'эрхтэй хүн эхэнд гарсангүй');
  assert.equal(all[1].any, false);

  assert.equal(allPkgErh(src).length, PKG_GROUPS.length, 'багцын тоо зөрөв');
}
console.log('✅ эрэмбэ — эрхтэй нь эхэнд');

/* ── 8. Чанарын баримт — гурван хянагч бүгд, зохиогчоос өөр ── */
{
  const only = { ...empty(), chanar: [{ user: 'g', grants: [{ role: 'author', bagts: [G0] }] }] };
  const i1 = pkgErh(only, G0).issues.find((i) => i.key === 'chanarNoReviewer');
  assert.ok(i1, 'зохиогч бий, хянагчгүй → гацаа');
  assert.equal(i1.args[1], 'tuh, chanar, habea');
  const self = { ...empty(), chanar: [{ user: 'g', grants: [
    { role: 'author', bagts: [G0] }, { role: 'tuh', bagts: [G0] }, { role: 'chanar', bagts: [G0] }, { role: 'habea', bagts: [G0] },
  ] }] };
  assert.equal(pkgErh(self, G0).issues.find((i) => i.key === 'chanarNoReviewer').args[1], 'tuh, chanar, habea',
    'зохиогч=хянагч нь томилоогүйтэй адил');
  const full = { ...empty(), chanar: [
    { user: 'g', grants: [{ role: 'author', bagts: [G0] }] },
    { user: 't', grants: [{ role: 'tuh', bagts: ['*'] }, { role: 'habea', bagts: [G0] }] },
    { user: 'q', grants: [{ role: 'chanar', bagts: [G0] }] },
  ] };
  assert.ok(!pkgErh(full, G0).issues.some((i) => i.key === 'chanarNoReviewer'), 'бүрэн томилогдсон → гацаагүй');
  assert.deepEqual(pkgErh(full, G0).chanar.tuh, ['t']);
  assert.equal(pkgErh(empty(), G0).issues.some((i) => i.key === 'chanarNoReviewer'), false, 'зохиогчгүй бол анхааруулахгүй');
  const u = userErh(full, 't');
  assert.equal(u.chanar.length, 2); assert.equal(u.chanar[0].bagts, null, '* → null'); assert.equal(u.any, true);
}
console.log('✅ чанарын баримт — 3 хянагч, зохиогч≠хянагч');

/* ══════════════════ 9. МАТРИЦ ба ГАРГАЛГААТАЙ ЭРХ (2026-09-25) ══════════════════ */
{
  /* 17 багана: урсгал 6 · хуваарь 2 · обьём 2 · нэмэлт ажил 2 · чанарын баримт 4 · QAQC 1 */
  assert.equal(MATRIX_COLS.length, 17, 'матриц 17 баганатай байх ёстой');
  assert.equal(MATRIX_COLS.filter((c) => c.sys === 'flow').length, STAGE_ORDER.length);
  assert.equal(new Set(MATRIX_COLS.map((c) => c.id)).size, 17, 'баганын id давхцав');
  assert.equal(pkgMatrix(empty()).length, PKG_GROUPS.length, 'мөр = PKG_GROUPS');
}
console.log('✅ матриц — 17 багана, багц бүр мөр');

/* ── 9a. Issue бүр ӨӨРИЙН баганыг улаан болгоно ── */
{
  const tone = (src, col) => pkgMatrix(src).find((r) => r.bagts === G0).cells[col].tone;
  const noAppr = { ...empty(), huvaari: [{ user: 'a', grants: [{ role: 'author', bagts: [G0] }] }] };
  assert.equal(tone(noAppr, 'huvaari:approver'), 'bad', 'huvaariNoApprover → батлагчийн багана');
  assert.equal(tone(noAppr, 'huvaari:author'), null, 'зохиогчийн багана хэвийн');

  const self = { ...empty(), obyem: [{ user: 'a', grants: [{ role: 'editor', bagts: [G0] }, { role: 'approver', bagts: [G0] }] }] };
  assert.equal(tone(self, 'obyem:editor'), 'bad', 'obyemSelfApprove → хоёр багана');
  assert.equal(tone(self, 'obyem:approver'), 'bad');

  const ajil = { ...empty(), ajil: [{ user: 'a', grants: [{ role: 'editor', bagts: [G0] }] }] };
  assert.equal(tone(ajil, 'ajil:approver'), 'bad', 'ajilNoApprover → батлагчийн багана');

  const ch = { ...empty(), chanar: [
    { user: 'g', grants: [{ role: 'author', bagts: [G0] }] },
    { user: 't', grants: [{ role: 'tuh', bagts: [G0] }] },
  ] };
  assert.equal(tone(ch, 'chanar:tuh'), null, 'томилогдсон хянагч хэвийн');
  assert.equal(tone(ch, 'chanar:chanar'), 'bad', 'дутуу хянагч улаан');
  assert.equal(tone(ch, 'chanar:habea'), 'bad');
  assert.equal(tone(ch, 'chanar:author'), null);

  /* Issue бүр `cols`-тай — баганагүй issue матрицад харагдахгүй */
  for (const src of [noAppr, self, ajil, ch]) {
    for (const i of pkgMatrix(src).flatMap((r) => r.issues)) {
      assert.ok(i.cols?.length, `${i.key}: cols хоосон`);
      for (const c of i.cols) assert.ok(MATRIX_COLS.some((m) => m.id === c), `${i.key}: үл мэдэх багана ${c}`);
    }
  }
}
console.log('✅ матриц — issue бүр өөрийн баганыг улаан болгоно');

/* ── 9b. Зөвхөн харагчтай шат — улаан, харагч нь жагсаагдана (эзэн биш) ── */
{
  const src = {
    ...empty(),
    users: ['a', 'v'],
    flow: [
      { user: 'a', stage: STAGE_ORDER[0], bagts: [G0] },
      { user: 'v', stage: STAGE_ORDER[1], bagts: ['*'], viewOnly: true },
    ],
  };
  const cell = pkgMatrix(src).find((r) => r.bagts === G0).cells[`flow:${STAGE_ORDER[1]}`];
  assert.deepEqual(cell.owners, [], 'харагч эзэн болж гарав');
  assert.deepEqual(cell.viewers, ['v'], 'харагч жагсаагдсангүй');
  assert.equal(cell.tone, 'bad', 'зөвхөн харагчтай шат улаан биш');
  assert.equal(pkgMatrix(src).find((r) => r.bagts === G0).cells[`flow:${STAGE_ORDER[0]}`].tone, null);
  /* «*» харагч — бүх багцад */
  assert.deepEqual(pkgErh(src, G1).flowViewers[STAGE_ORDER[1]], ['v']);
}
console.log('✅ матриц — viewOnly саарал, эзэнгүй шат улаан');

/* ── 9c. Дэд бүтцийн хүснэгт = BUTETS_PACKS ── */
{
  const P0 = BUTETS_PACKS[0].key;
  const src = { ...empty(), butets: [
    { user: 'e1', grants: [{ role: 'editor', bagts: [P0] }] },
    { user: 'e2', grants: [{ role: 'editor', bagts: ['*'] }] },
  ] };
  const rows = butetsRows(src, BUTETS_PACKS);
  assert.deepEqual(rows.map((r) => r.key), BUTETS_PACKS.map((p) => p.key), 'дэд бүтцийн мөр BUTETS_PACKS-тай таарахгүй');
  assert.deepEqual(rows[0].editors, ['e1', 'e2']);
  assert.deepEqual(rows[1].editors, ['e2'], '«*» бүх багцад');
}
console.log('✅ дэд бүтэц — BUTETS_PACKS мөр');

/* ── 9d. Өнчин эрх · эрхийн эх сурвалж ── */
{
  const src = {
    ...empty(),
    users: ['boss', 'rv', 'qa', 'orph', 'all'],
    supers: ['boss'],
    chanar: [{ user: 'rv', grants: [{ role: 'habea', bagts: [G0] }] }],
    qaqc: [{ user: 'qa', bagts: [G1] }],
    huvaari: [{ user: 'all', grants: [{ role: 'author', bagts: ['*'] }] }],
    caps: {
      boss: ['plan', 'qaqc', 'finRow'],
      rv: ['chanarReview', 'chanarAuthor'],
      qa: ['qaqc', 'zovshoorol'],
      orph: ['butets', 'gazar'],
      all: ['plan'],
    },
  };
  assert.deepEqual(orphanCaps(userErh(src, 'boss')), [], 'super-т өнчин эрх гарах ёсгүй');
  assert.deepEqual(orphanCaps(userErh(src, 'rv')), ['chanarAuthor'],
    'chanarReview нь ХАБЭА үүргээр эх сурвалжтай; chanarAuthor өнчин');
  assert.deepEqual(orphanCaps(userErh(src, 'qa')), [], 'qaqc нь QAQC мөрөөр эх сурвалжтай; энгийн эрх өнчин биш');
  assert.deepEqual(orphanCaps(userErh(src, 'orph')), ['butets'], 'хуваарилалтгүй butets өнчин, gazar энгийн');

  assert.equal(capBacking(userErh(src, 'all'), 'plan'), null, 'ALL → null (бүх багц)');
  assert.deepEqual(capBacking(userErh(src, 'rv'), 'chanarReview'), [G0]);
  assert.deepEqual(capBacking(userErh(src, 'qa'), 'qaqc'), [G1]);
  /* ⚠️ QAQC «бүх багц» → null, мөргүй → [] (UserErh.qaqc-ийн null хоёр утгатай) */
  const qa2 = { ...empty(), users: ['qall'], qaqc: [{ user: 'qall', bagts: ['*'] }], caps: { qall: ['qaqc'] } };
  assert.equal(capBacking(userErh(qa2, 'qall'), 'qaqc'), null, 'QAQC ALL → null');
  assert.deepEqual(orphanCaps(userErh(qa2, 'qall')), [], 'QAQC ALL өнчин биш');
  assert.deepEqual(capBacking(userErh(src, 'orph'), 'qaqc'), [], 'QAQC мөргүй → []');
  assert.deepEqual(capBacking(userErh(src, 'orph'), 'butets'), [], 'хуваарилалтгүй → []');
  assert.deepEqual(capBacking(userErh(src, 'qa'), 'zovshoorol'), [], 'энгийн эрх → []');

  /* Эсрэг тохиолдол: хуваарилалт бий, эрх алга */
  const miss = { ...empty(), users: ['m'], huvaari: [{ user: 'm', grants: [{ role: 'approver', bagts: [G0] }] }], caps: {} };
  assert.deepEqual(missingCaps(userErh(miss, 'm')), ['planApprove']);
  assert.deepEqual(missingCaps(userErh(src, 'boss')), [], 'super-т анхааруулахгүй');
}
console.log('✅ өнчин эрх · эх сурвалж · дутуу эрх');

console.log('\nerhOverview: ok — «*» · гацааг урьдчилж · багц тусгаарлалт · матриц · өнчин эрх');
