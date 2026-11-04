/**
 * НИЙТИЙН ВЭБИЙН ХҮСНЭГТҮҮД — ЦЭВЭР ТООЦООЛОЛ (2026-11-03).
 *
 * selbecity.mn-д өгөх 6 хүснэгтийн мөрүүдийг системийн ИЖИЛ эхээс бодно (өөр томьёо БИШ):
 *   · явц — «Төсөл төлөвлөгөө биелэлт» (`computePlan`): төслийн нийт = үндэс мөрийн S, барилга угсралт = тэр үе
 *     шатны S, багц/блок = модны мөр; инженерийн багц — бөглөх хуудасны бүлэг (gun 1);
 *   · санхүү — үндэс мөрийн E (урьдчилсан төсөвт өртөг), 4 эх үүсвэр (`sourceSums`), HO-ийн олгосон (`sumPaid`);
 *   · хүн хүч — ХАБЭА маягтын сүүлийн өдөр (`groupDays`), компани бүр + нийт;
 *   · газар — нэгж талбарын тоо/чөлөөлсөн (`landCountMap`, `loadLandStatus`);
 *   · нийгэм — модны «Нийгмийн дэд бүтэц» хэсгийн хүүхдүүд; эх үүсвэр — `SOURCE_FS`.
 * Хэрэглэгчийн дүрэм: хэмжилтгүй явц = 0 (null биш); архивгүй — мөр дарж бичигдэнэ; `tolov` талбар байхгүй.
 */
import type { ProjectPlan } from '@/lib/projectPlanInputs';
import { moneySums, sourceSums, type PlanNode, type PlanValues } from '@/lib/projectPlan';
import type { WorkforceDay } from '@/lib/ceo/workforce';
import type { LandStatus } from '@/lib/land';
import { HABEA, SOURCE_FS, buildingKey, pkgKeyOf } from '@/lib/services';

export type PubVal = string | number | null;
export type PubRow = Record<string, PubVal>;
export type PublicTables = {
  hunHuch: PubRow[];
  sanhuu: PubRow[];
  guitsetgel: PubRow[];
  gazar: PubRow[];
  niigem: PubRow[];
  ehUusver: PubRow[];
};

/** Мөрийн ТҮЛХҮҮР талбарууд — upsert (`sanhuu` нэг мөр: түлхүүргүй) */
export const PUBLIC_KEYS: Record<keyof PublicTables, readonly string[]> = {
  hunHuch: ['bagts_kod', 'guitsetgegch_ner'],
  sanhuu: [],
  guitsetgel: ['kod'],
  gazar: ['bagts_kod'],
  niigem: ['bagts_kod', 'ner'],
  ehUusver: ['turul', 'ner'],
};

/** Төсөл бүхэлдээ / нийт мөрийн код */
export const PUB_TOTAL = '00';
/** «Барилга угсралт» үе шатны мөрийн код — ТТБ-ийн 6-р мөр */
export const PUB_BUILD = '06';

/** «Багц -3.1» · «Багц 4-1» · «БАГЦ-7.1» → «3.1» · «4.1» · «7.1»; хоосон → '' */
export function pubPkgCode(v: unknown): string {
  const s = String(v ?? '').replace(/​/g, '').trim();
  if (!s) return '';
  const body = s.replace(/^\s*багц\s*[-–—]?\s*/i, '').trim();
  return body.replace(/\s+/g, '').replace(/(\d)[-–—](\d)/g, '$1.$2');
}

/** Хэмжилтгүй явц = 0 (хэрэглэгчийн дүрэм); 0–100, 2 орон */
const pct = (v: number | null | undefined): number => (v == null || !Number.isFinite(v) ? 0 : Math.round(v * 100) / 100);
const numOr = (v: unknown, d: number | null = null): number | null => {
  if (v == null || v === '') return d;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/​/g, '').replace(/[%\s]/g, '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : d;
};
const ms = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : v);
const txt = (v: unknown): string => String(v ?? '').replace(/​/g, '').replace(/\s+/g, ' ').trim();

/* ══════════════ 1. Хүн хүч ══════════════ */

