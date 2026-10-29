'use client';

/**
 * НҮҮРИЙН (ExecKpi) БА ДАШБОАРДЫН ХАМТЫН ӨГӨГДЛИЙН ХЭСЭГ.
 */

import { useAsync, type Async } from './useAsync';
import { cached } from './live';
import { queryFeatures, type Row } from './query';
import { BUILDING, bagtsKey, buildingKey } from './services';
import {
  INDICATORS, SCORE_LEVELS, levelOf, PARKING, ASSUME_MET, DENSITY_BY_TYPE, ACTIVATABLE_ZONE_TYPES,
} from './analysis/config';
import { loadAnalysisCached, computeRaw, defaultGreenCats } from './analysis/data';
import { urbanScore, passesNorm, normFor, normGap, normText } from './analysis/score';
import { zoneTrips } from '@/modules/analysis/suit/simulation';
import {
  loadBlockProgress, loadBlockUniverse, pkgProgressOf, universeKeys,
  type BlockProgressMap, type BlockUniverse,
} from './blockProgress';
import { text, num } from './format';
import { BAGTS_ORIGIN } from './brief';
import { housingPct } from './gdash';
import { t as tr } from './i18nCore';

const BF = BUILDING.fields;

export type BagtsRow = {
  key: string;
  label: string;
  blocks: number;
  /** Өрхийн тоо — МЭДЭГДЭЖ буй блокуудын нийлбэр (хоосон `AIL_TOO` орохгүй — `ailMissing`) */
  ail: number;
  ailMissing?: number;
  ailBlocks?: number;
  contractor: string;
  /** Гадаад / Үндэсний — илтгэлээс бэхлэгдсэн */
  origin: string;
  /**
   * Барилга угсралтын гүйцэтгэл (%) — «Гүйцэтгэл бөглөх» хуудасны «Б.» мөрөөр.
   */
  progress: number | null;
  /**
   * Хэмжигдсэн (тайлагнасан) блокийн тоо (`blockProgress.pkgProgressOf`).
   */
  measured: number;
  /**
   * `progress`-ийн ХУВААРЬ — бөглөх хуудасны блок ∪ хэмжилт (`PkgProgress.total`).
   */
  total: number;
  /**
   * Тайлан ирээгүй блокийн тоо — `keys`-ээс хэмжилтгүй нь.
   */
  missing: number;
  /**
   * Цувааны хамрах хүрээ — багцын блок бүрийн түлхүүр (`${БАГЦ}|блок`), давхардалгүй.
   */
  keys: string[];
};

/**
 * ОРОН СУУЦНЫ 7 БАГЦ — хоёр өгөгдлийн сангийн нийлбэр.
 *
 *   `building_GOL`  → блок, өрх, гүйцэтгэгч (BAGTS · BLOK · AIL_TOO · BAR_COMP)
 *   `Selbe_guitsetgel_consolidated` → «Б.» мөрийн бодит гүйцэтгэл
 */
export const loadBagtsRows = cached<BagtsRow[]>(async () => {
  const [blocks, prog, uni] = await Promise.all([
    queryFeatures(BUILDING.url, {
      outFields: [BUILDING.oid, BF.bagts, BF.block, BF.households, BF.contractor],
    }),
    loadBlockProgress(),
    loadBlockUniverse(),
  ]);
  return joinBagts(blocks, prog, uni);
/*
 * Энэ ачаалагч өөрөө зөвхөн `BUILDING`-ийн блокуудыг татдаг ч дотроо
 * `loadBlockProgress` дууддаг — түүний `reads`-ийг энд давтана.
 */
}, 5 * 60_000, ['BAGTS_SHEET']);

/**
 * ӨРХИЙН НИЙТ — багцын мөрүүдээс (2026-10-09).
 * `ail: null` — бүх блокийн `AIL_TOO` хоосон («—»); `partial` — заримынх нь хоосон (нийлбэр нь
 * мэдэгдэж буй хэсгийнх, «дутуу» гэж тэмдэглэ; 1 өрхөд ногдох дүн гэх мэт ХАРЬЦААГ бодохгүй).
 */
export function ailTotal(rows: readonly BagtsRow[]): { ail: number | null; partial: boolean; missing: number } {
  let ail = 0; let missing = 0; let seen = 0;
  for (const r of rows) { ail += r.ail; missing += r.ailMissing ?? 0; seen += r.ailBlocks ?? 0; }
  if (seen > 0 && missing >= seen) return { ail: null, partial: false, missing };
  return { ail, partial: missing > 0, missing };
}

/**
 * ӨРХИЙН ТООНЫ БИЧЛЭГ — `ailTotal`-ийн дэлгэцийн хэлбэр: бүгд хоосон «—», заримд нь «N (дутуу)», бүрэн «N».
 */
