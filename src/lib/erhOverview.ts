'use client';

/**
 * ЭРХИЙН НЭГДСЭН ТОЙМ — «хэн юу хийж чадах вэ» ба «багц бүрд хэн байгаа вэ».
 *
 * ⚠️ ЯАГААД ЭНЭ ФАЙЛ БАЙХ ЁСТОЙ ВЭ (2026-09-09). Админ панел нь ТАВАН
 * бүлэгт хуваагдсан бөгөөд тус бүр нь ӨӨР асуултад хариулдаг:
 *     Хэрэглэгчдийн эрх · Гүйцэтгэлийн урсгал · Чанар · Хуваарь · Обьём
 * Гэвч админд байнга гардаг ХОЁР асуултад хариулах газар БАЙХГҮЙ байв:
 *
 *   1. «Батбаяр юу хийж чадах вэ?» — таван бүлгийг тус тусад нь нээж,
 *      түүний нэрийг хайх ёстой.
 *   2. «Багц 3.1-ийг хэн хариуцаж байна?» — мөн адил.
 *
 * Улмаас гацаа нь ЗӨВХӨН гарсны дараа мэдэгддэг: батлагч томилоогүй багц
 * илгээлт хүлээн авах хүртэл чимээгүй, зохиогч=батлагч болсон багц
 * `decidePlan` татгалзах хүртэл чимээгүй.
 *
 * ⚠️ ЭНЭ ФАЙЛ ЗӨВХӨН УНШИНА — бичих зам ОГТ байхгүй (матрицын засвар нь
 * `aclOps.ts`-ээр явна, 2026-09-25). Тойм нь одоо байгаа
 * таван дэд системээс ГАРНА, өөрийн хадгалалтгүй. Ингэснээр «тойм зөрсөн»
 * гэсэн ангилалын алдаа үүсэх боломжгүй.
 *
 * ⚠️ React импортлохгүй — `erhOverview.check.mjs` шууд Node дээр ачаална.
 */

import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { STAGE_ORDER, type Stage } from './hyanalt';
import { ALL_BAGTS } from './scopedAcl';
import type { CapKey } from './caps';
import { QAQC_CAP, ROLE_CAPS, SCOPED_SYSTEMS, capSystem, rolesOfCap } from './aclRoleCaps';

/* ── Тоймд хэрэгтэй хэмжээгээр нь эх сурвалжийг тодорхойлно ──
   ⚠️ ЖИНХЭНЭ модулиудыг ЭНД импортлохгүй: тэдгээр нь `localStorage`-тай
      'use client' модулиуд тул цэвэр тооцоог тестлэхэд саад болно.
      Дуудагч нь бэлэн өгөгдлийг дамжуулна. */

/** Гүйцэтгэлийн урсгалын томилгоо (`guitsetgelAcl.Assign`) */
/** ⚠️ `viewOnly` (2026-09-24): томилогдсон ч зөвхөн харна — шатны эзэн БИШ */
export type FlowRow = { user: string; stage: Stage; bagts: string[]; viewOnly?: boolean };
/** Багцын хуваарилалт — үүрэгтэй (хуваарь · обьём) эсвэл үүрэггүй (чанар) */
/**
 * ⚠️ ҮҮРЭГ БҮР ӨӨРИЙН БАГЦТАЙ (2026-09-09). Урьд нь `{roles[], bagts[]}`
 *    байсан нь энэ файлд ХУДАЛ СЭРЭМЖЛҮҮЛЭГ төрүүлдэг байв: «Багц 1-д
 *    зохиогч, Багц 5-д батлагч» хүнийг Багц 1 дээр «өөрөө зохиож өөрөө
 *    батална» гэж гэрчилдэг байсан. Одоо grant тус бүрийг ТУСАД нь үзнэ.
 */
export type ScopedRow = { user: string; grants: { role: string; bagts: string[] }[] };

