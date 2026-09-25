/**
 * НЭГТГЭЛ ГҮЙЦЭТГЭЛ — СИСТЕМЭЭС АВТОМАТААР БОДОХ (2026-09-25).
 *
 * Хэрэглэгчийн заавар: «нэгтгэл гүйцэтгэлийг хүн бөглөхгүй, update хийхгүй —
 * өөрөө системээс мэдээллээ аваад өөрийгөө шинэчилдэг байх ёстой. Гол
 * зорилго: ажил явагдаж байгаа л бол 36.66% өөрчлөгдөж байх ёстой».
 *
 * ── ХҮСНЭГТИЙН ТОМЬЁО (амьд өгөгдлөөр БАТАЛГААЖСАН, 2026-09-25) ──
 *   · Эцэг мөр = SUMPRODUCT(хүүхдийн `HESEGT_EZLEH`, хүүхдийн утга) —
 *     гүйцэтгэл ба ГУРВАН төлөвлөгөөнд адил (220 эцэг мөрийн 218 нь яг
 *     таарсан; үлдсэн 2 нь эх хүснэгтийн гарын алдаа: 3.2.2.1-ийн 3.767).
 *   · Биелэлт = гүйцэтгэл ÷ төлөвлөгөө; төлөвлөгөө 0 бол 0 (352/352 таарсан).
 *   · Төслийн нийт = Σ (1-р түвшний `TOSOLD_EZLEH_HUVI` × гүйцэтгэл).
 *   ⚠️ Хуваагч нь Σw БИШ, 1 (Excel-ийн SUMPRODUCT) — жингийн нийлбэр 1-ээс
 *     зөрсөн бүлэг (5.2: 1.074) эх Excel-д ч ИЖИЛ бодогддог. Өөрөөр
 *     «засвал» хүснэгтийн эзний тоотой зөрнө.
 *
 * ── НАВЧ МӨРИЙН ЭХ ──
 *   ТЭЗҮ · Зураг төсөл · Зөвшөөрөл · Сонгон шалгаруулалт
 *       → Cashflow-ийн барилга угсралтын гэрээний шатны талбар, багцаар
 *   Газар чөлөөлөлт (3 ба 5.1.1) → «Газар чөлөөлөлт» модулийн явц
 *   5.1.2 Буулгалт, цэвэрлэгээ   → Cashflow «Буулгалт цэвэрлэгээ» гэрээнүүд
 *   5.2.1 Орон сууц (багцаар)     → «Багцын гүйцэтгэл»-ийн биет хувь
 *   5.2.x бусад (багцаар)         → Cashflow `guitsetgel_huvi`
 *   Гүйцэтгэгчийн төлөвлөгөө (орон сууц) → «Хуваарь»-ийн төлөвлөгөөт муруй
 *
 * ⚠️ ЭХ СУРВАЛЖГҮЙ НАВЧ ХҮСНЭГТИЙН УТГАА ХАДГАЛНА: 5.1.3 Талбайн бэлтгэл,
 *   6 Хүлээлгэн өгөх, 7 Зүгшрүүлэлт, гэрээ ба «гэрээ ГЧ» төлөвлөгөө,
 *   системд байхгүй багц (6.9 …). Хоосон/0 гэж дарвал хүний оруулсан
 *   мэдээлэл чимээгүй устана.
 * ⚠️ ЖИН (`HESEGT_EZLEH`, `TOSOLD_EZLEH_HUVI`) нь ТӨЛӨВЛӨЛТИЙН ШИЙДВЭР —
 *   ХЭЗЭЭ Ч бичихгүй, зөвхөн уншина.
 * ⚠️ Бүх утга ҮЙЛЧИЛГЭЭНИЙ нэгжээр: 0–1 бутархай.
 */
import { t as tr } from '@/lib/i18nCore';
import { queryFeatures } from '@/lib/query';
import { TUSUL_NEGTGEL, CASHFLOW_NEW, CF_WORK_WHERE, bagtsKey } from '@/lib/services';
import { negtgelDepth } from '@/lib/negtgel';

const F = TUSUL_NEGTGEL.fields;
const CF = CASHFLOW_NEW.fields;
const ST = CASHFLOW_NEW.stages;

