import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DAY, type PlanRow } from '@/lib/plan';
import { msToDay } from '@/modules/sheet/bagtsSheet';
import { PL_OVER, PL_ROW, ZOOM, type Zoom } from './types';
import { todayUtc } from './util';

const SANE_LO = Date.UTC(2000, 0, 1);
const SANE_HI = Date.UTC(2100, 0, 1);

/**
 * «ӨНӨӨДӨР» (UTC шөнө дундаар түлхүүрлэсэн ЛОКАЛ өдөр) — шөнө дунд бүрд шинэчлэгдэнэ.
 */
export function useToday(): number {
  const [now, setNow] = useState(todayUtc);
  useEffect(() => {
    const d = new Date();
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const t = window.setTimeout(() => setNow(todayUtc()), Math.max(1000, next - d.getTime() + 1000));
    return () => window.clearTimeout(t);
  }, [now]);
  return now;
}

/**
 * ХУАНЛИЙН ГЕОМЕТР — «өнөөдөр» · хүрээ · хоног↔px · цонхлолт · толгойн шошго
 * (2026-09-30: `Huvaari.tsx`-ээс механикаар салгав; логик · тайлбар ХЭВЭЭР).
 */
export function useCalendar<T extends { oid: number }>({ plan, drag, zoom, visible, sel, pin, jumpedRef, now }: {
  plan: readonly PlanRow[];
  now: number;
  drag: boolean;
  pin: boolean;
  zoom: Zoom;
  visible: readonly T[];
  sel: number | null;
  /** Эхний «өнөөдөр» рүү гүйлгэлт хийгдсэн үү — эцгийн `[pkg]` эффект тэглэдэг тул эцэгт зарлагдана */
  jumpedRef: React.RefObject<boolean>;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /* ── ХУАНЛИЙН ХҮРЭЭ — доод тал нь 365 хоног, хоёр талдаа СУЛ ЗАЙТАЙ ── */
  const range = useMemo(() => {
    let lo = now;
    let hi = -Infinity;
    const take = (ms: number) => {
      if (!Number.isFinite(ms) || ms < SANE_LO || ms > SANE_HI) return;
      if (ms < lo) lo = ms;
      if (ms > hi) hi = ms;
    };
    for (const r of plan) for (const sp of r.spans) if (sp) { take(sp.start); take(sp.end); }
    if (hi === -Infinity) hi = now;
    const d = new Date(lo);
    const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
    const e = new Date(hi);
    const padded = Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 4, 0);
    const to = Math.max(padded, from + 364 * DAY);
    return { from, to };
  }, [plan, now]);
  const rangeRef = useRef(range);
  useEffect(() => { if (!drag) rangeRef.current = range; }, [drag, range]);
  const { from, to } = drag ? rangeRef.current : range;
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    if (zoom !== 'year') return;
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const side = el.firstElementChild as HTMLElement | null;
      setAvail(Math.max(0, el.clientWidth - (side?.offsetWidth ?? 0) - 2));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [zoom, plan.length]);
  const days = Math.round((to - from) / DAY) + 1;
  const px = zoom === 'year' && avail > 0 ? Math.max(ZOOM.year, avail / days) : ZOOM[zoom];
  const fromRef = useRef(from);
  useLayoutEffect(() => {
    const old = fromRef.current;
    fromRef.current = from;
    const el = scrollRef.current;
    if (old === from || !el) return;
    el.scrollLeft = Math.max(0, el.scrollLeft + Math.round(((old - from) / DAY) * px));
  }, [from, px]);
  const centerMs = useRef<number | null>(null);
  const pxRef = useRef(px);
  const noteCenter = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    centerMs.current = fromRef.current + ((el.scrollLeft + calView(el) / 2) / pxRef.current) * DAY;
  }, []);
  useLayoutEffect(() => {
    const old = pxRef.current;
    pxRef.current = px;
    const el = scrollRef.current;
    if (old === px || !el) return;
    /* Гүйлгээ хараахан бүртгэгдээгүй бол хуучин `px`-ээр одоогийн байрлалаас (хавчигдсан байж болох ч ойролцоо) */
    const c = centerMs.current ?? from + ((el.scrollLeft + calView(el) / 2) / old) * DAY;
    el.scrollLeft = Math.max(0, Math.round(((c - from) / DAY) * px - calView(el) / 2));
  }, [px, from]);
  const total = Math.round((to - from) / DAY) + 1;
  const W = Math.round(total * px);
  const xOf = useCallback((ms: number) => Math.round(((ms - from) / DAY) * px), [from, px]);
  const dayAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const k = Math.floor((clientX - el.getBoundingClientRect().left) / px);
    return Math.min(total - 1, Math.max(0, k));
  };
  const msAt = (k: number) => from + k * DAY;

  useEffect(() => {
    if (jumpedRef.current || !scrollRef.current || !visible.length) return;
    jumpedRef.current = true;
    scrollRef.current.scrollLeft = Math.max(0, xOf(now) - 120);
  });

  /* ── ЦОНХЛОЛТ (виртуалчлал) ── */
  const [win, setWin] = useState({ from: 0, to: 60 });
  const recalcWin = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = Math.max(0, el.scrollTop - PL_ROW);
    const a = Math.max(0, Math.floor(top / PL_ROW) - PL_OVER);
    const b = Math.ceil((top + el.clientHeight) / PL_ROW) + PL_OVER;
    setWin((w) => (w.from === a && w.to === b ? w : { from: a, to: b }));
  }, []);
  /* Гүйлгэх бүрд биш, кадр тутам НЭГ удаа — гүйлгээ жигд байна. */
  const winTick = useRef(0);
  const onScroll = useCallback(() => {
    if (winTick.current) return;
    winTick.current = requestAnimationFrame(() => {
      winTick.current = 0;
      recalcWin();
      noteCenter();
    });
  }, [recalcWin, noteCenter]);
  const goToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, Math.round(((now - from) / DAY) * px - calView(el) / 2));
  }, [now, from, px]);
  useEffect(() => () => { if (winTick.current) cancelAnimationFrame(winTick.current); }, []);
  /* Мөр/шүүлт/эвхэлт солигдоход цонхыг шинэчилнэ */
  useEffect(() => {
    recalcWin();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => recalcWin());
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible.length, recalcWin]);

  const selVis = useMemo(
    () => (!pin || sel == null ? -1 : visible.findIndex((r) => r.oid === sel)),
    [visible, sel, pin],
  );
  const winFrom = selVis >= 0 ? Math.min(win.from, selVis) : win.from;
  const winTo = selVis >= 0 ? Math.max(win.to, selVis + 1) : win.to;
  const slice = useMemo(
    () => visible.slice(winFrom, winTo).map((r, k) => ({ r, k: winFrom + k })),
    [visible, winFrom, winTo],
  );
  /* ── Хуанлийн шошго ── */
  const { ticks, months } = useMemo(() => calTicks(from, total, zoom, px), [from, total, zoom, px]);

  return {
    now, from, to, px, total, W, xOf, dayAt, msAt,
    trackRef, scrollRef, onScroll, winFrom, winTo, slice, ticks, months, goToday,
  };
}

