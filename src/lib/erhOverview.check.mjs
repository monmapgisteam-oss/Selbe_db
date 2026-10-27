/**
 * ЭРХИЙН НЭГДСЭН ТОЙМЫН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/erhOverview.check.mjs
 *
 * Хамгаалж буй зүйлс:
 *   1. `ALL_BAGTS` («*») нь БҮХ багцад тоологдоно — тэр тэмдгийг багцын
 *      нэр гэж уншвал «бүх багцын ахлах инженер» хаана ч харагдахгүй.
 *   2. ГАЦААГ УРЬДЧИЛЖ хэлнэ: батлагчгүй, зохиогч=батлагч, урсгалын цоорхой.
 *      Эдгээр нь одоо ЗӨВХӨН ажил зогссоны дараа мэдэгддэг.
 *   3. Бүх шат хоосон нь ГАЦАА БИШ (`flowGap` биш) — 2026-10-19-нөөс тусдаа `flowEmpty` (`warn`) анхааруулга.
 *   4. Том/жижиг үсэг, зайг тэсвэрлэнэ (`trim().toLowerCase()`).
 *   5. Матриц (2026-09-25): 20 багана (2026-09-28: + ТУГ, + ЧХ инженер; 2026-10-23: + төлөвлөлтийн инженер), issue бүр өөрийн багана, viewOnly эзэн
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
  unknownPkgUsers, typeStageGaps,
} = await import('@/lib/erhOverview.ts');
const { BUTETS_PACKS } = await import('@/lib/butetsPacks.ts');
const { PKG_GROUPS } = await import('@/modules/sheet/bagts.pkg.ts');
const { STAGE_ORDER } = await import('@/lib/hyanalt.ts');

const G0 = PKG_GROUPS[0];
const G1 = PKG_GROUPS[1];

/** Хоосон эх сурвалж */
const empty = () => ({
  users: [], flow: [], huvaari: [], obyem: [], chanar: [], caps: {}, views: {},
});

/* ── 1. ЭРХГҮЙ хүн — `any: false` ── */
{
  const src = { ...empty(), users: ['hen_ch'] };
  const u = userErh(src, 'hen_ch');
  assert.equal(u.any, false, 'эрхгүй хүн any:true гарав');
  assert.equal(u.flow, null);
  assert.deepEqual(u.huvaari, []);
  assert.deepEqual(u.caps, []);
}
console.log('✅ эрхгүй аккаунт ялгагдана');

/* ── 2. `ALL_BAGTS` нь `null` (=бүх багц) ── */
{
  const src = {
    ...empty(),
    users: ['buh'],
    huvaari: [{ user: 'buh', grants: [{ role: 'author', bagts: ['*'] }] }],
  };
  const u = userErh(src, 'buh');
  /* ⚠️ 2026-10-23: QAQC хасагдсан */
  assert.equal(u.huvaari[0].bagts, null, '«*» нь null (бүх багц) болох ёстой');
  assert.equal(u.any, true);

  /* Бүх багцад тоологдоно */
  for (const g of PKG_GROUPS) {
    assert.deepEqual(pkgErh(src, g).huvaari.author, ['buh'], `${g}: «*»-тай хүн тоологдсонгүй`);
  }
}
console.log('✅ «*» = бүх багц, багц бүрд тоологдоно');

