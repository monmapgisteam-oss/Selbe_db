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

/** Зөрүүг бодох цэвэр томьёо — `srv` (серверийн агшин), `t0`/`t1` (хүсэлтийн өмнө/дараах хөтчийн цаг) */
export function clockOffsetOf(srv: number, t0: number, t1: number): number {
  return Math.round(srv - (t0 + t1) / 2);
}

/**
 * ⚠️ 2026-10-21 (аудит №2): ХҮЛЭЭН АВАХ ЗӨРҮҮНИЙ ДЭЭД ХЯЗГААР — 15 мин. Урьд нь ямар ч зөрүүг хязгаарлалтгүй
 *    авдаг байв. Үүнээс их зөрүү нь бодит цагийн зөрүүгээс илүү ХЭМЖИЛТИЙН АЛДАА (цагийн бүсгүй тайлал — яг N цаг,
 *    кэшлэгдсэн хариу, хоёртын хайлтын гажуудал) байх магадлалтай бөгөөд тийм утгаар бүх түгжээ · тэмдэг · батлалтын
 *    огноо нэг дор буруу бичигдэнэ. Хүлээн авахгүй, `console.warn`-оор ил хэлнэ (чимээгүй биш); сүүлийн мэдэгдсэн
 *    зөрүү хэвээр, дараагийн хэмжилт `CLOCK_TTL`-ийн дараа (`clockAt` тавигдана — минут тутам ~17 хүсэлтээр
 *    давтахгүй). `huvaariBatlah.syncServerClock` ч ЭНЭ дүрмээр.
 */
export const MAX_CLOCK_OFF = 15 * 60_000;
/** Хэмжсэн зөрүү хүлээн авахуйц уу — `|off| ≤ MAX_CLOCK_OFF` (цэвэр; тест) */
export function clockOffsetOk(off: number): boolean {
  return Number.isFinite(off) && Math.abs(off) <= MAX_CLOCK_OFF;
}
/** Хүлээн аваагүй зөрүүг ил хэлнэ — хоёр `syncServerClock` нэг мессеж */
export function warnClockOff(off: number): void {
  console.warn(`serverClock: серверийн цагийн зөрүү ${Math.round(off / 1000)} с — ${MAX_CLOCK_OFF / 60_000} мин-ээс их тул хүлээн авсангүй (хэмжилтийн алдаа байж болзошгүй)`);
}

/** UTC агшныг ArcGIS-ийн `timestamp 'YYYY-MM-DD HH:MM:SS'` хэлбэрээр */
const tsLiteral = (ms: number): string => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

/**
 * СЕРВЕРИЙН АГШИН ХЭМЖИХ — `{ srv, t0, t1 }` эсвэл `null`. `syncServerClock` (энд) ба `huvaariBatlah` хоёулаа хэрэглэнэ.
 * ⚠️ 2026-10-21 (аудит): Enterprise (PostgreSQL) `outStatistics`-д `CURRENT_TIMESTAMP`-ийг хүлээн авдаггүй (500) —
 *    урьд нь алдааг залгиж `clockOff` үргэлж 0 болж, цаг зөрөхөөс хамгаалах механизм чимээгүй унтарсан байв.
 *    Харин `where`-д `CURRENT_TIMESTAMP > timestamp '…'` ажилладаг тул ХОЁРТЫН ХАЙЛТ: ±12 цагийн мужийг
 *    `returnCountOnly`-оор 1 с хүртэл нарийсгана (~17 хүсэлт, ~0.2 с; 10 минут тутам нэг удаа). Хүснэгт хоосон
 *    бол (count үргэлж 0) хэмжихгүй. AGOL-д `outStatistics` зам хэвээр эхэлж оролдоно; Enterprise хаягт
 *    (`isEntDataUrl`) оролдохгүй — доорх ⚠️ 2026-10-21 (аудит №2).
 */
