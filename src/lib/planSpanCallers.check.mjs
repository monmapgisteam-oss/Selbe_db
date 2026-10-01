/**
 * САР ДОТОРХ ТӨЛӨВЛӨГӨӨТ ХУВЬ — ДУУДАГЧ БҮР АЖЛЫН ЭХЛЭХ–ДУУСАХ ӨДРИЙГ ДАМЖУУЛНА (2026-10-01).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/planSpanCallers.check.mjs
 *
 * ⚠️ Хэрэглэгчийн шийдвэр («бүгдийг зас»): `planPctFromMonths(m, asOf, { start, end })` —
 *    сарын цонх нь ажлын мужтай огтлолцол. Бөглөх хуудас (FillNew), хянагчийн харагдац
 *    (hyanaltDetail), архивлалт (hyanaltStore), нэмэлт ажлын буулгалт (ajilApply), улсын
 *    комисс (ulsiinKomiss) НЭГ дүрэмтэй байх ёстой — нэг нь хоцорвол тэр дэлгэц сарын
 *    эхэнд ХУДАЛ «хоцорсон» харуулна.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planPctFromMonths } from './huvaariObyem.ts';

/* ── 1. Эх код: дуудлага БҮР 3 дахь аргументтай ── */
const SITES = [
  'src/modules/sheet/FillNew.tsx',
  'src/lib/hyanaltDetail.ts',
  'src/lib/hyanaltStore.ts',
  'src/lib/ajilApply.ts',
  'src/lib/ulsiinKomiss.ts',
  'src/lib/planProgress.ts',
];
for (const f of SITES) {
  const src = fs.readFileSync(f, 'utf8');
  const calls = [...src.matchAll(/planPctFromMonths\(([^)]*)\)/g)]
    .map((m) => m[1])
    .filter((args) => !/m:\s*ReadonlyMap/.test(args));
  assert.ok(calls.length > 0, `${f}: planPctFromMonths дуудлага олдсонгүй`);
  for (const args of calls) {
    assert.ok(args.split(',').length >= 3 || /\{/.test(args),
      `${f}: planPctFromMonths(${args}) — ажлын эхлэх/дуусах (3 дахь аргумент) дамжуулаагүй`);
  }
}

/* ── 2. Зан төлөв: 20-нд эхлэх ажил сарын 5-нд 0% (бүтэн сараар бол ~13% байсан) ── */
const d = (iso) => Date.parse(`${iso}T00:00:00Z`);
const m = new Map([['2026-10', 100]]);
const full = planPctFromMonths(m, d('2026-10-05'));
const own = planPctFromMonths(m, d('2026-10-05'), { start: d('2026-10-20'), end: d('2026-10-31') });
assert.ok(full > 0.1, `бүтэн сараар 5-нд ~13% байх ёстой (${full})`);
assert.equal(own, 0, 'ажил 20-нд эхлэх тул 5-нд төлөвлөгөөт хувь 0');
/* Огноо хоосон бол хуучин зам (бүтэн сар) */
assert.equal(planPctFromMonths(m, d('2026-10-05'), { start: null, end: null }), full);
console.log('✅ planPctFromMonths — бүх дуудагч ажлын эхлэх/дуусах өдрийг дамжуулна');
