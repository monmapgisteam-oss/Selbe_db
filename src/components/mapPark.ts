/**
 * ХЭЛ СОЛИХОД ГАЗРЫН ЗУРГИЙН VIEW-Г УСТГАХГҮЙ ТҮР ХАДГАЛАХ (⚠️ 2026-10-01).
 *
 * ⚠️ ЯАГААД («хэрэглэгч: бүгдийг зас»): хэл солиход `LocaleRemount` (`i18n.tsx`)
 *    `Root`-ийг бүхэлд нь remount хийдэг. `MapCanvas` нь харагдац бүрийн модуль
 *    ДОТОР (Dashboard · Bagts · Gazar …) тул remount-ийн гадна гаргах боломжгүй —
 *    урьд нь view `destroy()` болж, шинэ view үүсэн бүх давхаргын зураглал, tile,
 *    3D меш дахин ачаалагдаж, камер «эхлэх хүрээ» рүү үсэрдэг байв.
 *    Одоо хуучин `MapCanvas` устахдаа (зөвхөн ХЭЛ СОЛИХ агшинд — `shouldPark`)
 *    view-гээ ЭНД тавьж, шинэ `MapCanvas` ИЖИЛ түлхүүртэй (dim + map кэш) бол
 *    түүнийг авна (`container`-оо солино). Map өөрөө `mapCache`-д аль хэдийн
 *    хуваалцагддаг.
 * ⚠️ Нэг л слот — хоёр дахь view ирвэл өмнөхийг устгана. `ttl` дотор хэн ч
 *    аваагүй бол (жиш. хэл солиход газрын зураггүй харагдац руу шилжсэн) устгана —
 *    WebGL контекст алдагдахгүй.
 * ⚠️ React/ArcGIS хамааралгүй — `mapPark.check.mjs` хуурамч view-ээр шалгана.
 */

export type Parkable = { destroyed: boolean };

type Slot = {
  view: Parkable;
  key: string;
  destroy: (v: Parkable) => void;
  timer: ReturnType<typeof setTimeout>;
};

let slot: Slot | null = null;

/** Хэмжилт — dev-д `window.__selbeMapStats`-аар (MapCanvas) харна */
export const mapStats = { created: 0, destroyed: 0, parked: 0, adopted: 0 };

/** Хэн ч авахгүй бол устгах хугацаа — remount + style кэш ~1 тик, 10с өгөөмөр */
export const PARK_TTL_MS = 10_000;

/**
 * View-ийн cleanup ХЭЛ СОЛИХ remount-оос үүдсэн үү: mount хийх үеийн хэлний үе
 * (`getLocaleGeneration`) одоогийнхоос өөр бол тийм. Ердийн unmount/2D↔3D солилт
 * ижил үеэр явна → `false` (урьдын адил устгана).
 */
export function shouldPark(mountGen: number, nowGen: number): boolean {
  return mountGen !== nowGen;
}

/** Хадгалсныг устгана (байвал) */
export function dropParked(): void {
  const s = slot;
  if (!s) return;
  slot = null;
  clearTimeout(s.timer);
  if (!s.view.destroyed) {
    s.destroy(s.view);
    mapStats.destroyed += 1;
  }
}

/** View-г түр хадгална — өмнөх хадгалсныг устгана */
export function parkView<V extends Parkable>(view: V, key: string, destroy: (v: V) => void, ttl = PARK_TTL_MS): void {
  dropParked();
  const timer = setTimeout(() => {
    if (slot?.view === view) dropParked();
  }, ttl);
  slot = { view, key, destroy: destroy as (v: Parkable) => void, timer };
  mapStats.parked += 1;
}

/**
 * Түлхүүр таарвал хадгалсан view-г буцаана (слот хоосорно). Таарахгүй бол
 * хадгалсныг УСТГААД `null` — шинэ view үүсгэнэ.
 */
export function adoptView<V extends Parkable>(key: string): V | null {
  const s = slot;
  if (!s) return null;
  if (s.key !== key || s.view.destroyed) {
    dropParked();
    return null;
  }
  slot = null;
  clearTimeout(s.timer);
  mapStats.adopted += 1;
  return s.view as V;
}