export async function measureServerTime(
  base: string,
  oidField: string,
): Promise<{ srv: number; t0: number; t1: number } | null> {
  const { arcgisPost } = await import('./query');
  const { isEntDataUrl, remapUrl } = await import('./services/entMap');
  const salt = () => `${oidField} > -${1 + Math.floor(Math.random() * 1e9)}`;
  /* ⚠️ 2026-10-21 (аудит №2): Enterprise хаягт (зураглалын ДАРААХ хаягаар — `base` нь AGOL түлхүүр байж болно)
     `outStatistics` max(CURRENT_TIMESTAMP) замыг ОРОЛДОХГҮЙ — тэнд ҮРГЭЛЖ 500 тул хэмжилт бүрд нэг дэмий алдааны
     хүсэлт серверийн логт бичигдэж, хоёртын хайлт нэг RTT хожимддог байв. AGOL/бусад хаягт нэг хүсэлтийн зам хэвээр. */
  const ent = isEntDataUrl(remapUrl(base));
  if (!ent) {
    try {
      const t0 = Date.now();
      const j = await arcgisPost<{ features?: { attributes?: Record<string, unknown> }[] }>(`${base}/query`, {
        where: salt(),
        outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: 'CURRENT_TIMESTAMP', outStatisticFieldName: 'srv_now' }]),
        returnGeometry: 'false',
      });
      const t1 = Date.now();
      const a = j.features?.[0]?.attributes ?? {};
      const k = Object.keys(a).find((x) => x.toLowerCase() === 'srv_now');
      const v = k ? Number(a[k]) : Number.NaN;
      if (Number.isFinite(v) && v > 0 && t1 - t0 <= 10_000) return { srv: v, t0, t1 };
    } catch { /* доорх хоёртын хайлт */ }
  }
  /* ⚠️ 2026-10-21 (аудит): СҮҮЛИЙН ХҮСЭЛТИЙН хоёр үзүүр (`pt0`/`pt1`). Хайлтын явцад серверийн цаг урагшилдаг тул
     эцсийн муж нь СҮҮЛИЙН шалгалтуудын үеийн (≈t1) серверийн цаг — урьд нь бүх хайлтын (t0+t1)/2-той хослуулдаг
     тул зөрүү (t1−t0)/2-оор хазайдаг байв. Одоо `clockOffsetOf`-д сүүлийн хүсэлтийн өмнө/дараах цагийг өгнө. */
  let pt0 = 0;
  let pt1 = 0;
  const count = async (ms: number): Promise<number> => {
    pt0 = Date.now();
    const j = await arcgisPost<{ count?: number }>(`${base}/query`, {
      where: `(${salt()}) AND CURRENT_TIMESTAMP > timestamp '${tsLiteral(ms)}'`,
      returnCountOnly: 'true',
    });
    pt1 = Date.now();
    return Number(j.count ?? 0);
  };
  try {
    const t0 = Date.now();
    let lo = t0 - 12 * 3600_000;
    let hi = t0 + 12 * 3600_000;
    if ((await count(lo)) === 0) return null; // хоосон хүснэгт эсвэл зөрүү 12 цагаас их
    while (hi - lo > 1000) {
      const mid = Math.floor((lo + hi) / 2);
      if ((await count(mid)) > 0) lo = mid; else hi = mid;
    }
    const t1 = Date.now();
    if (t1 - t0 > 10_000) return null;
    return { srv: Math.round((lo + hi) / 2), t0: pt0, t1: pt1 };
  } catch {
    return null;
  }
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
      const m = await measureServerTime(base, 'OBJECTID');
      if (!m) return;
      const off = clockOffsetOf(m.srv, m.t0, m.t1);
      /* ⚠️ 2026-10-21 (аудит №2): `MAX_CLOCK_OFF`-оос их зөрүүг хүлээн авахгүй (дээрх ⚠️) */
      if (!clockOffsetOk(off)) { warnClockOff(off); clockAt = m.t1; return; }
      clockOff = off;
      clockAt = m.t1;
    } catch { /* сүүлийн мэдэгдсэн зөрүү хэвээр — CLOCK_RETRY-ийн дараа дахин */ } finally {
      clockFlight = null;
    }
  })();
  return clockFlight;
}