/* ═══════════════ ХҮСНЭГТИЙН МӨР ═══════════════ */

/** Бичигддэг утгууд — бүгд 0–1 */
export type NegVals = {
  act: number | null;
  planG: number | null;
  planGch: number | null;
  planGu: number | null;
  perfG: number | null;
  perfGch: number | null;
  perfGu: number | null;
};

export type NegRaw = NegVals & {
  oid: number;
  code: string;
  name: string;
  bagts: string;
  /** МОДНЫ гүн — давхардсан бүлэг кодыг засч оруулсан (`nestDupGroups`) */
  depth: number;
  /** Эцэгтээ эзлэх жин (0–1) */
  w: number | null;
  /** Төсөлд эзлэх жин (0–1) */
  p: number | null;
  /** Урьдчилсан төсөвт өртөг, ₮ — зөвхөн харуулна */
  budget: number | null;
};

/** Үйлчилгээний талбар ↔ `NegVals` түлхүүр */
export const VAL_FIELD: Record<keyof NegVals, string> = {
  act: F.actPct,
  planG: F.planGeree,
  planGch: F.planGch,
  planGu: F.planGuits,
  perfG: F.perfGeree,
  perfGch: F.perfGch,
  perfGu: F.perfGuits,
};

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/**
 * ДАВХАРДСАН БҮЛЭГ КОДЫГ ЭХНИЙХИЙНХЭЭ ДООР ОРУУЛНА.
 *
 * ⚠️ Эх хүснэгтэд «5.2.3» ДӨРВӨН мөрд: эхнийх нь «ИНЖЕНЕРИЙН ДЭД БҮТЭЦ»
 * бүлэг, дараагийн гурав нь үнэндээ түүний ДЭД хэсэг (жин нь 5.2.3.1 +
 * 5.2.3.2-той нийлээд ЯГ 1 болдог, эцгийн 2.3% гүйцэтгэл ч зөвхөн ингэж
 * таарна). Кодоор гүн тогтоовол тэд 5.2-ын шууд хүүхэд болж, 5.2-ын жин 1.6
 * болно.
 * ⚠️ «3» (Газар чөлөөлөлт · Зөвшөөрөл) давхардал нь ӨӨР: эхнийх нь хүүхэдгүй
 * тул тэд тусдаа хоёр үе шат хэвээр. Дүрэм: эхний давхцал ХҮҮХЭДТЭЙ (бүлэг)
 * бол л дараагийнхыг түүний доор оруулна.
 */
export function nestDupGroups(codes: string[]): number[] {
  const d0 = codes.map((c) => negtgelDepth(c));
  const d = d0.slice();
  const first = new Map<string, number>();
  codes.forEach((c, i) => {
    if (!c) return;
    /* ⚠️ Аль хэдийн шилжсэн дэд модны мөрийг ДАХИН шилжүүлэхгүй: «5.2.3 Авто
       зам»-ын хүүхэд «5.2.3.1» нь өөрөө ч давхардсан код тул хоёр дахин
       шилжиж 6-р түвшинд унадаг байв (2026-09-25). */
    if (d[i] !== d0[i]) return;
    const f = first.get(c);
    if (f == null) { first.set(c, i); return; }
    const isGroup = f + 1 < codes.length && d0[f + 1] > d0[f];
    if (!isGroup) return;
    d[i] += 1;
    for (let k = i + 1; k < codes.length && d0[k] > d0[i]; k += 1) d[k] += 1;
  });
  return d;
}

/** Эцгийн индекс ба хүүхдүүд — БАЙРЛАЛ + (засагдсан) ГҮНЭЭР */
export function treeOf(depth: number[]): { parent: number[]; kids: number[][] } {
  const parent = new Array<number>(depth.length).fill(-1);
  const stack: number[] = [];
  depth.forEach((dd, i) => {
    while (stack.length > 0 && depth[stack[stack.length - 1]] >= dd) stack.pop();
    parent[i] = stack.length > 0 ? stack[stack.length - 1] : -1;
    stack.push(i);
  });
  const kids: number[][] = depth.map(() => []);
  parent.forEach((pp, i) => { if (pp >= 0) kids[pp].push(i); });
  return { parent, kids };
}

