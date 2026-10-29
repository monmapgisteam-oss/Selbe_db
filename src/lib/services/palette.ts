import { t as tr } from '@/lib/i18nCore';
import type { Quantity } from './layerDef';

/* ══════════════════════ ЭХ ВЕБ ЗУРГИЙН ПАЛИТР ══════════════════════ */


/**
 * Барилгын төлөв — хугацааны дарааллаар. Өнгө: эх веб зураг, `Barilga_ty`.
 */
export const BUILT_STATUS: { value: string; hue: string }[] = [
  { value: 'Одоо байгаа', hue: "#000000" },
  { value: 'Баригдаж байгаа', hue: "#f97316" },
  { value: 'Төлөвлөсөн', hue: "#ffb700" },
];

/**
 * Бүсийн ангилал → өнгө.
 */
export const ZONE_TYPES: Record<string, string> = {
  "Орон сууцны бүс": "#ffb300",
  "Олон нийтийн бүс": "#ff7f7f",
  "Нийгмийн дэд бүтцийн бүс": "#7fdeff",
  "Х бүс": "#7c3aed",
  "Одоо байгаа барилга байгууламж": "#ffff7f",
  "Ногоон байгууламж, тохижилт": "#4f7f33",
  "Газар чөлөөлөлт дутуу": "#4a2333",
  "Дэд бүтэц": "#005199",
  "Таун хаус": "#8400ff",
};
export const ZONE_TYPE_EMPTY = () => tr('Тодорхойгүй');
export const ZONE_TYPE_EMPTY_HUE = "#94a3b8";

/**
 * Бүсийн ангиллын КАНОНИК нэр — хоёр эх сурвалжийн бичиглэлийг нэгтгэнэ.
 * `busiin_medeelel_final.Angilal` (жижиг үсэг) ↔ барилгын `TOROL` (том үсэг).
 */
const ZONE_TYPE_CANON: Record<string, string> = {
  "орон сууцны бүс": 'Орон сууцны бүс',
  "олон нийтийн бүс": 'Олон нийтийн бүс',
  "нийгмийн дэд бүтэц": 'Нийгмийн дэд бүтцийн бүс',
  "нийгмийн дэд бүтцийн бүс": 'Нийгмийн дэд бүтцийн бүс',
  "одоо байгаа барилга": 'Одоо байгаа барилга байгууламж',
  "одоо байгаа барилга байгууламж": 'Одоо байгаа барилга байгууламж',
  "ногоон байгууламж тохжилт": 'Ногоон байгууламж, тохижилт',
  "газар чөлөөлөлт дутуу": 'Газар чөлөөлөлт дутуу',
  "дэд бүтэц": 'Дэд бүтэц',
  "таун хаус": 'Таун хаус',
  "х бүс": 'Х бүс',
};

/** Аль ч эх сурвалжийн ангиллыг каноник нэр рүү (танихгүй бол эхний үсгийг том) */
export const zoneType = (v: unknown): string => {
  const s = String(v ?? "").trim();
  if (!s) return ZONE_TYPE_EMPTY();
  return ZONE_TYPE_CANON[s.toLowerCase()] ?? s;
};

const rawKeyed = (pick: (canon: string) => string): Record<string, string> =>
  Object.fromEntries(
    Object.keys(ZONE_TYPE_CANON).map((raw) => [
      raw,
      pick(ZONE_TYPE_CANON[raw]),
    ]),
  );

/**
 * ГАЗРЫН ЗУРГИЙН бүсийн палитр.
 */
export const ZONE_MAP_TYPES: Record<string, string> = rawKeyed(
  (canon) => ZONE_TYPES[canon] ?? ZONE_TYPE_EMPTY_HUE,
);

/** Диаграмд: ангилал бүр өөрийн өнгөтэй (`ZONE_TYPES`, гэхдээ түүхий түлхүүрээр) */
export const ZONE_CHART_TYPES: Record<string, string> = rawKeyed(
  (canon) => ZONE_TYPES[canon] ?? ZONE_TYPE_EMPTY_HUE,
);

export const M: Quantity = { field: "urt_m", unit: 'м' };
export const M2: Quantity = { field: "talbai_m2", unit: 'м²' };
