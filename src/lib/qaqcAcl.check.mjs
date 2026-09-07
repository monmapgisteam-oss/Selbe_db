/**
 * ЧАНАРЫН (QAQC) ЭРХИЙН ЛОГИК ШАЛГУУР — offline (ArcGIS-гүй орчинд ажиллана).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/qaqcAcl.check.mjs
 *
 * ЭНЭ ФАЙЛЫН ГОЛ ҮҮРЭГ нь `qaqcAcl` ба `guitsetgelAcl` хоёрын ТУСГААРЛАЛТЫГ
 * бэхлэх явдал. 2026-09-07 хүртэл «Чанар (QAQC)» хуудас багцаа урсгалын
 * томилгооноос авдаг байсны улмаас:
 *
 *   1. `qaqc` эрх ГАНЦААРАА утгагүй байв — харагдац нээгдээд «нэг ч багц
 *      хуваарилагдаагүй» гэж хоосон үлддэг (яг хэрэглэгчийн мэдээлсэн алдаа).
 *   2. Багц өгөхийн тулд хүнийг урсгалын нэг ШАТАНД томилох ёстой болж, тэр нь
 *      гүйцэтгэл ЗӨВШӨӨРӨХ эрх дагуулдаг байв («хэн юуг баталсан нь замхарна»).
 *   3. «Нэг аккаунт нэг шатанд» дүрмээр хүний ӨМНӨХ томилгоо чимээгүй
 *      хасагддаг байв — чанарын багц өгөх үйлдэл урсгалын хяналтыг эвдэнэ.
 *
 * Хэрэв хэн нэгэн `Qaqc.tsx`-ийг `bagtsScope` руу буцаавал, эсвэл хоёр
 * хадгалалтыг нэгтгэвэл доорх шалгуурууд унана.
 */
import assert from 'node:assert/strict';

/* ── window/localStorage shim — 'use client' модулиудад ── */
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
  ALL_BAGTS, qaqcScope, _syncRemoteQaqc, setQaqcAssign, removeQaqcAssign,
  purgeQaqcAssign, listQaqcAssigns,
} = await import('@/lib/qaqcAcl.ts');
const ACL = await import('@/lib/guitsetgelAcl.ts');
const { ROLE_BY_USER } = await import('@/lib/services.ts');
const superName = Object.entries(ROLE_BY_USER).find(([, x]) => x === 'super')[0];

/* ── 1. Хуваарилагдаагүй → ЮУ Ч ХАРАХГҮЙ (fail-closed) ── */
_syncRemoteQaqc([]);
assert.deepEqual(qaqcScope('chanar_a'), [], 'хуваарилагдаагүй = хоосон');
assert.deepEqual(qaqcScope(null), [], 'нэргүй = хоосон');
assert.deepEqual(qaqcScope(undefined), [], 'undefined = хоосон');
console.log('✅ fail-closed');

/* ── 2. Заасан багц · «Бүх багц» · хоосон массив ── */
_syncRemoteQaqc([{ user: 'chanar_a', bagts: ['Багц 2'] }]);
assert.deepEqual(qaqcScope('chanar_a'), ['Багц 2'], 'заасан багц');
assert.deepEqual(qaqcScope('CHANAR_A'), ['Багц 2'], 'том/жижиг үсэг ялгахгүй');

_syncRemoteQaqc([{ user: 'chanar_b', bagts: [ALL_BAGTS] }]);
assert.equal(qaqcScope('chanar_b'), null, '«бүх багц» = хязгааргүй');

/* ⚠️ Хоосон `bagts` нь «бүх багц» БИШ — урсгалын `bagtsFor`-той ижил fail-closed
   (2026-08-29: эвдэрсэн мөр бүх багцыг нээдэг байв). */
_syncRemoteQaqc([{ user: 'chanar_c', bagts: [] }]);
assert.deepEqual(qaqcScope('chanar_c'), [], 'хоосон bagts = хоосон, бүх багц БИШ');
console.log('✅ хүрээ · fail-closed хоосон');

/* ── 3. Хатуу super — хуваарилалтаас үл хамаарна ── */
_syncRemoteQaqc([]);
assert.equal(qaqcScope(superName), null, 'super = хязгааргүй');
assert.equal(
  setQaqcAssign(superName, ['Багц 2']).ok, false,
  'super-ийг хуваарилахгүй — худал хязгаар харуулна',
);
console.log('✅ super');

/* ── 4. Давхар мөр — СҮҮЛИЙНХ ялна (их OBJECTID) ── */
_syncRemoteQaqc([
  { user: 'dup', bagts: ['Багц 1'] },
  { user: 'dup', bagts: ['Багц 3'] },
]);
assert.deepEqual(qaqcScope('dup'), ['Багц 3'], 'давхар мөрд сүүлийнх ялна');
console.log('✅ давхар мөр');

