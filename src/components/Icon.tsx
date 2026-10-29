/** Портал даяар хэрэглэх дүрсүүд — lucide-react (24×24, stroke) */

import {
  BookOpen, Box, Briefcase, Building2, Bus, CalendarCheck, CalendarDays, Calculator, Car, ChartColumn, Coins,
  Crosshair, Droplet, FileChartColumn, FilePen, FileText, Flame, Frame, HardHat, Info, Layers, LayoutGrid,
  LayoutPanelLeft, Link, ListChecks, MapPin, Moon, Network, Pentagon, Plus, RadioTower, RotateCcw, Route,
  ShieldCheck, Stamp, Sun, Trash2, Users, Waves, Workflow, Zap,
  type LucideIcon,
} from 'lucide-react';

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
  return <C size={size} strokeWidth={1.6} aria-hidden />;
}
