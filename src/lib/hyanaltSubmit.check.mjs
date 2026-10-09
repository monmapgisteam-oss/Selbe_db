/**
 * ИЛГЭЭЛТ → ХЯНАЛТЫН БҮРТГЭЛИЙН IDEMPOTENCY — цэвэр функц, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/hyanaltSubmit.check.mjs
 *
 * Хамгаалж буй алдаанууд (бүгд 2026-09-07-нд бодитоор гарсан):
 *   1. ⚠️ БУЦААЛТЫН ДАРААХ ДАХИН ИЛГЭЭЛТ ГАЦАХ. «`Шилжүүлсэн` БИШ бүх мөр»
 *      гэж шалгавал буцаагдсан ГУРВАН төлөв ч таарч, гүйцэтгэгч засвараа
 *      илгээхэд ШИНЭ тойрог үүсэхгүй, ажил МӨНХӨД гацна.
 *   2. ⚠️ ӨДӨР ХООРОНД `sheetOid` ДАВХЦАХ. `closeSubmission` унасан ховор
 *      тохиолдолд өчигдрийн мөр хөлдөөгүй үлдэж, маргааш ижил OBJECTID
 *      дахин ашиглагдвал өнөөдрийн ажил хяналтад ОГТ ОРОХГҮЙ.
 *   3. ⚠️ НЭГ ӨДӨРТ ОЛОН ТОЙРОГ. «Хянагдаж байхад дахин илгээх» хориг
 *      2026-09-07-нд хасагдсан тул энэ функц л давхардлыг барина.
 *   4. ⚠️ ХУУДАСНЫ ШОШГЫГ МӨНХӨД ХАЯХ (2026-09-08). `hasOpenLegacy` нь
 *      `sheetOid`-ыг шалгадаггүй байсан тул нэг нээлттэй хуучин мөр тэр
 *      өдрийн БҮХ илгээлтээс шошгыг хаяж, `groupWorks` тэднийг нэг Work
 *      болгож нийлүүлэн, өмнөх илгээлтүүд хянагчид ОГТ харагдахгүй болно.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dayTagOf, hasOpenLegacy, needsRegistration, openReviewRow, reviewLockBlocks, reviewLockDays, reviewLockState } from './hyanaltSubmit.ts';
import { F, STATUS } from './hyanalt.ts';

const DAY = Date.UTC(2026, 8, 7);      /* 2026-09-07 */
const PREV = Date.UTC(2026, 8, 6);     /* 2026-09-06 */
const TAG = dayTagOf(DAY);
const PREV_TAG = dayTagOf(PREV);

/** Хяналтын мөр угсрах туслах */
const row = (oid, status, tag = TAG, id = 'G-000001') => ({
  [F.sheetOid]: oid,
  [F.status]: status,
  [F.ajil]: `${tag} · Багц 1 · 9 давхар`,
  [F.id]: id,
});

/* ── 1. Өдрийн шошго ── */
assert.equal(TAG, 'Гүйцэтгэл · 2026.09.07');
assert.notEqual(TAG, PREV_TAG, 'өдөр бүр өөр шошго');

/* ── 2. ХЯНАГЧИЙН ГАР ДЭЭР — дахин илгээхэд ШИНЭ мөр ҮҮСГЭХГҮЙ ── */
for (const st of [STATUS.engineerReview, STATUS.managerReview, STATUS.directorReview]) {
  const hit = openReviewRow([row(500, st)], 500, TAG);
  assert.ok(hit, `«${st}» — хянагчийн гар дээр, байгаа бүртгэлээр үргэлжилнэ`);
  assert.equal(hit[F.id], 'G-000001');
}

