/**
 * ХУВААРИЙН САРЫН ОБЬЁМ — төлөвлөсөн тоо хэмжээг САР ТУТМААР.
 */
import { agsFetch } from '@/modules/sheet/ags';
import { t as tr } from '@/lib/i18nCore';
import { GUITS } from '@/lib/services';
import { DAY, spanFrac, type Span } from './plan';
import { invalidate } from './dataBus';
import { isLostWrite } from './lostWrite';
import { ArcGISError } from './query';

/**
 * Үйлчилгээ — ГАНЦ хүснэгт, геометргүй.
 */
export const HUVAARI_OBYEM = `${GUITS}/186`;

/** Мөрийн төрөл — одоо зөвхөн төлөвлөгөө; хожим бодит гүйцэтгэл нэмэгдэж болно. */
export const TURUL_PLAN = 'tolovlolt';

/* ══════════════════ Сарын тооцоо ══════════════════ */

/** `2025-10` — UTC-ээр, цагийн бүсээс хамаарахгүй */
export const monthKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** `2025-10` → тэр сарын 1-ний өдөр (UTC шөнө дунд). Буруу бол `null`. */
export const monthStart = (key: string): number | null => {
  const m = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return Date.UTC(Number(m[1]), mo - 1, 1);
};

/** Тухайн сарын СҮҮЛЧИЙН өдөр (UTC шөнө дунд) */
const monthEnd = (key: string): number => {
  const s = monthStart(key)!;
  const d = new Date(s);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
};

/**
 * Муж хамарч буй БҮХ сар, дарааллаар. Хоёр захын ХАГАС сар ч ОРНО.
 */
