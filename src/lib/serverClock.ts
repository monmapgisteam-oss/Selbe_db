/**
 * СЕРВЕРИЙН ЦАГ — ArcGIS-ийн цагийг нэг удаа хэмжиж, хөтчийн цагтай зөрүүг (`clockOff`) хадгална.
 *
 * ⚠️ 2026-10-12 (дарааллын аудит): ЯАГААД. Хяналтын шатны огноо (`SF[шат].sent/returned`), шийдвэрийн лог
 *    (`at`), илгээлтийн `approvedAt`, «архивлаж байна» тэмдгийн `startedAt`, компанийн илгээсэн огноо —
 *    бүгд БИЧСЭН хөтчийн `Date.now()`-оор, харин тэдгээрийг ЖИШИХ (`markFresh`, `subAt ≤ okWrittenAt`,
 *    `residual.at ≥ unclosed.at`, түгжээний TTL) нь ӨӨР хөтчийн цагаар явдаг байв. Хоёр компьютерын цаг
 *    хэдэн минут зөрвөл (2026-10-12-нд энэ машин AGOL-оос ~100 с түрүүлж байв) амьд тэмдэг «хуучирсан»,
 *    хуучирсан нь «амьд» гэж уншигдана. Нэг эх сурвалж — серверийн цаг.
 * ⚠️ `huvaariBatlah.ts`-д ижил логиктой `serverNow`/`syncServerClock` (2026-10-12-ны өглөө) БАЙГАА — тэр файлд
 *    өөр агент зэрэг ажиллаж байгаа тул ХӨНДӨӨГҮЙ; дараа нь энэ модульд нэгтгэнэ (`huvaariBatlah` өөрийн
 *    хувилбарыг устгаж эндээс импортлоно). Томьёо (`clockOffsetOf`) ба дүрэм нь ТЭНДЭЭС хуулсан:
 *      · Editor Tracking (`EditDate`) — хүснэгтийг код өөрөө үүсгэдэг, засварын бүртгэл асаагүй → хэрэглэхгүй;
 *      · Хариуны `Date` толгой — AGOL `Access-Control-Expose-Headers`-т оруулдаггүй → хөтчийн JS уншиж чадахгүй;
 *      · ҮЛДСЭН нь `outStatistics` max(`CURRENT_TIMESTAMP`) — hosted давхаргад ажилладаг (2026-10-12-нд амьд шалгав).
 *        AGOL query-н хариуг КЭШЛЭДЭГ тул `where`-д санамсаргүй тоо (`OBJECTID > -N`) нэмнэ.
 * ⚠️ ЗӨРҮҮ = сервер − хүсэлтийн хоёр үзүүрийн дундаж (RTT/2-ын нарийвчлал — минутын TTL-д хангалттай).
 *    10 минут тутам шинэчилнэ; унавал сүүлийн мэдэгдсэн (эхэндээ 0 = хуучин зан, `Date.now()`) хэвээр,
 *    60 с-ийн дараа дахин оролдоно. 10 с-ээс урт хүсэлтийг хэмжилтэд авахгүй.
 * ⚠️ NODE (тест, `tools/`): `syncServerClock` хэзээ ч дуудагдахгүй эсвэл сүлжээгүй унана → `clockOff` 0 →
 *    `serverNow()` = `Date.now()`. Импорт нь ЦЭВЭР (сүлжээний модулиуд `import()`-оор дотор нь) тул Node-д
 *    ачаалахад гаж нөлөөгүй.
 * ⚠️ Хүснэгт ХООСОН бол max нь `null` — зөрүү шинэчлэгдэхгүй (хуучин утга хэвээр).
 */

let clockOff = 0;
let clockAt = 0;
let clockTryAt = 0;
let clockFlight: Promise<void> | null = null;
const CLOCK_TTL = 10 * 60_000;
const CLOCK_RETRY = 60_000;

/** Серверийн одоогийн агшин (ms) — сүүлийн хэмжсэн зөрүүгээр; синк хийгдээгүй бол `Date.now()` */
export function serverNow(): number {
  return Date.now() + clockOff;
}

/** Сүүлийн хэмжсэн зөрүү (ms, сервер − хөтөч) — оношилгоо/тест */
export function serverClockOffset(): number {
  return clockOff;
}

/** Зөрүүг бодох цэвэр томьёо — `srv` (серверийн агшин), `t0`/`t1` (хүсэлтийн өмнө/дараах хөтчийн цаг) */
export function clockOffsetOf(srv: number, t0: number, t1: number): number {
  return Math.round(srv - (t0 + t1) / 2);
}

/**
 * Серверийн цагийн зөрүүг шинэчилнэ (кэштэй, явагдаж буйг хуваалцана) — алдааг залгина.
 * @param url хэмжих hosted хүснэгтийн REST хаяг; өгөөгүй бол хяналтын хүснэгт (`hyanalt.HYANALT.url`).
 * ⚠️ `arcgisPost` ба `HYANALT` динамик импорт — энэ модуль нь `submission.ts` · `hyanaltSubmit.ts` ·
 *    `hyanaltStore.ts` гурваас уншигддаг тул модулийн тойрог үүсгэхгүй, Node-д ч ачаалагдана.
 */
export async function syncServerClock(url?: string): Promise<void> {
  const t = Date.now();
  if (clockAt && t - clockAt < CLOCK_TTL) return;
  if (clockFlight) return clockFlight;
  if (clockTryAt && t - clockTryAt < CLOCK_RETRY) return;
  clockTryAt = t;
  clockFlight = (async () => {
    try {
      const base = url ?? (await import('./hyanalt')).HYANALT.url;
      if (!base) return;
      const { arcgisPost } = await import('./query');
      const t0 = Date.now();
      const j = await arcgisPost<{ features?: { attributes?: Record<string, unknown> }[] }>(`${base}/query`, {
        where: `OBJECTID > -${1 + Math.floor(Math.random() * 1e9)}`,
        outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: 'CURRENT_TIMESTAMP', outStatisticFieldName: 'srv_now' }]),
        returnGeometry: 'false',
      });
      const t1 = Date.now();
      const a = j.features?.[0]?.attributes ?? {};
      const k = Object.keys(a).find((x) => x.toLowerCase() === 'srv_now');
      const v = k ? Number(a[k]) : Number.NaN;
      if (!Number.isFinite(v) || v <= 0 || t1 - t0 > 10_000) return;
      clockOff = clockOffsetOf(v, t0, t1);
      clockAt = t1;
    } catch { /* сүүлийн мэдэгдсэн зөрүү хэвээр — CLOCK_RETRY-ийн дараа дахин */ } finally {
      clockFlight = null;
    }
  })();
  return clockFlight;
}