/* ── 3. ⚠️ ГҮЙЦЭТГЭГЧ РҮҮ БУЦААГДСАН — ЖИНХЭНЭ дахин илгээлт, ШИНЭ тойрог ҮҮСНЭ ──
 *
 * ⚠️ ЗӨВХӨН «Инженер буцаасан» нь КОМПАНИД очно (`OWNER`, hyanalt.ts:112).
 *    «Менежер буцаасан» → ИНЖЕНЕРТ, «ЕМ буцаасан» → МЕНЕЖЕРТ буцна: тэдгээрийг
 *    гүйцэтгэгч дахин илгээдэггүй, хүлээн авсан ХЯНАГЧ `recheck`-ээр шийднэ
 *    (`hyanaltStore.recheck`). Тиймээс тэр хоёр нь энэ шалгуурт ТААРЧ,
 *    шинэ тойрог үүсгэхгүй байх нь ЗӨВ.
 */
assert.equal(
  openReviewRow([row(500, STATUS.engineerReturned)], 500, TAG), null,
  '«Инженер буцаасан» — гүйцэтгэгчийн гар дээр тул ШИНЭ тойрог үүсэх ЁСТОЙ (гацаах ёсгүй)',
);
for (const st of [STATUS.managerReturned, STATUS.directorReturned]) {
  assert.ok(
    openReviewRow([row(500, st)], 500, TAG),
    `«${st}» — хянагчийн гар дээр (recheck) тул шинэ тойрог үүсэхгүй`,
  );
}

/* ── 4. ШИЛЖҮҮЛСЭН — мөчлөг дууссан, шинэ бүртгэл зөв ── */
assert.equal(
  openReviewRow([row(500, STATUS.transferred)], 500, TAG), null,
  'батлагдсан илгээлт дээр шинэ бүртгэл үүсэх нь ЗӨВ',
);

/* ── 5. ⚠️ ӨӨР ӨДРИЙН мөр таарахгүй (sheetOid дахин ашиглагдсан ч) ── */
assert.equal(
  openReviewRow([row(500, STATUS.engineerReview, PREV_TAG)], 500, TAG), null,
  'өчигдрийн хянагдаж буй мөр өнөөдрийн илгээлтийг дарах ЁСГҮЙ',
);

/* ── 6. Өөр илгээлтийн мөр (өөр sheetOid) таарахгүй ── */
assert.equal(
  openReviewRow([row(501, STATUS.engineerReview)], 500, TAG), null,
  'өөр илгээлтийн бүртгэл таарах ёсгүй',
);

/* ── 7. sheetOid байхгүй / 0 — хамгаалалт ── */
assert.equal(openReviewRow([row(500, STATUS.engineerReview)], null, TAG), null);
assert.equal(openReviewRow([row(500, STATUS.engineerReview)], 0, TAG), null);

/* ── 8. Холимог жагсаалт — зөвхөн зөв мөрөө олно ── */
{
  const rows = [
    row(499, STATUS.transferred, PREV_TAG, 'G-000010'),
    row(500, STATUS.engineerReturned, TAG, 'G-000011'),   /* буцаагдсан — алгасана */
    row(500, STATUS.managerReview, TAG, 'G-000012'),      /* энэ нь таарна */
    row(501, STATUS.engineerReview, TAG, 'G-000013'),
  ];
  const hit = openReviewRow(rows, 500, TAG);
  assert.ok(hit, 'хянагчийн гар дээрх мөр олдох ёстой');
  assert.equal(hit[F.id], 'G-000012', 'буцаагдсаныг алгасаж хянагдаж буйг олно');
}

/* ── 9. Хоосон жагсаалт ── */
assert.equal(openReviewRow([], 500, TAG), null);