/** Хүснэгтийг ХАДГАЛСАН утгатай нь бүтнээр уншина */
export async function loadNegRaw(): Promise<NegRaw[]> {
  const raw = await queryFeatures(TUSUL_NEGTGEL.url, {
    outFields: [TUSUL_NEGTGEL.oid, F.code, F.name, F.bagts, F.budget, F.inSection, F.inProject,
      ...Object.values(VAL_FIELD)],
    /* ⚠️ OID-оор — мөрийн дараалал нь Excel-ийн мод; кодоор эрэмбэлбэл эвдэрнэ */
    orderBy: TUSUL_NEGTGEL.oid,
  });
  const codes = raw.map((r) => String(r[F.code] ?? '').trim());
  const depth = nestDupGroups(codes);
  return raw.map((r, i) => {
    const v = {} as NegVals;
    for (const [k, f] of Object.entries(VAL_FIELD)) v[k as keyof NegVals] = num(r[f]);
    return {
      ...v,
      oid: Number(r[TUSUL_NEGTGEL.oid] ?? 0),
      code: codes[i],
      name: String(r[F.name] ?? '').replace(/\s+/g, ' ').trim(),
      bagts: String(r[F.bagts] ?? '').trim(),
      depth: depth[i],
      w: num(r[F.inSection]),
      p: num(r[F.inProject]),
      budget: num(r[F.budget]),
    };
  });
}

/* ═══════════════ СИСТЕМИЙН ЭХ ═══════════════ */

export type CfWork = {
  /** Багцын дугаар — `pkgNo`-оор цэвэрлэсэн («5.1», «1-4», «6.1,6.2») */
  no: string;
  sec1: string;
  sec2: string;
  name: string;
  budget: number;
  /** 0–100; `null` = хэмжилтгүй */
  tezu: number | null;
  design: number | null;
  permit: number | null;
  tender: number | null;
  build: number | null;
};

export type NegSources = {
  cf: CfWork[];
  /** «Газар чөлөөлөлт» модулийн явц, 0–100 */
  land: number | null;
  /** Орон сууцны багцын биет гүйцэтгэл — `bagtsKey` → 0–100 */
  housing: Map<string, number>;
  /** Орон сууцны багцын ТӨЛӨВЛӨГӨӨТ хувь (хуваариар, энэ сар) — `bagtsKey` → 0–100 */
  housingPlan: Map<string, number>;
};

/**
 * БАГЦЫН ДУГААР — эх бүрийн бичлэгийг нэг хэлбэрт.
 *
 * «БАГЦ-5.1» · «Багц 5.1» · «БАГЦ - 19.1» · «БАГЦ -9» · «БАГЦ 1- 4» ·
 * «БАГЦ-6.1, 6.2 Нэмэлт ажил» → «5.1» · «19.1» · «9» · «1-4» · «6.1,6.2».
 *
 * ⚠️ ЦЭГИЙГ ХАДГАЛНА — `bagtsKey` цэгийг хасдаг тул «1-4» ба «14» (Нэвтрэх
 * суваг) нэг түлхүүр болж, орон сууцны суурийн холболт суваг руу холбогдоно.
 */
export const pkgNo = (s: string): string => s
  .toUpperCase()
  .replace(/НЭМЭЛТ\s*АЖИЛ/g, '')
  .replace(/БАГЦ/g, '')
  .replace(/[–—−]/g, '-')
  .replace(/\s+/g, '')
  .replace(/^-+/, '');

