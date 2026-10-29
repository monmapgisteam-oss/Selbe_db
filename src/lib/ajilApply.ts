'use client';

/**
 * НЭМЭЛТ АЖЛЫН БАТЛАГДСАН МӨРИЙГ ҮНДСЭН ХҮСНЭГТЭД БУУЛГАХ (2026-09-24).
 */

import { AUTH, roleForUser } from './services';
import { ajilScope } from './ajilAcl';
import { hasCap } from './caps';
import { t as tr } from '@/lib/i18nCore';
import { currentUser, requireCap } from './who';
import { AJIL_STATUS, ajilClaimOther, claimAjil, loadHead, loadPayloadStamped, markApplied, releaseAjilClaim } from './ajilBatlah';
import { obyemBusyFor } from './obyemBatlah';
import { claimHolderOf as planClaimHolderOf, loadPending as loadPlanPending, partialBy as planPartialBy, type PlanSubmission } from './huvaariBatlah';
import type { NewRow } from './submission';
import { isLostWrite } from './lostWrite';

/* ══════════════════ ЦЭВЭР ХЭСЭГ (тест: ajilApply.check.mjs) ══════════════════ */

/** Давхардал шалгахад хэрэгтэй ХАМГИЙН БАГА мөрийн хэлбэр (`SheetRow`-ийн дэд олонлог) */
export type RowLike = { no: string; work: string; group: boolean; depth: number };

const eq = (a: string, b: string) => a.trim() === b.trim();

/**
 * Нэмэх мөрийн ЭЦЭГ БҮЛГИЙН индекс — `sheetFrame.parentOf`-ийн ЯГ ИЖИЛ дүрэм:
 * нэрээр таарах бүх бүлгээс `parentIdx`-д ХАМГИЙН ОЙРХОНЫГ. `-1` = алга.
 */
export function parentIdxOf(rows: readonly RowLike[], a: NewRow): number {
  let p = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const g = rows[i];
    if (!g.group || !eq(g.no, a.parentNo) || !eq(g.work, a.parentWork)) continue;
    if (p < 0 || Math.abs(i - a.parentIdx) < Math.abs(p - a.parentIdx)) p = i;
  }
  return p;
}

/**
 * Нэмэх мөр эцгийнхээ ДОР аль хэдийн БАЙНА уу — зөвхөн `parentIdxOf` эцгийн
 * дэд модны АЖЛЫН (бүлэг биш) мөрүүдээс. Дэд мод = эцгийн араас гүн нь
 * эцгийнхээс их байх хүртэл.
 */
export function addPresent(rows: readonly RowLike[], a: NewRow): boolean {
  const p = parentIdxOf(rows, a);
  if (p < 0) return false;
  const g = rows[p];
  for (let k = p + 1; k < rows.length && rows[k].depth > g.depth; k += 1) {
    const r = rows[k];
    if (!r.group && eq(r.no, a.no) && eq(r.work, a.work)) return true;
  }
  return false;
}

/**
 * Давхардлыг хасна: аль хэдийн байгаа мөрийг `dropped`, үлдсэнийг `fresh`.
 */
export function dedupeAdds(rows: readonly RowLike[], adds: readonly NewRow[]): { fresh: NewRow[]; dropped: NewRow[] } {
  const fresh: NewRow[] = [];
  const dropped: NewRow[] = [];
  const seen = new Set<string>();
  for (const a of adds) {
    const p = parentIdxOf(rows, a);
    const key = `${p}¦${a.parentNo.trim()}¦${a.parentWork.trim()}¦${a.no.trim()}¦${a.work.trim()}`;
    if (seen.has(key) || addPresent(rows, a)) { dropped.push(a); continue; }
    seen.add(key);
    fresh.push(a);
  }
  return { fresh, dropped };
}

/**
 * ЭЦЭГ БҮЛЭГ НЬ ХУУДСАНД АЛГА НЭМЭЛТ МӨРҮҮД (2026-10-22, аудит №3) — `parentIdxOf < 0`, өөрөөр хэлбэл
 * `sheetFrame.insertAdds` чимээгүй алгасах мөрүүд.
 */
export function missingParents<T extends NewRow>(rows: readonly RowLike[], adds: readonly T[]): T[] {
  return adds.filter((a) => parentIdxOf(rows, a) < 0);
}

/**
 * БАТЛАХЫН ӨМНӨХ ЭЦГИЙН ШАЛГАЛТ (2026-10-22, аудит №3) — буулгалттай (`writeFrameLive`) ИЖИЛ схем (`fillSchema`) ба
 * хатуу уншилтаар (`strict`) одоогийн хуудсыг уншиж, эцэггүй мөр байвал шийдвэр гаргахыг ХААНА. Урьд нь `decideAjil`
 * эхлээд «Батлагдсан» бичээд, буулгалт л «эцэг олдсонгүй» гэж унадаг тул илгээлт гацаж, батлагч «Гацсаныг буцаах»-ыг
 * хайж олох шаардлагатай болдог байв. Уншилт унавал ч хаана (fail-closed) — дахин оролдоно.
 * @returns `ok: true` — бүх мөрийн эцэг олдсон; эсвэл алдааны мессеж ба эцэггүй мөрүүд
 */
