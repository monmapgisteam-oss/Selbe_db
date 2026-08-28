/**
 * ХУВААРИЙН ЗАГВАР — «Гүйцэтгэл бөглөх» хуудасны эхлэх/дуусах огноог
 * ТӨЛӨВЛӨХ цэвэр логик. React-гүй, сүлжээгүй — тиймээс тестлэгдэнэ.
 *
 * ⚠️ ЯАГААД ТУСДАА ЗАГВАР ХЭРЭГТЭЙ ВЭ (2026-08-28-нд амьд өгөгдлөөр хэмжсэн):
 *
 *     Багц 2·12F  1348/1557 ажил хуваарьтай  86.6%
 *     Багц 3.2    1165/1374                  84.8%
 *     Багц 1·9F     70/1266                   5.5%
 *     Багц 4-1      22/1385                   1.6%
 *     Багц 3.3      11/1173                   0.9%
 *
 * Шалтгаан нь хүний залхуурал БИШ, БҮТЭЦ: одоогийн хүснэгтэд нэг ажлыг 12–22
 * блокт хуваарилахын тулд 24–44 удаа календар нээж дарна. Тэвчихийн аргагүй.
 *
 * ⚠️ ГЭТЭЛ ӨГӨГДӨЛ ӨӨРӨӨ ХЭМНЭЛТЭЙ. Багц 4-2·9F, «Талбайн түр хашаа»:
 *     5/1  2025-10-01 → 2026-04-18
 *     5/2  2025-10-08 → 2026-04-25   (+7 хоног)
 *     5/3  2025-10-15 → 2026-05-02   (+7 хоног)
 * Энэ бол ГУРВАН тоо (эхлэл · үргэлжлэх · алхам), 28 нүд БИШ. Барилгын
 * салбарт үүнийг «такт» (takt / location-based planning) гэдэг: давтагдах
 * блоктой төсөлд Gantt биш, БАЙРЛАЛЫН хуваарь тохирдог.
 *
 * ⚠️ ХУГАЦАА нь ХУАНЛИЙН ХОНОГ, ЭХЛЭХ БА ДУУСАХ ӨДРИЙГ ОРУУЛААД. Өөрөөр
 * хэлбэл 10-01 → 10-01 нь 1 хоног (0 биш). Ажлын өдрөөр (5/2) бодох нь
 * илүү зөв ч эх хуудсанд амралтын өдрийн мэдээлэл БАЙХГҮЙ — байхгүй зүйлийг
 * таамаглавал хуваарь чимээгүй гажина.
 */

/** Нэг хоног (мс) — огноо нь UTC шөнө дундаар хадгалагддаг */
export const DAY = 86_400_000;

/** Нэг блокийн нэг ажлын хуваарь. `start`/`end` нь UTC шөнө дунд, мс. */
export type Span = { start: number; end: number };

/** Хуваарийн харагдацын нэг мөр — `SheetRow`-оос гаргасан */
export type PlanRow = {
  /** `rows` массив дахь ИНДЕКС — эх мөртэй холбогдоно */
  i: number;
  oid: number;
  no: string;
  work: string;
  depth: number;
  group: boolean;
  /** Блок бүрийн хуваарь; `null` = тэр блокт хуваарьгүй */
  spans: (Span | null)[];
  /**
   * Блок бүрийн БОДИТ гүйцэтгэл 0–1 (сонголтоор).
   * ⚠️ Байхгүй (`undefined`) бол «хоцорсон» шалгуур ОГТ ажиллахгүй — 0 гэж
   *    таамаглавал бөглөгдөөгүй бүх ажил «хоцорсон» гэж улаанаар дүүрнэ.
   */
  act?: (number | null)[];
};

/* ══════════════════ Хоног ══════════════════ */

/**
 * Хугацааны урт — ХУАНЛИЙН хоногоор, хоёр захыг ОРУУЛААД.
 * ⚠️ `(end − start) / DAY` нь 10-01→10-01-д 0 өгнө; бодит ажил 1 хоног
 *    үргэлжилсэн тул +1. Энэ конвенцийг бүх газарт мөрдөнө.
 */