/* ── 3. Том/жижиг үсэг · зай ── */
{
  const src = {
    ...empty(),
    users: ['Batbayar'],
    /* ⚠️ 2026-10-23: QAQC хасагдсан */
    huvaari: [{ user: '  BATBAYAR  ', grants: [{ role: 'author', bagts: [G0] }] }],
    caps: { batbayar: ['gazar'] },
  };
  const u = userErh(src, 'Batbayar');
  assert.deepEqual(u.huvaari[0].bagts, [G0], 'үсгийн хэлбэр/зайнаас болж олдсонгүй');
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
  assert.equal(i1.args[1], 'tuh, chanar, habea, tug, cheng', '2026-09-28: tug · cheng ч дутуу гэж тоологдоно (MA)');
  const self = { ...empty(), chanar: [{ user: 'g', grants: [
    { role: 'author', bagts: [G0] }, { role: 'tuh', bagts: [G0] }, { role: 'chanar', bagts: [G0] }, { role: 'habea', bagts: [G0] }, { role: 'tug', bagts: [G0] }, { role: 'cheng', bagts: [G0] },
  ] }] };
  assert.equal(pkgErh(self, G0).issues.find((i) => i.key === 'chanarNoReviewer').args[1], 'tuh, chanar, habea, tug, cheng',
    'зохиогч=хянагч нь томилоогүйтэй адил');
  const full = { ...empty(), chanar: [
    { user: 'g', grants: [{ role: 'author', bagts: [G0] }] },
    { user: 't', grants: [{ role: 'tuh', bagts: ['*'] }, { role: 'habea', bagts: [G0] }] },
    { user: 'q', grants: [{ role: 'chanar', bagts: [G0] }, { role: 'tug', bagts: [G0] }, { role: 'cheng', bagts: [G0] }] },
  ] };
  assert.ok(!pkgErh(full, G0).issues.some((i) => i.key === 'chanarNoReviewer'), 'бүрэн томилогдсон → гацаагүй');
  const noTug = { ...full, chanar: full.chanar.map((r) => ({ ...r, grants: r.grants.filter((g) => g.role !== 'tug') })) };
  assert.equal(pkgErh(noTug, G0).issues.find((i) => i.key === 'chanarNoReviewer')?.args[1], 'tug', '⚠️ ТУГ дутуу → MA батлагдахгүй');
  const noCheng = { ...full, chanar: full.chanar.map((r) => ({ ...r, grants: r.grants.filter((g) => g.role !== 'cheng') })) };
  assert.equal(pkgErh(noCheng, G0).issues.find((i) => i.key === 'chanarNoReviewer')?.args[1], 'cheng', '⚠️ ЧХ инженер дутуу → MA эхлэхгүй (2-р үе шат)');
  assert.deepEqual(pkgErh(full, G0).chanar.tuh, ['t']);
  assert.equal(pkgErh(empty(), G0).issues.some((i) => i.key === 'chanarNoReviewer'), false, 'зохиогчгүй бол анхааруулахгүй');
  const u = userErh(full, 't');
  assert.equal(u.chanar.length, 2); assert.equal(u.chanar[0].bagts, null, '* → null'); assert.equal(u.any, true);
  /* ⚠️ 2026-10-21: «нэг хүн нэг үүргээр» дүрэм амьд урсгалд ҮГҮЙ (MA · FIC · М-акт аль ч НЭГ хянагчийн
     шийдвэрийг хүлээн авна, `chanarMs.reviewerClashes`) — нэг хүн хоёр үүрэгт байсан ч гацааны анхааруулга гарахгүй.
     Урьд нь t = ТУХ+ХАБЭА, q = ЧХ инженер+Чанар+ТУГ үед «MS/MA гацна» гэж худал анхааруулдаг байв. */
  const clash = pkgErh(full, G0).issues.filter((i) => i.key === 'chanarOneManRoles');
  assert.deepEqual(clash, [], 'нэг хүн хоёр үүрэгт — гацаагүй');
  const indep = { ...empty(), chanar: [
    { user: 'g', grants: [{ role: 'author', bagts: [G0] }] },
    ...['tuh', 'chanar', 'habea', 'tug', 'cheng'].map((r) => ({ user: `u_${r}`, grants: [{ role: r, bagts: [G0] }] })),
  ] };
  assert.equal(pkgErh(indep, G0).issues.some((i) => i.key.startsWith('chanar')), false, 'үүрэг бүр өөр хүн → анхааруулгагүй');
}
console.log('✅ чанарын баримт — 5 хянагч (tuh · chanar · habea · tug · cheng), зохиогч≠хянагч');

