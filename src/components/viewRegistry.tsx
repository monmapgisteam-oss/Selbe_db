'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';
import type { Dim } from '@/components/MapCanvas';
import type { ViewKey } from '@/lib/services';

/**
 * ХАРАГДАЦЫН БҮРТГЭЛ — `ViewKey` → бүтэн дэлгэцийн (`standalone`) модуль.
 *
 * ⚠️ 2026-09-30: урьд нь шинэ харагдац нэмэхэд `Portal.tsx`-д ГУРВАН газар
 *    засдаг байв (dynamic импортын жагсаалт · `isX` тугууд · 20 давхар
 *    гурвалсан операторын гинж). Одоо ЭНЭ файлын нэг мөр + `services/views.ts`.
 *    `VIEW_REGISTRY`-ийн төрөл нь `Record<…>` тул `ViewKey`-д шинэ түлхүүр
 *    нэмээд энд бүртгэхгүй бол `tsc` унана (`viewRegistry.check.mjs` мөн).
 *
 * ⚠️ `MapOnlyViewKey` — газрын зураг + баруун самбараар (`ViewPanel`)
 *    зурагддаг, `standalone` БИШ харагдацууд. Тэдгээр энд бүртгэгдэхгүй;
 *    `Portal` нь `isFull` салбарт л бүртгэлээс уншина.
 *
 * ⚠️ `Dashboard` СТАТИК импорт. Анх `DEFAULT_VIEW` байсан тул «нэмэлт спиннергүй
 *    байх» үүднээс статик болгосон; 2026-09-ээс `DEFAULT_VIEW = "gdash"`
 *    (`GeneralDash`, доор dynamic) болсон ч Dashboard-ыг статик үлдээв —
 *    `MapCanvas` (+ `@arcgis/core`) нь түүний дамжсан хамаарал бөгөөд бүх
 *    зурагтай харагдацад ямар ч байсан татагдана; Dashboard өөрөө жижиг тул
 *    chunk болгох ашиггүй.
 *
 * ⚠️ ТОМ, ховор-эхний харагдацууд dynamic chunk (2026-08-21 гүйцэтгэлийн
 *    аудит): Suitability (analysis стек), Sheet/Pivot, Tailan (+reportPdf),
 *    Guitsetgel, Finance нийлээд Portal chunk-ийн parse хугацааг ~30-40%
 *    нэмдэг байв. Portal нөхцөлт рендэрлэдэг тул unmount үеийн зан
 *    өөрчлөгдөхгүй; эхний нээлтэд Booting-той ижил түр төлөв харагдана.
 *
 * ⚠️ 2026-09-03-ны хэрэглэгч талын аудит: газрын зурагтай ҮЛДСЭН харагдацууд
 *    (PkgFin · PkgProg · Gazar · Habea · Irged · Iot · Ersdel) МӨН статик байсан
 *    тул тэдгээрийн ~474 KB эх код нь `?v=huvaari` гэж шууд орсон хүнд ч
 *    татагддаг байв. Тэдгээр нь `MapCanvas`-ыг ХУВААЛЦДАГ (Dashboard-той нэг
 *    chunk) тул динамик болгоход ArcGIS давхардахгүй — зөвхөн өөрсдийнх нь код
 *    хойшилно.
 *
 * ⚠️ Шинэ «Ерөнхий дашбоард» нь `Dashboard`-аас ЯЛГААТАЙ dynamic: тэр нь
 *    `DEFAULT_VIEW` тул статик хэвээр (эхний ачаалалтад заавал хэрэгтэй), энэ
 *    нь нээх үедээ л татагдана.
 */
/**
 * ⚠️ 2026-10-04 (ачааллын аудит): `Dashboard` МӨН dynamic болов. Дээрх «Dashboard
 *    өөрөө жижиг» гэсэн таамаг ХЭМЖИЛТЭЭР НЯЦААГДАВ: `Dashboard.tsx` нь 314 КБ
 *    бөгөөд `Finance` (`loadFinData` …), `PkgProg` (`aggregateMonths` …),
 *    `execData`, `gdash`-ийг СТАТИК дагуулдаг тул нийт ~1.8 МБ эх код Portal-ын
 *    үндсэн chunk-д орж, `DEFAULT_VIEW = "gdash"` (Ерөнхий дашбоард) эсвэл
 *    `?v=huvaari` гэж орсон хүн ч татаж parse хийдэг байв (Portal chunk-ийн эх
 *    кодын ~48%). `MapCanvas` (+ ArcGIS) нь `Portal`-ын өөрийн статик импорт
 *    тул Portal chunk-д ХЭВЭЭР — давхардахгүй.
 *
 * ⚠️ 2026-10-04: ачаалагчид НЭГ газарт (`LOAD`) — `dynamic()` ба `prefetchView`
 *    (нүүр хуудаснаас «Орох»-ын өмнө дэвсгэрт татах, `Root`) ИЖИЛ `import()`-ийг
 *    хуваалцана (webpack-д нэг chunk, давхар хүсэлтгүй). `Record<…>` тул шинэ
 *    харагдацын ачаалагчийг мартвал `tsc` унана.
 */
