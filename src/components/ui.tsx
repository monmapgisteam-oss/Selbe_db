'use client';

import React, { Fragment, isValidElement, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { t as tr } from '@/lib/i18nCore';
import { num, pct } from '@/lib/format';
import {
  CHART, DONUT_SIZES, RING_SIZES, donutGeom, lineSegments, areaPath, monotonePath,
  roundPctsTo100,
  type DonutSize, type RingSize,
} from '@/lib/chartStyle';
import type { Async } from '@/lib/useAsync';
import { Icon } from './Icon';
import { chunkErrorText, isChunkLoadError } from './ErrorBoundary';
import s from './ui.module.css';

/* ⚠️ Гол дүрэм (envhub → 2026-10-23: Environment): чартын анхдагч өнгө нь МОДУЛИЙН биш,
   НЭГ өгөгдлийн өнгө (--data = moss). Дуудагч өнгө өгвөл түүнийг л хүндэтгэнэ (газрын
   зурагтай уялдсан өнгөнүүд хэвээр ажиллана). `?? var(--data)` fallback-ийг хасаж
   болохгүй — --tone удамшдаг тул дотор давхарласан дуудлагад алдаа гарна.
   ⚠️ 2026-10-23: Environment — өнгөгүй ангиллууд (Donut/Stack) `cat(i)` слот БИШ, НЭГ
   `--data`-ийн тунгалгийн шат (.92 − i×.22, доод .24) — Environment `PieChart`-ын дүрэм. */
const tone = (c?: string) => ({ '--tone': c ?? 'var(--data)' }) as CSSProperties;

/**
 * НЭГ ӨНГИЙН ТУНГАЛГИЙН ШАТ — өнгөгүй ангилал `i`-ийн тунгалаг (Environment `PieChart`).
 * ⚠️ 2026-10-23: Environment — `cat(i)` слотын оронд. Дуудагч өнгө өгсөн бол (газрын
 *    зурагтай уялдсан) тэр өнгө .88-аар — `explicitOp`.
 */
const rampOp = (i: number): number => Math.max(Math.round((0.92 - i * 0.22) * 100) / 100, 0.24);
const explicitOp = 0.88;

/**
 * Тоо БИШ утгыг 0 болгоно.
 *
 * ⚠️ 2026-08-18: Яагаад ЗААВАЛ примитив дотор. ArcGIS-ийн олон талбар нь ТЕКСТ
 * төрөлтэй бөгөөд «80%» гэх мэт тэмдэгт агуулдаг; дуудагч түүнийг `Number()`-ээр
 * хөрвүүлэхэд `NaN` гарна. NaN нь `Math.max`-аар дамжихад дээд хязгаар нь ч NaN
 * болж, `width: NaN%` гэсэн ХҮЧИНГҮЙ CSS үүснэ. Browser хүчингүй зарлалыг ҮЛ
 * ХЭРЭГСДЭГ тул `.barFill` (display:block) нь эцгийнхээ 100%-ийг эзэлж, БҮХ
 * багана ДҮҮРЭН зурагдана — өөрөөр хэлбэл өгөгдөл эвдэрсэн үед график нь
 * «бүгд 100%» гэсэн ХУДАЛ уншилт өгдөг байв. Дуудагч бүрийг найдвартай
 * болгохын оронд примитив өөрөө ийм утгыг 0 гэж үзнэ: багана нь хоосон
 * харагдаж, алдаа нүдэнд шууд илэрнэ.
 */
/* ⚠️ 2026-10-09: `null` (мэдээлэлгүй) ч хүлээн авна — зурвасын УРТАД 0 (зураасгүй), утга нь «—» */
const fin = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? v : 0);

/**
 * `display`-гүй ТҮҮХИЙ утгын бичвэр — `num()`, бүхэл бол 0, бутархай бол 1 орон; null → «—».
 * ⚠️ 2026-10-09 (графикийн жигдрэл): урьд нь `Bars`/`Stack`/`Donut`/`Series` түүхий
 *    тоог шууд бичдэг байв («20162536361», «12.345678»). `num(v)` ганцаараа 12.5-ыг
 *    «13» болгох тул бутархайд 1 орон үлдээнэ.
 */
const autoNum = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? '—' : num(v, Number.isInteger(v) ? 0 : 1);

/**
 * Элементийн ОДООГИЙН өргөн (px). Хэмжигдэх хүртэл 0.
 *
 * ⚠️ 2026-08-20: Тэнхлэгийн шошгыг ХЭД бичих вэ гэдэг нь ЗӨВХӨН өргөнөөс
 * шалтгаална. Тогтмол тоо нь хоёр талдаа буруу байв: 272px картад «2026-07-20»
 * гэсэн 6 огноо багтахгүй давхарлана, 800px өргөнтэй IoT-ийн том чартад 6 нь
 * хэт цөөн. Иймд ТООГ бус, ЗАЙГ шалгуур болгоно.
 */
function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [w, setW] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  /**
   * ⚠️ 2026-09-25: `useRef` + `useEffect(…, [])` БАЙСАН. Эффект нь ЗӨВХӨН
   *    mount-д нэг удаа ажилладаг тул анхны зурагт элемент байгаагүй бол
   *    (жиш. `Trend` эхлээд `<Empty>` буцаасан — BuildingPanel-ийн
   *    ProgressTrend-д нэг сарын багц сонгоход) ажиглагч ХЭЗЭЭ Ч холбогдохгүй,
   *    өргөн 0 хэвээр үлдэж тэнхлэгт зөвхөн хоёр ирмэгийн шошго гардаг байв.
   *    Callback ref нь элемент ГАРЧ ИРЭХ бүрд (null → el) дуудагдана.
   */
  const ref = useCallback((el: T | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    // ⚠️ Эхний утгыг ШУУД тавина: ResizeObserver-ийн эхний дуудлага дараагийн
    //    frame-д ирдэг тул «хэмжээгүй» (хамгийн цөөн шошготой) хувилбар нэг
    //    кадр анивчиж харагдана.
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    roRef.current = ro;
  }, []);
  return [ref, w];
}

/**
 * ReactNode → энгийн текст (aria-label, tooltip-д).
 *
 * ⚠️ 2026-09-25: `tr()`-ийн орлуулга `String(v)` хийдэг тул JSX утга
 *    «[object Object]» болж дэлгэц уншигчид тэгж уншигддаг байв
 *    (SuitDetail-ийн `center={<span>…га</span>}`).
 */
function nodeText(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number' || typeof n === 'bigint') return String(n);
  if (Array.isArray(n)) return n.map((c: ReactNode) => nodeText(c)).join('');
  if (isValidElement(n)) return nodeText((n.props as { children?: ReactNode }).children);
  return '';
}

/* ── Хулганы тайлбар (tooltip) ─────────────────────────────────────────────
   ⚠️ 2026-10-23: Environment — ЭНЭ ФАЙЛЫН `Bars`/`Stack`/`Series` (багана)/`Donut`/`Meter` нь
   Environment шиг УУГУУЛ `title`-д шилжсэн (`tipTitle`); талбайн диаграмууд (`Trend`, `Series
   line`) цэгийн дэргэдэх `AreaTip`-тэй. `useTip` нь модулиудын өөрийн графикт (Radar · Spark ·
   CEO · IPC · гант …) экспортоор үлдсэн — загвар нь Environment `Tooltip`.

   ⚠️ Яагаад `title=`-г орлуулав:
     • ~1 секунд хүлээдэг — өгөгдөл шалгаж яваа хүнд удаан;
     • ХҮРЭЛТЭЭР (touch) огт гарахгүй — таблетаас үзэгчид юу ч авахгүй;
     • загварыг нь удирдах боломжгүй (системийн хайрцаг, горим дагахгүй);
     • ганц мөр текстээс өөр юу ч багтахгүй (өнгөт тэмдэг, нэгж, тайлбар үгүй).

   ⚠️ Яагаад `position: fixed`:
   Самбарууд нь `.panel { overflow:hidden }`, `.panelBody { overflow-y:auto }`,
   AgentChat-ийн `.chart { overflow-x:auto }` гэсэн ГУРВАН тайрагч эцгийн дотор
   байдаг. `absolute` нь тэднээр тайрагдана. Эдгээр эцгүүдийн аль нь ч
   `transform/filter/contain` эзэмшдэггүй (шалгасан) тул `fixed` нь агуулах
   блок үүсгэхгүй — бүх тайралтаас чөлөөтэй гарна. `body { overflow: hidden }`
   учир гүйлтийн шилжилт тооцох шаардлагагүй, цонхны хэмжээ шууд хүчинтэй.

   ⚠️ `createPortal` ХЭРЭГГҮЙ (төсөлд хаана ч ашиглагдаагүй, ssr:false-тэй
   харилцан үйлчлэл нэмэхээс зайлсхийв). */

/**
 * ЗААГ ЗУРААС — `hint` массивт энэ утгыг тавибал тэр байрлалд зураас гарна.
 *
 * ⚠️ ТУСГАЙ УТГА, ердийн текст БИШ. Задаргааны мөрүүд урт болоход аль нь аль
 * бүлэгт хамаарах нь ялгагдахаа больдог (жиш. «Урьдчилсан төсөвт өртөг»-ийн
 * панелд ГҮЙЦЭТГЭЛ ба ОЛГОЛТ хоёр өөр эх сурвалж). Дуудагч тал бүлэг бүрийн
 * ХООРОНД үүнийг оруулна.
 */
export const TIP_RULE = '—hr—';

/** ⚠️ `hint` нь ОЛОН МӨР байж болно — задаргааг чартын мөрөөс энэ рүү зөөв */
type TipData = {
  x: number; y: number; label: string; value: string;
  color?: string; hint?: string | string[];
};

const TIP_DELAY = 60; // мс — `title`-ийн ~1000-ын оронд
const TIP_OFF = 14; // заагуураас хол зай

/* ⚠️ 2026-10-09: ЭКСПОРТЛОВ — модулиудын өөрийн графикууд (Radar · Spark · ScoreColumns · CEO
   · IPC · гант) `title`-ийн оронд ЯГ ЭНЭ tooltip-ийг хэрэглэнэ (графикийн загварыг жигдлэх). */
export function useTip() {
  const [tip, setTip] = useState<TipData | null>(null);
  /**
   * ⚠️ 2026-08-18: Таймер нь ЗААВАЛ ref — урьд нь `useState` байсан бөгөөд
   * `setTimeout`-ыг state updater-ийн ДОТОР үүсгэдэг байв. React updater-ийг
   * нэгээс олон удаа дуудаж болно (StrictMode-ийн давхар дуудалт, concurrent
   * рендерийн дахин тоглолт) — тэр үед хадгалагдаагүй ӨНЧИН таймер үлдэж,
   * `hide()` цэвэрлэх юмгүй өнгөрдөг. Өнчин таймер хожим асахад tooltip нь
   * заагуур яваад өгсний ДАРАА дэлгэц дээр гарч ЗҮҮГДЭЖ үлддэг байлаа.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  // Компонент салахад унтраалгүй үлдсэн таймер ажиллуулахгүй
  useEffect(() => stop, []);

  const hide = () => {
    stop();
    setTip(null);
  };
  /** Заагуур хөдлөх бүрд байрлалыг шинэчилнэ; анх гарахдаа л хүлээнэ */
  const show = (e: { clientX: number; clientY: number }, d: Omit<TipData, 'x' | 'y'>) => {
    const at = { ...d, x: e.clientX, y: e.clientY };
    setTip((cur) => (cur ? at : cur));
    if (timer.current) return;
    timer.current = setTimeout(() => { timer.current = null; setTip(at); }, TIP_DELAY);
  };
  /** Гар/фокусаар хөтлөгчид — элементийн хүрээнээс байрлалыг авна */
  const showAt = (el: Element | null, d: Omit<TipData, 'x' | 'y'>) => {
    if (!el) return;
    // ⚠️ Хүлээгдэж буй заагуурын таймерыг зогсооно — эс бөгөөс тэр нь хожим
    //    асаад фокусын байрлалыг ХУУЧИН заагуурынхаар дарж бичнэ.
    stop();
    const r = el.getBoundingClientRect();
    setTip({ ...d, x: r.left + r.width / 2, y: r.top });
  };

  /** Тэмдэг бүрд наах хэрэглэгчийн үйлдлүүд */
  const bind = (d: Omit<TipData, 'x' | 'y'>) => ({
    onPointerMove: (e: React.PointerEvent) => show(e, d),
    onPointerLeave: hide,
    // Хүрэлтээр — `title` энд юу ч өгдөггүй байсан
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'touch') showAt(e.currentTarget, d);
    },
    onFocus: (e: React.FocusEvent) => showAt(e.currentTarget, d),
    onBlur: hide,
  });

  return { bind, hide, node: tip ? <Tip {...tip} /> : null };
}

function Tip({ x, y, label, value, color, hint }: TipData) {
  // Цонхны ирмэгээс хальтал эсрэг тал руу эргэнэ (хэмжээг нь мэдэхгүй тул
  // хамгийн өргөн боломжит утгаар бариулна — `max-width` нь 260px)
  /* ⚠️ `typeof window` хамгаалалт (2026-09-16): төсөл нь `output: export` тул
     энэ мөр серверт ажиллах боломж бий. Tooltip нь hover-ийн дараа л зурагддаг
     тул одоогоор хүрэхгүй ч хамгаалалтгүй хэв маяг үлдээхгүй. */
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const flipX = x > vw - 280;
  const flipY = y < 110;
  const c = color ?? 'var(--data)';
  /* ⚠️ 2026-10-23: Environment — утга 17px (`Tooltip`). Гэхдээ 2026-09-04-ний ⚠️ (бүтэн
     мөнгөн дүн цонхыг дүүргэдэг) хэвээр: 14+ тэмдэгттэй утга 13.5px-д үлдэнэ (`tipValLong`). */
  const longVal = value.length >= 14;
  return (
    /* envhub → Environment tooltip бүтэц: tone 10%-иар будсан толгойн зурвас (цэг + нэр),
       дор нь өнгөтэй ТОМ утга, дараа нь бүдэг тайлбар. */
    <div
      role="tooltip"
      className={s.tip}
      style={{
        left: x + (flipX ? -TIP_OFF : TIP_OFF),
        top: y + (flipY ? TIP_OFF : -TIP_OFF),
        transform: `translate(${flipX ? '-100%' : '0'}, ${flipY ? '0' : '-100%'})`,
      }}
    >
      <span className={s.tipHd} style={{ background: `color-mix(in oklab, ${c} 10%, transparent)` }}>
        <i className={s.tipDot} style={{ background: c }} />
        <span className={s.tipName}>{tr(label)}</span>
      </span>
      <span className={s.tipBody}>
        <b className={`${s.tipVal} ${longVal ? s.tipValLong : ''} num`} style={{ color: c }}>{value}</b>
        {/* ⚠️ ОЛОН МӨР — задаргаа нь чартын мөрөнд БИШ энд байх ёстой
            (2026-09-04, хэрэглэгчийн шийдвэр: «чарт өөрөө энгийн, hover
            панел дээр дэлгэрэнгүй задаргаа»). Мөр бүр өөрийн цэгтэй. */}
        {(Array.isArray(hint) ? hint : hint ? [hint] : []).map((h, i) => (
          h === TIP_RULE
            /* ⚠️ Түлхүүр нь ИНДЕКСЭЭР: зураас олон удаа давтагдаж болох тул
               утгыг нь түлхүүр болговол React давхардсан түлхүүр гэж
               гомдоллоно. Жагсаалт нь дахин эрэмбэлэгддэггүй тул аюулгүй. */
            ? <i key={`hr${i}`} className={s.tipRule} aria-hidden />
            : <span key={h} className={s.tipHint}>{h}</span>
        ))}
      </span>
    </div>
  );
}

/**
 * УУГУУЛ `title`-ийн бичвэр — «нэр · утга» + тайлбарын мөрүүд (шинэ мөрөөр).
 * ⚠️ 2026-10-23: Environment — BarChart/RowChart/PieChart/Composition нь ЗӨВХӨН уугуул `title`
 *    хэрэглэдэг. Custom tooltip-ийн бичвэр (нэр, утга, `hint`, «Дарж … шүүнэ») ХЭВЭЭР энд
 *    шилжив; `TIP_RULE` (бүлгийн зааг) нь хоосон мөр болно.
 */
function tipTitle(label: string, value: string, hint?: string | string[]): string {
  const lines = (Array.isArray(hint) ? hint : hint ? [hint] : []).map((h) => (h === TIP_RULE ? '' : h));
  return [`${label} · ${value}`, ...lines].join('\n');
}

/** Талбайн диаграмын бодит хүрээ (viewport px) — hover эхлэхэд хэмжинэ */
type PlotRect = { left: number; top: number; width: number; height: number };
const rectOf = (el: Element | null): PlotRect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/**
 * ТАЛБАЙН ДИАГРАМЫН HOVER САМБАР — Environment `AreaChart`-ын `Tooltip` (`charts.tsx`).
 *
 * ⚠️ 2026-10-23: Environment — заагуурын ДЭРГЭД биш, ЦЭГИЙН ДЭРГЭД: `t` < .22 бол зүүн тийш
 *    түшинэ, > .78 бол баруун, бусад үед голлоно; цэг өндрийн дээд 45%-д бол (оргил) самбар
 *    ДООШ эргэнэ, 10px зайтай. Толгой tone 10% (цэг + нэр, сонгогдсон бол «СОНГОСОН»), бие нь
 *    17px утга (tone) + нэгж, доор нь эзлэх хувь `x.x%` ба өмнөхөөс ▲/▼ өөрчлөлт.
 * ⚠️ `position: fixed` (`useTip`-ийн ⚠️ — самбарын `overflow` тайралтаас гарна): байрлалыг
 *    талбайн хүрээ (`rect`, viewport) + цэгийн хувиас бодно.
 */
function AreaTip({
  rect, t, top, color, label, value, unit, share, delta, rows, hint, selected,
}: {
  rect: PlotRect;
  /** Цэгийн хэвтээ байрлал — 0…1 */
  t: number;
  /** Цэгийн босоо байрлал — талбайн өндрийн % */
  top: number;
  color: string;
  label: string;
  value: string;
  unit?: string;
  /** Нийтэд эзлэх хувь (0–100) — null бол мөр гарахгүй */
  share?: number | null;
  /** Өмнөх цэгээс өөрчлөлт (бичвэр + тэмдэг) — null бол гарахгүй (null ≠ 0) */
  delta?: { sign: number; text: string } | null;
  /** Олон муруй — цуваа бүрийн мөр (өгвөл `value`-ийн оронд) */
  rows?: { key: string; label: string; value: string; color: string }[];
  hint?: string;
  selected?: boolean;
}) {
  const anchor = t < 0.22 ? 'left' : t > 0.78 ? 'right' : 'center';
  const shift = anchor === 'left' ? '0%' : anchor === 'right' ? '-100%' : '-50%';
  const below = top < 45;
  return (
    <div
      role="tooltip"
      className={`${s.tip} ${s.areaTip}`}
      style={{
        left: rect.left + t * rect.width,
        top: rect.top + (top / 100) * rect.height,
        transform: `translate(${shift}, ${below ? '10px' : 'calc(-100% - 10px)'})`,
      }}
    >
      <span className={s.tipHd} style={{ background: `color-mix(in oklab, ${color} 10%, transparent)` }}>
        <i className={s.tipDot} style={{ background: color }} />
        <span className={`${s.tipName} num`}>{label}</span>
        {selected && <span className={s.tipSel}>{tr('сонгосон')}</span>}
      </span>
      <span className={s.tipBody}>
        {rows ? rows.map((r) => (
          <span key={r.key} className={s.areaTipRow}>
            <i className={s.tipDot} style={{ background: r.color }} />
            <span>{r.label}</span>
            <b className="num">{r.value}</b>
          </span>
        )) : (
          <span className={s.areaTipVal}>
            <b className="num" style={{ color }}>{value}</b>
            {unit && <span className={s.areaTipUnit}>{unit}</span>}
          </span>
        )}
        {(share != null || delta != null) && (
          <span className={s.areaTipMeta}>
            {share != null && <span className="num">{share.toFixed(1)}%</span>}
            {delta != null && (
              <span className="num" style={{ color: delta.sign !== 0 ? 'var(--data)' : 'var(--ink-3)' }}>
                {delta.sign > 0 ? '▲' : delta.sign < 0 ? '▼' : '='} {delta.text}
              </span>
            )}
          </span>
        )}
        {hint && <span className={s.tipHint}>{hint}</span>}
      </span>
    </div>
  );
}

