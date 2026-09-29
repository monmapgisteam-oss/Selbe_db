/**
 * ЧАНАРЫН БАРИМТ (MS · MA · MIR · FIC · NCR · QMP · PRC) — ХЯНАХ УРСГАЛЫН ЦЭВЭР ЛОГИК.
 *
 * ЭХ СУРВАЛЖ: «Ажил гүйцэтгэх ажлын аргачлалын процессийн зураглал MS»
 * (`docs/chanar/OneDrive_2026-09-16/Ажлын аргачлал/`), Сэлбэ хорин минутын хот
 * корпорацийн Чанарын хэлтэс. 9 алхам, 9 эгнээ. Бусад төрөл —
 * `docs/chanar` практикийн маягтууд (2026-09-28-ны 417 файлын тулгалт).
 *
 * ⚠️ ЭНЭ НЬ ГҮЙЦЭТГЭЛИЙН 4 ШАТАТ УРСГАЛЫН (`hyanalt.ts`) ХУУЛБАР БИШ.
 * Зураглал дээр 3, 4а, 4б алхам нь ЗЭРЭГЦЭЭ: ТУХ (инженер+менежер), Чанарын
 * хэлтэс, ХАБЭА гурав НЭГ ДОР хянаж тус тусдаа санал өгнө; 5-р алхамд тэдгээр
 * нэгтгэгдэж «зөвшөөрсөн эсвэл татгалзсан» болно. Гүйцэтгэлийн урсгал шиг
 * «инженер → менежер → захирал» гэсэн дараалал БАЙХГҮЙ. Тиймээс:
 *   · Төлөв нь «хэн хянаж байна» биш «ХЭД НЬ хянасан» гэсэн утгатай.
 *   · Буцаалт нь НЭГ АЛХАМ УХРАХГҮЙ — 6-р алхамаар шууд ГҮЙЦЭТГЭГЧ рүү очиж,
 *     сайжруулаад ДАХИН ирүүлнэ (2-р алхамаас эхнээс).
 *
 * ⚠️ 2026-09-28: ТӨРӨЛ БҮР ӨӨР ХЯНАГЧИЙН ОЛОНЛОГТОЙ (`REVIEWERS_OF`):
 *   MS · QMP · PRC — tuh · chanar · habea ЗЭРЭГЦЭЭ (зураглал, өөрчлөгдөөгүй)
 *   MA  — cheng → chanar → tug ДАРААЛСАН (2-р үе шат, хариу маягтын гарын
 *         үсэг: «Боловсруулсан — ЧХ хяналтын инженер · Зөвшөөрсөн — ЧХ менежер ·
 *         Танилцсан — ТУГ ТМ»; ТУХ/ХАБЭА-н гарын үсэг маягтад ҮГҮЙ)
 *   MIR · FIC — tuh ЭХЛЭЭД, дараа нь chanar (маягтын гарын үсгийн дараалал:
 *         гүйцэтгэгчийн QC → захиалагчийн хяналтын инженер → чанарын инженер)
 *   NCR — tuh · chanar · tug ЗЭРЭГЦЭЭ, гүйцэтгэгчийн залруулгын тайлан ирсний
 *         ДАРАА (практикт ТМ · ЧМ · ХИ гурав хянадаг)
 *   Урьд «ТУГ шийдвэр гаргахгүй» гэж бичсэн нь MS-ийн зураглалд л үнэн —
 *   MA-ийн хариу маягтад ТУГ-ийн гарын үсэг байдаг тул `tug` үүрэг нэмэгдэв.
 *
 * ⚠️ ХУВИЛБАР (`rev`) — жишээ материалын `-00`, `-01`, `-02` ЯГ ЭНЭ. Буцаагдаад
 * дахин ирүүлэх бүрд `rev + 1` бөгөөд ХУУЧИН мөр УСТГАГДАХГҮЙ (түүх). Баримт
 * дээрх «Өөрчлөлтийн түүх» хүснэгт эндээс автоматаар гарна. NCR-д rev ҮГҮЙ.
 * ⚠️ 2026-09-28 (2-р үе шат): БАТЛАГДСАНААС ч шинэ хувилбар гарна (`newRevision`
 *    — нийлүүлэгч нэмэх/солих нь практикийн хамгийн түгээмэл rev). rev > 0 бүх
 *    илгээлтэд `revNote` ЗААВАЛ; `body.revHistory[]` автомат хуримтлагдана.
 *
 * ⚠️ ДУГААР АВТОМАТ. Жишээ 257 файлын 88 нь кодоо буруу бичсэн (MONCON багцаа
 * бүхэлдээ мартсан, 17 файлд кирилл «МА» орсон, 10 бүлэг давхардсан) —
 * гараар бичдэг учраас. Энд дугаар нь ЗӨВХӨН `docNo()`-оос гарна.
 *
 * ⚠️ React импортлохгүй, сүлжээ дуудахгүй — `chanarMs.check.mjs` шууд Node
 * дээр ачаална. БҮХ экспорт ЦЭВЭР функц. Хадгалалт нь `chanarStore.ts`-д.
 *
 * ⚠️ 2026-09-28 (2-р үе шат): СХЕМ ӨӨРЧЛӨГДӨӨГҮЙ — бүх шинэ талбар `body`
 *    (`aguulga`) ба `hyanalt` JSON дотор. ӨНӨӨДӨР үүссэн мөрүүд (cheng-гүй
 *    reviews, `owner` мөр, шинэ талбаргүй материал) ХЭВЭЭР уншигдана —
 *    `normalize*` бүгд хуучин JSON-д тэсвэртэй.
 */

/* ⚠️ 2026-09-25: татгалзлын зурвас хэрэглэгчид шууд харагддаг тул `tr()`.
   `i18nCore` нь React-гүй, 'use client'-гүй — Node тест хэвээр ачаална;
   mn дээр түлхүүрээ буцаадаг тул тестийн монгол `match` хөндөгдөхгүй. */
import { t as tr } from '@/lib/i18nCore';

/* ════════════════════════ ТӨРӨЛ ════════════════════════ */

/**
 * Баримтын долоон төрөл — `turul` багана, `docNo`-ийн дунд хэсэг.
 * ⚠️ 2026-09-28: QMP (Чанарын удирдлагын төлөвлөгөө) · PRC (Процедур) — бүртгэлд
 *    байсан ч кодод үгүй байсан; MS-тэй ИЖИЛ урсгал, хянагч, бие (`MsBody`).
 */
export const KINDS = ['MS', 'MA', 'MIR', 'FIC', 'NCR', 'QMP', 'PRC'] as const;
export type DocKind = (typeof KINDS)[number];
/** Үзлэгийн хоёр төрөл — ижил бие (`InspBody`), ижил дараалсан хянагч */
export type InspKind = 'MIR' | 'FIC';
/** MS-ийн биетэй (6 текст хэсэг) гурван төрөл */
export const MS_LIKE: readonly DocKind[] = ['MS', 'QMP', 'PRC'];
export const isMsLike = (kind: DocKind): boolean => MS_LIKE.includes(kind);

export const isKind = (x: unknown): x is DocKind =>
  typeof x === 'string' && (KINDS as readonly string[]).includes(x);

/** Төрлийн монгол нэр — таб, карт (зурагдах агшинд) */
export function kindLabel(kind: DocKind): string {
  if (kind === 'MS') return tr('Аргачлал');
  if (kind === 'MA') return tr('Материал');
  if (kind === 'MIR') return tr('Материалын үзлэг');
  if (kind === 'FIC') return tr('Талбайн үзлэг');
  if (kind === 'QMP') return tr('Чанарын удирдлагын төлөвлөгөө');
  if (kind === 'PRC') return tr('Процедур');
  return tr('Үл тохирол');
}

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
export const ALL_REVIEWERS = ['tuh', 'chanar', 'habea', 'tug', 'cheng'] as const;
export type Reviewer = (typeof ALL_REVIEWERS)[number];

/** Хянагчийн үүргийн товч нэр — алдааны зурвас, дараалсан урсгалын заавар */
export function reviewerLabel(r: Reviewer): string {
  if (r === 'tuh') return tr('захиалагчийн хяналтын инженер (ТУХ)');
  if (r === 'chanar') return tr('Чанарын хэлтсийн менежер');
  if (r === 'habea') return tr('ХАБЭА');
  if (r === 'tug') return tr('ТУГ төслийн менежер');
  return tr('Чанарын хэлтсийн хяналтын инженер');
}

/**
 * MS-ийн ГУРВАН ХЯНАГЧ — зураглалын 3 · 4а · 4б эгнээ.
 * ⚠️ ДАРААЛАЛ ҮГҮЙ — гурвуулаа зэрэг. Массивын дараалал нь зөвхөн дэлгэц.
 * ⚠️ Нэр хэвээр (`REVIEWERS`) — `Chanar.tsx` MS-ийн баганыг үүгээр зурдаг.
 */
export const REVIEWERS = ['tuh', 'chanar', 'habea'] as const;

/**
 * ТӨРӨЛ БҮРИЙН ХЯНАГЧ. `SEQUENTIAL_KINDS`-д орсон бол массивын ДАРААЛЛААР —
 * дараагийнх нь өмнөх шийдвэрлэсний дараа л үйлдэл хийнэ
 * (MIR/FIC: tuh → chanar; MA: cheng → chanar → tug).
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
export const SEQUENTIAL_KINDS: readonly DocKind[] = ['MIR', 'FIC', 'MA'];

export const isReviewer = (x: unknown): x is Reviewer =>
  typeof x === 'string' && (ALL_REVIEWERS as readonly string[]).includes(x);

/* ════════════════════════ ТӨЛӨВ ════════════════════════ */

/**
 * Баримтын төлөв — ӨГӨГДӨЛ тул ОРЧУУЛАХГҮЙ (`hyanalt.STATUS`-тэй ижил дүрэм).
 *
 *   draft     — гүйцэтгэгч бичиж байна, хэнд ч харагдахгүй (1-р алхам)
 *   review    — ирүүлсэн, хянагчид хянаж байна (2 → 3 · 4а · 4б)
 *   returned  — аль нэг хянагч татгалзсан → гүйцэтгэгчид (5 → 6)
 *   approved  — БҮХ хянагч зөвшөөрсөн (5 → 7 → 8 → 9)
 *
 * ⚠️ NCR ижил 4 УТГЫГ хэрэглэнэ, ШОШГО нь өөр (`statusLabel`): review =
 *    «Гүйцэтгэгчид илгээсэн», returned = «Нэмэлт арга хэмжээ шаардлагатай»
 *    (бүртгэлийн 3-р статус, 2026-09-28), approved = «Хаагдсан».
 */
export const MS_STATUS = {
  draft: 'Ноорог',
  review: 'Хянагдаж байна',
  returned: 'Буцаагдсан',
  approved: 'Батлагдсан',
} as const;
export type MsStatus = (typeof MS_STATUS)[keyof typeof MS_STATUS];

export const isMsStatus = (x: unknown): x is MsStatus =>
  typeof x === 'string' && (Object.values(MS_STATUS) as string[]).includes(x);

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
 * NCR-ийн ХААЛТЫН СТАТУС — бүртгэлийн «Биелэлтийн статус» багана (2026-09-28):
 * «Хаагдсан · Дахин нээсэн · Нэмэлт арга хэмжээ шаардлагатай». Хаагдаагүй
 * бусад төлөвт `statusLabel`.
 */
export function ncrClosureStatusLabel(status: MsStatus, reopened: number): string {
  if (status === MS_STATUS.approved) return tr('Хаагдсан');
  if (status === MS_STATUS.returned) return tr('Нэмэлт арга хэмжээ шаардлагатай');
  if (reopened > 0) return tr('Дахин нээсэн');
  return statusLabel('NCR', status);
}

/**
 * Хянагчийн шийдвэр — өгөгдөл, орчуулахгүй.
 * ⚠️ 2026-09-28: `note` = «Санал бүхий зөвшөөрсөн» (Approved as noted, AN) —
 *    практикийн A/AN/R гурвал. AN нь ЗӨВШӨӨРӨЛ (approved руу тоологдоно), гэхдээ
 *    санал ЗААВАЛ. Хуучин мөрийн 2 утга хэвээр уншигдана. NCR-д AN = Concession
 *    («Зөвшөөрлийн үндсэн дээр хаагдсан»).
 * ⚠️ 2-р үе шат: AN нь НЭЭЛТТЭЙ — нөхцөл биелэхэд хянагч `closeAn`-аар A болгож
 *    хаана (практикт «AN → A хаалт» хариу rev+1 гардаг).
 */
export const VERDICT = {
  approve: 'Зөвшөөрсөн',
  note: 'Санал бүхий зөвшөөрсөн',
  return: 'Татгалзсан',
} as const;
export type Verdict = (typeof VERDICT)[keyof typeof VERDICT];
export type VerdictCode = 'A' | 'AN' | 'R';

export const isVerdict = (x: unknown): x is Verdict =>
  typeof x === 'string' && (Object.values(VERDICT) as string[]).includes(x);
export const isVerdictCode = (x: unknown): x is VerdictCode => x === 'A' || x === 'AN' || x === 'R';

/** Шийдвэрийн товч код — хариу маягтын «+» багана */
export const verdictCode = (v: Verdict): VerdictCode =>
  (v === VERDICT.approve ? 'A' : v === VERDICT.note ? 'AN' : 'R');
