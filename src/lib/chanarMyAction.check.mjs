/**
 * «МИНИЙ ХИЙХ» — ЯАГААД ЖАГСААЛТАД БАЙГАА, ХЭДЭН ХОНОГ ХҮЛЭЭСЭН (2026-10-01, хэрэглэгч: бүгдийг зас).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/chanarMyAction.check.mjs
 *
 * Хамгаалж буй дүрэм:
 *   1. `myAction` нь `needsMyAction` үнэн үед Л утгатай — жагсаалт ба шалтгаан
 *      хэзээ ч зөрөхгүй (`actionableDocs` өмнөхтэйгээ ижил).
 *   2. Шалтгаан бүрийн «жагсаалтад орсон агшин» (`since`) зөв талбараас:
 *      зэрэгцээ хянах → sentAt · дараалсан → өмнөх хянагчийн шийдвэр · NCR дүгнэх →
 *      correctionAt · NCR залруулах → sentAt/дахин нээсэн агшин · буцаагдсан → decidedAt ·
 *      NCR хаах → decidedAt · хүлээн авах → rep.at.
 *   3. ⚠️ null ≠ 0: агшин мэдэгдэхгүй (ноорог) бол `since`/`days` = null — «0 хоног» биш.
 */
import assert from 'node:assert/strict';

/* ── window/localStorage shim — `chanarStore` ачаалахад ── */
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

const {
  myAction, myActionLabel, waitDays, needsMyAction, canAct, emptyReviews, MS_STATUS, VERDICT,
} = await import('./chanarMs.ts');

const T = 1_700_000_000_000;
const D = 86_400_000;
const rv = (verdict, who, at = T) => ({ who, at, verdict, note: null });
const none = { edit: false, submit: false, review: [], correction: false, reopen: false, clientChecks: false, bounce: false, ack: false, closeAn: false, newRevision: false, closeNcr: false };
const doc = (o = {}) => ({ kind: 'MS', status: MS_STATUS.review, author: 'g', reviews: emptyReviews(), sentAt: T, decidedAt: null, rep: null, bounce: null, correctionAt: null, ...o });

/* ══ 1. waitDays — null ≠ 0 ══ */
{
  assert.equal(waitDays(null, T), null, '⚠️ агшин үгүй → null (0 биш)');
  assert.equal(waitDays(undefined, T), null);
  assert.equal(waitDays(Number.NaN, T), null);
  assert.equal(waitDays(T, T), 0, 'өнөөдөр → 0 (мэдэгдэж буй агшин)');
  assert.equal(waitDays(T, T + D - 1), 0); assert.equal(waitDays(T, T + D), 1); assert.equal(waitDays(T, T + 5 * D + 7), 5);
  assert.equal(waitDays(T + D, T), 0, 'ирээдүйн агшин (цагийн зөрүү) → 0, сөрөг биш');
}

