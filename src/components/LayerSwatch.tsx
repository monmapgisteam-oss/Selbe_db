'use client';

import { DASH_PATTERN, type LayerDef } from '@/lib/services';
import s from './swatch.module.css';

/**
 * Давхаргын симбол — SVG-ээр, газрын зурагтай ИЖИЛ хэв, зузаан, өнгөөр.
 *
 * ⚠️ Тодорхойлолтыг каталогоос уншина, дахин зохиохгүй. Симбол нь зурагтай хэзээ
 * ч зөрөх боломжгүй байх ёстой.
 *
 * ⚠️ Урьд нь энэ нь газрын зураг дээрх «Тайлбар» хайрцагт байв. Тэр хайрцаг нь
 * давхаргын нэрийг үгээр давтаж, зургийн зүүн доод булангийн 232px-ыг байнга
 * эзэлдэг байлаа. Одоо симбол нь каталогийн мөрөндөө — нэр, тоо, өртгийнхөө
 * хажууд байх нь илүү зөв байрлал.
 */
export function LayerSwatch({ d, hue = d.hue }: { d: LayerDef; hue?: string }) {
  if (d.geom === 'line') {
    const pattern = DASH_PATTERN[d.dash ?? 'solid'];
    return (
      <svg className={s.swatch} viewBox="0 0 22 12" aria-hidden>
        <line
          x1="1" y1="6" x2="21" y2="6"
          stroke={hue}
          strokeWidth={Math.max(1.5, d.width ?? 1.4)}
          strokeLinecap={d.dash === 'dot' ? 'round' : 'butt'}
          {...(pattern ? { strokeDasharray: pattern.join(' ') } : {})}
        />
      </svg>
    );
  }

  if (d.geom === 'point') {
    const r = 4;
    return (
      <svg className={s.swatch} viewBox="0 0 22 12" aria-hidden>
        {d.marker === 'square' ? (
          <rect x={11 - r} y={6 - r} width={r * 2} height={r * 2} fill={hue} stroke="#fff" strokeWidth="1.2" />
        ) : (
          <circle cx="11" cy="6" r={r} fill={hue} stroke="#fff" strokeWidth="1.2" />
        )}
      </svg>
    );
  }

  return (
    <span
      className={`${s.swatch} ${s.area}`}
      style={{
        background: `color-mix(in srgb, ${hue} ${Math.round((d.fill ?? 0.3) * 100)}%, transparent)`,
        borderColor: hue,
      }}
      aria-hidden
    />
  );
}
