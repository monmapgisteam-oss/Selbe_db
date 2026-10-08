/**
 * ГҮЙЦЭТГЭЛЭЭС IPC МӨР ҮҮСГЭХ — цэвэр логик.
 *
 * ЗАРЧИМ (хэрэглэгчийн шийдвэр 2026-09-09): «ho гүйцэтгэлийн дата гүйцэтгэл
 * бөглөгдөхөд нэмэгдэх ёстой». Гүйцэтгэл 4 шатын хяналт дамжиж архивт
 * ормогц `HO_guitsetgel` үйлчилгээнд IPC мөр АВТОМАТААР нэмэгдэнэ.
 *
 * ⚠️ ШИНЭ МӨРД БИЧИГДЭХ: `guits_obyem` (бөглөсөн обьём), `guits_une`
 * (обьём × нэгж өртөг), `guilgee_ognoo` (гүйцэтгэл батлагдсан огноо),
 * `geree_kod`, `bagts`, `on_`, `tulult_turul`. Захирамж, гэрээний
 * дугаар, IPC дугаар ба `dun` нь ХООСОН — санхүүгийн газар нөхнө. Хэрэглэгчийн үг: «бусад холбогдох мэдээллийг оруулдаг
 * хэсэг нэмэгдэнэ гэхдээ тэр нь болоогүй мэдээллүүд хоосон, зөвхөн обьём
 * мөнгөн дүн харагдаад явна».
 *
 * ⚠️ ГРЕЙН: НЭГ БАГЦ · НЭГ АГШИН (өдөр) = НЭГ МӨР. Хэрэглэгчийн засвар
 * (2026-09-10): «гүйцэтгэл орсон болгоор ipc». Батлагдсан бөглөлт БҮРД
 * өөрийн IPC мөр үүснэ — сард нэгтгэхгүй.
 *
 * ⚠️ ЯГ ИЖИЛ ӨДРИЙН бөглөлт ДАХИН батлагдвал (буцаагдаад дахин илгээгдсэн)
 * тэр мөр ШИНЭЧЛЭГДЭНЭ, ХОЁР ДАХЬ мөр үүсэхгүй — эс бөгөөс нэг агшны
 * гүйцэтгэл хоёр удаа тоологдоно.
 *
 * ⚠️ `dun` (олгосон дүн) -д ЮУ Ч БИЧИХГҮЙ. Тэр нь БОДИТ гүйлгээ — банкнаас
 * гарсан мөнгө. Обьёмоос бодсон дүнг тэнд бичвэл «олгосон» гэсэн худал
 * хэмжилт үүсэж, `sumPaid()` нь хийгдээгүй төлбөрийг нийлбэрт оруулна.
 *
 * ⚠️ React импортлохгүй, сүлжээ дуудахгүй — `ipcAuto.check.mjs` шууд Node
 * дээр ачаална. БҮХ экспорт ЦЭВЭР функц.
 */
import { HO_IPC, num, pkgKeyOf } from '@/lib/services';
import { LINK_FIELDS } from '@/lib/ipcLink';
import { t as tr } from '@/lib/i18nCore';

type Row = Record<string, unknown>;

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;

/** `YYYY-MM-DD` хэлбэрийг баталгаажуулна. Танихгүй бол `null`. */
export function dayOf(day: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(day).trim());
  return m ? m[1] : null;
}

/**
 * ТУХАЙН БАГЦ · ТУХАЙН АГШНЫ автоматаар үүсгэсэн мөрийг олно.
 *
 * ⚠️ ЗӨВХӨН АВТОМАТ мөрийг барина (`murun_id` нь `AUTO|` угтвартай).
 * Санхүүгийн газрын ГАРААР оруулсан мөрийг ХЭЗЭЭ Ч дарж бичихгүй — тэр нь
 * бодит гүйлгээний баримт.
 *
 * ⚠️ Багцыг `pkgKeyOf`-оор жишнэ (`bagtsKey` БИШ) — «Багц-1-4» мэт
 * диапазон мөр бодит «Багц 14»-т наалдахаас сэргийлнэ.
 */
