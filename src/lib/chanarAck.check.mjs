/**
 * NCR «ХҮЛЭЭН АВЛАА» — ХЭН ХҮЛЭЭН АВАХ ВЭ (2026-10-01, хэрэглэгч: бүгдийг зас).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/chanarAck.check.mjs
 *
 * Хамгаалж буй дүрэм:
 *   1. NCR-ийн захиалагчийн хариуг (REP) ТУХАЙН БАГЦЫН ГҮЙЦЭТГЭГЧ хүлээн авна —
 *      НЭЭГЧ (зохиогч = захиалагчийн хянагч) БИШ. Урьд нь бүх төрөлд «зөвхөн
 *      зохиогч» байсан тул NCR-д нээгч өөрийн хариугаа өөрөө хүлээн авдаг байв.
 *      Эх: хариу маягтын гарын үсэг «Хариу хүлээн авсан ГҮЙЦЭТГЭГЧИЙН ажилтан»
 *      (`chanarUi.repSigRoles`), дэлгэц «гүйцэтгэгч хариуг хүлээн аваагүй».
 *   2. Товч (`canAct.ack`) ба домэйн шалгуур (`ackRep`) ИЖИЛ — консолоос нээгч
 *      дуудсан ч татгалзана; сүлжээний давхарга (`ackRepDoc`) гүйцэтгэгчийн эрхээр.
 *   3. Бусад төрөлд (MS · MA …) өөрчлөлтгүй — зохиогч хүлээн авна.
 *   4. Хариу зөвхөн approved/returned төлөвт хүлээн авагдана (дахин нээгдсэн NCR-ийн
 *      хадгалагдсан хуучин хариуг «хянагдаж байна» төлөвт хүлээн авахгүй).
 */
import assert from 'node:assert/strict';

/* ── window/localStorage shim — `chanarStore` ('use client' модулиуд) ачаалахад ── */
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

const { ackRep, canAct, emptyReviews, MS_STATUS, VERDICT } = await import('./chanarMs.ts');

const T = 1_700_000_000_000;
const rv = (verdict, who) => ({ who, at: T, verdict, note: null });
const rep = { no: 'SLB-REP-NCR--0005-00', at: T + 5, verdict: 'A' };
const ncr = {
  kind: 'NCR', status: MS_STATUS.approved, author: 'opener', rep,
  reviews: { ...emptyReviews(), tuh: rv(VERDICT.approve, 't'), chanar: rv(VERDICT.approve, 'c'), tug: rv(VERDICT.approve, 'g') },
};

/* ══ 1. Домэйн шалгуур (`ackRep`) ══ */
{
  assert.equal(ackRep(ncr, { who: 'opener' }).ok, false, '⚠️ нээгч (захиалагч) өөрийн NCR-ийн хариуг хүлээн авахгүй');
  assert.equal(ackRep(ncr, { who: 'Opener', contractor: true }).ok, false, '⚠️ нээгч гүйцэтгэгчийн эрхтэй байсан ч хүлээн авахгүй');
  assert.match(ackRep(ncr, { who: 'opener' }).error, /гүйцэтгэгч/);
  assert.equal(ackRep(ncr, { who: 'con' }).ok, false, 'гүйцэтгэгчийн эрх (`contractor`) заавал');
  assert.equal(ackRep(ncr, { who: 'con', contractor: false }).ok, false);
  const ok = ackRep(ncr, { who: ' CON ', contractor: true, now: T + 9 });
  assert.ok(ok.ok, 'тухайн багцын гүйцэтгэгч хүлээн авна');
  assert.equal(ok.rep.receivedBy, 'con'); assert.equal(ok.rep.receivedAt, T + 9); assert.equal(ok.rep.no, rep.no);
  assert.equal(ackRep({ ...ncr, rep: ok.rep }, { who: 'con', contractor: true }).ok, false, 'хоёр дахь удаа үгүй');
  assert.equal(ackRep({ ...ncr, status: MS_STATUS.returned }, { who: 'con', contractor: true }).ok, true, '«Нэмэлт арга хэмжээ» хариуг ч хүлээн авна');
  /* Дахин нээгдсэн NCR — хуучин хариу хадгалагдсан, төлөв review */
  assert.equal(ackRep({ ...ncr, status: MS_STATUS.review }, { who: 'con', contractor: true }).ok, false, '⚠️ хянагдаж буй төлөвт хуучин хариуг хүлээн авахгүй');
  assert.equal(ackRep({ ...ncr, rep: null }, { who: 'con', contractor: true }).ok, false);
  assert.equal(ackRep(ncr, { who: '  ', contractor: true }).ok, false);
}

/* ══ 2. Бусад төрөл — өөрчлөлтгүй (зохиогч) ══ */
{
  const ma = { ...ncr, kind: 'MA', author: 'g' };
  assert.equal(ackRep(ma, { who: 'g' }).ok, true, 'MA: зохиогч');
  assert.equal(ackRep(ma, { who: 'x', contractor: true }).ok, false, 'MA: гүйцэтгэгчийн эрхтэй ч зохиогч биш бол үгүй');
  const ms = { status: MS_STATUS.returned, author: 'g', rep: { ...rep, verdict: 'R' } };
  assert.equal(ackRep(ms, { who: 'G' }).ok, true, '`kind`-гүй хуучин дуудагч = MS');
  assert.equal(ackRep({ ...ma, status: MS_STATUS.review }, { who: 'g' }).ok, false, 'хянагдаж буй төлөвт үгүй');
}

