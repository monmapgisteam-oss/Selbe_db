/**
 * CEO-ГИЙН САМБАРЫН БҮРТГЭЛ — 13 үзүүлэлт, ачаалагч бүрийн заалт.
 */
import { t as tr } from '@/lib/i18nCore';
import type { ViewKey } from '@/lib/services';
import type { KpiResult } from './kpi';
import { loadVarianceKpi } from './variance';
import { loadIpcKpi } from './ipc';
import { loadContractGapKpi } from './contractGap';
import { loadUncontractedKpi } from './uncontracted';
import { loadScheduleKpi } from './schedule';
import { loadReviewKpi } from './review';
import { loadLandKpi } from './land';
import { loadPermitsKpiSafe } from './permits';
import { loadSafetyKpi } from './safety';
import { loadWorkforceKpi } from './workforce';
import { loadSuitabilityKpi } from './suitability';
import { loadIotKpiSafe } from './iot';

export type CeoKpiDef = {
  key: string;
  /**
   * Дэлгэрэнгүйн гарчиг — НЭГ мөр.
   */
  title: string;
  icon: string;
  /** Дэлгэрэнгүйгээс очих харагдац */
  view: ViewKey;
  load: () => Promise<KpiResult>;
  /**
   * ХҮНД ачаалагч — олон хүснэгт/геометр татдаг. Хөнгөн картууд эхэлж
   * зурагдсаны дараа, хөтөч чөлөөтэй болмогц шатлан эхэлнэ (ArcGIS «Too many
   * requests» — 2026-08-21-ний гүйцэтгэлийн аудит).
   */
  heavy?: true;
};

export const CEO_KPIS: CeoKpiDef[] = [
  { key: 'suitability', get title() { return tr('Тохиромжтой байдал'); }, icon: 'grid', view: 'analysis', load: loadSuitabilityKpi, heavy: true },
  { key: 'permits', get title() { return tr('Зөвшөөрөл'); }, icon: 'frame', view: 'zovshoorol', load: loadPermitsKpiSafe },
  { key: 'land', get title() { return tr('Газар чөлөөлөлт'); }, icon: 'polygon', view: 'gazar', load: loadLandKpi, heavy: true },
  { key: 'schedule', get title() { return tr('Хуваарийн хоцрогдол'); }, icon: 'calendar', view: 'pkgProg', load: loadScheduleKpi },
  { key: 'variance', get title() { return tr('Обьёмын зөрүү'); }, icon: 'chart', view: 'guitsetgel', load: loadVarianceKpi, heavy: true },
  { key: 'iot', get title() { return tr('IoT — босго хэтрэлт'); }, icon: 'radio', view: 'iot', load: loadIotKpiSafe },
  { key: 'workforce', get title() { return tr('Хүн · техник'); }, icon: 'users', view: 'habea', load: loadWorkforceKpi },
  { key: 'safety', get title() { return tr('ХАБЭА — осол, зөрчил'); }, icon: 'shield', view: 'habea', load: loadSafetyKpi },
  { key: 'review', get title() { return tr('Хяналтын хоцролт'); }, icon: 'reset', view: 'guitsetgel', load: loadReviewKpi },
  { key: 'contractGap', get title() { return tr('Гэрээ ба төсвийн зөрүү'); }, icon: 'calc', view: 'finance', load: loadContractGapKpi },
  { key: 'uncontracted', get title() { return tr('Гэрээгүй ажил'); }, icon: 'pen', view: 'finance', load: loadUncontractedKpi },
  { key: 'ipc', get title() { return tr('IPC — олгосон санхүүжилт'); }, icon: 'file', view: 'finance', load: loadIpcKpi },
];
