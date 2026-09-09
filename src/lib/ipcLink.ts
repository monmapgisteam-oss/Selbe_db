/**
 * IPC ↔ ГҮЙЦЭТГЭЛИЙН ХОЛБООС — «олгосон төлбөр» ба «бодит хийсэн ажил»-ыг
 * тулгах цорын ганц газар.
 *
 * ОЙЛГОЛТ. IPC мөр нь «хэдэн ₮ олгосон» гэдгийг л мэднэ (`dun`). Бөглөх
 * хуудас нь «хэдэн м³ хийсэн» гэдгийг мэднэ (`obyem`). Хоёрын хооронд ямар ч
 * холбоос БАЙГААГҮЙ тул «олгосон нь хийсэндээ таарч байна уу» гэдгийг хэн ч
 * шалгаж чаддаггүй байв. Энэ модуль тэр гүүрийг барина:
 *
 *     guits_obyem = тухайн агшны ХУРИМТЛАГДСАН обьём (мөр бүрийн Σ блок)
 *     guits_une   = Σ (обьём × нэгж өртөг)          → «байх ЁСТОЙ» ₮
 *     guits_zoruu = олгосон хуримтлал − guits_une   → зөрүү
 *
 * ⚠️ ХУРИМТЛАЛ vs НЭМЭГДЭЛ — ХОЁУЛАНГ бодно (хэрэглэгчийн шийдвэр,
 * 2026-09-09). Бөглөх хуудасны обьём нь ХУРИМТЛАГДСАН (өссөн дүн) харин
 * `dun` нь тухайн гүйлгээний НЭМЭГДЭЛ. Амьдаар батлав: Багц-3.3-ын 5 IPC =
 * 6.85 · 10.02 · 5.71 · 5.87 · 6.32 → хуримтлал 34.78 (гэрээний 16.2%).
 * Хэрэв `dun`-г хуримтлагдсан гэж үзвэл эцсийн IPC дангаараа гэрээг
 * төлсөн мэт харагдана. Тиймээс ЗӨРҮҮГ ХУРИМТЛАЛААР жишнэ — обьём
 * хуримтлагдсан тул нөгөө талыг нь ч хуримтлуулах ёстой.
 *
 * ⚠️ ТҮҮХЭН 22 IPC-Д ХОЛБООС БАЙХГҮЙ. Амьдаар хэмжив (2026-09-09): бүх IPC
 * төлбөр 2026-03-20 … 2026-08-26 хооронд, харин бөглөлтийн архивын ХАМГИЙН
 * ЭРТ агшин нь 2026-09-03. Огноогоор нэг ч IPC архивтай таарахгүй (0/22).
 * Тэдгээр мөрд үр дүн `null` — `0` БОЛГОХГҮЙ. «Зөрүү 0» гэдэг нь «таарсан»
 * гэсэн үг бөгөөд энд ХУДАЛ байх болно; `null` нь «хэмжих боломжгүй».
 * Цаашид гарах IPC архивтай таарах тул тэднээс жинхэнэ тоо гарна.
 *
 * ⚠️ АГШНЫГ СОНГОХ ДҮРЭМ: IPC-ийн огнооноос ӨМНӨХ (эсвэл ЯГ ТЭР ӨДРИЙН)
 * хамгийн СҮҮЛИЙН агшин. Хойшхи агшин авбал төлбөр хийгдсэний ДАРАА нэмж
 * бөглөсөн ажил тэр төлбөрт тоологдоно — зөрүү зохиомлоор багасна.
 *
 * ⚠️ React импортлохгүй, DOM хөндөхгүй, сүлжээ дуудахгүй — `ipcLink.check.mjs`
 * шууд Node дээр ачаална. БҮХ экспорт ЦЭВЭР функц.
 */
import { HO_IPC, num, pkgKeyOf } from '@/lib/services';

type Row = Record<string, unknown>;

const C = HO_IPC.contractFields;
const P = HO_IPC.payFields;