export async function parentsCheck(pkgKey: string, adds: readonly NewRow[]): Promise<{ ok: true } | { ok: false; error: string; missing: NewRow[] }> {
  try {
    const { PKGS, fillSchema } = await import('@/modules/sheet/bagts.pkg');
    const pkg = PKGS.find((p) => p.key === pkgKey);
    if (!pkg) return { ok: false, error: tr('Илгээлтийн багц олдсонгүй: {0}', pkgKey), missing: [] };
    const { loadRows } = await import('@/modules/sheet/bagtsSheet');
    const sc = await fillSchema(pkg);
    const loaded = await loadRows(pkg, sc, undefined, undefined, { strict: true });
    const missing = missingParents(loaded.rows, adds);
    if (!missing.length) return { ok: true };
    const names = missing.map((a) => `${a.no} · ${a.work} (${tr('эцэг: {0}', `${a.parentNo} ${a.parentWork}`.trim() || '—')})`);
    return {
      ok: false,
      missing,
      error: tr('{0} мөрийн эцэг бүлэг одоогийн хуудсанд олдсонгүй: {1} — батлавал хуудсанд буухгүй гацна. «Буцаах»-аар (шалтгаан бөглөгдсөн) нэмэгчид буцаана уу.',
        String(missing.length), names.slice(0, 5).join('; ') + (names.length > 5 ? ` (+${names.length - 5})` : '')),
    };
  } catch (e) {
    return { ok: false, missing: [], error: tr('Эцэг бүлгийг шалгах үед хуудас уншигдсангүй — дахин оролдоно уу: {0}', String((e as Error)?.message ?? e)) };
  }
}

/** UTC өдрийн эхэн (`Date.UTC(y,m,d)`) */
export const dayStartUtc = (ms: number): number => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/**
 * ӨНӨӨДӨР — ЛОКАЛ хуанлийн өдөр, `Date.UTC(y,m,d)` хэлбэрээр.
 */
