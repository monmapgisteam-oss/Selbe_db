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
import { readFileSync } from 'node:fs';

const ENTRY = String(process.argv[1] ?? '').replace(/\\/g, '/');
const IS_CHECK = /\.check\.mjs$/i.test(ENTRY);

/* ⚠️ 2026-09-17: код дотор үйлчилгээний fallback байхгүй тул `services.ts`-ийг импортлодог
   БҮХ тест `.env` (+ `.env.development.local`)-ийн NEXT_PUBLIC_* -ийг шаардана — Node нь
   `.env`-ийг өөрөө уншдаггүй тул энд ачаална (байгаа env-ийг дарахгүй).
   ⚠️ 2026-09-25: `.env.development.local`-ийг ЭХЛЭЖ уншина — «эхэнд тавьсан нь ялна»
   тул урьд `.env` локал давхаргыг дардаг байв (Next.js-ийн дараалалтай эсрэг). */
for (const f of ['../.env.development.local', '../.env']) {
  try {
    for (const line of readFileSync(new URL(f, import.meta.url), 'utf8').split(/\r?\n/)) {
      const m = /^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  } catch { /* файл алга — хэвийн */ }
}
const orgRoot = (u) => (u || '').replace(/\/+$/, '').replace(/arcgis\/rest\/services$/, '');
const HJ = orgRoot(process.env.NEXT_PUBLIC_ARCGIS_HJ);
/* ⚠️ 2026-09-25: `SELBE_ALL_DATA_last_0917` (`TD`) нь GAZAR суурьтай — тестүүд түүгээр залгана. */
const ROOTS = [...new Set([HJ, orgRoot(process.env.NEXT_PUBLIC_ARCGIS_GAZAR)].filter(Boolean))];

function fs2() { return readFileSync(new URL('../.env.development.local', import.meta.url), 'utf8'); }
let liveTok = '', liveTok2 = '', liveTok2Svc = [];
if (IS_CHECK) {
  liveTok = process.env.ARCGIS_ADMIN_TOKEN || '';
  if (!liveTok) {
    try {
      const m = /^ARCGIS_ADMIN_TOKEN=(.+)$/m.exec(fs2());
      if (m) liveTok = m[1].trim();
    } catch { /* файл алга — хэвийн */ }
  }
  /* ⚠️ 2-Р ТОКЕН (2026-09-17): ХАБЭА Survey123 үйлчилгээнүүд тусдаа API key-тэй —
     `ARCGIS_ADMIN_TOKEN_2` + `ARCGIS_ADMIN_TOKEN_2_SERVICES` (үйлчилгээний нэр, таслалаар). */
  liveTok2 = process.env.ARCGIS_ADMIN_TOKEN_2 || '';
  try {
    const src = fs2();
    if (!liveTok2) { const m = /^ARCGIS_ADMIN_TOKEN_2=(.+)$/m.exec(src); if (m) liveTok2 = m[1].trim(); }
    const m2 = /^ARCGIS_ADMIN_TOKEN_2_SERVICES=(.+)$/m.exec(src); if (m2) liveTok2Svc = m2[1].split(',').map((x) => x.trim()).filter(Boolean);
  } catch { /* файл алга */ }
}
const tokFor = (url) => (liveTok2 && liveTok2Svc.some((n) => url.includes(`/services/${n}/`)) ? liveTok2 : liveTok);

/** Тандалт — токеныг POST биед (query string-д БИШ). */
const probe = async (tok) => {
  const body = new URLSearchParams({ f: 'json' });
  if (tok) body.set('token', tok);
  /* ⚠️ 4 сек-ийн хязгаар — firewall «drop» үед 80 тест × TCP timeout болохоос (2026-09-17). */
  const res = await fetch(`${HJ}arcgis/rest/services/Bagts_1_9f/FeatureServer`, {
    method: 'POST', body, signal: AbortSignal.timeout(4000),
  });
  return res.json();
};

/* ⚠️ 2026-09-21: ТОКЕН БАЙСАН Ч нэг удаа тандана — API key-ийн хугацаа дуусвал (498 «Invalid
   token») бүх амьд шалгуур «алдаа» гэж унадаг байв; одоо хүчингүй токеныг хаяж ⏭ алгасна
   (сүлжээгүй/499-тэй ижил). Хүчинтэй бол урьдын адил залгана. */
if (IS_CHECK && liveTok && HJ) {
  try {
    const j = await probe(liveTok);
    if (j?.error?.code === 498 || j?.error?.code === 499) {
      console.warn(`⏭ ARCGIS_ADMIN_TOKEN хүчингүй (${j.error.code}) — амьд шалгуурууд алгасна; түлхүүрээ шинэчилнэ үү`);
      liveTok = ''; process.env.SELBE_LIVE_SKIP = '1';
    }
  } catch { /* сүлжээгүй — доорх ердийн зам */ }
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
        if (!b.has('token')) b.set('token', tok);
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
} else if (IS_CHECK && HJ) {
  try {
    const j = await probe('');
    if (j?.error?.code === 499 || j?.error?.code === 498) process.env.SELBE_LIVE_SKIP = '1';
    /* ⚠️ Алгасалтыг hooks (`load`) хийнэ — файл дотор `process.exit()` дуудвал
       Windows дээр libuv assertion-оор унадаг (2026-09-17). */
  } catch { /* сүлжээгүй — шалгуур өөрөө шийднэ */ }
}

register('./ts-alias-hooks.mjs', import.meta.url, { data: { liveSkip: !!process.env.SELBE_LIVE_SKIP } });