/** ArcGIS-д БИЧИХ талбарууд — 2026-09-09-нд нэмэгдсэн (39 талбар болсон). */
export const LINK_FIELDS = {
  /** Тухайн агшны хуримтлагдсан обьём (нэгж холилдсон — ЖИШИХ БУС, лавлах) */
  obyem: 'guits_obyem',
  /** Σ (обьём × нэгж өртөг) — «байх ёстой» ₮ */
  une: 'guits_une',
  /** Олгосон хуримтлал − `une` */
  zoruu: 'guits_zoruu',
} as const;

/* ───────────────────── БӨГЛӨЛТИЙН АГШИН ───────────────────── */

/**
 * НЭГ АГШНЫ хэмжилт — нэг багцын, нэг өдрийн бөглөлтөөс гарсан дүн.
 *
 * ⚠️ `obyem` нь НЭГЖ ХОЛИЛДСОН нийлбэр (м³ + м² + ш). Энэ нь физик утгагүй
 * бөгөөд ЗӨВХӨН «ямар нэг юм бөглөгдсөн үү» гэсэн лавлах. Шийдвэр гаргах
 * тоо нь `une` — тэр нь ₮ болж нэгдсэн тул жишиж болно.
 */
export type Snapshot = {
  /** `YYYY-MM-DD` */
  day: string;
  /** Σ бөглөсөн обьём — ⚠️ нэгж холилдсон, лавлах зорилгоор */
  obyem: number | null;
  /** Σ (обьём × нэгж өртөг), ₮ */
  une: number | null;
};

/** `snapshotOf`-ийн шаарддаг ХАМГИЙН БАГА мөрийн хэлбэр (`bagtsSheet.SheetRow`-ийн дэд олонлог) */
export type ObyemRow = {
  group?: boolean;
  unit: number | null;
  obyem: readonly (number | null)[];
};

/**
 * Бөглөх хуудасны мөрүүдээс НЭГ АГШНЫ дүн.
 *
 * ⚠️ Зөвхөн НАВЧ мөр (`group` биш) тоологдоно — бүлгийн мөрд обьём/нэгж
 * өртөг байдаггүй ч хэрэв байсан бол хүүхдүүдээ ДАХИН тоолж хоёр дахин
 * хөөрөгдөнө.
 *
 * ⚠️ Нэгж өртөггүй мөрийн обьём `obyem`-д ОРНО ч `une`-д ОРОХГҮЙ — тэр
 * ажлын мөнгөн дүнг бодох боломжгүй. Бөглөгдсөн мөр огт байхгүй бол
 * хоёулаа `null` — `0` БИШ.
 */
export function snapshotOf(rows: readonly ObyemRow[], day: string): Snapshot {
  let obyem: number | null = null;
  let une: number | null = null;
  for (const r of rows) {
    if (r.group) continue;
    let sum: number | null = null;
    for (const v of r.obyem) { if (v != null) sum = (sum ?? 0) + v; }
    if (sum == null) continue;
    obyem = (obyem ?? 0) + sum;
    if (r.unit == null) continue;
    une = (une ?? 0) + sum * r.unit;
  }
  return { day, obyem, une };
}

/**
 * IPC-ийн огноонд тохирох агшныг сонгоно — тэр өдөр буюу түүнээс ӨМНӨХ
 * хамгийн сүүлийнх. Таарахгүй бол `null`.
 *
 * ⚠️ `snaps`-ыг өдрөөр ӨСӨХ дарааллаар өгнө; дуудагч тал эрэмбэлнэ.
 */
export function snapAt(snaps: readonly Snapshot[], day: string): Snapshot | null {
  let hit: Snapshot | null = null;
  for (const s of snaps) {
    if (s.day > day) break;
    hit = s;
  }
  return hit;
}

/* ───────────────────── МӨР БҮРИЙН ХОЛБООС ───────────────────── */

