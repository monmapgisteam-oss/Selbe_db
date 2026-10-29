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
assert.equal(OBYEM_STATUS.withdrawn, 'Татаж авсан');
assert.equal(new Set(Object.values(OBYEM_STATUS)).size, 4, 'төлвүүд давхардав');
console.log('✅ төлвийн утгууд');

/* ══════════════ 6. 2026-09-30: ҮНДСЭН ӨГӨГДӨЛД БИЧИХЭЭС ӨМНӨ ДҮРЭМ ШАЛГАНА ══════════════
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
  assert.ok(fn.indexOf('const r = await decideObyem(') > write, 'useObyem: шийдвэрийн бичилт `applyUpdates`-ийн ДАРАА');
  assert.ok(/useEffect\(\(\) => \{ void refreshObyem\(\); \}, \[refreshObyem, todayFillMs\]\)/.test(src),
    'useObyem: өдөр солигдоход (`todayFillMs`) хүлээгдэж буй илгээлтийг дахин уншина');
  assert.ok(fn.indexOf('setRows((rs) =>') > write, 'useObyem: батлагдсан утга хуудасны мөрт тусна');
  const fill = fs.readFileSync(new URL('../modules/sheet/FillNew.tsx', import.meta.url), 'utf8');
  assert.ok(/useObyem\(\{[^}]*todayFillMs, setRows \}\)/.test(fill), 'FillNew: useObyem-д `todayFillMs` · `setRows` дамжина');
}
console.log('✅ үндсэн өгөгдөлд бичихээс ӨМНӨ дүрэм шалгагдана · өдөр солигдоход баннер хэвээр');

/* ══════════════ 7. 2026-10-04: ТАТАН АВАХ — зөвхөн зохиогч, зөвхөн pending ══════════════ */
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
  assert.ok(/askConfirm\([^]*?decideObyemHere\(true\)/.test(tb), 'toolbar: «Обьём батлах» баталгаажуулалттай');
}
console.log('✅ татан авах дүрэм · батлах баталгаа · бичилтийн дараах алдааны мессеж');