export const todayLocalMs = (nowMs: number): number => {
  const d = new Date(nowMs);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

/**
 * БӨГЛӨСӨН ӨДӨР — `max(өнөөдөр (локал), сүүлийн жаазны өдөр)`.
 */
export function fillMsFor(nowMs: number, snapshot: number | null | undefined): number {
  const today = todayLocalMs(nowMs);
  if (snapshot == null || !Number.isFinite(snapshot)) return today;
  const last = dayStartUtc(snapshot);
  return last > today ? last : today;
}

/** Жааз тулгахад хэрэгтэй ХАМГИЙН БАГА хэлбэр (`loadRows`-ийн үр дүнгийн дэд олонлог) */
export type FrameLike = {
  rows: readonly { oid: number; raw?: Record<string, unknown> }[];
  asOf: number | null;
  snapshot: number | null;
};

/**
 * Хоёр ачаалалт ЯГ ИЖИЛ жааз уу — мөр бүрийн OID ба ТҮҮХИЙ атрибут (`raw`)-аар.
 */
export function sameFrame(a: FrameLike, b: FrameLike): boolean {
  if (a.asOf !== b.asOf || a.snapshot !== b.snapshot || a.rows.length !== b.rows.length) return false;
  for (let i = 0; i < a.rows.length; i += 1) {
    const x = a.rows[i];
    const y = b.rows[i];
    if (x.oid !== y.oid) return false;
    if (JSON.stringify(x.raw ?? null) !== JSON.stringify(y.raw ?? null)) return false;
  }
  return true;
}

/* ══════════ «БАТЛАГДСАН · БУУЛГААГҮЙ» ИЛРҮҮЛЭХ (2026-10-01, тест: ajilReapply.check.mjs) ══════════ */

/**
 * Батлагдсаны дараах ХҮЛЭЭХ ХУГАЦАА — энэ хугацаанд батлагчийн цонх
 * `materializeAdds`-ыг ӨӨРӨӨ гүйцээж байж магадгүй.
 */
export const APPLY_GRACE_MS = 3 * 60_000;

/**
 * `retry`  — буулгалт унасан/тасарсан: «Дахин буулгах» нээлттэй
 * `fresh`  — саяхан батлагдсан: батлагчийн цонх одоо бичиж байж магадгүй
 * `orphan` — багцын түлхүүр бүртгэлд (`PKGS`) алга: буулгах боломжгүй, админд
 */
export type StuckKind = 'retry' | 'fresh' | 'orphan';

/** Ангилахад хэрэгтэй ХАМГИЙН БАГА хэлбэр (`AjilSubmission`-ийн дэд олонлог) */
export type StuckLike = { oid: number; status: string; pkgKey: string; pkgGroup: string; approverAt: number | null };

export type StuckItem<T extends StuckLike> = {
  sub: T;
  kind: StuckKind;
  /** `fresh` бол «Дахин буулгах» нээгдэх агшин, бусад нь `null` */
  readyAt: number | null;
};

/**
 * БАТЛАГДСАН ч БУУГААГҮЙ илгээлтүүдийг ангилна — хэнд юу харуулахыг.
 */
export function classifyStuck<T extends StuckLike>(
  subs: readonly T[],
  o: {
    now: number;
    scope: readonly string[] | null;
    knownPkg: (pkgKey: string) => boolean;
    /** Энэ цонхонд буулгах оролдлого ДУУССАН илгээлтүүд — хүлээлгүй */
    settled?: ReadonlySet<number>;
    noParent?: ReadonlySet<number>;
    grace?: number;
  },
): StuckItem<T>[] {
  const grace = o.grace ?? APPLY_GRACE_MS;
  const out: StuckItem<T>[] = [];
  for (const x of subs) {
    if (x.status !== AJIL_STATUS.approved) continue;
    if (o.scope != null && !o.scope.includes(x.pkgGroup)) continue;
    if (!o.knownPkg(x.pkgKey) || o.noParent?.has(x.oid)) {
      out.push({ sub: x, kind: 'orphan', readyAt: null });
      continue;
    }
    const at = x.approverAt;
    if (at != null && Number.isFinite(at) && !o.settled?.has(x.oid) && o.now - at > -grace && o.now - at < grace) {
      out.push({ sub: x, kind: 'fresh', readyAt: at + grace });
    } else {
      out.push({ sub: x, kind: 'retry', readyAt: null });
    }
  }
  return out;
}

/**
 * «ДАХИН БУУЛГАХ» ЭРХ — батлагч (`ajilApprove`) ЭСВЭЛ хатуу super.
 */
export function mayReapply(o: { authOff: boolean; isSuper: boolean; hasApprove: boolean }): boolean {
  return o.authOff || o.isSuper || o.hasApprove;
}

/* ══════════════════ СҮЛЖЭЭТЭЙ ХЭСЭГ ══════════════════ */

export type ApplyResult =
  | { ok: true; /** Аль хэдийн `applied` байсан — юу ч бичээгүй */ already?: boolean; /** Энэ удаа бичигдсэн мөр */ added: number;
 warn?: string }
  | { ok: false; error: string; code?: 'no-parent' };

/**
 * БАТЛАГДСАН ИЛГЭЭЛТИЙН МӨРҮҮДИЙГ ҮНДСЭН ХҮСНЭГТЭД БИЧНЭ.
 *
 * Дараалал (файлын толгой): эрх → толгой/төлөв → агуулга → сүүлийн жааз →
 * давхардал хасах → оруулах → жааз угсрах → урт тулгах → уралдаа шалгах →
 * бичих (унавал буцаах) → дахин уншиж батлах → `markApplied`.
 *
 * @param pkgKey дуудагчийн мэдэж буй багц — СЕРВЕРИЙН `pkgKey`-тэй тулгана
 *               (зөрвөл татгалзана); жинхэнэ эх нь сервер.
 * @param stamp  батлагчийн ХАРСАН агуулгын тэмдэг (`ajilBatlah.payloadStamp`) — өгсөн
 *               бол серверийн одоогийн агуулгатай тулгана (2026-09-30).
 */
export async function materializeAdds(args: { pkgKey?: string; ajilOid: number; stamp?: string }): Promise<ApplyResult> {
  requireApplyCap();
  const cur = inflight.get(args.ajilOid);
  if (cur) return cur;
  const p = withApplyLock(async () => {
    try {
      return await materializeInner(args);
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) };
    }
  });
  inflight.set(args.ajilOid, p);
  try {
    return await p;
  } finally {
    if (inflight.get(args.ajilOid) === p) inflight.delete(args.ajilOid);
  }
}

/**
 * Эрхийн шалгуур — `ajilApprove` ЭСВЭЛ хатуу super (2026-10-01, `mayReapply`).
 */
function requireApplyCap(): void {
  if (typeof window === 'undefined') return;
  const me = currentUser();
  if (mayReapply({ authOff: !AUTH.appId, isSuper: roleForUser(me) === 'super', hasApprove: hasCap(me, 'ajilApprove') })) return;
  requireCap('ajilApprove');
}

/** Энэ табд одоо явж буй буулгалт — илгээлтийн OID → амлалт (2026-10-01) */
const inflight = new Map<number, Promise<ApplyResult>>();

/** Хөтчийн бүх табд нэг — Web Locks-ийн нэр */
const APPLY_LOCK = 'selbe-ajil-apply';
/** Web Locks байхгүй орчны (хуучин хөтөч, Node) таб доторх дараалал */
let applyTail: Promise<unknown> = Promise.resolve();

/**
 * БҮХ БУУЛГАЛТЫГ НЭГ НЭГЭЭР НЬ — нэг багцад хоёр жааз зэрэг бичигдэхгүй (2026-10-01).
 */
async function withApplyLock(fn: () => Promise<ApplyResult>): Promise<ApplyResult> {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  if (locks && typeof locks.request === 'function') {
    try {
      return await locks.request(APPLY_LOCK, { signal: AbortSignal.timeout(_io.lockWaitMs) }, () => fn());
    } catch (e) {
      const n = (e as Error)?.name;
      if (n === 'TimeoutError' || n === 'AbortError')
        return { ok: false, error: tr('Өөр цонхонд нэмэлт ажил буулгаж байна — дуусахыг хүлээгээд дахин оролдоно уу.') };
      return { ok: false, error: String((e as Error)?.message ?? e) };
    }
  }
  const run = applyTail.then(fn, fn);
  applyTail = run.catch(() => undefined);
  return run;
}

