/**
 * `ts-alias-hooks.mjs`-ийг Node-ийн модулийн шийдвэрлэгчид БҮРТГЭНЭ.
 *
 * ⚠️ `--import <hooks>` дангаараа хангалтгүй: тэр нь файлыг зүгээр л ажиллуулна.
 * `resolve` дэгээ ажиллахын тулд `register()`-ээр тусад нь бүртгэх ёстой.
 *
 * Хэрэглээ:  node --import ./tools/ts-alias.mjs <тестийн файл>
 */

import { register } from 'node:module';

/*
 * ⚠️ АМЬД ШАЛГУУРУУД ба ORG-ONLY ҮЙЛЧИЛГЭЭ (2026-09-17). monmap-ын бүх
 *    үйлчилгээ Organization-only болсон тул токенгүй `fetch` 499 авна.
 *    Энэ loader-ийг БҮХ check.mjs хэрэглэдэг тул нэг газраас:
 *      · `ARCGIS_ADMIN_TOKEN` (env эсвэл `.env.development.local`) байвал
 *        HJ/GAZAR орг руу явах `fetch` бүрд токеныг POST БИЕД ХАВСАРГАНА;
 *      · байхгүй бол нэг удаа тандаж, org-only бол `SELBE_LIVE_SKIP=1`
 *        тавина — амьд шалгуурууд ⏭ алгасна (унахгүй), сүлжээгүй нь хэвийн.
 *    Токеныг ХЭЗЭЭ Ч логлохгүй.
 * ⚠️ 2026-09-25: токеныг ЗӨВХӨН `*.check.mjs` оролтын цэгт (process.argv[1])
 *    залгана. Урьд `bot`, `ask`, `iot:*`, `negtgel-seed`, `hyanalt-demo` зэрэг
 *    ЭНЭ loader-ийг ашигладаг БҮХ скрипт admin токеныг чимээгүй авч, prod руу
 *    бичих эрхтэй ажилладаг байв. Скрипт токен хэрэгтэй бол өөрөө ил уншина
 *    (`tools/bagts-gun.mjs` шиг).
 * ⚠️ 2026-09-25: токен ХЭЗЭЭ Ч query string-д орохгүй (сервер/прокси лог,
 *    Referer-ээр алдагдана) — GET хүсэлтийг POST form болгож хөрвүүлнэ.
 */
/* ⚠️ 2026-10-22 (аудит): `.env` ачаалалт · токены уншилт · тандалт `liveEnv.mjs`-д — `test-all.mjs` ч НЭГ дүрмээр
   (нэг удаа) тандаж үр дүнг энд env-ээр дамжуулна (доорх «ТАНДАЛТ НЭГ УДАА»). */
import { loadPublicEnv, devLocal, adminToken, liveStatus } from './liveEnv.mjs';

const ENTRY = String(process.argv[1] ?? '').replace(/\\/g, '/');
const IS_CHECK = /\.check\.mjs$/i.test(ENTRY);

/* ⚠️ 2026-09-17: код дотор үйлчилгээний fallback байхгүй тул `services.ts`-ийг импортлодог
   БҮХ тест `.env` (+ `.env.development.local`)-ийн NEXT_PUBLIC_* -ийг шаардана — Node нь
   `.env`-ийг өөрөө уншдаггүй тул энд ачаална (байгаа env-ийг дарахгүй).
   ⚠️ 2026-09-25: `.env.development.local`-ийг ЭХЛЭЖ уншина — «эхэнд тавьсан нь ялна»
   тул урьд `.env` локал давхаргыг дардаг байв (Next.js-ийн дараалалтай эсрэг). */
