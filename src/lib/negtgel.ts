/**
 * ТӨСЛИЙН НЭГТГЭЛ ГҮЙЦЭТГЭЛ — ажлын задаргааны (WBS) мод ба түүний бөглөлт.
 *
 * ⚠️ Эх нь `Tusul_guitsetgel/0` (`TUSUL_NEGTGEL`): 198 мөрийн МОД бөгөөд бүтэц
 * нь бэлэн, тоон утга нь БҮГД ХООСОН. Хэрэглэгчийн заавар (2026-09-08):
 * «мэдээллийг нь бөглөөрэй — жишээ нь газар чөлөөлөлтийг Газар чөлөөлөлт
 * хэсгээс авна».
 *
 * ⚠️ БӨГЛӨЛТИЙН ЭХ нь `Cashflow_0909`: гэрээ бүр модны ЗУРГААН хэсэг тус бүрд
 * гүйцэтгэлийн хувьтай (`CASHFLOW_NEW.stages`) ба төсөвт өртөгтэй. Модны мөр
 * бүрийг тохирох ГЭРЭЭНҮҮДТЭЙ холбоод, төсвөөр ЖИГНЭСЭН дунджийг авна.
 *
 * ⚠️ ЭНЭ ФАЙЛ ҮЙЛЧИЛГЭЭ РҮҮ БИЧДЭГГҮЙ. Бодолт нь ЗӨВХӨН дэлгэц дээр явагдана:
 * `applyEdits`-ээр 198 мөрийг дарж бичих нь БУЦААГДАШГҮЙ бөгөөд хэрэглэгчийн
 * ТУСГАЙ зөвшөөрөлтэйгээр л хийгдэнэ.
 *
 * ⚠️ ТААРААГҮЙ мөрийг ТААМАГЛАЖ БҮҮ БӨГЛӨ. `null` үлдээнэ — «мэдээлэлгүй» ба
 * «тэг гүйцэтгэл» хоёрыг хольж болохгүй (`CLAUDE.md`). Аль мөр яагаад
 * тааралгүй үлдснийг `how` талбар хэлнэ.
 */
import { queryFeatures, queryStats, count } from '@/lib/query';
import {
  TUSUL_NEGTGEL, CASHFLOW_NEW, PARCEL_LEFT, parcelClearedWhere,
  CF_WORK_WHERE,
} from '@/lib/services';
import { t as tr } from '@/lib/i18nCore';

const F = TUSUL_NEGTGEL.fields;
const CF = CASHFLOW_NEW.fields;
const ST = CASHFLOW_NEW.stages;

/* ═══════════════ МОДНЫ МӨР ═══════════════ */

export type NegtgelRow = {
  oid: number;
  /** Ажлын задаргааны код — «1.2.1.1»; дээд мөрд хоосон */
  code: string;
  name: string;
  /** Кодын цэгээр тодорхойлогдох ГҮН (0 = төслийн нийт мөр) */
  depth: number;
};

/**
 * ⚠️ `null` ба `0` хоёрыг ЯЛГАНА: «хэмжилтгүй» мөрийг 0% гэж зурвал бүх
 * задаргаа тэг гүйцэтгэлтэй мэт харагдана (`CLAUDE.md` → `null ≠ 0`).
 */
const numOrNull = (v: unknown): number | null => (
  v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)
);

/** Кодын гүн — «1» = 1, «1.2» = 2, «1.2.1.1» = 4; кодгүй мөр = 0 */
export const negtgelDepth = (code: string): number => {
  const c = code.trim();
  return c === '' ? 0 : c.split('.').filter((x) => x !== '').length;
};

/**
 * ЭЦЭГ МӨРИЙН ИНДЕКС — БАЙРЛАЛ ба ГҮНЭЭР, кодоор БИШ.
 *
 * ⚠️ Эх хүснэгтэд код ДАВХАРДСАН: «6.2» нь «Газар чөлөөлөлт» ба «Барилга
 * угсралт ажил» гэсэн ХОЁР мөрд, «6» нь «Барилга угсралт» ба «Улсын комисс»-д
 * бичигдсэн. Кодоор эцэг хайвал мод солбилцоно. Гүнээр (Excel-ийн outline шиг)
 * угсарвал давхардал хамаагүй.
 */
