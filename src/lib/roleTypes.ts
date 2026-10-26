'use client';

/**
 * ЭРХИЙН ТӨРӨЛ — 11 төрөл (2026-10-23-нд 10-аас — «Төлөвлөлтийн инженер» нэмэгдэв) × ХАРАХ тохиргоо (2026-09-25 · 2026-09-30).
 *
 * ⚠️ ЯАГААД (хэрэглэгчийн шийдвэр). Урьд нь хэрэглэгчийн «үүрэг» нь гурван
 *    preset (Супер · Энгийн · Төлөвлөлт) байж, харагдацыг хүн бүрд тусад нь
 *    өгдөг байв. Одоо төрөл бүрд юу ХАРАХ (харагдац · ТЭЗҮ-БОНУ · нүүр цонх ·
 *    админ самбар) нэг загвартай; хэрэглэгчид төрөл сонгоод «Төрлөөр тохируулах»
 *    дарахад харагдац нь нэг дор бичигдэнэ (`roleTypeApply.ts`).
 *
 * ⚠️ ЗӨВХӨН ХАРАХ (2026-09-30, хэрэглэгчийн шийдвэр). Урьд нь загварт засах эрх
 *    (`cap:*`), чанарын үүрэг (`chanar:*`), урсгал (`flow:*`), багцын хүрээ
 *    (`scope`) ч байж, «Төрлөөр тохируулах» нь хуваарилалт бичдэг байв. Одоо
 *    засах эрх БҮР админ порталын ӨӨРИЙН хуудсанд багц/аккаунтаар олгогдоно;
 *    загвар тэднийг ОГТ хөндөхгүй. Хүснэгтэд хадгалсан хуучин загварын
 *    `cap:*` · `chanar:*` · `flow:*` id нь `KNOWN` шүүлтээр ЧИМЭЭГҮЙ хаягдана
 *    (fail-closed — `cleanTpl`).
 * ⚠️ ХАРАГДАЦ ба НҮҮР ЦОНХ нь ШУУД загвараас (`roleAccess`) — урсгалын
 *    томилгоо (`grantFlowAccess`) ба «Сэргээх» нь `ROLE_ACCESS`-ийн оронд
 *    үүнийг уншдаг; шатанд томилогдсон хүнд «Гүйцэтгэл» хуудсыг
 *    `grantFlowAccess` өөрөө нэмдэг (загвараас хамаарахгүй).
 *
 * ⚠️ Анхдагч загвар = хэрэглэгчийн 2026-09-25-нд чеклэсэн хүснэгтийн ХАРАХ хэсэг.
 *    Хүснэгтэд (`__type__:` мөр) хадгалсан загвар байвал тэр давамгайлна.
 */

import { t as tr } from './i18nCore';
import { ROLE_ACCESS, VIEWS, type Role, type ViewKey } from './services';
import { WORKFLOW_VIEWS } from './caps';

/**
 * ⚠️ ЗАГВАРТ ОРОХ ХАРАГДАЦ — урсгалтай 6-г ХАСНА (2026-09-30, хэрэглэгчийн
 *    шийдвэр): Гүйцэтгэл · Хуваарь · Хуваарь батлах · Нэмэлт ажил батлах · Чанарын
 *    баримт · Чанар (QAQC) нь урсгалын хуваарилалтаар нээгдэнэ (`caps.WORKFLOW_VIEWS`).
 *    Загвар зөвхөн харах хуудас олгоно; хадгалсан хуучин загварын тэдгээр id
 *    `cleanTpl`-д хаягдана.
 */
const TPL_VIEWS = VIEWS.filter((v) => !WORKFLOW_VIEWS.includes(v.key));

/** Сонгох 11 төрөл (⚠️ 2026-10-23: `tolovloltiin` нэмэгдэв) — дараалал нь урсгалын шат, дараа нь урсгалын бус, эцэст нь super */
export const TYPE_ORDER: readonly Role[] = [
  'guitsetgegch', 'injener', 'menejer', 'tolovloltiin', 'eronhii', 'heltsiin', 'gazriin',
  /* ⚠️ 2026-10-23: «Ерөнхий захирал» — удирдлагын (урсгалын долоон шат) дараа; зөвхөн харах, урсгалын шат биш */
  'zahiral',
  'taniltsah', 'chanar', 'gazar', 'super',
];

export const isTypeRole = (r: Role | null | undefined): r is Role => !!r && TYPE_ORDER.includes(r);

/**
 * ШИНЭ АККАУНТЫН АНХДАГЧ ТӨРӨЛ (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 * ⚠️ Урьд нь «Нэмэх» нь ХУУЧИН `tolovlolt`-ийг («Төлөвлөлт (хуучин)») өгдөг байв — 10 төрлийн
 *    сонгогчид байхгүй тул идэвхгүй сонголтоор харагдаж, «Эрхийн төрөл»-ийн загвар (нүүр цонх ·
 *    харагдац) хэзээ ч үйлчилдэггүй. Одоо ХАРАХ-ын хамгийн тайван төрөл — «Мэдээлэл танилцах»:
 *    засах эрх, урсгалын шат ОГТ дагалддаггүй (`roleTypes` нь зөвхөн харах загвар); харагдац
 *    нь загвараас (`roleAccess`). Админ хадгалахаас өмнө ноорогт өөр төрөл сонгож болно.
 */
