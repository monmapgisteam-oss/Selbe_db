/**
 * ХУВААРИЙН ШИНЖИЛГЭЭ — цэвэр функцийн шалгуур, сүлжээгүй.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/planAnalysis.check.mjs
 */
import assert from 'node:assert/strict';
import { criticalFloat, baselineDelays, planIssues, sumResByMonth, sameShapeGroups } from './planAnalysis.ts';

const d = (n) => Date.UTC(2026, 9, n);
const sp = (a, b) => ({ start: d(a), end: d(b) });
const row = (i, des, deps, s, extra = {}) => ({
  i, oid: i + 1, no: String(i), des, deps, work: `w${i}`, depth: 1, group: false, vol: null, spans: [s], ...extra,
});
const G = (i, work = 'G') => ({ i, oid: 100 + i, no: 'G', des: null, deps: [], work, depth: 0, group: true, vol: null, spans: [null] });

/* ── Эгзэгтэй зам: A → B (FS) эгзэгтэй, C нь 5 хоногийн нөөцтэй ── */
{
  const rows = [
    G(0),
    row(1, 1, [], sp(1, 10)),
    row(2, 2, [{ code: 1, type: 'FS', lag: 0 }], sp(11, 20)),
    row(3, 3, [], sp(1, 15)),
  ];
  const f = criticalFloat(rows, 0);
  assert.equal(f.get(1), 0, 'A эгзэгтэй');
  assert.equal(f.get(2), 0, 'B эгзэгтэй (төслийн төгсгөл)');
  assert.equal(f.get(3), 5, 'C 5 хоногийн нөөцтэй');
  /* B 3 хоногийн зайтай бол A 3 хоногийн нөөцтэй */
  const gap = criticalFloat([G(0), row(1, 1, [], sp(1, 10)), row(2, 2, [{ code: 1, type: 'FS', lag: 0 }], sp(14, 23))], 0);
  assert.equal(gap.get(1), 3, 'A-гийн нөөц = B хүртэлх зай');
  assert.equal(gap.get(2), 0);
}

/* ── Батлагдсантай харьцуулах ── */
{
  const base = [G(0), row(1, 1, [], sp(1, 10)), row(2, 2, [], sp(5, 8)), row(3, 3, [], null)];
  const now = [G(0), row(1, 1, [], sp(3, 14)), row(2, 2, [], sp(5, 8)), row(3, 3, [], sp(1, 2))];
  const ds = baselineDelays(base, now, 0);
  assert.equal(ds.length, 2, 'өөрчлөгдөөгүй мөр ороогүй');
  assert.deepEqual([ds[0].start, ds[0].end], [2, 4], 'эхлэх +2, дуусах +4');
  assert.equal(ds[1].end, null, 'шинээр төлөвлөсөн — зөрүү null');
}

/* ── Асуудлын жагсаалт ── */
{
  const rows = [
    G(0),
    row(1, 1, [], sp(1, 10)),
    row(2, 2, [{ code: 1, type: 'FS', lag: 0 }], sp(8, 12)),
    row(3, 3, [], null, { vol: 5 }),
    row(4, 4, [], sp(1, 31)),
  ];
  const is = planIssues(rows, 0, { unbal: new Map([[2, [0]]]), geree: (i) => (i === 4 ? sp(1, 20) : null) });
  const k = is.map((x) => `${x.kind}:${x.i}${x.days != null ? `:${x.days}` : ''}`);
  assert.deepEqual(k, ['unbal:1', 'dep:2:3', 'nodate:3', 'geree:4:11'], `асуудлууд: ${k.join(' ')}`);
}

/* ── Нөөцийн нийлбэр ── */
{
  const s = sumResByMonth([
    new Map([['2026-11', { hun: 3, mashin: null }], ['2026-10', { hun: 2, mashin: 1 }]]),
    new Map([['2026-10', { hun: 5, mashin: 2 }], ['2026-12', { hun: null, mashin: null }]]),
  ]);
  assert.deepEqual([...s], [['2026-10', { hun: 7, mashin: 3 }], ['2026-11', { hun: 3, mashin: 0 }]], 'сараар эрэмбэлж нийлүүлнэ, хоосон сар алга');
}

