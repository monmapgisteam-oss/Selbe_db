'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { submitForReview } from '@/lib/hyanaltSubmit';
import {
  applyAdds,
  computeAll,
  loadRows,
  msToDay,
  type SheetRow,
} from "./bagtsSheet";
import {
  DOC_BAND,
  DOC_COLS,
  DOC_GROUPS,
  loadSchema,
  pkgFloors,
  PKG_GROUPS,
  PKGS,
  type Pkg,
  type Schema,
} from "./bagts.pkg";
import { OWNER, F as HF } from "@/lib/hyanalt";
import { useHyanaltRows } from "@/lib/hyanaltStore";
import { bagtsScope, subscribeAcl } from "@/lib/guitsetgelAcl";
import { hasCap, subscribeCaps } from "@/lib/caps";
import { negjOf } from "./negj";
import { useAuth } from "@/components/AuthGate";
import DatePicker from "./DatePicker";
import { seriesBands } from "./bagts.bands";
import { sheetDates } from "./sheetRows";
import { useColWidths } from "./colWidths";
import { t as tr } from "@/lib/i18nCore";
import st from "./sheet.module.css";

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

const cls = (names: string) =>
  names.split(/\s+/).filter(Boolean).map((n) => st[n] || n).join(" ");

// ── Нийтлээгүй засварын НООРОГ (localStorage) ──
// «Гүйцэтгэл бөглөх» (Pivot)-ын хамгаалалттай ижил зорилго: таб санамсаргүй
// хаагдах / сүлжээ тасрахад бөглөсөн нүд алдагдахаас сэргийлнэ. Слот нь БАГЦ
// бүрд ТУСДАА (Pivot-ын ганц слотын хөндлөн-багц алдагдлыг давтахгүй); нүдний
// түлхүүр `${oid}:${b}` — oid нь үйлчилгээний ObjectID тул дараагийн
// ачаалалтад тогтвортой. Огнооны (asOf) өөрчлөлт ноорогт ХАДГАЛАГДАХГҮЙ.
type Draft = {
  t: number;
  cells: [string, string][];
  /**
   * Ерөнхий менежерийн нэмсэн, хараахан нийтлэгдээгүй мөрүүд.
   * ⚠️ Хуучин ноорогт БАЙХГҮЙ тул заавал сонголттой — уншихдаа `?? []`.
   */
  adds?: NewRow[];
};
/**
 * ЕРӨНХИЙ МЕНЕЖЕРИЙН НЭМСЭН, хараахан нийтлэгдээгүй мөр.
 *
 * ⚠️ Эцгийг ObjectID-гаар санахгүй: нийтлэх бүрд хуудас бүхэлдээ хуулбарлагдаж
 * бүх мөр ШИНЭ ObjectID авдаг тул тэр дугаар удаан амьдардаггүй. (№ + ажлын
 * нэр) хос нь эх excel-ийн бүтэц тул хамаагүй тогтвортой.
 */
type NewRow = {
  /** Түр ObjectID — САРВААХ сөрөг тоо, серверийн дугаартай хэзээ ч мөргөлдөхгүй */
  oid: number;
  parentNo: string;
  parentWork: string;
  /** Нэрээр олдохгүй үед нөхөх сүүлчийн арга */
  parentIdx: number;
  no: string;
  work: string;
  vol: number | null;
  unit: number | null;
};

/**
 * Түр ObjectID-ийн тоолуур. Сөрөг тул серверийн (эерэг) дугаартай мөргөлдөхгүй
 * бөгөөд `cellKey`, `collapsed`, React `key` бүгд хэвийн ажиллана.
 */
let tmpOid = -1;

const DRAFT_PREFIX = "selbe-fillnew-draft:";
const DRAFT_TTL_MS = 3 * 24 * 3600 * 1000;
const readDraft = (pkgKey: string): Draft | null => {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + pkgKey);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d.t || !Array.isArray(d.cells) || Date.now() - d.t > DRAFT_TTL_MS)
      return null;
    if (d.adds != null && !Array.isArray(d.adds)) return null;
    return d;
  } catch {
    return null;
  }
};
const saveDraftLS = (pkgKey: string, d: Draft) => {
  try {
    localStorage.setItem(DRAFT_PREFIX + pkgKey, JSON.stringify(d));
  } catch {
    /* дүүрсэн/private горим — зөвхөн энэ сешнд үйлчилнэ */
  }
};
const clearDraftLS = (pkgKey: string) => {
  try {
    localStorage.removeItem(DRAFT_PREFIX + pkgKey);
  } catch {
    /* байхгүй */
  }
};

/** 0..1 → хувь. Бүлгийн нийлбэр бутархай тул аравны нэг хүртэл. */
const pc = (v: number | null, dec = 0) =>
  v == null ? "" : (v * 100).toFixed(dec).replace(/\.0+$/, "") + "%";
/** Жин: 0.0083 → «0.83%». Маш жижиг жингүүд 0% болж унтрахгүйн тулд ач холбогдол бүхий орноор. */
const wt = (v: number | null) => {
  if (v == null) return "";
  const p = v * 100;
  if (p === 0) return "0%";
  const d = Math.abs(p) >= 10 ? 1 : Math.abs(p) >= 1 ? 2 : 4;
  return p.toFixed(d).replace(/\.?0+$/, "") + "%";
};
/** Бөөрөнхийлөөгүй бүтэн хувь — tooltip-д (дээд бүлгийн өөрчлөлт жижиг байдаг). */
const full = (v: number | null) => (v == null ? undefined : (v * 100).toFixed(6) + "%");
/** Оролтын талбарт тавих бичлэг — мянгатын таслалгүй, задлагдах хэлбэрээр. */
const qtyRaw = (v: number | null | undefined) => (v == null ? "" : String(v));
const qty = (v: number | null) =>
  v == null ? "" : Number(v.toFixed(3)).toLocaleString("en-US");
const dt = (ms: number | null) =>
  ms == null ? "" : new Date(ms).toISOString().slice(0, 10);
/** «YYYY-MM-DD» ↔ ms (UTC — үйлчилгээний огноо UTC шөнө дунд). */
const inputToMs = (s: string) => (s ? Date.parse(s + "T00:00:00Z") : null);

/**
 * Засагдахгүй нүд дарахад ЯАГААД гэдгийг тайлбарлах бичвэрүүд.
 * Зөвхөн «болохгүй» гэж хэлээд орхивол хэрэглэгч алдаа гэж боддог — тиймээс
 * тухайн багана ЮУНААС бодогддгийг, эсвэл ХААНА бөглөхийг заана.
 */
/**
 * «Обьём» баганын зохиомол блокийн индекс — нэг `edit` төлөвт блокийн нүд ба
 * мөрийн обьёмын нүд хоёулаа багтахын тулд. Блокийн индекс ҮРГЭЛЖ >= 0 тул
 * −1 нь давхцахгүй.
 */
/**
 * Засварлаж болох ЦОРЫН ГАНЦ багана — блокийн ОБЬЁМ.
 *
 * ⚠️ Гүйцэтгэлийн ХУВЬ энд байхгүй: «обьём ÷ мөрийн Обьём»-оор бодогдоно.
 * ⚠️ Мөрийн «Обьём» ч байхгүй: тэр нь ЭХ ӨГӨГДЛИЙН тоо хэмжээ бөгөөд эх
 *    хүснэгтэд оруулагддаг — энэ хуудас түүнийг зөвхөн УНШИНА.
 */
type EditCol = "obyem";

/** Нүдний `pending` түлхүүр. */
const cellKey = (oid: number, b: number) => `${oid}:${b}`;

const RO = {
  no: tr('№ ба Ажлын нэр нь excel-ийн бүтэц — энэ хуудаснаас засагдахгүй.'),
  wC: tr('Хувийн жин: Мөнгөн дүн ÷ дээд мөрийн дүн. Автоматаар бодогдоно.'),
  wD: tr('Хувийн жин (нийт төсөлд): Мөнгөн дүн ÷ үе шатны дүн. Автоматаар бодогдоно.'),
  wE: tr('Одоо байгаа: Хувийн жин × Бодит гүйцэтгэл. Гүйцэтгэл бөглөхөд өөрөө хөдөлнө.'),
  vol: tr('Обьём нь ЭХ ӨГӨГДЛИЙН тоо хэмжээ — эх хүснэгтэд оруулагдана, энэ хуудаснаас засагдахгүй (жин, мөнгөн дүн бүхэлдээ түүнээс бодогддог).'),
  obyemSum: tr('Обьёмын нийлбэр: тухайн мөрийн БҮХ блокийн бөглөсөн обьёмын нийлбэр. Нийтлэх бүрд өөрөө бодогдож `obyem_sum` талбарт бичигдэнэ.'),
  unit: tr('Нэгж өртөг нь үйлчилгээнд хадгалагдсан — энэ хуудаснаас засагдахгүй.'),
  money: tr('Мөнгөн дүн: Обьём × Нэгж өртөг; бүлгийн мөрд дэд мөрүүдийнхээ нийлбэр.'),
  I: tr('Төлөвлөгөөт гүйцэтгэл нь блокуудын төлөвлөгөөт хувийн дундаж. Огноог засвал өөрчлөгдөнө.'),
  J: tr('Бодит гүйцэтгэл нь блокуудын бодит хувийн дундаж. Блокийн нүдэнд обьём бөглөнө үү.'),
  K: tr('Төлөвлөгөө биелэлт: Бодит ÷ Төлөвлөгөөт. Автоматаар бодогдоно.'),
  groupAct: tr('Бүлгийн мөр нь дэд мөрүүдийнхээ жинтэй дунджаар бодогдоно — доод ажлын мөр дээр бөглөнө үү.'),
  noObyemField: tr('Энэ блокт обьёмын багана үйлчилгээнд үүсээгүй тул хадгалах газаргүй (AGOL дээр нэмэх шаардлагатай).'),
  pctFromVol: tr('Хувь нь «бөглөсөн обьём ÷ мөрийн Обьём»-оор бодогдоно — гараар засагдахгүй.'),
  noRowVol: tr('Энэ мөрд «Обьём» бөглөгдөөгүй тул хувь бодогдохгүй. Обьёмын баганад мөрийн нийт тоо хэмжээг оруулмагц хувь нь өөрөө гарч эхэлнэ.'),
  blockPlan: tr('Барилга-төлөвлөгөөт нь эхлэх/дуусах огноо ба шинэчлэгдсэн огноогоор бодогдоно — огноог нь засаарай.'),
  groupDate: tr('Энэ огноо нь доод ажлуудынхаа хамгийн эрт эхлэх / хамгийн сүүл дуусахаар бодогдож байна — доод ажлынхаа огноог засаарай.'),
  noDateField: tr('Энэ блокт огнооны багана үйлчилгээнд байхгүй тул хадгалах газаргүй.'),
  asOfRow: tr('Шинэчлэгдсэн огноо зөвхөн эхний мөрд бичигдэнэ — тэндээс эсвэл дээд талын «Огноо»-гоор солино.'),
  noDocField: tr('Энэ багана тухайн үйлчилгээнд байхгүй — хадгалах газаргүй тул засагдахгүй. AGOL дээр талбарыг нэмж өгөх шаардлагатай.'),
  noQaqc: tr('Inspection Test Plan (М-акт, FIC, MA, MIR) бөглөхөд «QAQC» эрх шаардлагатай — «Хэрэглэгчдийн эрх удирдах» хэсгээс олгоно.'),
  docLocked: tr('Хуудас засагдахгүй горимд байна — өнөөдөр аль хэдийн хяналтад илгээгдсэн (эсвэл зөвхөн харах горим).'),
} as const;