/* ══════════════ Лавлах CRM загварын жижиг хэсгүүд (2026-10-09) ══════════════
   ⚠️ 2026-10-09 («лавлах CRM загвар — өнгө хэвээр»): хэрэглэгч бүх графикийг бараан
   «CRM Dashboard» загварын ХЭВ МАЯГААР (тор + жижиг тэнхлэг, гэрэлтсэн гөлгөр шугам,
   цэгэн төлөвлөгөө, hover-оор гарах тэмдэг + утгын pill) харуулахыг хүссэн. ӨНГӨ нь
   хуучин токен хэвээр (--data, --c1…--c8, --chart-plan/actual, төлвийн) — шинэ өнгө
   нэмээгүй; зөвхөн `--chart-glow`/`--chart-callout-shade` гэсэн ХЭВ МАЯГИЙН токен.
   Эдгээр нь `ui.tsx`-ийн бүх график ба модулийн S-муруйд (PkgProg · GeneralDash ·
   Finance) НЭГ хэлбэрээр хэрэглэгдэнэ. */

/* ⚠️ 2026-10-23: Environment — `PointCallout` («Дээд: X» / утгын pill) ба `HoverMarker` нь
   ЭНЭ ФАЙЛЫН графикуудаас (Series · Trend) ХАСАГДСАН (Environment-д байхгүй; утгыг цэгийн
   дэргэдэх hover самбар хэлнэ). Экспорт нь Finance/PkgProg-ийн өөрийн S-муруйд үлдсэн. */

/** Байрлал: тоо → px, мөр → шууд (жиш. «34%») */
const posOf = (v: number | string): string => (typeof v === 'number' ? `${v}px` : v);

/**
 * УТГЫН PILL («Дээд: 68») — цэгийн ДЭЭР (эсвэл `below` үед доор) сууна, жижиг сумтай.
 *
 * ⚠️ Дэвсгэр нь ЦУВААНЫ өнгө, бичиг нь `--hue-ink`. Цайвар горимд дэвсгэрийг
 *    `--chart-callout-shade` (18%) харлуулна — эс бөгөөс --c2/--c5/--c6 дээр цагаан
 *    бичиг 3:1-ээс доош унана. Харанхуйд бичиг бараан тул харлуулахгүй.
 * ⚠️ Эцэг нь `position: relative` байх ёстой. `pointer-events: none` — доорх цэгийн
 *    hover-ыг хулгайлахгүй.
 * ⚠️ `align` — ирмэгт ойрхон цэгт pill хайрцгаас гарч тайрагдахгүйн тулд сумыг
 *    захад нь тавьж pill-ийг дотогш эргүүлнэ (`calloutAlign`).
 * ⚠️ Дэлгэрэнгүй (нэр, тайлбар, `hint`) нь `useTip`/уншилтын мөрөнд хэвээр — pill
 *    нь зөвхөн ТОО.
 * ⚠️ 2026-10-23: Environment — дэвсгэр нь цувааны өнгө БИШ, tooltip-ийн гадаргуу
 *    (`--surface` 95% + blur, `--line-strong` хүрээ); цувааны өнгө нь зөвхөн 6px цэг
 *    (`--cc`). Дээрх «дэвсгэр = цувааны өнгө» ба `--chart-callout-shade` дүрэм ХҮЧИНГҮЙ.
 */
export function PointCallout({
  x, y, text, color, below = false, align = 'center',
}: {
  x: number | string;
  y: number | string;
  text: string;
  color?: string;
  below?: boolean;
  align?: 'start' | 'center' | 'end';
}) {
  const tx = align === 'start' ? '-12px' : align === 'end' ? 'calc(-100% + 12px)' : '-50%';
  const ty = below ? '9px' : 'calc(-100% - 9px)';
  const st = {
    left: posOf(x),
    top: posOf(y),
    transform: `translate(${tx}, ${ty})`,
    '--cc': color ?? 'var(--data)',
    '--pl': align === 'start' ? '12px' : align === 'end' ? 'calc(100% - 12px)' : '50%',
  } as CSSProperties;
  return (
    <span className={`${s.callout} ${below ? s.calloutBelow : ''} num`} style={st} aria-hidden>
      {text}
    </span>
  );
}

/** Хувийн байрлалаас pill-ийн тэгшилгээ — 8%-иас ойр ирмэгт сумыг зах руу */
export const calloutAlign = (xPct: number): 'start' | 'center' | 'end' =>
  (xPct < 8 ? 'start' : xPct > 92 ? 'end' : 'center');

/**
 * HOVER/ФОКУСЫН ТЭМДЭГ (HTML) — r 3.5 дүүргэлт + 2px гадаргуун цагираг (`CHART.hoverR`).
 * ⚠️ 2026-10-23: Environment — гало хасагдсан; бусад цэг .5 → .15 бүдгэрнэ. Эцэг нь
 *    `position: relative`.
 */
export function HoverMarker({ x, y, color }: { x: number | string; y: number | string; color?: string }) {
  return (
    <span
      className={s.hmark}
      style={{ left: posOf(x), top: posOf(y), '--cc': color ?? 'var(--data)' } as CSSProperties}
      aria-hidden
    />
  );
}

/** HOVER/ФОКУСЫН ТЭМДЭГ (SVG, бодит пикселийн viewBox-д) — `HoverMarker`-тай ижил хэмжээ
 *  ⚠️ 2026-10-23: Environment — гало (`haloR` 0) зурахгүй, зөвхөн цэг + гадаргуун цагираг. */
export function SvgHoverMarker({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <g aria-hidden style={{ pointerEvents: 'none' }}>
      {CHART.haloR > 0 && <circle cx={cx} cy={cy} r={CHART.haloR} style={{ fill: color, opacity: CHART.haloA }} />}
      <circle cx={cx} cy={cy} r={CHART.hoverR} style={{ fill: color, stroke: 'var(--surface)', strokeWidth: CHART.ring }} />
    </g>
  );
}

/**
 * ТЭНХЛЭГИЙН ТОО — жижиг, товч: их наяд / тэрбум / сая (бүтэн үгээр — 2026-09-04-ний
 * GeneralDash `mntShort`-ийн дүрэм: товчилсон «их н.»-ийг хэрэглэгч буцаасан).
 * ⚠️ Бага утгад алхмын аравтын орноор (0.25 → «0.25», 20 → «20»).
 */
function tickText(v: number, dec: number, suffix = ''): string {
  const a = Math.abs(v);
  if (a >= 1e12) return tr('{0} их наяд', num(v / 1e12, a % 1e12 === 0 ? 0 : 1));
  if (a >= 1e9) return tr('{0} тэрбум', num(v / 1e9, a % 1e9 === 0 ? 0 : 1));
  if (a >= 1e6) return tr('{0} сая', num(v / 1e6, a % 1e6 === 0 ? 0 : 1));
  return `${num(v, dec)}${suffix}`;
}

/** Тэнхлэгийн баганын өргөн (px) — хамгийн урт шошгоор (10px tabular ≈ 5.6px/тэмдэгт) */
const axisWidth = (labels: string[]): number => Math.ceil(Math.max(1, ...labels.map((l) => l.length)) * 5.8 + 6);


/* ── Хэсэг ── */

/**
 * Дашбоардын хэсэг.
 *
 * `tone="primary"` нь тухайн самбарын ГОЛ хэсгийг заана.
 * ⚠️ 2026-10-23: Environment `CutCard first` — бүлгийн эхний карт шиг 2px `--data` ДЭЭД хүрээ
 *    (урьдын moss 35% хүрээ + будсан толгой хасагдсан). `note` нь толгойн баримтын мөр
 *    (Environment `meta`: 10.5px tabular, нэг мөрөнд, ink-3).
 *
 * ⚠️ Самбар бүрд НЭГ л primary байна. Урьд нь 6-7 хэсэг дараалахад бүгд ижил
 * жинтэй байсан тул хэрэглэгч аль нь гол вэ гэдгийг ялгаж чаддаггүй байв —
 * хоёр, гурав нь онцлогдвол тэр асуудал шийдэгдэхгүй, зөвхөн шилжинэ.
 */
export function Section({
  title,
  note,
  tone,
  fill,
  collapsible,
  defaultClosed,
  children,
}: {
  title?: ReactNode;
  note?: ReactNode;
  tone?: 'primary';
  /**
   * Агуулгыг картын ҮЛДСЭН ӨНДРӨӨР сунгана (босоо flex).
   *
   * ⚠️ Тогтмол өндөртэй чарт нь мөрийн бусад картаар СУНГАСАН картын дотор
   * дээд талд наалдаж, доор нь том хоосон талбай үлдээдэг: ХАБЭА-гийн
   * «Ажилтан — гүйцэтгэгчээр» дээр 110px чарт нь ~290px картын дөнгөж 40%-ийг
   * эзэлж байв. `fill` нь тэр зайг чартад өгнө.
   */
  fill?: boolean;
  /**
   * ХУРААГДДАГ хэсэг — гарчиг дээр дарж хаана/нээнэ. ⚠️ САНАДАГГҮЙ
   * (2026-08-21, хэрэглэгчийн хүсэлт): refresh хийхэд ҮРГЭЛЖ `defaultClosed`
   * төлөвтөө буцна — «үзье гэсэн нь нээж харна» зарчим.
   */
  collapsible?: boolean;
  /** Анхдагч нь ХААЛТТАЙ эхэлнэ (зөвхөн collapsible үед утгатай) */
  defaultClosed?: boolean;
  children: ReactNode;
}) {
  const [closed, setClosed] = useState(!!(collapsible && defaultClosed));
  const toggle = () => setClosed((v) => !v);
  return (
    <section
      className={`${s.section} ${tone === 'primary' ? s.sectionPrimary : ''} ${fill ? s.sectionFill : ''} ${collapsible && closed ? s.sectionClosed : ''}`}
      /* ⚠️ 2026-10-09: data-* — модулиуд (pkgFin/pkgProg) эдгээр элементийг класс НЭРИЙН хэсгээр
         (`[class*='sectionClosed']` …) барьдаг байв; тогтвортой атрибут руу шилжив. */
      data-closed={collapsible && closed ? '' : undefined}
    >
      {/* ⚠️ `secHead` / `secTitle` — ГЛОБАЛ нэрс (`statCard`, `statsGrid`-тэй
          ижил зарчим). Дуудагч модуль тухайн харагдацын нягтралд тааруулж
          хэмжээг дарж бичихэд хэрэгтэй: нэг дэлгэцэд 8 карт байхад 13.5px
          гарчиг нь агуулгаас илүү зай эзэлнэ. */}
      {title && (
        <header className={`${s.sectionHead} secHead`}>
          {collapsible ? (
            /* Гарчиг бүхэлдээ товч — жижиг сум онилохоос хялбар */
            <h3 className={`${s.sectionTitle} secTitle`}>
              <button type="button" className={s.secToggle} aria-expanded={!closed} onClick={toggle}>
                <span className={`${s.secCaret} ${closed ? s.secCaretOff : ''}`} data-ui="sec-caret" aria-hidden>▾</span>
                {title}
              </button>
            </h3>
          ) : (
            <h3 className={`${s.sectionTitle} secTitle`}>{title}</h3>
          )}
          {note && <span className={`${s.sectionNote} num`} data-ui="section-note">{note}</span>}
        </header>
      )}
      {(!collapsible || !closed) && children}
    </section>
  );
}

/* ── Байрлалын примитив ── */

/**
 * Босоо өрлөг тогтмол зайтай.
 *
 * ⚠️ Эдгээр примитивээс өмнө самбарууд `style={{ marginTop: 16 }}`-ыг 40 гаруй
 * газар гараар бичдэг байв. Утга нь 10, 12, 14, 16 гэж санамсаргүй хэлбэлзэж,
 * нэг самбарын дотор ч жигдэрдэггүй байлаа.
 */
export function Col({ gap = 'md', children }: { gap?: 'sm' | 'md' | 'lg'; children: ReactNode }) {
  return <div className={`${s.col} ${s[`col_${gap}`]}`}>{children}</div>;
}

/**
 * Зүүнд дүрслэл (цагираг/дугуй), баруунд тайлбар.
 * Самбаруудад хамгийн олон давтагдсан өрлөг.
 */
export function Split(
  { aside, children, asideEnd }:
  { aside: ReactNode; children: ReactNode; /** Хажуугийн блок нь БАРУУН талд */ asideEnd?: boolean },
) {
  return (
    <div className={`${s.split} ${asideEnd ? s.splitEnd : ''}`}>
      <div className={s.splitAside}>{aside}</div>
      <div className={s.splitBody}>{children}</div>
    </div>
  );
}

/** Хэсгийн доторх тайлбар бичвэр */
export function Note({ children }: { children: ReactNode }) {
  return <p className={s.noteText}>{children}</p>;
}

/* ── Таб ── */

/**
 * Самбарын доторх таб.
 *
 * Нэг модульд олон СЭДЭВ багтахад (барилгын блок, талбайн тайлан, байрлалын
 * хяналт) урт өрлөг болгохын оронд тус тусад нь салгана. Гүйлгэхэд гарчиг нь
 * дагаж явахаар наалдана — урт агуулгад аль хэсэгт байгаагаа алдахгүй.
 *
 * `count` нь тухайн табын доторх бичлэгийн тоо. `warn` нь анхаарал татах ёстой
 * тоо (жишээ нь хилээс гадуур бүртгэгдсэн тайлан) — таб нуугдсан ч тэмдэг нь
 * харагдаж, хэрэглэгч анзаарна.
 */
