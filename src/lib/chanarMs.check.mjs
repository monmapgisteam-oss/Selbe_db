/**
 * АЖЛЫН АРГАЧЛАЛ (MS) УРСГАЛЫН ШАЛГУУР — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/chanarMs.check.mjs
 *
 * Хамгаалж буй дүрмүүд (зураглалаас):
 *   1. ГУРВАН ХЯНАГЧ ЗЭРЭГЦЭЭ — дараалал ҮГҮЙ. Аль нь ч эхэлж болно.
 *   2. ГУРВУУЛАА зөвшөөрөх ёстой — 2/3 нь «батлагдсан» БИШ.
 *   3. НЭГ татгалзал хангалттай — бусдыг хүлээхгүй, шууд буцаагдана.
 *   4. ТАТГАЛЗАЛ ДАВАМГАЙЛНА — 2 зөвшөөрөл + 1 татгалзал = буцаагдсан.
 *   5. ЗОХИОГЧ ӨӨРИЙГӨӨ ХЯНАХГҮЙ — серверийн `author`-оор.
 *   6. Нэг хянагч ХОЁР УДАА өгөхгүй.
 *   7. Татгалзахад шалтгаан ЗААВАЛ.
 *   8. Дахин ирүүлэхэд `rev+1` ба бүх хянагчийн бүртгэл ЦЭВЭРЛЭГДЭНЭ.
 *   9. Дугаар нь ЗӨВХӨН латин, багцын код ЗААВАЛ — жишээ материалын 88
 *      алдаа (MONCON, кирилл) боломжгүй.
 */
import assert from 'node:assert/strict';
import {
  REVIEWERS, ALL_REVIEWERS, REVIEWERS_OF, KINDS, MS_STATUS, VERDICT, ORG_CODE,
  pkgCode, orgCode, docNo, parseDocNo, nextSeq, repNo, nextRepNo, repFrom,
  emptyReviews, resolve, progress, review, submit, canAct, history, latest, latestApproved,
  submitCorrection, reopen, ncrClosure, statusLabel, verdictCode, verdictLabel, kindLabel,
  parseBodyOf, parseMeta, emptyBodyOf, inspResult, delayDays, EMPTY_NCR, EMPTY_INSP, EMPTY_MA, EMPTY_META,
  repSeqFor, requiredReviewers, newRevision, nextRevisionBody, applyRepToMaterials, bounce, ackRep, closeAn, closeNcr,
  isAnOpen, activeSameTitle, ncrClosureStatusLabel, repVerdictText, reviewerLabel, MA_CHECKLIST, maCheckLabel,
  ncrSeverityLabel, ncrTypeLabel, ncrProposedLabel, parseCommon, NCR_PREFIX, NOTE_MAX, REP_NOTE_MAX,
  needsMyAction, roleWaitReason, reviewerClashes,
} from './chanarMs.ts';

const T = 1_700_000_000_000;
const base = () => ({
  status: MS_STATUS.review,
  author: 'selbe_guitsetgegch',
  reviews: emptyReviews(),
});

/* ══ 1. Төлөв — өгөгдөл, орчуулагдахгүй ══ */
{
  assert.equal(MS_STATUS.draft, 'Ноорог');
  assert.equal(MS_STATUS.review, 'Хянагдаж байна');
  assert.equal(MS_STATUS.returned, 'Буцаагдсан');
  assert.equal(MS_STATUS.approved, 'Батлагдсан');
  assert.equal(new Set(Object.values(MS_STATUS)).size, 4, 'төлөв давхардав');
  assert.deepEqual([...REVIEWERS], ['tuh', 'chanar', 'habea']);
  assert.deepEqual([...ALL_REVIEWERS], ['tuh', 'chanar', 'habea', 'tug', 'cheng'], '2026-09-28: tug · cheng нэмэгдсэн');
  assert.deepEqual([...KINDS], ['MS', 'MA', 'MIR', 'FIC', 'NCR', 'QMP', 'PRC'], '2026-09-28: QMP · PRC');
  assert.deepEqual(REVIEWERS_OF.MS, REVIEWERS);
  assert.deepEqual(REVIEWERS_OF.QMP, REVIEWERS); assert.deepEqual(REVIEWERS_OF.PRC, REVIEWERS);
  assert.deepEqual([...REVIEWERS_OF.MA], ['cheng', 'chanar', 'tug'], 'MA: ЧХ инженер → Чанар → ТУГ, tuh/habea ОРОХГҮЙ');
  assert.deepEqual([...REVIEWERS_OF.MIR], ['tuh', 'chanar']);
  assert.deepEqual([...REVIEWERS_OF.FIC], ['tuh', 'chanar']);
  assert.deepEqual([...REVIEWERS_OF.NCR], ['tuh', 'chanar', 'tug'], 'NCR: ТМ (tug) 3 дахь хянагч');
  assert.deepEqual(emptyReviews(), { tuh: null, chanar: null, habea: null, tug: null, cheng: null });
  assert.equal(kindLabel('QMP'), 'Чанарын удирдлагын төлөвлөгөө'); assert.equal(kindLabel('PRC'), 'Процедур');
  assert.match(reviewerLabel('cheng'), /хяналтын инженер/);
  /* NCR шошго — ижил утга, өөр нэр */
  assert.equal(statusLabel('NCR', MS_STATUS.review), 'Гүйцэтгэгчид илгээсэн');
  assert.equal(statusLabel('NCR', MS_STATUS.returned), 'Нэмэлт арга хэмжээ шаардлагатай', '2026-09-28: бүртгэлийн 3-р статус');
  assert.equal(ncrClosureStatusLabel(MS_STATUS.review, 1), 'Дахин нээсэн');
  assert.equal(ncrClosureStatusLabel(MS_STATUS.approved, 1), 'Хаагдсан');
  assert.equal(statusLabel('NCR', MS_STATUS.approved), 'Хаагдсан');
  assert.equal(statusLabel('MS', MS_STATUS.approved), 'Батлагдсан');
  assert.equal(kindLabel('MA'), 'Материал');
  /* Шийдвэр 3 утга */
  assert.equal(VERDICT.note, 'Санал бүхий зөвшөөрсөн');
  assert.equal(verdictCode(VERDICT.approve), 'A'); assert.equal(verdictCode(VERDICT.note), 'AN'); assert.equal(verdictCode(VERDICT.return), 'R');
  assert.equal(verdictLabel('AN', 'NCR'), 'Зөвшөөрлийн үндсэн дээр');
  assert.equal(verdictLabel('A', 'NCR'), 'Зөвшөөрсөн');
  assert.equal(verdictLabel(VERDICT.note), 'Тайлбартай батлав (AN)', '2026-09-28: маягтын үгээр');
  assert.equal(verdictLabel('A', 'MA'), 'Батлав (A)'); assert.equal(verdictLabel('R'), 'Татгалзсан (R)');
  assert.match(repVerdictText('AN'), /Approved as noted/);
  /* NCR шошго — маягтын үгээр (E1) */
  assert.equal(ncrSeverityLabel('minor'), 'Жижиг'); assert.equal(ncrSeverityLabel('major'), 'Том');
  assert.equal(ncrTypeLabel('logistics'), 'Тээврийн логистикийн'); assert.equal(ncrTypeLabel('postDelivery'), 'Нийлүүлэлтийн дараах');
  assert.equal(ncrProposedLabel('scrap'), 'Ашиглахгүй байх, устгах'); assert.equal(ncrProposedLabel('redo'), 'Дахин шинээр хийх');
  /* MA бүрдэл 11 (B2) */
  assert.equal(MA_CHECKLIST.length, 11); assert.match(maCheckLabel('labTest'), /Lab test result/);
}

/* ══ 2. ДУГААР — жишээ материалын хэвтэй ЯГ таарна ══ */
{
  assert.equal(pkgCode('Багц 1'), 'P0100');
  assert.equal(pkgCode('Багц 3.3'), 'P0303');
  assert.equal(pkgCode('Багц 4-1'), 'P0401', 'зураастай бичиглэл');
  assert.equal(pkgCode('Багц 7'), 'P0700');
  assert.equal(pkgCode('хог'), null, '⚠️ танихгүй → null, таамаглахгүй');
  assert.equal(pkgCode(''), null);

  assert.equal(orgCode('Багц 3.2'), 'MSC');
  assert.equal(orgCode('Багц 4-1'), 'MONCON');
  assert.equal(orgCode('Багц 99'), null);

  /* Жишээ файлын ЯГ дугаар */
  assert.equal(docNo('Багц 3.2', 11, 1), 'MSC-SLB-MS-P0302-0011-01');
  assert.equal(docNo('Багц 3.3', 1, 0), 'NBG-SLB-MS-P0303-0001-00');
  /* ⚠️ №9 — MONCON багцын кодтой ГАРНА (жишээнд орхигдсон байсан) */
  assert.equal(docNo('Багц 4-1', 1, 0), 'MONCON-SLB-MS-P0401-0001-00');
  /* Бусад төрөл ижил хэвээр */
  assert.equal(docNo('Багц 2', 1, 0, 'MA'), 'SCSEBC-SLB-MA-P0200-0001-00');
  assert.equal(docNo('Багц 2', 3, 1, 'QMP'), 'SCSEBC-SLB-QMP-P0200-0003-01');
  /* ⚠️ 2026-09-28: NCR — төслийн хэмжээний нэг дараалал, багц/rev ҮГҮЙ */
  assert.equal(docNo('Багц 2', 22, 0, 'NCR'), 'STMCC-STMC-NCR-0022');
  assert.equal(docNo('хог', 22, 0, 'NCR'), `${NCR_PREFIX}-0022`, 'NCR-д багцын код шаардахгүй');
  assert.deepEqual(parseDocNo('STMCC-STMC-NCR-0022'), { org: 'STMCC', kind: 'NCR', pkg: '', seq: 22, rev: 0, rep: false });
  assert.deepEqual(parseDocNo('MONCON-SLB-NCR-P0401-0001-00'), { org: 'MONCON', kind: 'NCR', pkg: 'P0401', seq: 1, rev: 0, rep: false }, 'хуучин багц тутмын NCR хэв ч танигдана');
  assert.equal(parseDocNo('STMCC-STMC-NCR-22'), null);
  assert.equal(nextSeq([{ bagts: 'Багц 1', seq: 3 }, { bagts: 'Багц 2', seq: 7 }], null), 8, 'bagts=null → төслийн хэмжээнд');
  /* Хязгаар */
  assert.equal(docNo('Багц 1', 0, 0), null, 'seq 0 байхгүй');
  assert.equal(docNo('Багц 1', 1, 100), null, 'rev 99-өөс хэтрэхгүй');
  assert.equal(docNo('Багц 99', 1, 0), null, 'кодгүй багц → null');

  /* ⚠️ №9 — ЗӨВХӨН ЛАТИН: гаралтад кирилл үсэг ОГТ БАЙХГҮЙ */
  for (const b of Object.keys(ORG_CODE)) {
    const n = docNo(b, 1, 0);
    assert.ok(n && !/[А-Яа-яЁё]/.test(n), `${b}: кирилл орсон — ${n}`);
  }

  /* Задлах — урвуу */
  const p = parseDocNo('MSC-SLB-MS-P0302-0011-01');
  assert.deepEqual(p, { org: 'MSC', kind: 'MS', pkg: 'P0302', seq: 11, rev: 1, rep: false });
  assert.equal(parseDocNo('MONCON-SLB-MA-0001-00'), null, '⚠️ багцгүй хэв ТАНИГДАХГҮЙ');
  assert.equal(parseDocNo('MSC-SLB-МА-Р0302-0003-00'), null, '⚠️ кирилл ТАНИГДАХГҮЙ');
  /* 2026-09-28: REP хэв танигдана */
  assert.deepEqual(parseDocNo('SLB-REP-MA-P0100-0015-00'), { org: null, kind: 'MA', pkg: 'P0100', seq: 15, rev: 0, rep: true });
  assert.equal(repNo('MA', 'Багц 1', 15, 0), 'SLB-REP-MA-P0100-0015-00');
  assert.equal(repNo('NCR', 'Багц 4-1', 3, 0), 'SLB-REP-NCR-P0401-0003-00');
  assert.equal(repNo('MA', 'хог', 1, 0), null);
  assert.equal(parseDocNo('SLB-REP-МА-P0100-0015-00'), null, 'кирилл REP танигдахгүй');
}

