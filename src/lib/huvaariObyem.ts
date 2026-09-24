/**
 * ХУВААРИЙН САРЫН ОБЬЁМ — төлөвлөсөн тоо хэмжээг САР ТУТМААР.
 *
 * ⚠️ ЯАГААД (2026-09-06, хэрэглэгчийн шаардлага): «нэг ажил дээр хуваарь
 * татахад хуваарийн дагуу төлөвлөсөн сард нийт обьёмыг сар сард тохируулдаг
 * болгомоор байна; сар сард өөр обьём бичиж болно; бичсэн обьёмуудын нийлбэр
 * төлөвлөсөн обьёмтой ТЭНЦҮҮ байх ёстой».
 *
 * ⚠️ ЯАГААД ТУСДАА ҮЙЛЧИЛГЭЭ, `Bagts_*`-ийн БАГАНА БИШ (хэрэглэгчийн шийдвэр):
 *   · Задаргаа нь БЛОК бүрд — 22 блок × 32 сар = 704 багана нэг хуудсанд,
 *     10 үйлчилгээнд 3,872 багана. Боломжгүй.
 *   · Хүснэгт бол сар ч, блок ч МӨР болно: 2029 он ирлээ ч схем хөндөгдөхгүй.
 *   · «Систем эвдэрвэл яах вэ, төслийн явцын дата бүтэн хадгалагдах ёстой» —
 *     энэ хүснэгтийн мөр бүр (багц · ажил · блок · сар · обьём · нэгж) өөрөө
 *     уншигдана: ArcGIS Pro, Excel, CSV — апп огт хэрэггүй.
 *
 * ⚠️ ХОЛБООС нь `Des_dugaar` (ажлын код). `ObjectID` нийтлэх бүрд солигддог тул
 * ашиглах БОЛОМЖГҮЙ; `(№ + ажлын нэр)` нь ердөө 35–40% давтагдашгүй. Ажлын код
 * нь 10/10 багцад 100% бөглөгдсөн, 100% давтагдашгүй бөгөөд нийтлэл хооронд
 * ТОГТВОРТОЙ (3 багц · 8,000 мөр дээр хэмжихэд 0 өөрчлөлт): байгаа код хэзээ ч
 * дахин дугаарлагддаггүй, шинэ мөрд `max + 1` олгогддог (`sheetFrame.ts`).
 * «Хуваарь»-ийн УЯЛДАА (`Hamaaral` = «18FS3») аль хэдийн энэ кодоор ажилладаг
 * тул шинэ эрсдэл нэмэгдэхгүй.
 *
 * ⚠️ React импортлохгүй — `huvaariObyem.check.mjs` шууд Node дээр ачаална.
 */
import { agsFetch } from '@/modules/sheet/ags';
import { HJ } from '@/lib/services';
import { DAY, type Span } from './plan';

/**
 * Үйлчилгээ — ГАНЦ хүснэгт, геометргүй.
 * ⚠️ Давхаргын дугаар нь `0` БИШ `193` (CSV-ээс нийтлэхэд ArcGIS өөрөө өгсөн).
 */
