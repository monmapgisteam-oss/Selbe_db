/**
 * БАГЦ АЖЛЫН ОНОО — Cashflow-ийн 74 багц ажил бүрийг ЗУРГААН бүлгээр 0–100.
 *
 * ⚠️ 2026-09-17, хэрэглэгчийн шийдвэр: нүүрний CEO самбар (13 карттай схем)
 *    «Багц ажлын оноо» болж солигдов. Ажлууд нь «Төсөв, гэрээлсэн дүн»
 *    чарттай ИЖИЛ ажлын төрлөөр (`CfRow.type`) бүлэглэгдэнэ; багц бүрд
 *      1. Гүйцэтгэл · 2. Санхүүжилт · 3. Газар чөлөөлөлт ·
 *      4. Ерөнхий төлөвлөгөө (тохиромжтой байдал) · 5. ХАБЭА · 6. Чанар
 *    оноо + гэрлэн дохио (≥80 ногоон · 50–79 шар · <50 улаан).
 *    Нийт оноо = бодогдсон бүлгүүдийн ЭНГИЙН дундаж.
 *
 * ⚠️ `null` ≠ 0 (төслийн үндсэн дүрэм). Тухайн багцад хэмжигдэх өгөгдөлгүй
 *    бүлэг (жишээ нь QAQC хүснэгтгүй дэд бүтцийн ажил, газрын зураглалгүй
 *    ТЭЗҮ) «—» бөгөөд нийт дунджид ОРОХГҮЙ. Тэгээр орлуулбал өгөгдөл
 *    бүртгэгдээгүй багц «муу» гэж ХУДАЛ харагдана.
 *
 * ⚠️ ЭНЭ ФАЙЛ ЦЭВЭР (сүлжээгүй, React-гүй) — `scorecard.check.mjs` Node дээр
 *    шалгана. Өгөгдөл татах нь `scorecardLoad.ts`-д.
 *
 * ⚠️ ОНООНЫ ДҮРЭМ нь «анхаарал татах» зорилготой ЭНГИЙН шугаман хасалт —
 *    албан ёсны үнэлгээний аргачлал БИШ. Коэффициентыг доорх `RULE`-д нэг
 *    газар тохируулна; дэлгэц дээр дүрэм нь бүлэг бүрийн тайлбарт ил бичигдэнэ.
 */
import { t as tr } from '@/lib/i18nCore';
import { num, pct, date } from '@/lib/format';
import type { Level } from '@/lib/kpiLevels';

/* ══════════════ Бүлгүүд ══════════════ */

export type Dim = 'perf' | 'fin' | 'land' | 'plan' | 'permit' | 'hse' | 'qual';

/**
 * ⚠️ 2026-09-17: «Зөвшөөрөл» ДОЛОО ДАХЬ бүлэг болж нэмэгдэв (хэрэглэгч).
 * ⚠️ «Ерөнхий төлөвлөгөө» ХАМГИЙН СҮҮЛД (хэрэглэгч: «маш чухал асуудал биш»):
 *    хүснэгтийн багана, хавтан, задаргаанд сүүлд харагдана; асуудлын эрэмбэд ч
 *    (`workIssues`) ижил зэрэгтэй бусад бүлгийн ДАРАА орно.
 */
export const DIMS: readonly Dim[] = ['perf', 'fin', 'land', 'permit', 'hse', 'qual', 'plan'];

/** Асуудлын эрэмбэд доогуур бүлгүүд */
const LOW_PRIORITY: ReadonlySet<Dim> = new Set<Dim>(['plan']);

