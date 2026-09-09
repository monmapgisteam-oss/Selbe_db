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
 * ⚠️ `guilgee_ognoo`-гоос УНШИХГҮЙ: тэр нь ХООСОН (гүйлгээ хийгдээгүй) ба
 * дараа нь санхүүгийн газар өөр огноо бичиж болно — түлхүүр нь БӨГЛӨЛТИЙН
 * огноо байх ЁСТОЙ, төлбөрийн огноо биш.
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
  if (!pkgKey) return '';
  for (const r of rows) {
    if (isAuto(r)) continue;
    if (pkgKeyOf(r[C.pkg]) !== pkgKey) continue;
    const code = String(r[C.code] ?? '').trim();
    if (code) return code;
  }
  return '';
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
 * ⚠️ `dun`, `guilgee_ognoo`, `ipc_dugaar`, захирамж, гэрээний талбарууд
 * ОРОХГҮЙ — санхүүгийн газар нөхнө. Заавал бичих нь: багцын нэр (холбоос),
 * `murun_id` (давтагдашгүй түлхүүр), `on_` (жил) ба хоёр тоо.
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
    /* ⚠️ Зөрүү нь `dun − une`; `dun` хоосон тул ОДООГООР `null`.
       Санхүүгийн газар `dun` бичихэд `ipcLink` дахин бодож шинэчилнэ. */
    [LINK_FIELDS.zoruu]: null,
  };
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
 */
export function autoUpdate(cur: Row, a: AutoIpc): Record<string, unknown> {
  const dun = num(cur[P.amount]);
  return {
    [HO_IPC.oid]: num(cur[HO_IPC.oid]),
    [LINK_FIELDS.obyem]: a.obyem,
    [LINK_FIELDS.une]: a.une,
    [LINK_FIELDS.zoruu]: dun == null || a.une == null ? null : dun - a.une,
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
    ? { op: 'update', attrs: autoUpdate(cur, a) }
    : { op: 'insert', attrs: autoInsert(a) };
}
