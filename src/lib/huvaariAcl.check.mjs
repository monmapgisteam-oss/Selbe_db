/**
 * ХУВААРИЙН ЭРХИЙН ЛОГИК ШАЛГУУР — offline (ArcGIS-гүй орчинд ажиллана).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/huvaariAcl.check.mjs
 *
 * ⚠️ `qaqcAcl`-ААС ЯЛГААТАЙ нь ХОЁР ҮҮРЭГ (зохиогч · батлагч). Тиймээс энд
 *    «хүрээ» гэдэг нь ҮҮРЭГ БҮРЭЭР тусдаа асуулт: нэг хүн Багц 2-т зохиогч,
 *    Багц 5-д батлагч байж болно.
 *
 * Хамгаалж буй дүрмүүд:
 *   1. Хуваарилагдаагүй → fail-closed (`[]`).
 *   2. Үүрэг нь ХҮРЭЭГ ялгана — зохиогчийн багц батлагчийнхтай хольцгүй.
 *   3. Гүйцэтгэлийн урсгалаас (`guitsetgelAcl`) БҮРЭН тусдаа.
 *   4. Танигдахгүй үүрэг, үүрэггүй мөр эрх нээхгүй.
 */
import assert from 'node:assert/strict';

/* ── window/localStorage shim ── */
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
  ALL_BAGTS, huvaariScope, hasPlanRole, _syncRemoteHuvaari, setHuvaariAssign,
  removeHuvaariAssign, purgeHuvaariAssign, listHuvaariAssigns, setHuvaariGrants,
  huvaariGrantsOf,
} = await import('@/lib/huvaariAcl.ts');
const ACL = await import('@/lib/guitsetgelAcl.ts');
const { ROLE_BY_USER } = await import('@/lib/services.ts');
const superName = Object.entries(ROLE_BY_USER).find(([, x]) => x === 'super')[0];

/* ── 1. Хуваарилагдаагүй → ЮУ Ч ХИЙХГҮЙ (fail-closed) ── */
_syncRemoteHuvaari([]);
assert.deepEqual(huvaariScope('zohiogch_a', 'author'), [], 'хуваарилагдаагүй = хоосон');
assert.deepEqual(huvaariScope('zohiogch_a', 'approver'), [], 'батлагчаар ч хоосон');
assert.deepEqual(huvaariScope(null, 'author'), [], 'нэргүй = хоосон');
assert.equal(hasPlanRole('zohiogch_a', 'author'), false);
console.log('✅ fail-closed');

/* ══════════════════════════════════════════════════════════════
 * 2. ҮҮРЭГ нь ХҮРЭЭГ ЯЛГАНА — ЭНЭ ФАЙЛЫН ГОЛ ШАЛГУУР
 * ══════════════════════════════════════════════════════════════ */
_syncRemoteHuvaari([{ user: 'zohiogch_a', roles: ['author'], bagts: ['Багц 2'] }]);
assert.deepEqual(huvaariScope('zohiogch_a', 'author'), ['Багц 2'], 'зохиогчийн багц');
assert.deepEqual(
  huvaariScope('zohiogch_a', 'approver'), [],
  'ЗОХИОГЧ нь БАТЛАГЧ болж болохгүй — үүрэг нь хүрээг ялгана',
);
assert.equal(hasPlanRole('zohiogch_a', 'author'), true);
assert.equal(hasPlanRole('zohiogch_a', 'approver'), false);

_syncRemoteHuvaari([{ user: 'batlagch_b', roles: ['approver'], bagts: ['Багц 5'] }]);
assert.deepEqual(huvaariScope('batlagch_b', 'approver'), ['Багц 5']);
assert.deepEqual(
  huvaariScope('batlagch_b', 'author'), [],
  'БАТЛАГЧ нь ЗОХИОГЧ болж болохгүй',
);

