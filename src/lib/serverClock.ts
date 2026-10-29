/**
 * СЕРВЕРИЙН ЦАГ — ArcGIS-ийн цагийг нэг удаа хэмжиж, хөтчийн цагтай зөрүүг (`clockOff`) хадгална.
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

export const MAX_CLOCK_OFF = 15 * 60_000;
/** Хэмжсэн зөрүү хүлээн авахуйц уу — `|off| ≤ MAX_CLOCK_OFF` (цэвэр; тест) */
export function clockOffsetOk(off: number): boolean {
  return Number.isFinite(off) && Math.abs(off) <= MAX_CLOCK_OFF;
}
export const MAX_CONFIRM_RTT = 2_000;
export const MAX_CONFIRM_DIFF = 5_000;
export function largeOffsetConfirmed(off1: number, rtt1: number, off2: number, rtt2: number): boolean {
  const ok = (o: number, r: number) => Number.isFinite(o) && Math.abs(o) <= 12 * 3600_000 && Number.isFinite(r) && r >= 0 && r <= MAX_CONFIRM_RTT;
  return ok(off1, rtt1) && ok(off2, rtt2) && Math.abs(off1 - off2) <= MAX_CONFIRM_DIFF;
}
/** Хүлээн аваагүй зөрүүг ил хэлнэ — хоёр `syncServerClock` нэг мессеж */
export function warnClockOff(off: number): void {
  console.warn(`serverClock: серверийн цагийн зөрүү ${Math.round(off / 1000)} с — ${MAX_CLOCK_OFF / 60_000} мин-ээс их тул хүлээн авсангүй (хэмжилтийн алдаа байж болзошгүй)`);
}

/** UTC агшныг ArcGIS-ийн `timestamp 'YYYY-MM-DD HH:MM:SS'` хэлбэрээр */
const tsLiteral = (ms: number): string => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

/**
 * СЕРВЕРИЙН АГШИН ХЭМЖИХ — `{ srv, t0, t1 }` эсвэл `null`. `syncServerClock` (энд) ба `huvaariBatlah` хоёулаа хэрэглэнэ.
 */
export async function measureServerTime(
  base: string,
  oidField: string,
): Promise<{ srv: number; t0: number; t1: number } | null> {
  const { arcgisPost } = await import('./query');
  const { ENT_HOSTED } = await import('./services/env');
  const salt = () => `${oidField} > -${1 + Math.floor(Math.random() * 1e9)}`;
  const ent = base.startsWith(`${ENT_HOSTED}/`);
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
 * @param oidField `url` хүснэгтийн OID талбар (`huvaariBatlah.F.oid`) — анхдагч `objectid` (2026-10-26: Enterprise жижиг үсэг).
 */
export async function syncServerClock(url?: string, oidField = 'objectid'): Promise<void> {
  const t = Date.now();
  if (clockAt && t - clockAt < CLOCK_TTL) return;
  if (clockFlight) return clockFlight;
  if (clockTryAt && t - clockTryAt < CLOCK_RETRY) return;
  clockTryAt = t;
  clockFlight = (async () => {
    try {
      const base = url ?? (await import('./hyanalt')).HYANALT.url;
      if (!base) return;
      const m = await measureServerTime(base, oidField);
      if (!m) return;
      let off = clockOffsetOf(m.srv, m.t0, m.t1);
      if (!clockOffsetOk(off)) {
        const m2 = await measureServerTime(base, oidField);
        const off2 = m2 ? clockOffsetOf(m2.srv, m2.t0, m2.t1) : Number.NaN;
        if (!m2 || !largeOffsetConfirmed(off, m.t1 - m.t0, off2, m2.t1 - m2.t0)) { warnClockOff(off); clockAt = m.t1; return; }
        console.warn(`serverClock: таны компьютерийн цаг серверээс ${Math.round(off2 / 60_000)} мин зөрүүтэй — серверийн цагаар бичнэ. Цагаа засна уу.`);
        off = Math.round((off + off2) / 2);
      }
      clockOff = off;
      clockAt = m.t1;
    } catch { /* сүүлийн мэдэгдсэн зөрүү хэвээр — CLOCK_RETRY-ийн дараа дахин */ } finally {
      clockFlight = null;
    }
  })();
  return clockFlight;
}
