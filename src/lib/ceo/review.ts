/**
 * CEO ҮЗҮҮЛЭЛТ «ГҮЙЦЭТГЭЛ БӨГЛӨХ БА ШИЙДВЭРЛЭХ ХОЦРОЛТ» — хоёр хэсэг.
 *
 *   А. ХЯНАЛТЫН ХҮЛЭЭГДЭЛ — `guitsetgel_bugluh_hyanalt` хүснэгт: хаагдаагүй
 *      ажил бүр ОДООГИЙН шатандаа хэдэн хоног хүлээгдэж байна
 *      (`hyanaltGroup.pendingAging`). 7 хоногоос дээш бол урсгал зогсонги.
 *   Б. БӨГЛӨЛТИЙН НАС — `Bagts_*` бөглөх хуудсуудын «Б.» мөрийн түүх
 *      (`blockProgress.loadBlockHistory`): багц бүрд хамгийн сүүлд ХЭЗЭЭ
 *      бөглөсөн бэ. 14 хоног шар, 30 хоног улаан.
 *
 * ⚠️ ХОЁР ЭХ ТУС ТУСДАА УНАНА: нэг нь уншигдахгүй бол нөгөөгийнхөө тоог
 *    хэвээр үзүүлж, унасан нэрийг `failedSources`-д ил бичнэ. Хоёулаа унавал
 *    л throw.
 *
 * ⚠️ `null` ≠ 0: хүлээгдэл ачаалагдаагүй бол `value` «—», ачаалагдсан ч
 *    хүлээгдэж буй ажилгүй бол «0» — энэ нь ХЭМЖИГДСЭН тэг (юу ч хүлээгдээгүй).
 *
 * ⚠️ Тооцоо (`computeReview`, `fillAgeByPkg`) нь татахаас ТУСДАА цэвэр функц —
 *    `review.check.mjs` сүлжээгүйгээр шалгана. `Date.now()` ЗӨВХӨН ачаалагчид.
 */

import { cached } from '@/lib/live';
import { queryAll } from '@/lib/hyanalt';
import { toRow } from '@/lib/hyanaltStore';
import { groupWorks, pendingAging, STAGE_LABEL, type Pending } from '@/lib/hyanaltGroup';
import { loadBlockHistory, type BlockHistory } from '@/lib/blockProgress';
import { PKGS } from '@/modules/sheet/bagts.pkg';
import { bagtsKey } from '@/lib/services';
import { TH } from '@/lib/schem';
import { REVIEW_STALE_DAYS, reviewAgeLevel, type Level } from '@/lib/kpiLevels';
import { num } from '@/lib/format';
import { t as tr } from '@/lib/i18nCore';
import {
  cell, table, worstOf, settled, daysBetween,
  type KpiResult, type KpiIssue, type DetailTable,
} from './kpi';

/* ══════════════ Босго ══════════════ */

/**
 * БӨГЛӨЛТИЙН НАСНЫ БОСГО, хоног — 14 шар · 30 улаан.
 *
 * ⚠️ САНАЛ (2026-09-06): шинэ тогтмол ЗОХИОСОНГҮЙ — `schem.ts`-ийн
 *    `TH.reportAgeD` («Сүүлийн тайлангийн нас») яг ижил утгыг хэмждэг тул
 *    түүнийг ДАХИН ЭКСПОРТЛОВ. Схем дээр 14/30-ыг өөрчилбөл энд ч дагана;
 *    хоёр газар бичвэл нэгийг засахад нөгөө нь чимээгүй хоцорно.
 */
export const FILL_STALE_DAYS = TH.reportAgeD;

/** Бөглөлтийн нас → түвшин. Нас ИХ байх нь МУУ тул `pctLevel`-ийн урвуу. */
export const fillAgeLevel = (days: number | null): Level =>
  days == null ? 'unknown'
    : days >= FILL_STALE_DAYS.bad ? 'bad'
      : days >= FILL_STALE_DAYS.warn ? 'warn' : 'good';

/* ══════════════ Б. Бөглөлтийн нас — багцаар ══════════════ */

export type FillAge = {
  /** Багцын нэр — `PKGS`-ийн `group` («Багц 3.1»); танигдаагүй бол түүхий түлхүүр */
  pkg: string;
  /** Хамгийн сүүлд бөглөсөн огноо, «YYYY-MM-DD» */
  lastFill: string;
  /** Тэр өдрөөс `now` хүртэлх хоног */
  ageDays: number;
};

/**
 * `bagtsKey(group)` → `group`. Блокийн түүхийн түлхүүр нь
 * `${bagtsKey(pkg.group)}|${блок}` (`blockProgress.history` ↔ `sheetRows`
 * `bagts: pkg.group`) тул угтварыг нь ЭНЭ хүснэгтээр буцааж нэр болгоно.
 * ⚠️ Хоёр давхрын хувилбар (9/12 давхар) НЭГ багцад нийлнэ — «Багц 1»-ийн
 *    хоёр хуудасны сүүлийн огнооны ИХ нь ялна.
 */
