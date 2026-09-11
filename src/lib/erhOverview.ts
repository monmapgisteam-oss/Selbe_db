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
 * ⚠️ ЭНЭ ФАЙЛ ЗӨВХӨН УНШИНА — бичих зам ОГТ байхгүй. Тойм нь одоо байгаа
 * таван дэд системээс ГАРНА, өөрийн хадгалалтгүй. Ингэснээр «тойм зөрсөн»
 * гэсэн ангилалын алдаа үүсэх боломжгүй.
 *
 * ⚠️ React импортлохгүй — `erhOverview.check.mjs` шууд Node дээр ачаална.
 */

import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { STAGE_ORDER, type Stage } from './hyanalt';
import { ALL_BAGTS } from './scopedAcl';

/* ── Тоймд хэрэгтэй хэмжээгээр нь эх сурвалжийг тодорхойлно ──
   ⚠️ ЖИНХЭНЭ модулиудыг ЭНД импортлохгүй: тэдгээр нь `localStorage`-тай
      'use client' модулиуд тул цэвэр тооцоог тестлэхэд саад болно.
      Дуудагч нь бэлэн өгөгдлийг дамжуулна. */

/** Гүйцэтгэлийн урсгалын томилгоо (`guitsetgelAcl.Assign`) */
export type FlowRow = { user: string; stage: Stage; bagts: string[] };
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
  /** Урсгалын шат (`null` = томилогдоогүй) ба багцууд */
  flow: { stage: Stage; bagts: string[] | null } | null;
  qaqc: string[] | null;
  huvaari: RoleLine[];
  obyem: RoleLine[];
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
  const caps = src.caps[k] ?? [];
  const views = src.views[k] ?? { open: 0, total: 0 };

  return {
    user,
    flow: f ? { stage: f.stage, bagts: bagtsOf(f.bagts) } : null,
    qaqc: q ? bagtsOf(q.bagts) : null,
    huvaari,
    obyem,
    caps,
    views,
    any: !!f || !!q || huvaari.length > 0 || obyem.length > 0 || caps.length > 0,
  };
}

/** Нэг багцад хэн юу хариуцаж байгаа */
export type PkgErh = {
  bagts: string;
  /** Шат бүрийн эзэд (олон байж болно) */
  flow: Record<Stage, string[]>;
  qaqc: string[];
  /** Үүрэг → эзэд */
  huvaari: Record<string, string[]>;
  obyem: Record<string, string[]>;
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
      src.flow.filter((x) => x.stage === st && covers(x.bagts, bagts)).map((x) => x.user),
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

  return { bagts, flow, qaqc, huvaari, obyem, issues: pkgIssues(bagts, flow, huvaari, obyem) };
}

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
): PkgIssue[] {
  const out: PkgIssue[] = [];

  /* ── Хуваарь ── */
  const hA = huvaari.author ?? [];
  const hB = huvaari.approver ?? [];
  if (hA.length && !hB.length) {
    out.push({ tone: 'bad', key: 'huvaariNoApprover', args: [bagts] });
  } else if (hA.length && hB.length && hB.every((u) => hA.includes(u))) {
    /* ⚠️ Зохиогч=батлагч: `decidePlan` өөрийгөө батлахыг ТАТГАЛЗДАГ тул
       илгээсэн хуваарийг хэн ч батлах боломжгүй — багц бүхэлдээ гацна. */
    out.push({ tone: 'bad', key: 'huvaariSelfApprove', args: [bagts, hB.join(', ')] });
  }

  /* ── Обьём — хуваарьтай ИЖИЛ дүрэм ── */
  const oA = obyem.editor ?? [];
  const oB = obyem.approver ?? [];
  if (oA.length && !oB.length) {
    out.push({ tone: 'bad', key: 'obyemNoApprover', args: [bagts] });
  } else if (oA.length && oB.length && oB.every((u) => oA.includes(u))) {
    out.push({ tone: 'bad', key: 'obyemSelfApprove', args: [bagts, oB.join(', ')] });
  }

  /* ── Гүйцэтгэлийн урсгал — дөрвөн шат бүрэн байх ёстой ── */
  const gaps = STAGE_ORDER.filter((st) => flow[st].length === 0);
  if (gaps.length && gaps.length < STAGE_ORDER.length) {
    /* ⚠️ БҮГД хоосон бол тэр багцад урсгал хараахан эхлээгүй — анхааруулга
       хэрэггүй. Харин ЗАРИМ нь хоосон бол илгээлт тэр шатанд ЗОГСОНО. */
    out.push({ tone: 'bad', key: 'flowGap', args: [bagts, String(gaps.length)] });
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
