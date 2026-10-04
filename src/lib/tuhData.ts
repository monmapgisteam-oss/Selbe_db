/**
 * ТУХ (ТӨСЛИЙН УДИРДЛАГЫН ХЭСЭГ) — БАГЦЫН ХЯНАЛТЫН САМБАРЫН ӨГӨГДӨЛ.
 *
 * ⚠️ ЯАГААД ЭНЭ ФАЙЛ (2026-09-30, хэрэглэгчийн заавар): «ТУХ» харагдац нь
 *    `docs/jishee/Selbe City Packages.html` жишээний БҮТЦИЙГ системийн загвараар
 *    дууриана. Жишээний тоо БҮГД хатуу бичигдсэн (JSON) — энд НЭГ Ч тоо зохиохгүй.
 *    Тоо бүр системийн байгаа ачаалагчаас (`loadFinData`, `loadPlanCurve`,
 *    `loadGdashCf`/`loadCfPlan`, `HO_IPC`, «Хуваарь»-ийн бөглөх хуудас) гарна.
 *
 * ⚠️ ШИНЭ ТООЦОО нь ЗӨВХӨН доорх цэвэр функцууд бөгөөд `tuhData.check.mjs`-ээр
 *    шалгагдана: багцын бүлэг (`groupOf`), төлөв (`statusOf`), 7 хоногийн ахиц
 *    (`weekDelta`), гэрээний сарын төлөвлөгөөний хуримтлал (`cfPlanPctAt`),
 *    EV/PV/SPI (`earned`), хуваарийн мөрийн муж (`rowSpan`); 2026-09-30-нөөс: түлхүүрийн
 *    эзэн мөр (`keyOwners`/`assignHo`), комиссын огнооны нэгтгэл (`mergeCommission`),
 *    хэмжилтийн өдөр (`measDayOf`); 2026-10-01-нөөс: хайлт (`searchNorm`/`matchesSearch`),
 *    хоцорсон эхэнд (`lateFirst`), зураг төслийн гүйцэтгэл (`designPctOf`), хянагдаж буй
 *    IPC (`pendingAutoOf`), комиссын агшин (`pickCommission`), сүүлийн тайлан
 *    (`lastReportOf`/`reportAge`), өвлийн он (`heatWinterYear`), хуудасны кэш (`keyedCache`).
 *
 * ⚠️ `null` ≠ 0 (06 §2): хэмжигдээгүй, бөглөөгүй утга ХООСОН үлдэнэ — дэлгэц
 *    дээр «—». Хувь БҮГД 0–100 (`pct()` 100-аар үржүүлдэггүй).
 *
 * ⚠️ ЭХ СУРВАЛЖГҮЙ ХЭСЭГ (материалын 3-6-9, ТУХ-ын арга хэмжээ, журам, асуудал,
 *    зураг, BIM, дулаан авах блок, 7 хоногийн төлөвлөгөө/PPC, багц хоорондын
 *    уялдаа) энд ОГТ БАЙХГҮЙ — харагдац нь бүтцээ хадгалаад хоосон харуулна
 *    (хэрэглэгчийн сонголт, 2026-09-30).
 */
import { t as tr } from '@/lib/i18nCore';
import { monthKey, dayKey } from '@/lib/format';
import {
  CASHFLOW_NEW, HO_IPC, PKG_FAMILY_BY_BAGTS, bagtsKey, blockKey, hoAmount, pkgKeyOf,
} from '@/lib/services';
import { finXlChartCat, FIN_XL_TOTAL_CODE_FIELD } from '@/lib/finExcelLayout';
import type { CfPlanRow } from '@/lib/gdash';
import type { HoContract } from '@/lib/ipc';
/* ⚠️ 2026-10-01: ЗӨВХӨН УНШИНА — AUTO IPC мөрийг таних (`isAuto`, `autoDay`) ба
   гүйцэтгэлийн үнэлгээ (`guits_une`). Хоёулаа цэвэр модуль (сүлжээгүй). */
import { autoDay, dayOf, isAuto } from '@/lib/ipcAuto';
import { LINK_FIELDS } from '@/lib/ipcLink';
import { hoPkgKey } from '@/lib/pkgAlias';

type Row = Record<string, unknown>;

/* ══════════════════════ БҮЛЭГ ══════════════════════ */

/**
 * Жишээ HTML-ийн 8 бүлэг — ДАРААЛАЛ нь шүүлтүүрийн дараалал.
 * ⚠️ Нэр нь `label()` — хэл солиход шинэчлэгдэнэ (модулийн түвшинд `tr()` бүү дууд).
 */
export type TuhGroup = 'housing' | 'networks' | 'energy' | 'heat' | 'external' | 'social' | 'other' | 'design';
export const TUH_GROUPS: { key: TuhGroup; label: () => string }[] = [
  { key: 'housing', label: () => tr('Орон сууц') },
  { key: 'networks', label: () => tr('Инженерийн шугам сүлжээ') },
  { key: 'energy', label: () => tr('Эрчим хүч, холбоо') },
  { key: 'heat', label: () => tr('Дулааны эх үүсвэр') },
  { key: 'external', label: () => tr('Өндөржилт, гадна тохижилт') },
  { key: 'social', label: () => tr('Нийгмийн дэд бүтэц') },
  { key: 'other', label: () => tr('Бусад, нэмэлт ажил') },
  { key: 'design', label: () => tr('Зураг төсөл') },
];
export const groupLabel = (g: TuhGroup): string => TUH_GROUPS.find((x) => x.key === g)?.label() ?? g;

/** Орон сууцны 7 багц — `gdash.HOUSING_PKGS`-тэй ИЖИЛ түлхүүр (`bagtsKey`) */
export const TUH_HOUSING: readonly string[] = [
  'БАГЦ1', 'БАГЦ2', 'БАГЦ31', 'БАГЦ32', 'БАГЦ33', 'БАГЦ41', 'БАГЦ42',
];

const s = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Гэрээний мөрийн бүлэг.
 *
 * ⚠️ ДҮРЭМ (эх нь CASHFLOW_NEW-ийн шатлал, НЭРЭЭР биш КОДООР аль болох):
 *   1. Хэсгийн код `7` (бондын хүү) — ажил биш, ОРОХГҮЙ (`null`).
 *   2. Хэсгийн код `1` — ТЭЗҮ, зураг төсөл → `design`.
 *   3. Хэсгийн код `6` — газар чөлөөлөлт, цэвэрлэгээ → `other`.
 *   4. Хэсгийн код `5` эсвэл чартын ангилал «НИЙГМИЙН…» → `social`.
 *   5. «ОРОН СУУЦНЫ ХОРООЛОЛ»: орон сууцны 7 багц → `housing`, бусад
 *      (жишээ нь «БАГЦ 1- 4» нийлбэр мөр) → `other`.
 *   6. «ГАДНА ТОХИЖИЛТ, ӨНДӨРЖИЛТ» → `external`.
 *   7. «ИНЖЕНЕРИЙН ДЭД БҮТЭЦ» — газрын зургийн давхаргын гэр бүл pow/com →
 *      energy; эс бөгөөс 3-р түвшний нэр ба ажлын нэрээр (цахилгаан/холбоо/кВ →
 *      energy, дулааны станц/эх үүсвэр → heat, авто зам → other, бусад →
 *      networks).
 *   ⚠️ Гэр бүл `src` («эх үүсвэр») нь УС хангамжийн эх үүсвэрийг (Багц 10–15) ч
 *      агуулдаг (амьдаар шалгав, 2026-09-30) — түүгээр «Дулааны эх үүсвэр» гэж
 *      ангилбал усан сан, насос станц дулаанд орно. Тиймээс дулааныг НЭРЭЭР л.
 */