/** Код → өгөгдлийн утга */
export const verdictOf = (c: VerdictCode): Verdict =>
  (c === 'A' ? VERDICT.approve : c === 'AN' ? VERDICT.note : VERDICT.return);

/**
 * Шийдвэрийн шошго — төрлөөр (2026-09-28 маягтын үгээр):
 *   MA/MS: «Батлав (A)» · «Тайлбартай батлав (AN)» · «Татгалзсан (R)»
 *   NCR:   «Зөвшөөрсөн» · «Зөвшөөрлийн үндсэн дээр» · «Татгалзсан»
 */
export function verdictLabel(v: Verdict | VerdictCode, kind: DocKind = 'MS'): string {
  const c = isVerdictCode(v) ? v : verdictCode(v);
  if (kind === 'NCR') {
    if (c === 'A') return tr('Зөвшөөрсөн');
    if (c === 'AN') return tr('Зөвшөөрлийн үндсэн дээр');
    return tr('Татгалзсан');
  }
  if (c === 'A') return tr('Батлав (A)');
  if (c === 'AN') return tr('Тайлбартай батлав (AN)');
  return tr('Татгалзсан (R)');
}

/** REP (захиалагчийн хариу) хэвлэлийн шийдвэрийн үг — 2026-04 маягтын хос хэл */
export function repVerdictText(c: VerdictCode): string {
  if (c === 'A') return tr('Татгалзаагүй мэдэгдэл /Approved and Proceed');
  if (c === 'AN') return tr('Санал бүхий татгалзаагүй мэдэгдэл /Approved as noted');
  return tr('Татгалзсан мэдэгдэл /Rejected');
}

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

/**
 * ⚠️ 2026-09-25: `undefined` = JSON-д ТҮЛХҮҮР ӨӨРӨӨ БАЙХГҮЙ (хуучин мөр — тухайн үүрэг
 *    урсгалд ороогүй үед илгээгдсэн), `null` = үүрэг бий, шийдвэр хараахан үгүй.
 *    `requiredReviewers` дараалсан төрөлд `undefined` слотыг тоолохгүй;
 *    `JSON.stringify` `undefined`-ийг хаядаг тул хуучин мөр хуучин хэвээр үлдэнэ.
 */
export type Reviews = Record<Reviewer, Review | null | undefined>;

/** Хянагчийн санал/шалтгаан · буцаалтын тайлбар · AN хаалтын тэмдэглэлийн ДЭЭД урт (тэмдэгт) */
export const NOTE_MAX = 1500;
/** Хариу (`rep.anText` · `rReasons`) дахь нэг саналын хураангуй урт — бүтэн текст `reviews[r].note`-д */
export const REP_NOTE_MAX = 300;
/**
 * ⚠️ 2026-09-25: `hyanalt` багана 8000 тэмдэгт (`chanarStore` хүснэгтийн тодорхойлолт).
 *    Урьд нь саналын уртад хязгаар үгүй, дээр нь `repFrom` бүх саналыг `anText`/
 *    `rReasons`-д ДАВХАРЛАН хуулдаг тул нэг урт санал бичилтийг чимээгүй унагадаг байв.
 *    Одоо санал ≤ NOTE_MAX, хариунд хураангуй (≤ REP_NOTE_MAX) — 3 хянагч × 1500 +
 *    хариу + материалын шийдвэр 8000-д багтана.
 */
const clipNote = (s: string, max = REP_NOTE_MAX): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * «ХЯНАХГҮЙ БУЦААХ» — формат буруу / бүрдэл дутуу (2026-09-28: бүртгэлд 10 мөр
 * REP-гүй буцаагдсан). `hyanalt` JSON-д `bounce` түлхүүрээр (жагсаалтад тэмдэг),
 * мөн `body.bounces[]`-д түүх.
 */
export type BounceReason = 'format' | 'incomplete';
export type Bounce = { at: number; by: string; reason: BounceReason; note: string };
export function bounceLabel(r: BounceReason): string {
  return r === 'format' ? tr('Буцаасан (формат)') : tr('Буцаасан (бүрдэл дутуу)');
}

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
 *
 * ⚠️ `payload` (баримтын БИЕ) ЭНД БАЙХГҮЙ: жагсаалт хөнгөн байх ёстой
 *    (`huvaariBatlah.HEAD_FIELDS`-ийн ижил шалтгаан). Биеийг тусад нь татна.
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

/** Хоцролт (хоног) = decidedAt − sentAt; шийдвэргүй бол `now`-оос. Илгээгээгүй → null */
export function delayDays(doc: Pick<MsDoc, 'sentAt' | 'decidedAt'>, now = Date.now()): number | null {
  if (!doc.sentAt) return null;
  const end = doc.decidedAt ?? now;
  return Math.max(0, Math.floor((end - doc.sentAt) / 86_400_000));
}

/** AN-тай батлагдсан баримт НЭЭЛТТЭЙ (нөхцөл биелээгүй) — `closeAn` хийгдээгүй */
export const isAnOpen = (doc: Pick<MsDoc, 'status' | 'rep'>): boolean =>
  doc.status === MS_STATUS.approved && doc.rep?.verdict === 'AN';

/* ════════════════════════ БИЕ ════════════════════════ */

/** Мэргэжлийн чиглэл — Багц 6.2 submittal маягтын 7 сонголт */
export const DISCIPLINES = ['Civil', 'Structural', 'Electrical', 'Mechanical', 'Water', 'ICT', 'Architectural'] as const;

/**
 * НИЙТЛЭГ МЕТА (бүх төрлийн `body.meta`) — бүртгэлийн xlsx-ийн багана.
 *   preparedAt   — боловсруулсан огноо (зохиогч; анхдагч = үүсгэсэн өдөр)
 *   owners       — ХАРИУЦСАН АЖИЛТАН 1–2 (захиалагчийн хянагч сонгоно)
 *   owner        — ⚠️ ХУУЧИН талбар = `owners[0]` (уншихад хоёуланг авна,
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
export const EMPTY_META: Meta = {
  preparedAt: null, owner: null, owners: [], category: '', workType: null,
  pageCount: null, projectTitle: '', contractNo: '', discipline: [], note: '',
};

/** Хувилбарын түүхийн мөр — `body.revHistory[]` (2026-09-28) */
export type RevEntry = { rev: number; at: number; reason: string; by: string };

/**
 * БҮХ БИЕД НИЙТЛЭГ хувилбар/буцаалтын талбарууд (2026-09-28).
 * ⚠️ MS-ийн биед (`MsBody`) ОРОХГҮЙ — `keyof MsBody` = 6 текст хэсэг; MS-д
 *    `AnyBody`-ийн сонголтот талбар (`{ ...body, meta, revHistory }`).
 */
export type BodyCommon = {
  /** Энэ хувилбарын шалтгаан — rev > 0 илгээхэд ЗААВАЛ */
  revNote: string;
  revHistory: RevEntry[];
  bounces: Bounce[];
};
export const EMPTY_COMMON: BodyCommon = { revNote: '', revHistory: [], bounces: [] };

/**
 * АРГАЧЛАЛЫН БИЕ — жишээ маягтын 6 хэсэг (MSC-SLB-MS-P0303-0001-00, хуудас 3).
 * Бүгд ЧӨЛӨӨТ ТЕКСТ — маягт нь хэлбэржсэн ч агуулга нь ажил бүрд өөр.
 * ⚠️ `meta` ЭНД ОРОХГҮЙ (`keyof MsBody` = 6 текст хэсэг, `Chanar.tsx` үүгээр
 *    зурдаг) — MS-ийн мета `parseMeta(raw)`-аар тусад нь, бичихдээ
 *    `{ ...body, meta }` (`AnyBody`). QMP · PRC мөн энэ бие.
 */
export type MsBody = {
  /** 1. Ерөнхий агуулга — зорилго, холбогдох баримт, үүрэг хариуцлага, багийн бүтэц */
  general: string;
  /** 2. Ажлын цар хүрээ — цар хүрээ, төлөвлөгөө ба ажиллах хүч, багаж тоног төхөөрөмж */
  scope: string;
  /** 3. Бараа материал, тээвэрлэлт */
  materials: string;
  /** 4. Ажлын дараалал — алхам бүр */
  sequence: string;
  /** 5. Чанарын хяналт */
  quality: string;
  /** 6. Аюулгүй ажиллагааны хяналт */
  safety: string;
};

export const EMPTY_BODY: MsBody = {
  general: '', scope: '', materials: '', sequence: '', quality: '', safety: '',
};

/* ── MA ── */

/**
 * НЭГ МАТЕРИАЛ — 2026-09-28 (2-р үе шат): практикийн хүснэгтийн баганууд бүгд
 * СОНГОЛТ (хоосон мөр). `verdict`/`locked` нь хянагчийн бичилт:
 * ⚠️ `locked: true` = өмнөх хувилбарт A/AN болсон — ДАХИН ХЯНАГДАХГҮЙ, шийдвэр
 *    хэвээр; зөвхөн R материал шинэ хувилбарт хянагдана (`nextRevisionBody`).
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
export const EMPTY_MATERIAL: MaMaterial = {
  name: '', category: '', standard: '', manufacturer: '', supplier: '', origin: null, note: '',
  brand: '', model: '', size: '', unit: '', qty: '', stage: '', location: '', drawingNo: '',
  designStd: '', equivStd: '', designReq: '', proposed: '', meets: null, arrivedAt: null,
  certNo: '', pageRef: '', verdict: null, locked: false,
};

/** «MA Submittal's appendix» бүрдэл — 9 + 2 (дотоод/гадаад 2-оос доошгүй үйлдвэрлэгч) */
export const MA_CHECKLIST = [
  'manufacturerIntro', 'materialList', 'techSpec', 'license', 'qualityCert',
  'conformityCert', 'sample', 'translation', 'labTest', 'domesticTwo', 'foreignTwo',
] as const;
export type MaCheckKey = (typeof MA_CHECKLIST)[number];

/** Шошго — маягтын үгээр (2026-09-28) */
export function maCheckLabel(k: MaCheckKey): string {
  if (k === 'manufacturerIntro') return tr('Үйлдвэрлэгч болон нийлүүлэгчийн танилцуулга');
  if (k === 'materialList') return tr('Материалын жагсаалт (зураг төсөл ба техникийн шаардлагатай харьцуулсан үзүүлэлтийн хамт)');
  if (k === 'techSpec') return tr('Материалын техник үзүүлэлт');
  if (k === 'license') return tr('Үйлдвэрлэгчийн тусгай зөвшөөрөл, бусад мэдээлэл');
  if (k === 'qualityCert') return tr('Чанарын гэрчилгээ');
  if (k === 'conformityCert') return tr('Тохирлын гэрчилгээ');
  if (k === 'sample') return tr('Загвар, сорьц (Sample)');
  if (k === 'translation') return tr('Баталгаат орчуулга');
  if (k === 'labTest') return tr('Итгэмжлэгдсэн лабораторын шинжилгээний дүн (Lab test result)');
  if (k === 'domesticTwo') return tr('Дотоодын 2-оос доошгүй үйлдвэрлэгч, нийлүүлэгчийн санал');
  return tr('Гадаадын 2-оос доошгүй үйлдвэрлэгч, нийлүүлэгчийн санал');
}

/** Бүрдлийн хэсгийн анхааруулга — маягтын доод тайлбар */
export const maChecklistWarning = (): string =>
  tr('Дотоодын болон гадаадын тус бүр 2-оос доошгүй үйлдвэрлэгч, нийлүүлэгчийн саналыг харьцуулан ирүүлнэ. Бүрдэл дутуу бол хянахгүй буцаана.');

/** Гарын үсгийн мөр — нэр · албан тушаал · байгууллага · огноо (хоосон байж болно) */
export type Sig = { name: string; position: string; org: string; date: number | null };
export const EMPTY_SIG: Sig = { name: '', position: '', org: '', date: null };

/** Submittal төрөл — Багц 6.2 дамжуулах маягт */
export const SUBMITTAL_TYPES = ['plan', 'spec', 'subcontractor', 'ma', 'shopDrawing', 'ms', 'opManual'] as const;
export type SubmittalType = (typeof SUBMITTAL_TYPES)[number];
export function submittalTypeLabel(t: SubmittalType): string {
  if (t === 'plan') return tr('Төлөвлөгөө (Plan)');
  if (t === 'spec') return tr('Техникийн тодорхойлолт (Spec)');
  if (t === 'subcontractor') return tr('Туслан гүйцэтгэгч');
  if (t === 'ma') return tr('Материал баталгаажуулалт (MA)');
  if (t === 'shopDrawing') return tr('Ажлын зураг (Shop drawing)');
  if (t === 'ms') return tr('Ажлын аргачлал (MS)');
  return tr('Ашиглалтын заавар (Operation manual)');
}

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

export const EMPTY_MA: MaBody = {
  ...EMPTY_COMMON,
  meta: { ...EMPTY_META },
  materials: [],
  checklist: {
    manufacturerIntro: false, materialList: false, techSpec: false, license: false,
    qualityCert: false, conformityCert: false, sample: false, translation: false, labTest: false,
    domesticTwo: false, foreignTwo: false,
  },
  costImpact: false, timeImpact: false, drawingsMatch: null, drawings: [],
  scope: '', manufacturer: '', intro: '', standards: '', sample: '', storage: '', transport: '',
  techSpec: '', purpose: '',
  signatures: { prepared: { ...EMPTY_SIG }, reviewed: { ...EMPTY_SIG }, reviewed2: { ...EMPTY_SIG }, approved: { ...EMPTY_SIG } },
  subcontractor: '', blocks: [], attachments: [], refs: [], submittalType: null,
};

