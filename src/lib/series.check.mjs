/**
 * Явцын муруйн ЛОГИК ХЯЗГААР — ЖИВЭЭР (live).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/series.check.mjs
 *
 * Хамгаалж буй алдаа: барилга угсралт БУУДАГГҮЙ. Хуудсанд «50 → 10 → 15» гэсэн
 * бичлэг байвал (дутуу тайлан, цэвэрлэсэн нүд, бичлэгийн алдаа) муруй хиймэл
 * хонхор гаргаж, «ажил ухарсан» мэт уншигдана. `progressSeries` нь блок бүрээр
 * ӨССӨН ДҮНГ (running max) авдаг тул нэг блокийн муруй ХЭЗЭЭ Ч буурахгүй.
 *
 * ⚠️ ЭХ СУРВАЛЖ (2026-08-27-нд СОЛИГДСОН): урьд нь `Selbe_guitsetgel_consolidated`
 * руу ӨӨРИЙН асуулга явуулж логикийг ХУУЛБАРЛАДАГ байв. Тэр үйлчилгээ хаагдсан
 * (499). Одоо порталын ЖИНХЭНЭ шугамыг (`blockProgress.ts` → `sheetRows.ts` →
 * `Bagts_*`) шууд дуудаж шалгана — хуулбар логик байхгүй тул «тест ногоон атлаа
 * портал өөр тоо харуулах» зөрүү үүсэхгүй.
 *
 * ⚠️ ХАТУУ ТОО ТАВИХГҮЙ: бөглөх хуудсуудад гүйцэтгэл дөнгөж орж эхэлж байгаа
 * (2026-08-27-нд 26 блок, 2 агшин). «≥113 блок» гэх мэт хязгаар тавибал өгөгдөл
 * бөглөгдөх хүртэл тест улаан байх бөгөөд жинхэнэ эвдрэлийг далдална. Тиймээс
 * ДҮРЭМ (муруй буурахгүй, хувь хүрээндээ) дээр л тогтоно.
 */
import assert from 'node:assert/strict';
import { loadBlockHistory, progressSeries } from './blockProgress.ts';

const hist = await loadBlockHistory();
const keys = [...hist.keys()];

/* 1. Түүхий бичлэгт бууралт БАЙДАГ — энэ шалгуурын шалтгаан */
let dirty = 0, cleared = 0, points = 0;
for (const h of hist.values()) {
  let prev = null;
  for (const p of h) {
    points += 1;
    if (p.pct == null) { cleared += 1; continue; }
    assert.ok(p.pct >= -0.001 && p.pct <= 100.001, `хувь хүрээнээс гарав: ${p.pct}`);
    if (prev != null && p.pct < prev - 0.001) { dirty += 1; break; }
    prev = p.pct;
  }
}

/* 2. Блок бүрийн муруй ХЭЗЭЭ Ч буурахгүй */
for (const k of keys) {
  let last = null;
  for (const p of progressSeries(hist, [k], 'day')) {
    assert.ok(last == null || p.overall >= last - 0.001,
      `${k}: ${last} → ${p.overall} (${p.label}) буурав`);
    last = p.overall;
  }
}

/* 3. НЭГТГЭСЭН муруй ч буурахгүй — хуваарь нь ТОГТМОЛ (блокийн тоо) */
const curve = progressSeries(hist, keys, 'month');
let prevAvg = null;
for (const p of curve) {
  assert.ok(prevAvg == null || p.overall >= prevAvg - 0.001,
    `нэгтгэл ${prevAvg} → ${p.overall} (${p.label}) буурав`);
  prevAvg = p.overall;
}

/* 4. Эх сурвалж ерөөс уншигдсан эсэх — бүрэн хоосон бол шугам тасарсан гэсэн үг */
assert.ok(keys.length > 0, 'бөглөх хуудсуудаас нэг ч блок уншигдсангүй — шугам тасарсан');
assert.ok(points > 0, 'блокууд олдсон ч түүхийн цэг алга');

console.log(`OK · ${keys.length} блок · ${points} цэг · түүхий бууралттай ${dirty} · хоосон нүд ${cleared}`);
console.log(curve.map((p) => `${p.label} ${p.overall.toFixed(2)}%`).join(' · '));
