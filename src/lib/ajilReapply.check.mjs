/**
 * «БАТЛАГДСАН · БУУЛГААГҮЙ» НЭМЭЛТ АЖЛЫГ ДАХИН БУУЛГАХ — сүлжээгүй (2026-10-01).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/ajilReapply.check.mjs
 *
 * Хамгаалж буй дүрмүүд (хэрэглэгч: бүгдийг зас):
 *   1. Илрүүлэлт (`classifyStuck`): зөвхөн `approved` («Буулгасан» = `applied` нь
 *      амжилтын тэмдэг); батлагчийн хүрээ; бүртгэлгүй багц ЧИМЭЭГҮЙ нуугдахгүй
 *      (`orphan`); саяхан батлагдсан (`fresh`) ба унасан (`retry`); энэ цонхонд
 *      оролдлого дууссан бол хүлээхгүй.
 *   2. Эрх (`mayReapply` + `materializeAdds`-ийн шалгуур): батлагч ЭСВЭЛ админ;
 *      багцын хүрээ тусдаа хэвээр.
 *   3. Идемпотент: `applied` бол ЮУ Ч бичихгүй; давхар дарвал НЭГ л бичилт;
 *      зэрэгцээ буулгалт давхцахгүй (Web Locks ба түүнгүй орчинд); бүх мөр
 *      байвал зөвхөн тэмдэглэнэ; унавал `approved` хэвээр, дахин оролдоход бичнэ.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const A = await import('@/lib/ajilApply.ts');
const B = await import('@/lib/ajilBatlah.ts');
const WHO = await import('@/lib/who.ts');
const SV = await import('@/lib/services.ts');
const { AJIL_STATUS } = B;

/* ── 1. Илрүүлэлт ── */
{
  const NOW = Date.UTC(2026, 9, 1, 6, 0);
  const G = A.APPLY_GRACE_MS;
  const sub = (oid, o = {}) => ({
    oid, status: AJIL_STATUS.approved, pkgKey: 'b1', pkgGroup: 'Багц 1', approverAt: NOW - 10 * 60_000, ...o,
  });
  const knownPkg = (k) => k !== 'zz';
  const list = [
    sub(1),                                   // хуучин → retry
    sub(2, { approverAt: NOW - 30_000 }),     // саяхан → fresh
    sub(3, { status: AJIL_STATUS.applied }),  // буулгасан → алга
    sub(4, { status: AJIL_STATUS.pending }),  // хүлээгдэж буй → алга
    sub(5, { pkgKey: 'zz' }),                 // бүртгэлгүй → orphan (нуугдахгүй)
    sub(6, { pkgGroup: 'Багц 9' }),           // хүрээнээс гадна → алга
    sub(7, { approverAt: null }),             // агшингүй → retry
    sub(8, { approverAt: NOW + 2 * G }),      // цаг хэт зөрсөн → retry (мөнх хүлээлгүй)
    sub(9, { approverAt: NOW + 60_000 }),     // бага зөрсөн → fresh
    sub(10, { approverAt: NOW - G }),         // яг хил дээр → retry
  ];
  const r = A.classifyStuck(list, { now: NOW, scope: ['Багц 1'], knownPkg });
  assert.deepEqual(
    r.map((x) => [x.sub.oid, x.kind]),
    [[1, 'retry'], [2, 'fresh'], [5, 'orphan'], [7, 'retry'], [8, 'retry'], [9, 'fresh'], [10, 'retry']],
    'ангилал',
  );
  assert.equal(r.find((x) => x.sub.oid === 2).readyAt, NOW - 30_000 + G, 'fresh — товч нээгдэх агшин');
  assert.equal(r.find((x) => x.sub.oid === 1).readyAt, null, 'retry — агшингүй');
  assert.ok(A.classifyStuck(list, { now: NOW, scope: null, knownPkg }).some((x) => x.sub.oid === 6), 'хүрээ null — бүгд');
  assert.deepEqual(A.classifyStuck(list, { now: NOW, scope: [], knownPkg }), [], 'хүрээ [] — fail-closed');
  assert.equal(
    A.classifyStuck(list, { now: NOW, scope: ['Багц 1'], knownPkg, settled: new Set([2]) }).find((x) => x.sub.oid === 2).kind,
    'retry',
    'энэ цонхонд оролдлого дууссан — хүлээхгүй',
  );
  /* ⚠️ 2026-10-04: «эцэг бүлэг олдсонгүй»-ээр унасан нь `retry` БИШ `orphan` (дахин буулгах нь бүтэхгүй) */
  const np = A.classifyStuck(list, { now: NOW, scope: ['Багц 1'], knownPkg, noParent: new Set([1, 2]) });
  assert.equal(np.find((x) => x.sub.oid === 1).kind, 'orphan', 'no-parent retry → orphan');
  assert.equal(np.find((x) => x.sub.oid === 2).kind, 'orphan', 'no-parent fresh → orphan');
  assert.equal(np.find((x) => x.sub.oid === 7).kind, 'retry', 'бусад нь хэвээр');
  /* Буцаах дүрэм — зөвхөн approved, шалтгаан заавал */
  assert.equal(B.returnStuckDeny(B.AJIL_STATUS.approved, B.NO_PARENT_REASON()), null);
  assert.ok(B.returnStuckDeny(B.AJIL_STATUS.approved, '  '), 'шалтгаангүй');
  for (const st of [B.AJIL_STATUS.pending, B.AJIL_STATUS.applied, B.AJIL_STATUS.returned, B.AJIL_STATUS.withdrawn, null]) {
    assert.ok(B.returnStuckDeny(st, 'x'), `«${st}» буцаагдахгүй`);
  }
  console.log('✅ илрүүлэлт (classifyStuck) · эцэггүй → orphan · гацсан батлалтыг буцаах дүрэм');
}