export function monthsOf(s: Span): string[] {
  if (s.end < s.start) return [];
  const out: string[] = [];
  const a = new Date(s.start);
  let y = a.getUTCFullYear();
  let m = a.getUTCMonth();
  const last = monthKey(s.end);
  for (let guard = 0; guard < 600; guard += 1) {
    const k = `${y}-${String(m + 1).padStart(2, '0')}`;
    out.push(k);
    if (k === last) break;
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

/* ══════════════════ Сарын БҮРДЭЛ ══════════════════ */

/**
 * ХУВААРЬ ХӨДӨЛСНИЙ ДАРААХ САРУУДЫГ БЭЛТГЭНЭ — УТГАГҮЙГЭЭР.
 */
export function keepMonths(
  s: Span,
  prev: ReadonlyMap<string, number> = new Map(),
): Map<string, number> {
  const out = new Map<string, number>();
  for (const k of monthsOf(s)) {
    const v = prev.get(k);
    if (v != null) out.set(k, v);
  }
  return out;
}
/* ══════════════════ САРЫН НӨӨЦ — хүн хүч · машин механизм ══════════════════ */

/**
 * НЭГ САРЫН НӨӨЦ (2026-09-24, хэрэглэгчийн шаардлага: «сар бүрд обьём · хүн
 * хүч · машин механизм»). `null` = бөглөөгүй (0 БИШ).
 */
export type MonthRes = { hun: number | null; mashin: number | null };
/** Багц → ажлын код → блок → сар → нөөц */
export type PkgRes = Map<number, Map<string, Map<string, MonthRes>>>;

/** Хоёр сарын нөөц ижил үү (`null` ≠ 0) */
export const sameMonthRes = (a: MonthRes | undefined, b: MonthRes | undefined): boolean =>
  (a?.hun ?? null) === (b?.hun ?? null) && (a?.mashin ?? null) === (b?.mashin ?? null);

/**
 * Хуваарь хөдөлсний дараах саруудын НӨӨЦИЙГ бэлтгэнэ — `keepMonths`-ийн адил:
 * хэвээр үлдсэн сарын утга хадгалагдана, мужаас гарсан нь хасагдана, шинэ
 * сар ХООСОН (Map-д байхгүй). Автомат тараалт БАЙХГҮЙ.
 */
export function keepRes(
  s: Span,
  prev: ReadonlyMap<string, MonthRes> = new Map(),
): Map<string, MonthRes> {
  const out = new Map<string, MonthRes>();
  for (const k of monthsOf(s)) {
    const v = prev.get(k);
    if (v && (v.hun != null || v.mashin != null)) out.set(k, { hun: v.hun, mashin: v.mashin });
  }
  return out;
}

/**
 * Саруудын нөөцийн НИЙЛБЭР — мөрийн `hun_huch`/`mashin_mehanizm` болно.
 */
export function sumRes(m: ReadonlyMap<string, MonthRes>): MonthRes {
  let hun: number | null = null;
  let mashin: number | null = null;
  for (const v of m.values()) {
    if (v.hun != null) hun = (hun ?? 0) + Math.floor(v.hun);
    if (v.mashin != null) mashin = (mashin ?? 0) + Math.floor(v.mashin);
  }
  return { hun, mashin };
}

/* ══════════════════ Нийлбэрийн шалгуур ══════════════════ */

/** Сарын утгуудын нийлбэр */
export const sumMonths = (m: ReadonlyMap<string, number>): number => {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
};

/**
 * Нийлбэр нь нийт обьёмтой тэнцэж байна уу.
 */
export const balanced = (
  m: ReadonlyMap<string, number>,
  total: number,
  step = 0.01,
): boolean => Math.abs(sumMonths(m) - total) <= step / 2 + 1e-9 * Math.max(1, Math.abs(total));

/**
 * БҮЛГЭЭР ТӨЛӨВЛӨХ — хэрэглэгчийн өгсөн сарын хувиар (нийлбэрээрээ хэвийн болгоно) нийт обьёмыг сарууд руу хуваана.
 * 0.01-ээр (центээр) ХАМГИЙН ИХ ҮЛДЭГДЛИЙН аргаар: сар бүр доош бөөрөнхийлөгдөж, дутуу центүүд бутархай нь хамгийн том
 * эерэг саруудад нэг нэгээр очно — нийлбэр нь `total`-тай яг тэнцэж (`balanced`), СӨРӨГ утга хэзээ ч гарахгүй
 * (2026-10-29 хяналт: «сүүлийн сард үлдэгдэл» арга 0.00 сард −0.01 бичдэг байв). Хувь нь хэрэглэгчийнх тул доорх
 * шалгуурын №1 «автомат тараалт»-ын хоригт хамаарахгүй.
 */
export function splitByPct(total: number, pct: ReadonlyMap<string, number>): Map<string, number> {
  const keys = [...pct.keys()].sort();
  const out = new Map<string, number>(keys.map((k) => [k, 0]));
  const w = keys.map((k) => Math.max(0, pct.get(k) ?? 0));
  const wsum = w.reduce((a, b) => a + b, 0);
  const cents = Math.round(total * 100);
  if (!(wsum > 0) || !(cents > 0)) return out;
  const exact = w.map((x) => (cents * x) / wsum);
  const base = exact.map((x) => Math.floor(x + 1e-9));
  let rest = cents - base.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, f: x - base[i] })).filter((o) => w[o.i] > 0).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let j = 0; rest > 0 && order.length; j = (j + 1) % order.length, rest--) base[order[j].i] += 1;
  keys.forEach((k, i) => out.set(k, base[i] / 100));
  return out;
}

/** Мужийн өдөр бүрийн сарын түлхүүр (UTC шөнө дунд) */
const dayKeys = (s: Span): string[] => {
  const n = Math.max(0, Math.round((s.end - s.start) / DAY) + 1);
  return Array.from({ length: n }, (_, k) => monthKey(s.start + k * DAY));
};

export type MoneyWork = { money: number | null; vol: number | null };

