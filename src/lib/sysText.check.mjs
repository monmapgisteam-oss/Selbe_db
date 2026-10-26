/**
 * СИСТЕМИЙН ТОГТМОЛ ТЕКСТ ArcGIS-д ЭХ (МОНГОЛ) ХЭЛБЭРЭЭР — ⚠️ 2026-10-26 (аудит).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/sysText.check.mjs
 *
 * Хамгаалж буй шийдвэр (`huvaariBatlah.STUCK_PREFIX_SRC`-ийн 2026-10-12-ны сургамж): хадгалагдах системийн текст
 * (баримтын сангийн «ТЭЗҮ-БОНУ» бүлгийн нэр · обьём/нэмэлт ажлын гацсан буцаалтын шалтгаан) ДАРСАН хүний UI хэлээр
 * бичигдвэл бусад бүх хэрэглэгчид тэр хэлээр л харагдана. Бичихдээ эх текст, дэлгэцэнд `tr()`.
 *   §1 docLib — `storeGroups` анхдагч нэрийг эх текст болгоно (англи хэлбэр ч), гараар солисон нэр хэвээр;
 *      `showGroups` эх текстийг идэвхтэй хэлээр.
 *   §2 obyem — `displayObyemReason` эх угтварыг орчуулна, хэрэглэгчийн текст хэвээр.
 *   §3 ajil — `ajilReasonSrc` (орчуулсан → эх) · `displayAjilReason` (эх → идэвхтэй хэл) · default нь эх текст.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const I18N = await import('@/lib/i18nCore.ts');
const DL = await import('@/lib/docLib.ts');
const OB = await import('@/lib/obyemBatlah.ts');
const AJ = await import('@/lib/ajilBatlah.ts');

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

/* ── §1 docLib ── */
{
  const EN = 'Feasibility study & research';
  eq(DL.storeGroups([{ id: DL.TEZU_GROUP, title: EN }, { id: 'g1', title: 'Зураг' }]),
    [{ id: DL.TEZU_GROUP, title: DL.TEZU_TITLE_SRC }, { id: 'g1', title: 'Зураг' }], '§1 англи нэр → эх текстээр хадгална');
  eq(DL.storeGroups([{ id: DL.TEZU_GROUP, title: I18N.t('ТЭЗҮ-БОНУ') }])[0].title, DL.TEZU_TITLE_SRC, '§1 орчуулсан нэр → эх');
  eq(DL.storeGroups([{ id: DL.TEZU_GROUP, title: 'Миний нэр' }])[0].title, 'Миний нэр', '§1 гараар солисон нэр хэвээр');
  eq(DL.storeGroups([{ id: 'g2', title: EN }])[0].title, EN, '§1 өөр бүлгийн нэр хөндөгдөхгүй');
  eq(DL.showGroups([{ id: DL.TEZU_GROUP, title: DL.TEZU_TITLE_SRC }])[0].title, I18N.t('ТЭЗҮ-БОНУ'), '§1 дэлгэцэнд tr()');
  const src = fs.readFileSync('src/lib/docLib.ts', 'utf8');
  ok(src.includes('await docGroupsWrite(storeGroups(next))'), '§1 saveGroups эх текстээр бичнэ');
  ok(src.includes('? showGroups(r) : [...defaultGroups(), ...r]'), '§1 loadGroups дэлгэцийн хэлбэрээр');
  console.log('✅ §1 «ТЭЗҮ-БОНУ» бүлгийн нэр эх текстээр хадгалагдаж, дэлгэцэнд орчуулагдана');
}

/* ── §2 obyem ── */
{
  const raw = `${OB.OBYEM_STUCK_PREFIX_SRC}\nбатлагчийн тайлбар`;
  eq(OB.displayObyemReason(raw), `${OB.OBYEM_STUCK_PREFIX()}\nбатлагчийн тайлбар`, '§2 эх угтвар → идэвхтэй хэл');
  eq(OB.displayObyemReason('энгийн шалтгаан'), 'энгийн шалтгаан', '§2 хэрэглэгчийн текст хэвээр');
  eq(OB.displayObyemReason(null), '', '§2 null → хоосон');
  eq(OB.OBYEM_STUCK_PREFIX_SRC, 'Хагас бичигдсэн батлалт буцаагдав — үндсэн өгөгдөлд аль хэдийн бичигдсэн обьём хэвээр.', '§2 эх текст = tr түлхүүр');
  console.log('✅ §2 обьёмын гацсан буцаалтын угтвар эх текстээр, дэлгэцэнд орчуулагдана');
}

/* ── §3 ajil ── */
{
  eq(AJ.ajilReasonSrc(AJ.NO_PARENT_REASON()), AJ.NO_PARENT_REASON_SRC, '§3 орчуулсан «эцэг бүлэг» → эх');
  eq(AJ.ajilReasonSrc(`${AJ.NO_KEY_REASON()}\nнэмэлт`), `${AJ.NO_KEY_REASON_SRC}\nнэмэлт`, '§3 олон мөрт — системийн мөр л');
  eq(AJ.ajilReasonSrc('Энгийн шалтгаан'), 'Энгийн шалтгаан', '§3 хэрэглэгчийн текст хэвээр');
  eq(AJ.ajilReasonSrc('Parent group not found'), 'Parent group not found', '§3 танихгүй англи текст хэвээр');
  eq(AJ.displayAjilReason(AJ.NO_PARENT_REASON_SRC), AJ.NO_PARENT_REASON(), '§3 эх → идэвхтэй хэл');
  eq(AJ.displayAjilReason(undefined), '', '§3 undefined → хоосон');
  const src = fs.readFileSync('src/lib/ajilBatlah.ts', 'utf8');
  ok(src.includes('ajilReasonSrc((args.reason ?? NO_PARENT_REASON_SRC).trim())'), '§3 returnStuckAjil — эх текст default');
  ok(src.includes('ajilReasonSrc(args.reason.trim()).slice(0, REASON_MAX)'), '§3 decideAjil — эх текстээр бичнэ');
  const ui = fs.readFileSync('src/modules/AjilBatlah.tsx', 'utf8');
  ok(ui.includes('{displayAjilReason(x.reason) || \'—\'}'), '§3 AjilBatlah дэлгэцэнд орчуулна');
  const ua = fs.readFileSync('src/modules/huvaari/useAjil.ts', 'utf8');
  ok((ua.match(/reason: displayAjilReason\(/g) ?? []).length === 2, '§3 useAjil (Хуваарийн буцаалтын мэдэгдэл) орчуулна');
  const tb = fs.readFileSync('src/modules/sheet/fill/toolbar.tsx', 'utf8');
  ok(tb.includes('displayObyemReason(pvReturned.reason)'), '§3 бөглөх хуудасны обьёмын буцаалт орчуулна');
  console.log('✅ §3 нэмэлт ажлын системийн шалтгаан эх текстээр, дэлгэцэнд орчуулагдана');
}

console.log(`✅ sysText: ${checks} шалгалт — бүгд давлаа`);
