'use client';

import { useEffect, useState } from 'react';
import { DASH_PATTERN, layerUrl, MAP_HUE_OVERRIDES, type LayerDef } from '@/lib/services';
import { webmapStyleOf, loadWebmapStyle } from '@/lib/webmapStyle';
import { plan2dStyleOf, loadPlan2dStyle } from '@/lib/plan2d';
import s from './swatch.module.css';

/**
 * Давхаргын симбол — SVG-ээр, газрын зурагтай ИЖИЛ хэв, зузаан, өнгөөр.
 *
 * ⚠️ Тодорхойлолтыг каталогоос уншина, дахин зохиохгүй. Симбол нь зурагтай хэзээ
 * ч зөрөх боломжгүй байх ёстой. Газрын зураг эх webmap-ийн загвараар зурагддаг
 * давхаргад ӨНГИЙГ мөн webmap-ийн снапшотоос (`webmapStyleOf`) авна — эс бөгөөс
 * каталогийн симбол зурагтайгаа зөрнө.
 *
 * ⚠️ Урьд нь энэ нь газрын зураг дээрх «Тайлбар» хайрцагт байв. Тэр хайрцаг нь
 * давхаргын нэрийг үгээр давтаж, зургийн зүүн доод булангийн 232px-ыг байнга
 * эзэлдэг байлаа. Одоо симбол нь каталогийн мөрөндөө — нэр, тоо, өртгийнхөө
 * хажууд байх нь илүү зөв байрлал.
 */
/**
 * ПЛАН2D renderer-ийн ҮНДСЭН өнгө (`plan2dStyleOf`) — газрын зураг үүнийг webmap снапшотоос ӨМНӨ
 * тавьдаг (`MapCanvas` §renderer: `paint.force` → plan2d → webmap → каталог).
 * ⚠️ 2026-10-09: swatch энэ шатыг АЛГАСДАГ байсан тул alias-тай давхарга (`et:24` Барилга,
 *    `dugui` Дугуйн зам, `nogoon` г.м.) каталогт webmap/каталогийн өнгөөр, зураг дээр план2d-ийн
 *    өнгөөр — хоёр өөр харагддаг байв. esriPFS (зурган дүүргэлт) бол SVG-ийн суурь өнгө
 *    (MapCanvas-ийн `pfsBaseColor`-той ижил дүрэм); CIM зэрэг таниагүй симбол → `undefined` (дараагийн шат).
 */
function plan2dColor(id: string): string | undefined {
  type Sym = { type?: string; color?: number[]; url?: string; outline?: { color?: number[] } };
  const r = plan2dStyleOf(id) as { symbol?: Sym; defaultSymbol?: Sym; uniqueValueInfos?: { symbol?: Sym }[] } | undefined;
  const sym = r?.symbol ?? r?.defaultSymbol ?? r?.uniqueValueInfos?.[0]?.symbol;
  if (!sym) return undefined;
  const rgbOf = (c?: number[]) => (Array.isArray(c) && c.length >= 3 ? `rgb(${c[0]},${c[1]},${c[2]})` : undefined);
  if (sym.type === 'esriPFS') {
    if (!sym.url?.startsWith('data:image/svg+xml;base64,')) return rgbOf(sym.outline?.color);
    try {
      return /fill="(#[0-9a-fA-F]{6})"/.exec(atob(sym.url.split(',')[1]))?.[1] ?? rgbOf(sym.outline?.color);
    } catch {
      return rgbOf(sym.outline?.color);
    }
  }
  return rgbOf(sym.color) ?? rgbOf(sym.outline?.color);
}

export function LayerSwatch({ d, hue: hueProp }: { d: LayerDef; hue?: string }) {
  // Webmap style снапшот аль хэдийн MapCanvas-аар ачаалагдсан байдаг ч swatch
  // түүнээс ӨМНӨ зурагдвал каталогийн hue-гээр гараад, ачаалагдмагц дахин зурна.
  const [, setLoaded] = useState(false);
  useEffect(() => {
    let on = true;
    /* ⚠️ 2026-10-09: план2d загвар ч хүлээнэ (`plan2dColor`) */
    Promise.all([loadWebmapStyle(), loadPlan2dStyle()]).then(() => { if (on) setLoaded(true); });
    return () => { on = false; };
  }, []);
  // Гараар заасан өнгө (facet мөр) → webmap-ийн өнгө → каталогийн hue.
  // ⚠️ `MAP_HUE_OVERRIDES`-т орсон давхаргад зураг нь снапшотын өнгийг d.hue-ээр
  //    орлуулж зурдаг тул swatch мөн d.hue — эс бөгөөс каталог зурагтайгаа зөрнө.
  /* ⚠️ 2026-10-09: `paint.force`-гүй бол план2d-ийн өнгө webmap-аас ӨМНӨ — зурагтай ижил дараалал */
  const hue = hueProp
    ?? (d.paint?.force ? undefined : plan2dColor(d.id))
    ?? (MAP_HUE_OVERRIDES.has(d.id) ? d.hue : webmapStyleOf(d.styleUrl ?? layerUrl(d))?.color)
    ?? d.hue;
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
