/**
 * ГҮЙЦЭТГЭЛИЙН ХЯНАЛТ — схем ба ArcGIS REST давхарга.
 */

import { invalidate } from './dataBus';
import { arcgisPost, ArcGISError } from '@/lib/query';
import { t as tr } from '@/lib/i18nCore';
import { GUITS } from '@/lib/services';
import { collidesBelow, idNum, renumberPlan, type IdRow } from './idUnique';

export const HYANALT = {
  url: `${GUITS}/183`,
  oid: 'objectid',
} as const;

/** Хяналтын үйлчилгээний талбарууд — амьд үйлчилгээтэй ЯГ тохирно */
export const F = {
  id: 'бүртгэлийн_дугаар',
  /**
   * ХОЛБООС ЭХ АГУУЛГА РУУ — утга нь 2026-09-04-нд ӨӨРЧЛӨГДСӨН.
   *
   * · ШИНЭ мөрд: `Selbe_Guitsetgel_Draft` хүснэгтийн ИЛГЭЭЛТИЙН мөрийн
   *   OBJECTID (`sub|<pkgKey>`). Гүйцэтгэл нь ерөнхий менежер баталтал
   *   архивт БАЙХГҮЙ тул архивын дугаар өгөх боломжгүй.
   * · ХУУЧИН мөрд: `Bagts_*` архивт нэмэгдсэн ЭХНИЙ мөрийн OBJECTID.
   */
  sheetOid: 'эх_мөрийн_дугаар',
  ergelt: 'хэддэх_удаа',
  bagts: 'багц',
  ajil: 'ажлын_нэр',

  company: 'гүйцэтгэгч_компани',
  companySent: 'компани_илгээсэн_огноо',

  engineer: 'талбайн_инженер',
  engineerDecision: 'инженерийн_шийдвэр',
  engineerReason: 'инженер_буцаасан_шалтгаан',
  engineerReturned: 'инженер_буцаасан_огноо',
  engineerSent: 'инженер_илгээсэн_огноо',

  /** БАГЦЫН менежер — гурав дахь шат */
  manager: 'менежер',
  managerDecision: 'менежерийн_шийдвэр',
  managerReason: 'менежер_буцаасан_шалтгаан',
  managerReturned: 'менежер_буцаасан_огноо',
  managerSent: 'менежер_илгээсэн_огноо',

  /**
   * ТӨЛӨВЛӨЛТИЙН ИНЖЕНЕР — дөрөв дэх шат (багцын ахлах инженерийн ДАРАА,
   * төлөвлөлтийн ахлах инженерийн ӨМНӨ).
   */
  planner: 'tolovloltiin_injener',
  plannerDecision: 'tolovloltiin_injeneriin_shiidver',
  plannerReason: 'tolovloltiin_injener_butsaasan_shaltgaan',
  plannerReturned: 'tolovloltiin_injener_butsaasan_ognoo',
  plannerSent: 'tolovloltiin_injener_ilgeesen_ognoo',

  /**
   * ЕРӨНХИЙ МЕНЕЖЕР — дөрөв дэх, ЭЦСИЙН шат.
   */
  director: 'ерөнхий_менежер',
  directorDecision: 'ерөнхий_менежерийн_шийдвэр',
  directorReason: 'ерөнхий_менежер_буцаасан_шалтгаан',
  directorReturned: 'ерөнхий_менежер_буцаасан_огноо',
  directorSent: 'ерөнхий_менежер_илгээсэн_огноо',

  /**
   * ХЭЛТСИЙН ДАРГА — тав дахь шат, ГАЗРЫН ДАРГА — зургаа дахь, ЭЦСИЙН шат
   * (2026-09-23, хэрэглэгч: «Хэлтсийн дарга · Газрын дарга 2 шат нэмнэ»,
   * ерөнхий менежерийн ДАРАА). AGOL-д 10 талбар нэмэгдсэн (`UPPER_FIELDS`).
   */
  head: 'хэлтсийн_дарга',
  headDecision: 'хэлтсийн_даргын_шийдвэр',
  headReason: 'хэлтсийн_дарга_буцаасан_шалтгаан',
  headReturned: 'хэлтсийн_дарга_буцаасан_огноо',
  headSent: 'хэлтсийн_дарга_илгээсэн_огноо',
  chief: 'газрын_дарга',
  chiefDecision: 'газрын_даргын_шийдвэр',
  chiefReason: 'газрын_дарга_буцаасан_шалтгаан',
  chiefReturned: 'газрын_дарга_буцаасан_огноо',
  chiefSent: 'газрын_дарга_илгээсэн_огноо',

  /**
   * ХЯНАГЧИЙН ЗӨВШӨӨРСӨН НҮДНҮҮД — `"мөр:блок"` түлхүүрийн JSON массив.
   */
  okCells: 'zovshoorson_nud',

  /**
   * ШИЙДВЭРИЙН ТҮҮХ (ЛОГ) — `{stage, who, at, act, reason}` үйл явдлын JSON массив
   * (`hyanaltHistory.ts`).
   */
  history: 'shiidveriin_tuuh',

  status: 'төлөв',
} as const;