export const spanDays = (s: Span): number =>
  Math.round((s.end - s.start) / DAY) + 1;

/** Эхлэл ба үргэлжлэх хугацаанаас дуусах огноо (мөн хоёр захыг оруулаад) */
export const endOf = (start: number, days: number): number =>
  start + Math.max(0, days - 1) * DAY;

/* ══════════════════ Хэмнэл (такт) ══════════════════ */

/**
 * Мөрийн хуваарийн ХЭЛБЭР.
 *
 * ⚠️ `irregular` нь «буруу» гэсэн үг БИШ: блокууд өөр өөр бэлтгэлтэй байж
 * болно. Гэхдээ засварлагч талд хэлбэрийг мэдэх нь чухал — жигд хэмнэлтэйг
 * гурван тоогоор дахин үүсгэж болно, жигд бусыг блок тус бүрээр л засна.
 */
export type Rhythm =
  | { kind: 'none' }
  | {
    kind: 'even';
    /** Эхний хуваарьтай блокийн эхлэх огноо */
    first: number;
    /** Хуанлийн хоног (хоёр захыг оруулаад) */
    days: number;
    /** Блок хоорондын алхам, хоног. 0 = бүх блок зэрэг эхэлнэ */
    takt: number;
    /** Хуваарьтай блокийн тоо */
    blocks: number;
  }
  | {
    kind: 'irregular';
    first: number;
    last: number;
    blocks: number;
    /** Яагаад жигд бус болсон — засварлагчид ил хэлнэ */
    why: 'days' | 'takt';
  };

/**
 * Мөрийн хуваарийн хэлбэрийг ТАНИНА.
 *
 * ⚠️ Зөвхөн ХУВААРЬТАЙ блокуудыг авч үзнэ. Дунд нь хоосон блок байвал алхам
 * нь тэдгээрийг алгасаж бодогдоно — «5/1, 5/3 хоёр л хуваарьтай, хооронд
 * 14 хоног» гэдэг нь жигд хэмнэл мөн (5/2 нь зүгээр л бөглөгдөөгүй).
 */
export function rhythmOf(spans: readonly (Span | null)[]): Rhythm {
  const list = spans.filter((s): s is Span => s != null);
  if (!list.length) return { kind: 'none' };

  const first = list[0].start;
  const days = spanDays(list[0]);
  const last = list[list.length - 1].start;

  /* Бүх хугацаа ижил урттай юу */
  if (list.some((s) => spanDays(s) !== days)) {
    return { kind: 'irregular', first, last, blocks: list.length, why: 'days' };
  }
  if (list.length === 1) return { kind: 'even', first, days, takt: 0, blocks: 1 };

  /* Алхам жигд юу — эхний хоёрын зөрүүг бусад бүгд дагах ёстой */
  const takt = Math.round((list[1].start - list[0].start) / DAY);
  for (let k = 1; k < list.length; k++) {
    if (Math.round((list[k].start - list[k - 1].start) / DAY) !== takt) {
      return { kind: 'irregular', first, last, blocks: list.length, why: 'takt' };
    }
  }
  return { kind: 'even', first, days, takt, blocks: list.length };
}

/**
 * ГУРВАН ТООНООС блок бүрийн хуваарийг ҮҮСГЭНЭ — энэ модулийн гол утга.
 *
 * @param n     нийт блокийн тоо
 * @param first эхний блокийн эхлэх огноо (мс)
 * @param days  хуанлийн хоног (≥1)
 * @param takt  блок хоорондын алхам, хоног (0 = бүгд зэрэг)
 * @param only  зөвхөн эдгээр блокийн индекс (заагаагүй бол бүгд)
 *
 * ⚠️ `only` заасан үед алхам нь СОНГОСОН блокуудын дараалалаар бодогдоно
 *    (0, 1, 2…), блокийн жинхэнэ индексээр БИШ: «5/1 ба 5/5 хоёрыг 7 хоногийн
 *    зөрүүтэй» гэвэл 28 биш 7 хоног гарна.
 */
