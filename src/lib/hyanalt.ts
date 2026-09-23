/**
 * ГҮЙЦЭТГЭЛИЙН ХЯНАЛТ — схем ба ArcGIS REST давхарга.
 *
 * ⚠️ 2026-09-17-ноос энэ хүснэгт ч monmap (HJzgwvlNIXssnQar)-д — гэхдээ эх
 *    хүснэгтүүдээс ТУСДАА үйлчилгээ тул SQL-ээр нэгтгэх БОЛОМЖГҮЙ хэвээр —
 *    програм тус тусад нь асууж, `Эх_мөрийн_дугаар`-аар өөрөө холбоно.
 *
 * ⚠️ Талбарын нэрийг компонент дотор ШУУД бичихгүй — бүгд `F`-ээс. Нэр
 * өөрчлөгдвөл ЗӨВХӨН энд засна.
 *
 * ⚠️ Талбарын нэр, төлөвийн утга нь ӨГӨГДӨЛ тул ОРЧУУЛАХГҮЙ. Зөвхөн дэлгэцэд
 * гарах шошгыг `tr()`-ээр боож орчуулна (`Guitsetgel.tsx` үзнэ үү).
 *
 * ⚠️ Editor Tracking АСААЛТТАЙ: CreationDate · Creator · EditDate · Editor.
 * Эдгээрийг програм БИЧИХГҮЙ — ArcGIS өөрөө бөглөж, засагдахаас хамгаална.
 */

import { invalidate } from './dataBus';
import { tokenParam, tokenQs } from '@/lib/authToken';
import { t as tr } from '@/lib/i18nCore';
import { HJ } from '@/lib/services';

export const HYANALT = {
  /* ⚠️ 2026-09-17: MUST → monmap. Хүснэгт нь шинэ үйлчилгээнд id 205 (0 БИШ);
     29/29 талбар, 22 мөр ижил. */
  url: `${HJ}/guitsetgel_bugluh_hyanalt/FeatureServer/205`,
  oid: 'OBJECTID',
} as const;

