/**
 * АЖЛЫН АРГАЧЛАЛ (MS — Method Statement) — ХЯНАХ УРСГАЛЫН ЦЭВЭР ЛОГИК.
 *
 * ЭХ СУРВАЛЖ: «Ажил гүйцэтгэх ажлын аргачлалын процессийн зураглал MS»
 * (`docs/chanar-material-batalgaajuulalt/Ажлын аргачлал процессын зураглал.pdf`),
 * Сэлбэ хорин минутын хот корпорацийн Чанарын хэлтэс. 9 алхам, 9 эгнээ.
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
 * ⚠️ ХУВИЛБАР (`rev`) — жишээ материалын `-00`, `-01`, `-02` ЯГ ЭНЭ. Буцаагдаад
 * дахин ирүүлэх бүрд `rev + 1` бөгөөд ХУУЧИН мөр УСТГАГДАХГҮЙ (түүх). Баримт
 * дээрх «Өөрчлөлтийн түүх» хүснэгт эндээс автоматаар гарна.
 *
 * ⚠️ ДУГААР АВТОМАТ. Жишээ 257 файлын 88 нь кодоо буруу бичсэн (MONCON багцаа
 * бүхэлдээ мартсан, 17 файлд кирилл «МА» орсон, 10 бүлэг давхардсан) —
 * гараар бичдэг учраас. Энд дугаар нь ЗӨВХӨН `docNo()`-оос гарна.
 *
 * ⚠️ ТУГ (Төслийн удирдлагын газар) нь зураглалд ХОЁР цэгт «Мэдээлэл авах»
 * гэж л байна — шийдвэр ГАРГАХГҮЙ. Тиймээс энд ТУГ-ийн үүрэг БАЙХГҮЙ;
 * тэд харагдацыг харна, товч дарахгүй.
 *
 * ⚠️ React импортлохгүй, сүлжээ дуудахгүй — `chanarMs.check.mjs` шууд Node
 * дээр ачаална. БҮХ экспорт ЦЭВЭР функц. Хадгалалт нь `chanarStore.ts`-д.
 */

/* ════════════════════════ ХЯНАГЧ ════════════════════════ */

/**
 * ГУРВАН ХЯНАГЧ — зураглалын 3 · 4а · 4б эгнээ.
 *   tuh    — ТУХ-ийн инженер + менежер (талбайн нөхцөл, эрсдэлийн үнэлгээ)
 *   chanar — Чанарын хэлтэс (инженер, менежер)
 *   habea  — ХАБЭА-н инженер (аюулгүй ажиллагаа)
 * ⚠️ ДАРААЛАЛ ҮГҮЙ — гурвуулаа зэрэг. Массивын дараалал нь зөвхөн дэлгэц.
 */
export const REVIEWERS = ['tuh', 'chanar', 'habea'] as const;
export type Reviewer = (typeof REVIEWERS)[number];

export const isReviewer = (x: unknown): x is Reviewer =>
  typeof x === 'string' && (REVIEWERS as readonly string[]).includes(x);

/* ════════════════════════ ТӨЛӨВ ════════════════════════ */

/**
 * Баримтын төлөв — ӨГӨГДӨЛ тул ОРЧУУЛАХГҮЙ (`hyanalt.STATUS`-тэй ижил дүрэм).
 *
 *   draft     — гүйцэтгэгч бичиж байна, хэнд ч харагдахгүй (1-р алхам)
 *   review    — ирүүлсэн, хянагчид хянаж байна (2 → 3 · 4а · 4б)
 *   returned  — аль нэг хянагч татгалзсан → гүйцэтгэгчид (5 → 6)
 *   approved  — ГУРВУУЛАА зөвшөөрсөн (5 → 7 → 8 → 9)
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

/** Хянагчийн шийдвэр — өгөгдөл, орчуулахгүй */
export const VERDICT = { approve: 'Зөвшөөрсөн', return: 'Татгалзсан' } as const;
export type Verdict = (typeof VERDICT)[keyof typeof VERDICT];

/* ════════════════════════ БАРИМТ ════════════════════════ */

/** Нэг хянагчийн бүртгэл — хэн, хэзээ, юу гэж */
export type Review = {
  /** ArcGIS-ийн нэр, жижиг үсгээр */
  who: string;
  /** epoch мс */
  at: number;
  verdict: Verdict;
  /** Санал, зөвлөмж — татгалзахад ЗААВАЛ, зөвшөөрөхөд сонголтоор */
  note: string | null;
};

