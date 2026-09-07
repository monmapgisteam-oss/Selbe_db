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
 */
import assert from 'node:assert/strict';
import { dayTagOf, openReviewRow } from './hyanaltSubmit.ts';
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

console.log('hyanaltSubmit.check.mjs — БҮГД ТЭНЦЛЭЭ');
