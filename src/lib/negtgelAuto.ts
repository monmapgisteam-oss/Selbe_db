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
 *   ⚠️ Хуваагч нь Σw БИШ, 1 (Excel-ийн SUMPRODUCT). Жингийн нийлбэр 1-ээс
 *     ИХ бүлэгт (5.2: 1.074) эх Excel нь СҮҮЛИЙН «5.2.4 Нийслэл төсөв»-ийг
 *     нийлбэрт ОРУУЛДАГГҮЙ — үлдсэн жин яг 1 (`rollKids`-ийг үз). Σw-д
 *     хувааж «засвал» хүснэгтийн эзний тоотой зөрнө.
 *     (⚠️ 2026-09-25: урьд нь энд «1.074 нь Excel-д ч ИЖИЛ бодогддог» гэж
 *     `rollKids`-тэй зөрчилдсөн тайлбар байв.)
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
import { TUSUL_NEGTGEL, CASHFLOW_NEW, CF_WORK_WHERE, bagtsKey, roleForUser } from '@/lib/services';
import { negtgelDepth } from '@/lib/negtgel';
import { currentUser } from '@/lib/who';

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
  /** Орон сууцны багцын ТӨЛӨВЛӨГӨӨТ хувь (хуваариар, ӨНӨӨДРИЙН байдлаар) — `bagtsKey` → 0–100 */
  housingPlan: Map<string, number>;
  /**
   * БЛОКТОЙ (барилгын) бөглөх хуудастай багцууд — `bagtsKey`.
   * ⚠️ 2026-09-25: эдгээрийн хэмжилт/хуваарь дутуу бол Cashflow руу УНАХГҮЙ
   *    (`leafValue`-ийн ⚠️). Сонголттой — хуучин дуудагч/тест өгөхгүй бол хоосон.
   */
  housingPkgs?: Set<string>;
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

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * ОРОН СУУЦНЫ ТӨЛӨВЛӨГӨӨТ ХУВЬ — ӨНӨӨДРИЙН байдлаар (цэвэр функц, тест).
 *
 * ⚠️ 2026-09-25: урьд нь ЭНЭ сарын цэг (сарын СҮҮЛИЙН өдрийн утга)-ийг шууд
 *    авдаг тул сарын 1-нд л гэхэд бүтэн сарын төлөвлөгөө «хүлээгдэж» биелэлт
 *    хиймлээр доошилдог байв. Одоо өмнөх сарын эцэс → энэ сарын эцсийн хооронд
 *    өнөөдрийн ЛОКАЛ өдрөөр (`getDate`, `dayKey`-тэй ижил) шугаман завсарлана.
 * ⚠️ Өмнөх сарын цэг байхгүй = хуваарь ЭНЭ сард эхэлсэн → эхлэл 0.
 * ⚠️ Энэ сарын цэг байхгүй бол (муж өнгөрсөн) хамгийн сүүлийн өнгөрсөн цэг;
 *    бүх цэг ирээдүйд бол багц Map-д ОРОХГҮЙ (төлөвлөгөөгүй ≠ 0).
 */
export function housingPlanOf(
  byBagts: Map<string, Array<{ label: string; pct: number }>>,
  now: Date,
): Map<string, number> {
  const y = now.getFullYear();
  const m = now.getMonth();
  const cur = `${y}-${pad2(m + 1)}`;
  const pd = new Date(y, m, 0);
  const prev = `${pd.getFullYear()}-${pad2(pd.getMonth() + 1)}`;
  const frac = now.getDate() / new Date(y, m + 1, 0).getDate();
  const out = new Map<string, number>();
  for (const [k, pts] of byBagts) {
    let p1: number | null = null;
    let p0: number | null = null;
    let past: { label: string; pct: number } | null = null;
    for (const pt of pts) {
      if (pt.label === cur) p1 = pt.pct;
      else if (pt.label === prev) p0 = pt.pct;
      if (pt.label < cur && (!past || pt.label > past.label)) past = pt;
    }
    if (p1 != null) out.set(k, (p0 ?? 0) + (p1 - (p0 ?? 0)) * frac);
    else if (past) out.set(k, past.pct);
  }
  return out;
}

