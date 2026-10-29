/**
 * НООРОГ — ЭХ ХУУДАСНЫ БҮТЦЭЭР, 191-д (2026-10-26) ШАЛГУУР. Сүлжээгүй — хуурамч Enterprise (`draftRows.fake.mjs`).
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/draftRows.check.mjs
 *
 *   1. Гүйцэтгэлийн ноорог эргэлт (`perfToRows` ↔ `perfFromRows`) — нүд · огноо · tombstone · баримт · суурь · тэмдэглэсэн ·
 *      оролцогч · шинэчлэгдсэн огноо; баганын нэр эх хуудасных (кирилл ч); null ≠ 0.
 *   2. Илгээлтийн мөр (MVCC) — үе · баталгаажаагүй үе үл үзэгдэнэ · хасагдсан түлхүүр · GC · толгойн payload (v2 давхар / v3 мета).
 *   3. Хуваарийн ноорог эргэлт (`planToRows` ↔ `planFromRows`) — муж · бодит огноо · уялдаа · нөөц · сарын мөр (`blok` ·
 *      `sar_txt` · `obyem`, ажил × блок × сар) · суурь (undefined · null · утга) · tombstone.
 *   4. Хамтран засах — нэг мөрийн өөр бүлэг хоёулаа буух · ижил бүлэг LWW · давхардал нийлэх · бүлгийн агшин (зураг).
 *   5. Шилжүүлэлт (JSON → мөр) — уншилт JSON-ыг шингээнэ, анхны бичилт `huuchin_at`, хуучин JSON ХӨНДӨГДӨХГҮЙ, хуучин табын
 *      дараагийн бичилт шингэнэ, админы бүгдийг шилжүүлэх · тулгах · Phase B.
 *   6. Багана алга → JSON горим; хагас → JSON (+ алдаа); сүлжээ → хүлээх.
 *   7. Жааз солигдоход oid зөөлт — код (`des_dugaar`) → шинэ oid; код алга → `mur_oid` + `rowKeys` (hook зөөнө); хуваарь — `rk`.
 *   8. Enterprise-ийн занга — ≤500/хэсэг, толгой СҮҮЛД, 2000 мөрийн хуудаслалт, 200 + `success:false`, `where`-д кирилл үгүй.
 *  13. Хянагчийн олдвор (2026-10-26) — хугацаа дууссан баримт устна (хуурамч баримт үгүй) · oid дахин ашиглагдсан жааз ·
 *      зөөлтийн tombstone · tombstone-ын блокийн нэр · жааз үл мэдэгдэх блокийн нэр · бүлгээр хоосолох · цувааны CAS.
 */
import assert from 'node:assert/strict';
import { makeFake } from './draftRows.fake.mjs';
import {
  addAttrs, buildFrame, cellToCols, colsToCell, COL, gcCandidates, groupsOf, perfFromRows, perfToRows, pickGeneration, planFromRows,
  planToRows, ROW_FIELDS, seriesRead, stampWant, subFromRows, subToRows, viewOf, perfDkey, planDkey, subDkey, diffRows, SYN_BASE,
} from './draftRows.ts';
import {
  rowsTestHooks, rowsReady, perfRead, perfSave, planRead, planReadAt, planSave, setFillFrame, migrateAll, verifyAll,
  phaseB, subRowsFor, subWriteGen, resetRowsCache, planWriteSubmitted, planSyncSubmitted, legacyAndSubHeads,
} from './draftRowsRemote.ts';
import { prepareStore } from './huvaariStore.ts';
import { parseHead, headRaw, assembleRows, archivedContent, SUBMISSION_MAX } from './submission.ts';
import { kS, kH, kA, kR, kM, kN, sig, merge, identityRemap, serialize, hdKey } from './huvaariDraft.ts';
import { packRcpt, unpackRcpt, mergeDrafts, parseDraft } from '../modules/sheet/fill/draft.ts';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const D = 86_400_000;
const NOW = Date.now();
const URL = 'https://fake/ent/Guitsetgel_talbe/FeatureServer/191';
const sortP = (l) => [...(l ?? [])].map((x) => JSON.stringify(x)).sort();
/** Хүссэн мөрүүд → хүснэгтийн мөр (OBJECTID-тай) */
const toAttrs = (rows, base, start = 1) => [...rows.values()].map((w, i) => ({ ...addAttrs(w, base), objectid: start + i }));

/* ══════════ 1. Гүйцэтгэлийн ноорог эргэлт ══════════ */
const FR1 = [
  { oid: 100, no: '1', work: 'Шороон ажил', des: 11, depth: 0, group: true },
  { oid: 101, no: '1.1', work: 'Ухалт', des: 12, depth: 1, group: false },
  { oid: 102, no: '1.2', work: 'Ухалт', des: 13, depth: 1, group: false },
  { oid: 103, no: '1.2', work: 'Ухалт', des: null, depth: 1, group: false },
];
const frame1 = buildFrame(FR1, ['5/1', '5/2']);
{
  /* Нүдний утга ↔ багана — null ≠ 0, хувь 0–1, «=» = хуучин НИЙТ, хог → бичихгүй */
  eq(cellToCols('15 %10'), { ob: 15, act: 0.1, niit: null }, '15 %10');
  eq(cellToCols('%5'), { ob: null, act: 0.05, niit: null }, 'хувь л — obyem_sum null (0 БИШ)');
  eq(cellToCols('0'), { ob: 0, act: null, niit: null }, 'тэг нь бодит утга');
  eq(cellToCols('=55'), { ob: 55, act: null, niit: 1 }, 'хуучин НИЙТ');
  eq(cellToCols('abc'), null, 'хог');
  for (const v of ['15 %10', '%5', '0', '-3', '=55', '2.5', '%0.5', '-1 %-2', '%0', '0 %0', '=%0', '=0', '', '=', '5 %0']) eq(colsToCell(...Object.values(cellToCols(v))), v, `эргэлт ${JSON.stringify(v)}`);
  eq(cellToCols('%0'), { ob: null, act: 0, niit: null }, "R1: '%0' (хувь 0) ≠ '0' (обьём 0)");
  eq(cellToCols(''), { ob: null, act: null, niit: null, blank: true }, "R1: '' — ил хоосолсон");

  const T = NOW - 3 * D;
  const d = {
    t: NOW, mode: 'inc',
    cells: [['101:0', '15 %10'], ['101:1', '%5'], ['102:0', '-3'], ['103:1', '0'], ['102:1', '=55']],
    dates: [['101:0:s', '2026-10-01'], ['101:0:e', ''], ['102:1:e', '2026-11-30']],
    by: [['101:0', 'bat'], ['101:0:s', 'bat'], ['101:0:e', 'bat'], ['101:1', 'dorj'], ['102:0', 'bat'], ['103:1', 'dorj'], ['102:1', 'dorj'], ['102:1:e', 'dorj']],
    byAt: [['101:0', T + 5], ['101:0:s', T + 6], ['101:0:e', T + 7], ['101:1', T + 8], ['102:0', T + 9], ['103:1', T + 10], ['102:1', T + 11], ['102:1:e', T + 12]],
    del: [['100:0', NOW - 1000], ['101:0:s', T]],
    rcpt: packRcpt([['101:1', NOW - 5000, '%3', NOW - 6000], ['102:1:e', NOW - 5000, '2026-11-01', NOW - 6000], ['102:0', NOW - 4000, '', NOW - 4000]]),
    bt: [['101:0', NOW - 5000]],
    hold: [['102:0', NOW - 100, 1]],
    datesB: [['101:0:s', '2026-09-01'], ['101:0:e', '']],
    asOf: Date.UTC(2026, 9, 20), asOfAt: NOW - 50, asOfB: Date.UTC(2026, 9, 1),
    marks: [['bat', 1, 3, NOW - 10], ['dorj', 0, 2, NOW - 20]],
    done: [['bat', NOW - 10]],
    tgt: [['bat', 555, Date.UTC(2026, 9, 24), NOW - 30]],
    frameSeenAt: [100, NOW - 99_999],
    rowKeys: [[101, '1.1 ¦ Ухалт'], [102, '1.2 ¦ Ухалт'], [103, '1.2 ¦ Ухалт']],
  };
  const w = perfToRows(d, frame1, new Map(), NOW);
  eq(w.skipped, [], 'хог нүдгүй');
  ok(w.rows.has('w:d12:0') && w.rows.has('w:d13:1') && w.rows.has('w:o103:1'), 'ажил × блок бүрд нэг мөр — код (`d<код>`), кодгүй бол `o<oid>`');
  const r0 = w.rows.get('w:d12:0');
  eq([r0.a[COL.ob], r0.a[COL.act], r0.a[COL.ps], r0.a[COL.pe]], [15, 0.1, Date.UTC(2026, 9, 1), null], 'эх хуудасны баганад: obyem_sum · бодит_гүйцэтгэл (0–1) · төлөвлөгөөт_хуваарь__эхлэх');
  ok(r0.e.has(COL.pe), "'' огноо → `hoosolson`-д (null ≠ тохируулаагүй)");
  eq([r0.a[COL.des], r0.a[COL.no], r0.a[COL.work], r0.a[COL.blk], r0.a[COL.blkIdx]], [12, '1.1', 'Ухалт', '5/1', 0], 'танихуун · блок мөр');
  ok(w.rows.get('w:d13:0').a[COL.st] === 'albadsan', 'тэмдэглэсэн (албадсан) → tuluv');
  ok(w.rows.has('x:v:d11:0') && w.rows.get('x:v:d11:0').t === 'ustgal', 'tombstone — тусдаа `ustgal` мөр');
  ok(w.rows.has('r:v:d12:1') && w.rows.has('r:e:d13:1') && w.rows.get('r:v:d12:1').t === 'barimt', 'баримт — нүд бүрд');
  ok(w.rows.has('b:s:d12:0') && w.rows.get('b:s:d12:0').base, 'огнооны суурь — `suuri=1`');
  ok(w.rows.has('*') && w.rows.has('b:*') && w.rows.has('u:bat') && w.rows.get('u:bat').t === 'oroltsogch', 'шинэчлэгдсэн огноо · оролцогч');
  for (const x of w.rows.values()) for (const k of Object.keys(addAttrs(x, { dkey: 'n:b1_9f', pkg: 'b1_9f', kind: 'guitsetgel' }))) ok(k === k.toLowerCase() && ROW_FIELDS.concat(['dkey', 'pkg', 'at', 'usr']).includes(k), `багана ${k} notebook-д бий`);
  /* Буцааж — бичигчийн зураг (`stampWant`) нүдний ЯГ агшинтай */
  const base = { dkey: 'n:b1_9f', pkg: 'b1_9f', kind: 'guitsetgel' };
  const attrs = toAttrs(w.rows, base);
  const view = viewOf(attrs, 'guitsetgel');
  const stamps = new Map([...view].map(([k, a]) => [k, w.rows.get(k) ? stampWant(undefined, a, w.rows.get(k), groupsOf('guitsetgel', String(a[COL.turul]), k)) : undefined]));
  const back = perfFromRows({ ...w.hdr }, view, stamps, frame1, NOW);
  eq(sortP(back.cells), sortP(d.cells), 'нүд эргэлт');
  eq(sortP(back.dates), sortP(d.dates), 'огноо эргэлт');
  eq(sortP(back.byAt), sortP(d.byAt), 'нүд бүрийн агшин (бичигчийн зураг)');
  eq(sortP(back.by), sortP(d.by), 'эзэн');
  eq(sortP(back.del), sortP([['100:0', NOW - 1000]]), 'tombstone (дахин бичсэн нүдийнх хасагдсан)');
  eq(sortP(unpackRcpt(back.rcpt)), sortP(unpackRcpt(d.rcpt)), 'баримт (a · sv · sa) ЯГ');
  eq(sortP(back.hold), sortP([['102:0', NOW - 100, 1]]), 'тэмдэглэсэн нүд');
  eq(sortP(back.datesB), sortP(d.datesB), 'огнооны суурь');
  eq([back.asOf, back.asOfAt, back.asOfB], [d.asOf, d.asOfAt, d.asOfB], 'шинэчлэгдсэн огноо · агшин · суурь');
  eq(sortP(back.marks), sortP(d.marks), '«дуусгасан/дахин засах»');
  eq(sortP(back.tgt), sortP(d.tgt), 'зорилт');
  eq(back.frameSeenAt, d.frameSeenAt, 'жаазыг анх харсан');
  eq(sortP(back.bt), sortP([['101:0', NOW - 5000], ['101:0:s', NOW - 5000], ['101:0:e', NOW - 5000]]), 'баримт харсан — мөрийн ДЭЭД (мөрийн түвшин, баримтжуулсан)');
  /* Бусад клиент (зураггүй) — нүд бүрийн агшин = мөрийн агшин (ДЭЭД; баримтжуулсан хязгаар) */
  const other = perfFromRows({ ...w.hdr }, view, new Map(), frame1, NOW);
  const oAt = new Map(other.byAt);
  ok(oAt.get('101:0') === T + 7 && oAt.get('101:0:s') === T + 7, 'зураггүй уншигч — мөрийн at (бүлгүүдийн ДЭЭД)');
  /* Хоосон ноорог → зөвхөн толгой; баримтын хувилбар mergeDrafts-тэй нийцнэ */
  ok(mergeDrafts(back, d) != null, 'mergeDrafts нийцэл');
  console.log('✅ 1. Гүйцэтгэлийн ноорог — эх хуудасны баганаар эргэлт');
}