/* ══ 2b. REP дараалал — ТӨСЛИЙН ХЭМЖЭЭНД, kind тус бүр ══ */
{
  const docs = [
    { kind: 'MA', rep: { no: 'SLB-REP-MA-P0100-0003-00', at: T, verdict: 'A' } },
    { kind: 'MA', rep: { no: 'SLB-REP-MA-P0302-0007-01', at: T, verdict: 'R' } },
    { kind: 'MA', rep: null },
    { kind: 'MS', rep: { no: 'SLB-REP-MS-P0100-0020-00', at: T, verdict: 'A' } },
    { kind: 'MA', rep: { no: 'хог', at: T, verdict: 'A' } },
  ];
  assert.equal(nextRepNo(docs, 'MA'), 8, '⚠️ багц харгалзахгүй — өөр багцын 0007 → 8');
  assert.equal(nextRepNo(docs, 'MS'), 21);
  assert.equal(nextRepNo(docs, 'NCR'), 1, 'хоосон → 1');
  assert.equal(nextRepNo([], 'MA'), 1);
  /* ⚠️ 2026-09-28: lineage — ижил (kind,bagts,seq) өмнөх хариу байвал NNNN өвлөж RR+1 */
  const lin = [
    { kind: 'MA', bagts: 'Багц 1', seq: 5, rev: 0, rep: { no: 'SLB-REP-MA-P0100-0003-00', at: T, verdict: 'R' } },
    { kind: 'MA', bagts: 'Багц 1', seq: 5, rev: 1, rep: { no: 'SLB-REP-MA-P0100-0003-01', at: T, verdict: 'AN' } },
    { kind: 'MA', bagts: 'Багц 3.2', seq: 5, rev: 0, rep: { no: 'SLB-REP-MA-P0302-0007-00', at: T, verdict: 'A' } },
    { kind: 'MA', bagts: 'Багц 1', seq: 6, rev: 0, rep: null },
  ];
  assert.deepEqual(repSeqFor(lin, 'MA', 'Багц 1', 5), { n: 3, rr: 2 }, 'гурав дахь хариу — 0003-02');
  assert.deepEqual(repSeqFor(lin, 'MA', 'Багц 1', 6), { n: 8, rr: 0 }, 'шинэ lineage — max+1, RR=00');
  assert.deepEqual(repSeqFor(lin, 'MA', 'Багц 3.2', 5), { n: 7, rr: 1 });
  assert.equal(repNo('MA', 'Багц 1', 3, 2), 'SLB-REP-MA-P0100-0003-02');
  /* ⚠️ 2026-09-29 (аудит 10): NCR НЭГ мөртэй — залруулга/дахин нээлтийн дараа өмнөх `rep`
     мөрөнд ҮЛДЭХ ёстой (`chanarStore.submitCorrection`); эс бөгөөс доорх хоёр нь
     {6,0} · 6 биш {1,0} · 1 болж, 0005 өөр баримтад дахин олгогдоно. */
  const ncr = [
    { kind: 'NCR', bagts: 'Багц 1', seq: 22, rev: 0, status: MS_STATUS.review, rep: { no: 'SLB-REP-NCR-P0100-0005-00', at: T, verdict: 'R' } },
  ];
  assert.deepEqual(repSeqFor(ncr, 'NCR', 'Багц 1', 22), { n: 5, rr: 1 }, 'NCR дахин хянагдахад 0005-01');
  assert.deepEqual(repSeqFor(ncr, 'NCR', 'Багц 1', 23), { n: 6, rr: 0 }, 'өөр NCR — 0005-ыг дахин авахгүй');
  assert.equal(nextRepNo(ncr, 'NCR'), 6);
}

/* ══ 3. nextSeq ══ */
{
  const ex = [
    { bagts: 'Багц 1', seq: 3 }, { bagts: 'Багц 1', seq: 7 },
    { bagts: 'Багц 2', seq: 40 },
  ];
  assert.equal(nextSeq(ex, 'Багц 1'), 8);
  assert.equal(nextSeq(ex, 'Багц 2'), 41);
  assert.equal(nextSeq(ex, 'Багц 3.3'), 1, 'хоосон → 1');
  assert.equal(nextSeq([], 'Багц 1'), 1);
}

/* ══ 4. resolve — ⚠️ №1 №2 №3 №4 ══ */
{
  const R = (verdict, who = 'x') => ({ who, at: T, verdict, note: null });
  const A = VERDICT.approve; const N = VERDICT.return;

  assert.equal(resolve(emptyReviews()), MS_STATUS.review, 'хэн ч өгөөгүй');
  assert.equal(resolve({ tuh: R(A), chanar: null, habea: null }), MS_STATUS.review, '1/3');
  /* ⚠️ №2 — 2/3 нь БАТЛАГДСАН БИШ */
  assert.equal(resolve({ tuh: R(A), chanar: R(A), habea: null }), MS_STATUS.review, '⚠️ 2/3 хангалтгүй');
  assert.equal(resolve({ tuh: R(A), chanar: R(A), habea: R(A) }), MS_STATUS.approved, '3/3');
  /* ⚠️ №3 — нэг татгалзал → шууд буцаагдана, бусдыг хүлээхгүй */
  assert.equal(resolve({ tuh: R(N), chanar: null, habea: null }), MS_STATUS.returned, '⚠️ нэг татгалзал хангалттай');
  /* ⚠️ №4 — татгалзал давамгайлна */
  assert.equal(resolve({ tuh: R(A), chanar: R(A), habea: R(N) }), MS_STATUS.returned, '⚠️ 2A+1N = буцаагдсан');
  /* ⚠️ №1 — дараалал үгүй: habea эхэлсэн ч зөв */
  assert.equal(resolve({ tuh: null, chanar: null, habea: R(A) }), MS_STATUS.review);

  assert.deepEqual(progress({ tuh: R(A), chanar: null, habea: R(N) }), { done: 2, total: 3 });
}

/* ══ 5. review — дүрмүүд ══ */
{
  /* Зөв зам: гурвуулаа зөвшөөрнө */
  let d = base();
  let r = review(d, { as: 'tuh', who: 'tuh_user', verdict: VERDICT.approve, now: T });
  assert.ok(r.ok, r.error);
  assert.equal(r.status, MS_STATUS.review);
  d = { ...d, reviews: r.reviews };
  r = review(d, { as: 'habea', who: 'habea_user', verdict: VERDICT.approve, now: T });
  assert.ok(r.ok); assert.equal(r.status, MS_STATUS.review);
  d = { ...d, reviews: r.reviews };
  r = review(d, { as: 'chanar', who: 'chanar_user', verdict: VERDICT.approve, now: T });
  assert.ok(r.ok);
  assert.equal(r.status, MS_STATUS.approved, 'гурав дахь зөвшөөрөл → батлагдсан');
  assert.equal(r.reviews.chanar.who, 'chanar_user');
  assert.equal(r.reviews.chanar.at, T);

  /* ⚠️ №5 — зохиогч өөрийгөө хянахгүй, БҮХ гурван үүргээр */
  for (const as of REVIEWERS) {
    const x = review(base(), { as, who: 'SELBE_GUITSETGEGCH', verdict: VERDICT.approve });
    assert.equal(x.ok, false, `⚠️ зохиогч ${as}-аар хянаж чадахгүй`);
    assert.match(x.error, /Зохиогч/);
  }

  /* ⚠️ №6 — хоёр удаа */
  const once = review(base(), { as: 'tuh', who: 'a', verdict: VERDICT.approve, now: T });
  const twice = review({ ...base(), reviews: once.reviews }, { as: 'tuh', who: 'b', verdict: VERDICT.return, note: 'x' });
  assert.equal(twice.ok, false, '⚠️ нэг үүргээр хоёр дахь шийдвэр');
  assert.match(twice.error, /аль хэдийн/);

  /* ⚠️ №7 — татгалзахад шалтгаан */
  const noReason = review(base(), { as: 'chanar', who: 'c', verdict: VERDICT.return });
  assert.equal(noReason.ok, false);
  assert.match(noReason.error, /шалтгаан/);
  const blank = review(base(), { as: 'chanar', who: 'c', verdict: VERDICT.return, note: '   ' });
  assert.equal(blank.ok, false, 'зайгаар дүүргэсэн шалтгаан хүчингүй');
  const withReason = review(base(), { as: 'chanar', who: 'c', verdict: VERDICT.return, note: 'Дараалал буруу' });
  assert.ok(withReason.ok);
  assert.equal(withReason.status, MS_STATUS.returned);
  assert.equal(withReason.reviews.chanar.note, 'Дараалал буруу');
  /* Зөвшөөрөхөд шалтгаан сонголтоор */
  const okNoNote = review(base(), { as: 'chanar', who: 'c', verdict: VERDICT.approve });
  assert.ok(okNoNote.ok); assert.equal(okNoNote.reviews.chanar.note, null);

  /* Зөвхөн review төлөвт */
  for (const status of [MS_STATUS.draft, MS_STATUS.returned, MS_STATUS.approved]) {
    const x = review({ ...base(), status }, { as: 'tuh', who: 'a', verdict: VERDICT.approve });
    assert.equal(x.ok, false, `${status}-д шийдвэр өгөхгүй`);
  }

  /* Хоосон нэр, танигдахгүй үүрэг */
  assert.equal(review(base(), { as: 'tuh', who: '  ', verdict: VERDICT.approve }).ok, false);
  assert.equal(review(base(), { as: 'tug', who: 'a', verdict: VERDICT.approve }).ok, false, '⚠️ ТУГ MS-ийн хянагч биш');
  assert.equal(review(base(), { as: 'zoo', who: 'a', verdict: VERDICT.approve }).ok, false, 'танигдахгүй үүрэг');

  /* ══ AN — санал бүхий зөвшөөрөл (2026-09-28) ══ */
  const anNoNote = review(base(), { as: 'chanar', who: 'c', verdict: VERDICT.note });
  assert.equal(anNoNote.ok, false, '⚠️ AN-д санал ЗААВАЛ');
  assert.match(anNoNote.error, /санал/i);
  const an = review(base(), { as: 'chanar', who: 'c', verdict: VERDICT.note, note: 'Гагнуурын зургийг нэмнэ үү' });
  assert.ok(an.ok); assert.equal(an.status, MS_STATUS.review);
  const R2 = (verdict, who = 'x', note = null) => ({ who, at: T, verdict, note });
  assert.equal(resolve({ ...emptyReviews(), tuh: R2(VERDICT.approve), chanar: R2(VERDICT.note, 'c', 's'), habea: R2(VERDICT.approve) }),
    MS_STATUS.approved, '⚠️ AN нь зөвшөөрөл — 3/3 батлагдана');
  assert.equal(resolve({ ...emptyReviews(), tuh: R2(VERDICT.note, 'a', 's'), chanar: R2(VERDICT.return, 'c', 's'), habea: null }),
    MS_STATUS.returned, 'R давамгайлна');
  /* Хариуны нэгтгэл */
  const rep = repFrom({ ...emptyReviews(), tuh: R2(VERDICT.approve), chanar: R2(VERDICT.note, 'c', 'Санал 1'), habea: R2(VERDICT.note, 'h', 'Санал 2') }, 'MS');
  assert.equal(rep.verdict, 'AN'); assert.equal(rep.anText, 'Санал 1\nСанал 2'); assert.equal(rep.rReasons, undefined);
  const repR = repFrom({ ...emptyReviews(), tuh: R2(VERDICT.return, 't', 'Буруу'), chanar: null, habea: null }, 'MS');
  assert.equal(repR.verdict, 'R'); assert.deepEqual(repR.rReasons, ['Буруу']);
  /* Хуучин 2 утгатай мөр */
  assert.equal(resolve({ tuh: R2('Зөвшөөрсөн'), chanar: R2('Зөвшөөрсөн'), habea: R2('Зөвшөөрсөн') }), MS_STATUS.approved, 'legacy: tug түлхүүргүй JSON');
  assert.equal(resolve({ tuh: R2('Татгалзсан', 't', 'x'), chanar: null, habea: null }), MS_STATUS.returned);
  assert.deepEqual(progress({ tuh: R2('Зөвшөөрсөн'), chanar: null, habea: null }), { done: 1, total: 3 });
}