/* ── MIR · FIC ── */

/** Шалгах мөрийн утга — маягтын OK / N/A / X (initial-аар) */
export type InspCheck = 'OK' | 'NA' | 'X';
export const isInspCheck = (x: unknown): x is InspCheck => x === 'OK' || x === 'NA' || x === 'X';

export type InspItem = {
  no: number;
  text: string;
  /** Маягтын бүлгийн гарчиг (бетон: «ТӨМӨР БЕТОН ХИЙЦЛЭЛ» …) — `null` бол бүлэггүй */
  section: string | null;
  /** Гүйцэтгэгчийн QC багана — зохиогч бөглөнө */
  contractor: InspCheck | null;
  /** Захиалагчийн багана — `tuh` хянагч бөглөнө (`saveClientChecks`) */
  client: InspCheck | null;
  comment: string;
};

/** Үзлэгийн хавсралтын түлхүүр — загвар бүрд өөр олонлог (`chanarTemplates.InspTemplate.attachments`) */
export const INSP_ATTACH_KEYS = ['labTest', 'qualityCert', 'photo', 'survey', 'cubes', 'other'] as const;
export type InspAttachKey = (typeof INSP_ATTACH_KEYS)[number];
export function inspAttachLabel(k: InspAttachKey): string {
  if (k === 'labTest') return tr('Лабораторийн туршилтын дүн');
  if (k === 'qualityCert') return tr('Чанарын гэрчилгээ');
  if (k === 'photo') return tr('Фото');
  if (k === 'survey') return tr('Геодезийн хэмжилт');
  if (k === 'cubes') return tr('Бетон шоо (сорьц)');
  return tr('Бусад');
}

export type InspBody = BodyCommon & {
  meta: Meta;
  /**
   * Толгой — барилга; `materialName` MIR-д (Материалын нэр, гарчгаас тусдаа).
   * ⚠️ `location` ХУУЧИН — маягтад «Байршил» талбар ҮГҮЙ (2026-09-28 тулгалт);
   *    UI-д зурахгүй, зөвхөн хуучин JSON-оос уншиж хадгална. Дараагийн үе шатанд устгана.
   */
  header: { building: string; location: string; materialName: string };
  /** Сонгосон загвар (`chanarTemplates` түлхүүр) — хавсралтын олонлог, «Гүйцэтгэл» хэсэг үүгээр */
  template: string;
  items: InspItem[];
  /** 2. Гүйцэтгэл — тоо хэмжээ (материал бүрд өөр багана тул текст); худаг FIC-д ҮГҮЙ */
  quantity: string;
  /** 3. Нэмэлт тайлбар, залруулах арга хэмжээ */
  remarks: string;
  attachments: Record<InspAttachKey, boolean>;
  /** MIR: батлагдсан MA-ийн docNo (чөлөөт текст ч болно) */
  maRef: string;
};

export const EMPTY_INSP: InspBody = {
  ...EMPTY_COMMON,
  meta: { ...EMPTY_META },
  header: { building: '', location: '', materialName: '' },
  template: '',
  items: [],
  quantity: '', remarks: '',
  attachments: { labTest: false, qualityCert: false, photo: false, survey: false, cubes: false, other: false },
  maRef: '',
};

/**
 * Үзлэгийн ДҮН — талбар биш, бодогдоно: аль нэг багана X → `fail`; бүх мөрийн
 * захиалагчийн багана OK/NA → `pass`; бусад → `pending`. Мөргүй → `pending`.
 * ⚠️ 2026-09-28: Багц 6.2-т захиалагчийн багана ХООСОН, гарын үсгээр батлагддаг —
 *    `opts.tuhVerdict` A/AN эсвэл `opts.approved` бол «Тэнцсэн» (X байхгүй үед).
 */
export function inspResult(
  items: readonly InspItem[],
  opts: { tuhVerdict?: VerdictCode | Verdict | null; approved?: boolean } = {},
): 'pass' | 'fail' | 'pending' {
  if (items.some((i) => i.contractor === 'X' || i.client === 'X')) return 'fail';
  const tv = opts.tuhVerdict == null ? null : isVerdictCode(opts.tuhVerdict) ? opts.tuhVerdict : verdictCode(opts.tuhVerdict);
  if (opts.approved || tv === 'A' || tv === 'AN') return 'pass';
  if (!items.length) return 'pending';
  return items.every((i) => i.client === 'OK' || i.client === 'NA') ? 'pass' : 'pending';
}

/* ── NCR ── */

export const NCR_SEVERITY = ['minor', 'major', 'critical'] as const;
export type NcrSeverity = (typeof NCR_SEVERITY)[number];
/** Маягтын үгээр (2026-09-28): Жижиг · Том · Ноцтой */
export function ncrSeverityLabel(s: NcrSeverity): string {
  if (s === 'minor') return tr('Жижиг');
  if (s === 'major') return tr('Том');
  return tr('Ноцтой');
}

export const NCR_TYPES = [
  'design', 'procurement', 'logistics', 'installation', 'operation',
  'repair', 'postDelivery', 'legal', 'contract', 'other',
] as const;
export type NcrType = (typeof NCR_TYPES)[number];
/** Маягтын үгээр (2026-09-28) — «-ын/-ийн» дагавартай */
export function ncrTypeLabel(t: NcrType): string {
  if (t === 'design') return tr('Зураг төслийн');
  if (t === 'procurement') return tr('Худалдан авалтын');
  if (t === 'logistics') return tr('Тээврийн логистикийн');
  if (t === 'installation') return tr('Угсралтын');
  if (t === 'operation') return tr('Ашиглалтын');
  if (t === 'repair') return tr('Засварын');
  if (t === 'postDelivery') return tr('Нийлүүлэлтийн дараах');
  if (t === 'legal') return tr('Хуулийн ба зохицуулалтын');
  if (t === 'contract') return tr('Гэрээний');
  return tr('Бусад');
}

export const NCR_PROPOSED = ['repair', 'redo', 'useAsIs', 'scrap', 'negotiate', 'other'] as const;
export type NcrProposed = (typeof NCR_PROPOSED)[number];
/** Маягтын үгээр (2026-09-28) */
export function ncrProposedLabel(p: NcrProposed): string {
  if (p === 'repair') return tr('Засварлах');
  if (p === 'redo') return tr('Дахин шинээр хийх');
  if (p === 'useAsIs') return tr('Хэвээр нь ашиглах');
  if (p === 'scrap') return tr('Ашиглахгүй байх, устгах');
  if (p === 'negotiate') return tr('Зөвшилцөх');
  return tr('Бусад');
}

/** Хаасан баримтын төрөл (бүртгэлийн багана) */
export const NCR_CLOSURE_DOC_TYPES = ['method', 'report'] as const;
export type NcrClosureDocType = (typeof NCR_CLOSURE_DOC_TYPES)[number];
export const ncrClosureDocTypeLabel = (t: NcrClosureDocType): string =>
  (t === 'method' ? tr('Аргачлал') : tr('Тайлан'));
/** Биелэлтийн үр дүн */
export const NCR_CLOSURE_RESULTS = ['ok', 'notOk'] as const;
export type NcrClosureResult = (typeof NCR_CLOSURE_RESULTS)[number];
export const ncrClosureResultLabel = (r: NcrClosureResult): string =>
  (r === 'ok' ? tr('Хангалттай') : tr('Хангалтгүй'));

export type NcrCorrection = { text: string; completedAt: number | null; steps: string[] };

/** Гүйцэтгэгчийн «Хаасан» мөр (БУ менежер · чанарын инженер) */
export type NcrCloser = { name: string; position: string; date: number | null };

/**
 * ХААЛТ — `verifiedBy/verifiedAt` захиалагч (approved болмогц автомат), бусад нь
 * бүртгэлийн баганууд: гүйцэтгэгч `closeNcr`-оор бөглөнө (2026-09-28).
 */
export type NcrClosure = {
  completedAt: number | null;
  verifiedBy: string;
  verifiedAt: number;
  docType: NcrClosureDocType | null;
  action: NcrProposed | null;
  result: NcrClosureResult | null;
  closedByContractor: NcrCloser[];
  archive: { original: boolean; server: boolean; backup: boolean };
};

export type NcrPhoto = { no: string; location: string; note: string };

export type NcrBody = BodyCommon & {
  meta: Meta;
  subject: string;
  contractNo: string;
  location: string;
  building: string;
  issuedAt: number | null;
  /** Хариу ирүүлэх огноо (deadline) */
  dueAt: number | null;
  description: string;
  attachments: { photo: boolean; markup: boolean; mirCopy: boolean; checklist: boolean; testResult: boolean };
  severity: NcrSeverity | null;
  types: NcrType[];
  proposed: NcrProposed[];
  proposedText: string;
  /** Холбогдох MIR/FIC docNo */
  mirRef: string;
  /**
   * АНХНЫ ДҮГНЭЛТ — маягтын 4-р хэсэг НЭЭХ өдөр тэмдэглэгддэг (анхдагч R =
   * Rejected; A = Accepted, AN = Concession); `initialReviewedBy` — ТМ.
   * Урсгалын дараах дүгнэлт нь «Залруулгын тайлангийн хяналт» (reviews).
   */
  initialVerdict: VerdictCode;
  initialReviewedBy: string;
  /** Бүртгэлийн баганууд (2026-09-28) */
  contractName: string;
  generalContractor: string;
  subcontractor: string;
  toWhom: string;
  fromWhom: string;
  /** «Зураг, тайлбар» хүснэгт */
  photos: NcrPhoto[];
  /** Гүйцэтгэгчийн «Үл тохирол залруулсан тайлан» */
  correction: NcrCorrection;
  /** Залруулгын тайлан илгээгдсэн агшин — `null` бол хянагч үйлдэл хийж ЧАДАХГҮЙ */
  correctionAt: number | null;
  /** Хаалт — approved болмогц автоматаар */
  closure: NcrClosure | null;
  /** Дахин нээсэн тоо */
  reopened: number;
};

export const EMPTY_NCR: NcrBody = {
  ...EMPTY_COMMON,
  meta: { ...EMPTY_META },
  subject: '', contractNo: '', location: '', building: '',
  issuedAt: null, dueAt: null, description: '',
  attachments: { photo: false, markup: false, mirCopy: false, checklist: false, testResult: false },
  severity: null, types: [], proposed: [], proposedText: '', mirRef: '',
  initialVerdict: 'R', initialReviewedBy: '',
  contractName: '', generalContractor: '', subcontractor: '', toWhom: '', fromWhom: '', photos: [],
  correction: { text: '', completedAt: null, steps: [] },
  correctionAt: null, closure: null, reopened: 0,
};

/** Аль ч төрлийн бие — `chanarStore` бичихдээ ийм авна */
export type AnyBody = (MsBody & { meta?: Meta } & Partial<BodyCommon>) | MaBody | InspBody | NcrBody;

/** Төрөл → хоосон бие */
export function emptyBodyOf(kind: DocKind): AnyBody {
  if (kind === 'MA') return structuredClone(EMPTY_MA);
  if (kind === 'MIR' || kind === 'FIC') return structuredClone(EMPTY_INSP);
  if (kind === 'NCR') return structuredClone(EMPTY_NCR);
  return { ...EMPTY_BODY, meta: { ...EMPTY_META }, ...structuredClone(EMPTY_COMMON) };
}

/* ── parse / normalize — хуучин JSON-д тэсвэртэй ── */

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const bool = (v: unknown): boolean => v === true;
const numOrNull = (v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
};
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const userArr = (v: unknown): string[] =>
  [...new Set(strArr(v).map((x) => x.trim().toLowerCase()).filter(Boolean))];

export function normalizeMeta(raw: unknown): Meta {
  const j = obj(raw);
  /* ⚠️ `owners[]` ба хуучин `owner` мөр хоёуланг нэгтгэнэ — `owner` = эхнийх */
  const owners = userArr(j.owners);
  const legacy = str(j.owner).trim().toLowerCase();
  if (legacy && !owners.includes(legacy)) owners.unshift(legacy);
  const pc = Number(j.pageCount);
  return {
    preparedAt: numOrNull(j.preparedAt),
    owner: owners[0] ?? null,
    owners: owners.slice(0, 2),
    category: str(j.category),
    workType: str(j.workType) || null,
    pageCount: Number.isInteger(pc) && pc > 0 ? pc : null,
    projectTitle: str(j.projectTitle),
    contractNo: str(j.contractNo),
    discipline: strArr(j.discipline),
    note: str(j.note),
  };
}

function normalizeCommon(j: J): BodyCommon {
  const revHistory = (Array.isArray(j.revHistory) ? j.revHistory : []).map((e): RevEntry | null => {
    const x = obj(e);
    const rev = Number(x.rev); const at = numOrNull(x.at);
    if (!Number.isInteger(rev) || rev < 0 || !at) return null;
    return { rev, at, reason: str(x.reason), by: str(x.by).toLowerCase() };
  }).filter((e): e is RevEntry => e != null);
  return { revNote: str(j.revNote), revHistory, bounces: normalizeBounces(j.bounces) };
}

