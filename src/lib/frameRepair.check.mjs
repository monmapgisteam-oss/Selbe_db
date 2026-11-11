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
/* ХҮРЭЭ (2026-11-11, амьд туршилт): зөвхөн тэр өдөр обьём бичигдсэн мөр × блок ба тэдгээрийн өвөг бүлэг — жаазыг бүхэлд нь биш */
{
  const { touchedCodes, scopeIdx } = await import('./frameRepair.ts');
  const base = [
    { group: true, des: 1, obyemDay: [null, null] },
    { group: false, des: 2, obyemDay: [0, 3] },
    { group: false, des: 3, obyemDay: [null, 0] },
    { group: false, des: 4, obyemDay: [1, null] },
  ];
  const t = touchedCodes(base);
  assert.deepEqual([...t].map(([k, v]) => [k, [...v]]), [[2, [1]], [4, [0]]], 'обьёмгүй (null/0) нүд, бүлэг мөр орохгүй');
  const rows = [
    { depth: 0, des: 1 }, { depth: 1, des: 10 }, { depth: 2, des: 2 }, { depth: 2, des: 3 },
    { depth: 1, des: 11 }, { depth: 2, des: 4 }, { depth: 1, des: 12 }, { depth: 2, des: 5 },
  ];
  const sc = scopeIdx(rows, t);
  assert.deepEqual([...sc].sort((x, y) => x[0] - y[0]).map(([i, v]) => [i, [...v].sort()]), [[0, [0, 1]], [1, [1]], [2, [1]], [4, [0]], [5, [0]]],
    'мөр өөрийн блокоор, өвөг нь удмынхаа блокуудын нэгдлээр; хамаагүй мөр (3, 6, 7) орохгүй');
  assert.match(rep, /const blocks = scope\.get\(i\);\s+if \(!blocks\) return;/, 'хүрээнээс гадуурх мөрийг бичихгүй');
  assert.match(rep, /if \(!f \|\| !blocks\.has\(b\)\) return;/, 'хүрээнээс гадуурх блокийг бичихгүй');
}
console.log('frameRepair.check: OK');