/**
 * Бүлгийн нэр ба холбогдох CEO үзүүлэлтүүд (`registry.ts`-ийн түлхүүр).
 * ⚠️ Функцээр — `tr()`-г модулийн түвшинд дуудвал хэл солигдоход хуучирна.
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
  plan: {
    title: tr('Ерөнхий төлөвлөгөө'), short: tr('Төлөв.'), icon: 'grid',
    kpis: ['suitability'],
    rule: tr('Багцын блокууд байрлах бүсийн тохиромжтой байдлын оноо (блокоор жигнэсэн)'),
    view: 'analysis',
  },
  permit: {
    title: tr('Зөвшөөрөл'), short: tr('Зөвш.'), icon: 'frame',
    kpis: ['permits'],
    rule: tr('Зөвшөөрсөн ÷ бүртгэгдсэн бүх зөвшөөрөл. Татгалзсан зөвшөөрөл — заавал шийдвэрлэх'),
    view: 'zovshoorol',
  },
  hse: {
    title: tr('ХАБЭА'), short: tr('ХАБЭА'), icon: 'shield',
    /* ⚠️ 2026-09-17 (хэрэглэгч): ЗӨВХӨН ажлын байрны үзлэгээр — осол, хүн-цаг ТООЦООНД ОРОХГҮЙ.
       Тиймээс осол (`safety`), хүн·техник (`workforce`) үзүүлэлтийг энд ХОЛБОХГҮЙ. */
    kpis: [],
    rule: tr('Ажлын байрны үзлэгийн нийцлийн хувь: нийцсэн ÷ (нийцсэн + ноцтой + бага зэргийн үл нийцэл). ≥90 ногоон · 70–89 улбар шар · <70 улаан'),
    view: 'habea',
  },
  qual: {
    title: tr('Чанар'), short: tr('Чанар'), icon: 'target',
    kpis: ['qaqc'],
    rule: tr('QAQC баримтын бөглөлт — бүрэн мөр 1, хэсэгчилсэн 0.5, хоосон 0'),
    view: 'qaqc',
  },
});

/* ══════════════ Оноо ══════════════ */

/** Нэг баримт — НЭР ба УТГА тусдаа (2026-09-17: «ямар үзүүлэлт гэдэг ойлгогдохгүй» гэсэн тул) */
export type Fact = { label: string; value: string };

export type DimScore = {
  /** 0–100; хэмжигдэх өгөгдөлгүй бол null */
  score: number | null;
  /** Шошготой баримтууд — «Төлөвлөсөн: 33.4%» */
  facts: Fact[];
  /**
   * ДАТА ХҮЛЭЭГДЭЖ БУЙ — хэмжих хүснэгт/бүртгэл БАЙГАА ч хараахан бөглөгдөөгүй.
   * ⚠️ «—» (энэ багцад хамаарах өгөгдөл огт алга)-аас ЯЛГААТАЙ, 0 оноо ч БИШ:
   *    2026-09-17-нд QAQC нэг ч баримт оруулаагүй багцууд 0 оноо авч «эрсдэлтэй»
   *    гэж харагдсаныг хэрэглэгч залруулав. Нийт дунджид ОРОХГҮЙ.
   */
  pending?: true;
  /**
   * ЗААВАЛ ШИЙДВЭРЛЭХ АСУУДЛУУД — тоо бүрийг нэрлэсэн өгүүлбэр.
   * ⚠️ 2026-09-17 (хэрэглэгч): сонгосон багцад «асуудлын эрэмбээр заавал
   *    шийдвэрлэх асуудлын жагсаалт». Эрэмбэ нь `workIssues`-д.
   */
  issues?: DimIssue[];
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
 * ⚠️ Бусад бүлэг ба нийт оноо 80/50 хэвээр.
 */
export const HSE_GOOD = 90;
export const HSE_WARN = 70;

/** Бүлгийн түвшин — ХАБЭА өөрийн босготой */
export const dimLevel = (d: Dim | null | undefined, v: number | null): Level => (
  d === 'hse'
    ? (v == null ? 'unknown' : v >= HSE_GOOD ? 'good' : v >= HSE_WARN ? 'warn' : 'bad')
    : scoreLevel(v)
);

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
  /** 05-ын хуваарийн хоцрогдол (`collectPkgLags`) — байвал ЗӨВХӨН үүнийг */
  lag: { planned: number; actual: number } | null;
  start: number | null;
  end: number | null;
  /** Cashflow-ийн гүйцэтгэлийн хувь, 0–100 */
  progress: number | null;
  now: number;
};

