/**
 * ГҮЙЦЭТГЭЛИЙН ХЯНАЛТ — схем ба ArcGIS REST давхарга.
 *
 * ⚠️ ЭНЭ ҮЙЛЧИЛГЭЭ СЭЛБЭГИЙН БУСДААС ӨӨР БАЙГУУЛЛАГАД байна:
 *     хяналт      → ACqsMOmNLi5wIdIh (services-ap1)
 *     эх хүснэгт  → HJzgwvlNIXssnQar (services)
 * Тиймээс хоёрыг SQL-ээр нэгтгэх БОЛОМЖГҮЙ — програм тус тусад нь асууж,
 * `Эх_мөрийн_дугаар`-аар өөрөө холбоно.
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

export const HYANALT = {
  url: 'https://services-ap1.arcgis.com/ACqsMOmNLi5wIdIh/arcgis/rest/services/guitsetgel_bugluh_hyanalt/FeatureServer/0',
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

  status: 'Төлөв',
} as const;

export const STATUS = {
  engineerReview: 'Инженер хянаж байна',
  engineerReturned: 'Инженер буцаасан',
  managerReview: 'Менежер хянаж байна',
  managerReturned: 'Менежер буцаасан',
  directorReview: 'Ерөнхий менежер хянаж байна',
  directorReturned: 'Ерөнхий менежер буцаасан',
  /** ЭЦСИЙН төлөв — дөрвөн шат бүгд өнгөрсний ДАРАА л энд хүрнэ. */
  transferred: 'Шилжүүлсэн',
} as const;
export type Status = (typeof STATUS)[keyof typeof STATUS];

export const DECISION = { approve: 'Зөвшөөрсөн', return: 'Буцаасан' } as const;
export type Decision = (typeof DECISION)[keyof typeof DECISION];

/**
 * Шат — ДӨРӨВ. Буцаах нь ЯВСАН ЗАМААРАА, нэг алхмаар:
 *   гүйцэтгэгч → хяналтын инженер → багцын менежер → ерөнхий менежер
 * ⚠️ Ерөнхий менежер зөвшөөрсний ДАРАА л эх хүснэгтэд бүртгэгдсэнд тооцно
 *    (`Шилжүүлсэн`). Гурав дахь шатанд зогсоовол хяналт дутуу үлдэнэ.
 */
export type Stage = 'company' | 'engineer' | 'manager' | 'director';

/** Шатны ДАРААЛАЛ — нэг эх сурвалж. Буцах чиглэл нь энэ жагсаалтын урвуу. */
export const STAGE_ORDER: Stage[] = ['company', 'engineer', 'manager', 'director'];

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
  [STATUS.transferred]: 'director',
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
export async function missingDirectorFields(): Promise<string[] | null> {
  if (missingCache) return missingCache;
  try {
    const res = await fetch(`${HYANALT.url}?f=json`);
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
    const have = new Set(j.fields.map((x) => x.name));
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
    body: new URLSearchParams({ f: 'json', ...body }).toString(),
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
    })) as { features?: { attributes: Attrs }[] };

    const got = j.features ?? [];
    out.push(...got.map((f) => f.attributes));
    if (got.length < 2000) break;
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
      `${bad.length} мөр хадгалагдсангүй: ${bad[0].error?.description ?? 'тодорхойгүй'}`,
    );
  }
  return results;
};

export const addRows = (rows: Attrs[]) => edit('adds', rows);
export const updateRows = (rows: Attrs[]) => edit('updates', rows);
