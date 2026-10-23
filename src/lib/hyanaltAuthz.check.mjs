/**
 * ХЯНАЛТЫН ЭРХИЙН ЦЭВЭР ХЭСГҮҮД — илгээгчийн дүрэм ба «хариу алдагдсан» ангилал. Сүлжээгүй, `window`-гүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/hyanaltAuthz.check.mjs
 *
 * ⚠️ 2026-10-09 (аудит №2): хамгаалж буй дүрмүүд (`hyanaltStore.ts`):
 *   1. `submitterDeny` (`authz.submitters`) — илгээгч ӨӨРИЙН илгээсэн гүйцэтгэлийг АЛЬ Ч шатанд батлахгүй
 *      (2026-10-19 — урьд нь зөвхөн инженер); илгээгч биш → чөлөөтэй; илгээгчгүй (legacy) → шалгахгүй.
 *   1б. `selfApprovalDeny` (2026-10-19, аудит №4–5) — нэг тойрогт (хяналтын мөрийн лог) ӨӨР шатанд зөвшөөрсөн
 *      данс дахин батлахгүй (шат шилжсэн ч); ижил шатыг дахин батлах — хэвийн; `u`-гүй логт доод шатуудын
 *      дэлгэцийн нэрээр нөөц шалгалт. ⚠️ Хатуу super ЧӨЛӨӨТЭЙ (хэрэглэгчийн шийдвэр 2026-10-19 — бүх шатыг турших):
 *      цэвэр функц хэнийг ч ялгадаггүй (super-т ч татгалзана), харин `authz`-ийн bypass салаа түүнийг ДУУДАХГҮЙ.
 *   2. `lostWrite` — `hyanalt.post` нь `ArcGISError`-ийг `HyanaltError`-оор ороодог тул `cause`-ыг ч
 *      шалгана: код/статусгүй (JSON биш хариу, 5xx) → «алдагдсан» (үр дүн тодорхойгүй); 400/403 ба
 *      ArcGIS код (498 …), `sessionExpired` → тодорхой татгалзал («алдагдаагүй»).
 */
import assert from 'node:assert/strict';
import { approvedStagesOf, lostWrite, selfApprovalDeny, submitterDeny } from './hyanaltStore.ts';
import { F, SF } from './hyanalt.ts';
import { HyanaltError } from './hyanalt.ts';
import { ArcGISError } from './query.ts';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };

console.log('submitterDeny (authz.submitters):');
ok('инженер илгээгчдийн дунд → татгалзана', () => {
  assert.equal(typeof submitterDeny('engineer', 'bat', ['dorj', 'bat']), 'string');
});
ok('инженер илгээгч биш → зөвшөөрнө', () => {
  assert.equal(submitterDeny('engineer', 'bat', ['dorj']), null);
});
ok('2026-10-19: инженерээс бусад шатанд ч илгээгч → татгалзана (super компани болж илгээсэн ч)', () => {
  for (const st of ['manager', 'director', 'head', 'chief']) {
    assert.equal(typeof submitterDeny(st, 'bat', ['bat']), 'string', st);
    assert.equal(submitterDeny(st, 'bat', ['dorj']), null, st);
  }
});
ok('хуучин мөр (илгээгчгүй — undefined / []) → шалгахгүй', () => {
  assert.equal(submitterDeny('engineer', 'bat', undefined), null);
  assert.equal(submitterDeny('engineer', 'bat', []), null);
});

