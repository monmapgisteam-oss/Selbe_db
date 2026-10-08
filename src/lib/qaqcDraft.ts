/**
 * «ЧАНАР (QAQC)»-ИЙН НООРОГИЙН НЭГТГЭЛ — НҮД БҮРИЙН АГШИН ба БУЛШ (tombstone).
 *
 * Цэвэр функцууд: React, ArcGIS, localStorage-гүй — `qaqcDraft.check.mjs` шууд
 * шалгана. Дуудагчид: `modules/Qaqc.tsx` (локал ноорог, сэргээлт) ба
 * `qaqcDraftRemote.ts` (ArcGIS руу бичихээс ӨМНӨ алсынхтай нэгтгэнэ).
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас) — ЯАГААД:
 *   (1) АРИЛГАСАН НҮД БУЦАЖ ИРДЭГ БАЙВ. Ноорогт зөвхөн АМЬД нүд хадгалагддаг тул
 *       «Б төхөөрөмж дээр арилгасан» гэдэг мэдээлэл хаана ч үлддэггүй: А
 *       төхөөрөмжийн хуучин ноорог (локал эсвэл ArcGIS) тэр нүдийг агуулсаар
 *       байвал нэгтгэлд «зөвхөн нэг талд байгаа нүд» болж ДАХИН амилна. Одоо
 *       арилгалт (гараар арилгах · «ноорог устгах» · «Хадгалах») нь өөрөө
 *       БИЧЛЭГ: булш = агшинтай, утгагүй нүд.
 *   (2) БҮХЭЛ НООРОГ «СҮҮЛД БИЧСЭН НЬ ЯЛНА» байв. Нэгтгэлд ноорогийн ерөнхий `t`
 *       л харьцуулагдаж, ArcGIS руу бичихдээ бүтэн мөрийг ДАРДАГ байсан тул хоёр
 *       төхөөрөмж ээлжлэн бичихэд нэгнийх нь нүд алга болдог. Одоо нүд бүр
 *       ӨӨРИЙН агшинтай; нэгтгэл нүд бүрээр — шинэ нь ялна.
 *
 * ФОРМАТ (`v: 2`) — ЗӨВХӨН ҮҮНИЙГ БИЧНЭ:
 *   { v: 2, t, cells: [[түлхүүр, утга, агшин]…], gone?: [[түлхүүр, агшин]…], rowKeys? }
 * ⚠️ ХУУЧИН УНШИГЧТАЙ НИЙЦТЭЙ: `t` ба `cells` хэвээр, `cells`-ийн эхний хоёр
 *    элемент нь [түлхүүр, утга] — хуучин bundle-тай таб шинэ ноорогийг уншиж
 *    чадна (булшийг л мэдэхгүй).
 * ⚠️ ХУУЧИН ФОРМАТ (`cells: [[түлхүүр, утга]…]`, агшингүй) ӨГӨГДӨЛ АЛДАХГҮЙ
 *    уншигдана: нүд бүр ноорогийн ерөнхий `t`-г авна.
 *
 * НЭГТГЭЛИЙН ДҮРЭМ (түлхүүр бүрээр, `beats`):
 *   · агшин их нь ялна (амьд ч, булш ч);
 *   · агшин ТЭНЦҮҮ бол амьд нь булшийг ялна — эргэлзээтэй үед ажил хадгалагдана,
 *     хамгийн муудаа хэрэглэгч дахин арилгана;
 *   · хоёулаа амьд, агшин тэнцүү бол утгын дараалал — хоёр төхөөрөмж ИЖИЛ үр
 *     дүнд хүрэхийн тулд (нэгтгэл солигддог: merge(a,b) = merge(b,a)).
 *
 * БУЛШНЫ ХЯЗГААР:
 *   · 30 ХОНОГООС хуучин булш хаягдана (`TOMB_TTL_MS`). Локал ноорог сүүлийн
 *     бичилтээс 14 хоногт хүчингүй болдог (`Qaqc.tsx` `DRAFT_TTL_MS`) тул тэр
 *     нүдийг агуулсан хуучин ЛОКАЛ хуулбар 30 хоногийн дараа амьд үлдэхгүй.
 *     Үлдэх цорын ганц цоорхой: нэг таб 30+ хоног дахин ачаалалгүй нээлттэй
 *     байх — тэр үед ч ArcGIS руу бичихдээ нэгтгэдэг тул алсын хуулбар зөв.
 *   · ArcGIS-ийн талбарт багтахгүй бол ХАМГИЙН ХУУЧИН булш эхэлж хаягдана
 *     (`serializeQaqcDraft`). Амьд нүд ХЭЗЭЭ Ч хаягдахгүй — багтахгүй бол
 *     `null` (дуудагч «хэт том» гэж ил хэлнэ).
 *
 * ЦАГИЙН ЗӨРҮҮ (clock skew):
 *   · ЛАМПОРТЫН ДҮРЭМ (`nextStamp`): шинэ агшин = max(одоогийн цаг, энэ табын
 *     ХАРСАН хамгийн их агшин + 1). Хэрэглэгч ХАРСАН утгаа засаж/арилгавал
 *     түүний үйлдэл ҮРГЭЛЖ ялна — нөгөө төхөөрөмжийн цаг урагшаа байсан ч.
 *   · Серверийн цаг (`qaqcDraftRemote.qaqcClockNow`): хүснэгтэд Editor Tracking
 *     асаалттай бол бичилтийн `EditDate`-ээс энэ төхөөрөмжийн зөрүүг тооцож
 *     засна. ХЯЗГААР: асаагүй үед хоорондоо ХАРААГҮЙ (зэрэг) хоёр засварын
 *     хувьд цаг нь урагшаа төхөөрөмж ялна.
 */