/** Нэрийн харьцуулалтад — зай, цэг, хаалтын ялгааг үл тоомсорлоно */
const nkey = (v: unknown): string => String(v ?? '')
  .replace(/[–—−]/g, '-')
  .toLowerCase()
  .replace(/[\s.,()/"'«»-]/g, '');

/**
 * ⚠️ ЗӨВХӨН барилга угсралт ба нийгмийн дэд бүтцийн ГЭРЭЭНҮҮД: «ТЭЗҮ, ЗУРАГ
 * ТӨСӨЛ» хэсэгт мөн «Багц 18», «Багц 8» гэсэн ЗУРАГ ТӨСЛИЙН гэрээ бий — тэдний
 * `guitsetgel_huvi` нь зураг төслийн явц тул барилгын мөрд холбогдох ёсгүй.
 * Шатны талбарууд (ТЭЗҮ, зураг төсөл …) ч гэсэн багц бүрийн БАРИЛГЫН гэрээнд
 * бөглөгддөг.
 */
const WORK_SEC = /^(БАРИЛГА УГСРАЛТ|НИЙГМИЙН ДЭД БҮТЭЦ)/;

export async function loadCfWork(): Promise<CfWork[]> {
  const rows = await queryFeatures(CASHFLOW_NEW.url, {
    where: CF_WORK_WHERE,
    outFields: [CF.project, CF.type, CF.pkg2, CF.detail, CF.budget,
      ST.tezu, ST.design, ST.permit, ST.tender, ST.build],
    orderBy: CASHFLOW_NEW.oid,
  });
  return rows.map((r) => ({
    no: pkgNo(String(r[CF.pkg2] ?? '')),
    sec1: String(r[CF.project] ?? '').trim().toUpperCase(),
    sec2: String(r[CF.type] ?? '').trim(),
    name: String(r[CF.detail] ?? ''),
    budget: Number(r[CF.budget] ?? 0) || 0,
    tezu: num(r[ST.tezu]),
    design: num(r[ST.design]),
    permit: num(r[ST.permit]),
    tender: num(r[ST.tender]),
    build: num(r[ST.build]),
  }));
}

export async function loadNegSources(): Promise<NegSources> {
  const [{ loadLandPct }, { loadFillPkgProgress }, { loadPlanCurve }] = await Promise.all([
    import('@/lib/negtgel'),
    import('@/lib/live'),
    import('@/lib/planProgress'),
  ]);
  /* ⚠️ Аль нэг эх уначихвал БҮХЭЛДЭЭ унана (catch-гүй) — хагас эхээр бодож
     хүснэгт рүү бичвэл унасан эхийн мөрүүд хуучин утгаараа үлдэж, шинэ
     тоонуудтай холилдсон «нийт» гарна. Дуудагч хадгалсан утгаа харуулна. */
  const [cf, land, housing, curve] = await Promise.all([
    loadCfWork(),
    loadLandPct(),
    loadFillPkgProgress(),
    loadPlanCurve(),
  ]);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const housingPlan = new Map<string, number>();
  for (const [k, pts] of curve.byBagts) {
    let v: number | null = null;
    for (const pt of pts) if (pt.label <= ym) v = pt.pct;
    if (v != null) housingPlan.set(k, v);
  }
  return { cf, land, housing, housingPlan };
}

/* ═══════════════ ТООЦОО ═══════════════ */

type Stage = 'tezu' | 'design' | 'permit' | 'tender' | 'land' | 'build' | null;

/** 1-р түвшний нэр → үе шат */
const STAGE_OF: Record<string, Stage> = {
  [nkey('ТЭЗҮ')]: 'tezu',
  [nkey('Ажлын зураг төсөл')]: 'design',
  [nkey('Газар чөлөөлөлт')]: 'land',
  [nkey('Зөвшөөрөл')]: 'permit',
  [nkey('Сонгон шалгаруулалт')]: 'tender',
  [nkey('Барилга угсралт')]: 'build',
};

export type NegCalcRow = NegRaw & {
  /** Навч мөрийн гүйцэтгэл СИСТЕМЭЭС ирсэн үү (эсвэл хадгалсан хэвээр) */
  auto: boolean;
  /** Эцгийнхээ нийлбэрт ОРОХГҮЙ мөр (`rollKids`) — «Нийслэл төсөв» */
  outside?: boolean;
  /** Хүнд ойлгуулах эх сурвалжийн тайлбар */
  how: string;
};

/** Багцаар Cashflow-оос — өртгөөр жигнэсэн дундаж, 0–100 */
function cfPick(cf: CfWork[], no: string, name: string, field: keyof Pick<CfWork, 'tezu' | 'design' | 'permit' | 'tender' | 'build'>): number | null {
  const work = cf.filter((c) => WORK_SEC.test(c.sec1));
  let hit: CfWork[];
  if (no) {
    hit = work.filter((c) => c.no === no);
    /* ⚠️ Эх хүснэгтийн «Багц-7» / «Багц 18» нь Cashflow-д 7.1 + 7.2 / 18.1 гэж
       задарсан — ДЭД дугааруудыг нь нэгтгэнэ («7.» угтвар, «71» биш). */
    if (!hit.length) hit = work.filter((c) => c.no.startsWith(`${no}.`));
  } else {
    /* ⚠️ Багцын дугааргүй мөр («Сэлбэ голын үерийн ус …») — НЭРЭЭР, мөн
       дугааргүй гэрээнээс л. Угтварын 20 тэмдэгт: хоёр талд төгсгөл нь өөр. */
    const k = nkey(name).slice(0, 20);
    hit = k.length >= 10 ? work.filter((c) => !c.no && nkey(c.name).startsWith(k)) : [];
  }
  let w = 0;
  let s = 0;
  for (const c of hit) {
    const v = c[field];
    if (v == null) continue;
    /* ⚠️ Төсөвгүй гэрээг гээхгүй — жин 1 */
    const b = c.budget || 1;
    w += b;
    s += b * v;
  }
  return w > 0 ? s / w : null;
}

/**
 * НАВЧ мөрийн СИСТЕМИЙН утга — 0–100. `null` = эх сурвалжгүй (хадгалсан утга үлдэнэ).
 */
function leafValue(
  rows: NegRaw[],
  i: number,
  parent: number[],
  src: NegSources,
): { act: number | null; planGu: number | null; how: string } {
  const chain: string[] = [];
  for (let k = i; k >= 0; k = parent[k]) chain.push(nkey(rows[k].name));
  const stage = STAGE_OF[chain[chain.length - 1]] ?? null;
  const r = rows[i];
  const no = pkgNo(r.bagts);
  const none = { act: null, planGu: null, how: tr('Системд эх сурвалжгүй — хүснэгтийн утга') };

  switch (stage) {
    case 'land':
      return { act: src.land, planGu: null, how: tr('Газар чөлөөлөлт хэсгээс') };
    case 'tezu':
    case 'design':
    case 'permit':
    case 'tender': {
      const v = cfPick(src.cf, no, r.name, stage);
      return v == null ? none : { act: v, planGu: null, how: tr('Санхүүжилт (Cashflow) — гэрээний шатны явц') };
    }
    case 'build': {
      /* ⚠️ ДАРААЛАЛ ЧУХАЛ: «5.1.3 Талбайн бэлтгэл» дотор ч «Орон сууцны
         хороолол» гэсэн мөр бий — бэлтгэл ажил нь биет гүйцэтгэл БИШ. */
      if (chain.includes(nkey('Газар чөлөөлөлт'))) {
        return { act: src.land, planGu: null, how: tr('Газар чөлөөлөлт хэсгээс') };
      }
      if (chain.includes(nkey('Буулгалт, цэвэрлэгээ'))) {
        let w = 0;
        let s = 0;
        for (const c of src.cf) {
          if (nkey(c.sec2) !== nkey('Буулгалт цэвэрлэгээ') || c.build == null) continue;
          const b = c.budget || 1;
          w += b;
          s += b * c.build;
        }
        return w > 0
          ? { act: s / w, planGu: null, how: tr('Санхүүжилт (Cashflow) — буулгалт, цэвэрлэгээний гэрээ') }
          : none;
      }
      if (chain.includes(nkey('Талбайн бэлтгэл ажил'))) return none;
      if (chain.includes(nkey('Орон сууцны хороолол барилга угсралт')) && r.bagts) {
        const k = bagtsKey(r.bagts);
        const act = src.housing.get(k) ?? null;
        const plan = src.housingPlan.get(k) ?? null;
        /* ⚠️ Блокийн хэмжилтгүй мөр («Суурийн холболтын ажил · БАГЦ 1-4») —
           доорх Cashflow замаар үргэлжилнэ, «эх сурвалжгүй» гэж зогсохгүй */
        if (act != null || plan != null) {
          return { act, planGu: plan, how: tr('Багцын гүйцэтгэл — блокуудын биет хувь; төлөвлөгөө Хуваариас') };
        }
      }
      const v = cfPick(src.cf, no, r.name, 'build');
      return v == null ? none : { act: v, planGu: null, how: tr('Санхүүжилт (Cashflow) — гэрээний гүйцэтгэл') };
    }
    default:
      return none;
  }
}

/**
 * ЭЦГИЙН НИЙЛБЭРТ ОРОХ ХҮҮХДҮҮД.
 *
 * ⚠️ Эх Excel-д «5.2 Барилга угсралт ажил»-ын жин 80.69 + 3.70 + 15.61 = 100
 * бөгөөд «5.2.4 НИЙГМИЙН ДЭД БҮТЭЦ (Нийслэл төсөв)» (7.40) нь SUMPRODUCT-д
 * ОРДОГГҮЙ (K279 = F280·K280 + F289·K289 + F305·K305) — нийслэлийн төсвөөр
 * тусдаа санхүүждэг тул. Жин нь ч түүнийг ХАССАН суурьтай (E338 ÷ E279).
 * ⚠️ Ерөнхий дүрэм: хүүхдийн жингийн нийлбэр 1-ээс ИЛҮҮ бол нийлбэр нь 1
 * болох УРД ТАЛЫН хүүхдүүдийг л авна. Нэр/код хатуу бичихгүй — эх хүснэгтэд
 * ийм бүлэг нэмэгдвэл өөрөө ажиллана.
 */
export function rollKids(kids: number[], w: Array<number | null>): number[] {
  const sum = kids.reduce((a, k) => a + (w[k] ?? 0), 0);
  if (sum <= 1.005) return kids;
  let acc = 0;
  for (let j = 0; j < kids.length; j += 1) {
    acc += w[kids[j]] ?? 0;
    if (Math.abs(acc - 1) <= 0.005) return kids.slice(0, j + 1);
  }
  return kids;
}

/** 6 оронтой бутархай — хөвөх цэгийн үлдэгдэл «өөрчлөгдсөн» гэж бичигдэхгүй */
const r6 = (v: number | null): number | null => (v == null ? null : Math.round(v * 1e6) / 1e6);

/**
 * БҮХ МӨРИЙГ БОДНО — цэвэр функц (тест: `negtgel.check.mjs`).
 *
 * ⚠️ Хадгалсан утга нь АНХДАГЧ: системд эх сурвалжгүй навч (ба
 * төлөвлөгөөний үлдсэн хувилбарууд) хүснэгтийнхээ утгаар оролцоно.
 */
export function computeNegAuto(rows: NegRaw[], src: NegSources): NegCalcRow[] {
  const { parent, kids } = treeOf(rows.map((r) => r.depth));
  const out: NegCalcRow[] = rows.map((r) => ({ ...r, auto: false, how: tr('Хүснэгтийн утга') }));

  rows.forEach((_, i) => {
    if (kids[i].length) return;
    const v = leafValue(rows, i, parent, src);
    const o = out[i];
    o.how = v.how;
    if (v.act != null) { o.act = r6(v.act / 100); o.auto = true; }
    if (v.planGu != null) o.planGu = r6(v.planGu / 100);
  });

  /* ЭЦЭГ — SUMPRODUCT. Мод нь outline дараалалтай (хүүхэд нь эцгийн ДАРАА)
     тул ард талаас нэг удаа гүйхэд хүүхдүүд үргэлж өмнө нь бодогдсон байна. */
  const SUM: (keyof NegVals)[] = ['act', 'planG', 'planGch', 'planGu'];
  const w = rows.map((r) => r.w);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (!kids[i].length) continue;
    const o = out[i];
    const use = rollKids(kids[i], w);
    for (const k of kids[i]) if (!use.includes(k)) out[k].outside = true;
    for (const f of SUM) {
      /* ⚠️ Хоосон нүд 0 — Excel-ийн SUMPRODUCT-тэй ижил */
      o[f] = r6(use.reduce((a, k) => a + (out[k].w ?? 0) * (out[k][f] ?? 0), 0));
    }
    o.auto = kids[i].some((k) => out[k].auto);
    o.how = tr('Доод мөрүүдээс (жингээр)');
  }

  /* БИЕЛЭЛТ — гүйцэтгэл ÷ төлөвлөгөө; төлөвлөгөө 0 бол 0 (эх хүснэгтийн дүрэм) */
  for (const o of out) {
    const perf = (plan: number | null) => (plan && o.act != null ? r6(o.act / plan) : 0);
    o.perfG = perf(o.planG);
    o.perfGch = perf(o.planGch);
    o.perfGu = perf(o.planGu);
  }
  return out;
}

/** Төслийн нийт гүйцэтгэл (0–1) = Σ 1-р түвшний жин × гүйцэтгэл */
export const projectTotal = (rows: Array<{ depth: number; p: number | null; act: number | null }>): number | null => {
  let w = 0;
  let s = 0;
  for (const r of rows) {
    if (r.depth !== 1 || r.p == null) continue;
    w += r.p;
    s += r.p * (r.act ?? 0);
  }
  return w > 0 ? s : null;
};

/**
 * ҮЙЛЧИЛГЭЭ РҮҮ БИЧИХ ЗАСВАРУУД — зөвхөн ӨӨРЧЛӨГДСӨН талбар.
 *
 * ⚠️ Жин, нэр, код, багцыг ХЭЗЭЭ Ч бичихгүй. `null`-оор утга дарахгүй.
 */
export function negDiff(stored: NegRaw[], calc: NegCalcRow[]): Record<string, unknown>[] {
  const ups: Record<string, unknown>[] = [];
  stored.forEach((s, i) => {
    const c = calc[i];
    const u: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(VAL_FIELD)) {
      const nv = c[k as keyof NegVals];
      const ov = s[k as keyof NegVals];
      if (nv == null) continue;
      if (ov == null || Math.abs(nv - ov) > 1e-6) u[f] = nv;
    }
    if (Object.keys(u).length) ups.push({ [TUSUL_NEGTGEL.oid]: s.oid, ...u });
  });
  return ups;
}

