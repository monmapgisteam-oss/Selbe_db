/**
 * ЧАНАРЫН БАРИМТЫН ЗАГВАРУУД — MA ангилал ба шаардлагатай материалын тоо.
 *
 * ЭХ СУРВАЛЖ (2026-09-28, `docs/chanar`): MA 6 ангилал × шаардлагатай материалын тоо (126) —
 * бүртгэлийн KPI хуудас.
 *
 * ⚠️ 2026-10-21: MIR · FIC шалгах мөрийн загвар, MS-ийн ажлын төрөл, MA ангиллын шошго/шалгагч
 *    («Чанарын баримт» модульд зориулсан) зөвхөн өөрийн шалгуурт импортлогддог үхсэн код байсан
 *    тул хасагдав. Амьд импортлогч — `chanarUi.ts` (`MA_CATEGORIES` · `MA_REQUIRED` · `MaCategory`).
 * ⚠️ ЦЭВЭР МОДУЛЬ: React үгүй, сүлжээ үгүй — `chanarTemplates.check.mjs` Node дээр ачаална.
 */

/* ════════════════════════ MA — ангилал, шаардлагатай тоо ════════════════════════ */

/**
 * MA-ийн 6 ангилал — бүртгэлийн KPI хуудас (126 материал): БУА 27 · Цахилгаан 22 ·
 * Гадна, дотор ХД 32 · Дотор ХАС, ЦБУ 26 · Гадна шугам сүлжээ 13 · Узель 6.
 * ⚠️ Жагсаалт байхгүй, ЗӨВХӨН ТОО — тоолол нь батлагдсан баримтын материалын
 *    мөрөөр (`chanarUi.maMaterialSummary`). `body.meta.category`-д `id` хадгалагдана.
 */
export const MA_CATEGORIES = ['bua', 'tsahilgaan', 'hd', 'has', 'gadnaShugam', 'uzel'] as const;
export type MaCategory = (typeof MA_CATEGORIES)[number];
export const MA_REQUIRED: Readonly<Record<MaCategory, number>> = { bua: 27, tsahilgaan: 22, hd: 32, has: 26, gadnaShugam: 13, uzel: 6 };
