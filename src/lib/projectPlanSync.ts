/**
 * «ТӨСӨЛ ТӨЛӨВЛӨГӨӨ БИЕЛЭЛТ»-ИЙН ГҮЙЦЭТГЭЛИЙН ХУВИЙГ ХҮСНЭГТЭД БИЧНЭ (2026-10-29).
 *
 * 2026-11-05: батлалтаас (`huvaariBatlah` · `hyanaltStore`) гадна — Cashflow/нэгж талбар/барилгын давхаргад бичилт
 * хийгдэх бүрт (dataBus) ба портал нээгдэхэд ч ажиллана (`startPlanSync`, `publicSync`/`hoSync`-той нэг хэв):
 * «ТЭЗҮ · Ажлын зураг төсөл», «Газар чөлөөлөлтийн огноо», «Үе шат оруулах» хуудасны хадгалалт, газар чөлөөлөлт,
 * барилгын давхаргын өөрчлөлтөөс хойш 182-ын `guitsetgel_huvi` 44 мөрд системийн тооноос хоцорч байв.
 */
import { useEffect } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { CASHFLOW_NEW } from '@/lib/services';
import { applyAll } from '@/lib/tableWrite';
import { invalidate, subscribeData, type DataKey } from '@/lib/dataBus';
import type { ProjectPlan } from '@/lib/projectPlanInputs';

const F = CASHFLOW_NEW.fields;
/** Зөрүүгийн хүлцэл (хувийн нэгж) — хөвөгч таслалын шуугианаар дахин бичихгүй */
const EPS = 1e-4;
/** Нэг `applyEdits`-ийн дээд мөр */
const CHUNK = 500;

/** Хадгалах утга — 6 оронгоор (`zuragTosol.textOf`-той ижил нарийвчлал) */
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

const DATE_KEYS = [
  ['guits_ehleh', F.contractorStart], ['guits_duusah', F.contractorEnd],
  ['gazar_ehleh', F.landStart], ['gazar_duusah', F.landEnd],
] as const;
const DAY = 86_400_000;
const sameDay = (a: number | null | undefined, b: number | null | undefined) =>
  (a == null ? b == null : b != null && Math.floor(a / DAY) === Math.floor(b / DAY));

/** Бичих мөрүүд (цэвэр — тестлэгдэнэ): `[{ objectid, guitsetgel_huvi?, <огноо>? }]` — зөрсөн талбар л */
export function planProgressUpdates(plan: ProjectPlan): Record<string, unknown>[] {
  if (plan.empty || plan.failed.length) return [];
  const stored = new Map((plan.stored ?? []).map((r) => [r.objectid, r]));
  const out: Record<string, unknown>[] = [];
  for (const n of plan.tree.nodes) {
    const r = n.row;
    if (!r || r.objectid == null) continue;
    const was = stored.get(r.objectid) ?? r;
    const u: Record<string, unknown> = {};
    const s = plan.result.values.get(n)?.S;
    if (s != null && Number.isFinite(s)) {
      const w = was.guitsetgel_huvi;
      if (!(w != null && Number.isFinite(w) && Math.abs(w - s) < EPS)) u[F.progressPct] = round6(s);
    }
    for (const [k, f] of DATE_KEYS) {
      /* 2026-11-04: мөнгөний мөрийн `guits_*` нь «Cashflow хуваарилах»-ын төлөвлөгөөт хугацаа — Хуваариар ДАРЖ БИЧИХГҮЙ */
      if (r.cashflow_id != null && k.startsWith('guits_')) continue;
      if (!sameDay(was[k], r[k])) u[f] = r[k] ?? null;
    }
    if (Object.keys(u).length) out.push({ [CASHFLOW_NEW.oid]: r.objectid, ...u });
  }
  return out;
}

export type PlanSyncResult =
  | { ok: true; n: number }
  | { ok: true; n: 0; skipped: string }
  | { ok: false; error: string };

/**
 * Өөрийн invalidate — `startPlanSync`-ийн автобусын захиалагч үүнийг ДАХИН синк гэж ойлгохгүй (гогцоогүй; бусад
 * захиалагч — `publicSync` · `hoSync` · дэлгэц — хэвийн сонсоно). `invalidate` захиалагчдыг СИНХРОН дууддаг.
 */
