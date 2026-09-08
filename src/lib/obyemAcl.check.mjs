/**
 * ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМЫН ЭРХИЙН ЛОГИК ШАЛГУУР — offline.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/obyemAcl.check.mjs
 *
 * ⚠️ `huvaariAcl`-ТАЙ ИЖИЛ БҮТЭЦ, ӨӨР АСУУЛТ: тэр нь ОГНОО, энэ нь ОБЬЁМ.
 *    Гурван ACL (урсгал · хуваарь · обьём) НЭГ ArcGIS хүснэгтэд өөр өөр
 *    угтвартай мөрөнд амьдардаг тул тэдгээр ХОЛИЛДОХГҮЙ гэдгийг энд барина.
 *
 * Хамгаалж буй дүрмүүд:
 *   1. Хуваарилагдаагүй → fail-closed (`[]`).
 *   2. Үүрэг нь ХҮРЭЭГ ялгана — засварлагчийн багц батлагчийнхтай хольцгүй.
 *   3. Гүйцэтгэлийн урсгал БА хуваарийн эрхээс БҮРЭН тусдаа.
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
  ALL_BAGTS, obyemScope, hasObyemRole, _syncRemoteObyem, setObyemAssign,
  listObyemAssigns,
} = await import('@/lib/obyemAcl.ts');
const ACL = await import('@/lib/guitsetgelAcl.ts');
const HV = await import('@/lib/huvaariAcl.ts');
const { ROLE_BY_USER } = await import('@/lib/services.ts');
const superName = Object.entries(ROLE_BY_USER).find(([, x]) => x === 'super')[0];

/* ── 1. Хуваарилагдаагүй → ЮУ Ч ХИЙХГҮЙ (fail-closed) ── */
_syncRemoteObyem([]);
assert.deepEqual(obyemScope('zasvarlagch_a', 'editor'), [], 'хуваарилагдаагүй = хоосон');
assert.deepEqual(obyemScope('zasvarlagch_a', 'approver'), [], 'батлагчаар ч хоосон');
assert.deepEqual(obyemScope(null, 'editor'), [], 'нэргүй = хоосон');
assert.equal(hasObyemRole('zasvarlagch_a', 'editor'), false);
console.log('✅ fail-closed');

/* ══════════════════════════════════════════════════════════════
 * 2. ҮҮРЭГ нь ХҮРЭЭГ ЯЛГАНА — ЭНЭ ФАЙЛЫН ГОЛ ШАЛГУУР
 * ══════════════════════════════════════════════════════════════ */
_syncRemoteObyem([{ user: 'zasvarlagch_a', roles: ['editor'], bagts: ['Багц 2'] }]);
assert.deepEqual(obyemScope('zasvarlagch_a', 'editor'), ['Багц 2'], 'засварлагчийн багц');
assert.deepEqual(
  obyemScope('zasvarlagch_a', 'approver'), [],
  'ЗАСВАРЛАГЧ нь БАТЛАГЧ болж болохгүй — үүрэг нь хүрээг ялгана',
);
assert.equal(hasObyemRole('zasvarlagch_a', 'editor'), true);
assert.equal(hasObyemRole('zasvarlagch_a', 'approver'), false);

_syncRemoteObyem([{ user: 'batlagch_b', roles: ['approver'], bagts: ['Багц 5'] }]);
assert.deepEqual(obyemScope('batlagch_b', 'approver'), ['Багц 5']);
assert.deepEqual(
  obyemScope('batlagch_b', 'editor'), [],
  'БАТЛАГЧ нь ЗАСВАРЛАГЧ болж болохгүй',
);

/* Хоёулаа байж БОЛНО — өөрийгөө батлахаас `decideObyem` хамгаална */
_syncRemoteObyem([{ user: 'hoyul', roles: ['editor', 'approver'], bagts: ['Багц 1'] }]);
assert.deepEqual(obyemScope('hoyul', 'editor'), ['Багц 1']);
assert.deepEqual(obyemScope('hoyul', 'approver'), ['Багц 1']);
console.log('✅ ҮҮРЭГ нь ХҮРЭЭГ ялгана');

/* ── 3. «Бүх багц» · том/жижиг үсэг · super ── */
_syncRemoteObyem([{ user: 'buh', roles: ['editor'], bagts: [ALL_BAGTS] }]);
assert.equal(obyemScope('buh', 'editor'), null, '«бүх багц» = хязгааргүй');
assert.deepEqual(obyemScope('buh', 'approver'), [], 'бүх багц ч ЗӨВХӨН тэр үүрэгт');
assert.equal(obyemScope('BUH', 'editor'), null, 'том/жижиг үсэг ялгахгүй');

assert.equal(obyemScope(superName, 'editor'), null, 'super = хязгааргүй');
assert.equal(obyemScope(superName, 'approver'), null, 'super = хоёр үүрэгт ч');
assert.equal(
  setObyemAssign(superName, ['editor'], ['Багц 2']).ok, false,
  'super-ийг хуваарилахгүй',
);
console.log('✅ бүх багц · super');