export function groupOf(row: Row): TuhGroup | null {
  const code = s(row[FIN_XL_TOTAL_CODE_FIELD]);
  if (code === '7') return null;
  if (code === '1') return 'design';
  if (code === '6') return 'other';
  const cat = s(finXlChartCat(row)).toUpperCase();
  if (code === '5' || cat.startsWith('НИЙГМИЙН')) return 'social';
  const key = pkgKeyOf(row[CASHFLOW_NEW.fields.pkg]);
  if (cat.startsWith('ОРОН СУУЦ')) return TUH_HOUSING.includes(key) ? 'housing' : 'other';
  if (cat.startsWith('ГАДНА ТОХИЖИЛТ')) return 'external';
  if (cat.startsWith('ИНЖЕНЕРИЙН')) {
    const fam = key ? PKG_FAMILY_BY_BAGTS[key] : undefined;
    if (fam === 'pow' || fam === 'com') return 'energy';
    const lvl3 = s(row.ajil_tuvshin3).toLowerCase();
    const name = s(row[CASHFLOW_NEW.fields.detail]).toLowerCase();
    if (/авто зам/.test(lvl3) || /авто зам/.test(name)) return 'other';
    if (/цахилгаан|холбоо/.test(lvl3) || (/кв|станц/.test(name) && !/дулаан/.test(name))) return 'energy';
    if (/дулааны станц|дулааны эх үүсвэр|дулаан хангамжийн эх/.test(name)) return 'heat';
    return 'networks';
  }
  return 'other';
}

/* ══════════════════════ БАГЦ ══════════════════════ */

/**
 * Багцын төлөв — жишээний 6 төлөв + «Мэдээлэлгүй».
 * ⚠️ `stopped` эх сурвалжгүй тул ХЭЗЭЭ Ч оноогдохгүй (тайлбарт л).
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): `unknown` — гүйцэтгэлийн эх сурвалж нь ХООСОН
 *    зураг төслийн мөр (`statusOf`-ийн `nullAs`). Урьд нь бүгд «Эхлээгүй» гэж харагддаг байв.
 */
export type TuhStatus = 'done' | 'run' | 'late' | 'todo' | 'unknown' | 'stopped' | 'none';
export const TUH_STATUS: { key: TuhStatus; icon: string; label: () => string; tone: 'good' | 'warn' | 'bad' | 'mute' }[] = [
  { key: 'done', icon: '✓', label: () => tr('Дууссан'), tone: 'good' },
  { key: 'run', icon: '●', label: () => tr('Хийгдэж байна'), tone: 'good' },
  { key: 'late', icon: '▲', label: () => tr('Хоцорсон'), tone: 'warn' },
  { key: 'todo', icon: '◌', label: () => tr('Эхлээгүй'), tone: 'bad' },
  { key: 'unknown', icon: '?', label: () => tr('Мэдээлэлгүй'), tone: 'mute' },
  { key: 'stopped', icon: '■', label: () => tr('Зогссон'), tone: 'bad' },
  { key: 'none', icon: '○', label: () => tr('Гэрээлээгүй'), tone: 'mute' },
];
export const statusMeta = (k: TuhStatus) => TUH_STATUS.find((x) => x.key === k) ?? TUH_STATUS[TUH_STATUS.length - 1];

/** Хоцорсонд тооцох зөрүү (pp) — `execReport.LATE_GAP`, `lagLevel`-ийн шар босготой ИЖИЛ */
export const TUH_LATE_GAP = 5;

/**
 * Багцын төлөв.
 *
 * ⚠️ ДҮРЭМ (хэрэглэгчтэй тохирсон, 2026-09-30):
 *   · Гэрээлээгүй — «Гэрээлсэн дүн» тэмдэглэгээтэй гэрээ алга;
 *   · Дууссан — гүйцэтгэл ≥ 100;
 *   · Эхлээгүй — гэрээтэй, гүйцэтгэл 0 эсвэл хэмжигдээгүй;
 *   · Хоцорсон — гүйцэтгэгчийн төлөвлөгөөнөөс ≥ 5 pp хоцорсон;
 *   · бусад — Хийгдэж байна.
 * ⚠️ «Зогссон» — системд эх сурвалжгүй, ОНООХГҮЙ.
 * ⚠️ 2026-10-01: `nullAs` — хэмжигдээгүй (`null`) гүйцэтгэлийг юу гэж үзэх. Анхдагч нь дээрх
 *    тохиролцсон «Эхлээгүй»; зураг төслийн мөр `'unknown'` дамжуулна (эх сурвалж нь
 *    ТЭЗҮ/зураг төслийн шатны талбар — хоосон бол «мэдэхгүй», эхлээгүй гэсэн ҮГ БИШ).
 *    Жинхэнэ 0 нь хэмжилт тул «Эхлээгүй» хэвээр.
 */
export function statusOf(p: { contracted: boolean; progress: number | null; gap: number | null; nullAs?: 'todo' | 'unknown' }): TuhStatus {
  if (!p.contracted) return 'none';
  if (p.progress != null && p.progress >= 100) return 'done';
  if (p.progress == null) return p.nullAs ?? 'todo';
  if (p.progress <= 0) return 'todo';
  if (p.gap != null && p.gap >= TUH_LATE_GAP) return 'late';
  return 'run';
}

/**
 * Картуудын анхдагч эрэмбэ — «Хоцорсон» ЭХЭНД, бусад нь өөрийн (бүлэг · кодын) дарааллаар.
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): хоцорсон багц жагсаалтын дунд төөрдөг байв.
 *    Тогтвортой (stable) эрэмбэ — ижил төлөвтэй мөрүүдийн дараалал хөдлөхгүй.
 */
export function lateFirst<T extends { status: TuhStatus }>(rows: readonly T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (Number(b.r.status === 'late') - Number(a.r.status === 'late')) || a.i - b.i)
    .map((x) => x.r);
}

export type TuhPkg = {
  /** `pkgKeyOf(bagts)`; диапазон/хоосон бол `cf:<OBJECTID>`; зураг төсөл бол `d:<OBJECTID>` */
  key: string;
  /** Багцын түлхүүр (`bagtsKey`) — газрын зураг, IPC, хуваарьтай холбоно. Диапазон мөрд `''` */
  pkgKey: string;
  /** Дэлгэцийн код — «БАГЦ-5.1» (түүхий бичиглэл) */
  code: string;
  /** Ажлын бүтэн нэр (`ajil_uilchilgee`) */
  name: string;
  group: TuhGroup;
  rows: Row[];
  /** Σ ХО дүн (гэрээ), ₮ — бүгд хоосон бол `null` */
  cost: number | null;
  /** «Гэрээлсэн дүн» тэмдэглэгээтэй мөр бий */
  contracted: boolean;
  contractor: string;
  client: string;
  contractNo: string;
  /** Гэрээт эхлэх/дуусах — мөрүүдийн MIN/MAX (мс) */
  start: number | null;
  end: number | null;
  /** Сарын төлөвлөгөөний `Cashflow_ID`-ууд */
  cfIds: number[];
  /** Захирамжийн дугаар/огноо — «Журам → Захирамж» ангилалд */
  orders: { no: string; date: number | null }[];
};

const numOf = (v: unknown): number | null => {
  if (v == null || String(v).trim() === '') return null;
  const x = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(x) ? x : null;
};
const dateOf = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(x) && x > 0 ? x : null;
};
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

/**
 * ГЭРЭЭНИЙ МӨРҮҮД → ТУХ-ын багцууд.
 *
 * ⚠️ Нэг багцад (ижил `pkgKeyOf`, ижил бүлэг) олон гэрээ байж болно — НЭГТГЭНЭ
 *    (дүн нийлбэр, огноо MIN/MAX). Зураг төслийн мөр бүр ТУСДАА: нэг кодтой
 *    барилгын гэрээтэй («Багц 7.1» ТЭЗҮ ба «БАГЦ-7.1» барилга) нийлбэл мөнгө холилдоно.
 * ⚠️ Диапазон/хоосон кодтой мөр («БАГЦ 1-4») ТУСДАА багц — аль нэг багцад наалдахгүй
 *    (`pkgKeyOf`-ийн ⚠️).
 */
