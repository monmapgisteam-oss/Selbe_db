'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useMap } from '@/components/MapCanvas';
import { ZONE_LAYER, type FilterScope } from '@/lib/services';

/**
 * Идэвхтэй шүүлтийн ГАНЦ эх сурвалж.
 *
 * ⚠️ Урьд нь самбар бүр өөрийн сонголтын төлөвийг барьдаг байв
 * (`BuildingSummary.level`/`bagts`, `Portal.facet`). Гэтэл тэд бүгд НЭГ
 * `setHighlight`-д бичдэг тул:
 *   · Хоёр самбар зэрэг «би сонгосон» гэж бодох боломжтой — сүүлд дарсан нь
 *     нөгөөгийнх нь зурган дээрх шүүлтийг чимээгүй дарж бичээд, эхнийх нь
 *     идэвхтэй харагдсаар үлдэнэ.
 *   · Идэвхтэй шүүлтийг ХААНА ч харуулах газар байхгүй байсан — цуцлах цорын ганц
 *     арга нь тэр мөрөө эргэж олж дахин дарах.
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
  const { setHighlight, zoomToWhere, zoomToLayer } = useMap();
  const [active, setActive] = useState<ActiveFilter | null>(null);

  /**
   * Төлөв ба газрын зураг ХАМТ өөрчлөгдөнө.
   *
   * ⚠️ `useEffect`-ээр зураг руу тусад нь бичихгүй: тэгвэл нэг render-ийн зайд
   * самбар шинэ сонголтоо, зураг хуучин шүүлтээ харуулж, богино хугацаанд хоёр
   * нь зөрнө. Нэг үйлдэлд хоёуланг нь бичих нь тэр цонхыг бүрмөсөн хаана.
   *
   * ⚠️ 2026-08-20 (хэрэглэгчийн хүсэлт): ЗУРАГ БАС НИСНЭ. Урьд нь шүүлт зөвхөн
   * `setHighlight` дуудаж, багтаагүй объектуудыг БҮДГЭРҮҮЛДЭГ байв — 158 га
   * дүүрэн бүдэг объектын дунд сонгосон хэдэн объект нь ялгарахгүй, хэрэглэгч
   * гараар хайж ойртох шаардлагатай байлаа. Одоо шүүлт тавихад тэр объектууд
   * руу нисч, цуцлахад төслийн бүтэн хүрээ рүү холдоно.
   *
   * ⚠️ Нисэх ДАВХАРГЫГ `layerIds`-ийн ЭХНИЙХЭЭР сонгоно: шүүлтийн талбар нь
   * бүх давхаргад байдаггүй тул (тайлбарыг дээр үз) эхнийх нь тэр шүүлтийн
   * «эзэн» давхарга байдаг.
   */
  const apply = useCallback(
    (f: ActiveFilter | null) => {
      setActive(f);
      setHighlight(f?.where ?? null, f?.layerIds);

      if (!f) { zoomToLayer(ZONE_LAYER.id); return; }
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
