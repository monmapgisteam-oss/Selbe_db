import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DAY, type PlanRow } from '@/lib/plan';
import { msToDay } from '@/modules/sheet/bagtsSheet';
import { PL_OVER, PL_ROW, ZOOM, type Zoom } from './types';
import { todayUtc } from './util';

/**
 * ХУАНЛИЙН ГЕОМЕТР — «өнөөдөр» · хүрээ · хоног↔px · цонхлолт · толгойн шошго
 * (2026-09-30: `Huvaari.tsx`-ээс механикаар салгав; логик · тайлбар ХЭВЭЭР).
 *
 * ⚠️ Оролт: ноорогтой `plan` (хүрээ түүнээс), `drag` (чирэлтийн үед хүрээ тогтоно),
 *    `zoom`, харагдах мөрүүд `visible`, сонгосон мөр `sel`. Гаралт нь Gantt-ын
 *    зурагдалт ба чирэлтийн хөдөлгүүрт хэрэгтэй бүх хэмжээ.
 */
export function useCalendar<T extends { oid: number }>({ plan, drag, zoom, visible, sel, jumpedRef }: {
  plan: readonly PlanRow[];
  drag: boolean;
  zoom: Zoom;
  /**
   * ⚠️ 2026-10-04: ерөнхий (`T`) — «Бүх блок» горимд эх мөр + блокийн дэд мөрийн хавтгай
   * жагсаалт (`allBlocks.DispRow`) ЭНЭ цонхлолтоор явна. `oid` нь эх мөрийнх; эх мөр нь
   * дэд мөрөөсөө өмнө тул `sel`-ийн хайлт эх мөрийг олно. Мөр бүр `PL_ROW` өндөртэй.
   */
  visible: readonly T[];
  sel: number | null;
  /** Эхний «өнөөдөр» рүү гүйлгэлт хийгдсэн үү — эцгийн `[pkg]` эффект тэглэдэг тул эцэгт зарлагдана */
  jumpedRef: React.RefObject<boolean>;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /* ⚠️ ЛОКАЛ өдөр (2026-09-17): UTC-ээр авбал УБ-д 00:00–08:00 хооронд «өнөөдөр»
     өчигдөр болж, хоцрогдлын төлөв ба өнөөдрийн шугам нэг хоног хоцордог байв.
     Хуанлийн өдрүүд өөрсдөө UTC шөнө дундаар түлхүүрлэгддэг тул ижил хэлбэрээр.
     ⚠️ 2026-09-25: `useMemo([])` байсан тул шөнө дунд өнгөрсөн нээлттэй хуудас
     «өнөөдөр»-ийг хуучин өдрөөр үлдээдэг байв — дараагийн шөнө дунд таймераар шинэчилнэ. */
  const [now, setNow] = useState(todayUtc);
  useEffect(() => {
    const d = new Date();
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const t = window.setTimeout(() => setNow(todayUtc()), Math.max(1000, next - d.getTime() + 1000));
    return () => window.clearTimeout(t);
  }, [now]);
  /* ── ХУАНЛИЙН ХҮРЭЭ — доод тал нь 365 хоног, хоёр талдаа СУЛ ЗАЙТАЙ ── */
  const range = useMemo(() => {
    /* ⚠️ 2026-10-01: давталтаар — `Math.min(...all)` нь ~64k аргумент дамжуулж
       Safari дээр RangeError өгөх эрсдэлтэй байв. Зурвасгүй бол `now` (хуучин ёс). */
    let lo = now;
    let hi = -Infinity;
    for (const r of plan) for (const sp of r.spans) if (sp) {
      if (sp.start < lo) lo = sp.start;
      if (sp.end < lo) lo = sp.end;
      if (sp.start > hi) hi = sp.start;
      if (sp.end > hi) hi = sp.end;
    }
    if (hi === -Infinity) hi = now;
    /**
     * ⚠️ СУЛ ЗАЙ (2026-09-02, хэрэглэгч). Урьд нь `from`/`to` нь өгөгдлийн ЯГ
     * захууд байв: хамгийн сүүлийн зурвас хуанлийн баруун ирмэгт наалдаж,
     * түүнийг цааш чирэх, хугацааг нь сунгах, шинэ ажлыг хойшлуулах ЗАЙ огт
     * үлддэггүй байлаа. Одоо урд нь 1 сар, ард нь 3 сар нэмнэ.
     *
     * ⚠️ Сар бүрээр тэгшилнэ: `Date.UTC` нь сарын халилтыг өөрөө зөв бодно
     * (12-р сар + 4 → дараа жилийн 4-р сар). Ард талын `0` дахь өдөр нь
     * «өмнөх сарын сүүлчийн өдөр» тул сарын багана бүтнээрээ дуусна.
     */
    const d = new Date(lo);
    const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
    const e = new Date(hi);
    const padded = Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 4, 0);
    /* ⚠️ Хамгийн багадаа 365 хоног, шаардлагатай бол дараагийн жил рүү */
    const to = Math.max(padded, from + 364 * DAY);
    return { from, to };
  }, [plan, now]);
  /* ⚠️ ЧИРЭЛТИЙН ҮЕД хүрээг ТОГТООНО (2026-09-17): `range` нь ноорогтой `plan`-аас
     бодогддог тул зурвасыг `lo`-оос өмнө татмагц `from` бүтэн сараар эрт болж,
     чирэлтийн `anchor` (ИНДЕКС) нэг сараар зөрж муж сар сараар ухардаг байв. */
  const rangeRef = useRef(range);
  useEffect(() => { if (!drag) rangeRef.current = range; }, [drag, range]);
  const { from, to } = drag ? rangeRef.current : range;
  const px = ZOOM[zoom];
  /* ⚠️ `from` ӨӨРЧЛӨГДӨХӨД ХАРАГДАЦ ҮСРЭХГҮЙ (2026-10-01): чирэлт/popup хамгийн
     эрт ажлыг өмнөх сар руу зөөхөд `from` сараар эрт болж бүх зурвас баруун тийш
     шилжиж, дэлгэц ~1 сар «үсэрдэг» байв. Зөрүүг `scrollLeft`-д нөхнө.
     ⚠️ `useLayoutEffect` — будахаас ӨМНӨ, нэг кадр ч үсрэлт харагдахгүй.
     ⚠️ Томруулалт (`px`) солигдоход нөхөхгүй — зөвхөн `from`-ийн шилжилт. */
  const fromRef = useRef(from);
  useLayoutEffect(() => {
    const old = fromRef.current;
    fromRef.current = from;
    const el = scrollRef.current;
    if (old === from || !el) return;
    el.scrollLeft = Math.max(0, el.scrollLeft + Math.round(((old - from) / DAY) * px));
  }, [from, px]);
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

  /* ⚠️ Эхэнд ӨНӨӨДӨР рүү гүйлгэнэ — 365 хоногийн эхэнд тултал өнгөрсөн
     жилийн сарууд харагдаж, «хоосон хуанли» гэж уншигдана. */
  useEffect(() => {
    if (jumpedRef.current || !scrollRef.current || !visible.length) return;
    jumpedRef.current = true;
    scrollRef.current.scrollLeft = Math.max(0, xOf(now) - 120);
  }, [now, xOf, visible.length, jumpedRef]);

  /* ── ЦОНХЛОЛТ (виртуалчлал) ── */
  const [win, setWin] = useState({ from: 0, to: 60 });
  const recalcWin = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    /* ⚠️ Эхний `PL_ROW` нь НААЛДМАЛ толгой (`gSideHead`/`plHead`) — тэр нь
       урсгалд байдаг тул мөр 0-ийн эхлэл нь `PL_ROW` дээр байна. */
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
    });
  }, [recalcWin]);
  useEffect(() => () => { if (winTick.current) cancelAnimationFrame(winTick.current); }, []);
  /* Мөр/шүүлт/эвхэлт солигдоход цонхыг шинэчилнэ */
  useEffect(() => { recalcWin(); }, [visible.length, recalcWin]);

  /**
   * ⚠️ ЗАСВАРЛАЖ буй мөр цонхны ГАДНА үлдэж болохгүй: чирэлт нь мөрийн DOM
   * дээрх pointer capture-д тулгуурладаг тул зурагдахаа больвол `pointermove`
   * тасарч, чирэлт дундуураа «өлгөгдөнө». Тиймээс сонгосон/чирж буй мөрийг
   * цонхонд хүчээр багтаана.
   */
  const selVis = useMemo(
    () => (sel == null ? -1 : visible.findIndex((r) => r.oid === sel)),
    [visible, sel],
  );
  const winFrom = selVis >= 0 ? Math.min(win.from, selVis) : win.from;
  const winTo = selVis >= 0 ? Math.max(win.to, selVis + 1) : win.to;
  const slice = useMemo(
    () => visible.slice(winFrom, winTo).map((r, k) => ({ r, k: winFrom + k })),
    [visible, winFrom, winTo],
  );
  /* ── Хуанлийн шошго ── */
  /* ⚠️ 2026-10-04 (рендерийн гүйцэтгэл): `from`·`total`·`zoom`·`px`-д MEMO. Урьд нь зурагдалт
     БҮРД (босоо гүйлгээний цонх солигдох, мөр сонгох, чирэлтийн кадр) ~1,000 хоногийг `Date`-ээр
     гүйж шинэ массив үүсгэдэг тул толгойн ~200 шошго ба торын зураасыг React дахин тулгадаг байв.
     Тооцоо ЯГ ИЖИЛ — зөвхөн ижил оролтод дахин бодохгүй. */
  const { ticks, months } = useMemo(() => calTicks(from, total, zoom, px), [from, total, zoom, px]);

  return {
    now, from, to, px, total, W, xOf, dayAt, msAt,
    trackRef, scrollRef, onScroll, winFrom, winTo, slice, ticks, months,
  };
}

