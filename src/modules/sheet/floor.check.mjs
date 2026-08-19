/**
 * «Гүйцэтгэл буурахгүй» хязгаарыг шалгана.
 *   node src/modules/sheet/floor.check.mjs
 *
 * Хамгаалж буй алдаа: талбарын тайлан бол хуримтлагдсан хувь тул нүдэнд өмнөх
 * бүртгэлээсээ БАГА утга орж болохгүй. Хоосон (нүд устгах) ба тоо биш утга
 * хязгаарт хамаарахгүй — тэдгээр нь тусдаа урсгал.
 */
import assert from 'node:assert/strict';

// Pivot.tsx-ийн хуулбар — тэндээ өөрчилвөл ЭНДЭЭ ч өөрчил.
// ⚠️ FillNew.tsx-ийн commit() мөн ИЖИЛ дүрмээр (хоосон = чөлөөтэй, хязгаар нь
// ХАДГАЛАГДСАН утга) шалгадаг ч in-place загвартаа тохируулж хатуу хориглохын
// оронд window.confirm-оор баталгаажуулдаг — дүрэм өөрчилбөл түүнийг ч шинэчил.
const floorOf = (row, bld) => {
  const p = row.cells[bld]?.pct;
  return p == null ? null : Math.round(p * 100);
};
const belowFloor = (row, bld, raw) => {
  const t = raw.trim();
  const floor = floorOf(row, bld);
  if (t === '' || floor == null) return null;
  const v = Number(t);
  return Number.isFinite(v) && v < floor ? floor : null;
};

const row = { cells: { '5/1 барилга': { pct: 0.6 }, '5/2 барилга': { pct: null } } };
const A = '5/1 барилга';   // 60% бүртгэгдсэн
const B = '5/2 барилга';   // хоосон нүд
const C = '5/3 барилга';   // огт байхгүй нүд

assert.equal(belowFloor(row, A, '59'), 60, '60%-иас бага бол хязгаарыг буцаана');
assert.equal(belowFloor(row, A, '0'), 60, '0 нь мөн хориотой');
assert.equal(belowFloor(row, A, '60'), null, 'тэнцүү бол зөвшөөрнө');
assert.equal(belowFloor(row, A, '61'), null, 'өсгөвөл зөвшөөрнө');
assert.equal(belowFloor(row, A, ' 100 '), null, 'зайг тайрна');
assert.equal(belowFloor(row, A, ''), null, 'хоосон = нүд устгах, хязгаар хамаарахгүй');
assert.equal(belowFloor(row, A, 'x'), null, 'тоо биш утга энд шүүгдэхгүй');
assert.equal(belowFloor(row, B, '0'), null, 'бүртгэлгүй нүдэнд хязгаар байхгүй');
assert.equal(belowFloor(row, C, '0'), null, 'байхгүй нүдэнд хязгаар байхгүй');

// 0.5%-ийн нарийвчлал: харагдац бүхэл хувь тул хязгаар нь ДҮГНЭСЭН утга.
assert.equal(belowFloor({ cells: { x: { pct: 0.605 } } }, 'x', '60'), 61, '60.5% → 61%');
assert.equal(belowFloor({ cells: { x: { pct: 0.604 } } }, 'x', '60'), null, '60.4% → 60%');

console.log('floor.check: ok');
