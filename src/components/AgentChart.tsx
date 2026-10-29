'use client';

/**
 * АГЕНТЫН ХАРИУЛТ ДАХЬ ГРАФИК.
 *
 * Агент ```chart хашлагатай блокт JSON гаргана, энэ файл түүнийг порталын
 * ӨӨРИЙН диаграм компонентоор (`Bars`/`Series`/`Donut`/`Trend`) зурна.
 */

import { Bars, Series, Donut, Trend, Stack, Ring } from '@/components/ui';
import { parseChart } from '@/lib/agent/chart';
import s from '@/components/agent.module.css';

export function AgentChart({ raw }: { raw: string }) {
  const spec = parseChart(raw);
  if (!spec) {
    // Чатыг унагаахгүй — зөвхөн хөгжүүлэгчид мэдэгдэнэ
    console.warn('[selbe] агентын графикийг уншиж чадсангүй:', raw.slice(0, 200));
    return null;
  }

  const { type, title, unit, note, data } = spec;
  /** Тэнхлэгтэй (bar/column/line) мөрүүд — `null` = цоорхой, ХАДГАЛАГДАНА */
  const items = data.map((d, i) => ({ key: `${i}-${d.label}`, label: d.label, value: d.value }));
  /**
   * Эзлэх хувийн (pie/stack) зүсмэгүүд — `parseChart` null-ыг аль хэдийн хассан.
   */
  const slices = data.flatMap((d, i) => (d.value == null
    ? []
    : [{ key: `${i}-${d.label}`, label: d.label, value: d.value }]));
  const gauge = data[0].value;

  return (
    <figure className={s.chart}>
      {title && <p className={s.chartTitle}>{title}</p>}

      {type === 'pie' ? (
        <Donut items={slices} stack size="md" />
      ) : type === 'stack' ? (
        <Stack items={slices} />
      ) : type === 'gauge' ? (
        <Ring value={gauge} label={data[0].label} size="sm" color="var(--data)" />
      ) : type === 'line' ? (
        <Trend points={data.map((d) => ({ label: d.label, value: d.value }))} unit={unit ?? ''} color="var(--data)" />
      ) : type === 'column' ? (
        <Series items={items} unit={unit} color="var(--data)" />
      ) : (
        <Bars items={items} color="var(--data)" />
      )}

      {note && <figcaption className={s.chartNote}>{note}</figcaption>}
    </figure>
  );
}