export type ErhSource = {
  /** Порталын БҮХ аккаунт (жижиг үсгээр биш, харагдах хэлбэрээр) */
  users: string[];
  flow: FlowRow[];
  /** ⚠️ Чанар нь ҮҮРЭГГҮЙ — grant биш, шууд багцын жагсаалт */
  qaqc: { user: string; bagts: string[] }[];
  huvaari: ScopedRow[];
  obyem: ScopedRow[];
  /** Чанарын баримт — 4 үүрэг (author · tuh · chanar · habea), 2026-09-16 */
  chanar: ScopedRow[];
  /**
   * Нэмэлт ажил (editor · approver) ба дэд бүтцийн засвар (editor), 2026-09-23.
   * ⚠️ СОНГОМОЛ — `erhOverview.check.mjs`-ийн хуучин `empty()` эх сурвалж
   *    эдгээргүй тул байхгүйг `[]` гэж үзнэ.
   * ⚠️ `butets`-ийн багц нь `BUTETS_PACKS` түлхүүр (25 багц) — `PKG_GROUPS` БИШ,
   *    тиймээс багцын тоймд (`pkgErh`) ОРОХГҮЙ, зөвхөн хүний тоймд гарна.
   */
  ajil?: ScopedRow[];
  butets?: ScopedRow[];
  /**
   * Хатуу `super` аккаунтууд (2026-09-24). ⚠️ `roleForUser`-ыг ЭНД
   *    импортлохгүй (дээрх шалтгаан) — дуудагч өгнө. СОНГОМОЛ: хуучин тест
   *    эх сурвалж нь энэгүй.
   */
  supers?: string[];
  /** Аккаунт → нэмэлт эрхүүд (`caps.capsOf`) */
  caps: Record<string, string[]>;
  /** Аккаунт → нээлттэй харагдацын тоо ба нийт */
  views: Record<string, { open: number; total: number }>;
};

/** Нэг хүний нэг дэд систем дэх үүрэг */
export type RoleLine = {
  /** Үүргийн түлхүүр (`author`/`approver`/`editor`) — чанарт хоосон */
  role: string;
  /** Багцууд. `null` = БҮХ багц. */
  bagts: string[] | null;
};

/** Нэг хүний БҮРЭН эрхийн зураг */
export type UserErh = {
  user: string;
  /** Урсгалын шат (`null` = томилогдоогүй) ба багцууд; `viewOnly` = зөвхөн харна */
  flow: { stage: Stage; bagts: string[] | null; viewOnly: boolean } | null;
  /** Хатуу super — бүх багц, бүх шат; хуваарилалт түүнд үйлчилдэггүй */
  superUser: boolean;
  qaqc: string[] | null;
  /**
   * QAQC мөр БАЙГАА эсэх (2026-09-25). ⚠️ `qaqc`-ийн `null` нь ХОЁР утгатай
   *    (мөргүй · «бүх багц») тул өнчин эрхийн шалгуур үүнийг хэрэглэнэ.
   */
  qaqcAssigned: boolean;
  huvaari: RoleLine[];
  obyem: RoleLine[];
  chanar: RoleLine[];
  ajil: RoleLine[];
  /** Дэд бүтцийн засвар — багц нь `BUTETS_PACKS` түлхүүр */
  butets: RoleLine[];
  caps: string[];
  views: { open: number; total: number };
  /** Ямар нэг эрх байгаа эсэх — «юу ч хийхгүй» аккаунтыг ялгана */
  any: boolean;
};

const norm = (s: string) => s.trim().toLowerCase();

/** `[ALL_BAGTS]` → `null` (=бүх багц); хоосон → `[]` */
const bagtsOf = (b: string[]): string[] | null =>
  (b.includes(ALL_BAGTS) ? null : b);

