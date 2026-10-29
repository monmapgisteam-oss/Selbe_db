/**
 * «Тохиромжтой байдлын үнэлгээ» ТАЙЛАН (Word) — ГУРВАН том бүлэг (2026-10-19, хэрэглэгч:
 * «хот төлөвлөлт, үзүүлэлт, симуляц гээд 3 том агуулгаар дахиад бич»).
 */

import { t as tr } from '@/lib/i18nCore';
import type { DocBlock } from '@/lib/docx';
import {
  CATEGORIES, SCORE_LEVELS, PARKING_SOURCES, GREEN_SOURCES,
  type Indicator, type ParkingOpt, type GreenOpt,
} from '@/lib/analysis/config';
import { passesNorm, normGap, scoreLabel } from '@/lib/analysis/score';
import { competitionRanks } from './rankUtil';
import { normLine } from './format';
import type { Row } from './model';
import {
  simMetric, simDef, peakVehicles, zoneTrips, TRANSIT_NORM_M, POP_BASES,
  type PopBasis,
} from './simulation';
import type { TrafficStats } from './TrafficOverlay';

export type SuitReportInput = {
  /** Бүх бүс (газрын зураг) — ногоон байгууламжийн хуваарь ба аялал үүсгэлт */
  rows: Row[];
  /** Оноололд орсон бүс (`scoredRows`) */
  scored: Row[];
  /** Ангиллын шүүлтээр үлдсэн бүс — эрэмбэ (`rankRows`) */
  ranked: Row[];
  /** Симуляцын олонлог (`simRows`) */
  sim: Row[];
  indicators: Indicator[];
  parking: ParkingOpt;
  green: GreenOpt;
  popBasis: PopBasis;
  /** «Ачаалал»-ын амьд хураангуй — симуляц ажиллаагүй бол null */
  traffic: TrafficStats | null;
  /** Идэвхтэй замын сүлжээний нэр */
  netLabel: string;
  /** «Үзүүлэлт» табын идэвхтэй үзүүлэлтийн богино нэр — тэр бүлгийн газрын зургийн гарчигт */
  indicatorName: string;
};

/** Газрын зургийн агшин зураг (`viewReport.mapShot`) — бүлэг бүрийн будалтаар (`Suitability.shoot`) */
export type SuitShots = Partial<Record<'urban' | 'indicator' | 'density' | 'transit' | 'road', { png: Uint8Array; w: number; h: number }>>;

const fmt = (v: number | null | undefined, d = 0) =>
  v == null || !Number.isFinite(v) ? '' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null);
/** SCORE_LEVELS-ийн hex → docx өнгө (6 орон) */
const hex = (c: string) => c.replace('#', '').toUpperCase();
const TOP = 10;
/** Үзүүлэлтийн нэр — «FAR — Барилгажилтын …» → «FAR: …» (тайланд зураас үгүй — хэрэглэгчийн заавар) */
const nameOf = (i: Indicator) => i.name.replace(/\s*—\s*/g, ': ');

