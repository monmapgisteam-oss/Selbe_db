/**
 * ХУВААРЬ — төрөл ба тогтмолууд (2026-09-30: `Huvaari.tsx`-ээс механикаар салгав).
 */

import type { Span } from '@/lib/plan';
import type { MonthRes } from '@/lib/huvaariObyem';
import type { PlanPayloadKind } from '@/lib/huvaariBatlah';

/**
 * ХУВААРИЙН ТӨРӨЛ — аль огноог засаж байна вэ (2026-09-11).
 */
export type PlanKind = PlanPayloadKind;

/** Нийтлээгүй засвар: `oid` → блок бүрийн шинэ хуваарь */
export type Draft = Map<number, (Span | null)[]>;
/**
 * БОДИТ ОГНООНЫ НООРОГ: `oid` → блок бүрийн { эхэлсэн[], дууссан[] } (2026-09-23).
 */
export type ADraft = Map<number, { start: (number | null)[]; end: (number | null)[] }>;
/** НӨӨЦИЙН НООРОГ: `oid` → { хүн хүч, машин механизм } (2026-09-23). Мөрийн скаляр. */
export type ResDraft = Map<number, { hun: number | null; mashin: number | null }>;

/**
 * Хүснэгтийн мөрийн өндөр (px).
 */
export const PL_ROW = 30;

export const MAX_DAYS = 3650;

/**
 * ЦОНХЛОЛТЫН НӨӨЦ МӨР — харагдах хүрээний дээр/доор нэмж зурах тоо.
 */
export const PL_OVER = 8;

/**
 * Хоног тутмын өргөн (px) — томруулалт бүрд.
 */
export const ZOOM: Record<'day' | 'week' | 'month' | 'year', number> = { day: 20, week: 7, month: 2.6, year: 0.7 };
export type Zoom = keyof typeof ZOOM;

export type DragMode = 'new' | 'move' | 'l' | 'r';
export type Drag = {
  oid: number; mode: DragMode; anchor: number; orig: Span | null;
  /** чирэлтээс өмнөх сарын задаргаа — буцаахад (2026-09-17) */
  origMonths?: Map<string, number> | null;
  /** чирэлтээс өмнөх сарын НӨӨЦ (2026-09-24) — `origMonths`-тай зэрэгцээ */
  origRes?: Map<string, MonthRes> | null;
  snap?: Map<number, Span | null> | null;
  obSnap?: Map<string, Map<string, number>> | null;
  obResSnap?: Map<string, Map<string, MonthRes>> | null;
};

/**
 * БАТЛАГЧИЙН ХЯНАЛТЫН ГОРИМ (2026-09-25, хэрэглэгч: «илгээсний дараа батлах
 * хэсэг тухайн багцын хуваарийг бүхэлд нь, яг Хуваарь хэсэгт харж байгаа шиг
 * харж батална; гүйцэтгэлтэй адил алийг нь зөвшөөрсөн, алийг нь зөвшөөрөөгүйг
 * гүйцэтгэгч харна»).
 */
export type HuvaariReview = {
  pkgKey: string;
  oid: number;
  kind: PlanKind;
  /** Шийдвэргүй хаах */
  onClose: () => void;
  /**
   * Шийдвэр (батлах/буцаах) хадгалагдсаны дараа — дараалал дахин уншина.
   */
  onDone: (r: { msg: string; isErr: boolean }) => void;
};
