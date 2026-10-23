/** Портал даяар хэрэглэх дүрсүүд — lucide-react (24×24, stroke) */

import {
  BookOpen, Building2, Bus, CalendarDays, Calculator, Car, ChartColumn, Crosshair, Droplet, FilePen, FileText,
  Flame, Frame, Layers, LayoutGrid, MapPin, Moon, Network, Pentagon, Plus, RadioTower, RotateCcw, Route,
  ShieldCheck, Sun, Trash2, Users, Waves, Zap,
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
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const C = I[name];
  if (!C) return null;
  /* ⚠️ strokeWidth 1.6 — Environment-ийн 1.5–1.75 муж; жижиг хэмжээнд (14px) зураас бөөгнөрөхгүй */
  return <C size={size} strokeWidth={1.6} aria-hidden />;
}