export type QaqcDraft = {
  v: 2;
  /** Хамгийн сүүлийн агшин (нүд ба булшны дээд) — локал TTL ба ArcGIS-ийн `at` */
  t: number;
  /**
   * Амьд нүд — [`${ObjectID}:${баганын индекс}`, утга, засварын агшин, суурь?]
   * ⚠️ 2026-10-09: 4 дэх элемент `суурь` — засах ҮЕД харсан СЕРВЕРИЙН утга (`null` =
   *    хоосон). Хадгалахдаа зөрчлийн суурь болно (`Qaqc.tsx` `save`, `qaqcConflicts`):
   *    урьд нь суурь нь ЭНЭ ачааллын агшин байсан тул өчигдрийн ноорог сэргээгдээд
   *    хооронд нь серверт орсон ШИНЭ утгыг зөрчилгүйгээр ХУУЧНААР дардаг байв.
   *    Байхгүй (хуучин ноорог) бол дуудагч ачааллын агшин руу буцна. Хуучин уншигч
   *    эхний 3 элементийг л уншина — нийцтэй.
   */
  cells: [string, string, number, (string | null)?][];
  /** Булш — [түлхүүр, арилгасан агшин] */
  gone: [string, number][];
  /**
   * МӨРИЙН ТАНИГЧ — `ObjectID → "№ ¦ Ажлын нэр"` (зөвхөн амьд нүдтэй мөр).
   * ⚠️ Хүснэгт AGOL дээр дахин үүсгэгдвэл ObjectID гулсана — ноорог буруу
   *    мөрд ЧИМЭЭГҮЙ буухгүйн тулд сэргээхдээ тулгана (`Qaqc.tsx`).
   */
  rowKeys?: [number, string][];
};

/** Энэ табын засварын төлөв — `pend`-ийн нүд бүрийн агшин ба булш */
export type QaqcDraftState = {
  /** `b` — засах үед харсан серверийн утга (⚠️ 2026-10-09, `QaqcDraft.cells`-ийн ⚠️); `undefined` = мэдэгдэхгүй */
  cells: Map<string, { v: string; t: number; b?: string | null }>;
  gone: Map<string, number>;
};

/** Суурь: `undefined` = мэдэгдэхгүй (хуучин ноорог); `null` = сервер хоосон байсан */
const baseOf = (x: unknown): string | null | undefined =>
  (typeof x === 'string' || x === null ? x : undefined);

export const emptyQaqcDraftState = (): QaqcDraftState => ({ cells: new Map(), gone: new Map() });

/** Булшны амьдрах хугацаа — толгойн ⚠️ «БУЛШНЫ ХЯЗГААР» */
export const TOMB_TTL_MS = 30 * 24 * 3600 * 1000;