export const NEW_ACCOUNT_ROLE: Role = 'taniltsah';

/* ⚠️ Текстийг ЗУРАГДАХ агшинд — модулийн түвшинд `tr()` дуудвал хэл солиход хоцорно */
export function typeLabel(r: Role): string {
  if (r === 'guitsetgegch') return tr('Гүйцэтгэгч компани');
  if (r === 'injener') return tr('Хяналтын инженер');
  if (r === 'menejer') return tr('Багцын ахлах инженер');
  /* ⚠️ 2026-10-23: шинэ шат — ХУУЧИН `tolovlolt` («Төлөвлөлт (хуучин)») биш */
  if (r === 'tolovloltiin') return tr('Төлөвлөлтийн инженер');
  if (r === 'eronhii') return tr('Төлөвлөлтийн ахлах инженер');
  if (r === 'heltsiin') return tr('Хэлтсийн дарга');
  if (r === 'gazriin') return tr('Газрын дарга');
  if (r === 'zahiral') return tr('Ерөнхий захирал');
  if (r === 'taniltsah') return tr('Мэдээлэл танилцах');
  if (r === 'chanar') return tr('Чанар');
  if (r === 'gazar') return tr('Газар чөлөөлөлт');
  if (r === 'super') return tr('Super');
  if (r === 'beginner') return tr('Энгийн (хуучин)');
  return tr('Төлөвлөлт (хуучин)');
}

/* ══════════════════════ Тохиргооны каталог ══════════════════════ */

/**
 * «ХУВААРЬ ХАРАХ» — ГУРВАН УТГАТАЙ ТӨРЛИЙН ТОХИРГОО (⚠️ 2026-10-26, хэрэглэгч):
 *   · `all`  — бүх багц (`on`-д `huvaari:all`)
 *   · `own`  — өөрийн багц: тухайн хүний ЯМАР НЭГ хуваарилалттай багцууд (`huvaariView.huvaariViewScope`; `on`-д `huvaari:own`)
 *   · `none` — үгүй (аль нь ч байхгүй)
 * ⚠️ `view:huvaari` БИШ: (1) 2026-09-30-аас ӨМНӨ хадгалсан хуучин загварт `view:huvaari` байж болно — тэр нь хэзээ ч
 *    админы ЭНЭ шийдвэр биш тул чимээгүй сэргэж болохгүй (`cleanTpl` хаясаар); (2) `roleAccess`-ийн `view:*` нь
 *    хэрэглэгчийн хадгалагдах `views` руу ордог (`roleTypeApply`) — урсгалтай харагдац тэнд бичигдэх ёсгүй.
 * ⚠️ Засах/илгээх/батлах эрх ОЛГОХГҮЙ — ЗӨВХӨН ХАРАХ хүрээ.
 */
export type HvScope = 'all' | 'own' | 'none';
export const HV_ALL = 'huvaari:all';
export const HV_OWN = 'huvaari:own';
const isHvId = (id: string): boolean => id === HV_ALL || id === HV_OWN;
/** `on`-оос гурван утгын нэг — хоёулаа байвал (эвдэрсэн мөр) НАРИЙН нь (`own`) */
export const hvScopeOf = (on: readonly string[]): HvScope =>
  (on.includes(HV_OWN) ? 'own' : on.includes(HV_ALL) ? 'all' : 'none');
/** `on`-ыг шинэ утгаар — бусад id хөндөгдөхгүй */
export const withHvScope = (on: readonly string[], v: HvScope): string[] =>
  [...on.filter((x) => !isHvId(x)), ...(v === 'all' ? [HV_ALL] : v === 'own' ? [HV_OWN] : [])];
/** ⚠️ «Тохиргоо» хүснэгтийн мөрийн id — сонгогчийн мөр (`on`-д ОРОХГҮЙ; утга нь `HV_ALL`/`HV_OWN`) */
export const HV_ROW = 'huvaari:scope';
/**
 * «Хуваарь харах»-ыг админ ШИЙДСЭН гэсэн тэмдэг — хадгалсан загварын `seen`-д (ViewKey, `cleanTpl`-ийн `VIEW_KEYS` шүүлтийг давна).
 * ⚠️ ЯАГААД: `on` нь зөвхөн чеклэснийг хадгалдаг тул энэ тохиргооноос ӨМНӨ хадгалсан загварт «байхгүй» = «шийдээгүй».
 *    Тэмдэггүй хадгалсан мөрд `DEFAULT_TPL`-ийн утга үйлчилнэ (`withPlanDefault`) — хадгалсан мөрийг ДАХИН БИЧИХГҮЙ.
 *    Админ тэр баганыг засаж хадгалахад тэмдэг бичигдэнэ (`tplSeenKeys`).
 */
const HUVAARI_MARK: ViewKey = 'huvaari';

