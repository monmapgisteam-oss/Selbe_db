import { AUTH } from '@/lib/services/env';

/**
 * ЛОКАЛ DEV-ИЙН ӨГӨГДЛИЙН ТОКЕН (2026-10-29, хэрэглэгчийн хүсэлт) — нэвтрэлт УНТРААЛТТАЙ үед локал dev сервер дээр
 * хөтөч Enterprise-ийн өгөгдлийг `.env.development.local`-ын `ARCGIS_ADMIN_TOKEN`-оор татна.
 *
 * ⚠️ ГУРВАН нөхцөл ЗЭРЭГ: (1) токен зөвхөн `next dev`-д шингэнэ (`next.config.mjs` — build-д хоосон);
 *    (2) `AUTH.appId` хоосон (нэвтрэлт асаалттай бол хэрэглэгчийн өөрийн токен л); (3) хөтчийн хост localhost.
 * ⚠️ Токен POST биеэр явна (`query.ts` → `tokenParam`), URL · логт бичигдэхгүй.
 */
const RAW = (process.env.SELBE_DEV_DATA_TOKEN ?? '').trim();

const LOCAL = /^(localhost|127.0.0.1|[::1])$/i;

export function devDataToken(): string | null {
  if (!RAW || AUTH.appId || typeof window === 'undefined') return null;
  return LOCAL.test(window.location.hostname) ? RAW : null;
}