/* ══════════════════ 9. МАТРИЦ ба ГАРГАЛГААТАЙ ЭРХ (2026-09-25) ══════════════════ */
{
  /* 19 багана: урсгал 7 (2026-10-23) · хуваарь 2 · обьём 2 · нэмэлт ажил 2 · чанарын баримт 6 */
  /* ⚠️ 2026-10-23: QAQC хасагдсан */
  assert.equal(MATRIX_COLS.length, 19, 'матриц 19 баганатай байх ёстой');
  assert.ok(MATRIX_COLS.some((c) => c.id === 'chanar:tug'), '2026-09-28: ТУГ багана');
  assert.ok(MATRIX_COLS.some((c) => c.id === 'chanar:cheng'), '2026-09-28: ЧХ инженер багана');
  assert.equal(MATRIX_COLS.filter((c) => c.sys === 'flow').length, STAGE_ORDER.length);
  assert.equal(new Set(MATRIX_COLS.map((c) => c.id)).size, 19, 'баганын id давхцав');
  assert.equal(pkgMatrix(empty()).length, PKG_GROUPS.length, 'мөр = PKG_GROUPS');
}
console.log('✅ матриц — 19 багана, багц бүр мөр');

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
  /* ⚠️ 2026-09-25: `warn` — үүрэг бүр зөвхөн ӨӨРИЙН төрлийн баримтыг гацаана (habea зөвхөн MS) */
  assert.equal(tone(ch, 'chanar:chanar'), 'warn', 'дутуу хянагч шар');
  assert.equal(tone(ch, 'chanar:habea'), 'warn');
  assert.equal(tone(ch, 'chanar:tug'), 'warn', 'ТУГ дутуу → шар (MA · NCR л хүлээнэ)');
  assert.equal(tone(ch, 'chanar:cheng'), 'warn', 'ЧХ инженер дутуу → шар (MA л хүлээнэ)');
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
    /* ⚠️ 2026-10-23: QAQC хасагдсан */
    huvaari: [{ user: 'all', grants: [{ role: 'author', bagts: ['*'] }] }],
    caps: {
      boss: ['plan', 'finRow'],
      rv: ['chanarReview', 'chanarAuthor'],
      qa: ['zovshoorol'],
      orph: ['butets', 'gazar'],
      all: ['plan'],
    },
  };
  /* ⚠️ 2026-10-23: ХҮСНЭГТИЙН super-ийн хадгалагдсан эрх энгийн хүнийх шиг шалгагдана; зөвхөн КОДЫН super чөлөөтэй */
  assert.deepEqual(orphanCaps(userErh(src, 'boss')), ['plan'], 'хүснэгтийн super-ийн хадгалсан өнчин эрх харагдах ёстой');
  const codeSrc = { ...src, codeSupers: ['boss'] };
  assert.deepEqual(orphanCaps(userErh(codeSrc, 'boss')), [], 'кодын super-т өнчин эрх гарах ёсгүй');
  assert.equal(userErh(codeSrc, 'boss').codeSuper, true);
  assert.equal(userErh(src, 'boss').codeSuper, false);
  assert.deepEqual(orphanCaps(userErh(src, 'rv')), ['chanarAuthor'],
    'chanarReview нь ХАБЭА үүргээр эх сурвалжтай; chanarAuthor өнчин');
  assert.deepEqual(orphanCaps(userErh(src, 'qa')), [], 'энгийн эрх өнчин биш');
  assert.deepEqual(orphanCaps(userErh(src, 'orph')), ['butets'], 'хуваарилалтгүй butets өнчин, gazar энгийн');

  assert.equal(capBacking(userErh(src, 'all'), 'plan'), null, 'ALL → null (бүх багц)');
  assert.deepEqual(capBacking(userErh(src, 'rv'), 'chanarReview'), [G0]);
  /* ⚠️ 2026-10-23: QAQC хасагдсан */
  assert.deepEqual(capBacking(userErh(src, 'orph'), 'butets'), [], 'хуваарилалтгүй → []');
  assert.deepEqual(capBacking(userErh(src, 'qa'), 'zovshoorol'), [], 'энгийн эрх → []');

  /* Эсрэг тохиолдол: хуваарилалт бий, эрх алга */
  const miss = { ...empty(), users: ['m'], huvaari: [{ user: 'm', grants: [{ role: 'approver', bagts: [G0] }] }], caps: {} };
  assert.deepEqual(missingCaps(userErh(miss, 'm')), ['planApprove']);
  assert.deepEqual(missingCaps(userErh(src, 'boss')), [], 'хуваарилалтгүй super-т дутуу эрх алга');
  /* ⚠️ 2026-10-23: хүснэгтийн super — хуваарилалт бий атлаа хадгалсан эрх алга → анхааруулна; кодын super → үгүй */
  const supMiss = { ...empty(), users: ['sa'], supers: ['sa'], huvaari: [{ user: 'sa', grants: [{ role: 'approver', bagts: [G0] }] }], caps: { sa: [] } };
  assert.deepEqual(missingCaps(userErh(supMiss, 'sa')), ['planApprove'], 'хүснэгтийн super-ийн дутуу эрх');
  assert.deepEqual(missingCaps(userErh({ ...supMiss, codeSupers: ['sa'] }, 'sa')), [], 'кодын super-т анхааруулахгүй');
}
console.log('✅ өнчин эрх · эх сурвалж · дутуу эрх');