/* ══ 5b. MA — cheng → chanar → tug ДАРААЛСАН, tuh/habea ОРОХГҮЙ (2026-09-28 2-р үе шат) ══ */
{
  const ma = { kind: 'MA', status: MS_STATUS.review, author: 'g', reviews: emptyReviews() };
  assert.equal(review(ma, { as: 'tuh', who: 't', verdict: VERDICT.approve }).ok, false, '⚠️ MA-д ТУХ хянахгүй');
  assert.equal(review(ma, { as: 'habea', who: 'h', verdict: VERDICT.approve }).ok, false, '⚠️ MA-д ХАБЭА хянахгүй');
  const early = review(ma, { as: 'tug', who: 'tug_user', verdict: VERDICT.approve });
  assert.equal(early.ok, false, '⚠️ ТУГ cheng-ийн өмнө → татгалзана'); assert.match(early.error, /хяналтын инженер/);
  assert.equal(review(ma, { as: 'chanar', who: 'ch', verdict: VERDICT.approve }).ok, false, 'chanar ч cheng-ийн өмнө үгүй');
  assert.deepEqual(canAct(ma, 'x', ['tuh', 'chanar', 'habea', 'tug', 'cheng']).review, ['cheng'], 'товч зөвхөн cheng');
  assert.equal(canAct(ma, 'x', ['tuh']).clientChecks, false, 'MA-д захиалагчийн багана үгүй');
  const anNo = review(ma, { as: 'cheng', who: 'eng', verdict: VERDICT.approve, perMaterial: { 0: 'A', 1: 'AN' } });
  assert.equal(anNo.ok, false, 'материал AN → шийдвэр AN → санал заавал'); assert.match(anNo.error, /санал/i);
  const r1 = review(ma, { as: 'cheng', who: 'eng', verdict: VERDICT.approve, perMaterial: { 0: 'A', 1: 'AN' }, note: 'Гэрчилгээ нэмнэ', now: T });
  assert.ok(r1.ok, r1.error); assert.equal(r1.status, MS_STATUS.review, '1/3');
  assert.equal(verdictCode(r1.reviews.cheng.verdict), 'AN', '⚠️ материалын AN → хянагчийн шийдвэр AN болж өснө');
  const noNote = review(ma, { as: 'cheng', who: 'eng', verdict: VERDICT.approve, perMaterial: { 0: 'R' } });
  assert.equal(noNote.ok, false, 'материал R → шийдвэр R → шалтгаан заавал'); assert.match(noNote.error, /шалтгаан/);
  const d2 = { ...ma, reviews: r1.reviews };
  assert.deepEqual(canAct(d2, 'x', ['chanar', 'tug']).review, ['chanar'], 'дараагийнх нь chanar');
  const r2 = review(d2, { as: 'chanar', who: 'ch', verdict: VERDICT.note, note: 's', perMaterial: { 1: 'R' }, now: T + 1 });
  assert.ok(r2.ok); assert.equal(r2.status, MS_STATUS.returned, 'chanar-ын материал R → R → буцаагдсан');
  const rep = repFrom(r2.reviews, 'MA');
  assert.equal(rep.verdict, 'R');
  assert.deepEqual(rep.perMaterial, { 0: 'A', 1: 'R' }, 'материал бүрд R > AN > A');
  assert.equal(rep.preparedBy, 'eng', 'боловсруулсан = эхний шийдвэр (cheng)');
  assert.equal(rep.anText, 'Гэрчилгээ нэмнэ', 'R-ээс бусад санал anText-д'); assert.deepEqual(rep.rReasons, ['s']);
  /* Зөв зам: 3/3 */
  const a2 = review(d2, { as: 'chanar', who: 'ch', verdict: VERDICT.approve, now: T + 1, note: 'Сайн' });
  assert.ok(a2.ok); assert.equal(a2.status, MS_STATUS.review, '2/3');
  assert.deepEqual(progress(a2.reviews, 'MA'), { done: 2, total: 3 });
  const a3 = review({ ...ma, reviews: a2.reviews }, { as: 'tug', who: 'tm', verdict: VERDICT.approve, now: T + 2 });
  assert.ok(a3.ok); assert.equal(a3.status, MS_STATUS.approved, 'cheng → chanar → tug → батлагдсан');
  const rep3 = repFrom(a3.reviews, 'MA');
  assert.equal(rep3.verdict, 'AN'); assert.equal(rep3.anText, 'Гэрчилгээ нэмнэ\nСайн', 'A шийдвэрийн санал ч хариунд харагдана');
  /* ⚠️ ХУУЧИН MA мөр (cheng-гүй эхэлсэн, өнөөдрийн өгөгдөл): chanar шийдсэн бол cheng алгасагдана */
  const legacy = { ...ma, reviews: { ...emptyReviews(), chanar: { who: 'ch', at: T, verdict: VERDICT.approve, note: null } } };
  assert.deepEqual([...requiredReviewers(legacy.reviews, 'MA')], ['chanar', 'tug']);
  assert.equal(resolve(legacy.reviews, 'MA'), MS_STATUS.review);
  assert.deepEqual(progress(legacy.reviews, 'MA'), { done: 1, total: 2 });
  /* ⚠️ 2026-10-09: chanar ганцаараа баталсан хуучин MA (approved) — «1/2» биш «1/1»; буцаагдсан ч мөн */
  assert.deepEqual(progress(legacy.reviews, 'MA', MS_STATUS.approved), { done: 1, total: 1 });
  assert.deepEqual(progress(legacy.reviews, 'MA', MS_STATUS.returned), { done: 1, total: 1 });
  assert.deepEqual(progress(legacy.reviews, 'MA', MS_STATUS.review), { done: 1, total: 2 });
  assert.deepEqual(canAct(legacy, 'x', ['cheng', 'tug']).review, ['tug'], 'хуучин мөрд cheng товч гарахгүй, tug шууд');
  const lt = review(legacy, { as: 'tug', who: 'tm', verdict: VERDICT.approve });
  assert.ok(lt.ok, lt.error); assert.equal(lt.status, MS_STATUS.approved, 'хуучин мөр 2/2 → батлагдсан');
  assert.equal(resolve({ ...emptyReviews(), chanar: { who: 'ch', at: T, verdict: VERDICT.approve, note: null }, tug: { who: 'tm', at: T, verdict: VERDICT.approve, note: null } }, 'MA'), MS_STATUS.approved, 'legacy JSON (cheng түлхүүргүй)');
}

/* ══ 5c. MIR/FIC — ДАРААЛСАН: tuh эхлээд, дараа нь chanar ══ */
{
  for (const kind of ['MIR', 'FIC']) {
    const d = { kind, status: MS_STATUS.review, author: 'g', reviews: emptyReviews() };
    const early = review(d, { as: 'chanar', who: 'ch', verdict: VERDICT.approve });
    assert.equal(early.ok, false, `⚠️ ${kind}: chanar tuh-ийн өмнө → татгалзана`);
    assert.match(early.error, /ТУХ/);
    assert.deepEqual(canAct(d, 'ch', ['tuh', 'chanar']).review, ['tuh'], 'товч ч зөвхөн tuh');
    assert.equal(canAct(d, 'ch', ['tuh']).clientChecks, true, 'tuh захиалагчийн баганыг бөглөнө');
    assert.equal(canAct(d, 'ch', ['chanar']).clientChecks, false);
    const t = review(d, { as: 'tuh', who: 't', verdict: VERDICT.approve });
    assert.ok(t.ok); assert.equal(t.status, MS_STATUS.review);
    const d2 = { ...d, reviews: t.reviews };
    assert.equal(canAct(d2, 't', ['tuh']).clientChecks, false, 'tuh шийдсэний дараа багана хаагдана');
    assert.deepEqual(canAct(d2, 'ch', ['tuh', 'chanar']).review, ['chanar']);
    const c = review(d2, { as: 'chanar', who: 'ch', verdict: VERDICT.approve });
    assert.ok(c.ok); assert.equal(c.status, MS_STATUS.approved, 'tuh → chanar → батлагдсан');
    assert.equal(review(d, { as: 'habea', who: 'h', verdict: VERDICT.approve }).ok, false, 'habea орохгүй');
    assert.equal(review(d, { as: 'tug', who: 'h', verdict: VERDICT.approve }).ok, false, 'tug орохгүй');
  }
  /* Үзлэгийн дүн — бодогдоно */
  const it = (contractor, client) => ({ no: 1, text: '', section: null, contractor, client, comment: '' });
  assert.equal(inspResult([]), 'pending');
  assert.equal(inspResult([it('OK', 'OK'), it('OK', 'NA')]), 'pass');
  assert.equal(inspResult([it('OK', 'OK'), it('OK', null)]), 'pending');
  assert.equal(inspResult([it('OK', 'OK'), it('X', 'OK')]), 'fail');
  assert.equal(inspResult([it('OK', 'X')]), 'fail');
  /* 2026-09-28: захиалагчийн багана хоосон ч tuh A/AN эсвэл approved → тэнцсэн; X давамгайлна */
  assert.equal(inspResult([it('OK', null)], { tuhVerdict: 'A' }), 'pass');
  assert.equal(inspResult([it('OK', null)], { tuhVerdict: VERDICT.note }), 'pass');
  assert.equal(inspResult([it('OK', null)], { tuhVerdict: 'R' }), 'pending');
  assert.equal(inspResult([], { approved: true }), 'pass');
  assert.equal(inspResult([it('X', null)], { approved: true }), 'fail');
}