export function findAutoRow(
  rows: readonly Row[],
  pkgKey: string,
  day: string,
): Row | null {
  if (!pkgKey || !day) return null;
  return rows.find((r) => {
    if (!isAuto(r)) return false;
    if (pkgKeyOf(r[C.pkg]) !== pkgKey) return false;
    return autoDay(r) === day;
  }) ?? null;
}

/** Мөрийн ID-гийн угтвар — автоматаар үүссэн мөрийг таних цорын ганц тэмдэг */
export const AUTO_PREFIX = 'AUTO|';

/** Автоматаар үүссэн мөр мөн үү */
export const isAuto = (r: Row): boolean =>
  String(r[P.id] ?? '').startsWith(AUTO_PREFIX);

/**
 * Автомат мөрийн АГШНЫ ОГНОО — `murun_id`-гаас (`AUTO|БАГЦ33|2026-09-09`).
 * ⚠️ `guilgee_ognoo`-гоос УНШИХГҮЙ: `autoInsert` түүнд батлалтын өдрийг
 * бичдэг ч дараа нь санхүүгийн газар бодит гүйлгээний огноогоор дарж бичиж
 * болно — түлхүүр нь БӨГЛӨЛТИЙН огноо байх ЁСТОЙ, төлбөрийн огноо биш.
 * (⚠️ 2026-09-25: урьдын «тэр нь ХООСОН» тайлбар хуучирсан байв.)
 */
export function autoDay(r: Row): string | null {
  const parts = String(r[P.id] ?? '').split('|');
  return parts.length >= 3 ? parts[2] : null;
}

/**
 * ТУХАЙН БАГЦЫН гэрээний кодыг БАЙГАА мөрөөс олно.
 *
 * ⚠️ ЗӨВХӨН ГАРААР оруулсан мөрөөс (`isAuto` биш) — автомат мөрөөс авбал
 * анхны алдаа мөнхөрнө.
 *
 * ⚠️ Кодгүй мөр (`geree_kod` хоосон) нь тохирохгүй: тэр нь ХО-0045 мэт
 * «кодгүй гэрээ» бөгөөд шинэ мөрийг тийш нь наавал буруу бүлэгт очно.
 */
export function contractCodeOf(rows: readonly Row[], pkgKey: string): string {
  return contractFor(rows, pkgKey).code;
}

/** Барилга угсралтын гэрээний `ajliin_turul` (амьдаар «Барилга угсралт» 30 мөр) */
export const CONSTRUCTION_WORK = 'Барилга угсралт';

/** Гэрээ сонгох нэр дэвшигч — `geree_kod`, `ajliin_turul`, «Гүйцэтгэл» төлбөртэй эсэх */
export type ContractCand = { code: string; workType: string; hasWork: boolean };

const isBuildWork = (s: string): boolean =>
  s.replace(/\s+/g, ' ').trim().toLowerCase().includes(CONSTRUCTION_WORK.toLowerCase());

/**
 * НЭГ БАГЦАД ОЛОН ГЭРЭЭ таарвал AUTO гүйцэтгэлийг АЛЬ гэрээнд холбох вэ (2026-10-09).
 *
 * ⚠️ Урьд нь багцын түлхүүр таарсан ЭХНИЙ гэрээ (OID дараалал) — нэг багцад ТЭЗҮ/зураг төсөл ба
 *    барилга угсралтын гэрээ зэрэг байвал барилгын гүйцэтгэл зураг төслийн гэрээнд очих эрсдэлтэй.
 *    Дүрэм: (1) `ajliin_turul` нь «Барилга угсралт»; (2) «Гүйцэтгэл» төлбөртэй; (3) үлдсэн нь
 *    кодоор (тоон эрэмбэ) — ТОДОРХОЙ, давтагдах сонголт. (3)-т хүрвэл `warn` — дуудагч ил харуулна.
 */