/** Нэг хүний бүх эрхийг цуглуулна */
export function userErh(src: ErhSource, user: string): UserErh {
  const k = norm(user);
  const f = src.flow.find((x) => norm(x.user) === k);
  const q = src.qaqc.find((x) => norm(x.user) === k);

  const lines = (rows: ScopedRow[]): RoleLine[] => {
    const r = rows.find((x) => norm(x.user) === k);
    if (!r) return [];
    return r.grants.map((g) => ({ role: g.role, bagts: bagtsOf(g.bagts) }));
  };

  const huvaari = lines(src.huvaari);
  const obyem = lines(src.obyem);
  const chanar = lines(src.chanar);
  const ajil = lines(src.ajil ?? []);
  const butets = lines(src.butets ?? []);
  const caps = src.caps[k] ?? [];
  const views = src.views[k] ?? { open: 0, total: 0 };
  const superUser = (src.supers ?? []).some((x) => norm(x) === k);

  return {
    user,
    flow: f ? { stage: f.stage, bagts: bagtsOf(f.bagts), viewOnly: f.viewOnly === true } : null,
    superUser,
    qaqc: q ? bagtsOf(q.bagts) : null,
    qaqcAssigned: !!q,
    huvaari,
    obyem,
    chanar,
    ajil,
    butets,
    caps,
    views,
    /* ⚠️ super нь бүх эрхтэй — «эрх олгоогүй» гэж харуулахгүй (2026-09-24) */
    any: superUser || !!f || !!q || huvaari.length > 0 || obyem.length > 0 || chanar.length > 0
      || ajil.length > 0 || butets.length > 0 || caps.length > 0,
  };
}

/** Нэг багцад хэн юу хариуцаж байгаа */
export type PkgErh = {
  bagts: string;
  /** Шат бүрийн эзэд (олон байж болно) */
  flow: Record<Stage, string[]>;
  /**
   * Шат бүрийн «Зөвхөн харна» томилгоо (2026-09-25) — ЭЗЭН БИШ (`flow`-д
   * ороогүй), матрицад саарал харагдана. ⚠️ Зөвхөн харагчтай шат нь
   * `flowGap`-д хоосон гэж тоологдоно — илгээлт тэнд зогсоно.
   */
  flowViewers: Record<Stage, string[]>;
  qaqc: string[];
  /** Үүрэг → эзэд */
  huvaari: Record<string, string[]>;
  obyem: Record<string, string[]>;
  chanar: Record<string, string[]>;
  /** Нэмэлт ажил — editor · approver (2026-09-23) */
  ajil: Record<string, string[]>;
  /** Гацаа ба цоорхойн жагсаалт — `pkgIssues` бөглөнө */
  issues: PkgIssue[];
};

export type PkgIssue = {
  /** `bad` = ажил ГАЦНА · `warn` = дутуу ч ажиллана */
  tone: 'bad' | 'warn';
  /** Хэл рүү орчуулахад бэлэн ТҮЛХҮҮР ба утгууд (`tr` нь дуудагч талд) */
  key: string;
  /** `{0}`, `{1}` … орлуулга */
  args: string[];
  /**
   * Матрицын аль баганыг улаан/шар болгох вэ (`MATRIX_COLS[].id`, 2026-09-25).
   * ⚠️ СОНГОМОЛ — нэмэлт талбар; хуучин дуудагч (тойм) үл тоомсорлоно.
   */
  cols?: string[];
};

/** Тухайн багцад тэр мөр хамаарах уу (`ALL_BAGTS` бүгдэд) */
const covers = (b: string[], g: string): boolean =>
  b.includes(ALL_BAGTS) || b.includes(g);

/**
 * Нэг багцын эрхийн зураг ба ЦООРХОЙ.
 *
 * ⚠️ ГАЦААГ УРЬДЧИЛЖ ХЭЛНЭ. Одоо систем нь гацахыг ХҮЛЭЭДЭГ: батлагч
 *    томилоогүй багц илгээлт ирэх хүртэл чимээгүй, зохиогч=батлагч болсон
 *    багц `decidePlan` татгалзах хүртэл чимээгүй. Энд тэдгээрийг ажил
 *    зогсохоос ӨМНӨ ил гаргана.
 */
