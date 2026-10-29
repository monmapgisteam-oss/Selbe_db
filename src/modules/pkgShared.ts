/**
 * «Багцын гүйцэтгэл» (PkgProg) ба «Багцын санхүү» (PkgFin) хоёрын НИЙТЛЭГ
 * цэвэр логик — ГАНЦ эх сурвалж.
 */
import { LAYER_BY_ID, PKG_FAMILY_BY_BAGTS } from '@/lib/services';
import { BLOCK_LAYER, type Pack } from '@/modules/Bagts';
import type { ProgPt } from '@/modules/PkgProg';
import { planPctAt, measureDayOf, type PlanPoint } from '@/lib/planProgress';
import { dayKey, num } from '@/lib/format';

/**
 * «ГҮЙЦЭТГЭЛИЙН ЯВЦ» ГРАФИКИЙН ЦЭГҮҮД — хуваарийн төлөвлөгөө (`PlanCurve`) + БИЕТ
 * гүйцэтгэл (`FinData.phys` → `MonthPt`). PkgProg ба «ТУХ» ХОЁУЛАА энэ ГАНЦ
 * функцээр (2026-09-30) — хоёр дэлгэц нэг багцад өөр муруй харуулахгүй.
 */
export function progMonthsOf(
  base: readonly { label: string; phys: number | null; physAt?: string | null }[] | null,
  series: readonly PlanPoint[] | undefined,
): ProgPt[] | null {
  if (!series?.length) return null;
  const phys = new Map((base ?? []).map((m) => [m.label, m]));
  const today = dayKey(Date.now());
  return series.map((p) => {
    const m = phys.get(p.label);
    const act = m?.phys ?? null;
    return {
      label: p.label,
      plan: p.pct,
      vol: p.vol,
      act,
      planM: act == null ? null : planPctAt(series, measureDayOf(p.label, m?.physAt, today)),
    };
  });
}

/** Блокийн давхаргын өнгө — хоёр харагдацын карт/легенд ижил өнгөтэй байна */
export const HUE = LAYER_BY_ID[BLOCK_LAYER].hue;

/**
 * БАГЦЫН АНГИЛАЛ (2026-08-21, хэрэглэгчийн хүсэлт) — жагсаалт, «Төслийн
 * төрөл» chart, «Блокийн төлөв»-ийн асуудалтай талбарын тоолол гурвуулаа
 * ЭНЭ нэг ангиллыг хэрэглэнэ. Блоктой багц = барилга угсралт; бусад нь
 * PKG_TABLE-ийн гэр бүлээс: soc = нийгмийн барилга, site = өндөржилт,
 * үлдсэн (net/pow/src/com) = дэд бүтэц.
 */
export type PackCat = 'build' | 'infra' | 'soc' | 'site';
export const catOf = (p: Pack): PackCat => {
  if (p.kind === 'build') return 'build';
  const fam = PKG_FAMILY_BY_BAGTS[p.key];
  return fam === 'soc' ? 'soc' : fam === 'site' ? 'site' : 'infra';
};

/**
 * ТӨСЛИЙН НЭГДСЭН сарын цэгүүд (`aggregateMonths`) ба биет гүйцэтгэл «ОДОО» (`physNow`).
 */
export { aggregateMonths, physNow } from '@/modules/Finance';

/**
 * ХУВИЙН НЭГЖИЙН ЗӨРҮҮ (pp) — «бодит − төлөвлөгөө»; сөрөг = хоцорсон («-5.0 pp»).
 */
export const pp = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${num(v, 1)} pp`;

/**
 * Дэлгэц уншигчид л харагдах (нүдэнд нуугдсан) хэв — графикийн `aria-live` уншилтад.
 */
export const SR_ONLY = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const;
