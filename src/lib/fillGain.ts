/**
 * ГҮЙЦЭТГЭЛИЙН ӨСӨЛТ — нэг бөглөлт блок · багц · төсөлд хэдэн хувь нэмж байгаа вэ (2026-11-11, хэрэглэгч:
 * «баталж байгаа гүйцэтгэл хэдэн хувийн ажил хардаг болгох»). Хянагчийн «Гүйцэтгэлийн хяналт» дэлгэцэнд.
 *
 *   · блок  — «Б.» мөрийн гүйцэтгэлийн өсөлт (0–1 → нэгж хувь);
 *   · багц  — блокийн төсвийн жингээр (`blockProgress.pkgProgressOf`-тэй НЭГ жин: мэдэгдээгүй жин = мэдэгдсэний дундаж);
 *             блокгүй (синтетик) хуудас — ганц блокийн өсөлт;
 *   · төсөл — «Төсөл төлөвлөгөө биелэлт»-ийн блок/багцын мөрийн G (төсөлд эзлэх) × өсөлт; «А. Бэлтгэл ажил»-ын өсөлт
 *             бэлтгэлийн блокийн мөрийн G-ээр нэмэгдэнэ.
 */
import { bagtsKey, blockKey, buildingKey } from '@/lib/services';

export type FillGain = {
  /** «Б.» мөрийн өсөлт блок бүрээр, нэгж хувь (0–100) — өөрчлөгдсөн блок л */
  blocks: { block: string; pct: number }[];
  /** Багцын барилга угсралтын гүйцэтгэлийн өсөлт, нэгж хувь; тооцогдоогүй бол null */
  pkg: number | null;
  /** Төслийн нийт гүйцэтгэлийн өсөлт, нэгж хувь; тооцогдоогүй бол null */
  project: number | null;
};

type Node = { pkg: string | null; blok: string | null; phase: string; sub: string | null; children: readonly unknown[] };

/**
 * ЦЭВЭР тооцоо (тестлэгдэнэ).
 * @param group   `Pkg.group` («Багц 2»)
 * @param labels  блокийн шошго `deltaB`/`deltaA`-ийн индексээр
 * @param deltaB  «Б.» мөрийн өсөлт 0–1 (null = мэдээлэлгүй)
 * @param deltaA  «А.» мөрийн өсөлт 0–1
 * @param synthetic блокгүй хуудас
 * @param universe багц → блокийн түлхүүрүүд (`loadBlockUniverse`); `null` = мэдэгдэхгүй
 * @param weights блокийн төсөв (`loadBlockWeights`)
 * @param plan    ТТБ-ийн мөрүүд ба G (0–100); `null` = төслийн өсөлт тооцохгүй
 */
export function fillGainOf(
  group: string,
  labels: readonly string[],
  deltaB: readonly (number | null)[],
  deltaA: readonly (number | null)[],
  synthetic: boolean,
  universe: ReadonlyMap<string, readonly string[]> | null,
  weights: ReadonlyMap<string, number> | null,
  plan: { nodes: readonly Node[]; gOf: (n: Node) => number | null } | null,
): FillGain {
  const pk = bagtsKey(group);
  const blocks: FillGain['blocks'] = [];
  labels.forEach((b, i) => {
    const d = deltaB[i];
    if (d != null && Math.abs(d) > 1e-9) blocks.push({ block: b, pct: d * 100 });
  });

  /* Багц */
  let pkg: number | null = null;
  if (synthetic) pkg = deltaB[0] != null ? deltaB[0]! * 100 : null;
  else if (universe) {
    const keys = new Set(universe.get(pk) ?? []);
    labels.forEach((b) => keys.add(buildingKey(group, b)));
    let known = 0, kn = 0;
    if (weights) for (const k of keys) { const w = weights.get(k); if (w != null && w > 0) { known += w; kn += 1; } }
    const fill = kn ? known / kn : 1;
    const wOf = (k: string) => (weights && kn ? weights.get(k) : null) ?? fill;
    let wsum = 0;
    for (const k of keys) wsum += wOf(k);
    let s = 0;
    labels.forEach((b, i) => { const d = deltaB[i]; if (d != null) s += wOf(buildingKey(group, b)) * d; });
    pkg = wsum > 0 ? (s / wsum) * 100 : null;
  }

  /* Төсөл */
  let project: number | null = null;
  if (plan) {
    const leaves = plan.nodes.filter((n) => !n.children.length && n.phase === 'barilga' && bagtsKey(n.pkg) === pk);
    let s = 0, any = false;
    const add = (n: Node | undefined, d: number | null) => {
      if (!n || d == null) return;
      const g = plan.gOf(n);
      if (g == null) return;
      s += g * d; any = true;
    };
    if (synthetic) {
      for (const n of leaves) if (n.sub === 'barilga' && !n.blok) add(n, deltaB[0] ?? null);
    } else {
      labels.forEach((b, i) => {
        const bk = blockKey(b);
        add(leaves.find((n) => n.sub === 'barilga' && n.blok != null && blockKey(n.blok) === bk), deltaB[i] ?? null);
        add(leaves.find((n) => n.sub === 'beltgel' && n.blok != null && blockKey(n.blok) === bk), deltaA[i] ?? null);
      });
    }
    project = any ? s : null;
  }
  return { blocks, pkg, project };
}

/** Хянагчийн уншилтаас ирэх оролт (`hyanaltDetail.Submission.gain`) */
export type FillGainIn = { group: string; labels: readonly string[]; dB: readonly (number | null)[]; dA: readonly (number | null)[]; synthetic: boolean };

/** Сүлжээний тал — жин, хуваарь, ТТБ-ийг ачаалж `fillGainOf`. Унасан эх нь зөвхөн тэр түвшинг хоосон үлдээнэ. */
export async function loadFillGain(
  group: string,
  labels: readonly string[],
  deltaB: readonly (number | null)[],
  deltaA: readonly (number | null)[],
  synthetic: boolean,
): Promise<FillGain> {
  const [{ loadBlockUniverse, loadBlockWeights }, { loadProjectPlan }] = await Promise.all([
    import('@/lib/blockProgress'), import('@/lib/projectPlanInputs'),
  ]);
  const [u, w, p] = await Promise.allSettled([loadBlockUniverse(), loadBlockWeights(), loadProjectPlan()]);
  const plan = p.status === 'fulfilled' && !p.value.empty
    ? { nodes: p.value.tree.nodes, gOf: (n: Node) => p.value.result.values.get(n as never)?.G ?? null }
    : null;
  return fillGainOf(group, labels, deltaB, deltaA, synthetic,
    u.status === 'fulfilled' ? u.value : null, w.status === 'fulfilled' ? w.value : null, plan);
}
