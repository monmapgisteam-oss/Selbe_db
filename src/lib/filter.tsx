'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMap } from '@/components/MapCanvas';
import { useSyncRef } from '@/lib/useSyncRef';
import { ZONE_LAYER, type FilterScope } from '@/lib/services';

/**
 * Идэвхтэй шүүлтийн ГАНЦ эх сурвалж.
 *
 * Одоо шүүлт нэг л газар амьдарна. Самбарууд `isOn(key)`-ээр өөрийнхөө төлвийг
 * УНШИНА, өөрсдөө хадгалахаа больсон.
 */
export type ActiveFilter = {
  /**
   * Давхцахгүй түлхүүр. Самбар үүгээр өөрийн мөрийг таньдаг тул тухайн самбарын
   * дотор өвөрмөц байхад хангалттай — гэхдээ давхаргын нэрийг оруулах нь зөв
   * (хоёр давхаргад ижил нэртэй ангилал байж болно).
   */
  key: string;
  /** Толгойд харагдах бичиглэл — «Гүйцэтгэл: Эхэлсэн» */
  label: string;
  /** Аль хэсгээс ирсэн — «Барилга», «Чөлөөлөлтийн явц» */
  group: string;
  /** Газрын зурагт явуулах SQL */
  where: string;
  /** Аль хэсэгт харьяалагдах — харагдац солиход цэвэрлэхэд хэрэглэнэ */
  view: FilterScope;
  /**
   * ЗӨВХӨН эдгээр давхаргад хэрэглэнэ. Шүүлтийн талбар нь бүх давхаргад
   * байдаггүй (жишээ нь `Barilga_ty` нь бүсийн давхаргад алга) — заагаагүй бол
   * тэдгээрт `featureEffect` унана.
   */
  layerIds?: string | string[];
  /** Тайлбарын өнгө */
  color?: string;
};

type FilterApi = {
  active: ActiveFilter | null;
  /** Ижил түлхүүр дахин ирвэл цуцална, өөр бол солино */
  toggle: (f: ActiveFilter) => void;
  /** Шууд тавина (цуцлахгүй) — хайлт, тоймоос үсрэхэд */
  set: (f: ActiveFilter) => void;
  clear: () => void;
  isOn: (key: string) => boolean;
};

const Ctx = createContext<FilterApi>({
  active: null,
  toggle: () => {},
  set: () => {},
  clear: () => {},
  isOn: () => false,
});

export const useFilter = () => useContext(Ctx);

export function FilterProvider({ children }: { children: ReactNode }) {
  const { setHighlight, zoomToWhere, zoomToLayer, highlight } = useMap();
  const [active, setActive] = useState<ActiveFilter | null>(null);
  const activeRef = useRef(active);
  useSyncRef(activeRef, active);

  useEffect(() => {
    if (active && highlight.where !== active.where) setActive(null);
  }, [highlight.where, active]);

  /**
   * Төлөв ба газрын зураг ХАМТ өөрчлөгдөнө.
   */
  const apply = useCallback(
    (f: ActiveFilter | null) => {
      const had = activeRef.current != null;
      setActive(f);
      setHighlight(f?.where ?? null, f?.layerIds);

      if (!f) { if (had) zoomToLayer(ZONE_LAYER.id); return; }
      const lid = Array.isArray(f.layerIds) ? f.layerIds[0] : f.layerIds;
      if (lid && f.where) zoomToWhere(lid, f.where);
    },
    [setHighlight, zoomToWhere, zoomToLayer],
  );

  const toggle = useCallback(
    (f: ActiveFilter) => apply(active?.key === f.key ? null : f),
    [active?.key, apply],
  );

  const set = useCallback((f: ActiveFilter) => apply(f), [apply]);
  const clear = useCallback(() => apply(null), [apply]);
  const isOn = useCallback((key: string) => active?.key === key, [active?.key]);

  const api = useMemo<FilterApi>(
    () => ({ active, toggle, set, clear, isOn }),
    [active, toggle, set, clear, isOn],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