/* ══ 2. Шалтгаан ба агшин ══ */
{
  /* Зэрэгцээ хянах (MS) — sentAt */
  assert.deepEqual(myAction(doc({ sentAt: T + 1 }), { ...none, review: ['chanar'] }), { why: 'review', since: T + 1 });
  /* Дараалсан (MIR: tuh → chanar) — chanar-ын ээлж tuh шийдсэн агшнаас */
  const mir = doc({ kind: 'MIR', reviews: { ...emptyReviews(), tuh: rv(VERDICT.approve, 't', T + 3 * D) } });
  assert.deepEqual(myAction(mir, { ...none, review: ['chanar'] }), { why: 'review', since: T + 3 * D }, '⚠️ дараалсанд өмнөх хянагчийн шийдвэрээс');
  assert.deepEqual(myAction(doc({ kind: 'MIR' }), { ...none, review: ['tuh'], clientChecks: true }), { why: 'review', since: T }, 'эхний шат → sentAt');
  /* MA: cheng → chanar → tug — tug-ийн ээлж хамгийн сүүлийн өмнөх шийдвэрээс */
  const ma = doc({ kind: 'MA', reviews: { ...emptyReviews(), cheng: rv(VERDICT.approve, 'e', T + D), chanar: rv(VERDICT.approve, 'c', T + 2 * D) } });
  assert.deepEqual(myAction(ma, { ...none, review: ['tug'] }), { why: 'review', since: T + 2 * D });
  /* NCR дүгнэх — correctionAt */
  const ncr = doc({ kind: 'NCR', author: 'opener', correctionAt: T + 4 * D });
  assert.deepEqual(myAction(ncr, { ...none, review: ['tuh'] }), { why: 'ncrReview', since: T + 4 * D });
  /* NCR залруулга илгээх — sentAt, дахин нээсэн бол тэр агшин */
  const ncrSent = doc({ kind: 'NCR', author: 'opener', sentAt: T + D });
  assert.deepEqual(myAction(ncrSent, { ...none, correction: true }), { why: 'correction', since: T + D });
  assert.deepEqual(myAction(ncrSent, { ...none, correction: true }, { reopenedAt: T + 9 * D }), { why: 'correction', since: T + 9 * D }, 'дахин нээсэн агшин (sentAt хуучин хэвээр)');
  assert.deepEqual(myAction(ncrSent, { ...none, correction: true }, { reopenedAt: T }), { why: 'correction', since: T + D }, 'аль хожуу нь');
  assert.equal(myAction({ ...ncrSent, correctionAt: T + 2 * D }, { ...none, correction: true }), null, 'залруулга илгээгдсэн — хянагчийг хүлээж байна');
  /* NCR «Нэмэлт арга хэмжээ» — decidedAt */
  assert.deepEqual(myAction({ ...ncrSent, status: MS_STATUS.returned, correctionAt: T + 2 * D, decidedAt: T + 3 * D }, { ...none, correction: true }), { why: 'recorrect', since: T + 3 * D });
  /* Ноорог илгээх — агшин үгүй */
  assert.deepEqual(myAction(doc({ status: MS_STATUS.draft, sentAt: null }), { ...none, submit: true, edit: true }), { why: 'submit', since: null }, '⚠️ ноорогт агшин үгүй → null');
  /* Буцаагдсан → засаж дахин илгээх — decidedAt; хуучин мөрд bounce.at */
  assert.deepEqual(myAction(doc({ status: MS_STATUS.returned, decidedAt: T + 6 * D }), { ...none, submit: true, edit: true, ack: true }), { why: 'resubmit', since: T + 6 * D }, 'буцаагдсанд илгээх нь хүлээн авахаас түрүүлнэ');
  assert.deepEqual(myAction(doc({ status: MS_STATUS.returned, bounce: { at: T + 2, by: 'c', reason: 'format', note: 'x' } }), { ...none, submit: true }), { why: 'resubmit', since: T + 2 });
  /* NCR хаах — decidedAt; хүлээн авахаас түрүүлнэ */
  const closed = doc({ kind: 'NCR', status: MS_STATUS.approved, decidedAt: T + 7 * D, rep: { no: 'r', at: T + 7 * D, verdict: 'A' } });
  assert.deepEqual(myAction(closed, { ...none, closeNcr: true, ack: true }), { why: 'closeNcr', since: T + 7 * D });
  /* Хүлээн авах — rep.at (AN хаалтын дараа шинэ rep.at) */
  assert.deepEqual(myAction({ ...closed, rep: { no: 'r', at: T + 8 * D, verdict: 'A' } }, { ...none, ack: true }), { why: 'ack', since: T + 8 * D });
  assert.deepEqual(myAction({ ...closed, decidedAt: null, rep: { no: 'r', at: 0, verdict: 'A' } }, { ...none, ack: true }), { why: 'ack', since: null }, 'эвдэрсэн агшин (0) → null');
  /* Хянах нь бусдаас түрүүлнэ */
  assert.equal(myAction(doc({ status: MS_STATUS.review }), { ...none, review: ['tuh'], submit: true, ack: true }).why, 'review');
}

/* ══ 3. myAction ⇔ needsMyAction — бүх хослолоор ══ */
{
  const flags = ['submit', 'correction', 'ack', 'closeNcr', 'reopen', 'newRevision', 'closeAn', 'bounce'];
  for (const kind of ['MS', 'MA', 'MIR', 'NCR']) {
    for (const status of Object.values(MS_STATUS)) {
      for (const correctionAt of [null, T]) {
        for (let m = 0; m < (1 << (flags.length + 1)); m += 1) {
          const a = { ...none, review: m & 1 ? ['chanar'] : [] };
          flags.forEach((f, i) => { if (m & (1 << (i + 1))) a[f] = true; });
          const d = doc({ kind, status, correctionAt });
          const r = myAction(d, a);
          assert.equal(r != null, needsMyAction(d, a), `myAction ⇔ needsMyAction: ${kind} ${status} ${correctionAt} ${m}`);
        }
      }
    }
  }
  /* `canAct`-ийн бодит үр дүнгээр (ноорог/буцаагдсан зохиогч) */
  const mine = doc({ status: MS_STATUS.returned, decidedAt: T + D, rep: { no: 'r', at: T + D, verdict: 'R' } });
  assert.equal(myAction(mine, canAct(mine, 'g', [])).why, 'resubmit');
}