/** Жааз бичилтийн үр дүн — `added: 0` = бүх мөр аль хэдийн хуудсанд байна (юу ч бичээгүй) */
export type FrameWrite = { ok: true; added: number } | { ok: false; error: string; code?: 'no-parent' };

/**
 * СҮЛЖЭЭНИЙ ХАМААРАЛ — ЗӨВХӨН тест (`ajilReapply.check.mjs`) солино (2026-10-01).
 * Ажиллах үед үргэлж жинхэнэ функцууд.
 */
export const _io: {
  loadHead: typeof loadHead;
  loadPayloadStamped: typeof loadPayloadStamped;
  markApplied: typeof markApplied;
  writeFrame: (pkgKey: string, adds: readonly NewRow[]) => Promise<FrameWrite>;
  loadPlanPending: (pkgKey: string) => Promise<PlanSubmission[] | PlanSubmission | null>;
  claimOther: (ajilOid: number, me: string) => Promise<string | null>;
  obyemBusy: (pkgKey: string) => Promise<{ who: string; partial: boolean } | null>;
  archivingBusy: (pkgKey: string) => Promise<{ who: string; at: number } | null>;
  claimApply: (ajilOid: number, me: string) => Promise<string | null>;
  releaseApply: (ajilOid: number, me: string) => Promise<void>;
  /** Өөр табын түгжээг хүлээх дээд хугацаа */
  lockWaitMs: number;
} = {
  loadHead, loadPayloadStamped, markApplied, writeFrame: writeFrameLive,
  loadPlanPending: async (k) => {
    const [p, g] = await Promise.all([loadPlanPending(k, 'plan'), loadPlanPending(k, 'geree')]);
    return [p, g].filter((x): x is PlanSubmission => x != null);
  },
  claimOther: (oid, me) => ajilClaimOther(oid, me),
  obyemBusy: (k) => obyemBusyFor(k),
  archivingBusy: async (k) => (await import('./submission')).archivingBusy(k),
  claimApply: (oid, me) => claimAjil({ oid, me, want: AJIL_STATUS.approved }),
  releaseApply: (oid, me) => releaseAjilClaim({ oid, me }),
  lockWaitMs: 120_000,
};

/** `_io.loadPlanPending`-ийн хариуг жагсаалт болгоно (тест ганц мөр/`null` өгч болно) */
const planList = (v: PlanSubmission[] | PlanSubmission | null): PlanSubmission[] =>
  (v == null ? [] : Array.isArray(v) ? v : [v]);

/**
 * ЖААЗ СОЛИХЫГ ХААХ НӨХЦӨЛ — хуваарь (ХОЁР төрөл) ба обьёмын батлалт (2026-10-09 тусгаарлав).
 * `materializeInner` эхэнд нь, `writeFrameLive` A.8-ийн ДАРАА `applyAdds`-ийн ЯГ ӨМНӨ (засвар 5) дуудна —
 * урьд нь хаалт ганцхан удаа, жааз ачаалж угсрахаас (хэдэн секунд) ӨМНӨ шалгагддаг тул тэр завсарт
 * хуваарийн/обьёмын батлагч түгжиж бичиж эхэлбэл жааз тэдний доороос солигддог байв.
 * @returns `{ error }` = ХААНА (юу ч бичихгүй); эс бөгөөс `{ warn? }`
 */