export function buildTuhPkgs(contracts: readonly Row[], contractedNote: string): TuhPkg[] {
  const F = CASHFLOW_NEW.fields;
  const byKey = new Map<string, TuhPkg>();
  for (const r of contracts) {
    const group = groupOf(r);
    if (!group) continue;
    /* ⚠️ 2026-09-30: «0» — БАГЦГҮЙ мөрийн тэмдэг (`Finance.planTotal`, `gdash.pkgCostWeight`
       хоёулаа `k === '0'`-ийг алгасдаг). Түлхүүр болговол багцгүй олон гэрээ «0» гэсэн
       НЭГ багц болж нийлж, IPC/сарын цэг «0» түлхүүрээр наалдана. */
    const k0 = pkgKeyOf(r[F.pkg]);
    const pkgKey = k0 === '0' ? '' : k0;
    const oid = numOf(r[CASHFLOW_NEW.oid]) ?? 0;
    const key = group === 'design' ? `d:${oid}` : pkgKey ? `${group === 'housing' ? '' : group + ':'}${pkgKey}` : `cf:${oid}`;
    const cost = numOf(r[F.budget]);
    const cur = byKey.get(key);
    const order = s(r[F.orderNo]) ? { no: s(r[F.orderNo]), date: dateOf(r[F.orderDate]) } : null;
    const cfId = numOf(r.Cashflow_ID);
    if (cur) {
      cur.rows.push(r);
      if (cost != null) cur.cost = (cur.cost ?? 0) + cost;
      cur.contracted ||= s(r[F.amountNote]) === contractedNote;
      cur.contractor = uniq([...cur.contractor.split(' · '), s(r[F.contractor])]).join(' · ');
      cur.client = uniq([...cur.client.split(' · '), s(r[F.client])]).join(' · ');
      cur.contractNo = uniq([...cur.contractNo.split(' · '), s(r[F.contractNo])]).join(' · ');
      const st = dateOf(r[F.startDate]);
      const en = dateOf(r[F.endDate]);
      if (st != null && (cur.start == null || st < cur.start)) cur.start = st;
      if (en != null && (cur.end == null || en > cur.end)) cur.end = en;
      if (cfId != null) cur.cfIds.push(cfId);
      if (order) cur.orders.push(order);
      continue;
    }
    byKey.set(key, {
      key,
      pkgKey,
      code: s(r[F.pkg]) || '—',
      name: s(r[F.detail]),
      group,
      rows: [r],
      cost,
      contracted: s(r[F.amountNote]) === contractedNote,
      contractor: s(r[F.contractor]),
      client: s(r[F.client]),
      contractNo: s(r[F.contractNo]),
      start: dateOf(r[F.startDate]),
      end: dateOf(r[F.endDate]),
      cfIds: cfId != null ? [cfId] : [],
      orders: order ? [order] : [],
    });
  }
  const order = new Map(TUH_GROUPS.map((g, i) => [g.key, i]));
  return [...byKey.values()].sort((a, b) => (order.get(a.group)! - order.get(b.group)!)
    || a.code.localeCompare(b.code, 'mn', { numeric: true }));
}

/**
 * Багцын биет гүйцэтгэл (0–100).
 * ⚠️ Орон сууц — багцын БОДИТ гүйцэтгэл (`Finance.physLatest` · `pkgMonthsMap`,
 *    «Гүйцэтгэл» · «Багцын мэдээлэл»-ийн жагсаалттай ИЖИЛ эх; 2026-09-30 merge —
 *    урьд `loadFillPkgProgress`); бусад — гэрээний `guitsetgel_huvi` (дүнгээр
 *    жигнэсэн, хэмжигдээгүй мөр жинд орохгүй).
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ЗУРАГ ТӨСЛИЙН мөр — `designPctOf` (ТЭЗҮ ба
 *    ажлын зураг төслийн ШАТНЫ талбар, `CASHFLOW_NEW.stages`). Урьд нь барилгын
 *    `guitsetgel_huvi`-г уншдаг байв — тэр нь зураг төслийн мөрд холбоотой барилгын
 *    явцыг (амьдаар «БАГЦ 1-4» ТЭЗҮ мөрд 39.27 = барилгын хувь) эсвэл хоосон байдаг тул
 *    зураг төсөл бүгд «Эхлээгүй» эсвэл буруу хувьтай харагддаг байв.
 */
export function progressOf(p: TuhPkg, fill: ReadonlyMap<string, number> | null): number | null {
  if (p.group === 'housing') return fill?.get(p.pkgKey) ?? null;
  let top = 0;
  let base = 0;
  let plain: number | null = null;
  for (const r of p.rows) {
    const v = rowProgress(p.group, r);
    if (v == null) continue;
    const w = numOf(r[CASHFLOW_NEW.fields.budget]) ?? 0;
    if (w > 0) { top += w * v; base += w; } else plain ??= v;
  }
  return base > 0 ? top / base : plain;
}

/**
 * ЗУРАГ ТӨСЛИЙН ГЭРЭЭНИЙ ГҮЙЦЭТГЭЛ (0–100) — шатны талбараас.
 *
 * ⚠️ 2026-10-01: ажлын нэр аль шатыг заахаар талбараа сонгоно — «ТЭЗҮ»/«судалгаа» →
 *    `tezu`, «зураг» → `ajliin_zurag_tusul`; хоёулаа (жиш. «ТЭЗҮ, техникийн зураг
 *    төсөл») эсвэл аль нь ч биш бол хоёр талбарын УТГАТАЙ нь(ий) энгийн дундаж.
 * ⚠️ Бүх сонгосон талбар хоосон бол `null` («—», Мэдээлэлгүй) — 0 БИШ (`null ≠ 0`).
 */