/*
 * ⚠️ `SCOPED_SETTING` · `PLAIN_SETTING` · `SUPER_CAP` УСТСАН (2026-09-30) —
 *    загвар засах эрх агуулахгүй (толгойн ⚠️). Хуучин id-ууд `KNOWN`-д ОРОХГҮЙ.
 */

/**
 * ⚠️ 2026-10-26: `info` — ЗӨВХӨН МЭДЭЭЛЛИЙН мөр (загварт ХАДГАЛАГДАХГҮЙ, `KNOWN`-д алга): «Хуваарь зохиох» ·
 *    «Хуваарь батлах» нь «Хуваарийн эрх»-ээс БАГЦААР оноогдоно — хүснэгт тэр төрлийн хэдэн хүнд үүрэг байгааг л харуулна.
 */
export type SettingRow = {
  id: string; label: string; hint?: string; superOnly?: true; info?: 'author' | 'approver';
  /** ⚠️ 2026-10-26: чекбокс биш — «Бүх багц / Өөрийн багц / Үгүй» сонгогч (`HV_ROW`) */
  select?: true;
};
export type SettingGroup = { title: string; rows: SettingRow[] };

/**
 * Хүснэгтийн бүлэг ба мөрүүд — ЗУРАГДАХ агшинд (`tr`).
 * ⚠️ ЗӨВХӨН ХАРАХ (2026-09-30): харагдац · ТЭЗҮ-БОНУ · админ самбар. Засах эрхийн
 *    мөрүүд (`cap:*` · `chanar:*` · `flow:*`) ХАСАГДСАН — толгойн ⚠️.
 */
export function settingGroups(): SettingGroup[] {
  return [
    {
      title: tr('Харах цонх'),
      rows: [
        ...TPL_VIEWS.map((v) => ({ id: `view:${v.key}`, label: v.title })),
        /* ⚠️ 2026-10-23: «ТЭЗҮ · ДБОНҮ баримт үзэх» мөр ХАСАГДСАН — баримт бичгийн сан нэвтэрсэн БҮХ хэрэглэгчид нээлттэй
           (`docLib`, `Root.docsAllowed = !!access`); чекбокс юу ч хийдэггүй байсан. `docs` нь `KNOWN` · `DEFAULT_TPL` ·
           `cleanTpl`-д хадгалагдсан загвартай нийцэхийн тулд үлдэнэ. */
      ],
    },
    {
      /* ⚠️ 2026-10-26 (хэрэглэгч): «ХУВААРЬ» хэсэг. «Хуваарь харах» — загварын ЖИНХЭНЭ тохиргоо (сонгогч, `HvScope`): тэр
         төрлийн хүн «Хуваарь» хуудсыг тэр хүрээгээр ЗӨВХӨН ХАРНА (`huvaariView.huvaariViewScope` → харагдац; засах/илгээх/
         батлах эрх ОЛГОХГҮЙ — тэдгээр нь `huvaariScope` · `addRow`-оор хэвээр). Хэрэглэгчийн `views`-д БИЧИГДЭХГҮЙ (урсгалтай
         харагдац — `caps.WORKFLOW_VIEWS`) тул «Хэрэгжүүлэх»-гүйгээр ХАДГАЛМАГЦ үйлчилнэ. Зохиох · батлах нь МЭДЭЭЛЭЛ (`info`). */
      title: tr('Хуваарь'),
      rows: [
        { id: HV_ROW, label: tr('Хуваарь харах'), select: true,
          hint: tr('Зөвхөн харна (засах, илгээх, батлах эрхгүй). «Өөрийн багц» — тухайн хүнд аль нэг эрхийн хуудсанд оноогдсон багцууд. Хадгалмагц үйлчилнэ.') },
        { id: 'huvaari:author', label: tr('Хуваарь зохиох'), hint: tr('«Хуваарийн эрх»-ээс багцаар оноогдоно'), info: 'author' },
        { id: 'huvaari:approver', label: tr('Хуваарь батлах'), hint: tr('«Хуваарийн эрх»-ээс багцаар оноогдоно'), info: 'approver' },
      ],
    },
    {
      title: tr('Удирдлага'),
      /* ⚠️ 2026-10-09 (аудит №6): ҮХМЭЛ ТОХИРГОО — `on.includes('admin')`-ыг хэн ч уншдаггүй; админ самбар
         зөвхөн кодын хатуу super-т (`Root.hardSuper`). Мөрийг хадгалагдсан загвартай нийцтэй үлдээж
         (`KNOWN` · `DEFAULT_TPL.super` · `cleanTpl`), `ErhTypes` чекбоксыг бүх төрөлд идэвхгүй болгов. */
      rows: [{ id: 'admin', label: tr('Хэрэглэгчийн эрх удирдах (админ самбар)'), /* ⚠️ 2026-10-21: super = эрхийн тохиргоо (хүснэгтийн мөр) — загвар биш */
        hint: tr('Зөвхөн Super төрөлд (эрхийн тохиргооноос олгоно) — загвараас тохируулагдахгүй'), superOnly: true }],
    },
  ];
}