/* ── Ижил бүтэцтэй бүлгүүд ── */
{
  const rows = [G(0, 'Давхар 1'), { ...row(1, 1, [], null), work: 'Арматур' }, { ...row(2, 2, [], null), work: 'Цутгалт' },
    G(3, 'Давхар 2'), { ...row(4, 4, [], null), work: 'арматур ' }, { ...row(5, 5, [], null), work: 'Цутгалт' },
    G(6, 'Өөр'), { ...row(7, 7, [], null), work: 'Хэв' }];
  const works = (i) => { const out = []; for (let k = i + 1; k < rows.length && !rows[k].group; k++) out.push(k); return out; };
  assert.deepEqual(sameShapeGroups(rows, 0, works), [3], 'ижил нэрийн дараалалтай бүлэг л');
}

/* ── Регресс (2026-10-29 хяналт): бүлэгт заасан уялдаа ба блок хоорондын уялдаа ── */
{
  const grp = (i, des, deps) => ({ i, oid: 200 + i, no: 'g', des, deps, work: 'g' + i, depth: 0, group: true, vol: null, spans: [null] });
  const leaf = (i, des, s) => ({ i, oid: i + 1, no: String(i), des, deps: [], work: 'w' + i, depth: 1, group: false, vol: null, spans: [s] });
  /* G1 (A 1–10, B 1–5) → G2 (C 11–20): бүлгийн FS — A эгзэгтэй, B нөөцтэй (5) */
  const rows = [grp(0, 90, []), leaf(1, 1, sp(1, 10)), leaf(2, 2, sp(1, 5)), grp(3, 91, [{ code: 90, type: 'FS', lag: 0 }]), leaf(4, 4, sp(11, 20))];
  const f = criticalFloat(rows, 0);
  assert.equal(f.get(1), 0, 'бүлгийн уялдаагаар A эгзэгтэй');
  assert.equal(f.get(2), 5, 'B 5 хоногийн нөөцтэй');
  assert.equal(f.get(4), 0, 'C эгзэгтэй');
  /* Блок хоорондын уялдаа (өөр блокийн урд ажил) энэ блокийн сүлжээнд тооцогдохгүй */
  const xb = [G(0), row(1, 1, [], sp(1, 10)), row(2, 2, [{ code: 1, type: 'FS', lag: 0, blk: 0, src: 1 }], sp(20, 25))];
  assert.equal(criticalFloat(xb, 0).get(1), 15, 'блок хоорондын уялдаа A-г эгзэгтэй болгохгүй');
}
/* ── Регресс: бүлэг хойдохын хамгийн бага нөөц (бүлэг бүхэлдээ шилждэг) ── */
{
  const grp = (i, des, deps) => ({ i, oid: 300 + i, no: "g", des, deps, work: "g" + i, depth: 0, group: true, vol: null, spans: [null] });
  const leaf = (i, des, s) => ({ i, oid: i + 1, no: String(i), des, deps: [], work: "w" + i, depth: 1, group: false, vol: null, spans: [s] });
  /* P 1–5 → G (A 6–7 нөөц ихтэй, B 15–30 нөөцгүй): P-ийн нөөц 0 — аливаа хоцрол B-г, төслийг хойшлуулна */
  const rows = [leaf(0, 1, sp(1, 5)), grp(1, 50, [{ code: 1, type: "FS", lag: 0 }]), leaf(2, 2, sp(6, 7)), leaf(3, 3, sp(15, 30))];
  rows[0].depth = 0;
  const f = criticalFloat(rows, 0);
  assert.equal(f.get(3), 0, "B эгзэгтэй");
  assert.equal(f.get(0), 0, "P эгзэгтэй — хоцорвол бүлэг бүхэлдээ (B ч) шилжинэ; хуучин тооцоо 9 хоногийн худал нөөц өгдөг байв");
  assert.ok(f.get(2) > 0, "A нөөцтэй");
}
console.log('planAnalysis.check: ok');
