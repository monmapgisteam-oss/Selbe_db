import type { LayerDef } from './layerDef';
import { LAYER_BY_ID, ZONE_LAYER } from './layers';


/* ══════════════════════ Зурах дараалал ══════════════════════ */

/**
 * Талбай → шугам → цэг.
 */
export const drawOrder = (id: string): number => {
  // Замын шугам (Бусад мэдээлэл) — ХАМГИЙН ДООР (бусад давхаргын дор суурь).
  if (id === "road" || id === "roadOld") return -2;
  if (id === "rd:2") return -3;
  // Бүс бол АГУУЛАГЧ — хамгийн доор (барилга нь дүүргэлтийнх нь дээр гарна).
  if (id === ZONE_LAYER.id) return -1;
  if (id === "sb:16") return -0.5;
  /**
   * ЯВГАН ХҮНИЙ ЗАМ — бусад ТАЛБАЙН давхаргын ДЭЭР, шугамын ДООР
   * (2026-09-15, хэрэглэгч: «ерөнхий төлөвлөгөөний зураг дээр явган хүний
   * зам харагдахгүй байна»).
   */
  if (id === "et:27") return 0.5;
  const g = LAYER_BY_ID[id]?.geom;
  return g === "point" ? 2 : g === "line" ? 1 : 0;
};

/** Зураасны хээ → dash загвар. Газрын зураг ба тайлбар нэг эх сурвалжтай. */
export const DASH_PATTERN: Record<
  NonNullable<LayerDef["dash"]>,
  number[] | null
> = {
  solid: null,
  dash: [7, 4],
  dot: [1.5, 3],
  "dash-dot": [8, 3, 1.5, 3],
  "long-dash": [14, 6],
};
