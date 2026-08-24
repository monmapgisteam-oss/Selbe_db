/**
 * KPI-ИЙН ГЭРЛЭН ДОХИО — түвшин, босго, тэдгээрийн ГАНЦ эх сурвалж.
 *
 * ⚠️ Босгыг картын дотор ТАРААХГҮЙ. Удирдлагын самбарын тоо бүрийн ард
 * «яагаад улаан болов» гэсэн асуулт зогсдог — хариулт нь ЭНД, нэг дор байна.
 * Тогтмол бүрд «энэ тоо хаанаас гарсан» гэсэн мөр заавал дагалдана.
 *
 * ⚠️ Аль хэдийн байгаа тогтмолуудыг ДАХИН тодорхойлохгүй: `VAR_BAD_MNT`,
 * `DMG_BAD_N` (`execTriage.ts`) ба `lagLevel` (`Finance.tsx`) нь өөрсдийн
 * модульдаа үлдэнэ — эндээс зөвхөн дахин экспортлоно. Хоёр газар бичвэл нэгийг
 * нь засахад нөгөө нь чимээгүй хоцорно.
 */

import { t as tr } from './i18nCore';

/**
 * ТАВАН төлөв, гэхдээ ГУРВАН өнгө.
 *
 * ⚠️ `neutral` ба `unknown` хоёр нь ӨӨР утгатай бөгөөд хоёулаа саарал:
 *   · `neutral` — хэмжээний үзүүлэлт («158 га»). Дүгнэх боломжгүй, дүгнэх ч
 *     шаардлагагүй. Өгөгдөл нь БҮРЭН.
 *   · `unknown` — өгөгдөл ИРЭЭГҮЙ. «Сайн» ч биш, «муу» ч биш, зүгээр л мэдэхгүй.
 * Хоёрыг нэгтгэвэл «татагдсангүй» гэдэг нь «дүгнэх шаардлагагүй» мэт харагдана.
 */
export type Level = 'good' | 'warn' | 'bad' | 'neutral' | 'unknown';

/** Гэрлэн дохионд тооцогдох гурав — ангиллын толгойн тоолуур зөвхөн эднийг тоолно */
export const SIGNAL_LEVELS: readonly Level[] = ['bad', 'warn', 'good'] as const;

/**
 * ⚠️ Hex ШУУД бичихгүй — CSS хувьсагч. Тогтмол hex нь гэрэл/харанхуй горимд
 * дагадаггүй тул нэг горимд уншигдахаа болино.
 */
export const LEVEL_TONE: Record<Level, string> = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  neutral: 'var(--ink-3)',
  unknown: 'var(--ink-3)',
};

/**
 * ӨНГӨНИЙ ХАЖУУГИЙН ТЭМДЭГ — WCAG 1.4.1.
 *
 * ⚠️ Өнгө ГАНЦААРАА утга дамжуулж болохгүй. Улаан/ногоон ялгахгүй хэрэглэгч
 * (эрэгтэйчүүдийн ~8%) самбарыг УНШИЖ чадах ёстой. Тэмдэг нь дэлгэцэн дээр
 * бодитоор гарна — `aria-hidden` БИШ.
 */
export const LEVEL_MARK: Record<Level, string> = {
  good: '✓',
  warn: '▲',
  bad: '!',
  neutral: '·',
  unknown: '?',
};

/** Дэлгэцэд гарах богино шошго — тэмдэгтэй хамт */
export const levelLabel = (l: Level): string => ({
  good: tr('Хэвийн'),
  warn: tr('Анхаарах'),
  bad: tr('Яаралтай'),
  neutral: tr('Хэмжээ'),
  unknown: tr('Өгөгдөл алга'),
}[l]);

/**
 * Ангиллын толгойн ЗУРВАСЫН өнгө — доторх ХАМГИЙН МУУ түвшин.
 *
 * ⚠️ `neutral`/`unknown` нь «муу» БИШ тул эрэмбэд ОРОХГҮЙ: бүхэлдээ саарал
 * ангилал (Хамрах хүрээ) улаан ч биш, ногоон ч биш — саарал хэвээр үлдэнэ.
 */
export function worstOf(levels: readonly Level[]): Level {
  if (levels.includes('bad')) return 'bad';
  if (levels.includes('warn')) return 'warn';
  if (levels.includes('good')) return 'good';
  return 'neutral';
}

/**
 * Ангиллын дотор эрэмбэ: улаан → шар → ногоон → хэмжээ → өгөгдөлгүй.
 * CEO эхлээд улааныг харах ёстой.
 */
const ORDER: Record<Level, number> = { bad: 0, warn: 1, good: 2, neutral: 3, unknown: 4 };
export const levelRank = (l: Level): number => ORDER[l];

/* ══════════════ БОСГО ══════════════ */

/**
 * ХУВИЙН БОСГО — «их нь сайн» үзүүлэлтэд (хамрах хүрээ, газар чөлөөлөлт).
 * ⚠️ 95/80 нь `ExecKpi`-ийн газар чөлөөлөлтийн картад 2026-08-18-наас хэрэглэгдэж
 *    ирсэн босго — шинээр зохиосонгүй, нэгтгэв.
 */
