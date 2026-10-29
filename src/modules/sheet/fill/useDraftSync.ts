import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Pkg, Schema } from "../bagts.pkg";
import { editPct, fmtInc, isPctEdit, parseInc, type SheetRow } from "../bagtsSheet";
import {
  clearLegacyDrafts, readLegacyDrafts, type RemoteDraftRead,
} from "@/lib/draftRemote";
import {
  clearRemoteDraft, readRemoteDraft, readRemoteDraftAt, saveRemoteDraft, REMOTE_MAX, remoteMax, setFillFrame,
} from "@/lib/fillStore";
import { t as tr } from "@/lib/i18nCore";
import { fixCyr } from "@/lib/format";
import { askConfirm } from "@/lib/confirm";
import { userError } from "@/components/ui";
import {
  type Draft, LOCAL_DRAFT_TTL_MS, REMOTE_DEBOUNCE_MS, REMOTE_CAP_MS, REMOTE_RETRY_MS, DEL_TTL_MS,
  parseDraft, mergeDrafts, readDraft, saveDraftLS, clearDraftLS, marksOf, doneOfMarks, type Mark,
  /* 2026-10-04 аудит */
  writeDraftLS, markUnsynced, clearUnsynced, isUnsynced, rcptApply, type Rcpt,
  /* 2026-10-04 дахин аудит — шахсан баримт · тэмдэглэсэн нүд · ЧИМЭЭГҮЙ хасалтын анхааруулга */
  packRcpt, unpackRcpt, compactDraft, rcptSilentDrop, rcptAlive,
  /* 2026-10-09 — хоёр хүн зэрэг бөглөх (шинэ баримт · эзэмшил · HLC · өөрчлөгдсөн өөрийн нүд) */
  newReceipts, claimMine, editStamp, lostMine,
  /* 2026-10-09 (аудит №3) — буцаагдсан илгээлтийн засварын зорилтын шүүлт */
  offTarget,
} from "./draft";
import { mapOldOids, rowOccOf } from "../sheetFrame";
import { dt, synNoVol, type NoticeKind, type RemoteState } from "./util";

/**
 * ТЭМДЭГЛЭСЭН (буулгаагүй) НҮД — `heldRef` / `Draft.hold` (2026-10-04 дахин аудит, #7 · #3).
 * `v` утга · `at` хуулбарын агшин (`byAt`) · `by` эзэн · `since` тэмдэглэсэн агшин · `force` (#3 —
 * ямар ч клиент сэргээхгүй) · `why` шалтгаан · `rk`/`occ` — мөр нь ОДООГИЙН жаазад байхгүй үед
 * ноорогийн танигчийг хадгалж бичихэд (`rowKeys`/`rowOcc`).
 */
type Held = {
  v: string; at: number; by?: string; since: number; force: 0 | 1;
  why: 'ambig' | 'srv' | 'drop' | 'old' | 'tgt'; rk?: string; occ?: [number, number, number];
  /** Огнооны суурь (`Draft.datesB`, #8) — серверт өөрчлөгдсөн огноонд */
  b?: string;
};
const heldVisN = (m: ReadonlyMap<string, Held>) => { let n = 0; for (const h of m.values()) if (h.why !== 'tgt') n += 1; return n; };
type PickRes = { changed: boolean; rcpt: number };

/**
 * СЕРВЕРИЙН ИЛГЭЭЛТЭЭС ГАРГАСАН БАРИМТ (2026-10-09) — ЦЭВЭР. Илгээгчийн (А) `pushReceipts` унасан бол хамтран
 * бөглөгч (Б) А-гийн илгээсэн нүдний баримтыг ХЭЗЭЭ Ч авахгүй байв: Б-гийн сэргээлт тэдгээрийг «илгээгээгүй» гэж
 * буцааж, дахин илгээхэд нэмэлтийн горимд ДАВХАР тоологдоно. Одоо ачаалах ба `refreshStaged`-д серверийн `sub|`
 * payload-оос (нүд · огноо, илгээлтийн `at`) баримт гаргана — А-гийн табаас ҮЛ ХАМААРАН.
 */
export function subReceipts(
  p: { at: number; cells: readonly [string, string][]; dates: readonly [string, string][] },
  known: ReadonlyMap<string, Rcpt>,
): Rcpt[] {
  if (!Number.isFinite(p.at) || p.at <= 0) return [];
  const out: Rcpt[] = [];
  for (const [k] of [...p.cells, ...p.dates]) {
    const c = known.get(k);
    if (c && c[1] >= p.at) continue;
    if (c && c[2] !== '') continue;
    out.push([k, p.at, '', p.at]);
  }
  return out;
}
/**
 * Хоёр баримтаас ХОЖУУ (`a` их) нь — серверээс гаргасан (`subReceipts`) баримт жинхэнэ шинэ баримтыг дарахгүй.
 */
const newerRc = (a: Rcpt | undefined, b: Rcpt | undefined): Rcpt | undefined => {
  if (!a) return b;
  if (!b) return a;
  const ax = a[2] !== '';
  const bx = b[2] !== '';
  if (ax !== bx) return ax ? a : b;
  return b[1] > a[1] ? b : a;
};

const frameSeenFor = (fs: readonly [number, number] | null, minOid: number | null): number | null =>
  fs && fs[0] === minOid ? fs[1] : null;

/**
 * Ноорогийн бүх төлөв (ref · state) ЭНД зарлагдана — FillNew-ийн ачаалах эффект, `publish`,
 * `commitDate` тэдгээрийг буцаах утгаас авна. Эффектүүдийн дараалал FillNew-ийнхтэй ижил
 * (сэргээх → хадгалах → алсын → unmount → татах → unload); FillNew энэ hook-ийг яг тэр байрлалд дуудна.
 */