/* ══ 5d. NCR — захиалагч нээнэ, гүйцэтгэгч залруулна, tuh+chanar дүгнэнэ ══ */
{
  const opener = 'tuh_user';
  const ncr0 = { kind: 'NCR', status: MS_STATUS.draft, rev: 0, author: opener, reviews: emptyReviews() };
  /* submit: зөвхөн нээгч, rev ҮГҮЙ */
  assert.equal(submit(ncr0, { who: 'contractor' }).ok, false, 'гүйцэтгэгч илгээхгүй');
  const s0 = submit(ncr0, { who: opener, now: T });
  assert.ok(s0.ok); assert.equal(s0.rev, 0); assert.equal(s0.status, MS_STATUS.review);
  assert.equal(submit({ ...ncr0, status: MS_STATUS.returned }, { who: opener }).ok, false, 'NCR буцаагдсаныг нээгч дахин илгээхгүй — гүйцэтгэгчийн ээлж');
  /* review: correction-гүй → татгалзана */
  const ncr1 = { ...ncr0, status: MS_STATUS.review, correctionAt: null };
  const noCorr = review(ncr1, { as: 'chanar', who: 'ch', verdict: VERDICT.approve });
  assert.equal(noCorr.ok, false, '⚠️ залруулгын тайлангүй дүгнэлт ҮГҮЙ');
  assert.match(noCorr.error, /залруулг/);
  assert.deepEqual(canAct(ncr1, 'ch', ['chanar']).review, [], 'товч ч гарахгүй');
  assert.equal(canAct(ncr1, 'con', [], { contractor: true }).correction, true, 'гүйцэтгэгчид залруулгын товч');
  assert.equal(canAct(ncr1, 'con', []).correction, false, 'гүйцэтгэгч биш → үгүй');
  /* correction */
  const bad = submitCorrection(ncr1, EMPTY_NCR, { who: 'con', correction: { text: '  ', completedAt: null, steps: [] } });
  assert.equal(bad.ok, false, 'хоосон тайлбар');
  assert.equal(submitCorrection({ kind: 'MS', status: MS_STATUS.review }, EMPTY_NCR, { who: 'con', correction: { text: 'x', completedAt: null, steps: [] } }).ok, false, 'зөвхөн NCR');
  assert.equal(submitCorrection({ ...ncr1, status: MS_STATUS.draft }, EMPTY_NCR, { who: 'con', correction: { text: 'x', completedAt: null, steps: [] } }).ok, false, 'ноорогт үгүй');
  const c1 = submitCorrection(ncr1, EMPTY_NCR, { who: 'con', correction: { text: 'Дахин цутгав', completedAt: T, steps: [' а ', '', 'б'] }, now: T + 1 });
  assert.ok(c1.ok, c1.error);
  assert.equal(c1.body.correctionAt, T + 1); assert.equal(c1.body.correction.text, 'Дахин цутгав');
  assert.deepEqual(c1.body.correction.steps, ['а', 'б']);
  assert.equal(c1.status, MS_STATUS.review); assert.deepEqual(c1.reviews, emptyReviews());
  /* Rejected → returned */
  const ncr2 = { ...ncr1, correctionAt: c1.body.correctionAt };
  assert.equal(review(ncr2, { as: 'habea', who: 'h', verdict: VERDICT.approve }).ok, false, 'habea NCR-д орохгүй');
  assert.equal(review(ncr2, { as: 'cheng', who: 'h', verdict: VERDICT.approve }).ok, false, 'cheng NCR-д орохгүй');
  const rj = review(ncr2, { as: 'tuh', who: opener, verdict: VERDICT.return, note: 'Хангалтгүй' });
  assert.ok(rj.ok, '⚠️ NCR: нээгч өөрөө дүгнэж болно (хянаж буй зүйл нь гүйцэтгэгчийн залруулга)');
  assert.equal(rj.status, MS_STATUS.returned, 'Rejected → Дахин засах');
  assert.equal(statusLabel('NCR', rj.status), 'Нэмэлт арга хэмжээ шаардлагатай');
  /* returned → correction дахин (rev үгүй) → review */
  const c2 = submitCorrection({ ...ncr2, status: rj.status, reviews: rj.reviews }, c1.body, { who: 'con', correction: { text: 'Дахин', completedAt: T, steps: [] }, now: T + 2 });
  assert.ok(c2.ok); assert.equal(c2.status, MS_STATUS.review);
  /* ⚠️ 2026-09-30: өмнөх тойрог (залруулга + татгалзлын шалтгаан) устахгүй */
  assert.equal(c1.body.rounds.length, 0, 'анхны илгээлтэд тойрог үгүй');
  assert.equal(c2.body.rounds.length, 1, 'дахин илгээхэд өмнөх тойрог хадгалагдана');
  assert.equal(c2.body.rounds[0].end, 'resubmit'); assert.equal(c2.body.rounds[0].by, 'con');
  assert.equal(c2.body.rounds[0].correction.text, 'Дахин цутгав', 'өмнөх залруулгын текст');
  assert.equal(c2.body.rounds[0].reviews.tuh.note, 'Хангалтгүй', 'татгалзлын шалтгаан');
  assert.equal(c2.body.rounds[0].status, MS_STATUS.returned);
  assert.deepEqual(parseBodyOf('NCR', JSON.stringify(c2.body)).rounds, c2.body.rounds, 'тойрог JSON-оор бүрэн эргэнэ');
  assert.equal(canAct({ ...ncr2, status: rj.status }, 'con', [], { contractor: true }).correction, true, 'буцаагдсанд ч залруулгын товч');
  /* Accepted + Concession → approved (хаагдсан) */
  const ncr3 = { ...ncr2, status: c2.status, reviews: c2.reviews, correctionAt: c2.body.correctionAt };
  const a1 = review(ncr3, { as: 'tuh', who: opener, verdict: VERDICT.approve });
  assert.ok(a1.ok); assert.equal(a1.status, MS_STATUS.review, '1/3');
  const a2x = review({ ...ncr3, reviews: a1.reviews }, { as: 'chanar', who: 'ch', verdict: VERDICT.note, note: 'Зөвшөөрлийн үндсэн дээр' });
  assert.ok(a2x.ok); assert.equal(a2x.status, MS_STATUS.review, '2/3 — ТМ (tug) хүлээнэ (2026-09-28)');
  const a2 = review({ ...ncr3, reviews: a2x.reviews }, { as: 'tug', who: 'tm', verdict: VERDICT.approve });
  assert.ok(a2.ok); assert.equal(a2.status, MS_STATUS.approved, 'Concession → хаагдсан');
  assert.equal(repFrom(a2.reviews, 'NCR').verdict, 'AN');
  const closed = ncrClosure(c2.body, 'CH', T + 5);
  assert.deepEqual(closed.closure, {
    completedAt: T, verifiedBy: 'ch', verifiedAt: T + 5, docType: null, action: null, result: null,
    closedByContractor: [], archive: { original: false, server: false, backup: false },
  });
  /* Гүйцэтгэгч «Хаасан» (2026-09-28) */
  const ncrDone = { kind: 'NCR', status: MS_STATUS.approved, author: opener, reviews: emptyReviews() };
  assert.equal(closeNcr(ncrDone, c2.body, { who: 'con', closedByContractor: [{ name: 'Бат', position: 'БУ менежер', date: T }] }).ok, false, 'захиалагч баталгаажуулаагүй (closure null) → үгүй');
  assert.equal(closeNcr(ncrDone, closed, { who: 'con', closedByContractor: [{ name: ' ', position: '', date: null }] }).ok, false, 'хаагчийн нэр заавал');
  const cn = closeNcr(ncrDone, closed, { who: 'con', closedByContractor: [{ name: 'Бат', position: 'БУ менежер', date: T }, { name: 'Дорж', position: 'ЧИ', date: null }, { name: 'илүү', position: '', date: null }], docType: 'report', action: 'repair', result: 'ok', archive: { server: true } });
  assert.ok(cn.ok, cn.error);
  assert.equal(cn.body.closure.closedByContractor.length, 2, 'дээд тал нь 2 мөр');
  assert.equal(cn.body.closure.docType, 'report'); assert.equal(cn.body.closure.result, 'ok');
  assert.deepEqual(cn.body.closure.archive, { original: false, server: true, backup: false });
  assert.equal(cn.body.closure.verifiedBy, 'ch', 'захиалагчийн баталгаажуулалт хэвээр');
  assert.equal(canAct(ncrDone, 'con', [], { contractor: true }).closeNcr, true);
  assert.equal(canAct(ncrDone, 'con', [], { contractor: true, ncrClosed: true }).closeNcr, false);
  const rt = parseBodyOf('NCR', JSON.stringify(cn.body));
  assert.deepEqual(rt.closure, cn.body.closure, 'хаалт JSON-оор бүрэн эргэнэ');
  assert.equal(rt.initialVerdict, 'R', 'анхны дүгнэлт анхдагч Rejected');
  /* reopen */
  const ncr4 = { ...ncr3, status: a2.status, reviews: a2.reviews };
  assert.equal(canAct(ncr4, 'ch', ['chanar']).reopen, true);
  assert.equal(canAct(ncr4, 'h', ['habea']).reopen, false);
  assert.equal(reopen({ kind: 'NCR', status: MS_STATUS.review }, closed).ok, false, 'зөвхөн хаагдсаныг');
  assert.equal(reopen(ncr4, closed, { who: 'ch', reason: '  ' }).ok, false, '⚠️ 2026-09-30: шалтгаан заавал');
  const ro = reopen({ ...ncr4, rep: { no: 'REP-1', at: T, verdict: 'AN' } }, closed, { who: 'CH', reason: 'Дахин цуурсан', now: T + 9 });
  assert.ok(ro.ok); assert.equal(ro.status, MS_STATUS.review); assert.equal(ro.body.reopened, 1);
  assert.equal(ro.body.correctionAt, null, 'дахин нээхэд залруулга дахин шаардана'); assert.equal(ro.body.closure, null);
  assert.deepEqual(ro.reviews, emptyReviews());
  /* ⚠️ 2026-09-30: хаалтын бүртгэл тойрогт үлдэнэ */
  const rd = ro.body.rounds.at(-1);
  assert.equal(rd.end, 'reopen'); assert.equal(rd.reason, 'Дахин цуурсан'); assert.equal(rd.by, 'ch'); assert.equal(rd.at, T + 9);
  assert.deepEqual(rd.closure, closed.closure, 'хаалт устахгүй');
  assert.equal(rd.reviews.tug.who, 'tm', 'хаасан шийдвэрүүд');
  assert.deepEqual(rd.rep, { no: 'REP-1', verdict: 'AN' });
  /* NCR canAct: нээгч ноорогт засна, review-д үгүй */
  assert.equal(canAct(ncr0, opener, ['tuh']).edit, true);
  assert.equal(canAct({ ...ncr0, status: MS_STATUS.returned }, opener, ['tuh']).edit, false, 'буцаагдсан NCR нээгч засахгүй');
}

/* ══ 5e. Бие — хуучин/эвдэрсэн JSON-д тэсвэртэй ══ */
{
  assert.deepEqual(parseBodyOf('MA', 'хог'), EMPTY_MA);
  assert.deepEqual(parseBodyOf('MIR', '{}'), EMPTY_INSP);
  assert.deepEqual(parseBodyOf('NCR', null), EMPTY_NCR);
  const ms = parseBodyOf('MS', JSON.stringify({ general: 'g', scope: 1 }));
  assert.equal(ms.general, 'g'); assert.equal(ms.scope, ''); assert.deepEqual(ms.meta, EMPTY_META);
  assert.deepEqual(ms.revHistory, []); assert.deepEqual(ms.bounces, []); assert.equal(ms.revNote, '');
  const ma = parseBodyOf('MA', JSON.stringify({ materials: [{ name: 'Арматур', origin: 'foreign' }, 'хог'], checklist: { labTest: true, zoo: true }, drawingsMatch: 'тийм', meta: { owner: 'ADMIN', preparedAt: T, workType: 'w02' } }));
  assert.equal(ma.materials.length, 2); assert.equal(ma.materials[0].origin, 'foreign'); assert.equal(ma.materials[1].name, '');
  assert.equal(ma.checklist.labTest, true); assert.equal(ma.checklist.sample, false); assert.equal(ma.drawingsMatch, null);
  assert.equal(ma.meta.owner, 'admin'); assert.equal(ma.meta.workType, 'w02');
  assert.deepEqual(ma.meta.owners, ['admin'], '⚠️ хуучин `owner` мөр → owners[]');
  assert.equal(ma.materials[0].locked, false); assert.equal(ma.materials[0].verdict, null); assert.equal(ma.materials[0].meets, null);
  const m2 = parseBodyOf('MA', JSON.stringify({ meta: { owners: ['A', 'b', 'c'], owner: 'b', pageCount: 12, discipline: ['Civil', 5] }, materials: [{ name: 'x', verdict: 'AN', locked: true, meets: true, arrivedAt: T }], signatures: { prepared: { name: 'Бат' } }, submittalType: 'ma', refs: ['MSC-SLB-MS-P0302-0001-00'] }));
  assert.deepEqual(m2.meta.owners, ['a', 'b'], 'owners 2 хүртэл, жижиг үсгээр'); assert.equal(m2.meta.owner, 'a'); assert.equal(m2.meta.pageCount, 12); assert.deepEqual(m2.meta.discipline, ['Civil']);
  assert.equal(m2.materials[0].verdict, 'AN'); assert.equal(m2.materials[0].locked, true); assert.equal(m2.materials[0].meets, true); assert.equal(m2.materials[0].arrivedAt, T);
  assert.equal(m2.signatures.prepared.name, 'Бат'); assert.equal(m2.signatures.approved.name, ''); assert.equal(m2.submittalType, 'ma'); assert.equal(m2.refs.length, 1);
  const insp2 = parseBodyOf('MIR', JSON.stringify({ header: { building: 'B1', location: 'хуучин' }, template: 'mir62', attachments: { cubes: true, survey: 1 } }));
  assert.equal(insp2.header.materialName, ''); assert.equal(insp2.header.location, 'хуучин', 'хуучин талбар уншигдана'); assert.equal(insp2.template, 'mir62');
  assert.equal(insp2.attachments.cubes, true); assert.equal(insp2.attachments.survey, false); assert.equal(insp2.attachments.labTest, false);
  assert.deepEqual(parseCommon('{"revHistory":[{"rev":1,"at":' + T + ',"reason":"r","by":"A"},{"rev":"x"}],"bounces":[{"at":' + T + ',"by":"c","reason":"format","note":"n"},{"reason":"zoo"}]}'),
    { revNote: '', revHistory: [{ rev: 1, at: T, reason: 'r', by: 'a' }], bounces: [{ at: T, by: 'c', reason: 'format', note: 'n' }] });
  assert.ok('general' in emptyBodyOf('QMP') && 'meta' in emptyBodyOf('PRC'), 'QMP/PRC — MS бие');
  const insp = parseBodyOf('FIC', JSON.stringify({ items: [{ text: 'a', contractor: 'OK', client: 'zoo' }, { no: 5, text: 'b', client: 'X' }] }));
  assert.equal(insp.items[0].no, 1); assert.equal(insp.items[0].client, null); assert.equal(insp.items[1].no, 5); assert.equal(insp.items[1].client, 'X');
  const ncr = parseBodyOf('NCR', JSON.stringify({ severity: 'major', types: ['design', 'zoo'], proposed: ['redo'], correctionAt: T, closure: { verifiedAt: T, verifiedBy: 'x' }, reopened: 2 }));
  assert.equal(ncr.severity, 'major'); assert.deepEqual(ncr.types, ['design']); assert.equal(ncr.correctionAt, T); assert.equal(ncr.closure.verifiedBy, 'x'); assert.equal(ncr.reopened, 2);
  assert.equal(parseMeta('{"meta":{"category":"Арматур"}}').category, 'Арматур');
  assert.equal(parseMeta('хог').category, '');
  assert.equal(emptyBodyOf('NCR').reopened, 0);
  assert.ok('general' in emptyBodyOf('MS') && 'meta' in emptyBodyOf('MS'));
  assert.equal(delayDays({ sentAt: T, decidedAt: T + 3 * 86_400_000 }), 3);
  assert.equal(delayDays({ sentAt: null, decidedAt: null }), null);
  assert.equal(delayDays({ sentAt: T, decidedAt: null }, T + 86_400_000 * 1.5), 1);
}