/* ══ 3. Товч (`canAct.ack`) — домэйн шалгууртай ижил ══ */
{
  assert.equal(canAct(ncr, 'opener', ['tuh']).ack, false, '⚠️ нээгчид «Хүлээн авлаа» товч гарахгүй');
  assert.equal(canAct(ncr, 'opener', ['tuh'], { contractor: true }).ack, false, 'нээгч гүйцэтгэгчийн эрхтэй байсан ч');
  assert.equal(canAct(ncr, 'con', [], { contractor: true }).ack, true, 'гүйцэтгэгчид товч гарна');
  assert.equal(canAct(ncr, 'con', []).ack, false, 'гүйцэтгэгчийн эрхгүй бол үгүй');
  assert.equal(canAct({ ...ncr, status: MS_STATUS.returned }, 'con', [], { contractor: true }).ack, true);
  assert.equal(canAct({ ...ncr, status: MS_STATUS.review }, 'con', [], { contractor: true }).ack, false);
  assert.equal(canAct({ ...ncr, rep: { ...rep, receivedAt: T } }, 'con', [], { contractor: true }).ack, false);
  assert.equal(canAct(ncr, '', [], { contractor: true }).ack, false, 'нэвтрээгүй');
  const ma = { ...ncr, kind: 'MA', author: 'g' };
  assert.equal(canAct(ma, 'g', []).ack, true, 'MA: зохиогч хэвээр');
  assert.equal(canAct(ma, 'x', [], { contractor: true }).ack, false, 'MA: гүйцэтгэгч боловч зохиогч биш');
  /* Товч ⇔ домэйн: бүх хослолоор */
  for (const who of ['opener', 'con', 'x']) {
    for (const contractor of [true, false]) {
      for (const status of Object.values(MS_STATUS)) {
        const d = { ...ncr, status };
        assert.equal(canAct(d, who, [], { contractor }).ack, ackRep(d, { who, contractor }).ok, `товч ⇔ ackRep: ${who} ${contractor} ${status}`);
      }
    }
  }
}

/* ══ 4. Сүлжээний давхарга (`ackRepDoc`) — эх кодын шалгуур ══ */
{
  const fs = await import('node:fs');
  const store = fs.readFileSync(new URL('./chanarStore.ts', import.meta.url), 'utf8');
  const fn = store.slice(store.indexOf('export async function ackRepDoc'), store.indexOf('export async function closeAnDoc'));
  assert.ok(fn.length > 100, 'ackRepDoc олдсонгүй');
  assert.ok(/actor\(args\.who, ncr \? 'chanarAuthor' : authorCap\(doc\.kind\)\)/.test(fn), '⚠️ NCR-д гүйцэтгэгчийн эрх (`chanarAuthor`), хянагчийн биш');
  assert.ok(/isAuthorFor\(act\.who, doc\.bagts\)/.test(fn), '⚠️ NCR-д тухайн багцын гүйцэтгэгч (`isAuthorFor`)');
  assert.ok(/ackPure\(doc, \{ who: act\.who, contractor \}\)/.test(fn), '⚠️ `contractor` домэйн шалгуурт дамжина');
}

/* ══ 5. «Миний хийх» — NCR-ийн хариу гүйцэтгэгчийн жагсаалтад, нээгчийнхэд үгүй ══ */
{
  const { _syncRemoteChanar } = await import('./chanarAcl.ts');
  const { actionableItems } = await import('./chanarStore.ts');
  _syncRemoteChanar([
    { user: 'con', grants: [{ role: 'author', bagts: ['Багц 3.3'] }] },
    { user: 'opener', grants: [{ role: 'tuh', bagts: ['Багц 3.3'] }] },
  ]);
  /* Хаагдсан (гүйцэтгэгч хаасан) NCR — зөвхөн хүлээн авах үлдсэн */
  const row = { ...ncr, oid: 7, docNo: 'STMCC-STMC-NCR-0005', org: 'STMCC', bagts: 'Багц 3.3', seq: 5, rev: 0, title: 'x', sentAt: T, decidedAt: T + 5, bounce: null };
  const flags = new Map([[7, { correctionAt: T + 1, ncrClosed: true, reopenedAt: null }]]);
  const con = actionableItems([row], flags, 'con', T + 5 + 2 * 86_400_000 + 1);
  assert.equal(con.length, 1, 'гүйцэтгэгчийн «Миний хийх»-д');
  assert.equal(con[0].why, 'ack'); assert.equal(con[0].since, T + 5); assert.equal(con[0].days, 2);
  assert.deepEqual(actionableItems([row], flags, 'opener', T), [], '⚠️ нээгчийн «Миний хийх»-д хариу хүлээн авах ОРОХГҮЙ');
}

console.log('✅ NCR «Хүлээн авлаа» — гүйцэтгэгч (нээгч биш) · товч ⇔ домэйн · ackRepDoc эрх · Миний хийх');
