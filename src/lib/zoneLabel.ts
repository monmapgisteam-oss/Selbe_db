import { t as tr, getLocale } from '@/lib/i18nCore';

/**
 * БҮСИЙН НЭРИЙГ ДЭЛГЭЦЭНД (2026-10-04) — англи горимд «Багц-1…4.2» мэт монгол бүсийн
 * нэр орчуулагдалгүй гардаг байв. `enData`-д байгаа нэр `tr`-ээр; байхгүй «Багц…» угтварыг
 * «Package…» болгоно. ЗӨВХӨН харуулалт — `zone` төлөв/URL/`zoneWhere` монгол эх хэвээр.
 */
export const zoneLabel = (z: string): string => {
  const t = tr(z);
  return getLocale() === 'en' ? t.replace(/^Багц/, 'Package') : t;
};
/** Олон бүс (таслалаар) — харуулах мөр */
export const zonesLabel = (sel: string[]): string => sel.map(zoneLabel).join(', ');
