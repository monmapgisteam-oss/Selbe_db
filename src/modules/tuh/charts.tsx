'use client';

/**
 * ТУХ — ГРАФИКИЙН ЖИЖИГ БҮРЭЛДЭХҮҮН (in-house SVG/HTML, гадны сангүй).
 *
 * ⚠️ Портал ганц ч график сан хэрэглэдэггүй (`ui.tsx` · `PkgProg.ProgChart`) —
 *    энд ч мөн адил. Өнгө нь ЗӨВХӨН глобал токен (`var(--data)`, `var(--cN)` …),
 *    гэрэл/харанхуй горимд өөрөө солигдоно.
 * ⚠️ `null` ≠ 0 — хэмжилтгүй цэг ЗУРАГДАХГҮЙ (шугам тасарна), 0 гэж унахгүй.
 * ⚠️ Графикт ЗӨВХӨН сүүлийн цэгийн шошго биш — хулганаар цэг бүрийн утга (tooltip)
 *    харагдана (CLAUDE.md: «дунд цэгүүд хамгийн их мэдээлэлтэй»).
 */
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useChartWidth, fitLabels, textW } from '@/lib/chartFit';
import s from '../tuh.module.css';

/* ══════════════════════ Хэмжигч (meter) ══════════════════════ */

/** Хэвтээ хэмжигч — дүүргэлт 0–100, `plan` нь төлөвлөгөөний зураас */
export function Meter({ value, plan, tone = 'data', wide }: {
  value: number | null;
  plan?: number | null;
  tone?: 'data' | 'good' | 'warn' | 'bad' | 'mute';
  wide?: boolean;
}) {
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  const p = plan == null ? null : Math.max(0, Math.min(100, plan));
  return (
    <span className={`${s.meter} ${wide ? s.meterWide : ''}`} data-tone={tone}>
      {v != null && <span className={s.meterFill} style={{ width: `${v}%` } as CSSProperties} />}
      {p != null && <span className={s.meterPlan} style={{ left: `${p}%` } as CSSProperties} />}
    </span>
  );
}

/** «2026-09» → «2026.09», «2026-09-28» → «09.28» */
const shortLabel = (l: string) => (/^\d{4}-\d{2}-\d{2}$/.test(l) ? `${l.slice(5, 7)}.${l.slice(8, 10)}`
  : /^\d{4}-\d{2}$/.test(l) ? `${l.slice(0, 4)}.${l.slice(5, 7)}` : l);