/** Хуанлийн толгойн сар · хоногийн шошго — `useCalendar`-аас (2026-10-04, memo-д зориулж салгав; логик ХЭВЭЭР) */
function calTicks(from: number, total: number, zoom: Zoom, px: number) {
  const ticks: { at: number; lab: string; big: boolean }[] = [];
  const months: { at: number; lab: string }[] = [];
  for (let k = 0; k < total; k++) {
    const ms = from + k * DAY;
    const d = new Date(ms);
    const isFirst = d.getUTCDate() === 1;
    if (isFirst) months.push({ at: ms, lab: msToDay(ms).slice(0, 7) });
    /* ⚠️ Ганц тоо («21», «28») нь ямар сарынх нь тодорхойгүй. Сарын нэр
       ДЭЭД мөрөнд тусдаа, хоногийн шошго нь «сар-өдөр» хэлбэрээр доор. */
    if (zoom === 'day') ticks.push({ at: ms, lab: String(d.getUTCDate()), big: isFirst });
    else if (zoom === 'week') {
      if (d.getUTCDay() === 1 || isFirst) ticks.push({ at: ms, lab: msToDay(ms).slice(5), big: isFirst });
    } else if (d.getUTCDay() === 1 || isFirst) ticks.push({ at: ms, lab: '', big: isFirst });
  }
  /**
   * ⚠️ ОЙРХОН ШОШГЫГ ХООСЛОНО. Сарын 1 ба долоо хоногийн эхлэл 1–2 хоногийн
   * зайд таарвал «08-31» ба «09-01» хоёр бие бие рүүгээ орж, аль аль нь
   * уншигдахгүй болно (зурвас нарийсах тусам байнга тохиолдоно). Зураас нь
   * үлдэнэ — зөвхөн ТЕКСТИЙГ нь авна.
   */
  {
    const MIN = 40;
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
