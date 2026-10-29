'use client';

/**
 * CEO ҮЗҮҮЛЭЛТ — «ЗӨВШӨӨРӨЛ: хүлээгдэж буй / зөвшөөрөөгүй».
 *
 * Эх сурвалж: `loadZov` (`bagts_ajliin_zovshoorliin_burtgel/171`) — багц
 * бүрийн шат дараалсан зөвшөөрлийн бүртгэл. Гол тоо нь ШИЙДЭГДЭЭГҮЙ
 * зөвшөөрлийн тоо = хүлээгдэж буй + зөвшөөрөөгүй + танигдаагүй төлөв.
 */

import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { cached } from '@/lib/live';
import { byBagts, loadZov, summarize, TOLOV, type Tolov, type Zov } from '@/lib/zovshoorol';
import { cell, table, type KpiIssue, type KpiResult, type Level } from './kpi';

/** Кэшийн хугацаа — `schemData`-ийн `loadZov` кэштэй ижил 5 минут */
export const PERMITS_TTL_MS = 5 * 60_000;

/**
 * Төлөвийн ЭРЭМБЭ — муу нь эхэнд: зөвшөөрөөгүй → танигдаагүй → хүлээгдэж буй
 * → зөвшөөрсөн. Хүснэгт ба `issues` хоёулаа энэ дарааллаар явна.
 */
export const TOLOV_RANK: Record<Tolov, number> = {
  [TOLOV.no]: 0,
  unknown: 1,
  [TOLOV.wait]: 2,
  [TOLOV.ok]: 3,
};

/**
 * Төлөвийн ХАРАГДАХ нэр. Мэдэгдэж буй гурвыг `tr()`-ээр (толинд байгаа),
 * танигдаагүйг тусгай шошгоор — түүхий утгыг ногоон мэт харуулахгүй.
 */
export const tolovLabel = (t: Tolov): string => {
  switch (t) {
    case TOLOV.ok: return tr('Зөвшөөрсөн');
    case TOLOV.wait: return tr('Хүлээгдэж буй');
    case TOLOV.no: return tr('Зөвшөөрөөгүй');
    default: return tr('танигдаагүй төлөв');
  }
};

/** Мөрийн эрэмбэ: төлөв (муу нь эхэнд) → багц → шат */
export const compareZov = (a: Zov, b: Zov): number => (
  TOLOV_RANK[a.tolov] - TOLOV_RANK[b.tolov]
  || a.bagts.localeCompare(b.bagts, 'mn', { numeric: true })
  || a.shat - b.shat
);

const txt = (s: string) => cell(s || null);

/**
 * ЦЭВЭР ТООЦОО — сүлжээгүй.
 *
 * @param rows `loadZov()`-ийн үр дүн: `null` = үйлчилгээ уншигдаагүй.
 */
