'use client';

/**
 * ТУХ — ГРАФИКИЙН ЖИЖИГ БҮРЭЛДЭХҮҮН.
 */
import type { CSSProperties, ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { dayKey, pct } from '@/lib/format';
import { useTip } from '@/components/ui';
import s from '../tuh.module.css';


/* ══════════════════════ Тайлбар ══════════════════════ */

/** Графикийн тайлбар — Environment `.stacked-chart-legend` хэлбэр (2026-10-23) */
export function Legend({ items }: {
  items: { key: string; label: string; color: string; kind?: 'line' | 'dash' | 'box' | 'hatch' | 'diamond' }[];
}) {
  return (
    <div className={s.legend}>
      {items.map((it) => (
        <span key={it.key}>
          <i className={s[`leg_${it.kind ?? 'line'}`]} style={{ '--c': it.color } as CSSProperties} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ══════════════════════ Гантт ══════════════════════ */

/** «Хуваарь»-ийн төлөвийн палитр (`plan.Status`) */
export type BarSt = 'done' | 'run' | 'late' | 'todo' | 'none';

export type GanttRow = {
  key: string;
  label: ReactNode;
  sub?: ReactNode;
  heading?: boolean;
  start?: number | null;
  end?: number | null;
  /** Гүйцэтгэл 0–100 — зурвасын ДОТОР шошго (системийн `plBarLab`) */
  progress?: number | null;
  /** Зурвасын өнгө — «Хуваарь»-тай ижил (дууссан · явж буй · хоцорсон · эхлээгүй · огноогүй) */
  st?: BarSt;
  /** Нимгэн хоёр дахь зурвас (гүйцэтгэгчийн төлөвлөгөө / таамаг) */
  thin?: { start: number | null; end: number | null } | null;
  marks?: { at: number; kind: 'commission' | 'heat' | 'milestone'; label: string }[];
  onClick?: () => void;
  active?: boolean;
};

const MS_DAY = 86_400_000;
const ymd = (ms: number) => dayKey(ms);

/**
 * Гантт-ын тайлбар — «Хуваарь»-ийн өнгөөр.
 */
export const GANTT_LEGEND = () => [
  { key: 'done', label: tr('Дууссан'), color: 'var(--gantt-done)', kind: 'box' as const },
  { key: 'run', label: tr('Хийгдэж байна'), color: 'var(--gantt-run)', kind: 'box' as const },
  { key: 'late', label: tr('Хоцорсон'), color: 'var(--gantt-late)', kind: 'box' as const },
  { key: 'todo', label: tr('Эхлээгүй'), color: 'var(--gantt-todo)', kind: 'box' as const },
  { key: 'none', label: tr('Гэрээлээгүй / мэдээлэлгүй'), color: 'var(--ink-3)', kind: 'hatch' as const },
];

/**
 * Хугацааны гантт — «Хуваарь»-ийн зурвасын хэлээр (HTML мөр + хувьт байрлал).
 */
export function Gantt({ rows, from, to, now }: { rows: GanttRow[]; from: number; to: number; now: number }) {
  const tip = useTip();
  const span = Math.max(MS_DAY, to - from);
  const pos = (ms: number) => Math.max(0, Math.min(100, ((ms - from) / span) * 100));
  /* Сарын толгой — «Хуваарь»-ийн `plMonth`; 1-р сард оныг тодоор */
  const months: { at: number; left: number; label: string; year: boolean }[] = [];
  const a = new Date(from);
  const stepM = span / MS_DAY > 900 ? 3 : 1;
  const y0 = a.getFullYear();
  const m0 = a.getMonth();
  for (let m = m0 - (m0 % stepM); ; m += stepM) {
    const at = new Date(y0, m, 1).getTime();
    if (at > to) break;
    if (at >= from) {
      const d = new Date(at);
      const yr = d.getMonth() === 0;
      months.push({ at, left: pos(at), year: yr, label: yr ? String(d.getFullYear()) : String(d.getMonth() + 1).padStart(2, '0') });
    }
  }
  return (
    <div className={s.gantt}>
      <div className={s.ganttHead}>
        <span className={s.ganttSide} />
        <span className={s.ganttScale}>
          {months.map((mo) => (
            <b key={mo.at} className={mo.year ? s.ganttYearLbl : ''} style={{ left: `${mo.left}%` } as CSSProperties}>{mo.label}</b>
          ))}
        </span>
      </div>
      {rows.map((r, idx) => {
        const has = r.start != null && r.end != null && r.end >= r.start;
        const Tag = r.onClick ? 'button' : 'div';
        const w = has ? Math.max(0.6, pos(r.end!) - pos(r.start!)) : 0;
        return (
          <Tag
            key={r.key}
            type={r.onClick ? 'button' : undefined}
            className={`${s.ganttRow} ${r.heading ? s.ganttHeading : ''} ${r.active ? s.ganttActive : ''} ${idx % 2 ? s.ganttAlt : ''}`}
            onClick={r.onClick}
          >
            <span className={s.ganttLabel}>
              {r.label}
              {r.sub && <small>{r.sub}</small>}
            </span>
            <span className={s.ganttTrack}>
              {months.map((mo) => <i key={mo.at} className={mo.year ? s.ganttYear : s.ganttTick} style={{ left: `${mo.left}%` } as CSSProperties} />)}
              {!r.heading && has && (
                <span
                  className={`${s.ganttBar} ${s[`st_${r.st ?? 'run'}`]}`}
                  style={{ left: `${pos(r.start!)}%`, width: `${w}%` } as CSSProperties}
                  {...tip.bind({
                    label: typeof r.label === 'string' ? r.label : '',
                    value: `${ymd(r.start!)} – ${ymd(r.end!)}`,
                    hint: r.progress != null ? `${tr('Гүйцэтгэл')}: ${pct(r.progress, 1)}` : undefined,
                    color: `var(--gantt-${r.st === 'done' ? 'done' : r.st === 'late' ? 'late' : r.st === 'todo' || r.st === 'none' ? 'todo' : 'run'})`,
                  })}
                  role="img"
                  aria-label={`${ymd(r.start!)} – ${ymd(r.end!)}${r.progress != null ? ` · ${pct(r.progress, 1)}` : ''}`}
                />
              )}
              {!r.heading && has && r.progress != null && (
                pos(r.end!) > 88 && pos(r.start!) > 12
                  ? (
                    <em className={`${s.ganttPct} ${s.ganttPctL}`} style={{ left: `calc(${pos(r.start!)}% - 4px)` } as CSSProperties}>
                      {pct(r.progress, r.progress < 10 ? 1 : 0)}
                    </em>
                  )
                  : (
                    <em className={s.ganttPct} style={{ left: `calc(${pos(r.end!)}% + 4px)` } as CSSProperties}>
                      {pct(r.progress, r.progress < 10 ? 1 : 0)}
                    </em>
                  )
              )}
              {!r.heading && r.thin && r.thin.start != null && r.thin.end != null && (
                <span className={s.ganttThin}
                  style={{ left: `${pos(r.thin.start)}%`, width: `${Math.max(0.4, pos(r.thin.end) - pos(r.thin.start))}%` } as CSSProperties} />
              )}
              {!r.heading && !has && !(r.marks?.length) && <em className={s.ganttNoDate}>{tr('огноогүй')}</em>}
              {r.marks?.map((m) => (
                <span key={`${m.kind}${m.at}`} className={s.ganttMark} data-kind={m.kind}
                  style={{ left: `${pos(m.at)}%` } as CSSProperties}
                  {...tip.bind({ label: m.label, value: ymd(m.at) })}
                  role="img" aria-label={`${m.label} · ${ymd(m.at)}`}>◆</span>
              ))}
              {now >= from && now <= to && <i className={s.ganttNow} style={{ left: `${pos(now)}%` } as CSSProperties} />}
            </span>
          </Tag>
        );
      })}
      {tip.node}
    </div>
  );
}