/**
 * ЗУРАГЛАЛЫН 9 АЛХМЫН БАРИМТЫН ТОЛГОЙ — жишээ маягтын 1-р хуудас.
 *
 * ⚠️ `payload` (аргачлалын БИЕ — 6 хэсэг) ЭНД БАЙХГҮЙ: жагсаалт хөнгөн байх
 *    ёстой (`huvaariBatlah.HEAD_FIELDS`-ийн ижил шалтгаан). Биеийг тусад нь
 *    `MsBody`-оор татна.
 */
export type MsDoc = {
  oid: number;
  /** `<ГҮЙЦ>-SLB-MS-P<багц>-<№>-<rev>` — `docNo()`-оос */
  docNo: string;
  /** Гүйцэтгэгчийн код — «MSC», «NBG» … (`orgCode`) */
  org: string;
  /** Багцын бүлэг — «Багц 3.3» (`Pkg.group`, эрхийн хүрээ үүгээр) */
  bagts: string;
  /** Нэг багц дотор ДАРААЛСАН дугаар — 1, 2, 3 … */
  seq: number;
  /** Хувилбар — 0 анхных, буцаагдах бүрд +1 */
  rev: number;
  /** Аргачлалын нэр — «Метал хавтан угсралтын ажлын аргачлал» */
  title: string;
  status: MsStatus;
  /** Гүйцэтгэгчийн аккаунт (жижиг үсгээр) */
  author: string;
  /** Ирүүлсэн огноо — `draft` төлөвт `null` */
  sentAt: number | null;
  /** Гурван хянагчийн бүртгэл — өгөөгүй нь `null` */
  reviews: Record<Reviewer, Review | null>;
  /** Эцсийн шийдвэрийн огноо (approved/returned) */
  decidedAt: number | null;
};

/**
 * АРГАЧЛАЛЫН БИЕ — жишээ маягтын 6 хэсэг (MSC-SLB-MS-P0303-0001-00, хуудас 3).
 * Бүгд ЧӨЛӨӨТ ТЕКСТ — маягт нь хэлбэржсэн ч агуулга нь ажил бүрд өөр.
 * ⚠️ Багаж, багийн бүтэц, ажиллах хүч зэрэг хүснэгтүүд `scope` дотор
 *    текстээр — тэдгээрийг бүтэцлэх нь одоогийн шаардлагаас гадуур.
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
 * БАРИМТЫН ДУГААР — `<ГҮЙЦ>-SLB-MS-P<багц>-<№>-<rev>`.
 * Жишээ: `MSC-SLB-MS-P0302-0011-01`.
 *
 * ⚠️ ЗӨВХӨН ЛАТИН, ЗӨВХӨН ЭНДЭЭС. Кирилл «МА»/«Р» холилдох нь (17 жишээ
 *    файл) гараар бичдэгээс — энэ функц үүнийг боломжгүй болгоно.
 * ⚠️ `kind` параметр: MA · MIR · FIC · NCR ч энэ л хэвээр дугаарлагдана.
 */
export function docNo(
  bagts: string, seq: number, rev: number, kind: 'MS' | 'MA' | 'MIR' | 'FIC' | 'NCR' = 'MS',
): string | null {
  const org = orgCode(bagts);
  const pkg = pkgCode(bagts);
  if (!org || !pkg) return null;
  if (!Number.isInteger(seq) || seq < 1 || seq > 9999) return null;
  if (!Number.isInteger(rev) || rev < 0 || rev > 99) return null;
  return `${org}-SLB-${kind}-${pkg}-${String(seq).padStart(4, '0')}-${String(rev).padStart(2, '0')}`;
}

/** Дугаарыг задлах — `docNo`-ийн урвуу. Хэвэнд нийцэхгүй бол `null`. */
export function parseDocNo(no: string): {
  org: string; kind: string; pkg: string; seq: number; rev: number;
} | null {
  const m = /^([A-Z]+)-SLB-(MS|MA|MIR|FIC|NCR)-(P\d{4})-(\d{4})-(\d{2})$/.exec(String(no).trim());
  if (!m) return null;
  return { org: m[1], kind: m[2], pkg: m[3], seq: Number(m[4]), rev: Number(m[5]) };
}

/**
 * Дараагийн дугаар — тухайн багцын байгаа баримтуудаас ХАМГИЙН ИХ `seq` + 1.
 * ⚠️ Хувилбар (`rev`) нь `seq`-ийг ХӨДӨЛГӨХГҮЙ: `0011-00` → `0011-01` нь
 *    нэг баримт. Шинэ `seq` нь зөвхөн ШИНЭ аргачлалд.
 * ⚠️ Хоосон бол 1 — жишээ материалд бүх багц 0001-ээс эхэлдэг.
 */
export function nextSeq(existing: readonly { bagts: string; seq: number }[], bagts: string): number {
  let max = 0;
  for (const d of existing) {
    if (d.bagts === bagts && Number.isInteger(d.seq) && d.seq > max) max = d.seq;
  }
  return max + 1;
}

