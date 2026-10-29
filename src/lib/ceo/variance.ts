/**
 * CEO ҮЗҮҮЛЭЛТ «ОБЬЁМЫН ЗӨРҮҮ» — гэрээлсэн обьёмоос ХЭТЭРЧ бөглөгдсөн
 * гүйцэтгэлийн мөнгөн дүн, ₮.
 *
 * Эх сурвалж: `loadVariance` (`execTriage.ts`) — 10 багцын бөглөх хуудасны
 * навч мөр бүрд «блокуудад бөглөсөн нийлбэр − төлөвлөгдсөн Обьём» × нэгж
 * өртөг. ЗӨВХӨН хэтэрсэн (нийлбэр > Обьём) мөр зөрчил; дутуу нь хэвийн явц.
 */
import { t as tr } from '@/lib/i18nCore';
import { cached, SESSION_TTL_MS } from '@/lib/live';
import { fixCyr, mnt, num } from '@/lib/format';
import { loadVariance, type Variance, type VarianceWork } from '@/lib/execTriage';
import { VAR_BAD_MNT } from '@/lib/kpiLevels';
import { PKGS } from '@/modules/sheet/bagts.pkg';
import { cell, kpiComplete, table, type Cell, type KpiResult, type Level } from './kpi';

/**
 * Түвшин.
 */
export function varianceLevel(
  v: Pick<Variance, 'works' | 'totalMnt' | 'failedPkgs' | 'measurable'>,
  pkgCount: number,
): Level {
  const n = v.measurable ?? pkgCount;
  /* Хэмжигдэх багц огт байхгүй (бүгд блокгүй) — «зөрүүгүй» гэж хэлж болохгүй. */
  if (n === 0 && v.measurable != null) return 'unknown';
  if (n > 0 && v.failedPkgs >= n) return 'unknown';
  if (v.works === 0) return v.failedPkgs > 0 ? 'warn' : 'good';
  return v.totalMnt >= VAR_BAD_MNT ? 'bad' : 'warn';
}

/** Хэтэрсэн ажлуудын хүснэгтийн нэг мөр — багана `WORK_COLS`-той ЯГ таарна */
function workRow(w: VarianceWork): Cell[] {
  return [
    cell(w.pkg),
    cell(w.sheet),
    cell(w.no || null),
    cell(fixCyr(w.work)),
    cell(w.vol),
    cell(w.sum),
    /* Хэтрэлт — блок бүрээр (`VarianceWork.over`, 2026-10-21); хуучин хэлбэрийн мөрд бөглөсөн − төлөвлөгдсөн */
    cell(w.over ?? w.sum - w.vol),
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

  /* ── facts: ЗӨВХӨН тоо бүхий хэсгүүд ── */
  const facts: string[] = [];
  if (!allFailed) {
    facts.push(tr('{0} ажил хэтэрсэн', num(v.works)));
    if (pkgN > 0) facts.push(tr('{0} багц', num(pkgN)));
  }
  if (v.failedPkgs > 0) facts.push(tr('{0} багц уншигдаагүй', num(v.failedPkgs)));

  /* ── tables[0]: БҮХ хэтэрсэн ажил, зөрүүгийн ₮-өөр буурах эрэмбээр ── */
  const works = [...v.all].sort((a, b) => b.mnt - a.mnt);
  const workCols = [
    tr('Багц'), tr('Бөглөх хуудас'), tr('№'), tr('Ажил'), tr('Обьём'), tr('Бөглөсөн'),
    tr('Хэтрэлт'), tr('Нэгж өртөг'), tr('Зөрүү ₮'),
  ];

  /* ── tables[1]: багцаар — ажлын тоо ба зөрүүгийн нийлбэр ── */
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
    failedSources.push(tr('{0} багцын бөглөх хуудас', num(v.failedPkgs)));
  }

  return {
    value: allFailed ? '—' : v.works === 0 && v.failedPkgs === 0 ? `${num(0)} ₮` : mnt(v.totalMnt),
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
 */
export const loadVarianceKpi = cached(
  async (): Promise<KpiResult> => computeVariance(await loadVariance(), PKGS.length),
  SESSION_TTL_MS,
  ['BAGTS_SHEET'],
  kpiComplete,
);
