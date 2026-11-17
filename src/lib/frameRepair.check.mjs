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
/* БӨГЛӨСӨН ӨДРИЙН ЖААЗ (2026-11-16, аудит №8): хадгалах хувь = өмнөх жааз (P) + нэмэлт; хожуу өдрийн (L) ажил шингэхгүй */
{
  const { rebaseBackdated } = await import('./frameRepair.ts');
  const sc = { act: ['b1', 'b2'], f: { des: 'des', act: 'J', wE: 'E' } };
  /* L (сүүлийн жааз): мөр 2 блок1 = 0.50, мөр 3 блок1 = 0.80 (P-ээс хойш +0.30); P: 0.40 / 0.50 */
  const loaded = [
    { des: 1, raw: { des: 1, b1: 0.65, b2: null, J: 0.65, E: 0.3 } },
    { des: 2, raw: { des: 2, b1: 0.5, b2: 0.2, J: 0.35, E: 0.1 } },
    { des: 3, raw: { des: 3, b1: 0.8, b2: null, J: 0.8, E: 0.2 } },
    { des: 9, raw: { des: 9, b1: 0.1, b2: null, J: 0.1, E: 0 } },
  ];
  const prev = [
    { des: 1, raw: { b1: 0.45, b2: null, J: 0.45, E: 0.2 } },
    { des: 2, raw: { b1: 0.4, b2: 0.2, J: 0.3, E: 0.08 } },
    { des: 3, raw: { b1: 0.5, b2: null, J: 0.5, E: 0.12 } },
  ];
  /* Угсарсан жааз = L + нэмэлт (мөр 2 блок1 +0.10 → бүлэг +0.05) */
  const frame = [
    { des: 1, b1: 0.7, b2: null, J: 0.7, E: 0.32 },
    { des: 2, b1: 0.6, b2: 0.2, J: 0.4, E: 0.12 },
    { des: 3, b1: 0.8, b2: null, J: 0.8, E: 0.2 },
    { des: 9, b1: 0.1, b2: null, J: 0.1, E: 0 },
  ];
  const n = rebaseBackdated(frame, loaded, prev, sc);
  const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-7, `${m}: ${a} ≠ ${b}`);
  near(frame[1].b1, 0.5, 'хөндөгдсөн нүд = P + нэмэлт');
  near(frame[1].b2, 0.2, 'хөндөгдөөгүй блок P-ийн утгаараа');
  near(frame[0].b1, 0.5, 'бүлэг = P + нэмэлтийн нөлөө');
  near(frame[0].J, 0.5, 'мөрийн гүйцэтгэл');
  near(frame[0].E, 0.22, '«одоо байгаа»');
  near(frame[2].b1, 0.5, 'хожуу өдрийн ажил (0.80) шингэхгүй — P-ийн 0.50');
  assert.equal(frame[2].b2, null, 'хоосон нүд хоосон хэвээр');
  assert.equal(frame[3].b1, null, 'P-д байгаагүй, хөндөгдөөгүй мөр — хоосон');
  assert.ok(n > 0, 'өөрчилсөн нүдний тоо');
  /* Мөрийн тоо зөрвөл юу ч хөндөхгүй */
  const f2 = [{ des: 1, b1: 0.7 }];
  assert.equal(rebaseBackdated(f2, loaded, prev, sc), 0);
  assert.equal(f2[0].b1, 0.7);
}
{
  const st = readFileSync(new URL('./hyanaltStore.ts', import.meta.url), 'utf8');
  assert.ok(st.includes('rebaseBackdated(frame, loaded.rows, prevRows, sc)'),'бөглөсөн өдрийн жааз өмнөх жаазтай тулгагдана');
}
