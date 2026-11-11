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
import { CASHFLOW_NEW, bagtsKey } from '@/lib/services';
import { applyAll } from '@/lib/tableWrite';
import { invalidate, subscribeData, writeEpoch, type DataKey } from '@/lib/dataBus';
import { canAutoSync } from '@/lib/caps';
import { currentUser } from '@/lib/who';
import type { ProjectPlan } from '@/lib/projectPlanInputs';
import type { PlanNode } from '@/lib/projectPlan';
import { PKGS } from '@/modules/sheet/bagts.pkg';

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

/**
 * УНАСАН ЭХИЙН ХҮРЭЭ (2026-11-05, аудит №1): `failed` бүгд БАГЦЫН түвшний (`schedule:<хуудас>`) бол тэдгээр
 * багцын түлхүүрүүд (`bagtsKey`) — бусад багцын мөр бичигдэж болно; төслийн түвшний эх (`blockProgress` ·
 * `landTotal` …) унасан бол `null` — юу ч бичихгүй. Урьд нь нэг хуудасны «Б.» мөр дутуу байхад л 182-ын бүх мөр мөнхөд
 * бичигдэхгүй байв.
 */
export function failedScope(failed: readonly string[]): Set<string> | null {
  const out = new Set<string>();
  for (const f of failed) {
    const m = /^schedule:(.+)$/.exec(f);
    if (!m) return null;
    const pkg = PKGS.find((p) => p.key === m[1]);
    if (!pkg) return null;
    out.add(bagtsKey(pkg.group));
  }
  return out;
}

/** Унасан багцын мөрүүд БА тэдгээрийн өвөг мөрүүд (Σ F·X дутуу хүүхдээр буруу) — бичигдэхгүй */
function taintedNodes(plan: ProjectPlan, scope: ReadonlySet<string>): Set<PlanNode> {
  const out = new Set<PlanNode>();
  if (!scope.size) return out;
  for (const n of plan.tree.nodes) {
    if (!n.pkg || !scope.has(bagtsKey(n.pkg))) continue;
    for (let p: PlanNode | null = n; p && !out.has(p); p = p.parent) out.add(p);
  }
  return out;
}