export const STATUS = {
  engineerReview: 'Инженер хянаж байна',
  engineerReturned: 'Инженер буцаасан',
  managerReview: 'Менежер хянаж байна',
  managerReturned: 'Менежер буцаасан',
  plannerReview: 'Төлөвлөлтийн инженер хянаж байна',
  plannerReturned: 'Төлөвлөлтийн инженер буцаасан',
  directorReview: 'Ерөнхий менежер хянаж байна',
  directorReturned: 'Ерөнхий менежер буцаасан',
  headReview: 'Хэлтсийн дарга хянаж байна',
  headReturned: 'Хэлтсийн дарга буцаасан',
  chiefReview: 'Газрын дарга хянаж байна',
  chiefReturned: 'Газрын дарга буцаасан',
  /** ЭЦСИЙН төлөв — долоон шат бүгд өнгөрсний ДАРАА л энд хүрнэ. */
  transferred: 'Шилжүүлсэн',
} as const;
export type Status = (typeof STATUS)[keyof typeof STATUS];

export const DECISION = { approve: 'Зөвшөөрсөн', return: 'Буцаасан' } as const;
export type Decision = (typeof DECISION)[keyof typeof DECISION];

/**
 * Шат — ДОЛОО (2026-10-23; 2026-09-23-нд зургаа). Буцаах нь ЯВСАН ЗАМААРАА, нэг алхмаар:
 *   гүйцэтгэгч → хяналтын инженер → багцын ахлах инженер → төлөвлөлтийн инженер
 *   → төлөвлөлтийн ахлах инженер → хэлтсийн дарга → газрын дарга
 */
export type Stage = 'company' | 'engineer' | 'manager' | 'planner' | 'director' | 'head' | 'chief';

/** Шатны ДАРААЛАЛ — нэг эх сурвалж. Буцах чиглэл нь энэ жагсаалтын урвуу.
 */
export const STAGE_ORDER: Stage[] = ['company', 'engineer', 'manager', 'planner', 'director', 'head', 'chief'];

/** ХЯНАХ шатууд (компаниас бусад) — шийдвэрийн талбар · төлөв нь ЭНЭ хүснэгтээс. */
export const REVIEW_STAGES = ['engineer', 'manager', 'planner', 'director', 'head', 'chief'] as const;
export type ReviewStage = (typeof REVIEW_STAGES)[number];

/**
 * ШАТ БҮРИЙН ТАВАН ТАЛБАР — нэр · шийдвэр · шалтгаан · буцаасан огноо ·
 * илгээсэн огноо. `hyanaltStore.apply/recheck` шат бүрд if/else бичихийн
 * оронд ЭНДЭЭС уншина: шинэ шат нэмэхэд зөвхөн энэ хүснэгт ба `OWNER`.
 */
export const SF: Record<ReviewStage, { who: string; decision: string; reason: string; returned: string; sent: string }> = {
  engineer: { who: F.engineer, decision: F.engineerDecision, reason: F.engineerReason, returned: F.engineerReturned, sent: F.engineerSent },
  manager: { who: F.manager, decision: F.managerDecision, reason: F.managerReason, returned: F.managerReturned, sent: F.managerSent },
  planner: { who: F.planner, decision: F.plannerDecision, reason: F.plannerReason, returned: F.plannerReturned, sent: F.plannerSent },
  director: { who: F.director, decision: F.directorDecision, reason: F.directorReason, returned: F.directorReturned, sent: F.directorSent },
  head: { who: F.head, decision: F.headDecision, reason: F.headReason, returned: F.headReturned, sent: F.headSent },
  chief: { who: F.chief, decision: F.chiefDecision, reason: F.chiefReason, returned: F.chiefReturned, sent: F.chiefSent },
};