/** Графикийн тайлбар (legend) */
export function Legend({ items }: { items: { key: string; label: string; color: string; dash?: boolean; diamond?: boolean; box?: boolean }[] }) {
  return (
    <div className={s.legend}>
      {items.map((it) => (
        <span key={it.key} className={s.legendItem}>
          <i
            className={it.diamond ? s.legDiamond : it.box ? s.legBox : it.dash ? s.legDash : s.legLine}
            style={{ '--c': it.color } as CSSProperties}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ══════════════════════ Багана график ══════════════════════ */

/**
 * Баганан график — өдөр бүрийн тоо (хүн хүч).
 * ⚠️ Тэнхлэг, огноо, утга ЗААВАЛ — тэнхлэггүй баганыг хэрэглэгч уншиж чадахгүй
 *    байсан (2026-09-30). Утга нь багтаамжаар багана бүр дээр; `null` өдөр
 *    багана зурахгүй (0 биш).
 */
export function BarChart({ items, height = 160, fmt }: {
  items: { key: string; label: string; value: number | null }[];
  height?: number;
  fmt: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const W = useChartWidth(ref, 600);
  const [hi, setHi] = useState<number | null>(null);
  const n = items.length;
  if (!n) return <div ref={ref} className={s.chartEmpty}>—</div>;
  const max = Math.max(1, ...items.map((x) => x.value ?? 0)) * 1.15;
  const ticks = [0, 0.5, 1].map((f) => Math.round(f * max));
  const padL = Math.max(30, Math.max(...ticks.map((t) => textW(fmt(t), 10))) + 10);
  const padR = 8;
  const padT = 16;
  const padB = 26;
  const iw = Math.max(10, W - padL - padR);
  const ih = height - padT - padB;
  const bw = iw / n;
  const y = (v: number) => padT + ih - (v / max) * ih;
  const cx = (i: number) => padL + bw * i + bw / 2;
  const vLbl = new Set(fitLabels(items.map((it, i) => (it.value == null ? null : { i, x: cx(i), w: textW(fmt(it.value), 10), anchor: 'middle' as const }))
    .filter((q): q is NonNullable<typeof q> => q != null), 4));
  const dLbl = new Set(fitLabels(items.map((it, i) => ({ i, x: cx(i), w: textW(shortLabel(it.label), 10), anchor: 'middle' as const })), 10));
  return (
    <div ref={ref} className={s.chart} onMouseLeave={() => setHi(null)}>
      <svg width={W} height={height} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line className={s.grid} x1={padL} x2={padL + iw} y1={y(t)} y2={y(t)} />
            <text className={s.axis} x={padL - 5} y={y(t) + 3} textAnchor="end">{fmt(t)}</text>
          </g>
        ))}
        {items.map((it, i) => (
          <g key={it.key} onMouseEnter={() => setHi(i)}>
            <rect x={padL + bw * i} y={padT} width={bw} height={ih} fill="transparent" />
            {it.value != null && (
              <rect className={s.barRect} data-hi={hi === i ? '' : undefined}
                x={padL + bw * i + Math.min(2, bw * 0.15)} y={y(it.value)}
                width={Math.max(1, bw - Math.min(4, bw * 0.3))} height={Math.max(1, padT + ih - y(it.value))} rx={1.5} />
            )}
            {it.value != null && vLbl.has(i) && (
              <text className={s.ptLbl} x={cx(i)} y={y(it.value) - 4} textAnchor="middle">{fmt(it.value)}</text>
            )}
            {dLbl.has(i) && <text className={s.axis} x={cx(i)} y={height - 8} textAnchor="middle">{shortLabel(it.label)}</text>}
          </g>
        ))}
      </svg>
      {hi != null && (
        <div className={s.tip} style={{ left: Math.min(W - 160, Math.max(0, cx(hi) + 8)) } as CSSProperties}>
          <b>{items[hi].label}</b>
          <span>{items[hi].value == null ? '—' : fmt(items[hi].value!)}</span>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════ Гантт ══════════════════════ */

export type GanttRow = {
  key: string;
  label: ReactNode;
  sub?: ReactNode;
  heading?: boolean;
  start?: number | null;
  end?: number | null;
  /** Гүйцэтгэл 0–100 — бар дотор дүүргэлт */
  progress?: number | null;
  tone?: 'good' | 'warn' | 'bad' | 'mute' | 'data';
  /** Нимгэн хоёр дахь бар (таамаг / суурь) */
  thin?: { start: number | null; end: number | null } | null;
  marks?: { at: number; kind: 'commission' | 'heat' | 'milestone'; label: string }[];
  onClick?: () => void;
  active?: boolean;
};

const MS_DAY = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Хугацааны гантт — HTML мөр + хувьт байрлал (SVG биш): мөр бүр нэг бар.
 * ⚠️ Огноогүй мөр БАР ЗУРАХГҮЙ — «огноогүй» гэж бичнэ (0 эсвэл өнөөдөр гэж таамаглахгүй).
 */
export function Gantt({ rows, from, to, now }: { rows: GanttRow[]; from: number; to: number; now: number }) {
  const span = Math.max(MS_DAY, to - from);
  const pos = (ms: number) => Math.max(0, Math.min(100, ((ms - from) / span) * 100));
  const years: { y: number; left: number }[] = [];
  for (let y = new Date(from).getUTCFullYear(); y <= new Date(to).getUTCFullYear(); y += 1) {
    const at = Date.UTC(y, 0, 1);
    if (at >= from && at <= to) years.push({ y, left: pos(at) });
  }
  const winters: { left: number; width: number }[] = [];
  for (let y = new Date(from).getUTCFullYear() - 1; y <= new Date(to).getUTCFullYear(); y += 1) {
    const a = Math.max(from, Date.UTC(y, 10, 1));
    const b = Math.min(to, Date.UTC(y + 1, 3, 1));
    if (b > a) winters.push({ left: pos(a), width: pos(b) - pos(a) });
  }
  return (
    <div className={s.gantt}>
      <div className={s.ganttHead}>
        <span />
        <span className={s.ganttScale}>
          {years.map((y) => <b key={y.y} style={{ left: `${y.left}%` } as CSSProperties}>{y.y}</b>)}
        </span>
      </div>
      {rows.map((r) => {
        const has = r.start != null && r.end != null && r.end >= r.start;
        const Tag = r.onClick ? 'button' : 'div';
        return (
          <Tag
            key={r.key}
            type={r.onClick ? 'button' : undefined}
            className={`${s.ganttRow} ${r.heading ? s.ganttHeading : ''} ${r.active ? s.ganttActive : ''}`}
            onClick={r.onClick}
          >
            <span className={s.ganttLabel}>
              {r.label}
              {r.sub && <small>{r.sub}</small>}
            </span>
            <span className={s.ganttTrack}>
              {winters.map((w, i) => <i key={i} className={s.ganttWinter} style={{ left: `${w.left}%`, width: `${w.width}%` } as CSSProperties} />)}
              {years.map((y) => <i key={y.y} className={s.ganttYear} style={{ left: `${y.left}%` } as CSSProperties} />)}
              {!r.heading && has && (
                <span
                  className={s.ganttBar}
                  data-tone={r.tone ?? 'data'}
                  style={{ left: `${pos(r.start!)}%`, width: `${Math.max(0.6, pos(r.end!) - pos(r.start!))}%` } as CSSProperties}
                  title={`${ymd(r.start!)} – ${ymd(r.end!)}${r.progress != null ? ` · ${r.progress.toFixed(1)}%` : ''}`}
                >
                  {r.progress != null && <i style={{ width: `${Math.max(0, Math.min(100, r.progress))}%` } as CSSProperties} />}
                </span>
              )}
              {/* Гүйцэтгэлийн хувь — барын АРД (зөвхөн өнгөөр уншуулахгүй) */}
              {!r.heading && has && r.progress != null && (
                <em className={s.ganttPct} style={{ left: `min(calc(${pos(r.end!)}% + 4px), calc(100% - 44px))` } as CSSProperties}>
                  {`${r.progress.toFixed(r.progress < 10 ? 1 : 0)}%`}
                </em>
              )}
              {!r.heading && r.thin && r.thin.start != null && r.thin.end != null && (
                <span className={s.ganttThin}
                  style={{ left: `${pos(r.thin.start)}%`, width: `${Math.max(0.4, pos(r.thin.end) - pos(r.thin.start))}%` } as CSSProperties} />
              )}
              {!r.heading && !has && !(r.marks?.length) && <em className={s.ganttNoDate}>{tr('огноогүй')}</em>}
              {r.marks?.map((m) => (
                <span key={`${m.kind}${m.at}`} className={s.ganttMark} data-kind={m.kind}
                  style={{ left: `${pos(m.at)}%` } as CSSProperties} title={`${m.label} · ${ymd(m.at)}`}>◆</span>
              ))}
              {now >= from && now <= to && <i className={s.ganttNow} style={{ left: `${pos(now)}%` } as CSSProperties} />}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}
