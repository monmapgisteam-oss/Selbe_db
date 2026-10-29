/**
 * АППЫН ДОТООД АСУУЛТ — `askConfirm` · `toastUndo` (2026-10-23, UX аудит X1).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/confirm.check.mjs
 *
 * Хамгаалж буй алдаа: `window.confirm`-ийг хөтөч хаасан бол чимээгүй `false` → «Батлах»/«Буцаах» юу ч хийхгүй.
 * Шинэ API нь хосттой үед дарааллаар асууна; хостгүй (нэгж тест · Node) үед `window.confirm` руу буцна — бусад
 * шалгууруудын `window.confirm` стуб хэвээр ажиллах ёстой.
 */
import assert from 'node:assert/strict';
import {
  askConfirm, getConfirmSnapshot, hasConfirmHost, registerConfirmHost, settleConfirm, settleToast, subscribeConfirm,
  toastUndo,
} from '@/lib/confirm';

let pass = 0;
const ok = (name, cond, detail = '') => {
  assert.ok(cond, `✗ ${name}${detail ? ' · ' + detail : ''}`);
  console.log('  ✓', name);
  pass += 1;
};
const tick = () => new Promise((r) => setTimeout(r, 0));

console.log('\n1. Хостгүй — window.confirm руу буцна');
delete globalThis.window;
ok('window ч алга → false', (await askConfirm('А?')) === false);
const asked = [];
let answer = true;
globalThis.window = { confirm: (m) => { asked.push(m); return answer; } };
ok('стуб true → true', (await askConfirm('Устгах уу?')) === true);
ok('мессеж дамжсан', asked[0] === 'Устгах уу?');
answer = false;
ok('стуб false → false', (await askConfirm('Б?', { title: 'Гарчиг' })) === false);
ok('гарчиг мессежийн өмнө', asked[1] === 'Гарчиг\n\nБ?');
globalThis.window = { confirm: () => { throw new Error('blocked'); } };
ok('confirm шидвэл → false', (await askConfirm('В?')) === false);
ok('toastUndo хостгүй → false', (await toastUndo('Устгалаа', () => {})) === false);

console.log('\n2. Хосттой — дараалал');
globalThis.window = { confirm: () => { throw new Error('хост байхад window.confirm дуудагдах ёсгүй'); } };
let emits = 0;
const unsub = subscribeConfirm(() => { emits += 1; });
const unreg = registerConfirmHost();
ok('хост бүртгэгдсэн', hasConfirmHost());
const s0 = getConfirmSnapshot();
ok('агшин тогтвортой (өөрчлөлтгүй)', getConfirmSnapshot() === s0 && s0.req === null);
const p1 = askConfirm('Нэг?', { danger: true, ok: 'Устгах' });
const p2 = askConfirm('Хоёр?');
const s1 = getConfirmSnapshot();
ok('эхний асуулт харагдана', s1.req?.message === 'Нэг?' && s1.req.opts.danger === true && s1.req.opts.ok === 'Устгах');
ok('мэдэгдэл явсан', emits >= 2);
let r2 = 'хүлээж';
void p2.then((v) => { r2 = v; });
settleConfirm(s1.req.id, true);
ok('эхнийх true', (await p1) === true);
await tick();
ok('хоёр дахь хүлээсээр', r2 === 'хүлээж');
const s2 = getConfirmSnapshot();
ok('хоёр дахь асуулт гарсан', s2.req?.message === 'Хоёр?');
settleConfirm(s1.req.id, true); // хуучин id — юу ч хийхгүй
ok('хуучин id үл тоогдоно', getConfirmSnapshot().req?.id === s2.req.id);
settleConfirm(s2.req.id, false);
ok('хоёр дахь false', (await p2) === false);
ok('дараалал хоосон', getConfirmSnapshot().req === null);

console.log('\n3. «Буцаах» мэдэгдэл');
let undone = 0;
const t1 = toastUndo('Мөр устгагдлаа', () => { undone += 1; }, 6000);
const tid1 = getConfirmSnapshot().toast?.id;
ok('мэдэгдэл харагдана', getConfirmSnapshot().toast?.message === 'Мөр устгагдлаа');
const t2 = toastUndo('Холбоо устгагдлаа', () => { undone += 10; });
ok('шинэ нь хуучныг false-оор хаана', (await t1) === false && undone === 0);
const tid2 = getConfirmSnapshot().toast?.id;
ok('шинэ мэдэгдэл харагдана', tid2 !== tid1 && getConfirmSnapshot().toast?.message === 'Холбоо устгагдлаа');
settleToast(tid1, true); // хуучин id
ok('хуучин id үл тоогдоно', getConfirmSnapshot().toast?.id === tid2 && undone === 0);
settleToast(tid2, true);
ok('Буцаах → true, onUndo дуудагдсан', (await t2) === true && undone === 10);
ok('мэдэгдэл алга', getConfirmSnapshot().toast === null);
const t3 = toastUndo('Шидэгч', () => { throw new Error('x'); });
const origErr = console.error;
console.error = () => {};
settleToast(getConfirmSnapshot().toast.id, true);
console.error = origErr;
ok('onUndo шидсэн ч Promise шийдэгдэнэ', (await t3) === true);

console.log('\n4. Хост салвал хүлээгдэж буй бүгд false');
const p3 = askConfirm('Гурав?');
const t4 = toastUndo('Дөрөв', () => { undone += 100; });
unreg();
unreg(); // давхар дуудалт — тоолуур сөрөг болохгүй
ok('асуулт false', (await p3) === false);
ok('мэдэгдэл false, onUndo дуудагдаагүй', (await t4) === false && undone === 10);
ok('хост алга', !hasConfirmHost());
ok('агшин хоосон', getConfirmSnapshot().req === null && getConfirmSnapshot().toast === null);
answer = true;
globalThis.window = { confirm: () => answer };
ok('дахин window.confirm руу буцна', (await askConfirm('Тав?')) === true);
unsub();

console.log(`\nconfirm: ${pass} шалгуур давлаа`);