const VIEW_KEYS = new Set<string>(VIEWS.map((v) => v.key));
/* ⚠️ 2026-09-30: хадгалсан хуучин загварын `cap:*` · `chanar:*` · `flow:*` id ба урсгалтай 6
   харагдац (`view:guitsetgel` …) ЭНД БАЙХГҮЙ тул хаягдана */
const KNOWN = new Set<string>([...TPL_VIEWS.map((v) => `view:${v.key}`), 'docs', 'admin', HV_ALL, HV_OWN]);

/* ══════════════════════ Загвар ══════════════════════ */

export type TypeTpl = {
  /** Чеклэсэн тохиргооны id-ууд (`view:*` · `docs` · `admin`) */
  on: string[];
  /** Нэвтрэхэд нээгдэх цонх */
  home: ViewKey;
  /**
   * ХАДГАЛАХ АГШИНД каталогт байсан харагдацууд (2026-10-01, «хэрэглэгч: бүгдийг зас»).
   * ⚠️ ЯАГААД: `on` нь зөвхөн ЧЕКЛЭСЭН id-ыг хадгалдаг тул «чеклээгүй» ба «загвар хадгалсны
   *    ДАРАА нэмэгдсэн шинэ хуудас» (жиш. 2026-09-30-ны «ТУХ») ялгагдахгүй — шинэ хуудас бүх
   *    хадгалсан загварт чимээгүй «хаалттай» болж, админ мэдэхгүй. Энэ жагсаалтаас гадуурх
   *    харагдацыг «Эрхийн төрөл» хүснэгт «шинэ хуудас — загварт тохируулаагүй» гэж тэмдэглэнэ
   *    (`unseenViews`). `undefined` — энэ талбараас ӨМНӨ хадгалсан мөр (`LEGACY_SEEN`).
   */
  seen?: ViewKey[];
};

const V = (...k: string[]) => k.map((x) => `view:${x}`);
const ALL_VIEWS = TPL_VIEWS.map((v) => `view:${v.key}`);
/* ⚠️ 2026-10-26: удирдлагад «Хуваарь харах» анхдагчаар «Бүх багц» (`HV_ALL`) */
const LEADER = [...ALL_VIEWS, 'docs', HV_ALL];

/**
 * ⚠️ Хэрэглэгчийн 2026-09-25-нд чеклэсэн хүснэгтийн ХАРАХ хэсэг — хадгалсан загвар
 *    байхгүй үеийн анхдагч (2026-09-30: засах эрх · урсгал · `scope` хасагдсан).
 * ⚠️ 2026-09-25: ЗӨВХӨН синк (эсвэл кэш) «мөр байхгүй» гэж хэлсэн үед — `tplOf`.
 * ⚠️ 2026-10-26: «Хуваарь харах» (`HvScope`) — «Бүх багц»: төлөвлөлтийн инженер · удирдлага · ерөнхий захирал · мэдээлэл
 *    танилцах · super; «Өөрийн багц»: гүйцэтгэгч компани · хяналтын инженер · багцын ахлах инженер; «Үгүй»: чанар · газар
 *    чөлөөлөлт (хэрэглэгчийн шийдвэр). Тэмдэггүй хадгалсан мөрд ч энэ утга (`withPlanDefault`).
 */
const DEFAULT_TPL: Record<string, TypeTpl> = {
  guitsetgegch: {
    on: [...V('pkgFin', 'pkgProg', 'plan', 'hesegET', 'habea', 'dedButets', 'zovshoorol'), HV_OWN],
    home: 'guitsetgel',
  },
  injener: {
    on: [...V('gdash', 'dashboard', 'plan', 'hesegET', 'pkgFin', 'pkgProg', 'gazar', 'habea', 'dedButets', 'zovshoorol'), 'docs', HV_OWN],
    home: 'guitsetgel',
  },
  menejer: {
    on: [...V('gdash', 'dashboard', 'plan', 'hesegET', 'pkgFin', 'pkgProg', 'gazar', 'habea', 'dedButets', 'zovshoorol', 'finance'), 'docs', HV_OWN],
    home: 'gdash',
  },
  /* ⚠️ 2026-10-23: төлөвлөлтийн инженер — багцын ахлах инженертэй ижил анхдагч */
  tolovloltiin: {
    on: [...V('gdash', 'dashboard', 'plan', 'hesegET', 'pkgFin', 'pkgProg', 'gazar', 'habea', 'dedButets', 'zovshoorol', 'finance'), 'docs', HV_ALL],
    home: 'gdash',
  },
  eronhii: { on: LEADER, home: 'gdash' },
  heltsiin: { on: LEADER, home: 'gdash' },
  gazriin: { on: LEADER, home: 'gdash' },
  /* ⚠️ 2026-10-23: «Ерөнхий захирал» — удирдлагын бүх харагдац (зөвхөн харах); «Гүйцэтгэл» нь `permissions.workflowViewsOf`-оос */
  zahiral: { on: LEADER, home: 'gdash' },
  taniltsah: {
    on: [...V('gdash', 'dashboard', 'plan', 'hesegET', 'pkgProg', 'tailan', 'schem', 'sysdoc', 'gazar'), 'docs', HV_ALL],
    home: 'gdash',
  },
  chanar: {
    on: V('gdash', 'plan', 'hesegET', 'gazar', 'irged', 'habea', 'iot', 'dedButets', 'zovshoorol', 'schem'),
    /* ⚠️ 2026-10-23: «Чанар (QAQC)» хасагдсан — гэр нь «Материал баталгаажуулалт» */
    home: 'ma',
  },
  gazar: {
    on: V('gazar', 'gdash', 'plan', 'hesegET', 'irged', 'habea', 'iot', 'dedButets', 'zovshoorol', 'schem'),
    home: 'gazar',
  },
  /* ⚠️ 2026-10-09 (аудит №6): `'admin'` нь зөвхөн хадгалагдсан өгөгдөлтэй нийцтэй — уншигддаггүй (`settingGroups`-ийн ⚠️) */
  super: { on: [...ALL_VIEWS, 'docs', 'admin', HV_ALL], home: 'gdash' },
};