/** Тухайн шат ХЯНАЖ БАЙГАА төлөв */
export const REVIEW_STATUS: Record<ReviewStage, Status> = {
  engineer: STATUS.engineerReview,
  manager: STATUS.managerReview,
  planner: STATUS.plannerReview,
  director: STATUS.directorReview,
  head: STATUS.headReview,
  chief: STATUS.chiefReview,
};

/** Тухайн шат БУЦААСАН төлөв (нэг алхам доош очно — `OWNER`) */
export const RETURNED_STATUS: Record<ReviewStage, Status> = {
  engineer: STATUS.engineerReturned,
  manager: STATUS.managerReturned,
  planner: STATUS.plannerReturned,
  director: STATUS.directorReturned,
  head: STATUS.headReturned,
  chief: STATUS.chiefReturned,
};

/** Дараагийн хянах шат — сүүлийнхэд `null` («Шилжүүлсэн» руу) */
export const nextReview = (s: ReviewStage): ReviewStage | null => {
  const i = REVIEW_STAGES.indexOf(s);
  return i >= 0 && i + 1 < REVIEW_STAGES.length ? REVIEW_STAGES[i + 1] : null;
};

/** Өмнөх хянах шат — эхнийхэд `null` (компани) */
export const prevReview = (s: ReviewStage): ReviewStage | null => {
  const i = REVIEW_STAGES.indexOf(s);
  return i > 0 ? REVIEW_STAGES[i - 1] : null;
};

/**
 * Тухайн төлөвт ажил ХЭНИЙ гар дээр байна вэ.
 */
export const OWNER: Record<Status, Stage> = {
  [STATUS.engineerReview]: 'engineer',
  [STATUS.engineerReturned]: 'company',
  [STATUS.managerReview]: 'manager',
  [STATUS.managerReturned]: 'engineer',
  [STATUS.plannerReview]: 'planner',
  [STATUS.plannerReturned]: 'manager',
  [STATUS.directorReview]: 'director',
  [STATUS.directorReturned]: 'planner',
  [STATUS.headReview]: 'head',
  [STATUS.headReturned]: 'director',
  [STATUS.chiefReview]: 'chief',
  [STATUS.chiefReturned]: 'head',
  [STATUS.transferred]: 'chief',
};

export type Row = {
  __oid: number;
  [F.id]: string;
  [F.sheetOid]: number;
  [F.ergelt]: number;
  [F.bagts]: string;
  [F.ajil]: string;
  [F.company]: string;
  [F.companySent]: string | null;
  [F.engineer]: string;
  [F.engineerDecision]: Decision | '';
  [F.engineerReason]: string;
  [F.engineerReturned]: string | null;
  [F.engineerSent]: string | null;
  [F.manager]: string;
  [F.managerDecision]: Decision | '';
  [F.managerReason]: string;
  [F.managerReturned]: string | null;
  [F.managerSent]: string | null;
  [F.planner]: string;
  [F.plannerDecision]: Decision | '';
  [F.plannerReason]: string;
  [F.plannerReturned]: string | null;
  [F.plannerSent]: string | null;
  [F.director]: string;
  [F.directorDecision]: Decision | '';
  [F.directorReason]: string;
  [F.directorReturned]: string | null;
  [F.directorSent]: string | null;
  [F.head]: string;
  [F.headDecision]: Decision | '';
  [F.headReason]: string;
  [F.headReturned]: string | null;
  [F.headSent]: string | null;
  [F.chief]: string;
  [F.chiefDecision]: Decision | '';
  [F.chiefReason]: string;
  [F.chiefReturned]: string | null;
  [F.chiefSent]: string | null;
  [F.okCells]: string;
  [F.history]: string;
  [F.status]: Status;
};

/**
 * ЕРӨНХИЙ МЕНЕЖЕРИЙН ТАЛБАРУУД — үйлчилгээнд байх ЁСТОЙ.
 */
