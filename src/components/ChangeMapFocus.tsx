'use client';

import { useEffect } from 'react';
import Extent from '@arcgis/core/geometry/Extent';
import { useMap } from '@/components/MapCanvas';
import type { ChangePick } from '@/components/HesegChange';

/** Эх давхаргуудыг MapCanvas зурна; энд сонгосон ангилал/бүс рүү л ойртуулна. */
export function ChangeMapFocus({ pick }: { pick: ChangePick }) {
  const { view } = useMap();
  useEffect(() => {
    if (!view || view.type !== '2d' || !pick) return;
    let extent = pick.sub !== undefined ? pick.geometry?.extent?.clone() ?? null : null;
    if (!extent) for (const piece of pick.pieces) {
      const next = piece.geometry.extent;
      if (next) extent = extent ? extent.union(next) : next.clone();
    }
    if (!extent) return;
    const padding = Math.max(extent.width, extent.height, 120) * 0.15;
    void view.goTo(new Extent({
      xmin: extent.xmin - padding, ymin: extent.ymin - padding,
      xmax: extent.xmax + padding, ymax: extent.ymax + padding,
      spatialReference: extent.spatialReference,
    }), { duration: 500 }).catch(() => {});
  }, [view, pick]);
  return null;
}