export function pkgErh(src: ErhSource, bagts: string): PkgErh {
  const flow = Object.fromEntries(
    STAGE_ORDER.map((st) => [
      st,
      /* ⚠️ `viewOnly` томилгоо шатны эзэн БИШ (2026-09-24) — `canReview: false`
         тул тэр шатанд илгээлт зогсоно; эзний жагсаалт ба `flowGap`-д оруулахгүй */
      src.flow.filter((x) => x.stage === st && !x.viewOnly && covers(x.bagts, bagts)).map((x) => x.user),
    ]),
  ) as Record<Stage, string[]>;
  const flowViewers = Object.fromEntries(
    STAGE_ORDER.map((st) => [
      st,
      src.flow.filter((x) => x.stage === st && x.viewOnly && covers(x.bagts, bagts)).map((x) => x.user),
    ]),
  ) as Record<Stage, string[]>;

  const qaqc = src.qaqc.filter((x) => covers(x.bagts, bagts)).map((x) => x.user);

  const byRole = (rows: ScopedRow[]): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      /* ⚠️ Grant ТУС БҮРИЙГ шалгана — тэр үүрэг ТЭР багцад олгогдсон эсэх */
      for (const g of r.grants) {
        if (!covers(g.bagts, bagts)) continue;
        if (!(out[g.role] ??= []).includes(r.user)) out[g.role].push(r.user);
      }
    }
    return out;
  };

  const huvaari = byRole(src.huvaari);
  const obyem = byRole(src.obyem);
  const chanar = byRole(src.chanar);
  const ajil = byRole(src.ajil ?? []);

  return {
    bagts, flow, flowViewers, qaqc, huvaari, obyem, chanar, ajil,
    issues: pkgIssues(bagts, flow, huvaari, obyem, chanar, ajil),
  };
}

/**
 * ӨӨРӨӨС НЬ ӨӨР БАТЛАГЧГҮЙ ЗОХИОГЧ БАЙНА УУ (2026-09-25, аудитын засвар).
 *
 * ⚠️ `decidePlan` · `decideObyem` · `decideAjil` · `chanarMs.review` нь ЗӨВХӨН
 *    тухайн илгээлтийн зохиогч = батлагч тохиолдлыг татгалздаг. Тиймээс гацаа
 *    нь «бүх батлагч зохиогч мөн» биш, «ЯМАР НЭГ зохиогчид өөрөөс нь өөр
 *    батлагч алга». A, B хоёулаа хоёр үүрэгтэй бол бие биенийхээ илгээлтийг
 *    батална; урьдын дүрэм үүнийг худал «гацаа» гэж, админ хүчинтэй
 *    батлагчийг хасахад хүргэж болох байв.
 */
const noOther = (authors: string[], approvers: string[]): boolean =>
  authors.some((a) => !approvers.some((b) => b !== a));

/**
 * Багцын ЦООРХОЙГ илрүүлнэ.
 *
 * ⚠️ ЗӨВХӨН БОДИТ саадыг хэлнэ. «Чанарын ажилтан алга» гэдэг нь ажил
 *    зогсоохгүй (чанарын баримт хойшилно) тул `warn`; «батлагч алга» нь
 *    илгээсэн хуваарь МӨНХӨД хүлээнэ гэсэн үг тул `bad`.
 */
