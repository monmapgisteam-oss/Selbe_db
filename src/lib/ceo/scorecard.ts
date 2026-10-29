/**
 * БАГЦ АЖЛЫН ОНОО — Cashflow-ийн 74 багц ажил бүрийг ЗУРГААН бүлгээр 0–100.
 */
import { t as tr } from '@/lib/i18nCore';
import { num, pct, date } from '@/lib/format';
import { overlapLevel, pctLevel, type Level } from '@/lib/kpiLevels';
import { coverageOk } from '@/lib/planProgress';

/* ══════════════ Бүлгүүд ══════════════ */

export type Dim = 'perf' | 'fin' | 'land' | 'permit' | 'hse';

export const DIMS: readonly Dim[] = ['perf', 'fin', 'land', 'permit', 'hse'];

/**
 * Бүлгийн нэр ба холбогдох CEO үзүүлэлтүүд (`registry.ts`-ийн түлхүүр).
 */
export const dimDefs = (): Record<Dim, {
  title: string; short: string; icon: string;
  /** Холбогдох CEO үзүүлэлтүүд — хоосон бол дэлгэрэнгүйд эх сурвалжийн холбоос гарна */
  kpis: string[];
  rule: string;
  /** Эх харагдац — `kpis` хоосон үед «Харагдац руу орох» */
  view: string;
}> => ({
  perf: {
    title: tr('Гүйцэтгэл'), short: tr('Гүйц.'), icon: 'chart',
    kpis: ['schedule', 'variance', 'review'],
    rule: tr('Хуваарийн төлөвлөгөөнөөс хоцорсон нэгж хувь бүрд −2.5 оноо'),
    view: 'pkgProg',
  },
  fin: {
    title: tr('Санхүүжилт'), short: tr('Санх.'), icon: 'calc',
    kpis: ['ipc', 'contractGap', 'uncontracted'],
    rule: tr('Гэрээ байгуулсан эсэх · гэрээ ба төсвийн зөрүү · олголт ба биет явцын нийцэл'),
    view: 'pkgFin',
  },
  land: {
    title: tr('Газар чөлөөлөлт'), short: tr('Газар'), icon: 'polygon',
    kpis: ['land'],
    rule: tr('Багцын талбайд давхцсан чөлөөлөгдөөгүй нэгж талбар бүрд −5 оноо'),
    view: 'gazar',
  },
  permit: {
    title: tr('Зөвшөөрөл'), short: tr('Зөвш.'), icon: 'frame',
    kpis: ['permits'],
    rule: tr('Зөвшөөрсөн ÷ бүртгэгдсэн бүх зөвшөөрөл. Татгалзсан зөвшөөрөл — заавал шийдвэрлэх'),
    view: 'zovshoorol',
  },
  hse: {
    title: tr('ХАБЭА'), short: tr('ХАБЭА'), icon: 'shield',
    kpis: [],
    rule: tr('Ажлын байрны үзлэгийн нийцлийн хувь: нийцсэн ÷ (нийцсэн + ноцтой + бага зэргийн үл нийцэл). ≥90 ногоон · 70–89 улбар шар · <70 улаан'),
    view: 'habea',
  },
});

/* ══════════════ Оноо ══════════════ */

/** Нэг баримт — НЭР ба УТГА тусдаа (2026-09-17: «ямар үзүүлэлт гэдэг ойлгогдохгүй» гэсэн тул) */
export type Fact = { label: string; value: string };

/** Сэрэмжлүүлгийн төрөл — `DimScore.caveat`, `scoreAlerts` нэгтгэнэ (2026-10-28) */
export type CaveatKind = 'partial' | 'notStarted' | 'noCurve' | 'notDue' | 'noDates' | 'noProgress' | 'noContractAmount';

export type DimScore = {
  /** 0–100; хэмжигдэх өгөгдөлгүй бол null */
  score: number | null;
  /** Шошготой баримтууд — «Төлөвлөсөн: 33.4%» */
  facts: Fact[];
  /**
   * ДАТА ХҮЛЭЭГДЭЖ БУЙ — хэмжих хүснэгт/бүртгэл БАЙГАА ч хараахан бөглөгдөөгүй.
   */
  pending?: true;
  /**
   * ЗААВАЛ ШИЙДВЭРЛЭХ АСУУДЛУУД — тоо бүрийг нэрлэсэн өгүүлбэр.
   */
  issues?: DimIssue[];
  level?: Level;
  caveat?: { kind: CaveatKind; text: string; value?: number };
};