export function Tabs({
  items,
  value,
  onChange,
  plain,
}: {
  items: { key: string; label: string; count?: number | null; warn?: boolean }[];
  value: string;
  onChange: (key: string) => void;
  /** Зурвас БИШ, хэсгийн дотор хажуугаар байрлах товчийн багц (шугам/зайгүй) */
  plain?: boolean;
}) {
  /**
   * ⚠️ 2026-08-17: ГАРЫН удирдлага. Урьд нь `role="tablist"`/`role="tab"` гэж
   * зарласан ч сумны товч ажилладаггүй байсан — таб гэж зарлачихаад тэр зан
   * төлөвийг өгөхгүй байх нь ердийн товчноос ч ДОР (уншигч «сумаар сонго» гэж
   * зөвлөнө, гэтэл ажиллахгүй).
   *
   * ⚠️ `aria-controls` НЭМЭХГҮЙ: ~20 дуудагчийн самбарууд id-гүй тул байхгүй
   * id заах нь огт заахаас дор.
   *
   * ⚠️ `preventScroll` — `.tabs` нь `position: sticky`. Ердийн `focus()` нь
   * элементийг харагдуулах гэж гүйлгэхдээ табыг ӨӨРИЙНХ нь наалдсан толгойн
   * доогуур оруулж нууж орхино.
   */
  const nav = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = plain ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    const i = items.findIndex((t) => t.key === value);
    let next = -1;
    if (e.key === keys[0]) next = (i - 1 + items.length) % items.length;
    else if (e.key === keys[1]) next = (i + 1) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0 || next === i) return;
    e.preventDefault();
    onChange(items[next].key);
    const el = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
    el?.focus({ preventScroll: true });
  };

  /* ⚠️ 2026-10-23: Environment `.view-switch` — СЕГМЕНТЭН удирдлага (3px дотор зайтай 1px
     хүрээт зам, дарагдсан нь `--surface` + зөөлөн сүүдэр). Наалдах (sticky) зурвас нь
     гаднах `.tabsBar` — замыг бүтэн өргөнөөр сунгахгүйн тулд тусдаа. `plain` нь зурвасгүй. */
  const list = (
    /* ⚠️ 2026-09-25: `plain` нь ↑/↓ сумаар явдаг тул `aria-orientation`-оор зарлана —
       эс бөгөөс уншигч «←/→» гэж зөвлөж, тэр нь ажиллахгүй. */
    <div
      className={`${s.tabs} ${plain ? s.tabsPlain : ''}`}
      role="tablist"
      aria-orientation={plain ? 'vertical' : 'horizontal'}
      onKeyDown={nav}
    >
      {items.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            // Идэвхтэй таб л Tab-аар орно; доторх шилжилт сумаар (roving tabindex)
            tabIndex={on ? 0 : -1}
            className={`${s.tab} ${on ? s.tabOn : ''}`}
            onClick={() => onChange(t.key)}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={`${s.tabCount} ${t.warn ? s.tabCountWarn : ''} num`}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
  return plain ? list : <div className={s.tabsBar}>{list}</div>;
}

/* ── Үзүүлэлт ── */

export function Stats({ cols = 2, children }: { cols?: 1 | 2 | 3 | 4; children: ReactNode }) {
  /**
   * ⚠️ `statsGrid` — ГЛОБАЛ нэр (CSS модулиар хэшлэгддэггүй). Дуудагч модуль
   * тухайн БАЙРЛАЛД нь тааруулж баганын тоог дарж бичихэд хэрэгтэй: дашбоардын
   * дэлгэрэнгүй горимд газрын зургийн ДЭЭД/ДООД нүд нь 1700px өргөн тул тэнд
   * 2 багана нь картыг 5 мөр өндөрсгөж, хажуугийн 300px баганад 4 багана нь
   * шахагдана. Эх сурвалж нь `cols` хэвээр — энэ нь зөвхөн байрлалын залруулга.
   */
  return (
    <div
      className={[
        s.stats, 'statsGrid',
        /* ⚠️ `cols === 1` нэмэгдэв (2026-09-04): нэг үзүүлэлттэй картад
           2 багана нь хагас хоосон нүд үлдээж, карт «дутуу» мэт харагдана. */
        cols === 1 ? s.stats1 : '', cols === 3 ? s.stats3 : '', cols === 4 ? s.stats4 : '',
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}

export function Stat({
  value,
  unit,
  label,
  color,
  accent,
  icon,
}: {
  value: ReactNode;
  unit?: string;
  label: string;
  color?: string;
  accent?: boolean;
  /**
   * Тооны ӨМНӨ гарах дүрс (`Icon.tsx`-ийн нэр).
   *
   * ⚠️ Optional бөгөөд анхдагчаар БАЙХГҮЙ: 56 дуудагчийн аль нь ч
   * өөрчлөгдөхгүй. Дүрсийг зөвхөн ЦӨӨН үзүүлэлттэй зурваст (KPI мөр) тавина —
   * жагсаалт маягийн олон мөрөнд дүрс нь давтагдаж чимээ болдог.
   */
  icon?: string;
}) {
  /**
   * ⚠️ `statCard` / `statNum` / `statTag` — ГЛОБАЛ нэрс (`statsGrid`-тэй ижил
   * зарчим). Дуудагч модуль тухайн харагдацын дизайнд тааруулж дарж бичихэд
   * хэрэгтэй: Ерөнхий дашбоардын дэлгэрэнгүй горим нь НЯГТ аналитик хэл рүү
   * шилжсэн тул тэнд өнгөт tint, сийрэг зай, 26px нөөцлөсөн шошгын мөр
   * гурвуулаа хүчингүй болно (`overview.module.css` → «НЯГТ ХЭЛ»).
   */
  /**
   * ⚠️ 2026-09-01: мөнгөн дүн бүтнээр бичигдэх болсноор утга 17 тэмдэгт хүрдэг
   *    («2,660,000,000,000 ₮») — 16px-ээр нарийхан KPI нүднээс халж, хоёр мөр
   *    болно. Тайрахгүй (дүн тасарвал ХУДАЛ уншигдана), фонтоо БАГАСГАНА.
   *    Уртыг зөвхөн энгийн утганд хэмжинэ — `ReactNode` бол мэдэх аргагүй.
   */
  const long = typeof value === 'string' || typeof value === 'number'
    ? String(value).length >= 10
    : false;
  /* ⚠️ 2026-10-23: Environment `.analytics-stat` — хавтан (14px 18px, 13px булан), зүүнд
     38px дүрсний хайрцаг, баруунд ДЭЭР шошго (10px ink-3), ДООР утга (23px/600). DOM-ийн
     дараалал (утга → шошго) ХЭВЭЭР — `statCard/statNum/statTag` глобал нэрээр дарж бичдэг
     модулиуд эвдрэхгүй; байрлалыг CSS grid-ийн талбар (`grid-area`) өгнө. Дүрс нь тооны
     ДОТРООС гарч хавтангийн шууд хүүхэд болов (урьд «тооны өмнө, нэг мөрөнд»). */
  return (
    <div className={`${s.stat} statCard ${accent ? s.statAccent : ''} ${icon ? s.statHasIcon : ''}`} style={tone(color)}>
      {icon && <span className={s.statIcon} aria-hidden><Icon name={icon} /></span>}
      <div className={`${s.statValue} ${long ? s.statValueLong : ''} statNum num`}>
        {value}
        {unit && <span className={s.statUnit}>{unit}</span>}
      </div>
      <div className={`${s.statLabel} statTag`}>{label}</div>
    </div>
  );
}

/* ── Баганан жагсаалт ── */

type Bar = {
  key: string;
  label: string;
  /** ⚠️ 2026-10-09: `null` = мэдээлэлгүй (null ≠ 0) — зурвасгүй, `display`-гүй бол «—» */
  value: number | null;
  display?: string;
  color?: string;
  /*
   * ⚠️ ДЭД УТГА (`sub`) ЭНД БАЙХГҮЙ, БАЙХ Ч ЁСГҮЙ. 2026-09-04-нд багана
   * дотор «биелсэн» хэсгийг өөр өнгөөр будаж туршсан боловч хэрэглэгч
   * хассан: нэг зурвас дээр гурван сүүдэр (өнгөт · саарал · зам) нь
   * жагсаалтыг уншихад тус болохоос илүү саад болсон. Дэд задаргаа нь
   * hover цонхонд БҮТЭН ӨГҮҮЛБЭРЭЭР байдаг (`hint`) — тэр газраа хангалттай.
   */
  /**
   * Hover цонхны ЭХНИЙ мөр — мөрөн дээрхээс ӨӨР байж болно.
   *
   * ⚠️ Мөрөн дээр богино («1.2% · 29 тэрбум ₮»), hover-т дэлгэрэнгүй байх
   * шаардлага бий: жагсаалт гүйлгэн уншихад харьцаа хэрэгтэй, нэг мөрийг
   * судлахад бүтэн дүн хэрэгтэй. Заагаагүй бол `display` хэрэглэгдэнэ.
   */
  /**
   * НЭМЭЛТ ХЭМЖИГДЭХҮҮН — ХОЁР ДАХЬ ДҮҮРГЭЛТ, ӨӨР ӨНГӨӨР.
   *
   * ⚠️ 2026-09-10: зураасан ТЭМДГЭЭС ДҮҮРГЭЛТ болов (хэрэглэгчийн заавар:
   * «өөр өнгийн сонголт оруулаад fill хийсэн байдлаар»). Зурвас нь НЭГ
   * дээр НЭГ давхарлахгүй, ХОЁР ТУСДАА ХЭЛХЭЭ болж зэрэгцэн зурагдана —
   * 2026-09-04-нд хассан «нэг зурвас дээр гурван сүүдэр» гэсэн асуудал
   * дахин үүсэхгүй.
   * ⚠️ `null` бол ХОЁРДУГААР хэлхээ ОГТ гарахгүй (зам ч зурагдахгүй) —
   * хэмжигдээгүйг 0%-ийн хоосон зурвасаар харуулах нь худал мэдэгдэл.
   */
  mark?: number | null;
  /** Хоёрдугаар дүүргэлтийн өнгө — заагаагүй бол анхааруулгын өнгө */
  markColor?: string;
  tipValue?: string;
  /**
   * Hover цонхны ХОЁР ДАХЬ мөр — утгын ТАЙЛБАР.
   *
   * ⚠️ Жагсаалтын мөрөнд БИШ, зөвхөн hover-т гарна: мөр нь нэр + утга
   * хоёроор аль хэдийн дүүрэн бөгөөд гурав дахь текст нэмбэл нэр нь
   * шахагдаж хоёр мөр болно (`.barName` нь 2 мөрөөр таслагддаг).
   *
   * ⚠️ ОЛОН мөр өгч болно — тус бүр цэгтэй мөр болно.
   */
  hint?: string | string[];
};

export function Bars({
  items,
  color,
  max,
  selected,
  onSelect,
  limit,
}: {
  items: Bar[];
  color?: string;
  max?: number;
  /** Сонгосон key(үүд) — олон сонголтод массив */
  selected?: string | string[] | null;
  onSelect?: (key: string) => void;
  /**
   * ⚠️ Хуучирсан — үргэлж НЭГ ЭГНЭЭ (нэр урд). Дуудагчид эвдрэхгүйн тулд
   * төрөлд үлдээв; загварт нөлөөлөхгүй.
   */
  inline?: boolean;
  /**
   * Эхэндээ хэдэн мөр харуулах. Үлдсэнийг «бүгдийг харах» товчоор нээнэ.
   *
   * ⚠️ Зарим ангилал 40+ утгатай (жишээ нь барилгын «Багц / бүс»). Бүгдийг нь
   * задгай харуулбал самбар бүхэлдээ ганц жагсаалт болж, доор нь байгаа бусад
   * давхаргын үзүүлэлт хэдэн дэлгэц доор үлдэнэ.
   */
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  const sel = selected == null ? [] : Array.isArray(selected) ? selected : [selected];
  // Хэмжээсийг БҮХ мөрөөр тогтооно — эс бөгөөс задлахад баганы урт үсэрнэ
  const top = fin(max ?? Math.max(1, ...items.map((i) => fin(i.value)))) || 1;
  const hidden = limit != null && !all ? Math.max(0, items.length - limit) : 0;
  const shown = hidden > 0 ? items.slice(0, limit) : items;

  /* ⚠️ 2026-10-23: Environment `RowChart` — өгөгдөлгүй үед `.chart-empty` (тасархай хүрээ) */
  if (!items.length) return <Empty label={tr('Үзүүлэлт байхгүй')} />;

  return (
    <div className={`${s.bars} barsList`}>
      {shown.map((it) => {
        const w = Math.max(0, Math.min(100, (fin(it.value) / top) * 100));
        const on = sel.includes(it.key);
        const dim = sel.length > 0 && !on;
        /* ⚠️ 2026-10-09 (графикийн жигдрэл): `display`-гүй үед ТҮҮХИЙ тоо биш `num()` —
           урьд нь «20162536361» гэж мянгатын таслалгүй гардаг байв. null → «—». */
        const hasV = it.value != null && Number.isFinite(it.value);
        const shownV = it.display ?? autoNum(it.value);
        // <button> дотор зөвхөн phrasing content зөвшөөрөгдөнө — <div> ашиглаж болохгүй
        /**
         * ⚠️ 2026-08-17: envhub-ийн RowChart загвар — ХОЁР мөр: дээр нь
         * нэр + утга (baseline, хоёр захад), доор нь БҮТЭН өргөний зам.
         * Урьд нь нэр|бар|утга нэг эгнээ байсан — нэрэнд 30% л зай өгч урт
         * монгол нэрийг олон мөр даруулдаг байв; одоо нэр бүтэн өргөнтэй.
         * ⚠️ 2026-10-23: Environment `RowChart` — мөр бүр (дардаггүй ч) 3px 6px 4px дотор
         *    зайтай, 1px тунгалаг хүрээтэй; бүдгэрэлт нь МӨР БҮХЭЛДЭЭ .35; нэр бүтэн ороно
         *    (2 мөрийн тайралтгүй), сонгогдсон нэрийн жин өөрчлөгдөхгүй; мөрийн ӨӨРИЙН өнгөтэй
         *    (`it.color`) үед нэрийн өмнө 6px цэг (Environment `colorOf`).
         */
        const body = (
          <>
            <span className={s.barTop}>
              <span className={s.barName}>
                {it.color && <i className={s.barDot} style={{ background: it.color }} aria-hidden />}
                {tr(it.label)}
              </span>
              <span className={`${s.barVal} num`}>{shownV}</span>
            </span>
            {/* ⚠️ `chartTrack` / `chartFill` — ГЛОБАЛ нэрс (`statCard`,
                `secTitle`-тэй ижил зарчим). Дуудагч харагдац зурвасны зузаан,
                бүтцийг өөрийн нягтралд тааруулж дарж бичихэд хэрэгтэй; энэ
                файлын анхдагч 5px зам (2026-10-23: Environment). */}
            {/* ⚠️ 2026-10-09: null (мэдээлэлгүй) үед ДҮҮРГЭЛТ огт зурахгүй — зөвхөн зам */}
            <span className={`${s.barTrack} chartTrack`}>
              {hasV && <i className={`${s.barFill} chartFill`} style={{ width: `${w}%` }} />}
            </span>
            {/* ⚠️ ХОЁРДУГААР ХЭЛХЭЭ — тусдаа зам дээр, өөр өнгөөр. Хэмжигдээгүй
                бол зам нь ч гарахгүй (`Bar.mark`-ийн тайлбарыг үз). */}
            {it.mark != null && Number.isFinite(it.mark) && (
              <span className={`${s.barTrack} ${s.barTrack2} chartTrack`}>
                <i
                  className={`${s.barFill} chartFill`}
                  style={{
                    width: `${Math.max(0, Math.min(100, (fin(it.mark) / top) * 100))}%`,
                    background: it.markColor,
                  }}
                />
              </span>
            )}
          </>
        );
        const rowCls = `${s.barRow} ${dim ? s.barRowDim : ''}`;
        const st = tone(it.color ?? color);
        /**
         * ⚠️ 2026-10-23: Environment `RowChart` — хулганы тайлбар нь уугуул `title`
         *    («нэр · утга»); мөрийн `hint` (олон мөр) ба «Дарж газрын зурагт шүүнэ» заавар
         *    ХЭВЭЭР, шинэ мөрөөр. `TIP_RULE` нь хоосон мөр (бүлгийн зааг) болно.
         */
        const title = tipTitle(
          tr(it.label),
          String(it.tipValue ?? shownV),
          /* ⚠️ Мөрийн ӨӨРИЙН тайлбар давамгайлна — «Дарж шүүнэ» нь зөвхөн
             тайлбаргүй мөрд гарах ерөнхий заавар. */
          it.hint ?? (onSelect ? tr('Дарж газрын зурагт шүүнэ') : undefined),
        );
        return onSelect ? (
          <button
            key={it.key}
            type="button"
            aria-pressed={on}
            className={`${rowCls} ${s.barClick} ${on ? s.barOn : ''}`}
            style={st}
            title={title}
            onClick={() => onSelect(it.key)}
          >
            {body}
          </button>
        ) : (
          <div key={it.key} className={rowCls} style={st} title={title}>
            {body}
          </div>
        );
      })}

      {hidden > 0 && (
        <button type="button" className={s.more} onClick={() => setAll(true)}>
          {tr('Үлдсэн')} {hidden}{tr('-г харах')}
        </button>
      )}
      {all && limit != null && items.length > limit && (
        <button type="button" className={s.more} onClick={() => setAll(false)}>
          {tr('Хумих')}
        </button>
      )}
    </div>
  );
}

/* ── Хэмжигч (meter) ── */

/** `Meter`-ийн төлвийн өнгө — `--tone`-д буулгана */
const METER_TONE = {
  data: 'var(--data)',
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  mute: 'var(--ink-3)',
} as const;
export type MeterTone = keyof typeof METER_TONE;

/**
 * ХЭМЖИГЧ — нэг хувь (0–100), сонголтоор төлөвлөгөөний тэмдэгтэй.
 *
 * ⚠️ 2026-10-09 («бүх графикийн загварыг жигдлэх»): `tailanChart.Meter` (8px,
 *    бөөрөнхий, утга баруун талд) ба `tuh/charts.Meter` (2px, tone) гэсэн ХОЁР
 *    хувилбарыг нэгтгэв. Загвар нь `Bars`-ийн мөр: дээр нэр + утга, доор 2px зам
 *    (`--chart-track`), төлөвлөгөө нь 2px `--ink` зураас ±4px.
 * ⚠️ `value` null = МЭДЭЭЛЭЛГҮЙ → хоосон зам + «—» (0% БИШ — null ≠ 0).
 * ⚠️ Хувийг `pct()` (1 орон) — дуудагч өөрөө формат өгөхгүй бол.
 * ⚠️ `chartTrack`/`chartFill` глобал нэр — `Bars`-тай ижил, хэвлэх CSS дарж бичдэг.
 * ⚠️ 2026-10-23: Environment `Meter` — зам 6px, булан 6px (`CHART.meterH`), гэрэлтэлтгүй;
 *    hover нь уугуул `title`.
 */
export function Meter({
  value,
  plan,
  tone: tn = 'data',
  color,
  label,
  showValue,
  display,
  decimals = 1,
  wide = false,
}: {
  /** 0–100 хувь; null = мэдээлэлгүй */
  value: number | null | undefined;
  /** Төлөвлөгөөт хувь (0–100) — лавлах зураас; null бол зураасгүй */
  plan?: number | null;
  tone?: MeterTone;
  /** Дурын өнгө (`tone`-ийг дарна) — токен байх ёстой (`var(--…)`) */
  color?: string;
  /** Мөрийн нэр — өгвөл дээр нэр + утгын мөр гарна; aria-label болно */
  label?: string;
  /** Утгыг (баруун дээд) бичих эсэх — анхдагч: `label` өгсөн үед тийм */
  showValue?: boolean;
  /** Утгын бичвэрийг дарна (жиш. «12 / 40 блок»); өгөөгүй бол `pct(value)` */
  display?: string;
  /** `pct()`-ийн аравтын орон — анхдагч 1 */
  decimals?: number;
  /** Тайлангийн толгойн том хэмжигч — 8px (`CHART.meterWideH`) */
  wide?: boolean;
}) {
  const has = value != null && Number.isFinite(value);
  const v = has ? Math.max(0, Math.min(100, value)) : null;
  const hasP = plan != null && Number.isFinite(plan);
  const p = hasP ? Math.max(0, Math.min(100, plan)) : null;
  const text = has ? (display ?? pct(value, decimals)) : '—';
  const head = label != null || (showValue ?? false);
  const withVal = showValue ?? label != null;
  const c = color ?? METER_TONE[tn];
  /* ⚠️ 2026-10-23: Environment — хулганы тайлбар нь уугуул `title` (custom tooltip-ийн оронд);
     бичвэр ХЭВЭЭР: «нэр · утга» + төлөвлөгөөний мөр. */
  const title = tipTitle(
    label != null ? tr(label) : tr('Гүйцэтгэл'),
    text,
    hasP ? `${tr('Төлөвлөгөө')}: ${pct(plan, decimals)}` : undefined,
  );
  const bar = (
    <span
      className={`${s.meterTrack} ${wide ? s.meterWide : ''} chartTrack`}
      aria-label={label != null ? tr(label) : undefined}
      /* ⚠️ Өгөгдөлгүй үед aria-valuenow БИЧИХГҮЙ — жинхэнэ 0%-тай андуурагдана (Ring-ийн дүрэм).
         `meter` үүрэг нь aria-valuenow-г ЗААВАЛ шаарддаг тул тэр үед `img` + «өгөгдөлгүй». */
      {...(v != null
        ? { role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': v, 'aria-valuetext': text }
        : { role: 'img', 'aria-label': label ? `${tr(label)}: ${tr('өгөгдөлгүй')}` : tr('өгөгдөлгүй') })}
    >
      {v != null && <span className={`${s.meterFill} chartFill`} style={{ width: `${v}%` }} />}
      {p != null && <span className={s.meterPlan} style={{ left: `${p}%` }} aria-hidden />}
    </span>
  );
  return (
    /* ⚠️ `<span>` — мөр нь `<p>` дотор ч байж болно */
    <span className={s.meterRow} style={tone(c)} title={title}>
      {head && (
        <span className={s.barTop}>
          {label != null && <span className={s.barName}>{tr(label)}</span>}
          {withVal && <span className={`${s.barVal} num`}>{text}</span>}
        </span>
      )}
      {bar}
    </span>
  );
}

/* ── Хэсэгчилсэн мөр ── */

/**
 * Хэсэгчилсэн 100% зурвас.
 *
 * ⚠️ 2026-10-23: Environment — ХОЁР хэлбэр:
 *    · `legend` (анхдагч) → Environment `Composition` (unelgee/viz.tsx): 28px зурвас, 1px `--line`
 *      хүрээ, 6px булан; 12%-аас том хэсэгт хувь (10.5/500, бараан бичиг); доор 10px тэмдэгтэй
 *      тайлбар «нэр утга · %».
 *    · `legend={false}` (мөр дотор суулгасан — Habea «Компаниар») → Environment `StackedBarChart`-ын
 *      зам: 10px, 3px булан, хэсэг хооронд 1px завсар, `--chart-track` дэвсгэр.
 *    Hover-оор хэсэг↔тайлбар бүдгэрүүлэх холбоо (2026-08-17) ХАСАГДСАН — Environment-д байхгүй;
 *    хэсэг бүр уугуул `title`-тэй («нэр · утга · x.x%»).
 */
export function Stack({
  items,
  total,
  /** Доор нь тайлбар (нэр + тоо) харуулах эсэх. Чипээр давхардуулахгүйн тулд унтраана. */
  legend = true,
}: {
  /** ⚠️ 2026-10-09: `color` заавал биш — өгөөгүй бол `cat(i)` (зэрэглэлийн слот)
      ⚠️ 2026-10-23: Environment — өгөөгүй бол `--data` + тунгалгийн шат (`rampOp`) */
  items: { key: string; label: string; value: number; color?: string; display?: string }[];
  total?: number;
  legend?: boolean;
}) {
  const sum = fin(total ?? items.reduce((a, b) => a + fin(b.value), 0)) || 1;
  const has = items.some((it) => fin(it.value) > 0);
  /* ⚠️ 2026-10-23: Environment — өнгөгүй хэсэг `cat(i)` БИШ, `--data` + тунгалгийн шат
     (`rampOp`); дуудагчийн өгсөн өнгө .88. Тунгалгийг ДЭВСГЭРИЙН өнгөнд (color-mix) шингээнэ —
     элементийн `opacity` нь дээрх хувийн бичгийг ч бүдгэрүүлнэ. */
  const fillOf = (i: number) => {
    const c = items[i].color ?? 'var(--data)';
    const op = items[i].color ? explicitOp : rampOp(i);
    return `color-mix(in oklab, ${c} ${Math.round(op * 100)}%, transparent)`;
  };
  /* ⚠️ 2026-10-09: утгыг `num()` — урьд нь түүхий `{i.value}` («12345.678») */
  const valText = (it: { value: number; display?: string }) => it.display ?? autoNum(it.value);
  /* ⚠️ 2026-10-09 (аудит №6): хэсэг бүрийг тусад нь `toFixed(0)` → их үлдэгдлийн арга
     (`chartStyle.roundPctsTo100`, Donut-тай нэг) — тайлбарын хувиуд нийлээд ЯГ 100 (урьд 99/101%).
     `total` өгсөн бол түүгээр — хэсгүүд бүхлийг бүрхээгүй бол < 100 хэвээр.
     ⚠️ 2026-10-23: Environment `Composition` — зурвас ба тайлбар НЭГ нарийвчлалтай (бүхэл %). */
  const shares = roundPctsTo100(items.map((it) => fin(it.value)), total == null ? undefined : fin(total));
  const share = (idx: number) => {
    // «0%» худал уншилтаас сэргийлнэ — Donut-ынхтой ижил дүрэм
    return fin(items[idx].value) > 0 && shares[idx] === 0 ? '<1%' : `${shares[idx]}%`;
  };
  /** Уугуул `title` — Environment `Composition`: нэг оронтой хувь */
  const titleOf = (i: number) =>
    `${tr(items[i].label)} · ${valText(items[i])} · ${((fin(items[i].value) / sum) * 100).toFixed(1)}%`;

  if (!legend) {
    return (
      <div className={s.stack}>
        {items.map((it, idx) => (fin(it.value) > 0 ? (
          <span
            key={it.key}
            className={s.stackSeg}
            style={{ width: `${(fin(it.value) / sum) * 100}%`, background: fillOf(idx) }}
            title={titleOf(idx)}
          />
        ) : null))}
      </div>
    );
  }

  /* ⚠️ 2026-10-23: Environment `Composition` — нийлбэр 0 бол `.chart-empty` */
  if (!has) return <Empty label={tr('Үзүүлэлт байхгүй')} />;

  return (
    <div className={s.comp}>
      <div className={s.compBar}>
        {items.map((it, idx) => {
          const f = fin(it.value) / sum;
          return f > 0 ? (
            <span
              key={it.key}
              className={`${s.compSeg} num`}
              style={{ width: `${f * 100}%`, background: fillOf(idx) }}
              title={titleOf(idx)}
            >
              {f > 0.12 ? share(idx) : ''}
            </span>
          ) : null;
        })}
      </div>
      <ul className={s.legend}>
        {items.map((it, idx) => (
          <li key={it.key} className={s.legendItem} title={titleOf(idx)}>
            <span className={s.compSwatch} style={{ background: fillOf(idx) }} />
            <span className={s.legendName}>{tr(it.label)}</span>
            {/* ⚠️ Хувь нь ЗААВАЛ: өнгө нь дангаараа мэдээлэл дамжуулж болохгүй
                (globals.css дахь «relief» дүрэм). */}
            <span className={`${s.legendVal} num`}>
              {valText(it)} · <span className={s.legendPct}>{share(idx)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Дугуй диаграм (pie / donut) ── */

/**
 * ЗҮСМЭГИЙН ЗАМ — дүүргэлттэй annular-sector (Environment `PieChart`-ын `donutSlice`).
 *
 * ⚠️ 2026-10-09 (лавлах CRM загвар): бөөрөнхий үзүүртэй зузаан нум байв.
 * ⚠️ 2026-10-23: Environment `PieChart` — бөөрөнхий нум ХАСАГДАВ. Зүсмэг нь ДҮҮРГЭЛТТЭЙ
 *    annular-sector, хөршөөсөө 2px `--surface` захаар (`CHART.donutGap`) тусгаарлагдана.
 *    Зах нь хоёр зүсмэгт тэгш хуваагдах тул харагдах урт хувьтайгаа тэнцүү.
 *    Ганц ангилал (бүтэн тойрог) — Environment шиг `<circle>` зураас (`Donut`-ын `fullOne`).
 */
function donutSector(cx: number, cy: number, ro: number, ri: number, f0: number, f1: number): string {
  const TAU = Math.PI * 2;
  /* 12 цагаас цагийн зүүний дагуу — `arcPath`-тай ижил чиглэл */
  const pt = (rad: number, f: number) => {
    const a = f * TAU;
    return `${Math.round((cx + rad * Math.sin(a)) * 100) / 100},${Math.round((cy - rad * Math.cos(a)) * 100) / 100}`;
  };
  const big = f1 - f0 > 0.5 ? 1 : 0;
  return `M${pt(ro, f0)} A${ro},${ro} 0 ${big} 1 ${pt(ro, f1)} L${pt(ri, f1)} A${ri},${ri} 0 ${big} 0 ${pt(ri, f0)} Z`;
}

/**
 * Хувь эзлэх байдлыг харуулах дугуй диаграм.
 *
 * ⚠️ `Stack`-аас ЯЛГААТАЙ хэрэглээ: Stack нь нарийн зурвас — олон ангилалтай,
 * дараалал чухал үед. Donut нь ЦӨӨН (3–7) ангилалын харьцааг онцлоход тохирно.
 * 7-оос олон ангилалд зүсмэгүүд нь ялгагдахаа болих тул Stack эсвэл Bars хэрэглэ.
 *
 * ⚠️ 2026-10-23: Environment `PieChart` — НЭГ `--data` өнгийн тунгалгийн шат, дүүргэлттэй
 *    зүсмэг, доор нь `--chart-track` бөгж, голд SVG бичвэр («НИЙТ» + нийт). Hover-оор голын
 *    утга солигдох ба бусдыг бүдгэрүүлэх (2026-08-17) ХАСАГДСАН — Environment-д hover эффектгүй,
 *    зүсмэг/тайлбар бүр уугуул `title`-тэй. Сонголтоор бүдгэрэлт (.12 / тайлбар .35) хэвээр.
 */
export function Donut({
  items: rawItems,
  size: sizeIn = 'md',
  width: widthIn,
  center,
  centerLabel,
  selected,
  onSelect,
  nowrap = false,
  stack = false,
  leaders = false,
}: {
  /** ⚠️ 2026-10-09: `color` заавал биш — өгөөгүй бол `cat(i)` (зэрэглэлийн слот, dark-тай)
      ⚠️ 2026-10-23: Environment — өгөөгүй бол `--data` + тунгалгийн шат (`rampOp`) */
  items: { key: string; label: string; value: number; color?: string; display?: ReactNode }[];
  /**
   * ⚠️ 2026-10-09: 3 стандарт хэмжээ `'sm' | 'md' | 'lg'` (`DONUT_SIZES`).
   * ⚠️ 2026-10-23: Environment — 82 · 112 · 128; зузаан нь геометрээс (`donutGeom`, дотоод .72R).
   * Тоо өгөх нь хуучин дуудагчдад үлдсэн — мөн ижил геометр.
   */
  size?: number | DonutSize;
  /** Цагирагийн зузаан (px) — өгөөгүй бол Environment-ийн .28R */
  width?: number;
  /** Голд харуулах утга. Заагаагүй бол нийлбэр. (SVG бичвэр тул JSX-ийн текст л үлдэнэ.) */
  center?: ReactNode;
  centerLabel?: string;
  /** Сонгосон зүсмэгийн key(үүд) — идэвхтэй бол бусад нь бүдгэрнэ. Олон сонголтод массив. */
  selected?: string | string[] | null;
  /** Зүсмэг/тайлбар дарахад — байвал диаграм шүүлтийн удирдлага болно */
  onSelect?: (key: string) => void;
  /** Тайлбарыг пайн диаграмын ХАЖУУД албадаж зэрэгцүүлнэ (доош ороохгүй) */
  nowrap?: boolean;
  /** Тайлбарыг пайн диаграмын ДООР (Environment `legend="below"` — 2 багана) */
  stack?: boolean;
  /** Тайлбарыг доор жагсаахын оронд зүсмэг бүрээс ЗУРААС татаж гадна бичнэ */
  leaders?: boolean;
  /**
   * Захын шугамын зузааны үржүүлэгч — ⚠️ 2026-10-09-нөөс ҮЙЛЧЛЭХГҮЙ; хуучин дуудагчид
   * эвдрэхгүйн тулд төрөлд үлдэв.
   */
  edge?: number;
}) {
  const size = typeof sizeIn === 'number' ? sizeIn : DONUT_SIZES[sizeIn][0];
  /* ⚠️ 2026-10-23: Environment `PieChart` — гадаад R = size/2 − 4, дотоод .72R (`width` өгвөл R − width) */
  const { c: half, R: ro, r: ri } = donutGeom(size, widthIn);
  /* ⚠️ 2026-10-23: Environment — өнгөгүй зүсмэг `cat(i)` БИШ, НЭГ `--data` + тунгалгийн шат
     (.92 − i×.22); дуудагчийн өнгө (газрын зурагтай уялдсан) .88-аар. */
  const items = rawItems.map((it, i) => ({
    ...it,
    color: it.color ?? 'var(--data)',
    op: it.color ? explicitOp : rampOp(i),
  }));
  const sel = selected == null ? [] : Array.isArray(selected) ? selected : [selected];
  const hasSel = sel.length > 0;
  const isOn = (key: string) => !hasSel || sel.includes(key);
  const total = items.reduce((a, b) => a + fin(b.value), 0);
  /** Ганц ангилал (бусад нь 0) — бүтэн тойрог */
  const fullOne = items.filter((it) => fin(it.value) > 0).length === 1;

  // Зүсмэг бүрийн ЭХЛЭХ байрлал — өмнөх зүсмэгүүдийн нийлбэр
  const slices = items.reduce<((typeof items)[number] & { frac: number; offset: number })[]>((a, it) => {
    const frac = total > 0 ? fin(it.value) / total : 0;
    const prev = a[a.length - 1];
    a.push({ ...it, frac, offset: prev ? prev.offset + prev.frac : 0 });
    return a;
  }, []);

  /* ⚠️ JSX `center`-ийг ТЕКСТ болгоно (`nodeText`) — `String()` нь «[object Object]». */
  const centerText = center == null ? autoNum(total) : nodeText(center) || autoNum(total);
  /* ⚠️ 2026-10-23: Environment — голын шошго анхдагчаар «НИЙТ» (нийлбэр харуулж буй үед л;
     дуудагчийн `center` нь хувь г.м. өөр утга байж болох тул тэр үед шошгогүй). */
  const ctrLbl = centerLabel ?? (center == null ? tr('НИЙТ') : undefined);
  /**
   * ТАЙЛБАРЫН ХУВЬ — их үлдэгдлийн арга (largest remainder), хувиуд нийлээд ЯГ 100.
   * ⚠️ 2026-10-09: урьд нь зүсмэг бүрийг тусад нь `toFixed(0)` — 33.3·33.3·33.3 нь «33+33+33 = 99%»,
   *    16.5·16.5·67 нь «17+17+67 = 101%» гэж уншигддаг байв.
   * ⚠️ 2026-10-09 (аудит №6): арга нь `chartStyle.roundPctsTo100` болж НЭГ эх — aria тойм ч үүгээр.
   * ⚠️ 2026-10-23: Environment `PieChart` — НЭГ оронтой («33.4%»), нийлбэр нь ЯГ 100.0 хэвээр
   *    (`roundPctsTo100(…, 1)`); 0 биш боловч 0.0 болсон зүсмэг «<0.1%».
   */
  const pcts = roundPctsTo100(slices.map((sl) => fin(sl.value)), total, 1);
  const legendPct = (i: number) => (slices[i].frac > 0 && pcts[i] === 0 ? '<0.1%' : `${pcts[i].toFixed(1)}%`);
  /**
   * Зүсмэгийн tooltip-ийн утга.
   *
   * ⚠️ 2026-09-25: урьд нь ҮРГЭЛЖ түүхий `value` («20162536361 · 12%») —
   *    дуудагчийн форматласан `display` (`mnt`, «{0} км · …») үл тоогддог байв.
   *    `display` нь өөрөө хувь агуулсан бол («12.3% · …», «34% · 5 талбар»)
   *    хувийг ДАВХАР залгахгүй.
   */
  const dispText = (sl: { display?: ReactNode }) => (sl.display == null ? '' : nodeText(sl.display));
  const tipValue = (i: number) => {
    const d = dispText(slices[i]);
    if (!d) return `${autoNum(slices[i].value)} · ${legendPct(i)}`;
    return d.includes('%') ? d : `${d} · ${legendPct(i)}`;
  };
  /** Уугуул `title` — «нэр · утга · хувь» + шүүх заавар (2026-10-23: custom tooltip-ийн оронд) */
  const titleOf = (i: number) =>
    tipTitle(tr(slices[i].label), tipValue(i), onSelect ? tr('Дарж газрын зурагт шүүнэ') : undefined);

  /**
   * Дэлгэц уншигчид зориулсан товч тойм — эхний 3 зүсмэг.
   * ⚠️ Урьд нь `<svg>` дээр `role`/`aria-label` огт байгаагүй тул диаграм нь
   * туслах технологид ЯМАР Ч утга дамжуулдаггүй байв.
   */
  const ariaSummary =
    tr('Дугуй диаграм. Нийт {0}{1}. ', centerText, centerLabel ? ` ${centerLabel}` : '') +
    slices
      .slice(0, 3)
      /* ⚠️ 2026-10-09 (аудит №6): тайлбартай ЯГ ижил тоо (`legendPct`) — тусдаа `toFixed(0)` биш */
      .map((sl, i) => `${tr(sl.label)} ${legendPct(i)}`)
      .join(', ') +
    (items.length > 3 ? tr(', бусад {0} ангилал.', items.length - 3) : '.');

  /* ⚠️ 2026-10-23: Environment `PieChart` — нийт ≤ 0 бол «0» цагираг БИШ, `.chart-empty` */
  if (!items.length || !(total > 0)) return <Empty label={tr('Үзүүлэлт байхгүй')} />;

  /**
   * ЗҮСМЭГҮҮД — доор нь бүтэн `--chart-track` бөгж (Environment `paper-hi`), дээр нь дүүргэлттэй
   * зүсмэгүүд. Энгийн ба leader горим ХОЁУЛАА энийг зурна.
   * ⚠️ 2026-10-23: Environment — hover эффект/transition БАЙХГҮЙ; сонголтоор бусад нь .12.
   */
  const arcs = (cx: number, cy: number) => {
    const mid = (ro + ri) / 2;
    const one = fullOne ? slices.findIndex((sl) => sl.frac > 0) : -1;
    return (
      <>
        <circle className={s.donutTrack} cx={cx} cy={cy} r={mid} strokeWidth={ro - ri} />
        {one >= 0 ? (
          <circle
            cx={cx}
            cy={cy}
            r={mid}
            strokeWidth={ro - ri}
            style={{
              fill: 'none',
              stroke: slices[one].color,
              strokeOpacity: isOn(slices[one].key) ? explicitOp : 0.15,
              ...(onSelect ? { cursor: 'pointer' } : null),
            }}
            onClick={onSelect ? () => onSelect(slices[one].key) : undefined}
          >
            <title>{titleOf(one)}</title>
          </circle>
        ) : slices.map((sl, i) => (sl.frac > 0 ? (
          <path
            key={sl.key}
            d={donutSector(cx, cy, ro, ri, sl.offset, sl.offset + sl.frac)}
            style={{
              fill: sl.color,
              fillOpacity: isOn(sl.key) ? sl.op : CHART.dimFill,
              stroke: 'var(--surface)',
              strokeWidth: CHART.donutGap,
              ...(onSelect ? { cursor: 'pointer' } : null),
            }}
            onClick={onSelect ? () => onSelect(sl.key) : undefined}
          >
            <title>{titleOf(i)}</title>
          </path>
        ) : null))}
      </>
    );
  };

  /**
   * ГОЛЫН БИЧВЭР — Environment `PieChart`: дээр «НИЙТ» (size × .08, ink-3), доор нийт (tabular,
   * 600, min(size × .18, нүхэнд багтах)). Байрлал нь 112px-ийн −6 / +14-ийг хэмжээгээр нь сунгана.
   * ⚠️ 2026-10-09 (лавлах CRM загвар): шошго ДЭЭР, утга ДООР — хэвээр.
   */
  const centerSvg = (cx: number, cy: number) => {
    const k = size / 112;
    const fs = Math.min(size * 0.18, (ri * 2 - 8) / Math.max(centerText.length * 0.64, 1));
    return (
      <>
        {ctrLbl && (
          <text x={cx} y={cy - 6 * k} textAnchor="middle" className={s.donutCtrLbl} fontSize={Math.max(8, size * 0.08)}>
            {ctrLbl}
          </text>
        )}
        <text
          x={cx}
          y={ctrLbl ? cy + 14 * k : cy + fs * 0.35}
          textAnchor="middle"
          className={`${s.donutCtrVal} num`}
          fontSize={fs}
        >
          {centerText}
        </text>
      </>
    );
  };

  /**
   * LEADER горим — тайлбарыг доор жагсаахын оронд зүсмэг бүрээс зураас татаж
   * пайн диаграмын гадна шошгыг бичнэ. Цөөн зүсмэгтэй (2–4) диаграмд тохиромжтой.
   */
  if (leaders) {
    const cx = half;
    const cy = half;
    const Ro = ro; // зүсмэгийн ГАДНА радиус
    const GAP = 16; // зурааснаас шошго хүртэл
    const PAD = 106; // хажуугийн шошгын зай — vbW нь ~панелд багтаж, масштаб ≈ 1
    const PADY = 70; // босоо зай (дээд/доод зүсмэгийн шошгонд)
    const GUTTER = 6; // зураас ба текстийн хоорондын зай
    const LW = PAD - GAP - GUTTER - 2; // шошгын хайрцгийн өргөн — бүтэн үг багтаана
    const vbW = size + PAD * 2;
    const vbH = size + PADY * 2;

    /*
     * ── ШОШГЫН ДАВХЦАЛЫГ ТАРААХ ─────────────────────────────────────────
     * ⚠️ Шошго бүр зүсмэгийнхээ ДУНД ӨНЦГИЙН өндөрт тавигддаг байв. Хоёр
     *    зүсмэг өнцгөөрөө ойрхон (жижиг хувьтай хөрш зүсмэгүүд) бол шошго
     *    нь бие бие дээрээ бичигдэж, аль аль нь уншигдахгүй болно.
     *
     *    Засвар: тал бүрийг (баруун/зүүн) дээрээс доош эрэмбэлж, хөрш
     *    хоёрын хооронд `MIN_GAP` зайг АЛБАДНА. Зураас нь зүсмэгээсээ
     *    шилжсэн шошго руу татагдсаар үлдэх тул холбоо алдагдахгүй.
     */
    const MIN_GAP = 26;
    const laid = slices.map((sl, i) => {
      const mid = sl.offset + sl.frac / 2;
      const th = mid * 2 * Math.PI;
      const sin = Math.sin(th);
      const cos = Math.cos(th);
      const right = sin >= 0;
      return {
        sl,
        i,
        sx: cx + Ro * sin,
        sy: cy - Ro * cos,
        ex: cx + (Ro + 12) * sin,
        ey: cy - (Ro + 12) * cos,
        right,
        lx: right ? cx + Ro + GAP : cx - Ro - GAP,
      };
    });
    ([true, false] as const).forEach((side) => {
      const col = laid.filter((x) => x.right === side).sort((a, b) => a.ey - b.ey);
      for (let i = 1; i < col.length; i += 1) {
        const need = col[i - 1].ey + MIN_GAP;
        if (col[i].ey < need) col[i].ey = need;
      }
      /* Доод ирмэгээс халисан бол БҮГДИЙГ дээш нь шилжүүлнэ */
      const over = col.length ? col[col.length - 1].ey - (vbH - PADY - 8) : 0;
      if (over > 0) col.forEach((x) => { x.ey -= over; });
    });
    return (
      <div className={s.donutLead}>
        {/* ⚠️ 2026-09-25 аудит: шүүлттэй (`onSelect`) үед `role="img"` БИШ — img нь
            хүүхдүүдийг хүртээмжийн модноос нууж, доорх шошгон товчууд уншигдахгүй. */}
        <svg
          width={vbW}
          height={vbH}
          viewBox={`${-PAD} ${-PADY} ${vbW} ${vbH}`}
          role={onSelect ? 'group' : 'img'}
          aria-label={ariaSummary}
        >
          <g>{arcs(cx, cy)}</g>
          {centerSvg(cx, cy)}
          {/* Зураас + гадна БҮТЭН шошго (foreignObject — HTML мөр даруулна) */}
          {laid.map(({ sl, i, sx, sy, ex, ey, right, lx }) => {
            // Текст зурааснаас GUTTER-ийн зайд — давхацахгүй
            const boxX = right ? lx + GUTTER : -PAD + 2;
            const pctLbl = sl.display ?? legendPct(i);
            const on = sel.includes(sl.key);
            const boxStyle: CSSProperties = { textAlign: right ? 'left' : 'right', fontWeight: on ? 600 : undefined };
            return (
              <g
                key={sl.key}
                opacity={isOn(sl.key) ? 1 : CHART.dim}
                style={onSelect ? { cursor: 'pointer' } : undefined}
                onClick={onSelect ? () => onSelect(sl.key) : undefined}
              >
                {/* ⚠️ Будаг нь `style`-аар — SVG-ийн presentation ШИНЖ дотор
                    `var(--cN)` задардаггүй тул токен палитр ажиллахгүй байв. */}
                <polyline
                  points={`${sx},${sy} ${ex},${ey} ${lx},${ey}`}
                  strokeWidth={1}
                  style={{ fill: 'none', stroke: sl.color, strokeOpacity: sl.op }}
                />
                <circle cx={lx} cy={ey} r={1.6} style={{ fill: sl.color, fillOpacity: sl.op }} />
                <foreignObject x={boxX} y={ey - 30} width={LW} height={60}>
                  {onSelect ? (
                    /* ⚠️ 2026-09-25 аудит: шошго нь ТОВЧ — урьд нь зөвхөн `<g onClick>`
                       тул гараар (Tab/Enter) шүүх аргагүй байв. `onClick` БАЙХГҮЙ:
                       товшилт/Enter нь дээрх `<g>`-ийн onClick руу хөөрч НЭГ л удаа
                       сонгоно (давхар дуудвал сонголт буцаж унтарна). */
                    <button
                      type="button"
                      className={s.donutLeadBox}
                      aria-pressed={on}
                      title={titleOf(i)}
                      style={{
                        ...boxStyle,
                        display: 'block', width: '100%', background: 'none', border: 0, padding: 0,
                        font: 'inherit', color: 'inherit', cursor: 'pointer',
                      }}
                    >
                      <span className={s.donutLeadName}>{tr(sl.label)}</span>{' '}
                      <b className={s.donutLeadPct}>{pctLbl}</b>
                    </button>
                  ) : (
                    <div className={s.donutLeadBox} style={boxStyle} title={titleOf(i)}>
                      <span className={s.donutLeadName}>{tr(sl.label)}</span>{' '}
                      <b className={s.donutLeadPct}>{pctLbl}</b>
                    </div>
                  )}
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  return (
    <div className={`${s.donutWrap} ${nowrap ? s.donutRow : ''} ${stack ? s.donutStack : ''}`}>
      {/* ⚠️ 2026-10-23: Environment — viewBox нь ЯГ `size` (гадаад R = size/2 − 4 тул 2px зах нь
          хүрээнд багтана; урьдын `EDGE_PAD` өргөтгөл хэрэггүй). */}
      <svg
        className={s.donutRing}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaSummary}
      >
        {arcs(half, half)}
        {centerSvg(half, half)}
      </svg>

      {/* ⚠️ 2026-10-23: Environment `.donut-legend-item` — мөр бүр `7px | нэр | утга | хувь` (4 багана) */}
      <ul className={s.donutLegend} data-ui="donut-legend">
        {slices.map((sl, i) => {
          const on = sel.includes(sl.key);
          const d = dispText(sl);
          const body = (
            <>
              {/* ⚠️ 2026-10-23: Environment `donut-legend-swatch` — 7px, 2px булантай ЦУЛ тэмдэг,
                  зүсмэгтэйгээ ИЖИЛ тунгалагтай (`sl.op`). */}
              <span className={s.legendSwatch} style={{ background: sl.color, opacity: sl.op }} />
              <span className={s.donutName} data-ui="donut-name">{tr(sl.label)}</span>
              {/**
                * ⚠️ `toFixed(0)` ганцаараа ХУДАЛ уншигдана: 3,947-гийн 14 нь
                * 0.35% тул «0%» болж, зүсмэг нь диаграм дээр харагдсаар атлаа
                * «юу ч биш» гэж бичигддэг байлаа. Бага БОЛОВЧ 0 биш утгыг «<0.1%».
                * ⚠️ Дуудагчийн өгсөн `display` нь үргэлж давамгайлна (утгын баганад); хувь
                *    агуулсан бол хувийн багана хоосон — давхардахгүй.
                */}
              <b className={`${s.donutVal} num`}>{sl.display ?? autoNum(sl.value)}</b>
              <span className={`${s.donutPct} num`}>{d.includes('%') ? '' : legendPct(i)}</span>
            </>
          );
          const st = { opacity: isOn(sl.key) ? 1 : CHART.dim };
          return onSelect ? (
            <li key={sl.key}>
              <button
                type="button"
                aria-pressed={on}
                className={`${s.donutItem} ${s.donutClick} ${on ? s.donutOn : ''}`}
                style={st}
                title={titleOf(i)}
                onClick={() => onSelect(sl.key)}
              >
                {body}
              </button>
            </li>
          ) : (
            <li key={sl.key} className={s.donutItem} style={st} title={titleOf(i)}>
              {body}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Цуваа график (series) ── */

/**
 * Босоо баганан цуваа — ангилал/хугацааны цувааг харьцуулна.
 *
 * ⚠️ `Bars`-аас ялгаатай: `Bars` нь ХЭВТЭЭ, урт нэртэй ангилалд тохирно.
 * `Series` нь БОСОО, цөөн тэмдэгттэй шошготой (он, давхар, эгнээ) цувааг
 * дүрсний хэлбэрээр нь уншуулна — өсөлт/бууралтын хэв маяг шууд харагдана.
 *
 * ⚠️ 2026-10-23: Environment — баганын горим = `BarChart`, муруйн горим (`line`) = `AreaChart`
 *    (`charts.tsx`, `workspace.css` `.bar-chart-*`). Тайлбар нь «Series»-ийн JSDoc-д.
 */
/**
 * ⚠️ 2026-10-09 (графикийн жигдрэл): энд байсан Catmull-Rom `smoothPath` ХАСАГДАВ —
 *    хуримтлагдсан цуваанд цэг хооронд хэтэрдэг (overshoot) байсан. Бүх муруй
 *    `chartStyle.lineSegments` (монотон, null дээр тасардаг) ашиглана.
 */

/**
 * СОНГОЛТЫН ТУСЛАХ — ганц утга ба МАССИВ хоёуланг зөвшөөрнө (2026-09-15,
 * ХАБЭА-гийн ArcGIS маягийн олон сонголт). `Bars`/`Donut` аль хэдийн
 * массив хүлээн авдаг байсан; `Series` л ганц утгатай үлдсэн байв.
 * ⚠️ Хуучин ганц утгатай дуудлагууд ӨӨРЧЛӨГДӨХГҮЙ ажиллана.
 */
const selAny = (sel: string | readonly string[] | null | undefined): boolean =>
  sel != null && (typeof sel === 'string' || sel.length > 0);
const selHas = (sel: string | readonly string[] | null | undefined, key: string): boolean =>
  sel != null && (typeof sel === 'string' ? sel === key : sel.includes(key));

/** Хэмжигдсэн эсэх — `null`/NaN нь ЦООРХОЙ (0 биш) */
const isNum = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/**
 * Талбайн градиент — `top → CHART.areaBottom` (анхдагч `CHART.areaTop`, ганц цуваа).
 * ⚠️ Өнгө нь `style`-аар: SVG presentation ШИНЖ (`stopColor="var(…)"`) дотор
 *    `var()` найдвартай задардаггүй (format.ts-ийн `cat()` тайлбар).
 * ⚠️ `gradientUnits="userSpaceOnUse"` — `preserveAspectRatio="none"` сунгалттай
 *    хослоход градиентийн тэнхлэг гажихгүй. `h` нь viewBox-ийн өндөр.
 * ⚠️ 2026-10-23: Environment `AreaChart` — .22 → .02 (олон цуваа `CHART.areaMultiTop`).
 */
function AreaGrad({ id, top = CHART.areaTop, h = 100 }: { id: string; top?: number; h?: number }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2={h} gradientUnits="userSpaceOnUse">
        <stop offset="0%" style={{ stopColor: 'var(--tone, var(--data))', stopOpacity: top }} />
        <stop offset="100%" style={{ stopColor: 'var(--tone, var(--data))', stopOpacity: CHART.areaBottom }} />
      </linearGradient>
    </defs>
  );
}

/* ⚠️ 2026-10-23: Environment — шугамын гэрэлтэлт (`LINE_GLOW` = `glow()` filter + `chartGlow`
   класс) ХАСАГДСАН: шугам нь 2px цул, градиент талбай .22 → .02 (`CHART.areaTop/areaBottom`). */

/**
 * ЦЭГИЙН ТУНГАЛАГ — Environment `AreaChart`: идэвхтэй (hover/сонгосон) цэггүй үед бүгд .5,
 * идэвхтэй нь 1, бусад .15 (томруулахгүй). Ганц цэгтэй хэсэг (`solo`) нь шугамгүй тул идэвхгүй
 * үед ч 1 — эс бөгөөс тэр хэмжилт бараг үл үзэгдэнэ.
 */
const dotOp = (i: number, active: number, solo: boolean): number =>
  (active < 0 ? (solo ? 1 : 0.5) : active === i ? 1 : 0.15);

/**
 * ЦЭГИЙН УТГЫН ШОШГЫГ СИЙРЭГЖҮҮЛЭХ — Environment `AreaChart labels`: эхний ба сүүлчийнх ҮРГЭЛЖ,
 * завсрынх нь `MIN` хувийн зайгаар (сүүлчийнхтэй мөргөлдөх завсрынхыг алгасна).
 * ⚠️ 2026-10-23: Environment-д `MIN` нь 11% тогтмол (~300px карт ≈ 34px). Сэлбэд муруй хэвтээ
 *    гүйдэг (Habea `dayScroll`, Trend `visible`) тул хувь нь БОДИТ өргөнөөс: 34px ÷ өргөн —
 *    өргөн хэмжигдээгүй бол 11%. Дунд цэгүүдийн утга хэвээр харагдана (CLAUDE.md-ийн дүрэм).
 */
function labelKeep(n: number, widthPx: number): (i: number) => boolean {
  if (n < 2) return () => true;
  const last = n - 1;
  const GAP = 100 / last;
  const MIN = widthPx > 0 ? (34 / widthPx) * 100 : 11;
  const step = Math.max(1, Math.ceil(MIN / GAP));
  return (i) => {
    if (i === 0 || i === last) return true;
    if (i % step !== 0) return false;
    return (last - i) * GAP >= MIN;
  };
}

/** Олон муруйн нэг шугам — `Series.lines` */
export type SeriesLineDef = {
  key: string;
  label: string;
  color: string;
  /** `items`-тэй ИЖИЛ урт, ижил дараалал. `null` = тэр үед хэмжилтгүй (цоорхой). */
  values: (number | null)[];
};

/** 10px Inter — тоо/үсгийн дундаж өргөн (px) */
const SER_CH = 5.6;

export function Series({
  items,
  color,
  height: heightIn,
  unit,
  grow = false,
  selected,
  onSelect,
  showValues,
  outline = false,
  line = false,
  lines,
}: {
  /**
   * ⚠️ 2026-10-09: `value: null` = МЭДЭЭЛЭЛГҮЙ — багана ЗУРАГДАХГҮЙ (цоорхой), муруй
   *    тасарна. `color` — тухайн баганын өнгө (`color` prop-ыг дарна; AgentChart).
   * ⚠️ 2026-10-23: Environment `BarChart` — 0 нь ТЭГ өндөр (урьдын 1.5% «stub» хасагдсан);
   *    утга нь баганын дээр «0» гэж бичигдэх тул өгөгдөлгүйтэй андуурагдахгүй. Шошго нуугдсан (>8 багана) үед
   *    ч 2px суурь зураастай (баганын ⚠️).
   */
  items: { key: string; label: string; value: number | null; display?: string; color?: string }[];
  color?: string;
  /**
   * Талбайн өндөр (px). ⚠️ 2026-10-23: Environment-ийн анхдагч — багана 130, муруй 96.
   */
  height?: number;
  unit?: string;
  /**
   * Картын үлдсэн зайг дүүргэнэ (⚠️ 2026-10-23: Environment `BarChart fill` / `AreaChart fill`):
   * баганын горимд тэнхлэггүй, утга оройд (12.5/600), `height` нь ХАМГИЙН БАГА өндөр;
   * муруйн горимд доод хязгаар 72px. Эцэг нь `Section fill` (эсвэл өөр босоо flex) байх ёстой.
   */
  grow?: boolean;
  /** Сонгосон баганын key — идэвхтэй бол бусад нь бүдгэрнэ */
  selected?: string | readonly string[] | null;
  /** Багана дарахад — байвал цуваа шүүлтийн удирдлага болно */
  onSelect?: (key: string) => void;
  /**
   * Багана/цэг бүрийн утгыг БАЙНГА бичих.
   * ⚠️ 2026-10-23: Environment `BarChart labels` — өгөөгүй бол 8 ба түүнээс цөөн баганатай үед
   *    АНХНААСАА харагдана; муруйн горимд өгөөгүй бол бичихгүй (`AreaChart labels = false`),
   *    бичихдээ давхцахгүйгээр сийрэгжүүлнэ (`labelKeep`).
   */
  showValues?: boolean;
  /** Багана нь бүтэн дүүргэлтгүй — зах нь бүтэн өнгө, дотор нь бүдэг */
  outline?: boolean;
  /**
   * Баганын оронд ЗӨӨЛӨН МУРУЙ (талбайн градиент + цэг) — Environment `AreaChart`.
   * ⚠️ 2026-10-23: Environment — цэгийн x = i/(n−1) ИРМЭГЭЭС ИРМЭГ; тэнхлэгийн шошго нь
   *    цэгийнхээ ЯГ доор (абсолют байрлал) — урьдын «баганын төв (i+0.5)/n» дүрмийн зорилго
   *    (шошго ↔ цэг нэг босоо тэнхлэгт) хэвээр.
   */
  line?: boolean;
  /**
   * ОЛОН МУРУЙ (2026-10-06) — `line`-тай хамт. Өгвөл `items[].value`-ийн НЭГ
   * муруйн оронд эдгээр муруйг ижил тэнхлэгт зурна; `items` нь тэнхлэг, шошго,
   * дарах талбай хэвээр. Хоосон/өгөөгүй бол ердийн нэг муруй.
   */
  lines?: SeriesLineDef[] | null;
  /**
   * ⚠️ 2026-10-23: Environment — «Дээд: X» pill ХАСАГДСАН (Environment-д байхгүй). Хуучин
   *    дуудагчид эвдрэхгүйн тулд төрөлд үлдэв; нөлөөгүй.
   */
  showMax?: boolean;
}) {
  const multi = line && !!lines && lines.length > 0;
  const height = heightIn ?? (line ? 96 : 130);
  const n = items.length;
  /** Заасан (hover/фокус) цэг/багана */
  const [hov, setHov] = useState<number | null>(null);
  const [tipRect, setTipRect] = useState<PlotRect | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [ticksRef, ticksW] = useWidth<HTMLDivElement>();
  const gid = `seriesArea${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  /**
   * ⚠️ 2026-10-09: МУРУЙН горимд ROVING TABINDEX — `Trend`-тэй ижил: график НЭГ
   *    Tab-стоптой (анхдаа сүүлийн цэг), цэг хооронд ←→ Home End.
   */
  const [act, setAct] = useState<number | null>(null);
  const hovIdx = hov != null && hov < n ? hov : null;
  const actIdx = act != null && act < n ? act : n - 1;

  /**
   * Tooltip/title-ийн УТГЫН бичвэр — нэгжийг `display` өөрөө агуулаагүй үед л залгана.
   * ⚠️ 2026-09-25: «61.1% / төл. 70.0% %», «5 багц багц» гэж давхардаж байв. Habea-ийн
   *    `display: num(v)` (нэгжгүй) нь «25 ажилтан» хэвээр.
   * ⚠️ Олон муруйд шугам бүрийн утгыг жагсаана («Монгол 1,200 · Гадаад 180»).
   */
  const valueOf = (idx: number): string => {
    const it = items[idx];
    const disp = multi
      ? lines!.map((l) => `${l.label} ${autoNum(l.values[idx])}`).join(' · ')
      : it.display ?? autoNum(it.value);
    return unit && !multi && isNum(it.value) && !disp.includes(unit) ? `${disp} ${unit}` : disp;
  };

  const measured = multi ? lines!.some((l) => l.values.some(isNum)) : items.some((it) => isNum(it.value));
  /* ⚠️ 2026-10-23: Environment — өгөгдөлгүй үед `.chart-empty` («Үзүүлэлт байхгүй») */
  if (!n || !measured) return <Empty label={tr('Үзүүлэлт байхгүй')} />;

  /** Шошго ТАЙРАГДАХ эсэх — `need` px-ийг нэг нүдэнд ноогдох өргөнтэй харьцуулна */
  const strideFor = (need: number, gapPx: number) => {
    const per = ticksW > 0 ? (ticksW - gapPx * (n - 1)) / n : 0;
    return per > 0 ? Math.max(1, Math.ceil(need / per)) : 1;
  };
  const maxLen = Math.max(...items.map((i) => tr(i.label).length));

  /* ══════════ МУРУЙН ГОРИМ — Environment `AreaChart` ══════════ */
  if (line) {
    const H = height;
    /* ⚠️ 2026-10-23: муруйн горимд Y тэнхлэг · толгойн тоо ХАСАГДСАН тул утгын шошго АНХДАГЧААР асаалттай (`labelKeep` давхцлыг
       сийрүүлнэ) — урьд нь `showValues` дамжуулаагүй бүх дуудагч (Dashboard · BuildingPanel · Ersdel · AgentChart) тоогүй муруй
       зурж, утга зөвхөн хулганы hover-т гардаг байв (мэдрэгч дэлгэц · хэвлэл · Word-д огт үгүй). Нүцгэн муруй хэрэгтэй бол
       `showValues={false}`. */
    const sv = showValues ?? true;
    const pad = sv ? 15 : 3;
    const allVals = (multi ? lines!.flatMap((l) => l.values) : items.map((it) => it.value)).filter(isNum);
    const max = Math.max(1, ...allVals);
    const px = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
    const py = (v: number) => pad + (1 - v / max) * (H - pad);
    const selIdx = selAny(selected) ? items.findIndex((it) => selHas(selected, it.key)) : -1;
    const active = hovIdx ?? selIdx;
    const defs: SeriesLineDef[] = multi
      ? lines!
      : [{ key: '_', label: '', color: color ?? 'var(--data)', values: items.map((it) => it.value) }];
    const keep = labelKeep(n, ticksW);
    /*
     * X ШОШГО — Environment: БҮГД, 10px tabular ink-3 (идэвхтэй нь ink); олон (n > 8), урт (≥ 4
     * тэмдэгт) шошго 8-аас олон бол −60° хазайна. ⚠️ Сэлбэгийн 2026-08-20-ны дүрэм хэвээр: хазайсан
     * ч багтахгүй (өдөр тутмын урт цуваа) бол ТАЙРАХГҮЙ, сүүлчийнхээс хойш тоолж ЦӨӨЛНӨ.
     */
    const tiltWanted = n > 8 && items.some((it) => tr(it.label).length >= 4);
    const strideFlat = strideFor(maxLen * SER_CH + 8, 0);
    const strideTilt = strideFor(maxLen * SER_CH * 0.5 + 6, 0);
    const stride = tiltWanted ? strideTilt : strideFlat;
    const shownCount = items.filter((_, i) => (n - 1 - i) % stride === 0).length;
    const tilt = tiltWanted && shownCount > 8;
    const strideUse = tilt ? strideTilt : strideFlat;

    const nav = (e: React.KeyboardEvent<HTMLDivElement>) => {
      let next = -1;
      if (e.key === 'ArrowLeft') next = Math.max(0, actIdx - 1);
      else if (e.key === 'ArrowRight') next = Math.min(n - 1, actIdx + 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = n - 1;
      if (next < 0 || next === actIdx) return;
      e.preventDefault();
      e.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > button')[next]?.focus({ preventScroll: true });
    };
    const enter = (i: number) => { setHov(i); setTipRect(rectOf(plotRef.current)); };
    const leave = (i: number) => setHov((h) => (h === i ? null : h));

    /* Hover самбар — ганц муруйд эзлэх хувь ба өмнөхөөс өөрчлөлт (Environment `Tooltip`) */
    let tip: ReactNode = null;
    if (hovIdx != null && tipRect) {
      const it = items[hovIdx];
      const vAt = multi
        ? Math.max(...lines!.map((l) => l.values[hovIdx]).filter(isNum), Number.NEGATIVE_INFINITY)
        : it.value;
      const topPct = isNum(vAt) ? (py(vAt) / H) * 100 : 50;
      const sum = allVals.reduce((a, b) => a + b, 0);
      const prev = hovIdx > 0 ? items[hovIdx - 1].value : null;
      const disp = it.display ?? autoNum(it.value);
      tip = (
        <AreaTip
          rect={tipRect}
          t={px(hovIdx) / 100}
          top={topPct}
          color={multi ? 'var(--ink-3)' : (it.color ?? color ?? 'var(--data)')}
          label={tr(it.label)}
          value={disp}
          unit={unit && isNum(it.value) && !disp.includes(unit) ? unit : undefined}
          rows={multi ? lines!.map((l) => ({ key: l.key, label: l.label, value: autoNum(l.values[hovIdx]), color: l.color })) : undefined}
          share={!multi && isNum(it.value) && sum > 0 ? (it.value / sum) * 100 : null}
          delta={!multi && isNum(it.value) && isNum(prev)
            ? { sign: Math.sign(it.value - prev), text: autoNum(Math.abs(it.value - prev)) }
            : null}
          hint={onSelect ? tr('Дарж шүүнэ') : undefined}
          selected={selHas(selected, it.key)}
        />
      );
    }

    return (
      <div className={`${s.series} ${grow ? s.seriesFill : ''} seriesChart`} style={tone(color)}>
        {(unit || multi) && (
          /* ⚠️ 2026-08-20: Нэгж нь чартын ДЭЭД талд (доор нь сүүлийн баганын нэрийн хоёр дахь
             мөр мэт уншигддаг байв). ⚠️ 2026-10-23: Environment `.chart-unit` — ЗҮҮН, 10px ink-3;
             олон муруйн тайлбар нь Environment-ийн stacked legend (8px дөрвөлжин, 10.5px ink-2). */
          <div className={s.seriesUnit}>
            {multi && lines!.map((l) => (
              <span key={l.key} className={s.seriesLegend}>
                <i style={{ background: l.color }} aria-hidden />{l.label}
              </span>
            ))}
            {unit}
          </div>
        )}
        <div
          ref={plotRef}
          className={s.areaPlot}
          style={grow ? { flex: 1, minHeight: 72 } : { height: H }}
          onMouseLeave={() => setHov(null)}
        >
          <svg className={s.seriesLineSvg} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
            {/* ⚠️ 2026-10-23: Environment — тор [.25 .5 .75 1] × өндөр, БҮГД тасархай `3 4`, Y шошгогүй */}
            {[0.25, 0.5, 0.75, 1].map((r) => (
              <line key={r} className={s.trendGrid} x1={0} x2={100} y1={H * r} y2={H * r} />
            ))}
          </svg>
          {defs.map((ln, li) => {
            const segs = lineSegments(ln.values.map((v, i) => (isNum(v) ? { x: px(i), y: py(v) } : null)));
            return (
              <div key={ln.key} style={{ display: 'contents', ...(multi ? tone(ln.color) : null) }}>
                <svg className={s.seriesLineSvg} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
                  <AreaGrad id={`${gid}${li}`} top={multi ? CHART.areaMultiTop : CHART.areaTop} h={H} />
                  {/* ⚠️ `vector-effect` — `preserveAspectRatio="none"` нь зурагдлыг сунгадаг
                      тул үүнгүй бол шугамын зузаан хэвтээ/босоо чиглэлд өөр болно. */}
                  {segs.filter((sg) => !sg.single).map((sg) => (
                    <Fragment key={sg.from}>
                      <path d={areaPath(sg, H)} style={{ fill: `url(#${gid}${li})` }} />
                      <path className={s.seriesLinePath} d={sg.d} />
                    </Fragment>
                  ))}
                </svg>
                {/* ⚠️ 2026-10-23: Environment — цэг HTML 5px + 2px `--surface` цагираг (SVG-ийн
                    хэвийн бус масштабаас ангид); null цэгт зурахгүй (null ≠ 0). */}
                {segs.flatMap((sg) => sg.pts.map((pt, j) => {
                  const i = sg.from + j;
                  return (
                    <span
                      key={items[i].key}
                      className={s.seriesLineDot}
                      style={{ left: `${pt.x}%`, top: `${(pt.y / H) * 100}%`, opacity: dotOp(i, active, sg.single) }}
                    />
                  );
                }))}
                {sv && ln.values.map((v, i) => {
                  if (!isNum(v) || !keep(i)) return null;
                  const edge = n > 1 && i === 0 ? '0%' : n > 1 && i === n - 1 ? '-100%' : '-50%';
                  return (
                    <span
                      key={items[i].key}
                      className={`${s.seriesLineVal} ${active === i ? s.seriesLineValOn : ''} num`}
                      style={{ left: `${px(i)}%`, top: `${(py(v) / H) * 100}%`, transform: `translate(${edge}, calc(-100% - 6px))` }}
                    >
                      {multi ? autoNum(v) : items[i].display ?? autoNum(v)}
                    </span>
                  );
                })}
              </div>
            );
          })}
          {/* Crosshair — Environment: tone, 1px, `2 2`, .7 */}
          {active >= 0 && (
            <svg className={s.seriesLineSvg} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
              <line className={s.areaCross} x1={px(active)} x2={px(active)} y1={0} y2={H} />
            </svg>
          )}
          {/*
            Товших / hover талбарууд — Environment: бүтэн өндрийн нүднүүд. Шүүлтүүргүй диаграмд ч
            hover самбар гарна (товчийг `disabled` болгохгүй).
            ⚠️ Муруйн горимд багана нь ҮРГЭЛЖ товч — гараар хөтлөх фокусын цэг (roving tabindex).
          */}
          <div className={s.areaHits} onKeyDown={nav}>
            {items.map((it, idx) => (
              <button
                key={it.key}
                type="button"
                className={`${s.areaHit} ${onSelect ? s.areaHitClick : ''}`}
                tabIndex={idx === actIdx ? 0 : -1}
                {...(onSelect ? { 'aria-pressed': selHas(selected, it.key) } : null)}
                aria-label={`${tr(it.label)}: ${valueOf(idx)}`}
                onClick={onSelect ? () => onSelect(it.key) : undefined}
                onMouseEnter={() => enter(idx)}
                onMouseLeave={() => leave(idx)}
                onFocus={() => { setAct(idx); enter(idx); }}
                onBlur={() => leave(idx)}
              />
            ))}
          </div>
        </div>
        <div className={`${s.areaTicks} ${tilt ? s.areaTicksTilt : ''}`} aria-hidden ref={ticksRef}>
          {items.map((it, i) => {
            if ((n - 1 - i) % strideUse !== 0) return null;
            const edge = tilt ? '' : n > 1 && i === 0 ? s.areaTickFirst : n > 1 && i === n - 1 ? s.areaTickLast : '';
            return (
              <span
                key={it.key}
                className={`${s.areaTick} ${edge} ${active === i ? s.areaTickOn : ''} num`}
                style={{ left: `${px(i)}%` }}
              >
                {tr(it.label)}
              </span>
            );
          })}
        </div>
        {tip}
      </div>
    );
  }

  /* ══════════ БАГАНЫН ГОРИМ — Environment `BarChart` ══════════ */
  const max = Math.max(0, ...items.map((it) => (isNum(it.value) ? it.value : 0)));
  const top = max > 0 ? max : 1;
  const showV = showValues ?? n <= 8;
  /* Дээд зай (%) — хамгийн өндөр баганын утгын бичиг багтана (Environment `room`) */
  const room = showV ? Math.min(28, (20 / height) * 100) : 6;
  const scale = (v: number) => Math.max(0, (v / top) * (100 - room));
  const axFmt = (v: number) => tickText(v, Number.isInteger(v) ? 0 : 1);
  const ratios = axFmt(top / 2) === axFmt(0) || axFmt(top / 2) === axFmt(top) ? [0, 1] : [0, 0.5, 1];
  const axLbls = ratios.map((r) => axFmt(top * r));
  /* ⚠️ Environment 34px; урт шошго («2.7 тэрбум») тасрахгүйн тулд хэрэгтэй бол өргөснө */
  const axW = Math.max(34, axisWidth(axLbls));
  const anySel = selAny(selected);
  /**
   * X ШОШГО — Environment: БҮГД, тайрагдвал «…» (бүтэн нь `title`-д).
   * ⚠️ 2026-08-20-ны дүрэм хэвээр: нүдэндээ ОГТ багтахгүй бол (11 сарын «25.09» → «25…»)
   *    тайрахгүй, ЦӨӨЛЖ (сүүлчийнхээс хойш тоолно) хөрш хоосон нүд рүү тэлүүлнэ.
   */
  const stride = strideFor(maxLen * SER_CH + 4, 8);

  return (
    <div className={`${s.series} ${grow ? s.seriesFill : ''} seriesChart`} style={tone(color)}>
      {unit && <div className={s.seriesUnit}>{unit}</div>}
      <div className={s.barLayout} style={grow ? undefined : { gridTemplateColumns: `${axW}px minmax(0, 1fr)` }}>
        {!grow && (
          <div className={s.barAxis} style={{ height }} aria-hidden>
            {ratios.map((r, k) => (
              <span key={r} style={{ bottom: `${r * (100 - room)}%` }} title={axLbls[k]}>{axLbls[k]}</span>
            ))}
          </div>
        )}
        <div className={s.barMain}>
          <div className={s.barPlot} style={grow ? { minHeight: height } : { height }}>
            {[0, 0.25, 0.5, 0.75, 1].map((r) => (
              <span key={r} className={s.gridLine} style={{ bottom: `${r * (100 - room)}%` }} aria-hidden />
            ))}
            <div className={s.barCols}>
              {items.map((it, idx) => {
                const on = selHas(selected, it.key);
                const activeCol = !anySel || on;
                const has = isNum(it.value);
                const h = has ? scale(it.value as number) : 0;
                /* ⚠️ 2026-10-23: Environment — уугуул `title` («нэр · утга» + «Дарж шүүнэ») */
                const title = tipTitle(tr(it.label), valueOf(idx), onSelect ? tr('Дарж шүүнэ') : undefined);
                const colStyle = it.color ? tone(it.color) : undefined;
                /* ⚠️ 2026-10-09: `null` (өгөгдөлгүй) бол багана ОГТ зурахгүй (цоорхой) */
                const inner = has ? (
                  <>
                    <span
                      className={`${s.seriesBar} ${outline ? s.seriesBarOutline : ''}`}
                      /* ⚠️ 2026-10-23: ХЭМЖСЭН 0 — 2px суурь зураас (null нь багана огт зурахгүй). 8-аас олон баганад утгын шошго
                         (`showV`) нуугддаг тул «0»-ийн шошгоор ялгах боломжгүй, 0 ба өгөгдөлгүй адилхан харагддаг байв (null ≠ 0) */
                      style={{ height: h > 0 ? `${h}%` : '2px', opacity: activeCol ? CHART.colOpacity : CHART.colDim }}
                    />
                    {showV && (
                      <span className={`${s.seriesVal} num`} style={{ bottom: `calc(${h}% + 5px)`, opacity: activeCol ? 1 : CHART.dim }}>
                        {it.display ?? autoNum(it.value)}
                      </span>
                    )}
                  </>
                ) : null;
                return onSelect ? (
                  <button
                    key={it.key}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${tr(it.label)}: ${valueOf(idx)}`}
                    className={`${s.seriesCol} ${s.seriesClick}`}
                    style={colStyle}
                    title={title}
                    onClick={() => onSelect(it.key)}
                  >
                    {inner}
                  </button>
                ) : (
                  <div key={it.key} className={s.seriesCol} style={colStyle} title={title}>
                    {inner}
                  </div>
                );
              })}
            </div>
          </div>
          <div className={s.seriesTicks} aria-hidden ref={ticksRef}>
            {items.map((it, i) => {
              // Сүүлчийнхээс хойш тоолсон алхам — хамгийн шинэ үе ҮРГЭЛЖ бичигдэнэ.
              const show = (n - 1 - i) % stride === 0;
              return (
                <span
                  key={it.key}
                  title={tr(it.label)}
                  className={`${s.seriesLabel} ${selHas(selected, it.key) ? s.seriesLabelOn : ''} ${stride > 1 ? s.seriesLabelWide : ''}`}
                >
                  {show ? tr(it.label) : ''}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Сонгогч ── */

/**
 * Жагсаалтаас нэгийг сонгоно.
 *
 * ⚠️ `Tabs` нь 2-4 сонголтод л зохимжтой — 8 багцыг таб болговол самбарын
 * өргөнөөс хальж, мөр дамжина. Уугуул `<select>` нь гар, дэлгэц уншигч,
 * гар утасны төрөлх сонгогчийг үнэгүй авчирна.
 */
export function Select({
  value, onChange, options, label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { key: string; label: string }[];
  label: string;
}) {
  return (
    <select
      className={s.select}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );
}

/* ── Цаг хугацааны муруй ── */

export type TrendPoint = {
  /** Тэнхлэгийн шошго — «2026-07-20» / «2026-07» */
  label: string;
  /**
   * Хэмжсэн утга. `null` = ХЭМЖИГДЭЭГҮЙ — муруй тэнд ТАСАРНА.
   *
   * ⚠️ `null` ≠ 0 (2026-09-15-ны хэрэглээний аудит). Урьд нь энэ талбар
   * `number` байсан тул тайлангүй сар `fin()`-ээр 0 болж, муруй тэг рүү
   * УНАСАН мэт зурагддаг байв — «тайлагнаагүй» ба «огт хийгээгүй» хоёр нэг
   * харагдана. `GeneralDash.Timeline` энэ дүрмийг аль хэдийн зөв хэрэгжүүлсэн.
   */
  value: number | null;
  /** Уншилтын мөрөнд гарах нэмэлт тайлбар — «113 блок» */
  note?: string;
};

/**
 * Нэг цувааны шугаман график — хугацааны явцыг харуулна.
 *
 * ⚠️ `Series` (босоо багана) нь ЦӨӨН, ТУСДАА үеийг харьцуулахад тохирно.
 * Хуримтлагдсан гүйцэтгэл нь ТАСРАЛТГҮЙ хэмжигдэхүүн тул шугамаар л «хэдийд
 * хурдалсан/удаашрсан» нь уншигдана.
 *
 * ⚠️ Цэг бүрд утга БИЧИХГҮЙ — 9-12 тоо давхарлавал аль нь ч уншигдахаа болино.
 * Оронд нь дээрх уншилтын мөр: анхдаа СҮҮЛИЙН утга, хулгана/фокус аваад тухайн
 * цэгийнх. Тэмдэглэгээ нь хөндлөн огтлолын шугамтай — нүд босоо тэнхлэгээ олно.
 */
/**
 * Тэнхлэгийн шошго — цэг бүрийн БОДИТ бүртгэлийн огноо (`note` нь сарын шошгоны
 * доорх жинхэнэ огноо). Он нь ЗӨВХӨН сольсон цэгт бичигдэнэ: «2025-10-31 ·
 * 11-02 · 12-31 · 2026-03-20 …» — 10 гаруй шошго нарийн самбарт ч давхцахгүй.
 */
/**
 * Тэнхлэгийн шошго — ХЭДХЭН цэг дээр л.
 *
 * ⚠️ 2026-08-18: Урьд нь ЦЭГ БҮРД шошго буцаадаг байв. 12 цэгтэй цуваанд тэр
 * зүгээр байсан ч IoT-ийн 90 цэгтэй цуваанд огнооны бичиг бүрэн давхарлаж,
 * тэнхлэг нь уншигдахааргүй бараан зурвас болдог байлаа. Одоо хамгийн ихдээ
 * `MAX_TICKS` ширхгийг тэнцүү алхмаар сонгоно (эхний ба сүүлийнх ЗААВАЛ орно —
 * цувааны хамрах хүрээг тэд хэлнэ), бусад нь хоосон мөр буцаж зурагдахгүй.
 *
 * ⚠️ 2026-08-20: ТООГ хязгаарлах нь ХҮРЭЛЦЭЭГҮЙ байв. `Math.round(i * step)`
 * нь `step < 2` үед ЗЭРГЭЛДЭЭ индексүүдийг сонгодог: 8 цэгтэй цуваанд
 * `step = 1.4` → {0,1,3,4,6,7} буюу 0–1 ба 6–7 хос нь нэг нэгэн дээрээ
 * бичигддэг. Ерөнхий дашбоардын «Гүйцэтгэлийн явц» дээр «2025-10-31» ба
 * «11-02» бүрмөсөн давхарлаж, IoT-ийн 9 чарт дээр тэнхлэг нь бүхэлдээ
 * будлиантай зурвас болж байлаа.
 *
 * Одоо шошгын хоорондох ХАМГИЙН БАГА ЗАЙГ (`TICK_PX`) баталгаажуулна:
 * хэмжсэн өргөнөөс индексийн алхмыг гаргаж, БҮХЭЛ тоон алхмаар түгээнэ —
 * ингэснээр дугуйруулалт зайг богиносгох боломжгүй.
 */
const MAX_TICKS = 6;
/** 10px Inter — тоо/зураас/цэгийн дундаж өргөн (px). Шошго нь `.num` (tabular). */
const LBL_CH = 5.6;
function axisTicks(points: TrendPoint[], width: number): string[] {
  const n = points.length;
  const keep = new Set<number>([0, n - 1]);
  // Хэмжигдээгүй (эхний кадр) эсвэл 2 цэгтэй бол зөвхөн хоёр ирмэг.
  if (n > 2 && width > 0) {
    /**
     * Шошгонд хэрэгтэй зайг ТОГТМОЛ БИШ, БОДИТ уртаас нь гаргана.
     *
     * ⚠️ Тогтмол 62px («2026-07-20») нь IoT-д хүрэлцээгүй байв: тэнд шошго нь
     * «08-13 19:00» (11 тэмдэгт), оны эхний нь «2026-08-13 19:00» (16 тэмдэгт
     * ≈ 100px) хүрдэг тул зэргэлдээ хоёр огноо мөргөлдсөөр байлаа. Хамгийн
     * УРТ хувилбараар хэмжвэл цуваа бүрд өөрийнх нь өргөн хүчинтэй.
     */
    const need = Math.max(...points.map((p) => (p.note ?? p.label).length)) * LBL_CH + 10;
    const perIdx = width / (n - 1); // хоёр хөрш цэгийн хоорондох px
    const stride = Math.max(1, Math.ceil(need / perIdx));
    const t = Math.max(2, Math.min(MAX_TICKS, Math.floor((n - 1) / stride) + 1));
    // ⚠️ БҮХЭЛ алхам (`Math.floor`) — бутархай алхмыг дугуйруулбал зарим хос
    //    хөрш болж, яг хуучин алдаа руугаа буцна.
    const step = Math.max(stride, Math.floor((n - 1) / (t - 1)));
    // ⚠️ `i * step < n - 1` шалгалт ЗААВАЛ: маш нарийн чарт дээр `stride` нь
    //    цэгийн тооноос ч давж болно (`t` нь 2 болж хязгаарлагдана) — тэгвэл
    //    индекс массиваас хальж, тэнхлэгийн ГАДНА (left > 100%) шошго үүснэ.
    for (let i = 1; i < t; i++) if (i * step < n - 1) keep.add(i * step);
    // ⚠️ Сүүлийн шошго ЗААВАЛ ирмэг дээр. Дотоод сүүлчийнх нь түүнтэй хэт
    //    ойрхон бол НЭМЭХГҮЙ, ОРЛУУЛНА — эс бөгөөс баруун захад хоёр огноо
    //    давхарлана (яг «06-04 07-20» болж байсан алдаа).
    const lastTick = (t - 1) * step;
    if (n - 1 - lastTick < stride) keep.delete(lastTick);
    keep.add(n - 1);
  }
  /**
   * Он нь ЗӨВХӨН сольсон шошгонд бичигдэнэ.
   *
   * ⚠️ Оныг ЗУРАГДАХ шошгуудаар л мөшгинө. Урьд нь бүх цэгээр гүйдэг байсан тул
   * он солигдсон цэг нь алгасагдвал «2026» гэсэн тэмдэглэгээ ХАМААГҮЙ алга
   * болж, тэнхлэг дээр он огт харагдахгүй үлддэг байв.
   */
  let year = '';
  const out = points.map(() => '');
  [...keep].sort((a, b) => a - b).forEach((i) => {
    const d = points[i].note ?? points[i].label;
    const y = d.slice(0, 4);
    const full = !/^\d{4}-/.test(d) || y !== year;
    if (full) year = y;
    out[i] = full ? d : d.slice(5);
  });
  return out;
}

/**
 * ЗӨӨЛӨН МУРУЙН ЗАМ — МОНОТОН кубик (Fritsch–Carlson).
 * ⚠️ 2026-10-09: `src/lib/chartStyle.ts` руу ЗӨӨВ (overshoot-ийн тайлбар тэнд). Энд
 *    зөвхөн дахин экспорт — `GeneralDash` зэрэг хуучин импорт эвдрэхгүй.
 *    Шинэ код `chartStyle.lineSegments`-ийг (null дээр тасардаг) хэрэглэнэ.
 */
export { monotonePath };

export function Trend({
  points,
  color,
  height = 132,
  unit = '%',
  fmt,
  visible,
  /* ⚠️ 2026-10-23: анхдагч ON — Y тэнхлэг/толгойн тоо хасагдсан тул (Series муруйн горимын ⚠️) */
  showValues = true,
  alert,
  smooth = false,
}: {
  points: TrendPoint[];
  color?: string;
  height?: number;
  unit?: string;
  /**
   * Утгыг ХЭРХЭН бичих. Анхдагч нь `autoNum` (мянгатын таслал; бүхэл «26», бутархай «26.3»).
   * ⚠️ 2026-09-01 нэмэв: мөнгөн дүн бүтнээр бичигдэх болсон тул
   *    `2660000000000.0` гэж гарахаас сэргийлж `format.mnt`-ийг дамжуулна.
   */
  fmt?: (v: number) => string;
  /**
   * Нэг дэлгэцэнд ХЭДЭН цэг багтах вэ. Заавал бол зурагдах талбар нь
   * хэвтээ гүйдэг болж, тэнхлэгт цэг БҮРИЙН огноо/цаг хоёр мөрөөр гарна.
   * Орхивол хуучин зан хэвээр: бүх цэг өргөнд шахагдаж, тэнхлэгт хамгийн
   * ихдээ `MAX_TICKS` шошго л гарна.
   */
  visible?: number;
  /**
   * Цэг бүрийн утгыг муруйн дээр тоогоор бичих эсэх.
   * ⚠️ 2026-10-23: Environment `AreaChart labels` — 10px/400 ink-2, цэгээс 6px дээр, ирмэгийн
   *    шошго дотогш эгнэнэ, давхцахгүйгээр сийрэгжинэ (`labelKeep` — эхний/сүүлчийнх үргэлж).
   */
  showValues?: boolean;
  /**
   * Анхааруулгын босго — шугам зурж, түүнээс ДЭЭШ гарсан цэгүүдийг улаанаар
   * онцолно. Чиглэл нь үргэлж «дээш» (дуудагч тал утгаа тэр дагуу сонгоно).
   */
  alert?: { value: number; note?: string };
  /**
   * Хугарсан шугамын оронд ЗӨӨЛӨН муруй.
   *
   * ⚠️ Анхдагчаар УНТРААЛТТАЙ байсан: хэмжилтийн цуваанд (өдөр тутмын ажилтан, IoT
   * унших) зөөлрүүлэлт нь ХЭМЖЭЭГҮЙ утгыг цэг хооронд «зурж» өгдөг гэж үзсэн.
   * ⚠️ 2026-10-09 (аудит №3): графикийн жигдрэл (1b49ad1) анхдагчийг `true` болгож дээрх
   *    шийдвэрийг ЭРГҮҮЛСЭН байсныг БУЦААВ — анхдагч `false`. Дуудагчид (Iot, Ersdel-ийн
   *    салхи, BuildingPanel, Dashboard, AgentChart) хэмжилтийн цуваа тул хугарсан шугамд
   *    тулгуурладаг. Зөөлөн муруй хэрэгтэй дуудагч `smooth`-ийг ИЛ дамжуулна (монотон,
   *    `chartStyle.lineSegments` — `null` дээр тасарна).
   * ⚠️ 2026-10-23: Environment `AreaChart` нь ҮРГЭЛЖ монотон муруй — гэвч дээрх өгөгдлийн
   *    үнэнч байдлын шийдвэр (аудит №3) хүчинтэй тул анхдагч `false` ХЭВЭЭР.
   */
  smooth?: boolean;
  /**
   * ⚠️ 2026-10-23: Environment — «Дээд: X» pill ХАСАГДСАН (Environment-д байхгүй). Хуучин
   *    дуудагчид эвдрэхгүйн тулд төрөлд үлдэв; нөлөөгүй.
   */
  showMax?: boolean;
}) {
  const [hov, setHov] = useState<number | null>(null);
  const [tipRect, setTipRect] = useState<PlotRect | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  // Тэнхлэгийн БОДИТ өргөн — хэдэн шошго давхцалгүй багтахыг үүгээр шийднэ.
  const [axisRef, axisW] = useWidth<HTMLDivElement>();
  // ⚠️ Нэг хуудсанд хэд хэдэн Trend байж болно — градиентийн id ДАВТАГДВАЛ
  //    сүүлийнх нь бусдыгаа дардаг (SVG-ийн id нь баримт даяар нэгдмэл).
  //    React 19-ийн `useId` нь CSS/`url(#…)`-д хүчинтэй тэмдэгт л гаргана.
  const gradId = `trendArea${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  /** Утга бичих дүрэм — өгөөгүй бол `autoNum` (мянгатын таслал; бүхэл «26», бутархай «26.3»).
      ⚠️ 2026-10-09 (аудит №6): урьд `toFixed(1)` — AgentChart-ын `line` (fmt-гүй) мөнгөн цуваанд
      «2660000000000.0 ₮» гарч байв; хувийн дуудагчид «26.3%» хэвээр. */
  const fmtV = fmt ?? autoNum;

  // ⚠️ Цуваа солигдоход (grain/хамрах хүрээ) хуучин hov хүчингүй болно — цэгийн
  //    товч unmount болоход React blur/mouseleave өгдөггүй тул энд цэвэрлэнэ.
  /* ⚠️ 2026-09-30: эффект биш, RENDER дунд — цуваа солигдсон тэр render-т hov тэглэгдэнэ. */
  const [hovLen, setHovLen] = useState(points.length);
  if (hovLen !== points.length) {
    setHovLen(points.length);
    setHov(null);
  }

  /**
   * ⚠️ Анхны харагдац нь СҮҮЛИЙН заалт байх ёстой: цаг хугацааны цуваанд
   * хамгийн эхний хайдаг зүйл нь «одоо хэд байна» гэдэг. Гүйлт нь анхдаа
   * зүүн (хамгийн ХУУЧИН) ирмэгээс эхэлдэг тул баруун тийш нь шидэв.
   */
  const scRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [points.length]);

  if (points.length < 2) return <Empty label={tr('Цуваа зурахад хангалттай бүртгэл алга.')} />;
  /* ⚠️ БҮХ цэг хэмжигдээгүй бол хоосон гэж ИЛ хэлнэ (2026-09-15): эс бөгөөс
     тэнхлэг, шошго нь зурагдаад муруй нь байхгүй — «эвдэрсэн» гэж уншигдана. */
  if (!points.some((p) => p.value != null && Number.isFinite(p.value))) {
    return <Empty label={tr('Энэ хугацаанд хэмжилт бүртгэгдээгүй.')} />;
  }

  /**
   * ⚠️ Босгыг оргилын тооцоонд ЗААВАЛ оруулна: өгөгдлөөс ДЭЭГҮҮР босго
   * (жишээ нь 26°C хүрдэг агаарт 28°C-ийн шугам) тэнхлэгээс гарч, шугам нь
   * ОГТ ЗУРАГДАХГҮЙ — хэрэглэгч босго байхгүй гэж эндүүрнэ.
   */
  /* ⚠️ ХЭМЖИГДЭЭГҮЙ цэгийг оргилын тооцоонд ОРУУЛАХГҮЙ — бүгд `null` бол `Math.max` нь
     `-Infinity` өгнө. Тиймээс шүүж аваад хоосон бол 0-ээс эхэлнэ. */
  const meas = points.map((p) => p.value).filter((v): v is number => v != null && Number.isFinite(v));
  const peak = Math.max(...meas, alert ? alert.value : 0, 0);
  /**
   * ⚠️ СӨРӨГ утгын ЁРООЛ (2026-09-25). Урьд нь тэнхлэг ҮРГЭЛЖ 0-ээс эхэлдэг
   * байсан тул −15°C (IoT «Гадна орчны температур», 28°C босготой) нь талбайн
   * доор гарч тайрагддаг байв. Ёроол нь сөрөг утгатай үед л доошилно; бүгд ≥ 0
   * бол 0 хэвээр.
   */
  const low = Math.min(...meas, alert ? alert.value : 0, 0);
  /**
   * ⚠️ 2026-10-23: Environment `AreaChart` — тэнхлэг нь өгөгдлийн ОРГИЛ хүртэл (Y шошгогүй тул
   *    «гоё» алхам/`niceTicks` шаардлагагүй). viewBox нь `0 0 100 height` — босоо нэгж нь
   *    пиксел (дээд зай 3px, утгын шошготой үед 15px).
   */
  const bot = low;
  const top = peak > bot ? peak : bot + 1;
  const H = height;
  const pad = showValues ? 15 : 3;
  const n = points.length;
  const x = (i: number) => (i / (n - 1)) * 100;
  const y = (v: number) => pad + (1 - (fin(v) - bot) / (top - bot)) * (H - pad);
  const yPct = (v: number) => (y(v) / H) * 100;

  /*
   * ⚠️ ТАСРАЛТГҮЙ ХЭСГҮҮД (2026-09-15-ны хэрэглээний аудит). Хэмжигдээгүй
   *    (`null`) цэг дээр муруй ТАСАРНА — нэг `polyline`-аар зурвал тэр цэг 0
   *    болж «гүйцэтгэл тэг рүү унасан» гэсэн ХУДАЛ дүр зураг өгнө.
   * ⚠️ 2026-10-09: хэсэглэлт + гөлгөршүүлэлт нь `chartStyle.lineSegments` — бүх
   *    муруйд НЭГ дүрэм (null дээр тасарна, ганц цэгтэй хэсэг `single`).
   */
  const segs = lineSegments(
    points.map((p, i) => (p.value != null && Number.isFinite(p.value) ? { x: x(i), y: y(p.value) } : null)),
    { smooth },
  );

  /** Цэг нь босгонд ХҮРСЭН/давсан уу */
  /* ⚠️ Хэмжигдээгүй цэг ХЭЗЭЭ Ч босго давсан гэж тооцогдохгүй */
  /* ⚠️ 2026-10-09: `>` → `>=` — `sensors.ts` («Сав ≥80%»), `ceo/iot`, `iot-watch` бүгд `>=`. */
  const over = (v: number | null) => alert != null && v != null && Number.isFinite(v) && v >= alert.value;
  const alertY = alert ? y(alert.value) : 0;

  /**
   * ХЭВТЭЭ ГҮЙЛТ ба ЦЭГ БҮРИЙН ШОШГО — хоёр ТУСДАА шийдэл.
   *
   * ⚠️ `perPoint` (цэг бүрд огноо/цаг хоёр мөрөөр) нь гүйлтээс ХАМААРАХГҮЙ.
   * 2026-08-21-нд эдгээрийг зориуд салгав: урьд нь зөвхөн гүйдэг үед хуваадаг
   * байсан тул 8-аас ЦӨӨН цэгтэй цуваа хуучин замаар явж, «08-13 19:46» гэсэн нэг
   * мөрийн шошгууд нарийн картад давхарладаг байв.
   *
   * ⚠️ `innerW` нь `(n-1)/(visible-1)`, `n/visible` БИШ. `x(i)` нь эцсийн
   * цэгүүдийг ирмэгт тавьдаг тул зэргэлдээ цэгийн зай нь өргөнийг `n-1`-д
   * хуваасан нь.
   */
  const perPoint = visible != null && visible > 1;
  const scroll = perPoint && n > visible;
  const innerW = scroll ? ((n - 1) / (visible - 1)) * 100 : 100;
  // ⚠️ Индексийг ХЯЗГААРЛАНА: дээрх цэвэрлэгээ рендерийн ДАРАА ажилладаг тул
  //    богиноссон цуваан дээр хуучин hov-оор шууд индекслэвэл бүх React мод унана.
  const curIdx = hov != null && hov < n ? hov : n - 1;
  const active = hov != null && hov < n ? hov : -1;

  const xLbls = perPoint ? null : axisTicks(points, axisW);
  /*
   * ⚠️ 2026-10-23: Environment — шошго олон (n > 8), урт (≥ 4 тэмдэгт), зурагдах нь 8-аас олон
   *    бол −60° хазайна. Сэлбэгийн `axisTicks` нь өргөнөөр сийрэгжүүлдэг (≤ `MAX_TICKS`) тул
   *    ихэнхдээ хэвтээ хэвээр.
   */
  const tilt = xLbls != null && n > 8 && xLbls.some((t) => t.length >= 4) && xLbls.filter(Boolean).length > 8;
  const solo = new Set(segs.filter((sg) => sg.single).map((sg) => sg.from));
  const keep = labelKeep(n, axisW);

  /**
   * ⚠️ 2026-08-18: ROVING TABINDEX. Урьд нь цэг бүр Tab-стоп байв — IoT-ийн 90 цэгтэй
   * 9 графикт ~800 Tab-стоп болж байлаа. Одоо график бүр НЭГ л стоптой (идэвхтэй цэг,
   * анхдаа сүүлийнх); цэг хооронд сум/Home/End.
   */
  const nav = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next = -1;
    if (e.key === 'ArrowLeft') next = Math.max(0, curIdx - 1);
    else if (e.key === 'ArrowRight') next = Math.min(n - 1, curIdx + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0 || next === curIdx) return;
    e.preventDefault();
    // focus() нь onFocus-оор setHov-ийг өөрөө дуудна; preventScroll — самбарын
    // гүйлтийг үсэргэхгүй (Tabs-ын ижил болгоомжлол).
    const btn = e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next];
    btn?.focus({ preventScroll: true });
    /**
     * ⚠️ `preventScroll` нь ХӨТЛӨГЧ БҮХ гүйлтийг зогсоодог тул хэвтээ гүйдэг
     * график дээр сум дарахад фокус нь ХАРАГДАХГҮЙ цэг рүү үсэрдэг байв.
     * Тиймээс ЗӨВХӨН энэ графикийн гүйгчийг гараар зөөнө (`scrollIntoView` нь бүх
     * өвөг элементийг гүйлгэдэг тул тэрийг ашиглаж БОЛОХГҮЙ).
     */
    const sc = scRef.current;
    if (!btn || !sc || sc.scrollWidth <= sc.clientWidth) return;
    const b = btn.getBoundingClientRect();
    const c = sc.getBoundingClientRect();
    const PAD = 24; // цэгийн шошго ирмэгт наалдахгүй байх зай
    if (b.left - PAD < c.left) sc.scrollLeft -= c.left - b.left + PAD;
    else if (b.right + PAD > c.right) sc.scrollLeft += b.right - c.right + PAD;
  };
  const enter = (i: number) => { setHov(i); setTipRect(rectOf(plotRef.current)); };
  const leave = (i: number) => setHov((h) => (h === i ? null : h));

  /* ⚠️ 2026-10-23: Environment `Tooltip` — ЦЭГИЙН дэргэд; нэр, утга + нэгж, өмнөх ХЭМЖСЭН цэгээс
     ▲/▼ өөрчлөлт (null ≠ 0 — өмнөх нь хэмжигдээгүй бол гарахгүй), `note` нь тайлбарын мөр.
     Эзлэх хувь (`share`) ГАРГАХГҮЙ: Trend нь хуримтлагдсан %, хэмжилт (°C, м/с), мөнгөн дүнгийн
     цуваа — нийлбэрт эзлэх хувь нь утгагүй (Environment-д тоолсон бүртгэлийн цуваа байсан). */
  let tip: ReactNode = null;
  if (active >= 0 && tipRect) {
    const p = points[active];
    const prev = active > 0 ? points[active - 1].value : null;
    const has = p.value != null && Number.isFinite(p.value);
    tip = (
      <AreaTip
        rect={tipRect}
        t={x(active) / 100}
        top={has ? yPct(p.value as number) : 50}
        color={over(p.value) ? 'var(--bad)' : (color ?? 'var(--data)')}
        label={tr(p.label)}
        value={has ? fmtV(p.value as number) : '—'}
        unit={has ? unit.trim() || undefined : undefined}
        delta={has && prev != null && Number.isFinite(prev)
          ? { sign: Math.sign((p.value as number) - prev), text: fmtV(Math.abs((p.value as number) - prev)) }
          : null}
        hint={p.note}
      />
    );
  }

  return (
    <div className={s.trend} style={tone(color)}>
      {/* ⚠️ 2026-10-23: Environment `AreaChart` — дээрх 17px уншилтын мөр (`trendHead`) ба зүүн
          Y тэнхлэг ХАСАГДСАН; утгыг hover самбар (цэгийн дэргэд) ба `showValues` шошго хэлнэ. */}
      {/* ⚠️ Гүйдэг үед `trendPlot`/`trendAxis` НЭГ дотоод блокод сууна —
          тусад нь гүйлгэвэл шошго нь цэгээсээ салж, өөр өөр байрлалд зогсоно. */}
      <div ref={scRef} className={scroll ? s.trendScroll : undefined}>
        <div style={scroll ? { width: `${innerW}%` } : undefined}>
          {/* ⚠️ 2026-10-23: Environment — `trendPlotHov`: заасан цэгээс бусад нь .15 болж бүдгэрнэ */}
          <div
            ref={plotRef}
            className={`${s.trendPlot} ${active >= 0 ? s.trendPlotHov : ''}`}
            style={{ height }}
            onKeyDown={nav}
          >
            <svg className={s.trendSvg} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
              {/* ⚠️ 2026-10-23: Environment — тор [.25 .5 .75 1] × өндөр, БҮГД тасархай `3 4`
                  (дээд шугамгүй, суурь ч тасархай); муруйн ӨМНӨ тул ард үлдэнэ. */}
              {[0.25, 0.5, 0.75, 1].map((r) => (
                <line key={r} className={s.trendGrid} x1="0" x2="100" y1={H * r} y2={H * r} />
              ))}
              {/**
                * ⚠️ Талбайн бүрхүүл нь ГРАДИЕНТ: шугамын дор өтгөн, суурь тэнхлэг дээр уусна.
                * ⚠️ SVG `fill` тул CSS градиент ажиллахгүй — заавал `<linearGradient>`.
                * ⚠️ `gradientUnits="userSpaceOnUse"` — эс бөгөөс `preserveAspectRatio
                * ="none"` сунгалттай хослоод градиентийн тэнхлэг гажина.
                */}
              <AreaGrad id={gradId} h={H} />
              {/* ⚠️ ХЭСЭГ БҮРИЙГ ТУСАД НЬ (2026-09-15): хэмжигдээгүй цэг дээр муруй тасарна.
                  ⚠️ Талбай нь ШУГАМЫН ЗАМЫГ дагана (`areaPath`) — тусад нь байгуулбал
                  хоёр муруй бага зэрэг зөрж, ирмэг дээр цагаан зурвас гарна.
                  Суурь нь зурагдах талбайн ЁРООЛ (`H` = `bot`), 0-ийн шугам БИШ. */}
              {segs.filter((sg) => !sg.single).map((sg) => (
                <g key={`r${sg.from}`}>
                  <path d={areaPath(sg, H)} style={{ fill: `url(#${gradId})` }} />
                  <path className={s.trendLine} d={sg.d} />
                </g>
              ))}
              {/* Crosshair — Environment: tone, 1px, `2 2`, .7 */}
              {active >= 0 && (
                <line className={s.areaCross} x1={x(active)} x2={x(active)} y1={0} y2={H} />
              )}
              {/* Босгын шугам — муруйн ДЭЭГҮҮР зурагдана (эс бөгөөс градиент дарна) */}
              {alert ? (
                <line className={s.trendThresh} x1="0" y1={alertY} x2="100" y2={alertY} />
              ) : null}
            </svg>

            {/* Босгын тоо — шугамын баруун үзүүрт. `title`-д нь шалтгаан. */}
            {alert ? (
              <span
                className={s.trendThreshTag}
                style={{ top: `${(alertY / H) * 100}%` }}
                title={alert.note ?? ''}
              >
                {/* ⚠️ 2026-10-09 (аудит №6): түүхий `{alert.value}` → `fmtV` — цэг/уншилттай нэг формат */}
                {fmtV(alert.value)}{unit}
              </span>
            ) : null}

            {/* ЦЭГ БҮРИЙН УТГА — Environment `AreaChart labels` (давхцвал алгасна, ирмэгийнх дотогш) */}
            {showValues && points.map((p, i) => {
              if (p.value == null || !Number.isFinite(p.value) || !keep(i)) return null;
              const edge = i === 0 ? '0%' : i === n - 1 ? '-100%' : '-50%';
              return (
                <span
                  key={`v${i}`}
                  className={`${s.trendVal} ${active === i ? s.trendValOn : ''} ${over(p.value) ? s.trendValAlert : ''} num`}
                  style={{ left: `${x(i)}%`, top: `${yPct(p.value)}%`, transform: `translate(${edge}, calc(-100% - 6px))` }}
                >
                  {/* ⚠️ Бүхэл тоог «.0»-гүй бичнэ (`fmtV`, анхдагч `autoNum`) */}
                  {fmtV(p.value)}
                </span>
              );
            })}

            {points.map((p, i) => (
              <button
                /**
                 * ⚠️ 2026-08-18: түлхүүр нь `p.label` БАЙСАН. Шошго нь ДЭЛГЭЦИЙН текст
                 * тул давтагдаж БОЛНО — IoT-ийн «ММ-ДД ЧЧ:мм» шошготой хоёр заалт нэг
                 * минутад ирэхэд React «two children with the same key» алдаа өгдөг байв.
                 */
                key={i}
                type="button"
                tabIndex={curIdx === i ? 0 : -1}
                className={`${s.trendHit} ${active === i ? s.trendHitOn : ''}`}
                style={{ left: `${x(i)}%` }}
                aria-label={`${p.label}: ${p.value == null ? tr('хэмжигдээгүй') : `${fmtV(p.value)}${unit}`}${p.note ? ` · ${p.note}` : ''}`}
                onMouseEnter={() => enter(i)}
                onMouseLeave={() => leave(i)}
                onFocus={() => enter(i)}
                onBlur={() => leave(i)}
              >
                {/* ⚠️ ХЭМЖИГДЭЭГҮЙ цэгэд дүрс ЗУРАХГҮЙ (2026-09-15): «тэг хэмжигдсэн» гэж
                    худал уншигдана. Товч нь хэвээр (hover/фокусаар «—»).
                    ⚠️ 2026-10-23: Environment — 5px цэг бүгд .5, заасан нь 1, бусад .15;
                    `trendDotSolo` (ганц цэгтэй хэсэг) ба `trendDotAlert` онцлог хэвээр. */}
                {p.value != null && (
                  <span
                    className={`${s.trendDot} ${solo.has(i) ? s.trendDotSolo : ''} ${over(p.value) ? s.trendDotAlert : ''}`}
                    style={{ top: `${yPct(p.value)}%` }}
                  />
                )}
              </button>
            ))}
          </div>

          <div
            className={`${s.trendAxis} ${perPoint ? s.trendAxisTwoLine : ''} ${tilt ? s.trendAxisTilt : ''}`}
            ref={axisRef}
          >
            {perPoint
              ? /* Цэг БҮРД шошго — 8 л харагдах тул давхцахгүй. Огноо
                   эхний мөрөнд, цаг нь дараагийн мөрөнд. */
                points.map((p, i) => {
                  const sp = p.label.indexOf(' ');
                  const day = sp < 0 ? p.label : p.label.slice(0, sp);
                  const clock = sp < 0 ? '' : p.label.slice(sp + 1);
                  return (
                    <span key={i} className={`${s.trendAxisTick} ${active === i ? s.trendAxisTickOn : ''}`} style={{ left: `${x(i)}%` }}>
                      <span className={s.trendTickDay}>{day}</span>
                      {clock ? <span className={s.trendTickClock}>{clock}</span> : null}
                    </span>
                  );
                })
              : (xLbls ?? []).map((t, i) => (t ? (
                  <span key={i} className={`${s.trendAxisTick} ${active === i ? s.trendAxisTickOn : ''}`} style={{ left: `${x(i)}%` }}>
                    {t}
                  </span>
                ) : null))}
          </div>
        </div>
      </div>
      {tip}
    </div>
  );
}

/* ── Цагираг ── */

/**
 * Цагираг.
 *
 * `value` нь `null` бол «—» харуулна. Хоосон өгөгдлийг `?? 0` гэж дүүргэвэл
 * «0.0%» гэсэн ХУДАЛ утга гарч, жинхэнэ 0%-аас ялгагдахгүй болно.
 */
export function Ring({
  value,
  size: sizeIn = 'sm',
  width: widthIn,
  color,
  label,
  decimals,
  text,
}: {
  /** 0–100, эсвэл өгөгдөлгүй бол null */
  value: number | null | undefined;
  /**
   * ⚠️ 2026-10-09: 3 стандарт хэмжээ `'sm' | 'md' | 'lg'` (`RING_SIZES` — 88 · 120 · 148).
   * Тоо өгөх нь хуучин дуудагчдад үлдсэн.
   */
  size?: number | RingSize;
  /** Цагирагийн зузаан — өгөөгүй бол Environment `PieChart`-ын геометр (дотоод .72R) */
  width?: number;
  color?: string;
  label?: string;
  /** Аравтын орны тоог албадан заана; өгөөгүй бол <10 үед 1, эс бөгөөс 0 */
  decimals?: number;
  /**
   * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): голын «{v}%» бичвэрийг ДАРНА — цагираг
   * нь 0–100 дүүргэлттэй ч харуулах утга нь хувь биш үед (жиш. Эрсдэлийн AQI оноо).
   * Өгөгдөлгүй (`value` null) үед ҮЛ ХАМААРАН «—» — null ≠ 0 дүрэм хэвээр.
   */
  text?: string;
}) {
  const size = typeof sizeIn === 'number' ? sizeIn : RING_SIZES[sizeIn];
  /* ⚠️ 2026-10-23: Environment — Ring нь `PieChart`-ын ГАНЦ УТГАТ хэлбэр: гадаад R = size/2 − 4,
     дотоод .72R, доор нь бүтэн `--chart-track` бөгж, нум нь .88 тунгалаг, үзүүр нь шулуун
     (`butt`), 0.7s анимацгүй; голд SVG бичвэр (дээр шошго ink-3, доор утга 600 tabular). */
  const { c, R, r: ri } = donutGeom(size, widthIn);
  const mid = (R + ri) / 2;
  const width = R - ri;
  const has = value != null && Number.isFinite(value);
  const v = has ? Math.max(0, Math.min(100, value)) : 0;
  const circ = 2 * Math.PI * mid;
  const shown = has ? (text ?? `${v.toFixed(decimals ?? (v < 10 ? 1 : 0))}%`) : '—';
  const k = size / 112;
  const fs = Math.min(size * 0.18, (ri * 2 - 8) / Math.max(shown.length * 0.64, 1));

  return (
    /**
     * ⚠️ 2026-08-17: Туслах технологид зориулсан утга нэмэв. Урьд нь энэ
     * цагираг нь `role`, `aria-label`, `<title>` — ЮУ Ч БАЙХГҮЙ байсан тул
     * дэлгэц уншигчид зөвхөн голын «63%» гэсэн тоо очиж, юуны 63% болох нь
     * мэдэгддэггүй байв.
     * ⚠️ Өгөгдөлгүй үед `aria-valuenow={0}` гэж бичихгүй — тэр нь ЖИНХЭНЭ 0%-тай
     * андуурагдана (энэ компонентын үндсэн дүрэм, дээрх тайлбарыг үзнэ үү).
     */
    <div
      className={s.ring}
      style={{ ...tone(color), width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(has ? { 'aria-valuenow': v, 'aria-valuetext': shown } : { 'aria-valuetext': tr('өгөгдөлгүй') })}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className={s.ringTrack} cx={c} cy={c} r={mid} strokeWidth={width} />
        {/* ⚠️ ЯГ 0 үед нум зурахгүй — «0%» дээр зураас гарч бага зэрэг гүйцэтгэлтэй мэт
            хуурамч уншилт өгнө. Нум нь 12 цагаас (−90°) цагийн зүүний дагуу. */}
        {has && v > 0 && (
          <circle
            className={s.ringArc}
            cx={c}
            cy={c}
            r={mid}
            strokeWidth={width}
            strokeDasharray={`${circ * (v / 100)} ${circ}`}
            transform={`rotate(-90 ${c} ${c})`}
          />
        )}
        {label && (
          <text x={c} y={c - 6 * k} textAnchor="middle" className={s.ringLabel} fontSize={Math.max(8, size * 0.08)}>
            {label}
          </text>
        )}
        <text
          x={c}
          y={label ? c + 14 * k : c + fs * 0.35}
          textAnchor="middle"
          className={`${s.ringValue} num`}
          fontSize={fs}
        >
          {shown}
        </text>
      </svg>
    </div>
  );
}

/* ── Түлхүүр → утга ── */

/**
 * Түлхүүр → утга жагсаалт (Environment `KeyValue`).
 * ⚠️ 2026-10-23: Environment — сонголтоор `tone` (жиш. `'--good'` эсвэл `'var(--good)'`) өгвөл
 *    түлхүүрийн өмнө 6px өнгөт цэг. Үсгийн хэмжээ Environment-ийн 13.5px БИШ, 12px ХЭВЭЭР:
 *    17 дуудагч нарийн хажуугийн картад (272px) байрладаг тул 13.5px нь мөрийг хоёр болгож
 *    байрлалыг эвдэнэ.
 */
export function Rows({ items }: { items: { key: string; value: ReactNode; tone?: string }[] }) {
  return (
    <div className={`${s.rows} rowsList`}>
      {items.map((r) => (
        <div key={r.key} className={s.row}>
          <span className={s.rowKey} data-ui="row-key">
            {r.tone && (
              <i
                className={s.rowDot}
                style={{ background: r.tone.startsWith('--') ? `var(${r.tone})` : r.tone }}
                aria-hidden
              />
            )}
            {r.key}
          </span>
          <span className={`${s.rowVal} num`} data-ui="row-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Сонгож болох жагсаалт ── */

export function List({ children }: { children: ReactNode }) {
  return <div className={s.list}>{children}</div>;
}

export function ListItem({
  title,
  sub,
  value,
  color,
  active,
  onClick,
}: {
  title: string;
  sub?: string;
  value?: ReactNode;
  color?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className={s.legendDot} style={{ background: color ?? 'var(--hue)' }} />
      <span className={s.listMain}>
        <span className={s.listTitle}>{title}</span>
        {sub && <span className={s.listSub}>{sub}</span>}
      </span>
      {value != null && <span className={`${s.listVal} num`}>{value}</span>}
    </>
  );
  // Нарийн баганад урт нэр таслагдана — бүтнээр нь hover-ээр л уншина
  const full = sub ? `${title} — ${sub}` : title;
  return onClick ? (
    <button
      type="button"
      aria-pressed={active}
      title={full}
      className={`${s.listItem} ${active ? s.listOn : ''}`}
      style={tone(color)}
      onClick={onClick}
    >
      {inner}
    </button>
  ) : (
    <div className={s.listItem} title={full} style={tone(color)}>
      {inner}
    </div>
  );
}

/* ── Төлөв ── */

export function Loading({ label = tr('Ачаалж байна…'), minH }: { label?: string; minH?: number }) {
  /**
   * УДААН гэдгийг ил хэлэх (2026-09-02 аудит).
   *
   * ⚠️ ArcGIS нь 2000 мөрийн хуудаслалтаар татдаг тул том давхарга 10+ секунд
   *    авах нь ХЭВИЙН. Эргэлдэгч дангаараа тэр хугацаанд «гацсан» мэт
   *    уншигддаг бөгөөд хэрэглэгч хуудсаа refresh хийж, ачаалалтыг ЭХНЭЭС нь
   *    эхлүүлдэг байв. 8 секундын дараа шалтгааныг нь хэлнэ.
   * ⚠️ Товч БИШ, зөвхөн ТАЙЛБАР: хүсэлт нь ажилласаар байгаа тул «дахин
   *    оролдох» нь одоо байгаа ачаалалтыг хаяна.
   */
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  // ⚠️ `role="status"` — ачаалал дуусахад дэлгэц уншигч мэдэгдэнэ. Урьд нь
  //    зөвхөн нүдэнд харагдах эргэлдэгч байсан.
  return (
    <div className={s.state} role="status" aria-live="polite" style={minH ? { minHeight: minH } : undefined}>
      {/* ⚠️ 2026-10-23: Environment — lucide `Loader2` эргэлт (ink-3), CSS хүрээт цагирагийн оронд */}
      <Loader2 className={s.spinner} size={18} strokeWidth={1.75} aria-hidden />
      {label}
      {slow && (
        <span className={s.slowHint}>
          {tr('Их хэмжээний өгөгдөл татаж байна — сүлжээнээс шалтгаалж хэдэн арван секунд авч болно.')}
        </span>
      )}
    </div>
  );
}

/**
 * Хоосон төлөв.
 *
 * ⚠️ 2026-08-17: Урьд нь `Loading` ба алдаатай ижил, ялгаагүй саарал өгүүлбэр
 * байсан (33 дуудлагатай — аппын хамгийн олон харагддаг «төлөв»). Одоо
 * тасархай хүрээтэй бие даасан хайрцаг: хэрэглэгч энэ нь АЧААЛЖ БАЙГАА юм уу,
 * АЛДАА юм уу, эсвэл ЖИНХЭНЭ хоосон гэдгийг шууд ялгана.
 *
 * `label` нь ганц ЗААВАЛ талбар хэвээр — 33 дуудагчийн нэг нь ч өөрчлөгдөхгүй.
 */
export function Empty({
  label,
  hint,
  onRetry,
}: {
  label: string;
  /**
   * ⚠️ 2026-10-23: Environment `.chart-empty` — ДҮРСГҮЙ. Хуучин дуудагчид эвдрэхгүйн тулд
   *    төрөлд үлдэв; нөлөөгүй.
   */
  icon?: string;
  /** Дараа нь ЮУ хийхийг заана — хоосон дэлгэц бол урилга байх ёстой */
  hint?: ReactNode;
  /**
   * АЛДААНААС үүссэн хоосон төлөвт «Дахин оролдох».
   *
   * ⚠️ 2026-09-02 аудит: ArcGIS түр гацахад зарим харагдац зөвхөн «татагдсангүй»
   *    гэж бичээд зогсдог байсан тул хэрэглэгч БҮТЭН хуудсаа refresh хийхээс
   *    өөр аргагүй байв (`Data`-д retry бий, гараар бичсэн салаанууд нь алга).
   *    Өгвөл `Data`-гийнхтэй ЯГ ижил товч гарна — нэг л дүр төрх.
   * ⚠️ ЖИНХЭНЭ хоосон (өгөгдөл нь үнэхээр байхгүй) үед БҮҮ өг — тэнд дахин
   *    оролдох нь утгагүй бөгөөд «алдаа гарсан» мэт уншигдана.
   */
  onRetry?: () => void;
}) {
  return (
    <div className={`${s.state} ${s.empty}`} role={onRetry ? 'alert' : undefined}>
      {/* ⚠️ 2026-10-23: Environment `.chart-empty` — тасархай `--line` хүрээ, дэвсгэргүй, төвд ink-3,
          дүрсгүй (урьдын 20px `Icon` хасагдсан) */}
      <span className={s.emptyLabel}>{label}</span>
      {hint && <span className={s.emptyHint}>{hint}</span>}
      {onRetry && (
        <button type="button" className={s.retryBtn} onClick={onRetry}>
          {tr('Дахин оролдох')}
        </button>
      )}
    </div>
  );
}

/**
 * АЛДААГ ХЭРЭГЛЭГЧИЙН ХЭЛЭЭР (2026-09-30).
 *
 * ⚠️ Ангиллыг МЕССЕЖ/НЭРЭЭР таамаглана — `query.ts`-ийн `ArcGISError` нь
 *    HTTP статусыг текстэд («HTTP 498») эсвэл ArcGIS-ийн мессежийг шууд
 *    дамжуулдаг, тусгай код талбаргүй. Танихгүй бол ерөнхий мессеж — техникийн
 *    мөр нь `Data`-гийн эвхмэл хэсэгт ҮРГЭЛЖ үлдэнэ.
 * ⚠️ 499 («Token Required») нь хаалттай үйлчилгээ (CLAUDE.md) — «эрх» ангилалд.
 */
export function friendlyError(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  const m = String((e as { message?: string } | null)?.message ?? e ?? '').toLowerCase();
  /* ⚠️ 2026-10-05: chunk ачаалагдаагүй (шинэ хувилбар байршсан) — «Failed to fetch dynamically
     imported module» нь доорх СҮЛЖЭЭНИЙ ангилалд орж «интернэтээ шалгана уу» гэж төөрөгдүүлдэг
     байсан тул ТҮРҮҮЛЖ шалгана (`ErrorBoundary.isChunkLoadError`-ийн ⚠️). */
  if (isChunkLoadError(e)) return chunkErrorText();
  /* ⚠️ 2026-10-05: `query.ts` токеныг шинэчилж ЧАДААГҮЙ 498/499-ийг `sessionExpired`-ээр
     тэмдэглэдэг. Урьд нь ийм 499 («Token Required») доорх «эрх алга — админд хандана уу»
     болж, жинхэнэ шалтгаан (нэвтрэлтийн хугацаа дууссан) нуугддаг байв. Тэмдэггүй 499 нь
     шинэ токеноор ч татгалзсан = жинхэнэ эрхгүй → хуучин мессеж хэвээр.
     ⚠️ 2026-10-06: тэмдэг ЗӨВХӨН шинэчлэлтийг сервер татгалзсан (`authToken.lastRefreshFail`
     === 'dead') үед; шинэчлэлт сүлжээнээс болж унасан бол `query.ts` «Failed to fetch» мөртэй
     алдаа шиднэ → доорх СҮЛЖЭЭНИЙ мессеж (худал «дахин нэвтэр» гарахгүй). */
  if ((e as { sessionExpired?: boolean } | null)?.sessionExpired === true) {
    return tr('Нэвтрэлтийн хугацаа дууссан байна. Хуудсыг дахин ачаалж нэвтэрнэ үү.');
  }
  if (name === 'TimeoutError' || /timeout|timed out|хугацаа хэтэр/.test(m)) {
    return tr('Сервер удаан хариулж байна. Хэсэг хүлээгээд дахин оролдоно уу.');
  }
  if (/failed to fetch|networkerror|network error|load failed|err_internet|offline/.test(m)) {
    return tr('Сүлжээний холболт тасарсан бололтой. Интернэтээ шалгаад дахин оролдоно уу.');
  }
  if (/\b498\b|invalid token|token.*expired|expired.*token|токен/.test(m)) {
    return tr('Нэвтрэлтийн хугацаа дууссан байна. Хуудсыг дахин ачаалж нэвтэрнэ үү.');
  }
  if (/\b(401|403|499)\b|not authorized|permission|token required|access denied|эрх/.test(m)) {
    return tr('Энэ өгөгдөлд хандах эрх алга байна. Админд хандана уу.');
  }
  return tr('Түр алдаа гарлаа. Дахин оролдоно уу — давтагдвал админд мэдэгдэнэ үү.');
}

/**
 * ДЭЛГЭЦЭНД гарах алдааны мөр (⚠️ 2026-10-04) — `catch`-ийн `setErr`/`toast`-д.
 *
 * ⚠️ `friendlyError`-оос ЗӨӨЛӨН: манай МОНГОЛ мессеж (эрхийн `requireCap`,
 *    «Бичихийн өмнөх шалгалт унав: …», зөрчлийн тайлбар) агуулгаараа хэрэгтэй
 *    тул ХЭВЭЭР — ерөнхий «Түр алдаа»-аар солибол хэрэглэгч юу буруу болсныг
 *    мэдэхгүй. Харин кириллгүй түүхий серверийн мөр («Token Required», «Failed
 *    to fetch», «HTTP 500») → `friendlyError`; монгол угтвартай ч СҮҮЛ нь
 *    англи шалтгаан бол («…: Token Required») зөвхөн сүүлийг нь орчуулна.
 * ⚠️ Давхардсан хэсэг нэг болно — `hyanalt.post` нь `message`-д `details`-ийг
 *    залгадаг тул «Token Required · Token Required» гардаг байв.
 */
export function userError(e: unknown): string {
  const raw = String((e as { message?: string } | null)?.message ?? e ?? '').trim();
  const msg = [...new Set(raw.split(' · ').map((x) => x.trim()).filter(Boolean))].join(' · ');
  const CYR = /[Ѐ-ӿ]/;
  if (!msg || !CYR.test(msg)) return friendlyError(e);
  const tail = /^(.*[Ѐ-ӿ][^:]*):\s*([^Ѐ-ӿ]+)$/.exec(msg);
  if (tail && /[A-Za-z]{3,}/.test(tail[2])) return `${tail[1]}: ${friendlyError(tail[2])}`;
  return msg;
}

/**
 * Async төлөвийг зурна.
 * Алдааг ҮРГЭЛЖ харуулна — өгөгдөл татагдаагүй үед хуучин/зохиомол тоо
 * дэлгэц дээр үлдэх боломжгүй.
 */
export function Data<T>({
  q,
  children,
  loading,
  minH,
}: {
  q: Async<T>;
  children: (data: T) => ReactNode;
  loading?: string;
  /**
   * Ачаалах/алдааны төлөвт ЭЗЛЭХ доод өндөр (px).
   *
   * ⚠️ Ачаалалтын мөр НАМХАН, ачаалагдсан график ӨНДӨР тул өгөгдөл ирэхэд
   * самбар үсэрч «анивчсан» мэт харагддаг. Ойролцоо өндрийг урьдчилан
   * эзэлбэл агуулга зүгээр л дүүрнэ — байрлал хөдлөхгүй.
   */
  minH?: number;
}) {
  if (q.state === 'loading') return <Loading label={loading} minH={minH} />;
  if (q.state === 'error') {
    return (
      <div className={s.state} role="alert" style={minH ? { minHeight: minH } : undefined}>
        <strong className={s.error}>{tr('Өгөгдөл татагдсангүй')}</strong>
        {/* ⚠️ 2026-09-30: түүхий `error.message` («HTTP 499», «Invalid token»…)
            барилгын ажилтанд юу ч хэлдэггүй — ойлгомжтой тайлбар гаргаж,
            техникийн мөрийг админд дамжуулахад зориулж эвхмэл хэсэгт үлдээв. */}
        <span className={s.errorMsg}>{friendlyError(q.error)}</span>
        {q.error.message && (
          <details className={s.errorMsg}>
            <summary style={{ cursor: 'pointer' }}>{tr('Техникийн дэлгэрэнгүй')}</summary>
            <span style={{ wordBreak: 'break-word' }}>{q.error.message}</span>
          </details>
        )}
        {/* ArcGIS түр гацах нь энгийн — бүтэн refresh хийлгэхгүйгээр энэ
            хүсэлтийг л дахин явуулна (`useAsync`-ийн retry) */}
        {q.retry && (
          <button type="button" className={s.retryBtn} onClick={q.retry}>
            {tr('Дахин оролдох')}
          </button>
        )}
      </div>
    );
  }
  return <>{children(q.data)}</>;
}