/* ── 5. REMOTE = ЭЦСИЙН ҮНЭН — локалтай НЭГТГЭХГҮЙ ── */
_syncRemoteQaqc([{ user: 'gone', bagts: ['Багц 2'] }]);
assert.deepEqual(qaqcScope('gone'), ['Багц 2']);
_syncRemoteQaqc([]); // өөр админ хасав
assert.deepEqual(qaqcScope('gone'), [], 'remote-д алга бол ХАСАГДСАН — локал үлдэхгүй');
console.log('✅ remote = эцсийн үнэн');

/* ══════════════════════════════════════════════════════════════════════
 * 6. ТУСГААРЛАЛТ — ЭНЭ ФАЙЛЫН ГОЛ ШАЛГУУР
 * ══════════════════════════════════════════════════════════════════════ */

/* 6a. Чанарын багц олгох нь УРСГАЛЫН томилгоог ОГТ хөндөхгүй.
   ⚠️ Урьд нь `setAssign`-ийн «нэг аккаунт нэг шатанд» дүрмээр чанарын багц
      олгох гэсэн үйлдэл хүний өмнөх шатыг чимээгүй хасдаг байв. */
ACL._syncRemoteAssigns([{ user: 'injener_x', stage: 'engineer', bagts: ['Багц 1'] }]);
_syncRemoteQaqc([]);
assert.equal(ACL.stageOfUser('injener_x'), 'engineer');

const w = setQaqcAssign('injener_x', ['Багц 5']);
assert.equal(w.ok, true, 'чанарын багц олгогдоно');
assert.equal(
  ACL.stageOfUser('injener_x'), 'engineer',
  'урсгалын ШАТ хэвээр — чанарын хуваарилалт түүнийг хөндөхгүй',
);
assert.deepEqual(
  ACL.bagtsScope('injener_x'), ['Багц 1'],
  'урсгалын БАГЦ хэвээр — чанарынхтай хольцгүй',
);
assert.deepEqual(qaqcScope('injener_x'), ['Багц 5'], 'чанарын багц нь ӨӨРИЙНХӨӨ');

/* 6b. Урсгалын томилгоо нь ЧАНАРЫН хүрээг ӨГӨХГҮЙ.
   ⚠️ Яг энэ л «эрх олгосон атлаа хуудас хоосон» гэсэн гомдлын эх үүсвэр:
      урсгалд бүх багцтай хүн чанарын хуудсанд юу ч харах ёсгүй. */
ACL._syncRemoteAssigns([{ user: 'menejer_y', stage: 'manager', bagts: [ACL.ALL_BAGTS] }]);
_syncRemoteQaqc([]);
assert.equal(ACL.bagtsScope('menejer_y'), null, 'урсгалд хязгааргүй');
assert.deepEqual(
  qaqcScope('menejer_y'), [],
  'урсгалын томилгоо чанарын хүрээ ӨГӨХГҮЙ — тусдаа хуваарилалт шаардлагатай',
);

/* 6c. ШАТГҮЙ хүн чанарын багцтай байж ЧАДНА — энэ нь бүх засварын үндэс.
   Чанарын хяналтын ажилтан нь дөрвөн шатны аль нь ч биш. */
ACL._syncRemoteAssigns([]);
_syncRemoteQaqc([{ user: 'chanar_only', bagts: ['Багц 4'] }]);
assert.equal(ACL.stageOfUser('chanar_only'), null, 'урсгалын шатгүй');
assert.deepEqual(ACL.bagtsScope('chanar_only'), [], 'гүйцэтгэлийн багцгүй');
assert.deepEqual(qaqcScope('chanar_only'), ['Багц 4'], 'ГЭВЧ чанарын багцтай');
console.log('✅ ТУСГААРЛАЛТ — урсгал ↔ чанар харилцан хамааралгүй');

/* ── 7. Хасалт ── */
_syncRemoteQaqc([{ user: 'rm_a', bagts: ['Багц 2'] }]);
removeQaqcAssign('rm_a', false);
assert.deepEqual(qaqcScope('rm_a'), [], 'хасагдсан = хоосон');
assert.equal(listQaqcAssigns().some((a) => a.user === 'rm_a'), false, 'мөр үлдэхгүй');

/* Аккаунт устгахад мөр бүрмөсөн арилна — эс бөгөөс тэр нэрийг дахин нэмэхэд
   чанарын багц нь өөрөө эргэж ирнэ (`purgeAssign`-тай ижил шалтгаан). */
_syncRemoteQaqc([{ user: 'del_a', bagts: ['Багц 3'] }]);
await purgeQaqcAssign('del_a');
assert.deepEqual(qaqcScope('del_a'), [], 'устгасны дараа хоосон');
assert.equal(listQaqcAssigns().some((a) => a.user === 'del_a'), false, 'өнчин мөр үлдэхгүй');
console.log('✅ хасалт · устгалт');

