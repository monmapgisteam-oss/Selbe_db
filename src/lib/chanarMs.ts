/**
 * ЧАНАРЫН БАРИМТ (MS · MA · MIR · FIC · NCR · QMP · PRC) — ТӨРӨЛ, ТӨЛӨВ, ХЯНАГЧИЙН ҮЛДСЭН ЦЭВЭР ТУСЛАХУУД.
 */

import { t as tr } from '@/lib/i18nCore';

/* ════════════════════════ ТӨРӨЛ ════════════════════════ */

/**
 * Баримтын долоон төрөл — `turul` багана, `docNo`-ийн дунд хэсэг.
 */
export const KINDS = ['MS', 'MA', 'MIR', 'FIC', 'NCR', 'QMP', 'PRC'] as const;
export type DocKind = (typeof KINDS)[number];

/* ════════════════════════ ХЯНАГЧ ════════════════════════ */

/**
 * ТАВАН ХЯНАГЧИЙН ҮҮРЭГ — `chanarAcl.ChanarRole`-той ЯГ ИЖИЛ нэр.
 *   tuh    — ТУХ-ийн инженер + менежер (талбайн нөхцөл, эрсдэлийн үнэлгээ)
 *   chanar — Чанарын хэлтэс (менежер — «Зөвшөөрсөн»)
 *   habea  — ХАБЭА-н инженер (аюулгүй ажиллагаа) — зөвхөн MS-төрөл
 *   tug    — ТУГ (төслийн удирдлагын газар) — MA («Танилцсан»), NCR (ТМ)
 *   cheng  — Чанарын хэлтсийн ХЯНАЛТЫН ИНЖЕНЕР — MA-ийн ЭХНИЙ шат
 *            («Боловсруулсан»), 2026-09-28 2-р үе шат
 */
export type Reviewer = 'tuh' | 'chanar' | 'habea' | 'tug' | 'cheng';

/**
 * MS-ийн ГУРВАН ХЯНАГЧ — зураглалын 3 · 4а · 4б эгнээ (зэрэг, дараалалгүй).
 */
const REVIEWERS = ['tuh', 'chanar', 'habea'] as const;

/**
 * ТӨРӨЛ БҮРИЙН ХЯНАГЧ — MIR · FIC · MA-д массивын ДАРААЛЛААР
 * (MIR/FIC: tuh → chanar; MA: cheng → chanar → tug). `chanarUi.docVerdict` үүгээр шүүнэ.
 */
export const REVIEWERS_OF: Readonly<Record<DocKind, readonly Reviewer[]>> = {
  MS: REVIEWERS,
  MA: ['cheng', 'chanar', 'tug'],
  MIR: ['tuh', 'chanar'],
  FIC: ['tuh', 'chanar'],
  NCR: ['tuh', 'chanar', 'tug'],
  QMP: REVIEWERS,
  PRC: REVIEWERS,
};

/* ════════════════════════ ТӨЛӨВ ════════════════════════ */

/**
 * Баримтын төлөв — ӨГӨГДӨЛ тул ОРЧУУЛАХГҮЙ (`hyanalt.STATUS`-тэй ижил дүрэм).
 *
 *   draft     — гүйцэтгэгч бичиж байна, хэнд ч харагдахгүй (1-р алхам)
 *   review    — ирүүлсэн, хянагчид хянаж байна (2 → 3 · 4а · 4б)
 *   returned  — аль нэг хянагч татгалзсан → гүйцэтгэгчид (5 → 6)
 *   approved  — БҮХ хянагч зөвшөөрсөн (5 → 7 → 8 → 9)
 */
export const MS_STATUS = {
  draft: 'Ноорог',
  review: 'Хянагдаж байна',
  returned: 'Буцаагдсан',
  approved: 'Батлагдсан',
} as const;
export type MsStatus = (typeof MS_STATUS)[keyof typeof MS_STATUS];

/** Төлөвийн шошго — төрлөөр (зурагдах агшинд) */
export function statusLabel(kind: DocKind, status: MsStatus): string {
  if (kind === 'NCR') {
    if (status === MS_STATUS.review) return tr('Гүйцэтгэгчид илгээсэн');
    if (status === MS_STATUS.returned) return tr('Нэмэлт арга хэмжээ шаардлагатай');
    if (status === MS_STATUS.approved) return tr('Хаагдсан');
    return tr('Ноорог');
  }
  if (status === MS_STATUS.review) return tr('Хянагдаж байна');
  if (status === MS_STATUS.returned) return tr('Буцаагдсан');
  if (status === MS_STATUS.approved) return tr('Батлагдсан');
  return tr('Ноорог');
}

