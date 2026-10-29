/**
 * ХЭЛ СОЛИХОД ГАЗРЫН ЗУРГИЙН VIEW-Г УСТГАХГҮЙ ТҮР ХАДГАЛАХ (2026-10-01).
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
