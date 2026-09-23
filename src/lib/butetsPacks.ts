/**
 * ДЭД БҮТЦИЙН БАГЦУУД — «Инженерийн дэд бүтэц» хуудасны ба түүний ЭРХИЙН
 * панелийн ГАНЦ эх сурвалж (2026-09-23).
 *
 * ⚠️ ЯАГААД ТУСДАА ФАЙЛ ВЭ: багцын жагсаалт урьд нь `modules/Bagts.tsx`-ийн
 *    `buildPacks(null)` дотор угсрагддаг байв. Тэр файл нь React бүрэлдэхүүн
 *    (MapCanvas, CSS модуль) импортолдог тул `lib/butetsAcl.ts` ба түүний
 *    node тест (`butetsAcl.check.mjs`) түүнийг ачаалж чадахгүй. Энд ЦЭВЭР
 *    тооцоо л байна — `services.ts`-ийн хүснэгтээс.
 *
 * ⚠️ ГАРААР ЖАГСААХГҮЙ — `PKG_BY_BAGTS`-ээс угсарна (`DedButets.INFRA_PACKS`-ийн
 *    ижил дүрэм): блокгүй багцаас нийгмийн барилга (`soc`) ба өндөржилт
 *    (`site`)-ийг хасна. Хуулбарлавал «Дэд бүтэц» хуудсанд 25, эрхийн
 *    панелд 24 багц харагдах өдөр ирнэ.
 *
 * ⚠️ ТҮЛХҮҮР нь `bagtsKey()` хэлбэр («БАГЦ51») — эрхийн `grants[].bagts`-д
 *    ЭНЭ хадгалагдана, дэлгэцийн нэр биш. Нэр нь `tr()`-ээр орчуулагддаг тул
 *    хэл солиход өөрчлөгдөнө; түлхүүр тогтмол.
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
    const titles = layerIds.map((id) => LAYER_BY_ID[id]?.title ?? id);
    return { key, name: titles.length ? commonName(titles) : key, layerIds };
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