/**
 * БҮЛГИЙН САРЫН МӨНГӨӨР ДАРААЛУУЛАХ (2026-10-29, хэрэглэгч: «бүлгийн ажлын 30%-ийг хийхэд хэдэн төгрөг гэж тооцоод
 * ажлуудыг дарааллаар нь тэр мөнгөнд багтаана; үлдсэн 30 саяд 3-р ажлын 30 саяын хэсэг тэр сард, үлдсэн нь дараагийн сард;
 * обьём = мөнгө ÷ нэгж үнэ»). Сар бүрийн багтаамж = Σмөнгө × сарын хувь / Σхувь. Ажлууд (`works` — дарааллаар нь) сарын
 * багтаамжийг дүүргэнэ; багтаагүй хэсэг дараагийн сард. Огноо: эхний мөнгө орсон сарын 1 — сүүлийн мөнгө орсон сарын сүүл
 * (бүлгийн мужаар хавчина). Сарын обьём = обьём × (тэр сарын мөнгө / ажлын мөнгө) — мөнгө = обьём × нэгж үнэ тул
 * «мөнгө ÷ нэгж үнэ»-тэй ижил, нийлбэр нь обьёмтой яг тэнцэнэ (`splitByPct`). 0% сар алгасагдана. Мөнгөгүй ажил тухайн
 * сардаа (обьём бүхэлдээ); нийт мөнгө 0 бол ажлууд тэнцүү мөнгөтэй гэж үзнэ. Хувь бүгд 0 бол сарууд тэнцүү.
 */
export function scheduleByMoney(
  sp: Span,
  pct: ReadonlyMap<string, number>,
  works: readonly MoneyWork[],
): { span: Span; months: Map<string, number> | null }[] {
  const keys = monthsOf(sp);
  if (!keys.length || sp.end < sp.start) return works.map(() => ({ span: { ...sp }, months: null }));
  const raw = works.map((w) => (w.money != null && w.money > 0 ? w.money : 0));
  const anyMoney = raw.some((x) => x > 0);
  const m = anyMoney ? raw : works.map(() => 1);
  const total = m.reduce((x, y) => x + y, 0);
  let ptot = 0;
  for (const k of keys) ptot += Math.max(0, pct.get(k) ?? 0);
  const cap = keys.map((k) => (ptot > 0 ? (total * Math.max(0, pct.get(k) ?? 0)) / ptot : total / keys.length));
  const eps = 1e-9 * Math.max(1, total);
  let mi = 0;
  let left = cap[0];
  /* Багтаамжгүй (0%) сарыг алгасна */
  const skip = () => { while (left <= eps && mi < keys.length - 1) { mi += 1; left = cap[mi]; } };
  skip();
  return works.map((w, i) => {
    const alloc = new Map<string, number>();
    let rest = m[i];
    if (rest > 0) {
      while (rest > eps) {
        const take = mi === keys.length - 1 ? rest : Math.min(rest, left);
        if (take > 0) alloc.set(keys[mi], (alloc.get(keys[mi]) ?? 0) + take);
        rest -= take;
        left -= take;
        skip();
      }
    } else alloc.set(keys[mi], 0);
    const used = [...alloc.keys()];
    const first = monthStart(used[0])!;
    const last = monthEnd(used[used.length - 1]);
    const span = { start: Math.max(sp.start, first), end: Math.min(sp.end, last) };
    if (w.vol == null || !(w.vol > 0)) return { span, months: null };
    const frac = new Map<string, number>(monthsOf(span).map((k) => [k, 0]));
    if (m[i] > 0) for (const [k, v] of alloc) frac.set(k, (v / m[i]) * 100);
    else frac.set(used[0], 100);
    return { span, months: splitByPct(w.vol, frac) };
  });
}

/**
 * АЖЛЫН ДАРААЛАЛ УЯЛДААГААР (2026-10-29, бүлгээр төлөвлөх — `Hamaaral`): урдах ажил (энэ жагсаалтад байгаа код) нь
 * хойдохоосоо өмнө. Тогтвортой топологийн эрэмбэ — боломжтой ажлуудаас хамгийн бага мөрийн индексийг эхэлж авна, тиймээс
 * уялдаагүй ажил мөрийн дарааллаар үлдэнэ. Жагсаалтаас гадуурх код үл тоогдоно; дугуй хамааралтай үлдэгдэл мөрийн дарааллаар.
 * Буцаах утга — индексүүд.
 */
export function orderByDeps(items: readonly { code: number | null; deps: readonly number[] }[]): number[] {
  const at = new Map<number, number>();
  items.forEach((x, i) => { if (x.code != null && !at.has(x.code)) at.set(x.code, i); });
  const need = items.map((x, i) => new Set(x.deps.map((c) => at.get(c)).filter((j): j is number => j != null && j !== i)));
  const done = new Set<number>();
  const out: number[] = [];
  while (out.length < items.length) {
    let pick = -1;
    for (let i = 0; i < items.length; i++) {
      if (done.has(i)) continue;
      if ([...need[i]].every((j) => done.has(j))) { pick = i; break; }
    }
    if (pick < 0) pick = items.findIndex((_, i) => !done.has(i));
    done.add(pick);
    out.push(pick);
  }
  return out;
}