console.log('selfApprovalDeny (нэг тойрогт хоёр шат):');
const ev = (stage, act, u, at) => ({ stage, who: u ? u.toUpperCase() : 'X', at, act, ...(u ? { u } : {}) });
const H = (...es) => JSON.stringify(es);
ok('approvedStagesOf — зөвхөн ЗӨВШӨӨРСӨН (approve · recheck-ok), тухайн дансны, давхардалгүй', () => {
  const h = H(ev('engineer', 'approve', 'bat', 1), ev('manager', 'return', 'bat', 2), ev('engineer', 'recheck-ok', 'bat', 3),
    ev('director', 'approve', 'dorj', 4));
  assert.deepEqual(approvedStagesOf(h, 'BAT '), ['engineer']);
  assert.deepEqual(approvedStagesOf(h, 'dorj'), ['director']);
  assert.deepEqual(approvedStagesOf('эвдэрсэн', 'bat'), []);
});
ok('инженерээр баталсан данс шат шилжээд төлөвлөлтийн ахлах инженер (director) болж ДАХИН батлахгүй (аудит №5)', () => {
  const h = H(ev('engineer', 'approve', 'bat', 1), ev('manager', 'approve', 'dorj', 2));
  assert.equal(typeof selfApprovalDeny('director', 'bat', h), 'string');
  assert.match(selfApprovalDeny('director', 'bat', h), /хоёр шатанд/);
  assert.equal(selfApprovalDeny('director', 'tsetseg', h), null, 'өөр данс → чөлөөтэй');
});
ok('дараалсан шат — урьдын «өмнөх шат» мессеж', () => {
  const h = H(ev('engineer', 'approve', 'bat', 1));
  assert.match(selfApprovalDeny('manager', 'bat', h), /Өмнөх шатыг/);
});
ok('ИЖИЛ шатыг дахин (дээд шат буцаасны дараа) батлах — хэвийн', () => {
  const h = H(ev('engineer', 'approve', 'bat', 1), ev('manager', 'return', 'dorj', 2));
  assert.equal(selfApprovalDeny('engineer', 'bat', h), null);
});
ok('цэвэр дүрэм хэнийг ч ялгахгүй — нэг дансаар дараалсан шат: 2 дахь шатнаас татгалзана (аудит №4)', () => {
  /* ⚠️ 2026-10-19 (хэрэглэгчийн шийдвэр): хатуу super-ийг энэ дүрмээс `authz`-ийн bypass салаа ЧӨЛӨӨЛНӨ (функцийг
     дуудахгүй — эх кодоор доор). Энд зөвхөн цэвэр функц: дуудагдвал данс хэн ч байсан татгалзана. */
  const h = H(ev('engineer', 'approve', 'boss', 1));
  for (const st of ['manager', 'director', 'head', 'chief']) assert.equal(typeof selfApprovalDeny(st, 'boss', h), 'string', st);
  assert.equal(typeof selfApprovalDeny('engineer', 'boss', H(), undefined, ['boss']), 'string', 'илгээгч өөрөө батлах');
});
ok('буцаах чиглэл (hist undefined) — зөвхөн илгээгчийн дүрэм', () => {
  assert.equal(selfApprovalDeny('chief', 'bat', undefined), null);
});
ok('`u`-гүй лог (R5): доод шатуудын дэлгэцийн нэрээр нөөц — ӨМНӨХ ба ТҮҮНЭЭС ДООШ', () => {
  const row = { [SF.engineer.who]: 'Бат', [SF.manager.who]: 'Дорж', [F.history]: '' };
  assert.match(selfApprovalDeny('director', 'x', '', { row, who: ' бат ' }), /хоёр шатанд/, 'инженерийн нэр');
  assert.match(selfApprovalDeny('director', 'x', '', { row, who: 'Дорж' }), /Өмнөх шатыг/, 'менежерийн нэр');
  assert.equal(selfApprovalDeny('director', 'x', '', { row, who: 'Цэцэг' }), null);
  /* `u`-тай зөвшөөрөл байгаа шатанд нэрээр шалгахгүй (нэр давхцах эрсдэлгүй) */
  const h = H(ev('engineer', 'approve', 'bat2', 1));
  assert.equal(selfApprovalDeny('director', 'x', h, { row, who: 'Бат' }), null);
});
{
  /* ⚠️ Эх кодоор. 2026-10-19 (ХЭРЭГЛЭГЧИЙН ШИЙДВЭР): хатуу super (bypass) гүйцэтгэлийн бүх шатыг ганцаараа
     туршина — `authz`-ийн bypass салаа self-approval-ыг АЛГАСНА, илгээгчийг уншихгүй. Энгийн хэрэглэгчид
     `selfApprovalDeny` бүх шатанд хэвээр (дээрх цэвэр шалгуурууд). */
  const S = (await import('node:fs')).readFileSync('src/lib/hyanaltStore.ts', 'utf8');
  ok('authz: bypass (хатуу super) → турших эрх, self-approval алгасна', () => {
    assert.ok(/if \(by\) return null;/.test(S), 'super-ийн турших салаа алга');
    assert.ok(S.includes('return selfApprovalDeny(stage, u, hist, same, submitters);'), 'энгийн хэрэглэгчийн дүрэм алга');
    /* bypass салаа `selfApprovalDeny`-ээс ӨМНӨ — super-т дүрэм хэзээ ч хүрэхгүй */
    const az = S.slice(S.indexOf('if (by) return null;'));
    assert.ok(az.indexOf('return selfApprovalDeny(') > 0, 'bypass салаа selfApprovalDeny-ийн ДАРАА болов');
    /* ⚠️ Зөрчилтэй тайлбар буцаж орохгүй (2026-10-19 аудит №2) */
    assert.ok(!S.includes('ӨӨРИЙГӨӨ БАТЛАХ дүрмийг (`selfApprovalDeny`) БИШ'), 'bypass «selfApprovalDeny-г чөлөөлөхгүй» гэсэн хуучин тайлбар');
    assert.ok(!S.includes('мөн `bypass`\n * (хатуу super) үед ч үйлчилнэ'), 'selfApprovalDeny-ийн doc super-т үйлчилнэ гэсэн хэвээр');
  });
  ok('submittersFor: инженер шатаар хязгаарлагдаагүй, super-т уншихгүй', () => {
    const fn = S.slice(S.indexOf('async function submittersFor('), S.indexOf('async function submittersOfRow('));
    assert.ok(!fn.includes("stage !== 'engineer'"), fn);
    /* ⚠️ 2026-10-19 (аудит): чөлөөлөлт ЗӨВХӨН хатуу super (эсвэл нэвтрэлтгүй дев) — `_bypass` ганцаараа хангалтгүй */
    assert.ok(fn.includes("if (_bypass && (!AUTH.appId || roleForUser(meOf(me)) === 'super')) return { ok: true };"), fn);
    assert.ok(!fn.includes('if (_bypass) return { ok: true };'), 'нүцгэн `_bypass` чөлөөлөлт буцаж орсон');
  });
}

