'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fixCyr } from "@/lib/format";
import { serverNow, syncServerClock } from '@/lib/serverClock';
import { dayTagOf, needsRegistration, submitForReview } from '@/lib/hyanaltSubmit';
import { loadPkgPlan, planPctFromMonths, type PkgPlan } from '@/lib/huvaariObyem';
import {
  computeAll,
  dayToMs,
  incCell,
  parentIndexes,
  parseInc,
  loadRows,
  msToDay,
  type SheetRow,
} from "./bagtsSheet";
import {
  fillSchema,
  pkgFloors,
  PKG_GROUPS,
  PKGS,
  type Pkg,
  type Schema,
} from "./bagts.pkg";
import {
  buildOidMap,
  mapOldOids,
  moveKeys,
  overlaySubmission,
  rowKeyOf,
  rowOccOf,
  withFrameOcc,
  needsFrameOcc,
  describeNegFixes,
  negTotalAt,
} from "./sheetFrame";
import {
  mergeSubmission,
  markFresh,
  resolveMark,
  findNonce,
  readActiveSubmission,
  readSubmissionByOid,
  saveSubmission,
  type StagedSubmission,
  type SubmissionPayload,
} from "@/lib/submission";
import { OWNER, STATUS, F as HF } from "@/lib/hyanalt";
import { STAGE_LABEL } from "@/lib/hyanaltGroup";
import { parseOkCells, resolveOk, rowSids } from "@/lib/hyanaltOkCells";
import { useAuth } from "@/components/AuthGate";
import { bagtsFor, bagtsScope, isViewOnly, stageOfUser, subscribeAcl } from "@/lib/guitsetgelAcl";
import { roleForUser } from "@/lib/services";
import { roleOf } from "@/lib/permissions";
import { hasCap, subscribeCaps } from "@/lib/caps";
import { obyemScope, subscribeObyemAcl } from '@/lib/obyemAcl';
import { userError } from '@/components/ui';
import { askConfirm } from '@/lib/confirm';
import { seriesBands } from "./bagts.bands";
import { sheetDates } from "./sheetRows";
import { useColWidths } from "./colWidths";
import { t as tr } from "@/lib/i18nCore";
import { useSyncRef } from "@/lib/useSyncRef";
import st from "./sheet.module.css";
import {
  REMOTE_RETRY_MS,
  /* 2026-10-04 аудит — илгээлтийн баримт · явж буй илгээлт (#1 · #3 · #4) */
  readDraft, rebaseSent, readInflight, saveInflight, clearInflight, newNonce, type Inflight,
} from "./fill/draft";
import { setNavDirty } from "@/lib/navGuard";
import {
  RO, cls, dt, nowFillMs, describeUnmoved, changedKeys, changedDateKeys, type EditCol, type PickState, type SheetView,
} from "./fill/util";
import { useNotice } from "./fill/useNotice";
import { useWideMode } from "./fill/useWideMode";
import { useFlow, useReviewInc } from "./fill/useFlow";
import { useObyem, useObyemState } from "./fill/useObyem";
import { useAddedOids, usePkgPct, useRowFilter, useVirtualWindow } from "./fill/useRows";
import { useCellEdit, type PastePrev } from "./fill/useCellEdit";
import { useDraftSync, type DraftSync } from "./fill/useDraftSync";
import { DraftStatus, FilterBar, ObyemToolbar, Participants, PkgPctBadge, SubmitControls } from "./fill/toolbar";
import { FillNotices, NoticeToast, StickyNotice } from "./fill/notices";
import { SheetHead } from "./fill/SheetHead";
import { FillRows } from "./fill/FillRows";
import { fullExtraCols, extraPrefKey, readExtraPref, writeExtraPref } from "./fill/extraCols";
import { FillDatePicker } from "./fill/FillDatePicker";
import { downloadFillXlsx } from "./fill/sheetXlsx";

/* `SheetView` — `Sheet.tsx` энэ файлаас импортолдог (2026-09-30: `fill/util`-д зөөгдсөн, re-export) */
export type { SheetView } from "./fill/util";

/**
 * ХУУЧИН ИЛГЭЭЛТИЙН ДАВТАМЖИЙГ СУУРЬ ЖААЗААС НӨХНӨ (2026-10-04 дахин аудит, #1, HIGH —
 * `sheetFrame.withFrameOcc`). `rowOcc`-гүй, өмнөх жааз дээрх илгээлт урьд нь ачаалах
 * overlay-д `unmoved`, дахин илгээхэд (`movePayload`) `stale` болж МӨНХӨД гацдаг байв.
 */
/**
 * ХАРИУ ТАСАРСАН ИЛГЭЭЛТИЙН ТҮЛХҮҮРҮҮД ОДООГИЙН ЖААЗАД (2026-10-04 дахин аудит, #5): `inf.sent` + жааз
 * солигдсон бол тэдгээрийн шинэ түлхүүр (мөрийн танигч `inf.rk`/`inf.occ`-оор — `mapOldOids`). Урьд нь
 * илгээх агшны хуудасны түлхүүрээр л баримт тавьдаг тул шинэ жааз дээрх хуулбар (`pending`, `landMoved`)
 * олдохгүй, илгээгдсэн нүд ДАХИН илгээгдэх байв. Тулгаж чадаагүй (хоёрдмол) түлхүүр хуучнаараа л үлдэнэ.
 */
const myNonces = new Set<string>();
const INFLIGHT_STALE_MS = 2 * 60_000;
const RESTORE_SLOW_MS = 45_000;
const mayClearInflight = (inf: Inflight): boolean =>
  myNonces.has(inf.nonce) || Date.now() - inf.at > INFLIGHT_STALE_MS;

function inflightKeys(inf: Inflight, rows: readonly SheetRow[]): [string, string, number][] {
  const out: [string, string, number][] = [...inf.sent];
  if (!inf.rk?.length) return out;
  const cur = new Set(rows.map((r) => r.oid));
  const off = inf.rk.filter(([o]) => o >= 0 && !cur.has(o));
  if (!off.length) return out;
  const mm = mapOldOids(off, rows, inf.occ);
  const have = new Set(out.map(([k]) => k));
  for (const [k, v, sa] of inf.sent) {
    const c = k.indexOf(':');
    const to = c > 0 ? mm.map.get(Number(k.slice(0, c))) : undefined;
    if (to == null) continue;
    const k2 = `${to}${k.slice(c)}`;
    if (!have.has(k2)) { have.add(k2); out.push([k2, v, sa]); }
  }
  return out;
}

async function ensureFrameOcc(pkg: Pkg, sc: Schema, p: SubmissionPayload, curRows: readonly SheetRow[]): Promise<SubmissionPayload> {
  if (p.base == null || !needsFrameOcc(p, curRows)) return p;
  try {
    return withFrameOcc(p, (await loadRows(pkg, sc, msToDay(p.base))).rows);
  } catch {
    return p;
  }
}

// «Гүйцэтгэл шинэ» — багцуудын `*_final_publish` хуудас excel-ийнхээ бүх
// баганаар. Дизайн нь «Гүйцэтгэл бөглөх»-тэй нэг (`.xl` хүснэгт, царцсан
// толгой, давхаргын товч, ногоон «нийтлээгүй» нүд).
//
// «Гүйцэтгэл бөглөх»-өөс ялгаатай нь: тэнд нүд бүр = тусдаа feature, энд МӨР
// бүр = нэг feature бөгөөд блокууд нь түүний талбарууд. Тиймээс засвар нь шинэ
// мөр үүсгэдэггүй, зөвхөн талбар шинэчилдэг (applyEdits/updates).
//
// Багц бүрийн блокийн тоо (4…22) ба талбарын нэрс ӨӨР тул аль нь ч энд хатуу
// бичигдээгүй — `bagts.pkg.ts → loadSchema` үйлчилгээнээс нь таьж авна.
//
// Харагдаж буй тоонууд нь ХАДГАЛАГДСАН утга биш, excel-ийн томъёогоор ЭНД
// бодогдсон утгууд (`bagtsSheet.ts` → computeAll). Publish хийхэд эвдэрсэн
// бүлгийн нийлбэрүүд (#REF!) орж ирсэн тул хадгалагдсаныг харуулах боломжгүй.

/**
 * «ЗАСААД ДАХИН ИЛГЭЭХ»-ИЙН НЭЭХ ХҮСЭЛТ (`Guitsetgel.goFix`).
 */
export type FillOpenRequest = { bagts: string; ajil: string; sheetOid: number | null };
let openReq: FillOpenRequest | null = null;
export function requestFillOpen(r: FillOpenRequest): void { openReq = r; }
/**
 * Хүсэлтийн хуудас — `flow`-ийн тулгалттай ИЖИЛ дүрэм (`pkg.name` нь `Ажлын_нэр`-д).
 */
function pkgOfReq(r: FillOpenRequest): { pkg: Pkg; guess: boolean } | null {
  const cand = PKGS.filter((p) => p.group === r.bagts);
  const hit = cand.find((p) => r.ajil.includes(p.name));
  if (hit) return { pkg: hit, guess: false };
  return cand[0] ? { pkg: cand[0], guess: cand.length > 1 } : null;
}

const fillWidthKeep = (col: string) => !/^[apse]\d+$/.test(col);
const FILL_W_FALLBACK = { key: "fillnew", keep: fillWidthKeep };

/**
 * СОНГОСОН БАГЦЫГ САНАНА (2026-10-23, UX аудит F5) — таб солих (компонент unmount) ба F5-д эхний багц руу
 *    үсэрдэг байв. `sessionStorage` — зөвхөн энэ табд, хөтөч хаахад арилна (өөр хүн/таб нөлөөлөхгүй). Хадгалсан
 *    түлхүүр одоо байхгүй/эрхээс гадуур бол эхний зөвшөөрөгдсөн багц руу өөрөө шилжинэ (`groupOpts`).
 *    Хувийн горим/хаалттай сан — ШИДДЭГ тул try/catch (`AuthGate`).
 */
const PKG_SS = 'selbe.fillnew.pkg';
function readPkgSS(): Pkg | undefined {
  try {
    const k = typeof window !== 'undefined' ? window.sessionStorage.getItem(PKG_SS) : null;
    return k ? PKGS.find((p) => p.key === k) : undefined;
  } catch { return undefined; }
}
function writePkgSS(key: string): void {
  try { window.sessionStorage.setItem(PKG_SS, key); } catch { /* хаалттай сан — санахгүй */ }
}

/** Хуваарийн задаргаа хараахан уншигдаагүй/өөр багцынх бол — ХООСОН (`useAddedOids`-тай ижил хэв маяг) */
const NO_PLAN: PkgPlan = new Map();