export function designPctOf(row: Row): number | null {
  const ST = CASHFLOW_NEW.stages;
  const name = s(row[CASHFLOW_NEW.fields.detail]).toLowerCase();
  const tezu = /тэзү|судалгаа/.test(name);
  const draw = /зураг/.test(name);
  const fields = tezu || draw ? [...(tezu ? [ST.tezu] : []), ...(draw ? [ST.design] : [])] : [ST.tezu, ST.design];
  const xs = fields.map((f) => numOf(row[f])).filter((x): x is number => x != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Гэрээний НЭГ мөрийн гүйцэтгэл — зураг төсөлд шатны талбар, бусдад `guitsetgel_huvi` */
export const rowProgress = (group: TuhGroup, row: Row): number | null =>
  group === 'design' ? designPctOf(row) : numOf(row[CASHFLOW_NEW.fields.progressPct]);

/* ══════════════════════ ГЭРЭЭНИЙ ТӨЛӨВЛӨГӨӨ ══════════════════════ */

/**
 * Сарын мөрийн сар — ОРОН НУТГИЙН (`format.monthKey`).
 * ⚠️ 2026-09-30: урьд нь UTC (`getUTCMonth`) байв — `format.dayKey`-ийн ⚠️ ба
 *    `Finance`-ийн сарын задаргааны 2026-09-29-ний засвартай ижил занга: порталаас
 *    орсон `Cashflow_start` нь UTC шөнө дунд (УБ-аар ТЭР өдрийн 08:00 — сар хэвээр),
 *    харин AGOL/Excel-ээс орсон УБ-ын шөнө дунд нь UTC-ээр ӨМНӨХ өдрийн 16:00 тул
 *    UTC-ээр уншвал БҮТЭН САРААР ухардаг («2026-06-01» мөр → «2026-05»).
 */
const ymOf = (ms: number) => monthKey(ms);

/**
 * ГЭРЭЭНИЙ ТӨЛӨВЛӨГӨӨТ ГҮЙЦЭТГЭЛ (0–100) — CASHFLOW_NEW-ийн сарын мөрүүдийн
 * (`Cashflow_huwi`, ажил бүрд нийлбэр 100) `at` хүртэлх ХУРИМТЛАЛ.
 * `at` — «YYYY-MM-DD» (тэр өдрийн байдлаар) эсвэл «YYYY-MM» (сарын ЭЦСЭЭР).
 *
 * ⚠️ 2026-09-30: ӨДРӨӨР ЗАВСАРЛАНА (`planProgress.planPctAt`-ийн дүрэм): өмнөх
 *    саруудын нийлбэр + ТУХАЙН сарын хувь × (өдөр ÷ сарын өдөр). Урьд нь сарыг
 *    БҮТНЭЭР нь тоолдог байсан тул сарын 1-нд тэр сарын төлөвлөгөө бүхэлдээ
 *    нэмэгдэж, хэдэн долоо хоногийн өмнөх хэмжилттэй жишсэн «гэрээний
 *    төлөвлөгөөнөөс» зөрүү хиймлээр УЛААН болдог байв — `Finance.lagOf`-ийн
 *    2026-09-25-ны засвартай ЯГ ижил алдаа (гүйцэтгэгчийн төлөвлөгөөнд засагдсан).
 *    Дуудагч нь хэмжилтийн өдрийг (`measDayOf`) өгнө.
 * ⚠️ Олон гэрээтэй багцад — гэрээ бүрийн хуримтлалыг ХО дүнгээр жигнэнэ.
 * ⚠️ Сарын мөр огт бөглөгдөөгүй гэрээ жинд ОРОХГҮЙ; бүгд хоосон бол `null`
 *    (0 биш — «төлөвлөгөө 0%» гэж ХУДАЛ хэлэхгүй).
 */
export function cfPlanPctAt(
  plan: readonly CfPlanRow[],
  items: readonly { id: number; cost: number }[],
  at: string,
): number | null {
  const ym = at.slice(0, 7);
  const y = Number(at.slice(0, 4));
  const mo = Number(at.slice(5, 7));
  const day = at.length >= 10 ? Number(at.slice(8, 10)) : NaN;
  const days = Number.isFinite(y) && Number.isFinite(mo) ? new Date(Date.UTC(y, mo, 0)).getUTCDate() : 31;
  /* Өдөргүй («YYYY-MM») бол сарын эцэс — хуучин зан төлөв */
  const frac = Number.isFinite(day) && day > 0 ? Math.min(1, day / days) : 1;
  let top = 0;
  let base = 0;
  for (const it of items) {
    let has = false;
    let cum = 0;
    for (const r of plan) {
      if (r.id !== it.id || r.pct == null || r.start == null) continue;
      has = true;
      const m = ymOf(r.start);
      if (m < ym) cum += r.pct;
      else if (m === ym) cum += r.pct * frac;
    }
    if (!has) continue;
    const w = it.cost > 0 ? it.cost : 1;
    top += w * Math.min(100, cum);
    base += w;
  }
  return base > 0 ? top / base : null;
}

/** Багцын гэрээнүүд → `cfPlanPctAt`-ийн оролт */
export const cfItemsOf = (p: TuhPkg): { id: number; cost: number }[] => p.rows
  .map((r) => ({ id: numOf(r.Cashflow_ID) ?? -1, cost: numOf(r[CASHFLOW_NEW.fields.budget]) ?? 0 }))
  .filter((x) => x.id > 0);

/* ══════════════════════ 7 ХОНОГИЙН АХИЦ ══════════════════════ */

/**
 * Өнгөрсөн 7 хоногийн ахиц (pp) — багцын биет гүйцэтгэл `today`-ийн байдлаар
 * − 7 хоногийн өмнөх байдлаар.
 *
 * ⚠️ 2026-09-30: КАРТЫН ГҮЙЦЭТГЭЛТЭЙ (`Finance.physLatest` ← `finPhys.buildPhys`) НЭГ
 *    ТОДОРХОЙЛОЛТ — хоёр агшинд ИЖИЛ, ТОГТМОЛ хуваагч (сүүлийн бичилт нь утгатай
 *    блокууд; тэр агшинд хараахан тайлагнаагүй блок 0%). Урьд нь
 *    `progressSeries(…, 'latest')`-ийн цуваа байсан — хуваагч нь ТУХАЙН агшинд
 *    хэмжигдсэн блок л тул шинэ блок анх тайлагнах 7 хоногт дундаж унаж, ажил
 *    урагшилсан ч «7 хоногт −3 pp» гэж ХУДАЛ харагддаг байв (`finPhys` дүрэм 1-ийн
 *    засварласан алдаа; `progressSeries`-ийн `'latest'` ⚠️-д «сул тал» гэж бичигдсэн).
 * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): хуваагч = багцын БҮХ блок (`total` — бөглөх
 *    хуудасны хуваарь), тайлагнаагүй блок 0% — `buildPhys`-ийн шинэ хуваагчтай нэг.
 * ⚠️ Бүлэглэл нь `buildPhys`-тэй ИЖИЛ: `bagtsKey(багц)` + `blockKey(блок)`.
 * ⚠️ 7 хоногийн өмнө НЭГ Ч блок хэмжигдээгүй бол `null` — багцын анхны тайлан
 *    бүхэлдээ «энэ 7 хоногийн ахиц» болж хөөрөгдөхгүй. Хэмжилт алга бол `null` (0 биш).
 */
export function weekDelta(
  hist: ReadonlyMap<string, readonly { date: string; pct: number | null }[]>,
  pkgKey: string,
  today: string,
  /** Багцын блокийн хуваарь (`FinData.physN`) — өгөөгүй бол утгатай блокийн тоо */
  total?: number,
): number | null {
  if (!pkgKey) return null;
  const before = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(before.getTime())) return null;
  before.setUTCDate(before.getUTCDate() - 7);
  const wk = before.toISOString().slice(0, 10);
  const blocks = new Map<string, { d: string; g: number | null }[]>();
  for (const [key, pts] of hist) {
    const cut = key.indexOf('|');
    if (cut < 0 || bagtsKey(key.slice(0, cut)) !== pkgKey) continue;
    const b = blockKey(key.slice(cut + 1));
    if (!b) continue;
    const arr = blocks.get(b) ?? [];
    for (const p of pts) {
      const d = String(p.date ?? '').slice(0, 10);
      if (!d || d > today) continue; // ⚠️ өнөөдрөөс хойшхи бичилт тоологдохгүй
      arr.push({ d, g: p.pct == null || !Number.isFinite(Number(p.pct)) ? null : Number(p.pct) });
    }
    blocks.set(b, arr);
  }
  /* Хуваагчийн олонлог — СҮҮЛИЙН бичилт нь утгатай блокууд (`buildPhys` дүрэм 1) */
  const members: { d: string; g: number }[][] = [];
  for (const arr0 of blocks.values()) {
    const arr = [...arr0].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    const last = arr[arr.length - 1];
    if (!last || last.g == null) continue;
    members.push(arr.filter((e): e is { d: string; g: number } => e.g != null));
  }
  if (!members.length) return null;
  const asOf = (day: string): number | null => {
    let sum = 0;
    let any = false;
    for (const arr of members) {
      let best: number | null = null;
      for (const e of arr) {
        if (e.d > day) break;
        best = e.g;
      }
      if (best == null) continue; // тэр агшинд хараахан тайлагнаагүй — 0%
      sum += best;
      any = true;
    }
    /* ⚠️ 2026-10-01: хуваагч = багцын БҮХ блок (`total`, тайлагнаагүй 0%) — `buildPhys`-тэй нэг */
    return any ? sum / Math.max(members.length, total ?? 0) : null;
  };
  const now = asOf(today);
  const then = asOf(wk);
  return now != null && then != null ? now - then : null;
}

/* ══════════════════════ EV · PV · SPI ══════════════════════ */

/**
 * ОЛОГДСОН ӨРТӨГ (EV) ба ТӨЛӨВЛӨСӨН ӨРТӨГ (PV).
 *
 *     EV = ГЭРЭЭНИЙ ДҮН × биет гүйцэтгэл
 *     PV = ГЭРЭЭНИЙ ДҮН × төлөвлөгөөт гүйцэтгэл   (гэрээний / гүйцэтгэгчийн)
 *     SPI = EV ÷ PV · SV = EV − PV
 *
 * ⚠️ Хувь бүр 0–100. Аль нэг нь `null` бол тэр үзүүлэлт `null`. PV = 0 бол
 *    SPI утгагүй (`null`) — «∞» гэж харуулахгүй.
 */
export function earned(bac: number | null, actual: number | null, planContract: number | null, planContractor: number | null) {
  const ev = bac != null && actual != null ? (bac * actual) / 100 : null;
  const pvC = bac != null && planContract != null ? (bac * planContract) / 100 : null;
  const pvG = bac != null && planContractor != null ? (bac * planContractor) / 100 : null;
  return {
    ev,
    pvContract: pvC,
    pvContractor: pvG,
    svContract: ev != null && pvC != null ? ev - pvC : null,
    spiContract: ev != null && pvC ? ev / pvC : null,
    spiContractor: ev != null && pvG ? ev / pvG : null,
  };
}

/* ══════════════════════ IPC ══════════════════════ */

/** Хүлээгдэж буй дүнгийн талбарууд (HO_IPC) — ⚠️ одоогоор бүгд хоосон; хоосон бол `null` */
export const HO_PENDING = HO_IPC.pendingFields;

export type TuhIpc = {
  contracts: HoContract[];
  contractTotal: number | null;
  paid: number | null;
  paidPct: number | null;
  advance: number | null;
  /** Олгосон IPC-ийн дугаарууд (өсөх) */
  ipcNos: number[];
  /** Сүүлд олгосон гүйлгээ — «YYYY-MM-DD» */
  lastPaidDate: string | null;
  lastIpc: number | null;
  /** Хүлээгдэж буй дүн (төрийн сан · ХО хэлц · захиалагч) — бүгд хоосон бол `null` */
  pending: number | null;
  /**
   * Гэрээт дүн ТОДОРХОЙГҮЙ гэрээнд олгосон — `paidPct`-д ОРООГҮЙ хэсэг (`ipcTotals.paidOther`-той
   * ижил дүрэм). `null` = тийм олголт алга.
   */
  paidOther: number | null;
  /** Хянагдаж буй (олгоогүй) AUTO IPC — `pendingAutoOf`. Алга бол `null` */
  review: TuhIpcReview | null;
};

const sumOrNull = (xs: (number | null)[]): number | null => {
  const k = xs.filter((x): x is number => x != null);
  return k.length ? k.reduce((a, b) => a + b, 0) : null;
};

/** Хянагдаж буй IPC — гүйцэтгэлээс автоматаар үүссэн, `dun` нөхөгдөөгүй мөрүүд */
export type TuhIpcReview = {
  count: number;
  /** Σ `guits_une` (обьём × нэгж өртөг) — бүгд хоосон бол `null` */
  une: number | null;
  /** Хамгийн эртний / хожуу агшин «YYYY-MM-DD» */
  oldest: string | null;
  latest: string | null;
};

/**
 * ХЯНАГДАЖ БУЙ IPC — AUTO мөр (`ipcAuto.isAuto`) бөгөөд `dun` ХООСОН (санхүүгийн газар
 * хараахан олгоогүй).
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): «Хянагдаж буй IPC» багана урьд нь үргэлж «—»
 *    байв. AUTO мөр нь гүйцэтгэл 4 шатны хяналт дамжиж батлагдмагц үүсдэг (`ipcAuto` толгой)
 *    тул «олгохыг хүлээж буй IPC»-ийн цорын ганц эх. `dun` нөхөгдмөгц олголт болж эндээс
 *    гарна (`ipcTable.payCount`-ийн ⚠️-тэй ижил хил).
 * ⚠️ Агшны огноо нь `murun_id`-аас (`autoDay`) — `guilgee_ognoo`-г санхүүгийн газар
 *    дарж бичиж болно (`autoDay`-ийн ⚠️).
 */
export function pendingAutoOf(pays: readonly Row[]): TuhIpcReview | null {
  let count = 0;
  let une: number | null = null;
  let oldest: string | null = null;
  let latest: string | null = null;
  for (const r of pays) {
    if (!isAuto(r) || hoAmount(r) != null) continue;
    count += 1;
    const v = numOf(r[LINK_FIELDS.une]);
    if (v != null) une = (une ?? 0) + v;
    const d = dayOf(autoDay(r) ?? '') ?? dayOf(s(r[HO_IPC.payFields.payDate]));
    if (d && (!oldest || d < oldest)) oldest = d;
    if (d && (!latest || d > latest)) latest = d;
  }
  return count ? { count, une, oldest, latest } : null;
}

/**
 * Багцын IPC нэгтгэл — `groupHo`-ийн гэрээнүүдийг `pkgKey`-ээр шүүнэ.
 * ⚠️ Гэрээний дүнг ГЭРЭЭНЭЭС (мөрөөс биш) — `HoContract`-ийн ⚠️.
 * ⚠️ 2026-10-01: `pkgKey === null` — гэрээнүүд АЛЬ ХЭДИЙН онооглогдсон (`assignHo`), шүүхгүй.
 *    Зураг төслийн мөр түлхүүргүй («БАГЦ 1-4») эсвэл эцэг кодтой («Багц 8» ← «Багц-8.1»)
 *    гэрээ авдаг болсон тул түлхүүрээр дахин шүүвэл тэр гэрээ алга болно.
 */
export function ipcOf(pkgKey: string | null, all: readonly HoContract[], ipcNumbers: (pays: readonly Row[]) => number[]): TuhIpc | null {
  if (pkgKey === '') return null;
  const cs = pkgKey == null ? [...all] : all.filter((c) => c.key === pkgKey);
  if (!cs.length) return null;
  const pays = cs.flatMap((c) => c.pays);
  const contractTotal = sumOrNull(cs.map((c) => c.contractTotal));
  const paid = sumOrNull(cs.map((c) => c.paidTotal));
  /* ⚠️ 2026-09-30: хувийн ТООЛОГЧ = гэрээт дүн нь ТОДОРХОЙ гэрээний олголт л — хуваарь
     (`contractTotal`) ч зөвхөн тэднийх. `ipcTable.ipcTotals.paidContracted`-тай НЭГ
     хүрээ; урьд нь дүнгүй гэрээний олголт хувьд орж хувь хөөрөгддөг байв. */
  const paidKnown = sumOrNull(cs.filter((c) => c.contractTotal != null).map((c) => c.paidTotal));
  const P = HO_IPC.payFields;
  let lastPaidDate: string | null = null;
  for (const r of pays) {
    /* ⚠️ 2026-09-30: ЗӨВХӨН дүнтэй мөр — AUTO мөр (`dun` хоосон, огноо нь БАТЛАЛТЫН
       өдөр) олголт биш (`ipcTable.payCount`-ийн ⚠️); урьд нь «сүүлд олгосон» огноо
       болж, мөнгө олгоогүй өдрийг заадаг байв. */
    if (hoAmount(r) == null) continue;
    const d = s(r[P.payDate]).slice(0, 10);
    if (d && (!lastPaidDate || d > lastPaidDate)) lastPaidDate = d;
  }
  const nos = ipcNumbers(pays);
  const pend = sumOrNull(pays.flatMap((r) => Object.values(HO_PENDING).map((f) => numOf(r[f]))));
  return {
    contracts: cs,
    contractTotal,
    paid,
    paidPct: paidKnown != null && contractTotal ? (paidKnown / contractTotal) * 100 : null,
    advance: sumOrNull(cs.map((c) => c.advanceTotal)),
    ipcNos: nos,
    lastPaidDate,
    lastIpc: nos.length ? nos[nos.length - 1] : null,
    /* ⚠️ Бүх утга 0 ч «хүлээгдэж буй дүн алга» гэсэн утгатай — 0-ийг `null`-оос ялгана */
    pending: pend,
    /* ⚠️ 2026-10-01: хувьд ороогүй олголтыг НУУХГҮЙ — «IPC»-ийн хуудастай ижил тусад нь нэрлэнэ */
    paidOther: sumOrNull(cs.filter((c) => c.contractTotal == null).map((c) => c.paidTotal)),
    review: pendingAutoOf(pays),
  };
}

/**
 * Гэрээний талбарын утга — ТАЛБАР БҮРЭЭР, УТГАТАЙ эхний мөрөөс.
 * ⚠️ 2026-09-30: `c.pays[0]` («толгой мөр») БИШ — AUTO мөр гэрээний талбаргүй бөгөөд
 *    эрэмбээр эхэнд ирж болно (`ipc.groupHo` · `ipcTable.contractBlocks`-ийн ⚠️);
 *    амьдаар `tosov_niislel_tosov` 45 мөрийн ганцад л бөглөгдсөн тул толгой мөрөөр
 *    уншвал утга байхад «—» харагдана.
 */
export function firstFilled(rows: readonly Row[], field: string): unknown {
  for (const r of rows) {
    const v = r[field];
    if (v != null && !(typeof v === 'string' && v.trim() === '')) return v;
  }
  return null;
}

/* ══════════════════════ ТҮЛХҮҮРИЙН ЭЗЭН ══════════════════════ */

/**
 * HO гэрээ зураг төсөл/судалгааных уу (`ajliin_turul` «ТЭЗҮ,Судалгаа»).
 * ⚠️ 2026-10-01: төрөл нь ТАСЛАЛААР нийлсэн байдаг («ТЭЗҮ,Судалгаа» — амьдаар 3 мөр).
 *    Хэсэг БҮР зураг төслийнх (тэзү · судалгаа · зураг) байвал л зураг төсөл; «Зураг төсөл,
 *    Барилга угсралт» мэт холимог гэрээ БАРИЛГЫН мөрд үлдэнэ (мөнгөний дийлэнх нь барилга).
 */
const DESIGN_WORK = /тэзү|судалгаа|зураг/i;
export const isDesignHo = (c: Pick<HoContract, 'workType'>): boolean => {
  const parts = String(c.workType ?? '').split(/[,;/]+/).map((x) => x.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((x) => DESIGN_WORK.test(x));
};

/* ══════════════════════ ХАЙЛТ · КОД ══════════════════════ */

/**
 * КОД/ХАЙЛТЫН НОРМАЛЧЛАЛ — «багц 5.1» · «БАГЦ-5.1» · «Багц 5.1» · «bagts 5.1» → «багц5.1».
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): урьд нь хайлт `toLowerCase().includes` л байсан
 *    тул «багц 5.1» нь «БАГЦ-5.1»-ийг олдоггүй (зай ≠ зураас), латинаар бичсэн «bagts»
 *    огт олдохгүй байв.
 * ⚠️ ЦЭГИЙГ ХАДГАЛНА — «5.1» ба «51» өөр багц. Багцын ДАРААХ зураас/зай хаягдана,
 *    ДИАПАЗОНЫ зураас («1-4», «1- 4») «-» болж үлдэнэ.
 */
export function searchNorm(v: unknown): string {
  return String(v ?? '')
    /* ⚠️ «№»-ийг NFKC-ээс ӨМНӨ хаана — NFKC түүнийг «No» болгодог */
    .replace(/[№#]/g, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/bag(?:tz|ts|c|z)/g, 'багц')
    .replace(/[‐-―−_]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '')
    .replace(/багц-+/g, 'багц');
}

/** Нормалчилсан кодын ДУГААРУУД — «багц1-6багц8-17» → ["1-6", "8-17"], «5.1» → ["5.1"] */
const codeNums = (norm: string): string[] => {
  const out: string[] = [];
  const lead = /^(\d[\d.-]*)/.exec(norm);
  if (lead) out.push(lead[1]);
  for (const m of norm.matchAll(/багц(\d[\d.-]*)/g)) out.push(m[1]);
  return out.map((x) => x.replace(/[.-]+$/, ''));
};

/**
 * ХАЙЛТЫН ТААРАЛ.
 * ⚠️ Кодын хайлт («5.1», «багц 5.1») — дугаар ЯГ ижил эсвэл түүний дэд багц («5.1.2»,
 *    «5-…» диапазон) л. Энгийн `includes` бол «5.1» нь «15.1»-ийг ч олно.
 *    Үүнээс гадна нэр/гүйцэтгэгчид дэд мөр болгон хайна.
 */
export function matchesSearch(q: string, code: string, texts: readonly string[]): boolean {
  const n = searchNorm(q);
  if (!n) return true;
  /* Чөлөөт бичвэрт зураасыг огт тооцохгүй («Барилга - угсралт» = «барилга угсралт») */
  const flat = (x: string) => x.replace(/-/g, '');
  const inText = (xs: readonly string[]) => xs.some((t) => flat(searchNorm(t)).includes(flat(n)));
  const num = /^(?:багц)?(\d[\d.-]*)$/.exec(n);
  if (num) {
    const want = num[1].replace(/[.-]+$/, '');
    if (codeNums(searchNorm(code)).some((c) => c === want || c.startsWith(`${want}.`) || c.startsWith(`${want}-`))) return true;
    return inText(texts);
  }
  return inText([code, ...texts]);
}

/**
 * БАГЦЫН ТҮЛХҮҮРЭЭР ХОЛБОГДОХ ӨГӨГДЛИЙН ЭЗЭН МӨР.
 *
 * ⚠️ 2026-09-30: нэг `pkgKey` хэд хэдэн ТУХ мөрд давтагдаж болно — зураг төслийн мөр
 *    ТУСДАА (`buildTuhPkgs`-ийн ⚠️: «Багц 7.1» ТЭЗҮ ба «БАГЦ-7.1» барилга), эсвэл
 *    нэг багц өөр бүлгийн хоёр гэрээтэй. Урьд нь HO гэрээ, сарын цэг (санхүүжилтийн
 *    явц), MA/MIR, ХАБЭА түлхүүрээрээ БҮХ мөрд наалдаж — нэг гэрээ IPC-ийн хүснэгтэд
 *    ХОЁР удаа гарч, зураг төслийн мөр барилгын гэрээний олголт, материал, ажилчдыг
 *    өөрийнх мэт харуулдаг байв («мөнгө холилдоно»).
 * ДҮРЭМ: эзэн = тэр түлхүүртэй ЭХНИЙ зураг төслийн БУС мөр (бүлгийн дарааллаар —
 *    орон сууц эхэнд); зөвхөн зураг төслийн мөртэй түлхүүрт — тэр мөр.
 */
export function keyOwners(pkgs: readonly TuhPkg[]): { owner: Map<string, string>; design: Map<string, string> } {
  const owner = new Map<string, string>();
  const design = new Map<string, string>();
  for (const p of pkgs) {
    if (!p.pkgKey) continue;
    const m = p.group === 'design' ? design : owner;
    if (!m.has(p.pkgKey)) m.set(p.pkgKey, p.key);
  }
  design.forEach((v, k) => { if (!owner.has(k)) owner.set(k, v); });
  return { owner, design };
}

/**
 * HO гэрээ бүрийг ЯГ НЭГ ТУХ мөрд оноох — зураг төслийн гэрээ (`isDesignHo`) зураг
 * төслийн мөрд (байвал), бусад нь түлхүүрийн эзэнд (`keyOwners`).
 * ⚠️ Түлхүүргүй (диапазон) БАРИЛГЫН гэрээ аль ч мөрд очихгүй — нийт дүнд (`ipcTotals`) үлдэнэ.
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ЗУРАГ ТӨСЛИЙН гэрээний мөр хайлт 3 шаттай —
 *    (1) ижил түлхүүр; (2) НОРМАЛЧИЛСАН код ижил (`searchNorm`: «Багц-1-4» = «БАГЦ 1-4» —
 *    диапазон тул түлхүүр нь хоосон); (3) ЭЦЭГ код («Багц 8» ← «Багц-8.1», хамгийн урт
 *    таарал). Амьдаар (2026-10-01) «ТЭЗҮ,Судалгаа» 3 гэрээний «Багц-1-4» нь аль ч мөрд
 *    очдоггүй, «Багц-8.1» нь 8.1-ийн БАРИЛГЫН мөрд наалддаг байв. Олдохгүй бол урьдын
 *    адил түлхүүрийн эзэнд.
 */
export function assignHo(pkgs: readonly TuhPkg[], contracts: readonly HoContract[]): Map<string, HoContract[]> {
  const { owner, design } = keyOwners(pkgs);
  /* ⚠️ 2026-10-04: ЗУРАГ ТӨСЛИЙН HO гэрээний түлхүүрийг Cashflow-ийн түлхүүр рүү (`pkgAlias.hoPkgKey` —
     «Багц-8.1» ТЭЗҮ → «Багц 8» зураг төсөл), «Багцын санхүү»-тэй НЭГ хүснэгтээр; урьд нь зөвхөн эцэг
     кодын таамаг (доорх 3-р шат) байв. ⚠️ ЗӨВХӨН зураг төслийн хайлтад — 8.1-ийн БАРИЛГЫН гэрээ өөрийн
     түлхүүрийн эзэнд (`owner`) хэвээр очно. */
  const keyOf = (c: HoContract) => (c.key ? hoPkgKey(c.key) : '');
  const designRows = pkgs.filter((p) => p.group === 'design').map((p) => ({ key: p.key, norm: searchNorm(p.code) }));
  const designFor = (c: HoContract): string | undefined => {
    const byKey = keyOf(c) ? design.get(keyOf(c)) : undefined;
    if (byKey) return byKey;
    const cn = searchNorm(c.pkg || c.code);
    if (!cn) return undefined;
    const same = designRows.find((d) => d.norm === cn);
    if (same) return same.key;
    const mine = codeNums(cn)[0];
    if (!mine) return undefined;
    let best: { key: string; len: number } | null = null;
    for (const d of designRows) {
      for (const n of codeNums(d.norm)) {
        if (n && mine.startsWith(`${n}.`) && (!best || n.length > best.len)) best = { key: d.key, len: n.length };
      }
    }
    return best?.key;
  };
  const out = new Map<string, HoContract[]>();
  for (const c of contracts) {
    const to = (isDesignHo(c) ? designFor(c) : undefined) ?? (c.key ? owner.get(c.key) : undefined);
    if (!to) continue;
    const arr = out.get(to);
    if (arr) arr.push(c); else out.set(to, [c]);
  }
  return out;
}

/* ══════════════════════ ХУВААРЬ («Хуваарь» модуль) ══════════════════════ */

/** Хуваарийн мөрийн хэрэгтэй хэсэг — `bagtsSheet.SheetRow`-ийн дэд олонлог */
export type PlanLikeRow = {
  work: string;
  depth: number;
  group: boolean;
  start: (number | null)[];
  end: (number | null)[];
  act: (number | null)[];
  hun: number | null;
  mashin: number | null;
};

const OK_LO = Date.UTC(2000, 0, 1);
const OK_HI = Date.UTC(2100, 0, 1);
const sane = (x: number | null | undefined): x is number => x != null && x > OK_LO && x < OK_HI;

/**
 * Мөрийн МУЖ — өөрийн ба бүх ДЭД мөрийн блокуудын MIN эхлэл / MAX дуусгалт.
 * ⚠️ «Хуваарь» харагдацын бүлгийн зурвасын дүрэмтэй ИЖИЛ (дэд ажлуудын MIN/MAX,
 *    `planProgress`-ийн ⚠️) — бүлгийн өөрийн огноо давамгайлахгүй.
 */
export function rowSpan(rows: readonly PlanLikeRow[], i: number): { start: number | null; end: number | null } {
  let start: number | null = null;
  let end: number | null = null;
  const take = (r: PlanLikeRow) => {
    for (let b = 0; b < r.end.length; b += 1) {
      const st = r.start[b];
      const en = r.end[b];
      if (sane(st) && (start == null || st < start)) start = st;
      if (sane(en) && (end == null || en > end)) end = en;
    }
  };
  const d0 = rows[i].depth;
  if (!rows[i].group) take(rows[i]);
  for (let j = i + 1; j < rows.length && rows[j].depth > d0; j += 1) if (!rows[j].group) take(rows[j]);
  if (start == null && end == null) take(rows[i]);
  return { start, end };
}

/**
 * Мөрийн бодит гүйцэтгэл (0–1) — хуудасны БҮХ блокоор хуваасан дундаж (тайлагнаагүй блок 0);
 * нэг ч блок хэмжигдээгүй бол `null`.
 * ⚠️ 2026-10-04 (2026-10-01-ний «тайлагнаагүй блок = 0%» шийдвэр): урьд нь ЗӨВХӨН хэмжигдсэн
 *    блокуудаар дундажладаг тул 20 блокийн 1-д 100% бөглөсөн ажил Gantt-д «дууссан» харагддаг
 *    байв (`pkgProgressOf`-ийн жишээ). Хуваарь = `act.length` (хуудасны блокийн багана).
 * ⚠️ Огт хэмжилтгүй мөр `null` ХЭВЭЭР — `plan.statusOf`-ийн «хэмжигдээгүй ≠ эхлээгүй» (⚠️):
 *    0 гэвэл бөглөгдөөгүй бүх ажил Gantt-д «хоцорсон» улаанаар дүүрнэ.
 */
export function rowAct(r: PlanLikeRow): number | null {
  const xs = r.act.filter((x): x is number => x != null && Number.isFinite(x));
  return xs.length ? Math.min(1, xs.reduce((a, b) => a + b, 0) / r.act.length) : null;
}

/**
 * Хуудас бүрийн «Улсын комисс»-ын огноог БАГЦААР нэгтгэх — ХАМГИЙН ХОЖУУ нь.
 * ⚠️ 2026-09-30: багцын АЛЬ НЭГ хуудас уншигдаагүй бол огноо `null` («—»). Урьд нь
 *    9F/12F-ийн нэг нь унахад уншигдсан хуудасны огноо үлдэж — бүх блок дууссан
 *    агшин биш ДУТУУ огноо харагдан хоцролт дутуу тоологддог байв
 *    (`loadCommissionDates`-ийн «огноо нь «—» болж» гэсэн зорилгын эсрэг).
 * ⚠️ `failed` — давхардалгүй (хоёр хуудас хоёулаа унахад нэг нэр).
 */
export function mergeCommission(
  res: readonly { key: string; at: number | null; ok: boolean }[],
): { dates: Map<string, number | null>; failed: string[] } {
  const dates = new Map<string, number | null>();
  const bad = new Set<string>();
  for (const r of res) {
    if (!r.ok) { bad.add(r.key); continue; }
    const cur = dates.get(r.key) ?? null;
    dates.set(r.key, r.at == null ? cur : cur == null || r.at > cur ? r.at : cur);
  }
  bad.forEach((k) => dates.set(k, null));
  return { dates, failed: [...bad] };
}

/** «Улсын комисс» мөр мөн эсэх */
export const isCommissionWork = (w: string) => /улсын\s+комисс/i.test(w);

/** Хуваарийн хуудасны «Улсын комисс»-ын нэр дэвшигч мөр (`tuhSchedule.commissionOfSheet`) */
export type CommissionCand = {
  oid: number;
  /** `buglusun_ognoo` (мс) — агшны тамга; хоосон бол `null` */
  fill: number | null;
  /** «Хуваарь»-ийн ЯГ тэр мөр мөн эсэх (`ulsiinKomiss.findKomissRow`: № «УК» · «Улсын комисс») */
  exact: boolean;
  /** Блокуудын хамгийн хожуу төлөвлөгөөт дуусгалт (мс) */
  end: number | null;
};

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * «ХУВААРЬ»-ИЙН ХАРУУЛДАГ улсын комиссын огноо — нэр дэвшигч мөрүүдээс.
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): урьд нь ХАМГИЙН ИХ ObjectID-тай «…комисс…» мөр
 *    байв. «Хуваарь» нь (1) СҮҮЛИЙН АГШИН (`bagtsSheet.loadRows` → `latestWhere`: хамгийн
 *    хожуу `buglusun_ognoo`-ийн ӨДӨР; тэр өдрийн мөр алга бол огноогүй мөрүүд), (2) тэр
 *    агшны № «УК» · «Улсын комисс» мөрийг (`ulsiinKomiss.findKomissRow`) харуулдаг. Батлагдаагүй
 *    санал (ноорог) бөглөх хуудсанд ОРДОГГҮЙ — `Selbe_Huvaari_Batlah`-ийн payload-д
 *    хадгалагдаж, батлагдмагц л `applyUpdates`-ээр сүүлийн агшинд бичигдэнэ. Тиймээс
 *    «батлагдсан хуваарь» = сүүлийн агшин; энд тэр дүрмийг дагана.
 * ⚠️ `latestFill`: `undefined` — хуудсанд тамганы талбар алга (бүх мөр нэг агшин);
 *    `null` — тамга огт бичигдээгүй (огноогүй мөрүүд л). ЯГ мөр (`exact`) байхгүй хуучин
 *    хуудсанд нэрээр таарсан мөр (`isCommissionWork`).
 * ⚠️ Нэг өдөрт хоёр агшин бол ХАМГИЙН ИХ ObjectID (`lastFrame`-ийн сүүлийн бүтэн жааз).
 *    Сүүлийн агшинд мөр алга бол `null` («—») — «Хуваарь»-д ч харагдахгүй.
 */
export function pickCommission(cands: readonly CommissionCand[], latestFill: number | null | undefined): number | null {
  const pool = cands.some((c) => c.exact) ? cands.filter((c) => c.exact) : [...cands];
  let frame = pool;
  if (latestFill === null) frame = pool.filter((c) => c.fill == null);
  else if (latestFill !== undefined) {
    const day = utcDay(latestFill);
    frame = pool.filter((c) => c.fill != null && utcDay(c.fill) === day);
    if (!frame.length) frame = pool.filter((c) => c.fill == null);
  }
  let best: CommissionCand | null = null;
  for (const c of frame) if (!best || c.oid > best.oid) best = c;
  return best?.end ?? null;
}

/**
 * ТҮЛХҮҮРТЭЙ АМЛАЛТЫН КЭШ — хуудас тус бүрийн мөрийг нэг удаа татна.
 * ⚠️ 2026-10-01: багц нээх бүрд 1–2 бүтэн хуудсыг дахин татдаг байв (`loadPkgSchedule`).
 *    Унасан амлалт ЗӨВХӨН өөрөө идэвхтэй бол хаягдана (`live.cached`-ийн ⚠️ 2026-09-08).
 *    Хүчингүй болголт нь дуудагч талд (`dataBus.register`).
 */
export function keyedCache<T>(ttlMs: number, now: () => number = Date.now) {
  const m = new Map<string, { at: number; p: Promise<T> }>();
  return {
    get(key: string, load: () => Promise<T>): Promise<T> {
      const hit = m.get(key);
      if (hit && now() - hit.at <= ttlMs) return hit.p;
      const slot = { at: now(), p: load() };
      m.set(key, slot);
      slot.p.catch(() => { if (m.get(key) === slot) m.delete(key); });
      return slot.p;
    },
    clear(): void { m.clear(); },
  };
}

/**
 * УЛСЫН КОМИССЫН ОГНОО — хуваарийн «Улсын комисс» мөрийн (дэд мөртэй бол
 * тэдгээрийн) хамгийн хожуу дуусгалт. Мөр байхгүй/огноо бөглөгдөөгүй бол `null`.
 */
export function commissionOf(rows: readonly PlanLikeRow[]): number | null {
  let out: number | null = null;
  rows.forEach((r, i) => {
    if (!isCommissionWork(r.work)) return;
    const e = rowSpan(rows, i).end;
    if (e != null && (out == null || e > out)) out = e;
  });
  return out;
}

/**
 * ГОЛ ҮЕ ШАТ — хуваарийн ДЭЭД түвшний (хамгийн бага гүн) мөрүүд, дуусгалтаараа.
 * ⚠️ Огноогүй мөр жагсаалтад «огноогүй» гэж үлдэнэ (хаяхгүй).
 */
export function milestonesOf(rows: readonly PlanLikeRow[]): { name: string; end: number | null; start: number | null; act: number | null }[] {
  if (!rows.length) return [];
  const top = Math.min(...rows.map((r) => r.depth));
  const out: { name: string; end: number | null; start: number | null; act: number | null }[] = [];
  rows.forEach((r, i) => {
    if (r.depth !== top || !r.work.trim()) return;
    const sp = rowSpan(rows, i);
    out.push({ name: r.work.trim(), start: sp.start, end: sp.end, act: rowAct(r) });
  });
  return out;
}

/** Хүн хүч / техник — НАВЧ мөрүүдийн нийлбэр; бүгд хоосон бол `null` */
export function resourcesOf(rows: readonly PlanLikeRow[]): { hun: number | null; mashin: number | null } {
  const leaf = rows.filter((r) => !r.group);
  return {
    hun: sumOrNull(leaf.map((r) => r.hun)),
    mashin: sumOrNull(leaf.map((r) => r.mashin)),
  };
}

/* ══════════════════════ ОГНОО ══════════════════════ */

export const DAY_MS = 86_400_000;
/** Хоёр огнооны зөрүү (хоног, бүхэл) — аль нэг нь `null` бол `null` */
export const daysBetween = (a: number | null, b: number | null): number | null =>
  a != null && b != null ? Math.round((b - a) / DAY_MS) : null;

/**
 * БИЕТ ГҮЙЦЭТГЭЛИЙН ХЭМЖИЛТИЙН ӨДӨР «YYYY-MM-DD» — `Finance.lagOf`-ийн `at`-тай ИЖИЛ
 * дүрэм: `nowYm` хүртэлх СҮҮЛИЙН хэмжигдсэн сарын `physAt` (тэр сарынх бол), эс
 * бөгөөс тэр сарын эцэс; хэмжилт огт алга бол `fallback`.
 * ⚠️ 2026-09-30: төлөвлөгөөг (гэрээний · гүйцэтгэгчийн) ЭНЭ өдрөөр авна — хэдэн долоо
 *    хоногийн өмнөх хэмжилтийг ӨНӨӨДРИЙН төлөвлөгөөтэй жишихгүй (2026-09-25-ны дүрэм).
 */
export function measDayOf(
  months: readonly { label: string; phys: number | null; physAt?: string | null }[] | null | undefined,
  nowYm: string,
  fallback: string,
  /* ⚠️ 2026-10-04: `physAt` алга ба сүүлийн хэмжигдсэн сар нь ОДООГИЙН сар (ОГТ тайлагнаагүй
     багцын 0% цэг — `Finance.contractMonths`) бол ӨНӨӨДӨР, сарын эцэс БИШ —
     `planProgress.measureDayOf`-тэй ЯГ ижил дүрэм (тэр модуль хуудас уншигч тул энд импортлохгүй). */
  today: string = dayKey(Date.now()),
): string {
  let last: { label: string; physAt?: string | null } | null = null;
  for (const m of months ?? []) if (m.label <= nowYm && m.phys != null) last = m;
  if (!last) return fallback;
  const at = last.physAt;
  if (at && /^\d{4}-\d{2}-\d{2}$/.test(at) && at.slice(0, 7) === last.label) return at;
  return last.label === today.slice(0, 7) ? today : `${last.label}-31`;
}

/**
 * БАГЦЫН СҮҮЛД ТАЙЛАГНАСАН ӨДӨР «YYYY-MM-DD» — сарын цэгүүдийн (`pkgMonthsMap`) хэмжигдсэн
 * сарын `physAt`-ийн хамгийн хожуу нь. Хэмжилт алга бол `null`.
 * ⚠️ 2026-10-01: карт бүрд (урьд нь зөвхөн төслийн нийт огноо байв).
 */
export function lastReportOf(
  months: readonly { label: string; phys: number | null; physAt?: string | null }[] | null | undefined,
): string | null {
  let out: string | null = null;
  for (const m of months ?? []) {
    if (m.phys == null || !m.physAt || !/^\d{4}-\d{2}-\d{2}$/.test(m.physAt)) continue;
    if (!out || m.physAt > out) out = m.physAt;
  }
  return out;
}

/** Тайлангүй хугацааны босго (хоног) — үүнээс удсан багцыг тодруулна */
export const TUH_STALE_DAYS = 14;

/** Сүүлийн тайлангаас хойш өнгөрсөн хоног — огноо алга бол `null` */
export function reportAge(last: string | null, today: string): number | null {
  if (!last) return null;
  const a = Date.parse(`${last}T00:00:00Z`);
  const b = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / DAY_MS) : null;
}

/**
 * «… оны өвөл дулаан авах»-ын ОН — ӨНӨӨДРӨӨС: халаалтын улирал 9-р сарын 15-аас 5-р
 * сарын 15 хүртэл тул 5/15-аас өмнө бол өмнөх оны өвөл (одоо явж буй), эс бөгөөс энэ оных.
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): урьд нь «2026» хатуу бичигдсэн байв.
 */
export function heatWinterYear(today: string): number | null {
  const y = Number(today.slice(0, 4));
  if (!Number.isFinite(y) || y < 2000) return null;
  return today.slice(5, 10) < '05-15' ? y - 1 : y;
}

/** Гэрээт хугацааны өнгөрсөн хувь (0–100) — муж алга бол `null` */
export function elapsedPct(start: number | null, end: number | null, now: number): number | null {
  if (start == null || end == null || end <= start) return null;
  return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}

/** `bagtsKey`-ийн дахин экспорт — модулиуд нэг эхээс импортлоно */
export { bagtsKey };
