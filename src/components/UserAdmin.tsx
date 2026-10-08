'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSyncRef } from '@/lib/useSyncRef';
import { t as tr } from '@/lib/i18nCore';
import { AUTH, VIEWS, roleForUser, type Role, type ViewKey } from '@/lib/services';
import { arcgisPost } from '@/lib/query';
import { authToken } from '@/lib/authToken';
import {
  listUsers,
  listRemoved,
  removeUser,
  setUser,
  clearOverride,
  subscribe,
  dirtyKeys,
  foreignDirty,
  retryDirty,
  initRemote,
  remoteReady,
  workflowViewsOf,
  type UserBase,
  type UserPerm,
} from '@/lib/permissions';
import { permsOwnerMismatch, permsTablePublic, takeWriteError } from '@/lib/permsRemote';
import { userError } from '@/components/ui';
import { useAuth } from './AuthGate';
import { Icon } from './Icon';
import { UserRow, type UserRowProps } from './UserRow';
import {
  CAPS, WORKFLOW_VIEWS, capsOf, capsStored, capViewsOf, dirtyCapKeys, foreignCapsDirty, retryCapsDirty, setCaps,
  subscribeCaps,
  type CapKey,
} from '@/lib/caps';
import { ErhOverview } from '@/modules/ErhOverview';
import { GuitsetgelAcl } from '@/modules/GuitsetgelAcl';
import { QaqcAcl } from '@/modules/QaqcAcl';
import { HuvaariAcl } from '@/modules/HuvaariAcl';
import { ObyemAcl } from '@/modules/ObyemAcl';
import { ChanarAcl } from '@/modules/ChanarAcl';
import { DedButetsAcl } from '@/modules/DedButetsAcl';
import { AjilAcl } from '@/modules/AjilAcl';
/*
 * ⚠️ `set*Grants` · `remove*Assign` · `setQaqcAssign` ИМПОРТЛОХГҮЙ (2026-09-25):
 *    хуваарилалтын бичилт зөвхөн `aclOps`-оор (карт · матриц · панел). Энд
 *    зөвхөн жагсаалт (өнчин мөрийн шалгалт), purge (устгах/сэргээх) ба захиалга.
 */
import { listChanarAssigns, purgeChanarAssign, subscribeChanarAcl } from '@/lib/chanarAcl';
import { listHuvaariAssigns, purgeHuvaariAssign, subscribeHuvaariAcl } from '@/lib/huvaariAcl';
import { listObyemAssigns, purgeObyemAssign, subscribeObyemAcl } from '@/lib/obyemAcl';
import { listAjilAssigns, purgeAjilAssign, subscribeAjilAcl } from '@/lib/ajilAcl';
import { listButetsAssigns, purgeButetsAssign, subscribeButetsAcl } from '@/lib/butetsAcl';
import { listQaqcAssigns, purgeQaqcAssign, subscribeQaqcAcl } from '@/lib/qaqcAcl';
import {
  purgeAssign, regrantFlowAccess, stageOfUser, subscribeAcl,
} from '@/lib/guitsetgelAcl';
import { allAclReady, subscribeAclPending } from '@/lib/aclOps';
import { isDerivedCap } from '@/lib/aclRoleCaps';
import { PlainCapAcl } from '@/modules/PlainCapAcl';
import { CapOrphanNote } from '@/modules/CapOrphanNote';
import { AclRepairNote } from '@/modules/AclRepairNote';
import {
  ERH_PANES, PANE_CAPS, paneLabel, paneNote, paneSubtitle, type ErhPane,
} from '@/modules/capText';
import { UserCard } from './UserCard';
import { capLabelShort } from '@/modules/erhLabels';
import { ErhTypes } from '@/modules/ErhTypes';
import { NEW_ACCOUNT_ROLE, TYPE_ORDER, roleAccess, typeLabel } from '@/lib/roleTypes';
import { setTypeDraftUsers, subscribeTypeLock } from '@/lib/roleTypeApply';
import s from './userAdmin.module.css';

/** Бүх харагдац — тоолуур ба 'all'-ыг жагсаалт болгоход */
const ALL_KEYS: ViewKey[] = VIEWS.map((v) => v.key);
/**
 * Картын унтраалгаар toggle хийж болох харагдац — урсгалтай 6-г ХАСНА
 * (2026-09-30, `caps.WORKFLOW_VIEWS`-ийн ⚠️): тэдгээр нь урсгалын хуваарилалтаар
 * нээгдэж, хасахад буцаагдана.
 * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): хадгалагдсан утга нь `resolveAccess`-д ҮЛ ТООЦОГДОНО
 *    (super-ээс бусад) ба «Хадгалах» тэдгээрийг БИЧИХЭЭ больсон (`saveAll`). Ноорог дахь
 *    (`keepWorkflow`) утга нь зөвхөн «өөрчлөгдсөн эсэх» харьцуулалтад.
 */
const TOGGLE_KEYS: ViewKey[] = ALL_KEYS.filter((k) => !WORKFLOW_VIEWS.includes(k));
/** `next`-д хадгалагдсан урсгалтай харагдацуудыг (`cur`-ээс) хэвээр үлдээнэ */
const keepWorkflow = (cur: ViewKey[] | 'all', next: ViewKey[]): ViewKey[] => {
  const held = (cur === 'all' ? ALL_KEYS : cur).filter((k) => WORKFLOW_VIEWS.includes(k) && !next.includes(k));
  return [...next, ...held];
};

/**
 * Үүргийн preset товчнууд — «Эрхийн төрөл»-ийн 10 төрөл (2026-09-25).
 * ⚠️ Урьд нь Супер · Энгийн · Төлөвлөлт гурав байв (хэрэглэгчийн шийдвэрээр
 *    солигдсон). Preset нь ЗӨВХӨН харагдац/үүргийг ноорогт тавина; хуваарилалт
 *    ба эрхийг бүгдийг нь картын «Төрлөөр тохируулах» бичнэ.
 * ⚠️ Функц — текстийг зурагдах агшинд (`capLabel`-ийн ⚠️).
 */
const rolePresets = (): { key: Role; label: string }[] =>
  TYPE_ORDER.map((r) => ({ key: r, label: typeLabel(r) }));

const hasView = (views: ViewKey[] | 'all', k: ViewKey) => views === 'all' || views.includes(k);

const toggled = (views: ViewKey[] | 'all', k: ViewKey): ViewKey[] => {
  const arr = views === 'all' ? [...ALL_KEYS] : [...views];
  return arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k];
};

/*
 * ⚠️ `capLabel` · `capHint` ЭНДЭЭС `modules/capText.ts`-д шилжсэн (2026-09-30):
 *    засах эрх урсгал бүрийн өөрийн хуудсанд, гарчиг/дэд гарчиг/тайлбар нь тэнд.
 */

/** Хажуугийн цэсний хуудасны icon — хуудасны ЭХНИЙ эрхийнх (`caps.CAPS`) */
const paneIcon = (p: ErhPane): string => {
  const k: CapKey | undefined = PANE_CAPS[p][0];
  return (k && CAPS.find((c) => c.key === k)?.icon) || 'pen';
};

/** 'all' ба бүрэн жагсаалтыг ИЖИЛ гэж үзэж харьцуулна */
const viewsEq = (a: ViewKey[] | 'all', b: ViewKey[] | 'all'): boolean =>
  ALL_KEYS.every((k) => hasView(a, k) === hasView(b, k));

/**
 * НЭГ хэрэглэгчийн ХАДГАЛААГҮЙ өөрчлөлт (ноорог).
 *
 * ⚠️ 2026-08-25 (хэрэглэгчийн хүсэлт): даралт бүр ArcGIS руу ШУУД бичдэг байсныг
 * болиулав — унтраалга дарахад зөвхөн ноорогт бичигдэж, доод талын ГАНЦ
 * «Хадгалах» товч бүгдийг нэг дор ArcGIS + localStorage руу буулгана. Ингэснээр
 * админ олон унтраалга дараад нэг удаа хадгалж, эсвэл «Болих»-оор бүгдийг
 * буцааж чадна.
 */
/**
 * ШИНЭ АККАУНТЫН НЭРИЙГ ArcGIS-ЭЭС ЛАВЛАНА (2026-10-05) — `community/users/<нэр>`.
 *
 * ⚠️ ЯАГААД: `add` нь зөвхөн ФОРМАТ шалгадаг байв. Формат зөв атлаа үсгийн алдаатай нэр
 *    (`bat_erdene` ↔ `bat.erdene`) чимээгүй бүртгэгдэж, жинхэнэ хүн «эрх олгогдоогүй» дэлгэц
 *    хардаг — админ эрхийг нь «олгосон» гэж итгэсээр хэдэн өдөр өнгөрнө.
 * ⚠️ ЗӨВХӨН АНХААРУУЛНА, ХААХГҮЙ: лавлагаа нь туслах шалгалт. `unknown` (сүлжээ унасан,
 *    токен хүчингүй, нэвтрэлт унтраалттай) үед юу ч хэлэхгүй — нэмэх зам хэвээр.
 * ⚠️ ArcGIS алдаагаа HTTP 200-аар буцаадаг (амьд шалгасан: байхгүй нэр →
 *    `{error:{code:400,messageCode:"COM_0018",message:"User does not exist or is inaccessible."}}`);
 *    `arcgisPost` түүнийг `ArcGISError(code)` болгож шиддэг. Токен нь зөвхөн биеэр явна.
 * ⚠️ Өөр байгууллагын бүртгэлд `orgId` өөр эсвэл огт ирэхгүй — хоёуланд нь `org`.
 * ⚠️ ТОКЕНГҮЙ бол лавлахгүй (`unknown`): нэвтрээгүй хүсэлтэд байгууллагын хаалттай профайл
 *    «байхгүй» гэж ирдэг тул ХУДАЛ анхааруулга гарна (нэвтрэлт унтраалттай дев, тест орчин).
 */
async function lookupArcgisUser(name: string): Promise<'ok' | 'missing' | 'org' | 'unknown'> {
  if (!AUTH.appId || !authToken()) return 'unknown';
  try {
    const base = AUTH.portalUrl.replace(/\/+$/, '');
    const j = await arcgisPost(`${base}/sharing/rest/community/users/${encodeURIComponent(name)}`, {});
    if (!j || typeof j.username !== 'string' || !j.username) return 'missing';
    if (AUTH.allowedOrgId && j.orgId !== AUTH.allowedOrgId) return 'org';
    return 'ok';
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    const msg = e instanceof Error ? e.message : '';
    if (code === 400 || code === 404 || /does not exist|inaccessible/i.test(msg)) return 'missing';
    return 'unknown';
  }
}

/** ⚠️ `UserRow.tsx` импортлодог тул ЭКСПОРТ (2026-09-10) */
export type Draft = {
  views: ViewKey[] | 'all';
  docs: boolean;
  role: Role | null;
  /**
   * ⚠️ 2026-10-05: ноорог ҮҮСЭХ агшны хадгалагдсан утга — `setUser`-д ялгаа бодох суурь.
   *    Ноорог хэдэн минут настай байж болох тул хадгалах агшны кэш (5 мин тутам шинэчлэгддэг)
   *    суурь БИШ: тэгвэл өөр админы завсрын өөрчлөлт «энэ админ хассан» гэж уншигдана.
   */
  base?: UserBase;
  /** undefined = урсгалын шат хөндөгдөөгүй · null = шатгүй болгох */
  /** «Сэргээх» — хадгалахад override-ыг бүрмөсөн устгаж хатуу тохиргоонд буцаана */
  clear?: boolean;
  /** «Устгах» — хадгалахад аккаунтыг жагсаалтаас хасаж нэвтрэлтийг нь хаана */
  remove?: boolean;
  /** Панелаас ШИНЭЭР нэмсэн, хараахан хадгалаагүй аккаунт */
  isNew?: boolean;
  /**
   * Админ «Гүйцэтгэлийн хяналт» унтраалгыг ГАРААР хөндсөн тэмдэг.
   * ⚠️ Хадгалах үед урсгалын томилгооноос ирсэн `guitsetgel` харагдацыг
   * ноорог санамсаргүй дарж бичихээс хамгаална: ноорог үүссэний ДАРАА өөр
   * хуудаснаас томилгоо хийгдсэн бол админ мэдэлгүй эрхийг нь хасчихдаг
   * байв. Гараар хөндсөн бол админы шийдвэр — хүндэтгэнэ.
   */
  touchedGuits?: boolean;
  /**
   * Админ үүргийн preset-ийг ГАРААР дарсан тэмдэг (2026-08-29).
   * ⚠️ Хадгалах үед хөндөөгүй үүргийг ноорогоос биш, хадгалагдсан утгаас нь
   * дахин уншина — ноорог үүссэний дараа урсгалын хуудаснаас томилогдоход
   * `grantFlowAccess`-ийн өгсөн үүргийг хуучин snapshot дарж бичдэг байв.
   */
  touchedRole?: boolean;
};