type Loader = () => Promise<unknown>;
const LOAD = {
  gdash: () => import('@/modules/GeneralDash').then((m) => m.GeneralDash),
  dashboard: () => import('@/modules/Dashboard').then((m) => m.Dashboard),
  pkgFin: () => import('@/modules/PkgFin').then((m) => m.PkgFin),
  pkgProg: () => import('@/modules/PkgProg').then((m) => m.PkgProg),
  gazar: () => import('@/modules/Gazar').then((m) => m.Gazar),
  habea: () => import('@/modules/Habea').then((m) => m.Habea),
  irged: () => import('@/modules/Irged').then((m) => m.Irged),
  iot: () => import('@/modules/Iot').then((m) => m.Iot),
  ersdel: () => import('@/modules/Ersdel').then((m) => m.Ersdel),
  /* ⚠️ «Дэд бүтэц» нь бусад газрын зурагтай харагдацтай ИЖИЛ dynamic: модуль
     нь DedButetsEdit ба butetsEdit.ts-ийг дагуулдаг (~92 KB эх код) бөгөөд
     `MapCanvas`-ыг тэдэнтэй ХУВААЛЦДАГ тул ArcGIS давхардахгүй. Статик
     импорт бол `?v=huvaari` гэж орсон хүнд ч татагдана. */
  dedButets: () => import('@/modules/DedButets').then((m) => m.DedButets),
  analysis: () => import('@/modules/analysis/Suitability').then((m) => m.Suitability),
  finance: () => import('@/modules/Finance').then((m) => m.Finance),
  guitsetgel: () => import('@/modules/Guitsetgel').then((m) => m.Guitsetgel),
  qaqc: () => import('@/modules/Qaqc').then((m) => m.Qaqc),
  chanar: () => import('@/modules/Chanar').then((m) => m.Chanar),
  zovshoorol: () => import('@/modules/Zovshoorol').then((m) => m.Zovshoorol),
  tailan: () => import('@/modules/Tailan').then((m) => m.Tailan),
  /* ⚠️ ТУХ нь санхүү · хуваарь · чанар · ХАБЭА-гийн ачаалагчдыг дагуулдаг тул зөвхөн нээгдэх үедээ. */
  tuh: () => import('@/modules/Tuh').then((m) => m.Tuh),
  /* ⚠️ Багцын хамаарал — санхүүгийн ачаалагчийг (`loadFinData`) дагуулдаг тул нээгдэх үедээ (tezu-bonu). */
  bagtsHamaaral: () => import('@/modules/BagtsHamaaral').then((m) => m.BagtsHamaaral),
  /* ⚠️ Хуваарь нь 10 бөглөх хуудсын схем + 1,400 мөрийг татдаг тул зөвхөн
     нээгдэх үедээ ачаалагдана (`dynamic`) — бусад харагдацыг хүндрүүлэхгүй. */
  huvaari: () => import('@/modules/Huvaari').then((m) => m.Huvaari),
  /* ⚠️ Батлах дараалал нь `loadAllPending`-ээр БҮХ багцын pending мөрийг татдаг
     тул зөвхөн нээгдэх үедээ (`Huvaari`-тай ижил шалтгаан). */
  huvaariBatlah: () => import('@/modules/HuvaariBatlah').then((m) => m.HuvaariBatlah),
  ajilBatlah: () => import('@/modules/AjilBatlah').then((m) => m.AjilBatlah),
  /* ⚠️ Схем нь зургаан эх сурвалжийн ачаалагчийг дагуулдаг тул порталын үндсэн
     багцад ОРУУЛАХГҮЙ — зөвхөн нээгдэх үедээ. */
  schem: () => import('@/modules/Schem').then((m) => m.Schem),
  /* ⚠️ Системийн баримт — 54 КБ бичвэр агуулдаг тул ЗААВАЛ dynamic: нээгээгүй
     хэрэглэгч тэр жинг ачаалахгүй. */
  sysdoc: () => import('@/modules/SysDoc').then((m) => m.default),
};
/* Шинэ харагдацын ачаалагчийг мартвал энд `tsc` унана (`satisfies` БИШ — тэр нь `.then`-ий төрлийн дүгнэлтийг эвддэг) */
const LOAD_ALL: Record<Exclude<ViewKey, MapOnlyViewKey>, Loader> = LOAD;

