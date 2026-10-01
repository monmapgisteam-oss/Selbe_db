/**
 * САРЫН БИЕТ ГҮЙЦЭТГЭЛИЙН ЦУВАА — багц бүрд: сар → % (0–100).
 *
 * ⚠️ 2026-09-25: `Finance.loadFinDataRaw` доторх бүтээлтийг ЭНД гаргав —
 *    `phys.check.mjs` урьд нь логикийн ХУУЛБАРЫГ шалгадаг байсан тул эх код
 *    өөрчлөгдөхөд тест хуучин дүрмийг «ногоон» гэж баталсаар байв. Одоо тест
 *    энэ функцийг ШУУД импортлоно.
 *
 * ДҮРЭМ (2026-09-25-ны аудитын гурван засвар):
 *   1. ТОГТМОЛ ХУВААГЧ. Урьд нь сар бүр «тэр сард бөглөгдсөн блокуудын»
 *      дундаж байсан — шинэ блок тайлагнах бүрд хуваагч өсөж муруй ҮСЭРЧ/
 *      УНАДАГ байв. Одоо хуваагч = СҮҮЛИЙН бичилт нь утгатай блокууд
 *      (`blockProgress.compute`-ийн олонлог — эцсийн цэг дэлгэцийн одоогийн
 *      дундажтай ЯГ таарна) — ⚠️ 2026-10-01-нээс хуваарь нь БҮХ блок (доорх ⚠️).
 *      Тэр блок тухайн сард хараахан тайлагнаагүй бол
 *      0% — `blockProgress.progressSeries`-ийн «ХУВААРЬ ТОГТМОЛ» шийдвэртэй ижил
 *      (тайлан ирээгүй барилга тэр үед бодитоор ~0%).
 *   2. ДАВТСАН ЦЭГ ГАРАХГҮЙ. Урьд нь сүүлийн бичилт сар бүр урагш ДАВТАГДАЖ
 *      («carry-forward») хэмжилтгүй сард «хэмжсэн» мэт цэг үүсдэг, `lagOf` нь
 *      ӨНӨӨДРИЙН төлөвлөгөөг хэдэн сарын өмнөх хэмжилттэй жишдэг байв. Одоо
 *      тухайн сард багцад ШИНЭ бичилт байвал л цэг (`progressSeries`-ийн
 *      «бүртгэлгүй сарыг АЛГАСНА» дүрэм).
 *   3. ХЭМЖИЛТИЙН ОГНОО (`physAt`) — сар бүрийн цэг ЯМАР өдрийн байдлаар бэ.
 *      `lagOf` төлөвлөгөөг тэр өдрөөр завсарлана (`planProgress.planPctAt`).
 *
 * ⚠️ 2026-10-01 (хэрэглэгчийн шийдвэр): ХУВААГЧ = багцын БҮХ блок (бөглөх хуудасны
 *    хуваарь `universe` ∪ утгатай блок) — тайлагнаагүй блок 0%. Урьд нь (дүрэм 1)
 *    зөвхөн сүүлийн бичилт нь утгатай блокууд байв: 4 блоктой багцын ганц блок 100%
 *    тайлагнахад багц 100% гардаг байлаа (одоо 25%). `blockProgress.pkgProgressOf`-тэй
 *    ЯГ нэг хуваарь ⇒ эцсийн цэг == жагсаалтын хувь.
 * ⚠️ 2026-10-01: ОГТ тайлагнаагүй багц `phys`-д ОРОХГҮЙ (цэг гаргахгүй — «шинэ бичилт»
 *    байхгүй), харин `physN`-д блокийн тоотойгоо ОРНО — нэгтгэл (`gdash.housingSeries`)
 *    ба багцын жагсаалт (`Finance.contractMonths`) түүнийг 0% гэж тооцно. `phys.size`
 *    нь «тайлагнасан багц»-ын тоо хэвээр.
 * ⚠️ `null` ≠ 0 ХЭВЭЭР зөвхөн: цэггүй сар нь Map-д түлхүүргүй (дуудагч `null` гэж
 *    уншина); бөглөх хуудас уншигдаагүй (хуваарьт байхгүй) багц хаана ч орохгүй.
 */
import { bagtsKey, blockKey } from './services';

/** Багц → сар → утга */
export type PhysMap = Map<string, Map<string, number>>;
/** Багц → сар → хэмжилтийн огноо «YYYY-MM-DD» */
export type PhysAtMap = Map<string, Map<string, string>>;

export type PhysBuild = {
  /** Багц → сар → биет %, 0–100 */
  phys: PhysMap;
  /** Багц → сар → ХУВААГЧ (блокийн тоо) — нэгтгэлийн жин */
  physCnt: PhysMap;
  /** Багц → сар → тэр цэгийн хамгийн сүүлийн бичилтийн огноо */
  physAt: PhysAtMap;
  /**
   * Багц → ХУВААГЧ (блокийн тоо) — ОГТ тайлагнаагүй багцыг ч агуулна (2026-10-01).
   * ⚠️ `phys`-д түлхүүргүй атлаа энд байгаа багц = тайлагнаагүй, 0%.
   */
  physN: Map<string, number>;
};

