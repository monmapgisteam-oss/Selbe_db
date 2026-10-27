/**
 * АМЬД ШАЛГУУРЫН ОРЧИН — `.env` ачаалалт, `ARCGIS_ADMIN_TOKEN`, Enterprise-ийн ТАНДАЛТ (2026-10-22, аудит).
 *   · `tools/ts-alias.mjs` (шалгуур бүрийн loader) — `.env`-ийг ачаалж, шалгуурыг ДАНГААР нь ажиллуулсан үед л тандана;
 *   · `tools/test-all.mjs` — НЭГ удаа тандаж үр дүнг хүүхэд процессуудад env-ээр дамжуулна (`liveEnvOf`).
 *
 * ⚠️ ЯАГААД ТУСДАА МОДУЛЬ (2026-10-22, аудит): урьд тандалт `ts-alias.mjs` дотор байж ШАЛГУУР БҮРИЙН процесст
 *    давтагддаг байв. GitHub Actions-ийн runner Enterprise-д хүрдэггүй (connect timeout) тул ~220 процесс тус бүр 4 с
 *    хүлээж, токен унасны дараа токенгүй тандалт ДАХИН 4 с, дээр нь `fetch`-ийн (undici) дуусаагүй холболт процессыг
 *    өөрийн 10 с-ийн connect timeout хүртэл АМЬД барьдаг байв — шалгуур бүр 10–14 с сул зогсож `npm test` ~10–14 мин
 *    (deploy-ийн `timeout-minutes: 30`). Алгасах/унагах дүрэм (⏭ · `SELBE_LIVE_REQUIRED=1` · `::warning::`) ӨӨРЧЛӨГДӨӨГҮЙ.
 * ⚠️ `.env`-ийн дүрэм ба токены уншилт НЭГ газар: эцэг (`test-all`) тандсан хаяг/токен нь хүүхдийн ашиглах хаяг/токентой
 *    ЗААВАЛ ижил байх ёстой (эс бөгөөс «хүрэгдэнэ» гэж дамжуулсан хаяг өөр байж болно).
 */
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const ENV_FILES = ['../.env.development.local', '../.env'];

/**
 * `NEXT_PUBLIC_*`-ийг `.env.development.local` → `.env` дарааллаар `target`-д ачаална — байгаа (хоосон биш) утгыг
 * ДАРАХГҮЙ («эхэнд тавьсан нь ялна», `ts-alias.mjs`-ийн 2026-09-25 ⚠️). `.env` файл байгаа эсэхийг буцаана.
 */
export function loadPublicEnv(target) {
  let envRead = false;
  for (const f of ENV_FILES) {
    try {
      if (f === '../.env') envRead = existsSync(new URL(f, import.meta.url));
      for (const line of readFileSync(new URL(f, import.meta.url), 'utf8').split(/\r?\n/)) {
        const m = /^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
        if (m && !target[m[1]]) target[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
      }
    } catch { /* файл алга — хэвийн */ }
  }
  return envRead;
}

/** `.env.development.local`-ийн түүхий текст (алга бол алдаа шиднэ) */
export const devLocal = () => readFileSync(new URL('../.env.development.local', import.meta.url), 'utf8');

/** `ARCGIS_ADMIN_TOKEN` — env, эс бөгөөс `.env.development.local`. ⚠️ ХЭЗЭЭ Ч логлохгүй. */
export function adminToken() {
  if (process.env.ARCGIS_ADMIN_TOKEN) return process.env.ARCGIS_ADMIN_TOKEN;
  try {
    const m = /^ARCGIS_ADMIN_TOKEN=(.+)$/m.exec(devLocal());
    return m ? m[1].trim() : '';
  } catch { return ''; /* файл алга — хэвийн */ }
}

/** ⚠️ 4 сек-ийн хязгаар — firewall «drop» үед 80 тест × TCP timeout болохоос (2026-09-17). */
export const PROBE_TIMEOUT_MS = 4000;

/** Алдааны товч код — `ECONNREFUSED` · `ENOTFOUND` · `TimeoutError` · `SyntaxError` (JSON биш хариу) */
export const errCode = (e) => e?.code ?? e?.cause?.code ?? e?.name ?? 'сүлжээ';

/**
 * Нэг тандалт: `${ent}/Bagts_ajluud/FeatureServer`-д `f=json` (+ токен) POST БИЕЭР — хариуны JSON-ийг буцаана; сүлжээ ·
 * хугацаа · JSON биш хариу бол алдаа шиднэ.
 * ⚠️ 2026-10-22: `fetch` БИШ `node:http(s)` — `AbortSignal.timeout` нь `fetch`-ийн Promise-ийг л цуцалдаг, холбогдож буй
 *    socket-ийг undici өөрийн 10 с хүртэл барьж процессыг дуусгадаггүй байв. Энд хугацаа дуусахад `destroy()` —
 *    socket шууд хаагдана. Redirect дагахгүй: ArcGIS REST `f=json`-д redirect хийдэггүй; JSON биш хариу нь урьдын
 *    `res.json()`-ийн алдаатай ИЖИЛ (хүрэгдсэнгүй → ⏭).
 * ⚠️ Токен ЗӨВХӨН POST биед — query string-д ХЭЗЭЭ Ч (`ts-alias.mjs`-ийн 2026-09-25 ⚠️).
 */
export function probeOnce(ent, tok, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let done = false;
    let timer = null;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); fn(v); };
    const body = new URLSearchParams({ f: 'json' });
    if (tok) body.set('token', tok);
    const data = body.toString();
    let req;
    try {
      const u = new URL(`${ent}/Bagts_ajluud/FeatureServer`);
      req = (u.protocol === 'http:' ? http : https).request(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('error', (e) => finish(reject, e));
        res.on('end', () => {
          try { finish(resolve, JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { finish(reject, e); }
        });
      });
    } catch (e) { finish(reject, e); return; }
    timer = setTimeout(() => {
      const e = new Error(`Enterprise ${timeoutMs} мс-д хариу өгсөнгүй`);
      e.name = 'TimeoutError';
      finish(reject, e);
      req.destroy(e);
    }, timeoutMs);
    req.on('error', (e) => finish(reject, e));
    req.end(data);
  });
}

