'use client';

import { useState } from 'react';
import { DASH_PATTERN, LAYER_BY_ID, TOPICS, type LayerDef } from '@/lib/services';
import s from './legend.module.css';

/**
 * Газрын зургийн ТАЙЛБАР — ил байгаа давхаргууд сэдвээрээ.
 *
 * ⚠️ Симболыг каталогоос уншина, дахин тодорхойлохгүй. Тайлбар нь зурагтай хэзээ
 * ч зөрөх боломжгүй байх ёстой — өнгө, зузаан, зураасны хээ, цэгийн хэлбэр бүгд
 * нэг эх сурвалжаас.
 */

/** Нэг давхаргын симболыг SVG-ээр — зурагтай ижил хэв, зузаантай */
function Swatch({ d, hue = d.hue }: { d: LayerDef; hue?: string }) {
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

export function MapLegend({ visible }: { visible: string[] }) {
  const [open, setOpen] = useState(true);

  const defs = visible.map((id) => LAYER_BY_ID[id]).filter(Boolean);
  if (defs.length === 0) return null;

  // Сэдвийн дараалал нь зүүн модтой ижил байх ёстой
  const groups = TOPICS.map((t) => ({ t, items: defs.filter((d) => d.topic === t.key) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className={`${s.box} ${open ? s.boxOpen : ''}`}>
      <button type="button" className={s.head} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={s.title}>Тайлбар</span>
        <span className={`${s.caret} ${open ? s.caretOpen : ''}`} aria-hidden>▾</span>
      </button>

      {open && (
        <div className={s.body}>
          {groups.map((g) => (
            <div key={g.t.key} className={s.group}>
              <div className={s.groupHead}>{g.t.title}</div>
              {g.items.map((d) => (
                <div key={d.id}>
                  <div className={s.row}>
                    <Swatch d={d} />
                    <span className={s.label}>{d.title}</span>
                  </div>
                  {/* Ангиллаар өнгө ялгадаг давхарга — утга бүрийн өнгө */}
                  {(d.paint || d.breaks) && (
                    <div className={s.classes}>
                      {(d.paint
                        ? Object.entries(d.paint.values)
                        : d.breaks!.levels.map((l) => [`${l.label} · ${l.range}`, l.color] as const)
                      ).map(([label, hue]) => (
                        <div key={label} className={s.classRow}>
                          <Swatch d={d} hue={hue} />
                          <span className={s.classLabel}>{label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