/* ⚠️ 2026-10-20: AGOL (`NEXT_PUBLIC_ARCGIS_HJ`) хасагдсан — Enterprise (`NEXT_PUBLIC_ENT_DATA`) л. */
const HAD_HJ = !!process.env.NEXT_PUBLIC_ENT_DATA;
const envRead = loadPublicEnv(process.env);
/* ⚠️ 2026-10-09: `.env` нь git-ignored (зөвхөн `.env.example` track хийгддэг) — шинэ clone/worktree
   дээр `npm test`-ийн ~28 шалгуур «NEXT_PUBLIC_* алга» алдаагаар учир нь ойлгомжгүй унадаг байв.
   CI нь орчны хувьсагчаар өгдөг (`test.yml`) тул env-д `NEXT_PUBLIC_ENT_DATA` байвал чимээгүй.
   Процесс бүрд НЭГ мөр (stderr) — `test-all` эхэнд нь мөн нэг удаа хэлнэ, унасан шалгуурын
   гаралтад ч учир нь шууд харагдана. */
if (!envRead && !HAD_HJ) {
  process.stderr.write('⚠️ .env алга — .env.example-ийг .env болгож хуулна уу (cp .env.example .env)\n');
} else if (envRead && (!process.env.NEXT_PUBLIC_ENT_DATA || (!process.env.NEXT_PUBLIC_AUTH_APP_ID && process.env.NEXT_PUBLIC_AUTH_OFF !== '1'))) {
  /* ⚠️ 2026-10-26 (аудит G5): `.env.example`-д ENT_DATA урьдчилан бөглөгдсөн — AUTH_APP_ID хоосон ч ижил унал */
  /* ⚠️ 2026-10-11 (аудит №7): `.env` байгаа ч утгууд хоосон (загварыг хуулаад бөглөөгүй) — ижил унал, өөр шалтгаан */
  process.stderr.write('⚠️ .env-ийн утгууд хоосон — бөглөнө үү (хоосон бол ~28 шалгуур унана)\n');
}
/* ⚠️ 2026-10-20: амьд шалгуурын ТОКЕН (ARCGIS_ADMIN_TOKEN) нь одоо ENTERPRISE-ийн токен — Сэлбэ Enterprise ArcGIS Server
   (`NEXT_PUBLIC_ENT_DATA`-ийн `…/map/`) доорх бүх хүсэлтэд залгагдана. AGOL (`HJ`/`GAZAR`) хасагдсан. */
const ENT = (process.env.NEXT_PUBLIC_ENT_DATA || '').replace(/\/+$/, '');
const HJ = ENT ? ENT.replace(/\/Hosted$/i, '').replace(/rest\/services$/i, '') : '';
const ROOTS = HJ ? [HJ] : [];

let liveTok = '', liveTok2 = '', liveTok2Svc = [];
if (IS_CHECK) {
  liveTok = adminToken();
  /* ⚠️ 2-Р ТОКЕН (2026-09-17): ХАБЭА Survey123 үйлчилгээнүүд тусдаа API key-тэй —
     `ARCGIS_ADMIN_TOKEN_2` + `ARCGIS_ADMIN_TOKEN_2_SERVICES` (үйлчилгээний нэр, таслалаар). */
  liveTok2 = process.env.ARCGIS_ADMIN_TOKEN_2 || '';
  try {
    const src = devLocal();
    if (!liveTok2) { const m = /^ARCGIS_ADMIN_TOKEN_2=(.+)$/m.exec(src); if (m) liveTok2 = m[1].trim(); }
    const m2 = /^ARCGIS_ADMIN_TOKEN_2_SERVICES=(.+)$/m.exec(src); if (m2) liveTok2Svc = m2[1].split(',').map((x) => x.trim()).filter(Boolean);
  } catch { /* файл алга */ }
}
const tokFor = (url) => (liveTok2 && liveTok2Svc.some((n) => url.includes(`/services/${n}/`)) ? liveTok2 : liveTok);

/* ⚠️ 2026-10-21 (аудит): амьд шалгуурын АЛГАСАЛТЫН ШАЛТГААНЫГ дамжуулна — `ts-alias-hooks.mjs` (⏭ мөрөнд, мөн
   `SELBE_LIVE_REQUIRED=1` бол алгасахын оронд УНАГАНА) ба `test-all.mjs` (GitHub Actions-д `::warning::` нэгтгэл:
   хэдэн шалгуур, ямар шалтгаанаар). Урьд CI дээр чимээгүй алгасдаг тул deploy ногоон атлаа амьд шалгуур 0 ажилласныг
   хэн ч мэддэггүй байв. Анхдагч зан (⏭ алгасах) ХЭВЭЭР. */
