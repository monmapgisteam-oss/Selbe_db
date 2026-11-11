/**
 * БӨГЛӨСӨН ӨДРӨӨР АРХИВЛАХ (2026-11-11) — эх кодын хамгаалалт.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/frameRepair.check.mjs
 *
 * Хамгаалж буй алдаа: хожуу өдрийн жаазтай үед бөглөлт батлах өдөр рүү шилждэг байв (3-нд бөглөсөн ажил 6-ны ажил болж
 * бичигдэнэ). Одоо бөглөсөн өдрөөр — зөвхөн нэмэлт обьёмын илгээлт, огнооны засвар ба шинэ мөргүй, тэр өдөр жааз байхгүй үед;
 * бичсэний дараа хожуу жаазнуудын хадгалсан хувь шинэчлэгдэнэ.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./hyanaltStore.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const i = src.indexOf('let backDated = false;');
assert.ok(i > 0, 'backDated дүрэм алга');
const blk = src.slice(i, i + 900);
assert.match(blk, /let keep = lastDay === msToDay\(fillMs\);/, 'ижил өдөр — бөглөсөн өдрөөр');
assert.match(blk, /incPl && !ov\.dateKeys\.length && ov\.rows\.length === loaded\.rows\.length/, 'зөвхөн нэмэлт обьём, огнооны засвар · шинэ мөргүй');
assert.match(blk, /dayFilter\(sc\.f\.fillDate, msToDay\(fillMs\)\), returnCountOnly: String\(true\)/, 'тэр өдөр жааз байхгүйг шалгана');
assert.match(blk, /if \(!keep\) fillMs = fillMsFor\(serverNow\(\), loaded\.snapshot\);/, 'бусад тохиолдолд хуучин дүрэм');
assert.match(src, /if \(backDated\) \{[\s\S]{0,200}refreshStoredProgress\(pkg, sc, msToDay\(fillMs\)\)/, 'хожуу жаазны хадгалсан хувийг шинэчилнэ');
const rep = readFileSync(new URL('./frameRepair.ts', import.meta.url), 'utf8');
assert.ok(!/sc\.obyem\b[^\n]*u\[/.test(rep) && !rep.includes('sc.f.plan'), 'обьём, төлөвлөгөөт хувийг хөндөхгүй');
console.log('frameRepair.check: OK');
