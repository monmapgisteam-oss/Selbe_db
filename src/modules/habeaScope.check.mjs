/**
 * ХАБЭА-ийн багцаар харах хүрээ (`habeaAcl`, `habeaOwn`, 2026-11-04).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/modules/habeaScope.check.mjs
 *
 * Хамгаалж буй алдаа: «Багцаар» чартууд өөрийн сонголтоор ЗОРИУД шүүгддэггүй (`incPass(x, 'pkg')`, `filterUzleg(uz, [], cos)`,
 * `weekScoreByPkg`, `rowsFor('pkg')`) тул `pkgs`-ийг хязгаарлахад л бусад багцын тоо хүрээтэй аккаунтад харагдаж байв.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scopePkgs, NO_PKG, habeaViewScope, canDownloadHabea } from './habeaScope.ts';
import { filterUzleg, habeaPkgKey } from './habeaUzleg.tsx';
import { AUTH } from '@/lib/services';

/* ── Хуваарилалт УНШИГДААГҮЙ үед хязгаартай аккаунт бүгдийг харахгүй (синкээс ӨМНӨ — энэ файлын эхэнд) ── */
AUTH.appId ||= 'test-app';
assert.deepEqual(habeaViewScope('anyone'), [], 'синкгүй → юу ч биш (хязгааргүй биш)');

/* ── scopePkgs ── */
assert.deepEqual(scopePkgs([], null), [], 'хязгааргүй, сонголтгүй → шүүлтгүй');
assert.deepEqual(scopePkgs(['A'], null), ['A'], 'хязгааргүй → сонголт хэвээр');
assert.deepEqual(scopePkgs([], ['A', 'B']), ['A', 'B'], 'сонголтгүй → бүх хүрээ');
assert.deepEqual(scopePkgs(['B'], ['A', 'B']), ['B'], 'сонголт хүрээнд');
assert.deepEqual(scopePkgs(['Z'], ['A']), ['A'], 'хүрээнээс гадуурх сонголт хүчингүй');
assert.deepEqual(scopePkgs([], []), [NO_PKG], 'багцгүй → юу ч таарахгүй (хоосон массив нь «бүгд» гэсэн утгатай тул)');
console.log('✅ scopePkgs: хязгааргүй · хүрээ · хүрээнээс гадуур · багцгүй');

/* ── Багцгүй аккаунт бүх мөрийг авахгүй (fail-closed) ── */
const st = { state: 'ready', rows: [{ bagtsK: 'A', coSfx: 'X' }, { bagtsK: 'B', coSfx: 'Y' }] };
assert.equal(filterUzleg(st, scopePkgs([], []), []).rows.length, 0, 'багцгүй → нэг ч үзлэг');
assert.equal(filterUzleg(st, scopePkgs([], ['A']), []).rows.length, 1, 'хүрээ → зөвхөн тэр багц');
console.log('✅ filterUzleg: багцгүй аккаунтад хоосон');

/* ── Эрхийн багцын нэр ↔ ХАБЭА-ийн өгөгдлийн бичиглэл нэг түлхүүр болно ── */
assert.equal(habeaPkgKey('Багц 4-2'), habeaPkgKey('Багц 4.2'), 'PKG_GROUPS «4-2» ↔ HSE_Action «4.2»');
assert.equal(habeaPkgKey('Багц 2'), habeaPkgKey('Багц 2.3.2'), 'Багц 2-ын дэд багцууд нэг');
assert.equal(habeaPkgKey('Багц 3.1'), habeaPkgKey('Багц -3.1'), 'гүйцэтгэгчийн бүртгэлийн «Багц -3.1»');
console.log('✅ habeaPkgKey: эрхийн багц ↔ өгөгдлийн бичиглэл');

/* ── `_form` хаалттай аккаунт: мөр ба багцын нэр хоёулаа эх үйлчилгээнээс ── */
{
  const uz = readFileSync(new URL('./habeaUzleg.tsx', import.meta.url), 'utf8');
  assert.ok(uz.includes('return queryFormOrSource(url, { outFields'), 'үзлэгийн мөр');
  assert.match(uz, /readMeta\(url\)\s+\.catch/, 'багцын нэрийн тайлбар (домэйн)');
}