const PKG_BY_KEY: Record<string, string> = Object.fromEntries(
  PKGS.map((p) => [bagtsKey(p.group), p.group]),
);

/** «YYYY-MM-DD» → epoch ms (UTC шөнө дунд, `schem.ageDays`-тай ижил). Танигдахгүй бол null. */
export function dayMs(d: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const ms = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Багц бүрийн хамгийн сүүлийн бөглөлт — нас БУУРАХ (хамгийн хуучин эхэнд).
 *
 * ⚠️ `pct: null` цэгийг ч ОГНОО гэж тоолно: тэр нь нүд ЦЭВЭРЛЭГДСЭН бичлэг
 *    (Pivot хоосон нүдийг null мөрөөр бичдэг) — хуудсанд гар хүрсэн л бол
 *    «бөглөлтийн идэвх» юм. Хасвал цэвэрлэсэн багц худал хуучирна.
 */
export function fillAgeByPkg(history: BlockHistory, now: number): FillAge[] {
  const last = new Map<string, string>();
  for (const [key, points] of history) {
    const prefix = key.split('|')[0] ?? '';
    const pkg = PKG_BY_KEY[prefix] ?? prefix;
    if (!pkg) continue;
    for (const p of points) {
      if (dayMs(p.date) == null) continue;
      const prev = last.get(pkg);
      if (!prev || p.date > prev) last.set(pkg, p.date);
    }
  }
  const out: FillAge[] = [];
  for (const [pkg, lastFill] of last) {
    const ms = dayMs(lastFill);
    if (ms == null) continue;
    out.push({ pkg, lastFill, ageDays: daysBetween(ms, now) });
  }
  return out.sort((a, b) => b.ageDays - a.ageDays || a.pkg.localeCompare(b.pkg, 'mn'));
}

/* ══════════════ Нэгтгэл ══════════════ */

export type ReviewInput = {
  /** Хяналтын хүлээгдэл — эх уншигдаагүй бол `null` (хоосон жагсаалт ≠ null) */
  pending: Pending[] | null;
  /** Багцаар бөглөлтийн нас — эх уншигдаагүй бол `null` */
  fills: FillAge[] | null;
  failedSources: string[];
};

/** Буцаалтын нийт тоо — гурван шатны буцаалтын нийлбэр */
const returnsOf = (p: Pending): number =>
  p.work.engineerReturns + p.work.managerReturns + p.work.directorReturns;

/**
 * Цэвэр тооцоо — `KpiResult` угсарна.
 *
 * ⚠️ `pending` нь `pendingAging`-аас аль хэдийн хоног БУУРАХ эрэмбэтэй ирдэг ч
 *    энд дахин эрэмбэлнэ — өөр дуудагч (тест) эрэмбэгүй өгч болно.
 */
export function computeReview(input: ReviewInput): KpiResult {
  const { failedSources } = input;
  const pending = input.pending ? input.pending.slice().sort((a, b) => b.days - a.days) : null;
  const fills = input.fills ? input.fills.slice().sort((a, b) => b.ageDays - a.ageDays) : null;

  /* ── А. Хүлээгдэл ── */
  const worstDays: number | null = pending == null ? null : (pending[0]?.days ?? 0);
  const stale = pending?.filter((p) => p.days > REVIEW_STALE_DAYS) ?? [];
  const byStage = { company: 0, engineer: 0, manager: 0, director: 0 };
  for (const p of pending ?? []) byStage[p.work.owner] += 1;

  /* ── Б. Бөглөлт ── */
  const oldest = fills?.[0] ?? null;
  const maxFillAge: number | null = oldest ? oldest.ageDays : null;
  const latestFillMs = fills?.reduce<number | null>((m, f) => {
    const ms = dayMs(f.lastFill);
    return ms == null ? m : m == null ? ms : Math.max(m, ms);
  }, null) ?? null;

  /* ── Баримтууд — зөвхөн ТООТОЙ хэсгүүд ── */
  const facts: string[] = [];
  if (pending) {
    facts.push(tr('{0} ажил {1} хоногоос дээш', stale.length, REVIEW_STALE_DAYS));
    /* ⚠️ i18n: «хүлээгдэж буй {0}» ба «{0} ажил» хоёулаа `en.ts`-д БАЙГАА
       түлхүүр — шинэ «{0} ажил хүлээгдэж байна» зохиохгүй, хоёрыг давхарлана
       (mn «хүлээгдэж буй 3 ажил» · en «3 tasks pending»). */
    facts.push(tr('хүлээгдэж буй {0}', tr('{0} ажил', pending.length)));
    /* ⚠️ «Компани» шат нэмэгдсэн: инженер буцаасан ажил КОМПАНИД хүлээгдэж
       байдаг тул гурван шатны нийлбэр нийт хүлээгдэлтэй таарахгүй байсан. */
    facts.push(tr(
      'шатаар: компани {0} · инженер {1} · менежер {2} · ЕМ {3}',
      byStage.company, byStage.engineer, byStage.manager, byStage.director,
    ));
  }
  if (oldest) facts.push(tr('бөглөлт хамгийн хуучин {0} хоног ({1})', oldest.ageDays, oldest.pkg));

  /* ── Хүснэгтүүд — БҮРЭН, нэртэй ── */
  const tables: DetailTable[] = [];
  if (pending) {
    /* ⚠️ Гарчиг нь `execMetrics`-ийн «Хүлээгдэж буй ажил» түлхүүрийг ДАХИН
       хэрэглэнэ («ажлууд» гэж шинэ түлхүүр зохиовол en.ts-д давхар мөр). */
    tables.push(table(
      tr('Хүлээгдэж буй ажил'),
      [tr('Багц'), tr('Ажил'), tr('Компани'), tr('Шат'), tr('Хэн дээр'), tr('Хоног'), tr('Буцаалт')],
      pending.map((p) => [
        cell(p.work.bagts),
        cell(p.work.ajil),
        cell(p.work.company),
        cell(STAGE_LABEL[p.work.owner]),
        cell(p.assigned ? p.who : tr('дараалалд')),
        cell(p.days, 'day'),
        cell(returnsOf(p), 'count'),
      ]),
    ));
  }
  if (fills) {
    tables.push(table(
      tr('Бөглөлтийн нас — багцаар'),
      [tr('Багц'), tr('Сүүлд бөглөсөн'), tr('Хоног')],
      fills.map((f) => [cell(f.pkg), cell(f.lastFill), cell(f.ageDays, 'day')]),
    ));
  }

  /* ── Анхааруулгууд ── */
  const issues: KpiIssue[] = [
    ...stale.map((p): KpiIssue => ({
      tone: 'bad',
      text: tr('{0} · {1} — {2} дээр {3} хоног', p.work.ajil, p.work.bagts, p.who, p.days),
    })),
    ...(fills ?? [])
      .filter((f) => f.ageDays >= FILL_STALE_DAYS.bad)
      .map((f): KpiIssue => ({
        tone: 'bad',
        text: tr('{0} — сүүлд бөглөсөн {1}, {2} хоног', f.pkg, f.lastFill, f.ageDays),
      })),
  ];

  return {
    value: num(worstDays),
    unit: tr('хоног хамгийн урт хүлээлт'),
    facts,
    level: worstOf([reviewAgeLevel(worstDays), fillAgeLevel(maxFillAge)]),
    tables,
    issues,
    asOf: latestFillMs,
    failedSources,
  };
}

/* ══════════════ Ачаалагч ══════════════ */

/**
 * ⚠️ `['HYANALT', 'BAGTS_SHEET']` — хянагч шийдвэр гаргах эсвэл гүйцэтгэгч
 *    бөглөх хуудсанд бичмэгц энэ карт хүчингүй болж дахин татагдана. Зөвхөн
 *    TTL-ээр явбал батлагдсан ажил 5 минут хүртэл «хүлээгдэж буй» хэвээр
 *    тоологдоно (`execMetrics.loadReviewAging`-ийн сургамж).
 */
export const loadReviewKpi: () => Promise<KpiResult> = cached(async () => {
  const now = Date.now();
  /* ⚠️ Эхийн нэрс нь порталын ХАРАГДАЦЫН нэрс (i18n-д аль хэдийн байгаа
     түлхүүрүүд) — «Гүйцэтгэлийн хяналт» ба «Гүйцэтгэл бөглөх». Хэрэглэгч
     унасан эхийг тэр нэрээр нь цэснээс олно; шинэ нэр зохиовол олдохгүй. */
  const names = [tr('Гүйцэтгэлийн хяналт'), tr('Гүйцэтгэл бөглөх')];
  const [rv, fh] = await Promise.allSettled([
    queryAll().then((attrs) => pendingAging(groupWorks(attrs.map(toRow)), now)),
    loadBlockHistory().then((h) => fillAgeByPkg(h, now)),
  ]);
  /* ⚠️ `<unknown>` — хоёр эх ӨӨР төрөл буцаадаг (Pending[] · FillAge[]) тул
     `settled`-ийн `T`-г эхний элементээс дүгнүүлбэл хоёр дахь нь таарахгүй. */
  const { failed } = settled<unknown>([rv, fh], names);
  if (failed.length === names.length) {
    throw new Error(`ceo/review: ${failed.join(', ')} — ${tr('татагдсангүй')}`);
  }
  return computeReview({
    pending: rv.status === 'fulfilled' ? rv.value : null,
    fills: fh.status === 'fulfilled' ? fh.value : null,
    failedSources: failed,
  });
}, 5 * 60_000, ['HYANALT', 'BAGTS_SHEET']);