/* Хоёулаа байж БОЛНО — өөрийгөө батлахаас `decidePlan` хамгаална */
_syncRemoteHuvaari([{ user: 'hoyul', roles: ['author', 'approver'], bagts: ['Багц 1'] }]);
assert.deepEqual(huvaariScope('hoyul', 'author'), ['Багц 1']);
assert.deepEqual(huvaariScope('hoyul', 'approver'), ['Багц 1']);
console.log('✅ ҮҮРЭГ нь ХҮРЭЭГ ялгана');

/* ── 3. «Бүх багц» · том/жижиг үсэг · super ── */
_syncRemoteHuvaari([{ user: 'buh', roles: ['author'], bagts: [ALL_BAGTS] }]);
assert.equal(huvaariScope('buh', 'author'), null, '«бүх багц» = хязгааргүй');
assert.deepEqual(huvaariScope('buh', 'approver'), [], 'бүх багц ч ЗӨВХӨН тэр үүрэгт');
assert.equal(huvaariScope('BUH', 'author'), null, 'том/жижиг үсэг ялгахгүй');

assert.equal(huvaariScope(superName, 'author'), null, 'super = хязгааргүй');
assert.equal(huvaariScope(superName, 'approver'), null, 'super = хоёр үүрэгт ч');
assert.equal(setHuvaariAssign(superName, ['author'], ['Багц 2']).ok, false, 'super-ийг хуваарилахгүй');
console.log('✅ бүх багц · super');

/* ── 4. ТАНИГДАХГҮЙ ҮҮРЭГ · ҮҮРЭГГҮЙ МӨР — эрх нээхгүй ── */
_syncRemoteHuvaari([{ user: 'muu', roles: ['hacker', 'admin'], bagts: [ALL_BAGTS] }]);
assert.deepEqual(huvaariScope('muu', 'author'), [], 'танигдахгүй үүрэг эрх нээв');
assert.equal(
  listHuvaariAssigns().some((a) => a.user === 'muu'), false,
  'үүрэггүй болсон мөр жагсаалтад үлдэв',
);

_syncRemoteHuvaari([{ user: 'hooson', roles: [], bagts: [ALL_BAGTS] }]);
assert.deepEqual(huvaariScope('hooson', 'author'), [], 'үүрэггүй мөр эрх нээв');

/* Хоосон `bagts` нь «бүх багц» БИШ (fail-closed, урсгалынхтай ижил) */
_syncRemoteHuvaari([{ user: 'hb', roles: ['author'], bagts: [] }]);
assert.deepEqual(huvaariScope('hb', 'author'), [], 'хоосон bagts = хоосон, бүх багц БИШ');
console.log('✅ танигдахгүй үүрэг · үүрэггүй мөр · хоосон багц');

/* ── 5. Давхар мөр — СҮҮЛИЙНХ ялна · remote = эцсийн үнэн ── */
_syncRemoteHuvaari([
  { user: 'dup', roles: ['author'], bagts: ['Багц 1'] },
  { user: 'dup', roles: ['approver'], bagts: ['Багц 3'] },
]);
assert.deepEqual(huvaariScope('dup', 'approver'), ['Багц 3'], 'давхар мөрд сүүлийнх ялна');
assert.deepEqual(huvaariScope('dup', 'author'), [], 'өмнөх мөрийн үүрэг үлдэв');

_syncRemoteHuvaari([]);
assert.deepEqual(huvaariScope('dup', 'approver'), [], 'remote-д алга бол ХАСАГДСАН');
console.log('✅ давхар мөр · remote = эцсийн үнэн');

/* ══════════════════════════════════════════════════════════════
 * 6. ГҮЙЦЭТГЭЛИЙН УРСГАЛААС ТУСДАА
 * ══════════════════════════════════════════════════════════════ */
ACL._syncRemoteAssigns([{ user: 'injener_x', stage: 'engineer', bagts: ['Багц 1'] }]);
_syncRemoteHuvaari([]);
assert.deepEqual(
  huvaariScope('injener_x', 'author'), [],
  'урсгалын томилгоо хуваарийн эрх ӨГӨХГҮЙ',
);
assert.deepEqual(
  huvaariScope('injener_x', 'approver'), [],
  'урсгалын инженер автоматаар батлагч БОЛОХГҮЙ',
);

