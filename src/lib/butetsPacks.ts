/**
 * ДЭД БҮТЦИЙН БАГЦУУД — «Инженерийн дэд бүтэц» хуудасны ба түүний ЭРХИЙН
 * панелийн ГАНЦ эх сурвалж (2026-09-23).
 */

import { LAYER_BY_ID, PKG_BY_BAGTS, PKG_FAMILY_BY_BAGTS } from './services';

/** Нэг дэд бүтцийн багц */
export type ButetsPack = {
  /** `bagtsKey()`-ээр нормчилсон — эрхийн хүрээний нэгж */
  key: string;
  /** Дэлгэцэд гарах нэр (давхаргын нэрсийн нийтлэг угтвар) */
  name: string;
  /** Багцын давхаргууд */
  layerIds: string[];
};

/**
 * Давхаргын нэрсийн НИЙТЛЭГ УГТВАР — «Багц 5.1 · Дулааны өгөх» ба
 * «Багц 5.1 · Дулааны буцах» → «Багц 5.1».
 * (`Bagts.tsx` энэ функцийг эндээс авдаг — өмнө нь тэнд байсан.)
 */
export function commonName(titles: string[]): string {
  let p = titles[0] ?? '';
  for (const t of titles.slice(1)) {
    let i = 0;
    while (i < p.length && i < t.length && p[i] === t[i]) i += 1;
    p = p.slice(0, i);
  }
  return p.replace(/[\s·—-]+$/u, '').trim() || titles[0] || '';
}

/** Дэд бүтцийн 25 багц — нэрээр эрэмбэлсэн */
export const BUTETS_PACKS: ButetsPack[] = Object.keys(PKG_BY_BAGTS)
  .filter((key) => {
    const fam = PKG_FAMILY_BY_BAGTS[key];
    return fam !== 'soc' && fam !== 'site';
  })
  .map((key) => {
    const layerIds = PKG_BY_BAGTS[key] ?? [];
    const titles = () => layerIds.map((id) => LAYER_BY_ID[id]?.title ?? id);
    return { key, get name() { const t = titles(); return t.length ? commonName(t) : key; }, layerIds };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'mn', { numeric: true }));

/** Давхарга → багцын түлхүүр (эрх шалгахад) */
export const PACK_OF_LAYER: Record<string, string> = BUTETS_PACKS.reduce(
  (m, p) => {
    for (const id of p.layerIds) m[id] = p.key;
    return m;
  },
  {} as Record<string, string>,
);