/* ── 10. Устгагдсан аккаунтын хуучин мөр гацааг НУУХГҮЙ (2026-09-30) ──
   ⚠️ Урьд нь порталд алга (устгагдсан) батлагч/шатны эзний мөр «батлагчгүй» · «урсгалын цоорхой»-г
      чимээгүй нуудаг байв — тэр хүн нэвтэрч чадахгүй тул илгээлт тэнд мөнхөд хүлээнэ.
      Нүдэнд (засахад) харагдсаар, зөвхөн гацааны шалгуурт тоологдохгүй. */
{
  const huv = {
    ...empty(),
    users: ['a'],
    huvaari: [
      { user: 'a', grants: [{ role: 'author', bagts: [G0] }] },
      { user: 'ghost', grants: [{ role: 'approver', bagts: [G0] }] },
    ],
  };
  assert.ok(!pkgErh(huv, G0).issues.some((i) => i.key === 'huvaariNoApprover'), '`gone`-гүй бол урьдынх шиг эзэн гэж тоологдоно');
  const gone = { ...huv, gone: ['Ghost'] };
  assert.ok(pkgErh(gone, G0).issues.some((i) => i.key === 'huvaariNoApprover' && i.tone === 'bad'),
    'устгагдсан батлагч гацааг нуух ёсгүй');
  const cell = pkgMatrix(gone).find((r) => r.bagts === G0).cells['huvaari:approver'];
  assert.deepEqual(cell.owners, ['ghost'], 'нүдэнд харагдсаар (✕-ээр цэвэрлэхийн тулд)');
  assert.equal(cell.tone, 'bad', 'нүд улаан');
  const flow = {
    ...empty(),
    users: STAGE_ORDER.slice(1).map((st) => `u_${st}`),
    gone: ['ghost_eng'],
    flow: [
      { user: 'ghost_eng', stage: STAGE_ORDER[0], bagts: ['*'] },
      ...STAGE_ORDER.slice(1).map((st) => ({ user: `u_${st}`, stage: st, bagts: [G0] })),
    ],
  };
  const gap = pkgErh(flow, G0).issues.find((i) => i.key === 'flowGap');
  assert.ok(gap && gap.cols.includes(`flow:${STAGE_ORDER[0]}`), 'устгагдсан шатны эзэн → урсгалын цоорхой');
  assert.ok(!pkgErh({ ...flow, gone: [] }, G0).issues.some((i) => i.key === 'flowGap'), 'устгагдаагүй бол цоорхойгүй');
}
console.log('✅ устгагдсан аккаунтын хуучин мөр гацааг нуухгүй (нүдэнд харагдсаар)');