export function scorePerf(i: PerfInput): DimScore {
  let planned: number | null = null;
  let actual: number | null = null;
  if (i.lag) {
    planned = i.lag.planned;
    actual = i.lag.actual;
  } else if (i.progress != null && i.start != null && i.end != null && i.end > i.start) {
    /* ⚠️ Хуваарийн муруйгүй ажил — эхлэх/дуусах огнооны хооронд ШУГАМААР */
    planned = clamp(((i.now - i.start) / (i.end - i.start)) * 100);
    actual = i.progress;
  }
  if (planned == null || actual == null) return NONE;
  const gap = planned - actual;
  const score = clamp(100 - Math.max(0, gap) * RULE.perfPerPp);
  const tone = toneOf(score);
  return {
    score,
    issues: tone ? [{ tone, text: tr('Хуваариас {0} нэгж хувиар хоцорсон (төлөвлөсөн {1}, бодит {2})', num(gap, 1), pct(planned, 1), pct(actual, 1)) }] : [],
    facts: [
      fact(tr('Төлөвлөсөн гүйцэтгэл'), pct(planned, 1)),
      fact(tr('Бодит гүйцэтгэл'), pct(actual, 1)),
      fact(tr('Хоцрогдол'), gap > 0 ? tr('{0} нэгж хувь', num(gap, 1)) : tr('алга')),
    ],
  };
}

/* ── 2. Санхүүжилт ── */

export type FinInput = {
  contracted: boolean;
  start: number | null;
  now: number;
  /** Урьдчилсан төсөвт өртөг, ₮ */
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
  if (i.contracted) {
    parts.push(100);
    facts.push(fact(tr('Гэрээ'), tr('байгуулсан')));
  } else if (i.start != null && i.start < i.now) {
    /* ⚠️ Эхлэх хугацаа өнгөрсөн атал гэрээгүй — хамгийн том санхүүгийн эрсдэл */
    parts.push(0);
    facts.push(fact(tr('Гэрээ'), tr('эхлэх хугацаа өнгөрсөн, гэрээгүй')));
    issues.push({ tone: 'bad', text: tr('Эхлэх хугацаа өнгөрсөн боловч гэрээ байгуулаагүй') });
  } else {
    facts.push(fact(tr('Гэрээ'), tr('хараахан байгуулаагүй')));
  }
  if (i.contract != null && i.contract > 0 && i.cost > 0) {
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
  const score = meanOf(parts);
  return { score, facts, issues };
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
    const tone = toneOf(score);
    return {
      score,
      facts: [fact(tr('Төслийн газар чөлөөлөлт'), pct(i.landPct, 1))],
      issues: tone ? [{ tone, text: tr('Газар чөлөөлөлт {0} — дуусаагүй', pct(i.landPct, 1)) }] : [],
    };
  }
  if (!i.hasFootprint || i.overlapFailed) return NONE;
  const n = i.overlap ?? 0;
  const score = clamp(100 - n * RULE.landPerParcel);
  /* ⚠️ Давхцал нь ажил эхлүүлэхэд шууд саад — нэг ч байвал анхааруулга */
  const tone = n > 0 ? toneOf(score) ?? 'warn' : null;
  return {
    score,
    issues: tone ? [{ tone, text: tr('Багцын талбайд {0} чөлөөлөгдөөгүй нэгж талбар давхцсан', num(n)) }] : [],
    facts: [fact(tr('Давхцсан чөлөөлөгдөөгүй нэгж талбар'), num(n))],
  };
}

/* ── 4. Ерөнхий төлөвлөгөө ── */

export type PlanInput = {
  /** Блок бүрийн байрлах бүсийн оноо (0–100); блокгүй бол хоосон */
  blockScores: readonly number[];
  /** Норм зөрчсөн бүсийн нэрс */
  failingZones: readonly string[];
};

