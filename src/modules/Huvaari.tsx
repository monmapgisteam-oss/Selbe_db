'use client';

/**
 * ХУВААРЬ — «Гүйцэтгэл бөглөх» хуудасны эхлэх/дуусах огноог ТӨЛӨВЛӨХ хэсэг.
 */

import { type PointerEvent as PEvt, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Section, Empty, Loading, Data, friendlyError, userError } from '@/components/ui';
import { useAuth } from '@/components/AuthGate';
import { hasPlanRole, huvaariAclReady, huvaariScope, planAdminCanApprove, planApproversOf, subscribeHuvaariAcl } from '@/lib/huvaariAcl';
import { ensureKomissRow, findKomissRow } from '@/lib/ulsiinKomiss';
import { roleForUser } from '@/lib/services';
import { dayKey, fixCyr, num } from '@/lib/format';
import {
  loadSchema, pkgFloors, PKG_GROUPS, PKGS, type Pkg, type Schema,
} from '@/modules/sheet/bagts.pkg';
import { applyUpdates, loadRows, msToDay, type SheetRow } from '@/modules/sheet/bagtsSheet';
import { insertAdds, type NewRow } from '@/modules/sheet/sheetFrame';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { ajilScope, subscribeAjilAcl } from '@/lib/ajilAcl';
import { huvaariViewScope } from '@/lib/huvaariView';
import { subscribeTypes } from '@/lib/roleTypes';
import { subscribe as subscribePerms } from '@/lib/permissions';
import { subscribeAcl as subscribeFlowAcl } from '@/lib/guitsetgelAcl';
import { subscribeObyemAcl } from '@/lib/obyemAcl';
import { subscribeButetsAcl } from '@/lib/butetsAcl';
import {
  DAY, endOf, spanDays, statusOf,
  type PlanRow, type Span, type Status,
} from '@/lib/plan';
import {
  codeIndex, downstreamCodes, effSpan, formatDeps, hierRelated, parseDeps,
  propagate, reaches, requiredStart, residualDeps, rollUpGroups, sameDep,
  type Dep,
} from '@/lib/deps';
import {
  loadPkgPlan, applyPlanEdits, keepMonths, keepRes, monthsOf,
  obyemResFields, type MonthRes, type PkgPlan, type PkgRes,
} from '@/lib/huvaariObyem';
import {
  approveGuard, claimHolderOf, claimPlan, decidePlan, isApprovedBy, loadHistory, loadPayload, loadPending, loadPendingBoth, loadSubmissionHead, partialBy, planTableState, PLAN_STATUS, REASON_MAX,
  clearPlanPartial, markPlanApprovedSeen, markPlanPartial, releasePlanClaim, setPlanNavBusy, submitPlan, withdrawPlan,
  renewPlanClaim, displayReason, serverNow, BLIND_NOTE_SRC,
  type PlanPayload, type PlanSubmission,
} from '@/lib/huvaariBatlah';
import { loadPlanNews, markPlanReturnedSeen, type PlanNews } from '@/components/navBadges';
import { isLostWrite } from '@/lib/lostWrite';
import { archivingBusy } from '@/lib/submission';
import { ajilApplyBusyFor } from '@/lib/ajilBatlah';
import { setNavDirty } from '@/lib/navGuard';
import { askConfirm } from '@/lib/confirm';
import { hdKey, kA, kH, kM, kN, kR, kS, parseKey } from '@/lib/huvaariDraft';
import h from './huvaari.module.css';
import {
  MAX_DAYS, PL_ROW, type ADraft, type Draft, type Drag, type HuvaariReview, type PlanKind, type ResDraft, type Zoom,
} from './huvaari/types';
import {
  aggExtra, dayToMs, groupSplits, hasDatedLeaf, inScope, obKey, obyemOutsideSpan, remapOids, rowSpan, sameMonths, sameRes, sameSpan, short, stText, toPlanRows,
  unbalancedBlocks, unbalancedObyem, workName,
} from './huvaari/util';
import { backSeenGet, backSeenSet, EMPTY_ADDS, EMPTY_FORM, writeAdds } from './huvaari/adds';
import { useLatest } from './huvaari/useLatest';
import { actUnion, allBlockRows, blockSpan, plainRows, unionSpans, type DispRow } from './huvaari/allBlocks';
import { useCalendar, useToday } from './huvaari/useCalendar';
import { lazyCache } from '@/lib/lazyCache';
import { useSideExtra } from './huvaari/useSideExtra';
import { useColWidths } from './huvaari/useColWidths';
import { ColGrip } from './huvaari/ColGrip';
import { downloadHuvaariPdf, HV_PDF_DEFAULT, type HvPdfOpts, type HvPdfRow } from '@/lib/huvaariPdf';
import { setReportSource } from '@/lib/reportSource';
import { huvaariBlocks } from '@/lib/huvaariReport';
import { useDragPlan } from './huvaari/useDragPlan';
import { useSharedDraft } from './huvaari/useSharedDraft';
import { planSyncSubmitted } from '@/lib/draftRowsRemote';
import { orphanAddsMsg, useAjil } from './huvaari/useAjil';
import {
  backMarkMapOf, buildPayloadOf, conflictMsg, conflictText, partialMsg, payloadToDrafts, reviewOidsOf, unknownMsg,
} from './huvaari/payload';
import { HAM_MAX, prepareSave, remapRowsFull } from './huvaari/savePrep';
import { FlowBox } from './huvaari/FlowBox';
import { AddBox, BlockRow, HowtoHint, TaskRow, type CellVia } from './huvaari/TaskRow';
import { PlanModal } from './huvaari/PlanModal';
import { LinkModal } from './huvaari/LinkModal';
import { Segmented, Switch, Toggle } from '@/components/Switch';

export type { HuvaariReview } from './huvaari/types';

const ST_CLASS: Record<Status, string> = {
  done: h.tlDone, run: h.tlRun, todo: h.tlTodo, late: h.tlLate, none: h.tlNone,
};

async function confirmDropMarks(n: number): Promise<boolean> {
  return n === 0 || askConfirm(tr('Зөвшөөрсөн {0} мөрийн тэмдэглэгээ хадгалагдахгүй. Шийдвэргүй хаах уу?', num(n)), { danger: true, ok: tr('Хаах') });
}

/*
 * БИЧИЛТИЙН ХАРИУ АЛДАГДСАН уу (`isLostWrite`) — үр дүн ТОДОРХОЙГҮЙ алдаа (timeout · сүлжээ · JSON биш хариу ·
 * токен шинэчлэлт дууссан). Серверийн ТОДОРХОЙ татгалзал (ArcGIS `error.code`, мөрийн `success:false`)
 * ЭНД орохгүй. `applyUpdates`/`applyPlanEdits` нь ЭХНИЙ хүсэлт замдаа алдагдсан ч `written = 0` тавьдаг
 * тул урьд нь `save` хагас бичилтийн тэмдгийг арилгаж, зохиогч татах/батлагч буцаах боломжтой болж —
 * хуудсанд СУУСАН огноо «татсан» саналынх болж үлддэг байв (2026-10-08).
 */
/** Хариу алдагдсан хагас бичилтийн мессеж (`partialMsg`-ийн адил, `prev` хойно нь) — 2026-10-08 */
const lostWriteMsg = (prev: string) => tr('Хариу ирээгүй — хуудсанд бичигдсэн эсэх тодорхойгүй; дахин «Батлах» дарж дуусгана уу (буцаах боломжгүй).')
  + (prev ? ` (${prev})` : '');

const minutesSince = (ms: number | null | undefined, now: number): number => (ms == null ? 0 : Math.max(0, Math.floor((now - ms) / 60_000)));
const frameIdOf = (x: { rows: readonly { oid: number }[]; snapshot: number | null }): string =>
  `${x.snapshot ?? ''}|${x.rows.map((r) => r.oid).join(',')}`;
const payHasOb = (p: PlanPayload): boolean => Object.keys(p.obyem ?? {}).length > 0 || Object.keys(p.obres ?? {}).length > 0;
const BLIND_NOTE = BLIND_NOTE_SRC;
const UNAPPROVED_RE = /^Зөвшөөрөгдөөгүй (\d+) мөр: (.*)$/;
/**
 * ХАДГАЛСАН БУЦААЛТЫН ШАЛТГААНЫГ ДЭЛГЭЦЭНД (2026-10-12, аудит №8) — lib-ийн `displayReason` (системийн тогтмол мөрүүд) +
 * ЭНЭ модулийн «Зөвшөөрөгдөөгүй N мөр: …» мөр. Хэрэглэгчийн бичсэн текст ХЭВЭЭР. `HuvaariBatlah` ч үүгээр.
 */
export function showPlanReason(raw: string | null | undefined): string {
  return displayReason(raw).split('\n').map((ln) => {
    const m = UNAPPROVED_RE.exec(ln.trim());
    return m ? tr('Зөвшөөрөгдөөгүй {0} мөр: {1}', num(Number(m[1])), m[2]) : ln;
  }).join('\n');
}

type XLockSet = { oids: Set<number>; des: Set<number>; ham: Set<number>; hamDes: Set<number>; ob: Set<number> };
const xLockSetOf = (p: PlanPayload): XLockSet => {
  const oids = new Set<number>();
  const des = new Set<number>();
  for (const k of [...Object.keys(p.actual ?? {}), ...Object.keys(p.res ?? {})]) {
    const o = Number(k);
    if (!Number.isFinite(o)) continue;
    oids.add(o);
    const d = p.keys?.[k];
    if (d != null) des.add(d);
  }
  for (const k of Object.keys(p.obres ?? {})) {
    const d = Number(k.slice(0, k.indexOf('|')));
    if (Number.isFinite(d)) des.add(d);
  }
  const ham = new Set<number>();
  const hamDes = new Set<number>();
  for (const k of Object.keys(p.deps ?? {})) {
    const o = Number(k);
    if (!Number.isFinite(o)) continue;
    ham.add(o);
    const d = p.keys?.[k];
    if (d != null) hamDes.add(d);
  }
  const ob = new Set<number>();
  for (const k of Object.keys(p.obyem ?? {})) {
    const d = Number(k.slice(0, k.indexOf('|')));
    if (Number.isFinite(d)) ob.add(d);
  }
  return { oids, des, ham, hamDes, ob };
};
/** Мөр (oid · ажлын код) түгжээнд орох эсэх — `xLockWhy` ба `xLockCheck`-ийн нэг нөхцөл */
const xLockHit = (st: XLockSet, oid: number | null, des: number | null): boolean =>
  (oid != null && st.oids.has(oid)) || (des != null && st.des.has(des));
type UndoSnap = {
  spans: Map<number, (Span | null)[]>;
  ob: Map<string, Map<string, number> | undefined>;
  obRes: Map<string, Map<string, MonthRes> | undefined>;
  ham: Map<number, string | undefined>;
  aD: Map<number, { start: (number | null)[]; end: (number | null)[] } | undefined>;
  rD: Map<number, { hun: number | null; mashin: number | null } | undefined>;
  full: boolean;
};
/** `snapUndo`-ийн оролт — хөндөгдөх хэсгүүд (2026-10-09) */
type UndoPart = { spans?: Map<number, (Span | null)[]>; ob?: Iterable<string>; ham?: number[]; aD?: number[]; rD?: number[]; full?: boolean };
function undoTouched(u: UndoSnap, keys: ReadonlySet<string>): boolean {
  for (const k of keys) {
    const p = parseKey(k);
    if (!p) continue;
    if (p.type === 's' && u.spans.has(p.oid)) return true;
    if (p.type === 'h' && u.ham.has(p.oid)) return true;
    if (p.type === 'a' && u.aD.has(p.oid)) return true;
    if (p.type === 'r' && u.rD.has(p.oid)) return true;
    if (p.type === 'm' && (u.full || u.ob.has(p.key))) return true;
    if (p.type === 'n' && (u.full || u.obRes.has(p.key))) return true;
  }
  return false;
}
function fullMonths<V>(snap: Map<string, V> | undefined, cur: Map<string, V>): Map<string, V> | null {
  return snap ? new Map([...snap, ...cur]) : null;
}
const UNDO_MAX = 30;
const RESTORE_SLOW_MS = 45_000;
type UndoStk = { u: UndoSnap[]; r: UndoSnap[] };
const UNDO_EMPTY: UndoStk = { u: [], r: [] };
/** `null` — хоёуланг цэвэрлэх (хуучин `setUndoSnap(null)`); функц — цэвэр шинэчлэл */
function undoStkReduce(s: UndoStk, a: null | ((s: UndoStk) => UndoStk)): UndoStk {
  if (a === null) return s.u.length || s.r.length ? UNDO_EMPTY : s;
  return a(s);
}
/** Шүүлтийн чип (2026-10-08) — `dirtyOids` · уялдааны зөрчил · хоцорсон; байгаа шүүлттэй БА-аар хослоно */
type Chip = 'dirty' | 'viol' | 'late' | 'unbal';
/** Өөрчлөлтийн жагсаалтын мөр (2026-10-08) — хяналтын самбар · илгээхийн өмнөх хураангуй · «хадгалаагүй N» */
type Chg = {
  oid: number; no: string; work: string; group: boolean;
  /** Өөрчлөгдсөн блокууд (суурьтай зөрсөн) ба эхний харуулах блок */
  blks: number[]; b0: number;
  old: Span | null; next: Span | null;
  /** Эхлэх огнооны шилжилт (хоног) ба үргэлжлэх хугацааны зөрүү — хоёулаа огноотой үед л */
  shift: number | null; dur: number | null;
  flags: string[];
};
/** Фокус оролтод байна уу — хурдан товчлуур (Ctrl+Z · `]` · Space) оролтыг хөндөхгүй (2026-10-08) */
const inInput = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && !!el.closest('input, textarea, select, [contenteditable="true"]');
const keyIgnored = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  if (el === document.body || el === document.documentElement) return false;
  if (inInput(el) || el.closest('[role="complementary"]')) return true;
  return !el.closest('[data-huvaari-root]');
};

