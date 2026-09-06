/**
 * CEO ҮЗҮҮЛЭЛТ — «ХАБЭА: осол, зөрчил».
 *
 * Эх сурвалж: Survey123 ослын бүртгэл (`HABEA.incident`) — ~17 мөрийн жижиг
 * хүснэгт, нэг асуулгаар бүтнээрээ ирнэ.
 *
 * ⚠️ ХОХИРЛЫГ ЭНД ӨӨРӨӨ бодно, `execTriage.loadDamage()`-ийг ДУУДАХГҮЙ — тэр нь
 *    ижил хүснэгтийг ДАХИН татдаг (нэг картад хоёр удаа ArcGIS). Гэхдээ шүүлт
 *    нь `loadDamage`-тэй ЯГ ИЖИЛ дүрэм (`DAMAGE_RE`): төрлийг яг таарцаар биш,
 *    «хохирол» агуулснаар — Survey123-ийн сонголт «Эд хөрөнгийн хохирол» ч,
 *    гараар бичсэн «эд хөрөнгийн хохирол учруулсан» ч алдагдах ёсгүй. Хоёр
 *    газрын regex зөрвөл нүүр самбар ба ХАБЭА хуудас өөр тоо харуулна.
 *
 * ⚠️ ОГНООНЫ НӨӨЦ ЗАМ = `CreationDate` (2026-09-06-ны хяналт): `field_22`
 *    хоосон бол Survey123-ийн `CreationDate`-ыг авна — ХАБЭА хуудас
 *    (`Habea.tsx` `normIncident`: `nn(r[I.ognoo]) || nn(r['CreationDate'])`)
 *    ЯГ ИНГЭЖ огноолдог. Энд өөрөөр хийвэл нэг мөр ХАБЭА-д «2026-08-30»,
 *    нүүр самбарт «—» гарч, «сүүлийн 30 хоногт» хоёр газар өөр тоо болно.
 *    Ажилчдын (`labor`) хүснэгтийн «бөглөж дуусаагүй маягт = өнөөдрийн
 *    CreationDate» занга энд ч ҮЙЛЧИЛНЭ — гэхдээ хуудастай зөрөхөөс нэг
 *    дүрэм илүү; занга илэрвэл ХОЁР газар зэрэг засна.
 *
 * ⚠️ `null` ≠ 0: хоёулаа хоосон бүртгэл нь «сүүлийн 30 хоногт» тоологдохгүй,
 *    `asOf`-д орохгүй, хүснэгтэд «—» гарна — ямар нэг огноо зохиож
 *    орлуулахгүй. Огноо огт байхгүй бол `asOf: null`.
 *
 * ⚠️ Тооцоо (`computeSafety`) нь ЦЭВЭР — сүлжээгүй, `Date.now()`-гүй — тул
 *    `safety.check.mjs` түүнийг шууд импортлон шалгана. `now` нь зөвхөн
 *    ачаалагчийн биед авагдана.
 */
import { t as tr } from '@/lib/i18nCore';
import { cached } from '@/lib/live';
import { queryFeatures, type Row } from '@/lib/query';
import { HABEA } from '@/lib/services';
import { date, num } from '@/lib/format';
import { DMG_BAD_N, incidentLevel, type Level } from '@/lib/kpiLevels';
import { cell, daysBetween, table, worstOf, type Cell, type KpiIssue, type KpiResult } from './kpi';

/* ══════════════ Тогтмол ══════════════ */

/**
 * Хохирлын төрлийн шүүлт — `execTriage.loadDamage`-ийн regex-тэй ИЖИЛ байх ёстой.
 * ⚠️ Нэгийг нь өөрчилбөл нөгөөг нь мөн адил өөрчил.
 */
export const DAMAGE_RE = /хохирол/i;

/**
 * «Сүүлийн үеийн» осол гэж тооцох цонх, хоног.
 * ⚠️ САНАЛ (2026-09-06, CEO самбар): 30 хоног нь удирдлагын сарын тоймын
 *    хэмжээс — тооцоолж гаргасан босго БИШ. Энэ цонхонд орсон осол бүр
 *    `issues`-д улаанаар нэрлэгдэнэ.
 */
export const RECENT_DAYS = 30;

/**
 * Хохирлын түвшин — `execTriage.DMG_BAD_N`-ийн тайлбарын дагуу:
 * 0 → Сайн; 1–2 → Дунд; ≥3 → Яаралтай.
 */
export const damageLevel = (n: number | null): Level =>
  n == null ? 'unknown' : n === 0 ? 'good' : n < DMG_BAD_N ? 'warn' : 'bad';

/* ══════════════ Мөр ══════════════ */

/** Survey123-ийн систем талбар — `field_22` хоосон үеийн огнооны нөөц зам */
export const CREATED_FIELD = 'CreationDate';