/** `bad` — заавал шийдвэрлэх · `warn` — анхаарах · `info` — дата оруулах */
export type IssueTone = 'bad' | 'warn' | 'info';
export type DimIssue = { tone: IssueTone; text: string };

const NONE: DimScore = { score: null, facts: [] };
const fact = (label: string, value: string): Fact => ({ label, value });
/** Хэсгийн оноо → асуудлын зэрэг (80/50 — `scoreLevel`-тэй ижил) */
const toneOf = (score: number): IssueTone | null => (score < SCORE_WARN ? 'bad' : score < SCORE_GOOD ? 'warn' : null);

export const SCORE_GOOD = 80;
export const SCORE_WARN = 50;

export const scoreLevel = (v: number | null): Level =>
  v == null ? 'unknown' : v >= SCORE_GOOD ? 'good' : v >= SCORE_WARN ? 'warn' : 'bad';

/**
 * ХАБЭА-гийн ӨӨРИЙН босго (2026-09-17, хэрэглэгч: «70-80-90 зарчмаар» —
 * 70 хүртэл улаан · 70–90 улбар шар · 90-ээс дээш ногоон).
 */
export const HSE_GOOD = 90;
export const HSE_WARN = 70;

/**
 * Бүлгийн түвшин — ХАБЭА өөрийн босготой.
 */
const hseLevel = (v: number | null): Level =>
  v == null ? 'unknown' : v >= HSE_GOOD ? 'good' : v >= HSE_WARN ? 'warn' : 'bad';