export function pickContract<T extends ContractCand>(
  cands: readonly T[],
  pkgKey: string,
): { pick: T | null; warn: string | null } {
  if (!cands.length) return { pick: null, warn: null };
  if (cands.length === 1) return { pick: cands[0], warn: null };
  let left = [...cands];
  const build = left.filter((c) => isBuildWork(c.workType));
  if (build.length) left = build;
  const work = left.filter((c) => c.hasWork);
  if (work.length) left = work;
  left.sort((a, b) => a.code.localeCompare(b.code, 'mn', { numeric: true }));
  const pick = left[0];
  return {
    pick,
    warn: left.length > 1
      ? tr('«{0}» багцад {1} гэрээ ялгагдахгүй таарсан ({2}) — гүйцэтгэлийг «{3}» гэрээнд холбов. HO хүснэгтийн гэрээний код/ажлын төрлийг шалгана уу.',
        pkgKey, left.length, left.map((c) => c.code || '—').join(', '), pick.code || '—')
      : null,
  };
}

/**
 * Багцын гэрээний код + анхааруулга — ГАРААР оруулсан, кодтой мөрүүдийг кодоор бүлэглэж
 * `pickContract`-аар сонгоно. Олдохгүй бол `code: ''`.
 */
export function contractFor(rows: readonly Row[], pkgKey: string): { code: string; warn: string | null } {
  if (!pkgKey) return { code: '', warn: null };
  const by = new Map<string, ContractCand>();
  for (const r of rows) {
    if (isAuto(r)) continue;
    if (pkgKeyOf(r[C.pkg]) !== pkgKey) continue;
    const code = String(r[C.code] ?? '').trim();
    if (!code) continue;
    const c = by.get(code) ?? { code, workType: '', hasWork: false };
    if (!c.workType) c.workType = String(r[C.workType] ?? '').trim();
    if (String(r[P.kind] ?? '').trim() === HO_IPC.kinds.work) c.hasWork = true;
    by.set(code, c);
  }
  const { pick, warn } = pickContract([...by.values()], pkgKey);
  return { code: pick?.code ?? '', warn };
}

/**
 * AUTO МӨРИЙН ГЭРЭЭ — `syncIpcFromFill` ба `ipcDocLoad`-ын НЭГ эх (2026-10-09, F6).
 * ⚠️ Тухайн багцын БАЙГАА AUTO мөрүүд (хамгийн сүүлийн өдрийнх) аль гэрээний кодтой байна, тэр код нь
 *    ГАРААР оруулсан гэрээ болж хэвээр байвал ТҮҮНИЙГ сонгоно — `pickContract`-ийн дүрэм (эсвэл HO
 *    хүснэгтийн засвар) өөрчлөгдөхөд шинэ AUTO мөр өөр гэрээнд очиж, гүйцэтгэлийн түүх хоёр гэрээнд
 *    хуваагдахгүй (хуримтлал `cumPaidThrough` гэрээгээр бодогддог). Эс бөгөөс `contractFor`.
 * ⚠️ `warn` ДАМЖИНА (урьд нь `contractCodeOf` түүнийг хаядаг байв) — дуудагч ил харуулна.
 */
export function autoContractFor(rows: readonly Row[], pkgKey: string): { code: string; warn: string | null } {
  const base = contractFor(rows, pkgKey);
  if (!pkgKey) return base;
  let prev: { code: string; day: string } | null = null;
  for (const r of rows) {
    if (!isAuto(r) || pkgKeyOf(r[C.pkg]) !== pkgKey) continue;
    const code = String(r[C.code] ?? '').trim();
    if (!code) continue;
    const day = autoDay(r) ?? '';
    if (!prev || day > prev.day) prev = { code, day };
  }
  if (!prev || prev.code === base.code) return base;
  const p = prev;
  const manual = rows.some((r) => !isAuto(r) && pkgKeyOf(r[C.pkg]) === pkgKey && String(r[C.code] ?? '').trim() === p.code);
  if (!manual) return base;
  return {
    code: p.code,
    warn: base.warn || base.code
      ? tr('«{0}» багцад гэрээний сонголт «{1}» болох байсан ч өмнөх AUTO мөрүүд «{2}» гэрээнд байгаа тул гүйцэтгэлийг тийш үргэлжлүүлэн холбов. HO хүснэгтийг шалгана уу.', pkgKey, base.code || '—', p.code)
      : null,
  };
}

