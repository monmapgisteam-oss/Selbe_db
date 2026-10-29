/**
 * KPI-ИЙН ГЭРЛЭН ДОХИО — түвшин, босго, тэдгээрийн ГАНЦ эх сурвалж.
 */

import { t as tr } from './i18nCore';

/**
 * ЗУРГААН төлөв, гэхдээ ГУРВАН өнгө.
 */
export type Level = 'good' | 'warn' | 'bad' | 'neutral' | 'unknown' | 'loading';

export const LEVEL_TONE: Record<Level, string> = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  neutral: 'var(--ink-3)',
  unknown: 'var(--ink-3)',
  loading: 'var(--ink-4, var(--ink-3))',
};

/**
 * ӨНГӨНИЙ ХАЖУУГИЙН ТЭМДЭГ — WCAG 1.4.1.
 */
export const LEVEL_MARK: Record<Level, string> = {
  good: '✓',
  warn: '▲',
  bad: '!',
  neutral: '·',
  unknown: '?',
  loading: '⋯',
};

/** Дэлгэцэд гарах богино шошго — тэмдэгтэй хамт */
export const levelLabel = (l: Level): string => ({
  good: tr('Хэвийн'),
  warn: tr('Анхаарах'),
  bad: tr('Яаралтай'),
  neutral: tr('Хэмжээ'),
  unknown: tr('Өгөгдөл алга'),
  loading: tr('Ачаалж байна'),
}[l]);

/**
 * Ангиллын толгойн ЗУРВАСЫН өнгө — доторх ХАМГИЙН МУУ түвшин.
 */
export function worstOf(levels: readonly Level[]): Level {
  if (levels.includes('bad')) return 'bad';
  if (levels.includes('warn')) return 'warn';
  if (levels.includes('good')) return 'good';
  return 'neutral';
}

/* ══════════════ БОСГО ══════════════ */

/**
 * ХУВИЙН БОСГО — «их нь сайн» үзүүлэлтэд (хамрах хүрээ, газар чөлөөлөлт).
 */
export const PCT_GOOD = 95;
export const PCT_WARN = 80;

/** Хувь өсөх тусам сайн — 95%+ ногоон, 80–95 шар, 80-аас доош улаан */
export const pctLevel = (v: number | null | undefined): Level =>
  v == null ? 'unknown' : v >= PCT_GOOD ? 'good' : v >= PCT_WARN ? 'warn' : 'bad';



/**
 * ХАБЭА ОСОЛ — тоогоор.
 */
export const INCIDENT_WARN_MAX = 5;
export const incidentLevel = (n: number | null): Level =>
  n == null ? 'unknown' : n === 0 ? 'good' : n <= INCIDENT_WARN_MAX ? 'warn' : 'bad';

/**
 * ХОТ ТӨЛӨВЛӨЛТИЙН ОНОО — `ExecKpi.urban`-ийн одоогийн 65/45 босго.
 */
export const SCORE_GOOD = 65;
export const SCORE_WARN = 45;
export const scoreLevel = (v: number | null): Level =>
  v == null ? 'unknown' : v >= SCORE_GOOD ? 'good' : v >= SCORE_WARN ? 'warn' : 'bad';

/**
 * ДАВХЦСАН НЭГЖ ТАЛБАР — ХОЁРХОН төлөв, дунд түвшин БАЙХГҮЙ.
 */
export const overlapLevel = (n: number | null): Level =>
  n == null ? 'unknown' : n === 0 ? 'good' : 'bad';

/**
 * ГҮЙЦЭТГЭЛИЙН ХЯНАЛТАД ХҮЛЭЭГДЭХ ХУГАЦАА, хоног.
 */
export const REVIEW_STALE_DAYS = 7;
export const reviewAgeLevel = (days: number | null): Level =>
  days == null ? 'unknown' : days > REVIEW_STALE_DAYS ? 'bad' : 'good';

/**
 * ОБЬЁМЫН ЗӨРҮҮ ба ХАБЭА ХОХИРОЛ — босго нь `execTriage.ts`-д амьдарна.
 */
export { VAR_BAD_MNT, DMG_BAD_N } from './execTriage';