/**
 * САРЫН ОБЬЁМЫГ ШИНЭ МУЖ РУУ БУУЛГАХ (2026-10-29 — бүлгийг чирэхэд доторх ажлын задаргааг дагуулна). Хуучин сар бүрийн
 * обьёмыг өдрүүддээ жигд тарааж, өдрүүдийг шинэ муж руу шугаманаар буулгаад сараар нийлүүлнэ; нийлбэр хадгалагдана
 * (`splitByPct`). Шинэ мужийн хоосон сар 0.
 */
export function remapMonths(months: ReadonlyMap<string, number>, from: Span, to: Span): Map<string, number> {
  const total = sumMonths(months);
  const out = new Map<string, number>(monthsOf(to).map((k) => [k, 0]));
  if (!(total > 0)) return out;
  const oldK = dayKeys(from);
  const newK = dayKeys(to);
  if (!oldK.length || !newK.length) return out;
  const cnt = new Map<string, number>();
  for (const k of oldK) cnt.set(k, (cnt.get(k) ?? 0) + 1);
  const accm = new Map<string, number>();
  let got = 0;
  oldK.forEach((k, d) => {
    const v = months.get(k);
    if (v == null || !(v > 0)) return;
    const t = oldK.length > 1 ? d / (oldK.length - 1) : 0;
    const nk = newK[Math.round(t * (newK.length - 1))];
    const add = v / cnt.get(k)!;
    accm.set(nk, (accm.get(nk) ?? 0) + add);
    got += add;
  });
  if (!(got > 0)) return out;
  for (const k of out.keys()) out.set(k, ((accm.get(k) ?? 0) / got) * 100);
  return splitByPct(total, out);
}

/* ══════════════════ Төлөвлөгөөт хувь (S-муруй) ══════════════════ */

/**
 * САРЫН ОБЬЁМООС төлөвлөгөөт гүйцэтгэлийн хувь (0–1) — хэрэглэгчийн шийдвэр №5а.
 */
export function planPctFromMonths(
  m: ReadonlyMap<string, number>,
  asOf: number,
  span?: { start: number | null; end: number | null } | null,
): number | null {
  const total = sumMonths(m);
  if (!(total > 0)) return null;
  const s0 = span?.start ?? null;
  const e0 = span?.end ?? null;
  if (s0 != null && e0 != null && Number.isFinite(s0) && Number.isFinite(e0) && s0 > e0) return null;
  const own = s0 != null && e0 != null && Number.isFinite(s0) && Number.isFinite(e0)
    ? { start: s0, end: e0 } : null;
  const keys = [...m.keys()].sort();
  let done = 0;
  for (const k of keys) {
    const ms = monthStart(k);
    if (ms == null) continue;
    const me = monthEnd(k);
    const v = m.get(k) ?? 0;
    /* Сарын цонх — ажлын мужтай огтлолцол; давхцахгүй бол бүтэн сар */
    let w: Span = { start: ms, end: me };
    if (own) {
      const a = Math.max(ms, own.start);
      const z = Math.min(me, own.end);
      if (a <= z) w = { start: a, end: z };
    }
    const f = spanFrac(w, asOf);
    done += v * f;
    if (f < 1) break;
  }
  return Math.max(0, Math.min(1, done / total));
}

/* ══════════════════ Хүснэгтийн мөр ══════════════════ */

/** Нэг мөр — багц · ажил · блок · сар */
export type ObyemRow = {
  oid: number | null;
  bagts: string;
  bagtsNer: string;
  des: number;
  ajilNo: string;
  ajilNer: string;
  blok: string;
  sar: string;
  obyem: number;
  negj: string;
  niit: number | null;
  /** Сарын нөөц (2026-09-24) — талбар байхгүй/бөглөөгүй бол `null` */
  hun: number | null;
  mashin: number | null;
};

