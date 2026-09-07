/**
 * CEO ҮЗҮҮЛЭЛТ «ОБЬЁМЫН ЗӨРҮҮ» — гэрээлсэн обьёмоос ХЭТЭРЧ бөглөгдсөн
 * гүйцэтгэлийн мөнгөн дүн, ₮.
 *
 * Эх сурвалж: `loadVariance()` (`execTriage.ts`) — 10 багцын бөглөх хуудасны
 * навч мөр бүрд «блокуудад бөглөсөн нийлбэр − төлөвлөгдсөн Обьём» × нэгж
 * өртөг. ЗӨВХӨН хэтэрсэн (нийлбэр > Обьём) мөр зөрчил; дутуу нь хэвийн явц.
 *
 * ⚠️ `loadVariance` нь модулийн түвшинд кэштэй ч `dataBus` тагт холбогдоогүй.
 *    Энэ ачаалагчийг `cached(…, ['BAGTS_SHEET'])`-ээр ороосон нь бөглөх хуудас
 *    руу бичсэн үед ЭНЭ давхарга шинэчлэгдэнэ гэсэн үг; доод давхаргын кэш
 *    хуудсыг бүтэн refresh хийтэл хэвээр — өглөөний тоймд хангалттай.
 *
 * ⚠️ ТӨЛӨВ БҮХЭЛДЭЭ `computeVariance`-д — сүлжээгүй, тестлэгдэнэ
 *    (`variance.check.mjs`). Ачаалагч нь зөвхөн татаад дамжуулна.
 */
import { t as tr } from '@/lib/i18nCore';
import { cached } from '@/lib/live';
import { mnt, num } from '@/lib/format';
import { loadVariance, type Variance, type VarianceWork } from '@/lib/execTriage';
import { VAR_BAD_MNT } from '@/lib/kpiLevels';
import { PKGS } from '@/modules/sheet/bagts.pkg';
import { cell, table, type Cell, type KpiResult, type Level } from './kpi';

/**
 * Түвшин.
 * ⚠️ ДАРААЛАЛ ЧУХАЛ: бүх багц уншигдаагүй бол `works` ч 0, `totalMnt` ч 0 —
 *    эхлээд «good» гэж шалгавал унасан үйлчилгээ «зөрүүгүй» гэж НОГООН гарна.
 *    Тиймээс `unknown`-ийг хамгийн түрүүнд.
 * ⚠️ Босго `VAR_BAD_MNT` (100 сая ₮) нь `execTriage.ts`-ийнх — энд хуулбарлахгүй.
 *    Бага ч гэсэн зөрүү илэрсэн бол «warn»: хяналт хэрэгтэй, гэхдээ яаралтай биш.
 */
export function varianceLevel(
  v: Pick<Variance, 'works' | 'totalMnt' | 'failedPkgs'>,
  pkgCount: number,
): Level {
  if (pkgCount > 0 && v.failedPkgs >= pkgCount) return 'unknown';
  if (v.works === 0) return 'good';
  return v.totalMnt >= VAR_BAD_MNT ? 'bad' : 'warn';
}

/** Хэтэрсэн ажлуудын хүснэгтийн нэг мөр — багана `WORK_COLS`-той ЯГ таарна */
function workRow(w: VarianceWork): Cell[] {
  return [
    cell(w.pkg),
    /* ⚠️ `no` хоосон байж болно (`String(r.no ?? '')`) — тэр үед «—» */
    cell(w.no || null),
    cell(w.work),
    cell(w.vol),
    cell(w.sum),
    /* Хэтрэлт = бөглөсөн − төлөвлөгдсөн; `loadVariance` зөвхөн > 0 мөр өгдөг */
    cell(w.sum - w.vol),
    cell(w.unit, 'mnt'),
    cell(w.mnt, 'mnt'),
  ];
}

/**
 * ЦЭВЭР ТООЦОО — `Variance` → картын гэрээ. Сүлжээгүй.
 *
 * @param pkgCount Нийт багцын тоо (`PKGS.length`) — «бүгд унасан» гэдгийг
 *                 `failedPkgs`-тэй харьцуулж танихад. Тестэд гараар өгнө.
 */