/* ══ 6. submit — ⚠️ №8 ══ */
{
  const d0 = { status: MS_STATUS.draft, rev: 0, author: 'selbe_guitsetgegch' };
  const s0 = submit(d0, { who: 'selbe_guitsetgegch', now: T });
  assert.ok(s0.ok);
  assert.equal(s0.rev, 0, 'анхны илгээлт rev 0 хэвээр');
  assert.equal(s0.status, MS_STATUS.review);
  assert.equal(s0.sentAt, T);
  assert.deepEqual(s0.reviews, emptyReviews());

  /* ⚠️ №8 — буцаагдсанаас дахин: rev+1, хянагчид ЦЭВЭР */
  const d1 = { status: MS_STATUS.returned, rev: 0, author: 'selbe_guitsetgegch' };
  const s1n = submit(d1, { who: 'selbe_guitsetgegch', now: T });
  assert.equal(s1n.ok, false, '⚠️ 2026-09-28: rev>0 илгээлтэд хувилбарын шалтгаан ЗААВАЛ'); assert.match(s1n.error, /шалтгаан/);
  assert.equal(submit({ ...d0, rev: 2 }, { who: 'selbe_guitsetgegch' }).ok, false, 'rev 2 ноорог ч шалтгаангүй илгээхгүй');
  const s1 = submit(d1, { who: 'selbe_guitsetgegch', now: T, revNote: 'Нийлүүлэгч сольсон' });
  assert.ok(s1.ok);
  assert.equal(s1.rev, 1, '⚠️ буцаагдаад дахин → rev+1');
  assert.deepEqual(s1.reviews, emptyReviews(), '⚠️ өмнөх зөвшөөрлүүд ХҮЧИНГҮЙ — гурвуулаа дахин');

  /* Зөвхөн зохиогч */
  assert.equal(submit(d0, { who: 'other' }).ok, false);
  /* Хянагдаж буй / батлагдсаныг дахин илгээхгүй */
  assert.equal(submit({ ...d0, status: MS_STATUS.review }, { who: 'selbe_guitsetgegch' }).ok, false);
  assert.equal(submit({ ...d0, status: MS_STATUS.approved }, { who: 'selbe_guitsetgegch' }).ok, false);
  /* Нэр том/жижиг үсэг хамаагүй */
  assert.ok(submit(d0, { who: 'SELBE_GUITSETGEGCH' }).ok);
}

/* ══ 7. canAct — дэлгэцийн урьдчилсан харуулалт ══ */
{
  const d = base();
  const me = 'selbe_guitsetgegch';
  const none = { correction: false, reopen: false, clientChecks: false, bounce: false, ack: false, closeAn: false, newRevision: false, closeNcr: false };
  /* Зохиогч: review төлөвт засахгүй, илгээхгүй, хянахгүй */
  assert.deepEqual(canAct(d, me, ['tuh']), { edit: false, submit: false, review: [], ...none });
  /* Зохиогч ноорогт: засна, илгээнэ */
  assert.deepEqual(canAct({ ...d, status: MS_STATUS.draft }, me, []), { edit: true, submit: true, review: [], ...none });
  /* ⚠️ 2026-09-29 (аудит 10): шинэ хувилбартай хуучин буцаагдсан мөр — засах/илгээх хаалттай */
  const ret = canAct({ ...d, status: MS_STATUS.returned }, me, []);
  assert.equal(ret.edit, true); assert.equal(ret.submit, true);
  const old = canAct({ ...d, status: MS_STATUS.returned }, me, [], { superseded: true });
  assert.equal(old.edit, false, 'superseded → засахгүй'); assert.equal(old.submit, false, 'superseded → илгээхгүй');
  assert.equal(ret.newRevision, true); assert.equal(old.newRevision, false, 'superseded → шинэ хувилбар гаргахгүй');
  /* Хянагч: зөвхөн өгөөгүй үүргээр */
  const half = { ...d, reviews: { ...emptyReviews(), tuh: { who: 'x', at: T, verdict: VERDICT.approve, note: null } } };
  assert.deepEqual(canAct(half, 'rev', ['tuh', 'chanar']).review, ['chanar'], 'tuh өгсөн → зөвхөн chanar үлдэнэ');
  /* ⚠️ Нэг хүн нэг үүрэг (2026-09-17): ТУХ-аар өөрөө шийдсэн хүнд бусад товч гарахгүй */
  const mineHalf = { ...d, reviews: { ...emptyReviews(), tuh: { who: 'REV', at: T, verdict: VERDICT.approve, note: null } } };
  assert.deepEqual(canAct(mineHalf, 'rev', ['tuh', 'chanar', 'habea']).review, [], 'өөрөө нэг үүргээр шийдсэн → бусад үүрэг хаагдана');
  /* Хянагч бус: хоосон */
  assert.deepEqual(canAct(d, 'rev', []).review, []);
  /* Нэвтрээгүй */
  assert.deepEqual(canAct(d, null, ['tuh']), { edit: false, submit: false, review: [], ...none });
  /* MS-д tug товч гарахгүй */
  assert.deepEqual(canAct(d, 'rev', ['tug', 'habea']).review, ['habea']);
}

/* ══ 8. history · latest ══ */
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
  assert.equal(history([...docs, mk('Багц 1', 1, 0, MS_STATUS.draft, 'MA')], 'Багц 1', 1, 'MS').length, 3);
  const h = history(docs, 'Багц 1', 1);
  assert.deepEqual(h.map((d) => d.rev), [0, 1, 2], 'rev өсөхөөр');
  assert.equal(history(docs, 'Багц 1', 9).length, 0);

  const l = latest(docs);
  assert.equal(l.length, 3, '3 өөр баримт');
  const b1s1 = l.find((d) => d.bagts === 'Багц 1' && d.seq === 1);
  assert.equal(b1s1.rev, 2, '⚠️ сүүлийн хувилбар л жагсаалтад');

  /* ⚠️ 2026-10-09 (аудит №6): `latestApproved` — батлагдсан rev N дээр rev+1 ноорог үүссэн ч (иш татах ·
     QAQC холбоос · батлагдсан тоонд) rev N хүчинтэй хэвээр; шинэ rev батлагдвал тэр нь орлоно. */
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


/* ══════════ НЭГ ХҮН НЭГ ҮҮРЭГ (2026-09-16-ны аудит) ══════════ */
/**
 * ⚠️ ЯАГААД: дүрэм 3 нь «нэг хянагч хоёр удаа шийдвэр өгөхгүй» гэж
 *    бичигдсэн ч код нь ЗӨВХӨН СЛОТ-оор (`doc.reviews[args.as]`) шалгадаг
 *    байв. Гурван хянагчийн үүргийг нэг аккаунтад олговол (`scopedAcl`
 *    зөвшөөрдөг, `ChanarAcl` хориглодоггүй, `reviewerRolesFor` нь хүрээ
 *    таарвал гурвуулангийг буцаадаг) тэр хүн ТУХ → Чанар → ХАБЭА гэж
 *    дараалан батлаж, баримтыг ГАНЦААРАА `approved` болгож чаддаг байлаа —
 *    «гурван ХАРААТ БУС хянагч» гэсэн бүх утга нэг гарын үсэг болно.
 */
{
  const doc0 = { status: MS_STATUS.review, author: 'zohiogch', reviews: { tuh: null, chanar: null, habea: null } };

  /* 1) Эхний үүргээр — зөвшөөрөгдөнө */
  const r1 = review(doc0, { as: 'tuh', who: 'Hyanagch_A', verdict: VERDICT.approve });
  assert.equal(r1.ok, true, 'эхний шийдвэр зөвшөөрөгдөх ёстой');

  /* 2) ИЖИЛ хүн ӨӨР үүргээр — ТАТГАЛЗАНА (энэ нь шинэ дүрэм) */
  const r2 = review(
    { ...doc0, reviews: r1.reviews },
    { as: 'chanar', who: 'hyanagch_a', verdict: VERDICT.approve },
  );
  assert.equal(r2.ok, false, 'нэг хүн ХОЁР үүргээр шийдвэр өгч байна — гурван хараат бус хянагч утгагүй болно');
  assert.match(r2.error, /НЭГ үүргээр/, 'татгалзлын шалтгаан нь дүрмийг хэлэх ёстой');

  /* ⚠️ ТОМ/ЖИЖИГ ҮСЭГ: ACL нь нэрийг жижгээр хадгалдаг тул тулгалт ч
     ижил байх ёстой — дээрх 'hyanagch_a' нь 'Hyanagch_A'-тай ижил хүн. */

  /* 3) ӨӨР хүн өөр үүргээр — зөвшөөрөгдөнө (хууль ёсны зам хаагдаагүй) */
  const r3 = review(
    { ...doc0, reviews: r1.reviews },
    { as: 'chanar', who: 'Hyanagch_B', verdict: VERDICT.approve },
  );
  assert.equal(r3.ok, true, 'өөр хянагчийн зам хаагдсан — дүрэм хэт өргөн');

  /* 4) ИЖИЛ үүргээр дахин — хэвээр татгалзана (хуучин дүрэм эвдрээгүй) */
  const r4 = review(
    { ...doc0, reviews: r1.reviews },
    { as: 'tuh', who: 'Hyanagch_B', verdict: VERDICT.approve },
  );
  assert.equal(r4.ok, false, 'ижил үүргээр дахин шийдвэр — слотын шалгуур эвдэрсэн');
}
console.log('✅ нэг хүн НЭГ үүрэг — үүргийн слот БА хүн хоёуланг барина');

/* ══ 9. ORG_CODE ⊇ PKG_GROUPS — АНХААРУУЛГА (2026-09-16 аудит) ══
 * ⚠️ `assert` БИШ: гүйцэтгэгчийн код нь албан баримтын дугаарт ордог тул
 *    кодоор зохиож болохгүй — ЗӨВХӨН хэрэглэгч өгнө. Дутуу багцад «+ Шинэ
 *    аргачлал» ажиллахгүй гэдгийг энд ил хэлнэ (5/15 багц, 2026-09-16). */
{
  const { PKG_GROUPS } = await import('@/modules/sheet/bagts.pkg.ts');
  const { ORG_CODE: OC } = await import('@/lib/chanarMs.ts');
  const miss = PKG_GROUPS.filter((g) => !OC[g]);
  if (miss.length) console.warn(`⚠️ ORG_CODE-д ${miss.length} багц ДУТУУ — тэдгээрт аргачлал үүсэх боломжгүй: ${miss.join(' · ')}`);
  else console.log('✅ ORG_CODE бүх багцыг хамарсан');
}