/**
 * `dkey` — мөрийг ДАВТАГДАШГҮЙ болгох зорилготой түлхүүр.
 */
export const dkeyOf = (bagts: string, des: number, blok: string, sar: string): string =>
  `${bagts}|${TURUL_PLAN}|${des}|${blok}|${sar}`;

/** Багц → ажлын код → блок → сар → обьём */
export type PkgPlan = Map<number, Map<string, Map<string, number>>>;

/** Мөрийг тодорхойлох хамтын мэдээлэл — бичихэд ЗААВАЛ дагалдана */
export type WorkMeta = {
  bagts: string;
  bagtsNer: string;
  des: number;
  ajilNo: string;
  ajilNer: string;
  /** Хэмжих нэгж («м³») — тоо өөрөө утгатай байхын тулд мөр бүрд */
  negj: string;
  /** Мөрийн нийт Обьём — нийлбэр таарсныг аппгүйгээр шалгах боломж */
  niit: number | null;
};

/**
 * `sar` (DateOnly) талбарт БИЧИХ утга — «YYYY-MM-01» МӨР; буруу сар бол `null`.
 */
export const sarDateOnly = (key: string): string | null => (monthStart(key) == null ? null : `${key.trim()}-01`);

/**
 * Мөрийн САРЫН ТҮЛХҮҮР («YYYY-MM») — `sar_txt`-ээс, хоосон/эвдэрсэн бол `sar` (DateOnly)-аас.
 */
export function sarKeyOf(a: Record<string, unknown>): string {
  const t = String(a.sar_txt ?? '').trim();
  if (monthStart(t) != null) return t;
  const v = a.sar;
  if (typeof v === 'number' && Number.isFinite(v)) return monthKey(Math.round(v / 86_400_000) * 86_400_000);
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})/.exec(v.trim());
    if (m && monthStart(`${m[1]}-${m[2]}`) != null) return `${m[1]}-${m[2]}`;
  }
  return t;
}

/** Түүхий `features` → бүтэц. Гэмтэлтэй мөрийг АЛГАСНА, унагахгүй. */
export function toPkgPlan(
  feats: readonly { attributes: Record<string, unknown> }[],
): PkgPlan {
  const out: PkgPlan = new Map();
  for (const f of feats) {
    const a = f.attributes;
    if (a.des_dugaar == null || a.obyem == null) continue;
    const des = Number(a.des_dugaar);
    const blok = String(a.blok ?? '').trim();
    const sar = sarKeyOf(a);
    const v = Number(a.obyem);
    if (!Number.isInteger(des) || !blok || !monthStart(sar) || !Number.isFinite(v)) continue;
    let byBlok = out.get(des);
    if (!byBlok) { byBlok = new Map(); out.set(des, byBlok); }
    let byMonth = byBlok.get(blok);
    if (!byMonth) { byMonth = new Map(); byBlok.set(blok, byMonth); }
    byMonth.set(sar, v);
  }
  return out;
}

/**
 * Түүхий `features` → сарын НӨӨЦ (2026-09-24). `toPkgPlan`-ын хажууд:
 * ОБЬЁМТОЙ (хүчинтэй) мөрөөс л, хүн/машин ХОЁУЛАА `null` бол алгасна —
 * талбаргүй үйлчилгээнд хоосон Map буцна, унахгүй.
 */
export function toPkgRes(
  feats: readonly { attributes: Record<string, unknown> }[],
): PkgRes {
  const out: PkgRes = new Map();
  const numOrNull = (x: unknown): number | null => {
    if (x == null || x === '') return null;
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  };
  for (const f of feats) {
    const a = f.attributes;
    if (a.des_dugaar == null || a.obyem == null) continue;
    const des = Number(a.des_dugaar);
    const blok = String(a.blok ?? '').trim();
    const sar = sarKeyOf(a);
    if (!Number.isInteger(des) || !blok || !monthStart(sar) || !Number.isFinite(Number(a.obyem))) continue;
    const hun = numOrNull(a.hun_huch);
    const mashin = numOrNull(a.mashin_mehanizm);
    if (hun == null && mashin == null) continue;
    let byBlok = out.get(des);
    if (!byBlok) { byBlok = new Map(); out.set(des, byBlok); }
    let byMonth = byBlok.get(blok);
    if (!byMonth) { byMonth = new Map(); byBlok.set(blok, byMonth); }
    byMonth.set(sar, { hun, mashin });
  }
  return out;
}