export function applyRhythm(
  n: number,
  first: number,
  days: number,
  takt: number,
  only?: readonly number[],
): (Span | null)[] {
  const idx = only?.length ? [...only].filter((b) => b >= 0 && b < n).sort((a, b) => a - b) : null;
  const out: (Span | null)[] = new Array(n).fill(null);
  const d = Math.max(1, Math.round(days));
  const list = idx ?? Array.from({ length: n }, (_, k) => k);
  list.forEach((b, k) => {
    const s = first + k * Math.round(takt) * DAY;
    out[b] = { start: s, end: endOf(s, d) };
  });
  return out;
}

/* ══════════════════ ЭЦГИЙН МУЖ (дээрээс доош төлөвлөх) ══════════════════ */

/**
 * Мөрийн ХАМГИЙН ОЙРЫН эцэг бүлгийн ӨӨРИЙН муж (блок бүрд).
 *
 * ⚠️ ЯАГААД ЭНЭ ЧУХАЛ ВЭ (2026-08-28, хэрэглэгчийн санал): 1,266 навчийг нэг
 * бүрчлэн төлөвлөх нь бодит бус. Барилгын төлөвлөлт ДЭЭРЭЭС ДООШ явдаг —
 * эхлээд «Б1 БАРИЛГЫН АЖИЛ» гэсэн үе шатанд цонх өгч, доторх ажлуудыг тэр
 * цонхонд байрлуулна (rolling wave / hierarchical scheduling).
 *
 * ⚠️ БҮЛГИЙН ОГНОО ХАДГАЛАГДАНА. `bagtsSheet.computeAll`-д мөрийн ӨӨРИЙН
 * огноо (`own`) нь дэд мөрүүдийн MIN/MAX (`agg`)-аас ДАВАМГАЙЛНА — тиймээс
 * бүлэгт бичсэн муж дараагийн нийтлэлд дарагдахгүй. Түүнээс гадна бүлэг
 * өөрийн огноотой бол ТӨЛӨВЛӨГӨӨТ ХУВЬ нь тэр мужаас шууд бодогдоно
 * (`planAt`) — навч бүрийг бөглөхгүйгээр утга гарна.
 *
 * ⚠️ Зөвхөн ӨӨРИЙН муж. Эцэг нь MIN/MAX-аар бодогдсон бол тэр нь хязгаар
 * БИШ, хүүхдүүдийнхээ ТУСГАЛ — түүгээр хязгаарлах нь дугуй логик болно.
 * Гэвч энэ модуль нь `own`/`agg`-ийг ялгаж мэдэхгүй тул дуудагч тал зөвхөн
 * ЖИНХЭНЭ бүлгийн мужийг өгнө (`Huvaari` нь `SheetRow.start`-аас шууд авдаг —
 * тэр нь хадгалагдсан утга, бодогдсон нь биш).
 */
export function parentSpan(
  rows: readonly PlanRow[],
  at: number,
  b: number,
): Span | null {
  /* Дээш өгсөж, гүн нь БАГА эхний БҮЛГИЙГ олно */
  for (let k = at - 1; k >= 0; k--) {
    if (rows[k].depth >= rows[at].depth) continue;
    if (!rows[k].group) return null;
    return rows[k].spans[b] ?? null;
  }
  return null;
}

/** Муж нь эцгийнхээ дотор багтаж байна уу */
export const inside = (child: Span, parent: Span): boolean =>
  child.start >= parent.start && child.end <= parent.end;

/**
 * ЭЦГИЙН МУЖИД ДАРААЛАН БАЙРЛУУЛНА — «n ажлыг энэ цонхонд жигд хуваа».
 *
 * ⚠️ Хоосон зайгүй, давхцалгүй: цонхны хоногийг ажлын тоонд хуваана. Үлдэгдэл
 * хоногийг ЭХНИЙ ажлуудад нэмнэ — сүүлчийнхийг богиносгож дуусгавал эцгийн
 * дуусах огноотой таарахгүй үлдэнэ.
 *
 * @returns ажил бүрийн муж, эцгийн дотор дараалан
 */