/* ── 11. 2026-10-19 (аудит №10): бүх шат хоосон · танигдаагүй багц · зөвхөн super ── */
{
  /* (а) БҮХ шат хоосон — урьд нь чимээгүй; одоо `warn` (шинэ гацааны асуултад орохгүй — `bad` биш) */
  const none = pkgErh(empty(), G0).issues.find((i) => i.key === 'flowEmpty');
  assert.ok(none, 'бүх шат хоосон багц тоймд гарсангүй');
  assert.equal(none.tone, 'warn');
  assert.equal(none.cols.length, STAGE_ORDER.length);
  const partial = { ...empty(), flow: [{ user: 'a', stage: STAGE_ORDER[0], bagts: [G0] }] };
  assert.ok(!pkgErh(partial, G0).issues.some((i) => i.key === 'flowEmpty'), 'хэсэгчилсэн цоорхой flowEmpty биш');

  /* (б) танигдаагүй багц — урсгал · хуваарь · обьём · чанар · нэмэлт ажил; «*» ба зөв нэр орохгүй (2026-10-23: QAQC хасагдсан) */
  const src = {
    ...empty(),
    users: ['u1', 'u2', 'u3'],
    flow: [{ user: 'u1', stage: STAGE_ORDER[1], bagts: [G0, 'Багц 99 (хуучин)'] }],
    huvaari: [{ user: 'u2', grants: [{ role: 'author', bagts: ['Хуучин нэр'] }] }],
    ajil: [{ user: 'U3', grants: [{ role: 'editor', bagts: [G1] }] }],
  };
  assert.deepEqual(userErh(src, 'u1').unknownBagts, ['Багц 99 (хуучин)']);
  assert.deepEqual(userErh(src, 'u2').unknownBagts, ['Хуучин нэр'], '«*» танигдаагүй гэж тоологдов');
  assert.deepEqual(userErh(src, 'u3').unknownBagts, []);
  assert.deepEqual(unknownPkgUsers(src).map((x) => x.user).sort(), ['u1', 'u2']);
  /* ⚠️ 2026-10-19 (аудит): ХУУЧИН дээд түвшний `bagts` (grants-тай хамт үлдсэн) ч шалгагдана */
  const legacy = { ...empty(), users: ['u4'], obyem: [{ user: 'u4', grants: [{ role: 'author', bagts: [G0] }], bagts: ['Хуучин багц'] }] };
  assert.deepEqual(userErh(legacy, 'u4').unknownBagts, ['Хуучин багц'], 'хуучин `bagts` танигдаагүй багцад орсонгүй');

  /* (в) амьд хатуу super — гацаа АНХААРУУЛГА хэвээр (өнгө ч), «зөвхөн админ» гэж тэмдэглэнэ */
  const noAppr = { ...empty(), huvaari: [{ user: 'a', grants: [{ role: 'author', bagts: [G0] }] }] };
  const plain = pkgErh(noAppr, G0).issues.find((i) => i.key === 'huvaariNoApprover');
  assert.ok(plain && !plain.superOnly, 'super-гүй үед superOnly тэмдэг');
  const withSup = pkgErh({ ...noAppr, supers: ['boss'] }, G0).issues.find((i) => i.key === 'huvaariNoApprover');
  assert.ok(withSup, 'super байхад анхааруулга АЛГА болов — энгийн хариуцагч томилоогүй хэвээр');
  assert.equal(withSup.tone, 'bad', 'өнгө хэвээр');
  assert.equal(withSup.superOnly, true, 'super шийдвэрлэх боломжтойг тэмдэглээгүй');
  const goneSup = pkgErh({ ...noAppr, supers: ['boss'], gone: ['BOSS'] }, G0).issues.find((i) => i.key === 'huvaariNoApprover');
  assert.ok(!goneSup.superOnly, 'устгагдсан super тоологдов');
  /* ⚠️ 2026-10-19 (аудит №2): батлагч БАЙГАА (зохиогчтой давхцсан) — «энгийн хариуцагч томилоогүй» ХУДАЛ */
  const self = { ...empty(), supers: ['boss'], huvaari: [{ user: 'a', grants: [{ role: 'author', bagts: [G0] }, { role: 'approver', bagts: [G0] }] }] };
  const selfI = pkgErh(self, G0).issues.find((i) => i.key === 'huvaariSelfApprove');
  assert.ok(selfI && !selfI.superOnly, '*SelfApprove-д superOnly залгагдав');
  /* зөвхөн super томилогдсон багана — цоорхой хэвээр (энгийн хүн алга) */
  const supAppr = { ...empty(), supers: ['boss'], obyem: [{ user: 'e', grants: [{ role: 'editor', bagts: [G0] }] }] };
  assert.equal(pkgErh(supAppr, G0).issues.find((i) => i.key === 'obyemNoApprover')?.superOnly, true);
  /* chanarNoReviewer: дутуу үүрэгт зохиогч өөрөө томилогдсон (энгийн хүн БАЙГАА) — superOnly биш */
  const chPart = {
    ...empty(), supers: ['boss'],
    chanar: [{ user: 'c', grants: ['author', 'tuh', 'chanar', 'habea', 'tug', 'cheng'].map((role) => ({ role, bagts: [G0] })) }],
  };
  const chI = pkgErh(chPart, G0).issues.find((i) => i.key === 'chanarNoReviewer');
  assert.ok(chI && !chI.superOnly, 'хэсэгчлэн томилогдсон chanarNoReviewer-т superOnly');
}
console.log('✅ бүх шат хоосон · танигдаагүй багц · зөвхөн super (анхааруулга хэвээр)');