export function scorePlan(i: PlanInput): DimScore {
  const s = meanOf(i.blockScores);
  if (s == null) return NONE;
  const issues: DimIssue[] = [];
  const tone = toneOf(clamp(s));
  if (tone) issues.push({ tone, text: tr('Блокууд байрлах бүсийн тохиромжтой байдлын оноо {0}', num(s)) });
  if (i.failingZones.length) {
    issues.push({ tone: 'warn', text: tr('Норм зөрчсөн бүс: {0}', i.failingZones.slice(0, 5).join(', ')) });
  }
  return {
    score: clamp(s),
    issues,
    facts: [
      fact(tr('Үнэлсэн блок'), num(i.blockScores.length)),
      fact(tr('Норм зөрчсөн бүс'), i.failingZones.length ? i.failingZones.slice(0, 3).join(', ') : tr('алга')),
    ],
  };
}

/* ── 5. Зөвшөөрөл ── */

export type PermitInput = {
  /** Багцын зөвшөөрлийн төлөвийн тоо (`zovshoorol.summarize`) — бүртгэлгүй бол null */
  counts: { ok: number; wait: number; no: number; unknown: number } | null;
};

/**
 * ⚠️ Оноо = зөвшөөрсөн ÷ нийт × 100 (хүлээгдэж буй, татгалзсан, танигдаагүй нь
 *    «зөвшөөрөгдөөгүй» гэж тоологдоно). Бүртгэлгүй багц → «—» (0 биш).
 * ⚠️ Татгалзсан ганц ч байвал оноо ямар ч байсан ЗААВАЛ шийдвэрлэх асуудал —
 *    ажил эхлүүлэх шийдвэрт шууд нөлөөлнө (`zovshoorol.summarize`-ийн `alert`).
 */
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

/**
 * ⚠️ 2026-09-17 (хэрэглэгч): ХАБЭА-г ЗӨВХӨН ажлын байрны үзлэгээр дүгнэнэ.
 *    Осол ба хүн-цаг тооцоонд ОРОХГҮЙ.
 * ⚠️ Оноо = Σнийцсэн ÷ Σ(нийцсэн + ноцтой + бага зэргийн үл нийцэл) × 100.
 *    «Ажиглалт» ба «Хамааралгүй» нь үл нийцэл БИШ тул хуваарьт орохгүй
 *    (баримт болж харагдана).
 * ⚠️ Үзлэггүй идэвхтэй талбай → «дата хүлээгдэж буй» (0 биш); идэвхгүй → «—».
 */
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
  /* ⚠️ Ноцтой үл нийцэл нь оноо ямар ч байсан ЗААВАЛ шийдвэрлэх асуудал */
  if (major > 0) issues.push({ tone: 'bad', text: tr('Ажлын байрны үзлэгт {0} ноцтой үл нийцэл илэрсэн', num(major)) });
  const lv = dimLevel('hse', score);
  if (lv === 'bad' || lv === 'warn') {
    issues.push({ tone: lv, text: tr('Үзлэгийн нийцэл {0} — {1}%-иас доош', pct(score, 1), HSE_GOOD) });
  }
  return { score, facts, issues };
}

/* ── 7. Чанар ── */

export type QualInput = {
  /** QAQC хүснэгтийн нийлбэр — хүснэгтгүй бол null */
  qaqc: { total: number; empty: number; partial: number } | null;
};

