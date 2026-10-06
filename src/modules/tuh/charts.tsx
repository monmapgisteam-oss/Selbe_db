'use client';

/**
 * ТУХ — ГРАФИКИЙН ЖИЖИГ БҮРЭЛДЭХҮҮН.
 *
 * ⚠️ ЗАГВАР НЬ ҮНДСЭН СИСТЕМИЙНХ (2026-10-01, хэрэглэгч: «ТУХ хэсгийн бүх
 *    чартуудын дизайныг зас, үндсэн системээс зөрж байна»):
 *      · Хэмжигч — `ui.Bars`-ийн 2px зурвас (`barTrack`/`barFill`) + төлөвлөгөөний зураас;
 *      · Тайлбар — «Гүйцэтгэлийн явц»-ийн легенд (`pkgProg.progLegend`): 11px, 18px шугам;
 *      · Гантт — «Хуваарь»-ийн зурвас (`huvaari.plBar` · `tlDone/Run/Late/Todo/None`):
 *        төлвөөр БҮРЭН будагдсан 3px булантай зурвас, дотроо цагаан шошго,
 *        сарын толгой, ээлжилсэн мөр.
 *    S-муруй, санхүүжилтийн муруй, хүн хүч — системийн `ProgChart` · `ComboChart` ·
 *    `ui.Series` ШУУД (ТУХ өөрийн хувилбар зурахгүй).
 * ⚠️ Хэв маягийг CSS-ээр ХУУЛБАРЛАСАН (`tuh.module.css`) — харагдацууд CSS
 *    хуваалцдаггүй (`layout.tsx`-ийн ⚠️). Тэдгээрийг өөрчилбөл ЭНДЭЭ ч өөрчил.
 */
import type { CSSProperties, ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { dayKey } from '@/lib/format';
import s from '../tuh.module.css';

/* ══════════════════════ Хэмжигч ══════════════════════ */

/** Хэвтээ хэмжигч (`ui.Bars`-ийн зурвас) — дүүргэлт 0–100, `plan` нь төлөвлөгөөний зураас */
export function Meter({ value, plan, tone = 'data', wide }: {
  value: number | null;
  plan?: number | null;
  tone?: 'data' | 'good' | 'warn' | 'bad' | 'mute';
  /** ⚠️ 2026-10-05 (merge): Тайлангийн толгойн том хэмжигч (`ReportContents`, tezu-bonu) — өндөр 8px */
  wide?: boolean;
}) {
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  const p = plan == null ? null : Math.max(0, Math.min(100, plan));
  return (
    <span className={`${s.meter} chartTrack${wide ? ` ${s.meterWide}` : ''}`} data-tone={tone}>
      {v != null && <span className={`${s.meterFill} chartFill`} style={{ width: `${v}%` } as CSSProperties} />}
      {p != null && <span className={s.meterPlan} style={{ left: `${p}%` } as CSSProperties} />}
    </span>
  );
}

/* ══════════════════════ Тайлбар ══════════════════════ */

/** Графикийн тайлбар — «Гүйцэтгэлийн явц»-ийн легендтэй ижил хэлбэр */
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
/* ⚠️ 2026-09-30: ОРОН НУТГИЙН өдөр (`format.dayKey`-ийн ⚠️) — урьд нь `toISOString` (UTC)
   тул УБ-ын шөнө дундын огноо (AGOL/Excel) гантын тайлбарт ӨМНӨХ өдөр болж, хажуугийн
   хүснэгтийн `date()`-ээс нэг өдрөөр зөрдөг байв. */
const ymd = (ms: number) => dayKey(ms);

/** Гантт-ын тайлбар — «Хуваарь»-ийн өнгөөр */
export const GANTT_LEGEND = () => [
  { key: 'done', label: tr('Дууссан'), color: 'var(--good)', kind: 'box' as const },
  { key: 'run', label: tr('Хийгдэж байна'), color: 'var(--data)', kind: 'box' as const },
  { key: 'late', label: tr('Хоцорсон'), color: 'var(--bad)', kind: 'box' as const },
  { key: 'todo', label: tr('Эхлээгүй'), color: 'color-mix(in srgb, var(--ink-3) 45%, transparent)', kind: 'box' as const },
  { key: 'none', label: tr('Гэрээлээгүй / мэдээлэлгүй'), color: 'var(--ink-3)', kind: 'hatch' as const },
];

/**
 * Хугацааны гантт — «Хуваарь»-ийн зурвасын хэлээр (HTML мөр + хувьт байрлал).
 * ⚠️ Огноогүй мөр ЗУРВАС ЗУРАХГҮЙ — «огноогүй» гэж бичнэ (өнөөдөр гэж таамаглахгүй).
 */
export function Gantt({ rows, from, to, now }: { rows: GanttRow[]; from: number; to: number; now: number }) {
  const span = Math.max(MS_DAY, to - from);
  const pos = (ms: number) => Math.max(0, Math.min(100, ((ms - from) / span) * 100));
  /* Сарын толгой — «Хуваарь»-ийн `plMonth`; 1-р сард оныг тодоор */
  const months: { at: number; left: number; label: string; year: boolean }[] = [];
  const a = new Date(from);
  const stepM = span / MS_DAY > 900 ? 3 : 1;
  const y0 = a.getUTCFullYear();
  /* ⚠️ 2026-10-06 (аудит): алхам 3 сар үед эхлэлийг 1·4·7·10-р сард ТЭГШЛЭНЭ.
     Урьд нь домэйны эхний сараас (жишээ нь 2-р сар) 3-аар алхдаг тул 1-р сар
     ХЭЗЭЭ Ч таарахгүй — оны шошго, оны зураас огт гардаггүй байв. Тэгшилсэн
     эхлэл `from`-оос өмнө байж болно — доорх `at >= from` шүүлт түүнийг алгасна. */
  const m0 = a.getUTCMonth();
  for (let m = m0 - (m0 % stepM); ; m += stepM) {
    const at = Date.UTC(y0, m, 1);
    if (at > to) break;
    if (at >= from) {
      const d = new Date(at);
      const yr = d.getUTCMonth() === 0;
      months.push({ at, left: pos(at), year: yr, label: yr ? String(d.getUTCFullYear()) : String(d.getUTCMonth() + 1).padStart(2, '0') });
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
                  title={`${ymd(r.start!)} – ${ymd(r.end!)}${r.progress != null ? ` · ${r.progress.toFixed(1)}%` : ''}`}
                  /* ⚠️ 2026-10-06 (аудит): огноо нь ЗӨВХӨН `title`-д байсан тул гараар /
                     дэлгэц уншигчаар хүрэх аргагүй байв — `role="img"` + `aria-label`. */
                  role="img"
                  aria-label={`${ymd(r.start!)} – ${ymd(r.end!)}${r.progress != null ? ` · ${r.progress.toFixed(1)}%` : ''}`}
                >
                  {r.progress != null && w > 4 && <span className={s.ganttBarLab}>{`${r.progress.toFixed(r.progress < 10 ? 1 : 0)}%`}</span>}
                </span>
              )}
              {!r.heading && has && r.progress != null && w <= 4 && (
                <em className={s.ganttPct} style={{ left: `calc(${pos(r.end!)}% + 4px)` } as CSSProperties}>
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
                  style={{ left: `${pos(m.at)}%` } as CSSProperties} title={`${m.label} · ${ymd(m.at)}`}
                  role="img" aria-label={`${m.label} · ${ymd(m.at)}`}>◆</span>
              ))}
              {now >= from && now <= to && <i className={s.ganttNow} style={{ left: `${pos(now)}%` } as CSSProperties} />}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}
