/**
 * ҮЛ НИЙЦЛИЙН ШАТЛАЛ — `HSE_Action` (2026-11-03, хэрэглэгчийн дүрэм). Арилгаагүй үл нийцэл үзлэгийн огноо
 * (`insp_datetime`)-оос хойш: 1-р долоо хоног системд үүснэ · 2-рт талбайн зааварчилгаа · 3-рт сануулах хуудас ·
 * 4-рээс хариуцлага тооцно.
 *
 * 2026-11-21: `HabeaAction.tsx`-аас энд — «Нээлттэй үл нийцэл — шатлалаар» чарт ба гүйцэтгэгчийн МЭДЭГДЭЛ
 * (`habeaNotify.ts`) ЯГ нэг дүрмээр тоолно; JSX-гүй тул Node шалгуурт шууд ачаалагдана.
 */
import { t as tr } from '@/lib/i18nCore';

/** «Захиалагчийн шийдвэр» — Дууссан (`actionStatus`-ийн код) */
export const ACTION_DONE = 3;
/** «Гүйцэтгэгчийн үйл явц» — Шалгуулах: гүйцэтгэгч арилгасан, захиалагчийн хяналтыг хүлээж буй (2026-11-27) */
export const ACTION_REVIEW = 4;

/**
 * Шатлалд (гүйцэтгэгчийн хариуцлагын хугацаанд) орох төлөв (2026-11-27): төлөв мэдэгдэх, дуусаагүй, «Шалгуулах» биш.
 * «Шалгуулах» — захиалагчийн хяналт хүлээж буй (гүйцэтгэгчийн эсрэг ахихгүй); төлөвгүй мөр тусдаа тоологдоно.
 */
export const contractorOwes = (status: number | null): boolean =>
  status != null && status !== ACTION_DONE && status !== ACTION_REVIEW;

const DAY = 86_400_000;
/** Улаанбаатарын тогтмол зөрүү (2017 оноос зуны цаггүй) */
const UB_OFFSET = 8 * 3_600_000;
/** Улаанбаатарын хуанлийн өдрийн дугаар */
const ubDay = (t: number): number => Math.floor((t + UB_OFFSET) / DAY);
/** Улаанбаатарын хуанлийн өдрөөр өнгөрсөн хоног (2026-11-27 — 24 цагийн тоогоор биш) */
export const ubDaysSince = (d: number, now: number): number => ubDay(now) - ubDay(d);
/** Сүүлийн `days` хуанлийн өдрийн (өнөөдрийг оруулаад) эхлэл — Улаанбаатарын 00:00 */
export const ubWindowStart = (now: number, days: number): number => (ubDay(now) - (days - 1)) * DAY - UB_OFFSET;
/** «Сүүлийн сар» — хуудас ба тайлангийн НЭГ цонх (Улаанбаатарын 30 хуанлийн өдөр) */
export const ACTION_WINDOW_DAYS = 30;

export const ESCALATION = [
  { key: 'w1', label: () => tr('1-р долоо хоног — системд үүссэн'), hint: () => tr('0–6 хоног'), color: '#3b82f6' },
  { key: 'w2', label: () => tr('2-р долоо хоног — талбайн зааварчилгаа'), hint: () => tr('7–13 хоног'), color: '#f59e0b' },
  { key: 'w3', label: () => tr('3-р долоо хоног — сануулах хуудас'), hint: () => tr('14–20 хоног'), color: '#f97316' },
  { key: 'w4', label: () => tr('4-р долоо хоног — хариуцлага тооцох'), hint: () => tr('21+ хоног'), color: '#dc2626' },
] as const;

/** Үзлэгийн огнооноос өнгөрсөн Улаанбаатарын хуанлийн өдрөөр шатны индекс (0–3) */
export const stageOf = (d: number, now: number): number => Math.min(3, Math.max(0, Math.floor(ubDaysSince(d, now) / 7)));
