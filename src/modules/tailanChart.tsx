'use client';

/**
 * ТАЙЛАНГИЙН ГРАФИКУУД — цэвэр SVG/CSS, ямар ч сан ашиглаагүй.
 */

import type { CSSProperties } from 'react';
import { num, pct } from '@/lib/format';
import { t as tr } from '@/lib/i18nCore';
import { Bars, Meter } from '@/components/ui';
import c from './tailanChart.module.css';

export type BarItem = {
  label: string;
  value: number | null;
  /** Багана дээр гарах бэлэн шошго (мөнгө, хувь, ширхэг…) */
  text?: string;
  /** Онцлох багана — «энэ нэг нь гол» түүх (эмфазис) */
  hot?: boolean;
};

/* ══════════════════ Хүснэгтийн гарчиг ══════════════════ */

/**
 * Графикийн дугаартай тайлбар — хүснэгтийн `Cap`-тай ИЖИЛ хэлбэр.
 */
export function Fig({ no, children }: { no: string; children: React.ReactNode }) {
  return <p className={c.cap}>{tr('Зураг')} {no}. <span>{children}</span></p>;
}

/* ══════════════════ Эрэмбэлсэн багана ══════════════════ */

/**
 * ХЭВТЭЭ БАГАНА — хэмжээг харьцуулна.
 */
export function RankBars({
  items,
  fmt = (v) => num(v),
  title,
  max,
}: {
  items: BarItem[];
  fmt?: (v: number) => string;
  /** Дэлгэц уншигчид зориулсан нэг өгүүлбэр */
  title: string;
  /** Тэнхлэгийн дээд утга — өгөөгүй бол хамгийн их гишүүн */
  max?: number;
}) {
  const vals = items.map((i) => i.value);
  const valid = vals.filter((v): v is number => v != null && Number.isFinite(v));
  if (!items.length || !valid.length) return <p className={c.empty}>{tr('мэдээлэлгүй')}</p>;
  // Keep a common baseline, including measured zeroes and values above 100%.
  const top = Math.max(max ?? 0, ...valid, 1);

  const anyHot = items.some((it) => it.hot);
  return (
    <figure className={c.fig} aria-label={title}>
      <Bars
        max={top}
        items={items.map((it, i) => {
          const has = it.value != null && Number.isFinite(it.value);
          return {
            key: `${it.label}-${i}`,
            label: it.label,
            value: has ? it.value : null,
            display: has ? (it.text ?? fmt(it.value as number)) : tr('мэдээлэлгүй'),
            color: it.hot
              ? 'var(--rank-hot, var(--data))'
              : anyHot
                ? 'var(--rank-dim, color-mix(in oklab, var(--data) 60%, transparent))'
                : 'var(--rank-dim, var(--data))',
          };
        })}
      />
    </figure>
  );
}

/* ══════════════════ Хугацааны цуваа ══════════════════ */

/* ══════════════════ Хэмжүүр ══════════════════ */

/**
 * ХЭМЖҮҮР — нэг харьцаа, лавлах утгатай.
 */
/**
 * ХОЦРОГДЛЫН БОСГО — (төлөвлөсөн − бодит) нэгж хувь энэ ба түүнээс дээш бол
 * «хоцрогдол». `Meter`-ийн өнгө ба `ExecReport`-ийн KPI шошго НЭГ босго.
 */
import { LATE_GAP } from '@/lib/execReport';
export { LATE_GAP };

export function PlanMeter({
  value,
  plan,
  label,
}: {
  /** 0–100 хувь */
  value: number | null;
  /** Төлөвлөгөөт хувь — лавлах зураас (0–100) */
  plan?: number | null;
  label: string;
}) {
  if (value == null || !Number.isFinite(value)) return null;
  const hasP = plan != null && Number.isFinite(plan);
  const late = hasP && plan - value >= LATE_GAP;
  return (
    <div className={c.meterBlock}>
      <Meter
        label={label}
        value={value}
        plan={hasP ? plan : null}
        decimals={2}
        tone={late ? 'warn' : 'data'}
        display={hasP
          ? `${tr('Бодит')}: ${pct(value, 2)} · ${tr('Төлөвлөгөө')}: ${pct(plan, 2)}`
          : `${tr('Бодит')}: ${pct(value, 2)}`}
      />
    </div>
  );
}

/* ══════════════════ Үзүүлэлтийн эгнээ ══════════════════ */

/** `trend` — хугацааны өөрчлөлт (▲/▼, `execPeriodCalc.deltaText`) — 2026-10-28 */
export type Kpi = { label: string; value: string; sub?: string; trend?: { text: string; tone: 'good' | 'bad' | 'mute' } | null };

/**
 * ГОЛ ҮЗҮҮЛЭЛТИЙН ЭГНЭЭ — цөөн толгой тоо.
 */
export function KpiRow({ items, cols }: {
  items: Kpi[];
  /**
   * БАГАНЫН ТОО — өгөөгүй бол өргөнөөр өөрөө хуваагдана (`auto-fit`).
   */
  cols?: number;
}) {
  if (!items.length) return null;
  return (
    <div
      className={cols ? `${c.kpis} ${c.kpisCols}` : c.kpis}
      style={cols ? ({ '--kpi-cols': cols } as CSSProperties) : undefined}
    >
      {items.map((k, i) => (
        <div key={`${k.label}-${i}`} className={c.kpi}>
          <span className={c.kpiLabel}>{k.label}</span>
          <b className={c.kpiVal}>{k.value}</b>
          {k.sub && <span className={c.kpiSub}>{k.sub}</span>}
          {k.trend ? <span className={`${c.kpiTrend} ${c[`tone_${k.trend.tone}`]}`}>{k.trend.text}</span> : null}
        </div>
      ))}
    </div>
  );
}