/** Хяналтын үйлчилгээний талбарууд — амьд үйлчилгээтэй ЯГ тохирно */
export const F = {
  id: 'Бүртгэлийн_дугаар',
  /**
   * ХОЛБООС ЭХ АГУУЛГА РУУ — утга нь 2026-09-04-нд ӨӨРЧЛӨГДСӨН.
   *
   * · ШИНЭ мөрд: `Selbe_Guitsetgel_Draft` хүснэгтийн ИЛГЭЭЛТИЙН мөрийн
   *   OBJECTID (`sub|<pkgKey>`). Гүйцэтгэл нь ерөнхий менежер баталтал
   *   архивт БАЙХГҮЙ тул архивын дугаар өгөх боломжгүй.
   * · ХУУЧИН мөрд: `Bagts_*` архивт нэмэгдсэн ЭХНИЙ мөрийн OBJECTID.
   *
   * ⚠️ Хоёрыг нь ЯЛГАХ цорын ганц зам нь `submission.loadSubmissionByOid`:
   *    `sub|`/`done|` угтвартай мөр олдвол ШИНЭ, эс бөгөөс ХУУЧИН (legacy).
   *    Талбарын нэр, төрлийг өөрчлөх шаардлагагүй байсан тул хуучин мөрүүд
   *    хэвээр ажиллаж байна — `hyanaltDetail` ба `hyanaltStore` хоёулаа
   *    гурван замыг барина.
   */
  sheetOid: 'Эх_мөрийн_дугаар',
  ergelt: 'Хэддэх_удаа',
  bagts: 'Багц',
  ajil: 'Ажлын_нэр',

  company: 'Гүйцэтгэгч_компани',
  companySent: 'Компани_илгээсэн_огноо',

  engineer: 'Талбайн_инженер',
  engineerDecision: 'Инженерийн_шийдвэр',
  engineerReason: 'Инженер_буцаасан_шалтгаан',
  engineerReturned: 'Инженер_буцаасан_огноо',
  engineerSent: 'Инженер_илгээсэн_огноо',

  /** БАГЦЫН менежер — гурав дахь шат */
  manager: 'Менежер',
  managerDecision: 'Менежерийн_шийдвэр',
  managerReason: 'Менежер_буцаасан_шалтгаан',
  managerReturned: 'Менежер_буцаасан_огноо',
  managerSent: 'Менежер_илгээсэн_огноо',

  /**
   * ЕРӨНХИЙ МЕНЕЖЕР — дөрөв дэх, ЭЦСИЙН шат.
   * ⚠️ Эдгээр талбарыг үйлчилгээнд ГАРААР нэмэх шаардлагатай (`DIRECTOR_FIELDS`).
   *    Байхгүй үед програм нь дөрөв дэх шатыг ХААЖ, шалтгааныг ил хэлнэ —
   *    чимээгүй унахаас сэргийлнэ.
   */
  director: 'Ерөнхий_менежер',
  directorDecision: 'Ерөнхий_менежерийн_шийдвэр',
  directorReason: 'Ерөнхий_менежер_буцаасан_шалтгаан',
  directorReturned: 'Ерөнхий_менежер_буцаасан_огноо',
  directorSent: 'Ерөнхий_менежер_илгээсэн_огноо',

  /**
   * ХЭЛТСИЙН ДАРГА — тав дахь шат, ГАЗРЫН ДАРГА — зургаа дахь, ЭЦСИЙН шат
   * (2026-09-23, хэрэглэгч: «Хэлтсийн дарга · Газрын дарга 2 шат нэмнэ»,
   * ерөнхий менежерийн ДАРАА). AGOL-д 10 талбар нэмэгдсэн (`UPPER_FIELDS`).
   */
  head: 'Хэлтсийн_дарга',
  headDecision: 'Хэлтсийн_даргын_шийдвэр',
  headReason: 'Хэлтсийн_дарга_буцаасан_шалтгаан',
  headReturned: 'Хэлтсийн_дарга_буцаасан_огноо',
  headSent: 'Хэлтсийн_дарга_илгээсэн_огноо',
  chief: 'Газрын_дарга',
  chiefDecision: 'Газрын_даргын_шийдвэр',
  chiefReason: 'Газрын_дарга_буцаасан_шалтгаан',
  chiefReturned: 'Газрын_дарга_буцаасан_огноо',
  chiefSent: 'Газрын_дарга_илгээсэн_огноо',

  /**
   * ХЯНАГЧИЙН ЗӨВШӨӨРСӨН НҮДНҮҮД — `"мөр:блок"` түлхүүрийн JSON массив.
   *
   * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ (2026-09-22, хэрэглэгчийн шаардлага): хянагч нүд
   *    бүрээр зөвшөөрдөг (`Guitsetgel.toggleOk`) бөгөөд «зөвшөөрсөн 7/10»
   *    гэж тоологддог атал тэр сонголт ЗӨВХӨН React state-д байсан тул
   *    хуудас хаагдмагц алга болж, БУЦААГДСАН гүйцэтгэгч аль нүдээ засахаа
   *    мэдэх аргагүй байв — өөрчилсөн нүд бүгд ижил харагдана.
   *
   * ⚠️ ЛАТИН нэр (`Zovshoorson_nud`): кирилл талбар SQL-д `N'…'` угтвар
   *    шаарддаг тул шинэ талбарыг латинаар нэрлэв.
   *
   * ⚠️ ШАТ БҮРД ТУСДАА БИШ, НЭГ талбар: буцаасан ШАТ нь `Төлөв`-өөс мэдэгдэх
   *    бөгөөд гүйцэтгэгчид хэрэгтэй нь «хамгийн сүүлд хэн юуг зөвшөөрөөгүй»
   *    гэдэг ГАНЦ хариулт. Гурван талбар болговол аль нь хүчинтэйг уншигч
   *    бүр өөрөө шийдэх шаардлагатай болно.
   */
  okCells: 'Zovshoorson_nud',

  status: 'Төлөв',
} as const;