/* ── 2. Эрх ── */
{
  const t = (authOff, isSuper, hasApprove) => A.mayReapply({ authOff, isSuper, hasApprove });
  assert.equal(t(false, false, false), false, 'эрхгүй — үгүй');
  assert.equal(t(false, false, true), true, 'батлагч — тийм');
  assert.equal(t(false, true, false), true, 'админ (ajilApprove-гүй ч) — тийм');
  assert.equal(t(true, false, false), true, 'нэвтрэлт унтраалттай — тийм');
  console.log('✅ эрх (mayReapply)');
}

/* ── 3. Идемпотент — сүлжээг `_io`-оор солино ── */
const SUPER = Object.entries(SV.ROLE_BY_USER).find(([, r]) => r === 'super')?.[0];
assert.ok(SUPER, 'super хэрэглэгч тохиргоонд алга');
WHO.setCurrentUser(SUPER);

const ROW = { oid: -1, parentNo: '1', parentWork: 'СУУРЬ', parentIdx: 0, no: '3', work: 'Хучих', vol: null, unit: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = new Map();
const put = (oid, status) => db.set(oid, { status, pkgKey: 'b1', pkgGroup: 'Багц 1' });
const c = { write: 0, mark: 0, active: 0, maxActive: 0 };
let writeImpl = async () => ({ ok: true, added: 1 });
let markFail = false;

A._io.loadHead = async (oid) => {
  const r = db.get(oid);
  return r ? {
    oid, pkgKey: r.pkgKey, pkgGroup: r.pkgGroup, status: r.status, author: 'zohiogch', authorSent: 1,
    approver: 'batlagch', approverAt: 1, reason: null, note: null, rowCount: 1, payload: '',
  } : null;
};
A._io.loadPayloadStamped = async () => ({ p: { v: 1, pkgKey: 'b1', adds: [ROW] }, stamp: '1:00000000' });
A._io.markApplied = async (oid) => {
  c.mark += 1;
  if (markFail) return { ok: false, error: 'сүлжээ' };
  const r = db.get(oid);
  if (r.status === AJIL_STATUS.approved) r.status = AJIL_STATUS.applied;
  return { ok: r.status === AJIL_STATUS.applied };
};
A._io.writeFrame = async (pkgKey, adds) => {
  c.write += 1; c.active += 1; c.maxActive = Math.max(c.maxActive, c.active);
  await sleep(20);
  c.active -= 1;
  return writeImpl(pkgKey, adds);
};
/* ⚠️ 2026-10-09: шинэ сүлжээний хамаарлууд — хуваарь/обьём чөлөөтэй, серверийн түгжээ амжилттай */
let planImpl = async () => null;
let obyemImpl = async () => null;
let claimImpl = async () => null;
const rel = { n: 0 };
A._io.loadPlanPending = (k) => planImpl(k);
A._io.obyemBusy = (k) => obyemImpl(k);
/* ⚠️ 2026-10-09: гүйцэтгэлийн архивлалт — анхдагчаар чөлөөтэй */
let archImpl = async () => null;
A._io.archivingBusy = (k) => archImpl(k);
A._io.claimApply = (oid, me) => claimImpl(oid, me);
A._io.releaseApply = async () => { rel.n += 1; };
/* ⚠️ 2026-10-09: `markApplied`-ийн өмнөх түгжээний дахин уншилт — анхдагчаар минийх */
let otherImpl = async () => null;
A._io.claimOther = (oid, me) => otherImpl(oid, me);
const go = (oid) => A.materializeAdds({ pkgKey: 'b1', ajilOid: oid });
const reset = () => { c.write = 0; c.mark = 0; c.active = 0; c.maxActive = 0; };

/* 3а. Аль хэдийн «Буулгасан» — ЮУ Ч бичихгүй, тэмдэглэхгүй */
put(1, AJIL_STATUS.applied); reset();
let r = await go(1);
assert.deepEqual(r, { ok: true, already: true, added: 0 }, 'applied — already');
assert.equal(c.write, 0, 'applied байхад бичилт хийв');
assert.equal(c.mark, 0, 'applied байхад дахин тэмдэглэв');

/* 3б. Давхар дарах — НЭГ л бичилт, хоёр дуудагч ижил үр дүн */
put(2, AJIL_STATUS.approved); reset();
const [r1, r2] = await Promise.all([go(2), go(2)]);
assert.deepEqual(r1, { ok: true, added: 1 });
assert.deepEqual(r2, r1, 'давхар дарахад өөр үр дүн');
assert.equal(c.write, 1, `давхар дарахад ${c.write} удаа бичив`);
assert.equal(c.mark, 1);
assert.equal(db.get(2).status, AJIL_STATUS.applied);
/* 3в. Дараа нь дахин дарах — бичихгүй */
r = await go(2);
assert.equal(r.already, true); assert.equal(c.write, 1, 'буулгасны дараа дахин бичив');

/* 3г. Хоёр өөр илгээлт зэрэг — бичилт ДАВХЦАХГҮЙ (түгжээ) */
put(3, AJIL_STATUS.approved); put(4, AJIL_STATUS.approved); reset();
await Promise.all([go(3), go(4)]);
assert.equal(c.write, 2); assert.equal(c.maxActive, 1, 'хоёр жааз зэрэг бичигдэв');

/* 3д. Бүх мөр аль хэдийн байна (`added: 0`) — зөвхөн тэмдэглэнэ */
put(5, AJIL_STATUS.approved); reset();
writeImpl = async () => ({ ok: true, added: 0 });
r = await go(5);
assert.deepEqual(r, { ok: true, already: true, added: 0 });
assert.equal(c.mark, 1); assert.equal(db.get(5).status, AJIL_STATUS.applied);

/* 3е. Бичилт унавал — тэмдэглэхгүй, `approved` хэвээр, алдаа буцна; дахин оролдоход бичнэ */
put(6, AJIL_STATUS.approved); reset();
writeImpl = async () => ({ ok: false, error: 'Ачаалснаас хойш хуудсанд шинэ мөр орлоо' });
r = await go(6);
assert.equal(r.ok, false); assert.match(r.error, /шинэ мөр орлоо/, 'алдааны шалтгаан алдагдав');
assert.equal(c.mark, 0); assert.equal(db.get(6).status, AJIL_STATUS.approved);
writeImpl = async () => ({ ok: true, added: 1 });
r = await go(6);
assert.deepEqual(r, { ok: true, added: 1 }); assert.equal(db.get(6).status, AJIL_STATUS.applied);

/* 3ё. Бичсэн ч тэмдэглэгээ унасан — алдаа «Дахин буулгах»-ыг заана; дахин оролдоход
   (мөр аль хэдийн байгаа тул `added: 0`) зөвхөн тэмдэглэнэ */
put(7, AJIL_STATUS.approved); reset();
markFail = true;
r = await go(7);
assert.equal(r.ok, false); assert.match(r.error, /Дахин буулгах/);
assert.equal(db.get(7).status, AJIL_STATUS.approved);
markFail = false;
writeImpl = async () => ({ ok: true, added: 0 });
r = await go(7);
assert.equal(r.already, true); assert.equal(db.get(7).status, AJIL_STATUS.applied);

/* 3ж. Батлагдаагүй / илгээлт алга — бичихгүй */
put(8, AJIL_STATUS.returned); reset();
r = await go(8);
assert.equal(r.ok, false); assert.equal(c.write, 0, 'буцаагдсаныг бичив');
r = await go(999);
assert.equal(r.ok, false); assert.match(r.error, /олдсонгүй/); assert.equal(c.write, 0);
writeImpl = async () => ({ ok: true, added: 1 });
console.log('✅ идемпотент: applied → бичилтгүй · давхар дарах → 1 бичилт · зэрэгцээ → дараалсан · унавал approved хэвээр');

/* 3з. Өөр табын түгжээ удаан суллагдахгүй бол хүлээлгүй алдаа (Web Locks байгаа орчинд) */
if (globalThis.navigator?.locks?.request) {
  /* ⚠️ Node-д `AbortSignal.timeout`-ийн таймер unref — event loop хоосорч түгжээний
     хүсэлт «unsettled» болно. Хөтөчид энэ асуудал байхгүй; тестэд л амьд байлгана. */
  const keep = setInterval(() => {}, 1_000);
  let release;
  const held = new Promise((ok) => {
    void navigator.locks.request('selbe-ajil-apply', () => new Promise((done) => { release = done; ok(); }));
  });
  await held;
  const wait0 = A._io.lockWaitMs;
  A._io.lockWaitMs = 50;
  put(9, AJIL_STATUS.approved); reset();
  r = await go(9);
  assert.equal(r.ok, false); assert.match(r.error, /Өөр цонхонд/, `түгжээний мессеж: ${r.error}`);
  assert.equal(c.write, 0, 'түгжээтэй байхад бичив');
  release();
  A._io.lockWaitMs = wait0;
  r = await go(9);
  assert.equal(r.ok, true); assert.equal(c.write, 1);
  clearInterval(keep);
  console.log('✅ өөр табын түгжээ — хүлээлгүй алдаа, суллагдмагц бичнэ');
} else console.log('⏭ navigator.locks алга — түгжээний хугацааны шалгалт алгасав');

/* 3и. Web Locks БАЙХГҮЙ орчин (хуучин хөтөч) — таб доторх дараалал */
{
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  try {
    put(10, AJIL_STATUS.approved); put(11, AJIL_STATUS.approved); reset();
    const [a, b] = await Promise.all([go(10), go(11)]);
    assert.ok(a.ok && b.ok); assert.equal(c.write, 2); assert.equal(c.maxActive, 1, 'locks-гүй орчинд зэрэг бичигдэв');
    put(12, AJIL_STATUS.approved); reset();
    await Promise.all([go(12), go(12), go(12)]);
    assert.equal(c.write, 1, 'locks-гүй орчинд давхар дарахад олон бичилт');
  } finally {
    if (desc) Object.defineProperty(globalThis, 'navigator', desc); else delete globalThis.navigator;
  }
  console.log('✅ Web Locks-гүй орчин — дараалал хэвээр');
}

/* ── 3к. ⚠️ 2026-10-09: хуваарь/обьёмын төлөв уншигдахгүй бол бичихгүй (fail-closed) ── */
{
  put(30, AJIL_STATUS.approved); reset();
  planImpl = async () => { throw new Error('сүлжээ'); };
  r = await go(30);
  assert.equal(r.ok, false); assert.match(r.error, /хуваарийн илгээлтийн төлөв уншигдсангүй/, r.error);
  assert.equal(c.write, 0, 'хуваарийн төлөв уншигдаагүй атлаа бичив');
  planImpl = async () => null;

  obyemImpl = async () => { throw new Error('сүлжээ'); };
  r = await go(30);
  assert.equal(r.ok, false); assert.match(r.error, /обьёмын батлалтын төлөв уншигдсангүй/, r.error);
  assert.equal(c.write, 0);
  obyemImpl = async () => ({ who: 'obatlagch', partial: true });
  r = await go(30);
  assert.equal(r.ok, false); assert.match(r.error, /ХЭСЭГЧЛЭН/); assert.match(r.error, /obatlagch/);
  assert.equal(c.write, 0, 'обьём хагас бичигдсэн атлаа жааз солив');
  obyemImpl = async () => ({ who: 'obatlagch', partial: false });
  r = await go(30);
  assert.equal(r.ok, false); assert.match(r.error, /яг одоо батлаж байна/);
  assert.equal(c.write, 0, 'обьём батлагдаж байхад жааз солив');
  obyemImpl = async () => null;
  /* ⚠️ 2026-10-09: гүйцэтгэлийн АРХИВЛАЛТ явж байхад ба төлөв уншигдахгүй бол хаана (fail-closed) */
  archImpl = async () => ({ who: 'arhivlagch', at: 1 });
  r = await go(30);
  assert.equal(r.ok, false); assert.match(r.error, /arhivlagch гүйцэтгэлийг яг одоо архивлаж байна/, r.error);
  assert.equal(c.write, 0, 'архивлаж байхад жааз бичив');
  archImpl = async () => { throw new Error('сүлжээ'); };
  r = await go(30);
  assert.equal(r.ok, false); assert.match(r.error, /архивлалтын төлөв уншигдсангүй/, r.error);
  assert.equal(c.write, 0, 'архивлалтын төлөв уншигдаагүй атлаа бичив');
  archImpl = async () => null;
  /* ⚠️ 2026-10-09: хоёр төрөл — жагсаалтын ХОЁР ДАХЬ (гэрээ тэмдэггүй, төлөвлөгөө хагас) ч хаана */
  const PS = (o) => ({ oid: o.oid, pkgKey: 'b1', pkgGroup: 'Багц 1', status: 'Хүлээгдэж буй', author: 'z', authorSent: 1, approver: o.approver ?? null, approverAt: o.approverAt ?? null, reason: o.reason ?? null, note: null, rowCount: 1, payload: '', okRows: null });
  planImpl = async () => [PS({ oid: 5 }), PS({ oid: 6, reason: '__hagas_bichigdsen__:hbatlagch' })];
  r = await go(30);
  assert.equal(r.ok, false); assert.match(r.error, /ХЭСЭГЧЛЭН/); assert.match(r.error, /hbatlagch/);
  assert.equal(c.write, 0, 'хоёр дахь төрлийн хагас бичилтийг харсангүй');
  /* Хуваарийн батлагчийн хүчинтэй түгжээ — хаана */
  planImpl = async () => [PS({ oid: 7, approver: 'hbatlagch', approverAt: Date.now() })];
  r = await go(30);
  assert.equal(r.ok, false); assert.match(r.error, /hbatlagch/);
  assert.equal(c.write, 0, 'хуваарийн батлагч түгжсэн атлаа жааз солив');
  planImpl = async () => null;
  console.log('✅ хуваарь/обьёмын төлөв уншигдахгүй эсвэл батлалт явж байвал бичихгүй');
}

/* ── 3л. ⚠️ 2026-10-09: серверийн түгжээ — авч чадаагүй бол бичихгүй; бусдын дуусгасныг амжилт гэж үзнэ ── */
{
  put(31, AJIL_STATUS.approved); reset(); rel.n = 0;
  claimImpl = async () => 'batlagch2 энэ илгээлтийг яг одоо шийдвэрлэж/буулгаж байна';
  r = await go(31);
  assert.equal(r.ok, false); assert.match(r.error, /batlagch2/);
  assert.equal(c.write, 0, 'түгжээгүй байхад бичив');
  assert.equal(rel.n, 0, 'авч чадаагүй түгжээг тайлав');
  /* Нөгөө компьютер дуусгасан — `applied` */
  claimImpl = async (oid) => { db.get(oid).status = AJIL_STATUS.applied; return 'аль хэдийн шийдвэрлэсэн'; };
  r = await go(31);
  assert.deepEqual(r, { ok: true, already: true, added: 0 });
  assert.equal(c.write, 0);
  claimImpl = async () => null;
  /* Бичилт унавал түгжээг тайлна; амжилттай бол `markApplied` арилгана (тайлахгүй) */
  put(32, AJIL_STATUS.approved); reset(); rel.n = 0;
  writeImpl = async () => ({ ok: false, error: 'унав' });
  r = await go(32);
  assert.equal(r.ok, false); assert.equal(rel.n, 1, 'унасан буулгалтын түгжээг тайлсангүй');
  writeImpl = async () => ({ ok: true, added: 1 });
  rel.n = 0;
  r = await go(32);
  assert.deepEqual(r, { ok: true, added: 1 }); assert.equal(rel.n, 0, 'амжилттай буулгалтын дараа дахин тайлав');
  /* ⚠️ 2026-10-09: бичсэний дараа түгжээ ӨӨР хүнд шилжсэн — тэмдэглэхгүй (бусдын тэмдгийг арчихгүй) */
  put(33, AJIL_STATUS.approved); reset();
  otherImpl = async () => 'dorj';
  r = await go(33);
  assert.equal(r.ok, false); assert.match(r.error, /dorj/);
  assert.equal(c.mark, 0, 'бусдын түгжээтэй байхад markApplied дуудав');
  otherImpl = async () => { throw new Error('сүлжээ'); };
  r = await go(33);
  assert.equal(r.ok, false); assert.equal(c.mark, 0, 'түгжээ уншигдаагүй атлаа тэмдэглэв');
  otherImpl = async () => null;
  console.log('✅ серверийн түгжээ — авч чадаагүй бол бичихгүй, бусад нь дуусгасан бол амжилт, унавал тайлна');
}

/* ── 3м. ⚠️ 2026-10-09: `casAjilClaim` / `ajilClaimOf` — цэвэр ── */
{
  const { casAjilClaim, ajilClaimOf, AJIL_CLAIM_MARK, AJIL_CLAIM_TTL, F } = B;
  const T0 = 1_760_000_000_000;
  const mk = (row) => {
    const s0 = { row: { ...row }, writes: 0 };
    return {
      s0,
      io: (o = {}) => ({
        now: () => T0, tab: 'tabA',
        read: async () => ({ ...s0.row }),
        write: async (mark) => { s0.writes += 1; if (o.steal) s0.row[F.reason] = o.steal; else s0.row[F.reason] = mark; return true; },
      }),
    };
  };
  /* Чөлөөтэй `pending` — түгжинэ */
  let m = mk({ [F.status]: AJIL_STATUS.pending, [F.reason]: null });
  assert.equal(await casAjilClaim(m.io(), 'Bat', AJIL_STATUS.pending), null);
  assert.equal(m.s0.row[F.reason], `${AJIL_CLAIM_MARK}:${T0}:tabA:bat`);
  assert.deepEqual(ajilClaimOf(AJIL_STATUS.pending, m.s0.row[F.reason], T0 + 1), { who: 'bat', at: T0, tab: 'tabA' });
  /* Хугацаа дууссан / хэт ирээдүй / буруу төлөв — түгжээ БИШ */
  assert.equal(ajilClaimOf(AJIL_STATUS.pending, m.s0.row[F.reason], T0 + AJIL_CLAIM_TTL), null);
  assert.equal(ajilClaimOf(AJIL_STATUS.pending, m.s0.row[F.reason], T0 - AJIL_CLAIM_TTL), null);
  assert.equal(ajilClaimOf(AJIL_STATUS.returned, m.s0.row[F.reason], T0), null);
  assert.equal(ajilClaimOf(AJIL_STATUS.pending, 'жинхэнэ шалтгаан', T0), null);
  /* Өөр хүн/таб түгжсэн — татгалзана, бичихгүй */
  m = mk({ [F.status]: AJIL_STATUS.approved, [F.reason]: `${AJIL_CLAIM_MARK}:${T0 - 1000}:tabB:dorj` });
  assert.match(await casAjilClaim(m.io(), 'bat', AJIL_STATUS.approved), /dorj/);
  assert.equal(m.s0.writes, 0);
  /* Ижил хэрэглэгч, ӨӨР таб — мөн татгалзана (хоёр компьютер) */
  m = mk({ [F.status]: AJIL_STATUS.approved, [F.reason]: `${AJIL_CLAIM_MARK}:${T0 - 1000}:tabB:bat` });
  assert.match(await casAjilClaim(m.io(), 'bat', AJIL_STATUS.approved), /bat/);
  assert.equal(m.s0.writes, 0);
  /* Хугацаа дууссан түгжээг давна */
  m = mk({ [F.status]: AJIL_STATUS.approved, [F.reason]: `${AJIL_CLAIM_MARK}:${T0 - AJIL_CLAIM_TTL - 1}:tabB:dorj` });
  assert.equal(await casAjilClaim(m.io(), 'bat', AJIL_STATUS.approved), null);
  /* Төлөв өөр — «аль хэдийн шийдвэрлэсэн» */
  m = mk({ [F.status]: AJIL_STATUS.applied, [F.approver]: 'dorj', [F.reason]: null });
  assert.match(await casAjilClaim(m.io(), 'bat', AJIL_STATUS.approved), /аль хэдийн шийдвэрлэсэн/);
  /* Зэрэг бичсэн хүн ялсан — түүний нэр */
  m = mk({ [F.status]: AJIL_STATUS.pending, [F.reason]: null });
  assert.match(await casAjilClaim(m.io({ steal: `${AJIL_CLAIM_MARK}:${T0}:tabC:dorj` }), 'bat', AJIL_STATUS.pending), /dorj/);
  /* ⚠️ 2026-10-09: ижил хэрэглэгч, өөр таб — ЗӨВШӨӨРВӨЛ (takeover) шилжүүлнэ; өөр хүнийхийг хэзээ ч */
  m = mk({ [F.status]: AJIL_STATUS.approved, [F.reason]: `${AJIL_CLAIM_MARK}:${T0 - 1000}:tabB:bat` });
  let asked = 0;
  assert.equal(await casAjilClaim({ ...m.io(), takeover: () => { asked += 1; return true; } }, 'bat', AJIL_STATUS.approved), null);
  assert.equal(asked, 1); assert.equal(m.s0.row[F.reason], `${AJIL_CLAIM_MARK}:${T0}:tabA:bat`);
  m = mk({ [F.status]: AJIL_STATUS.approved, [F.reason]: `${AJIL_CLAIM_MARK}:${T0 - 1000}:tabB:bat` });
  assert.match(await casAjilClaim({ ...m.io(), takeover: () => false }, 'bat', AJIL_STATUS.approved), /bat/);
  assert.equal(m.s0.writes, 0, 'татгалзсан атлаа түгжээ бичив');
  m = mk({ [F.status]: AJIL_STATUS.approved, [F.reason]: `${AJIL_CLAIM_MARK}:${T0 - 1000}:tabB:dorj` });
  asked = 0;
  assert.match(await casAjilClaim({ ...m.io(), takeover: () => { asked += 1; return true; } }, 'bat', AJIL_STATUS.approved), /dorj/);
  assert.equal(asked, 0, 'өөр хүний түгжээг шилжүүлэхийг асуув'); assert.equal(m.s0.writes, 0);
  /* ⚠️ 2026-10-09: тэмдгийн ХАРИУ АЛДАГДСАН — суусан бол амжилт; суугаагүй бол тайлж (release) алдаа; тодорхой татгалзал шиднэ */
  const lostIo = (m0, land, rel) => ({ ...m0.io(), release: async () => { rel.n += 1; },
    write: async (mark) => { m0.s0.writes += 1; if (land) m0.s0.row[F.reason] = mark; throw new TypeError('Failed to fetch'); } });
  let relN = { n: 0 };
  m = mk({ [F.status]: AJIL_STATUS.pending, [F.reason]: null });
  assert.equal(await casAjilClaim(lostIo(m, true, relN), 'bat', AJIL_STATUS.pending), null, 'суусан тэмдгийг алдаа гэж үзэв');
  assert.equal(relN.n, 0);
  m = mk({ [F.status]: AJIL_STATUS.pending, [F.reason]: null });
  assert.ok(await casAjilClaim(lostIo(m, false, relN), 'bat', AJIL_STATUS.pending), 'суугаагүй тэмдгийг амжилт гэж үзэв');
  assert.equal(relN.n, 1, 'үр дүн тодорхойгүй үед тайлсангүй');
  const { ArcGISError } = await import('@/lib/query.ts');
  m = mk({ [F.status]: AJIL_STATUS.pending, [F.reason]: null });
  await assert.rejects(casAjilClaim({ ...m.io(), write: async () => { throw new ArcGISError('HTTP 403', 'u', undefined, undefined, false, 403); } }, 'bat', AJIL_STATUS.pending), /403/);
  /* Нэргүй — татгалзана */
  assert.ok(await casAjilClaim(mk({ [F.status]: AJIL_STATUS.pending }).io(), '  ', AJIL_STATUS.pending));
  console.log('✅ casAjilClaim — CAS, TTL, өөр таб, уралдаа');
}

/* ── 3н. ⚠️ 2026-10-09: эх код — A.10/A.10б бичсэнээ буцаана; шийдвэр түгжээтэй ── */
{
  const L = readFileSync(new URL('./ajilApply.ts', import.meta.url), 'utf8');
  const body = L.slice(L.indexOf('async function writeFrameLive'));
  const a10 = body.indexOf('/* A.10 —');
  assert.ok(a10 > 0 && body.indexOf('undoWritten(', a10) > a10, 'A.10 илрүүлсэн алдаанд бичсэнээ буцаахгүй байна');
  assert.ok((body.match(/return await undoWritten\(/g) ?? []).length >= 2, 'A.10 ба A.10б хоёулаа бичсэнээ буцаах ёстой');
  /* ⚠️ 2026-10-09: хоосон мөрөөр нөхөхгүй (дараагийн жааз «тасарсан» болно) — хоосон бус мөрийн тоогоор батална */
  assert.ok(!body.includes('frame.push('), 'жаазыг хоосон мөрөөр нөхөж байна');
  assert.ok(body.indexOf('frame.length < loaded.frameLen') > 0 && body.indexOf('frame.length < loaded.frameLen') < body.indexOf('applyAdds(pkg'), 'шинэ жааз ачаалснаас богино эсэхийг бичихээс ӨМНӨ шалгахгүй байна');
  /* ⚠️ 2026-10-09: хуваарь/обьёмын хаалт A.8-ийн ДАРАА, `applyAdds`-ийн ЯГ ӨМНӨ дахин */
  const iG = body.indexOf('await busyGate(pkgKey)');
  assert.ok(iG > body.indexOf('sameFrame(loaded, now)') && iG < body.indexOf('applyAdds(pkg'), 'busyGate applyAdds-ийн өмнө дахин дуудагдахгүй байна');
  /* ⚠️ 2026-10-09: `applyAdds`-ийн хариу АЛДАГДСАН бол `maxOid0`-оос хойшхи тэр өдрийн БҮХ мөрийг устгана */
  const aCatch = body.slice(body.indexOf('await applyAdds(pkg, frame, written)'), body.indexOf('/* A.10 —'));
  assert.ok(/lost === true/.test(aCatch) && aCatch.includes('> ${maxOid0} AND ${dayFilter(sc.f.fillDate'), 'хариу алдагдсан applyAdds-ийн үлдэгдлийг OID > maxOid0 · өдрөөр цэвэрлэхгүй байна');
  assert.ok(aCatch.includes("tr('Бичилтийн хариу алдагдсан — үр дүн тодорхойгүй')"), '«үр дүн тодорхойгүй» мессеж алга');
  const D = readFileSync(new URL('./ajilBatlah.ts', import.meta.url), 'utf8');
  const dec = D.slice(D.indexOf('export async function decideAjil'), D.indexOf('export async function withdrawAjil'));
  assert.ok(dec.indexOf('claimAjil(') > 0 && dec.indexOf('claimAjil(') < dec.indexOf('arcgisPost('), 'decideAjil: түгжээ бичилтээс ӨМНӨ байх ёстой');
  console.log('✅ эх код: A.10/A.10б буцаалт · түүхий урт · decideAjil түгжээ');
}

/* ── 4. Эрхийн шалгуур ХӨТӨЧИЙН горимд (window бий) ── */
{
  const mem = new Map();
  globalThis.window = globalThis;
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
  globalThis.addEventListener ??= () => {};
  globalThis.removeEventListener ??= () => {};
  globalThis.dispatchEvent ??= () => true;
  const CAPS = await import('@/lib/caps.ts');
  try {
    if (SV.AUTH.appId) {
      CAPS._syncRemoteCaps([{ user: 'batlagch_x', caps: ['ajilApprove'] }]);
      put(20, AJIL_STATUS.approved); reset();
      WHO.setCurrentUser('ehngiin_y');
      await assert.rejects(go(20), /эрхгүй/, 'эрхгүй хэрэглэгч буулгав');
      assert.equal(c.write, 0);
      /* Админ — `ajilApprove`-гүй ч буулгана */
      WHO.setCurrentUser(SUPER);
      r = await go(20);
      assert.deepEqual(r, { ok: true, added: 1 }, `админ буулгаж чадсангүй: ${r.error}`);
      /* Батлагч — эрхтэй ч ХҮРЭЭНДЭЭ багц алга бол бичихгүй (хүрээ тусдаа) */
      put(21, AJIL_STATUS.approved); reset();
      WHO.setCurrentUser('batlagch_x');
      r = await go(21);
      assert.equal(r.ok, false); assert.match(r.error, /батлах эрхгүй/, `хүрээ: ${r.error}`);
      assert.equal(c.write, 0, 'хүрээнээс гадуур бичив');
      console.log('✅ эрх: эрхгүй → шиднэ · админ → буулгана · хүрээ тусдаа');
    } else console.log('⏭ AUTH.appId хоосон — хөтчийн эрхийн шалгалт алгасав (бүх эрх нээлттэй горим)');
  } finally {
    CAPS._syncRemoteCaps([]);
    WHO.setCurrentUser(null);
    delete globalThis.window;
  }
}

/* ── 5. Эх код: бичигч `markApplied` дуудахгүй, давхардалгүй бол бичихээс ӨМНӨ гарна; UI ижил замыг хэрэглэнэ ── */
{
  const L = readFileSync(new URL('./ajilApply.ts', import.meta.url), 'utf8');
  const i = L.indexOf('async function writeFrameLive');
  assert.ok(i > 0, 'writeFrameLive алга');
  const body = L.slice(i);
  const early = body.indexOf('if (!fresh.length) return { ok: true, added: 0 };');
  assert.ok(early > 0 && early < body.indexOf('applyAdds(pkg'), 'бүх мөр байхад бичихээс өмнө гарахгүй байна');
  assert.ok(!/markApplied\(/.test(body), 'writeFrameLive дотор markApplied — бичилтээс өмнө тэмдэглэх эрсдэл');

  const U = readFileSync(new URL('../modules/AjilBatlah.tsx', import.meta.url), 'utf8');
  assert.ok(/classifyStuck\(/.test(U), 'AjilBatlah нь classifyStuck-аар илрүүлэхгүй байна');
  assert.ok(/mayReapply\(/.test(U), 'AjilBatlah нь mayReapply-аар эрх шалгахгүй байна');
  assert.ok(/materializeAdds\(\{ pkgKey: x\.pkgKey, ajilOid: x\.oid \}\)/.test(U), '«Дахин буулгах» өөр замаар бичиж байна');
  assert.ok(!/st\.approved : \[\]\)\.filter/.test(U) && /kind === 'orphan'/.test(U), 'бүртгэлгүй багцын батлагдсан илгээлт дахин чимээгүй шүүгдэж байна');
  console.log('✅ эх код: бичигч/тэмдэглэгээний дараалал · UI ижил зам');
}

console.log('ajilReapply.check: OK');
