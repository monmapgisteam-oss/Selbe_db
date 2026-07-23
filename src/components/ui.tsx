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
export function Split({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className={s.split}>
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
}: {
  items: { key: string; label: string; count?: number | null; warn?: boolean }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className={s.tabs} role="tablist">
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
  selected?: string | null;
  onSelect?: (key: string) => void;
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
  // Хэмжээсийг БҮХ мөрөөр тогтооно — эс бөгөөс задлахад баганы урт үсэрнэ
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  const hidden = limit != null && !all ? Math.max(0, items.length - limit) : 0;
  const shown = hidden > 0 ? items.slice(0, limit) : items;

  return (
    <div className={s.bars}>
      {shown.map((it) => {
        const w = Math.max(0, Math.min(100, (it.value / top) * 100));
        const on = selected === it.key;
        // <button> дотор зөвхөн phrasing content зөвшөөрөгдөнө — <div> ашиглаж болохгүй
        const body = (
          <>
            <span className={s.barTop}>
              <span className={s.barName} title={it.label}>
                {it.label}
              </span>
              <span className={`${s.barVal} num`}>{it.display ?? it.value}</span>
            </span>
            <span className={s.barTrack}>
              <i className={s.barFill} style={{ width: `${w}%` }} />
            </span>
          </>
        );
        const st = tone(it.color ?? color);
        return onSelect ? (
          <button
            key={it.key}
            type="button"
            aria-pressed={on}
            className={`${s.barRow} ${s.barClick} ${on ? s.barOn : ''}`}
            style={st}
            onClick={() => onSelect(it.key)}
          >
            {body}
          </button>
        ) : (
          <div key={it.key} className={s.barRow} style={st}>
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
 * Хувь эзлэх байдлыг харуулах дугуй диаграм.
 *
 * ⚠️ `Stack`-аас ЯЛГААТАЙ хэрэглээ: Stack нь нарийн зурвас — олон ангилалтай,
 * дараалал чухал үед. Donut нь ЦӨӨН (3–7) ангилалын харьцааг онцлоход тохирно.
 * 7-оос олон ангилалд зүсмэгүүд нь ялгагдахаа болих тул Stack эсвэл Bars хэрэглэ.
 *
 * ⚠️ SVG-ийн дугуйг `stroke-dasharray`-аар зурна — олон `<path>` үүсгэхээс хямд
 * бөгөөд өнцөг тооцох тригонометр шаардахгүй.
 */
export function Donut({
  items,
  size = 132,
  width = 22,
  center,
  centerLabel,
  selected,
  onSelect,
}: {
  items: { key: string; label: string; value: number; color: string }[];
  size?: number;
  width?: number;
  /** Голд харуулах утга. Заагаагүй бол нийлбэр. */
  center?: ReactNode;
  centerLabel?: string;
  /** Сонгосон зүсмэгийн key — идэвхтэй бол бусад нь бүдгэрнэ */
  selected?: string | null;
  /** Зүсмэг/тайлбар дарахад — байвал диаграм шүүлтийн удирдлага болно */
  onSelect?: (key: string) => void;
}) {
  const total = items.reduce((a, b) => a + b.value, 0);
  const r = (size - width) / 2;
  const circ = 2 * Math.PI * r;

  // Зүсмэг бүрийн ЭХЛЭХ байрлал — өмнөх зүсмэгүүдийн нийлбэр
  let acc = 0;
  const slices = items.map((it) => {
    const frac = total > 0 ? it.value / total : 0;
    const offset = acc;
    acc += frac;
    return { ...it, frac, offset };
  });

  return (
    <div className={s.donutWrap}>
      <div className={s.donut} style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* -90° эргүүлж 12 цагаас эхлүүлнэ */}
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle className={s.donutTrack} cx={size / 2} cy={size / 2} r={r} strokeWidth={width} />
            {slices.map((sl) => {
              const dim = selected != null && selected !== sl.key;
              return (
                <circle
                  key={sl.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  strokeWidth={selected === sl.key ? width + 3 : width}
                  stroke={sl.color}
                  strokeOpacity={dim ? 0.28 : 1}
                  fill="none"
                  strokeDasharray={`${sl.frac * circ} ${circ}`}
                  strokeDashoffset={-sl.offset * circ}
                  style={onSelect ? { cursor: 'pointer' } : undefined}
                  onClick={onSelect ? () => onSelect(sl.key) : undefined}
                >
                  <title>{`${sl.label}: ${sl.value}`}</title>
                </circle>
              );
            })}
          </g>
        </svg>
        <div className={s.donutCenter}>
          <span className={`${s.donutValue} num`}>{center ?? total}</span>
          {centerLabel && <span className={s.donutLabel}>{centerLabel}</span>}
        </div>
      </div>

      <ul className={s.donutLegend}>
        {slices.map((sl) => {
          const on = selected === sl.key;
          const body = (
            <>
              <span className={s.legendDot} style={{ background: sl.color }} />
              <span className={s.donutName}>{sl.label}</span>
              <b className={`${s.donutPct} num`}>{(sl.frac * 100).toFixed(0)}%</b>
            </>
          );
          return onSelect ? (
            <li key={sl.key}>
              <button
                type="button"
                aria-pressed={on}
                className={`${s.donutItem} ${s.donutClick} ${on ? s.donutOn : ''}`}
                onClick={() => onSelect(sl.key)}
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
}: {
  /** 0–100, эсвэл өгөгдөлгүй бол null */
  value: number | null | undefined;
  size?: number;
  width?: number;
  color?: string;
  label?: string;
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
          {has ? `${v.toFixed(v < 10 ? 1 : 0)}%` : '—'}
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
  return onClick ? (
    <button
      type="button"
      aria-pressed={active}
      className={`${s.listItem} ${active ? s.listOn : ''}`}
      style={tone(color)}
      onClick={onClick}
    >
      {inner}
    </button>
  ) : (
    <div className={s.listItem} style={tone(color)}>
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
      </div>
    );
  }
  return <>{children(q.data)}</>;
}