export const STATUS = {
  engineerReview: 'Инженер хянаж байна',
  engineerReturned: 'Инженер буцаасан',
  managerReview: 'Менежер хянаж байна',
  managerReturned: 'Менежер буцаасан',
  directorReview: 'Ерөнхий менежер хянаж байна',
  directorReturned: 'Ерөнхий менежер буцаасан',
  headReview: 'Хэлтсийн дарга хянаж байна',
  headReturned: 'Хэлтсийн дарга буцаасан',
  chiefReview: 'Газрын дарга хянаж байна',
  chiefReturned: 'Газрын дарга буцаасан',
  /** ЭЦСИЙН төлөв — зургаан шат бүгд өнгөрсний ДАРАА л энд хүрнэ. */
  transferred: 'Шилжүүлсэн',
} as const;
export type Status = (typeof STATUS)[keyof typeof STATUS];

export const DECISION = { approve: 'Зөвшөөрсөн', return: 'Буцаасан' } as const;
export type Decision = (typeof DECISION)[keyof typeof DECISION];

/**
 * Шат — ЗУРГАА (2026-09-23). Буцаах нь ЯВСАН ЗАМААРАА, нэг алхмаар:
 *   гүйцэтгэгч → хяналтын инженер → багцын менежер → ерөнхий менежер
 *   → хэлтсийн дарга → газрын дарга
 * ⚠️ Газрын дарга зөвшөөрсний ДАРАА л эх хүснэгтэд бүртгэгдсэнд тооцно
 *    (`Шилжүүлсэн`). Завсрын шатанд зогсоовол хяналт дутуу үлдэнэ.
 */
export type Stage = 'company' | 'engineer' | 'manager' | 'director' | 'head' | 'chief';

/** Шатны ДАРААЛАЛ — нэг эх сурвалж. Буцах чиглэл нь энэ жагсаалтын урвуу.
 *  ⚠️ 2026-09-23: ерөнхий менежерийн ДАРАА хэлтсийн дарга (`head`), газрын
 *  дарга (`chief`) нэмэгдэв — нийт 6 шат; «Шилжүүлсэн» нь газрын даргынх. */
export const STAGE_ORDER: Stage[] = ['company', 'engineer', 'manager', 'director', 'head', 'chief'];

/** ХЯНАХ шатууд (компаниас бусад) — шийдвэрийн талбар · төлөв нь ЭНЭ хүснэгтээс. */
export const REVIEW_STAGES = ['engineer', 'manager', 'director', 'head', 'chief'] as const;
export type ReviewStage = (typeof REVIEW_STAGES)[number];

/**
 * ШАТ БҮРИЙН ТАВАН ТАЛБАР — нэр · шийдвэр · шалтгаан · буцаасан огноо ·
 * илгээсэн огноо. `hyanaltStore.apply/recheck` шат бүрд if/else бичихийн
 * оронд ЭНДЭЭС уншина: шинэ шат нэмэхэд зөвхөн энэ хүснэгт ба `OWNER`.
 */
export const SF: Record<ReviewStage, { who: string; decision: string; reason: string; returned: string; sent: string }> = {
  engineer: { who: F.engineer, decision: F.engineerDecision, reason: F.engineerReason, returned: F.engineerReturned, sent: F.engineerSent },
  manager: { who: F.manager, decision: F.managerDecision, reason: F.managerReason, returned: F.managerReturned, sent: F.managerSent },
  director: { who: F.director, decision: F.directorDecision, reason: F.directorReason, returned: F.directorReturned, sent: F.directorSent },
  head: { who: F.head, decision: F.headDecision, reason: F.headReason, returned: F.headReturned, sent: F.headSent },
  chief: { who: F.chief, decision: F.chiefDecision, reason: F.chiefReason, returned: F.chiefReturned, sent: F.chiefSent },
};

/** Тухайн шат ХЯНАЖ БАЙГАА төлөв */
export const REVIEW_STATUS: Record<ReviewStage, Status> = {
  engineer: STATUS.engineerReview,
  manager: STATUS.managerReview,
  director: STATUS.directorReview,
  head: STATUS.headReview,
  chief: STATUS.chiefReview,
};