export function negtgelTree(rows: NegtgelRow[]): { parent: number[]; kids: number[][] } {
  const parent = new Array<number>(rows.length).fill(-1);
  const stack: number[] = [];
  rows.forEach((r, i) => {
    while (stack.length > 0 && rows[stack[stack.length - 1]].depth >= r.depth) stack.pop();
    parent[i] = stack.length > 0 ? stack[stack.length - 1] : -1;
    stack.push(i);
  });
  const kids: number[][] = rows.map(() => []);
  parent.forEach((p, i) => { if (p >= 0) kids[p].push(i); });
  return { parent, kids };
}

/** Модны бүх мөрийг үйлчилгээний мөрийн дарааллаар */
export async function loadNegtgel(): Promise<NegtgelRow[]> {
  const rows = await queryFeatures(TUSUL_NEGTGEL.url, {
    outFields: [TUSUL_NEGTGEL.oid, F.code, F.name],
    /* ⚠️ ObjectID-аар эрэмбэлнэ, кодоор БИШ: «1.10» нь тэмдэгтээр «1.2»-оос
       ӨМНӨ ирдэг тул модны дараалал эвдэрнэ. Мөрийн анхны дараалал нь
       Excel-ийнхээ дарааллыг хадгалсан. */
    orderBy: TUSUL_NEGTGEL.oid,
  });
  return rows.map((r) => {
    const code = String(r[F.code] ?? '').trim();
    return {
      oid: Number(r[TUSUL_NEGTGEL.oid] ?? 0),
      code,
      /* ⚠️ Excel-ээс ирсэн нэр нь ДОГОЛООР эхэлдэг («    ТЭЗҮ») — доголыг
         кодын гүнээс өөрсдөө зурдаг тул энд цэвэрлэнэ. */
      name: String(r[F.name] ?? '').replace(/\s+/g, ' ').trim(),
      depth: negtgelDepth(code),
    };
  });
}

/* ═══════════════ БӨГЛӨЛТИЙН ЭХ — ГЭРЭЭНҮҮД ═══════════════ */

export type CfStageRow = {
  turul: string;
  pkg2: string;
  detail: string;
  budget: number;
  /** Шат бүрийн гүйцэтгэл (0–100) — хэмжилтгүй бол `null` */
  pct: Record<string, number | null>;
};

export async function loadCfStages(): Promise<CfStageRow[]> {
  const rows = await queryFeatures(CASHFLOW_NEW.url, {
    where: CF_WORK_WHERE,
    outFields: [
      CF.type, CF.project, CF.pkg2, CF.detail, CF.budget,
      ST.tezu, ST.design, ST.land, ST.permit, ST.tender, ST.build,
    ],
    orderBy: CASHFLOW_NEW.oid,
  });
  return rows.map((r) => ({
    /* ⚠️ 2-р түвшин хоосон бол 1-р түвшнээр — нийгмийн дэд бүтэц, бондын хүү */
    turul: String(r[CF.type] ?? '') || String(r[CF.project] ?? ''),
    pkg2: String(r[CF.pkg2] ?? ''),
    detail: String(r[CF.detail] ?? ''),
    budget: Number(r[CF.budget] ?? 0) || 0,
    pct: {
      [ST.tezu]: numOrNull(r[ST.tezu]),
      [ST.design]: numOrNull(r[ST.design]),
      [ST.land]: numOrNull(r[ST.land]),
      [ST.permit]: numOrNull(r[ST.permit]),
      [ST.tender]: numOrNull(r[ST.tender]),
      /* ⚠️ `Guitsetgel_huwi` нь МӨР (String) — «39.27» гэж ирнэ */
      [ST.build]: numOrNull(r[ST.build]),
    },
  }));
}