/** `v == null` = булш; `r` = тухайн нүдийг дагуулсан мөрийн танигч; `b` = суурь (⚠️ 2026-10-09) */
type Entry = { v: string | null; t: number; r?: string; b?: string | null };

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const oidOf = (k: string) => Number(k.slice(0, k.lastIndexOf(':')));

/** `a` нь `b`-г ялах уу — толгойн «НЭГТГЭЛИЙН ДҮРЭМ» */
const beats = (a: Entry, b: Entry): boolean => {
  if (a.t !== b.t) return a.t > b.t;
  if ((a.v == null) !== (b.v == null)) return a.v != null;
  if (a.v == null || b.v == null) return false;
  return a.v > b.v;
};

const put = (m: Map<string, Entry>, k: string, e: Entry) => {
  const cur = m.get(k);
  if (!cur || beats(e, cur)) m.set(k, e);
};

/** Нүд/булшны зураглалаас баримт; хоосон бол `null` */
function build(m: Map<string, Entry>): QaqcDraft | null {
  const cells: [string, string, number, (string | null)?][] = [];
  const gone: [string, number][] = [];
  /* Мөр бүрийн танигч — тухайн мөрийн ХАМГИЙН ШИНЭ амьд нүдийг дагуулсных */
  const rk = new Map<number, { r: string; t: number }>();
  let t = 0;
  for (const [k, e] of m) {
    if (e.t > t) t = e.t;
    if (e.v == null) {
      gone.push([k, e.t]);
      continue;
    }
    /* ⚠️ 2026-10-09: суурь мэдэгдэхгүй бол 3 элемент хэвээр — `undefined`-ийг массивт
       бичвэл JSON-д `null` («сервер хоосон байсан») болж утга нь өөрчлөгдөнө. */
    cells.push(e.b === undefined ? [k, e.v, e.t] : [k, e.v, e.t, e.b]);
    if (e.r != null) {
      const o = oidOf(k);
      const cur = rk.get(o);
      if (!cur || e.t > cur.t) rk.set(o, { r: e.r, t: e.t });
    }
  }
  if (!cells.length && !gone.length) return null;
  const rowKeys = [...rk].map(([o, x]) => [o, x.r] as [number, string]);
  return { v: 2, t, cells, gone, ...(rowKeys.length ? { rowKeys } : {}) };
}

function entriesOf(d: QaqcDraft): Map<string, Entry> {
  const rk = new Map(d.rowKeys ?? []);
  const m = new Map<string, Entry>();
  for (const [k, v, t, b] of d.cells) put(m, k, { v, t, r: rk.get(oidOf(k)), b: baseOf(b) });
  for (const [k, t] of d.gone) put(m, k, { v: null, t });
  return m;
}

/**
 * Ноорог унших — ХУУЧИН (агшингүй) ба ШИНЭ форматыг хоёуланг нь.
 * `ttlMs` — зөвхөн ЛОКАЛ хуулбарт (алсынхыг хугацаагаар ХЭЗЭЭ Ч хаяхгүй —
 * `Qaqc.tsx`-ийн `DRAFT_TTL_MS` ⚠️). Хуучирсан булшийг (`TOMB_TTL_MS`) хаяна.
 * Эвдэрсэн/хоосон бол `null`.
 */
export function parseQaqcDraft(
  raw: unknown,
  opts: { now: number; ttlMs?: number | null },
): QaqcDraft | null {
  let d: unknown = raw;
  if (typeof raw === 'string') {
    try {
      d = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!d || typeof d !== 'object') return null;
  const o = d as { t?: unknown; cells?: unknown; gone?: unknown; rowKeys?: unknown };
  if (!isNum(o.t) || o.t <= 0 || !Array.isArray(o.cells)) return null;
  if (opts.ttlMs != null && opts.now - o.t > opts.ttlMs) return null;
  const t0 = o.t;
  const rk = new Map<number, string>();
  if (Array.isArray(o.rowKeys)) {
    for (const e of o.rowKeys) {
      if (Array.isArray(e) && isNum(e[0]) && typeof e[1] === 'string') rk.set(e[0], e[1]);
    }
  }
  const m = new Map<string, Entry>();
  for (const e of o.cells) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || typeof e[1] !== 'string') continue;
    /* ⚠️ ХУУЧИН ФОРМАТ: нүдний агшин байхгүй → ноорогийн ерөнхий агшин */
    put(m, e[0], { v: e[1], t: isNum(e[2]) ? e[2] : t0, r: rk.get(oidOf(e[0])), b: baseOf(e[3]) });
  }
  if (Array.isArray(o.gone)) {
    for (const e of o.gone) {
      if (!Array.isArray(e) || typeof e[0] !== 'string' || !isNum(e[1])) continue;
      if (opts.now - e[1] > TOMB_TTL_MS) continue;
      put(m, e[0], { v: null, t: e[1] });
    }
  }
  return build(m);
}

