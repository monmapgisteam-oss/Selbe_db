'use client';

/**
 * БАГЦЫН ДАВХАРГУУД — багц дарахад доор нь давхаргууд задарч, давхарга дарахад
 * доор нь түүний ӨГӨГДӨЛ задарна (2026-09-11, хэрэглэгчийн хүсэлт).
 *
 * «Багцын гүйцэтгэл» (`PkgProg`) ба «Инженерийн дэд бүтэц» (`DedButets`)
 * ХОЁУЛАА энэ бүрэлдэхүүнийг хэрэглэнэ.
 */

import { Fragment, useState, useSyncExternalStore, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { LAYER_BY_ID, srcLineWidth, type LayerDef } from '@/lib/services';
import { useAsync } from '@/lib/useAsync';
import { num } from '@/lib/format';
import { loadLayerSummary, type LayerSummary } from '@/lib/layerSummary';
import { subscribeTotals, totalsEpoch } from '@/lib/totals';
import { friendlyError, Loading } from '@/components/ui';
import s from './packLayers.module.css';

export function PackLayers({
  layerIds,
  valueFor,
}: {
  layerIds: string[];
  /**
   * Мөрийн баруун талын утга (урт г.м) — өгөөгүй бол багана гарахгүй.
   */
  valueFor?: (id: string) => ReactNode;
}) {
  const [openLayer, setOpenLayer] = useState<string | null>(null);
  return (
    <>
      {layerIds.map((id) => {
        const L = LAYER_BY_ID[id];
        if (!L) return null;
        const short = tr(L.title).replace(/^.*?\s·\s/, '');
        const open = openLayer === id;
        return (
          <Fragment key={id}>
            <button
              type="button"
              className={`${s.row} ${open ? s.on : ''}`}
              aria-expanded={open}
              onClick={() => setOpenLayer(open ? null : id)}
            >
              <span className={s.caret} aria-hidden>{open ? '▾' : '▸'}</span>
              <Swatch L={L} />
              <span className={s.name} title={tr(L.title)}>{short}</span>
              {valueFor && <span className={`${s.val} num`}>{valueFor(id)}</span>}
            </button>
            {open && <LayerFields layerId={id} />}
          </Fragment>
        );
      })}
    </>
  );
}

/** Зураасны хээ → SVG `stroke-dasharray` (ArcGIS-ийн харгалзах хэлбэр) */
const DASH: Record<NonNullable<LayerDef["dash"]>, string | undefined> = {
  solid: undefined, dash: '6 3', dot: '1.5 3', 'dash-dot': '6 3 1.5 3', 'long-dash': '10 4',
};

/**
 * ТЭМДЭГ — ArcGIS-ийн тайлбар (legend) шиг (2026-09-11, хэрэглэгчийн хүсэлт).
 */
export function Swatch({ L }: { L: LayerDef }) {
  if (L.geom === 'line') {
    return (
      <svg className={s.swatch} viewBox="0 0 24 10" aria-hidden>
        <line
          x1="1" y1="5" x2="23" y2="5"
          stroke={L.hue}
          strokeWidth={L.srcSym ? srcLineWidth(L.width) : Math.max(1.5, L.width ?? 1.6)}
          strokeDasharray={DASH[L.dash ?? 'solid']}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (L.geom === 'area') {
    return (
      <svg className={s.swatch} viewBox="0 0 24 10" aria-hidden>
        <rect
          x="1.5" y="1.5" width="21" height="7"
          fill={L.hue}
          fillOpacity={L.fill ?? 0.35}
          stroke={L.stroke ?? L.hue}
          strokeWidth={1}
          strokeDasharray={DASH[L.strokeDash ?? 'solid']}
        />
      </svg>
    );
  }
  const r = Math.min(4, Math.max(2.5, (L.size ?? 7) / 2));
  return (
    <svg className={s.swatch} viewBox="0 0 24 10" aria-hidden>
      {L.marker === 'square'
        ? <rect x={12 - r} y={5 - r} width={r * 2} height={r * 2} fill={L.hue} />
        : L.marker === 'diamond'
          ? <polygon points={`12,${5 - r} ${12 + r},5 12,${5 + r} ${12 - r},5`} fill={L.hue} />
          : <circle cx="12" cy="5" r={r} fill={L.hue} />}
    </svg>
  );
}

/**
 * ДАВХАРГЫН ӨГӨГДӨЛ — дэд мөр дарахад доор нь задарна.
 */
function LayerFields({ layerId }: { layerId: string }) {
  const epoch = useSyncExternalStore(subscribeTotals, totalsEpoch, totalsEpoch);
  const q = useAsync<LayerSummary>(() => loadLayerSummary(layerId), [layerId, epoch]);
  if (q.state === 'loading') return <Loading />;
  if (q.state === 'error') {
    return <div className={s.note} role="alert">{tr('Татагдсангүй: {0}', friendlyError(q.error))}</div>;
  }
  if (q.state !== 'ready') return null;
  const { total, fields, empty } = q.data;
  return (
    <div className={s.fields}>
      <div className={s.head}>{tr('{0} объект', num(total))}</div>
      {fields.map((f) => (
        <div key={f.name} className={s.field}>
          <div className={s.fieldTop}>
            <span className={s.fieldName} title={f.name}>{f.label}</span>
            <span className={`${s.fill} num`}>{num(f.filled)}/{num(total)}</span>
          </div>
          {f.num && (
            <div className={`${s.vals} num`}>
              {f.num.min === f.num.max
                ? num(f.num.min, 2)
                : `${num(f.num.min, 2)} … ${num(f.num.max, 2)}`}
              {f.num.sum != null && ` · ${tr('нийт')} ${num(f.num.sum, 0)} ${tr('м')}`}
            </div>
          )}
          {f.top && (
            <div className={s.vals}>
              {f.top.map((v) => (
                <span key={v.value} className={s.chip}>
                  {v.value} <b className="num">{num(v.count)}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      {empty.length > 0 && (
        <div className={s.empty}>{tr('Бөглөгдөөгүй: {0}', empty.join(', '))}</div>
      )}
    </div>
  );
}