const DIM_LEVEL: Partial<Record<Dim, (v: number | null) => Level>> = {
  hse: hseLevel,
  land: pctLevel,
};
export const dimLevel = (d: Dim | null | undefined, v: number | null): Level => (
  (d && DIM_LEVEL[d]) || scoreLevel
)(v);
/** Бүлгийн оноо → асуудлын зэрэг (`dimLevel`-ээр) — 2026-10-06 */
const dimToneOf = (d: Dim, score: number): IssueTone | null => {
  const lv = dimLevel(d, score);
  return lv === 'bad' || lv === 'warn' ? lv : null;
};

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export const meanOf = (xs: readonly (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Коэффициентууд — нэг газар */
export const RULE = {
  perfPerPp: 2.5,
  overBudgetPerPct: 5,
  /** Урьдчилгаа олголт нь биет явцаас түрүүлэх нь ЭНГИЙН — энэ хэмжээ хүртэл хасахгүй */
  paidAheadFree: 30,
  paidBehindFree: 10,
  paidPerPp: 2,
  landPerParcel: 5,
} as const;

/* ── 1. Гүйцэтгэл ── */

export type PerfInput = {
  /**
   * 05-ын хуваарийн хоцрогдол (`collectPkgLags`) — байвал ЗӨВХӨН үүнийг.
   */
  lag: { planned: number; actual: number; coverage?: number | null } | null;
  start: number | null;
  end: number | null;
  /** Cashflow-ийн гүйцэтгэлийн хувь, 0–100 */
  progress: number | null;
  now: number;
};

export function scorePerf(i: PerfInput): DimScore {
  if (i.lag && !coverageOk(i.lag.coverage)) return perfPartial(i.lag);
  let planned: number | null = null;
  let actual: number | null = null;
  if (i.lag) {
    planned = i.lag.planned;
    actual = i.lag.actual;
  } else if (i.progress != null && i.start != null && i.end != null && i.end > i.start) {
    planned = clamp(((i.now - i.start) / (i.end - i.start)) * 100);
    actual = i.progress;
  }
  if (planned == null || actual == null) {
    if (!i.lag && (i.start == null || i.end == null || i.end <= i.start)) {
      return { ...NONE, caveat: { kind: 'noDates', text: tr('Эхлэх/дуусах огноогүй — гүйцэтгэлийн оноо бодогдохгүй') } };
    }
    if (!i.lag && i.progress == null) {
      return { ...NONE, caveat: { kind: 'noProgress', text: tr('Явц хэмжигдээгүй — гүйцэтгэлийн оноо бодогдохгүй') } };
    }
    return NONE;
  }
  const gap = planned - actual;
  const score = clamp(100 - Math.max(0, gap) * RULE.perfPerPp);
  const tone = toneOf(score);
  const caveat: NonNullable<DimScore['caveat']> | null = !i.lag && i.start != null && i.start > i.now
    ? { kind: 'notDue', text: tr('Эхлэх огноо ирээгүй — 100 оноо нь «хоцрогдолгүй» гэсэн үг, явцыг илэрхийлэхгүй') }
    : null;
  return {
    score,
    ...(caveat ? { caveat } : {}),
    issues: tone ? [{ tone, text: tr('Хуваариас {0} нэгж хувиар хоцорсон (төлөвлөсөн {1}, бодит {2})', num(gap, 1), pct(planned, 1), pct(actual, 1)) }] : [],
    facts: [
      fact(tr('Төлөвлөсөн гүйцэтгэл'), pct(planned, 1)),
      fact(tr('Бодит гүйцэтгэл'), pct(actual, 1)),
      fact(tr('Хоцрогдол'), gap > 0 ? tr('{0} нэгж хувь', num(gap, 1)) : tr('алга')),
    ],
  };
}

/**
 * ХУВААРИЙН МУРУЙ УНШИГДААГҮЙ барилгын мөрийн гүйцэтгэлийн оноо.
 */
export function perfNoCurve(): DimScore {
  return {
    score: null,
    caveat: { kind: 'noCurve', text: tr('Хуваарийн муруй уншигдсангүй — оноо тавигдахгүй') },
    facts: [fact(tr('Хуваарийн муруй'), tr('уншигдсангүй'))],
    issues: [{ tone: 'info', text: tr('Хуваарийн муруй уншигдсангүй — гүйцэтгэлийн оноог Cashflow-ийн хувиар орлуулж бодсонгүй. Дахин ачаална уу.') }],
  };
}

/**
 * ХУВААРЬ ДУТУУ барилгын мөрийн гүйцэтгэлийн оноо (2026-10-22, аудит).
 */
export function perfPartial(lag: { planned: number; actual: number; coverage?: number | null }): DimScore {
  const cov = lag.coverage == null ? '—' : pct(lag.coverage, 1);
  return {
    score: null,
    caveat: { kind: 'partial', value: lag.coverage ?? undefined, text: tr('Хуваарь {0} хамарсан (95% шаардлагатай) — оноо тавигдахгүй', cov) },
    facts: [
      fact(tr('Төлөвлөсөн гүйцэтгэл'), pct(lag.planned, 1)),
      fact(tr('Бодит гүйцэтгэл'), pct(lag.actual, 1)),
      fact(tr('Хуваарийн хамралт'), cov),
    ],
    issues: [{ tone: 'info', text: tr('Хуваарь {0} хамарсан — гүйцэтгэлийн оноо тавигдахгүй (огноогүй ажлын жин төлөвлөгөөнд 0-ээр орж «төлөвлөсөн» хэт бага гардаг). Багцын хуваарийг бүрэн бөглөнө үү.', cov) }],
  };
}

/**
 * ХУВААРЬ ЭХЛЭЭГҮЙ барилгын мөрийн гүйцэтгэлийн оноо (2026-10-04).
 */
export function perfNotStarted(): DimScore {
  return {
    score: null,
    caveat: { kind: 'notStarted', text: tr('Багцын хуваарь хэмжилтийн өдөр эхлээгүй — оноо тавигдахгүй') },
    facts: [fact(tr('Хуваарийн муруй'), tr('хуваарь эхлээгүй'))],
    issues: [{ tone: 'info', text: tr('Багцын хуваарь хэмжилтийн өдөр хараахан эхлээгүй — гүйцэтгэлийн оноо тавигдахгүй (гэрээний огнооны шугамаар орлуулахгүй).') }],
  };
}

/* ── 2. Санхүүжилт ── */

export type FinInput = {
  contracted: boolean;
  start: number | null;
  now: number;
  /**
   * Гэрээтэй харьцуулах ТӨСӨВ, ₮ — ЗАХИРАМЖИЙН ХО төсөв (`ho_dun_zahiramj`); 0 = мэдэхгүй.
   */
  cost: number;
  /** Гэрээний дүн, ₮ — гэрээгүй бол null */
  contract: number | null;
  /** Багцын олгосон ÷ гэрээ, 0–100 (`pkgFinRows`) — олголтын бүртгэлгүй бол null */
  paidPct: number | null;
  /** Биет гүйцэтгэл, 0–100 — олголттой харьцуулахад */
  actual: number | null;
};

export function scoreFin(i: FinInput): DimScore {
  const parts: number[] = [];
  const facts: Fact[] = [];
  const issues: DimIssue[] = [];
  const contracted = i.contracted;
  if (contracted) {
    parts.push(100);
    facts.push(fact(tr('Гэрээ'), tr('байгуулсан')));
  } else if (i.start != null && i.start < i.now) {
    parts.push(0);
    facts.push(fact(tr('Гэрээ'), tr('эхлэх хугацаа өнгөрсөн, гэрээгүй')));
    issues.push({ tone: 'bad', text: tr('Эхлэх хугацаа өнгөрсөн боловч гэрээ байгуулаагүй') });
  } else {
    facts.push(fact(tr('Гэрээ'), tr('хараахан байгуулаагүй')));
  }
  if (contracted && i.contract != null && i.contract > 0 && i.cost > 0) {
    const over = ((i.contract - i.cost) / i.cost) * 100;
    const sc = clamp(100 - Math.max(0, over) * RULE.overBudgetPerPct);
    parts.push(sc);
    const t = toneOf(sc);
    if (t) issues.push({ tone: t, text: tr('Гэрээний дүн төсөвт өртгөөс {0}-иар их', pct(over, 1)) });
    facts.push(fact(tr('Гэрээ ба төсвийн зөрүү'), over > 0 ? tr('төсвөөс {0} их', pct(over, 1)) : tr('төсөвт багтсан')));
  }
  if (i.paidPct != null && i.actual != null) {
    const diff = i.paidPct - i.actual;
    const pen = diff >= 0 ? Math.max(0, diff - RULE.paidAheadFree) : Math.max(0, -diff - RULE.paidBehindFree);
    const sc = clamp(100 - pen * RULE.paidPerPp);
    parts.push(sc);
    const t = toneOf(sc);
    if (t) {
      issues.push({
        tone: t,
        text: diff < 0
          ? tr('Олголт биет гүйцэтгэлээс {0} нэгж хувиар хоцорсон (олгосон {1}, биет {2})', num(-diff, 1), pct(i.paidPct, 1), pct(i.actual, 1))
          : tr('Олголт биет гүйцэтгэлээс {0} нэгж хувиар түрүүлсэн (олгосон {1}, биет {2})', num(diff, 1), pct(i.paidPct, 1), pct(i.actual, 1)),
      });
    }
    facts.push(fact(tr('Олгосон санхүүжилт (гэрээний)'), pct(i.paidPct, 1)));
    facts.push(fact(tr('Биет гүйцэтгэл'), pct(i.actual, 1)));
  }
  const caveat: NonNullable<DimScore['caveat']> | null = contracted && !(i.contract != null && i.contract > 0)
    ? { kind: 'noContractAmount', text: tr('«Гэрээлсэн дүн» гэсэн ч гэрээний дүн хоосон — төсөвтэй харьцуулах боломжгүй') }
    : null;
  const score = meanOf(parts);
  return { score, facts, issues, ...(caveat ? { caveat } : {}) };
}

/* ── 3. Газар чөлөөлөлт ── */

export type LandInput = {
  /** Газар чөлөөлөлтийн өөрийнх нь ажил (тайлангийн 6-р хэсэг) */
  isLandWork: boolean;
  /** Төслийн нийт чөлөөлөлтийн хувь, 0–100 */
  landPct: number | null;
  /** Багцын газрын зураглал (блок/давхарга) бий юу */
  hasFootprint: boolean;
  /** Давхцсан чөлөөлөгдөөгүй нэгж талбар; огтлолцол татагдаагүй бол null */
  overlap: number | null;
  overlapFailed: boolean;
};

export function scoreLand(i: LandInput): DimScore {
  if (i.isLandWork) {
    if (i.landPct == null) return NONE;
    const score = clamp(i.landPct);
    const tone = dimToneOf('land', score);
    return {
      score,
      facts: [fact(tr('Төслийн газар чөлөөлөлт'), pct(i.landPct, 1))],
      issues: tone ? [{ tone, text: tr('Газар чөлөөлөлт {0} — дуусаагүй', pct(i.landPct, 1)) }] : [],
    };
  }
  if (!i.hasFootprint || i.overlapFailed) return NONE;
  const n = i.overlap ?? 0;
  const score = clamp(100 - n * RULE.landPerParcel);
  const level = overlapLevel(n);
  const tone: IssueTone | null = n > 0 ? (level === 'bad' ? 'bad' : 'warn') : null;
  return {
    score,
    level,
    issues: tone ? [{ tone, text: tr('Багцын талбайд {0} чөлөөлөгдөөгүй нэгж талбар давхцсан', num(n)) }] : [],
    facts: [fact(tr('Давхцсан чөлөөлөгдөөгүй нэгж талбар'), num(n))],
  };
}


/* ── 5. Зөвшөөрөл ── */

export type PermitInput = {
  /** Багцын зөвшөөрлийн төлөвийн тоо (`zovshoorol.summarize`) — бүртгэлгүй бол null */
  counts: { ok: number; wait: number; no: number; unknown: number } | null;
};

export function scorePermit(i: PermitInput): DimScore {
  const c = i.counts;
  const total = c ? c.ok + c.wait + c.no + c.unknown : 0;
  if (!c || total === 0) return NONE;
  const score = clamp((c.ok / total) * 100);
  const issues: DimIssue[] = [];
  if (c.no > 0) issues.push({ tone: 'bad', text: tr('{0} зөвшөөрөл татгалзсан (зөвшөөрөөгүй)', num(c.no)) });
  if (c.unknown > 0) issues.push({ tone: 'warn', text: tr('{0} зөвшөөрлийн төлөв танигдахгүй — бүртгэлийг засах', num(c.unknown)) });
  const tone = toneOf(score);
  if (c.wait > 0) issues.push({ tone: tone ?? 'warn', text: tr('{0} зөвшөөрөл хүлээгдэж байна ({1}/{2} зөвшөөрсөн)', num(c.wait), num(c.ok), num(total)) });
  return {
    score,
    issues,
    facts: [
      fact(tr('Бүртгэгдсэн зөвшөөрөл'), num(total)),
      fact(tr('Зөвшөөрсөн'), num(c.ok)),
      fact(tr('Хүлээгдэж буй'), num(c.wait)),
      fact(tr('Зөвшөөрөөгүй'), num(c.no)),
    ],
  };
}

/* ── 6. ХАБЭА ── */

/** Нэг ажлын байрны үзлэг — маягтын өөрийн `cnt_*` нийлбэрүүд */
export type Inspection = {
  /** Үзлэгийн огноо, epoch ms; байхгүй бол 0 */
  at: number;
  conf: number;
  major: number;
  minor: number;
  obs: number;
};

export type HseInput = {
  /**
   * Багц идэвхтэй талбай мөн үү (хүн хүчний бүртгэлд бий) — ЗӨВХӨН «дата
   * хүлээгдэж буй»-г ялгахад; оноонд ОРОХГҮЙ.
   */
  active: boolean;
  inspections: readonly Inspection[];
};

export function scoreHse(i: HseInput): DimScore {
  let conf = 0;
  let major = 0;
  let minor = 0;
  let obs = 0;
  let last = 0;
  for (const x of i.inspections) {
    conf += x.conf;
    major += x.major;
    minor += x.minor;
    obs += x.obs;
    if (x.at > last) last = x.at;
  }
  const judged = conf + major + minor;
  const facts: Fact[] = [
    fact(tr('Үзлэгийн тоо'), num(i.inspections.length)),
    fact(tr('Сүүлийн үзлэг'), last > 0 ? date(last) : '—'),
    fact(tr('Нийцсэн'), num(conf)),
    fact(tr('Ноцтой үл нийцэл'), num(major)),
    fact(tr('Бага зэргийн үл нийцэл'), num(minor)),
    fact(tr('Ажиглалт'), num(obs)),
  ];
  if (judged === 0) {
    if (i.inspections.length === 0 && !i.active) return NONE;
    return {
      score: null, facts: i.inspections.length ? facts : [], pending: true,
      issues: [{ tone: 'info', text: tr('Ажлын байрны үзлэгийн дүн ороогүй — үзлэг хийж бүртгэх') }],
    };
  }
  const score = clamp((conf / judged) * 100);
  const issues: DimIssue[] = [];
  if (major > 0) issues.push({ tone: 'bad', text: tr('Ажлын байрны үзлэгт {0} ноцтой үл нийцэл илэрсэн', num(major)) });
  const lv = dimLevel('hse', score);
  if (lv === 'bad' || lv === 'warn') {
    issues.push({ tone: lv, text: tr('Үзлэгийн нийцэл {0} — {1}%-иас доош', pct(score, 1), HSE_GOOD) });
  }
  return { score, facts, issues };
}

/* ══════════════ Нэгтгэл ══════════════ */

export type WorkScore = {
  oid: number;
  name: string;
  /** Дэд багц (`pkg2`) эсвэл багц — дэлгэцэнд */
  pkgLabel: string;
  /** `pkgKeyOf(pkg2) || pkgKeyOf(pkg)` — бусад эхтэй холбох түлхүүр; хоосон байж болно */
  key: string;
  type: string;
  /** Урьдчилсан төсөвт өртөг, ₮ (Cashflow) */
  cost: number;
  /** Гэрээний дүн, ₮ — гэрээгүй (`note !== CONTRACTED`) бол null (2026-09-21) */
  contract: number | null;
  cancelled: boolean;
  isLandWork: boolean;
  dims: Record<Dim, DimScore>;
  /** Бодогдсон бүлгүүдийн энгийн дундаж */
  total: number | null;
};

export type TypeGroup = {
  type: string;
  works: WorkScore[];
  /** Бүлэг бүрийн дундаж — ТӨСВӨӨР жигнэсэн (`weightedMeanOf`, 2026-09-30) */
  dims: Record<Dim, number | null>;
  /** Оноотой ажил алга, гэхдээ дата хүлээгдэж буй ажил бий */
  pending: Record<Dim, boolean>;
  /** `dims`-ийн (null-гүй) энгийн дундаж — хажууд харагдах тоонуудтай ЯГ таарна */
  total: number | null;
};

export const totalOf = (dims: Record<Dim, DimScore>): number | null => meanOf(DIMS.map((d) => dims[d].score));

/**
 * Жин — ажлын урьдчилсан төсөвт өртөг (₮, Cashflow).
 */
export const workWeight = (w: WorkScore): number => (Number.isFinite(w.cost) && w.cost > 0 ? w.cost : 0);

/**
 * Жигнэсэн дундаж — `null` утга АЛГАСНА (null ≠ 0).
 */
export const weightedMeanOf = (xs: readonly { v: number | null; w: number }[]): number | null => {
  const v = xs.filter((x): x is { v: number; w: number } => x.v != null && Number.isFinite(x.v));
  if (!v.length) return null;
  const W = v.reduce((a, x) => a + (x.w > 0 ? x.w : 0), 0);
  if (!(W > 0)) return meanOf(v.map((x) => x.v));
  return v.reduce((a, x) => a + x.v * (x.w > 0 ? x.w : 0), 0) / W;
};

const dimMeans = (works: readonly WorkScore[]): Record<Dim, number | null> => (
  Object.fromEntries(DIMS.map((d) => [
    d, weightedMeanOf(works.map((w) => ({ v: w.dims[d].score, w: workWeight(w) }))),
  ])) as Record<Dim, number | null>
);

/** Нийт = харагдаж буй бүлгийн дундажуудын дундаж (`totalOf`-той нэг дүрэм) */
const totalOfMeans = (dims: Record<Dim, number | null>): number | null => meanOf(DIMS.map((d) => dims[d]));

const dimPending = (works: readonly WorkScore[], means: Record<Dim, number | null>): Record<Dim, boolean> => (
  Object.fromEntries(DIMS.map((d) => [d, means[d] == null && works.some((w) => w.dims[d].pending)])) as Record<Dim, boolean>
);

/**
 * Ажлуудыг төрлөөр бүлэглэнэ.
 */
export function groupByType(works: readonly WorkScore[]): TypeGroup[] {
  const m = new Map<string, WorkScore[]>();
  for (const w of works) {
    const k = w.type || tr('Ангилалгүй');
    const a = m.get(k);
    if (a) a.push(w); else m.set(k, [w]);
  }
  const cost = (ws: readonly WorkScore[]) => ws.reduce((a, w) => a + w.cost, 0);
  return [...m]
    .map(([type, ws]) => {
      const live = ws.filter((w) => !w.cancelled);
      const sorted = [...ws].sort((a, b) => (
        (a.total == null ? 1 : 0) - (b.total == null ? 1 : 0)
        || (a.total ?? 0) - (b.total ?? 0)
        || b.cost - a.cost
      ));
      const dims = dimMeans(live);
      return { type, works: sorted, dims, pending: dimPending(live, dims), total: totalOfMeans(dims) };
    })
    .sort((a, b) => cost(b.works) - cost(a.works));
}

/**
 * Төслийн нийт — бүлэг бүрийн ТӨСВӨӨР жигнэсэн дундаж; нийт нь тэдгээрийн
 * дундаж (`CeoScorecard`-ийн «Нийт оноо» == хажуугийн 7 хавтангийн дундаж).
 */
export function projectDims(works: readonly WorkScore[]): { dims: Record<Dim, number | null>; pending: Record<Dim, boolean>; total: number | null } {
  const live = works.filter((w) => !w.cancelled);
  const dims = dimMeans(live);
  return { dims, pending: dimPending(live, dims), total: totalOfMeans(dims) };
}

/* ══════════════ Төлөв ба шүүлт ══════════════ */

/**
 * Ажлын ТӨЛӨВ — нийт оноогоор (80/50). `none` = оноо бодогдоогүй.
 */
export type WorkStatus = 'bad' | 'warn' | 'good' | 'none';
export const STATUSES: readonly WorkStatus[] = ['bad', 'warn', 'good', 'none'];

export const workStatus = (w: WorkScore): WorkStatus => {
  const lv = scoreLevel(w.total);
  return lv === 'bad' || lv === 'warn' || lv === 'good' ? lv : 'none';
};

/**
 * НЭГ АЖЛЫН бүлгийн түвшин — `DimScore.level` (оноонос үл хамаарах, 2026-10-09) байвал түүгээр,
 * үгүй бол `dimLevel(d, score)`. Бүлгийн/төслийн дундаж (`dimMeans`)-д `dimLevel` хэвээр.
 */
export const workDimLevel = (w: Pick<WorkScore, 'dims'>, d: Dim): Level => {
  const sc = w.dims[d];
  return sc.score == null ? 'unknown' : sc.level ?? dimLevel(d, sc.score);
};

/** Бүлгийн доторх ажлын төлөв — `pending` нь «дата хүлээгдэж буй» */
export type DimStatus = WorkStatus | 'pending';
export const DIM_STATUSES: readonly DimStatus[] = ['bad', 'warn', 'good', 'pending', 'none'];

export const dimStatus = (w: WorkScore, d: Dim): DimStatus => {
  const sc = w.dims[d];
  if (sc.score == null) return sc.pending ? 'pending' : 'none';
  const lv = workDimLevel(w, d);
  return lv === 'bad' || lv === 'warn' || lv === 'good' ? lv : 'none';
};

/** Тоолуур — хасагдсан ажил ОРОХГҮЙ */
export function statusCounts(works: readonly WorkScore[]): Record<WorkStatus, number> {
  const c: Record<WorkStatus, number> = { bad: 0, warn: 0, good: 0, none: 0 };
  for (const w of works) if (!w.cancelled) c[workStatus(w)] += 1;
  return c;
}

export function dimStatusCounts(works: readonly WorkScore[], d: Dim): Record<DimStatus, number> {
  const c: Record<DimStatus, number> = { bad: 0, warn: 0, good: 0, pending: 0, none: 0 };
  for (const w of works) if (!w.cancelled) c[dimStatus(w, d)] += 1;
  return c;
}

/**
 * Ажлын төрөл бүрийн төлөвийн тоо — `groupByType`-ийн ИЖИЛ дараалал (төсвөөр
 * буурах) ба ижил нэр («Ангилалгүй»), эс бөгөөс график ба жагсаалт зөрнө.
 */
export function statusByType(works: readonly WorkScore[]): { type: string; counts: Record<WorkStatus, number> }[] {
  return groupByType(works).map((g) => ({ type: g.type, counts: statusCounts(g.works) }));
}

export type ScoreFilter = {
  /** Нийт төлөв — хоосон бол шүүлтгүй; олон сонголт «ЭСВЭЛ» */
  status: readonly WorkStatus[];
  /** Ажлын төрөл («Орон сууцны хороолол» …) — хоосон бол шүүлтгүй; «ЭСВЭЛ» */
  types: readonly string[];
  /** Энэ бүлэгт АСУУДАЛТАЙ (эрсдэлтэй/анхааруулга) ажил л — null бол шүүлтгүй */
  problemDim: Dim | null;
};

export const NO_FILTER: ScoreFilter = { status: [], types: [], problemDim: null };
export const filterActive = (f: ScoreFilter): boolean =>
  f.status.length > 0 || f.types.length > 0 || f.problemDim != null;

/**
 * Шүүлтэд тэнцэх үү. Хэмжээс хооронд «БА».
 */
export function passFilter(w: WorkScore, f: ScoreFilter): boolean {
  if (!filterActive(f)) return true;
  if (w.cancelled) return false;
  if (f.status.length && !f.status.includes(workStatus(w))) return false;
  if (f.types.length && !f.types.includes(w.type || tr('Ангилалгүй'))) return false;
  if (f.problemDim) {
    const st = dimStatus(w, f.problemDim);
    if (st !== 'bad' && st !== 'warn') return false;
  }
  return true;
}

/* ══════════════ Асуудлын эрэмбэ ══════════════ */

export type RankedIssue = DimIssue & { dim: Dim; score: number | null };

const TONE_RANK: Record<IssueTone, number> = { bad: 0, warn: 1, info: 2 };

/**
 * Сонгосон багцын ЗААВАЛ ШИЙДВЭРЛЭХ асуудлууд — эрэмбээр.
 */
export function workIssues(w: WorkScore): RankedIssue[] {
  const out: RankedIssue[] = [];
  DIMS.forEach((d) => {
    for (const i of w.dims[d].issues ?? []) out.push({ ...i, dim: d, score: w.dims[d].score });
  });
  return out.sort((a, b) => (
    TONE_RANK[a.tone] - TONE_RANK[b.tone]
    || (a.score ?? 101) - (b.score ?? 101)
    || DIMS.indexOf(a.dim) - DIMS.indexOf(b.dim)
  ));
}

/* ══════════════ Самбарын сэрэмжлүүлэг ══════════════ */

export type ScoreAlert = { kind: 'perfCoverage' | 'notDue' | 'dataGap'; tone: IssueTone; text: string };

/**
 * САМБАРЫН ДЭЭД ЗУРВАС — оноог хэр итгэж уншихыг хэлнэ (2026-10-28, хэрэглэгч: «асуудалтай зүйл дээр alert»).
 */
export function scoreAlerts(works: readonly WorkScore[]): ScoreAlert[] {
  const live = works.filter((w) => !w.cancelled && !w.isLandWork);
  const out: ScoreAlert[] = [];
  const by = (k: CaveatKind, d: Dim = 'perf') => live.filter((w) => w.dims[d].caveat?.kind === k);
  const label = (w: WorkScore) => w.pkgLabel || w.name;
  const names = (ws: WorkScore[], max = 6) => (ws.length > max ? `${ws.slice(0, max).map(label).join(', ')} …` : ws.map(label).join(', '));
  const total = live.reduce((a, w) => a + (w.cost > 0 ? w.cost : 0), 0);
  const covered = live.reduce((a, w) => a + (w.cost > 0 && w.dims.perf.score != null ? w.cost : 0), 0);
  if (total > 0) {
    const share = (covered / total) * 100;
    if (share < 95) {
      const reasons: string[] = [];
      const partial = by('partial').sort((a, b) => b.cost - a.cost);
      if (partial.length) {
        const list = partial.slice(0, 6).map((w) => {
          const v = w.dims.perf.caveat?.value;
          return v == null ? label(w) : `${label(w)} ${pct(v, 0)}`;
        }).join(', ');
        reasons.push(tr('{0} багцын хуваарь дутуу ({1})', num(partial.length), list));
      }
      const ns = by('notStarted'); if (ns.length) reasons.push(tr('{0} багц хуваарь эхлээгүй', num(ns.length)));
      const nc = by('noCurve'); if (nc.length) reasons.push(tr('{0} ажлын хуваарийн муруй уншигдаагүй', num(nc.length)));
      const nd = by('noDates'); if (nd.length) reasons.push(tr('{0} ажил огноогүй', num(nd.length)));
      const np = by('noProgress'); if (np.length) reasons.push(tr('{0} ажлын явц хэмжигдээгүй', num(np.length)));
      out.push({
        kind: 'perfCoverage',
        tone: share < 50 ? 'bad' : 'warn',
        text: tr('Гүйцэтгэлийн оноо төсвийн {0}-ийг л хамарсан — {1}', pct(share, 0), reasons.join(' · ') || tr('оноо бодогдоогүй')),
      });
    }
  }
  const due = by('notDue');
  if (due.length) {
    out.push({ kind: 'notDue', tone: 'warn', text: tr('{0} ажил эхлэх огноо ирээгүй атлаа 100 оноотой ({1}) — гүйцэтгэлийн дундажийг өсгөж байна', num(due.length), names(due)) });
  }
  const gaps: string[] = [];
  const nca = by('noContractAmount', 'fin'); if (nca.length) gaps.push(tr('гэрээлсэн ч гэрээний дүнгүй — {0}', names(nca)));
  const nd2 = by('noDates'); if (nd2.length) gaps.push(tr('эхлэх/дуусах огноогүй — {0}', names(nd2)));
  if (gaps.length) out.push({ kind: 'dataGap', tone: 'warn', text: tr('Өгөгдлийн цоорхой: {0}', gaps.join('; ')) });
  return out;
}