/* ══════════ 2. Илгээлт — MVCC ══════════ */
{
  const p1 = {
    cells: [['101:0', '15'], ['102:1', '2 %10'], ['103:0', '%1']],
    dates: [['101:0:s', '2026-10-01'], ['101:0:e', '']],
    rowKeys: [[101, '1.1 ¦ Ухалт'], [102, '1.2 ¦ Ухалт'], [103, '1.2 ¦ Ухалт']],
    rowOcc: [[102, 0, 2], [103, 1, 2]],
    asOf: Date.UTC(2026, 9, 20),
  };
  const g1 = 1_000_000.25;
  const g2 = 1_000_500.5;
  const rows1 = subToRows(p1, frame1);
  ok(rows1.has('w:d12:0') && rows1.has('w:o103:0') && rows1.has('*'), 'илгээлтийн нүд — ажил × блок мөр + `*`');
  let oid = 1;
  const db = [...rows1].map(([k, a]) => ({ ...a, [COL.key]: k, [COL.at]: g1, objectid: oid++ }));
  const back1 = subFromRows(pickGeneration(db, [g1]));
  eq(back1.cells, [...p1.cells].sort(), 'нүд эргэлт (mur_oid-оор)');
  eq(back1.dates, [...p1.dates].sort(), 'огноо — хоосолсон нь ""');
  eq(back1.rowKeys, p1.rowKeys, 'мөрийн танигч');
  eq(back1.rowOcc, p1.rowOcc, 'давтамж');
  eq(back1.asOf, p1.asOf, 'asOf');
  /* Үе 2: нэг нүд өөрчлөгдөж, нэг хасагдана — зөвхөн тэдний мөр (хасагдсан нь хоосон мөр) */
  const p2 = { ...p1, cells: [['101:0', '20'], ['102:1', '2 %10']] };
  const rows2 = subToRows(p2, frame1);
  for (const [k, a] of rows2) if (JSON.stringify(a) !== JSON.stringify(rows1.get(k))) db.push({ ...a, [COL.key]: k, [COL.at]: g2, objectid: oid++ });
  db.push({ [COL.key]: 'w:o103:0', [COL.turul]: 'ajil', [COL.oid]: 103, [COL.at]: g2, objectid: oid++ });
  /* Баталгаажаагүй үе (бичигч унасан) — ХЭЗЭЭ Ч харагдахгүй */
  db.push({ ...rows2.get('w:d12:0'), [COL.ob]: 999, [COL.key]: 'w:d12:0', [COL.at]: 2_000_000.5, objectid: oid++, last_edited_date: NOW - 60 * 60_000 });
  const back2 = subFromRows(pickGeneration(db, [g1, g2]));
  eq(back2.cells, [['101:0', '20'], ['102:1', '2 %10']], 'сүүлийн үе — өөрчлөгдсөн · хасагдсан · баталгаажаагүй (999) үл үзэгдэнэ');
  eq(subFromRows(pickGeneration(db, [g1, g2], g1)).cells, back1.cells, 'бэхэлсэн үе (`prevGen`) — тэр агшны агуулга');
  const dead = gcCandidates(db.map((a) => ({ ...a, last_edited_date: a.last_edited_date ?? NOW - 30 * 60_000 })), [g1, g2], [], NOW, 15 * 60_000);
  ok(dead.includes(oid - 1), 'GC: 15 мин+ баталгаажаагүй мөр');
  ok(dead.length >= 2 && !dead.includes(db.find((a) => a[COL.at] === g2 && a[COL.key] === 'w:d12:0').objectid), 'GC: сүүлийн үеийн мөр үлдэнэ, солигдсон нь устна');
  const keepPin = gcCandidates(db.map((a) => ({ ...a, last_edited_date: NOW - 30 * 60_000 })), [g1, g2], [g1], NOW, 15 * 60_000);
  ok(!keepPin.includes(1), 'GC: бэхэлсэн үеийн мөр үлдэнэ');
  ok(gcCandidates(db.map((a) => ({ ...a, last_edited_date: NOW })), [g1, g2], [], NOW, 15 * 60_000).length === 0, 'GC: дөнгөж солигдсон мөр — өмнөх толгойг уншигч хамгаалагдана');

  /* Толгойн payload — v2 давхар (`gens`) · v3 мета · `prevGen` */
  const P = {
    v: 2, mode: 'inc', pkgKey: 'b1_9f', user: 'bat', at: 1_790_000_000_000, fillMs: Date.UTC(2026, 9, 20), base: null, asOf: null,
    cells: p1.cells, dates: p1.dates, adds: [], rowKeys: p1.rowKeys, nonces: ['n1'],
    archiving: { at: 1, startedAt: 2, maxOid0: 3, fillMs: Date.UTC(2026, 9, 20), n: 4, prev: { cells: [['1:0', '1']], rowKeys: [[1, 'a']] }, prevGen: g1 },
  };
  const dual = headRaw(P, [g1, g2]);
  const hd = parseHead(dual);
  ok(hd && hd.gens?.length === 2 && !hd.meta && hd.p.cells.length === 3, 'v2 давхар хуулбар + gens (багтвал)');
  const meta = headRaw(P, [g1, g2], true);
  const hm = parseHead(meta);
  ok(hm && hm.meta && hm.p.cells.length === 0 && !meta.includes('"cells"'), 'v3 мета — нүдгүй');
  ok(hm.p.archiving?.prevGen === g1 && !hm.p.archiving?.prev, 'v3: `prev` хасагдаж `prevGen` үлдэнэ');
  ok(hm.p.nonces?.[0] === 'n1' && meta.includes('"nonces"'), 'урсгалын мета хэвээр (findNonce · archiving LIKE)');
  const big = { ...P, cells: Array.from({ length: 4000 }, (_, i) => [`${i}:0`, '12345.678 %1']) };
  ok(headRaw(big, [g1]).length < SUBMISSION_MAX && JSON.parse(headRaw(big, [g1])).v === 3, 'хэт том → v3 мета (хязгааргүй)');
  ok(JSON.parse(headRaw(P, null)).v === 2 && !headRaw(P, null).includes('"gens"'), '`gens`-гүй — хуучин хэлбэр ЯГ');
  eq(parseHead(JSON.stringify({ ...JSON.parse(meta), gens: undefined })), null, 'v3 нь gens-гүй бол задрахгүй');
  /* Угсралт — v3 мета + мөр → бүтэн payload; «архивлаж байна» тэмдгийн хуулбар `prevGen`-ийн үеэс (`archivedContent`) */
  const full = assembleRows(hm, db);
  eq(full.cells, back2.cells, 'угсралт — сүүлийн үеийн нүд');
  eq(full.archiving?.prev?.cells, back1.cells, 'тэмдгийн хуулбар — бэхэлсэн үеийн нүд');
  eq(archivedContent(full)?.cells, back1.cells, 'archivedContent нь угсарсан хуулбараар');
  ok(full.nonces?.[0] === 'n1' && full.pkgKey === 'b1_9f', 'мета хэвээр');
  console.log('✅ 2. Илгээлт — MVCC үе · GC · толгойн payload');
}