/** ⚠️ 2026-10-26: ТЕСТЭД л — анхдагч загварын хуулбар (e2e шалгуурууд «Хуваарь харах: Үгүй» суурь бэлтгэхэд) */
export const _defaultTpl = (role: Role): TypeTpl | undefined => {
  const t = DEFAULT_TPL[role];
  return t ? { on: [...t.on], home: t.home } : undefined;
};

/**
 * НАРИЙН НӨӨЦ ЗАГВАР — `ROLE_ACCESS`-ийн харагдац/баримт/нүүр цонх л.
 * ⚠️ 2026-09-25: эвдэрсэн мөр ба анхны синкээс ӨМНӨ (кэшгүй) үед `DEFAULT_TPL`-ийн
 *    оронд үүнийг өгнө — FAIL-CLOSED. `DEFAULT_TPL` нь хэрэглэгчийн чеклэсэн
 *    хүснэгт тул ӨРГӨН; хадгалсан загвар нь нарийн байхад синк хүлээх хооронд
 *    (эсвэл мөр эвдэрсэн үед) хүнд илүү цонх нээгдэж байв.
 */
function narrowTpl(role: Role): TypeTpl {
  const a = ROLE_ACCESS[role];
  /* ⚠️ Урсгалтай харагдац загварт орохгүй (`TPL_VIEWS`) */
  const views = a.views === 'all' ? ALL_VIEWS : a.views.filter((v) => !WORKFLOW_VIEWS.includes(v)).map((v) => `view:${v}`);
  return { on: [...views, ...(a.docs ? ['docs'] : [])], home: a.home };
}

/**
 * Хүснэгтээс ирсэн (итгэлгүй) загварыг шүүнэ.
 * ⚠️ FAIL-CLOSED: танигдахгүй id хаягдана; `admin` зөвхөн super-т; эвдэрсэн бол `null`
 *    (⚠️ 2026-09-25: эвдэрсэн мөрд `narrowTpl` үйлчилнэ — `_syncRemoteTypes`).
 * ⚠️ 2026-09-30: хуучин `cap:*` · `chanar:*` · `flow:*` · `scope` нь ЭНД хаягдана
 *    (толгойн ⚠️). Урсгалын «Гүйцэтгэл» хуудсыг `grantFlowAccess` өөрөө нэмдэг тул
 *    загвараас албадахгүй.
 */
export function cleanTpl(role: Role, raw: unknown): TypeTpl | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { on?: unknown; home?: unknown; seen?: unknown };
  if (!Array.isArray(r.on)) return null;
  const on0 = [...new Set(r.on.filter((x): x is string => typeof x === 'string' && KNOWN.has(x)))]
    .filter((x) => x !== 'admin' || role === 'super');
  /* ⚠️ 2026-10-26: «Хуваарь харах» нэг л утгатай — эвдэрсэн мөрд хоёулаа байвал НАРИЙН нь (`own`, fail-closed) */
  const on = withHvScope(on0, hvScopeOf(on0));
  const home = typeof r.home === 'string' && VIEW_KEYS.has(r.home) ? (r.home as ViewKey) : (DEFAULT_TPL[role]?.home ?? 'gdash');
  /* ⚠️ 2026-10-01: `seen` — танигдахгүй түлхүүр хаягдана; массив биш бол «хуучин мөр» (`undefined`) */
  if (!Array.isArray(r.seen)) return { on, home };
  const seen = [...new Set(r.seen.filter((x): x is ViewKey => typeof x === 'string' && VIEW_KEYS.has(x)))];
  return { on, home, seen };
}

/* ══════════════════════ Шинэ хуудас — загварт тохируулаагүй (2026-10-01) ══════════════════════ */

/** Загварт орох харагдацын түлхүүрүүд — ОДООГИЙН каталог (урсгалтай 6 хасагдсан) */
export const tplViewKeys = (): ViewKey[] => TPL_VIEWS.map((v) => v.key);
/**
 * ХАДГАЛАХ агшны `seen` — каталог + «Хуваарь харах» шийдсэн тэмдэг (⚠️ 2026-10-26, `HUVAARI_MARK`).
 * ⚠️ `unseenViews` нь `tplViewKeys()`-ээр л шүүдэг тул тэмдэг «шинэ хуудас» тооцоонд нөлөөлөхгүй.
 */