export const DIRECTOR_FIELDS = [
  F.planner, F.plannerDecision, F.plannerReason, F.plannerReturned, F.plannerSent,
  F.director, F.directorDecision, F.directorReason, F.directorReturned, F.directorSent,
  F.head, F.headDecision, F.headReason, F.headReturned, F.headSent,
  F.chief, F.chiefDecision, F.chiefReason, F.chiefReturned, F.chiefSent,
] as const;

let missingCache: string[] | null = null;

/**
 * Үйлчилгээнд дутуу байгаа 4-р шатны талбарууд.
 *   · `[]`   — бүгд бэлэн;
 *   · `[…]`  — эдгээр нь дутуу;
 *   · `null` — ШАЛГАЖ ЧАДСАНГҮЙ (сүлжээ, 429, токен).
 */
/**
 * ҮЙЛЧИЛГЭЭНИЙ ТАЛБАРЫН НЭРС — `missingDirectorFields` ба `hasOkCellsField`
 * хоёулаа ЭНЭ нэг уншилтаас (2026-09-23, аудитын #16). Амжилттай хариуг л
 * кэшлэнэ; унавал `null` («мэдэхгүй»), кэшлэхгүй.
 */
let fieldsCache: Set<string> | null = null;
let calculateSupported = false;
let lensCache: Map<string, number> | null = null;
async function serviceFieldNames(): Promise<Set<string> | null> {
  if (fieldsCache) return fieldsCache;
  try {
    const j = await arcgisPost<{ supportsCalculate?: boolean; fields?: { name: string; type?: string; length?: number }[] }>(HYANALT.url, {});
    if (!Array.isArray(j.fields)) {
      throw new HyanaltError(tr('Талбарын жагсаалт ирсэнгүй'));
    }
    lensCache = new Map(j.fields
      .filter((x) => (x.type == null || x.type === 'esriFieldTypeString') && typeof x.length === 'number' && x.length > 0)
      .map((x): [string, number] => [x.name, x.length as number]));
    fieldsCache = new Set(j.fields.map((x) => x.name));
    calculateSupported = j.supportsCalculate === true;
    return fieldsCache;
  } catch {
    return null;
  }
}

/**
 * `Zovshoorson_nud` (`F.okCells`) талбар үйлчилгээнд БАЙНА УУ (2026-09-23,
 * аудитын #16).
 *   · `true`  — байна, бичиж болно;
 *   · `false` — АЛГА: `applyEdits` танихгүй талбарыг чимээгүй алгасах (эсвэл
 *               бүх мөрийг унагах) тул `hyanaltStore` тэр талбарыг БИЧИХГҮЙ,
 *               ил анхааруулна;
 *   · `null`  — шалгаж чадсангүй (сүлжээ) — `missingDirectorFields`-ийн
 *               гурав дахь төлөвтэй ижил утга.
 */
export async function hasOkCellsField(): Promise<boolean | null> {
  const have = await serviceFieldNames();
  return have ? have.has(F.okCells) : null;
}

/**
 * `Shiidveriin_tuuh` (`F.history`) талбар үйлчилгээнд БАЙНА УУ (2026-10-01).
 *   · `true`  — байна: `apply`/`recheck` үйл явдал НЭМНЭ;
 *   · `false` — алга: урьдын зан (лог бичигдэхгүй, анхааруулгагүй — нэмэлт боломж);
 *   · `null`  — шалгаж чадсангүй: БИЧИХГҮЙ. `okCells`-ээс ялгаатай: лог нь
 *               шийдвэрийн НЭМЭЛТ мэдээлэл тул танигдахгүй талбар руу бичиж
 *               шийдвэрийг өөрийг нь эрсдэлд оруулахгүй.
 */
/**
 * МӨР ТАЛБАРЫН ДЭЭД УРТ (тэмдэгт) — 2026-10-12 (R1).
 *   · тоо  — үйлчилгээний `length`;
 *   · `null` — мэдэхгүй (уншилт унасан, талбар алга, урт заагаагүй) — дуудагч өөрийн нөөц хязгаарыг хэрэглэнэ.
 */
export async function fieldMaxLen(name: string): Promise<number | null> {
  const have = await serviceFieldNames();
  if (!have || !lensCache) return null;
  return lensCache.get(name) ?? null;
}

export async function hasHistoryField(): Promise<boolean | null> {
  const have = await serviceFieldNames();
  return have ? have.has(F.history) : null;
}