export function Huvaari({
  jump, onJumpDone, review,
}: {
  /** Батлагчийн хяналтын горим — байвал засвар хаалттай, бүтэн дэлгэц */
  review?: HuvaariReview;
  /**
   * «ХУВААРЬ БАТЛАХ» ДАРААЛАЛААС ШИЛЖИЖ ИРСЭН БАТЛАХ ХҮСЭЛТ (2026-09-16).
   */
  jump?: { pkgKey: string; oid: number } | null;
  /** Хүсэлтийг НЭГ л удаа хэрэглэсний дараа цэвэрлэнэ */
  onJumpDone?: () => void;
} = {}) {
  const { user, status } = useAuth();
  const [hvN, setHvN] = useState(0);
  useEffect(() => subscribeHuvaariAcl(() => setHvN((x) => x + 1)), []);
  const [pkg, setPkg] = useState<Pkg>(
    () => (review ? PKGS.find((p) => p.key === review.pkgKey) : undefined) ?? PKGS[0],
  );
  const pkgKeyRef = useLatest(pkg.key);
  /**
   * БҮХ БАГЦ ХАРАГДАНА — ХАРАХ нь ЗАСАХААС ТУСДАА (2026-09-09).
   *
   *    ОДООГИЙН ДҮРЭМ:
   *      · хуваарилалт БАЙХГҮЙ (`[]`, аль ч үүрэгт)  → БҮХ багц (харах эрх
   *        нь `views`-ээр аль хэдийн шийдэгдсэн; сонгогч хоосон болохгүй)
   *      · хуваарилалт БАЙГАА                        → ЗӨВХӨН өөрийн багц
   *      · `null` (хязгааргүй)                       → БҮХ багц
   *
   *    Хоёр үүргийн НЭГДЭЛ: зохиогч Багц 3-т, батлагч Багц 5-д томилогдсон
   *    хүн хоёуланг нь харна — эс бөгөөс батлах ажлаа хийж чадахгүй.
   */
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  const [ajN, setAjN] = useState(0);
  useEffect(() => subscribeAjilAcl(() => setAjN((x) => x + 1)), []);
  const [typesN, setTypesN] = useState(0);
  useEffect(() => {
    const f = () => setTypesN((x) => x + 1);
    const offs = [subscribeTypes(f), subscribePerms(f), subscribeFlowAcl(f), subscribeObyemAcl(f), subscribeButetsAcl(f)];
    return () => { for (const o of offs) o(); };
  }, []);
  const groupOpts = useMemo(() => {
    if (status === 'off') return PKG_GROUPS;
    const v = huvaariViewScope(user?.username);
    const e = hasCap(user?.username, 'addRow') ? ajilScope(user?.username, 'editor') : [];
    if (v == null || e == null) return PKG_GROUPS;
    const mine = new Set([...v, ...e]);
    return PKG_GROUPS.filter((g) => mine.has(g));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, status, hvN, capN, ajN, typesN]);
  /**
   * ЗАСАХ ЭРХ — тусад нь олгодог (`caps`) + багцын хүрээ.
   */
  const [viewSavedAt, setViewSavedAt] = useState<string | null>(null);
  const viewSaved = viewSavedAt === pkg.key;
  const setViewSaved = useCallback((on: boolean) => setViewSavedAt(on ? pkg.key : null), [pkg.key]);
  const canEditRole = useMemo(
    () => !review && (status === 'off' || inScope(huvaariScope(user?.username, 'author'), pkg.group)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, status, hvN, pkg.group, review],
  );

  /**
   * БАТЛАХ ЭРХ — `plan`-аас ТУСДАА (2026-09-07).
   */
  const canApprove = useMemo(
    () => status === 'off' || inScope(huvaariScope(user?.username, 'approver'), pkg.group),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, status, hvN, pkg.group],
  );

  /**
   * МӨР НЭМЭХ ЭРХ (2026-09-24, FillNew-ээс шилжсэн) — `addRow` эрх + нэмэлт
   * ажлын ЗАСВАРЛАГЧИЙН хүрээ (`ajilAcl`, `null` = хязгааргүй).
   */
  const canAddRow = useMemo(() => {
    if (review) return false;
    if (!hasCap(user?.username, 'addRow')) return false;
    if (status === 'off' || roleForUser(user?.username) === 'super') return true;
    const sc0 = ajilScope(user?.username, 'editor');
    return sc0 === null || sc0.includes(pkg.group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, status, capN, ajN, pkg.group, review]);
  const viewOnly = !review && status !== 'off' && !canEditRole && !canApprove && !canAddRow;

  /**
   * ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТ — байвал хуваарь ТҮГЖИГДЭНЭ.
   */
  const [pending, setPending] = useState<PlanSubmission | null>(null);
  const [pendingOther, setPendingOther] = useState<PlanSubmission | null>(null);
  /** Хоёр табын хүлээгдэж буй илгээлт — `[kind]` эффект солино (deps `[kind]` хэвээр) */
  const pendRef = useLatest({ cur: pending, other: pendingOther });
  /** Батлах хүснэгт бэлэн эсэх — үгүй бол шалтгааныг ИЛ хэлнэ, чимээгүй нуухгүй */
  const [flowReady, setFlowReady] = useState<boolean | null>(null);
  /**
   * БЭЛЭН БИШ БОЛ ЯАГААД — баннерт ЯГ энэ шалтгааныг бичнэ (2026-09-11).
   */
  const [flowWhy, setFlowWhy] = useState<string>('');
  /**
   * СҮҮЛИЙН ШИЙДВЭР — хүлээгдэж буй илгээлт байхгүй үед харуулна.
   */
  const [lastDecision, setLastDecision] = useState<PlanSubmission | null>(null);
  /**
   * «Улсын комисс» ШИНЭ ЖААЗ бичигдсэний дараа хуваалцсан ноорогийг (hd) ШИНЭ oid руу
   * зөөх зураглал (`remapOids`, хадгалахтай ижил дүрэм) — сэргээх эффект нэг удаа
   * хэрэглээд тэглэнэ. `pkg` — өөр багцад хэрэглэхгүй. (2026-09-25 аудит)
   */
  const hdRemapRef = useRef<{ pkg: string; map: Map<number, number> } | null>(null);
  /**
   * БАТЛАХ УРСГАЛЫН АЛХАМЫН ТЭМДЭГ — `save` дуудагдсан уу (батлах эффект доор).
   */
  const savedRef = useRef(false);
  /**
   * ХАГАС БИЧИГДСЭН БАТЛАЛТ — `oid` (2026-10-01).
   */
  const partialRef = useRef<number | null>(null);
  const lostWriteRef = useRef<number | null>(null);
  const wroteSomeRef = useRef<number | null>(null);
  const frameMovedRef = useRef<number | null>(null);
  const claimAtRef = useRef<number | null>(null);
  const failStepRef = useRef<{ oid: number; step: 'dates' | 'obyem'; written?: number; total?: number } | null>(null);
  /**
   * ОЛОН БЛОК — ЕРӨНХИЙ СОНГОЛТ (2026-09-29, хэрэглэгч: «өмнө нь нэг ажил дээр блок сонгож
   * төлөвлөж болдог байсан бол төлөвлөгөөг бүхэлд нь олон блок сонгож төлөвлөх боломжтой
   * болгох; нэг ажил олон блок сонгох хэвээр үлдэнэ»).
   */
  const [gBlks, setGBlks] = useState<Set<number>>(() => new Set());
  /** Илгээх/шийдвэрлэх цонх */
  /* `reject` — хяналтын горимын буцаах цонх (2026-09-25) */
  const [flowBox, setFlowBox] = useState<'send' | 'decide' | 'reject' | null>(null);
  /**
   * Цонхны ТАЙЛБАР/ШАЛТГААНЫ текст — ЭЦЭГТ (2026-09-23). `FlowBox` дотор
   *    байсан тул ард нь дарж/Esc-ээр хаахад бичсэн шалтгаан устдаг байв.
   *    Зөвхөн илгээлт/шийдвэр АМЖИЛТТАЙ болоход л цэвэрлэнэ.
   */
  const [flowTxt, setFlowTxt] = useState('');
  const [ajBox, setAjBox] = useState(false);
  const [ajTxt, setAjTxt] = useState('');
  /**
   * БАТЛАХ ЯВЦАД — батлагдаж буй илгээлтийн `oid`.
   */
  const [approving, setApproving] = useState<number | null>(null);
  /**
   * УРЬДЧИЛАН ХАРАХ — илгээгдсэн хуваарийг хуанли дээр НООРОГ болгон буулгав уу.
   */
  const [previewing, setPreviewing] = useState(false);
  const savedView = viewSaved && !review && !previewing && approving == null && pending == null;
  const canEdit = canEditRole && !savedView;

  /**
   * «Улсын комисс» автомат нэмэлтийн хаалга — ачаалалтын эффект ref-ээр уншина (`canEdit`).
   */
  const komissGateRef = useLatest(() => canEdit && status !== 'off' && kind === 'plan' && pending == null && approving == null && !previewing);
  /** `previewing`-ийн одоогийн утга — async урсгалд уншихад (2026-09-25) */
  const previewingRef = useRef(previewing);
  useEffect(() => { previewingRef.current = previewing; }, [previewing]);
  /**
   * ЗЭРЭГЦЭЭ ӨӨРЧЛӨЛТӨӨР урьдчилан харалт УНАСАН илгээлтийн `oid` (2026-09-25 аудит #1).
   */
  const [previewBad, setPreviewBad] = useState<number | null>(null);
  /**
   * БАТЛАГЧИЙН ЗӨВШӨӨРСӨН мөр (хяналтын горим) — `Guitsetgel.okKeys`-ийн загвар.
   */
  const [okRows, setOkRows] = useState<Set<number>>(new Set());
  /**
   * ГҮЙЦЭТГЭГЧИЙН ТАЛ — буцаагдсан саналыг ноорогт буулгасны дараах тэмдэглэгээ.
   * `oid` = тэр илгээлт; `ok` = батлагчийн зөвшөөрсөн мөрүүд. Бусад өөрчлөгдсөн
   * мөр улаан (засах ёстой). Дахин илгээх, багц/төрөл солиход арилна.
   */
  const [backMarks, setBackMarks] = useState<{ oid: number; ok: Set<number>; pay: PlanPayload } | null>(null);

  /**
   * ЗАСВАР ТҮГЖИГДСЭН ҮҮ — хүлээгдэж буй илгээлт байхад ГАРААР засахгүй.
   */
  const locked = pending != null && approving == null;

  /**
   * ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТ нь ӨӨРИЙНХ ҮҮ (2026-09-08).
   */
  const isOwnSubmission = useMemo(() => {
    const me = (user?.username ?? '').trim().toLowerCase();
    return !!pending && !!me && me === pending.author.trim().toLowerCase();
  }, [pending, user]);
  const [clock, setClock] = useState(() => serverNow());
  const pendingHolder = useMemo(() => (pending ? claimHolderOf(pending, clock) : null), [pending, clock]);
  const pendingPartial = useMemo(() => (pending ? partialBy(pending.status, pending.reason) : null), [pending]);
  const clockOn = (isOwnSubmission && pendingPartial == null && !!pendingHolder) || (!review && pending != null);
  useEffect(() => {
    if (!clockOn) return undefined;
    const t0 = window.setTimeout(() => setClock(serverNow()), 0);
    const id = window.setInterval(() => setClock(serverNow()), 60_000);
    return () => { window.clearTimeout(t0); window.clearInterval(id); };
  }, [clockOn]);

  const [sc, setSc] = useState<Schema | null>(null);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [frameOld, setFrameOld] = useState<{ day: string; shownDay: string } | null>(null);
  const [planNews, setPlanNews] = useState<PlanNews[] | null>(null);
  const [busy, setBusyRaw] = useState(false);
  const busyNowRef = useRef(false);
  const busyGenRef = useRef(0);
  const setBusy = useCallback((v: boolean) => {
    busyNowRef.current = v;
    busyGenRef.current++;
    setBusyRaw(v);
  }, []);

  /* ── НЭМЭЛТ АЖИЛ (2026-09-24; `huvaari/adds.ts`-ийн `tmpOid`) ── */
  /**
   * Нэмсэн мөр — БАГЦЫН ТҮЛХҮҮРТЭЙ ХАМТ хадгална.
   */
  const [addsSt, setAddsSt] = useState<{ key: string; list: NewRow[] }>({ key: '', list: [] });
  const adds = addsSt.key === pkg.key ? addsSt.list : EMPTY_ADDS;
  const setAdds = useCallback((fn: (prev: NewRow[]) => NewRow[]) => {
    setAddsSt((st) => ({ key: pkg.key, list: fn(st.key === pkg.key ? st.list : []) }));
  }, [pkg.key, setAddsSt]);
  useEffect(() => { if (addsSt.key === pkg.key) writeAdds(pkg.key, addsSt.list); }, [addsSt, pkg.key]);
  /** `adds`-ын одоогийн утга — async урсгалд синхрон уншихад (LS-д шууд бичих) */
  const addsStRef = useRef(addsSt);
  useEffect(() => { addsStRef.current = addsSt; }, [addsSt]);
  /**
   * БҮТЭН ДЭЛГЭЦ — ЗӨВХӨН хуваарийн хүснэгт (2026-09-17, хэрэглэгч: «Гүйцэтгэл
   * бөглөх»-ийнхтэй адил). `FillNew`-ийн `wide`-тай ИЖИЛ загвар: хөтчийн
   * `requestFullscreen` БИШ, `position: fixed` давхарга — дотоод цонх (popup
   * хуанли, батлах асуулт) хэвээр ажиллана. Сешн хооронд санагдана.
   */
  const [wide, setWide] = useState(() => {
    try { return localStorage.getItem('selbe-huvaari-wide') === '1'; } catch { return false; }
  });
  /*
   * ОГНОО · НӨӨЦИЙН БАГАНЫГ ХУРААХ (2026-09-23, хэрэглэгч: «энэ хэсгийг хурааж
   * нээдэг байж болох уу»). Хураахад «Гэрээ эхлэх … Техник» 10 багана нуугдаж,
   * зүүн самбар нарийсч хуанлид зай өгнө; код · нэр · хамаарал үлдэнэ.
   */
  const [cols, setCols] = useState(() => {
    try { return localStorage.getItem('selbe-huvaari-cols') !== '0'; } catch { return true; }
  });
  /** Зүүн жагсаалтыг чирж өргөсгөх нэмэлт пиксел (2026-10-04, `useSideExtra`) */
  const { elRef: sideRef, style: sideStyle, grip: sideGrip } = useSideExtra();
  const colAct = !!sc && sc.aStart.some(Boolean);
  const colRes = !!sc && !!(sc.f.hunHuch || sc.f.mashin);
  const cOn = cols ? 1 : 0;
  const cAct = cols && colAct ? 1 : 0;
  const cRes = cols && colRes ? 1 : 0;
  const colW = useColWidths({
    des: 1, work: 1, ham: 1,
    gs: cOn, ge: cOn, gd: cOn, ps: cOn, pe: cOn, pd: cOn,
    as: cAct, ae: cAct,
    rh: cRes, rm: cRes,
  });
  const colElRef = colW.elRef;
  const sideAndColRef = useCallback((node: HTMLDivElement | null) => { colElRef(node); return sideRef(node); }, [colElRef, sideRef]);
  useEffect(() => {
    try { localStorage.setItem('selbe-huvaari-cols', cols ? '1' : '0'); } catch { /* хаалттай орчин */ }
  }, [cols]);
  /*
   * «БҮХ БЛОК» ХАРАГДАЦ (2026-10-04, хэрэглэгч: «бүх блокийн хуваарийг зэрэг харах
   * боломжтой болго»). Ажил бүрийн доор хуваарьтай блок бүрийн дэд мөр (`allBlocks.ts`).
   */
  const [allBlk, setAllBlk] = useState(false);
  const allBackRef = useRef(false);
  useEffect(() => {
    try { localStorage.setItem('selbe-huvaari-wide', wide ? '1' : '0'); } catch { /* хаалттай орчин */ }
  }, [wide]);
  const isWide = !!review || wide;
  const isReview = !!review;
  const reviewCloseRef = useLatest(review?.onClose);
  const escBlockRef = useLatest(busy || approving != null);
  const okNRef = useLatest(okRows.size);
  useEffect(() => {
    if (!isWide) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || keyIgnored(e.target) || document.querySelector('[role="dialog"]')) return;
      if (isReview) {
        if (escBlockRef.current) return;
        void confirmDropMarks(okNRef.current).then((ok) => { if (ok && !escBlockRef.current) reviewCloseRef.current?.(); });
      } else setWide(false);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [isWide, isReview, escBlockRef, reviewCloseRef, okNRef]);
  const [err, setErr] = useState('');
  const [errList, setErrList] = useState<{ msg: string; oid?: number; b?: number }[]>([]);
  /**
   * БУЦААЛТЫН СТЕК + ДАХИН ХИЙХ (2026-10-09; урьд нь нэг түвшин — 2026-10-08, `UndoSnap`).
   */
  const [undoStk, setUndoSnap] = useReducer(undoStkReduce, UNDO_EMPTY);
  const undoSnap = undoStk.u.length ? undoStk.u[undoStk.u.length - 1] : null;
  const redoSnap = undoStk.r.length ? undoStk.r[undoStk.r.length - 1] : null;
  const obFullRef = useRef(new Map<string, Map<string, number>>());
  const obResFullRef = useRef(new Map<string, Map<string, MonthRes>>());
  /** `applyChanges` агшин авахгүй (буцаалт өөрөө · чирэлтийн цуцлалт) — синхрон туг */
  const undoSkipRef = useRef(false);
  /** Чирэлтийн ЭХНИЙ `commit`-д л агшин авна — хоног бүрийн алхамд биш */
  const undoDragSeenRef = useRef(false);
  const undoBatchRef = useRef(false);
  const undoMergeRef = useRef(false);
  /** Нүдний огноо (Enter) нээсэн цонхны мөр — `undoMergeRef`-ийн эх; цонх хаагдахад арилна (2026-10-09) */
  const undoOpenRef = useRef<number | null>(null);
  const hdOtherRef = useRef<(k: string) => boolean>(() => false);
  /** Гинжээр дагаж шилжсэн хамаарагчийн тоо — түр мэдэгдэл (2026-10-08) */
  const [chainN, setChainN] = useState(0);
  const [chainList, setChainList] = useState<{ lab: string; d: number | null }[]>([]);
  const [chainSeq, setChainSeq] = useState(0);
  const [chainUnbal0, setChainUnbal0] = useState<ReadonlySet<number> | null>(null);
  const [progress, setProgress] = useState('');
  /** Шүүлтийн чипүүд (2026-10-08) */
  const [chips, setChips] = useState<Set<Chip>>(() => new Set());
  /** «Өөрчлөлт N» хажуугийн самбар нээлттэй эсэх (2026-10-08) */
  const [chgOpen, setChgOpen] = useState(false);
  const today = useToday();
  /**
   * ХУВААРЬ АЧААЛАХ АЛДАА — `err`-ээс ТУСДАА (2026-10-01, «хэрэглэгч: бүгдийг зас»).
   */
  const [loadErr, setLoadErr] = useState<Error | null>(null);
  /** «Дахин оролдох» — ачаалах эффектийг дахин ажиллуулах тоолуур */
  const [reloadN, setReloadN] = useState(0);
  const [note, setNote] = useState('');
  /** «Улсын комисс» автомат нэмэлтийн мэдэгдэл — `note`-оос ТУСДАА: ноорог сэргээх эффект `note`-ыг дардаг (2026-09-25 аудит) */
  const [komissNote, setKomissNote] = useState('');

  const [draft, setDraft] = useState<Draft>(new Map());
  /**
   * УЯЛДААНЫ НООРОГ: `oid` → «18FS3,…» текст. Огнооны ноорогтой (`draft`)
   * ЗЭРЭГЦЭЭ тусдаа — уялдаа нь огноо хөндөлгүй өөрчлөгдөж болно (мөн эсрэгээр).
   * Хадгалахад хоёулаа нэг `applyUpdates`-д нийлнэ.
   */
  const [ham, setHam] = useState<Map<number, string>>(new Map());
  /**
   * БОДИТ ОГНОО ба НӨӨЦИЙН ноорог (2026-09-23) — `draft`/`ham`-тай ЗЭРЭГЦЭЭ,
   * тусдаа. Хадгалахад бүгд нэг `applyUpdates`-д, батлуулахад нэг payload-д
   * нийлнэ (`actual`/`res`). Popup-аас л засагдана (зүүн багана зөвхөн харуулна).
   */
  const [aDraft, setADraft] = useState<ADraft>(new Map());
  const [resDraft, setResDraft] = useState<ResDraft>(new Map());
  const [sel, setSel] = useState<number | null>(null);
  const [cellEdit, setCellEdit] = useState<number | null>(null);

  /* ══════ САРЫН ОБЬЁМ (тусдаа үйлчилгээ, `huvaariObyem.ts`) ══════ */
  /** Хадгалагдсан задаргаа — ажлын код → блок → сар → обьём */
  const [obPlan, setObPlan] = useState<PkgPlan>(new Map());
  /**
   * Задаргааны АЧААЛЛЫН ТӨЛӨВ (2026-09-24) — хуваалцсан ноорогийн суурьт.
   */
  const [obState, setObState] = useState<'loading' | 'ok' | 'fail'>('loading');
  const obLoadedRef = useRef(false);
  const retryOb = () => {
    const key = pkg.key;
    setObState('loading');
    loadPkgPlan(key)
      .then((r) => {
        if (pkgKeyRef.current !== key) return;
        setObPlan(r.plan); setObRes(r.res); setObOids(r.oids); setObDups(r.dups); setObState('ok'); obLoadedRef.current = true;
      })
      .catch(() => { if (pkgKeyRef.current === key) setObState(obLoadedRef.current ? 'ok' : 'fail'); });
  };
  /** `dkey → ObjectID` — бичихэд аль мөрийг шинэчлэхийг мэдэхэд */
  const [obOids, setObOids] = useState<Map<string, number>>(new Map());
  /**
   * ДАВХАРДСАН мөрийн ИЛҮҮДЭЛ OID-ууд (2026-09-08).
   */
  const [obDups, setObDups] = useState<number[]>([]);
  /**
   * ХАДГАЛААГҮЙ задаргаа — `${ажлын код}|${блок}` → сар → обьём.
   */
  const [obDraft, setObDraft] = useState<Map<string, Map<string, number>>>(new Map());
  /**
   * САРЫН НӨӨЦ — хүн хүч · машин механизм (2026-09-24, хэрэглэгч: «сар бүрд
   * обьём · хүн хүч · машин механизм»). `obPlan`/`obDraft`-тай ЗЭРЭГЦЭЭ, тусдаа
   * Map (`${код}|${блок}` → сар → {hun, mashin}) — обьёмын утгын хэлбэр
   * хөндөгдөхгүй (`huvaariObyem.ts`-ийн `MonthRes` тайлбар). Хадгалахад
   * мөрийн `hun_huch`/`mashin_mehanizm` = бүх блок · сарын НИЙЛБЭР.
   */
  const [obRes, setObRes] = useState<PkgRes>(new Map());
  const [obResDraft, setObResDraft] = useState<Map<string, Map<string, MonthRes>>>(new Map());
  /** Сарын хүснэгтэд нөөцийн талбар БАЙНА УУ — `null` = мэдэхгүй (бичихийг оролдоно) */
  const [obResFields, setObResFields] = useState<{ hun: boolean | null; mashin: boolean | null }>({ hun: null, mashin: null });
  useEffect(() => { void obyemResFields().then(setObResFields); }, []);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  /**
   * ХАРАГДАХ ТҮВШИН — «Түвшин 1 2 3 4 5» зурвасын идэвхтэй товч.
   */
  const [lvl, setLvl] = useState(0);
  /**
   * Popup хуанли нээгдсэн мөрийн OID.
   */
  const [modal, setModal] = useState<number | null>(null);
  const [modalFrom, setModalFrom] = useState<number | null>(null);

  /**
   * ШҮҮЛТҮҮР. `filter` нь түргэн таб, бусад нь сонголт.
   */
  const [filter, setFilter] = useState<'all' | 'has' | 'none' | 'partial'>('all');
  const grpNoSpan = filter === 'none';
  const [fYear, setFYear] = useState('all');
  /**
   * БҮЛГЭЭР ШҮҮХ — сонгосон бүлэг ба ДОТОРХ бүх ажлыг л үлдээнэ.
   */
  const [fGrp, setFGrp] = useState<'all' | number>('all');

  /* ── Хуанлийн төлөв ── */
  /**
   * ХУВААРИЙН ТӨРӨЛ — «Төлөвлөгөө» эсвэл «Гэрээ» (2026-09-11).
   */
  const [kind, setKind] = useState<PlanKind>(review?.kind ?? 'plan');
  const kindRef = useLatest(kind);

  /**
   * НӨГӨӨ ТАБЫН ИЛГЭЭЛТИЙН БОДИТ ОГНОО · НӨӨЦИЙН ТҮГЖЭЭ (2026-10-09).
   */
  const [xLock, setXLock] = useState<{ oid: number; set: XLockSet | null } | null>(null);
  const pendOtherOid = pendingOther?.oid ?? null;
  useEffect(() => {
    if (pendOtherOid == null) return undefined;
    let dead = false;
    void loadPayload(pendOtherOid).then((p) => {
      if (dead) return;
      setXLock({ oid: pendOtherOid, set: p ? xLockSetOf(p) : null });
    }).catch(() => { if (!dead) setXLock({ oid: pendOtherOid, set: null }); });
    return () => { dead = true; };
  }, [pendOtherOid]);
  /** Мөрийн бодит огноо/нөөц түгжээтэй бол ШАЛТГААН, эс бөгөөс `undefined` (дээрх) */
  const xLockWhy = useCallback((oid: number, des: number | null): string | undefined => {
    if (pendOtherOid == null) return undefined;
    const lab = kind === 'plan' ? tr('Гэрээ') : tr('Төлөвлөгөө');
    const st = xLock && xLock.oid === pendOtherOid ? xLock.set : null;
    if (!st) return tr('Бодит огноо · нөөц түр түгжээтэй — «{0}» табын хүлээгдэж буй илгээлт шалгагдаагүй байна.', lab);
    if (xLockHit(st, oid, des)) {
      return tr('Бодит огноо · нөөц түгжээтэй — «{0}» табын хүлээгдэж буй илгээлт энэ мөрийн бодит огноо/нөөцийг агуулж байна. Шийдвэрлэгдсэний дараа засна.', lab);
    }
    return undefined;
  }, [pendOtherOid, xLock, kind]);
  const xLockCheck = useCallback(async (): Promise<string | null> => {
    const oids = new Set<number>([...aDraft.keys(), ...resDraft.keys()]);
    const desR = new Set<number>();
    for (const k of obResDraft.keys()) {
      const d = Number(k.slice(0, k.indexOf('|')));
      if (Number.isFinite(d)) desR.add(d);
    }
    const hamO = new Set<number>(ham.keys());
    const desOb = new Set<number>();
    for (const k of obDraft.keys()) {
      const d = Number(k.slice(0, k.indexOf('|')));
      if (Number.isFinite(d)) desOb.add(d);
    }
    if (!oids.size && !desR.size && !hamO.size && !desOb.size) return null;
    const key = pkg.key;
    const k0 = kind;
    const other: PlanKind = k0 === 'plan' ? 'geree' : 'plan';
    const lab = k0 === 'plan' ? tr('Гэрээ') : tr('Төлөвлөгөө');
    const live = () => pkgKeyRef.current === key && kindRef.current === k0;
    let st: XLockSet;
    try {
      const pO = await loadPending(key, other);
      if (live()) setPendingOther(pO);
      if (!pO) return null;
      const p = await loadPayload(pO.oid);
      if (!p) return tr('«{0}» табын хүлээгдэж буй илгээлтийн агуулга уншигдсангүй — бодит огноо · нөөц · уялдаа · сарын обьёмын ноорогтой тул хадгалагдсангүй; дахин оролдоно уу.', lab);
      st = xLockSetOf(p);
      if (live()) setXLock({ oid: pO.oid, set: st });
    } catch (e) {
      return tr('«{0}» табын хүлээгдэж буй илгээлт шалгагдсангүй ({1}) — бодит огноо · нөөц · уялдаа · сарын обьёмын ноорогтой тул хадгалагдсангүй; дахин оролдоно уу.', lab, friendlyError(e));
    }
    const names: string[] = [];
    const nm = (r: SheetRow | undefined, fb: string) => (r ? `${r.no ?? '—'} · ${fixCyr(r.work) ?? ''}` : fb);
    for (const o of oids) {
      const r = rows.find((x) => x.oid === o);
      if (xLockHit(st, o, r?.des ?? null)) names.push(nm(r, String(o)));
    }
    for (const d of desR) {
      if (!xLockHit(st, null, d)) continue;
      const r = rows.find((x) => x.des === d);
      if (r && oids.has(r.oid) && xLockHit(st, r.oid, d)) continue;
      names.push(nm(r, String(d)));
    }
    const names2: string[] = [];
    for (const o of hamO) {
      const r = rows.find((x) => x.oid === o);
      const d = r?.des ?? null;
      if (st.ham.has(o) || (d != null && st.hamDes.has(d))) names2.push(nm(r, String(o)));
    }
    for (const d of desOb) {
      if (!st.ob.has(d)) continue;
      const r = rows.find((x) => x.des === d);
      const lb = nm(r, String(d));
      if (!names2.includes(lb)) names2.push(lb);
    }
    if (!names.length && !names2.length) return null;
    const show = (xs: string[]) => xs.slice(0, 5).join(', ') + (xs.length > 5 ? ` (+${num(xs.length - 5)})` : '');
    const msgs: string[] = [];
    if (names.length) msgs.push(tr('Бодит огноо · нөөц түгжээтэй — «{0}» табын хүлээгдэж буй илгээлт эдгээр мөрийн бодит огноо/нөөцийг агуулж байна: {1}. Тэр илгээлт шийдвэрлэгдсэний дараа дахин оролдоно уу.', lab, show(names)));
    if (names2.length) msgs.push(tr('Уялдаа · сарын обьём түгжээтэй — «{0}» табын хүлээгдэж буй илгээлт эдгээр мөрийн уялдаа/сарын обьёмыг агуулж байна: {1}. Тэр илгээлт шийдвэрлэгдсэний дараа дахин оролдоно уу.', lab, show(names2)));
    return msgs.join(' ');
  }, [aDraft, resDraft, obResDraft, ham, obDraft, pkg.key, kind, rows, pkgKeyRef, kindRef]);

  /**
   * ЛАВЛАГАА ХАРАГДАХ ЭСЭХ — нөгөө төрлийн зурвас (2026-09-11, хэрэглэгч:
   * «дангаар нь харах бол гэрээ төлөвлөгөө дээр дарж идэвхжүүлдэг болго»).
   */
  const [showRef, setShowRef] = useState(false);
  const [zoom, setZoom] = useState<Zoom>('month');
  const [blk, setBlk] = useState(0);
  const [takt, setTakt] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  /**
   * ХАМААРЛЫГ ШУГАМААР ХОЛБОХ (2026-09-22, хэрэглэгч: «бар хооронд шугам чирж
   * хамаарал шууд холбоно»). Зурвасын баруун захын бариулаас чирж эхлээд нөгөө
   * АЖЛЫН мөр дээр тавихад тэр мөр энэ ажлаас FS (лаг 0) хамаардаг болно.
   */
  const [link, setLink] = useState<{ i: number; x: number; y: number } | null>(null);
  const lanesRef = useRef<HTMLDivElement | null>(null);
  /** Холбосны дараах цонх — төрөл (FS/SS) ба хоног асууна (2026-09-22, хэрэглэгч). `si` урд, `ti` хамаарагч. */
  const [linkAsk, setLinkAsk] = useState<{ so: number; to: number; dblks: number[] | null; collapse?: true } | null>(null);
  /** Popup/холбох цонх нээлттэй эсэх — async урсгалд (`refreshAjil`, 2026-09-25) */
  const uiOpenRef = useRef(false);
  useEffect(() => { uiOpenRef.current = modal != null || linkAsk != null; }, [modal, linkAsk]);
  /** Эхний «өнөөдөр» рүү гүйлгэлт хийгдсэн үү — `[pkg]` эффект тэглэнэ, `useCalendar` уншина */
  const jumpedRef = useRef(false);

  useEffect(() => {
    if (review) return;
    if (groupOpts.includes(pkg.group) || draft.size || ham.size || aDraft.size || resDraft.size || obDraft.size || obResDraft.size || !groupOpts.length) return;
    const first = pkgFloors(groupOpts[0])[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (first) setPkg(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupOpts]);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(true); setErr(''); setLoadErr(null); setRows([]); setSc(null);
    setDraft(new Map()); setHam(new Map()); setSel(null); setCollapsed(new Set()); setModal(null);
    setErrList([]); setUndoSnap(null); setChgOpen(false); setChainN(0); setPendingOther(null);
    setFGrp('all'); setLinkAsk(null);
    setADraft(new Map()); setResDraft(new Map());
    setLvl(0);
    setObPlan(new Map()); setObOids(new Map()); setObDraft(new Map()); setObDups([]);
    setObRes(new Map()); setObResDraft(new Map());
    setObState('loading'); obLoadedRef.current = false;
    setPreviewing(false); setApproving(null); setFlowBox(null); setFlowTxt('');
    setOkRows(new Set()); setBackMarks(null);
    setViewSavedAt(null);
    savedRef.current = false;
    setBlk(0); jumpedRef.current = false; setGBlks(new Set());
    setFrameOld(null);
    /* Нэмэлт ажил (2026-09-24): маягт хаана, баннер тэглэнэ, локал ноорогийг сэргээнэ — `useAjil`-ийн
       `[pkg.key]` эффект (энэ эффектийн ДАРАА, нэг commit-д). */
    loadPkgPlan(pkg.key)
      .then((r) => { if (alive) { setObPlan(r.plan); setObRes(r.res); setObOids(r.oids); setObDups(r.dups); setObState('ok'); obLoadedRef.current = true; } })
      .catch(() => { if (alive) setObState('fail'); /* задаргаагүйгээр үргэлжилнэ */ });
    setKomissNote('');
    hdRemapRef.current = null;
    loadSchema(pkg, { synthetic: true })
      .then(async (schema) => {
        let r = await loadRows(pkg, schema);
        if (!alive) return;
        /*
         * «УЛСЫН КОМИСС» АВТОМАТ (2026-09-28, хэрэглэгчийн сонголт): төлөвлөгөөт
         * хуваарийг төлөвлөх эрхтэй хүн нээхэд багцын төгсгөлд тэр мөр байхгүй
         * бол `ensureKomissRow` НЭГ УДАА нэмж (шинэ жааз), дараа нь мөрүүдийг
         * дахин татна. Алдаа нь улаан баннер БИШ — хуваарь нээгдэх ёстой;
         * зөвхөн тэмдэглэл. Эрхийг ref-ээр уншина — эффектийн deps `[pkg]`
         * хэвээр (эрх ирэх бүрд дахин ачаалахгүй; lib түвшинд давхар шалгана).
         */
        if (!review && komissGateRef.current() && !findKomissRow(r.rows)) {
          const res = await ensureKomissRow(pkg.key);
          if (!alive) return;
          if (res.ok && res.added) {
            const r2 = await loadRows(pkg, schema);
            if (!alive) return;
            hdRemapRef.current = { pkg: pkg.key, map: remapOids(r.rows, r2.rows) };
            r = r2;
            setKomissNote(tr('«Улсын комисс» ажилбар багцын төгсгөлд нэмэгдлээ.'));
          } else if (!res.ok) {
            console.error('[selbe] улсын комиссын мөр нэмэгдсэнгүй:', res.error);
            setKomissNote(tr('«Улсын комисс» ажилбар нэмэгдсэнгүй: {0}', res.error));
          }
        }
        setSc(schema);
        setRows(r.rows);
        setFrameOld(r.truncated ? { day: r.truncated.day, shownDay: r.truncated.shownDay } : null);
      })
      .catch((e) => alive && setLoadErr(e instanceof Error ? e : new Error(String(e))))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg, reloadN]);

  /**
   * ТӨРӨЛ СОЛИГДОХОД НООРОГ ЦЭВЭРЛЭГДЭНЭ (2026-09-11).
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
    setADraft(new Map()); setResDraft(new Map());
    setSel(null); setModal(null); setNote(''); setKomissNote(''); setErr('');
    setPreviewing(false); setApproving(null); setFlowBox(null); setFlowTxt('');
    setOkRows(new Set()); setBackMarks(null);
    setViewSavedAt(null);
    setErrList([]); setUndoSnap(null); setChgOpen(false); setChainN(0);
    setChips((s) => (s.has('unbal') ? new Set([...s].filter((c) => c !== 'unbal')) : s));
    const pr = pendRef.current;
    setPending(pr.other); setPendingOther(pr.cur);
    savedRef.current = false;
    /* `pendRef` нь `useLatest`-ийн тогтвортой ref — deps-д байх нь эффектийг дахин ажиллуулахгүй */
  }, [kind, pendRef]);

  const n = sc?.bld.length ?? 0;
  /**
   * Бодит огноо · нөөцийн багана ХАРАГДАХ ЭСЭХ (2026-09-23) — талбар байгаа
   * үйлчилгээнд л. Блокгүй 8 багцад `aStart` хоосон тул бодит огноо нуугдана;
   * `hun_huch`/`mashin_mehanizm` 18/18-д бий ч схемээс шалгана (null = нуух).
   */
  const hasActual = !!sc && sc.aStart.some(Boolean);
  const hasRes = !!sc && !!(sc.f.hunHuch || sc.f.mashin);
  /** Олон блоктой (синтетик биш) багц — «Бүх блок» товч зөвхөн тэнд (2026-10-04) */
  const multiBlk = !!sc && !sc.synthetic && n > 1;
  const allOn = allBlk && multiBlk && !isReview;

  /**
   * ХУУДАСНЫ БҮХ МӨР — серверийнх + хараахан батлагдаагүй нэмэлт (2026-09-24).
   */
  const rowsAll = useMemo(
    () => (sc && !isReview ? insertAdds(rows, adds, sc, n) : rows),
    [rows, adds, sc, n, isReview],
  );
  /** Ноорогийг эх мөрүүд дээр давхарлана — харагдац үргэлж ХАМГИЙН СҮҮЛИЙНХ */
  const base = useMemo(() => toPlanRows(rowsAll, n, kind), [rowsAll, n, kind]);

  /**
   * ЛАВЛАГААНЫ хуваарь — НӨГӨӨ төрлийн огноо (2026-09-11, хэрэглэгчийн хүсэлт:
   * «төлөвлөгөө гэрээ 2-ийг зэрэг харах»).
   */
  const refBase = useMemo(
    () => toPlanRows(rowsAll, n, kind === 'geree' ? 'plan' : 'geree'),
    [rowsAll, n, kind],
  );
  const refByOid = useMemo(() => {
    const m = new Map<number, PlanRow>();
    for (const r of refBase) m.set(r.oid, r);
    return m;
  }, [refBase]);
  const plan = useMemo(() => {
    if (savedView || (!draft.size && !ham.size && !aDraft.size && !resDraft.size)) return base;
    return base.map((r) => {
      const s = draft.get(r.oid);
      const t = ham.get(r.oid);
      const ad = aDraft.get(r.oid);
      const rd = resDraft.get(r.oid);
      if (s === undefined && t === undefined && ad === undefined && rd === undefined) return r;
      return {
        ...r,
        spans: s ?? r.spans,
        deps: t !== undefined ? parseDeps(t) : r.deps,
        /* Бодит огноо · нөөцийн ноорог давхарлана (2026-09-23) */
        aStart: ad ? ad.start : r.aStart,
        aEnd: ad ? ad.end : r.aEnd,
        hun: rd ? rd.hun : r.hun,
        mashin: rd ? rd.mashin : r.mashin,
      };
    });
  }, [base, draft, ham, aDraft, resDraft, savedView]);

  /** Ажлын код → мөрийн индекс — уялдааны бодолт, сум, зөрчилд нэг эх сурвалж */
  const byCode = useMemo(() => codeIndex(plan), [plan]);

  /**
   * Нийт ноорог — огноо · уялдаа · сарын обьёмын аль нэгийг нь хөндсөн.
   */
  const dirtyNRef = useRef(0);
  const orphanOids = useMemo(() => {
    const s = new Set<number>();
    if (!sc || !rows.length || previewing || approving != null) return s;
    const have = new Set(rows.map((r) => r.oid));
    for (const m of [draft, ham, aDraft, resDraft] as ReadonlyMap<number, unknown>[]) {
      for (const k of m.keys()) if (k >= 0 && !have.has(k)) s.add(k);
    }
    return s;
  }, [sc, rows, previewing, approving, draft, ham, aDraft, resDraft]);
  const orphanOb = useMemo(() => {
    const s = new Set<string>();
    if (!sc || !rows.length || previewing || approving != null) return s;
    for (const k of new Set([...obDraft.keys(), ...obResDraft.keys()])) {
      const cut = k.indexOf('|');
      const des = Number(cut < 0 ? NaN : k.slice(0, cut));
      if (cut < 0 || !k.slice(cut + 1) || !Number.isFinite(des) || !byCode.has(des)) s.add(k);
    }
    return s;
  }, [sc, rows, previewing, approving, obDraft, obResDraft, byCode]);
  const dirtyN = useMemo(
    () => [...new Set([...draft.keys(), ...ham.keys(), ...aDraft.keys(), ...resDraft.keys()])].filter((k) => !orphanOids.has(k)).length
      + [...new Set([...obDraft.keys(), ...obResDraft.keys()])].filter((k) => !orphanOb.has(k)).length,
    [draft, ham, aDraft, resDraft, obDraft, obResDraft, orphanOids, orphanOb],
  );
  const obNotReady = (kind === 'plan' || obDraft.size > 0 || obResDraft.size > 0) && obState !== 'ok';
  /**
   * ӨӨРЧЛӨГДСӨН ЯЛГААТАЙ МӨРИЙН тоо — илгээлтийн `rowCount` (2026-09-23).
   */
  const dirtyOids = useMemo(() => {
    const s = new Set<number>([...ham.keys(), ...aDraft.keys(), ...resDraft.keys()].filter((o) => !orphanOids.has(o)));
    const idx = new Map(plan.map((r, i) => [r.oid, i]));
    for (const [o, sp] of draft) {
      if (orphanOids.has(o)) continue;
      const i = idx.get(o);
      if (i != null && plan[i].group && !ham.has(o)) {
        const b0 = base[i]?.spans ?? [];
        const own = sp.some((x, b) => !sameSpan(x, b0[b] ?? null) && !hasDatedLeaf(plan, i, b, (k) => plan[k].spans));
        if (!own) continue;
      }
      s.add(o);
    }
    for (const k of new Set([...obDraft.keys(), ...obResDraft.keys()])) {
      const code = Number(k.split('|')[0]);
      const i = Number.isFinite(code) ? byCode.get(code) : undefined;
      if (i != null && plan[i]) s.add(plan[i].oid);
    }
    return s;
  }, [draft, ham, aDraft, resDraft, obDraft, obResDraft, byCode, plan, base, orphanOids]);
  const dirtyRows = dirtyOids.size;

  /**
   * ЗӨВШӨӨРӨЛ ШААРДАХ МӨРҮҮД — өөрчлөгдсөн АЖЛЫН мөр + бүлгийн ЖИНХЭНЭ өөрчлөлт.
   */
  const reviewOids = useMemo(
    () => reviewOidsOf({ dirtyOids, plan, base, ham, draft, aDraft, resDraft, obDraft, obResDraft, obPlan, obRes, hasActual, hasRes, n }),
    [dirtyOids, plan, base, ham, draft, aDraft, resDraft, obDraft, obResDraft, obPlan, obRes, hasActual, hasRes, n],
  );
  const reviewOk = reviewOids.filter((o) => okRows.has(o)).length;
  const allOk = reviewOids.length > 0 && reviewOk === reviewOids.length;
  useEffect(() => { dirtyNRef.current = dirtyN; }, [dirtyN]);
  const unbalRows = useMemo(() => {
    const m = new Map<number, number[]>();
    if (kind !== 'plan' || !sc || !obDraft.size || savedView) return m;
    const codes = new Set<number>();
    for (const k of obDraft.keys()) { const c = Number(k.slice(0, k.indexOf('|'))); if (Number.isFinite(c)) codes.add(c); }
    for (const c of codes) {
      const i = byCode.get(c);
      const r = i != null ? plan[i] : undefined;
      if (!r) continue;
      const bs = unbalancedBlocks(r, sc.bld, obDraft, obPlan, true);
      if (bs.length) m.set(r.oid, bs);
    }
    return m;
  }, [kind, sc, obDraft, obPlan, byCode, plan, savedView]);
  /** `applyChanges`-ийн гинжийн тэмдэглэлд (deps-гүй уншина) */
  const unbalRef = useLatest(unbalRows);

  const cov = useMemo(() => {
    let tasks = 0, planned = 0, reversed = 0, partial = 0;
    for (const r of plan) {
      if (r.group) continue;
      tasks += 1;
      let filled = 0, rev = false;
      for (const s of r.spans) {
        if (!s) continue;
        filled += 1;
        if (s.end < s.start) rev = true;
      }
      if (filled > 0) planned += 1;
      if (rev) reversed += 1;
      /* «Дутуу» шүүлтийн тоо — урьд нь toolbar-т зурагдалт БҮРД `plan.filter`-ээр (2026-10-04) */
      if (filled > 0 && filled < r.spans.length) partial += 1;
    }
    return { tasks, planned, reversed, partial };
  }, [plan]);

  /**
   * САРЫН ХУВАARЬ ХУВЬ — тэр сард төлөвлөсөн обьём нь БАГЦЫН НИЙТ обьёмын
   * хэдэн хувь (2026-09-22, хэрэглэгчийн хүсэлт: «дээд талын огнооны нүдэнд
   * огнооны доод тал хуваарьт төлөвлөсөн обьём нийт багц обьёмын хэдэн хувь»).
   *
   *    Тиймээс тоо нь «БАГЦЫН хэдэн хувийг тэр сард төлөвлөсөн» гэсэн утга
   *    өгнө: сар бүрийн нийлбэр = төлөвлөлтийн ХАМРАЛТ. Задаргаа хагас
   *    бөглөгдсөн бол нийлбэр 100%-д хүрэхгүй — тэр нь ЗӨВ дохио, дутууг
   *    нуухгүй.
   *
   *    `vol` нь БЛОК ТУС БҮРИЙН нийт обьём — блокуудын нийлбэр БИШ. Үүнийг
   *    цонх өөрөө баталдаг: `balanced(mv, total)`, `total = r.vol` буюу НЭГ
   *    блокийн сарын задаргаа `r.vol`-тай тэнцэхийг шаардана
   *    (`PlanModal`). Тиймээс хуваагч нь `Σ r.vol × (хуваарьтай блокийн тоо)`.
   */
  const monPct = useMemo(() => {
    const per = new Map<string, number>();
    let tot = 0;
    for (const r of plan) {
      if (r.group || r.des == null) continue;
      if (r.vol == null || !(r.vol > 0)) continue;
      const pm = obPlan.get(r.des);
      const hasDraft = obDraft.size > 0;
      for (let b = 0; b < n; b += 1) {
        const blok = sc?.bld[b];
        if (!blok) continue;
        if (!r.spans[b]) continue;
        tot += r.vol;
        const md = (hasDraft ? obDraft.get(`${r.des}|${blok}`) : undefined) ?? pm?.get(blok);
        if (!md || !md.size) continue;
        for (const [k, v] of md) {
          if (v == null) continue;
          per.set(k, (per.get(k) ?? 0) + v);
        }
      }
    }
    return { per, tot };
  }, [plan, n, sc, obDraft, obPlan]);

  /**
   * Сарын шошгын доорх хувийн ТЕКСТ. `null` = ОГТ зурахгүй.
   */
  const monLab = useCallback((mk: string): { txt: string; tip: string } | null => {
    if (kind !== 'plan') return null;
    if (!(monPct.tot > 0)) return null;
    const v = monPct.per.get(mk);
    if (v == null || !(v > 0)) return null;
    const p = (v / monPct.tot) * 100;
    return {
      txt: p < 0.5 ? '·' : String(Math.round(p)),
      tip: tr('{0} — багцын нийт обьёмын {1}%', mk, num(p, 1)),
    };
  }, [monPct, kind]);

  /**
   * Мөр шүүлтүүрт нийцэж байна уу.
   */
  const chipOkAt = useCallback((r: PlanRow, b: number): boolean => {
    if (savedView && r.oid < 0) return false;
    if (!chips.size || r.group) return true;
    if (chips.has('dirty') && (savedView || !dirtyOids.has(r.oid))) return false;
    if (chips.has('unbal') && !unbalRows.has(r.oid)) return false;
    if (chips.has('late')) {
      const sp = r.spans[b] ?? null;
      if (!sp || statusOf(sp, r.act?.[b], today) !== 'late') return false;
    }
    if (chips.has('viol')) {
      const sp = r.spans[b] ?? null;
      const need = sp && r.deps.length && kind === 'plan' ? requiredStart(plan, byCode, r.i, b) : null;
      if (!(sp && need != null && sp.start < need)) return false;
    }
    return true;
  }, [chips, dirtyOids, unbalRows, today, kind, plan, byCode, savedView]);
  /** Шүүлт (таб · жил · чип) — чипүүд блок `b`-ээр (`chipOkAt`) */
  const matchAt = useCallback((r: PlanRow, b: number) => {
    if (r.group) return true;
    const filled = r.spans.filter(Boolean).length;
    if (filter === 'has' && !filled) return false;
    if (filter === 'none' && filled) return false;
    if (filter === 'partial' && (!filled || filled === r.spans.length)) return false;
    const sp = rowSpan(r);
    if (fYear !== 'all') {
      if (!sp) return false;
      const y = Number(fYear);
      if (Number(msToDay(sp.start).slice(0, 4)) > y || Number(msToDay(sp.end).slice(0, 4)) < y) return false;
    }
    return chipOkAt(r, b);
  }, [filter, fYear, chipOkAt]);
  const match = useCallback((r: PlanRow) => matchAt(r, blk), [matchAt, blk]);

  /** Бүлгийн сонголт — модны дарааллаар, гүнээр нь догол мөртэй */
  const groups = useMemo(
    () => plan.filter((r) => r.group).map((r) => ({
      oid: r.oid,
      label: `${'  '.repeat(r.depth)}${r.no} ${workName(r)}`.trimEnd(),
    })),
    [plan],
  );

  /**
   * Сонгосон бүлгийн ДЭД МОД (бүлэг өөрөө + доторх бүх мөр).
   */
  const scoped = useMemo(() => {
    if (fGrp === 'all') return plan;
    const at = plan.findIndex((r) => r.oid === fGrp);
    if (at < 0) return plan;
    const out = [plan[at]];
    for (let k = at + 1; k < plan.length; k++) {
      if (plan[k].depth <= plan[at].depth) break;
      out.push(plan[k]);
    }
    return out;
  }, [plan, fGrp]);

  /**
   * ХАРАГДАХ МӨРҮҮД — эвхэлт · шүүлт. Зүүн мод ба баруун хуанли ЯГ ЭНЭ
   * жагсаалтаар эгнэнэ.
   */
  const visibleAt = useCallback((b: number, keep?: ReadonlySet<number>) => {
    const out: PlanRow[] = [];
    let hideBelow = -1;
    for (const r of scoped) {
      if (hideBelow >= 0 && r.depth > hideBelow) continue;
      hideBelow = -1;
      if (r.group && collapsed.has(r.oid)) hideBelow = r.depth;
      if (!matchAt(r, b) && !keep?.has(r.oid)) continue;
      out.push(r);
    }
    return out;
  }, [scoped, collapsed, matchAt]);
  const [sticky, setSticky] = useState<ReadonlySet<number>>(() => new Set());
  const filtOn = filter !== 'all' || fYear !== 'all' || chips.size > 0;
  const filtKey = `${filter}|${fYear}|${[...chips].sort().join(',')}`;
  const [stickyKey, setStickyKey] = useState(filtKey);
  if (stickyKey !== filtKey) {
    setStickyKey(filtKey);
    if (sticky.size) setSticky(new Set());
  }
  const visible = useMemo(() => visibleAt(blk, sticky), [visibleAt, blk, sticky]);
  /** Шүүлтэд таарахгүй атлаа хөлдөлтөөр харагдаж буй мөрийн тоо */
  const stickyN = useMemo(() => {
    if (!sticky.size) return 0;
    let c = 0;
    for (const r of visible) if (sticky.has(r.oid) && !matchAt(r, blk)) c += 1;
    return c;
  }, [sticky, visible, matchAt, blk]);

  /**
   * ХҮСНЭГТЭД БОДИТООР БАЙГАА ТҮВШНҮҮД — товчийг өгөгдлөөс угсарна.
   */
  const lvls = useMemo(() => {
    const s = new Set<number>();
    for (const r of scoped) if (r.group) s.add(r.depth);
    return [...s].sort((a, b) => a - b);
  }, [scoped]);

  /**
   * ТҮВШИН СОНГОХ — `Finance.setLevel`-ийн ижил үүрэг.
   */
  const setLevel = useCallback((n: number) => {
    setLvl(n);
    const deepest = lvls.length ? lvls[lvls.length - 1] : 0;
    /* Хамгийн гүн түвшин = бүгдийг дэлгэх */
    if (n - 1 >= deepest) { setCollapsed(new Set()); return; }
    const s = new Set<number>();
    for (const r of scoped) if (r.group && r.depth >= Math.max(0, n)) s.add(r.oid);
    setCollapsed(s);
  }, [scoped, lvls, setLvl, setCollapsed]);

  /** Хуваарьт тааралдсан ЖИЛҮҮД — сонголтыг өгөгдлөөс угсарна */
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const r of plan) {
      const sp = rowSpan(r);
      if (!sp) continue;
      const y0 = new Date(sp.start).getUTCFullYear();
      const y1 = new Date(sp.end).getUTCFullYear();
      for (let y = y0; y <= y1; y++) s.add(String(y));
    }
    return [...s].sort();
  }, [plan]);

  /** Блок бүрд хуваарьтай АЖЛЫН тоо — сонголтын жагсаалтад харуулна */
  const blockFill = useMemo(() => {
    const c = new Array<number>(n).fill(0);
    for (const r of plan) {
      if (r.group) continue;
      r.spans.forEach((sp, b) => { if (sp) c[b] += 1; });
    }
    return c;
  }, [plan, n]);

  /**
   * ДЭЛГЭЦИЙН МӨРҮҮД — цонхлолт · зүүн жагсаалт · баруун эгнээ ЭНЭ жагсаалтаар (2026-10-04).
   */
  const disp = useMemo(
    () => (allOn ? allBlockRows(visible, plan, n) : plainRows(visible)),
    [allOn, visible, plan, n],
  );
  /* ── ХУАНЛИЙН ГЕОМЕТР — «өнөөдөр» · хүрээ · хоног↔px · цонхлолт · шошго (`useCalendar`) ── */
  const {
    now, from, to, px, W, xOf, dayAt, msAt, trackRef, scrollRef, onScroll, winFrom, winTo, slice, ticks, months,
  } = useCalendar({ plan, drag: !!drag, zoom, visible: disp, sel, pin: !!drag || (cellEdit != null && cellEdit === sel), jumpedRef, now: today });

  /* ── Ноорог ── */

  /**
   * ГИНЖНИЙ ҮР ДҮНГ НООРОГТ БУУЛГАНА — `propagate` олон мөрийг зэрэг
   * өөрчилдөг тул НЭГ setState дотор бөөнөөр нь бичнэ; мөр бүрд тусдаа
   * бичвэл чирэлтийн кадр бүрд олон рендер гарна.
   */
  /* (`obKey` — ажил+блокийн ноорогийн түлхүүр — `huvaari/util.ts`-д, 2026-09-30) */

  /**
   * Тухайн (ажил · блок)-ийн ХҮЧИНТЭЙ задаргаа — ноорог нь хадгалагдсаныг
   * дарна. Задаргаагүй бол хоосон Map.
   */
  const obOf = useCallback((des: number | null, blok: string): Map<string, number> => {
    if (des == null) return new Map();
    const d = savedView ? undefined : obDraft.get(obKey(des, blok));
    if (d) return d;
    return obPlan.get(des)?.get(blok) ?? new Map();
  }, [obDraft, obPlan, savedView]);
  /** Тухайн (ажил · блок)-ийн ХҮЧИНТЭЙ сарын нөөц — `obOf`-ийн адил (2026-09-24) */
  const obResOf = useCallback((des: number | null, blok: string): Map<string, MonthRes> => {
    if (des == null) return new Map();
    const d = savedView ? undefined : obResDraft.get(obKey(des, blok));
    if (d) return d;
    return obRes.get(des)?.get(blok) ?? new Map();
  }, [obResDraft, obRes, savedView]);

  /**
   * МУЖААС ГАДУУРХ САРЫН ОБЬЁМ — батлахын өмнөх хаалт (2026-10-01, хэрэглэгч: бүгдийг зас).
   */
  const obOut = useMemo(
    () => (kind === 'plan' && sc ? obyemOutsideSpan(plan, sc.bld, obOf, dirtyOids) : { bad: 0, names: [] as string[] }),
    [kind, sc, plan, obOf, dirtyOids],
  );
  /** `obOut`-ийн хэрэглэгчид харуулах мөр — эхний 5 нэр (+N) */
  const obOutMsg = obOut.bad
    ? tr('Обьёмтой сар ажлын эхлэх–дуусах мужаас гадуур байна — {0} ажил·блок: {1}. Тэр сарын обьёмыг мужид оруулах эсвэл хасаж засуулна уу (буцаана уу).',
      num(obOut.bad), obOut.names.slice(0, 5).join('; ') + (obOut.names.length > 5 ? ` (+${num(obOut.names.length - 5)})` : ''))
    : '';
  /**
   * БҮЛГИЙН КОДООР ХАДГАЛАГДСАН САРЫН ЗАДАРГАА (2026-10-01) — тэнцлийн шалгалтад ОРОХГҮЙ
   * («Сарын обьём бүлэгт биш», `util.unbalancedBlocks`), тиймээс ил мэдээлнэ.
   */
  const grpSplit = useMemo(
    () => (kind === 'plan' && sc ? groupSplits(plan, sc.bld, obPlan) : []),
    [kind, sc, plan, obPlan],
  );

  /**
   * БУЦААЛТЫН АГШИН АВАХ (2026-10-09) — `UndoSnap`/`UndoPart`. Хэсэг бүрийн ОДООГИЙН (өөрчлөхөөс өмнөх)
   * утгыг авна. Нэг үйлдлийн багц (`undoBatchRef`) эсвэл чирэлт/нүдний цонхны «Тавих» (`undoMergeRef`) бол
   * байгаа агшинд НЭМНЭ — аль хэдийн байгаа түлхүүрийг ДАРАХГҮЙ (хамгийн эртний утга үлдэнэ).
   */
  const snapUndo = useCallback((p: UndoPart) => {
    if (undoSkipRef.current) return;
    const merge = undoBatchRef.current || undoMergeRef.current;
    if (!undoBatchRef.current) {
      undoBatchRef.current = true;
      queueMicrotask(() => { undoBatchRef.current = false; });
    }
    const ob = new Map<string, Map<string, number> | undefined>();
    const obR = new Map<string, Map<string, MonthRes> | undefined>();
    if (p.full) {
      for (const [k, v] of obDraft) ob.set(k, v);
      for (const [k, v] of obResDraft) obR.set(k, v);
    }
    for (const k of p.ob ?? []) { ob.set(k, obDraft.get(k)); obR.set(k, obResDraft.get(k)); }
    const hm = new Map<number, string | undefined>();
    for (const o of p.ham ?? []) hm.set(o, ham.get(o));
    const ad: UndoSnap['aD'] = new Map();
    for (const o of p.aD ?? []) ad.set(o, aDraft.get(o));
    const rd: UndoSnap['rD'] = new Map();
    for (const o of p.rD ?? []) rd.set(o, resDraft.get(o));
    const next: UndoSnap = { spans: p.spans ?? new Map(), ob, obRes: obR, ham: hm, aD: ad, rD: rd, full: !!p.full };
    setUndoSnap((s) => {
      const u = s.u.length ? s.u[s.u.length - 1] : null;
      if (!merge || !u) return { u: [...s.u, next].slice(-UNDO_MAX), r: [] };
      const add = <K, V>(a: Map<K, V>, b: Map<K, V>): Map<K, V> => {
        const m = new Map(a);
        for (const [k, v] of b) if (!m.has(k)) m.set(k, v);
        return m;
      };
      const addAbs = <V,>(a: Map<string, V | undefined>, b: Map<string, V | undefined>): Map<string, V | undefined> => {
        if (!u.full) return add(a, b);
        const m = new Map(a);
        for (const k of b.keys()) if (!m.has(k)) m.set(k, undefined);
        return m;
      };
      const top: UndoSnap = {
        spans: add(u.spans, next.spans), ob: addAbs(u.ob, next.ob), obRes: addAbs(u.obRes, next.obRes),
        ham: add(u.ham, next.ham), aD: add(u.aD, next.aD), rD: add(u.rD, next.rD), full: u.full || next.full,
      };
      return { u: [...s.u.slice(0, -1), top], r: [] };
    });
  }, [obDraft, obResDraft, ham, aDraft, resDraft, setUndoSnap]);

  const applyChanges = useCallback((
    ch0: Map<number, (Span | null)[]>,
    primary?: number,
    undoKeys?: string[],
  ) => {
    if (!ch0.size) return;
    const ch = rollUpGroups(plan, n, ch0, (k) => base[k]?.spans ?? []);
    if (!undoSkipRef.current && (!drag || !undoDragSeenRef.current)) {
      if (drag) undoDragSeenRef.current = true;
      const spans = new Map<number, (Span | null)[]>();
      if (drag) {
        for (const r of plan) spans.set(r.oid, r.spans);
        snapUndo({ spans, full: true });
      } else {
        const keys = new Set(undoKeys ?? []);
        for (const [i, next] of ch) {
          const r = plan[i];
          if (!r) continue;
          spans.set(r.oid, r.spans);
          if (r.group || r.des == null) continue;
          next.forEach((sp, b) => {
            const blok = sc?.bld[b];
            if (blok && !sameSpan(sp, r.spans[b])) keys.add(obKey(r.des!, blok));
          });
        }
        snapUndo({ spans, ob: keys });
      }
    }
    {
      const prim = drag?.oid ?? primary;
      if (prim != null) {
        let moved = 0;
        const list: { lab: string; d: number | null }[] = [];
        for (const [i, sp] of ch0) {
          const r = plan[i];
          if (!r || r.oid === prim || r.group) continue;
          const b = sp.findIndex((x, k) => !sameSpan(x, r.spans[k]));
          if (b < 0) continue;
          moved += 1;
          const was = drag && b === blk ? (drag.snap?.get(r.oid) ?? r.spans[b]) : r.spans[b];
          const now0 = sp[b];
          list.push({ lab: String(r.des ?? r.no), d: was && now0 ? Math.round((now0.start - was.start) / DAY) : null });
        }
        setChainList(list);
        setChainN(moved);
        if (moved) setChainSeq((x) => x + 1);
        setChainUnbal0((s) => (moved ? (s ?? new Set(unbalRef.current.keys())) : null));
      }
    }
    if (filtOn) {
      setSticky((s) => {
        let add: Set<number> | null = null;
        for (const i of ch.keys()) {
          const o = plan[i]?.oid;
          if (o == null || s.has(o)) continue;
          if (!add) add = new Set(s);
          add.add(o);
        }
        return add ?? s;
      });
    }
    setDraft((d) => {
      const m = new Map(d);
      for (const [i, spans] of ch) {
        if (plan[i].oid < 0) continue;
        const orig = base[i]?.spans;
        const same = !!orig && spans.length === orig.length
          && spans.every((sp, b) => sameSpan(sp, orig[b]));
        if (same) m.delete(plan[i].oid);
        else m.set(plan[i].oid, spans);
      }
      for (const [i] of ch) {
        const g = plan[i];
        if (!g.group || !m.has(g.oid)) continue;
        let kid = false;
        for (let k = i + 1; k < plan.length && plan[k].depth > g.depth; k += 1) {
          if (!plan[k].group && m.has(plan[k].oid)) { kid = true; break; }
        }
        if (kid) continue;
        const gs = m.get(g.oid)!;
        const bs = base[i]?.spans ?? [];
        const ownShift = gs.some((sp, b) => !sameSpan(sp, bs[b])
          && !hasDatedLeaf(plan, i, b, (k) => base[k]?.spans ?? []));
        if (!ownShift) m.delete(g.oid);
      }
      return m;
    });
    if (kind === 'plan') setObDraft((prev) => {
      const next = new Map(prev);
      let touched = false;
      for (const [i, spans] of ch) {
        const r = plan[i];
        if (r.group || r.des == null || !(r.vol != null && r.vol > 0)) continue;
        spans.forEach((sp, b) => {
          const was = r.spans[b];
          const same = (!sp && !was)
            || (!!sp && !!was && sp.start === was.start && sp.end === was.end);
          if (same) return;
          const blok = sc?.bld[b];
          if (!blok) return;
          const key = obKey(r.des!, blok);
          const srv = obPlan.get(r.des!)?.get(blok);
          /* Ноорог > хадгалагдсан — хамгийн шинийг суурь болгоно */
          const cur = next.get(key) ?? srv ?? new Map<string, number>();
          const inDrag = !!drag && b === blk;
          const pre = inDrag ? drag!.snap?.get(r.oid) : undefined;
          const back = sameSpan(sp, base[i]?.spans[b])
            || (inDrag && pre !== undefined && sameSpan(sp, pre));
          const orig = !inDrag ? fullMonths(obFullRef.current.get(key), cur)
            : drag!.oid === r.oid ? drag!.origMonths ?? null
            : drag!.obSnap?.get(key) ?? srv ?? null;
          const val = sp
            ? (inDrag && back && orig ? new Map(orig) : keepMonths(sp, orig ?? cur))
            : new Map<string, number>();
          const pre0 = orig ?? cur;
          if (!sp) obFullRef.current.delete(key);
          else if (val.size < pre0.size) obFullRef.current.set(key, new Map([...(obFullRef.current.get(key) ?? []), ...pre0]));
          if (sameMonths(val, srv)) { next.delete(key); obFullRef.current.delete(key); }
          else next.set(key, val);
          touched = true;
        });
      }
      return touched ? next : prev;
    });
    /* САРЫН НӨӨЦ — обьёмын ИЖИЛ дүрмээр дагана (2026-09-24): `keepRes`, чирэлт
       буцахад `Drag.origRes`, сервертэй ижил бол ноорогоос хасна. */
    if (kind === 'plan') setObResDraft((prev) => {
      const next = new Map(prev);
      let touched = false;
      for (const [i, spans] of ch) {
        const r = plan[i];
        if (r.group || r.des == null || !(r.vol != null && r.vol > 0)) continue;
        spans.forEach((sp, b) => {
          const was = r.spans[b];
          if (sameSpan(sp, was)) return;
          const blok = sc?.bld[b];
          if (!blok) return;
          const key = obKey(r.des!, blok);
          const srv = obRes.get(r.des!)?.get(blok);
          const cur = next.get(key) ?? srv ?? new Map<string, MonthRes>();
          const inDrag = !!drag && b === blk;
          const pre = inDrag ? drag!.snap?.get(r.oid) : undefined;
          const back = sameSpan(sp, base[i]?.spans[b])
            || (inDrag && pre !== undefined && sameSpan(sp, pre));
          const orig = !inDrag ? fullMonths(obResFullRef.current.get(key), cur)
            : drag!.oid === r.oid ? drag!.origRes ?? null
            : drag!.obResSnap?.get(key) ?? srv ?? null;
          const val = sp
            ? (inDrag && back && orig ? new Map(orig) : keepRes(sp, orig ?? cur))
            : new Map<string, MonthRes>();
          const pre0 = orig ?? cur;
          if (!sp) obResFullRef.current.delete(key);
          else if (val.size < pre0.size) obResFullRef.current.set(key, new Map([...(obResFullRef.current.get(key) ?? []), ...pre0]));
          if (sameRes(val, srv)) { next.delete(key); obResFullRef.current.delete(key); }
          else next.set(key, val);
          touched = true;
        });
      }
      return touched ? next : prev;
    });
  }, [plan, base, n, sc, obPlan, obRes, drag, blk, kind, snapUndo, setDraft, setObDraft, setObResDraft, unbalRef, filtOn, setChainN, setChainSeq, setChainList, setSticky, setChainUnbal0]);

  useEffect(() => { if (!drag) undoDragSeenRef.current = false; }, [drag]);
  useEffect(() => { if (!obDraft.size) obFullRef.current.clear(); }, [obDraft]);
  useEffect(() => { if (!obResDraft.size) obResFullRef.current.clear(); }, [obResDraft]);
  useEffect(() => {
    if (!chainN) return undefined;
    const t = window.setTimeout(() => setChainN(0), 6000);
    return () => window.clearTimeout(t);
  }, [chainN, chainSeq]);
  useEffect(() => { if (!chainN) setChainUnbal0(null); }, [chainN]);
  /** Гинжээр ШИНЭЭР тэнцэхгүй болсон мөрийн тоо (`chainUnbal0`) */
  const chainUnbalN = chainUnbal0 ? [...unbalRows.keys()].filter((o) => !chainUnbal0.has(o)).length : 0;
  useEffect(() => { if (modal == null) undoOpenRef.current = null; }, [modal]);
  const onRemoteDraft = useCallback((keys: ReadonlySet<string>) => {
    setUndoSnap((s) => ([...s.u, ...s.r].some((u) => undoTouched(u, keys)) ? UNDO_EMPTY : s));
  }, [setUndoSnap]);
  useEffect(() => {
    if (!rows.length) return;
    setUndoSnap((s) => {
      if (!s.u.length && !s.r.length) return s;
      const live = new Set(rows.map((r) => r.oid));
      const dead = (m: ReadonlyMap<number, unknown>) => { for (const o of m.keys()) if (o >= 0 && !live.has(o)) return true; return false; };
      return [...s.u, ...s.r].some((u) => dead(u.spans) || dead(u.ham) || dead(u.aD) || dead(u.rD)) ? UNDO_EMPTY : s;
    });
  }, [rows, setUndoSnap]);

  /**
   * СҮҮЛИЙН ӨӨРЧЛӨЛТИЙГ БУЦААХ (2026-10-08, Ctrl+Z · толгойн «Буцаах») — `undoSnap`-ийн агшнаар.
   */
  /** Агшны түлхүүрүүдийн ОДООГИЙН утга — буцаах/дахин хийхийн эсрэг агшин (2026-10-09) */
  const invOf = useCallback((u: UndoSnap): UndoSnap => {
    const byOid = new Map(plan.map((r) => [r.oid, r.spans] as const));
    const spans = new Map<number, (Span | null)[]>();
    for (const oid of u.spans.keys()) { const sp = byOid.get(oid); if (sp) spans.set(oid, sp); }
    const ob = new Map<string, Map<string, number> | undefined>();
    const obR = new Map<string, Map<string, MonthRes> | undefined>();
    if (u.full) {
      for (const [k, v] of obDraft) ob.set(k, v);
      for (const [k, v] of obResDraft) obR.set(k, v);
    }
    for (const k of u.ob.keys()) ob.set(k, obDraft.get(k));
    for (const k of u.obRes.keys()) obR.set(k, obResDraft.get(k));
    const hm = new Map<number, string | undefined>();
    for (const o of u.ham.keys()) hm.set(o, ham.get(o));
    const ad: UndoSnap['aD'] = new Map();
    for (const o of u.aD.keys()) ad.set(o, aDraft.get(o));
    const rd: UndoSnap['rD'] = new Map();
    for (const o of u.rD.keys()) rd.set(o, resDraft.get(o));
    return { spans, ob, obRes: obR, ham: hm, aD: ad, rD: rd, full: u.full };
  }, [plan, obDraft, obResDraft, ham, aDraft, resDraft]);
  /** Агшныг ноорогт хэрэглэнэ (2026-10-09: `undoLast`-ийн биеэс салгав — логик ХЭВЭЭР) */
  const applySnap = useCallback((u: UndoSnap) => {
    const other = hdOtherRef.current;
    const live = new Set(rows.map((r) => r.oid));
    undoSkipRef.current = true;
    try {
      const idx = new Map(plan.map((r, i) => [r.oid, i]));
      const ch = new Map<number, (Span | null)[]>();
      for (const [oid, sp] of u.spans) {
        const i = idx.get(oid);
        if (i == null) continue;
        const cur = plan[i].spans;
        const next = cur.slice();
        let diff = false;
        for (let b = 0; b < next.length; b++) {
          const s0 = sp[b] ?? null;
          if (sameSpan(next[b], s0) || other(kS(oid, b))) continue;
          next[b] = s0; diff = true;
        }
        if (diff) ch.set(i, next);
      }
      if (ch.size) applyChanges(ch);
      const fix = <T,>(set: React.Dispatch<React.SetStateAction<Map<string, T>>>, snap: Map<string, T | undefined>, mk: (k: string) => string) => set((m0) => {
        const m = new Map(m0);
        if (u.full) for (const k of [...m.keys()]) if (!snap.has(k) && !other(mk(k))) m.delete(k);
        for (const [k, v] of snap) {
          if (other(mk(k))) continue;
          if (v === undefined) m.delete(k); else m.set(k, v);
        }
        return m;
      });
      fix(setObDraft, u.ob, kM);
      fix(setObResDraft, u.obRes, kN);
      if (u.ham.size) setHam((m0) => {
        const m = new Map(m0);
        for (const [o, v] of u.ham) { if (!live.has(o) || other(kH(o))) continue; if (v === undefined) m.delete(o); else m.set(o, v); }
        return m;
      });
      if (u.rD.size) setResDraft((m0) => {
        const m = new Map(m0);
        for (const [o, v] of u.rD) { if (!live.has(o) || other(kR(o))) continue; if (v === undefined) m.delete(o); else m.set(o, v); }
        return m;
      });
      /* Бодит огноо — блок бүрийн нүд (`kA`): хамтрагчийн блок үлдэж, бусад нь агшнаар (агшинд байхгүй = сервер) */
      if (u.aD.size) setADraft((m0) => {
        const m = new Map(m0);
        for (const [o, v] of u.aD) {
          if (!live.has(o)) continue;
          const row = rows.find((x) => x.oid === o);
          const nb = Math.max(n, v?.start.length ?? 0);
          const theirs = Array.from({ length: nb }, (_, b) => other(kA(o, b)));
          if (!theirs.some(Boolean) || !row) {
            if (theirs.some(Boolean)) continue;
            if (v === undefined) m.delete(o); else m.set(o, v);
            continue;
          }
          const cur = m.get(o) ?? { start: row.aStart.slice(), end: row.aEnd.slice() };
          const tgt = v ?? { start: row.aStart, end: row.aEnd };
          const start = cur.start.slice();
          const end = cur.end.slice();
          for (let b = 0; b < nb; b++) {
            if (theirs[b]) continue;
            start[b] = tgt.start[b] ?? null;
            end[b] = tgt.end[b] ?? null;
          }
          const same = start.every((x, b) => x === (row.aStart[b] ?? null)) && end.every((x, b) => x === (row.aEnd[b] ?? null));
          if (same) m.delete(o); else m.set(o, { start, end });
        }
        return m;
      });
    } finally {
      undoSkipRef.current = false;
    }
  }, [plan, rows, n, applyChanges, setObDraft, setObResDraft, setHam, setResDraft, setADraft]);
  const undoLast = useCallback(() => {
    const u = undoSnap;
    if (!u || !canEdit) return;
    if (busy) { setNote(tr('Буцааж чадсангүй — хадгалалт дуусаагүй байна. Дууссаны дараа дахин оролдоно уу.')); return; }
    if (locked) { setNote(tr('Буцааж чадсангүй — хуваарь батлуулахаар илгээгдсэн тул засвар түгжигдсэн.')); return; }
    if (drag) { setNote(tr('Буцааж чадсангүй — чирэлт дуусаагүй байна.')); return; }
    const inv = invOf(u);
    applySnap(u);
    setUndoSnap((s) => ({ u: s.u.slice(0, -1), r: [...s.r, inv].slice(-UNDO_MAX) }));
    setChainN(0);
    setNote(tr('Сүүлийн өөрчлөлт буцлаа.'));
  }, [undoSnap, busy, locked, canEdit, drag, invOf, applySnap, setNote, setUndoSnap, setChainN]);
  const redoLast = useCallback(() => {
    const r = redoSnap;
    if (!r || busy || locked || !canEdit || drag) return;
    const inv = invOf(r);
    applySnap(r);
    setUndoSnap((s) => ({ u: [...s.u, inv].slice(-UNDO_MAX), r: s.r.slice(0, -1) }));
    setChainN(0);
    setNote(tr('Өөрчлөлт дахин хийгдлээ.'));
  }, [redoSnap, busy, locked, canEdit, drag, invOf, applySnap, setNote, setUndoSnap, setChainN]);
  const undoLastRef = useLatest(undoLast);
  const undoStkRef = useLatest(undoStk);
  const markUndo = useCallback((): (() => void) => {
    const before = undoStkRef.current.u;
    let mine: UndoSnap | null | undefined;
    const grab = () => {
      if (mine !== undefined) return;
      const u = undoStkRef.current.u;
      const top = u.length ? u[u.length - 1] : null;
      mine = top && !before.includes(top) ? top : null;
    };
    setTimeout(grab, 0);
    return () => {
      grab();
      const u = undoStkRef.current.u;
      if (mine && u.length && u[u.length - 1] === mine) undoLastRef.current();
      else setNote(tr('Энэ арилгалтыг буцаах боломжгүй — дараа нь өөр өөрчлөлт орсон байна. Ctrl+Z-ээр дарааллаар нь буцаана уу.'));
    };
  }, [undoStkRef, undoLastRef, setNote]);
  const redoLastRef = useLatest(redoLast);

  /**
   * Popup-ын «Тавих» — огноо ба/эсвэл уялдааг НЭГ алхамд.
   */
  const applyModal = useCallback((
    oid: number,
    spans: (Span | null)[] | null,
    deps: Dep[] | null,
    /** Сарын обьём + нөөц (2026-09-24) — `null` = хөндөхгүй; дотоод `null` = тэр хэсгийг хөндөхгүй */
    ob: { months: Map<string, number> | null; res: Map<string, MonthRes> | null; byBlk?: Map<number, Map<string, number>> } | null,
    blks: number[] = [blk],
  ) => {
    if (busy || locked) return;
    if (oid < 0) return;
    const at = plan.findIndex((x) => x.oid === oid);
    if (at < 0) return;
    let why: string | null = null;
    let deps2 = deps;
    if (deps2) {
      const over = deps2.filter((d) => (d.blk != null && d.blk >= n) || (d.src != null && d.src >= n));
      if (over.length) {
        why = tr('{0}-р блок алга — уялдаа хадгалагдсангүй', over.map((d) => String((d.blk != null && d.blk >= n ? d.blk : d.src!) + 1)).join(', '));
        setErr(why);
        deps2 = deps2.filter((d) => !over.includes(d));
      }
    }
    if (deps2) {
      const me = plan[at].des;
      const had = new Set(plan[at].deps.map((d) => d.code));
      const badDep = deps2.filter((d) => !had.has(d.code)).some((d) => {
        const pi = byCode.get(d.code);
        if (pi != null && hierRelated(plan, at, pi)) return true;
        return me != null && reaches(plan, byCode, me, d.code);
      });
      if (badDep) {
        why = tr('Дугуй хамаарал үүсэх тул уялдаа хадгалагдсангүй.');
        setErr(why);
        deps2 = null;
      } else {
        const keep = residualDeps(ham.get(oid) ?? rowsAll[at]?.ham ?? null);
        const text = [...keep, formatDeps(deps2)].filter(Boolean).join(',');
        if (text.trim().length > HAM_MAX) {
          why = tr('Уялдааны бичиглэл {0} тэмдэгт — талбарт {1} хүртэл багтана. Блок цөөлөх эсвэл бүх блокийг сонгож нэг уялдаа болгоно уу.', num(text.trim().length), num(HAM_MAX));
          setErr(why);
          return why;
        }
        const normHam = (t: string | null) => {
          const v = (t ?? '').trim();
          return v ? [...residualDeps(v), formatDeps(parseDeps(v))].filter(Boolean).join(',') : null;
        };
        const same = normHam(text) === normHam(rowsAll[at]?.ham ?? null);
        snapUndo({ ham: [oid] });
        setHam((m) => {
          const next = new Map(m);
          if (same) next.delete(oid); else next.set(oid, text);
          return next;
        });
      }
    }
    const rows2 = deps2 ? plan.map((r, i) => (i === at ? { ...r, deps: deps2! } : r)) : plan;
    const overrides = new Map<number, (Span | null)[]>();
    if (spans) overrides.set(at, spans);
    const des = plan[at].des;
    const undoKeys = ob && des != null && kind === 'plan'
      ? blks.map((b) => sc?.bld[b]).filter((x): x is string => !!x).map((blok) => obKey(des, blok)) : undefined;
    if (undoKeys?.length) snapUndo({ ob: undoKeys });
    applyChanges(kind === 'plan' ? propagate(rows2, n, overrides, deps2 ? [at] : []) : overrides, oid, undoKeys);
    if (ob && des != null && kind === 'plan') {
      const { res } = ob;
      for (const bAt of blks) {
        const blok = sc?.bld[bAt];
        if (!blok) continue;
        const months = ob.byBlk?.get(bAt) ?? ob.months;
        const key = obKey(des, blok);
        const bsp = (spans ?? plan[at].spans)[bAt] ?? null;
        const inSpan = bsp ? new Set(monthsOf(bsp)) : null;
        if (months) {
          const mine = new Map(months);
          const f0 = obFullRef.current.get(key);
          if (f0 && inSpan) {
            const f = new Map([...f0].filter(([k]) => !inSpan.has(k)));
            for (const [k, v] of mine) f.set(k, v);
            obFullRef.current.set(key, f);
          } else if (!bsp) obFullRef.current.delete(key);
          setObDraft((m) => {
            const next = new Map(m);
            if (sameMonths(mine, obPlan.get(des)?.get(blok))) next.delete(key);
            else next.set(key, mine);
            return next;
          });
        }
        if (res) {
          const mine = new Map(res);
          const f0 = obResFullRef.current.get(key);
          if (f0 && inSpan) {
            const f = new Map([...f0].filter(([k]) => !inSpan.has(k)));
            for (const [k, v] of mine) f.set(k, v);
            obResFullRef.current.set(key, f);
          } else if (!bsp) obResFullRef.current.delete(key);
          setObResDraft((m) => {
            const next = new Map(m);
            if (sameRes(mine, obRes.get(des)?.get(blok))) next.delete(key);
            else next.set(key, mine);
            return next;
          });
        }
      }
    }
    return why;
  }, [plan, byCode, n, busy, locked, ham, rowsAll, applyChanges, snapUndo, sc, blk, obPlan, obRes, kind, setErr, setHam, setObDraft, setObResDraft]);

  /**
   * POPUP-ЫН «Тавих» — БОДИТ ОГНОО (энэ блок) ба НӨӨЦ (мөр) (2026-09-23).
   */
  const applyExtra = useCallback((
    oid: number,
    /** Бодит огноог тавих блокууд (2026-09-24 — popup олон блок сонгодог болсон) */
    blks: number[],
    actual: { start: number | null; end: number | null } | null,
    res: { hun: number | null; mashin: number | null } | null,
  ) => {
    if (busy || locked) return;
    const orig = rows.find((r) => r.oid === oid);
    if (!orig || orig.group) return;
    const xWhy = actual || res ? xLockWhy(orig.oid, orig.des) : undefined;
    if (xWhy) { setErr(xWhy); return; }
    if (actual || res) snapUndo({ aD: actual ? [oid] : [], rD: res ? [oid] : [] });
    const ok = blks.filter((b) => b >= 0 && b < n);
    if (actual && ok.length) {
      setADraft((m) => {
        const next = new Map(m);
        const cur = next.get(oid);
        const start = (cur ? cur.start : orig.aStart).slice();
        const end = (cur ? cur.end : orig.aEnd).slice();
        for (const bAt of ok) { start[bAt] = actual.start; end[bAt] = actual.end; }
        const same = start.every((v, b) => v === (orig.aStart[b] ?? null))
          && end.every((v, b) => v === (orig.aEnd[b] ?? null));
        if (same) next.delete(oid); else next.set(oid, { start, end });
        return next;
      });
    }
    if (res) {
      setResDraft((m) => {
        const next = new Map(m);
        if ((res.hun ?? null) === (orig.hun ?? null) && (res.mashin ?? null) === (orig.mashin ?? null)) next.delete(oid);
        else next.set(oid, { hun: res.hun, mashin: res.mashin });
        return next;
      });
    }
  }, [busy, locked, rows, n, xLockWhy, snapUndo, setErr, setADraft, setResDraft]);

  /**
   * ХАМААРЛЫГ НҮДЭНД ШУУД БИЧИХ (2026-09-15, хэрэглэгчийн хүсэлт:
   * «11FS14 гэж шууд бичиж холбоос хийх боломжтой болгох»).
   */
  /**
   * ШУГАМААР ХОЛБОХ ЧИРЭЛТ — бариулаас эхлээд `window` дээр дуусна (2026-09-22).
   */
  const startLink = (e: PEvt<HTMLElement>, r: PlanRow) => {
    if (!canEdit || locked || busy || kind !== 'plan') return;
    e.preventDefault();
    e.stopPropagation();
    if (r.des == null) {
      setErr(tr('Энэ ажилд код алга — хамаарлын урд ажил болж чадахгүй.'));
      return;
    }
    const lanes = lanesRef.current;
    if (!lanes) return;
    const pos = (ev: { clientX: number; clientY: number }) => {
      const b = lanes.getBoundingClientRect();
      return { x: ev.clientX - b.left, y: ev.clientY - b.top };
    };
    setSel(r.oid);
    setErr('');
    setLink({ i: r.i, ...pos(e) });
    const last = { clientX: e.clientX, clientY: e.clientY };
    let raf = 0;
    const edgeV = (y: number): number => {
      const sc0 = scrollRef.current;
      if (!sc0) return 0;
      const b = sc0.getBoundingClientRect();
      const top = b.top + PL_ROW; // наалдмал толгой
      const EDGE = 40;
      if (y < top + EDGE) return -Math.ceil(((top + EDGE - y) / EDGE) * 14);
      if (y > b.bottom - EDGE) return Math.ceil(((y - (b.bottom - EDGE)) / EDGE) * 14);
      return 0;
    };
    const tick = () => {
      raf = 0;
      const sc0 = scrollRef.current;
      const v = edgeV(last.clientY);
      if (!sc0 || !v) return;
      const before = sc0.scrollTop;
      sc0.scrollTop += v;
      if (sc0.scrollTop === before) return;
      setLink({ i: r.i, ...pos(last) });
      raf = requestAnimationFrame(tick);
    };
    const mv = (ev: PointerEvent) => {
      last.clientX = ev.clientX; last.clientY = ev.clientY;
      setLink({ i: r.i, ...pos(ev) });
      if (!raf && edgeV(ev.clientY)) raf = requestAnimationFrame(tick);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      setLink(null);
      if (ev.type === 'pointercancel') return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-row]') as HTMLElement | null;
      let ti = el ? Number(el.dataset.row) : NaN;
      if (!Number.isInteger(ti)) {
        const b = lanes.getBoundingClientRect();
        const x = ev.clientX - b.left;
        const k = Math.floor((ev.clientY - b.top) / PL_ROW);
        if (x >= 0 && x <= b.width && k >= 0 && k < visible.length) ti = visible[k].i;
      }
      if (ti === r.i) return;
      const t = Number.isInteger(ti) ? plan[ti] : undefined;
      if (!t) { setErr(tr('Хамаарал холбогдсонгүй — хуанлийн мөр (зурвасын эгнээ) дээр тавина уу.')); return; }
      if (t.oid < 0) { setErr(tr('Энэ мөр батлагдаагүй нэмэлт ажил — батлагдсаны дараа уялдаа тавина.')); return; }
      if (hierRelated(plan, ti, r.i)) { setErr(tr('Өөрийн бүлэг/дэд ажилтайгаа холбож болохгүй — гинжин эргэлт үүснэ.')); return; }
      if (t.des != null && reaches(plan, byCode, t.des, r.des as number /* дээр `r.des == null` таслагдсан */)) {
        setErr(tr('Дугуй хамаарал үүсэх тул холбож болохгүй.'));
        return;
      }
      const tb = sc?.synthetic || n === 1
        ? null
        : [...new Set([blk, ...gBlks])].filter((k) => k >= 0 && k < n).sort((a, b) => a - b);
      const all = tb != null && tb.length >= n;
      const dblks0 = tb == null || all ? null : tb;
      const rd = r.des as number;
      const hasExact = dblks0 != null && dblks0.some((b) => t.deps.some((d) => sameDep(d, { code: rd, blk: b })));
      const hasAll = t.deps.some((d) => sameDep(d, { code: rd, blk: undefined }));
      setLinkAsk({
        so: r.oid,
        to: t.oid,
        dblks: dblks0 != null && !hasExact && hasAll ? null : dblks0,
        ...(all ? { collapse: true as const } : {}),
      });
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /**
   * Мөрийн ИДЭВХТЭЙ БЛОКИЙН муж — бүлэгт хүүхдээс (`effSpan`), ажилд өөрийнх.
   */
  const effAt = useMemo(() => lazyCache((i: number): Span | null => effSpan(plan, i, blk)), [plan, blk]);
  const rowSpanAt = useCallback((r: PlanRow): Span | null => (
    r.group ? effAt(r.i) : (r.spans[blk] ?? null)
  ), [effAt, blk]);
  /** Нөгөө төрлийн (гэрээ ↔ төлөвлөгөө) мөрийн идэвхтэй блокийн муж — дээрхтэй ижил дүрэм */
  const refSpanAt = useCallback((oid: number): Span | null => {
    const rr = refByOid.get(oid);
    if (!rr) return null;
    return rr.group ? effSpan(refBase, rr.i, blk) : (rr.spans[blk] ?? null);
  }, [refByOid, refBase, blk]);
  /**
   * «Бүх блок» горимын нөгөө төрлийн муж (2026-10-04): `b ≥ 0` — тэр блокийнх
   * (`refSpanAt`-ийн дүрэм), `b < 0` — бүх блокийн НЭГДЭЛ (эх мөрд).
   */
  const refSpanOf = useCallback((oid: number, b: number): Span | null => {
    const rr = refByOid.get(oid);
    if (!rr) return null;
    if (b >= 0) return blockSpan(refBase, rr, b);
    return unionSpans(rr.spans.map((_, k) => blockSpan(refBase, rr, k)));
  }, [refByOid, refBase]);

  const applyHamText = useCallback((oid: number, text: string): string | undefined => {
    if (busy) { const w = tr('Хадгалж байна — түр хүлээгээд уялдааг дахин оруулна уу.'); setErr(w); return w; }
    if (locked || !canEdit || kind !== 'plan') return;
    const cur = plan.find((x) => x.oid === oid);
    if (!cur) return;
    const bad = residualDeps(text);
    if (bad.length) {
      const w = tr('Уялдааны бичиглэл танигдсангүй: {0} — жишээ нь «18FS3,22SS-5». Уялдаа өөрчлөгдсөнгүй.', bad.join(', '));
      setErr(w);
      return w;
    }
    let next = parseDeps(text);
    const had = new Set(cur.deps.map((d) => d.code));
    const lost = [...new Set(next.filter((d) => !byCode.has(d.code) && !had.has(d.code)).map((d) => d.code))];
    let lostWhy: string | undefined;
    if (lost.length) {
      lostWhy = tr('{0} код алга — уялдаа хадгалагдсангүй', lost.join(', '));
      setErr(lostWhy);
      next = next.filter((d) => !lost.includes(d.code));
    }
    /* Өөрчлөгдөөгүй бол дэмий тархалт хийхгүй — 1,400 мөрийн `propagate`
       нь хямд биш, мөн «хадгалаагүй» тэмдэг худал асахгүй. */
    if (formatDeps(next) === formatDeps(cur.deps)) return lostWhy;
    if (!lostWhy) setErr('');
    return applyModal(oid, null, next, null) ?? lostWhy;
  }, [busy, locked, canEdit, kind, plan, byCode, applyModal, setErr]);

  /**
   * ОГНООГ НҮДЭНД ШУУД БИЧИХ (2026-10-05, хэрэглэгч: «огноо дээр дарж бичиж
   * төлөвлөх»). Идэвхтэй табын (`kind`) ИДЭВХТЭЙ блокийн (`blk`) эхлэх/дуусах.
   */
  /**
   * ОГНОО ТАВИСНЫ ДАРАА ЗАСВАРЫН ЦОНХ ӨӨРӨӨ НЭЭГДЭНЭ (2026-10-06, хэрэглэгч: «start end
   * тавихад обьём болон хүн хүч бөглөх цонх автоматаар нээгддэг болго»). Чирэлтийн
   * дараа цонх аль хэдийн нээгддэг (`useDragPlan`); энэ нь нүдэнд бичих замынх.
   */
  const openAfterDate = useCallback((oid: number, via: CellVia) => {
    if (via !== 'enter') return;
    undoOpenRef.current = oid;
    setSel(oid);
    setModal(oid);
    setModalFrom(oid);
  }, [setSel, setModal, setModalFrom]);

  const multiBlks = useMemo(
    () => (!sc || sc.synthetic || n <= 1 ? [] : [...new Set([blk, ...gBlks])].filter((k) => k >= 0 && k < n).sort((a, b) => a - b)),
    [sc, n, blk, gBlks],
  );
  const applyDate = useCallback((oid: number, which: 'start' | 'end' | 'days', day: string, via: CellVia = 'enter'): string | undefined => {
    const fail = (w: string) => { setErr(w); return w; };
    if (busy) return fail(tr('Хадгалж байна — түр хүлээгээд огноог дахин оруулна уу.'));
    if (locked || !canEdit) return;
    const cur = plan.find((x) => x.oid === oid);
    if (!cur || cur.group || oid < 0) return;
    /** Нэг блокийн шинэ муж (дүрэм ХЭВЭЭР) — зөрчилд шалтгаан (мөр), өөрчлөлтгүй/хоосон оролтод `null` */
    const ruleAt = (old: Span | null): Span | string | null => {
      let next: Span;
      if (which === 'days') {
        const d = Number(day);
        if (!Number.isInteger(d) || d < 1) return null;
        if (d > MAX_DAYS) return tr('Үргэлжлэх хоног {0}-аас их байж болохгүй — тавигдсангүй.', num(MAX_DAYS));
        if (!old) return tr('Эхлэх огноо байхгүй — эхлээд эхлэх огноог бичнэ үү.');
        next = { start: old.start, end: endOf(old.start, d) };
        return sameSpan(next, old) ? null : next;
      }
      const ms = dayToMs(day);
      if (ms == null) return null;
      if (!old) next = { start: ms, end: ms };
      else if (which === 'start') next = ms <= old.end ? { start: ms, end: old.end } : { start: ms, end: endOf(ms, spanDays(old)) };
      else {
        if (ms < old.start) return tr('Дуусах огноо эхлэх огнооноос өмнө байна — тавигдсангүй.');
        next = { start: old.start, end: ms };
      }
      if (sameSpan(next, old)) return null;
      if (spanDays(next) > MAX_DAYS) return tr('Үргэлжлэх хоног {0}-аас их байж болохгүй — тавигдсангүй.', num(MAX_DAYS));
      return next;
    };
    const main = ruleAt(cur.spans[blk] ?? null);
    if (typeof main === 'string') return fail(main);
    const spans = cur.spans.slice();
    while (spans.length < n) spans.push(null);
    let changed = false;
    if (main) { spans[blk] = main; changed = true; }
    const skip: string[] = [];
    for (const b of multiBlks) {
      if (b === blk) continue;
      const nb = ruleAt(cur.spans[b] ?? null);
      if (typeof nb === 'string') skip.push(tr('{0}-р блок: {1}', String(b + 1), nb));
      else if (nb) { spans[b] = nb; changed = true; }
    }
    const skipMsg = skip.length ? tr('{0} блокт хэрэглэгдсэнгүй: {1}', num(skip.length), skip.join('; ')) : '';
    if (!changed) return skipMsg ? fail(skipMsg) : undefined;
    setErr(skipMsg);
    applyModal(oid, spans, null, null);
    openAfterDate(oid, via);
  }, [busy, locked, canEdit, plan, blk, n, multiBlks, applyModal, setErr, openAfterDate]);

  /**
   * БҮЛГИЙГ ШИЛЖҮҮЛЭХ (2026-10-09, `PlanModal.onShiftGroup`) — бүлгийн доорх НАВЧ ажил бүрийн мужийг сонгосон блокуудад
   * `days` хоногоор зөөнө. Бүлгийн огноо гараар засагдахгүй дүрэм (2026-09-06) ХЭВЭЭР — хүүхдүүд хөдөлж, бүлэг
   * `rollUpGroups`-оор дагана. НЭГ `applyChanges` (гинж `propagate` — төлөвлөгөө табд л) тул нэг Ctrl+Z-ээр буцна.
   * Мужгүй блок хөндөгдөхгүй (огноо зохиохгүй); батлагдаагүй нэмэлт мөр (сөрөг oid) алгасна.
   */
  const shiftGroup = useCallback((oid: number, days: number, blks: number[]) => {
    if (busy || locked || !canEdit || !Number.isInteger(days) || !days) return;
    const at = plan.findIndex((x) => x.oid === oid);
    if (at < 0 || !plan[at].group) return;
    const d0 = plan[at].depth;
    const bs = blks.filter((b) => b >= 0 && b < n);
    const ov = new Map<number, (Span | null)[]>();
    for (let k = at + 1; k < plan.length && plan[k].depth > d0; k++) {
      const r = plan[k];
      if (r.group || r.oid < 0) continue;
      let next: (Span | null)[] | null = null;
      for (const b of bs) {
        const sp = r.spans[b];
        if (!sp) continue;
        if (!next) next = r.spans.slice();
        next[b] = { start: sp.start + days * DAY, end: sp.end + days * DAY };
      }
      if (next) ov.set(k, next);
    }
    if (!ov.size) { setNote(tr('Бүлэгт шилжүүлэх огноотой ажил алга.')); return; }
    setErr('');
    applyChanges(kind === 'plan' ? propagate(plan, n, ov) : ov);
    setNote(tr('Бүлгийн {0} ажил {1} хоногоор шилжлээ.', num(ov.size), days > 0 ? `+${days}` : String(days)));
  }, [busy, locked, canEdit, plan, n, kind, applyChanges, setErr, setNote]);

  /* ── Чирэлт ── */

  /* ══════════════ ХУВААЛЦСАН НООРОГ — ArcGIS дээр (2026-09-23; `useSharedDraft`) ══════════════ */
  const {
    hdSt, hdUsers, hdLabel, hdReadyKey, hdTimerRef, hdFlushRef, hdClearRef, hdSkipUnlockOnceRef,
    hdMapsRef, hdMeta, meRef, askSwitch, hdResetRestore, hdRetryRestore, hdSubmitBegin, hdSubmitEnd, hdDiscard, hdUnsynced, hdOrphan,
    hdStoreMode, hdStoreNote, hdCtxRef, hdReadyRef, hdKeyRef,
  } = useSharedDraft({
    kind, pkgKey: pkg.key, user, status, canEdit: canEditRole, locked, previewing, approving, pending,
    sc, rows, base, n, obPlan, obRes, obState, flowReady, dirtyN, dragging: drag != null,
    draft, ham, aDraft, resDraft, obDraft, obResDraft,
    setDraft, setHam, setADraft, setResDraft, setObDraft, setObResDraft, setNote, pkgKeyRef, hdRemapRef,
    onRemote: onRemoteDraft,
  });
  const hdRestoringUi = canEditRole && !previewing && approving == null && pending == null && rows.length > 0
    && hdReadyKey !== hdKey(kind, pkg.key);
  const hdRestKey = hdRestoringUi ? hdKey(kind, pkg.key) : '';
  const [hdSlowKey, setHdSlowKey] = useState('');
  useEffect(() => {
    if (!hdRestKey) return undefined;
    const t = window.setTimeout(() => setHdSlowKey(hdRestKey), RESTORE_SLOW_MS);
    return () => window.clearTimeout(t);
  }, [hdRestKey]);
  const hdRestoreSlow = !!hdRestKey && hdSlowKey === hdRestKey;
  useEffect(() => {
    hdOtherRef.current = (k: string) => {
      const mu = hdMeta.current.get(k)?.user;
      return !!mu && mu !== meRef.current;
    };
  }, [hdMeta, meRef]);

  const [switching, setSwitching] = useState(false);
  const runSwitch = (apply: () => void) => {
    if (switching) return;
    setSwitching(true);
    void askSwitch().then((ok) => { if (ok) apply(); }).finally(() => setSwitching(false));
  };

  /* ── Чирэлтийн хөдөлгүүр (`useDragPlan`) ── */
  const {
    undoRef, onDown, onMove, onUp, onCancel: onCancel0, undoDragOnClose: undoDragOnClose0, dragOpen, keepDrag, forgetDrag,
  } = useDragPlan({
    plan, blk, n, applyChanges, canEdit, locked, busy, sc, obOf, obResOf, obDraft, obResDraft,
    setObDraft, setObResDraft, obPlan, obRes, drag, setDrag, setSel, setModal, dayAt, msAt, hdMeta, meRef,
    chain: kind === 'plan',
    scrollEl: () => scrollRef.current,
  });
  const popUndo = () => setUndoSnap((s) => (s.u.length ? { u: s.u.slice(0, -1), r: s.r } : s));
  const onCancel = () => {
    const had = !!drag && undoDragSeenRef.current && !busy && !locked;
    undoSkipRef.current = true;
    try { onCancel0(); } finally { undoSkipRef.current = false; }
    if (had) popUndo();
  };
  const allBack = (oid: number | null) => {
    if (!allBackRef.current) return;
    allBackRef.current = false;
    setAllBlk(true);
    if (oid != null) scrollToOid.current = { oid, blk };
  };
  const undoDragOnClose = () => {
    const had = undoRef.current != null && !busy && !locked;
    const oid = modal;
    undoSkipRef.current = true;
    try { undoDragOnClose0(); } finally { undoSkipRef.current = false; }
    if (had) popUndo();
    allBack(oid);
  };
  const keepDragClose = () => {
    const oid = modal;
    keepDrag();
    allBack(oid);
  };


  /* ── Хадгалах ── */

  const save = useCallback(async (): Promise<boolean> => {
    if (!sc || !dirtyN || busy) return false;
    setBusy(true); setErr(''); setNote(''); setErrList([]);
    const tookD = [...draft.keys()];
    const tookH = [...ham.keys()];
    const tookA = [...aDraft.keys()];
    const tookR = [...resDraft.keys()];
    const tookOb = new Set(obDraft.keys());
    const tookObR = new Set(obResDraft.keys());
    if ((tookOb.size || tookObR.size) && (obState !== 'ok' || !obLoadedRef.current)) {
      setErr(tr('Сарын обьёмын хүснэгт уншигдаагүй тул хадгалах боломжгүй — давхардал үүсэхээс сэргийлэв. Хуудсыг дахин ачаалаад оролдоно уу.'));
      setBusy(false);
      return false;
    }
    try {
      const approvalMode = approving != null;
      const steps = approvalMode ? 3 : 2;
      if (approvalMode) failStepRef.current = null;
      setProgress(tr('Шалгаж байна…'));
      const prep = await prepareSave({ sc, kind, pkg, rows, base, draft, ham, aDraft, resDraft, obDraft, obResDraft, obPlan, obRes, obOids });
      if (!prep.ok && prep.hamLong) {
        setErr(approvalMode
          ? tr('Батлах боломжгүй — буцааж, зохиогч {0} мөрийн уялдааны бичиглэлийг {1} тэмдэгтээс богиносгож дахин илгээнэ. Эх хуудсанд юу ч бичигдсэнгүй.', num(prep.hamLong), String(HAM_MAX))
          : tr('{0} мөрийн уялдааны бичиглэл {1} тэмдэгтээс урт тул хадгалагдсангүй. Блок тус бүрийн уялдааг цөөлөх эсвэл бүх блокт нэг уялдаа болгоно уу.', num(prep.hamLong), String(HAM_MAX)));
        return false;
      }
      if (!prep.ok) {
        setErr(approvalMode
          ? tr('Батлах боломжгүй — {0} мөр энэ хуудаснаас олдсонгүй, хуудас хооронд нь шинэчлэгдсэн байна. Эх хуудсанд юу ч бичигдсэнгүй; буцааж, зохиогч дахин илгээнэ.', num(prep.stale))
          : tr('{0} мөр энэ хуудаснаас олдсонгүй — хуудас хооронд нь шинэчлэгдсэн байна. Хуваарь бичигдсэнгүй; хуудсаа сэргээгээд дахин илгээнэ үү.', num(prep.stale)));
        return false;
      }
      const { upd, obEdits, unbal, unbalKeys, resSkipped, resSkippedKeys, resDropped, rfUnknown, obLost, grpSkipped } = prep;
      let obN = 0;
      if (approvalMode && (unbal || resSkipped || obLost || resDropped || (rfUnknown && obResDraft.size > 0))) {
        const why: string[] = [];
        if (unbal) why.push(tr('{0} ажлын сарын задаргааны нийлбэр нийт обьёмтой тэнцэхгүй', num(unbal)));
        if (resSkipped || rfUnknown) why.push(tr('сарын хүн хүч/машины талбар шалгагдсангүй эсвэл алга'));
        if (obLost) why.push(tr('{0} ажил·блокийн сарын задаргааны ажил хуудсанд олдсонгүй', num(obLost)));
        if (resDropped) why.push(tr('{0} ажил·блокийн мужаас гадуурх сарын хүн хүч/машин хаягдах байсан', num(resDropped)));
        setErr(tr('Батлах боломжгүй — {0}. Эх хуудсанд юу ч бичигдсэнгүй; илгээлт хүлээгдэж буй хэвээр. Буцааж, зохиогч дахин тэнцүүлнэ.', why.join(' · ')));
        return false;
      }
      if (!upd.length && !obDraft.size && !obResDraft.size) {
        setDraft((m0) => { const m = new Map(m0); for (const k of tookD) m.delete(k); return m; });
        setHam((m0) => { const m = new Map(m0); for (const k of tookH) m.delete(k); return m; });
        setADraft((m0) => { const m = new Map(m0); for (const k of tookA) m.delete(k); return m; });
        setResDraft((m0) => { const m = new Map(m0); for (const k of tookR) m.delete(k); return m; });
        setNote(tr('Өөрчлөлт олдсонгүй — хуваарь хэвээрээ.'));
        return true;
      }
      const archGate = async (): Promise<boolean> => {
        let arch: { who: string; at: number } | null;
        try {
          arch = await archivingBusy(pkg.key);
        } catch (e) {
          setErr(tr('Гүйцэтгэлийн архивлалтын төлөв шалгагдсангүй ({0}) — эх хуудсанд юу ч бичигдсэнгүй; дахин оролдоно уу.', friendlyError(e)));
          return false;
        }
        if (arch) {
          setErr(tr('{0} энэ багцын гүйцэтгэлийг архивлаж байна ({1}-аас) — дуустал хуваарь бичихгүй. Эх хуудсанд юу ч бичигдсэнгүй; хэдэн минутын дараа дахин оролдоно уу.',
            arch.who || '—', new Date(arch.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })));
          return false;
        }
        let aj: { who: string } | null;
        try {
          aj = await ajilApplyBusyFor(pkg.key);
        } catch (e) {
          setErr(tr('Нэмэлт ажлын буулгалтын төлөв шалгагдсангүй ({0}) — юу ч бичсэнгүй, дахин оролдоно уу.', friendlyError(e)));
          return false;
        }
        if (aj) {
          setErr(tr('{0} энэ багцад нэмэлт ажлыг яг одоо хуудсанд буулгаж байна — дуусахыг хүлээнэ үү. Юу ч бичсэнгүй.', aj.who || '—'));
          return false;
        }
        return true;
      };
      if (!(await archGate())) return false;
      if (!approvalMode) {
        const why = await xLockCheck();
        if (why) { setErr(why); return false; }
      }
      const fresh = await loadRows(pkg, sc, undefined, undefined, { strict: true });
      let remapped = 0;
      let lost = 0;
      const lostOids = new Set<number>();
      const freshOids = new Set(fresh.rows.map((r) => r.oid));
      if (fresh.rows[0]?.oid !== rows[0]?.oid || upd.some((a) => !freshOids.has(a[sc.f.oid] as number))) {
        const { map } = remapRowsFull(rows, fresh.rows);
        const moved2: Record<string, unknown>[] = [];
        for (const a of upd) {
          const nk = map.get(a[sc.f.oid] as number);
          if (nk == null) { lost += 1; lostOids.add(a[sc.f.oid] as number); continue; }
          moved2.push({ ...a, [sc.f.oid]: nk });
          remapped += 1;
        }
        if (lost && approvalMode) {
          setErr(tr('{0} мөр хуудасны шинэ хувилбарт олдсонгүй — хуудас хооронд нь шинэчлэгдсэн байна. Эх хуудсанд юу ч бичигдсэнгүй; буцааж, зохиогч дахин илгээнэ.', num(lost)));
          return false;
        }
        upd.length = 0;
        upd.push(...moved2);
      }
      if (upd.length && !(await archGate())) return false;
      if (approvalMode) {
        const head = await loadSubmissionHead(approving);
        const why = approveGuard(head, approving, user?.username ?? '', claimAtRef.current ?? undefined);
        if (why) { setErr(why); return false; }
        if (head && partialBy(head.status, head.reason) != null) wroteSomeRef.current = approving;
        if (upd.length || obEdits) {
          const mk = await markPlanPartial({ oid: approving, approver: user?.username ?? '', claimAt: claimAtRef.current ?? undefined });
          if (mk.existing) wroteSomeRef.current = approving;
          if (!mk.ok) {
            if (wroteSomeRef.current === approving) {
              setErr(tr('Хагас бичилтийн хамгаалалтын тэмдэг дахин хадгалагдсангүй ({0}) — өмнөх оролдлогод эх хуудсанд бичигдсэн тул буцаах боломжгүй; «Батлах»-ыг дахин дарж дуусгана уу.', mk.error ?? ''));
              return false;
            }
            await clearPlanPartial(approving, user?.username ?? '');
            setErr(tr('Хагас бичилтийн хамгаалалтын тэмдэг хадгалагдсангүй ({0}) — эх хуудсанд юу ч бичигдсэнгүй; дахин оролдоно уу.', mk.error ?? ''));
            return false;
          }
          partialRef.current = approving;
        }
      }
      const renewClaim = async (step: 'dates' | 'obyem'): Promise<boolean> => {
        if (!approvalMode || approving == null) return true;
        let rn: { ok: boolean; at?: number; error?: string };
        try {
          rn = await renewPlanClaim({ oid: approving, approver: user?.username ?? '', claimAt: claimAtRef.current ?? 0 });
        } catch (e) {
          rn = { ok: false, error: friendlyError(e) };
        }
        if (rn.ok) {
          if (rn.at != null) claimAtRef.current = rn.at;
          return true;
        }
        failStepRef.current = { oid: approving, step, written: 0 };
        setErr(tr('Батлах түгжээг сунгаж чадсангүй ({0}) — энэ алхамд эх хуудсанд юу ч бичигдсэнгүй; илгээлт «Хүлээгдэж буй» хэвээр. Хуудсаа шинэчлээд «Батлах»-ыг дахин дарна уу.', rn.error ?? '—'));
        return false;
      };
      const frame0 = frameIdOf(fresh);
      if (upd.length) {
        if (!(await renewClaim('dates'))) return false;
        setProgress(tr('Огноо бичиж байна (1/{0})… {1} мөр', String(steps), num(upd.length)));
        try {
          await applyUpdates(pkg, upd);
          if (approvalMode) wroteSomeRef.current = approving;
        } catch (e) {
          if (approvalMode && (((e as { written?: number })?.written ?? 0) > 0 || isLostWrite(e))) wroteSomeRef.current = approving;
          if (approvalMode) failStepRef.current = { oid: approving, step: 'dates', written: (e as { written?: number })?.written, total: upd.length };
          if (approvalMode && (e as { written?: number })?.written === 0 && partialRef.current === approving) {
            if (isLostWrite(e)) lostWriteRef.current = approving;
            else if (wroteSomeRef.current === approving) { /* өмнөх оролдлого бичсэн — тэмдэг үлдэнэ */ }
            else if (await clearPlanPartial(approving, user?.username ?? '')) partialRef.current = null;
          }
          throw e;
        }
        {
          let moved: boolean | null = null;
          try { moved = frameIdOf(await loadRows(pkg, sc, undefined, undefined, { strict: true })) !== frame0; } catch { moved = null; }
          if (moved !== false && approvalMode) {
            frameMovedRef.current = approving;
            setErr(moved
              ? tr('Бичих зуур хуудасны жааз солигдсон (өөр батлалт/нийтлэл) — огноо хуучин жаазад бичигдсэн байж болзошгүй. Илгээлт «Хүлээгдэж буй» хэвээр (буцаах боломжгүй); хуудсаа шинэчлээд «Батлах»-ыг дахин дарна уу.')
              : tr('Бичсэний дараах жаазын шалгалт унав — илгээлт «Хүлээгдэж буй» хэвээр (буцаах боломжгүй); хуудсаа шинэчлээд «Батлах»-ыг дахин дарна уу.'));
            return false;
          }
          if (moved !== false) {
            setErr(moved
              ? tr('Бичих зуур хуудасны жааз солигдсон (гүйцэтгэлийн архивлалт/нийтлэл) — огноо хуучин жаазад бичигдсэн байж болзошгүй. Ноорог хадгалагдсан хэвээр; дахин оролдоно уу.')
              : tr('Бичсэний дараах жаазын шалгалт унав — ноорог хадгалагдсан хэвээр; дахин оролдоно уу.'));
            return false;
          }
        }
      }

      /*
       * ── САРЫН ОБЬЁМ — ТУСДАА ҮЙЛЧИЛГЭЭ (бичилт; бэлтгэл нь дээр) ─────
       */
      if (obEdits) {
        obEdits.dups = obDups;
        let r2: [number, number, number];
        if (approvalMode) {
          if (!(await renewClaim('obyem'))) return false;
          const head2 = await loadSubmissionHead(approving).catch(() => null);
          const why2 = approveGuard(head2, approving, user?.username ?? '', claimAtRef.current ?? undefined);
          if (why2) {
            failStepRef.current = { oid: approving, step: 'obyem', written: 0 };
            setErr(why2);
            return false;
          }
        }
        setProgress(tr('Сарын обьём бичиж байна (2/{0})…', String(steps)));
        try {
          r2 = await applyPlanEdits(obEdits);
          if (approvalMode && r2[0] + r2[1] + r2[2] > 0) wroteSomeRef.current = approving;
        } catch (e) {
          if (approvalMode && (((e as { written?: number })?.written ?? 0) > 0 || isLostWrite(e))) wroteSomeRef.current = approving;
          if (approvalMode) {
            failStepRef.current = { oid: approving, step: 'obyem', written: (e as { written?: number })?.written,
              total: (e as { total?: number })?.total ?? (obEdits.adds.length + obEdits.updates.length + obEdits.deletes.length) };
          }
          if (approvalMode && !upd.length && (e as { written?: number })?.written === 0 && partialRef.current === approving) {
            if (isLostWrite(e)) lostWriteRef.current = approving;
            else if (wroteSomeRef.current === approving) { /* өмнөх оролдлого бичсэн — тэмдэг үлдэнэ */ }
            else if (await clearPlanPartial(approving, user?.username ?? '')) partialRef.current = null;
          }
          try {
            const r0 = await loadRows(pkg, sc);
            setRows(r0.rows);
            const fr = await loadPkgPlan(pkg.key);
            setObPlan(fr.plan); setObRes(fr.res); setObOids(fr.oids); setObDups(fr.dups); setObState('ok'); obLoadedRef.current = true;
          } catch { setObState('fail'); obLoadedRef.current = false; }
          throw e;
        }
        obN = r2[0] + r2[1] + r2[2];
      }

      let reloadFail = false;
      setProgress(tr('Хуудсыг дахин уншиж байна…'));
      try {
        const r = await loadRows(pkg, sc);
        setRows(r.rows);
      } catch { reloadFail = true; }
      const clearable = (k: number) => !lostOids.has(k);
      setDraft((m0) => { const m = new Map(m0); for (const k of tookD) if (clearable(k)) m.delete(k); return m; });
      setHam((m0) => { const m = new Map(m0); for (const k of tookH) if (clearable(k)) m.delete(k); return m; });
      setADraft((m0) => { const m = new Map(m0); for (const k of tookA) if (clearable(k)) m.delete(k); return m; });
      setResDraft((m0) => { const m = new Map(m0); for (const k of tookR) if (clearable(k)) m.delete(k); return m; });
      setObDraft((m0) => {
        const m = new Map<string, Map<string, number>>();
        for (const [k, months] of m0) if (!tookOb.has(k) || unbalKeys.has(k)) m.set(k, months);
        return m;
      });
      /* Сарын нөөцийн ноорог — тэнцээгүй (бичигдээгүй) ба талбаргүй тул алгассан
         блокийнхыг үлдээнэ (2026-09-24) — батлалт `dirtyN > 0`-д зогсоно. */
      setObResDraft((m0) => {
        const m = new Map<string, Map<string, MonthRes>>();
        for (const [k, v] of m0) if (!tookObR.has(k) || unbalKeys.has(k) || resSkippedKeys.has(k)) m.set(k, v);
        return m;
      });
      try {
        const fresh2 = await loadPkgPlan(pkg.key);
        setObPlan(fresh2.plan);
        setObRes(fresh2.res);
        setObOids(fresh2.oids);
        setObDups(fresh2.dups);
        setObState('ok'); obLoadedRef.current = true;
      } catch { /* задаргаагүйгээр үргэлжилнэ */ }
      setNote(remapped
        ? tr('{0} ажлын хуваарь хадгалагдлаа — хуудас хооронд нь шинэчлэгдсэн тул шинэ хувилбарт зөөв', num(upd.length))
        : obN
          ? tr('{0} ажлын хуваарь · {1} сарын обьём хадгалагдлаа', num(upd.length), num(obN))
          : tr('{0} ажлын хуваарь хадгалагдлаа', num(upd.length)));
      const errs: { msg: string; oid?: number }[] = [];
      if (lost) {
        errs.push({ msg: tr('{0} мөр хуудасны шинэ хувилбарт олдсонгүй — тэдгээрийн хуваарь хадгалагдсангүй.', num(lost)) });
        for (const o of lostOids) {
          const r0 = rows.find((x) => x.oid === o);
          errs.push({ msg: tr('Ноорогт үлдсэн: {0}', r0 ? `${r0.no ?? '—'} · ${fixCyr(r0.work) ?? ''}` : String(o)), oid: o });
        }
      }
      if (reloadFail) errs.push({ msg: tr('Хадгалагдсан боловч хуудсыг дахин уншиж чадсангүй — хуудсаа сэргээнэ үү.') });
      setUndoSnap(null); setChainN(0);
      if (unbal) {
        errs.push({ msg: tr('{0} ажлын сарын задаргааны нийлбэр нийт обьёмтой тэнцэхгүй тул хадгалагдсангүй — хуваарь шилжихэд мужаас гарсан сарууд хасагдсан байна. Тухайн ажлын цонхыг нээж дахин бөглөнө үү.', num(unbal)) });
      }
      if (resSkipped && rfUnknown) {
        errs.push({ msg: tr('Сарын хүснэгтийн хүн хүч/машин талбарыг шалгаж чадсангүй — {0} ажил·блокийн сарын нөөц хадгалагдсангүй. Дахин оролдоно уу.', num(resSkipped)) });
      } else if (resSkipped) {
          errs.push({ msg: tr('{0} ажил·блокийн сарын хүн хүч/машин механизм хадгалагдсангүй — сарын хүснэгтэд энэ талбар алга. Админд мэдэгдэнэ үү.', num(resSkipped)) });
      }
      if (resDropped) {
        errs.push({ msg: tr('{0} ажил·блокийн мужаас гадуурх сарын хүн хүч/машин хаягдлаа — обьёмгүй сард мөр байхгүй.', num(resDropped)) });
      }
      if (obLost) {
        errs.push({ msg: tr('{0} ажил·блокийн сарын задаргааны ажил хуудсанд олдсонгүй — тэр задаргаа хадгалагдсангүй, дахин бөглөнө үү.', num(obLost)) });
      }
      if (grpSkipped) {
        errs.push({ msg: tr('{0} бүлгийн сарын задаргаа бичигдсэнгүй — сарын обьём бүлэгт биш, доторх ажил тус бүрт хуваана.', num(grpSkipped)) });
      }
      if (errs.length) setErrList(errs);
      return true;
    } catch (e) {
      const lostHere = isLostWrite(e) && !(approving != null && lostWriteRef.current === approving);
      setErr(lostHere
        ? tr('Хариу ирээгүй — эх хуудсанд бичигдсэн эсэх нь тодорхойгүй (үр дүн тодорхойгүй: {0}). Хуудсаа шинэчилж шалгаад шаардлагатай бол дахин хадгална уу.', friendlyError(e))
        : userError(e));
      return false;
    } finally {
      setBusy(false);
      setProgress('');
    }
  }, [sc, draft, ham, aDraft, resDraft, obDraft, obResDraft, obPlan, obRes, obOids, obDups, obState, base, dirtyN, busy, pkg, rows, kind, approving, user, xLockCheck,
    setBusy, setErr, setNote, setDraft, setHam, setADraft, setResDraft, setRows, setObPlan, setObRes, setObOids, setObDups, setObState, setObDraft, setObResDraft, setProgress, setErrList, setUndoSnap, setChainN]);

  /* ══════════════ БАТЛАХ УРСГАЛ ══════════════
   */

  const flowSeq = useRef(0);
  /** Сүүлд ачаалсан хүлээгдэж буй илгээлт (багцын түлхүүртэй) — алга болсныг илрүүлэхэд (2026-09-25) */
  const flowPendRef = useRef<{ key: string; oid: number | null }>({ key: '', oid: null });
  const flowThrewRef = useRef(false);
  const refetchRef = useRef<(guard?: () => boolean) => Promise<{ rows: SheetRow[]; plan: PkgPlan; res: PkgRes }>>(
    async () => ({ rows: [], plan: new Map(), res: new Map() }),
  );
  const refetchBg = useCallback(async (): Promise<boolean> => {
    if (busyNowRef.current) return false;
    const g = busyGenRef.current;
    const ok = () => g === busyGenRef.current && !busyNowRef.current;
    await refetchRef.current(ok);
    return ok();
  }, []);
  /** Хүлээгдэж буй илгээлт ба хүснэгтийн бэлэн байдлыг татна */
  const subSyncOkRef = useLatest(status !== 'off' && (canEditRole || canApprove));
  const refreshFlow = useCallback(async (opt?: { noRefetch?: boolean }) => {
    const my = ++flowSeq.current;
    const key = pkg.key;
    const k0 = kind;
    const live = () => my === flowSeq.current && key === pkgKeyRef.current && k0 === kindRef.current;
    setFlowReady(null); setPending((p0) => (p0 && p0.pkgKey === key ? p0 : null)); setLastDecision(null);
    try {
      const st = await planTableState(status === 'off' || roleForUser(user?.username) === 'super');
      if (!live()) return;
      const ready = st.ok;
      flowThrewRef.current = !ready && st.why === 'error';
      if (!ready) setFlowReady(false);
      setFlowWhy(ready ? '' : (
        st.why === 'auth'
          ? tr('Порталд нэвтрээгүй байна — гарч ороод дахин оролдоно уу.')
          : st.why === 'owner'
            ? tr('Батлах хүснэгт байгаа ч эзэмшигч нь танигдахгүй байна — админд мэдэгдэнэ үү.')
            : st.why === 'error'
              ? tr('Порталын хайлт амжилтгүй: {0}', friendlyError({ message: st.detail ?? '' }))
              : tr('Батлах хүснэгт олдсонгүй — админ (super) нэг удаа нэвтрэхэд автоматаар үүснэ.')
      ));
      const other: PlanKind = kind === 'plan' ? 'geree' : 'plan';
      const both = ready ? await loadPendingBoth(pkg.key) : null;
      const p = both ? both[kind] : null;
      const pOther = both ? both[other] : null;
      if (!live()) return;
      setPending(p);
      setPendingOther(pOther);
      if (both && subSyncOkRef.current) {
        const dk = hdKey(kind, key);
        const ctxOk = hdKeyRef.current === dk && hdReadyRef.current === dk;
        void planSyncSubmitted(key, { known: both, ctxKind: kind, ...(ctxOk ? { ctx: hdCtxRef.current } : {}) });
      }
      if (ready) setFlowReady(true);
      if (ready) {
        const was = flowPendRef.current;
        flowPendRef.current = { key: `${kind}:${key}`, oid: p?.oid ?? null };
        if (was.key === `${kind}:${key}` && was.oid != null && was.oid !== (p?.oid ?? null)) {
          if (previewingRef.current) {
            setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
            setADraft(new Map()); setResDraft(new Map());
            setPreviewing(false);
          }
          setOkRows(new Set());
          if (!opt?.noRefetch) {
            void (busyNowRef.current ? refetchRef.current() : refetchBg()).catch(() => { /* дараагийн ачаалалтаар */ });
          }
        }
      }
      const last = ready && !p ? ((await loadHistory(pkg.key, 1, kind))[0] ?? null) : null;
      if (!live()) return;
      setLastDecision(last);
    } catch (e) {
      if (!live()) return;
      flowThrewRef.current = true;
      setFlowReady(false);
      setFlowWhy(tr('Батлах урсгал уншигдсангүй: {0}', friendlyError(e)));
      setPending((p0) => (p0 && p0.pkgKey === key ? p0 : null));
      setLastDecision(null);
    }
  }, [pkg.key, kind, user, status, pkgKeyRef, kindRef, setDraft, setHam, setObDraft, setObResDraft, setADraft, setResDraft, setOkRows, refetchBg, subSyncOkRef, hdKeyRef, hdReadyRef, hdCtxRef]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refreshFlow(); }, [refreshFlow]);

  /**
   * ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТИЙГ 30 с ТУТАМ ШАЛГАНА (2026-09-29, хэрэглэгч: «буцаасан шалтгаан
   * зохиогчид харагдахгүй байна»). Урьд нь урсгал зөвхөн хуудас нээхэд уншигддаг тул
   * батлагч буцаасан/баталсан ч зохиогчийн нээлттэй хуудас «хүлээгдэж буй» хэвээр үлдэж,
   * шалтгаан ба буцсан ноорог хуудсаа дахин ачаалах хүртэл харагддаггүй байв.
   */
  const pollOkRef = useLatest(!review && approving == null && (!previewing || isOwnSubmission) && !busy && flowReady === true);
  const pollRetryRef = useLatest(!review && approving == null && !busy && flowReady === false);
  const dragOnRef = useLatest(drag != null);
  useEffect(() => {
    if (status === 'off') return undefined;
    const key = pkg.key;
    const k0 = kind;
    const other: PlanKind = k0 === 'plan' ? 'geree' : 'plan';
    const refetchOk = () => !!pendRef.current.other && !dragOnRef.current && !uiOpenRef.current;
    let bgOn = false;
    const id = window.setInterval(() => {
      if (document.hidden || pkgKeyRef.current !== key || kindRef.current !== k0) return;
      if (pollRetryRef.current) { if (flowThrewRef.current) void refreshFlow(); return; }
      if (!pollOkRef.current) return;
      const was = flowPendRef.current.oid;
      void loadPendingBoth(key).then((both) => {
        if (!pollOkRef.current || pkgKeyRef.current !== key || kindRef.current !== k0) return;
        if ((both[k0]?.oid ?? null) !== was) {
          if (previewingRef.current) setNote('');
          void refreshFlow();
          return;
        }
        const pO = both[other];
        if ((pO?.oid ?? null) !== (pendRef.current.other?.oid ?? null)) {
          const gone = pendRef.current.other;
          if (!pO && gone) {
            if (bgOn || !refetchOk()) return;
            bgOn = true;
            const goneOid = gone.oid;
            void refetchBg().then((done) => {
              /* Татлагын завсарт шинэ илгээлт ирсэн бол (`pendingOther` өөр) дарахгүй */
              if (done && pkgKeyRef.current === key && kindRef.current === k0) {
                setPendingOther((cur) => (cur?.oid === goneOid ? null : cur));
              }
            }).catch(() => { /* дараагийн мөчлөгт */ }).finally(() => { bgOn = false; });
            return;
          }
          setPendingOther(pO);
        }
      }).catch(() => { /* дараагийн мөчлөгт */ });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [pkg.key, kind, status, refreshFlow, refetchBg, pkgKeyRef, kindRef, pollOkRef, pollRetryRef, pendRef, dragOnRef]);

  /**
   * БАТЛАХ ДАРААЛААЛААС ШИЛЖИЖ ИРСЭН ХҮСЭЛТИЙГ ХЭРЭГЛЭНЭ (2026-09-16).
   */
  useEffect(() => {
    if (!jump) return;
    const target = PKGS.find((p) => p.key === jump.pkgKey);
    /* 1-р шат: багц соль — дараагийн тойрогт `pending` ирнэ */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (target && target.key !== pkg.key) { setPkg(target); return; }
    if (flowReady === null) return;
    if (pending?.oid === jump.oid) {
      setFlowBox('decide');
      onJumpDone?.();
      return;
    }
    if (pendingOther?.oid === jump.oid) {
      setErr(kind === 'plan'
        ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд шийдвэрлэнэ үү.')
        : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд шийдвэрлэнэ үү.'));
      onJumpDone?.();
      return;
    }
    if (!target) {
      setErr(tr('Багцын түлхүүр бүртгэлд алга — «{0}».', jump.pkgKey));
      onJumpDone?.();
      return;
    }
    setErr(tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'));
    onJumpDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, pkg.key, pending, pendingOther, flowReady]);

  /** Ноорогийг илгээлтийн агуулга болгоно — гурван ноорог нэг дор */
  const buildPayload = useCallback(
    (): PlanPayload => buildPayloadOf({ draft, ham, aDraft, resDraft, obDraft, obResDraft, kind, base, rows, obPlan, obRes }),
    [draft, ham, aDraft, resDraft, obDraft, obResDraft, kind, base, rows, obPlan, obRes],
  );

  /** «Батлуулах» — эх хуудсанд ЮУ Ч бичихгүй, зөвхөн хүснэгтэд хүлээнэ */
  const sendForApproval = useCallback(async (userNote: string) => {
    if (!dirtyN || busy || previewing || !canEdit) return;
    if (obNotReady || ((obDraft.size || obResDraft.size) && !obLoadedRef.current)) {
      setErr(obState === 'loading'
        ? tr('Сарын обьёмын хүснэгт уншигдаж байна — дуусмагц илгээнэ үү.')
        : tr('Сарын обьёмын хүснэгт уншигдаагүй тул илгээх боломжгүй. «Сарын обьём дахин ачаалах»-ыг дарна уу.'));
      return;
    }
    if (frameOld) {
      setErr(tr('Хуудасны сүүлийн хувилбар бүрэн хадгалагдаагүй тул илгээх боломжгүй — өмнөх хувилбар ({0}) харагдаж байна. Цэвэрлэгдсэний дараа хуудсаа сэргээнэ үү.', frameOld.shownDay));
      return;
    }
    setErrList([]);
    {
      const byOid0 = new Map(plan.map((r) => [r.oid, r]));
      const longs = [...ham].filter(([, t]) => t.trim().length > HAM_MAX).map(([o, t]) => {
        const r = byOid0.get(o);
        return { msg: `${r ? `${r.no} ${fixCyr(r.work)}`.trim() : String(o)} (${num(t.trim().length)} > ${num(HAM_MAX)})`, oid: o };
      });
      if (longs.length) {
        setErr(tr('{0} мөрийн уялдааны бичиглэл {1} тэмдэгтээс урт — илгээгдсэнгүй. Блок тус бүрийн уялдааг цөөлөх эсвэл бүх блокт нэг уялдаа болгоно уу.', num(longs.length), String(HAM_MAX)));
        setErrList([{ msg: tr('Урт уялдаатай {0} мөр — дарж тухайн ажил руу очно:', num(longs.length)) }, ...longs.slice(0, 30),
          ...(longs.length > 30 ? [{ msg: tr('… ба {0}', num(longs.length - 30)) }] : [])]);
        setFlowBox(null);
        return;
      }
    }
    {
      const { bad, names: list } = unbalancedObyem(plan, sc?.bld ?? [], obDraft, obPlan);
      if (bad > 0) {
        const shown = list.slice(0, 3).join(', ') + (list.length > 3 ? ` (+${num(list.length - 3)})` : '');
        setErr(tr('{0} ажлын сарын задаргаа обьёмтойгоо тэнцэхгүй байна (хоосон задаргаа = 0): {1}. Тухайн ажлын цонхыг нээж сараар тэнцүүлнэ үү.', num(bad), shown));
        const byOid = new Map(plan.map((r) => [r.oid, r]));
        const items = [...unbalRows].map(([o, bs]) => {
          const r = byOid.get(o);
          const bn = (sc?.bld.length ?? 0) > 1 ? ` (${bs.map((b) => sc?.bld[b] ?? String(b + 1)).join(', ')})` : '';
          return { msg: `${r ? `${r.no} ${fixCyr(r.work)}`.trim() : String(o)}${bn}`, oid: o, b: bs[0] };
        });
        setErrList([{ msg: tr('Тэнцээгүй {0} мөр — дарж тухайн ажил руу очно:', num(items.length)) }, ...items.slice(0, 30),
          ...(items.length > 30 ? [{ msg: tr('… ба {0}', num(items.length - 30)) }] : [])]);
        setFlowBox(null);
        return;
      }
    }
    if (obOut.bad > 0) {
      setErr(obOutMsg);
      return;
    }
    {
      const have = new Set(rows.map((r) => r.oid));
      const stale = new Set([...draft.keys(), ...ham.keys(), ...aDraft.keys(), ...resDraft.keys()].filter((o) => !have.has(o)));
      if (stale.size) {
        setErr(tr('{0} мөрийн ноорог одоогийн хуудаснаас олдсонгүй — хуудас хооронд нь шинэчлэгдсэн байна. Илгээгдсэнгүй; хуудсаа сэргээгээд дахин илгээнэ үү.', num(stale.size)));
        return;
      }
      if (orphanOb.size) {
        setErr(tr('{0} ажил·блокийн сарын обьёмын ноорог одоогийн хуудсанд байхгүй ажилд хамаарна (өнчин) — илгээгдсэнгүй. «Өнчин ноорог устгах»-аар цэвэрлээд дахин илгээнэ үү.', num(orphanOb.size)));
        return;
      }
    }
    setBusy(true); setErr(''); setNote('');
    setProgress(tr('Шалгаж байна…'));
    const hdMark = hdSubmitBegin();
    try {
      {
        const why = await xLockCheck();
        if (why) { setErr(why); return; }
      }
      setProgress(tr('Илгээж байна… {0} мөр', num(dirtyRows)));
      const r = await submitPlan({
        pkgKey: pkg.key,
        pkgGroup: pkg.group,
        author: user?.username ?? '',
        rowCount: dirtyRows,
        note: userNote,
        payload: buildPayload(),
      });
      if (!r.ok) { setErr(r.error ? userError(r.error) : tr('Илгээгдсэнгүй.')); await refreshFlow(); return; }
      setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
      setADraft(new Map()); setResDraft(new Map());
      setFlowBox(null); setFlowTxt('');
      setBackMarks(null);
      setUndoSnap(null); setChainN(0); setChgOpen(false);
      setNote(tr('Хуваарь батлуулахаар илгээгдлээ — батлагч шийдвэрлэнэ.'));
      setProgress(tr('Ноорог цэвэрлэж байна…'));
      await hdClearRef.current(hdKey(kind, pkg.key), hdMark, r.oid ?? null);
      setProgress(tr('Төлөв шинэчилж байна…'));
      await refreshFlow();
    } catch (e) {
      if (isLostWrite(e)) {
        setErr(tr('Хариу ирээгүй — илгээгдсэн эсэх нь тодорхойгүй (үр дүн тодорхойгүй: {0}). Хуудсаа шинэчилж шалгаад шаардлагатай бол дахин илгээнэ үү.', friendlyError(e)));
        await refreshFlow().catch(() => { /* мэдэгдэл дээр */ });
      } else setErr(userError(e));
    } finally {
      /* `refreshFlow`-ийн ДАРАА — `pending` тавигдсан тул зогсоосон бичилт түгжээнд буцна */
      hdSubmitEnd();
      setBusy(false);
      setProgress('');
    }
  }, [dirtyN, dirtyRows, busy, previewing, canEdit, pkg, user, buildPayload, refreshFlow, plan, sc, obDraft, obPlan, rows, draft, ham, aDraft, resDraft, kind, hdClearRef, xLockCheck,
    hdSubmitBegin, hdSubmitEnd, setErr, setBusy, setNote, setDraft, setHam, setObDraft, setObResDraft, setADraft, setResDraft, setBackMarks,
    unbalRows, obOut, obOutMsg, setErrList, setFlowBox, setProgress, obNotReady, obState, obResDraft, frameOld, orphanOb]);

  /**
   * ИЛГЭЭГДСЭН АГУУЛГЫГ НООРОГТ БУУЛГАХ — урьдчилан харах ба батлах ХОЁУЛАА
   * үүнийг хэрэглэнэ (нэг зам — хоёр салаа бичвэл нэг нь чимээгүй хоцорно).
   */
  /**
   * Илгээлтийн агуулгыг ноорогт буулгана — БАТЛАХЫН ӨМНӨХ алхам.
   */
  const applyPayloadToDraft = useCallback((
    p0: PlanPayload,
    curRows: SheetRow[],
    strict = true,
    curPlan: PkgPlan = obPlan,
    curRes: PkgRes = obRes,
  ): { ok: true; conflicts: number; unknown: number } | { ok: false; why: 'kind' | 'conflict' | 'unknown'; conflicts: number; unknown: number } => {
    const ap = payloadToDrafts(p0, curRows, strict, curPlan, curRes, { kind, n });
    if (ap.conflictList.length) {
      const bld = sc?.bld ?? [];
      const items = ap.conflictList.slice(0, 10).map((c) => ({
        msg: conflictText(c, bld), oid: c.oid ?? undefined, b: c.blk ?? undefined,
      }));
      setErrList([{ msg: tr('Илгээснээс хойш өөр замаар өөрчлөгдсөн {0} нүд:', num(ap.conflictList.length)) }, ...items,
        ...(ap.conflictList.length > 10 ? [{ msg: `+${num(ap.conflictList.length - 10)}` }] : [])]);
    } else setErrList([]);
    if (!ap.ok) return ap;
    const { maps } = ap;
    setDraft(maps.draft); setHam(maps.ham); setObDraft(maps.obDraft); setObResDraft(maps.obResDraft);
    setADraft(maps.aDraft); setResDraft(maps.resDraft);
    setUndoSnap(null);
    return { ok: true, conflicts: ap.conflicts, unknown: ap.unknown };
  }, [kind, n, obPlan, obRes, sc, setDraft, setHam, setObDraft, setObResDraft, setADraft, setResDraft, setErrList, setUndoSnap]);

  /**
   * СЕРВЕРИЙН ОДООГИЙН мөр ба сарын задаргааг татаж state-д тавина (2026-09-21).
   */
  const refetchServer = useCallback(async (
    guard?: () => boolean,
    opts?: { strict?: boolean; needOb?: boolean },
  ): Promise<{ rows: SheetRow[]; plan: PkgPlan; res: PkgRes }> => {
    const lr = sc ? await loadRows(pkg, sc, undefined, undefined, opts?.strict ? { strict: true } : undefined) : null;
    const freshRows = lr ? lr.rows : rows;
    if (guard && !guard()) throw new Error('STALE_REFETCH');
    if (sc) {
      setObState('loading'); setRows(freshRows);
      if (lr) setFrameOld(lr.truncated ? { day: lr.truncated.day, shownDay: lr.truncated.shownDay } : null);
    }
    try {
      const fp = await loadPkgPlan(pkg.key);
      if (guard && !guard()) { setObState(obLoadedRef.current ? 'ok' : 'fail'); return { rows: freshRows, plan: obPlan, res: obRes }; }
      setObPlan(fp.plan); setObRes(fp.res); setObOids(fp.oids); setObDups(fp.dups); setObState('ok'); obLoadedRef.current = true;
      return { rows: freshRows, plan: fp.plan, res: fp.res };
    } catch (e) {
      setObState(obLoadedRef.current ? 'ok' : 'fail');
      if (opts?.needOb) {
        throw new Error(tr('Сарын обьёмын хүснэгт уншигдсангүй ({0}) — санал сарын обьём/нөөц агуулж байгаа тул хуучирсан задаргаатай тулгахгүй. Эх хуудсанд юу ч бичигдсэнгүй; дахин оролдоно уу.', friendlyError(e)));
      }
      return { rows: freshRows, plan: obPlan, res: obRes };
    }
  }, [sc, pkg, rows, obPlan, obRes, setObState, setRows, setObPlan, setObRes, setObOids, setObDups, setFrameOld]);

  /** Урьдчилан харах — саналыг хуанли дээр НООРОГ болгон буулгана */
  const preview = useCallback(async (): Promise<boolean> => {
    if (!pending || busy) return false;
    setBusy(true); setErr(''); setPreviewBad(null);
    try {
      setProgress(tr('Саналыг уншиж байна…'));
      const p = await loadPayload(pending.oid);
      if (!p) {
        setPreviewBad(pending.oid);
        setErr(tr('Илгээлтийн агуулга уншигдсангүй (эвдэрсэн) — батлах боломжгүй. Буцааж, зохиогч дахин илгээнэ.'));
        return false;
      }
      setProgress(tr('Хуудсыг дахин уншиж байна…'));
      const srv = await refetchServer(undefined, { needOb: payHasOb(p) });
      const ap = applyPayloadToDraft(p, srv.rows, true, srv.plan, srv.res);
      if (!ap.ok) {
        if (ap.why === 'conflict' || ap.why === 'unknown') setPreviewBad(pending.oid);
        setErr(ap.why === 'conflict'
          ? conflictMsg(ap.conflicts)
          : ap.why === 'unknown'
            ? unknownMsg(ap.unknown)
            : p.kind === 'geree'
            ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд дахин үзнэ үү.')
            : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд дахин үзнэ үү.'));
        return false;
      }
      setViewSavedAt(null);
      setPreviewing(true);
      setFlowBox(null);
      setNote(tr('Санал хуанли дээр урьдчилан харагдаж байна — батлах хүртэл эх хуудсанд бичигдэхгүй.'));
      return true;
    } catch (e) {
      setErr(userError(e));
      return false;
    } finally {
      setBusy(false);
      setProgress('');
    }
  }, [pending, busy, applyPayloadToDraft, refetchServer, setBusy, setErr, setPreviewBad, setNote, setProgress]);

  useEffect(() => { refetchRef.current = refetchServer; }, [refetchServer]);

  /* ══════════════════ НЭМЭЛТ АЖИЛ — урсгал (2026-09-24; `useAjil`) ══════════════════ */
  const {
    addFor, setAddFor, addForm, setAddForm, ajSub, ajEdit, editAdd, setEditAdd,
    ajBusy, ajErr, setAjErr, ajNote, setAjNote, ajBack, dismissAjBack, ajStuck, ajApplied,
    refreshAfterApplied, sendAjil, editAjilHere, saveAjilEdit, cancelAjilEdit,
    withdrawAjilHere, saveEditAdd, addRow, dropAdd,
    ajOrphans, setAddParent,
  } = useAjil({
    pkg, user, status, canAddRow, rows, busy, setBusy, setErr, pkgKeyRef, refetchRef, dirtyNRef, uiOpenRef,
    adds, setAdds, setAddsSt, addsStRef,
    hdResetRestore, hdRetryRestore, hdMapsRef, setDraft, setHam, setADraft, setResDraft,
    setSel, setFGrp, setCollapsed, setModal, setLinkAsk, undoRef,
    setOkRows, setCellEdit,
  });

  /**
   * ИЛГЭЭЛТЭЭ ТАТАХ — зохиогч өөрийн хүлээгдэж буй илгээлтийг буцааж авна
   * (2026-09-21). Урьд нь зохиогчид зам байгаагүй: `decidePlan` зохиогч=батлагч
   * буцаалтыг татгалздаг тул алдаатай илгээлт өөр батлагч буцаатал багцыг
   * түгжинэ.
   */
  const withdraw = useCallback(async () => {
    if (!pending || busy || !isOwnSubmission) return;
    if (!(await askConfirm(tr('Илгээлтээ татах уу? Батлагч шийдвэрлэхээ болино; агуулга нь ноорог болж буцна.'), { ok: tr('Илгээлтээ татах') }))) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const oid = pending.oid;
      setProgress(tr('Саналыг уншиж байна…'));
      const p = await loadPayload(oid).catch(() => null);
      if (!p) { setErr(tr('Илгээлтийн агуулга уншигдсангүй — татсангүй, дахин оролдоно уу.')); return; }
      if (p.kind !== kind) {
        setErr(p.kind === 'geree'
          ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд татна уу.')
          : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд татна уу.'));
        return;
      }
      setProgress(tr('Илгээлтийг татаж байна…'));
      const r = await withdrawPlan({ oid, me: user?.username ?? '' });
      if (!r.ok) { setErr(r.error ? userError(r.error) : tr('Илгээлт татагдсангүй.')); return; }
      await planSyncSubmitted(pkg.key, { force: true }).catch(() => undefined);
      setProgress(tr('Хуудсыг дахин уншиж байна…'));
      hdSkipUnlockOnceRef.current = true;
      await refreshFlow({ noRefetch: true });
      /* Серверийн одоогийн мөртэй тулгаж буулгана — зөрчлийн тоо бодит байна */
      let srv: Awaited<ReturnType<typeof refetchServer>>;
      try {
        srv = await refetchServer();
      } catch (e) {
        setErr(tr('Илгээлт татагдлаа, гэхдээ хуудас дахин уншигдсангүй ({0}) — агуулга ноорогт буусангүй. «Ноорогт буцаах»-ыг дарж сэргээнэ үү.', userError(e)));
        await refreshFlow().catch(() => undefined);
        return;
      }
      backSeenSet(pkg.key, kind, pending.oid);
      const ap = applyPayloadToDraft(p, srv.rows, false, srv.plan, srv.res);
      /* Буулгасан нүд «миний» болж (дифф мета тавина) алсад нэг удаа бичигдэнэ */
      if (ap.ok) {
        if (hdTimerRef.current) clearTimeout(hdTimerRef.current);
        hdTimerRef.current = setTimeout(() => { hdTimerRef.current = null; void hdFlushRef.current(); }, 1500);
      }
      const restored = ap.ok;
      const conflicts = ap.conflicts;
      setPreviewing(false);
      const lostTxt = ap.unknown ? ` ${tr('{0} мөр одоогийн хуудаснаас олдсонгүй тул ноорогт буусангүй.', num(ap.unknown))}` : '';
      setNote((restored
        ? (conflicts
          ? tr('Илгээлт татагдлаа — агуулга ноорог болж буцлаа; {0} нүд хооронд нь өөр замаар өөрчлөгдсөн тул шалгаад дахин илгээнэ үү.', num(conflicts))
          : tr('Илгээлт татагдлаа — агуулга ноорог болж буцлаа, засаад дахин илгээж болно.'))
        : tr('Илгээлт татагдлаа. Агуулга нь ноорогт буусангүй (төрөл зөрсөн эсвэл уншигдсангүй).')) + lostTxt);
      await refreshFlow();
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }, [pending, busy, isOwnSubmission, user, kind, pkg.key, applyPayloadToDraft, refetchServer, refreshFlow, hdFlushRef, hdSkipUnlockOnceRef, hdTimerRef, setBusy, setErr, setNote, setProgress]);

  /**
   * ТАТСАН ИЛГЭЭЛТИЙГ НООРОГТ БУЦААХ (2026-09-23) — сүүлийн шийдвэр `withdrawn`
   * бөгөөд ноорог хоосон үед. «Хуваарь батлах» дарааллаас татахад агуулга
   * зөвхөн серверт үлддэг; энд `withdraw`-тай ИЖИЛ замаар (`strict: false`)
   * буулгана. Эх хуудсанд ЮУ Ч бичихгүй.
   */
  /**
   * @param auto — АВТОМАТ сэргээлт (2026-09-29, доорх эффект): төрөл зөрсөн бол
   *   алдаа харуулахгүй чимээгүй алгасна (өөр табд нээхэд тэнд сэргэнэ).
   */
  const restoreWithdrawn = useCallback(async (auto = false) => {
    const back = lastDecision?.status === PLAN_STATUS.returned;
    if (!lastDecision || (lastDecision.status !== PLAN_STATUS.withdrawn && !back) || busy || dirtyN > 0 || !canEditRole) return;
    setViewSavedAt(null);
    setBusy(true); setErr(''); setNote('');
    try {
      const p = await loadPayload(lastDecision.oid).catch(() => null);
      if (!p) { if (!auto) setErr(tr('Илгээлтийн агуулга уншигдсангүй.')); return; }
      if (p.kind !== kind) {
        if (!auto) setErr(p.kind === 'geree'
          ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд дахин үзнэ үү.')
          : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд дахин үзнэ үү.'));
        return;
      }
      const srv = await refetchServer();
      const ap = applyPayloadToDraft(p, srv.rows, false, srv.plan, srv.res);
      if (ap.ok) backSeenSet(pkg.key, kind, lastDecision.oid);
      setPreviewing(false);
      const lostTxt = ap.unknown ? ` ${tr('{0} мөр одоогийн хуудаснаас олдсонгүй тул ноорогт буусангүй.', num(ap.unknown))}` : '';
      /* Батлагчийн тэмдэглэгээ — зөвхөн тэмдэглэсэн (талбартай) буцаалтад. */
      if (back && ap.ok && lastDecision.okRows) {
        setBackMarks({ oid: lastDecision.oid, ok: new Set(lastDecision.okRows), pay: p });
      }
      if (back && ap.ok) {
        setNote((lastDecision.okRows
          ? tr('Буцаасан хуваарь засварт орлоо — УЛААН мөрүүдийг засаад дахин илгээнэ үү (ногоон нь зөвшөөрөгдсөн).')
          : tr('Буцаасан хуваарь засварт орлоо — засаад дахин илгээнэ үү.'))
          + (ap.conflicts ? ` ${tr('{0} нүд хооронд нь өөр замаар өөрчлөгдсөн тул шалгана уу.', num(ap.conflicts))}` : '') + lostTxt);
        return;
      }
      setNote((ap.ok
        ? (ap.conflicts
          ? tr('Татсан илгээлтийн агуулга ноорог болж буцлаа; {0} нүд хооронд нь өөр замаар өөрчлөгдсөн тул шалгаад дахин илгээнэ үү.', num(ap.conflicts))
          : tr('Татсан илгээлтийн агуулга ноорог болж буцлаа — засаад дахин илгээж болно.'))
        : tr('Агуулга ноорогт буусангүй (төрөл зөрсөн эсвэл уншигдсангүй).')) + lostTxt);
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  }, [lastDecision, busy, dirtyN, canEditRole, kind, pkg.key, applyPayloadToDraft, refetchServer, setBusy, setErr, setNote, setBackMarks]);

  /**
   * БУЦААГДСАН/ТАТСАН САНАЛЫГ АВТОМАТААР НООРОГТ БУУЛГАНА (2026-09-29, хэрэглэгч:
   * «хуваарь төлөвлөөд явуулаад буцаасан тохиолдолд төлөвлөсөн хуваарь алга болж байна»).
   */
  const autoBackRef = useRef('');
  useEffect(() => {
    const d = lastDecision;
    if (review || !d || pending || busy || dirtyN > 0 || !canEditRole || flowReady !== true) return;
    if (d.status !== PLAN_STATUS.returned && d.status !== PLAN_STATUS.withdrawn) return;
    if (d.pkgKey !== pkg.key || hdReadyKey !== hdKey(kind, pkg.key) || obState !== 'ok' || !rows.length) return;
    const me = (user?.username ?? '').trim().toLowerCase();
    if (!me || (d.author ?? '').trim().toLowerCase() !== me) return;
    const tag = `${pkg.key}:${kind}:${d.oid}`;
    if (autoBackRef.current === tag || backSeenGet(pkg.key, kind) === d.oid) return;
    autoBackRef.current = tag;
    void restoreWithdrawn(true);
  }, [review, lastDecision, pending, busy, dirtyN, canEditRole, flowReady, hdReadyKey, obState, rows.length, kind, pkg.key, user, restoreWithdrawn]);
  useEffect(() => {
    const d = lastDecision;
    if (review || !d || (d.status !== PLAN_STATUS.approved && d.status !== PLAN_STATUS.returned)) return;
    const me = (user?.username ?? '').trim().toLowerCase();
    if (!me || (d.author ?? '').trim().toLowerCase() !== me) return;
    if (d.status === PLAN_STATUS.approved) markPlanApprovedSeen(d.oid); else markPlanReturnedSeen(d.oid);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlanNews((xs) => (xs && xs.some((x) => x.oid === d.oid) ? xs.filter((x) => x.oid !== d.oid) : xs));
  }, [review, lastDecision, user]);
  const meName = user?.username ?? null;
  useEffect(() => {
    if (review) return undefined;
    let dead = false;
    void loadPlanNews(meName).then((xs) => {
      if (dead) return;
      /* Энэ хуудсанд аль хэдийн харсан (`lastDecision`) нь localStorage-д тэмдэглэгдсэн тул `loadPlanNews` өөрөө хасна */
      setPlanNews(xs);
    }).catch(() => { /* тэмдэг бол туслах мэдээлэл */ });
    return () => { dead = true; };
  }, [review, meName]);
  /** «шинэ шийдвэр»-тэй багцын бүлэг ба түлхүүр — сонгогчийн цэг (●) */
  const newsKeys = useMemo(() => new Set((planNews ?? []).map((x) => x.pkgKey)), [planNews]);
  const newsGroups = useMemo(
    () => new Set((planNews ?? []).map((x) => PKGS.find((p) => p.key === x.pkgKey)?.group).filter((g): g is string => !!g)),
    [planNews],
  );

  /** Урьдчилан харахыг болих — ноорог зүгээр л хаягдана */
  const clearPreview = useCallback(() => {
    setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
    setADraft(new Map()); setResDraft(new Map());
    /* Мөрийн ногоон тэмдэглэгээ нь харсан саналынх — харалттай хамт арилна (2026-09-25) */
    setOkRows(new Set());
    setPreviewing(false); setNote('');
    setUndoSnap(null); setChgOpen(false);
    hdResetRestore();
  }, [hdResetRestore, setDraft, setHam, setObDraft, setObResDraft, setADraft, setResDraft, setOkRows, setNote, setUndoSnap, setChgOpen]);

  /**
   * ИЛГЭЭСЭН (БАТЛАГДААГҮЙ) ХУВААРИЙГ ХАРАХ (2026-09-29, хэрэглэгч: «одоо байгаа батлагдсан
   * хуваарь болон илгээсэн батлагдаагүй хуваарийг сольж харах товч нэмэх»).
   */
  const viewSent = useCallback(async () => {
    if (!pending || busy || previewing) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const p0 = await loadPayload(pending.oid);
      if (!p0) { setErr(tr('Илгээлтийн агуулга уншигдсангүй.')); return; }
      if (p0.kind !== kind) {
        setErr(p0.kind === 'geree'
          ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд дахин үзнэ үү.')
          : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд дахин үзнэ үү.'));
        return;
      }
      const srv = await refetchServer();
      const ap = applyPayloadToDraft(p0, srv.rows, false, srv.plan, srv.res);
      if (!ap.ok) { setErr(tr('Илгээсэн хуваарь хуанли дээр буусангүй.')); return; }
      setViewSavedAt(null);
      setPreviewing(true);
      setNote(tr('Илгээсэн (батлагдаагүй) хуваарь харагдаж байна — зөвхөн харах.')
        + (ap.conflicts ? ` ${tr('{0} нүд хооронд нь өөр замаар өөрчлөгдсөн тул шалгана уу.', num(ap.conflicts))}` : '')
        + (ap.unknown ? ` ${tr('{0} мөр одоогийн хуудаснаас олдсонгүй тул ноорогт буусангүй.', num(ap.unknown))}` : ''));
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  }, [pending, busy, previewing, kind, applyPayloadToDraft, refetchServer, setBusy, setErr, setNote]);

  /**
   * ШИЙДВЭР — батлах эсвэл буцаах.
   */
  const decide = useCallback(async (approve: boolean, reason: string, okList?: number[]) => {
    if (!pending || busy) return;
    setBusy(true); setErr(''); setNote(''); setErrList([]);
    setProgress(approve ? tr('Шалгаж байна…') : tr('Буцааж байна…'));
    try {
      if (approve) {
        if (!canApprove) { setErr(tr('Энэ багцын хуваарийг батлах эрхгүй.')); return; }
        if (frameOld) {
          setErr(tr('Хуудасны сүүлийн хувилбар бүрэн хадгалагдаагүй тул батлах боломжгүй — өмнөх хувилбар ({0}) дээр харсан санал. Цэвэрлэгдсэний дараа дахин оролдоно уу.', frameOld.shownDay));
          setFlowBox(null);
          return;
        }
        const fresh = await loadPending(pkg.key, kind);
        if (!fresh || fresh.oid !== pending.oid) {
          setErr(tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'));
          setFlowBox(null);
          await refreshFlow();
          return;
        }
        const me = (user?.username ?? '').trim().toLowerCase();
        if (me && me === fresh.author.trim().toLowerCase()) {
          setErr(tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.'));
          setFlowBox(null);
          return;
        }
        if (reviewOids.some((o) => !okRows.has(o))) {
          setErr(tr('Өөрчлөгдсөн мөр бүрийг ногоон болгосны дараа батална.'));
          setFlowBox(null);
          return;
        }
        if (previewing && obOut.bad > 0) {
          setErr(obOutMsg);
          setFlowBox(null);
          return;
        }
        const cl = await claimPlan({ oid: pending.oid, approver: user?.username ?? '', author: fresh.author });
        if (!cl.ok) {
          setErr(cl.error ?? tr('Шийдвэр хадгалагдсангүй.'));
          setFlowBox(null);
          await refreshFlow();
          return;
        }
        claimAtRef.current = cl.at ?? null;
        if (lostWriteRef.current !== pending.oid) lostWriteRef.current = null;
        if (wroteSomeRef.current !== pending.oid) wroteSomeRef.current = null;
        frameMovedRef.current = null;
        failStepRef.current = null;
        const oid0 = pending.oid;
        const release = () => (partialRef.current === oid0 ? Promise.resolve() : releasePlanClaim({ oid: oid0, approver: user?.username ?? '' }));
        let handed = false;
        try {
        {
          setProgress(tr('Саналыг уншиж байна…'));
          const p = await loadPayload(pending.oid);
          if (!p) {
            setErr(tr('Илгээлтийн агуулга уншигдсангүй — батлах боломжгүй.'));
            return;
          }
          setProgress(tr('Хуудсыг дахин уншиж байна…'));
          const srv = await refetchServer(undefined, { strict: true, needOb: payHasOb(p) });
          const ap = applyPayloadToDraft(p, srv.rows, true, srv.plan, srv.res);
          if (!ap.ok) {
            setErr(ap.why === 'conflict'
              ? conflictMsg(ap.conflicts)
              : ap.why === 'unknown'
                ? unknownMsg(ap.unknown)
                : p.kind === 'geree'
                  ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд батална уу.')
                  : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд батална уу.'));
            return;
          }
        }
        setApproving(pending.oid);
        handed = true;
        setFlowBox(null); setFlowTxt('');
        return;
        } finally {
          if (!handed) void release();
        }
      }
      if (partialRef.current === pending.oid) {
        setErr(partialMsg(''));
        return;
      }
      const r = await decidePlan({
        oid: pending.oid, approve: false,
        approver: user?.username ?? '', author: pending.author, reason,
        okRows: okList,
      });
      if (!r.ok) {
        setErr(r.error ? userError(r.error) : tr('Шийдвэр хадгалагдсангүй.'));
        await refreshFlow({ noRefetch: true }).catch(() => { /* мэдэгдэл дээр */ });
        return;
      }
      setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
      setADraft(new Map()); setResDraft(new Map());
      setPreviewing(false);
      setOkRows(new Set());
      setFlowBox(null); setFlowTxt('');
      setNote(tr('Хуваарь буцаагдлаа — гүйцэтгэгч засаад дахин илгээнэ.') + (r.warn ? ` ${r.warn}` : ''));
      await refreshFlow({ noRefetch: true });
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }, [pending, busy, pkg, kind, user, canApprove, applyPayloadToDraft, refetchServer, refreshFlow, reviewOids, okRows, previewing, obOut, obOutMsg, setProgress, setBusy, setErrList, frameOld]);

  /**
   * БАТЛАХЫГ ГҮЙЦЭЭХ — агуулга ноорогт буусны ДАРААХ зурагдалт.
   */
  /* (`savedRef` — дээр, эрт зарлагдсан) */
  const headApproved = (oid: number): Promise<boolean> => isApprovedBy(oid, user?.username ?? '');
  const stepOf = (o: number): { step: 'dates' | 'obyem'; written?: number; total?: number } | undefined => {
    const f = failStepRef.current;
    return f && f.oid === o ? { step: f.step, written: f.written, total: f.total } : undefined;
  };
  useEffect(() => {
    if (approving == null || busy) return;
    if (!savedRef.current) {
      if (reviewOids.some((o) => !okRows.has(o))) {
        if (partialRef.current !== approving) void releasePlanClaim({ oid: approving, approver: user?.username ?? '' });
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setApproving(null);
        setPreviewing(true);
        setErr(review
          ? tr('Санал хооронд нь дахин буулгахад өөрчлөгдсөн мөр нэмэгдсэн — шинэ улаан мөрүүдийг шалгаж ногоон болгоод дахин батална уу.')
          : tr('Өөрчлөгдсөн мөр бүрийг ногоон болгосны дараа батална.'));
        return;
      }
      if (obOut.bad > 0) {
        if (partialRef.current !== approving) void releasePlanClaim({ oid: approving, approver: user?.username ?? '' });
        setApproving(null);
        setPreviewing(true);
        setErr(obOutMsg);
        return;
      }
      /*
       * Урьд нь энд ЗҮГЭЭР Л ГАРДАГ байсан: `save` дуудагдахгүй, `decidePlan`
       * ч дуудагдахгүй, ямар ч мессеж гарахгүй — батлагч товч дарсан атлаа
       * ЮУ Ч болоогүй мэт харагдаж, илгээлт МӨНХӨД «хүлээгдэж буй» хэвээр
       * үлдэнэ. Тэр багцын хуваарь бүхэлдээ түгжигдэнэ (`locked`).
       *
       * Ноорог хоосон байх нь ХҮЧИНТЭЙ тохиолдол: илгээснээс хойш эх хуваарь
       * өөр замаар (өөр батлагдсан илгээлт) ижил утгад хүрсэн бол ялгаа
       * үлдэхгүй. Бичих зүйл байхгүй ч ШИЙДВЭР нь бүртгэгдэх ёстой.
       */
      if (!dirtyN) {
        setApproving(null);
        setBusy(true);
        void (async () => {
          let answered = false;
          setProgress(tr('Төлөв шинэчилж байна…'));
          try {
            const r0 = await decidePlan({
              oid: approving, approve: true,
              approver: user?.username ?? '', author: pending?.author ?? '',
              claimAt: claimAtRef.current ?? undefined,
            });
            answered = true;
            const r = r0.ok || !(await headApproved(approving)) ? r0 : { ok: true as const };
            if (r.ok) {
              setPreviewing(false); setOkRows(new Set());
              if (partialRef.current === approving) partialRef.current = null;
              if (wroteSomeRef.current === approving) wroteSomeRef.current = null;
              if (lostWriteRef.current === approving) lostWriteRef.current = null;
            }
            setNote(r.ok
              ? tr('Хуваарь батлагдлаа — эх хуудас аль хэдийн ижил байсан тул өөрчлөлт бичигдсэнгүй.')
              : '');
            if (!r.ok) {
              setErr(r.error ? userError(r.error) : tr('Шийдвэр хадгалагдсангүй.'));
              if (partialRef.current !== approving) void releasePlanClaim({ oid: approving, approver: user?.username ?? '' });
            }
            await refreshFlow({ noRefetch: true });
          } catch (e) {
            if (!answered && partialRef.current !== approving) void releasePlanClaim({ oid: approving, approver: user?.username ?? '' });
            setErr(partialRef.current === approving ? partialMsg(userError(e)) : userError(e));
            await refreshFlow({ noRefetch: true }).catch(() => {});
          } finally {
            setBusy(false);
            setProgress('');
          }
        })();
        return;
      }
      savedRef.current = true;
      const claimOid = approving;
      void save().then((ok) => {
        if (ok || !savedRef.current) return;
        savedRef.current = false;
        const partial = partialRef.current === claimOid;
        if (!partial) void releasePlanClaim({ oid: claimOid, approver: user?.username ?? '' });
        setApproving(null);
        setPreviewing(true);
        const lostW = lostWriteRef.current === claimOid;
        const fm = frameMovedRef.current === claimOid;
        const st0 = stepOf(claimOid);
        setErr((cur) => (partial ? (fm ? cur : lostW ? lostWriteMsg(cur) : partialMsg(cur, st0)) : cur || tr('Хуваарь эх хуудсанд бичигдсэнгүй — илгээлт хүлээгдэж буй хэвээр.')));
      });
      return;
    }
    savedRef.current = false;
    const oid = approving;
    setApproving(null);
    if (dirtyN) {
      setPreviewing(true);
      const partial = partialRef.current === oid;
      if (!partial) void releasePlanClaim({ oid, approver: user?.username ?? '' });
      const lostW = lostWriteRef.current === oid;
      const fm = frameMovedRef.current === oid;
      const st1 = stepOf(oid);
      setErr((cur) => (partial ? (fm ? cur : lostW ? lostWriteMsg(cur) : partialMsg(cur, st1)) : cur || tr('Хуваарь эх хуудсанд бичигдсэнгүй — илгээлт хүлээгдэж буй хэвээр.')));
      return;
    }
    setBusy(true);
    void (async () => {
      let decided = false;
      setProgress(tr('Төлөв шинэчилж байна (3/3)…'));
      try {
        const r0 = await decidePlan({
          oid, approve: true,
          approver: user?.username ?? '', author: pending?.author ?? '',
          claimAt: claimAtRef.current ?? undefined,
        });
        const r = r0.ok || !(await headApproved(oid)) ? r0 : { ok: true as const };
        decided = r.ok;
        if (!r.ok) {
          setErr((r.error ? userError(r.error) : tr('Хуваарь бичигдсэн ч төлөв шинэчлэгдсэнгүй — дахин оролдоно уу.'))
            + ` ${tr('Хуваарь эх хуудсанд бичигдсэн тул буцаах боломжгүй — «Батлах»-ыг дахин дарж дуусгана уу.')}`);
        } else {
          if (partialRef.current === oid) partialRef.current = null;
          if (wroteSomeRef.current === oid) wroteSomeRef.current = null;
          if (lostWriteRef.current === oid) lostWriteRef.current = null;
          setPreviewing(false);
          setOkRows(new Set());
          setNote(tr('Хуваарь батлагдаж эх хуудсанд бичигдлээ.'));
        }
        await refreshFlow({ noRefetch: true });
      } catch (e) {
        setErr(decided
          ? userError(e)
          : partialRef.current === oid
            ? partialMsg(userError(e))
            : `${userError(e)} ${tr('Хуваарь эх хуудсанд бичигдсэн тул буцаах боломжгүй — «Батлах»-ыг дахин дарж дуусгана уу.')}`);
        await refreshFlow({ noRefetch: true }).catch(() => {});
      } finally {
        setBusy(false);
        setProgress('');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approving, busy, dirtyN]);

  /* ══════════════════ ХЯНАЛТЫН ГОРИМ (`review`, 2026-09-25) ══════════════════ */
  /**
   * НЭЭГДЭНГҮҮТ САНАЛЫГ ХУАНЛИ ДЭЭР БУУЛГАНА — `preview`-ийн ЯГ ижил замаар
   * (сервер → тулгах → зөрвөл зогсох).
   */
  const reviewStarted = useRef(false);
  /** Эхлэлийн эффект «аль хэдийн шийдвэрлэгдсэн» алдаа тавьсан (#5) — `onDone`-ийг алгасна */
  const reviewStartErr = useRef(false);
  const [reviewRetry, setReviewRetry] = useState(false);
  useEffect(() => {
    if (!review || reviewStarted.current) return;
    if (pkg.key !== review.pkgKey || flowReady === null || busy || !sc || !rows.length || obState === 'loading') return;
    reviewStarted.current = true;
    if (flowReady === false) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErr(flowWhy || tr('Батлах урсгал уншигдсангүй — сүлжээгээ шалгана уу.'));
      setReviewRetry(true);
      return;
    }
    if (pending?.oid !== review.oid) {
      reviewStartErr.current = true;
      setErr(tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'));
      return;
    }
    void preview().then((ok) => { if (!ok) setReviewRetry(true); });
  }, [review, pkg.key, flowReady, flowWhy, busy, sc, rows.length, obState, pending, preview]);
  const retryReview = () => {
    reviewStarted.current = false;
    setReviewRetry(false);
    setErr('');
    void refreshFlow();
  };
  /** Хяналтын ИЛГЭЭЛТ ЯГ ЭНЭ ҮҮ — өөр/шинэ илгээлт дээр шийдвэр гаргуулахгүй */
  const reviewLive = !!review && pending?.oid === review.oid && previewing;
  const reviewConflict = !!review && pending?.oid === review.oid && !previewing && previewBad === review.oid;

  /**
   * ШИЙДВЭР ХАДГАЛАГДСАН — дараалал руу буцна.
   */
  const noteRef = useLatest<{ msg: string; isErr: boolean }>(err
    ? { msg: err, isErr: true }
    : errList.length
      ? { msg: [note, ...errList.map((x) => x.msg)].filter(Boolean).join(' · '), isErr: true }
      : { msg: note, isErr: false });
  const reviewDoneRef = useLatest(review?.onDone);
  const reviewOid = review?.oid;
  useEffect(() => {
    if (reviewOid == null || !lastDecision || lastDecision.oid !== reviewOid) return;
    if (lastDecision.status === PLAN_STATUS.pending) return;
    if (reviewStartErr.current) return;
    reviewDoneRef.current?.(noteRef.current);
  }, [reviewOid, lastDecision, noteRef, reviewDoneRef]);

  /**
   * БУЦААХ (хяналтын горим) — зөвшөөрөөгүй мөрүүдийг шалтгаанд ЖАГСААНА
   * (`Guitsetgel.badText`-ийн загвар), зөвшөөрсөнийг `okRows`-оор хадгална.
   */
  const rejectReview = (txt: string) => {
    if (!txt.trim()) { setErr(tr('Буцаах шалтгааныг бичнэ үү.')); return; }
    const byOid = new Map(plan.map((r) => [r.oid, r]));
    const bad = !reviewLive ? [] : reviewOids.filter((o) => !okRows.has(o))
      .map((o) => byOid.get(o)).filter((r): r is PlanRow => !!r);
    const list = bad.slice(0, 12).map((r) => `${r.no} ${fixCyr(r.work)}`.trim()).join('; ')
      + (bad.length > 12 ? ` … (+${bad.length - 12})` : '');
    const why = bad.length
      ? `${txt.trim()}\nЗөвшөөрөгдөөгүй ${String(bad.length)} мөр: ${list}`
      : txt.trim();
    void decide(false, why.slice(0, 2000), reviewLive ? reviewOids.filter((o) => okRows.has(o)) : undefined);
  };
  /**
   * ДАРААГИЙН ЗӨВШӨӨРӨӨГҮЙ МӨР (2026-09-25 аудит, UX): ~1,400 мөрийн виртуал
   * жагсаалтад улаан мөрийг гүйлгэж хайх шаардлагагүй — сонгоод гүйлгэнэ.
   */
  const scrollToOid = useRef<{ oid: number; blk: number } | null>(null);
  /** Мөрийн тэмдэг: хяналтад — батлагчийн сонголт; гүйцэтгэгчид — буцаасан шийдвэр */
  const reviewSet = useMemo(() => new Set(reviewOids), [reviewOids]);
  /** Буцаасан тэмдэг ИДЭВХТЭЙ юу — яг тэр шийдвэр сүүлийнх, ноорог байгаа */
  const backOn = !review && !!backMarks && dirtyN > 0 && lastDecision?.oid === backMarks.oid;
  const backMarkMap = useMemo(
    () => backMarkMapOf({ backOn, backMarks, rows, plan, byCode, reviewSet, n, obDraft, obPlan, obResDraft, obRes }),
    [backOn, backMarks, rows, plan, byCode, reviewSet, n, obDraft, obPlan, obResDraft, obRes],
  );
  const marking = !!review || (previewing && pending != null && canApprove && !isOwnSubmission);
  /**
   * «БҮХ БЛОК»-ийн ДЭД МӨР ДЭЭР ДАРАХ (2026-10-04): тэр блок идэвхжиж горим унтарна —
   * хэрэглэгч шууд засах боломжтой. Мөр сонгогдож, доорх эффект түүн рүү гүйлгэнэ
   * (энгийн горимын индексээр, блокийн зурвасын эхлэл рүү).
   */
  const pickBlk = (oid: number, b: number) => {
    setBlk(b);
    setAllBlk(false);
    allBackRef.current = true;
    setSel(oid);
    scrollToOid.current = { oid, blk: b };
  };
  /**
   * МӨР РҮҮ ОЧИХ (2026-10-08) — алдааны «→ ажил руу» · өөрчлөлтийн самбар · «Үсрэх» оролт нэг зам.
   */
  const goToRow = useCallback((oid: number, b: number = blk) => {
    const at = plan.findIndex((r) => r.oid === oid);
    if (at < 0) return;
    const r = plan[at];
    if (b !== blk) setBlk(b);
    if (!visible.some((v) => v.oid === oid)) {
      const anc: number[] = [];
      let d = r.depth;
      for (let k = at - 1; k >= 0 && d > 0; k -= 1) {
        if (plan[k].group && plan[k].depth < d) { anc.push(plan[k].oid); d = plan[k].depth; }
      }
      if (anc.some((o) => collapsed.has(o))) {
        setLvl(0);
        setCollapsed((s) => { const m = new Set(s); for (const o of anc) m.delete(o); return m; });
      }
      const inScoped = fGrp === 'all' || scoped.some((x) => x.oid === oid);
      if (!inScoped || !match(r)) {
        setFilter('all'); setFYear('all'); setFGrp('all'); setChips(new Set());
        setNote(tr('Шүүлт цэвэрлэгдэв — мөр шүүлтэд нуугдсан байв.'));
      }
    }
    setSel(oid);
    scrollToOid.current = { oid, blk: b };
  }, [plan, blk, visible, collapsed, fGrp, scoped, match, setNote, setLvl, setCollapsed, setFilter, setFYear, setFGrp, setChips, setSel]);
  const jumpNextBad = () => {
    const bad0 = marking ? reviewOids.filter((o) => !okRows.has(o))
      : backOn ? [...backMarkMap].filter(([, v]) => v === 'bad').map(([o]) => o) : [];
    const idxs = bad0
      .map((o) => plan.findIndex((r) => r.oid === o)).filter((i) => i >= 0).sort((a, b) => a - b);
    if (!idxs.length) return;
    const cur = sel != null ? plan.findIndex((r) => r.oid === sel) : -1;
    const i = idxs.find((x) => x > cur) ?? idxs[0];
    const r = plan[i];
    const b0 = base[i];
    const bch = r.spans.findIndex((sp, b) => !sameSpan(sp, b0?.spans[b]));
    goToRow(r.oid, bch >= 0 ? bch : blk);
  };
  /* Хяналт нээгдмэгц ЭХНИЙ өөрчлөлт рүү гүйлгэнэ — эхний гүйлгэлт «өнөөдөр» рүү
     явдаг тул өөрчлөгдсөн зурвас дэлгэцээс гадуур үлдэж, «юу өөрчлөгдсөн бэ» гэж
     хайлгадаг байв (хөтчийн туршилт, 2026-09-25). */
  const reviewJumped = useRef(false);
  useEffect(() => {
    if (!review || !previewing || !reviewOids.length || reviewJumped.current) return;
    reviewJumped.current = true;
    jumpNextBad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, previewing, reviewOids.length]);
  useEffect(() => {
    const o = scrollToOid.current;
    const el = scrollRef.current;
    if (o == null || !el) return;
    if (o.blk !== blk) return;
    const k = disp.findIndex((v) => v.oid === o.oid && v.b < 0);
    if (k < 0) return;
    scrollToOid.current = null;
    el.scrollTop = Math.max(0, (k - 3) * PL_ROW);
    const sp = disp[k].r.spans[o.blk];
    if (sp) el.scrollLeft = Math.max(0, xOf(sp.start) - 240);
  }, [disp, sel, blk, xOf, scrollRef]);
  /** Мөрийн зөвшөөрлийг сэлгэнэ — зөвхөн өөрчлөгдсөн ажлын мөрд */
  const toggleOk = (oid: number) => {
    if (busy || approving != null) return;
    setOkRows((s0) => {
      const m = new Set(s0);
      if (m.has(oid)) m.delete(oid); else m.add(oid);
      return m;
    });
  };

  const backRef = useLatest(backMarks);
  useEffect(() => {
    const d = lastDecision;
    if (review || !d || d.status !== PLAN_STATUS.returned || !d.okRows) return undefined;
    const cur = backRef.current;
    if (cur && cur.oid === d.oid && cur.pay.kind === kind) return undefined;
    let dead = false;
    const ok = new Set(d.okRows);
    void loadPayload(d.oid).then((p) => {
      if (dead || !p || p.kind !== kind) return;
      setBackMarks({ oid: d.oid, ok, pay: p });
    }).catch(() => { /* тэмдэглэгээ нэмэлт — уншигдахгүй бол тэмдэггүй */ });
    return () => { dead = true; };
  }, [review, lastDecision, kind, backRef]);
  const markOf = (r: PlanRow): 'ok' | 'bad' | undefined => {
    if (!reviewSet.has(r.oid)) return undefined;
    if (marking) return okRows.has(r.oid) ? 'ok' : 'bad';
    if (backOn) return backMarkMap.get(r.oid);
    return undefined;
  };

  /* ══════════ 2026-10-08: ҮСРЭЛТ · ГАРААР ШИЛЖИХ · ӨӨРЧЛӨЛТИЙН ЖАГСААЛТ · БҮЛГИЙН ЗӨВШӨӨРӨЛ ══════════ */
  /**
   * НҮДНЭЭС ЗЭРГЭЛДЭЭ МӨР РҮҮ (2026-10-08, `TaskRow.onNextRow`): Enter/↓/↑ → харагдаж буй дараагийн/өмнөх
   * ЭХ мөрийн ижил нүд (`[data-oid] [data-col]`). Цонхлолтоос гадуур бол гүйлгээд, мөр зурагдмагц
   * (`slice` эффект) фокуслана. Нүд байхгүй (бүлэг · эрхгүй) бол фокус хөдлөхгүй, сонголт л шилжинэ.
   */
  const focusReq = useRef<{ oid: number; col: string; at: number } | null>(null);
  const tryFocus = useCallback(() => {
    const f = focusReq.current;
    if (!f) return;
    if (Date.now() - f.at > 2000) { focusReq.current = null; return; }
    if (document.querySelector('[aria-modal="true"]')) { focusReq.current = null; return; }
    const el = document.querySelector<HTMLElement>(`[data-oid="${f.oid}"] [data-col="${f.col}"]`);
    if (el) { focusReq.current = null; el.focus(); }
  }, []);
  useEffect(() => { tryFocus(); }, [slice, tryFocus]);
  const nextRow = useCallback((oid: number, col: 'start' | 'end' | 'days' | 'ham', dir: 1 | -1) => {
    const k0 = disp.findIndex((d) => d.oid === oid && d.b < 0);
    if (k0 < 0) return;
    const hasCell = (r: PlanRow) => (col === 'ham' ? r.oid >= 0
      : !r.group && r.oid >= 0 && (col !== 'days' || !!r.spans[blk]));
    let k = k0 + dir;
    while (k >= 0 && k < disp.length && (disp[k].b >= 0 || !hasCell(disp[k].r))) k += dir;
    if (k < 0 || k >= disp.length) return;
    const t = disp[k];
    setSel(t.oid);
    const el = scrollRef.current;
    if (el) {
      /* Мөр 0 нь `PL_ROW`-оос эхэлнэ (наалдмал толгой урсгалд) — `recalcWin` */
      const y = (k + 1) * PL_ROW;
      if (y < el.scrollTop + PL_ROW) el.scrollTop = Math.max(0, y - PL_ROW);
      else if (y + PL_ROW > el.scrollTop + el.clientHeight) el.scrollTop = y + PL_ROW - el.clientHeight;
    }
    focusReq.current = { oid: t.oid, col, at: Date.now() };
    requestAnimationFrame(tryFocus);
  }, [disp, scrollRef, tryFocus, blk, setSel]);
  /**
   * ӨӨРЧЛӨЛТИЙН ЖАГСААЛТ (2026-10-08) — мөр · өөрчлөгдсөн блок · хуучин→шинэ (идэвхтэй эсвэл эхний
   * өөрчлөгдсөн блок) · шилжилт/үргэлжлэх зөрүү · уялдаа/обьём/нөөц/бодит тэмдэг. Хяналтад `reviewOids`,
   * зохиогчид `dirtyOids`. Суурь нь `base` (сервер) — хяналтад санал = ноорог тул «санал vs сервер».
   */
  const changesOf = useCallback((oids: Iterable<number>): Chg[] => {
    const idx = new Map(plan.map((r, i) => [r.oid, i]));
    const out: Chg[] = [];
    for (const oid of oids) {
      const i = idx.get(oid);
      if (i == null) continue;
      const r = plan[i];
      const b0r = base[i];
      const blks: number[] = [];
      r.spans.forEach((sp, b) => { if (!sameSpan(sp, b0r?.spans[b] ?? null)) blks.push(b); });
      const bAt = blks.includes(blk) ? blk : (blks[0] ?? blk);
      const old = b0r?.spans[bAt] ?? null;
      const next = r.spans[bAt] ?? null;
      const flags: string[] = [];
      const cut = (s: string) => (s.length > 90 ? `${s.slice(0, 87)}…` : s);
      const nn = (v: number | null | undefined) => (v == null ? '—' : num(v));
      const dd = (v: number | null | undefined) => (v == null ? '—' : msToDay(v));
      const multi = (sc?.bld.length ?? 0) > 1;
      const hm = ham.get(oid);
      if (hm !== undefined && formatDeps(parseDeps(hm)) !== formatDeps(b0r?.deps ?? [])) {
        flags.push(cut(`${tr('уялдаа')}: ${formatDeps(b0r?.deps ?? []) || '—'} → ${formatDeps(parseDeps(hm)) || '—'}`));
      }
      if (r.des != null && sc) {
        for (const blok of sc.bld) {
          const key = obKey(r.des, blok);
          const d = obDraft.get(key);
          const srv = obPlan.get(r.des)?.get(blok);
          if (d && !sameMonths(d, srv)) {
            const ms = [...new Set([...(srv?.keys() ?? []), ...d.keys()])].sort()
              .filter((m) => (srv?.get(m) ?? null) !== (d.get(m) ?? null))
              .map((m) => `${m} ${nn(srv?.get(m))}→${nn(d.get(m))}`);
            flags.push(cut(`${tr('сарын обьём')}${multi ? ` ${blok}` : ''}: ${ms.join(', ')}`));
          }
          const dr = obResDraft.get(key);
          const srvR = obRes.get(r.des)?.get(blok);
          if (dr && !sameRes(dr, srvR)) {
            const ms = [...new Set([...(srvR?.keys() ?? []), ...dr.keys()])].sort()
              .filter((m) => (srvR?.get(m)?.hun ?? null) !== (dr.get(m)?.hun ?? null) || (srvR?.get(m)?.mashin ?? null) !== (dr.get(m)?.mashin ?? null))
              .map((m) => `${m} ${nn(srvR?.get(m)?.hun)}/${nn(srvR?.get(m)?.mashin)}→${nn(dr.get(m)?.hun)}/${nn(dr.get(m)?.mashin)}`);
            flags.push(cut(`${tr('сарын нөөц (хүн/машин)')}${multi ? ` ${blok}` : ''}: ${ms.join(', ')}`));
          }
        }
      }
      const ad = aDraft.get(oid);
      if (ad) {
        const parts: string[] = [];
        for (let b = 0; b < Math.max(ad.start.length, ad.end.length); b += 1) {
          const s0 = b0r?.aStart?.[b] ?? null;
          const e0 = b0r?.aEnd?.[b] ?? null;
          const s1 = ad.start[b] ?? null;
          const e1 = ad.end[b] ?? null;
          if (s0 === s1 && e0 === e1) continue;
          parts.push(`${multi ? `${sc?.bld[b] ?? String(b + 1)} ` : ''}${dd(s0)}–${dd(e0)} → ${dd(s1)}–${dd(e1)}`);
        }
        flags.push(cut(`${tr('бодит огноо')}${parts.length ? `: ${parts.join(', ')}` : ''}`));
      }
      const rd = resDraft.get(oid);
      if (rd) {
        flags.push(`${tr('нөөц (хүн/машин)')}: ${nn(b0r?.hun)}/${nn(b0r?.mashin)} → ${nn(rd.hun)}/${nn(rd.mashin)}`);
      }
      out.push({
        oid, no: r.no, work: r.work, group: r.group, blks, b0: bAt, old, next,
        shift: old && next ? Math.round((next.start - old.start) / DAY) : null,
        dur: old && next ? spanDays(next) - spanDays(old) : null,
        flags,
      });
    }
    return out;
  }, [plan, base, blk, ham, sc, obDraft, obPlan, obResDraft, obRes, aDraft, resDraft]);
  /** Хяналтад мөр бүрийн өөрчлөгдсөн блокууд (`TaskRow.changedBlks` чип) */
  const reviewBlks = useMemo(() => {
    const m = new Map<number, number[]>();
    if (!marking) return m;
    const idx = new Map(plan.map((r, i) => [r.oid, i]));
    for (const oid of reviewOids) {
      const i = idx.get(oid);
      if (i == null) continue;
      const blks: number[] = [];
      plan[i].spans.forEach((sp, b) => { if (!sameSpan(sp, base[i]?.spans[b] ?? null)) blks.push(b); });
      m.set(oid, blks);
    }
    return m;
  }, [marking, plan, base, reviewOids]);
  /* Самбар · илгээхийн хураангуй нээлттэй үед л бодно */
  const changes = useMemo(
    () => (chgOpen || flowBox === 'send' ? changesOf(marking ? reviewOids : [...dirtyOids]) : []),
    [chgOpen, flowBox, changesOf, marking, reviewOids, dirtyOids],
  );
  /** Өөрчлөлтийн нэг мөрийн товч бичвэр */
  const chgText = (c: Chg): string => {
    const parts: string[] = [];
    if (c.blks.length && sc) parts.push(c.blks.map((b) => sc.bld[b] ?? String(b + 1)).join(', '));
    const sp = (s: Span | null) => (s ? `${msToDay(s.start)}–${msToDay(s.end)}` : '—');
    if (c.blks.length) parts.push(`${sp(c.old)} → ${sp(c.next)}`);
    if (c.shift != null && c.shift !== 0) parts.push(`Δ${c.shift > 0 ? '+' : ''}${c.shift}${tr('х')}`);
    if (c.dur != null && c.dur !== 0) parts.push(tr('үргэлжлэх {0}', `${c.dur > 0 ? '+' : ''}${c.dur}${tr('х')}`));
    parts.push(...c.flags);
    return parts.join(' · ');
  };
  /**
   * БҮЛГИЙН ДОТОРХ ӨӨРЧЛӨГДСӨН НАВЧ МӨРҮҮД (2026-10-08, хяналт) — бүлгийн ✕/✓ дээр дарахад «энэ бүлгийн
   * N мөрийг зөвшөөрөх үү?» гэж асууж бөөнөөр ногоон болгоно.
   */
  const grpLeaf = useMemo(() => {
    const m = new Map<number, number[]>();
    if (!marking) return m;
    const stack: { depth: number; oid: number }[] = [];
    for (const r of plan) {
      while (stack.length && stack[stack.length - 1].depth >= r.depth) stack.pop();
      if (r.group) { stack.push({ depth: r.depth, oid: r.oid }); continue; }
      if (!reviewSet.has(r.oid)) continue;
      for (const g of stack) {
        let a = m.get(g.oid);
        if (!a) { a = []; m.set(g.oid, a); }
        a.push(r.oid);
      }
    }
    return m;
  }, [marking, plan, reviewSet]);
  const grpMark = (oid: number): 'ok' | 'bad' | undefined => {
    const leaves = grpLeaf.get(oid);
    if (!leaves?.length) return undefined;
    return leaves.every((o) => okRows.has(o)) ? 'ok' : 'bad';
  };
  const markGroup = async (r: PlanRow) => {
    if (busy || approving != null) return;
    const leaves = grpLeaf.get(r.oid) ?? [];
    const self = reviewSet.has(r.oid);
    if (!leaves.length) { if (self) toggleOk(r.oid); return; }
    const pend = leaves.filter((o) => !okRows.has(o));
    const selfPend = self && !okRows.has(r.oid);
    if (pend.length || selfPend) {
      const n2 = pend.length + (selfPend ? 1 : 0);
      if (!(await askConfirm(tr('«{0}» бүлгийн {1} мөрийг зөвшөөрөх үү?', workName(r), num(n2)), { ok: tr('Зөвшөөрөх') }))) return;
      setOkRows((s0) => { const m = new Set(s0); for (const o of pend) m.add(o); if (self) m.add(r.oid); return m; });
      return;
    }
    const n3 = leaves.length + (self ? 1 : 0);
    if (!(await askConfirm(tr('«{0}» бүлгийн {1} мөрийн зөвшөөрлийг болих уу?', workName(r), num(n3)), { ok: tr('Зөвшөөрлийг болих') }))) return;
    setOkRows((s0) => { const m = new Set(s0); for (const o of leaves) m.delete(o); if (self) m.delete(r.oid); return m; });
  };
  /**
   * НӨГӨӨ ТАБЫН огнооны нүд дээр дарахад табаа солино (2026-10-08, `TaskRow.onOtherTab`).
   */
  const otherTab = () => {
    const other: PlanKind = kind === 'plan' ? 'geree' : 'plan';
    const lab = other === 'geree' ? tr('Гэрээ') : tr('Төлөвлөгөө');
    runSwitch(() => { setKind(other); setNote(tr('«{0}» таб руу шилжлээ — огноог эндээс засна.', lab)); });
  };
  /**
   * ХУРДАН ТОВЧЛУУР (2026-10-08): Ctrl/⌘+Z — сүүлийн өөрчлөлт буцаах; хяналтад `]` — дараагийн ✕,
   * Space — сонгосон мөрийг ✓/✕. Оролт · товч · дэд цонх нээлттэй үед ажиллахгүй.
   */
  const keysRef = useLatest({ next: jumpNextBad, sel, marking, backOn, reviewSet, toggle: toggleOk });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || keyIgnored(e.target) || document.querySelector('[aria-modal="true"]')) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoLastRef.current();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey
        && ((!e.shiftKey && e.key.toLowerCase() === 'y') || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redoLastRef.current();
        return;
      }
      const k = keysRef.current;
      if (!(k.marking || k.backOn) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ']') { e.preventDefault(); k.next(); return; }
      if (!k.marking) return;
      if (e.key === ' ' && !(e.target instanceof HTMLElement && e.target.closest('button, a, [role="button"]'))) {
        if (k.sel != null && k.reviewSet.has(k.sel)) { e.preventDefault(); k.toggle(k.sel); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keysRef, undoLastRef, redoLastRef]);

  const hasOkMarks = okRows.size > 0;
  useEffect(() => {
    setNavDirty('huvaari', (hdUnsynced && !previewing) || hasOkMarks, tr('Хуваарь'));
    return () => setNavDirty('huvaari', false);
  }, [hdUnsynced, previewing, hasOkMarks]);
  const [navId] = useState(() => Symbol('huvaari'));
  const chainBusy = approving != null || busy;
  useEffect(() => {
    if (!chainBusy) return undefined;
    setPlanNavBusy(navId, true);
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => {
      setPlanNavBusy(navId, false);
      window.removeEventListener('beforeunload', warn);
    };
  }, [chainBusy, navId]);

  const floors = pkgFloors(pkg.group);

  const effRow = useMemo(() => {
    const grp = lazyCache((r: PlanRow): PlanRow => {
      const spans = r.spans.map((_, b) => effSpan(plan, r.i, b));
      return { ...r, spans, ...aggExtra(plan, r.i, n) };
    });
    return (r: PlanRow): PlanRow => (r.group ? grp(r) : r);
  }, [plan, n]);

  /**
   * PDF ТАТАХ — дэлгэц дээрх хуваарийг ЯГ ЭНЭ загвараар (2026-09-30, хэрэглэгч).
   */
  const [pdfBusy, setPdfBusy] = useState(false);
  /**
   * ТАТАХЫН ӨМНӨХ СОНГОЛТ (2026-09-30) — хугацааны цонх · зөвхөн идэвхтэй · цаас.
   */
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfOpts, setPdfOpts] = useState<HvPdfOpts>(HV_PDF_DEFAULT);
  const pdfRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!pdfOpen) return;
    const down = (e: MouseEvent) => {
      if (!pdfRef.current?.contains(e.target as Node)) setPdfOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPdfOpen(false); };
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [pdfOpen]);
  const rowFor = useCallback((r: PlanRow, b: number): HvPdfRow => {
    const x = r.group ? effRow(r) : r;
    const sp = b === blk ? rowSpanAt(r) : blockSpan(plan, r, b);
    const need = sp && r.deps.length && kind === 'plan'
      ? requiredStart(plan, byCode, r.i, b) : null;
    const other = b === blk ? refSpanAt(r.oid) : refSpanOf(r.oid, b);
    return {
      des: r.des,
      no: r.no,
      work: r.work,
      depth: r.depth,
      group: r.group,
      aStart: x.aStart?.[b] ?? null,
      aEnd: x.aEnd?.[b] ?? null,
      bar: sp,
      st: sp ? statusOf(sp, r.act?.[b], now) : 'none',
      viol: !!(sp && need != null && sp.start < need),
      ref: showRef ? other : null,
      act: r.act?.[b] ?? null,
    };
  }, [effRow, blk, rowSpanAt, plan, kind, byCode, refSpanAt, refSpanOf, now, showRef]);

  useEffect(() => setReportSource('huvaari', {
    blocks: () => huvaariBlocks({ rows: visibleAt(blk).map((r) => rowFor(r, blk)), hasActual }),
    filters: () => [
      `${tr('Багц')}: ${pkg.label}`,
      `${tr('Хуваарь')}: ${kind === 'geree' ? tr('Гэрээ') : tr('Төлөвлөгөө')}`,
      n > 1 && sc?.bld[blk] ? `${tr('Блок')}: ${sc.bld[blk]}` : '',
      previewing ? tr('САНАЛ (урьдчилан харалт)') : !savedView && dirtyRows > 0 ? tr('Хадгалаагүй {0} мөр орсон', num(dirtyRows)) : '',
    ].filter(Boolean),
  }), [visibleAt, blk, rowFor, hasActual, pkg, kind, n, sc, previewing, dirtyRows, savedView]);

  const savePdf = useCallback(async () => {
    if (!sc || pdfBusy) return;
    setPdfBusy(true);
    setPdfOpen(false);
    try {
      const out: HvPdfRow[] = visibleAt(blk).map((r) => rowFor(r, blk));
      const allPdf = !!pdfOpts.allBlocks && multiBlk;
      const blocks = allPdf ? sc.bld.map((name, b) => ({ block: name, rows: visibleAt(b).map((r) => rowFor(r, b)) })) : undefined;
      const kindLabel = kind === 'geree' ? tr('Гэрээ') : tr('Төлөвлөгөө');
      await downloadHuvaariPdf({
        pkg: pkg.label,
        kindLabel,
        refLabel: showRef ? (kind === 'geree' ? tr('Төлөвлөгөө') : tr('Гэрээ')) : null,
        block: n > 1 ? (sc.bld[blk] ?? '') : '',
        now,
        rows: out,
        blocks,
        hasActual,
        opts: pdfOpts,
        draftLabel: previewing
          ? tr('САНАЛ (урьдчилан харалт)')
          : !savedView && dirtyRows > 0 ? tr('НООРОГ — батлагдаагүй {0} мөр', num(dirtyRows)) : undefined,
      }, `Huvaari_${pkg.key}_${kind}${allPdf ? '_buhblok' : ''}${pdfOpts.months ? `_${pdfOpts.months}sar` : ''}_${dayKey(Date.now())}.pdf`);
    } catch (e) {
      setErr(tr('PDF үүсгэж чадсангүй: {0}', userError(e)));
    } finally {
      setPdfBusy(false);
    }
  }, [sc, pdfBusy, visibleAt, rowFor, multiBlk, kind, blk, now, showRef,
    pkg, n, hasActual, pdfOpts, setErr, setPdfOpen, previewing, dirtyRows, savedView]);

  /** Холбох цонхны хоёр мөр — OID-оор (2026-09-25); аль нэг нь алга бол цонх гарахгүй */
  const linkRows = useMemo(() => {
    if (!linkAsk) return null;
    const s = plan.find((x) => x.oid === linkAsk.so);
    const t = plan.find((x) => x.oid === linkAsk.to);
    return s && t ? { s, t } : null;
  }, [linkAsk, plan]);
  const modalRow = useMemo(() => {
    if (modal == null) return null;
    const r = plan.find((x) => x.oid === modal);
    return r ? effRow(r) : null;
  }, [modal, plan, effRow]);
  /**
   * ЦОНХНЫ ТЭНЦЭЭГҮЙ БЛОКУУД — блокийн чип улаан (2026-10-01, хэрэглэгч: бүгдийг зас:
   * «асуудалтай блокийг шууд олох»). `util.unbalancedBlocks` — илгээх хаалттай нэг
   * дүрэм (үр дүнтэй задаргаа: ноорог ?? сервер). Гэрээ табд сарын обьём алга.
   */
  const modalBad = useMemo(
    () => new Set(modalRow && sc && kind === 'plan' ? unbalancedBlocks(modalRow, sc.bld, obDraft, obPlan) : []),
    [modalRow, sc, kind, obDraft, obPlan],
  );
  /**
   * Popup-д зориулсан ЭЦЭГ БҮЛЭГ — хамгийн ойрын ДЭЭД бүлгийн мөр.
   */
  const modalPar = (() => {
    if (!modalRow) return null;
    const at = plan.findIndex((x) => x.i === modalRow.i);
    for (let k = at - 1; k >= 0; k--) {
      if (plan[k].depth < modalRow.depth && plan[k].group) return effRow(plan[k]);
    }
    return null;
  })();

  /**
   * УРЬДЧИЛАГЧИЙН НЭР ДЭВШИГЧИД — кодтой бүх мөр, ХАСАХ нь: (1) өөрөө,
   * (2) энэ ажлаас дам хамаардаг бүх ажил — тэднийг сонговол дугуй хамаарал
   * үүснэ. Урьдчилан шүүснээр хэрэглэгч буруу сонголт хийх БОЛОМЖГҮЙ.
   */
  const depCands = useMemo(() => {
    if (!modalRow) return [];
    const blocked = modalRow.des != null
      ? downstreamCodes(plan, modalRow.des)
      : new Set<number>();
    const out: { code: number; label: string }[] = [];
    for (const r of plan) {
      if (r.des == null || blocked.has(r.des) || hierRelated(plan, modalRow.i, r.i)) continue;
      out.push({
        code: r.des,
        label: `${r.des} · ${'· '.repeat(r.depth)}${fixCyr(r.work) || r.no}`,
      });
    }
    return out;
  }, [plan, modalRow]);

  /**
   * «БҮХ БЛОК» ГОРИМЫН ЭГНЭЭ (2026-10-04) — ЗӨВХӨН ХАРАХ.
   */
  const allLane = (d: DispRow, k: number) => {
    const { r, b, sp } = d;
    const sub = b >= 0;
    const who = sub ? (sc?.bld[b] ?? '') : tr('Бүх блок');
    const st: Status = sub && sp && !r.group ? statusOf(sp, r.act?.[b], now) : 'none';
    const cls = r.group ? h.plBarG : sub ? ST_CLASS[st] : h.plBarAll;
    const w = sp ? spanDays(sp) * px : 0;
    return (
      <div key={sub ? `${r.oid}@${b}` : r.oid}
        className={`${h.plLane} ${h.plLaneView} ${sub ? h.plLaneSub : ''} ${k % 2 ? h.plLaneAlt : ''} ${sel === r.oid && (!sub || b === blk) ? h.plLaneOn : ''}`}
        style={{ top: k * PL_ROW, height: PL_ROW }}
        title={sub ? tr('Дарж «{0}» блок руу орж засна', who) : undefined}
        onClick={sub ? () => pickBlk(r.oid, b) : () => setSel(r.oid)}
        role="button"
        tabIndex={0}
        aria-label={sub ? tr('Дарж «{0}» блок руу орж засна', who) : `${workName(r)} · ${who}`}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          if (sub) pickBlk(r.oid, b); else setSel(r.oid);
        }}
      >
        {sp && (
          <div
            className={`${h.plBar} ${sub ? h.plBarSub : ''} ${cls} ${sel === r.oid && (!sub || b === blk) ? h.tlBarOn : ''}`}
            style={{ left: xOf(sp.start), width: Math.max(10, spanDays(sp) * px - 1) }}
            aria-label={`${fixCyr(r.work) || r.no} · ${who} · ${msToDay(sp.start)} → ${msToDay(sp.end)}`}
            title={`${fixCyr(r.work)}
${who} · ${msToDay(sp.start)} → ${msToDay(sp.end)} (${tr('{0} хоног', spanDays(sp))})${sub && !r.group ? ` · ${stText(st)}` : ''}`}
          >
            {w > 250 ? (
              <span className={h.plBarLab}>
                <span className={h.plBarName}>{who}</span>
                <span className={h.plBarWhen}>
                  {msToDay(sp.start)}→{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}
                </span>
              </span>
            ) : w > 178 ? (
              <span className={h.plBarLab}>
                {msToDay(sp.start)}→{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}
              </span>
            ) : w > 118 ? (
              <span className={h.plBarLab}>
                {short(sp.start)}→{short(sp.end)} · {spanDays(sp)}{tr('х')}
              </span>
            ) : w > 40 ? (
              <span className={h.plBarLab}>{spanDays(sp)}{tr('х')}</span>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  const calHead = useMemo(() => (
    <div className={h.plHead}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const el = scrollRef.current; if (!el) return;
        const x0 = e.clientX, s0 = el.scrollLeft;
        const t = e.currentTarget;
        t.setPointerCapture?.(e.pointerId);
        const mv = (ev: PointerEvent) => { el.scrollLeft = s0 - (ev.clientX - x0); };
        const up = () => { t.removeEventListener('pointermove', mv); t.removeEventListener('pointerup', up); t.removeEventListener('pointercancel', up); };
        t.addEventListener('pointermove', mv); t.addEventListener('pointerup', up); t.addEventListener('pointercancel', up);
      }}>
      {months.map((m) => {
        const pc = zoom === 'year' ? null : monLab(m.lab);
        return (
          <span key={m.at} className={h.plMonth} style={{ left: xOf(m.at) }}
            title={pc?.tip}>
            {m.lab}
            {pc && <b className={h.plMonPct}>{pc.txt}</b>}
          </span>
        );
      })}
      {ticks.map((tk) => {
        const pc = zoom === 'year' && tk.lab ? monLab(msToDay(tk.at).slice(0, 7)) : null;
        return (
          <span key={tk.at} className={`${h.plDay} ${tk.big ? h.plDayBig : ''}`}
            style={{ left: xOf(tk.at) }} title={pc?.tip}>
            {tk.lab}
            {pc && <b className={h.plMonPct}>{pc.txt}</b>}
          </span>
        );
      })}
    </div>
  ), [months, ticks, monLab, xOf, scrollRef, zoom]);
  const calGrid = useMemo(() => (
    <>
      {months.map((m) => (
        <span key={m.at} className={`${h.tlGrid} ${h.tlGridBig}`} style={{ left: xOf(m.at) }} />
      ))}
      {zoom !== 'month' && ticks.filter((t2) => !t2.big).map((tk) => (
        <span key={tk.at} className={h.tlGrid} style={{ left: xOf(tk.at) }} />
      ))}
      {now >= from && now <= to && (
        <span className={h.tlNow} style={{ left: xOf(now) }} title={msToDay(now)} />
      )}
    </>
  ), [months, ticks, zoom, xOf, now, from, to]);

  /* ── УЯЛДААНЫ СУМУУД — идэвхтэй блок дээр, харагдаж буй мөрүүдийн хооронд ── */
  const arrows = useMemo(() => {
    const out: { d: string; cls: string; mk: string; key: string; si: number; ti: number; dblk: number | null; x: boolean }[] = [];
  if (kind === 'plan' && !allOn) {
    const ARR_M = 40;
    const lo = winFrom - ARR_M;
    const hi = winTo + ARR_M;
    const inWin = (k: number) => k >= lo && k <= hi;
    const visK = new Map<number, number>();
    visible.forEach((r, k) => visK.set(r.i, k));
    for (let k = 0; k < visible.length; k++) {
      const r = visible[k];
      if (!r.deps.length) continue;
      const ts = effAt(r.i);
      if (!ts) continue;
      const ty = k * PL_ROW + PL_ROW / 2;
      const tx = xOf(ts.start);
      r.deps.forEach((dep, j) => {
        if (dep.blk != null && dep.blk !== blk) return;
        const pi = byCode.get(dep.code);
        if (pi == null || pi === r.i) return;
        const pk = visK.get(pi);
        if (pk == null) return;
        if (!inWin(k) && !inWin(pk)) return;
        const cross = dep.blk != null && dep.src != null && dep.src !== blk;
        const ps = cross ? effSpan(plan, pi, dep.src!) : effAt(pi);
        if (!ps) return;
        const sy = pk * PL_ROW + PL_ROW / 2;
        let d: string;
        if (dep.type === 'FS') {
          /* Урд ажлын БАРУУН захаас гарч хамаарагчийн ЗҮҮН зах руу — ортогональ.
             Хамаарагч нь урд ажлаасаа ЗҮҮНД байвал (зөрчил/сөрөг хоцролт)
             буцах замаар тойруулна, эс бөгөөс сум зурвасын дундуур шургана. */
          const sx = xOf(ps.end + DAY);
          d = tx >= sx + 10
            ? `M ${sx} ${sy} h 6 V ${ty} H ${tx}`
            : `M ${sx} ${sy} h 8 v ${ty > sy ? 12 : -12} H ${tx - 8} V ${ty} H ${tx}`;
        } else {
          /* SS: хоёулангийн ЗҮҮН захыг холбоно */
          const sx = xOf(ps.start);
          d = `M ${sx} ${sy} H ${Math.min(sx, tx) - 8} V ${ty} H ${tx}`;
        }
        const need = dep.type === 'FS' ? ps.end + (1 + dep.lag) * DAY : ps.start + dep.lag * DAY;
        const viol = ts.start < need;
        const hot = sel === r.oid || sel === plan[pi]?.oid;
        const arrKind = viol ? 2 : hot ? 1 : 0;
        out.push({
          d,
          cls: viol ? h.depBad : hot ? h.depHot : h.depLine,
          mk: `url(#hvDepArr${arrKind})`,
          key: `${r.oid}·${j}`,
          si: pi,
          ti: r.i,
          dblk: dep.blk ?? null,
          x: cross,
        });
      });
    }
  }
    return out;
  }, [kind, allOn, visible, effAt, xOf, blk, byCode, plan, sel, winFrom, winTo]);
  const multiTag = multiBlks.length > 1 && canEdit && !locked && !allOn
    ? <span className={h.multiTag} title={tr('Нүдэнд бичсэн огноо сонгосон {0} блокт тавигдана', num(multiBlks.length))}>{tr('→ {0} блок', num(multiBlks.length))}</span>
    : null;

  if (!review && status !== 'off' && groupOpts.length === 0) {
    return (
      <div className={h.frame} data-huvaari-root="">
        <p className={h.note} role="status">
          {huvaariAclReady()
            ? tr('Танд хуваарь харах багц оноогдоогүй байна. Админ «Эрхийн төрөл» → «Хуваарь харах»-аар олгоно.')
            : tr('Эрх уншигдаж байна…')}
        </p>
      </div>
    );
  }

  return (
    <div className={`${h.frame} ${isWide ? h.frameWide : ''}`} data-huvaari-root="">
      {/* ── БҮХ ХЭРЭГСЭЛ НЭГ МӨРӨНД ── */}
      <header className={h.head}>
        <label className={h.field}>
          {tr('Багц')}{' '}
          <select className={h.select} value={pkg.group} disabled={busy || switching || !!review}
            onChange={(e) => { const v = e.target.value; runSwitch(() => setPkg(pkgFloors(v)[0])); }}>
            {groupOpts.map((g) => <option key={g} value={g}>{tr(g)}{!review && newsGroups.has(g) ? ' ●' : ''}</option>)}
          </select>
        </label>
        {viewOnly && (
          <span className={h.roBadge} role="status"
            title={tr('Энэ багцын хуваарийг зөвхөн харна — засах, илгээх, батлах эрх «Хуваарийн эрх»-ээс багцаар оноогдоно.')}>
            {tr('Зөвхөн харах')}
          </span>
        )}
        {floors.length > 1 && (
          <label className={h.field}>
            {tr('Хувилбар')}{' '}
            <select className={h.select} value={pkg.key} disabled={busy || switching || !!review}
              onChange={(e) => {
                const v = e.target.value;
                runSwitch(() => setPkg(PKGS.find((x) => x.key === v) ?? pkg));
              }}>
              {floors.map((p) => <option key={p.key} value={p.key}>{p.floors}F{!review && newsKeys.has(p.key) ? ' ●' : ''}</option>)}
            </select>
          </label>
        )}
        {switching && <span className={h.muted} role="status">{tr('Ноорог хадгалж байна…')}</span>}

        {sc && rows.length > 0 && (
          <>
            <span className={h.tbSep} aria-hidden />

            {/*
              * ТҮВШНИЙ ЗУРВАС — «Гэрээний бүртгэл» хуудасны ЯГ ИЖИЛ загвар
              * (2026-09-15, хэрэглэгчийн шаардлага). Товч нь «энэ түвшин
              * хүртэл дэлгэ» гэсэн утгатай: 1 дарвал зөвхөн дээд бүлгүүд,
              * хамгийн гүн нь дарвал бүх ажлын мөр харагдана.
              */}
            {lvls.length > 1 && (
              <span className={h.lvBar}>
                <span className={h.lvLbl}>{tr('Түвшин')}</span>
                <button
                  type="button"
                  className={lvl === -1 ? h.lvOn : ''}
                  title={tr('Бүгдийг хураах — зөвхөн дээд түвшний бүлгүүд')}
                  aria-label={tr('Бүгдийг хураах — зөвхөн дээд түвшний бүлгүүд')}
                  onClick={() => setLevel(-1)}
                >0</button>
                {lvls.map((d) => {
                  const nn = d + 1;
                  const deepest = d === lvls[lvls.length - 1];
                  return (
                    <button
                      key={d}
                      type="button"
                      className={lvl === nn ? h.lvOn : ''}
                      title={deepest
                        ? tr('Бүх ажлын мөрийг дэлгэнэ')
                        : tr('{0}-р түвшин хүртэл дэлгэх', nn)}
                      aria-label={deepest
                        ? tr('Бүх ажлын мөрийг дэлгэнэ')
                        : tr('{0}-р түвшин хүртэл дэлгэх', nn)}
                      onClick={() => setLevel(nn)}
                    >{nn}</button>
                  );
                })}
              </span>
            )}

            <span className={h.tbSep} aria-hidden />

            <Segmented<typeof filter>
              value={filter}
              onChange={setFilter}
              label={tr('Хуваарийн шүүлт')}
              options={[
                { value: 'all', label: `${tr('Бүгд')} ${num(plan.filter((r) => !r.group).length)}` },
                { value: 'has', label: `${tr('Хуваарьтай')} ${num(cov.planned)}` },
                { value: 'none', label: `${tr('Хуваарьгүй')} ${num(cov.tasks - cov.planned)}` },
                { value: 'partial', label: `${tr('Дутуу')} ${num(cov.partial)}` },
              ]}
            />

            {cov.reversed > 0 && (
              <span role="status" style={{ color: 'var(--bad-ink)', fontWeight: 600, whiteSpace: 'nowrap' }}
                title={tr('Эдгээр мужийг төлөвлөгөөт хувь ба муруйд хуваарьгүй гэж тооцно — огноог засна уу')}>
                ⚠ {tr('{0} ажлын огноо урвуу (дуусах < эхлэх)', num(cov.reversed))}
              </span>
            )}

            <select className={`${h.sel} ${h.selWide}`} value={String(fGrp)} aria-label={tr('Бүлэг')}
              onChange={(e) => setFGrp(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              <option value="all">{tr('Бүлэг: бүгд')}</option>
              {groups.map((g) => <option key={g.oid} value={g.oid}>{g.label}</option>)}
            </select>

            <select className={h.sel} value={fYear} aria-label={tr('Эхлэх жил')}
              onChange={(e) => setFYear(e.target.value)}>
              <option value="all">{tr('Жил: бүгд')}</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>

            {([
              ...((kind === 'plan' && unbalRows.size > 0) || chips.has('unbal') ? [['unbal', tr('Тэнцээгүй'), unbalRows.size] as [Chip, string, number]] : []),
            ] as [Chip, string, number][]).map(([c, label, cnt]) => (
              <button key={c} type="button"
                className={`${h.chipFilter} ${chips.has(c) ? h.chipFilterOn : ''}`}
                aria-pressed={chips.has(c)}
                title={c === 'dirty' ? tr('Зөвхөн илгээгээгүй ноорогтой мөр')
                  : c === 'viol' ? tr('Зөвхөн уялдааны зөрчилтэй мөр (идэвхтэй блок)')
                    : c === 'unbal' ? tr('Зөвхөн сарын обьём нь нийт обьёмтой тэнцээгүй мөр (бүх блок) — илгээхээс өмнө засна')
                      : tr('Зөвхөн хоцорсон мөр (идэвхтэй блок)')}
                onClick={() => setChips((s) => { const m = new Set(s); if (m.has(c)) m.delete(c); else m.add(c); return m; })}>
                {label} <b>{num(cnt)}</b>
              </button>
            ))}

            {stickyN > 0 && (
              <button type="button" className={h.tab}
                title={tr('Засварласан мөрүүд шүүлтэд таарахгүй ч засвар дуустал харагдсаар байна — дарж шүүлтийг дахин хэрэглэнэ')}
                onClick={() => setSticky(new Set())}>
                {tr('Шүүлтийг шинэчлэх ({0})', num(stickyN))}
              </button>
            )}

            <span className={h.tbSep} aria-hidden />

            <label className={h.plField}>
              {tr('Блок')}{' '}
              <select className={h.select} value={blk} onChange={(e) => { setBlk(Number(e.target.value)); if (!isReview) setAllBlk(false); allBackRef.current = false; }}>
                {sc.bld.map((b, k) => (
                  <option key={b} value={k}>{b} · {num(blockFill[k])}</option>
                ))}
              </select>
            </label>
            {/*
              * «БҮХ БЛОК» (2026-10-04) — бүх блокийн хуваарийг ажил бүрийн доор зэрэг харуулна.
              */}
            {multiBlk && !isReview && (
              <button type="button"
                className={`${h.tlZoomB} ${allOn ? h.tlZoomRef : ''}`}
                aria-pressed={allOn}
                title={allOn
                  ? tr('Блок бүрээр харах · засах горим руу буцна.')
                  : tr('Бүх блокийн хуваарийг ажил бүрийн доор зэрэг харуулна (зөвхөн харах).')}
                onClick={() => { allBackRef.current = false; setAllBlk((v) => !v); }}>
                {tr('Бүх блок')}
              </button>
            )}

            {/*
              * ХУВААРИЙН ТӨРӨЛ — «Төлөвлөгөө» / «Гэрээ» (2026-09-11).
              */}
            {!review && !previewing && approving == null && pending == null && (
              <Switch
                checked={!viewSaved}
                onChange={(v) => setViewSaved(!v)}
                off={tr('Батлагдсан')}
                on={tr('Ноорог')}
                title={viewSaved
                  ? tr('Серверт хадгалагдсан (батлагдсан) хуваарь — засвар хаалттай. «Ноорог» руу шилжиж засна.')
                  : tr('Хадгалаагүй засвартай (ноорог) хувилбар. «Батлагдсан» руу шилжиж хадгалсан хуваарийг харна.')}
              />
            )}
            <Switch
              checked={kind === 'geree'}
              onChange={(v) => { const k: PlanKind = v ? 'geree' : 'plan'; if (kind !== k) runSwitch(() => setKind(k)); }}
              off={tr('Төлөвлөгөө')}
              on={tr('Гэрээ')}
              title={kind === 'geree'
                ? tr('Гэрээнд заасан огноог засна.')
                : tr('Ажлын төлөвлөсөн огноог засна.')}
              disabled={busy || switching || !!review}
            />

            {/*
              * ЗЭРЭГ ХАРАХ — нөгөө төрлийн огноог мөр бүрийн ДООД зурвасаар
              * нэмж харуулна (2026-09-11, хэрэглэгч: «тусдаа зэрэг харах гэдэг
              * button нэм»).
              */}
            <Toggle
              checked={showRef}
              onChange={setShowRef}
              label={tr('Зэрэг')}
              title={showRef
                ? tr('Нөгөө огноог нуана.')
                : (kind === 'geree'
                  ? tr('Төлөвлөсөн огноог мөр бүрийн доор нэмж харуулна.')
                  : tr('Гэрээний огноог мөр бүрийн доор нэмж харуулна.'))}
            />


            <Segmented<Zoom>
              value={zoom}
              onChange={setZoom}
              label={tr('Хуанлийн масштаб')}
              options={[
                { value: 'day', label: tr('хоног') },
                { value: 'week', label: tr('7 хоног') },
                { value: 'month', label: tr('сар') },
                { value: 'year', label: tr('жил') },
              ]}
            />
            <HowtoHint />
          </>
        )}

        <span className={h.spacer} />

        {canEdit && !locked && undoSnap && !previewing && (
          <button type="button" className={`${h.discard} ${h.undoBtn}`} disabled={busy}
            title={tr('Сүүлийн өөрчлөлтийг буцаана (Ctrl+Z)')}
            onClick={undoLast}>
            {tr('Буцаах')}
          </button>
        )}
        {canEdit && !locked && redoSnap && !previewing && (
          <button type="button" className={`${h.discard} ${h.undoBtn}`} disabled={busy}
            title={tr('Буцаасан өөрчлөлтийг дахин хийнэ (Ctrl+Y)')}
            onClick={redoLast}>
            {tr('Дахин хийх')}
          </button>
        )}
        {/* PDF ТАТАХ (2026-09-30) — дэлгэц дээрх хуваарийг ижил загвараар (`savePdf`) */}
        {sc && visible.length > 0 && (
          <span className={h.pdfWrap} ref={pdfRef}>
            <button type="button" className={h.discard} disabled={pdfBusy}
              aria-expanded={pdfOpen}
              title={tr('Дэлгэц дээрх хуваарийг (нээлттэй мөр · таб · блок · багана) PDF болгож татна')}
              onClick={() => setPdfOpen((v) => !v)}>
              {pdfBusy ? tr('Бэлтгэж байна…') : tr('PDF татах')}
            </button>
            {pdfOpen && (
              <span className={h.pdfPop} role="dialog" aria-label={tr('PDF татах')}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setPdfOpen(false); } }}>
                {allOn && !pdfOpts.allBlocks && (
                  <span className={h.pdfRow}>{tr('«Бүх блок» горимд ч PDF зөвхөн идэвхтэй блокийг ({0}) агуулна.', sc.bld[blk] ?? '')}</span>
                )}
                {multiBlk && (
                  <label className={h.pdfRow}>
                    <input type="checkbox" checked={!!pdfOpts.allBlocks}
                      onChange={(e) => setPdfOpts((o) => ({ ...o, allBlocks: e.target.checked }))} />
                    <span>{tr('Бүх блок — блок бүр тусдаа хэсгээр')}</span>
                  </label>
                )}
                <label className={h.pdfRow}>
                  <span>{tr('Хугацаа')}</span>
                  <select className={h.select} value={pdfOpts.months}
                    onChange={(e) => setPdfOpts((o) => ({ ...o, months: Number(e.target.value) as HvPdfOpts['months'] }))}>
                    <option value={0}>{tr('Бүх хугацаа')}</option>
                    <option value={1}>{tr('Ирэх 1 сар')}</option>
                    <option value={3}>{tr('Ирэх 3 сар')}</option>
                  </select>
                </label>
                <label className={h.pdfRow}>
                  <input type="checkbox" checked={pdfOpts.active}
                    onChange={(e) => setPdfOpts((o) => ({ ...o, active: e.target.checked }))} />
                  <span>{tr('Зөвхөн хоцорсон ба явж буй')}</span>
                </label>
                <label className={h.pdfRow}>
                  <span>{tr('Цаас')}</span>
                  <select className={h.select} value={pdfOpts.paper}
                    onChange={(e) => setPdfOpts((o) => ({ ...o, paper: e.target.value as HvPdfOpts['paper'] }))}>
                    <option value="A3">A3</option>
                    <option value="A4">A4</option>
                  </select>
                </label>
                <span className={h.pdfBtns}>
                  <button type="button" className={h.discard} onClick={() => setPdfOpen(false)}>{tr('Болих')}</button>
                  <button type="button" className={h.save} disabled={pdfBusy} onClick={() => void savePdf()}>{tr('Татах')}</button>
                </span>
              </span>
            )}
          </span>
        )}
        {grpSplit.length > 0 && (canEdit || canApprove) && (
          <span className={h.muted} role="status" title={grpSplit.join('; ')}>
            {tr('{0} бүлгийн мөрд сарын обьём хадгалагдсан байна — бүлэгт задаргаа тооцогдохгүй, тэнцлийн шалгалтад орохгүй: {1}',
              num(grpSplit.length), grpSplit.slice(0, 3).join('; ') + (grpSplit.length > 3 ? ` (+${num(grpSplit.length - 3)})` : ''))}
          </span>
        )}
        {/* Хуваалцсан ноорогийн төлөв (2026-09-23) — хадгалагдсан цаг · алдаа · хамт бичигчид */}
        {hdSt.st === 'saved' ? (
          <span className={`${h.flowNote} ${h.hdOk}`} role="status"
            title={[hdLabel, hdUsers.length > 0 ? tr('ноорогт: {0}', hdUsers.join(', ')) : ''].filter(Boolean).join(' · ')}>
            <span aria-hidden>✓</span> {tr('Ноорог хадгалагдсан')}
          </span>
        ) : hdLabel ? (
          <span className={`${h.flowNote} ${hdSt.st === 'err' || hdSt.st === 'big' || hdSt.st === 'local' ? h.hdWarn : ''}`} role="status"
            title={hdUsers.length > 0 ? tr('ноорогт: {0}', hdUsers.join(', ')) : undefined}>
            {hdLabel}
          </span>
        ) : null}
        {hdStoreNote && canEditRole && (hdStoreMode === 'rows-wait' || roleForUser(user?.username) === 'super') && (
          <span className={`${h.flowNote} ${h.hdWarn}`} role="status">{hdStoreNote}</span>
        )}

        {canEdit && !previewing && !locked && dirtyN > 0 && (
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Илгээгээгүй бүх өөрчлөлтийг хаяна — хуваалцсан ноорог БҮХ оролцогчид устна')}
            onClick={async () => {
              const others = hdUsers.length > 0 ? ` (${hdUsers.join(', ')})` : '';
              if (!(await askConfirm(tr('Илгээгээгүй {0} өөрчлөлтийг хаях уу? Хуваалцсан ноорог бүх оролцогчид{1} устна.', num(dirtyRows), others), { danger: true, ok: tr('Ноорог хаях') }))) return;
              hdDiscard();
              setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map()); setADraft(new Map()); setResDraft(new Map()); setNote('');
              setUndoSnap(null); setChainN(0); setChgOpen(false);
              setBackMarks(null);
            }}>
            {tr('Ноорог хаях')} ({num(dirtyRows)})
          </button>
        )}
        {canEdit && pending && isOwnSubmission && approving == null && (
          <button type="button" className={h.discard} disabled={busy || !!pendingHolder || pendingPartial != null}
            title={pendingPartial != null
              ? tr('Батлагч ({0}) энэ илгээлтийн хуваарийг эх хуудсанд ХЭСЭГЧЛЭН бичсэн — татах боломжгүй. Батлагч батлалтыг гүйцээнэ.', pendingPartial || '—')
              : pendingHolder
                ? tr('{0} энэ илгээлтийг яг одоо батлаж байна — татах боломжгүй. Хэсэг хугацааны дараа дахин оролдоно уу.', pendingHolder)
                : tr('Хүлээгдэж буй илгээлтээ буцааж авна — агуулга нь ноорог болж буцна')}
            onClick={() => void withdraw()}>
            {tr('Илгээлтээ татах')}
          </button>
        )}
        {canAddRow && !ajSub && adds.length > 0 && (
          <button type="button" className={h.save} disabled={ajBusy || ajOrphans.length > 0}
            title={ajOrphans.length > 0
              ? orphanAddsMsg(ajOrphans.length)
              : tr('Нэмсэн шинэ ажлын мөрийг батлуулахаар илгээнэ — батлагдтал үндсэн өгөгдөлд бичигдэхгүй')}
            onClick={() => { setAjErr(''); setAjBox(true); }}>
            {tr('Нэмэлт ажил батлуулах')} ({num(adds.length)})
          </button>
        )}
        {canEdit && !pending && (
          <button
            type="button"
            className={h.save}
            disabled={busy || dirtyN === 0 || flowReady === false || obNotReady || !!frameOld}
            title={flowReady === false
              ? (flowWhy || tr('Батлах хүснэгт бэлэн болоогүй — админ нэг удаа нэвтэрч үүсгэнэ.'))
              : frameOld
                ? tr('Хуудасны сүүлийн хувилбар бүрэн хадгалагдаагүй тул илгээх боломжгүй — өмнөх хувилбар ({0}) харагдаж байна. Цэвэрлэгдсэний дараа хуудсаа сэргээнэ үү.', frameOld.shownDay)
              : obNotReady
                ? (obState === 'loading'
                  ? tr('Сарын обьёмын хүснэгт уншигдаж байна — дуусмагц илгээнэ үү.')
                  : tr('Сарын обьёмын хүснэгт уншигдаагүй тул илгээх боломжгүй. «Сарын обьём дахин ачаалах»-ыг дарна уу.'))
              : unbalRows.size
                ? tr('{0} ажлын сарын обьём нийт обьёмтой тэнцэхгүй — «Тэнцээгүй» шүүлтээр олж засаад илгээнэ', num(unbalRows.size))
                : tr('Өөрчлөлтийг батлуулахаар илгээнэ — батлагдтал эх хуваарь хөдлөхгүй')}
            onClick={() => { setErr(''); setFlowBox('send'); }}
          >
            {tr('Батлуулах')}{dirtyN ? ` (${num(dirtyRows)})` : ''}
            {unbalRows.size > 0 && ` · ${tr('{0} тэнцээгүй', num(unbalRows.size))}`}
          </button>
        )}
        {canEdit && !pending && obNotReady && obState === 'fail' && (
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Сарын обьёмын хүснэгт уншигдаагүй тул илгээх боломжгүй. «Сарын обьём дахин ачаалах»-ыг дарна уу.')}
            onClick={retryOb}>
            {tr('Сарын обьём дахин ачаалах')}
          </button>
        )}
        {!review && pending && canApprove && !isOwnSubmission && !previewing && (
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Саналыг хуанли дээр буулгаж харна — эх хуудсанд бичигдэхгүй')}
            onClick={() => void preview()}>
            {tr('Урьдчилан харах')}
          </button>
        )}
        {!review && pending && canApprove && !isOwnSubmission && previewing && (
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Урьдчилан харахыг болино')}
            onClick={clearPreview}>
            {tr('Харахыг болих')}
          </button>
        )}
        {!review && pending && canApprove && (
          <button type="button" className={h.save} disabled={busy || isOwnSubmission}
            title={isOwnSubmission
              ? tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.')
              : undefined}
            onClick={() => { setErr(''); setFlowBox('decide'); }}>
            {tr('Шийдвэрлэх')} ({num(pending.rowCount)})
          </button>
        )}
        {pending && canApprove && isOwnSubmission && (
          <span className={h.muted} role="status">
            {tr('Энэ илгээлтийг та өөрөө хийсэн тул өөрөө батлах боломжгүй. Өөр батлагч шийдвэрлэнэ — багцад батлагч томилоогүй бол админ «Хуваарийн эрх» хэсгээс нэмнэ.')}
          </span>
        )}
        {/*
          *    Урьд нь `canApprove` худал үед «Шийдвэрлэх» товч ОГТ
          *    зурагддаггүй байв — хэрэглэгч «товч идэвхгүй» гэж хардаг ч
          *    үнэндээ товч байхгүй, шалтгаан нь хаана ч бичигдэхгүй.
          *    Одоо хэнд хандахыг нэрлэнэ.
          */}
        {!review && pending && !canApprove && (
          <span className={h.muted} role="status">
            {hasPlanRole(user?.username, 'approver')
              ? tr('Танд батлах эрх бий, гэхдээ ЭНЭ багцад томилогдоогүй байна. Админ «Хуваарийн эрх» → {0} → «Батлагч» хэсэгт таныг нэмнэ.', tr(pkg.group))
              : tr('Батлах эрхгүй — энэ багцад батлагчаар томилогдсон хүн шийдвэрлэнэ. Админ «Хуваарийн эрх» хэсгээс томилно.')}
          </span>
        )}
        {/*
          * ХЯНАЛТЫН ЗУРВАС (2026-09-25) — зөвшөөрлийн тоолуур · батлах · буцаах · хаах.
          */}
        {review && (
          <>
            <span className={`${h.flowNote} ${allOk ? h.revAllOk : ''}`} role="status">
              {pending ? `${pending.author} · ` : ''}
              {tr('Зөвшөөрсөн {0}/{1} мөр', num(reviewOk), num(reviewOids.length))}
            </span>
            <button type="button" className={h.discard}
              disabled={!reviewLive || allOk || !reviewOids.length}
              title={tr('Дараагийн зөвшөөрөөгүй мөр рүү гүйлгэнэ (өөрчлөгдсөн блокийг нь сонгоно)')}
              onClick={jumpNextBad}>
              {tr('Дараагийн ✕')}
            </button>
            <button type="button" className={h.discard} aria-pressed={chgOpen}
              disabled={!reviewOids.length}
              title={tr('Өөрчлөгдсөн мөрүүдийн жагсаалт — дарж мөр рүү үсэрнэ, ✓/✕-ээр зөвшөөрнө')}
              onClick={() => setChgOpen((v) => !v)}>
              {tr('Өөрчлөлт {0}', num(reviewOids.length))}
            </button>
            {(status === 'off' || roleForUser(user?.username) === 'super') && (
              <button type="button" className={h.discard}
                disabled={busy || approving != null || !reviewLive || !reviewOids.length}
                title={tr('Өөрчлөгдсөн бүх мөрийг ногоон/улаан болгоно')}
                onClick={() => setOkRows(allOk ? new Set() : new Set(reviewOids))}>
                {allOk ? tr('Бүгдийг болих') : tr('Бүгдийг зөвшөөрөх')}
              </button>
            )}
            <button type="button" className={h.discard}
              disabled={busy || approving != null || !(reviewLive || reviewConflict) || !canApprove || isOwnSubmission}
              onClick={() => { setErr(''); setFlowBox('reject'); }}>
              {tr('Буцаах')}
            </button>
            <button type="button" className={h.save}
              disabled={busy || approving != null || !reviewLive || !canApprove || isOwnSubmission || (reviewOids.length > 0 && !allOk) || obOut.bad > 0 || !!frameOld}
              title={isOwnSubmission
                ? tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.')
                : !canApprove
                  ? tr('Энэ багцын хуваарийг батлах эрхгүй.')
                  : reviewOids.length > 0 && !allOk
                    ? tr('Өөрчлөгдсөн мөр бүрийг ногоон болгосны дараа батална.')
                    : obOut.bad > 0
                      ? obOutMsg
                      : tr('Батлахад хуваарь эх хуудсанд бичигдэнэ.')}
              onClick={async () => { if (await askConfirm(tr('Хуваарийг батлах уу? Эх хуудсанд бичигдэнэ.'), { ok: tr('Батлах') })) void decide(true, ''); }}>
              {tr('Батлах')}
            </button>
            {reviewRetry && !reviewLive && !reviewConflict && (pending == null || pending.oid === review.oid) && (
              <button type="button" className={h.discard} disabled={busy || approving != null}
                title={tr('Саналыг дахин уншиж хуанли дээр буулгана')}
                onClick={retryReview}>
                {tr('Дахин оролдох')}
              </button>
            )}
            <button type="button" className={h.discard} disabled={busy || approving != null}
              title={tr('Шийдвэргүй хаана (Esc)')}
              onClick={() => { void confirmDropMarks(okRows.size).then((ok) => { if (ok) review.onClose(); }); }}>
              ✕ {tr('Хаах')}
            </button>
            {(() => {
              if (busy || approving != null || isOwnSubmission) return null;
              const why = !canApprove
                ? tr('Энэ багцын хуваарийг батлах эрхгүй.')
                : reviewConflict
                  ? tr('Санал одоогийн хуваарьтай зөрчилдсөн эсвэл агуулга нь уншигдсангүй тул зөвхөн буцаах боломжтой.')
                  : !reviewLive
                    ? (reviewRetry
                      ? tr('Санал хуанли дээр буулгагдсангүй — «Дахин оролдох» дарна уу.')
                      : tr('Санал хуанли дээр буулгагдаагүй байна — буулгагдсаны дараа шийдвэрлэнэ.'))
                    : reviewOids.length > 0 && !allOk
                      ? tr('Өөрчлөгдсөн мөр бүрийг ногоон болгосны дараа батална.')
                      : reviewLive && obOut.bad > 0
                        ? obOutMsg
                        : '';
              return why ? <span className={h.muted} role="status">{why}</span> : null;
            })()}
          </>
        )}
        {progress && (
          <span className={h.flowNote} role="status" aria-live="polite">⏳ {progress}</span>
        )}
      </header>

      {(err || chainN > 0 || note) && (
        <div className={h.toasts}>
          {err && (
            <p className={h.err} role="alert">
              {err}
              <button type="button" className={h.noteX} onClick={() => setErr('')} aria-label={tr('Хаах')}>×</button>
            </p>
          )}
          {chainN > 0 && (
            <p className={`${h.note} ${h.noteDismiss}`} role="status" aria-live="polite" onClick={() => setChainN(0)}>
              {tr('{0} хамаарагч ажил дагаж шилжлээ', num(chainN))}
              {chainList.length > 0 && `: ${chainList.slice(0, 8).map((x) => (x.d == null || x.d === 0
                ? x.lab
                : `${x.lab} (${x.d > 0 ? '+' : '−'}${num(Math.abs(x.d))}${tr('х')})`)).join(', ')}${chainList.length > 8 ? ` +${num(chainList.length - 8)}` : ''}`}
              {chainUnbalN > 0 && (
                <>
                  {`, ${tr('{0} ажлын сарын обьём тэнцэхгүй боллоо', num(chainUnbalN))}`}
                  <button type="button" className={h.noteBtn}
                    onClick={(e) => { e.stopPropagation(); setChips((s) => (s.has('unbal') ? s : new Set<Chip>([...s, 'unbal']))); }}>
                    {tr('Тэнцээгүйг харах')}
                  </button>
                </>
              )}
              {undoSnap && canEdit && !locked && !busy && (
                <button type="button" className={h.noteBtn} onClick={(e) => { e.stopPropagation(); undoLast(); }}>{tr('Буцаах')}</button>
              )}
              <button type="button" className={h.noteX} onClick={() => setChainN(0)} aria-label={tr('Хаах')}>×</button>
            </p>
          )}
          {note && (
            <p className={`${h.note} ${h.noteDismiss}`} role="status" aria-live="polite" onClick={() => setNote('')}>
              {note}
              <button type="button" className={h.noteX} onClick={() => setNote('')} aria-label={tr('Хаах')}>×</button>
            </p>
          )}
        </div>
      )}
      {errList.length > 0 && (
        <div className={h.err} role="alert">
          <ul className={h.errList}>
            {errList.map((x, k) => (
              <li key={k}>
                {x.msg}
                {x.oid != null && plan.some((r) => r.oid === x.oid) && (
                  <>
                    {' '}
                    <button type="button" className={h.noteBtn} onClick={() => goToRow(x.oid!, x.b)}>{tr('→ ажил руу')}</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className={h.noteX} onClick={() => setErrList([])} aria-label={tr('Хаах')}>×</button>
        </div>
      )}
      {(orphanOids.size > 0 || orphanOb.size > 0) && canEdit && !locked && (
        <p className={h.err} role="status">
          {orphanOids.size > 0 && tr('{0} мөрийн ноорог одоогийн хуудаснаас олдохгүй (өнчин) — хадгалагдахгүй.', num(orphanOids.size))}
          {(() => {
            const nm = [...orphanOids].map((o) => hdOrphan.get(o)).filter((x): x is string => !!x);
            return nm.length ? ` ${nm.slice(0, 5).join('; ')}${nm.length > 5 ? ` (+${num(nm.length - 5)})` : ''}.` : '';
          })()}
          {orphanOb.size > 0 && (orphanOids.size > 0 ? ' ' : '')}
          {orphanOb.size > 0 && tr('{0} ажил·блокийн сарын обьёмын ноорог хуудсанд байхгүй ажлын кодтой (өнчин) — хадгалагдахгүй: {1}.',
            num(orphanOb.size), [...orphanOb].slice(0, 5).map((k) => k.replace('|', ' · ')).join('; ') + (orphanOb.size > 5 ? ` (+${num(orphanOb.size - 5)})` : ''))}
          {' '}
          <button type="button" className={h.noteBtn} disabled={busy}
            onClick={() => {
              const drop = <V,>(m0: Map<number, V>) => { const m = new Map(m0); for (const o of orphanOids) m.delete(o); return m; };
              setDraft(drop); setHam(drop); setADraft(drop); setResDraft(drop);
              const dropOb = <V,>(m0: Map<string, V>) => { const m = new Map(m0); for (const k of orphanOb) m.delete(k); return m; };
              setObDraft(dropOb); setObResDraft(dropOb);
              setUndoSnap(null);
            }}>
            {tr('Өнчин ноорог устгах ({0})', num(orphanOids.size + orphanOb.size))}
          </button>
        </p>
      )}
      {chgOpen && (
        <aside className={h.chgPanel} role="region" aria-label={tr('Өөрчлөлт')}>
          <header className={h.mdHead}>
            <b className={h.mdWork}>{tr('Өөрчлөлт {0}', num(changes.length))}</b>
            <button type="button" className={h.mdX} onClick={() => setChgOpen(false)} aria-label={tr('Хаах')}>×</button>
          </header>
          {changes.length === 0 && <p className={h.muted}>{tr('Өөрчлөлт алга.')}</p>}
          {changes.map((c) => (
            <div key={c.oid} className={`${h.chgItem} ${sel === c.oid ? h.chgItemOn : ''}`}>
              {marking && reviewSet.has(c.oid) && (
                <button type="button" className={h.rowMark} aria-pressed={okRows.has(c.oid)}
                  disabled={busy || approving != null}
                  title={okRows.has(c.oid) ? tr('Зөвшөөрсөн — дарж болино') : tr('Зөвшөөрөөгүй — дарж зөвшөөрнө')}
                  onClick={() => toggleOk(c.oid)}>
                  {okRows.has(c.oid) ? '✓' : '✕'}
                </button>
              )}
              {!marking && backOn && backMarkMap.has(c.oid) && (
                <span className={h.rowMark} role="img"
                  style={{ color: backMarkMap.get(c.oid) === 'ok' ? 'var(--good-ink)' : 'var(--bad-ink)' }}
                  aria-label={backMarkMap.get(c.oid) === 'ok' ? tr('Батлагч зөвшөөрсөн') : tr('Батлагч зөвшөөрөөгүй — засна уу')}
                  title={backMarkMap.get(c.oid) === 'ok' ? tr('Батлагч зөвшөөрсөн') : tr('Батлагч зөвшөөрөөгүй — засна уу')}>
                  {backMarkMap.get(c.oid) === 'ok' ? '✓' : '✕'}
                </span>
              )}
              <button type="button" className={h.rowMain} title={tr('Мөр рүү үсрэх')} onClick={() => goToRow(c.oid, c.b0)}>
                <b>{c.no} {fixCyr(c.work)}</b>
                <span className={h.muted}>{chgText(c)}</span>
              </button>
            </div>
          ))}
        </aside>
      )}
      {komissNote && (
        <p className={`${h.note} ${h.noteDismiss}`} role="status" aria-live="polite" onClick={() => setKomissNote('')}>
          {komissNote}
          <button type="button" className={h.noteX} onClick={() => setKomissNote('')} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {/* ── НЭМЭЛТ АЖЛЫН баннерууд (2026-09-24) — хуваарийн урсгалынхаас тусдаа ── */}
      {ajErr && (
        <p className={h.err} role="alert">
          {ajErr}
          <button type="button" className={h.noteX} onClick={() => setAjErr('')} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {ajNote && (
        <p className={`${h.note} ${h.noteDismiss}`} role="status" aria-live="polite" onClick={() => setAjNote('')}>
          {ajNote}
          <button type="button" className={h.noteX} onClick={() => setAjNote('')} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {/* Хүлээгдэж буй илгээлт — БҮХ хүнд (ил тод); «татах» ЗӨВХӨН зохиогчид
          (`decideAjil` зохиогч=батлагчийг татгалздаг тул үүнгүйгээр багц түгжинэ) */}
      {ajSub && (
        <p className={h.note} role="status">
          {tr('Нэмэлт ажил батлуулахаар илгээгдсэн: {0} мөр · {1}', num(ajSub.rowCount), ajSub.author)}
          {ajEdit && ajEdit.oid === ajSub.oid && (
            <>
              {' · '}<b>{tr('засаж байна')}</b>
              <button type="button" className={h.noteBtn} disabled={ajBusy || adds.length === 0}
                title={tr('Зассан мөрүүдийг ИЖИЛ илгээлтэд хадгална — батлагч шинэ хувилбарыг харна')}
                onClick={() => void saveAjilEdit()}>
                {tr('Засварыг хадгалах')} ({num(adds.length)})
              </button>
              <button type="button" className={h.noteBtn} disabled={ajBusy}
                title={tr('Засварыг хаяна — илгээлт өмнөх хэвээрээ үлдэнэ')}
                onClick={cancelAjilEdit}>
                {tr('Болих')}
              </button>
            </>
          )}
          {canAddRow && !ajEdit && (status === 'off' || (user?.username ?? '').trim().toLowerCase() === ajSub.author) && (
            <button type="button" className={h.noteBtn} disabled={ajBusy}
              title={tr('Батлагч шийдээгүй байхад илгээсэн мөрүүдээ засна — илгээлт хүлээгдсэн хэвээр')}
              onClick={() => void editAjilHere()}>
              {tr('Засах')}
            </button>
          )}
          {(status === 'off' || (user?.username ?? '').trim().toLowerCase() === ajSub.author) && (
            <button type="button" className={h.noteBtn} disabled={ajBusy}
              title={tr('Илгээлтээ буцааж авна — мөрүүд хуудсанд эргэж орно')}
              onClick={() => void withdrawAjilHere()}>
              {tr('Илгээлтээ татах')}
            </button>
          )}
        </p>
      )}
      {ajBack && (
        <p className={h.err} role="alert">
          {tr('Нэмэлт ажил буцаасан ({0} мөр, {1}, {2}): {3} — мөрүүд хуудсанд буцаж орлоо, засаад дахин батлуулна уу.', num(ajBack.n), ajBack.by || '—', ajBack.at != null ? dayKey(ajBack.at) : '—', ajBack.reason || '—')}
          <button type="button" className={h.noteX} onClick={dismissAjBack} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {!review && canAddRow && ajOrphans.length > 0 && (
        <div className={h.err} role="alert">
          {orphanAddsMsg(ajOrphans.length)}
          <ul>
            {ajOrphans.map((a) => (
              <li key={a.oid}>
                {a.no} · {fixCyr(a.work)} ({tr('эцэг: {0}', `${a.parentNo} ${fixCyr(a.parentWork)}`.trim() || '—')})
                {' '}
                <select className={h.select} value="" disabled={ajBusy}
                  aria-label={tr('Бүлэг сонгох')}
                  onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && e.target.value) setAddParent(a.oid, v); }}>
                  <option value="">{tr('Бүлэг сонгох…')}</option>
                  {rows.filter((r) => r.group).map((r) => (
                    <option key={r.oid} value={r.oid}>{`${'· '.repeat(Math.max(0, r.depth))}${r.no} ${fixCyr(r.work)}`.trim()}</option>
                  ))}
                </select>
                {' '}
                <button type="button" className={h.noteBtn} disabled={ajBusy}
                  onClick={() => dropAdd(a.oid)}>
                  {tr('Устгах')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!review && ajApplied && (
        <p className={h.note} role="status">
          {tr('Нэмэлт ажил батлагдлаа — хадгалаагүй өөрчлөлтөө хадгалаад/илгээгээд хуудсыг шинэчилнэ үү.')}
          <button type="button" className={h.noteBtn} disabled={busy}
            title={tr('Хуудсыг серверээс татна; хадгалаагүй ноорог шинэ мөрүүд рүү (№ · нэрээр) зөөгдөнө')}
            onClick={() => void refreshAfterApplied()}>
            {tr('Шинэчлэх')}
          </button>
        </p>
      )}
      {ajStuck > 0 && (
        <p className={h.note} role="status">
          {tr('Батлагдсан нэмэлт ажлын {0} илгээлт үндсэн хүснэгтэд хараахан буугаагүй — батлагч «Нэмэлт ажил батлах» хуудаснаас «Дахин буулгах» дарна.', num(ajStuck))}
        </p>
      )}
      {!review && planNews && planNews.some((x) => x.pkgKey !== pkg.key) && (
        <p className={h.note} role="status">
          {tr('Таны илгээлтийн шинэ шийдвэр:')}
          {planNews.filter((x) => x.pkgKey !== pkg.key).slice(0, 8).map((x) => {
            const p = PKGS.find((q) => q.key === x.pkgKey);
            if (!p) return null;
            return (
              <button key={x.oid} type="button" className={h.noteBtn} disabled={busy || switching}
                title={tr('Тэр багц руу шилжинэ')}
                onClick={() => runSwitch(() => setPkg(p))}>
                {p.label}
                {' · '}
                {x.status === 'returned' ? tr('буцаасан') : tr('батлагдсан')}
                {x.kind === 'geree' ? ` · ${tr('Гэрээ')}` : ''}
              </button>
            );
          })}
        </p>
      )}
      {!review && !canEditRole && !canApprove && canAddRow && (
        <p className={h.note}>
          {tr('Энэ багцад та шинэ ажлын мөр нэмж батлуулахаар илгээх эрхтэй. Хуваарийн огноог засах эрх алга — огноог зөвхөн харна.')}
        </p>
      )}
      {!review && !canEditRole && !canApprove && !canAddRow && (
        <p className={h.note}>
          {hasPlanRole(user?.username, 'author')
            ? tr('Танд хуваарь төлөвлөх эрх бий, гэхдээ ЭНЭ багцад томилогдоогүй байна — зөвхөн харна. Админ «Хуваарийн эрх» → {0} → «Зохиогч» хэсэгт таныг нэмнэ.', tr(pkg.group))
            : tr('Танд хуваарь засах эрх алга — зөвхөн харна. Админ «Хуваарийн эрх» → {0} → «Зохиогч» хэсэгт таныг нэмнэ.', tr(pkg.group))}
        </p>
      )}
      {!review && !canEditRole && canApprove && !pending && flowReady === true && (
        <p className={h.note}>
          {tr('Танд батлах хуваарь алга — гүйцэтгэгч илгээмэгц энд гарч ирнэ. Хуваарийг та зөвхөн харна, засахгүй.')}
        </p>
      )}
      {!review && pending && (
        <p className={h.note} role="status">
          {tr('{0} мөрийн хуваарь батлагдахыг хүлээж байна ({1} илгээв). Шийдвэр гартал эх хуваарь хөдлөхгүй.',
            num(pending.rowCount), pending.author)}
          {(() => {
            const parts: string[] = [];
            if (pending.authorSent != null) {
              const hrs = Math.max(0, Math.floor((clock - pending.authorSent) / 3_600_000));
              parts.push(hrs >= 24 ? tr('{0} хоног хүлээж байна', num(Math.floor(hrs / 24))) : tr('{0} цаг хүлээж байна', num(hrs)));
            }
            const auth0 = pending.author.trim().toLowerCase();
            const appr = planApproversOf(pkg.group).filter((u) => u.trim().toLowerCase() !== auth0);
            if (appr.length) parts.push(tr('батлагч: {0}', appr.slice(0, 5).join(', ') + (appr.length > 5 ? ` (+${num(appr.length - 5)})` : '')));
            else if (huvaariAclReady() && planAdminCanApprove(pending.author)) parts.push(tr('админ батлах боломжтой'));
            else if (huvaariAclReady()) parts.push(tr('батлагч томилоогүй — админ «Хуваарийн эрх» хэсгээс нэмнэ'));
            return parts.length ? ` ${parts.join(' · ')}.` : '';
          })()}
          {' '}
          {kind === 'plan'
            ? tr('Энэ нь ТӨЛӨВЛӨГӨӨНИЙ илгээлт — «Гэрээ» таб засагдана.')
            : tr('Энэ нь ГЭРЭЭНИЙ илгээлт — «Төлөвлөгөө» таб засагдана.')}
          {!canApprove && ` ${tr('Батлагч шийдвэрлэсний дараа энэ хуудас дахин нээгдэнэ.')}`}
          {canApprove && isOwnSubmission
            && ` ${tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.')}`}
          {isOwnSubmission && pendingPartial != null && ` ${tr('Батлагч ({0}) хэсэгчлэн бичсэн — татах боломжгүй.', pendingPartial || '—')}`}
          {isOwnSubmission && pendingPartial == null && pendingHolder
            && ` ${tr('{0} батлаж байна ({1} мин).', pendingHolder, num(minutesSince(pending.approverAt, clock)))}`}
          {' '}
          <button type="button" className={h.noteBtn} disabled={busy} onClick={() => void refreshFlow()}>
            {tr('Шинэчлэх')}
          </button>
          {(!canApprove || isOwnSubmission) && approving == null && (
            <span className={h.tlZoom} role="group" aria-label={tr('Хуваарийн хувилбар')} style={{ marginLeft: 8 }}>
              <button type="button" className={`${h.tlZoomB} ${!previewing ? h.tlZoomOn : ''}`}
                aria-pressed={!previewing} disabled={busy}
                title={tr('Одоо хүчинтэй, батлагдсан хуваарь')}
                onClick={() => { if (previewing) clearPreview(); }}>
                {tr('Батлагдсан хуваарь')}
              </button>
              <button type="button" className={`${h.tlZoomB} ${previewing ? h.tlZoomOn : ''}`}
                aria-pressed={previewing} disabled={busy}
                title={tr('Илгээсэн, хараахан батлагдаагүй хуваарь — зөвхөн харах')}
                onClick={() => { if (!previewing) void viewSent(); }}>
                {tr('Илгээсэн хуваарь')}
              </button>
            </span>
          )}
        </p>
      )}
      {!review && !pending && pendingOther && (
        <p className={h.note} role="status">
          {kind === 'plan'
            ? tr('«Гэрээ» табын {0} мөрийн илгээлт батлагдахыг хүлээж байна ({1} илгээв) — энэ таб (Төлөвлөгөө) засагдана.', num(pendingOther.rowCount), pendingOther.author)
            : tr('«Төлөвлөгөө» табын {0} мөрийн илгээлт батлагдахыг хүлээж байна ({1} илгээв) — энэ таб (Гэрээ) засагдана.', num(pendingOther.rowCount), pendingOther.author)}
        </p>
      )}
      {!review && lastDecision && lastDecision.status === PLAN_STATUS.returned && (
        /* `pre-line` — шалтгааны «Зөвшөөрөгдөөгүй N мөр: …» жагсаалт тусдаа мөрөнд */
        <p className={h.err} role="status" style={{ whiteSpace: 'pre-line' }}>
          <b>{tr('Хуваарь буцаасан')}</b>
          {` · ${lastDecision.approver ?? '—'} · ${lastDecision.approverAt == null ? '—' : dayKey(lastDecision.approverAt)}`}
          {'\n'}
          <b>{tr('Буцаасан шалтгаан')}: </b>
          {showPlanReason(lastDecision.reason?.trim() ?? '') || tr('шалтгаан бичигдээгүй')}
          {'\n'}
          {tr('Засаад дахин илгээнэ үү.')}
          {lastDecision.okRows && ` ${tr('Батлагч {0} мөрийг зөвшөөрсөн.', num(lastDecision.okRows.length))}`}
          {canEditRole && (
            <>
              {' '}
              <button type="button" className={h.noteBtn} disabled={busy || dirtyN > 0} onClick={() => void restoreWithdrawn()}
                title={dirtyN > 0
                  ? tr('Одоогийн {0} ноорог байна — хаясны дараа засна', num(dirtyRows))
                  : tr('Буцаасан хуваарийг хуанлид буулгаж засна — зөвшөөрөгдөөгүй мөр УЛААН, зөвшөөрсөн нь НОГООН')}>
                {tr('Буцаасан хуваарийг засах')}
              </button>
              {dirtyN > 0 && !backOn && ` ${tr('Одоогийн {0} ноорог байна — хаясны дараа засна', num(dirtyRows))}`}
            </>
          )}
        </p>
      )}
      {backOn && (
        <p className={h.note} role="status">
          {tr('Улаан тэмдэгтэй мөрийг батлагч зөвшөөрөөгүй — засаад дахин илгээнэ үү. Ногоон нь зөвшөөрөгдсөн.')}
          {(() => {
            const nBad = [...backMarkMap.values()].filter((v) => v === 'bad').length;
            return (
              <>
                {' '}
                <button type="button" className={h.noteBtn} disabled={!nBad}
                  title={tr('Дараагийн улаан (зөвшөөрөөгүй) мөр рүү гүйлгэнэ — товч: ]')}
                  onClick={jumpNextBad}>
                  {tr('Дараагийн улаан ({0})', num(nBad))}
                </button>
              </>
            );
          })()}
        </p>
      )}
      {!review && lastDecision && lastDecision.status === PLAN_STATUS.withdrawn && (
        <p className={h.note} role="status">
          {tr('Өмнөх илгээлтийг зохиогч ({0}) өөрөө татсан — засаад дахин илгээнэ.', lastDecision.author)}
          {canEditRole && dirtyN === 0 && (
            <>
              {' '}
              <button type="button" className={h.noteBtn} disabled={busy} onClick={() => void restoreWithdrawn()}>
                {tr('Ноорогт буцаах')}
              </button>
            </>
          )}
        </p>
      )}
      {!review && lastDecision && lastDecision.status === PLAN_STATUS.approved && (
        <p className={h.note} role="status">
          {tr('Сүүлийн хуваарь батлагдсан ({0}, {1} мөр).',
            lastDecision.approver ?? '', num(lastDecision.rowCount))}
        </p>
      )}
      {flowReady === false && (canEditRole || canApprove) && !loadErr && (
        <p className={h.err} role="alert">
          {flowWhy || tr('Батлах хүснэгт олдсонгүй — админ (super) нэг удаа нэвтрэхэд автоматаар үүснэ.')}
          {' '}
          {canEditRole ? tr('Түүнийг хүртэл хуваарь илгээх боломжгүй.') : tr('Түүнийг хүртэл батлах хуваарь харагдахгүй.')}
          {' '}
          <button type="button" className={h.noteBtn} disabled={busy} onClick={() => void refreshFlow()}>
            {tr('Дахин оролдох')}
          </button>
        </p>
      )}
      {frameOld && (
        <p className={h.err} role="alert">
          {tr('Хуудасны сүүлийн хувилбар ({0}) бүрэн хадгалагдаагүй тул өмнөх бүтэн хувилбарыг ({1}) харуулж байна. Энэ үед батлах/хадгалах боломжгүй — гүйцэтгэлийн батлалт түүнийг цэвэрлэсний дараа хуудсаа сэргээнэ үү.', frameOld.day, frameOld.shownDay)}
        </p>
      )}

      {busy && !rows.length ? (
        <Loading label={tr('Хуваарь ачаалж байна…')} />
      ) : loadErr ? (
        <Data q={{ state: 'error', data: null, error: loadErr, retry: () => setReloadN((n) => n + 1) }}>{() => null}</Data>
      ) : !sc || !rows.length ? (
        <Empty label={tr('Энэ багцад мөр олдсонгүй.')}
          hint={tr('Энэ багцын бөглөх хуудас хоосон байна — өөр багц сонгоно уу, эсвэл админд мэдэгдэнэ үү.')} />
      ) : (
        <Section fill>
          <div className={h.fullBar}>
            {!review && (
            <button
              type="button"
              className={wide ? h.fullBtnOn : h.fullBtn}
              onClick={() => setWide((v) => !v)}
              aria-pressed={wide}
              title={wide ? tr('Бүтэн дэлгэцээс гарах (Esc)') : tr('Хуваарийг бүтэн дэлгэцээр')}
            >
              <span aria-hidden>{wide ? '✕' : '⛶'}</span>
              {wide ? tr('Багасгах') : tr('Бүтэн дэлгэц')}
            </button>
            )}
            {isWide && (
              <span className={h.fullBarNote}>
                {review
                  ? `${tr('Хуваарь шийдвэрлэх')} · ${pkg.label} · ${kind === 'geree' ? tr('Гэрээ') : tr('Төлөвлөгөө')}`
                  : `${pkg.label}${dirtyN ? ` · ${tr('өөрчлөлт')} ${num(dirtyRows)}` : ''}`}
              </span>
            )}
            {canEdit && !locked && sc.bld.length > 1 && (
              <div className={h.gBlks} role="group" aria-label={tr('Олон блок сонгох')}>
                <span className={h.gBlksLabel}>{tr('Олон блок сонгох')}</span>
                {sc.bld.map((b, k) => {
                  const on = k === blk || gBlks.has(k);
                  return (
                    <button type="button" key={b}
                      className={`${h.gChip} ${on ? h.gChipOn : ''} ${k === blk ? h.gChipAct : ''}`}
                      aria-pressed={on}
                      title={k === blk
                        ? tr('Идэвхтэй блок — хуанли дээр энэ блок харагдана (дээрх «Блок» сонгогчоор солино)')
                        : tr('Энэ блокт зэрэг төлөвлөх')}
                      onClick={() => {
                        if (k === blk) return;
                        setGBlks((s0) => { const m = new Set(s0); if (m.has(k)) m.delete(k); else m.add(k); return m; });
                      }}>
                      {b}
                    </button>
                  );
                })}
                <button type="button" className={h.tlZoomB}
                  onClick={() => setGBlks(new Set(sc.bld.map((_, k) => k)))}>{tr('Бүгд')}</button>
                <button type="button" className={h.tlZoomB} disabled={gBlks.size === 0 || (gBlks.size === 1 && gBlks.has(blk))}
                  onClick={() => setGBlks(new Set())}>{tr('Цэвэрлэх')}</button>
                {new Set([blk, ...gBlks]).size > 1 && (
                  <span className={h.gBlksNote}>
                    {tr('{0} блокт зэрэг төлөвлөнө — ажлын цонхонд «Тавих» дарахад сонгосон бүх блокт ижил огноо тавигдана', num(new Set([blk, ...gBlks]).size))}
                  </span>
                )}
              </div>
            )}
          </div>
          {review && (
            <p className={h.plHint}>
              {tr('Өөрчлөгдсөн мөр улаан хүрээтэй · хуучин огноо нь зурвасын доор бүдгээр · ажлын кодын ✕ дээр дарж зөвшөөрнө (ногоон ✓) · нэр дээр дарж дэлгэрэнгүйг харна · бүгд ногоон болсны дараа «Батлах» идэвхжинэ')}
            </p>
          )}
          {allOn ? (
            <p className={h.plHint}>
              {tr('Бүх блок — зөвхөн харах. Ажлын зурвас нь бүх блокийн нийт муж; доорх мөрүүд блок бүрийнх. Блокийн мөр дээр дарж тэр блок руу орж засна.')}
            </p>
          ) : null}

          {/* ── НЭГ БҮТЭН ХҮСНЭГТ: зүүн мод + баруун хуанли ── */}
          {hdRestoringUi && (
            <div className={h.plHint} role="status" aria-busy="true">
              {tr('Таны ноорог сэргээгдэж байна — бүрэн сэргэсний дараа хүснэгт нээгдэнэ…')}
              {hdRestoreSlow && (
                <>
                  {' '}{tr('Сэргээлт удаж байна (сүлжээ).')}{' '}
                  <button type="button" className={h.noteBtn} onClick={() => window.location.reload()}>
                    {tr('↻ Хуудас дахин ачаалах')}
                  </button>
                </>
              )}
            </div>
          )}
          {visible.length === 0 ? (
            !hdRestoringUi && (filtOn || fGrp !== 'all'
              ? (
                <Empty label={tr('Шүүлтэнд тохирох мөр алга.')}
                  hint={(
                    <button type="button" className={h.noteBtn}
                      onClick={() => { setFilter('all'); setFYear('all'); setChips(new Set()); setFGrp('all'); }}>
                      {tr('Шүүлт арилгах')}
                    </button>
                  )} />
              )
              : <Empty label={tr('Мөр алга.')} />)
          ) : (
            <div className={`${h.gWrap}${hdRestoringUi ? ` ${h.gWrapGated}` : ''}`} ref={scrollRef} onScroll={onScroll}
              aria-hidden={hdRestoringUi || undefined} inert={hdRestoringUi}>
              <div ref={sideAndColRef} style={{ ...sideStyle, ...colW.style }} className={`${h.gSide} ${cols ? '' : h.gSideNarrow} ${canEdit && !locked && !allOn ? (kind === 'plan' ? h.gSideEdP : h.gSideEdG) : ''}`}>
                <button type="button" className={`${h.sideGrip}${sideGrip.dragging ? ` ${h.sideGripOn}` : ''}`}
                  role="separator" aria-orientation="vertical"
                  aria-label={tr('Жагсаалтын өргөн')} aria-valuenow={sideGrip.extra}
                  title={tr('Чирж жагсаалтыг өргөсгөнө · давхар дарвал анхны өргөн')}
                  onPointerDown={sideGrip.onPointerDown} onKeyDown={sideGrip.onKeyDown}
                  onDoubleClick={sideGrip.onDoubleClick} />
                <div className={h.gSideHead} style={{ height: PL_ROW }}>
                  <span className={h.gHeadDes}>{tr('Ажлын код')}<ColGrip g={colW.grip('des')} label={tr('«Ажлын код» баганын өргөн')} /></span>
                  <span className={h.gHeadWork}>
                    {tr('Ажил')}
                    <button type="button" className={h.colsBtn}
                      onClick={() => setCols((v) => !v)}
                      title={cols ? tr('Огноо · нөөцийн баганыг хураах') : tr('Огноо · нөөцийн баганыг нээх')}
                      aria-label={tr('Огноо · нөөцийн багана')}
                      aria-expanded={cols}>
                      {cols ? '◂' : '▸'}
                    </button>
                    <ColGrip g={colW.grip('work')} label={tr('«Ажил» баганын доод өргөн')} />
                  </span>
                  {/*
                    * ДӨРВӨН ОГНООНЫ БАГАНА (2026-09-15, хэрэглэгчийн хүсэлт:
                    * «ажилбар бүрийн ард 4 багана нэмнэ — гэрээний эхлэх,
                    * дуусах, инженерийн эхлэх, дуусах огноо»).
                    */}
                  <span className={`${h.gHeadDate} ${h.cGs}`}>{kind === 'geree' && multiTag}{tr('Гэрээ эхлэх')}<ColGrip g={colW.grip('gs')} label={tr('«{0}» баганын өргөн', tr('Гэрээ эхлэх'))} /></span>
                  <span className={`${h.gHeadDate} ${h.cGe}`}>{tr('Гэрээ дуусах')}<ColGrip g={colW.grip('ge')} label={tr('«{0}» баганын өргөн', tr('Гэрээ дуусах'))} /></span>
                  <span className={`${h.gHeadDays} ${h.cGd}`}>{tr('Хоног')}<ColGrip g={colW.grip('gd')} label={tr('«{0}» баганын өргөн', tr('Гэрээгээр үргэлжлэх хоног'))} /></span>
                  <span className={`${h.gHeadDate} ${h.cPs}`}>{kind === 'plan' && multiTag}{tr('Төлөвлөгөөт эхлэх')}<ColGrip g={colW.grip('ps')} label={tr('«{0}» баганын өргөн', tr('Төлөвлөгөөт эхлэх'))} /></span>
                  <span className={`${h.gHeadDate} ${h.cPe}`}>{tr('Төлөвлөгөөт дуусах')}<ColGrip g={colW.grip('pe')} label={tr('«{0}» баганын өргөн', tr('Төлөвлөгөөт дуусах'))} /></span>
                  <span className={`${h.gHeadDays} ${h.cPd}`}>{tr('Хоног')}<ColGrip g={colW.grip('pd')} label={tr('«{0}» баганын өргөн', tr('Төлөвлөгөөгөөр үргэлжлэх хоног'))} /></span>
                  {/*
                    * БОДИТ ЭХЭЛСЭН / ДУУССАН (2026-09-23) — идэвхтэй блокийн (`blk`)
                    * утга; popup-аас засагдана, энд зөвхөн харуулна (дээрх -тэй
                    * ижил: засварын нэг л зам). Бүлгийн мөрд хүүхдийн MIN/MAX.
                    */}
                  {hasActual && <span className={`${h.gHeadDate} ${h.cAs}`}>{tr('Бодит эхэлсэн')}<ColGrip g={colW.grip('as')} label={tr('«{0}» баганын өргөн', tr('Бодит эхэлсэн'))} /></span>}
                  {hasActual && <span className={`${h.gHeadDate} ${h.cAe}`}>{tr('Бодит дууссан')}<ColGrip g={colW.grip('ae')} label={tr('«{0}» баганын өргөн', tr('Бодит дууссан'))} /></span>}
                  {/* ХҮН ХҮЧ · МАШИН МЕХАНИЗМ (2026-09-23) — мөрийн нөөц; бүлэгт нийлбэр. */}
                  {hasRes && <span className={`${h.gHeadRes} ${h.cRh}`} title={tr('Хүн хүч')}>{tr('Хүн')}<ColGrip g={colW.grip('rh')} label={tr('«{0}» баганын өргөн', tr('Хүн хүч'))} /></span>}
                  {hasRes && <span className={`${h.gHeadRes} ${h.cRm}`} title={tr('Машин механизм')}>{tr('Техник')}<ColGrip g={colW.grip('rm')} label={tr('«{0}» баганын өргөн', tr('Машин механизм'))} /></span>}
                  <span className={h.gHeadHam} title={tr('Жишээ: 11FS14 — 11-р ажил дууссанаас 14 хоногийн дараа. Олныг таслалаар: 11FS,22SS-5. @2 = зөвхөн 2-р блок (@-гүй = бүх блок)')}>
                    {tr('Хамаарал')} <i className={h.gHeadHint}>11FS14</i>
                    <ColGrip g={colW.grip('ham')} label={tr('«Хамаарал» баганын өргөн')} />
                  </span>
                </div>
                {winFrom > 0 && <div aria-hidden style={{ height: winFrom * PL_ROW }} />}
                {slice.map(({ r: d }) => {
                  const r = d.r;
                  /* «БҮХ БЛОК» — блокийн ДЭД МӨР (2026-10-04): зөвхөн харах; дарахад тэр блок руу */
                  if (d.b >= 0) {
                    const xb = r.group ? effRow(r) : r;
                    return (
                      <BlockRow
                        key={`${r.oid}@${d.b}`}
                        r={r}
                        name={sc.bld[d.b] ?? ''}
                        on={sel === r.oid && blk === d.b}
                        hasActual={hasActual}
                        hasRes={hasRes}
                        aStart={xb.aStart?.[d.b] ?? null}
                        aEnd={xb.aEnd?.[d.b] ?? null}
                        geree={kind === 'geree' ? d.sp : refSpanOf(r.oid, d.b)}
                        tolov={kind === 'geree' ? refSpanOf(r.oid, d.b) : d.sp}
                        onPick={() => pickBlk(r.oid, d.b)}
                      />
                    );
                  }
                  /* Бүлгийн бодит огноо · нөөц хүүхдээс (2026-09-23, `aggExtra`) */
                  const x = r.group ? effRow(r) : r;
                  const xa = allOn ? actUnion(x.aStart, x.aEnd) : null;
                  return (
                  <TaskRow
                    key={r.oid}
                    r={r}
                    on={sel === r.oid}
                    dirty={!savedView && dirtyOids.has(r.oid)}
                    hasActual={hasActual}
                    hasRes={hasRes}
                    aStart={xa ? xa.start : x.aStart?.[blk] ?? null}
                    aEnd={xa ? xa.end : x.aEnd?.[blk] ?? null}
                    hun={x.hun ?? null}
                    mashin={x.mashin ?? null}
                    collapsed={collapsed.has(r.oid)}
                    onToggle={() => {
                      setLvl(0);
                      setCollapsed((s) => {
                        const m = new Set(s);
                        if (m.has(r.oid)) m.delete(r.oid); else m.add(r.oid);
                        return m;
                      });
                    }}
                    onPick={allOn ? () => setSel(r.oid) : () => { setSel(r.oid); setModal(r.oid); }}
                    geree={grpNoSpan && r.group ? null : allOn ? (kind === 'geree' ? d.sp : refSpanOf(r.oid, -1)) : kind === 'geree' ? rowSpanAt(r) : refSpanAt(r.oid)}
                    tolov={grpNoSpan && r.group ? null : allOn ? (kind === 'geree' ? refSpanOf(r.oid, -1) : d.sp) : kind === 'geree' ? refSpanAt(r.oid) : rowSpanAt(r)}
                    canEdit={canEdit && !locked && kind === 'plan' && !allOn}
                    onHamText={applyHamText}
                    hamKeep={residualDeps(ham.get(r.oid) ?? rowsAll[r.i]?.ham ?? null)}
                    onDate={!r.group && r.oid >= 0 && !allOn && canEdit && !locked
                      ? (w, dd, via) => applyDate(r.oid, w, dd, via) : undefined}
                    onDays={!r.group && r.oid >= 0 && !allOn && canEdit && !locked
                      ? (d, via) => applyDate(r.oid, 'days', String(d), via) : undefined}
                    edKind={kind}
                    onEditing={(on) => { setCellEdit(on ? r.oid : null); if (on) setSel(r.oid); }}
                    onNextRow={allOn ? undefined : nextRow}
                    onOtherTab={!r.group && r.oid >= 0 && !allOn && canEdit && pendingOther == null && !isReview && !switching ? otherTab : undefined}
                    changedBlks={marking ? reviewBlks.get(r.oid) : undefined}
                    onPickBlk={marking ? (b) => goToRow(r.oid, b) : undefined}
                    blkOn={blk}
                    editedBy={(() => { const m = hdMeta.current.get(kS(r.oid, blk)); return m && m.user !== meRef.current ? m : null; })()}
                    /* НЭМЭЛТ АЖИЛ (2026-09-24): бүлэгт «+», батлагдаагүй мөрд улаан + «×» */
                    added={r.oid < 0}
                    onAdd={r.group && canAddRow && !locked && !allOn
                      ? () => { setAddFor((x) => (x === r.oid ? null : r.oid)); setEditAdd(null); setAddForm(EMPTY_FORM); setAjErr(''); }
                      : undefined}
                    onDrop={r.oid < 0 && !allOn ? () => dropAdd(r.oid) : undefined}
                    /* НЭМЭЛТ МӨР ЗАСАХ (2026-09-29) — илгээгээгүй ба засварт нээсэн мөрд */
                    onEditAdd={r.oid < 0 && canAddRow && !allOn ? () => {
                      const a0 = adds.find((x) => x.oid === r.oid);
                      if (!a0) return;
                      setAddFor(null); setAjErr('');
                      setEditAdd((x) => (x === r.oid ? null : r.oid));
                      setAddForm({ no: a0.no, work: a0.work, vol: a0.vol == null ? '' : String(a0.vol), unit: a0.unit == null ? '' : String(a0.unit) });
                    } : undefined}
                    /* ЗӨВШӨӨРӨЛ (2026-09-25): хяналтад — батлагч сэлгэнэ; гүйцэтгэгчид —
                       буцаасан шийдвэрийн улаан/ногоон (зөвхөн харуулна). */
                    mark={markOf(r) ?? (marking && r.group ? grpMark(r.oid) : undefined)}
                    onMark={marking && (markOf(r) || (r.group && grpMark(r.oid)))
                      ? () => { if (r.group) void markGroup(r); else toggleOk(r.oid); } : undefined}
                  >
                    {!r.group && unbalRows.has(r.oid) && (() => {
                      const bs = unbalRows.get(r.oid)!;
                      const names = bs.map((b) => sc?.bld[b] ?? String(b + 1)).join(', ');
                      return (
                        <button type="button"
                          style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', padding: '0 4px', border: 0, borderRadius: 4, font: 'inherit', fontSize: 10, fontWeight: 700, lineHeight: 1.4, color: 'var(--bad-ink)', background: 'color-mix(in srgb, var(--bad) 14%, transparent)', cursor: 'pointer' }}
                          title={tr('Сарын обьём нийт обьёмтой тэнцэхгүй: {0} — дарж засна', names)}
                          aria-label={tr('Сарын обьём нийт обьёмтой тэнцэхгүй: {0} — дарж засна', names)}
                          onClick={(e) => { e.stopPropagation(); if (bs[0] !== blk) setBlk(bs[0]); setSel(r.oid); setModal(r.oid); }}>
                          Σ≠
                        </button>
                      );
                    })()}
                    {addFor === r.oid && !allOn && (
                      <AddBox parent={r} form={addForm} onForm={setAddForm}
                        onOk={() => addRow(r)} onCancel={() => setAddFor(null)} />
                    )}
                    {editAdd === r.oid && r.oid < 0 && !allOn && (
                      <AddBox parent={r} form={addForm} onForm={setAddForm} edit
                        onOk={() => saveEditAdd(r.oid)} onCancel={() => setEditAdd(null)} />
                    )}
                  </TaskRow>
                  );
                })}
                {winTo < disp.length && (
                  <div aria-hidden style={{ height: (disp.length - winTo) * PL_ROW }} />
                )}
              </div>

              <div className={h.gRight}>
                <div className={h.gTrack} style={{ width: W }} ref={trackRef}>
                  {calHead}

                  <div className={`${h.plLanes} ${canEdit && !locked && !allOn ? h.plLanesEdit : ''}`}
                    ref={lanesRef}
                    style={{ height: disp.length * PL_ROW }}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onCancel}
                  >
                    {calGrid}

                    {slice.map(({ r: d, k }) => {
                      /* «БҮХ БЛОК» — зөвхөн харах эгнээ (`allLane`, 2026-10-04); энгийн горим ХЭВЭЭР доор */
                      if (allOn) return allLane(d, k);
                      const r = d.r;
                      const sp = r.group ? (grpNoSpan ? null : effAt(r.i)) : r.spans[blk];
                      const st = sp ? statusOf(sp, r.act?.[blk], now) : 'none';
                      /* Уялдааны зөрчил — шаардлагаас ӨМНӨ эхэлсэн зурвасыг
                         улаан хүрээгээр тэмдэглэнэ (хориглохгүй) */
                      const need = sp && r.deps.length && kind === 'plan'
                        ? requiredStart(plan, byCode, r.i, blk) : null;
                      const viol = !!(sp && need != null && sp.start < need);
                      /*
                       * ХУУЧИН (СЕРВЕРИЙН) ЗУРВАС (2026-09-25) — батлагчийн хяналтад
                       * ба буцаасан саналыг засахад: өөрчлөгдсөн мөрийн ОДООГИЙН
                       * батлагдсан огноо доод хагаст бүдгээр («юу байсан → юу болох»).
                       */
                      const oldSp = (review || backOn) && !r.group && reviewSet.has(r.oid)
                        ? base[r.i]?.spans[blk] ?? null : null;
                      const showOld = !!(oldSp && !showRef && (!sp || oldSp.start !== sp.start || oldSp.end !== sp.end));
                      const half = showRef || showOld;
                      return (
                        <div key={r.oid}
                          className={`${h.plLane} ${k % 2 ? h.plLaneAlt : ''} ${sel === r.oid ? h.plLaneOn : ''} ${link && !hierRelated(plan, r.i, link.i) ? h.plLaneDrop : ''}`}
                          style={{ top: k * PL_ROW, height: PL_ROW }}
                          data-row={r.i}
                          onPointerDown={(e) => onDown(e, r, 'new')}
                        >
                          {/*
                            * ЛАВЛАГААНЫ ЗУРВАС — нөгөө төрлийн огноо (2026-09-11).
                            */}
                          {(() => {
                            if (!showRef) return null;
                            const rr = refByOid.get(r.oid);
                            if (!rr) return null;
                            const rsp = r.group ? effSpan(refBase, rr.i, blk) : rr.spans[blk];
                            if (!rsp) return null;
                            const other = kind === 'geree' ? tr('Төлөвлөгөө') : tr('Гэрээ');
                            return (
                              <div
                                className={h.plRef}
                                style={{ left: xOf(rsp.start), width: Math.max(6, spanDays(rsp) * px - 1) }}
                                title={`${other}: ${msToDay(rsp.start)} → ${msToDay(rsp.end)} (${tr('{0} хоног', spanDays(rsp))})`}
                              />
                            );
                          })()}
                          {drag && drag.oid === r.oid && sp && (
                            <span className={`${h.dragTip} ${k === 0 ? h.dragTipBelow : ''}`} style={{ left: xOf(sp.start) }} aria-hidden>
                              {msToDay(sp.start)} → {msToDay(sp.end)} · {spanDays(sp)}{tr('х')}
                            </span>
                          )}
                          {showOld && oldSp && (
                            <div
                              className={`${h.plRef} ${h.plOld}`}
                              style={{ left: xOf(oldSp.start), width: Math.max(6, spanDays(oldSp) * px - 1) }}
                              title={`${tr('Одоогийн (батлагдсан)')}: ${msToDay(oldSp.start)} → ${msToDay(oldSp.end)} (${tr('{0} хоног', spanDays(oldSp))})`}
                            />
                          )}
                          {sp && (
                            <div
                              className={`${h.plBar} ${half ? h.plBarHalf : ''} ${r.group ? h.plBarG : ST_CLASS[st]} ${sel === r.oid ? h.tlBarOn : ''} ${viol ? h.plBarViol : ''}`}
                              style={{ left: xOf(sp.start), width: Math.max(10, spanDays(sp) * px - 1) }}
                              onPointerDown={(e) => onDown(e, r, 'move')}
                              role={r.oid < 0 ? undefined : 'button'}
                              tabIndex={r.oid < 0 ? undefined : 0}
                              onKeyDown={r.oid < 0 ? undefined : (e) => {
                                if (e.key !== 'Enter' && e.key !== ' ') return;
                                e.preventDefault();
                                setSel(r.oid);
                                setModal(r.oid);
                              }}
                              aria-label={`${fixCyr(r.work) || r.no} · ${sc.bld[blk]} · ${msToDay(sp.start)} → ${msToDay(sp.end)}`}
                              title={`${fixCyr(r.work)}\n${sc.bld[blk]} · ${msToDay(sp.start)} → ${msToDay(sp.end)} (${tr('{0} хоног', spanDays(sp))}) · ${stText(st)}`}
                            >
                              {!r.group && (
                                <span className={h.plGrip} onPointerDown={(e) => onDown(e, r, 'l')} />
                              )}
                              {!half && spanDays(sp) * px > 100 ? (
                                <span className={`${h.plBarLab} ${h.plBarTwo}`}>
                                  {spanDays(sp) * px > 250 && (
                                    <span className={h.plBarName}>{fixCyr(r.work) || r.no}</span>
                                  )}
                                  <span className={h.plBarWhen}>
                                    <span>{msToDay(sp.start)}</span>
                                    <span>{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}</span>
                                  </span>
                                </span>
                              ) : spanDays(sp) * px > 250 ? (
                                <span className={h.plBarLab}>
                                  <span className={h.plBarName}>{fixCyr(r.work) || r.no}</span>
                                  <span className={h.plBarWhen}>
                                    {msToDay(sp.start)}→{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}
                                  </span>
                                </span>
                              ) : spanDays(sp) * px > 178 ? (
                                <span className={h.plBarLab}>
                                  {msToDay(sp.start)}→{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}
                                </span>
                              ) : spanDays(sp) * px > 118 ? (
                                <span className={h.plBarLab}>
                                  {short(sp.start)}→{short(sp.end)} · {spanDays(sp)}{tr('х')}
                                </span>
                              ) : spanDays(sp) * px > 40 ? (
                                <span className={h.plBarLab}>{spanDays(sp)}{tr('х')}</span>
                              ) : null}
                              {!r.group && (
                                <span className={`${h.plGrip} ${h.plGripR}`}
                                  onPointerDown={(e) => onDown(e, r, 'r')} />
                              )}
                              {/* ХОЛБОХ БАРИУЛ — баруун захын дугуй; чирээд нөгөө мөр дээр тавина (2026-09-22). */}
                              {canEdit && !locked && kind === 'plan' && (
                                <span className={h.plLink}
                                  onPointerDown={(e) => startLink(e, r)}
                                  title={tr('Хамаарал холбох — чирээд дараагийн ажлын мөр дээр тавина (FS)')} />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* ── УЯЛДААНЫ СУМУУД ── */}
                    {(arrows.length > 0 || link) && (
                      <svg className={`${h.depSvg} ${link ? h.depSvgLink : ''}`} width={W} height={disp.length * PL_ROW} aria-hidden>
                        <defs>
                          {[h.depArrN, h.depArrH, h.depArrB].map((c, k) => (
                            <marker key={c} id={`hvDepArr${k}`} viewBox="0 0 6 6" refX="5" refY="3"
                              markerWidth="5.5" markerHeight="5.5" orient="auto">
                              <path d="M0 0 L6 3 L0 6 z" className={c} />
                            </marker>
                          ))}
                        </defs>
                        {arrows.map((a2) => (
                          <g key={a2.key}>
                            <path d={a2.d} className={a2.cls} markerEnd={a2.mk} />
                            {canEdit && !locked && kind === 'plan' && !a2.x && (
                              <path d={a2.d} className={h.depHit}
                                onClick={(e) => { e.stopPropagation(); setLinkAsk({ so: plan[a2.si].oid, to: plan[a2.ti].oid, dblks: a2.dblk == null ? null : [a2.dblk] }); }}>
                                <title>{tr('Дарж засах / устгах')}</title>
                              </path>
                            )}
                          </g>
                        ))}
                        {/* ТҮР ШУГАМ — холбох чирэлтийн үед урд ажлын баруун захаас курсор хүртэл */}
                        {link && (() => {
                          const k = visible.findIndex((v) => v.i === link.i);
                          const ps = k >= 0 ? effAt(link.i) : null;
                          if (!ps) return null;
                          const sx = xOf(ps.end + DAY);
                          const sy = k * PL_ROW + PL_ROW / 2;
                          return <path d={`M ${sx} ${sy} L ${link.x} ${link.y}`} className={h.depDraft} markerEnd="url(#hvDepArr1)" />;
                        })()}
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      {linkAsk && linkRows && (
        <LinkModal
          src={linkRows.s}
          dst={linkRows.t}
          blks={linkAsk.dblks}
          blocks={sc?.bld ?? []}
          onClose={() => setLinkAsk(null)}
          onRemove={() => {
            const { s, t } = linkRows;
            setLinkAsk(null);
            if (s.des == null) return;
            const code = s.des;
            const ids = linkAsk.dblks ?? [undefined];
            applyModal(t.oid, null, t.deps.filter((d) => !ids.some((b) => sameDep(d, { code, blk: b }))), null);
          }}
          onApply={(type, lag) => {
            const { s, t } = linkRows;
            setLinkAsk(null);
            if (s.des == null) return;
            const code = s.des;
            /* Ижил (код, блок)-ийн хуучин уялдааг сольж бичнэ — нэг хос нэг удаа. */
            const ids = linkAsk.dblks ?? [undefined];
            const keep = t.deps.filter((d) => (linkAsk.collapse
              ? d.code !== code
              : !ids.some((b) => sameDep(d, { code, blk: b }))));
            const add: Dep[] = ids.map((b) => ({ code, type, lag, ...(b != null ? { blk: b } : {}) }));
            applyModal(t.oid, null, [...keep, ...add], null);
          }}
        />
      )}

      {modalRow && sc && (
        <PlanModal
          r={modalRow}
          par={modalPar}
          blocks={sc.bld}
          blk={blk}
          initSel={gBlks}
          takt={takt}
          canEdit={canEdit && !locked && !busy}
          onBlk={setBlk}
          onTakt={setTakt}
          cands={depCands}
          hasHam={!!sc.f.ham && kind === 'plan'}
          hamKeep={residualDeps(ham.get(modalRow.oid) ?? rowsAll.find((x) => x.oid === modalRow.oid)?.ham ?? null)}
          hasActual={hasActual}
          hasRes={hasRes}
          obyem={kind === 'plan' && obState === 'ok'}
          months={obOf(modalRow.des, sc.bld[blk] ?? "")}
          badBlks={modalBad}
          geree={kind === 'plan' ? refSpanOf(modalRow.oid, blk) : null}
          res={obResOf(modalRow.des, sc.bld[blk] ?? "")}
          resFields={obResFields}
          xLock={modalRow.group ? undefined : xLockWhy(modalRow.oid, modalRow.des)}
          onClose={undoDragOnClose}
          dragged={dragOpen === modalRow.oid}
          onKeep={keepDragClose}
          onShiftGroup={modalRow.group ? (d, bs) => shiftGroup(modalRow.oid, d, bs) : undefined}
          onUndo={markUndo}
          returnFocus={modalFrom === modalRow.oid
            ? () => document.querySelector<HTMLElement>(`[data-oid="${modalRow.oid}"] .${h.rowMain}`)
            : undefined}
          onApply={(spans, deps, ob, actual, res, blks, actBlks) => {
            undoMergeRef.current = undoRef.current != null || undoOpenRef.current === modalRow.oid;
            if (undoRef.current != null) undoOpenRef.current = modalRow.oid;
            undoRef.current = null;
            forgetDrag();
            try {
              applyModal(modalRow.oid, spans, deps, ob, blks);
              /* Бодит огноо · нөөц — гинжээс гадуур, ноорогт л (2026-09-23). */
              applyExtra(modalRow.oid, actBlks, actual, res);
            } finally {
              undoMergeRef.current = false;
            }
          }}
        />
      )}

      {flowBox === 'send' && (
        <FlowBox
          title={tr('Хуваарь батлуулах')}
          desc={tr('{0} мөрийн өөрчлөлт батлагчид илгээгдэнэ. Батлагдтал эх хуваарь хөдлөхгүй.', num(dirtyRows))}
          label={tr('Тайлбар (сонголтоор)')}
          okText={tr('Илгээх')}
          busy={busy}
          err={err}
          text={flowTxt}
          onText={setFlowTxt}
          onClose={() => setFlowBox(null)}
          onOk={(txt) => void sendForApproval(txt)}
          progress={progress}
          summary={changes.length > 0 ? (
            <>
              {(() => {
                const me = (user?.username ?? '').trim().toLowerCase();
                const last = new Map<number, { at: number; user: string }>();
                for (const [k, m] of hdMeta.current) {
                  const p = parseKey(k);
                  if (!p) continue;
                  let oid: number | undefined;
                  if (p.type === 'm' || p.type === 'n') {
                    const i = byCode.get(Number(p.key.slice(0, p.key.indexOf('|'))));
                    oid = i != null ? plan[i]?.oid : undefined;
                  } else oid = p.oid;
                  if (oid == null || !dirtyOids.has(oid)) continue;
                  const cur = last.get(oid);
                  if (!cur || m.at > cur.at) last.set(oid, m);
                }
                const by = new Map<string, number>();
                for (const m of last.values()) if (m.user && m.user !== me) by.set(m.user, (by.get(m.user) ?? 0) + 1);
                if (!by.size) return null;
                return (
                  <p className={h.note} role="status">
                    {tr('Хамтрагчийн засвар орно: {0}', [...by].map(([u, c]) => tr('{0}-ийн {1} мөр', u, num(c))).join(', '))}
                  </p>
                );
              })()}
              <ul className={h.chgPanel} aria-label={tr('Илгээгдэх өөрчлөлт')}>
                {changes.slice(0, 50).map((c) => (
                  <li key={c.oid} className={h.chgItem}>
                    <b>{c.no} {fixCyr(c.work)}</b>{' '}
                    <span className={h.muted}>{chgText(c)}</span>
                  </li>
                ))}
                {changes.length > 50 && <li className={h.muted}>{tr('… ба {0}', num(changes.length - 50))}</li>}
              </ul>
            </>
          ) : undefined}
        />
      )}
      {flowBox === 'decide' && pending && (
        <FlowBox
          title={tr('Хуваарь шийдвэрлэх')}
          desc={tr('{0} мөрийн хуваарийг {1} илгээв.', num(pending.rowCount), pending.author)
            + (pending.note ? ` — «${pending.note}»` : '')
            + (previewing
              ? ` ${tr('Санал хуанли дээр харагдаж байна.')}`
                + (reviewOids.length ? ` ${tr('Зөвшөөрсөн {0}/{1} мөр', num(reviewOk), num(reviewOids.length))}` : '')
              : ` ${tr('⚠️ Хараахан урьдчилан хараагүй байна — «Урьдчилан харах»-аар шалгаж болно.')}`)}
          label={tr('Буцаах шалтгаан (буцаахад заавал)')}
          okText={tr('Батлах')}
          rejectText={tr('Буцаах')}
          busy={busy}
          err={err}
          text={flowTxt}
          onText={setFlowTxt}
          onPreview={previewing || previewBad === pending.oid ? undefined : () => void preview()}
          onClose={() => setFlowBox(null)}
          progress={progress}
          okDisabled={isOwnSubmission
            ? tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.')
            : previewBad === pending.oid
              ? tr('Санал одоогийн хуваарьтай зөрчилдсөн эсвэл агуулга нь уншигдсангүй тул зөвхөн буцаах боломжтой.')
              : frameOld
                ? tr('Хуудасны сүүлийн хувилбар бүрэн хадгалагдаагүй тул батлах боломжгүй — өмнөх хувилбар ({0}) дээр харсан санал. Цэвэрлэгдсэний дараа дахин оролдоно уу.', frameOld.shownDay)
                : !previewing
                  ? tr('Эхлээд «Урьдчилан харах» дарж саналыг хуанли дээр шалгаад, өөрчлөгдсөн мөр бүрийг ногоон болгоно.')
                  : reviewOids.length > 0 && !allOk
                    ? tr('Өөрчлөгдсөн мөр бүрийг ногоон болгосны дараа батална.')
                    : obOut.bad > 0 ? obOutMsg : undefined}
          onOk={async (txt) => {
            if (txt.trim() && !(await askConfirm(tr('Бичсэн тайлбар батлахад хадгалагдахгүй. Үргэлжлүүлэх үү?'), { ok: tr('Батлах') }))) return;
            void decide(true, '');
          }}
          onReject={(txt) => {
            const own = txt.trim();
            if (!own) return;
            if (previewing) { void decide(false, txt, reviewOids.filter((o) => okRows.has(o))); return; }
            if (previewBad === pending.oid) { void decide(false, own, undefined); return; }
            const blind = BLIND_NOTE;
            void decide(false, `${own.slice(0, Math.max(0, REASON_MAX - blind.length - 1))}\n${blind}`, []);
          }}
        />
      )}
      {ajBox && canAddRow && !ajSub && adds.length > 0 && (
        <FlowBox
          title={tr('Нэмэлт ажил батлуулах')}
          desc={tr('{0} шинэ ажлын мөр батлагчид илгээгдэнэ. Батлагдтал үндсэн өгөгдөлд бичигдэхгүй.', num(adds.length))}
          label={tr('Батлагчид тайлбар (сонголтоор) — яагаад нэмэх шаардлагатай вэ')}
          okText={tr('Илгээх')}
          busy={ajBusy}
          err={ajErr}
          text={ajTxt}
          onText={setAjTxt}
          onClose={() => setAjBox(false)}
          okDisabled={ajOrphans.length > 0 ? orphanAddsMsg(ajOrphans.length) : undefined}
          onOk={(txt) => { void sendAjil(txt).then((ok) => { if (ok) { setAjBox(false); setAjTxt(''); } }); }}
          summary={(
            <ul className={h.chgPanel} aria-label={tr('Илгээгдэх мөрүүд')}>
              {adds.slice(0, 50).map((a) => (
                <li key={a.oid} className={h.chgItem}>
                  <b>{a.no} {fixCyr(a.work)}</b>{' '}
                  <span className={h.muted}>{tr('эцэг: {0}', `${a.parentNo} ${a.parentWork}`.trim() || '—')}</span>
                </li>
              ))}
              {adds.length > 50 && <li className={h.muted}>{tr('… ба {0}', num(adds.length - 50))}</li>}
            </ul>
          )}
        />
      )}
      {flowBox === 'reject' && pending && (
        <FlowBox
          title={tr('Хуваарь буцаах')}
          desc={reviewOids.length
            ? tr('Зөвшөөрсөн {0}/{1} мөр. Зөвшөөрөөгүй мөрүүд шалтгаанд автоматаар жагсагдаж, гүйцэтгэгчид УЛААН болж харагдана.', num(reviewOk), num(reviewOids.length))
            : tr('{0} мөрийн хуваарийг {1} илгээв.', num(pending.rowCount), pending.author)}
          label={tr('Буцаах шалтгаан (заавал)')}
          okText={tr('Буцаах')}
          busy={busy}
          err={err}
          text={flowTxt}
          onText={setFlowTxt}
          onClose={() => setFlowBox(null)}
          progress={progress}
          onOk={(txt) => rejectReview(txt)}
        />
      )}
    </div>
  );
}


