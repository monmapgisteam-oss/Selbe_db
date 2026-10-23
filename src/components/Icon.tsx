/** Портал даяар хэрэглэх дүрсүүд — lucide-react (24×24, stroke) */

import {
  BookOpen, Box, Briefcase, Building2, Bus, CalendarCheck, CalendarDays, Calculator, Car, ChartColumn, Coins,
  Crosshair, Droplet, FileChartColumn, FilePen, FileText, Flame, Frame, HardHat, Info, Layers, LayoutGrid,
  LayoutPanelLeft, Link, ListChecks, MapPin, Moon, Network, Pentagon, Plus, RadioTower, RotateCcw, Route,
  ShieldCheck, Stamp, Sun, Trash2, Users, Waves, Workflow, Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * ⚠️ 2026-10-23: Environment — өөрийн SVG багцыг (2026-08-18-ны «smart-city» геометр) lucide-react-ээр
 *    СОЛИВ. Экспортын API (`Icon({ name, size })` · нэрс) ХЭВЭЭР — дуудагч 25 файл, `services`/`caps`/`schem`-ийн
 *    `icon: '…'` түлхүүрүүд өөрчлөгдөхгүй. Нэр бүр хамгийн ойр утгатай lucide дүрс рүү зурагдана; шинэ нэр
 *    нэмэхдээ ЭНД нэг мөр нэмнэ (байхгүй нэр → `null`, урьдын адил чимээгүй).
 */
const I: Record<string, LucideIcon> = {
  /* Хүрээ / бүс */
  frame: Frame,
  /* Хяналтын самбар */
  grid: LayoutGrid,
  building: Building2,
  pin: MapPin,
  calc: Calculator,
  layers: Layers,
  network: Network,
  /* Мэдрэгч / IoT */
  radio: RadioTower,
  sun: Sun,
  moon: Moon,
  target: Crosshair,
  /* Өгөгдөл оруулах — маягт + бичих */
  pen: FilePen,
  trash: Trash2,
  chart: ChartColumn,
  users: Users,
  /* Хамгаалалт / ХАБЭА */
  shield: ShieldCheck,
  /* ── Инженерийн багцын дүрсүүд ── */
  flame: Flame,
  droplet: Droplet,
  waves: Waves,
  bolt: Zap,
  road: Route,
  bus: Bus,
  car: Car,
  polygon: Pentagon,
  /* ТЭЗҮ-БОНУ-гийн ганц баримт */
  file: FileText,
  /* «Системийн баримт» — олон бүлэгтэй гарын авлага (`file`-ээс ЯЛГАГДАНА) */
  book: BookOpen,
  reset: RotateCcw,
  plus: Plus,
  calendar: CalendarDays,

  /* ⚠️ 2026-10-23 (UX аудит S4): ЦЭСНИЙ ДҮРС ДАВХЦАЛ — зүүн цэс хураагдсан үед зөвхөн дүрс үлддэг атлаа
     6 харагдац `shield`, 3 нь `layers`, 3 нь `network`, 2 нь `grid`/`chart` хуваалцаж, хэрэглэгч аль нь
     аль болохыг ялгаж чадахгүй байв. Харагдац бүр ӨӨРИЙН дүрстэй (`services/views.ts`). tezu-bonu-гийн
     lucide-react шилжилттэй нэгтгэхэд (2026-10-23) ижил утгатай lucide дүрс рүү зурагдав. */
  info: Info,
  sections: LayoutPanelLeft,
  briefcase: Briefcase,
  calendarCheck: CalendarCheck,
  listCheck: ListChecks,
  helmet: HardHat,
  stamp: Stamp,
  cube: Box,
  flow: Workflow,
  link: Link,
  report: FileChartColumn,
  coins: Coins,
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const C = I[name];
  if (!C) return null;
  /* ⚠️ strokeWidth 1.6 — Environment-ийн 1.5–1.75 муж; жижиг хэмжээнд (14px) зураас бөөгнөрөхгүй */
  return <C size={size} strokeWidth={1.6} aria-hidden />;
}