export const HUVAARI_OBYEM = `${HJ}/huvaari_20260906/FeatureServer/193`;

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
 * ⚠️ 10-15 → 12-10 нь ГУРВАН сар (10, 11, 12) — «бүтэн сар л тооцно» гэвэл
 *    захын обьём хаягдана.
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
 *
 * ⚠️ АВТОМАТ ТАРААЛТ ХОРИОТОЙ (2026-09-06, хэрэглэгч: «автомат обьём
 *    тараалт хийж болохгүй, бүгд хоосон байх ёстой»). Урьд нь хоногийн
 *    тоогоор пропорциональ тараадаг байсныг БҮРЭН хассан: тараасан тоо нь
 *    төлөвлөгөө мэт харагдах ч үнэндээ таамаг бөгөөд хүн шалгалгүй
 *    хадгалахад хуурамч төлөвлөгөө өгөгдөлд суудаг.
 *
 * ⚠️ БАЙГАА утгыг ХАДГАЛНА: муж өөрчлөгдөхөд ХЭВЭЭР үлдсэн саруудын гараар
 *    оруулсан тоо алдагдахгүй; шинэ сарууд ХООСОН (Map-д ОГТ БАЙХГҮЙ)
 *    үлдэнэ. Мужаас гарсан сарын утга хасагдана — эс бөгөөс нийлбэр
 *    хаанаас ч гараагүй тоогоор давна.
 *
 * ⚠️ «Хоосон» гэдгийг `0`-ЭЭР ИЛЭРХИЙЛЭХГҮЙ (`null ≠ 0`): 0 нь «тэр сард
 *    ажил хийхгүй» гэсэн БОДИТ төлөвлөгөө. Хоосон сар нь Map-д байхгүй.
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
 *
 * ⚠️ ОБЬЁМТОЙ ЗЭРЭГЦЭЭ, тусдаа Map — `PkgPlan`/`obDraft`-ын утгын хэлбэр
 *    ХЭВЭЭР: `planPctFromMonths` (FillNew), `monPct` (Huvaari), `keepMonths`/
 *    `balanced`/`sumMonths`, ноорогийн `m:` нүд, `PlanPayload.obyem` бүгд
 *    өөрчлөгдөхгүй — хуучин ноорог/илгээлт шилжүүлэлтгүй ажиллана.
 * ⚠️ Хүснэгтийн `hun_huch`/`mashin_mehanizm` талбар (Double) нь AGOL дээр
 *    ХОЖИМ нэмэгддэг — байхгүйг тэсвэрлэнэ (`obyemResFields`).
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
 * ⚠️ Нэг ч сард утга байхгүй бол `null` (0 БИШ): «бөглөөгүй» ≠ «тэг».
 * ⚠️ Утга бүрийг БҮХЭЛ болгож (`Math.floor`) нэмнэ (2026-09-24): мөрийн
 *    `hun_huch`/`mashin_mehanizm` нь Integer талбар — бутархай нийлбэр
 *    ArcGIS-д таслагдаж, дэлгэц дээрхээс зөрдөг байв.
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
 *
 * ⚠️ ХАТУУ `===` БИШ: 0.01 нарийвчлалтай тарааснаас хойш хөвөгч цэгийн алдаа
 *    (0.1 + 0.2 ≠ 0.3) үлддэг. Хагас нэгжийн тэвчээр нь бодит бөглөлтөд
 *    мэдрэгдэхгүй ч худал «таарахгүй» гэж няцаахаас сэргийлнэ.
 */
export const balanced = (
  m: ReadonlyMap<string, number>,
  total: number,
  step = 0.01,
): boolean => Math.abs(sumMonths(m) - total) < step / 2;

/* ══════════════════ Төлөвлөгөөт хувь (S-муруй) ══════════════════ */

/**
 * САРЫН ОБЬЁМООС төлөвлөгөөт гүйцэтгэлийн хувь (0–1) — хэрэглэгчийн шийдвэр №5а.
 *
 * ⚠️ Одоогийн `planAt` нь эхлэх→дуусах хооронд ШУЛУУН ШУГАМААР интерполяци
 *    хийдэг. Сарын задаргаа байгаа үед тэр нь худал: 6 сарын ажлын 80% нь
 *    сүүлийн сард төлөвлөгдсөн байж болно. Энэ функц нь БОДИТ хуваарилалтаас
 *    муруйг гаргана.
 *
 * ⚠️ Сар ДОТОР нь шугаман: тухайн сарын хэдэн хувь өнгөрснөөр нь. Сарын дотоод
 *    задаргаа байхгүй тул үүнээс нарийн таамаглах эх сурвалж алга.
 *
 * ⚠️ Хоосон задаргаа → `null` («мэдэгдэхгүй»), 0 БИШ. Дуудагч нь хуучин
 *    шугаман зам руу буцна.
 */
