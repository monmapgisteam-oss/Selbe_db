/**
 * ХОЖУУ ЖААЗНУУДЫН ХАДГАЛСАН ХУВИЙГ ШИНЭЧЛЭХ (2026-11-11, хэрэглэгч: «анх бөглөснөөр бичих нь зөв»).
 *
 * Буцаагдаад хожим батлагдсан бөглөлт одоо БӨГЛӨСӨН өдрөөрөө архивлагдана (`hyanaltStore.archiveSubmission`). Тэр жаазны
 * дараах огноотой жаазнууд аль хэдийн байгаа тул тэдгээрийн мөрд хадгалсан ХУРИМТЛАГДСАН гүйцэтгэлийн хувь (блок бүрийн
 * `…_гүйцэтгэл`, мөрийн `гүйцэтгэл`, «одоо байгаа») шинэ ажлыг агуулаагүй үлдэнэ — газрын зураг, явцын тооцоо хамгийн сүүлийн
 * огнооны хадгалсан хувийг уншдаг (`blockProgress.winnerCells`). Энд `fromDay`-ээс хойших (өөрийг нь оруулаад) жааз бүрийг
 * хуримтлалаар нь дахин бодож, зөрсөн хувийг бичнэ. Обьём, огноо, төлөвлөгөөт хувийг хөндөхгүй.
 */
import { agsFetch } from '@/modules/sheet/ags';
import type { Pkg, Schema } from '@/modules/sheet/bagts.pkg';
import { applyUpdates, computeAll, loadRows, msToDay } from '@/modules/sheet/bagtsSheet';
import { invalidate } from '@/lib/dataBus';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const off = (a: number | null, b: number | null): boolean => (a == null || b == null ? a !== b : Math.abs(a - b) > 1e-9);

/** `fromDay` (YYYY-MM-DD)-ээс хойших жаазны өдрүүд, өсөх дарааллаар */
async function frameDaysFrom(pkg: Pkg, sc: Schema, fromDay: string): Promise<string[]> {
  const fd = sc.f.fillDate;
  if (!fd) return [];
  const j = await agsFetch(`${pkg.url}/query`, {
    where: `${fd} >= timestamp '${fromDay} 00:00:00'`,
    groupByFieldsForStatistics: fd,
    outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: fd, outStatisticFieldName: 'n' }]),
    returnGeometry: 'false',
  });
  const days = new Set<string>();
  for (const f of ((j?.features ?? []) as { attributes: Record<string, unknown> }[])) {
    const d = msToDay(num(f.attributes[fd]));
    if (d && d >= fromDay) days.add(d);
  }
  return [...days].sort();
}

/** @returns шинэчилсэн мөрийн тоо */
export async function refreshStoredProgress(pkg: Pkg, sc: Schema, fromDay: string): Promise<number> {
  let n = 0;
  for (const day of await frameDaysFrom(pkg, sc, fromDay)) {
    const { rows, asOf } = await loadRows(pkg, sc, day, undefined, { strict: true });
    if (!rows.length || msToDay(num(rows[0].raw?.[sc.f.fillDate ?? ''])) !== day) continue;
    const c = computeAll(rows, sc.bld.length, asOf, {}, {}, sc.obyem.map((f) => !!f), undefined, 'abs', sc.synthetic);
    const updates: Record<string, unknown>[] = [];
    rows.forEach((r, i) => {
      const u: Record<string, unknown> = {};
      sc.act.forEach((f, b) => {
        if (!f) return;
        const want = c[i].actAgg[b] ?? null;
        if (want != null && off(num(r.raw?.[f]), want)) u[f] = want;
      });
      if (sc.f.act && c[i].J != null && off(num(r.raw?.[sc.f.act]), c[i].J)) u[sc.f.act] = c[i].J;
      if (sc.f.wE && c[i].E != null && off(num(r.raw?.[sc.f.wE]), c[i].E)) u[sc.f.wE] = c[i].E;
      if (Object.keys(u).length) updates.push({ [sc.f.oid]: r.oid, ...u });
    });
    if (updates.length) { await applyUpdates(pkg, updates); n += updates.length; }
  }
  if (n) invalidate('BAGTS_SHEET');
  return n;
}