/** Бичих мөрүүд (цэвэр — тестлэгдэнэ): `[{ objectid, guitsetgel_huvi?, <огноо>? }]` — зөрсөн талбар л */
export function planProgressUpdates(plan: ProjectPlan): Record<string, unknown>[] {
  if (plan.empty) return [];
  const scope = failedScope(plan.failed);
  if (!scope) return [];
  const tainted = taintedNodes(plan, scope);
  const stored = new Map((plan.stored ?? []).map((r) => [r.objectid, r]));
  const out: Record<string, unknown>[] = [];
  for (const n of plan.tree.nodes) {
    const r = n.row;
    if (!r || r.objectid == null || tainted.has(n)) continue;
    const was = stored.get(r.objectid) ?? r;
    const u: Record<string, unknown> = {};
    const s = plan.result.values.get(n)?.S;
    if (s != null && Number.isFinite(s)) {
      const w = was.guitsetgel_huvi;
      if (!(w != null && Number.isFinite(w) && Math.abs(w - s) < EPS)) u[F.progressPct] = round6(s);
    } else if (n.phase === 'gazar' && n.depth > 1 && was.guitsetgel_huvi != null) {
      /* 2026-11-11 (хэрэглэгч): газар чөлөөлөлтийн багц/блокийн мөр хувьгүй — хуучин хадгалсан хувийг арилгана */
      u[F.progressPct] = null;
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
  /** `partial` — зарим багцын эх уншигдаагүй тул тэдгээрийн мөр (ба өвөг) бичигдээгүй; хүний унших жагсаалт */
  | { ok: true; n: number; partial?: string }
  | { ok: true; n: 0; skipped: string }
  | { ok: false; error: string };

/** Хэрэглэгчид харуулах анхааруулга — бүрэн бичигдсэн бол `null` (`hyanaltStore` · `huvaariBatlah` нэг текст) */
export function planSyncWarn(r: PlanSyncResult): string | null {
  if (!r.ok) return tr('«Төсөл төлөвлөгөө биелэлт»-ийн гүйцэтгэлийн хувь хүснэгтэд бичигдсэнгүй ({0}). Дараагийн бичилтээр дахин оролдоно.', r.error);
  if ('skipped' in r) return tr('«Төсөл төлөвлөгөө биелэлт»-ийн гүйцэтгэлийн хувь бичигдсэнгүй: {0}. Эхийг засаагүй бол дараагийн бичилтээр ч бичигдэхгүй.', r.skipped);
  if (r.partial) return tr('«Төсөл төлөвлөгөө биелэлт»-ийн гүйцэтгэлийн хувь ХЭСЭГЧЛЭН бичигдлээ — уншигдаагүй эх: {0}. Тэдгээр багц ба өвөг мөрүүд нь хуучин утгатай үлдэв.', r.partial);
  return null;
}

/**
 * Өөрийн invalidate — `startPlanSync`-ийн автобусын захиалагч үүнийг ДАХИН синк гэж ойлгохгүй (гогцоогүй; бусад
 * захиалагч — `publicSync` · `hoSync` · дэлгэц — хэвийн сонсоно). `invalidate` захиалагчдыг СИНХРОН дууддаг.
 */
let muted = false;
/**
 * 2026-11-05 (аудит): `batchInvalidate` дотор дуудагдвал мэдэгдэл batch дууссаны ДАРАА (muted буцсан хойно) ирдэг тул
 * өөрийн бичилтийн ҮЕИЙГ (`writeEpoch`) санаж — тэр үеийн мэдэгдлийг захиалагч үл тоомсорлоно; дараагийн жинхэнэ
 * бичилт үеийг ахиулдаг тул алдагдахгүй.
 */
let ownEpoch = -1;
/** Өөрийн мэдэгдэл үү (захиалагч алгасна) */
const isOwnNotice = (): boolean => muted || writeEpoch() === ownEpoch;
function invalidateQuiet(...keys: DataKey[]): void {
  muted = true;
  try { invalidate(...keys); } finally { muted = false; }
  ownEpoch = writeEpoch();
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
    if (plan.failed.length && !failedScope(plan.failed)) {
      return { ok: true, n: 0, skipped: tr('Зарим эх уншигдсангүй ({0})', plan.failed.join(', ')) };
    }
    const ups = planProgressUpdates(plan);
    let n = 0;
    for (let i = 0; i < ups.length; i += CHUNK) {
      const r = await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: ups.slice(i, i + CHUNK) });
      n += r.n;
    }
    if (n > 0) invalidateQuiet('CASHFLOW_NEW');
    return plan.failed.length ? { ok: true, n, partial: plan.failed.join(', ') } : { ok: true, n };
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
/**
 * Эрхгүй (403) — `DISABLE_MS` хүртэл дахин оролдохгүй (2026-11-05, аудит: урьд нь сешн дуустал — токен сэргэсэн,
 * эрх нэмэгдсэн ч дахин ажиллахгүй байв)
 */
const DISABLE_MS = 10 * 60_000;
let disabled: string | null = null;
let disabledUntil = 0;
let last: PlanSyncResult | null = null;

export const planSyncLast = (): PlanSyncResult | null => last;
export const planSyncDisabled = (): string | null => (disabled && Date.now() < disabledUntil ? disabled : null);

/* 2026-11-05 (аудит): зөвхөн эрхийн алдаа — «token» гэсэн дурын үгээр (түр сэргээлт) хаахгүй */
const isForbidden = (e: string): boolean => /\b(403|499|498)\b|эрхгүй|permission|not authorized|token required|invalid token/i.test(e);

/**
 * Нэг удаагийн синк — зэрэг дуудвал нэг л ажиллагаа; явж байхад дахин хүсвэл дараа нь дахин ажиллана.
 * `fresh` — батлалтын дараа (кэшээр биш шинээр уншина, `syncPlanProgress`); автобусаас анхдагч `false`.
 */
export function runPlanSync(opts: { fresh?: boolean } = {}): Promise<PlanSyncResult> {
  if (inflight) { again = true; return inflight; }
  inflight = (async (): Promise<PlanSyncResult> => {
    const off = planSyncDisabled();
    if (off) return { ok: false, error: `disabled: ${off}` };
    /* 2026-11-05 (аудит): автомат бичилт зөвхөн санхүү/IPC эрхтэй сешнээс — `hoSync`/`publicSync`-тэй нэг дүрэм
       (батлалтын шууд зам `syncPlanProgress` хаалтгүй — батлагч бичих ёстой) */
    if (!canAutoSync(currentUser())) return { ok: true, n: 0, skipped: 'no-cap' };
    const res = await syncPlanProgress({ fresh: opts.fresh ?? false });
    if (!res.ok) {
      if (isForbidden(res.error)) { disabled = res.error; disabledUntil = Date.now() + DISABLE_MS; }
      console.warn('[selbe] төсөл төлөвлөгөөний гүйцэтгэл (автомат) бичигдсэнгүй:', res.error);
    } else if ('skipped' in res || res.partial) {
      console.warn('[selbe] төсөл төлөвлөгөөний гүйцэтгэл бүрэн бичигдсэнгүй:', 'skipped' in res ? res.skipped : res.partial);
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
  const unsub = subscribeData(() => { if (!isOwnNotice()) schedulePlanSync(); });
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
export const __test = { isMuted: () => muted, isOwnNotice, invalidateQuiet };