function pkgIssues(
  bagts: string,
  flow: Record<Stage, string[]>,
  huvaari: Record<string, string[]>,
  obyem: Record<string, string[]>,
  chanar: Record<string, string[]>,
  ajil: Record<string, string[]> = {},
): PkgIssue[] {
  const out: PkgIssue[] = [];

  /* ── Чанарын баримт — ГУРВАН хянагч БҮГД зөвшөөрөх ёстой ── */
  const cA = chanar.author ?? [];
  if (cA.length) {
    /* ⚠️ Зохиогчоос ӨӨР хүн тухайн хянагчийн үүрэгт байх ёстой —
       `chanarMs.review` зохиогч=хянагчийг татгалздаг тул зохиогч л
       томилогдсон үүрэг нь «томилоогүй»-тэй адил. Нэг ч үүрэг дутвал
       `resolve` хэзээ ч «Батлагдсан» өгөхгүй → багцын аргачлал МӨНХӨД хүлээнэ. */
    /* ⚠️ ЗОХИОГЧ БҮРЭЭР (2026-09-25, аудитын засвар). Урьд нь «тухайн үүргийн
       бүх хянагч зохиогч мөн» бол дутуу гэдэг байв — A, B хоёулаа зохиогч
       БА ТУХ бол A-гийнхыг B, B-гийнхыг A хянана, гацаагүй. `review` нь
       ЗӨВХӨН тэр баримтын зохиогч=хянагчийг татгалздаг тул дутуу гэдэг нь:
       ЯМАР НЭГ зохиогчид өөрөөс нь ӨӨР хянагч тэр үүрэгт байхгүй. */
    const missing = ['tuh', 'chanar', 'habea']
      .filter((r) => noOther(cA, chanar[r] ?? []));
    if (missing.length) {
      out.push({ tone: 'bad', key: 'chanarNoReviewer', args: [bagts, missing.join(', ')], cols: missing.map((r) => `chanar:${r}`) });
    }
  }

  /* ── Хуваарь ── */
  const hA = huvaari.author ?? [];
  const hB = huvaari.approver ?? [];
  if (hA.length && !hB.length) {
    out.push({ tone: 'bad', key: 'huvaariNoApprover', args: [bagts], cols: ['huvaari:approver'] });
  } else if (hA.length && hB.length && noOther(hA, hB)) {
    /* ⚠️ Зохиогч=батлагч: `decidePlan` өөрийгөө батлахыг ТАТГАЛЗДАГ тул
       өөр батлагчгүй зохиогчийн илгээсэн хуваарийг хэн ч батлахгүй — гацна.
       ⚠️ `hB.every(u => hA.includes(u))` БИШ (2026-09-25): A, B хоёулаа
       зохиогч БА батлагч бол бие биенийхээ хуваарийг батална — худал «гацаа». */
    out.push({ tone: 'bad', key: 'huvaariSelfApprove', args: [bagts, hB.join(', ')], cols: ['huvaari:author', 'huvaari:approver'] });
  }

  /* ── Обьём — хуваарьтай ИЖИЛ дүрэм ── */
  const oA = obyem.editor ?? [];
  const oB = obyem.approver ?? [];
  if (oA.length && !oB.length) {
    out.push({ tone: 'bad', key: 'obyemNoApprover', args: [bagts], cols: ['obyem:approver'] });
  } else if (oA.length && oB.length && noOther(oA, oB)) {
    out.push({ tone: 'bad', key: 'obyemSelfApprove', args: [bagts, oB.join(', ')], cols: ['obyem:editor', 'obyem:approver'] });
  }

  /* ── Нэмэлт ажил — обьёмтой ИЖИЛ дүрэм (`ajilBatlah.decideAjil` зохиогч=батлагчийг татгалзана) ── */
  const aA = ajil.editor ?? [];
  const aB = ajil.approver ?? [];
  if (aA.length && !aB.length) {
    out.push({ tone: 'bad', key: 'ajilNoApprover', args: [bagts], cols: ['ajil:approver'] });
  } else if (aA.length && aB.length && noOther(aA, aB)) {
    out.push({ tone: 'bad', key: 'ajilSelfApprove', args: [bagts, aB.join(', ')], cols: ['ajil:editor', 'ajil:approver'] });
  }

  /* ── Гүйцэтгэлийн урсгал — зургаан шат бүрэн байх ёстой ── */
  const gaps = STAGE_ORDER.filter((st) => flow[st].length === 0);
  if (gaps.length && gaps.length < STAGE_ORDER.length) {
    /* ⚠️ БҮГД хоосон бол тэр багцад урсгал хараахан эхлээгүй — анхааруулга
       хэрэггүй. Харин ЗАРИМ нь хоосон бол илгээлт тэр шатанд ЗОГСОНО. */
    out.push({ tone: 'bad', key: 'flowGap', args: [bagts, String(gaps.length)], cols: gaps.map((st) => `flow:${st}`) });
  }

  return out;
}

/** Бүх багцын тойм — админы «юу дутуу вэ» дэлгэц */
export const allPkgErh = (src: ErhSource): PkgErh[] =>
  PKG_GROUPS.map((g) => pkgErh(src, g));