export async function missingDirectorFields(): Promise<string[] | null> {
  if (missingCache) return missingCache;
  try {
    const have = await serviceFieldNames();
    if (!have) throw new HyanaltError(tr('Талбарын жагсаалт ирсэнгүй'));
    missingCache = DIRECTOR_FIELDS.filter((x) => !have.has(x));
    return missingCache;
  } catch {
    return null;
  }
}

/* ══════════════ ArcGIS REST ══════════════ */

export type Attrs = Record<string, unknown>;

/** Алдааг үргэлж БҮТЭН мессежтэйгээр шиднэ — чимээгүй амжилт хэзээ ч болохгүй */
export class HyanaltError extends Error {
  readonly code?: number;
  readonly status?: number;
  /* `cause` — ES2022 `Error.cause` (дахин зарлахгүй: `useDefineForClassFields` түүнийг дарна) */
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'HyanaltError';
    if (cause !== undefined) {
      this.cause = cause;
      const c = cause as { code?: unknown; status?: unknown };
      if (typeof c?.code === 'number') this.code = c.code;
      if (typeof c?.status === 'number') this.status = c.status;
    }
  }
}

async function post(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  try {
    return await arcgisPost(HYANALT.url + path, body);
  } catch (e) {
    if (e instanceof ArcGISError) {
      const d = e.details?.length ? ` · ${e.details.join('; ')}` : '';
      throw new HyanaltError(e.message + d, e);
    }
    throw e;
  }
}

/** Бүх мөрийг татна — 2000-гийн хуудаслалтыг давна */
export async function queryAll(): Promise<Attrs[]> {
  const out: Attrs[] = [];
  let offset = 0;
  for (;;) {
    const j = (await post('/query', {
      where: '1=1',
      outFields: '*',
      returnGeometry: 'false',
      orderByFields: `${HYANALT.oid} ASC`,
      resultOffset: String(offset),
      resultRecordCount: '2000',
    })) as { features?: { attributes: Attrs }[]; exceededTransferLimit?: boolean };

    const got = j.features ?? [];
    out.push(...got.map((f) => f.attributes));
    if (!j.exceededTransferLimit || got.length === 0) break;
    offset += got.length;
  }
  if (!dupSweepDone && typeof window !== 'undefined') {
    dupSweepDone = true;
    if (dupIdPlan(idRowsOf(out)).size) void withIdLock(() => sweepDupIds());
  }
  return out;
}

/**
 * ДАВХАР ДУГААРЫН ЦЭВЭРЛЭГЭЭНИЙ ТӨЛӨВЛӨГӨӨ (2026-10-09, R6) — цэвэр, сүлжээгүй.
 * Ижил `Бүртгэлийн_дугаар`-тай мөрүүдээс ХАМГИЙН БАГА OBJECTID-тай нь дугаараа хадгална
 * (`collidesBelow`-ийн тэнцүүлэгчтэй ижил дүрэм), бусад нь OBJECTID-ийн дарааллаар max+1-ээс.
 */
export function dupIdPlan(rows: readonly IdRow[]): Map<number, number> {
  const owner = new Map<number, number>();
  for (const r of rows) {
    if (r.id == null) continue;
    const m = owner.get(r.id);
    if (m == null || r.oid < m) owner.set(r.id, r.oid);
  }
  const losers = rows.filter((r) => r.id != null && owner.get(r.id) !== r.oid).sort((a, b) => a.oid - b.oid);
  const out = new Map<number, number>();
  if (!losers.length) return out;
  let next = 1 + rows.reduce((m, r) => Math.max(m, r.id ?? 0), 0);
  for (const r of losers) { out.set(r.oid, next); next += 1; }
  return out;
}

let dupSweepDone = false;
const idRowsOf = (all: readonly Attrs[]): IdRow[] => all.map((a) => ({ oid: Number(a[HYANALT.oid]), id: idNum(a[F.id]) }));

/**
 * ДУГААР ЗАСАХ ҮЙЛДЛҮҮДИЙН ДАРААЛАЛ (2026-10-09) — `sweepDupIds` ба `ensureUniqueId` ХЭЗЭЭ Ч зэрэг явахгүй.
 */
let idChain: Promise<unknown> = Promise.resolve();
function withIdLock<T>(fn: () => Promise<T>): Promise<T> {
  const p = idChain.then(fn, fn);
  idChain = p.catch(() => undefined);
  return p;
}

