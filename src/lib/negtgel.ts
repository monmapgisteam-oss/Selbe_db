/**
 * ТӨСЛИЙН НЭГТГЭЛ ГҮЙЦЭТГЭЛ — ажлын задаргааны (WBS) мод ба түүний бөглөлт.
 *
 * ⚠️ Эх нь `Tusul_guitsetgel/0` (`TUSUL_NEGTGEL`): 198 мөрийн МОД бөгөөд бүтэц
 * нь бэлэн, тоон утга нь БҮГД ХООСОН. Хэрэглэгчийн заавар (2026-09-08):
 * «мэдээллийг нь бөглөөрэй — жишээ нь газар чөлөөлөлтийг Газар чөлөөлөлт
 * хэсгээс авна».
 *
 * ⚠️ БӨГЛӨЛТИЙН ЭХ нь `Cashflow_0904`: гэрээ бүр модны ЗУРГААН хэсэг тус бүрд
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
    outFields: [
      CF.type, CF.pkg2, CF.detail, CF.budget,
      ST.tezu, ST.design, ST.land, ST.permit, ST.tender, ST.build,
    ],
    orderBy: CASHFLOW_NEW.oid,
  });
  return rows.map((r) => ({
    turul: String(r[CF.type] ?? ''),
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
 * МОДНЫ БҮЛГИЙН НЭР → гэрээний ТӨРӨЛ (`Turul`).
 *
 * ⚠️ Хоёр талын нэршил ӨӨР: мод нь ажлын нэрээр, гэрээ нь ангиллын нэрээр
 * бичигдсэн. Тиймээс ил зураглал хэрэгтэй — «ойролцоо утгаар» таарах нь
 * чимээгүй буруу бүлэг холбох эрсдэлтэй.
 */
const TURUL_OF: Record<string, string> = {
  [key('Орон сууцны хороолол барилга угсралт')]: 'ОРОН СУУЦНЫ ХОРООЛЛЫН БАРИЛГАЖИЛТ',
  [key('Цэцэрлэг, сургууль')]: 'НИЙГМИЙН ДЭД БҮТЭЦ',
  [key('Гадна зам талбай, тохижилт')]: 'ГАДНА ТОХИЖИЛТ, ӨНДӨРЖИЛТ',
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
  /** Тухайн шатны гүйцэтгэл — төсвөөр ЖИГНЭСЭН дундаж */
  actPct: number | null;
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
  const total = cf.reduce((a, r) => a + r.budget, 0);

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
    out.set(r.oid, {
      n: list.length,
      /* ⚠️ Тааралгүй мөрд жин нь 0% БИШ `null`: «жин байхгүй» ба «тэг жин»
         хоёр огт өөр мэдээлэл. */
      inSection: list.length > 0 && p >= 0 && bud[p] > 0 ? (bud[i] / bud[p]) * 100 : null,
      /* ⚠️ ХЭСЭГ бүр бүх гэрээг хамардаг тул тэдний «төсөлд эзлэх» нь үргэлж
         100% — утгагүй. Зөвхөн доод түвшний мөрд бодно. */
      inProject: list.length > 0 && r.depth >= 2 && total > 0 ? (bud[i] / total) * 100 : null,
      actPct,
      how,
    });
  });
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