export function normalizeBounce(raw: unknown): Bounce | null {
  const x = obj(raw);
  const at = numOrNull(x.at); const by = str(x.by).trim().toLowerCase();
  const reason = x.reason === 'format' || x.reason === 'incomplete' ? x.reason : null;
  if (!at || !by || !reason) return null;
  return { at, by, reason, note: str(x.note) };
}
const normalizeBounces = (v: unknown): Bounce[] =>
  (Array.isArray(v) ? v : []).map(normalizeBounce).filter((b): b is Bounce => b != null);

export function normalizeMs(raw: unknown): MsBody {
  const j = obj(raw);
  return {
    general: str(j.general), scope: str(j.scope), materials: str(j.materials),
    sequence: str(j.sequence), quality: str(j.quality), safety: str(j.safety),
  };
}

function normalizeSig(raw: unknown): Sig {
  const x = obj(raw);
  return { name: str(x.name), position: str(x.position), org: str(x.org), date: numOrNull(x.date) };
}

export function normalizeMaterial(m: unknown): MaMaterial {
  const x = obj(m);
  return {
    name: str(x.name), category: str(x.category), standard: str(x.standard),
    manufacturer: str(x.manufacturer), supplier: str(x.supplier),
    origin: x.origin === 'domestic' || x.origin === 'foreign' ? x.origin : null,
    note: str(x.note),
    brand: str(x.brand), model: str(x.model), size: str(x.size), unit: str(x.unit), qty: str(x.qty),
    stage: str(x.stage), location: str(x.location), drawingNo: str(x.drawingNo),
    designStd: str(x.designStd), equivStd: str(x.equivStd), designReq: str(x.designReq), proposed: str(x.proposed),
    meets: typeof x.meets === 'boolean' ? x.meets : null,
    arrivedAt: numOrNull(x.arrivedAt), certNo: str(x.certNo), pageRef: str(x.pageRef),
    verdict: isVerdictCode(x.verdict) ? x.verdict : null,
    locked: bool(x.locked),
  };
}

export function normalizeMa(raw: unknown): MaBody {
  const j = obj(raw);
  const cl = obj(j.checklist);
  const checklist = Object.fromEntries(MA_CHECKLIST.map((k) => [k, bool(cl[k])])) as Record<MaCheckKey, boolean>;
  const materials = (Array.isArray(j.materials) ? j.materials : []).map(normalizeMaterial);
  const drawings = (Array.isArray(j.drawings) ? j.drawings : []).map((d) => {
    const x = obj(d);
    return { no: str(x.no), rev: str(x.rev), note: str(x.note) };
  });
  const sg = obj(j.signatures);
  const attachments = (Array.isArray(j.attachments) ? j.attachments : []).map((a): MaAttachment => {
    const x = obj(a);
    const k = str(x.kind);
    return { kind: (MA_CHECKLIST as readonly string[]).includes(k) ? (k as MaCheckKey) : 'other', title: str(x.title), pages: str(x.pages) };
  });
  const st = str(j.submittalType);
  return {
    ...normalizeCommon(j),
    meta: normalizeMeta(j.meta),
    materials, checklist,
    costImpact: bool(j.costImpact), timeImpact: bool(j.timeImpact),
    drawingsMatch: typeof j.drawingsMatch === 'boolean' ? j.drawingsMatch : null,
    drawings,
    scope: str(j.scope), manufacturer: str(j.manufacturer), intro: str(j.intro),
    standards: str(j.standards), sample: str(j.sample), storage: str(j.storage), transport: str(j.transport),
    techSpec: str(j.techSpec), purpose: str(j.purpose),
    signatures: {
      prepared: normalizeSig(sg.prepared), reviewed: normalizeSig(sg.reviewed),
      reviewed2: normalizeSig(sg.reviewed2), approved: normalizeSig(sg.approved),
    },
    subcontractor: str(j.subcontractor), blocks: strArr(j.blocks), attachments, refs: strArr(j.refs),
    submittalType: (SUBMITTAL_TYPES as readonly string[]).includes(st) ? (st as SubmittalType) : null,
  };
}

/**
 * ⚠️ 2026-09-28: 2-р үе шатнаас ӨМНӨХ FIC-ийн JSON-д `labTest`/`qualityCert` түлхүүр нь
 *    дэлгэцэд «Геодезийн хэмжилт»/«Бетон шоо» гэж зурагддаг байсан (загваргүй, 4 чекбокс).
 *    Одоо FIC-д `survey`/`cubes` тусдаа түлхүүртэй тул загваргүй хуучин FIC мөрийг хөрвүүлнэ —
 *    эс бөгөөс бөглөсөн чекбокс алга болно. MIR-д хөндөхгүй (тэнд labTest нь лаб дүн мөн).
 */
function legacyFicAttach(
  at: Record<InspAttachKey, boolean>, raw: Record<string, unknown>, kind: DocKind | undefined, template: string,
): Record<InspAttachKey, boolean> {
  if (kind !== 'FIC' || template || 'survey' in raw || 'cubes' in raw) return at;
  return { ...at, survey: bool(raw.labTest), cubes: bool(raw.qualityCert), labTest: false, qualityCert: false };
}

export function normalizeInsp(raw: unknown, kind?: DocKind): InspBody {
  const j = obj(raw);
  const h = obj(j.header);
  const a = obj(j.attachments);
  const items = (Array.isArray(j.items) ? j.items : []).map((it, i): InspItem => {
    const x = obj(it);
    const no = Number(x.no);
    return {
      no: Number.isInteger(no) && no > 0 ? no : i + 1,
      text: str(x.text),
      section: str(x.section) || null,
      contractor: isInspCheck(x.contractor) ? x.contractor : null,
      client: isInspCheck(x.client) ? x.client : null,
      comment: str(x.comment),
    };
  });
  return {
    ...normalizeCommon(j),
    meta: normalizeMeta(j.meta),
    header: { building: str(h.building), location: str(h.location), materialName: str(h.materialName) },
    template: str(j.template),
    items,
    quantity: str(j.quantity), remarks: str(j.remarks),
    attachments: legacyFicAttach(Object.fromEntries(INSP_ATTACH_KEYS.map((k) => [k, bool(a[k])])) as Record<InspAttachKey, boolean>, a, kind, str(j.template)),
    maRef: str(j.maRef),
  };
}

function normalizeClosure(raw: unknown): NcrClosure | null {
  if (!raw || typeof raw !== 'object') return null;
  const cl = obj(raw);
  const verifiedAt = numOrNull(cl.verifiedAt);
  if (!verifiedAt) return null;
  const ar = obj(cl.archive);
  const dt = str(cl.docType); const ac = str(cl.action); const rs = str(cl.result);
  return {
    completedAt: numOrNull(cl.completedAt), verifiedBy: str(cl.verifiedBy), verifiedAt,
    docType: (NCR_CLOSURE_DOC_TYPES as readonly string[]).includes(dt) ? (dt as NcrClosureDocType) : null,
    action: (NCR_PROPOSED as readonly string[]).includes(ac) ? (ac as NcrProposed) : null,
    result: (NCR_CLOSURE_RESULTS as readonly string[]).includes(rs) ? (rs as NcrClosureResult) : null,
    closedByContractor: (Array.isArray(cl.closedByContractor) ? cl.closedByContractor : []).map((c): NcrCloser => {
      const x = obj(c);
      return { name: str(x.name), position: str(x.position), date: numOrNull(x.date) };
    }),
    archive: { original: bool(ar.original), server: bool(ar.server), backup: bool(ar.backup) },
  };
}

export function normalizeNcr(raw: unknown): NcrBody {
  const j = obj(raw);
  const a = obj(j.attachments);
  const c = obj(j.correction);
  const sev = j.severity;
  const reopened = Number(j.reopened);
  return {
    ...normalizeCommon(j),
    meta: normalizeMeta(j.meta),
    subject: str(j.subject), contractNo: str(j.contractNo), location: str(j.location), building: str(j.building),
    issuedAt: numOrNull(j.issuedAt), dueAt: numOrNull(j.dueAt), description: str(j.description),
    attachments: {
      photo: bool(a.photo), markup: bool(a.markup), mirCopy: bool(a.mirCopy),
      checklist: bool(a.checklist), testResult: bool(a.testResult),
    },
    severity: (NCR_SEVERITY as readonly unknown[]).includes(sev) ? (sev as NcrSeverity) : null,
    types: strArr(j.types).filter((t): t is NcrType => (NCR_TYPES as readonly string[]).includes(t)),
    proposed: strArr(j.proposed).filter((p): p is NcrProposed => (NCR_PROPOSED as readonly string[]).includes(p)),
    proposedText: str(j.proposedText),
    mirRef: str(j.mirRef),
    /* ⚠️ Хуучин мөр (initialVerdict үгүй) → R — маягтын анхдагч «Rejected» */
    initialVerdict: isVerdictCode(j.initialVerdict) ? j.initialVerdict : 'R',
    initialReviewedBy: str(j.initialReviewedBy),
    contractName: str(j.contractName), generalContractor: str(j.generalContractor), subcontractor: str(j.subcontractor),
    toWhom: str(j.toWhom), fromWhom: str(j.fromWhom),
    photos: (Array.isArray(j.photos) ? j.photos : []).map((p): NcrPhoto => {
      const x = obj(p);
      return { no: str(x.no), location: str(x.location), note: str(x.note) };
    }),
    correction: { text: str(c.text), completedAt: numOrNull(c.completedAt), steps: strArr(c.steps) },
    correctionAt: numOrNull(j.correctionAt),
    closure: normalizeClosure(j.closure),
    reopened: Number.isInteger(reopened) && reopened > 0 ? reopened : 0,
  };
}

/** JSON мөр → төрлийн бие. Эвдэрсэн бол хоосон бие. MS/QMP/PRC: 6 хэсэг + meta + нийтлэг */
export function parseBodyOf(kind: DocKind, raw: unknown): AnyBody {
  let j: unknown = {};
  try { j = JSON.parse(String(raw ?? '{}')); } catch { j = {}; }
  if (kind === 'MA') return normalizeMa(j);
  if (kind === 'MIR' || kind === 'FIC') return normalizeInsp(j, kind);
  if (kind === 'NCR') return normalizeNcr(j);
  return { ...normalizeMs(j), meta: normalizeMeta(obj(j).meta), ...normalizeCommon(obj(j)) };
}

/** Аль ч биеийн `meta` (MS-д ч) — JSON мөр эсвэл объект */
export function parseMeta(raw: unknown): Meta {
  if (typeof raw === 'string') {
    try { return normalizeMeta(obj(JSON.parse(raw)).meta); } catch { return { ...EMPTY_META }; }
  }
  return normalizeMeta(obj(raw).meta);
}

/** Аль ч биеийн нийтлэг талбар (revNote · revHistory · bounces) — JSON мөр эсвэл объект */
export function parseCommon(raw: unknown): BodyCommon {
  if (typeof raw === 'string') {
    try { return normalizeCommon(obj(JSON.parse(raw))); } catch { return structuredClone(EMPTY_COMMON); }
  }
  return normalizeCommon(obj(raw));
}

/* ════════════════════════ ДУГААР ════════════════════════ */

/**
 * ГҮЙЦЭТГЭГЧИЙН КОД — жишээ материалаас (11 багц).
 *
 * ⚠️ БАГЦААР, компанийн нэрээр биш: нэг компани хоёр багцад байвал (ББСМО:
 *    Багц 1-4 ба ХО-0045) код нь багц тутамд өөр. Мөн нэр нь бичиглэлээрээ
 *    зөрдөг (Багц 4.2: «PS» ба «PRO» хоёулаа) — энд НЭГ л зөв утга.
 * ⚠️ Багц 4.1 — жишээ материалд `MONCON`, гэхдээ тэдний 51 файл БҮГД багцын
 *    кодоо орхисон. Энд `P0401` заавал дагалдана.
 */
export const ORG_CODE: Record<string, string> = {
  'Багц 1': 'SCMC',
  'Багц 2': 'SCSEBC',
  'Багц 3.1': 'SCF',
  'Багц 3.2': 'MSC',
  'Багц 3.3': 'NBG',
  'Багц 4-1': 'MONCON',
  'Багц 4-2': 'PS',
  'Багц 5.1': 'OSNAAUG',
  'Багц 6.1': 'SMART',
  'Багц 6.2': 'MMSE',
  'Багц 7': 'GUBBG',
};

/** NCR дугаарын тогтмол угтвар — ЗАХИАЛАГЧ нээдэг тул гүйцэтгэгчийн код ҮГҮЙ (практик: `STMCC-STMC-NCR-0022`) */
export const NCR_PREFIX = 'STMCC-STMC-NCR';

/**
 * Багцын нэр → `P<4 орон>`: «Багц 3.3» → `P0303`, «Багц 4-1» → `P0401`,
 * «Багц 1» → `P0100`, «Багц 7» → `P0700`.
 * ⚠️ Жишээ материалын хэвтэй ЯГ ТААРНА (`SCSEBC-SLB-MA-P0200-…`).
 * ⚠️ Танихгүй нэр → `null`; таамаглаж БОЛОХГҮЙ — буруу багцад наалдана.
 */
export function pkgCode(bagts: string): string | null {
  const m = /(\d+)(?:[.\-](\d+))?\s*$/.exec(String(bagts).trim());
  if (!m) return null;
  const major = Number(m[1]);
  const minor = m[2] == null ? 0 : Number(m[2]);
  if (!Number.isInteger(major) || major < 1 || major > 99) return null;
  if (!Number.isInteger(minor) || minor < 0 || minor > 99) return null;
  return `P${String(major).padStart(2, '0')}${String(minor).padStart(2, '0')}`;
}

