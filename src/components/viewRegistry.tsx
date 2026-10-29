'use client';

import dynamic from 'next/dynamic';
import { memo, type ReactElement } from 'react';
import type { Dim } from '@/components/MapCanvas';
import type { ViewKey } from '@/lib/services';
import { t as tr } from '@/lib/i18nCore';

/**
 * ХАРАГДАЦЫН БҮРТГЭЛ — `ViewKey` → бүтэн дэлгэцийн (`standalone`) модуль.
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
  dedButets: () => import('@/modules/DedButets').then((m) => m.DedButets),
  analysis: () => import('@/modules/analysis/Suitability').then((m) => m.Suitability),
  finance: () => import('@/modules/Finance').then((m) => m.Finance),
  guitsetgel: () => import('@/modules/Guitsetgel').then((m) => m.Guitsetgel),
  zovshoorol: () => import('@/modules/Zovshoorol').then((m) => m.Zovshoorol),
  tailan: () => import('@/modules/Tailan').then((m) => m.Tailan),
  tuh: () => import('@/modules/Tuh').then((m) => m.Tuh),
  bagtsHamaaral: () => import('@/modules/BagtsHamaaral').then((m) => m.BagtsHamaaral),
  zuragTosol: () => import('@/modules/ZuragTosol').then((m) => m.ZuragTosol),
  tuvshin6: () => import('@/modules/LevelPlan').then((m) => m.LevelPlan),
  huvaari: () => import('@/modules/Huvaari').then((m) => m.Huvaari),
  huvaariBatlah: () => import('@/modules/HuvaariBatlah').then((m) => m.HuvaariBatlah),
  ajilBatlah: () => import('@/modules/AjilBatlah').then((m) => m.AjilBatlah),
  schem: () => import('@/modules/Schem').then((m) => m.Schem),
  sysdoc: () => import('@/modules/SysDoc').then((m) => m.default),
  ma: () => import('@/modules/Ma').then((m) => m.Ma),
};
/* Шинэ харагдацын ачаалагчийг мартвал энд `tsc` унана (`satisfies` БИШ — тэр нь `.then`-ий төрлийн дүгнэлтийг эвддэг) */
const LOAD_ALL: Record<Exclude<ViewKey, MapOnlyViewKey>, Loader> = LOAD;

function ViewLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ height: '100%', minHeight: 240, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: '0.85rem' }}
    >
      {tr('Ачаалж байна…')}
    </div>
  );
}

const GeneralDash = dynamic(() => LOAD.gdash(), { ssr: false, loading: ViewLoading });
const Dashboard = dynamic(() => LOAD.dashboard(), { ssr: false, loading: ViewLoading });
const PkgFin = dynamic(() => LOAD.pkgFin(), { ssr: false, loading: ViewLoading });
const PkgProg = dynamic(() => LOAD.pkgProg(), { ssr: false, loading: ViewLoading });
const Gazar = dynamic(() => LOAD.gazar(), { ssr: false, loading: ViewLoading });
const Habea = dynamic(() => LOAD.habea(), { ssr: false, loading: ViewLoading });
const Irged = dynamic(() => LOAD.irged(), { ssr: false, loading: ViewLoading });
const Iot = dynamic(() => LOAD.iot(), { ssr: false, loading: ViewLoading });
const Ersdel = dynamic(() => LOAD.ersdel(), { ssr: false, loading: ViewLoading });
const DedButets = dynamic(() => LOAD.dedButets(), { ssr: false, loading: ViewLoading });
const Suitability = dynamic(() => LOAD.analysis(), { ssr: false, loading: ViewLoading });
const Finance = dynamic(() => LOAD.finance(), { ssr: false, loading: ViewLoading });
const Guitsetgel = dynamic(() => LOAD.guitsetgel(), { ssr: false, loading: ViewLoading });
const Zovshoorol = dynamic(() => LOAD.zovshoorol(), { ssr: false, loading: ViewLoading });
const Tailan = dynamic(() => LOAD.tailan(), { ssr: false, loading: ViewLoading });
const Tuh = dynamic(() => LOAD.tuh(), { ssr: false, loading: ViewLoading });
const BagtsHamaaral = dynamic(() => LOAD.bagtsHamaaral(), { ssr: false, loading: ViewLoading });
const ZuragTosol = dynamic(() => LOAD.zuragTosol(), { ssr: false, loading: ViewLoading });
const LevelPlan = dynamic(() => LOAD.tuvshin6(), { ssr: false, loading: ViewLoading });
const Huvaari = dynamic(() => LOAD.huvaari(), { ssr: false, loading: ViewLoading });
const HuvaariBatlah = dynamic(() => LOAD.huvaariBatlah(), { ssr: false, loading: ViewLoading });
const AjilBatlah = dynamic(() => LOAD.ajilBatlah(), { ssr: false, loading: ViewLoading });
const Schem = dynamic(() => LOAD.schem(), { ssr: false, loading: ViewLoading });
const SysDoc = dynamic(() => LOAD.sysdoc(), { ssr: false, loading: ViewLoading });
const Ma = dynamic(() => LOAD.ma(), { ssr: false, loading: ViewLoading });