export function spread(parent: Span, count: number): Span[] {
  const n = Math.max(1, Math.floor(count));
  const total = spanDays(parent);
  const base = Math.floor(total / n);
  let extra = total - base * n;
  const out: Span[] = [];
  let cur = parent.start;
  for (let k = 0; k < n; k++) {
    /* ⚠️ Цонх нь ажлын тооноос БОГИНО бол хамгийн багадаа 1 хоног өгнө —
       0 хоногтой ажил нь `reversed` алдаа болж, хуваарь бүхэлдээ эвдэрнэ.
       Тийм үед сүүлийн ажлууд эцгийн мужаас халина; шалгуур түүнийг хэлнэ. */
    const d = Math.max(1, base + (extra > 0 ? 1 : 0));
    if (extra > 0) extra -= 1;
    out.push({ start: cur, end: endOf(cur, d) });
    cur = endOf(cur, d) + DAY;
  }
  return out;
}

/* ══════════════════ ГҮЙЦЭТГЭЛИЙН ТӨЛӨВ ══════════════════ */

/**
 * Нэг блокийн нэг ажлын ТӨЛӨВ — чартын өнгө үүн дээр тогтоно.
 *
 * ⚠️ `none` («хэмжигдээгүй») ба `todo` («эхлээгүй») нь ӨӨР: эхнийх нь бидний
 * МЭДЭХГҮЙ, хоёр дахь нь бидний МЭДЭХ тэг. Хоёуланг нэг өнгөөр будвал
 * «бөглөгдөөгүй» багц бүхэлдээ «эхлээгүй» гэж уншигдана.
 */
export type Status = 'done' | 'run' | 'todo' | 'late' | 'none';

export function statusOf(s: Span, act: number | null | undefined, now: number): Status {
  if (act == null) return 'none';
  if (act >= 1) return 'done';
  /* Хугацаа нь ДУУССАН атлаа дуусаагүй — хоцрогдол */
  if (s.end < now) return 'late';
  if (act > 0) return 'run';
  return 'todo';
}

/* ══════════════════ Шалгалт ══════════════════ */

/**
 * ⚠️ Дээд хязгаарууд нь ХАТУУ хориг БИШ, АНХААРУУЛГА. Барилгад үнэхээр урт
 * ажил байдаг (жиш. «Гадна шугам татах» улирал дамжина). Гэхдээ амьд
 * өгөгдөлд «Талбайн ТҮР ХАШАА барих» 6.5 сар (2025-10-01 → 2026-04-18) гэж
 * бичигдсэн байсныг хэн ч анзаараагүй — тийм зүйлийг ил гаргах нь энэ
 * шалгалтын гол зорилго.
 */
export const MAX_DAYS = 180;

/**
 * ⚠️ ШАЛГУУРЫГ 2026-08-28-нд АМЬД ӨГӨГДӨЛ ДЭЭР ТОХИРУУЛСАН. Анхны хувилбар
 * 15,028 анхааруулга гаргасан нь жагсаалтыг утгагүй болгосон. Хассан хоёр:
 *
 *   · `unordered` (1,334) — «блокийн дараалал ухарсан». ДҮРЭМ НЬ БУРУУ БАЙВ:
 *     5/1 нь 5/2-оос өмнө эхлэх ЁСГҮЙ. Блокийн дугаар нь дараалал биш, ХАЯГ.
 *   · `twin` (3,043) — «өөр ажил ижил хуваарьтай». Амьд өгөгдөлд 70 ажил
 *     ердөө 4 өөр хуваарьтай байдаг нь ХЭВИЙН (нэг бригад, нэг мужид зэрэг
 *     явна). Анхааруулга биш, ХЭВ ШИНЖ — `Coverage.patterns` болж үлдэв.
 *
 * Үлдсэн шалгуурууд нь МӨРӨӨР нэгтгэгдэнэ: `tooLong` нь блок тус бүрд
 * дуугарч 9,444 болсныг мөрд НЭГ удаа болгов.
 */
