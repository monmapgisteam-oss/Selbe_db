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
import { Dashboard } from '@/modules/Dashboard';

const GeneralDash = dynamic(() => import('@/modules/GeneralDash').then((m) => m.GeneralDash), { ssr: false });
const PkgFin = dynamic(() => import('@/modules/PkgFin').then((m) => m.PkgFin), { ssr: false });
const PkgProg = dynamic(() => import('@/modules/PkgProg').then((m) => m.PkgProg), { ssr: false });
const Gazar = dynamic(() => import('@/modules/Gazar').then((m) => m.Gazar), { ssr: false });
const Habea = dynamic(() => import('@/modules/Habea').then((m) => m.Habea), { ssr: false });
const Irged = dynamic(() => import('@/modules/Irged').then((m) => m.Irged), { ssr: false });
const Iot = dynamic(() => import('@/modules/Iot').then((m) => m.Iot), { ssr: false });
const Ersdel = dynamic(() => import('@/modules/Ersdel').then((m) => m.Ersdel), { ssr: false });
/* ⚠️ «Дэд бүтэц» нь бусад газрын зурагтай харагдацтай ИЖИЛ dynamic: модуль
   нь DedButetsEdit ба butetsEdit.ts-ийг дагуулдаг (~92 KB эх код) бөгөөд
   `MapCanvas`-ыг тэдэнтэй ХУВААЛЦДАГ тул ArcGIS давхардахгүй. Статик
   импорт бол `?v=huvaari` гэж орсон хүнд ч татагдана. */
const DedButets = dynamic(() => import('@/modules/DedButets').then((m) => m.DedButets), { ssr: false });
const Suitability = dynamic(() => import('@/modules/analysis/Suitability').then((m) => m.Suitability), { ssr: false });
const Finance = dynamic(() => import('@/modules/Finance').then((m) => m.Finance), { ssr: false });
const Guitsetgel = dynamic(() => import('@/modules/Guitsetgel').then((m) => m.Guitsetgel), { ssr: false });
const Qaqc = dynamic(() => import('@/modules/Qaqc').then((m) => m.Qaqc), { ssr: false });
const Chanar = dynamic(() => import('@/modules/Chanar').then((m) => m.Chanar), { ssr: false });
const Zovshoorol = dynamic(() => import('@/modules/Zovshoorol').then((m) => m.Zovshoorol), { ssr: false });
const Tailan = dynamic(() => import('@/modules/Tailan').then((m) => m.Tailan), { ssr: false });
/* ⚠️ ТУХ нь санхүү · хуваарь · чанар · ХАБЭА-гийн ачаалагчдыг дагуулдаг тул зөвхөн нээгдэх үедээ. */
const Tuh = dynamic(() => import('@/modules/Tuh').then((m) => m.Tuh), { ssr: false });
/* ⚠️ Багцын хамаарал — санхүүгийн ачаалагчийг (`loadFinData`) дагуулдаг тул нээгдэх үедээ. */
const BagtsHamaaral = dynamic(() => import('@/modules/BagtsHamaaral').then((m) => m.BagtsHamaaral), { ssr: false });
/* ⚠️ Хуваарь нь 10 бөглөх хуудсын схем + 1,400 мөрийг татдаг тул зөвхөн
   нээгдэх үедээ ачаалагдана (`dynamic`) — бусад харагдацыг хүндрүүлэхгүй. */
const Huvaari = dynamic(() => import('@/modules/Huvaari').then((m) => m.Huvaari), { ssr: false });
/* ⚠️ Батлах дараалал нь `loadAllPending`-ээр БҮХ багцын pending мөрийг татдаг
   тул зөвхөн нээгдэх үедээ (`Huvaari`-тай ижил шалтгаан). */
const HuvaariBatlah = dynamic(() => import('@/modules/HuvaariBatlah').then((m) => m.HuvaariBatlah), { ssr: false });
const AjilBatlah = dynamic(() => import('@/modules/AjilBatlah').then((m) => m.AjilBatlah), { ssr: false });
/* ⚠️ Схем нь зургаан эх сурвалжийн ачаалагчийг дагуулдаг тул порталын үндсэн
   багцад ОРУУЛАХГҮЙ — зөвхөн нээгдэх үедээ. */
const Schem = dynamic(() => import('@/modules/Schem').then((m) => m.Schem), { ssr: false });
/* ⚠️ Системийн баримт — 54 КБ бичвэр агуулдаг тул ЗААВАЛ dynamic: нээгээгүй
   хэрэглэгч тэр жинг ачаалахгүй. */
const SysDoc = dynamic(() => import('@/modules/SysDoc'), { ssr: false });

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