/**
 * `dkey → ObjectID` индекс, ДАВХАРДЛЫГ ялган.
 */
export function indexOids(
  feats: readonly { attributes: Record<string, unknown> }[],
): { oids: Map<string, number>; dups: number[] } {
  const oids = new Map<string, number>();
  const dups: number[] = [];
  for (const f of feats) {
    const k = String(f.attributes.dkey ?? '');
    const o = f.attributes.objectid;
    if (!k || o == null) continue;
    const was = oids.get(k);
    if (was != null) dups.push(was);
    oids.set(k, Number(o));
  }
  return { oids, dups };
}

/* ══════════════════ Бичилтийн багц ══════════════════ */

/** `applyEdits`-д бэлэн багц */
export type PlanEdits = {
  adds: Record<string, unknown>[];
  updates: Record<string, unknown>[];
  deletes: number[];
  dups?: number[];
};

/**
 * НЭГ БЛОКИЙН сарын задаргааг ОРЛУУЛАХ багц — цэвэр функц, тестлэгдэнэ.
 *
 * @param oids `dkey → ObjectID` (аль хэдийн байгаа мөрүүд)
 */
/**
 * Сарын НӨӨЦИЙН бичилт (2026-09-24) — `buildEdits`-ийн 6 дахь, СОНГОМОЛ аргумент.
 */
export type ResEdits = {
  cur: ReadonlyMap<string, MonthRes>;
  prev: ReadonlyMap<string, MonthRes>;
  fields: { hun: boolean; mashin: boolean };
};

export function buildEdits(
  meta: WorkMeta,
  blok: string,
  months: ReadonlyMap<string, number>,
  prev: ReadonlyMap<string, number>,
  oids: ReadonlyMap<string, number>,
  res?: ResEdits,
): PlanEdits {
  const out: PlanEdits = { adds: [], updates: [], deletes: [] };
  const resAttrs = (sar: string): Record<string, unknown> => {
    if (!res) return {};
    const v = res.cur.get(sar);
    const o: Record<string, unknown> = {};
    if (res.fields.hun) o.hun_huch = v?.hun ?? null;
    if (res.fields.mashin) o.mashin_mehanizm = v?.mashin ?? null;
    return o;
  };
  /** Нөөц (бичигдэх талбаруудаар) өөрчлөгдсөн үү */
  const resChanged = (sar: string): boolean => {
    if (!res) return false;
    const a = res.cur.get(sar);
    const b = res.prev.get(sar);
    return (res.fields.hun && (a?.hun ?? null) !== (b?.hun ?? null))
      || (res.fields.mashin && (a?.mashin ?? null) !== (b?.mashin ?? null));
  };
  const attrs = (sar: string, v: number) => ({
    dkey: dkeyOf(meta.bagts, meta.des, blok, sar),
    turul: TURUL_PLAN,
    bagts: meta.bagts,
    bagts_ner: meta.bagtsNer,
    des_dugaar: meta.des,
    ajil_no: meta.ajilNo,
    ajil_ner: meta.ajilNer,
    blok,
    sar: sarDateOnly(sar),
    sar_txt: sar,
    obyem: v,
    negj: meta.negj,
    niit_obyem: meta.niit,
    ...resAttrs(sar),
  });

  for (const [sar, v] of months) {
    const key = dkeyOf(meta.bagts, meta.des, blok, sar);
    const oid = oids.get(key);
    if (oid == null) { out.adds.push({ attributes: attrs(sar, v) }); continue; }
    if (prev.get(sar) === v && !resChanged(sar)) continue;   // өөрчлөгдөөгүй (обьём ∧ нөөц)
    out.updates.push({ attributes: { objectid: oid, ...attrs(sar, v) } });
  }
  for (const sar of prev.keys()) {
    if (months.has(sar)) continue;
    const oid = oids.get(dkeyOf(meta.bagts, meta.des, blok, sar));
    if (oid != null) { out.deletes.push(oid); continue; }
    console.warn(
      `[selbe] сарын обьём: ${meta.des} · ${blok} · ${sar} — OID олдсонгүй, устгагдсангүй.`,
      'Хуудсаа дахин ачаалж хадгална уу.',
    );
  }
  return out;
}