/* Хуваарийн үүрэг олгох нь урсгалын шатыг ХӨНДӨХГҮЙ */
const w = setHuvaariAssign('injener_x', ['approver'], ['Багц 5']);
assert.equal(w.ok, true);
assert.equal(ACL.stageOfUser('injener_x'), 'engineer', 'урсгалын ШАТ хэвээр');
assert.deepEqual(ACL.bagtsScope('injener_x'), ['Багц 1'], 'урсгалын БАГЦ хэвээр');
assert.deepEqual(huvaariScope('injener_x', 'approver'), ['Багц 5'], 'хуваарийн багц ӨӨРИЙНХӨӨ');

/* Урсгалын ШАТГҮЙ хүн хуваарийн үүрэгтэй байж ЧАДНА */
ACL._syncRemoteAssigns([]);
_syncRemoteHuvaari([{ user: 'huv_only', roles: ['approver'], bagts: ['Багц 4'] }]);
assert.equal(ACL.stageOfUser('huv_only'), null, 'урсгалын шатгүй');
assert.deepEqual(huvaariScope('huv_only', 'approver'), ['Багц 4'], 'ГЭВЧ хуваарийн батлагч');
console.log('✅ ТУСГААРЛАЛТ — урсгал ↔ хуваарь хамааралгүй');

/* ── 7. Хасалт · үүрэг солих ── */
_syncRemoteHuvaari([{ user: 'rm', roles: ['author'], bagts: ['Багц 2'] }]);
removeHuvaariAssign('rm', false);
assert.deepEqual(huvaariScope('rm', 'author'), [], 'хасагдсан = хоосон');

_syncRemoteHuvaari([{ user: 'del', roles: ['author'], bagts: ['Багц 3'] }]);
await purgeHuvaariAssign('del');
assert.equal(listHuvaariAssigns().some((a) => a.user === 'del'), false, 'өнчин мөр үлдэв');

/* Үүрэггүй болгох нь татгалзана — ✕-ээр л хасна */
_syncRemoteHuvaari([]);
setHuvaariAssign('sw', ['author'], ['Багц 1'], false);
assert.equal(setHuvaariAssign('sw', [], ['Багц 1']).ok, false, 'үүрэггүй хуваарилалт үүсэв');
assert.equal(setHuvaariAssign('sw', ['author'], []).ok, false, 'багцгүй хуваарилалт үүсэв');
assert.deepEqual(huvaariScope('sw', 'author'), ['Багц 1'], 'татгалзсан оролдлого утга өөрчлөв');
console.log('✅ хасалт · үүрэг солих');

/* ══════════════════════════════════════════════════════════════
 * 8. ҮҮРЭГ БҮРД ӨӨР БАГЦ — 2026-09-09-ны схемийн ГОЛ ЗОРИЛГО
 * ══════════════════════════════════════════════════════════════ */
/**
 * ⚠️ Хуучин `{roles:['author','approver'], bagts:['Багц 1','Багц 5']}` нь
 *    ДӨРВӨН хослол үүсгэдэг байсан: тэр хүн Багц 1-д ч БАТЛАГЧ болно.
 *    `decidePlan` зохиогч=батлагчийг татгалздаг тул Багц 1 ГАЦНА. Одоо
 *    grant тус бүр өөрийн багцтай тул хүрээ нь ЯГ таарна.
 */