export function planPctFromMonths(
  m: ReadonlyMap<string, number>,
  asOf: number,
): number | null {
  const total = sumMonths(m);
  if (!(total > 0)) return null;
  const keys = [...m.keys()].sort();
  let done = 0;
  for (const k of keys) {
    const ms = monthStart(k);
    if (ms == null) continue;
    const me = monthEnd(k);
    const v = m.get(k) ?? 0;
    if (asOf >= me) { done += v; continue; }
    if (asOf < ms) break;
    /* Сар дотор — өнгөрсөн хоногийн хувиар */
    const all = Math.round((me - ms) / DAY) + 1;
    const gone = Math.round((asOf - ms) / DAY) + 1;
    done += (v * gone) / all;
    break;
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
 *
 * ⚠️ САНГИЙН ТҮВШНИЙ ХАМГААЛАЛТ БАЙХГҮЙ (2026-09-08-нд амьд үйлчилгээ рүү
 *    шалгав: FeatureServer/193-ийн unique индекс нь ЗӨВХӨН OBJECTID ба
 *    GlobalID дээр — `dkey` дээр индекс АЛГА). Урьд нь энэ тайлбар «unique
 *    индекс давхардлыг таслана» гэж БАТАЛДАГ байсан нь ХУДАЛ: хоёр хэрэглэгч
 *    (эсвэл нэг хүн хоёр таб) зэрэг хадгалахад хоёулаа `oids`-д мөр олохгүй
 *    тул хоёр `add` явж, ижил `dkey`-тэй ХОЁР мөр үүснэ.
 * ⚠️ Тиймээс давхардлыг КОД талд арилгана: `loadPkgPlan` нь илүүдэл мөрийн
 *    OID-уудыг `dups`-аар буцааж, дуудагч нь дараагийн бичилтэд устгуулна.
 *    Жинхэнэ шийдэл нь ArcGIS дээр `dkey`-д unique индекс нэмэх (админы
 *    `addToDefinition`) — тэр хийгдтэл энэ нь цорын ганц хаалт.
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

/** Түүхий `features` → бүтэц. Гэмтэлтэй мөрийг АЛГАСНА, унагахгүй. */
export function toPkgPlan(
  feats: readonly { attributes: Record<string, unknown> }[],
): PkgPlan {
  const out: PkgPlan = new Map();
  for (const f of feats) {
    const a = f.attributes;
    /* ⚠️ `null`-ыг ТУСАД НЬ шалгана: `Number(null)` нь `0` буюу «хүчинтэй»
       тоо болдог тул кодгүй мөр 0 дугаартай ажил болж, обьёмгүй мөр 0 обьём
       болж чимээгүй орж ирнэ (төслийн баримтжуулсан «null ≠ 0» занга). */
    if (a.des_dugaar == null || a.obyem == null) continue;
    const des = Number(a.des_dugaar);
    const blok = String(a.blok ?? '').trim();
    const sar = String(a.sar_txt ?? '').trim();
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
    const sar = String(a.sar_txt ?? '').trim();
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
 *
 * ⚠️ ДАВХАРДСАН `dkey` (2026-09-08). Сангийн түвшинд unique индекс БАЙХГҮЙ
 *    (`dkeyOf`-ийн тайлбар) тул зэрэг хадгалалт ижил түлхүүртэй хоёр мөр
 *    үүсгэж чадна. Апп дотор нь сүүлийнх нь өмнөхийг дардаг тул ХАРАГДАХГҮЙ,
 *    гэтэл ArcGIS Pro / Excel-ээр уншихад обьём ХОЁР ДАХИН тоологдоно — энэ
 *    хүснэгтийн үндсэн зорилго («мөр бүр өөрөө уншигдана») задарна.
 *
 * ⚠️ СҮҮЛИЙН мөр үлдэнэ, өмнөхүүд нь `dups` руу — `toPkgPlan` нь
 *    `byMonth.set(sar, v)` гэж СҮҮЛИЙНХЭЭР дардаг тул харагдаж буй утга ба
 *    шинэчлэгдэх OID НЭГ мөрийг заана. Эсрэгээр (эхнийхийг үлдээвэл)
 *    хэрэглэгч нэг тоо хараад ӨӨР мөр засагдана.
 *
 * ⚠️ Дуудагч нь `dups`-ыг дараагийн бичилтэд `deletes`-т нийлүүлж арилгана.
 *    Энд устгахгүй: унших зам бичих ЁСГҮЙ.
 */
export function indexOids(
  feats: readonly { attributes: Record<string, unknown> }[],
): { oids: Map<string, number>; dups: number[] } {
  const oids = new Map<string, number>();
  const dups: number[] = [];
  for (const f of feats) {
    const k = String(f.attributes.dkey ?? '');
    const o = f.attributes.OBJECTID;
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
};

/**
 * НЭГ БЛОКИЙН сарын задаргааг ОРЛУУЛАХ багц — цэвэр функц, тестлэгдэнэ.
 *
 * @param oids `dkey → ObjectID` (аль хэдийн байгаа мөрүүд)
 *
 * ⚠️ ОРЛУУЛНА, нэмэхгүй: тухайн (ажил · блок)-ийн хуучин саруудаас шинэ
 *    жагсаалтад ОРООГҮЙ нь УСТГАГДАНА. Эс бөгөөс хуваарийг богиносгоход
 *    хуучин сарын обьём үлдэж, нийлбэр нь нийт обьёмоос давна.
 *
 * ⚠️ Утга нь ӨӨРЧЛӨГДӨӨГҮЙ мөрийг илгээхгүй — 22 блок × 32 сар бүрийг
 *    дарж бичвэл нэг зурвас чирэхэд 700 мөр дэмий шинэчлэгдэнэ.
 */
/**
 * Сарын НӨӨЦИЙН бичилт (2026-09-24) — `buildEdits`-ийн 6 дахь, СОНГОМОЛ аргумент.
 * ⚠️ `fields` — үйлчилгээнд талбар БАЙГАА эсэх (`obyemResFields`): байхгүй
 *    талбарыг `attrs`-д ОРУУЛАХГҮЙ — ArcGIS танихгүй талбарыг чимээгүй алгасах
 *    эсвэл бүх мөрийг унагах тул дуудагч тал анхааруулна.
 * ⚠️ ОБЬЁМГҮЙ сарын нөөц БИЧИГДЭХГҮЙ: мөр нь обьёмоор л үүсдэг (`months`) —
 *    обьёмгүй сард мөр байхгүй тул нөөцийг наах газар алга. Энд ЧИМЭЭГҮЙ
 *    хаягдана — дуудагч (`save`) `months`-оос гадуурх сарыг урьдчилан
 *    хасаж, тоолж анхааруулна (2026-09-24).
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
    /* ⚠️ `sar` нь `DateOnly` — цагийн бүсгүй, сарын 1-ний өдөр */
    sar: monthStart(sar),
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
    out.updates.push({ attributes: { OBJECTID: oid, ...attrs(sar, v) } });
  }
  for (const sar of prev.keys()) {
    if (months.has(sar)) continue;
    const oid = oids.get(dkeyOf(meta.bagts, meta.des, blok, sar));
    if (oid != null) { out.deletes.push(oid); continue; }
    /*
     * ⚠️ OID АЛГА — устгаж ЧАДАХГҮЙ (2026-09-11-ний аудит). `prev` ба `oids`
     *    хоёулаа `loadPkgPlan`-ы НЭГ ачаалалтаас гардаг тул хэвийн урсгалд
     *    зөрөхгүй; зөрөх нь зөвхөн хуудаслалт хагас унасан үед. Тэр мөр
     *    санд үлдэж нийлбэр нь нийт обьёмоос давна — чимээгүй алгасахгүй,
     *    консолд нэрлэж хэлнэ. Дараагийн ачаалалт `indexOids`-оор засна.
     */
    console.warn(
      `[selbe] сарын обьём: ${meta.des} · ${blok} · ${sar} — OID олдсонгүй, устгагдсангүй.`,
      'Хуудсаа дахин ачаалж хадгална уу.',
    );
  }
  return out;
}

/* ══════════════════ Сүлжээ ══════════════════ */

const FIELDS = [
  'OBJECTID', 'dkey', 'des_dugaar', 'blok', 'sar_txt', 'obyem', 'niit_obyem',
];

/**
 * САРЫН НӨӨЦИЙН ТАЛБАР үйлчилгээнд БАЙНА УУ (2026-09-24) — `hyanalt.ts`-ийн
 * `serviceFieldNames` загвар: `?f=json`-ийг нэг удаа уншиж кэшилнэ.
 *   · `true`/`false` — байна/алга;
 *   · `null` — шалгаж чадсангүй (сүлжээ, 200-алдаа): дуудагч «мэдэхгүй».
 * ⚠️ Зөвхөн АМЖИЛТТАЙ хариуг кэшилнэ — `null` кэшлэвэл түр саат сешн даяар
 *    тогтмолжино (`draftRemote.tableUrl`-ийн ижил дүрэм).
 */
let resFieldsCache: { hun: boolean; mashin: boolean } | null = null;
export async function obyemResFields(): Promise<{ hun: boolean | null; mashin: boolean | null }> {
  if (resFieldsCache) return resFieldsCache;
  try {
    const j = await agsFetch(HUVAARI_OBYEM, {}) as { fields?: { name: string }[] };
    if (!Array.isArray(j.fields)) return { hun: null, mashin: null };
    const names = new Set(j.fields.map((x) => x.name));
    resFieldsCache = { hun: names.has('hun_huch'), mashin: names.has('mashin_mehanizm') };
    return resFieldsCache;
  } catch {
    return { hun: null, mashin: null };
  }
}

/**
 * Багцын БҮХ төлөвлөгөөг татна.
 *
 * ⚠️ 2000 мөрийн хуудаслалт — `orderByFields` ЗААВАЛ, эс бөгөөс ArcGIS хуудас
 *    хооронд мөр давхардуулах/алгасах эрхтэй.
 * ⚠️ `sar_txt`-ээр (текст) шүүнэ, `sar`-аар (огноо) БИШ — огнооны талбарыг
 *    мөрийн литералтай харьцуулах нь цагийн бүсээр гулсдаг.
 */
/**
 * ⚠️ `res` (2026-09-24) — сарын нөөц, НЭМЭЛТ талбар: FillNew/planProgress/
 *    hyanalt `.plan`-ыг л уншдаг хэвээр.
 * ⚠️ `outFields`-д БАЙХГҮЙ талбар оруулбал query БҮХЭЛДЭЭ унадаг тул нөөцийн
 *    талбарыг `obyemResFields`-ээр шалгаад л нэмнэ; шалгаж чадаагүй бол `*`
 *    (бүх талбар — байгаа нь ирнэ, байхгүй нь unдаггүй).
 */
export async function loadPkgPlan(
  bagts: string,
): Promise<{ plan: PkgPlan; res: PkgRes; oids: Map<string, number>; dups: number[] }> {
  const rf = await obyemResFields();
  const outFields = rf.hun == null || rf.mashin == null
    ? '*'
    : [...FIELDS, ...(rf.hun ? ['hun_huch'] : []), ...(rf.mashin ? ['mashin_mehanizm'] : [])].join(',');
  const feats: { attributes: Record<string, unknown> }[] = [];
  for (let off = 0; ; off += 2000) {
    const j = await agsFetch(`${HUVAARI_OBYEM}/query`, {
      where: `bagts = '${bagts.replace(/'/g, "''")}' AND turul = '${TURUL_PLAN}'`,
      outFields,
      orderByFields: 'OBJECTID ASC',
      resultOffset: String(off),
      resultRecordCount: '2000',
      returnGeometry: 'false',
    });
    const f = (j.features ?? []) as { attributes: Record<string, unknown> }[];
    feats.push(...f);
    if (f.length < 2000) break;
  }
  const { oids, dups } = indexOids(feats);
  return { plan: toPkgPlan(feats), res: toPkgRes(feats), oids, dups };
}

/**
 * Багц засварыг хадгална. Буцаах нь (нэмсэн, шинэчилсэн, устгасан) тоо.
 *
 * ⚠️ Алдаа HTTP 200-аар ирдэг — үр дүн бүрийн `success`-ыг ЗААВАЛ шалгана,
 *    эс бөгөөс «хадгаллаа» гэж ХУДАЛ мэдээлнэ.
 * ⚠️ 500-аар хуваан илгээнэ; `rollbackOnFailure` нь НЭГ багц дотор л үйлчилнэ
 *    тул багц дундуур унавал хэдэн мөр амжсаныг мессежид ХЭЛНЭ.
 */
export async function applyPlanEdits(e: PlanEdits): Promise<[number, number, number]> {
  const chunk = <T>(a: T[]) => {
    const out: T[][] = [];
    for (let i = 0; i < a.length; i += 500) out.push(a.slice(i, i + 500));
    return out;
  };
  let a = 0; let u = 0; let dl = 0;
  const run = async (body: Record<string, string>) => {
    const j = await agsFetch(`${HUVAARI_OBYEM}/applyEdits`, {
      ...body, rollbackOnFailure: 'true',
    });
    for (const k of ['addResults', 'updateResults', 'deleteResults'] as const) {
      const res = (j[k] ?? []) as { success?: boolean; error?: { description?: string } }[];
      const bad = res.find((r) => r.success === false);
      if (bad) {
        throw new Error(
          `${bad.error?.description || 'Хуваарийн обьём хадгалагдсангүй'}`
          + ` (${a} нэмсэн · ${u} шинэчилсэн · ${dl} устгасан)`,
        );
      }
      if (k === 'addResults') a += res.length;
      if (k === 'updateResults') u += res.length;
      if (k === 'deleteResults') dl += res.length;
    }
  };
  for (const c of chunk(e.adds)) await run({ adds: JSON.stringify(c) });
  for (const c of chunk(e.updates)) await run({ updates: JSON.stringify(c) });
  for (const c of chunk(e.deletes)) await run({ deletes: c.join(',') });
  return [a, u, dl];
}
