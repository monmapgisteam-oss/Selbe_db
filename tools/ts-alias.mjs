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
 *        HJ орг руу явах `fetch` бүрд токеныг ХАВСАРГАНА (POST бие / GET qs);
 *      · байхгүй бол нэг удаа тандаж, org-only бол `SELBE_LIVE_SKIP=1`
 *        тавина — амьд шалгуурууд ⏭ алгасна (унахгүй), сүлжээгүй нь хэвийн.
 *    Токеныг ХЭЗЭЭ Ч логлохгүй.
 */
import { readFileSync } from 'node:fs';

/* ⚠️ 2026-09-17: код дотор үйлчилгээний fallback байхгүй тул `services.ts`-ийг импортлодог
   БҮХ тест `.env` (+ `.env.development.local`)-ийн NEXT_PUBLIC_* -ийг шаардана — Node нь
   `.env`-ийг өөрөө уншдаггүй тул энд ачаална (байгаа env-ийг дарахгүй). */
for (const f of ['../.env', '../.env.development.local']) {
  try {
    for (const line of readFileSync(new URL(f, import.meta.url), 'utf8').split(/\r?\n/)) {
      const m = /^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  } catch { /* файл алга — хэвийн */ }
}
const HJ = (process.env.NEXT_PUBLIC_ARCGIS_HJ || '').replace(/arcgis\/rest\/services\/?$/, '');
let liveTok = process.env.ARCGIS_ADMIN_TOKEN || '';
if (!liveTok) {
  try {
    const m = /^ARCGIS_ADMIN_TOKEN=(.+)$/m.exec(readFileSync(new URL('../.env.development.local', import.meta.url), 'utf8'));
    if (m) liveTok = m[1].trim();
  } catch { /* файл алга — хэвийн */ }
}
/* ⚠️ 2-Р ТОКЕН (2026-09-17): ХАБЭА Survey123 үйлчилгээнүүд тусдаа API key-тэй —
   `ARCGIS_ADMIN_TOKEN_2` + `ARCGIS_ADMIN_TOKEN_2_SERVICES` (үйлчилгээний нэр, таслалаар). */
let liveTok2 = process.env.ARCGIS_ADMIN_TOKEN_2 || '', liveTok2Svc = [];
try {
  const src = fs2();
  if (!liveTok2) { const m = /^ARCGIS_ADMIN_TOKEN_2=(.+)$/m.exec(src); if (m) liveTok2 = m[1].trim(); }
  const m2 = /^ARCGIS_ADMIN_TOKEN_2_SERVICES=(.+)$/m.exec(src); if (m2) liveTok2Svc = m2[1].split(',').map((x) => x.trim()).filter(Boolean);
} catch { /* файл алга */ }
function fs2() { return readFileSync(new URL('../.env.development.local', import.meta.url), 'utf8'); }
const tokFor = (url) => (liveTok2 && liveTok2Svc.some((n) => url.includes(`/services/${n}/`)) ? liveTok2 : liveTok);
if (liveTok) {
  const orig = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (HJ && url.startsWith(HJ)) {
      const liveTok = tokFor(url);
      const b = init?.body;
      if (b instanceof URLSearchParams) {
        if (!b.has('token')) b.set('token', liveTok);
      } else if (typeof b === 'string') {
        const p = new URLSearchParams(b);
        if (!p.has('token')) { p.set('token', liveTok); init = { ...init, body: p.toString() }; }
      } else if (b == null && !/[?&]token=/.test(url)) {
        input = `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(liveTok)}`;
      }
    }
    return orig(input, init);
  };
} else {
  try {
    /* ⚠️ 4 сек-ийн хязгаар — firewall «drop» үед 80 тест × TCP timeout болохоос (2026-09-17). */
    const j = await (await fetch(`${HJ}arcgis/rest/services/Bagts_1_9f/FeatureServer?f=json`, { signal: AbortSignal.timeout(4000) })).json();
    if (j?.error?.code === 499 || j?.error?.code === 498) process.env.SELBE_LIVE_SKIP = '1';
    /* ⚠️ Алгасалтыг hooks (`load`) хийнэ — файл дотор `process.exit()` дуудвал
       Windows дээр libuv assertion-оор унадаг (2026-09-17). */
  } catch { /* сүлжээгүй — шалгуур өөрөө шийднэ */ }
}

register('./ts-alias-hooks.mjs', import.meta.url, { data: { liveSkip: !!process.env.SELBE_LIVE_SKIP } });