console.log('lostWrite:');
const URL_ = 'https://example.invalid/FeatureServer/0/applyEdits';
const wrap = (cause) => new HyanaltError('бичилт унав', cause);
ok('HyanaltError ← ArcGISError (код/статусгүй) → алдагдсан', () => {
  assert.equal(lostWrite(wrap(new ArcGISError('JSON биш хариу', URL_))), true);
});
ok('HyanaltError ← ArcGISError HTTP 500 → алдагдсан', () => {
  assert.equal(lostWrite(wrap(new ArcGISError('HTTP 500', URL_, undefined, undefined, false, 500))), true);
});
ok('HyanaltError ← ArcGISError HTTP 400 / 403 → алдагдаагүй (тодорхой татгалзал)', () => {
  assert.equal(lostWrite(wrap(new ArcGISError('HTTP 400', URL_, undefined, undefined, false, 400))), false);
  assert.equal(lostWrite(wrap(new ArcGISError('HTTP 403', URL_, undefined, undefined, false, 403))), false);
});
ok('ArcGIS код (400 / 498) ба sessionExpired → алдагдаагүй', () => {
  assert.equal(lostWrite(wrap(new ArcGISError('Unable', URL_, 400))), false);
  assert.equal(lostWrite(wrap(new ArcGISError('Invalid token', URL_, 498))), false);
  assert.equal(lostWrite(wrap(new ArcGISError('expired', URL_, undefined, undefined, true))), false);
});
ok('шалтгаангүй HyanaltError / энгийн Error → алдагдаагүй', () => {
  assert.equal(lostWrite(new HyanaltError('Талбарын жагсаалт ирсэнгүй')), false);
  assert.equal(lostWrite(new Error('x')), false);
  assert.equal(lostWrite(null), false);
});
ok('шууд TypeError (сүлжээ) ба ороосон TypeError → алдагдсан', () => {
  assert.equal(lostWrite(new TypeError('Failed to fetch')), true);
  assert.equal(lostWrite(wrap(new TypeError('Failed to fetch'))), true);
});

console.log(`hyanaltAuthz: ${n} шалгуур давлаа`);