/*
 * ── ГҮЙЦЭТГЭЛ ОБЬЁМООР (2026-08-20, хэрэглэгчийн шийдвэр) ───────────────────
 * Урьд нь блокийн нүдэнд ХУВЬ бичдэг байсныг болив. Одоо:
 *   · нүдэнд ЭНЭ УДААД хийсэн НЭМЭЛТ обьёмыг бичнэ (алдаа засах бол сөрөг тоо),
 *   · нэмэлт нь үйлчилгээний *_obyem талбар дахь хуримтлал дээр нэмэгдэнэ,
 *   · хувь нь «хуримтлал ÷ мөрийн Обьём»-оор бодогдож хуучин талбартаа
 *     хэвээр бичигдэнэ (дашбоард, тайлан бүгд хөндөгдөхгүй).
 *
 * ⚠️ Багана нэмэгдэхээс өмнөх бүх гүйцэтгэл ЗӨВХӨН хувиар бүртгэгдсэн тул
 *    хуримтлалын суурийг «хувь × Обьём»-оор сэргээнэ (bagtsSheet → baseObyem).
 *    Ингэснээр шилжилтэд нэг ч мөрийн явц буцахгүй — амьд 10 хуудсан дээр
 *    зөрүү 0 болохыг шалгасан.
 */
/**
 * ХЯНАЛТЫН ХАРАГДАЦ — бөглөх хуудсыг ЗАСАГДАХГҮЙ горимоор нээнэ.
 *
 * ⚠️ Хянагчид ТУСДАА хүснэгт бичихийг болив. Хоёр хэрэгжилт болмогц багана,
 *    томъёо, толгой нь салан тусгаарлаж эхэлдэг бөгөөд «бөглөгчийн харсан
 *    хүснэгт» ба «хянагчийн харсан хүснэгт» хоёр өөр зүйл ярина. Одоо
 *    гүйцэтгэгч, талбайн инженер, менежер ГУРВУУЛАА ЯГ энэ компонентыг
 *    хардаг — ялгаа нь ЗӨВХӨН `view` өгөгдсөн эсэх.
 */
export type SheetView = {
  /** `PKGS`-ийн түлхүүр — аль багцын хуудас */
  pkgKey: string;
  /** Аль АГШИН (`YYYY-MM-DD`) — илгээсэн тэр өдрийн бүтэн хуулбар */
  day: string;
  /** Өөрчлөгдсөн нүд: `${мөрийн индекс}:${блокийн шошго}` */
  changed?: Set<string>;
  /** Үсрэх хүсэлт — `n` солигдох бүрд шинэ хүсэлт гэж үзнэ */
  jump?: { row: number; block: string; n: number } | null;
  /** ЗӨВШӨӨРСӨН нүднүүд — `changed`-тэй ижил түлхүүр. Ногооноор тэмдэглэнэ. */
  ok?: Set<string>;
  /**
   * Өөрчлөгдсөн нүд дээр дарахад — зөвшөөрөл асаах/унтраах.
   * ⚠️ Хянагч өөрчлөлт БҮРИЙГ гараар харж баталсан байх ёстой. Нэг товчоор
   *    бүгдийг батлах зам байвал хяналт нь ёсорхуу дарах үйлдэл болно.
   */
  onCell?: (row: number, block: string) => void;
};