export function computeVariance(v: Variance, pkgCount: number = PKGS.length): KpiResult {
  const level = varianceLevel(v, pkgCount);
  const allFailed = level === 'unknown';
  /* Хэтэрсэн ажилтай ЯЛГААТАЙ багцын тоо (давхрын хувилбар бүр тусдаа багц) */
  const pkgN = new Set(v.all.map((w) => w.pkg)).size;

  /* ── facts: ЗӨВХӨН тоо бүхий хэсгүүд ──
     ⚠️ Бүгд унасан үед «0 ажил хэтэрсэн» гэж бичвэл «зөрүүгүй» гэж худал
        уншигдана — тэр үед зөвхөн уншигдаагүй тоог хэлнэ. */
  const facts: string[] = [];
  if (!allFailed) {
    facts.push(tr('{0} ажил хэтэрсэн', num(v.works)));
    if (pkgN > 0) facts.push(tr('{0} багц', num(pkgN)));
  }
  if (v.failedPkgs > 0) facts.push(tr('{0} багц уншигдаагүй', num(v.failedPkgs)));

  /* ── tables[0]: БҮХ хэтэрсэн ажил, зөрүүгийн ₮-өөр буурах эрэмбээр ──
     ⚠️ `all` аль хэдийн эрэмбэлэгдсэн ч ЭНД дахин эрэмбэлнэ — гэрээ нь энэ
        файлынх, доод давхаргын дараалалд найдахгүй. */
  const works = [...v.all].sort((a, b) => b.mnt - a.mnt);
  const workCols = [
    tr('Багц'), tr('№'), tr('Ажил'), tr('Обьём'), tr('Бөглөсөн'),
    tr('Хэтрэлт'), tr('Нэгж өртөг'), tr('Зөрүү ₮'),
  ];

  /* ── tables[1]: багцаар — ажлын тоо ба зөрүүгийн нийлбэр ──
     ⚠️ Нийлбэр нь зөвхөн ХЭТЭРСЭН мөрүүдийнх (дутуу мөр орохгүй) — `loadVariance`-ийн
        «зөрүү = зөвхөн хэтэрсэн» дүрэмтэй нэг утгатай. */
  const byPkg = new Map<string, { n: number; mnt: number }>();
  for (const w of works) {
    const g = byPkg.get(w.pkg) ?? { n: 0, mnt: 0 };
    g.n += 1;
    g.mnt += w.mnt;
    byPkg.set(w.pkg, g);
  }
  const pkgRows = [...byPkg.entries()]
    .sort((a, b) => b[1].mnt - a[1].mnt)
    .map(([pkg, g]) => [cell(pkg), cell(g.n), cell(g.mnt, 'mnt')]);

  const issues: KpiResult['issues'] = [];
  const failedSources: string[] = [];
  if (v.failedPkgs > 0) {
    issues.push({
      text: tr('{0} багцын хуудас уншигдсангүй — дүн дутуу', num(v.failedPkgs)),
      tone: 'warn',
    });
    /* ⚠️ `loadVariance` унасан багцын НЭРИЙГ өгдөггүй, зөвхөн тоог — тиймээс
       нэг нэгдсэн бичлэг. Нэрээр нь хэрэгтэй бол `execTriage.ts`-д нэмнэ. */
    failedSources.push(tr('{0} багцын бөглөх хуудас', num(v.failedPkgs)));
  }

  return {
    /* ⚠️ `mnt(0)` нь «—» (format.ts-ийн санаатай зан) — зөрүүгүй үед «0 ₮» биш */
    value: allFailed ? '—' : mnt(v.totalMnt),
    unit: tr('зөрүү'),
    facts,
    level,
    tables: [
      table(tr('Хэтэрсэн ажлууд'), workCols, works.map(workRow)),
      table(tr('Багцаар'), [tr('Багц'), tr('Ажил'), tr('Зөрүү ₮')], pkgRows),
    ],
    issues,
    /* `loadVariance` огноо гаргадаггүй (asOf/fillDate татдаг ч буцаадаггүй) */
    asOf: null,
    failedSources,
  };
}

/**
 * Ачаалагч — самбар үүнийг л дуудна.
 * ⚠️ `loadVariance` нь `allSettled` тул хэзээ ч шиддэггүй; «бүгд унасан» нь
 *    exception биш `level: 'unknown'` хэлбэрээр ирнэ (картад «Өгөгдөл алга»).
 */
export const loadVarianceKpi = cached(
  async (): Promise<KpiResult> => computeVariance(await loadVariance(), PKGS.length),
  60_000,
  ['BAGTS_SHEET'],
);