export const tplSeenKeys = (): ViewKey[] => [...tplViewKeys(), HUVAARI_MARK];

/**
 * «Хуваарь харах»-ыг админ энэ загварт ШИЙДСЭН эсэх (⚠️ 2026-10-26) — `seen`-д тэмдэгтэй.
 * Анхдагч (хадгалаагүй) загвар — `DEFAULT_TPL` өөрөө шийдвэр тул `true`.
 */
export const planViewDecided = (t: TypeTpl, stored: boolean): boolean => !stored || !!t.seen?.includes(HUVAARI_MARK);

/**
 * Тэмдэггүй (энэ тохиргооноос ӨМНӨ хадгалсан) загварт «Хуваарь харах»-ын АНХДАГЧ утгыг тавина — санах ойд л,
 * хадгалсан мөрийг дахин бичихгүй (⚠️ 2026-10-26, `HUVAARI_MARK`-ийн ⚠️).
 */
function withPlanDefault(role: Role, t: TypeTpl): TypeTpl {
  if (t.seen?.includes(HUVAARI_MARK)) return t;
  return { ...t, on: withHvScope(t.on, hvScopeOf(DEFAULT_TPL[role]?.on ?? [])) };
}

/**
 * `seen`-гүй (2026-10-01-ээс ӨМНӨ хадгалсан) загварын «мэдэж байсан» каталог.
 * ⚠️ Загварыг 2026-09-25-нд нэвтрүүлсэн; түүнээс ХОЙШ нэмэгдсэн загварын харагдац — ЗӨВХӨН
 *    «ТУХ» (`tuh`, 2026-09-30). Шинэ харагдацыг ЭНД НЭМЭХГҮЙ: 2026-10-01-ээс хойш хадгалсан
 *    загвар бүр `seen`-тэй тул шинэ хуудас автоматаар тэмдэглэгдэнэ.
 */
const VIEWS_AFTER_TEMPLATES: readonly string[] = ['tuh'];
const LEGACY_SEEN = (): ViewKey[] => tplViewKeys().filter((k) => !VIEWS_AFTER_TEMPLATES.includes(k));

/**
 * ХАДГАЛСАН загвар «мэдээгүй» (хадгалах агшинд каталогт байгаагүй) харагдацууд.
 * ⚠️ Зөвхөн ХАДГАЛСАН загварт — анхдагч загвар (`DEFAULT_TPL`) админы шийдвэр биш тул хоосон.
 * ⚠️ Super нь үргэлж `'all'` (`roleAccess`) — тэмдэглэхгүй.
 */
export function unseenViews(role: Role): ViewKey[] {
  loadCache();
  if (role === 'super') return [];
  const t = remote[role];
  if (!t) return [];
  const seen = new Set<string>(t.seen ?? LEGACY_SEEN());
  return tplViewKeys().filter((k) => !seen.has(k));
}

/* ══════════════════════ Хүснэгтээс уншсан загвар ══════════════════════ */

let remote: Partial<Record<Role, TypeTpl>> = {};
/** ⚠️ 2026-09-25: мөр нь БАЙГАА атлаа эвдэрсэн төрлүүд — `narrowTpl` үйлчилнэ */
let broken = new Set<Role>();
let synced = false;
/** localStorage-оос сэргээсэн эсэх (анхны синкээс өмнө) */
let cacheLoaded = false;
let cacheTried = false;
const EVENT = 'selbe-roletypes-change';
const CACHE_KEY = 'selbe-roletypes-cache-v1';
const notify = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT)); };

/**
 * СИНКЛЭСЭН ЗАГВАРЫН КЭШ (2026-09-25).
 * ⚠️ ЯАГААД: урьд нь анхны синкээс өмнө (эсвэл синк унахад) `DEFAULT_TPL`
 *    үйлчилдэг байв — админ загварыг нарийсгасан ч ачаалах бүрд хэдэн секунд
 *    (эсвэл ArcGIS унасан бол бүтэн сешн) ӨРГӨН анхдагч харагдац нээгдэнэ.
 *    Одоо сүүлийн синкийг кэшилж, кэшгүй бол `narrowTpl` (fail-closed).
 * ⚠️ Кэш итгэлгүй (localStorage) — `cleanTpl`-ээр дахин шүүнэ.
 */
function loadCache(): void {
  if (cacheTried) return;
  cacheTried = true;
  if (synced || typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw) as { tpl?: Record<string, unknown>; broken?: unknown };
    const next: Partial<Record<Role, TypeTpl>> = {};
    for (const [k, v] of Object.entries(d.tpl ?? {})) {
      const role = k as Role;
      if (!isTypeRole(role)) continue;
      const t = cleanTpl(role, v);
      if (t) next[role] = t;
    }
    remote = next;
    broken = new Set((Array.isArray(d.broken) ? d.broken : [])
      .filter((x): x is Role => typeof x === 'string' && isTypeRole(x as Role)));
    cacheLoaded = true;
  } catch { /* эвдэрсэн кэш — `narrowTpl` үйлчилнэ */ }
}

function saveCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ tpl: remote, broken: [...broken] }));
  } catch { /* дүүрсэн/хаалттай localStorage — кэшгүй ажиллана */ }
}

/**
 * ХУУЧИН SNAPSHOT ШИНЭ `saveTpl`-ИЙГ ДАРАХААС ХАМГААЛАХ (2026-09-25).
 * ⚠️ ЯАГААД: poll-ийн `fetchAll` `saveTpl`-ээс ӨМНӨ эхэлж ДАРАА нь ирвэл
 *    хуучин загвар локал хуулбарыг дарж, «Хэрэгжүүлэх» ХУУЧИН загварыг тараана.
 * ЗАГВАР: `saveTpl` эхлэх ба дуусах агшинд тоолуурыг ахиулж төрөл бүрд
 *    тэмдэглэнэ; `permissions.initRemote` хүсэлт эхлэхдээ `_typesMark()`-ийг
 *    авч синкэд өгнө. Тэмдгээс хойш бичигдсэн төрөлд ЛОКАЛ хуулбар давамгайлна —
 *    дараагийн poll remote-оор засна (`scopedAcl._beginRemoteFetch`-ийн санаа).
 */
let tick = 0;
const writtenAt = new Map<Role, number>();
/** `initRemote` хүсэлт эхлэхэд — буцаасан утгыг `_syncRemoteTypes`-д өгнө */
export const _typesMark = (): number => tick;

/**
 * `permissions.initRemote`-оос — `__type__:` мөрүүд.
 * ⚠️ `tpl: null` (эвдэрсэн мөр, `permsRemote`) → `broken` — `narrowTpl`.
 * @param mark хүсэлт эхэлсэн агшны `_typesMark()` — байхгүй (тест) бол хамгаалалтгүй
 */
export function _syncRemoteTypes(rows: { role: string; tpl: unknown }[], mark?: number): void {
  const next: Partial<Record<Role, TypeTpl>> = {};
  const nextBroken = new Set<Role>();
  for (const row of rows) {
    const role = row.role as Role;
    if (!isTypeRole(role)) continue;
    const t = cleanTpl(role, row.tpl);
    if (t) { next[role] = t; nextBroken.delete(role); } else { delete next[role]; nextBroken.add(role); }
  }
  if (mark !== undefined) {
    for (const [role, at] of writtenAt) {
      if (at <= mark) continue;
      const mine = remote[role];
      if (mine) next[role] = mine; else delete next[role];
      if (broken.has(role)) nextBroken.add(role); else nextBroken.delete(role);
    }
  }
  remote = next;
  broken = nextBroken;
  synced = true;
  cacheTried = true;
  saveCache();
  notify();
}

export const typesReady = (): boolean => synced;
/** Хүснэгтэд хадгалсан загвартай эсэх (анхдагчаас ялгаж харуулна) */
export const isStoredTpl = (r: Role): boolean => { loadCache(); return !!remote[r]; };