/**
 * Харагдацын chunk-ийг ДЭВСГЭРТ урьдчилан татах (2026-10-04) — `Root` нүүр
 * хуудсан дээр байхад орох магадлалтай харагдацад дуудна; «Орох» дарахад
 * Portal → харагдацын chunk гэсэн ДАРААЛСАН хүлээлт арилна. Зураг+самбарын
 * (`MapOnlyViewKey`) харагдацын код Portal-д аль хэдийн байгаа тул юу ч хийхгүй.
 * Алдааг залгина — жинхэнэ нээлтэд `dynamic` өөрөө дахин оролдож, алдаагаа харуулна.
 */
export function prefetchView(view: ViewKey): void {
  const l = (LOAD_ALL as Partial<Record<ViewKey, Loader>>)[view];
  if (l) l().catch(() => { /* жинхэнэ нээлтэд dynamic() дахин оролдоно */ });
}

/** «Хуваарь батлах» → «Хуваарь» санах ойн дамжуулалт (`Portal`-ын `planJump`) */
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
export type MapOnlyViewKey = 'plan' | 'hesegET';

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
      onApprove={(pkgKey, oid) => {
        setPlanJump({ pkgKey, oid });
        setView('huvaari');
      }}
    />
  ),
  ajilBatlah: () => <AjilBatlah />,
  tailan: ({ dim, setDim }) => <Tailan dim={dim} setDim={setDim} />,
  tuh: ({ dim, setDim, setView, navScope }) => (
    <Tuh
      dim={dim}
      setDim={setDim}
      onOpenDeps={navScope === 'all' || navScope.includes('bagtsHamaaral') ? () => { setView('bagtsHamaaral'); } : undefined}
    />
  ),
  bagtsHamaaral: () => <BagtsHamaaral />,
  zuragTosol: () => <ZuragTosol />,
  tuvshin6: () => <LevelPlan />,
  gazar: ({ dim, setDim }) => <Gazar dim={dim} setDim={setDim} />,
  finance: () => <Finance />,
  habea: ({ dim, setDim }) => <Habea dim={dim} setDim={setDim} />,
  irged: ({ dim, setDim }) => <Irged dim={dim} setDim={setDim} />,
  iot: ({ dim, setDim }) => <Iot dim={dim} setDim={setDim} />,
  ersdel: ({ dim, setDim }) => <Ersdel dim={dim} setDim={setDim} />,
  dedButets: ({ dim, setDim }) => <DedButets dim={dim} setDim={setDim} />,
  zovshoorol: () => <Zovshoorol />,
  guitsetgel: () => <Guitsetgel />,
  ma: () => <Ma />,
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
 */
export const ViewSlot = memo(function ViewSlot({ view, ctx }: { view: ViewKey; ctx: ViewCtx }) {
  return renderView(view, ctx);
});
