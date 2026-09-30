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
  parseDraft, mergeDrafts, readDraft, saveDraftLS, clearDraftLS,
} from "./draft";
import { dt, type NoticeKind, type RemoteState } from "./util";

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
  show: (kind: NoticeKind, msg: string) => void;
  say: (msg: string) => void;
}) {
  const {
    pkg, user, busy, rows, sc, nBld, canPerf, noEdit, asOf, asOfOrig, setAsOf,
    pending, setPending, pendDate, setPendDate, dirtyCount, pvDirty, fillMode, loadedPkgRef, pkgKeyRef, editRef, show, say,
  } = p;
  /* ⚠️ 2026-09-30: `useCellEdit`-ийн `volMode`-той ИЖИЛ дүрэм (тэр hook энэ hook-ийн ДАРАА дуудагддаг
     тул сэргээлтэд (`pickDraft`) эндээ давтав — хаалтын зан төлөв урьдын адил). */
  const volMode = (r: { group: boolean }, b: number) =>
    !r.group && (fillMode === "pct" || !!sc?.obyem[b]);
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
    mineAtRef.current.set(key, Date.now());
    delRef.current.delete(key);
  }, []);
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
      delRef.current.set(key, Date.now());
    } else {
      mineAtRef.current.set(key, Date.now());
    }
  }, []);
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
  /**
   * `flush`-ийн СҮҮЛИЙН хувилбарыг ref-д — unmount-ийн эффект (`[]` хамаарал)
   * түүнийг дуудна. Доорх эффект `remoteTick` бүрд `flush`-ыг дахин үүсгэдэг
   * тул unmount-ийн эффект тэр хаалтыг шууд барьж чадахгүй.
   */
  const flushRef = useRef<(pkgKey?: string) => void>(() => {});

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
    if (!meKey) return;
    /* ⚠️ БАГЦЫН ХАМГААЛАЛТ (2026-09-25-ны аудит): доорх хоёр `await`-ийн завсарт
       багц солигдвол А-гийн нийлүүлсэн `done` жагсаалт Б-гийн `doneRef`/`doneBy`-д
       бууж, Б-гийн «Илгээх» түгжээ худал түгжигдэх/нээгдэх байв. Бичилт нь
       ТҮЛХҮҮРЭЭРЭЭ (`want`) А руу хэвээр явна — зөвхөн ТӨЛӨВТ буулгахгүй. */
    const want = pkg.key;
    const next: [string, number][] = iAmDone
      ? doneRef.current.filter(([u]) => u !== meKey)
      : [...doneRef.current.filter(([u]) => u !== meKey), [meKey, Date.now()]];
    doneRef.current = next;
    setDoneBy(next);
    /* Одоогийн ноорогийг уншиж, зөвхөн `done`-ыг сольж буцааж бичнэ —
       нүдний утгыг ЭНД хөндөхгүй (хадгалах эффект түүнийг хариуцна). */
    /* ⚠️ ХООСОН МАССИВЫГ ЗААВАЛ БИЧНЭ (`undefined` болгож хаяхгүй): `[]` нь
       «буцаасан» гэсэн ИЛ мэдэгдэл, `undefined` нь «хуучин ноорог, юу ч
       хэлэхгүй». Ялгахгүй бол `mergeDrafts` буцаалтыг үл тоож, тэмдэглэгээ
       дараагийн нийлүүлэлтээр СЭРГЭНЭ (`mergeDrafts`-ийн тайлбар). */
    const cur = readDraft(want);
    const d: Draft = cur
      ? { ...cur, t: Date.now(), done: next }
      : { t: Date.now(), mode: 'inc', cells: [], done: next };
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
    const merged = rr.ok
      ? (mergeDrafts(rr.draft ? parseDraft(rr.draft.payload, 'remote') : null, dNew) ?? dNew)
      : null;
    if (merged) {
      saveDraftLS(want, merged);
      /* ⚠️ Багц солигдсон бол ТӨЛӨВТ буулгахгүй (дээрх ⚠️) */
      if (pkgKeyRef.current === want) { doneRef.current = merged.done ?? []; setDoneBy(merged.done ?? []); }
    }
    const r = merged
      ? await saveRemoteDraft(want, merged.t, JSON.stringify(merged))
      : { ok: false as const, error: rr.ok ? '' : rr.error };
    if (!r.ok) {
      show('warn', tr('«{0}» тэмдэглэгээ ArcGIS-т хадгалагдсангүй ({1}) — бусад хүн харахгүй байж магадгүй.',
        iAmDone ? tr('Дахин засах') : tr('Дуусгасан'), r.error));
    }
  }, [meKey, iAmDone, pkg.key, show, pkgKeyRef]);

  /**
   * Сонгосон ноорогийг ШҮҮЖ, сэргээх цонхонд бэлдэнэ.
   * ⚠️ Энэ нь дэлгэц зурахаас өмнө БҮХ шалгуурыг өнгөрүүлнэ — цонхонд
   *    харагдах тоо ба бодитоор буух өгөгдөл хоёр өөр зам явж болохгүй.
   */
  const pickDraft = useCallback((d: Draft, source: 'local' | 'remote' | 'both') => {
    /* ⚠️ ЭРХГҮЙ бол ЮУ Ч ХӨНДӨХГҮЙ (2026-09-25-ны аудит, HIGH) — сэргээх
       эффектийн `canPerf` ⚠️. Урьд нь доорх `canPerf ? … : []` нь бүх нүдийг
       алгасаад «хоосон ноорог» гэж дүгнэж хуваалцсан ноорогийг УСТГАДАГ байв. */
    if (!sc || !canPerf) return;
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
    const oidFix = new Map<number, number>();
    if (d.rowKeys?.length) {
      const free = new Map<string, number[]>();
      for (const r of rows) {
        const k = `${r.no} ¦ ${r.work}`;
        const l = free.get(k);
        if (l) l.push(r.oid); else free.set(k, [r.oid]);
      }
      for (const [oldOid, label] of d.rowKeys) {
        if (byOid.has(oldOid)) continue;      // мөр байрандаа — зөөх шаардлагагүй
        const cand = free.get(label);
        if (cand?.length) oidFix.set(oldOid, cand.shift() as number);
      }
    }
    /** Түлхүүрийн ObjectID-г шинэ агшин руу зөөнө (шаардлагагүй бол хэвээр) */
    const fixKey = (key: string): string => {
      if (!oidFix.size) return key;
      const at = key.indexOf(":");
      const to = oidFix.get(Number(key.slice(0, at)));
      return to == null ? key : `${to}${key.slice(at)}`;
    };

    const next: Record<string, string> = {};
    let dropped = 0;
    /** Хадгалагдсантайгаа ИЖИЛ тул сэргээгээгүй нүд/огноо (хуучирсан БИШ) */
    let sameN = 0;
    // ⚠️ Гүйцэтгэлийн нүдийг зөвхөн бөглөх эрхтэй хүнд сэргээнэ (`canPerf`)
    for (const [key0, v] of (canPerf ? d.cells : [])) {
      const key = fixKey(key0);
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
      if (r && Number.isInteger(b) && b >= 0 && b < nBld && !r.group) {
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
        continue;
      }
      /* ⚠️ ТЭГ НЭМЭЛТ = өөрчлөлтгүй (хуучин «хадгалагдсантай ижил») — сэргээхгүй,
         `dropped`-д ТООЛОГДОХГҮЙ. Илгээгдсэн нүд буцаж ирэхээс хамгаалах гол
         зам нь одоо `del` (tombstone, `mergeDrafts`): нэмэлтийн утга тэнцүү
         байх нь «аль хэдийн илгээгдсэн» гэсэн баримт БИШ. */
      if (incV === "") { sameN++; continue; }
      next[key] = incV;
    }

    /* ── ОГНОО (`${oid}:${блок}:s|e`) ──
       ⚠️ Талбаргүй блок бий (эх хуудасны толгой эвдэрсэн) — тэнд бичих газар
       байхгүй тул сэргээх нь утгагүй. */
    const nextDates: Record<string, string> = {};
    for (const [key0, v] of (canPerf ? (d.dates ?? []) : [])) {
      const key = fixKey(key0);
      const [oidS, bS, k] = key.split(":");
      const b = Number(bS);
      const r2 = byOid.get(Number(oidS));
      const fld = k === "s" ? sc.start[b] : k === "e" ? sc.end[b] : null;
      if (!r2 || !Number.isInteger(b) || b < 0 || b >= nBld || !fld) { dropped++; continue; }
      /* ⚠️ Хадгалагдсантай ИЖИЛ огноо сэргээхгүй — дээрх нүдний ⚠️, `commitDate`-ийн `sameDate` */
      if (v === dt(k === "s" ? r2.start[b] : r2.end[b])) { sameN++; continue; }
      nextDates[key] = v;
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
    if (meNow) {
      /* ⚠️ `mineRef`-ийн түлхүүрүүд ч ObjectID зөөлтөд ДАГАНА (`fixKey`) —
         архивын шинэ жааз үүсэхэд хуучин oid-тай үлдвэл `byOid`-д таарахгүй
         болж эзэмшил тасарна. Зөөсөн хувилбарыг `mineRef`-д БУЦААЖ бичнэ. */
      const moved = new Set<string>();
      for (const k0 of mineRef.current) {
        const k = fixKey(k0);
        const oid = Number(k.slice(0, k.indexOf(":")));
        if (byOid.has(oid)) {
          nextBy.set(k, meNow);
          moved.add(k);
        }
      }
      mineRef.current = moved;
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
    const nextDone = (d.done ?? []).filter(
      (x): x is [string, number] => Array.isArray(x) && typeof x[0] === 'string' && Number.isFinite(x[1]),
    ).map(([u, at]): [string, number] => [u.trim().toLowerCase(), at]);
    doneRef.current = nextDone;
    setDoneBy(nextDone);

    /* ── ШИНЭЧЛЭГДСЭН ОГНОО — зөвхөн ачаалсан утгаас ӨӨР бол ── */
    const draftAsOf = d.asOf != null && d.asOf !== asOfOrig ? d.asOf : null;
    /* ⚠️ `null` = ИЛ БУЦААЛТ (2026-09-25-ны аудит, `asOfRevRef`-ийн ⚠️): өөр
       оролцогч/төхөөрөмж огноог анхны утгандаа буцаасан — энд үлдсэн X-ийг
       анхных руу буцаана, эс бөгөөс дараагийн хадгалалт X-ийг алсад сэргээнэ. */
    if (d.asOf === null) setAsOf(asOfOrig);

    const nCells = Object.keys(next).length;
    const nDates = Object.keys(nextDates).length;
    const total = nCells + nDates + (draftAsOf != null ? 1 : 0);
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
      setPending({});
      setPendDate({});
      keepDraft.current = false;
      if (!dropped) {
        /* ⚠️ TOMBSTONE БАЙВАЛ алсыг ЦЭВЭРЛЭХГҮЙ (2026-09-21, дахин аудит):
           устгавал буцаалтын баримт алга болж, хожуу ирэх хуучин хуулбар
           (өөр төхөөрөмжийн 3 хоногийн локал) нүдийг сэргээнэ. `delRef`-д
           дээр нийлүүлсэн тул хадгалах эффект хоосон нүд + del-тэй ноорог бичнэ. */
        if (delRef.current.size) return;
        /* ⚠️ ЗӨВХӨН ноорог ҮНЭХЭЭР хоосон бол ЭНД устгана (2026-09-25-ны аудит):
           хадгалагдсантай ижил (`sameN`) нүд байвал ноорог хоосон биш — шийдвэрийг
           хадгалах эффектийн ердийн «хоосон төлөв» замд үлдээнэ. */
        if (sameN || d.cells.length || (d.dates ?? []).length) return;
        clearDraftLS(pkg.key);
        void clearRemoteDraft(pkg.key);
        return;
      }
      /* ⚠️ ХУУЧИРСАН НҮДТЭЙ НООРОГИЙГ АВТОМАТААР УСТГАХГҮЙ (2026-09-25-ны аудит):
         `pending` хоосон болсноор хадгалах эффектийн «хоосон → устга» зам
         ноорогийг (локал + ArcGIS, бусдын нүдтэй нь) ЧИМЭЭГҮЙ арчдаг байв —
         дээрх «ЧИМЭЭГҮЙ УСТГАХГҮЙ» ⚠️-ийн шууд зөрчил. `keepDraft` нь тэр замыг
         хаана; хэрэглэгч «Ноорог устгах» эсвэл шинэ засвараар шийднэ. */
      keepDraft.current = true;
      /* ⚠️ Сэргээх зүйл алга АТЛАА хуучирсан нүд байна — ЧИМЭЭГҮЙ өнгөрөхгүй,
         харин цонх нээхгүй (2026-09-06): зөвхөн мэдэгдэнэ. */
      say(tr('Ноорогийн {0} нүд хуучирсан тул сэргээгдсэнгүй (агшин солигдсон).', dropped));
      return;
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
    setPending(next);
    setPendDate(nextDates);
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
    say(dropped
      ? tr('Ноорог сэргээв ({0}): {1}. {2} нүд хуучирсан тул орхигдов.', from, parts.join(' · '), dropped)
      : tr('Ноорог сэргээв ({0}): {1}. Ногоон нүд = илгээгээгүй.', from, parts.join(' · ')));
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
    /* ⚠️ Хадгалах эффектийн «хоосон → устга» замыг сэргээлт дуустал хаана —
       `restoring`-ийн тайлбарыг үз. */
    restoring.current = true;
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
        restoring.current = false;
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
        restoring.current = false;
        if (promptedPkgRef.current === pkg.key) { promptedPkgRef.current = ''; setRemoteRetry((n) => n + 1); }
        return;
      }
      const merged = mergeDrafts(mergeDrafts(local, remote), migrated);
      /* ⚠️ Сэргээлт ЭНД дууслаа — буусан ч бай, сэргээх зүйл байгаагүй ч бай.
         Тугийг `pickDraft`-аас ӨМНӨ тайлна: тэр нь `setPending` хийж, дараагийн
         commit-д хадгалах эффект хоосон биш төлөвтэй ажиллах тул аюулгүй.
         Сэргээх зүйлгүй бол дараагийн хадгалах эффект хоосон слотыг цэвэрлэнэ —
         тэр нь ЗӨВ (устгах зүйл угаас байхгүй). */
      restoring.current = false;
      if (merged) {
        const src = local && remote ? 'both' : remote ? 'remote' : 'local';
        pickDraft(merged, src);
      }
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
    const nowMs = Date.now();
    const tombKeys = [...Object.keys(pending), ...Object.keys(pendDate)];
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
    doneRef.current = [];
    setDoneBy([]);
    setByMap(new Map());
    /* 2026-09-21: агшин ба tombstone ч мөн БАГЦЫН/НООРГИЙН төлөв — хамт цэвэрлэнэ. */
    setByAtMap(new Map());
    mineAtRef.current = new Map();
    delRef.current = new Map(tombKeys.map((k): [string, number] => [k, nowMs]));
    lastMergedRef.current = 0;
    lastBodyRef.current = '';
    if (tombKeys.length || asOfRevRef.current) {
      const tomb: Draft = {
        t: nowMs, mode: 'inc', cells: [], dates: [], rowKeys: [],
        asOf: asOfRevRef.current ? null : undefined,
        done: [], del: [...delRef.current],
      };
      saveDraftLS(pkg.key, tomb);
      remoteQueue.current = { pkg: pkg.key, draft: tomb };
      setRemoteTick((n) => n + 1);
    } else {
      clearDraftLS(pkg.key);
      void clearRemoteDraft(pkg.key);
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
    if (
      !Object.keys(pending).length
      && !Object.keys(pendDate).length
      && !asOfChanged
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
        const nowMs = Date.now();
        const liveDel: [string, number][] = [...delRef.current].filter(([, a]) => nowMs - a <= DEL_TTL_MS);
        /* ⚠️ ОГНООНЫ БУЦААЛТ ч TOMBSTONE (2026-09-25-ны аудит, `asOfRevRef`-ийн ⚠️):
           `asOf` өөрчлөгдөж бичигдээд анхны утгандаа буцсан бол алсыг УСТГАХГҮЙ —
           `asOf: null` (ил буцаалт)-тай хоосон ноорог бичнэ, эс бөгөөс бусад
           төхөөрөмжийн хуулбар X огноог сэргээнэ. */
        if (liveDel.length || asOfRevRef.current) {
          delRef.current = new Map(liveDel);
          const tomb: Draft = {
            t: nowMs, mode: 'inc', cells: [], dates: [], rowKeys: [],
            asOf: asOfRevRef.current ? null : undefined,
            done: doneRef.current, del: liveDel,
          };
          saveDraftLS(pkg.key, tomb);
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
        draftLiveRef.current = false;
        clearDraftLS(pkg.key);
        /* ⚠️ Нийтэлсэн/болиулсны дараа АЛСЫН хуулбар ч цэвэрлэгдэнэ — хэрэглэгч:
           «нийтлэгдэхэд тэр файл хоослогдоно». Эс бөгөөс өөр төхөөрөмж дээр
           нийтлэгдсэн ажил «нийтлэгдээгүй» гэж дахин санал болгогдоно. */
        void clearRemoteDraft(pkg.key);
        /* ⚠️ ХАМТЫН ТӨЛӨВ ч цэвэрлэгдэнэ (2026-09-08): илгээгдсэний дараа
           «дуусгасан» тэмдэглэгээ үлдвэл дараагийн бөглөлтөд наалдаж,
           тэр хүн ирээгүй байхад «Илгээх» худал түгжигдэнэ. */
        mineRef.current = new Set();
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: localStorage-д бичсэн АГШИН (гадны системийн үйлдлийн үр дүн) — эффектээс өөр газар мэдэгдэхгүй; төлөв болгож задлах нь зан төлөв өөрчилнө
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
    const rowKeys: [number, string][] = [];
    for (const r of rows) if (usedOids.has(r.oid)) rowKeys.push([r.oid, `${r.no} ¦ ${r.work}`]);

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
    /* 7 хоногоос хуучин tombstone-ийг бичихгүй (`DEL_TTL_MS`, `mergeDrafts`-тай ижил). */
    const del: [string, number][] = [...delRef.current]
      .filter(([k, a]) => !(k in pending) && !(k in pendDate) && at - a <= DEL_TTL_MS);

    const draft: Draft = {
      t: at,
      /* ⚠️ `pending` нь НЭМЭЛТ (2026-09-25) — туг ЗААВАЛ, эс бөгөөс НИЙТ гэж уншигдана */
      mode: 'inc',
      cells: Object.entries(pending),
      dates: Object.entries(pendDate),
      /* ⚠️ Анхны утгандаа БУЦСАН бол `null` (ил буцаалт) — `asOfRevRef`-ийн ⚠️
         (2026-09-25). `undefined` = огноо хөндөгдөөгүй. */
      asOf: asOfChanged ? asOf : asOfRevRef.current ? null : undefined,
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
      byAt: byAt.length ? byAt : undefined,
      del: del.length ? del : undefined,
    };
    saveDraftLS(pkg.key, draft);
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
  }, [pending, pendDate, asOf, asOfOrig, pkg.key, rows, user?.username, loadedPkgRef]);

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
        if (!live() && !allowStale) return;
        if (at === undefined) {
          /* Уншиж чадсангүй — бичихгүй: алсын агуулга үл мэдэгдэх тул бичих нь
             бусдын ажлыг устгах эрсдэлтэй. Локал бүрэн бүтэн. */
          if (!live()) return;
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
        if (at !== null && (allowStale || at !== lastMergedRef.current)) {
          const rr = await readRemoteDraft(q.pkg);
          if (!live() && !allowStale) return;
          if (!rr.ok) {
            if (!live()) return;
            setRemoteState({ kind: 'fail', why: rr.error });
            if (!remoteQueue.current) remoteQueue.current = q;
            setTimeout(() => setRemoteTick((n) => n + 1), REMOTE_RETRY_MS);
            return;
          }
          remote = rr.draft ? parseDraft(rr.draft.payload, 'remote') : null;
        }
        /* Алсынхыг ХУУЧИН, өөрийнхийг ШИНЭ тал болгож нийлүүлнэ — нүд тус
           бүрээр шинэ агшинтай нь ялна (`mergeDrafts`). */
        const merged0 = mergeDrafts(remote, q.draft) ?? q.draft;
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
        if (outBody.length > REMOTE_MAX) { if (live()) setRemoteState({ kind: 'big' }); return; }
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
          return;
        }
        /* ⚠️ Нийлсэн үр дүнг ЛОКАЛД ч буулгана — эс бөгөөс дараагийн бичилт
           дахин зөвхөн өөрийн хэсгээ агуулж, нөгөө талын ажил локалд
           хэзээ ч харагдахгүй. Дэлгэц нь татах мөчлөгөөр шинэчлэгдэнэ. */
        saveDraftLS(q.pkg, outDraft);
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
        await saveRemoteDraft(q.pkg, outDraft.t, outBody).then((r) => {
        /* Багц солигдсон бол хуучин хариугаар шинэ багцын төлөвийг бичихгүй */
        if (!live()) return;
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
              timer = setTimeout(() => void tick(), REMOTE_DEBOUNCE_MS);
              return;
            }
            lastMergedRef.current = remote.t;
            const local = readDraft(pkg.key);
            const merged = mergeDrafts(local, remote);
            if (merged) pickDraftRef.current(merged, 'remote');
          }
        }
      }
      if (alive) timer = setTimeout(() => void tick(), REMOTE_DEBOUNCE_MS);
    };
    timer = setTimeout(() => void tick(), REMOTE_DEBOUNCE_MS);
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [busy, noEdit, canPerf, sc, rows.length, pkg.key, loadedPkgRef, editRef]);

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
  return {
    savedAt, keepDraft, remoteQueue, mineRef, mineAtRef, delRef, asOfRevRef, draftLiveRef, touchMine, revert,
    lastMergedRef, doneRef, doneBy, setDoneBy, byMap, setByMap, byAtMap, setByAtMap, byAtRef, lastBodyRef,
    remoteState, setRemoteState, promptedPkgRef, flushRef,
    meKey, participants, waitingOn, byCount, iAmDone, canSubmitNow, toggleDone, dropDraft,
  };
}
