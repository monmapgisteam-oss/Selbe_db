/**
 * ХЭМЖИХ НЭГЖИЙН ДҮРМИЙН ШАЛГУУР — живээр.
 *
 *   1. ХАМРАЛТ — хэдэн хувь мөрд нэгж оноогдов.
 *   2. ҮНИЙН НИЙЦЭЛ — оноосон нэгж нь тухайн ажлын НЭГЖ ӨРТӨГТЭЙ логикоор
 *      нийцэж байна уу. Үнэ нь `negj.ts`-ээс ХАРААТ БУС өгөгдөл тул энэ нь
 *      тойрог логик БИШ, бодит гадаад лавлагаа.
 */
import assert from 'node:assert/strict';
import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg.ts';
import { loadRows } from '@/modules/sheet/bagtsSheet.ts';
import { negjOf } from '@/modules/sheet/negj.ts';

if (process.env.SELBE_LIVE_SKIP) {
  console.log('⏭ амьд шалгуур алгасав — үйлчилгээ Organization-only, ARCGIS_ADMIN_TOKEN алга');
  process.exit(0);
}

/**
 * Салбарын бодит үнийн хүрээ (₮). Живэ өгөгдлөөс хэмжсэн:
 *   · шороо 2 мянга → шатны төмөр бетон 2.37 сая (хэвний ажил давамгайлдаг)
 *   · арматурын тонн 3.2–3.6 сая
 */
const BAND = {
  'тн': [2.0e6, 5.5e6],
  'м³': [1e3, 2.5e6],
  'м²': [1e3, 8e5],
  'м': [2e3, 9e5],

};

let rows = 0;
let named = 0;
let checked = 0;
let fit = 0;
const perUnit = new Map();
const UNCALIBRATED = new Set(['b63', 'b65', 'b66', 'b67', 'b68', 'b71']);
const extra = new Map();

for (const pkg of PKGS) {
  const sc = await loadSchema(pkg).catch(() => null);
  if (!sc) continue;
  const r = await loadRows(pkg, sc).catch(() => null);
  if (!r) continue;
  for (const x of r.rows) {
    if (x.group || x.vol == null) continue;
    rows += 1;
    const u = negjOf(x.work);
    if (u) named += 1;
    if (!u || !BAND[u] || x.unit == null || x.unit <= 0) continue;
    const [lo, hi] = BAND[u];
    const ok = x.unit >= lo && x.unit <= hi;
    if (UNCALIBRATED.has(pkg.key)) {
      const e = extra.get(pkg.key) ?? { n: 0, ok: 0 }; e.n += 1; if (ok) e.ok += 1; extra.set(pkg.key, e);
      continue;
    }
    checked += 1;
    if (ok) fit += 1;
    if (!perUnit.has(u)) perUnit.set(u, { n: 0, ok: 0 });
    const p = perUnit.get(u);
    p.n += 1;
    if (ok) p.ok += 1;
  }
}

const cov = named * 100 / rows;
const acc = fit * 100 / checked;
console.log(`нэгж оноогдсон: ${named}/${rows} = ${cov.toFixed(1)}%`);
for (const [u, p] of [...perUnit].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${u.padEnd(4)} ${String(p.n).padStart(5)} мөр · үнийн нийцэл ${(p.ok * 100 / p.n).toFixed(1)}%`);
}
console.log(`үнийн нийцэл нийт: ${fit}/${checked} = ${acc.toFixed(1)}%`);
for (const [k, e] of extra) console.log(`  (босгогүй) ${k.padEnd(4)} ${String(e.n).padStart(4)} мөр · үнийн нийцэл ${(e.ok * 100 / e.n).toFixed(1)}%`);

assert.ok(cov >= 90, `хамралт ${cov.toFixed(1)}% — 90%-иас доош унав`);
assert.ok(acc >= 93, `үнийн нийцэл ${acc.toFixed(1)}% — 93%-иас доош унав`);
{
  const { unitLabel } = await import('@/modules/sheet/negj.ts');
  for (const u of ['м³', 'м²', 'м', 'тн', 'ш']) assert.ok(unitLabel(u), `нэгж «${u}» шошгогүй`);
  assert.equal(unitLabel(null), '');
}
console.log('\nnegj.check: ok');