/** Гүйцэтгэгчийн код — багцаас. Танихгүй бол `null`. */
export const orgCode = (bagts: string): string | null =>
  ORG_CODE[String(bagts).trim()] ?? null;

/**
 * БАРИМТЫН ДУГААР — `<ГҮЙЦ>-SLB-<KIND>-P<багц>-<№>-<rev>`.
 * Жишээ: `MSC-SLB-MS-P0302-0011-01`.
 *
 * ⚠️ ЗӨВХӨН ЛАТИН, ЗӨВХӨН ЭНДЭЭС. Кирилл «МА»/«Р» холилдох нь (17 жишээ
 *    файл) гараар бичдэгээс — энэ функц үүнийг боломжгүй болгоно.
 * ⚠️ `kind` параметр: MA · MIR · FIC · QMP · PRC ч энэ л хэвээр дугаарлагдана.
 * ⚠️ NCR (2026-09-28): `STMCC-STMC-NCR-NNNN` — ТӨСЛИЙН хэмжээний нэг дараалал,
 *    багцын код ҮГҮЙ, rev ҮГҮЙ (практикийн бүртгэл яг ийм; урьд багц тутмын
 *    `MONCON-SLB-NCR-P0401-…` хэв байсан — `parseDocNo` хоёуланг таньдаг).
 */
export function docNo(bagts: string, seq: number, rev: number, kind: DocKind = 'MS'): string | null {
  if (!Number.isInteger(seq) || seq < 1 || seq > 9999) return null;
  if (kind === 'NCR') return `${NCR_PREFIX}-${String(seq).padStart(4, '0')}`;
  const org = orgCode(bagts);
  const pkg = pkgCode(bagts);
  if (!org || !pkg) return null;
  if (!Number.isInteger(rev) || rev < 0 || rev > 99) return null;
  return `${org}-SLB-${kind}-${pkg}-${String(seq).padStart(4, '0')}-${String(rev).padStart(2, '0')}`;
}

/**
 * ЗАХИАЛАГЧИЙН ХАРИУНЫ ДУГААР — `SLB-REP-<KIND>-P<багц>-<NNNN>-<RR>`.
 * ⚠️ `n` нь ТӨСЛИЙН ХЭМЖЭЭНИЙ дараалал (багцаар биш) — практикийн бүртгэл
 *    (`Материал_баталгаажуулалт_бүртгэл`) ийм. `rr` = тухайн lineage-ийн
 *    хариуны тоо (`repSeqFor`), баримтын rev биш.
 */
export function repNo(kind: DocKind, bagts: string, n: number, rr: number): string | null {
  const pkg = pkgCode(bagts);
  if (!pkg) return null;
  if (!Number.isInteger(n) || n < 1 || n > 9999) return null;
  if (!Number.isInteger(rr) || rr < 0 || rr > 99) return null;
  return `SLB-REP-${kind}-${pkg}-${String(n).padStart(4, '0')}-${String(rr).padStart(2, '0')}`;
}

const KIND_RE = KINDS.join('|');

/**
 * Дугаарыг задлах — `docNo`/`repNo`-ийн урвуу. Хэвэнд нийцэхгүй бол `null`.
 * `rep: true` бол захиалагчийн хариу (`org` = `null`).
 * NCR-ийн шинэ хэв (`STMCC-STMC-NCR-0022`): `org: 'STMCC'`, `pkg: ''`, `rev: 0`.
 */
export function parseDocNo(no: string): {
  org: string | null; kind: DocKind; pkg: string; seq: number; rev: number; rep: boolean;
} | null {
  const s = String(no).trim();
  const m = new RegExp(`^([A-Z]+)-SLB-(${KIND_RE})-(P\\d{4})-(\\d{4})-(\\d{2})$`).exec(s);
  if (m) return { org: m[1], kind: m[2] as DocKind, pkg: m[3], seq: Number(m[4]), rev: Number(m[5]), rep: false };
  const r = new RegExp(`^SLB-REP-(${KIND_RE})-(P\\d{4})-(\\d{4})-(\\d{2})$`).exec(s);
  if (r) return { org: null, kind: r[1] as DocKind, pkg: r[2], seq: Number(r[3]), rev: Number(r[4]), rep: true };
  const n = /^STMCC-STMC-NCR-(\d{4})$/.exec(s);
  if (n) return { org: 'STMCC', kind: 'NCR', pkg: '', seq: Number(n[1]), rev: 0, rep: false };
  return null;
}

/**
 * Дараагийн дугаар — тухайн багцын байгаа баримтуудаас ХАМГИЙН ИХ `seq` + 1.
 * ⚠️ Хувилбар (`rev`) нь `seq`-ийг ХӨДӨЛГӨХГҮЙ: `0011-00` → `0011-01` нь
 *    нэг баримт. Шинэ `seq` нь зөвхөн ШИНЭ аргачлалд.
 * ⚠️ Хоосон бол 1 — жишээ материалд бүх багц 0001-ээс эхэлдэг.
 * ⚠️ `bagts: null` → ТӨСЛИЙН хэмжээнд (NCR, 2026-09-28) — бүх мөрөөс max+1.
 */
export function nextSeq(existing: readonly { bagts: string; seq: number }[], bagts: string | null): number {
  let max = 0;
  for (const d of existing) {
    if ((bagts === null || d.bagts === bagts) && Number.isInteger(d.seq) && d.seq > max) max = d.seq;
  }
  return max + 1;
}

/**
 * Дараагийн REP дугаар — тухайн ТӨРЛИЙН бүх мөрийн `rep.no`-оос max+1
 * (төслийн хэмжээнд, багц харгалзахгүй). `docs` нь өөр төрлийн мөр агуулж
 * болно — `kind`-аар шүүнэ (`loadAllDocs()` шууд өгч болно).
 */
export function nextRepNo(docs: readonly Pick<MsDoc, 'kind' | 'rep'>[], kind: DocKind): number {
  let max = 0;
  for (const d of docs) {
    if (d.kind !== kind || !d.rep) continue;
    const p = parseDocNo(d.rep.no);
    if (p?.rep && p.kind === kind && p.seq > max) max = p.seq;
  }
  return max + 1;
}

/**
 * REP ДУГААР LINEAGE-ЭЭР (2026-09-28): ижил (kind, bagts, seq)-ийн ӨМНӨХ хариу
 * байвал тэр NNNN-ийг өвлөж, RR = өмнөх хариуны хамгийн их RR + 1; байхгүй бол
 * NNNN = max+1, RR = 00. Практик: `0098-00 → 0098-01` (rev+1), `0007-00 → 0007-01`
 * (AN→A хаалт). `docs` = тухайн төрлийн бүх мөр (бүх хувилбар).
 */
export function repSeqFor(
  docs: readonly Pick<MsDoc, 'kind' | 'bagts' | 'seq' | 'rep'>[],
  kind: DocKind, bagts: string, seq: number,
): { n: number; rr: number } {
  let n = 0; let maxRr = -1;
  for (const d of docs) {
    if (d.kind !== kind || d.bagts !== bagts || d.seq !== seq || !d.rep) continue;
    const p = parseDocNo(d.rep.no);
    if (!p?.rep || p.kind !== kind) continue;
    if (!n) n = p.seq;
    if (p.rev > maxRr) maxRr = p.rev;
  }
  if (n) return { n, rr: maxRr + 1 };
  return { n: nextRepNo(docs, kind), rr: 0 };
}

/* ════════════════════════ УРСГАЛ ════════════════════════ */

export const emptyReviews = (): Reviews =>
  ({ tuh: null, chanar: null, habea: null, tug: null, cheng: null });

/**
 * ТООЛОГДОХ ХЯНАГЧИД — `REVIEWERS_OF[kind]`, гэхдээ ХУУЧИН МӨРД ТЭСВЭРТЭЙ
 * (2026-09-28): дараалсан төрөлд ӨМНӨХ слот хоосон атал ДАРААГИЙНХ нь бөглөгдсөн
 * бол өмнөхийг алгасна — өнөөдрийн MA мөрүүд `cheng`-гүй урсгалаар эхэлсэн
 * (chanar/tug шийдвэртэй). Шинэ баримтад `review()` дараалал барьдаг тул ийм
 * байдал зөвхөн хуучин өгөгдөлд.
 */
export function requiredReviewers(reviews: Reviews, kind: DocKind): readonly Reviewer[] {
  const need = REVIEWERS_OF[kind];
  if (!SEQUENTIAL_KINDS.includes(kind)) return need;
  /* ⚠️ 2026-09-25: ШИЙДВЭРГҮЙ хуучин MA мөр (JSON-д `cheng` түлхүүр огт байхгүй) урьд нь
     cheng-ийг шаарддаг байв — «дараагийнх бөглөгдсөн» дүрэм зөвхөн шийдвэртэй мөрд
     ажилладаг тул. Одоо `undefined` слот (`parseReviews`: түлхүүр байхгүй) тоологдохгүй.
     FAIL-CLOSED: бүгд алга бол (эвдэрсэн/хоосон JSON) бүх хянагчийг шаардана. */
  const out = need.filter((r, i) => reviews[r] !== undefined
    && (reviews[r] != null || !need.slice(i + 1).some((later) => reviews[later] != null)));
  return out.length ? out : need;
}

/**
 * ХЯНАГЧДЫН БҮРТГЭЛЭЭС ТӨЛӨВ — 5-р алхам («нэгтгэж зөвшөөрсөн эсвэл
 * татгалзсан баримт бүрдүүлэх»). Зөвхөн `requiredReviewers`-ийг тоолно.
 *
 *   · АЛЬ НЭГ нь татгалзсан → `returned`  (нэг ч татгалзал хангалттай)
 *   · БҮГД зөвшөөрсөн (A эсвэл AN) → `approved`
 *   · Бусад (дутуу) → `review` хэвээр
 *
 * ⚠️ Татгалзал ЗӨВШӨӨРЛӨӨС ДАВАМГАЙЛНА: хоёр нь зөвшөөрч, нэг нь татгалзвал
 *    буцаагдана. Зураглалын «Ажлын аргачлалыг зөвшөөрсөн эсэх» нь бүгдийн
 *    санал НЭГТГЭГДСЭН дараах ганц асуулт.
 * ⚠️ Татгалзалыг ХҮЛЭЭХГҮЙ: нэг хянагч татгалзмагц бусдыг хүлээх нь
 *    гүйцэтгэгчийг дэмий саатуулна — тэр аль хэдийн засах ёстой.
 * ⚠️ MA материал бүрийн шийдвэр (2026-09-28): аль нэг материал R бол хянагчийн
 *    шийдвэр өөрөө R (`review()` өсгөнө) тул энд тусгай зам ҮГҮЙ — «зарим R»
 *    нь `returned`, харин A/AN материалууд `body.materials[i].verdict`-д
 *    хадгалагдаж дараагийн хувилбарт түгжигдэнэ.
 */
export function resolve(reviews: Reviews, kind: DocKind = 'MS'): MsStatus {
  const need = requiredReviewers(reviews, kind);
  let approved = 0;
  for (const r of need) {
    const v = reviews[r];
    if (!v) continue;
    if (v.verdict === VERDICT.return) return MS_STATUS.returned;
    if (v.verdict === VERDICT.approve || v.verdict === VERDICT.note) approved += 1;
  }
  return approved === need.length ? MS_STATUS.approved : MS_STATUS.review;
}

/** Хэдэн хянагч шийдсэн — дэлгэцэд «2/3» */
export function progress(reviews: Reviews, kind: DocKind = 'MS'): { done: number; total: number } {
  const need = requiredReviewers(reviews, kind);
  return { done: need.filter((r) => reviews[r] != null).length, total: need.length };
}

/**
 * Хянагчдын бүртгэлээс ХАРИУНЫ шийдвэр, текст — approved/returned болмогц.
 * R > AN > A. `perMaterial` нь хянагчдын нэгтгэл (материал бүрд R > AN > A);
 * `materials` өгвөл ТҮГЖИГДСЭН материалын өмнөх шийдвэр ч орно (дахин
 * хянагдаагүй тул хянагчдын бүртгэлд байхгүй). `preparedBy` = эхний шийдвэр.
 * A шийдвэрийн санал ч `anText`-д (2026-09-28: хариунд харагдана).
 */