export function useDraftSync(p: {
  pkg: Pkg;
  user: { username: string } | null;
  busy: boolean;
  rows: SheetRow[];
  sc: Schema | null;
  nBld: number;
  canPerf: boolean;
  noEdit: boolean;
  asOf: number | null;
  asOfOrig: number | null;
  setAsOf: Dispatch<SetStateAction<number | null>>;
  pending: Record<string, string>;
  setPending: Dispatch<SetStateAction<Record<string, string>>>;
  pendDate: Record<string, string>;
  setPendDate: Dispatch<SetStateAction<Record<string, string>>>;
  dirtyCount: number;
  pvDirty: number;
  fillMode: "obyem" | "pct";
  /** ЯГ ОДОО `rows`/`sc` төлөвт СУУСАН багцын түлхүүр (FillNew) */
  loadedPkgRef: RefObject<string>;
  /** ОДОО сонгогдсон багцын түлхүүр — синхрон (FillNew) */
  pkgKeyRef: RefObject<string>;
  /** Нээлттэй нүдний толь — татах мөчлөг «одоо бичиж байна уу» гэдгийг эндээс уншина */
  editRef: RefObject<unknown>;
  /**
   * Нүд нээлттэй эсэх — РЕАКТИВ хувилбар (2026-10-01). Нүд нээлттэй үед хойшлуулсан
   * нүдний нийлүүлэлтийг (`deferredRef`) хаагдмагц ШУУД буулгахад.
   */
  editOpen: boolean;
  /**
   * ОДООГИЙН илгээлтийн ЗОРИЛТ — буцаагдсан илгээлт `[OBJECTID, fillMs]` эсвэл `null` (өнөөдөр),
   * 2026-10-04 аудит (#6, `Draft.tgt`). Дуудагч `useMemo`-оор тогтвортой дамжуулна.
   */
  curTgt: [number, number] | null;
  show: (kind: NoticeKind, msg: string) => void;
  say: (msg: string) => void;
  soft?: (msg: string) => void;
  stick?: (msg: string) => void;
  onReceipts?: (at: number) => void;
  flashCells?: (keys: string[]) => void;
  visibleKeys?: (keys: string[]) => string[];
  okLock?: (oid: number, b: number) => boolean;
}) {
  const {
    pkg, user, busy, rows, sc, nBld, canPerf, noEdit, asOf, asOfOrig, setAsOf,
    pending, setPending, pendDate, setPendDate, dirtyCount, pvDirty, fillMode, loadedPkgRef, pkgKeyRef, editRef, editOpen, curTgt, show, say,
  } = p;
  const cbRef = useRef({ soft: p.soft, onReceipts: p.onReceipts, flashCells: p.flashCells, visibleKeys: p.visibleKeys, okLock: p.okLock, stick: p.stick });
  useEffect(() => {
    cbRef.current = { soft: p.soft, onReceipts: p.onReceipts, flashCells: p.flashCells, visibleKeys: p.visibleKeys, okLock: p.okLock, stick: p.stick };
  }, [p.soft, p.onReceipts, p.flashCells, p.visibleKeys, p.okLock, p.stick]);
  const curTgtRef = useRef(curTgt);
  useEffect(() => { curTgtRef.current = curTgt; }, [curTgt]);
  const pendingRef = useRef(pending);
  const pendDateRef = useRef(pendDate);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => { pendDateRef.current = pendDate; }, [pendDate]);
  const volMode = (r: { group: boolean; vol?: number | null }, b: number) =>
    !r.group && (fillMode === "pct" || !!sc?.obyem[b]) && !synNoVol(sc, r);
  /**
   * НООРОГ СҮҮЛД ХАДГАЛАГДСАН АГШИН (ms) — зөвхөн дэлгэцийн баталгаа.
   */
  const [savedAt, setSavedAt] = useState<number | null>(null);
  /**
   * НООРОГИЙН ХОЁР ТУГ — багц солих эффект ЭДГЭЭРИЙГ цэвэрлэдэг тул
   * түүнээс ДЭЭР зарлагдана (эс бөгөөс зарлагдахаасаа өмнө ашиглагдана).
   * · `keepDraft` — «Дараа шийднэ» гэж хаасан ноорогийг автомат
   *   цэвэрлэлтээс хамгаална (НЭГ багцад л хамаарна).
   * · `remoteQueue` — алсад илгээх ээлж; багцын тамгатай тул хуучин багцын
   *   ноорог шинэ багцын слотод хэзээ ч бичигдэхгүй.
   */
  const keepDraft = useRef(false);
  const remoteQueue = useRef<{ pkg: string; draft: Draft } | null>(null);
  /** Алсын илгээлтийн цохилт ба «хэт том» тэмдэг — дээрх эффектүүд ашиглана */
  const [remoteTick, setRemoteTick] = useState(0);
  /**
   * СЭРГЭЭЛТ ЯВАГДАЖ БАЙНА — хадгалах эффектийн «хоосон → устга» замыг
   * ТҮР ХААНА (2026-09-08).
   *
   * `true` байхад хадгалах эффект хоосон төлөвийг ҮЛ ТООНО; сэргээлт дуусаад
   * (буусан, эсвэл сэргээх зүйлгүй нь батлагдсан) `false` болно.
   */
  const restoring = useRef(false);
  /**
   * ЭНЭ СЕШНД ГАРААС бөглөсөн нүднүүд (`${oid}:${блок}`) — 2026-09-08.
   */
  const mineRef = useRef<Set<string>>(new Set());
  /**
   * ӨӨРИЙН НҮД БҮРИЙГ СҮҮЛД ХӨНДСӨН АГШИН (`key` → ms) — 2026-09-21.
   * `Draft.byAt`-д бичигдэж, (а) `waitingOn`-ийн «3 хоног идэвхгүй» шүүлт,
   * (б) `mergeDrafts`-ийн tombstone (`del`) харьцуулалт хоёуланд хэрэглэгдэнэ.
   */
  const mineAtRef = useRef<Map<string, number>>(new Map());
  /**
   * ЛОГИК ЦАГ (HLC) — 2026-10-01 (хэрэглэгч: бүгдийг зас).
   */
  const clockRef = useRef(0);
  const stamp = useCallback(() => {
    const t = Math.max(Date.now(), clockRef.current + 1);
    clockRef.current = t;
    return t;
  }, []);
  /** Нийлүүлэлтээр ирсэн агшнуудаар логик цагийг урагшлуулна */
  const seeClock = useCallback((d: Draft) => {
    let m = clockRef.current;
    const see = (x: unknown) => { const n = Number(x); if (Number.isFinite(n) && n > m && n < Date.now() + 366 * 86_400_000) m = n; };
    for (const [, a] of d.byAt ?? []) see(a);
    for (const [, a] of d.del ?? []) see(a);
    for (const mk of d.marks ?? []) see(mk[3]);
    see(d.asOfAt);
    for (const e of d.tgt ?? []) see(e[3]);
    clockRef.current = m;
  }, []);
  const seenAtRef = useRef<Map<string, number>>(new Map());
  const stampKey = useCallback((key: string) => {
    const s = seenAtRef.current.get(key);
    const ok = s != null && s < Date.now() + 366 * 86_400_000 ? s : undefined;
    const t = editStamp(stamp(), ok);
    if (t > clockRef.current) clockRef.current = t;
    return t;
  }, [stamp]);
  /**
   * «ДУУСГАСАН/ДАХИН ЗАСАХ» ИЛ ТЭМДГҮҮД — нэр → `[нэр, 1|0, seq, агшин]` (2026-10-01,
   * `Draft.marks`). `doneRef`/`doneBy` нь эндээс ГАРГАСАН хуулбар.
   */
  const marksRef = useRef<Map<string, Mark>>(new Map());
  /**
   * НҮД НЭЭЛТТЭЙ ҮЕД ХОЙШЛУУЛСАН алсын ноорог (2026-10-01). Эзэмшил/«дуусгасан» нь
   * ШУУД буудаг, харин нүдний утга нүд хаагдмагц (`editOpen` false) буулгагдана.
   */
  const deferredRef = useRef<{ pkg: string; d: Draft } | null>(null);
  /** СЭРГЭЭЛТ ЭХЭЛСЭН логик агшин — тэр хооронд гараас бичсэн нүдийг дарахгүй (`pickDraft`) */
  const restoreSinceRef = useRef(0);
  /** Сэргээлтэд уншсан АЛСЫН хувилбар (`at`) — `safeClearRemote`-ийн тулгалт (2026-10-04, #10) */
  const restoreAtRef = useRef(0);
  /**
   * СЭРГЭЭЛТ ДУУССАН багц (2026-10-01) — `restoringUi`: тэр хүртэл нүд ТҮГЖИГДЭЖ
   * «Ноорог сэргээж байна…» гэж харагдана (бичсэн нүд сэргээлтэд дарагдахгүй).
   */
  const [restDonePkg, setRestDonePkg] = useState('');
  /** Сүлжээгүй (офлайн) эсэх — хөтчийн `online/offline` үйл явдлаар (2026-10-01) */
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    /* Анхны төлөв — эффектээс СИНХРОН setState хийхгүй (lint), микро даалгавраар */
    void Promise.resolve().then(() => setOffline(navigator.onLine === false));
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  /**
   * TOMBSTONE — ЭНЭ СЕШНД БУЦААСАН/ХАССАН зүйлс (`key` → хассан агшин ms),
   * 2026-09-21-ний аудит. Түлхүүр нь нүд/огнооных (`${oid}:${b}[:s|e]`) эсвэл
   * хассан нэмэлт мөрийнх (`a:${oid}`). `Draft.del`-д бичигдэж, `mergeDrafts`
   * нөгөө талын ХУУЧИН хуулбараас тэр нүд/мөрийг СЭРГЭЭХГҮЙ болгоно — урьд нь
   * нийлүүлэлт зөвхөн нэмдэг тул нүд буцаах, мөр хасах нь дараагийн тойрогт
   * эргэж ирдэг байв.
   */
  const delRef = useRef<Map<string, number>>(new Map());
  /**
   * ИЛГЭЭЛТИЙН БАРИМТУУД (`Draft.rcpt`, 2026-10-04 аудит #4) — `түлхүүр → [түлхүүр, a, sv, sa]`.
   */
  const rcptRef = useRef<Map<string, Rcpt>>(new Map());
  const noteSubReceipts = useCallback((p: Parameters<typeof subReceipts>[0]) => {
    for (const rc of subReceipts(p, rcptRef.current)) {
      rcptRef.current.set(rc[0], rc);
      if ((seenAtRef.current.get(rc[0]) ?? 0) < rc[1]) seenAtRef.current.set(rc[0], rc[1]);
    }
  }, []);
  /** Нүд бүрийн СУУРЬ БАРИМТ (`Draft.bt`) — бичих агшинд мэдэгдэж байсан баримтын агшин */
  const btRef = useRef<Map<string, number>>(new Map());
  /** Энэ сешнд АНХААРУУЛСАН зөрүүтэй нүд (`Draft.conv`) — `${түлхүүр}@${a}` (давтан хэлэхгүй) */
  const convSeenRef = useRef<Set<string>>(new Set());
  /** Огнооны СУУРЬ (`Draft.datesB`, #8) — анх засах үеийн серверийн утга */
  const datesBRef = useRef<Map<string, string>>(new Map());
  /** «Шинэчлэгдсэн огноо»-ны СУУРЬ (`Draft.asOfB`, #8); `undefined` = мэдэгдэхгүй/өөрчлөөгүй */
  const asOfBRef = useRef<number | null | undefined>(undefined);
  /**
   * НООРОГИЙН ЗОРИЛТОТ ИЛГЭЭЛТ (`Draft.tgt`, 2026-10-04 аудит #6) — `[OBJECTID, fillMs]`.
   */
  const [draftTgt, setDraftTgt] = useState<[number, number] | null>(null);
  const draftTgtRef = useRef<[number, number] | null>(null);
  useEffect(() => { draftTgtRef.current = draftTgt; }, [draftTgt]);
  /**
   * ХҮН БҮРИЙН ЗОРИЛТ (`Draft.tgt`, 2026-10-04 дахин аудит #4) — нэр → `[нэр, OBJECTID, fillMs, агшин]`.
   */
  const tgtsRef = useRef<Map<string, [string, number, number, number]>>(new Map());
  /** ӨӨРИЙН зорилтыг ИЛ цэвэрлэнэ (OBJECTID 0, шинэ агшин — нийлүүлэлтэд ялна) — илгээсэн/ноорог устгасны дараа */
  const clearMyTgt = useCallback(() => {
    const me = user?.username?.trim().toLowerCase() ?? '';
    if (me && tgtsRef.current.get(me)?.[1]) tgtsRef.current.set(me, [me, 0, 0, stamp()]);
    setDraftTgt(null);
  }, [user?.username, stamp]);
  /**
   * ТЭМДЭГЛЭСЭН (буулгаагүй) НҮД (`Draft.hold`, 2026-10-04 дахин аудит #7 · #3) — түлхүүр → мэдээлэл.
   */
  const heldRef = useRef<Map<string, Held>>(new Map());
  const [heldN, setHeldN] = useState(0);
  /** Анхааруулсан тэмдэглэсэн түлхүүрүүд — дахин анхааруулахгүй (2026-10-04 дахин аудит #7) */
  const heldWarnedRef = useRef<Set<string>>(new Set());
  /**
   * «ТЭМДЭГЛЭСЭН НҮДИЙГ ХАЯХ» (2026-10-04 дахин аудит, #7) — ЗӨВХӨН тэмдэглэсэн нүдийг tombstone-той
   * хаяна (бусад хуулбараас сэргэхгүй); илгээгээгүй ногоон нүд ХӨНДӨГДӨХГҮЙ (тэр нь «Ноорог устгах»).
   */
  const dropHeld = useCallback(() => {
    if (!heldRef.current.size) return;
    const a = stamp();
    const keep = new Map<string, Held>();
    for (const [k, h] of heldRef.current) {
      if (h.why === 'tgt') { keep.set(k, h); continue; }
      if ((delRef.current.get(k) ?? 0) < a) delRef.current.set(k, a);
    }
    heldRef.current = keep;
    setHeldN(0);
    /* Хадгалах эффектийг дахин ажиллуулна — tombstone ноорогт (локал + алс) бичигдэнэ */
    setPending((p) => ({ ...p }));
  }, [stamp, setPending]);
  const lostSeenRef = useRef<Set<string>>(new Set());
  /** Багц солиход — тэмдэглэсэн нүд ба зорилт БАГЦЫН төлөв (FillNew-ийн цэвэрлэгээ) */
  const resetHeldTgt = useCallback(() => {
    heldRef.current = new Map();
    setHeldN(0);
    tgtsRef.current = new Map();
    seenAtRef.current = new Map();
    lostSeenRef.current = new Set();
  }, []);
  /**
   * ОДООГИЙН ЖААЗНЫ хамгийн бага эерэг OBJECTID — `compactDraft`-ийн «хуучин жаазны баримт»-ыг таних
   * (жааз бүр өсөх oid-той хуулагддаг). `null` = мөр ачаалагдаагүй (шахалт хуучин жаазыг хөндөхгүй).
   */
  const minOidRef = useRef<number | null>(null);
  const frameSeenRef = useRef<[number, number] | null>(null);
  useEffect(() => {
    let m = Number.POSITIVE_INFINITY;
    for (const r of rows) if (r.oid >= 0 && r.oid < m) m = r.oid;
    minOidRef.current = Number.isFinite(m) ? m : null;
    if (Number.isFinite(m) && frameSeenRef.current?.[0] !== m) frameSeenRef.current = [m, Date.now()];
    if (loadedPkgRef.current && rows.length) setFillFrame(loadedPkgRef.current, rows, sc?.bld ?? []);
  }, [rows, sc, loadedPkgRef]);
  /**
   * ЛОКАЛ ХАДГАЛАЛТ УНАСАН (сан дүүрсэн/хаалттай) — 2026-10-04 аудит (#9). Урьд нь `saveDraftLS`
   * алдааг залгиж «ноорог хадгалагдав» гэж ХУДАЛ баталдаг байв.
   */
  const [localFail, setLocalFail] = useState(false);
  /** Алсын бичилт УНАСАН/мөргөлдсөн өөр багцыг НЭГ л удаа хэлнэ (`flush(pkgKey)`, #5) */
  const staleWarnedRef = useRef<Set<string>>(new Set());
  /** `show`-ийн ref — алсын эффект (`[remoteTick, …]`) хамааралгүйгээр дуудна (debounce эвдэхгүй) */
  const showRef = useRef(show);
  useEffect(() => { showRef.current = show; }, [show]);
  /**
   * «ШИНЭЧЛЭГДСЭН ОГНОО»-НЫ БУЦААЛТЫН TOMBSTONE (2026-09-25-ны аудит).
   * `true` = энэ сешнд `asOf` ноорогт ӨӨРЧЛӨГДСӨН утгаар бичигдсэн — тиймээс
   * анхны утгандаа буцахад ноорог `asOf: undefined` БИШ `asOf: null` (ИЛ
   * буцаалт) бичнэ. Урьд нь `undefined` = «хуучин талынхыг үлдээ»
   * (`mergeDrafts`) тул буцаалт алсад ХЭЗЭЭ Ч хүрэхгүй: алсын/бусад төхөөрөмжийн
   * X огноо дараагийн нийлүүлэлтээр сэргэдэг байв. `pickDraft` нь `null`-ыг
   * «анхны утга руу буцаа» гэж уншина. Багц солиход тэглэгдэнэ.
   */
  const asOfRevRef = useRef(false);
  /**
   * «ШИНЭЧЛЭГДСЭН ОГНОО»-НЫ ЛОГИК АГШИН ( 2026-10-05, `Draft.asOfAt`). `v` = ноорогт
   * бичигдэх утга (`null` = ил буцаалт), `at` = түүнийг ТАВЬСАН агшин: энэ табд хэрэглэгч
   * өөрчилбөл `stamp`, ноорогоос (бусдаас) буусан бол ТЭР ноорогийн агшин — ингэснээр бусдын
   * тавьсан огноог дахин бичихдээ «шинэ» болгож хожуу засварыг дарахгүй. `at: undefined` =
   * агшингүй хуучин ноорогоос буусан (хуучин дүрмээр нийлнэ). Багц солиход тэглэгдэнэ (FillNew).
   */
  const asOfAtRef = useRef<{ v: number | null; at: number | undefined } | null>(null);
  /**
   * ЭНЭ СЕШНД ноорог ХООСОН БИШ байсан эсэх (2026-09-25-ны аудит). Хадгалах
   * эффектийн «хоосон → алсыг устга» зам ЗӨВХӨН хоосон биш → хоосон шилжилтэд
   * ажиллана. Урьд нь `pending` хоосон үед эффект ДАХИН ажиллах бүрд (жиш. `rows`
   * шинэчлэгдэх) `clearRemoteDraft` дуудагдаж, хараахан татаж амжаагүй бусад
   * оролцогчийн алсын ноорогийг арчдаг байв.
   */
  const draftLiveRef = useRef(false);
  /** Өөрийн нүдийг хөндсөнийг агшинтай нь тэмдэглэнэ; хуучин tombstone-ийг арилгана. */
  const touchMine = useCallback((key: string) => {
    mineAtRef.current.set(key, stampKey(key));
    delRef.current.delete(key);
    const rc = rcptRef.current.get(key);
    if (rc) btRef.current.set(key, rc[1]);
  }, [stampKey]);
  /**
   * ХАДГАЛАГДСАНТАЙ ИЖИЛ утга бичсэн (`sameVol`/`samePct`/`sameDate`/paste-ийн
   * `same`) — 2026-09-21-ний дахин аудит.
   */
  const revert = useCallback((key: string, wasPending: boolean) => {
    if (wasPending) {
      mineRef.current.add(key);
      delRef.current.set(key, stampKey(key));
    } else {
      mineAtRef.current.set(key, stampKey(key));
    }
  }, [stampKey]);
  /**
   * СҮҮЛД НИЙЛҮҮЛСЭН алсын ноорогийн агшин — давхар нийлүүлэлтээс сэргийлнэ.
   */
  const lastMergedRef = useRef(0);
  /**
   * ХУУЧИН (`хэрэглэгч|багц`) мөрүүд ШИЛЖИЖ, устгагдахаа хүлээж буй багц.
   */
  const legacyPendingRef = useRef<string>('');
  /**
   * «ДУУСГАСАН» ТЭМДЭГЛЭГЭЭ — ноорогийн ӨӨРИЙН төлөв (нэр → агшин).
   */
  const doneRef = useRef<[string, number][]>([]);
  /** «Дуусгасан» жагсаалт — дэлгэц зурахад (ref нь зурагдалт өдөөдөггүй) */
  const [doneBy, setDoneBy] = useState<[string, number][]>([]);
  /**
   * ИЛ ТЭМДГҮҮДИЙГ ТӨЛӨВТ буулгана — `marksRef` + гаргасан `doneRef`/`doneBy` (2026-10-01).
   */
  const applyMarks = useCallback((m: Map<string, Mark>) => {
    marksRef.current = m;
    const d = doneOfMarks(m);
    doneRef.current = d;
    setDoneBy(d);
  }, []);
  /**
   * БҮХ «ДУУСГАСАН» ТЭМДГИЙГ ИЛ БУЦААНА (2026-10-01) — «Илгээх»/«Ноорог устгах»-ийн дараа
   * шинэ мөчлөг эхэлнэ. Урьд нь `done: []` бичиж «нэр алга = буцаасан» дүрмээр
   * арчдаг байв; тэр дүрэм хүчингүй болсон тул тэмдэг бүрд `seq+1`-тэй «0» бичнэ —
   * өөр төхөөрөмжийн хуучин «дуусгасан» хуулбар СЭРГЭХГҮЙ.
   */
  const undoAllMarks = useCallback(() => {
    const m = new Map(marksRef.current);
    for (const [u, x] of m) if (x[1] === 1) m.set(u, [u, 0, x[2] + 1, stamp()]);
    applyMarks(m);
  }, [applyMarks, stamp]);
  /** Багц солих үеийн ЛОКАЛ цэвэрлэгээ — алсад юу ч бичихгүй */
  const resetMarks = useCallback(() => {
    applyMarks(new Map());
  }, [applyMarks]);
  /** Нүд бүрийн ЭЗЭН (`${oid}:${блок}` → нэр) — оролцогчийг тоолоход */
  const [byMap, setByMap] = useState<Map<string, string>>(new Map());
  /**
   * `byMap`-ийн ref толь — ноорог ХАДГАЛАХ эффект түүнийг эндээс уншина.
   */
  const byMapRef = useRef<Map<string, string>>(new Map());
  useEffect(() => { byMapRef.current = byMap; }, [byMap]);
  /**
   * Нүд бүрийг СҮҮЛД хөндсөн агшин (`${oid}:${блок}` → ms) — нийлүүлэлтээр
   * ирсэн (`Draft.byAt`), 2026-09-21. `waitingOn`-ийн идэвхгүй шүүлтэд.
   */
  const [byAtMap, setByAtMap] = useState<Map<string, number>>(new Map());
  const byAtRef = useRef<Map<string, number>>(new Map());
  useEffect(() => { byAtRef.current = byAtMap; }, [byAtMap]);
  /**
   * СҮҮЛД АЛСАД БИЧСЭН ноорогийн бүтэн текст — дэмий бичилтийг таслахад.
   */
  const lastBodyRef = useRef<string>('');
  /** Алсын уншилт унасан бол сэргээх эффектийг ДАХИН асаах цохилт */
  const [remoteRetry, setRemoteRetry] = useState(0);
  /**
   * АЛСЫН ХУУЛБАРЫН БАЙДАЛ (2026-09-06).
   */
  const [remoteState, setRemoteState] = useState<RemoteState>(null);
  /** Сүүлийн алсын илгээлтийн агшин — дээд хүлээлтийн (60 сек) лавлах цэг */
  const lastRemoteRef = useRef(0);
  const promptedPkgRef = useRef("");
  const restoreGenRef = useRef(0);
  /**
   * `flush`-ийн СҮҮЛИЙН хувилбарыг ref-д — unmount-ийн эффект (`[]` хамаарал)
   * түүнийг дуудна. Доорх эффект `remoteTick` бүрд `flush`-ыг дахин үүсгэдэг
   * тул unmount-ийн эффект тэр хаалтыг шууд барьж чадахгүй.
   */
  const flushRef = useRef<(pkgKey?: string) => void>(() => {});
  /**
   * АЛСЫН ХУУЛБАРЫГ ТҮГЖЭЭТЭЙ ХООСЛОНО (2026-10-04 аудит, #10) — `clearRemoteDraft`-ийн ОРОНД.
   */
  const safeClearRemote = useCallback(async (pkgKey: string, seenAt?: number) => {
    const at0 = await readRemoteDraftAt(pkgKey);
    if (at0 == null) return;
    /* `seenAt` — сэргээлтийн замд уншсан хувилбар (`restoreAtRef`); эс бөгөөс сүүлд нийлүүлсэн */
    const known = seenAt ?? lastMergedRef.current;
    if (!known || at0 !== known) return;
    const t = Math.max(stamp(), at0 + 1);
    const empty: Draft = { t, mode: 'inc', cells: [], dates: [], rowKeys: [] };
    const r = await saveRemoteDraft(pkgKey, t, JSON.stringify(empty), { expectAt: at0 });
    if (r.ok) clearUnsynced(pkgKey, Number.MAX_SAFE_INTEGER);
  }, [stamp]);

  /* ══════════ ХУВААЛЦСАН НООРОГ — ОРОЛЦОГЧ ба «ИЛГЭЭХ»-ИЙН ТҮГЖЭЭ ══════════
   *
   * ДҮРЭМ (тоо БИШ, ҮЛДЭГДЭЛ):
   *   оролцогч  = ноорогт нүд бөглөсөн хүн бүр (`by`) + «дуусгасан» дарсан хүн
   *   хүлээгдэж = оролцогч − өөрөө − дуусгасан
   *   Илгээх    ⟺ хүлээгдэж байгаа хүн БАЙХГҮЙ
   */
  const meKey = user?.username?.trim().toLowerCase() ?? '';
  /**
   * Ноорог хөндсөн БҮХ хүн — өөрийгөө оруулаад.
   */
  const participants = useMemo(() => {
    const s = new Set<string>();
    for (const u of byMap.values()) if (u) s.add(u);
    for (const [u] of doneBy) if (u) s.add(u);
    // eslint-disable-next-line react-hooks/refs
    if (meKey && mineRef.current.size) s.add(meKey);
    return s;
    /* `pending`/`pendDate` нь ХАМААРАЛД: `mineRef` бол ref тул өөрөө дахин
       бодолт өдөөдөггүй. Нүд бөглөх бүрд `pending` солигддог учир энэ хоёр нь
       «эзэмшил өөрчлөгдсөн» гэсэн цорын ганц найдвартай дохио.
       eslint-disable — `mineRef` нь ref, хамааралд орох ёсгүй. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byMap, doneBy, meKey, pending, pendDate]);
  /**
   * ХҮЛЭЭГДЭЖ БУЙ ОРОЛЦОГЧИД — «Илгээх»-ийг түгжиж буй хүмүүс.
   */
  const waitingOn = useMemo(() => {
    const doneSet = new Set(doneBy.map(([u]) => u));
    const lastAct = new Map<string, number>();
    const bump = (u: string, a: number | undefined) => {
      if (a != null && (lastAct.get(u) ?? 0) < a) lastAct.set(u, a);
    };
    for (const [k, u] of byMap) bump(u, byAtMap.get(k));
    for (const [u, a] of doneBy) bump(u, a);
    // eslint-disable-next-line react-hooks/refs
    if (meKey && mineAtRef.current.size) bump(meKey, Math.max(...mineAtRef.current.values()));
    const latest = Math.max(0, ...lastAct.values());
    return [...participants]
      .filter((u) => u !== meKey && !doneSet.has(u))
      .filter((u) => { const a = lastAct.get(u); return a == null || latest - a <= LOCAL_DRAFT_TTL_MS; })
      .sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, doneBy, meKey, byMap, byAtMap, pending, pendDate]);
  /**
   * ТҮГЖИЖ БУЙ ХҮН БҮРИЙН СҮҮЛИЙН ИДЭВХ (мс) — 2026-10-06 аудит.
   */
  const waitingLast = useMemo(() => {
    const w = new Set(waitingOn);
    const m = new Map<string, number>();
    for (const [k, u] of byMap) {
      if (!w.has(u)) continue;
      const a = byAtMap.get(k);
      if (a != null && (m.get(u) ?? 0) < a) m.set(u, a);
    }
    return m;
  }, [waitingOn, byMap, byAtMap]);
  /**
   * ХҮН ТУС БҮРИЙН ИЛГЭЭГЭЭГҮЙ НҮДНИЙ ТОО (2026-09-10).
   */
  const byCount = useMemo(() => {
    const m = new Map<string, number>();
    const bump = (u: string) => m.set(u, (m.get(u) ?? 0) + 1);
    for (const k of Object.keys(pending)) {
      const u = byMap.get(k);
      if (u && u !== meKey) bump(u);
      // eslint-disable-next-line react-hooks/refs
      else if (meKey && mineRef.current.has(k)) bump(meKey);
    }
    return m;
  }, [pending, byMap, meKey]);

  /** Өөрөө «дуусгасан» гэж тэмдэглэсэн эсэх — товч «Дахин засах» болно */
  const iAmDone = doneBy.some(([u]) => u === meKey);
  /** «Илгээх» нээлттэй эсэх — хүлээх хүнгүй бол тийм */
  const canSubmitNow = waitingOn.length === 0;

  /**
   * «ДУУСГАСАН» / «ДАХИН ЗАСАХ» — өөрийн тэмдэглэгээг асаах/унтраах.
   */
  const toggleDone = useCallback(async () => {
    if (!meKey || !canPerf) return;
    const want = pkg.key;
    const prevMk = marksRef.current.get(meKey);
    const nextMarks = new Map(marksRef.current);
    nextMarks.set(meKey, [meKey, iAmDone ? 0 : 1, (prevMk?.[2] ?? 0) + 1, stamp()]);
    applyMarks(nextMarks);
    const next = doneOfMarks(nextMarks);
    /* Одоогийн ноорогийг уншиж, зөвхөн тэмдгүүдийг сольж буцааж бичнэ —
       нүдний утгыг ЭНД хөндөхгүй (хадгалах эффект түүнийг хариуцна). */
    const cur = readDraft(want);
    const d: Draft = cur
      ? { ...cur, t: Date.now(), done: next, marks: [...nextMarks.values()] }
      : { t: Date.now(), mode: 'inc', cells: [], done: next, marks: [...nextMarks.values()] };
    saveDraftLS(want, d);
    const at0 = await readRemoteDraftAt(want);
    const rr: RemoteDraftRead = at0 === undefined
      ? { ok: false, error: tr('алсын ноорогийг шалгаж чадсангүй') }
      : at0 !== null && at0 !== lastMergedRef.current
        ? await readRemoteDraft(want)
        : { ok: true, draft: null };
    const dNew: Draft = { ...d, t: Math.max(d.t, at0 != null ? at0 + 1 : 0) };
    const merged = rr.ok
      ? compactDraft(mergeDrafts(rr.draft ? parseDraft(rr.draft.payload, 'remote') : null, dNew) ?? dNew,
        { max: REMOTE_MAX, minOid: pkgKeyRef.current === want ? minOidRef.current : null, frameSeenAt: pkgKeyRef.current === want ? frameSeenFor(frameSeenRef.current, minOidRef.current) : null })
      : null;
    let mergedLS: Draft | null = null;
    if (merged) {
      mergedLS = writeDraftLS(want, merged).draft;
      if (pkgKeyRef.current === want) applyMarks(marksOf(merged));
    }
    const r = merged
      ? await saveRemoteDraft(want, merged.t, JSON.stringify(merged), { expectAt: at0 ?? null })
      : { ok: false as const, error: rr.ok ? '' : rr.error };
    if (!r.ok && 'conflict' in r && r.conflict && merged) {
      const q0 = remoteQueue.current;
      if (!q0) remoteQueue.current = { pkg: want, draft: mergedLS ?? merged };
      else if (q0.pkg === want) remoteQueue.current = { pkg: want, draft: mergeDrafts(merged, q0.draft) ?? q0.draft };
      setRemoteTick((n) => n + 1);
      return;
    }
    if (!r.ok) {
      show('warn', tr('«{0}» тэмдэглэгээ ArcGIS-т хадгалагдсангүй ({1}) — бусад хүн харахгүй байж магадгүй.',
        iAmDone ? tr('Дахин засах') : tr('Дуусгасан'), userError(r.error)));
    }
  }, [meKey, iAmDone, pkg.key, show, pkgKeyRef, applyMarks, stamp, canPerf]);

  /**
   * Сонгосон ноорогийг ШҮҮЖ, сэргээх цонхонд бэлдэнэ.
   */
  const pickDraft = useCallback((d: Draft, source: 'local' | 'remote' | 'both', opts?: {
    sharedOnly?: boolean;
    poll?: boolean;
  }): PickRes => {
    const res: PickRes = { changed: false, rcpt: 0 };
    if (!sc || !canPerf) return res;
    seeClock(d);
    const byOid = new Map<number, SheetRow>();
    for (const r of rows) byOid.set(r.oid, r);

    /**
     * Энэ багцад архивын ШИНЭ жааз үүсэхэд (2026-09-04-нөөс — ЗӨВХӨН ерөнхий
     * менежерийн батламжаар) хуудас бүхэлдээ шинэ мөр болж хуулбарлагддаг тул
     * ноорогийн БҮХ ObjectID хуучирна. Урьд нь тэр үед түлхүүр бүр
     * «олдсонгүй» болж, доорх `total === 0` шалгуур ноорогийг ЧИМЭЭГҮЙ
     * УСТГАДАГ байв — нэг ч үг гарахгүйгээр өдрийн ажил алга болно.
     *
     * Одоо ноорогтоо хамт хадгалсан танигчаар (`rowKeys`, «№ ¦ Ажлын нэр»)
     * шинэ мөр рүү зөөнө — илгээх замын `buildOidMap`-тай ЯГ ижил дүрэм. Ижил
     * танигчтай мөр олон бол дарааллаар нь хуваарилна (хуудасны мөрийн
     * дараалал агшин хооронд хадгалагддаг тул энэ нь тогтвортой).
     */
    const oidFix = new Map<number, number>();
    const ambigOids = new Set<number>();
    if (d.rowKeys?.length) {
      const off = d.rowKeys.filter(([oldOid]) => !byOid.has(oldOid));      // мөр байрандаа — зөөх шаардлагагүй
      const mm = mapOldOids(off, rows, d.rowOcc, false);
      for (const [o, to] of mm.map) oidFix.set(o, to);
      for (const o of mm.ambiguous) ambigOids.add(o);
    }
    /** Нүд/огнооны агшин (`d.byAt`) ба суурь баримт (`d.bt`) — зөөлтийн давхцал ба баримтын дүрэмд */
    const dAt = new Map<string, number>(d.byAt ?? []);
    const dBt = new Map<string, number>(d.bt ?? []);
    const dRc = new Map<string, Rcpt>();
    for (const r of unpackRcpt(d.rcpt)) { const w = newerRc(dRc.get(r[0]), r); if (w) dRc.set(r[0], w); }
    /**
     * ТЭМДЭГЛЭХ НҮД (2026-10-04 дахин аудит, #7 · #3) — `Held`. Ноорогийн өмнөх тэмдэг (`d.hold`)
     * байвал анх тэмдэглэсэн агшин хадгалагдана (хугацаа түүнээс); `DEL_TTL_MS`-ээс хуучин бол
     * tombstone-той хаягдана (`heldExpired`). Мөрийн танигч (`rk`/`occ`) ноорогоос — шинэ жаазад
     * байхгүй oid-д хадгалж бичихэд.
     */
    const dHold = new Map<string, [string, number, 0 | 1]>((d.hold ?? []).map((h): [string, [string, number, 0 | 1]] => [h[0], h]));
    const dBy = new Map<string, string>(d.by ?? []);
    const dRk = new Map<number, string>(d.rowKeys ?? []);
    const dOcc = new Map<number, [number, number, number]>((d.rowOcc ?? []).map((e): [number, [number, number, number]] => [e[0], e]));
    const heldNext = new Map<string, Held>();
    const heldExpired: string[] = [];
    let holdNow = 0;
    const holdIt = (k: string, v: string, why: Held['why'], k0: string = k) => {
      if (!holdNow) holdNow = stamp();
      const h0 = dHold.get(k) ?? dHold.get(k0);
      const since = h0 && why !== 'tgt' ? h0[1] : holdNow;
      if (why !== 'tgt' && holdNow - since > DEL_TTL_MS) { heldExpired.push(k); return; }
      const o = Number(k.slice(0, k.indexOf(":")));
      heldNext.set(k, {
        v, at: dAt.get(k0) ?? d.t, by: dBy.get(k0), since,
        force: why === 'old' || h0?.[2] === 1 ? 1 : 0, why, rk: dRk.get(o), occ: dOcc.get(o),
      });
    };
    /** АЛБАДАН тэмдэг (#3) — хуулбар нь тэмдэглэснээс ХОЖУУ хөндөгдөөгүй бол сэргээхгүй */
    const forced = (k: string) => {
      const h = dHold.get(k);
      return !!h && h[2] === 1 && (dAt.get(k) ?? d.t) <= h[1];
    };
    /** Хадгалагдсантай ИЖИЛ (тэг нэмэлт · серверийн огноо) нүд — tombstone-оор цэвэрлэнэ (#7) */
    const noop: string[] = [];
    /** Баримтаар ИЖИЛ утга хасагдсан (`rcptSilentDrop`) нүд `${түлхүүр}@${a}` (#6) */
    const rcDrop: string[] = [];
    const rcSub: string[] = [];
    /** Шинэ түлхүүрт аль хэдийн буусан хуулбарын агшин — давхцвал ХОЖУУ нь ялна */
    const landedAt = new Map<string, number>();
    /** Зөөсөн ХУУЧИН түлхүүрүүд — бүтэн буулгалтад tombstone тавина (#1) */
    const rekeyed: string[] = [];
    /** Энд (pickDraft-д) баримтаар ЗӨРҮҮ болгосон нүд `${түлхүүр}@${a}` (#3 · #4) — `d.conv`-тэй хамт анхааруулна */
    const rcConv: string[] = [];
    /** Баримттай тулгаж буулгасан нүд — суурь баримтыг (`btRef`) тэмдэглэнэ (дахин хөрвүүлэхгүй) */
    const rcLanded: [string, number][] = [];
    /** Хоёрдмол (аль мөр нь тодорхойгүй) тул буулгаагүй нүд/огноо (#2) */
    let ambig = 0;
    /** Ноорог бичигдсэнээс хойш СЕРВЕРТ өөрчлөгдсөн тул буулгаагүй үнэмлэхүй утга (#8) */
    let srvChanged = 0;
    /**
     * ЗӨӨСӨН хуулбарыг шинэ түлхүүрт буулгах эсэх (2026-10-04, #1): (а) шинэ түлхүүрт
     * баримт байвал `rcptApply` (илгээгдсэн хуулбар хуучин oid-оор буцаж ирэхээс);
     * (б) ижил шинэ түлхүүрт хоёр хуулбар (хуучин + шинэ oid) бол ХОЖУУ хөндсөн нь.
     * Буцаах: буулгах утга эсвэл `null` (алгасах).
     */
    const landMoved = (key0: string, key: string, v: string): string | null => {
      const w = dAt.get(key0);
      /* Ижил шинэ түлхүүрт ӨМНӨ буусан хуулбар ХОЖУУ бол энэ нь ялагдана */
      const prev = landedAt.get(key);
      if (prev != null && (w ?? 0) < prev) return null;
      const rc = newerRc(rcptRef.current.get(key), dRc.get(key))
        ?? (key0 !== key ? newerRc(rcptRef.current.get(key0), dRc.get(key0)) : undefined);
      const isD = /:[se]$/.test(key);
      /* Суурь баримт: хуулбарынх (`d.bt`); байрандаа бол энэ сешний гараас бичсэнийх (`btRef`) ч */
      const bt0 = Math.max(dBt.get(key0) ?? 0, key0 === key ? (btRef.current.get(key) ?? 0) : 0);
      const v2 = rc ? rcptApply(v, w, bt0, rc, isD) : v;
      if (v2 == null) {
        if (rc && rc[2] === '') rcSub.push(`${key}@${rc[1]}`);
        else if (rc && rcptSilentDrop(v, w, bt0, rc)) rcDrop.push(`${key}@${rc[1]}`);
        return null;
      }
      if (rc) rcLanded.push([key, rc[1]]);
      if (v2 !== v && !isD) rcConv.push(`${key}@${rc ? rc[1] : 0}`);
      landedAt.set(key, w ?? 0);
      return v2;
    };
    /** Түлхүүрийн ObjectID-г шинэ агшин руу зөөнө (шаардлагагүй бол хэвээр) */
    const fixKey = (key: string): string => {
      if (!oidFix.size) return key;
      const at = key.indexOf(":");
      const to = oidFix.get(Number(key.slice(0, at)));
      return to == null ? key : `${to}${key.slice(at)}`;
    };

    const meTgt = user?.username?.trim().toLowerCase() ?? '';
    for (const e of d.tgt ?? []) {
      const c = tgtsRef.current.get(e[0]);
      if (!c || e[3] > c[3]) tgtsRef.current.set(e[0], e);
    }
    const tgtNow = curTgtRef.current?.[0] ?? 0;
    const offTgt = (k0: string) => offTarget(tgtNow, dBy.get(k0), meTgt, tgtsRef.current);
    /** Зорилтоор хойшлуулсан нүд/огноо (`offTgt`) — `kept`-д тоологдоно (ноорог устахгүй) */
    let tgtHeld = 0;
    const okDrop: string[] = [];
    const next: Record<string, string> = {};
    let dropped = 0;
    const dropNames: string[] = [];
    const dropName = (oid: number, b: number, se?: string) =>
      `${sc.bld[b] ?? `#${b}`} · ${fixCyr(byOid.get(oid)?.work) ?? `#${oid}`}${se === 's' ? ` · ${tr('Эхлэх огноо')}` : se === 'e' ? ` · ${tr('Дуусах огноо')}` : ''}`;
    /** Хадгалагдсантайгаа ИЖИЛ тул сэргээгээгүй нүд/огноо (хуучирсан БИШ) */
    let sameN = 0;
    for (const [key0, vRaw] of d.cells) {
      if (forced(key0)) { holdIt(key0, vRaw, 'old'); continue; }
      if (ambigOids.has(Number(key0.slice(0, key0.indexOf(":"))))) { ambig++; holdIt(key0, vRaw, 'ambig'); continue; }
      const key = fixKey(key0);
      const v = landMoved(key0, key, vRaw);
      /* Хасагдсан (илгээгдсэн/ялагдсан) ч хуучин түлхүүрийг tombstone-доно — баримт хуучирсны дараа сэргэхгүй */
      if (key !== key0) rekeyed.push(key0);
      if (v == null) continue;
      if (offTgt(key0)) { tgtHeld++; holdIt(key, v, 'tgt', key0); continue; }
      const oid = Number(key.split(":")[0]);
      const b = Number(key.slice(key.indexOf(":") + 1));
      const r = byOid.get(oid);
      // Мөр алга болсон, бүлгийн мөр, блок хасагдсан, эсвэл аль хэдийн ижил
      // утгатай (хооронд нь нийтлэгдсэн) бол — хаяна.
      let incV: string | null = null;
      if (r && Number.isInteger(b) && b >= 0 && b < nBld && !r.group && !synNoVol(sc, r as SheetRow)) {
        const rr0 = r as SheetRow;
        if (v.startsWith("=")) {
          const abs = v.slice(1).trim();
          const hasF = !!sc.obyem[b];
          const vol0 = rr0.vol != null && rr0.vol > 0 ? rr0.vol : null;
          if (isPctEdit(abs)) {
            const p = editPct(abs);
            if (p != null) {
              incV = hasF && vol0 != null
                ? fmtInc({ n: p * vol0 - (rr0.obyem[b] ?? 0), p: 0 })
                : fmtInc({ n: 0, p: p - (rr0.act[b] ?? 0) });
            }
          } else if (abs !== "" && Number.isFinite(Number(abs)) && volMode(rr0, b)) {
            incV = fmtInc({ n: Math.max(0, Number(abs)) - (rr0.obyem[b] ?? 0), p: 0 });
          }
        } else if (v.trim() === "") {
          incV = "";
        } else {
          const dd = parseInc(v);
          if (dd && (dd.n === 0 || volMode(rr0, b))) incV = fmtInc(dd);
        }
      }
      if (incV == null) {
        dropped++;
        dropNames.push(dropName(oid, b));
        holdIt(key, v, 'drop', key0);
        continue;
      }
      if (incV === "") { sameN++; if (key === key0) noop.push(key0); continue; }
      if (cbRef.current.okLock?.(oid, b)) { if (key === key0) okDrop.push(key0); continue; }
      next[key] = incV;
    }

    /* ── ОГНОО (`${oid}:${блок}:s|e`) ── */
    const nextDates: Record<string, string> = {};
    const dBase = new Map<string, string>(d.datesB ?? []);
    const nextDatesB = new Map<string, string>();
    /* (эрхийн хаалт — дээрх `if (!sc || !canPerf) return res;`, 2026-10-09 аудит №6) */
    for (const [key0, vRaw] of (d.dates ?? [])) {
      if (forced(key0)) { holdIt(key0, vRaw, 'old'); continue; }
      if (ambigOids.has(Number(key0.slice(0, key0.indexOf(":"))))) { ambig++; holdIt(key0, vRaw, 'ambig'); continue; }
      const key = fixKey(key0);
      const v = landMoved(key0, key, vRaw);
      if (key !== key0) rekeyed.push(key0);
      if (v == null) continue;
      if (offTgt(key0)) { tgtHeld++; holdIt(key, v, 'tgt', key0); continue; }
      const [oidS, bS, k] = key.split(":");
      const b = Number(bS);
      const r2 = byOid.get(Number(oidS));
      const fld = k === "s" ? sc.start[b] : k === "e" ? sc.end[b] : null;
      if (!r2 || !Number.isInteger(b) || b < 0 || b >= nBld || !fld) { dropped++; dropNames.push(dropName(Number(oidS), b, k)); holdIt(key, v, 'drop', key0); continue; }
      const srv = dt(k === "s" ? r2.start[b] : r2.end[b]);
      if (v === srv) { sameN++; if (key === key0) noop.push(key0); continue; }
      const base = dBase.get(key0);
      if (base != null && base !== srv) {
        srvChanged++;
        holdIt(key, v, 'srv', key0);
        /* суурийг хамт хадгална — эс бөгөөс дараагийн сэргээлт суурьгүй гэж үзэж хуучин утгаар ДАРНА */
        const hh = heldNext.get(key);
        if (hh) hh.b = base;
        continue;
      }
      nextDates[key] = v;
      nextDatesB.set(key, base ?? srv);
    }

    /*
     * ── ХУВААЛЦСАН НООРОГИЙН ХАМТЫН ТӨЛӨВ (2026-09-08) ──
     */
    const nextBy = new Map<string, string>();
    for (const [k0, u] of d.by ?? []) {
      const k = fixKey(k0);
      const oid = Number(k.slice(0, k.indexOf(":")));
      if (byOid.has(oid)) nextBy.set(k, String(u).trim().toLowerCase());
    }
    const meNow = user?.username?.trim().toLowerCase() ?? '';
    const lost: [string, string][] = [];
    if (meNow) {
      const moved = new Set<string>();
      const dAtF = new Map<string, number>();
      for (const [k0, a] of d.byAt ?? []) { const k = fixKey(k0); if (Number.isFinite(a) && (dAtF.get(k) ?? 0) < a) dAtF.set(k, a); }
      const dDelF = new Map<string, number>();
      for (const [k0, a] of d.del ?? []) { const k = fixKey(k0); if (Number.isFinite(a) && (dDelF.get(k) ?? 0) < a) dDelF.set(k, a); }
      const prevP = pendingRef.current;
      const prevD = pendDateRef.current;
      for (const k0 of mineRef.current) {
        const k = fixKey(k0);
        const oid = Number(k.slice(0, k.indexOf(":")));
        if (byOid.has(oid)) {
          const isD = /:[se]$/.test(k);
          const mineAt = Math.max(mineAtRef.current.get(k0) ?? 0, delRef.current.get(k0) ?? 0);
          const at = dAtF.get(k);
          const u = nextBy.get(k);
          const rc = dRc.get(k0) ?? dRc.get(k) ?? rcptRef.current.get(k);
          const why = lostMine({
            prev: isD ? prevD[k0] : prevP[k0], next: isD ? nextDates[k] : next[k], mineAt,
            at, by: u, del: dDelF.get(k), rcptA: rc?.[1], me: meNow,
          });
          if (why) {
            const id = `${k}@${why === 'over' ? at : dDelF.get(k)}`;
            if (!lostSeenRef.current.has(id)) { lostSeenRef.current.add(id); lost.push([k, why === 'over' ? (u ?? '') : '']); }
          }
          if (!claimMine(mineAt, at, u, meNow)) continue;
          nextBy.set(k, meNow);
          moved.add(k);
        }
      }
      mineRef.current = moved;
    }
    let lostMsg = '';
    if (lost.length) {
      const who = [...new Set(lost.map(([, u]) => u || tr('Өөр хэрэглэгч')))].join(', ');
      const label = (k: string) => {
        const [o, bS] = k.split(':');
        const r = byOid.get(Number(o));
        const blk = sc.bld[Number(bS)] ?? bS;
        const w = r ? (r.work.length > 28 ? r.work.slice(0, 27) + '…' : r.work) : o;
        return r ? `№${r.no} ${w} · ${blk}` : `${w} · ${blk}`;
      };
      const names = lost.slice(0, 5).map(([k]) => label(k)).join('; ');
      lostMsg = tr('{0} таны бөглөсөн нүдийг өөрчиллөө: {1}', who, names)
        + (lost.length > 5 ? ' ' + tr('… бас {0}', lost.length - 5) : '');
      cbRef.current.flashCells?.(lost.map(([k]) => k).filter((k) => !/:[se]$/.test(k)));
      if (opts?.sharedOnly) show('warn', lostMsg);
    }
    {
      const see = (k0: string, a: number) => {
        if (!Number.isFinite(a)) return;
        const k = fixKey(k0);
        if ((seenAtRef.current.get(k) ?? 0) < a) seenAtRef.current.set(k, a);
      };
      for (const [k0, a] of d.byAt ?? []) see(k0, a);
      for (const [k0, a] of d.del ?? []) see(k0, a);
      for (const r of dRc.values()) see(r[0], r[1]);
    }
    {
      const movedAt = new Map<string, number>();
      for (const [k0, a0] of mineAtRef.current) {
        if (k0.startsWith('a:')) continue;
        const k = fixKey(k0);
        const oid = Number(k.slice(0, k.indexOf(":")));
        if (byOid.has(oid)) movedAt.set(k, a0);
      }
      mineAtRef.current = movedAt;
    }
    for (const [k, h] of heldNext) if (h.why === 'tgt') nextBy.delete(k);
    setByMap(nextBy);
    const nextByAt = new Map<string, number>();
    for (const [k0, a] of d.byAt ?? []) {
      if (!Number.isFinite(a)) continue;
      if (k0.startsWith('a:')) continue;
      const k = fixKey(k0);
      const oid = Number(k.slice(0, k.indexOf(":")));
      if (byOid.has(oid) && nextBy.has(k)) nextByAt.set(k, a);
    }
    for (const [k, a] of mineAtRef.current) {
      if (!nextBy.has(k)) continue;
      if ((nextByAt.get(k) ?? 0) < a) nextByAt.set(k, a);
    }
    setByAtMap(nextByAt);
    for (const [k, a] of d.del ?? []) if (Number.isFinite(a) && (delRef.current.get(k) ?? 0) < a) delRef.current.set(k, a);
    for (const [k, a] of delRef.current) {
      const w = nextByAt.get(k);
      if (w != null && w > a) delRef.current.delete(k);
    }
    {
      const doneKey = (m: Map<string, Mark>) => doneOfMarks(m).map(([u]) => u).sort().join('|');
      const m1 = marksOf(d);
      if (doneKey(marksRef.current) !== doneKey(m1)) res.changed = true;
      applyMarks(m1);
    }
    /* (2026-10-09 аудит №3: `tgtsRef`-ийн нийлүүлэлт нүднээс ӨМНӨ — `offTgt`) */
    {
      const mine = meNow ? tgtsRef.current.get(meNow) : undefined;
      const nt: [number, number] | null = mine && mine[1] > 0 ? [mine[1], mine[2]] : null;
      /* Ижил бол төлөвийг хөдөлгөхгүй — татах мөчлөг 3 сек тутам дахин зурахгүй */
      setDraftTgt((p) => (p === nt || (p && nt && p[0] === nt[0] && p[1] === nt[1]) ? p : nt));
    }
    if (opts?.sharedOnly) return res;
    const tombs = [...rekeyed, ...noop, ...heldExpired, ...okDrop];
    if (tombs.length) {
      const a = stamp();
      for (const k0 of tombs) if ((delRef.current.get(k0) ?? 0) < a) delRef.current.set(k0, a);
    }
    heldRef.current = heldNext;
    setHeldN(heldVisN(heldNext));
    {
      const fresh = newReceipts(rcptRef.current, d);
      res.rcpt = fresh.length;
      if (fresh.length && opts?.poll) cbRef.current.onReceipts?.(Math.max(...fresh.map((r) => r[1])));
    }
    for (const r of dRc.values()) {
      const w = newerRc(rcptRef.current.get(r[0]), r);
      if (w && w !== rcptRef.current.get(r[0])) rcptRef.current.set(r[0], w);
    }
    if (d.frameSeenAt && frameSeenRef.current && d.frameSeenAt[0] === frameSeenRef.current[0] && d.frameSeenAt[1] < frameSeenRef.current[1]) {
      frameSeenRef.current = [d.frameSeenAt[0], d.frameSeenAt[1]];
    }
    {
      const nb = new Map<string, number>();
      for (const [k0, a] of dBt) {
        const k = fixKey(k0);
        if ((nb.get(k) ?? 0) < a) nb.set(k, a);
      }
      /* Энэ сешнд гараас бичсэн нүдийн суурь нь өөрийн (`touchMine`) — алсынх хоцорсон байж болно */
      for (const [k, a] of btRef.current) if ((nb.get(k) ?? 0) < a) nb.set(k, a);
      for (const [k, a] of rcLanded) if ((nb.get(k) ?? 0) < a) nb.set(k, a);
      btRef.current = nb;
    }
    datesBRef.current = nextDatesB;
    /** Энэ буулгалтын анхааруулгууд — НЭГ мэдэгдлээр (дараалсан `show` нь өмнөхөө дарна) */
    const warns: string[] = lostMsg ? [lostMsg] : [];
    {
      const inD = new Set<string>([...d.cells.map(([k]) => k), ...(d.dates ?? []).map(([k]) => k)]);
      let nConv = 0;
      let nDrop = 0;
      const seen = (id: string) => { if (convSeenRef.current.has(id)) return true; convSeenRef.current.add(id); return false; };
      for (const [k0, a] of d.conv ?? []) {
        if (seen(`${fixKey(k0)}@${a}`)) continue;
        if (inD.has(k0)) nConv += 1; else nDrop += 1;
      }
      for (const id of rcConv) if (!seen(id)) nConv += 1;
      for (const id of rcDrop) if (!seen(id)) nDrop += 1;
      let nSub = 0;
      for (const id of rcSub) if (!seen(id)) nSub += 1;
      if (nSub) {
        warns.push(tr('{0} нүдний ноорог утга серверт хадгалагдсан илгээлтээс ӨМНӨ бичигдсэн тул илгээгдсэн гэж үзэж хасав (яг илгээсэн утга мэдэгдэхгүй — зөрүү бодоогүй). Тэр нүд илгээлтэд ороогүй байсан бол дахин бөглөнө үү.', nSub));
      }
      if (nConv) {
        warns.push(tr('{0} нүд илгээгдсэний ДАРАА засагдсан байсан — давхар тоологдохгүйн тулд илгээгдсэн хэсгийг хасаж ЗӨРҮҮГ нь үлдээв. Ногоон нүдийг шалгаад дахин илгээнэ үү.', nConv));
      }
      if (nDrop) {
        warns.push(tr('{0} нүдэнд илгээгдсэн утгатай ИЖИЛ утга илгээлтийн дараа дахин бичигдсэн байсан — давхар тоологдохгүйн тулд хасав. Энэ нь шинэ нэмэлт ажил байсан бол тэр нүдийг дахин бөглөнө үү.', nDrop));
      }
    }
    const since = restoreSinceRef.current;
    const typed = since ? [...mineAtRef.current].filter(([, a]) => a >= since).map(([k]) => k) : [];
    const keepTyped = (base: Record<string, string>) => (prev: Record<string, string>) => {
      if (!typed.length) return base;
      const out = { ...base };
      for (const k of typed) if (k in prev) out[k] = prev[k];
      return out;
    };

    /* ── ШИНЭЧЛЭГДСЭН ОГНОО — зөвхөн ачаалсан утгаас ӨӨР бол ── */
    const asOfStale = d.asOf != null && d.asOf !== asOfOrig && d.asOfB !== undefined && d.asOfB !== asOfOrig;
    if (asOfStale) srvChanged += 1;
    const draftAsOf = d.asOf != null && d.asOf !== asOfOrig && !asOfStale ? d.asOf : null;
    asOfBRef.current = draftAsOf != null ? (d.asOfB !== undefined ? d.asOfB : asOfOrig) : undefined;
    if (d.asOf === null) setAsOf(asOfOrig);
    if (draftAsOf != null) asOfAtRef.current = { v: draftAsOf, at: d.asOfAt };
    else if (d.asOf === null) asOfAtRef.current = { v: null, at: d.asOfAt };

    const nCells = Object.keys(next).length;
    const nDates = Object.keys(nextDates).length;
    const total = nCells + nDates + (draftAsOf != null ? 1 : 0);
    {
      const fresh = { ambig: 0, srv: 0, old: 0, tgt: 0 };
      for (const [k, h] of heldNext) {
        if (h.why === 'drop') continue;
        const id = `${pkg.key}|${k}|${h.why}`;
        if (heldWarnedRef.current.has(id)) continue;
        heldWarnedRef.current.add(id);
        fresh[h.why] += 1;
      }
      if (asOfStale) {
        const id = `${pkg.key}|@asOf|${d.asOf}`;
        if (!heldWarnedRef.current.has(id)) { heldWarnedRef.current.add(id); fresh.srv += 1; }
      }
      if (fresh.ambig) warns.push(tr('Ноорогийн {0} нүдийг аль мөрөнд буулгахаа тодорхойлж чадсангүй (ижил нэртэй мөр олон, хүснэгт шинэчлэгдсэн) — буруу мөрөнд бичихгүйн тулд сэргээсэнгүй; ноорогт хадгалагдсан хэвээр. Тэр ажлуудыг шалгаж гараар дахин бөглөнө үү.', fresh.ambig));
      if (fresh.srv) warns.push(tr('Ноорогийн {0} огноо/утга ноорог бичигдсэнээс хойш серверт өөрчлөгдсөн тул хуучин утгаар дарсангүй — шалгаад шаардлагатай бол дахин оруулна уу.', fresh.srv));
      if (fresh.old) warns.push(tr('Энэ компьютерт 7 хоногоос удаан ArcGIS-т хуулагдаагүй үлдсэн {0} нүдийг сэргээсэнгүй — тэр хооронд илгээгдсэн байж болох тул автоматаар нэмбэл ДАВХАР тоологдоно. Шалгаад шаардлагатай бол гараар дахин бөглөнө үү.', fresh.old));
      if (fresh.tgt) warns.push(tr('Ноорогийн {0} нүд өөр ажилд (өнөөдрийн эсвэл өөр өдрийн бөглөлт) хамаарах тул буцаасан илгээлтийн засварт нийлүүлсэнгүй — ноорогт хадгалагдсан хэвээр, засвар дууссаны дараа буцаж гарна.', fresh.tgt));
      {
        let nOk = 0;
        for (const k of okDrop) {
          const id = `${pkg.key}|${k}|ok`;
          if (!heldWarnedRef.current.has(id)) { heldWarnedRef.current.add(id); nOk += 1; }
        }
        if (nOk) warns.push(tr('Хянагчийн ЗӨВШӨӨРСӨН (ногоон ✓) {0} нүдний ноорог утгыг хаяв — тэр нүд дахин засагдахгүй.', nOk));
      }
      if (fresh.ambig || fresh.srv || fresh.old) warns.push(tr('Тэмдэглэсэн нүд 7 хоногийн дараа автоматаар хаягдана — «Тэмдэглэсэн нүдийг хаях» товчоор одоо хаяж болно.'));
      if (warns.length) show('warn', warns.join(' '));
    }
    if (dropped && !opts?.poll) {
      const shown = dropNames.slice(0, 12).join('; ') + (dropNames.length > 12 ? ` … (+${dropNames.length - 12})` : '');
      const msg = tr('Ноорогийн {0} нүдийг сэргээж чадсангүй — хүснэгт шинэчлэгдсэн тул тэр мөр/блок олдсонгүй эсвэл одоо бичигдэхгүй: {1}. Шаардлагатай бол дахин бөглөнө үү.', dropped, shown || '—');
      (cbRef.current.stick ?? ((m: string) => show('warn', m)))(msg);
    }
    const kept = dropped + ambig + srvChanged + tgtHeld;
    const chg: string[] = [];
    {
      const cmp = (a: Record<string, string>, b: Record<string, string>) => {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) chg.push(k);
      };
      cmp(pendingRef.current, next);
      cmp(pendDateRef.current, nextDates);
      if (chg.length) res.changed = true;
    }
    const soft = (msg: string) => (cbRef.current.soft ?? say)(msg);
    const pollNote = () => {
      if (!opts?.poll || warns.length || res.rcpt || !chg.length) return;
      const vis = cbRef.current.visibleKeys?.(chg) ?? [];
      if (vis.length) soft(tr('Хамтын ноорог шинэчлэгдлээ: {0} нүд өөрчлөгдөв.', chg.length));
    };
    pollNote();
    if (!total) {
      /**
       * Урьд нь энд `clearDraftLS` дуудагдаад ЧИМЭЭГҮЙ буцдаг байв: агшин
       * солигдоход бүх түлхүүр хуучирч `total = 0` болох тул хэрэглэгчийн
       * өдрийн ажил нэг ч үг гарахгүйгээр устдаг байлаа. Дээрх зөөлт
       * (`oidFix`) ихэнх тохиолдлыг нөхнө; нөхөж чадаагүй үед ХЭРЭГЛЭГЧ
       * шийднэ — цонх нээгдэж, юу ч сэргээгдэхгүйг ил хэлнэ.
       */
      setPending(keepTyped({}));
      setPendDate(keepTyped({}));
      keepDraft.current = false;
      if (!kept) {
        if (delRef.current.size || rcptRef.current.size) return res;
        if (sameN || d.cells.length || (d.dates ?? []).length) return res;
        clearDraftLS(pkg.key);
        void safeClearRemote(pkg.key, restoreSinceRef.current ? (restoreAtRef.current || undefined) : undefined);
        return res;
      }
      keepDraft.current = true;
      /* (анхааруулга гарсан бол түүнийг дарахгүй — нэг мэдэгдэл, `warns`) */
      return res;
    }
    const parts = [
      nCells ? tr('{0} гүйцэтгэлийн нүд', nCells) : '',
      nDates ? tr('{0} огноо', nDates) : '',
      draftAsOf != null ? tr('шинэчлэгдсэн огноо') : '',
    ].filter(Boolean);
    /*
     * ТҮҮХ: хөтчийн `confirm` → апп доторх төвлөрсөн цонх (2026-09-03) →
     * ОДОО цонхгүй. Цонх нь ажлаа алдахаас хамгаалах зорилготой байсан ч
     * бөглөгч өдөрт хэд хэдэн удаа багц сольдог бөгөөд ТЭР БҮРД нэг ижил
     * асуултад «Сэргээх» дарах нь дэмий алхам болж байв.
     */
    setPending(keepTyped(next));
    setPendDate(keepTyped(nextDates));
    if (draftAsOf != null) setAsOf(draftAsOf);
    /* Сэргээгдсэн тул хамгаалалт хэрэггүй — цаашид ердийн дүрмээр хадгалагдана */
    keepDraft.current = false;
    const from = source === 'remote'
      ? tr('өөр төхөөрөмжөөс')
      : source === 'both'
        ? tr('энэ ба өөр төхөөрөмжөөс нийлүүлж')
        : tr('энэ компьютерээс');
    /* (анхааруулга гарсан бол түүнийг дарахгүй — `warns`) */
    if (!warns.length && !opts?.poll) soft(tr('Ноорог сэргээв ({0}): {1}. Ногоон нүд = илгээгээгүй.', from, parts.join(' · ')));
    return res;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sc, nBld, pkg.key, asOfOrig, canPerf]);

  /**
   * `pickDraft`-ийн СҮҮЛИЙН хувилбар ref-д — 3 секундын нийлүүлэлтийн мөчлөг
   * түүнийг дуудна.
   */
  const pickDraftRef = useRef(pickDraft);
  useEffect(() => { pickDraftRef.current = pickDraft; }, [pickDraft]);

  // ── Нооргийн сэргээлт — багц ачаалагдмагц НЭГ удаа санал болгоно ──
  /** Сэргээх цонхонд харуулах ба хүлээгдэж буй ноорог (`null` = цонх хаалттай) */
  useEffect(() => {
    if (busy || !rows.length || !sc) return;
    if (loadedPkgRef.current !== pkg.key) return;
    if (noEdit) return;
    if (!canPerf) return;
    if (promptedPkgRef.current === pkg.key) return;
    // Сэргээх шат өнгөрснийг ноорог байсан эсэхээс үл хамааран тэмдэглэнэ.
    promptedPkgRef.current = pkg.key;
    const gen = ++restoreGenRef.current;
    restoring.current = true;
    restoreSinceRef.current = stamp();
    const local = readDraft(pkg.key);
    let alive = true;
    void (async () => {
      /*
       * Урьд нь `loadRemoteDraft` нь «ноорог БАЙХГҮЙ» ба «уншиж ЧАДСАНГҮЙ»
       * хоёрыг ижил `null`-аар буцаадаг байв. Сүлжээ түр тасрах, токен
       * шинэчлэгдэх агшинд гэрийн компьютер дээр бөглөсөн ноорог ОГТ
       * сэргэхгүй, дэлгэцэд ямар ч алдаа гарахгүй — бөглөгч хоосон хуудас
       * хараад ажлаа алдсан гэж дүгнэнэ. Дээрээс нь `promptedPkgRef` аль
       * хэдийн тавигдсан тул тэр сешнд ДАХИН оролдохгүй: зөвхөн хуудсыг
       * бүтнээр дахин ачаалж (F5) байж сэргэдэг байлаа.
       */
      const rr = await readRemoteDraft(pkg.key);
      if (!alive) {
        if (restoreGenRef.current !== gen) return;
        restoring.current = false;
        restoreSinceRef.current = 0;
        if (promptedPkgRef.current === pkg.key) { promptedPkgRef.current = ''; setRemoteRetry((n) => n + 1); }
        return;
      }
      if (!rr.ok) {
        promptedPkgRef.current = '';
        show('warn', tr(
          'Алсын ноорогийг уншиж чадсангүй ({0}). Энэ компьютерийн ноорог хэвээр — өөр газраас бөглөсөн ажил байвал 3 секундын дараа дахин оролдоно.',
          rr.error,
        ));
        setTimeout(() => setRemoteRetry((n) => n + 1), REMOTE_RETRY_MS);
      }
      const rem = rr.ok ? rr.draft : null;
      const remote = rem ? parseDraft(rem.payload, 'remote') : null;
      restoreAtRef.current = rem?.at ?? 0;
      if (rem && !remote) void clearRemoteDraft(pkg.key);
      /*
       * ── ХУУЧИН (`хэрэглэгч|багц`) НООРОГИЙГ НЭГ УДАА ШИЛЖҮҮЛНЭ (2026-09-08) ──
       */
      let migrated: Draft | null = null;
      const legacy = await readLegacyDrafts(pkg.key);
      if (alive && legacy.length) {
        for (const L of legacy) {
          const p = parseDraft(L.payload, 'remote');
          if (!p) continue;
          if (L.user) {
            const owned = new Map<string, string>(p.by ?? []);
            for (const [k] of p.cells) if (!owned.has(k)) owned.set(k, L.user);
            for (const [k] of p.dates ?? []) if (!owned.has(k)) owned.set(k, L.user);
            p.by = [...owned];
          }
          migrated = mergeDrafts(migrated, p);
        }
        if (migrated) legacyPendingRef.current = pkg.key;
      }
      if (!alive) {
        if (restoreGenRef.current !== gen) return;
        restoring.current = false;
        restoreSinceRef.current = 0;
        if (promptedPkgRef.current === pkg.key) { promptedPkgRef.current = ''; setRemoteRetry((n) => n + 1); }
        return;
      }
      const localNow = readDraft(pkg.key);
      const merged = mergeDrafts(mergeDrafts(mergeDrafts(local, remote), localNow), migrated);
      restoring.current = false;
      if (merged) {
        const src = local && remote ? 'both' : remote ? 'remote' : 'local';
        pickDraft(merged, src);
        if (isUnsynced(pkg.key) && (!remoteQueue.current || remoteQueue.current.pkg === pkg.key)) {
          remoteQueue.current = { pkg: pkg.key, draft: { ...merged, t: Math.max(merged.t, stamp()) } };
          setRemoteTick((n) => n + 1);
        }
      }
      /* Нооргүй (локал ч, алсад ч) бол «хуулагдаагүй» тэмдэг утгагүй — арилгана */
      if (!merged && rr.ok) clearUnsynced(pkg.key, Number.MAX_SAFE_INTEGER);
      restoreSinceRef.current = 0;
      restoreAtRef.current = 0;
      setRestDonePkg(pkg.key);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, rows, sc, nBld, pkg.key, canPerf, asOfOrig, noEdit, remoteRetry]);

  /** «Сэргээх» — ноорогийг төлөв рүү буулгана */
  /**
   * «НООРОГ УСТГАХ» — сэргээгдсэн ноорогийг бүрмөсөн хаяна.
   */
  const dropDraft = useCallback(async () => {
    const others = [...participants].filter((u) => u !== meKey);
    const nCell = String(dirtyCount);
    if (!(await askConfirm(others.length
      ? tr(
        'Энэ нооргийг {0} мөн бөглөж байна. Устгавал ТЭДНИЙ ажил ч арилна ({1} нүд). Үргэлжлүүлэх үү?',
        others.sort().join(', '), nCell,
      )
      : tr('Илгээгээгүй {0} нүдний засвар арилна. Ноорог устгах уу?', nCell), { ok: tr('Ноорог устгах'), danger: true }))) return;
    const nowMs = stamp();
    const ld = readDraft(pkg.key);
    const tombKeys = [...new Set([
      ...Object.keys(pending), ...Object.keys(pendDate),
      ...(ld?.cells ?? []).map(([k]) => k), ...(ld?.dates ?? []).map(([k]) => k),
      ...heldRef.current.keys(),
    ])];
    heldRef.current = new Map();
    setHeldN(0);
    if (asOf !== asOfOrig) asOfRevRef.current = true;
    setPending({});
    setPendDate({});
    setAsOf(asOfOrig);
    mineRef.current = new Set();
    undoAllMarks();
    setByMap(new Map());
    /* 2026-09-21: агшин ба tombstone ч мөн БАГЦЫН/НООРГИЙН төлөв — хамт цэвэрлэнэ. */
    setByAtMap(new Map());
    mineAtRef.current = new Map();
    delRef.current = new Map(tombKeys.map((k): [string, number] => [k, nowMs]));
    /* 2026-10-04: суурь/зорилт ч ноорогтой хамт устана; баримт (`rcptRef`) ҮЛДЭНЭ — илгээгдсэн
       хуулбар өөр төхөөрөмжөөс буцаж ирэхээс хамгаална (7 хоногт хуучирна). */
    btRef.current = new Map();
    datesBRef.current = new Map();
    asOfBRef.current = undefined;
    clearMyTgt();
    /** Сүүлд нийлүүлсэн алсын хувилбар — доорх түгжээтэй хоослолтод (тэглэхээс өмнө) */
    const seenAt = lastMergedRef.current;
    lastMergedRef.current = 0;
    lastBodyRef.current = '';
    if (tombKeys.length || asOfRevRef.current) {
      const tomb: Draft = {
        t: nowMs, mode: 'inc', cells: [], dates: [], rowKeys: [],
        asOf: asOfRevRef.current ? null : undefined,
        asOfAt: asOfRevRef.current ? (asOfAtRef.current = { v: null, at: nowMs }).at : undefined,
        done: [], marks: [...marksRef.current.values()], del: [...delRef.current],
        rcpt: rcptRef.current.size ? packRcpt(rcptRef.current.values()) : undefined,
        tgt: tgtsRef.current.size ? [...tgtsRef.current.values()] : undefined,
      };
      if (!saveDraftLS(pkg.key, tomb)) setLocalFail(true);
      markUnsynced(pkg.key, tomb.t);
      remoteQueue.current = { pkg: pkg.key, draft: tomb };
      setRemoteTick((n) => n + 1);
    } else {
      clearDraftLS(pkg.key);
      void safeClearRemote(pkg.key, seenAt || undefined);
    }
    keepDraft.current = false;
    say(tr('Ноорог устгагдлаа — илгээгээгүй засварууд арилав.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg.key, asOf, asOfOrig, participants, meKey, dirtyCount, pending, pendDate]);

  // Ноорог хадгалах — pending өөрчлөгдөх бүрд. Хоосон болоход (нийтэлсэн /
  // болиулсан) устгана, гэхдээ зөвхөн сэргээх шат ӨНГӨРСӨН багцынхыг: багц
  // солих үеийн setPending({}) шинэ багцын хуучин ноорогийг дарж болохгүй.
  useEffect(() => {
    if (loadedPkgRef.current !== pkg.key) return;
    const asOfChanged = asOf !== asOfOrig;
    const asOfStampOf = (val: number | null | undefined): number | undefined => {
      if (val === undefined) return undefined;
      const c = asOfAtRef.current;
      if (c && c.v === val) return c.at;
      const at1 = stamp();
      asOfAtRef.current = { v: val, at: at1 };
      return at1;
    };
    if (
      !Object.keys(pending).length
      && !Object.keys(pendDate).length
      && !asOfChanged
      && !heldRef.current.size
    ) {
      if (promptedPkgRef.current === pkg.key && !keepDraft.current && !restoring.current) {
        const nowMs = stamp();
        const liveDel: [string, number][] = [...delRef.current].filter(([, a]) => nowMs - a <= DEL_TTL_MS);
        const liveRc = [...rcptRef.current.values()].filter((r) => rcptAlive(r, nowMs, minOidRef.current, frameSeenFor(frameSeenRef.current, minOidRef.current)));
        if (liveDel.length || liveRc.length || asOfRevRef.current) {
          delRef.current = new Map(liveDel);
          rcptRef.current = new Map(liveRc.map((r): [string, Rcpt] => [r[0], r]));
          const tomb: Draft = {
            t: nowMs, mode: 'inc', cells: [], dates: [], rowKeys: [],
            asOf: asOfRevRef.current ? null : undefined,
            asOfAt: asOfStampOf(asOfRevRef.current ? null : undefined),
            done: doneRef.current, marks: [...marksRef.current.values()], del: liveDel,
            rcpt: liveRc.length ? packRcpt(liveRc) : undefined,
            frameSeenAt: frameSeenRef.current ?? undefined,
            tgt: tgtsRef.current.size ? [...tgtsRef.current.values()] : undefined,
          };
          const w = writeDraftLS(pkg.key, tomb);
          setLocalFail(!w.ok);
          markUnsynced(pkg.key, tomb.t);
          remoteQueue.current = { pkg: pkg.key, draft: tomb };
          setRemoteTick((n) => n + 1);
          setSavedAt(null);
          return;
        }
        if (!draftLiveRef.current) {
          setSavedAt(null);
          return;
        }
        {
          const ldx = readDraft(pkg.key);
          if (ldx && (ldx.cells.length || (ldx.dates ?? []).length)) {
            setSavedAt(null);
            return;
          }
        }
        draftLiveRef.current = false;
        clearDraftLS(pkg.key);
        void safeClearRemote(pkg.key);
        mineRef.current = new Set();
        marksRef.current = new Map();
        doneRef.current = [];
        setDoneBy([]);
        setByMap(new Map());
        /* 2026-09-21: агшин ба tombstone ч мөн БАГЦЫН/НООРГИЙН төлөв — хамт цэвэрлэнэ. */
        setByAtMap(new Map());
        mineAtRef.current = new Map();
        delRef.current = new Map();
        lastMergedRef.current = 0;
        lastBodyRef.current = '';
      }
      setSavedAt(null);
      return;
    }
    const at = Date.now();
    setSavedAt(at);
    /* 2026-09-25: хоосон биш ноорог — `draftLiveRef`/`asOfRevRef` */
    draftLiveRef.current = true;
    if (asOfChanged) asOfRevRef.current = true;
    keepDraft.current = false;
    const usedOids = new Set<number>();
    for (const k of [...Object.keys(pending), ...Object.keys(pendDate)]) {
      const o = Number(k.slice(0, k.indexOf(":")));
      if (Number.isFinite(o) && o >= 0) usedOids.add(o);
    }
    const heldList: [string, Held][] = [];
    const heldRk: [number, string][] = [];
    const heldOcc: [number, number, number][] = [];
    {
      const n0 = heldRef.current.size;
      const inRows = new Set(rows.map((r) => r.oid));
      for (const [k, h] of [...heldRef.current]) {
        if (k in pending || k in pendDate) { heldRef.current.delete(k); continue; }
        heldList.push([k, h]);
        const o = Number(k.slice(0, k.indexOf(":")));
        if (!Number.isFinite(o) || o < 0) continue;
        if (inRows.has(o)) usedOids.add(o);
        else if (h.rk != null && !heldRk.some(([x]) => x === o)) {
          heldRk.push([o, h.rk]);
          if (h.occ) heldOcc.push(h.occ);
        }
      }
      if (heldRef.current.size !== n0) setHeldN(heldVisN(heldRef.current));
    }
    const heldSet = new Set(heldList.map(([k]) => k));
    const rowKeys: [number, string][] = [];
    for (const r of rows) if (usedOids.has(r.oid)) rowKeys.push([r.oid, `${r.no} ¦ ${r.work}`]);
    rowKeys.push(...heldRk);

    const me = user?.username?.trim().toLowerCase() ?? '';
    const byM = new Map<string, string>();
    for (const [k, u] of byMapRef.current) if (k in pending || k in pendDate) byM.set(k, u);
    if (me) for (const k of mineRef.current) if (k in pending || k in pendDate) byM.set(k, me);
    const by: [string, string][] = [...byM];
    const byAt: [string, number][] = [];
    for (const [k] of byM) {
      const a = mineRef.current.has(k) ? (mineAtRef.current.get(k) ?? at) : byAtRef.current.get(k);
      if (a != null) byAt.push([k, a]);
    }
    for (const [k, h] of heldList) {
      if (h.by) by.push([k, h.by]);
      byAt.push([k, h.at]);
    }
    /* 7 хоногоос хуучин tombstone-ийг бичихгүй (`DEL_TTL_MS`, `mergeDrafts`-тай ижил). */
    const del: [string, number][] = [...delRef.current]
      .filter(([k, a]) => !(k in pending) && !(k in pendDate) && !heldSet.has(k) && at - a <= DEL_TTL_MS);
    const rowOcc = [...rowOccOf(rows, usedOids), ...heldOcc];
    const bt: [string, number][] = [];
    for (const k of [...Object.keys(pending), ...Object.keys(pendDate)]) {
      const a = btRef.current.get(k);
      if (a) bt.push([k, a]);
    }
    for (const [k, r] of [...rcptRef.current]) if (!rcptAlive(r, at, minOidRef.current, frameSeenFor(frameSeenRef.current, minOidRef.current))) rcptRef.current.delete(k);
    const rcpt = [...rcptRef.current.values()];
    const datesB: [string, string][] = [];
    {
      const byOidS = new Map(rows.map((r) => [r.oid, r] as const));
      const nb = new Map<string, string>();
      for (const k of Object.keys(pendDate)) {
        let b0 = datesBRef.current.get(k);
        if (b0 == null) {
          const [o, bS, se] = k.split(':');
          const r = byOidS.get(Number(o));
          const b = Number(bS);
          if (r) b0 = dt(se === 's' ? r.start[b] : r.end[b]);
        }
        if (b0 != null) { nb.set(k, b0); datesB.push([k, b0]); }
      }
      datesBRef.current = nb;
      for (const [k, h] of heldList) if (h.b != null && /:[se]$/.test(k)) datesB.push([k, h.b]);
    }
    if (asOfChanged) { if (asOfBRef.current === undefined) asOfBRef.current = asOfOrig; } else asOfBRef.current = undefined;
    {
      const want = draftTgtRef.current ?? curTgt;
      const mine = me ? tgtsRef.current.get(me) : undefined;
      if (me && want && (!mine || mine[1] !== want[0] || mine[2] !== want[1])) {
        tgtsRef.current.set(me, [me, want[0], want[1], stamp()]);
      }
    }
    const tgtW = tgtsRef.current.size ? [...tgtsRef.current.values()] : undefined;

    const draft: Draft = {
      t: at,
      mode: 'inc',
      cells: [...Object.entries(pending), ...heldList.filter(([k]) => !/:[se]$/.test(k)).map(([k, h]): [string, string] => [k, h.v])],
      dates: [...Object.entries(pendDate), ...heldList.filter(([k]) => /:[se]$/.test(k)).map(([k, h]): [string, string] => [k, h.v])],
      asOf: asOfChanged ? asOf : asOfRevRef.current ? null : undefined,
      asOfAt: asOfStampOf(asOfChanged ? asOf : asOfRevRef.current ? null : undefined),
      rowKeys,
      by: by.length ? by : undefined,
      done: doneRef.current,
      marks: [...marksRef.current.values()],
      byAt: byAt.length ? byAt : undefined,
      del: del.length ? del : undefined,
      /* 2026-10-04 аудит — давтамж · баримт · суурь · зорилт (`Draft`) */
      rowOcc: rowOcc.length ? rowOcc : undefined,
      rcpt: rcpt.length ? packRcpt(rcpt) : undefined,
      bt: bt.length ? bt : undefined,
      tgt: tgtW,
      hold: heldList.some(([, h]) => h.why !== 'tgt')
        ? heldList.filter(([, h]) => h.why !== 'tgt').map(([k, h]): [string, number, 0 | 1] => [k, h.since, h.force])
        : undefined,
      asOfB: asOfChanged ? asOfBRef.current : undefined,
      datesB: datesB.length ? datesB : undefined,
      frameSeenAt: frameSeenRef.current ?? undefined,
    };
    const wr = writeDraftLS(pkg.key, draft);
    setLocalFail(!wr.ok);
    markUnsynced(pkg.key, draft.t);
    remoteQueue.current = { pkg: pkg.key, draft };
    setRemoteTick((n) => n + 1);
  }, [pending, pendDate, asOf, asOfOrig, pkg.key, rows, user?.username, loadedPkgRef, curTgt, stamp, safeClearRemote]);

  /**
   * ── АЛСЫН ХУУЛБАР (ArcGIS) — `REMOTE_DEBOUNCE_MS` (3 сек) завсарлагатай ──
   */
  useEffect(() => {
    if (!remoteTick) return undefined;
    /**
     * @param pkgKey БАГЦ СОЛИХ үеийн ИЛ түлхүүр (2026-09-24-ний аудит):
     *   өгөгдсөн бол `loadedPkgRef` аль хэдийн тэглэгдсэн/өөр байсан ч
     *   ХУУЧИН багцын дараалалд буй ноорогийг read-merge-write хийнэ —
     *   зөвхөн `setRemoteState`/ref-ийн шинэчлэл (шинэ багцад харьяалагдах)
     *   алгасагдана. Урьд нь бичилт уншилтын дараа тасарч, сүүлийн ≤3 сек
     *   засвар алсад хэзээ ч очдоггүй байв.
     */
    /**
     * ӨӨР БАГЦЫН (солигдсон) бичилт унасныг ИЛ хэлнэ — 2026-10-04 аудит (#5). Урьд нь ЧИМЭЭГҮЙ
     * хаягддаг байв (сүүлийн ≤3 сек засвар · илгээлтийн дараах цэвэрлэгээ). Локал хуулбар ба
     * «хуулагдаагүй» тэмдэг (`markUnsynced`) үлдэх тул тэр багцыг нээмэгц дахин илгээгдэнэ.
     */
    const staleWarn = (pk: string, why: string) => {
      if (staleWarnedRef.current.has(pk)) return;
      staleWarnedRef.current.add(pk);
      showRef.current('warn', tr('Өмнөх багцын сүүлийн засвар ArcGIS-т хуулагдсангүй ({0}) — энэ компьютерт хадгалагдсан; тэр багцыг дахин нээхэд автоматаар илгээнэ. Тэр болтол өөр компьютероос бүү бөглө.', why));
    };
    const flush = (pkgKey?: string) => {
      const q = remoteQueue.current;
      if (!q) return;
      if (q.pkg !== (pkgKey ?? pkg.key)) { remoteQueue.current = null; return; }
      remoteQueue.current = null;
      const allowStale = pkgKey != null;
      /** Хариу ОДООГИЙН багцынх уу — төлөв/ref зөвхөн тэгвэл шинэчлэгдэнэ */
      const live = () => loadedPkgRef.current === q.pkg;
      lastRemoteRef.current = Date.now();
      void (async () => {
        const at = await readRemoteDraftAt(q.pkg);
        if (at === undefined) {
          /* Уншиж чадсангүй — бичихгүй: алсын агуулга үл мэдэгдэх тул бичих нь
             бусдын ажлыг устгах эрсдэлтэй. Локал бүрэн бүтэн. */
          if (!live()) { staleWarn(q.pkg, tr('алсын ноорогийг шалгаж чадсангүй')); return; }
          setRemoteState({ kind: 'fail', why: tr('алсын ноорогийг шалгаж чадсангүй') });
          if (!remoteQueue.current) remoteQueue.current = q;
          setTimeout(() => setRemoteTick((n) => n + 1), REMOTE_RETRY_MS);
          return;
        }
        let remote: Draft | null = null;
        if (at !== null && (allowStale || !live() || at !== lastMergedRef.current)) {
          const rr = await readRemoteDraft(q.pkg);
          if (!rr.ok) {
            if (!live()) { staleWarn(q.pkg, rr.error); return; }
            setRemoteState({ kind: 'fail', why: rr.error });
            if (!remoteQueue.current) remoteQueue.current = q;
            setTimeout(() => setRemoteTick((n) => n + 1), REMOTE_RETRY_MS);
            return;
          }
          remote = rr.draft ? parseDraft(rr.draft.payload, 'remote') : null;
        }
        /* Алсынхыг ХУУЧИН, өөрийнхийг ШИНЭ тал болгож нийлүүлнэ — нүд тус
           бүрээр шинэ агшинтай нь ялна (`mergeDrafts`). */
        const merged0 = compactDraft(mergeDrafts(remote, q.draft) ?? q.draft, { max: REMOTE_MAX, minOid: live() ? minOidRef.current : null, frameSeenAt: live() ? frameSeenFor(frameSeenRef.current, minOidRef.current) : null });
        /* `body` — хувилбарын дугааргүй агуулга: дэмий бичилт таслахад (доор) */
        const body = JSON.stringify(merged0);
        const outDraft: Draft = { ...merged0, t: Math.max(Date.now(), merged0.t, at != null ? at + 1 : 0) };
        const outBody = JSON.stringify(outDraft);
        if (outBody.length > remoteMax()) { if (live()) setRemoteState({ kind: 'big' }); else staleWarn(q.pkg, tr('ноорог хэт том')); return; }
        if (live() && body === lastBodyRef.current) {
          setRemoteState({ kind: 'ok', at: Date.now() });
          clearUnsynced(q.pkg, q.draft.t);
          return;
        }
        writeDraftLS(q.pkg, outDraft);
        if (live() && !remote && outDraft.t > lastMergedRef.current) lastMergedRef.current = outDraft.t;
        await saveRemoteDraft(q.pkg, outDraft.t, outBody, { expectAt: at }).then((r) => {
        if (r.ok) clearUnsynced(q.pkg, q.draft.t);
        /* Багц солигдсон бол хуучин хариугаар шинэ багцын төлөвийг бичихгүй. */
        if (!live()) { if (!r.ok) staleWarn(q.pkg, r.error); return; }
        if (!r.ok && r.conflict) {
          if (!remoteQueue.current) remoteQueue.current = q;
          setTimeout(() => setRemoteTick((n) => n + 1), 300);
          return;
        }
        if (r.ok) {
          lastBodyRef.current = body;
          setRemoteState({ kind: 'ok', at: Date.now() });
          if (legacyPendingRef.current === q.pkg) {
            legacyPendingRef.current = '';
            void clearLegacyDrafts(q.pkg);
          }
          return;
        }
        setRemoteState({ kind: 'fail', why: r.error });
        if (!remoteQueue.current) remoteQueue.current = q;
        setTimeout(() => setRemoteTick((n) => n + 1), REMOTE_RETRY_MS);
        });
      })();
    };
    flushRef.current = flush;
    const t = setTimeout(flush, REMOTE_DEBOUNCE_MS);
    const since = Date.now() - lastRemoteRef.current;
    const cap = since >= REMOTE_CAP_MS
      ? setTimeout(flush, 0)
      : setTimeout(flush, Math.max(0, REMOTE_CAP_MS - since));
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    /* (Event аргумент `pkgKey` болж орохгүй — хаалтаар дуудна) */
    const onPageHide = () => flush();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearTimeout(t); clearTimeout(cap);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [remoteTick, pkg.key, loadedPkgRef]);

  /**
   * ── UNMOUNT ДЭЭР ШУУД ИЛГЭЭНЭ (2026-09-08) ──
   */
  useEffect(() => () => { flushRef.current(); }, []);

  /**
   * ── ХУВААЛЦСАН НООРОГ: 3 СЕК ТУТАМ ТАТАЖ НИЙЛҮҮЛНЭ (2026-09-08) ──
   */
  useEffect(() => {
    if (busy || noEdit || !canPerf || !sc || !rows.length) return;
    if (loadedPkgRef.current !== pkg.key) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      /* Нүд засаж байх, таб харагдахгүй, эсвэл алсад бичих ажил дараалалд
         байвал алгасна — дараагийн тойрогт барина. */
      if (!alive) return;
      /*
       * `editRef.current` нь нүд НЭЭЛТТЭЙ байхад үнэн. Бөглөгч нүд рүү орсон
       * чигээрээ (курсор дотор) бодож суувал татах мөчлөг МӨНХӨД алгасаж,
       * нөгөө талын ажил ХЭЗЭЭ Ч ирэхгүй — улмаар `byMap` хоосон хэвээр
       * үлдэж, «Илгээх» түгжээ хоёуланд нь нээлттэй байна. Бөглөгч нүд рүү
       * ороод удаан суух нь ЭНГИЙН зан төлөв тул энэ нь ховор биш.
       *
       * ШИЙДЭЛ: нүд нээлттэй байхад ч ТАТНА (уншилт нь хэнд ч саад болохгүй),
       * зөвхөн ДЭЛГЭЦЭД БУУЛГАХАА хойшлуулна — тэр нь доор `editRef`-ээр
       * шалгагдана. Ингэснээр эзэмшил ба «дуусгасан» төлөв цаг тухайд нь
       * ирж, курсор нь ч үсрэхгүй.
       */
      if (document.visibilityState === 'hidden' || remoteQueue.current) {
        timer = setTimeout(() => void tick(), REMOTE_DEBOUNCE_MS);
        return;
      }
      const at = await readRemoteDraftAt(pkg.key);
      if (!alive) return;
      /* `undefined` = уншиж чадсангүй · `null` = мөр алга · тоо = агшин.
         Хоёуланд нь татах зүйлгүй; дараагийн тойрогт дахин үзнэ. */
      if (typeof at === 'number' && at !== lastMergedRef.current) {
        if (at < lastMergedRef.current) lastMergedRef.current = 0;
        const rr = await readRemoteDraft(pkg.key);
        if (!alive) return;
        if (rr.ok && rr.draft) {
          const remote = parseDraft(rr.draft.payload, 'remote');
          if (remote && remote.t > lastMergedRef.current) {
            if (editRef.current) {
              deferredRef.current = { pkg: pkg.key, d: remote };
              const mergedS = mergeDrafts(readDraft(pkg.key), remote);
              if (mergedS) pickDraftRef.current(mergedS, 'remote', { sharedOnly: true });
              timer = setTimeout(() => void tick(), REMOTE_DEBOUNCE_MS);
              return;
            }
            deferredRef.current = null;
            lastMergedRef.current = remote.t;
            const local = readDraft(pkg.key);
            const merged = mergeDrafts(local, remote);
            if (merged) pickDraftRef.current(merged, 'remote', { poll: true });
          }
        }
      }
      if (alive) timer = setTimeout(() => void tick(), REMOTE_DEBOUNCE_MS);
    };
    timer = setTimeout(() => void tick(), REMOTE_DEBOUNCE_MS);
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [busy, noEdit, canPerf, sc, rows.length, pkg.key, loadedPkgRef, editRef]);

  /**
   * НҮД ХААГДМАГЦ ХОЙШЛУУЛСАН НИЙЛҮҮЛЭЛТИЙГ БУУЛГАНА (2026-10-01).
   */
  useEffect(() => {
    if (editOpen) return;
    const q = deferredRef.current;
    if (!q) return;
    deferredRef.current = null;
    if (q.pkg !== pkg.key || loadedPkgRef.current !== pkg.key) return;
    const merged = mergeDrafts(readDraft(pkg.key), q.d);
    if (!merged) return;
    pickDraftRef.current(merged, 'remote', { poll: true });
    /* Одоо `pending`-д буусан — татах мөчлөгийн ердийн замтай ижил тэмдэглэнэ */
    if (q.d.t > lastMergedRef.current) lastMergedRef.current = q.d.t;
  }, [editOpen, pkg.key, loadedPkgRef]);

  /**
   * «НООРОГ СЭРГЭЭЖ БАЙНА…» — нүд ТҮГЖИГДЭНЭ (2026-10-01, хэрэглэгч: бүгдийг зас).
   */
  const restoringUi = !noEdit && canPerf && !busy && rows.length > 0 && !!sc && restDonePkg !== pkg.key;
  const clearRestoreDone = useCallback(() => setRestDonePkg(''), []);

  /**
   * ТАБ ХААХ / REFRESH — ноорог ХАДГАЛАГДАЖ АМЖААГҮЙ үед хөтөч зогсооно.
   */
  useEffect(() => {
    const pendingRemote = remoteQueue.current != null && remoteQueue.current.pkg === pkg.key;
    const failedRemote = remoteState?.kind === 'fail';
    if (!pendingRemote && !failedRemote && !pvDirty) return;
    const h = (e: BeforeUnloadEvent) => {
      /* Цонх гарч байх зуур ArcGIS руу — дараалалд юу ч байхгүй бол хоосон */
      flushRef.current();
      e.preventDefault();
      // Chrome legacy — returnValue заавал онооно
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [remoteTick, remoteState, pvDirty, pkg.key]);
  /**
   * ИЛГЭЭЛТИЙН БАРИМТЫГ АЛСЫН НООРОГТ ШУУД БИЧИЖ, ХҮЛЭЭНЭ (2026-10-05) — `FillNew.publish`
   * «Илгээх» амжилттай болмогц, `busy` хэвээр байхад дуудна.
   */
  const pushReceipts = useCallback(async (want: string): Promise<{ ok: true } | { ok: false; why: string }> => {
    const nowMs = stamp();
    const liveDel: [string, number][] = [...delRef.current].filter(([, a]) => nowMs - a <= DEL_TTL_MS);
    const liveRc = [...rcptRef.current.values()].filter((r) => rcptAlive(r, nowMs, minOidRef.current, frameSeenFor(frameSeenRef.current, minOidRef.current)));
    if (!liveDel.length && !liveRc.length) return { ok: true };
    const tomb: Draft = {
      t: nowMs, mode: 'inc', cells: [], dates: [], rowKeys: [],
      done: doneRef.current, marks: [...marksRef.current.values()], del: liveDel,
      rcpt: liveRc.length ? packRcpt(liveRc) : undefined,
      frameSeenAt: frameSeenRef.current ?? undefined,
      tgt: tgtsRef.current.size ? [...tgtsRef.current.values()] : undefined,
    };
    try {
      for (let i = 0; i < 3; i += 1) {
        const at0 = await readRemoteDraftAt(want);
        if (at0 === undefined) return { ok: false, why: tr('алсын ноорогийг шалгаж чадсангүй') };
        let remote: Draft | null = null;
        if (at0 !== null) {
          const rr = await readRemoteDraft(want);
          if (!rr.ok) return { ok: false, why: rr.error };
          remote = rr.draft ? parseDraft(rr.draft.payload, 'remote') : null;
        }
        const merged0 = compactDraft(mergeDrafts(remote, tomb) ?? tomb,
          { max: REMOTE_MAX, minOid: pkgKeyRef.current === want ? minOidRef.current : null, frameSeenAt: pkgKeyRef.current === want ? frameSeenFor(frameSeenRef.current, minOidRef.current) : null });
        const out: Draft = { ...merged0, t: Math.max(Date.now(), merged0.t, at0 != null ? at0 + 1 : 0) };
        const body = JSON.stringify(out);
        if (body.length > remoteMax()) return { ok: false, why: tr('ноорог хэт том') };
        const r = await saveRemoteDraft(want, out.t, body, { expectAt: at0 });
        if (r.ok) return { ok: true };
        if (!('conflict' in r && r.conflict)) return { ok: false, why: r.error };
      }
      return { ok: false, why: tr('өөр хүн зэрэг бичиж байна') };
    } catch (e) {
      return { ok: false, why: String((e as Error).message || e) };
    }
  }, [stamp, pkgKeyRef]);
  /**
   * «ИЛГЭЭХ»-ИЙН ӨМНӨ ХУВААЛЦСАН НООРОГИЙГ ДАХИН УНШИНА (2026-10-09) — `FillNew.publish`-ийн эхэнд.
   */
  const pullNow = useCallback(async (want: string): Promise<'same' | 'changed' | 'fail'> => {
    const at = await readRemoteDraftAt(want);
    if (at === undefined) return 'fail';
    if (at === null || at === lastMergedRef.current) return 'same';
    const rr = await readRemoteDraft(want);
    if (!rr.ok) return 'fail';
    if (pkgKeyRef.current !== want || loadedPkgRef.current !== want) return 'fail';
    const remote = rr.draft ? parseDraft(rr.draft.payload, 'remote') : null;
    if (!remote) return 'same';
    if (at < lastMergedRef.current) lastMergedRef.current = 0;
    if (remote.t <= lastMergedRef.current) return 'same';
    const merged = mergeDrafts(readDraft(want), remote);
    deferredRef.current = null;
    lastMergedRef.current = remote.t;
    const r = merged ? pickDraftRef.current(merged, 'remote', { poll: true }) : null;
    return r && (r.changed || r.rcpt > 0) ? 'changed' : 'same';
  }, [pkgKeyRef, loadedPkgRef]);
  const tgtSeenRef = useRef<{ pkg: string; t: number } | null>(null);
  useEffect(() => {
    const t = curTgt?.[0] ?? 0;
    const prev = tgtSeenRef.current;
    if (restDonePkg !== pkg.key || !prev || prev.pkg !== pkg.key) { tgtSeenRef.current = { pkg: pkg.key, t }; return; }
    if (prev.t === t) return;
    if (busy || !canPerf || noEdit || !sc || editOpen || loadedPkgRef.current !== pkg.key) return;
    tgtSeenRef.current = { pkg: pkg.key, t };
    const d = readDraft(pkg.key);
    if (d) pickDraftRef.current(d, 'local', { poll: true });
  }, [curTgt, restDonePkg, pkg.key, busy, canPerf, noEdit, sc, editOpen, loadedPkgRef]);
  const offTgtKeys = useCallback((keys: readonly string[]): string[] => {
    const t = curTgtRef.current?.[0] ?? 0;
    if (!t) return [];
    return keys.filter((k) => offTarget(t, mineRef.current.has(k) ? meKey : byMapRef.current.get(k), meKey, tgtsRef.current));
  }, [meKey]);
  const storedMine = useCallback(async (want: string, soid: number): Promise<string[] | null> => {
    if (!meKey) return [];
    const rr = await readRemoteDraft(want);
    if (!rr.ok) return null;
    const remote = rr.draft ? parseDraft(rr.draft.payload, 'remote') : null;
    const d = mergeDrafts(readDraft(want), remote);
    if (!d) return [];
    /* логик цагийг урагшлуулна — дараагийн `dropMine`-ийн tombstone эдгээр хуулбараас ХОЖУУ байна (`stamp`) */
    seeClock(d);
    let e: [string, number, number, number] | undefined = tgtsRef.current.get(meKey);
    for (const x of d.tgt ?? []) if (x[0] === meKey && (!e || x[3] > e[3])) e = x;
    if (e && e[1] === soid) return [];
    const by = new Map<string, string>();
    for (const [k, u] of d.by ?? []) by.set(k, String(u).trim().toLowerCase());
    const forced = new Set((d.hold ?? []).filter((h) => h[2] === 1).map((h) => h[0]));
    return [...d.cells, ...(d.dates ?? [])].map(([k]) => k).filter((k) => by.get(k) === meKey && !forced.has(k));
  }, [meKey, seeClock]);
  const dropMine = useCallback((want: string, keys: readonly string[]) => {
    if (!keys.length || pkgKeyRef.current !== want) return;
    const nowMs = stamp();
    const ks = new Set(keys);
    for (const k of ks) {
      if ((delRef.current.get(k) ?? 0) < nowMs) delRef.current.set(k, nowMs);
      mineRef.current.delete(k);
      mineAtRef.current.delete(k);
    }
    const strip = (p: Record<string, string>) => {
      if (!Object.keys(p).some((k) => ks.has(k))) return p;
      const n = { ...p };
      for (const k of ks) delete n[k];
      return n;
    };
    setPending(strip);
    setPendDate(strip);
    if (meKey) tgtsRef.current.set(meKey, [meKey, 0, 0, nowMs]);
    setDraftTgt(null);
    const tomb: Draft = {
      t: nowMs, mode: 'inc', cells: [], dates: [], rowKeys: [],
      del: [...ks].map((k): [string, number] => [k, nowMs]),
      tgt: [...tgtsRef.current.values()],
    };
    const w = writeDraftLS(want, tomb);
    setLocalFail(!w.ok);
    markUnsynced(want, tomb.t);
    remoteQueue.current = { pkg: want, draft: tomb };
    setRemoteTick((n) => n + 1);
  }, [meKey, stamp, pkgKeyRef, setPending, setPendDate]);
  return {
    offTgtKeys, storedMine, dropMine,
    pullNow,
    pushReceipts,
    savedAt, keepDraft, remoteQueue, mineRef, mineAtRef, delRef, asOfRevRef, asOfAtRef, draftLiveRef, touchMine, revert,
    lastMergedRef, doneRef, doneBy, setDoneBy, byMap, setByMap, byAtMap, setByAtMap, byAtRef, lastBodyRef,
    remoteState, setRemoteState, promptedPkgRef, flushRef,
    meKey, participants, waitingOn, byCount, iAmDone, canSubmitNow, toggleDone, dropDraft,
    /* 2026-10-06 аудит — түгжиж буй хүний сүүлийн идэвх */
    waitingLast,
    /* 2026-10-01 */
    undoAllMarks, resetMarks, stamp, restoringUi, offline,
    clearRestoreDone,
    /* 2026-10-04 аудит — баримт · суурь · зорилт · локал алдаа */
    rcptRef, btRef, datesBRef, asOfBRef, draftTgt, setDraftTgt, localFail,
    /* 2026-10-04 дахин аудит — тэмдэглэсэн нүд (#7) · хүн бүрийн зорилт (#4) */
    heldN, dropHeld, resetHeldTgt, clearMyTgt,
    /* 2026-10-09 аудит №6 — серверийн илгээлтийн баримт + харсан агшин */
    noteSubReceipts,
  };
}
export type DraftSync = ReturnType<typeof useDraftSync>;
