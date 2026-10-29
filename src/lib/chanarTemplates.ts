/**
 * ЧАНАРЫН БАРИМТЫН ЗАГВАРУУД — MA ангилал ба шаардлагатай материалын тоо.
 *
 * ЭХ СУРВАЛЖ (2026-09-28, `docs/chanar`): MA 6 ангилал × шаардлагатай материалын тоо (126) —
 * бүртгэлийн KPI хуудас.
 */

/* ════════════════════════ MA — ангилал, шаардлагатай тоо ════════════════════════ */

/**
 * MA-ийн 6 ангилал — бүртгэлийн KPI хуудас (126 материал): БУА 27 · Цахилгаан 22 ·
 * Гадна, дотор ХД 32 · Дотор ХАС, ЦБУ 26 · Гадна шугам сүлжээ 13 · Узель 6.
 */
export const MA_CATEGORIES = ['bua', 'tsahilgaan', 'hd', 'has', 'gadnaShugam', 'uzel'] as const;
export type MaCategory = (typeof MA_CATEGORIES)[number];
export const MA_REQUIRED: Readonly<Record<MaCategory, number>> = { bua: 27, tsahilgaan: 22, hd: 32, has: 26, gadnaShugam: 13, uzel: 6 };