export function repFrom(reviews: Reviews, kind: DocKind, materials?: readonly Pick<MaMaterial, 'verdict' | 'locked'>[]): Omit<Rep, 'no' | 'at'> {
  const rs = REVIEWERS_OF[kind].map((r) => reviews[r]).filter((r): r is Review => r != null);
  /* ⚠️ 2026-09-25: хариунд саналын ХУРААНГУЙ (`clipNote`) — бүтэн текст `reviews[r].note`-д
     хэвээр; `hyanalt` 8000-д багтаахын тулд давхардлыг богиносгоно. */
  const anText = rs.filter((r) => r.verdict !== VERDICT.return && r.note).map((r) => clipNote(r.note as string)).join('\n');
  const rReasons = rs.filter((r) => r.verdict === VERDICT.return && r.note).map((r) => clipNote(r.note as string));
  const per: Record<string, VerdictCode> = {};
  const rank = { A: 0, AN: 1, R: 2 } as const;
  for (const r of rs) {
    for (const [idx, v] of Object.entries(r.perMaterial ?? {})) {
      if (!per[idx] || rank[v] > rank[per[idx]]) per[idx] = v;
    }
  }
  if (materials) {
    materials.forEach((m, i) => {
      if (m.locked && m.verdict) per[String(i)] = m.verdict;
    });
  }
  /* ⚠️ 2026-09-25: баримтын шийдвэр = ХЯНАГЧДЫН ба ТҮГЖИГДСЭН материалын хамгийн хатуу нь.
     Урьд нь зөвхөн хянагчдаас — өмнөх хувилбарт AN болж түгжигдсэн материалын нөхцөл
     биелээгүй атал rev+1 бүхэлдээ «A» болж, AN нээлттэй байдал (`isAnOpen`) алдагддаг байв. */
  const reviewCode: VerdictCode = rs.some((r) => r.verdict === VERDICT.return) ? 'R'
    : rs.some((r) => r.verdict === VERDICT.note) ? 'AN' : 'A';
  const lockedMax = maxPerMaterial(materials
    ? Object.fromEntries(materials.map((m, i) => [String(i), m.locked ? m.verdict : null]).filter(([, v]) => v != null) as [string, VerdictCode][])
    : undefined);
  const verdict: VerdictCode = lockedMax && rank[lockedMax] > rank[reviewCode] ? lockedMax : reviewCode;
  const out: Omit<Rep, 'no' | 'at'> = { verdict };
  if (anText) out.anText = anText;
  if (rReasons.length) out.rReasons = rReasons;
  if (Object.keys(per).length) out.perMaterial = per;
  const first = rs.slice().sort((a, b) => a.at - b.at)[0];
  if (first) out.preparedBy = first.who;
  const dl = rs.map((r) => r.anDeadline).filter((d): d is number => !!d);
  if (dl.length) out.anDeadline = Math.max(...dl);
  return out;
}

export type Reject = { ok: false; error: string };

/** Урсгалын функцүүдийн оролт — `kind` байхгүй бол MS (хуучин дуудагч) */
type FlowDoc = Pick<MsDoc, 'status' | 'author' | 'reviews'> & {
  kind?: DocKind;
  /** NCR: гүйцэтгэгчийн залруулгын тайлан илгээгдсэн агшин (`body.correctionAt`) */
  correctionAt?: number | null;
  rep?: Rep | null;
};

/** Материал бүрийн шийдвэрийн ХАМГИЙН ХАТУУ нь (R > AN > A); хоосон → null */
function maxPerMaterial(pm: Record<string, VerdictCode> | undefined): VerdictCode | null {
  if (!pm) return null;
  const vs = Object.values(pm);
  if (!vs.length) return null;
  return vs.includes('R') ? 'R' : vs.includes('AN') ? 'AN' : 'A';
}

/**
 * ХЯНАГЧ ШИЙДВЭР ӨГӨХ — цэвэр шалгуур ба шинэ төлөв. Хадгалалт дуудагчид.
 *
 * ⚠️ ДҮРМҮҮД ЭНД, UI-Д БИШ (`huvaariBatlah.decidePlan`-ийн зарчим): товч
 *    нуух нь харагдац, дүрэм нь өгөгдөл. Консолоос дуудсан ч энэ л барина.
 *
 *   1. Зөвхөн `review` төлөвт — буцаагдсан/батлагдсан/ноорогт шийдвэр ҮГҮЙ.
 *   2. ЗОХИОГЧ ӨӨРИЙГӨӨ ХЯНАХГҮЙ — гүйцэтгэгч нь ТУХ/Чанар/ХАБЭА-н аль нь ч
 *      байж болохгүй. `doc.author`-оор (серверийн мөр) шалгана.
 *      ⚠️ NCR-д ЭНЭ ДҮРЭМ ҮЙЛЧЛЭХГҮЙ (2026-09-28): зохиогч нь захиалагчийн
 *      хянагч өөрөө (нээгч), хянаж буй зүйл нь ГҮЙЦЭТГЭГЧИЙН залруулга —
 *      практикт нээсэн хяналтын инженер өөрөө хаалтыг баталгаажуулдаг.
 *   3. Нэг хянагч ХОЁР УДАА шийдвэр өгөхгүй — эхнийх нь хүчинтэй. Өөрчлөх
 *      бол баримт буцаагдаж дахин ирэх ёстой (шинэ `rev`).
 *      ⚠️ ХОЁР ТАЛТАЙ (2026-09-16-ны аудит): (а) ИЖИЛ ҮҮРГЭЭР дахин —
 *      слотоор шалгагдана; (б) ӨӨР ҮҮРГЭЭР дахин — ХҮНЭЭР шалгагдана.
 *      Урьд нь зөвхөн (а) хэрэгжсэн байсан тул гурван үүргийг нэг
 *      аккаунтад олговол (`scopedAcl.setGrants` зөвшөөрдөг, `ChanarAcl`
 *      хориглодоггүй) тэр хүн ТУХ → Чанар → ХАБЭА гэж ГУРВУУЛАНГ дараалан
 *      батлаж, `resolve()`-ыг ганцаараа `approved` болгож чаддаг байв —
 *      «гурван ХАРААТ БУС хянагч» гэсэн бүх утга нэг гарын үсэг болж
 *      унадаг байлаа.
 *   4. Татгалзахад шалтгаан ЗААВАЛ — эс бөгөөс гүйцэтгэгч юуг засахаа
 *      мэдэхгүй, хоосон давталт үүснэ (`huvaariBatlah`-ийн ижил дүрэм).
 *      AN (санал бүхий зөвшөөрөл)-д ч санал ЗААВАЛ — саналгүй AN нь A.
 *   5. (2026-09-28) Үүрэг нь ТУХАЙН ТӨРЛИЙН хянагч байх ёстой
 *      (`REVIEWERS_OF[kind]`): MS-д tug, MA-д tuh татгалзана.
 *   6. (2026-09-28) MIR/FIC · MA ДАРААЛСАН: дараагийн үүрэг өмнөхийн
 *      шийдвэргүй үед үйлдэл хийж ЧАДАХГҮЙ (маягтын гарын үсгийн дараалал).
 *      Хуучин MA мөрд (cheng-гүй эхэлсэн) `requiredReviewers` алгасна.
 *   7. (2026-09-28) NCR: гүйцэтгэгчийн залруулгын тайлан (`correctionAt`)
 *      ирээгүй бол шийдвэр ҮГҮЙ — дүгнэх зүйл байхгүй.
 *   8. (2026-09-28, 2-р үе шат) MA материал бүрийн шийдвэр: `perMaterial`-д R
 *      байвал хянагчийн шийдвэр R, AN байвал дор хаяж AN болж ӨСНӨ (шалтгаан/
 *      санал заавал хэвээр). Түгжигдсэн (`locked`) материалын индекс ХАЯГДАНА.
 */
export function review(
  doc: FlowDoc,
  args: {
    as: Reviewer; who: string; verdict: Verdict; note?: string; now?: number;
    perMaterial?: Record<string, VerdictCode>;
    /** MA: биеийн материалууд — түгжигдсэнийг шүүхэд */
    materials?: readonly Pick<MaMaterial, 'locked'>[];
    /** AN: нөхцөл биелэх хугацаа */
    anDeadline?: number | null;
  },
): { ok: true; reviews: Reviews; status: MsStatus } | Reject {
  const kind = doc.kind ?? 'MS';
  const me = args.who.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Хянагчийн нэр хоосон') };
  if (!isReviewer(args.as)) return { ok: false, error: tr('Хянагчийн үүрэг танигдсангүй') };
  if (!REVIEWERS_OF[kind].includes(args.as)) {
    return { ok: false, error: tr('Энэ төрлийн баримтыг «{0}» үүргээр хянахгүй', args.as) };
  }
  /* ⚠️ Гадны утга (2026-09-16 аудит): `VERDICT`-ээс өөр мөр нүд дүүргэж `resolve`
     аль ч талд тооцохгүй, дараагийн уншилтад хаягддаг байв — бичилт явсан хэвээр. */
  if (!isVerdict(args.verdict)) {
    return { ok: false, error: tr('Шийдвэрийн утга танигдсангүй') };
  }
  if (doc.status !== MS_STATUS.review) {
    return { ok: false, error: tr('Баримт хянагдаж буй төлөвт биш — шийдвэр өгөх боломжгүй') };
  }
  if (kind !== 'NCR' && doc.author.trim().toLowerCase() === me) {
    return { ok: false, error: tr('Зохиогч өөрийн аргачлалыг хянах боломжгүй') };
  }
  if (kind === 'NCR' && !doc.correctionAt) {
    return { ok: false, error: tr('Гүйцэтгэгчийн залруулгын тайлан ирээгүй — дүгнэлт өгөх боломжгүй') };
  }
  if (doc.reviews[args.as]) {
    return { ok: false, error: tr('Энэ үүргээр шийдвэр аль хэдийн өгөгдсөн') };
  }
  if (SEQUENTIAL_KINDS.includes(kind)) {
    const order = requiredReviewers(doc.reviews, kind);
    const i = order.indexOf(args.as);
    /* ⚠️ 2026-09-25: хуучин мөрд алгасагдсан үүрэг (cheng) — `canAct` товчийг нуудаг байсан ч
       `review()` хүлээн авч, тоологдохгүй слотод шийдвэр бичдэг байв. */
    if (i < 0) return { ok: false, error: tr('Энэ баримтад «{0}» үүргийн шийдвэр шаардлагагүй (хуучин урсгал)', reviewerLabel(args.as)) };
    for (let k = 0; k < i; k += 1) {
      if (!doc.reviews[order[k]]) {
        return { ok: false, error: tr('Эхлээд {0} шийдвэр өгнө', reviewerLabel(order[k])) };
      }
    }
  }
  /*
   * ⚠️ НЭГ ХҮН ЗӨВХӨН НЭГ ҮҮРГЭЭР (2026-09-16-ны аудит) — дүрэм 3-ын
   *    хоёрдугаар тал. Дээрх шалгуур СЛОТ-оор барьдаг тул ижил хүн ӨӨР
   *    үүргээр дахин орж чаддаг байв.
   * ⚠️ `doc.reviews` нь СЕРВЕРИЙН мөрөөс ирдэг тул шалгуур нь хуурамч
   *    дуудлагад ч хүчинтэй (UI-д биш, энд).
   */
  const already = (Object.entries(doc.reviews) as [string, Review | null][])
    .find(([, r]) => r != null && r.who.trim().toLowerCase() === me);
  if (already) {
    return {
      ok: false,
      error: tr('Та энэ баримтад аль хэдийн шийдвэр өгсөн — нэг хүн зөвхөн НЭГ үүргээр хянана'),
    };
  }
  /* Дүрэм 8 — түгжигдсэн материал хаягдана, шийдвэр материалын хамгийн хатуу руу өснө */
  let perMaterial: Record<string, VerdictCode> | undefined;
  if (args.perMaterial && kind === 'MA') {
    perMaterial = {};
    for (const [idx, v] of Object.entries(args.perMaterial)) {
      const i = Number(idx);
      if (!isVerdictCode(v)) continue;
      if (args.materials && Number.isInteger(i) && args.materials[i]?.locked) continue;
      perMaterial[idx] = v;
    }
  }
  const rank = { A: 0, AN: 1, R: 2 } as const;
  let verdict = args.verdict;
  const pmMax = maxPerMaterial(perMaterial);
  if (pmMax && rank[pmMax] > rank[verdictCode(verdict)]) verdict = verdictOf(pmMax);
  const note = args.note?.trim() || null;
  if (note && note.length > NOTE_MAX) {
    return { ok: false, error: tr('Санал {0} тэмдэгтээс урт байж болохгүй', String(NOTE_MAX)) };
  }
  if (verdict === VERDICT.return && !note) {
    return { ok: false, error: tr('Татгалзах шалтгаанаа бичнэ үү') };
  }
  if (verdict === VERDICT.note && !note) {
    return { ok: false, error: tr('Санал бүхий зөвшөөрөлд саналаа бичнэ үү') };
  }
  const rec: Review = { who: me, at: args.now ?? Date.now(), verdict, note };
  if (perMaterial && Object.keys(perMaterial).length) rec.perMaterial = perMaterial;
  if (verdict === VERDICT.note && args.anDeadline) rec.anDeadline = args.anDeadline;
  const reviews: Reviews = { ...doc.reviews, [args.as]: rec };
  return { ok: true, reviews, status: resolve(reviews, kind) };
}

/**
 * ГҮЙЦЭТГЭГЧ ИРҮҮЛЭХ — 1 → 2-р алхам. Ноорог эсвэл буцаагдсан баримтаас.
 *
 * ⚠️ Буцаагдсанаас дахин ирүүлэхэд `rev + 1` ба хянагчдын бүртгэл ЦЭВЭРЛЭГДЭНЭ —
 *    бүгд ДАХИН хянана (зураглалын улаан тасархай «ДАХИН ХЯНАХ»: 6 → 2 → 3).
 *    Өмнө зөвшөөрсөн хоёр нь ч дахин үзнэ, учир нь агуулга өөрчлөгдсөн.
 *    (MA: түгжигдсэн A/AN материал ДАХИН хянагдахгүй — `nextRevisionBody`.)
 * ⚠️ Хуучин хувилбарын мөр УСТГАГДАХГҮЙ — дуудагч шинэ мөр нэмнэ (түүх).
 * ⚠️ NCR (2026-09-28): зөвхөн НООРОГООС (нээгч гүйцэтгэгчид илгээнэ), rev
 *    ҮГҮЙ; буцаагдсан («Дахин засах») NCR-ийг гүйцэтгэгч `submitCorrection`-оор
 *    дахин илгээнэ.
 * ⚠️ 2026-09-28 (2-р үе шат): rev > 0 илгээлтэд `revNote` (хувилбарын шалтгаан)
 *    ЗААВАЛ — «Өөрчлөлтийн түүх» хүснэгтийн мөр.
 */
