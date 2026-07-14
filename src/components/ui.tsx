'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { Async } from '@/lib/useAsync';
import s from './ui.module.css';

const tone = (c?: string) => ({ '--tone': c ?? 'var(--hue)' }) as CSSProperties;

/* ── Хэсэг ── */

export function Section({
  title,
  note,
  children,
}: {
  title?: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={s.section}>
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
}: {
  items: Bar[];
  color?: string;
  max?: number;
  selected?: string | null;
  onSelect?: (key: string) => void;
}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));

  return (
    <div className={s.bars}>
      {items.map((it) => {
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
