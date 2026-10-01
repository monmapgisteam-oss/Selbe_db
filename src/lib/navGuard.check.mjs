/**
 * navGuard — хадгалаагүй ажлын ерөнхий хамгаалалт (2026-09-30).
 * Шалгана: туг нэмэх/хасах, нэр жагсаалт, `beforeunload` сонсогч зөвхөн туг байхад.
 */
import assert from 'node:assert/strict';

/* Хуурамч `window` — сонсогчийг бүртгэж, дуудна */
const listeners = new Map();
globalThis.window = {
  addEventListener: (t, fn) => { listeners.set(t, fn); },
  removeEventListener: (t, fn) => { if (listeners.get(t) === fn) listeners.delete(t); },
};

const { setNavDirty, navDirtyLabels, _resetNavDirty } = await import('./navGuard.ts');

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('  ✓', name); };

ok('эхэндээ хоосон, сонсогчгүй', () => {
  assert.deepEqual(navDirtyLabels(), []);
  assert.equal(listeners.has('beforeunload'), false);
});
ok('туг тавихад нэр гарч, beforeunload бүртгэгдэнэ', () => {
  setNavDirty('gazar', true, 'Газар чөлөөлөлт');
  assert.deepEqual(navDirtyLabels(), ['Газар чөлөөлөлт']);
  assert.equal(listeners.has('beforeunload'), true);
});
ok('beforeunload нь preventDefault дуудна (хөтөч асууна)', () => {
  let prevented = false;
  listeners.get('beforeunload')({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
});
ok('хоёр харагдац — хоёулаа жагсаалтад', () => {
  setNavDirty('butets', true, 'Инженерийн дэд бүтэц');
  assert.deepEqual(navDirtyLabels().sort(), ['Газар чөлөөлөлт', 'Инженерийн дэд бүтэц'].sort());
});
ok('нэгийг арилгахад нөгөө нь үлдэж, сонсогч хэвээр', () => {
  setNavDirty('gazar', false);
  assert.deepEqual(navDirtyLabels(), ['Инженерийн дэд бүтэц']);
  assert.equal(listeners.has('beforeunload'), true);
});
ok('сүүлийнхийг арилгахад сонсогч хасагдана', () => {
  setNavDirty('butets', false);
  assert.deepEqual(navDirtyLabels(), []);
  assert.equal(listeners.has('beforeunload'), false);
});
ok('давхар тавьсан ч нэг л бичлэг', () => {
  setNavDirty('zovshoorol', true, 'Зөвшөөрөл');
  setNavDirty('zovshoorol', true, 'Зөвшөөрөл');
  assert.deepEqual(navDirtyLabels(), ['Зөвшөөрөл']);
  _resetNavDirty();
  assert.deepEqual(navDirtyLabels(), []);
  assert.equal(listeners.has('beforeunload'), false);
});

console.log(`navGuard: ${n} шалгуур ✅`);