/* ══════════ 3. Хуваарийн ноорог эргэлт ══════════ */
{
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const day = () => Math.round(19900 + rnd() * 600) * D;
  const users = ['bat', 'dorj', 'tsetseg'];
  const e = (val, at, user, bv) => (bv === undefined ? { val, at, user } : { val, at, user, bv });
  for (let it = 0; it < 40; it += 1) {
    const n = pick([1, 3, 22]);
    const ent = [];
    const del = [];
    const at = () => NOW - Math.floor(rnd() * 5 * D) - 1;
    for (let i = 0; i < 30; i += 1) {
      const oid = 100 + Math.floor(rnd() * 15);
      const blk = Math.floor(rnd() * n);
      const kind = pick(['s', 'a', 'h', 'r', 'm', 'n', 'del']);
      const bvMode = pick(['none', 'null', 'val']);
      if (kind === 's') {
        const s0 = day();
        ent.push([kS(oid, blk), e(rnd() < 0.15 ? null : { start: s0, end: s0 + Math.floor(rnd() * 40) * D }, at(), pick(users),
          bvMode === 'none' ? undefined : bvMode === 'null' ? null : { start: day(), end: day() + 5 * D })]);
      } else if (kind === 'a') {
        ent.push([kA(oid, blk), e([rnd() < 0.5 ? day() : null, rnd() < 0.5 ? day() : null], at(), pick(users),
          bvMode === 'none' ? undefined : bvMode === 'null' ? null : [day(), null])]);
      } else if (kind === 'h') {
        ent.push([kH(oid), e(pick(['', '12FS', '3SS+2,4FF']), at(), pick(users), bvMode === 'none' ? undefined : bvMode === 'null' ? null : pick(['', '1FS']))]);
      } else if (kind === 'r') {
        ent.push([kR(oid), e([pick([null, 0, 4]), pick([null, 2])], at(), pick(users), bvMode === 'none' ? undefined : bvMode === 'null' ? null : [1, null])]);
      } else if (kind === 'm') {
        const mk = `${oid}|${pick(['A', 'B', 'Ажил', '5/1 барилга'])}`;
        const months = [['2026-01', 5], ['2026-02', 0], ['2026-05', 12.5]].filter(() => rnd() < 0.6);
        ent.push([kM(mk), e(months, at(), pick(users), bvMode === 'none' ? undefined : bvMode === 'null' ? null : [['2026-01', 4], ['2026-03', 0]])]);
      } else if (kind === 'n') {
        const mk = `${oid}|${pick(['A', 'B'])}`;
        const months = [['2026-01', 3, null], ['2026-04', null, 2], ['2026-06', 0, 1]].filter(() => rnd() < 0.6);
        ent.push([kN(mk), e(months, at(), pick(users), bvMode === 'none' ? undefined : [['2026-01', 1, 1]])]);
      } else {
        const k = pick([kS(oid, blk), kH(oid), kM(`${oid}|A`), kN(`${oid}|B`), kA(oid, blk), kR(oid)]);
        del.push([k, NOW - Math.floor(rnd() * 3 * D)]);
      }
    }
    const rk = new Map(Array.from({ length: 15 }, (_, i) => [100 + i, { des: 1000 + i, no: `${i}.1`, work: `Ажил ${i}` }]));
    const d = { t: NOW, kind: 'plan', pkg: 'b2_9f', by: { user: 'bat', at: NOW }, base: { at: 5, n }, entries: new Map(ent), del: new Map(del), rk };
    const ctx = { n, rows: new Map(), bld: Array.from({ length: n }, (_, i) => (n === 1 ? '' : `5/${i + 1}`)) };
    const w = planToRows(d, ctx, 'plan', { now: NOW });
    const base = { dkey: 'n:plan:plan:b2_9f', pkg: 'b2_9f', kind: 'plan' };
    const attrs = toAttrs(w.rows, base);
    const view = viewOf(attrs, 'plan');
    const stamps = new Map([...view].map(([k, a]) => [k, w.rows.get(k) ? stampWant(undefined, a, w.rows.get(k), groupsOf('plan', String(a[COL.turul]), k)) : undefined]));
    const back = planFromRows({ ...w.hdr }, view, stamps, { kind: 'plan', pkg: 'b2_9f' }, NOW, ctx.bld);
    const exp = merge(d, null, NOW);
    const strip = (x) => sig({ ...x, rk: undefined });
    eq(strip(back), strip(exp), `хуваарийн эргэлт #${it}`);
  }
  /* Сарын мөр — `GU_huvaari_20260906`-ийн нэр, ажил × блок × сар бүрд нэг; null ≠ 0 */
  const d = {
    t: NOW, kind: 'geree', pkg: 'b1_9f', by: { user: 'bat', at: NOW }, base: { at: 1, n: 2 },
    entries: new Map([
      [kM('77|5/1 барилга'), { val: [['2026-01', 0], ['2026-02', 12]], at: NOW - 5, user: 'bat' }],
      [kM('77|5/2 барилга'), { val: [], at: NOW - 6, user: 'bat' }],
      [kS(500, 1), { val: { start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 1, 1) }, at: NOW - 7, user: 'bat', bv: null }],
    ]),
    del: new Map(),
  };
  const w = planToRows(d, { n: 2, rows: new Map([[500, { spans: [], ham: null, aStart: [], aEnd: [], hun: null, mashin: null, des: 77, no: '3', work: 'Хана' }]]), bld: ['5/1 барилга', '5/2 барилга'] }, 'geree');
  const m1 = w.rows.get('m:d77:5/1 барилга:2026-01');
  ok(m1 && m1.t === 'sar_obyem' && m1.a[COL.mob] === 0 && m1.a[COL.ym] === '2026-01' && m1.a[COL.blk] === '5/1 барилга' && m1.a[COL.des] === 77, 'сар: blok · sar_txt · obyem (0 = тэг, null биш)');
  ok(m1.a[COL.too] === 2 && w.rows.get('m:d77:5/1 барилга:2026-02').at === m1.at, 'цуваа — нэг агшинтай, `sar_too`');
  ok(w.rows.get('m:d77:5/2 барилга:-')?.e.has(COL.mob), 'хоосон цуваа — тэмдэг мөр');
  const sp = w.rows.get('w:d77:1');
  ok(sp.a[COL.gs] === Date.UTC(2026, 0, 1) && sp.a[COL.ps] == null, 'гэрээний муж → geree_ehleh (төлөвлөгөөт биш)');
  ok(w.rows.has('b:s:d77:1') && w.rows.get('b:s:d77:1').base, 'суурь null → хоосон суурь мөр');
  {
    const ctxD = { n: 1, rows: new Map([[600, { spans: [], ham: null, aStart: [], aEnd: [], hun: null, mashin: null, des: 88, no: '1', work: 'Шал' }]]), bld: [''] };
    const rkD = new Map([[37001, { des: 88, no: '1', work: 'Шал' }]]);
    const sNew = { start: Date.UTC(2026, 2, 1), end: Date.UTC(2026, 3, 1) };
    const sOld = { start: Date.UTC(2025, 2, 1), end: Date.UTC(2025, 3, 1) };
    const dd = {
      t: NOW, kind: 'plan', pkg: 'b1_9f', by: { user: 'bat', at: NOW }, base: { at: 1, n: 1 }, rk: rkD,
      entries: new Map([[kS(600, 0), { val: sNew, at: NOW - 1, user: 'bat' }], [kS(37001, 0), { val: sOld, at: NOW - 9, user: 'bat' }], [kH(37001), { val: 'A', at: NOW - 2, user: 'bat' }]]),
      del: new Map([[kH(600), NOW - 5]]),
    };
    const wd = planToRows(dd, ctxD, 'plan', { now: NOW }).rows.get('w:d88:0');
    ok(wd.a[COL.ps] === sNew.start && wd.a[COL.oid] === 600 && wd.at === NOW - 1, 'R-H1: шинэ оролт — утга ба mur_oid (хуучин oid сүүлд давтагдсан ч)');
    const wh = planToRows(dd, ctxD, 'plan', { now: NOW });
    ok(wh.rows.get('w:d88')?.a[COL.ham] === 'A' && !wh.rows.has('x:h:d88'), 'R-H1: шинэ амьд оролттой нүдний хуучин tombstone алгасна');
    /* R-H2: устгалын мөрөөс ч `rk` */
    const xa = { [COL.key]: 'x:h:d88', [COL.turul]: 'ustgal', [COL.at]: NOW, [COL.oid]: 37001, [COL.des]: 88, [COL.no]: '1', [COL.work]: 'Шал' };
    const bk = planFromRows({ [COL.at]: NOW }, new Map([['x:h:d88', xa]]), new Map(), { kind: 'plan', pkg: 'b1_9f' }, NOW, ['']);
    ok(bk.rk?.get(37001)?.des === 88 && bk.del.has(kH(37001)), 'R-H2: устгалын мөрөөс ажлын танихуун');
  }
  /* Дутуу (холилдсон) цуваа — агшин − 1 */
  const rows = [
    { [COL.key]: 'm:d1:A:2026-01', [COL.turul]: 'sar_obyem', [COL.ym]: '2026-01', [COL.mob]: 1, [COL.too]: 2, [COL.at]: 50 },
    { [COL.key]: 'm:d1:A:2026-02', [COL.turul]: 'sar_obyem', [COL.ym]: '2026-02', [COL.mob]: 2, [COL.too]: 2, [COL.at]: 40 },
    { [COL.key]: 'm:d1:A:2026-03', [COL.turul]: 'sar_obyem', [COL.ym]: null, [COL.mob]: null, [COL.too]: null, [COL.at]: 99 },
  ];
  eq(seriesRead(rows, 'm'), { val: [['2026-01', 1]], at: 49, user: '' }, 'дутуу цуваа — агшин − 1; цэвэрлэсэн мөрийн агшин тооцогдохгүй');
  console.log('✅ 3. Хуваарийн ноорог — эх хуудасны баганаар эргэлт, сар бүрд мөр');
}

/* ══════════ Хуурамч Enterprise ══════════ */
const fresh = (opt) => {
  const f = makeFake(URL, opt);
  resetRowsCache();
  rowsTestHooks({ post: f.post, url: URL, me: 'bat', reset: true, imgs: new Map() });
  return f;
};
const asClient = (imgs, me) => rowsTestHooks({ imgs, me });

