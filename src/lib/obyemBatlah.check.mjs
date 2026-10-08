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

const { parsePayload, decideObyem, OBYEM_STATUS, withdrawDeny } = await import('@/lib/obyemBatlah.ts');

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
/* ⚠️ 2026-10-04: `withdrawn` нэмэгдэв — дөрвүүлээ ялгаатай */
assert.equal(OBYEM_STATUS.withdrawn, 'Татаж авсан');
assert.equal(new Set(Object.values(OBYEM_STATUS)).size, 4, 'төлвүүд давхардав');
console.log('✅ төлвийн утгууд');

/* ══════════════ 6. ⚠️ 2026-09-30: ҮНДСЭН ӨГӨГДӨЛД БИЧИХЭЭС ӨМНӨ ДҮРЭМ ШАЛГАНА ══════════════
 * Урьд нь `useObyem.decideObyemHere` нь `applyUpdates`-аар `Инженерийн_төлөвлөсөн_обьём`-д
 * ЭХЛЭЭД бичиж, дараа нь л `decideObyem` өөрийгөө батлах · хүрээ · «аль хэдийн
 * шийдвэрлэсэн» дүрмийг шалгадаг байв — татгалзсан ч утга нь үндсэн өгөгдөлд үлдэнэ. */
fetched = 0;
const dry = await decideObyem({ oid: 1, approve: true, approver: 'Bat', author: 'bat', dryRun: true });
assert.equal(dry.ok, false, 'урьдчилсан шалгалт ч зохиогчийг татгалзах ёстой');
assert.match(dry.error, /өөрөө батлах боломжгүй/);
assert.equal(fetched, 0, 'урьдчилсан шалгалтын дүрэм сүлжээнээс ӨМНӨ');
{
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../modules/sheet/fill/useObyem.ts', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('const decideObyemHere'));
  const pre = fn.indexOf('dryRun: true');
  const write = fn.indexOf('await applyUpdates(');
  assert.ok(pre > 0, 'useObyem: `decideObyem({ dryRun: true })` урьдчилсан шалгалт АЛГА');
  assert.ok(write > 0, 'useObyem: `applyUpdates` дуудлага олдсонгүй (шалгуурыг шинэчилнэ үү)');
  assert.ok(pre < write, 'useObyem: урьдчилсан шалгалт `applyUpdates`-ээс ӨМНӨ байх ёстой');
  /* ⚠️ Бичилтийн ДАРААХ жинхэнэ шийдвэр хэвээр (дараалал: бичээд → тэмдэглэх) */
  assert.ok(fn.indexOf('const r = await decideObyem(') > write, 'useObyem: шийдвэрийн бичилт `applyUpdates`-ийн ДАРАА');
  /* ⚠️ 2026-09-30: өдөр солигдоход хүлээгдэж буй илгээлт дахин уншигдана; батлагдсан утга мөрт тусна */
  assert.ok(/useEffect\(\(\) => \{ void refreshObyem\(\); \}, \[refreshObyem, todayFillMs\]\)/.test(src),
    'useObyem: өдөр солигдоход (`todayFillMs`) хүлээгдэж буй илгээлтийг дахин уншина');
  assert.ok(fn.indexOf('setRows((rs) =>') > write, 'useObyem: батлагдсан утга хуудасны мөрт тусна');
  const fill = fs.readFileSync(new URL('../modules/sheet/FillNew.tsx', import.meta.url), 'utf8');
  assert.ok(/useObyem\(\{[^}]*todayFillMs, setRows \}\)/.test(fill), 'FillNew: useObyem-д `todayFillMs` · `setRows` дамжина');
}
console.log('✅ үндсэн өгөгдөлд бичихээс ӨМНӨ дүрэм шалгагдана · өдөр солигдоход баннер хэвээр');

