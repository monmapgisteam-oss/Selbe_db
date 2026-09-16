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
  REVIEWERS, MS_STATUS, VERDICT, ORG_CODE,
  pkgCode, orgCode, docNo, parseDocNo, nextSeq,
  emptyReviews, resolve, progress, review, submit, canAct, history, latest,
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
  assert.deepEqual(p, { org: 'MSC', kind: 'MS', pkg: 'P0302', seq: 11, rev: 1 });
  assert.equal(parseDocNo('MONCON-SLB-MA-0001-00'), null, '⚠️ багцгүй хэв ТАНИГДАХГҮЙ');
  assert.equal(parseDocNo('MSC-SLB-МА-Р0302-0003-00'), null, '⚠️ кирилл ТАНИГДАХГҮЙ');
  assert.equal(parseDocNo('SLB-REP-MA-P0100-0015-00'), null, 'хариуны хэв энд биш');
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
  assert.equal(review(base(), { as: 'tug', who: 'a', verdict: VERDICT.approve }).ok, false, '⚠️ ТУГ хянагч биш');
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
  const s1 = submit(d1, { who: 'selbe_guitsetgegch', now: T });
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
  /* Зохиогч: review төлөвт засахгүй, илгээхгүй, хянахгүй */
  assert.deepEqual(canAct(d, me, ['tuh']), { edit: false, submit: false, review: [] });
  /* Зохиогч ноорогт: засна, илгээнэ */
  assert.deepEqual(canAct({ ...d, status: MS_STATUS.draft }, me, []), { edit: true, submit: true, review: [] });
  /* Хянагч: зөвхөн өгөөгүй үүргээр */
  const half = { ...d, reviews: { ...emptyReviews(), tuh: { who: 'x', at: T, verdict: VERDICT.approve, note: null } } };
  assert.deepEqual(canAct(half, 'rev', ['tuh', 'chanar']).review, ['chanar'], 'tuh өгсөн → зөвхөн chanar үлдэнэ');
  /* Хянагч бус: хоосон */
  assert.deepEqual(canAct(d, 'rev', []).review, []);
  /* Нэвтрээгүй */
  assert.deepEqual(canAct(d, null, ['tuh']), { edit: false, submit: false, review: [] });
}

/* ══ 8. history · latest ══ */
{
  const mk = (bagts, seq, rev, status = MS_STATUS.approved) => ({
    oid: seq * 10 + rev, docNo: '', org: '', bagts, seq, rev, title: '', status,
    author: 'a', sentAt: T, reviews: emptyReviews(), decidedAt: null,
  });
  const docs = [
    mk('Багц 1', 1, 1), mk('Багц 1', 1, 0), mk('Багц 1', 1, 2),
    mk('Багц 1', 2, 0), mk('Багц 2', 1, 0),
  ];
  const h = history(docs, 'Багц 1', 1);
  assert.deepEqual(h.map((d) => d.rev), [0, 1, 2], 'rev өсөхөөр');
  assert.equal(history(docs, 'Багц 1', 9).length, 0);

  const l = latest(docs);
  assert.equal(l.length, 3, '3 өөр баримт');
  const b1s1 = l.find((d) => d.bagts === 'Багц 1' && d.seq === 1);
  assert.equal(b1s1.rev, 2, '⚠️ сүүлийн хувилбар л жагсаалтад');
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

console.log('chanarMs.check ✓');
