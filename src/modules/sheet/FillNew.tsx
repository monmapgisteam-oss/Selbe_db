'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  loadSchema,
  pkgFloors,
  PKG_GROUPS,
  PKGS,
  type Pkg,
  type Schema,
} from "./bagts.pkg";
/*
 * ⚠️ 2026-09-04 — `applyAdds` ЭНД БАЙХГҮЙ, БОЛОХГҮЙ. «Нийтлэх» нь одоо
 * ИЛГЭЭХ үйлдэл: үндсэн (`Bagts_*`) өгөгдөл рүү бичихгүй, зөвхөн завсрын
 * хадгалалтад (`Selbe_Guitsetgel_Draft` → `sub|<pkgKey>`) зөрүү (diff)
 * тавина. Архивт бичих ЦОРЫН ГАНЦ зам нь газрын даргын (6-р шат) батламж
 * (`hyanaltStore.apply`). Хэрэглэгчийн шаардлага: «бүх шалгалт дуусаж 4 шат
 * дамжсаны дараа л дата хүснэгт буюу үндсэн сервис рүү орно».
 * `draft.check.mjs` нь энэ файлд архивт бичих дуудалт байхыг ХОРИГЛОЖ шалгана
 * (нэрийн дараа нээх хаалт байвал шалгуур унана — тиймээс тайлбарт ч бүү бич).
 */