/**
 * ХАБЭА маягтад багц заагдаагүй гүйцэтгэгчид — гэрээний хүснэгтээс (2026-11-03, амьд): ОСНААУГ 5.1+5.2,
 * Смарткрафт 6.1+6.7, Эм Эм Эс 6.2+6.4, ГУББ 7.1. ЧХО — гэрээнд байхгүй → багцгүй.
 */
export const PUB_LABOR_BAGTS: Readonly<Record<string, string>> = {
  OSNAAG: '5.1+5.2', SC: '6.1+6.7', MMSE: '6.2+6.4', GUBB: '7.1',
};

export function hunHuchRows(day: WorkforceDay | null, companies: readonly { sfx: string; label: string; bagts: string | null }[] = HABEA.labor.companies): PubRow[] {
  if (!day) return [];
  const out: PubRow[] = [];
  let mongol: number | null = null, gadaad: number | null = null;
  for (const c of companies) {
    const x = day.comp[c.sfx];
    if (!x) continue;
    if (x.mongol != null) mongol = (mongol ?? 0) + x.mongol;
    if (x.gadaad != null) gadaad = (gadaad ?? 0) + x.gadaad;
    out.push({
      bagts_kod: PUB_LABOR_BAGTS[c.sfx] ?? (pubPkgCode(x.bagts ?? c.bagts) || null),
      guitsetgegch_ner: c.label,
      burtgel_ognoo: day.at,
      mongol_ajiltan_too: x.mongol,
      gadaad_ajiltan_too: x.gadaad,
      niit_ajiltan_too: x.workers,
      tehnik_too: x.technik,
      hun_tsag: null,
    });
  }
  out.push({
    bagts_kod: PUB_TOTAL,
    guitsetgegch_ner: 'Нийт',
    burtgel_ognoo: day.at,
    mongol_ajiltan_too: mongol,
    gadaad_ajiltan_too: gadaad,
    niit_ajiltan_too: day.workers,
    tehnik_too: day.technik,
    hun_tsag: day.header.manHours,
  });
  return out;
}

/* ══════════════ 2. Санхүү ══════════════ */

/** Төслийн нийт төсөв = үндэс мөрийн E; олгосон = HO бүх төлбөр (урьдчилгаа + гүйцэтгэл); хувь = олгосон ÷ E */
export function sanhuuRows(plan: ProjectPlan): PubRow[] {
  const root = plan.tree.root;
  const E = plan.result.values.get(root)?.E ?? null;
  const src = sourceSums(plan.tree).get(root);
  /* 2026-11-04: «Төсөл төлөвлөгөө биелэлт»-ийн `olgoson_dun` нийлбэр — бүх хуудастай нэг тоо */
  const paid = moneySums(plan.tree).get(root)?.paid ?? null;
  return [{
    niit_tosov_dun: E,
    tosov_unet_tsaas: src?.zahiramj_unet_tsaas ?? null,
    tosov_tosliin_orlogo: src?.zahiramj_borluulalt_dun ?? null,
    tosov_niislel_tosov: src?.zahiramj_niislel_tusuv ?? null,
    tosov_nzd_nuuts: src?.zahiramj_nzd_nuuts ?? null,
    olgoson_sanhuujilt_dun: paid,
    olgoson_huvi: E && paid != null ? Math.round((paid / E) * 1000) / 10 : null,
  }];
}

/* ══════════════ 3. Явц ══════════════ */

export type PubBuilding = { ail: number | null; davhar: number | null };
/** Инженерийн багцын бөглөх хуудасны БҮЛЭГ (gun 1) — сүүлийн агшин */
export type PubGroup = { no: string; name: string; pct: number | null; start: number | null; end: number | null };
export type GuitsetgelInputs = {
  /** `buildingKey` → айл/давхар (барилгын давхарга) */
  buildings: ReadonlyMap<string, PubBuilding>;
  /** `pkgKeyOf(bagts)` → гүйцэтгэгч (HO гэрээ) */
  contractors: ReadonlyMap<string, string>;
  /** `pubPkgCode` → бүлгүүд (инженерийн багц) */
  groups: ReadonlyMap<string, readonly PubGroup[]>;
};

