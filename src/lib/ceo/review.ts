/**
 * CEO ҮЗҮҮЛЭЛТ «ГҮЙЦЭТГЭЛ БӨГЛӨХ БА ШИЙДВЭРЛЭХ ХОЦРОЛТ» — хоёр хэсэг.
 *
 *   А. ХЯНАЛТЫН ХҮЛЭЭГДЭЛ — `guitsetgel_bugluh_hyanalt` хүснэгт: хаагдаагүй
 *      ажил бүр ОДООГИЙН шатандаа хэдэн хоног хүлээгдэж байна
 *      (`hyanaltGroup.pendingAging`). 7 хоногоос дээш бол урсгал зогсонги.
 *   Б. БӨГЛӨЛТИЙН НАС — `Bagts_*` бөглөх хуудсуудын «Б.» мөрийн түүх
 *      (`blockProgress.loadBlockHistory`): багц бүрд хамгийн сүүлд ХЭЗЭЭ
 *      бөглөсөн бэ. 14 хоног шар, 30 хоног улаан.
 */

import { cached } from '@/lib/live';
import { queryAll, STAGE_ORDER, type Stage } from '@/lib/hyanalt';
import { toRow } from '@/lib/hyanaltStore';
import { groupWorks, pendingAging, STAGE_LABEL, type Pending } from '@/lib/hyanaltGroup';
import { loadBlockHistory, loadInfraHistory, type BlockHistory } from '@/lib/blockProgress';
import { PKGS } from '@/modules/sheet/bagts.pkg';
import { bagtsKey } from '@/lib/services';
import { TH } from '@/lib/schem';
import { REVIEW_STALE_DAYS, reviewAgeLevel, type Level } from '@/lib/kpiLevels';
import { num, dayKey } from '@/lib/format';
import { t as tr } from '@/lib/i18nCore';

/**
 * Алдааны БОГИНО мөр — эхний мөр, ≤120 тэмдэгт (2026-09-23).
 */
export function shortError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e ?? '');
  const first = m.split('\n')[0].trim();
  return first.length > 120 ? `${first.slice(0, 117)}…` : first;
}
import {
  cell, table, worstOf, settled, daysBetween, kpiComplete,
  type KpiResult, type KpiIssue, type DetailTable,
} from './kpi';

/* ══════════════ Босго ══════════════ */

/**
 * БӨГЛӨЛТИЙН НАСНЫ БОСГО, хоног — 14 шар · 30 улаан.
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
 */
const PKG_BY_KEY: Record<string, string> = Object.fromEntries(
  PKGS.map((p) => [bagtsKey(p.group), p.group]),
);

/**
 * «YYYY-MM-DD» → epoch ms (UTC шөнө дунд). Танигдахгүй бол null.
 */
export function dayMs(d: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const ms = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Багц бүрийн хамгийн сүүлийн бөглөлт — нас БУУРАХ (хамгийн хуучин эхэнд).
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
  const todayMs = dayMs(dayKey(now)) ?? now;
  for (const [pkg, lastFill] of last) {
    const ms = dayMs(lastFill);
    if (ms == null) continue;
    out.push({ pkg, lastFill, ageDays: daysBetween(ms, todayMs) });
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

/** Буцаалтын нийт тоо — хянах бүх шатны буцаалтын нийлбэр (2026-10-23: төлөвлөлтийн инженер ч) */
const returnsOf = (p: Pending): number =>
  p.work.engineerReturns + p.work.managerReturns + p.work.plannerReturns + p.work.directorReturns
  + p.work.headReturns + p.work.chiefReturns;

/**
 * Цэвэр тооцоо — `KpiResult` угсарна.
 */
export function computeReview(input: ReviewInput): KpiResult {
  const { failedSources } = input;
  const pending = input.pending ? input.pending.slice().sort((a, b) => b.days - a.days) : null;
  const fills = input.fills ? input.fills.slice().sort((a, b) => b.ageDays - a.ageDays) : null;

  /* ── А. Хүлээгдэл ── */
  const worstDays: number | null = pending == null ? null : (pending[0]?.days ?? 0);
  const stale = pending?.filter((p) => p.days > REVIEW_STALE_DAYS) ?? [];
  const byStage = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<Stage, number>;
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
    facts.push(tr('хүлээгдэж буй {0}', tr('{0} ажил', pending.length)));
    facts.push(tr('шатаар: {0}', STAGE_ORDER
      .map((s) => `${STAGE_LABEL[s]} ${byStage[s]}`).join(' · ')));
  }
  if (oldest) facts.push(tr('бөглөлт хамгийн хуучин {0} хоног ({1})', oldest.ageDays, oldest.pkg));

  /* ── Хүснэгтүүд — БҮРЭН, нэртэй ── */
  const tables: DetailTable[] = [];
  if (pending) {
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
    level: pending == null ? 'unknown' : worstOf([reviewAgeLevel(worstDays), fillAgeLevel(maxFillAge)]),
    tables,
    issues,
    asOf: latestFillMs,
    failedSources,
  };
}

/* ══════════════ Ачаалагч ══════════════ */

export const loadReviewKpi: () => Promise<KpiResult> = cached(async () => {
  const now = Date.now();
  const names = [tr('Гүйцэтгэлийн хяналт'), tr('Гүйцэтгэл бөглөх')];
  const [rv, fh] = await Promise.allSettled([
    queryAll().then((attrs) => pendingAging(groupWorks(attrs.map(toRow)), now)),
    Promise.all([loadBlockHistory(), loadInfraHistory()]).then(([b, i]) => fillAgeByPkg(new Map([...b, ...i]), now)),
  ]);
  const { failed } = settled<unknown>([rv, fh], names);
  if (failed.length === names.length) {
    throw new Error(`ceo/review: ${failed.join(', ')} — ${tr('татагдсангүй')}`);
  }
  return computeReview({
    pending: rv.status === 'fulfilled' ? rv.value : null,
    fills: fh.status === 'fulfilled' ? fh.value : null,
    failedSources: failed,
  });
}, 5 * 60_000, ['HYANALT', 'BAGTS_SHEET'], kpiComplete);
