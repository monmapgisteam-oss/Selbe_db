/**
 * ЧАНАРЫН БАРИМТЫН ҮЛДСЭН ЦЭВЭР ТУСЛАХУУДЫН ШАЛГУУР — сүлжээгүй.
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/chanarMs.check.mjs
 */
import assert from 'node:assert/strict';
import {
  REVIEWERS_OF, KINDS, MS_STATUS, VERDICT,
  emptyReviews, latest, latestApproved, statusLabel, verdictCode, isAnOpen, reviewerClashes,
} from './chanarMs.ts';

const T = 1_700_000_000_000;

/* ══ 1. Төлөв — өгөгдөл, орчуулагдахгүй ══ */
{
  assert.equal(MS_STATUS.draft, 'Ноорог');
  assert.equal(MS_STATUS.review, 'Хянагдаж байна');
  assert.equal(MS_STATUS.returned, 'Буцаагдсан');
  assert.equal(MS_STATUS.approved, 'Батлагдсан');
  assert.equal(new Set(Object.values(MS_STATUS)).size, 4, 'төлөв давхардав');
  assert.deepEqual([...KINDS], ['MS', 'MA', 'MIR', 'FIC', 'NCR', 'QMP', 'PRC'], '2026-09-28: QMP · PRC');
  assert.deepEqual([...REVIEWERS_OF.MS], ['tuh', 'chanar', 'habea']);
  assert.deepEqual(REVIEWERS_OF.QMP, REVIEWERS_OF.MS); assert.deepEqual(REVIEWERS_OF.PRC, REVIEWERS_OF.MS);
  assert.deepEqual([...REVIEWERS_OF.MA], ['cheng', 'chanar', 'tug'], 'MA: ЧХ инженер → Чанар → ТУГ, tuh/habea ОРОХГҮЙ');
  assert.deepEqual([...REVIEWERS_OF.MIR], ['tuh', 'chanar']);
  assert.deepEqual([...REVIEWERS_OF.FIC], ['tuh', 'chanar']);
  assert.deepEqual([...REVIEWERS_OF.NCR], ['tuh', 'chanar', 'tug'], 'NCR: ТМ (tug) 3 дахь хянагч');
  assert.deepEqual(emptyReviews(), { tuh: null, chanar: null, habea: null, tug: null, cheng: null });
  /* NCR шошго — ижил утга, өөр нэр */
  assert.equal(statusLabel('NCR', MS_STATUS.review), 'Гүйцэтгэгчид илгээсэн');
  assert.equal(statusLabel('NCR', MS_STATUS.returned), 'Нэмэлт арга хэмжээ шаардлагатай', '2026-09-28: бүртгэлийн 3-р статус');
  assert.equal(statusLabel('NCR', MS_STATUS.approved), 'Хаагдсан');
  assert.equal(statusLabel('MS', MS_STATUS.approved), 'Батлагдсан');
  assert.equal(statusLabel('MS', MS_STATUS.draft), 'Ноорог');
  /* Шийдвэр 3 утга */
  assert.equal(VERDICT.note, 'Санал бүхий зөвшөөрсөн');
  assert.equal(verdictCode(VERDICT.approve), 'A'); assert.equal(verdictCode(VERDICT.note), 'AN'); assert.equal(verdictCode(VERDICT.return), 'R');
}

/* ══ 2. latest · latestApproved ══ */
{
  const mk = (bagts, seq, rev, status = MS_STATUS.approved, kind = 'MS') => ({
    oid: seq * 10 + rev, kind, docNo: '', org: '', bagts, seq, rev, title: '', status,
    author: 'a', sentAt: T, reviews: emptyReviews(), decidedAt: null, rep: null,
  });
  const docs = [
    mk('Багц 1', 1, 1), mk('Багц 1', 1, 0), mk('Багц 1', 1, 2),
    mk('Багц 1', 2, 0), mk('Багц 2', 1, 0),
  ];
  /* Өөр төрлийн ижил (bagts, seq) — тусдаа баримт */
  assert.equal(latest([...docs, mk('Багц 1', 1, 0, MS_STATUS.draft, 'MA')]).length, 4, 'kind тусдаа');
  const l = latest(docs);
  assert.equal(l.length, 3, '3 өөр баримт');
  assert.equal(l.find((d) => d.bagts === 'Багц 1' && d.seq === 1).rev, 2, '⚠️ сүүлийн хувилбар л жагсаалтад');

  const withDraft = [...docs, mk('Багц 1', 1, 3, MS_STATUS.draft), mk('Багц 2', 1, 1, MS_STATUS.review), mk('Багц 1', 3, 0, MS_STATUS.returned)];
  assert.equal(latest(withDraft).find((d) => d.bagts === 'Багц 1' && d.seq === 1).rev, 3, 'latest — ноорог rev 3');
  const la = latestApproved(withDraft);
  assert.equal(la.find((d) => d.bagts === 'Багц 1' && d.seq === 1).rev, 2, 'батлагдсан rev 2 ноорог гарсан ч хүчинтэй');
  assert.equal(la.find((d) => d.bagts === 'Багц 2' && d.seq === 1).rev, 0, 'хянагдаж буй rev 1 биш, батлагдсан rev 0');
  assert.equal(la.some((d) => d.bagts === 'Багц 1' && d.seq === 3), false, 'нэг ч батлагдсан хувилбаргүй баримт ОРОХГҮЙ');
  assert.equal(la.length, 3);
  assert.equal(latestApproved(withDraft.map((d) => ({ ...d, status: MS_STATUS.draft }))).length, 0);
  const newer = [...withDraft, mk('Багц 1', 1, 3, MS_STATUS.approved)];
  assert.equal(latestApproved(newer).find((d) => d.bagts === 'Багц 1' && d.seq === 1).rev, 3, 'шинэ rev батлагдвал орлоно');
}

/* ══ 3. AN нээлттэй ══ */
{
  const repAN = { no: 'SLB-REP-MA-P0100-0003-00', at: T, verdict: 'AN' };
  const doc = { status: MS_STATUS.approved, rep: repAN };
  assert.equal(isAnOpen(doc), true);
  assert.equal(isAnOpen({ ...doc, rep: { ...repAN, verdict: 'A' } }), false);
  assert.equal(isAnOpen({ ...doc, status: MS_STATUS.review }), false);
  assert.equal(isAnOpen({ ...doc, rep: null }), false);
}

/* ══ 4. reviewerClashes — 2026-10-21: амьд урсгал (MA · FIC · М-акт) аль ч НЭГ хянагчийн
      шийдвэрийг хүлээн авдаг тул «нэг хүн хоёр үүрэгт» гацаа ҮГҮЙ (урьд нь худал анхааруулга) ══ */
{
  assert.deepEqual(reviewerClashes({ tuh: ['t'], chanar: ['c'], habea: ['t'], tug: ['g2'], cheng: ['e'] }, ['a']), [], 'ТУХ+ХАБЭА нэг хүн — гацаагүй');
  assert.deepEqual(reviewerClashes({ tuh: ['t'], chanar: ['c'], habea: ['h'], tug: ['g2'], cheng: ['c'] }, ['a']), [], 'ЧХ инженер+Чанар нэг хүн — гацаагүй');
  assert.deepEqual(reviewerClashes({ tuh: ['t'], chanar: ['t'], tug: ['g2'] }, []), []);
}

console.log('chanarMs.check ✓');
