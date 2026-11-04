/**
 * `ts-alias-hooks.mjs`-ийг Node-ийн модулийн шийдвэрлэгчид БҮРТГЭНЭ.
 *
 * Хэрэглээ:  node --import./tools/ts-alias.mjs <тестийн файл>
 */

import { register } from 'node:module';

import { loadPublicEnv, liveStatus } from './liveEnv.mjs';
import { entRoots, loadAdminTokens, installWriteGuard, installTokenInjection } from './liveFetch.mjs';

const ENTRY = String(process.argv[1] ?? '').replace(/\\/g, '/');
const IS_CHECK = /\.check\.mjs$/i.test(ENTRY);

const HAD_HJ = !!process.env.NEXT_PUBLIC_ENT_DATA;
const envRead = loadPublicEnv(process.env);
/* Нэгж шалгуурт нэвтрэлт ҮРГЭЛЖ асаалттай (2026-11-04): `.env.development.local`-ын `NEXT_PUBLIC_AUTH_OFF=1` орж ирвэл
   `AUTH.appId` хоосон болж эрхийн код «бүгдэд зөвшөөрнө» (`butetsAcl` · `huvaariBatlah` · `permissions` …) — 5 ACL шалгуур
   кодын алдаагүй унадаг байв. Туг нь зөвхөн `next dev`-ийн хэрэгсэл; шалгуур бүр `.env`-ийн APP_ID-аар ажиллана. */
if (IS_CHECK) delete process.env.NEXT_PUBLIC_AUTH_OFF;
if (!envRead && !HAD_HJ) {
  process.stderr.write('⚠️ .env алга — .env.example-ийг .env болгож хуулна уу (cp .env.example .env)\n');
} else if (envRead && (!process.env.NEXT_PUBLIC_ENT_DATA || (!process.env.NEXT_PUBLIC_AUTH_APP_ID && process.env.NEXT_PUBLIC_AUTH_OFF !== '1'))) {
  process.stderr.write('⚠️ .env-ийн утгууд хоосон — бөглөнө үү (хоосон бол ~28 шалгуур унана)\n');
}
const ENT = (process.env.NEXT_PUBLIC_ENT_DATA || '').replace(/\/+$/, '');
const ROOTS = entRoots();
const HJ = ROOTS[0] ?? '';

/* Токен · бичилтийн хаалт · залгалт — `tools/liveFetch.mjs` (2026-11-04: data-audit · iot-verify-тэй хуваалцсан) */
let liveTok = '', liveTok2 = '', liveTok2Svc = [];
if (IS_CHECK) ({ tok: liveTok, tok2: liveTok2, tok2Svc: liveTok2Svc } = loadAdminTokens());

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
/* Шалгуурт: бичилтийн хаалт + аппын төлөвийн хүснэгтийн стаб, дараа нь токен залгалт (`liveFetch.mjs`) */
if (IS_CHECK) installWriteGuard({ stubAppTables: true });
if (IS_CHECK) installTokenInjection({ tok: liveTok, tok2: liveTok2, tok2Svc: liveTok2Svc }, ROOTS);

const UI = /\.ui\.check\.mjs$/i.test(ENTRY) || process.env.SELBE_UI_SMOKE === '1';
register('./ts-alias-hooks.mjs', import.meta.url, { data: { liveSkip: !!process.env.SELBE_LIVE_SKIP, ui: UI } });