/* ══════════ 4. Хамтран засах ══════════ */
{
  const f = fresh();
  const A = new Map(); const B = new Map();
  const key = hdKey('plan', 'b2_9f');
  const ctx = { n: 2, rows: new Map([[101, { spans: [null, null], ham: null, aStart: [], aEnd: [], hun: null, mashin: null, des: 12, no: '1.1', work: 'Ухалт' }]]), bld: ['5/1', '5/2'] };
  const hd = (entries, del = []) => ({ t: NOW, kind: 'plan', pkg: 'b2_9f', by: { user: 'x', at: NOW }, base: { at: 1, n: 2 }, entries: new Map(entries), del: new Map(del) });
  asClient(A, 'a');
  ok((await planRead(key)).ok, 'A уншина (хоосон)');
  asClient(B, 'b');
  ok((await planRead(key)).ok, 'B уншина (хоосон)');
  /* A муж, B бодит огноо — НЭГ мөр (w:d12:0), ӨӨР бүлэг, хоёулаа уншаагүй үед зэрэг */
  asClient(A, 'a');
  ok((await planSave(key, hd([[kS(101, 0), { val: { start: 10 * D, end: 20 * D }, at: NOW + 1, user: 'a' }]]), { ctx })).ok, 'A бичнэ');
  asClient(B, 'b');
  ok((await planSave(key, hd([[kA(101, 0), { val: [11 * D, null], at: NOW + 2, user: 'b' }]]), { ctx })).ok, 'B бичнэ (A-гийнхыг хараагүй)');
  const rowsNow = f.all().filter((a) => a.mur_key === 'w:d12:0');
  ok(rowsNow.length === 2, 'зэрэг нэмэлт → давхардсан мөр (нэгдмэл индексгүй)');
  asClient(A, 'a');
  const ra = await planRead(key, { bld: ctx.bld });
  ok(ra.ok && ra.draft.entries.get(kS(101, 0))?.val.start === 10 * D && sameVal2(ra.draft.entries.get(kA(101, 0))?.val, [11 * D, null]), 'давхардал нийлж ХОЁР бүлэг харагдана');
  /* A нийлүүлээд бичнэ — давхардлыг бага OBJECTID-д нэгтгэж бусдыг устгана */
  ok((await planSave(key, ra.draft, { ctx })).ok, 'A нийлбэрийг бичнэ');
  ok(f.all().filter((a) => a.mur_key === 'w:d12:0').length === 1, 'давхардал арилав');
  /* Ижил бүлэг — B (хуучин зурагтай) A-гийн муж дээр бичвэл зөвхөн тэр бүлэг, LWW-ийг hook-ийн merge шийднэ */
  asClient(B, 'b');
  const rb = await planRead(key, { bld: ctx.bld });
  ok(rb.ok && rb.draft.entries.get(kS(101, 0))?.at === NOW + 2, 'B-д A-гийн мужийн агшин = мөрийн at (бүлгүүдийн ДЭЭД — зураггүй, баримтжуулсан)');
  const mergedB = merge(rb.draft, hd([[kS(101, 0), { val: { start: 1 * D, end: 2 * D }, at: NOW + 5, user: 'b' }]]));
  ok((await planSave(key, mergedB, { ctx })).ok, 'B мужийг дарна (шинэ агшин)');
  const lastEdit = f.edits[f.edits.length - 1];
  const upd = lastEdit.ups.find((u) => u.attributes[COL.ps] !== undefined);
  ok(upd && !(COL.as in upd.attributes), 'шинэчлэлт ЗӨВХӨН өөрчлөгдсөн бүлгийг илгээнэ (бодит огноо хөндөгдөхгүй)');
  asClient(A, 'a');
  const ra2 = await planRead(key, { bld: ctx.bld });
  ok(ra2.draft.entries.get(kS(101, 0))?.val.start === 1 * D && sameVal2(ra2.draft.entries.get(kA(101, 0))?.val, [11 * D, null]), 'A: B-гийн муж + өөрийн бодит огноо хоёулаа');
  ok(ra2.draft.entries.get(kA(101, 0))?.at === NOW + 2, 'A-гийн зураг: өөрчлөгдөөгүй бүлгийн агшин хэвээр (мөрийн at-аар дарагдаагүй)');
  /* Tombstone — тусдаа мөр, агшин ЯГ */
  ok((await planSave(key, { ...ra2.draft, entries: new Map([...ra2.draft.entries].filter(([k]) => k !== kA(101, 0))), del: new Map([[kA(101, 0), NOW + 9]]) }, { ctx })).ok, 'A бодит огноог буцаана');
  asClient(B, 'b');
  const rb2 = await planRead(key, { bld: ctx.bld });
  ok(!rb2.draft.entries.has(kA(101, 0)) && rb2.draft.del.get(kA(101, 0)) === NOW + 9, 'B tombstone-ийг ЯГ агшинтай нь харна');
  const stale = merge(rb2.draft, hd([[kA(101, 0), { val: [5 * D, null], at: NOW + 3, user: 'b' }]]));
  ok(!stale.entries.has(kA(101, 0)), 'хуучин (tombstone-оос эрт) хуулбар амилахгүй');
  /* Хувилбар — серверийн цагаар: өөрийн бичилтийн дараа өөрчлөгдөнө, юу ч бичээгүй бол хэвээр */
  const v1 = await planReadAt(key);
  const v2 = await planReadAt(key);
  ok(typeof v1 === 'number' && v1 === v2, 'хувилбар тогтвортой');
  asClient(A, 'a');
  await planSave(key, merge(ra2.draft, hd([[kH(101), { val: '12FS', at: NOW + 20, user: 'a' }]])), { ctx });
  asClient(B, 'b');
  ok((await planReadAt(key)) !== v1, 'хамтрагчийн бичилт хувилбарыг өөрчилнө (CAS шаардлагагүй)');
  console.log('✅ 4. Хамтран засах — өөр бүлэг хоёулаа · давхардал нийлнэ · tombstone ЯГ · хувилбар серверийн цаг');
}
function sameVal2(a, b) { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }

/* ══════════ 5. Шилжүүлэлт (JSON → мөр) ══════════ */
{
  const f = fresh();
  const key = hdKey('plan', 'b2_9f');
  const legacyD = { t: NOW - 100, kind: 'plan', pkg: 'b2_9f', by: { user: 'old', at: NOW - 100 }, base: { at: 1, n: 1 },
    entries: new Map([[kS(101, 0), { val: { start: 3 * D, end: 4 * D }, at: NOW - 200, user: 'old' }], [kH(102), { val: '1FS', at: NOW - 150, user: 'old' }]]), del: new Map() };
  const L = f.seed({ dkey: key, usr: 'old', pkg: key, at: NOW - 100, payload: serialize(legacyD) });
  const r0 = await planRead(key);
  ok(r0.ok && r0.draft?.entries.size === 2, 'мөр алга — JSON ноорог уншигдана');
  ok(typeof (await planReadAt(key)) === 'number', 'хувилбар — JSON-ы at');
  ok((await planSave(key, r0.draft, { ctx: null })).ok, 'анхны бичилт = шилжүүлэлт');
  const hdr = f.all().find((a) => a.dkey === planDkey('plan', 'b2_9f') && a.mur_turul === 'tolgoi');
  ok(hdr && hdr.huuchin_at === NOW - 100 && hdr.huvilbar === 3, 'толгой: huuchin_at = JSON-ы at, huvilbar 3');
  ok(f.rows.get(L).payload === serialize(legacyD), 'хуучин JSON ХӨНДӨГДӨӨГҮЙ');
  ok(f.all().filter((a) => a.dkey === planDkey('plan', 'b2_9f') && a.mur_turul === 'ajil').length >= 2, 'нүд мөр болов');
  /* Хуучин таб JSON-д дахин бичнэ → дараагийн уншилт шингээнэ */
  const legacy2 = { ...legacyD, t: NOW + 50, entries: new Map([...legacyD.entries, [kH(103), { val: '7SS', at: NOW + 40, user: 'old' }]]) };
  f.rows.set(L, { ...f.rows.get(L), at: NOW + 50, payload: serialize(legacy2), last_edited_date: f.now() });
  const r1 = await planRead(key);
  ok(r1.ok && r1.draft.entries.get(kH(103))?.val === '7SS', 'хуучин табын шинэ нүд шингэв');
  ok((await planSave(key, r1.draft, { ctx: null })).ok, 'шингээснийг бичнэ');
  ok(f.all().find((a) => a.dkey === planDkey('plan', 'b2_9f') && a.mur_turul === 'tolgoi').huuchin_at === NOW + 50, 'huuchin_at урагшилна');
  /* Гүйцэтгэлийн ноорог — JSON payload → мөр; hook-ийн parseDraft-аар задарна */
  const pd = { t: NOW - 10, mode: 'inc', cells: [['101:0', '5'], ['102:1', '%2']], dates: [['101:0:e', '2026-12-01']], byAt: [['101:0', NOW - 20]], rowKeys: [[101, '1.1 ¦ Ухалт'], [102, '1.2 ¦ Ухалт']] };
  const PL = f.seed({ dkey: 'b1_9f', usr: 'old', pkg: 'b1_9f', at: NOW - 10, payload: JSON.stringify(pd) });
  setFillFrame('b1_9f', FR1, ['5/1', '5/2']);
  const pr = await perfRead('b1_9f');
  ok(pr.ok && parseDraft(pr.draft.payload, 'remote')?.cells.length === 2, 'гүйцэтгэлийн JSON уншигдана (hook-ийн хэлбэрээр)');
  ok((await perfSave('b1_9f', pr.draft.payload)).ok, 'гүйцэтгэлийн анхны бичилт');
  ok(f.all().some((a) => a.dkey === perfDkey('b1_9f') && a.mur_key === 'w:d12:0' && a[COL.ob] === 5 && a[COL.pe] === Date.UTC(2026, 11, 1)), 'мөр — obyem_sum · төлөвлөгөөт_хуваарь__дуусах');
  ok(f.rows.get(PL).payload === JSON.stringify(pd), 'хуучин JSON ХӨНДӨГДӨӨГҮЙ');
  /* Админ — хэн ч нээгээгүй ноорог */
  f.seed({ dkey: hdKey('geree', 'b62'), usr: 'old', pkg: hdKey('geree', 'b62'), at: NOW - 5, payload: serialize({ ...legacyD, kind: 'geree', pkg: 'b62' }) });
  f.seed({ dkey: 'bagtsHamaaral', usr: 'x', pkg: 'bagtsHamaaral', at: 1, payload: '{"x":1}' });
  const mg = await migrateAll();
  ok(mg.failed.length === 0 && mg.migrated === 1, `бүгдийг шилжүүлэх — зөвхөн шилжээгүй нь (${JSON.stringify(mg)})`);
  ok(f.all().some((a) => a.dkey === planDkey('geree', 'b62') && a.mur_turul === 'tolgoi'), 'гэрээний ноорог мөр болов');
  const again = await migrateAll();
  ok(again.migrated === 0, 'давтахад дахин бичихгүй');
  const vf = await verifyAll();
  ok(vf.total === 3 && vf.same === 3 && !vf.diff.length && !vf.pending.length, `тулгалт бүрэн зөв (${JSON.stringify(vf)})`);
  const pb = await phaseB(vf);
  ok(pb.deleted === 3 && !f.all().some((a) => a.dkey === key || a.dkey === 'b1_9f'), 'Phase B — хуучин JSON устав');
  ok(f.all().some((a) => a.dkey === 'bagtsHamaaral'), 'bagtsHamaaral ХӨНДӨГДӨӨГҮЙ');
  ok((await planRead(key)).draft.entries.get(kH(103))?.val === '7SS', 'Phase B-ийн дараа мөрөөс бүрэн');
  /* Анхны нээлтээр (засагч) шилжинэ — уншигч бичихгүй */
  const k63 = hdKey('plan', 'b63');
  const L63 = f.seed({ dkey: k63, usr: 'old', pkg: k63, at: NOW - 3, payload: serialize({ ...legacyD, pkg: 'b63' }) });
  await prepareStore(k63, { canWrite: false, ctx: null });
  ok(!f.all().some((a) => a.dkey === planDkey('plan', 'b63')), 'уншигч (засах эрхгүй) нээхэд шилжүүлэхгүй');
  ok((await prepareStore(k63, { canWrite: true, ctx: null })).mode === 'rows', 'засагч нээнэ');
  ok(f.all().some((a) => a.dkey === planDkey('plan', 'b63') && a.mur_turul === 'tolgoi' && a.huuchin_at === NOW - 3), 'засагчийн анхны нээлт → мөр (huuchin_at)');
  ok(f.rows.get(L63).payload === serialize({ ...legacyD, pkg: 'b63' }), 'JSON хэвээр');
  const st = await import('./fillStore.ts');
  f.seed({ dkey: 'b54', usr: 'old', pkg: 'b54', at: NOW - 2, payload: JSON.stringify({ ...pd, t: NOW - 2 }) });
  setFillFrame('b54', FR1, ['5/1', '5/2']);
  const r54 = await st.readRemoteDraft('b54');
  ok(r54.ok && f.all().some((a) => a.dkey === perfDkey('b54') && a.mur_key === 'w:d12:0'), 'гүйцэтгэлийн анхны нээлт → мөр');
  console.log('✅ 5. Шилжүүлэлт — уншилт шингээнэ, JSON хөндөгдөхгүй, админ · тулгалт · Phase B');
}