/**
 * Хянагчийн шийдвэр — өгөгдөл, орчуулахгүй.
 */
export const VERDICT = {
  approve: 'Зөвшөөрсөн',
  note: 'Санал бүхий зөвшөөрсөн',
  return: 'Татгалзсан',
} as const;
export type Verdict = (typeof VERDICT)[keyof typeof VERDICT];
export type VerdictCode = 'A' | 'AN' | 'R';

/** Шийдвэрийн товч код — хариу маягтын «+» багана */
export const verdictCode = (v: Verdict): VerdictCode =>
  (v === VERDICT.approve ? 'A' : v === VERDICT.note ? 'AN' : 'R');

/* ════════════════════════ БАРИМТ ════════════════════════ */

/** Нэг хянагчийн бүртгэл — хэн, хэзээ, юу гэж */
export type Review = {
  /** ArcGIS-ийн нэр, жижиг үсгээр */
  who: string;
  /** epoch мс */
  at: number;
  verdict: Verdict;
  /** Санал, зөвлөмж — татгалзах/AN-д ЗААВАЛ, зөвшөөрөхөд сонголтоор */
  note: string | null;
  /** MA: материал бүрийн шийдвэр (индексээр) — хоосон бол нийт шийдвэр */
  perMaterial?: Record<string, VerdictCode>;
  /** AN: нөхцөл биелэх хугацаа (epoch мс) — сонголтоор */
  anDeadline?: number;
};

export type Reviews = Record<Reviewer, Review | null | undefined>;

/**
 * «ХЯНАХГҮЙ БУЦААХ» — формат буруу / бүрдэл дутуу (2026-09-28: бүртгэлд 10 мөр
 * REP-гүй буцаагдсан). `hyanalt` JSON-д `bounce` түлхүүрээр (жагсаалтад тэмдэг),
 * мөн `body.bounces[]`-д түүх.
 */
export type BounceReason = 'format' | 'incomplete';
export type Bounce = { at: number; by: string; reason: BounceReason; note: string };

/**
 * ЗАХИАЛАГЧИЙН ХАРИУ (REP) — approved/returned болмогц автоматаар үүснэ.
 * `no` = `SLB-REP-<KIND>-P<pkg>-<NNNN>-<RR>`, NNNN нь ТӨСЛИЙН ХЭМЖЭЭНИЙ нэг
 * дараалал (kind тус бүр), RR = ХАРИУНЫ ТОО тухайн баримтын lineage-д
 * (2026-09-28: баримтын rev БИШ — `0007-00 → 0007-01` нь AN→A хаалт).
 * `hyanalt` JSON-д `rep` түлхүүрээр.
 */
export type Rep = {
  no: string;
  at: number;
  verdict: VerdictCode;
  /** [AN] хянагчдын саналууд; A-д ч санал байвал энд (rep-д харагдана) */
  anText?: string;
  /** [R] татгалзлын шалтгаанууд */
  rReasons?: string[];
  /** MA: материал бүрийн шийдвэр — хянагчдын нэгтгэл (R > AN > A), түгжигдсэнийг оруулаад */
  perMaterial?: Record<string, VerdictCode>;
  /** Боловсруулсан = ЭХНИЙ шийдвэр өгсөн хянагч (MA: cheng) */
  preparedBy?: string;
  /** AN: нөхцөл биелэх хугацаа */
  anDeadline?: number;
  /** Гүйцэтгэгч «Хүлээн авлаа» (`ackRep`) */
  receivedAt?: number;
  receivedBy?: string;
  /** AN → A хаалт (`closeAn`) */
  anClosedAt?: number;
  anClosedBy?: string;
};

/**
 * ЗУРАГЛАЛЫН 9 АЛХМЫН БАРИМТЫН ТОЛГОЙ — жишээ маягтын 1-р хуудас.
 */