export type IssueKind =
  | 'reversed'      // дуусах < эхлэх
  | 'tooLong'       // хэт урт
  | 'partial'       // зарим блокт хуваарьтай, заримд алга
  | 'outsideParent' // бүлгийн өөрийн мужаас хүүхэд хальсан
  | 'late';         // хуваарь дууссан атлаа гүйцэтгэл 0

export type Issue = {
  kind: IssueKind;
  level: 'error' | 'warn';
  /** `PlanRow.i` */
  row: number;
  /** Блокийн индекс — мөр даяарын асуудалд `null` */
  block: number | null;
  /** Дэлгэцэд гарах богино тайлбар (орчуулга нь дуудагч талд) */
  detail: string;
};

/** Огноог шалгалтын мессежид — цагийн бүсгүй, ISO өдөр */
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * ХУВААРИЙН АСУУДЛУУД. Дараалал нь ноцтойгоороо: `error` эхэлж, дараа `warn`.
 *
 * ⚠️ «Асуудалгүй» ба «хуваарьгүй» ХОЁР ӨӨР: огт хуваарилаагүй мөр энд
 *    гарахгүй (тэр нь алдаа биш, ХИЙГДЭЭГҮЙ ажил). Түүнийг хамралтын
 *    үзүүлэлт (`coverage`) тусад нь хэлнэ.
 */
export function validate(rows: readonly PlanRow[], now?: number): Issue[] {
  const out: Issue[] = [];
  const n = rows[0]?.spans.length ?? 0;

  for (const r of rows) {
    if (r.group) continue;
    const has = r.spans.filter((s): s is Span => s != null);
    if (!has.length) continue;

    /* 1. УРВУУ МУЖ — жинхэнэ алдаа: хугацааны тооцоо бүхэлдээ утгагүй болно.
          Блок бүрд тэмдэглэнэ: аль нүдийг засахыг заах ёстой. */
    r.spans.forEach((s, b) => {
      if (s && s.end < s.start) {
        out.push({
          kind: 'reversed', level: 'error', row: r.i, block: b,
          detail: `${iso(s.start)} → ${iso(s.end)}`,
        });
      }
    });

    /* 2. ХЭТ УРТ — МӨРД НЭГ УДАА, хамгийн уртаар нь.
          ⚠️ Блок тус бүрд дуугарвал 12 блоктой багцад 12 дахин үржиж,
             амьд өгөгдөлд 9,444 мөр болж жагсаалтыг живүүлж байв. */
    let maxD = 0;
    let maxB = -1;
    r.spans.forEach((s, b) => {
      if (!s || s.end < s.start) return;
      const dd = spanDays(s);
      if (dd > maxD) { maxD = dd; maxB = b; }
    });
    if (maxD > MAX_DAYS) {
      out.push({
        kind: 'tooLong', level: 'warn', row: r.i, block: maxB,
        detail: String(maxD),
      });
    }

    /* 3. ХАГАС БӨГЛӨЛТ — нэг ажил зарим блокт төлөвлөгдөж, заримд мартагдсан */
    if (has.length < n) {
      out.push({
        kind: 'partial', level: 'warn', row: r.i, block: null,
        detail: `${has.length}/${n}`,
      });
    }

    /* 4. ХОЦРОГДОЛ — хуваариар аль хэдийн дуусах ёстой атлаа гүйцэтгэл 0.
          ⚠️ `act` өгөгдөөгүй бол ОГТ шалгахгүй: бөглөгдөөгүйг «хоцорсон»
             гэж заавал буруу (хэмжилт байхгүй ≠ ажил хийгдээгүй). */
    if (now != null && r.act) {
      let late = 0;
      r.spans.forEach((s, b) => {
        if (!s || s.end >= now) return;
        const a = r.act?.[b];
        if (a != null && a <= 0) late += 1;
      });
      if (late > 0) {
        out.push({
          kind: 'late', level: 'warn', row: r.i, block: null,
          detail: String(late),
        });
      }
    }
  }

  /* 5. БҮЛГИЙН ӨӨРИЙН МУЖ — хүүхэд халих ёсгүй.
     ⚠️ Бүлэг нь ихэвчлэн дэд мөрүүдийнхээ MIN/MAX-аар бодогддог тул халихгүй;
        харин бүлэгт ӨӨРТ нь огноо бичигдсэн бол тэр нь ЗОРИЛТ болно.
     ⚠️ Мөрд НЭГ удаа — блок бүрд давтвал жагсаалт үерлэнэ. */
  const kids = childIndex(rows);
  for (const g of rows) {
    if (!g.group) continue;
    const list = kids.get(g.i);
    if (!list?.length) continue;
    const flagged = new Set<number>();
    g.spans.forEach((gs, b) => {
      if (!gs) return;
      for (const ci of list) {
        const c = rows[ci];
        const cs = c.spans[b];
        if (!cs || flagged.has(c.i)) continue;
        if (cs.start < gs.start || cs.end > gs.end) {
          flagged.add(c.i);
          out.push({
            kind: 'outsideParent', level: 'warn', row: c.i, block: b,
            detail: `${iso(gs.start)}..${iso(gs.end)}`,
          });
        }
      }
    });
  }

  const rank = (x: Issue) => (x.level === 'error' ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || a.row - b.row);
}

