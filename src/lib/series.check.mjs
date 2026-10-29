/**
 * Явцын муруйн ЛОГИК ХЯЗГААР — ЖИВЭЭР (live).
 *   node --experimental-transform-types --import./tools/ts-alias.mjs src/lib/series.check.mjs
 *
 * Хамгаалж буй алдаа: барилга угсралт БУУДАГГҮЙ. Хуудсанд «50 → 10 → 15» гэсэн
 * бичлэг байвал (дутуу тайлан, цэвэрлэсэн нүд, бичлэгийн алдаа) муруй хиймэл
 * хонхор гаргаж, «ажил ухарсан» мэт уншигдана. `progressSeries` нь блок бүрээр
 * ӨССӨН ДҮНГ (running max) авдаг тул нэг блокийн муруй ХЭЗЭЭ Ч буурахгүй.
 */
import assert from 'node:assert/strict';
import { loadBlockHistory, progressSeries } from './blockProgress.ts';

if (process.env.SELBE_LIVE_SKIP) {
  console.log('⏭ амьд шалгуур алгасав — үйлчилгээ Organization-only, ARCGIS_ADMIN_TOKEN алга');
  process.exit(0);
}

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
