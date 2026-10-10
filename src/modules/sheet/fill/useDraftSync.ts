/*
 * ⚠️ 2026-09-30: `FillNew.tsx` (6.9k мөр) задарсан — НООРОГИЙН СИНК — сэргээх · нийлүүлэх · хадгалах · алсын хуулбар (3 сек) · татах мөчлөг · оролцогчийн түгжээ.
 *    Код ЯГ хэвээр зөөгдсөн, зан төлөв өөрчлөгдөөгүй; `draft.check.mjs` ·
 *    `shareDraft.check.mjs` эх кодын шалгуураа FillNew.tsx + fill/* нийлбэрээс уншина.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Pkg, Schema } from "../bagts.pkg";
import { editPct, fmtInc, isPctEdit, parseInc, type SheetRow } from "../bagtsSheet";
import {
  clearRemoteDraft, readRemoteDraft, readRemoteDraftAt, saveRemoteDraft, REMOTE_MAX,
  clearLegacyDrafts, readLegacyDrafts, type RemoteDraftRead,
} from "@/lib/draftRemote";
import { t as tr } from "@/lib/i18nCore";
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
  /* ⚠️ 2026-10-09 (аудит №3): 'tgt' — эзний зорилт (`Draft.tgt`) одоогийн буцаагдсан илгээлтийн засвараас ӨӨР
     (өнөөдрийн/өөр өдрийн ажил) тул тэр засварт НИЙЛҮҮЛЭХГҮЙ, ноорогт хадгална. Хугацаагүй (засвар дуусмагц
     дараагийн буулгалтад буцаж гарна), «Тэмдэглэсэн нүдийг хаях»-д хамаарахгүй, `Draft.hold`-д бичигдэхгүй. */
  why: 'ambig' | 'srv' | 'drop' | 'old' | 'tgt'; rk?: string; occ?: [number, number, number];
  /** Огнооны суурь (`Draft.datesB`, #8) — серверт өөрчлөгдсөн огноонд */
  b?: string;
};
/* ⚠️ 2026-10-09 (аудит №3): зорилтоор хойшлуулсан ('tgt') нүд «тэмдэглэсэн» тоонд ОРОХГҮЙ — тэр нь хуучирсан/
   хоёрдмол биш, засвар дуусмагц буцаж гарна; «Тэмдэглэсэн нүдийг хаях» түүнийг (хамтран бөглөгчийн ажлыг) устгахгүй. */
const heldVisN = (m: ReadonlyMap<string, Held>) => { let n = 0; for (const h of m.values()) if (h.why !== 'tgt') n += 1; return n; };
/** ⚠️ 2026-10-09: `pickDraft`-ийн үр дүн (`pullNow` — «Илгээх»-ийн өмнөх алсын шалгалт) */
type PickRes = { changed: boolean; rcpt: number };

