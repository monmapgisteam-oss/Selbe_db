/**
 * `ts-alias-hooks.mjs`-ийг Node-ийн модулийн шийдвэрлэгчид БҮРТГЭНЭ.
 *
 * Хэрэглээ:  node --import./tools/ts-alias.mjs <тестийн файл>
 */

import { register } from 'node:module';

import { loadPublicEnv, devLocal, adminToken, liveStatus } from './liveEnv.mjs';

const ENTRY = String(process.argv[1] ?? '').replace(/\\/g, '/');
const IS_CHECK = /\.check\.mjs$/i.test(ENTRY);

const HAD_HJ = !!process.env.NEXT_PUBLIC_ENT_DATA;
const envRead = loadPublicEnv(process.env);
if (!envRead && !HAD_HJ) {
  process.stderr.write('⚠️ .env алга — .env.example-ийг .env болгож хуулна уу (cp .env.example .env)\n');
} else if (envRead && (!process.env.NEXT_PUBLIC_ENT_DATA || (!process.env.NEXT_PUBLIC_AUTH_APP_ID && process.env.NEXT_PUBLIC_AUTH_OFF !== '1'))) {
  process.stderr.write('⚠️ .env-ийн утгууд хоосон — бөглөнө үү (хоосон бол ~28 шалгуур унана)\n');
}
const ENT = (process.env.NEXT_PUBLIC_ENT_DATA || '').replace(/\/+$/, '');
const HJ = ENT ? ENT.replace(/\/Hosted$/i, '').replace(/rest\/services$/i, '') : '';
const ROOTS = HJ ? [HJ] : [];

let liveTok = '', liveTok2 = '', liveTok2Svc = [];
if (IS_CHECK) {
  liveTok = adminToken();
  liveTok2 = process.env.ARCGIS_ADMIN_TOKEN_2 || '';
  try {
    const src = devLocal();
    if (!liveTok2) { const m = /^ARCGIS_ADMIN_TOKEN_2=(.+)$/m.exec(src); if (m) liveTok2 = m[1].trim(); }
    const m2 = /^ARCGIS_ADMIN_TOKEN_2_SERVICES=(.+)$/m.exec(src); if (m2) liveTok2Svc = m2[1].split(',').map((x) => x.trim()).filter(Boolean);
  } catch { /* файл алга */ }
}
const tokFor = (url) => (liveTok2 && liveTok2Svc.some((n) => url.includes(`/services/${n}/`)) ? liveTok2 : liveTok);

function liveSkip(reason) {
  process.env.SELBE_LIVE_SKIP = '1';
  /* эхний (хамгийн тодорхой) шалтгаан үлдэнэ — токентой салаа унасны дараа токенгүй тандалт дахин алгасдаг */
  process.env.SELBE_LIVE_SKIP_REASON ||= reason;
}

if (IS_CHECK && process.env.SELBE_LIVE_PROBED === '1') {
  if (process.env.SELBE_LIVE_TOKEN_OFF === '1') liveTok = '';
} else if (IS_CHECK && HJ) {
  const st = await liveStatus({ ent: ENT, tok: liveTok, warn: (m) => console.warn(m) });
  if (st.tokOff) liveTok = '';
  if (st.skip) liveSkip(st.reason);
}
if (IS_CHECK && process.env.SELBE_LIVE_SKIP === '1' && ENT) {
  const entHost = (() => { try { return new URL(ENT).host; } catch { return ''; } })();
  const prev = globalThis.fetch;
  if (entHost && prev) {
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
      let host = '';
      try { host = new URL(String(url)).host; } catch { /* харьцангуй хаяг — хөндөхгүй */ }
      if (host === entHost) throw new TypeError('fetch failed (тест: Enterprise хүрэгдэхгүй — амьд шалгалт алгасагдсан)');
      return prev(input, init);
    };
  }
}
if (IS_CHECK) {
  const realHost = (h) => /(^|\.)selbecity\.mn$|(^|\.)arcgis\.com$/i.test(h);
  const WRITE_EP = /\/(applyEdits|addFeatures|updateFeatures|deleteFeatures|calculate|append|truncate|createService|addToDefinition|updateDefinition|deleteFromDefinition|addItem|updateItem|deleteItem|share|unshare|delete)(\?|\/?$)/i;
  const before = globalThis.fetch;
  if (before) {
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
      let u = null;
      try { u = new URL(String(url)); } catch { /* харьцангуй — хөндөхгүй */ }
      /* Аппын төлөвийн хүснэгтүүд (эрх 230 · хяналт 183 · ноорог 191 · хуваарь/обьём батлалт 192/193): шалгуурт зөвхөн
         МЕТА уншиж болно; query/бичилт нь токенгүй үеийнхтэй ИЖИЛ «Token Required» — нэгж шалгуур хуурамч хүснэгтээр л ажиллана. */
      if (u && realHost(u.host) && /\/(SYS_Selbe_Permissions\/FeatureServer\/230|Guitsetgel_talbe\/FeatureServer\/(183|191|192|193))\/[a-z]/i.test(u.pathname)) {
        return new Response(JSON.stringify({ error: { code: 499, message: 'Token Required', details: [] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u && realHost(u.host) && WRITE_EP.test(u.pathname)) {
        /* ArcGIS-ийн «эрхгүй» хариутай ИЖИЛ хэлбэр (HTTP 200 + {error}) — токенгүй үеийн «бичилт бүтэлгүй» замаар явна */
        return new Response(JSON.stringify({ error: { code: 403, message: 'Тест: бодит ArcGIS-д бичихийг хориглосон', details: [] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return before(input, init);
    };
  }
}
if (IS_CHECK && liveTok) {
  const orig = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (ROOTS.some((r) => url.startsWith(r))) {
      const tok = tokFor(url);
      const b = init?.body;
      const method = String(init?.method ?? (typeof input === 'object' && !(input instanceof URL) ? input.method : 'GET')).toUpperCase();
      if (b instanceof URLSearchParams) {
        if (!b.has('token')) {
          const p = new URLSearchParams(b);
          p.set('token', tok);
          init = { ...init, body: p };
        }
      } else if (typeof b === 'string') {
        const p = new URLSearchParams(b);
        if (!p.has('token')) { p.set('token', tok); init = { ...init, body: p.toString() }; }
      } else if (b == null && method === 'GET' && (typeof input === 'string' || input instanceof URL)) {
        const u = new URL(url);
        const p = new URLSearchParams(u.search);
        if (!p.has('token')) p.set('token', tok);
        u.search = '';
        input = u.href;
        const headers = new Headers(init?.headers);
        headers.set('Content-Type', 'application/x-www-form-urlencoded');
        init = { ...init, method: 'POST', headers, body: p.toString() };
      }
      /* Бусад тохиолдолд (Request объект, FormData г.м.) токен залгахгүй — хэвээр явуулна. */
    }
    return orig(input, init);
  };
}

const UI = /\.ui\.check\.mjs$/i.test(ENTRY) || process.env.SELBE_UI_SMOKE === '1';
register('./ts-alias-hooks.mjs', import.meta.url, { data: { liveSkip: !!process.env.SELBE_LIVE_SKIP, ui: UI } });