/* ── ⚠️ 2026-10-22 (аудит): ТӨРӨЛ ↔ УРСГАЛЫН ШАТ — урсгалын төрөл шат олгодоггүй (`typeStageGaps`) ── */
{
  const src = {
    ...empty(),
    users: ['Chief_NoFlow', 'eng_ok', 'mis', 'vo', 'gone_u', 'abs_u', 'boss', 'plain'],
    flow: [
      { user: 'eng_ok', stage: 'engineer', bagts: ['*'] },
      { user: 'mis', stage: 'manager', bagts: [G0] },
      /* «Зөвхөн харна» ч ШАТ мөн — зөрөө биш */
      { user: 'vo', stage: 'director', bagts: ['*'], viewOnly: true },
    ],
    typeStage: {
      chief_noflow: 'chief', eng_ok: 'engineer', mis: 'engineer', vo: 'director',
      gone_u: 'company', abs_u: 'head', boss: 'chief',
    },
    gone: ['gone_u'], absent: ['ABS_U'], supers: ['boss'],
  };
  const gaps = typeStageGaps(src);
  assert.deepEqual(gaps, [
    { user: 'Chief_NoFlow', want: 'chief', have: null },
    { user: 'mis', want: 'engineer', have: 'manager' },
  ], 'шатгүй + өөр шаттай л; зөв · зөвхөн харна · устгагдсан · порталд алга · super алгасна');
  assert.deepEqual(typeStageGaps(empty()), [], 'typeStage-гүй хуучин эх сурвалж — хоосон');
}
console.log('✅ төрөл ↔ урсгалын шат: шатгүй · өөр шат ил; зөв/зөвхөн харна/устгагдсан/порталд алга/super үгүй');

console.log('\nerhOverview: ok — «*» · гацааг урьдчилж · багц тусгаарлалт · матриц · өнчин эрх · устгагдсан аккаунт · танигдаагүй багц · төрөл↔шат');