/* ── 10. ⚠️ ХУУЧИН НЭРИЙН ӨВЛӨЛТ ЗӨВХӨН ӨӨРИЙН МӨРӨӨС (2026-09-08) ──
 *
 * Урьд нь (багц·өдөр·компани)-гаар л шалгадаг байсан тул НЭГ нээлттэй
 * хуучин мөр тэр өдрийн БҮХ шинэ илгээлтээс хуудасны шошгыг хаядаг байв —
 * үүссэн шинэ мөр өөрөө нээлттэй тул гогцоо болж, `groupWorks` тэднийг НЭГ
 * Work болгож нийлүүлж, өмнөх илгээлтүүд мөнхөд гацдаг байлаа
 * (амьд: OID 61·62·63·64·70 бүгд нэг нэртэй).
 */
{
  const BAGTS = 'Багц 2';
  const COMP = 'Хятадын барилгын 6-р инженерийн товчоо';
  /** Хуучин (шошгогүй) нэртэй мөр */
  const legacy = (oid, status) => ({
    [F.sheetOid]: oid,
    [F.status]: status,
    [F.bagts]: BAGTS,
    [F.company]: COMP,
    [F.ajil]: TAG,
  });

  /* ӨӨРИЙН нээлттэй хуучин мөр → өвлөнө (түүх тасрахгүй) */
  assert.equal(
    hasOpenLegacy([legacy(500, STATUS.engineerReview)], BAGTS, COMP, TAG, 500), true,
    'өөрийн нээлттэй хуучин мөрөөс нэрээ өвлөнө',
  );

  /* ӨӨР илгээлтийн нээлттэй хуучин мөр → ӨВЛӨХГҮЙ (гол засвар) */
  assert.equal(
    hasOpenLegacy([legacy(6545, STATUS.engineerReview)], BAGTS, COMP, TAG, 53), false,
    'өөр илгээлтийн нээлттэй мөр нь шошго хасах шалтгаан БИШ',
  );

  /* ӨӨРИЙН мөр ШИЛЖҮҮЛСЭН → өвлөхгүй (мөчлөг дууссан) */
  assert.equal(
    hasOpenLegacy([legacy(500, STATUS.transferred)], BAGTS, COMP, TAG, 500), false,
    'шилжүүлсэн мөрөөс өвлөхгүй',
  );

  /* Өөр багц / өөр компани / өөр өдөр → өвлөхгүй */
  assert.equal(hasOpenLegacy([legacy(500, STATUS.engineerReview)], 'Багц 1', COMP, TAG, 500), false);
  assert.equal(hasOpenLegacy([legacy(500, STATUS.engineerReview)], BAGTS, 'Өөр ХХК', TAG, 500), false);
  assert.equal(hasOpenLegacy([legacy(500, STATUS.engineerReview)], BAGTS, COMP, PREV_TAG, 500), false);

  /* Шошготой мөр нь хуучин нэр БИШ → өвлөхгүй */
  assert.equal(
    hasOpenLegacy([row(500, STATUS.engineerReview)], BAGTS, COMP, TAG, 500), false,
    'шошготой нэр нь хуучин хэлбэр биш',
  );

  /* sheetOid байхгүй / 0 — хамгаалалт */
  assert.equal(hasOpenLegacy([legacy(500, STATUS.engineerReview)], BAGTS, COMP, TAG, null), false);
  assert.equal(hasOpenLegacy([legacy(500, STATUS.engineerReview)], BAGTS, COMP, TAG, 0), false);

  /* ⚠️ 2026-09-25: одоогийн тойрог ШИЛЖҮҮЛСЭН бол дарагдсан хуучин мөрөөс өвлөхгүй */
  assert.equal(
    hasOpenLegacy([
      { ...legacy(500, STATUS.managerReturned), OBJECTID: 10, [F.ergelt]: 1 },
      { ...legacy(500, STATUS.transferred), OBJECTID: 11, [F.ergelt]: 2 },
    ], BAGTS, COMP, TAG, 500), false,
    'recheck-ээр дарагдсан хуучин мөр ажлыг «нээлттэй» гэж харуулах ёсгүй',
  );
}