/**
 * Амьд шалгуурын ТӨЛӨВ — `{ skip, reason, tokOff }`. `tokOff` = токеныг залгахгүй (хүчингүй / сервер хүрэгдэхгүй).
 * `warn` — хүний унших мөр (токен агуулахгүй). `probe` — тестэд солих боломжтой.
 */
export async function liveStatus({ ent, tok, warn = () => {}, probe = probeOnce }) {
  const st = { skip: false, reason: '', tokOff: false };
  /* эхний (хамгийн тодорхой) шалтгаан үлдэнэ — токентой салаа унасны дараа токенгүй тандалт дахин алгасдаг */
  const skip = (reason) => { st.skip = true; st.reason ||= reason; };
  let netDown = false;
  /* ⚠️ 2026-09-21: ТОКЕН БАЙСАН Ч нэг удаа тандана — API key-ийн хугацаа дуусвал (498 «Invalid
     token») бүх амьд шалгуур «алдаа» гэж унадаг байв; одоо хүчингүй токеныг хаяж ⏭ алгасна
     (сүлжээгүй/499-тэй ижил). Хүчинтэй бол урьдын адил залгана. */
  if (tok) {
    try {
      const j = await probe(ent, tok);
      if (j?.error?.code === 498 || j?.error?.code === 499) {
        warn(`⏭ ARCGIS_ADMIN_TOKEN хүчингүй (${j.error.code}) — амьд шалгуурууд алгасна; түлхүүрээ шинэчилнэ үү`);
        st.tokOff = true; skip(`ARCGIS_ADMIN_TOKEN хүчингүй (${j.error.code})`);
      }
    } catch (e) {
      /* ⚠️ 2026-10-21: Enterprise (`gis.selbecity.mn`) GitHub Actions-ийн серверээс ХҮРЭГДДЭГГҮЙ (connect timeout) —
         урьд нь энд чимээгүй алгасаж токеныг үлдээдэг тул амьд шалгуурууд (series · bagts · negj · gun · zovshoorol)
         сервер рүү 180 с гацаж CI/deploy-ийг унагадаг байв. Хүрэхгүй бол хүчингүй токентой ИЖИЛ: ⏭ алгасна. */
      warn(`⏭ Enterprise хүрэгдсэнгүй (${errCode(e)}) — амьд шалгуурууд алгасна`);
      st.tokOff = true; netDown = true; skip(`Enterprise хүрэгдсэнгүй (${errCode(e)})`);
    }
  }
  /* ⚠️ 2026-10-22 (аудит): `netDown` — токентой тандалт СҮЛЖЭЭГЭЭР унасан бол токенгүй тандалтыг ДАХИН явуулахгүй:
     алгасах нь аль хэдийн шийдэгдсэн, дахин 4 с хүлээх нь дэмий (урьд CI-д шалгуур бүрд +4 с). */
  if ((!tok || st.tokOff) && !netDown) {
    try {
      const j = await probe(ent, '');
      if (j?.error?.code === 499 || j?.error?.code === 498) skip(`үйлчилгээ Organization-only (${j.error.code}), ARCGIS_ADMIN_TOKEN алга`);
    } catch (e) {
      /* ⚠️ 2026-10-21: токенгүй салаа ч сүлжээ унахад АЛГАСНА. GitHub-ийн `ARCGIS_ADMIN_TOKEN` secret хоосон бөгөөд
         runner Enterprise-д хүрдэггүй (connect timeout) — урьд нь энд чимээгүй залгиж амьд шалгуурууд 180 с гацаж
         шилжилтээс хойших БҮХ deploy унасан (production 10-19-ний AGOL хувилбар дээр хоцорсон). */
      warn(`⏭ Enterprise хүрэгдсэнгүй (${errCode(e)}) — амьд шалгуурууд алгасна`);
      skip(`Enterprise хүрэгдсэнгүй (${errCode(e)}), ARCGIS_ADMIN_TOKEN алга`);
    }
  }
  return st;
}

/**
 * `test-all` → хүүхэд процесс: тандалтын үр дүн env-ээр. `ts-alias.mjs` нь `SELBE_LIVE_PROBED=1` харвал ДАХИН
 * ТАНДАХГҮЙ; `SELBE_LIVE_TOKEN_OFF=1` бол токеныг залгахгүй; `SELBE_LIVE_SKIP`/`_REASON` нь урьдын адил hooks-д (⏭).
 * Хэрэглэгчийн өөрөө тавьсан шалтгаан (`SELBE_LIVE_SKIP_REASON`) давамгайлна (`||=`-тэй ижил).
 */
export const liveEnvOf = (st, env = process.env) => ({
  SELBE_LIVE_PROBED: '1',
  ...(st.tokOff ? { SELBE_LIVE_TOKEN_OFF: '1' } : {}),
  ...(st.skip ? { SELBE_LIVE_SKIP: '1', SELBE_LIVE_SKIP_REASON: env.SELBE_LIVE_SKIP_REASON || st.reason } : {}),
});