/* ══════════ 6. Багана алга → JSON горим ══════════ */
{
  fresh({ noColumns: true });
  eq((await rowsReady(true)).mode, 'blob', 'багана алга → blob');
  eq((await prepareStore('plan:plan:b1_9f', { canWrite: true, ctx: null })).mode, 'blob', 'huvaariStore → JSON горим');
  fresh({ partial: true });
  const errs = [];
  const ce = console.error; console.error = (...a) => errs.push(a.join(' '));
  eq((await rowsReady(true)).mode, 'blob', 'хагас багана → blob (холихгүй)');
  console.error = ce;
  ok(errs.some((x) => x.includes('ДУТУУ')), 'хагас багана — console.error');
  const f = fresh();
  f.metaDown = true;
  eq((await rowsReady(true)).mode, 'wait', 'сүлжээ → хүлээх');
  eq((await prepareStore('plan:plan:b1_9f', { canWrite: true, ctx: null })).mode, 'rows-wait', 'huvaariStore → rows-wait (JSON руу бичихгүй)');
  f.metaDown = false;
  eq((await rowsReady()).mode, 'rows', 'сэргэмэгц мөр (кэшгүй — хуудас дахин ачаалалгүй)');
  console.log('✅ 6. Fallback — багана алга/хагас → JSON, сүлжээ → хүлээх');
}

/* ══════════ 7. Жааз солигдоход oid зөөлт ══════════ */
{
  const f = fresh();
  setFillFrame('b41_9f', FR1, ['5/1', '5/2']);
  const d = { t: NOW, mode: 'inc', cells: [['101:0', '7'], ['103:1', '%3']], dates: [], byAt: [['101:0', NOW - 1], ['103:1', NOW - 2]], rowKeys: [[101, '1.1 ¦ Ухалт'], [103, '1.2 ¦ Ухалт']], rowOcc: [[103, 1, 2]] };
  ok((await perfSave('b41_9f', JSON.stringify(d))).ok, 'жааз 1 дээр бичнэ');
  /* Шинэ жааз — ижил код, шинэ oid; кодгүй мөр (103) шинэ жаазад өөр oid */
  const FR2 = FR1.map((r) => ({ ...r, oid: r.oid + 400 }));
  resetRowsCache();
  rowsTestHooks({ post: f.post, url: URL, me: 'bat', imgs: new Map() });
  setFillFrame('b41_9f', FR2, ['5/1', '5/2']);
  const r = await perfRead('b41_9f');
  const back = parseDraft(r.draft.payload, 'remote');
  ok(back.cells.some(([k, v]) => k === '501:0' && v === '7'), 'код (`des_dugaar`) → ШИНЭ жаазны oid');
  ok(back.cells.some(([k]) => k === '103:1') && back.rowKeys.some(([o, l]) => o === 103 && l === '1.2 ¦ Ухалт') && back.rowOcc.some((x) => x[0] === 103 && x[1] === 1 && x[2] === 2),
    'кодгүй мөр — хуучин oid + rowKeys/rowOcc (hook-ийн mapOldOids зөөнө)');
  /* hook зөөсөн нүдийг шинэ oid-оор бичнэ → хуучин мөр цэвэрлэгдэнэ (харсан) */
  const moved = { ...back, cells: [['501:0', '7'], ['503:1', '%3']], byAt: [['501:0', NOW - 1], ['503:1', NOW + 5]], rowKeys: [[501, '1.1 ¦ Ухалт'], [503, '1.2 ¦ Ухалт']], rowOcc: [[503, 1, 2]], t: NOW + 10 };
  ok((await perfSave('b41_9f', JSON.stringify(moved))).ok, 'зөөсөн ноорог бичигдэнэ');
  const live = f.all().filter((a) => a.dkey === perfDkey('b41_9f') && a.mur_turul === 'ajil' && (a[COL.ob] != null || a[COL.act] != null));
  eq(live.map((a) => a.mur_key).sort(), ['w:d12:0', 'w:o503:1'], 'хуучин `o103` мөр хоосорч, шинэ мөр');
  /* Хуваарь — `rk` танихууны баганаас → identityRemap */
  const key = hdKey('plan', 'b41_9f');
  const ctx1 = { n: 1, rows: new Map([[101, { spans: [null], ham: null, aStart: [], aEnd: [], hun: null, mashin: null, des: 12, no: '1.1', work: 'Ухалт' }]]), bld: [''] };
  await planSave(key, { t: NOW, kind: 'plan', pkg: 'b41_9f', by: { user: 'a', at: NOW }, base: { at: 1, n: 1 }, entries: new Map([[kH(101), { val: '2FS', at: NOW, user: 'a' }]]), del: new Map() }, { ctx: ctx1 });
  const pr = await planRead(key);
  const ctx2 = { n: 1, rows: new Map([[501, { spans: [null], ham: null, aStart: [], aEnd: [], hun: null, mashin: null, des: 12, no: '1.1', work: 'Ухалт' }]]), months: () => undefined, monthsRes: () => undefined };
  const rm = identityRemap(pr.draft, ctx2);
  eq([...rm.map], [[101, 501]], 'хуваарь: мөрийн `des_dugaar`-аас rk → шинэ oid');
  console.log('✅ 7. Жааз солигдоход oid зөөлт');
}