/**
 * СЕРВЕРИЙН ИЛГЭЭЛТЭЭС ГАРГАСАН БАРИМТ (2026-10-09) — ЦЭВЭР. Илгээгчийн (А) `pushReceipts` унасан бол хамтран
 * бөглөгч (Б) А-гийн илгээсэн нүдний баримтыг ХЭЗЭЭ Ч авахгүй байв: Б-гийн сэргээлт тэдгээрийг «илгээгээгүй» гэж
 * буцааж, дахин илгээхэд нэмэлтийн горимд ДАВХАР тоологдоно. Одоо ачаалах ба `refreshStaged`-д серверийн `sub|`
 * payload-оос (нүд · огноо, илгээлтийн `at`) баримт гаргана — А-гийн табаас ҮЛ ХАМААРАН.
 * ⚠️ Нүд бүрийн ЯГ илгээсэн утга payload-д алга (`cells` нь өдрийн НИЙЛБЭР), тиймээс баримт нь
 *    `[түлхүүр, at, '', at]`: `rcptApply` илгээлтээс ӨМНӨ (`w ≤ at`) бичигдсэн хуулбарыг ХАСНА, ХОЙШ бичигдсэнийг
 *    ХЭВЭЭР үлдээнэ (хоосон `sv` — зөрүү бодохгүй). Илгээлтийн агшинд хараахан нийлүүлэгдээгүй байсан хуулбар
 *    ч хасагдаж болно (дутуу тоолол) — давхар тоололоос аюулгүй.
 * ⚠️ 2026-10-09 (аудит №6): тэр дутуу тоололыг ИЛ хэлнэ — `landMoved` хоосон `sv`-тэй баримтаар хасагдсан
 *    түлхүүрийг тусад нь тоолж (`rcSub`) `warns`-д гаргана; урьд нь тайлбар «ил» гэдэг ч код чимээгүй байв.
 *    Мөн `p.at` нь ӨӨР машины цаг, `w` нь энэ табын HLC тул `noteSubReceipts` тэдгээр түлхүүрт `p.at`-ийг
 *    «харсан» (`seenAtRef`) гэж тэмдэглэнэ — дараагийн гар засвар `stampKey`-ээр `at`-аас ХОЖУУ тамгалагдаж,
 *    баримтанд дахин хасагдахгүй.
 * ⚠️ ЖИНХЭНЭ баримт (агшин нь `at`-аас хойш — илгээгчийн `stamp()`) байвал ГАРГАХГҮЙ — тэр нь нарийн (зөрүү бодно).
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
    out.push([k, p.at, '', p.at]);
  }
  return out;
}
/** Хоёр баримтаас ХОЖУУ (`a` их) нь — серверээс гаргасан (`subReceipts`) баримт жинхэнэ шинэ баримтыг дарахгүй */
const newerRc = (a: Rcpt | undefined, b: Rcpt | undefined): Rcpt | undefined =>
  !a ? b : !b ? a : b[1] > a[1] ? b : a;

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
   * 2026-10-04 аудит (#6, `Draft.tgt`). ⚠️ Дуудагч `useMemo`-оор тогтвортой дамжуулна.
   */
  curTgt: [number, number] | null;
  show: (kind: NoticeKind, msg: string) => void;
  say: (msg: string) => void;
  /**
   * ⚠️ 2026-10-09: САЛАА (ЧУХАЛ БИШ) МЭДЭГДЭЛ — «Ноорог сэргээв…». Урьд нь `say` («Энэ нүд засагдахгүй.»
   *    гарчигтай) татах мөчлөг бүрд (3–6 сек) дуудагдаж, ЧУХАЛ анхааруулгыг дардаг байв. Дуудагч
   *    (FillNew) одоо харагдаж буй ЧУХАЛ мэдэгдлийг дарахгүй; байхгүй бол `say`.
   */
  soft?: (msg: string) => void;
  /**
   * ⚠️ 2026-10-09: татах мөчлөгийн нийлүүлэлт ШИНЭ илгээлтийн баримт авчирсан (`draft.newReceipts`) —
   *    дуудагч илгээлтийг (`staged`) ба давхарлалтыг дахин уншина. `at` = хамгийн шинэ баримтын агшин.
   */
  onReceipts?: (at: number) => void;
  /** ⚠️ 2026-10-09: нүдийг богино хугацаанд тодруулна (өөр хүн өөрчилсөн өөрийн нүд) */
  flashCells?: (keys: string[]) => void;
  /** ⚠️ 2026-10-09: түлхүүрүүдээс ОДОО дэлгэцэнд зурагдсан нь (харагдаж буй нүд) */
  visibleKeys?: (keys: string[]) => string[];
  /**
   * ⚠️ 2026-10-09 (аудит №3): буцаагдсан илгээлтийн ЗӨВШӨӨРӨГДСӨН (ногоон ✓) нүд (`FillNew.okLockAt` — блокийн
   *    индексээр). Урьд нь түгжээ зөвхөн UI-д байсан тул сэргээлт/хамтран бөглөгчийн нийлүүлэлт тэр нүдний утгыг
   *    `pending`-д буулгаж, «Илгээх» түүнийг илгээдэг байв. `pickDraft` одоо тэднийг хаяна (tombstone).
   */
  okLock?: (oid: number, b: number) => boolean;
}) {
  const {
    pkg, user, busy, rows, sc, nBld, canPerf, noEdit, asOf, asOfOrig, setAsOf,
    pending, setPending, pendDate, setPendDate, dirtyCount, pvDirty, fillMode, loadedPkgRef, pkgKeyRef, editRef, editOpen, curTgt, show, say,
  } = p;
  /**
   * ⚠️ 2026-10-09: дуудагчийн callback-ууд REF-д — `pickDraft` (тогтвортой хамааралтай) ба татах мөчлөг
   *    тэдгээрийг хамааралгүйгээр дуудна (тоолуур дахин эхлэхгүй).
   */
  const cbRef = useRef({ soft: p.soft, onReceipts: p.onReceipts, flashCells: p.flashCells, visibleKeys: p.visibleKeys, okLock: p.okLock });
  useEffect(() => {
    cbRef.current = { soft: p.soft, onReceipts: p.onReceipts, flashCells: p.flashCells, visibleKeys: p.visibleKeys, okLock: p.okLock };
  }, [p.soft, p.onReceipts, p.flashCells, p.visibleKeys, p.okLock]);
  /**
   * ⚠️ 2026-10-09 (аудит №3): ОДООГИЙН зорилт REF-д — `pickDraft` (тогтвортой хамааралтай) ба `offTgtKeys`
   *    («Илгээх»-ийн шалгалт) уншина. Сэргээх эффектээс ӨМНӨ зарлагдсан тул нэг commit-д шинэ утгыг харна.
   */
  const curTgtRef = useRef(curTgt);
  useEffect(() => { curTgtRef.current = curTgt; }, [curTgt]);
  /**
   * ⚠️ 2026-10-09: ДЭЛГЭЦ ДЭЭРХ утга (нийлүүлэхээс ӨМНӨ) — `pickDraft` юу өөрчлөгдснийг (`lostMine` ·
   *    «харагдаж буй нүд өөрчлөгдсөн» · `pullNow`) харьцуулахад. Уншигчид нь бүгд async/үйл явдал.
   */
  const pendingRef = useRef(pending);
  const pendDateRef = useRef(pendDate);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => { pendDateRef.current = pendDate; }, [pendDate]);
  /* ⚠️ 2026-09-30: `useCellEdit`-ийн `volMode`-той ИЖИЛ дүрэм (тэр hook энэ hook-ийн ДАРАА дуудагддаг
     тул сэргээлтэд (`pickDraft`) эндээ давтав — хаалтын зан төлөв урьдын адил). */
  /* ⚠️ 2026-10-09: блокгүй багцын Обьёмгүй мөр (`synNoVol`) — `useCellEdit.volMode`-той ИЖИЛ дүрэм */
  const volMode = (r: { group: boolean; vol?: number | null }, b: number) =>
    !r.group && (fillMode === "pct" || !!sc?.obyem[b]) && !synNoVol(sc, r);
  /**
   * НООРОГ СҮҮЛД ХАДГАЛАГДСАН АГШИН (ms) — зөвхөн дэлгэцийн баталгаа.
   * ⚠️ Автомат хадгалалт нь ЧИМЭЭГҮЙ бол хэрэглэгч итгэхгүй: «хадгалагдсан
   * болов уу» гэж эргэлзэн Нийтлэхийг дутуу дарна. Ил тэмдэг хэрэгтэй.
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
   * ⚠️ ЯАГААД: мөр ачаалагдмагц ХОЁР эффект нэг commit-д ажилладаг —
   *   (1) сэргээх эффект `promptedPkgRef = pkg.key` тавиад алсын ноорогийг
   *       `await`-аар уншиж эхэлнэ (async);
   *   (2) хадгалах эффект тэр даруй sync ажиллаж, `pending` хоосон тул
   *       «нийтэлсэн/болиулсан» гэж дүгнэж `clearDraftLS` + `clearRemoteDraft`
   *       дуудна.
   * Локал ноорог (1)-д аль хэдийн уншигдсан тул сэргэнэ, харин АЛСЫН ноорог
   * `readRemoteDraft`-аас ӨМНӨ устгагдаж болно — хоёр ArcGIS хүсэлт
   * уралдана. Мөн `pickDraft` хүртэл хэрэглэгч багц солих/таб хаавал ноорог
   * УСТГАГДСАН ч СЭРГЭЭГДЭЭГҮЙ үлдэнэ. «Ноорог заримдаа алга болдог» гэсэн
   * гомдлын үндсэн шалтгаан.
   *
   * `true` байхад хадгалах эффект хоосон төлөвийг ҮЛ ТООНО; сэргээлт дуусаад
   * (буусан, эсвэл сэргээх зүйлгүй нь батлагдсан) `false` болно.
   */
  const restoring = useRef(false);
  /**
   * ЭНЭ СЕШНД ГАРААС бөглөсөн нүднүүд (`${oid}:${блок}`) — 2026-09-08.
   *
   * ⚠️ ЯАГААД ХЭРЭГТЭЙ: ноорог хуваалцагдсан тул `pending` дотор БУСДЫН
   * бөглөсөн нүд ч байна (нийлүүлэлтээр ирсэн). Ноорог бичихдээ `pending`-ийн
   * БҮХ нүдийг өөрийн нэрээр тэмдэглэвэл оролцогчийн жагсаалт нэг хүн болж
   * хумигдаж, «Илгээх»-ийн түгжээ утгагүй болно — хагас бөглөсөн ажил
   * илгээгдэнэ. Тиймээс өөрийн ГАРААС бичсэн нүдийг л энд хөтөлнө.
   *
   * ⚠️ Багц солиход ЦЭВЭРЛЭГДЭНЭ (`pkg.key` эффект) — эс бөгөөс Багц 1-д
   * бичсэн түлхүүр Багц 2-ын ноорогт эзэн болж наалдана.
   */
  const mineRef = useRef<Set<string>>(new Set());
  /**
   * ӨӨРИЙН НҮД БҮРИЙГ СҮҮЛД ХӨНДСӨН АГШИН (`key` → ms) — 2026-09-21.
   * `Draft.byAt`-д бичигдэж, (а) `waitingOn`-ийн «3 хоног идэвхгүй» шүүлт,
   * (б) `mergeDrafts`-ийн tombstone (`del`) харьцуулалт хоёуланд хэрэглэгдэнэ.
   * ⚠️ `mineRef`-тэй ХАМТ цэвэрлэгдэнэ (багц солих · ноорог устгах · илгээх).
   */
  const mineAtRef = useRef<Map<string, number>>(new Map());
  /**
   * ЛОГИК ЦАГ (HLC) — 2026-10-01 (хэрэглэгч: бүгдийг зас).
   * ⚠️ ЯАГААД: `byAt`/`del`/`marks`-ийн агшин нь ӨӨР ӨӨР компьютерийн цаг. Б-гийн цаг
   *    А-гийнхаас хоцорсон бол Б-гийн ХОЖУУ засвар А-гийн хуучин бичилтээс «эрт» болж
   *    нийлүүлэлтэд ялагддаг байв. Одоо өөрийн агшин нь `max(одоо, харсан хамгийн их
   *    агшин + 1)` — нийлүүлэлтээр ирсэн агшнаас ҮРГЭЛЖ хожуу (шалтгаант дараалал
   *    хадгалагдана). Серверийн тамга энэ хүснэгтэд байхгүй (Editor Tracking-гүй).
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
    /* ⚠️ 2026-10-06: «Шинэчлэгдсэн огноо»-ны агшин (`asOfAt`) ба хүн бүрийн зорилтын агшин
       (`tgt[3]`) ч ЭНЭ цагаар тамгалагдаж `mergeDrafts`-д харьцуулагддаг — урьд нь цаг тэднээр
       урагшлахгүй тул цаг нь хоцорсон төхөөрөмжийн ХОЖУУ өөрчлөлт «эрт» болж ялагддаг байв. */
    see(d.asOfAt);
    for (const e of d.tgt ?? []) see(e[3]);
    clockRef.current = m;
  }, []);
  /**
   * ⚠️ 2026-10-09: ТҮЛХҮҮР БҮРД ХАРСАН хамгийн их алсын агшин (`byAt` · `del` · баримтын `a`) — `pickDraft`
   *    дүүргэнэ, багц солиход тэглэгдэнэ (`resetHeldTgt`). `stampKey` = `draft.editStamp`-ийн ⚠️ (HLC):
   *    гараар засвар нь тэр түлхүүрт харсан алсын бичилт/tombstone-оос ҮРГЭЛЖ хожуу.
   * ⚠️ `seeClock`-ийн «366 хоногоос хол ирээдүй» хамгаалалт энд ч — эс бөгөөс эвдэрсэн агшин өөрийн
   *    `mineAtRef`-ийг (→ `waitingOn`-ийн идэвхийн лавлах) ирээдүй рүү түлхэнэ.
   */
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
   * `Draft.marks`-ийн ⚠️). `doneRef`/`doneBy` нь эндээс ГАРГАСАН хуулбар.
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
   * ⚠️ Нүдийг дахин бичихэд тэмдэглэгээ нь АРИЛНА (`touchMine`).
   */
  const delRef = useRef<Map<string, number>>(new Map());
  /**
   * ИЛГЭЭЛТИЙН БАРИМТУУД (`Draft.rcpt`, 2026-10-04 аудит #4) — `түлхүүр → [түлхүүр, a, sv, sa]`.
   * ⚠️ `delRef`-ээс ТУСДАА: нүдийг дахин бичихэд (`touchMine`) АРИЛАХГҮЙ — шинэ бичилт нь
   *    баримтыг «харсан» (`btRef`) гэдгээ тэмдэглэхэд хэрэгтэй. 7 хоногт хуучирна.
   * ⚠️ ЗӨВХӨН бүтэн буулгалтад (`pickDraft`, `sharedOnly` биш) шинэчлэгдэнэ — нүдний утга
   *    (`pending`) хараахан хөрвөөгүй байхад «харсан» гэж тэмдэглэвэл илгээлтээс өмнөх
   *    мөчрийн утга «шинэ нэмэлт» болж ДАВХАР тоологдоно.
   */
  const rcptRef = useRef<Map<string, Rcpt>>(new Map());
  /**
   * ⚠️ 2026-10-09 (аудит №6): серверийн илгээлтээс баримт гаргаж (`subReceipts`) `rcptRef`-д тавихын зэрэгцээ
   *    тэр түлхүүрүүдэд илгээлтийн `at`-ийг «харсан» гэж тэмдэглэнэ (`seenAtRef` → `stampKey`): `at` өөр
   *    машины цаг тул энэ табын цаг хоцорсон бол дараагийн гар засвар `w ≤ at` болж баримтанд ЧИМЭЭГҮЙ
   *    хасагдах байв. FillNew-ийн ачаалах эффект ба `refreshStaged` ҮҮГЭЭР (шууд `subReceipts` биш).
   *    (`rcptRef`-ийн ДАРАА зарлана — өмнө нь зарлавал react-hooks/immutability `rcptRef`-ийг ref гэж танихгүй.)
   */
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
   * ⚠️ «НААЛДАМТГАЙ»: ноорогт зорилт бичигдсэн бол хэрэглэгч тэр илгээлтийг сонгох (`resumeReturned`)
   *    эсвэл ноорог устгах/илгээх хүртэл ҮЛДЭНЭ; FillNew нь одоогийн зорилттой таарахгүй үед
   *    «Илгээх»-ийг түгжинэ. Багц солиход тэглэгдэнэ (дараагийн сэргээлт уншина).
   */
  const [draftTgt, setDraftTgt] = useState<[number, number] | null>(null);
  const draftTgtRef = useRef<[number, number] | null>(null);
  useEffect(() => { draftTgtRef.current = draftTgt; }, [draftTgt]);
  /**
   * ХҮН БҮРИЙН ЗОРИЛТ (`Draft.tgt`, 2026-10-04 дахин аудит #4) — нэр → `[нэр, OBJECTID, fillMs, агшин]`.
   * ⚠️ Ноорогт ЭНЭ ТАБЫН мэдэх БҮХ хүний зорилт бичигдэнэ (уншилтгүй `flush` алсыг энэ төлөвөөр
   *    дарж болох тул бусдынх алга болохгүй); түгжээ (`draftTgt`) нь зөвхөн ӨӨРИЙН бичлэгээс.
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
   * ⚠️ Урьд нь хоёрдмол/серверт өөрчлөгдсөн/хуучирсан нүд ЗӨВХӨН локалд (нийлүүлж бичих замаар)
   *    үлдэж, хоосон ноорогийн цэвэрлэгээг МӨНХӨД хааж, алсад тогтворгүй байв. Одоо ТАБЫН төлөвт —
   *    хадгалах эффект ноорогт (локал + алс) тогтвортой бичнэ; `DEL_TTL_MS`-ийн дараа (тэмдэглэснээс)
   *    tombstone-той хаягдана; «Тэмдэглэсэн нүдийг хаях» (`dropHeld`) зөвхөн тэднийг хаяна.
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
    /* ⚠️ 2026-10-09 (аудит №3): зорилтоор хойшлуулсан ('tgt') нүд ҮЛДЭНЭ (`heldVisN`-ийн ⚠️) */
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
  /** ⚠️ 2026-10-09: «{0} таны бөглөсөн нүдийг өөрчиллөө» — нүд бүрд НЭГ удаа (`${түлхүүр}@${агшин}`) */
  const lostSeenRef = useRef<Set<string>>(new Set());
  /** Багц солиход — тэмдэглэсэн нүд ба зорилт БАГЦЫН төлөв (FillNew-ийн цэвэрлэгээ) */
  const resetHeldTgt = useCallback(() => {
    heldRef.current = new Map();
    setHeldN(0);
    tgtsRef.current = new Map();
    /* ⚠️ 2026-10-09: түлхүүрийн харсан агшин (HLC) ба «өөрийн нүд өөрчлөгдсөн» мэдэгдсэн нь ч БАГЦЫН төлөв */
    seenAtRef.current = new Map();
    lostSeenRef.current = new Set();
  }, []);
  /**
   * ОДООГИЙН ЖААЗНЫ хамгийн бага эерэг OBJECTID — `compactDraft`-ийн «хуучин жаазны баримт»-ыг таних
   * (жааз бүр өсөх oid-той хуулагддаг). `null` = мөр ачаалагдаагүй (шахалт хуучин жаазыг хөндөхгүй).
   */
  const minOidRef = useRef<number | null>(null);
  useEffect(() => {
    let m = Number.POSITIVE_INFINITY;
    for (const r of rows) if (r.oid >= 0 && r.oid < m) m = r.oid;
    minOidRef.current = Number.isFinite(m) ? m : null;
  }, [rows]);
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
   * «ШИНЭЧЛЭГДСЭН ОГНОО»-НЫ ЛОГИК АГШИН (⚠️ 2026-10-05, `Draft.asOfAt`-ийн ⚠️). `v` = ноорогт
   * бичигдэх утга (`null` = ил буцаалт), `at` = түүнийг ТАВЬСАН агшин: энэ табд хэрэглэгч
   * өөрчилбөл `stamp()`, ноорогоос (бусдаас) буусан бол ТЭР ноорогийн агшин — ингэснээр бусдын
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
  /* ⚠️ `useCallback` — зөвхөн үйл явдлын дотор дуудагддаг тул render-д хамаагүй; react-compiler-ийн
     «impure during render» шалгуур энгийн функцийг ялгадаггүй (2026-09-21). */
  const touchMine = useCallback((key: string) => {
    /* ⚠️ 2026-10-01: логик цаг (`stamp`) — цагийн зөрүүнд тэсвэртэй */
    /* ⚠️ 2026-10-09: тухайн түлхүүрт ХАРСАН алсын агшнаас ч хожуу (`stampKey` — HLC) */
    mineAtRef.current.set(key, stampKey(key));
    delRef.current.delete(key);
    /* ⚠️ 2026-10-04 (#4): энэ бичилт ХАРСАН хамгийн сүүлийн баримтаас ХОЙШ — `rcptApply`
       түүнийг «шинэ нэмэлт» гэж үзнэ (илгээлтээс өмнөх мөчир биш). */
    const rc = rcptRef.current.get(key);
    if (rc) btRef.current.set(key, rc[1]);
  }, [stampKey]);
  /* ⚠️ `tombstone()` туслах ХАСАГДАВ (2026-09-24): ганц дуудагч нь `dropAdd` байсан
     (мөр нэмэх Хуваарь руу шилжсэн); нүдний буцаалт `delRef`-д шууд бичнэ (доор). */
  /**
   * ХАДГАЛАГДСАНТАЙ ИЖИЛ утга бичсэн (`sameVol`/`samePct`/`sameDate`/paste-ийн
   * `same`) — 2026-09-21-ний дахин аудит.
   *
   * ⚠️ ЯАГААД ХОЁР ЗАМ: урьд нь ижил утга бичихэд ҮРГЭЛЖ tombstone тавьдаг байв.
   *    Гэтэл нүд pending-д ОГТ БАЙГААГҮЙ (дэлгэцэд хадгалагдсан утга харагдаж
   *    байсан) бол хэрэглэгч юуг ч буцаагаагүй — харин Б-гийн 3 секундын дотор
   *    хараахан ирээгүй бичилт тэр нүдэнд байж болно; tombstone нь (агшин нь
   *    Б-гийнхээс хожуу тул) `mergeDrafts`-аар Б-гийн нүдийг УСТГАДАГ байв.
   *    · pending-д БАЙСАН → жинхэнэ буцаалт: `mineRef` + tombstone (хуучин зан);
   *    · pending-д БАЙГААГҮЙ → нөгөө талын утгыг хөндөхгүй: tombstone ҮГҮЙ,
   *      эзэмшил ч үгүй (өөрийн юу ч байхгүй), зөвхөн идэвхийн агшин
   *      (`waitingOn`-ийн 3 хоногийн шүүлтэд «би идэвхтэй» гэж тоологдоно).
   */
  const revert = useCallback((key: string, wasPending: boolean) => {
    if (wasPending) {
      mineRef.current.add(key);
      /* ⚠️ 2026-10-09: буцаалт ч гараар засвар — тухайн түлхүүрт харсан алсын агшнаас хожуу (`stampKey`) */
      delRef.current.set(key, stampKey(key));
    } else {
      mineAtRef.current.set(key, stampKey(key));
    }
  }, [stampKey]);
  /**
   * СҮҮЛД НИЙЛҮҮЛСЭН алсын ноорогийн агшин — давхар нийлүүлэлтээс сэргийлнэ.
   * ⚠️ Өөрийн сая бичсэн хуулбар эргэж ирэхэд дахин суулгавал бичиж байгаа
   *    нүд дэмий дахин зурагдаж, курсор үсэрнэ.
   */
  const lastMergedRef = useRef(0);
  /**
   * ХУУЧИН (`хэрэглэгч|багц`) мөрүүд ШИЛЖИЖ, устгагдахаа хүлээж буй багц.
   * ⚠️ Устгалтыг шинэ түлхүүрт АМЖИЛТТАЙ бичсэний ДАРАА л хийнэ — эс бөгөөс
   *    сүлжээ унахад ажил бүрмөсөн алдагдана (устгасан ч бичигдээгүй).
   */
  const legacyPendingRef = useRef<string>('');
  /**
   * «ДУУСГАСАН» ТЭМДЭГЛЭГЭЭ — ноорогийн ӨӨРИЙН төлөв (нэр → агшин).
   *
   * ⚠️ ЯАГААД REF: хадгалах эффект нь `pending`/`pendDate`-аас хамаардаг ба
   * `done`-ыг өөрчилдөггүй. Хамаарлын жагсаалтад `done`-ыг оруулбал товч
   * дарах бүрд бүтэн ноорог дахин бичигдэж, шаардлагагүй ArcGIS хүсэлт
   * үүснэ. Ref нь эсрэгээр: засвар бүрд ӨМНӨХ утгыг дамжуулж, товч дарахад
   * л ref ба төлөв хоёулаа шинэчлэгдэнэ.
   */
  const doneRef = useRef<[string, number][]>([]);
  /** «Дуусгасан» жагсаалт — дэлгэц зурахад (ref нь зурагдалт өдөөдөггүй) */
  const [doneBy, setDoneBy] = useState<[string, number][]>([]);
  /**
   * ИЛ ТЭМДГҮҮДИЙГ ТӨЛӨВТ буулгана — `marksRef` + гаргасан `doneRef`/`doneBy` (2026-10-01).
   * ⚠️ `doneRef`/`doneBy`-г ШУУД бүү тавь — эндээс л (нэг эх сурвалж).
   */
  const applyMarks = useCallback((m: Map<string, Mark>) => {
    marksRef.current = m;
    const d = doneOfMarks(m);
    doneRef.current = d;
    setDoneBy(d);
  }, []);
  /**
   * БҮХ «ДУУСГАСАН» ТЭМДГИЙГ ИЛ БУЦААНА (2026-10-01) — «Илгээх»/«Ноорог устгах»-ийн дараа
   * шинэ мөчлөг эхэлнэ. ⚠️ Урьд нь `done: []` бичиж «нэр алга = буцаасан» дүрмээр
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
   * ⚠️ Төлөвийг шууд хамаарлын жагсаалтад нэмбэл нийлүүлэлт бүр (3 сек тутам)
   *    ноорогийг дахин бичүүлж, бичилт↔татах давталт үүснэ.
   */
  const byMapRef = useRef<Map<string, string>>(new Map());
  /* ⚠️ 2026-09-30: render-д биш ЭФФЕКТЭД тольдоно (react-hooks/refs) — уншигч нь дараа зарлагдсан эффект
     (нэг commit-д шинэ утгыг харна) эсвэл үйл явдал/async тул утга ижил. */
  useEffect(() => { byMapRef.current = byMap; }, [byMap]);
  /**
   * Нүд бүрийг СҮҮЛД хөндсөн агшин (`${oid}:${блок}` → ms) — нийлүүлэлтээр
   * ирсэн (`Draft.byAt`), 2026-09-21. `waitingOn`-ийн идэвхгүй шүүлтэд.
   * ⚠️ `byMap`-тай ижил дүрэм: зөвхөн `pickDraft` тавина, ref нь хадгалах
   *    эффектэд (хамаарлын жагсаалтад оруулахгүй — бичилт↔татах давталт).
   */
  const [byAtMap, setByAtMap] = useState<Map<string, number>>(new Map());
  const byAtRef = useRef<Map<string, number>>(new Map());
  /* ⚠️ 2026-09-30: render-д биш ЭФФЕКТЭД тольдоно (react-hooks/refs) — уншигч нь дараа зарлагдсан эффект
     (нэг commit-д шинэ утгыг харна) эсвэл үйл явдал/async тул утга ижил. */
  useEffect(() => { byAtRef.current = byAtMap; }, [byAtMap]);
  /**
   * СҮҮЛД АЛСАД БИЧСЭН ноорогийн бүтэн текст — дэмий бичилтийг таслахад.
   * ⚠️ Багц солиход ЗААВАЛ тэглэгдэнэ, эс бөгөөс Багц 2-ын анхны бичилт
   *    Багц 1-ийн биетэй санамсаргүй тэнцвэл (хоосон ноорог) алгасагдана.
   */
  const lastBodyRef = useRef<string>('');
  /** Алсын уншилт унасан бол сэргээх эффектийг ДАХИН асаах цохилт */
  const [remoteRetry, setRemoteRetry] = useState(0);
  /**
   * АЛСЫН ХУУЛБАРЫН БАЙДАЛ (2026-09-06).
   *
   * ⚠️ Урьд нь `remoteBig` гэсэн ганц boolean байсан бөгөөд ЗӨВХӨН «хэт том»
   * тохиолдлыг хэлдэг байв. Сүлжээ тасарсан, токен дууссан, хүснэгт олдоогүй
   * — эдгээрт дэлгэц «ноорог хадгалагдав» гэж ХЭВЭЭР баталдаг тул бөглөгч
   * алсад хуулагдсан гэж итгээд өөр компьютер дээр хоосон хуудас олдог байв.
   *
   * ⚠️ `null` = хараахан илгээгээгүй (эхний 3 секунд) — тэр үед юу ч
   *    хэлэхгүй, эс бөгөөс бичиж эхэлмэгц худал анхааруулга гарна.
   */
  const [remoteState, setRemoteState] = useState<RemoteState>(null);
  /** Сүүлийн алсын илгээлтийн агшин — дээд хүлээлтийн (60 сек) лавлах цэг */
  const lastRemoteRef = useRef(0);
  const promptedPkgRef = useRef("");
  /* ⚠️ 2026-10-09 (аудит №2): сэргээлтийн ҮЕИЙН тоолуур — эхэлсэн сэргээлт бүр нэмнэ. Тасалдсан (`!alive`)
     сэргээлт ЗӨВХӨН хамгийн сүүлийнх нь бол `restoring`/`promptedPkgRef`-ийг буцааж `remoteRetry` цохино.
     Урьд нь хуучин тасалдсан сэргээлт ШИНЭ (амьд) сэргээлтийн тавьсан `promptedPkgRef === pkg.key`-г харж
     хоослоод `remoteRetry` цохидог тул амьд нь тасарч, түүний хариу дараагийнхыг тасалдаг — гогцоо. */
  const restoreGenRef = useRef(0);
  /**
   * `flush`-ийн СҮҮЛИЙН хувилбарыг ref-д — unmount-ийн эффект (`[]` хамаарал)
   * түүнийг дуудна. Доорх эффект `remoteTick` бүрд `flush`-ыг дахин үүсгэдэг
   * тул unmount-ийн эффект тэр хаалтыг шууд барьж чадахгүй.
   */
  const flushRef = useRef<(pkgKey?: string) => void>(() => {});
  /**
   * АЛСЫН ХУУЛБАРЫГ ТҮГЖЭЭТЭЙ ХООСЛОНО (2026-10-04 аудит, #10) — `clearRemoteDraft`-ийн ОРОНД.
   * ⚠️ ЯАГААД: сохор устгалт нь уншсанаас хойш (хэдэн зуун мс-ийн цонхонд) БУСДЫН бичсэн
   *    нүдийг ч арчдаг байв. Одоо алсын хувилбарыг (`at`) уншиж, сүүлд ӨӨРӨӨ тусгаснаас
   *    (`lastMergedRef`) ӨӨР бол (өөр хүн бичсэн) ХӨНДӨХГҮЙ — дараагийн татах тойрог
   *    нийлүүлнэ; таарвал хоосон (`cells: []`) ноорогийг `expectAt`-тай бичнэ (мөргөлдвөл
   *    бичихгүй). Мөр огт байхгүй бол юу ч хийхгүй.
   */
  const safeClearRemote = useCallback(async (pkgKey: string, seenAt?: number) => {
    const at0 = await readRemoteDraftAt(pkgKey);
    if (at0 == null) return;
    /* `seenAt` — сэргээлтийн замд уншсан хувилбар (`restoreAtRef`); эс бөгөөс сүүлд нийлүүлсэн */
    const known = seenAt ?? lastMergedRef.current;
    if (!known || at0 !== known) return;
    const t = Math.max(stamp(), at0 + 1);
    /* ⚠️ 2026-10-04 дахин аудит (#4): зорилт хүн тус бүрээр — хоосон ноорог зорилтгүй (дараагийнх нь `undefined` = хөндөхгүй) */
    const empty: Draft = { t, mode: 'inc', cells: [], dates: [], rowKeys: [] };
    const r = await saveRemoteDraft(pkgKey, t, JSON.stringify(empty), { expectAt: at0 });
    if (r.ok) clearUnsynced(pkgKey, Number.MAX_SAFE_INTEGER);
  }, [stamp]);

  /* ══════════ ХУВААЛЦСАН НООРОГ — ОРОЛЦОГЧ ба «ИЛГЭЭХ»-ИЙН ТҮГЖЭЭ ══════════
   *
   * ⚠️ 2026-09-08, хэрэглэгчийн шийдвэр: «нэг багц дээр хэдэн ч аккаунт
   * ажиллана; хамгийн сүүлд үлдсэн хүн илгээх эрхтэй болно».
   *
   * ДҮРЭМ (тоо БИШ, ҮЛДЭГДЭЛ):
   *   оролцогч  = ноорогт нүд бөглөсөн хүн бүр (`by`) + «дуусгасан» дарсан хүн
   *   хүлээгдэж = оролцогч − өөрөө − дуусгасан
   *   Илгээх    ⟺ хүлээгдэж байгаа хүн БАЙХГҮЙ
   *
   * ⚠️ ТОО ХААНА Ч ХАТУУ БИЧИГДЭЭГҮЙ: 1 хүн ч, 5 хүн ч ижил ажиллана.
   *    Ганцаараа бөглөж байвал бусад оролцогч байхгүй тул түгжээ шууд
   *    нээлттэй — өнөөдрийн зантай ЯГ ИЖИЛ, шинэ алхам нэмэгдэхгүй.
   *
   * ⚠️ FAIL-OPEN: `by` алга (хуучин ноорог) бол оролцогч тодорхойгүй →
   *    хүлээх хүнгүй → илгээх нээлттэй. Бөглөлт ЗОГСОХ нь эрхийн алдаанаас
   *    хамаагүй хортой: хүн ажлаа илгээж чадахгүй бол хуудас нь утгагүй.
   */
  const meKey = user?.username?.trim().toLowerCase() ?? '';
  /**
   * Ноорог хөндсөн БҮХ хүн — өөрийгөө оруулаад.
   *
   * ⚠️ `byMap` нь ЗӨВХӨН `pickDraft`-аас (сэргээлт ба нийлүүлэлт) тавигддаг тул
   * ЭНЭ СЕШНД гараас бөглөсөн нүд түүнд ОРООГҮЙ байна — тэр нь `mineRef`-д л
   * бий. Тиймээс `mineRef`-ийг ч тооцох ёстой (2026-09-08-ны эвдрэл: хоёулаа
   * «Илгээх» идэвхтэй харагдаж байв). Дараалал нь:
   *   А бөглөнө → `mineRef` дүүрнэ, `byMap` ХООСОН хэвээр
   *   → `participants` = {} → `waitingOn` = [] → түгжээ ХЭЗЭЭ Ч асахгүй.
   * Одоо А өөрөө оролцогч болж, Б-гийн нийлүүлэлт ирмэгц Б ч нэмэгдэнэ.
   */
  const participants = useMemo(() => {
    const s = new Set<string>();
    for (const u of byMap.values()) if (u) s.add(u);
    for (const [u] of doneBy) if (u) s.add(u);
    /* ⚠️ Өөрийн ГАРААС бичсэн нүд байвал би ч оролцогч. `pending` шалгалтгүй:
       `mineRef` нь багц солиход цэвэрлэгддэг тул тэндэх түлхүүр нь энэ багцынх. */
    // eslint-disable-next-line react-hooks/refs -- ⚠️ 2026-09-30: `mineRef`/`mineAtRef` нь ЭНЭ СЕШНИЙ гараас бичсэн нүд — санаатай ref (дээрх ⚠️); төлөв болговол нүдний товшилт бүрд бүхэл хүснэгт дахин зурагдана
    if (meKey && mineRef.current.size) s.add(meKey);
    return s;
    /* ⚠️ `pending`/`pendDate` нь ХАМААРАЛД: `mineRef` бол ref тул өөрөө дахин
       бодолт өдөөдөггүй. Нүд бөглөх бүрд `pending` солигддог учир энэ хоёр нь
       «эзэмшил өөрчлөгдсөн» гэсэн цорын ганц найдвартай дохио.
       eslint-disable — `mineRef` нь ref, хамааралд орох ёсгүй. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byMap, doneBy, meKey, pending, pendDate]);
  /**
   * ХҮЛЭЭГДЭЖ БУЙ ОРОЛЦОГЧИД — «Илгээх»-ийг түгжиж буй хүмүүс.
   *
   * ⚠️ ИДЭВХГҮЙ ХҮНИЙГ ХАСНА (гацахаас сэргийлнэ): оролцогч «Дуусгасан»
   *    дарахаа мартаад амралт аваад алга болвол бусад нь МӨНХӨД илгээж
   *    чадахгүй үлдэнэ. `LOCAL_DRAFT_TTL_MS` (3 хоног) хугацаанд ноорог
   *    хөндөөгүй бол хүлээхээ болино — тэр хугацаа нь локал нооргийн
   *    амьдрах хугацаатай санаатай ижил.
   */
  const waitingOn = useMemo(() => {
    const doneSet = new Set(doneBy.map(([u]) => u));
    /*
     * ⚠️ ИДЭВХГҮЙ ШҮҮЛТ ОДОО ЖИНХЭНЭ АЖИЛЛАНА (2026-09-21-ний аудит). Дээрх
     *    тайлбар «3 хоног идэвхгүйг хасна» гэдэг байсан ч ноорогт агшин
     *    хадгалагддаггүй тул код хасдаггүй байв. Одоо `byAt` (нүд бүрийн сүүлд
     *    хөндсөн агшин) ба `done`-ийн агшнаас хүн бүрийн СҮҮЛИЙН идэвхийг
     *    гаргаж, `LOCAL_DRAFT_TTL_MS`-ээс хуучин бол хүлээхээ болино.
     * ⚠️ Агшин ОГТ байхгүй (хуучин ноорог) оролцогчийг ХЭВЭЭР хүлээнэ — энэ нь
     *    одоогийн зан; «мэдээлэлгүй» ≠ «идэвхгүй».
     */
    const lastAct = new Map<string, number>();
    const bump = (u: string, a: number | undefined) => {
      if (a != null && (lastAct.get(u) ?? 0) < a) lastAct.set(u, a);
    };
    for (const [k, u] of byMap) bump(u, byAtMap.get(k));
    for (const [u, a] of doneBy) bump(u, a);
    /* ⚠️ ӨӨРИЙН идэвх ч лавлагаанд ОРНО (2026-09-21-ний дахин аудит): `mineAtRef`
       нь `byAtMap`-д зөвхөн нийлүүлэлтээр (алсаас буцаж) ордог тул ганцаараа
       үргэлжлүүлж буй хүний хувьд «хамгийн сүүлийн идэвх» нь амралт авсан
       нөгөө оролцогчийнх хэвээр байж, тэр хүн хэзээ ч 3 хоног хоцорсон гэж
       тооцогдохгүй — түгжээ нээгддэггүй байв. `pending`/`pendDate` нь
       хамааралд: ref өөрөө дахин бодолт өдөөдөггүй (`participants`-тай ижил). */
    // eslint-disable-next-line react-hooks/refs -- ⚠️ 2026-09-30: `mineRef`/`mineAtRef` нь ЭНЭ СЕШНИЙ гараас бичсэн нүд — санаатай ref (дээрх ⚠️); төлөв болговол нүдний товшилт бүрд бүхэл хүснэгт дахин зурагдана
    if (meKey && mineAtRef.current.size) bump(meKey, Math.max(...mineAtRef.current.values()));
    /* ⚠️ Лавлах агшин нь render-ийн цаг (`Date.now()` — render-д хориотой, детерминист
       биш) БИШ, ноорог дахь ХАМГИЙН СҮҮЛИЙН идэвх: «бусдаас 3 хоногоос илүү хоцорсон»
       гэсэн утга — ноорог өөрчлөгдөх бүрт (3 сек тутмын нийлүүлэлт) дахин бодогдоно. */
    const latest = Math.max(0, ...lastAct.values());
    return [...participants]
      .filter((u) => u !== meKey && !doneSet.has(u))
      .filter((u) => { const a = lastAct.get(u); return a == null || latest - a <= LOCAL_DRAFT_TTL_MS; })
      .sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, doneBy, meKey, byMap, byAtMap, pending, pendDate]);
  /**
   * ТҮГЖИЖ БУЙ ХҮН БҮРИЙН СҮҮЛИЙН ИДЭВХ (мс) — 2026-10-06 аудит.
   *
   * ⚠️ ЯАГААД: «Илгээх — Б дуусгаагүй байна» гэдэг нь Б 3 хоногийн өмнө алга болсон
   *    эсэхийг хэлдэггүй тул сүүлийн хүн 3 хоног хүртэл ШАЛТГААНГҮЙ гацдаг байв. Одоо
   *    зурвас (`SubmitControls`) хүн бүрийн сүүлийн идэвхийг ба `LOCAL_DRAFT_TTL_MS`-ийн
   *    дараа автоматаар чөлөөлөгдөхийг хэлнэ.
   * ⚠️ Агшингүй (хуучин ноорог) хүн толинд ОРОХГҮЙ — «мэдээлэлгүй» ≠ «идэвхгүй»
   *    (`waitingOn`-ийн ⚠️); зурвас огноогүй нэрийг л бичнэ.
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
   *
   * ⚠️ ЯАГААД: оролцогчийн зурвас нь ХЭН гэдгийг хэлдэг ч ХИЧНЭЭН
   *    гэдгийг хэлдэггүй байв. «Б энд байна» ба «Б 340 нүд бөглөчихсөн»
   *    хоёр нь илгээхийн өмнөх шийдвэрт огт өөр жинтэй.
   *
   * ⚠️ Зөвхөн `pending` (илгээгээгүй) нүдээр — илгээгдсэн тоо нь хэний ч
   *    биш. Өөрийн нүд `byMap`-д ОРООГҮЙ байж болно (алсад хараахан
   *    хүрээгүй) тул `mineRef`-ээс нэмнэ.
   */
  const byCount = useMemo(() => {
    const m = new Map<string, number>();
    const bump = (u: string) => m.set(u, (m.get(u) ?? 0) + 1);
    for (const k of Object.keys(pending)) {
      const u = byMap.get(k);
      if (u && u !== meKey) bump(u);
      // eslint-disable-next-line react-hooks/refs -- ⚠️ 2026-09-30: `mineRef`/`mineAtRef` нь ЭНЭ СЕШНИЙ гараас бичсэн нүд — санаатай ref (дээрх ⚠️); төлөв болговол нүдний товшилт бүрд бүхэл хүснэгт дахин зурагдана
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
   *
   * ⚠️ АЛСАД ШУУД БИЧНЭ, завсарлага хүлээхгүй (2026-09-08): энэ нь бусдын
   * «Илгээх» товчийг НЭЭДЭГ дохио тул 3 секунд хойшлуулбал нөгөө тал
   * «яагаад нээгдэхгүй байна» гэж эргэлзэнэ. Нүдний засвараас ялгаатай нь
   * энэ үйлдэл ХОВОР (нэг хүн нэг багцад нэг удаа) тул хүсэлт нэмэгдэхгүй.
   *
   * ⚠️ Локалыг ЭХЛЭЭД бичнэ — сүлжээ унасан ч өөрийн дэлгэц шууд зөв
   * харагдана; дараагийн нийлүүлэлтээр алсад очно.
   */
  const toggleDone = useCallback(async () => {
    /* ⚠️ 2026-10-06 аудит: бөглөх эрхгүй (`!canPerf`) хүн «Дуусгасан» дарж ОРОЛЦОГЧ болж
       бусдын «Илгээх»-ийг түгжиж чаддаг байв — товч ч нуугдсан (FillNew), энд ч хаана. */
    if (!meKey || !canPerf) return;
    /* ⚠️ БАГЦЫН ХАМГААЛАЛТ (2026-09-25-ны аудит): доорх хоёр `await`-ийн завсарт
       багц солигдвол А-гийн нийлүүлсэн `done` жагсаалт Б-гийн `doneRef`/`doneBy`-д
       бууж, Б-гийн «Илгээх» түгжээ худал түгжигдэх/нээгдэх байв. Бичилт нь
       ТҮЛХҮҮРЭЭРЭЭ (`want`) А руу хэвээр явна — зөвхөн ТӨЛӨВТ буулгахгүй. */
    const want = pkg.key;
    /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас — ШИЙДВЭР): ИЛ ТЭМДЭГ (`Draft.marks`) —
       «Дахин засах» нь нэрийг ХАСАХ биш, `0` төлөвтэй тэмдэг БИЧНЭ. `seq` = энэ хүний
       сүүлийн тэмдгийн seq + 1 (цагаас үл хамаарах дараалал). */
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
    /* ⚠️ READ-MERGE-WRITE (2026-09-08) — `flush`-тэй ИЖИЛ шалтгаан: ноорог
       хуваалцагдсан тул шууд бичвэл нөгөө оролцогчийн нүднүүдийг УСТГАНА.
       Уншилт унавал алсад бичихгүй (локал хэвээр) — бусдын ажлыг устгахаас
       «миний тэмдэглэгээ хойшлох» нь хамаагүй хямд.
       ⚠️ Хямд `at` шалгалтаар бүтэн уншилтыг алгасна (гүйцэтгэл) — алс
       өөрчлөгдөөгүй бол нийлүүлэх зүйл байхгүй. */
    const at0 = await readRemoteDraftAt(want);
    /* ⚠️ `!==` ба өсөх хувилбар — `flush`-ийн ⚠️ (2026-09-25-ны аудит). */
    const rr: RemoteDraftRead = at0 === undefined
      ? { ok: false, error: tr('алсын ноорогийг шалгаж чадсангүй') }
      : at0 !== null && at0 !== lastMergedRef.current
        ? await readRemoteDraft(want)
        : { ok: true, draft: null };
    /* ⚠️ Өөрийн хуулбарыг алсынхаас ЗААВАЛ шинэ болгож нийлүүлнэ — алсын `t`
       (өөр клиентийн цаг) урд байвал тэр тал «шинэ» болж, энэ товчны `done`
       өөрчлөлт нийлүүлэлтэд ялагдах байсан. */
    const dNew: Draft = { ...d, t: Math.max(d.t, at0 != null ? at0 + 1 : 0) };
    /* ⚠️ 2026-10-04 дахин аудит (#2): алсад бичихийн өмнө ШАХНА (`flush`-тай ижил — `compactDraft`) */
    const merged = rr.ok
      ? compactDraft(mergeDrafts(rr.draft ? parseDraft(rr.draft.payload, 'remote') : null, dNew) ?? dNew,
        { max: REMOTE_MAX, minOid: pkgKeyRef.current === want ? minOidRef.current : null })
      : null;
    /* ⚠️ 2026-10-06: локалд НИЙЛҮҮЛЖ бичнэ (`writeDraftLS`) — `merged` нь `await`-аас ӨМНӨХ `cur`-аас
       угсрагдсан тул урьд нь `saveDraftLS`-ээр дарж бичихэд завсарт бичсэн нүд локалаас арилдаг байв. */
    let mergedLS: Draft | null = null;
    if (merged) {
      mergedLS = writeDraftLS(want, merged).draft;
      /* ⚠️ Багц солигдсон бол ТӨЛӨВТ буулгахгүй (дээрх ⚠️) */
      if (pkgKeyRef.current === want) applyMarks(marksOf(merged));
    }
    /* ⚠️ 2026-10-01: `expectAt` (optimistic lock) — уншсанаас хойш өөр хүн бичсэн бол
       ДАРЖ БИЧИХГҮЙ; ердийн `flush` (read-merge-write) руу шилжүүлнэ. */
    const r = merged
      ? await saveRemoteDraft(want, merged.t, JSON.stringify(merged), { expectAt: at0 ?? null })
      : { ok: false as const, error: rr.ok ? '' : rr.error };
    if (!r.ok && 'conflict' in r && r.conflict && merged) {
      /* ⚠️ 2026-10-06: ИЖИЛ багцын дараалал байвал ДАРАХГҮЙ — тэр нь завсарт бичсэн нүдтэй шинэ
         ноорог (урьд нь хуучин `merged`-ээр солигдож тэр нүд алсад очдоггүй байв). Тэмдэг алдагдахгүйн
         тулд дарааллыг ШИНЭ тал болгож нийлүүлнэ. Дараалалгүй бол локалын НИЙЛБЭР (`mergedLS`). */
      const q0 = remoteQueue.current;
      if (!q0) remoteQueue.current = { pkg: want, draft: mergedLS ?? merged };
      else if (q0.pkg === want) remoteQueue.current = { pkg: want, draft: mergeDrafts(merged, q0.draft) ?? q0.draft };
      setRemoteTick((n) => n + 1);
      return;
    }
    if (!r.ok) {
      show('warn', tr('«{0}» тэмдэглэгээ ArcGIS-т хадгалагдсангүй ({1}) — бусад хүн харахгүй байж магадгүй.',
        iAmDone ? tr('Дахин засах') : tr('Дуусгасан'), r.error));
    }
  }, [meKey, iAmDone, pkg.key, show, pkgKeyRef, applyMarks, stamp, canPerf]);

  /**
   * Сонгосон ноорогийг ШҮҮЖ, сэргээх цонхонд бэлдэнэ.
   * ⚠️ Энэ нь дэлгэц зурахаас өмнө БҮХ шалгуурыг өнгөрүүлнэ — цонхонд
   *    харагдах тоо ба бодитоор буух өгөгдөл хоёр өөр зам явж болохгүй.
   */
  const pickDraft = useCallback((d: Draft, source: 'local' | 'remote' | 'both', opts?: {
    /**
     * ⚠️ 2026-10-01: ЗӨВХӨН хамтын төлөв (эзэмшил · агшин · tombstone · «дуусгасан»)-ийг
     *    буулгана, нүдний утгыг (`pending`) ХӨНДӨХГҮЙ — нүд нээлттэй үед (`deferredRef`).
     */
    sharedOnly?: boolean;
    /**
     * ⚠️ 2026-10-09: ТАТАХ МӨЧЛӨГИЙН нийлүүлэлт (сэргээлт БИШ) — «Ноорог сэргээв…» мэдэгдэл ГАРАХГҮЙ
     *    (урьд нь 3–6 сек тутам `say`-аар давтагдаж чухал анхааруулгыг дардаг байв); оронд нь харагдаж
     *    буй нүд өөрчлөгдсөн бол л товч мэдэгдэнэ. Шинэ илгээлтийн баримт ирвэл `onReceipts`.
     */
    poll?: boolean;
  }): PickRes => {
    /**
     * ⚠️ 2026-10-09: ЭНЭ БУУЛГАЛТ ЮУ ӨӨРЧИЛСӨН — `pullNow` («Илгээх»-ийн өмнөх шалгалт) үүгээр шийднэ:
     *    `changed` = нүд/огнооны утга эсвэл «дуусгасан» тэмдэг өөрчлөгдсөн · `rcpt` = шинэ баримтын тоо.
     */
    const res: PickRes = { changed: false, rcpt: 0 };
    /* ⚠️ ЭРХГҮЙ бол ЮУ Ч ХӨНДӨХГҮЙ (2026-09-25-ны аудит, HIGH) — сэргээх
       эффектийн `canPerf` ⚠️. Урьд нь доорх `canPerf ? … : []` нь бүх нүдийг
       алгасаад «хоосон ноорог» гэж дүгнэж хуваалцсан ноорогийг УСТГАДАГ байв. */
    if (!sc || !canPerf) return res;
    /* ⚠️ 2026-10-01: нийлүүлэлтээр ирсэн агшнаар логик цагийг урагшлуулна (`stamp`-ийн ⚠️) */
    seeClock(d);
    /* ⚠️ Ноорогийн `adds` СЭРГЭЭГДЭХГҮЙ (2026-09-24) — мөр нэмэх «Хуваарь» руу
       шилжсэн, батлагдсан мөр серверээс ирнэ. Хуучин ноорогт үлдсэн сөрөг
       oid-той нүд `byOid`-д таарахгүй тул «хуучирсан» (`dropped`) гэж тоологдоно. */
    const byOid = new Map<number, SheetRow>();
    for (const r of rows) byOid.set(r.oid, r);

    /**
     * ⚠️ АГШИН СОЛИГДСОНЫГ НӨХӨХ ЗӨӨЛТ (2026-09-03-ны аудитын олдвор).
     *
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
    /*
     * ⚠️ 2026-10-04 аудит (#2, CRITICAL/HIGH): `rowKeys` нь ЗӨВХӨН хөндсөн мөрүүд тул урьдын
     *    «k дахь нь хуудасны k дахь нэрийдэл» (`shift()`) дүрэм давхардсан шошготой (Bagts_1_9f-ийн
     *    60.5%) мөрийн утгыг ӨӨР мөрөнд буулгадаг байв. Одоо `sheetFrame.mapOldOids` — бичих
     *    агшны давтамжийн дугаар (`d.rowOcc`)-аар ЯГ; мэдээлэлгүй/хоёрдмол түлхүүрийг ЗӨӨХГҮЙ
     *    (`ambig` — ноорогт ХАДГАЛАГДСАН хэвээр, ил анхааруулна).
     */
    const oidFix = new Map<number, number>();
    const ambigOids = new Set<number>();
    if (d.rowKeys?.length) {
      const off = d.rowKeys.filter(([oldOid]) => !byOid.has(oldOid));      // мөр байрандаа — зөөх шаардлагагүй
      /* ⚠️ 2026-10-04 дахин аудит (#9): `sameFrame = false` — ноорогийн `rowKeys` нь өөр өөр жаазны
         хуулбараас нэгддэг тул «oid-ын дарааллаар» дүрэм мөрүүдийг солих эрсдэлтэй (`mapOldOids`-ийн ⚠️) */
      const mm = mapOldOids(off, rows, d.rowOcc, false);
      for (const [o, to] of mm.map) oidFix.set(o, to);
      for (const o of mm.ambiguous) ambigOids.add(o);
    }
    /** Нүд/огнооны агшин (`d.byAt`) ба суурь баримт (`d.bt`) — зөөлтийн давхцал ба баримтын дүрэмд */
    const dAt = new Map<string, number>(d.byAt ?? []);
    const dBt = new Map<string, number>(d.bt ?? []);
    /* ⚠️ 2026-10-04 дахин аудит (#2): шахсан хэлбэрийг задална (`unpackRcpt`) */
    const dRc = new Map<string, Rcpt>();
    for (const r of unpackRcpt(d.rcpt)) { const c = dRc.get(r[0]); if (!c || c[1] < r[1]) dRc.set(r[0], r); }
    /**
     * ТЭМДЭГЛЭХ НҮД (2026-10-04 дахин аудит, #7 · #3) — `Held`-ийн ⚠️. Ноорогийн өмнөх тэмдэг (`d.hold`)
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
      /* ⚠️ 2026-10-09 (аудит №3): зорилтоор хойшлуулсан ('tgt') нүд хугацаагүй — бусдын ЖИНХЭНЭ ажил, засвар дууссаны дараа буцаж гарна */
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
    /** ⚠️ 2026-10-09 (аудит №6): СЕРВЕРИЙН илгээлтээс гаргасан (хоосон `sv`) баримтаар хасагдсан нүд `${түлхүүр}@${a}` */
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
      /* ⚠️ Баримтыг ҮРГЭЛЖ (идемпотент — `bt ≥ a` бол хөндөхгүй): нэг талт ноорог (`mergeDrafts`
         нэг тал `null` үед шууд буцаадаг) ба ЗӨВХӨН энэ сешнд мэдэгдсэн баримт (#3 — сервер дээр
         буусан нь батлагдсан илгээлт) ч хэрэгжинэ. */
      /* ⚠️ 2026-10-04 дахин аудит (#5): баримт ХУУЧИН түлхүүрээр ч (`key0`) — хариу тасарсан илгээлтийн
         (`Inflight`) ба хуучин жаазны баримт нь илгээх агшны ХУУДАСНЫ түлхүүртэй; жааз солигдсоны дараа
         зөвхөн шинэ түлхүүрээр хайвал олдохгүй, илгээгдсэн нүд дахин сэргэж ДАВХАР тоологдох байв. */
      /* ⚠️ 2026-10-09: ХОЖУУ нь (`newerRc`) — урьд нь `rcptRef` түрүүлдэг тул серверээс гаргасан (`subReceipts`)
         хуучин баримт ноорогт ирсэн ЖИНХЭНЭ шинэ баримтыг дарах байв. */
      const rc = newerRc(rcptRef.current.get(key), dRc.get(key))
        ?? (key0 !== key ? newerRc(rcptRef.current.get(key0), dRc.get(key0)) : undefined);
      const isD = /:[se]$/.test(key);
      /* Суурь баримт: хуулбарынх (`d.bt`); байрандаа бол энэ сешний гараас бичсэнийх (`btRef`) ч */
      const bt0 = Math.max(dBt.get(key0) ?? 0, key0 === key ? (btRef.current.get(key) ?? 0) : 0);
      const v2 = rc ? rcptApply(v, w, bt0, rc, isD) : v;
      if (v2 == null) {
        /* ⚠️ 2026-10-04 дахин аудит (#6): ИЖИЛ утга, баримт хараагүй хожуу бичилт — хасна, гэвч ИЛ хэлнэ */
        /* ⚠️ 2026-10-09 (аудит №6): серверийн илгээлтээс гаргасан баримт (`sv === ''`, `subReceipts`) — илгээсэн утга
           мэдэгдэхгүй тул зөрүү бодолгүй ХАСНА; тэр нь хараахан нийлүүлэгдээгүй байсан хуулбар байж болох тул ИЛ хэлнэ */
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

    /*
     * ⚠️ 2026-10-09 (аудит №3, HIGH): БУЦААГДСАН ИЛГЭЭЛТИЙН ЗАСВАРТ ЗӨВХӨН ТЭР ИЛГЭЭЛТИЙН НҮД. Урьд нь хориг
     *    (`FillNew.reviewLock`) идэвхтэй үед сэргээлт огт явдаггүй (`!canPerf`) тул буцаагдсан өдрийг (D2) сонгомогц
     *    (`resumeReturned`) ноорог анх удаа сэргэж, ӨНӨӨДРИЙН (зорилтгүй) эсвэл хамтран бөглөгчийн ажлыг `pending`-д
     *    буулгадаг байв — өөрийн зорилт (`draftTgt`) `null` тул `tgtMismatch` асахгүй, «Илгээх» тэдгээрийг D2-ын
     *    `fillMs`-ээр илгээж, домэйн хориг (засвар гэж үзэж) нэвтрүүлдэг байв (хоригийг тойрох зам).
     *    Одоо одоогийн зорилт буцаагдсан илгээлт (`curTgt`) бол нүдний ЭЗНИЙ зорилт (`Draft.tgt`) түүнтэй таарахгүй
     *    нүд/огноо 'tgt' тэмдэгтэйгээр ХОЙШЛОГДОНО (`heldRef`): ноорогт хадгалагдана, буулгагдахгүй, илгээгдэхгүй;
     *    зорилт солигдоход (засвар дуусах) дараагийн буулгалтад буцаж гарна. Эзэнгүй (хуучин) нүд — «өнөөдөр» (0).
     *    Өөрийн зорилтгүй бол хадгалах эффектийн `want`-тай ИЖИЛ (одоогийн зорилт) — ӨӨРИЙН өөр ажлын нүдийг
     *    `FillNew.resumeReturned` (хадгалсан ноорогийн шалгалт) урьдчилан хаадаг тул энд холилдохгүй.
     * ⚠️ Зорилтын нийлүүлэлт (`tgtsRef`) нүднээс ӨМНӨ — эзний ОДООГИЙН зорилтоор шүүнэ.
     */
    const meTgt = user?.username?.trim().toLowerCase() ?? '';
    for (const e of d.tgt ?? []) {
      const c = tgtsRef.current.get(e[0]);
      if (!c || e[3] > c[3]) tgtsRef.current.set(e[0], e);
    }
    const tgtNow = curTgtRef.current?.[0] ?? 0;
    const offTgt = (k0: string) => offTarget(tgtNow, dBy.get(k0), meTgt, tgtsRef.current);
    /** Зорилтоор хойшлуулсан нүд/огноо (`offTgt`) — `kept`-д тоологдоно (ноорог устахгүй) */
    let tgtHeld = 0;
    /**
     * ⚠️ 2026-10-09 (аудит №3): ЗӨВШӨӨРӨГДСӨН (ногоон ✓) нүдний утга — буулгахгүй, tombstone-оор хаяна (`okLock`-ийн ⚠️).
     *    Түлхүүр нь ноорогийнх (`key0`) — зөөсөн бол хуучин түлхүүр аль хэдийн `rekeyed`-д.
     */
    const okDrop: string[] = [];
    const next: Record<string, string> = {};
    let dropped = 0;
    /** Хадгалагдсантайгаа ИЖИЛ тул сэргээгээгүй нүд/огноо (хуучирсан БИШ) */
    let sameN = 0;
    // ⚠️ Гүйцэтгэлийн нүдийг зөвхөн бөглөх эрхтэй хүнд сэргээнэ — дээрх `if (!sc || !canPerf) return res;`
    //    (2026-10-09 аудит №6: урьдын `canPerf ? d.cells : []` нь тэр хаалтын дараа үхмэл нөхцөл байв)
    for (const [key0, vRaw] of d.cells) {
      /* ⚠️ 2026-10-04 дахин аудит (#3): АЛБАДАН тэмдэгтэй (7 хоногоос хуучин, алсад хуулагдаагүй) — сэргээхгүй */
      if (forced(key0)) { holdIt(key0, vRaw, 'old'); continue; }
      /* ⚠️ 2026-10-04 (#2): аль мөр болох нь ТОДОРХОЙГҮЙ — буруу мөрөнд буулгахгүй, ноорогт үлдэнэ */
      if (ambigOids.has(Number(key0.slice(0, key0.indexOf(":"))))) { ambig++; holdIt(key0, vRaw, 'ambig'); continue; }
      const key = fixKey(key0);
      /* ⚠️ 2026-10-04 (#1): зөөсөн хуулбар — баримт/давхцлаар шүүнэ; хуучин түлхүүрийг tombstone-д */
      const v = landMoved(key0, key, vRaw);
      /* Хасагдсан (илгээгдсэн/ялагдсан) ч хуучин түлхүүрийг tombstone-доно — баримт хуучирсны дараа сэргэхгүй */
      if (key !== key0) rekeyed.push(key0);
      if (v == null) continue;
      /* ⚠️ 2026-10-09 (аудит №3): өөр ажлын (зорилт зөрсөн) нүд — засварт нийлүүлэхгүй (`offTgt`-ийн ⚠️) */
      if (offTgt(key0)) { tgtHeld++; holdIt(key, v, 'tgt', key0); continue; }
      const oid = Number(key.split(":")[0]);
      const b = Number(key.slice(key.indexOf(":") + 1));
      const r = byOid.get(oid);
      // Мөр алга болсон, бүлгийн мөр, блок хасагдсан, эсвэл аль хэдийн ижил
      // утгатай (хооронд нь нийтлэгдсэн) бол — хаяна.
      // ⚠️ Бичигдэхгүй болсон нүдний ноорог утгагүй — хаяна.
      /* ⚠️ ХУВИЙН БИЧЛЭГИЙГ (`%50`) ХУУЧИРСАН гэж ҮЗЭХГҮЙ (2026-09-08).
         Урьд нь `Number.isFinite(Number(v))` гэж ТҮҮХИЙГЭЭР шалгадаг байсан
         тул `Number("%50") = NaN` болж, ХУВИАР бөглөсөн БҮХ нүд сэргэлгүй
         хаягддаг байв — хэрэглэгчид «агшин солигдсон» гэсэн ХУДАЛ шалтгаан
         харагдана. Хувь горим нь мөрийн `Обьём`гүй ажлуудыг (Багц 3.1·9F-д
         29.5%) бөглөх ЦОРЫН ГАНЦ зам тул тэр ажил бүхэлдээ алдагддаг.
         Шалгуур нь `bagtsSheet`-ийн ЖИНХЭНЭ дүрэмтэй нэг байх ёстой. */
      /* ⚠️ 2026-09-25 — НЭМЭЛТИЙН ГОРИМ (`Draft.mode`-ийн ⚠️). Утга хоёр янз:
           · `"15"` · `"%10"` — НЭМЭЛТ (шинэ ноорог), шууд сэргээнэ;
           · `"=55"` · `"=%50"` — ХУУЧИН ноорогийн НИЙТ (`parseDraft` тэмдэглэсэн):
             ОДООГИЙН суурьтай жишиж НЭМЭЛТ болгоно (`55 − 40 = +15`). Нийт нь
             суурийн хооронд өөрчлөгдсөн байсан ч хэрэглэгчийн бичсэн НИЙТ хадгалагдана.
             ⚠️ `"="` (хуучин «цэвэрлэх») нэмэлтээр илэрхийлэгдэхгүй — хаяна (`dropped`).
         ⚠️ ХУВИЙН бичлэгийг ГОРИМООР ШҮҮХГҮЙ хэвээр (2026-09-08): хувь нь `sc.act[b]`-д
            суудаг тул обьёмын багана шаардахгүй; обьёмын нэмэлт л `volMode` шаардана. */
      let incV: string | null = null;
      /* ⚠️ 2026-10-09: блокгүй багцын Обьёмгүй мөрд (`synNoVol` — нүд түгжээтэй) ямар ч нэмэлт сэргээгдэхгүй,
         хувийн (`%`) ч — тэр мөрд гүйцэтгэл бодогдохгүй тул хаягдана (`dropped`) */
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
        /* ⚠️ 2026-10-04 дахин аудит (#7): хуучирсан нүд — ТЭМДЭГЛЭЖ хадгална (хугацаатай, «хаях» товчтой) */
        holdIt(key, v, 'drop', key0);
        continue;
      }
      /* ⚠️ ТЭГ НЭМЭЛТ = өөрчлөлтгүй (хуучин «хадгалагдсантай ижил») — сэргээхгүй,
         `dropped`-д ТООЛОГДОХГҮЙ. Илгээгдсэн нүд буцаж ирэхээс хамгаалах гол
         зам нь одоо `del` (tombstone, `mergeDrafts`): нэмэлтийн утга тэнцүү
         байх нь «аль хэдийн илгээгдсэн» гэсэн баримт БИШ. */
      /* ⚠️ 2026-10-04 дахин аудит (#7): өөрчлөлтгүй нүдийг tombstone-оор цэвэрлэнэ — урьд нь локалд
         МӨНХӨД үлдэж хоосон ноорогийн цэвэрлэгээг хаадаг байв (зөөсөн бол хуучин түлхүүр `rekeyed`-д). */
      if (incV === "") { sameN++; if (key === key0) noop.push(key0); continue; }
      /* ⚠️ 2026-10-09 (аудит №3): ЗӨВШӨӨРӨГДСӨН нүд (`okLock`) — UI-ийн түгжээг тойрсон утга; хаяна */
      if (cbRef.current.okLock?.(oid, b)) { if (key === key0) okDrop.push(key0); continue; }
      next[key] = incV;
    }

    /* ── ОГНОО (`${oid}:${блок}:s|e`) ──
       ⚠️ Талбаргүй блок бий (эх хуудасны толгой эвдэрсэн) — тэнд бичих газар
       байхгүй тул сэргээх нь утгагүй. */
    const nextDates: Record<string, string> = {};
    /* ⚠️ 2026-10-04 (#8): огнооны СУУРЬ — ноорог бичигдэх үеийн серверийн утга */
    const dBase = new Map<string, string>(d.datesB ?? []);
    const nextDatesB = new Map<string, string>();
    /* (эрхийн хаалт — дээрх `if (!sc || !canPerf) return res;`, 2026-10-09 аудит №6) */
    for (const [key0, vRaw] of (d.dates ?? [])) {
      /* ⚠️ 2026-10-04 дахин аудит (#3 · #7): албадан тэмдэг · хоёрдмол — тэмдэглэж хадгална */
      if (forced(key0)) { holdIt(key0, vRaw, 'old'); continue; }
      if (ambigOids.has(Number(key0.slice(0, key0.indexOf(":"))))) { ambig++; holdIt(key0, vRaw, 'ambig'); continue; }
      const key = fixKey(key0);
      const v = landMoved(key0, key, vRaw);
      if (key !== key0) rekeyed.push(key0);
      if (v == null) continue;
      /* ⚠️ 2026-10-09 (аудит №3): өөр ажлын огноо — засварт нийлүүлэхгүй (`offTgt`-ийн ⚠️) */
      if (offTgt(key0)) { tgtHeld++; holdIt(key, v, 'tgt', key0); continue; }
      const [oidS, bS, k] = key.split(":");
      const b = Number(bS);
      const r2 = byOid.get(Number(oidS));
      const fld = k === "s" ? sc.start[b] : k === "e" ? sc.end[b] : null;
      if (!r2 || !Number.isInteger(b) || b < 0 || b >= nBld || !fld) { dropped++; holdIt(key, v, 'drop', key0); continue; }
      const srv = dt(k === "s" ? r2.start[b] : r2.end[b]);
      /* ⚠️ Хадгалагдсантай ИЖИЛ огноо сэргээхгүй — дээрх нүдний ⚠️, `commitDate`-ийн `sameDate` */
      if (v === srv) { sameN++; if (key === key0) noop.push(key0); continue; }
      /* ⚠️ 2026-10-04 аудит (#8): ҮНЭМЛЭХҮЙ утга — ноорог бичигдсэнээс хойш серверийн огноо
         ӨӨРЧЛӨГДСӨН бол (хооронд нь өөр хүн илгээж батлуулсан) хуучин ноорогоор ДАРАХГҮЙ:
         буулгахгүй, ноорогт үлдээж анхааруулна. Суурьгүй (хуучин) ноорог — урьдын адил. */
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
     *
     * ⚠️ `by` нь нүдний түлхүүрээр индекслэгддэг тул ObjectID зөөлтөд ЗААВАЛ
     * дагана (`fixKey`) — эс бөгөөс архивын шинэ жааз үүсэхэд эзэмшил бүхэлдээ
     * тасарч, оролцогчийн жагсаалт хоосорч «Илгээх» худал нээгдэнэ.
     *
     * ⚠️ `done` нь БҮХЭЛДЭЭ буух ёстой: `doneRef` нь дараагийн хадгалалтад
     * буцаж бичигдэх тул энд суулгахгүй бол нөгөө талын «дуусгасан»
     * тэмдэглэгээ эхний засвараар л арчигдана.
     */
    const nextBy = new Map<string, string>();
    for (const [k0, u] of d.by ?? []) {
      const k = fixKey(k0);
      const oid = Number(k.slice(0, k.indexOf(":")));
      if (byOid.has(oid)) nextBy.set(k, String(u).trim().toLowerCase());
    }
    /*
     * ⚠️ ӨӨРИЙН ЭЗЭМШЛИЙГ ХАДГАЛНА (2026-09-08). `pickDraft` нь `byMap`-ыг
     * БҮХЭЛД НЬ орлуулдаг тул энэ сешнд гараас бөглөсөн нүд — хэрэв алсад
     * хараахан хүрээгүй бол (бичилт 3 секунд хойшилдог, эсвэл сүлжээ саатсан) —
     * нийлүүлэлт ирэх бүрд АЛГА БОЛНО. Улмаар `participants`-аас өөрөө хасагдаж,
     * нөгөө талд «энэ хүн оролцоогүй» гэж харагдана: хоёулаа «Илгээх» идэвхтэй
     * болно (хэрэглэгчийн хоёр удаа мэдээлсэн эвдрэл).
     * `mineRef` нь ЭНЭ БАГЦЫН, ЭНЭ СЕШНИЙ бодит үнэн тул алсынхаас ДЭЭГҮҮР.
     */
    const meNow = user?.username?.trim().toLowerCase() ?? '';
    /** ⚠️ 2026-10-09: өөр хүн өөрчилсөн/буцаасан ӨӨРИЙН нүд — `[түлхүүр, эзэн ('' = мэдэгдэхгүй)]` (`lostMine`) */
    const lost: [string, string][] = [];
    if (meNow) {
      /* ⚠️ `mineRef`-ийн түлхүүрүүд ч ObjectID зөөлтөд ДАГАНА (`fixKey`) —
         архивын шинэ жааз үүсэхэд хуучин oid-тай үлдвэл `byOid`-д таарахгүй
         болж эзэмшил тасарна. Зөөсөн хувилбарыг `mineRef`-д БУЦААЖ бичнэ. */
      const moved = new Set<string>();
      /*
       * ⚠️ 2026-10-09: ЭЗЭМШИЛ НИЙЛБЭРИЙН АГШНААР (`draft.claimMine`-ийн ⚠️). Урьд нь `mineRef`-ийн БҮХ
       *    түлхүүрийг минийх гэж тамгалдаг тул Б миний нүдийг ХОЖУУ дарж бичсэн ч «минийх» хэвээр —
       *    тайлбар («{0} бөглөсөн») ба `waitingOn` худал болдог байв. Одоо Б-гийн агшин энэ табын сүүлийн
       *    хөндөлтөөс (бичилт ба өөрийн буцаалтын их нь) ХОЖУУ бол нүд Б-гийнх (`mineRef`-ээс хасагдана;
       *    дахин бичвэл `touchMine` буцааж нэмнэ). Тэр үед ба Б буцаасан (tombstone) үед хэрэглэгчид
       *    НЭГ удаа ИЛ хэлнэ (`lostMine`) — LWW дүрэм ӨӨРЧЛӨГДӨӨГҮЙ.
       */
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
    /* ⚠️ 2026-10-09: «{0} таны бөглөсөн нүдийг өөрчиллөө: {1}» — нүд бүрд НЭГ удаа, ≤5 нэрлэж үлдсэнийг тоолно;
       нүдийг богино тодруулна. Бүтэн буулгалтад бусад анхааруулгатай НЭГ мэдэгдлээр (`warns`), нүд нээлттэй
       (`sharedOnly`) үед шууд. */
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
    /* ⚠️ 2026-10-09: түлхүүр бүрд ХАРСАН алсын агшин (`stampKey` — HLC) */
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
    /* ⚠️ `mineAtRef` — `mineRef`-ээс ТУСДАА зөөнө (2026-09-21-ний дахин аудит):
       (а) `a:${oid}` (нэмсэн агшин) түлхүүр нь `mineRef`-д байдаггүй — энэ
       хуудас мөр нэмэхээ больсон (2026-09-24) тул хаяна; (б) `revert`-ийн «идэвх» агшин (pending-д байгаагүй
       нүдэнд ижил утга) ч `mineRef`-гүй — `waitingOn`-ийн өөрийн идэвхэд
       хэрэгтэй тул мөр байгаа л бол үлдээнэ. */
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
    /* ⚠️ 2026-10-09 (аудит №3): зорилтоор хойшлуулсан нүдний эзэн ОРОЛЦОГЧ биш (засварын «Илгээх»-ийг түгжихгүй) —
       эзэмшил нь `heldRef`-ийн `by`-гаар ноорогт хадгалагдана */
    for (const [k, h] of heldNext) if (h.why === 'tgt') nextBy.delete(k);
    setByMap(nextBy);
    /* ⚠️ Агшин ч `fixKey`-ээр зөөгдөнө (2026-09-21) — эс бөгөөс жааз солигдоход
       идэвхгүй шүүлт бүх оролцогчийг «агшингүй» гэж үзнэ (хүлээсээр). Өөрийн
       нүдэнд `mineAtRef` давамгайлна — алсынх хоцорсон байж болно.
       `a:${oid}` (нэмсэн агшин) — энэ хуудас мөр нэмэхгүй (2026-09-24) тул хаяна. */
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
    /* ⚠️ TOMBSTONE-ийг ч ТӨЛӨВТ авна (2026-09-21-ний дахин аудит): нийлбэрийн
       `del` нь бусдын буцаалтыг ч агуулна. Өөрийн pending ХООСОН болоход
       хадгалах эффект «tombstone бий юу» гэдгийг `delRef`-ээс шийднэ — байвал
       алсыг ЦЭВЭРЛЭХГҮЙ, хоосон нүд + del-тэй ноорог бичнэ; эс бөгөөс өөрийн
       хуучин хуулбар (эсвэл гуравдагч төхөөрөмж) буцаалтыг сэргээнэ. Нийлбэр
       аль хэдийн «дахин бичигдсэн» tombstone-ийг хаясан тул `d.byAt`-аас хожуу
       tombstone-ийг энд ч хасна. */
    for (const [k, a] of d.del ?? []) if (Number.isFinite(a) && (delRef.current.get(k) ?? 0) < a) delRef.current.set(k, a);
    for (const [k, a] of delRef.current) {
      const w = nextByAt.get(k);
      if (w != null && w > a) delRef.current.delete(k);
    }
    /* ⚠️ 2026-10-01: «дуусгасан» нь ИЛ ТЭМДГЭЭС (`Draft.marks`, `marksOf`) — нэр алга
       байх нь «буцаасан» гэсэн үг БИШ (`mergeDrafts`-ийн ⚠️). */
    {
      /* ⚠️ 2026-10-09: «дуусгасан» хүмүүс өөрчлөгдсөн эсэх — `waitingOn` (Илгээх түгжээ) түүнээс (`PickRes`) */
      const doneKey = (m: Map<string, Mark>) => doneOfMarks(m).map(([u]) => u).sort().join('|');
      const m1 = marksOf(d);
      if (doneKey(marksRef.current) !== doneKey(m1)) res.changed = true;
      applyMarks(m1);
    }
    /*
     * ⚠️ 2026-10-04 дахин аудит (#4): ЗОРИЛТ ХҮН ТУС БҮРЭЭР (`Draft.tgt`) — хамтын төлөв тул нүд нээлттэй
     *    үед ч буулгана. Түгжээ (`draftTgt`) нь ЗӨВХӨН ӨӨРИЙН бичлэгээс: урьд нь ганц зорилт байсан тул
     *    нэг хүний буцаагдсан тойрог БҮХ оролцогчийн «Илгээх»-ийг түгждэг байв.
     */
    /* (2026-10-09 аудит №3: `tgtsRef`-ийн нийлүүлэлт нүднээс ӨМНӨ — `offTgt`-ийн ⚠️) */
    {
      const mine = meNow ? tgtsRef.current.get(meNow) : undefined;
      const nt: [number, number] | null = mine && mine[1] > 0 ? [mine[1], mine[2]] : null;
      /* Ижил бол төлөвийг хөдөлгөхгүй — татах мөчлөг 3 сек тутам дахин зурахгүй */
      setDraftTgt((p) => (p === nt || (p && nt && p[0] === nt[0] && p[1] === nt[1]) ? p : nt));
    }
    /* ⚠️ 2026-10-01: нүд НЭЭЛТТЭЙ үед — хамтын төлөв ЭНД хүртэл буусан; нүдний утга,
       огноо нь нүд хаагдмагц (`deferredRef` эффект) буулгагдана. */
    if (opts?.sharedOnly) return res;
    /*
     * ⚠️ 2026-10-04 аудит (#1, CRITICAL): ЗӨӨСӨН ХУУЧИН ТҮЛХҮҮРТ TOMBSTONE. Урьд нь зөөлт нь
     *    зөвхөн `pending`-д шинэ түлхүүрээр бичдэг тул нийлүүлэлт (`mergeDrafts`) ХУУЧИН oid-той
     *    хуулбарыг локал+алсад ХАМТ хадгалж, илгээлт нь зөвхөн шинэ түлхүүрийг tombstone-доход
     *    хуучин хуулбар дараагийн сэргээлтэд ДАХИН зөөгдөж «илгээгээгүй» болон гарч ирдэг байв
     *    (давхар тоолол). Одоо логик цагаар (`stamp` — нийлүүлсэн бүх агшнаас хожуу) хуучин
     *    түлхүүрийг хасна; хуучин жааз дээр ХОЖУУ бичсэн хуулбар ялна (дахин зөөгдөнө).
     */
    /* ⚠️ 2026-10-04 дахин аудит (#7): өөрчлөлтгүй (`noop`) ба хугацаа нь дууссан тэмдэглэсэн нүд
       (`heldExpired`) ч tombstone-оор — бусад хуулбараас сэргэхгүй, локалд мөнхөд үлдэхгүй. */
    /* ⚠️ 2026-10-09 (аудит №3): зөвшөөрөгдсөн нүдний утга (`okDrop`) ч tombstone-оор */
    const tombs = [...rekeyed, ...noop, ...heldExpired, ...okDrop];
    if (tombs.length) {
      const a = stamp();
      for (const k0 of tombs) if ((delRef.current.get(k0) ?? 0) < a) delRef.current.set(k0, a);
    }
    /* ⚠️ 2026-10-04 дахин аудит (#7): тэмдэглэсэн нүд — ТАБЫН төлөв (хадгалах эффект ноорогт бичнэ) */
    heldRef.current = heldNext;
    setHeldN(heldVisN(heldNext));
    /*
     * ⚠️ 2026-10-09: ШИНЭ ИЛГЭЭЛТИЙН БАРИМТ (`draft.newReceipts`-ийн ⚠️) — `rcptRef`-д нийлүүлэхээс ӨМНӨ таньна.
     *    Татах мөчлөгийн нийлүүлэлтэд (`poll`) л дуудагчид мэдэгдэнэ: сэргээлтэд (багц нээх) илгээлт ачаалах
     *    эффектээр аль хэдийн шинээр уншигдсан. Дуудагч (FillNew) `staged`/давхарлалтыг дахин уншиж «{0} илгээв»
     *    гэж хэлнэ — урьд нь илгээгдсэн нүд `pending`-ээс ЧИМЭЭГҮЙ алга болж тоо нь хуучин нийт рүү үсэрдэг байв.
     */
    {
      const fresh = newReceipts(rcptRef.current, d);
      res.rcpt = fresh.length;
      if (fresh.length && opts?.poll) cbRef.current.onReceipts?.(Math.max(...fresh.map((r) => r[1])));
    }
    /* ⚠️ 2026-10-04 (#4): баримт ба нүдний суурь баримт — ЗӨВХӨН бүтэн буулгалтад (`rcptRef`-ийн ⚠️) */
    for (const r of dRc.values()) {
      const c = rcptRef.current.get(r[0]);
      if (!c || c[1] < r[1]) rcptRef.current.set(r[0], r);
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
    /* ⚠️ 2026-10-09: өөр хүн өөрчилсөн ӨӨРИЙН нүд (`lostMsg`) — эхэнд */
    const warns: string[] = lostMsg ? [lostMsg] : [];
    /* ⚠️ 2026-10-04 (#4): илгээлтээс хойш засагдсан нүдийг ЗӨРҮҮ болгосныг ил хэлнэ (нэг удаа) */
    /* ⚠️ 2026-10-04 дахин аудит (#6): `d.conv`-ийн нүд ноорогт БАЙХГҮЙ бол тэр нь ИЖИЛ утгаар хасагдсан
       (`rcptSilentDrop`) — «зөрүү үлдээв» биш «хасав» гэж тусад нь хэлнэ. */
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
      /* ⚠️ 2026-10-09 (аудит №6): серверийн илгээлтийн баримтаар хасагдсан нүд — нэг удаа, ил */
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
    /* ⚠️ 2026-10-01: СЭРГЭЭЛТИЙН ЗАВСАРТ ГАРААС бичсэн нүдийг ДАРАХГҮЙ — тэр агшнаас
       хойш (`restoreSinceRef`) хөндсөн өөрийн нүдний ОДООГИЙН утга ялна. */
    const since = restoreSinceRef.current;
    const typed = since ? [...mineAtRef.current].filter(([, a]) => a >= since).map(([k]) => k) : [];
    const keepTyped = (base: Record<string, string>) => (prev: Record<string, string>) => {
      if (!typed.length) return base;
      const out = { ...base };
      for (const k of typed) if (k in prev) out[k] = prev[k];
      return out;
    };

    /* ── ШИНЭЧЛЭГДСЭН ОГНОО — зөвхөн ачаалсан утгаас ӨӨР бол ── */
    /* ⚠️ 2026-10-04 аудит (#8): ҮНЭМЛЭХҮЙ утга — ноорог бичигдсэнээс хойш серверийн «Шинэчлэгдсэн
       огноо» ӨӨРЧЛӨГДСӨН бол (`asOfB` ≠ одоогийн) хуучин ноорогоор ДАРАХГҮЙ, анхааруулна. */
    const asOfStale = d.asOf != null && d.asOf !== asOfOrig && d.asOfB !== undefined && d.asOfB !== asOfOrig;
    if (asOfStale) srvChanged += 1;
    const draftAsOf = d.asOf != null && d.asOf !== asOfOrig && !asOfStale ? d.asOf : null;
    asOfBRef.current = draftAsOf != null ? (d.asOfB !== undefined ? d.asOfB : asOfOrig) : undefined;
    /* ⚠️ `null` = ИЛ БУЦААЛТ (2026-09-25-ны аудит, `asOfRevRef`-ийн ⚠️): өөр
       оролцогч/төхөөрөмж огноог анхны утгандаа буцаасан — энд үлдсэн X-ийг
       анхных руу буцаана, эс бөгөөс дараагийн хадгалалт X-ийг алсад сэргээнэ. */
    if (d.asOf === null) setAsOf(asOfOrig);
    /* ⚠️ 2026-10-05: буусан огнооны АГШИНГ хамт авна (`asOfAtRef`-ийн ⚠️) — дахин бичихэд шинэчлэхгүй */
    if (draftAsOf != null) asOfAtRef.current = { v: draftAsOf, at: d.asOfAt };
    else if (d.asOf === null) asOfAtRef.current = { v: null, at: d.asOfAt };

    const nCells = Object.keys(next).length;
    const nDates = Object.keys(nextDates).length;
    const total = nCells + nDates + (draftAsOf != null ? 1 : 0);
    /* ⚠️ 2026-10-04 аудит (#2 · #8): ХАДГАЛСАН АТЛАА БУУЛГААГҮЙ зүйл — ил хэлнэ. Ноорогт ҮЛДЭНЭ
       (тэмдэглэсэн нүд — `heldRef`).
       ⚠️ 2026-10-04 дахин аудит (#7): ЗӨВХӨН ШИНЭЭР тэмдэглэгдсэн түлхүүрийг (`heldWarnedRef`) — урьд нь
       тоо өөрчлөгдөх бүрд ижил анхааруулга давтагддаг байв; хугацаа ба «хаях» товчийг хамт хэлнэ. */
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
      /* ⚠️ 2026-10-09 (аудит №3): зорилтоор хойшлуулсан ба зөвшөөрөгдсөн нүдийг ил хэлнэ (нэг удаа) */
      if (fresh.tgt) warns.push(tr('Ноорогийн {0} нүд өөр ажилд (өнөөдрийн эсвэл өөр өдрийн бөглөлт) хамаарах тул буцаагдсан илгээлтийн засварт нийлүүлсэнгүй — ноорогт хадгалагдсан хэвээр, засвар дууссаны дараа буцаж гарна.', fresh.tgt));
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
    /* ⚠️ 2026-10-09 (аудит №3): зорилтоор хойшлуулсан нүд (`tgtHeld`) ч «хадгалсан» — ноорог устахгүй */
    const kept = dropped + ambig + srvChanged + tgtHeld;
    /*
     * ⚠️ 2026-10-09: ДЭЛГЭЦ ДЭЭРХ утгаас ӨӨРЧЛӨГДСӨН нүд/огноо (`PickRes.changed` · татах мөчлөгийн мэдэгдэл).
     *    Хадгалах `keepTyped` нь сэргээлтийн завсарт л үйлчилнэ — энд нийлүүлэлтийн үр дүнг харьцуулна.
     */
    const chg: string[] = [];
    {
      const cmp = (a: Record<string, string>, b: Record<string, string>) => {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) chg.push(k);
      };
      cmp(pendingRef.current, next);
      cmp(pendDateRef.current, nextDates);
      if (chg.length) res.changed = true;
    }
    /**
     * ⚠️ 2026-10-09: «Ноорог сэргээв…» нь ЗӨВХӨН сэргээлтэд (багц нээх — `poll` биш), салаа (`soft`) мэдэгдлээр.
     *    Урьд нь татах мөчлөг бүрд (3–6 сек) `say` («Энэ нүд засагдахгүй.» гарчигтай) дуудагдаж ЧУХАЛ
     *    анхааруулгыг дардаг байв. Татах мөчлөгт — ДЭЛГЭЦЭНД ХАРАГДАЖ буй нүд өөрчлөгдсөн бол л товч хэлнэ
     *    (шинэ баримт ирсэн бол FillNew «{0} илгээв» гэж хэлнэ — давхарлахгүй).
     */
    const soft = (msg: string) => (cbRef.current.soft ?? say)(msg);
    const pollNote = () => {
      if (!opts?.poll || warns.length || res.rcpt || !chg.length) return;
      const vis = cbRef.current.visibleKeys?.(chg) ?? [];
      if (vis.length) soft(tr('Хамтын ноорог шинэчлэгдлээ: {0} нүд өөрчлөгдөв.', chg.length));
    };
    pollNote();
    if (!total) {
      /**
       * ⚠️ ЧИМЭЭГҮЙ УСТГАХГҮЙ (2026-09-03-ны аудитын олдвор).
       *
       * Урьд нь энд `clearDraftLS` дуудагдаад ЧИМЭЭГҮЙ буцдаг байв: агшин
       * солигдоход бүх түлхүүр хуучирч `total = 0` болох тул хэрэглэгчийн
       * өдрийн ажил нэг ч үг гарахгүйгээр устдаг байлаа. Дээрх зөөлт
       * (`oidFix`) ихэнх тохиолдлыг нөхнө; нөхөж чадаагүй үед ХЭРЭГЛЭГЧ
       * шийднэ — цонх нээгдэж, юу ч сэргээгдэхгүйг ил хэлнэ.
       *
       * ⚠️ `dropped === 0` (ноорог үнэхээр хоосон байсан) бол цонх гаргах нь
       * дэмий — тэр үед л цэвэрлэнэ. Алсын хуулбарыг ч ХАМТ цэвэрлэнэ, эс
       * бөгөөс зомби мөр үлдэж ачаалалт бүрд дахин шүүгдэнэ.
       */
      /* ⚠️ ХООСОН НИЙЛБЭР ч ТӨЛӨВИЙГ ХООСЛОНО (2026-09-21-ний дахин аудит):
         нөгөө тал миний сүүлчийн нүдийг буцаасан (tombstone) бол нийлбэр хоосон
         ирнэ — урьд нь энд төлөв хөндөгдөхгүй буцдаг тул тэр нүд `pending`-д
         үлдэж, дараагийн хадгалалтаар алсад СЭРГЭДЭГ байв. */
      setPending(keepTyped({}));
      setPendDate(keepTyped({}));
      keepDraft.current = false;
      /* ⚠️ 2026-10-04: хоёрдмол/серверт өөрчлөгдсөн (`kept`) ч «хуучирсан»-тай ижил — устгахгүй */
      if (!kept) {
        /* ⚠️ TOMBSTONE БАЙВАЛ алсыг ЦЭВЭРЛЭХГҮЙ (2026-09-21, дахин аудит):
           устгавал буцаалтын баримт алга болж, хожуу ирэх хуучин хуулбар
           (өөр төхөөрөмжийн 3 хоногийн локал) нүдийг сэргээнэ. `delRef`-д
           дээр нийлүүлсэн тул хадгалах эффект хоосон нүд + del-тэй ноорог бичнэ.
           2026-10-04: илгээлтийн баримт (`rcptRef`) ч мөн адил. */
        if (delRef.current.size || rcptRef.current.size) return res;
        /* ⚠️ ЗӨВХӨН ноорог ҮНЭХЭЭР хоосон бол ЭНД устгана (2026-09-25-ны аудит):
           хадгалагдсантай ижил (`sameN`) нүд байвал ноорог хоосон биш — шийдвэрийг
           хадгалах эффектийн ердийн «хоосон төлөв» замд үлдээнэ. */
        if (sameN || d.cells.length || (d.dates ?? []).length) return res;
        clearDraftLS(pkg.key);
        /* ⚠️ 2026-10-04 аудит (#10): сохор `clearRemoteDraft` БИШ — уншсан хувилбартай таарвал л
           (`safeClearRemote`); завсарт өөр хүн бичсэн бол хөндөхгүй. */
        void safeClearRemote(pkg.key, restoreSinceRef.current ? (restoreAtRef.current || undefined) : undefined);
        return res;
      }
      /* ⚠️ ХУУЧИРСАН НҮДТЭЙ НООРОГИЙГ АВТОМАТААР УСТГАХГҮЙ (2026-09-25-ны аудит):
         `pending` хоосон болсноор хадгалах эффектийн «хоосон → устга» зам
         ноорогийг (локал + ArcGIS, бусдын нүдтэй нь) ЧИМЭЭГҮЙ арчдаг байв —
         дээрх «ЧИМЭЭГҮЙ УСТГАХГҮЙ» ⚠️-ийн шууд зөрчил. `keepDraft` нь тэр замыг
         хаана; хэрэглэгч «Ноорог устгах» эсвэл шинэ засвараар шийднэ. */
      keepDraft.current = true;
      /* ⚠️ Сэргээх зүйл алга АТЛАА хуучирсан нүд байна — ЧИМЭЭГҮЙ өнгөрөхгүй,
         харин цонх нээхгүй (2026-09-06): зөвхөн мэдэгдэнэ. */
      /* (анхааруулга гарсан бол түүнийг дарахгүй — нэг мэдэгдэл, `warns`-ийн ⚠️) */
      /* ⚠️ 2026-10-09: зөвхөн сэргээлтэд, салаа мэдэгдлээр (`soft`-ийн ⚠️) */
      if (dropped && !warns.length && !opts?.poll) soft(tr('Ноорогийн {0} нүд хуучирсан тул сэргээгдсэнгүй (агшин солигдсон).', dropped));
      return res;
    }
    /* ⚠️ Юу сэргээхийг ЗҮЙЛЧЛЭН хэлнэ — «12 засвар» гэдэг юу байсныг
       хэлдэггүй тул хэрэглэгч шийдэж чадахгүй. */
    const parts = [
      nCells ? tr('{0} гүйцэтгэлийн нүд', nCells) : '',
      nDates ? tr('{0} огноо', nDates) : '',
      draftAsOf != null ? tr('шинэчлэгдсэн огноо') : '',
    ].filter(Boolean);
    /*
     * ⚠️ АСУУХГҮЙ, ШУУД БУУЛГАНА (2026-09-06, хэрэглэгчийн заавар: «ноорогийг
     * сэргээхийг асуухгүй шууд ноорог гарч ирдэг байя, тэгээд өнгөөр ялгаж
     * хараад засна»).
     *
     * ТҮҮХ: хөтчийн `confirm` → апп доторх төвлөрсөн цонх (2026-09-03) →
     * ОДОО цонхгүй. Цонх нь ажлаа алдахаас хамгаалах зорилготой байсан ч
     * бөглөгч өдөрт хэд хэдэн удаа багц сольдог бөгөөд ТЭР БҮРД нэг ижил
     * асуултад «Сэргээх» дарах нь дэмий алхам болж байв.
     *
     * ⚠️ АЮУЛГҮЙ БОЛГОСОН ЗҮЙЛ: сэргээсэн нүд бүр НОГООН хүрээтэй (`dirty`)
     * гарах ба хэрэгслийн мөрөнд «ногоон: илгээгээгүй (N)» гэж тоологдоно —
     * хэрэглэгч юу сэргэснийг ХАРНА, цонхны задаргаа хэрэггүй болов. Хэрэв
     * хэрэггүй бол «Ноорог устгах» товчоор нэг товшилтоор хаяна.
     */
    /* ⚠️ ГУРВУУЛАНГ БОЛЗОЛГҮЙ тавина (2026-09-21-ний дахин аудит). Урьд нь
       `if (nCells) setPending(next)` гэх мэт байсан тул нөгөө тал энэ ангиллын
       СҮҮЛЧИЙН зүйлийг буцаасан/хассан (tombstone) бол ангилал хоосон ирж,
       төлөв ХӨНДӨГДӨХГҮЙ — буцаагдсан нүд/мөр энд үлдэж, дараагийн хадгалалт
       түүнийг алсад СЭРГЭЭДЭГ байв. Курсорын хамгаалалт хэвээр: татах мөчлөг
       нүд нээлттэй үед `pickDraft`-ыг огт дуудахгүй (`editRef`). */
    setPending(keepTyped(next));
    setPendDate(keepTyped(nextDates));
    if (draftAsOf != null) setAsOf(draftAsOf);
    /* Сэргээгдсэн тул хамгаалалт хэрэггүй — цаашид ердийн дүрмээр хадгалагдана */
    keepDraft.current = false;
    /* ⚠️ ЮУ СЭРГЭСНИЙГ ил хэлнэ: чимээгүй буувал хэрэглэгч «би энэ тоог
       бөглөсөн үү, эсвэл өмнөх хүн үү» гэж эргэлзэнэ. Хуучирсан нүд байвал
       тэр ч мөн адил — тоогоор нь хэлнэ. */
    const from = source === 'remote'
      ? tr('өөр төхөөрөмжөөс')
      : source === 'both'
        ? tr('энэ ба өөр төхөөрөмжөөс нийлүүлж')
        : tr('энэ компьютерээс');
    /* (анхааруулга гарсан бол түүнийг дарахгүй — `warns`-ийн ⚠️) */
    /* ⚠️ 2026-10-09: ЗӨВХӨН сэргээлтэд (`poll` биш), салаа мэдэгдлээр — дээрх `soft`-ийн ⚠️ */
    if (!warns.length && !opts?.poll) soft(dropped
      ? tr('Ноорог сэргээв ({0}): {1}. {2} нүд хуучирсан тул орхигдов.', from, parts.join(' · '), dropped)
      : tr('Ноорог сэргээв ({0}): {1}. Ногоон нүд = илгээгээгүй.', from, parts.join(' · ')));
    return res;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sc, nBld, pkg.key, asOfOrig, canPerf]);

  /**
   * `pickDraft`-ийн СҮҮЛИЙН хувилбар ref-д — 3 секундын нийлүүлэлтийн мөчлөг
   * түүнийг дуудна.
   * ⚠️ Мөчлөгийн эффект `pickDraft`-ээс ШУУД хамаарвал `rows` шинэчлэгдэх
   *    бүрд тоолуур дахин эхэлж, нийлүүлэлт хэзээ ч явахгүй болно.
   */
  const pickDraftRef = useRef(pickDraft);
  /* ⚠️ 2026-09-30: render-д биш ЭФФЕКТЭД тольдоно (react-hooks/refs) — уншигч нь дараа зарлагдсан эффект
     (нэг commit-д шинэ утгыг харна) эсвэл үйл явдал/async тул утга ижил. */
  useEffect(() => { pickDraftRef.current = pickDraft; }, [pickDraft]);

  /* ⚠️ 2026-09-30: сэргээх эффект `pickDraft`-ийн ДАРАА зарлагдана (react-hooks/immutability: зарлахаас өмнө
     хандах) — эффектүүдийн дараалал хэвээр (сэргээх → хадгалах → алсын → …), зан төлөв ижил. */
  // ── Нооргийн сэргээлт — багц ачаалагдмагц НЭГ удаа санал болгоно ──
  /** Сэргээх цонхонд харуулах ба хүлээгдэж буй ноорог (`null` = цонх хаалттай) */
  useEffect(() => {
    if (busy || !rows.length || !sc) return;
    // ⚠️ Мөр нь өөр багцынх байх агшин бий — `loadedPkgRef`-ийн тайлбар.
    if (loadedPkgRef.current !== pkg.key) return;
    /* ⚠️ ТҮГЖЭЭТЭЙ (хяналтын) харагдацад сэргээхгүй: тэнд `pending` дүүрвэл
       `dirtyCount > 0` болж, Ctrl+S нь хянагчийн нэрийн өмнөөс илгээлт
       үүсгэнэ. Ноорог нь localStorage-д ХЭВЭЭР үлдэж, хуудсаа бөглөх горимоор
       нээмэгц санал болгогдоно — тиймээс `promptedPkgRef` ч энд
       тэмдэглэгдэхгүй.
       ⚠️ 2026-09-04: «өнөөдөр аль хэдийн илгээгдсэн» гэсэн хэсэг ХУУЧИРСАН —
       илгээлт нь архивт биш, нэгтгэгддэг `sub|` мөрөнд очдог тул хоёр дахь
       бүтэн жааз үүсэх аюул алга. `noEdit` нь одоо ЗӨВХӨН `locked`. */
    if (noEdit) return;
    /* ⚠️ ГҮЙЦЭТГЭЛ БӨГЛӨХ ЭРХГҮЙ бол СЭРГЭЭХГҮЙ, ТЭМДЭГЛЭХГҮЙ (2026-09-25-ны
       аудит, HIGH). Урьд нь эрхгүй хүн (жиш. Багц 2-ын хяналтын инженер, эсвэл
       `guitsetgelAcl` хараахан sync хийгдээгүй — `effective()` = []) хуудсыг
       нээхэд `pickDraft` бүх нүдийг алгасаж `total = 0 · dropped = 0` гэж
       дүгнээд ХУВААЛЦСАН ноорогийг (локал + ArcGIS) устгадаг, татах мөчлөг
       нь гүйцэтгэгчийн бичилт бүрийн дараа ДАВТАН устгадаг байв. Ноорог нь
       энэ хүнд огт хамаагүй (илгээх ч эрхгүй) тул ХӨНДӨХГҮЙ; `promptedPkgRef`
       тавигдахгүй тул хадгалах эффектийн «хоосон → устга» зам ч нээгдэхгүй.
       Эрх ирэхэд (`canPerf` хамааралд) сэргээлт энгийнээр явна. */
    if (!canPerf) return;
    if (promptedPkgRef.current === pkg.key) return;
    // Сэргээх шат өнгөрснийг ноорог байсан эсэхээс үл хамааран тэмдэглэнэ.
    promptedPkgRef.current = pkg.key;
    /* ⚠️ 2026-10-09 (аудит №2): энэ сэргээлтийн үе (`restoreGenRef`-ийн ⚠️) */
    const gen = ++restoreGenRef.current;
    /* ⚠️ Хадгалах эффектийн «хоосон → устга» замыг сэргээлт дуустал хаана —
       `restoring`-ийн тайлбарыг үз. */
    restoring.current = true;
    /* ⚠️ 2026-10-01: энэ агшнаас хойш гараас бичсэн нүд сэргээлтэд ДАРАГДАХГҮЙ (`pickDraft`) */
    restoreSinceRef.current = stamp();
    /* ⚠️ АЛСЫН ноорогийг ч асууна (2026-09-03): оффисын компьютер дээр
       бөглөсөн ажил гэрийн компьютерт харагдах ёстой.
       ⚠️ 2026-09-08: ХОЁУЛАНГ НЬ НИЙЛҮҮЛНЭ, шинийг нь СОНГОХГҮЙ. Урьд нь
       `remote.t > local.t`-ээр нэгийг л авдаг байв — оффис дээр 30 нүд,
       гэртээ 5 нүд бөглөсөн бол гэрийнх шинэ тул оффисын 30 нүд бүхэлдээ
       хаягдана. Одоо нүд бүрд шинэ утгыг авч, зөвхөн нэг талд байгаа нүд
       хэвээр үлдэнэ (`mergeDrafts`). */
    const local = readDraft(pkg.key);
    let alive = true;
    void (async () => {
      /*
       * ⚠️ УНШИЛТЫН АЛДААГ ЯЛГАНА (2026-09-07).
       *
       * Урьд нь `loadRemoteDraft` нь «ноорог БАЙХГҮЙ» ба «уншиж ЧАДСАНГҮЙ»
       * хоёрыг ижил `null`-аар буцаадаг байв. Сүлжээ түр тасрах, токен
       * шинэчлэгдэх агшинд гэрийн компьютер дээр бөглөсөн ноорог ОГТ
       * сэргэхгүй, дэлгэцэд ямар ч алдаа гарахгүй — бөглөгч хоосон хуудас
       * хараад ажлаа алдсан гэж дүгнэнэ. Дээрээс нь `promptedPkgRef` аль
       * хэдийн тавигдсан тул тэр сешнд ДАХИН оролдохгүй: зөвхөн хуудсыг
       * бүтнээр дахин ачаалж (F5) байж сэргэдэг байлаа.
       *
       * ⚠️ Одоо: уншилт унавал (а) ИЛ мэдэгдэнэ, (б) `promptedPkgRef`-ийг
       * БУЦААЖ хоослох тул дараагийн ачаалалт (багц солиод буцах, эсвэл
       * мөр дахин татагдах) сэргээх шатыг ДАХИН нээнэ.
       */
      const rr = await readRemoteDraft(pkg.key);
      if (!alive) {
        /* ⚠️ Багц солигдсон/таб хаагдсан — сэргээлт таслагдав. `restoring`-ийг
           буцаана, эс бөгөөс дараагийн багцын хадгалах эффект мөнхөд
           хаалттай үлдэнэ. `promptedPkgRef`-ийг ч буцаана: энэ багц руу
           эргэж ирэхэд сэргээлт ДАХИН явах ёстой — ноорог хараахан
           буугаагүй.
           ⚠️ ЭФФЕКТИЙГ ДАХИН АСААНА (2026-09-25-ны аудит): хамаарал (`rows`,
           `asOfOrig` — хожуу давхарлалт г.м.) хөдөлсөн бол эффект аль хэдийн
           дахин ажиллаад `promptedPkgRef === pkg.key` дээр буцсан — хоослоод л
           орхивол юу ч түүнийг дахин асаахгүй, локал ноорог ХЭЗЭЭ Ч буухгүй,
           дараагийн засвар түүнийг дарж бичнэ. Багц солигдсон бол
           `promptedPkgRef` аль хэдийн "" тул энэ салаа ажиллахгүй. */
        /* ⚠️ 2026-10-09 (аудит №2): ШИНЭ сэргээлт аль хэдийн эхэлсэн бол юу ч хөндөхгүй (`restoreGenRef`-ийн ⚠️) —
           түүний `restoring`/`promptedPkgRef`-ийг буцааж, `remoteRetry`-ээр тасалж гогцоо үүсгэхгүй. */
        if (restoreGenRef.current !== gen) return;
        restoring.current = false;
        restoreSinceRef.current = 0;
        if (promptedPkgRef.current === pkg.key) { promptedPkgRef.current = ''; setRemoteRetry((n) => n + 1); }
        return;
      }
      if (!rr.ok) {
        /* ⚠️ `promptedPkgRef`-ийг хоослоод зогсохгүй, ЭФФЕКТИЙГ ӨӨРИЙГ НЬ дахин
           асаана (2026-09-08). Урьд нь хоослоод л орхидог байсан ч энэ эффектийн
           хамаарал (`rows`/`sc`/...) хөдлөхгүй бол дахин ажиллахгүй — сүлжээ
           сэргэсэн ч F5 хүртэл алсын ноорог ирдэггүй байв. `REMOTE_RETRY_MS`-ийн
           дараа `remoteRetry` цохиж дахин оролдоно; локал ноорог энэ агшинд аль
           хэдийн буусан тул хэрэглэгч хүлээх шаардлагагүй. */
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
      /* ⚠️ АЛСЫН ЗОМБИ — БҮТЦЭЭР ЭВДЭРСЭН хуулбарыг ArcGIS-ээс устгана.
         `parseDraft(…, 'remote')` хугацааг ШАЛГАДАГГҮЙ тул энэ мөр алсын
         ноорогийг хугацаанаас болж хэзээ ч устгахгүй (2026-09-08) — зөвхөн
         задарч чадахгүй бичлэг л хаягдана; үлдээвэл ачаалалт бүрд дахин
         шүүгдэж, өөр төхөөрөмж дээр ч буцаж гарна. */
      if (rem && !remote) void clearRemoteDraft(pkg.key);
      /*
       * ── ХУУЧИН (`хэрэглэгч|багц`) НООРОГИЙГ НЭГ УДАА ШИЛЖҮҮЛНЭ (2026-09-08) ──
       *
       * ⚠️ ЯАГААД ЗААВАЛ: түлхүүр `багц` болж өөрчлөгдсөн тул хуучин мөрүүд
       * шинэ хайлтад ОЛДОХГҮЙ — тэднийг хөндөхгүй бол хагас бөглөсөн ажил
       * чимээгүй алга болно (хэрэглэгчийн шийдвэр: «автоматаар шилжүүлнэ»).
       *
       * ⚠️ ЦӨМИЙГ НЬ нийлүүлнэ, нэгийг нь СОНГОХГҮЙ: нэг багцыг хоёр хүн
       * тус тусдаа бөглөж байсан бол ХОЁУЛАНГИЙН ажил үлдэх ёстой. Нүд тус
       * бүрээр шинэ агшинтай нь ялна (`mergeDrafts`).
       *
       * ⚠️ Эзэмшлийг (`by`) НӨХӨН БИЧНЭ: хуучин мөрөнд `by` байхгүй ч мөрийн
       * эзэн нь түлхүүрээс мэдэгдэнэ. Үүнгүйгээр шилжүүлсний дараа оролцогч
       * тодорхойгүй болж, «Илгээх» худал нээгдэнэ.
       *
       * ⚠️ Устгалт нь ЗӨВХӨН амжилттай бичсэний ДАРАА (доорх хадгалах эффект
       * алсад бичсэний дараа) — энд устгавал сүлжээ унахад ажил бүрмөсөн
       * алдагдана. Тиймээс `legacyPendingRef`-д тэмдэглээд хойшлуулна.
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
      /* ⚠️ Дээрх тасалдалтай ИЖИЛ — дахин оролдох замыг нээнэ (2026-09-25) */
      if (!alive) {
        /* ⚠️ 2026-10-09 (аудит №2): ШИНЭ сэргээлт аль хэдийн эхэлсэн бол юу ч хөндөхгүй (`restoreGenRef`-ийн ⚠️) —
           түүний `restoring`/`promptedPkgRef`-ийг буцааж, `remoteRetry`-ээр тасалж гогцоо үүсгэхгүй. */
        if (restoreGenRef.current !== gen) return;
        restoring.current = false;
        restoreSinceRef.current = 0;
        if (promptedPkgRef.current === pkg.key) { promptedPkgRef.current = ''; setRemoteRetry((n) => n + 1); }
        return;
      }
      /* ⚠️ 2026-10-01: ЛОКАЛЫГ ДАХИН УНШИНА — сэргээлтийн `await`-уудын завсарт гараас
         бичсэн нүдийг хадгалах эффект локалд бичсэн (эхэнд уншсан `local`-д БАЙХГҮЙ).
         Нүд бүрийн агшнаар (`byAt`) нийлж, шинэ бичилт ялна. */
      const localNow = readDraft(pkg.key);
      const merged = mergeDrafts(mergeDrafts(mergeDrafts(local, remote), localNow), migrated);
      /* ⚠️ Сэргээлт ЭНД дууслаа — буусан ч бай, сэргээх зүйл байгаагүй ч бай.
         Тугийг `pickDraft`-аас ӨМНӨ тайлна: тэр нь `setPending` хийж, дараагийн
         commit-д хадгалах эффект хоосон биш төлөвтэй ажиллах тул аюулгүй.
         Сэргээх зүйлгүй бол дараагийн хадгалах эффект хоосон слотыг цэвэрлэнэ —
         тэр нь ЗӨВ (устгах зүйл угаас байхгүй). */
      restoring.current = false;
      if (merged) {
        const src = local && remote ? 'both' : remote ? 'remote' : 'local';
        pickDraft(merged, src);
        /* ⚠️ 2026-10-04 аудит (#5): өмнөх сешнд АЛСАД ХУУЛАГДААГҮЙ (багц/харагдац солих үеийн
           бичилт унасан, илгээлтийн дараах tombstone г.м.) бол нийлбэрийг ДАХИН илгээнэ —
           `flush` нь read-merge-write тул бусдын ажлыг дарахгүй. Амжилттай бол тэмдэг арилна. */
        if (isUnsynced(pkg.key) && (!remoteQueue.current || remoteQueue.current.pkg === pkg.key)) {
          remoteQueue.current = { pkg: pkg.key, draft: { ...merged, t: Math.max(merged.t, stamp()) } };
          setRemoteTick((n) => n + 1);
        }
      }
      /* Нооргүй (локал ч, алсад ч) бол «хуулагдаагүй» тэмдэг утгагүй — арилгана */
      if (!merged && rr.ok) clearUnsynced(pkg.key, Number.MAX_SAFE_INTEGER);
      restoreSinceRef.current = 0;
      restoreAtRef.current = 0;
      /* ⚠️ 2026-10-01: нүдний түгжээ («Ноорог сэргээж байна…») тайлагдана */
      setRestDonePkg(pkg.key);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, rows, sc, nBld, pkg.key, canPerf, asOfOrig, noEdit, remoteRetry]);

  /** «Сэргээх» — ноорогийг төлөв рүү буулгана */
  /**
   * «НООРОГ УСТГАХ» — сэргээгдсэн ноорогийг бүрмөсөн хаяна.
   *
   * ⚠️ 2026-09-06: сэргээх ЦОНХ хасагдсан (ноорог шууд буудаг болсон) тул
   * «болих» цорын ганц зам ЭНЭ товч болов. Урьд нь цонхны «Устгах» гарц
   * байсан; түүнгүйгээр хэрэглэгч 40 нүдийг ГАРААР цэвэрлэх шаардлагатай
   * болно.
   *
   * ⚠️ Локал БА алсын хуулбар ХОЁУЛАА устана — эс бөгөөс дараагийн
   * ачаалалтад «устгасан ажил» буцаж ирнэ.
   */
  const dropDraft = useCallback(() => {
    /*
     * ⚠️ ХУВААЛЦСАН НООРОГ — БУСДЫН АЖИЛ ч устана (2026-09-08). Ноорог одоо
     * БАГЦЫНХ тул `clearRemoteDraft` нь бүх оролцогчийн бөглөлтийг арчина.
     * Өөр хүн ажиллаж байвал ЗААВАЛ баталгаажуулж асууна — эс бөгөөс нэг
     * товшилтоор нөгөө хүний хагас өдрийн ажил сэргээх аргагүй алга болно.
     */
    const others = [...participants].filter((u) => u !== meKey);
    /* ⚠️ ҮРГЭЛЖ баталгаажуулна (2026-09-23) — ганцаараа бөглөж байхад ч нэг
       товшилтоор `dirtyCount` нүд сэргээх аргагүй арилдаг байв. */
    const nCell = String(dirtyCount);
    if (!window.confirm(others.length
      ? tr(
        'Энэ нооргийг {0} мөн бөглөж байна. Устгавал ТЭДНИЙ ажил ч арилна ({1} нүд). Үргэлжлүүлэх үү?',
        others.sort().join(', '), nCell,
      )
      : tr('Илгээгээгүй {0} нүдний засвар арилна. Ноорог устгах уу?', nCell))) return;
    /* ⚠️ УСТГАСАН НҮД БҮРД TOMBSTONE (2026-09-25-ны аудит). Урьд нь алсын мөрийг
       шууд устгаж `delRef`-ийг тэглэдэг тул бусад оролцогч/төхөөрөмжид «устгасан»
       гэсэн баримт хүрэхгүй: Б-гийн дэлгэц дээрх `pending` дараагийн засвараар
       (алсад мөр алга тул) БҮТНЭЭРЭЭ буцаж бичигдэж, устгасан нүд А дээр дахин
       гарч ирдэг байв. Одоо түлхүүр бүрд ОДООГИЙН агшны tombstone-той хоосон
       ноорог бичнэ (read-merge-write) — `mergeDrafts` нь үүнээс ӨМНӨ хөндсөн
       нүдийг хаа ч хасна, ХОЖУУ бичсэнийг үлдээнэ. `done: []` — бүх «дуусгасан»
       тэмдэглэгээг ил буцаана. Устгах нүд байхгүй (зөвхөн огноо) бол урьдын адил. */
    /* ⚠️ 2026-10-04 аудит (#10): логик цаг (`stamp`) — `Date.now()` нь цаг хоцорсон төхөөрөмж
       дээр бусдын ӨМНӨ бичсэн хуулбараас «эрт» гарч tombstone ялагддаг байв. */
    const nowMs = stamp();
    /* ⚠️ 2026-10-04 (#2 · #8): ЛОКАЛ ноорогт ХАДГАЛАГДСАН ч буулгаагүй (хоёрдмол/хуучирсан/серверт
       өөрчлөгдсөн) түлхүүрүүд ч устах ёстой — эс бөгөөс «Ноорог устгах» дарсны дараа ч анхааруулга
       мөнхөд гарна (`writeDraftLS` нийлүүлж хадгалдаг). */
    const ld = readDraft(pkg.key);
    const tombKeys = [...new Set([
      ...Object.keys(pending), ...Object.keys(pendDate),
      ...(ld?.cells ?? []).map(([k]) => k), ...(ld?.dates ?? []).map(([k]) => k),
      /* ⚠️ 2026-10-04 дахин аудит (#7): тэмдэглэсэн нүд ч (ТАБЫН төлөвт — `heldRef`) */
      ...heldRef.current.keys(),
    ])];
    heldRef.current = new Map();
    setHeldN(0);
    /* ⚠️ ОГНООНЫ ӨӨРЧЛӨЛТ ч ИЛ БУЦААЛТААР (2026-09-25-ны аудит, `asOfRevRef`-ийн
       ⚠️): алсыг устгах нь бусад төхөөрөмжийн X огноог сэргээх зам үлдээнэ. */
    if (asOf !== asOfOrig) asOfRevRef.current = true;
    setPending({});
    setPendDate({});
    setAsOf(asOfOrig);
    /* ⚠️ Хамтын төлөвийг ч ЗААВАЛ цэвэрлэнэ: үлдвэл устгагдсан нооргийн
       «дуусгасан» тэмдэглэгээ шинэ бөглөлтөд наалдаж, «Илгээх» худал
       түгжигдэнэ (эсвэл худал нээгдэнэ). */
    mineRef.current = new Set();
    /* ⚠️ 2026-10-01: «дуусгасан» тэмдэг бүрийг ИЛ буцаана (`undoAllMarks`) — `done: []` нь
       «нэр алга = буцаасан» дүрэм хүчингүй болсон тул хангалтгүй. */
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
        /* ⚠️ 2026-10-05: ил буцаалт — шинэ агшинтай (`Draft.asOfAt`) */
        asOfAt: asOfRevRef.current ? (asOfAtRef.current = { v: null, at: nowMs }).at : undefined,
        done: [], marks: [...marksRef.current.values()], del: [...delRef.current],
        rcpt: rcptRef.current.size ? packRcpt(rcptRef.current.values()) : undefined,
        /* ⚠️ 2026-10-04 (#6): өөрийн зорилтыг ИЛ цэвэрлэнэ (`clearMyTgt` — OBJECTID 0, шинэ агшинтай нь
           нийлүүлэлтэд ялна); дахин аудит (#4): бусдынх хэвээр. */
        tgt: tgtsRef.current.size ? [...tgtsRef.current.values()] : undefined,
      };
      if (!saveDraftLS(pkg.key, tomb)) setLocalFail(true);
      markUnsynced(pkg.key, tomb.t);
      remoteQueue.current = { pkg: pkg.key, draft: tomb };
      setRemoteTick((n) => n + 1);
    } else {
      clearDraftLS(pkg.key);
      /* ⚠️ 2026-10-04 аудит (#10): түгжээтэй хоослолт — `safeClearRemote`-ийн ⚠️ */
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
    /* ⚠️ ХУУЧИН БАГЦЫН ТӨЛӨВӨӨР ШИНЭ СЛОТ РУУ БИЧИХГҮЙ. Багц солигдсон эхний
       render дээр `pkg.key` нь ШИНЭ, харин `pending`/`adds` нь ХУУЧИН багцынх
       (цэвэрлэлт нь дараагийн render-д тусна) — тэр агшинд бичвэл зорилтот
       багцын ноорог дарагдаж устана. `loadedPkgRef` нь мөр ба төлөв аль
       багцынх болохыг заана. */
    if (loadedPkgRef.current !== pkg.key) return;
    /* ⚠️ ХООСОН гэдгийг ДӨРВҮҮЛЭНГЭЭР шалгана: зөвхөн `pending`-ээр шалгавал
       огноо/баримт засаад гүйцэтгэлийн нүд хөндөөгүй хэрэглэгчийн ноорог
       хадгалагдахын оронд УСТАНА. */
    const asOfChanged = asOf !== asOfOrig;
    /**
     * ⚠️ 2026-10-05: ноорогт бичигдэх `asOf`-ын агшин (`asOfAtRef`-ийн ⚠️). Утга нь сүүлд мэдсэнээс
     *    ӨӨР бол энэ табд өөрчлөгдсөн — шинэ `stamp()`; ижил бол хуучин агшин хэвээр (бусдаас буусан
     *    огноог «шинэ» болгож хожуу засварыг дарахгүй). `undefined` = огноо хөндөгдөөгүй.
     */
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
      /* ⚠️ 2026-10-04 дахин аудит (#7): тэмдэглэсэн нүд ч агуулга — ердийн замаар ноорогт бичигдэнэ */
      && !heldRef.current.size
    ) {
      /* ⚠️ «Дараа шийднэ» гэж хаасан ноорогийг ЭНД устгахгүй: төлөв хоосон нь
         энэ тохиолдолд «нийтэлсэн/болиулсан» биш «хараахан сэргээгээгүй»
         гэсэн утгатай. Тугийг зөвхөн сэргээх/устгах шийдвэр тайлна. */
      /* ⚠️ СЭРГЭЭЛТ ЯВЖ БАЙХАД УСТГАХГҮЙ (2026-09-08) — `restoring`-ийн тайлбар:
         `promptedPkgRef` тавигдсан ч ноорог хараахан буугаагүй, «хоосон» нь
         «нийтэлсэн» биш «хүлээж байна» гэсэн утгатай. */
      if (promptedPkgRef.current === pkg.key && !keepDraft.current && !restoring.current) {
        /*
         * ⚠️ TOMBSTONE БАЙВАЛ ЦЭВЭРЛЭХГҮЙ, ХООСОН + del-ТЭЙ НООРОГ БИЧНЭ
         *    (2026-09-21-ний дахин аудит). Хэрэглэгч бүх нүдээ буцаасан (эсвэл
         *    нөгөө тал буцаасан) бол `pending` хоосон боловч буцаалтын баримт
         *    (`del`) алсад ҮЛДЭХ ёстой — цэвэрлэвэл өөр төхөөрөмжийн 3 хоногийн
         *    локал хуулбар нүдийг сэргээнэ. 7 хоногоос хуучин tombstone-ийг
         *    энд ч хасна (`mergeDrafts`-тай ижил хугацаа); бүгд хуучирсан бол
         *    урьдын адил цэвэрлэнэ.
         * ⚠️ 2026-09-25-ны аудитаас «Илгээх» ба «Ноорог устгах» ч `delRef`-д
         *    ИЛГЭЭСЭН/УСТГАСАН түлхүүр бүрийн tombstone тавьдаг тул ЭНЭ замаар
         *    хоосон + del-тэй ноорог бичигдэнэ (өмнө нь алсыг устгадаг байсан ч
         *    бусад төхөөрөмж/оролцогчийн хуучин хуулбар тэр нүдийг сэргээдэг байв).
         */
        /* ⚠️ 2026-10-04 (#10): логик цаг — tombstone бусдын хуулбараас «эрт» гарахгүй */
        const nowMs = stamp();
        const liveDel: [string, number][] = [...delRef.current].filter(([, a]) => nowMs - a <= DEL_TTL_MS);
        /* ⚠️ 2026-10-04 (#4): илгээлтийн баримт ч мөн «хоосон + баримттай» ноорог бичүүлнэ */
        /* ⚠️ 2026-10-04 дахин аудит (#2): хуучин жаазны баримт 1 хоногт хуучирна (`rcptAlive`) */
        const liveRc = [...rcptRef.current.values()].filter((r) => rcptAlive(r, nowMs, minOidRef.current));
        /* ⚠️ ОГНООНЫ БУЦААЛТ ч TOMBSTONE (2026-09-25-ны аудит, `asOfRevRef`-ийн ⚠️):
           `asOf` өөрчлөгдөж бичигдээд анхны утгандаа буцсан бол алсыг УСТГАХГҮЙ —
           `asOf: null` (ил буцаалт)-тай хоосон ноорог бичнэ, эс бөгөөс бусад
           төхөөрөмжийн хуулбар X огноог сэргээнэ. */
        if (liveDel.length || liveRc.length || asOfRevRef.current) {
          delRef.current = new Map(liveDel);
          rcptRef.current = new Map(liveRc.map((r): [string, Rcpt] => [r[0], r]));
          const tomb: Draft = {
            t: nowMs, mode: 'inc', cells: [], dates: [], rowKeys: [],
            asOf: asOfRevRef.current ? null : undefined,
            /* ⚠️ 2026-10-05: огнооны өөрийн агшин (`asOfStampOf`) */
            asOfAt: asOfStampOf(asOfRevRef.current ? null : undefined),
            done: doneRef.current, marks: [...marksRef.current.values()], del: liveDel,
            rcpt: liveRc.length ? packRcpt(liveRc) : undefined,
            /* ⚠️ 2026-10-04 дахин аудит (#4): хүн бүрийн зорилт (ТАБЫН мэдэх бүгд — `tgtsRef`-ийн ⚠️) */
            tgt: tgtsRef.current.size ? [...tgtsRef.current.values()] : undefined,
          };
          /* ⚠️ 2026-10-04 (#9): локалыг НИЙЛҮҮЛЖ бичнэ (хоёр таб · хадгалсан хоёрдмол нүд), унавал ил */
          const w = writeDraftLS(pkg.key, tomb);
          setLocalFail(!w.ok);
          markUnsynced(pkg.key, tomb.t);
          remoteQueue.current = { pkg: pkg.key, draft: tomb };
          setRemoteTick((n) => n + 1);
          setSavedAt(null);
          return;
        }
        /* ⚠️ ЗӨВХӨН ХООСОН БИШ → ХООСОН ШИЛЖИЛТЭД (2026-09-25-ны аудит,
           `draftLiveRef`-ийн ⚠️). Энэ сешнд ноорог хоосон биш байгаагүй бол эффект
           дахин ажилласан (`rows` г.м.) л гэсэн үг — алсад БУСДЫН (хараахан татаж
           амжаагүй) ноорог байж болох тул устгахгүй, хамтын төлөвийг ч хөндөхгүй. */
        if (!draftLiveRef.current) {
          setSavedAt(null);
          return;
        }
        /* ⚠️ 2026-10-04 (#2 · #8): локалд энэ табд БУУГААГҮЙ нүд байвал ЦЭВЭРЛЭХГҮЙ — ижил хөтчийн өөр
           таб бичсэн (`writeDraftLS`) хараахан татагдаагүй ажил байж болно.
           ⚠️ 2026-10-04 дахин аудит (#7): тэмдэглэсэн нүд одоо ТАБЫН төлөвт (`heldRef` — энд хүрэхгүй),
           өөрчлөлтгүй нүд tombstone-оор (`noop`) арилдаг тул энэ шалгалт мөнхөд хаахгүй. */
        {
          const ldx = readDraft(pkg.key);
          if (ldx && (ldx.cells.length || (ldx.dates ?? []).length)) {
            setSavedAt(null);
            return;
          }
        }
        draftLiveRef.current = false;
        clearDraftLS(pkg.key);
        /* ⚠️ Нийтэлсэн/болиулсны дараа АЛСЫН хуулбар ч цэвэрлэгдэнэ — хэрэглэгч:
           «нийтлэгдэхэд тэр файл хоослогдоно». Эс бөгөөс өөр төхөөрөмж дээр
           нийтлэгдсэн ажил «нийтлэгдээгүй» гэж дахин санал болгогдоно.
           ⚠️ 2026-10-04 аудит (#10): ТҮГЖЭЭТЭЙ (`safeClearRemote`) — сохор устгалт нь уншсанаас
           хойш бичсэн БУСДЫН нүдийг арчдаг байв. */
        void safeClearRemote(pkg.key);
        /* ⚠️ ХАМТЫН ТӨЛӨВ ч цэвэрлэгдэнэ (2026-09-08): илгээгдсэний дараа
           «дуусгасан» тэмдэглэгээ үлдвэл дараагийн бөглөлтөд наалдаж,
           тэр хүн ирээгүй байхад «Илгээх» худал түгжигдэнэ. */
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
    /* ⚠️ 2026-09-30: localStorage-д бичсэн АГШИН (гадны системийн үйлдлийн үр дүн) — эффектээс өөр газар
       мэдэгдэхгүй (2026-10-04: lint-ийн чиглүүлэгч хэрэггүй болсон — дүрэм энд мэдээлэхээ болив). */
    setSavedAt(at);
    /* 2026-09-25: хоосон биш ноорог — `draftLiveRef`/`asOfRevRef`-ийн ⚠️ */
    draftLiveRef.current = true;
    if (asOfChanged) asOfRevRef.current = true;
    /* ⚠️ Хоосон биш ноорог бичигдэж байна — «хуучирсан нүдтэй ноорог»-ийн хамгаалалт
       (`pickDraft`-ийн `keepDraft = true`, 2026-09-25) цаашид утгагүй: локал хуулбар
       одоо энэ төлөвөөр солигдоно. Үлдээвэл дараа нь бүх нүдээ буцаахад (хоосон
       төлөв) tombstone/цэвэрлэгээ хийгдэхгүй, буцаасан нүд локалаас сэргэнэ. */
    keepDraft.current = false;
    /* ⚠️ Ноорогт хамрагдсан мөр БҮРИЙН танигчийг хамт хадгална — агшин
       солигдоход (өөр хүн нийтлэхэд) түлхүүрүүдийг шинэ ObjectID руу зөөх
       ЦОРЫН ГАНЦ зам. Зөвхөн хэрэгтэй мөрийг л бичнэ: 1,400 мөрийн бүтэн
       толь нь ноорогийг хэдэн зуун KB болгож, алсын хязгаараас хална. */
    const usedOids = new Set<number>();
    for (const k of [...Object.keys(pending), ...Object.keys(pendDate)]) {
      const o = Number(k.slice(0, k.indexOf(":")));
      if (Number.isFinite(o) && o >= 0) usedOids.add(o);
    }
    /*
     * ⚠️ 2026-10-04 дахин аудит (#7): ТЭМДЭГЛЭСЭН (буулгаагүй) нүд ноорогт ТОГТВОРТОЙ бичигдэнэ (`heldRef`-ийн
     *    ⚠️) — урьд нь зөвхөн локалд нийлүүлэлтээр үлдэж, уншилтгүй `flush` алсаас арчдаг байв. Хэрэглэгч тэр
     *    түлхүүрийг дахин бөглөсөн бол (`pending`-д) тэмдэг арилна. Мөр нь одоогийн жаазад байхгүй бол
     *    танигчийг ноорогоос авсан хэвээр (`rk`/`occ`) бичнэ — эс бөгөөс дараагийн сэргээлт зөөж чадахгүй.
     */
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

    /*
     * ⚠️ ЭЗЭМШЛИЙН ЗУРАГЛАЛ (2026-09-08) — ноорог БАГЦААР хуваалцагддаг тул
     * «энэ багц дээр хэн ажиллаж байна» гэдгийг ТОМИЛГООГҮЙГЭЭР мэдэх ёстой.
     * Энэ сешнд өөрчлөгдсөн нүд бүрийг өөрийн нэрээр тэмдэглэнэ; бусдын
     * нүдний эзэн нь `mergeDrafts`-аар хэвээр үлдэнэ.
     *
     * ⚠️ ЗӨВХӨН ӨӨРИЙН нүдийг тэмдэглэнэ — `pending` дотор бусдын бөглөсөн
     * нүд ч байгаа (нийлүүлэлтээр ирсэн). Тэднийг өөрийн нэрээр дарж бичвэл
     * оролцогчийн жагсаалт нэг хүн болж хумигдана: «Илгээх» түгжээ утгагүй
     * болж, хагас бөглөсөн ажил илгээгдэнэ. `mineRef` нь энэ сешнд ГАРААС
     * бичсэн нүдийг л хөтөлдөг.
     */
    const me = user?.username?.trim().toLowerCase() ?? '';
    /* ⚠️ БУСДЫН ЭЗЭМШЛИЙГ ЭХЛЭЭД (2026-09-08): `byMap` нь нийлүүлэлтээр ирсэн
       бусад оролцогчийн нүднүүд. Зөвхөн `mineRef`-ийг бичвэл энэ хөтчийн
       ноорог тэднийг АГУУЛАХГҮЙ гарч, `flush`-ийн нийлүүлэлт хүртэлх зайд
       (эсвэл локалаас сэргээхэд) оролцогчийн жагсаалт хумигдаж «Илгээх»
       түгжээ санамсаргүй нээгдэнэ. Өөрийн нүд нь доор ДАРЖ бичигдэнэ —
       тухайн нүдийг сүүлд хөндсөн хүн эзэн. */
    const byM = new Map<string, string>();
    for (const [k, u] of byMapRef.current) if (k in pending || k in pendDate) byM.set(k, u);
    if (me) for (const k of mineRef.current) if (k in pending || k in pendDate) byM.set(k, me);
    const by: [string, string][] = [...byM];
    /*
     * ⚠️ АГШИН ба TOMBSTONE (2026-09-21). Өөрийн нүд → `mineAtRef` (байхгүй бол
     *    энэ хадгалалтын агшин — зөөгдсөн түлхүүр г.м.), бусдынх → нийлүүлэлтээр
     *    ирсэн `byAtRef`. `del` нь зөвхөн ОДОО pending-д БАЙХГҮЙ түлхүүрүүд —
     *    дахин бичсэн нүдний tombstone аль хэдийн `touchMine`-аар арилсан ч
     *    давхар хамгаална.
     */
    const byAt: [string, number][] = [];
    for (const [k] of byM) {
      const a = mineRef.current.has(k) ? (mineAtRef.current.get(k) ?? at) : byAtRef.current.get(k);
      if (a != null) byAt.push([k, a]);
    }
    /* ⚠️ 2026-10-04 дахин аудит (#7): тэмдэглэсэн нүдний эзэн ба АНХНЫ агшин (тэмдэглэсэн агшнаас өмнө —
       `mergeDrafts` тэмдгийг хадгална) */
    for (const [k, h] of heldList) {
      if (h.by) by.push([k, h.by]);
      byAt.push([k, h.at]);
    }
    /* 7 хоногоос хуучин tombstone-ийг бичихгүй (`DEL_TTL_MS`, `mergeDrafts`-тай ижил). */
    const del: [string, number][] = [...delRef.current]
      .filter(([k, a]) => !(k in pending) && !(k in pendDate) && !heldSet.has(k) && at - a <= DEL_TTL_MS);
    /* ⚠️ 2026-10-04 аудит (#2): ДАВТАМЖИЙН ДУГААР — ХУУДАСНЫ БҮХ мөрөөр бодно (`Draft.rowOcc`-ийн ⚠️) */
    const rowOcc = [...rowOccOf(rows, usedOids), ...heldOcc];
    /* ⚠️ 2026-10-04 (#4): нүд бүрийн суурь баримт ба баримтууд (`Draft.rcpt`/`bt`-ийн ⚠️) */
    const bt: [string, number][] = [];
    for (const k of [...Object.keys(pending), ...Object.keys(pendDate)]) {
      const a = btRef.current.get(k);
      if (a) bt.push([k, a]);
    }
    /* ⚠️ 2026-10-04 дахин аудит (#2): хуучирсан ба ХУУЧИН ЖААЗНЫ (1 хоногоос хуучин) баримтыг ТАБЫН
       төлөвөөс ч хасна (`rcptAlive`); ноорогт ШАХСАН хэлбэрээр (`packRcpt`). */
    for (const [k, r] of [...rcptRef.current]) if (!rcptAlive(r, at, minOidRef.current)) rcptRef.current.delete(k);
    const rcpt = [...rcptRef.current.values()];
    /* ⚠️ 2026-10-04 (#8): ҮНЭМЛЭХҮЙ утгын СУУРЬ — анх засах үеийн серверийн утга (дараа нь хөдлөхгүй) */
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
      /* ⚠️ 2026-10-04 дахин аудит (#7): серверт өөрчлөгдсөн (тэмдэглэсэн) огнооны суурь ч хамт — эс
         бөгөөс дараагийн сэргээлт суурьгүй гэж үзэж хуучин утгаар ДАРНА */
      for (const [k, h] of heldList) if (h.b != null && /:[se]$/.test(k)) datesB.push([k, h.b]);
    }
    if (asOfChanged) { if (asOfBRef.current === undefined) asOfBRef.current = asOfOrig; } else asOfBRef.current = undefined;
    /*
     * ⚠️ 2026-10-04 (#6): зорилт — ноорогт аль хэдийн байгаа нь «наалдамтгай», эс бөгөөс одоогийнх.
     * ⚠️ 2026-10-04 дахин аудит (#4): ЗӨВХӨН ӨӨРИЙН бичлэг (`[нэр, OBJECTID, fillMs, агшин]`) өөрчлөгдөнө —
     *    урьд нь ганц `tgt` хадгалалт бүрд (татаж авсан бусдын нүдээр ч) бичигдэж, нэг хүний буцаагдсан
     *    тойрог бүх оролцогчийн «Илгээх»-ийг түгждэг байв. Бусдынх нь хэвээр (`tgtsRef`).
     */
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
      /* ⚠️ `pending` нь НЭМЭЛТ (2026-09-25) — туг ЗААВАЛ, эс бөгөөс НИЙТ гэж уншигдана */
      mode: 'inc',
      /* ⚠️ 2026-10-04 дахин аудит (#7): тэмдэглэсэн нүд ч (ӨӨРИЙН түлхүүрээр — `heldList`) */
      cells: [...Object.entries(pending), ...heldList.filter(([k]) => !/:[se]$/.test(k)).map(([k, h]): [string, string] => [k, h.v])],
      dates: [...Object.entries(pendDate), ...heldList.filter(([k]) => /:[se]$/.test(k)).map(([k, h]): [string, string] => [k, h.v])],
      /* ⚠️ Анхны утгандаа БУЦСАН бол `null` (ил буцаалт) — `asOfRevRef`-ийн ⚠️
         (2026-09-25). `undefined` = огноо хөндөгдөөгүй. */
      asOf: asOfChanged ? asOf : asOfRevRef.current ? null : undefined,
      /* ⚠️ 2026-10-05: огнооны өөрийн агшин (`asOfStampOf`) */
      asOfAt: asOfStampOf(asOfChanged ? asOf : asOfRevRef.current ? null : undefined),
      /* ⚠️ `adds`/`sent` БИЧИГДЭХГҮЙ (2026-09-24) — энэ хуудас мөр нэмэхгүй;
         хуучин ноорогийнх `mergeDrafts`-аар л дамжина. */
      rowKeys,
      by: by.length ? by : undefined,
      /* ⚠️ `done` нь ноорогийн ӨӨРИЙН төлөв — бөглөлтөөс биш, товчноос
         өөрчлөгдөнө. Тиймээс энд ӨМНӨХ утгыг нь дамжуулна (`doneRef`), эс
         бөгөөс засвар бүр «дуусгасан» тэмдэглэгээг арчих байв.
         ⚠️ ХООСОН МАССИВ ч бичигдэнэ — `undefined` болговол «буцаасан» гэдэг
         мэдээлэл алдагдаж, тэмдэглэгээ нийлүүлэлтээр сэргэнэ. */
      done: doneRef.current,
      /* ⚠️ 2026-10-01: ИЛ тэмдгүүд (`Draft.marks`) — ҮРГЭЛЖ (хоосон ч) бичнэ */
      marks: [...marksRef.current.values()],
      byAt: byAt.length ? byAt : undefined,
      del: del.length ? del : undefined,
      /* 2026-10-04 аудит — давтамж · баримт · суурь · зорилт (`Draft`-ийн ⚠️) */
      rowOcc: rowOcc.length ? rowOcc : undefined,
      rcpt: rcpt.length ? packRcpt(rcpt) : undefined,
      bt: bt.length ? bt : undefined,
      tgt: tgtW,
      /* ⚠️ 2026-10-04 дахин аудит (#7 · #3): тэмдэглэсэн нүдний тэмдэг (агшин · албадах) */
      /* ⚠️ 2026-10-09 (аудит №3): зорилтоор хойшлуулсан ('tgt') нүд тэмдэггүй — ЭНЭ табын төлөв (бусад клиентэд энгийн нүд) */
      hold: heldList.some(([, h]) => h.why !== 'tgt')
        ? heldList.filter(([, h]) => h.why !== 'tgt').map(([k, h]): [string, number, 0 | 1] => [k, h.since, h.force])
        : undefined,
      asOfB: asOfChanged ? asOfBRef.current : undefined,
      datesB: datesB.length ? datesB : undefined,
    };
    /* ⚠️ 2026-10-04 аудит (#9): ЛОКАЛЫГ НИЙЛҮҮЛЖ бичнэ (`writeDraftLS` — хоёр таб бие биеийг
       дарахгүй, буулгаагүй хадгалсан нүд үлдэнэ); унавал «хадгалагдав» гэж ХУДАЛ батлахгүй. */
    const wr = writeDraftLS(pkg.key, draft);
    setLocalFail(!wr.ok);
    /* ⚠️ 2026-10-04 (#5): алсад хуулагдтал тэмдэглэнэ — амжилттай бичилт (`flush`) арилгана */
    markUnsynced(pkg.key, draft.t);
    /* ⚠️ АЛСЫН ХУУЛБАРЫГ ЭНД ШУУД БИЧИХГҮЙ — нүд бүрийн товшилтод ArcGIS руу
       хүсэлт явбал сүлжээ дүүрч, бөглөлт удаашрана. Ноорогийг зөвхөн ТӨЛӨВТ
       тавиад, доорх завсарлагатай эффект илгээнэ. */
    /* ⚠️ ДАРААЛАЛД БАГЦЫН ТАМГА ЗААВАЛ (2026-09-03-ны аудитын олдвор): багц
       солиход энэ дараалал цэвэрлэгддэггүй байсан тул завсарлага дуусахаас
       өмнө шилжвэл Багц 1-ийн ноорог ШИНЭ `pkg.key`-ээр буюу Багц 2-ын
       алсын слотод бичигддэг байв. Дараа нь Багц 2 нээхэд тэр харь ноорог
       ирж, нэг ч ObjectID таарахгүй тул Багц 2-ын ЖИНХЭНЭ ноорог устана.
       Локал зам нь яг энэ эрсдэлийг `loadedPkgRef`-ээр аль хэдийн барьсан. */
    remoteQueue.current = { pkg: pkg.key, draft };
    setRemoteTick((n) => n + 1);
    /* ⚠️ `rows` нь хамаарлын жагсаалтад ЗААВАЛ — `rowKeys` түүнээс баригдана.
       Мөр ачаалагдахаас өмнөх (хоосон) төлөвөөр бичвэл танигчгүй ноорог
       үүсэж, зөөх боломж дахин алдагдана. */
  }, [pending, pendDate, asOf, asOfOrig, pkg.key, rows, user?.username, loadedPkgRef, curTgt, stamp, safeClearRemote]);

  /**
   * ── АЛСЫН ХУУЛБАР (ArcGIS) — `REMOTE_DEBOUNCE_MS` (3 сек) завсарлагатай ──
   *
   * ⚠️ ЯАГААД (2026-09-03, хэрэглэгч: «өөр browser, өөр газраас орход ч draft
   * хадгалагдаж байх ёстой»): `localStorage` нь НЭГ хөтчид хязгаарлагдана.
   * Алсын хуулбар нь зөвхөн «өөр төхөөрөмж рүү шилжих» асуудлыг шийднэ —
   * бөглөлтийн үндсэн зам нь локал хэвээр, сүлжээ унасан ч ажил зогсохгүй.
   *
   * ⚠️ ЗАВСАРЛАГАА: бичихээ зогсоод 3 секунд өнгөрөхөд НЭГ удаа илгээнэ.
   * Тоолуур засвар бүрд дахин эхэлдэг тул тасралтгүй бичиж байхад хүсэлт
   * явахгүй; хамгийн муудаа 3 секундын ажил алсад хоцорно (локалд ХЭВЭЭР).
   * 2026-09-08: 12 → 3 сек (хэрэглэгчийн заавар) — тогтмол дээр тайлбартай.
   *
   * ⚠️ ТАБ НУУГДАХАД шууд илгээнэ: `beforeunload` дээр async хүсэлт эхлэх ч
   * дуусах баталгаагүй — `visibilitychange` нь таб хаагдахаас өмнө ирдэг тул
   * бодит боломж энэ.
   */
  useEffect(() => {
    if (!remoteTick) return undefined;
    /**
     * @param pkgKey ⚠️ БАГЦ СОЛИХ үеийн ИЛ түлхүүр (2026-09-24-ний аудит):
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
      /* ⚠️ ӨӨР БАГЦЫН ноорог бол ХАЯНА, бичихгүй: дараалалд үлдсэн хуучин
         багцын ноорогийг одоогийн багцын слотод бичих нь өгөгдөл СОЛИХ
         алдаа. Локалд аль хэдийн бүрэн хадгалагдсан тул алдагдал үүсэхгүй. */
      if (q.pkg !== (pkgKey ?? pkg.key)) { remoteQueue.current = null; return; }
      remoteQueue.current = null;
      const allowStale = pkgKey != null;
      /** Хариу ОДООГИЙН багцынх уу — төлөв/ref зөвхөн тэгвэл шинэчлэгдэнэ */
      const live = () => loadedPkgRef.current === q.pkg;
      /* ⚠️ АМЖИЛТГҮЙГ ИЛ ХЭЛНЭ (2026-09-06). Урьд нь `void saveRemoteDraft(...)`
         гэж үр дүнг ХАЯДАГ байсан тул сүлжээгүй, токен дууссан, хүснэгт
         олдоогүй — аль ч тохиолдолд дэлгэц дээр «ноорог хадгалагдав» гэж
         ХЭВЭЭР гарч, бөглөгч алсад хуулагдсан гэж итгээд өөр компьютер дээр
         хоосон хуудас хүлээж авдаг байв. Локал ноорог бүрэн бүтэн тул
         бөглөлтийг ЗОГСООХГҮЙ — зөвхөн байдлыг үнэн харуулна. */
      lastRemoteRef.current = Date.now();
      /*
       * ⚠️ БИЧИХЭЭСЭЭ ӨМНӨ АЛСААС УНШИЖ НИЙЛҮҮЛНЭ — READ-MERGE-WRITE
       * (2026-09-08, хэрэглэгч: «ноорог хуваалцахгүй байна»).
       *
       * ⚠️ ЯАГААД ЗААВАЛ: ноорог одоо БАГЦААР хуваалцагддаг тул энэ слотод
       * нөгөө оролцогчийн ажил байж болно. Урьд нь `q.draft` (ЗӨВХӨН энэ
       * хөтчийн локал төлөв) шууд бичигддэг байсан тул:
       *   · А 342 нүд бөглөж алсад бичив
       *   · Б 1 нүд бөглөхөд Б-гийн ноорог алсыг БҮХЭЛД НЬ дарж, А-гийн
       *     341 нүд УСТДАГ байв — яг тэр эвдрэл мэдээлэгдсэн.
       * Татах мөчлөг (3 сек) нь зөвхөн УНШИХ талыг нийлүүлдэг; бичих тал
       * нийлүүлэхгүй бол хоёр талын уралдаанд сүүлд бичсэн нь бүгдийг дарна.
       *
       * ⚠️ Уншилт УНАВАЛ бичихгүй, дараалалд буцаана: тэр үед алсын агуулга
       * үл мэдэгдэх тул бичих нь бусдын ажлыг устгах эрсдэлтэй. Локал ноорог
       * бүрэн бүтэн тул алдагдал үүсэхгүй — дараагийн тойрогт дахин оролдоно.
       *
       * ⚠️ Энэ нь МӨРГӨЛДӨӨНИЙГ бүрэн шийдэхгүй (уншилт ба бичилтийн хооронд
       * хэдэн зуун мс байна) — ArcGIS-д нөхцөлт бичилт байхгүй. Гэвч цонх нь
       * 3 секундээс хэдэн зуун мс болж багасна; үлдсэн уралдаанд ч зөвхөн
       * ТЭР агшинд бичигдсэн нүд л хожигдоно, бүтэн ноорог биш.
       */
      void (async () => {
        /*
         * ⚠️ ХЯМД ШАЛГАЛТААР УНШИЛТЫГ АЛГАСНА (2026-09-08, гүйцэтгэл).
         * Алсын `at` нь сүүлд нийлүүлсэн агшнаас ИХГҮЙ бол нөгөө тал энэ
         * хооронд юу ч бичээгүй — нийлүүлэх зүйл байхгүй тул 80KB-ийн
         * `payload` татах нь цэвэр дэмий. Ганц хүн бөглөж байхад (багцын
         * дийлэнх тохиолдол) уншилт БҮРМӨСӨН арилж, бичилт нь өмнөх
         * хувилбарын хурдтай ЯГ ТЭНЦҮҮ болно.
         */
        const at = await readRemoteDraftAt(q.pkg);
        /* ⚠️ 2026-10-06: `await`-ийн завсарт багц солигдсон бол (`!live()`) ХАЯХГҮЙ — дараалал аль хэдийн
           хоосон (`q` нь энд л үлдсэн) тул урьд нь `if (!live() && !allowStale) return` ноорогийг
           ЧИМЭЭГҮЙ алдагдуулдаг байв (FillNew-ийн солих эффект зөвхөн хоосон бус дараалал илгээнэ).
           Одоо ХУУЧИН багцад read-merge-write-ийг гүйцээнэ (`allowStale`-тэй ижил горим) — төлөв/ref
           зөвхөн `live()` үед шинэчлэгдэнэ, унавал `staleWarn`. */
        if (at === undefined) {
          /* Уншиж чадсангүй — бичихгүй: алсын агуулга үл мэдэгдэх тул бичих нь
             бусдын ажлыг устгах эрсдэлтэй. Локал бүрэн бүтэн. */
          /* ⚠️ 2026-10-04 (#5): өөр багц руу шилжсэн бол ЧИМЭЭГҮЙ хаяхгүй — тэмдэг үлдэнэ, анхааруулна */
          if (!live()) { staleWarn(q.pkg, tr('алсын ноорогийг шалгаж чадсангүй')); return; }
          setRemoteState({ kind: 'fail', why: tr('алсын ноорогийг шалгаж чадсангүй') });
          if (!remoteQueue.current) remoteQueue.current = q;
          setTimeout(() => setRemoteTick((n) => n + 1), REMOTE_RETRY_MS);
          return;
        }
        let remote: Draft | null = null;
        /* ⚠️ Багц солигдсон (`allowStale`) бол `lastMergedRef` шинэ багцынх —
           найдахгүй, алсынхыг ЗААВАЛ уншиж нийлүүлнэ.
           ⚠️ ТЭНЦҮҮ БИШ (`!==`), `>` БИШ (2026-09-25-ны аудит): алсын хувилбар
           нь бусад клиентийн цагаар бичигддэг тул БАГА болж ч болно (мөр дахин
           үүссэн, цаг хоцорсон бичигч) — тэр үед `>` уншилтыг алгасаж, бусдын
           нүдийг дарж бичдэг байв. Сүүлд ӨӨРӨӨ тусгасан хувилбараас ӨӨР л бол уншина. */
        /* ⚠️ 2026-10-06: завсарт солигдсон (`!live()`) бол ч `lastMergedRef` шинэ багцынх — заавал уншина */
        if (at !== null && (allowStale || !live() || at !== lastMergedRef.current)) {
          const rr = await readRemoteDraft(q.pkg);
          /* ⚠️ 2026-10-06: энд ч солигдсон бол хаяхгүй — дээрх ⚠️ */
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
        /* ⚠️ 2026-10-04 дахин аудит (#2, HIGH): ШАХАЛТ (`compactDraft`) — баримтаар дарагдсан `del`,
           хуучирсан/хуучин жаазны баримтыг хасна; эс бөгөөс том илгээлтийн дараах ноорог `REMOTE_MAX`-аас
           хэтэрч (`big`) алсад баримтгүй хуучин нүд үлдэж, өөр оролцогч ДАХИН илгээх байв. */
        const merged0 = compactDraft(mergeDrafts(remote, q.draft) ?? q.draft, { max: REMOTE_MAX, minOid: live() ? minOidRef.current : null });
        /* `body` — хувилбарын дугааргүй агуулга: дэмий бичилт таслахад (доор) */
        const body = JSON.stringify(merged0);
        /*
         * ⚠️ ХУВИЛБАР ҮРГЭЛЖ ӨСНӨ (2026-09-25-ны аудит): `t = max(одоо, алсын at + 1)`.
         *    Урьд нь `t = max(remote.t, local.t)` (клиентийн цаг) тул бусдын нүдийг
         *    нийлүүлсэн бичилт ИЖИЛ (цаг зөрвөл БАГА) хувилбартай гарч, нөгөө талын
         *    `at > lastMergedRef` шалгуур түүнийг ХЭЗЭЭ Ч татахгүй — дараагийн
         *    бичилт нь зөвхөн өөрийн агуулгаар дарж, нийлүүлсэн нүд алга болдог байв.
         */
        const outDraft: Draft = { ...merged0, t: Math.max(Date.now(), merged0.t, at != null ? at + 1 : 0) };
        const outBody = JSON.stringify(outDraft);
        /* ⚠️ 2026-10-06: солигдсон багцад ч чимээгүй биш — `staleWarn` */
        if (outBody.length > REMOTE_MAX) { if (live()) setRemoteState({ kind: 'big' }); else staleWarn(q.pkg, tr('ноорог хэт том')); return; }
        /*
         * ⚠️ ӨӨРЧЛӨГДӨӨГҮЙ БОЛ ОГТ БИЧИХГҮЙ (2026-09-08, гүйцэтгэл).
         * Хадгалах эффект нь `pending` ижил байхад ч дахин ажиллаж болно
         * (жиш. `rows` шинэчлэгдэх, нүд рүү орж гарах). Тэр үед агуулга нь
         * үсэг үсгээрээ ижил ноорог ArcGIS руу дахин бичигдэж, мөрийн `at`
         * шинэчлэгдэнэ — улмаар НӨГӨӨ ТАЛЫН хямд шалгалт «өөрчлөгдсөн» гэж
         * үзэж 80KB-ийг дэмий татна. Хоёр хүн ажиллаж байхад энэ нь хоорондоо
         * дэмий татах гинжин урвал үүсгэдэг. Агуулгаар нь тулгаж таслана.
         */
        if (live() && body === lastBodyRef.current) {
          setRemoteState({ kind: 'ok', at: Date.now() });
          clearUnsynced(q.pkg, q.draft.t);
          return;
        }
        /* ⚠️ Нийлсэн үр дүнг ЛОКАЛД ч буулгана — эс бөгөөс дараагийн бичилт
           дахин зөвхөн өөрийн хэсгээ агуулж, нөгөө талын ажил локалд
           хэзээ ч харагдахгүй. Дэлгэц нь татах мөчлөгөөр шинэчлэгдэнэ. */
        /* ⚠️ 2026-10-04 (#9): НИЙЛҮҮЛЖ бичнэ — уншилт/бичилтийн завсарт энэ табын (эсвэл өөр табын)
           бичсэн шинэ нүдийг локалаас ДАРЖ арчихгүй. */
        writeDraftLS(q.pkg, outDraft);
        /*
         * ⚠️ НӨГӨӨ ТАЛЫН НҮД ДЭЛГЭЦЭД БУУХ ЁСТОЙ (2026-09-21-ний аудит).
         *    Урьд нь энд `lastMergedRef = outDraft.t` гэж ҮРГЭЛЖ тавьдаг байв.
         *    Алсаас уншиж нийлүүлсэн (`remote != null`) тохиолдолд тэр нь
         *    татах мөчлөгийн `at > lastMergedRef` шалгуурыг хаадаг тул
         *    нийлүүлсэн нүднүүд ЛОКАЛ ба АЛСАД бичигдсэн ч `pending`/`byMap`-д
         *    ХЭЗЭЭ Ч буудаггүй: нөгөө талын нүд шарлахгүй, оролцогчид
         *    орохгүй, дараагийн `flush` тэднийг ЗӨВХӨН ӨӨРИЙН `pending`-ээс
         *    угсарсан ноорогоор дарж бичдэг байв. Одоо алсаас нийлүүлсэн бол
         *    тэмдэглэгээг ХӨДӨЛГӨХГҮЙ — дараагийн тойрог (3 сек) сая бичсэн
         *    нийлбэрийг татаж `pickDraft`-аар (курсорын хамгаалалттай)
         *    дэлгэцэд буулгана; зөвхөн ӨӨРИЙН бичилт бол урьдын адил
         *    алгасуулна (дэмий татахгүй).
         */
        if (live() && !remote && outDraft.t > lastMergedRef.current) lastMergedRef.current = outDraft.t;
        /* ⚠️ 2026-10-01: `expectAt` — уншсан `at`-аас хойш өөр хүн бичсэн бол ДАРЖ
           БИЧИХГҮЙ (`conflict`), дараалалд буцааж дахин read-merge-write хийнэ. Урьд нь
           уншилт ба бичилтийн завсарт бичигдсэн бусдын нүд дарагдах цонх үлддэг байв;
           `at` нь өсөх хувилбар (цагаас үл хамаарах тоолуур) тул цагийн зөрүүнд ч зөв. */
        await saveRemoteDraft(q.pkg, outDraft.t, outBody, { expectAt: at }).then((r) => {
        /* ⚠️ 2026-10-04 (#5): АМЖИЛТТАЙ бол «хуулагдаагүй» тэмдэг арилна (багц солигдсон ч) */
        if (r.ok) clearUnsynced(q.pkg, q.draft.t);
        /* Багц солигдсон бол хуучин хариугаар шинэ багцын төлөвийг бичихгүй.
           ⚠️ 2026-10-04 (#5): унасан/мөргөлдсөн бол ЧИМЭЭГҮЙ хаяхгүй — тэмдэг үлдэж, тэр багцыг
           дахин нээхэд илгээгдэнэ; одоо ил анхааруулна. */
        if (!live()) { if (!r.ok) staleWarn(q.pkg, r.error); return; }
        if (!r.ok && r.conflict) {
          if (!remoteQueue.current) remoteQueue.current = q;
          setTimeout(() => setRemoteTick((n) => n + 1), 300);
          return;
        }
        if (r.ok) {
          /* ⚠️ ЗӨВХӨН АМЖИЛТТАЙ бичилтийн дараа — унасан бичилтийг «бичигдсэн»
             гэж тэмдэглэвэл дараагийн оролдлого таслагдаж, ажил алсад
             ХЭЗЭЭ Ч очихгүй болно. */
          lastBodyRef.current = body;
          setRemoteState({ kind: 'ok', at: Date.now() });
          /* ⚠️ ХУУЧИН МӨРҮҮДИЙГ ЗӨВХӨН ЭНД устгана (2026-09-08): шинэ
             түлхүүрт бичилт АМЖИЛТТАЙ болсныг батлагдсаны дараа. Урьдчилж
             устгавал сүлжээ унахад хагас бөглөсөн ажил бүрмөсөн алдагдана.
             Устгалт өөрөө унавал дараагийн ачаалалт дахин шилжүүлж оролдоно —
             давхардал үүсэхгүй, учир нь `mergeDrafts` идемпотент. */
          if (legacyPendingRef.current === q.pkg) {
            legacyPendingRef.current = '';
            void clearLegacyDrafts(q.pkg);
          }
          return;
        }
        setRemoteState({ kind: 'fail', why: r.error });
        /* ⚠️ УНАСАН БОЛ ДАРААЛАЛД БУЦААНА (2026-09-08). Урьд нь унасан ноорог
           дарааллаас хасагдаж, ДАРААГИЙН засвар хүртэл дахин оролддоггүй байв:
           сүлжээ түр тасраад сэргэсэн ч хэрэглэгч дахин нүд бөглөх хүртэл
           алсад юу ч очихгүй. Одоо `REMOTE_RETRY_MS`-ийн дараа дахин оролдоно
           (дараагийн засвар түүнээс өмнө ирвэл шинэ ноорог түүнийг дарна —
           хамгийн сүүлийнх ялна, алдагдал үгүй). Багц солигдсон бол `flush`
           өөрөө хаяна. */
        if (!remoteQueue.current) remoteQueue.current = q;
        setTimeout(() => setRemoteTick((n) => n + 1), REMOTE_RETRY_MS);
        });
      })();
    };
    flushRef.current = flush;
    const t = setTimeout(flush, REMOTE_DEBOUNCE_MS);
    /* ⚠️ ДЭЭД ХҮЛЭЭЛТ (2026-09-06). Debounce нь засвар бүрд дахин эхэлдэг тул
       завсарлагаас богино зайтай тасралтгүй бөглөж байгаа хүний ажил алсад
       ХЭЗЭЭ Ч хуулагдахгүй байв. Одоо сүүлийн илгээлтээс `REMOTE_CAP_MS`
       өнгөрсөн бол завсарлагыг үл харгалзан илгээнэ. */
    const since = Date.now() - lastRemoteRef.current;
    const cap = since >= REMOTE_CAP_MS
      ? setTimeout(flush, 0)
      : setTimeout(flush, Math.max(0, REMOTE_CAP_MS - since));
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    /* ⚠️ `pagehide` нь iOS Safari ба bfcache-д `visibilitychange`-ээс ИЛҮҮ
       найдвартай — таб хаагдах цорын ганц дохио байх тохиолдол бий. */
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
   *
   * ⚠️ ЯАГААД: `Guitsetgel` доторх таб («Бөглөх» ↔ «Илгээсэн») ба Portal-ийн
   * харагдац (Гүйцэтгэл → Хуваарь) солиход энэ компонент БҮРМӨСӨН unmount
   * болдог. Дээрх эффектийн `visibilitychange`/`pagehide` нь зөвхөн хөтчийн
   * таб/цонх хаахад асдаг — unmount-д АСДАГГҮЙ. Тиймээс дараалалд байгаа
   * ноорог (сүүлийн завсарлагын ажил) АЛСАД ОЧИЛГҮЙ хаягдаж байв. Локалд
   * хэвээр тул нэг компьютер дээр анзаарагдахгүй; ХОЁР компьютер солиход л
   * «оффис дээр бөглөсөн сүүлийн хэдэн нүд гэртээ алга» гэж илэрнэ.
   *
   * ⚠️ ТУСДАА `[]` эффект — дээрхийн cleanup-д тавьж БОЛОХГҮЙ: тэр нь
   * `remoteTick` бүрд ажилладаг тул debounce эвдэрч, нүд бүрд ArcGIS руу
   * хүсэлт явна. Энэ эффектийн cleanup нь ЗӨВХӨН unmount-д л ажиллана.
   */
  useEffect(() => () => { flushRef.current(); }, []);

  /**
   * ── ХУВААЛЦСАН НООРОГ: 3 СЕК ТУТАМ ТАТАЖ НИЙЛҮҮЛНЭ (2026-09-08) ──
   *
   * ⚠️ ЯАГААД (хэрэглэгч: «нэг багц дээр 2 хүн зэрэг бөглөнө, өөрчлөлт 2 тал
   * тал зэрэг харагдаж sync хийгдэж явна»): ноорог одоо БАГЦААР
   * хуваалцагддаг тул нөгөө талын бөглөлт ЭНЭ мөчлөгөөр л ирнэ.
   *
   * ⚠️ «0 СЕК LIVE» БОЛОМЖГҮЙ — баримтжуулав. Портал нь статик экспорт
   * (`output: 'export'`) тул өөрийн сервер БАЙХГҮЙ → WebSocket/SSE байхгүй.
   * ArcGIS REST нь өөрөө мэдэгддэггүй, зөвхөн асуувал хариулна. Тиймээс
   * «live» = БАЙНГА АСУУХ. `REMOTE_DEBOUNCE_MS`-тэй ижил 3 секунд авсан:
   * бичих 3 сек + унших 3 сек тул өөрчлөлт хамгийн муудаа ~6 секундэд
   * нөгөө талд гарна. Хүн гараар бичихэд тэр хэмжээ мэдэгдэхгүй.
   *
   * ⚠️ БИЧИЖ БАЙХАД ДЭЛГЭЦ ҮСРЭХГҮЙ: `edit` (нээлттэй нүд) байхад мөчлөг
   * АЛГАСНА. Эс бөгөөс гараас бичиж байхад тоо нь өөрчлөгдөж, курсор үсэрч,
   * хагас бичсэн утга алдагдана. Гараа авмагц дараагийн тойрогт нийлнэ.
   *
   * ⚠️ ХАРАГДАХГҮЙ ТАБ дээр АЖИЛЛАХГҮЙ — арын 10 таб ArcGIS руу секунд тутам
   * хүсэлт явуулах ёсгүй.
   *
   * ⚠️ ЗӨВХӨН НЭМНЭ, ХАСАХГҮЙ: `mergeDrafts` нь нүд тус бүрээр нийлүүлдэг тул
   * нөгөө талд байхгүй нүд ХЭВЭЭР үлдэнэ. Тиймээс энэ мөчлөг хэзээ ч
   * бөглөсөн ажлыг устгахгүй — зөвхөн нэмнэ, эсвэл шинэ утгаар дарна.
   */
  useEffect(() => {
    /* ⚠️ `!canPerf` — сэргээх эффектийн ⚠️ (2026-09-25): эрхгүй хүнд ноорог буухгүй
       тул татах шаардлагагүй; `pickDraft` ч эрхгүй үед юу ч хийхгүй. */
    if (busy || noEdit || !canPerf || !sc || !rows.length) return;
    if (loadedPkgRef.current !== pkg.key) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      /* Нүд засаж байх, таб харагдахгүй, эсвэл алсад бичих ажил дараалалд
         байвал алгасна — дараагийн тойрогт барина. */
      if (!alive) return;
      /*
       * ⚠️ АЛГАСАХ НӨХЦӨЛ ХЭТЭРХИЙ ӨРГӨН БАЙВ (2026-09-08, хэрэглэгч: «2 талд
       * 2 өөр нүд бөглөсөн ч хоёулаа илгээх»).
       *
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
       *
       * ⚠️ `remoteQueue.current` (бичих ажил дараалалд) ба нуугдсан таб нь
       * хэвээр алгасна — эхнийх нь өөрийн бичилттэй уралдахаас, хоёр дахь нь
       * арын табуудын дэмий ачаалалаас хамгаална.
       */
      if (document.visibilityState === 'hidden' || remoteQueue.current) {
        timer = setTimeout(() => void tick(), REMOTE_DEBOUNCE_MS);
        return;
      }
      /*
       * ⚠️ ХЯМД ШАЛГАЛТ ЭХЛЭЭД (2026-09-08, гүйцэтгэл): зөвхөн `at` (~200 байт)
       * татаж, өөрчлөгдөөгүй бол ЭНДЭЭ ЗОГСОНО. Ихэнх тойрогт нөгөө тал юу ч
       * бичээгүй байдаг тул урьд нь 80KB-ийн `payload` дэмий татагдаж, задарч,
       * нийлүүлэгдэж байв. Одоо бүтэн ачаа зөвхөн БОДИТ өөрчлөлтөд татагдана —
       * сүлжээний ачаалал ~400 дахин, задлалт ~100% буурна.
       */
      const at = await readRemoteDraftAt(pkg.key);
      if (!alive) return;
      /* `undefined` = уншиж чадсангүй · `null` = мөр алга · тоо = агшин.
         Хоёуланд нь татах зүйлгүй; дараагийн тойрогт дахин үзнэ. */
      /* ⚠️ ТЭНЦҮҮ БИШ бол татна (2026-09-25-ны аудит — `flush`-ийн ⚠️): алсын
         хувилбар БУУРСАН (мөр дахин үүссэн / цаг хоцорсон бичигч) бол харьцуулах
         цэгийг тэглэнэ — эс бөгөөс доорх `remote.t > lastMergedRef` түүнийг
         мөнхөд «хуучин» гэж алгасна. */
      if (typeof at === 'number' && at !== lastMergedRef.current) {
        if (at < lastMergedRef.current) lastMergedRef.current = 0;
        const rr = await readRemoteDraft(pkg.key);
        if (!alive) return;
        if (rr.ok && rr.draft) {
          const remote = parseDraft(rr.draft.payload, 'remote');
          /* ⚠️ ЗӨВХӨН ШИНЭ БОЛ: ижил агшинтай ноорог нь ӨӨРИЙН сая бичсэн
             хуулбар — дахин суулгавал бичиж байгаа нүд дэмий дахин зурагдана. */
          if (remote && remote.t > lastMergedRef.current) {
            /*
             * ⚠️ НҮД НЭЭЛТТЭЙ БАЙХАД ДЭЛГЭЦЭД БУУЛГАХГҮЙ (2026-09-08).
             * `pickDraft` нь `setPending`-ийг БҮХЭЛД НЬ орлуулдаг тул бичиж
             * байгаа нүдний утга дэмий дахин зурагдаж, курсор үсэрнэ. Уншилт
             * нь аль хэдийн ХИЙГДСЭН (тэр нь хямд) — зөвхөн буулгалтыг
             * хойшлуулна. `lastMergedRef`-ийг ч ХӨДӨЛГӨХГҮЙ: дараагийн
             * тойрогт (гараа авмагц) ЯГ энэ агшин дахин таарч буух ёстой.
             */
            if (editRef.current) {
              /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): эзэмшил · «дуусгасан» ·
                 tombstone-ийг ОДОО буулгана (`sharedOnly`) — «Илгээх»-ийн түгжээ нүд
                 нээлттэй байхад ч цаг тухайд нь шинэчлэгдэнэ; нүдний утга нүд
                 хаагдмагц (`deferredRef` эффект) буулгагдана. Урьд нь бүгдийг алгасдаг
                 тул нүдэнд удаан суусан хүнд нөгөөгийн «Дуусгасан» ирдэггүй байв.
                 ⚠️ `lastMergedRef`-ийг ХӨДӨЛГӨХГҮЙ: нүдний утга `pending`-д хараахан ороогүй
                 тул `flush` «нийлүүлсэн» гэж үзэж алсыг уншилгүй дарж бичвэл бусдын нүд
                 устана. Тойрог бүр дахин татаж (хямд) хамтын төлөвийг шинэчилнэ. */
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
            /* ⚠️ 2026-10-09: `poll` — «Ноорог сэргээв» давтагдахгүй, шинэ баримт → `onReceipts` */
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
   * ⚠️ Дараагийн 3 секундын тойргийг хүлээхгүй — `lastMergedRef` аль хэдийн урагшилсан
   *    тул тэр тойрог дахин татахгүй. Локалыг ДАХИН уншиж (хадгалах эффект сая хаасан
   *    нүдийг бичсэн) нүд бүрийн агшнаар нийлүүлнэ — сая бичсэн утга дарагдахгүй.
   */
  useEffect(() => {
    if (editOpen) return;
    const q = deferredRef.current;
    if (!q) return;
    deferredRef.current = null;
    if (q.pkg !== pkg.key || loadedPkgRef.current !== pkg.key) return;
    const merged = mergeDrafts(readDraft(pkg.key), q.d);
    if (!merged) return;
    /* ⚠️ 2026-10-09: татах мөчлөгийн хойшлуулсан нийлүүлэлт — `poll` (дээрх тойргийн ⚠️) */
    pickDraftRef.current(merged, 'remote', { poll: true });
    /* Одоо `pending`-д буусан — татах мөчлөгийн ердийн замтай ижил тэмдэглэнэ */
    if (q.d.t > lastMergedRef.current) lastMergedRef.current = q.d.t;
  }, [editOpen, pkg.key, loadedPkgRef]);

  /**
   * «НООРОГ СЭРГЭЭЖ БАЙНА…» — нүд ТҮГЖИГДЭНЭ (2026-10-01, хэрэглэгч: бүгдийг зас).
   * ⚠️ Сэргээлт (`readRemoteDraft` г.м.) дуустал бичсэн нүд нь сэргээгдсэн ноорогтой
   *    уралддаг байв; одоо тэр хугацаанд нүд нээгдэхгүй, буулгалт хаалттай.
   */
  const restoringUi = !noEdit && canPerf && !busy && rows.length > 0 && !!sc && restDonePkg !== pkg.key;

  /**
   * ТАБ ХААХ / REFRESH — ноорог ХАДГАЛАГДАЖ АМЖААГҮЙ үед хөтөч зогсооно.
   *
   * ⚠️ 2026-09-08 (хэрэглэгч: «локал болон ArcGIS дээр ноорог хадгалагдаж
   * амжаагүй үед browser хаах, refresh хийх боломжгүй болго»). Урьд нь
   * `unsavedCount` (илгээгээгүй нүд) дээр асдаг байв — тэр нь «ноорог
   * хадгалагдсан ч ХЯНАЛТАД илгээгээгүй» бүх үед анхааруулж, хэрэглэгч
   * ноорогт итгэхээ больдог байв. Одоо нөхцөл нь ХАДГАЛАЛТЫН төлөв:
   *   · `remoteQueue` дүүрэн — ArcGIS руу хараахан ЯВААГҮЙ (3 сек дотор)
   *   · сүүлийн ArcGIS бичилт УНАСАН — алсад хуучин хувилбар
   *   · `pvPend` — обьёмын ноорог ноорогт ОГТ орддоггүй
   * Локал (`localStorage`) нь засвар бүрд синхрон бичигддэг тул «амжаагүй»
   * байх агшин байхгүй.
   *
   * ⚠️ ХӨТЧИЙН ХЯЗГААР: `beforeunload` нь ЗӨВХӨН стандарт «Хуудаснаас гарах
   * уу?» цонх харуулна — хаахыг бүрэн хориглох, мессежийг өөрчлөх боломжгүй
   * (бүх хөтөч 2011-ээс). Хэрэглэгч «Үлдэх» дарвал хуудас хаагдахгүй.
   *
   * ⚠️ ЦОНХ ГАРАХААС ӨМНӨ ШУУД ИЛГЭЭНЭ: `beforeunload` нь `pagehide`-аас
   * ӨМНӨ ирдэг тул энд `flush` дуудвал хэрэглэгч цонхыг уншиж байх зуур
   * (хамгийн багадаа 1–2 сек) ArcGIS хүсэлт явж амжина. «Гарах» дарсан ч
   * ихэнхдээ хуулагдсан байна; «Үлдэх» дарвал бүрэн баталгаатай.
   *
   * ⚠️ `remoteQueue` нь ref — өөрчлөгдөхөд render болдоггүй тул `remoteTick`
   * ба `remoteState`-ээс хамааруулж эффектийг дахин уншуулна.
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
   * ИЛГЭЭЛТИЙН БАРИМТЫГ АЛСЫН НООРОГТ ШУУД БИЧИЖ, ХҮЛЭЭНЭ (⚠️ 2026-10-05) — `FillNew.publish`
   * «Илгээх» амжилттай болмогц, `busy` хэвээр байхад дуудна.
   *
   * ⚠️ ЯАГААД: баримт (`rcptRef`/`delRef`) урьд нь ЗӨВХӨН хадгалах эффект → 3 сек-ийн `flush`-аар
   *    алсад очдог байв. Тэр бичилт хэзээ ч буугаагүй бол (таб хаагдсан · сүлжээ тасарсан) өөр
   *    төхөөрөмж илгээсэн нүдийг «илгээгээгүй» гэж үзэж ДАХИН илгээнэ — нэмэлтийн горимд ХОЁР
   *    ДАХИН нэмэгдэнэ. Одоо илгээлт хадгалагдсаны дараа шууд read-merge-write хийж хүлээнэ.
   * ⚠️ `flush`-тай ИЖИЛ дүрэм: алсаас уншиж нийлүүлнэ (бусдын нүдийг дарахгүй), шахна
   *    (`compactDraft`), `expectAt`-тай бичнэ; мөргөлдвөл дахин уншина (3 хүртэл). Унавал
   *    шалтгааныг буцаана — дуудагч ИЛ анхааруулна; ердийн `flush` (дараалал) цааш дахин оролдоно.
   * ⚠️ Төлөв/ref (`lastMergedRef` · `lastBodyRef`) ХӨНДӨХГҮЙ — хадгалах эффектийн ердийн tombstone
   *    бичилт ба татах мөчлөг урьдын адил ажиллана (нийлүүлэлт идемпотент).
   */
  const pushReceipts = useCallback(async (want: string): Promise<{ ok: true } | { ok: false; why: string }> => {
    const nowMs = stamp();
    const liveDel: [string, number][] = [...delRef.current].filter(([, a]) => nowMs - a <= DEL_TTL_MS);
    const liveRc = [...rcptRef.current.values()].filter((r) => rcptAlive(r, nowMs, minOidRef.current));
    if (!liveDel.length && !liveRc.length) return { ok: true };
    const tomb: Draft = {
      t: nowMs, mode: 'inc', cells: [], dates: [], rowKeys: [],
      done: doneRef.current, marks: [...marksRef.current.values()], del: liveDel,
      rcpt: liveRc.length ? packRcpt(liveRc) : undefined,
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
          { max: REMOTE_MAX, minOid: pkgKeyRef.current === want ? minOidRef.current : null });
        const out: Draft = { ...merged0, t: Math.max(Date.now(), merged0.t, at0 != null ? at0 + 1 : 0) };
        const body = JSON.stringify(out);
        if (body.length > REMOTE_MAX) return { ok: false, why: tr('ноорог хэт том') };
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
   * «ИЛГЭЭХ»-ИЙН ӨМНӨ ХУВААЛЦСАН НООРОГИЙГ ДАХИН УНШИНА (⚠️ 2026-10-09) — `FillNew.publish`-ийн эхэнд.
   * ⚠️ ЯАГААД: `publish` нь алсын ноорогийг огт уншдаггүй байв. Татах мөчлөг нуугдсан табд/өөрийн бичилт
   *    дараалалд байхад АЛГАСДАГ тул хуучирсан таб (А аль хэдийн илгээсэн нүд · Б-гийн хожуу засвар ·
   *    «Дахин засах») мэдэлгүй дахин илгээж болзошгүй. Одоо алсын хувилбар (`at`) сүүлд тусгаснаас
   *    (`lastMergedRef`) ӨӨР бол нийлүүлж (`pickDraft`, `poll` — шинэ баримт → `onReceipts`) дэлгэцийг
   *    шинэчилнэ; ЯМАР НЭГ зүйл өөрчлөгдсөн бол `'changed'` — дуудагч ЗОГСООЖ хэрэглэгчээр шалгуулна.
   * ⚠️ Уншиж ЧАДААГҮЙ бол `'fail'` — дуудагч ердийн замаар үргэлжилнэ (илгээлтийн CAS — `act.at > staged.at`,
   *    `expectAt` — хамгаалсаар); сүлжээний түр алдаа «Илгээх»-ийг мөнхөд хаахгүй.
   * ⚠️ `lastMergedRef`-ийг татах мөчлөгтэй ИЖИЛ дүрмээр урагшлуулна (`remote.t > …`).
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
  /**
   * ⚠️ 2026-10-09 (аудит №3): ЗОРИЛТ СОЛИГДОХОД (буцаагдсан илгээлтийг сонгох `resumeReturned` · засвар дуусах) ЛОКАЛ
   *    ноорогийг ДАХИН буулгана — `pickDraft`-ийн `offTgt` шүүлт ШУУД үйлчилнэ (татах мөчлөгийг хүлээвэл тэр завсарт
   *    өөр ажлын нүд `pending`-д үлдэж «Илгээх» тэдгээрийг засвартай хамт илгээх байв). Локал нь хадгалах эффектээр
   *    `pending` + тэмдэглэсэн нүдийг агуулдаг (нийлүүлж бичдэг) тул бүрэн. Сэргээлт дуусах хүртэл зөвхөн тэмдэглэнэ —
   *    сэргээлт өөрөө одоогийн зорилтоор (`curTgtRef`) буулгадаг.
   */
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
  /**
   * ⚠️ 2026-10-09 (аудит №3): «Илгээх»-ийн шалгалт — буцаагдсан илгээлтийн засвар (`curTgt`) үед ЭЗНИЙ зорилт таарахгүй
   *    `pending`/`pendDate`-ийн түлхүүрүүд (`pickDraft.offTgt`-тэй ИЖИЛ дүрэм). Хоосон = бүгд энэ засварынх.
   */
  const offTgtKeys = useCallback((keys: readonly string[]): string[] => {
    const t = curTgtRef.current?.[0] ?? 0;
    if (!t) return [];
    return keys.filter((k) => offTarget(t, mineRef.current.has(k) ? meKey : byMapRef.current.get(k), meKey, tgtsRef.current));
  }, [meKey]);
  /**
   * ⚠️ 2026-10-09 (аудит №3, HIGH): ХАДГАЛСАН НООРОГ дахь ӨӨРИЙН нүд/огноо (локал + алс) — өөрийн зорилт `soid`-оос
   *    ӨӨР бол (өнөөдрийн эсвэл өөр өдрийн ажил). `resumeReturned` үүгээр шалгана: хориг идэвхтэй үед сэргээлт
   *    явдаггүй тул санах ойн `pending` хоосон ч ноорогт ажил байж болно. Албадан тэмдэгтэй (сэргэхгүй) нүд
   *    тооцогдохгүй. `null` = уншиж чадсангүй (тодорхойгүй — дуудагч зогсоно).
   */
  const storedMine = useCallback(async (want: string, soid: number): Promise<string[] | null> => {
    if (!meKey) return [];
    const rr = await readRemoteDraft(want);
    if (!rr.ok) return null;
    const remote = rr.draft ? parseDraft(rr.draft.payload, 'remote') : null;
    const d = mergeDrafts(readDraft(want), remote);
    if (!d) return [];
    /* логик цагийг урагшлуулна — дараагийн `dropMine`-ийн tombstone эдгээр хуулбараас ХОЖУУ байна (`stamp`-ийн ⚠️) */
    seeClock(d);
    let e: [string, number, number, number] | undefined = tgtsRef.current.get(meKey);
    for (const x of d.tgt ?? []) if (x[0] === meKey && (!e || x[3] > e[3])) e = x;
    if (e && e[1] === soid) return [];
    const by = new Map<string, string>();
    for (const [k, u] of d.by ?? []) by.set(k, String(u).trim().toLowerCase());
    const forced = new Set((d.hold ?? []).filter((h) => h[2] === 1).map((h) => h[0]));
    return [...d.cells, ...(d.dates ?? [])].map(([k]) => k).filter((k) => by.get(k) === meKey && !forced.has(k));
  }, [meKey, seeClock]);
  /**
   * ⚠️ 2026-10-09 (аудит №3): ӨӨРИЙН заасан нүд/огноог ноорогоос хаяна (tombstone — локал + алс, бусдынх ХӨНДӨГДӨХГҮЙ) ба
   *    өөрийн зорилтыг цэвэрлэнэ. `resumeReturned` — хэрэглэгч ИЛ зөвшөөрсний дараа (өөр ажлын нүд буцаагдсан илгээлтийн
   *    засвартай холилдохгүй). Хориг идэвхтэй (сэргээлт яваагүй) үед ч ажиллана — хадгалах эффектийг хүлээхгүй, шууд бичнэ.
   */
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
    /* ⚠️ 2026-10-09 (аудит №3): буцаагдсан илгээлтийн засварын зорилтын шалгалт */
    offTgtKeys, storedMine, dropMine,
    /* ⚠️ 2026-10-09: «Илгээх»-ийн өмнөх алсын шалгалт (`pullNow`-ийн ⚠️) */
    pullNow,
    /* ⚠️ 2026-10-05: илгээлтийн баримтыг шууд бичих (`pushReceipts`-ийн ⚠️) */
    pushReceipts,
    savedAt, keepDraft, remoteQueue, mineRef, mineAtRef, delRef, asOfRevRef, asOfAtRef, draftLiveRef, touchMine, revert,
    lastMergedRef, doneRef, doneBy, setDoneBy, byMap, setByMap, byAtMap, setByAtMap, byAtRef, lastBodyRef,
    remoteState, setRemoteState, promptedPkgRef, flushRef,
    meKey, participants, waitingOn, byCount, iAmDone, canSubmitNow, toggleDone, dropDraft,
    /* 2026-10-06 аудит — түгжиж буй хүний сүүлийн идэвх */
    waitingLast,
    /* 2026-10-01 */
    undoAllMarks, resetMarks, stamp, restoringUi, offline,
    /* 2026-10-04 аудит — баримт · суурь · зорилт · локал алдаа */
    rcptRef, btRef, datesBRef, asOfBRef, draftTgt, setDraftTgt, localFail,
    /* 2026-10-04 дахин аудит — тэмдэглэсэн нүд (#7) · хүн бүрийн зорилт (#4) */
    heldN, dropHeld, resetHeldTgt, clearMyTgt,
    /* 2026-10-09 аудит №6 — серверийн илгээлтийн баримт + харсан агшин */
    noteSubReceipts,
  };
}
/** ⚠️ 2026-10-01: FillNew-ийн ачаалах эффектийн толь (`draftSyncRef`) — тэр эффект энэ hook-оос ДЭЭР */
export type DraftSync = ReturnType<typeof useDraftSync>;