/* ══════════════════ Сүлжээ ══════════════════ */

const FIELDS = [
  'objectid', 'dkey', 'des_dugaar', 'blok', 'sar', 'sar_txt', 'obyem', 'niit_obyem',
];

/**
 * САРЫН НӨӨЦИЙН ТАЛБАР үйлчилгээнд БАЙНА УУ (2026-09-24) — `hyanalt.ts`-ийн
 * `serviceFieldNames` загвар: `?f=json`-ийг нэг удаа уншиж кэшилнэ.
 *   · `true`/`false` — байна/алга;
 *   · `null` — шалгаж чадсангүй (сүлжээ, 200-алдаа): дуудагч «мэдэхгүй».
 */
let resFieldsCache: { hun: boolean; mashin: boolean } | null = null;
let resFieldsFlight: Promise<{ hun: boolean | null; mashin: boolean | null }> | null = null;
export async function obyemResFields(): Promise<{ hun: boolean | null; mashin: boolean | null }> {
  if (resFieldsCache) return resFieldsCache;
  if (resFieldsFlight) return resFieldsFlight;
  const p = (async () => {
    try {
      const j = await agsFetch(HUVAARI_OBYEM, {}) as { fields?: { name: string }[] };
      if (!Array.isArray(j.fields)) return { hun: null, mashin: null };
      const names = new Set(j.fields.map((x) => x.name));
      resFieldsCache = { hun: names.has('hun_huch'), mashin: names.has('mashin_mehanizm') };
      return resFieldsCache;
    } catch {
      return { hun: null, mashin: null };
    } finally {
      resFieldsFlight = null;
    }
  })();
  resFieldsFlight = p;
  return p;
}

/**
 * Багцын БҮХ төлөвлөгөөг татна.
 */
export async function loadPkgPlan(
  bagts: string,
): Promise<{ plan: PkgPlan; res: PkgRes; oids: Map<string, number>; dups: number[] }> {
  const rf = await obyemResFields();
  const outFields = rf.hun == null || rf.mashin == null
    ? '*'
    : [...FIELDS, ...(rf.hun ? ['hun_huch'] : []), ...(rf.mashin ? ['mashin_mehanizm'] : [])].join(',');
  const feats: { attributes: Record<string, unknown> }[] = [];
  for (let off = 0; ; ) {
    const j = await agsFetch(`${HUVAARI_OBYEM}/query`, {
      where: `bagts = '${bagts.replace(/'/g, "''")}' AND turul = '${TURUL_PLAN}'`,
      outFields,
      orderByFields: 'objectid ASC',
      resultOffset: String(off),
      resultRecordCount: '2000',
      returnGeometry: 'false',
    });
    const f = (j.features ?? []) as { attributes: Record<string, unknown> }[];
    feats.push(...f);
    if (!f.length || (!j.exceededTransferLimit && f.length < 2000)) break;
    off += f.length;
  }
  const { oids, dups } = indexOids(feats);
  return { plan: toPkgPlan(feats), res: toPkgRes(feats), oids, dups };
}

/**
 * ТӨЛӨВЛӨГӨӨНИЙ МӨРИЙН ТОО — хүснэгт бүхэлдээ (`turul = 'tolovlolt'`), нэг `returnCountOnly` асуулга.
 */
export async function countPlanRows(): Promise<number | null> {
  try {
    const j = await agsFetch(`${HUVAARI_OBYEM}/query`, {
      where: `turul = '${TURUL_PLAN}'`,
      returnCountOnly: 'true',
    }) as { count?: unknown };
    const c = Number(j.count);
    return Number.isFinite(c) ? c : null;
  } catch {
    return null;
  }
}

/**
 * Багц засварыг хадгална. Буцаах нь (нэмсэн, шинэчилсэн, устгасан) тоо.
 */
