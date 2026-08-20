'use client';

import {
  useCallback, useMemo, useState,
  type Dispatch, type SetStateAction,
} from 'react';

/**
 * ХАРАГДАЦЫН ӨӨРИЙН давхарга + КАТАЛОГООС нэмсэн давхарга.
 *
 * ⚠️ 2026-08-20: Хэд хэдэн харагдацын `visible` нь ТӨЛӨВ БИШ, СОНГОЛТООС
 * ГАРАЛТАЙ байдаг: «Багцын хяналт»/«Багцын мэдээлэл»-д сонгосон багцын
 * `layerIds`, «Газар чөлөөлөлт»-д кадастрын гурван давхарга, «IoT»-д мэдрэгчийн
 * тав. Тиймээс тэдгээрт давхаргын каталог огт байхгүй байсан — хэрэглэгч
 * порталын үлдсэн ~84 давхаргын нэгийг ч контекст болгон нэмж чаддаггүй байв.
 *
 * Энэ hook нь тэр СУУРИЙГ хэвээр үлдээж, дээр нь каталогийн сонголтыг давхарлана:
 *
 *   · каталогт чагт тавих  → `extra`-д нэмэгдэнэ (суурь хэвээр)
 *   · каталогт чагт авах   → `off`-д бичигдэж, СУУРЬ давхарга ч нуугдана
 *
 * ⚠️ Суурь солигдоход (өөр багц сонгоход) сонголт ХЭВЭЭР үлдэнэ — хэрэглэгчийн
 * нэмсэн контекст давхарга багц бүрд дагаж явна. Энэ нь зориуд: «зам + шинэ
 * багц» гэж харьцуулах нь хамгийн түгээмэл хэрэглээ.
 */
export function useLayerPicks(base: string[]) {
  /**
   * ⚠️ Хоёр олонлогийг НЭГ төлөвт: `setVisible` нь тэдгээрийг ХАМТ, нэг
   * updater дотор тооцох ёстой. Тусад нь `useState` байвал нэг updater нөгөөгөө
   * дуудах (эсвэл ref-ээр render-ийн үед унших) шаардлагатай болно.
   */
  const [picks, setPicks] = useState<{ extra: string[]; off: string[] }>(
    { extra: [], off: [] },
  );

  /**
   * ⚠️ `baseKey`-ээр мемолно: дуудагчид суурийг ихэвчлэн ШИНЭ массиваар
   * (`active ? active.layerIds : [BLOCK_LAYER]`) өгдөг тул зөвхөн `base`-ээр
   * хамааруулбал render бүрт шинэ `visible` үүсч, `MapCanvas`-ийн давхарга
   * дахин барих эффект дэмий ажиллана.
   */
  const baseKey = base.join('|');

  const visible = useMemo(() => {
    const hidden = new Set(picks.off);
    const b = baseKey ? baseKey.split('|') : [];
    return [...new Set([...b, ...picks.extra])].filter((id) => !hidden.has(id));
  }, [baseKey, picks]);

  /**
   * `LayerCatalog`-ийн хүлээдэг `Dispatch<SetStateAction<string[]>>` интерфэйс.
   * Ирсэн бүтэн жагсаалтыг суурьтай нь харьцуулж «нэмсэн» ба «хассан» хоёр
   * олонлогт задална — каталог нь энгийн төлөвтэй ажиллаж байгаа мэт харагдана.
   */
  const setVisible = useCallback<Dispatch<SetStateAction<string[]>>>((upd) => {
    setPicks((p) => {
      const b = baseKey ? baseKey.split('|') : [];
      const bSet = new Set(b);
      const hidden = new Set(p.off);
      const cur = [...new Set([...b, ...p.extra])].filter((id) => !hidden.has(id));
      const next = typeof upd === 'function' ? upd(cur) : upd;
      const nSet = new Set(next);
      return {
        extra: next.filter((id) => !bSet.has(id)),
        off: b.filter((id) => !nSet.has(id)),
      };
    });
  }, [baseKey]);

  return [visible, setVisible] as const;
}