import {
  buildOidMap,
  mapOldOids,
  moveKeys,
  overlaySubmission,
  rowKeyOf,
  rowOccOf,
  withFrameOcc,
  needsFrameOcc,
} from "./sheetFrame";
import {
  /* ⚠️ `listActiveSubmissions` ЭНД ХЭРЭГЛЭГДЭХГҮЙ (2026-09-07): «өөр өдрийн
     илгээлт хянагдаж байна уу» гэдгийг ХЯНАЛТЫН МӨРӨӨС (`otherDaysInReview`)
     уншина — тэр нь урсгалын ЖИНХЭНЭ эх сурвалж (аль шатанд, хэний гар дээр
     байгааг мэднэ), харин `sub|` мөр нь зөвхөн агуулга. Хоёуланг нь уншвал
     нэмэлт хүсэлт зарцуулаад ижил хариу авна. Функц нь `submission.ts`-д
     хянагчийн/тайлангийн зам болон тестэд үлдэнэ. */
  mergeSubmission,
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
import { bagtsFor, bagtsScope, subscribeAcl } from "@/lib/guitsetgelAcl";
import { roleForUser } from "@/lib/services";
import { hasCap, subscribeCaps } from "@/lib/caps";
import { obyemScope, subscribeObyemAcl } from '@/lib/obyemAcl';
import { userError } from '@/components/ui';
import { seriesBands } from "./bagts.bands";
import { sheetDates } from "./sheetRows";
import { useColWidths } from "./colWidths";
import { t as tr } from "@/lib/i18nCore";
import { useSyncRef } from "@/lib/useSyncRef";
import st from "./sheet.module.css";
/*
 * ⚠️ 2026-09-30: ЗАДРАЛ — 6.9k мөрийн нэг функц `fill/`-ийн hook, компонент, туслахуудад
 *    хуваагдав (зан төлөв ЯГ хэвээр). Энд ҮЛДСЭН нь: төлөвийн зарлалт · ачаалах эффект ·
 *    илгээлтийн урсгал (`publish` — олон төлөв хөнддөг тул тусгаарлах хил цэвэр биш) ·
 *    хүснэгтийн араг яс. Ноорог → `useDraftSync`, урсгал → `useFlow`, нүдний засвар →
 *    `useCellEdit`, обьём → `useObyem`, мөрийн шүүлт/гүйлгээ → `useRows`, харагдац →
 *    `toolbar`/`notices`/`SheetHead`/`FillRows`/`FillDatePicker`/`PvCell`.
 *    Мөн `draft.ts` (ноорогийн цэвэр туслах), `util.ts` (хэлбэржүүлэлт · RO · төрөл).
 *    Эффектүүдийн ДАРААЛАЛ хэвээр: hook бүр эффектээ анх байсан байрлалдаа зарлана.
 */
import {
  REMOTE_RETRY_MS,
  /* 2026-10-04 аудит — илгээлтийн баримт · явж буй илгээлт (#1 · #3 · #4) */
  readDraft, rebaseSent, readInflight, saveInflight, clearInflight, newNonce, type Inflight,
} from "./fill/draft";
import { setNavDirty } from "@/lib/navGuard";
import {
  RO, cls, dt, nowFillMs, describeUnmoved, changedKeys, type EditCol, type PickState, type SheetView,
} from "./fill/util";
import { useNotice } from "./fill/useNotice";
import { useWideMode } from "./fill/useWideMode";
import { useFlow, useReviewInc } from "./fill/useFlow";
import { useObyem, useObyemState } from "./fill/useObyem";
import { useAddedOids, usePkgPct, useRowFilter, useVirtualWindow } from "./fill/useRows";
import { useCellEdit, type PastePrev } from "./fill/useCellEdit";
import { useDraftSync, type DraftSync } from "./fill/useDraftSync";
import { DraftStatus, FilterBar, ObyemToolbar, Participants, PkgPctBadge, SubmitControls } from "./fill/toolbar";
import { FillNotices, NoticeToast } from "./fill/notices";
import { SheetHead } from "./fill/SheetHead";
import { FillRows } from "./fill/FillRows";
import { FillDatePicker } from "./fill/FillDatePicker";

/* `SheetView` — `Sheet.tsx` энэ файлаас импортолдог (2026-09-30: `fill/util`-д зөөгдсөн, re-export) */
export type { SheetView } from "./fill/util";

/**
 * ХУУЧИН ИЛГЭЭЛТИЙН ДАВТАМЖИЙГ СУУРЬ ЖААЗААС НӨХНӨ (2026-10-04 дахин аудит, #1, HIGH —
 * `sheetFrame.withFrameOcc`-ийн ⚠️). `rowOcc`-гүй, өмнөх жааз дээрх илгээлт урьд нь ачаалах
 * overlay-д `unmoved`, дахин илгээхэд (`movePayload`) `stale` болж МӨНХӨД гацдаг байв.
 * ⚠️ Уншилт унавал/суурь олдохгүй бол payload ХЭВЭЭР — хуучин дүрэм (хоёрдмол → ил зогсолт).
 */
/**
 * ХАРИУ ТАСАРСАН ИЛГЭЭЛТИЙН ТҮЛХҮҮРҮҮД ОДООГИЙН ЖААЗАД (2026-10-04 дахин аудит, #5): `inf.sent` + жааз
 * солигдсон бол тэдгээрийн шинэ түлхүүр (мөрийн танигч `inf.rk`/`inf.occ`-оор — `mapOldOids`). Урьд нь
 * илгээх агшны хуудасны түлхүүрээр л баримт тавьдаг тул шинэ жааз дээрх хуулбар (`pending`, `landMoved`)
 * олдохгүй, илгээгдсэн нүд ДАХИН илгээгдэх байв. Тулгаж чадаагүй (хоёрдмол) түлхүүр хуучнаараа л үлдэнэ.
 */
/**
 * ⚠️ 2026-10-06: ЯВЖ БУЙ ИЛГЭЭЛТИЙН ТЭМДГИЙГ (`readInflight`) АЧААЛАЛТ ЗӨВХӨН ӨӨРИЙНХИЙГ эсвэл ХУУЧИРСНЫГ
 *    арилгана. Урьд нь өөр табын хуудас ачаалахад серверт `nonce` ХАРААХАН олдоогүй (1-р табын
 *    `saveSubmission` явж байгаа) үед тэмдгийг арчиж, 1-р табын хариу тасарвал дахин илгээхэд ижил
 *    нэмэлт ДАВХАР тоологдох боломжтой байв. `myNonces` — энэ табын (модулийн санах ой) оролдлогууд.
 */
const myNonces = new Set<string>();
const INFLIGHT_STALE_MS = 2 * 60_000;
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
 *
 * ⚠️ 2026-09-30: урьд нь «Гүйцэтгэлийн хяналт»-аас зөвхөн таб солигддог тул
 *    хуудас анхдагч багц (`PKGS[0]`) дээр нээгдэж, гүйцэтгэгч буцаагдсан
 *    багцаа гараар хайдаг байв. `Sheet.tsx` пропс дамжуулдаггүй тул МОДУЛИЙН
 *    нэг удаагийн хүсэлт: FillNew mount болохдоо уншиж (`fixReq`), mount-ийн
 *    эффектэд цэвэрлэнэ (StrictMode-ийн давхар initializer-т алдагдахгүй).
 * ⚠️ Хяналтын харагдацад (`view`) ҮЛ ТООНО.
 */
export type FillOpenRequest = { bagts: string; ajil: string; sheetOid: number | null };
let openReq: FillOpenRequest | null = null;
export function requestFillOpen(r: FillOpenRequest): void { openReq = r; }
/** Хүсэлтийн хуудас — `flow`-ийн тулгалттай ИЖИЛ дүрэм (`pkg.name` нь `Ажлын_нэр`-д) */
function pkgOfReq(r: FillOpenRequest): Pkg | null {
  const cand = PKGS.filter((p) => p.group === r.bagts);
  return cand.find((p) => r.ajil.includes(p.name)) ?? cand[0] ?? null;
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
   * ⚠️ Төлөв (`edit`) биш REF: мөчлөгийн эффект `edit`-ээс хамаарвал нүд
   *    товших бүрд дахин эхэлж, тоолуур хэзээ ч дуусахгүй.
   */
  const editRef = useRef<unknown>(null);
  /** Нээлттэй календарын толь — `editRef`-тэй ижил зорилго (Escape, 2026-09-24) */
  const pickRef = useRef<unknown>(null);
  const { wide, setWide, editing, setEditing } = useWideMode({ editRef, pickRef });
  /** Энэ таб яг одоо нуугдсан уу (`display: none` → хайрцаг нэг ч байхгүй).
   *  ⚠️ 2026-10-07: `offsetParent` БИШ — бүтэн дэлгэцэд (`.wrapFull { position: fixed }`) тэр нь
   *     ҮРГЭЛЖ null тул Ctrl+S яг бөглөж байгаа горимд ажилладаггүй байв. `getClientRects()`
   *     нь `display: none`-д хоосон, fixed-д хоосон биш. */
  const hiddenNow = () => !wrapRef.current?.getClientRects().length;
  /** «Засаад дахин илгээх»-ийн хүсэлт (`requestFillOpen`-ийн ⚠️, 2026-09-30) */
  const [fixReq, setFixReq] = useState<{ pkgKey: string; soid: number | null } | null>(() => {
    if (view || !openReq) return null;
    const p = pkgOfReq(openReq);
    return p ? { pkgKey: p.key, soid: openReq.sheetOid } : null;
  });
  useEffect(() => { openReq = null; }, []);
  const [pkg, setPkg] = useState<Pkg>(
    () => (view && PKGS.find((p) => p.key === view.pkgKey))
      || (fixReq && PKGS.find((p) => p.key === fixReq.pkgKey))
      || PKGS[0],
  ); // Багц 1 · 9F — жагсаалтын эхнийх
  const [sc, setSc] = useState<Schema | null>(null);
  /** Тайлангийн огноонууд — «Гүйцэтгэл бөглөх» табтай НЭГ эх сурвалжаас. */
  const [dates, setDates] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  /* ⚠️ Inspection Test Plan (М-акт · FIC · MA · MIR) ЭНД БАЙХГҮЙ
     (2026-09-03): «Чанар (QAQC)» тусдаа харагдац болов. Тэр өгөгдөл нь
     `QAQC`/`QAQC2` үйлчилгээнд, архивгүй, мөр нь байрандаа засагддаг —
     энэ хуудасны нийтлэх мөчлөгтэй нийцдэггүй. `src/modules/Qaqc.tsx`. */
  const [asOf, setAsOf] = useState<number | null>(null);
  const [asOfOrig, setAsOfOrig] = useState<number | null>(null);
  /** Ачаалсан агшны БӨГЛӨСӨН ӨДӨР (`buglusun_ognoo`) — өнөөдрийнх үү гэж шалгана. */
  const [snapDay, setSnapDay] = useState<string>("");
  /** Ачаалсан агшны бөглөсөн өдөр (ms) — дахин илгээхэд хэрэгтэй */
  const [snapMs, setSnapMs] = useState<number | null>(null);
  /**
   * ӨДӨРТ НЭГ УДАА — илгээсэн бол дахин бөглөхгүй.
   *
   * ⚠️ Илгээчихээд дахин бөглөвөл хянагч харж байгаа тоо нь хуудсан дээрх
   *    тооноос ЗӨРНӨ: тэр нэгийг батлах атлаа өгөгдөлд өөр нэг нь сууна.
   *    Тиймээс өнөөдрийн агшин үүссэн бол хуудас ХААЛТТАЙ.
   *
   * ⚠️ ГАНЦ УУЧЛАЛ: буцаалт ирсэн бол ЗААВАЛ засах ёстой — эс бөгөөс
   *    гүйцэтгэгч буцаалтыг маргааш хүртэл засаж чадахгүй гацна.
   */
  /**
   * БАГЦЫН ХУВААРИЛАЛТ — эрхийн панелаас.
   * ⚠️ Гүйцэтгэгч зөвхөн ӨӨРТӨӨ хуваарилагдсан багцыг бөглөнө. Бүх багц
   *    нээлттэй бол нэг компани нөгөөгийнхөө гүйцэтгэлийг бичиж болно.
   * ⚠️ Хуваарилалт огт хийгээгүй бол ХЯЗГААРГҮЙ — эс бөгөөс шинэ систем
   *    дээр хэн ч юу ч бөглөж чадахгүй болно.
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
   *
   * ⚠️ Урьд нь ЗӨВХӨН `company` шатаар шүүдэг байв. «Мөр нэмэх»/«QAQC» эрхээр
   * орсон өөр шатны ажилтан (Ерөнхий менежер, чанарын инженер) тэгвэл хоосон
   * жагсаалт хараад шинэ эрх нь утгагүй болно. Тиймээс БҮХ ШАТ дундах
   * нэгдсэн хүрээг авна (`bagtsScope`).
   *
   * ⚠️ АДМИН (`super`) томилгооноос үл хамаарна — эс бөгөөс тохируулагч
   * өөрөө түгжигдэнэ.
   *
   * ⚠️ `null` = хязгааргүй · `[]` = томилгоогүй тул НЭГ Ч багц нээгдэхгүй.
   */
  /**
   * ⚠️ ХЯЗГААРГҮЙ = кодын хатуу `super` эсвэл нэвтрэлт унтраалттай дев (2026-08-29).
   *    Панелийн «Супер» preset (override) энд орохгүй — тэр нь харагдацын багц;
   *    багцын хүрээ нь томилгооноос. Дев орчинд `user` null тул урьд нь
   *    `bagtsScope` `[]` өгч нэг ч багц нээгддэггүй байв.
   */
  const unrestricted = authStatus === "off" || roleForUser(user?.username) === "super";
  const myBagts = useMemo(
    () => (unrestricted ? null : bagtsScope(user?.username)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, unrestricted, aclN],
  );
  const groupOpts = useMemo(
    () => (myBagts ? PKG_GROUPS.filter((g) => myBagts.includes(g)) : PKG_GROUPS),
    [myBagts],
  );

  /*
   * ⚠️ Сонгосон багц нь хуваарилалтаас ГАДУУР үлдвэл хуудас нь бөглөж
   *    болохгүй өгөгдлийг харуулна. Тиймээс зөвшөөрөгдсөн эхнийх рүү өөрөө
   *    шилжинэ — хэрэглэгч хоосон дэлгэц ширтэхгүй.
   */
  /* ⚠️ 2026-09-30: эффект БИШ, render-ийн үед шууд (React-ийн «props солигдоход төлөв тохируулах»
     хэв маяг). Урьд `useEffect(..., [groupOpts])` дотор `setPkg` байв — хүрээнээс гадуурх багцаар
     ачаалах эффект НЭГ удаа дэмий ажилладаг байсан нь арилав; эцсийн төлөв ижил. */
  if (!view && !groupOpts.includes(pkg.group)) {
    const first = PKGS.find((p) => p.group === groupOpts[0]);
    if (first) setPkg(first);
  }

  const {
    hyRows, hyLoading, hyErr, reloadHy,
    todayFillMs, setTodayFillMs, flow, otherDaysInReview, otherDaysReturned,
    resumedOid, setResumedOid, returned, reviewStage, inReview, flowRef, today, reviewSoidsKey,
  } = useFlow({ pkg, view });
  /**
   * Өнөөдөр архивт жааз үүссэн үү — ЗӨВХӨН дэлгэцийн мэдээлэл.
   *
   * ⚠️ Энэ нь «БАТЛАГДСАН» гэсэн үг — «ИЛГЭЭГДСЭН» гэсэн үг БИШ. Хоёрыг
   *    андуурсан нь өмнөх хоёр алдааны эх үндэс байсан.
   * ⚠️ 2026-09-04: архивт жааз одоо ЗӨВХӨН газрын даргын (6-р шат) батламжаар
   *    үүсдэг тул энэ нь «энэ багцын өмнөх мөчлөг өнөөдөр батлагдсан» гэсэн
   *    утгатай болов. ЯМАР Ч ТҮГЖЭЭНД хэрэглэгдэхгүй — илгээх хоригийн
   *    цорын ганц шалгуур нь `inReview`.
   */
  const publishedToday = !!snapDay && snapDay === today;
  /**
   * Засах эрхгүй — харах л боломжтой.
   *
   * ⚠️ «ӨДӨРТ НЭГ УДАА» ТҮГЖЭЭ ХАСАГДСАН (2026-09-03, хэрэглэгчийн шууд
   *    заавар: «өдөрт 2 удаа бөглөх боломжтой болго»).
   *
   *    Урьд нь `locked || (sentToday && !returned)` байв: тухайн өдөр агшин
   *    үүсмэгц хуудас БҮРМӨСӨН хаагдаж, өглөө бөглөсөн гүйцэтгэлээ үдээс хойш
   *    засах ямар ч зам үлдэхгүй — зөвхөн хянагч буцаавал л нээгддэг байлаа.
   *
   *    ⚠️ 2026-09-04: «илгээсэн агшин ба хянагдах агшин зөрнө» гэсэн ХУУЧИН
   *    эрсдэл АРИЛСАН. Илгээлт нь архивын агшин БИШ, тусдаа мөрөнд (`sub|…`)
   *    хадгалагдсан ЗӨРҮҮ болсон тул хянагч ЯГ тэр зөрүүг (архивын сүүлийн
   *    жааз дээр давхарлаж) харна. Оронд нь шинэ дүрэм орсон: хянагчийн гар
   *    дээр байхад дахин ИЛГЭЭХ нь хаалттай (`inReview`) — бөглөх нь нээлттэй.
   */
  const noEdit = locked;
  /**
   * ГҮЙЦЭТГЭЛ (обьём, огноо, «шинэчлэгдсэн огноо») БӨГЛӨХ ЭРХ — зөвхөн ЭНЭ багцад
   * `company` шатанд томилогдсон гүйцэтгэгч (эсвэл админ).
   *
   * ⚠️ 2026-08-29: `myBagts` нь бүх шатны нэгдсэн хүрээ (QAQC/мөр нэмэх эрхтэй
   *    инженер, менежер хуудсаа харах ёстой) тул зөвхөн түүгээр шүүвэл инженер
   *    өөрийн хянах багцын гүйцэтгэлийг бөглөж, нийтлээд, ӨӨРӨӨ батлах зам
   *    нээгддэг байв. Мөр нэмэх эрх (`addRow` cap) одоо «Хуваарь»-д; чанарын баримтын
   *    эрх (`qaqc`) нь одоо «Чанар (QAQC)» тусдаа харагдацад амьдарна.
   */
  const canPerf = useMemo(() => {
    if (unrestricted) return true;
    const cb = bagtsFor(user?.username, "company");
    return cb === null || cb.includes(pkg.group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, unrestricted, aclN, pkg.group]);
  /**
   * Гүйцэтгэлийн нүд засагдахгүй: хуудас түгжээтэй, гүйцэтгэгч биш, ЭСВЭЛ
   * ЗАСВАРЫН горим нээгдээгүй.
   * ⚠️ `editing`-ийн тайлбарыг түүний зарлалаас үз.
   */
  const noPerf = noEdit || !canPerf || !editing;

  /* ══════════ ИНЖЕНЕРИЙН ТӨЛӨВЛӨСӨН ОБЬЁМ (2026-09-08) ══════════
   * ⚠️ ГҮЙЦЭТГЭЛЭЭС БҮРЭН ТУСДАА зам: өөрийн эрх (`obyemEdit`/`obyemApprove`),
   *    өөрийн ноорог (`pvPend`), өөрийн батлах хүснэгт (`obyemBatlah`).
   *    `pending` (гүйцэтгэлийн ноорог) руу ОГТ ХОЛИХГҮЙ — `publish` нь
   *    түүнийг хардаггүй тул 6 шатат хяналтад бүртгэгдэхгүй.
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

  /* ⚠️ НЭМЭЛТ АЖИЛ (`canAjilSend`/`ajSub`/`sendAjil`/`withdrawAjilHere`) ЭНД
     БАЙХГҮЙ (2026-09-24): мөр нэмэх, батлуулах, татах бүгд «Хуваарь» руу
     шилжсэн (импортын ⚠️). Батлах нь урьдын адил `AjilBatlah.tsx`-д. */

  /*
   * ⚠️ `submittedToday` УСТСАН (2026-09-04). Тэр нь «өнөөдөр архивт агшин
   *    үүссэн БА хяналтын бүртгэлд тохирох мөр бий юу» гэсэн ӨГӨГДЛИЙН
   *    таамаг байв — илгээлт архивт бичигдэхээ больсон тул мөрийн OBJECTID
   *    ч, `buglusun_ognoo` ч илгээлттэй холбогдохоо болив. Одоо байдлыг
   *    хяналтын урсгалын мөр (`flow`) ШУУД хэлнэ: `inReview` (хянагчийн гар
   *    дээр) ба `returned` (буцаагдсан) хоёр.
   */

  /**
   * ХЯНАЛТАД ИЛГЭЭЛТ УНАСАН уу — ЗӨВХӨН ЭНЭ СЕШНИЙ нийтлэлээс.
   *
   * ⚠️ 2026-09-03 — ЭНЭ ТУГ ЯАГААД ӨГӨГДЛӨӨС УНШИГДАХГҮЙ БОЛОВ.
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
  /**
   * ЭНЭ БАГЦЫН ИДЭВХТЭЙ ИЛГЭЭЛТ (`sub|<pkgKey>`) — ачаалахад уншигдана.
   *
   * ⚠️ Хоёр зорилготой: (1) хуудсанд илгээсэн тоог давхарлаж харуулах
   *    (илгээсэн ажил дэлгэцээс алга болох ЁСГҮЙ); (2) дахин илгээхэд ХУУЧИН
   *    payload дээр НЭГТГЭХ (`mergeSubmission`) — эс бөгөөс өмнөх илгээлтийн
   *    нүднүүд чимээгүй унтарна.
   */
  const [staged, setStaged] = useState<StagedSubmission | null>(null);
  /**
   * ХАДГАЛАГДСАН ч ХЯНАЛТЫН БҮРТГЭЛ ҮҮСЭЭГҮЙ илгээлтийн мөрийн дугаар ба өдөр.
   *
   * ⚠️ 2026-09-04: `resend` урьд нь `rows[0].oid` (АРХИВЫН мөр) ба `snapMs`
   *    (архивын агшин)-ыг явуулдаг байв. Илгээлт архивт бичигдэхээ больсон
   *    тул тэр хоёр нь одоо БУРУУ заалт өгнө — хянагч огт өөр (хуучин) жааз
   *    руу заасан бүртгэл авна. Тиймээс дахин илгээх зам нь ЯГ ижил
   *    (илгээлтийн OBJECTID, бөглөсөн өдөр) хосыг давтана.
   */
  const [stagedOid, setStagedOid] = useState<number | null>(null);
  const [stagedFillMs, setStagedFillMs] = useState<number | null>(null);
  /**
   * ИЛГЭЭСЭН АТЛАА МӨРӨНД ТУЛГАГДААГҮЙ НҮДНҮҮД (`overlaySubmission.unmovedKeys`).
   *
   * ⚠️ ЯАГААД (2026-09-04-ний аудит): `overlaySubmission`-ийн `unmoved`-ыг
   *    бөглөх хуудас ч, хянагчийн харагдац ч ОГТ шалгадаггүй байв — зөвхөн
   *    `ov.rows`-ыг авдаг. Архивт хооронд нь шинэ жааз орсон эсвэл `rowKeys`
   *    дутуу бол зарим нүд мөрөнд буухгүй: гүйцэтгэгч өөрийн илгээсэн тоог
   *    хуудсан дээр ХАРАХГҮЙ (дахин бөглөнө), хянагч ч тэднийг өөрчлөлтийн
   *    жагсаалтад харахгүй. Ерөнхий менежер батлах гэж дарахад л
   *    `hyanaltStore` хатуу зогсоож, тэр үед багц бүхэлдээ ГАЦНА. Тиймээс энэ
   *    үед ил анхааруулж, ЯГ аль мөр/блок болохыг нэрлэнэ.
   */
  const [unmovedWarn, setUnmovedWarn] = useState<string[]>([]);
  /**
   * ЭНЭ СЕШНД ХЯНАЛТАД АМЖИЛТТАЙ БҮРТГЭГДСЭН илгээлтийн мөрийн дугаарууд.
   * ⚠️ «Өнчин илгээлт»-ийн эффект нь хяналтын жагсаалтаас хайдаг бөгөөд
   *    `reloadHy()` нь асинхрон — нийтэлсний дараах хэдэн зуун миллисекундэд
   *    мөр хараахан ирээгүй байхад ХУДАЛ анхааруулга гаргах байлаа.
   */
  const registeredRef = useRef<Set<number>>(new Set());
  const resend = async () => {
    if (resending || stagedOid == null || stagedFillMs == null) return;
    setResending(true);
    /*
     * ⚠️ ДАХИН ИЛГЭЭХИЙН ӨМНӨ ШИНЭЭР БАТАЛГААЖУУЛНА (2026-09-04-ний аудит):
     *    дээрх «өнчин илгээлт»-ийн дүгнэлт нь модулийн КЭШЛЭГДСЭН `hyRows`-оос
     *    уншдаг тул хуудсаа эрт нээсэн хэрэглэгчид ӨӨР хүний саяхан бүртгүүлсэн
     *    илгээлт харагдахгүй — «бүртгэгдсэнгүй» гэсэн ХУДАЛ анхааруулга гарч,
     *    товч дарахад нэг илгээлтэд ХОЁР ДАХЬ хяналтын мөр (ergelt=2) үүсч,
     *    нэг илгээлт хоёр тойрог мэт харагдана. Тиймээс амьд өгөгдлөөс
     *    шалгана; бүртгэл нь байвал шинэ мөр ҮҮСГЭХГҮЙ, зөвхөн анхааруулгыг
     *    хаана. (Буцаалтын дараах ЖИНХЭНЭ дахин илгээлт нь энэ товчоор биш,
     *    «Нийтлэх» замаар явдаг тул энэ шалгуур түүнийг хаахгүй.)
     */
    /* ⚠️ 2026-10-04: урьд нь ижил `sheetOid`-тай ЯМАР Ч хяналтын мөр байвал «аль хэдийн
       бүртгэгдсэн» гэж зогсдог байв — буцаагдсан (компанийн гар дээрх) ХУУЧИН тойрог ч
       тоологдож, буцаалтын дараах засвар бүртгэгдэж чадаагүй үед инженерт ХЭЗЭЭ Ч хүрэхгүй.
       Одоо шийдвэрийг `submitForReview` → `openReviewRow` (одоогийн тойрог · төлөв ·
       хянагчийн гар дээр) гаргана: нээлттэй бол `reused` (шинэ мөр үүсгэхгүй), эс бөгөөс
       шинэ тойрог. Амьд `queryAll` түүн дотор — дээрх давхар мөрийн хамгаалалт хэвээр. */
    /* ⚠️ Хуудсын нэр ЗААВАЛ — `flow`-ийн шүүлт түүгээр 9F/12F-ийг ялгадаг.
       ⚠️ `pkg.name` (орчуулагддаггүй) — `label` бол хэл солиход `Ажлын_нэр`
          өөр текстээр бичигдэж, `flow`-ийн тулгалт тасарна (2026-09-21). */
    const rv = await submitForReview(pkg.group, stagedFillMs, stagedOid, pkg.name);
    setResending(false);
    if (rv.ok) {
      registeredRef.current.add(stagedOid);
      setSubmitFailed(false);
      reloadHy();
      done(rv.reused ? tr('Энэ илгээлт хяналтад аль хэдийн бүртгэгдсэн байна') : tr('Хяналтад илгээв ({0})', rv.id));
    }
    else setErr(rv.error);
  };

  /* ⚠️ `canAddRow`/`addFor`/`addForm` ХАСАГДАВ (2026-09-24) — «Мөр нэмэх» эрх
     (`addRow` cap) одоо «Хуваарь»-д шалгагдана; энэ хуудсанд мөр нэмэх UI байхгүй. */
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /** Обьёмын баганагүй блокийн тайлбарыг НЭГ Л УДАА хэлнэ (чимээ болгохгүй) */
  const pctHintRef = useRef(false);

  /**
   * Нээлттэй засварын нүд. `col` нь АЛЬ БАГАНА гэдгийг заана — обьёмгүй
   * мөрд обьём ба хувь ХОЁУЛАА засагддаг тул мөр+блок ганцаараа хүрэлцэхгүй.
   * ⚠️ 2026-10-01: `toggleFill` (доор) ба ачаалах эффект `setEdit` дууддаг тул тэднээс ДЭЭР
   *    зарлагдана (React Compiler: «зарлагдахаас өмнө хандсан»; зөвхөн байрлал, утга ижил).
   */
  const [edit, setEdit] = useState<{
    i: number;
    b: number;
    col: EditCol;
  } | null>(null);

  /**
   * БӨГЛӨХ ГОРИМ — ОБЬЁМ эсвэл ХУВЬ (2026-09-06, хэрэглэгчийн хүсэлт).
   *
   * ⚠️ Нүд тус бүрд БИШ, ХУУДАС даяар: нэг мөрөнд зарим нүдийг обьёмоор,
   * заримыг хувиар бөглөвөл багана хооронд нүдээр харьцуулах боломжгүй болно.
   * Товч дарахад БҮХ БАГАНА нэг дор солигдоно.
   *
   * ⚠️ ХАДГАЛАГДСАН УТГА СОЛИГДОХГҮЙ — зөвхөн ХАРАГДАЦ ба ОРОЛТ. Аль ч
   * горимд нүдэнд обьём ба хувь ХОЁУЛАА харагдана; горим нь зөвхөн аль нь
   * ТОМООР гарах ба бичихэд аль нь ойлгогдохыг шийднэ.
   *
   * ⚠️ Хөтөчид сонголтыг санана — өдөр бүр нэг горимоор ажилладаг хүн товчийг
   * дахин дахин дарахгүй.
   */
  const [fillMode, setFillMode] = useState<"obyem" | "pct">(() => {
    try {
      return localStorage.getItem("selbe-fill-mode") === "pct" ? "pct" : "obyem";
    } catch { return "obyem"; }
  });
  const toggleFill = useCallback(() => {
    setFillMode((m) => {
      const n = m === "obyem" ? "pct" : "obyem";
      try { localStorage.setItem("selbe-fill-mode", n); } catch { /* хаалттай орчин */ }
      return n;
    });
    /* ⚠️ Нээлттэй нүдийг ХААНА: оролтын `defaultValue` нь горимын дагуу
       бэлдэгддэг тул нээлттэй хэвээр үлдвэл өмнөх горимын тоо харагдсаар
       байгаад буруу нэгжээр бичигдэнэ. */
    setEdit(null);
    /* ⚠️ 2026-10-01: `setEdit` тогтвортой (useState) — React Compiler түүнийг хамаарал гэж
       тооцдог тул жагсаалтад (preserve-manual-memoization); `[]`-тэй ЯГ ижил. */
  }, [setEdit]);
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
  /* ⚠️ 2026-10-01: `edit` төлөв `toggleFill`-ээс ДЭЭР зөөгдөв (тэр нь `setEdit` дууддаг) */
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
   *
   * ⚠️ ЯАГААД АНХНААСАА АСААЛТТАЙ (2026-09-01, хэрэглэгчийн шийдвэр): хуудас
   * нээхэд 1,370–1,675 мөр бүтнээрээ гардаг байсан бөгөөд бөглөгч тухайн өдөр
   * ажил явж байгаа хэдхэн мөрөө тэр моднаас гүйлгэж хайдаг байв. Бүлгийн
   * шүүлт (grpA/grpB) нь модны САЛБАР таслана, ХУГАЦААНЫ талаар юу ч хийхгүй.
   *
   * ⚠️ Идэвхтэй олонлог нь ЖИЖИГ — хуваарь 2025–2028 оныг дамждаг тул нэг
   * өдөрт 4–23 мөр (сайн хуваарьтай Багц 3.2-т 757). Тиймээс товч дээр тоог
   * ИЛ бичиж, хоосон үед тайлбар гаргана: эс бөгөөс «хүснэгт эвдэрсэн» гэж
   * уншигдана.
   */
  const [byPlan, setByPlan] = useState(true);
  const { style: colStyle, grip, resetAll, resized } = useColWidths("fillnew");

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

  const { notice, setNotice, show, say, done, warn, ro } = useNotice();
  /**
   * ⚠️ 2026-10-09: САЛАА МЭДЭГДЭЛ (`useDraftSync`-ийн `soft`) — «Ноорог сэргээв…» ба «Хамтын ноорог
   *    шинэчлэгдлээ». Урьд нь `say` («Энэ нүд засагдахгүй.» гарчигтай, ХУДАЛ) татах мөчлөг бүрд дуудагдаж
   *    ЧУХАЛ (шар/амжилтын) мэдэгдлийг 3–6 сек тутам дардаг байв. Одоо төвийг сахисан (✓) төрлөөр, харагдаж
   *    буй `warn`/`ok` мэдэгдлийг ДАРАХГҮЙ (`ro` — товшилтын түр тайлбарыг л солино).
   */
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
   *
   * ⚠️ 2026-08-27: урьд нь `distinct("ognoo", ACTUAL)` буюу нэгтгэсэн
   * хүснэгтээс авдаг байв. Тэр үйлчилгээ хаагдсан (499) бөгөөд дуудалт нь
   * `.catch(() => {})`-той тул сонголт ЧИМЭЭГҮЙ хоосорч байсан. Одоо бөглөх
   * хуудсуудын `buglusun_ognoo`-оос шууд гарна.
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
   *
   * ⚠️ Багц солиход доорх `setRows([])` / `setSc(null)` нь ДАРААГИЙН render-д
   *    л тусдаг тул нооргийн СЭРГЭЭХ ба ХАДГАЛАХ эффектүүд нэг агшин ШИНЭ
   *    `pkg.key`-тэй, ХУУЧИН багцын мөр/бүдүүвч/`nBld`-ээр ажилладаг байв.
   *    Хохирол нь хоёулаа чимээгүй: (1) хуучин `nBld`, хуучин `sc.obyem`-оор
   *    шалгахад зорилтот багцын ноорог бүхэлдээ «хуучирсан» болж, `total = 0`
   *    гэж дүгнэгдээд `clearDraftLS` АСУУЛТГҮЙ устгана; (2) хуучин `pending`
   *    нь ШИНЭ багцын ноорогийн слот руу бичигдэнэ. Мөр нь ХЭНИЙХ болохыг ил
   *    тэмдэглэж, хоёр эффектийг хоёуланг нь үүгээр хаана.
   */
  const loadedPkgRef = useRef("");
  /**
   * ОДОО СОНГОГДСОН багцын түлхүүр — синхрон. ⚠️ `loadedPkgRef`-ээс ЯЛГААТАЙ:
   *    тэр нь «мөрүүд АЧААЛАГДСАН» гэсэн утгатай (loadRows дуустал `""`).
   *    Мөр ачаалахаас ХАМААРАХГҮЙ асинхрон урсгал (обьёмын илгээлт) энийг
   *    хэрэглэнэ — эс бөгөөс жижиг query нь 1000+ мөрийн хуудаснаас
   *    түрүүлж ирээд `"" !== pkg.key` гэж хаягдана (2026-09-17-ны шалгалт).
   */
  const pkgKeyRef = useRef(pkg.key);
  /* ⚠️ 2026-10-01: render дунд биш `useSyncRef`-ээр (layout эффект — БҮХ passive эффект ба
     async хариунаас ӨМНӨ commit-д тусна; уншигч нь зөвхөн эффект/async тул утга ижил). */
  useSyncRef(pkgKeyRef, pkg.key);
  /**
   * ИЛГЭЭЛТИЙН УНШИЛТ УНАСАН (2026-09-07). `null` = асуудалгүй.
   * ⚠️ Энэ нь «илгээлт байхгүй» гэсэн үг БИШ — уншиж чадаагүй гэсэн үг.
   *    Хоёрыг ялгаж байж л хэрэглэгч 0%-ийг үнэн гэж эндүүрэхгүй.
   */
  const [subReadErr, setSubReadErr] = useState<string | null>(null);
  /**
   * БУЦААГДСАН ИЛГЭЭЛТИЙН ДАВХАРЛАЛТЫН МЭДЭЭЛЭЛ — `backChg`-тэй ХАМТ тавигдана (2026-10-01).
   * `at` — илгээлтийн агшин (`payload.at`), `remapped` — шинэ жааз руу зөөгдсөн эсэх.
   * ⚠️ Хуучин индексийн зөвшөөрөлд итгэх эсэхэд л (`backOkRes`-ийн ⚠️).
   */
  const [backMeta, setBackMeta] = useState<{ at: number; remapped: boolean } | null>(null);
  /* ⚠️ 2026-10-01: `backChg` · `ovBase` ачаалах эффектээс ДЭЭР зарлагдана (тэр нь тавьдаг;
     React Compiler: «зарлагдахаас өмнө хандсан») — тайлбар нь `backOk`-ийн доор хэвээр. */
  const [backChg, setBackChg] = useState<Set<string>>(new Set());
  const [ovBase, setOvBase] = useState<Map<number, SheetRow>>(new Map());
  /**
   * ОБЬЁМЫН ТӨЛӨВ — ачаалах эффект багц солиход тэглэдэг тул түүнээс ДЭЭР (2026-10-01,
   * `useObyemState`-ийн ⚠️). Урсгал/эффект нь `useObyem`-д, ХУУЧИН байрлалдаа.
   */
  const obyemSt = useObyemState();
  const { setPvPend, setPvSub, setPvPreview, setPvErr, setPvNote } = obyemSt;
  /**
   * НООРОГИЙН СИНКИЙН ТОЛЬ — ачаалах эффектэд (2026-10-01).
   * ⚠️ `useDraftSync` нь эффектүүдийн ДАРААЛЛААР энэ эффектээс ДООР дуудагдана (ачаалах
   *    эффект ТҮҮНИЙХЭЭС ӨМНӨ ажиллах ёстой — `loadedPkgRef` · `flushRef`-ийн ⚠️), тиймээс
   *    түүний ref/setter-ийг энд шууд нэрлэвэл React Compiler «зарлагдахаас өмнө хандсан»
   *    гэж үзнэ. `useSyncRef` (layout эффект — БҮХ passive эффектээс ӨМНӨ) тольдох тул
   *    эффект ЯГ тэр render-ийн утгыг уншина; бүгд тогтвортой (ref · setState ·
   *    `useCallback`) — зан төлөв урьдын адил.
   * ⚠️ `keepDraft`/`remoteQueue`-ийг hook-ийн буцаасан утгаас шууд өөрчлөхийг React Compiler
   *    хориглодог (нэр нь `…Ref` биш) — толиос уншсан утга нь ердийн ref тул зөвшөөрөгдөнө.
   */
  const draftSyncRef = useRef<DraftSync | null>(null);

  // Багц солигдох бүрд бүдүүвч + мөрүүдийг шинээр татна. Хуучин багцын
  // хариу хожуу ирээд шинийг дарж бичихээс `alive` хамгаална.
  useEffect(() => {
    let alive = true;
    /* ⚠️ 2026-10-01: ноорогийн синкийн ref/setter толиос (`draftSyncRef`-ийн ⚠️) — `ds.` угтвартай
       (гаднах ижил нэрийг сүүдэрлэвэл React Compiler нэрийг нь солиж `…Ref` гэж танихаа больдог).
       `!` — `useSyncRef` нь layout эффект тул энэ (passive) эффектээс ӨМНӨ ҮРГЭЛЖ тавигдсан. */
    const ds = draftSyncRef.current!;
    /* `remoteQueue` угтваргүй — доорх мөрүүд урьдын текстээрээ (`draft.check`-ийн эх кодын гэрээ);
       гаднах нь `remoteQueueRef` нэртэй тул сүүдэрлэхгүй. */
    const { remoteQueue } = ds;
    /* ⚠️ ХУУЧИН ТҮЛХҮҮРИЙГ ТЭГЛЭХЭЭС ӨМНӨ АВНА (2026-09-24-ний аудит): доорх
       `flushRef` дуудлага `loadedPkgRef`-ийг шалгадаг тул урьд нь энд "" болгосны
       ДАРАА дуудагдаж, `flush` уншилтын дараа буцаад бичдэггүй байв (үхмэл зам). */
    const prevPkgKey = loadedPkgRef.current;
    loadedPkgRef.current = "";
    /* ⚠️ СЭРГЭЭЛТИЙН ТЭМДЭГ ЦЭВЭРЛЭГДЭНЭ (2026-09-23 аудит). А→Б→А хурдан
       солиход (Б-гийн мөр ачаалагдаж амжаагүй) `promptedPkgRef === 'A'`
       хэвээр үлдэж, А-д сэргээлт ДАХИН явахгүй; хадгалах эффект хоосон
       `pending`-ийг «нийтэлсэн» гэж үзээд бүх оролцогчийн ноорогийг (локал +
       ArcGIS) устгадаг байв. Одоо багц бүрийн нээлтэд сэргээлт заавал явна. */
    ds.promptedPkgRef.current = "";
    /* ⚠️ Обьёмын илгээлтийн төлөв ӨМНӨХ багцынх — шууд цэвэрлэнэ (2026-09-17):
       шинэ багцын query унавал А-гийн баннер Б дээр үлдэх байв. */
    setPvSub(null);
    setPvPreview(null);
    /* ⚠️ НООРОГИЙН ХОЁР ТУГ ЗААВАЛ ТЭГЛЭГДЭНЭ (2026-09-03-ны аудит):
       · `remoteQueue` — хуучин багцын ноорог шинэ багцын слотод бичигдэхээс;
       · `keepDraft` — «Дараа шийднэ» гэсэн шийдвэр НЭГ багцад л хамаарна.
         Үлдээвэл дараагийн багцыг нийтэлсний дараа түүний ноорог
         цэвэрлэгдэхгүй үлдэж, нийтлэгдсэн ажил «нийтлэгдээгүй» гэж дахин
         санал болгогдоно. */
    /* ⚠️ ХАЯХААС ӨМНӨ ИЛГЭЭНЭ (2026-09-24): дараалалд ХУУЧИН багцын ≤3 сек
       (debounce) засвар — батлагдсан мөр ч — үлдэж болно; `null` болговол
       тэр нь алсад ХЭЗЭЭ Ч очихгүй. `flushRef` нь хуучин `pkg.key`-тэй
       хаалт хэвээр (энэ эффект түүнийг дахин үүсгэх эффектээс ӨМНӨ ажиллана)
       тул хуучин түлхүүрээр read-merge-write хийнэ; `loadedPkgRef` зөрөх тул
       хариу нь шинэ багцын төлөвт буухгүй (fire-and-forget).
       ⚠️ 2026-09-24: түлхүүрийг ИЛ дамжуулна (`prevPkgKey`) — `flush` тэр үед
       `loadedPkgRef`-ийн зөрүүг «бичихгүй» биш «төлөв шинэчлэхгүй» гэж ойлгоно. */
    if (remoteQueue.current && remoteQueue.current.pkg !== pkg.key) ds.flushRef.current(prevPkgKey || remoteQueue.current.pkg);
    remoteQueue.current = null;
    ds.keepDraft.current = false;
    /* ⚠️ АЛСЫН БАЙДАЛ ч БАГЦАД ХАРЬЯАЛАГДАНА (2026-09-07). Үлдээвэл
       Багц 1-ийн «ArcGIS 14:20» ногоон заалт (эсвэл «хуулагдсангүй» шар
       анхааруулга) Багц 2 дээр наалдаж, шинэ багцын ажил алсад ороогүй
       байхад ХУДАЛ баталгаа болно. Шинэ багц заалтгүй эхэлж, зөвхөн
       бодит илгээлтийн дараа гарна. */
    ds.setRemoteState(null);
    /* ⚠️ Илгээлт унасны туг нь НЭГ багцынх — үлдээвэл шинэ багцад худал
       анхааруулга үүснэ. */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-10-01: татах эффект — багц/өдөр солигдоход өмнөх багцын төлөвийг синхрон тэглээд шинээр татна; ref-ийн тэглэлт · `flushRef` дуудлагатай НЭГ дараалалд (`useDraftSync`-ийн эффектүүдээс ӨМНӨ) байх ёстой тул render-д зөөвөл дараалал өөрчлөгдөнө
    setSubmitFailed(false);
    /* ⚠️ Илгээлтийн төлөв ч БАГЦАД харьяалагдана: хуучин багцын `staged`
       үлдвэл шинэ багцын илгээлт түүн дээр НЭГТГЭГДЭЖ, өөр багцын нүднүүд
       буруу payload-д орно. */
    setStaged(null);
    setStagedOid(null);
    setStagedFillMs(null);
    /* ⚠️ 2026-10-06: ГАРААР СОНГОСОН буцаалт (`resumedOid`) ч энэ ачааллын төлөв — `useFlow` зөвхөн
       багц солиход тэглэдэг тул өдөр солигдоход (`todayFillMs`) үлдэж, `staged` тэглэгдсэн ч мэдэгдлийн
       «давхарлах» товч `resumedOid === soid`-оор ТҮГЖИГДЭЖ F5 хүртэл гацдаг байв. */
    setResumedOid(null);
    /* ⚠️ Тулгагдаагүй нүдний анхааруулга нь НЭГ багцынх — үлдээвэл шинэ багцад
       худал заалт болно. */
    setUnmovedWarn([]);
    setBusy(true);
    setErr("");
    setRows([]);
    setSc(null);
    setPending({});
    setPendDate({});
    /* ⚠️ ХУВААЛЦСАН НООРОГИЙН төлөв ч БАГЦАД харьяалагдана (2026-09-08):
       үлдээвэл Багц 1-д бичсэн эзэмшил Багц 2-ын оролцогчийн жагсаалтад
       наалдаж, «Илгээх» худал түгжигдэнэ (эсвэл худал нээгдэнэ). */
    ds.mineRef.current = new Set();
    /* ⚠️ 2026-10-01: «дуусгасан» тэмдгүүд (`marks`) ЛОКАЛААР цэвэрлэгдэнэ — алсад юу ч бичихгүй */
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
    /* ⚠️ 2026-10-05: огнооны логик агшин ч БАГЦЫН төлөв (`useDraftSync.asOfAtRef`) */
    ds.asOfAtRef.current = null;
    ds.draftLiveRef.current = false;
    /* ⚠️ Нийлүүлэлтийн агшны тэмдэглэгээ ч БАГЦАД харьяалагдана (2026-09-08):
       Багц 1-ийн `t` нь Багц 2-ынхаас ИХ байвал шинэ багцын алсын ноорог
       «хуучин» гэж тооцогдож, татах мөчлөг түүнийг ХЭЗЭЭ Ч буулгахгүй —
       нөгөө оролцогчийн ажил тэр сешнд харагдахгүй үлдэнэ. */
    ds.lastMergedRef.current = 0;
    /* ⚠️ Дэмий бичилтийн таслуур ч БАГЦАД харьяалагдана — үлдээвэл шинэ багцын
       анхны бичилт хуучин багцын биетэй тэнцэж санамсаргүй алгасагдана. */
    ds.lastBodyRef.current = '';
    /* ⚠️ Инженерийн обьёмын ноорог ч БАГЦАД харьяалагдана — үлдээвэл өөр
       багцын мөрийн oid дээр буруу утга бичигдэнэ. */
    setPvPend({});
    setPvSub(null);
    setPvPreview(null);
    setPvErr("");
    setPvNote("");
    setEdit(null);
    loadSchema(pkg)
      .then(async (schema) => {
        const nb = schema.bld.length;
        /* ⚠️ `view.subOid` байвал `view.day`-г ҮЛ ТООНО (2026-09-04): илгээлт
           нь АРХИВЫН СҮҮЛИЙН жааз дээрх зөрүү тул хуучин агшин дээр
           давхарлавал хянагч огт өөр тоо харна. `day` нь зөвхөн ХУУЧИН
           (архивын OBJECTID-тай) бүртгэлийн зам дээр үлдэнэ. */
        const r = await loadRows(pkg, schema, view?.subOid ? undefined : view?.day);
        if (!alive) return;
        /* ── ИЛГЭЭЛТИЙН OVERLAY ───────────────────────────────────────────
         * Дүрэм 3 (компанийн хуудас) ба 4 (хянагчийн хуудас): архивын сүүлийн
         * жааз + илгээлтийн зөрүү.
         *
         * ⚠️ Илгээсэн тоо ДЭЛГЭЦЭЭС АЛГА БОЛОХ ЁСГҮЙ: илгээлт архивт
         *    бичигдэхээ больсон тул давхарлахгүй бол гүйцэтгэгч «миний
         *    илгээсэн ажил алга болжээ» гэж хараад дахин бөглөнө.
         *
         * ⚠️ `done|` (батлагдсан) илгээлтийг давхарлахгүй — түүний утга
         *    архивын шинэ жаазанд аль хэдийн БАЙГАА тул давхар тоологдоно.
         *
         * ⚠️ Уншилт УНАВАЛ чимээгүй (`null`) — суурь жааз нь ямар ч
         *    тохиолдолд харагдах ёстой; илгээлтгүй хуудас нь хоосон хуудсаас
         *    хамаагүй дээр.
         */
        /*
         * ⚠️ УНШИЛТЫН АЛДААГ ЯЛГАНА (2026-09-07-ны аудит, CRITICAL).
         *
         * Урьд нь `loadActiveSubmission`/`loadSubmissionByOid` (алдааг
         * ЗАЛГИДАГ хос) дуудагдаж, гадуур нь `catch { sub = null }` байв —
         * тэр хоёр нь «илгээлт БАЙХГҮЙ» ба «уншиж ЧАДСАНГҮЙ» хоёрыг ижил
         * `null` болгодог. Сүлжээ түр тасрах, токен дуусах, `tableUrl`
         * `null` буцаах агшинд overlay ХИЙГДЭХГҮЙ, хэрэглэгч архивын суурь
         * жаазыг (бүх нүд 0%) хараад «илгээсэн ажил минь алга болжээ» гэж
         * дүгнэнэ — ЯМАР Ч алдаа харагдахгүй. 2026-09-06-нд «Багц 3.1,
         * Хяналтаас БУЦААСАН, бүх нүд 0%» гэсэн бодит гомдол ирсэн.
         *
         * ⚠️ ЯГ ЭНЭ алдааг `hyanaltStore.ts` (архивын зам) ба
         * `hyanaltDetail.ts` (хянагчийн зам) дээр 2026-09-04-нд CRITICAL гэж
         * тэмдэглэн `read*` хос руу шилжүүлсэн — бөглөх хуудасны АЧААЛАХ
         * зам ганцаараа хоцорсон байв.
         *
         * ⚠️ Уншилт унавал СУУРЬ ЖААЗ ХЭВЭЭР зурагдана (хуудас хоосрохгүй),
         * гэхдээ дээр нь ИЛ анхааруулга гарч «тоо дутуу байж болзошгүй» гэдгийг
         * хэлнэ — эс бөгөөс хэрэглэгч 0%-ийг үнэн гэж үзээд дахин бөглөнө.
         */
        let sub: StagedSubmission | null = null;
        let subErr: string | null = null;
        {
          /* ⚠️ ӨНӨӨДРИЙН ИЛГЭЭЛТ Л ДАВХАРЛАГДАНА (2026-09-07): өдөр бүр
             тусдаа `sub|` мөртэй болсон тул нэг багцад олон идэвхтэй илгээлт
             зэрэг оршино. Бүгдийг давхарлавал өчигдрийн нүд өнөөдрийн
             хуудсанд суух ба `publish`-ийн `mergeBase`-аар payload-д ДАХИН
             орж, батлагдахад архивт ХОЁР УДАА тоологдоно. Өчигдрийн
             батлагдаагүй илгээлт нь ӨӨРИЙН хяналтын мөрөөрөө явж, өөрөө
             архивт орно — гүйцэтгэгч түүнийг «өөр өдрийн илгээлт хянагдаж
             байна» мэдэгдлээс хардаг.

             ⚠️ АЛДААГ ЯЛГАДАГ хос (2026-09-07-ны гүн аудит, CRITICAL):
             чимээгүй `null` болговол сүлжээ түр тасрах, токен дуусах агшинд
             илгээсэн ажил дэлгэцээс алга болж, хэрэглэгч «ажлаа алдсан» гэж
             дүгнэн дахин бөглөнө. `hyanaltStore` ба `hyanaltDetail` нь
             2026-09-04-нд ижил шалтгаанаар `read*` руу шилжсэн — бөглөх
             хуудасны ачаалах зам ганцаараа хоцорч байсныг зассан. */
          const sr = view?.subOid
            ? await readSubmissionByOid(view.subOid)
            : await readActiveSubmission(pkg.key, todayFillMs);
          if (sr.ok) sub = sr.sub;
          else subErr = sr.error;
          /*
           * ⚠️ БУЦААГДСАН ИЛГЭЭЛТ — ӨДӨР СОЛИГДСОН Ч СЭРГЭЭНЭ (2026-09-08,
           * 100% аудитын CRITICAL #3 «Буцаагдсан илгээлт МАРГААШ засагдахгүй»).
           *
           * Өнөөдрийн түлхүүрээр илгээлт олдоогүй (`sub == null`) БӨГӨӨД энэ
           * хуудсын хяналтын мөр гүйцэтгэгчийн гар дээр (`OWNER === 'company'`
           * — инженер буцаасан) байвал тэр илгээлтийг `Эх_мөрийн_дугаар`-аар
           * уншиж давхарлана. Урьд нь `readActiveSubmission(todayFillMs)` нь
           * ЗӨВХӨН өнөөдрийн мөрийг хайдаг тул 09-04-нд буцаагдсан илгээлтийг
           * 09-05-нд нээхэд гүйцэтгэгч БҮХ нүдийг 0% хараад «юуг засах вэ» гэж
           * мэдэхгүй, дахин бөглөдөг байв (амьд: oid 59·60 яг энэ төлөвт).
           *
           * ⚠️ ДАВХАР ТООЛОГДОХГҮЙ: буцаагдсан илгээлт архивт ОРООГҮЙ (архивт
           *    зөвхөн `Шилжүүлсэн` ордог) тул давхарлах нь давхардал биш.
           *    `publish` нь энэ илгээлтийн ӨӨРИЙН өдрийн түлхүүрээр (`staged.
           *    payload.fillMs`) UPDATE хийнэ — шинэ өдрийн мөр үүсгэхгүй.
           *
           * ⚠️ `flowRef` нь `hyRows` ачаалагдсаны дараа л дүүрдэг — мөр
           *    ачаалагдах агшинд хоосон байж болно; тэр үед `otherDaysInReview`
           *    мэдэгдэл хэвээр, дараагийн ачаалалтад (багц солиод буцах) сэргэнэ.
           *    Хянагчийн харагдацад (`view`) хамаарахгүй.
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
        /* ⚠️ 2026-10-04 дахин аудит (#5): хариу тасарсан илгээлтийн танигчийг ЭНД (төлөв тавихаас ӨМНӨ)
           шалгана — доорх `setStaged`…`setRows` дунд `await` орвол дутуу төлөвтэй зурагдана. */
        const infR = !view ? readInflight(pkg.key) : null;
        const infF = infR ? await findNonce(pkg.key, infR.nonce, infR.at - 86_400_000) : null;
        if (!alive) return;
        setSubReadErr(subErr);
        /* ⚠️ `Шилжүүлсэн` (батлагдсан) урсгалын дор давхарлахгүй: тэр мөчлөг
           дууссан бөгөөд агуулга нь архивт орсон. Хянагчийн харагдац
           (`view.subOid`) нь ТУХАЙН илгээлтийг заасан тул урсгалаас
           хамаарахгүй. */
        const f = flowRef.current;
        /* ⚠️ БАГЦЫН ТҮЛХҮҮР ЗААВАЛ ТААРНА: `view.subOid` нь гаднаас (хяналтын
           жагсаалтаас) ирдэг дугаар тул буруу заасан бол өөр багцын зөрүү энэ
           хуудасны мөрүүд дээр буух эрсдэлтэй — ObjectID нь санамсаргүй
           таарвал ХУДАЛ тоо гарна. */
        /* ⚠️ `residual` (2026-09-25 аудит): батлах явцад дахин илгээсний ҮЛДЭГДЭЛ нэмэлт
           (`hyanaltStore.archiveSubmission` → `residualAfterArchive`) — архивт ОРООГҮЙ атлаа
           урсгал нь «Шилжүүлсэн» тул урьд нь давхарлагдахгүй, дараагийн илгээлтэд дарагдаж
           алга болдог байв. Тэр тугтай мөрийг урсгалаас үл хамааран давхарлана. */
        const useSub = !!sub && !sub.done && sub.payload.pkgKey === pkg.key
          && (!!view?.subOid || !f || f[HF.status] !== STATUS.transferred || sub.payload.residual === true);
        /* ⚠️ 2026-10-04 дахин аудит (#1): хуучин (`rowOcc`-гүй) илгээлтийн давтамжийг суурь жаазаас нөхнө —
           `staged` ч нөхсөн payload-тай суух тул `publish`-ийн `movePayload` гацахгүй (`ensureFrameOcc`). */
        if (useSub && sub) {
          const p2 = await ensureFrameOcc(pkg, schema, sub.payload, r.rows);
          if (!alive) return;
          if (p2 !== sub.payload) sub = { ...sub, payload: p2 };
        }
        const ov = useSub && sub ? overlaySubmission(r.rows, sub.payload, schema, nb) : null;
        /* ⚠️ ТУЛГАГДААГҮЙ НҮД БАЙВАЛ ИЛ ХЭЛНЭ (дээрх `unmovedWarn`-ийн ⚠️) —
           чимээгүй орхивол гүйцэтгэгч ажлаа алдсанаа мэдэхгүй, зөвхөн ерөнхий
           менежерийн батлах алхам дээр багц бүхэлдээ гацна. */
        setUnmovedWarn(ov && ov.unmoved > 0 && sub
          ? describeUnmoved(ov.unmovedKeys, sub.payload.rowKeys, schema.bld)
          : []);
        // ⚠️ Мөр нь ЭНЭ багцынх болсныг ноорогийн эффектүүдэд мэдэгдэнэ.
        loadedPkgRef.current = pkg.key;
        setSc(schema);
        /* ⚠️ `staged` нь OVERLAY-ААС ХАМААРАХГҮЙ (2026-09-04): идэвхтэй
           (`sub|`) мөр байвал ЗААВАЛ төлөвт суух ёстой — эс бөгөөс `publish`
           дахь «өөр хэрэглэгч илгээсэн» шалгуур (`act.at > staged.at`) тэр
           мөрийг ХЭЗЭЭ Ч танихгүй болж, хэрэглэгч мөнхөд «өөр хэрэглэгч
           илгээсэн байна» гэсэн алдаанд гацна. Давхарлах эсэх нь ТУСДАА
           шийдвэр (`useSub`). */
        /*
         * ⚠️ БУЦААЛТЫН НҮДНИЙ ТЭМДЭГЛЭГЭЭ ЭНД Ч ЗААВАЛ (2026-09-22-ны засвар).
         *    Урьд нь зөвхөн «хожуу давхарлалт»-ын эффектэд тавигддаг байсан
         *    бөгөөд тэр нь `staged` БАЙХГҮЙ үед л ажилладаг: хуудсыг дахин
         *    нээхэд илгээлт ЭНЭ замаар давхарлагдаж `staged` суудаг тул
         *    тэмдэглэгээ ХООСОН үлдэж, өөрчилсөн нүд бүгд зүгээр л `dirty`
         *    (ногоон) болж, зөвшөөрөгдсөн ↔ зөвшөөрөгдөөгүй нь ЯЛГАРАХГҮЙ
         *    байв — яг тэр гомдол.
         */
        setBackChg(ov && sub ? changedKeys(r.rows, ov, schema.bld) : new Set());
        /* ⚠️ 2026-10-01: хуучин (индексийн) зөвшөөрөлд итгэх эсэхийн мэдээлэл (`backMeta`-ийн ⚠️) */
        setBackMeta(ov && sub ? { at: sub.payload.at, remapped: ov.remapped } : null);
        setOvBase(ov ? new Map(r.rows.map((x) => [x.oid, x] as const)) : new Map());
        setStaged(sub && !sub.done && sub.payload.pkgKey === pkg.key ? sub : null);
        /*
         * ⚠️ 2026-10-04 аудит (#3): ӨМНӨХ «ИЛГЭЭХ»-ИЙН ХАРИУ ТАСАРСАН бол (`readInflight`) — серверийн
         *    илгээлтэд тэр оролдлогын `nonce` байвал илгээлт БУУСАН: илгээгдсэн нүдний баримтыг
         *    (`rcptRef`) сэргээлтээс ӨМНӨ тавина — `pickDraft` тэдгээрийг ноорогоос хасна (өөрчлөгдсөн
         *    бол ЗӨРҮҮ). Үгүй бол илгээлт БУУГААГҮЙ — тэмдгийг арилгаад ноорог хэвээр (дахин илгээнэ).
         *    Уншилт унасан (`subErr`) эсвэл өөр өдрийнх бол ШИЙДЭХГҮЙ — «Илгээх» дахин шалгана.
         */
        /*
         * ⚠️ 2026-10-04 дахин аудит (#5): `sub|` мөрөөр л биш — БАТЛАГДСАН (`done|`) мөрөөс ч хайна
         *    (`findNonce`). Урьд нь илгээлт буусны дараа батлагдсан бол олдохгүй → тэмдэг арилж, «Илгээх»
         *    архивт орсон нүднүүдийг ДАХИН илгээдэг байв. Түлхүүрийг одоогийн жаазад ч зөөж баримт тавина
         *    (`inflightKeys` — илгээх агшны хуудасны түлхүүр жааз солигдсоны дараа олдохгүй).
         */
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
              say(tr('Өмнөх «Илгээх» сервер дээр АМЖИЛТТАЙ хадгалагдсан байсан (хариу нь тасарсан) — илгээгдсэн нүдийг ноорогоос хасав, давхар илгээгдэхгүй.'));
              clearInflight(pkg.key);
            } else if (fr.ok && mayClearInflight(inf)) {
              /* ⚠️ 2026-10-06: өөр табын ЯВЖ БУЙ илгээлтийн тэмдгийг арчихгүй (`mayClearInflight`-ийн ⚠️) */
              clearInflight(pkg.key);
            }
          }
        }
        setRows(ov ? ov.rows : r.rows);
        /* ⚠️ `null ≠ 0`: илгээлт «Шинэчлэгдсэн огноо»-г хөндөөгүй бол
           `ov.asOf` нь `null` — тэр үед архивынхыг АВНА, 0 болгохгүй. */
        setAsOf(ov?.asOf ?? r.asOf);
        setAsOfOrig(ov?.asOf ?? r.asOf);
        setSnapDay(r.snapshot != null ? msToDay(r.snapshot) : "");
        setSnapMs(r.snapshot ?? null);
        // ⚠️ Анх нээхэд БҮХ давхарга ДЭЛГЭЭСТЭЙ (хэрэглэгчийн шийдвэр,
        // 2026-08-19): урьд нь гүн 2 хүртэл эвхээстэй байсныг болив —
        // бөглөх ажлын мөрүүд шууд харагдах ёстой. Багц солиход мөн адил.
        // (1400 мөр × 60 багана зурагдана; удаан санагдвал давхаргын
        // товчнуудаар 1–4 болгож хумина.)
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
    /* ⚠️ `view` бүхлээр биш — зөвхөн `day`/`subOid` солигдоход дахин ачаална
       (объект шинэчлэгдэх бүрд бөглөж буй хуудас тэглэгдэхгүйн тулд). */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg, view?.day, view?.subOid, todayFillMs]);

  /**
   * ӨНЧИН ИЛГЭЭЛТ — хадгалагдсан атлаа хяналтын бүртгэлгүй.
   *
   * ⚠️ ЯАГААД (2026-09-04-ний аудит): `submitForReview` унасан үед гарах
   *    «⚠️ хяналтад бүртгэгдсэнгүй» анхааруулга ба «Хяналтад илгээх» товч нь
   *    ЗӨВХӨН ЭНЭ СЕШНИЙ төлөвөөс (`submitFailed`, `stagedOid`) уншигддаг
   *    байв. Хэрэглэгч хуудсаа хааж дахин нээхэд багц ачаалах эффект тэр
   *    гурвуулангийг тэглэдэг тул анхааруулга ч, товч ч алга болно — `sub|`
   *    мөр амьд, тоо нь overlay-гаар ХАРАГДСААР байх тул гүйцэтгэгч «илгээсэн»
   *    гэж бодно; хяналтын дараалалд мөр байхгүй тул хэн ч харахгүй, архивт
   *    хэзээ ч орохгүй. Тиймээс ӨГӨГДЛӨӨС нь таньж, сэргээх зам нээнэ.
   *
   * ⚠️ Жагсаалт ачаалагдаагүй (`hyLoading`) эсвэл АЛДААТАЙ (`hyErr`) үед
   *    ДҮГНЭХГҮЙ — хоосон жагсаалт нь «бүртгэл алга» гэсэн баталгаа биш.
   * ⚠️ `registeredRef` — дөнгөж бүртгүүлсэн илгээлтийг «өнчин» гэж
   *    андуурахгүй (жагсаалтын дахин ачаалалт асинхрон).
   */
  useEffect(() => {
    if (view || !staged || staged.done) return;
    if (hyLoading || hyErr) return;
    if (registeredRef.current.has(staged.oid)) return;
    /* ⚠️ 2026-10-04: ижил `sheetOid`-тай ЯМАР Ч мөр биш — одоогийн тойрог хянагчийн гар
       дээр уу, эсвэл буцаалтаас ХОЙШ дахин илгээгээд бүртгэгдээгүй юу (`needsRegistration`). */
    if (!needsRegistration(hyRows as unknown as Record<string, unknown>[], staged.oid, dayTagOf(staged.payload.fillMs), staged.at)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-10-01: `registeredRef` (ref)-ээс уншдаг тул render-д бодох боломжгүй; туг нь `publish`/`resend`-ээр ч тавигддаг (наалддаг) тул гаргалгаа болговол утга өөрчлөгдөнө
    setSubmitFailed(true);
    setStagedOid(staged.oid);
    setStagedFillMs(staged.payload.fillMs);
  }, [staged, hyRows, hyLoading, hyErr, view]);

  /**
   * БУЦААГДСАН ИЛГЭЭЛТИЙН ХОЖУУ ДАВХАРЛАЛТ (2026-09-21).
   *
   * ⚠️ ЯАГААД: ачаалах эффект буцаагдсан илгээлтийг `flowRef`-ээс уншдаг ч
   *    `flow` нь `useHyanaltRows`-оос ХОЖУУ ирдэг — хуудас анх нээгдэхэд
   *    мөрүүд ачаалагдах агшинд `flowRef.current` ихэвчлэн `null` тул тэр
   *    зам алгасагдаж, гүйцэтгэгч буцаагдсан илгээлтээ 0%-тэй хуудсаар
   *    харна (багц солиод буцах хүртэл). Энэ эффект хяналтын мөр ирмэгц
   *    НЭГ УДАА (`sheetOid` тутамд) тэр илгээлтийг уншиж давхарлана.
   * ⚠️ Зөвхөн `staged == null` үед — өнөөдрийн идэвхтэй илгээлт байвал
   *    ачаалах эффект аль хэдийн давхарласан. Хянагчийн харагдацад (`view`)
   *    хамаарахгүй. Мөр ачаалагдаагүй/өөр багцынх бол хүлээнэ.
   * ⚠️ `pending` хөндөгдөхгүй: overlay нь суурь мөрийн утга тул хэрэглэгчийн
   *    энэ хооронд бичсэн нүд ногоон хэвээр дээр нь үлдэнэ.
   */
  const returnedSheetOid = flow && OWNER[flow[HF.status]] === 'company' && flow[HF.status] !== STATUS.transferred
    ? Number(flow[HF.sheetOid])
    : NaN;
  /*
   * ══════ БУЦААГДСАН ИЛГЭЭЛТИЙН НҮДНИЙ ЯЛГАА (2026-09-22) ══════
   *
   * ⚠️ ЯАГААД (хэрэглэгчийн шаардлага): хянагч нүд БҮРЭЭР зөвшөөрдөг
   *    (`Guitsetgel.toggleOk`) бөгөөд «зөвшөөрсөн 7/10» гэж тоологддог
   *    атал тэр сонголт ЗӨВХӨН React state-д байсан тул буцаагдсан
   *    гүйцэтгэгчид өөрчилсөн БҮХ нүд ИЖИЛ харагддаг байв — аль нь
   *    зөвшөөрөгдсөн, аль нь засах шаардлагатайг ялгах ямар ч зам байгаагүй.
   *
   * ⚠️ ХОЁР ОЛОНЛОГ, ХОЁР ЭЗЭН: `backChg` (өөрчлөгдсөн нүд) нь АЧААЛАХ
   *    эффектүүдэд тавигдана — тэд л `overlaySubmission`-ий `ov.rows`-ыг
   *    мэднэ. `backOk` (зөвшөөрөгдсөн нь) нь ЭНЭ эффектэд, хяналтын мөрөөс.
   *    ⚠️ ЭНД `backChg`-Г ТЭГЛЭХГҮЙ: `flow` нь `useHyanaltRows`-оос ХОЖУУ
   *    ирдэг тул ачаалах эффектийн тавьсныг шууд арчиж, бүх өнгө алга
   *    болдог байв (2026-09-22-ны гомдол).
   *
   * ⚠️ Түлхүүр: `backChg` нь тэр илгээлтэд ӨӨРЧЛӨГДСӨН нүд (улаан
   *    хүрээ), `okKeys` нь тэдгээрээс ЗӨВШӨӨРӨГДСӨН нь (ногоон ✓).
   *    Хоёулаа ижил ``${мөр}:${блок}`` түлхүүртэй — `hyanaltDetail.Change`
   *    ба хянагчийн `okKeys`-тэй ИЖИЛ формат.
   *
   * ⚠️ ЗӨВХӨН БУЦААГДСАН үед: батлагдсан (`Шилжүүлсэн`) илгээлтэд
   *    тэмдэглэгээ хэрэггүй — бүгд өнгөрсөн. Хянагчийн харагдацад (`view`)
   *    мөн хамаарахгүй — тэнд өөрийн `view.changed`/`view.ok` ажиллана.
   */
  /* ⚠️ 2026-09-30: `useMemo` — урьд `useState` + эффект дотор `setBackOk` байв; утга нь
     (view · flow · rows · resumedOid · hyRows)-ийн ЦЭВЭР гаралт тул render-д шууд бодно (нэг
     render хоцордог зөрүү арилна, өөр өөрчлөлт үгүй). */
  const backOkRes = useMemo(() => {
    /* ⚠️ ЗӨВХӨН `backOk` — `backChg` нь ачаалах эффектүүдийнх (доорх ⚠️) */
    /* ⚠️ ГАРААР СОНГОСОН буцаалт (`resumedOid`, 2026-09-24-ний аудит): `flow` нь
       өнөөдрийн илгээлт байж болох тул ногоон нүдийг ТЭР ИЛГЭЭЛТИЙН (sheetOid
       таарах) сүүлийн тойргийн мөрөөс авна — урьд нь `flow`-ийн `okCells` өөр
       өдрийн илгээлтэд наалддаг байв. */
    let src = flow;
    if (resumedOid != null) {
      src = null;
      for (const r of hyRows) {
        if (Number(r[HF.sheetOid]) !== resumedOid) continue;
        if (!src || r.__oid > src.__oid) src = r;
      }
    }
    const none = { ok: new Set<string>(), unknown: 0 };
    if (view || !src) return none;
    /* Зөвхөн гүйцэтгэгчийн гар дээрх, батлагдаагүй мөр */
    if (OWNER[src[HF.status]] !== 'company' || src[HF.status] === STATUS.transferred) {
      return none;
    }
    /* ⚠️ Эвдэрсэн JSON → ногоон БИШ (fail-closed): «бүгд зөвшөөрөгдсөн» гэж
       үзвэл гүйцэтгэгч засах ёстой нүдээ алдана. 2026-10-01: «мэдэхгүй» гэж
       тоологдож доор «дахин хянах» мэдэгдэл гарна. */
    /*
     * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас — ШИЙДВЭР): зөвшөөрөл МӨРИЙН ТОГТВОРТОЙ
     *    түлхүүрээр (`hyanaltOkCells`) — `rows`-ийн `{oid, sid}`-тэй тулгана; индекс
     *    гулсахгүй. ХУУЧИН индексийн хэлбэрт (`${i}:${шошго}`, 2026-09-23 #15) ЗӨВХӨН
     *    мөрийн дараалал бичигдсэн агшныхтай ижил нь баттай үед итгэнэ: давхарлалт
     *    шинэ жааз руу зөөгдөөгүй (`!backMeta.remapped`) БӨГӨӨД илгээлт буцаалтаас
     *    хойш шинэчлэгдээгүй (`at ≤ инженерийн буцаасан огноо`). Эс бөгөөс
     *    `unknown` — ногоон болгохгүй, «дахин хянах» мэдэгдэл (`okUnknown`).
     */
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
      if (r) byOid.add(`${r.oid}${k.slice(cut)}`);
    }
    return { ok: byOid, unknown: res.unknown };
  }, [view, flow, rows, resumedOid, hyRows, backMeta]);
  const backOk = backOkRes.ok;
  /* `backChg` — ачаалах эффектээс ДЭЭР зарлагдсан (2026-10-01). */
  /**
   * `ovBase` — ДАВХАРЛАЛТЫН СУУРЬ МӨРҮҮД (oid → архивын мөр) — өөрчлөгдсөн нүдний `title`-д
   * «өмнөх: X · энэ удаа: Y · нийт: Z» бичихэд (2026-09-25, нэмэлтийн горим).
   * ⚠️ `backChg`-тэй ХАМТ тавигдана (ачаалах эффект · хожуу давхарлалт ·
   *    `resumeReturned`); суурьгүй бол `title` хуучин хэвээр.
   * ⚠️ 2026-10-01: зарлалт нь ачаалах эффектээс ДЭЭР (`backChg`-тэй хамт).
   */

  /* ⚠️ 2026-10-01: доорх хожуу давхарлалтын эффект хэрэглэдэг тул ТҮҮНЭЭС ДЭЭР (урьд нь доор) */
  const nBld = sc?.bld.length ?? 0;

  const lateOverlayRef = useRef<number>(NaN);
  /** Хожуу давхарлалтын уншилт унасан/таслагдсан бол эффектийг ДАХИН асаах цохилт. */
  const [lateRetry, setLateRetry] = useState(0);
  useEffect(() => {
    if (view || busy || staged || !sc || !rows.length) return;
    if (loadedPkgRef.current !== pkg.key) return;
    if (!Number.isInteger(returnedSheetOid) || returnedSheetOid <= 0) return;
    if (lateOverlayRef.current === returnedSheetOid) return;
    /* ⚠️ Тэмдэглэгээг ЭХЛЭХЭД тавина (давхар уншилтаас хамгаална), харин
       УНАСАН/ТАСЛАГДСАН бол буцааж тэглэнэ (2026-09-21-ний дахин аудит).
       Урьд нь async-аас өмнө тавиад унасан ч үлдээдэг тул сүлжээ нэг удаа
       тасрахад буцаагдсан илгээлт F5 хүртэл ХЭЗЭЭ Ч давхарлагддаггүй байв;
       мөн хамаарал (rows.length г.м.) хөдлөхөд `alive=false` болж хариу
       хаягддаг ч тэмдэглэгээ «дууссан» гэж үлддэг байв. Одоо унавал
       `REMOTE_RETRY_MS`-ийн дараа, таслагдвал шууд `lateRetry`-ээр дахин. */
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
        /* ⚠️ 2026-10-06 аудит: түүхий серверийн мөрийг (`Token Required` г.м.) шууд харуулахгүй */
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
   * ⚠️ ӨӨР БАГЦЫН ОГНООГООР НӨХӨХГҮЙ (2026-09-06, хэрэглэгчийн шууд заавар:
   * «өөр багцын огноо авч огт болохгүй — огноо тохируулаагүй бол хоосон
   * өгөгдлөөсөө ажиллах ёстой»).
   *
   * Урьд нь энд `if (asOf == null && dates.length) setAsOf(сүүлийн огноо)`
   * гэсэн нөхөлт байв. `sheetDates()` нь БҮХ багцын `buglusun_ognoo`-г
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

  /* ⚠️ ЛОКАЛ НЭМСЭН МӨР БАЙХГҮЙ (2026-09-24): `adds`/`mergeIncomingAdds`/`withAdds`
     (`insertAdds`) хасагдав — мөр нэмэх нь «Хуваарь»-д, батлагдсан мөр серверээс
     ердийн мөр болж ирнэ. `rowsAll` нэр доорх олон хэрэглээнд хэвээр — одоо
     ЯГ `rows` (серверийн мөр + давхарласан илгээлтийн сөрөг oid-той мөр). */
  const rowsAll = rows;
  const addedOids = useAddedOids(pkg, rowsAll);

  /* ── ХУВААРИЙН САРЫН ЗАДАРГАА (`huvaari_obyem`) ──────────────────────
   * ⚠️ Задаргаатай ажлын ТӨЛӨВЛӨГӨӨТ хувь нь сарын обьёмоос (S-муруй)
   *    бодогдоно; задаргаагүйд огноогоор шугаман интерполяци ХЭВЭЭР.
   * ⚠️ Уншилт УНАВАЛ чимээгүй: задаргаа бол нэмэлт нарийвчлал, хуудас
   *    түүнгүйгээр бүрэн ажиллах ёстой.
   */
  /* ⚠️ 2026-09-30: БАГЦААР ТҮЛХҮҮРЛЭСЭН төлөв — багц солиход шууд хоосон, эффект доторх
     `setObPlan(new Map())` хасагдав (setState зөвхөн уншилт буусны дараа). Утга ижил. */
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
      /* ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр, «бүгдийг зас»): сар доторх төлөвлөгөөт хувь
         АЖЛЫН жинхэнэ эхлэх–дуусах өдрөөр (`planPctFromMonths`-ийн 3 дахь аргумент) —
         `bagtsSheet.planAt`-тай нэг томъёо; сарын эхэнд ХУДАЛ «хоцорсон» арилна. Огноо
         хоосон/эвдэрсэн бол функц өөрөө бүтэн сараар (хуучин зам). */
      /* ⚠️ Илгээгээгүй огнооны засвар (`pendDate`) ДАВАМГАЙЛНА — хүснэгтийн `planAt` замтай ижил */
      const ps = pendDate[`${row.oid}:${b}:s`];
      const pe = pendDate[`${row.oid}:${b}:e`];
      const start = ps != null ? dayToMs(ps) : (row.start[b] ?? null);
      const end = pe != null ? dayToMs(pe) : (row.end[b] ?? null);
      return m ? planPctFromMonths(m, asOf, { start, end }) : null;
    },
    [obPlan, sc, asOf, pendDate],
  );

  /*
   * ⚠️ `asOf` нь `null` БАЙЖ БОЛНО — тэр үед ч хүснэгт бодогдоно (2026-09-06).
   * Урьд нь `asOf == null` бол `[]` буцаадаг байсан тул огноогүй хуудас
   * БҮХЭЛДЭЭ хоосон харагдаж, тэр нь дээрх «өөр багцын огноогоор нөхөх»
   * буруу шийдлийг шаарддаг байв. Одоо `computeAll` огноогүйг зөвшөөрч,
   * зөвхөн ТӨЛӨВЛӨГӨӨТ хувийг `null` болгоно — обьём, бодит гүйцэтгэл, жин,
   * мөнгөн дүн бүгд хэвийн гарна.
   * ⚠️ Merge 2026-09-06 (tezu-bonu): задаргааны `planPct` нь `asOf == null`
   *    үед өөрөө `null` буцаадаг тул огноогүй хуудсанд S-муруй ч мөн
   *    төлөвлөгөөгүй — хоёр дүрэм зөрчилдөхгүй.
   */
  /**
   * ⚠️ БЛОКГҮЙ БАГЦАД Ч БОДНО (2026-09-16-ны гүн шалгалт). Урьд нь
   *    `!nBld ? []` гэсэн товчлол байв — блокгүй 8 багц (5.x · 6.x · 10) дээр
   *    `calc` хоосон массив болж, доорх `vis` нь `calc[i]`-ээр шүүдэг тул
   *    БҮХ мөр хасагдаж, хуудас ТАЙЛБАРГҮЙ цагаан харагддаг байлаа
   *    («хүснэгт эвдэрсэн» гэж уншигдана).
   *
   *    Гэтэл хүснэгтийн 14 багана (№ · ажил · жин · обьём · өртөг · мөнгө …)
   *    блокоос ҮЛ ХАМААРНА: `computeAll` нь `n = 0` үед H · C · D-г хэвийн
   *    бодно (Багц 5.1-ийн мөнгөн дүн 16.7 тэрбум ₮ зөв гарсныг хэмжсэн).
   *    Зөвхөн блокоос бодогддог E · I · J · K нь `null` («мэдээлэлгүй») болно.
   *
   * ⚠️ БЛОКТОЙ 10 БАГЦАД НӨЛӨӨГҮЙ: тэдгээрт `nBld` нь 4–22 тул энэ салаа
   *    хэзээ ч ороогүй — өмнө нь ч `computeAll` дуудагддаг байсан.
   */
  const calc = useMemo(
    /* ⚠️ `"inc"` (2026-09-25): `pending` нь НЭМЭЛТ — нүдэнд суурь + нэмэлт харагдана */
    () => computeAll(rowsAll, nBld, asOf, pending, pendDate, hasObyem, planPct, "inc"),
    [rowsAll, nBld, asOf, pending, pendDate, hasObyem, planPct],
  );

  const { planCount, grpAOpts, grpBOpts, grpBEff, hidden, vis } = useRowFilter({ rowsAll, calc, nBld, today, grpA, grpB, collapsed, byPlan });
  const { scrollRef, tbodyRef, rowHRef, onScroll, hitKey, winFrom, winTo } = useVirtualWindow({ vis, edit, view });

  const toggle = (oid: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(oid)) n.delete(oid);
      else n.add(oid);
      return n;
    });

  /**
   * ⚠️ 2026-10-07: ҮСРЭХ МӨР НУУГДСАН бол ил гаргана. Хяналтын харагдацад ч `byPlan`
   *    анхнаасаа асаалттай (ачаалах бүрд `setByPlan(true)`) тул «Хуваарийн дагуу» өнөөдөр
   *    идэвхгүй ажлын өөрчлөгдсөн нүд рүү дарахад `useVirtualWindow`-ийн үсрэлт `vis`-ээс
   *    олохгүй ЧИМЭЭГҮЙ зогсдог байв; бүлгийн шүүлт ба эвхээстэй бүлэг мөн адил. Шүүлтийг
   *    тайлж, эцэг бүлгүүдийг дэлгэмэгц `vis` шинэчлэгдэж тэр эффект өөрөө биелнэ.
   *    Нэг хүсэлтэд нэг л удаа (`jumpN`); харагдаж байгаа мөрд юу ч хөндөхгүй.
   */
  const jumpN = view?.jump?.n ?? -1;
  const unhideJumpRef = useRef(-1);
  useEffect(() => {
    const j = view?.jump;
    if (!j || unhideJumpRef.current === jumpN) return;
    unhideJumpRef.current = jumpN;
    if (!hidden[j.row] || !rowsAll[j.row]) return;
    /* eslint-disable react-hooks/set-state-in-effect -- ⚠️ 2026-10-07: `view.jump` нь ГАДНЫ нэг удаагийн хүсэлт (үйл явдал) — шүүлтийг эндээс л тайлна */
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

  const { otherPct, pkgPct } = usePkgPct({ pkg, sc, nBld, rowsAll, calc, asOf, hasObyem, planPct, dirtyCount, ovBase });
  /* ⚠️ 2026-10-01: `setPv*` — ачаалах эффектээс ДЭЭРХ `obyemSt`-ээс (`useObyemState`-ийн ⚠️) */
  const {
    pvPend, pvSub, pvPreview, pvBusy, pvErr, pvNote,
    pvCells, sendObyem, decideObyemHere, withdrawObyemHere, pvReturned,
    /* ⚠️ 2026-10-09: гацсан (хэсэгчлэн бичигдсэн) илгээлт — тэмдэг · буцаах; батлагдсан илгээлтийн алгассан нүд */
    partial: pvPartial, returnStuck: pvReturnStuck, note: pvApprovedNote,
  } = useObyem({ st: obyemSt, pkg, pkgKeyRef, rows, sc, user, locked, todayFillMs, setRows });

  /**
   * ИНЖЕНЕРИЙН ОБЬЁМЫН ноорог (`pvPend`) — ХАМГААЛАЛТАД тоологдоно.
   *
   * ⚠️ ЯАГААД `dirtyCount`-д НИЙЛҮҮЛЭХГҮЙ (2026-09-08): `dirtyCount` нь
   *    ГҮЙЦЭТГЭЛИЙН илгээлтийн тоолуур — «Илгээх» товч, Ctrl+S (`publish`),
   *    «ногоон: илгээгээгүй (N)» гурвуулаа түүнээс уншдаг. Обьёмын ноорог
   *    тэнд орвол гүйцэтгэлийн ХООСОН илгээлт үүсгэх зам нээгдэнэ (обьём нь
   *    ТУСДАА 2 шатат урсгалтай).
   *
   * ⚠️ ГЭХДЭЭ АЛДАГДАХААС ХАМГААЛНА: `pvPend` нь ноорогт (localStorage/
   *    ArcGIS) ОГТ хадгалагддаггүй бөгөөд багц солиход `setPvPend({})`-ээр
   *    устдаг. Урьд нь `dirtyCount === 0` тул таб хаахад хөтөч юу ч асуухгүй,
   *    багц солиход ч асуухгүй — инженерийн хагас цагийн ажил нэг товшилтоор,
   *    ямар ч мэдэгдэлгүй алга болдог байв. Тиймээс `confirmSwitch` энэ
   *    нийлбэрээр хамгаална; `beforeunload` нь 2026-09-08-наас ХАДГАЛАЛТЫН
   *    төлөвөөр (алсад амжаагүй · унасан · `pvDirty`) асна — тэнд `pvDirty`
   *    тусдаа орно.
   */
  const pvDirty = Object.keys(pvPend).length;
  /* ⚠️ 2026-10-05: өдөр солигдох шалгалт (интервал) хамгийн сүүлийн утгыг уншихад */
  const pvDirtyRef = useRef(0);
  useEffect(() => { pvDirtyRef.current = pvDirty; }, [pvDirty]);
  const unsavedCount = dirtyCount + pvDirty;

  /**
   * ОДООГИЙН ИЛГЭЭЛТИЙН ЗОРИЛТ — `publish`-ийн `fillMs` сонголттой ЯГ ижил нөхцөл (2026-10-04 аудит, #6).
   * `[буцаагдсан илгээлтийн OBJECTID, fillMs]` эсвэл `null` (= өнөөдрийн шинэ илгээлт).
   * ⚠️ Ноорогт хадгалагдана (`Draft.tgt`) — F5/багц солиход `resumedOid` тэглэгдсэн ч засвар нь
   *    ӨНӨӨДРИЙН илгээлтэд чимээгүй нийлэхгүй (`tgtMismatch` — «Илгээх» түгжинэ).
   */
  /* ⚠️ 2026-10-04 дахин аудит (#10): ТООГООР тогтворжуулна — урьд нь `flow`/`staged` объект шинэчлэгдэх бүрд
     шинэ массив болж хадгалах эффектийг (хамаарал) дэмий дахин ажиллуулдаг байв. */
  const curTgtOn = !!staged && !staged.done && ((!!flow && OWNER[flow[HF.status]] === 'company') || resumedOid === staged.oid);
  const curTgtOid = curTgtOn && staged ? staged.oid : 0;
  const curTgtMs = curTgtOn && staged ? staged.payload.fillMs : 0;
  const curTgt = useMemo<[number, number] | null>(
    () => (curTgtOid ? [curTgtOid, curTgtMs] : null),
    [curTgtOid, curTgtMs],
  );
  /**
   * ⚠️ 2026-10-09: НҮДНИЙ DOM ЭЛЕМЕНТҮҮД (`${oid}:${блок}` → `td`) — ЗӨВХӨН одоо зурагдсан мөрүүд (виртуал
   *    цонх). Огнооны түлхүүр (`:s|e`) тооцохгүй. `useDraftSync`-ийн «харагдаж буй нүд өөрчлөгдсөн»
   *    мэдэгдэл ба «өөр хүн өөрчилсөн өөрийн нүд»-ийн богино тодруулгад.
   */
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
  /* ⚠️ Анивчилт (`chgHit`, 1.8 сек) — React className-ийг дараагийн өөрчлөлтөөр солих тул класс ТҮР л үлдэнэ */
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
  /**
   * ⚠️ 2026-10-09: ӨӨР ХҮН ИЛГЭЭСЭН (шинэ баримт) — `refreshStaged` (доор, `publish`-ийн өмнө) REF-ээр дуудагдана:
   *    тэр нь `useDraftSync`-ээс ХОЙШ зарлагдах төлөв/функцээс хамаарна.
   */
  const refreshStagedRef = useRef<(at: number) => void>(() => {});
  const onReceipts = useCallback((at: number) => refreshStagedRef.current(at), []);
  /* ══════════ НООРОГИЙН СИНК (`fill/useDraftSync`) — эффектүүд нь энд, өмнөх байрлалдаа ══════════ */
  const draftSync = useDraftSync({
    pkg, user, busy, rows, sc, nBld, canPerf, noEdit, asOf, asOfOrig, setAsOf,
    pending, setPending, pendDate, setPendDate, dirtyCount, pvDirty, fillMode, loadedPkgRef, pkgKeyRef, editRef,
    /* ⚠️ 2026-10-01: нүд хаагдмагц хойшлуулсан нийлүүлэлтийг буулгахад (`deferredRef`) */
    editOpen: !!edit,
    curTgt,
    show, say,
    /* ⚠️ 2026-10-09: хоёр хүн зэрэг бөглөх — салаа мэдэгдэл · шинэ баримт · тодруулга · харагдаж буй нүд */
    soft, onReceipts, flashCells, visibleKeys,
  });
  /* ⚠️ 2026-10-01: ачаалах эффектийн толь (`draftSyncRef`-ийн ⚠️) */
  useSyncRef(draftSyncRef, draftSync);
  /* ⚠️ 2026-10-01: `keepDraft` → `keepDraftRef` нэрээр — `publish` түүнийг өөрчилдөг; React Compiler
     зөвхөн `…Ref` нэртэйг hook-оос ирсэн ref гэж таньдаг (утга нь ЯГ тэр ref). `remoteQueueRef` —
     ачаалах эффектийн `remoteQueue`-г сүүдэрлэхгүйн тулд. Ачаалах эффектэд л хэрэглэгддэг
     ref/setter (promptedPkgRef · flushRef · resetMarks …) толиос (`ds.`) уншигдана. */
  const {
    savedAt, keepDraft: keepDraftRef, remoteQueue: remoteQueueRef, mineRef, mineAtRef, delRef, touchMine, revert,
    doneBy, byMap, setByMap, setByAtMap, byAtRef,
    remoteState,
    meKey, participants, waitingOn, byCount, iAmDone, canSubmitNow, toggleDone, dropDraft, waitingLast,
    undoAllMarks, restoringUi, offline,
    rcptRef, btRef, datesBRef, asOfBRef, draftTgt, localFail, stamp,
    /* 2026-10-04 дахин аудит — тэмдэглэсэн нүд (#7) · өөрийн зорилт (#4) */
    heldN, dropHeld, clearMyTgt,
    /* 2026-10-05 — илгээлтийн баримтыг шууд бичих */
    pushReceipts,
    /* 2026-10-09 — «Илгээх»-ийн өмнөх алсын ноорогийн шалгалт */
    pullNow,
  } = draftSync;
  /**
   * НООРОГИЙН ЗОРИЛТ ОДООГИЙНХООС ӨӨР (2026-10-04 аудит, #6) — ноорог нь буцаагдсан илгээлтийн
   * засвар атлаа тэр илгээлт сонгогдоогүй (F5/багц солисон). «Илгээх» ТҮГЖИГДЭНЭ: эс бөгөөс
   * засвар ӨНӨӨДРИЙН илгээлтэд нийлж буруу өдрөөр явна. Хэрэглэгч тэр илгээлтийг сонгоно
   * (`resumeReturned`) эсвэл ноорогоо устгана.
   */
  const tgtMismatch = !locked && !!draftTgt && dirtyCount > 0 && (!curTgt || curTgt[0] !== draftTgt[0]);
  /*
   * ⚠️ 2026-10-04 аудит (#7): ХАРАГДАЦ/ТАБ СОЛИХ ХАМГААЛАЛТ (`navGuard`). Урьд нь FillNew `setNavDirty`
   *    ОГТ дууддаггүй тул инженерийн обьёмын ноорог (`pvPend` — ноорогт ХАДГАЛАГДДАГГҮЙ) Portal-ийн
   *    харагдац солих (`confirmLeave`) ба «Гүйцэтгэлийн хяналт»-ын таб солилтод асуултгүй устдаг байв.
   *    Гүйцэтгэлийн нүд нь локал+алсад хадгалагддаг тул ЗӨВХӨН энэ компьютерт хадгалагдаагүй
   *    (`localFail`) үед л асууна; илгээлт явж байх үеийн хамгаалалт нь `publish`-д (`fillnew-send`).
   */
  useEffect(() => {
    setNavDirty('fillnew', !locked && (pvDirty > 0 || (localFail && dirtyCount > 0)),
      pvDirty > 0 ? tr('Инженерийн төлөвлөсөн обьём (ноорогт хадгалагддаггүй)') : tr('Гүйцэтгэл бөглөх (энэ компьютерт хадгалагдсангүй)'));
  }, [locked, pvDirty, localFail, dirtyCount]);
  useEffect(() => () => { setNavDirty('fillnew', false); setNavDirty('fillnew-send', false); }, []);

  /** ⚠️ 2026-10-01: буулгалтын урьдчилсан харагдац (`useCellEdit.PastePrev`) */
  const [pastePrev, setPastePrev] = useState<PastePrev | null>(null);
  const {
    volMode, pctOnly, cellSeed, prevHint, commit, pasteBlock, nextEditable, nextBlockEditable,
    remainHint, confirmPaste, cancelPaste,
  } = useCellEdit({
    sc, fillMode, pending, setPending, edit, setEdit, setErr, warn, done, reviewInc, revert, mineRef, touchMine,
    locked, noEdit, canPerf, busy, editing, rowsAll, vis, hidden, nBld,
    /* ⚠️ 2026-10-01: ноорог сэргэж дуустал буулгалт хаалттай */
    restoring: restoringUi,
    pastePrev, setPastePrev,
  });

  /** Багц/хувилбар солихын өмнө нийтлээгүй засварыг баталгаажуулна. */
  const confirmSwitch = () =>
    unsavedCount === 0 ||
    window.confirm(
      tr('Нийтлэгдээгүй {0} өөрчлөлт бий. Багц солих уу?', unsavedCount) + "\n" +
        tr('(Нүдний засварууд ноорог болон хадгалагдаж, буцаж ирэхэд сэргээхийг санал болгоно.)') +
        /* ⚠️ ОБЬЁМЫН ноорог нь ноорогт ХАДГАЛАГДДАГГҮЙ — «сэргээнэ» гэсэн
           дээрх мөр түүнд ХАМААРАХГҮЙ тул үнэнийг тусад нь хэлнэ. */
        (pvDirty
          ? "\n" + tr('⚠ Инженерийн төлөвлөсөн обьёмын {0} нүд нь ноорогт хадгалагддаггүй — багц солиход БҮРМӨСӨН устана. Эхлээд «Обьём батлуулах» дарна уу.', pvDirty)
          : ""),
    );
  /** Огнооны нүдний ХАДГАЛАГДСАН утга «YYYY-MM-DD» хэлбэрээр. */
  const origDay = (r: SheetRow, b: number, k: "s" | "e") =>
    dt(k === "s" ? r.start[b] : r.end[b]);

  /**
   * ⚠️ 2026-10-05: ДӨНГӨЖ бичсэн огноо (түлхүүр → утга) — `commitDate` «Эхлэх» · «Дуусах»-ыг
   *    ДАРААЛАН дуудахад (`FillDatePicker`-ийн үргэлжлэх хоног) хоёр дахь дуудлага `pendDate`-ийн
   *    ХУУЧИН төлөвийг хардаг тул хосын шалгалт худал анхааруулахаас сэргийлнэ. Нэг мөчлөгийн дараа
   *    (`setTimeout 0`) цэвэрлэгдэнэ — цаашид `pendDate` үнэн эх.
   */
  const justDateRef = useRef<Map<string, string>>(new Map());
  const commitDate = (r: SheetRow, b: number, k: "s" | "e", raw: string) => {
    const key = `${r.oid}:${b}:${k}`;
    setEdit(null);
    /*
     * ⚠️ 2026-10-05: ЗӨӨЛӨН АНХААРУУЛГА (бичилтийг ЗОГСООХГҮЙ). Урьд нь «Дуусах» нь «Эхлэх»-ээс
     *    ӨМНӨ, эсвэл он нь хол зөрсөн (2062 гэх мэт) огноо чимээгүй авагдаж, төлөвлөгөөт хувь зүгээр
     *    л хоосон болдог байв — хэрэглэгч шалтгааныг мэдэхгүй. Хос нь урвуу БОЛОХ үед, эсвэл он
     *    өнөөдрөөс 5-аас их жилээр зөрөхөд хэлнэ.
     */
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
      if (notes.length) warn(tr('{0} · {1}: {2}. Огноогоо шалгана уу.', sc?.bld[b] ?? "", r.work, notes.join('; ')));
    }
    // Анхны утгадаа буцсан бол «нийтлээгүй» тэмдэглэгээг арилгана.
    const sameDate = raw === origDay(r, b, k);
    setPendDate((p) => {
      const n = { ...p };
      if (sameDate) delete n[key];
      else n[key] = raw;
      return n;
    });
    /* ⚠️ ОГНООНЫ ЗАСВАР Ч ЭЗЭМШИЛ (2026-09-21-ний аудит): урьд нь энд
       `mineRef` бичигддэггүй тул зөвхөн огноо засаж буй хүн `participants`-д
       орохгүй, «Илгээх» түгжээ түүнийг хүлээдэггүй байв. Хадгалах эффект
       `pendDate`-ийн түлхүүрийг `by`-д мөн оруулдаг.
       2026-09-21 (дахин аудит): pending-д байгаагүй огноог ижлээр бичих нь
       буцаалт БИШ — `revert`-ийн тайлбар. */
    if (sameDate) revert(key, key in pendDate);
    else { mineRef.current.add(key); touchMine(key); }
  };

  /**
   * ⚠️ 2026-10-05: «Шинэчлэгдсэн огноо»-г ХЭРЭГЛЭГЧ сонгох зам (хэрэгслийн мөр · календар) —
   *    ИРЭЭДҮЙН огноо бол зөөлөн анхааруулна (зогсоохгүй): төлөвлөгөөт хувь бүхэлдээ тэр
   *    огноогоор бодогддог тул андуурсан сонголт бүх мөрийн хоцрогдлыг худал харуулна.
   *    Ноорог сэргээх/ачаалах замууд түүхий `setAsOf`-оор хэвээр (анхааруулгагүй).
   */
  const setAsOfUser: typeof setAsOf = (v) => {
    if (typeof v === "number" && v > nowFillMs()) {
      warn(tr('«Шинэчлэгдсэн огноо» ({0}) нь ИРЭЭДҮЙН өдөр байна — төлөвлөгөөт хувь тэр өдрөөр бодогдоно. Санаатай биш бол засна уу.', dt(v)));
    }
    setAsOf(v);
  };

  /**
   * ӨМНӨХ ӨДРИЙН БУЦААГДСАН илгээлтийг СОНГОЖ давхарлана (`resumedOid`-ийн ⚠️).
   * ⚠️ Суурь жаазыг ДАХИН татаж давхарлана — `rows`-д өнөөдрийн илгээлт
   *    давхарлагдсан байж болох тул дээр нь тавьж болохгүй. Илгээгээгүй засвар
   *    байвал ЗОГСОНО — тэр нь өөр өдрийн илгээлттэй холилдоно.
   */
  const resumeReturned = useCallback(async (soid: number) => {
    if (busy || !sc || view) return;
    /* Нүд/огноо/шинэчлэгдсэн огноо илгээгээгүй бол саад — нэмэлт мөр энд байхгүй (2026-09-24). */
    const blocking = Object.keys(pending).length + Object.keys(pendDate).length
      + (asOf !== asOfOrig ? 1 : 0);
    /* ⚠️ 2026-10-04 (#6): ноорог ЯГ ЭНЭ илгээлтийн засвар (`Draft.tgt`) бол саад биш — тэр нь
       F5/багц солихоос өмнө сонгогдсон зорилтоо сэргээж байна (засвар өөр өдөртэй холилдохгүй). */
    if (blocking > 0 && draftTgt?.[0] !== soid) { say(tr('Эхлээд илгээгээгүй засвараа илгээнэ үү эсвэл ноорогоо устгана уу.')); return; }
    setBusy(true);
    try {
      const rr = await readSubmissionByOid(soid);
      if (!rr.ok) throw new Error(rr.error);
      const sub0 = rr.sub;
      if (!sub0 || sub0.done || sub0.payload.pkgKey !== pkg.key) throw new Error(tr('Буцаагдсан илгээлт олдсонгүй — хуудсыг дахин ачаална уу.'));
      const base = await loadRows(pkg, sc);
      /* ⚠️ 2026-10-04 дахин аудит (#1): хуучин (`rowOcc`-гүй) илгээлтийн давтамжийг суурь жаазаас нөхнө */
      const p2 = await ensureFrameOcc(pkg, sc, sub0.payload, base.rows);
      const sub = p2 === sub0.payload ? sub0 : { ...sub0, payload: p2 };
      const ov = overlaySubmission(base.rows, sub.payload, sc, nBld);
      setUnmovedWarn(ov.unmoved > 0 ? describeUnmoved(ov.unmovedKeys, sub.payload.rowKeys, sc.bld) : []);
      setBackChg(changedKeys(base.rows, ov, sc.bld));
      setBackMeta({ at: sub.payload.at, remapped: ov.remapped });
      setOvBase(new Map(base.rows.map((x) => [x.oid, x] as const)));
      setStaged(sub);
      setResumedOid(sub.oid);
      setRows(ov.rows);
      /* `null ≠ 0`: илгээлт огноог хөндөөгүй бол архивынх */
      const a0 = ov.asOf ?? base.asOf;
      /* ⚠️ 2026-10-04 дахин аудит (#8): НООРОГ ЯГ ЭНЭ илгээлтийн засвар (`draftTgt`) бөгөөд «Шинэчлэгдсэн
         огноо»-г өөрчилсөн бол (`asOf !== asOfOrig`) тэр засварыг ХАДГАЛНА — урьд нь хоёуланг нь `a0`
         болгодог тул засвар арилж, `asOfRevRef`-ээр дараагийн хадгалалт `asOf: null` (ИЛ БУЦААЛТ)
         бичиж бусад төхөөрөмжийн огноог ч буцаадаг байв. Суурь нь шинэ (`a0`). */
      const keepAsOf = asOf !== asOfOrig && asOf !== a0 ? asOf : undefined;
      setAsOf(keepAsOf !== undefined ? keepAsOf : a0);
      setAsOfOrig(a0);
      setSnapDay(base.snapshot != null ? msToDay(base.snapshot) : "");
      setSnapMs(base.snapshot ?? null);
      done(tr('{0}-ны буцаагдсан илгээлт давхарлагдлаа — засаад «Илгээх» дарна.', msToDay(sub.payload.fillMs)));
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, sc, view, pending, pendDate, asOf, asOfOrig, pkg, nBld, draftTgt]);

  /*
   * ⚠️ 2026-09-30: «ЗАСААД ДАХИН ИЛГЭЭХ»-ЭЭР ИРСЭН бол (`fixReq`) хуудас
   *    ачаалагдсаны дараа тэр илгээлтийг нээнэ. `flow` нь өөрөө тэр буцаалт
   *    бол ачаалах зам аль хэдийн давхарласан — юу ч хийхгүй; өөр өдрийн
   *    буцаалт (`otherDaysReturned`) бол `resumeReturned`-ээр ТҮҮНИЙ өдрөөр.
   *    Багц хүрээнээс гадуур (хуваарилалтын эффект сольсон) эсвэл хэрэглэгч
   *    өөр багц сонгосон бол хүсэлтийг хаяна. Нэг л удаа оролдоно.
   */
  useEffect(() => {
    if (!fixReq || view) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-10-01: нэг удаагийн хүсэлтийг «хэрэглэсэн» гэж тэмдэглэнэ; нөхцөл нь `loadedPkgRef` (ref) уншиж `resumeReturned` (async) дууддаг тул эффектэд л
    if (pkg.key !== fixReq.pkgKey) { setFixReq(null); return; }
    if (!sc || busy || hyLoading || loadedPkgRef.current !== pkg.key) return;
    const soid = fixReq.soid;
    setFixReq(null);
    if (soid == null || (flow && Number(flow[HF.sheetOid]) === soid)) return;
    if (resumedOid !== soid && otherDaysReturned.some((x) => x.soid === soid)) void resumeReturned(soid);
  }, [fixReq, view, pkg.key, sc, busy, hyLoading, flow, otherDaysReturned, resumedOid, resumeReturned]);

  /**
   * ӨДӨР СОЛИГДОХЫГ ТАНИХ (2026-09-25-ны аудит, `todayFillMs`-ийн ⚠️).
   * Минут тутам ба таб харагдах болоход шалгаж, өдөр солигдсон бол
   * `todayFillMs`-ийг шинэчилнэ → ачаалах эффект хуудсыг шинэ өдрөөр дахин
   * ачаална (ноорог локал/алсаас сэргэнэ).
   * ⚠️ Нүд/календар НЭЭЛТТЭЙ, ажил явж байгаа (`busy`) эсвэл алсын бичилт
   *    дараалалд байвал ХОЙШЛУУЛНА — дахин ачаалалт `setEdit(null)`-ээр бичиж
   *    буй утгыг хаяна, дараалал (`remoteQueue`) тэглэгдэнэ. Дараагийн шалгалтаар.
   * ⚠️ Хянагчийн харагдацад (`view`) хамаарахгүй — тэр нь тодорхой илгээлтийг
   *    заасан, өнөөдрийн түлхүүрээр ачаалдаггүй.
   */
  useEffect(() => {
    if (view) return undefined;
    const check = () => {
      const d = nowFillMs();
      if (d === todayFillMs) return;
      if (busy || editRef.current || pickRef.current || remoteQueueRef.current) return;
      /* ⚠️ 2026-10-05: ОБЬЁМЫН НООРОГ (`pvPend`) хаана ч хадгалагддаггүй — өдөр солигдох дахин ачаалалт
         түүнийг ТЭГЛЭДЭГ тул инженерийн илгээгээгүй обьём чимээгүй арилдаг байв. Илгээх/цэвэрлэх
         хүртэл хойшлуулна (дараагийн шалгалтаар) — `pvDirtyRef` (эффектийн хамаарал хэвээр). */
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
   * ӨӨР ХЭРЭГЛЭГЧ ИЛГЭЭСНИЙ ДАРАА ИЛГЭЭЛТ/ДАВХАРЛАЛТЫГ ДАХИН УНШИНА (⚠️ 2026-10-09) — `useDraftSync`-ийн
   * татах мөчлөг ШИНЭ илгээлтийн баримт нийлүүлмэгц (`onReceipts`).
   * ⚠️ ЯАГААД: А илгээхэд Б-гийн татах мөчлөг А-гийн баримтыг нийлүүлж Б-гийн `pending`-ээс тэр нүднүүдийг
   *    ЧИМЭЭГҮЙ хасдаг байв, харин Б-гийн `staged`/мөрүүд (ачаалах эффект — `[pkg, view, todayFillMs]`)
   *    хэзээ ч дахин уншигддаггүй тул тоо нь ХУУЧИН нийт рүү «үсэрч» мэдэгдэлгүй; Б дахин бичвэл ДАВХАР
   *    тоологдоно, «Илгээх» нь «өөр хэрэглэгч илгээсэн — F5» алдаагаар гацна. Одоо `publish`-ийн илгээсний
   *    дараах дахин ачаалалттай ИЖИЛ дүрмээр (өнөөдрийн түлхүүр · `useSub` нөхцөл · `ensureFrameOcc`) суурь
   *    жааз + илгээлтийг дахин давхарлаж «{0} илгээв — таны дэлгэц шинэчлэгдлээ» гэж хэлнэ (нэр — илгээлтийн
   *    `payload.user`: баримт өөрөө зохиогчгүй).
   * ⚠️ ХӨНДӨХГҮЙ тохиолдол: (а) буцаагдсан ӨӨР ӨДРИЙН илгээлтийг засаж буй (`staged.fillMs ≠ өнөөдөр`) —
   *    зорилтыг солихгүй, зөвхөн хэлнэ; (б) архивт ШИНЭ жааз (oid солигдсон) — ноорогийн түлхүүр хуучин
   *    жаазных тул энд угсрахгүй, F5 хийхийг хэлнэ (`publish` жааз солигдохыг өөрөө зохицуулдаг).
   * ⚠️ Давхар дуудлагыг нэгтгэнэ (`refreshRunRef`); багц солигдсон бол хариуг хаяна.
   */
  const refreshRunRef = useRef<{ on: boolean; again: number }>({ on: false, again: 0 });
  const refreshStaged = useCallback(async (at: number) => {
    if (view || !sc) return;
    const run = refreshRunRef.current;
    if (run.on) { run.again = Math.max(run.again, at); return; }
    run.on = true;
    const want = pkg.key;
    const live = () => pkgKeyRef.current === want && loadedPkgRef.current === want;
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
      const ov = act ? overlaySubmission(next.rows, act.payload, sc, nBld) : null;
      setUnmovedWarn(ov && ov.unmoved > 0 && act ? describeUnmoved(ov.unmovedKeys, act.payload.rowKeys, sc.bld) : []);
      /* ⚠️ `staged` ба `rows` хамт — дараагийн «Илгээх»-ийн суурь (`act.at > staged.at`) ба дэлгэц нэг илгээлтээс */
      setStaged(act);
      setRows(ov ? ov.rows : next.rows);
      setOvBase(ov ? new Map(next.rows.map((x) => [x.oid, x] as const)) : new Map());
      const asOfNext = ov?.asOf ?? next.asOf;
      /* ⚠️ `null ≠ 0`; хэрэглэгч «Шинэчлэгдсэн огноо»-г өөрөө өөрчилсөн бол (`asOf ≠ asOfOrig`) ДАРАХГҮЙ */
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
  }, [view, sc, pkg, todayFillMs, staged, rows, nBld, asOf, asOfOrig, reloadHy, show, flowRef]);
  useSyncRef(refreshStagedRef, (a: number) => { void refreshStaged(a); });

  /**
   * «НИЙТЛЭХ» = ИЛГЭЭХ (2026-09-04-нөөс).
   *
   * ⚠️ ЭНЭ ФУНКЦ ҮНДСЭН ӨГӨГДӨЛ РҮҮ БИЧИХГҮЙ. Урьд нь энд `computeAll`-оор
   *    бүтэн жааз угсарч `applyAdds`-аар `Bagts_*` архивт ШУУД нэмдэг байв —
   *    хяналтын 6 шат нь тэр бичигдсэн өгөгдлийг ХОЙНООС нь баталдаг «ёсорхуу»
   *    зам болно. Хэрэглэгчийн шаардлага: «ноорог ҮНДСЭН ДАТАНД хадгалагдаж
   *    болохгүй; бүх шалгалт дуусаж 6 шат дамжсаны дараа л дата хүснэгт рүү
   *    орно». Одоо энд зөвхөн ЗӨРҮҮ (diff) нь завсрын хадгалалтад бичигдэж,
   *    хяналтын бүртгэл үүснэ. Архивт бичих цорын ганц зам —
   *    `hyanaltStore.apply` (газрын даргын батламж).
   */
  const publish = useCallback(async () => {
    // ⚠️ busy — Ctrl+S auto-repeat үед олон зэрэгцээ бичилт явахаас сэргийлнэ.
    /* ⚠️ `asOf == null` нь ЗОГСООХ шалтгаан БИШ (2026-09-06): хэзээ ч
       нийтлэгдээгүй хуудсанд огноо байхгүй бөгөөд бөглөгч түүнийг «Хуваарь»
       харагдацаар дараа тавина. Урьд нь энэ шалгуур тийм хуудсаас илгээхийг
       ЧИМЭЭГҮЙ зогсоодог байв — товч дарагдаад юу ч болохгүй. Огноогүй үед
       төлөвлөгөөт хувь `null` (мэдээлэлгүй) хэвээр илгээгдэнэ. */
    if (busy || dirtyCount === 0 || !sc) return;
    /*
     * ⚠️ ТҮГЖЭЭГ ЭНД ШАЛГАНА — товчны `disabled`-д найдаж БОЛОХГҮЙ. Ctrl+S нь
     *    `publish`-ыг ШУУД дууддаг тул саарал «Нийтлэх» товчийг тойрч гарна.
     *    Тэгвэл хяналтын харагдацаас (locked) илгээлт үүсч, эсвэл хянагчийн
     *    гар дээр байгаа илгээлт доор нь чимээгүй солигдоно.
     */
    if (noEdit) {
      setErr(RO.viewOnly);
      return;
    }
    // ⚠️ Гүйцэтгэлийн өөрчлөлт (обьём/огноо/шинэчлэгдсэн огноо) зөвхөн томилогдсон
    //    гүйцэтгэгчээс — товчны disabled-аас биш, ЭНД шалгана (Ctrl+S ч энд ирдэг).
    if (!canPerf && (Object.keys(pending).length || Object.keys(pendDate).length || asOf !== asOfOrig)) {
      setErr(RO.noPerf);
      return;
    }
    /* ⚠️ Нэмэлт мөрийн шалгуур (`canAddRow`, батлуулаагүй `adds`) ЭНД БАЙХГҮЙ
       (2026-09-24): энэ хуудас мөр нэмэхгүй, payload-ийн `adds` үргэлж `[]`. */
    /*
     * ⚠️ ОРОЛЦОГЧИЙН ТҮГЖЭЭГ ч ЭНД шалгана (2026-09-21-ний аудит). «Илгээх»
     *    товч `canSubmitNow` худал үед ОГТ зурагддаггүй (оронд нь «Дуусгасан»)
     *    ч Ctrl+S нь `publish`-ыг ШУУД дууддаг тул бусад оролцогч дуусгаагүй
     *    байхад хагас бөглөсөн хуваалцсан ноорог илгээгддэг байв. Мессеж нь
     *    товчны хажуугийн тайлбартай ижил.
     */
    if (!canSubmitNow) {
      say(tr('Илгээх — {0} дуусгаагүй байна', waitingOn.join(', ')));
      return;
    }
    /* ⚠️ ӨДӨР СОЛИГДСОН эсэхийг ИЛГЭЭХ АГШИНД шалгана (2026-09-25-ны аудит,
       `todayFillMs`-ийн ⚠️). Зөрвөл илгээхгүй: `staged`/дэлгэц нь өчигдрийн
       түлхүүрээр ачаалагдсан тул өнөөдрийн мөрийг «өөр хэрэглэгч илгээсэн» гэж
       андуурах эсвэл өчигдрийн мөрт нийлүүлнэ. Төлөвийг шинэчилж хуудсыг шинэ
       өдрөөр дахин ачаална — ноорог локал/алсаас сэргэнэ. */
    const dNow = nowFillMs();
    if (dNow !== todayFillMs) {
      /* ⚠️ 2026-10-05: обьёмын ноорог (`pvPend`) дахин ачаалалтад УСТДАГ (хаана ч хадгалагддаггүй) —
         эхлээд түүнийг илгээлгэнэ; хуудсыг дахин ачаалахгүй (өдөр солигдох шалгалтын ⚠️-тэй ижил). */
      if (pvDirtyRef.current > 0) {
        say(tr('Өдөр солигдлоо ({0}). Инженерийн обьёмын илгээгээгүй {1} нүд дахин ачаалахад устах тул эхлээд «Обьём батлуулах» дарна уу (эсвэл тэр нүднүүдээ буцаана уу), дараа нь «Илгээх»-ийг дахин дарна уу.', msToDay(dNow), pvDirtyRef.current));
        return;
      }
      setTodayFillMs(dNow);
      say(tr('Өдөр солигдлоо ({0}) — хуудас шинэ өдрөөр дахин ачаалагдаж байна. Ноорог сэргээгдсэний дараа «Илгээх»-ийг дахин дарна уу.', msToDay(dNow)));
      return;
    }
    /* ⚠️ 2026-10-04 аудит (#6): НООРОГ нь ӨӨР (буцаагдсан) илгээлтийн засвар — сонгогдоогүй бол
       ИЛГЭЭХГҮЙ (`tgtMismatch`-ийн ⚠️). Ctrl+S ч энд ирдэг тул товчноос гадна ЭНД шалгана. */
    if (tgtMismatch && draftTgt) {
      say(tr('Энэ ноорог {0}-ны буцаагдсан илгээлтийн засвар — «Өмнөх өдрийн илгээлт буцаагдсан» мэдэгдлээс тэр илгээлтийг сонгоод илгээнэ үү, эсвэл ноорогоо устгана уу.', msToDay(draftTgt[1])));
      return;
    }
    /*
     * ⚠️ 2026-10-04 аудит (#4): доорх `sentAt` нь одоо TOMBSTONE-ийн агшин БИШ — илгээлтийн
     *    БАРИМТЫН (`Draft.rcpt`) `sa` (илгээсэн хуулбарын агшин). Tombstone/баримтын агшин нь
     *    ИЛГЭЭСЭН агшин (`stamp()`, логик цаг); тэр хоёрын хооронд засагдсан хуулбарыг `rcptApply`
     *    чимээгүй хасахгүй, БҮТНЭЭР нь ч үлдээхгүй — ЗӨРҮҮ болгож анхааруулна (доорх түүх).
     * ⚠️ ИЛГЭЭХ НҮДНИЙ «СҮҮЛД ХӨНДСӨН» АГШИН — ЭНД, payload бүрдэхээс ӨМНӨ
     *    барина (2026-09-25-ны давтан аудит). Доорх tombstone-ийг `pubAt`
     *    (илгээлт ДУУССАН агшин)-аар тамгалбал: А-гийн `pending` дахь Б-гийн
     *    X=5 (татсан агшин P) → Б X=8 болгосон (T, P < T < pubAt — «Дуусгасан»
     *    дарсны дараа засах эсвэл хоёр дахь төхөөрөмж) → А X=5 илгээнэ →
     *    `mergeDrafts` Б-гийн T < pubAt тул X=8-ыг ЧИМЭЭГҮЙ хасдаг байв (илгээгээгүй,
     *    ноорогт ч үгүй). Одоо tombstone = ИЛГЭЭСЭН утгын өөрийн агшин: өөрийн
     *    нүд → `mineAtRef`, бусдынх → `byAtRef` (хоёулаа байвал их нь); тэрнээс
     *    ХОЖУУ хөндсөн нүд `mergeDrafts`-д ялна. Агшингүй нүдэнд л `pubAt`.
     *    `mineAtRef` нь ref тул `await`-аас өмнө ХУУЛНА.
     */
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
      /* ⚠️ 2026-10-04 дахин аудит (#5): илгээх агшны түлхүүрийг ОДООГИЙН хуудасны жаазад ч зөөнө —
         хооронд жааз солигдсон бол `pending` шинэ түлхүүртэй тул хасагдахгүй ДАХИН илгээгдэх байв. */
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
     * ⚠️ ХЯНАЛТЫН ХОРИГ ХАСАГДСАН (2026-09-07, хэрэглэгчийн шууд заавар:
     *    «Times-ийн хязгаарлалт болиод хэдэн ч удаа илгээх боломжтой болго»).
     *
     *    Урьд нь энд `if (inReview) return` байсан бөгөөд `inReview` нь
     *    БАГЦЫН сүүлийн урсгалын мөрөөс тооцогддог байв — өчигдрийн илгээлт
     *    инженерийн гар дээр байхад ӨНӨӨДРИЙН гүйцэтгэлийг илгээх зам ОГТ
     *    байхгүй болж, гүйцэтгэгч хариу хүлээж сууж байлаа.
     *
     *    Одоо аюулгүй байдал нь ХОРИГООР биш, ТҮЛХҮҮРЭЭР хангагдана: илгээлт
     *    нь `sub|<pkg>|<fillMs>` тул өдөр бүр ТУСДАА мөр, тусдаа хяналтын
     *    мөр, тусдаа 6 шат. Өөр өдрийн хянагдаж буй агуулгыг энэ илгээлт
     *    ХӨНДӨХ БОЛОМЖГҮЙ.
     *
     *    ⚠️ ЯГ ЭНЭ ӨДРИЙН илгээлт хянагдаж байхад дахин илгээх нь ТЭР мөрийг
     *    update хийнэ (хэрэглэгчийн шийдвэр: шинэ тойрог үүсгэхгүй) — тэр
     *    эрсдэлийг ХААХГҮЙ, харин доорх `done(...)` мессежээр ИЛ хэлнэ.
     */
    setBusy(true);
    setErr("");
    try {
      /*
       * ⚠️ 2026-10-09: ХУВААЛЦСАН НООРОГИЙГ ДАХИН УНШИНА (`useDraftSync.pullNow`-ийн ⚠️). Урьд нь `publish`
       *    алсын ноорогийг огт уншдаггүй тул татах мөчлөг алгассан (нуугдсан/хуучирсан) таб А аль хэдийн
       *    илгээсэн нүд, Б-гийн хожуу засвар эсвэл «Дахин засах»-ыг мэдэлгүй ИЛГЭЭЖ болзошгүй байв. Алсын
       *    хувилбар өөр бөгөөд нийлүүлэлт ЮУ НЭГ зүйл өөрчилсөн бол дэлгэц шинэчлэгдэж ЗОГСОНО — хэрэглэгч
       *    шалгаад дахин дарна. Уншиж чадаагүй (`'fail'`) бол доорх CAS (`act.at > staged.at` · `expectAt`)
       *    хамгаалсаар үргэлжилнэ.
       */
      if ((await pullNow(pkg.key)) === 'changed') {
        warn(tr('Ноорог шинэчлэгдлээ — шалгаад дахин илгээнэ үү'));
        return;
      }
      /* ── СУУРЬ ЖААЗ ─────────────────────────────────────────────────────
       * ⚠️ `rows` нь хуудсыг НЭЭХ үеийн хуулбар тул илгээхийн өмнө архивын
       *    СҮҮЛИЙН жаазыг дахин татна. Ингэснээр хооронд нь батлагдсан
       *    (архивт орсон) өөрчлөлт алдагдахгүй.
       */
      const fresh0 = await loadRows(pkg, sc);
      const freshRows = fresh0.rows;
      /* ⚠️ Суурь жаазын өдөр/агшныг ТӨЛӨВТ буулгана — дэлгэц дээрх «суурь
         жааз» заалт ба payload-ийн `base` хоёулаа энэ утгаас гарна. */
      setSnapDay(fresh0.snapshot != null ? msToDay(fresh0.snapshot) : "");
      setSnapMs(fresh0.snapshot ?? null);
      /**
       * ⚠️ «ӨӨР ХЭРЭГЛЭГЧ ИЛГЭЭСЭН» ШАЛГАЛТ (2026-09-04).
       *
       * Урьд нь энд «энэ багцыг өнөөдөр өөр хэрэглэгч НИЙТЭЛСЭН үү»
       * (`freshDay === today`) гэж архивын агшнаар шалгадаг байв. Илгээлт
       * архивт бичигдэхээ больсон тул тэр шалгуур одоо ЮУ Ч БАРИХГҮЙ.
       *
       * Одоо завсрын хадгалалтыг шалгана: хуудас нээснээс хойш `sub|<pkg>`
       * мөр ШИНЭЧЛЭГДСЭН бол (өөр хүн, эсвэл өөр таб илгээсэн) бидний
       * нэгтгэх суурь (`staged`) хуучирсан — үргэлжлүүлбэл түүний нүднүүд
       * ЧИМЭЭГҮЙ дарагдана.
       */
      /*
       * ⚠️ АЛДААГ ЯЛГАДАГ ХУВИЛБАР (2026-09-04-ний аудит): `loadActiveSubmission`
       *    нь уншилт унасныг ч `null` гэж буцаадаг тул тэр агшинд «идэвхтэй
       *    илгээлт байхгүй» гэж дүгнэж, өөр хэрэглэгчийн ЯГ ОДОО хянагдаж буй
       *    `sub|` мөрийг бүтнээр нь дарж бичих эрсдэлтэй байв (upsert нь мөрийг
       *    dkey-гээр олдог тул тэр мөр рүү л бичнэ). Одоо мэдэхгүй бол ЗОГСОНО.
       */
      /* Бөглөсөн огноо — өдрийн эхэнд (UTC). Батлагдахад архивын жаазны
         `buglusun_ognoo` болно.
         ⚠️ ЭНД, УНШИЛТААС ӨМНӨ бодогдоно (2026-09-07): илгээлтийн түлхүүр нь
         одоо `sub|<pkg>|<fillMs>` тул «идэвхтэй илгээлт байна уу» шалгуур ЯГ
         ЭНЭ өдрөөр хийгдэх ёстой. Урьд нь `fillMs` нь уншилтаас ДООР
         бодогддог байсныг ДЭЭШ зөөв.
         ⚠️ `todayFillMs`-ээс уншина — хуудас нээх эффект ч түүгээр давхарладаг
         тул хоёулаа НЭГ өдөр дээр ажиллана (өөр өөрөөр бодвол `staged` ба
         бичих түлхүүр зөрж, ХУРИМТЛАЛ тасарна). */
      /*
       * ⚠️ БУЦААГДСАН ИЛГЭЭЛТИЙГ ӨӨРИЙНХ НЬ ӨДРӨӨР (2026-09-08). Ачаалах зам
       *    инженер буцаасан илгээлтийг өдөр солигдсон ч давхарладаг болов
       *    (дээрх ⚠️). Тэр илгээлтийг засаад дахин илгээхэд ӨНӨӨДРИЙН
       *    түлхүүрээр ШИНЭ мөр үүсгэвэл: (а) буцаагдсан мөр мөнхөд нээлттэй
       *    үлдэж `pendingAging`-д хуучирсаар; (б) `mergeBase` өдөр зөрсөн тул
       *    нэгтгэхгүй — засвар нь буцаагдсан нүднүүдийг АГУУЛАХГҮЙ хагас
       *    payload болно. Тиймээс `staged` буцаагдсан илгээлт бол ТҮҮНИЙ
       *    өдрөөр — тэр мөрийг update хийж, `submitForReview` нь `OWNER ===
       *    'company'` мөрийг «жинхэнэ дахин илгээлт» гэж таньж ergelt+1 шинэ
       *    тойрог нээнэ (`openReviewRow`-ийн дүрэм). Өнөөдрийн шинэ ажил бол
       *    урьдын адил `todayFillMs`.
       */
      /* ⚠️ ГАРААР СОНГОСОН буцаагдсан илгээлт ч ӨӨРИЙН өдрөөр (`resumedOid`-ийн ⚠️, 2026-09-24) */
      const fillMs = staged && !staged.done
        && ((flow && OWNER[flow[HF.status]] === 'company') || resumedOid === staged.oid)
        ? staged.payload.fillMs
        : todayFillMs;
      const actR = await readActiveSubmission(pkg.key, fillMs);
      if (!actR.ok) throw new Error(actR.error);
      const act = actR.sub;
      /*
       * ⚠️ 2026-10-04 аудит (#3, HIGH): ӨМНӨХ ОРОЛДЛОГЫН ХАРИУ ТАСАРСАН уу (`readInflight`)?
       *    `saveSubmission` сервер дээр бичигдсэний ДАРАА тасарвал урьд нь дахин дарахад доорх
       *    «өөр хэрэглэгч илгээсэн» алдаа гарч, түүнийг дагаж F5 → сэргээсэн ноорог ДАХИН
       *    нэгтгэгдэж ижил нэмэлт ХОЁР УДАА тоологддог байв. Одоо серверийн илгээлтэд тэр
       *    оролдлогын `nonce` байвал (дараагийн илгээлт бүр хуримтлуулдаг — `mergeSubmission`)
       *    «АМЖИЛТТАЙ болсон» гэж үзэж ноорогоос хасаад (өөрчлөгдсөн нүд — ЗӨРҮҮ) ЗОГСОНО;
       *    хэрэглэгч үлдсэнийг шалгаад дахин дарна. `nonce` байхгүй бол буугаагүй — үргэлжлүүлнэ.
       */
      {
        const inf = readInflight(pkg.key);
        if (inf) {
          /* ⚠️ 2026-10-04 дахин аудит (#5): `sub|`-ээс гадна БАТЛАГДСАН (`done|`) мөрөөс ч (`findNonce`) —
             батлагдсан бол урьд нь «буугаагүй» гэж үзэж архивт орсон нүдийг ДАХИН илгээдэг байв. */
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
      /*
       * ── ObjectID ШИЛЖИЛТ ───────────────────────────────────────────────
       * ⚠️ `pending`/`pendDate` нь `${oid}:…` түлхүүртэй бөгөөд тэр oid нь
       *    хуудсыг НЭЭХ үеийн архивын жаазынх. Ерөнхий менежер батлахад
       *    архивт ШИНЭ жааз нэмэгддэг тул `freshRows` огт ӨӨР ObjectID мужид
       *    шилжинэ (жаазууд огтлолцдоггүй).
       *
       * ⚠️ Урьд нь тэр үед нэг ч түлхүүр таарахгүй болж БҮХ засвар чимээгүй
       *    унтарч, дэлгэцэд «амжилттай» гэж харагддаг байв. Тиймээс
       *    түлхүүрүүдийг (№ + Ажлын нэр)-ээр шинэ мөрөнд ЗӨӨНӨ; нэг ч
       *    түлхүүр зөөгдөөгүй үлдвэл илгээлтийг ЗОГСООНО.
       */
      /* ⚠️ 2026-10-04 аудит (#2): ХУУДАСНЫ БҮТЭН жагсаалт + давтамжийн дугаар (`rowOccOf`) — ижил
         шошготой мөр нэмэгдсэн/хасагдсан бол ТААМАГЛАХГҮЙ (`unmoved` → доорх `stale` зогсолт). */
      const pageRows = rows.filter((r) => r.oid >= 0);
      const oidMap = (rows.length && freshRows.length && freshRows[0].oid !== rows[0].oid)
        ? buildOidMap(pageRows.map((r): [number, string] => [r.oid, rowKeyOf(r)]), freshRows, rowOccOf(pageRows))
        : new Map<number, number>();
      const stale = tr('Хуудас хооронд нь шинэчлэгдсэн (өөр хэрэглэгч нийтэлсэн) тул засваруудыг шинэ мөрүүдэд тулгаж чадсангүй — нийтлэлийг зогсоов. Ноорог хадгалагдсан хэвээр байгаа тул хуудсыг дахин ачаалж, сэргээгээд дахин Илгээнэ үү.');
      const mc = moveKeys(oidMap, pending);
      const md = moveKeys(oidMap, pendDate);
      if (mc.unmoved.length || md.unmoved.length) throw new Error(stale);
      const pend2 = mc.out;
      const pendDate2 = md.out;
      /**
       * ⚠️ ХУУЧИН ИЛГЭЭЛТИЙН ТҮЛХҮҮРИЙГ Ч ЗӨӨНӨ (2026-09-04).
       *
       * Архивт хооронд нь шинэ жааз нэмэгдвэл ЗӨВХӨН одоогийн `pending` биш,
       * НЭГТГЭХ гэж буй хуучин илгээлтийн `cells`/`dates`/`rowKeys` ч
       * хуучирна. Зөөхгүй бол нэг payload дотор ХОЁР үеийн ObjectID холилдож,
       * батлах шатанд тал нь «тулгагдсангүй» болж бүхэл илгээлт зогсоно.
       *
       * ⚠️ ЗӨӨХ ЭСЭХИЙГ PAYLOAD-ЫН ӨӨРИЙН oid-ООР шийднэ (2026-09-25-ны аудит,
       *    HIGH). Урьд нь ЗӨВХӨН `oidMap` (хуудасны `rows` → `freshRows`)-оор
       *    зөөдөг байв: илгээлт ӨМНӨХ жааз (F0) дээр хадгалагдаад хуудас F1
       *    дээр нээгдсэн бол (ачаалах overlay нь зөвхөн ДЭЛГЭЦЭД зөөдөг)
       *    `rows` = `freshRows` тул `oidMap` хоосон, payload F0-ийн oid-тойгоо
       *    F1-ийн шинэ түлхүүртэй НЭГТГЭГДЭЖ, батлах шатанд буруу мөрөнд буух
       *    эсвэл `unmoved > 0`-оор багцыг мөнхөд гацаадаг байв. Одоо:
       *      · rowKeys-ийн oid бүгд `freshRows`-д бий → зөөхгүй;
       *      · бүгд хуудасны `rows`-д бий (хуудас нээснээс хойш жааз солигдсон)
       *        → `oidMap` (бүтэн хуудсаар, яг таарна);
       *      · эс бөгөөс (хуучин жааз) → `buildOidMap(p.rowKeys, freshRows)` —
       *        `overlaySubmission`-ий `needMap`-тай ИЖИЛ дүрэм, тиймээс дэлгэцэд
       *        харагдсан мөрүүдэд л бууна.
       *    Зөөгдөөгүй түлхүүр үлдвэл урьдын адил ЗОГСООНО.
       */
      const freshOidSet = new Set(freshRows.map((r) => r.oid));
      const pageOidSet = new Set(rows.map((r) => r.oid));
      /*
       * ⚠️ 2026-10-04 дахин аудит (#1): ЗОГСООХГҮЙ, ТУЛГАГДААГҮЙГ БУЦААНА (`lost`). Урьд нь энд `stale`
       *    шиддэг тул хуучин (`rowOcc`-гүй) илгээлт хуучин жааз дээр үлдсэн бол дахин илгээх зам ч
       *    МӨНХӨД хаалттай байв (батлалт ч мөн зогсдог). Дуудагч: эхлээд суурь жаазаас давтамж нөхнө
       *    (`ensureFrameOcc`), үлдсэн бол хэрэглэгчээр ИЛ БАТАЛГААЖУУЛЖ тэр нүдийг хасна (гарц) —
       *    буруу мөрөнд ХЭЗЭЭ Ч буулгахгүй, таамаглахгүй.
       */
      const movePayload = (p: SubmissionPayload): { p: SubmissionPayload; lost: string[] } => {
        const rk = p.rowKeys ?? [];
        if (!rk.some(([oid]) => oid >= 0 && !freshOidSet.has(oid))) return { p, lost: [] };
        const onPage = oidMap.size > 0 && rk.every(([oid]) => oid < 0 || pageOidSet.has(oid));
        /* ⚠️ 2026-10-04 (#2): хуучин илгээлтийн давтамжийн дугаар (`rowOcc`)-аар — хоёрдмол бол зогсоно */
        const map = onPage ? oidMap : buildOidMap(rk, freshRows, p.rowOcc);
        /* ⚠️ ХООСОН map-ийг `moveKeys` «зөөх хэрэггүй — бүгд хэвээр» гэж уншдаг; энд зөөх ЁСТОЙ тул
           «бүгд тулгагдаагүй» болгоно (байхгүй сөрөг түлхүүртэй map — эерэг oid бүр `unmoved`). */
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
            /* ⚠️ 2026-10-04 (#2): зөөсөн мөрийн давтамжийг ШИНЭ жаазаар дахин бодно */
            rowOcc: rowOccOf(freshRows, kept.map(([oid]) => map.get(oid) ?? oid)),
          },
          lost: [...c.unmoved, ...d.unmoved],
        };
      };

      /**
       * МӨРИЙН ТАНИГЧ — ЗӨВХӨН энэ илгээлтэд ашиглагдсан ЭЕРЭГ oid-үүдийнх.
       *
       * ⚠️ Сөрөг (түр) oid ОРОХГҮЙ: нэмсэн мөр нь `adds`-аараа бүтнээрээ
       *    payload дотор явдаг тул `insertAdds` түүнийг дахин байрлуулна.
       * ⚠️ 1,400 мөрийн бүтэн толь БИЧИХГҮЙ: payload нь 80,000 тэмдэгтийн
       *    хязгаартай, толь ганцаараа түүнийг халина.
       */
      const usedOids = new Set<number>();
      for (const k of [...Object.keys(pend2), ...Object.keys(pendDate2)]) {
        const o = Number(k.slice(0, k.indexOf(":")));
        if (Number.isFinite(o) && o >= 0) usedOids.add(o);
      }
      const rowKeys: [number, string][] = [];
      for (const r of freshRows) if (usedOids.has(r.oid)) rowKeys.push([r.oid, rowKeyOf(r)]);

      /* ⚠️ ХУРИМТЛАГДСАН (cumulative) — хуучин илгээлт дээр НЭГТГЭНЭ. Дарж
         бичвэл өмнөх удаа илгээсэн нүд чимээгүй унтарч, хянагч дутуу
         өгөгдөл батална.

         ⚠️ ГАНЦ УУЧЛАЛ: урсгал `Шилжүүлсэн` (батлагдсан) байхад `sub|` мөр
         үлдсэн бол тэр нь `closeSubmission` унасны ҮЛДЭГДЭЛ — түүний агуулга
         архивт АЛЬ ХЭДИЙН орсон. Тэр үед НЭГТГЭХГҮЙ, дарж бичнэ: эс бөгөөс
         батлагдсан нүднүүд хуучин (устсан) ObjectID-тайгаа дараагийн
         илгээлтэд наалдаж, батлах шатанд «тулгагдсангүй» гэж бүхэл илгээлтийг
         зогсооно. */
      /* ⚠️ ЗӨВХӨН ТУХАЙН ӨДРИЙН ИЛГЭЭЛТ ДЭЭР НЭГТГЭНЭ (2026-09-07). `staged`
         нь одоо `loadActiveSubmission(pkg.key, todayFillMs)`-аас ирдэг тул
         аль хэдийн өнөөдрийнх, гэхдээ ЭНД ДАХИН тулгана: шөнө дунд өнгөрөх,
         хуучин (дагаваргүй) мөр өөр өдрөөр орж ирэх, эсвэл ирээдүйд өөр зам
         `staged`-ыг тавих зэрэг тохиолдолд ӨӨР ӨДРИЙН нүднүүд өнөөдрийн
         payload-д хуулагдаж, батлагдахад архивт ХОЁР УДАА тоологдоно. Өдөр
         зөрвөл нэгтгэхгүй — тэр илгээлт ӨӨРИЙН мөрөөрөө үлдэнэ. */
      /* ⚠️ `residual` мөр (2026-09-25 аудит) — архивт ороогүй үлдэгдэл тул «Шилжүүлсэн»
         урсгалын дор ч НЭГТГЭНЭ (ачаалах эффектийн `useSub`-тай ижил дүрэм). */
      let mergeBase: SubmissionPayload | null = null;
      if (staged
        && staged.payload.fillMs === fillMs
        && (!flow || flow[HF.status] !== STATUS.transferred || staged.payload.residual === true)) {
        /* ⚠️ 2026-10-04 дахин аудит (#1): хуучин payload-ын давтамжийг суурь жаазаас нөхөөд зөөнө */
        const mv = movePayload(await ensureFrameOcc(pkg, sc, staged.payload, freshRows));
        /* ⚠️ ГАРЦ: тулгаж чадаагүй нүдийг нэрлэж ИЛ асууна — «Үгүй» бол урьдын адил зогсоно (ноорог
           хэвээр). «Тийм» бол тэр нүд ӨМНӨХ илгээлтээс ХАСАГДАНА (дутуу тоологдоно — ил, засагдана;
           буруу мөрөнд буух/давхардахаас аюулгүй). */
        if (mv.lost.length && !window.confirm(tr(
          'Өмнөх илгээлтийн {0} нүдийг шинэ хүснэгтийн мөрөнд тулгаж чадсангүй (ижил нэртэй мөр олон эсвэл мөр хасагдсан): {1}. Тэдгээрийг өмнөх илгээлтээс ХАСААД үргэлжлүүлэх үү? (Үгүй — илгээхгүй, ноорог хэвээр.) Хассан нүдийг дараа нь гараар дахин бөглөнө үү.',
          mv.lost.length, describeUnmoved(mv.lost, staged.payload.rowKeys, sc.bld).join('; '),
        ))) throw new Error(stale);
        mergeBase = mv.p;
      }
      /*
       * ⚠️ ӨНЧИН СӨРӨГ OID-ИЙН НҮД ОРОХГҮЙ (2026-09-21-ний аудит). Түр (сөрөг)
       *    oid-той нүд нь нэгтгэх суурийн (`mergeBase`, өмнө илгээсэн) `adds`-д
       *    мөртэй байх ЁСТОЙ; эс бөгөөс `moveKeys` сөрөгийг өнгөрүүлж, батлах
       *    шатанд `overlaySubmission` мөрийг олохгүй → `unmoved > 0` → багц гацна.
       *    2026-09-24: локал `adds` байхгүй — ЗӨВХӨН `mergeBase`-ээс (хуучин
       *    ноорог, нийлүүлэлтээр ирсэн сүнс нүдний СҮҮЛЧИЙН хамгаалалт).
       */
      const addOids = new Set<number>((mergeBase?.adds ?? []).map((a) => a.oid));
      const notOrphan = (k: string) => {
        const o = Number(k.slice(0, k.indexOf(":")));
        return !(o < 0) || addOids.has(o);
      };
      /*
       * ⚠️ ХУУЧИН (НИЙТ) ИЛГЭЭЛТ ДЭЭР НЭГТГЭХ (2026-09-25, шилжилтийн өдөр л).
       *    Энэ өдрийн идэвхтэй илгээлт өөрчлөлтөөс ӨМНӨ (туггүй — НИЙТ утгатай)
       *    хадгалагдсан бол горимыг ХОЛИХГҮЙ (`mergeSubmission` throw хийнэ): шинэ
       *    НЭМЭЛТИЙГ дэлгэцийн суурь (энэ хуудасны `rows` = архив + тэр илгээлт)
       *    дээр нэмж НИЙТ болгоод хуучин горимоор нь илгээнэ — хэрэглэгчийн харсан
       *    тоо яг тэр хэвээр батлагдана. Дараагийн өдрөөс илгээлт бүр `'inc'`.
       */
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
      /* ⚠️ 2026-10-04 аудит (#3): энэ илгээх оролдлогын танигч (`SubmissionPayload.nonces`) */
      const nonce = newNonce();
      /* ⚠️ 2026-10-06: энэ табынх гэж тэмдэглэнэ (`mayClearInflight`) */
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
      const payload = mergeSubmission(mergeBase, {
        /* ⚠️ НЭМЭЛТИЙН туг (2026-09-25) — хуучин суурь дээр нэгтгэхэд л туггүй (дээрх ⚠️) */
        ...(legacyBase ? {} : { mode: 'inc' as const }),
        pkgKey: pkg.key,
        user: user?.username ?? "",
        at: Date.now(),
        fillMs,
        /* ⚠️ Зөвхөн МЭДЭЭЛЭЛ: аль архивын агшин дээр бичсэнийг тэмдэглэнэ. */
        base: fresh0.snapshot ?? snapMs,
        /* ⚠️ `null ≠ 0`: өөрсдөө өөрчлөөгүй бол `null` — эс бөгөөс хуучин
           утгаараа дарж бүх мөрийн ТӨЛӨВЛӨГӨӨТ хувийг буцаана. */
        asOf: asOf !== asOfOrig ? asOf : null,
        cells: cellsOut,
        dates: datesOut,
        /* ⚠️ 2026-09-24: энэ хуудас мөр нэмэхгүй — `[]`. `mergeSubmission` нь
           `mergeBase`-ийн (өмнө илгээсэн) `adds`-ыг ХЭВЭЭР үлдээнэ. */
        adds: [],
        rowKeys,
        /* ⚠️ 2026-10-04 аудит (#2): давтамжийн дугаар — СУУРЬ жаазаар (`freshRows`), батлах үед
           шинэ жааз руу зөөхөд ЯГ тулгана (`SubmissionPayload.rowOcc`). */
        rowOcc: rowOccOf(freshRows, usedOids),
        /* ⚠️ 2026-10-04 аудит (#3): энэ оролдлогын танигч — хариу тасарвал «буусан уу»-г ЯГ мэднэ */
        nonces: [nonce],
      });
      /* ⚠️ 2026-10-04 (#2): нэгтгэсэн payload-ын БҮХ эерэг oid-ийн давтамжийг суурь жаазаар дахин
         бодно — `mergeBase` нь аль хэдийн `freshRows` руу зөөгдсөн (`movePayload`). */
      payload.rowOcc = rowOccOf(freshRows, payload.rowKeys.map(([o]) => o));

      /* ⚠️ ХАДГАЛАЛТ УНАВАЛ ЮУ Ч БОЛООГҮЙ: хяналтын бүртгэл үүсгэвэл хянагч
         хоосон илгээлт рүү заасан мөр авна. Тиймээс алдааг ил гаргаж зогсоно
         (ноорог хэвээр). */
      /*
       * ⚠️ СУУРИЙН ТУЛГАЛТ (optimistic concurrency, 2026-09-04-ний аудит).
       *    Дээрх «өөр хэрэглэгч илгээсэн үү» шалгуур нь ХОЁР ТУСДАА уншилтын
       *    хооронд задгай цонхтой бөгөөд `payload.at` нь КЛИЕНТИЙН цагаар
       *    бичигддэг тул цагийн зөрүүтэй хоёр машин дээр эрэмбийн харьцуулалт
       *    чимээгүй давдаг байв — өөр хэрэглэгчийн илгээсэн нүднүүд ул мөргүй
       *    устана. Тусгайлан бичсэн `expect` параметр нь дуудагдаагүй тул
       *    ҮХМЭЛ КОД байсныг ЭНД холбов: суурийг БИЧИХ АГШИНД нь дахин тулгана.
       *    (`null` = «мөр байхгүй байх ёстой».)
       */
      /* ⚠️ `expect` нь ТЭР ӨДРИЙН мөрийн `at` — `mergeBase`-тэй ИЖИЛ нөхцөл.
         Өдөр зөрсөн `staged`-ыг expect болгон явуулбал `saveSubmission` тэр
         өдрийн мөр (эсвэл түүний байхгүйг) шалгаж чадахгүй, «өөр хэрэглэгч
         илгээсэн» гэсэн ХУДАЛ алдаа гарч гүйцэтгэгч гацна. */
      const expectAt = staged && staged.payload.fillMs === fillMs ? { at: staged.at } : null;
      /*
       * ⚠️ 2026-10-04 аудит (#3): ЯВЖ БУЙ ИЛГЭЭЛТИЙН ТЭМДЭГ — хадгалахаас ӨМНӨ бичнэ (`Inflight`-ийн ⚠️).
       *    Хариу тасарвал (throw/timeout/таб хаагдсан) дараагийн ачаалалт эсвэл «Илгээх» серверийн
       *    илгээлтэд энэ `nonce` байгаа эсэхээр «буусан уу»-г ЯГ шийднэ (давхар илгээхгүй).
       *    Мөн хадгалалт явж байхад гарах/хаахыг АСУУНА (`setNavDirty` → `beforeunload` · Portal).
       */
      {
        /* ⚠️ 2026-10-04 дахин аудит (#5): илгээх нүдний мөрийн танигч (хуудасны ба шинэ жаазны) — дараа нь
           жааз солигдсон бол түлхүүрийг зөөж баримт тавихад (`inflightKeys`) */
        const sOids = new Set<number>();
        for (const [k] of sentList) { const o = Number(k.slice(0, k.indexOf(':'))); if (Number.isInteger(o) && o >= 0) sOids.add(o); }
        const rk: [number, string][] = [];
        const rkSeen = new Set<number>();
        for (const r of [...pageRows, ...freshRows]) {
          if (sOids.has(r.oid) && !rkSeen.has(r.oid)) { rkSeen.add(r.oid); rk.push([r.oid, rowKeyOf(r)]); }
        }
        saveInflight(pkg.key, {
          v: 1, nonce, fillMs, at: Date.now(), asOf: asOf !== asOfOrig ? asOf : null,
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
      if (!sv.ok) throw new Error(sv.error);
      clearInflight(pkg.key);
      const nCells = Object.keys(pend2).length + Object.keys(pendDate2).length;
      /* ⚠️ TOMBSTONE — ИЛГЭЭСЭН түлхүүр бүрд (2026-09-25-ны аудит, доорх ⚠️) */
      /*
       * ⚠️ 2026-10-04 аудит (#4 · #10): TOMBSTONE + БАРИМТ ИЛГЭЭСЭН АГШНААР (`stamp()` — логик цаг,
       *    нийлүүлсэн бүх агшнаас хожуу). Урьд нь нүдний ӨӨРИЙН агшнаар (`sentAt`) тамгалдаг тул
       *    илгээлтийн уралдааны цонхонд Б-гийн засварласан хуулбар (5 → 8) БҮТНЭЭРЭЭ үлдэж дараагийн
       *    илгээлтэд 5 + 8 = 13 болж ДАВХАР тоологддог байв. Одоо баримт (`Draft.rcpt` — илгээсэн утга
       *    `sv`, түүний агшин `sa`) нь хуулбар бүрийг шийднэ: илгээсэн хувилбар/өвөг → хасна,
       *    илгээлтээс өмнөх мөчрийн засвар → ЗӨРҮҮ (8 − 5 = +3, анхааруулгатай), баримтыг харсны
       *    дараах бичилт → хөндөхгүй (`rcptApply`). `del` нь хуучин клиентэд хэвээр бичигдэнэ.
       */
      const pubAt = stamp();
      delRef.current = new Map();
      for (const [k, v, sa] of sentList) {
        delRef.current.set(k, pubAt);
        rcptRef.current.set(k, [k, pubAt, v, sa || pubAt]);
      }
      /*
       * ⚠️ 2026-10-04 аудит (#1, CRITICAL): ӨМНӨХ ЖААЗНЫ (хуучин oid-той) хуулбарууд ч — локал
       *    ноорогт үлдсэн, ИЛГЭЭСЭН мөрд зөөгдөх түлхүүр бүрд ижил баримт. Урьд нь зөвхөн `pending`
       *    ба `oidMap`-ийн түлхүүр tombstone-догддог байсан тул (F5-ын дараа `oidMap` хоосон) хуучин
       *    хуулбар дараагийн сэргээлтэд шинэ мөр рүү ДАХИН зөөгдөж «илгээгээгүй» болон гарч ирдэг байв.
       */
      {
        const ld = readDraft(pkg.key);
        if (ld?.rowKeys?.length) {
          const sentBy = new Map(sentList.map(([k, v, sa]) => [k, [v, sa] as const]));
          /* ⚠️ 2026-10-04 дахин аудит (#9): ноорог — өөр жаазны хуулбараас нэгддэг тул `sameFrame = false` */
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
      /* ⚠️ 2026-10-04 дахин аудит (#4): ЗӨВХӨН өөрийн зорилтыг цэвэрлэнэ (бусдынх хэвээр) */
      clearMyTgt();
      /*
       * ⚠️ ИЛГЭЭЛТ ХАДГАЛАГДЛАА — ТӨЛӨВИЙГ ЭНД, ДАРААГИЙН `await`-ААС ӨМНӨ
       *    ТУСГАНА (2026-09-25-ны аудит). Урьд нь `staged`/`pending` нь дэлгэцийн
       *    дахин ачаалалтын (`loadRows` → `readActiveSubmission`) ДАРАА л
       *    шинэчлэгддэг байв: тэр хооронд сүлжээ тасрахад `catch` руу орж `staged`
       *    хуучин `at`-тай үлдэж, дахин «Илгээх» дарахад ӨӨРИЙН илгээлтийг «өөр
       *    хэрэглэгч илгээсэн» гэж зогсоодог (зөвхөн F5 аварна), илгээсэн нүд
       *    ногоон хэвээр үлддэг байв.
       *
       * ⚠️ TOMBSTONE (2026-09-25-ны аудит — 2026-09-21-ний «ноорог бүрэн
       *    цэвэрлэгдэнэ» шийдвэрийг ӨӨРЧЛӨВ). Алсын мөрийг устгах нь ЗӨВХӨН энэ
       *    хөтчийг цэвэрлэдэг: өөр төхөөрөмжийн 3 хоногийн локал ноорог ба бусад
       *    оролцогчийн дэлгэцийн `pending` илгээгдсэн нүднүүдийг ногоон
       *    «илгээгээгүй» болгож буцаан авчирч, дараагийн засвараар алсад дахин
       *    бичдэг байв (дахин илгээвэл бууралт). Одоо илгээсэн түлхүүр бүрд
       *    ИЛГЭЭСЭН УТГЫН агшны (`sentAt`) tombstone тавьж, хадгалах эффект хоосон + del-тэй
       *    ноорог бичнэ — `mergeDrafts` тэр агшнаас ӨМНӨ хөндсөн хуулбарыг хаа ч
       *    хасна, ХОЖУУ бичсэн (шинэ засвар) нүдийг үлдээнэ. Хуучин (`oidMap`-аар
       *    зөөгдөхөөс өмнөх) ба шинэ түлхүүр ХОЁУЛАА — бусад хуулбар аль нэгийг нь
       *    агуулна. Tombstone 7 хоногт (`DEL_TTL_MS`) хуучирч, ноорог цэвэрлэгдэнэ.
       * ⚠️ Хамтын төлөв (эзэмшил · «дуусгасан») ч тэглэгдэнэ — `done: []` нь
       *    бусдын тэмдэглэгээг нийлүүлэлтээр ИЛ буцаана (хадгалах эффектийн
       *    цэвэрлэлтийн замтай ижил зорилго).
       */
      keepDraftRef.current = false;
      /* ⚠️ БҮТНЭЭР нь цэвэрлэж болно, учир нь `busy` үед засварын БҮХ зам
         (нүд нээх · буулгах · календар) ХААЛТТАЙ (`RO.busy`, 2026-09-25-ны аудит) —
         урьд нь илгээлтийн `await`-уудын завсарт бичсэн нүд энд чимээгүй арилдаг байв. */
      setPending({});
      setPendDate({});
      mineRef.current = new Set();
      mineAtRef.current = new Map();
      /* ⚠️ 2026-10-01: «дуусгасан» тэмдэг бүрийг ИЛ буцаана (`undoAllMarks`) — шинэ мөчлөг.
         Урьд нь `done: []` бичиж «нэр алга = буцаасан» дүрмээр арчдаг байв (тэр дүрэм
         хүчингүй — `draft.Draft.marks`-ийн ⚠️). */
      undoAllMarks();
      setByMap(new Map());
      setByAtMap(new Map());
      /* Огнооны өөрчлөлт илгээлтэд суусан — `dirtyCount`-д дахин тоологдохгүй */
      setAsOfOrig(asOf);
      /* ⚠️ Нэгтгэх суурь = ДӨНГӨЖ хадгалсан мөр (`saveSubmission` нь `at: payload.at` бичдэг) */
      const savedSub: StagedSubmission = { oid: sv.oid, at: payload.at, done: false, payload };
      setStaged(savedSub);
      /* ⚠️ Илгээсэн тоо дэлгэцээс түр ч АЛГА БОЛОХГҮЙ: `pending` цэвэрлэгдсэн тул
         дөнгөж хадгалсан payload-ыг суурь жааз (`freshRows`) дээр шууд давхарлана;
         доорх дахин ачаалалт амжилттай бол серверийн хувилбараар солигдоно. */
      const ovNow = overlaySubmission(freshRows, payload, sc, nBld);
      setRows(ovNow.rows);
      /* ⚠️ 2026-09-30: давхарлалтын СУУРЬ ч шинэчлэгдэнэ — «батлагдсан» хувь (`usePkgPct`) ба
         нүдний «өмнөх · энэ удаа» тайлбар түүнээс; урьд нь илгээсний дараа хоосон/хуучин үлддэг байв. */
      setOvBase(new Map(freshRows.map((x) => [x.oid, x] as const)));
      /* ⚠️ ГАРААР СОНГОСОН буцаалт ДУУСЛАА (2026-09-25-ны аудит): урьд нь
         `resumedOid` зөвхөн багц солиход тэглэгддэг тул дараагийн «Илгээх» ч
         буцаагдсан илгээлтийн өдрөөр (`fillMs`) явж, өнөөдрийн нүд хянагдаж буй
         тэр илгээлтэд нийлж, архивт хуучин `buglusun_ognoo`-оор орж байв. */
      setResumedOid(null);
      setStagedOid(sv.oid);
      setStagedFillMs(fillMs);
      /*
       * ⚠️ 2026-10-05: БАРИМТЫГ АЛСЫН НООРОГТ ШУУД БИЧИЖ ХҮЛЭЭНЭ (`useDraftSync.pushReceipts`-ийн ⚠️).
       *    Урьд нь баримт зөвхөн 3 сек-ийн хойшлуулсан `flush`-аар очдог тул тэр бичилт буугаагүй
       *    бол өөр төхөөрөмж илгээсэн нүдийг «илгээгээгүй» гэж ДАХИН илгээж, нэмэлтийн горимд
       *    хоёр дахин нэмэгддэг байв. `busy` хэвээр — засварын бүх зам хаалттай. Унавал илгээлт
       *    УНАХГҮЙ (аль хэдийн хадгалагдсан): төгсгөлийн мэдэгдэлд ил анхааруулна (`rcWarn`), ердийн
       *    `flush` цааш дахин оролдоно.
       */
      let rcWarn = '';
      {
        const rc = await pushReceipts(pkg.key);
        if (!rc.ok) rcWarn = tr('⚠️ илгээсэн нүдний тэмдэглэл ArcGIS-ийн ноорогт хуулагдсангүй ({0}) — автоматаар дахин оролдоно. «Ноорог хуулагдав» гэж гартал энэ хуудсыг бүү хаа, өөр компьютер/хөтчөөс энэ багцыг бүү илгээ (нүд давхар тоологдож болзошгүй).', rc.why);
      }

      /*
       * ── ХЯНАЛТАД АВТОМАТААР ОРУУЛНА ──────────────────────────────────
       * ⚠️ `Эх_мөрийн_дугаар` нь одоо ИЛГЭЭЛТИЙН мөрийн OBJECTID (архивынх
       *    БИШ) — хянагч түүгээр илгээлтийг олж, архивын сүүлийн жааз дээр
       *    давхарлаж харна.
       *
       * ⚠️ БҮРТГЭЛ УНАВАЛ ИЛГЭЭЛТ УНАХГҮЙ: payload аль хэдийн хадгалагдсан
       *    тул «болсонгүй» гэж харуулбал хэрэглэгч дахин дарж, хяналтын
       *    дараалалд давхардсан мөр үүснэ. Оронд нь ил анхааруулж, «Хяналтад
       *    илгээх» товчоор ЯГ ижил хосыг давтана.
       */
      /* ⚠️ Хуудсын нэр ЗААВАЛ — `flow`-ийн шүүлт түүгээр 9F/12F-ийг ялгадаг.
       ⚠️ `pkg.name` (орчуулагддаггүй) — `label` бол хэл солиход `Ажлын_нэр`
          өөр текстээр бичигдэж, `flow`-ийн тулгалт тасарна (2026-09-21). */
      const rv = await submitForReview(pkg.group, fillMs, sv.oid, pkg.name);
      /* ⚠️ Амжилттай бүртгэгдсэн илгээлтийг ТЭМДЭГЛЭНЭ — «өнчин илгээлт»-ийн
         эффект хяналтын жагсаалт шинэчлэгдэх хүртэлх завсарт ХУДАЛ
         анхааруулга гаргахгүйн тулд (доорх `registeredRef`-ийн ⚠️). */
      if (rv.ok) registeredRef.current.add(sv.oid);
      setSubmitFailed(!rv.ok);
      /* Хяналтын жагсаалтыг шинэчилнэ — `hyanalt.addRows` нь `hyanaltStore`-ын
         кэшийг мэддэггүй тул үүнгүйгээр «хяналтад байна» мэдэгдэл гарахгүй. */
      if (rv.ok) reloadHy();
      /* ⚠️ БУЦААЛТЫН УЛААН ТЭМДЭГЛЭГЭЭ (`backChg`) ДУУСЛАА (2026-09-25-ны аудит):
         илгээлт дахин хянагч руу явсан тул «ӨӨРЧЛӨГДСӨН — дарж зөвшөөрнө үү»
         гэсэн улаан хүрээ утгагүй; `backOk` нь өөрийн эффектээр тэглэгддэг
         байхад энэ нь үлддэг байв. Бүртгэл унасан (урсгал буцаагдсан хэвээр)
         бол хэвээр үлдээнэ. */
      if (rv.ok) setBackChg(new Set());

      /* ── ДЭЛГЭЦИЙГ ДАХИН БҮТЭЭНЭ ──
         ⚠️ Илгээсэн тоо дэлгэцээс АЛГА БОЛОХ ЁСГҮЙ: архивт юу ч бичигдээгүй
         тул суурь жаазыг дахин татаад ДЭЭР нь илгээлтээ давхарлана. Эс
         бөгөөс гүйцэтгэгч ажлаа алдсан гэж бодож дахин бөглөнө.
         ⚠️ ТУСДАА try (2026-09-25-ны аудит): илгээлт аль хэдийн хадгалагдсан тул
         энд унавал «илгээгдсэнгүй» гэж харуулахгүй — дэлгэц дээрх ЛОКАЛ
         давхарлалт (`ovNow`) хэвээр үлдэж, уншилт унасныг `subReadErr`-ээр ил хэлнэ. */
      try {
        const next = await loadRows(pkg, sc);
        /* ⚠️ ӨНӨӨДРИЙН түлхүүрээр — дээрх ачаалах эффекттэй ижил үндэслэл.
           ⚠️ Алдааг мөн ЯЛГАНА: илгээсний дараа уншилт унавал overlay
           хийгдэхгүй, дэлгэц 0% болж «дөнгөж илгээсэн ажил алга» гэсэн хамгийн
           айдас төрүүлэм дүр зураг гарна. Уншилт унасныг ил хэлж, суурь
           жаазыг хэвээр үлдээнэ.
           ⚠️ 2026-09-25: уншилт УНАВАЛ `staged`-ыг `null` болгохгүй — дөнгөж
           хадгалсан `savedSub` хэвээр (эс бөгөөс дараагийн «Илгээх» өөрийн
           илгээлтийг «өөр хэрэглэгч» гэж зогсооно). */
        /* ⚠️ ӨНӨӨДРИЙН ТҮЛХҮҮРЭЭР (`todayFillMs`), `fillMs`-ЭЭР БИШ (2026-09-25-ны
           аудит). Өмнөх өдрийн БУЦААГДСАН илгээлтийг үргэлжлүүлж илгээсэн бол
           `fillMs` = тэр өдөр — урьд нь дахин ачаалалт тэр мөрийг `staged` болгож
           дэлгэцэнд давхарладаг байв: `resumedOid` тэглэгдсэн тул дараагийн
           «Илгээх» өнөөдрийн түлхүүрээр явж, `mergeBase` (өдөр зөрсөн) хоосон,
           өнөөдрийн мөрийг «өөр хэрэглэгч илгээсэн» гэж зогсоох эсвэл НЭГТГЭЛГҮЙ
           дарж бичих эрсдэлтэй байв. Ачаалах эффекттэй ижил: өнөөдрийн илгээлт.
           Уншилт унавал `savedSub`-ийг зөвхөн ӨНӨӨДРИЙНХ бол үлдээнэ. */
        const act2r = await readActiveSubmission(pkg.key, todayFillMs);
        setSubReadErr(act2r.ok ? null : act2r.error);
        /* ⚠️ 2026-09-25 аудит: ӨМНӨХ ӨДРИЙН (буцаагдсан) илгээлтийг дахин илгээсэн бол
           өнөөдрийн түлхүүрээр мөр ОЛДОХГҮЙ тул дөнгөж илгээсэн агуулга дэлгэцээс алга
           болдог байв. Өнөөдрийн идэвхтэй илгээлт байхгүй л бол `savedSub`-ийг давхарлана —
           дараагийн «Илгээх» өнөөдрийн түлхүүрээр явж (`mergeBase` өдөр зөрсөн → хоосон,
           `expectAt` null) тэр мөрийг хөндөхгүй. Өнөөдрийнх байвал урьдын адил тэр нь. */
        const act2 = act2r.ok
          ? (act2r.sub && !act2r.sub.done ? act2r.sub : (fillMs !== todayFillMs ? savedSub : null))
          : (fillMs === todayFillMs ? savedSub : null);
        const ov2 = act2 ? overlaySubmission(next.rows, act2.payload, sc, nBld) : null;
        /* ⚠️ Илгээсний ДАРАА ч шалгана: тулгагдаагүй нүд үлдвэл батлах шатанд
           багц гацах тул хэрэглэгч ОДОО мэдэх ёстой (дээрх ⚠️). */
        setUnmovedWarn(ov2 && ov2.unmoved > 0 && act2
          ? describeUnmoved(ov2.unmovedKeys, act2.payload.rowKeys, sc.bld)
          : []);
        setStaged(act2);
        setRows(ov2 ? ov2.rows : next.rows);
        /* ⚠️ 2026-09-30: давхарлалтын суурь (дээрх `ovNow`-ийн ⚠️) */
        setOvBase(ov2 ? new Map(next.rows.map((x) => [x.oid, x] as const)) : new Map());
        /* ⚠️ `null ≠ 0` — илгээлт «Шинэчлэгдсэн огноо»-г хөндөөгүй бол архивынх. */
        const asOfNext = ov2?.asOf ?? next.asOf ?? asOf;
        setAsOf(asOfNext);
        /* ⚠️ `asOfOrig`-ыг МӨН ононо: огнооны өөрчлөлт одоо илгээлтэд суусан
           тул `dirtyCount`-д дахин тоологдох ёсгүй. */
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
      /* ⚠️ ЭНЭ ӨДРИЙН илгээлт хянагчийн гар дээр байхад дахин илгээсэн бол
         ИЛ ХЭЛНЭ (2026-09-07): хориг хасагдсан тул хэрэглэгч мэдэлгүй
         хянагчийн харж буй агуулгыг сольж болно. Шинэ ТОЙРОГ үүсээгүй —
         `submitForReview` тэр өдрийн нээлттэй бүртгэлийг л буцаана. */
      done((!rv.ok
        ? tr('Илгээлт хадгалагдлаа ({0} нүд) · ⚠️ хяналтад бүртгэгдсэнгүй: {1}', nCells, rv.error)
        : rv.reused
          /* ⚠️ `rv.reused` — ХЯНАЛТЫН ХАРИУНААС, publish-ээс өмнөх `inReview`
             тугаас БИШ (2026-09-07-ны шалгалт): тэр туг нь хуучирсан төлөвөөс
             тооцогддог тул «шинэ тойрог үүсэв» гэж ХУДАЛ мэдэгдэж болзошгүй. */
          ? tr('Энэ өдрийн илгээлт ШИНЭЧЛЭГДЛЭЭ ({0}) · {1} нүд — хянагч ({2}) шинэ агуулгыг харна.', rv.id, nCells, reviewStage ? STAGE_LABEL[reviewStage] : '')
          : tr('Хяналтад илгээв ({0}) · {1} нүд', rv.id, nCells))
        /* ⚠️ 2026-10-05: баримт алсад хуулагдаагүй бол ИЛ (дээрх `rcWarn`) */
        + (rcWarn ? ' · ' + rcWarn : ''));
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  }, [pkg, sc, nBld, asOf, asOfOrig, pending, pendDate, dirtyCount, busy, canPerf, noEdit, rows, done, reviewStage, staged, snapMs, user, reloadHy, flow, todayFillMs, canSubmitNow, waitingOn, say, resumedOid, setResumedOid, setTodayFillMs, keepDraftRef, mineRef, mineAtRef, byAtRef, delRef, undoAllMarks, setByMap, setByAtMap,
    /* 2026-10-04 аудит */
    stamp, rcptRef, btRef, datesBRef, asOfBRef, clearMyTgt, tgtMismatch, draftTgt, warn, pushReceipts,
    /* 2026-10-09 */
    pullNow]);

  /**
   * БУЦААГДСАН ИЛГЭЭЛТИЙГ ӨӨРЧЛӨЛТГҮЙ ДАХИН ИЛГЭЭХ (2026-10-04).
   * ⚠️ ЯАГААД: `publish` нь `dirtyCount === 0` үед юу ч хийдэггүй тул хянагч алдаатай буцаасан
   *    (эсвэл тайлбар өгөөд ижил тоогоо дахин хянуулах) үед гүйцэтгэгч «хуурамч» засвар хийхээс
   *    өөр замгүй байв. `sub|` мөрийн агуулга ХЭВЭЭР — зөвхөн шинэ хяналтын тойрог нээнэ
   *    (`submitForReview` → `openReviewRow` нь компанийн гар дээрх мөрийг «жинхэнэ дахин
   *    илгээлт» гэж танина; аль хэдийн нээлттэй бол `reused`).
   * ⚠️ Нэмэлт тайлбар ХАДГАЛАХГҮЙ — хяналтын хүснэгтэд гүйцэтгэгчийн тайлбарын талбар алга.
   */
  const resendAsIs = useCallback(async () => {
    if (busy || !sc || !staged || staged.done || !curTgtOn || dirtyCount > 0 || locked) return;
    if (noEdit) { setErr(RO.viewOnly); return; }
    if (!window.confirm(tr('Буцаагдсан илгээлтийг ({0}) ӨӨРЧЛӨЛТГҮЙ, хэвээр нь дахин хяналтад илгээх үү? Хянагч өмнөх агуулгыг дахин хянана.', msToDay(staged.payload.fillMs)))) return;
    setBusy(true);
    setErr("");
    try {
      const rv = await submitForReview(pkg.group, staged.payload.fillMs, staged.oid, pkg.name);
      if (!rv.ok) { setErr(rv.error); return; }
      registeredRef.current.add(staged.oid);
      setSubmitFailed(false);
      reloadHy();
      /* ⚠️ 2026-10-06: ГАРААР СОНГОСОН буцаалт ДУУСЛАА — `publish`-ийн `setResumedOid(null)`-тэй ИЖИЛ
         шалтгаан (тэнд ⚠️ 2026-09-25). Урьд нь энд тэглэгддэггүй тул дараа нь өнөөдрийн ажлыг бөглөөд
         «Илгээх» дарахад `curTgtOn` үнэн хэвээр, `fillMs` = `staged`-ийн өдөр болж өнөөдрийн нэмэлт
         ХЯНАГДАЖ БУЙ тэр өдрийн илгээлтэд нийлдэг байв. Буцаалтын улаан тэмдэглэгээ ч дууслаа. */
      setResumedOid(null);
      setBackChg(new Set());
      /* ⚠️ 2026-10-06: `staged` өөр өдрийнх бол ӨНӨӨДРИЙН идэвхтэй илгээлтийг дахин ачаалж давхарлана —
         `publish`-ийн илгээсний дараах дахин ачаалалттай ИЖИЛ (өнөөдрийн түлхүүр). Уншилт унавал
         `staged`-ыг тэглэнэ (өөр өдрийнхийг суурь болгож үлдээхгүй), алдааг `subReadErr`-ээр ил хэлнэ. */
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
  }, [busy, sc, staged, curTgtOn, dirtyCount, locked, noEdit, pkg, nBld, asOf, todayFillMs, setResumedOid, reloadHy, done]);

  // Ctrl+S — «Гүйцэтгэл бөглөх»-тэй ижил.
  // ⚠️ Нээлттэй нүдний бичиж буй утгыг ЭХЛЭЖ commit хийнэ — эс тэгвэл хуучин
  // pending-ээр нийтлээд, оролтын утга дараа нь blur дээр эргэж dirty болж
  // хэрэглэгч «хадгалагдсан» гэж андуурдаг байв. commit нь state-д дараагийн
  // render дээр л тусах тул нийтлэлийг дарааллуулж эффектээр гүйцээнэ.
  const [publishQueued, setPublishQueued] = useState(false);
  /** ⚠️ 2026-09-30: `false` = нээлттэй нүдний утга НЯЦААГДСАН (тоо биш · тодорхойгүй · асуултад «Цуцлах») */
  const flushEditRef = useRef<() => boolean>(() => true);
  /* ⚠️ Нээлттэй нүдийг ref-д тольдоно — нийлүүлэлтийн мөчлөг «одоо бичиж
     байна уу» гэдгийг эндээс уншиж, бичиж байх зуур дэлгэц үсрэхээс сэргийлнэ.
     ⚠️ 2026-10-01: render дунд биш `useSyncRef`-ээр (layout эффект — БҮХ passive эффект,
     интервал, үйл явдлаас ӨМНӨ commit-д тусна; уншигчид нь бүгд тэдгээр тул утга ижил). */
  useSyncRef(editRef, edit);
  useSyncRef(pickRef, pick);
  useSyncRef(flushEditRef, () => {
    if (edit && rowsAll[edit.i])
      return commit(rowsAll[edit.i], edit.b, inputRef.current?.value ?? val);
    return true;
  });
  useEffect(() => {
    if (!publishQueued || edit) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-10-01: Ctrl+S-ийн дараалал — нээлттэй нүдний утга төлөвт тусмагц `publish` (async гаднын нөлөө) дуудна; render-д хийх боломжгүй
    setPublishQueued(false);
    publish();
  }, [publishQueued, edit, publish]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (hiddenNow()) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        /* ⚠️ 2026-09-30: нээлттэй нүдний утга НЯЦААГДВАЛ (тоо биш, «1,250», хэтрэлтийн
           асуултад «Цуцлах») ИЛГЭЭХГҮЙ. Урьд нь үлдсэн нүднүүд илгээгдэж, ганц
           мэдэгдлийн байрыг «✓ Хяналтад илгээв» эзэлж, няцаагдсан утгын шар
           анхааруулга алга болдог байв — хэрэглэгч тэр утга орсон гэж андуурна. */
        if (flushEditRef.current()) setPublishQueued(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const floorOpts = useMemo(() => pkgFloors(pkg.group), [pkg.group]);

  /** Толгойн 2-р мөр — блокуудыг барилгын төрлөөр нь бүлэглэсэн нь. */
  const bands = useMemo(
    () => (sc ? seriesBands(pkg.key, sc.bld) : []),
    [pkg.key, sc],
  );

  // ⚠️ Үйлчилгээнд ХАДГАЛАГДСАН огноо тайлангийн жагсаалтад байхгүй байж болно
  // (жишээ нь 2026-07-05). Түүнийг сонголт болгож нэмэхгүй бол `<select>`
  // өөрөө өөр огноо руу үсэрч, төлөвлөгөөт хувь чимээгүй өөрчлөгдөнө.
  const dateOpts = useMemo(() => {
    const cur = dt(asOf);
    return [...new Set(cur ? [...dates, cur] : dates)].sort();
  }, [dates, asOf]);

  // ⚠️ Алдаа гарсан ч эрт `return` хийхгүй — эс тэгвэл багц сонгогч алга болж
  // хэрэглэгч өөр багц руу шилжих аргагүй үлдэнэ.
  /*
   * ТОМИЛГООГҮЙ ХЭРЭГЛЭГЧ — хоосон хуудас БИШ, шалтгааныг ил хэлнэ.
   *
   * ⚠️ Багцын хуваарилалт fail-closed болсноор (2026-08-28) томилогдоогүй хүнд
   * нэг ч багц нээгдэхгүй. Тайлбаргүй хоосон сонгогч нь «систем эвдэрсэн» гэж
   * ойлгогдох тул юу хийхийг нь шууд зааж өгнө.
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
  // eslint-disable-next-line react-hooks/refs -- ⚠️ 2026-10-01: render-ийн агшны хэмжилтийг урьдын адил шууд уншина (урьд нь JSX дотор 2 газар); state болговол өндөр солигдох бүрд нэмэлт render гарч зан төлөв өөрчлөгдөнө
  const rowH = rowHRef.current;

  return (
    <div className={`${st.wrap} ${wide ? st.wrapFull : ""}`} ref={wrapRef}>
      <div className={st.toolbar}>
        {/*
          * БӨГЛӨХ ГОРИМ — хүснэгтийг бүтэн дэлгэц болгоно.
          * ⚠️ Хэрэгслийн мөрийн ЭХЭНД: бөглөгч хуудсаа нээмэгц эхлээд
          *    дардаг товч тул хайх шаардлагагүй байрлалд.
          * ⚠️ Хяналтын горимд (`locked`) ч ГАРНА: хянагч ч мөн 60 багана
          *    × 1,400 мөрийг үзэх шаардлагатай.
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
        {/*
          * ⚠️ ЗАСВАР НЭЭХ товч — бүтэн дэлгэцээс ТУСДАА. Хяналтын
          *    горимд (`locked`) ба эрхгүй үед (`!canPerf`) огт гарахгүй:
          *    дарж болдоггүй товч нь эвдэрсэн мэт мэдрэгдэнэ.
          * ⚠️ 2026-10-07: ЗӨВХӨН `obyemEdit` эрхтэй (гүйцэтгэл бөглөх эрхгүй) хүнд ч ГАРНА —
          *    «Инж. төлөвлөсөн обьём» нүд `editing`-ийг шаарддаг (`PvCell.canEdit`) атлаа товч
          *    `canPerf`-гүйд гардаггүй тул тэр хүн тэр баганыг ХЭЗЭЭ Ч засаж чаддаггүй байв.
          *    Гүйцэтгэлийн нүд `noPerf = … || !canPerf` хэвээр түгжээтэй.
          */}
        {!locked && (canPerf || canObyemEdit) && (
          <button
            type="button"
            className={editing ? st.editBtnOn : st.editBtn}
            onClick={() => setEditing((v) => !v)}
            aria-pressed={editing}
            title={editing
              ? tr('Засварыг хаана — нүд дахин түгжигдэнэ')
              : canPerf
                ? tr('Нүд засах горимыг нээнэ. Хаалттай үед санамсаргүй товшилтоор тоо өөрчлөгдөхгүй.')
                : tr('Зөвхөн «Инж. төлөвлөсөн обьём» баганыг засах горимыг нээнэ — гүйцэтгэлийн нүд таны эрхэд хаалттай.')}
          >
            <span aria-hidden>{editing ? '🔓' : '✎'}</span>
            {editing ? tr('Засаж байна') : tr('Бөглөх')}
          </button>
        )}
        <FilterBar
          locked={locked} busy={busy} noPerf={noPerf} fillMode={fillMode} toggleFill={toggleFill}
          pkg={pkg} setPkg={setPkg} confirmSwitch={confirmSwitch} groupOpts={groupOpts} floorOpts={floorOpts}
          asOf={asOf} setAsOf={setAsOfUser} dateOpts={dateOpts}
          grpA={grpA} setGrpA={setGrpA} grpAOpts={grpAOpts} grpBEff={grpBEff} setGrpB={setGrpB} grpBOpts={grpBOpts}
          byPlan={byPlan} setByPlan={setByPlan} today={today} planCount={planCount} resized={resized} resetAll={resetAll}
        />
        {/* ⚠️ 2026-10-06 аудит: бөглөх эрхгүй (`!canPerf`) хүнд «Илгээх»/«Дуусгасан» ОГТ гарахгүй —
            урьд нь «Дуусгасан» дарж оролцогч болж бусдын «Илгээх»-ийг түгждэг байв. Шалтгааныг ил хэлнэ. */}
        {canPerf ? (
          <SubmitControls
            locked={locked} canSubmitNow={canSubmitNow} publish={publish} busy={busy} noEdit={noEdit}
            dirtyCount={dirtyCount} iAmDone={iAmDone} toggleDone={toggleDone} waitingOn={waitingOn}
            waitingLast={waitingLast}
            resendAsIs={curTgtOn && !tgtMismatch ? () => void resendAsIs() : undefined}
          />
        ) : !locked && (
          <span className={st.muted} role="status">{tr('Танд энэ багцыг бөглөх эрхгүй')}</span>
        )}
        <Participants participants={participants} byCount={byCount} doneBy={doneBy} />
        <ObyemToolbar
          canObyemEdit={canObyemEdit} pvSub={pvSub} pvCells={pvCells} sendObyem={sendObyem} pvBusy={pvBusy}
          canObyemApprove={canObyemApprove} locked={locked} decideObyemHere={decideObyemHere} pvErr={pvErr} pvNote={pvNote}
          pvReturned={pvReturned} withdrawObyemHere={withdrawObyemHere} me={user?.username ?? ''}
          partial={pvPartial} returnStuck={pvReturnStuck} note={pvApprovedNote}
        />
        {/* ⚠️ «Нэмэлт ажил батлуулах»/буцаагдсан/хүлээгдэж буй/«Илгээлтээ татах»
            баннерууд ЭНД БАЙХГҮЙ (2026-09-24) — нэмэлт ажлын урсгал «Хуваарь»-д. */}

        {busy && <span className={st.muted}>{tr('ажиллаж байна…')}</span>}
        {/* ⚠️ ХЭЗЭЭНИЙ ӨГӨГДӨЛ ХАРАГДАЖ БАЙГААГ хэлнэ — зөвхөн МЭДЭЭЛЭЛ.
            ⚠️ «суурь жааз» гэж бичдэг байсныг болив (2026-09-06, хэрэглэгч:
            «арай илүү утгатай нэр өг — юун суурь жааз вэ»). «Жааз» нь
            архивын нэг агшны бүтэн хуулбарыг заасан ДОТООД нэр бөгөөд
            бөглөгчид ямар ч утгагүй байв. Хэрэглэгчийн асуулт нь энгийн:
            «миний харж байгаа тоо хэзээнийх вэ, миний бичсэн нь юун дээр
            нэмэгдэх вэ». Шошго яг түүнд хариулна. */}
        {!locked && snapDay && (
          <span
            className={st.muted}
            title={publishedToday
              ? tr('Хүснэгтэд харагдаж буй тоо нь ЭНЭ өдрийн батлагдсан бүртгэлийнх. Таны засвар түүн дээр нэмэгдэж илгээгдэнэ. Энэ бүртгэл өнөөдөр үүссэн.')
              : tr('Хүснэгтэд харагдаж буй тоо нь ЭНЭ өдрийн батлагдсан бүртгэлийнх. Таны засвар түүн дээр нэмэгдэж илгээгдэнэ.')}
          >
            {tr('өгөгдөл: {0}-ны байдлаар', snapDay)}
          </span>
        )}
        <PkgPctBadge pkgPct={pkgPct} pkg={pkg} dirtyCount={dirtyCount} otherPct={otherPct} />
        <DraftStatus locked={locked} dirtyCount={dirtyCount} noPerf={noPerf} dropDraft={dropDraft} savedAt={savedAt} remoteState={remoteState}
          restoring={restoringUi} offline={offline} localFail={localFail} />
      </div>
      {/* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): БУУЛГАЛТЫН УРЬДЧИЛСАН ХАРАГДАЦ — татгалзах
          нүдтэй буулгалт ШУУД бичигдэхгүй, хэрэглэгч хүснэгтэд харж шийднэ (`useCellEdit.pastePrev`). */}
      {pastePrev && (
        <div className={st.pasteBar} role="status">
          <span>
            {tr('Буулгалтын урьдчилсан харагдац: {0} нүд бичигдэнэ (цэнхэр), {1} нүд татгалзагдана (улаан ✕ — нүдэн дээр шалтгаан нь).', pastePrev.ok.size, pastePrev.rej.size)}
          </span>
          <button type="button" className={st.publishBtn} onClick={confirmPaste}>{tr('Бичих')}</button>
          <button type="button" className={st.layerBtn} onClick={cancelPaste}>{tr('Болих')}</button>
        </div>
      )}

      <FillNotices
        locked={locked} submitFailed={submitFailed} resend={resend} resending={resending} unmovedWarn={unmovedWarn}
        subReadErr={subReadErr} inReview={inReview} reviewStage={reviewStage} otherDaysInReview={otherDaysInReview}
        otherDaysReturned={otherDaysReturned} noEdit={noEdit} busy={busy} resumedOid={resumedOid}
        resumeReturned={resumeReturned} returned={returned}
      />
      {/* ⚠️ 2026-10-04 аудит (#6): ноорог нь ӨӨР (буцаагдсан) илгээлтийн засвар — сонгох хүртэл «Илгээх» түгжээтэй */}
      {tgtMismatch && draftTgt && (
        <p className={st.backNote} role="alert">
          {tr('Энэ ноорог {0}-ны буцаагдсан илгээлтийн засвар — өнөөдрийн илгээлтэд нийлүүлэхгүйн тулд «Илгээх» түгжээтэй. Тэр илгээлтийг сонгоно уу, эсвэл ноорогоо устгана уу.', msToDay(draftTgt[1]))}
          {!noEdit && (
            <button type="button" className={st.linkBtn} disabled={busy} onClick={() => void resumeReturned(draftTgt[0])}>
              {tr('Тэр илгээлтийг сонгох')}
            </button>
          )}
        </p>
      )}
      {/* ⚠️ 2026-10-04 дахин аудит (#7): ТЭМДЭГЛЭСЭН (буулгаагүй) нүд — ноорогт хадгалагдсан, 7 хоногт хаягдана;
          зөвхөн тэднийг хаях товч (илгээгээгүй ногоон нүд хөндөгдөхгүй) */}
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
      {/* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): хянагчийн зөвшөөрлийг мөртэй тулгаж
          чадаагүй (хуучин индексийн хэлбэр · жааз солигдсон) — БУРУУ нүдийг ногоон
          болгохгүй, «дахин хянах» гэж ил хэлнэ (`backOkRes`-ийн ⚠️). */}
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
        <p className={st.muted}>{tr('Энэ багцад мөр олдсонгүй.')}</p>
      )}
      {rows.length > 0 && sc && calc.length === 0 && (
        <p className={st.muted}>
          {tr('Тайлангийн огноо тодорхойлогдоогүй тул хүснэгт бодогдохгүй байна — Огноо сонгоно уу (жагсаалт ачаалагдаагүй бол хуудсыг дахин ачаална уу).')}
        </p>
      )}

      {rows.length > 0 && sc && calc.length > 0 && (
        <div className={st.scroll} ref={scrollRef} onScroll={onScroll}>
          <div className={st.tableWrap}>
          <div ref={colHlRef} className={st.colHl} aria-hidden="true" />
          <table
            className={cls("xl b32")}
            style={colStyle}
            onMouseOver={moveColHl}
            onMouseLeave={hideColHl}
          >
            <SheetHead sc={sc} nBld={nBld} bands={bands} grip={grip} />
            <tbody ref={tbodyRef}>
              {/* ⚠️ ХООСОН ТӨЛӨВ. Хуваарийн шүүлт нэг өдөрт 4 мөр үлдээж
                  болно (Багц 2·9F) — тайлбаргүй бол «хүснэгт эвдэрсэн» гэж
                  уншигдаж, хэрэглэгч товчийг унтраахаа мэдэхгүй. */}
              {vis.length === 0 && byPlan && (
                <tr>
                  <td colSpan={14 + nBld * 4} className={st.hint} style={{ padding: "14px 10px" }}>
                    {tr("Өнөөдөр ({0}) хуваарьтай ажил алга. Бүх ажлыг харах бол «Хуваарийн дагуу»-г унтраа.", today)}
                  </td>
                </tr>
              )}
              {/* Дээд ЧИГЖЭЭС — зурагдаагүй мөрүүдийн өндрийг орлоно. */}
              {winFrom > 0 && (
                <tr aria-hidden="true" style={{ height: winFrom * rowH }}>
                  <td colSpan={14 + nBld * 4} style={{ padding: 0, border: 0 }} />
                </tr>
              )}
              <FillRows
                vis={vis} winFrom={winFrom} winTo={winTo} rowsAll={rowsAll} calc={calc} addedOids={addedOids}
                collapsed={collapsed} toggle={toggle} ro={ro} editing={editing} canObyemEdit={canObyemEdit} pvSub={pvSub} sc={sc}
                pvPend={pvPend} pvPreview={pvPreview} setPvPend={setPvPend} pending={pending} byMap={byMap} fillMode={fillMode}
                ovBase={ovBase} meKey={meKey} volMode={volMode} edit={edit} view={view} backChg={backChg} backOk={backOk}
                locked={locked} noEdit={noEdit} say={say} canPerf={canPerf} busy={busy} pctOnly={pctOnly} pctHintRef={pctHintRef}
                setVal={setVal} cellSeed={cellSeed} setEdit={setEdit} hitKey={hitKey} noPerf={noPerf} pasteBlock={pasteBlock}
                inputRef={inputRef} prevHint={prevHint} val={val} commit={commit} nextEditable={nextEditable}
                nextBlockEditable={nextBlockEditable} pendDate={pendDate} setPick={setPick} asOf={asOf} asOfOrig={asOfOrig}
                warn={warn}
                restoring={restoringUi} remainHint={remainHint} pastePrev={pastePrev}
              />
              {/* Доод ЧИГЖЭЭС — гүйлгэх зурвасны урт үнэн байлгана. */}
              {winTo < vis.length && (
                <tr
                  aria-hidden="true"
                  style={{ height: (vis.length - winTo) * rowH }}
                >
                  <td colSpan={14 + nBld * 4} style={{ padding: 0, border: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <FillDatePicker pick={pick} setPick={setPick} busy={busy} say={say} setAsOf={setAsOfUser} commitDate={commitDate} pendDate={pendDate} />

      <NoticeToast notice={notice} onClose={() => setNotice(null)} />

    </div>
  );
}