const bagtsOf = (n: PlanNode): string => String(n.row?.bagts ?? '').trim();
/**
 * БАГЦЫН мөр — өөрөө багцтай, эцэг нь багцгүй; «Барилга угсралт ажил» хэсэг дотор (`sub === 'barilga'`).
 * «Бэлтгэл ажил» (5.1.x) хэсэгт ижил багцын мөрүүд давхар байдаг — тэдгээр ОРОХГҮЙ (давхар код, давхар айл).
 */
export const isPkgNode = (n: PlanNode): boolean =>
  n.phase === 'barilga' && n.sub === 'barilga' && !n.blok && !!bagtsOf(n) && !(n.parent && bagtsOf(n.parent));

const span = (v: PlanValues | undefined, a: keyof PlanValues, b: keyof PlanValues): [number | null, number | null] =>
  [ms(v?.[a] as number | null), ms(v?.[b] as number | null)];
const has = (d: [number | null, number | null]) => d[0] != null || d[1] != null;
/** Гэрээний (H/I) огноо, байхгүй бол гүйцэтгэгчийн төлөвлөгөөт (L/M) — төсөл · үе шат · багц */
const contractDates = (v: PlanValues | undefined): [number | null, number | null] => (has(span(v, 'H', 'I')) ? span(v, 'H', 'I') : span(v, 'L', 'M'));
/** Гүйцэтгэгчийн төлөвлөгөөт (L/M, Хуваариас), байхгүй бол гэрээний — блок */
const blockDates = (v: PlanValues | undefined): [number | null, number | null] => (has(span(v, 'L', 'M')) ? span(v, 'L', 'M') : span(v, 'H', 'I'));

export function guitsetgelRows(plan: ProjectPlan, inp: GuitsetgelInputs): PubRow[] {
  const { tree, result } = plan;
  const out: PubRow[] = [];
  const row = (p: {
    kod: string; etseg: string | null; tuvshin: string; ner: string; guits?: string | null;
    pct: number | null | undefined; dates: [number | null, number | null]; ail?: number | null; davhar?: number | null;
  }): PubRow => ({
    kod: p.kod, etseg_kod: p.etseg, tuvshin: p.tuvshin, ner: p.ner, guitsetgegch_ner: p.guits ?? null,
    guitsetgel_huvi: pct(p.pct), ehleh_ognoo: p.dates[0], duusah_ognoo: p.dates[1],
    ail_too: p.ail ?? null, davhar: p.davhar ?? null,
  });

  const rootV = result.values.get(tree.root);
  let ailTotal: number | null = null;
  const pkgRows: PubRow[] = [];

  const build = tree.root.children.find((c) => c.phase === 'barilga') ?? null;
  const seen = new Set<string>();
  for (const n of tree.nodes) {
    if (!isPkgNode(n)) continue;
    const bagts = bagtsOf(n);
    const code = pubPkgCode(bagts);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const key = pkgKeyOf(bagts);
    const v = result.values.get(n);
    const blocks = n.children.filter((c) => !!c.blok);
    let ail: number | null = null;
    const blockRows: PubRow[] = [];
    for (const b of blocks) {
      const bv = result.values.get(b);
      const bld = inp.buildings.get(buildingKey(bagts, b.blok!)) ?? null;
      if (bld?.ail != null) ail = (ail ?? 0) + bld.ail;
      blockRows.push(row({
        kod: `${code}-${b.blok}`, etseg: code, tuvshin: 'blok', ner: b.blok!, pct: bv?.S,
        dates: blockDates(bv), ail: bld?.ail ?? null, davhar: bld?.davhar ?? null,
      }));
    }
    if (ail != null) ailTotal = (ailTotal ?? 0) + ail;
    pkgRows.push(row({
      kod: code, etseg: PUB_BUILD, tuvshin: 'bagts', ner: txt(n.row?.ajil_uilchilgee) || bagts,
      guits: inp.contractors.get(key) ?? null, pct: v?.S, dates: contractDates(v), ail,
    }));
    pkgRows.push(...blockRows);
    if (!blocks.length) {
      for (const g of inp.groups.get(code) ?? []) {
        pkgRows.push(row({ kod: `${code}-G${g.no}`, etseg: code, tuvshin: 'buleg', ner: g.name, pct: g.pct, dates: [g.start, g.end] }));
      }
    }
  }

  out.push(row({ kod: PUB_TOTAL, etseg: null, tuvshin: 'tosol', ner: 'Төслийн нийт', pct: rootV?.S, dates: contractDates(rootV), ail: ailTotal }));
  if (build) {
    const bv = result.values.get(build);
    out.push(row({ kod: PUB_BUILD, etseg: PUB_TOTAL, tuvshin: 'shat', ner: txt(build.row?.ajil_uilchilgee) || 'Барилга угсралт', pct: bv?.S, dates: contractDates(bv), ail: ailTotal }));
  }
  out.push(...pkgRows);
  return out;
}