async function sweepDupIds(): Promise<void> {
  try {
    const plan = dupIdPlan(idRowsOf(await queryAll()));
    if (!plan.size) return;
    await updateRows([...plan].map(([oid, n]) => ({ [HYANALT.oid]: oid, [F.id]: `G-${String(n).padStart(6, '0')}` })));
  } catch (e) {
    console.warn('[selbe] давхар бүртгэлийн дугаарыг цэвэрлэж чадсангүй:', e);
  }
}

/**
 * ХЯМД ГАРЫН ҮСЭГ — `oid:төлөв` жагсаалт (2026-10-04). Хяналтын дараалал хуудас
 * нээгдсэнээс хойш ХЭЗЭЭ Ч шинэчлэгддэггүй байв; `hyanaltStore`-ийн 60 с тутмын
 * шалгалт эхлээд үүгээр (2 талбар) харьцуулж, зөрвөл л бүтэн `queryAll` татна.
 */
export async function queryStatusSig(): Promise<string> {
  const parts: string[] = [];
  let offset = 0;
  for (;;) {
    const j = (await post('/query', {
      where: '1=1',
      outFields: `${HYANALT.oid},${F.status}`,
      returnGeometry: 'false',
      orderByFields: `${HYANALT.oid} ASC`,
      resultOffset: String(offset),
      resultRecordCount: '2000',
    })) as { features?: { attributes: Attrs }[]; exceededTransferLimit?: boolean };
    const got = j.features ?? [];
    for (const f of got) parts.push(`${Number(f.attributes[HYANALT.oid])}:${String(f.attributes[F.status] ?? '')}`);
    if (!j.exceededTransferLimit || got.length === 0) break;
    offset += got.length;
  }
  return parts.join(',');
}

const edit = async (key: 'adds' | 'updates', rows: Attrs[]) => {
  const wrapped = rows.map((attributes) => ({ attributes }));
  let tried = false;
  try {
    tried = true;
    const j = (await post('/applyEdits', { [key]: JSON.stringify(wrapped) })) as Record<
      string,
      { success?: boolean; error?: { description?: string } }[]
    >;
    const results = j[key === 'adds' ? 'addResults' : 'updateResults'] ?? [];
    const bad = results.filter((r) => !r.success);
    if (bad.length) {
      throw new HyanaltError(
        tr('{0} мөр хадгалагдсангүй: {1}', bad.length, bad[0].error?.description ?? tr('тодорхойгүй')),
      );
    }
    if (results.length !== rows.length) {
      throw new HyanaltError(
        tr('{0} мөр хадгалагдсангүй: {1}', Math.abs(rows.length - results.length), tr('серверээс үр дүн дутуу ирлээ')),
      );
    }
    return results;
  } finally {
    if (tried) invalidate('HYANALT');
  }
};

export const addRows = (rows: Attrs[]) => edit('adds', rows);
export const updateRows = (rows: Attrs[]) => edit('updates', rows);

/** A stale decision is a definite rejection, not an ambiguous transport failure. */
export class HyanaltConflict extends HyanaltError {
  constructor() {
    super(tr('Төлөв өөрчлөгдсөн — жагсаалт шинэчлэгдлээ, дахин шалгана уу'));
    this.name = 'HyanaltConflict';
  }
}

/**
 * Check the old decision and change it in ONE server-side UPDATE. A second browser
 * cannot pass the same predicate after the first decision changes status/history.
 * /calculate is supported by the Enterprise review layer (Update capability).
 * Never fall back to an unconditional applyEdits when it is unavailable.
 */