/* ── 4. ТАНИГДАХГҮЙ ҮҮРЭГ · ҮҮРЭГГҮЙ МӨР — эрх нээхгүй ── */
_syncRemoteObyem([{ user: 'muu', roles: ['hacker', 'author'], bagts: [ALL_BAGTS] }]);
assert.deepEqual(obyemScope('muu', 'editor'), [], 'танигдахгүй үүрэг эрх нээв');
assert.deepEqual(
  obyemScope('muu', 'approver'), [],
  'ХУВААРИЙН `author` үүрэг обьёмын эрх нээв — хоёр систем холилдов',
);
assert.equal(
  listObyemAssigns().some((a) => a.user === 'muu'), false,
  'үүрэггүй болсон мөр жагсаалтад үлдэв',
);

_syncRemoteObyem([{ user: 'hooson', roles: [], bagts: [ALL_BAGTS] }]);
assert.deepEqual(obyemScope('hooson', 'editor'), [], 'үүрэггүй мөр эрх нээв');

/* Хоосон `bagts` нь «бүх багц» БИШ (fail-closed) */
_syncRemoteObyem([{ user: 'hb', roles: ['editor'], bagts: [] }]);
assert.deepEqual(obyemScope('hb', 'editor'), [], 'хоосон bagts = хоосон, бүх багц БИШ');
console.log('✅ танигдахгүй үүрэг · үүрэггүй мөр · хоосон багц');

/* ── 5. Давхар мөр — СҮҮЛИЙНХ ялна · remote = эцсийн үнэн ── */
_syncRemoteObyem([
  { user: 'dup', roles: ['editor'], bagts: ['Багц 1'] },
  { user: 'dup', roles: ['approver'], bagts: ['Багц 3'] },
]);
assert.deepEqual(obyemScope('dup', 'approver'), ['Багц 3'], 'давхар мөрд сүүлийнх ялна');
assert.deepEqual(obyemScope('dup', 'editor'), [], 'өмнөх мөрийн үүрэг үлдэв');

_syncRemoteObyem([]);
assert.deepEqual(obyemScope('dup', 'approver'), [], 'remote-д алга бол ХАСАГДСАН');
console.log('✅ давхар мөр · remote = эцсийн үнэн');

/* ══════════════════════════════════════════════════════════════
 * 6. ГУРВАН ACL ХОЛИЛДОХГҮЙ — ГОЛ ТУСГААРЛАЛТ
 *    (урсгал `__flow__:` · хуваарь `__huvaari__:` · обьём `__obyem__:`)
 * ══════════════════════════════════════════════════════════════ */
ACL._syncRemoteAssigns([{ user: 'injener_x', stage: 'engineer', bagts: ['Багц 1'] }]);
HV._syncRemoteHuvaari([{ user: 'injener_x', roles: ['author'], bagts: ['Багц 4-1'] }]);
_syncRemoteObyem([]);

assert.deepEqual(
  obyemScope('injener_x', 'editor'), [],
  'урсгалын томилгоо обьёмын эрх ӨГӨХГҮЙ',
);
assert.deepEqual(
  obyemScope('injener_x', 'approver'), [],
  'ХУВААРИЙН зохиогч автоматаар обьёмын батлагч БОЛОХГҮЙ',
);

/* Обьёмын үүрэг олгох нь урсгал БА хуваарийг ХӨНДӨХГҮЙ */
const w = setObyemAssign('injener_x', ['approver'], ['Багц 5']);
assert.equal(w.ok, true);
assert.equal(ACL.stageOfUser('injener_x'), 'engineer', 'урсгалын ШАТ хэвээр');
assert.deepEqual(ACL.bagtsScope('injener_x'), ['Багц 1'], 'урсгалын БАГЦ хэвээр');
assert.deepEqual(
  HV.huvaariScope('injener_x', 'author'), ['Багц 4-1'],
  'ХУВААРИЙН багц хэвээр — обьёмын томилгоо түүнийг дарсан',
);
assert.deepEqual(obyemScope('injener_x', 'approver'), ['Багц 5'], 'обьёмын багц ӨӨРИЙНХӨӨ');
console.log('✅ гурван ACL тусдаа');

/* ── 7. Хуваарилалт нь ХАМГИЙН СҮҮЛИЙН remote-оос ── */
_syncRemoteObyem([{ user: 'a1', roles: ['editor'], bagts: ['Багц 2'] }]);
assert.deepEqual(obyemScope('a1', 'editor'), ['Багц 2']);
/* Дараагийн sync-д алга → ХАСАГДСАН (эрх нь өөрөө хадгалагдахгүй) */
_syncRemoteObyem([{ user: 'a2', roles: ['editor'], bagts: ['Багц 3'] }]);
assert.deepEqual(obyemScope('a1', 'editor'), [], 'remote-д алга болсон хүн эрхээ хадгалав');
assert.deepEqual(obyemScope('a2', 'editor'), ['Багц 3']);
console.log('✅ remote = эцсийн үнэн (2)');

console.log('\nobyemAcl.check: ok');