export function scoreQual(i: QualInput): DimScore {
  const q = i.qaqc;
  if (!q || q.total <= 0) return NONE;
  const full = Math.max(0, q.total - q.empty - q.partial);
  const facts = [
    fact(tr('Хяналтын ажлын мөр'), num(q.total)),
    fact(tr('Баримт бүрэн'), num(full)),
    fact(tr('Дутуу'), num(q.partial)),
    fact(tr('Хоосон'), num(q.empty)),
  ];
  /* ⚠️ НЭГ Ч баримт оруулаагүй — «0 оноо» БИШ, дата хүлээгдэж буй (DimScore.pending) */
  if (full === 0 && q.partial === 0) {
    return {
      score: null, facts, pending: true,
      issues: [{ tone: 'info', text: tr('QAQC баримт огт оруулаагүй ({0} ажлын мөр)', num(q.total)) }],
    };
  }
  const score = clamp(((full + q.partial * 0.5) / q.total) * 100);
  const tone = toneOf(score);
  return {
    score, facts,
    issues: tone ? [{ tone, text: tr('{0} ажлын QAQC баримт хоосон, {1} нь дутуу', num(q.empty), num(q.partial)) }] : [],
  };
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
  /** Гэрээний дүн, ₮ — гэрээгүй бол null */
  contract: number | null;
  cancelled: boolean;
  dims: Record<Dim, DimScore>;
  /** Бодогдсон бүлгүүдийн энгийн дундаж */
  total: number | null;
};

export type TypeGroup = {
  type: string;
  works: WorkScore[];
  /** Бүлэг бүрийн дундаж — багцуудын энгийн дундаж */
  dims: Record<Dim, number | null>;
  /** Оноотой ажил алга, гэхдээ дата хүлээгдэж буй ажил бий */
  pending: Record<Dim, boolean>;
  total: number | null;
};

export const totalOf = (dims: Record<Dim, DimScore>): number | null => meanOf(DIMS.map((d) => dims[d].score));

const dimMeans = (works: readonly WorkScore[]): Record<Dim, number | null> => (
  Object.fromEntries(DIMS.map((d) => [d, meanOf(works.map((w) => w.dims[d].score))])) as Record<Dim, number | null>
);

const dimPending = (works: readonly WorkScore[], means: Record<Dim, number | null>): Record<Dim, boolean> => (
  Object.fromEntries(DIMS.map((d) => [d, means[d] == null && works.some((w) => w.dims[d].pending)])) as Record<Dim, boolean>
);

/**
 * Ажлуудыг төрлөөр бүлэглэнэ.
 * ⚠️ Бүлгийн ДАРААЛАЛ нь төсвөөр буурах («Төсөв, гэрээлсэн дүн» чарттай ижил),
 *    бүлэг доторх ажлууд нийт оноогоор ӨСӨХ — хамгийн муу нь эхэнд (удирдлага
 *    «аль нь асуудалтай» гэж хайдаг). Оноогүй ажил хамгийн сүүлд.
 * ⚠️ ХАСАГДСАН ажил (`cancelled`) оноолгохгүй ч жагсаалтаас АЛГА болгохгүй.
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
      return { type, works: sorted, dims, pending: dimPending(live, dims), total: meanOf(live.map((w) => w.total)) };
    })
    .sort((a, b) => cost(b.works) - cost(a.works));
}

/** Төслийн нийт — бүх ажлын бүлэг бүрийн дундаж */
export function projectDims(works: readonly WorkScore[]): { dims: Record<Dim, number | null>; pending: Record<Dim, boolean>; total: number | null } {
  const live = works.filter((w) => !w.cancelled);
  const dims = dimMeans(live);
  return { dims, pending: dimPending(live, dims), total: meanOf(live.map((w) => w.total)) };
}

/* ══════════════ Төлөв ба шүүлт ══════════════ */

/**
 * Ажлын ТӨЛӨВ — нийт оноогоор (80/50). `none` = оноо бодогдоогүй.
 * ⚠️ 2026-09-17 (хэрэглэгч): «эрсдэлтэй · анхааруулга · хэвийн» төлөв бүр
 *    графикаар, дарахад шүүгддэг байх.
 */
export type WorkStatus = 'bad' | 'warn' | 'good' | 'none';
export const STATUSES: readonly WorkStatus[] = ['bad', 'warn', 'good', 'none'];

