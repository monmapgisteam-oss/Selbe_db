/**
 * ГҮЙЦЭТГЭГЧИЙН ҮЛ НИЙЦЛИЙН МЭДЭГДЭЛ (2026-11-21, хэрэглэгчийн хүсэлт).
 *
 * Хэнд: «Хэрэглэгчийн эрх → ХАБЭА — багцаар харах» хүснэгтэд багц оноогдсон аккаунт (`habeaViewScope` нь хоосон
 * биш массив) — ЗӨВХӨН өөрийн багцын НЭЭЛТТЭЙ үл нийцлээр. Хязгааргүй (захиалагч, админ) аккаунтад мэдэгдэл алга.
 * Хэлбэр: «Нээлттэй үл нийцэл — шатлалаар» чарттай ИЖИЛ 4 шат (`habeaStage`) — шат бүрт нэгтгэж, дотор нь жагсаалт.
 * «Шинэ»: үл нийцэл шинээр үүсэх эсвэл ДАРААГИЙН шатанд орох бүрт. Харсан шатыг тухайн хөтөч (`localStorage`)
 * хадгална — сервер шаардлагагүй (хэрэглэгчийн сонголт).
 *
 * Цэвэр функцууд нь Node шалгуурт (`habeaNotify.check.mjs`); `countHabeaNotify` нь цэсний тэмдэгт (`navBadges`).
 */
import { ACTION_DONE, stageOf } from '@/lib/habeaStage';

/** Мэдэгдэлд хэрэгтэй хамгийн бага мөр (`HabeaAction.ActionRow`-ийн хэсэг) */
export type NotifyRow = { oid: number; pkgK: string; status: number | null; d: number | null };
export type NotifyItem<R extends NotifyRow = NotifyRow> = { row: R; stage: number };
/** objectid → ХАРСАН хамгийн өндөр шат (0–3) */
export type NotifySeen = Record<string, number>;

/**
 * Хүрээний НЭЭЛТТЭЙ үл нийцлүүд шаттайгаа — дууссан (`ACTION_DONE`), огноогүй, ирээдүйн огноотой мөр орохгүй
 * (чартын `stageKey`-ийн дүрэм). Эрэмбэ: өндөр шат эхэнд, шат дотроо ХУУЧИН нь эхэнд (хамгийн яаралтай).
 */
export function notifyItems<R extends NotifyRow>(rows: readonly R[], scope: readonly string[] | null, now: number): NotifyItem<R>[] {
  if (!scope?.length) return [];
  const out: NotifyItem<R>[] = [];
  for (const r of rows) {
    if (!scope.includes(r.pkgK) || r.status === ACTION_DONE || r.d == null || r.d > now || !(r.oid > 0)) continue;
    out.push({ row: r, stage: stageOf(r.d, now) });
  }
  return out.sort((a, b) => b.stage - a.stage || (a.row.d ?? 0) - (b.row.d ?? 0));
}

/** Шинэ эсэх — энэ шатанд хараахан хараагүй */
export const isNewItem = (it: NotifyItem, seen: Readonly<NotifySeen>): boolean => (seen[String(it.row.oid)] ?? -1) < it.stage;

/** Харсан болгоно — шат нь ӨСӨХ л чиглэлтэй (хуучин тэмдэг доошлохгүй) */
export function markSeenItems(seen: Readonly<NotifySeen>, items: readonly NotifyItem[]): NotifySeen {
  const out: NotifySeen = { ...seen };
  for (const it of items) {
    const k = String(it.row.oid);
    out[k] = Math.max(out[k] ?? -1, it.stage);
  }
  return out;
}

/** Хадгалалтыг цэвэрлэнэ — нээлттэй хэвээр байгаа мөрийнх л үлдэнэ (дууссаныг мартана) */
export function pruneSeen(seen: Readonly<NotifySeen>, items: readonly NotifyItem[]): NotifySeen {
  const keep = new Set(items.map((it) => String(it.row.oid)));
  return Object.fromEntries(Object.entries(seen).filter(([k]) => keep.has(k)));
}

/* ── Хадгалалт (хөтөч бүрт) ── */

const seenKey = (user: string) => `selbe.habea.notify.v1.${user.trim().toLowerCase()}`;
const popupKey = (user: string) => `selbe.habea.notify.popup.v1.${user.trim().toLowerCase()}`;
/** Цэсний тэмдгийг ДАРУЙ дахин тоолох дохио (`navBadges.subscribeNavBadges`) */
export const BADGE_REFRESH_EVENT = 'selbe:nav-badges';

export function readSeen(user: string | null | undefined): NotifySeen {
  if (!user) return {};
  try {
    const v = JSON.parse(localStorage.getItem(seenKey(user)) ?? '{}') as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v as Record<string, unknown>)
      .filter((e): e is [string, number] => Number.isInteger(e[1]) && (e[1] as number) >= 0 && (e[1] as number) <= 3));
  } catch { return {}; }
}

export function writeSeen(user: string | null | undefined, seen: Readonly<NotifySeen>): void {
  if (!user) return;
  try { localStorage.setItem(seenKey(user), JSON.stringify(seen)); } catch { /* хаалттай орчин — санахгүй */ }
  try { window.dispatchEvent(new Event(BADGE_REFRESH_EVENT)); } catch { /* сервер тал */ }
}

/** Нэвтрэх үеийн цонх энэ сешнд гарсан эсэх — хөтчийн таб/цонх хаагдтал (`sessionStorage`) */
export function popupShown(user: string | null | undefined): boolean {
  if (!user) return true;
  try { return sessionStorage.getItem(popupKey(user)) === '1'; } catch { return false; }
}
export function setPopupShown(user: string | null | undefined): void {
  if (!user) return;
  try { sessionStorage.setItem(popupKey(user), '1'); } catch { /* хаалттай орчин */ }
}

/**
 * ЦЭСНИЙ ТЭМДЭГ — «ХАБЭА» цэсэнд шинэ мэдэгдлийн тоо (`navBadges.SOURCES`). Хүрээгүй аккаунтад 0 (тэмдэггүй);
 * эрхийн хүснэгт уншигдаагүй (`[]`) бол 0 — дараагийн тоололтод дахин.
 */
export async function countHabeaNotify(username: string | null): Promise<number | null> {
  const me = (username ?? '').trim().toLowerCase();
  if (!me) return 0;
  const { habeaViewScope } = await import('@/modules/habeaScope');
  const scope = habeaViewScope(me);
  if (!scope?.length) return 0;
  /* Багц оноогдсон аккаунтад л — бусдад үл нийцлийн модуль ч ачаалагдахгүй */
  const { loadActions } = await import('@/modules/HabeaAction');
  const items = notifyItems(await loadActions(), scope, Date.now());
  const seen = readSeen(me);
  return items.filter((it) => isNewItem(it, seen)).length;
}