/** Тухайн шат БУЦААСАН төлөв (нэг алхам доош очно — `OWNER`) */
export const RETURNED_STATUS: Record<ReviewStage, Status> = {
  engineer: STATUS.engineerReturned,
  manager: STATUS.managerReturned,
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
 * ⚠️ «Менежер буцаасан» нь КОМПАНИД биш ИНЖЕНЕРТ очно — инженер дахин шалгана.
 */
export const OWNER: Record<Status, Stage> = {
  [STATUS.engineerReview]: 'engineer',
  [STATUS.engineerReturned]: 'company',
  [STATUS.managerReview]: 'manager',
  [STATUS.managerReturned]: 'engineer',
  [STATUS.directorReview]: 'director',
  // ⚠️ Ерөнхий менежер буцаавал БАГЦЫН МЕНЕЖЕРТ — тэр дахин шалгана
  [STATUS.directorReturned]: 'manager',
  [STATUS.headReview]: 'head',
  // ⚠️ Хэлтсийн дарга буцаавал ЕРӨНХИЙ МЕНЕЖЕРТ (нэг алхам)
  [STATUS.headReturned]: 'director',
  [STATUS.chiefReview]: 'chief',
  // ⚠️ Газрын дарга буцаавал ХЭЛТСИЙН ДАРГАД (нэг алхам)
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
  [F.status]: Status;
};

/**
 * ЕРӨНХИЙ МЕНЕЖЕРИЙН ТАЛБАРУУД — үйлчилгээнд байх ЁСТОЙ.
 *
 * ⚠️ Эдгээрийг AGOL дээр нэмэхгүй бол дөрөв дэх шатны шийдвэр ХАДГАЛАГДАХГҮЙ.
 *    Тиймээс програм нь эхлэхдээ шалгаад, дутуу бол товчийг ХААЖ, юу дутууг
 *    ил бичнэ. Чимээгүй унавал менежер «баталсан» гэж бодох боловч бүртгэл
 *    үүсээгүй байна гэсэн үг.
 */
export const DIRECTOR_FIELDS = [
  F.director, F.directorDecision, F.directorReason, F.directorReturned, F.directorSent,
  /* ⚠️ 2026-09-23: хэлтсийн · газрын даргын 10 талбар ч ижил шалгуурт — дутуу
     бол 4·5·6-р шатны шийдвэр чимээгүй алдагдана. */
  F.head, F.headDecision, F.headReason, F.headReturned, F.headSent,
  F.chief, F.chiefDecision, F.chiefReason, F.chiefReturned, F.chiefSent,
] as const;

/** ⚠️ ЗӨВХӨН амжилттай уншсан үр дүн энд суух ёстой — алдааг кэшлэхгүй. */
let missingCache: string[] | null = null;

/**
 * Үйлчилгээнд дутуу байгаа 4-р шатны талбарууд.
 *   · `[]`   — бүгд бэлэн;
 *   · `[…]`  — эдгээр нь дутуу;
 *   · `null` — ШАЛГАЖ ЧАДСАНГҮЙ (сүлжээ, 429, токен).
 *
 * ⚠️ ГУРАВ ДАХЬ ТӨЛӨВ ЯАГААД ХЭРЭГТЭЙ (2026-09-04-ний аудит): урьд нь алдааны
 *    үед `[]` буцаадаг байсан нь дуудагч талд «бүгд бэлэн» гэж уншигдаж,
 *    ерөнхий менежерийн «Баталж архивт бүртгэх» товч ИДЭВХТЭЙ үлддэг байв.
 *    Хэрэв талбарууд үнэхээр дутуу бол `applyEdits` танихгүй талбарыг чимээгүй
 *    алгасах тул `Ерөнхий_менежер*` утга алдагдаж, зөвхөн `Төлөв` =
 *    «Шилжүүлсэн» үлдэнэ — хэн батласан нь бүртгэлгүй. Тодорхойгүй үед товчийг
 *    ХААХ ёстой тул «мэдэхгүй»-г ил буцаана.
 */
/**
 * ҮЙЛЧИЛГЭЭНИЙ ТАЛБАРЫН НЭРС — `missingDirectorFields` ба `hasOkCellsField`
 * хоёулаа ЭНЭ нэг уншилтаас (2026-09-23, аудитын #16). Амжилттай хариуг л
 * кэшлэнэ; унавал `null` («мэдэхгүй»), кэшлэхгүй.
 */
let fieldsCache: Set<string> | null = null;
async function serviceFieldNames(): Promise<Set<string> | null> {
  if (fieldsCache) return fieldsCache;
  try {
    const res = await fetch(`${HYANALT.url}?f=json${tokenQs()}`);
    if (!res.ok) throw new HyanaltError(`HTTP ${res.status}`);
    const j = (await res.json()) as {
      fields?: { name: string }[];
      error?: { message?: string };
    };
    /*
     * ⚠️ ArcGIS алдааг HTTP 200-ГААР буцаадаг (`{error:{…}}` — «Too many
     * requests», «Token Required» гэх мэт). Түүнийг шалгахгүй бол `j.fields`
     * нь `undefined` болж, БҮХ талбар «дутуу» гэж уншигдана: үйлчилгээнд
     * баганууд бүрэн байтал ерөнхий менежерийн «Баталж бүртгэх» товч хаагдаж,
     * «AGOL дээр нэмнэ үү» гэсэн ХУДАЛ заавар гарч байв. Доорх `catch` нь
     * сүлжээний алдааг зөв барьдаг ч 200-алдаа тэр хамгаалалтыг тойрдог.
     */
    if (j.error || !Array.isArray(j.fields)) {
      throw new HyanaltError(j.error?.message ?? 'Талбарын жагсаалт ирсэнгүй');
    }
    fieldsCache = new Set(j.fields.map((x) => x.name));
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

export async function missingDirectorFields(): Promise<string[] | null> {
  if (missingCache) return missingCache;
  try {
    const have = await serviceFieldNames();
    if (!have) throw new HyanaltError('Талбарын жагсаалт ирсэнгүй');
    missingCache = DIRECTOR_FIELDS.filter((x) => !have.has(x));
    return missingCache;
  } catch {
    /*
     * ⚠️ Алдааг «дутуу» гэж мэдэгдэхгүй бөгөөд КЭШЛЭХГҮЙ. Урьд нь энд
     * `missingCache = []` гэж бичдэг байсан тул нэг удаагийн түр зуурын алдаа
     * хуудас дахин ачаалах хүртэл хадгалагдаж, дараагийн дуудлага үйлчилгээг
     * огт шалгахаа больдог байв (хоосон массив ч `if (missingCache)`-д үнэн).
     *
     * ⚠️ `[]` (= «бүгд бэлэн») БИШ, `null` (= «мэдэхгүй») буцаана — дээрх
     *    толгойн тайлбар.
     */
    return null;
  }
}

/* ══════════════ ArcGIS REST ══════════════ */

export type Attrs = Record<string, unknown>;

/** Алдааг үргэлж БҮТЭН мессежтэйгээр шиднэ — чимээгүй амжилт хэзээ ч болохгүй */
export class HyanaltError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HyanaltError';
  }
}

/**
 * ⚠️ Хүсэлт `application/x-www-form-urlencoded`-ЭЭР явна — ArcGIS-ийн REST нь
 * JSON бие хүлээж авдаггүй. `f=json` заавал.
 */
async function post(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(HYANALT.url + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ f: 'json', ...tokenParam(), ...body }).toString(),
  });
  if (!res.ok) throw new HyanaltError(`HTTP ${res.status}`);

  const j = (await res.json()) as { error?: { message?: string; details?: string[] } };
  /*
   * ⚠️ ArcGIS алдааг HTTP 200-ГААР буцаадаг — биен дэх `error`-ыг ЗААВАЛ
   * шалгана. Эс бөгөөс амжилтгүй бичилт «болсон» мэт өнгөрч, өгөгдөл
   * чимээгүй алдагдана.
   */
  if (j.error) {
    const d = j.error.details?.length ? ` · ${j.error.details.join('; ')}` : '';
    throw new HyanaltError((j.error.message ?? 'Тодорхойгүй алдаа') + d);
  }
  return j as Record<string, unknown>;
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
      /*
       * ⚠️ Эрэмбэгүй хуудаслалт ArcGIS-д ТОДОРХОЙГҮЙ — мөр давхардах эсвэл
       * алга болж, алдаа нь ЧИМЭЭГҮЙ өнгөрнө.
       */
      orderByFields: `${HYANALT.oid} ASC`,
      resultOffset: String(offset),
      resultRecordCount: '2000',
    })) as { features?: { attributes: Attrs }[]; exceededTransferLimit?: boolean };

    const got = j.features ?? [];
    out.push(...got.map((f) => f.attributes));
    /*
     * ⚠️ `exceededTransferLimit`-ЭЭР таслана, `got.length < 2000`-ААР БИШ
     *    (2026-09-15-ны аудит). Үйлчилгээний `maxRecordCount` нь 2000-аас
     *    БАГА байж болно (1000 нь ArcGIS-ийн түгээмэл анхдагч): тэр үед
     *    эхний хуудас 1000 мөр буцаад `1000 < 2000` тул давталт ЗОГСОЖ,
     *    бүртгэлийн үлдсэн мөр чимээгүй алга болдог байв. Тэгвэл
     *    `groupWorks` дутуу тойргоор «одоогийн төлөв» тогтоож, `nextId()`
     *    дутуу мөрөөс `max` бодож ДАВХАРДСАН дугаар үүсгэнэ.
     *    Зөв хэв маяг репод аль хэдийн бий: `bagtsSheet.ts`, `permsRemote.ts`.
     */
    if (!j.exceededTransferLimit || got.length === 0) break;
    offset += got.length;
  }
  return out;
}