export const PCT_GOOD = 95;
export const PCT_WARN = 80;

/** Хувь өсөх тусам сайн — 95%+ ногоон, 80–95 шар, 80-аас доош улаан */
export const pctLevel = (v: number | null | undefined): Level =>
  v == null ? 'unknown' : v >= PCT_GOOD ? 'good' : v >= PCT_WARN ? 'warn' : 'bad';

/**
 * САНХҮҮЖИЛТ vs БИЕТ ЗӨРҮҮ, пункт.
 * ⚠️ 5/15 нь `ExecKpi.finance` картын одоогийн босго — хэвээр.
 */
export const FIN_GAP_WARN = 5;
export const FIN_GAP_BAD = 15;
export const finGapLevel = (gap: number | null): Level =>
  gap == null ? 'unknown'
    : Math.abs(gap) <= FIN_GAP_WARN ? 'good'
      : Math.abs(gap) <= FIN_GAP_BAD ? 'warn' : 'bad';

/**
 * ГЭРЭЭЛЭЛТ vs БИЕТ, пункт (⭐ шинэ, CEO_KPI_PROMPT §5).
 * ⚠️ Гэрээлсэн хувь биетээс ДООГУУР байх нь «гэрээгүй ажил хийгдэж байна»
 *    гэсэн эрсдэл. 0-ээс дээш бол хэвийн; −10-аас доош бол яаралтай.
 */
export const CONTRACT_GAP_BAD = -10;
export const contractGapLevel = (gap: number | null): Level =>
  gap == null ? 'unknown' : gap >= 0 ? 'good' : gap > CONTRACT_GAP_BAD ? 'warn' : 'bad';

/**
 * ТАЙЛАН ИРЭЭГҮЙ БЛОК (⭐ шинэ) — блокийн эзлэх ХУВИАР.
 * ⚠️ Абсолют тоогоор биш: 5 блок нь 20 блоктой багцад ноцтой, 200 блоктой
 *    төсөлд ердийн. 10% нь «арав тутмын нэг тайлагнаагүй» гэсэн уншилт.
 */
export const MISSING_WARN_SHARE = 0.10;
export const missingLevel = (missing: number, total: number): Level =>
  total <= 0 ? 'unknown'
    : missing === 0 ? 'good'
      : missing / total <= MISSING_WARN_SHARE ? 'warn' : 'bad';

/**
 * УНШИГДААГҮЙ БАГЦ (⭐ шинэ) — системийн эрүүл мэнд.
 * ⚠️ Энэ нь төслийн БИШ, ПОРТАЛЫН асуудал: 2+ багц уншигдахгүй бол доорх
 *    бүх тоо дутуу суурин дээр бодогдож байна гэсэн үг.
 */
export const FAILED_PKG_BAD = 2;
export const failedPkgLevel = (n: number | null): Level =>
  n == null ? 'unknown' : n === 0 ? 'good' : n < FAILED_PKG_BAD ? 'warn' : 'bad';

/**
 * ХАБЭА ОСОЛ — тоогоор.
 * ⚠️ 5 нь `ExecKpi.safety` картын одоогийн босго — хэвээр.
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
 *
 * ⚠️ 2026-08-21-ний шийдвэрийг 2026-08-24-нд хэрэглэгч ДАХИН БАТАЛСАН
 * (CEO_KPI_PROMPT §7-В): давхцсан газарт тухайн багц ажил ЭХЛЭХ БОЛОМЖГҮЙ тул
 * «бага зэрэг саадтай» гэсэн дундын түвшин утгагүй. 1 талбар ч гэсэн улаан.
 */
export const overlapLevel = (n: number | null): Level =>
  n == null ? 'unknown' : n === 0 ? 'good' : 'bad';

/**
 * ГҮЙЦЭТГЭЛИЙН ХЯНАЛТАД ХҮЛЭЭГДЭХ ХУГАЦАА, хоног.
 *
 * ⚠️ 7 хоног нь ХЭРЭГЛЭГЧИЙН тогтоосон утга (2026-08-24) — тооцоолж гаргасан
 * босго БИШ. Хяналтын нэг шат дээр ажил долоо хоногоос удвал урсгал зогсонги
 * байна гэсэн үг.
 *
 * ⚠️ ДУНД ТҮВШИН БАЙХГҮЙ: хэрэглэгч зөвхөн нэг босго өгсөн тул «ойртож байна»
 * гэсэн шар зурвасыг ЗОХИОГҮЙ. Хэрэгтэй бол энд нэмнэ.
 */
export const REVIEW_STALE_DAYS = 7;
export const reviewAgeLevel = (days: number | null): Level =>
  days == null ? 'unknown' : days > REVIEW_STALE_DAYS ? 'bad' : 'good';

/**
 * ОБЬЁМЫН ЗӨРҮҮ ба ХАБЭА ХОХИРОЛ — босго нь `execTriage.ts`-д амьдарна.
 * ⚠️ Энд ЗӨВХӨН дахин экспортлоно; утгыг нь хуулбарлавал хоёр эх сурвалж болно.
 */
export { VAR_BAD_MNT, DMG_BAD_N } from './execTriage';
