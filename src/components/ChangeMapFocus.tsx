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
    /* ⚠️ 2026-10-16: ЗӨВХӨН ШИНЭ (Redesign) давхаргын хэсгүүдээр ойртоно. Автозамын хуучин эх (TD/85,
       `old: 'all'` — хилээр тайрахгүй) дотор Сэлбээс хол нэг полигон байдаг тул бүх хэсгийн нэгдэл
       Монголоос Тайвань хүртэл сунаж, мөр дарахад зураг тивийн хэмжээнд холддог байв. Шинэ хэсэг
       байхгүй бол (хуучин талын мөр) бүх хэсгийг авна. */
    const own = pick.pieces.filter((p) => pick.layers.includes(p.layer));
    if (!extent) for (const piece of own.length ? own : pick.pieces) {
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