/** `${БАГЦ}|блок` → [{ огноо, % 0–100 | null }] — `blockProgress.BlockHistory`-той нийцнэ */
export type PhysHistory = Map<string, { date: string; pct: number | null }[]>;

/**
 * @param hist  `loadBlockHistory()`-ийн үр дүн
 * @param axis  сарын тэнхлэг («YYYY-MM»), `cfMonthAxis()`
 * @param nowYm ОРОН НУТГИЙН одоогийн сар — түүнээс хойш цэг гарахгүй
 * @param universe багц → блокийн түлхүүрүүд (`blockProgress.loadBlockUniverse`). Өгөөгүй
 *   бол хуваарь нь зөвхөн утгатай блокууд (тест/нөөц) — тайлагнаагүй багц мэдэгдэхгүй.
 */
export function buildPhys(
  hist: PhysHistory,
  axis: readonly string[],
  nowYm: string,
  universe?: ReadonlyMap<string, readonly string[]>,
): PhysBuild {
  /* багц → блок → [огноо, %] */
  const byPkg = new Map<string, Map<string, { d: string; g: number | null }[]>>();
  /* ⚠️ 2026-10-01: багц → хуваарийн блокууд (`blockKey`) — `history`-тэй ИЖИЛ нормчлол */
  const uniOf = new Map<string, Set<string>>();
  for (const [pk, keys] of universe ?? []) {
    const k = bagtsKey(pk);
    if (!k) continue;
    const s = uniOf.get(k) ?? new Set<string>();
    for (const key of keys) {
      const cut = key.indexOf('|');
      const b = blockKey(cut < 0 ? key : key.slice(cut + 1));
      if (b) s.add(b);
    }
    uniOf.set(k, s);
  }
  for (const [key, pts] of hist) {
    const cut = key.indexOf('|');
    const k = bagtsKey(key.slice(0, cut));
    /* ⚠️ `blockKey` (2026-08-24 аудит) — «5/1 барилга» ба «5/1 блок» НЭГ блок */
    const b = blockKey(key.slice(cut + 1));
    if (!k || !b) continue;
    const blocks = byPkg.get(k) ?? new Map<string, { d: string; g: number | null }[]>();
    const arr = blocks.get(b) ?? [];
    for (const p of pts) {
      const d = String(p.date ?? '').slice(0, 10);
      if (!d) continue;
      arr.push({ d, g: p.pct == null || !Number.isFinite(Number(p.pct)) ? null : Number(p.pct) });
    }
    blocks.set(b, arr);
    byPkg.set(k, blocks);
  }

  const phys: PhysMap = new Map();
  const physCnt: PhysMap = new Map();
  const physAt: PhysAtMap = new Map();
  const physN = new Map<string, number>();

  for (const k of new Set([...byPkg.keys(), ...uniOf.keys()])) {
    const blocks = byPkg.get(k) ?? new Map<string, { d: string; g: number | null }[]>();
    /* Утгатай блокууд — СҮҮЛИЙН бичилт нь утгатай (`compute`-ийн олонлог) */
    const members: { d: string; g: number }[][] = [];
    /* ⚠️ 2026-10-01: хуваагч = хуваарь ∪ утгатай блок (`pkgProgressOf`-тэй ижил) */
    const all = new Set(uniOf.get(k) ?? []);
    for (const [b, arr0] of blocks) {
      const arr = [...arr0].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
      const last = arr[arr.length - 1];
      if (!last || last.g == null) continue; // нүд цэвэрлэгдсэн — хуваарьт байвал 0%
      members.push(arr.filter((e): e is { d: string; g: number } => e.g != null));
      all.add(b);
    }
    const n = all.size;
    if (n > 0) physN.set(k, n);
    /* Огт тайлагнаагүй — цэг гаргахгүй (шинэ бичилт алга), `physN`-ээр 0% */
    if (!members.length) continue;
    const byMon = new Map<string, number>();
    const cntMon = new Map<string, number>();
    const atMon = new Map<string, string>();
    for (const label of axis) {
      if (label > nowYm) continue; // ирээдүйн сард биет дата байхгүй
      let sum = 0;
      let fresh = false; // тухайн сард ШИНЭ бичилт бий эсэх (дүрэм 2)
      let at = '';
      for (const arr of members) {
        /* тухайн сарын эцэс хүртэлх хамгийн сүүлийн УТГАТАЙ бичилт */
        let best: { d: string; g: number } | null = null;
        for (const e of arr) {
          if (e.d.slice(0, 7) > label) break;
          best = e;
        }
        if (!best) continue; // хараахан тайлагнаагүй — 0% (дүрэм 1)
        sum += best.g;
        if (best.d.slice(0, 7) === label) fresh = true;
        if (best.d > at) at = best.d;
      }
      if (!fresh) continue;
      byMon.set(label, sum / n);
      cntMon.set(label, n);
      atMon.set(label, at);
    }
    phys.set(k, byMon);
    physCnt.set(k, cntMon);
    physAt.set(k, atMon);
  }
  return { phys, physCnt, physAt, physN };
}
