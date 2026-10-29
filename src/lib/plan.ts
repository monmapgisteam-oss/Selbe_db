/**
 * ХУВААРИЙН ЗАГВАР — «Гүйцэтгэл бөглөх» хуудасны эхлэх/дуусах огноог
 * ТӨЛӨВЛӨХ цэвэр логик. React-гүй, сүлжээгүй — тиймээс тестлэгдэнэ.
 *
 *     Багц 2·12F  1348/1557 ажил хуваарьтай  86.6%
 *     Багц 3.2    1165/1374                  84.8%
 *     Багц 1·9F     70/1266                   5.5%
 *     Багц 4-1      22/1385                   1.6%
 *     Багц 3.3      11/1173                   0.9%
 *
 * Шалтгаан нь хүний залхуурал БИШ, БҮТЭЦ: одоогийн хүснэгтэд нэг ажлыг 12–22
 * блокт хуваарилахын тулд 24–44 удаа календар нээж дарна. Тэвчихийн аргагүй.
 */

/** Нэг хоног (мс) — огноо нь UTC шөнө дундаар хадгалагддаг */
export const DAY = 86_400_000;

/** Нэг блокийн нэг ажлын хуваарь. `start`/`end` нь UTC шөнө дунд, мс. */
export type Span = { start: number; end: number };

/** Хуваарийн харагдацын нэг мөр — `SheetRow`-оос гаргасан */
export type PlanRow = {
  /** `rows` массив дахь ИНДЕКС — эх мөртэй холбогдоно */
  i: number;
  oid: number;
  no: string;
  /** Ажлын код — жаазан дотор давтагдахгүй 1…N. Бөглөөгүй бол `null`. */
  des: number | null;
  /**
   * УЯЛДАА — энэ ажлын урьдчилагчид (`Hamaaral` талбараас задалсан).
   */
  deps: import('./deps').Dep[];
  work: string;
  depth: number;
  group: boolean;
  /**
   * Мөрийн НИЙТ Обьём (`SheetRow.vol`) — сарын задаргааны нийлбэр ЭНЭ тоотой
   * тэнцэх ёстой (2026-09-06-ны шаардлага).
   */
  vol: number | null;
  /** Блок бүрийн хуваарь; `null` = тэр блокт хуваарьгүй */
  spans: (Span | null)[];
  /**
   * Блок бүрийн БОДИТ гүйцэтгэл 0–1 (сонголтоор).
   */
  act?: (number | null)[];
  /**
   * БОДИТ эхэлсэн / дууссан огноо — блок бүрд, ms epoch (2026-09-23).
   */
  aStart?: (number | null)[];
  aEnd?: (number | null)[];
  /** Хүн хүч · машин механизм — мөрийн нөөц (2026-09-23). `null` = бөглөөгүй. */
  hun?: number | null;
  mashin?: number | null;
};

/* ══════════════════ Хоног ══════════════════ */

/**
 * Хугацааны урт — ХУАНЛИЙН хоногоор, хоёр захыг ОРУУЛААД.
 */
export const spanDays = (s: Span): number =>
  Math.round((s.end - s.start) / DAY) + 1;

/** Эхлэл ба үргэлжлэх хугацаанаас дуусах огноо (мөн хоёр захыг оруулаад) */
export const endOf = (start: number, days: number): number =>
  start + Math.max(0, days - 1) * DAY;

/**
 * МУЖИЙН ӨНГӨРСӨН ХУВЬ (0–1) — төлөвлөгөөт хувийн ГАНЦ томъёо (2026-10-01,
 * хэрэглэгчийн шийдвэр «бүгдийг зас»: сар доторх хувийг ажлын жинхэнэ өдрүүдээр).
 */
export function spanFrac(s: Span, asOf: number): number {
  const t = Math.floor(asOf / DAY) * DAY + DAY;
  const eEx = s.end + DAY;
  if (eEx <= s.start) return t > s.start ? 1 : 0;
  if (t <= s.start) return 0;
  if (t >= eEx) return 1;
  return (t - s.start) / (eEx - s.start);
}

/* ══════════════════ ГҮЙЦЭТГЭЛИЙН ТӨЛӨВ ══════════════════ */

/**
 * Нэг блокийн нэг ажлын ТӨЛӨВ — чартын өнгөүүн дээр тогтоно.
 */
export type Status = 'done' | 'run' | 'todo' | 'late' | 'none';

export function statusOf(s: Span, act: number | null | undefined, now: number): Status {
  if (act == null) return 'none';
  if (act >= 1) return 'done';
  /* Хугацаа нь ДУУССАН атлаа дуусаагүй — хоцрогдол */
  if (s.end < now) return 'late';
  if (act > 0) return 'run';
  return 'todo';
}

/* ══════════════════ Хамралт ══════════════════ */

export type Coverage = {
  /** Ажлын (навч) мөрийн тоо */
  tasks: number;
  /** Ядаж нэг блокт хуваарьтай ажил */
  planned: number;
  /** Ажил × блокийн нийт нүд */
  cells: number;
  /** Хуваарьтай нүд */
  filled: number;
  /** Хамгийн эрт эхлэх / хамгийн сүүл дуусах (хуваарьгүй бол `null`) */
  from: number | null;
  to: number | null;
  /**
   * ЯЛГААТАЙ хуваарийн тоо — «70 ажил ердөө 4 өөр хуваарьтай».
   */
  patterns: number;
  /**
   * ОГНОО УРВУУ (дуусах < эхлэх) блоктой АЖЛЫН тоо (2026-10-04). Ийм муж төлөвлөгөөт хувь ба
   * муруйд ХУВААРЬГҮЙ гэж тооцогдоно (`bagtsSheet.planAt`) — «Хуваарь»-ийн toolbar анхааруулна.
   */
  reversed: number;
};

export function coverageOf(rows: readonly PlanRow[]): Coverage {
  const n = rows[0]?.spans.length ?? 0;
  let tasks = 0, planned = 0, filled = 0, reversed = 0;
  let from: number | null = null;
  let to: number | null = null;
  const sig = new Set<string>();
  for (const r of rows) {
    if (r.group) continue;
    tasks += 1;
    let any = false;
    if (r.spans.some((s) => s != null && s.end < s.start)) reversed += 1;
    for (const s of r.spans) {
      if (!s) continue;
      if (s.end < s.start) continue;
      any = true;
      filled += 1;
      if (from == null || s.start < from) from = s.start;
      if (to == null || s.end > to) to = s.end;
    }
    if (any) {
      planned += 1;
      /* урвуу муж хэв шинжид ч хуваарьгүй ('-') — дээрх */
      sig.add(r.spans.map((s) => (s && s.end >= s.start ? `${s.start}:${s.end}` : '-')).join('|'));
    }
  }
  return { tasks, planned, cells: tasks * n, filled, from, to, patterns: sig.size, reversed };
}