export async function busyGate(pkgKey: string): Promise<{ error: string } | { warn?: string }> {
  let pps: PlanSubmission[];
  try {
    pps = planList(await _io.loadPlanPending(pkgKey));
  } catch (e) {
    return { error: tr('Энэ багцын хуваарийн илгээлтийн төлөв уншигдсангүй ({0}) — юу ч бичсэнгүй, дахин оролдоно уу.', String((e as Error)?.message ?? e)) };
  }
  for (const pp of pps) {
    const pb = planPartialBy(pp.status, pp.reason);
    if (pb != null) {
      return { error: tr('Энэ багцын хуваарийн илгээлтийг батлагч ({0}) эх хуудсанд ХЭСЭГЧЛЭН бичсэн байна — тэр батлалт гүйцэгдэх (эсвэл буцаагдах) хүртэл нэмэлт ажлыг буулгах боломжгүй: жааз солигдвол хагас бичилт алдагдана.', pb || '—') };
    }
  }
  for (const pp of pps) {
    const h = planClaimHolderOf(pp);
    if (h) return { error: tr('{0} энэ багцын хуваарийг яг одоо батлаж байна — дуусахыг хүлээгээд дахин оролдоно уу. Юу ч бичсэнгүй.', h) };
  }
  const warn = pps.length
    ? tr('Анхаар: энэ багцад хуваарийн илгээлт ({0}) батлагдахыг хүлээж байна — нэмэлт ажил буулгаснаар хуудасны шинэ хувилбар үүсэж, батлагч саналыг түүнд тулгана.', pps.map((p) => p.author).join(', '))
    : undefined;
  let ob: { who: string; partial: boolean } | null;
  try {
    ob = await _io.obyemBusy(pkgKey);
  } catch (e) {
    return { error: tr('Энэ багцын обьёмын батлалтын төлөв уншигдсангүй ({0}) — юу ч бичсэнгүй, дахин оролдоно уу.', String((e as Error)?.message ?? e)) };
  }
  if (ob) {
    return {
      error: ob.partial
        ? tr('Энэ багцын инженерийн обьёмыг батлагч ({0}) үндсэн өгөгдөлд ХЭСЭГЧЛЭН бичсэн байна — тэр батлалт гүйцэгдэх хүртэл нэмэлт ажлыг буулгах боломжгүй: жааз солигдвол обьём хуучин жаазад үлдэнэ.', ob.who || '—')
        : tr('{0} энэ багцын инженерийн обьёмыг яг одоо батлаж байна — дуусахыг хүлээгээд дахин оролдоно уу. Юу ч бичсэнгүй.', ob.who),
    };
  }
  let ar: { who: string; at: number } | null;
  try {
    ar = await _io.archivingBusy(pkgKey);
  } catch (e) {
    return { error: tr('Энэ багцын гүйцэтгэлийн архивлалтын төлөв уншигдсангүй ({0}) — юу ч бичсэнгүй, дахин оролдоно уу.', String((e as Error)?.message ?? e)) };
  }
  if (ar) return { error: tr('{0} гүйцэтгэлийг яг одоо архивлаж байна — дуусахыг хүлээнэ үү', ar.who || '—') };
  return warn ? { warn } : {};
}

/** `materializeAdds`-ийн бие — эрхийн шалгалтын ДАРАА л дуудагдана. */
async function materializeInner(args: { pkgKey?: string; ajilOid: number; stamp?: string }): Promise<ApplyResult> {
  const head = await _io.loadHead(args.ajilOid);
  if (!head) return { ok: false, error: tr('Илгээлт олдсонгүй — устгагдсан байж магадгүй.') };
  if (args.pkgKey && args.pkgKey !== head.pkgKey)
    return { ok: false, error: tr('Илгээлт «{0}» багцынх — хуудас «{1}». Юу ч бичсэнгүй.', head.pkgKey, args.pkgKey) };
  if (AUTH.appId) {
    const me = currentUser();
    if (typeof window !== 'undefined' && !me) return { ok: false, error: tr('Нэвтэрсэн хэрэглэгч тодорхойгүй — дахин нэвтэрнэ үү.') };
    const sc0 = ajilScope(me, 'approver');
    if (sc0 !== null && !sc0.includes(head.pkgGroup))
      return { ok: false, error: tr('Энэ багцын нэмэлт ажлыг батлах эрхгүй.') };
  }
  if (head.status === AJIL_STATUS.applied) return { ok: true, already: true, added: 0 };
  if (head.status !== AJIL_STATUS.approved)
    return { ok: false, error: tr('Илгээлт батлагдаагүй ({0}) — хуудсанд буулгах боломжгүй.', head.status) };
  const gate = await busyGate(head.pkgKey);
  if ('error' in gate) return { ok: false, error: gate.error };
  const warn = gate.warn;

  const st = await _io.loadPayloadStamped(args.ajilOid);
  const pl = st?.p ?? null;
  if (!pl) return { ok: false, error: tr('Илгээлтийн агуулга уншигдсангүй — батлах боломжгүй. Буцаавал нэмэгч дахин илгээнэ.') };
  if (args.stamp && st && st.stamp !== args.stamp)
    return { ok: false, error: tr('Батлах зуур зохиогч агуулгыг өөрчилсөн — юу ч бичсэнгүй. Шинэ агуулгыг харж «Дахин буулгах» дарна уу.') };

  /* Нэвтрэлтгүй горимд `anon` — таб нь ялгана (`AJIL_CLAIM_MARK`) */
  const claimer = (currentUser() ?? '').trim().toLowerCase() || 'anon';
  const claimErr = await _io.claimApply(args.ajilOid, claimer);
  if (claimErr) {
    const again = await _io.loadHead(args.ajilOid).catch(() => null);
    if (again?.status === AJIL_STATUS.applied) return { ok: true, already: true, added: 0, ...(warn ? { warn } : {}) };
    return { ok: false, error: claimErr };
  }
  let done = false;
  try {
    /* A.4–A.10б — жааз (2026-10-01: `writeFrameLive`-д тусгаарлав, дараалал ижил) */
    const w = await _io.writeFrame(head.pkgKey, pl.adds);
    if (!w.ok) return w;

    /* A.11 — зөвхөн амжилтын дараа. */
    let other: string | null;
    try {
      other = await _io.claimOther(args.ajilOid, claimer);
    } catch (e) {
      other = String((e as Error)?.message ?? e);
    }
    if (other) {
      return { ok: false, error: tr('Мөрүүд бичигдсэн, гэвч «буулгасан» тэмдэглэгээ хадгалагдсангүй: {0} — «Дахин буулгах» дарвал давхар бичихгүй, зөвхөн тэмдэглэнэ.', other) };
    }
    const m = await _io.markApplied(args.ajilOid);
    done = m.ok;
    if (w.added === 0)
      return m.ok ? { ok: true, already: true, added: 0, ...(warn ? { warn } : {}) } : { ok: false, error: m.error ?? tr('Хадгалагдсангүй — холболтоо шалгаад дахин дарна уу. Таны өөрчлөлт хэвээр байна.') };
    if (!m.ok) return { ok: false, error: tr('Мөрүүд бичигдсэн, гэвч «буулгасан» тэмдэглэгээ хадгалагдсангүй: {0} — «Дахин буулгах» дарвал давхар бичихгүй, зөвхөн тэмдэглэнэ.', m.error ?? '') };
    return { ok: true, added: w.added, ...(warn ? { warn } : {}) };
  } finally {
    if (!done) await _io.releaseApply(args.ajilOid, claimer).catch(() => undefined);
  }
}

