/**
 * ИНЖЕНЕРИЙН ОБЬЁМЫН БАТЛАХ УРСГАЛЫН ШАЛГУУР — offline (ArcGIS-гүй).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/obyemBatlah.check.mjs
 *
 * Хамгаалж буй дүрмүүд:
 *   1. `parsePayload` нь ЭВДЭРСЭН агуулгыг ТАТГАЛЗАНА — хагас задарсан
 *      засвар нь батлагдаагүйгээс ДОР (буруу мөрөнд обьём бичигдэнэ).
 *   2. `null` ба `0` ЯЛГААТАЙ: `null` = нүд цэвэрлэх, `0` = тэг обьём.
 *   3. ЗОХИОГЧ ӨӨРИЙГӨӨ БАТЛАХГҮЙ — шалгуур нь СҮЛЖЭЭНЭЭС ӨМНӨ ажиллана
 *      (ArcGIS уншигдахгүй орчинд ч дүрэм үйлчилнэ).
 *   4. Буцаахад шалтгаан ЗААВАЛ.
 */
import assert from 'node:assert/strict';

/* ── window shim: модуль нь `'use client'` тул браузерын орчин дүрсэлнэ ── */
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

/*
 * ⚠️ ХҮСЭЛТ ГАРАХГҮЙ БАЙХ ЁСТОЙ: `decideObyem`-ийн дүрмүүд `tableUrl`-ээс
 *    ӨМНӨ шалгагддаг гэдгийг ЭНД барина. `fetch` дуудагдвал тест унана.
 */
let fetched = 0;
globalThis.fetch = () => { fetched += 1; throw new Error('fetch дуудагдав'); };

const { parsePayload, decideObyem, OBYEM_STATUS } = await import('@/lib/obyemBatlah.ts');

/* ══════════════ 1. parsePayload — ЭВДЭРСЭН агуулгыг ТАТГАЛЗАНА ══════════════ */
assert.equal(parsePayload(''), null, 'хоосон мөр');
assert.equal(parsePayload('{'), null, 'эвдэрсэн JSON');
assert.equal(parsePayload('null'), null, 'null');
assert.equal(parsePayload('[]'), null, 'массив нь объект БИШ');
assert.equal(parsePayload('{"v":1}'), null, '`cells` алга');
assert.equal(parsePayload('{"v":1,"cells":"x"}'), null, '`cells` массив биш');

/* ⚠️ ЭЛЕМЕНТ БҮРИЙГ шалгана — нэг нь эвдэрсэн бол БҮТНЭЭР татгалзана */
assert.equal(parsePayload('{"v":1,"cells":[[1]]}'), null, 'хос биш (урт 1)');
assert.equal(parsePayload('{"v":1,"cells":[[1,2,3]]}'), null, 'хос биш (урт 3)');
assert.equal(parsePayload('{"v":1,"cells":[["a",5]]}'), null, 'oid нь тоо биш');
assert.equal(parsePayload('{"v":1,"cells":[[1.5,5]]}'), null, 'oid нь бүхэл биш');
assert.equal(parsePayload('{"v":1,"cells":[[1,"5"]]}'), null, 'утга нь мөр');
assert.equal(parsePayload('{"v":1,"cells":[[1,null],[2,"x"]]}'), null,
  'НЭГ элемент эвдэрсэн бол БҮТНЭЭР татгалзана');
console.log('✅ parsePayload — эвдэрсэн агуулгыг татгалзана');

/* ══════════════ 2. `null` ба `0` ЯЛГААТАЙ ══════════════ */
const ok = parsePayload('{"v":1,"pkgKey":"b2_9f","cells":[[10,453],[11,null],[12,0]]}');
assert.notEqual(ok, null, 'зөв агуулга задрах ёстой');
assert.equal(ok.pkgKey, 'b2_9f');
assert.deepEqual(ok.cells, [[10, 453], [11, null], [12, 0]]);
assert.equal(ok.cells[1][1], null, '`null` = нүд цэвэрлэх');
assert.equal(ok.cells[2][1], 0, '`0` = тэг обьём (цэвэрлэх БИШ)');
assert.notEqual(ok.cells[1][1], ok.cells[2][1], '`null` ба `0` нэгдэж болохгүй');

/* Хоосон жагсаалт нь ХҮЧИНТЭЙ (задрах ёстой) — илгээхийг `submitObyem` хаана */
const empty = parsePayload('{"v":1,"pkgKey":"b1_9f","cells":[]}');
assert.notEqual(empty, null, 'хоосон cells нь задрах ёстой');
assert.deepEqual(empty.cells, []);
console.log('✅ null ≠ 0 · хоосон жагсаалт');

/* ══════════════ 3. ЗОХИОГЧ ӨӨРИЙГӨӨ БАТЛАХГҮЙ ══════════════ */
fetched = 0;
const self = await decideObyem({
  oid: 1, approve: true, approver: 'Bat', author: 'bat',
});
assert.equal(self.ok, false, 'зохиогч өөрийгөө баталлаа');
assert.match(self.error, /өөрөө батлах боломжгүй/, 'шалтгаан тодорхой байх ёстой');
assert.equal(fetched, 0, '⚠️ ДҮРЭМ СҮЛЖЭЭНЭЭС ӨМНӨ шалгагдах ёстой');

/* Том/жижиг үсэг ба зай ялгахгүй */
const self2 = await decideObyem({
  oid: 1, approve: false, approver: '  BAT  ', author: 'bat', reason: 'болохгүй',
});
assert.equal(self2.ok, false, 'зай/үсгийн хэлбэр дүрмийг тойрлоо');
assert.equal(fetched, 0);
console.log('✅ зохиогч өөрийгөө батлахгүй (сүлжээнээс ӨМНӨ)');

/* ══════════════ 4. БУЦААХАД ШАЛТГААН ЗААВАЛ ══════════════ */
fetched = 0;
const noReason = await decideObyem({
  oid: 1, approve: false, approver: 'batlagch', author: 'injener',
});
assert.equal(noReason.ok, false, 'шалтгаангүй буцаалт өнгөрлөө');
assert.match(noReason.error, /шалтгаан/i);
assert.equal(fetched, 0, 'энэ дүрэм ч сүлжээнээс ӨМНӨ');

const blank = await decideObyem({
  oid: 1, approve: false, approver: 'batlagch', author: 'injener', reason: '   ',
});
assert.equal(blank.ok, false, 'зөвхөн зайнаас бүрдсэн шалтгаан өнгөрлөө');
assert.equal(fetched, 0);
console.log('✅ буцаахад шалтгаан заавал');

/* ══════════════ 5. Төлвийн утгууд ══════════════ */
assert.equal(OBYEM_STATUS.pending, 'Хүлээгдэж буй');
assert.equal(OBYEM_STATUS.approved, 'Батлагдсан');
assert.equal(OBYEM_STATUS.returned, 'Буцаагдсан');
/* ⚠️ Гурвуулаа ЯЛГААТАЙ байх ёстой — нийлбэл урсгал таних боломжгүй болно */
assert.equal(new Set(Object.values(OBYEM_STATUS)).size, 3, 'төлвүүд давхардав');
console.log('✅ төлвийн утгууд');

console.log('\nobyemBatlah.check: ok');