/** Автомат мөрийн ID — багц ба АГШНААР ДАВТАГДАШГҮЙ */
export const autoId = (pkgKey: string, day: string): string =>
  `${AUTO_PREFIX}${pkgKey}|${day}`;

/* ─────────────────────── БИЧИХ ХЭЛБЭР ─────────────────────── */

export type AutoIpc = {
  /** Аль багц (харагдах нэр) */
  pkg: string;
  /** Бөглөлтийн агшны огноо `YYYY-MM-DD` */
  day: string;
  /**
   * `geree_kod` — тухайн багцын БАЙГАА гэрээний код.
   *
   * ⚠️ ЗААВАЛ дамжуулна. Хоосон орхивол `groupHo` нь шинэ мөрийг КОДГҮЙ
   * гэрээ (амьдаар ХО-0045)-тэй нэг бүлэгт оруулж, гүйцэтгэл ӨӨР багцын
   * картад харагдана — 2026-09-10-нд яг ийм алдаа гарсан.
   */
  code: string;
  /** Σ бөглөсөн обьём — ⚠️ нэгж холилдсон, лавлах */
  obyem: number | null;
  /** Σ (обьём × нэгж өртөг), ₮ */
  une: number | null;
};

/**
 * ArcGIS-д НЭМЭХ шинэ мөрийн талбарууд.
 *
 * ⚠️ `dun`, `ipc_dugaar`, захирамж, гэрээний бусад талбарууд ОРОХГҮЙ —
 * санхүүгийн газар нөхнө. Бичих нь: гэрээний код, багцын нэр (холбоос),
 * `murun_id` (давтагдашгүй түлхүүр), `on_` (жил), төрөл, `guilgee_ognoo`
 * (батлалтын өдөр) ба хоёр тоо. (⚠️ 2026-09-25: тайлбар кодтой зөрдөг байв.)
 *
 * ⚠️ `tulult_turul`-д «Гүйцэтгэл» бичнэ — урьдчилгаа БИШ. Хоосон орхивол
 * `sumPaidByKind` нь энэ мөрийг аль ч ангилалд тоолохгүй бөгөөд «олгосон»
 * задаргаа дутуу гарна.
 */
export function autoInsert(a: AutoIpc): Record<string, unknown> {
  const key = pkgKeyOf(a.pkg);
  const year = Number(a.day.slice(0, 4));
  return {
    [P.id]: autoId(key, a.day),
    /* ⚠️ Гэрээний код — ЭНЭ БАЙХГҮЙ бол мөр буруу бүлэгт очно (дээрх ⚠️) */
    [C.code]: a.code,
    [C.pkg]: a.pkg,
    [P.kind]: HO_IPC.kinds.work,
    [P.year]: Number.isFinite(year) ? year : null,
    /* ⚠️ ГҮЙЦЭТГЭЛ БАТЛАГДСАН огноо. Урьд нь орхигдсон тул картын толгойд
       «—» гарч, хугацаа нь зөвхөн оноор мэдэгдэж байв. */
    [P.payDate]: a.day,
    [LINK_FIELDS.obyem]: a.obyem,
    [LINK_FIELDS.une]: a.une,
    /* ⚠️ Зөрүү нь `олгосон ХУРИМТЛАЛ − une` (`autoZoruu`); энэ мөрийн `dun`
       хоосон тул ОДООГООР `null`.
       ⚠️ 2026-09-25: урьд нь «`dun` бичихэд `ipcLink` дахин бодно» гэсэн
       ХУДАЛ амлалт байв — `linkContract`/`linkUpdates`-ийг production-д хэн ч
       дууддаггүй. Одоо дахин бодох нь `ipcAutoWrite.refreshAutoZoruu`: тухайн
       багцын дараагийн батлалт бүрд (`syncIpcFromFill`) гэрээний БҮХ AUTO
       мөрийн зөрүүг шинэчилнэ; `dun` засагдмагц шууд бодуулах бол дуудагч
       (санхүүгийн засвар) мөн тэр функцийг дуудна. */
    [LINK_FIELDS.zoruu]: null,
  };
}