/* ══════════ 2-Р ҮЕ ШАТ (2026-09-28): AN нээлттэй · шинэ хувилбар · түгжээ · буцаалт · хүлээн авалт ══════════ */
{
  const rv = (verdict, who = 'x', note = null) => ({ who, at: T, verdict, note });
  const repAN = { no: 'SLB-REP-MA-P0100-0003-00', at: T, verdict: 'AN', anText: 'нөхцөл', perMaterial: { 0: 'AN', 1: 'A' } };
  const doc = { kind: 'MA', status: MS_STATUS.approved, author: 'g', reviews: { ...emptyReviews(), cheng: rv(VERDICT.approve, 'e'), chanar: rv(VERDICT.note, 'c', 'нөхцөл'), tug: rv(VERDICT.approve, 't') }, rep: repAN };
  /* AN нээлттэй */
  assert.equal(isAnOpen(doc), true); assert.equal(isAnOpen({ ...doc, rep: { ...repAN, verdict: 'A' } }), false);
  assert.equal(canAct(doc, 'c', ['chanar']).closeAn, true, 'хянагчид AN хаах товч');
  assert.equal(canAct(doc, 'g', []).closeAn, false);
  assert.equal(closeAn(doc, { as: 'chanar', who: 'c', no: 'SLB-REP-MA-P0100-0003-01' }).ok, true);
  assert.equal(closeAn(doc, { as: 'tuh', who: 'c', no: 'x' }).ok, false, 'MA-д tuh үгүй');
  assert.equal(closeAn({ ...doc, rep: { ...repAN, verdict: 'A' } }, { as: 'chanar', who: 'c', no: 'x' }).ok, false, 'AN биш → хаах зүйл үгүй');
  assert.equal(closeAn({ ...doc, status: MS_STATUS.review }, { as: 'chanar', who: 'c', no: 'x' }).ok, false);
  const ca = closeAn(doc, { as: 'chanar', who: 'C', note: 'биелсэн', now: T + 9, no: 'SLB-REP-MA-P0100-0003-01' });
  assert.ok(ca.ok);
  assert.equal(ca.rep.verdict, 'A'); assert.equal(ca.rep.no, 'SLB-REP-MA-P0100-0003-01'); assert.equal(ca.rep.anClosedBy, 'c'); assert.equal(ca.rep.anClosedAt, T + 9);
  assert.deepEqual(ca.rep.perMaterial, { 0: 'A', 1: 'A' }, 'AN материал → A'); assert.equal(ca.rep.anText, 'нөхцөл\nбиелсэн');
  /* Хүлээн авах */
  assert.equal(canAct(doc, 'g', []).ack, true, 'зохиогчид хүлээн авах товч');
  assert.equal(canAct({ ...doc, rep: { ...repAN, receivedAt: T } }, 'g', []).ack, false);
  assert.equal(ackRep(doc, { who: 'other' }).ok, false);
  assert.equal(ackRep({ ...doc, rep: null }, { who: 'g' }).ok, false);
  const ak = ackRep(doc, { who: 'G', now: T + 3 });
  assert.ok(ak.ok); assert.equal(ak.rep.receivedAt, T + 3); assert.equal(ak.rep.receivedBy, 'g'); assert.equal(ak.rep.verdict, 'AN');
  assert.equal(ackRep({ ...doc, rep: ak.rep }, { who: 'g' }).ok, false, 'хоёр дахь удаа үгүй');
  /* Шинэ хувилбар — approved-оос ч, шалтгаан заавал */
  assert.equal(canAct(doc, 'g', []).newRevision, true); assert.equal(canAct(doc, 'c', ['chanar']).newRevision, false);
  assert.equal(canAct({ ...doc, status: MS_STATUS.review }, 'g', []).newRevision, false);
  assert.equal(newRevision({ ...doc, rev: 0 }, { who: 'g', reason: '  ' }).ok, false, 'шалтгаан заавал');
  assert.equal(newRevision({ ...doc, rev: 0, status: MS_STATUS.review }, { who: 'g', reason: 'x' }).ok, false);
  assert.equal(newRevision({ ...doc, rev: 0 }, { who: 'c', reason: 'x' }).ok, false, 'зөвхөн зохиогч');
  assert.equal(newRevision({ kind: 'NCR', status: MS_STATUS.approved, rev: 0, author: 'g' }, { who: 'g', reason: 'x' }).ok, false, 'NCR-д үгүй');
  const nr = newRevision({ ...doc, rev: 0 }, { who: 'g', reason: 'Нийлүүлэгч нэмсэн' });
  assert.ok(nr.ok); assert.equal(nr.rev, 1); assert.equal(nr.status, MS_STATUS.draft); assert.deepEqual(nr.reviews, emptyReviews());
  const nr2 = newRevision({ ...doc, rev: 1, status: MS_STATUS.returned }, { who: 'g', reason: 'Засав' });
  assert.ok(nr2.ok); assert.equal(nr2.rev, 2);
  /* Дараагийн хувилбарын бие — MA түгжээ + түүх */
  const body = { ...EMPTY_MA, materials: [{ ...EMPTY_MA.materials[0], name: 'a' }, { name: 'b' }, { name: 'c' }].map((m) => ({ ...parseBodyOf('MA', '{}').materials[0] ?? {}, name: m.name, verdict: null, locked: false })) };
  const applied = applyRepToMaterials(body, { verdict: 'R', perMaterial: { 0: 'A', 1: 'AN' } });
  assert.deepEqual(applied.materials.map((m) => m.verdict), ['A', 'AN', 'R'], 'perMaterial-д байхгүй → баримтын шийдвэр');
  const locked = { ...applied, materials: applied.materials.map((m, i) => (i === 0 ? { ...m, locked: true } : m)) };
  assert.deepEqual(applyRepToMaterials(locked, { verdict: 'A' }).materials.map((m) => m.verdict), ['A', 'A', 'A']);
  assert.equal(applyRepToMaterials({ ...locked, materials: [{ ...locked.materials[0], verdict: 'AN' }] }, { verdict: 'R' }).materials[0].verdict, 'AN', 'түгжигдсэн материал хөндөгдөхгүй');
  const nb = nextRevisionBody('MA', applied, { rev: 1, reason: ' Засав ', by: 'G', now: T });
  assert.deepEqual(nb.materials.map((m) => [m.verdict, m.locked]), [['A', true], ['AN', true], [null, false]], '⚠️ A/AN түгжигдэнэ, R дахин хянагдана');
  assert.equal(nb.revNote, 'Засав'); assert.deepEqual(nb.revHistory, [{ rev: 1, at: T, reason: 'Засав', by: 'g' }]);
  assert.equal(applied.materials[0].locked, false, 'оролт өөрчлөгдөөгүй (цэвэр)');
  const nb2 = nextRevisionBody('MA', nb, { rev: 2, reason: 'Дахин', by: 'g', now: T + 1 });
  assert.equal(nb2.revHistory.length, 2); assert.equal(nb2.revHistory[1].rev, 2);
  const nbMs = nextRevisionBody('MS', { ...EMPTY_BODY_LIKE(), meta: EMPTY_META }, { rev: 1, reason: 'r', by: 'g', now: T });
  assert.equal(nbMs.revHistory.length, 1); assert.equal(nbMs.general, '');
  /* ⚠️ 2026-10-09: MIR/FIC — ТУХ-ийн багана rev+1-д цэвэрлэгдэнэ, гүйцэтгэгчийнх үлдэнэ */
  const insp = { ...EMPTY_INSP, items: [{ no: 1, text: 'a', section: null, contractor: 'OK', client: 'X', comment: 'c' }] };
  const nbI = nextRevisionBody('MIR', insp, { rev: 1, reason: 'r', by: 'g', now: T });
  assert.equal(nbI.items[0].client, null); assert.equal(nbI.items[0].contractor, 'OK'); assert.equal(insp.items[0].client, 'X', 'цэвэр');
  /* Түгжигдсэн материал хянагдахгүй: review perMaterial-аас хаягдана, repFrom-д өмнөх шийдвэр орно */
  const rev1 = { kind: 'MA', status: MS_STATUS.review, author: 'g', reviews: emptyReviews() };
  const rr = review(rev1, { as: 'cheng', who: 'e', verdict: VERDICT.approve, perMaterial: { 0: 'R', 1: 'A', 2: 'A' }, materials: nb.materials });
  assert.ok(rr.ok, rr.error); assert.deepEqual(rr.reviews.cheng.perMaterial, { 2: 'A' }, '⚠️ түгжигдсэн 0·1 хаягдана — R ч өсгөхгүй');
  assert.equal(verdictCode(rr.reviews.cheng.verdict), 'A');
  const rf = repFrom(rr.reviews, 'MA', nb.materials);
  assert.deepEqual(rf.perMaterial, { 0: 'A', 1: 'AN', 2: 'A' }, 'хариунд түгжигдсэн материалын өмнөх шийдвэр орно');
  /* AN хугацаа */
  const an = review(rev1, { as: 'cheng', who: 'e', verdict: VERDICT.note, note: 'n', anDeadline: T + 100 });
  assert.equal(an.reviews.cheng.anDeadline, T + 100); assert.equal(repFrom(an.reviews, 'MA').anDeadline, T + 100);
  assert.equal(review(rev1, { as: 'cheng', who: 'e', verdict: VERDICT.approve, anDeadline: T }).reviews.cheng.anDeadline, undefined, 'A-д хугацаа үгүй');
  /* Хянахгүй буцаах */
  assert.equal(canAct(rev1, 'c', ['chanar']).bounce, true); assert.equal(canAct(rev1, 'c', ['cheng']).bounce, true);
  assert.equal(canAct(rev1, 't', ['tug']).bounce, false, 'ТУГ буцаахгүй'); assert.equal(canAct(rev1, 'g', ['chanar']).bounce, false, 'зохиогч үгүй');
  assert.equal(canAct({ kind: 'MS', status: MS_STATUS.review, author: 'g', reviews: emptyReviews() }, 'c', ['cheng']).bounce, false, 'MS-д cheng хянагч биш');
  assert.equal(canAct({ kind: 'NCR', status: MS_STATUS.review, author: 'g', reviews: emptyReviews(), correctionAt: T }, 'c', ['chanar']).bounce, false, 'NCR үгүй');
  assert.equal(bounce(rev1, { as: 'tug', who: 'c', reason: 'format' }).ok, false);
  assert.equal(bounce(rev1, { as: 'chanar', who: 'g', reason: 'format' }).ok, false, 'зохиогч');
  assert.equal(bounce(rev1, { as: 'chanar', who: 'c', reason: 'zoo' }).ok, false);
  assert.equal(bounce({ ...rev1, status: MS_STATUS.approved }, { as: 'chanar', who: 'c', reason: 'format' }).ok, false);
  /* ⚠️ 2026-09-30: шийдвэр өгөгдсөн бол хянахгүй буцаахгүй (өгсөн шийдвэр устдаг байв) */
  const bx = bounce({ ...rev1, reviews: rr.reviews }, { as: 'chanar', who: 'C', reason: 'incomplete', note: 'Бүрдэл дутуу', now: T });
  assert.equal(bx.ok, false); assert.match(bx.error, /шийдвэр өгч эхэлсэн/);
  assert.equal(canAct({ ...rev1, reviews: rr.reviews }, 'c', ['chanar']).bounce, false, 'товч ч гарахгүй');
  const b = bounce(rev1, { as: 'chanar', who: 'C', reason: 'incomplete', note: 'Бүрдэл дутуу', now: T });
  assert.ok(b.ok); assert.equal(b.status, MS_STATUS.returned); assert.deepEqual(b.reviews, emptyReviews());
  assert.deepEqual(b.bounce, { at: T, by: 'c', reason: 'incomplete', note: 'Бүрдэл дутуу' });
  assert.equal(bounce(rev1, { as: 'chanar', who: 'c', reason: 'format' }).ok, false, '⚠️ 2026-09-30: тайлбар заавал (логикт)');
  /* QMP / PRC — MS-ийн урсгал */
  const q = { kind: 'QMP', status: MS_STATUS.review, author: 'g', reviews: emptyReviews() };
  assert.equal(review(q, { as: 'tug', who: 't', verdict: VERDICT.approve }).ok, false);
  let qr = review(q, { as: 'tuh', who: 't', verdict: VERDICT.approve }); assert.ok(qr.ok);
  qr = review({ ...q, reviews: qr.reviews }, { as: 'chanar', who: 'c', verdict: VERDICT.approve }); assert.ok(qr.ok);
  qr = review({ ...q, reviews: qr.reviews }, { as: 'habea', who: 'h', verdict: VERDICT.approve }); assert.equal(qr.status, MS_STATUS.approved);
  assert.deepEqual(canAct({ ...q, kind: 'PRC' }, 'x', ['tuh', 'tug']).review, ['tuh']);
  /* Ижил нэртэй идэвхтэй MA */
  const mk = (seq, rev, status, extra = {}) => ({ oid: seq * 10 + rev, kind: 'MA', docNo: '', org: '', bagts: 'Багц 1', seq, rev, title: 'Арматур ', status, author: 'g', sentAt: T, reviews: emptyReviews(), decidedAt: null, rep: null, ...extra });
  const docs = [mk(1, 0, MS_STATUS.review), mk(2, 0, MS_STATUS.approved, { rep: { no: 'x', at: T, verdict: 'A' } }), mk(3, 0, MS_STATUS.approved, { rep: repAN }), mk(4, 0, MS_STATUS.returned), mk(4, 1, MS_STATUS.draft), mk(5, 0, MS_STATUS.review, { kind: 'MS' })];
  assert.deepEqual(activeSameTitle(docs, 'MA', 'Багц 1', ' арматур').map((d) => d.seq).sort(), [1, 3, 4], 'review · AN нээлттэй · ноорог (сүүлийн хувилбар); хаагдсан A, MS орохгүй');
  assert.deepEqual(activeSameTitle(docs, 'MA', 'Багц 1', 'арматур', 1).map((d) => d.seq).sort(), [3, 4], 'өөрийн seq хасагдана');
  assert.deepEqual(activeSameTitle(docs, 'MA', 'Багц 1', ''), []);
}
function EMPTY_BODY_LIKE() { return { general: '', scope: '', materials: '', sequence: '', quality: '', safety: '' }; }
console.log('✅ 2-р үе шат — AN нээлттэй · closeAn · newRevision · түгжээ · bounce · ackRep · QMP/PRC · legacy');