function calView(el: HTMLDivElement): number {
  return el.clientWidth - ((el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0);
}

/** Хуанлийн толгойн сар · хоногийн шошго — `useCalendar`-аас (2026-10-04, memo-д зориулж салгав; логик ХЭВЭЭР) */
function calTicks(from: number, total: number, zoom: Zoom, px: number) {
  const ticks: { at: number; lab: string; big: boolean }[] = [];
  const months: { at: number; lab: string }[] = [];
  for (let k = 0; k < total; k++) {
    const ms = from + k * DAY;
    const d = new Date(ms);
    const isFirst = d.getUTCDate() === 1;
    if (zoom === 'year') {
      if (isFirst && (d.getUTCMonth() === 0 || k === 0)) months.push({ at: ms, lab: String(d.getUTCFullYear()) });
      if (isFirst) ticks.push({ at: ms, lab: msToDay(ms).slice(5, 7), big: d.getUTCMonth() === 0 });
      continue;
    }
    if (isFirst) months.push({ at: ms, lab: msToDay(ms).slice(0, 7) });
    if (zoom === 'day') ticks.push({ at: ms, lab: String(d.getUTCDate()), big: isFirst });
    else if (zoom === 'week') {
      if (d.getUTCDay() === 1 || isFirst) ticks.push({ at: ms, lab: msToDay(ms).slice(5), big: isFirst });
    } else if (d.getUTCDay() === 1 || isFirst) ticks.push({ at: ms, lab: '', big: isFirst });
  }
  {
    const MIN = zoom === 'year' ? 18 : 40;
    let lastLab = -Infinity;
    for (const tk of ticks) {
      const x = ((tk.at - from) / DAY) * px;
      if (!tk.lab) continue;
      if (x - lastLab < MIN && !tk.big) tk.lab = '';
      else lastLab = x;
    }
  }
  return { ticks, months };
}
