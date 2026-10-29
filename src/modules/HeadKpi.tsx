'use client';

/**
 * ТОЛГОЙН ҮЗҮҮЛЭЛТИЙН МӨР (`HeadKpi`) ба түүний «…/ /—» туслахууд.
 */

import type { CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { friendlyError } from '@/components/ui';
import { useAsync, type Async } from '@/lib/useAsync';
import { loadFinData, physNow } from '@/modules/Finance';
import { num, monthKey } from '@/lib/format';
import { loadHeadline, type Headline } from '@/lib/live';
import { ailTotal, ailLabel, type BagtsRow } from '@/lib/execData';
import o from './dashboardOv.module.css';

/**
 * Утга хараахан алга үед юу харуулах вэ: ачаалж байвал «…», УНАСАН бол «—».
 */
export const ERR_MARK = '⚠';
export type AsyncLike = { state: string; error?: Error | null; retry?: () => void };
export type Dots = (...qs: AsyncLike[]) => string;
export const dots: Dots = (...qs) =>
  qs.some((q) => q.state === 'loading') ? '…' : qs.some((q) => q.state === 'error') ? ERR_MARK : '—';
/**
 * `Headline`-ийн тоон талбар → бичвэр. 2026-10-05: ХЭСЭГЧИЛСЭН үр дүнгийн (`h.partial` — аль
 * нэг эх унасан) NaN нь «мэдээлэлгүй» БИШ «татагдсангүй» тул « »; урьд нь `num(NaN)` → «—».
 */
export const hVal = (h: Headline, v: number, fmt: (n: number) => string): string =>
  h.partial && Number.isNaN(v) ? ERR_MARK : fmt(v);

/** « » — шалтгаан нь title-д; `retry` байвал дарж ЗӨВХӨН тэр хүсэлтийг дахин явуулна */
export function FailVal({ q }: { q: AsyncLike }) {
  const why = friendlyError(q.error);
  const style: CSSProperties = { color: 'var(--bad-ink)', font: 'inherit', background: 'none', border: 0, padding: 0 };
  return q.retry ? (
    <button
      type="button"
      onClick={q.retry}
      title={`${why} · ${tr('Дахин оролдох')}`}
      aria-label={`${why} · ${tr('Дахин оролдох')}`}
      style={{ ...style, cursor: 'pointer' }}
    >
      {ERR_MARK}
    </button>
  ) : (
    <span role="img" title={why} aria-label={why} style={style}>{ERR_MARK}</span>
  );
}

/* ══════════════════ Толгойн үзүүлэлт ══════════════════ */

export function HeadKpi({ bagts, extra }: {
  bagts: Async<BagtsRow[]>;
  /**
   * «Иргэдэд хүрэх үр өгөөж» нь гэр хорооллын байшин/гэр/нүхэн жорлонгийн
   * тоог ЭНЭ зурваст залгуулна — тэдгээр нь тухайн харагдацын контекст бөгөөд
   * зүүн баганад тусдаа карт болгоход зурвастай ЯГ ижил үүрэгтэй хоёр зүйл
   * зэрэг харагддаг байв. Дашбоард `extra` дамжуулахгүй тул таван нүд хэвээр.
   */
  extra?: { v: string; unit?: string; label: string }[];
}) {
  const b = bagts.state === 'ready' ? bagts.data : null;
  const ailT = b ? ailTotal(b) : null;
  const hq = useAsync(loadHeadline, []);
  const pq = useAsync(loadFinData, []);
  const h = hq.state === 'ready' ? hq.data : null;
  const p = { actual: pq.state === 'ready' ? physNow(pq.data, monthKey()) : null };

  const tiles: { v: string; unit?: string; label: string; lead?: true; title?: string; q?: AsyncLike }[] = [
    { v: h == null ? dots(hq) : hVal(h, h.areaHa, (n) => num(n, 1)), unit: tr('га'), label: tr('Төслийн талбай'), q: hq },
    { v: b == null || ailT == null ? dots(bagts) : ailLabel(b), unit: tr('өрх'), label: tr('Өрхийн орон сууц'), q: bagts },
    { v: h == null ? dots(hq) : hVal(h, h.population, (n) => num(n)), unit: tr('хүн'), label: tr('Хамрагдах хүн ам'), q: hq },
    {
      v: p.actual != null ? num(p.actual, 1) : dots(pq), unit: '%', q: pq,
      label: tr('Биет гүйцэтгэл (багцаар)'),
      title: tr('Барилга угсралтын биет гүйцэтгэл — багц бүрийн сүүлийн сарын хэмжилт, багцын ХО дүнгээр жигнэсэн (05. Багцын гүйцэтгэлтэй ижил)'),
      lead: true,
    },
    {
      v: h == null ? dots(hq) : hVal(h, h.investTotal, (n) => num(n)), unit: tr('₮'), label: tr('Төслийн нийт төсөв'), q: hq,
      title: tr('Орон сууцны хороолол ба ГИШС-ийн хүрээний төсөвт өртөг (Excel-ийн НИЙТ мөр); нийгмийн дэд бүтэц, газар чөлөөлөлт, бондын хүү ОРОХГҮЙ'),
    },
    ...(extra ?? []),
  ];

  return (
    <div className={o.head}>
      {tiles.map((t) => (
        <div key={t.label} className={`${o.tile} ${t.lead ? o.tileLead : ''}`} title={t.title}>
          <span className={o.tileVal}>
            <b className={`${String(t.v).length >= 10 ? o.tileValLong : ''} num`}>
              {t.v === ERR_MARK && t.q ? <FailVal q={t.q} /> : t.v.split(',').map((part, i, a) => (
                i < a.length - 1 ? <span key={i}>{part},<wbr /></span> : <span key={i}>{part}</span>
              ))}
            </b>
            {t.unit && <i>{tr(t.unit)}</i>}
          </span>
          <span className={o.tileLabel}>{t.label}</span>
        </div>
      ))}
    </div>
  );
}