/**
 * Яагаад холбогдоогүй вэ.
 * ⚠️ Тайлбаргүй `null` нь «алдаа юу, өгөгдөл дутуу юу» гэдгийг ялгах
 * боломжгүй болгоно — 2026-09-04-ний I30 алдааны сургамж.
 */
export type LinkReason = 'ok' | 'no-date' | 'no-snapshot' | 'no-unit' | 'not-work';

/** Нэг IPC мөрд бодогдсон утга — ArcGIS-д бичих бэлэн хэлбэр. */
export type LinkResult = {
  /** `OBJECTID` — шинэчлэлтийн түлхүүр */
  oid: number;
  /** `murun_id` «ХО-0001» — бүртгэл/лог унших боломжтой болгоно */
  id: string;
  /** Тухайн агшны ХУРИМТЛАГДСАН обьём. Агшин олдоогүй бол `null` */
  obyem: number | null;
  /** Тухайн агшны ХУРИМТЛАГДСАН «байх ёстой» ₮ */
  une: number | null;
  /** Олгосон хуримтлал − `une`. Аль нэг нь `null` бол `null` */
  zoruu: number | null;
  /** `ok` бол холбоос БҮТСЭН */
  reason: LinkReason;
};

/**
 * НЭГ ГЭРЭЭНИЙ бүх төлбөрийг агшинтай холбоно.
 *
 * ⚠️ ЗӨВХӨН ГҮЙЦЭТГЭЛИЙН мөр холбогдоно. Урьдчилгаа төлбөр нь хийгдсэн
 * ажлын ЭСРЭГ биш, ИРЭЭДҮЙН ажлын өмнөх урьдчилгаа тул обьёмтой жишихэд
 * үргэлж «100% хэтэрсэн» гэсэн утгагүй зөрүү гарна (амьдаар урьдчилгаа
 * 314.010 тэрбум = олгосны 59%). Тэдгээр мөр `not-work` шалтгаантай `null`.
 *
 * ⚠️ ХУРИМТЛАЛААР ЖИШНЭ (дээрх модулийн ⚠️): `dun` нь нэмэгдэл тул
 * IPC дугаарын дарааллаар нэмж хуримтлуулаад агшны хуримтлалтай тулгана.
 * Урьдчилгаа хуримтлалд ОРОХГҮЙ — тэр нь ажлын төлбөр биш.
 *
 * ⚠️ Хуримтлал нь IPC ДУГААРААР — огноогоор БИШ. `guilgee_ognoo` хоосон мөр
 * бий (45-ийн 5) бөгөөд тэднийг огнооны эрэмбэд тавих газаргүй; дугаар нь
 * актын жинхэнэ дараалал.
 *
 * @param pays  нэг гэрээний төлбөрүүд; дараалал хамаагүй (дотор эрэмбэлнэ)
 * @param snaps тухайн БАГЦын агшнууд, өдрөөр өсөх
 * @param dayOf `guilgee_ognoo` → `YYYY-MM-DD`; таних боломжгүй бол `null`
 */