export default function FillNew({ view }: { view?: SheetView } = {}) {
  /** Засагдахгүй (хяналтын) горим уу — бүх бичих зам үүгээр хаагдана. */
  const locked = !!view;

  const wrapRef = useRef<HTMLDivElement>(null);
  /** Энэ таб яг одоо нуугдсан уу (`display: none` → `offsetParent` нь null). */
  const hiddenNow = () => !wrapRef.current?.offsetParent;
  const [pkg, setPkg] = useState<Pkg>(
    () => (view && PKGS.find((p) => p.key === view.pkgKey)) || PKGS[0],
  ); // Багц 1 · 9F — жагсаалтын эхнийх
  const [sc, setSc] = useState<Schema | null>(null);
  /** Тайлангийн огноонууд — «Гүйцэтгэл бөглөх» табтай НЭГ эх сурвалжаас. */
  const [dates, setDates] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [asOf, setAsOf] = useState<number | null>(null);
  const [asOfOrig, setAsOfOrig] = useState<number | null>(null);
  /** Ачаалсан агшны БӨГЛӨСӨН ӨДӨР (`buglusun_ognoo`) — өнөөдрийнх үү гэж шалгана. */
  const [snapDay, setSnapDay] = useState<string>("");
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
  const { user, role } = useAuth();
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeAcl(() => setAclN((n) => n + 1)), []);
  /* Нэмэлт эрх ArcGIS-аас шинэчлэгдэхэд «+» товч шууд гарч/алга болно */
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((n) => n + 1)), []);
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
  const myBagts = useMemo(
    () => (role === "super" ? null : bagtsScope(user?.username)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, role, aclN],
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
  useEffect(() => {
    if (view || groupOpts.includes(pkg.group)) return;
    const first = PKGS.find((p) => p.group === groupOpts[0]);
    if (first) setPkg(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupOpts]);

  const { rows: hyRows } = useHyanaltRows();
  const flow = useMemo(() => {
    const mine = hyRows.filter((r) => r[HF.bagts] === pkg.group);
    if (!mine.length) return null;
    // Хамгийн сүүлийн тойрог — OBJECTID хамгийн их нь
    return mine.reduce((a, b) => (b.__oid > a.__oid ? b : a));
  }, [hyRows, pkg.group]);
  const returned = flow ? OWNER[flow[HF.status]] === "company" : false;
  /*
   * ⚠️ Өнөөдрийн огноог зурагдах бүрд БИШ, НЭГ л удаа авна — эс бөгөөс
   *    зурагдалт цэвэр биш болж, шөнө дундаас хойш зөрчил үүснэ.
   */
  const [today] = useState(() => msToDay(Date.now()));
  const sentToday = !!snapDay && snapDay === today;
  /** Засах эрхгүй — харах л боломжтой. */
  const noEdit = locked || (sentToday && !returned);

  /**
   * МӨР НЭМЭХ ЭРХ — ЗӨВХӨН ЕРӨНХИЙ МЕНЕЖЕР.
   *
   * ⚠️ Хуудасны бусад засвар нь гүйцэтгэгчийнх (`bagtsFor(user, "company")`)
   * бол мөр нэмэх нь БҮТЦИЙН өөрчлөлт — жин, мөнгөн дүн бүхэлдээ дахин
   * бодогдож, түүх дэх харьцуулалтад нөлөөлнө. Тиймээс хяналтын СҮҮЛИЙН шат
   * (`director` → `eronhii`) л хийнэ.
   *
   * ⚠️ Энэ бол ЗӨВХӨН дэлгэцийн хамгаалалт. Жинхэнэ хориг нь ArcGIS-ийн
   * давхаргын засварлах эрхэд байна — тэднийг тохируулаагүй бол хаяг мэдсэн
   * хэн ч REST-ээр мөр нэмж чадна.
   */
  const canAddRow = useMemo(() => {
    const u = user?.username?.toLowerCase();
    /*
     * ⚠️ ТУСДАА ОЛГОГДДОГ ЭРХ. Үүрэг ч, харагдац ч биш — «Хэрэглэгчдийн эрх
     * удирдах» хэсэгт хүн бүрд нэг бүрчлэн асаана. Учир нь мөр нэмэх нь
     * хуудасны БҮТЦИЙГ өөрчилж, жин ба мөнгөн дүн бүхэлдээ дахин бодогддог
     * эрсдэлтэй үйлдэл — үүргийн урьдчилсан тохиргоогоор чимээгүй тарах ёсгүй.
     *
     * ⚠️ Админ (`super`) ч ҮЛ ХАМААРАХГҮЙ: эрхээ панелаас өөртөө ил асаана.
     * Ингэснээр «хэн мөр нэмж чадах вэ» гэдэг НЭГ жагсаалтаас бүрэн харагдана.
     */
    if (!hasCap(u, "addRow")) return false;

    /*
     * ⚠️ Урсгалд томилогдсон бол багцын хязгаарлалт нь ХЭВЭЭР үйлчилнэ:
     * зөвхөн Багц 2-ыг хариуцсан менежер Багц 4-т мөр нэмэх ёсгүй.
     * Томилгоогүй (эрх нь шууд олгогдсон) хүнд хязгаарлалт байхгүй.
     */
    /*
     * ⚠️ БАГЦЫН ХҮРЭЭ. `u` хоосон = нэвтрэлт унтраалттай дев орчин (`hasCap`
     * дээр шийдэгдсэн), админ нь томилгооноос үл хамаарна. Бусад тохиолдолд
     * зөвхөн ӨӨРТ НЬ хуваарилагдсан багцад мөр нэмнэ — эрх дангаараа бүх
     * багцыг нээх ёсгүй.
     */
    if (!u || role === "super") return true;
    const scope = bagtsScope(u);
    return scope == null || scope.includes(pkg.group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role, aclN, capN, pkg.group]);

  /**
   * QAQC — Inspection Test Plan (М-акт · FIC · MA · MIR) бөглөх эрх.
   *
   * ⚠️ Гүйцэтгэлийн хувь бөглөхөөс ТУСДАА олгогдоно: чанарын баримтыг
   * гүйцэтгэгч биш, чанарын хяналтын ажилтан хөтөлдөг.
   */
  const canQaqc = useMemo(
    () => hasCap(user?.username, "qaqc"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, capN],
  );

  /** Мөр нэмэх маягт нээлттэй байгаа БҮЛГИЙН ObjectID (эсвэл `null`) */
  const [addFor, setAddFor] = useState<number | null>(null);
  const [addForm, setAddForm] = useState({ no: "", work: "", vol: "", unit: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Нийтлээгүй засварууд, `${oid}:${barilgaIndex}` түлхүүрээр. Утга нь хувь
  // ("" = хоосон болгох). Зөвхөн «Нийтлэх» дархад үйлчилгээнд бичигдэнэ.
  const [pending, setPending] = useState<Record<string, string>>({});
  // Огнооны нийтлээгүй засвар, `${oid}:${blok}:s|e` түлхүүрээр («s» = эхлэх,
  // «e» = дуусах). Утга нь «YYYY-MM-DD», "" = огноог арилгах.
  const [pendDate, setPendDate] = useState<Record<string, string>>({});
  /**
   * БАРИМТ БИЧГИЙН нийтлээгүй засвар, `${oid}:${баганын индекс}` түлхүүрээр.
   * ⚠️ Утга нь ЧӨЛӨӨТ текст; "" нь «утгыг арилгах» гэсэн үг (талбарыг NULL
   * болгоно) — тиймээс `null`-аас ялгаж, түлхүүр байгаа эсэхээр шийднэ.
   */
  const [pendDoc, setPendDoc] = useState<Record<string, string>>({});
  /** Яг одоо засагдаж буй баримтын нүд — `${мөрийн индекс}:${багана}` */
  const [editDoc, setEditDoc] = useState<string | null>(null);
  /**
   * Нээлттэй засварын нүд. `col` нь АЛЬ БАГАНА гэдгийг заана — обьёмгүй
   * мөрд обьём ба хувь ХОЁУЛАА засагддаг тул мөр+блок ганцаараа хүрэлцэхгүй.
   */
  /**
   * Нээлттэй оролтын DOM зангуу. Бичих үед React-ийн төлөв ХӨДӨЛӨХГҮЙ —
   * утгыг зөвхөн commit (blur/Enter/Ctrl+S) үед эндээс уншина.
   */
  const inputRef = useRef<HTMLInputElement>(null);
  /** Оролт нээгдэхэд тавих АНХНЫ утга (цаашид ref өөрөө хөтөлнө). */
  const [edit, setEdit] = useState<{
    i: number;
    b: number;
    col: EditCol;
  } | null>(null);
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
  const [pick, setPick] = useState<{
    kind: "s" | "e" | "asOf";
    row: SheetRow;
    b: number;
    value: string;
    rect: DOMRect;
  } | null>(null);

  // Засагдахгүй нүд дарахад «яагаад» гэдгийг хэлнэ. Дараагийн товшилт бүр
  // өмнөх мэдэгдлийг солино; 4 секундын дараа өөрөө арилна.
  const [notice, setNotice] = useState("");
  const noticeT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (msg: string) => {
    if (noticeT.current) clearTimeout(noticeT.current);
    setNotice(msg);
    noticeT.current = setTimeout(() => setNotice(""), 4000);
  };
  useEffect(
    () => () => {
      if (noticeT.current) clearTimeout(noticeT.current);
    },
    [],
  );
  /** Засагдахгүй нүдэнд өгөх props — товшихад тайлбарыг харуулна. */
  const ro = (msg: string) => ({
    title: msg,
    onClick: () => say(msg),
  });

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

  // Багц солигдох бүрд бүдүүвч + мөрүүдийг шинээр татна. Хуучин багцын
  // хариу хожуу ирээд шинийг дарж бичихээс `alive` хамгаална.
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setErr("");
    setRows([]);
    setSc(null);
    setPending({});
    setPendDate({});
    setPendDoc({});
    setEditDoc(null);
    // ⚠️ Нэмэлт мөр нь БАГЦАД харьяалагдана — багц солиход заавал цэвэрлэнэ,
    //    эс бөгөөс өөр багцын бүлэгт наалдаж, буруу хуудсанд бичигдэнэ.
    setAdds([]);
    setAddFor(null);
    setEdit(null);
    loadSchema(pkg)
      .then(async (schema) => {
        const r = await loadRows(pkg, schema, view?.day);
        if (!alive) return;
        setSc(schema);
        setRows(r.rows);
        setAsOf(r.asOf);
        setAsOfOrig(r.asOf);
        setSnapDay(r.snapshot != null ? msToDay(r.snapshot) : "");
        // ⚠️ Анх нээхэд БҮХ давхарга ДЭЛГЭЭСТЭЙ (хэрэглэгчийн шийдвэр,
        // 2026-08-19): урьд нь гүн 2 хүртэл эвхээстэй байсныг болив —
        // бөглөх ажлын мөрүүд шууд харагдах ёстой. Багц солиход мөн адил.
        // (1400 мөр × 60 багана зурагдана; удаан санагдвал давхаргын
        // товчнуудаар 1–4 болгож хумина.)
        setCollapsed(new Set());
        setGrpA(0);
        setGrpB(0);
      })
      .catch((e) => alive && setErr(String(e.message || e)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [pkg, view?.day]);

  // Үйлчилгээнд огноо огт бичигдээгүй бол `<select>` эхний мөрөө харуулах ч
  // төлөв нь `null` хэвээр үлдэж хүснэгт бүхэлдээ хоосон харагдана. Тиймээс
  // хамгийн сүүлийн тайлангийн огноогоор нөхнө (нийтлэхэд л хадгалагдана).
  useEffect(() => {
    if (asOf == null && dates.length) setAsOf(inputToMs(dates[dates.length - 1]));
  }, [asOf, dates]);

  const nBld = sc?.bld.length ?? 0;

  /* ── ВИРТУАЛЬ ГҮЙЛГЭЭ ──────────────────────────────────────────────────
   * 1,400 мөр × 60–100 багана = 137 мянган нүд. Бүгдийг DOM-д барьвал төлөв
   * өөрчлөгдөх бүрд (нүд нээх, бөглөх) React тэр бүхнийг харьцуулж, хөтөч
   * дахин байрлуулна — нэг нүд нээхэд 4.5 секунд болж хэмжигдсэн.
   *
   * Тиймээс ЗӨВХӨН харагдах мөрүүдийг (+ дээш/доош 25 мөрийн нөөц) зурж,
   * үлдсэнийг нь өндөртэй ХООСОН мөрөөр орлуулна. Гүйлгэх зурвасны урт ба
   * байрлал яг хэвээр үлдэнэ.
   *
   * ⚠️ Багана бүр CSS-д ТОГТМОЛ өргөнтэй (`--w-*`) тул хэсэг мөр зурсан ч
   *    багана нарийсаж/өргөсөхгүй. Хэрэв ямар нэг баганад тогтмол өргөн
   *    өгөхгүй бол гүйлгэх үед багана үсэрч эхэлнэ.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const rowHRef = useRef(34);
  const [win, setWin] = useState({ from: 0, to: 80 });
  const OVER = 20;

  /** Блок бүрд обьёмын багана бий эсэх — обьёмоор бөглөх боломжийн нөхцөл. */
  const hasObyem = useMemo(() => (sc ? sc.obyem.map((f) => !!f) : []), [sc]);

  /* ═══════════════ МӨР НЭМЭХ (зөвхөн Ерөнхий менежер) ═══════════════
   * Барилгын явцын дунд бүлэг дотор шинэ ажил гарч ирдэг. Нэмсэн мөр нь
   * НИЙТЛЭХ хүртэл зөвхөн энэ төлөвт амьдарна — тэр үед хуудсын бусад
   * засвартай ХАМТ шинэ архивын агшин болж бичигдэнэ.
   *
   * ⚠️ Эцгийг ObjectID-гаар САНАХГҮЙ: нийтлэх бүрд бүх мөр ШИНЭ ObjectID
   *    авдаг тул нийтлэхийн өмнө дахин татсан хуудсанд тэр дугаар өөр байна.
   *    Оронд нь (№ + ажлын нэр) хосоор олж, олдохгүй бол индексээр нөхнө.
   */
  const [adds, setAdds] = useState<NewRow[]>([]);

  /** Бүлгийн СҮҮЛИЙН удмын дараах индекс — шинэ мөрийг ЭНД оруулна. */
  const afterGroup = (list: SheetRow[], p: number) => {
    const d = list[p].depth;
    let i = p + 1;
    while (i < list.length && list[i].depth > d) i += 1;
    return i;
  };

  /**
   * Нэмсэн мөрүүдийг жагсаалтад ОРУУЛСАН хувилбар.
   *
   * ⚠️ Энэ нь ЗУРАГДАХ ба БОДОГДОХ хоёуланд нь хэрэглэгдэнэ: `computeAll` нь
   * шинэ мөрийн Обьём×Нэгж өртгийг тооцоод дээд бүлгүүдийн Мөнгөн дүн, улмаар
   * ХУУДАС ДАХЬ БҮХ хувийн жинг дахин бодно. Тиймээс хэрэглэгч нэмэнгүүт
   * үр дүнгээ шууд харна.
   */
  const withAdds = useCallback(
    (base: SheetRow[]): SheetRow[] => {
      if (!adds.length || !sc || !nBld) return base;
      const out = base.slice();
      for (const a of adds) {
        /*
         * ЭЦЭГ БҮЛГИЙГ ОЛОХ — нэр БА байрлал ХОЁУЛАНГААР.
         *
         * ⚠️ (№ + Ажлын нэр) хос нь ДАВХАРДДАГ. Багц 1 (9 давхар)-д «10 ·
         * БУСАД АЖИЛ» ба «6 · ТОНОГ ТӨХӨӨРӨМЖ» тус бүр ХОЁР удаа тааралдана
         * (блок бүрт нэг). Зөвхөн нэрээр хайвал `findIndex` эхнийхийг нь авч,
         * менежерийн нэмсэн ажил ӨӨР БЛОКИЙН бүлэгт чимээгүй очно.
         *
         * ⚠️ Харин зөвхөн байрлалаар (`parentIdx`) ч болохгүй: өмнөх нэмэлт
         * мөр дээгүүр нь орсон бол индекс гулсана, мөн эх хүснэгт өөрчлөгдөж
         * болно.
         *
         * Тиймээс нэрээр таарах БҮХ нэрийдлийг цуглуулж, дарсан байрлалд
         * ХАМГИЙН ОЙРХОНЫГ нь сонгоно — хоёр эрсдэлийг зэрэг барина.
         */
        const cands: number[] = [];
        for (let i = 0; i < out.length; i += 1) {
          const r = out[i];
          if (r.group && r.no === a.parentNo && r.work === a.parentWork) cands.push(i);
        }
        if (!cands.length) continue;               // эцэг алга — мөрийг алгасна
        let p = cands[0];
        for (const i of cands) {
          if (Math.abs(i - a.parentIdx) < Math.abs(p - a.parentIdx)) p = i;
        }
        const parent = out[p];
        out.splice(afterGroup(out, p), 0, {
          oid: a.oid,
          no: a.no,
          work: a.work,
          depth: parent.depth + 1,
          group: false,
          // ⚠️ Жин/мөнгө ОРОХГҮЙ — `computeAll` Обьём×Нэгж өртгөөс өөрөө бодно.
          wC: null,
          wD: null,
          vol: a.vol,
          unit: a.unit,
          money: null,
          act: new Array(nBld).fill(null),
          obyem: new Array(nBld).fill(null),
          start: new Array(nBld).fill(null),
          end: new Array(nBld).fill(null),
          docs: new Array(DOC_COLS.length).fill(null),
          /* Үйлчилгээнд бичигдэх ЦОРЫН ГАНЦ талбарууд — үлдсэнийг нийтлэх
             үед `computeAll`-ийн үр дүнгээр бөглөнө. */
          raw: {
            [sc.f.no]: a.no,
            [sc.f.work]: a.work,
            [sc.f.vol]: a.vol,
            [sc.f.unit]: a.unit,
          },
        });
      }
      return out;
    },
    [adds, sc, nBld],
  );

  /** Хуудасны БҮХ мөр — серверийнх + хараахан нийтлэгдээгүй нэмэлт. */
  const rowsAll = useMemo(() => withAdds(rows), [rows, withAdds]);

  const calc = useMemo(
    () =>
      asOf == null || !nBld
        ? []
        : computeAll(rowsAll, nBld, asOf, pending, pendDate, hasObyem),
    [rowsAll, nBld, asOf, pending, pendDate, hasObyem],
  );

  // Хаагдсан бүлгийн доорх мөрүүд. Гүн буурах хүртэл нуугдана.
  /**
   * Бүлгийн МУЖ — тэр мөрөөс эхлээд, өөрөөсөө ижил буюу дээгүүр гүнтэй
   * дараагийн мөр хүртэл. Мод нь ЗҮРЭГТЭЙ (бүлэг доороо шууд навч агуулж
   * болно) тул тоогоор нь биш, ГҮНЭЭР нь заагийг олно.
   */
  const rangeOf = useCallback(
    (oid: number) => {
      if (!oid) return null;
      const from = rowsAll.findIndex((r) => r.oid === oid);
      if (from < 0) return null;
      let to = rowsAll.length;
      for (let i = from + 1; i < rowsAll.length; i++)
        if (rowsAll[i].depth <= rowsAll[from].depth) {
          to = i;
          break;
        }
      return { from, to };
    },
    [rowsAll],
  );

  const labelOf = (r: SheetRow, pad = 0) =>
    "\u00A0".repeat(pad) + (r.no ? `${r.no} ` : "") + r.work;

  /**
   * ЭЦЭГ бүлгүүд — үе шат (А./Б.), дэд үе шат (Б1…Б5) ба ангилал (1, 2, 3…).
   * Гүнээр нь догол мөрлөнө: сонгогч дотор шатлал нь харагдана.
   */
  const grpAOpts = useMemo(
    () =>
      rowsAll
        .filter((r) => r.group && r.depth <= 2)
        .map((r) => ({ oid: r.oid, label: labelOf(r, r.depth * 3) })),
    [rowsAll],
  );

  /**
   * ДЭД бүлгүүд — «3.2 1F цутгалт» маягийн доод шатны бүлгүүд. Эцэг сонгосон
   * бол ЗӨВХӨН түүний дотоод, эс бөгөөс бүгд.
   */
  const grpBOpts = useMemo(() => {
    const rg = rangeOf(grpA);
    return rowsAll
      .map((r, i) => ({ r, i }))
      .filter(
        (x) =>
          x.r.group &&
          x.r.depth > 2 &&
          (!rg || (x.i > rg.from && x.i < rg.to)),
      )
      .map((x) => ({ oid: x.r.oid, label: labelOf(x.r) }));
  }, [rowsAll, grpA, rangeOf]);

  /**
   * Эцэг солигдоход түүнд харьяалагдахгүй дэд сонголт хүчингүй болно.
   * ⚠️ Үүнийг эффектээр «цэвэрлэвэл» нэмэлт render давалгаа үүсгэнэ —
   *    жагсаалтад байхгүй бол ЗҮГЭЭР Л «Бүгд» гэж үзнэ.
   */
  const grpBEff = grpBOpts.some((o) => o.oid === grpB) ? grpB : 0;

  // Дэд бүлэг сонгогдсон бол тэр нь давамгайлна (эцгийнхээ дотор л байдаг).
  const grpRange = useMemo(
    () => rangeOf(grpBEff) ?? rangeOf(grpA),
    [rangeOf, grpA, grpBEff],
  );

  const hidden = useMemo(() => {
    const h = new Array(rowsAll.length).fill(false);
    let depth = -1;
    for (let i = 0; i < rowsAll.length; i++) {
      const r = rowsAll[i];
      // Бүлгийн шүүлтүүр — мужаас гадуурх бүхнийг нууна.
      if (grpRange && (i < grpRange.from || i >= grpRange.to)) {
        h[i] = true;
        continue;
      }

      if (depth >= 0 && r.depth > depth) {
        h[i] = true;
        continue;
      }
      depth = -1;
      if (r.group && collapsed.has(r.oid)) depth = r.depth;
    }
    return h;
  }, [rowsAll, collapsed, grpRange]);

  /** Зурагдах мөрүүдийн ИНДЕКС (нуугдсаныг хассан). */
  const vis = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < rowsAll.length; i++) if (!hidden[i] && calc[i]) out.push(i);
    return out;
  }, [rowsAll, hidden, calc]);

  const recalcWin = useCallback(() => {
    const el = scrollRef.current;
    const tb = tbodyRef.current;
    if (!el || !tb) return;
    const first = tb.querySelector("tr[data-r]") as HTMLElement | null;
    if (first?.offsetHeight) rowHRef.current = first.offsetHeight;
    const h = rowHRef.current;
    // Толгойн өндрийг хасна — tbody нь түүнээс доош эхэлдэг.
    const top = Math.max(0, el.scrollTop - tb.offsetTop);
    const from = Math.max(0, Math.floor(top / h) - OVER);
    const to = Math.ceil((top + el.clientHeight) / h) + OVER;
    setWin((w) => (w.from === from && w.to === to ? w : { from, to }));
  }, []);

  // Гүйлгэх бүрд биш, зурагдах хүрээнд НЭГ удаа (rAF) — гүйлгээ жигд байна.
  const winTick = useRef(0);
  const onScroll = useCallback(() => {
    if (winTick.current) return;
    winTick.current = requestAnimationFrame(() => {
      winTick.current = 0;
      recalcWin();
    });
  }, [recalcWin]);

  // Мөр/шүүлтүүр солигдоход цонхыг шинэчилнэ.
  useEffect(() => {
    recalcWin();
  }, [vis, recalcWin]);

  /**
   * Засварлаж буй мөр цонхны ГАДНА үлдэж болохгүй — Enter-ээр доошлоход
   * оролт нь DOM-д байхгүй бол фокус алдагдаж, бичсэн зүйл үрэгдэнэ.
   */
  /**
   * ӨӨРЧЛӨГДСӨН НҮД РҮҮ ҮСРЭХ — жагсаалтаас дарахад.
   * ⚠️ 1,370 мөрийн ЗӨВХӨН харагдах хэсэг л DOM-д байдаг тул `scrollIntoView`
   *    ажиллахгүй: мөр нь хараахан зурагдаагүй байна. Тиймээс мөрийн
   *    ИНДЕКСЭЭР байрлалыг тооцож гүйлгэнэ.
   */
  const [hitKey, setHitKey] = useState<string | null>(null);
  const jumpN = view?.jump?.n ?? -1;
  useEffect(() => {
    const j = view?.jump;
    const el = scrollRef.current;
    const tb = tbodyRef.current;
    if (!j || !el || !tb || !vis.length) return;
    const at = vis.indexOf(j.row);
    if (at < 0) return;
    el.scrollTo({
      top: Math.max(0, tb.offsetTop + at * rowHRef.current - el.clientHeight / 2),
      behavior: "smooth",
    });
    const key = `${j.row}:${j.block}`;
    setHitKey(key);
    const t = window.setTimeout(() => setHitKey((h) => (h === key ? null : h)), 1800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpN, vis]);

  const editVis = edit ? vis.indexOf(edit.i) : -1;
  const winFrom = editVis >= 0 ? Math.min(win.from, editVis) : win.from;
  const winTo = editVis >= 0 ? Math.max(win.to, editVis + 1) : win.to;

  const toggle = (oid: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(oid)) n.delete(oid);
      else n.add(oid);
      return n;
    });

  /** n давхарга харуулна: гүн n−1 дэх бүх бүлгийг хаана. n≥5 = бүрэн дэлгэх. */

  const dirtyCount =
    Object.keys(pending).length +
    Object.keys(pendDate).length +
    Object.keys(pendDoc).length +
    adds.length +
    (asOf !== asOfOrig ? 1 : 0);

  /**
   * ОБЬЁМЫН нүд бичигдэх үү — талбар нь байгаа БҮХ ажлын мөрд ТИЙМ.
   * Хуудсан дээрх ЦОРЫН ГАНЦ бөглөх цэг (мөрийн Обьёмоос гадна).
   *
   * ⚠️ «Мөрийн Обьём байхгүй бол хориглоё» гэж БОЛОХГҮЙ: хийсэн тоо хэмжээ
   *    нь өөрөө бүртгэл бөгөөд хуваарь нь хожим орж ирж болно. Түгжвэл
   *    хэрэглэгч хуудсаа нээмэгц бөглөх газаргүй үлддэг.
   */
  const volMode = (r: SheetRow, b: number) => !r.group && !!sc?.obyem[b];






  /**
   * ШИНЭ МӨРИЙГ БҮЛЭГТ НЭМЭХ.
   *
   * ⚠️ № нь БҮХЭЛ ТОО байх ёстой. `ags.levelFromNo` нь бүхэл № + бутархай
   * жинг «навч ажил (5)» гэж уншдаг; бутархай № («3.2») бол «бүлэг (4)» болж,
   * `BuildingPanel.useTaskPerf`-ийн ажлын тоололд ОРОХГҮЙ үлдэнэ. Тиймээс
   * зөрчилтэй №-г ЭНД барина — үйлчилгээнд бичигдсэний дараа засахад хэцүү.
   */
  const addRow = (parent: SheetRow, parentIdx: number) => {
    const no = addForm.no.trim();
    const work = addForm.work.trim();
    const n = (s: string) => {
      const t = s.trim().replace(",", ".");
      return t === "" ? null : Number.isFinite(Number(t)) ? Number(t) : NaN;
    };
    const vol = n(addForm.vol);
    const unit = n(addForm.unit);

    if (!work) return setErr(tr('Ажлын нэрийг оруулна уу.'));
    if (!/^\d+$/.test(no))
      return setErr(tr('№ нь бүхэл тоо байх ёстой (жишээ «12») — бутархай дугаар нь бүлгийн мөрийг заадаг тул ажлын тоололд орохгүй.'));
    if (Number.isNaN(vol) || Number.isNaN(unit))
      return setErr(tr('Обьём ба Нэгж өртөг нь тоон утга байх ёстой.'));

    setErr("");
    setAdds((a) => [
      ...a,
      { oid: tmpOid--, parentNo: parent.no, parentWork: parent.work, parentIdx, no, work, vol, unit },
    ]);
    // ⚠️ Бүлэг ЭВХЭЭСТЭЙ бол шинэ мөр нуугдана — хэрэглэгч «нэмэгдээгүй» гэж
    //    бодож дахин дарах эрсдэлтэй. Тиймээс автоматаар дэлгэнэ.
    setCollapsed((s) => {
      if (!s.has(parent.oid)) return s;
      const n = new Set(s);
      n.delete(parent.oid);
      return n;
    });
    setAddFor(null);
    setAddForm({ no: "", work: "", vol: "", unit: "" });
    say(tr('«{0}» нэмэгдлээ — Нийтлэх дарж хадгална.', work));
  };

  /** Нийтлэхээс өмнө нэмсэн мөрийг буцаах */
  const dropAdd = (oid: number) => setAdds((a) => a.filter((x) => x.oid !== oid));

  /**
   * Нүдний засвар — блокийн ОБЬЁМ эсвэл мөрийн Обьём. Гүйцэтгэлийн хувь
   * энд ОРОХГҮЙ: тэр нь обьёмоос бодогдоно.
   */
  /**
   * БАРИМТЫН НҮД БИЧИХ.
   *
   * ⚠️ Хадгалагдсантай ИЖИЛ болж буцвал ноорогоос ХАСНА — эс бөгөөс «Нийтлэх»
   * товч огт өөрчлөлтгүй байхад идэвхжиж, хоосон агшин үүсгэнэ.
   */
  const commitDoc = (oid: number, di: number, raw: string) => {
    const v = raw.trim();
    const cur = rowsAll.find((x) => x.oid === oid)?.docs[di] ?? "";
    const key = `${oid}:${di}`;
    setPendDoc((p) => {
      const n = { ...p };
      if (v === cur) delete n[key];
      else n[key] = v;
      return n;
    });
  };

  const commit = (r: SheetRow, b: number, raw: string) => {
    const key = cellKey(r.oid, b);
    const t = raw.trim().replace(",", ".").replace(/^\+/, "").replace(/\s*%$/, "");
    setEdit(null);
    if (r.group) return;
    if (t !== "" && !Number.isFinite(Number(t))) {
      // Чимээгүй хаявал хэрэглэгч «бичигдлээ» гэж андуурдаг — мэдэгдэнэ.
      setErr(tr('{0} · {1}: тоон утга оруулна уу.', sc?.bld[b] ?? "", r.work));
      return;
    }


    /* ── ОБЬЁМ — гараар бичсэн ШУУД утга ────────────────────────────────
     * ⚠️ Хэрэглэгч нүдэнд «одоо болтол хийсэн НИЙТ хэмжээ»-гээ бичнэ.
     *    Нэмэлт (Δ) байдлаар авдаг байсныг болив: нүдэнд харагдаж буй тоо
     *    ба бичиж буй тоо хоёр өөр утгатай байх нь эндүүрэл төрүүлдэг.
     */
    const stored = r.obyem[b];
    const v = t === "" ? "" : String(Math.max(0, Number(t)));
    const vol = r.vol;
    if (
      v !== "" &&
      stored != null &&
      Number(v) < stored &&
      !window.confirm(
        tr(
          '{0} · {1}:\nөмнө нь {2} бүртгэгдсэн — {3} болж БУУРНА.\nБуруу бичсэнээ засаж байна уу?',
          sc?.bld[b] ?? "",
          r.work,
          qty(stored),
          qty(Number(v)),
        ),
      )
    )
      return;
    if (
      v !== "" &&
      vol != null &&
      vol > 0 &&
      Number(v) > vol &&
      !window.confirm(
        tr(
          '{0} · {1}:\n{2} нь мөрийн Обьём {3}-оос ХЭТЭРЧ байна ({4}).\nҮргэлжлүүлэх үү?',
          sc?.bld[b] ?? "",
          r.work,
          qty(Number(v)),
          qty(vol),
          pc(Number(v) / vol, 1),
        ),
      )
    )
      return;
    setErr("");
    setPending((pv) => {
      const n = { ...pv };
      // Хадгалагдсантайгаа тэнцүү бол «нийтлээгүй» тэмдэглэгээг арилгана.
      if (v === "" ? stored == null : Number(v) === stored) delete n[key];
      else n[key] = v;
      return n;
    });
  };

  // ── Нооргийн сэргээлт — багц ачаалагдмагц НЭГ удаа санал болгоно ──
  const promptedPkgRef = useRef("");
  useEffect(() => {
    if (busy || !rows.length || !sc) return;
    if (promptedPkgRef.current === pkg.key) return;
    // Сэргээх шат өнгөрснийг ноорог байсан эсэхээс үл хамааран тэмдэглэнэ.
    promptedPkgRef.current = pkg.key;
    const d = readDraft(pkg.key);
    if (!d) return;
    // ⚠️ Нэмсэн мөрийг ЗӨВХӨН эрхтэй хүнд сэргээнэ — эрх нь хооронд нь
    //    хасагдсан бол ноорог дахь мөр дэлгэцэд гарах ёсгүй.
    if (d.adds?.length && canAddRow) setAdds(d.adds);
    const byOid = new Map(rows.map((r, i) => [r.oid, i] as const));
    const next: Record<string, string> = {};
    let dropped = 0;
    for (const [key, v] of d.cells) {
      const oid = Number(key.split(":")[0]);
      const b = Number(key.slice(key.indexOf(":") + 1));
      const i = byOid.get(oid);
      const r = i == null ? undefined : rows[i];
      // Мөр алга болсон, бүлгийн мөр, блок хасагдсан, эсвэл аль хэдийн ижил
      // утгатай (хооронд нь нийтлэгдсэн) бол — хаяна.
      // ⚠️ Бичигдэхгүй болсон нүдний ноорог утгагүй — хаяна.
      const stale =
        !r ||
        !Number.isInteger(b) ||
        b < 0 ||
        b >= nBld ||
        r.group ||
        !Number.isFinite(Number(v)) ||
        !volMode(r, b);
      if (stale) {
        dropped++;
        continue;
      }
      next[key] = v;
    }
    if (!Object.keys(next).length) {
      clearDraftLS(pkg.key);
      return;
    }
    const when = new Date(d.t).toLocaleString("mn-MN");
    const msg =
      tr('Нийтлэгдээгүй {0} нүдний засвар олдлоо ({1}).', Object.keys(next).length, when) +
      (dropped ? "\n" + tr('{0} нүд хуучирсан тул орхигдоно.', dropped) : "") +
      "\n" + tr('Сэргээх үү?');
    if (window.confirm(msg)) setPending(next);
    else clearDraftLS(pkg.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, rows, sc, nBld, pkg.key]);

  // Ноорог хадгалах — pending өөрчлөгдөх бүрд. Хоосон болоход (нийтэлсэн /
  // болиулсан) устгана, гэхдээ зөвхөн сэргээх шат ӨНГӨРСӨН багцынхыг: багц
  // солих үеийн setPending({}) шинэ багцын хуучин ноорогийг дарж болохгүй.
  useEffect(() => {
    // ⚠️ НЭМСЭН МӨР ч ноорогт орно: Ерөнхий менежер ажил нэмээд хуудсаа
    //    сэргээхэд тэр ажил чимээгүй алга болох ёсгүй.
    if (!Object.keys(pending).length && !adds.length) {
      if (promptedPkgRef.current === pkg.key) clearDraftLS(pkg.key);
      return;
    }
    saveDraftLS(pkg.key, { t: Date.now(), cells: Object.entries(pending), adds });
  }, [pending, adds, pkg.key]);

  // Таб хаах/refresh — нийтлээгүй засвартай үед хөтөч анхааруулна.
  useEffect(() => {
    if (!dirtyCount) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome legacy — returnValue заавал онооно
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirtyCount]);

  /** Багц/хувилбар солихын өмнө нийтлээгүй засварыг баталгаажуулна. */
  const confirmSwitch = () =>
    dirtyCount === 0 ||
    window.confirm(
      tr('Нийтлэгдээгүй {0} өөрчлөлт бий. Багц солих уу?', dirtyCount) + "\n" +
        tr('(Нүдний засварууд ноорог болон хадгалагдаж, буцаж ирэхэд сэргээхийг санал болгоно.)'),
    );
  /** Огнооны нүдний ХАДГАЛАГДСАН утга «YYYY-MM-DD» хэлбэрээр. */
  const origDay = (r: SheetRow, b: number, k: "s" | "e") =>
    dt(k === "s" ? r.start[b] : r.end[b]);

  const commitDate = (r: SheetRow, b: number, k: "s" | "e", raw: string) => {
    const key = `${r.oid}:${b}:${k}`;
    setEdit(null);
    setPendDate((p) => {
      const n = { ...p };
      // Анхны утгадаа буцсан бол «нийтлээгүй» тэмдэглэгээг арилгана.
      if (raw === origDay(r, b, k)) delete n[key];
      else n[key] = raw;
      return n;
    });
  };

  const publish = useCallback(async () => {
    // ⚠️ busy — Ctrl+S auto-repeat үед олон зэрэгцээ бичилт явахаас сэргийлнэ.
    if (busy || asOf == null || dirtyCount === 0 || !sc) return;
    setBusy(true);
    setErr("");
    try {
      /* ── АРХИВЫН АГШИН ──────────────────────────────────────────────────
       * Нийтлэх бүрд хуудас БҮХЭЛДЭЭ доор нь ХУУЛБАРЛАГДАЖ нэмэгдэнэ; мөр
       * бүрд бөглөсөн өдрийн огноо бичигдэнэ. Хуучин мөр ХЭЗЭЭ Ч дарагдахгүй
       * тул огноогоор шүүхэд тэр агшны бүтэн зураг гарч, багцын бүтэн архив
       * бүрдэнэ.
       *
       * ⚠️ Зэрэг засварын хамгаалалт: `rows` нь хуудсыг НЭЭХ үеийн хуулбар
       *    тул нийтлэхийн өмнө СҮҮЛИЙН агшныг дахин татаж, өөрийн pending
       *    нүдийг түүн дээр давхарлана. Ингэснээр хооронд нь өөр хүн
       *    нийтэлсэн утга алдагдахгүй.
       */
      /*
       * ⚠️ НЭМСЭН МӨРИЙГ ШИНЭ ТАТАЛТ ДЭЭР дахин оруулна: `fresh` нь серверийн
       * хуулбар тул тэдгээр мөр түүнд БАЙХГҮЙ. `withAdds` нь эцгийг (№ +
       * ажлын нэр)-ээр олж, бүлгийн сүүлийн удмын дараа байрлуулна — тиймээс
       * хооронд нь өөр хүн нийтэлсэн ч зөв газартаа орно.
       */
      const fresh = withAdds((await loadRows(pkg, sc)).rows);
      const c = computeAll(fresh, nBld, asOf, pending, pendDate, hasObyem);
      // Бөглөсөн огноо — өдрийн эхэнд (UTC). Өдөрт нэг л удаа бөглөдөг тул
      // огноо ганцаараа агшны түлхүүр болно.
      const now = new Date();
      const fillMs = Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );

      const adds = fresh.map((r, i) => {
        // Мэддэггүй багана ч хуулбарт үлдэхийн тулд БҮХ талбараас эхэлнэ.
        const a: Record<string, unknown> = { ...r.raw };
        for (let b = 0; b < nBld; b++) {
          a[sc.act[b]] = c[i].act[b];
          a[sc.plan[b]] = c[i].plan[b];
          // Хуримтлагдсан обьём — хувийн ЭХ СУРВАЛЖ. Талбаргүй блок бий тул
          // шалгаж байж бичнэ; бүлгийн мөрд хоосон (нэгж нь зөрдөг).
          if (sc.obyem[b]) a[sc.obyem[b]!] = c[i].obyem[b];
          // Огноог мөн бичнэ: энэ мөрд бичигдсэн (`own`) утга ба бүлгийн
          // мөрийн MIN/MAX (`agg`) — хоёул excel-ийн томъёотой ижил.
          if (sc.start[b]) a[sc.start[b]!] = c[i].start[b];
          if (sc.end[b]) a[sc.end[b]!] = c[i].end[b];
        }
        // ОБЬЁМЫН НИЙЛБЭР — талбар байвал л бичнэ (шинэ багана, 10/10 багцад бий)
        if (sc.f.obyemSum) a[sc.f.obyemSum] = c[i].obyemSum;
        a[sc.f.plan] = c[i].I;
        a[sc.f.act] = c[i].J;
        // ⚠️ Зарим багцад «Төлөвлөгөө биелэлт» ба «Одоо байгаа» багана огт
        //    байхгүй — байхгүй талбар руу бичвэл багц бүхэлдээ унана.
        if (sc.f.ratio) a[sc.f.ratio] = c[i].K;
        if (sc.f.wE) a[sc.f.wE] = c[i].E; // Одоо байгаа = C × Бодит гүйцэтгэл
        /*
         * ШАТЛАЛ — мөр БҮРД өөрийн гүнийг нь бичнэ.
         *
         * ⚠️ Энэ бол шатлалыг КОДООС (`bagts.trees.ts`) ӨГӨГДӨЛ рүү шилжүүлж
         * буй алхам. Багана нэмэгдсэний дараах ЭХНИЙ нийтлэлээр л хуудас
         * бүхэлдээ дүүрнэ; түүнээс хойш мөр нэмэх боломжтой болно (мөрийн тоо
         * зураглалын урттай зөрөх шаардлагагүй).
         *
         * ⚠️ Багана байхгүй үйлчилгээнд бичихгүй — байхгүй талбар руу бичвэл
         * багц бүхэлдээ унана.
         */
        if (sc.f.gun) a[sc.f.gun] = r.depth;
        /*
         * ХУВИЙН ЖИН — ЗӨВХӨН ХООСОН үед бөглөнө.
         *
         * ⚠️ Хадгалагдсаныг ДАРЖ БИЧИХГҮЙ: `computeAll` нь бодож чадаагүй үедээ
         * хадгалагдсан утга руу нөөцлөн буцдаг тул дарж бичвэл тэр нөөц замыг
         * өөрийнхөө бодолтоор аажим гажуудуулна.
         *
         * ⚠️ ШИНЭ МӨРД ЭНЭ ЧУХАЛ: `ags.levelFromNo` нь бүхэл № + БУТАРХАЙ жинг
         * «навч (5)» гэж уншдаг. Жин хоосон бол тэр мөрийг «ангилал (3)» гэж
         * үзэж, `BuildingPanel.useTaskPerf`-ийн ажлын тоололд ОРОХГҮЙ үлдэнэ.
         */
        if (sc.f.wC && a[sc.f.wC] == null && c[i].C != null) a[sc.f.wC] = c[i].C;
        // Шинэчлэгдсэн огноо — excel-ийн лавлах нүд, зөвхөн 1-р мөрд.
        if (sc.f.asOf) a[sc.f.asOf] = i === 0 ? asOf : null;
        // АРХИВЫН ТҮЛХҮҮР — мөр БҮРД.
        if (sc.f.fillDate) a[sc.f.fillDate] = fillMs;
        /*
         * БАРИМТ БИЧГИЙН ТЕКСТ.
         *
         * ⚠️ Зөвхөн ЗАСАГДСАН нүдийг дарж бичнэ (`key in pendDoc`): үлдсэнийг
         * `a` нь серверийн хуулбараас аль хэдийн авчирсан. Болзолгүй бичвэл
         * хооронд нь өөр хүн бөглөсөн утга устана.
         *
         * ⚠️ Хоосон мөр («") нь «утгыг арилгах» гэсэн үг тул `null` болгоно —
         * ArcGIS-д хоосон тэмдэгт мөр ба NULL хоёр өөр бөгөөд хайлт, тайланд
         * өөрөөр биелдэг.
         */
        DOC_COLS.forEach((_, di) => {
          const fld = sc.docs[di];
          if (!fld) return;
          const key = `${r.oid}:${di}`;
          if (key in pendDoc) a[fld] = pendDoc[key].trim() || null;
        });
        return a;
      });

      if (!sc.f.fillDate)
        throw new Error(
          tr('«buglusun_ognoo» багана энэ үйлчилгээнд алга — архив үүсгэх боломжгүй тул нийтлэлийг зогсоов (AGOL дээр багана нэмнэ үү).'),
        );
      const { added, firstOid } = await applyAdds(pkg, adds);

      /*
       * ── ХЯНАЛТАД АВТОМАТААР ОРУУЛНА ──────────────────────────────────
       * Нийтэлсэн даруйд ажил талбайн инженерийн дараалалд орно.
       *
       * ⚠️ ХЯНАЛТ УНАВАЛ НИЙТЛЭЛ УНАХГҮЙ. Гүйцэтгэлийн өгөгдөл аль хэдийн
       * хадгалагдсан байхад «нийтлэгдсэнгүй» гэж харуулбал компани дахин
       * дарж, архивт давхардсан агшин үүснэ. Тиймээс алдааг зөвхөн МЭДЭГДЭНЭ.
       */
      const rv = await submitForReview(pkg.group, fillMs, firstOid);

      // Шинэ агшныг татаж дэлгэц дээр буулгана — дараагийн засвар түүн дээр
      // үргэлжилнэ (нэмэлт нь хуучин сууриас тоологдохгүй).
      const next = await loadRows(pkg, sc);
      setRows(next.rows);
      setAsOf(next.asOf ?? asOf);
      setAsOfOrig(next.asOf ?? asOf);
      setPending({});
      setPendDate({});
      setPendDoc({});
      setEditDoc(null);
      // ⚠️ Нэмэлт мөрүүд аль хэдийн үйлчилгээнд бичигдсэн тул төлөвөөс ХАСНА —
      //    эс бөгөөс дараагийн нийтлэлд ДАХИН нэмэгдэж давхардана.
      setAdds([]);
      setAddFor(null);
      say(rv.ok
        ? tr('Архивт {0} мөр нэмэгдэв · {1} · хяналтад илгээв ({2})', added, msToDay(fillMs), rv.id)
        : tr('Архивт {0} мөр нэмэгдэв · {1} · ⚠️ хяналтад илгээгдсэнгүй: {2}', added, msToDay(fillMs), rv.error));
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [pkg, sc, nBld, asOf, asOfOrig, pending, pendDate, pendDoc, dirtyCount, busy, hasObyem, withAdds]);

  // Ctrl+S — «Гүйцэтгэл бөглөх»-тэй ижил.
  // ⚠️ Нээлттэй нүдний бичиж буй утгыг ЭХЛЭЖ commit хийнэ — эс тэгвэл хуучин
  // pending-ээр нийтлээд, оролтын утга дараа нь blur дээр эргэж dirty болж
  // хэрэглэгч «хадгалагдсан» гэж андуурдаг байв. commit нь state-д дараагийн
  // render дээр л тусах тул нийтлэлийг дарааллуулж эффектээр гүйцээнэ.
  const [publishQueued, setPublishQueued] = useState(false);
  const flushEditRef = useRef<() => void>(() => {});
  flushEditRef.current = () => {
    if (edit && rowsAll[edit.i])
      commit(rowsAll[edit.i], edit.b, inputRef.current?.value ?? val);
  };
  useEffect(() => {
    if (!publishQueued || edit) return;
    setPublishQueued(false);
    publish();
  }, [publishQueued, edit, publish]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (hiddenNow()) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flushEditRef.current();
        setPublishQueued(true);
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

  /** Enter/Tab — дараагийн засварлаж болох мөр рүү (баганадаа доошоо). */
  /**
   * Enter/Tab дарахад дараагийн БИЧИГДЭХ нүд. Багана бүр өөрийн дүрэмтэй
   * тул `col`-оор шүүнэ — эс тэгвэл бичиж болохгүй нүд нээгдэж, бөглөсөн
   * тоо чимээгүй алдагдана.
   */
  const nextEditable = (i: number, b: number, step: number, col: EditCol) => {
    const ok = (r: SheetRow) => volMode(r, b);
    for (let k = i + step; k >= 0 && k < rowsAll.length; k += step)
      if (!hidden[k] && ok(rowsAll[k])) return { i: k, b, col };
    return null;
  };

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

  return (
    <div className={st.wrap} ref={wrapRef}>
      <div className={st.toolbar}>
        {/* ⚠️ Багц, хувилбар, огноо нь ХЯНАЛТАД тогтмол: илгээсэн агшныг
            хардаг тул сонгуулбал өөр өгөгдөл гарч, хянаж буй зүйл нь
            баталж буй зүйлээсээ зөрнө. Шүүлтүүр (Бүлэг/Дэд бүлэг) хэвээр —
            тэдгээр нь өгөгдлийг биш, харагдацыг л хумина. */}
        {!locked && (<>
        <label className={st.field}>
          {tr('Багц')}{" "}
          <select
            className={st.select}
            value={pkg.group}
            disabled={busy}
            onChange={(e) => {
              if (!confirmSwitch()) return;
              setPkg(pkgFloors(e.target.value)[0]);
            }}
          >
            {groupOpts.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        {/* Хувилбар — зөвхөн 9F ба 12F ХОЁУЛАА хуудастай багцад (1, 2, 4-2).
            Бусад багцад ганц хувилбартай тул сонгогч ч харагдахгүй.
            ⚠️ «Хувилбар» гэдэг нь БАРИЛГЫН давхрын тоо (9F/12F) — модны гүнтэй
            андуурч «Давхар» гэж нэрлэхээс зайлсхийсэн. */}
        {floorOpts.length > 1 && (
          <label className={st.field}>
            {tr('Хувилбар')}{" "}
            <select
              className={st.select}
              value={pkg.key}
              disabled={busy}
              onChange={(e) => {
                if (!confirmSwitch()) return;
                setPkg(PKGS.find((p) => p.key === e.target.value) ?? pkg);
              }}
            >
              {floorOpts.map((p) => (
                <option key={p.key} value={p.key}>{p.floors}F</option>
              ))}
            </select>
          </label>
        )}
        <label className={st.field}>
          {tr('Огноо')}{" "}
          <select
            className={st.select}
            value={dt(asOf)}
            disabled={busy}
            onChange={(e) => {
              // ⚠️ Хоосон утга → null болговол calc=[] болж бүх мөр чимээгүй
              // алга болно — тиймээс задлагдахгүй бол хуучнаа хэвээр үлдээнэ.
              const ms = inputToMs(e.target.value);
              if (ms != null) setAsOf(ms);
            }}
            title={tr('Төлөвлөгөөт хувь бүхэлдээ энэ огноогоор бодогдоно (excel-ийн «Шинэчлэгдсэн огноо»)')}
          >
            {dateOpts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        </>
        )}
        {/* ЭЦЭГ БҮЛЭГ — «Б1 БАРИЛГЫН АЖИЛ», «3 ТӨМӨР БЕТОН РАМЫН АЖИЛ»… */}
        <label className={st.field}>
          {tr('Бүлэг')}{" "}
          <select
            className={cls("select selectWide")}
            value={grpA}
            disabled={busy}
            onChange={(e) => setGrpA(Number(e.target.value))}
            title={tr('Зөвхөн сонгосон бүлэг ба түүний доод ажлууд харагдана')}
          >
            <option value={0}>{tr('Бүгд')}</option>
            {grpAOpts.map((g) => (
              <option key={g.oid} value={g.oid}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        {/* ДЭД БҮЛЭГ — «3.2 1F цутгалт», «4.3 2F хана»… Эцэг сонгогдсон бол
            зөвхөн түүний доторхи, эс бөгөөс бүх дэд бүлэг жагсаана. */}
        <label className={st.field}>
          {tr('Дэд бүлэг')}{" "}
          <select
            className={cls("select selectWide")}
            value={grpBEff}
            disabled={busy}
            onChange={(e) => setGrpB(Number(e.target.value))}
            title={tr('Тухайн бүлгийн доторх нэг дэд бүлгийг сонгоно')}
          >
            <option value={0}>{tr('Бүгд')}</option>
            {grpBOpts.map((g) => (
              <option key={g.oid} value={g.oid}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        {resized && (
          <button
            className={st.layerBtn}
            onClick={resetAll}
            title={tr('Чирж өөрчилсөн бүх баганы өргөнийг анхны хэмжээнд нь буцаана')}
          >
            {tr('Өргөн сэргээх')}
          </button>
        )}
        {!locked && (
        <button
          className={st.publishBtn}
          onClick={publish}
          disabled={busy || noEdit || dirtyCount === 0}
          title={tr('Өөрчилсөн нүд + дээд бүлгүүдийн нийлбэрийг хадгална (Ctrl+S)')}
        >
          {tr('Нийтлэх')}{dirtyCount ? ` (${dirtyCount})` : ""}
        </button>
        )}
        {busy && <span className={st.muted}>{tr('ажиллаж байна…')}</span>}
      </div>

      {/*
        * ТҮГЖЭЭГ ЯАГААД ГЭДГИЙГ ХЭЛНЭ. Зүгээр л дарагдахгүй болговол
        * хэрэглэгч эвдэрсэн гэж бодож, дахин дахин оролдоно.
        */}
      {!locked && sentToday && !returned && (
        <p className={st.lockNote}>
          {tr('Өнөөдрийн гүйцэтгэл илгээгдсэн — хяналтад байна. Буцаалт ирвэл энэ хуудас өөрөө нээгдэнэ.')}
        </p>
      )}
      {!locked && returned && (
        <p className={st.backNote}>
          {tr('Хяналтаас БУЦААСАН — засвар оруулаад дахин илгээнэ үү.')}
        </p>
      )}
      {err && <p className={st.error}>{err}</p>}

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
            {/* ТОЛГОЙ нь `*_final_system` хуудасны бүтэц: 4 мөрт бүлэглэсэн.
                Мөр ба багана нь `*_final_publish`-тэйгээ ижил тул тооцоо
                хөндөгдөхгүй — зөвхөн дүрслэл. */}
            <thead>
              <tr>
                <th rowSpan={4} className={cls("fz c-no")}>№<i {...grip("no")} /></th>
                <th rowSpan={4} className={cls("fz c-ajil")}>{tr('Ажил')}<i {...grip("ajil")} /></th>
                {/* Excel-д C1:D4 — «Хувийн жин» хоёр баганыг бүрэн хамарна.
                    ⚠️ Энд `c-w` өргөний ангилал ТАВИХГҮЙ: 72px нь хоёр баганын
                    НИЙЛБЭР болж уншигдаж, хоёуланг нь шахна. Өргөнийг мөрийн
                    нүднүүд өөрсдөө заана. */}
                <th rowSpan={4} colSpan={2} className={cls("c-wspan")}>{tr('Хувийн жин')}<i {...grip("w")} /></th>
                <th rowSpan={4} className={cls("c-now")}>{tr('Одоо байгаа хувийн жин')}<i {...grip("now")} /></th>
                <th rowSpan={4} className={cls("c-vol")}>{tr('Обьём')}<i {...grip("vol")} /></th>
                {/* ⚠️ «Нэгж өртөг» ба «Мөнгөн дүн» нь ӨГӨГДӨЛД БАЙСАН ч
                    хүснэгтэд огт зурагддаггүй байв. Хувийн жин бүхэлдээ
                    Мөнгөн дүнгээс бодогддог тул түүнийг харуулахгүй бол
                    жин хаанаас гарсныг шалгах арга үгүй болно. */}
                <th rowSpan={4} className={cls("c-vol")}>{tr('Обьёмын нийлбэр')}<i {...grip("vol")} /></th>
                <th rowSpan={4} className={cls("c-vol")}>{tr('Нэгж өртөг')}<i {...grip("vol")} /></th>
                <th rowSpan={4} className={cls("c-money")}>{tr('Мөнгөн дүн')}<i {...grip("money")} /></th>
                <th rowSpan={4} className={cls("c-calc")}>{tr('Төлөвлөгөөт гүйцэтгэл')}<i {...grip("calc")} /></th>
                <th rowSpan={4} className={cls("c-calc")}>{tr('Бодит гүйцэтгэл')}<i {...grip("calc")} /></th>
                <th rowSpan={4} className={cls("c-calc")}>{tr('Төлөвлөгөө биелэлт')}<i {...grip("calc")} /></th>
                {/* Обьём (бөглөгддөг) ба түүнээс бодогдсон хувь — ТУСДАА хоёр
                    бүлэг. Нэг нүдэнд хамт байрлуулж байсныг болив: аль тоо нь
                    бичигддэг, аль нь бодогддог нь ялгарахгүй байв. */}
                <th colSpan={nBld} className={cls("band")}>{tr('Ажил гүйцэтгэл — обьём / хувь ({0} барилга)', nBld)}</th>
                <th colSpan={nBld} className={cls("band")}>{tr('Төлөвлөгөөт гүйцэтгэл ({0} барилга)', nBld)}</th>
                <th colSpan={nBld * 2} className={cls("band")}>{tr('Төлөвлөгөөт хуваарь ({0} барилга)', nBld)}</th>
                <th rowSpan={4} className={cls("c-date")}>{tr('Шинэчлэгдсэн огноо')}<i {...grip("date")} /></th>
                {/* ── БАРИМТ БИЧИГ — excel-ийн эх загвараар 3 давхар толгой ── */}
                <th colSpan={DOC_COLS.length} className={cls("band")}>{DOC_BAND}</th>
              </tr>
              {/* 2-р мөр — барилгын төрөл (блокийн цуваагаар) */}
              <tr>
                {bands.map((g, gi) => (
                  <th key={`ba${gi}`} colSpan={g.count} className={cls("band2")}>{g.label}</th>
                ))}
                {bands.map((g, gi) => (
                  <th key={`bp${gi}`} colSpan={g.count} className={cls("band2")}>{g.label}</th>
                ))}
                {bands.map((g, gi) => (
                  <th key={`bd${gi}`} colSpan={g.count * 2} className={cls("band2")}>{g.label}</th>
                ))}
                {/* Баримтын бүлгүүд — М-акт · FIC · MA · MIR */}
                {DOC_GROUPS.map((g) => (
                  <th key={g.label} colSpan={g.count} className={cls("band2")}>{g.label}</th>
                ))}
              </tr>
              {/* 3-р мөр — блокийн код */}
              <tr>
                {sc.bld.map((b) => (
                  <th key={`a${b}`} rowSpan={2} className={cls("bld")}>{b}<i {...grip("bld")} /></th>
                ))}
                {sc.bld.map((b) => (
                  <th key={`p${b}`} rowSpan={2} className={cls("bld")}>{b} {tr('барилга')}<i {...grip("bld")} /></th>
                ))}
                {sc.bld.map((b) => (
                  <th key={`d${b}`} colSpan={2} className={cls("c-date2")}>{b} {tr('барилга')}</th>
                ))}
                {/* Баримтын багана бүрийн нэр — 4-р мөр рүү үргэлжилнэ */}
                {DOC_COLS.map((dc) => (
                  <th key={dc.name} rowSpan={2} className={cls("c-doc")} title={tr(dc.label)}>
                    {tr(dc.short)}<i {...grip("doc")} />
                  </th>
                ))}
              </tr>
              {/* 4-р мөр — хуваарийн Эхлэх/Дуусах */}
              <tr>
                {sc.bld.map((b) => [
                  <th key={`s${b}`} className={cls("c-date")}>{tr('Эхлэх')}<i {...grip("date")} /></th>,
                  <th key={`e${b}`} className={cls("c-date")}>{tr('Дуусах')}<i {...grip("date")} /></th>,
                ])}
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {/* Дээд ЧИГЖЭЭС — зурагдаагүй мөрүүдийн өндрийг орлоно. */}
              {winFrom > 0 && (
                <tr aria-hidden="true" style={{ height: winFrom * rowHRef.current }}>
                  <td colSpan={13 + nBld * 4 + DOC_COLS.length} style={{ padding: 0, border: 0 }} />
                </tr>
              )}
              {vis.slice(winFrom, winTo).map((i) => {
                const r = rowsAll[i];
                const c = calc[i];
                if (!c) return null;
                const isNew = r.oid < 0;
                return (
                  <Fragment key={r.oid}>
                  <tr
                    data-r={i}
                    className={`${r.group ? st.cat : ""}${isNew ? ` ${st.newRow}` : ""}`.trim() || undefined}
                  >
                    <td className={cls("num fz c-no")} {...ro(RO.no)}>{r.no}</td>
                    <td
                      className={cls("fz c-ajil")}
                      style={{ paddingLeft: `${r.depth * 14 + 6}px` }}
                      {...ro(RO.no)}
                      title={r.work}
                    >
                      {r.group && (
                        /* button — гараар (Enter/Space) эвхэж дэлгэх боломжтой;
                           globals-ийн button reset .caret-ийн хэвийг хадгална. */
                        <button
                          type="button"
                          className={st.caret}
                          aria-expanded={!collapsed.has(r.oid)}
                          aria-label={collapsed.has(r.oid) ? tr('Дэлгэх') : tr('Эвхэх')}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(r.oid);
                          }}
                        >
                          {collapsed.has(r.oid) ? "▸" : "▾"}
                        </button>
                      )}
                      {r.work}
                      {/* ── БҮЛЭГТ АЖИЛ НЭМЭХ — зөвхөн Ерөнхий менежер ── */}
                      {r.group && canAddRow && !noEdit && (
                        <button
                          type="button"
                          className={st.addBtn}
                          title={tr('Энэ бүлэгт шинэ ажлын мөр нэмэх')}
                          aria-label={tr('«{0}» бүлэгт ажил нэмэх', r.work)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setAddFor((x) => (x === r.oid ? null : r.oid));
                            setAddForm({ no: "", work: "", vol: "", unit: "" });
                          }}
                        >
                          +
                        </button>
                      )}
                      {/* Нийтлэгдээгүй шинэ мөрийг буцаах */}
                      {isNew && (
                        <button
                          type="button"
                          className={st.dropBtn}
                          title={tr('Нийтлэгдээгүй шинэ мөрийг хасах')}
                          aria-label={tr('«{0}» мөрийг хасах', r.work)}
                          onClick={(e) => {
                            e.stopPropagation();
                            dropAdd(r.oid);
                          }}
                        >
                          ×
                        </button>
                      )}
                    </td>
                    <td className={cls("right c-w")} {...ro(RO.wC)} title={full(c.C)}>{wt(c.C)}</td>
                    <td className={cls("right c-w")} {...ro(RO.wD)} title={full(c.D)}>{wt(c.D)}</td>
                    {/* Одоо байгаа = Хувийн жин × Бодит гүйцэтгэл — гүйцэтгэл
                        бөглөхөд хамт хөдөлдөг тул бодогдох өнгөтэй. Дээд
                        бүлгүүдэд өөрчлөлт нь бөөрөнхийлөлтөөс нуугдах тул
                        бүтэн нарийвчлалыг tooltip-оор өгнө. */}
                    <td className={cls("right c-w calc")} {...ro(RO.wE)} title={full(c.E)}>
                      {wt(c.E)}
                    </td>
                    {/* ОБЬЁМ — ЭХ ӨГӨГДЛИЙН тоо хэмжээ. Эх хүснэгтэд
                        оруулагдана; энэ хуудас зөвхөн уншина. Түүнээс Мөнгөн
                        дүн, тэндээс хуудсын БҮХ хувийн жин бодогддог тул энд
                        засах эрх нээвэл нэг тоо солиход бүх мөрийн жин
                        чимээгүй шилжинэ. */}
                    {/* ОБЬЁМ — тоо ба ХЭМЖИХ НЭГЖ нэг нүдэнд, «1300 м³» хэлбэрээр.
                        ⚠️ Бүлгийн мөрд нэгж БИЧИХГҮЙ: бүлэг нь өөр өөр нэгжтэй
                        ажлуудыг агуулдаг тул нэг нэгж оноох нь худал болно.
                        ⚠️ Нэгж нь `negj.ts`-ийн дүрмээр ажлын нэрнээс гарна
                        (хамралт 95.5%); тодорхойлогдоогүй бол зөвхөн тоо. */}
                    <td className={cls("right c-vol")} {...ro(RO.vol)}>
                      {qty(r.vol)}
                      {!r.group && r.vol != null && negjOf(r.work) && (
                        <span className={st.negj}>{negjOf(r.work)}</span>
                      )}
                    </td>
                    {/* ОБЬЁМЫН НИЙЛБЭР — блокуудын нийлбэр тул мөрийн Обьёмтой
                        ИЖИЛ нэгжтэй. */}
                    <td className={cls("right c-vol calc")} {...ro(RO.obyemSum)}>
                      {qty(c.obyemSum)}
                      {!r.group && c.obyemSum != null && negjOf(r.work) && (
                        <span className={st.negj}>{negjOf(r.work)}</span>
                      )}
                    </td>
                    <td className={cls("right c-vol")} {...ro(RO.unit)}>{qty(r.unit)}</td>
                    <td className={cls("right c-money")} {...ro(RO.money)}>{qty(r.money)}</td>
                    <td className={cls("num c-calc calc")} {...ro(RO.I)}>{pc(c.I, 1)}</td>
                    <td className={cls("num c-calc calc")} {...ro(RO.J)}>{pc(c.J, 1)}</td>
                    <td className={cls("num c-calc calc")} {...ro(RO.K)}>{pc(c.K, 1)}</td>

                    {/* ГҮЙЦЭТГЭЛИЙН НҮД — обьём ба хувь НЭГ нүдэнд.
                          дээд мөр (том тоо) = бөглөсөн ОБЬЁМ — ЭНЭ Л бичигдэнэ
                          доод мөр (жижиг %) = обьём ÷ мөрийн Обьём — зөвхөн үр дүн

                        ⚠️ Хувийг гараар засах зам БАЙХГҮЙ. Хоёр эх сурвалжтай
                        болбол (гараар бичсэн хувь vs обьёмоос бодогдсон) аль нь
                        үнэн болох нь тодорхойгүй болж, тайлан зөрнө. */}
                    {sc.bld.map((b, bi) => {
                      const key = cellKey(r.oid, bi);
                      const dirty = key in pending;
                      const canVol = volMode(r, bi);
                      const editing =
                        edit && edit.i === i && edit.b === bi && edit.col === "obyem";
                      const changed = !!view?.changed?.has(`${i}:${b}`);
                      const okd = !!view?.ok?.has(`${i}:${b}`);
                      const open = () => {
                        // Хяналтын горим: өөрчлөгдсөн нүд нь ЗӨВШӨӨРӨХ товч
                        if (locked) return changed && view?.onCell?.(i, b);
                        if (noEdit)
                          return say(
                            tr('Энэ багцын өнөөдрийн гүйцэтгэл аль хэдийн илгээгдсэн — хяналтаас буцаалт ирэх хүртэл засах боломжгүй.'),
                          );
                        if (!canVol) return say(r.group ? RO.groupAct : RO.noObyemField);
                        setVal(pending[key] ?? qtyRaw(r.obyem[bi]));
                        setEdit({ i, b: bi, col: "obyem" });
                      };
                      return (
                        <td
                          key={`a${b}`}
                          data-bi={bi}
                          /* ⚠️ `view` нь `editable`-ийн ЗАСАГДАХГҮЙ хувилбар:
                             хайрцаг, курсор алга — гэхдээ обьём ба хувь
                             ХОЁУЛАА харагдана (бөглөгчийн харж буй тоо). */
                          className={cls(
                            "num bld" +
                              (canVol ? (noEdit ? " view" : " editable") : " calc") +
                              (dirty ? " dirty" : "") +
                              (changed ? (okd ? " chgOk" : " chg") : "") +
                              (hitKey === `${i}:${b}` ? " chgHit" : ""),
                          )}
                          /* Нүдний АЛЬ Ч цэгт дарахад нээгдэнэ — хоёр мөрийн
                             хооронд/ирмэг дээр таарсан товшилт үрэгдэхгүй
                             (хэрэглэгч үүнийг «хоёр дарж байж нээгддэг» гэж
                             мэдэрдэг байв). */
                          tabIndex={canVol && !noEdit ? 0 : changed ? 0 : undefined}
                          onClick={open}
                          onKeyDown={(e) => {
                            if (locked) {
                              if (changed && (e.key === "Enter" || e.key === " ")) {
                                e.preventDefault();
                                view?.onCell?.(i, b);
                              }
                              return;
                            }
                            if (!editing && (e.key === "Enter" || e.key === "F2")) {
                              e.preventDefault();
                              open();
                            }
                          }}
                          title={
                            changed
                              ? okd
                                ? tr('ЗӨВШӨӨРСӨН — дахин дарвал буцаана')
                                : tr('Өмнөх агшнаас ӨӨРЧЛӨГДСӨН — дарж зөвшөөрнө үү')
                              : r.group
                              ? RO.groupAct
                              : !canVol
                                ? RO.noObyemField
                                : r.vol
                                  ? tr('Мөрийн Обьём {0} · бөглөсөн {1} = {2}', qty(r.vol), qty(c.obyem[bi]), pc(c.act[bi], 2))
                                  : RO.noRowVol
                          }
                        >
                          {editing ? (
                            <input
                              {...{
                                autoFocus: true,
                                ref: inputRef,
                                type: "text" as const,
                                inputMode: "decimal" as const,
                                className: st.cellInputLine,
                                placeholder: tr('обьём'),
                                // Удирдлагагүй: бичихэд re-render гарахгүй.
                                defaultValue: val,
                                onBlur: (e: React.FocusEvent<HTMLInputElement>) =>
                                  commit(r, bi, e.target.value),
                                onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                                  if (e.key === "Escape") return setEdit(null);
                                  if (e.key === "Enter" || e.key === "Tab") {
                                    e.preventDefault();
                                    commit(r, bi, e.currentTarget.value);
                                    const t = nextEditable(i, bi, e.shiftKey ? -1 : 1, "obyem");
                                    if (t) {
                                      const nr = rowsAll[t.i];
                                      setVal(
                                        pending[cellKey(nr.oid, bi)] ??
                                          qtyRaw(nr.obyem[bi]),
                                      );
                                      setEdit(t);
                                    }
                                  }
                                },
                              }}
                            />
                          ) : (
                            <span className={st.cellVol}>
                              {/* Хоосон бол ХООСОН — хайрцгийн хүрээ нь
                                  «энд бичнэ» гэдгийг хэлчихнэ. */}
                              {qty(c.obyem[bi])}
                              {/* ⚠️ Нэгж нь ЗӨВХӨН утга байгаа үед. Хоосон
                                  нүдэнд ганцаар «м³» гарвал «бөглөсөн» мэт
                                  харагдаж, бөглөх ёстой нүд нүднээс мултарна. */}
                              {c.obyem[bi] != null && negjOf(r.work) && (
                                <span className={st.negj}>{negjOf(r.work)}</span>
                              )}
                            </span>
                          )}
                          {/* Хувь — ЗӨВХӨН үр дүн. Товшилт нь дээрх нүдний
                              обьёмын оролтыг нээнэ (td-ийн onClick). */}
                          <span className={cls("cellPct calcPct")}>
                            {pc(c.act[bi], 1)}
                          </span>
                        </td>
                      );
                    })}

                    {/* Барилга-төлөвлөгөөт — огноо + шинэчлэгдсэн огноогоор бодогдоно. */}
                    {sc.bld.map((b, bi) => (
                      <td
                        key={`p${b}`}
                        className={cls("num bld calc")}
                        {...ro(RO.blockPlan)}
                      >
                        {pc(c.plan[bi], 1)}
                      </td>
                    ))}

                    {/* Эхлэх/Дуусах огноо — календараар засагдана (ажлын мөрд).
                        Бүлгийн мөрд дэд мөрүүдийн MIN/MAX тул зөвхөн харагдана. */}
                    {sc.bld.map((b, bi) =>
                      (["s", "e"] as const).map((k) => {
                        const key = `${r.oid}:${bi}:${k}`;
                        const fld = k === "s" ? sc.start[bi] : sc.end[bi];
                        const ms = k === "s" ? c.start[bi] : c.end[bi];
                        // ⚠️ Хаанаас ирсэн огноо вэ: `agg` = дэд мөрүүдийн
                        // MIN/MAX (бодогдоно, засагдахгүй), `own`/`none` = энэ
                        // мөрийнх (хоосон байсан ч засагдана).
                        const src = k === "s" ? c.startSrc[bi] : c.endSrc[bi];
                        // Талбар нь үйлчилгээнд байхгүй блок бий (толгой нь
                        // эвдэрсэн) — тэнд хадгалах газаргүй тул засагдахгүй.
                        const editable = !noEdit && src !== "agg" && !!fld;
                        return (
                          <td
                            key={`${k}${b}`}
                            className={cls(
                              "num c-date" +
                                (editable ? " cursor-cell" : "") +
                                (key in pendDate ? " dirty" : ""),
                            )}
                            title={
                              editable
                                ? tr('Дарж календараар сонгоно')
                                : src === "agg"
                                  ? RO.groupDate
                                  : RO.noDateField
                            }
                            onClick={(e) => {
                              if (!editable)
                                return say(src === "agg" ? RO.groupDate : RO.noDateField);
                              setPick({
                                kind: k,
                                row: r,
                                b: bi,
                                value: pendDate[key] ?? dt(ms),
                                rect: e.currentTarget.getBoundingClientRect(),
                              });
                            }}
                          >
                            {dt(ms)}
                          </td>
                        );
                      }),
                    )}
                    {/* Шинэчлэгдсэн огноо — зөвхөн эхний мөрд бичигддэг.
                        Хэрэгслийн мөрний сонгогчтой нэг утга. */}
                    {
                      <td
                        className={cls(
                          "num c-date" +
                            (i === 0 && !noEdit ? " cursor-cell" : "") +
                            (i === 0 && asOf !== asOfOrig ? " dirty" : ""),
                        )}
                        title={i === 0 ? tr('Дарж календараар сонгоно') : RO.asOfRow}
                        onClick={(e) => {
                          if (noEdit) return;
                          if (i !== 0) return say(RO.asOfRow);
                          setPick({
                            kind: "asOf",
                            row: r,
                            b: -1,
                            value: dt(asOf),
                            rect: e.currentTarget.getBoundingClientRect(),
                          });
                        }}
                      >
                        {i === 0 ? dt(asOf) : ""}
                      </td>
                    }
                    {/* ── БАРИМТ БИЧИГ — дарж текст бичнэ ──
                        ⚠️ Бүлгийн мөрд ч засагдана: М-акт, FIC зэрэг нь ажлын
                        БҮЛЭГТ олгогдож болох тул хориглосонгүй. */}
                    {DOC_COLS.map((dc, di) => {
                      const fld = sc.docs[di];
                      const key = `${r.oid}:${di}`;
                      const ekey = `${i}:${di}`;
                      const editing = editDoc === ekey;
                      const val = key in pendDoc ? pendDoc[key] : (r.docs[di] ?? "");
                      /* ⚠️ QAQC эрхгүй бол ЗӨВХӨН ХАРНА — чанарын баримтыг
                         эрх олгогдсон ажилтан л хөтөлнө. */
                      const editable = !noEdit && !!fld && canQaqc;
                      return (
                        <td
                          key={dc.name}
                          className={cls(
                            "c-doc docCell" +
                              (editable ? " cursor-cell" : "") +
                              (key in pendDoc ? " dirty" : ""),
                          )}
                          title={
                            editable
                              ? tr('{0} — дарж бичнэ', tr(dc.label))
                              : !fld
                                ? RO.noDocField
                                : !canQaqc
                                  ? RO.noQaqc
                                  : RO.docLocked
                          }
                          onClick={() => {
                            if (!editable) {
                              return say(!fld ? RO.noDocField : !canQaqc ? RO.noQaqc : RO.docLocked);
                            }
                            setEditDoc(ekey);
                          }}
                        >
                          {editing ? (
                            <input
                              autoFocus
                              type="text"
                              maxLength={4000}
                              className={st.cellInputLine}
                              defaultValue={val}
                              onBlur={(e) => {
                                commitDoc(r.oid, di, e.target.value);
                                setEditDoc(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") return setEditDoc(null);
                                if (e.key === "Enter" || e.key === "Tab") {
                                  e.preventDefault();
                                  commitDoc(r.oid, di, e.currentTarget.value);
                                  setEditDoc(null);
                                }
                              }}
                            />
                          ) : (
                            <span className={st.docText}>{val}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {/* ── МӨР НЭМЭХ МАЯГТ — зөвхөн сонгосон бүлгийн доор ── */}
                  {addFor === r.oid && (
                    <tr className={st.addRow}>
                      <td colSpan={13 + nBld * 4 + DOC_COLS.length}>
                        <div className={st.addForm}>
                          <span className={st.addTitle}>{tr('«{0}» дотор шинэ ажил', r.work)}</span>
                          <input
                            className={st.addNo}
                            value={addForm.no}
                            placeholder={tr('№')}
                            aria-label={tr('№')}
                            onChange={(e) => setAddForm((f) => ({ ...f, no: e.target.value }))}
                          />
                          <input
                            className={st.addWork}
                            value={addForm.work}
                            placeholder={tr('Ажлын нэр')}
                            aria-label={tr('Ажлын нэр')}
                            onChange={(e) => setAddForm((f) => ({ ...f, work: e.target.value }))}
                          />
                          <input
                            className={st.addNum}
                            value={addForm.vol}
                            placeholder={tr('Обьём')}
                            aria-label={tr('Обьём')}
                            inputMode="decimal"
                            onChange={(e) => setAddForm((f) => ({ ...f, vol: e.target.value }))}
                          />
                          <input
                            className={st.addNum}
                            value={addForm.unit}
                            placeholder={tr('Нэгж өртөг')}
                            aria-label={tr('Нэгж өртөг')}
                            inputMode="decimal"
                            onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
                          />
                          <button type="button" className={st.addOk} onClick={() => addRow(r, i)}>
                            {tr('Нэмэх')}
                          </button>
                          <button type="button" className={st.addNo2} onClick={() => setAddFor(null)}>
                            {tr('Болих')}
                          </button>
                          {/* ⚠️ Жин ба Мөнгөн дүн ЭНД БАЙХГҮЙ — Обьём×Нэгж өртгөөс
                              өөрөө бодогдож, дээд бүлгүүдийн жинг ч дахин тараана. */}
                          <span className={st.addHint}>
                            {tr('Хувийн жин ба Мөнгөн дүн автоматаар бодогдоно.')}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
              {/* Доод ЧИГЖЭЭС — гүйлгэх зурвасны урт үнэн байлгана. */}
              {winTo < vis.length && (
                <tr
                  aria-hidden="true"
                  style={{ height: (vis.length - winTo) * rowHRef.current }}
                >
                  <td colSpan={13 + nBld * 4 + DOC_COLS.length} style={{ padding: 0, border: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Огнооны календар — нүдэнд биш, ХУУДСАН ДЭЭР хөвж гарна (fixed).
          Хүснэгтийн нүд дотор байрлуулбал `overflow: hidden`-д таслагдана. */}
      {pick && (
        <DatePicker
          value={pick.value}
          anchor={pick.rect}
          onClose={() => setPick(null)}
          onPick={(v) => {
            if (pick.kind === "asOf") {
              // ⚠️ Хоосон болговол calc=[] болж бүх мөр алга болно — тиймээс
              //    задлагдсан үед л солино.
              const ms = inputToMs(v);
              if (ms != null) setAsOf(ms);
            } else {
              commitDate(pick.row, pick.b, pick.kind, v);
            }
            setPick(null);
          }}
        />
      )}

      {notice && (
        <div className={st.notice} role="status" onClick={() => setNotice("")}>
          <b>{tr('Энэ нүд засагдахгүй.')}</b> {notice}
        </div>
      )}
    </div>
  );
}