const GeneralDash = dynamic(() => LOAD.gdash(), { ssr: false });
const Dashboard = dynamic(() => LOAD.dashboard(), { ssr: false });
const PkgFin = dynamic(() => LOAD.pkgFin(), { ssr: false });
const PkgProg = dynamic(() => LOAD.pkgProg(), { ssr: false });
const Gazar = dynamic(() => LOAD.gazar(), { ssr: false });
const Habea = dynamic(() => LOAD.habea(), { ssr: false });
const Irged = dynamic(() => LOAD.irged(), { ssr: false });
const Iot = dynamic(() => LOAD.iot(), { ssr: false });
const Ersdel = dynamic(() => LOAD.ersdel(), { ssr: false });
const DedButets = dynamic(() => LOAD.dedButets(), { ssr: false });
const Suitability = dynamic(() => LOAD.analysis(), { ssr: false });
const Finance = dynamic(() => LOAD.finance(), { ssr: false });
const Guitsetgel = dynamic(() => LOAD.guitsetgel(), { ssr: false });
const Qaqc = dynamic(() => LOAD.qaqc(), { ssr: false });
const Chanar = dynamic(() => LOAD.chanar(), { ssr: false });
const Zovshoorol = dynamic(() => LOAD.zovshoorol(), { ssr: false });
const Tailan = dynamic(() => LOAD.tailan(), { ssr: false });
const Tuh = dynamic(() => LOAD.tuh(), { ssr: false });
const BagtsHamaaral = dynamic(() => LOAD.bagtsHamaaral(), { ssr: false });
const Huvaari = dynamic(() => LOAD.huvaari(), { ssr: false });
const HuvaariBatlah = dynamic(() => LOAD.huvaariBatlah(), { ssr: false });
const AjilBatlah = dynamic(() => LOAD.ajilBatlah(), { ssr: false });
const Schem = dynamic(() => LOAD.schem(), { ssr: false });
const SysDoc = dynamic(() => LOAD.sysdoc(), { ssr: false });

/**
 * Харагдацын chunk-ийг ДЭВСГЭРТ урьдчилан татах (⚠️ 2026-10-04) — `Root` нүүр
 * хуудсан дээр байхад орох магадлалтай харагдацад дуудна; «Орох» дарахад
 * Portal → харагдацын chunk гэсэн ДАРААЛСАН хүлээлт арилна. Зураг+самбарын
 * (`MapOnlyViewKey`) харагдацын код Portal-д аль хэдийн байгаа тул юу ч хийхгүй.
 * Алдааг залгина — жинхэнэ нээлтэд `dynamic()` өөрөө дахин оролдож, алдаагаа харуулна.
 */
export function prefetchView(view: ViewKey): void {
  const l = (LOAD_ALL as Partial<Record<ViewKey, Loader>>)[view];
  if (l) l().catch(() => { /* жинхэнэ нээлтэд dynamic() дахин оролдоно */ });
}

/** «Хуваарь батлах» → «Хуваарь» санах ойн дамжуулалт (`Portal`-ын `planJump`-ын ⚠️) */
export type PlanJump = { pkgKey: string; oid: number };

/**
 * Харагдацад `Portal`-оос дамжих контекст. Модуль бүр зөвхөн өөрт хэрэгтэйг
 * нь авна — доорх бүртгэлийн мөр тус бүр ямар проп очихыг ил заана.
 */
export type ViewCtx = {
  dim: Dim;
  setDim: (d: Dim) => void;
  zone: string | null;
  setZone: (z: string | null) => void;
  navScope: 'all' | ViewKey[];
  /** `Portal.setView` — шүүлт, сонголт, давхаргыг цэвэрлэдэг тул URL-аар тойрч болохгүй */
  setView: (v: ViewKey) => boolean;
  planJump: PlanJump | null;
  setPlanJump: (j: PlanJump) => void;
  clearPlanJump: () => void;
};

/** Газрын зураг + самбараар зурагддаг (`standalone` биш) харагдацууд — бүртгэлд ОРОХГҮЙ */
export type MapOnlyViewKey = 'plan';

export type RenderView = (ctx: ViewCtx) => ReactElement;