export function linkContract(
  pays: readonly Row[],
  snaps: readonly Snapshot[],
  dayOf: (v: unknown) => string | null,
): LinkResult[] {
  const work = pays
    .filter((r) => r[P.kind] === HO_IPC.kinds.work)
    .slice()
    .sort((a, b) => (num(a[P.ipcNo]) ?? 0) - (num(b[P.ipcNo]) ?? 0));

  /* ⚠️ Түлхүүр нь МӨРИЙН ЛАВЛАГАА (объект) — `murun_id` эсвэл `ipc_dugaar`
     БИШ. Дугаар давхардвал (эх өгөгдөл эвдэрвэл) хуримтлал чимээгүй
     дарагдана; лавлагаа нь мөр бүрд давтагдашгүй. */
  const cum = new Map<Row, number | null>();
  let acc: number | null = null;
  for (const r of work) {
    const v = num(r[P.amount]);
    if (v != null) acc = (acc ?? 0) + v;
    cum.set(r, acc);
  }

  const out: LinkResult[] = [];
  for (const r of pays) {
    const oid = num(r[HO_IPC.oid]) ?? 0;
    const id = String(r[P.id] ?? '');
    const base = { oid, id, obyem: null, une: null, zoruu: null };

    if (r[P.kind] !== HO_IPC.kinds.work) {
      out.push({ ...base, reason: 'not-work' });
      continue;
    }
    const day = dayOf(r[P.payDate]);
    if (!day) { out.push({ ...base, reason: 'no-date' }); continue; }

    const s = snapAt(snaps, day);
    if (!s) { out.push({ ...base, reason: 'no-snapshot' }); continue; }

    /* ⚠️ Агшин олдсон ч нэгж өртөг бүхэлдээ дутуу бол `une` нь `null` —
       обьёмыг лавлахаар үлдээж, зөрүүг БОДОХГҮЙ. */
    if (s.une == null) {
      out.push({ ...base, obyem: s.obyem, reason: 'no-unit' });
      continue;
    }
    const paid = cum.get(r) ?? null;
    out.push({
      oid,
      id,
      obyem: s.obyem,
      une: s.une,
      zoruu: paid == null ? null : paid - s.une,
      reason: 'ok',
    });
  }
  return out;
}

/* ───────────────────── ARCGIS-Д БИЧИХ ───────────────────── */

/**
 * `applyEdits`-ийн `updates` массив.
 *
 * ⚠️ `reason !== 'ok'` мөрийг ч БИЧНЭ — гурвуулаа `null`. Ингэснээр өмнөх
 * ажиллагааны ХУУЧИРСАН утга үлдэхгүй: архив уртсаж эсвэл огноо засагдвал
 * мөр «холбогдох боломжгүй» рүү буцаж болно. Бичихгүй орхивол хуучин тоо
 * шинэ бодит байдалтай зөрчилдөн үлдэнэ.
 *
 * ⚠️ ArcGIS `null` бичихийг ЗӨВШӨӨРНӨ (гурван талбар `nullable: true`).
 * `?? 0` БҮҮ бич — «зөрүү 0» нь «таарсан» гэсэн ХУДАЛ мэдэгдэл болно.
 */
export function linkUpdates(res: readonly LinkResult[]): Record<string, unknown>[] {
  return res.map((r) => ({
    [HO_IPC.oid]: r.oid,
    [LINK_FIELDS.obyem]: r.obyem,
    [LINK_FIELDS.une]: r.une,
    [LINK_FIELDS.zoruu]: r.zoruu,
  }));
}

/* ───────────────────── ХУРААНГУЙ ───────────────────── */

export type LinkSummary = {
  /** Нийт төлбөрийн мөр */
  total: number;
  /** Холбогдсон (`reason === 'ok'`) */
  linked: number;
  /** Шалтгаан бүрийн тоо — UI-д «яагаад холбогдсонгүй» гэдгийг тайлбарлана */
  by: Record<LinkReason, number>;
  /** Σ `zoruu` холбогдсон мөрүүдээр. ⚠️ Нэг ч холбогдоогүй бол `null` */
  zoruu: number | null;
};

export function linkSummary(res: readonly LinkResult[]): LinkSummary {
  const by: Record<LinkReason, number> = {
    ok: 0, 'no-date': 0, 'no-snapshot': 0, 'no-unit': 0, 'not-work': 0,
  };
  let zoruu: number | null = null;
  for (const r of res) {
    by[r.reason] += 1;
    if (r.zoruu != null) zoruu = (zoruu ?? 0) + r.zoruu;
  }
  return { total: res.length, linked: by.ok, by, zoruu };
}

/** Төлбөрийн мөрийн БАГЦЫН түлхүүр — агшнуудыг олоход. ⚠️ `pkgKeyOf` */
export const payPkgKey = (r: Row): string => pkgKeyOf(r[C.pkg]);
