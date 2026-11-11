/**
 * ЗУРАГ ТӨСЛИЙН БҮРТГЭЛ (2026-11-11) — цэвэр хэсэг.
 *   node --experimental-transform-types --import ./tools/ts-alias.mjs src/lib/zuragBurtgel.check.mjs
 *
 * Хамгаалж буй алдаанууд:
 *   1. «Багц 1,2» олон багцад, «Багц 3-1» → БАГЦ31; «Бүх багц»/«Байхгүй» → багцгүй.
 *   2. Дэд бүлгийн «… БАГЦ 3-2» багцын баганаас түрүүлнэ (Excel-д «Багц 3-1» гэж буруу бичигдсэн 12 мөр).
 *   3. Төсөв (005) явцад орохгүй; явц = магадлалд орсон (давтан ч) ÷ нийт.
 *   4. ТТБ: зураг төслийн навч бүртгэлтэй багцад бүртгэлийн хувь, бусад нь хадгалсан утга.
 */
import assert from 'node:assert/strict';
import { toZRow, groupZ, pkgKeysOf, zuragPkgStats, zuragPctMap } from './zuragBurtgel.ts';
import { buildTree, computePlan } from './projectPlan.ts';

assert.deepEqual(pkgKeysOf('Багц 1,2'), ['БАГЦ1', 'БАГЦ2']);
assert.deepEqual(pkgKeysOf('Багц 3-1'), ['БАГЦ31']);
assert.deepEqual(pkgKeysOf('300.40. БАГЦ 3-2'), ['БАГЦ32']);
assert.deepEqual(pkgKeysOf('Бүх багц'), []);
assert.deepEqual(pkgKeysOf('100. БАГЦУУДЫН ЗАГВАР ЗУРАГ'), []);

const D = (s) => Date.parse(`${s}T00:00:00Z`);
const z = (o) => toZRow({ objectid: o.oid, buleg: o.buleg ?? '003. АЖЛЫН ЗУРАГ', ded_buleg: o.ded ?? '', bagts: o.bagts, ner: `n${o.oid}`, magadlal_ognoo: o.mag ?? null, davtan_magadlal_ognoo: o.dav ?? null, huleej_avsan_ognoo: o.rec ?? null, pdf_item_id: o.pdf ?? null });
const rows = [
  z({ oid: 1, bagts: 'Багц 1,2', mag: D('2025-10-17') }),
  z({ oid: 2, bagts: 'Багц 1', ded: '300.10. БАГЦ 1' }),
  z({ oid: 3, bagts: 'Багц 3-1', ded: '300.40. БАГЦ 3-2', dav: D('2026-02-03') }),
  z({ oid: 4, bagts: 'Багц 1', buleg: '005. ТӨСӨВ', mag: D('2026-10-08') }),
  z({ oid: 5, bagts: 'Багц 2', rec: D('2026-05-11'), pdf: 'abc' }),
];
const st = zuragPkgStats(rows);
assert.deepEqual(st.get('БАГЦ1'), { total: 2, magadlal: 1, received: 0, pdf: 0 }, 'төсөв орохгүй; «Багц 1,2» тоологдоно');
assert.deepEqual(st.get('БАГЦ2'), { total: 2, magadlal: 1, received: 1, pdf: 1 });
assert.deepEqual(st.get('БАГЦ32'), { total: 1, magadlal: 1, received: 0, pdf: 0 }, 'дэд бүлгийн багц түрүүлнэ; давтан магадлал тоологдоно');
assert.ok(!st.has('БАГЦ31'));
const pm = zuragPctMap(rows);
assert.equal(pm.get('БАГЦ1'), 50);
assert.deepEqual(groupZ(rows).map((g) => g.buleg), ['003. АЖЛЫН ЗУРАГ', '005. ТӨСӨВ']);

const t = buildTree([
  { objectid: 1, dd_kod: '2', ajil_uilchilgee: 'Ажлын зураг төсөл', uy_shat: 'Ажлын зураг төсөл' },
  { objectid: 2, dd_kod: '2.1', etseg_kod: '2', bagts: 'Багц-1', ajil_uilchilgee: 'a', heseg_ezleh_huvi: 0.5, guitsetgel_huvi: 100 },
  { objectid: 3, dd_kod: '2.2', etseg_kod: '2', bagts: 'БАГЦ-16.1', ajil_uilchilgee: 'b', heseg_ezleh_huvi: 0.5, guitsetgel_huvi: 100 },
]);
const r = computePlan(t, { zuragActual: (pkg) => pm.get(String(pkg ?? '').toUpperCase().replace(/[^0-9А-ЯӨҮA-Z]/g, '')) });
assert.equal(r.get('2.1').S, 50, 'бүртгэлтэй багц — бүртгэлийн хувь');
assert.equal(r.get('2.2').S, 100, 'бүртгэлгүй — хадгалсан');
console.log('zuragBurtgel.check: бүгд ✅');
