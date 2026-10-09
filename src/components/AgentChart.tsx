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

import { Bars, Series, Donut, Trend, Stack, Ring } from '@/components/ui';
import { parseChart } from '@/lib/agent/chart';
import { cat } from '@/lib/format';
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
   * ⚠️ Энэ бол ЖИНХЭНЭ зэрэглэлийн тохиолдол: цувааг туслах өөрөө үүсгэдэг
   *    тул «утга»гүй, зөвхөн ЯЛГАХ хэрэгтэй. Слотууд нь тогтмол дараалалтай
   *    бөгөөд хоёр горимд CVD-ээр баталгаажсан (`globals.css`).
   * ⚠️ 2026-10-09: өнгө нь ЗҮСМЭГ БҮРД дамжина (`cat(i)`), ганц цуваат
   *    bar/column/line нь бүгд НЭГ өнгө `--data` — ангиллын өнгө утга илэрхийлэхгүй.
   */
  const slices = data.flatMap((d, i) => (d.value == null
    ? []
    : [{ key: `${i}-${d.label}`, label: d.label, value: d.value, color: cat(i) }]));
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

      {/* ⚠️ Тайлбарыг ГРАФИКИЙН ДООР, хүрээн ДОТОР — тусдаа догол мөр болгож
          гаргавал аль диаграмынх нь болох нь тодорхойгүй болно. */}
      {note && <figcaption className={s.chartNote}>{note}</figcaption>}
    </figure>
  );
}