/* ── 11. ⚠️ ЗӨВХӨН ОДООГИЙН ТОЙРОГ (2026-09-25, HIGH) ──
 *
 * `recheck('ok')` хуучин A мөрийг «Менежер буцаасан» хэвээр үлдээж шинэ B
 * тойрог нэмдэг. B компанид буцсаны дараах засвар A-д `reused` гэж шингэвэл
 * шинэ тойрог үүсэхгүй, ажил мөнхөд гацна.
 */
{
  const cyc = (oid, ergelt, st, id) => ({ ...row(500, st, TAG, id), OBJECTID: oid, [F.ergelt]: ergelt });
  assert.equal(
    openReviewRow([
      cyc(10, 1, STATUS.managerReturned, 'G-000020'),
      cyc(11, 2, STATUS.engineerReturned, 'G-000021'),
    ], 500, TAG), null,
    'одоогийн B компанид буцсан — дарагдсан A таарч ШИНЭ тойргийг хаах ёсгүй',
  );
  const hit = openReviewRow([
    cyc(10, 1, STATUS.managerReturned, 'G-000020'),
    cyc(11, 2, STATUS.managerReview, 'G-000021'),
  ], 500, TAG);
  assert.equal(hit?.[F.id], 'G-000021', 'хянагчийн гар дээрх ОДООГИЙН тойргийг л буцаана');
}

/* ── 2026-10-04: `needsRegistration` — ижил sheetOid-тай ЯМАР Ч мөр «бүртгэгдсэн» БИШ ── */
{
  const RET = Date.UTC(2026, 8, 7, 10);
  const back = { ...row(700, STATUS.engineerReturned), [F.engineerReturned]: new Date(RET).toISOString(), [F.ergelt]: 1 };
  /* Буцаалтаас ХОЙШ дахин илгээсэн, бүртгэл унасан → бүртгэх шаардлагатай */
  assert.equal(needsRegistration([back], 700, TAG, RET + 60_000), true, 'буцаалтын дараах засвар инженерт хүрэх ёстой');
  /* Буцаалтаас ӨМНӨХ илгээлт (засаагүй) → өнчин БИШ */
  assert.equal(needsRegistration([back], 700, TAG, RET - 60_000), false, 'засаагүй буцаалт өнчин биш');
  /* epoch ms (Attrs) хэлбэр ч ижил */
  assert.equal(needsRegistration([{ ...back, [F.engineerReturned]: RET }], 700, TAG, RET + 1), true);
  /* Хянагчийн гар дээр шинэ тойрог бий → бүртгэлтэй */
  const open = { ...row(700, STATUS.engineerReview), [F.ergelt]: 2 };
  assert.equal(needsRegistration([back, open], 700, TAG, RET + 60_000), false, 'шинэ тойрог нээлттэй');
  /* Мөр огт алга → өнчин */
  assert.equal(needsRegistration([], 700, TAG, RET), true, 'бүртгэлгүй');
  /* Өчигдрийн шошготой мөр өнөөдрийн илгээлтийг «бүртгэгдсэн» болгохгүй */
  assert.equal(needsRegistration([row(700, STATUS.engineerReview, PREV_TAG)], 700, TAG, RET), true, 'өөр өдрийн мөр');
  /* Дууссан мөчлөг → бүртгэх шаардлагагүй */
  assert.equal(needsRegistration([row(700, STATUS.transferred)], 700, TAG, RET), false, 'шилжүүлсэн');
  assert.equal(needsRegistration([back], null, TAG, RET), false, 'sheetOid алга');
  /* ⚠️ 2026-10-05: эцсийн зөвшөөрлөөс ХОЙШ бичигдсэн үлдэгдэл (`residual`) — тойроггүй өнчин */
  const fin = { ...row(700, STATUS.transferred), [F.chiefSent]: new Date(RET).toISOString() };
  assert.equal(needsRegistration([fin], 700, TAG, RET + 5_000), true, 'үлдэгдэл нэмэлт шинэ тойрогт орох ёстой');
  assert.equal(needsRegistration([fin], 700, TAG, RET - 5_000), false, 'архивлагдсан (хаалт унасан) илгээлт өнчин биш');
  assert.equal(needsRegistration([fin, { ...row(700, STATUS.engineerReview), [F.ergelt]: 2 }], 700, TAG, RET + 5_000), false, 'үлдэгдлийн тойрог аль хэдийн нээлттэй');
  const fill = readFileSync(new URL('../modules/sheet/FillNew.tsx', import.meta.url), 'utf8');
  assert.ok(!/fresh\?\.some\(\(r\) => Number\(r\[HF\.sheetOid\]\) === stagedOid\)/.test(fill), 'FillNew.resend: хуучин «ижил sheetOid» шалгуур үлдсэн');
  assert.ok(fill.includes('needsRegistration('), 'FillNew: өнчин илгээлтийн шалгуур `needsRegistration`-ээр');
  console.log('✅ needsRegistration — одоогийн тойрог · буцаалтын дараах засвар');
}

