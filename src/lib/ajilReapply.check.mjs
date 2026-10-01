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
  console.log('✅ илрүүлэлт (classifyStuck)');
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