/** Бүх хэрэглэгчийн тойм — эрхгүй нь СҮҮЛД */
export const allUserErh = (src: ErhSource): UserErh[] =>
  src.users
    .map((u) => userErh(src, u))
    .sort((a, b) => Number(b.any) - Number(a.any) || a.user.localeCompare(b.user, 'mn'));

/* ══════════════════ БАГЦ × СИСТЕМИЙН МАТРИЦ (2026-09-25) ══════════════════ */

/** Матрицын нэг баганы систем */
export type MatrixSys = 'flow' | 'huvaari' | 'obyem' | 'ajil' | 'chanar' | 'qaqc';

/** Матрицын багана — `id` нь `PkgIssue.cols`-той таарна */
export type MatrixCol = { id: string; sys: MatrixSys; role: string };

/**
 * АРВАН ДОЛООН БАГАНА: урсгал ×6 · Хуваарь ×2 · Обьём ×2 · Нэмэлт ажил ×2 ·
 * Чанарын баримт ×4 · QAQC ×1.
 * ⚠️ Дэд бүтэц ОРОХГҮЙ — багц нь `BUTETS_PACKS` (25), `PKG_GROUPS` биш;
 *    тусдаа хүснэгтэд (`butetsRows`).
 * ⚠️ Шошго ЭНД БИШ — `tr()` зурагдах агшинд (React талд).
 */
export const MATRIX_COLS: MatrixCol[] = [
  ...STAGE_ORDER.map((st): MatrixCol => ({ id: `flow:${st}`, sys: 'flow', role: st })),
  ...(['huvaari', 'obyem', 'ajil', 'chanar'] as const).flatMap((sys) =>
    Object.keys(ROLE_CAPS[sys]).map((role): MatrixCol => ({ id: `${sys}:${role}`, sys, role }))),
  { id: 'qaqc:', sys: 'qaqc', role: '' },
];

/** Матрицын нэг нүд */
export type MatrixCell = {
  /** Эзэд — тэр үүрэг/шатыг тэр багцад эзэмшдэг */
  owners: string[];
  /** «Зөвхөн харна» томилгоо — ЭЗЭН БИШ (урсгалын баганад л) */
  viewers: string[];
  /** `bad` — ажил гацна · `warn` — дутуу · `null` — хэвийн */
  tone: 'bad' | 'warn' | null;
};

export type MatrixRow = { bagts: string; cells: Record<string, MatrixCell>; issues: PkgIssue[] };

/**
 * Багц бүрийн мөр — нүд бүрд эзэд, харагчид ба өнгө.
 * ⚠️ ӨНГӨ нь `pkgIssues`-ийн `cols`-оос ГАРНА — дүрмийг энд ДАХИН бичихгүй
 *    (хоёр газар бичвэл тойм ба матриц зөрнө).
 * ⚠️ Хатуу super-ийг нүд бүрд нэмэхгүй — тэр нь бүх багцад (UI-ийн тайлбарт).
 */
export function pkgMatrix(src: ErhSource): MatrixRow[] {
  return allPkgErh(src).map((p) => {
    const cells: Record<string, MatrixCell> = {};
    for (const c of MATRIX_COLS) {
      const owners = c.sys === 'flow' ? p.flow[c.role as Stage]
        : c.sys === 'qaqc' ? p.qaqc
          : (p[c.sys][c.role] ?? []);
      const viewers = c.sys === 'flow' ? p.flowViewers[c.role as Stage] : [];
      const hit = p.issues.filter((i) => i.cols?.includes(c.id));
      const tone = hit.some((i) => i.tone === 'bad') ? 'bad' : hit.length ? 'warn' : null;
      cells[c.id] = { owners, viewers, tone };
    }
    return { bagts: p.bagts, cells, issues: p.issues };
  });
}

/**
 * ДЭД БҮТЦИЙН ХҮСНЭГТ — `BUTETS_PACKS` × «Засварлагч».
 * ⚠️ `packs`-ийг дуудагч өгнө: `butetsPacks.ts` нь `services`-ийн давхаргын
 *    бүртгэлийг ачаалдаг тул энэ цэвэр файл импортлохгүй.
 */