/** `applyPlanEdits`-ийн тасарсан шат (2026-10-12) — `all` = ≤500 мөрийн нэг хүсэлт */
export type PlanWritePhase = 'all' | 'dups' | 'adds' | 'updates' | 'deletes';
/**
 * `applyPlanEdits`-ийн шидсэн алдааны нэмэлт талбарууд (2026-10-12): `written` — тасрахаас ӨМНӨ
 * баталгаатай бичигдсэн мөр; `total` — нийт илгээх мөр; `phase` — тасарсан шат.
 */
export type PlanWriteErr = Error & { written?: number; total?: number; phase?: PlanWritePhase };
export async function applyPlanEdits(e: PlanEdits): Promise<[number, number, number]> {
  const chunk = <T>(a: T[]) => {
    const out: T[][] = [];
    for (let i = 0; i < a.length; i += 500) out.push(a.slice(i, i + 500));
    return out;
  };
  let a = 0; let u = 0; let dl = 0;
  let lost = false;
  type Res = { success?: boolean; error?: { description?: string } };
  let total = 0;
  const run = async (body: Record<string, string>, want: [number, number, number], phase: PlanWritePhase) => {
    try {
      const j = await agsFetch(`${HUVAARI_OBYEM}/applyEdits`, {
        ...body, rollbackOnFailure: 'true',
      });
      const keys = ['addResults', 'updateResults', 'deleteResults'] as const;
      for (let n = 0; n < keys.length; n += 1) {
        const res = (j[keys[n]] ?? []) as Res[];
        const bad = res.find((r) => r.success === false);
        if (bad) {
          throw new Error(
            `${bad.error?.description || tr('Хуваарийн обьём хадгалагдсангүй')}`
            + ` ${tr('({0} нэмсэн · {1} шинэчилсэн · {2} устгасан)', String(a), String(u), String(dl))}`,
          );
        }
        const unsure = res.some((r) => r.success !== true);
        if (res.length !== want[n] || unsure) {
          throw new ArcGISError(
            `${res.length !== want[n]
              ? tr('Серверээс {0} мөрийн хариу ирэх ёстой, {1} ирлээ', want[n], res.length)
              : tr('Серверийн хариунд мөрийн үр дүн алга — бичигдсэн эсэх тодорхойгүй')}`
            + ` ${tr('({0} нэмсэн · {1} шинэчилсэн · {2} устгасан)', String(a), String(u), String(dl))}`,
            `${HUVAARI_OBYEM}/applyEdits`,
          );
        }
      }
      a += want[0]; u += want[1]; dl += want[2];
    } catch (err) {
      if (err && typeof err === 'object') {
        const x = err as PlanWriteErr;
        x.written = a + u + dl;
        x.total = total;
        x.phase = phase;
      }
      throw err;
    }
  };
  try {
    const dupSet = new Set((e.dups ?? []).filter((x) => Number.isFinite(x)));
    const dups = [...dupSet];
    const rest = e.deletes.filter((x) => !dupSet.has(x));
    const deletes = [...dups, ...rest];
    total = e.adds.length + e.updates.length + deletes.length;
    if (total > 0 && total <= 500) {
      const body: Record<string, string> = {};
      if (e.adds.length) body.adds = JSON.stringify(e.adds);
      if (e.updates.length) body.updates = JSON.stringify(e.updates);
      if (deletes.length) body.deletes = deletes.join(',');
      await run(body, [e.adds.length, e.updates.length, deletes.length], 'all');
    } else {
      for (const c of chunk(dups)) await run({ deletes: c.join(',') }, [0, 0, c.length], 'dups');
      for (const c of chunk(e.adds)) await run({ adds: JSON.stringify(c) }, [c.length, 0, 0], 'adds');
      for (const c of chunk(e.updates)) await run({ updates: JSON.stringify(c) }, [0, c.length, 0], 'updates');
      for (const c of chunk(rest)) await run({ deletes: c.join(',') }, [0, 0, c.length], 'deletes');
    }
  } catch (err) {
    if (isLostWrite(err)) lost = true;
    throw err;
  } finally {
    if (a + u + dl > 0 || lost) invalidate('HUVAARI_OBYEM');
  }
  return [a, u, dl];
}