export function ailLabel(rows: readonly BagtsRow[]): string {
  const t = ailTotal(rows);
  return t.ail == null ? '—' : t.partial ? `${num(t.ail)} (${tr('дутуу')})` : num(t.ail);
}

export function useBagtsTable(): Async<BagtsRow[]> {
  return useAsync(loadBagtsRows, []);
}

/** Экспорт — `execData.check.mjs` цэвэр оролтоор шалгана (сүлжээгүй) */
export function joinBagts(blocks: Row[], prog: BlockProgressMap, universe: BlockUniverse): BagtsRow[] {
  const means = pkgProgressOf(prog, universe);
  const by = new Map<string, BagtsRow>();
  const slot = (name: string) => {
    const k = bagtsKey(name);
    const cur = by.get(k) ?? {
      key: k, label: name, blocks: 0, ail: 0, ailMissing: 0, ailBlocks: 0, contractor: '—',
      origin: BAGTS_ORIGIN[name.trim()] ?? '—', progress: null, measured: 0, total: 0, missing: 0,
      keys: [],
    };
    by.set(k, cur);
    return cur;
  };

  const seen = new Set<string>();
  for (const b of blocks) {
    const name = text(b[BF.bagts], tr('Тодорхойгүй'));
    // Блокийн түлхүүрийг НЭГ УДАА бодож хадгална — цуваа ба дэд үе шатын карт
    // ижил түлхүүрийн жагсаалтаар ажиллана (`BagtsRow.keys`).
    const bk = buildingKey(b[BF.bagts], b[BF.block]);
    if (seen.has(bk)) continue;
    seen.add(bk);
    const s = slot(name);
    s.blocks += 1;
    const hh = b[BF.households] == null || b[BF.households] === '' ? NaN : Number(b[BF.households]);
    s.ailBlocks = (s.ailBlocks ?? 0) + 1;
    if (Number.isFinite(hh)) s.ail += hh; else s.ailMissing = (s.ailMissing ?? 0) + 1;
    // Гүйцэтгэгч — блокийн давхаргын BAR_COMP (багцын бүх блок нэг гүйцэтгэгчтэй)
    const comp = text(b[BF.contractor], '').trim();
    if (comp) s.contractor = comp;
    s.keys.push(bk);
  }

  return [...by.values()]
    .map((s) => {
      const m = means.get(s.key);
      const keys = universe.has(s.key) ? universeKeys(prog, universe, [s.key]) : s.keys;
      const poly = new Set(s.keys);
      const noPoly = universe.has(s.key) ? keys.filter((k) => !poly.has(k)).length : 0;
      return {
        ...s,
        ...(universe.has(s.key) ? { ailMissing: Math.min(keys.length, (s.ailMissing ?? 0) + noPoly), ailBlocks: keys.length } : {}),
        keys,
        blocks: universe.has(s.key) ? keys.length : s.blocks,
        missing: keys.filter((k) => !prog.get(k)).length,
        progress: m ? m.pct : null,
        measured: m ? m.blocks : 0,
        total: m ? m.total : 0,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'mn'));
}

/* ══════════════ ТӨСЛИЙН АЛБАН ЁСНЫ ГҮЙЦЭТГЭЛ ══════════════ */

export type BuildProgress = {
  /** Орон сууцны гүйцэтгэл (%) — `gdash.housingPct` (хэмжигдсэн багц, ХО дүнгээр жигнэсэн) */
  pct: number | null;
  blocks: number;
  /** Тайлагнасан блок */
  reported: number;
  /** Тайлан ирээгүй блок */
  missing: number;
};

/**
 * ОРОН СУУЦНЫ ГҮЙЦЭТГЭЛ — багцын мөрүүдээс, порталын ГАНЦ томьёогоор.
 *
 * @param cost багц (`BagtsRow.key`) → ХО дүн (`gdash.pkgCostWeight`). Өгөөгүй
 *   бол блокийн тооны нөөц жин — багцын хуваарь (`BagtsRow.total`).
 */
export function buildProgressOf(rows: readonly BagtsRow[], cost?: ReadonlyMap<string, number>): BuildProgress {
  let blocks = 0;
  let missing = 0;
  for (const r of rows) {
    blocks += r.blocks;
    missing += r.missing;
  }
  return {
    pct: housingPct(rows.map((r) => ({
      pct: r.progress, cost: cost?.get(r.key) ?? 0, blocks: r.total,
    }))),
    blocks,
    reported: rows.reduce((a, r) => a + r.measured, 0),
    missing,
  };
}

/* ── Тохиромжтой байдлын үнэлгээ (бүсийн орон зайн анализ) ── */

export type SuitSummary = {
  avgScore: number | null;
  levels: { label: string; color: string; n: number }[];
  noData: number;
  zones: number;
  ranked: { id: string; type: string; score: number | null }[];
  byId: Record<string, { score: number | null; type: string }>;
  byIndicator: IndicatorFail[];
  road: { trips: number; top: { zone: string; trips: number }[] };
};

export type IndicatorFail = {
  id: string;
  name: string;
  short: string;
  unit: string;
  weight: number;
  /** Норм ЗӨРЧСӨН бүсийн тоо */
  fails: number;
  /** Утга нь бодогдсон (дүгнэгдэх боломжтой) бүсийн тоо */
  scored: number;
  /**
   * Хамгийн их зөрчилтэй бүс — утга · норм · зөрүү гурвыг агуулна.
   */
  worst: { zone: string; value: number; gap: number; norm: string } | null;
  /**
   * Нормын шаардлага текстээр — «≥ 6.0 м²/хүн».
   * `byType` үзүүлэлтэд ганц утга биш МУЖ («≤ 1.2 – 3.0») болно.
   */
  normLabel: string;
  assumed: boolean;
};


export function useSuitability(enabled: boolean, onProgress?: (m: string, p: number) => void): Async<SuitSummary> {
  return useAsync(async () => {
    if (!enabled) return new Promise<SuitSummary>(() => {});
    const data = await loadAnalysisCached(onProgress);
    computeRaw(data.zones, defaultGreenCats(), PARKING, new Set(ACTIVATABLE_ZONE_TYPES));
    const blends = data.zones.map((z) => urbanScore(z.raw, INDICATORS, z.type).score);
    const valid = blends.filter((x): x is number => x != null);
    /*
     * ══ ҮЗҮҮЛЭЛТ БҮРЭЭР НОРМ ЗӨРЧИЛ (2026-08-24) ══
     */
    const live = data.zones.filter((z) => !z.excluded || ACTIVATABLE_ZONE_TYPES.has(z.type));
    const byIndicator: IndicatorFail[] = INDICATORS
      .filter((ind) => !ind.ref && ind.weight > 0 && ind.id !== 'engineering')
      .map((ind) => {
        let fails = 0;
        let scored = 0;
        let worst: IndicatorFail['worst'] = null;
        const fmtNorm = (x: number, d?: number) => x.toFixed(d ?? 1);
        for (const z of live) {
          const eff = normFor(ind, z.type);
          const v = z.rawActual[ind.id];
          const ok = passesNorm(v, eff);
          if (ok == null || v == null) continue;
          scored += 1;
          if (ok) continue;
          fails += 1;
          const gap = normGap(v, eff) ?? 0;
          if (!worst || gap > worst.gap) worst = { zone: z.id, value: v, gap, norm: normText(eff, fmtNorm) };
        }
        const capOf = (t: 'farMax' | 'bcrMax') => Object.values(DENSITY_BY_TYPE).map((d) => d[t]);
        const normLabel = ind.byType
          ? tr('≤ {0} – {1}{2} (бүсийн төрлөөр)',
            fmtNorm(Math.min(...capOf(ind.byType)), ind.decimals),
            fmtNorm(Math.max(...capOf(ind.byType)), ind.decimals),
            ind.unit ? ` ${ind.unit}` : '')
          : normText(ind, fmtNorm);
        return {
          id: ind.id,
          name: ind.name,
          short: ind.short,
          unit: ind.unit ?? '',
          weight: ind.weight,
          fails,
          scored,
          worst,
          normLabel,
          assumed: ind.id in ASSUME_MET,
        };
      });

    /* ══ ЗАМЫН СИМУЛЯЦЫН ЭРЭЛТ ══ */
    const tripRows = live
      .map((z) => ({ zone: z.id, trips: zoneTrips(z) }))
      .filter((x) => x.trips > 0)
      .sort((a, b) => b.trips - a.trips);

    return {
      byIndicator,
      road: {
        trips: tripRows.reduce((a, x) => a + x.trips, 0),
        top: tripRows.slice(0, 6),
      },
      avgScore: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
      levels: SCORE_LEVELS.map((L, i) => ({
        label: L.label, color: L.color,
        n: data.zones.filter((_, j) => levelOf(blends[j]) === i).length,
      })),
      noData: blends.filter((b) => levelOf(b) < 0).length,
      zones: data.zones.length,
      ranked: data.zones.map((z, i) => ({ id: z.id, type: z.type, score: blends[i] })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
      byId: Object.fromEntries(data.zones.map((z, i) => [z.id, { score: blends[i], type: z.type }])),
    };
  }, [enabled]);
}