/** Ослын нэг бүртгэл — эх талбаруудыг нэрлэсэн, текстийг цэвэрлэсэн */
export type SafetyRow = {
  oid: number | null;
  /**
   * Огноо, epoch ms — `field_22`, хоосон бол `CreationDate`; хоёулаа
   * байхгүй бол null (ХЭЗЭЭ Ч 0 биш)
   */
  ognoo: number | null;
  company: string;
  bagts: string;
  dugaar: string;
  turul: string;
  medeelel: string;
  shaltgaanTurul: string;
  shaltgaan: string;
  argaHemjee: string;
};

const str = (v: unknown): string => (v == null ? '' : String(v).trim());

/** ArcGIS огноо → epoch ms; тоо биш/хоосон/0 бол null */
const toMs = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) && t > 0 ? t : null;
};

/** Эх мөрийг `SafetyRow` болгоно — талбарын нэрс `HABEA.incident.fields`-ээс */
export function toSafetyRow(r: Row): SafetyRow {
  const I = HABEA.incident.fields;
  /* ⚠️ Survey123 давхаргын OID нь жижиг үсгээр `objectid` (Habea.tsx-тэй ижил);
     өөр нэртэй ирвэл ч алдахгүй — зөвхөн тодорхойлоход хэрэглэнэ. */
  const oidRaw = r.objectid ?? r.OBJECTID ?? r.ObjectID ?? null;
  const oid = oidRaw == null ? null : Number(oidRaw);
  return {
    oid: oid != null && Number.isFinite(oid) ? oid : null,
    /* ⚠️ `Habea.tsx` `normIncident`-тэй ИЖИЛ: `nn(ognoo) || nn(CreationDate)` —
       0/хоосон огноог «байхгүй» гэж үзээд `CreationDate` руу унана. */
    ognoo: toMs(r[I.ognoo]) ?? toMs(r[CREATED_FIELD]),
    company: str(r[I.company]),
    bagts: str(r[I.bagts]),
    dugaar: str(r[I.dugaar]),
    turul: str(r[I.turul]),
    medeelel: str(r[I.medeelel]),
    shaltgaanTurul: str(r[I.shaltgaanTurul]),
    shaltgaan: str(r[I.shaltgaan]),
    argaHemjee: str(r[I.argaHemjee]),
  };
}

/* ══════════════ Тооцоо ══════════════ */

export type SafetyAgg = {
  total: number;
  damage: number;
  /** Хамгийн сүүлийн бүртгэлийн огноо (ms) — огноотой мөр байхгүй бол null */
  last: number | null;
  /** `last`-аас хойших хоног — `last` null бол null */
  daysSince: number | null;
  /** Сүүлийн `RECENT_DAYS` хоногт бүртгэгдсэн тоо */
  recent: number;
  byType: { name: string; n: number }[];
  byBagts: { name: string; n: number }[];
  byCompany: { name: string; n: number }[];
};

/** Нэрээр тоолж, буурах эрэмбээр — хоосон нэр `Тодорхойгүй` бүлэгт */
function tally(rows: readonly SafetyRow[], pick: (r: SafetyRow) => string): { name: string; n: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r) || tr('Тодорхойгүй');
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

/** Шинэ нь эхэнд; огноогүй мөр ХАМГИЙН СҮҮЛД (0 гэж тооцохгүй) */
export const newestFirst = (a: SafetyRow, b: SafetyRow): number => {
  if (a.ognoo == null && b.ognoo == null) return 0;
  if (a.ognoo == null) return 1;
  if (b.ognoo == null) return -1;
  return b.ognoo - a.ognoo;
};

export const isDamage = (r: SafetyRow): boolean => DAMAGE_RE.test(r.turul);

export function aggregateSafety(rows: readonly SafetyRow[], now: number): SafetyAgg {
  const dated = rows.map((r) => r.ognoo).filter((x): x is number => x != null);
  const last = dated.length ? Math.max(...dated) : null;
  const since = now - RECENT_DAYS * 86_400_000;
  return {
    total: rows.length,
    damage: rows.filter(isDamage).length,
    last,
    daysSince: last == null ? null : daysBetween(last, now),
    recent: rows.filter((r) => r.ognoo != null && r.ognoo >= since).length,
    byType: tally(rows, (r) => r.turul),
    byBagts: tally(rows, (r) => r.bagts),
    byCompany: tally(rows, (r) => r.company),
  };
}

/** «2026-08-14 · Багц 3 · Гэмтэл — Компани» */
const issueText = (r: SafetyRow): string => {
  const head = [r.ognoo == null ? '—' : date(r.ognoo), r.bagts, r.turul].filter(Boolean).join(' · ');
  return r.company ? `${head} — ${r.company}` : head;
};

