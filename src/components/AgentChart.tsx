'use client';

/**
 * АГЕНТЫН ХАРИУЛТ ДАХЬ ГРАФИК.
 *
 * Агент ```chart хашлагатай блокт JSON гаргана, энэ файл түүнийг порталын
 * ӨӨРИЙН диаграм компонентоор (`Bars`/`Series`/`Donut`/`Trend`) зурна.
 *
 * ⚠️ ШИНЭ ГРАФИКИЙН САН НЭМЭЭГҮЙ. `ui.tsx`-д дөрвөн төрөл аль хэдийн бий
 * бөгөөд дашбоард тэднийг хэрэглэдэг. Тусад нь сан оруулбал (а) bundle
 * хэдэн зуун КБ-аар өснө, (б) чат дахь график дашбоардынхаас өөр харагдана.
 *
 * ⚠️ БУРУУ JSON ЧАТЫГ УНАГААХ ЁСГҮЙ. Задлан шинжлэх бүх алдаанд `null`
 * буцаана (`chart.ts`) — хариултын текст, хүснэгт хэвийн харагдана.
 */

import { Bars, Series, Donut, Trend } from '@/components/ui';
import { parseChart, PALETTE } from '@/lib/agent/chart';
import s from '@/components/agent.module.css';

export function AgentChart({ raw }: { raw: string }) {
  const spec = parseChart(raw);
  if (!spec) {
    // Чатыг унагаахгүй — зөвхөн хөгжүүлэгчид мэдэгдэнэ
    console.warn('[selbe] агентын графикийг уншиж чадсангүй:', raw.slice(0, 200));
    return null;
  }

  const { type, title, unit, data } = spec;
  const items = data.map((d, i) => ({
    key: `${i}-${d.label}`,
    label: d.label,
    value: d.value,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <figure className={s.chart}>
      {title && <figcaption className={s.chartTitle}>{title}</figcaption>}
      {type === 'pie' ? (
        <Donut items={items} stack size={128} />
      ) : type === 'line' ? (
        <Trend points={data.map((d) => ({ label: d.label, value: d.value }))} unit={unit ?? ''} />
      ) : type === 'column' ? (
        <Series items={items} unit={unit} />
      ) : (
        // `Bars` нь нэг өнгөөр илүү цэвэрхэн — ангиллын өнгө утга илэрхийлэхгүй
        <Bars items={items.map(({ color: _c, ...b }) => b)} color={PALETTE[0]} />
      )}
    </figure>
  );
}