export function suitBlocks(x: SuitReportInput, shots: SuitShots = {}): DocBlock[] {
  const out: DocBlock[] = [];
  let nT = 0;
  let nG = 0;
  /** «Хүснэгт N. Нэр» + тайлбар — дараагийн блоктойгоо нэг хуудсанд */
  const table = (name: string, desc: string, head: string[], rows: string[][]) => {
    if (!rows.length) return;
    nT += 1;
    out.push(
      { kind: 'p', text: tr('Хүснэгт {0}. {1}', String(nT), name), bold: true, keep: true },
      { kind: 'p', text: desc, italic: true, color: '555555', keep: true },
      { kind: 'table', head: [head], rows },
    );
  };
  const chart = (name: string, desc: string, spec: Extract<DocBlock, { kind: 'chart' }>['spec']) => {
    if (!spec.cats.length) return;
    nG += 1;
    out.push(
      { kind: 'p', text: tr('График {0}. {1}', String(nG), name), bold: true, keep: true },
      { kind: 'p', text: desc, italic: true, color: '555555', keep: true },
      { kind: 'chart', spec: { ...spec, small: true } },
    );
  };
  const p = (text: string) => out.push({ kind: 'p', text });
  let nZ = 0;
  /** «Зураг N. Нэр» — зургийн доор (Word-ийн зургийн тайлбарын заншил) */
  const img = (k: keyof SuitShots, name: string) => {
    const sh = shots[k];
    if (!sh) return;
    nZ += 1;
    out.push({ kind: 'img', ...sh, caption: tr('Зураг {0}. {1}', String(nZ), name) });
  };
  const SCORE_KEY = tr('ногоон: сайн, шар: дунд, улаан: муу, саарал: өгөгдөлгүй');
  const HEAT_KEY = tr('цайвар шар: бага, улаан: их, саарал: өгөгдөлгүй');

  const totalW = x.indicators.reduce((a, i) => a + i.weight, 0) || 1;
  const wPct = (i: Indicator) => (i.weight / totalW) * 100;
  const scoredVals = x.ranked.map((r) => r.urban).filter((v): v is number => v != null && Number.isFinite(v));
  const avg = mean(scoredVals);

  /* ── Нэгтгэл ── */
  out.push({ kind: 'h', level: 2, text: tr('Нэгтгэл') });
  p(tr('Нийт {0} бүс · оноололд орсон {1} · эрэмбэд {2} · дундаж оноо {3}',
    fmt(x.rows.length), fmt(x.scored.length), fmt(x.ranked.length), avg == null ? tr('өгөгдөлгүй') : fmt(avg, 1)));

  /* ════════ 1. ХОТ ТӨЛӨВЛӨЛТ ════════ */
  out.push({ kind: 'h', level: 1, text: tr('1. Хот төлөвлөлт') });
  p(tr('Үзүүлэлт бүр норм хангавал 100 оноо, зөрчвөл 44-өөс дээшгүй оноо авна. Бүсийн хот төлөвлөлтийн оноо нь үзүүлэлтүүдийн жигнэсэн дундаж; өгөгдөлгүй үзүүлэлт жингээс хасагдана. Босго утга БНБД 30-01-24-өөс.'));
  img('urban', tr('Бүсийн хот төлөвлөлтийн оноо ({0})', SCORE_KEY));

  /* Үнэлгээний түвшин — дугуй */
  const lvCount = SCORE_LEVELS.map((lv) => scoredVals.filter((v) => v >= lv.min && v < lv.max).length);
  const noData = x.ranked.length - scoredVals.length;
  const lvCats = [...SCORE_LEVELS.map((lv) => lv.label), ...(noData ? [tr('Өгөгдөлгүй')] : [])];
  const lvVals = [...lvCount, ...(noData ? [noData] : [])];
  const good = lvCount[0] + lvCount[1];
  chart(
    tr('Бүсийн үнэлгээний түвшин'),
    tr('{0} бүсийн {1} нь «Сайн» ба түүнээс дээш, {2} нь «Муу» ба түүнээс доош үнэлгээтэй. Түвшин: Маш сайн ≥85, Сайн 65–85, Дунд 45–65, Муу 25–45, Маш муу <25 оноо.',
      fmt(x.ranked.length), fmt(good), fmt(lvCount[3] + lvCount[4])),
    {
      type: 'doughnut',
      cats: lvCats,
      series: [{ name: tr('Бүс'), values: lvVals }],
      pointColors: [...SCORE_LEVELS.map((lv) => hex(lv.color)), ...(noData ? ['94A3B8'] : [])],
    },
  );

  /* Ангиллаар */
  const byType = new Map<string, Row[]>();
  for (const r of x.ranked) byType.set(r.type, [...(byType.get(r.type) ?? []), r]);
  const typeRows = [...byType.entries()].map(([t, rs]) => {
    const v = mean(rs.map((r) => r.urban).filter((u): u is number => u != null));
    return { t, rs, v };
  }).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
  table(
    tr('Бүсийн ангиллаар дундаж оноо'),
    tr('{0} ангиллын дундаж хот төлөвлөлтийн оноо, хүн ам ба талбай.', fmt(typeRows.length)),
    [tr('Ангилал'), tr('Бүс'), tr('Дундаж оноо'), tr('Үнэлгээ'), tr('Оршин суугч'), tr('Талбай (га)')],
    typeRows.map(({ t, rs, v }) => [
      t, fmt(rs.length), fmt(v, 1), v == null ? '' : scoreLabel(v),
      fmt(rs.reduce((a, r) => a + r.residentPop, 0)), fmt(rs.reduce((a, r) => a + r.areaHa, 0), 1),
    ]),
  );

  /* Бүсийн эрэмбэ — өрсөлдөөний байр (дэлгэцийн `Ranking`-тэй ижил) */
  const ranks = competitionRanks(x.ranked.map((r) => r.urban));
  const order = x.ranked.map((_, i) => i).sort((a, b) => (x.ranked[b].urban ?? -1) - (x.ranked[a].urban ?? -1));
  const best = order[0] != null ? x.ranked[order[0]] : null;
  table(
    tr('Бүсийн эрэмбэ'),
    best && best.urban != null
      ? tr('{0} бүсийг хот төлөвлөлтийн оноогоор эрэмбэлэв. Тэргүүлэгч нь {1} ({2} оноо); ижил (бүхэлчилсэн) оноотой бүс ижил байр эзэлнэ.', fmt(x.ranked.length), best.id, fmt(best.urban, 1))
      : tr('{0} бүсийг хот төлөвлөлтийн оноогоор эрэмбэлэв.', fmt(x.ranked.length)),
    [tr('Байр'), tr('Бүс'), tr('Ангилал'), tr('Оноо'), tr('Үнэлгээ'), tr('Оршин суугч'), tr('Өрх'), tr('Талбай (га)')],
    order.map((k) => {
      const r = x.ranked[k];
      return [
        ranks[k] == null ? '' : String(ranks[k]), r.id, r.type, fmt(r.urban, 1), r.urban == null ? tr('Өгөгдөлгүй') : scoreLabel(r.urban),
        fmt(r.residentPop), fmt(r.households), fmt(r.areaHa, 2),
      ];
    }),
  );

  /* Зогсоол — `Urban.Parking`-ийн томьёо */
  {
    const withNeed = x.scored.filter((r) => r.parkingNeed != null);
    const supply = withNeed.reduce((a, r) => a + r.parkingSupply, 0);
    const need = withNeed.length ? withNeed.reduce((a, r) => a + (r.parkingNeed as number), 0) : null;
    const il = withNeed.reduce((a, r) => a + r.etIl, 0);
    const dald = withNeed.reduce((a, r) => a + r.etDald, 0);
    const gap = need == null ? null : supply - need;
    const short = withNeed.filter((r) => (r.parkingGap ?? 0) < 0).length;
    const pct = need != null && need > 0 ? (supply / need) * 100 : null;
    const method = PARKING_SOURCES.find((s) => s.key === x.parking.source)?.label ?? '';
    const coef = x.parking.source === 'households' ? tr(' · өрхөд {0}', x.parking.perHousehold.toFixed(2))
      : x.parking.source === 'population' ? tr(' · 1000 хүнд {0}', String(x.parking.per1000)) : '';
    table(
      tr('Зогсоолын хэрэгцээ'),
      tr('Хэрэгцээг «{0}»{1} аргаар тооцов. Ерөнхий төлөвлөгөөнд тусгагдсан зогсоол хэрэгцээний {2} хувийг хангана.', method, coef, pct == null ? tr('тодорхойгүй') : fmt(pct, 0)),
      [tr('Үзүүлэлт'), tr('Утга')],
      [
        [tr('Шаардлагатай зогсоол'), fmt(need)],
        [tr('Төлөвлөгөөнд тусгагдсан (ил / далд)'), tr('{0} ({1} / {2})', fmt(supply), fmt(il), fmt(dald))],
        [tr('Хэрэгцээ хангасан хувь'), pct == null ? '' : `${fmt(pct, 0)}%`],
        [gap == null || gap >= 0 ? tr('Илүүдэл') : tr('Дутагдал'), gap == null ? '' : fmt(Math.abs(gap))],
        [tr('Дутагдалтай бүс'), fmt(short)],
        [tr('Хангалттай бүс'), fmt(withNeed.length - short)],
      ],
    );
  }

  /* Ногоон байгууламж — `Urban.Green`-ий томьёо (БҮХ бүс — тэр карт) */
  {
    const g = x.green;
    const buffer = g.source === 'buffer';
    const perPerson = g.source === 'perPerson';
    const per = x.rows.map((r) => {
      if (buffer) {
        const pop = r.greenDist.reduce((a, d) => a + d.pop, 0);
        const cov = r.greenDist.reduce((a, d) => a + (d.d <= g.radius ? d.pop : 0), 0);
        return { have: cov, need: pop > 0 ? pop : null };
      }
      const need = perPerson
        ? (r.residentPop > 0 ? r.residentPop * g.perPerson : null)
        : (r.polyHa > 0 ? r.polyHa * 10_000 * (g.share / 100) : null);
      return { have: r.greenM2, need };
    });
    const withNeed = per.filter((q) => q.need != null && q.need > 0);
    const need = withNeed.reduce((a, q) => a + (q.need ?? 0), 0);
    const have = withNeed.reduce((a, q) => a + q.have, 0);
    const pct = need > 0 ? (have / need) * 100 : null;
    const short = withNeed.filter((q) => q.have < (q.need ?? 0)).length;
    const haveAll = x.rows.reduce((a, r) => a + r.greenM2, 0);
    const land = x.rows.reduce((a, r) => a + r.polyHa * 10_000, 0);
    const unit = buffer ? tr('оршин суугч') : tr('м²');
    const method = GREEN_SOURCES.find((s) => s.key === g.source)?.label ?? '';
    const coef = buffer ? tr(' · радиус {0} м', String(g.radius)) : perPerson ? tr(' · {0} м²/хүн', String(g.perPerson)) : tr(' · {0}%', String(g.share));
    table(
      tr('Ногоон байгууламж'),
      tr('Хэрэгцээг «{0}»{1} аргаар тооцов. Байгаа ногоон байгууламж хэрэгцээний {2} хувийг хангана.', method, coef, pct == null ? tr('тодорхойгүй') : fmt(pct, 0)),
      [tr('Үзүүлэлт'), tr('Утга')],
      [
        [buffer ? tr('Нийт оршин суугч ({0})', unit) : tr('Шаардлагатай ({0})', unit), fmt(need)],
        [buffer ? tr('Хамрагдсан ({0})', unit) : tr('Байгаа ({0})', unit), fmt(have)],
        [tr('Хэрэгцээ хангасан хувь'), pct == null ? '' : `${fmt(pct, 0)}%`],
        [tr('Ногоон эзлэх хувь (төсөл)'), land > 0 ? `${fmt((haveAll / land) * 100, 1)}%` : ''],
        [tr('Ногоон / нийт талбай (га)'), tr('{0} / {1}', fmt(haveAll / 10_000, 1), fmt(land / 10_000, 1))],
        [tr('Дутагдалтай бүс'), fmt(short)],
      ],
    );
  }

  /* ════════ 2. ҮЗҮҮЛЭЛТ ════════ */
  out.push({ kind: 'h', level: 1, text: tr('2. Үзүүлэлт') });
  img('indicator', tr('«{0}» үзүүлэлтийн оноо ({1})', x.indicatorName, SCORE_KEY));
  /* Үзүүлэлт бүрийн норм хангалт — `IndicatorPicker`-тэй ижил (түүхий утга + хадгалсан норм) */
  const stat = (i: Indicator) => {
    let pass = 0, total = 0;
    const scores: number[] = [];
    const bad: { id: string; gap: number }[] = [];
    for (const r of x.scored) {
      const q = r.parts[i.id];
      if (!q || q.value == null) continue;
      total++;
      if (passesNorm(q.value, q.norm)) pass++;
      else {
        const gp = normGap(q.value, q.norm);
        if (gp != null && gp > 0) bad.push({ id: r.id, gap: gp });
      }
      if (q.score != null) scores.push(q.score);
    }
    bad.sort((a, b) => b.gap - a.gap);
    return { pass, total, pct: total ? (pass / total) * 100 : null, score: mean(scores), bad };
  };
  const active = x.indicators.filter((i) => !i.ref);

  /* Ангиллын жин ба дундаж оноо — `CategoryPie` */
  const cats = CATEGORIES.map((c) => {
    const mine = active.filter((i) => i.cat === c.key);
    const weight = mine.reduce((a, i) => a + i.weight, 0);
    let sum = 0, ws = 0;
    for (const r of x.scored) for (const i of mine) {
      const q = r.parts[i.id];
      if (q?.score == null || i.weight <= 0) continue;
      sum += q.score * i.weight; ws += i.weight;
    }
    return { c, weight, score: ws ? sum / ws : null };
  }).filter((c) => c.weight > 0);
  const topCat = [...cats].sort((a, b) => b.weight - a.weight)[0];
  chart(
    tr('Үзүүлэлтийн ангиллын жин'),
    topCat
      ? tr('Нийт жинд «{0}» хамгийн их буюу {1}% эзэлнэ. Ангиллын дундаж оноо: {2}.', topCat.c.label, fmt((topCat.weight / totalW) * 100, 0),
        cats.map((c) => `${c.c.short} ${c.score == null ? tr('өгөгдөлгүй') : fmt(c.score, 0)}`).join(', '))
      : '',
    {
      type: 'doughnut',
      cats: cats.map((c) => c.c.label),
      series: [{ name: tr('Жин'), values: cats.map((c) => Math.round((c.weight / totalW) * 1000) / 10) }],
    },
  );

  for (const c of CATEGORIES) {
    const items = active.filter((i) => i.cat === c.key);
    if (!items.length) continue;
    out.push({ kind: 'h', level: 2, text: c.label });
    const st = items.map((i) => ({ i, s: stat(i) }));
    table(
      tr('{0}: жин, норм, хангалт', c.label),
      tr('{0} үзүүлэлтийн жин, БНБД-ийн норм ба оноололд орсон бүсийн хэд нь нормыг хангасныг харуулав.', fmt(items.length)),
      [tr('Үзүүлэлт'), tr('Жин (%)'), tr('Норм'), tr('Норм хангасан'), tr('Хувь'), tr('Дундаж оноо')],
      st.map(({ i, s }) => [
        nameOf(i), fmt(wPct(i), 0), normLine(i), s.total ? `${s.pass} / ${s.total}` : '', s.pct == null ? '' : `${fmt(s.pct, 0)}%`, fmt(s.score, 1),
      ]),
    );
    const withData = st.filter(({ s }) => s.pct != null);
    if (withData.length >= 2) {
      const worst = [...withData].sort((a, b) => (a.s.pct ?? 0) - (b.s.pct ?? 0))[0];
      chart(
        tr('{0}: норм хангасан бүсийн хувь', c.short),
        tr('Хамгийн бага хангалттай нь «{0}» ({1}%).', worst.i.short, fmt(worst.s.pct, 0)),
        {
          type: 'bar',
          cats: withData.map(({ i }) => i.short),
          series: [{ name: tr('Норм хангасан (%)'), values: withData.map(({ s }) => (s.pct == null ? null : Math.round(s.pct))) }],
        },
      );
    }
  }

  /* Норм зөрчсөн бүс — үзүүлэлт бүрээр хамгийн их зөрүүтэй бүсүүд */
  const viol = active.map((i) => ({ i, s: stat(i) })).filter(({ s }) => s.bad.length);
  out.push({ kind: 'h', level: 2, text: tr('Норм зөрчсөн бүс') });
  if (!viol.length) p(tr('Норм зөрчсөн бүс алга.'));
  table(
    tr('Нормоос хамгийн их зөрсөн бүсүүд'),
    tr('Үзүүлэлт бүрээр нормыг хангаагүй бүсийн тоо ба нормоос хамгийн их зөрсөн 3 бүс (зөрүүний хэмжээтэй).'),
    [tr('Үзүүлэлт'), tr('Зөрчсөн бүс'), tr('Хамгийн их зөрүүтэй')],
    viol.map(({ i, s }) => [
      nameOf(i), fmt(s.bad.length),
      s.bad.slice(0, 3).map((b) => `${b.id} (${fmt(b.gap, Math.max(0, i.decimals))}${i.unit ? ` ${i.unit}` : ''})`).join(', '),
    ]),
  );

  /* ════════ 3. СИМУЛЯЦ ════════ */
  out.push({ kind: 'h', level: 1, text: tr('3. Симуляц') });
  p(tr('Симуляц нь бүс бүрийн хүн амын төвлөрөл, нийтийн тээврийн хүртээмж ба замын ачааллыг харьцуулна. Утга нь «сайн, муу» биш эрчим; замын ачаалал нь хүн амд суурилсан харьцангуй индекс.'));
  const simTop = (kind: 'density' | 'transit' | 'road', desc: boolean) => x.sim
    .map((r) => ({ r, v: simMetric(r, kind, x.popBasis).value }))
    .filter((q): q is { r: Row; v: number } => q.v != null && Number.isFinite(q.v) && (kind === 'transit' ? q.v >= 0 : q.v > 0))
    .sort((a, b) => (desc ? b.v - a.v : a.v - b.v));

  /* Хүн амын төвлөрөл */
  {
    const d = simDef('density');
    const basis = POP_BASES.find((b) => b.key === x.popBasis)?.label ?? '';
    const list = simTop('density', true);
    const a = mean(list.map((q) => q.v));
    out.push({ kind: 'h', level: 2, text: d.label });
    p(tr('Хүн амын төрөл: {0}. {1} бүсэд дундаж {2} {3}; хамгийн их нь {4} ({5} {3}), хамгийн бага нь {6} ({7} {3}).',
      basis, fmt(list.length), fmt(a), d.unit,
      list[0]?.r.id ?? '', fmt(list[0]?.v), list[list.length - 1]?.r.id ?? '', fmt(list[list.length - 1]?.v)));
    img('density', tr('Хүн амын төвлөрөл, {0} ({1})', d.unit, HEAT_KEY));
    chart(
      tr('Хамгийн төвлөрөлтэй {0} бүс', String(Math.min(TOP, list.length))),
      tr('Нэг га-д ногдох хүн ам ({0}) хамгийн өндөр бүсүүд.', basis),
      {
        type: 'bar',
        cats: list.slice(0, TOP).map((q) => q.r.id),
        series: [{ name: d.unit, values: list.slice(0, TOP).map((q) => Math.round(q.v)) }],
      },
    );
  }

  /* Тээврийн хүртээмж — БНБД 10.22: ойрын буудал ≤ 500 м */
  {
    const d = simDef('transit');
    const list = simTop('transit', true);
    const ok = list.filter((q) => q.v <= TRANSIT_NORM_M).length;
    out.push({ kind: 'h', level: 2, text: d.label });
    p(tr('Ойрын буудал хүртэлх зай {0} м-ээс ихгүй байх ёстой (БНБД 30-01-24, 10.22). Өгөгдөлтэй {1} бүсийн {2} нь нормыг хангаж, {3} нь хангаагүй; дундаж зай {4} м.',
      String(TRANSIT_NORM_M), fmt(list.length), fmt(ok), fmt(list.length - ok), fmt(mean(list.map((q) => q.v)))));
    img('transit', tr('Ойрын буудал хүртэлх зай, м ({0})', HEAT_KEY));
    const far = list.filter((q) => q.v > TRANSIT_NORM_M);
    table(
      tr('Нормоос хол байгаа бүсүүд'),
      far.length
        ? tr('Ойрын буудал хүртэл {0} м-ээс хол {1} бүс, хамгийн холоос нь.', String(TRANSIT_NORM_M), fmt(far.length))
        : '',
      [tr('Бүс'), tr('Ангилал'), tr('Буудал хүртэл (м)'), tr('Нормоос илүү (м)'), tr('Оршин суугч')],
      far.slice(0, 20).map((q) => [q.r.id, q.r.type, fmt(q.v), fmt(q.v - TRANSIT_NORM_M), fmt(q.r.residentPop)]),
    );
  }

  /* Замын ачаалал */
  {
    const d = simDef('road');
    const list = simTop('road', true);
    const trips = x.rows.reduce((a, r) => a + zoneTrips(r), 0);
    out.push({ kind: 'h', level: 2, text: d.label });
    p(tr('Замын сүлжээ: {0}. Оргил цагийн аялал үүсгэлт {1} аялал/ц; сүлжээнд зэрэг явах машин {2} орчим (Little-ийн хууль, бүсийн хүн амаас).',
      x.netLabel, fmt(trips), fmt(peakVehicles(x.rows))));
    img('road', tr('Оргил цагийн аялал үүсгэлт, аялал/ц ({0})', HEAT_KEY));
    if (x.traffic) {
      p(tr('Симуляцын агшин: {0} машин, дундаж хурд {1} км/ц, чөлөөт урсгалын {2}%.',
        fmt(x.traffic.cars), fmt(x.traffic.kmh), fmt(x.traffic.flow * 100)));
    }
    chart(
      tr('Хамгийн их аялал үүсгэх {0} бүс', String(Math.min(TOP, list.length))),
      tr('Оргил цагт хамгийн олон аялал (машин/цаг) үүсгэх бүсүүд; оршин суугч ба хүчин чадлаас тооцов.'),
      {
        type: 'bar',
        cats: list.slice(0, TOP).map((q) => q.r.id),
        series: [{ name: tr('аялал/ц'), values: list.slice(0, TOP).map((q) => Math.round(q.v)) }],
      },
    );
  }

  return out;
}