/**
 * ЦЭВЭР тооцоо — мөрүүд + «одоо» → картын бүтэн үр дүн.
 * `failedSources` нь хоосон: ганц эх сурвалжтай тул унавал ачаалагч өөрөө шиднэ.
 */
export function computeSafety(rowsIn: readonly SafetyRow[], now: number): KpiResult {
  const rows = [...rowsIn].sort(newestFirst);
  const agg = aggregateSafety(rows, now);
  const since = now - RECENT_DAYS * 86_400_000;

  /* ── Баримт: зөвхөн тоо бүхий богино хэсгүүд ──
     ⚠️ i18n (2026-09-06-ны хяналт): «{0} хохирол» ба «Багц: {0}» нь `en.ts`-д
     АЛЬ ХЭДИЙН байгаа түлхүүрүүд — тэдгээрийг ДАХИН хэрэглэнэ, шинэ хувилбар
     («хохирол {0}», «багц: {0} — {1}») зохиохгүй. Үлдсэн 2 баримт + нэгж +
     2 хүснэгтийн гарчиг нь ШИНЭ түлхүүр — `en.ts`-д орох ёстой
     (`node tools/i18n-extract.mjs` олно). Түлхүүрийн эх текстийг өөрчилбөл
     орчуулга ЧИМЭЭГҮЙ унана (монголоор гарна) — засахдаа `en.ts`-тэй хамт. */
  const facts: string[] = [];
  if (agg.last != null && agg.daysSince != null) {
    facts.push(tr('сүүлийнх {0} хоногийн өмнө ({1})', agg.daysSince, date(agg.last)));
  }
  facts.push(tr('сүүлийн {0} хоногт {1}', RECENT_DAYS, agg.recent));
  facts.push(tr('{0} хохирол', agg.damage));
  const topBagts = agg.byBagts[0];
  if (topBagts) facts.push(tr('Багц: {0}', `${topBagts.name} — ${topBagts.n}`));

  /* ── Түвшин ── */
  const level = worstOf([incidentLevel(agg.total), damageLevel(agg.damage)]);

  /* ── Хүснэгтүүд: бүх бүртгэл нэрээр нь, дараа нь төрөл/багцын задаргаа ── */
  const all: Cell[][] = rows.map((r) => [
    cell(r.ognoo == null ? null : date(r.ognoo)),
    cell(r.turul || null),
    cell(r.bagts || null),
    cell(r.company || null),
    cell(r.medeelel || null),
    cell(r.shaltgaan || r.shaltgaanTurul || null),
    cell(r.argaHemjee || null),
  ]);
  const tables = [
    table(
      tr('Бүх бүртгэл'),
      [tr('Огноо'), tr('Төрөл'), tr('Багц'), tr('Компани'), tr('Мэдээлэл'), tr('Шалтгаан'), tr('Арга хэмжээ')],
      all,
    ),
    table(tr('Төрлөөр'), [tr('Төрөл'), tr('Тоо')], agg.byType.map((g) => [cell(g.name), cell(g.n, 'count')])),
    table(tr('Багцаар'), [tr('Багц'), tr('Тоо')], agg.byBagts.map((g) => [cell(g.name), cell(g.n, 'count')])),
  ];

  /* ── Анхааруулга: сүүлийн 30 хоногийнх улаан; түүнээс хуучин хохирол шар ── */
  const issues: KpiIssue[] = [];
  for (const r of rows) {
    const recent = r.ognoo != null && r.ognoo >= since;
    if (recent) issues.push({ text: issueText(r), tone: 'bad' });
    else if (isDamage(r)) issues.push({ text: issueText(r), tone: 'warn' });
  }

  return {
    value: num(agg.total),
    unit: tr('осол, зөрчил бүртгэгдсэн'),
    facts,
    level,
    tables,
    issues,
    asOf: agg.last,
    failedSources: [],
  };
}

/* ══════════════ Ачаалагч ══════════════ */

/**
 * ⚠️ Ганц эх сурвалж: уншигдахгүй бол ШИДНЭ (хэсэгчилсэн уналт байхгүй) —
 *    `cached` унасан амлалтыг кэшлэхгүй тул дараагийн дуудалт дахин оролдоно.
 *    `HABEA` тагаар Survey123 руу бичсэн код `invalidate('HABEA')` дуудахад
 *    энэ кэш хаягдана.
 */
export const loadSafetyKpi = cached(async (): Promise<KpiResult> => {
  const I = HABEA.incident.fields;
  const raw = await queryFeatures(HABEA.incident.url, {
    /* ⚠️ `CreationDate` заавал — огноогүй мөрийн нөөц зам (толгойн тайлбар) */
    outFields: [...Object.values(I), 'objectid', CREATED_FIELD],
    orderBy: `${I.ognoo} DESC`,
  });
  const now = Date.now();
  return computeSafety(raw.map(toSafetyRow), now);
}, 5 * 60_000, ['HABEA']);
