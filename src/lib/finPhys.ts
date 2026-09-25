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
 *      дундажтай ЯГ таарна). Тэр блок тухайн сард хараахан тайлагнаагүй бол
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
 * ⚠️ `null` ≠ 0: блок бүр утгагүй бол багц Map-д ОРОХГҮЙ; цэггүй сар нь
 *    Map-д түлхүүргүй (дуудагч `null` гэж уншина).
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
};

/** `${БАГЦ}|блок` → [{ огноо, % 0–100 | null }] — `blockProgress.BlockHistory`-той нийцнэ */
export type PhysHistory = Map<string, { date: string; pct: number | null }[]>;

/**
 * @param hist  `loadBlockHistory()`-ийн үр дүн
 * @param axis  сарын тэнхлэг («YYYY-MM»), `cfMonthAxis()`
 * @param nowYm ОРОН НУТГИЙН одоогийн сар — түүнээс хойш цэг гарахгүй
 */
export function buildPhys(hist: PhysHistory, axis: readonly string[], nowYm: string): PhysBuild {
  /* багц → блок → [огноо, %] */
  const byPkg = new Map<string, Map<string, { d: string; g: number | null }[]>>();
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

  for (const [k, blocks] of byPkg) {
    /* Хуваагчийн олонлог — СҮҮЛИЙН бичилт нь утгатай блокууд (дүрэм 1) */
    const members: { d: string; g: number }[][] = [];
    for (const arr0 of blocks.values()) {
      const arr = [...arr0].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
      const last = arr[arr.length - 1];
      if (!last || last.g == null) continue; // «мэдээлэлгүй» блок — дунджид ОРОХГҮЙ
      members.push(arr.filter((e): e is { d: string; g: number } => e.g != null));
    }
    if (!members.length) continue;
    const n = members.length;
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
  return { phys, physCnt, physAt };
}