/**
 * ХОЁР НООРОГИЙГ НҮД БҮРЭЭР НЭГТГЭНЭ — толгойн «НЭГТГЭЛИЙН ДҮРЭМ».
 * ⚠️ Солигддог ба давтагдахад тогтвортой: merge(a,b) = merge(b,a),
 *    merge(a,a) = a — хоёр төхөөрөмж ямар дарааллаар уулзсан ч ижил үр дүн.
 */
export function mergeQaqcDrafts(a: QaqcDraft | null, b: QaqcDraft | null): QaqcDraft | null {
  if (!a) return b;
  if (!b) return a;
  const m = entriesOf(a);
  for (const [k, e] of entriesOf(b)) put(m, k, e);
  return build(m);
}

/** Хуучирсан булшийг хаяна; юу ч үлдэхгүй бол `null` */
export function pruneQaqcDraft(d: QaqcDraft | null, now: number): QaqcDraft | null {
  if (!d) return null;
  const gone = d.gone.filter(([, t]) => now - t <= TOMB_TTL_MS);
  if (gone.length === d.gone.length) return d;
  if (!d.cells.length && !gone.length) return null;
  return { ...d, gone };
}

/**
 * `base` нь `doc`-ийн БҮХ мэдээллийг аль хэдийн агуулж байна уу — нэгтгэвэл юу ч
 * өөрчлөгдөхгүй эсэх. Сэргээлтийн дараа ArcGIS руу дахин бичих хэрэгтэй
 * эсэхийг шийднэ (локалд л байсан булш/нүд алсад хүрэх ёстой).
 */
export function draftIncludes(base: QaqcDraft | null, doc: QaqcDraft | null): boolean {
  if (!doc) return true;
  if (!base) return false;
  const m = entriesOf(base);
  for (const [k, v, t] of doc.cells) {
    const e = m.get(k);
    if (!e || beats({ v, t }, e)) return false;
  }
  for (const [k, t] of doc.gone) {
    const e = m.get(k);
    if (!e || beats({ v: null, t }, e)) return false;
  }
  return true;
}

/**
 * JSON болгоно — ЗӨВХӨН ШИНЭ формат. `maxLen`-д багтахгүй бол ХАМГИЙН ХУУЧИН
 * булшнаас эхэлж хаяна; амьд нүд хаягдахгүй — тэгсэн ч багтахгүй бол `null`.
 */
export function serializeQaqcDraft(
  d: QaqcDraft,
  opts: { now: number; maxLen?: number },
): string | null {
  const gone = d.gone
    .filter(([, t]) => opts.now - t <= TOMB_TTL_MS)
    .sort((x, y) => y[1] - x[1]);
  const max = opts.maxLen ?? Infinity;
  const enc = (n: number) => JSON.stringify({
    v: 2,
    t: d.t,
    cells: d.cells,
    ...(n ? { gone: gone.slice(0, n) } : {}),
    ...(d.rowKeys?.length ? { rowKeys: d.rowKeys } : {}),
  });
  const full = enc(gone.length);
  if (full.length <= max) return full;
  if (enc(0).length > max) return null;
  /* Багтах хамгийн олон (шинэ) булш — хоёртын хайлт */
  let lo = 0;
  let hi = gone.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (enc(mid).length <= max) lo = mid;
    else hi = mid - 1;
  }
  return enc(lo);
}

/** ЛАМПОРТЫН агшин — толгойн «ЦАГИЙН ЗӨРҮҮ» */
export const nextStamp = (last: number, now: number): number => Math.max(Math.round(now), last + 1);