_syncRemoteHuvaari([]);
{
  const r = setHuvaariGrants('holimog', [
    { role: 'author', bagts: ['Багц 1'] },
    { role: 'approver', bagts: ['Багц 5'] },
  ], false);
  assert.equal(r.ok, true, 'үүрэг бүрд өөр багц олгож чадсангүй');

  assert.deepEqual(huvaariScope('holimog', 'author'), ['Багц 1'],
    'зохиогчийн хүрээ');
  assert.deepEqual(huvaariScope('holimog', 'approver'), ['Багц 5'],
    'батлагчийн хүрээ');

  /* ⚠️ ГОЛ ЦЭГ: Багц 1-д БАТЛАГЧ БИШ, Багц 5-д ЗОХИОГЧ БИШ */
  assert.equal(huvaariScope('holimog', 'approver').includes('Багц 1'), false,
    'ҮРЖВЭР эргэж ирэв — Багц 1-д батлагч болжээ (тэр багц ГАЦНА)');
  assert.equal(huvaariScope('holimog', 'author').includes('Багц 5'), false,
    'ҮРЖВЭР эргэж ирэв — Багц 5-д зохиогч болжээ');

  /* Хоёулаа үүрэг нь БАЙГАА — зөвхөн хүрээ нь ялгаатай */
  assert.equal(hasPlanRole('holimog', 'author'), true);
  assert.equal(hasPlanRole('holimog', 'approver'), true);

  /* Үүрэг заагаагүй `scope` нь БҮХ үүргийн НЭГДЭЛ */
  assert.deepEqual(huvaariScope('holimog').sort(), ['Багц 1', 'Багц 5'],
    'үүрэг заагаагүй хүрээ нь нэгдэл байх ёстой');
}

/* ⚠️ ХУУЧИН ХЭЛБЭР УНШИГДСААР БАЙНА — ArcGIS дээр хуучин мөр үлдсэн байж
   болно. Хөрвүүлэлт нь эрхийг НЭМЭХГҮЙ, ХАСАХГҮЙ: хуучин утга нь «хоёулаа
   хоёр багцад» гэсэн санаатай байсан тул ЯГ ТЭР УТГААР нь үлдэнэ. */
_syncRemoteHuvaari([{ user: 'huuchin', roles: ['author', 'approver'], bagts: ['Багц 2'] }]);
assert.deepEqual(huvaariScope('huuchin', 'author'), ['Багц 2'], 'хуучин мөр — зохиогч');
assert.deepEqual(huvaariScope('huuchin', 'approver'), ['Багц 2'], 'хуучин мөр — батлагч');

/* ШИНЭ хэлбэр ч уншигдана */
_syncRemoteHuvaari([{
  user: 'shine',
  grants: [{ role: 'author', bagts: ['Багц 3'] }, { role: 'approver', bagts: ['Багц 4'] }],
}]);
assert.deepEqual(huvaariScope('shine', 'author'), ['Багц 3'], 'шинэ мөр — зохиогч');
assert.deepEqual(huvaariScope('shine', 'approver'), ['Багц 4'], 'шинэ мөр — батлагч');
assert.equal(huvaariScope('shine', 'author').includes('Багц 4'), false,
  'шинэ мөрөөс үржвэр гарав');

/* `grantsOf` нь хуваарилалтыг ЯГ ХЭВЭЭР буцаана — панел үүнийг заснаа */
assert.deepEqual(
  huvaariGrantsOf('shine'),
  [{ role: 'author', bagts: ['Багц 3'] }, { role: 'approver', bagts: ['Багц 4'] }],
);
assert.equal(huvaariGrantsOf('baihgui'), null, 'байхгүй хүн null байх ёстой');

/* Багцгүй grant нь ХАЯГДАНА — «хуваарилагдсан ч багцгүй» төлөв үүсэхгүй */
assert.equal(setHuvaariGrants('hooson', [{ role: 'author', bagts: [] }], false).ok, false,
  'багцгүй grant хүлээн авагдав');
console.log('✅ үүрэг бүрд ӨӨР багц — үржвэр арилсан, хоёр хэлбэр уншигдана');

console.log('\nhuvaariAcl: ok — fail-closed · үүрэг↔хүрээ · super · УРСГАЛААС ТУСДАА · хасалт · grants');