/* ══ 4. Шошго — шалтгаан бүрд өөр, хоосон биш ══ */
{
  const whys = ['review', 'ncrReview', 'correction', 'recorrect', 'submit', 'resubmit', 'closeNcr', 'ack'];
  const ls = whys.map(myActionLabel);
  assert.ok(ls.every((l) => typeof l === 'string' && l.trim().length > 0));
  assert.equal(new Set(ls).size, whys.length, 'шошго давхардсан');
  assert.equal(myActionLabel('ncrReview'), 'Залруулга ирсэн — шалгах');
  assert.equal(myActionLabel('ack'), 'Хариу хүлээн авах');
}

/* ══ 5. Store — `actionableItems` (ACL-тэй) ба `actionableDocs` ижил; NCR-ийн дахин нээсэн агшин ══ */
{
  const { _syncRemoteChanar } = await import('./chanarAcl.ts');
  const { actionableItems, actionableDocs } = await import('./chanarStore.ts');
  _syncRemoteChanar([
    { user: 'rev', grants: [{ role: 'tuh', bagts: ['Багц 3.3'] }, { role: 'chanar', bagts: ['Багц 3.3'] }] },
    { user: 'con', grants: [{ role: 'author', bagts: ['Багц 3.3'] }] },
  ]);
  const head = (o) => ({ oid: 1, kind: 'MS', docNo: 'x', org: 'MSC', bagts: 'Багц 3.3', seq: 1, rev: 0, title: 't', status: MS_STATUS.review, author: 'con', sentAt: T, reviews: emptyReviews(), decidedAt: null, rep: null, bounce: null, ...o });
  const rows = [
    head({ oid: 1, sentAt: T + D }),                                                     // rev: хянах
    head({ oid: 2, seq: 2, status: MS_STATUS.draft, sentAt: null }),                      // con: ноорог илгээх
    head({ oid: 3, kind: 'NCR', seq: 3, author: 'rev', sentAt: T }),                      // con: залруулга (дахин нээсэн)
    head({ oid: 4, kind: 'NCR', seq: 4, author: 'rev', sentAt: T }),                      // rev: залруулга ирсэн
  ];
  const flags = new Map([
    [3, { correctionAt: null, ncrClosed: false, reopenedAt: T + 4 * D }],
    [4, { correctionAt: T + 2 * D, ncrClosed: false, reopenedAt: null }],
  ]);
  const now = T + 10 * D;
  const rv1 = actionableItems(rows, flags, 'rev', now);
  assert.deepEqual(rv1.map((x) => [x.doc.oid, x.why, x.days]).sort((a, b) => a[0] - b[0]), [[1, 'review', 9], [4, 'ncrReview', 8]]);
  const c1 = actionableItems(rows, flags, 'con', now);
  assert.deepEqual(c1.map((x) => [x.doc.oid, x.why, x.since, x.days]).sort((a, b) => a[0] - b[0]), [[2, 'submit', null, null], [3, 'correction', T + 4 * D, 6]], '⚠️ ноорогт хоног null; дахин нээсэн NCR — дахин нээснээс');
  assert.deepEqual(actionableDocs(rows, flags, 'con').map((d) => d.oid).sort(), c1.map((x) => x.doc.oid).sort(), 'actionableDocs ⇔ actionableItems');
  assert.deepEqual(actionableItems(rows, flags, '', now), []);
  /* NCR туг үгүй бол NCR тоологдохгүй (өмнөх дүрэм) */
  assert.deepEqual(actionableItems(rows, null, 'rev', now).map((x) => x.doc.oid), [1]);

  /* `loadNcrFlags` — дахин нээсэн агшныг `rounds`-оос (эх кодын шалгуур) */
  const fs = await import('node:fs');
  const store = fs.readFileSync(new URL('./chanarStore.ts', import.meta.url), 'utf8');
  const lf = store.slice(store.indexOf('export async function loadNcrFlags'), store.indexOf('export type ActionItem'));
  assert.ok(/x\.end === 'reopen'/.test(lf) && /reopenedAt:/.test(lf), '⚠️ loadNcrFlags: дахин нээсэн агшин (`rounds`)');
  /* UI — шалтгаан + хоног, хоног null бол бичихгүй */
  const ui = fs.readFileSync(new URL('../modules/Chanar.tsx', import.meta.url), 'utf8');
  assert.ok(/actionableItems\(docs, ncrFlags, me\)/.test(ui), 'Chanar.tsx: actionableItems');
  assert.ok(/myActionLabel\(todo\.why\)/.test(ui), 'Chanar.tsx: шалтгааны шошго');
  assert.ok(/todo\.days != null &&/.test(ui), '⚠️ Chanar.tsx: хоног null бол бичихгүй (0 биш)');
}

console.log('✅ Миний хийх — шалтгаан · хүлээсэн хоног (null ≠ 0) · needsMyAction-тай ижил · actionableItems');