/**
 * ХЭРЭГЛЭГЧИЙН ЭРХ УДИРДЛАГА — зөвхөн super admin-д.
 *
 * ⚠️ БҮХ өөрчлөлт (нэмэх, эрх солих, шат томилох, устгах) НООРОГТ хуримтлагдаж
 * ганц «Хадгалах» товчоор л ArcGIS + localStorage руу бууна. Хэсэгчилсэн бичилт
 * байхгүй тул «хагас тохируулсан» төлөв үүсэхгүй.
 */
/** Бүтэн өргөнтэй хуудсууд — «Эрхийн төрөл» ба «багц × үүрэг/шат» хүснэгттэй 7 хуудас (2026-09-30) */
const WIDE_PANES: ReadonlySet<string> = new Set(['types', 'guits', 'huvaari', 'ajil', 'obyem', 'chanar', 'qaqc', 'butets']);

export function UserAdmin({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<UserPerm[]>([]);
  /** Нэвтэрсэн админы нэр — ӨӨРИЙН аккаунтад устгах товч гарахгүй (өөрийгөө түгжихээс сэргийлнэ) */
  const { user: me } = useAuth();
  const myName = me?.username?.toLowerCase() ?? null;
  /**
   * АЛЬ БҮЛЭГ нээлттэй байна.
   * ⚠️ Хоёр бүлэг нь ӨӨР асуултад хариулна: «ямар харагдац үзэх вэ» ба
   *    «аль багцыг бөглөх/хянах вэ». Нэг жагсаалтад хольбол нэгийг засахад
   *    нөгөө нь өөрчлөгдсөн мэт төөрөгдөл үүснэ.
   */
  /* ⚠️ «Чанарын эрх» нь урсгалынхаас ТУСДАА хуудас (2026-09-07) — багцын хүрээ
     нь өөр эх сурвалжаас гардаг тул нэг дэлгэцэнд хольвол админ хоёрын аль нь
     үйлчилж байгааг ялгаж чадахгүй болно (`qaqcAcl.ts`-ийн толгойг үз). */
  /**
   * ⚠️ ТОЙМ АНХДАГЧ (2026-09-09). Админ панел ТАВАН бүлэгт хуваагдсан тул
   *    «энэ хүн юу хийж чадах вэ», «энэ багцыг хэн хариуцаж байна» гэсэн
   *    хоёр байнгын асуултад хариулах газар БАЙХГҮЙ байв — таван бүлгийг
   *    тус тусад нь нээж хайх ёстой байлаа.
   * ⚠️ НЭГ УРСГАЛ = НЭГ ХУУДАС (2026-09-30, хэрэглэгчийн шийдвэр): картын
   *    «Нэмэлт эрх» блок хасагдаж, засах эрх бүр урсгалынхаа хуудсанд (`ErhPane`,
   *    `capText.PANE_CAPS`) — зохиогч ба батлагч НЭГ хуудсанд. Үйлдэл бүрийг
   *    тусад нь 14 хуудас болгосон завсрын хувилбарыг хэрэглэгч татгалзсан.
   */
  const [pane, setPane] = useState<'ovw' | 'types' | 'users' | ErhPane>('ovw');
  const [name, setName] = useState('');
  const [addErr, setAddErr] = useState('');
  /** Хайлт — олон аккаунттай үед шаардлагатай (нэрээр шүүнэ) */
  const [q, setQ] = useState('');
  /** Дэлгэсэн мөрүүд — анхдагчаар БҮГД хураасан (13 хэрэглэгч × 14 унтраалга = уншигдахгүй хана) */
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  /** Бөөнөөр засах сонголт */
  const [sel, setSel] = useState<Set<string>>(new Set());
  /** Remote хүснэгт уншигдсан эсэх — унасан бол offline тэмдэг харуулна */
  const [remoteOk, setRemoteOk] = useState(true);
  /**
   * Remote уншилт ЯВЖ БАЙГАА эсэх (⚠️ 2026-10-01, «хэрэглэгч: бүгдийг зас»).
   * ⚠️ «Эрхийн төрөл» таб уншилт унасан үед «уншигдаж байна…» гэж ҮҮРД харуулдаг байв —
   *    одоо уншилт дууссан ч загвар ирээгүй бол алдаа + «Дахин оролдох» (`ErhTypes`).
   *    Анхны утга `true`: панел нээгдэхэд эффект шууд уншиж эхэлнэ.
   */
  const [remoteBusy, setRemoteBusy] = useState(true);
  /** Remote-оос дахин унших — нээх бүрд ба «Дахин оролдох»-д */
  const reloadRemote = useCallback(() => {
    setRemoteBusy(true);
    void initRemote(false, true)
      .then((ok) => { setRemoteOk(ok); setUsers(listUsers()); })
      .catch(() => setRemoteOk(false))
      .finally(() => setRemoteBusy(false));
  }, []);
  /** «Дахин синк» ажиллаж байгаа эсэх */
  const [syncing, setSyncing] = useState(false);
  /** username(жижиг үсгээр) → хадгалаагүй ноорог */
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [saving, setSaving] = useState(false);
  /** Хамгийн сүүлийн хадгалалтын үр дүн — товчийн доор товч мэдэгдэл */
  /** `msg` — ЭХНИЙ баригдсан алдааны текст (нэрсийн жагсаалтын хажууд харуулна) */
  const [saved, setSaved] = useState<{ ok: number; fail: number; failed: string[]; msg?: string } | null>(null);
  /**
   * НЭЭЛТТЭЙ ХЭРЭГЛЭГЧИЙН КАРТ (2026-09-25) — «Хэрэглэгчид» табд жагсаалтын
   * оронд зурагдана; доод талын «Хадгалах» мөр хэвээр (ноорог хуваалцана).
   */
  const [card, setCard] = useState<{ user: string } | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: нээх бүрд кэшийг синхрон уншаад remote-оос дахин татна
    setUsers(listUsers());
    /*
     * ⚠️ Нээх бүрд remote-оос ДАХИН татна — өөр админы саяын засвар 5 минутын
     * poll хүлээлгүй харагдана. Уншилт унавал offline тэмдэг гарна (урьд нь
     * ямар ч дохиогүй, хуучин cache-ийг үнэн мэт харуулдаг байв).
     */
    // trusted=true — панел зөвхөн кодын хатуу super-т нээгддэг (Root.isSuper):
    // өөрийнх нь dirty-set дахин илгээгдэж, давхарлагдана
    reloadRemote();
  }, [open, reloadRemote]);

  const draftsRef = useRef(drafts);

  useSyncRef(draftsRef, drafts);
  /* ⚠️ 2026-10-07: «Эрхийн төрөл» хуудасны (`ErhTypes`, зөвхөн `pane === 'types'`-д mount)
     хадгалаагүй загварын ноорог — урьд нь хуудас солих · Esc · «← Портал руу буцах» · F5-д
     асуулгүй алга болдог байв. `onDirty` тогтвортой (useCallback) — `ErhTypes`-ийн эффектийн хамаарал. */
  const typesDirtyRef = useRef(false);
  const onTypesDirty = useCallback((d: boolean) => { typesDirtyRef.current = d; }, []);
  const anyUnsaved = () => draftsRef.current.size > 0 || typesDirtyRef.current;
  /** F5/таб хаахад хадгалаагүй ноорог чимээгүй алдагдахаас сэргийлнэ */
  useEffect(() => {
    if (!open) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      if (draftsRef.current.size === 0 && !typesDirtyRef.current) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [open]);

  /** Хадгалаагүй ноорогтой үед санамсаргүй хаагдахаас хамгаална */
  const requestClose = () => {
    if (saving) return; // хадгалалт дуустал хүлээнэ — дундуур гарвал төлөв төөрнө
    if (anyUnsaved()
      && !window.confirm(tr('Хадгалаагүй өөрчлөлт байна. Хадгалалгүй гарах уу?'))) return;
    setDrafts(new Map());
    /*
     * ⚠️ САЛАНГИД ТӨЛӨВҮҮДИЙГ ч ЦЭВЭРЛЭНЭ (2026-09-08). Панел нь `open=false`
     * үед `return null` хийдэг ч UNMOUNT БОЛОХГҮЙ (эцэг нь prop-оор удирдана)
     * тул эдгээр нь дараагийн нээлт хүртэл үлддэг байв:
     *   · `sel` — сонголт үлдэж, нээмэгц «N сонгосон» бөөнөөр устгах зурвас
     *     санамсаргүй идэвхтэй харагдана (АЮУЛТАЙ);
     *   · `saved`/`addErr`/`q` — хуучин мэдэгдэл, хайлт төөрөгдүүлнэ.
     * Ноорог нь дээр цэвэрлэгдсэн тул эрхийн алдагдал үүсэхгүй.
     */
    setSel(new Set());
    setSaved(null);
    setAddErr('');
    setQ('');
    /* ⚠️ Карт ч хаагдана — дахин нээхэд жагсаалтаас эхэлнэ (2026-09-25) */
    setCard(null);
    onClose();
  };
  /** ⚠️ 2026-10-07: хуудас солих — «Эрхийн төрөл»-өөс гарахад хадгалаагүй загвар байвал асууна
      (`ErhTypes` unmount болж ноорог нь алга болно) */
  const goPane = (k: typeof pane) => {
    if (k !== pane && pane === 'types' && typesDirtyRef.current
      && !window.confirm(tr('Эрхийн төрлийн загварт хадгалаагүй өөрчлөлт байна. Хадгалалгүй шилжих үү?'))) return;
    setPane(k);
  };

  /*
   * ⚠️ Escape-ээр хаах · фоны гүйлгэлт түгжих · Ctrl/Cmd+S-ээр хадгалах ·
   *    Tab-ыг модал дотор БАРЬЖ үлдэх (focus trap). Модал нээлттэй байхад
   *    Tab нь ард байгаа порталын товчнууд руу гарвал гар/уншигчийн
   *    хэрэглэгч «хаана байгаагаа» алдана — WCAG 2.4.3.
   */
  const saveRef = useRef<() => void>(() => {});
  /* ⚠️ Escape нь `requestClose`-ийн СҮҮЛИЙН хувилбарыг дуудна (2026-09-23):
     effect нь `[open, onClose]`-д л дахин ажилладаг тул closure доторх
     `saving` хоцорч, «Хадгалж байна…» дундуур Esc дарахад ноорог арчигддаг байв. */
  const closeRef = useRef<() => void>(() => {});
  useSyncRef(closeRef, requestClose);
  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current;
    const onKey = (e: KeyboardEvent) => {
      /* ⚠️ 2026-10-07: дотоод сонголт (AclGrid · ErhMatrix) Esc-ийг аль хэдийн
         барьсан бол (`defaultPrevented`) порталыг хаахгүй */
      if (e.key === 'Escape') { if (!e.defaultPrevented) closeRef.current(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      /* ⚠️ 2026-10-09 (a11y): `a[href]` · `textarea` нэмэгдэв (`useFocusTrap`-ийн жагсаалттай
         ижил), мөн фокус модалаас ГАДУУР байвал (хулганаар ард дарсан, эсвэл дотоод попап
         хаагдаад `<body>`-д унасан) буцааж оруулна — урьд нь тэр үед Tab ард руу явдаг байв.
         Урхи нь `useFocusTrap` БИШ, энд хэвээр: Esc/Ctrl+S-тэй нэг сонсогчид, фокусыг
         буцаах нь доорх тусдаа эффектийн ажил (хайлтын талбар руу 60мс хойшлуулж оруулна). */
      const f = [...root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (!root.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  /*
   * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): ФОКУС — нээхэд портал ДОТОР, хаахад
   *    нээсэн товч руу буцна (WCAG 2.4.3). Урьд нь зөвхөн хайлтын талбар руу шилждэг
   *    байсан ч анхдагч таб «Тойм»-д хайлт байхгүй тул фокус ард үлдэж, Tab нь
   *    порталын товчнуудаар явдаг байв. Хайлт байвал түүнд, үгүй бол хэсгийн гарчигт.
   * ⚠️ ТУСДАА эффект, deps нь ЗӨВХӨН `open` — дээрхийнх `onClose`-оос хамаардаг (Portal
   *    inline функц өгдөг тул зурагдалт бүрд шинэ), тэнд байвал Portal дахин зурагдах
   *    бүрд фокус нээсэн товч руу үсэрнэ.
   */
  useEffect(() => {
    if (!open) return;
    const ae = document.activeElement as (HTMLElement & { focus?: () => void }) | null;
    /* ⚠️ `instanceof HTMLElement` БИШ — Node-ийн UI тестэд (DOM-гүй) `HTMLElement` тодорхойлогдоогүй */
    const opener = ae && typeof ae.focus === 'function' ? ae : null;
    const t = setTimeout(() => {
      if (searchRef.current) { searchRef.current.focus(); return; }
      const root = dialogRef.current;
      const h = root?.querySelector<HTMLElement>('h2') ?? root;
      if (!h) return;
      if (!h.hasAttribute('tabindex')) h.tabIndex = -1;
      h.focus();
    }, 60);
    return () => {
      clearTimeout(t);
      /* Нээсэн товч DOM-д хэвээр бол фокусыг буцаана */
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  useEffect(() => subscribe(() => setUsers(listUsers())), []);
  // Нэмэлт эрх ArcGIS-аас шинэчлэгдэхэд унтраалгууд дагаж шинэчлэгдэнэ
  useEffect(() => subscribeCaps(() => setUsers(listUsers())), []);
  /*
   * ⚠️ Урсгалын томилгоо нь ӨӨР хадгалалттай тул түүнд ч захиалах ёстой.
   *    Эс бөгөөс шат хадгалсны дараа дэлгэц хуучин хэвээр үлдэнэ.
   */
  const [, setAclN] = useState(0);
  useEffect(() => subscribeAcl(() => setAclN((n) => n + 1)), []);
  /* ⚠️ Чанарын хуваарилалт ч бас ӨӨР хадгалалттай — QAQC унтраалга нь түүнийг
     дагуулдаг тул захиалахгүй бол дарсан унтраалга буцаж унтарсан харагдана. */
  useEffect(() => subscribeQaqcAcl(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribeHuvaariAcl(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribeObyemAcl(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribeChanarAcl(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribeAjilAcl(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribeButetsAcl(() => setAclN((n) => n + 1)), []);
  /* ⚠️ `aclOps` бичилт эхлэх/дуусахад — өнчин тэмдгийн түр нуулт шинэчлэгдэнэ (2026-09-25) */
  useEffect(() => subscribeAclPending(() => setAclN((n) => n + 1)), []);
  /* ⚠️ 2026-09-25: «Төрлөөр тохируулах»-ын хэрэглэгчийн түгжээ — карт хаагдаж/нээгдэнэ */
  useEffect(() => subscribeTypeLock(() => setAclN((n) => n + 1)), []);
  /* ⚠️ 2026-09-25: ноорогтой хэрэглэгчдийг бөөнөөр хэрэгжүүлэлтэд мэдэгдэнэ — тэднийг
     алгасна (`roleTypeApply.setTypeDraftUsers`); эс бөгөөс дараагийн «Хадгалах»
     ХУУЧИН ноорогоор загварын харагдацыг дарна. */
  useEffect(() => { setTypeDraftUsers(drafts.keys()); }, [drafts]);

  /** Устгагдсан аккаунтууд — рендер бүрд ДАХИН биш, нэг л удаа */
  /* ⚠️ `users` санаатай — `listRemoved()` гадаад төлөвөөс уншдаг тул жагсаалт
     шинэчлэгдэх бүрд дахин уншина */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const removed = useMemo(() => (open ? listRemoved() : []), [open, users]);

  /**
   * ХАРУУЛАХ МӨРҮҮД — хадгалагдсан хэрэглэгчид + панелаас шинээр нэмсэн
   * (хараахан хадгалаагүй) аккаунтууд, хайлтаар шүүгдсэн.
   */
  const allRows = useMemo(() => {
    const newOnes: UserPerm[] = [...drafts.entries()]
      .filter(([k, d]) => d.isNew && !users.some((u) => u.username.toLowerCase() === k))
      .map(([k, d]) => ({ username: k, role: d.role, views: d.views, docs: d.docs, overridden: true }));
    return [...newOnes, ...users];
  }, [users, drafts]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? allRows.filter((u) => u.username.toLowerCase().includes(needle)) : allRows;
  }, [allRows, q]);

  if (!open) return null;

  /*
   * ArcGIS-т хүрээгүй өөрчлөлтүүд — permissions-ийн DIRTY-SET-ээс (localStorage,
   * refresh давна). Урьд нь энд тусдаа Set хөтөлдөг байсан нь (а) панел дахин
   * нээхэд мартагддаг, (б) амжилттай retry-г мэддэггүй ХУДАЛ тэмдэг байв.
   */
  /* ⚠️ ХОЁР dirty-set-ийг нэгтгэнэ (2026-09-08): эрхийн (`caps`) бичилт унасныг
     урьд нь энд ХАРУУЛДАГГҮЙ байв — `capErr` нь зөвхөн тэр сешнд, refresh-ээр
     арилна, харин dirty-set localStorage-д үлдэж retry хийгддэг. Тэмдэг нь
     retry-тэй ИЖИЛ эх сурвалжаас гарах ёстой, эс бөгөөс худал «амжилттай». */
  const dirtyRemote = new Set([...dirtyKeys(), ...dirtyCapKeys()]);
  /*
   * ⚠️ ЭРХИЙН ХҮСНЭГТ ЭНЭ СЕШНД НЭГ Ч УДАА УНШИГДААГҮЙ БОЛ ЭРХ/ХУВААРИЛАЛТЫН
   *    ЗАСВАР ХААЛТТАЙ (2026-09-21, аудитын засвар). Fail-closed засвараас хойш
   *    уншигч API (`capsOf` · `list*Assigns` · `stageOfUser`) remote-гүй бол
   *    ХООСОН, харин бичигч (`capsStored` · `load()`) бодит кэш — панел
   *    хоёуланг холиход:
   *      · `flipScoped`: `listQaqcAssigns()` → [] тул «Багц 2» хуваарилагдсан
   *        хүний унтраалга OFF харагдаж, асаахад `[ALL_BAGTS]` бичигдэн хүрээ
   *        ЧИМЭЭГҮЙ бүх багц болж тэлнэ (тэндхийн ⚠️ дүрэм эвдэрнэ);
   *      · `flipCap`: `capsOf` [] → «асаах» гэж ойлгож `toggleCap` → шинэ
   *        browser-т `[cap]` нь remote-ийн бүтэн жагсаалтыг дардаг байв;
   *      · `add()`: өнчин cap/хуваарилалтын шалгалт хоосон жагсаалтаас →
   *        алгасна;
   *      · «Сэргээх»: `stageOfUser` null → урсгалын эрх дахин олгогдохгүй.
   *    Тиймээс `remoteReady() && capsRemoteReady()` хоёулаа true болтол
   *    унтраалга/нэмэх/сэргээх/устгах бүгд хаалттай, харуулах жагсаалт нь
   *    localStorage-ийн кэш (`capsStored`) гэж ИЛ тэмдэглэгдэнэ. Remote
   *    сэргэмэгц (`AuthGate` 15 сек тутам · панел нээхэд) өөрөө нээгдэнэ.
   */
  /*
   * ⚠️ ДОЛООН ACL-ИЙН ӨӨРИЙН ТУГ Ч (2026-09-24). `remoteReady` ба
   *    `capsRemoteReady` нь ЭРХИЙН хүснэгтийг л хэлдэг — багцын хуваарилалт
   *    (`list*Assigns`) тус бүр ӨӨРИЙН `ready`-тэй бөгөөд тэр хүртэл `[]`.
   *    Урьд нь нөгөө хоёр бэлэн болмогц унтраалга нээгдэж, `flipScoped` нь
   *    `cur = undefined` гэж уншаад тэр хүний бүх багцыг `[ALL]`-аар дарж
   *    бичдэг байв. Туг бүрийн `subscribe*` дээр `setAclN` дуудагддаг тул
   *    бэлэн болмогц дахин зурагдаж өөрөө нээгдэнэ.
   */
  /* ⚠️ Есөн тугийн илэрхийлэл `aclOps.allAclReady`-д НЭГ газар (2026-09-25) —
     урьд нь энд ба `ErhOverview`-д тусад нь бичигдэж байв. */
  const capsLocked = !allAclReady();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  const retrySync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      /*
       * ⚠️ ӨМНӨХ СЕШНИЙ / ГАРААР ТАРЬСАН МӨРИЙГ ИЛ АСУУНА (2026-09-25, аудитын
       *    засвар). Dirty-set нь localStorage-д, browser-ийн бүх аккаунтад
       *    хуваалцсан тул энэ сешнд үүсээгүй мөрийг (`foreign*`) ТАНЫ токеноор
       *    бичихээс өмнө нэрсийг харуулж зөвшөөрөл авна. Хаалтанд — бичсэн хүн
       *    (localStorage-оос, баталгаагүй). Татгалзвал ЗӨВХӨН энэ сешнийхийг.
       */
      const foreign = new Map<string, string>();
      for (const f of [...foreignDirty(), ...foreignCapsDirty()]) {
        if (!foreign.has(f.key) || !foreign.get(f.key)) foreign.set(f.key, f.by);
      }
      const onlyMine = foreign.size > 0 && !window.confirm(tr(
        'Энэ browser-т өмнөх сешнээс үлдсэн, ArcGIS-т хадгалагдаагүй эрхийн өөрчлөлт байна: {0}. Эдгээрийг ТАНЫ эрхээр ArcGIS руу бичих үү? (Хаалтанд — бичсэн хүн; энэ browser-ийн хадгалалтаас уншсан тул баталгаагүй.) «Цуцлах» дарвал зөвхөн энэ сешний өөрчлөлтийг илгээнэ.',
        [...foreign].map(([k, by]) => `${k} (${by || '—'})`).join(', '),
      ));
      /* Эрхийн (caps) dirty-г ч хамт дахин илгээнэ — нэг товч, хоёр dirty-set */
      const [leftPerms, leftCaps] = onlyMine
        ? await Promise.all([retryDirty(true), retryCapsDirty(true)])
        : await Promise.all([retryDirty(), retryCapsDirty()]);
      const left = leftPerms + leftCaps;
      setUsers(listUsers());
      setSaved(left === 0 ? null : saved);
      /* ⚠️ Үлдсэн бол ил хэлнэ (2026-09-23) — урьд нь товч зүгээр л буцаж, админ юу болсныг мэддэггүй байв */
      if (left > 0) setAddErr(tr('{0} өөрчлөлт дахин хүрсэнгүй — холболтоо шалгаад дахин синк дарна уу.', String(left)));
    } finally {
      setSyncing(false);
    }
  };

  /** Хэрэглэгчийн ОДООГИЙН харагдах төлөв — ноорог байвал түүнийг, эс бөгөөс хадгалснаа */
  const draftOf = (u: UserPerm): Draft => {
    const d = drafts.get(u.username.toLowerCase());
    return d ?? { views: u.views, docs: u.docs, role: u.role };
  };

  /**
   * Ноорог тавих — хадгалсантай ИЖИЛ болж буцвал ноорогоос хасна
   * (Save-бар «0 өөрчлөлт»-тэй дэмий гарч ирэхгүй).
   */
  const putDraft = (u: UserPerm, d: Draft) => {
    /*
     * ⚠️ 2026-09-30: ЭРХИЙН ХҮСНЭГТ ЭНЭ СЕШНД НЭГ Ч УДАА УНШИГДААГҮЙ БОЛ НООРОГ ҮҮСГЭХГҮЙ.
     *    Тэр үед жагсаалт нь зөвхөн энэ browser-ийн кэш (шинэ browser-т хатуу суурь л) тул
     *    түүн дээр тулгуурласан ноорог хадгалахад (эсвэл унасан бичилтийн автомат retry-д)
     *    өөр админы тохируулсан бодит мөрийг ДАРНА — `roleTypeApply.applyType`-ийн
     *    «уншигдаагүй сешнд бичвэл бодит мөрийг дарна» дүрэм (2026-09-25) энд хэрэгжээгүй
     *    байв. Өмнө уншигдаад одоо унасан сешн (`remoteReady` үнэн) хэвээр ажиллана.
     */
    if (!remoteReady()) { setAddErr(LOCK_MSG); return; }
    const key = u.username.toLowerCase();
    /* ⚠️ 2026-10-05: суурийг ЭХНИЙ засварт л тогтооно (`Draft.base`) — `d` нь байгаа ноорогоос
       ирсэн бол суурь нь аль хэдийн дотор нь; шинэ бол `u` (одоо хадгалагдсан утга). */
    const next = { ...d, base: d.base ?? { views: u.views, docs: u.docs, role: u.role } };
    const same = !next.clear
      && !next.remove
      && !next.isNew
      && next.role === u.role
      && next.docs === u.docs
      && viewsEq(next.views, u.views);
    setDrafts((prev) => {
      const m = new Map(prev);
      if (same) m.delete(key); else m.set(key, next);
      return m;
    });
    setSaved(null);
  };

  /**
   * Урсгалын шатанд томилогдсон хүний «Гүйцэтгэлийн хяналт»-ыг унтраах нь
   * түүнийг ажилгүй болгоно — санамсаргүй даралтаас асууж хамгаална.
   * ⚠️ 2026-08-29: урьд нь зөвхөн тухайн унтраалга асуудаг байсан тул preset
   *    ба «Бүгдийг унтраах» асуулгагүй хасаад, хадгалахад `saveAll`-ийн хамгаалалт
   *    чимээгүй буцааж нэмдэг — админы харсан ноорог хадгалагдсанаас зөрдөг байв.
   *    Одоо гурвуулаа асууна; зөвшөөрвөл `touchedGuits` (админы шийдвэр).
   */
  const dropsGuits = (u: UserPerm, from: ViewKey[] | 'all', to: ViewKey[] | 'all'): boolean =>
    hasView(from, 'guitsetgel') && !hasView(to, 'guitsetgel') && !!stageOfUser(u.username);
  const confirmDropGuits = (): boolean =>
    window.confirm(tr('Энэ хэрэглэгч урсгалын шатанд томилогдсон. «Гүйцэтгэлийн хяналт»-ыг унтраавал ажлаа хянаж чадахгүй болно. Унтраах уу?'));

  /** @param confirmed бөөнөөр засахад нэг удаа асуусан бол дахин асуухгүй */
  const applyRole = (u: UserPerm, role: Role, confirmed = false) => {
    /* ⚠️ 2026-09-30: ХАТУУ SUPER-ИЙГ ДООШЛУУЛАХГҮЙ — `roleTypeApply.applyType`-ийн дүрэм
       («Кодонд бүртгэлтэй админыг өөр төрөлд шилжүүлэх боломжгүй») ноорог замд ч. Урьд нь
       мөрийн үүрэг сонгогч/бөөнөөр preset нь super-т `injener` г.м. override бичиж, `roleOf`
       (Гүйцэтгэлийн «Нэгтгэл гүйцэтгэл» таб, нүүр цонх) super биш болгодог байв. */
    if (roleForUser(u.username) === 'super' && role !== 'super') return;
    const a = roleAccess(role);
    const d = draftOf(u);
    const drop = a.views !== 'all' && dropsGuits(u, d.views, keepWorkflow(d.views, a.views));
    if (drop && !confirmed && !confirmDropGuits()) return;
    /* ⚠️ Загвар урсгалтай харагдацгүй (2026-09-30) — хадгалагдсаныг нь хэвээр үлдээнэ */
    putDraft(u, {
      ...d, clear: false, views: a.views === 'all' ? 'all' : keepWorkflow(d.views, a.views), docs: a.docs, role, touchedRole: true,
      ...(drop ? { touchedGuits: true } : null),
    });
  };
  const flipView = (u: UserPerm, k: ViewKey) => {
    /* ⚠️ Урсгалтай харагдац картаас засагдахгүй (2026-09-30) — хуваарилалтын хуудсаар */
    if (WORKFLOW_VIEWS.includes(k)) return;
    const d = draftOf(u);
    /* ⚠️ 2026-10-06 (аудит): засах эрхээс үүссэн (implied) харагдацыг суурь жагсаалтад
       ОРУУЛАХГҮЙ — `UserRights`-ийн бүдэг унтраалгын ⚠️. Хаах зам = тухайн эрхийн хуудас. */
    if (!hasView(d.views, k) && capViewsOf(u.username).includes(k)) return;
    const next = toggled(d.views, k);
    if (dropsGuits(u, d.views, next) && !confirmDropGuits()) return;
    const touched = k === 'guitsetgel' ? { touchedGuits: true } : null;
    putDraft(u, { ...d, ...touched, clear: false, views: next });
  };
  const setAllViews = (u: UserPerm, on: boolean) => {
    const d = draftOf(u);
    /* ⚠️ «Бүгдийг асаах/унтраах» урсгалтай 6-г ХӨНДӨХГҮЙ (2026-09-30) — байгаагаараа үлдэнэ */
    const next: ViewKey[] = keepWorkflow(d.views, on ? [...TOGGLE_KEYS] : []);
    const drop = dropsGuits(u, d.views, next);
    if (drop && !confirmDropGuits()) return;
    putDraft(u, { ...d, clear: false, views: next, docs: on, ...(drop ? { touchedGuits: true } : null) });
  };
  const flipDocs = (u: UserPerm) => {
    const d = draftOf(u);
    putDraft(u, { ...d, clear: false, docs: !d.docs });
  };
  /*
   * ⚠️ `flipCap` · `markCap` · `dropOrphan` УСТСАН (2026-09-30, хэрэглэгчийн
   *    шийдвэр). Урьд нь картын «Нэмэлт эрх» унтраалга энгийн дөрвөн эрхийг
   *    `toggleCap`-аар шууд бичиж, super-т гаргалгаатай эрхийг ч олгодог, өнчин
   *    эрхийг ил хасдаг байв. Одоо тэр бүгд тухайн эрхийн ӨӨРИЙН хуудсанд:
   *    `PlainCapAcl` (`aclOps.capDirectOp`) ба `CapOrphanNote`. `flipScoped` нь
   *    2026-09-25-нд аль хэдийн устсан (хуваарилалт зөвхөн `aclOps`-оор).
   */
  const flipRemove = (u: UserPerm) => {
    const d = draftOf(u);
    putDraft(u, { ...d, remove: !d.remove });
  };
  const markClear = (u: UserPerm) => {
    // Сэргээх = хатуу тохиргооны суурь руу. Суурьгүй (панелаас нэмсэн) хэрэглэгч
    // жагсаалтаас бүрмөсөн хасагдана — урьдчилан харуулах суурьгүй тул одоогийн
    // утгыг нь үлдээгээд clear тэмдэг тавина.
    putDraft(u, { ...draftOf(u), clear: true });
  };

  /* ── Бөөнөөр засах ──
   * ⚠️ БҮРЭН жагсаалтаас (`allRows`) — хайлтын шүүлтээс ХАМААРАХГҮЙ. Урьд нь
   * шүүгдэж нуугдсан сонголт чимээгүй алгасагдаж, зурвасын «N сонгосон» тоо
   * бодит үйлдэлтэй зөрдөг байв. */
  const selRows = allRows.filter((u) => sel.has(u.username.toLowerCase()));
  const bulkRole = (role: Role) => {
    const a = roleAccess(role);
    /* ⚠️ 2026-09-30: хатуу super-ийг ИЛ алгасна (`applyRole`-ийн дүрэм, `bulkRemove`-той ижил зурвас) */
    const skipped = selRows.filter((u) => roleForUser(u.username) === 'super' && role !== 'super');
    const rows = selRows.filter((u) => !skipped.includes(u));
    // Томилогдсон хүмүүсийн «Гүйцэтгэлийн хяналт» хасагдах бол НЭГ удаа асууна
    /* ⚠️ 2026-09-30: `applyRole`-той ИЖИЛ илэрхийлэл (`keepWorkflow`). Урьд нь загварын харагдацтай
       (урсгалтай харагдацгүй) ШУУД харьцуулдаг тул шатанд томилогдсон ХҮН БҮРД «хасагдана» гэсэн
       ХУДАЛ асуулт гардаг байв — `applyRole` урсгалтай харагдацыг хадгалдаг. */
    const av = a.views;
    const hit = av === 'all' ? [] : rows.filter((u) => dropsGuits(u, draftOf(u).views, keepWorkflow(draftOf(u).views, av)));
    if (hit.length && !window.confirm(tr('{0} — урсгалын шатанд томилогдсон. «Гүйцэтгэлийн хяналт» нь хасагдвал ажлаа хянаж чадахгүй болно. Үргэлжлүүлэх үү?', hit.map((u) => u.username).join(', ')))) return;
    rows.forEach((u) => applyRole(u, role, true));
    setSel(new Set());
    if (skipped.length) setAddErr(tr('Алгассан (өөрийн эсвэл super аккаунт): {0}', skipped.map((u) => u.username).join(', ')));
  };
  const bulkRemove = () => {
    /* ⚠️ Өөрийгөө ба хатуу super-ийг алгасна — гэхдээ ЧИМЭЭГҮЙ биш (2026-09-23):
       «N сонгосон» атал цөөн нь устгагдахад админ шалтгааныг мэдэх ёстой. */
    const skipped = selRows
      .filter((u) => u.username.toLowerCase() === myName || roleForUser(u.username) === 'super')
      .map((u) => u.username);
    selRows
      .filter((u) => !skipped.includes(u.username))
      .forEach((u) => { if (!draftOf(u).remove) flipRemove(u); });
    setSel(new Set());
    if (skipped.length) setAddErr(tr('Алгассан (өөрийн эсвэл super аккаунт): {0}', skipped.join(', ')));
  };

  /**
   * ГАНЦ ХАДГАЛАХ — бүх ноорогыг ДАРААЛЛААР бичиж, үр дүнг нь ХҮЛЭЭНЭ.
   *
   * ⚠️ 2026-08-25: урьд нь бичилтүүдийг fire-and-forget явуулдаг байсныг
   * `await`-тай болгов — «Хадгалж байна…» төлөв ҮНЭН болж, дууссаны дараа
   * жагсаалт нь бодит утгаараа шинэчлэгдэнэ.
   *
   * ⚠️ АМЖИЛТГҮЙ гэдэг нь ЗӨВХӨН ALSЫН (ArcGIS) бичилтийг хэлнэ: `setUser`
   * зэрэг нь localStorage-д СИНХРОНООР аль хэдийн бичсэн байдаг тул өөрчлөлт
   * энэ browser-т ҮРГЭЛЖ хүчинтэй. Тиймээс ноорогыг үлдээхгүй (эс бөгөөс
   * ArcGIS-гүй орчинд юу ч хадгалагдахгүй мэт харагдана) — оронд нь тухайн
   * мөрийг «ArcGIS-т хадгалагдсангүй» гэж тэмдэглэнэ.
   */
  const saveAll = async () => {
    if (saving || drafts.size === 0) return;
    /*
     * ⚠️ УСТГАХ / СЭРГЭЭХ нь эрх (`setCaps(u, [])`) ба хуваарилалтын мөрүүдийг
     *    (`purge*`) хөнддөг тул remote уншигдаагүй бол ХААЛТТАЙ (2026-09-21):
     *    өнчин мөр үлдэх, «Сэргээх» урсгалын эрхийг дахин олгож чадахгүй
     *    (`regrantFlowAccess` false). Зөвхөн харагдац/үүргийн ноорог хэвээр —
     *    тэр нь `permissions`-ийн өөрийн dirty-overlay-тай.
     */
    if (capsLocked && [...drafts.values()].some((d) => d.remove || d.clear)) {
      setAddErr(LOCK_MSG);
      return;
    }
    /* ⚠️ 2026-09-30: remote нэг ч удаа уншигдаагүй бол харагдац/үүргийн ноорог ч хадгалахгүй
       (`putDraft`-ийн ⚠️ — кэш дээр тулгуурласан ноорог бодит мөрийг дарна). Давхар хамгаалалт. */
    if (!remoteReady()) { setAddErr(LOCK_MSG); return; }
    const removing = [...drafts.values()].filter((d) => d.remove).length;
    if (removing > 0
      && !window.confirm(tr('{0} аккаунт хадгалахад УСТГАГДАНА. Үргэлжлүүлэх үү?', String(removing)))) return;
    setSaving(true);
    setSaved(null);
    /* ⚠️ 2026-10-05: өмнөх үйлдлээс үлдсэн тодорхой шалтгааныг цэвэрлэнэ (`permsRemote.takeWriteError`) */
    takeWriteError();
    /*
     * ⚠️ SNAPSHOT: энэ closure-ийн `drafts` нь товч дарах агшны Map. Хадгалалт
     * олон remote бичилттэй тул хэдэн секунд үргэлжилж болно — тэр хооронд
     * админы хийсэн ШИНЭ ноорог төгсгөлийн цэвэрлэгээнд арчигдах ёсгүй.
     */
    const snapshot = drafts;
    let ok = 0;
    let fail = 0;
    const failed: string[] = [];
    /* ⚠️ Эхний алдааны текстийг үлдээнэ (2026-09-23) — урьд нь `catch {}` залгиж, зөвхөн нэрс харагддаг байв */
    let firstErr = '';
    /* ⚠️ 2026-09-30: ноорог үүссэний дараа УСТГАГДСАН аккаунтууд — бичихгүй, ноорог нь арилна */
    const gone: string[] = [];

    for (const [key, d] of snapshot) {
      const u = users.find((x) => x.username.toLowerCase() === key);
      const uname = u?.username ?? key;
      try {
        // УСТГАХ — урсгалын томилгоог нь цэвэрлээд tombstone/арилгалт хийнэ.
        // ⚠️ revoke:false — аккаунт бүхэлдээ устгагдах тул эрх буцаалтын
        //    бичилт tombstone-той уралдах ёсгүй.
        if (d.remove) {
          /*
           * ⚠️ 2026-08-29: урсгалын томилгоо ба нэмэлт эрхийг remote-оос ХАМТ
           * арилгаж, үр дүнг нь ХҮЛЭЭНЭ. Урьд нь `removeAssign` fire-and-forget,
           * `__cap__:` мөр огт хөндөгддөггүй тул «Буцаах»/дахин нэмэхэд аккаунт
           * хуучин шат, багц, эрхтэйгээ шууд эргэж ирдэг байв.
           */
          const flowOk = await purgeAssign(uname);
          /* ⚠️ Чанарын хуваарилалт нь ӨӨР мөр (`__qaqc__:`) — тусад нь арилгана,
             эс бөгөөс тэр нэрийг дахин нэмэхэд чанарын багц өөрөө эргэж ирнэ. */
          const qaqcOk = await purgeQaqcAssign(uname);
          const hvOk = await purgeHuvaariAssign(uname);
          /* ⚠️ Обьёмын хуваарилалт нь ӨӨР мөр (`__obyem__:`) — тусад нь арилгана */
          const obOk = await purgeObyemAssign(uname);
          /* ⚠️ Чанарын баримтын хуваарилалт нь ӨӨР мөр (`__chanar__:`) — тусад нь арилгана */
          const chOk = await purgeChanarAssign(uname);
          /* ⚠️ Нэмэлт ажлын хуваарилалт нь ӨӨР мөр (`__ajil__:`) — тусад нь арилгана */
          const ajOk = await purgeAjilAssign(uname);
          /* ⚠️ Дэд бүтцийн засварын хуваарилалт нь ӨӨР мөр (`__butets__:`) — тусад нь арилгана */
          const btOk = await purgeButetsAssign(uname);
          const capOk = await setCaps(uname, []);
          const r = await removeUser(uname);
          if (r && flowOk && qaqcOk && hvOk && obOk && chOk && ajOk && btOk && capOk) ok += 1; else { fail += 1; failed.push(uname); }
          continue;
        }
        /*
         * ⚠️ 2026-09-30: УСТГАГДСАН АККАУНТЫГ АМИЛУУЛАХГҮЙ. Ноорог үүссэний ДАРАА тэр аккаунт
         *    устгагдсан бол (өөр админ / таб; жагсаалтаас алга болсон ч ноорог нь тоологдсоор)
         *    доорх `setUser` (эсвэл «Сэргээх»-ийн `clearOverride`) tombstone-ыг жирийн мөрөөр
         *    дарж (панелаас нэмсэн аккаунтад — устгасан мөрийг ДАХИН үүсгэж) устгагдсан хүн
         *    ДАХИН нэвтэрдэг байв — `guitsetgelAcl.grantFlowAccess`-ийн 2026-09-25-ны ижил
         *    хамгаалалт энд байгаагүй. Хатуу аккаунтыг сэргээх бол «Буцаах» товч.
         */
        if (!d.isNew && !listUsers().some((x) => x.username.toLowerCase() === key)) { gone.push(uname); continue; }
        if (d.clear) {
          let bad = false;
          if (!roleForUser(uname)) {
            // Суурьгүй (панелаас нэмсэн) аккаунт: сэргээх = устгах → бүгдийг цэвэрлэнэ
            if (!(await purgeAssign(uname))) bad = true;
            if (!(await purgeQaqcAssign(uname))) bad = true;
            if (!(await purgeHuvaariAssign(uname))) bad = true;
            if (!(await purgeObyemAssign(uname))) bad = true;
            if (!(await purgeChanarAssign(uname))) bad = true;
            if (!(await purgeAjilAssign(uname))) bad = true;
            if (!(await purgeButetsAssign(uname))) bad = true;
            if (!(await setCaps(uname, []))) bad = true;
          }
          const r = await clearOverride(uname);
          /*
           * ⚠️ Хатуу тохиргоотой, урсгалд томилогдсон хүн: суурь эрхэд нь
           * `guitsetgel` байхгүй бол (tolovlolt) хуудасгүй үлдэнэ — томилгоо
           * хэвээр тул урсгалын эрхийг нь дахин дагуулна.
           */
          /* ⚠️ `stageOfUser`-оор УРЬДЧИЛЖ шүүхгүй (2026-09-21): тэр нь тугтай тул
             remote-гүй бол null → дуудлага алгасаж «амжилттай» гэдэг байв.
             `regrantFlowAccess` өөрөө томилгоогүй бол true, remote-гүй бол false. */
          if (r && !(await regrantFlowAccess(uname))) bad = true;
          if (r && !bad) ok += 1; else { fail += 1; failed.push(uname); }
          continue;
        }

        /*
         * ЗӨВХӨН ХАРАГДАЦ ба ҮҮРЭГ — урсгалын ШАТ томилох нь «Гүйцэтгэлийн
         * урсгалын эрх» хуудсанд НЭГ л газарт (`setAssign` эрхийг дагуулна).
         *
         * ⚠️ УРСГАЛЫН УРАЛДААНЫ ХАМГААЛАЛТ: ноорог үүссэний ДАРАА энэ хүн
         * шатанд томилогдсон бол (өөр хуудас/админ `guitsetgel`-ийг нэмсэн)
         * хуучин snapshot-той ноорог түүнийг мэдэлгүй дарж бичдэг байв.
         * Админ унтраалгыг ГАРААР хөндөөгүй (`touchedGuits` биш) л бол
         * хадгалагдсан `guitsetgel`-ийг үлдээнэ.
         *
         * ⚠️ 2026-09-30: БҮХ УРСГАЛТАЙ ХАРАГДАЦ (`WORKFLOW_VIEWS`) — НООРОГООС БИШ, ОДООГИЙН
         *    ХАДГАЛАГДСАН утгаас. Картаас тэдгээр засагдахгүй (`flipView` · `setAllViews` ·
         *    `applyRole` хэвээр үлдээдэг) тул ноорог дахь утга нь зөвхөн ҮҮСЭХ агшны хуулбар.
         *    Урьд нь ЭСРЭГ чиглэл хамгаалалтгүй байв: ноорог үүссэний дараа урсгалын
         *    томилгоо хасагдвал (`revokeFlowAccess` «Гүйцэтгэл»-ийг хаасан) «Хадгалах» нь
         *    хуучин хуулбараас «Гүйцэтгэл»-ийг БУЦААЖ бичиж, томилгоогүй хүнд хуудас нээлттэй
         *    үлдээдэг, картаас хаах ч замгүй байв («хасахад хаагдана» дүрэм зөрчигдөнө).
         *    Дээрх `guitsetgel`-ийн хамгаалалтыг ч багтаана (`touchedGuits` 2026-09-30-наас
         *    тавигдах замгүй — урсгалтай харагдацын унтраалга картаас хасагдсан).
         */
        /*
         * ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): УРСГАЛТАЙ ХАРАГДАЦ ОГТ БИЧИГДЭХГҮЙ. Урьд нь
         *    (2026-09-30) одоогийн хадгалагдсан утгаас нь хэвээр үлдээдэг (`keepWorkflow(cur, …)`)
         *    байв. Одоо тэдгээр нь ЗӨВХӨН хуваарилалтаар нээгддэг (`permissions.workflowViewsOf`,
         *    хадгалсан утгыг `resolveAccess` үл тооцно) тул бичих нь утгагүй үлдэгдэл — хадгалах
         *    бүрд цэвэрлэнэ. Дээрх хоёр уралдааны хамгаалалт (хуучин ноорог «Гүйцэтгэл»-ийг
         *    дарж/буцааж бичих) ч үүгээр бүрэн хаагдана — бичигдэх зүйл алга.
         * ⚠️ `'all'` (super preset) хэвээр — super хөндөгдөхгүй.
         */
        let views = d.views;
        if (views !== 'all') views = views.filter((k) => !WORKFLOW_VIEWS.includes(k));
        // ⚠️ Хөндөөгүй үүргийг ХАДГАЛАГДСАН утгаас — ноорог үүссэний дараа
        //    урсгалын хуудаснаас олгогдсон үүргийг snapshot дарж бичихгүй.
        const role = d.touchedRole || !u ? d.role : u.role;
        /* ⚠️ 2026-10-05: `d.base` — remote-д зөвхөн ЭНЭ ноорогийн өөрчлөлт давхарлагдана
           (`permissions.setUser` · `mergeUserDelta`); өөр админы зэрэг засвар арчигдахгүй. */
        const r = await setUser(uname, { views, docs: d.docs }, role, d.base);
        /* ⚠️ ЗАСАХ ЭРХ энд БИЧИГДЭХГҮЙ — эрхийн өөрийн хуудсанд шууд
           хадгалагддаг (`__cap__:` ба хуваарилалтын мөрүүд, `aclOps`). */
        if (r) ok += 1; else { fail += 1; failed.push(uname); }
      } catch (e) {
        fail += 1;
        failed.push(uname);
        if (!firstErr) firstErr = e instanceof Error ? e.message : String(e);
      }
    }

    setUsers(listUsers());
    /*
     * ⚠️ ЗӨВХӨН хадгалагдсан ноорогуудыг хасна: хадгалалтын ДУНД үүссэн шинэ
     * ноорог (`putDraft` үргэлж шинэ объект үүсгэдэг тул reference зөрнө)
     * хэвээр үлдэнэ. Урьд нь `new Map()` бүгдийг болзолгүй арчиж, дундуур
     * хийсэн засвар анхааруулгагүй алга болдог байв.
     */
    /*
     * ⚠️ УНАСАН МӨРИЙН НООРОГ ҮЛДЭНЭ (2026-09-08-ны хоёр дахь шалгалт). Урьд нь
     * `snapshot`-ийн БҮХ бичлэг болзолгүй арчигддаг байв — амжилттай, амжилтгүй
     * ялгаагүй. Үр дүнд нь ArcGIS бичилт унасан мөрийн засвар ноорогоос ч
     * арилж, админд ДАХИН ОРОЛДОХ зам үлддэггүй: «N амжилтгүй» гэсэн тоо
     * харагдана атал юуг нь дахин хадгалахаа мэдэхгүй, ноорог нь алга.
     * Одоо унасан түлхүүр ноорогтоо үлдэж, «Хадгалах» товч идэвхтэй хэвээр —
     * сүлжээ сэргэмэгц нэг товшилтоор дахин илгээгдэнэ.
     */
    const failedKeys = new Set(failed.map((x) => x.toLowerCase()));
    setDrafts((prev) => {
      const m = new Map(prev);
      for (const [k, d] of snapshot) if (m.get(k) === d && !failedKeys.has(k)) m.delete(k);
      return m;
    });
    setSaving(false);
    /* ⚠️ 2026-10-05: бичилтийн ТОДОРХОЙ шалтгаан (жиш. `views` талбарын урт хэтэрсэн) байвал
       нэрсийн хажууд — ерөнхий «N амжилтгүй» нь админыг сүлжээгээ шалгахад хүргэдэг. */
    if (fail > 0 && !firstErr) firstErr = takeWriteError();
    /* ⚠️ 2026-10-06 (аудит): түүхий ArcGIS/сүлжээний текстийг ойлгомжтой болгоно (`userError`) —
       `permsRemote` одоо БҮХ уналтын шалтгааныг `takeWriteError`-д тэмдэглэдэг. */
    setSaved({ ok, fail, failed, msg: firstErr ? userError(firstErr) : undefined });
    /* ⚠️ 2026-09-30: устгагдсан тул алгассаныг ИЛ хэлнэ (ноорог нь дээр арилсан) */
    if (gone.length) setAddErr(tr('«{0}» устгагдсан аккаунт — өөрчлөлт хадгалагдсангүй.', gone.join(', ')));
  };
  // eslint-disable-next-line react-hooks/refs -- ⚠️ 2026-09-30: `if (!open) return null`-ийн ДАРАА тул хук (useSyncRef) дуудах боломжгүй; `saveAll` нь тэр салбарын дараах төлөвүүдээс хамаардаг — render дунд оноох нь санаатай
  /* ⚠️ 2026-10-07: Ctrl+S өөр хуудсанд (тойм · эрхийн хуудас) дарахад хадгалалтын үр дүн/алдаа
     зөвхөн «Хэрэглэгчид» салбарт зурагддаг тул чимээгүй байв — ноорогтой бол тийш шилжинэ.
     «Эрхийн төрөл»-д тэндхийн ноорог байвал шилжихгүй (ErhTypes-ийн өөрийн хадгалах). */
  saveRef.current = () => {
    if (pane !== 'users' && draftsRef.current.size > 0 && !typesDirtyRef.current) { setPane('users'); setCard(null); }
    void saveAll();
  };

  /**
   * ШИНЭ АККАУНТ — ноорогт нэмнэ (шууд бичихгүй).
   * ⚠️ Давхардлыг ЭНД барина: байгаа нэрийг дахин нэмбэл түүний эрх нь
   *    «Төлөвлөлт» preset-ээр чимээгүй дарагдаж, админ анзаарахгүй байв.
   */
  const add = () => {
    const n = name.trim();
    if (!n) return;
    /*
     * ⚠️ ArcGIS username формат: латин үсэг/тоогоор эхэлж, 3+ тэмдэгттэй,
     * @ . _ - зөвшөөрнө. Кирилл/хоосон зай зэрэг typo-г ЭНД барина — буруу
     * нэрээр мөр үүсвэл алдаа хэзээ ч гарахгүй атлаа тэр хүн хэзээ ч
     * нэвтэрч чадахгүй (админ хэдэн долоо хоног анзаардаггүй байв).
     */
    if (!/^[A-Za-z0-9][A-Za-z0-9@._-]{2,127}$/.test(n)) {
      setAddErr(tr('«{0}» нь ArcGIS хэрэглэгчийн нэрийн бүтцэд тохирохгүй (латин үсэг/тоо, 3+ тэмдэгт).', n));
      return;
    }
    /* ⚠️ Remote уншигдаагүй бол доорх ӨНЧИН мөрийн шалгалтууд хоосон жагсаалтаас
       явж бүгд «цэвэр» гэдэг — нэмэхийг хаана (2026-09-21, аудитын засвар). */
    if (capsLocked) { setAddErr(LOCK_MSG); return; }
    const key = n.toLowerCase();
    if (users.some((u) => u.username.toLowerCase() === key) || drafts.has(key)) {
      setAddErr(tr('«{0}» аль хэдийн жагсаалтад байна.', n));
      return;
    }
    if (removed.includes(key)) {
      setAddErr(tr('«{0}» устгагдсан — доорх «Буцаах» товчоор сэргээнэ үү.', n));
      return;
    }
    if (stageOfUser(key)) {
      // ⚠️ Устгагдсан аккаунтын өнчин томилгоо remote дээр үлдсэн — шинэ аккаунт
      //    үүсмэгц хуучин шат, багц нь автоматаар наалдана. Эхлээд цэвэрлүүлнэ.
      setAddErr(tr('«{0}» нэрээр хуучин урсгалын томилгоо үлдсэн байна — «Гүйцэтгэлийн урсгалын эрх» хуудсанд ✕ дарж арилгаад дахин нэмнэ үү.', n));
      return;
    }
    /*
     * ⚠️ ҮЛДСЭН ГУРВАН ACL-Д ч ижил шалгалт (2026-09-08). Урьд нь зөвхөн
     *    урсгалын (`stageOfUser`) өнчин мөрийг шалгадаг байсан тул QAQC,
     *    хуваарь, обьёмын хуваарилалт үлдсэн нэрийг дахин нэмэхэд тэр гурвын
     *    эрх, багцын хүрээ нь ЧИМЭЭГҮЙ наалддаг байв — яг тэр аюулаас
     *    сэргийлэхээр урсгалын шалгалт нэмэгдсэн атал гурав нь орхигдсон.
     */
    /* ⚠️ 2026-09-30: хуудасны нэр = урсгалын хуудас (`capText.paneLabel`) */
    const orphan: [boolean, string][] = [
      [listQaqcAssigns().some((a) => a.user === key), paneLabel('qaqc')],
      [listHuvaariAssigns().some((a) => a.user === key), paneLabel('huvaari')],
      [listObyemAssigns().some((a) => a.user === key), paneLabel('obyem')],
      [listAjilAssigns().some((a) => a.user === key), paneLabel('ajil')],
      [listButetsAssigns().some((a) => a.user === key), paneLabel('butets')],
      /* ⚠️ Чанарын баримт ч (2026-09-24) — урьд нь орхигдсон, өнчин `__chanar__:` мөр наалддаг байв */
      [listChanarAssigns().some((a) => a.user === key), paneLabel('chanar')],
    ];
    /*
     * ⚠️ НЭМЭЛТ ЭРХ (`__cap__:`) ч мөн ӨНЧИН ҮЛДЭНЭ (2026-09-08-ны хоёр дахь
     *    шалгалт). Дээрх дөрөв нь ЗӨВХӨН багцын хуваарилалтыг барьдаг ч эрх нь
     *    ТУСДАА мөрөнд байдаг: аккаунт устгахад `setCaps(u, [])` унавал тэр мөр
     *    ArcGIS дээр үлдэж, ижил нэрээр дахин нэмэхэд `finRow` (санхүүгийн мөр
     *    УСТГАХ — буцаах арга БАЙХГҮЙ), `zovshoorol`, `butets` зэрэг эрх
     *    чимээгүй наалддаг байв. Энэ нь бусад дөрвөөс ЭРСДЭЛТЭЙ: тэдгээр нь
     *    багцаар хязгаарлагддаг, энэ нь хязгааргүй.
     * ⚠️ 2026-09-30: ХУВААРИЛАЛТЫН шалгалт ЭХЭНД, дараа нь эрх. Урьд нь энд «тэр аккаунтыг
     *    «Буцаах»-аар сэргээж эрхийг нь арилгаад дахин нэмнэ үү» гэж зогсоодог байв — гэвч энэ
     *    салаанд хүрэх нэр tombstone-гүй (дээр `removed`-оор шүүгдсэн) тул «Буцаах» товч
     *    ХЭЗЭЭ Ч байхгүй, эрхийг нь хасах хуудас ч алга (эрхийн хуудсууд порталд байгаа аккаунтыг
     *    л жагсаана) — нэрийг дахин нэмэх зам бүрмөсөн хаагддаг байв. Одоо ИЛ асууж (эрхүүдийн
     *    нэрээр), зөвшөөрвөл хуучин эрхийг арилгаад үргэлжилнэ — чимээгүй наалдахгүй хэвээр.
     */
    const stuck = orphan.find(([hit]) => hit);
    if (stuck) {
      setAddErr(tr('«{0}» нэрээр хуучин хуваарилалт үлдсэн байна — «{1}» хуудсанд ✕ дарж арилгаад дахин нэмнэ үү.', n, stuck[1]));
      return;
    }
    const orphanCaps = capsOf(key);
    if (orphanCaps.length) {
      if (!window.confirm(tr('«{0}» нэрээр устгагдсан аккаунтын засах эрх ({1}) үлдсэн байна. Эдгээрийг арилгаад нэмэх үү?', n, orphanCaps.map(capLabelShort).join(', ')))) return;
      void setCaps(key, []).then((done) => {
        if (!done) setAddErr(tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т'));
      });
    }
    /* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): шинэ аккаунт ОДООГИЙН төрөлтэй (`NEW_ACCOUNT_ROLE`) —
       урьд нь хуучин «Төлөвлөлт (хуучин)» (`tolovlolt`) өгдөг тул сонгогчид идэвхгүй сонголтоор
       харагдаж, «Эрхийн төрөл»-ийн загвар (харагдац · нүүр цонх) үйлчилдэггүй байв. Харагдац нь
       загвараас (урсгалтай 6 агуулахгүй); хадгалахаас өмнө ноорогт өөр төрөл сонгож болно. */
    const a = roleAccess(NEW_ACCOUNT_ROLE);
    setDrafts((prev) => new Map(prev).set(key, {
      views: a.views === 'all' ? [...TOGGLE_KEYS] : a.views.filter((k) => !WORKFLOW_VIEWS.includes(k)),
      docs: a.docs, role: NEW_ACCOUNT_ROLE, isNew: true,
    }));
    setOpenRows((prev) => new Set(prev).add(key));
    setName('');
    setAddErr('');
    setSaved(null);
    /* ⚠️ 2026-10-07: идэвхтэй хайлт шинэ мөрийг нууж «нэмэгдээгүй» мэт харагдуулдаг байв */
    setQ('');
    /* ⚠️ 2026-10-05: нэрийг ArcGIS-ээс лавлана (`lookupArcgisUser`-ийн ⚠️) — ноорог аль хэдийн
       нэмэгдсэн, энэ нь зөвхөн АНХААРУУЛГА. Лавлагаа унавал (сүлжээ) чимээгүй. */
    void lookupArcgisUser(n).then((res) => {
      if (res === 'missing') {
        setAddErr(tr('⚠️ «{0}» нэртэй ArcGIS хэрэглэгч олдсонгүй (эсвэл харагдахгүй). Нэрээ дахин шалгана уу — буруу бол хадгалахаас өмнө ноорогоос хасна уу.', n));
      } else if (res === 'org') {
        setAddErr(tr('⚠️ «{0}» нь манай байгууллагын ArcGIS бүртгэл биш — нэвтрэхэд татгалзагдана. Нэрээ дахин шалгана уу.', n));
      }
    });
  };

  /** Мөр ба картын props — НЭГ газар (хоёр газар бичвэл нэгд нь хоцорно) */
  const rowPropsOf = (u: UserPerm): UserRowProps => {
    const key = u.username.toLowerCase();
    const d = draftOf(u);
    /* ⚠️ ЗӨВХӨН ХАРУУЛАХ тэмдэг. Шат томилох нь «Гүйцэтгэлийн урсгалын
        эрх» хуудас эсвэл хэрэглэгчийн картад — аль багц хариуцахыг нь бас
        зааж өгдөг. Урьд нь энэ мөрөнд товчлол байсныг 2026-08-27-нд
        ХАСАВ: тэр товчлол багц сонгох чадваргүй тул үргэлж «бүх багц»
        гэж бичиж, тусдаа хуудсан дээр тавьсан хязгаарлалтыг ЧИМЭЭГҮЙ
        арилгадаг байлаа. */
    /* Засах эрхийн гэр харагдац runtime дээр нээлттэй — тоолуур ба
       унтраалга үүнийг ч тусгана (`UserRights`-ийн ⚠️) */
    const capViews = capViewsOf(u.username);
    /* ⚠️ 2026-10-01: урсгалтай 6 харагдац — хадгалсан утгаас БИШ, хуваарилалтаас (`workflowViewsOf`);
       super-т хадгалсан утга ч хүчинтэй (`resolveAccess`-ийн дүрэм) */
    const wf = workflowViewsOf(u.username);
    const isSup = d.role === 'super' || roleForUser(u.username) === 'super';
    const opened = (k: ViewKey): boolean => (WORKFLOW_VIEWS.includes(k) && !isSup
      ? wf.includes(k)
      : hasView(d.views, k) || capViews.includes(k));
    return {
      u,
      rowKey: key,
      d,
      dirty: drafts.has(key),
      st: stageOfUser(u.username),
      expanded: openRows.has(key),
      on: ALL_KEYS.filter(opened).length,
      capViews,
      /* ⚠️ Remote-гүй бол `capsStored` (кэш) — `capsOf` [] тул нээгдсэн харагдацын
         тэмдэг алга болж, худал «эрхгүй» дүр зурна (2026-09-21) */
      caps: capsLocked ? capsStored(u.username) : capsOf(u.username),
      selected: sel.has(key),
      dirtyPerm: dirtyRemote.has(key),
      myName,
      allKeys: ALL_KEYS,
      rolePresets: rolePresets(),
      hasView,
      onPick: (checked) => setSel((prev) => {
        const n = new Set(prev);
        if (checked) n.add(key); else n.delete(key);
        return n;
      }),
      onExpand: () => setOpenRows((prev) => {
        const n = new Set(prev);
        if (n.has(key)) n.delete(key); else n.add(key);
        return n;
      }),
      onRole: (role) => applyRole(u, role),
      onFlipView: (k) => flipView(u, k),
      onAllViews: (v) => setAllViews(u, v),
      onFlipDocs: () => flipDocs(u),
      onFlipRemove: () => flipRemove(u),
      onClear: () => markClear(u),
      onGoFlow: () => goPane('guits'),
      superUser: roleForUser(u.username) === 'super',
      onOpenCard: () => setCard({ user: key }),
    };
  };
  /** Нээлттэй картын хэрэглэгч — хадгалаагүй шинэ аккаунт ч (`allRows`) */
  const cardRow = card ? allRows.find((x) => x.username.toLowerCase() === card.user) ?? null : null;
  /* ⚠️ Өнчин эрхийн тойм (2026-09-25) ЭНДЭЭС тухайн эрхийн хуудас руу шилжсэн (`CapOrphanNote`, 2026-09-30) */

  return (
    /**
     * ⚠️ 2026-08-18 (хэрэглэгчийн шийдвэр): жижиг МОДАЛ байсныг ТУСДАА «Админ
     * портал» хуудас болгов — админы тохиргоо нь үндсэн порталаас салангид,
     * өөрийн толгой ба хажуугийн цэстэй бүтэн дэлгэцийн хэсэг.
     */
    <div ref={dialogRef} className={s.page} role="dialog" aria-modal="true" aria-label={tr('Админ портал')}>
      <header className={s.pageHead}>
        <span className={s.pageBrand}>
          <span className={s.pageBadge}><Icon name="users" size={15} /></span>
          <span className={s.pageBrandText}>
            <b>{tr('Админ портал')}</b>
            {/* ⚠️ 2026-10-01: брэнд «Ухаалаг хот» — Home/Landing/Portal-тай ижил (2026-09-25-ны нэр) */}
            <small>{tr('Сэлбэ ухаалаг хот · тохиргоо')}</small>
          </span>
        </span>
        <button type="button" className={s.back} onClick={requestClose}>
          {tr('← Портал руу буцах')}
        </button>
      </header>

      <aside className={s.side} aria-label={tr('Админ цэс')}>
        <div className={s.sideHead}>{tr('Тохиргоо')}</div>
        {/*
          * ⚠️ ТОЙМ ЭХЭНД (2026-09-09). Гацаа (батлагчгүй багц, зохиогч=батлагч)
          *    нь ЗӨВХӨН ажил зогссоны дараа мэдэгддэг байсныг энд УРЬДЧИЛЖ хэлнэ.
          */}
        <button
          type="button"
          className={`${s.sideItem} ${pane === 'ovw' ? s.sideItemOn : ''}`}
          aria-current={pane === 'ovw'}
          onClick={() => goPane('ovw')}
        >
          <Icon name="target" size={14} />
          {tr('Тойм')}
        </button>
        <button
          type="button"
          className={`${s.sideItem} ${pane === 'users' ? s.sideItemOn : ''}`}
          aria-current={pane === 'users'}
          /* ⚠️ Цэснээс орох бүрд жагсаалтаас эхэлнэ — нээлттэй карт хаагдана (2026-09-25) */
          onClick={() => { goPane('users'); setCard(null); }}
        >
          <Icon name="users" size={14} />
          {tr('Хэрэглэгчдийн эрх удирдах')}
        </button>
        {/* ⚠️ 2026-09-25: 10 төрөл × бүх тохиргоо — хэрэглэгчийн картын «Төрлөөр тохируулах» эндээс уншина */}
        <button
          type="button"
          className={`${s.sideItem} ${pane === 'types' ? s.sideItemOn : ''}`}
          aria-current={pane === 'types'}
          onClick={() => goPane('types')}
        >
          <Icon name="layers" size={14} />
          {tr('Эрхийн төрөл')}
        </button>
        {/*
          * ⚠️ ТУСДАА БҮЛЭГ, нэг жагсаалтад ХОЛИОГҮЙ. Дээрх нь «ямар
          *    харагдац үзэх вэ», энэ нь «аль багцыг бөглөх/хянах вэ».
          */}
        <button
          type="button"
          className={`${s.sideItem} ${pane === 'guits' ? s.sideItemOn : ''}`}
          aria-current={pane === 'guits'}
          onClick={() => goPane('guits')}
        >
          <Icon name="pen" size={14} />
          {tr('Гүйцэтгэлийн урсгалын эрх')}
        </button>
        {/*
          * ⚠️ НЭГ УРСГАЛ = НЭГ ХУУДАС (2026-09-30, хэрэглэгчийн шийдвэр): дараалал
          *    `capText.ERH_PANES` — хуваарь · нэмэлт ажил · обьём · чанарын баримт
          *    (зохиогч + батлагч/хянагч НЭГ хуудсанд) · QAQC · дэд бүтэц багцаар;
          *    зөвшөөрөл · санхүү (утга + мөр нэг хуудсанд) · газар аккаунтаар.
          * ⚠️ ЧАНАР (QAQC) нь урсгалын ШАТГҮЙ асуулт тул урсгалын багананд биш —
          *    тэнд байрлуулбал чанарын ажилтанд гүйцэтгэл зөвшөөрөх эрх дагалдана
          *    (`qaqcAcl.ts`). Хуваарь · обьём · нэмэлт ажил · чанарын баримт ч
          *    урсгалаас ТУСДАА асуулт (тус бүрийн `*Acl.ts`).
          */}
        <div className={s.sideHead}>{tr('Засах эрх')}</div>
        {ERH_PANES.map((k) => (
          <button
            key={k}
            type="button"
            className={`${s.sideItem} ${pane === k ? s.sideItemOn : ''}`}
            aria-current={pane === k}
            onClick={() => goPane(k)}
          >
            <Icon name={paneIcon(k)} size={14} />
            {paneLabel(k)}
          </button>
        ))}
      </aside>

      {/* ⚠️ 2026-09-30: «Гүйцэтгэлийн урсгалын эрх» нь 6 шатны «багц × шат» хүснэгт — 860px-д багтахгүй тул өргөн.
          Багцаар олгодог бусад 6 хуудас ч ИЖИЛ хүснэгт (`AclGrid`) болсон тул мөн өргөн; `PlainCapAcl`-ийн
          (аккаунтаар) хуудас хэвээр нарийн. */}
      <div className={`${s.main} ${WIDE_PANES.has(pane) ? s.mainWide : ''}`}>
        {pane === 'ovw' ? (
          <>
            <header className={s.head}>
              <h2 className={s.title}>{tr('Эрхийн тойм')}</h2>
              <p className={s.subtitle}>
                {tr('Багц бүрд хэн юу хариуцаж байгаа, хүн бүр юу хийж чадахыг нэг дэлгэцэнд. Ажил гацах эрсдэлийг урьдчилж хэлнэ.')}
              </p>
            </header>
            <ErhOverview
              /* ⚠️ 2026-10-07: хажуугийн цэстэй ижил — нээлттэй хуучин карт хаагдана */
              onGo={(x) => { goPane(x as typeof pane); setCard(null); }}
              drafts={drafts}
              /* ⚠️ Хүний хөзөр → хэрэглэгчийн карт (2026-09-25) */
              onOpenUser={(user) => { goPane('users'); setCard({ user: user.toLowerCase() }); }}
            />
          </>
        ) : pane !== 'types' && pane !== 'guits' && pane !== 'users' ? (
          <>
            <header className={s.head}>
              <h2 className={s.title}>{paneLabel(pane)}</h2>
              <p className={s.subtitle}>{paneSubtitle(pane)}</p>
            </header>
            {/* ⚠️ Хуваарилалттай хуудас: тайлбар · эрх бүрийн өнчин/дутуу анхааруулга · багцын панел ·
                хатуу super-ийн шууд олголт (эрх бүрд). Энгийн эрх: `PlainCapAcl` хэсэг бүрийг өөрөө зурна
                (санхүү — «утга засах» ба «мөр нэмэх, устгах» хоёр хэсэг нэг хуудсанд). */}
            {PANE_CAPS[pane].some(isDerivedCap) && <p className={s.note}>{paneNote(pane)}</p>}
            {PANE_CAPS[pane].filter(isDerivedCap).map((c) => <CapOrphanNote key={c} cap={c} />)}
            {/* ⚠️ 2026-10-01: унасан бичилтийн «Дахин илгээх» ба устгагдсан аккаунтын үлдэгдэл — хуудас бүрд */}
            <AclRepairNote key={`repair-${pane}`} pane={pane} />
            {pane === 'ajil' ? <AjilAcl />
              : pane === 'huvaari' ? <HuvaariAcl />
                : pane === 'obyem' ? <ObyemAcl />
                  : pane === 'chanar' ? <ChanarAcl />
                    : pane === 'qaqc' ? <QaqcAcl />
                      : pane === 'butets' ? <DedButetsAcl />
                        : PANE_CAPS[pane].map((c) => <PlainCapAcl key={c} cap={c} />)}
            {PANE_CAPS[pane].filter(isDerivedCap).map((c) => <PlainCapAcl key={c} cap={c} superOnly />)}
          </>
        ) : pane === 'types' ? (
          <>
            <header className={s.head}>
              <h2 className={s.title}>{tr('Эрхийн төрөл')}</h2>
              <p className={s.subtitle}>
                {tr('Төрөл бүрд юу харахыг (харагдац · ТЭЗҮ-БОНУ · нүүр цонх) чеклээд хадгална. Хэрэглэгчийн картад төрөл сонгож «Төрлөөр тохируулах» дарахад харагдац нь нэг дор бичигдэнэ. Засах эрх энд ОРОХГҮЙ — хажуугийн цэсний тухайн хуудсанд.')}
              </p>
            </header>
            <ErhTypes remote={{ busy: remoteBusy, retry: reloadRemote }} onDirty={onTypesDirty} />
          </>
        ) : pane === 'guits' ? (
          <>
            <header className={s.head}>
              <h2 className={s.title}>{tr('Гүйцэтгэлийн урсгалын эрх')}</h2>
              <p className={s.subtitle}>
                {tr('Зургаан шат бүрд аккаунт томилж, аль багцыг хариуцахыг зааж өгнө.')}
              </p>
            </header>
            {/* ⚠️ 2026-10-01: «Дахин илгээх» · устгагдсан аккаунтын үлдэгдэл (`AclRepairNote`) */}
            <AclRepairNote key="repair-guits" pane="guits" />
            <GuitsetgelAcl />
          </>
        ) : (
          <>
        <header className={s.head}>
          <h2 className={s.title}>{tr('Хэрэглэгчдийн эрх удирдах')}</h2>
          <p className={s.subtitle}>
            {tr('Аккаунт · үүргийн шошго · харагдац · ТЭЗҮ-БОНУ. Унтраалгаар нээж/хааж, доод талын «Хадгалах» товчоор нэг дор хадгална. Засах эрх энд ОРОХГҮЙ — хажуугийн цэсний тухайн хуудсанд.')}
          </p>
          {/* ⚠️ ХОЁР ӨӨР ТӨЛӨВ (2026-09-21): энэ сешнд НЭГ Ч удаа уншигдаагүй бол
              эрх/хуваарилалтын засвар хаалттай (`capsLocked`); өмнө уншигдаад
              одоо унасан бол хуучин cache + dirty-overlay хэвээр ажиллана. */}
          {capsLocked ? (
            <div className={s.addErr} role="alert">
              {tr('⚠️ Эрхийн хүснэгт уншигдсангүй — нэмэх/устгах/сэргээх засвар хаалттай, дахин ачаална уу. Засах эрхээр нээгдсэн харагдацын тэмдэг энэ browser-ийн кэшнээс харагдаж байна.')}
            </div>
          ) : !remoteOk && (
            <div className={s.addErr} role="alert">
              {tr('⚠️ ArcGIS хүснэгтээс уншиж чадсангүй — доорх жагсаалт энэ browser-ийн cache. Өөрчлөлт түр локалдоо хадгалагдаж, холболт сэргэхэд автоматаар илгээгдэнэ.')}
            </div>
          )}
          {/* ⚠️ 2026-09-08-ны амьд шалгалт: хүснэгт AGOL дээр гараар «Everyone»
              болгогдсон байв — нэвтрээгүй хэн ч бүх эрхийг засаж чадна. Кодоор
              засах боломжгүй тул админд ИЛ, УЛААНААР хэлнэ (`permsTablePublic`). */}
          {/* ⚠️ 2026-10-05: хүснэгтийн ЭЗЭН кодын super жагсаалтад алга (super-ийг `ROLE_BY_USER`-аас
              хассан) — бүх хэрэглэгчийн remote эрх унтарна. Урьд нь шалтгаан зөвхөн консолд
              гардаг байв; одоо эзний нэр ба хоёр засварыг ИЛ хэлнэ (`permsOwnerMismatch`). */}
          {permsOwnerMismatch().length > 0 && (
            <div className={s.addErr} role="alert">
              {tr('🔴 Эрхийн хүснэгтийн (Selbe_Permissions) эзэн «{0}» нь кодын админ (super) жагсаалтад алга тул БҮХ хэрэглэгчийн эрх, хуваарилалт уншигдахгүй байна. Засвар: ArcGIS дээр item-ийн эзнийг одоогийн админд шилжүүлэх (Change owner), эсвэл хөгжүүлэгчээр энэ нэрийг permsRemote.ts-ийн FORMER_TABLE_OWNERS жагсаалтад нэмүүлнэ.', permsOwnerMismatch().join(', '))}
            </div>
          )}
          {permsTablePublic() && (
            <div className={s.addErr} role="alert">
              {tr('🔴 Эрхийн хүснэгт (Selbe_Permissions) НИЙТЭД нээлттэй байна — нэвтрээгүй хэн ч эрх засаж чадна. AGOL дээр item-ийн Share-ийг «Organization» болгоно уу.')}
            </div>
          )}
        </header>

        {/*
          * ⚠️ ХЭРЭГЛЭГЧИЙН КАРТ (2026-09-25) — жагсаалтын ОРОНД. Доод талын
          *    «Хадгалах» мөр хэвээр: картын харагдац/үүргийн засвар ноорогт орно.
          */}
        {cardRow ? (
          <>
            {addErr && <div className={s.addErr} role="alert">{addErr}</div>}
            <UserCard
              p={rowPropsOf(cardRow)}
              hasDraft={drafts.has(cardRow.username.toLowerCase())}
              onBack={() => setCard(null)}
              /* ⚠️ 2026-10-01: урсгалтай хуудасны эх сурвалж → тэр эрхийн хуудас */
              onGo={(p) => goPane(p)}
            />
          </>
        ) : (
          <>
          {/* Хайх + шинэ аккаунт нэмэх */}
          <div className={s.addRow}>
            <div className={s.searchWrap}>
              <Icon name="target" size={13} />
              <input
                ref={searchRef}
                className={s.search}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={tr('Аккаунт хайх…')}
                aria-label={tr('Аккаунт хайх')}
              />
              {q && (
                <button type="button" className={s.searchX} onClick={() => setQ('')} title={tr('Цэвэрлэх')}>✕</button>
              )}
            </div>
            <input
              className={s.input}
              value={name}
              onChange={(e) => { setName(e.target.value); setAddErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
              placeholder={tr('ArcGIS хэрэглэгчийн нэр')}
              aria-label={tr('Шинэ хэрэглэгчийн нэр')}
            />
            <button type="button" className={s.addBtn} onClick={add} disabled={!name.trim()}>
              {tr('Нэмэх')}
            </button>
          </div>
          {addErr && <div className={s.addErr} role="alert">{addErr}</div>}

          {/* Бөөнөөр засах зурвас — сонголттой үед л */}
          {sel.size > 0 && (
            <div className={s.bulkBar}>
              <span className={s.bulkInfo}>{tr('{0} сонгосон', String(sel.size))}</span>
              {rolePresets().map((r) => (
                <button key={r.key} type="button" className={s.preset} onClick={() => bulkRole(r.key)}>
                  {r.label}
                </button>
              ))}
              <button type="button" className={s.delBtn} onClick={bulkRemove}>{tr('Устгах')}</button>
              <button type="button" className={s.cancelBtn} onClick={() => setSel(new Set())}>
                {tr('Сонголт цуцлах')}
              </button>
            </div>
          )}

          {/* Хэрэглэгчийн жагсаалт */}
          <div className={s.list}>
            {rows.length === 0 && (
              <div className={s.empty}>{tr('Тохирох аккаунт олдсонгүй.')}</div>
            )}
            {rows.map((u) => <UserRow key={u.username.toLowerCase()} {...rowPropsOf(u)} />)}
          </div>

          {removed.length > 0 && (
            <div className={s.removedSec}>
              <div className={s.removedHead}>{tr('Устгагдсан аккаунтууд')}</div>
              {removed.map((k) => (
                <div key={k} className={s.removedRow}>
                  <span className={s.removedName}>{k}</span>
                  <button
                    type="button"
                    className={s.reset}
                    /* ⚠️ Шууд бичилт — баталгаажуулж, үр дүнг шалгана (2026-09-23).
                       Урьд нь `.then` үр дүнгээ хаяж, ArcGIS унасан ч «сэргэсэн» мэт харагддаг байв. */
                    onClick={() => {
                      /* ⚠️ 2026-09-30: remote уншигдаагүй бол жагсаалт нь кэш — хуучирсан tombstone-оор бодит мөрийг устгахгүй (`putDraft`-ийн ⚠️) */
                      if (!remoteReady()) { setAddErr(LOCK_MSG); return; }
                      if (!window.confirm(tr('«{0}» аккаунтыг сэргээх үү? Хатуу тохиргооны эрх нь буцна.', k))) return;
                      void clearOverride(k).then((okRes) => {
                        setUsers(listUsers());
                        if (!okRes) setAddErr(tr('«{0}» сэргээгдсэнгүй — ArcGIS-т бичигдээгүй, дахин оролдоно уу.', k));
                      });
                    }}
                    title={tr('Аккаунтыг сэргээж хатуу тохиргооны эрхийг нь буцаана')}
                  >
                    {tr('Буцаах')}
                  </button>
                </div>
              ))}
            </div>
          )}
          </>
        )}

        <p className={s.note}>
          {tr('Өөрчлөлт ArcGIS дээрх хуваалцсан хүснэгтэд хадгалагдаж, бүх хэрэглэгчид (өөр төхөөрөмжөөс нэвтэрсэн ч) үйлчилнэ. ArcGIS-т холбогдоогүй үед түр зуур энэ browser-т хадгалагдана.')}
        </p>

        {/* ҮНДСЭН ХАДГАЛАХ ТОВЧ — ҮРГЭЛЖ доод талд наалдана.
          * ⚠️ 2026-08-25 (хэрэглэгчийн хүсэлт): урьд нь зөвхөн өөрчлөлттэй үед
          * гарч ирдэг байсныг БАЙНГА харагдахаар болгов — товч хаана байдгийг
          * админ үргэлж мэднэ. Өөрчлөлтгүй үед идэвхгүй, тоолуур «бүгд
          * хадгалагдсан» гэж мэдээлнэ. */}
        <div className={s.saveBar}>
          <span className={s.saveInfo}>
            {drafts.size > 0
              ? tr('{0} хэрэглэгчийн өөрчлөлт хадгалагдаагүй', String(drafts.size))
              : saved
                ? (saved.fail > 0
                  ? tr('{0} хадгалагдав · ArcGIS-т хүрсэнгүй: {1}', String(saved.ok),
                      saved.failed.slice(0, 3).join(', ') + (saved.failed.length > 3 ? (' +' + String(saved.failed.length - 3)) : ''))
                    + (saved.msg ? ` — ${saved.msg}` : '')
                  : tr('{0} хэрэглэгчийн өөрчлөлт хадгалагдлаа', String(saved.ok)))
                : tr('Бүх өөрчлөлт хадгалагдсан')}
          </span>
          {dirtyRemote.size > 0 && (
            <button
              type="button"
              className={s.cancelBtn}
              disabled={saving || syncing}
              onClick={() => { void retrySync(); }}
              title={tr('ArcGIS-т хүрээгүй {0} өөрчлөлтийг дахин илгээнэ', String(dirtyRemote.size))}
            >
              {syncing ? tr('Синк хийж байна…') : tr('Дахин синк ({0})', String(dirtyRemote.size))}
            </button>
          )}
          {drafts.size > 0 && (
            <button
              type="button"
              className={s.cancelBtn}
              disabled={saving}
              /* ⚠️ `requestClose`-той ИЖИЛ баталгаажуулалт (2026-09-23) — нэг товшилтоор бүх ноорог арчигдахгүй */
              onClick={() => {
                if (drafts.size > 0
                  && !window.confirm(tr('Хадгалаагүй өөрчлөлт байна. Хадгалалгүй гарах уу?'))) return;
                setDrafts(new Map()); setSaved(null);
              }}
            >
              {tr('Болих')}
            </button>
          )}
          <button
            type="button"
            className={s.saveBtn}
            onClick={() => { void saveAll(); }}
            disabled={saving || drafts.size === 0}
            title={tr('Ctrl+S')}
          >
            {saving ? tr('Хадгалж байна…') : tr('Хадгалах')}
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