/* ── 8. Багц СОЛИХОД өмнөх нь үлдэхгүй (нэг хэрэглэгч нэг мөр) ── */
_syncRemoteQaqc([]);
setQaqcAssign('swap', ['Багц 1'], false);
setQaqcAssign('swap', ['Багц 7'], false);
assert.deepEqual(qaqcScope('swap'), ['Багц 7'], 'сүүлийн сонголт л үлдэнэ');
assert.equal(
  listQaqcAssigns().filter((a) => a.user === 'swap').length, 1,
  'нэг хэрэглэгч = нэг мөр',
);
assert.equal(setQaqcAssign('swap', []).ok, false, 'хоосон багц хадгалагдахгүй');
console.log('✅ нэг хэрэглэгч нэг мөр');

/* ── 9. ХАСАЛТ дээр ЭРХ БУЦААЛТЫН үр дүн ЗАЛГИГДАХГҮЙ (2026-09-07-ны merge аудит) ──
   Урьд нь `removeQaqcAssign`-ийн `catch` хоосон байсан тул `__cap__:` мөр
   ArcGIS дээр үлдсэн ч `sync` нь `true` гарч, админд «амжилттай» гэж ХУДАЛ
   мэдээлдэг байв. Дараагийн `initRemote` тэр мөрийг эргүүлж татаж эрхийг
   СЭРГЭЭДЭГ тул хэрэглэгч багцгүй атлаа эрхтэй үлдэж, хоосон хуудсыг
   мөнхөд нээдэг байлаа. Одоо `granted` талбар нь үр дүнг ил гаргана. */
_syncRemoteQaqc([{ user: 'rv_a', bagts: ['Багц 2'] }]);
const rv = removeQaqcAssign('rv_a', false);
assert.equal(typeof rv.granted, 'object', 'хасалт `granted` амлалт буцаана');
assert.equal(await rv.granted, true, 'эрх буцаахгүй (revoke=false) үед `granted` үнэн');
/* ⚠️ `sync` нь ArcGIS-ийн бичилтээс хамаарна — offline орчинд худал. Энд
   шалгах зүйл нь `granted` ИЛ ГАРЧ БАЙГАА эсэх (урьд нь огт байхгүй байв). */
assert.equal(typeof (await rv.sync), 'boolean', '`sync` boolean буцаана');
console.log('✅ хасалтын эрх буцаалт ил гарна');

/* ── 10. SUPER-Т ХУВААРИЛАЛТ ҮЙЛЧЛЭХГҮЙ — ХОЁР ЗАМД ЧЬ ──
   `UserAdmin.flipCap` нь энэ няцаалтыг барьж, super-т эрхийг ХУУЧИН замаар
   (`toggleCap`) олгодог болов. Хэрэв хэн нэгэн `setQaqcAssign`-ийн super
   хамгаалалтыг авбал тэр салаа утгагүй болно — тиймээс энд бэхэлнэ. */
const sSet = setQaqcAssign(superName, ['Багц 1']);
assert.equal(sSet.ok, false, 'super-т хуваарилалт бичигдэхгүй');
assert.equal(sSet.sync, undefined, '`sync` БАЙХГҮЙ — дуудагч `r.ok`-г ЗААВАЛ шалгана');
assert.equal(qaqcScope(superName), null, 'super-т хүрээ хязгааргүй хэвээр');
console.log('✅ super — хуваарилалтаас үл хамаарна');

/* ── 11. БАЙГАА ХУВААРИЛАЛТЫГ ХАДГАЛАХ (UserAdmin-ы унтраалгын гэрээ) ──
   `UserAdmin.flipCap` нь унтраалга асаахад `listQaqcAssigns()`-ээс одоогийн
   багцыг уншиж ХЭВЭЭР үлдээдэг. Тэр уншилтын эх сурвалж ажиллаж байгааг
   баталгаажуулна — эс бөгөөс хүрээ чимээгүй `[*]` болж ТЭЛНЭ. */
_syncRemoteQaqc([]);
setQaqcAssign('keep_x', ['Багц 2'], false);
const cur = listQaqcAssigns().find((a) => a.user === 'keep_x');
assert.deepEqual(cur.bagts, ['Багц 2'], 'одоогийн багц уншигдана');
setQaqcAssign('keep_x', cur.bagts, false);
assert.deepEqual(qaqcScope('keep_x'), ['Багц 2'], 'дахин бичихэд хүрээ ТЭЛЭХГҮЙ');
assert.notDeepEqual(qaqcScope('keep_x'), null, 'бүх багц болж ҮСЭРЧ БОЛОХГҮЙ');
console.log('✅ унтраалга хүрээг тэлэхгүй');
console.log('\nqaqcAcl: ok — fail-closed · super · remote=үнэн · УРСГАЛААС ТУСДАА · устгалт');