export const VIEW_REGISTRY: Record<Exclude<ViewKey, MapOnlyViewKey>, RenderView> = {
  gdash: ({ dim, setDim, zone, setZone }) => <GeneralDash dim={dim} setDim={setDim} zone={zone} setZone={setZone} />,
  dashboard: ({ dim, setDim, zone, setZone }) => <Dashboard dim={dim} setDim={setDim} zone={zone} setZone={setZone} />,
  pkgFin: ({ dim, setDim }) => <PkgFin dim={dim} setDim={setDim} />,
  pkgProg: ({ dim, setDim }) => <PkgProg dim={dim} setDim={setDim} />,
  huvaari: ({ planJump, clearPlanJump }) => <Huvaari jump={planJump} onJumpDone={clearPlanJump} />,
  huvaariBatlah: ({ navScope, setPlanJump, setView }) => (
    <HuvaariBatlah
      navScope={navScope}
      /* ⚠️ `setView`-ЭЭР шилжинэ, URL-аар БИШ (`Schem`-ийн доорх дүрэмтэй
         ижил): тэр функц шүүлт, сонголт, давхаргыг цэвэрлэдэг. */
      onApprove={(pkgKey, oid) => {
        setPlanJump({ pkgKey, oid });
        setView('huvaari');
      }}
    />
  ),
  /* ⚠️ `onApprove`-ГҮЙ (`HuvaariBatlah`-аас ЯЛГААТАЙ): батлах нь тэр хуудсандаа
     бүрэн дуусна — эх өгөгдөлд хүрдэггүй тул шилжих шаардлагагүй. Батлагдсан
     мөр нь «Гүйцэтгэл бөглөх» нээгдэхэд тэнд өөрөө буудаг (`FillNew`-ийн
     `loadApproved` эффект). */
  ajilBatlah: () => <AjilBatlah />,
  /* ⚠️ 2026-10-04: ТУХ-ын бүтэц — баруун талд газрын зураг тул `dim` хэрэгтэй */
  tailan: ({ dim, setDim }) => <Tailan dim={dim} setDim={setDim} />,
  tuh: ({ dim, setDim }) => <Tuh dim={dim} setDim={setDim} />,
  bagtsHamaaral: () => <BagtsHamaaral />,
  gazar: ({ dim, setDim }) => <Gazar dim={dim} setDim={setDim} />,
  finance: () => <Finance />,
  habea: ({ dim, setDim }) => <Habea dim={dim} setDim={setDim} />,
  irged: ({ dim, setDim }) => <Irged dim={dim} setDim={setDim} />,
  iot: ({ dim, setDim }) => <Iot dim={dim} setDim={setDim} />,
  ersdel: ({ dim, setDim }) => <Ersdel dim={dim} setDim={setDim} />,
  dedButets: ({ dim, setDim }) => <DedButets dim={dim} setDim={setDim} />,
  zovshoorol: () => <Zovshoorol />,
  guitsetgel: () => <Guitsetgel />,
  qaqc: () => <Qaqc />,
  chanar: () => <Chanar />,
  /* ⚠️ `setView` нь ЗАНГИЛАА ДАРАХАД шилжихэд хэрэгтэй. URL-аар тойрч
     болохгүй — энэ функц шүүлт, сонголт, давхаргыг ч цэвэрлэдэг. */
  schem: ({ setView, navScope }) => <Schem setView={setView} navScope={navScope} />,
  sysdoc: ({ setView, navScope }) => <SysDoc setView={setView} navScope={navScope} />,
  analysis: ({ dim, setDim }) => <Suitability dim={dim} setDim={setDim} />,
};

/** Бүртгэлгүй (зураг+самбар) харагдацад `null` */
export function renderView(view: ViewKey, ctx: ViewCtx): ReactElement | null {
  const r = (VIEW_REGISTRY as Partial<Record<ViewKey, RenderView>>)[view];
  return r ? r(ctx) : null;
}

/**
 * `Portal`-ын `isFull` салбарын НЭГ цэг.
 *
 * ⚠️ Компонент (энгийн функц дуудалт биш): `Portal`-д `renderView(view, {…setView})`
 *    гэж рендер дотор шууд дуудвал eslint `react-hooks/refs` нь `setView`
 *    (дотроо ref уншдаг callback) рендерийн үед дуудагдаж магадгүй гэж
 *    тэмдэглэдэг. JSX проп нь үйл явдлын зам гэж тооцогдоно — урьдын
 *    `setView={setView}` хэлбэртэй ижил.
 */
export function ViewSlot({ view, ctx }: { view: ViewKey; ctx: ViewCtx }) {
  return renderView(view, ctx);
}