/* ⚠️ 2026-10-09 (хэрэглэгч: «нэг удаа явуулаад 6 шат бүрэн давж байж дараа дахин бөглөх»): `reviewLockDays` */
{
  const r = (oid, so, status, ajil) => ({ OBJECTID: oid, [F.sheetOid]: so, [F.status]: status, [F.bagts]: 'Багц 1', [F.ajil]: ajil });
  const A = 'Гүйцэтгэл · 2026.10.04 · Багц 1 · 9 давхар';
  const B = 'Гүйцэтгэл · 2026.10.05 · Багц 1 · 12 давхар';
  const L = 'Гүйцэтгэл · 2026.09.01';
  const other = ['Багц 1 · 12 давхар'];
  const lock = (rows) => reviewLockDays(rows, 'Багц 1', 'Багц 1 · 9 давхар', other);
  assert.deepEqual(lock([r(1, 10, STATUS.engineerReview, A)]), ['2026.10.04'], 'хянагчийн гар дээр — хориг');
  assert.deepEqual(lock([r(1, 10, STATUS.managerReview, A)]), ['2026.10.04'], 'дунд шат — хориг');
  assert.deepEqual(lock([r(1, 10, STATUS.transferred, A)]), [], '6-р шат батлаж архивласан — хориггүй');
  assert.deepEqual(lock([r(1, 10, STATUS.engineerReturned, A)]), [], 'буцаагдсан (гүйцэтгэгчийн гар дээр) — хориггүй, засаад илгээнэ');
  assert.deepEqual(lock([r(1, 10, STATUS.engineerReturned, A), r(2, 10, STATUS.engineerReview, A)]), ['2026.10.04'],
    'буцаасны дараах дахин илгээлт хянагдаж байна — СҮҮЛИЙН тойрог хориг');
  assert.deepEqual(lock([r(1, 10, STATUS.engineerReview, A), r(2, 10, STATUS.engineerReturned, A)]), [],
    'сүүлийн тойрог буцаагдсан — хуучин тойрог хориг үүсгэхгүй');
  assert.deepEqual(lock([r(1, 20, STATUS.engineerReview, B)]), [], 'ӨӨР хуудас (12 давхар) — энэ хуудсыг хаахгүй');
  assert.deepEqual(lock([r(1, 30, STATUS.directorReview ?? STATUS.managerReview, L)]), ['2026.09.01'], 'хуудсын нэргүй хуучин мөр — багцын бүх хуудсанд');
  assert.deepEqual(lock([{ ...r(1, 10, STATUS.engineerReview, A), [F.bagts]: 'Багц 2' }]), [], 'өөр багц — хориггүй');
  console.log('✅ reviewLockDays — хяналтад явж буй илгээлт · буцаалт · архивласан · өөр хуудас');

  /* ⚠️ 2026-10-09 (аудит №2): хянагчийн дараалалтай ИЖИЛ `groupWorks` (ажлын одоогийн тойрог) */
  const cyc = (oid, ergelt, status, ajil = A, so = 10) => ({ ...r(oid, so, status, ajil), [F.ergelt]: ergelt, [F.company]: 'ХХК' });
  /* recheck('ok'): хуучин A «Менежер буцаасан» (OWNER = инженер) хэвээр, шинэ тойрог «Шилжүүлсэн» */
  assert.deepEqual(lock([cyc(10, 1, STATUS.managerReturned), cyc(11, 2, STATUS.transferred)]), [],
    'recheck-ийн үлдээсэн хуучин тойрог — шинэ тойрог архивлагдсан бол хориггүй');
  assert.deepEqual(lock([cyc(10, 1, STATUS.managerReturned), cyc(11, 2, STATUS.managerReview)]), ['2026.10.04'],
    'recheck-ийн шинэ тойрог менежерийн гар дээр — хориг');
  /* Хянагчид ХАРАГДДАГГҮЙ хуучирсан мөрүүд (OID 61·62·63·64·70 — нэг нэрээр нийлсэн, sheetOid өөр) */
  const LEG = 'Гүйцэтгэл · 2026.09.02';
  assert.deepEqual(lock([
    cyc(61, 1, STATUS.engineerReview, LEG, 61), cyc(62, 1, STATUS.engineerReview, LEG, 62),
    cyc(63, 1, STATUS.engineerReview, LEG, 63), cyc(64, 1, STATUS.engineerReview, LEG, 64),
    cyc(70, 1, STATUS.transferred, LEG, 70),
  ]), [], 'хянагчид харагддаггүй хуучирсан мөр — хориггүй');
  /* Огноогүй (бөглөх хуудасны бус) мөр — UI ба домэйн хоёулаа алгасна (урьд домэйн «?» гэж хаадаг) */
  assert.deepEqual(lock([r(1, 40, STATUS.engineerReview, 'Өөр ажил')]), [], 'огноогүй мөр — хориггүй');

  /* Буцаагдсан илгээлтийн засвар — өөр өдөр хянагдаж байсан ч хориггүй */
  const BACK = 'Гүйцэтгэл · 2026.10.03 · Багц 1 · 9 давхар';
  const st = reviewLockState([r(1, 10, STATUS.engineerReview, A), r(2, 11, STATUS.engineerReturned, BACK)],
    'Багц 1', 'Багц 1 · 9 давхар', other);
  assert.deepEqual(st, { days: ['2026.10.04'], returned: ['2026.10.03'] });
  const ms = (y, m, d) => new Date(y, m - 1, d).getTime();
  assert.equal(reviewLockBlocks(st, ms(2026, 10, 3)), false, 'буцаагдсан өдрийн засвар — хориггүй');
  assert.equal(reviewLockBlocks(st, ms(2026, 10, 4)), true, 'хянагдаж буй өдрийг доор нь солих — хориг');
  assert.equal(reviewLockBlocks(st, ms(2026, 10, 9)), true, 'шинэ өдрийн бөглөлт — хориг');
  assert.equal(reviewLockBlocks({ days: [], returned: [] }, ms(2026, 10, 9)), false, 'хориггүй');

  /* UI ба домэйн НЭГ дүрэм — эх кодын шалгуур */
  const flowSrc = readFileSync(new URL('../modules/sheet/fill/useFlow.ts', import.meta.url), 'utf8');
  assert.ok(flowSrc.includes('reviewLockState(hyRows'), 'useFlow: хориг `reviewLockState`-ээр биш');
  const subSrc = readFileSync(new URL('./submission.ts', import.meta.url), 'utf8');
  assert.ok(/reviewLockDeny\([^)]*payload\.fillMs\)/.test(subSrc), 'saveSubmission: буцаалтын засварын үл хамаарал (`fillMs`) алга');
  console.log('✅ reviewLockState — groupWorks · recheck · харагддаггүй мөр · буцаалтын засвар');
}

console.log('hyanaltSubmit.check.mjs — БҮГД ТЭНЦЛЭЭ');