/**
 * A.4–A.10б — СҮҮЛИЙН ЖААЗ + ШИНЭ МӨР → БҮТЭН ЖААЗ БИЧИХ (2026-10-01: `materializeInner`-
 * ээс тусгаарлав; алхам, шалгалт, мессеж ӨӨРЧЛӨГДӨӨГҮЙ).
 */
async function writeFrameLive(pkgKey: string, adds: readonly NewRow[]): Promise<FrameWrite> {
  const { PKGS, fillSchema } = await import('@/modules/sheet/bagts.pkg');
  const pkg = PKGS.find((p) => p.key === pkgKey);
  if (!pkg) return { ok: false, error: tr('Илгээлтийн багц олдсонгүй: {0}', pkgKey) };
  const [{ loadRows, applyAdds, applyDeletes, dayFilter, msToDay }, { insertAdds, buildFrame }, { agsFetch }] = await Promise.all([
    import('@/modules/sheet/bagtsSheet'),
    import('@/modules/sheet/sheetFrame'),
    import('@/modules/sheet/ags'),
  ]);
  const sc = await fillSchema(pkg);
  const nBld = sc.bld.length;
  const hasObyem = sc.obyem.map((f) => !!f);
  /**
   * ҮЙЛЧИЛГЭЭНИЙ ХАМГИЙН ИХ OBJECTID — уралдааны шалгалтын хэмжүүр.
   */
  const maxOidOf = async (): Promise<number> => {
    const j = await agsFetch(`${pkg.url}/query`, {
      where: '1=1',
      outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: sc.f.oid, outStatisticFieldName: 'mx' }]),
      returnGeometry: 'false',
    });
    const mx = Number(j?.features?.[0]?.attributes?.mx);
    if (!Number.isFinite(mx)) throw new Error(tr('Хүснэгтийн сүүлийн мөрийн дугаар уншигдсангүй'));
    return mx;
  };
  let maxOid0: number;
  try { maxOid0 = await maxOidOf(); } catch (e) {
    return { ok: false, error: tr('Бичихийн өмнөх шалгалт унав: {0}', String((e as Error)?.message ?? e)) };
  }
  const loaded = await loadRows(pkg, sc, undefined, undefined, { strict: true });
  /* A.4 — давхардал хасах */
  const { fresh } = dedupeAdds(loaded.rows, adds);
  /* Бүгд аль хэдийн байна (давхар таб / өмнөх оролдлого бичсэн ч тэмдэглэж
     амжаагүй) — юу ч бичихгүй; дуудагч (A.11) зөвхөн тэмдэглэнэ. */
  if (!fresh.length) return { ok: true, added: 0 };

  /* A.5 — оруулах; эцэг олдоогүй мөр байвал ЗОГСОНО (хагас батлахгүй) */
  const rows = insertAdds(loaded.rows, fresh, sc, nBld);
  const added = rows.length - loaded.rows.length;
  if (added !== fresh.length) {
    const present = new Set(rows.map((r) => r.oid));
    const missing = fresh.filter((a) => !present.has(a.oid)).map((a) => `${a.no} · ${a.work} (${tr('эцэг: {0}', a.parentWork || '—')})`);
    return {
      ok: false,
      code: 'no-parent',
      error: tr('{0} мөрийн эцэг бүлэг хуудсанд олдсонгүй — юу ч бичсэнгүй: {1}', String(missing.length), missing.slice(0, 5).join('; ')),
    };
  }

  /* A.6 — өдөр */
  const fillMs = fillMsFor(Date.now(), loaded.snapshot);

  /* A.7 — жааз; сарын задаргаанаас төлөвлөгөөт хувь (`hyanaltStore`-той ижил closure) */
  const { loadPkgPlan, planPctFromMonths } = await import('@/lib/huvaariObyem');
  let obPlan: Awaited<ReturnType<typeof loadPkgPlan>>['plan'] | null = null;
  try { obPlan = (await loadPkgPlan(pkg.key)).plan; } catch { obPlan = null; }
  const asOf = loaded.asOf;
  let frame: Record<string, unknown>[];
  try {
    frame = buildFrame(rows, sc, nBld, asOf, hasObyem, fillMs, {}, {}, (row, b) => {
      if (!obPlan || row.des == null || asOf == null) return null;
      const blok = sc.bld[b];
      const m = blok ? obPlan.get(row.des)?.get(blok) : undefined;
      return m ? planPctFromMonths(m, asOf, { start: row.start[b] ?? null, end: row.end[b] ?? null }) : null;
    });
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }

  /* A.7б — 2026-10-09 (ДАХИН ЗАССАН): ХООСОН МӨРӨӨР НӨХӨХГҮЙ. Өмнөх засвар жаазыг `rawFrameLen` хүртэл
     хоосон мөрөөр сунгадаг байв — тэгвэл тухайн өдрийн ДАРААГИЙН (хоосон мөргүй, `hyanaltStore`-ийн) жааз
     манайхаас БОГИНО харагдаж `lastFrame` түүнийг «тасарсан» гэж алгасна. `bagtsSheet.lastFrame` одоо
     ХООСОН БИШ мөрийн тоогоор харьцуулдаг тул хоосон мөр шаардлагагүй. Үлдэх хамгаалалт: шинэ жааз
     ачаалсан жаазын хоосон бус мөрийн тооноос (`loaded.frameLen`) богино бол ЮУ Ч бичихгүй. */
  if (frame.length < loaded.frameLen) {
    return { ok: false, error: tr('Шинэ жааз ачаалсан жаазаас богино ({0} < {1} мөр) — юу ч бичсэнгүй, дахин оролдоно уу.', String(frame.length), String(loaded.frameLen)) };
  }

  /* A.8 — уралдаа: ачаалснаас хойш үйлчилгээний MAX OID өссөн бол (шинэ жааз
     орсон — өөр батлалт, гүйцэтгэлийн батлалт) бичихгүй. */
  try {
    const now = await loadRows(pkg, sc);
    if (!sameFrame(loaded, now))
      return { ok: false, error: tr('Ачаалснаас хойш хуудасны мөрүүд засагдлаа (хуваарь зэрэг хадгалагдсан) — юу ч бичсэнгүй, дахин оролдоно уу.') };
    const mx = await maxOidOf();
    if (mx > maxOid0)
      return { ok: false, error: tr('Ачаалснаас хойш хуудсанд шинэ мөр орлоо (өөр батлалт зэрэг явсан) — юу ч бичсэнгүй, дахин оролдоно уу.') };
  } catch (e) {
    return { ok: false, error: tr('Бичихийн өмнөх шалгалт унав: {0}', String((e as Error)?.message ?? e)) };
  }

  /* A.8б — 2026-10-09: ХУВААРЬ/ОБЬЁМЫН ХААЛТЫГ ДАХИН (`busyGate`, `applyAdds`-ийн ЯГ ӨМНӨ). Хуваарийн
     батлагчийн бичилт (`applyUpdates`) нь бичсэний ДАРАА жаазыг шалгадаггүй тул A.8а-гийн `sameFrame`-ээс
     хойш түгжиж бичиж эхэлбэл манай шинэ жааз түүний OID-уудыг архивт үлдээнэ. Эхний шалгалт ачааллаас
     хэдэн секундын өмнө байсан — завсрыг хамгийн бага болгоно (тэг биш: серверт транзакц байхгүй). */
  const gate2 = await busyGate(pkgKey);
  if ('error' in gate2) return { ok: false, error: gate2.error };

  /* A.9 — бичих; унавал хагас жаазыг буцаах */
  const written: number[] = [];
  try {
    await applyAdds(pkg, frame, written);
  } catch (e) {
    const why = String((e as Error)?.message ?? e);
    const ex = e as { lost?: unknown; cause?: unknown } | null;
    const lost = ex?.lost === true || isLostWrite(e) || isLostWrite(ex?.cause);
    if (lost) {
      const head = tr('Бичилтийн хариу алдагдсан — үр дүн тодорхойгүй');
      const strays = new Set<number>(written);
      const found: { o: number; no: string; work: string }[] = [];
      try {
        for (let offset = 0; ; ) {
          const j = await agsFetch(`${pkg.url}/query`, {
            where: sc.f.fillDate ? `${sc.f.oid} > ${maxOid0} AND ${dayFilter(sc.f.fillDate, msToDay(fillMs))}` : `${sc.f.oid} > ${maxOid0}`,
            outFields: [sc.f.oid, sc.f.no, sc.f.work].join(','),
            orderByFields: `${sc.f.oid} ASC`,
            resultRecordCount: '2000',
            resultOffset: String(offset),
            returnGeometry: 'false',
          });
          const fs = (j?.features ?? []) as { attributes: Record<string, unknown> }[];
          for (const f of fs) {
            const o = Number(f.attributes?.[sc.f.oid]);
            if (Number.isInteger(o) && o > maxOid0) {
              strays.add(o);
              found.push({ o, no: String(f.attributes?.[sc.f.no] ?? '').trim(), work: String(f.attributes?.[sc.f.work] ?? '').trim() });
            }
          }
          if (!j?.exceededTransferLimit || fs.length === 0) break;
          offset += fs.length;
        }
      } catch (qe) {
        if (written.length) await applyDeletes(pkg, written);
        console.warn('[selbe] ajilApply: архивын шалгалт унав — ', qe);
        return { ok: false, error: `${why} · ${head} · ${tr('Архивт үлдсэн мөрийг шалгаж чадсангүй ({0}) — админд мэдэгдэнэ үү (гараар шалгаж цэвэрлэх шаардлагатай).', String((qe as Error)?.message ?? qe))}` };
      }
      if (!strays.size) return { ok: false, error: `${why} · ${head}` };
      const ours = found.length > 0 && found.length <= frame.length && found.every((f, i) =>
        f.no === String(frame[i]?.[sc.f.no] ?? '').trim() && f.work === String(frame[i]?.[sc.f.work] ?? '').trim());
      if (!ours) {
        const gone0 = written.length ? await applyDeletes(pkg, written) : 0;
        const msg = tr('Архивт {0} мөр ({1}) олдсон боловч энэ батлалтынх ({2} мөр) мөн эсэх нь батлагдсангүй — устгасангүй; админд мэдэгдэнэ үү (гараар шалгаж цэвэрлэх шаардлагатай).', String(found.length), sc.f.fillDate ? msToDay(fillMs) : '—', String(frame.length));
        console.warn('[selbe] ajilApply: хариу алдагдсан бичилтийн цэвэрлэгээ — ', msg, { maxOid0, found: found.length, frame: frame.length });
        return {
          ok: false,
          error: `${why} · ${head} · ${msg}${written.length ? ` · ${tr('Баталгаажсан {0} мөрийн {1}-ийг буцаав', String(written.length), String(gone0))}` : ''}`,
        };
      }
      const gone = await applyDeletes(pkg, [...strays]);
      const left = strays.size - gone;
      return {
        ok: false,
        error: `${why} · ${head} · ${left > 0
          ? tr('Хагас бичигдсэн {0} мөрийн {1}-ийг архиваас устгаж чадсангүй — админд мэдэгдэнэ үү (гараар цэвэрлэх шаардлагатай).', strays.size, left)
          : tr('Хагас бичигдсэн {0} мөрийг архиваас буцаав', strays.size)}`,
      };
    }
    if (written.length) {
      const gone = await applyDeletes(pkg, written);
      const left = written.length - gone;
      return {
        ok: false,
        error: left > 0
          ? `${why} · ${tr('Хагас бичигдсэн {0} мөрийн {1}-ийг архиваас устгаж чадсангүй — админд мэдэгдэнэ үү (гараар цэвэрлэх шаардлагатай).', written.length, left)}`
          : `${why} · ${tr('Хагас бичигдсэн {0} мөрийг архиваас буцаав', written.length)}`,
      };
    }
    return { ok: false, error: why };
  }

  const undoWritten = async (why: string): Promise<FrameWrite> => {
    const gone = await applyDeletes(pkg, written);
    const left = written.length - gone;
    return {
      ok: false,
      error: left > 0
        ? `${why} · ${tr('Бичсэн {0} мөрийн {1}-ийг архиваас устгаж чадсангүй — админд мэдэгдэнэ үү (гараар цэвэрлэх шаардлагатай).', written.length, left)}`
        : `${why} · ${tr('Бичсэн {0} мөрийг архиваас буцааж устгав', written.length)}`,
    };
  };

  /* A.10 — дахин уншиж мөр бүр байгааг батална; үгүй бол `approved` хэвээр (дахин оролдоно) */
  try {
    const again = await loadRows(pkg, sc);
    const lost = fresh.filter((a) => !addPresent(again.rows, a));
    if (lost.length)
      return await undoWritten(tr('Бичсэний дараа {0} мөр хуудсанд олдсонгүй — төлөв «батлагдсан» хэвээр, дахин оролдоно уу.', String(lost.length)));
  } catch (e) {
    return { ok: false, error: tr('Бичсэний дараах шалгалт унав: {0} — төлөв «батлагдсан» хэвээр, дахин оролдоно уу.', String((e as Error)?.message ?? e)) };
  }

  /* A.10б — ХОЁР БАТЛАГЧ зэрэг бичсэн бол (2026-09-24 аудит #4): бидний
     бичсэнээс хойш үйлчилгээнд ШИНЭ мөр орсон бол манай жааз булагдсан байж
     болно — `applied` гэж тэмдэглэхгүй, `approved` хэвээр (дахин оролдоно;
     `dedupeAdds` давхар бичихээс хамгаална). */
  try {
    const mx = await maxOidOf();
    const mine = written.reduce((a, b) => (b > a ? b : a), 0);
    if (mx > mine)
      return await undoWritten(tr('Бичсэний дараа хуудсанд өөр жааз орлоо (зэрэгцээ батлалт) — төлөв «батлагдсан» хэвээр, дахин оролдоно уу.'));
  } catch (e) {
    return { ok: false, error: tr('Бичсэний дараах шалгалт унав: {0} — төлөв «батлагдсан» хэвээр, дахин оролдоно уу.', String((e as Error)?.message ?? e)) };
  }

  /* A.11 — `markApplied` нь дуудагчид (`materializeInner`) */
  return { ok: true, added };
}
