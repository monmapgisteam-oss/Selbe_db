/**
 * ХЯНАЛТЫН ЭРХИЙН ЦЭВЭР ХЭСГҮҮД — илгээгчийн дүрэм ба «хариу алдагдсан» ангилал. Сүлжээгүй, `window`-гүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/hyanaltAuthz.check.mjs
 *
 * ⚠️ 2026-10-09 (аудит №2): хамгаалж буй дүрмүүд (`hyanaltStore.ts`):
 *   1. `submitterDeny` (`authz.submitters`) — инженер ӨӨРИЙН илгээсэн гүйцэтгэлийг батлахгүй;
 *      бусад шат / илгээгч биш хэрэглэгч → чөлөөтэй; илгээгчгүй (хуучин мөр, legacy) → шалгахгүй.
 *   2. `lostWrite` — `hyanalt.post` нь `ArcGISError`-ийг `HyanaltError`-оор ороодог тул `cause`-ыг ч
 *      шалгана: код/статусгүй (JSON биш хариу, 5xx) → «алдагдсан» (үр дүн тодорхойгүй); 400/403 ба
 *      ArcGIS код (498 …), `sessionExpired` → тодорхой татгалзал («алдагдаагүй»).
 */
import assert from 'node:assert/strict';
import { lostWrite, submitterDeny } from './hyanaltStore.ts';
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
ok('инженерээс бусад шат (илгээгч ч бай) → шалгахгүй', () => {
  for (const st of ['manager', 'director', 'head', 'chief']) {
    assert.equal(submitterDeny(st, 'bat', ['bat']), null, st);
  }
});
ok('хуучин мөр (илгээгчгүй — undefined / []) → шалгахгүй', () => {
  assert.equal(submitterDeny('engineer', 'bat', undefined), null);
  assert.equal(submitterDeny('engineer', 'bat', []), null);
});

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