export async function updateDecision(expected: Row, patch: Attrs): Promise<void> {
  const oid = expected.__oid;
  if (!Number.isSafeInteger(oid) || oid <= 0 || patch[HYANALT.oid] !== oid) {
    throw new HyanaltError(tr('Бүртгэл олдсонгүй'));
  }
  const fields = await serviceFieldNames();
  if (!fields) throw new HyanaltError(tr('Талбарын жагсаалт ирсэнгүй — дахин оролдоно уу'));
  if (!calculateSupported) {
    throw new HyanaltError(tr('Зэрэг өөрчлөлтийг хамгаалах бичилт дэмжигдээгүй — админд мэдэгдэнэ үү.'));
  }
  const quote = (value: string) => `N'${value.replace(/'/g, "''")}'`;
  const guarded = [F.status, F.history, F.okCells, F.bagts,
    ...REVIEW_STAGES.flatMap((stage) => [SF[stage].who, SF[stage].decision, SF[stage].reason])];
  if (!fields.has(F.status)) throw new HyanaltError(tr('Талбарын жагсаалт ирсэнгүй'));
  const clauses = [`${HYANALT.oid} = ${oid}`];
  for (const field of guarded) {
    if (!fields.has(field)) continue;
    const value = String((expected as unknown as Attrs)[field] ?? '');
    clauses.push(value === '' ? `(${field} IS NULL OR ${field} = '')` : `${field} = ${quote(value)}`);
  }
  for (const field of [F.sheetOid, F.ergelt]) {
    if (!fields.has(field)) continue;
    const value = (expected as unknown as Attrs)[field];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new HyanaltError(tr('Талбарын жагсаалт ирсэнгүй'));
    }
    clauses.push(value === 0 ? `(${field} IS NULL OR ${field} = 0)` : `${field} = ${value}`);
  }
  const changes = Object.entries(patch).filter(([field]) => field !== HYANALT.oid);
  if (!changes.length || changes.some(([field, value]) => !fields.has(field)
    || (value !== null && typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))))) {
    throw new HyanaltError(tr('Талбарын жагсаалт ирсэнгүй'));
  }
  try {
    const result = await post('/calculate', {
      where: clauses.join(' AND '),
      calcExpression: JSON.stringify(changes.map(([field, value]) => ({
        field, value,
      }))),
      sqlFormat: 'standard',
    });
    if (result.success !== true || !Number.isInteger(result.updatedFeatureCount)
      || Number(result.updatedFeatureCount) < 0 || Number(result.updatedFeatureCount) > 1) {
      throw new HyanaltError(tr('серверээс үр дүн дутуу ирлээ'));
    }
    if (result.updatedFeatureCount === 0) throw new HyanaltConflict();
  } finally {
    invalidate('HYANALT');
  }
}

/**
 * `Бүртгэлийн_дугаар` ДАВХАРДЛЫГ БИЧСЭНИЙ ДАРАА ЗАСНА (2026-10-04, `idUnique`).
 */
export async function ensureUniqueId(oid: number, id: string): Promise<string> {
  const n = idNum(id);
  if (!(oid > 0) || n == null) return id;
  return withIdLock(() => ensureUniqueIdLocked(oid, id, n));
}
async function ensureUniqueIdLocked(oid: number, id: string, n: number): Promise<string> {
  let cur = n;
  let out = id;
  try {
    for (let i = 0; i < 3; i += 1) {
      const idRows = (await queryAll()).map((a) => ({ oid: Number(a[HYANALT.oid]), id: idNum(a[F.id]) }));
      if (!collidesBelow(idRows, oid, cur)) return out;
      const next = renumberPlan(idRows, [cur]).get(cur) as number;
      const nid = `G-${String(next).padStart(6, '0')}`;
      await updateRows([{ [HYANALT.oid]: oid, [F.id]: nid }]);
      cur = next;
      out = nid;
    }
    return out;
  } catch (e) {
    console.warn('[selbe] бүртгэлийн дугаарын давхардлын шалгалт унав:', e);
    return out;
  }
}

/**
 * ӨӨРИЙН ДӨНГӨЖ НЭМСЭН давхар мөрийг устгана (2026-10-05, `hyanaltSubmit.submitForReview`).
 */
export async function deleteRow(oid: number): Promise<boolean> {
  if (!(Number.isInteger(oid) && oid > 0)) return false;
  try {
    const j = (await post('/applyEdits', { deletes: String(oid) })) as { deleteResults?: { success?: boolean }[] };
    const res = j.deleteResults ?? [];
    const ok = res.length === 1 && res[0].success === true;
    if (ok) invalidate('HYANALT');
    return ok;
  } catch (e) {
    console.warn('[selbe] давхар хяналтын мөрийг устгаж чадсангүй:', e);
    return false;
  }
}

/** `addRows`-ийн үр дүнгээс шинэ мөрийн OBJECTID (байхгүй бол 0) */
export const addedOid = (res: readonly unknown[], i = 0): number => {
  const v = Number((res[i] as { objectId?: unknown } | undefined)?.objectId);
  return Number.isInteger(v) && v > 0 ? v : 0;
};