/* ══════════════ 7. ⚠️ 2026-10-04: ТАТАН АВАХ — зөвхөн зохиогч, зөвхөн pending ══════════════ */
assert.equal(withdrawDeny({ status: OBYEM_STATUS.pending, author: 'Injener' }, 'injener'), null, 'зохиогч pending-ээ татна');
assert.match(withdrawDeny({ status: OBYEM_STATUS.pending, author: 'injener' }, 'batlagch'), /Зөвхөн илгээсэн инженер/);
for (const st of [OBYEM_STATUS.approved, OBYEM_STATUS.returned, OBYEM_STATUS.withdrawn]) {
  assert.match(withdrawDeny({ status: st, author: 'injener' }, 'injener'), /аль хэдийн шийдвэрлэгдсэн/, st);
}
assert.ok(withdrawDeny({ status: OBYEM_STATUS.pending, author: null }, 'injener'), 'зохиогчгүй мөрийг хэн ч татахгүй');
assert.ok(withdrawDeny({ status: OBYEM_STATUS.pending, author: 'injener' }, '  '), 'нэвтрээгүй');
{
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../modules/sheet/fill/useObyem.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('wroteMain ? afterWrite('), 'useObyem: бичигдсэний дараах шийдвэрийн алдаа «аль хэдийн бичигдсэн» гэж хэлнэ');
  const tb = fs.readFileSync(new URL('../modules/sheet/fill/toolbar.tsx', import.meta.url), 'utf8');
  assert.ok(/window\.confirm\([^]*?decideObyemHere\(true\)/.test(tb), 'toolbar: «Обьём батлах» баталгаажуулалттай');
}
console.log('✅ татан авах дүрэм · батлах баталгаа · бичилтийн дараах алдааны мессеж');

/* ══════════════ 8. ⚠️ 2026-10-09: жааз солигдсон · алгассан нүд · хоёр таб ══════════════ */
{
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../modules/sheet/fill/useObyem.ts', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('const decideObyemHere'));
  const write = fn.indexOf('await applyUpdates(');
  const decide = fn.indexOf('const r = await decideObyem(');
  /* Бичсэний ДАРАА жаазыг дахин ачаалж тулгана — `decideObyem(approve)`-ээс ӨМНӨ */
  const recheck = fn.indexOf('frameIdOf(await loadRows(');
  assert.ok(recheck > write && recheck < decide, 'useObyem: бичсэний дараах жаазын шалгалт `applyUpdates` ба `decideObyem`-ийн ХООРОНД байх ёстой');
  assert.ok(/if \(moved !== false\) \{[^]*?return;/.test(fn.slice(recheck, decide)), 'useObyem: жааз солигдсон/шалгаж чадаагүй бол шийдвэр бичихгүй');
  /* Алгассан нүд — баталгаагүйгээр батлахгүй, түгжээ/бичилтээс ӨМНӨ асууна; тэмдэглэл `skipped`-ээр */
  const ask = fn.indexOf('if (skippedN > 0)');
  assert.ok(ask > 0 && ask < fn.indexOf('claimObyem('), 'useObyem: алгассан нүдийг түгжихээс ӨМНӨ асуух ёстой');
  assert.ok(/window\.confirm\(/.test(fn.slice(ask, fn.indexOf('claimObyem('))), 'useObyem: алгассан нүдэд баталгаажуулалт алга');
  assert.ok(/skipped: skipNote/.test(fn), 'useObyem: алгассан нүдийг `decideObyem.skipped`-ээр хадгалахгүй байна');
  /* Нэг батлагч хоёр таб — «аль хэдийн шийдвэрлэсэн» ӨӨРӨӨ бол амжилт */
  assert.ok(/doneByMe\(\)/.test(fn) && /h\.status === OBYEM_STATUS\.approved && h\.approver === meLc/.test(fn), 'useObyem: ӨӨРИЙН баталсныг амжилт гэж үзэхгүй байна');
  const L = fs.readFileSync(new URL('./obyemBatlah.ts', import.meta.url), 'utf8');
  assert.ok(/export async function obyemBusyFor\(/.test(L), 'obyemBatlah: `obyemBusyFor` алга');
  assert.ok(/export async function loadHead\(/.test(L), 'obyemBatlah: `loadHead` алга');
}
console.log('✅ жааз солигдсон бол батлахгүй · алгассан нүд асууна/хадгална · хоёр таб');

console.log('\nobyemBatlah.check: ok');
