'use client';

import {
  useCallback, useMemo, useState,
  type Dispatch, type SetStateAction,
} from 'react';

/**
 * ХАРАГДАЦЫН ӨӨРИЙН давхарга + КАТАЛОГООС нэмсэн давхарга.
 *
 * Энэ hook нь тэр СУУРИЙГ хэвээр үлдээж, дээр нь каталогийн сонголтыг давхарлана:
 *
 *   · каталогт чагт тавих  → `extra`-д нэмэгдэнэ (суурь хэвээр)
 *   · каталогт чагт авах   → `off`-д бичигдэж, СУУРЬ давхарга ч нуугдана
 */
export function useLayerPicks(base: string[]) {
  const [picks, setPicks] = useState<{ extra: string[]; off: string[] }>(
    { extra: [], off: [] },
  );

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