export const workStatus = (w: WorkScore): WorkStatus => {
  const lv = scoreLevel(w.total);
  return lv === 'bad' || lv === 'warn' || lv === 'good' ? lv : 'none';
};

/** Бүлгийн доторх ажлын төлөв — `pending` нь «дата хүлээгдэж буй» */
export type DimStatus = WorkStatus | 'pending';
export const DIM_STATUSES: readonly DimStatus[] = ['bad', 'warn', 'good', 'pending', 'none'];

export const dimStatus = (w: WorkScore, d: Dim): DimStatus => {
  const sc = w.dims[d];
  if (sc.score == null) return sc.pending ? 'pending' : 'none';
  const lv = dimLevel(d, sc.score);
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
 * ⚠️ Шүүлт идэвхтэй үед ХАСАГДСАН ажил харагдахгүй — тоолуурт ч ордоггүй.
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
 * ⚠️ Эрэмбэ: (1) зэрэг — заавал → анхаарах → дата оруулах; (2) тухайн бүлгийн
 *    оноо ӨСӨХ (хамгийн муу нь эхэнд); (3) `DIMS`-ийн дараалал (тогтвортой).
 */
export function workIssues(w: WorkScore): RankedIssue[] {
  const out: RankedIssue[] = [];
  DIMS.forEach((d) => {
    for (const i of w.dims[d].issues ?? []) out.push({ ...i, dim: d, score: w.dims[d].score });
  });
  return out.sort((a, b) => (
    TONE_RANK[a.tone] - TONE_RANK[b.tone]
    || Number(LOW_PRIORITY.has(a.dim)) - Number(LOW_PRIORITY.has(b.dim))
    || (a.score ?? 101) - (b.score ?? 101)
    || DIMS.indexOf(a.dim) - DIMS.indexOf(b.dim)
  ));
}

/* ══════════════ Орон зай (Ерөнхий төлөвлөгөө) ══════════════ */

/** Цэг олон өнцөгтөд (цагираг бүрээр сондгой/тэгш — нүхийг зөв тооцно) */
export function pointInRings(x: number, y: number, rings: readonly (readonly number[][])[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Олон өнцөгтийн төв (гадна цагирагийн оройн дундаж — блок шиг жижиг хэлбэрт хангалттай) */
export function ringCenter(rings: readonly (readonly number[][])[]): [number, number] | null {
  const r = rings[0];
  if (!r || r.length === 0) return null;
  const pts = r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r;
  const sx = pts.reduce((a, p) => a + p[0], 0);
  const sy = pts.reduce((a, p) => a + p[1], 0);
  return [sx / pts.length, sy / pts.length];
}

/**
 * Багц бүрийн блокууд → тэдгээрийн байрлах бүсийн оноо.
 * ⚠️ Бүс → багцын ЗУРАГЛАЛ репод байхгүй тул (`suitability.ts`-ийн ⚠️) ОРОН
 *    ЗАЙГААР тогтооно: блокийн төв аль бүсийн полигонд орсон бэ. Бүсэд
 *    ороогүй блок тоологдохгүй (null ≠ 0).
 */
export function blockZoneScores(
  zones: readonly { id: string; rings: readonly (readonly number[][])[]; score: number | null; failing: boolean }[],
  blocks: readonly { key: string; rings: readonly (readonly number[][])[] }[],
): Map<string, PlanInput> {
  const out = new Map<string, { blockScores: number[]; failing: Set<string> }>();
  for (const b of blocks) {
    const c = ringCenter(b.rings);
    if (!c || !b.key) continue;
    const z = zones.find((zz) => zz.score != null && pointInRings(c[0], c[1], zz.rings));
    if (!z || z.score == null) continue;
    const e = out.get(b.key) ?? { blockScores: [], failing: new Set<string>() };
    e.blockScores.push(z.score);
    if (z.failing) e.failing.add(z.id);
    out.set(b.key, e);
  }
  return new Map([...out].map(([k, v]) => [k, { blockScores: v.blockScores, failingZones: [...v.failing] }]));
}