function liveSkip(reason) {
  process.env.SELBE_LIVE_SKIP = '1';
  /* эхний (хамгийн тодорхой) шалтгаан үлдэнэ — токентой салаа унасны дараа токенгүй тандалт дахин алгасдаг */
  process.env.SELBE_LIVE_SKIP_REASON ||= reason;
}

/* ⚠️ 2026-10-22 (аудит): ТАНДАЛТ НЭГ УДАА. `test-all.mjs` тандаад үр дүнг env-ээр дамжуулна (`liveEnv.liveEnvOf`):
   `SELBE_LIVE_PROBED=1` бол энд ДАХИН ТАНДАХГҮЙ — `SELBE_LIVE_TOKEN_OFF=1` бол токен залгахгүй, `SELBE_LIVE_SKIP`/`_REASON`
   env-ээрээ hooks руу (⏭). Урьд ~220 шалгуур тус бүр өөрөө тандаж, Enterprise хүрэгдэхгүй CI-д процесс бүр 10–14 с сул
   зогсдог байв (`liveEnv.mjs`-ийн ⚠️). Дангаар ажиллуулсан шалгуур урьдын адил өөрөө тандана; дүрмүүд (токен байсан ч
   тандах 2026-09-21 · хүрэгдэхгүй бол ⏭ 2026-10-21 · 4 с хязгаар 2026-09-17) `liveEnv.liveStatus`-д ХЭВЭЭР. */
if (IS_CHECK && process.env.SELBE_LIVE_PROBED === '1') {
  if (process.env.SELBE_LIVE_TOKEN_OFF === '1') liveTok = '';
} else if (IS_CHECK && HJ) {
  const st = await liveStatus({ ent: ENT, tok: liveTok, warn: (m) => console.warn(m) });
  if (st.tokOff) liveTok = '';
  if (st.skip) liveSkip(st.reason);
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
        /* ⚠️ 2026-10-11 (аудит №7): дуудагчийн объектыг МУТАЦИЛАХГҮЙ — хуулбарт токен нэмнэ (урьд нь дахин
           ашигласан `URLSearchParams` дээр токен үлдэж, дараагийн хүсэлт/лог руу дамждаг байв). */
        if (!b.has('token')) {
          const p = new URLSearchParams(b);
          p.set('token', tok);
          init = { ...init, body: p };
        }
      } else if (typeof b === 'string') {
        const p = new URLSearchParams(b);
        if (!p.has('token')) { p.set('token', tok); init = { ...init, body: p.toString() }; }
      } else if (b == null && method === 'GET' && (typeof input === 'string' || input instanceof URL)) {
        /* ⚠️ 2026-09-25: GET → POST form. Query-ийн параметрүүд биед шилжинэ; токен URL-д ОРОХГҮЙ.
           ArcGIS REST-ийн query/metadata endpoint-ууд POST-ыг ижил хүлээж авдаг. */
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
/* ⚠️ Алгасалтыг hooks (`load`) хийнэ — файл дотор `process.exit()` дуудвал
   Windows дээр libuv assertion-оор унадаг (2026-09-17). */

/* ⚠️ 2026-09-30: UI SMOKE горим — оролтын цэг `*.ui.check.mjs` (эсвэл `SELBE_UI_SMOKE=1`)
   бол hooks нь `*.css` → класс-нэрийн Proxy, `next/dynamic` → синхрон стуб,
   `@arcgis/core/**` → хоосон стуб болгож шийдвэрлэнэ (`ts-alias-hooks.mjs`).
   Бусад шалгуурт ЮУ Ч өөрчлөгдөхгүй. */
const UI = /\.ui\.check\.mjs$/i.test(ENTRY) || process.env.SELBE_UI_SMOKE === '1';
register('./ts-alias-hooks.mjs', import.meta.url, { data: { liveSkip: !!process.env.SELBE_LIVE_SKIP, ui: UI } });