export function subscribeTypes(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/**
 * Төрлийн одоогийн загвар — хадгалсан › (синк/кэш «мөргүй» гэсэн бол) анхдагч › нарийн нөөц.
 * ⚠️ 2026-09-25: эвдэрсэн мөр ба синк/кэшгүй үед `narrowTpl` (fail-closed).
 */
export function tplOf(role: Role): TypeTpl {
  loadCache();
  const known = synced || cacheLoaded;
  /* ⚠️ 2026-10-26: хадгалсан загварт «Хуваарь харах» шийдэгдээгүй бол анхдагч (`withPlanDefault`) */
  const stored = remote[role];
  const t = stored ? withPlanDefault(role, stored) : (known && !broken.has(role) ? DEFAULT_TPL[role] : undefined);
  if (!t) return narrowTpl(role);
  /* ⚠️ 2026-10-01: `seen` хуулбартай — `ErhTypes`-ийн «өөрчлөгдсөн эсэх» харьцуулалтад */
  const copy: TypeTpl = { on: [...t.on], home: t.home, ...(t.seen ? { seen: [...t.seen] } : {}) };
  if (synced) return copy;
  /* ⚠️ 2026-10-06 (аудит): СИНКЭЭС ӨМНӨ кэш (localStorage) зөвхөн ХУМЬЖ чадна —
     `narrowTpl` ∩ кэш. Урьд нь `cleanTpl` зөвхөн танигдахгүй id ба `admin`-ыг хаядаг тул
     `selbe-roletypes-cache-v1`-д өөрийн төрөлд бүх `view:*` бичих (эсвэл мөрийг устгаж
     өргөн `DEFAULT_TPL` руу унагах) замаар эрх ӨРГӨСДӨГ байв — `resolveBaseAccess`-ийн
     `selbe-perms-v1` дээрх fail-closed дүрэмтэй (суурь ∩ override) ижил зарчим.
     Админ загварыг ӨРГӨСГӨСӨН бол синк хүртэл нарийн харагдана — синкийн дараа засагдана.
     `home` хэвээр — эрх олгодоггүй (`Root.openEntry` нь `allowed`-д байгаа эсэхийг шалгана;
     урсгалын нүүр `guitsetgel` · `chanar` нь `on`-д ОРДОГГҮЙ тул шүүж болохгүй). */
  const allowed = new Set(narrowTpl(role).on);
  return { ...copy, on: copy.on.filter((x) => allowed.has(x)) };
}

/**
 * Загварыг хүснэгтэд бичнэ — амжилттай бол локал хуулбарыг шинэчилнэ.
 * ⚠️ 2026-10-01: `seen` = ОДООГИЙН каталог — хадгалсан админ баганын бүх харагдацыг харсан
 *    (чеклэсэн эсвэл санаатай орхисон); «шинэ хуудас» тэмдэг арилна (`unseenViews`).
 */
export async function saveTpl(role: Role, tpl: TypeTpl): Promise<boolean> {
  const cleaned = cleanTpl(role, tpl);
  if (!cleaned || !isTypeRole(role)) return false;
  /* ⚠️ 2026-10-26: + «Хуваарь харах» шийдсэн тэмдэг (`tplSeenKeys`) — хадгалсан утга (асаалттай/унтраалттай) ЭНДЭЭС эзэн */
  const clean: TypeTpl = { ...cleaned, seen: tplSeenKeys() };
  /* ⚠️ 2026-09-25: эхлэх ба дуусах агшинд тэмдэглэнэ — `_typesMark`-ийн тайлбар */
  const before = writtenAt.get(role);
  writtenAt.set(role, ++tick);
  let ok = false;
  try {
    const { typeUpsert } = await import('./permsRemote');
    ok = await typeUpsert(role, clean);
    if (ok) {
      remote = { ...remote, [role]: clean };
      broken.delete(role);
      saveCache();
      notify();
    }
    return ok;
  } catch {
    return false;
  } finally {
    /* ⚠️ 2026-09-25 (аудит 8): УНАСАН бичилт тэмдэглэгээг АХИУЛАХГҮЙ — урьд нь
       `finally` үргэлж ахиулдаг тул амжилтгүй хадгалалтын дараа ч poll-ийн шинэ
       snapshot энэ төрөлд ХУУЧИН локал хуулбарыг хадгалж, өөр админы бичсэн
       загвар харагдахгүй байв. Унавал өмнөх тэмдэглэгээг сэргээнэ. */
    if (ok) writtenAt.set(role, ++tick);
    else if (before === undefined) writtenAt.delete(role);
    else writtenAt.set(role, before);
  }
}

/**
 * ҮҮРГИЙН ХАРАГДАЦ · БАРИМТ · НҮҮР ЦОНХ — `ROLE_ACCESS`-ийн оронд уншина.
 * ⚠️ Хуучин хоёр үүрэг (beginner · tolovlolt) `ROLE_ACCESS`-ээсээ.
 * ⚠️ Super үргэлж `'all'` — загвараас харагдац хасагдсан ч админ самбарт хүрэх
 *    замаа алдахгүй.
 */
export function roleAccess(role: Role): { views: ViewKey[] | 'all'; docs: boolean; home: ViewKey } {
  if (!isTypeRole(role)) return ROLE_ACCESS[role];
  const t = tplOf(role);
  if (role === 'super') return { views: 'all', docs: true, home: t.home };
  const views = t.on.filter((x) => x.startsWith('view:')).map((x) => x.slice(5) as ViewKey);
  return { views, docs: t.on.includes('docs'), home: t.home };
}

/**
 * ТӨРЛИЙН «ХУВААРЬ ХАРАХ» ХҮРЭЭ (⚠️ 2026-10-26, хэрэглэгч) — `all` · `own` · `none`. Хүнд задлах нь
 * `huvaariView.huvaariViewScope` (өөрийн багц = хуваарилалтууд, + зохиогч · батлагчийн багц).
 * ⚠️ 2026-10-26 (хэрэглэгч): «Хуваарийн эрх»-ийн «Харагч» багана ХАСАГДСАН — тусгай багц харуулах зам нь ЗӨВХӨН энэ тохиргоо.
 * ⚠️ ЗӨВХӨН ХАРАХ: засах/илгээх/батлах/мөр нэмэх эрх ОЛГОХГҮЙ — тэдгээр нь «Хуваарийн эрх»-ийн хуваарилалт
 *    (`huvaariScope`) ба `addRow`-оос хэвээр. `roleAccess`-ийн `views`-д ОРОХГҮЙ (урсгалтай харагдац хадгалагдахгүй).
 * ⚠️ FAIL-CLOSED: синкээс өмнө `tplOf` нь `narrowTpl` ∩ кэш — `narrowTpl`-д энэ id байхгүй тул `none`;
 *    хуучин хоёр үүрэг (`beginner` · `tolovlolt`) загваргүй — `none`.
 */
export function typeHuvaariScope(role: Role | null | undefined): HvScope {
  if (!isTypeRole(role)) return 'none';
  return hvScopeOf(tplOf(role).on);
}