/* ══════════ 8. Enterprise-ийн занга ══════════ */
{
  const f = fresh();
  setFillFrame('b2_9f', Array.from({ length: 700 }, (_, i) => ({ oid: 1000 + i, no: `${i}`, work: `Ажил ${i}`, des: 5000 + i, depth: 0, group: false })), ['A', 'B']);
  const cells = [];
  for (let i = 0; i < 700; i += 1) { cells.push([`${1000 + i}:0`, String(i + 1)]); cells.push([`${1000 + i}:1`, `%${(i % 9) + 1}`]); }
  const d = { t: NOW, mode: 'inc', cells, dates: [], rowKeys: [] };
  f.edits.length = 0;
  ok((await perfSave('b2_9f', JSON.stringify(d))).ok, '1,400 мөр бичигдэнэ');
  ok(f.edits.length >= 3 && f.edits.every((e) => e.adds.length + e.ups.length + e.dels.length <= 500 && e.rollback), '≤500/хэсэг, rollbackOnFailure');
  const last = f.edits[f.edits.length - 1];
  ok(last.adds.some((a) => a.attributes.mur_key === 'h') && !f.edits.slice(0, -1).some((e) => e.adds.some((a) => a.attributes.mur_key === 'h')), 'толгой СҮҮЛИЙН хэсэгт');
  /* Хуудаслалт — 2000-аас их мөр */
  const big = { ...d, cells: [...cells, ...Array.from({ length: 700 }, (_, i) => [`${1000 + i}:0`, String(i + 2)])].slice(0, 1400), dates: Array.from({ length: 700 }, (_, i) => [`${1000 + i}:1:s`, '2026-10-01']) };
  for (let i = 0; i < 700; i += 1) f.seed({ dkey: perfDkey('b2_9f'), pkg: 'b2_9f', mur_turul: 'ustgal', mur_key: `x:v:d${9000 + i}:0`, at: NOW - i, mur_oid: 9 });
  resetRowsCache();
  rowsTestHooks({ post: f.post, url: URL, me: 'bat', imgs: new Map() });
  setFillFrame('b2_9f', Array.from({ length: 700 }, (_, i) => ({ oid: 1000 + i, no: `${i}`, work: `Ажил ${i}`, des: 5000 + i, depth: 0, group: false })), ['A', 'B']);
  const r = await perfRead('b2_9f');
  ok(r.ok && parseDraft(r.draft.payload, 'remote').cells.length === 1400, '2,100+ мөр хуудаслалтаар бүрэн уншигдана');
  /* 200 + success:false → алдаа, зураг дахин уншина */
  f.failAfter = 1;
  const bad = await perfSave('b2_9f', JSON.stringify(big));
  ok(!bad.ok && /татгалзав|Database/.test(bad.error), '200-тай мөрийн алдаа → амжилтгүй');
  ok((await perfSave('b2_9f', JSON.stringify(big))).ok, 'дахин оролдоход (зураг шинэчлэгдэж) бууна');
  ok(f.queries.every((w) => !/[Ѐ-ӿ]/.test(w.replace(/'(?:[^']|'')*'/g, ''))), 'where-д кирилл багана ХЭЗЭЭ Ч үгүй');
  /* Илгээлтийн мөр — баталгаажаагүй үе */
  const w1 = await subWriteGen(77, 'b2_9f', subToRows({ cells: [['1000:0', '5']], dates: [], rowKeys: [[1000, '0 ¦ Ажил 0']], asOf: null }, null), new Map(), 123.5);
  ok(w1.ok && (await subRowsFor([77])).get(77).every((a) => a.dkey === subDkey(77) && a.at === 123.5 && a.noorog_turul === 'ilgeelt'), 'илгээлтийн үе бичигдэнэ (`n:sub:<OBJECTID>`)');
  console.log('✅ 8. Enterprise — ≤500 · толгой сүүлд · хуудаслалт · 200 алдаа · кирилл where үгүй');
}

/* ══════════ 9. Хуваарийн илгээх агшны хуулбар (`n:hsub:`) ══════════ */
{
  const f = fresh();
  const key = hdKey('plan', 'b2_9f');
  const ctx = { n: 1, rows: new Map([[101, { spans: [null], ham: null, aStart: [], aEnd: [], hun: null, mashin: null, des: 12, no: '1.1', work: 'Ухалт' }]]), bld: [''] };
  const d = { t: NOW, kind: 'plan', pkg: 'b2_9f', by: { user: 'a', at: NOW }, base: { at: 1, n: 1 }, entries: new Map([[kS(101, 0), { val: { start: D, end: 2 * D }, at: NOW, user: 'a', bv: null }]]), del: new Map() };
  ok(await planWriteSubmitted(key, d, ctx, 314), 'хуулбар бичигдэнэ');
  ok(f.all().some((a) => a.dkey === 'n:hsub:314' && a.noorog_turul === 'huvaari_ilgeelt' && a.mur_key === 'w:d12:0'), 'n:hsub:<OBJECTID> · huvaari_ilgeelt');
  rowsTestHooks({ pending: async () => ({ plan: null, geree: null }) });
  await planSyncSubmitted('b2_9f', { force: true });
  ok(!f.all().some((a) => a.dkey === 'n:hsub:314'), 'хүлээгдэхээ больсон хуулбар устав');
  rowsTestHooks({ pending: null });
  console.log('✅ 9. Хуваарийн илгээлтийн хуулбар');
}

/* ══════════ 10. fillStore — useDraftSync-ийн хэлбэр (мөрийн горим) ══════════ */
{
  fresh();
  const st = await import('./fillStore.ts');
  setFillFrame('b1_12f', FR1, ['5/1', '5/2']);
  eq(await st.readRemoteDraftAt('b1_12f'), null, 'ноорог алга → null (hook: алсгүй)');
  ok(st.remoteMax() === Number.POSITIVE_INFINITY, 'мөрийн горимд хэмжээний хязгааргүй');
  const cells = Array.from({ length: 3 }, (_, i) => [`${101 + i}:0`, String(i + 1)]);
  const huge = { t: NOW, mode: 'inc', cells, dates: [], rowKeys: [], by: cells.map(([k]) => [k, 'x'.repeat(100)]), conv: Array.from({ length: 6000 }, (_, i) => [`k${i}`, i]) };
  ok(JSON.stringify(huge).length > 80_000, 'тест: JSON 80,000-аас их');
  ok((await st.saveRemoteDraft('b1_12f', NOW, JSON.stringify(huge), { expectAt: null })).ok, 'том ноорог мөрөнд бичигдэнэ (хязгааргүй)');
  const v1 = await st.readRemoteDraftAt('b1_12f');
  const rr = await st.readRemoteDraft('b1_12f');
  const back = rr.ok && rr.draft ? parseDraft(rr.draft.payload, 'remote') : null;
  ok(typeof v1 === 'number' && rr.ok && rr.draft.at === v1 && back?.t === v1, 'хувилбар = draft.t (hook-ийн lastMergedRef)');
  eq(back.cells.map(([k, v]) => [k, v]).sort(), [...cells].sort(), 'нүд');
  ok(!back.conv, '«conv» (анхааруулга) зөвхөн локал');
  fresh({ noColumns: true });
  await st.readRemoteDraftAt('zz_none').catch(() => null);
  ok(st.remoteMax() === 80_000, 'JSON горимд REMOTE_MAX');
  console.log('✅ 10. fillStore — hook-ийн хэлбэр, хязгааргүй');
}

/* ══════════ 11. R1 · R2 — хуучин НИЙТ горимын '' / '%0' нүд ба « ¦ »-гүй шошго алдагдалгүй ══════════ */
{
  const p = {
    cells: [['101:0', '=%0'], ['101:1', '='], ['102:0', '=0'], ['102:1', '=12 %5'], ['900:0', '']],
    dates: [['900:0:s', '2026-10-01']],
    rowKeys: [[101, '1.1 ¦ Ухалт'], [102, '1.2 ¦ Ухалт'], [900, 'Хуучин шошго']],
    asOf: null,
  };
  const rows = subToRows(p, frame1);
  const r900 = rows.get('w:o900:0');
  ok(r900 && r900[COL.no] === 'Хуучин шошго' && r900[COL.work] == null && listedOf2(r900).includes(COL.work) && listedOf2(r900).includes(COL.ob), 'R2: « ¦ »-гүй шошго — f_ бүтэн, ажил NULL + тэмдэг; R1: obyem_sum жагсаагдсан');
  let oid = 1;
  const db = [...rows].map(([k, a]) => ({ ...a, [COL.key]: k, [COL.at]: 5, objectid: oid++ }));
  const back = subFromRows(pickGeneration(db, [5]));
  eq(back.cells, [...p.cells].sort(), "R1: '=' · '=%0' · '=0' · '' нүд ЯГ");
  eq(back.dates, p.dates, 'огноо');
  eq(back.rowKeys, p.rowKeys, 'R2: шошго ЯГ (« ¦ »-гүй ч)');
  /* Гүйцэтгэлийн ноорог — жаазад алга, « ¦ »-гүй шошготой oid */
  const d = { t: NOW, mode: 'inc', cells: [['900:0', '%0'], ['101:0', '']], dates: [], byAt: [['900:0', NOW - 1], ['101:0', NOW - 2]], rowKeys: [[900, 'Хуучин шошго'], [101, '1.1 ¦ Ухалт']] };
  const w = perfToRows(d, frame1, new Map(), NOW);
  const base = { dkey: 'n:x', pkg: 'x', kind: 'guitsetgel' };
  const view = viewOf(toAttrs(w.rows, base), 'guitsetgel');
  ok(!isEmptyRow2(view.get('w:o900:0')), 'танихууны тэмдэг мөрийг хоосон болгохгүй/хоосон биш гэж андуурахгүй');
  const stale = new Map();
  const pb = perfFromRows({ ...w.hdr }, view, new Map(), frame1, NOW, stale);
  eq(sortP(pb.cells), sortP(d.cells), "гүйцэтгэл: '%0' · '' нүд");
  ok(pb.rowKeys.some(([o, l]) => o === 900 && l === 'Хуучин шошго') && stale.get(900)?.bare, 'гүйцэтгэл: « ¦ »-гүй шошго + дараагийн бичилтэд тэмдэг');
  ok(perfToRows(pb, frame1, stale, NOW).rows.get('w:o900:0').e.has(COL.work), 'дахин бичихэд тэмдэг хэвээр');
  console.log('✅ 11. R1 · R2 — хоосон/хувь 0 нүд ба « ¦ »-гүй шошго');
}
function listedOf2(a) { return String(a[COL.empty] ?? '').split(',').filter(Boolean); }
function isEmptyRow2(a) { return !a || (a[COL.ob] == null && a[COL.act] == null && !listedOf2(a).some((c) => c !== COL.work)); }

/* ══════════ 12. Тулгалт засварын дараа · Phase B-ийн дахин шалгалт · урт түлхүүр ══════════ */
{
  const f = fresh();
  const key = hdKey('plan', 'b31_9f');
  const ctx = { n: 1, rows: new Map([[101, { spans: [null], ham: null, aStart: [], aEnd: [], hun: null, mashin: null, des: 12, no: '1.1', work: 'Ухалт' }]]), bld: [''] };
  const legacyD = { t: NOW - 100, kind: 'plan', pkg: 'b31_9f', by: { user: 'old', at: NOW - 100 }, base: { at: 1, n: 1 },
    entries: new Map([[kS(101, 0), { val: { start: 3 * D, end: 4 * D }, at: NOW - 200, user: 'old' }], [kH(101), { val: '1FS', at: NOW - 150, user: 'old' }]]), del: new Map() };
  const L = f.seed({ dkey: key, usr: 'old', pkg: key, at: NOW - 100, payload: serialize(legacyD) });
  const mg = await migrateAll();
  ok(mg.migrated === 1 && !mg.failed.length, 'шилжүүлэв');
  /* Шилжүүлснээс хойш (серверийн цагаас хойш) хэрэглэгч мөрөнд мужийг өөрчилнө */
  const later = f.clock + 10 * 60_000;
  const r = await planRead(key, { bld: ctx.bld });
  ok((await planSave(key, merge(r.draft, { ...legacyD, t: later, entries: new Map([[kS(101, 0), { val: { start: 7 * D, end: 9 * D }, at: later, user: 'a' }]]) }), { ctx })).ok, 'шилжүүлсний дараах засвар');
  const vf = await verifyAll();
  ok(vf.same === 1 && vf.edited.includes(key) && !vf.diff.length, `засагдсан ноорог — «тооцогдсон» (${JSON.stringify(vf)})`);
  /* Хуучин нүдийг мөрөөс ЧИМЭЭГҮЙ алдсан бол — зөрүү */
  const hRow = f.all().find((a) => a.dkey === planDkey('plan', 'b31_9f') && a.mur_key === 'w:d12');
  f.rows.set(hRow.objectid, { ...hRow, hamaaral: 'ӨӨР', last_edited_date: f.now() });
  const vf2 = await verifyAll();
  ok(vf2.diff.includes(key), 'хуучин утга алга, хойшхи засваргүй → зөрүү');
  f.rows.set(hRow.objectid, { ...hRow, last_edited_date: f.now() });
  const vf3 = await verifyAll();
  ok(!vf3.diff.length, 'сэргээсэн — зөрүүгүй');
  /* Тулгалтаас хойш хуучин таб JSON-д бичвэл Phase B тэр мөрийг устгахгүй */
  f.rows.set(L, { ...f.rows.get(L), at: f.clock + 99_999_999, payload: serialize({ ...legacyD, t: NOW + 1 }), last_edited_date: f.now() });
  const pb = await phaseB(vf3);
  ok(pb.deleted === 0 && f.rows.has(L) && pb.failed.length === 1, 'Phase B — шингээгдээгүй JSON ХАДГАЛАГДАНА');
  /* Урт `mur_key` (> 160) — алгасна, бусад мөр бичигдэнэ (бүх хэсэг татгалзагдахгүй) */
  const long = 'Б'.repeat(200);
  const d2 = { ...legacyD, t: NOW + 5, entries: new Map([[kH(101), { val: '2FS', at: NOW + 5, user: 'a' }], [kM(`12|${long}`), { val: [['2026-01', 3]], at: NOW + 5, user: 'a' }]]) };
  const warns = [];
  const cw = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  const s2 = await planSave(hdKey('plan', 'b32_9f'), d2, { ctx });
  console.warn = cw;
  ok(s2.ok && warns.some((x) => x.includes('хэт урт')), 'урт түлхүүр — анхааруулж алгасна');
  ok(f.all().some((a) => a.dkey === planDkey('plan', 'b32_9f') && a.mur_key === 'w:d12') && f.all().every((a) => String(a.mur_key ?? '').length <= 160), 'бусад мөр бичигдэв, 160-аас урт түлхүүр алга');
  console.log('✅ 12. Тулгалт (засварын дараа) · Phase B дахин шалгалт · урт түлхүүр');
}

/* ══════════ 13. Хянагчийн олдворууд (2026-10-26) ══════════ */
{
  const base = { dkey: 'n:b1_9f', pkg: 'b1_9f', kind: 'guitsetgel' };
  const imgOf = (attrs) => { const m = new Map(); for (const a of attrs) { const l = m.get(a.mur_key); if (l) l.push(a); else m.set(a.mur_key, [a]); } return m; };
  /* 13a. 7 хоногоос хуучин баримт — мөр УСТНА; хоосолсон баримт уншилтад баримт биш; илгээгээгүй нүд үлдэнэ */
  const d0 = { t: NOW, mode: 'inc', cells: [['101:0', '7']], dates: [], byAt: [['101:0', NOW - 2 * D]], rowKeys: [[101, '1.1 ¦ Ухалт']],
    rcpt: packRcpt([['101:0', NOW - 8 * D, '5', NOW - 8 * D]]) };
  const wOld = perfToRows(d0, frame1, new Map(), NOW - 8 * D + 1000);
  ok(wOld.rows.has('r:v:d12:0'), 'баримт бичигдсэн (тэр үед шинэ)');
  const wNow = perfToRows(d0, frame1, new Map(), NOW);
  ok(!wNow.rows.has('r:v:d12:0'), 'ROW_TTL-ээс хуучин баримт хүсэгдэхгүй');
  const ops = diffRows(imgOf(toAttrs(wOld.rows, base)), wNow.rows, 'guitsetgel', base, { clearAt: NOW, me: 'bat', now: NOW });
  ok(ops.some((o) => o.op === 'delete' && o.k === 'r:v:d12:0') && !ops.some((o) => o.op === 'update' && o.k === 'r:v:d12:0'), 'хүсээгүй баримт УСТГАГДАНА (хоосолохгүй)');
  const rRow = toAttrs(wOld.rows, base, 900).find((a) => a.mur_key === 'r:v:d12:0');
  const cleared = { ...rRow, [COL.ob]: null, [COL.act]: null, [COL.niit]: null, [COL.sentAt]: null, at: NOW };
  const rb = perfFromRows(null, viewOf([...toAttrs(wNow.rows, base), cleared], 'guitsetgel'), new Map(), frame1, NOW);
  ok(!rb.rcpt || unpackRcpt(rb.rcpt).length === 0, 'хоосолсон баримт — хуурамч баримт үүсэхгүй');
  ok(rb.cells.some(([k, v]) => k === '101:0' && v === '7'), 'илгээгээгүй шинэ нэмэлт үлдэнэ');
  const bCleared = { objectid: 950, mur_key: 'b:s:d12:0', mur_turul: 'ajil', suuri: 1, [COL.oid]: 101, at: NOW };
  const rb2 = perfFromRows(null, viewOf([...toAttrs(wNow.rows, base), bCleared], 'guitsetgel'), new Map(), frame1, NOW);
  ok(!(rb2.datesB ?? []).length, "хоосолсон суурь — суурь '' биш, алга");

  /* 13b. Хуудас дахин нийтлэгдэж oid дахин ашиглагдав: des 55 (oid 123) хасагдаж, oid 123 = des 77 */
  const frA = buildFrame([{ oid: 123, no: '5', work: 'Хуучин ажил', des: 55, depth: 0, group: false }], []);
  const dA = { t: NOW, mode: 'inc', cells: [['123:0', '4']], dates: [], byAt: [['123:0', NOW - 5]], rowKeys: [[123, '5 ¦ Хуучин ажил']] };
  const wA = perfToRows(dA, frA, new Map(), NOW);
  ok(wA.rows.has('w:d55:0'), 'жааз A — код 55');
  const frB = buildFrame([{ oid: 123, no: '7', work: 'Шинэ', des: 77, depth: 0, group: false }], []);
  const dB = { t: NOW, mode: 'inc', cells: [['123:0', '9']], dates: [], byAt: [['123:0', NOW - 3]], rowKeys: [[123, '7 ¦ Шинэ']] };
  const wB = perfToRows(dB, frB, new Map(), NOW);
  ok(wB.rows.has('w:d77:0'), 'жааз B — код 77 өөрийн нүдтэй');
  const st = new Map();
  const rd = perfFromRows(null, viewOf([...toAttrs(wA.rows, base), ...toAttrs(wB.rows, base, 50)], 'guitsetgel'), new Map(), frB, NOW, st);
  const cm = new Map(rd.cells);
  ok(cm.get('123:0') === '9', 'код 77-ийн нүд өөрийн oid-д (давхцаж алга болохгүй)');
  const syn = [...cm.keys()].map((k) => Number(k.split(':')[0])).find((o) => o >= SYN_BASE);
  ok(syn != null && cm.get(`${syn}:0`) === '4', 'код 55 — жаазад алга орлуулагч oid (өөр ажилд буухгүй)');
  ok(rd.rowKeys.some(([o, l]) => o === syn && l === '5 ¦ Хуучин ажил'), 'өөрийн шошго — hook `mapOldOids` зөөнө/барина');
  const wBack = perfToRows(rd, frB, st, NOW);
  ok(wBack.rows.has('w:d55:0') && wBack.rows.get('w:d55:0').a[COL.oid] === 123 && wBack.rows.get('w:d77:0')?.a[COL.ob] === 9, 'дахин бичихэд ижил мөр, жинхэнэ `mur_oid`');
  const wL = perfToRows(dA, frB, new Map(), NOW);
  ok(wL.rows.has('w:o123:0') && !wL.rows.has('w:d77:0'), 'хуучин JSON-ы шошго жаазтай зөрвөл код 77 руу бичихгүй');
  const rL = perfFromRows(null, viewOf(toAttrs(wL.rows, base), 'guitsetgel'), new Map(), frB, NOW, new Map());
  ok(!rL.cells.some(([k]) => k === '123:0'), 'уншихад ч код 77-ийн oid-д буухгүй');

  /* 13c. Хуваарь — hook-ийн зөөлтийн tombstone (жаазад алга oid, агшин = одоо) зөөгдсөн нүдийг устгахгүй */
  const row5 = { spans: [null], ham: null, aStart: [], aEnd: [], hun: null, mashin: null, des: 5, no: '1', work: 'А' };
  const rk5 = new Map([[10, { des: 5, no: '1', work: 'А' }], [900, { des: 5, no: '1', work: 'А' }]]);
  const dP = { t: NOW, kind: 'plan', pkg: 'bx', by: { user: 'a', at: NOW }, base: { at: 1, n: 1 }, rk: rk5,
    entries: new Map([[kS(10, 0), { val: { start: 3 * D, end: 4 * D }, at: NOW - 1000, user: 'a' }]]), del: new Map([[kS(900, 0), NOW]]) };
  const ctxP = { n: 1, rows: new Map([[10, row5]]), bld: [''] };
  ok(!planToRows(dP, ctxP, 'plan').rows.has('x:s:d5:0'), 'ctx — зөөлтийн tombstone бичигдэхгүй');
  ok(!planToRows(dP, null, 'plan', { cur: new Set([10]) }).rows.has('x:s:d5:0'), 'ctx-гүй (админы шилжүүлэлт) — хуудаснаас олдсон oid-оор');
  const dP2 = { ...dP, entries: new Map([[kS(900, 0), { val: { start: 3 * D, end: 4 * D }, at: NOW - 1000, user: 'a' }]]), del: new Map([[kS(10, 0), NOW]]) };
  ok(planToRows(dP2, ctxP, 'plan').rows.has('x:s:d5:0'), 'одоогийн oid дээрх ЖИНХЭНЭ устгал хэвээр');
  /* 13d. Tombstone-ын блокийн нэр */
  const ctx2 = { n: 2, rows: new Map([[10, { ...row5, spans: [null, null] }]]), bld: ['A', 'B'] };
  const dP3 = { ...dP, base: { at: 1, n: 2 }, entries: new Map(), del: new Map([[kS(10, 1), NOW]]) };
  eq(planToRows(dP3, ctx2, 'plan').rows.get('x:s:d5:1')?.a[COL.blk], 'B', 'tombstone `blok` нэртэй (блокийн дараалал солигдоход нэрээр)');
  /* 13e. Жааз үл мэдэгдэх → `blok` NULL ('Ажил' биш) */
  const sp = { cells: [['101:3', '5']], dates: [], rowKeys: [[101, '1.1 ¦ Ухалт']], asOf: null };
  eq(subToRows(sp, null).get('w:o101:3')?.[COL.blk] ?? null, null, 'жаазгүй — blok NULL');
  ok(!(COL.blk in subToRows(sp, null).get('w:o101:3')), 'жаазгүй — blok илгээгдэхгүй');
  {
    const rowsB = [
      { objectid: 10, [COL.turul]: 'tolgoi', [COL.key]: 'h', [COL.at]: NOW, [COL.usr]: 'a', [COL.blkIdx]: 3 },
      { objectid: 11, [COL.turul]: 'ajil', [COL.key]: 'w:d100:1', [COL.oid]: 5, [COL.des]: 100, [COL.no]: '1', [COL.work]: 'A', [COL.blkIdx]: 1, [COL.blk]: 'Блок Б', [COL.ps]: NOW, [COL.pe]: NOW + D, [COL.at]: NOW - D, [COL.usr]: 'a' },
    ];
    const vB = viewOf(rowsB, 'plan');
    const dB = planFromRows(vB.get('h'), vB, new Map(), { kind: 'plan', pkg: 'b1' }, NOW);
    const imgB = new Map([...vB].map(([k, a]) => [k, [a]]));
    const opsB = diffRows(imgB, planToRows(dB, null, 'plan').rows, 'plan', { dkey: 'x', pkg: 'b1', kind: 'plan' }, { clearAt: NOW, me: 'b', now: NOW, keep: () => false });
    ok(!opsB.some((o) => o.a && COL.blk in o.a), 'жаазгүй бичилт (дэлгэцэнд байхгүй түлхүүрийн цэвэрлэлт) — байгаа мөрийн `blok`-ыг NULL болгохгүй');
  }
  eq(subToRows(sp, { ...frame1, partial: true }).get('w:o101:3')?.[COL.blk] ?? null, null, 'хэсэгчилсэн жааз — blok NULL');
  eq(subToRows({ ...sp, cells: [['101:0', '5']] }, buildFrame(FR1, [])).get('w:d12:0')?.[COL.blk], 'Ажил', 'блокгүй бүрэн жааз — Ажил');
  /* 13f. Хүсээгүй мөрийг ЗӨВХӨН зурагт байгаа бүлгээр хоосолно */
  const pb = { dkey: 'n:plan:plan:bx', pkg: 'bx', kind: 'plan' };
  const imgP = new Map([['w:d5:0', [{ objectid: 1, mur_key: 'w:d5:0', mur_turul: 'ajil', [COL.ps]: 3 * D, [COL.pe]: 4 * D, at: NOW - 10 }]]]);
  const u = diffRows(imgP, new Map(), 'plan', pb, { clearAt: NOW, me: 'a', now: NOW }).find((o) => o.op === 'update');
  ok(u && u.a[COL.ps] === null && u.a[COL.pe] === null && !(COL.as in u.a) && !(COL.ae in u.a), 'хамтрагчийн бодит огноо (зурагт алга) хөндөгдөхгүй');
  /* 13g. Сарын цуваа — сервер/зураг шинэ бол хуучин бичигч дарахгүй */
  const mk = (at, val) => planToRows({ ...dP, rk: undefined, entries: new Map([[kM('5|A'), { val, at, user: 'a' }]]), del: new Map() }, null, 'plan').rows;
  const yRows = mk(NOW, [['2026-10', 3], ['2026-12', 1]]);
  const xRows = mk(NOW - 100, [['2026-11', 4]]);
  const imgY = imgOf(toAttrs(yRows, pb));
  ok(!diffRows(imgY, xRows, 'plan', pb, { clearAt: NOW - 100, me: 'a', now: NOW }).some((o) => o.k.startsWith('m:')), 'зураг шинэ — цуваа хөндөгдөхгүй');
  const imgX0 = imgOf(toAttrs(mk(NOW - 200, [['2026-11', 2]]), pb));
  ok(!diffRows(imgX0, xRows, 'plan', pb, { clearAt: NOW - 100, me: 'a', now: NOW, seriesAt: new Map([['m:d5:A', NOW]]) }).some((o) => o.k.startsWith('m:')), 'сервер (`seriesAt`) шинэ — цуваа хөндөгдөхгүй');
  ok(diffRows(imgX0, xRows, 'plan', pb, { clearAt: NOW - 100, me: 'a', now: NOW }).some((o) => o.k.startsWith('m:')), 'бичигч шинэ — цуваа бичигдэнэ');
  console.log('✅ 13. Хянагчийн олдвор — баримт · oid дахин ашиглалт · зөөлтийн tombstone · блокийн нэр · бүлгээр хоосолох · цуваа');
}

/* ══════════ 14. Тулгалт/Phase B — ШИЛЖСЭН илгээлтийн толгой (2026-10-26) ══════════ */
{
  const f = fresh();
  f.seed({ dkey: 'b1_9f', usr: 'a', pkg: 'b1_9f', at: 1, payload: '{}' });
  f.seed({ dkey: 'sub|b1_9f|x', usr: 'a', pkg: 'b1_9f', at: 2, payload: '{}' });
  f.seed({ dkey: 'done|b1_9f|y', usr: 'a', pkg: 'b1_9f', at: 3, payload: '{}', mur_turul: 'tolgoi', noorog_turul: 'ilgeelt', mur_key: 'h' });
  f.seed({ dkey: 'n:sub:9', usr: 'a', pkg: 'b1_9f', at: 4, mur_turul: 'tolgoi', noorog_turul: 'ilgeelt', mur_key: 'h' });
  f.seed({ dkey: 'n:b1_9f', usr: 'a', pkg: 'b1_9f', at: 5, mur_turul: 'tolgoi', noorog_turul: 'guitsetgel', mur_key: 'h' });
  const got = (await legacyAndSubHeads(URL, ['objectid', COL.dkey, COL.at])).map((a) => a[COL.dkey]).sort();
  eq(got, ['b1_9f', 'done|b1_9f|y', 'sub|b1_9f|x'], 'хуучин JSON + шилжээгүй + ШИЛЖСЭН илгээлтийн толгой; үе (`n:sub:`) · мөрийн толгой орохгүй');
  ok(f.queries.every((w) => !/payload/.test(w)), 'where-д payload алга');
  console.log('✅ 14. Тулгалт/Phase B — шилжсэн илгээлтийн толгойг хамарна');
}

/* ══════════ 15. Хуваарийн бичилтийн хувилбарын тулгалт (`expectAt`, 2026-10-26) ══════════ */
{
  const f = fresh();
  const A = new Map(); const B = new Map();
  const key = hdKey('plan', 'b41_9f');
  const ctx = { n: 1, rows: new Map([[101, { spans: [null], ham: null, aStart: [], aEnd: [], hun: null, mashin: null, des: 12, no: '1.1', work: 'Ухалт' }]]), bld: [''] };
  const hd = (entries) => ({ t: NOW, kind: 'plan', pkg: 'b41_9f', by: { user: 'x', at: NOW }, base: { at: 1, n: 1 }, entries: new Map(entries), del: new Map() });
  asClient(A, 'a');
  ok((await planSave(key, hd([[kS(101, 0), { val: { start: 1 * D, end: 2 * D }, at: NOW + 1, user: 'a' }]]), { ctx })).ok, 'A анх бичнэ');
  const ra = await planRead(key, { bld: ctx.bld });
  ok(ra.ok && ra.at != null, 'A уншина (хувилбартай)');
  f.clock += 5_000;
  asClient(B, 'b');
  const rb = await planRead(key, { bld: ctx.bld });
  ok((await planSave(key, merge(rb.draft, hd([[kS(101, 0), { val: { start: 5 * D, end: 6 * D }, at: NOW + 9, user: 'b' }]])), { ctx, expectAt: rb.at })).ok, 'B шинэ утга бичнэ');
  asClient(A, 'a');
  const n0 = f.edits.length;
  const s = await planSave(key, hd([]), { ctx, expectAt: ra.at });
  ok(!s.ok && s.conflict && f.edits.length === n0, 'A-ийн хуучин хувилбартай бичилт — conflict, юу ч бичигдэхгүй');
  const rc = await planRead(key, { bld: ctx.bld });
  ok(rc.ok && rc.draft.entries.get(kS(101, 0))?.val.start === 5 * D, 'B-ийн шинэ утга хэвээр');
  ok((await planSave(key, rc.draft, { ctx, expectAt: rc.at })).ok, 'шинэ хувилбараар — бичнэ');
  console.log('✅ 15. Хуваарийн бичилт — хувилбарын тулгалт (expectAt)');
}

/* ══════════ 16. Толгойн `tseverlesen_at` ухрахгүй (2026-10-26) ══════════ */
{
  const f = fresh();
  const A = new Map(); const B = new Map();
  const key = hdKey('plan', 'b42_9f');
  const ctx = { n: 1, rows: new Map([[101, { spans: [null], ham: null, aStart: [], aEnd: [], hun: null, mashin: null, des: 12, no: '1.1', work: 'Ухалт' }]]), bld: [''] };
  const hd = (entries, extra = {}) => ({ t: NOW, kind: 'plan', pkg: 'b42_9f', by: { user: 'x', at: NOW }, base: { at: 1, n: 1 }, entries: new Map(entries), del: new Map(), ...extra });
  asClient(A, 'a');
  ok((await planSave(key, hd([[kH(101), { val: '1FS', at: NOW + 1, user: 'a' }]]), { ctx })).ok, 'A анх бичнэ');
  asClient(B, 'b');
  await planRead(key, { bld: ctx.bld });
  const T = NOW + 50;
  ok((await planSave(key, hd([], { cleared: T, t: T }), { ctx })).ok, 'B илгээж цэвэрлэнэ (tseverlesen_at = T)');
  asClient(A, 'a');
  ok((await planSave(key, hd([[kH(101), { val: '2FS', at: NOW + 60, user: 'a' }]], { t: NOW + 60 }), { ctx })).ok, 'A уншилтгүй бичнэ (хуучин зураг, cleared алга)');
  const hRow = f.all().find((a) => a.dkey === planDkey('plan', 'b42_9f') && a.mur_key === 'h');
  ok(hRow?.[COL.cleared] === T, `tseverlesen_at ухарсангүй (${hRow?.[COL.cleared]})`);
  console.log('✅ 16. Толгойн tseverlesen_at — зөвхөн урагшилна');
}

console.log(`draftRows.check.mjs — БҮГД ТЭНЦЛЭЭ (${checks} шалгалт)`);