/**
 * `pend`-ийн ШИЛЖИЛТЭЭС нүд бүрийн агшин/булшийг шинэчилнэ.
 *   · `prev`-д байсан, `next`-д алга → БУЛШ (гараар арилгасан · «ноорог устгах»
 *     · «Хадгалах»-ын дараа — аль нь ч «энэ ноорог хүчингүй» гэсэн үг);
 *   · шинэ эсвэл утга нь өөрчлөгдсөн → шинэ агшин;
 *   · утга нь ижил (сэргээлтээр орж ирсэн) → ХУУЧИН агшин хэвээр.
 * ⚠️ Устгалыг `prev`-ээс (энэ эффектийн ӨМНӨ харсан `pend`) тооцно — `st.cells`-
 *    ээс БИШ: сэргээлт `st`-д нүд нэмээд `setPend` дуудах хооронд эффект
 *    ажиллавал тэр нүдийг «арилгасан» гэж андуурахгүй.
 */
export function applyPendDiff(
  st: QaqcDraftState,
  prev: Readonly<Record<string, string>>,
  next: Readonly<Record<string, string>>,
  stamp: () => number,
  /** ⚠️ 2026-10-09: засах агшинд харагдаж буй СЕРВЕРИЙН утга — нүдний суурь (`QaqcDraft.cells`-ийн ⚠️) */
  seenOf?: (key: string) => string | null | undefined,
): { st: QaqcDraftState; changed: boolean } {
  const cells = new Map(st.cells);
  const gone = new Map(st.gone);
  let changed = false;
  for (const k of Object.keys(prev)) {
    if (k in next) continue;
    cells.delete(k);
    gone.set(k, stamp());
    changed = true;
  }
  for (const [k, v] of Object.entries(next)) {
    const c = cells.get(k);
    if (c && c.v === v) continue;
    const b = seenOf?.(k);
    cells.set(k, b === undefined ? { v, t: stamp() } : { v, t: stamp(), b });
    gone.delete(k);
    changed = true;
  }
  return { st: changed ? { cells, gone } : st, changed };
}

/** Энэ табын төлөвөөс баримт (`rowKeyOf` — одоогийн мөрийн танигч) */
export function draftFromState(
  st: QaqcDraftState,
  rowKeyOf: (oid: number) => string | undefined,
): QaqcDraft | null {
  const m = new Map<string, Entry>();
  for (const [k, c] of st.cells) put(m, k, { v: c.v, t: c.t, r: rowKeyOf(oidOf(k)), b: c.b });
  for (const [k, t] of st.gone) put(m, k, { v: null, t });
  return build(m);
}

/**
 * ЗӨРЧЛИЙН ДАРАА СУУРИЙГ ШИНЭЧИЛНЭ (⚠️ 2026-10-09). Хадгалахад зөрчилтэй гарсан нүдийг
 * хэрэглэгч шинэ серверийн утгыг ХАРСАН тул суурь нь тэр утга болно — эс бөгөөс дараагийн
 * «Хадгалах» нь мөн л хуучин суурьтай жишиж зөрчил гэсээр, санаатай дарах зам хаагдана.
 * Агшин хөндөгдөхгүй (утга өөрчлөгдөөгүй).
 */
export function rebaseQaqcCells(
  st: QaqcDraftState,
  bases: ReadonlyMap<string, string | null>,
): QaqcDraftState {
  let cells: QaqcDraftState['cells'] | null = null;
  for (const [k, b] of bases) {
    const c = st.cells.get(k);
    if (!c || c.b === b) continue;
    cells ??= new Map(st.cells);
    cells.set(k, { ...c, b });
  }
  return cells ? { cells, gone: st.gone } : st;
}