/* ════════════════════════ УРСГАЛ ════════════════════════ */

export const emptyReviews = (): Record<Reviewer, Review | null> =>
  ({ tuh: null, chanar: null, habea: null });

/**
 * ГУРВАН ХЯНАГЧИЙН БҮРТГЭЛЭЭС ТӨЛӨВ — 5-р алхам («нэгтгэж зөвшөөрсөн эсвэл
 * татгалзсан баримт бүрдүүлэх»).
 *
 *   · АЛЬ НЭГ нь татгалзсан → `returned`  (нэг ч татгалзал хангалттай)
 *   · ГУРВУУЛАА зөвшөөрсөн → `approved`
 *   · Бусад (дутуу) → `review` хэвээр
 *
 * ⚠️ Татгалзал ЗӨВШӨӨРЛӨӨС ДАВАМГАЙЛНА: хоёр нь зөвшөөрч, нэг нь татгалзвал
 *    буцаагдана. Зураглалын «Ажлын аргачлалыг зөвшөөрсөн эсэх» нь бүгдийн
 *    санал НЭГТГЭГДСЭН дараах ганц асуулт.
 * ⚠️ Татгалзалыг ХҮЛЭЭХГҮЙ: нэг хянагч татгалзмагц бусдыг хүлээх нь
 *    гүйцэтгэгчийг дэмий саатуулна — тэр аль хэдийн засах ёстой.
 */
export function resolve(reviews: Record<Reviewer, Review | null>): MsStatus {
  let approved = 0;
  for (const r of REVIEWERS) {
    const v = reviews[r];
    if (!v) continue;
    if (v.verdict === VERDICT.return) return MS_STATUS.returned;
    if (v.verdict === VERDICT.approve) approved += 1;
  }
  return approved === REVIEWERS.length ? MS_STATUS.approved : MS_STATUS.review;
}

/** Хэдэн хянагч шийдсэн — дэлгэцэд «2/3» */
export function progress(reviews: Record<Reviewer, Review | null>): { done: number; total: number } {
  return { done: REVIEWERS.filter((r) => reviews[r] != null).length, total: REVIEWERS.length };
}

export type Reject = { ok: false; error: string };

/**
 * ХЯНАГЧ ШИЙДВЭР ӨГӨХ — цэвэр шалгуур ба шинэ төлөв. Хадгалалт дуудагчид.
 *
 * ⚠️ ДҮРМҮҮД ЭНД, UI-Д БИШ (`huvaariBatlah.decidePlan`-ийн зарчим): товч
 *    нуух нь харагдац, дүрэм нь өгөгдөл. Консолоос дуудсан ч энэ л барина.
 *
 *   1. Зөвхөн `review` төлөвт — буцаагдсан/батлагдсан/ноорогт шийдвэр ҮГҮЙ.
 *   2. ЗОХИОГЧ ӨӨРИЙГӨӨ ХЯНАХГҮЙ — гүйцэтгэгч нь ТУХ/Чанар/ХАБЭА-н аль нь ч
 *      байж болохгүй. `doc.author`-оор (серверийн мөр) шалгана.
 *   3. Нэг хянагч ХОЁР УДАА шийдвэр өгөхгүй — эхнийх нь хүчинтэй. Өөрчлөх
 *      бол баримт буцаагдаж дахин ирэх ёстой (шинэ `rev`).
 *   4. Татгалзахад шалтгаан ЗААВАЛ — эс бөгөөс гүйцэтгэгч юуг засахаа
 *      мэдэхгүй, хоосон давталт үүснэ (`huvaariBatlah`-ийн ижил дүрэм).
 */
export function review(
  doc: Pick<MsDoc, 'status' | 'author' | 'reviews'>,
  args: { as: Reviewer; who: string; verdict: Verdict; note?: string; now?: number },
): { ok: true; reviews: Record<Reviewer, Review | null>; status: MsStatus } | Reject {
  const me = args.who.trim().toLowerCase();
  if (!me) return { ok: false, error: 'Хянагчийн нэр хоосон' };
  if (!isReviewer(args.as)) return { ok: false, error: 'Хянагчийн үүрэг танигдсангүй' };
  if (doc.status !== MS_STATUS.review) {
    return { ok: false, error: 'Баримт хянагдаж буй төлөвт биш — шийдвэр өгөх боломжгүй' };
  }
  if (doc.author.trim().toLowerCase() === me) {
    return { ok: false, error: 'Зохиогч өөрийн аргачлалыг хянах боломжгүй' };
  }
  if (doc.reviews[args.as]) {
    return { ok: false, error: 'Энэ үүргээр шийдвэр аль хэдийн өгөгдсөн' };
  }
  const note = args.note?.trim() || null;
  if (args.verdict === VERDICT.return && !note) {
    return { ok: false, error: 'Татгалзах шалтгаанаа бичнэ үү' };
  }
  const reviews = { ...doc.reviews, [args.as]: { who: me, at: args.now ?? Date.now(), verdict: args.verdict, note } };
  return { ok: true, reviews, status: resolve(reviews) };
}

