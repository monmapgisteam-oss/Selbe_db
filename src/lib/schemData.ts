/**
 * СХЕМИЙН ЭХ СУРВАЛЖУУДЫГ ЦУГЛУУЛАХ.
 */

import { cached, loadHeadline, loadClearance, SESSION_TTL_MS } from '@/lib/live';
import {
  loadOverall, loadProgress, loadFinance, loadHabeaSummary,
} from '@/lib/reportData';
import { queryAll } from '@/lib/hyanalt';
import { loadZov } from '@/lib/zovshoorol';
import { loadBagtsRows } from '@/lib/execData';
import { t as tr } from '@/lib/i18nCore';
import { SOURCE_NAME, type SchemSources } from '@/lib/schem';

const NAME = SOURCE_NAME;

const loadZovCached = cached(loadZov, SESSION_TTL_MS, ['ZOVSHOOROL'], (v) => v != null);
const queryAllCached = cached(queryAll, SESSION_TTL_MS, ['HYANALT']);

/**
 * БҮХ ЭХ СУРВАЛЖ УНАСАН үеийн алдаа (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 */
export function schemAllFailedError(reason: unknown): Error {
  const why = reason instanceof Error ? reason.message : reason == null ? '' : String(reason);
  const e = new Error(why
    ? tr('Схемийн эх сурвалж бүгд татагдсангүй: {0}', why)
    : tr('Схемийн эх сурвалж бүгд татагдсангүй'));
  if (reason instanceof Error && reason.name && reason.name !== 'Error') e.name = reason.name;
  return e;
}

class SchemPartial extends Error {
  constructor(readonly result: SchemSources) {
    super(tr('{0} эх сурвалж татагдсангүй', result.failed.join(', ')));
  }
}

const schemSourcesFull = cached<SchemSources>(async () => {
  const [h, c, o, p, f, hb, z, r, b] = await Promise.allSettled([
    loadHeadline(),
    loadClearance(),
    loadOverall(),
    loadProgress(),
    loadFinance(),
    loadHabeaSummary(),
    loadZovCached(),
    queryAllCached(),
    loadBagtsRows(),
  ]);

  const failed: string[] = [];
  let firstReason: unknown = null;
  const take = <T>(name: string, x: PromiseSettledResult<T>): T | null => {
    if (x.status === 'fulfilled') {
      if (x.value == null) failed.push(name);
      return x.value;
    }
    console.error(`[selbe] схем · ${name}:`, x.reason);
    firstReason ??= x.reason;
    failed.push(name);
    return null;
  };

  const headline = take(NAME.headline, h);
  if (headline?.partial && !failed.includes(NAME.headline)) failed.push(NAME.headline);
  const src: SchemSources = {
    headline,
    clearance: take(NAME.clearance, c),
    overall: take(NAME.overall, o),
    progress: take(NAME.progress, p),
    finance: take(NAME.finance, f),
    habea: take(NAME.habea, hb),
    zov: take(NAME.zov, z),
    review: take(NAME.review, r),
    bagts: take(NAME.bagts, b),
    failed,
  };

  const got = [src.headline, src.clearance, src.overall, src.progress, src.finance, src.habea, src.zov, src.review, src.bagts];
  if (got.every((v) => v == null) && new Set(failed).size >= got.length) {
    throw schemAllFailedError(firstReason);
  }
  if (failed.length) throw new SchemPartial(src);
  return src;
}, 5 * 60_000, ['CASHFLOW_NEW', 'PARCEL_LEFT', 'BAGTS_SHEET', 'BAGTS_NEGTGEL', 'HABEA', 'HO_IPC', 'HYANALT', 'ZOVSHOOROL']);

/** Схемийн эх сурвалжууд. Хэсэгчилсэн үед `failed` дүүрэн, кэшлэгдэхгүй. */
export async function loadSchemSources(): Promise<SchemSources> {
  try {
    return await schemSourcesFull();
  } catch (e) {
    if (e instanceof SchemPartial) return e.result;
    throw e;
  }
}