/**
 * ХАДГАЛСАН НООРОГИЙГ (локал ∪ алсын нэгтгэл) ЭНЭ ТАБЫН ТӨЛӨВТ ХҮЛЭЭН АВНА.
 *
 *   · Энэ табад БИЧСЭН нүд (сэргээлтийг хүлээх хооронд, эсвэл дахин уншилтын
 *     өмнө) — табынх ЯЛНА (урьдын `{ ...cells, ...cur }`-тэй ижил: `pend`-д
 *     `cur` ялдаг). Хадгалсан нь шинэ агшинтай байвал табынх ШИНЭ агшин авна —
 *     эс бөгөөс дараагийн нэгтгэлд дэлгэц дээрхтэй зөрөх үр дүн гарна.
 *   · Энэ табад АРИЛГАСАН нүд — ердийн дүрэм: агшин их нь ялна (хадгалсан нь
 *     шинэ бол `cells`-ээр `pend`-д буцаж орно — дэлгэц ба төлөв зөрөхгүй).
 *   · Тохирохгүй нүд (мөр алга, багана хэтэрсэн, танигч зөрсөн) — `dropped`,
 *     тэр ХУВИЛБАРЫГ нь булшлана (`t + 1`): урьд нь дараагийн бичилт ноорогийг
 *     бүтнээр нь дардаг тул ийм нүд өөрөө алга болдог байв; одоо ArcGIS руу
 *     НЭГТГЭЖ бичдэг тул булшгүйгээр мөнхөд үлдэж, нээх бүрд «орхигдов» гэнэ.
 *   · Хадгалсан булш — табын төлөвт нэмэгдэнэ (дараагийн бичилтэд дамжина).
 *   · ⚠️ 2026-10-09: СЕРВЕРТ АЛЬ ХЭДИЙН БАЙГАА утга (`isSaved`) — `same`, тэр
 *     ХУВИЛБАРЫГ нь булшлана (`t + 1`). Урьд нь өөр төхөөрөмжийн хуучирсан ноорог
 *     (тэнд хадгалагдсан ч булш нь энд хүрээгүй) сэргэж «Хадгалах (N)»-ийг
 *     хөөрөгдөж, дараа нь серверт ШИНЭ утга орсон бол түүнийг ХУУЧНААР дардаг байв.
 *
 * `isValid(key, rowKey)` — дуудагч мөр/баганыг шалгана.
 * `isSaved(key, v)` — серверийн одоогийн утга `v`-тэй ижил эсэх (заавал биш).
 * ⚠️ `stamp` дуудахаас ӨМНӨ дуудагч цагаа `stored.t` хүртэл урагшлуулсан байх
 *    ёстой (Лампорт); тэгээгүй ч `max(stamp(), t + 1)` хамгаална.
 */
export function adoptQaqcDraft(
  stored: QaqcDraft,
  st: QaqcDraftState,
  isValid: (key: string, rowKey: string | undefined) => boolean,
  stamp: () => number,
  isSaved?: (key: string, v: string) => boolean,
): {
  st: QaqcDraftState;
  cells: Record<string, string>;
  count: number;
  dropped: number;
  same: number;
} {
  const cells = new Map(st.cells);
  const gone = new Map(st.gone);
  const rk = new Map(stored.rowKeys ?? []);
  const out: Record<string, string> = {};
  let count = 0;
  let dropped = 0;
  let same = 0;
  const over = (t: number) => Math.max(stamp(), t + 1);

  for (const [k, v, t, b0] of stored.cells) {
    const sc = st.cells.get(k);
    if (sc) {
      if (beats({ v, t }, { v: sc.v, t: sc.t })) cells.set(k, { ...sc, t: over(t) });
      continue;
    }
    /* Табад арилгасан нүд — агшин их нь ялна (дэлгэцэнд зөрөх зүйлгүй: хадгалсан нь
       шинэ бол доор `out`-оор `pend`-д орж ирнэ) */
    const sg = st.gone.get(k);
    if (sg != null && !beats({ v, t }, { v: null, t: sg })) continue;
    if (!isValid(k, rk.get(oidOf(k)))) {
      dropped += 1;
      gone.set(k, Math.max(gone.get(k) ?? 0, t + 1));
      continue;
    }
    if (isSaved?.(k, v)) {
      same += 1;
      gone.set(k, Math.max(gone.get(k) ?? 0, t + 1));
      continue;
    }
    gone.delete(k);
    /* ⚠️ 2026-10-09: хадгалсан суурийг дагуулна (`QaqcDraft.cells`-ийн ⚠️) */
    const b = baseOf(b0);
    cells.set(k, b === undefined ? { v, t } : { v, t, b });
    out[k] = v;
    count += 1;
  }
  for (const [k, t] of stored.gone) {
    const sc = st.cells.get(k);
    if (sc) {
      if (beats({ v: null, t }, { v: sc.v, t: sc.t })) cells.set(k, { ...sc, t: over(t) });
      continue;
    }
    if (t > (gone.get(k) ?? -Infinity)) gone.set(k, t);
  }
  return { st: { cells, gone }, cells: out, count, dropped, same };
}