export function submit(
  doc: Pick<MsDoc, 'status' | 'rev' | 'author'> & { kind?: DocKind },
  args: { who: string; now?: number; revNote?: string | null },
): { ok: true; rev: number; status: MsStatus; sentAt: number; reviews: Reviews } | Reject {
  const kind = doc.kind ?? 'MS';
  const me = args.who.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Илгээгчийн нэр хоосон') };
  if (doc.author.trim().toLowerCase() !== me) {
    return { ok: false, error: tr('Зөвхөн зохиогч илгээх боломжтой') };
  }
  if (kind === 'NCR') {
    if (doc.status !== MS_STATUS.draft) return { ok: false, error: tr('Зөвхөн ноорог үл тохирлыг илгээнэ') };
    return { ok: true, rev: doc.rev, status: MS_STATUS.review, sentAt: args.now ?? Date.now(), reviews: emptyReviews() };
  }
  if (doc.status !== MS_STATUS.draft && doc.status !== MS_STATUS.returned) {
    return { ok: false, error: tr('Зөвхөн ноорог эсвэл буцаагдсан баримтыг илгээнэ') };
  }
  const rev = doc.status === MS_STATUS.returned ? doc.rev + 1 : doc.rev;
  if (rev > 0 && !args.revNote?.trim()) {
    return { ok: false, error: tr('Хувилбарын шалтгаанаа бичнэ үү (rev {0})', String(rev)) };
  }
  return { ok: true, rev, status: MS_STATUS.review, sentAt: args.now ?? Date.now(), reviews: emptyReviews() };
}

/**
 * ШИНЭ ХУВИЛБАР — БАТЛАГДСАН эсвэл буцаагдсан баримтаас rev+1 НООРОГ (2026-09-28).
 * Практикт хамгийн түгээмэл: нийлүүлэгч нэмэх/солих, техник үзүүлэлт өөрчлөгдөх,
 * AN-ийн нөхцөл биелүүлсэн шинэ хувилбар. `reason` ЗААВАЛ. Зөвхөн зохиогч, NCR-д үгүй.
 * Хадгалалт дуудагчид (`chanarStore.newRevisionDoc`): шинэ мөр, бие нь
 * `nextRevisionBody`.
 */
export function newRevision(
  doc: Pick<MsDoc, 'status' | 'rev' | 'author'> & { kind?: DocKind },
  args: { who: string; reason: string; now?: number },
): { ok: true; rev: number; status: MsStatus; reviews: Reviews; reason: string } | Reject {
  const kind = doc.kind ?? 'MS';
  const me = args.who.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Илгээгчийн нэр хоосон') };
  if (kind === 'NCR') return { ok: false, error: tr('Үл тохиролд хувилбар үгүй') };
  if (doc.author.trim().toLowerCase() !== me) return { ok: false, error: tr('Зөвхөн зохиогч шинэ хувилбар гаргана') };
  if (doc.status !== MS_STATUS.approved && doc.status !== MS_STATUS.returned) {
    return { ok: false, error: tr('Зөвхөн батлагдсан эсвэл буцаагдсан баримтаас шинэ хувилбар гаргана') };
  }
  const reason = args.reason.trim();
  if (!reason) return { ok: false, error: tr('Хувилбарын шалтгаанаа бичнэ үү (rev {0})', String(doc.rev + 1)) };
  return { ok: true, rev: doc.rev + 1, status: MS_STATUS.draft, reviews: emptyReviews(), reason };
}

/**
 * ДАРААГИЙН ХУВИЛБАРЫН БИЕ — rev+1 мөр үүсгэхэд биеийг бэлтгэнэ:
 *   · `revNote` = шалтгаан, `revHistory[]`-д мөр нэмнэ
 *   · MA: A/AN материал `locked: true` (шийдвэр хэвээр), R материал `verdict: null`
 *     дахин хянагдана (2026-09-28 хэсэгчлэн батлагдсан MA)
 * ⚠️ ЦЭВЭР — оролтыг өөрчлөхгүй.
 */
export function nextRevisionBody<B extends AnyBody>(
  kind: DocKind, body: B, args: { rev: number; reason: string; by: string; now?: number },
): B {
  const at = args.now ?? Date.now();
  const common = (body as Partial<BodyCommon>);
  const revHistory: RevEntry[] = [
    ...(common.revHistory ?? []),
    { rev: args.rev, at, reason: args.reason.trim(), by: args.by.trim().toLowerCase() },
  ];
  const out = { ...body, revNote: args.reason.trim(), revHistory } as B;
  if (kind === 'MA') {
    const ma = out as unknown as MaBody;
    (out as unknown as MaBody).materials = (ma.materials ?? []).map((m) => (
      m.verdict === 'A' || m.verdict === 'AN'
        ? { ...m, locked: true }
        : { ...m, verdict: null, locked: false }
    ));
  }
  return out;
}

/**
 * ХАРИУГ МАТЕРИАЛД БИЧИХ — approved/returned болмогц `rep.perMaterial`-ыг
 * `materials[i].verdict`-д (түгжигдсэнийг хөндөхгүй); perMaterial үгүй бол
 * бүх түгжигдээгүй материалд баримтын шийдвэр.
 */
export function applyRepToMaterials(body: MaBody, rep: Pick<Rep, 'verdict' | 'perMaterial'>): MaBody {
  const materials = body.materials.map((m, i) => {
    if (m.locked) return m;
    const v = rep.perMaterial?.[String(i)] ?? rep.verdict;
    return { ...m, verdict: v };
  });
  return { ...body, materials };
}

/**
 * «ХЯНАХГҮЙ БУЦААХ» — формат буруу / бүрдэл дутуу (2026-09-28). Чанарын хэлтсийн
 * хянагч (`chanar` эсвэл `cheng`, MA-д; MS-төрөлд `chanar`) `review` төлөвт
 * → `returned`, REP ҮГҮЙ, хянагчдын бүртгэл ЦЭВЭР, `bounce` тэмдэг. NCR-д үгүй.
 */
export function bounce(
  doc: FlowDoc,
  args: { as: Reviewer; who: string; reason: BounceReason; note?: string; now?: number },
): { ok: true; status: MsStatus; reviews: Reviews; bounce: Bounce } | Reject {
  const kind = doc.kind ?? 'MS';
  const me = args.who.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Хянагчийн нэр хоосон') };
  if (kind === 'NCR') return { ok: false, error: tr('Үл тохирлыг хянахгүй буцаахгүй') };
  if (args.as !== 'chanar' && args.as !== 'cheng') return { ok: false, error: tr('Зөвхөн Чанарын хэлтэс хянахгүй буцаана') };
  if (!REVIEWERS_OF[kind].includes(args.as)) return { ok: false, error: tr('Энэ төрлийн баримтыг «{0}» үүргээр хянахгүй', args.as) };
  if (doc.status !== MS_STATUS.review) return { ok: false, error: tr('Баримт хянагдаж буй төлөвт биш — шийдвэр өгөх боломжгүй') };
  if (doc.author.trim().toLowerCase() === me) return { ok: false, error: tr('Зохиогч өөрийн аргачлалыг хянах боломжгүй') };
  if (args.reason !== 'format' && args.reason !== 'incomplete') return { ok: false, error: tr('Буцаах шалтгааны төрөл танигдсангүй') };
  const note = args.note?.trim() ?? '';
  if (note.length > NOTE_MAX) return { ok: false, error: tr('Санал {0} тэмдэгтээс урт байж болохгүй', String(NOTE_MAX)) };
  return {
    ok: true, status: MS_STATUS.returned, reviews: emptyReviews(),
    bounce: { at: args.now ?? Date.now(), by: me, reason: args.reason, note },
  };
}

/**
 * ГҮЙЦЭТГЭГЧ ХАРИУГ ХҮЛЭЭН АВСАН — «Хариу хүлээн авсан гүйцэтгэгчийн ажилтан»
 * блок (2026-09-28). Зөвхөн зохиогч, REP байгаа (approved/returned) баримтад, нэг удаа.
 */
export function ackRep(
  doc: Pick<MsDoc, 'status' | 'author' | 'rep'>,
  args: { who: string; now?: number },
): { ok: true; rep: Rep } | Reject {
  const me = args.who.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Илгээгчийн нэр хоосон') };
  if (doc.author.trim().toLowerCase() !== me) return { ok: false, error: tr('Зөвхөн зохиогч хариуг хүлээн авна') };
  if (!doc.rep) return { ok: false, error: tr('Захиалагчийн хариу хараахан үүсээгүй') };
  if (doc.rep.receivedAt) return { ok: false, error: tr('Хариуг аль хэдийн хүлээн авсан') };
  return { ok: true, rep: { ...doc.rep, receivedAt: args.now ?? Date.now(), receivedBy: me } };
}

/**
 * AN ХААХ — «AN нөхцөл биелсэн» (2026-09-28): approved + AN баримтад тухайн
 * төрлийн хянагч. REP шинэ дугаар (ижил NNNN, RR+1 — дуудагч `repSeqFor`-оор),
 * verdict A, баримт approved хэвээр. MA: AN материал → A.
 * `no` нь дуудагчаас (дугаарлалт өгөгдөл шаарддаг).
 */
export function closeAn(
  doc: FlowDoc,
  args: { as: Reviewer; who: string; note?: string; now?: number; no: string },
): { ok: true; rep: Rep } | Reject {
  const kind = doc.kind ?? 'MS';
  const me = args.who.trim().toLowerCase();
  if (!me) return { ok: false, error: tr('Хянагчийн нэр хоосон') };
  if (!REVIEWERS_OF[kind].includes(args.as)) return { ok: false, error: tr('Энэ төрлийн баримтыг «{0}» үүргээр хянахгүй', args.as) };
  /* ⚠️ 2026-09-25: AN-ийн нөхцөл биелснийг ЧАНАРЫН ХЭЛТЭС (chanar/cheng) л баталгаажуулна —
     урьд нь тухайн төрлийн аль ч хянагч (tug, habea…) хааж чаддаг байв; зохиогч
     өөрөө ч (NCR-ээс бусад) хаахгүй — `review()`-ийн ижил дүрэм. */
  if (args.as !== 'chanar' && args.as !== 'cheng') return { ok: false, error: tr('AN-ийг зөвхөн Чанарын хэлтэс хаана') };
  if (kind !== 'NCR' && doc.author.trim().toLowerCase() === me) return { ok: false, error: tr('Зохиогч өөрийн аргачлалыг хянах боломжгүй') };
  if (doc.status !== MS_STATUS.approved || !doc.rep) return { ok: false, error: tr('Зөвхөн батлагдсан баримтын AN-ийг хаана') };
  if (doc.rep.verdict !== 'AN') return { ok: false, error: tr('Хариу AN биш — хаах зүйл үгүй') };
  if ((args.note?.trim().length ?? 0) > NOTE_MAX) return { ok: false, error: tr('Санал {0} тэмдэгтээс урт байж болохгүй', String(NOTE_MAX)) };
  const now = args.now ?? Date.now();
  const per = doc.rep.perMaterial
    ? Object.fromEntries(Object.entries(doc.rep.perMaterial).map(([k, v]) => [k, v === 'AN' ? 'A' : v]))
    : undefined;
  const rep: Rep = { ...doc.rep, no: args.no, at: now, verdict: 'A', anClosedAt: now, anClosedBy: me };
  if (per) rep.perMaterial = per as Record<string, VerdictCode>;
  const note = args.note?.trim();
  if (note) rep.anText = [rep.anText, clipNote(note)].filter(Boolean).join('\n');
  delete rep.receivedAt; delete rep.receivedBy;
  return { ok: true, rep };
}

/**
 * NCR — ГҮЙЦЭТГЭГЧ ЗАЛРУУЛГЫН ТАЙЛАН ИЛГЭЭХ. `review` («Гүйцэтгэгчид илгээсэн»)
 * эсвэл `returned` («Нэмэлт арга хэмжээ шаардлагатай») төлөвөөс; хянагчдын
 * бүртгэл ЦЭВЭРЛЭГДЭЖ төлөв `review` болно (rev ҮГҮЙ — ижил мөр дээр дахин бичнэ).
 * ⚠️ Гүйцэтгэгч мөн эсэхийг (`isAuthorFor`) дуудагч (`chanarStore`) шалгана —
 *    энд зөвхөн төлөв, агуулга.
 */