export function computePermits(rows: Zov[] | null): KpiResult {
  if (!rows) {
    return {
      value: '—',
      unit: tr('зөвшөөрөл шийдэгдээгүй'),
      facts: [],
      level: 'unknown',
      tables: [],
      issues: [],
      asOf: null,
      failedSources: [tr('Зөвшөөрлийн хүснэгт')],
    };
  }

  const s = summarize(rows);
  const pending = s.wait + s.no + s.unknown;

  let level: Level;
  if (s.no > 0 || s.unknown > 0) level = 'bad';
  else if (s.wait > 0) level = 'warn';
  else if (s.total > 0) level = 'good';
  else level = 'neutral';

  /* Зөвхөн тоотой богино хэсгүүд; тэг тоолуурыг нуршихгүй, «зөвшөөрсөн n / N» үргэлж. */
  const facts: string[] = [];
  if (s.no > 0) facts.push(tr('зөвшөөрөөгүй {0}', num(s.no)));
  if (s.wait > 0) facts.push(tr('хүлээгдэж буй {0}', num(s.wait)));
  if (s.unknown > 0) facts.push(tr('танигдаагүй төлөв {0}', num(s.unknown)));
  facts.push(tr('зөвшөөрсөн {0} / {1}', num(s.ok), num(s.total)));

  const tables: KpiResult['tables'] = [];

  /* 1. ШИЙДЭГДЭЭГҮЙ мөр бүр — нэрээр нь. Тоолуур хангалтгүй (хэрэглэгч:
        «зөвхөн 2 гэж байгаа нь утгагүй»). */
  const open = rows.filter((z) => z.tolov !== TOLOV.ok).sort(compareZov);
  if (open.length) {
    tables.push(table(
      tr('Шийдэгдээгүй зөвшөөрөл'),
      [tr('Багц'), tr('Шат'), tr('Нэр'), tr('Төлөв'), tr('Байгууллага'), tr('Хариуцагч'), tr('Тайлбар')],
      open.map((z) => [
        txt(z.bagts),
        cell(z.shat > 0 ? z.shat : null, 'count'),
        txt(z.ner),
        cell(tolovLabel(z.tolov)),
        txt(z.baiguullaga),
        txt(z.hariutsagch),
        txt(z.tailbar),
      ]),
    ));
  }

  /* 2. БАГЦААР — тоолуур; муу багц эхэнд (зөвшөөрөөгүй → танигдаагүй →
        хүлээгдэж буй), тэнцвэл багцын нэрээр. */
  const perBagts = [...byBagts(rows).entries()]
    .map(([bagts, list]) => ({ bagts, ...summarize(list) }))
    .sort((a, b) => (
      b.no - a.no || b.unknown - a.unknown || b.wait - a.wait
      || a.bagts.localeCompare(b.bagts, 'mn', { numeric: true })
    ));
  tables.push(table(
    tr('Багцаар'),
    [tr('Багц'), tr('Зөвшөөрсөн'), tr('Хүлээгдэж буй'), tr('Зөвшөөрөөгүй'), tr('Танигдаагүй')],
    perBagts.map((b) => [
      cell(b.bagts || tr('Тодорхойгүй')),
      cell(b.ok, 'count'),
      cell(b.wait, 'count'),
      cell(b.no, 'count'),
      cell(b.unknown, 'count'),
    ]),
  ));

  /* Нэр заасан анхааруулга — зөвшөөрөөгүй ба танигдаагүй мөр бүр */
  const issues: KpiIssue[] = open
    .filter((z) => z.tolov === TOLOV.no || z.tolov === 'unknown')
    .map((z) => ({
      text: tr('{0} · {1} — {2}', z.bagts || tr('Тодорхойгүй'), z.ner || '—', tolovLabel(z.tolov)),
      tone: 'bad' as const,
    }));

  /* Агшин — хамгийн сүүлийн шийдвэрийн огноо; огноогүй бол null (0 биш) */
  let asOf: number | null = null;
  for (const z of rows) {
    if (z.ognoo != null && Number.isFinite(z.ognoo) && (asOf == null || z.ognoo > asOf)) asOf = z.ognoo;
  }

  return {
    value: num(pending),
    unit: tr('зөвшөөрөл шийдэгдээгүй'),
    facts,
    level,
    tables,
    issues,
    asOf,
    failedSources: [],
  };
}

/**
 * АЧААЛАГЧ — кэштэй, `ZOVSHOOROL` бичилтээр хүчингүй болно.
 */
export const loadPermitsKpi = cached(
  async (): Promise<KpiResult> => {
    const rows = await loadZov();
    /* дотоод — дэлгэцэд гарахгүй (`loadPermitsKpiSafe` барина) */
    if (rows == null) throw new Error('zovshoorol: load failed');
    return computePermits(rows);
  },
  PERMITS_TTL_MS,
  ['ZOVSHOOROL'],
);

/** Самбарын ачаалагч — унавал шидэхгүй, unknown карт (кэшлэгдэхгүй — дараагийн дуудалт дахин оролдоно) */
export const loadPermitsKpiSafe = (): Promise<KpiResult> =>
  loadPermitsKpi().catch(() => computePermits(null));