/* ══════════ АУДИТ 8 (2026-09-25): undefined слот · саналын урт · repFrom түгжээ · closeAn эрх · залруулга · NCR хаалт ══════════ */
{
  const rv = (verdict, who = 'x', note = null) => ({ who, at: T, verdict, note });
  /* requiredReviewers — түлхүүр ОГТ байхгүй (undefined) ≠ null */
  const noCheng = { tuh: null, chanar: null, habea: null, tug: null };
  assert.deepEqual([...requiredReviewers(noCheng, 'MA')], ['chanar', 'tug'], '⚠️ шийдвэргүй хуучин MA (cheng түлхүүргүй) cheng шаардахгүй');
  assert.deepEqual([...requiredReviewers({ ...emptyReviews() }, 'MA')], ['cheng', 'chanar', 'tug'], 'null = үүрэг бий, шаардана');
  assert.deepEqual([...requiredReviewers({}, 'MA')], ['cheng', 'chanar', 'tug'], 'FAIL-CLOSED: хоосон JSON → бүгд');
  assert.deepEqual([...requiredReviewers({ tuh: null, chanar: null }, 'MS')], ['tuh', 'chanar', 'habea'], 'MS дараалсан биш — хөндөгдөхгүй');
  assert.equal(resolve(noCheng, 'MA'), MS_STATUS.review);
  assert.deepEqual(progress(noCheng, 'MA'), { done: 0, total: 2 });
  const legacyMa = { kind: 'MA', status: MS_STATUS.review, author: 'g', reviews: noCheng };
  assert.deepEqual(canAct(legacyMa, 'x', ['cheng', 'chanar']).review, ['chanar']);
  const asCheng = review(legacyMa, { as: 'cheng', who: 'e', verdict: VERDICT.approve });
  assert.equal(asCheng.ok, false, '⚠️ хуучин мөрд cheng шийдвэр татгалзана (canAct нуудаг байсан ч review хүлээн авдаг байв)');
  assert.match(asCheng.error, /шаардлагагүй/);
  assert.equal(review(legacyMa, { as: 'chanar', who: 'c', verdict: VERDICT.approve }).ok, true);
  assert.equal(JSON.stringify({ ...noCheng, cheng: undefined }).includes('cheng'), false, 'stringify undefined-ийг хаяна → хуучин мөр хуучин хэвээр');
  /* ⚠️ 2026-10-09: хуучин MA JSON — ЗӨВХӨН tuh/chanar/habea түлхүүр (tug ч undefined) → tug шаардагдана */
  const oldKeys = { tuh: null, chanar: null, habea: null };
  assert.deepEqual([...requiredReviewers(oldKeys, 'MA')], ['chanar', 'tug'], 'cheng алгасна, tug ҮЛДЭНЭ');
  const oldDecided = { tuh: null, chanar: rv(VERDICT.approve, 'c'), habea: null };
  assert.deepEqual([...requiredReviewers(oldDecided, 'MA')], ['chanar', 'tug']);
  assert.equal(resolve(oldDecided, 'MA'), MS_STATUS.review, '⚠️ chanar ганцаараа батлахгүй');
  /* Саналын урт — NOTE_MAX */
  const long = 'x'.repeat(NOTE_MAX + 1);
  const ms = { kind: 'MS', status: MS_STATUS.review, author: 'g', reviews: emptyReviews() };
  const tooLong = review(ms, { as: 'tuh', who: 't', verdict: VERDICT.approve, note: long });
  assert.equal(tooLong.ok, false); assert.match(tooLong.error, /1500/);
  assert.equal(review(ms, { as: 'tuh', who: 't', verdict: VERDICT.approve, note: 'x'.repeat(NOTE_MAX) }).ok, true, 'яг NOTE_MAX → ok');
  assert.equal(bounce(ms, { as: 'chanar', who: 'c', reason: 'format', note: long }).ok, false, 'buцаалтын тайлбар ч');
  const anDoc = { kind: 'MS', status: MS_STATUS.approved, author: 'g', reviews: emptyReviews(), rep: { no: 'r', at: T, verdict: 'AN' } };
  assert.equal(closeAn(anDoc, { as: 'chanar', who: 'c', no: 'n', note: long }).ok, false, 'AN хаалтын тэмдэглэл ч');
  /* repFrom — хариунд хураангуй, бүтэн текст reviews-д */
  const note400 = 'а'.repeat(400);
  const rr = review(ms, { as: 'chanar', who: 'c', verdict: VERDICT.note, note: note400 });
  assert.equal(rr.reviews.chanar.note.length, 400, 'бүтэн санал хянагчийн бүртгэлд');
  const rf = repFrom(rr.reviews, 'MS');
  assert.equal(rf.anText.length, REP_NOTE_MAX); assert.ok(rf.anText.endsWith('…'), 'хариунд ≤ REP_NOTE_MAX + …');
  const rj = review(ms, { as: 'chanar', who: 'c', verdict: VERDICT.return, note: note400 });
  assert.equal(repFrom(rj.reviews, 'MS').rReasons[0].length, REP_NOTE_MAX);
  assert.equal(repFrom({ ...emptyReviews(), tuh: rv(VERDICT.note, 't', 'богино') }, 'MS').anText, 'богино', 'богино санал өөрчлөгдөхгүй');
  /* repFrom — шийдвэр = max(хянагчид, түгжигдсэн материал) */
  const allA = { ...emptyReviews(), cheng: rv(VERDICT.approve, 'e'), chanar: rv(VERDICT.approve, 'c'), tug: rv(VERDICT.approve, 't') };
  assert.equal(repFrom(allA, 'MA').verdict, 'A');
  assert.equal(repFrom(allA, 'MA', [{ locked: true, verdict: 'AN' }, { locked: false, verdict: null }]).verdict, 'AN', '⚠️ түгжигдсэн AN материал → баримт AN хэвээр (нөхцөл биелээгүй)');
  assert.equal(repFrom(allA, 'MA', [{ locked: true, verdict: 'A' }]).verdict, 'A');
  assert.equal(repFrom(allA, 'MA', [{ locked: false, verdict: 'AN' }]).verdict, 'A', 'түгжигдээгүй материалын хуучин verdict тоологдохгүй');
  assert.equal(repFrom({ ...allA, chanar: rv(VERDICT.return, 'c', 'x') }, 'MA', [{ locked: true, verdict: 'AN' }]).verdict, 'R', 'R давамгайлна');
  /* closeAn — зөвхөн chanar/cheng, зохиогч биш */
  const maAn = { kind: 'MA', status: MS_STATUS.approved, author: 'g', reviews: allA, rep: { no: 'r', at: T, verdict: 'AN' } };
  assert.equal(closeAn(maAn, { as: 'tug', who: 't', no: 'n' }).ok, false, '⚠️ ТУГ AN хаахгүй');
  assert.equal(closeAn(maAn, { as: 'cheng', who: 'e', no: 'n' }).ok, true);
  assert.equal(closeAn(maAn, { as: 'chanar', who: 'g', no: 'n' }).ok, false, 'зохиогч өөрөө хаахгүй');
  assert.equal(closeAn(anDoc, { as: 'habea', who: 'h', no: 'n' }).ok, false, 'MS-д habea хаахгүй');
  assert.equal(closeAn({ ...anDoc, kind: 'NCR', author: 'c' }, { as: 'chanar', who: 'c', no: 'n' }).ok, true, 'NCR: нээгч хянагч өөрөө хаана');
  assert.equal(canAct(maAn, 't', ['tug']).closeAn, false); assert.equal(canAct(maAn, 'e', ['cheng']).closeAn, true);
  assert.equal(canAct(maAn, 'g', ['chanar']).closeAn, false, 'canAct: зохиогч');
  assert.equal(canAct(anDoc, 'h', ['habea']).closeAn, false);
  /* submitCorrection — хянагч дүгнэлт өгч эхэлсэн бол дахин илгээхгүй */
  const corr = { text: 'засав', completedAt: T, steps: [] };
  const inReview = { kind: 'NCR', status: MS_STATUS.review, reviews: { ...emptyReviews(), tuh: rv(VERDICT.approve, 't') } };
  const sent = { ...EMPTY_NCR, correctionAt: T };
  const blocked = submitCorrection(inReview, sent, { who: 'con', correction: corr });
  assert.equal(blocked.ok, false, '⚠️ review + correctionAt + шийдвэртэй → үгүй'); assert.match(blocked.error, /дүгнэлт/);
  assert.equal(submitCorrection({ ...inReview, reviews: emptyReviews() }, sent, { who: 'con', correction: corr }).ok, true, 'шийдвэргүй бол дахин илгээж болно');
  assert.equal(submitCorrection(inReview, EMPTY_NCR, { who: 'con', correction: corr }).ok, true, 'correctionAt үгүй (анх) → ok');
  assert.equal(submitCorrection({ ...inReview, status: MS_STATUS.returned }, sent, { who: 'con', correction: corr }).ok, true, 'returned-ээс үргэлж');
  assert.equal(submitCorrection({ kind: 'NCR', status: MS_STATUS.review }, sent, { who: 'con', correction: corr }).ok, true, 'reviews өгөөгүй хуучин дуудагч');
  /* closeNcr — нэг удаа */
  const closedBody = { ...EMPTY_NCR, closure: { completedAt: T, verifiedBy: 'c', verifiedAt: T, docType: null, action: null, result: null, closedByContractor: [], archive: { original: false, server: false, backup: false } } };
  const done = { kind: 'NCR', status: MS_STATUS.approved };
  const c1 = closeNcr(done, closedBody, { who: 'con', closedByContractor: [{ name: 'Бат', position: 'БУ', date: T }] });
  assert.ok(c1.ok);
  const again = closeNcr(done, c1.body, { who: 'con', closedByContractor: [{ name: 'Дорж', position: 'ЧИ', date: T }] });
  assert.equal(again.ok, false, '⚠️ хаагдсаныг дахин бичихгүй'); assert.match(again.error, /аль хэдийн/);
}
console.log('✅ аудит 8 — undefined слот · NOTE_MAX · repFrom түгжээ · closeAn chanar/cheng · залруулгын хамгаалалт · NCR нэг хаалт');