export function submitCorrection(
  doc: Pick<MsDoc, 'status'> & { kind?: DocKind; reviews?: Reviews },
  body: NcrBody,
  args: { who: string; correction: NcrCorrection; now?: number },
): { ok: true; body: NcrBody; status: MsStatus; reviews: Reviews } | Reject {
  if ((doc.kind ?? 'MS') !== 'NCR') return { ok: false, error: tr('Зөвхөн үл тохиролд залруулгын тайлан илгээнэ') };
  if (!args.who.trim()) return { ok: false, error: tr('Илгээгчийн нэр хоосон') };
  if (doc.status !== MS_STATUS.review && doc.status !== MS_STATUS.returned) {
    return { ok: false, error: tr('Үл тохирол гүйцэтгэгчид илгээгдсэн эсвэл дахин засах төлөвт биш') };
  }
  /* ⚠️ 2026-09-25: `review` төлөвт залруулга аль хэдийн илгээгдэж, хянагч дүгнэлт өгч
     ЭХЭЛСЭН бол дахин илгээх нь тэдгээр шийдвэрийг чимээгүй АРИЛГАДАГ байв. Одоо зөвхөн
     хянагчийн шийдвэр ОГТ ҮГҮЙ үед (эсвэл `returned`-ээс) дахин илгээнэ. */
  if (doc.status === MS_STATUS.review && body.correctionAt
    && Object.values(doc.reviews ?? {}).some((r) => r != null)) {
    return { ok: false, error: tr('Хянагч дүгнэлт өгч эхэлсэн — залруулгыг дахин илгээхгүй, дүгнэлтийг хүлээнэ үү') };
  }
  const text = args.correction.text.trim();
  if (!text) return { ok: false, error: tr('Залруулгын тайлбараа бичнэ үү') };
  const now = args.now ?? Date.now();
  const correction: NcrCorrection = {
    text,
    completedAt: args.correction.completedAt ?? null,
    steps: args.correction.steps.map((s) => s.trim()).filter(Boolean),
  };
  return {
    ok: true,
    body: { ...body, correction, correctionAt: now, closure: null },
    status: MS_STATUS.review,
    reviews: emptyReviews(),
  };
}

/**
 * NCR — ХААГДСАНЫГ ДАХИН НЭЭХ (tuh/chanar/tug). Төлөв `review`, хянагчид цэвэр,
 * `correctionAt` ба `closure` тэглэгдэнэ (гүйцэтгэгч дахин залруулна),
 * `reopened + 1`.
 */
export function reopen(
  doc: Pick<MsDoc, 'status'> & { kind?: DocKind },
  body: NcrBody,
): { ok: true; body: NcrBody; status: MsStatus; reviews: Reviews } | Reject {
  if ((doc.kind ?? 'MS') !== 'NCR') return { ok: false, error: tr('Зөвхөн үл тохирлыг дахин нээнэ') };
  if (doc.status !== MS_STATUS.approved) return { ok: false, error: tr('Зөвхөн хаагдсан үл тохирлыг дахин нээнэ') };
  return {
    ok: true,
    body: { ...body, correctionAt: null, closure: null, reopened: body.reopened + 1 },
    status: MS_STATUS.review,
    reviews: emptyReviews(),
  };
}

/** NCR хаагдахад бие дээр автоматаар бичигдэх хаалт (захиалагчийн баталгаажуулалт) */
export function ncrClosure(body: NcrBody, verifiedBy: string, now = Date.now()): NcrBody {
  return {
    ...body,
    closure: {
      completedAt: body.correction.completedAt, verifiedBy: verifiedBy.trim().toLowerCase(), verifiedAt: now,
      docType: body.closure?.docType ?? null, action: body.closure?.action ?? null, result: body.closure?.result ?? null,
      closedByContractor: body.closure?.closedByContractor ?? [],
      archive: body.closure?.archive ?? { original: false, server: false, backup: false },
    },
  };
}

/**
 * NCR — ГҮЙЦЭТГЭГЧ «ХААСАН» (2026-09-28): approved (захиалагч баталгаажуулсан)
 * NCR-д гүйцэтгэгчийн БУ менежер + чанарын инженер хаалтын мөрийг бөглөнө
 * (бүртгэлийн Хаасан баримтын төрөл · арга хэмжээ · биелэлт · архив).
 * Дор хаяж нэг хаагчийн нэр ЗААВАЛ.
 */
export function closeNcr(
  doc: Pick<MsDoc, 'status'> & { kind?: DocKind },
  body: NcrBody,
  args: {
    who: string;
    closedByContractor: NcrCloser[];
    docType?: NcrClosureDocType | null; action?: NcrProposed | null; result?: NcrClosureResult | null;
    archive?: Partial<NcrClosure['archive']>;
  },
): { ok: true; body: NcrBody } | Reject {
  if ((doc.kind ?? 'MS') !== 'NCR') return { ok: false, error: tr('Зөвхөн үл тохирлыг хаана') };
  if (!args.who.trim()) return { ok: false, error: tr('Илгээгчийн нэр хоосон') };
  if (doc.status !== MS_STATUS.approved || !body.closure) return { ok: false, error: tr('Захиалагч баталгаажуулаагүй үл тохирлыг гүйцэтгэгч хаахгүй') };
  /* ⚠️ 2026-09-25: нэг удаа — хаагдсан мөрийг дахин бичвэл бүртгэлийн хаалт (нэр, огноо, архив) солигддог байв */
  if (body.closure.closedByContractor.length) return { ok: false, error: tr('Гүйцэтгэгч аль хэдийн хаасан') };
  const closers = args.closedByContractor
    .map((c) => ({ name: c.name.trim(), position: c.position.trim(), date: c.date ?? null }))
    .filter((c) => c.name || c.position)
    .slice(0, 2);
  if (!closers.length) return { ok: false, error: tr('Хаасан ажилтны нэрийг бичнэ үү') };
  return {
    ok: true,
    body: {
      ...body,
      closure: {
        ...body.closure,
        docType: args.docType ?? body.closure.docType, action: args.action ?? body.closure.action,
        result: args.result ?? body.closure.result,
        closedByContractor: closers,
        archive: { ...body.closure.archive, ...(args.archive ?? {}) },
      },
    },
  };
}

/** `canAct`-ийн үр дүн — товч бүрд нэг туг */
export type Actions = {
  edit: boolean;
  submit: boolean;
  review: Reviewer[];
  /** NCR: гүйцэтгэгч залруулгын тайлан илгээх/дахин илгээх */
  correction: boolean;
  /** NCR: хаагдсаныг дахин нээх */
  reopen: boolean;
  /** MIR/FIC: `tuh` хянагч захиалагчийн баганыг бөглөх */
  clientChecks: boolean;
  /** 2026-09-28: Чанарын хэлтэс «хянахгүй буцаах» (`bounce`) */
  bounce: boolean;
  /** Зохиогч «Хариу хүлээн авлаа» (`ackRep`) */
  ack: boolean;
  /** Тухайн төрлийн хянагч «AN хаах» (`closeAn`) */
  closeAn: boolean;
  /** Зохиогч батлагдсан/буцаагдсанаас «Шинэ хувилбар» (`newRevision`) */
  newRevision: boolean;
  /** NCR: гүйцэтгэгч «Хаасан» мөр (`closeNcr`) — approved, хаагч бөглөөгүй */
  closeNcr: boolean;
};

/**
 * ХЭН ЮУ ХИЙЖ ЧАДАХ ВЭ — дэлгэцийн товч. Дүрэм нь дээрх функцүүдэд;
 * энэ нь зөвхөн тэдгээрийг ДУУДАХГҮЙГЭЭР урьдчилан харуулна.
 * `extra.contractor` — тухайн багцын гүйцэтгэгч (`isAuthorFor`) мөн эсэх;
 * NCR-ийн залруулгын товч үүгээр. `extra.ncrClosed` — `body.closure.closedByContractor` бөглөгдсөн.
 * `extra.superseded` — энэ мөрөөс ШИНЭ хувилбар (rev+1) аль хэдийн бий (түүхээс нээсэн хуучин мөр).
 */
export function canAct(
  doc: FlowDoc,
  me: string | null | undefined,
  roles: readonly Reviewer[],
  extra: { contractor?: boolean; ncrClosed?: boolean; superseded?: boolean } = {},
): Actions {
  const kind = doc.kind ?? 'MS';
  const u = (me ?? '').trim().toLowerCase();
  const mine = !!u && doc.author.trim().toLowerCase() === u;
  /* ⚠️ 2026-09-29 (аудит 10): шинэ хувилбартай ХУУЧИН мөрд «Засах»/«Дахин илгээх» гарахгүй —
     урьд нь «Өөрчлөлтийн түүх»-ээс rev N-ийг нээхэд товч харагдаж, дарахад л
     «шинэ хувилбар аль хэдийн бий» гэж татгалздаг байв (`chanarStore.newerExists`). */
  const editable = extra.superseded !== true && (kind === 'NCR'
    ? doc.status === MS_STATUS.draft
    : doc.status === MS_STATUS.draft || doc.status === MS_STATUS.returned);
  /* ⚠️ Нэвтрээгүй (`u` хоосон) хүнд хянах товч ГАРАХГҮЙ — `review()` хоосон
     нэрийг татгалздаг ч дэлгэц дээр товч харагдах нь өөрөө буруу. */
  /* ⚠️ `review()`-ийн «нэг хүн зөвхөн НЭГ үүргээр» дүрмийг ЭНД ч давтана
     (2026-09-17): 3 үүрэгтэй хүн нэгээр нь шийдвэрлэсний дараа бусад товч
     хэвээр харагдаж, дарахад л татгалзагддаг байв. */
  const already = !!u && (Object.values(doc.reviews) as (Review | null)[])
    .some((r) => r != null && r.who.trim().toLowerCase() === u);
  const need = REVIEWERS_OF[kind];
  const gate = kind === 'NCR' ? !!doc.correctionAt : !mine;
  let reviewable: Reviewer[] = !!u && doc.status === MS_STATUS.review && gate && !already
    ? roles.filter((r) => need.includes(r) && !doc.reviews[r])
    : [];
  if (SEQUENTIAL_KINDS.includes(kind)) {
    const order = requiredReviewers(doc.reviews, kind);
    reviewable = reviewable.filter((r) => order.includes(r) && order.slice(0, order.indexOf(r)).every((p) => !!doc.reviews[p]));
  }
  const contractor = kind === 'NCR' && !!u && extra.contractor === true
    && (doc.status === MS_STATUS.review || doc.status === MS_STATUS.returned);
  const reopenable = kind === 'NCR' && !!u && doc.status === MS_STATUS.approved
    && roles.some((r) => need.includes(r));
  const clientChecks = SEQUENTIAL_KINDS.includes(kind) && need.includes('tuh') && !!u && !mine && doc.status === MS_STATUS.review
    && roles.includes('tuh') && !doc.reviews.tuh;
  const bounceable = kind !== 'NCR' && !!u && !mine && doc.status === MS_STATUS.review
    && roles.some((r) => (r === 'chanar' || r === 'cheng') && need.includes(r));
  const ack = mine && !!doc.rep && !doc.rep.receivedAt
    && (doc.status === MS_STATUS.approved || doc.status === MS_STATUS.returned);
  /* ⚠️ 2026-09-25: `closeAn`-ийн ижил дүрэм — Чанарын хэлтэс (chanar/cheng), зохиогч биш (NCR-ээс бусад) */
  const closeAnOk = !!u && doc.status === MS_STATUS.approved && doc.rep?.verdict === 'AN'
    && (kind === 'NCR' || !mine)
    && roles.some((r) => (r === 'chanar' || r === 'cheng') && need.includes(r));
  /* ⚠️ 2026-09-29 (аудит 10): `superseded` — `newRevisionDoc` ч `newerExists`-ээр татгалздаг */
  const newRev = kind !== 'NCR' && mine && extra.superseded !== true
    && (doc.status === MS_STATUS.approved || doc.status === MS_STATUS.returned);
  const closeNcrOk = kind === 'NCR' && !!u && extra.contractor === true && doc.status === MS_STATUS.approved && !extra.ncrClosed;
  return {
    edit: mine && editable, submit: mine && editable, review: reviewable,
    correction: contractor, reopen: reopenable, clientChecks,
    bounce: bounceable, ack, closeAn: closeAnOk, newRevision: newRev, closeNcr: closeNcrOk,
  };
}

/**
 * ӨӨРЧЛӨЛТИЙН ТҮҮХ — маягтын 2-р хуудасны хүснэгт. Нэг баримтын БҮХ
 * хувилбарыг `rev` өсөхөөр эрэмбэлнэ.
 * ⚠️ Оролт нь ижил (bagts, seq)-тэй мөрүүд байх ёстой; өөр баримт орж ирвэл
 *    ХАЯНА — хоёр аргачлалын түүх нийлэхгүй. Төрөл ялгаатай бол мөн хаяна.
 */
export function history(docs: readonly MsDoc[], bagts: string, seq: number, kind?: DocKind): MsDoc[] {
  return docs
    .filter((d) => d.bagts === bagts && d.seq === seq && (kind == null || (d.kind ?? 'MS') === kind))
    .slice()
    .sort((a, b) => a.rev - b.rev);
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
 * «ИЖИЛ НЭРТЭЙ ИДЭВХТЭЙ БАРИМТ БИЙ» — анхааруулга (2026-09-28, MA: create/submit).
 * Ижил төрөл, багц, нэр (том жижиг ялгахгүй), өөр `seq`, сүүлийн хувилбар нь
 * ноорог/хянагдаж буй/AN-нээлттэй. Хориг биш — зөвхөн анхааруулга.
 */
export function activeSameTitle(
  docs: readonly MsDoc[], kind: DocKind, bagts: string, title: string, excludeSeq?: number,
): MsDoc[] {
  const t = title.trim().toLowerCase();
  if (!t) return [];
  return latest(docs).filter((d) => d.kind === kind && d.bagts === bagts && d.seq !== excludeSeq
    && d.title.trim().toLowerCase() === t
    && (d.status === MS_STATUS.draft || d.status === MS_STATUS.review || isAnOpen(d)));
}