/* ═══════════════ АВТОМАТ ШИНЭЧЛЭЛТ ═══════════════ */

/** ⚠️ Нэг хөтөчөөс 10 минутад нэгээс олон удаа бичихгүй */
const SYNC_GAP = 10 * 60_000;
let lastSync = 0;
let syncing: Promise<number> | null = null;

/**
 * БОДСОН УТГЫГ ХҮСНЭГТ РҮҮ БИЧНЭ — хүн оролцохгүй.
 *
 * ⚠️ Нэвтэрсэн хэрэглэгчийн ArcGIS эрхээр явна; засах эрхгүй бол сервер
 * татгалзаж, энд чимээгүй алгасна (дэлгэц нь бодсон утгаа харуулсаар).
 * ⚠️ ХАМГААЛАЛТ: төслийн нийт нэг дор 20-оос илүү нэгжээр өөрчлөгдвөл
 * бичихгүй — эх сурвалжийн эвдрэл (жишээ нь хоосон хариу) хүснэгтийг
 * чимээгүй сүйтгэхээс сэргийлнэ.
 * ⚠️ Буцаах утга — бичсэн мөрийн тоо (алгассан бол 0).
 */
export async function syncNegtgel(stored: NegRaw[], calc: NegCalcRow[]): Promise<number> {
  if (syncing) return syncing;
  if (Date.now() - lastSync < SYNC_GAP) return 0;
  const { tokenParam } = await import('@/lib/authToken');
  if (!tokenParam().token) return 0;
  const a = projectTotal(stored);
  const b = projectTotal(calc);
  if (a != null && b != null && Math.abs(a - b) > 0.2) {
    console.warn('[negtgel] нийт гүйцэтгэл хэт их өөрчлөгдсөн тул бичсэнгүй', a, b);
    return 0;
  }
  const ups = negDiff(stored, calc);
  lastSync = Date.now();
  if (!ups.length) return 0;
  syncing = (async () => {
    try {
      const { applyAll } = await import('@/lib/tableWrite');
      const r = await applyAll(TUSUL_NEGTGEL.url, TUSUL_NEGTGEL.oid, { updates: ups });
      return r.n;
    } catch (e) {
      console.warn('[negtgel] автомат шинэчлэл бичигдсэнгүй', e);
      return 0;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}
