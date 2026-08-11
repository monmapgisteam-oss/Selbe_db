'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Async } from '@/lib/useAsync';
import s from './ui.module.css';

const tone = (c?: string) => ({ '--tone': c ?? 'var(--hue)' }) as CSSProperties;

/* ── Хэсэг ── */

/**
 * Дашбоардын хэсэг.
 *
 * `tone="primary"` нь тухайн самбарын ГОЛ хэсгийг заана — модулийн өнгөөр зүүн
 * ирмэг татаж, дэвсгэрийг нь өргөнө.
 *
 * ⚠️ Самбар бүрд НЭГ л primary байна. Урьд нь 6-7 хэсэг дараалахад бүгд ижил
 * жинтэй байсан тул хэрэглэгч аль нь гол вэ гэдгийг ялгаж чаддаггүй байв —
 * хоёр, гурав нь онцлогдвол тэр асуудал шийдэгдэхгүй, зөвхөн шилжинэ.
 */
export function Section({
  title,
  note,
  tone,
  children,
}: {
  title?: string;
  note?: ReactNode;
  tone?: 'primary';
  children: ReactNode;
}) {
  return (
    <section className={`${s.section} ${tone === 'primary' ? s.sectionPrimary : ''}`}>
      {title && (
        <header className={s.sectionHead}>
          <h3 className={s.sectionTitle}>{title}</h3>
          {note && <span className={s.sectionNote}>{note}</span>}
        </header>
      )}
      {children}
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

/** Хэсгийн доторх дэд гарчиг — Section-ыг дахин давхарлахгүйгээр бүлэглэнэ */
export function SubHead({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className={s.subHead}>
      {children}
      {note && <span className={s.subNote}>{note}</span>}
    </div>
  );
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
  return (
    <div className={`${s.tabs} ${plain ? s.tabsPlain : ''}`} role="tablist">
      {items.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
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
}

/* ── Үзүүлэлт ── */

export function Stats({ cols = 2, children }: { cols?: 2 | 3; children: ReactNode }) {
  return <div className={`${s.stats} ${cols === 3 ? s.stats3 : ''}`}>{children}</div>;
}

export function Stat({
  value,
  unit,
  label,
  color,
  accent,
}: {
  value: ReactNode;
  unit?: string;
  label: string;
  color?: string;
  accent?: boolean;
}) {
  return (
    <div className={`${s.stat} ${accent ? s.statAccent : ''}`} style={tone(color)}>
      <div className={`${s.statValue} num`}>
        {value}
        {unit && <span className={s.statUnit}>{unit}</span>}
      </div>
      <div className={s.statLabel}>{label}</div>
    </div>
  );
}

/* ── Баганан жагсаалт ── */

type Bar = { key: string; label: string; value: number; display?: string; color?: string };

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
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  const hidden = limit != null && !all ? Math.max(0, items.length - limit) : 0;
  const shown = hidden > 0 ? items.slice(0, limit) : items;

  return (
    <div className={s.bars}>
      {shown.map((it) => {
        const w = Math.max(0, Math.min(100, (it.value / top) * 100));
        const on = sel.includes(it.key);
        // <button> дотор зөвхөн phrasing content зөвшөөрөгдөнө — <div> ашиглаж болохгүй
        /**
         * ГАНЦ загвар — ТӨСЛИЙН БҮХ БАР ИЖИЛ: нэр УРД + тоймтой бар + утга нэг
         * мөрөнд. Урьд нь «нэр дээр» (блок) хувилбар байсныг хэрэглэгчийн хүсэлтээр
         * бүрмөсөн авав — бүх дашбоардын бар нэг эгнээ, нэр урдтай.
         */
        const body = (
          <>
            <span className={s.barName} title={it.label}>{it.label}</span>
            <span className={`${s.barTrack} ${s.barTrackOut}`}>
              <i className={`${s.barFill} ${s.barFillOut}`} style={{ width: `${w}%` }} />
            </span>
            <span className={`${s.barVal} num`}>{it.display ?? it.value}</span>
          </>
        );
        const rowCls = `${s.barRow} ${s.barRowInline}`;
        const st = tone(it.color ?? color);
        /** Бүх дашбоардад ИЖИЛ hover popup — нэр: утга (+шүүх заавар) */
        const tip = `${it.label}: ${it.display ?? it.value}${onSelect ? ' — дарж газрын зурагт шүүнэ' : ''}`;
        return onSelect ? (
          <button
            key={it.key}
            type="button"
            aria-pressed={on}
            className={`${rowCls} ${s.barClick} ${on ? s.barOn : ''}`}
            style={st}
            title={tip}
            onClick={() => onSelect(it.key)}
          >
            {body}
          </button>
        ) : (
          <div key={it.key} className={rowCls} style={st} title={tip}>
            {body}
          </div>
        );
      })}

      {hidden > 0 && (
        <button type="button" className={s.more} onClick={() => setAll(true)}>
          Үлдсэн {hidden}-г харах
        </button>
      )}
      {all && limit != null && items.length > limit && (
        <button type="button" className={s.more} onClick={() => setAll(false)}>
          Хумих
        </button>
      )}
    </div>
  );
}

/* ── Хэсэгчилсэн мөр ── */

export function Stack({
  items,
  total,
  /** Доор нь тайлбар (нэр + тоо) харуулах эсэх. Чипээр давхардуулахгүйн тулд унтраана. */
  legend = true,
}: {
  items: { key: string; label: string; value: number; color: string }[];
  total?: number;
  legend?: boolean;
}) {
  const sum = (total ?? items.reduce((a, b) => a + b.value, 0)) || 1;
  return (
    <>
      <div className={s.stack}>
        {items.map((i) => (
          <span
            key={i.key}
            className={s.stackSeg}
            style={{ width: `${(i.value / sum) * 100}%`, background: i.color }}
            title={`${i.label}: ${i.value}`}
          />
        ))}
      </div>
      {legend && (
        <ul className={s.legend}>
          {items.map((i) => (
            <li key={i.key} className={s.legendItem}>
              <span className={s.legendDot} style={{ background: i.color }} />
              {i.label}
              <b className={`${s.legendVal} num`}>{i.value}</b>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ── Дугуй диаграм (pie / donut) ── */

/**
 * Цагирган ЗҮСМЭГИЙН зам (annular sector) — 12 цагаас цагийн зүүний дагуу.
 *
 * ⚠️ Урьд нь зүсмэгийг `stroke-dasharray`-аар (ганц шугам) зурдаг байсныг
 * ДҮҮРГЭЛТ + ЗАХЫН ШУГАМ тусад нь удирдахын тулд бүтэн замаар сольсон: дотор
 * талыг тунгалаг дүүргэж, зах (дотор/гадна нум + радиал зааг) нь тод бүтэн
 * шугамтай болно. `f0`,`f1` — эхлэх/дуусах бутархай (0..1).
 */
function sectorPath(cx: number, cy: number, ri: number, ro: number, f0: number, f1: number): string {
  // Бүтэн тойрог (ганц ангилал) — нэг нумаар хаагдахгүй тул мэдрэгдэхгүй зайг үлдээнэ
  const full = f1 - f0 >= 0.99999;
  const a0 = f0 * 2 * Math.PI;
  const a1 = (full ? f1 - 0.0001 : f1) * 2 * Math.PI;
  const pt = (rr: number, a: number): [number, number] => [cx + rr * Math.sin(a), cy - rr * Math.cos(a)];
  const [ox0, oy0] = pt(ro, a0);
  const [ox1, oy1] = pt(ro, a1);
  const [ix1, iy1] = pt(ri, a1);
  const [ix0, iy0] = pt(ri, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${ox0},${oy0} A${ro},${ro} 0 ${large} 1 ${ox1},${oy1} `
    + `L${ix1},${iy1} A${ri},${ri} 0 ${large} 0 ${ix0},${iy0} Z`;
}

/**
 * Хувь эзлэх байдлыг харуулах дугуй диаграм.
 *
 * ⚠️ `Stack`-аас ЯЛГААТАЙ хэрэглээ: Stack нь нарийн зурвас — олон ангилалтай,
 * дараалал чухал үед. Donut нь ЦӨӨН (3–7) ангилалын харьцааг онцлоход тохирно.
 * 7-оос олон ангилалд зүсмэгүүд нь ялгагдахаа болих тул Stack эсвэл Bars хэрэглэ.
 *
 * ⚠️ Зүсмэг бүр annular-sector `<path>`: дотор ДҮҮРГЭЛТ тунгалаг, ЗАХЫН ШУГАМ
 * тод бүтэн — өнгөний ялгарал `shade()`-ийн hue-эргэлтээс.
 */

/**
 * viewBox-ийн ЗАХЫН НӨӨЦ (пиксел).
 * ⚠️ Зүсмэгийн гадна радиус нь `size / 2`-т яг хүрдэг ба SVG-ийн `stroke` замын
 * ДУНДУУР зурагддаг тул захын шугамын хагас нь хүрээнээс гарч тасардаг байв.
 * Хамгийн зузаан зах 2.5px (тодруулсан зүсмэг) — 2px нөөц хүрэлцээтэй.
 */
const EDGE_PAD = 2;

export function Donut({
  items,
  size = 132,
  width = 22,
  center,
  centerLabel,
  selected,
  onSelect,
  nowrap = false,
  stack = false,
  leaders = false,
}: {
  items: { key: string; label: string; value: number; color: string; display?: ReactNode }[];
  size?: number;
  width?: number;
  /** Голд харуулах утга. Заагаагүй бол нийлбэр. */
  center?: ReactNode;
  centerLabel?: string;
  /** Сонгосон зүсмэгийн key(үүд) — идэвхтэй бол бусад нь бүдгэрнэ. Олон сонголтод массив. */
  selected?: string | string[] | null;
  /** Зүсмэг/тайлбар дарахад — байвал диаграм шүүлтийн удирдлага болно */
  onSelect?: (key: string) => void;
  /** Тайлбарыг пайн диаграмын ХАЖУУД албадаж зэрэгцүүлнэ (доош ороохгүй) */
  nowrap?: boolean;
  /** Тайлбарыг пайн диаграмын ДООР бүтэн өргөнөөр (нарийн баганад тохиромжтой) */
  stack?: boolean;
  /** Тайлбарыг доор жагсаахын оронд зүсмэг бүрээс ЗУРААС татаж гадна бичнэ */
  leaders?: boolean;
}) {
  const sel = selected == null ? [] : Array.isArray(selected) ? selected : [selected];
  const hasSel = sel.length > 0;
  const total = items.reduce((a, b) => a + b.value, 0);
  const r = (size - width) / 2;

  /**
   * Хулгана дээрх зүсмэг — ЗҮСМЭГ ба ТАЙЛБАР хоёрыг холбоно.
   *
   * ⚠️ Хоёр талдаа ажиллана: зүсмэг дээр очиход тайлбарын мөр, тайлбар дээр
   * очиход зүсмэг тодорно. 4-8 ойролцоо өнгөтэй зүсмэгийг тайлбартай нь нүдээр
   * тааруулах нь бараг боломжгүй байсан.
   * ⚠️ ЗӨВХӨН дарж болдог диаграмд — эс бөгөөс идэвхгүй диаграм дарагдах юм шиг
   * хуурамч мэдрэмж төрүүлнэ.
   */
  const [hov, setHov] = useState<string | null>(null);
  const hovOn = onSelect ? hov : null;
  const hoverProps = (key: string) =>
    onSelect
      ? { onMouseEnter: () => setHov(key), onMouseLeave: () => setHov((h) => (h === key ? null : h)) }
      : undefined;
  /** Тодруулах уу? Хулгана байвал ТЭР давамгайлна, эс бөгөөс сонголт. */
  const isEmph = (key: string) => (hovOn ? hovOn === key : sel.includes(key));
  const isDim = (key: string) => (hovOn ? hovOn !== key : hasSel && !sel.includes(key));
  /**
   * ДҮҮРГЭЛТ тунгалаг (зөөлөн зурвас), ЗАХЫН ШУГАМ тод бүтэн (тодорхой хүрээ).
   * Тодруулсан зүсмэг дүүргэлт нь өтгөрч, бүдгэрүүлсэн нь бараг үл үзэгдэнэ.
   * Зах нь ямагт тод — бүдгэрүүлсэн үед л сулрана.
   */
  const fillOpacity = (key: string) => (isEmph(key) ? 0.55 : isDim(key) ? 0.08 : 0.3);
  const edgeOpacity = (key: string) => (isDim(key) ? 0.35 : 1);
  const edgeWidth = (key: string) => (isEmph(key) ? 2.5 : 1.6);
  // Зүсмэгийн дотор/гадна радиус — band-ийн зузаан нь `width`
  const ri = r - width / 2;
  const ro = r + width / 2;

  // Зүсмэг бүрийн ЭХЛЭХ байрлал — өмнөх зүсмэгүүдийн нийлбэр
  let acc = 0;
  const slices = items.map((it) => {
    const frac = total > 0 ? it.value / total : 0;
    const offset = acc;
    acc += frac;
    return { ...it, frac, offset };
  });

  /**
   * LEADER горим — тайлбарыг доор жагсаахын оронд зүсмэг бүрээс зураас татаж
   * пайн диаграмын гадна шошгыг бичнэ. Цөөн зүсмэгтэй (2–4) диаграмд тохиромжтой.
   */
  if (leaders) {
    const cx = size / 2;
    const cy = size / 2;
    const Ro = r + width / 2; // зүсмэгийн ГАДНА радиус
    const GAP = 16; // зурааснаас шошго хүртэл
    const PAD = 106; // хажуугийн шошгын зай — vbW нь ~панелд багтаж, масштаб ≈ 1
    const PADY = 70; // босоо зай (дээд/доод зүсмэгийн шошгонд)
    const GUTTER = 6; // зураас ба текстийн хоорондын зай
    const LW = PAD - GAP - GUTTER - 2; // шошгын хайрцгийн өргөн — бүтэн үг багтаана
    const vbW = size + PAD * 2;
    const vbH = size + PADY * 2;
    return (
      <div className={s.donutLead}>
        <svg width={vbW} height={vbH} viewBox={`${-PAD} ${-PADY} ${vbW} ${vbH}`}>
          {/* Цагирган зүсмэгүүд — дүүргэлт тунгалаг, зах тод (12 цагаас) */}
          <g>
            <circle className={s.donutTrack} cx={cx} cy={cy} r={r} strokeWidth={width} />
            {slices.map((sl) => (
              <path
                key={sl.key}
                d={sectorPath(cx, cy, ri, ro, sl.offset, sl.offset + sl.frac)}
                fill={sl.color}
                fillOpacity={fillOpacity(sl.key)}
                stroke={sl.color}
                strokeOpacity={edgeOpacity(sl.key)}
                strokeWidth={edgeWidth(sl.key)}
                strokeLinejoin="round"
                style={onSelect ? { cursor: 'pointer' } : undefined}
                onClick={onSelect ? () => onSelect(sl.key) : undefined}
                {...hoverProps(sl.key)}
              >
                <title>{`${sl.label}: ${sl.value}${onSelect ? ' — дарж газрын зурагт шүүнэ' : ''}`}</title>
              </path>
            ))}
          </g>
          {/* Голын утга */}
          <text x={cx} y={cy - 1} textAnchor="middle" className={s.donutLeadCtr}>{String(center ?? total)}</text>
          {centerLabel && <text x={cx} y={cy + 12} textAnchor="middle" className={s.donutLeadCtrLbl}>{centerLabel}</text>}
          {/* Зураас + гадна БҮТЭН шошго (foreignObject — HTML мөр даруулна) */}
          {slices.map((sl) => {
            const mid = sl.offset + sl.frac / 2;
            const th = mid * 2 * Math.PI;
            const sin = Math.sin(th);
            const cos = Math.cos(th);
            const sx = cx + Ro * sin;
            const sy = cy - Ro * cos;
            const ex = cx + (Ro + 12) * sin;
            const ey = cy - (Ro + 12) * cos;
            const right = sin >= 0;
            const lx = right ? cx + Ro + GAP : cx - Ro - GAP;
            // Текст зурааснаас GUTTER-ийн зайд — давхацахгүй
            const boxX = right ? lx + GUTTER : -PAD + 2;
            const pct = sl.display ?? `${sl.frac > 0 && sl.frac < 0.005 ? '<1' : (sl.frac * 100).toFixed(0)}%`;
            return (
              <g
                key={sl.key}
                opacity={isDim(sl.key) ? 0.35 : 1}
                style={onSelect ? { cursor: 'pointer' } : undefined}
                onClick={onSelect ? () => onSelect(sl.key) : undefined}
                {...hoverProps(sl.key)}
              >
                <polyline points={`${sx},${sy} ${ex},${ey} ${lx},${ey}`} fill="none" stroke={sl.color} strokeWidth={1} />
                <circle cx={lx} cy={ey} r={1.6} fill={sl.color} />
                <foreignObject x={boxX} y={ey - 30} width={LW} height={60}>
                  <div
                    className={s.donutLeadBox}
                    style={{ textAlign: right ? 'left' : 'right', fontWeight: isEmph(sl.key) ? 600 : undefined }}
                    title={`${sl.label}: ${sl.value}${onSelect ? ' — дарж газрын зурагт шүүнэ' : ''}`}
                  >
                    <span className={s.donutLeadName}>{sl.label}</span>{' '}
                    <b className={s.donutLeadPct} style={{ color: sl.color }}>{pct}</b>
                  </div>
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
      <div className={s.donut} style={{ width: size, height: size }}>
        {/**
          * ⚠️ viewBox нь `size`-ээс АРАЙ ТОМ: зүсмэгийн ГАДНА радиус (`ro`) яг
          * `size / 2` тул зах (`stroke`) нь замын дундуур зурагдаж, хагас нь
          * хүрээнээс гарч 4 талаасаа ТАСАРЧ харагддаг байв. Хамгийн зузаан зах
          * 2.5px (тодруулсан зүсмэг) тул 2px нөөц хангалттай.
          */}
        <svg
          width={size}
          height={size}
          viewBox={`${-EDGE_PAD} ${-EDGE_PAD} ${size + EDGE_PAD * 2} ${size + EDGE_PAD * 2}`}
        >
          {/* Зүсмэг бүр — дүүргэлт тунгалаг, зах тод бүтэн (12 цагаас) */}
          <g>
            <circle className={s.donutTrack} cx={size / 2} cy={size / 2} r={r} strokeWidth={width} />
            {slices.map((sl) => (
              <path
                key={sl.key}
                className={s.donutSlice}
                d={sectorPath(size / 2, size / 2, ri, ro, sl.offset, sl.offset + sl.frac)}
                fill={sl.color}
                fillOpacity={fillOpacity(sl.key)}
                stroke={sl.color}
                strokeOpacity={edgeOpacity(sl.key)}
                strokeWidth={edgeWidth(sl.key)}
                strokeLinejoin="round"
                style={onSelect ? { cursor: 'pointer' } : undefined}
                onClick={onSelect ? () => onSelect(sl.key) : undefined}
                {...hoverProps(sl.key)}
              >
                <title>{`${sl.label}: ${sl.value}`}</title>
              </path>
            ))}
          </g>
        </svg>
        {/**
          * ⚠️ Хулгана зүсмэг дээр очиход ГОЛД нь тэр зүсмэгийн утга гарна —
          * тайлбар руу нүд шилжүүлэхгүйгээр шууд уншина. Хулгана буухад
          * анхны нийт утга руугаа эргэнэ.
          */}
        <div className={s.donutCenter}>
          {(() => {
            const h = hovOn ? slices.find((x) => x.key === hovOn) : null;
            return h ? (
              <>
                <span className={`${s.donutValue} num`}>{h.value}</span>
                <span className={s.donutLabel} title={h.label}>{h.label}</span>
              </>
            ) : (
              <>
                <span className={`${s.donutValue} num`}>{center ?? total}</span>
                {centerLabel && <span className={s.donutLabel}>{centerLabel}</span>}
              </>
            );
          })()}
        </div>
      </div>

      <ul className={s.donutLegend}>
        {slices.map((sl) => {
          const on = sel.includes(sl.key);
          const body = (
            <>
              <span className={s.legendDot} style={{ background: sl.color }} />
              <span className={s.donutName}>{sl.label}</span>
              {/**
                * ⚠️ `toFixed(0)` ганцаараа ХУДАЛ уншигдана: 3,947-гийн 14 нь
                * 0.35% тул «0%» болж, зүсмэг нь диаграм дээр харагдсаар атлаа
                * «юу ч биш» гэж бичигддэг байлаа. 0.5%-аас бага БОЛОВЧ 0 биш
                * утгыг «<1%» гэж заана.
                * ⚠️ Дуудагчийн өгсөн `display` нь үргэлж давамгайлна.
                */}
              <b className={`${s.donutPct} num`}>
                {sl.display
                  ?? `${sl.frac > 0 && sl.frac < 0.005 ? '<1' : (sl.frac * 100).toFixed(0)}%`}
              </b>
            </>
          );
          return onSelect ? (
            <li key={sl.key}>
              <button
                type="button"
                aria-pressed={on}
                className={`${s.donutItem} ${s.donutClick} ${on ? s.donutOn : ''} ${hovOn === sl.key ? s.donutHov : ''}`}
                onClick={() => onSelect(sl.key)}
                // ⚠️ Гар/фокусаар хөтлөгчид ч ижил холбоо ажиллана
                onFocus={() => setHov(sl.key)}
                onBlur={() => setHov((h) => (h === sl.key ? null : h))}
                {...hoverProps(sl.key)}
              >
                {body}
              </button>
            </li>
          ) : (
            <li key={sl.key} className={s.donutItem}>{body}</li>
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
 */
export function Series({
  items,
  color,
  height = 96,
  unit,
  selected,
  onSelect,
}: {
  items: { key: string; label: string; value: number; display?: string }[];
  color?: string;
  height?: number;
  unit?: string;
  /** Сонгосон баганын key — идэвхтэй бол бусад нь бүдгэрнэ */
  selected?: string | null;
  /** Багана дарахад — байвал цуваа шүүлтийн удирдлага болно */
  onSelect?: (key: string) => void;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div className={s.series} style={tone(color)}>
      <div className={s.seriesPlot} style={{ height }}>
        {items.map((it) => {
          const on = selected === it.key;
          const dim = selected != null && !on;
          // ⚠️ Баганын хамгийн бага өндөр 2px: утга 0 байсан ч багана нь БАЙГАА
          //    гэдэг нь харагдах ёстой — эс бөгөөс өгөгдөлгүйтэй андуурагдана.
          const barH = `${Math.max(2, (it.value / max) * 100)}%`;
          const inner = (
            <>
              <span className={`${s.seriesVal} num`}>{it.display ?? it.value}</span>
              <span className={s.seriesBar} style={{ height: barH, opacity: dim ? 0.4 : 1 }} />
              <span className={s.seriesLabel}>{it.label}</span>
            </>
          );
          return onSelect ? (
            <button
              key={it.key}
              type="button"
              aria-pressed={on}
              className={`${s.seriesCol} ${s.seriesClick} ${on ? s.seriesOn : ''}`}
              title={`${it.label}: ${it.display ?? it.value}`}
              onClick={() => onSelect(it.key)}
            >
              {inner}
            </button>
          ) : (
            <div key={it.key} className={s.seriesCol} title={`${it.label}: ${it.display ?? it.value}`}>
              {inner}
            </div>
          );
        })}
      </div>
      {unit && <div className={s.seriesUnit}>{unit}</div>}
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
  value: number;
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
function axisTicks(points: TrendPoint[]): string[] {
  let year = '';
  return points.map((p) => {
    const d = p.note ?? p.label;
    const y = d.slice(0, 4);
    if (!/^\d{4}-/.test(d) || y !== year) { year = y; return d; }
    return d.slice(5);
  });
}

export function Trend({
  points,
  color,
  height = 132,
  unit = '%',
}: {
  points: TrendPoint[];
  color?: string;
  height?: number;
  unit?: string;
}) {
  const [hov, setHov] = useState<number | null>(null);

  if (points.length < 2) return <Empty label="Цуваа зурахад хангалттай бүртгэл алга." />;

  // Тэнхлэгийн дээд хязгаар нь БҮТЭН аравт — 23%-ийн муруйг 0–100 дээр зурвал
  // шулуун шугам болж, өсөлт нь ялгагдахгүй.
  const peak = Math.max(...points.map((p) => p.value));
  const top = Math.max(10, Math.ceil(peak / 10) * 10);
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => 100 - (v / top) * 100;

  const path = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const cur = points[hov ?? points.length - 1];

  return (
    <div className={s.trend} style={tone(color)}>
      <div className={s.trendHead}>
        <span className={`${s.trendValue} num`}>
          {cur.value.toFixed(1)}{unit}
        </span>
        <span className={s.trendMeta}>
          {cur.label}{cur.note ? ` · ${cur.note}` : ''}
        </span>
      </div>

      <div className={s.trendPlot} style={{ height }}>
        <svg className={s.trendSvg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {/* Сүлжээ — 0 / дунд / дээд. Тод биш: өгөгдөл биш, хэмжүүр. */}
          {[0, 50, 100].map((g) => (
            <line key={g} className={s.trendGrid} x1="0" x2="100" y1={g} y2={g} />
          ))}
          <polygon className={s.trendArea} points={`0,100 ${path} 100,100`} />
          <polyline className={s.trendLine} points={path} />
        </svg>

        <span className={`${s.trendTick} ${s.trendTickTop} num`}>{top}{unit}</span>
        <span className={`${s.trendTick} ${s.trendTickZero} num`}>0</span>

        {points.map((p, i) => (
          <button
            key={p.label}
            type="button"
            className={`${s.trendHit} ${hov === i ? s.trendHitOn : ''}`}
            style={{ left: `${x(i)}%` }}
            aria-label={`${p.label}: ${p.value.toFixed(1)}${unit}${p.note ? ` · ${p.note}` : ''}`}
            onMouseEnter={() => setHov(i)}
            onMouseLeave={() => setHov((h) => (h === i ? null : h))}
            onFocus={() => setHov(i)}
            onBlur={() => setHov((h) => (h === i ? null : h))}
          >
            <span className={s.trendDot} style={{ top: `${y(p.value)}%` }} />
          </button>
        ))}
      </div>

      <div className={s.trendAxis}>
        {axisTicks(points).map((t, i) => (
          <span key={points[i].label} className={s.trendAxisTick} style={{ left: `${x(i)}%` }}>
            {t}
          </span>
        ))}
      </div>
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
  size = 92,
  width = 9,
  color,
  label,
  decimals,
}: {
  /** 0–100, эсвэл өгөгдөлгүй бол null */
  value: number | null | undefined;
  size?: number;
  width?: number;
  color?: string;
  label?: string;
  /** Аравтын орны тоог албадан заана; өгөөгүй бол <10 үед 1, эс бөгөөс 0 */
  decimals?: number;
}) {
  const has = value != null && Number.isFinite(value);
  const v = has ? Math.max(0, Math.min(100, value)) : 0;
  const r = (size - width) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className={s.ring} style={{ ...tone(color), width: size, height: size }}>
      <svg className={s.ringSvg} width={size} height={size}>
        <circle className={s.ringTrack} cx={size / 2} cy={size / 2} r={r} strokeWidth={width} />
        {has && (
          <circle
            className={s.ringArc}
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={width}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v / 100)}
          />
        )}
      </svg>
      <div className={s.ringCenter}>
        <span className={`${s.ringValue} num`} style={{ fontSize: size * 0.2 }}>
          {has ? `${v.toFixed(decimals ?? (v < 10 ? 1 : 0))}%` : '—'}
        </span>
        {label && <span className={s.ringLabel}>{label}</span>}
      </div>
    </div>
  );
}

/* ── Түлхүүр → утга ── */

export function Rows({ items }: { items: { key: string; value: ReactNode }[] }) {
  return (
    <div className={s.rows}>
      {items.map((r) => (
        <div key={r.key} className={s.row}>
          <span className={s.rowKey}>{r.key}</span>
          <span className={s.rowVal}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Chip ── */

export function Chip({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span className={s.chip} style={tone(color)}>
      {children}
    </span>
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

export function Loading({ label = 'Ачаалж байна…' }: { label?: string }) {
  return (
    <div className={s.state}>
      <span className={s.spinner} aria-hidden />
      {label}
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return <div className={s.state}>{label}</div>;
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
}: {
  q: Async<T>;
  children: (data: T) => ReactNode;
  loading?: string;
}) {
  if (q.state === 'loading') return <Loading label={loading} />;
  if (q.state === 'error') {
    return (
      <div className={s.state} role="alert">
        <strong className={s.error}>Өгөгдөл татагдсангүй</strong>
        <span className={s.errorMsg}>{q.error.message}</span>
        {/* ArcGIS түр гацах нь энгийн — бүтэн refresh хийлгэхгүйгээр энэ
            хүсэлтийг л дахин явуулна (`useAsync`-ийн retry) */}
        {q.retry && (
          <button type="button" className={s.retryBtn} onClick={q.retry}>
            Дахин оролдох
          </button>
        )}
      </div>
    );
  }
  return <>{children(q.data)}</>;
}