/**
 * ГҮЙЦЭТГЭГЧ ИРҮҮЛЭХ — 1 → 2-р алхам. Ноорог эсвэл буцаагдсан баримтаас.
 *
 * ⚠️ Буцаагдсанаас дахин ирүүлэхэд `rev + 1` ба хянагчдын бүртгэл ЦЭВЭРЛЭГДЭНЭ —
 *    гурвуулаа ДАХИН хянана (зураглалын улаан тасархай «ДАХИН ХЯНАХ»: 6 → 2 → 3).
 *    Өмнө зөвшөөрсөн хоёр нь ч дахин үзнэ, учир нь агуулга өөрчлөгдсөн.
 * ⚠️ Хуучин хувилбарын мөр УСТГАГДАХГҮЙ — дуудагч шинэ мөр нэмнэ (түүх).
 */
export function submit(
  doc: Pick<MsDoc, 'status' | 'rev' | 'author'>,
  args: { who: string; now?: number },
): { ok: true; rev: number; status: MsStatus; sentAt: number; reviews: Record<Reviewer, Review | null> } | Reject {
  const me = args.who.trim().toLowerCase();
  if (!me) return { ok: false, error: 'Илгээгчийн нэр хоосон' };
  if (doc.author.trim().toLowerCase() !== me) {
    return { ok: false, error: 'Зөвхөн зохиогч илгээх боломжтой' };
  }
  if (doc.status !== MS_STATUS.draft && doc.status !== MS_STATUS.returned) {
    return { ok: false, error: 'Зөвхөн ноорог эсвэл буцаагдсан баримтыг илгээнэ' };
  }
  const rev = doc.status === MS_STATUS.returned ? doc.rev + 1 : doc.rev;
  return { ok: true, rev, status: MS_STATUS.review, sentAt: args.now ?? Date.now(), reviews: emptyReviews() };
}

/**
 * ХЭН ЮУ ХИЙЖ ЧАДАХ ВЭ — дэлгэцийн товч. Дүрэм нь дээрх функцүүдэд;
 * энэ нь зөвхөн тэдгээрийг ДУУДАХГҮЙГЭЭР урьдчилан харуулна.
 */
export function canAct(
  doc: Pick<MsDoc, 'status' | 'author' | 'reviews'>,
  me: string | null | undefined,
  roles: readonly Reviewer[],
): { edit: boolean; submit: boolean; review: Reviewer[] } {
  const u = (me ?? '').trim().toLowerCase();
  const mine = !!u && doc.author.trim().toLowerCase() === u;
  const editable = doc.status === MS_STATUS.draft || doc.status === MS_STATUS.returned;
  /* ⚠️ Нэвтрээгүй (`u` хоосон) хүнд хянах товч ГАРАХГҮЙ — `review()` хоосон
     нэрийг татгалздаг ч дэлгэц дээр товч харагдах нь өөрөө буруу. */
  const reviewable = !!u && doc.status === MS_STATUS.review && !mine
    ? roles.filter((r) => !doc.reviews[r])
    : [];
  return { edit: mine && editable, submit: mine && editable, review: reviewable };
}

/**
 * ӨӨРЧЛӨЛТИЙН ТҮҮХ — маягтын 2-р хуудасны хүснэгт. Нэг баримтын БҮХ
 * хувилбарыг `rev` өсөхөөр эрэмбэлнэ.
 * ⚠️ Оролт нь ижил (bagts, seq)-тэй мөрүүд байх ёстой; өөр баримт орж ирвэл
 *    ХАЯНА — хоёр аргачлалын түүх нийлэхгүй.
 */
export function history(docs: readonly MsDoc[], bagts: string, seq: number): MsDoc[] {
  return docs
    .filter((d) => d.bagts === bagts && d.seq === seq)
    .slice()
    .sort((a, b) => a.rev - b.rev);
}

/** Тухайн (bagts, seq)-ийн ХАМГИЙН СҮҮЛИЙН хувилбар — жагсаалтад үүнийг л харуулна */
export function latest(docs: readonly MsDoc[]): MsDoc[] {
  const by = new Map<string, MsDoc>();
  for (const d of docs) {
    const k = `${d.bagts}|${d.seq}`;
    const cur = by.get(k);
    if (!cur || d.rev > cur.rev) by.set(k, d);
  }
  return [...by.values()];
}
