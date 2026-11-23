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
const blk = src.slice(i, i + 1500);
assert.match(blk, /if \(!keep && volOnly && incPl/, 'бөглөсөн өдөр — зөвхөн обьёмын замаар өөрчилсөн үед (2026-11-23)');
assert.match(blk, /let keep = lastDay === msToDay\(fillMs\);/, 'ижил өдөр — бөглөсөн өдрөөр');
assert.match(blk, /incPl && !ov\.dateKeys\.length && ov\.rows\.length === loaded\.rows\.length/, 'зөвхөн нэмэлт обьём, огнооны засвар · шинэ мөргүй');
assert.match(blk, /dayFilter\(sc\.f\.fillDate, msToDay\(fillMs\)\), returnCountOnly: String\(true\)/, 'тэр өдөр жааз байхгүйг шалгана');
assert.match(blk, /if \(!keep\) fillMs = fillMsFor\(serverNow\(\), loaded\.snapshot\);/, 'бусад тохиолдолд хуучин дүрэм');
assert.match(src, /if \(backDated\) \{[\s\S]{0,600}refreshStoredProgress\(pkg, sc, msToDay\(fillMs\)\)/, 'хожуу жаазны хадгалсан хувийг шинэчилнэ');
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
  assert.ok(st.includes('rebaseBackdatedDates(frame, loaded.rows, prevRows, sc, fillMs)'), 'бодит огноо ч өмнөх жаазаар');
}
/* 2026-11-24: хойш огноотой (бөглөсөн өдрөөр) жааз — бодит эхэлсэн/дууссан огноо өмнөх жаазаар; хожуу жаазанд дамжина */
{
  const { rebaseBackdatedDates, laterDates } = await import('./frameRepair.ts');
  const Dm = (s) => Date.parse(`${s}T00:00:00Z`);
  const sc = { aStart: ['s1'], aEnd: ['e1'], obyem: ['o1'], f: { des: 'des' } };
  /* L (11-20): мөр 1 нь 11-15-нд эхэлсэн (D-ээс хойш), мөр 2 нь 11-18-нд дууссан. P (11-05): хоёуланд ажил 0 / 60 */
  const loaded = [
    { des: 1, group: false, vol: 100, aStart: [Dm('2026-11-15')], aEnd: [null] },
    { des: 2, group: false, vol: 100, aStart: [Dm('2026-11-01')], aEnd: [Dm('2026-11-18')] },
    { des: 3, group: true, vol: null, aStart: [null], aEnd: [null] },
  ];
  const prev = [
    { des: 1, obyem: [0], aStart: [null], aEnd: [null] },
    { des: 2, obyem: [60], aStart: [Dm('2026-11-01')], aEnd: [null] },
  ];
  /* D = 11-10: мөр 1 +10 (анхны ажил), мөр 2 +40 (бүрэн) */
  const fill = Dm('2026-11-10') + 5 * 3600_000;
  const frame = [
    { des: 1, o1: 10, s1: Dm('2026-11-15'), e1: null },
    { des: 2, o1: 40, s1: Dm('2026-11-01'), e1: Dm('2026-11-18') },
    { des: 3, o1: null, s1: 123, e1: null },
  ];
  const n = rebaseBackdatedDates(frame, loaded, prev, sc, fill);
  assert.equal(frame[0].s1, Dm('2026-11-10'), 'эхэлсэн = анх ажил > 0 болсон өдөр (L-ийн 11-15 биш)');
  assert.equal(frame[0].e1, null);
  assert.equal(frame[1].s1, Dm('2026-11-01'), 'P-ийн эхэлсэн огноо хэвээр');
  assert.equal(frame[1].e1, Dm('2026-11-10'), 'дууссан = хуримтлал ≥ обьём болсон өдөр (L-ийн 11-18 биш)');
  assert.equal(frame[2].s1, 123, 'бүлгийн мөр хөндөгдөхгүй');
  assert.equal(n, 2);
  /* Хожуу жааз: хадгалсан 11-15/11-18 → D-ийн огноо руу; эрт хадгалсан огноо хэвээр */
  const t = { start: Dm('2026-11-10'), end: Dm('2026-11-10') };
  assert.deepEqual(laterDates({ start: Dm('2026-11-15'), end: Dm('2026-11-18') }, 100, 100, Dm('2026-11-20'), t),
    { start: Dm('2026-11-10'), end: Dm('2026-11-10') });
  const t2 = { start: null, end: null };
  assert.deepEqual(laterDates({ start: null, end: null }, 50, 100, Dm('2026-11-20'), t2), { start: Dm('2026-11-20'), end: null }, 'анх > 0 болсон өдөр');
  assert.deepEqual(laterDates({ start: Dm('2026-11-21'), end: null }, 100, 100, Dm('2026-11-25'), t2), { start: Dm('2026-11-20'), end: Dm('2026-11-25') }, 'дамжуулсан эхлэл · анх бүрэн болсон өдөр');
  const rep2 = readFileSync(new URL('./frameRepair.ts', import.meta.url), 'utf8');
  assert.match(rep2, /export async function refreshStoredProgress[\s\S]*laterDates\(/, 'засварын зам огноог ч засна');
  console.log('✅ хойш огноотой жааз — бодит огноо');
}
/* 2026-11-23 (аудит): бөглөсөн өдрөөр бичих нь ЗӨВХӨН обьёмын замаар өөрчилсөн илгээлтэд — %-аар нэмсэн ахиц (act өөрчлөгдсөн,
   obyem хэвээр) хожуу жаазанд хүрэхгүй тул батлах өдрийн дүрмээр бичигдэнэ */
{
  const { volumeOnlyChange } = await import('./frameRepair.ts');
  const r = (act, obyem, group = false) => ({ group, act, obyem });
  assert.equal(volumeOnlyChange([r([0.2, null], [10, null])], [r([0.4, null], [20, null])]), true, 'обьёмоор → true');
  assert.equal(volumeOnlyChange([r([0.2, null], [null, null])], [r([0.4, null], [null, null])]), false, 'зөвхөн хувиар → false');
  assert.equal(volumeOnlyChange([r([0.2, 0.1], [10, null])], [r([0.4, 0.3], [20, null])]), false, 'нэг блок хувиар → false');
  assert.equal(volumeOnlyChange([r([0.2], [null], true)], [r([0.9], [null], true)]), true, 'бүлгийн мөр тооцохгүй');
  assert.equal(volumeOnlyChange([r([0.2], [1])], []), false, 'мөрийн тоо зөрвөл → false');
  console.log('✅ бөглөсөн өдрийн жааз: зөвхөн обьёмын замаар өөрчилсөн үед');
}
/* 2026-11-23 (аудит): «аль хэдийн архивлагдсан» (хариу алдагдсан батлалтын давталт) замууд хожуу жаазны засварыг (refreshStoredProgress) мөн хийнэ */
{
  const st = readFileSync(new URL('./hyanaltStore.ts', import.meta.url), 'utf8');
  assert.match(st, /async function healLaterFrames\([^)]*\)[\s\S]{0,900}await refreshStoredProgress\(/, 'healLaterFrames → refreshStoredProgress');
  assert.equal((st.match(/await healLaterFrames\(/g) ?? []).length, 2, 'хоёр давталтын замд хоёуланд');
}

/* 2026-11-23 (аудит №10, №14): хожуу өдрүүдийн нэгтгэл (190) дахин бодогдоно · бичсний дараа нэг удаа дахин бодно */
{
  const st = readFileSync(new URL('./hyanaltStore.ts', import.meta.url), 'utf8');
  /* хяналт: засварын ӨМНӨ агшин → refreshStoredProgress → зөвхөн энэ засварын нөлөө */
  assert.match(st, /snapshotNegtgelFrom\(pkg\.group, msToDay\(fillMs\)\);\s+await refreshStoredProgress\(pkg, sc, msToDay\(fillMs\)\);\s+const rs = await resyncNegtgelFrom\(snap\)/, 'хойш огноогоор батлахад');
  assert.match(st, /async function healLaterFrames[\s\S]{0,900}snapshotNegtgelFrom\(pkg\.group, day\);\s+await refreshStoredProgress\([\s\S]{0,80}resyncNegtgelFrom\(snap\)/, 'healLaterFrames-д');
  const nwSrc = readFileSync(new URL('./negtgelWrite.ts', import.meta.url), 'utf8');
  assert.match(nwSrc, /const where = `\$\{F\.bagts\} IN \(/, 'багцыг серверийн where-д');
  assert.match(nwSrc, /resultOffset: String\(offset\)/, 'хуудаслан уншина');
  assert.match(nwSrc, /Бичихийн өмнө дахин уншина[\s\S]{0,900}same\(now\.get/, 'бичихийн өмнө дахин уншиж өөрчлөгдсөнийг алгасна');
  const { negtgelDiffers } = await import('./negtgelWrite.ts');
  const row = { guitsetgel_huvi: 10, tolovlogoo_huvi: 20, obyem: 5, obyem_tolovlogoo: 9 };
  const keys = Object.keys(row);
  const { BAGTS_NEGTGEL } = await import('./services.ts');
  const F = BAGTS_NEGTGEL.fields;
  const r = { [F.progress]: 10, [F.planned]: 20, [F.volume]: 5, [F.volumePlan]: 9 };
  assert.equal(negtgelDiffers(r, { progress: 10.004, planned: 20, volume: 5, volumePlan: 9 }), false, '0.01-ээс бага зөрүү');
  assert.equal(negtgelDiffers(r, { progress: 11, planned: 20, volume: 5, volumePlan: 9 }), true, 'гүйцэтгэл зөрсөн');
  assert.equal(negtgelDiffers(r, { progress: 10, planned: null, volume: null, volumePlan: null }), false, 'null — мэдэгдэхгүй, дарахгүй');
  assert.equal(negtgelDiffers({ ...r, [F.planned]: null }, { progress: 10, planned: 20, volume: 5, volumePlan: 9 }), true, 'хоосон байсныг бөглөнө');
  void keys;
  /* хяналт: ЗӨВХӨН засварын нөлөө (after − before) хадгалсан утга дээр; ±20-оос их үсрэлт бичигдэхгүй */
  const { negtgelDelta, RESYNC_MAX_JUMP } = await import('./negtgelWrite.ts');
  const sum = (progress, planned = 50, volume = 100, volumePlan = 200) => ({ progress, planned, volume, volumePlan });
  assert.equal(negtgelDelta(r, sum(30), sum(30)), null, 'засвар юу ч өөрчлөөгүй — бичихгүй (түүхэн зөрүүг хөндөхгүй)');
  assert.deepEqual(negtgelDelta(r, sum(30), sum(32.5)), { [F.progress]: 12.5 }, 'хадгалсан 10 + (32.5 − 30)');
  assert.deepEqual(negtgelDelta(r, sum(30, 50, 100), sum(30, 50, 104)), { [F.volume]: 9 }, 'обьём ч зөрүүгээр');
  assert.equal(negtgelDelta(r, sum(30), sum(30 + RESYNC_MAX_JUMP + 1)), 'jump', '±20-оос их');
  assert.deepEqual(negtgelDelta({ ...r, [F.progress]: 99 }, sum(30), sum(35)), { [F.progress]: 100 }, '0–100 хязгаар');
  assert.equal(negtgelDelta({ ...r, [F.progress]: null }, sum(30), sum(35)), null, 'хадгалсан утгагүй бол нэмэхгүй');
  assert.equal(negtgelDelta(r, null, sum(35)), null, 'өмнөх агшингүй — бичихгүй');
  const nw = readFileSync(new URL('./negtgelWrite.ts', import.meta.url), 'utf8');
  assert.equal((nw.match(/await settle\(/g) ?? []).length, 3, 'шинэчлэх · давхар нэгтгэх · шинэ мөр — гурван замд бичсний дараа дахин бодно');
  console.log('✅ нэгтгэл 190: хожуу өдрүүд дахин бодогдоно · зэрэг батлалтын дахин бодолт');
}