export default function FillNew({ view }: { view?: SheetView } = {}) {
  /** Засагдахгүй (хяналтын) горим уу — бүх бичих зам үүгээр хаагдана. */
  const locked = !!view;

  const wrapRef = useRef<HTMLDivElement>(null);
  /**
   * Нээлттэй нүдний ref — polling мөчлөг «одоо бичиж байна уу» гэдгийг
   * ЭНДЭЭС уншина.
   */
  const editRef = useRef<unknown>(null);
  /** Нээлттэй календарын толь — `editRef`-тэй ижил зорилго (Escape, 2026-09-24) */
  const pickRef = useRef<unknown>(null);
  const { wide, setWide, editing, setEditing } = useWideMode({ editRef, pickRef });
  /** Энэ таб яг одоо нуугдсан уу (`display: none` → хайрцаг нэг ч байхгүй).
   */
  const hiddenNow = () => !wrapRef.current?.getClientRects().length;
  /** «Засаад дахин илгээх»-ийн хүсэлт (`requestFillOpen`, 2026-09-30) */
  const [fixReq, setFixReq] = useState<{ pkgKey: string; soid: number | null; guess?: boolean } | null>(() => {
    if (view || !openReq) return null;
    const p = pkgOfReq(openReq);
    return p ? { pkgKey: p.pkg.key, soid: openReq.sheetOid, ...(p.guess && openReq.sheetOid != null ? { guess: true } : {}) } : null;
  });
  useEffect(() => { openReq = null; }, []);
  const [pkg, setPkg] = useState<Pkg>(
    () => (view && PKGS.find((p) => p.key === view.pkgKey))
      || (fixReq && PKGS.find((p) => p.key === fixReq.pkgKey))
      || (!view && readPkgSS())
      || PKGS[0],
  ); // Багц 1 · 9F — жагсаалтын эхнийх
  useEffect(() => { if (!view) writePkgSS(pkg.key); }, [view, pkg.key]);
  useEffect(() => {
    if (!fixReq?.guess || fixReq.soid == null) return;
    let alive = true;
    const soid = fixReq.soid;
    const guessed = fixReq.pkgKey;
    void readSubmissionByOid(soid).then((rr) => {
      if (!alive) return;
      const key = rr.ok && rr.sub ? rr.sub.payload.pkgKey : null;
      const p = key ? PKGS.find((x) => x.key === key) : undefined;
      setFixReq((cur) => (cur && cur.guess && cur.soid === soid ? { pkgKey: p ? p.key : cur.pkgKey, soid } : cur));
      if (p && p.key !== guessed) setPkg(p);
    });
    return () => { alive = false; };
  }, [fixReq]);
  const [sc, setSc] = useState<Schema | null>(null);
  /** Тайлангийн огноонууд — «Гүйцэтгэл бөглөх» табтай НЭГ эх сурвалжаас. */
  const [dates, setDates] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [asOf, setAsOf] = useState<number | null>(null);
  const [asOfOrig, setAsOfOrig] = useState<number | null>(null);
  /** Ачаалсан агшны БӨГЛӨСӨН ӨДӨР (`buglusun_ognoo`) — өнөөдрийнх үү гэж шалгана. */
  const [snapDay, setSnapDay] = useState<string>("");
  /** Ачаалсан агшны бөглөсөн өдөр (ms) — дахин илгээхэд хэрэгтэй */
  const [snapMs, setSnapMs] = useState<number | null>(null);
  /**
   * ӨДӨРТ НЭГ УДАА — илгээсэн бол дахин бөглөхгүй.
   */
  /**
   * БАГЦЫН ХУВААРИЛАЛТ — эрхийн панелаас.
   */
  const { user, status: authStatus } = useAuth();
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeAcl(() => setAclN((n) => n + 1)), []);
  /* Нэмэлт эрх ArcGIS-аас шинэчлэгдэхэд «+» товч шууд гарч/алга болно */
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((n) => n + 1)), []);
  /* Инженерийн обьёмын хуваарилалт ӨӨР хадгалалттай — тусад нь захиална */
  const [obN, setObN] = useState(0);
  useEffect(() => subscribeObyemAcl(() => setObN((n) => n + 1)), []);
  /**
   * БӨГЛӨХ БОЛОМЖТОЙ БАГЦУУД.
   */
  const unrestricted = authStatus === "off" || roleForUser(user?.username) === "super";
  const isZahiral = useMemo(
    () => !unrestricted && roleOf(user?.username) === "zahiral",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, unrestricted, aclN],
  );
  const myBagts = useMemo(() => {
    if (unrestricted || isZahiral) return null;
    const flowSc = bagtsScope(user?.username);
    if (flowSc === null) return null;
    const out = new Set(flowSc);
    for (const [cap, role] of [['obyemEdit', 'editor'], ['obyemApprove', 'approver']] as const) {
      if (!hasCap(user?.username, cap)) continue;
      const sc = obyemScope(user?.username, role);
      if (sc === null) return null;
      sc.forEach((g) => out.add(g));
    }
    return [...out];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, unrestricted, isZahiral, aclN, obN, capN]);
  const groupOpts = useMemo(
    () => (myBagts ? PKG_GROUPS.filter((g) => myBagts.includes(g)) : PKG_GROUPS),
    [myBagts],
  );

  if (!view && !groupOpts.includes(pkg.group)) {
    const first = PKGS.find((p) => p.group === groupOpts[0]);
    if (first) setPkg(first);
  }

  /**
   * ЭНЭ БАГЦЫН ИДЭВХТЭЙ ИЛГЭЭЛТ (`sub|<pkgKey>`) — ачаалахад уншигдана.
   */
  const [staged, setStaged] = useState<StagedSubmission | null>(null);
  const {
    hyRows, hyLoading, hyErr, reloadHy,
    todayFillMs, setTodayFillMs, flow, otherDaysInReview, otherDaysReturned, reviewLock: reviewLockSt,
    resumedOid, setResumedOid, returnedStaged, returnInfo, reviewStage, inReview, flowRef, today, reviewSoidsKey,
  } = useFlow({ pkg, view, stagedOid: staged?.oid ?? null });
  /**
   * Засах эрхгүй — харах л боломжтой.
   *
   *    Урьд нь `locked || (sentToday && !returned)` байв: тухайн өдөр агшин
   *    үүсмэгц хуудас БҮРМӨСӨН хаагдаж, өглөө бөглөсөн гүйцэтгэлээ үдээс хойш
   *    засах ямар ч зам үлдэхгүй — зөвхөн хянагч буцаавал л нээгддэг байлаа.
   */
  const noEdit = locked;
  /**
   * ГҮЙЦЭТГЭЛ (обьём, огноо, «шинэчлэгдсэн огноо») БӨГЛӨХ ЭРХ — зөвхөн ЭНЭ багцад
   * `company` шатанд томилогдсон гүйцэтгэгч (эсвэл админ).
   */
  const viewOnlyAcl = useMemo(
    () => !unrestricted && isViewOnly(user?.username),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, unrestricted, aclN],
  );
  const fixingReturned = !view && (returnedStaged
    || (resumedOid != null && otherDaysReturned.some((x) => x.soid === resumedOid)));
  const reviewLockDays = useMemo(
    () => (view || fixingReturned ? [] : reviewLockSt.days),
    [view, fixingReturned, reviewLockSt],
  );
  const reviewLock = reviewLockDays.length > 0;
  const permPerf = useMemo(() => {
    if (unrestricted) return true;
    if (viewOnlyAcl) return false;
    if (isZahiral) return false;
    const cb = bagtsFor(user?.username, "company");
    return cb === null || cb.includes(pkg.group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, unrestricted, viewOnlyAcl, isZahiral, aclN, pkg.group]);
  const canPerf = permPerf && !reviewLock;
  const reviewerOnly = useMemo(() => {
    if (unrestricted) return false;
    const st = stageOfUser(user?.username);
    return st != null && st !== "company";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, unrestricted, aclN]);
  /** Бөглөх эрхгүй шалтгаан — батлагч › «зөвхөн харна» › томилгоогүй (мөр нэмэх эрхтэй ч) › хориг (`reviewLock`) */
  const noPerfWhy = isZahiral ? RO.zahiralView
    : reviewerOnly ? RO.reviewerView
    : viewOnlyAcl ? RO.perfViewOnly
    : !permPerf ? null
    : reviewLock ? RO.reviewLock(reviewLockDays.join(', ')) : null;
  /**
   * Гүйцэтгэлийн нүд засагдахгүй: хуудас түгжээтэй, гүйцэтгэгч биш, ЭСВЭЛ
   * ЗАСВАРЫН горим нээгдээгүй.
   */
  const noPerf = noEdit || !canPerf || !editing;

  /* ══════════ ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ (2026-09-08) ══════════
   */
  const canObyemEdit = useMemo(() => {
    if (unrestricted) return true;
    if (!hasCap(user?.username, 'obyemEdit')) return false;
    const sc0 = obyemScope(user?.username, 'editor');
    return sc0 === null || sc0.includes(pkg.group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, unrestricted, obN, capN, pkg.group]);

  const canObyemApprove = useMemo(() => {
    if (unrestricted) return true;
    if (!hasCap(user?.username, 'obyemApprove')) return false;
    const sc0 = obyemScope(user?.username, 'approver');
    return sc0 === null || sc0.includes(pkg.group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, unrestricted, obN, capN, pkg.group]);



  /**
   * ХЯНАЛТАД ИЛГЭЭЛТ УНАСАН уу — ЗӨВХӨН ЭНЭ СЕШНИЙ нийтлэлээс.
   *
   * Урьд нь «өнчин агшин» нь ӨГӨГДЛИЙН харьцуулалтаар тодорхойлогддог байв:
   * «өнөөдрийн агшин архивт байгаа атал хяналтын бүртгэлд алга бол өнчин».
   * Хяналтын бүртгэлийг цэвэрлээд (ашиглалт шинээр эхлэх) архивын хуучин
   * агшнууд үлдэхэд тэр шалгуур БҮХ багцад ҮНЭН болж, «Өнөөдрийн гүйцэтгэл
   * нийтлэгдсэн ч хяналтад ИЛГЭЭГДЭЭГҮЙ» гэсэн шар анхааруулга мөнхөд
   * гацаж, хуудас нь бас түгжээтэй байсан тул гарц үлдээгүй.
   *
   * Илгээлт унасан эсэхийг ЯГ мэддэг цорын ганц газар нь нийтлэлийн зам
   * (`submitForReview`-ийн хариу). Тиймээс анхааруулгыг тэндээс л асаана —
   * архивт үлдсэн хуучин өгөгдөл дэлгэц дээр худал сэрэмжлүүлэг үүсгэхээ
   * болино. Түгжээ хасагдсан тул унасан үед хэрэглэгч зүгээр дахин
   * «Нийтлэх» дарж болно.
   */
  const [submitFailed, setSubmitFailed] = useState(false);
  const [resending, setResending] = useState(false);
  /* (`staged` — `useFlow`-оос дээр зарлагдсан, 2026-10-09 аудит №6) */
  /**
   * ХАДГАЛАГДСАН ч ХЯНАЛТЫН БҮРТГЭЛ ҮҮСЭЭГҮЙ илгээлтийн мөрийн дугаар ба өдөр.
   */
  const [stagedOid, setStagedOid] = useState<number | null>(null);
  const [stagedFillMs, setStagedFillMs] = useState<number | null>(null);
  /**
   * ИЛГЭЭСЭН АТЛАА МӨРӨНД ТУЛГАГДААГҮЙ НҮДНҮҮД (`overlaySubmission.unmovedKeys`).
   */
  const [unmovedWarn, setUnmovedWarn] = useState<string[]>([]);
  /**
   * ЭНЭ СЕШНД ХЯНАЛТАД АМЖИЛТТАЙ БҮРТГЭГДСЭН илгээлтийн мөрийн дугаарууд.
   */
  const registeredRef = useRef<Set<number>>(new Set());
  const resend = async () => {
    if (resending || stagedOid == null || stagedFillMs == null) return;
    if (reviewerOnly || !permPerf) { setErr(noPerfWhy ?? RO.noPerf); return; }
    setResending(true);
    const rv = await submitForReview(pkg.group, stagedFillMs, stagedOid, pkg.name);
    setResending(false);
    if (rv.ok) {
      registeredRef.current.add(stagedOid);
      setSubmitFailed(false);
      reloadHy();
      setBackChg(new Set());
      setResumedOid(null);
      done(rv.reused ? tr('Энэ илгээлт хяналтад аль хэдийн бүртгэгдсэн байна') : tr('Хяналтад илгээв ({0})', rv.id));
    }
    else setErr(rv.error);
  };

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /** Обьёмын баганагүй блокийн тайлбарыг НЭГ Л УДАА хэлнэ (чимээ болгохгүй) */
  const pctHintRef = useRef(false);

  /**
   * Нээлттэй засварын нүд. `col` нь АЛЬ БАГАНА гэдгийг заана — обьёмгүй
   * мөрд обьём ба хувь ХОЁУЛАА засагддаг тул мөр+блок ганцаараа хүрэлцэхгүй.
   */
  const [edit, setEdit] = useState<{
    i: number;
    b: number;
    col: EditCol;
  } | null>(null);

  /**
   * БӨГЛӨХ ГОРИМ — ОБЬЁМ эсвэл ХУВЬ (2026-09-06, хэрэглэгчийн хүсэлт).
   */
  const fillMode = "obyem" as "obyem" | "pct";
  // Нийтлээгүй засварууд, `${oid}:${barilgaIndex}` түлхүүрээр. Утга нь хувь
  // ("" = хоосон болгох). Зөвхөн «Нийтлэх» дархад үйлчилгээнд бичигдэнэ.
  const [pending, setPending] = useState<Record<string, string>>({});
  // Огнооны нийтлээгүй засвар, `${oid}:${blok}:s|e` түлхүүрээр («s» = эхлэх,
  // «e» = дуусах). Утга нь «YYYY-MM-DD», "" = огноог арилгах.
  const [pendDate, setPendDate] = useState<Record<string, string>>({});

  /**
   * Нээлттэй оролтын DOM зангуу. Бичих үед React-ийн төлөв ХӨДӨЛӨХГҮЙ —
   * утгыг зөвхөн commit (blur/Enter/Ctrl+S) үед эндээс уншина.
   */
  const inputRef = useRef<HTMLInputElement>(null);
  /** Оролт нээгдэхэд тавих АНХНЫ утга (цаашид ref өөрөө хөтөлнө). */
  const [val, setVal] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  /**
   * Бүлгийн ХОЁР ШАТЛАЛТ шүүлтүүр (0 = бүгд).
   *   grpA — ЭЦЭГ бүлэг: «Б1 БАРИЛГЫН АЖИЛ», «3 ТӨМӨР БЕТОН РАМЫН АЖИЛ»…
   *   grpB — түүний доторх ДЭД бүлэг: «3.2 1F цутгалт», «3.3 2F цутгалт»…
   * Дэд бүлэг сонгогдвол тэр л муж, эс бөгөөс эцгийн бүтэн муж харагдана.
   */
  const [grpA, setGrpA] = useState<number>(0);
  const [grpB, setGrpB] = useState<number>(0);
  /**
   * ХУВААРИЙН ДАГУУ ШҮҮХ — «Шинэчлэгдсэн огноо»-нд явж байх ЁСТОЙ ажлууд.
   */
  const [byPlan, setByPlan] = useState(true);
  const { style: colStyle, grip, resetAll, resized } = useColWidths(`fillnew.${pkg.key}`, FILL_W_FALLBACK);
  /**
   * «БУСАД ТАЛБАР» (2026-10-09, хэрэглэгч: «table fieldудыг бүгдийг шалгаж бүх баганыг ил гарга») —
   * урьд нь зурагддаггүй мөрийн түвшний талбарууд ЗӨВХӨН УНШИХ төгсгөлийн бүлгээр (`fill/extraCols.ts`).
   */
  const extraKey = extraPrefKey(user?.username);
  const extraSaved = useMemo(() => readExtraPref(extraKey), [extraKey]);
  const [extraSet, setExtraSet] = useState<{ k: string; on: boolean } | null>(null);
  const showExtra = extraSet?.k === extraKey ? extraSet.on : extraSaved;
  const setFullView = useCallback((on: boolean) => {
    setExtraSet({ k: extraKey, on });
    writeExtraPref(extraKey, on);
  }, [extraKey]);

  // ── Crosshair — React state БИШ ──
  // Урьд нь нүд бүрийн mouseenter hover state солиж «Бүгд» горимд ~80k нүдийг
  // бүхэлд нь дахин зурж заагч гацдаг байв. Одоо мөрийг CSS :hover, баганыг
  // `data-bi` нүдэн дээгүүр O(1)-ээр зөөдөг overlay (.colHl) гүйцэтгэнэ.
  const colHlRef = useRef<HTMLDivElement | null>(null);
  const colHlBi = useRef<string | null>(null);
  const moveColHl = (e: React.MouseEvent<HTMLTableElement>) => {
    const hl = colHlRef.current;
    if (!hl) return;
    const td = (e.target as HTMLElement).closest?.(
      "td[data-bi]",
    ) as HTMLElement | null;
    const bi = td?.dataset.bi ?? null;
    if (bi === colHlBi.current) return;
    colHlBi.current = bi;
    if (!td || bi == null) {
      hl.style.display = "none";
      return;
    }
    hl.style.display = "block";
    hl.style.left = `${td.offsetLeft}px`;
    hl.style.width = `${td.offsetWidth}px`;
  };
  const hideColHl = () => {
    colHlBi.current = null;
    if (colHlRef.current) colHlRef.current.style.display = "none";
  };
  /** Нээлттэй календар: аль нүднээс, ямар утгатай, хаана байрлах вэ. */
  const [pick, setPick] = useState<PickState | null>(null);

  const { notice, setNotice, show, say, done, warn, ro, sticky, stick, unstick } = useNotice();
  const stickHere = useCallback((msg: string) => stick(msg, pkg.key), [stick, pkg.key]);
  const noticeRef = useRef(notice);
  useSyncRef(noticeRef, notice);
  const soft = useCallback((msg: string) => {
    const n = noticeRef.current;
    if (n && n.kind !== 'ro') return;
    show('ok', msg);
  }, [show]);

/*
   * Тайлангийн огнооны жагсаалт — нэг л удаа. Алдаа гарвал чимээгүй өнгөрнө:
   * хадгалагдсан огноо нь доор ямар ч тохиолдолд сонголт болж нэмэгддэг.
   */
  useEffect(() => {
    let alive = true;
    sheetDates()
      .then((d) => alive && setDates(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /**
   * ЯГ ОДОО `rows` / `sc` төлөвт СУУСАН багцын түлхүүр.
   */
  const loadedPkgRef = useRef("");
  /**
   * ОДОО СОНГОГДСОН багцын түлхүүр — синхрон. `loadedPkgRef`-ээс ЯЛГААТАЙ:
   *    тэр нь «мөрүүд АЧААЛАГДСАН» гэсэн утгатай (loadRows дуустал `""`).
   *    Мөр ачаалахаас ХАМААРАХГҮЙ асинхрон урсгал (обьёмын илгээлт) энийг
   *    хэрэглэнэ — эс бөгөөс жижиг query нь 1000+ мөрийн хуудаснаас
   *    түрүүлж ирээд `"" !== pkg.key` гэж хаягдана (2026-09-17-ны шалгалт).
   */
  const pkgKeyRef = useRef(pkg.key);
  useSyncRef(pkgKeyRef, pkg.key);
  /**
   * ИЛГЭЭЛТИЙН УНШИЛТ УНАСАН (2026-09-07). `null` = асуудалгүй.
   */
  const [subReadErr, setSubReadErr] = useState<string | null>(null);
  const [frameTrunc, setFrameTrunc] = useState<NonNullable<Awaited<ReturnType<typeof loadRows>>['truncated']> | null>(null);
  /**
   * БУЦААГДСАН ИЛГЭЭЛТИЙН ДАВХАРЛАЛТЫН МЭДЭЭЛЭЛ — `backChg`-тэй ХАМТ тавигдана (2026-10-01).
   * `at` — илгээлтийн агшин (`payload.at`), `remapped` — шинэ жааз руу зөөгдсөн эсэх.
   */
  const [backMeta, setBackMeta] = useState<{ at: number; remapped: boolean } | null>(null);
  const [backChgAll, setBackChg] = useState<Set<string>>(new Set());
  const backOn = !view && !!staged && !staged.done && (returnedStaged || resumedOid === staged.oid);
  const backChg = useMemo(() => (backOn ? backChgAll : new Set<string>()), [backOn, backChgAll]);
  const [backChgDatesAll, setBackChgDates] = useState<Set<string>>(new Set());
  const backChgDates = useMemo(() => (backOn ? backChgDatesAll : new Set<string>()), [backOn, backChgDatesAll]);
  const [ovBase, setOvBase] = useState<Map<number, SheetRow>>(new Map());
  /**
   * ОБЬЁМЫН ТӨЛӨВ — ачаалах эффект багц солиход тэглэдэг тул түүнээс ДЭЭР (2026-10-01,
   * `useObyemState`). Урсгал/эффект нь `useObyem`-д, ХУУЧИН байрлалдаа.
   */
  const obyemSt = useObyemState();
  const { setPvPend, setPvSub, setPvPreview, setPvErr, setPvNote } = obyemSt;
  /**
   * НООРОГИЙН СИНКИЙН ТОЛЬ — ачаалах эффектэд (2026-10-01).
   */
  const draftSyncRef = useRef<DraftSync | null>(null);

  // Багц солигдох бүрд бүдүүвч + мөрүүдийг шинээр татна. Хуучин багцын
  // хариу хожуу ирээд шинийг дарж бичихээс `alive` хамгаална.
  useEffect(() => {
    let alive = true;
    const ds = draftSyncRef.current!;
    /* `remoteQueue` угтваргүй — доорх мөрүүд урьдын текстээрээ (`draft.check`-ийн эх кодын гэрээ);
       гаднах нь `remoteQueueRef` нэртэй тул сүүдэрлэхгүй. */
    const { remoteQueue } = ds;
    const prevPkgKey = loadedPkgRef.current;
    loadedPkgRef.current = "";
    ds.promptedPkgRef.current = "";
    ds.clearRestoreDone();
    setPvSub(null);
    setPvPreview(null);
    if (remoteQueue.current && remoteQueue.current.pkg !== pkg.key) ds.flushRef.current(prevPkgKey || remoteQueue.current.pkg);
    remoteQueue.current = null;
    ds.keepDraft.current = false;
    ds.setRemoteState(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubmitFailed(false);
    setStaged(null);
    setStagedOid(null);
    setStagedFillMs(null);
    setResumedOid(null);
    setUnmovedWarn([]);
    setBusy(true);
    setErr("");
    setRows([]);
    setSc(null);
    setPending({});
    setPendDate({});
    ds.mineRef.current = new Set();
    ds.resetMarks();
    ds.setByMap(new Map());
    /* 2026-09-21: агшин ба tombstone ч мөн БАГЦЫН/НООРГИЙН төлөв — хамт цэвэрлэнэ. */
    ds.setByAtMap(new Map());
    ds.mineAtRef.current = new Map();
    ds.delRef.current = new Map();
    /* 2026-10-04 аудит: баримт · суурь · зорилт ч БАГЦЫН төлөв (дараагийн сэргээлт уншина) */
    ds.rcptRef.current = new Map();
    ds.btRef.current = new Map();
    ds.datesBRef.current = new Map();
    ds.asOfBRef.current = undefined;
    ds.setDraftTgt(null);
    /* 2026-10-04 дахин аудит: тэмдэглэсэн нүд (#7) ба хүн бүрийн зорилт (#4) ч БАГЦЫН төлөв */
    ds.resetHeldTgt();
    /* 2026-09-25: огнооны буцаалт ба «ноорог амьд» туг ч БАГЦЫН/ачааллын төлөв */
    ds.asOfRevRef.current = false;
    ds.asOfAtRef.current = null;
    ds.draftLiveRef.current = false;
    ds.lastMergedRef.current = 0;
    ds.lastBodyRef.current = '';
    setPvPend({});
    setPvSub(null);
    setPvPreview(null);
    setPvErr("");
    setPvNote("");
    setEdit(null);
    fillSchema(pkg)
      .then(async (schema) => {
        const nb = schema.bld.length;
        const r = await loadRows(pkg, schema, view?.subOid ? undefined : view?.day);
        if (!alive) return;
        setFrameTrunc(r.truncated ?? null);
        /* ── ИЛГЭЭЛТИЙН OVERLAY ───────────────────────────────────────────
         * Дүрэм 3 (компанийн хуудас) ба 4 (хянагчийн хуудас): архивын сүүлийн
         * жааз + илгээлтийн зөрүү.
         */
        /*
         * Урьд нь `loadActiveSubmission`/`loadSubmissionByOid` (алдааг
         * ЗАЛГИДАГ хос) дуудагдаж, гадуур нь `catch { sub = null }` байв —
         * тэр хоёр нь «илгээлт БАЙХГҮЙ» ба «уншиж ЧАДСАНГҮЙ» хоёрыг ижил
         * `null` болгодог. Сүлжээ түр тасрах, токен дуусах, `tableUrl`
         * `null` буцаах агшинд overlay ХИЙГДЭХГҮЙ, хэрэглэгч архивын суурь
         * жаазыг (бүх нүд 0%) хараад «илгээсэн ажил минь алга болжээ» гэж
         * дүгнэнэ — ЯМАР Ч алдаа харагдахгүй. 2026-09-06-нд «Багц 3.1,
         * Хяналтаас БУЦААСАН, бүх нүд 0%» гэсэн бодит гомдол ирсэн.
         */
        let sub: StagedSubmission | null = null;
        let subErr: string | null = null;
        {
          const sr = view?.subOid
            ? await readSubmissionByOid(view.subOid)
            : await readActiveSubmission(pkg.key, todayFillMs);
          if (sr.ok) sub = sr.sub;
          else subErr = sr.error;
          /*
           * Өнөөдрийн түлхүүрээр илгээлт олдоогүй (`sub == null`) БӨГӨӨД энэ
           * хуудсын хяналтын мөр гүйцэтгэгчийн гар дээр (`OWNER === 'company'`
           * — инженер буцаасан) байвал тэр илгээлтийг `Эх_мөрийн_дугаар`-аар
           * уншиж давхарлана. Урьд нь `readActiveSubmission(todayFillMs)` нь
           * ЗӨВХӨН өнөөдрийн мөрийг хайдаг тул 09-04-нд буцаагдсан илгээлтийг
           * 09-05-нд нээхэд гүйцэтгэгч БҮХ нүдийг 0% хараад «юуг засах вэ» гэж
           * мэдэхгүй, дахин бөглөдөг байв (амьд: oid 59·60 яг энэ төлөвт).
           */
          if (!sub && !view) {
            const f0 = flowRef.current;
            const soid = f0 ? Number(f0[HF.sheetOid]) : NaN;
            if (f0 && OWNER[f0[HF.status]] === 'company' && Number.isInteger(soid) && soid > 0) {
              const rr = await readSubmissionByOid(soid);
              if (rr.ok && rr.sub && !rr.sub.done && rr.sub.payload.pkgKey === pkg.key) sub = rr.sub;
              else if (!rr.ok) subErr = rr.error;
            }
          }
        }
        const infR = !view ? readInflight(pkg.key) : null;
        const infF = infR ? await findNonce(pkg.key, infR.nonce, infR.at - 86_400_000) : null;
        if (!alive) return;
        setSubReadErr(subErr);
        const f = flowRef.current;
        const useSub = !!sub && !sub.done && sub.payload.pkgKey === pkg.key
          && (!!view?.subOid || !f || f[HF.status] !== STATUS.transferred || sub.payload.residual === true);
        if (useSub && sub) {
          const p2 = await ensureFrameOcc(pkg, schema, sub.payload, r.rows);
          if (!alive) return;
          if (p2 !== sub.payload) sub = { ...sub, payload: p2 };
        }
        const ov = useSub && sub ? overlaySubmission(r.rows, sub.payload, schema, nb) : null;
        setUnmovedWarn(ov && ov.unmoved > 0 && sub
          ? describeUnmoved(ov.unmovedKeys, sub.payload.rowKeys, schema.bld)
          : []);
        loadedPkgRef.current = pkg.key;
        setSc(schema);
        setBackChg(ov && sub ? changedKeys(r.rows, ov, schema.bld) : new Set());
        setBackChgDates(ov && sub ? changedDateKeys(r.rows, ov) : new Set());
        setBackMeta(ov && sub ? { at: sub.payload.at, remapped: ov.remapped } : null);
        setOvBase(ov ? new Map(r.rows.map((x) => [x.oid, x] as const)) : new Map());
        setStaged(sub && !sub.done && sub.payload.pkgKey === pkg.key ? sub : null);
        {
          const inf = infR;
          const fr = infF;
          if (inf && fr) {
            if (fr.ok && fr.sub) {
              const a = ds.stamp();
              for (const [k, sv, sa] of inflightKeys(inf, r.rows)) {
                ds.rcptRef.current.set(k, [k, a, sv, sa || a]);
                ds.delRef.current.set(k, a);
              }
              done(tr('Өмнөх «Илгээх» сервер дээр АМЖИЛТТАЙ хадгалагдсан байсан (хариу нь тасарсан) — илгээгдсэн нүдийг ноорогоос хасав, давхар илгээгдэхгүй.'));
              clearInflight(pkg.key);
            } else if (fr.ok && mayClearInflight(inf)) {
              clearInflight(pkg.key);
            }
          }
        }
        if (!view && useSub && sub) ds.noteSubReceipts(sub.payload);
        setRows(ov ? ov.rows : r.rows);
        setAsOf(ov?.asOf ?? r.asOf);
        setAsOfOrig(ov?.asOf ?? r.asOf);
        setSnapDay(r.snapshot != null ? msToDay(r.snapshot) : "");
        setSnapMs(r.snapshot ?? null);
        setCollapsed(new Set());
        setGrpA(0);
        setGrpB(0);
        setByPlan(true);
      })
      .catch((e) => alive && setErr(userError(e)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg, view?.day, view?.subOid, todayFillMs]);

  /**
   * ӨНЧИН ИЛГЭЭЛТ — хадгалагдсан атлаа хяналтын бүртгэлгүй.
   */
  useEffect(() => {
    if (view || !staged || staged.done) return;
    if (hyLoading || hyErr) return;
    if (registeredRef.current.has(staged.oid)) return;
    {
      const p = staged.payload;
      if (p.residual === true && !p.cells.length && !(p.dates ?? []).length && !p.adds.length && p.asOf == null) return;
    }
    if (!needsRegistration(hyRows as unknown as Record<string, unknown>[], staged.oid, dayTagOf(staged.payload.fillMs), staged.at)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubmitFailed(true);
    setStagedOid(staged.oid);
    setStagedFillMs(staged.payload.fillMs);
  }, [staged, hyRows, hyLoading, hyErr, view]);

  /**
   * БУЦААГДСАН ИЛГЭЭЛТИЙН ХОЖУУ ДАВХАРЛАЛТ (2026-09-21).
   */
  const returnedSheetOid = flow && OWNER[flow[HF.status]] === 'company' && flow[HF.status] !== STATUS.transferred
    ? Number(flow[HF.sheetOid])
    : NaN;
  /*
   * ══════ БУЦААГДСАН ИЛГЭЭЛТИЙН НҮДНИЙ ЯЛГАА (2026-09-22) ══════
   */
  const backOkRes = useMemo(() => {
    let src = flow;
    if (resumedOid != null) {
      src = null;
      for (const r of hyRows) {
        if (Number(r[HF.sheetOid]) !== resumedOid) continue;
        if (!src || r.__oid > src.__oid) src = r;
      }
    } else if (!(returnedStaged || (src && staged && Number(src[HF.sheetOid]) === staged.oid))) {
      src = null;
    }
    const none = { ok: new Set<string>(), unknown: 0 };
    if (view || !src) return none;
    /* Зөвхөн гүйцэтгэгчийн гар дээрх, батлагдаагүй мөр */
    if (OWNER[src[HF.status]] !== 'company' || src[HF.status] === STATUS.transferred) {
      return none;
    }
    const sids = rowSids(rows);
    const idxRows = rows.map((r, i) => ({ oid: r.oid, sid: sids[i] }));
    const wroteAt = Date.parse(String(src[HF.engineerReturned] ?? ''));
    const trusted = !!backMeta && !backMeta.remapped && Number.isFinite(wroteAt) && backMeta.at <= wroteAt;
    const res = resolveOk(parseOkCells(src[HF.okCells]), idxRows, trusted);
    const byOid = new Set<string>();
    for (const k of res.keys) {
      const cut = k.indexOf(':');
      if (cut <= 0) continue;
      const r = rows[Number(k.slice(0, cut))];
      if (!r) continue;
      const bi = sc ? sc.bld.indexOf(k.slice(cut + 1)) : -1;
      if (bi >= 0 && negTotalAt(r, bi)) continue;
      byOid.add(`${r.oid}${k.slice(cut)}`);
    }
    return { ok: byOid, unknown: res.unknown };
  }, [view, flow, rows, resumedOid, hyRows, backMeta, returnedStaged, staged, sc]);
  const backOk = backOkRes.ok;
  /* `backChg` — ачаалах эффектээс ДЭЭР зарлагдсан (2026-10-01). */
  /**
   * `ovBase` — ДАВХАРЛАЛТЫН СУУРЬ МӨРҮҮД (oid → архивын мөр) — өөрчлөгдсөн нүдний `title`-д
   * «өмнөх: X · энэ удаа: Y · нийт: Z» бичихэд (2026-09-25, нэмэлтийн горим).
   */

  const nBld = sc?.bld.length ?? 0;

  const lateOverlayRef = useRef<number>(NaN);
  /** Хожуу давхарлалтын уншилт унасан/таслагдсан бол эффектийг ДАХИН асаах цохилт. */
  const [lateRetry, setLateRetry] = useState(0);
  useEffect(() => {
    if (view || busy || staged || !sc || !rows.length) return;
    if (loadedPkgRef.current !== pkg.key) return;
    if (!Number.isInteger(returnedSheetOid) || returnedSheetOid <= 0) return;
    if (lateOverlayRef.current === returnedSheetOid) return;
    lateOverlayRef.current = returnedSheetOid;
    let alive = true;
    void (async () => {
      const rr = await readSubmissionByOid(returnedSheetOid);
      if (!alive || loadedPkgRef.current !== pkg.key) {
        if (lateOverlayRef.current === returnedSheetOid) lateOverlayRef.current = NaN;
        setLateRetry((n) => n + 1);
        return;
      }
      if (!rr.ok) {
        setSubReadErr(userError(rr.error));
        lateOverlayRef.current = NaN;
        setTimeout(() => setLateRetry((n) => n + 1), REMOTE_RETRY_MS);
        return;
      }
      const sub = rr.sub;
      if (!sub || sub.done || sub.payload.pkgKey !== pkg.key) return;
      const ov = overlaySubmission(rows, sub.payload, sc, nBld);
      setUnmovedWarn(ov.unmoved > 0 ? describeUnmoved(ov.unmovedKeys, sub.payload.rowKeys, sc.bld) : []);
      setBackChg(changedKeys(rows, ov, sc.bld));
      setBackChgDates(changedDateKeys(rows, ov));
      setBackMeta({ at: sub.payload.at, remapped: ov.remapped });
      setOvBase(new Map(rows.map((x) => [x.oid, x] as const)));
      setStaged(sub);
      setRows(ov.rows);
      /* `null ≠ 0`: илгээлт огноог хөндөөгүй бол архивынх хэвээр. Хэрэглэгч энэ
         хооронд огноог өөрөө сольсон бол (`asOf !== asOfOrig`) дарж бичихгүй. */
      if (ov.asOf != null) { setAsOfOrig(ov.asOf); setAsOf((cur) => (cur === asOfOrig ? ov.asOf : cur)); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedSheetOid, busy, staged, sc, rows.length, pkg.key, view, lateRetry]);

  /*
   * Урьд нь энд `if (asOf == null && dates.length) setAsOf(сүүлийн огноо)`
   * гэсэн нөхөлт байв. `sheetDates` нь БҮХ багцын `buglusun_ognoo`-г
   * нийлүүлдэг тул хэзээ ч нийтлэгдээгүй хуудас (Багц 1·12F, Багц 4-2·12F)
   * огт хамаагүй багцын хуанлиар төлөвлөгөөт хувиа бодуулж, дэлгэц дээр
   * үндэсгүй ч итгэл төрүүлэхүйц тоо гаргадаг байлаа. Мөн тэр утга нь
   * `asOfOrig`-оос ЗӨРдөг тул `dirtyCount` 1 болж, хэрэглэгч юу ч хийгээгүй
   * атлаа «Нийтлэх» идэвхжиж, харь огноо архивт бичигдэх зам нээгддэг байв.
   *
   * Одоо `asOf` нь `null` хэвээр үлдэнэ: `computeAll` төлөвлөгөөт хувийг
   * `null` («мэдээлэлгүй») болгоно, харин обьём, бодит гүйцэтгэл, жин,
   * мөнгөн дүн нь огнооноос хамаардаггүй тул ХЭВИЙН бодогдоно — хуудас
   * хоосорохгүй. Огноог хэрэглэгч дээд талын «Огноо»-гоор эсвэл «Хуваарь»
   * харагдацаар өөрөө тавина.
   */

  /* `nBld` — хожуу давхарлалтын эффектээс ДЭЭР зарлагдсан (2026-10-01). */

  const reviewInc = useReviewInc({ view, sc, pkg, reviewSoidsKey, rows, loadedPkgRef });

  /** Блок бүрд обьёмын багана бий эсэх — обьёмоор бөглөх боломжийн нөхцөл. */
  const hasObyem = useMemo(() => (sc ? sc.obyem.map((f) => !!f) : []), [sc]);

  const rowsAll = rows;
  const addedOids = useAddedOids(pkg, rowsAll);
  /** Бүтэн горимын нэмэлт баганууд (`showExtra`) — Excel татахад харагдацаас үл хамааран бүтнээр */
  const extraAll = useMemo(() => fullExtraCols(sc, rowsAll), [sc, rowsAll]);
  const extra = useMemo(() => (showExtra ? extraAll : []), [showExtra, extraAll]);
  const compact = !showExtra;
  /** Хүснэгтийн баганын тоо — хоосон/чигжээсийн мөрийн `colSpan` */
  const nCols = compact ? 4 + nBld * 2 : 14 + nBld * 4 + extra.length;

  /* ── ХУВААРИЙН САРЫН ЗАДАРГАА (`huvaari_obyem`) ──────────────────────
   */
  const [obPlanSt, setObPlanSt] = useState<{ pkgKey: string; plan: PkgPlan }>({ pkgKey: '', plan: NO_PLAN });
  useEffect(() => {
    let alive = true;
    loadPkgPlan(pkg.key)
      .then((r) => { if (alive) setObPlanSt({ pkgKey: pkg.key, plan: r.plan }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [pkg.key]);
  const obPlan = obPlanSt.pkgKey === pkg.key ? obPlanSt.plan : NO_PLAN;

  /** `computeAll`-д өгөх задаргааны хувь — ажлын код + блокийн шошгоор */
  const planPct = useCallback(
    (row: SheetRow, b: number): number | null => {
      if (row.des == null || !sc || asOf == null || !obPlan.size) return null;
      const blok = sc.bld[b];
      const m = blok ? obPlan.get(row.des)?.get(blok) : undefined;
      const ps = pendDate[`${row.oid}:${b}:s`];
      const pe = pendDate[`${row.oid}:${b}:e`];
      const start = ps != null ? dayToMs(ps) : (row.start[b] ?? null);
      const end = pe != null ? dayToMs(pe) : (row.end[b] ?? null);
      return m ? planPctFromMonths(m, asOf, { start, end }) : null;
    },
    [obPlan, sc, asOf, pendDate],
  );

  /**
   *    Гэтэл хүснэгтийн 14 багана (№ · ажил · жин · обьём · өртөг · мөнгө …)
   *    блокоос ҮЛ ХАМААРНА: `computeAll` нь `n = 0` үед H · C · D-г хэвийн
   *    бодно (Багц 5.1-ийн мөнгөн дүн 16.7 тэрбум ₮ зөв гарсныг хэмжсэн).
   *    Зөвхөн блокоос бодогддог E · I · J · K нь `null` («мэдээлэлгүй») болно.
   */
  const calc = useMemo(
    () => computeAll(rowsAll, nBld, asOf, pending, pendDate, hasObyem, planPct, "inc", !!sc?.synthetic),
    [rowsAll, nBld, asOf, pending, pendDate, hasObyem, planPct, sc],
  );

  const { planCount, grpAOpts, grpBOpts, grpBEff, hidden, vis } = useRowFilter({ rowsAll, calc, nBld, today, grpA, grpB, collapsed, byPlan,
    asOf });
  const [ownJump, setOwnJump] = useState<{ row: number; block: string; n: number } | null>(null);
  const jumpReq = view?.jump ?? ownJump;
  const { scrollRef, tbodyRef, rowHRef, onScroll, hitKey, winFrom, winTo } = useVirtualWindow({ vis, edit, view, jump: ownJump });
  /**
   * БУЦААГДСАН НҮДНИЙ ЖАГСААЛТ (гүйцэтгэгч) — `backChg` (тэр илгээлтэд өөрчлөгдсөн) ба `backOk`
   * (хянагч зөвшөөрсөн). Засах ёстой (улаан) нь ЭХЭНД, зөвшөөрсөн (ногоон ✓) нь араас; дотроо
   * хүснэгтийн дарааллаар. Түлхүүр `${oid}:${шошго}` — `FillRows`-ийн `bk`-тэй ижил.
   */
  const backList = useMemo(() => {
    if (view || !sc || (backChg.size === 0 && backChgDates.size === 0)) return [];
    const out: { row: number; block: string; no: string; work: string; ok: boolean; date?: 's' | 'e' }[] = [];
    rowsAll.forEach((r, i) => {
      sc.bld.forEach((b, bi) => {
        const k = `${r.oid}:${b}`;
        if (backChg.has(k)) out.push({ row: i, block: b, no: r.no, work: r.work || r.no, ok: backOk.has(k) });
        for (const se of ['s', 'e'] as const) {
          if (backChgDates.has(`${r.oid}:${bi}:${se}`)) out.push({ row: i, block: b, no: r.no, work: r.work || r.no, ok: false, date: se });
        }
      });
    });
    return [...out.filter((x) => !x.ok), ...out.filter((x) => x.ok)];
  }, [view, sc, rowsAll, backChg, backOk, backChgDates]);
  const backBad = backList.filter((x) => !x.ok).length;

  const toggle = (oid: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(oid)) n.delete(oid);
      else n.add(oid);
      return n;
    });

  const jumpN = jumpReq?.n ?? -1;
  const unhideJumpRef = useRef(-1);
  useEffect(() => {
    const j = jumpReq;
    if (!j || unhideJumpRef.current === jumpN) return;
    unhideJumpRef.current = jumpN;
    if (!hidden[j.row] || !rowsAll[j.row]) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setByPlan(false);
    setGrpA(0);
    setGrpB(0);
    const par = parentIndexes(rowsAll);
    setCollapsed((s) => {
      const n = new Set(s);
      for (let p = par[j.row]; p >= 0; p = par[p]) n.delete(rowsAll[p].oid);
      return n;
    });
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpN]);

  /** n давхарга харуулна: гүн n−1 дэх бүх бүлгийг хаана. n≥5 = бүрэн дэлгэх. */

  const dirtyCount =
    Object.keys(pending).length +
    Object.keys(pendDate).length +
    (asOf !== asOfOrig ? 1 : 0);

  const { otherPct, pkgPct, otherPending, pkgAll } = usePkgPct({ pkg, sc, nBld, rowsAll, calc, asOf, hasObyem, planPct, dirtyCount, ovBase });
  const {
    pvPend, pvSub, pvPreview, pvBusy, pvErr, pvNote,
    pvCells, sendObyem, decideObyemHere, withdrawObyemHere, pvReturned,
    partial: pvPartial, returnStuck: pvReturnStuck, note: pvApprovedNote,
  } = useObyem({ st: obyemSt, pkg, pkgKeyRef, rows, sc, user, locked, todayFillMs, setRows });

  /**
   * ИНЖЕНЕРИЙН ОБЬЁМЫН ноорог (`pvPend`) — ХАМГААЛАЛТАД тоологдоно.
   */
  const pvDirty = Object.keys(pvPend).length;
  const pvDirtyRef = useRef(0);
  useEffect(() => { pvDirtyRef.current = pvDirty; }, [pvDirty]);
  const unsavedCount = dirtyCount + pvDirty;

  /**
   * ОДООГИЙН ИЛГЭЭЛТИЙН ЗОРИЛТ — `publish`-ийн `fillMs` сонголттой ЯГ ижил нөхцөл (2026-10-04 аудит, #6).
   * `[буцаагдсан илгээлтийн OBJECTID, fillMs]` эсвэл `null` (= өнөөдрийн шинэ илгээлт).
   */
  const curTgtOn = !!staged && !staged.done && (returnedStaged || resumedOid === staged.oid);
  const curTgtOid = curTgtOn && staged ? staged.oid : 0;
  const curTgtMs = curTgtOn && staged ? staged.payload.fillMs : 0;
  const curTgt = useMemo<[number, number] | null>(
    () => (curTgtOid ? [curTgtOid, curTgtMs] : null),
    [curTgtOid, curTgtMs],
  );
  const cellTds = useCallback((keys: string[]): [string, HTMLElement][] => {
    const tb = tbodyRef.current;
    if (!tb || !keys.length) return [];
    const idx = new Map(rows.map((r, i) => [r.oid, i] as const));
    const out: [string, HTMLElement][] = [];
    for (const k of keys) {
      const c = k.indexOf(':');
      const b = k.slice(c + 1);
      const i = idx.get(Number(k.slice(0, c)));
      if (c < 0 || i == null || !/^\d+$/.test(b)) continue;
      const td = tb.querySelector<HTMLElement>(`tr[data-r="${i}"] td[data-bi="${b}"]`);
      if (td) out.push([k, td]);
    }
    return out;
  }, [rows, tbodyRef]);
  const visibleKeys = useCallback((keys: string[]) => cellTds(keys).map(([k]) => k), [cellTds]);
  const flashCells = useCallback((keys: string[]) => {
    const hit = st.chgHit;
    if (!hit) return;
    for (const [, td] of cellTds(keys)) {
      td.classList.remove(hit);
      void td.offsetWidth;
      td.classList.add(hit);
      window.setTimeout(() => td.classList.remove(hit), 1800);
    }
  }, [cellTds]);
  const refreshStagedRef = useRef<(at: number) => void>(() => {});
  const onReceipts = useCallback((at: number) => refreshStagedRef.current(at), []);
  const okLockAt = useCallback((oid: number, b: number) => {
    const k = `${oid}:${sc?.bld[b] ?? b}`;
    return backChg.has(k) && backOk.has(k);
  }, [sc, backChg, backOk]);
  /* ══════════ НООРОГИЙН СИНК (`fill/useDraftSync`) — эффектүүд нь энд, өмнөх байрлалдаа ══════════ */
  const draftSync = useDraftSync({
    pkg, user, busy, rows, sc, nBld, canPerf, noEdit, asOf, asOfOrig, setAsOf,
    pending, setPending, pendDate, setPendDate, dirtyCount, pvDirty, fillMode, loadedPkgRef, pkgKeyRef, editRef,
    editOpen: !!edit,
    curTgt,
    show, say,
    soft, onReceipts, flashCells, visibleKeys,
    stick: stickHere,
    okLock: okLockAt,
  });
  useSyncRef(draftSyncRef, draftSync);
  const {
    savedAt, keepDraft: keepDraftRef, remoteQueue: remoteQueueRef, mineRef, mineAtRef, delRef, touchMine, revert,
    doneBy, byMap, setByMap, setByAtMap, byAtRef,
    remoteState,
    meKey, participants, waitingOn, byCount, iAmDone, canSubmitNow, toggleDone, dropDraft, waitingLast,
    undoAllMarks, restoringUi, offline,
    rcptRef, btRef, datesBRef, asOfBRef, draftTgt, localFail, stamp,
    /* 2026-10-04 дахин аудит — тэмдэглэсэн нүд (#7) · өөрийн зорилт (#4) */
    heldN, dropHeld, clearMyTgt,
    /* 2026-10-09 аудит №6 — серверийн илгээлтийн баримт */
    noteSubReceipts,
    /* 2026-10-05 — илгээлтийн баримтыг шууд бичих */
    pushReceipts,
    /* 2026-10-09 — «Илгээх»-ийн өмнөх алсын ноорогийн шалгалт */
    pullNow,
    /* 2026-10-09 (аудит №3) — буцаагдсан илгээлтийн засварт зөвхөн тэр илгээлтийн нүд */
    offTgtKeys, storedMine, dropMine,
  } = draftSync;
  const [slowKey, setSlowKey] = useState('');
  const restoreBase = restoringUi ? pkg.key : '';
  const [rstEp, setRstEp] = useState({ base: '', n: 0 });
  const rstEpN = rstEp.base === restoreBase ? rstEp.n : rstEp.n + 1;
  if (rstEp.base !== restoreBase) setRstEp({ base: restoreBase, n: rstEpN });
  const restoreKey = restoreBase ? `${restoreBase}#${rstEpN}` : '';
  useEffect(() => {
    if (!restoreKey) return undefined;
    const t = window.setTimeout(() => setSlowKey(restoreKey), RESTORE_SLOW_MS);
    return () => window.clearTimeout(t);
  }, [restoreKey]);
  const restoreSlow = !!restoreKey && slowKey === restoreKey;
  /**
   * НООРОГИЙН ЗОРИЛТ ОДООГИЙНХООС ӨӨР (2026-10-04 аудит, #6) — ноорог нь буцаагдсан илгээлтийн
   * засвар атлаа тэр илгээлт сонгогдоогүй (F5/багц солисон). «Илгээх» ТҮГЖИГДЭНЭ: эс бөгөөс
   * засвар ӨНӨӨДРИЙН илгээлтэд нийлж буруу өдрөөр явна. Хэрэглэгч тэр илгээлтийг сонгоно
   * (`resumeReturned`) эсвэл ноорогоо устгана.
   */
  const tgtMismatch = !locked && !!draftTgt && dirtyCount > 0 && (!curTgt || curTgt[0] !== draftTgt[0]);
  useEffect(() => {
    setNavDirty('fillnew', !locked && (pvDirty > 0 || (localFail && dirtyCount > 0)),
      pvDirty > 0 ? tr('Инженерийн төлөвлөсөн обьём (ноорогт хадгалагддаггүй)') : tr('Гүйцэтгэл бөглөх (энэ компьютерт хадгалагдсангүй)'));
  }, [locked, pvDirty, localFail, dirtyCount]);
  useEffect(() => () => { setNavDirty('fillnew', false); setNavDirty('fillnew-send', false); }, []);

  const [pastePrev, setPastePrev] = useState<PastePrev | null>(null);
  const {
    volMode, pctOnly, cellSeed, prevHint, commit, pasteBlock, nextEditable, nextBlockEditable,
    remainHint, confirmPaste, cancelPaste, clearLocked,
  } = useCellEdit({
    sc, fillMode, pending, setPending, edit, setEdit, setErr, warn, done, reviewInc, revert, mineRef, touchMine,
    locked, noEdit, canPerf, perfWhy: noPerfWhy, busy, editing, rowsAll, vis, hidden, nBld,
    restoring: restoringUi,
    pastePrev, setPastePrev,
    okLock: okLockAt,
  });

  /** Багц/хувилбар солихын өмнө илгээгээгүй засварыг баталгаажуулна. */
  const confirmSwitch = async (): Promise<boolean> =>
    unsavedCount === 0 ||
    askConfirm(
      tr('Илгээгээгүй {0} өөрчлөлт бий. Багц солих уу?', unsavedCount) + "\n" +
        tr('(Гүйцэтгэлийн засвар ноорогт хадгалагдсан — энэ багц руу буцаж ирэхэд автоматаар сэргэнэ.)') +
        (pvDirty
          ? "\n" + tr('⚠ Инженерийн төлөвлөсөн обьёмын {0} нүд нь ноорогт хадгалагддаггүй — багц солиход БҮРМӨСӨН устана. Эхлээд «Обьём батлуулах» дарна уу.', pvDirty)
          : ""),
      { ok: tr('Багц солих'), danger: pvDirty > 0 },
    );
  /** Огнооны нүдний ХАДГАЛАГДСАН утга «YYYY-MM-DD» хэлбэрээр. */
  const origDay = (r: SheetRow, b: number, k: "s" | "e") =>
    dt(k === "s" ? r.start[b] : r.end[b]);

  const justDateRef = useRef<Map<string, string>>(new Map());
  const commitDate = (r: SheetRow, b: number, k: "s" | "e", raw: string) => {
    const key = `${r.oid}:${b}:${k}`;
    setEdit(null);
    if (raw) {
      justDateRef.current.set(key, raw);
      setTimeout(() => { justDateRef.current.delete(key); }, 0);
      const oKey = `${r.oid}:${b}:${k === "s" ? "e" : "s"}`;
      const other = justDateRef.current.get(oKey) ?? pendDate[oKey] ?? origDay(r, b, k === "s" ? "e" : "s");
      const sDay = k === "s" ? raw : other;
      const eDay = k === "e" ? raw : other;
      const notes: string[] = [];
      if (sDay && eDay && eDay < sDay) notes.push(tr('«Дуусах» ({0}) нь «Эхлэх»-ээс ({1}) ӨМНӨ байна — төлөвлөгөөт хувь бодогдохгүй', eDay, sDay));
      const yr = Number(raw.slice(0, 4));
      if (Number.isFinite(yr) && Math.abs(yr - new Date().getFullYear()) > 5) notes.push(tr('он ({0}) өнөөдрөөс 5-аас их жилээр зөрж байна', String(yr)));
      if (notes.length) warn(tr('{0} · {1}: {2}. Огноогоо шалгана уу.', sc?.bld[b] ?? "", fixCyr(r.work), notes.join('; ')));
    }
    // Анхны утгадаа буцсан бол «нийтлээгүй» тэмдэглэгээг арилгана.
    const sameDate = raw === origDay(r, b, k);
    setPendDate((p) => {
      const n = { ...p };
      if (sameDate) delete n[key];
      else n[key] = raw;
      return n;
    });
    if (sameDate) revert(key, key in pendDate);
    else { mineRef.current.add(key); touchMine(key); }
  };

  const setAsOfUser: typeof setAsOf = (v) => {
    if (typeof v === "number" && v > nowFillMs()) {
      warn(tr('«Шинэчлэгдсэн огноо» ({0}) нь ИРЭЭДҮЙН өдөр байна — төлөвлөгөөт хувь тэр өдрөөр бодогдоно. Санаатай биш бол засна уу.', dt(v)));
    }
    setAsOf(v);
  };

  /**
   * ӨМНӨХ ӨДРИЙН БУЦААГДСАН илгээлтийг СОНГОЖ давхарлана (`resumedOid`).
   */
  const resumeReturned = useCallback(async (soid: number) => {
    if (busy || !sc || view) return;
    if (reviewerOnly || !permPerf) { warn(noPerfWhy ?? RO.noPerf); return; }
    if (draftTgt?.[0] !== soid) {
      /* «Шинэчлэгдсэн огноо» нь хуваалцсан — өөрчлөгдсөн бол урьдын адил саад (2026-09-24). */
      if (asOf !== asOfOrig) { warn(tr('Эхлээд илгээгээгүй засвараа илгээнэ үү эсвэл ноорогоо устгана уу.')); return; }
      const ownerOf = (k: string) => (mineRef.current.has(k) ? meKey : byMap.get(k));
      const memMine = [...Object.keys(pending), ...Object.keys(pendDate)].filter((k) => !!meKey && ownerOf(k) === meKey);
      setBusy(true);
      let stored: string[] | null = null;
      try { stored = await storedMine(pkg.key, soid); } finally { setBusy(false); }
      if (stored === null) { warn(tr('Ноорогийг ArcGIS-ээс уншиж чадсангүй — буцаасан илгээлттэй холилдох эсэхийг шалгаж чадсангүй. Дахин оролдоно уу.')); return; }
      const mine = [...new Set([...memMine, ...stored])];
      if (mine.length) {
        if (!(await askConfirm(tr('Таны илгээгээгүй {0} нүд ноорогт байна (өнөөдрийн эсвэл өөр өдрийн ажил). Буцаасан илгээлтийн засвартай холилдохгүйн тулд эхлээд тэдгээрийг ноорогоос устгана — бусдын нүд хөндөгдөхгүй. Устгаад үргэлжлүүлэх үү?', mine.length), { ok: tr('Устгаад үргэлжлүүлэх'), danger: true }))) return;
        dropMine(pkg.key, mine);
      }
    }
    setBusy(true);
    try {
      const rr = await readSubmissionByOid(soid);
      if (!rr.ok) throw new Error(rr.error);
      const sub0 = rr.sub;
      if (!sub0 || sub0.done || sub0.payload.pkgKey !== pkg.key) throw new Error(tr('Буцаасан илгээлт олдсонгүй — хуудсыг дахин ачаална уу.'));
      const base = await loadRows(pkg, sc);
      const p2 = await ensureFrameOcc(pkg, sc, sub0.payload, base.rows);
      const sub = p2 === sub0.payload ? sub0 : { ...sub0, payload: p2 };
      const ov = overlaySubmission(base.rows, sub.payload, sc, nBld);
      setUnmovedWarn(ov.unmoved > 0 ? describeUnmoved(ov.unmovedKeys, sub.payload.rowKeys, sc.bld) : []);
      setBackChg(changedKeys(base.rows, ov, sc.bld));
      setBackChgDates(changedDateKeys(base.rows, ov));
      setBackMeta({ at: sub.payload.at, remapped: ov.remapped });
      setOvBase(new Map(base.rows.map((x) => [x.oid, x] as const)));
      setStaged(sub);
      setResumedOid(sub.oid);
      setRows(ov.rows);
      /* `null ≠ 0`: илгээлт огноог хөндөөгүй бол архивынх */
      const a0 = ov.asOf ?? base.asOf;
      const keepAsOf = asOf !== asOfOrig && asOf !== a0 ? asOf : undefined;
      setAsOf(keepAsOf !== undefined ? keepAsOf : a0);
      setAsOfOrig(a0);
      setSnapDay(base.snapshot != null ? msToDay(base.snapshot) : "");
      setSnapMs(base.snapshot ?? null);
      done(tr('{0}-ны буцаасан илгээлт давхарлагдлаа — засаад «Илгээх» дарна.', msToDay(sub.payload.fillMs)));
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, sc, view, pending, pendDate, asOf, asOfOrig, pkg, nBld, draftTgt, reviewerOnly, permPerf, noPerfWhy, meKey, byMap, storedMine, dropMine]);

  useEffect(() => {
    if (!fixReq || view) return;
    if (fixReq.guess) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pkg.key !== fixReq.pkgKey) { setFixReq(null); return; }
    if (!sc || busy || hyLoading || loadedPkgRef.current !== pkg.key) return;
    const soid = fixReq.soid;
    setFixReq(null);
    if (soid == null || (flow && Number(flow[HF.sheetOid]) === soid)) return;
    if (resumedOid !== soid && otherDaysReturned.some((x) => x.soid === soid)) void resumeReturned(soid);
  }, [fixReq, view, pkg.key, sc, busy, hyLoading, flow, otherDaysReturned, resumedOid, resumeReturned]);

  /**
   * ӨДӨР СОЛИГДОХЫГ ТАНИХ (2026-09-25-ны аудит, `todayFillMs`).
   * Минут тутам ба таб харагдах болоход шалгаж, өдөр солигдсон бол
   * `todayFillMs`-ийг шинэчилнэ → ачаалах эффект хуудсыг шинэ өдрөөр дахин
   * ачаална (ноорог локал/алсаас сэргэнэ).
   */
  useEffect(() => {
    if (view) return undefined;
    const check = () => {
      const d = nowFillMs();
      if (d === todayFillMs) return;
      if (busy || editRef.current || pickRef.current || remoteQueueRef.current) return;
      if (pvDirtyRef.current > 0) return;
      setTodayFillMs(d);
      say(tr('Өдөр солигдлоо ({0}) — хуудас шинэ өдрөөр дахин ачааллаа.', msToDay(d)));
    };
    const id = setInterval(check, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, todayFillMs, view]);

  /**
   * ӨӨР ХЭРЭГЛЭГЧ ИЛГЭЭСНИЙ ДАРАА ИЛГЭЭЛТ/ДАВХАРЛАЛТЫГ ДАХИН УНШИНА (2026-10-09) — `useDraftSync`-ийн
   * татах мөчлөг ШИНЭ илгээлтийн баримт нийлүүлмэгц (`onReceipts`).
   */
  const refreshRunRef = useRef<{ on: boolean; again: number }>({ on: false, again: 0 });
  const pubEpochRef = useRef(0);
  const refreshStaged = useCallback(async (at: number) => {
    if (view || !sc) return;
    const ep = pubEpochRef.current;
    if (ep % 2 === 1) return;
    const run = refreshRunRef.current;
    if (run.on) { run.again = Math.max(run.again, at); return; }
    run.on = true;
    const want = pkg.key;
    const live = () => pkgKeyRef.current === want && loadedPkgRef.current === want && pubEpochRef.current === ep;
    /* Харагдаж буй ШАР анхааруулгыг (жиш. «Ноорог шинэчлэгдлээ — …») дарахгүй — нэгтгэнэ */
    const tell = (kind: 'ok' | 'warn', msg: string) => {
      const n = noticeRef.current;
      if (n && n.kind === 'warn') show('warn', `${n.msg} · ${msg}`);
      else show(kind, msg);
    };
    try {
      const next = await loadRows(pkg, sc);
      const ar = await readActiveSubmission(want, todayFillMs);
      if (!live()) return;
      setFrameTrunc(next.truncated ?? null);
      setSubReadErr(ar.ok ? null : ar.error);
      if (!ar.ok) return;
      reloadHy();
      const who = ar.sub?.payload.user?.trim() || tr('Өөр хэрэглэгч');
      if (staged && !staged.done && staged.payload.fillMs !== todayFillMs) {
        tell('ok', tr('{0} илгээв — таны дэлгэц шинэчлэгдлээ', who));
        return;
      }
      const r0 = rows.find((r) => r.oid >= 0);
      const n0 = next.rows.find((r) => r.oid >= 0);
      if (r0 && n0 && r0.oid !== n0.oid) {
        tell('warn', tr('{0} илгээв — хүснэгт шинэчлэгдсэн тул хуудсыг дахин ачаална уу (F5).', who));
        return;
      }
      const f = flowRef.current;
      let act = ar.sub && !ar.sub.done && ar.sub.payload.pkgKey === want
        && (!f || f[HF.status] !== STATUS.transferred || ar.sub.payload.residual === true) ? ar.sub : null;
      if (act) {
        const p2 = await ensureFrameOcc(pkg, sc, act.payload, next.rows);
        if (!live()) return;
        if (p2 !== act.payload) act = { ...act, payload: p2 };
      }
      if (act) noteSubReceipts(act.payload);
      const ov = act ? overlaySubmission(next.rows, act.payload, sc, nBld) : null;
      setUnmovedWarn(ov && ov.unmoved > 0 && act ? describeUnmoved(ov.unmovedKeys, act.payload.rowKeys, sc.bld) : []);
      setBackChg(act && ov ? changedKeys(next.rows, ov, sc.bld) : new Set());
      setBackChgDates(act && ov ? changedDateKeys(next.rows, ov) : new Set());
      setBackMeta(act && ov ? { at: act.payload.at, remapped: ov.remapped } : null);
      setStaged(act);
      setRows(ov ? ov.rows : next.rows);
      setOvBase(ov ? new Map(next.rows.map((x) => [x.oid, x] as const)) : new Map());
      const asOfNext = ov?.asOf ?? next.asOf;
      if (asOf === asOfOrig) setAsOf(asOfNext);
      setAsOfOrig(asOfNext);
      setSnapDay(next.snapshot != null ? msToDay(next.snapshot) : "");
      setSnapMs(next.snapshot ?? null);
      tell('ok', tr('{0} илгээв — таны дэлгэц шинэчлэгдлээ', who));
    } catch (e) {
      if (live()) setSubReadErr(userError(e));
    } finally {
      run.on = false;
      if (run.again) {
        const a = run.again;
        run.again = 0;
        refreshStagedRef.current(a);
      }
    }
  }, [view, sc, pkg, todayFillMs, staged, rows, nBld, asOf, asOfOrig, reloadHy, show, flowRef, noteSubReceipts]);
  useSyncRef(refreshStagedRef, (a: number) => { void refreshStaged(a); });

  /**
   * «НИЙТЛЭХ» = ИЛГЭЭХ (2026-09-04-нөөс).
   */
  const readySig = `${pkg.key}|${todayFillMs}|${dirtyCount}`;
  const [readyAt, setReadyAt] = useState<string | null>(null);
  const sendReady = dirtyCount === 0 || (!editing && readyAt === readySig);
  const readyIssue = useCallback((): { msg: string; keepOpen: boolean } | null => {
    const out = (msg: string, keepOpen = false) => ({ msg, keepOpen });
    if (dirtyCount === 0) return out(tr('Илгээх өөрчлөлт алга — нүдэнд обьём бичсэний дараа «Дуусгах» дарна уу.'));
    if (noEdit) return out(RO.viewOnly);
    if (!canPerf && (Object.keys(pending).length || Object.keys(pendDate).length || asOf !== asOfOrig)) return out(noPerfWhy ?? RO.noPerf);
    if (restoringUi) return out(RO.restoring);
    if (staged && !staged.done && (hyLoading || !!hyErr)) {
      return out(hyErr
        ? tr('Хяналтын жагсаалтыг татаж чадсангүй — хянагчийн зөвшөөрсөн (ногоон ✓) нүдийг тулгах боломжгүй. Дахин ачаалж байна; хэсэг хүлээгээд «Бөглөх» → «Дуусгах»-ыг дахин дарна уу.')
        : tr('Хяналтын жагсаалт ачаалагдаж байна — хянагчийн зөвшөөрсөн (ногоон ✓) нүдийг тулгаагүй байна. Хэсэг хүлээгээд «Бөглөх» → «Дуусгах»-ыг дахин дарна уу.'));
    }
    const okBadN = Object.keys(pending).filter((k) => {
      const c = k.indexOf(':');
      return c > 0 && okLockAt(Number(k.slice(0, c)), Number(k.slice(c + 1)));
    }).length;
    if (okBadN) return out(tr('Хянагчийн ЗӨВШӨӨРСӨН (ногоон ✓) {0} нүдэнд өөрчлөлт байна — тэр нүд засагдахгүй тул утгыг нь буцаагаад «Дуусгах»-ыг дахин дарна уу.', okBadN), true);
    const off = offTgtKeys([...Object.keys(pending), ...Object.keys(pendDate)]);
    if (off.length) return out(tr('Ноорогийн {0} нүд өөр ажилд (өнөөдрийн эсвэл өөр өдрийн бөглөлт) хамаарах тул буцаасан илгээлтийн засвартай хамт илгээсэнгүй. Хуудсыг дахин ачаалж (ноорог хадгалагдсан) тэр илгээлтийг дахин сонгоно уу.', off.length));
    if (!canSubmitNow) return out(tr('Таны хэсэг дууссан бол «Дуусгасан» дарна уу — илгээхийн өмнө {0} дуусгах ёстой.', waitingOn.join(', ')));
    if (tgtMismatch && draftTgt) return out(tr('Энэ ноорог {0}-ны буцаасан илгээлтийн засвар — «Өмнөх өдрийн илгээлт буцаасан» мэдэгдлээс тэр илгээлтийг сонгоод илгээнэ үү, эсвэл ноорогоо устгана уу.', msToDay(draftTgt[1])));
    return null;
  }, [dirtyCount, noEdit, canPerf, pending, pendDate, asOf, asOfOrig, noPerfWhy, restoringUi, staged, hyLoading, hyErr,
    okLockAt, offTgtKeys, canSubmitNow, waitingOn, tgtMismatch, draftTgt]);
  const pubAskRef = useRef(false);
  const publish = useCallback(async () => {
    if (busy || dirtyCount === 0 || !sc) return;
    if (noEdit) {
      setErr(RO.viewOnly);
      return;
    }
    if (!sendReady) {
      warn(tr('Эхлээд «Дуусгах» товчийг дарна уу — илгээхэд бүх зүйл бэлэн эсэхийг шалгасны дараа «Илгээх» идэвхжинэ.'));
      return;
    }
    if (!canPerf && (Object.keys(pending).length || Object.keys(pendDate).length || asOf !== asOfOrig)) {
      setErr(noPerfWhy ?? RO.noPerf);
      return;
    }
    if (restoringUi) { warn(RO.restoring); return; }
    if (editRef.current) { warn(tr('Нээлттэй нүдний утга хүлээн авагдаагүй байна — засаад Enter дарсны дараа «Илгээх»-ийг дахин дарна уу.')); return; }
    if (staged && !staged.done && (hyLoading || !!hyErr)) {
      if (hyErr) reloadHy();
      warn(hyErr
        ? tr('Хяналтын жагсаалтыг татаж чадсангүй — хянагчийн зөвшөөрсөн (ногоон ✓) нүдийг тулгах боломжгүй тул илгээсэнгүй. Дахин ачаалж байна; хэсэг хүлээгээд «Илгээх»-ийг дахин дарна уу.')
        : tr('Хяналтын жагсаалт ачаалагдаж байна — хянагчийн зөвшөөрсөн (ногоон ✓) нүдийг тулгахаас өмнө илгээхгүй. Хэсэг хүлээгээд «Илгээх»-ийг дахин дарна уу.'));
      return;
    }
    {
      const okBad = Object.keys(pending).filter((k) => {
        const c = k.indexOf(':');
        return c > 0 && okLockAt(Number(k.slice(0, c)), Number(k.slice(c + 1)));
      });
      if (okBad.length) {
        const bad = new Set(okBad);
        setPending((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !bad.has(k))));
        for (const k of okBad) revert(k, true);
        warn(tr('Хянагчийн ЗӨВШӨӨРСӨН (ногоон ✓) {0} нүдэнд илгээгээгүй утга байсныг буцаав — тэр нүд дахин засагдахгүй. Шалгаад «Илгээх»-ийг дахин дарна уу.', okBad.length));
        return;
      }
    }
    {
      const off = offTgtKeys([...Object.keys(pending), ...Object.keys(pendDate)]);
      if (off.length) {
        warn(tr('Ноорогийн {0} нүд өөр ажилд (өнөөдрийн эсвэл өөр өдрийн бөглөлт) хамаарах тул буцаасан илгээлтийн засвартай хамт илгээсэнгүй. Хуудсыг дахин ачаалж (ноорог хадгалагдсан) тэр илгээлтийг дахин сонгоно уу.', off.length));
        return;
      }
    }
    if (!canSubmitNow) {
      warn(tr('Илгээх — {0} дуусгаагүй байна', waitingOn.join(', ')));
      return;
    }
    const dNow = nowFillMs();
    if (dNow !== todayFillMs) {
      if (pvDirtyRef.current > 0) {
        warn(tr('Өдөр солигдлоо ({0}). Инженерийн обьёмын илгээгээгүй {1} нүд дахин ачаалахад устах тул эхлээд «Обьём батлуулах» дарна уу (эсвэл тэр нүднүүдээ буцаана уу), дараа нь «Илгээх»-ийг дахин дарна уу.', msToDay(dNow), pvDirtyRef.current));
        return;
      }
      setTodayFillMs(dNow);
      warn(tr('Өдөр солигдлоо ({0}) — хуудас шинэ өдрөөр дахин ачаалагдаж байна. Ноорог сэргээгдсэний дараа «Илгээх»-ийг дахин дарна уу.', msToDay(dNow)));
      return;
    }
    if (tgtMismatch && draftTgt) {
      warn(tr('Энэ ноорог {0}-ны буцаасан илгээлтийн засвар — «Өмнөх өдрийн илгээлт буцаасан» мэдэгдлээс тэр илгээлтийг сонгоод илгээнэ үү, эсвэл ноорогоо устгана уу.', msToDay(draftTgt[1])));
      return;
    }
    if (pubAskRef.current) return;
    pubAskRef.current = true;
    setBusy(true);
    let yes = false;
    try {
      yes = await askConfirm(
        tr('{0} өөрчлөлтийг хянагчид илгээх үү?\n\nИлгээсний дараа 7 шатны хяналт дуустал (эсвэл хянагч буцаатал) энэ багцад шинээр бөглөх, засах боломжгүй.', dirtyCount),
        { ok: tr('Илгээх'), title: pkg.label },
      );
    } finally {
      pubAskRef.current = false;
      if (!yes) setBusy(false);
    }
    if (!yes) return;
    const sentAt = new Map<string, number>();
    for (const k of [...Object.keys(pending), ...Object.keys(pendDate)]) {
      const m = mineRef.current.has(k) ? mineAtRef.current.get(k) : undefined;
      const o = byAtRef.current.get(k);
      const a = m != null && o != null ? Math.max(m, o) : (m ?? o);
      if (a != null) sentAt.set(k, a);
    }
    /**
     * ӨМНӨХ ОРОЛДЛОГО СЕРВЕР ДЭЭР БУУСАН (2026-10-04 аудит, #3) — тэр нүднүүдийн баримтыг тавьж
     * (`rcptRef`/`delRef` — бусад хуулбар ч хасагдана), ЭНЭ табын төлөвөөс хасна: утга нь
     * илгээснээс ялгаагүй → хасна, ялгаатай → ЗӨРҮҮ (`rebaseSent`). Буцаах: зөрүү болсон тоо.
     */
    const landInflight = (inf: Inflight): number => {
      const a = stamp();
      const sent = inflightKeys(inf, rows);
      for (const [k, sv, sa] of sent) {
        delRef.current.set(k, a);
        rcptRef.current.set(k, [k, a, sv, sa || a]);
      }
      const isD = (k: string) => /:[se]$/.test(k);
      const rc = rebaseSent(pending, sent.filter(([k]) => !isD(k)).map(([k, v]): [string, string] => [k, v]));
      const rd = rebaseSent(pendDate, sent.filter(([k]) => isD(k)).map(([k, v]): [string, string] => [k, v]));
      /* Зөрүү болсон нүд баримтыг «харсан» — дахин хөрвүүлэгдэхгүй */
      for (const k of [...rc.conv, ...rd.conv]) btRef.current.set(k, a);
      setPending(rc.next);
      setPendDate(rd.next);
      if (inf.asOf != null && asOf === inf.asOf) setAsOfOrig(asOf);
      clearInflight(pkg.key);
      return rc.conv.length;
    };
    /*
     *    Урьд нь энд `if (inReview) return` байсан бөгөөд `inReview` нь
     *    БАГЦЫН сүүлийн урсгалын мөрөөс тооцогддог байв — өчигдрийн илгээлт
     *    инженерийн гар дээр байхад ӨНӨӨДРИЙН гүйцэтгэлийг илгээх зам ОГТ
     *    байхгүй болж, гүйцэтгэгч хариу хүлээж сууж байлаа.
     *
     *    Одоо аюулгүй байдал нь ХОРИГООР биш, ТҮЛХҮҮРЭЭР хангагдана: илгээлт
     *    нь `sub|<pkg>|<fillMs>` тул өдөр бүр ТУСДАА мөр, тусдаа хяналтын
     *    мөр, тусдаа 6 шат. Өөр өдрийн хянагдаж буй агуулгыг энэ илгээлт
     *    ХӨНДӨХ БОЛОМЖГҮЙ.
     */
    setPastePrev(null);
    setBusy(true);
    setErr("");
    unstick();
    pubEpochRef.current += 1;
    try {
      if ((await pullNow(pkg.key)) === 'changed') {
        warn(tr('Ноорог шинэчлэгдлээ — шалгаад дахин илгээнэ үү'));
        return;
      }
      /* ── СУУРЬ ЖААЗ ─────────────────────────────────────────────────────
       */
      const fresh0 = await loadRows(pkg, sc);
      const freshRows = fresh0.rows;
      setFrameTrunc(fresh0.truncated ?? null);
      setSnapDay(fresh0.snapshot != null ? msToDay(fresh0.snapshot) : "");
      setSnapMs(fresh0.snapshot ?? null);
      /**
       * Урьд нь энд «энэ багцыг өнөөдөр өөр хэрэглэгч НИЙТЭЛСЭН үү»
       * (`freshDay === today`) гэж архивын агшнаар шалгадаг байв. Илгээлт
       * архивт бичигдэхээ больсон тул тэр шалгуур одоо ЮУ Ч БАРИХГҮЙ.
       *
       * Одоо завсрын хадгалалтыг шалгана: хуудас нээснээс хойш `sub|<pkg>`
       * мөр ШИНЭЧЛЭГДСЭН бол (өөр хүн, эсвэл өөр таб илгээсэн) бидний
       * нэгтгэх суурь (`staged`) хуучирсан — үргэлжлүүлбэл түүний нүднүүд
       * ЧИМЭЭГҮЙ дарагдана.
       */
      /* Бөглөсөн огноо — өдрийн эхэнд (UTC). Батлагдахад архивын жаазны
         `buglusun_ognoo` болно. */
      const fillMs = staged && !staged.done
        && (returnedStaged || resumedOid === staged.oid)
        ? staged.payload.fillMs
        : todayFillMs;
      const actR = await readActiveSubmission(pkg.key, fillMs);
      if (!actR.ok) throw new Error(actR.error);
      const act = actR.sub;
      {
        const inf = readInflight(pkg.key);
        if (inf) {
          const ir = act && (act.payload.nonces ?? []).includes(inf.nonce)
            ? actR
            : await findNonce(pkg.key, inf.nonce, inf.at - 86_400_000);
          if (!ir.ok) throw new Error(ir.error);
          const s2 = ir.sub;
          if (s2 && (s2.payload.nonces ?? []).includes(inf.nonce)) {
            const nConv = landInflight(inf);
            if (!s2.done && s2.payload.fillMs === fillMs) {
              setStaged(s2);
              const ovL = overlaySubmission(freshRows, s2.payload, sc, nBld);
              setRows(ovL.rows);
              setOvBase(new Map(freshRows.map((x) => [x.oid, x] as const)));
            }
            if (nConv) warn(tr('Өмнөх «Илгээх» сервер дээр АМЖИЛТТАЙ хадгалагдсан байсан (хариу нь тасарсан). Түүнээс хойш засагдсан {0} нүдийг ЗӨРҮҮ болгож үлдээв — шалгаад дахин илгээнэ үү.', nConv));
            else done(tr('Өмнөх «Илгээх» сервер дээр АМЖИЛТТАЙ хадгалагдсан байсан (хариу нь тасарсан) — давхар илгээсэнгүй.'));
            return;
          }
          clearInflight(pkg.key);
        }
      }
      if (act && (!staged || act.at > staged.at))
        throw new Error(
          tr('Энэ багцад өөр хэрэглэгч илгээлт хийсэн байна — хуудсыг дахин ачаалж, ноорогоо сэргээгээд үргэлжлүүлнэ үү.'),
        );
      let markDrop: number | undefined;
      let resolvedBase: SubmissionPayload | null = null;
      if (act && !act.done && act.payload.archiving) {
        const am = act.payload.archiving;
        if (markFresh(am))
          throw new Error(tr('Энэ өдрийн илгээлтийг {0} яг одоо архивлаж байна — хэдэн минутын дараа хуудсыг дахин ачаалж илгээнэ үү. Юу ч илгээсэнгүй.', am.by || tr('газрын дарга')));
        const { probeArchivedFrame, cleanupTruncatedFrame } = await import('@/lib/hyanaltStore');
        let hit: number | null | 'ambiguous';
        try { hit = await probeArchivedFrame(pkg.key, am); } catch (e) {
          throw new Error(tr('Энэ өдрийн өмнөх архивлалт шалгагдаагүй — юу ч илгээсэнгүй, дахин оролдоно уу ({0}).', userError(e)));
        }
        if (hit === 'ambiguous')
          throw new Error(tr('Энэ өдрийн өмнөх архивлалт шалгагдаагүй (архивын жааз тодорхойгүй) — юу ч илгээсэнгүй. Газрын даргаар дахин «Батлах» дарж шийдүүлнэ үү.'));
        if (hit == null) {
          const cl = await cleanupTruncatedFrame(pkg.key, am);
          if ('error' in cl)
            throw new Error(tr('Энэ өдрийн өмнөх архивлалт дундаа тасарсан бөгөөд үлдсэн хагас жаазыг цэвэрлэж чадсангүй ({0}) — юу ч илгээсэнгүй. Дахин оролдох эсвэл админд хандана уу.', cl.error));
          if (cl.deleted > 0) {
            setFrameTrunc(null);
            warn(tr('Өмнөх тасарсан архивлалтын {0} мөрийг архиваас цэвэрлэв — юу ч илгээсэнгүй. «Илгээх»-ийг дахин дарна уу.', cl.deleted));
            return;
          }
        }
        const rp = resolveMark(act.payload, hit != null);
        if (!rp)
          throw new Error(tr('Энэ өдрийн өмнөх илгээлт архивт бичигдсэн боловч хаагдаагүй бөгөөд шинэ илгээлтээс түүнийг хасах боломжгүй — газрын даргаар дахин «Батлах» дарж хаалгана уу. Юу ч илгээсэнгүй.'));
        resolvedBase = rp;
        markDrop = am.startedAt;
      }
      if (fresh0.truncated) {
        const t0 = fresh0.truncated;
        throw new Error(tr('Архивын сүүлийн жааз ({0}) дундаа тасарсан ({1}/{2} мөр) тул хуудас {3}-ны бүтэн жаазыг харуулж байна — тэр хуучин суурь дээр илгээхгүй. Газрын даргаар дахин «Батлах» дарж цэвэрлүүлэх эсвэл админд хандана уу. Юу ч илгээсэнгүй.', t0.day, t0.rows, t0.need, t0.shownDay));
      }
      /*
       * ── ObjectID ШИЛЖИЛТ ───────────────────────────────────────────────
       */
      const pageRows = rows.filter((r) => r.oid >= 0);
      const oidMap = (rows.length && freshRows.length && freshRows[0].oid !== rows[0].oid)
        ? buildOidMap(pageRows.map((r): [number, string] => [r.oid, rowKeyOf(r)]), freshRows, rowOccOf(pageRows))
        : new Map<number, number>();
      const stale = tr('Хуудас хооронд нь шинэчлэгдсэн (өөр хэрэглэгч илгээсэн эсвэл батлагдсан) тул засваруудыг шинэ мөрүүдэд тулгаж чадсангүй — илгээлтийг зогсоов. Ноорог хадгалагдсан хэвээр байгаа тул хуудсыг дахин ачаалж (F5), сэргээгээд дахин «Илгээх» дарна уу.');
      const mc = moveKeys(oidMap, pending);
      const md = moveKeys(oidMap, pendDate);
      if (mc.unmoved.length || md.unmoved.length) throw new Error(stale);
      const pend2 = mc.out;
      const pendDate2 = md.out;
      /**
       * Архивт хооронд нь шинэ жааз нэмэгдвэл ЗӨВХӨН одоогийн `pending` биш,
       * НЭГТГЭХ гэж буй хуучин илгээлтийн `cells`/`dates`/`rowKeys` ч
       * хуучирна. Зөөхгүй бол нэг payload дотор ХОЁР үеийн ObjectID холилдож,
       * батлах шатанд тал нь «тулгагдсангүй» болж бүхэл илгээлт зогсоно.
       */
      const freshOidSet = new Set(freshRows.map((r) => r.oid));
      const pageOidSet = new Set(rows.map((r) => r.oid));
      const movePayload = (p: SubmissionPayload): { p: SubmissionPayload; lost: string[] } => {
        const rk = p.rowKeys ?? [];
        if (!rk.some(([oid]) => oid >= 0 && !freshOidSet.has(oid))) return { p, lost: [] };
        const onPage = oidMap.size > 0 && rk.every(([oid]) => oid < 0 || pageOidSet.has(oid));
        const map = onPage ? oidMap : buildOidMap(rk, freshRows, p.rowOcc);
        const mm = map.size ? map : new Map<number, number>([[-1, -1]]);
        const c = moveKeys(mm, Object.fromEntries(p.cells));
        const d = moveKeys(mm, Object.fromEntries(p.dates));
        const kept = rk.filter(([oid]) => oid < 0 || map.has(oid));
        return {
          p: {
            ...p,
            cells: Object.entries(c.out),
            dates: Object.entries(d.out),
            rowKeys: kept.map(([oid, label]): [number, string] => [map.get(oid) ?? oid, label]),
            rowOcc: rowOccOf(freshRows, kept.map(([oid]) => map.get(oid) ?? oid)),
          },
          lost: [...c.unmoved, ...d.unmoved],
        };
      };

      /**
       * МӨРИЙН ТАНИГЧ — ЗӨВХӨН энэ илгээлтэд ашиглагдсан ЭЕРЭГ oid-үүдийнх.
       */
      const usedOids = new Set<number>();
      for (const k of [...Object.keys(pend2), ...Object.keys(pendDate2)]) {
        const o = Number(k.slice(0, k.indexOf(":")));
        if (Number.isFinite(o) && o >= 0) usedOids.add(o);
      }
      const rowKeys: [number, string][] = [];
      for (const r of freshRows) if (usedOids.has(r.oid)) rowKeys.push([r.oid, rowKeyOf(r)]);

      let mergeBase: SubmissionPayload | null = null;
      if (staged
        && staged.payload.fillMs === fillMs
        && (!flow || flow[HF.status] !== STATUS.transferred || (resolvedBase ?? staged.payload).residual === true)) {
        const mv = movePayload(await ensureFrameOcc(pkg, sc, resolvedBase ?? staged.payload, freshRows));
        if (mv.lost.length && !(await askConfirm(tr(
          'Өмнөх илгээлтийн {0} нүдийг шинэ хүснэгтийн мөрөнд тулгаж чадсангүй (ижил нэртэй мөр олон эсвэл мөр хасагдсан): {1}. Тэдгээрийг өмнөх илгээлтээс ХАСААД үргэлжлүүлэх үү? (Үгүй — илгээхгүй, ноорог хэвээр.) Хассан нүдийг дараа нь гараар дахин бөглөнө үү.',
          mv.lost.length, describeUnmoved(mv.lost, staged.payload.rowKeys, sc.bld).join('; '),
        ), { ok: tr('Хасаад үргэлжлүүлэх'), danger: true }))) throw new Error(stale);
        mergeBase = mv.p;
      }
      const addOids = new Set<number>((mergeBase?.adds ?? []).map((a) => a.oid));
      const notOrphan = (k: string) => {
        const o = Number(k.slice(0, k.indexOf(":")));
        return !(o < 0) || addOids.has(o);
      };
      const legacyBase = !!mergeBase && mergeBase.mode !== 'inc';
      let cellSrc = pend2;
      if (legacyBase) {
        const pageBy = new Map(rows.map((r) => [r.oid, r] as const));
        const absPend: Record<string, string> = {};
        for (const [k, v] of Object.entries(pending)) {
          const at = k.indexOf(':');
          const r0 = at > 0 ? pageBy.get(Number(k.slice(0, at))) : undefined;
          const b0 = Number(k.slice(at + 1));
          if (!r0) throw new Error(stale);
          const hasF = !!sc.obyem[b0];
          const res = incCell(r0, b0, v, hasF);
          const d0 = parseInc(v);
          if (!res || !d0) continue;
          const vol0 = r0.vol != null && r0.vol > 0 ? r0.vol : null;
          if (hasF && vol0 == null && d0.n !== 0 && d0.p !== 0) {
            throw new Error(tr('Нэг нүдэнд обьём ба хувийн нэмэлт хоёулаа бичигдсэн (мөрийн Обьём хоосон) — өнөөдрийн хуучин (нийт утгатай) илгээлттэй нэгтгэх боломжгүй тул илгээлтийг зогсоов. Тэр нүдэнд зөвхөн обьём эсвэл зөвхөн хувь бичээд дахин «Илгээх» дарна уу (ноорог хадгалагдсан хэвээр).'));
          }
          absPend[k] = hasF && (d0.p === 0 || vol0 != null) && res.obyem != null
            ? String(res.obyem)
            : `%${parseFloat(((res.act ?? 0) * 100).toPrecision(12))}`;
        }
        const ma = moveKeys(oidMap, absPend);
        if (ma.unmoved.length) throw new Error(stale);
        cellSrc = ma.out;
      }
      const cellsOut = Object.entries(cellSrc).filter(([k]) => notOrphan(k));
      const datesOut = Object.entries(pendDate2).filter(([k]) => notOrphan(k));
      const nonce = newNonce();
      myNonces.add(nonce);
      /**
       * ИЛГЭЭЖ БУЙ НҮД — `[түлхүүр, НООРОГИЙН утга (нэмэлт), sa]` (2026-10-04 аудит, #3 · #4).
       * Хуудасны түлхүүр ба (жааз солигдсон бол) зөөгдсөн түлхүүр ХОЁУЛАА — бусад хуулбар аль
       * нэгийг нь агуулна. `sa` = илгээсэн хуулбарын агшин (`sentAt`; мэдэгдэхгүй бол 0 → илгээх агшин).
       */
      const sentList: [string, string, number][] = [];
      for (const [k, v] of [...Object.entries(pending), ...Object.entries(pendDate)]) {
        const sa = sentAt.get(k) ?? 0;
        sentList.push([k, v, sa]);
        const c = k.indexOf(':');
        const to = c > 0 ? oidMap.get(Number(k.slice(0, c))) : undefined;
        if (to != null) sentList.push([`${to}${k.slice(c)}`, v, sa]);
      }
      await syncServerClock();
      const sentStamp = serverNow();
      const payload = mergeSubmission(mergeBase, {
        ...(legacyBase ? {} : { mode: 'inc' as const }),
        pkgKey: pkg.key,
        user: user?.username ?? "",
        at: sentStamp,
        fillMs,
        base: fresh0.snapshot ?? snapMs,
        asOf: asOf !== asOfOrig ? asOf : null,
        cells: cellsOut,
        dates: datesOut,
        adds: [],
        rowKeys,
        rowOcc: rowOccOf(freshRows, usedOids),
        nonces: [nonce],
      });
      payload.rowOcc = rowOccOf(freshRows, payload.rowKeys.map(([o]) => o));
      {
        const ovNeg = overlaySubmission(freshRows, payload, sc, nBld);
        if (ovNeg.negative > 0) {
          stickHere(tr(
            'Илгээсэнгүй — {0} нүдний нэмэлт нийт дүнг сөрөг болгоно (хуудсанд байгаагаас их хасалт). Нийтийг 0 болгохын тулд: {1}. Дараа нь «Илгээх»-ийг дарна уу (юу ч илгээгдээгүй, ноорог хэвээр).',
            ovNeg.negative, describeNegFixes(ovNeg, sc, pend2, fillMode).join('; '),
          ));
          return;
        }
      }

      const expectAt = staged && staged.payload.fillMs === fillMs
        ? { at: staged.at, ...(markDrop != null ? { dropMark: markDrop } : {}) }
        : null;
      {
        const sOids = new Set<number>();
        for (const [k] of sentList) { const o = Number(k.slice(0, k.indexOf(':'))); if (Number.isInteger(o) && o >= 0) sOids.add(o); }
        const rk: [number, string][] = [];
        const rkSeen = new Set<number>();
        for (const r of [...pageRows, ...freshRows]) {
          if (sOids.has(r.oid) && !rkSeen.has(r.oid)) { rkSeen.add(r.oid); rk.push([r.oid, rowKeyOf(r)]); }
        }
        saveInflight(pkg.key, {
          v: 1, nonce, fillMs, at: sentStamp, asOf: asOf !== asOfOrig ? asOf : null,
          sent: sentList,
          rk, occ: [...rowOccOf(pageRows, sOids), ...rowOccOf(freshRows, sOids)],
        });
      }
      setNavDirty('fillnew-send', true, tr('Гүйцэтгэл илгээж байна'));
      let sv: Awaited<ReturnType<typeof saveSubmission>>;
      try {
        sv = await saveSubmission(pkg.key, payload, expectAt);
      } finally {
        setNavDirty('fillnew-send', false);
      }
      if (!sv.ok) {
        if (!sv.lost) clearInflight(pkg.key);
        throw new Error(sv.error);
      }
      clearInflight(pkg.key);
      const nCells = Object.keys(pend2).length + Object.keys(pendDate2).length;
      const pubAt = stamp();
      delRef.current = new Map();
      for (const [k, v, sa] of sentList) {
        delRef.current.set(k, pubAt);
        rcptRef.current.set(k, [k, pubAt, v, sa || pubAt]);
      }
      {
        const ld = readDraft(pkg.key);
        if (ld?.rowKeys?.length) {
          const sentBy = new Map(sentList.map(([k, v, sa]) => [k, [v, sa] as const]));
          const mm = mapOldOids(ld.rowKeys.filter(([o]) => !pageOidSet.has(o)), rows, ld.rowOcc, false);
          for (const [k0] of [...ld.cells, ...(ld.dates ?? [])]) {
            const c = k0.indexOf(':');
            const to = c > 0 ? mm.map.get(Number(k0.slice(0, c))) : undefined;
            const hit = to != null ? sentBy.get(`${to}${k0.slice(c)}`) : undefined;
            if (!hit) continue;
            delRef.current.set(k0, pubAt);
            rcptRef.current.set(k0, [k0, pubAt, hit[0], hit[1] || pubAt]);
          }
        }
      }
      /* Суурь/зорилт — илгээгдсэн ноорогтой хамт дууслаа (шинэ мөчлөг) */
      btRef.current = new Map();
      datesBRef.current = new Map();
      asOfBRef.current = undefined;
      clearMyTgt();
      keepDraftRef.current = false;
      setPending({});
      setPendDate({});
      mineRef.current = new Set();
      mineAtRef.current = new Map();
      undoAllMarks();
      setByMap(new Map());
      setByAtMap(new Map());
      /* Огнооны өөрчлөлт илгээлтэд суусан — `dirtyCount`-д дахин тоологдохгүй */
      setAsOfOrig(asOf);
      const savedSub: StagedSubmission = { oid: sv.oid, at: payload.at, done: false, payload };
      setStaged(savedSub);
      const ovNow = overlaySubmission(freshRows, payload, sc, nBld);
      setRows(ovNow.rows);
      setOvBase(new Map(freshRows.map((x) => [x.oid, x] as const)));
      setResumedOid(null);
      setStagedOid(sv.oid);
      setStagedFillMs(fillMs);
      let rcWarn = '';
      {
        const rc = await pushReceipts(pkg.key);
        if (!rc.ok) {
          rcWarn = tr('⚠️ илгээсэн нүдний тэмдэглэл ArcGIS-ийн ноорогт хуулагдсангүй ({0}) — автоматаар дахин оролдоно. «Ноорог хуулагдав» гэж гартал энэ хуудсыг бүү хаа, өөр компьютер/хөтчөөс энэ багцыг бүү илгээ (нүд давхар тоологдож болзошгүй).', rc.why);
          const rcKey = pkg.key;
          void (async () => {
            for (let i = 1; i <= 6; i += 1) {
              await new Promise((res) => setTimeout(res, 5000 * i));
              if (pkgKeyRef.current !== rcKey) return;
              const r2 = await pushReceipts(rcKey).catch((x: unknown) => ({ ok: false as const, why: String(x) }));
              if (pkgKeyRef.current !== rcKey) return;
              if (r2.ok) { done(tr('Ноорог хуулагдав — илгээсэн нүдний тэмдэглэл ArcGIS-ийн ноорогт хадгалагдлаа.')); return; }
            }
            if (pkgKeyRef.current === rcKey)
              warn(tr('Илгээсэн нүдний тэмдэглэл ArcGIS-ийн ноорогт хуулагдсангүй — өөр компьютер/хөтчөөс энэ багцыг илгээхийн өмнө тэнд хуудсыг дахин ачаална уу (F5).'));
          })();
        }
      }

      /*
       * ── ХЯНАЛТАД АВТОМАТААР ОРУУЛНА ──────────────────────────────────
       */
      const rv = await submitForReview(pkg.group, fillMs, sv.oid, pkg.name);
      if (rv.ok) registeredRef.current.add(sv.oid);
      setSubmitFailed(!rv.ok);
      /* Хяналтын жагсаалтыг шинэчилнэ — `hyanalt.addRows` нь `hyanaltStore`-ын
         кэшийг мэддэггүй тул үүнгүйгээр «хяналтад байна» мэдэгдэл гарахгүй. */
      if (rv.ok) reloadHy();
      if (rv.ok) setBackChg(new Set());
      if (rv.ok) setBackChgDates(new Set());

      /* ── ДЭЛГЭЦИЙГ ДАХИН БҮТЭЭНЭ ── */
      try {
        const next = await loadRows(pkg, sc);
        const act2r = await readActiveSubmission(pkg.key, todayFillMs);
        setFrameTrunc(next.truncated ?? null);
        setSubReadErr(act2r.ok ? null : act2r.error);
        const act2 = act2r.ok
          ? (act2r.sub && !act2r.sub.done ? act2r.sub : (fillMs !== todayFillMs ? savedSub : null))
          : (fillMs === todayFillMs ? savedSub : null);
        const ov2 = act2 ? overlaySubmission(next.rows, act2.payload, sc, nBld) : null;
        setUnmovedWarn(ov2 && ov2.unmoved > 0 && act2
          ? describeUnmoved(ov2.unmovedKeys, act2.payload.rowKeys, sc.bld)
          : []);
        setStaged(act2);
        setRows(ov2 ? ov2.rows : next.rows);
        setOvBase(ov2 ? new Map(next.rows.map((x) => [x.oid, x] as const)) : new Map());
        const asOfNext = ov2?.asOf ?? next.asOf ?? asOf;
        setAsOf(asOfNext);
        setAsOfOrig(asOfNext);
        setSnapDay(next.snapshot != null ? msToDay(next.snapshot) : "");
        setSnapMs(next.snapshot ?? null);
      } catch (e2) {
        /* Дэлгэц аль хэдийн `ovNow` — зөвхөн анхааруулга ба огноо */
        setUnmovedWarn(ovNow.unmoved > 0 ? describeUnmoved(ovNow.unmovedKeys, payload.rowKeys, sc.bld) : []);
        const asOfF = ovNow.asOf ?? fresh0.asOf ?? asOf;
        setAsOf(asOfF);
        setAsOfOrig(asOfF);
        setSubReadErr(userError(e2));
      }
      (rv.ok ? done : warn)((!rv.ok
        ? tr('Илгээлт хадгалагдлаа ({0} нүд) · ⚠️ хяналтад бүртгэгдсэнгүй: {1}', nCells, rv.error)
        : rv.reused
          ? tr('Энэ өдрийн илгээлт ШИНЭЧЛЭГДЛЭЭ ({0}) · {1} нүд — хянагч ({2}) шинэ агуулгыг харна.', rv.id, nCells, reviewStage ? STAGE_LABEL[reviewStage] : '')
          : tr('Хяналтад илгээв ({0}) · {1} нүд', rv.id, nCells))
        + (rcWarn ? ' · ' + rcWarn : ''));
    } catch (e) {
      setErr(userError(e));
    } finally {
      pubEpochRef.current += 1;
      setBusy(false);
    }
  }, [pkg, sc, nBld, asOf, asOfOrig, pending, pendDate, dirtyCount, busy, sendReady, canPerf, noEdit, rows, done, reviewStage, staged, snapMs, user, reloadHy, flow, returnedStaged, todayFillMs, canSubmitNow, waitingOn, resumedOid, setResumedOid, setTodayFillMs, keepDraftRef, mineRef, mineAtRef, byAtRef, delRef, undoAllMarks, setByMap, setByAtMap,
    /* 2026-10-04 аудит */
    stamp, rcptRef, btRef, datesBRef, asOfBRef, clearMyTgt, tgtMismatch, draftTgt, warn, pushReceipts,
    /* 2026-10-09 */
    pullNow, noPerfWhy,
    /* 2026-10-09 (аудит №3) */
    restoringUi, okLockAt, offTgtKeys, revert,
    /* 2026-10-12 (аудит №8) */
    hyLoading, hyErr,
    /* 2026-10-22 (аудит): сөрөг нүдний засварын утга горимын нэгжээр (`describeNegFixes`) */
    fillMode,
    /* 2026-10-23 (UX аудит F4): наалдсан анхааруулга */
    stickHere, unstick]);

  /**
   * БУЦААГДСАН ИЛГЭЭЛТИЙГ ӨӨРЧЛӨЛТГҮЙ ДАХИН ИЛГЭЭХ (2026-10-04).
   */
  const resendAsIs = useCallback(async () => {
    if (busy || !sc || !staged || staged.done || !curTgtOn || dirtyCount > 0 || locked) return;
    if (noEdit) { setErr(RO.viewOnly); return; }
    if (reviewerOnly || !canPerf) { setErr(noPerfWhy ?? RO.noPerf); return; }
    setBusy(true);
    setErr("");
    unstick();
    try {
      {
        let ovChk: ReturnType<typeof overlaySubmission>;
        let pChk: SubmissionPayload;
        try {
          const fresh = await loadRows(pkg, sc);
          pChk = await ensureFrameOcc(pkg, sc, staged.payload, fresh.rows);
          ovChk = overlaySubmission(fresh.rows, pChk, sc, nBld);
        } catch (e) {
          setErr(tr('Илгээлтийг шалгаж чадсангүй — юу ч илгээсэнгүй, дахин оролдоно уу ({0}).', userError(e)));
          return;
        }
        if (ovChk.negative > 0) {
          stickHere(tr(
            'Илгээсэнгүй — {0} нүдний нэмэлт нийт дүнг сөрөг болгоно (хуудсанд байгаагаас их хасалт). Нийтийг 0 болгохын тулд: {1}. Дараа нь «Илгээх»-ийг дарна уу (юу ч илгээгдээгүй, ноорог хэвээр).',
            ovChk.negative, describeNegFixes(ovChk, sc, {}, fillMode).join('; '),
          ));
          return;
        }
        if (ovChk.unmoved > 0) {
          stickHere(tr(
            'Илгээсэнгүй — илгээлтийн {0} нүдийг хуудсанд буулгаж чадсангүй (мөр нь тулгагдаагүй эсвэл нэмэлтийн утга нь тоо биш): {1}. Хянагч ийм илгээлтийг батлах боломжгүй — тэр нүдийг дахин бөглөж (тоог зөв бичиж) «Илгээх»-ээр илгээнэ үү.',
            ovChk.unmoved, describeUnmoved(ovChk.unmovedKeys, pChk.rowKeys, sc.bld).join('; '),
          ));
          return;
        }
      }
      if (!(await askConfirm(tr('Буцаасан илгээлтийг ({0}) ӨӨРЧЛӨЛТГҮЙ, хэвээр нь дахин хяналтад илгээх үү? Хянагч өмнөх агуулгыг дахин хянана.', msToDay(staged.payload.fillMs)), { ok: tr('Илгээх') }))) return;
      const rv = await submitForReview(pkg.group, staged.payload.fillMs, staged.oid, pkg.name);
      if (!rv.ok) { setErr(rv.error); return; }
      registeredRef.current.add(staged.oid);
      setSubmitFailed(false);
      reloadHy();
      setResumedOid(null);
      setBackChg(new Set());
      if (staged.payload.fillMs !== todayFillMs) {
        try {
          const next = await loadRows(pkg, sc);
          const ar = await readActiveSubmission(pkg.key, todayFillMs);
          setSubReadErr(ar.ok ? null : ar.error);
          let act = ar.ok && ar.sub && !ar.sub.done && ar.sub.payload.pkgKey === pkg.key ? ar.sub : null;
          if (act) {
            const p2 = await ensureFrameOcc(pkg, sc, act.payload, next.rows);
            if (p2 !== act.payload) act = { ...act, payload: p2 };
          }
          const ov2 = act ? overlaySubmission(next.rows, act.payload, sc, nBld) : null;
          setUnmovedWarn(ov2 && ov2.unmoved > 0 && act
            ? describeUnmoved(ov2.unmovedKeys, act.payload.rowKeys, sc.bld)
            : []);
          setStaged(act);
          setRows(ov2 ? ov2.rows : next.rows);
          setOvBase(ov2 ? new Map(next.rows.map((x) => [x.oid, x] as const)) : new Map());
          /* `null ≠ 0` — илгээлт огноог хөндөөгүй бол архивынх; засваргүй (`dirtyCount === 0`) тул хоёулаа */
          const asOfNext = ov2?.asOf ?? next.asOf ?? asOf;
          setAsOf(asOfNext);
          setAsOfOrig(asOfNext);
          setSnapDay(next.snapshot != null ? msToDay(next.snapshot) : "");
          setSnapMs(next.snapshot ?? null);
        } catch (e2) {
          setStaged(null);
          setSubReadErr(userError(e2));
        }
      }
      done(rv.reused ? tr('Энэ илгээлт хяналтад аль хэдийн бүртгэгдсэн байна') : tr('Өөрчлөлтгүй дахин илгээв ({0})', rv.id));
    } finally {
      setBusy(false);
    }
  }, [busy, sc, staged, curTgtOn, dirtyCount, locked, noEdit, pkg, nBld, asOf, todayFillMs, setResumedOid, reloadHy, done, reviewerOnly, canPerf, noPerfWhy,
    /* 2026-10-22 (аудит): илгээхийн өмнөх шалгалт (сөрөг · тулгагдаагүй нүд) */
    fillMode,
    /* 2026-10-23 (UX аудит F4): наалдсан анхааруулга (`warn`-ийн оронд) */
    stickHere, unstick]);

  // Ctrl+S — 2026-10-23 (UX аудит F1): ЗӨВХӨН НООРОГ ХАДГАЛНА (доорх `saveQueued`), илгээхгүй.
  const [publishQueued, setPublishQueued] = useState(false);
  const flushEditRef = useRef<() => boolean>(() => true);
  useSyncRef(editRef, edit);
  useSyncRef(pickRef, pick);
  useSyncRef(flushEditRef, () => {
    if (edit && rowsAll[edit.i])
      return commit(rowsAll[edit.i], edit.b, inputRef.current?.value ?? val);
    return true;
  });
  useEffect(() => {
    if (!publishQueued || edit) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPublishQueued(false);
    publish();
  }, [publishQueued, edit, publish]);
  const [saveQueued, setSaveQueued] = useState(false);
  const flushDraftRef = draftSync.flushRef;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);
  useEffect(() => {
    if (!saveQueued || edit) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaveQueued(false);
    /* локал хадгалах эффект энэ commit-д ажилласан — алсын дарааллыг дараагийн мөчлөгт явуулна */
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { saveTimerRef.current = null; flushDraftRef.current(); }, 0);
    if (dirtyCount > 0) done(tr('Ноорог хадгалагдлаа — хянагчид илгээхийн тулд «Илгээх» товчийг дарна уу (Ctrl+S илгээхгүй).'));
  }, [saveQueued, edit, flushDraftRef, dirtyCount, done]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (hiddenNow()) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (flushEditRef.current()) setSaveQueued(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const publishBtn = useCallback(async () => {
    if (flushEditRef.current()) setPublishQueued(true);
  }, []);
  const [finishQueued, setFinishQueued] = useState(false);
  const draftSig = useMemo(
    () => JSON.stringify([pending, pendDate, asOf]),
    [pending, pendDate, asOf],
  );
  const editSigRef = useRef<string | null>(null);
  const startEdit = useCallback(() => {
    editSigRef.current = draftSig;
    setEditing(true);
  }, [draftSig, setEditing]);
  const finishEdit = useCallback(() => {
    if (flushEditRef.current()) setFinishQueued(true);
  }, []);
  const verifiedSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (!finishQueued || edit) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFinishQueued(false);
    const close = () => { editSigRef.current = null; setEditing(false); };
    if (!canPerf || (dirtyCount === 0 && pvDirty > 0)) { close(); setReadyAt(null); return; }
    const check = () => {
      const why = readyIssue();
      if (why) {
        warn(why.msg);
        if (!why.keepOpen) { close(); setReadyAt(null); }
        return;
      }
      verifiedSigRef.current = draftSig;
      close();
      setReadyAt(readySig);
    };
    const noChange = editSigRef.current != null && editSigRef.current === draftSig;
    if (noChange && verifiedSigRef.current === draftSig) {
      close();
      setReadyAt(null);
      warn(tr('Засвар хийгдээгүй тул «Илгээх» идэвхжсэнгүй — «Бөглөх» дарж нүдэнд обьём бичээд «Дуусгах» дарна уу.'));
      return;
    }
    if (noChange && dirtyCount > 0) {
      /* сэргээсэн, шалгагдаагүй ноорог — чимээгүй идэвхжүүлэхгүй (хэрэглэгчийн дүрэм), харин АСУУНА */
      void askConfirm(tr('Сэргээсэн {0} өөрчлөлтийг илгээхэд бэлэн болгох уу?', dirtyCount), { ok: tr('Бэлэн болгох') })
        .then((yes) => { if (yes) check(); else { close(); setReadyAt(null); } });
      return;
    }
    check();
  }, [finishQueued, edit, readyIssue, warn, setEditing, readySig, draftSig, canPerf, dirtyCount, pvDirty]);

  const floorOpts = useMemo(() => pkgFloors(pkg.group), [pkg.group]);

  /** Толгойн 2-р мөр — блокуудыг барилгын төрлөөр нь бүлэглэсэн нь. */
  const bands = useMemo(
    () => (sc ? seriesBands(pkg.key, sc.bld) : []),
    [pkg.key, sc],
  );

  /**
   * «EXCEL ТАТАХ» — хүснэгтийг ЯГ ДЭЛГЭЦ ДЭЭР ХАРАГДАЖ БУЙ хэлбэрээр.xlsx болгоно (2026-10-12).
   */
  const exportXlsx = useCallback(() => {
    if (!sc || rowsAll.length === 0 || calc.length === 0) return;
    const yn = (b: boolean) => (b ? tr('Тийм') : tr('Үгүй'));
    const filters = [
      `${tr('Бүлэг')}: ${grpAOpts.find((o) => o.oid === grpA)?.label.trim() ?? tr('Бүгд')}`,
      `${tr('Дэд бүлэг')}: ${grpBOpts.find((o) => o.oid === grpBEff)?.label.trim() ?? tr('Бүгд')}`,
      `${tr('Хуваарийн дагуу')}: ${yn(byPlan)}`,
    ].join(' · ');
    downloadFillXlsx({
      pkg: { label: pkg.label, group: pkg.group, floors: pkg.floors },
      sc, bands, rowsAll, calc, vis, fillMode, asOf, asOfOrig, extra: extraAll,
      pvPend, pvPreview, pending, pendDate, backChg, backOk, backChgDates,
      viewChanged: view?.changed, viewOk: view?.ok,
      info: { day: view?.day ?? today, snapDay, filters, user: user?.username ?? '', locked },
    });
  }, [sc, bands, rowsAll, calc, vis, fillMode, asOf, asOfOrig, pvPend, pvPreview, pending, pendDate,
    backChg, backOk, backChgDates, view, pkg, today, snapDay, user, locked, grpAOpts, grpA, grpBOpts, grpBEff, byPlan, extraAll]);

  const dateOpts = useMemo(() => {
    const cur = dt(asOf);
    return [...new Set(cur ? [...dates, cur] : dates)].sort();
  }, [dates, asOf]);

  /*
   * ТОМИЛГООГҮЙ ХЭРЭГЛЭГЧ — хоосон хуудас БИШ, шалтгааныг ил хэлнэ.
   */
  if (!view && groupOpts.length === 0) {
    return (
      <div className={st.wrap} ref={wrapRef}>
        <div className={st.error} role="status">
          {tr('Танд нэг ч багц хуваарилагдаагүй байна. «Хэрэглэгчдийн эрх удирдах → Гүйцэтгэлийн урсгал» хэсэгт админ таныг шатанд томилж, багц зааж өгсний дараа энэ хуудас нээгдэнэ.')}
        </div>
      </div>
    );
  }

  /* Виртуал гүйлгээний ЧИГЖЭЭСИЙН мөрийн өндөр — `useVirtualWindow.recalcWin` (rAF/эффект) хэмждэг. */
  // eslint-disable-next-line react-hooks/refs
  const rowH = rowHRef.current;

  return (
    <div className={`${st.wrap} ${wide ? st.wrapFull : ""}`} ref={wrapRef}>
      <div className={st.toolbar}>
        <PkgPctBadge pkgPct={pkgPct} pkg={pkg} otherPct={otherPct} otherPending={otherPending} pkgAll={pkgAll} />
        <span className={st.tbGrow} aria-hidden />
        <div className={st.tbTools}>
        {/*
          * БӨГЛӨХ ГОРИМ — хүснэгтийг бүтэн дэлгэц болгоно.
          */}
        <button
          type="button"
          className={wide ? st.fullBtnOn : st.fullBtn}
          onClick={() => setWide((v) => !v)}
          aria-pressed={wide}
          title={wide
            ? tr('Бүтэн дэлгэцээс гарах (Esc)')
            : tr('Хүснэгтийг бүтэн дэлгэцээр харна — засвар нээгдэхгүй')}
        >
          <span aria-hidden>{wide ? '✕' : '⛶'}</span>
          {wide ? tr('Багасгах') : tr('Бүтэн дэлгэц')}
        </button>
        {!locked && (canPerf || canObyemEdit) && (
          <button
            type="button"
            className={editing ? `${st.layerBtn} ${st.layerBtnOn}` : st.layerBtn}
            onClick={editing ? finishEdit : startEdit}
            aria-pressed={editing}
            title={editing
              ? tr('Засварыг дуусгана — илгээхэд бэлэн эсэхийг шалгаж, бэлэн бол «Илгээх» идэвхжинэ')
              : canPerf
                ? tr('Нүд засах горимыг нээнэ. Хаалттай үед санамсаргүй товшилтоор тоо өөрчлөгдөхгүй.')
                : tr('Зөвхөн «Инж. төлөвлөсөн обьём» баганыг засах горимыг нээнэ — гүйцэтгэлийн нүд таны эрхэд хаалттай.')}
          >
            {editing ? tr('Дуусгах') : tr('Бөглөх')}
          </button>
        )}
        <span className={st.tbSep} aria-hidden />
        <FilterBar
          locked={locked} busy={busy} noPerf={noPerf}
          pkg={pkg} setPkg={setPkg} confirmSwitch={confirmSwitch} groupOpts={groupOpts} floorOpts={floorOpts}
          asOf={asOf} setAsOf={setAsOfUser} dateOpts={dateOpts}
          grpA={grpA} setGrpA={setGrpA} grpAOpts={grpAOpts} grpBEff={grpBEff} setGrpB={setGrpB} grpBOpts={grpBOpts}
          byPlan={byPlan} setByPlan={setByPlan} today={today} planCount={planCount} resized={resized} resetAll={resetAll}
          fullView={showExtra} setFullView={setFullView}
          restoring={restoringUi}
        />
        {unrestricted && (
          <button
            type="button"
            className={st.layerBtn}
            onClick={exportXlsx}
            disabled={!sc || rows.length === 0 || calc.length === 0 || busy}
            title={tr('Хүснэгтийг яг одоо харагдаж буй хэлбэрээр (шүүлт · эвхэлт · ноорог · горим) Excel файл болгож татна')}
          >
            <span aria-hidden>⤓</span> {tr('Excel татах')}
          </button>
        )}
        </div>
        <span className={st.tbBreak} aria-hidden />
        {canPerf ? (
          <SubmitControls
            locked={locked} canSubmitNow={canSubmitNow} publish={publishBtn} busy={busy || restoringUi || !!frameTrunc} noEdit={noEdit}
            sendReady={sendReady}
            dirtyCount={dirtyCount} iAmDone={iAmDone} toggleDone={toggleDone} waitingOn={waitingOn}
            waitingLast={waitingLast}
            resendAsIs={curTgtOn && !tgtMismatch ? () => void resendAsIs() : undefined}
          />
        ) : !locked && (
          <span className={st.muted} role="status">{noPerfWhy ?? tr('Танд энэ багцыг бөглөх эрхгүй')}</span>
        )}
        <Participants participants={participants} byCount={byCount} doneBy={doneBy} />
        <ObyemToolbar
          canObyemEdit={canObyemEdit} pvSub={pvSub} pvCells={pvCells} sendObyem={sendObyem} pvBusy={pvBusy}
          canObyemApprove={canObyemApprove} locked={locked} decideObyemHere={decideObyemHere} pvErr={pvErr} pvNote={pvNote}
          pvReturned={pvReturned} withdrawObyemHere={withdrawObyemHere} me={user?.username ?? ''}
          partial={pvPartial} returnStuck={pvReturnStuck} note={pvApprovedNote}
        />

        {busy && <span className={st.muted}>{tr('ажиллаж байна…')}</span>}
        <span className={st.tbGrow} aria-hidden />
        <DraftStatus locked={locked} dirtyCount={dirtyCount} noPerf={noPerf} dropDraft={dropDraft} savedAt={savedAt} remoteState={remoteState}
          restoring={restoringUi} offline={offline} localFail={localFail}
          canDrop={reviewLock && permPerf && !reviewerOnly && !noEdit} />
      </div>
      {pastePrev && (
        <div className={st.pasteBar} role="status">
          <span>
            {tr('Буулгалтын урьдчилсан харагдац: {0} нүд бичигдэнэ (цэнхэр), {1} нүд татгалзагдана (улаан ✕ — нүдэн дээр шалтгаан нь).', pastePrev.ok.size, pastePrev.rej.size)}
          </span>
          <button type="button" className={st.publishBtn} onClick={confirmPaste} disabled={busy || restoringUi}>{tr('Бичих')}</button>
          <button type="button" className={st.layerBtn} onClick={cancelPaste}>{tr('Болих')}</button>
        </div>
      )}

      <FillNotices
        locked={locked} submitFailed={submitFailed} resend={resend} resending={resending} unmovedWarn={unmovedWarn}
        subReadErr={subReadErr} inReview={inReview} reviewStage={reviewStage} otherDaysInReview={otherDaysInReview}
        otherDaysReturned={otherDaysReturned} noEdit={noEdit} busy={busy} resumedOid={resumedOid}
        resumeReturned={resumeReturned} returned={returnedStaged}
        canAct={permPerf && !reviewerOnly} reviewLockDays={reviewLockDays}
        hyErr={!view && hyErr ? userError(hyErr) : null} frameTrunc={frameTrunc}
        returnInfo={returnInfo}
      />
      <StickyNotice msg={sticky && sticky.tag === pkg.key ? sticky.msg : null} onClose={unstick} />
      {tgtMismatch && draftTgt && (
        <p className={st.backNote} role="alert">
          {tr('Энэ ноорог {0}-ны буцаасан илгээлтийн засвар — өнөөдрийн илгээлтэд нийлүүлэхгүйн тулд «Илгээх» түгжээтэй. Тэр илгээлтийг сонгоно уу, эсвэл ноорогоо устгана уу.', msToDay(draftTgt[1]))}
          {!noEdit && (
            <button type="button" className={st.linkBtn} disabled={busy} onClick={() => void resumeReturned(draftTgt[0])}>
              {tr('Тэр илгээлтийг сонгох')}
            </button>
          )}
        </p>
      )}
      {!locked && heldN > 0 && (
        <p className={st.backNote} role="status">
          {tr('Ноорогт сэргээгээгүй {0} нүд тэмдэглэгдсэн байна (аль мөр нь тодорхойгүй, серверт өөрчлөгдсөн эсвэл хуучирсан) — 7 хоногийн дараа автоматаар хаягдана.', heldN)}
          {!noEdit && (
            <button type="button" className={st.linkBtn} disabled={busy} onClick={dropHeld}>
              {tr('Тэмдэглэсэн нүдийг хаях')}
            </button>
          )}
        </p>
      )}
      {backList.length > 0 && (
        <div className={st.backList}>
          <div className={st.backHead}>
            {tr('Буцаасан нүд')}
            <span className={st.backBadN}>{tr('засах {0}', backBad)}</span>
            <span className={st.backOkN}>{tr('зөвшөөрсөн {0}', backList.length - backBad)}</span>
          </div>
          <div className={st.backWrap}>
            {backList.map((c) => (
              <button
                key={`${c.row}:${c.block}${c.date ? `:${c.date}` : ""}`}
                type="button"
                className={`${st.backItem}${c.ok ? ` ${st.backItemOk}` : ""}`}
                title={`${c.no} · ${fixCyr(c.work)}${c.date ? ` · ${c.date === 's' ? tr('Эхлэх огноо') : tr('Дуусах огноо')}` : ""}\n${c.ok ? tr('Зөвшөөрсөн — засахгүй') : tr('Засах шаардлагатай')}`}
                onClick={() => setOwnJump((j) => ({ row: c.row, block: c.block, n: (j?.n ?? 0) + 1 }))}
              >
                <span className={st.backBlk}>{c.date ? `${c.block} · ${c.date === 's' ? tr('Эхлэх') : tr('Дуусах')}` : c.block}</span>
                <span className={st.backWork}>{fixCyr(c.work)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!view && backOkRes.unknown > 0 && backChg.size > 0 && (
        <p className={st.lockNote} role="status">
          {tr('Хянагчийн {0} зөвшөөрлийг энэ хуудасны мөрүүдтэй тулгаж чадсангүй (хуучин хэлбэр эсвэл хүснэгт өөрчлөгдсөн) — аль нүд зөвшөөрөгдсөнийг баталж чадахгүй тул улаан хүрээтэй нүдийг дахин хянах шаардлагатай.', backOkRes.unknown)}
        </p>
      )}
      {err && <p className={st.error} role="alert">{err}</p>}

      {busy && rows.length === 0 && (
        <div className={st.scroll}>
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className={st.skeletonRow}>
              <div className={st.skeletonCell} style={{ width: 40 }} />
              <div className={st.skeletonCell} style={{ width: 280 }} />
              <div className={st.skeletonCell} style={{ flex: 1 }} />
            </div>
          ))}
        </div>
      )}

      {/* Хоосон үр дүнг тайлбаргүй орхивол хэрэглэгч юу болсныг мэдэхгүй гацдаг. */}
      {!busy && !err && sc && rows.length === 0 && (
        <p className={st.muted}>{tr('Энэ багцад мөр олдсонгүй — өөр багц/хувилбар сонгоно уу, эсвэл хуудсыг дахин ачаална уу (F5).')}</p>
      )}
      {rows.length > 0 && sc && calc.length === 0 && (
        <p className={st.muted}>
          {tr('Тайлангийн огноо тодорхойлогдоогүй тул хүснэгт бодогдохгүй байна — Огноо сонгоно уу (жагсаалт ачаалагдаагүй бол хуудсыг дахин ачаална уу).')}
        </p>
      )}

      {rows.length > 0 && sc && calc.length > 0 && (
        <div className={st.restoreHost}>
        {restoringUi && (
          <div className={st.restoreGate} role="status" aria-busy="true">
            <p className={st.muted}>
              {tr('Таны ноорог сэргээгдэж байна — бүрэн сэргэсний дараа хүснэгт нээгдэнэ…')}
              {restoreSlow && (
                <>
                  {' '}{tr('Сэргээлт удаж байна (сүлжээ).')}{' '}
                  <button type="button" className={st.linkBtn} onClick={() => window.location.reload()}>
                    {tr('↻ Хуудас дахин ачаалах')}
                  </button>
                </>
              )}
            </p>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className={st.skeletonRow}>
                <div className={st.skeletonCell} style={{ width: 40 }} />
                <div className={st.skeletonCell} style={{ width: 280 }} />
                <div className={st.skeletonCell} style={{ flex: 1 }} />
              </div>
            ))}
          </div>
        )}
        <div
          className={restoringUi ? `${st.scroll} ${st.restoreHidden}` : st.scroll}
          ref={scrollRef}
          onScroll={onScroll}
          aria-hidden={restoringUi || undefined}
          inert={restoringUi}
        >
          <div className={st.tableWrap}>
          <div ref={colHlRef} className={st.colHl} aria-hidden="true" />
          <table
            className={cls("xl b32")}
            style={colStyle}
            onMouseOver={moveColHl}
            onMouseLeave={hideColHl}
            data-rep-total={vis.length}
          >
            <SheetHead sc={sc} nBld={nBld} bands={bands} grip={grip} extra={extra} compact={compact} />
            <tbody ref={tbodyRef}>
              {vis.length === 0 && byPlan && (
                <tr>
                  <td colSpan={nCols} className={st.hint} style={{ padding: "14px 10px" }}>
                    {tr("Өнөөдөр ({0}) хуваарьтай ажил алга. Бүх ажлыг харах бол «Хуваарийн дагуу»-г унтраа.", today)}
                  </td>
                </tr>
              )}
              {/* Дээд ЧИГЖЭЭС — зурагдаагүй мөрүүдийн өндрийг орлоно. */}
              {winFrom > 0 && (
                <tr aria-hidden="true" style={{ height: winFrom * rowH }}>
                  <td colSpan={nCols} style={{ padding: 0, border: 0 }} />
                </tr>
              )}
              <FillRows
                vis={vis} winFrom={winFrom} winTo={winTo} rowsAll={rowsAll} calc={calc} addedOids={addedOids}
                collapsed={collapsed} toggle={toggle} ro={ro} editing={editing} canObyemEdit={canObyemEdit} pvSub={pvSub} sc={sc}
                pvPend={pvPend} pvPreview={pvPreview} setPvPend={setPvPend} pending={pending} byMap={byMap} fillMode={fillMode}
                ovBase={ovBase} meKey={meKey} volMode={volMode} edit={edit} view={view} backChg={backChg} backOk={backOk}
                backChgDates={backChgDates}
                locked={locked} noEdit={noEdit} say={say} canPerf={canPerf} perfWhy={noPerfWhy} busy={busy} pctOnly={pctOnly} pctHintRef={pctHintRef}
                setVal={setVal} cellSeed={cellSeed} setEdit={setEdit} hitKey={hitKey} noPerf={noPerf} pasteBlock={pasteBlock}
                inputRef={inputRef} prevHint={prevHint} val={val} commit={commit} nextEditable={nextEditable}
                nextBlockEditable={nextBlockEditable} pendDate={pendDate} setPick={setPick} asOf={asOf} asOfOrig={asOfOrig}
                warn={warn}
                restoring={restoringUi} remainHint={remainHint} pastePrev={pastePrev} extra={extra} compact={compact} clearLocked={clearLocked}
              />
              {/* Доод ЧИГЖЭЭС — гүйлгэх зурвасны урт үнэн байлгана. */}
              {winTo < vis.length && (
                <tr
                  aria-hidden="true"
                  style={{ height: (vis.length - winTo) * rowH }}
                >
                  <td colSpan={nCols} style={{ padding: 0, border: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
        </div>
      )}

      <FillDatePicker pick={pick} setPick={setPick} busy={busy} say={say} setAsOf={setAsOfUser} commitDate={commitDate} pendDate={pendDate} />

      <NoticeToast notice={notice} onClose={() => setNotice(null)} />

    </div>
  );
}