export function butetsRows(
  src: ErhSource, packs: { key: string; name: string }[],
): { key: string; name: string; editors: string[] }[] {
  const rows = src.butets ?? [];
  return packs.map((p) => ({
    key: p.key,
    name: p.name,
    editors: rows
      .filter((r) => r.grants.some((g) => g.role === 'editor' && covers(g.bagts, p.key)))
      .map((r) => r.user),
  }));
}

/* ══════════════ ГАРГАЛГААТАЙ ЭРХ ↔ ХУВААРИЛАЛТ (2026-09-25) ══════════════ */

/** Тухайн системийн мөрүүд (`UserErh`-ээс) */
const linesOf = (u: UserErh, sys: (typeof SCOPED_SYSTEMS)[number]): RoleLine[] => u[sys];

/**
 * ЭРХИЙН ЭХ СУРВАЛЖ БОЛСОН БАГЦУУД.
 *   · `null` — бүх багц (`ALL_BAGTS`)
 *   · `[]`   — хуваарилалтгүй (энгийн эрх, эсвэл өнчин)
 *   · `[…]`  — заасан багцууд
 * ⚠️ Чанарын `chanarReview` — гурван хянагчийн АЛЬ Ч нь эх сурвалж болно.
 */
export function capBacking(u: UserErh, cap: CapKey): string[] | null {
  const sys = capSystem(cap);
  if (!sys) return [];
  if (sys === 'qaqc') return u.qaqcAssigned ? u.qaqc : [];
  const roles = rolesOfCap(cap);
  const lines = linesOf(u, sys).filter((l) => roles.includes(l.role));
  if (lines.some((l) => l.bagts === null)) return null;
  return [...new Set(lines.flatMap((l) => l.bagts ?? []))];
}

/** Эх сурвалж (хуваарилалт) байгаа эсэх */
const backed = (u: UserErh, cap: CapKey): boolean => {
  if (cap === QAQC_CAP) return u.qaqcAssigned;
  const b = capBacking(u, cap);
  return b === null || b.length > 0;
};

/**
 * ӨНЧИН ЭРХ — асаалттай атлаа тэр системд түүн рүү заадаг үүрэг алга.
 * ⚠️ Хатуу super-т ХЭЗЭЭ Ч үгүй: түүнд хуваарилалт үйлчилдэггүй тул эрхийг
 *    шууд унтраалгаар олгодог (`setGrants` super-ийг татгалздаг).
 * ⚠️ Энгийн дөрвөн эрх өнчин болохгүй — тэдгээр нь хуваарилалтгүй.
 * ⚠️ UI нь ЗӨВХӨН бүх ACL уншигдсаны дараа харуулна — эс бөгөөс `[]`
 *    жагсаалтаас ХУДАЛ өнчин гарна. Автоматаар ЮУ Ч хасахгүй.
 */
export function orphanCaps(u: UserErh): CapKey[] {
  if (u.superUser) return [];
  return (u.caps as CapKey[]).filter((c) => capSystem(c) !== null && !backed(u, c));
}

/**
 * ЭСРЭГ ТОХИОЛДОЛ — хуваарилалт бий атлаа эрх алга (эрх олголт унасан).
 * ⚠️ Зөвхөн АНХААРУУЛГА: засах зам нь хуваарилалтыг дахин хадгалах (`syncCaps`).
 */
export function missingCaps(u: UserErh): CapKey[] {
  if (u.superUser) return [];
  const out = new Set<CapKey>();
  if (u.qaqcAssigned && !u.caps.includes(QAQC_CAP)) out.add(QAQC_CAP);
  for (const sys of SCOPED_SYSTEMS) {
    const map = ROLE_CAPS[sys] as Readonly<Record<string, CapKey>>;
    for (const l of linesOf(u, sys)) {
      const c = map[l.role];
      if (c && !u.caps.includes(c)) out.add(c);
    }
  }
  return [...out];
}