/**
 * Мөр бүрийн ШУУД дэд мөрүүд — гүнээр (`bagtsSheet.childIndexes`-ийн дүрэм).
 * ⚠️ Энд `PlanRow.i` түлхүүртэй Map буцаана: `rows` нь шүүгдсэн (зөвхөн
 *    хуваарийн харагдацын мөрүүд) байж болох тул массивын байрлал ≠ `i`.
 */
export function childIndex(rows: readonly PlanRow[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const stack: PlanRow[] = [];
  for (const r of rows) {
    while (stack.length && stack[stack.length - 1].depth >= r.depth) stack.pop();
    const p = stack[stack.length - 1];
    if (p) {
      const a = out.get(p.i);
      if (a) a.push(rows.indexOf(r)); else out.set(p.i, [rows.indexOf(r)]);
    }
    stack.push(r);
  }
  return out;
}

/* ══════════════════ Хамралт ══════════════════ */

export type Coverage = {
  /** Ажлын (навч) мөрийн тоо */
  tasks: number;
  /** Ядаж нэг блокт хуваарьтай ажил */
  planned: number;
  /** Ажил × блокийн нийт нүд */
  cells: number;
  /** Хуваарьтай нүд */
  filled: number;
  /** Хамгийн эрт эхлэх / хамгийн сүүл дуусах (хуваарьгүй бол `null`) */
  from: number | null;
  to: number | null;
  /**
   * ЯЛГААТАЙ хуваарийн тоо — «70 ажил ердөө 4 өөр хуваарьтай».
   *
   * ⚠️ Энэ нь АНХААРУУЛГА БИШ, ХЭВ ШИНЖ: нэг бригад нэг мужид зэрэг ажилладаг
   * тул ижил хуваарь хэвийн. Гэхдээ 1,348 ажил 3 хуваарьтай бол тэр нь
   * «төлөвлөсөн» биш «хуулсан» гэсэн шинж — тоог ил гаргаж, дүгнэлтийг
   * хүнд үлдээнэ.
   */
  patterns: number;
};

export function coverageOf(rows: readonly PlanRow[]): Coverage {
  const n = rows[0]?.spans.length ?? 0;
  let tasks = 0, planned = 0, filled = 0;
  let from: number | null = null;
  let to: number | null = null;
  const sig = new Set<string>();
  for (const r of rows) {
    if (r.group) continue;
    tasks += 1;
    let any = false;
    for (const s of r.spans) {
      if (!s) continue;
      any = true;
      filled += 1;
      if (from == null || s.start < from) from = s.start;
      if (to == null || s.end > to) to = s.end;
    }
    if (any) {
      planned += 1;
      sig.add(r.spans.map((s) => (s ? `${s.start}:${s.end}` : '-')).join('|'));
    }
  }
  return { tasks, planned, cells: tasks * n, filled, from, to, patterns: sig.size };
}
