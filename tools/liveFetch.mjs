/**
 * АМЬД ENTERPRISE-ТЭЙ АЖИЛЛАХ FETCH ДАВХАРГА (2026-11-04) — `ts-alias.mjs`-ээс задлав; `tools/data-audit.mjs` ·
 * `iot-verify*.mjs` ч ижил нэг хэрэгжүүлэлтийг ашиглана (токен-2 чиглүүлэлт, GET→POST, бичилтийн хаалт).
 *
 *   · `loadAdminTokens()`      — `ARCGIS_ADMIN_TOKEN` (+ `_2`, `_2_SERVICES`) env эсвэл `.env.development.local`-оос.
 *   · `installWriteGuard()`    — `globalThis.fetch`-ийг ороож, ArcGIS-ийн БИЧИХ endpoint бүрийг 403-оор буцаана
 *                                (`writeAttempts()` тоолно). `stubAppTables: true` (шалгуур) бол аппын төлөвийн
 *                                хүснэгтүүдийн (230 · 183 · 191 · 192 · 193) өгөгдлийн хүсэлтийг «Token Required»-оор стаблана.
 *   · `installTokenInjection()`— Enterprise-ийн хаягт токен залгана (URLSearchParams · string body · GET→POST).
 *
 * Дараалал: `installWriteGuard` → `installTokenInjection` (сүүлд суусан нь эхэлж ажиллана — токен залгасны ДАРАА хаалт).
 * Токены УТГЫГ хэзээ ч логлохгүй.
 */
import { adminToken, devLocal } from './liveEnv.mjs';

const urlOf = (input) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url);

/** Enterprise-ийн үндэс хаягууд (`NEXT_PUBLIC_ENT_DATA` → `…/map/`) — токен залгах хүрээ */
export function entRoots() {
  const ent = (process.env.NEXT_PUBLIC_ENT_DATA || '').replace(/\/+$/, '');
  const hj = ent ? ent.replace(/\/Hosted$/i, '').replace(/rest\/services$/i, '') : '';
  return hj ? [hj] : [];
}

/** Админ токенууд — `{ tok, tok2, tok2Svc }`; алга бол хоосон мөр/жагсаалт */
export function loadAdminTokens() {
  const tok = adminToken();
  let tok2 = process.env.ARCGIS_ADMIN_TOKEN_2 || '';
  let tok2Svc = [];
  try {
    const src = devLocal();
    if (!tok2) { const m = /^ARCGIS_ADMIN_TOKEN_2=(.+)$/m.exec(src); if (m) tok2 = m[1].trim(); }
    const m2 = /^ARCGIS_ADMIN_TOKEN_2_SERVICES=(.+)$/m.exec(src);
    if (m2) tok2Svc = m2[1].split(',').map((x) => x.trim()).filter(Boolean);
  } catch { /* файл алга — хэвийн */ }
  return { tok, tok2, tok2Svc };
}

const realHost = (h) => /(^|\.)selbecity\.mn$|(^|\.)arcgis\.com$/i.test(h);
const WRITE_EP = /\/(applyEdits|addFeatures|updateFeatures|deleteFeatures|calculate|append|truncate|createService|addToDefinition|updateDefinition|deleteFromDefinition|addItem|updateItem|deleteItem|share|unshare|delete)(\?|\/?$)/i;
const APP_TABLES = /\/(SYS_Selbe_Permissions\/FeatureServer\/230|Guitsetgel_talbe\/FeatureServer\/(183|191|192|193))\/[a-z]/i;

let blocked = 0;
/** Хаалтад баригдсан бичилтийн оролдлогын тоо (аудит тайланд ЗААВАЛ 0) */
export const writeAttempts = () => blocked;

const jsonErr = (code, message) => new Response(JSON.stringify({ error: { code, message, details: [] } }),
  { status: 200, headers: { 'Content-Type': 'application/json' } });

/**
 * Бичилтийн хаалт. ArcGIS-ийн «эрхгүй» хариутай ИЖИЛ хэлбэр (HTTP 200 + {error}) — дуудагч «бичилт бүтэлгүй» замаар явна.
 */
export function installWriteGuard({ stubAppTables = true } = {}) {
  const before = globalThis.fetch;
  if (!before) return;
  globalThis.fetch = async (input, init) => {
    let u = null;
    try { u = new URL(String(urlOf(input))); } catch { /* харьцангуй — хөндөхгүй */ }
    /* Аппын төлөвийн хүснэгтүүд (эрх 230 · хяналт 183 · ноорог 191 · хуваарь/обьём батлалт 192/193): шалгуурт зөвхөн
       МЕТА уншиж болно; query/бичилт нь токенгүй үеийнхтэй ИЖИЛ «Token Required» — нэгж шалгуур хуурамч хүснэгтээр л ажиллана. */
    if (stubAppTables && u && realHost(u.host) && APP_TABLES.test(u.pathname)) return jsonErr(499, 'Token Required');
    if (u && realHost(u.host) && WRITE_EP.test(u.pathname)) {
      blocked++;
      return jsonErr(403, 'Тест: бодит ArcGIS-д бичихийг хориглосон');
    }
    return before(input, init);
  };
}

/**
 * Токен залгалт — `roots`-оор эхэлсэн хаягт л. `tok2Svc`-д нэрлэсэн үйлчилгээнд `tok2`, бусдад `tok`.
 * Request объект · FormData г.м. бусад хэлбэрт залгахгүй — хэвээр явуулна. `tok` хоосон бол юу ч суулгахгүй.
 */
export function installTokenInjection({ tok, tok2 = '', tok2Svc = [] }, roots = entRoots()) {
  if (!tok || !roots.length) return;
  const tokFor = (url) => (tok2 && tok2Svc.some((n) => url.includes(`/services/${n}/`)) ? tok2 : tok);
  const orig = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = urlOf(input);
    if (url && roots.some((r) => url.startsWith(r))) {
      const t = tokFor(url);
      const b = init?.body;
      const method = String(init?.method ?? (typeof input === 'object' && !(input instanceof URL) ? input.method : 'GET')).toUpperCase();
      if (b instanceof URLSearchParams) {
        if (!b.has('token')) {
          const p = new URLSearchParams(b);
          p.set('token', t);
          init = { ...init, body: p };
        }
      } else if (typeof b === 'string') {
        const p = new URLSearchParams(b);
        if (!p.has('token')) { p.set('token', t); init = { ...init, body: p.toString() }; }
      } else if (b == null && method === 'GET' && (typeof input === 'string' || input instanceof URL)) {
        const u = new URL(url);
        const p = new URLSearchParams(u.search);
        if (!p.has('token')) p.set('token', t);
        u.search = '';
        input = u.href;
        const headers = new Headers(init?.headers);
        headers.set('Content-Type', 'application/x-www-form-urlencoded');
        init = { ...init, method: 'POST', headers, body: p.toString() };
      }
    }
    return orig(input, init);
  };
}