/* ══════════════ 8. 2026-10-09: жааз солигдсон · алгассан нүд · хоёр таб ══════════════ */
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
  assert.ok(/askConfirm\(/.test(fn.slice(ask, fn.indexOf('claimObyem('))), 'useObyem: алгассан нүдэд баталгаажуулалт алга');
  assert.ok(/skipped: skipNote/.test(fn), 'useObyem: алгассан нүдийг `decideObyem.skipped`-ээр хадгалахгүй байна');
  /* Нэг батлагч хоёр таб — «аль хэдийн шийдвэрлэсэн» ӨӨРӨӨ бол амжилт */
  assert.ok(/doneByMe\(\)/.test(fn) && /h\.status === OBYEM_STATUS\.approved && h\.approver === meLc/.test(fn), 'useObyem: ӨӨРИЙН баталсныг амжилт гэж үзэхгүй байна');
  const L = fs.readFileSync(new URL('./obyemBatlah.ts', import.meta.url), 'utf8');
  assert.ok(/export async function obyemBusyFor\(/.test(L), 'obyemBatlah: `obyemBusyFor` алга');
  assert.ok(/export async function loadHead\(/.test(L), 'obyemBatlah: `loadHead` алга');
  const rs = L.slice(L.indexOf('export async function returnStuckObyem('), L.indexOf('export function withdrawDeny('));
  assert.ok(rs.length > 0 && rs.indexOf('casObyemClaim(') > 0 && rs.indexOf('casObyemClaim(') < rs.indexOf('[F.status]: OBYEM_STATUS.returned'), 'returnStuckObyem: бичихээс өмнө CAS түгжээ алга');
  assert.ok(rs.includes('partialBy(curStatus') && rs.includes('${OBYEM_STUCK_PREFIX_SRC}\\n${why}') && !rs.includes('OBYEM_STUCK_PREFIX()'),
    'returnStuckObyem: зөвхөн хагас бичигдсэнд · эх текстийн угтвартай шалтгаан');
  const bz = L.slice(L.indexOf('export async function obyemBusyFor('), L.indexOf('export async function releaseObyemClaim('));
  assert.ok(/HEAD_FIELDS|CLAIM_FIELDS/.test(bz) && /,\s*true,\s*\)/.test(bz), 'obyemBusyFor: strict query биш (fail-open)');
  const mp = L.slice(L.indexOf('export async function markObyemPartial('), L.indexOf('export async function clearObyemPartial('));
  const mpRead = mp.indexOf('await query(');
  const mpWrite = mp.indexOf('await arcgisPost(');
  assert.ok(mpRead > 0 && mpWrite > mpRead, 'markObyemPartial: бичихээс өмнө мөрийг дахин уншихгүй байна');
  assert.ok(/st !== OBYEM_STATUS\.pending\) return \{ ok: false/.test(mp.slice(0, mpWrite)), 'markObyemPartial: pending биш мөрөнд тэмдэг бичиж байна');
  assert.ok(/claimHolder\(cur\);\s*if \(h !== me\)/.test(mp.slice(0, mpWrite)), 'markObyemPartial: өөрийн түгжээгүй мөрөнд тэмдэг бичиж байна');
  assert.ok(mp.indexOf('await query(', mpWrite) > 0 && /claimHolder\(back\) !== me \|\| \(s\(back\[F\.reason\]\) \?\? ''\)\.trim\(\) !== mark/.test(mp), 'markObyemPartial: бичсэний дараа тэмдэг суусныг тулгахгүй байна');
  const cl = L.slice(L.indexOf('export async function claimObyem('), L.indexOf('export async function obyemApproveGuard('));
  assert.ok(cl.indexOf('obyemAuthzDeny(') > 0 && cl.indexOf('obyemAuthzDeny(') < cl.indexOf('casObyemClaim('), 'claimObyem: хүрээ/зохиогч шалгалгүй түгжиж байна');
  assert.ok(mp.indexOf('obyemAuthzDeny(') > 0 && mp.indexOf('obyemAuthzDeny(') < mp.indexOf('claimHolder(cur)'), 'markObyemPartial: хүрээ/зохиогч шалгалгүй тэмдэг тавьж байна');
  const az = L.slice(L.indexOf('function obyemAuthzDeny('), L.indexOf('export async function claimObyem('));
  assert.ok(/obyemScope\(meNow \?\? me, 'approver'\)/.test(az) && /me === author/.test(az), 'obyemAuthzDeny: хүрээ ба зохиогч дүрэм дутуу');
  assert.ok(/written === 0 && !isLostWrite\(e\)/.test(fn), 'useObyem: хариу алдагдсан үед хагас бичилтийн тэмдгийг арилгаж байна');
  assert.ok(/refreshSeq\.current !== seq/.test(src), 'useObyem: refreshObyem-д дуудлагын дараалал алга');
  const a0 = fn.indexOf('const ab0 = await archBusy()');
  const a1 = fn.indexOf('const ab1 = await archBusy()');
  assert.ok(a0 > 0 && a0 < fn.indexOf('await claimObyem('), 'useObyem: архивлалтын шалгалт түгжихээс ӨМНӨ алга');
  assert.ok(a1 > fn.indexOf('await markObyemPartial(') && a1 < write, 'useObyem: архивлалтын шалгалт applyUpdates-ийн ЯГ ӨМНӨ алга');
  assert.ok(/await clearObyemPartial\(pvSub\.oid, me\);\s*pvErrHere\(ab1\)/.test(fn), 'useObyem: архивлалтад татгалзахад хагас бичилтийн тэмдгийг (эзэнтэй) арилгахгүй байна');
  const ab = fn.slice(fn.indexOf('const archBusy'), a0);
  assert.ok(/catch \(e\) \{\s*return tr\(/.test(ab), 'useObyem: архивлалтын төлөв уншигдахгүй бол хаахгүй (fail-open)');
}
/* ── 2026-10-09: `isLostWrite` = `butetsEdit.isLostResponse` (тодорхой татгалзал ≠ хариу алдагдсан) ── */
{
  const { isLostWrite } = await import('@/lib/lostWrite.ts');
  const { isLostResponse } = await import('@/lib/butetsEdit.ts');
  const { ArcGISError } = await import('@/lib/query.ts');
  const E = (status, code, expired = false) => new ArcGISError('x', 'u', code, undefined, expired, status);
  const cases = [
    [new TypeError('Failed to fetch'), true],
    [Object.assign(new Error('t'), { name: 'TimeoutError' }), true],
    [E(undefined, undefined), true], // JSON биш хариу / timeout
    [E(502), true], [E(500), true],
    [E(400), false], [E(401), false], [E(403), false], [E(404), false],
    [E(undefined, 498, true), false], [E(undefined, 499), false], [E(undefined, 400), false],
    [new Error('success:false'), false],
  ];
  for (const [e, want] of cases) {
    assert.equal(isLostWrite(e), want, `isLostWrite(${e.message} ${e.status ?? ''} ${e.code ?? ''})`);
    assert.equal(isLostWrite(e), isLostResponse(e), `isLostWrite ≠ isLostResponse (${e.message} ${e.status ?? ''})`);
  }
}
console.log('✅ жааз солигдсон бол батлахгүй · алгассан нүд асууна/хадгална · хоёр таб');
console.log('✅ архивлалтын хаалт · isLostWrite = isLostResponse');

/* ══ 2026-10-12 (дарааллын аудит): хуваарийн загвар обьёмд — serverNow · claimAt · existing · эзэнтэй clear · withdraw CAS ══ */
{
  const fs = await import('node:fs');
  const L = fs.readFileSync(new URL('./obyemBatlah.ts', import.meta.url), 'utf8');
  const U = fs.readFileSync(new URL('../modules/sheet/fill/useObyem.ts', import.meta.url), 'utf8');
  /* (d) серверийн цаг — `huvaariBatlah.serverNow` импорт; `claimHolder`/`casObyemClaim`-ийн анхдагч; `Date.now()` зөвхөн `authorSent`-д */
  assert.ok(/import \{[^}]*\bserverNow\b[^}]*\} from '\.\/huvaariBatlah'/.test(L), 'obyemBatlah: `serverNow`-ыг huvaariBatlah-аас импортлоогүй');
  assert.ok(/function claimHolder\(a: Attrs, now = serverNow\(\)\)/.test(L), 'claimHolder: анхдагч нь серверийн цаг биш');
  assert.ok(/const now = io\.now \?\? serverNow;/.test(L), 'casObyemClaim: анхдагч нь серверийн цаг биш');
  const dn = L.split('\n').filter((ln) => ln.includes('Date.now()'));
  assert.ok(dn.length === 1 && dn[0].includes('authorSent'), `obyemBatlah: Date.now() үлдсэн — ${dn.join(' | ')}`);
  const HB = fs.readFileSync(new URL('./huvaariBatlah.ts', import.meta.url), 'utf8');
  assert.ok(!/from '\.\/obyemBatlah'/.test(HB), 'huvaariBatlah → obyemBatlah тойрог импорт');
  /* (c) `claimObyem` агшин буцаана; guard/mark/decide `claimAt` тулгана (`sameClaimAt`) */
  assert.ok(/export async function claimObyem\([^)]*\): Promise<\{ ok: boolean; error\?: string; at\?: number \}>/.test(L), 'claimObyem: `at` буцаахгүй');
  const ag = L.slice(L.indexOf('export async function obyemApproveGuard('), L.indexOf('export async function obyemBusyFor('));
  assert.ok(/claimAt\?: number/.test(ag) && /sameClaimAt\(cur\[0\]\[F\.approverAt\], args\.claimAt\)/.test(ag), 'obyemApproveGuard: claimAt тулгахгүй');
  const mp = L.slice(L.indexOf('export async function markObyemPartial('), L.indexOf('export async function clearObyemPartial('));
  assert.ok((mp.match(/sameClaimAt\((cur|back)\[F\.approverAt\], args\.claimAt\)/g) ?? []).length === 2, 'markObyemPartial: claimAt-ыг бичихийн өмнө ба дараа тулгахгүй');
  const dc = L.slice(L.indexOf('export async function decideObyem('), L.indexOf('export const OBYEM_STUCK_PREFIX'));
  assert.ok(/holder === me && args\.claimAt != null && !sameClaimAt\(/.test(dc), 'decideObyem: claimAt тулгахгүй');
  /* (b) байгаа тэмдгийг дарахгүй (`existing`); `clearObyemPartial(oid, owner)` эзэнтэй */
  const mpWrite = mp.indexOf('await arcgisPost(');
  assert.ok(/const had = partialBy\(st, s\(cur\[F\.reason\]\)\);\s*if \(had != null\) return \{ ok: true, existing: had \};/.test(mp.slice(0, mpWrite)), 'markObyemPartial: байгаа тэмдгийг дарж бичиж байна');
  const cp = L.slice(L.indexOf('export async function clearObyemPartial('), L.indexOf('export async function decideObyem('));
  assert.ok(/clearObyemPartial\(oid: number, owner\?: string\)/.test(cp) && /if \(owner != null && pb !== owner\.trim\(\)\.toLowerCase\(\)\) return false;/.test(cp), 'clearObyemPartial: эзэнгүй арилгаж байна');
  /* useObyem: claimAt дамжуулна · толгойд/`existing` тэмдэг байвал wroteSomeRef · эзэнтэй clear */
  const fn = U.slice(U.indexOf('const decideObyemHere'));
  assert.ok(/claimAt = claim\.at;/.test(fn), 'useObyem: claimObyem.at-ыг хадгалахгүй');
  assert.ok(/obyemApproveGuard\(\{ oid: pvSub\.oid, approver: me, claimAt \}\)/.test(fn), 'useObyem: obyemApproveGuard-д claimAt алга');
  assert.ok(/markObyemPartial\(\{ oid: pvSub\.oid, approver: me, claimAt \}\)/.test(fn), 'useObyem: markObyemPartial-д claimAt алга');
  assert.ok(/\.\.\.\(claimAt != null \? \{ claimAt \} : \{\}\),/.test(fn), 'useObyem: decideObyem-д claimAt алга');
  assert.ok(/obyemPartialBy\(h0\.status, h0\.reason\) != null\) wroteSomeRef\.current = true;/.test(fn), 'useObyem: толгойд байсан тэмдэгт wroteSomeRef тарихгүй');
  assert.ok(/if \(mk\.existing\) wroteSomeRef\.current = true;/.test(fn), 'useObyem: existing тэмдэгт wroteSomeRef тарихгүй');
  assert.ok(!/clearObyemPartial\(pvSub\.oid\)/.test(fn), 'useObyem: эзэнгүй clearObyemPartial үлдсэн');
  /* (a) withdrawObyem — CAS → дахин унш (pending · тэмдэггүй · түгжээ минийх) → withdrawn → дахин уншиж батална; унавал release */
  const wd = L.slice(L.indexOf('export async function withdrawObyem('), L.indexOf('const BADGE_TTL'));
  const cas = wd.indexOf('casObyemClaim(');
  const wr = wd.indexOf('[F.status]: OBYEM_STATUS.withdrawn');
  assert.ok(cas > 0 && wr > cas, 'withdrawObyem: бичихээс өмнө CAS түгжээ алга');
  const mid = wd.slice(cas, wr);
  assert.ok(/partialBy\(s\(re\[F\.status\]\), s\(re\[F\.reason\]\)\)/.test(mid), 'withdrawObyem: CAS-ийн дараа хагас бичилтийн тэмдгийг дахин шалгахгүй');
  assert.ok(/claimHolder\(re\) !== me \|\| at0 == null \|\| !sameClaimAt\(re\[F\.approverAt\], at0\)/.test(mid), 'withdrawObyem: түгжээ минийх эсэхийг агшнаар тулгахгүй');
  assert.ok((mid.match(/await release\(\)/g) ?? []).length >= 3, 'withdrawObyem: татгалзахад түгжээг тайлахгүй');
  assert.ok(/s\(back\[F\.status\]\) !== OBYEM_STATUS\.withdrawn/.test(wd.slice(wr)), 'withdrawObyem: бичсэний дараа баталгаажуулахгүй');
  assert.ok(/\[F\.approverAt\]: serverNow\(\)/.test(wd.slice(wr)), 'withdrawObyem: агшин серверийн цагаар биш');
}
/* ── casObyemClaim — цэвэр CAS: бусдын амьд түгжээ · хугацаа дууссан · ялагдсан бичилт ── */
{
  const { casObyemClaim, F } = await import('@/lib/obyemBatlah.ts');
  const T = 10_000_000;
  const row = (ap, at, st = OBYEM_STATUS.pending) => ({ [F.oid]: 1, [F.status]: st, [F.approver]: ap, [F.approverAt]: at });
  /* бусдын АМЬД түгжээ — бичихгүй */
  let wrote = 0;
  const held = await casObyemClaim({ read: async () => row('bold', T - 60_000), write: async () => { wrote += 1; return true; }, now: () => T }, 'dorj');
  assert.match(held, /bold/, 'casObyemClaim: бусдын амьд түгжээг давж байна');
  assert.equal(wrote, 0, 'casObyemClaim: татгалзсан атлаа бичсэн');
  /* бусдын ХУГАЦАА ДУУССАН түгжээ — авна; бичсэний дараа дахин уншиж тулгана */
  let cur = row('bold', T - 11 * 60_000);
  const got = await casObyemClaim({ read: async () => cur, write: async (at) => { cur = row('dorj', at); return true; }, now: () => T }, 'dorj');
  assert.equal(got, null, 'casObyemClaim: дууссан түгжээг авахгүй байна');
  assert.equal(cur[F.approverAt], T, 'casObyemClaim: бичих агшин `now()`-оор биш');
  /* зэрэг бичсэн хүн ялсан — түүний нэр */
  let cur2 = row(null, null);
  const lost = await casObyemClaim({ read: async () => cur2, write: async () => { cur2 = row('suren', T + 1); return true; }, now: () => T }, 'dorj');
  assert.match(lost, /suren/, 'casObyemClaim: ялагдсан бичилтэд ялагчийн нэр алга');
  /* шийдвэрлэгдсэн мөр — бичихгүй */
  const dec = await casObyemClaim({ read: async () => row('bold', T, OBYEM_STATUS.approved), write: async () => { wrote += 1; return true; }, now: () => T }, 'dorj');
  assert.match(dec, /аль хэдийн шийдвэрлэсэн/, 'casObyemClaim: шийдвэрлэгдсэн мөрөнд түгжээ бичиж байна');
  assert.equal(wrote, 0);
}
console.log('✅ 2026-10-12 дарааллын аудит: serverNow · claimAt · existing · эзэнтэй clear · withdraw CAS');

console.log('\nobyemBatlah.check: ok');
