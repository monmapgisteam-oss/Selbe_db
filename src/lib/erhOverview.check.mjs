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
 */
import assert from 'node:assert/strict';

const { userErh, pkgErh, allPkgErh, allUserErh } = await import('@/lib/erhOverview.ts');
const { PKG_GROUPS } = await import('@/modules/sheet/bagts.pkg.ts');
const { STAGE_ORDER } = await import('@/lib/hyanalt.ts');

const G0 = PKG_GROUPS[0];
const G1 = PKG_GROUPS[1];

/** Хоосон эх сурвалж */
const empty = () => ({
  users: [], flow: [], qaqc: [], huvaari: [], obyem: [], caps: {}, views: {},
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

console.log('\nerhOverview: ok — «*» · гацааг урьдчилж · багц тусгаарлалт');