/* ══ 2026-09-30: гацаа · «миний хийх» ══ */
{
  /* reviewerClashes — нэг хүн хоёр үүргийн ЦОРЫН ГАНЦ эзэн */
  const ok = reviewerClashes({ tuh: ['t'], chanar: ['c'], habea: ['h'], tug: ['g2'], cheng: ['e'] }, ['a']);
  assert.deepEqual(ok, [], 'үүрэг бүр өөр хүн → гацаагүй');
  const ms = reviewerClashes({ tuh: ['t'], chanar: ['c'], habea: ['t'], tug: ['g2'], cheng: ['e'] }, ['a']);
  assert.equal(ms.length, 1); assert.deepEqual(ms[0].kinds, ['MS', 'QMP', 'PRC']);
  assert.deepEqual(ms[0].roles, ['tuh', 'habea']); assert.deepEqual(ms[0].users, ['t']);
  const ma = reviewerClashes({ tuh: ['t'], chanar: ['c'], habea: ['h'], tug: ['g2'], cheng: ['c'] }, ['a']);
  assert.deepEqual(ma.map((c) => c.kinds), [['MA']], 'MA: cheng+chanar нэг хүн');
  assert.deepEqual(reviewerClashes({ tuh: ['t', 'x'], chanar: ['c'], habea: ['t'], tug: ['g2'], cheng: ['e'] }, ['a']), [], 'ТУХ-д өөр хүн бий → гацаагүй');
  /* Зохиогч бүрээр: x нь ТУХ-ийн хоёр дахь эзэн боловч зохиогч өөрөө бол түүний баримтад тоологдохгүй */
  const byAuthor = reviewerClashes({ tuh: ['t', 'x'], chanar: ['c'], habea: ['t'], tug: ['g2'], cheng: ['e'] }, ['x']);
  assert.deepEqual(byAuthor.map((c) => c.roles), [['tuh', 'habea']]);
  assert.deepEqual(reviewerClashes({ tuh: [], chanar: ['c'], habea: ['c'] }, ['a']).filter((c) => c.kinds.includes('MS')), [], 'дутуу үүрэг — өөр анхааруулга');
  assert.deepEqual(reviewerClashes({ tuh: ['t'], chanar: ['t'], tug: ['g2'] }, []).map((c) => c.kinds), [['NCR']], 'NCR зохиогчоос үл хамаарна');

  /* roleWaitReason */
  const d = { kind: 'MS', status: MS_STATUS.review, author: 'g', reviews: { ...emptyReviews(), tuh: { who: 't', at: T, verdict: VERDICT.approve, note: null } } };
  assert.deepEqual(roleWaitReason(d, 'habea', ['T']), { why: 'decidedOther', users: ['t'] }, '⚠️ ганц эзэн өөр үүргээр шийдсэн → гацсан');
  assert.equal(roleWaitReason(d, 'habea', ['t', 'h']), null, 'өөр эзэн бий');
  assert.deepEqual(roleWaitReason(d, 'chanar', ['g']), { why: 'authorOnly', users: ['g'] });
  assert.deepEqual(roleWaitReason(d, 'chanar', []), { why: 'unassigned', users: [] });
  assert.equal(roleWaitReason(d, 'tuh', []), null, 'шийдсэн үүрэг');
  assert.equal(roleWaitReason({ ...d, status: MS_STATUS.approved }, 'habea', ['t']), null);
  assert.equal(roleWaitReason({ ...d, kind: 'NCR' }, 'chanar', ['g']), null, 'NCR: нээгч өөрөө дүгнэж болно');

  /* needsMyAction */
  const none = { edit: false, submit: false, review: [], correction: false, reopen: false, clientChecks: false, bounce: false, ack: false, closeAn: false, newRevision: false, closeNcr: false };
  assert.equal(needsMyAction(d, none), false);
  assert.equal(needsMyAction(d, { ...none, review: ['chanar'] }), true);
  assert.equal(needsMyAction(d, { ...none, submit: true, edit: true }), true);
  assert.equal(needsMyAction(d, { ...none, reopen: true, newRevision: true, closeAn: true, bounce: true }), false, 'боломжит үйлдэл ≠ хүлээгдэж буй ажил');
  const ncr = { kind: 'NCR', status: MS_STATUS.review, correctionAt: T };
  assert.equal(needsMyAction(ncr, { ...none, correction: true }), false, 'залруулга илгээгдсэн — хянагчийг хүлээж байна');
  assert.equal(needsMyAction({ ...ncr, correctionAt: null }, { ...none, correction: true }), true);
  assert.equal(needsMyAction({ ...ncr, status: MS_STATUS.returned }, { ...none, correction: true }), true);
}
console.log('✅ 2026-09-30 — нэг хүн хоёр үүрэг (гацаа) · хүлээлтийн шалтгаан · миний хийх');

/* ══════════ 2026-09-30 (өгөгдөл оруулах/хянах аудит): MA материалын шийдвэр · AN хаалт · NCR REP · нотолгоо ══════════ */
{
  const { sameMaterialContent, closeAnMaterials, EMPTY_MATERIAL } = await import('./chanarMs.ts');
  const rv = (verdict, who, note = null, perMaterial) => ({ who, at: T, verdict, note, ...(perMaterial ? { perMaterial } : {}) });
  /* A2 — тэмдэглээгүй хянагчийн НИЙТ шийдвэр бүх материалд («хоосон бол нийт шийдвэр») */
  const rR = repFrom({ ...emptyReviews(), cheng: rv(VERDICT.approve, 'e', null, { 0: 'A', 1: 'A' }), chanar: rv(VERDICT.return, 'c', 'буруу') }, 'MA');
  assert.equal(rR.verdict, 'R');
  assert.deepEqual(rR.perMaterial, { 0: 'R', 1: 'R' }, '⚠️ chanar-ын нийт R материалд хүрэх ёстой — эс бөгөөс A болж түгжигдэнэ');
  const rAN = repFrom({ ...emptyReviews(), cheng: rv(VERDICT.approve, 'e', null, { 0: 'A', 1: 'A' }), chanar: rv(VERDICT.note, 'c', 'нөхцөл'), tug: rv(VERDICT.approve, 't') }, 'MA');
  assert.deepEqual(rAN.perMaterial, { 0: 'AN', 1: 'AN' }, 'нийт AN ч материалд хүрнэ');
  const body2 = { ...EMPTY_MA, materials: [{ ...EMPTY_MATERIAL, name: 'a' }, { ...EMPTY_MATERIAL, name: 'b' }] };
  const nbR = nextRevisionBody('MA', applyRepToMaterials(body2, rR), { rev: 1, reason: 'r', by: 'g', now: T });
  assert.deepEqual(nbR.materials.map((m) => m.locked), [false, false], '⚠️ буцаагдсан материал rev+1-д дахин хянагдана (түгжигдэхгүй)');
  /* Бүгд материал тэмдэглэсэн бол хуучин дүрэм хэвээр */
  const rMix = repFrom({ ...emptyReviews(), cheng: rv(VERDICT.note, 'e', 'n', { 0: 'A', 1: 'AN' }), chanar: rv(VERDICT.return, 'c', 's', { 1: 'R' }) }, 'MA');
  assert.deepEqual(rMix.perMaterial, { 0: 'A', 1: 'R' }, 'тэмдэглэсэн хянагчид — материал бүрд R > AN > A хэвээр');

  /* A3 — түгжигдсэн материалын АГУУЛГА өөрчлөгдсөн эсэх */
  const m0 = { ...EMPTY_MATERIAL, name: 'Цемент', qty: '10', model: 'M400', verdict: 'A', locked: true };
  assert.equal(sameMaterialContent(m0, { ...m0, verdict: null, locked: false }), true, 'шийдвэр/түгжээ нь агуулга биш');
  assert.equal(sameMaterialContent(m0, { ...m0, qty: '20' }), false, '⚠️ тоо өөрчлөгдсөн — дахин хянагдана');
  assert.equal(sameMaterialContent(m0, { ...m0, model: ' M400 ' }), true, 'зай нь өөрчлөлт биш');
  assert.equal(sameMaterialContent({ name: 'Цемент', qty: '10', model: 'M400' }, m0), true, 'хуучин JSON-ийн дутуу талбар = хоосон');

  /* A4 — AN хаалт түгжигдсэн AN материалыг ч A болгоно */
  const anBody = { ...EMPTY_MA, materials: [{ ...EMPTY_MATERIAL, name: 'x', verdict: 'AN', locked: true }, { ...EMPTY_MATERIAL, name: 'y', verdict: 'AN', locked: false }] };
  const closed = closeAnMaterials(anBody, { verdict: 'A', perMaterial: { 0: 'A', 1: 'A' } });
  assert.deepEqual(closed.materials.map((m) => [m.verdict, m.locked]), [['A', true], ['A', false]], '⚠️ түгжигдсэн AN ч A (түгжээ хэвээр)');
  assert.equal(anBody.materials[0].verdict, 'AN', 'оролт өөрчлөгдөөгүй (цэвэр)');

  /* A1 · A7 — сүлжээний давхарга (эх кодын шалгуур) */
  const fs = await import('node:fs');
  const store = fs.readFileSync(new URL('./chanarStore.ts', import.meta.url), 'utf8');
  const rd = store.slice(store.indexOf('export async function reviewDoc'), store.indexOf('const safeJson'));
  assert.ok(/reviewsJsonEx\(r\.reviews, rep \?\? doc\.rep \?\? null, null, args\.as\)/.test(rd), '⚠️ reviewDoc: эцсийн бус шийдвэр өмнөх REP-ийг хадгална (NCR 2-р тойрог)');
  assert.ok(/attachDeny\(oid, 'delete'\)/.test(store), '⚠️ deleteAttachment нь устгалын дүрмээр шалгана');
  const ad = store.slice(store.indexOf('async function attachDeny'), store.indexOf('export async function loadDocs'));
  assert.ok(/op === 'delete'/.test(ad), '⚠️ NCR илгээсний дараа нотолгоо устгагдахгүй');
  assert.ok(/sameMaterialContent\(m, sm\[j\]\)/.test(store), '⚠️ ownClientBody: агуулга өөрчлөгдсөн материал түгжигдэхгүй');
  /* A9 — хянах · хянахгүй буцаах бичихийн өмнө дахин уншина (өөр хүний шийдвэр/bounce-ийг дарахгүй) */
  const w = rd.indexOf("arcgisPost(`${url}/applyEdits`");
  /* ⚠️ 2026-10-06: ажиглах талбар `watch` — NCR ба биеийг бичих замд `F.body` ч (хуучин зөвхөн төлөв/хянагчид) */
  assert.ok(rd.indexOf('await unchanged(args.oid, cur[0], watch)') > 0
    && rd.indexOf('await unchanged(args.oid, cur[0], watch)') < w, '⚠️ reviewDoc: бичихийн өмнө `unchanged`');
  assert.ok(/const watch = \(ncrBody \|\| F\.body in attrs\) \? \[F\.status, F\.reviews, F\.body\]/.test(rd), '⚠️ reviewDoc: NCR/бие бичихэд биеийг ч ажиглана');
  /* ⚠️ 2026-10-09: `hyanalt` 8000 — хэтэрвэл бичихээс ӨМНӨ шалтгаантай татгалзана */
  assert.ok(rd.indexOf('hyanaltTooLong(') > 0 && rd.indexOf('hyanaltTooLong(') < w, '⚠️ reviewDoc: hyanalt хэтрэлтийг бичихээс өмнө барина');
  const bd = store.slice(store.indexOf('export async function bounceDoc'), store.indexOf('async function unchanged'));
  /* ⚠️ 2026-10-09: биеийг бүхэлд нь бичдэг тул `F.body` ч ажиглана (`saveMeta` алдагдахгүй) */
  assert.ok(bd.indexOf('await unchanged(args.oid, row, [F.status, F.reviews, F.body])') > 0
    && bd.indexOf('await unchanged(args.oid, row, [F.status, F.reviews, F.body])') < bd.indexOf('return update(url'), '⚠️ bounceDoc: бичихийн өмнө `unchanged` (бие ч)');
  const cc = store.slice(store.indexOf('export async function saveClientChecks'), store.indexOf('function clientChecksPure'));
  assert.ok(cc.indexOf('await unchanged(args.oid, ld.row, [F.status, F.reviews, F.body])') > 0
    && cc.indexOf('await unchanged(args.oid, ld.row, [F.status, F.reviews, F.body])') < cc.indexOf('return update(ld.url'), '⚠️ saveClientChecks: бичихийн өмнө `unchanged`');
}
console.log('✅ 2026-09-30 — MA материалын нийт шийдвэр · түгжигдсэн агуулга · AN хаалт · NCR REP · нотолгоо');

/* ── 2026-10-04: NCR — хянагчийн ХАРСАН залруулга серверийнхээс зөрвөл дүгнэлт бичихгүй ── */
{
  const { correctionChanged } = await import('./chanarMs.ts');
  assert.equal(correctionChanged(undefined, 123), false, 'өгөөгүй — шалгахгүй (хуучин дуудагч)');
  assert.equal(correctionChanged(123, 123), false);
  assert.equal(correctionChanged(null, null), false);
  assert.equal(correctionChanged(null, undefined), false, 'null ≡ залруулга алга');
  assert.equal(correctionChanged(123, 456), true, 'гүйцэтгэгч дахин илгээсэн');
  assert.equal(correctionChanged(null, 456), true, 'хянагч залруулгагүй үед нээсэн');
  const { readFileSync } = await import('node:fs');
  const st = readFileSync(new URL('./chanarStore.ts', import.meta.url), 'utf8');
  const fn = st.slice(st.indexOf('export async function reviewDoc('));
  assert.ok(fn.indexOf('correctionChanged(args.seenCorrectionAt') > 0
    && fn.indexOf('correctionChanged(args.seenCorrectionAt') < fn.indexOf('reviewPure('), 'reviewDoc: залруулгын тулгалт шийдвэрээс ӨМНӨ');
  console.log('✅ 2026-10-04 — NCR залруулгын тулгалт (correctionChanged)');
}

console.log('chanarMs.check ✓');