export type MsDoc = {
  oid: number;
  /** 2026-09-28: төрөл — хуучин мөрд `MS` */
  kind: DocKind;
  /** `<ГҮЙЦ>-SLB-<KIND>-P<багц>-<№>-<rev>` — `docNo()`-оос; NCR: `STMCC-STMC-NCR-NNNN` */
  docNo: string;
  /** Гүйцэтгэгчийн код — «MSC», «NBG» … (`orgCode`) */
  org: string;
  /** Багцын бүлэг — «Багц 3.3» (`Pkg.group`, эрхийн хүрээ үүгээр) */
  bagts: string;
  /** Нэг багц дотор ДАРААЛСАН дугаар — 1, 2, 3 … (NCR: төслийн хэмжээнд) */
  seq: number;
  /** Хувилбар — 0 анхных, буцаагдах бүрд +1 (NCR: үргэлж 0) */
  rev: number;
  /** Баримтын нэр — «Метал хавтан угсралтын ажлын аргачлал» */
  title: string;
  status: MsStatus;
  /** Зохиогчийн аккаунт (жижиг үсгээр) — NCR-д нээсэн захиалагч */
  author: string;
  /** Ирүүлсэн огноо — `draft` төлөвт `null` */
  sentAt: number | null;
  /** Хянагчдын бүртгэл — өгөөгүй нь `null` (төрөлд хамаагүй үүрэг ч `null`) */
  reviews: Reviews;
  /** Эцсийн шийдвэрийн огноо (approved/returned) */
  decidedAt: number | null;
  /** Захиалагчийн хариу — шийдвэрлэгдээгүй бол `null` */
  rep: Rep | null;
  /** «Хянахгүй буцаасан» — энэ хувилбар дээр (2026-09-28); байхгүй/null = үгүй */
  bounce?: Bounce | null;
};

/** AN-тай батлагдсан баримт НЭЭЛТТЭЙ (нөхцөл биелээгүй) — `closeAn` хийгдээгүй */
export const isAnOpen = (doc: Pick<MsDoc, 'status' | 'rep'>): boolean =>
  doc.status === MS_STATUS.approved && doc.rep?.verdict === 'AN';

/* ════════════════════════ БИЕ (ТӨРӨЛ) ════════════════════════ */


/**
 * НИЙТЛЭГ МЕТА (бүх төрлийн `body.meta`) — бүртгэлийн xlsx-ийн багана.
 *   preparedAt   — боловсруулсан огноо (зохиогч; анхдагч = үүсгэсэн өдөр)
 *   owners       — ХАРИУЦСАН АЖИЛТАН 1–2 (захиалагчийн хянагч сонгоно)
 *   owner        — ХУУЧИН талбар = `owners[0]` (уншихад хоёуланг авна,
 *                  бичихэд хоёуланг бичнэ — өнөөдрийн мөр, хуучин UI хэвээр)
 *   category     — материалын/ажлын ангилал (MA: `chanarTemplates.MA_CATEGORIES`
 *                  id, бусад чөлөөт текст; NCR: үл тохирлын төрөл — Бетон/Арматур…)
 *   workType     — MS: `chanarTemplates.msWorkTypes` id (`w01`…`w32`)
 *   pageCount    — хуудасны тоо (бүртгэлийн багана)
 *   projectTitle — төслийн нэр (багцаас анхдагч)
 *   contractNo   — гэрээний дугаар
 *   discipline   — `DISCIPLINES`-ээс олон сонголт
 *   note         — тэмдэглэл («имэйлээр батлагдсан» г.м.)
 */
export type Meta = {
  preparedAt: number | null;
  owner: string | null;
  owners: string[];
  category: string;
  workType: string | null;
  pageCount: number | null;
  projectTitle: string;
  contractNo: string;
  discipline: string[];
  note: string;
};

/** Хувилбарын түүхийн мөр — `body.revHistory[]` (2026-09-28) */
export type RevEntry = { rev: number; at: number; reason: string; by: string };

/**
 * БҮХ БИЕД НИЙТЛЭГ хувилбар/буцаалтын талбарууд (2026-09-28).
 */
export type BodyCommon = {
  /** Энэ хувилбарын шалтгаан — rev > 0 илгээхэд ЗААВАЛ */
  revNote: string;
  revHistory: RevEntry[];
  bounces: Bounce[];
};

/* ── MA ── */

/**
 * НЭГ МАТЕРИАЛ — 2026-09-28 (2-р үе шат): практикийн хүснэгтийн баганууд бүгд
 * СОНГОЛТ (хоосон мөр). `verdict`/`locked` нь хянагчийн бичилт:
 */
