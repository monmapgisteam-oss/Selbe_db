/**
 * ХАРАГДАЦЫН ЖИЖИГ ХАМГААЛАЛТУУД (2026-11-09).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/components/uiGuards2.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. `DocLibSide` — PDF-ийн жагсаалт ачаалагдаагүй (алдаа / Enterprise сешнгүй) үед бүлэг бүр «0» ба «Баримт алга»
 *      гэж БАТАЛГААТАЙ мэт харуулдаг байв; «Шинэчлэх» нь зөвхөн эрхтэй хэрэглэгчид; огноо хөтчийн бүсээр.
 *   2. `AuthGate` гарахад илгээгээгүй эрхийн өөрчлөлт (`selbe-perms-dirty-v1` · `selbe-caps-dirty-v1`) үлддэг байв.
 *   3. `Portal`-ын «Өгөгдөл: HH:MM» хөтчийн бүсээр (CI/UTC-д 8 цаг зөрнө).
 *   4. `Bagts.PackKpi` — сонгосон багцын хэмжилтгүй гүйцэтгэл «—» гарч байв (эзний дүрэм: 0%).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/* ── 1. DocLibSide ── */
{
  const s = read('./DocLibSide.tsx');
  assert.match(s, /const listKnown = listOk \|\| !ENT_PORTAL;/, 'жагсаалт мэдэгдэж буй эсэх');
  assert.match(s, /<span className=\{s\.grpN\}>\{listKnown \? n : '—'\}<\/span>/, 'ачаалагдаагүй бол тоо «—»');
  assert.match(s, /\{!listKnown\s*\? <div className=\{s\.entSub\}>\{tr\('жагсаалт ачаалагдсангүй'\)\}<\/div>\s*: n === 0 && <div className=\{s\.entSub\}>\{tr\('Баримт алга'\)\}<\/div>\}/,
    '«Баримт алга» зөвхөн жагсаалт ачаалагдсан үед');
  assert.doesNotMatch(s, /\(canEdit \|\| canGroups\) && \(/, '«Шинэчлэх» эрхээр хаагдахгүй');
  assert.doesNotMatch(s, /toLocaleDateString/, 'огноо хөтчийн бүсээр биш');
  assert.match(s, /dayKey\(d\.modified\)/, 'огноо Улаанбаатарын цагаар (`format.dayKey`)');
}
console.log('✅ 1. DocLibSide');

/* ── 2. AuthGate — гарахад dirty түлхүүрүүд ── */
{
  const s = read('./AuthGate.tsx');
  const m = /const clearPermsCache = \(\) => \{\n\s*for \(const k of \[([\s\S]*?)\]\) \{\n\s*try \{ localStorage\.removeItem\(k\); \} catch/.exec(s);
  assert.ok(m, 'clearPermsCache олдсонгүй (try/catch-тай)');
  for (const k of ['selbe-perms-dirty-v1', 'selbe-caps-dirty-v1', 'selbe-perms-v1', 'selbe-caps-v1']) {
    assert.ok(m[1].includes(`'${k}'`), `${k} гарахад устгагдана`);
  }
  assert.match(read('../lib/permissions.ts'), /const DIRTY_KEY = 'selbe-perms-dirty-v1';/, 'permissions DIRTY_KEY нэр');
  assert.match(read('../lib/caps.ts'), /const DIRTY_KEY = 'selbe-caps-dirty-v1';/, 'caps DIRTY_KEY нэр');
}
console.log('✅ 2. AuthGate — dirty түлхүүрүүд');

/* ── 3. Portal «Өгөгдөл: HH:MM» — Улаанбаатарын цаг ── */
{
  const s = read('./Portal.tsx');
  const m = /const hhmm = \(ms: number\): string => \{[\s\S]*?\n\};/.exec(s);
  assert.ok(m, 'hhmm олдсонгүй');
  const hhmm = new Function(`${stripTypeScriptTypes(m[0])}\nreturn hhmm;`)();
  assert.equal(hhmm(Date.parse('2026-11-30T20:05:00Z')), '04:05', 'УБ 12-01 04:05');
  assert.equal(hhmm(Date.parse('2026-11-09T01:30:00Z')), '09:30');
  assert.equal(hhmm(Date.parse('2026-11-09T16:00:00+08:00')), '16:00');
}
console.log('✅ 3. Portal — Өгөгдөл: HH:MM');

/* ── 4. Bagts.PackKpi — хэмжилтгүй багц 0% ── */
{
  const s = read('../modules/Bagts.tsx');
  assert.match(s, /const progress = active \? active\.progress \?\? 0 : project\?\.pct \?\? null;/, 'сонгосон багцын null → 0%');
  assert.match(s, /pct\(b\.progress \?\? 0, 1\)/, 'блокийн жагсаалт 0%');
}
console.log('✅ 4. Bagts — хэмжилтгүй 0%');
console.log('uiGuards2.check: OK');