let muted = false;
function invalidateQuiet(...keys: DataKey[]): void {
  muted = true;
  try { invalidate(...keys); } finally { muted = false; }
}

/**
 * Амьд эхээр дахин бодоод зөрсөн мөрийн `guitsetgel_huvi`-г бичнэ. ХЭЗЭЭ Ч шидэхгүй — батлалтыг саатуулахгүй.
 * `fresh` (анхдагч true) — батлалт сая бичигдсэн тул кэшлэгдсэн хуудас/хүснэгтээр биш шинээр уншина; автобусаас
 * (`startPlanSync`) дуудахад бичилт өөрөө кэшээ хүчингүй болгосон тул `false`.
 */
export async function syncPlanProgress(opts: { fresh?: boolean } = {}): Promise<PlanSyncResult> {
  try {
    if (opts.fresh ?? true) invalidateQuiet('BAGTS_SHEET', 'CASHFLOW_NEW');
    const { loadProjectPlan } = await import('@/lib/projectPlanInputs');
    const plan = await loadProjectPlan();
    if (plan.empty) return { ok: true, n: 0, skipped: tr('Төсөл төлөвлөгөөний мөр алга') };
    if (plan.failed.length) {
      return { ok: true, n: 0, skipped: tr('Зарим эх уншигдсангүй ({0})', plan.failed.join(', ')) };
    }
    const ups = planProgressUpdates(plan);
    let n = 0;
    for (let i = 0; i < ups.length; i += CHUNK) {
      const r = await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: ups.slice(i, i + CHUNK) });
      n += r.n;
    }
    if (n > 0) invalidateQuiet('CASHFLOW_NEW');
    return { ok: true, n };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ══════════════ Автомат урсгал (2026-11-05) — `publicSync.startPublicSync`-той нэг хэв ══════════════ */

const DEBOUNCE_MS = 15_000;
/** Портал нээгдэхэд — `publicSync` (8 с) · `hoSync` (6 с)-ийн дараа, эхний ачаалалттай өрсөлдөхгүй */
const BOOT_DELAY_MS = 20_000;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<PlanSyncResult> | null = null;
let again = false;
/** Эрхгүй (403) — энэ сешнд дахин оролдохгүй */
let disabled: string | null = null;
let last: PlanSyncResult | null = null;

export const planSyncLast = (): PlanSyncResult | null => last;
export const planSyncDisabled = (): string | null => disabled;

const isForbidden = (e: string): boolean => /\b(403|499|498)\b|эрхгүй|permission|not authorized|token/i.test(e);

/** Нэг удаагийн синк — зэрэг дуудвал нэг л ажиллагаа; явж байхад дахин хүсвэл дараа нь дахин ажиллана */
export function runPlanSync(): Promise<PlanSyncResult> {
  if (inflight) { again = true; return inflight; }
  inflight = (async (): Promise<PlanSyncResult> => {
    if (disabled) return { ok: false, error: `disabled: ${disabled}` };
    const res = await syncPlanProgress({ fresh: false });
    if (!res.ok) {
      if (isForbidden(res.error)) disabled = res.error;
      console.warn('[selbe] төсөл төлөвлөгөөний гүйцэтгэл (автомат) бичигдсэнгүй:', res.error);
    }
    last = res;
    return res;
  })().finally(() => {
    inflight = null;
    if (again) { again = false; schedulePlanSync(); }
  });
  return inflight;
}

export function schedulePlanSync(delay = DEBOUNCE_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void runPlanSync(); }, delay);
}

/** Портал нээгдэхэд нэг удаа + бичилт бүрийн дараа (dataBus; өөрийн бичилт орохгүй) — зогсоогч буцаана */
export function startPlanSync(): () => void {
  if (typeof window === 'undefined') return () => {};
  const unsub = subscribeData(() => { if (!muted) schedulePlanSync(); });
  schedulePlanSync(BOOT_DELAY_MS);
  return () => {
    unsub();
    if (timer) { clearTimeout(timer); timer = null; }
  };
}

/** Portal: нэвтэрсэн (эсвэл нэвтрэлт унтраалттай) үед л — `usePublicSync`-ийн хажууд */
export function usePlanSync(on: boolean): void {
  useEffect(() => (on ? startPlanSync() : undefined), [on]);
}

/** Тест/дотоод хэрэглээнд */
export const __test = { isMuted: () => muted, invalidateQuiet };
