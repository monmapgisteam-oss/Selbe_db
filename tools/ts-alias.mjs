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

const HJ = 'https://services.arcgis.com/HJzgwvlNIXssnQar/';
let liveTok = process.env.ARCGIS_ADMIN_TOKEN || '';
if (!liveTok) {
  try {
    const m = /^ARCGIS_ADMIN_TOKEN=(.+)$/m.exec(readFileSync(new URL('../.env.development.local', import.meta.url), 'utf8'));
    if (m) liveTok = m[1].trim();
  } catch { /* файл алга — хэвийн */ }
}
if (liveTok) {
  const orig = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(HJ)) {
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
    const j = await (await fetch(`${HJ}arcgis/rest/services/Bagts_1_9f/FeatureServer?f=json`)).json();
    if (j?.error?.code === 499 || j?.error?.code === 498) process.env.SELBE_LIVE_SKIP = '1';
    /* ⚠️ Алгасалтыг hooks (`load`) хийнэ — файл дотор `process.exit()` дуудвал
       Windows дээр libuv assertion-оор унадаг (2026-09-17). */
  } catch { /* сүлжээгүй — шалгуур өөрөө шийднэ */ }
}

register('./ts-alias-hooks.mjs', import.meta.url, { data: { liveSkip: !!process.env.SELBE_LIVE_SKIP } });