export type MaMaterial = {
  name: string;
  category: string;
  standard: string;
  manufacturer: string;
  supplier: string;
  origin: 'domestic' | 'foreign' | null;
  note: string;
  brand: string;
  /** Марк */
  model: string;
  size: string;
  unit: string;
  qty: string;
  /** Үе шатны ажил */
  stage: string;
  /** Ашиглах байршил / блок */
  location: string;
  drawingNo: string;
  /** Заагдсан стандарт (ГОСТ …) ↔ дүйцэх стандарт */
  designStd: string;
  equivStd: string;
  /** Зураг төслийн / техникийн шаардлага ↔ санал болгож буй */
  designReq: string;
  proposed: string;
  /** Шаардлага хангаж буй эсэх — `null` = тэмдэглээгүй */
  meets: boolean | null;
  /** Талбайд ирсэн огноо */
  arrivedAt: number | null;
  certNo: string;
  /** Хавсралтын хуудас */
  pageRef: string;
  verdict: VerdictCode | null;
  locked: boolean;
};

/** «MA Submittal's appendix» бүрдэл — 9 + 2 (дотоод/гадаад 2-оос доошгүй үйлдвэрлэгч) */
export type MaCheckKey =
  | 'manufacturerIntro' | 'materialList' | 'techSpec' | 'license' | 'qualityCert'
  | 'conformityCert' | 'sample' | 'translation' | 'labTest' | 'domesticTwo' | 'foreignTwo';

/** Гарын үсгийн мөр — нэр · албан тушаал · байгууллага · огноо (хоосон байж болно) */
export type Sig = { name: string; position: string; org: string; date: number | null };

/** Submittal төрөл — Багц 6.2 дамжуулах маягт */
export type SubmittalType = 'plan' | 'spec' | 'subcontractor' | 'ma' | 'shopDrawing' | 'ms' | 'opManual';

/** MA хавсралтын мөр — `kind` нь бүрдлийн түлхүүр эсвэл `other` */
export type MaAttachment = { kind: MaCheckKey | 'other'; title: string; pages: string };

export type MaBody = BodyCommon & {
  meta: Meta;
  /** Нэг MA олон материал */
  materials: MaMaterial[];
  checklist: Record<MaCheckKey, boolean>;
  costImpact: boolean;
  timeImpact: boolean;
  /** Зураг төсөлтэй тохирох — `null` = тэмдэглээгүй */
  drawingsMatch: boolean | null;
  drawings: { no: string; rev: string; note: string }[];
  /** Агуулгын 7 хэсгээс текст болох 7 (хавсралт нь мөрийн attachment) */
  scope: string;
  manufacturer: string;
  intro: string;
  standards: string;
  sample: string;
  storage: string;
  transport: string;
  /** Техникийн үзүүлэлт (сонголт) · зориулалт, ашиглах хүрээ */
  techSpec: string;
  purpose: string;
  /** Гүйцэтгэгчийн дотоод гарын үсэг — хэвлэх маягт (`chanarUi.printSigRoles`) */
  signatures: { prepared: Sig; reviewed: Sig; reviewed2: Sig; approved: Sig };
  subcontractor: string;
  blocks: string[];
  attachments: MaAttachment[];
  /** Холбогдох MA/MS дугаар */
  refs: string[];
  submittalType: SubmittalType | null;
};

/** Шалгах мөрийн утга — маягтын OK / N/A / X (initial-аар) */
export type InspCheck = 'OK' | 'NA' | 'X';

/* ════════════════════════ УРСГАЛ ════════════════════════ */

export const emptyReviews = (): Reviews =>
  ({ tuh: null, chanar: null, habea: null, tug: null, cheng: null });

/**
 * НЭГ ХҮН ХОЁР ҮҮРЭГТ — ГАЦААНЫ ШАЛГУУР.
 */
export type RoleClash = { kinds: DocKind[]; roles: Reviewer[]; users: string[] };
export function reviewerClashes(
  _holders: Partial<Record<Reviewer, readonly string[]>>, _authors: readonly string[],
): RoleClash[] {
  return [];
}

/** Тухайн (kind, bagts, seq)-ийн ХАМГИЙН СҮҮЛИЙН хувилбар — жагсаалтад үүнийг л харуулна */
export function latest(docs: readonly MsDoc[]): MsDoc[] {
  const by = new Map<string, MsDoc>();
  for (const d of docs) {
    const k = `${d.kind ?? 'MS'}|${d.bagts}|${d.seq}`;
    const cur = by.get(k);
    if (!cur || d.rev > cur.rev) by.set(k, d);
  }
  return [...by.values()];
}

/**
 * Тухайн (kind, bagts, seq)-ийн ХАМГИЙН СҮҮЛИЙН БАТЛАГДСАН хувилбар — иш татах · холбоос · «батлагдсан» тоонд.
 */
export function latestApproved(docs: readonly MsDoc[]): MsDoc[] {
  return latest(docs.filter((d) => d.status === MS_STATUS.approved));
}
