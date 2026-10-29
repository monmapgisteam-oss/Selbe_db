'use client';

import { useEffect } from 'react';
import Extent from '@arcgis/core/geometry/Extent';
import { useMap } from '@/components/MapCanvas';
import type { ChangePick } from '@/components/HesegChange';

/** Нөөц (хуучин талын) ойртолтын дээд хэмжээ — 3857 нэгж (~65 км газрын) */
const MAX_FOCUS = 100_000;

/** Эх давхаргуудыг MapCanvas зурна; энд сонгосон ангилал/бүс рүү л ойртуулна. */
export function ChangeMapFocus({ pick }: { pick: ChangePick }) {
  const { view } = useMap();
  useEffect(() => {
    if (!view || view.type !== '2d' || !pick) return;
    let extent = pick.sub !== undefined ? pick.geometry?.extent?.clone() ?? null : null;
    const own = pick.pieces.filter((p) => pick.layers.includes(p.layer));
    if (!extent) for (const piece of own.length ? own : pick.pieces) {
      const next = piece.geometry.extent;
      if (next) extent = extent ? extent.union(next) : next.clone();
    }
    if (!extent || (!own.length && Math.max(extent.width, extent.height) > MAX_FOCUS)) return;
    const padding = Math.max(extent.width, extent.height, 120) * 0.15;
    void view.goTo(new Extent({
      xmin: extent.xmin - padding, ymin: extent.ymin - padding,
      xmax: extent.xmax + padding, ymax: extent.ymax + padding,
      spatialReference: extent.spatialReference,
    }), { duration: 500 }).catch(() => {});
  }, [view, pick]);
  return null;
}