/**
 * @param fresh `true` = КЭШГҮЙ (зөвхөн хүснэгт рүү БИЧИХ зам, `syncNegtgel`).
 *   ⚠️ 2026-09-25: `loadFillPkgProgress` (TTL-гүй) ба `loadBlockProgress`
 *   (memo) нь өөр хэрэглэгчийн бөглөлтөөр хүчингүй болдоггүй — хуучин табын
 *   тоо шинэ утгыг дарж бичдэг байв. Дэлгэц нь кэштэйгээ хэвээр (`false`).
 */
export async function loadNegSources(fresh = false): Promise<NegSources> {
  const [{ loadLandPct }, L, P, { PKGS }] = await Promise.all([
    import('@/lib/negtgel'),
    import('@/lib/live'),
    import('@/lib/planProgress'),
    import('@/modules/sheet/bagts.pkg'),
  ]);
  /* ⚠️ Аль нэг эх уначихвал БҮХЭЛДЭЭ унана (catch-гүй) — хагас эхээр бодож
     хүснэгт рүү бичвэл унасан эхийн мөрүүд хуучин утгаараа үлдэж, шинэ
     тоонуудтай холилдсон «нийт» гарна. Дуудагч хадгалсан утгаа харуулна.
     ⚠️ Муруй нь дэлгэцэнд КЭШТЭЙ (`loadPlanCurveCached`, 2026-09-25) —
     дашбоард ба удирдлагын тайлан нэг хуулбарыг хуваалцана. */
  const [cf, land, housing, curve] = await Promise.all([
    loadCfWork(),
    loadLandPct(),
    fresh ? L.loadFillPkgProgressFresh() : L.loadFillPkgProgress(),
    fresh ? P.loadPlanCurve() : P.loadPlanCurveCached(),
  ]);
  /* ⚠️ Барилгын (давхартай) хуудас = блоктой багц; 5.x · 6.x · 10 нь блокгүй */
  const housingPkgs = new Set(PKGS.filter((p) => p.floors != null).map((p) => bagtsKey(p.group)));
  return { cf, land, housing, housingPlan: housingPlanOf(curve.byBagts, new Date()), housingPkgs };
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
        if (act != null || plan != null) {
          return { act, planGu: plan, how: tr('Багцын гүйцэтгэл — блокуудын биет хувь; төлөвлөгөө Хуваариас') };
        }
        /* ⚠️ 2026-09-25: БЛОКТОЙ багц боловч хэмжилт/хуваарь нь ирээгүй (хуудас
           унасан, хараахан бөглөөгүй) бол Cashflow-ийн `guitsetgel_huvi` руу
           УНАХГҮЙ — өөр хэмжүүр тул биет гүйцэтгэлийг чимээгүй солино.
           Хадгалсан утга үлдэнэ (бичихгүй). */
        if (src.housingPkgs?.has(k)) return none;
        /* ⚠️ Жинхэнэ БЛОКГҮЙ мөр («Суурийн холболтын ажил · БАГЦ 1-4») л
           доорх Cashflow замаар үргэлжилнэ */
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
const rollWarned = new Set<string>();
export function rollKids(kids: number[], w: Array<number | null>): number[] {
  const sum = kids.reduce((a, k) => a + (w[k] ?? 0), 0);
  if (sum <= 1.005) return kids;
  let acc = 0;
  for (let j = 0; j < kids.length; j += 1) {
    acc += w[kids[j]] ?? 0;
    if (Math.abs(acc - 1) <= 0.005) {
      /* ⚠️ 2026-09-25: таамаг (угтвар нийлбэр = 1) нь ард талын хүүхдийг ХАСДАГ —
         5.2.4-ийн хувьд зөв, гэхдээ эх хүснэгтэд шинэ бүлэг орж ирвэл чимээгүй
         хасагдах эрсдэлтэй тул ил мэдэгдэнэ (бүлэг бүрд нэг удаа). */
      const drop = kids.slice(j + 1);
      const sig = kids.join(',');
      if (drop.length && !rollWarned.has(sig)) {
        rollWarned.add(sig);
        console.warn('[negtgel] жингийн нийлбэр > 1 — эцгийн нийлбэрээс хасагдсан хүүхэд (мөрийн индекс)', drop, sum);
      }
      return kids.slice(0, j + 1);
    }
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

  /* БИЕЛЭЛТ — гүйцэтгэл ÷ төлөвлөгөө; төлөвлөгөө 0 бол 0 (эх хүснэгтийн дүрэм).
     ⚠️ 2026-09-25: гүйцэтгэл ЭСВЭЛ төлөвлөгөө `null` бол `null` (0 БИШ) —
     `negDiff` null-ыг бичихгүй тул хадгалсан утга үлдэнэ. Урьд нь 0 гэж
     бичигдэж «мэдээлэлгүй» нь «биелэлт 0%» болдог байв. */
  for (const o of out) {
    const perf = (plan: number | null) => (plan == null || o.act == null ? null : plan ? r6(o.act / plan) : 0);
    o.perfG = perf(o.planG);
    o.perfGch = perf(o.planGch);
    o.perfGu = perf(o.planGu);
  }
  return out;
}

/**
 * Төслийн нийт гүйцэтгэл (0–1) = Σ 1-р түвшний жин × гүйцэтгэл.
 * ⚠️ 2026-09-25: жинтэй (p > 0) 1-р түвшний мөрийн гүйцэтгэл `null` бол нийт
 *    нь `null` — урьд нь 0 гэж тоологдож нийт хиймлээр доошилдог байв (null ≠ 0).
 */
export const projectTotal = (rows: Array<{ depth: number; p: number | null; act: number | null }>): number | null => {
  let w = 0;
  let s = 0;
  for (const r of rows) {
    if (r.depth !== 1 || r.p == null) continue;
    if (r.act == null) {
      if (r.p > 0) return null;
      continue;
    }
    w += r.p;
    s += r.p * r.act;
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

/** Нэг мөрийн нэг талбар нэг дор ИНГЭЭС их (0–1 нэгжээр = 20 нэгж) өөрчлөгдвөл бичихгүй */
const ROW_GAP = 0.2;
/** Төслийн нийт нэг дор ИНГЭЭС их өөрчлөгдвөл ЮУ Ч бичихгүй */
const TOTAL_GAP = 0.2;
/**
 * ⚠️ Хамгаалалт ЗӨВХӨН гүйцэтгэл ба төлөвлөгөөнд — биелэлт (`perf*`) нь
 * харьцаа тул жижиг төлөвлөгөөтэй мөрд 0.01 → 0.02 л гэхэд 2 дахин үсэрнэ.
 */
const GUARD: (keyof NegVals)[] = ['act', 'planG', 'planGch', 'planGu'];

export type NegGuardRow = { oid: number; code: string; name: string; field: keyof NegVals; from: number; to: number };

/** Бичих төлөвлөгөө — цэвэр функц (тест: `negtgel.check.mjs`) */
export type NegSyncPlan = {
  /** Бичих засварууд — хамгаалалтад ОРООГҮЙ мөрүүд */
  ups: Record<string, unknown>[];
  /** Нэг дор хэт их өөрчлөгдсөн тул АЛГАССАН мөрүүд */
  blocked: NegGuardRow[];
  /** Төслийн нийтийн өөрчлөлт (хоёулаа мэдэгдэж байвал) */
  total: { from: number; to: number } | null;
  /** Нийт нь `TOTAL_GAP`-аас их өөрчлөгдсөн → ЮУ Ч бичихгүй */
  totalBlocked: boolean;
};

/**
 * ХАМГААЛАЛТТАЙ ЗАСВАРУУД.
 *
 * ⚠️ Мөр бүрийн хамгаалалт (2026-09-25): урьд нь ЗӨВХӨН төслийн нийтийг
 *    шалгадаг тул жин багатай мөр (0.01) 0 → 100% болж эвдэрсэн ч нийт нь
 *    0.01-ээр л хөдлөөд хамгаалалтыг давдаг байв.
 * ⚠️ Алгассан мөрийн ӨВӨГ ДЭЭДЭС ч бичигдэхгүй — тэдний утга алгассан мөрийн
 *    ШИНЭ утгаар бодогдсон тул хүснэгт дотроо зөрчилдөнө.
 * ⚠️ `force` — super хэрэглэгч «Системийн утгаар шинэчлэх»-ийг дарсан (нэг
 *    удаагийн баталгаа, жишээ нь Excel-ээс тарьсан хүснэгтийн анхны синк).
 */
export function planNegSync(stored: NegRaw[], calc: NegCalcRow[], force = false): NegSyncPlan {
  const a = projectTotal(stored);
  const b = projectTotal(calc);
  const total = a != null && b != null ? { from: a, to: b } : null;
  const all = negDiff(stored, calc);
  if (force) return { ups: all, blocked: [], total, totalBlocked: false };
  const totalBlocked = total != null && Math.abs(total.to - total.from) > TOTAL_GAP;
  const blocked: NegGuardRow[] = [];
  const bad = new Set<number>();
  stored.forEach((sr, i) => {
    const c = calc[i];
    for (const k of GUARD) {
      const ov = sr[k];
      const nv = c[k];
      /* ⚠️ Хоосон нүдийг анх бөглөх нь «үсрэлт» БИШ */
      if (ov == null || nv == null || Math.abs(nv - ov) <= ROW_GAP) continue;
      blocked.push({ oid: sr.oid, code: sr.code, name: sr.name, field: k, from: ov, to: nv });
      bad.add(i);
    }
  });
  if (bad.size) {
    const { parent } = treeOf(stored.map((r) => r.depth));
    for (const i of [...bad]) for (let k = parent[i]; k >= 0; k = parent[k]) bad.add(k);
  }
  const skip = new Set([...bad].map((i) => stored[i].oid));
  const ups = totalBlocked ? [] : all.filter((u) => !skip.has(u[TUSUL_NEGTGEL.oid] as number));
  return { ups, blocked, total, totalBlocked };
}

/** Синкийн төлөв — «Нэгтгэл гүйцэтгэл» таб мэдэгдэл харуулна */
export type NegSyncState =
  /** Бичих эрхгүй (super биш / нэвтрээгүй) — зөвхөн уншина */
  | { kind: 'off' }
  | { kind: 'ok'; n: number; at: number }
  /** Хамгаалалт бичилтийг (бүгдийг эсвэл заримыг) зогсоосон */
  | { kind: 'guard'; n: number; at: number; blocked: NegGuardRow[]; total: { from: number; to: number } | null; totalBlocked: boolean }
  | { kind: 'error'; at: number; reason: string };

/**
 * БИЧИХ ЭРХ — ЗӨВХӨН кодын хатуу super (`roleForUser`).
 * ⚠️ 2026-09-25: урьд нь нэвтэрсэн БҮХ харагч (дашбоард нээсэн хүн бүр)
 *    чимээгүй бичдэг байв. Хэрэглэгч тодорхойгүй бол БИЧИХГҮЙ (fail-closed) —
 *    `requireCap`-аас ялгаатай нь Node/нэвтрэлтгүй орчинд ч хаалттай.
 * ⚠️ `tableWrite.applyAll`-ийн `cap` сонголт АШИГЛАГДААГҮЙ: `CapKey`-д
 *    «super» гэсэн эрх байхгүй — хатуу жагсаалт л энэ шалгуурыг хэлнэ.
 */
export const canSyncNegtgel = (user: string | null = currentUser()): boolean =>
  roleForUser(user) === 'super';

/** ⚠️ Нэг хөтөчөөс 10 минутад нэгээс олон удаа бичихгүй */
const SYNC_GAP = 10 * 60_000;
let lastSync = 0;
let lastState: NegSyncState | null = null;
let syncing: Promise<NegSyncState> | null = null;

/** Тестэд орлуулах оролт/гаралт — анхдагч нь амьд үйлчилгээ */
export type NegSyncIo = {
  user?: () => string | null;
  /** ШИНЭ уншилт: хүснэгт + кэшгүй эх */
  load?: () => Promise<{ stored: NegRaw[]; src: NegSources }>;
  /** Бичсэн мөрийн тоо */
  write?: (ups: Record<string, unknown>[]) => Promise<number>;
};

const liveLoad = async () => {
  const [stored, src] = await Promise.all([loadNegRaw(), loadNegSources(true)]);
  return { stored, src };
};
const liveWrite = async (ups: Record<string, unknown>[]): Promise<number> => {
  const { tokenParam } = await import('@/lib/authToken');
  if (!tokenParam().token) throw new Error(tr('Нэвтрэлтийн токен алга — бичсэнгүй'));
  const { applyAll } = await import('@/lib/tableWrite');
  return (await applyAll(TUSUL_NEGTGEL.url, TUSUL_NEGTGEL.oid, { updates: ups })).n;
};

/** Сүүлийн синкийн төлөв (энэ хөтөчид) */
export const negSyncState = (): NegSyncState | null => lastState;

/**
 * БОДСОН УТГЫГ ХҮСНЭГТ РҮҮ БИЧНЭ — хүн оролцохгүй.
 *
 * ⚠️ ХЭЗЭЭ ажилладаг вэ: ТАЙМЕР БИШ — `loadNegtgelFull`-ийн кэш хоосон үед
 *    (хуудас ачаалах, 5 минутын кэш дуусах, эх хүснэгтийн засвар) дуудагдана.
 *    Модуль-түвшний `lastSync` нь нэг хөтөчөөс 10 минутад нэгээс олон удаа
 *    бичихгүй байхыг баталгаажуулна (`force` үүнийг давна).
 * ⚠️ ЭРХ: ЗӨВХӨН super (`canSyncNegtgel`); бусад нь зөвхөн уншина (`off`).
 * ⚠️ ШИНЭ ӨГӨГДЛӨӨР: дэлгэцийн бодолтыг (кэштэй эх) БИЧИХГҮЙ — хүснэгтийн
 *    одоогийн мөрүүд ба кэшгүй эх (`loadNegSources(true)`)-ийг бичихийн
 *    ӨМНӨХ агшинд дахин уншиж, мөр бүрээр зөвхөн ӨӨРЧЛӨГДСӨН талбарыг бичнэ.
 * ⚠️ ХАМГААЛАЛТ: `planNegSync` — мөр бүр ба нийтэд ±0.2. Зогсоосон бол
 *    `guard` төлөв буцаж, таб нь мэдэгдэл + баталгаажуулах товч харуулна.
 */
export function syncNegtgel(opts: { force?: boolean } = {}, io: NegSyncIo = {}): Promise<NegSyncState> {
  if (!canSyncNegtgel((io.user ?? currentUser)())) return Promise.resolve({ kind: 'off' });
  if (syncing) return syncing;
  if (!opts.force && lastState && Date.now() - lastSync < SYNC_GAP) return Promise.resolve(lastState);
  lastSync = Date.now();
  const mine = (async (): Promise<NegSyncState> => {
    let st: NegSyncState;
    try {
      const { stored, src } = await (io.load ?? liveLoad)();
      const calc = computeNegAuto(stored, src);
      const plan = planNegSync(stored, calc, !!opts.force);
      const n = plan.ups.length ? await (io.write ?? liveWrite)(plan.ups) : 0;
      st = plan.blocked.length || plan.totalBlocked
        ? { kind: 'guard', n, at: Date.now(), blocked: plan.blocked, total: plan.total, totalBlocked: plan.totalBlocked }
        : { kind: 'ok', n, at: Date.now() };
      if (st.kind === 'guard') console.warn('[negtgel] хамгаалалт — зарим/бүх мөр бичигдсэнгүй', plan);
    } catch (e) {
      console.warn('[negtgel] автомат шинэчлэл бичигдсэнгүй', e);
      st = { kind: 'error', at: Date.now(), reason: e instanceof Error ? e.message : String(e) };
    }
    lastState = st;
    return st;
  })();
  syncing = mine;
  void mine.finally(() => { if (syncing === mine) syncing = null; });
  return mine;
}

/** ⚠️ Зөвхөн тест — модуль-түвшний төлөвийг цэвэрлэнэ */
export function _resetNegSync(): void {
  lastSync = 0;
  lastState = null;
  syncing = null;
}