/* ══════════════ 4. Газар чөлөөлөлт ══════════════ */

export function gazarRows(
  status: LandStatus | null,
  perPkg: ReadonlyMap<string, { total: number; cleared: number }>,
  codeOfKey: (pkgKey: string) => string,
): PubRow[] {
  const out: PubRow[] = [];
  const r = (code: string, total: number, cleared: number): PubRow => ({
    bagts_kod: code, niit_negj_talbar_too: total, choloolson_too: cleared,
    choloolson_huvi: total > 0 ? Math.round((cleared / total) * 1000) / 10 : 0,
  });
  if (status) out.push(r(PUB_TOTAL, status.total, status.resolved));
  for (const [k, c] of perPkg) {
    const code = codeOfKey(k);
    if (code) out.push(r(code, c.total, c.cleared));
  }
  return out;
}

/* ══════════════ 5. Нийгмийн дэд бүтэц ══════════════ */

export const niigemType = (name: string): string => {
  const s = name.toLowerCase();
  if (s.includes('сургууль')) return 'сургууль';
  if (s.includes('цэцэрлэг')) return 'цэцэрлэг';
  if (s.includes('эмнэлэг')) return 'эмнэлэг';
  if (s.includes('цагдаа')) return 'цагдаа';
  return 'бусад';
};
/** «1,560 хүүхдийн сургууль» → 1560; тоогүй бол null */
export const niigemCapacity = (name: string): number | null => {
  const m = /(\d[\d,\s]*)\s*хүүхд/i.exec(name);
  return m ? numOr(m[1]) : null;
};

export function niigemRows(plan: ProjectPlan): PubRow[] {
  const sect = plan.tree.nodes.find((n) => /нийгмийн дэд бүтэц/i.test(txt(n.row?.ajil_uilchilgee)) && n.children.length > 0);
  if (!sect) return [];
  return sect.children.map((n) => {
    const v = plan.result.values.get(n);
    const name = txt(n.row?.ajil_uilchilgee);
    const d = contractDates(v);
    return {
      bagts_kod: pubPkgCode(n.row?.bagts) || null, ner: name, turul: niigemType(name), huchin_chadal: niigemCapacity(name),
      guitsetgel_huvi: pct(v?.S), ehleh_ognoo: d[0], duusah_ognoo: d[1],
    };
  });
}

/* ══════════════ 6. Эх үүсвэр ══════════════ */

export const ehUusverType = (v: unknown): string => {
  const s = txt(v).toLowerCase();
  if (s.includes('дулаан')) return 'дулаан';
  if (s.includes('ус')) return 'ус';
  if (s.includes('цахилгаан')) return 'цахилгаан';
  return s || 'бусад';
};
export const ehUusverState = (name: string): string | null => {
  const s = name.toLowerCase();
  if (s.startsWith('одоо байгаа')) return 'одоо байгаа';
  if (s.startsWith('баригдаж буй')) return 'баригдаж буй';
  if (s.startsWith('шинээр')) return 'шинээр барих';
  return null;
};

export function ehUusverRows(rows: readonly Record<string, unknown>[]): PubRow[] {
  const F = SOURCE_FS.fields;
  return rows.map((r) => {
    const name = txt(r[F.name]);
    const turul = ehUusverType(r[F.type]);
    return {
      turul, ner: name, tolov: ehUusverState(name),
      niit_chadal: numOr(r[F.total]), negj: turul === 'ус' ? 'м³/хоног' : 'МВт', hangah_huvi: numOr(r[F.share]),
    };
  }).filter((r) => r.ner);
}
