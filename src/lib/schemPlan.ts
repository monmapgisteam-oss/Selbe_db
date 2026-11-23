/**
 * СХЕМИЙН ҮЕ ШАТНЫ ЯВЦ — «Төсөл төлөвлөгөө биелэлт»-ийн тооцооноос (2026-11-23, хэрэглэгч: «үйл ажиллагааны схем бүрэн сайжруул»).
 *
 * Схемийн карт бүрийн «Төлөвлөгөөт» (P) ба «Гүйцэтгэл» (S) хувь НЭГ эхээс — `loadProjectPlan`-ийн `computePlan`.
 * Тиймээс схемийн тоо «Төсөл төлөвлөгөө биелэлт» хуудасны үе шатны мөрийн тоотой яг ижил байна.
 */

import type { PhaseKind, PlanNode } from '@/lib/projectPlan';
import type { ProjectPlan } from '@/lib/projectPlanInputs';
import { pkgKeyOf } from '@/lib/services';

/** Нэг үе шатны утга — хувь 0–100, төсөв ₮; хэмжилтгүй бол `null` (0 БИШ) */
export type PhaseVal = { P: number | null; S: number | null; E: number | null };

/** Схемд хэрэглэх үе шатууд — «Төсөл төлөвлөгөө биелэлт»-ийн 1-р түвшний мөрүүд */
export const PLAN_PHASES = [
  'tezu', 'zurag', 'gazar', 'zovshoorol', 'songon', 'barilga', 'huleelgeh', 'zugshruulelt',
] as const satisfies readonly PhaseKind[];
export type PlanPhase = (typeof PLAN_PHASES)[number];

export type PlanLive = {
  /** Төслийн нийт — үе шатны 1-р түвшний мөр */
  phases: Partial<Record<PlanPhase, PhaseVal>>;
  /** `pkgKeyOf` → тухайн багцын тэр үе шатны ХАМГИЙН ДЭЭД мөр */
  byPkg: Record<string, Partial<Record<PlanPhase, PhaseVal>>>;
  /** Төслийн нийт мөр (үндэс) */
  total: PhaseVal;
};

/** `pkgKeyOf`-ийн багц: «БАГЦ2», «БАГЦ171», «БАГЦ6162» */
export const IS_PKG = /^БАГЦ\d/;

const val = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : v);

/** ProjectPlan → схемийн үе шатны явц (цэвэр, тестлэгдэнэ) */
export function planLiveOf(plan: ProjectPlan): PlanLive {
  const of = (n: PlanNode): PhaseVal => {
    const v = plan.result.values.get(n);
    return { P: val(v?.P), S: val(v?.S), E: val(v?.E) };
  };
  const isPhase = (k: PhaseKind): k is PlanPhase => (PLAN_PHASES as readonly PhaseKind[]).includes(k);

  const phases: PlanLive['phases'] = {};
  for (const n of plan.tree.root.children) {
    if (isPhase(n.phase) && !phases[n.phase]) phases[n.phase] = of(n);
  }

  /* Багц бүрийн тэр үе шатны ДЭЭД мөр (`liveProgressOf`-ийн дүрэм) */
  const top = new Map<string, PlanNode>();
  for (const n of plan.tree.nodes) {
    if (!isPhase(n.phase) || n.depth < 2) continue;
    /* 2026-11-24 (засвар): `bagtsKey` БИШ — «БАГЦ 1- 4» → БАГЦ14 (Багц-14), «Багц 1,2» → БАГЦ12 болж жинхэнэ багцтай
       давхцдаг байв. Олон багцын мөр (`pkgKeyOf` хоосон) аль ч багцад орохгүй */
    const pk = pkgKeyOf(n.pkg ?? '');
    /* Зөвхөн багцын дугаартай мөр — «Бүх багц», «Байхгүй», «Тухайлсан» зэрэг бичвэр багц биш */
    if (!pk || !IS_PKG.test(pk)) continue;
    const k = `${n.phase}|${pk}`;
    const cur = top.get(k);
    if (!cur || n.depth < cur.depth) top.set(k, n);
  }
  const byPkg: PlanLive['byPkg'] = {};
  for (const [k, n] of top) {
    const [ph, pk] = k.split('|') as [PlanPhase, string];
    (byPkg[pk] ??= {})[ph] = of(n);
  }
  /* Зураг төслийн багцын хувь — «Зургийн бүртгэл»-ээс (багцын мөргүй үед ч) */
  for (const [pk, s] of plan.zuragPkg ?? []) {
    const cur = (byPkg[pk] ??= {}).zurag;
    byPkg[pk].zurag = { P: cur?.P ?? null, S: val(s), E: cur?.E ?? null };
  }
  return { phases, byPkg, total: of(plan.tree.root) };
}

/**
 * Үе шатны утга — багц сонгосон бол тэр багцынх, эс бөгөөс төслийн нийт.
 * Багцад тэр үе шат байхгүй бол `null`.
 */
export function phaseOf(live: PlanLive | null | undefined, ph: PlanPhase, pkg: string | null): PhaseVal | null {
  if (!live) return null;
  if (!pkg) return live.phases[ph] ?? null;
  const k = pkgKeyOf(pkg);
  return k ? live.byPkg[k]?.[ph] ?? null : null;
}

/**
 * ХУВААРИЙН ХОЦРОЛТ → төлөв. Гүйцэтгэл төлөвлөгөөнөөс 5 нэгжээс бага хоцорсон бол хэвийн, 15 хүртэл анхаарах,
 * түүнээс их бол эрсдэлтэй. Төлөвлөгөө 0 (эхлээгүй байх ёстой) бол хоцрохгүй.
 */
export const PACE = { warn: 5, bad: 15 } as const;
export function paceHealth(v: PhaseVal | null): 'good' | 'warn' | 'bad' | 'none' {
  if (!v || v.S == null || v.P == null) return 'none';
  const lag = v.P - v.S;
  return lag < PACE.warn ? 'good' : lag < PACE.bad ? 'warn' : 'bad';
}