/** Мөрийн гэрээний код (`geree_kod`) — `ipc.groupHo`-гийн бүлэглэлтэй ИЖИЛ түлхүүр */
const codeOf = (r: Row): string => String(r[C.code] ?? '').trim();

/**
 * Төлбөрийн огноо → эрэмбийн ms. `DateOnly` (`YYYY-MM-DD` мөр) ба epoch тоо
 * хоёуланг таньна; танихгүй бол ∞ (хамгийн АРД).
 */
const payMs = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
  const d = v == null ? null : dayOf(String(v));
  const t = d ? Date.parse(d) : NaN;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

/**
 * ГЭРЭЭНИЙ ГҮЙЦЭТГЭЛИЙН ТӨЛБӨРИЙН ХУРИМТЛАЛ — `cur` мөрийг ОРУУЛААД.
 *
 * ⚠️ `ipcLink.linkContract`-ийн `cum`-тай ЯГ ИЖИЛ ДҮРЭМ (2026-09-25): нэг
 *    гэрээ (`geree_kod`) · зөвхөн «Гүйцэтгэл» төрлийн мөр · IPC ДУГААРААР
 *    эрэмбэлж (дугааргүй нь АРД), тэнцвэл гүйлгээний огноогоор · `dun`-гүй
 *    мөр хуримтлалд нэмэгдэхгүй. Урьдчилгаа ОРОХГҮЙ — тэр нь ажлын төлбөр биш.
 * ⚠️ `cur` өөрөө (AUTO мөр) төрлөөс ҮЛ ХАМААРАН орно — `autoInsert` түүнийг
 *    үргэлж «Гүйцэтгэл» гэж бичдэг.
 * ⚠️ Түлхүүр нь МӨРИЙН ЛАВЛАГАА (`===`) — дугаар/ID давхардсан ч зөв.
 * ⚠️ `ipcLink.ts`-ийг ЭНД ДУУДАХГҮЙ: тэр нь агшин (`snaps`) шаарддаг бөгөөд
 *    AUTO мөрийн `une` аль хэдийн агшнаас бодогдсон.
 */
export function cumPaidThrough(rows: readonly Row[], cur: Row): number | null {
  const code = codeOf(cur);
  const work = rows.filter((r) =>
    r === cur || (r[P.kind] === HO_IPC.kinds.work && codeOf(r) === code));
  if (!work.includes(cur)) work.push(cur);
  const ord = (r: Row): number => {
    const n = num(r[P.ipcNo]);
    return n == null ? Number.POSITIVE_INFINITY : n;
  };
  /* ⚠️ Хасахгүй ЖИШНЭ — `∞ − ∞ = NaN` нь эрэмбийг эвдэнэ (`linkContract`-тэй ижил) */
  const sorted = work.slice().sort((a, b) => {
    const oa = ord(a);
    const ob = ord(b);
    if (oa !== ob) return oa < ob ? -1 : 1;
    const da = payMs(a[P.payDate]);
    const db = payMs(b[P.payDate]);
    if (da !== db) return da < db ? -1 : 1;
    return 0;
  });
  let acc: number | null = null;
  for (const r of sorted) {
    const v = num(r[P.amount]);
    if (v != null) acc = (acc ?? 0) + v;
    if (r === cur) return acc;
  }
  return null;
}

/**
 * AUTO МӨРИЙН ЗӨРҮҮ = олгосон ХУРИМТЛАЛ (энэ мөр хүртэл) − `une`.
 *
 * ⚠️ 2026-09-25-ны аудит: урьд нь `dun − une` байв — энэ мөрийн НЭГ удаагийн
 *    (нэмэгдэл) төлбөрөөс ХУРИМТЛАГДСАН `guits_une`-г хасдаг тул Багц 3.3-ын
 *    IPC-5 (6.32 тэрбум) дээр −28.46 тэрбум «дутуу олгосон» гэж гардаг байв;
 *    зөв нь 34.78 − 34.78 = 0 (`ipcLink.ts`-ийн толгойн ⚠️ ХУРИМТЛАЛ дүрэм).
 * ⚠️ ЭНЭ мөрийн `dun` хоосон бол `null` — «хараахан төлөгдөөгүй», 0 БИШ
 *    (өмнөх IPC-үүд төлөгдсөн байсан ч энэ актын зөрүү хэмжигдэхгүй).
 */