/* ── Өөрийн сонголтоор шүүгддэггүй замууд хүрээгээр хязгаарлагдсан ── */
const habea = readFileSync(new URL('./Habea.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
assert.ok(habea.includes('filterUzleg(uz, scopePkgs([], habScope), cos)'), '«Үл нийцэл — багцаар» (маягт 1)');
assert.ok(habea.includes('filterUzleg(uz2, scopePkgs([], habScope), cos)'), '«Үл нийцэл — багцаар» (маягт 2)');
assert.ok(!habea.includes('filterUzleg(uz, [], cos)') && !habea.includes('filterUzleg(uz2, [], cos)'), 'хязгааргүй зам үлдсэн');
assert.ok(habea.includes('weekScoreByPkg(scoreRowsOf(weekScores.data.rows), cos)'), 'онооны чарт');
assert.ok(habea.includes('weekNcByPkg(scoreRowsOf(weekScores.data.rows), cos)'), 'үл нийцлийн чарт');
assert.ok(!habea.includes('weekScoreByPkg(weekScores.data.rows') && !habea.includes('weekNcByPkg(weekScores.data.rows'), 'хязгааргүй зам үлдсэн');
assert.ok(habea.includes('.filter((x) => !habScope || habScope.includes(x.bagtsK))'), 'осол · кран · компани');
assert.ok(habea.includes('if (pkgs.length && !viaPkg.length) return [];'), 'гүйцэтгэгчгүй багц → бүх компанийн хүн хүч биш');
assert.ok(!habea.includes('PKG_OF_CO'), 'кодын компани → багц зураглал буцаж ирэв — мөрийн bagts_* баганаас уншина');
assert.ok(habea.includes('r.items.filter((x) => habScope.includes(x.key))'), 'ослын давтамж — багцаар');
assert.ok(habea.includes('scope={habScope} />'), '«Үл нийцлийн мэдээлэл» самбар');
assert.ok(habea.includes('(!habScope || canEnter)'), '«Бусад үзүүлэлт» — төслийн нийт тоо');
assert.ok(habea.includes('queryFormOrSource(HABEA.labor.url'), 'хүн хүч: _form 403 бол эх үйлчилгээ');
console.log('✅ Habea: «багцаар» чартууд хүрээгээр хязгаарлагдсан');

/* ── Тайлан татах (2026-11-06): хүснэгтэд багц оноогдсон аккаунт нэмэлт эрхгүйгээр, зөвхөн өөрийн багцыг ── */
assert.equal(canDownloadHabea(false, ['A']), true, 'багцын аккаунт — habeaData эрхгүй ч товч харагдана');
assert.equal(canDownloadHabea(true, ['A']), true, 'хоёр эрхтэй');
assert.equal(canDownloadHabea(true, null), true, 'бүртгэл оруулагч — өмнөх шигээ');
assert.equal(canDownloadHabea(false, null), false, 'хүснэгтэд байхгүй, эрхгүй аккаунт — өмнөх шигээ товчгүй');
assert.equal(canDownloadHabea(false, []), false, 'хүрээ уншигдаагүй/эвдэрсэн — татах зүйлгүй');
assert.ok(habea.includes('canDownloadHabea(canEnter, habScope) && <UzlegExportButton kind={uzlegKind} scope={habScope} />'), 'товч хүрээгээ цонхонд дамжуулна');
{
  const uzx = readFileSync(new URL('./UzlegExport.tsx', import.meta.url), 'utf8');
  assert.ok(uzx.includes('(!scope || scope.includes(r.bagtsK)) && (r.d > 0'), 'үзлэгийн тайлан: мөр хүрээгээр');
  assert.ok(uzx.includes('<ActionExportDialog scope={scope}'), 'үл нийцлийн тайланд хүрээ дамжина');
  const acx = readFileSync(new URL('./ActionExport.tsx', import.meta.url), 'utf8');
  assert.ok(acx.includes('scope.includes(habeaPkgKey(r.site))'), 'үл нийцлийн тайлан: мөр хүрээгээр');
  const acr = readFileSync(new URL('../lib/actionReport.ts', import.meta.url), 'utf8');
  assert.ok(acr.includes("postFormOrSource<{ features?: { attributes?: Row }[] }>(url, '/query'"), '_form хаалттай аккаунтад эх үзлэгийн зураг эх үйлчилгээнээс');
}
console.log('✅ Тайлан татах: багцын аккаунт · хүрээгээр шүүлт · _form хаалттай');

/* ── Хүснэгтэд байгаа аккаунт л хязгаарлагдана; мөргүй аккаунт бүгдийг харна ── */
{
  const A = await import('@/lib/habeaAcl.ts');
  assert.deepEqual([...A.HABEA_PKGS], ['Багц 1', 'Багц 2', 'Багц 3.1', 'Багц 3.2', 'Багц 3.3', 'Багц 4-1', 'Багц 4-2'], 'хүснэгтийн багцууд');
  A._syncRemoteHabea([
    { user: 'b1', grants: [{ role: 'viewer', bagts: ['Багц 4-2'] }] },
    { user: 'b2', grants: [{ role: 'viewer', bagts: ['Багц 2', 'Багц 3.1'] }] },
    { user: 'ball', grants: [{ role: 'viewer', bagts: ['*'] }] },
  ]);
  assert.equal(A.hasHabeaViewer('b1'), true);
  assert.deepEqual(A.habeaViewerScope('b1').map(habeaPkgKey), [habeaPkgKey('Багц 4.2')], 'заасан багц ↔ өгөгдлийн түлхүүр');
  assert.equal(A.habeaViewerScope('b2').length, 2, 'олон багц');
  assert.equal(A.habeaViewerScope('ball'), null, '«бүх багц» = хязгааргүй');
  assert.equal(A.hasHabeaViewer('uta'), false, 'хүснэгтэд байхгүй → хязгааргүй');
  console.log('✅ habeaAcl: заасан багц · олон багц · бүх багц · хүснэгтэд байхгүй');
}

/* ── 2026-11-06: хязгаар уншигдаагүй/эвдэрсэн бол fail-closed ── */
{
  const A = await import('@/lib/habeaAcl.ts');
  A._syncRemoteHabea([
    { user: 'Good', grants: [{ role: 'viewer', bagts: ['Багц 1'] }] },
    { user: 'noBagts', grants: [{ role: 'viewer', bagts: [] }] },
    { user: 'badRole', grants: [{ role: 'zzz', bagts: ['Багц 1'] }] },
  ]);
  assert.equal(A.habeaAclReady(), true);
  assert.equal(A.habeaRowBroken('good'), false, 'хүчинтэй мөр');
  assert.equal(A.habeaRowBroken('noBagts'), true, 'багцгүй мөр — хязгааргүй биш');
  assert.equal(A.habeaRowBroken('BADROLE '), true, 'танигдаагүй үүрэг; том/жижиг үсэг, зай үл хамаарна');
  assert.equal(A.habeaRowBroken('uta'), false, 'мөргүй аккаунт — эвдэрсэн биш');
  assert.equal(A.habeaRowBroken(null), false);
  assert.deepEqual(habeaViewScope('good'), [habeaPkgKey('Багц 1')], 'хүчинтэй мөр → багц');
  assert.deepEqual(habeaViewScope('noBagts'), [], 'эвдэрсэн мөр → юу ч биш');
  assert.deepEqual(habeaViewScope('badRole'), [], 'эвдэрсэн мөр → юу ч биш');
  assert.equal(habeaViewScope('uta'), null, 'мөргүй аккаунт → хязгааргүй');
  assert.equal(habeaViewScope(null), null);
  /* Зайтай түлхүүр мөрөө алддаг (`isSpacedKey`) — угтварын дараах зайтай ч тэр аккаунт эвдэрсэн, «хязгааргүй» биш */
  assert.equal(A.malformedHabeaUser('__habea__:Bob'), 'bob');
  assert.equal(A.malformedHabeaUser(' __HABEA__: bob '), 'bob');
  assert.equal(A.malformedHabeaUser('__ajil__:bob'), null);
  console.log('✅ habeaAcl: эвдэрсэн мөр таних');
}