/** ГАЗАР ЧӨЛӨӨЛӨЛТИЙН ЯВЦ — «Газар чөлөөлөлт» хэсэгтэй ЯГ ижил тоо.
 *
 * ⚠️ Тэнд харагддаг цагираг нь `бүрэн чөлөөлсөн ÷ нийт нэгж талбар`
 * (`Gazar.tsx` → `d.left.resolved / d.left.n`). Өөр томьёо хэрэглэвэл нэг
 * үзүүлэлт хоёр хуудсанд өөр тоо харуулна.
 */
export async function loadLandPct(): Promise<number | null> {
  const [all, cleared] = await Promise.all([
    queryStats(PARCEL_LEFT.url, [count(PARCEL_LEFT.oid, 'n')], '1=1'),
    queryStats(PARCEL_LEFT.url, [count(PARCEL_LEFT.oid, 'n')], parcelClearedWhere()),
  ]);
  const n = Number(all.n ?? 0);
  if (!n) return null;
  return (Number(cleared.n ?? 0) / n) * 100;
}

/* ═══════════════ ЗУРАГЛАЛ ═══════════════ */

/** Харьцуулалтад — зай, цэг, хаалт, зураасны ялгааг үл тоомсорлоно */
const key = (v: unknown): string => String(v ?? '')
  .replace(/[–—−]/g, '-')
  .toLowerCase()
  .replace(/[\s.,()/"'«»-]/g, '');

/**
 * ХЭСЭГ (depth 1) → гэрээний ШАТНЫ ТАЛБАР.
 *
 * ⚠️ Нэрээр таарна, кодоор БИШ: эх хүснэгтэд «6» гэсэн код ХОЁР мөрд
 * («Барилга угсралт», «Улсын комисс») бичигдсэн. Жагсаалтад байхгүй хэсэг
 * (Улсын комисс) нь эх сурвалжгүй тул ХООСОН үлдэнэ.
 */
const SECTION_FIELD: Record<string, string> = {
  [key('ТЭЗҮ')]: ST.tezu,
  [key('Ажлын зураг төсөл')]: ST.design,
  [key('Газар чөлөөлөлт')]: ST.land,
  [key('Зөвшөөрөл')]: ST.permit,
  [key('Сонгон шалгаруулалт')]: ST.tender,
  [key('Барилга угсралт')]: ST.build,
};

/**
 * ХЭСГИЙН ЖИН — «Төсөлд эзлэх хувь» (2026-09-08, ХЭРЭГЛЭГЧИЙН өгсөн хуваарилалт).
 *
 * ⚠️ Эдгээр нь ӨГӨГДЛӨӨС БОДОГДОХГҮЙ, ТӨСЛИЙН ШИЙДВЭР: «ТЭЗҮ 5% · ажлын зураг
 * төсөл 10% · газар чөлөөлөлт 3% · зөвшөөрөл 1% · сонгон шалгаруулалт 1% ·
 * барилга угсралт 79% · улсын комисс 1%». Тэдгээргүйгээр төслийн НИЙТ
 * гүйцэтгэлийг гаргах боломжгүй — зургаан шат нэг ижил ажлуудыг өөр өнцгөөс
 * хэмждэг тул төсвөөр жигнэвэл 522% болж хэтэрдэг байв.
 *
 * ⚠️ НИЙЛБЭР нь ЗААВАЛ 100 байх ёстой — эс бөгөөс SUMPRODUCT нь хувь БИШ,
 * утгагүй тоо болно. `negtgel.check.mjs` үүнийг шалгана.
 *
 * ⚠️ Хэсэг нь НЭРЭЭР таарна, кодоор БИШ: эх хүснэгтэд «6» гэсэн код ХОЁР мөрд
 * («Барилга угсралт», «Улсын комисс») бичигдсэн.
 */
export const SECTION_WEIGHT: Record<string, number> = {
  [key('ТЭЗҮ')]: 5,
  [key('Ажлын зураг төсөл')]: 10,
  [key('Газар чөлөөлөлт')]: 3,
  [key('Зөвшөөрөл')]: 1,
  [key('Сонгон шалгаруулалт')]: 1,
  [key('Барилга угсралт')]: 79,
  [key('Улсын комисс, хүлээлгэн өгөх')]: 1,
};

/**
 * МОДНЫ БҮЛГИЙН НЭР → гэрээний ТӨРӨЛ (`Turul`).
 *
 * ⚠️ Хоёр талын нэршил ӨӨР: мод нь ажлын нэрээр, гэрээ нь ангиллын нэрээр
 * бичигдсэн. Тиймээс ил зураглал хэрэгтэй — «ойролцоо утгаар» таарах нь
 * чимээгүй буруу бүлэг холбох эрсдэлтэй.
 */
const TURUL_OF: Record<string, string> = {
  /* ⚠️ 2026-09-09: баруун тал нь Cashflow_0909-ийн `ajil_tuvshin2` утгууд.
     Тэдгээр нь «- Барилга угсралт» гэсэн дагавартай тул хуучин богино нэрээр
     таарахаа больсон. Нийгмийн дэд бүтцэд 2-р түвшин ХООСОН тул 1-р түвшний
     нэрээр (`loadCfStages` `turul`-д нөхөгдсөн) таарна. */
  [key('Орон сууцны хороолол барилга угсралт')]: 'ОРОН СУУЦНЫ ХОРООЛОЛ - Барилга угсралт',
  [key('Цэцэрлэг, сургууль')]: 'НИЙГМИЙН ДЭД БҮТЭЦ',
  [key('Гадна зам талбай, тохижилт')]: 'ГАДНА ТОХИЖИЛТ, ӨНДӨРЖИЛТ - Барилга угсралт',
};

/**
 * «Багц N …» → гэрээний ДЭД БАГЦ.
 *
 * ⚠️ «Багц N Гадна зам талбай тохижилт» ЭНД БАЙХГҮЙ САНААТАЙ: мод нь дөрвөн
 * багц, гэрээ нь БАГЦ-16.1…16.7 ба 17.1…17.7 гэсэн арван дөрөв — аль нь алинд
 * харьяалагдахыг өгөгдлөөс тогтоох боломжгүй. Таамаглаж холбовол худал
 * гүйцэтгэл гарна; эцэг мөр нь («Гадна зам талбай, тохижилт») ТӨРЛӨӨРӨӨ бүрэн
 * тоологдоно.
 */
const PKG_RULES: Array<[RegExp, (n: string) => string]> = [
  [/^багц\s*([\d.]+)\s*орон сууцны/i, (n) => `БАГЦ-${n}`],
  [/^багц\s*(\d)\s*гадна дулаан/i, (n) => `БАГЦ-5.${n}`],
  [/^багц\s*(\d)\s*гадна цахилгаан/i, (n) => `БАГЦ-6.${n}`],
];

/** Нэг мөрд тохирсон гэрээнүүд ба «яаж таарсан» */
type Hit = { idx: number[]; how: string } | null;

function ownMatch(row: NegtgelRow, cf: CfStageRow[], all: number[]): Hit {
  /* ⚠️ ХЭСЭГ нь БҮХ гэрээг хамарна — шат бүр гэрээ бүрд хамаатай.
     Гэхдээ ЗӨВХӨН мэдэгдэж буй зургаан хэсэг: «Улсын комисс» нь өөр мөчлөг. */
  if (row.depth <= 1) {
    return SECTION_FIELD[key(row.name)] ? { idx: all, how: tr('бүх гэрээ') } : null;
  }
  const k = key(row.name);

  const t = TURUL_OF[k];
  if (t) {
    const idx = all.filter((j) => key(cf[j].turul) === key(t));
    if (idx.length > 0) return { idx, how: tr('төрөл: {0}', t) };
  }

  for (const [re, to] of PKG_RULES) {
    const m = row.name.match(re);
    if (m) {
      const want = key(to(m[1]));
      const idx = all.filter((j) => key(cf[j].pkg2) === want);
      if (idx.length > 0) return { idx, how: tr('дэд багц: {0}', to(m[1])) };
    }
  }

  /* ⚠️ Нэрээр — гэрээний «Нарийвчилсан төрөл» нь модны нэрээр ЭХЭЛДЭГ
     («Хөрсний ус зайлуулах, доошлуулах ажил» → «…ажлын зураг төсөл
     боловсруулах»). Тиймээс тэнцүү ба угтвар хоёуланг нь үзнэ. */
  const idx = all.filter((j) => key(cf[j].detail).startsWith(k));
  if (idx.length > 0) return { idx, how: tr('нэрээр') };
  return null;
}

/** Мөр бүрийн бодогдсон утга */
export type NegtgelCalc = {
  /** Хамрагдсан гэрээний тоо — 0 бол мөр тааралгүй үлдсэн */
  n: number;
  /** Эцэг мөрийнхөө төсөвт эзлэх хувь */
  inSection: number | null;
  /** Төслийн НИЙТ төсөвт эзлэх хувь */
  inProject: number | null;
  /**
   * ТӨЛӨВЛӨГӨӨТ ХУВЬ — одоогоор ҮРГЭЛЖ `null`.
   *
   * ⚠️ Багана нь ЭХ ХҮСНЭГТЭД байгаа тул харагдацаас ХАСАХГҮЙ, гэхдээ
   * порталын аль ч үйлчилгээнд WBS-ийн мөрд харгалзах ТӨЛӨВЛӨГӨӨТ хувь
   * байхгүй. Эх сурвалж тодорхой болмогц энд бодогдоно; хүртэл нь ХООСОН —
   * 0 гэж бичвэл «төлөвлөгөөгүй ажил» мэт худал уншигдана.
   */
  planPct: number | null;
  /** Тухайн шатны гүйцэтгэл — төсвөөр ЖИГНЭСЭН дундаж */
  actPct: number | null;
  /**
   * НИЙТ ТӨСӨЛД ОРУУЛЖ БУЙ ХУВЬ = `inProject × actPct ÷ 100`.
   *
   * ⚠️ Энэ баганы НИЙЛБЭР нь төслийн НИЙТ гүйцэтгэл (SUMPRODUCT). Тиймээс
   * ЗӨВХӨН НАВЧ мөрд бодогдоно — эцэг ба хүүхэд хоёуланг нь нэмбэл ажил бүр
   * хоёр удаа тоологдоно.
   */
  share: number | null;
  /**
   * ТӨЛӨВЛӨГӨӨНИЙ БИЕЛЭЛТ = гүйцэтгэл ÷ төлөвлөгөө.
   * ⚠️ Төлөвлөгөө байхгүй тул одоогоор `null`. Хуваагч нь 0 байж болох тул
   * эх сурвалж гарсан ч ХАМГААЛАЛТТАЙ бодох ёстой.
   */
  perf: number | null;
  /** Яаж бодогдсоныг хүнд ойлгуулах тайлбар */
  how: string;
};

/**
 * МОДНЫ БҮХ МӨРИЙГ БОДНО.
 *
 * @param landPct «Газар чөлөөлөлт» мөрд хэрэглэх ГАЗРЫН МОДУЛИЙН хувь. Гэрээний
 *   `Gazar_chuluulult` талбар ч ойролцоо утга өгдөг ч хэрэглэгч «Газар
 *   чөлөөлөлт хэсгээс авна» гэж ТУСГАЙЛАН зааварласан тул тэр давамгайлна.
 */
export function computeNegtgel(
  rows: NegtgelRow[],
  cf: CfStageRow[],
  landPct: number | null,
): Map<number, NegtgelCalc> {
  const { parent, kids } = negtgelTree(rows);
  const all = cf.map((_, j) => j);
  const hits = rows.map((r) => ownMatch(r, cf, all));

  /**
   * ХАМРАГДАХ ГЭРЭЭНҮҮД — өөрийн зураглал БАЙХГҮЙ бол ХҮҮХДҮҮДЭЭСЭЭ.
   * ⚠️ Олонлогоор нэгтгэнэ: нэг гэрээ хоёр хүүхдэд орсон ч НЭГ л удаа
   * тоологдоно, эс бөгөөс жин нь хоёр дахин өснө.
   */
  const idxOf = (i: number): number[] => {
    const h = hits[i];
    if (h) return h.idx;
    const set = new Set<number>();
    for (const c of kids[i]) for (const j of idxOf(c)) set.add(j);
    return [...set];
  };
  const idx = rows.map((_, i) => idxOf(i));
  const bud = idx.map((list) => list.reduce((a, j) => a + cf[j].budget, 0));

  /**
   * ДЭД МОДНЫ ТӨСӨВ — ЗӨВХӨН НАВЧ мөрүүдийн нийлбэр.
   *
   * ⚠️ Эцгийн ӨӨРИЙН `bud` БИШ: жинг тараахад эцэг ба хүүхэд хоёуланг нь
   * тоовол ажил бүр давхарлана. Мод нь outline дараалалтай (хүүхэд нь эцгийн
   * ДАРАА) тул ард талаас нь нэг удаа гүйхэд хангалттай.
   */
  const isLeaf = (i: number) => kids[i].length === 0;
  const sub = new Array<number>(rows.length).fill(0);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    sub[i] = isLeaf(i) ? bud[i] : 0;
    for (const c of kids[i]) sub[i] += sub[c];
  }

  /** Тухайн мөр аль ХЭСЭГТ (depth 1) харьяалагдах вэ */
  const sectionOf = (i: number): number => {
    let k = i;
    while (parent[k] >= 0 && rows[parent[k]].depth >= 1) k = parent[k];
    return k;
  };

  const out = new Map<number, NegtgelCalc>();
  rows.forEach((r, i) => {
    const list = idx[i];
    const sec = sectionOf(i);
    const field = r.depth === 0 ? null : SECTION_FIELD[key(rows[sec].name)] ?? null;

    let actPct: number | null = null;
    let how = hits[i] ? hits[i]!.how : (list.length > 0 ? tr('хүүхдээс') : tr('эх сурвалж тодорхойгүй'));

    if (field === ST.land && landPct != null) {
      /* ⚠️ Газар чөлөөлөлтийг ГЭРЭЭНЭЭС БИШ, ГАЗРЫН МОДУЛИАС — хэрэглэгчийн
         шууд заавар. Хоёр тоо ойролцоо (93.1 ↔ 93.2) ч эх нь ӨӨР: нэг нь
         гэрээний талбар, нөгөө нь 2,088 нэгж талбарын бодит тоолол. */
      actPct = landPct;
      how = tr('Газар чөлөөлөлт хэсгээс');
    } else if (field && list.length > 0) {
      let w = 0;
      let s = 0;
      for (const j of list) {
        const p = cf[j].pct[field];
        if (p == null) continue;
        /* ⚠️ Төсөвгүй гэрээг ГЭЭХГҮЙ — жинг 1 гэж авна. Эс бөгөөс төсөв нь
           хараахан батлагдаагүй ажил дунджид ОРОЛЦОХГҮЙ өнгөрнө. */
        const b = cf[j].budget || 1;
        w += b;
        s += b * p;
      }
      actPct = w > 0 ? s / w : null;
    }

    const p = parent[i];

    /*
     * ТӨСӨЛД ЭЗЛЭХ ХУВЬ — хэсгийн ТОГТООСОН жинг доош нь ТӨСВӨӨР тараана.
     *
     * ⚠️ Хэсэг (depth 1) нь ЖИНГЭЭ ШУУД авна: «Улсын комисс» мэт гэрээгүй
     * хэсэг ч 1%-иа хадгалах ёстой, эс бөгөөс баганын нийлбэр 100 болохоо
     * болино.
     * ⚠️ Доод мөрүүд нь тэр жинг өөрийн дэд модныхоо ТӨСӨВТ пропорциональ
     * хуваана — ингэснээр хэсэг доторх нийлбэр нь хэсгийн жинтэй ЯГ тэнцэнэ.
     */
    const secW = SECTION_WEIGHT[key(rows[sec].name)] ?? null;
    let inProject: number | null = null;
    if (r.depth === 0) inProject = 100;
    else if (r.depth === 1) inProject = secW;
    else if (secW != null && sub[sec] > 0 && sub[i] > 0) inProject = (secW * sub[i]) / sub[sec];

    /*
     * НИЙТ ТӨСӨЛД ОРУУЛЖ БУЙ ХУВЬ = жин × гүйцэтгэл.
     *
     * ⚠️ Мөр БҮРД бодогдоно — тухайн мөр төслийн явцад хэдэн нэгж нэмж байгааг
     * шууд харуулна. ГЭХДЭЭ баганыг ЦУГ НЭМЖ БОЛОХГҮЙ: эцэг ба хүүхэд хоёулаа
     * бичигдсэн тул нийлбэр нь хоёр дахин өснө. Төслийн нийт дүн нь ЗӨВХӨН
     * ХЭСГИЙН (depth 1) мөрүүдийн нийлбэр — доор.
     */
    const share = inProject != null && actPct != null ? (inProject * actPct) / 100 : null;

    out.set(r.oid, {
      n: list.length,
      /* ⚠️ Тааралгүй мөрд жин нь 0% БИШ `null`: «жин байхгүй» ба «тэг жин»
         хоёр огт өөр мэдээлэл. */
      inSection: sub[i] > 0 && p >= 0 && sub[p] > 0 ? (sub[i] / sub[p]) * 100 : null,
      inProject,
      planPct: null,
      actPct,
      share,
      /* ⚠️ Хуваагч 0 бол хязгааргүй — `null` үлдээнэ, Infinity гаргахгүй */
      perf: null,
      how,
    });
  });

  /*
   * ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ = SUMPRODUCT(Төсөлд эзлэх хувь, Гүйцэтгэлийн хувь).
   *
   * ⚠️ ЗӨВХӨН ХЭСГИЙН (depth 1) мөрүүдээр — тэдгээрийн жин нь ЯГ 100 болдог
   * бөгөөд шат бүрийн гүйцэтгэл нь БҮХ гэрээг хамарна. Навчаар бодвол
   * зураглалд тааралгүй үлдсэн багцууд (жишээ нь «Багц N Гадна зам талбай»)
   * жингээ хөршүүд рүүгээ шилжүүлж, гүйцэтгэл хиймлээр өснө (навчаар 36.5%,
   * хэсгээр 33.9% — зөрүү нь яг тэр).
   * ⚠️ Хэмжилтгүй шат («Улсын комисс») 0 гэж тоологдоно, ГЭХДЭЭ жин нь
   * хуваарьт ҮЛДЭНЭ — эс бөгөөс тэр 1% бусад шат руу тарна.
   */
  let sumProduct = 0;
  rows.forEach((r) => {
    if (r.depth === 1) sumProduct += out.get(r.oid)?.share ?? 0;
  });
  const root = rows.findIndex((r) => r.depth === 0);
  if (root >= 0) {
    const c = out.get(rows[root].oid);
    if (c) {
      c.actPct = sumProduct;
      c.share = sumProduct;
      c.how = tr('Σ (төсөлд эзлэх хувь × гүйцэтгэл)');
    }
  }
  return out;
}

/** Мод + гэрээ + газрын явцыг зэрэг татаж, бодоод буцаана */
export async function loadNegtgelFull(): Promise<{
  rows: NegtgelRow[];
  calc: Map<number, NegtgelCalc>;
}> {
  const [rows, cf, landPct] = await Promise.all([
    loadNegtgel(),
    loadCfStages(),
    /* ⚠️ Газрын модуль уначихвал ҮЛДСЭН бүх мөр бодогдох ёстой */
    loadLandPct().catch(() => null),
  ]);
  return { rows, calc: computeNegtgel(rows, cf, landPct) };
}

/* ═══════════════ ТӨСЛИЙН НЭГДСЭН ГҮЙЦЭТГЭЛ ═══════════════ */

/** `stageProjectPct`-д хэрэгтэй ХАМГИЙН БАГА мэдээлэл */
export type StageRow = { budget: number; pct: Record<string, number | null> };

/**
 * ТӨСЛИЙН НЭГДСЭН ГҮЙЦЭТГЭЛ = Σ (хэсгийн жин × хэсгийн гүйцэтгэл) ÷ 100.
 *
 * ⚠️ «Нэгтгэл гүйцэтгэл» хүснэгтийн ДЭЭД мөртэй ЯГ ИЖИЛ томьёо — ерөнхий
 * дашбоардын индикатор ч үүнийг уншина. Хоёр газар өөр байвал нэг үзүүлэлт
 * хоёр хуудсанд өөр тоо харуулна.
 *
 * ⚠️ ЖИН нь ҮРГЭЛЖ БҮТЭН 100: хэмжилтгүй шат (жишээ нь «Улсын комисс») 0 гэж
 * тоологдох ба жин нь хуваарьт ҮЛДЭНЭ. Эс бөгөөс тэр 1% бусад шат руу тарж,
 * гүйцэтгэл хиймлээр өснө.
 *
 * ⚠️ ШҮҮЛТТЭЙ ажиллана: дуудагч нь шүүсэн гэрээнүүдээ өгвөл шатны хувь нь
 * тэдгээрээр дахин жигнэгдэнэ. Харин ЖИН нь төслийн шийдвэр тул шүүлтээс ҮЛ
 * ХАМААРНА — эс бөгөөс нэг багц сонгоход «барилга угсралт 79%» гэсэн жин
 * өөрчлөгдөж, хувь нь утгаа алдана.
 *
 * @param landPct «Газар чөлөөлөлт» шатны хувь — ГАЗРЫН МОДУЛИАС (хэрэглэгчийн
 *   заавар). `null` бол гэрээний `Gazar_chuluulult` талбарт шилжинэ.
 */
export function stageProjectPct(rows: StageRow[], landPct: number | null): number | null {
  /** Нэг шатны төсвөөр жигнэсэн дундаж */
  const stage = (field: string): number | null => {
    let w = 0;
    let s = 0;
    for (const r of rows) {
      /* ⚠️ Дуудагч `pct`-гүй мөр өгч болно (хуучин зураглал, тестийн mock) —
         уначихвал БҮХ индикатор хоосорно. Ийм мөр зүгээр л тоологдохгүй. */
      const p = r.pct?.[field] ?? null;
      if (p == null) continue;
      /* ⚠️ Төсөвгүй гэрээг ГЭЭХГҮЙ — жинг 1 гэж авна */
      const b = r.budget || 1;
      w += b;
      s += b * p;
    }
    return w > 0 ? s / w : null;
  };

  const FIELD: Array<[string, string]> = [
    [key('ТЭЗҮ'), ST.tezu],
    [key('Ажлын зураг төсөл'), ST.design],
    [key('Газар чөлөөлөлт'), ST.land],
    [key('Зөвшөөрөл'), ST.permit],
    [key('Сонгон шалгаруулалт'), ST.tender],
    [key('Барилга угсралт'), ST.build],
  ];

  let sum = 0;
  let seen = 0;
  for (const [k, field] of FIELD) {
    const w = SECTION_WEIGHT[k] ?? 0;
    const p = field === ST.land && landPct != null ? landPct : stage(field);
    if (p != null) { sum += (w * p) / 100; seen += w; }
  }
  /* ⚠️ Нэг ч шат хэмжигдээгүй бол `null` — 0% гэж хэлэхгүй */
  return seen > 0 ? sum : null;
}