export function autoZoruu(rows: readonly Row[], cur: Row, une: number | null): number | null {
  if (une == null || num(cur[P.amount]) == null) return null;
  const paid = cumPaidThrough(rows, cur);
  return paid == null ? null : paid - une;
}

/**
 * БАЙГАА автомат мөрийг ШИНЭЧЛЭХ талбарууд.
 *
 * ⚠️ ЗӨВХӨН хоёр тоо ба зөрүү. Багц, ID, төрөл, он нь ӨӨРЧЛӨГДӨХГҮЙ —
 * тэднийг дахин бичвэл санхүүгийн газрын гараар зассан утга дарагдана.
 *
 * ⚠️ ЗӨРҮҮГ ЭНД бодно: `dun` аль хэдийн бичигдсэн бол (санхүүгийн газар
 * төлбөрөө хийсэн) шинэ обьёмтой тулгаж зөрүү гаргана. `dun` хоосон бол
 * зөрүү `null` — «хараахан төлөгдөөгүй», `0` БИШ.
 *
 * ⚠️ `rows` — HO-гийн БҮХ мөр (гэрээний хуримтлалд, `autoZoruu`). Өгөөгүй
 *    бол зөвхөн `cur` өөрөө (өмнөх IPC-гүй гэрээ) гэж үзнэ.
 */
export function autoUpdate(
  cur: Row,
  a: AutoIpc,
  rows: readonly Row[] = [cur],
): Record<string, unknown> {
  return {
    [HO_IPC.oid]: num(cur[HO_IPC.oid]),
    [LINK_FIELDS.obyem]: a.obyem,
    [LINK_FIELDS.une]: a.une,
    [LINK_FIELDS.zoruu]: autoZoruu(rows, cur, a.une),
  };
}

/**
 * ШИЙДВЭР: нэмэх үү, шинэчлэх үү, огт хийхгүй юу.
 *
 * ⚠️ ХЭМЖИГДЭЭГҮЙ бол ЮУ Ч ХИЙХГҮЙ. Обьём ба мөнгөн дүн хоёулаа `null`
 * байхад мөр үүсгэвэл «энэ агшинд гүйцэтгэл 0» гэсэн ХУДАЛ бичлэг үлдэнэ.
 * Бөглөлт хоосон байх нь хэвийн (жишээ нь зөвхөн хуваарь засварласан).
 */
export type AutoPlan =
  | { op: 'insert'; attrs: Record<string, unknown> }
  | { op: 'update'; attrs: Record<string, unknown> }
  | { op: 'skip'; why: 'no-data' | 'no-pkg' | 'bad-day' | 'no-code' };

export function planAuto(rows: readonly Row[], a: AutoIpc): AutoPlan {
  const key = pkgKeyOf(a.pkg);
  if (!key) return { op: 'skip', why: 'no-pkg' };
  /* ⚠️ КОДГҮЙ бол ЮУ Ч ХИЙХГҮЙ — буруу гэрээнд наалдахаас сэргийлнэ */
  if (!a.code) return { op: 'skip', why: 'no-code' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.day)) return { op: 'skip', why: 'bad-day' };
  /* ⚠️ Жинхэнэ `0` нь ХЭМЖИГДСЭН — алгасахгүй (`null ≠ 0`). */
  if (a.obyem == null && a.une == null) return { op: 'skip', why: 'no-data' };

  const cur = findAutoRow(rows, key, a.day);
  return cur
    ? { op: 'update', attrs: autoUpdate(cur, a, rows) }
    : { op: 'insert', attrs: autoInsert(a) };
}