const edit = async (key: 'adds' | 'updates', rows: Attrs[]) => {
  /*
   * ⚠️ Мөрийг `{ attributes: … }` дотор ЗААВАЛ ороож өгнө. Ил задгай объект
   * илгээвэл ArcGIS «'adds' parameter is invalid · Object reference not set»
   * гэж унана — талбарын нэр, утга зөв байсан ч.
   */
  const wrapped = rows.map((attributes) => ({ attributes }));
  const j = (await post('/applyEdits', { [key]: JSON.stringify(wrapped) })) as Record<
    string,
    { success?: boolean; error?: { description?: string } }[]
  >;
  /*
   * ⚠️ `applyEdits` нь мөр БҮРИЙН үр дүнг тусад нь буцаадаг: бүхэл хүсэлт
   * амжилттай ч дотор нь нэг мөр унасан байж болно.
   */
  const results = j[key === 'adds' ? 'addResults' : 'updateResults'] ?? [];
  const bad = results.filter((r) => !r.success);
  /*
   * ⚠️ ХАГАС БИЧИГДСЭН ҮЕД Ч ХҮЧИНГҮЙ БОЛГОНО — `bad.length`-ийг шалгахаас
   * ӨМНӨ. `applyEdits` мөр бүрийг ТУСАД НЬ боддог тул нэг нь унасан ч бусад
   * нь ArcGIS дээр СУУСАН байна; алдааны замд кэшийг үлдээвэл дэлгэц бодит
   * байдлаас хоцорно.
   *
   * ⚠️ Урьд нь энэ дуудлага ОГТ БАЙГААГҮЙ. Хянагч ажил батлахад ArcGIS
   * шинэчлэгддэг ч `schemData` («Үйл ажиллагааны схем») ба
   * `ExecKpi.loadReviewAging` кэшээ барьдаг тул 5 минут хүртэл ХУУЧИН тоо
   * харагдаж, шийдвэр хийгдээгүй мэт сэтгэгдэл төрүүлж байв.
   */
  if (results.some((r) => r.success)) invalidate('HYANALT');
  if (bad.length) {
    throw new HyanaltError(
      tr('{0} мөр хадгалагдсангүй: {1}', bad.length, bad[0].error?.description ?? tr('тодорхойгүй')),
    );
  }
  return results;
};

export const addRows = (rows: Attrs[]) => edit('adds', rows);
export const updateRows = (rows: Attrs[]) => edit('updates', rows);
