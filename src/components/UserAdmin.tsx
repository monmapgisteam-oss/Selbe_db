'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSyncRef } from '@/lib/useSyncRef';
import { isTopFocusTrap, pushFocusTrap } from '@/lib/useFocusTrap';
import { t as tr } from '@/lib/i18nCore';
import { AUTH, VIEWS, isCodeSuper, roleForUser, type Role, type ViewKey } from '@/lib/services';
import { arcgisPost } from '@/lib/query';
import { authToken } from '@/lib/authToken';
import { currentUser } from '@/lib/who';
import {
  listUsers,
  listRemoved,
  removeUser,
  setUser,
  restoreUser,
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
import { askConfirm } from '@/lib/confirm';
import { lastSuperWarn, superDemoteMsg, superGrantMsg } from './UserTypeSection';
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
import { HuvaariAcl } from '@/modules/HuvaariAcl';
import { ObyemAcl } from '@/modules/ObyemAcl';
import { ChanarAcl } from '@/modules/ChanarAcl';
import { DedButetsAcl } from '@/modules/DedButetsAcl';
import { AjilAcl } from '@/modules/AjilAcl';
import { listChanarAssigns, purgeChanarAssign, subscribeChanarAcl } from '@/lib/chanarAcl';
import { listHuvaariAssigns, purgeHuvaariAssign, subscribeHuvaariAcl } from '@/lib/huvaariAcl';
import { listObyemAssigns, purgeObyemAssign, subscribeObyemAcl } from '@/lib/obyemAcl';
import { listAjilAssigns, purgeAjilAssign, subscribeAjilAcl } from '@/lib/ajilAcl';
import { listButetsAssigns, purgeButetsAssign, subscribeButetsAcl } from '@/lib/butetsAcl';
import {
  purgeAssign, stageOfUser, subscribeAcl,
} from '@/lib/guitsetgelAcl';
import {
  allAclReady, flowWaitingFor, flowWaitingText, heldByText, pendingHeldBy, removalBlockingText, setAclDrafts, subscribeAclPending,
} from '@/lib/aclOps';
import { checkPortalPresence, subscribePortalPresence } from '@/lib/portalPresence';
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
import { sysByText, useSystemClosed } from './SystemCloseDialog';
import { NEW_ACCOUNT_ROLE, TYPE_ORDER, roleAccess, typeLabel } from '@/lib/roleTypes';
import { setTypeDraftUsers, subscribeTypeLock } from '@/lib/roleTypeApply';
import s from './userAdmin.module.css';

/** Бүх харагдац — тоолуур ба 'all'-ыг жагсаалт болгоход */
const ALL_KEYS: ViewKey[] = VIEWS.map((v) => v.key);
/**
 * Картын унтраалгаар toggle хийж болох харагдац — урсгалтай 6-г ХАСНА
 * (2026-09-30, `caps.WORKFLOW_VIEWS`): тэдгээр нь урсгалын хуваарилалтаар
 * нээгдэж, хасахад буцаагдана.
 */
const TOGGLE_KEYS: ViewKey[] = ALL_KEYS.filter((k) => !WORKFLOW_VIEWS.includes(k));
/** `next`-д хадгалагдсан урсгалтай харагдацуудыг (`cur`-ээс) хэвээр үлдээнэ */
const keepWorkflow = (cur: ViewKey[] | 'all', next: ViewKey[]): ViewKey[] => {
  const held = (cur === 'all' ? ALL_KEYS : cur).filter((k) => WORKFLOW_VIEWS.includes(k) && !next.includes(k));
  return [...next, ...held];
};

/**
 * Үүргийн preset товчнууд — «Эрхийн төрөл»-ийн 10 төрөл (2026-09-25).
 */
/**
 * @param hardSuper 2026-10-09 (аудит №6): `super` сонголт ЗӨВХӨН кодонд бүртгэлтэй админы мөрөнд
 *   (тэнд сонгогч угаасаа идэвхгүй). Урьд нь жирийн аккаунтад ч «Super» харагдаж, ноорог → `setUser`
 *   нь `role:'super'` override бичдэг байв — `roleTypeApply.applyType` · `UserTypeSection` татгалздаг,
 *   05-erh-batlah §9 «Super зөвхөн кодын админд». Бөөнөөр засах зурваст (`hardSuper=false`) ч алга.
 */
const rolePresets = (hardSuper = false): { key: Role; label: string }[] =>
  TYPE_ORDER.filter((r) => r !== 'super' || hardSuper).map((r) => ({ key: r, label: typeLabel(r) }));

const grantsSuperToPlain = (_username: string, role: Role): boolean =>
  role === 'super' && roleForUser(currentUser()) !== 'super';

const hasView = (views: ViewKey[] | 'all', k: ViewKey) => views === 'all' || views.includes(k);

const toggled = (views: ViewKey[] | 'all', k: ViewKey): ViewKey[] => {
  const arr = views === 'all' ? [...ALL_KEYS] : [...views];
  return arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k];
};


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
 */
/**
 * ШИНЭ АККАУНТЫН НЭРИЙГ ArcGIS-ЭЭС ЛАВЛАНА (2026-10-05) — `community/users/<нэр>`.
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

export type Draft = {
  views: ViewKey[] | 'all';
  docs: boolean;
  role: Role | null;
  base?: UserBase;
  /** «Устгах» — хадгалахад аккаунтыг жагсаалтаас хасаж нэвтрэлтийг нь хаана */
  remove?: boolean;
  /** Панелаас ШИНЭЭР нэмсэн, хараахан хадгалаагүй аккаунт */
  isNew?: boolean;
  /**
   * Админ «Гүйцэтгэлийн хяналт» унтраалгыг ГАРААР хөндсөн тэмдэг.
   */
  touchedGuits?: boolean;
  /**
   * Админ үүргийн preset-ийг ГАРААР дарсан тэмдэг (2026-08-29).
   */
  touchedRole?: boolean;
};

/**
 * ХЭРЭГЛЭГЧИЙН ЭРХ УДИРДЛАГА — зөвхөн super admin-д.
 */
/** Бүтэн өргөнтэй хуудсууд — «Эрхийн төрөл» ба «багц × үүрэг/шат» хүснэгттэй 7 хуудас (2026-09-30) */
const WIDE_PANES: ReadonlySet<string> = new Set(['types', 'guits', 'huvaari', 'ajil', 'obyem', 'chanar', 'butets']);

export function UserAdmin({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<UserPerm[]>([]);
  /** Нэвтэрсэн админы нэр — ӨӨРИЙН аккаунтад устгах товч гарахгүй (өөрийгөө түгжихээс сэргийлнэ) */
  const { user: me } = useAuth();
  const myName = me?.username?.toLowerCase() ?? null;
  const sysNow = useSystemClosed();
  /**
   * АЛЬ БҮЛЭГ нээлттэй байна.
   */
  const [pane, setPane] = useState<'ovw' | 'types' | 'users' | ErhPane>('ovw');
  const [name, setName] = useState('');
  const [addErr, setAddErr] = useState('');
  const [addNote, setAddNote] = useState('');
  /** Хайлт — олон аккаунттай үед шаардлагатай (нэрээр шүүнэ) */
  const [q, setQ] = useState('');
  /** Дэлгэсэн мөрүүд — анхдагчаар БҮГД хураасан (13 хэрэглэгч × 14 унтраалга = уншигдахгүй хана) */
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  /** Бөөнөөр засах сонголт */
  const [sel, setSel] = useState<Set<string>>(new Set());
  /** Remote хүснэгт уншигдсан эсэх — унасан бол offline тэмдэг харуулна */
  const [remoteOk, setRemoteOk] = useState(true);
  /**
   * Remote уншилт ЯВЖ БАЙГАА эсэх (2026-10-01, «хэрэглэгч: бүгдийг зас»).
   */
  const [remoteBusy, setRemoteBusy] = useState(true);
  /** Remote-оос дахин унших — нээх бүрд ба «Дахин оролдох»-д */
  const reloadRemote = useCallback(() => {
    setRemoteBusy(true);
    void initRemote(false, true)
      .then((ok) => {
        setRemoteOk(ok);
        setUsers(listUsers());
        void checkPortalPresence(listUsers().map((u) => u.username));
      })
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsers(listUsers());
    // trusted=true — панел зөвхөн кодын хатуу super-т нээгддэг (Root.isSuper):
    // өөрийнх нь dirty-set дахин илгээгдэж, давхарлагдана
    reloadRemote();
  }, [open, reloadRemote]);

  const draftsRef = useRef(drafts);

  useSyncRef(draftsRef, drafts);
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
    if (anyUnsaved()) {
      void askConfirm(tr('Хадгалаагүй өөрчлөлт байна. Хадгалалгүй гарах уу?'), { danger: true, ok: tr('Хадгалалгүй гарах') })
        .then((yes) => { if (yes) doClose(); });
      return;
    }
    doClose();
  };
  const doClose = () => {
    setDrafts(new Map());
    setSel(new Set());
    setSaved(null);
    setAddErr('');
    setAddNote('');
    setQ('');
    setCard(null);
    onClose();
  };
  const goPane = (k: typeof pane) => {
    if (k !== pane && pane === 'types' && typesDirtyRef.current) {
      void askConfirm(tr('Эрхийн төрлийн загварт хадгалаагүй өөрчлөлт байна. Хадгалалгүй шилжих үү?'), { danger: true, ok: tr('Хадгалалгүй шилжих') })
        .then((yes) => { if (yes) setPane(k); });
      return;
    }
    setPane(k);
  };

  const saveRef = useRef<() => void>(() => {});
  const closeRef = useRef<() => void>(() => {});
  useSyncRef(closeRef, requestClose);
  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (!isTopFocusTrap(root)) return;
      if (e.key === 'Escape') { if (!e.defaultPrevented) closeRef.current(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
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
  useEffect(() => {
    const root = dialogRef.current;
    if (!open || !root) return undefined;
    return pushFocusTrap(root);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ae = document.activeElement as (HTMLElement & { focus?: () => void }) | null;
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
  const [, setAclN] = useState(0);
  useEffect(() => subscribeAcl(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribeHuvaariAcl(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribeObyemAcl(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribeChanarAcl(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribeAjilAcl(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribeButetsAcl(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribeAclPending(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribeTypeLock(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribePortalPresence(() => setAclN((n) => n + 1)), []);
  useEffect(() => { setTypeDraftUsers(drafts.keys()); }, [drafts]);
  useEffect(() => { setAclDrafts(drafts.entries()); }, [drafts]);
  useEffect(() => () => setAclDrafts([]), []);

  /** Устгагдсан аккаунтууд — рендер бүрд ДАХИН биш, нэг л удаа */
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
  const dirtyRemote = new Set([...dirtyKeys(), ...dirtyCapKeys()]);
  const capsLocked = !allAclReady();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');
  const retrySync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const superForeign = foreignDirty().filter((f) => f.role === 'super').map((f) => f.key);
      const foreign = new Map<string, string>();
      for (const f of [...foreignDirty(), ...foreignCapsDirty()]) {
        if (!foreign.has(f.key) || !foreign.get(f.key)) foreign.set(f.key, f.by);
      }
      const onlyMine = foreign.size > 0 && !(await askConfirm(tr(
        'Энэ хөтчид өмнөх сешнээс үлдсэн, ArcGIS-т хадгалагдаагүй эрхийн өөрчлөлт байна: {0}. Эдгээрийг ТАНЫ эрхээр ArcGIS руу бичих үү? (Хаалтанд — бичсэн хүн; энэ хөтчийн хадгалалтаас уншсан тул баталгаагүй.) «Зөвхөн энэ сешнийх» дарвал зөвхөн энэ сешний өөрчлөлтийг илгээнэ.',
        [...foreign].map(([k, by]) => `${k} (${by || '—'})`).join(', '),
      ), { ok: tr('Бүгдийг илгээх'), cancel: tr('Зөвхөн энэ сешнийх') }));
      /* Эрхийн (caps) dirty-г ч хамт дахин илгээнэ — нэг товч, хоёр dirty-set */
      const [leftPerms, leftCaps] = onlyMine
        ? await Promise.all([retryDirty(true), retryCapsDirty(true)])
        : await Promise.all([retryDirty(), retryCapsDirty()]);
      const left = leftPerms + leftCaps;
      setUsers(listUsers());
      setSaved(left === 0 ? null : saved);
      const msgs: string[] = [];
      if (left > 0) msgs.push(tr('{0} өөрчлөлт дахин хүрсэнгүй — холболтоо шалгаад «Дахин илгээх» дарна уу.', String(left)));
      if (!onlyMine && superForeign.length) {
        msgs.push(tr('Өмнөх сешнээс үлдсэн super олголт ({0}) аюулгүй байдлын үүднээс илгээгдсэнгүй — шаардлагатай бол самбараас дахин олгоно уу.', superForeign.join(', ')));
      }
      if (msgs.length) setAddErr(msgs.join(' '));
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
    if (!remoteReady()) { setAddErr(LOCK_MSG); return; }
    const key = u.username.toLowerCase();
    const next = { ...d, base: d.base ?? { views: u.views, docs: u.docs, role: u.role } };
    const same = !next.remove
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
   */
  const dropsGuits = (u: UserPerm, from: ViewKey[] | 'all', to: ViewKey[] | 'all'): boolean =>
    hasView(from, 'guitsetgel') && !hasView(to, 'guitsetgel') && !!stageOfUser(u.username);
  const confirmDropGuits = (): Promise<boolean> =>
    askConfirm(tr('Энэ хэрэглэгч урсгалын шатанд томилогдсон. «Гүйцэтгэлийн хяналт»-ыг унтраавал ажлаа хянаж чадахгүй болно. Унтраах уу?'), { danger: true, ok: tr('Унтраах') });

  /** @param confirmed бөөнөөр засахад нэг удаа асуусан бол дахин асуухгүй */
  const applyRole = async (u: UserPerm, role: Role, confirmed = false) => {
    if (roleForUser(u.username) === 'super' && role !== 'super' && (isCodeSuper(u.username) || u.username.toLowerCase() === myName)) return;
    if (grantsSuperToPlain(u.username, role)) {
      setAddErr(tr('Super эрхийг зөвхөн super админ олгож, хасна.'));
      return;
    }
    if (role === 'zahiral' && stageOfUser(u.username)) {
      setAddErr(tr('«{0}» гүйцэтгэлийн урсгалд томилгоотой — Ерөнхий захирал зөвхөн харна. Эхлээд урсгалын томилгоог хасна уу.', u.username));
      return;
    }
    if (role === 'super' && draftOf(u).role !== 'super' && roleForUser(u.username) !== 'super' && !confirmed
      && !(await askConfirm(superGrantMsg(u.username), { danger: true, ok: tr('Админ эрх олгох') }))) return;
    if (role !== 'super' && roleForUser(u.username) === 'super' && draftOf(u).role === 'super'
      && !(await askConfirm(superDemoteMsg(u.username, typeLabel(role)), { danger: true, ok: tr('Админ эрх хасах') }))) return;
    const a = roleAccess(role);
    const d = draftOf(u);
    const drop = a.views !== 'all' && dropsGuits(u, d.views, keepWorkflow(d.views, a.views));
    if (drop && !confirmed && !(await confirmDropGuits())) return;
    putDraft(u, {
      ...d, views: a.views === 'all' ? 'all' : keepWorkflow(d.views, a.views), docs: a.docs, role, touchedRole: true,
      ...(drop ? { touchedGuits: true } : null),
    });
  };
  const flipView = async (u: UserPerm, k: ViewKey) => {
    if (roleForUser(u.username) === 'super') return;
    if (WORKFLOW_VIEWS.includes(k)) return;
    const d = draftOf(u);
    if (!hasView(d.views, k) && capViewsOf(u.username).includes(k)) return;
    const next = toggled(d.views, k);
    if (dropsGuits(u, d.views, next) && !(await confirmDropGuits())) return;
    const touched = k === 'guitsetgel' ? { touchedGuits: true } : null;
    putDraft(u, { ...d, ...touched, views: next });
  };
  const setAllViews = async (u: UserPerm, on: boolean) => {
    if (roleForUser(u.username) === 'super') return;
    const d = draftOf(u);
    const next: ViewKey[] = keepWorkflow(d.views, on ? [...TOGGLE_KEYS] : []);
    const drop = dropsGuits(u, d.views, next);
    if (drop && !(await confirmDropGuits())) return;
    putDraft(u, { ...d, views: next, docs: on, ...(drop ? { touchedGuits: true } : null) });
  };
  const flipRemove = (u: UserPerm) => {
    const d = draftOf(u);
    if (d.isNew && !users.some((x) => x.username.toLowerCase() === u.username.toLowerCase())) {
      const key = u.username.toLowerCase();
      setDrafts((prev) => { const m = new Map(prev); m.delete(key); return m; });
      setSaved(null);
      return;
    }
    putDraft(u, { ...d, remove: !d.remove });
  };

  /* ── Бөөнөөр засах ──
   */
  const selRows = allRows.filter((u) => sel.has(u.username.toLowerCase()));
  const bulkRole = async (role: Role) => {
    const a = roleAccess(role);
    const isSup = (u: UserPerm): boolean => roleForUser(u.username) === 'super' || draftOf(u).role === 'super';
    const supSkipped = selRows.filter(isSup);
    const skipped = selRows.filter((u) => !isSup(u) && grantsSuperToPlain(u.username, role));
    const rows = selRows.filter((u) => !isSup(u) && !skipped.includes(u));
    // Томилогдсон хүмүүсийн «Гүйцэтгэлийн хяналт» хасагдах бол НЭГ удаа асууна
    const av = a.views;
    const hit = av === 'all' ? [] : rows.filter((u) => dropsGuits(u, draftOf(u).views, keepWorkflow(draftOf(u).views, av)));
    if (hit.length && !(await askConfirm(tr('{0} — урсгалын шатанд томилогдсон. «Гүйцэтгэлийн хяналт» нь хасагдвал ажлаа хянаж чадахгүй болно. Үргэлжлүүлэх үү?', hit.map((u) => u.username).join(', ')), { danger: true, ok: tr('Үргэлжлүүлэх') }))) return;
    rows.forEach((u) => { void applyRole(u, role, true); });
    setSel(new Set());
    const msgs: string[] = [];
    if (supSkipped.length) msgs.push(tr('{0} админ (super) аккаунт алгасагдлаа — тэдний төрлийг нэг бүрчлэн солино: {1}', String(supSkipped.length), supSkipped.map((u) => u.username).join(', ')));
    if (skipped.length) msgs.push(tr('Алгассан (өөрийн эсвэл super аккаунт): {0}', skipped.map((u) => u.username).join(', ')));
    if (msgs.length) setAddErr(msgs.join(' '));
  };
  const bulkRemove = () => {
    const skipped = selRows
      .filter((u) => u.username.toLowerCase() === myName || isCodeSuper(u.username))
      .map((u) => u.username);
    const supSkipped = selRows
      .filter((u) => !skipped.includes(u.username) && roleForUser(u.username) === 'super')
      .map((u) => u.username);
    selRows
      .filter((u) => !skipped.includes(u.username) && !supSkipped.includes(u.username))
      .forEach((u) => { if (!draftOf(u).remove) flipRemove(u); });
    setSel(new Set());
    const msgs: string[] = [];
    if (supSkipped.length) msgs.push(tr('{0} админ (super) аккаунт алгасагдлаа — тэднийг нэг бүрчлэн устгана: {1}', String(supSkipped.length), supSkipped.join(', ')));
    if (skipped.length) msgs.push(tr('Алгассан (өөрийн эсвэл super аккаунт): {0}', skipped.join(', ')));
    if (msgs.length) setAddErr(msgs.join(' '));
  };

  /**
   * ГАНЦ ХАДГАЛАХ — бүх ноорогыг ДАРААЛЛААР бичиж, үр дүнг нь ХҮЛЭЭНЭ.
   */
  const saveAll = async () => {
    if (saving || drafts.size === 0) return;
    if (capsLocked && [...drafts.values()].some((d) => d.remove)) {
      setAddErr(LOCK_MSG);
      return;
    }
    if (!remoteReady()) { setAddErr(LOCK_MSG); return; }
    const removing = [...drafts.values()].filter((d) => d.remove).length;
    if (removing > 0) {
      const gone = [...drafts].filter(([, d]) => d.remove).map(([k]) => k);
      const [held, flowHeld] = await Promise.all([pendingHeldBy(gone), flowWaitingFor(gone)]);
      const parts = [
        lastSuperWarn(gone),
        removalBlockingText(gone),
        flowHeld == null || flowHeld.length ? flowWaitingText(flowHeld) : '',
        held == null || held.length ? heldByText(held) : '',
      ].filter(Boolean);
      const extra = parts.length ? `\n\n${parts.join('\n\n')}` : '';
      if (!(await askConfirm(tr('{0} аккаунт хадгалахад УСТГАГДАНА. Үргэлжлүүлэх үү?', String(removing)) + extra, { danger: true, ok: tr('Устгаж хадгалах') }))) return;
    }
    setSaving(true);
    setSaved(null);
    takeWriteError();
    const snapshot = drafts;
    let ok = 0;
    let fail = 0;
    const failed: string[] = [];
    let firstErr = '';
    const gone: string[] = [];

    for (const [key, d] of snapshot) {
      const u = users.find((x) => x.username.toLowerCase() === key);
      const uname = u?.username ?? key;
      try {
        // УСТГАХ — урсгалын томилгоог нь цэвэрлээд tombstone/арилгалт хийнэ.
        if (d.remove) {
          if (d.isNew && !listUsers().some((x) => x.username.toLowerCase() === key)) continue;
          const r = await removeUser(uname);
          if (!r) { fail += 1; failed.push(uname); continue; }
          const flowOk = await purgeAssign(uname);
          const hvOk = await purgeHuvaariAssign(uname);
          const obOk = await purgeObyemAssign(uname);
          const chOk = await purgeChanarAssign(uname);
          const ajOk = await purgeAjilAssign(uname);
          const btOk = await purgeButetsAssign(uname);
          const capOk = await setCaps(uname, [], { absolute: true });
          if (flowOk && hvOk && obOk && chOk && ajOk && btOk && capOk) ok += 1; else { fail += 1; failed.push(uname); }
          continue;
        }
        if (!d.isNew && !listUsers().some((x) => x.username.toLowerCase() === key)) { gone.push(uname); continue; }

        /*
         * ЗӨВХӨН ХАРАГДАЦ ба ҮҮРЭГ — урсгалын ШАТ томилох нь «Гүйцэтгэлийн
         * урсгалын эрх» хуудсанд НЭГ л газарт (`setAssign` эрхийг дагуулна).
         */
        let views = d.views;
        if (views !== 'all') views = views.filter((k) => !WORKFLOW_VIEWS.includes(k));
        const role = d.touchedRole || !u ? d.role : u.role;
        const r = await setUser(uname, { views, docs: d.docs }, role, d.base);
        if (r) ok += 1; else { fail += 1; failed.push(uname); }
      } catch (e) {
        fail += 1;
        failed.push(uname);
        if (!firstErr) firstErr = e instanceof Error ? e.message : String(e);
      }
    }

    setUsers(listUsers());
    const failedKeys = new Set(failed.map((x) => x.toLowerCase()));
    setDrafts((prev) => {
      const m = new Map(prev);
      for (const [k, d] of snapshot) if (m.get(k) === d && !failedKeys.has(k)) m.delete(k);
      return m;
    });
    setSaving(false);
    setAddNote('');
    if (fail > 0 && !firstErr) firstErr = takeWriteError();
    setSaved({ ok, fail, failed, msg: firstErr ? userError(firstErr) : undefined });
    if (gone.length) setAddErr(tr('«{0}» устгагдсан аккаунт — өөрчлөлт хадгалагдсангүй.', gone.join(', ')));
  };
  // eslint-disable-next-line react-hooks/refs
  saveRef.current = () => {
    if (pane !== 'users' && draftsRef.current.size > 0 && !typesDirtyRef.current) { setPane('users'); setCard(null); }
    void saveAll();
  };

  /**
   * ШИНЭ АККАУНТ — ноорогт нэмнэ (шууд бичихгүй).
   */
  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (!/^[A-Za-z0-9][A-Za-z0-9@._-]{2,127}$/.test(n)) {
      setAddErr(tr('«{0}» нь ArcGIS хэрэглэгчийн нэрийн бүтцэд тохирохгүй (латин үсэг/тоо, 3+ тэмдэгт).', n));
      return;
    }
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
      setAddErr(tr('«{0}» нэрээр хуучин урсгалын томилгоо үлдсэн байна — «Гүйцэтгэлийн урсгалын эрх» хуудсанд ✕ дарж арилгаад дахин нэмнэ үү.', n));
      return;
    }
    const orphan: [boolean, string][] = [
      [listHuvaariAssigns().some((a) => a.user === key), paneLabel('huvaari')],
      [listObyemAssigns().some((a) => a.user === key), paneLabel('obyem')],
      [listAjilAssigns().some((a) => a.user === key), paneLabel('ajil')],
      [listButetsAssigns().some((a) => a.user === key), paneLabel('butets')],
      [listChanarAssigns().some((a) => a.user === key), paneLabel('chanar')],
    ];
    const stuck = orphan.find(([hit]) => hit);
    if (stuck) {
      setAddErr(tr('«{0}» нэрээр хуучин хуваарилалт үлдсэн байна — «{1}» хуудсанд ✕ дарж арилгаад дахин нэмнэ үү.', n, stuck[1]));
      return;
    }
    const orphanCaps = capsOf(key);
    if (orphanCaps.length) {
      void askConfirm(tr('«{0}» нэрээр устгагдсан аккаунтын засах эрх ({1}) үлдсэн байна. Эдгээрийг арилгаад нэмэх үү?', n, orphanCaps.map(capLabelShort).join(', ')), { ok: tr('Арилгаад нэмэх') })
        .then((yes) => {
          if (!yes) return;
          void setCaps(key, [], { absolute: true }).then((done) => {
            if (!done) setAddErr(tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ хөтчид'));
          });
          addDraft(n, key);
        });
      return;
    }
    addDraft(n, key);
  };
  /** Шинэ аккаунтыг ноорогт нэмнэ — `add`-ийн шалгалтуудын дараа (2026-10-23: асуултын дараа ч дуудагдана) */
  const addDraft = (n: string, key: string) => {
    const a = roleAccess(NEW_ACCOUNT_ROLE);
    setDrafts((prev) => new Map(prev).set(key, {
      views: a.views === 'all' ? [...TOGGLE_KEYS] : a.views.filter((k) => !WORKFLOW_VIEWS.includes(k)),
      docs: a.docs, role: NEW_ACCOUNT_ROLE, isNew: true,
    }));
    setOpenRows((prev) => new Set(prev).add(key));
    setName('');
    setAddErr('');
    setSaved(null);
    setAddNote(tr('«{0}» ноорогт нэмэгдлээ. «Хадгалах» дарсны дараа багц болон засах эрхийн хуудсуудад сонгогдоно.', n));
    setQ('');
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
    /* Засах эрхийн гэр харагдац runtime дээр нээлттэй — тоолуур ба
       унтраалга үүнийг ч тусгана (`UserRights`) */
    const capViews = capViewsOf(u.username);
    const wf = workflowViewsOf(u.username);
    const hard = roleForUser(u.username) === 'super';
    const isSup = d.role === 'super' || hard;
    const opened = (k: ViewKey): boolean => hard || (WORKFLOW_VIEWS.includes(k) && !isSup
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
      caps: capsLocked ? capsStored(u.username) : capsOf(u.username),
      selected: sel.has(key),
      dirtyPerm: dirtyRemote.has(key),
      myName,
      allKeys: ALL_KEYS,
      rolePresets: rolePresets(roleForUser(myName) === 'super'),
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
      onRole: (role) => { void applyRole(u, role); },
      onFlipView: (k) => { void flipView(u, k); },
      onAllViews: (v) => { void setAllViews(u, v); },
      onFlipRemove: () => flipRemove(u),
      onGoFlow: () => goPane('guits'),
      superUser: roleForUser(u.username) === 'super' && (key === myName || isCodeSuper(u.username)),
      viewsLocked: roleForUser(u.username) === 'super',
      onOpenCard: () => setCard({ user: key }),
    };
  };
  /** Нээлттэй картын хэрэглэгч — хадгалаагүй шинэ аккаунт ч (`allRows`) */
  const cardRow = card ? allRows.find((x) => x.username.toLowerCase() === card.user) ?? null : null;

  return (
    <div ref={dialogRef} className={s.page} role="dialog" aria-modal="true" aria-label={tr('Админ портал')}>
      <header className={s.pageHead}>
        <span className={s.pageBrand}>
          <span className={s.pageBadge}><Icon name="users" size={15} /></span>
          <span className={s.pageBrandText}>
            <b>{tr('Админ портал')}</b>
            <small>{tr('Сэлбэ ухаалаг хот · тохиргоо')}</small>
          </span>
        </span>
        <button type="button" className={s.back} onClick={requestClose}>
          {tr('← Портал руу буцах')}
        </button>
      </header>

      <aside className={s.side} aria-label={tr('Админ цэс')}>
        <div className={s.sideHead}>{tr('Тохиргоо')}</div>
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
          onClick={() => { goPane('users'); setCard(null); }}
        >
          <Icon name="users" size={14} />
          {tr('Хэрэглэгчдийн эрх удирдах')}
        </button>
        <button
          type="button"
          className={`${s.sideItem} ${pane === 'types' ? s.sideItemOn : ''}`}
          aria-current={pane === 'types'}
          onClick={() => goPane('types')}
        >
          <Icon name="layers" size={14} />
          {tr('Эрхийн төрөл')}
        </button>
        <button
          type="button"
          className={`${s.sideItem} ${pane === 'guits' ? s.sideItemOn : ''}`}
          aria-current={pane === 'guits'}
          onClick={() => goPane('guits')}
        >
          <Icon name="pen" size={14} />
          {tr('Гүйцэтгэлийн урсгалын эрх')}
        </button>
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

      <div className={`${s.main} ${WIDE_PANES.has(pane) ? s.mainWide : ''}`}>
        {sysNow && (
          <div className={s.addErr} role="alert">
            {tr('🔴 Систем хаалттай — {0}. Зөвхөн «Систем түр хаах» эрхтэй аккаунт ба админ (super) нэвтэрнэ; нээх бол цэсний «Систем» бүлгийн «Систем түр хаах».', sysByText(sysNow) || '—')}
          </div>
        )}
        {pane === 'ovw' ? (
          <>
            <header className={s.head}>
              <h2 className={s.title}>{tr('Эрхийн тойм')}</h2>
              <p className={s.subtitle}>
                {tr('Багц бүрд хэн юу хариуцаж байгаа, хүн бүр юу хийж чадахыг нэг дэлгэцэнд. Ажил гацах эрсдэлийг урьдчилж хэлнэ.')}
              </p>
            </header>
            <ErhOverview
              onGo={(x) => { goPane(x as typeof pane); setCard(null); }}
              drafts={drafts}
              onOpenUser={(user) => { goPane('users'); setCard({ user: user.toLowerCase() }); }}
            />
          </>
        ) : pane !== 'types' && pane !== 'guits' && pane !== 'users' ? (
          <>
            <header className={s.head}>
              <h2 className={s.title}>{paneLabel(pane)}</h2>
              <p className={s.subtitle}>{paneSubtitle(pane)}</p>
            </header>
            {PANE_CAPS[pane].some(isDerivedCap) && <p className={s.note}>{paneNote(pane)}</p>}
            {PANE_CAPS[pane].filter(isDerivedCap).map((c) => <CapOrphanNote key={c} cap={c} />)}
            <AclRepairNote key={`repair-${pane}`} pane={pane} />
            {pane === 'ajil' ? <AjilAcl />
              : pane === 'huvaari' ? <HuvaariAcl />
                : pane === 'obyem' ? <ObyemAcl />
                  : pane === 'chanar' ? <ChanarAcl />
                      : pane === 'butets' ? <DedButetsAcl />
                        : PANE_CAPS[pane].map((c) => <PlainCapAcl key={c} cap={c} />)}
          </>
        ) : pane === 'types' ? (
          <>
            <header className={s.head}>
              <h2 className={s.title}>{tr('Эрхийн төрөл')}</h2>
              <p className={s.subtitle}>
                {tr('Төрөл бүрд юу харахыг (харагдац · нүүр цонх) чеклээд хадгална. Хэрэглэгчийн картад төрөл сонгож «Төрлөөр тохируулах» дарахад харагдац нь нэг дор бичигдэнэ. Засах эрх энд ОРОХГҮЙ — хажуугийн цэсний тухайн хуудсанд.')}
              </p>
            </header>
            <ErhTypes remote={{ busy: remoteBusy, retry: reloadRemote }} onDirty={onTypesDirty} />
          </>
        ) : pane === 'guits' ? (
          <>
            <header className={s.head}>
              <h2 className={s.title}>{tr('Гүйцэтгэлийн урсгалын эрх')}</h2>
              <p className={s.subtitle}>
                {tr('Долоон шат бүрд аккаунт томилж, аль багцыг хариуцахыг зааж өгнө.')}
              </p>
            </header>
            <AclRepairNote key="repair-guits" pane="guits" />
            <GuitsetgelAcl />
          </>
        ) : (
          <>
        <header className={s.head}>
          <h2 className={s.title}>{tr('Хэрэглэгчдийн эрх удирдах')}</h2>
          <p className={s.subtitle}>
            {tr('Аккаунт · үүргийн шошго · харагдац. Унтраалгаар нээж/хааж, доод талын «Хадгалах» товчоор нэг дор хадгална. Засах эрх энд ОРОХГҮЙ — хажуугийн цэсний тухайн хуудсанд.')}
            {' '}
            {tr('Картын «Төрлөөр тохируулах» ба хажуугийн цэсний эрхийн хуудсууд ШУУД хадгалагдана. Шинэ аккаунтад «Хадгалах» дарсны дараа л багц, засах эрх олгоно.')}
          </p>
          {capsLocked ? (
            <div className={s.addErr} role="alert">
              {tr('⚠️ Эрхийн хүснэгт уншигдсангүй — нэмэх/устгах/сэргээх засвар хаалттай, дахин ачаална уу. Засах эрхээр нээгдсэн харагдацын тэмдэг энэ хөтчийн түр санах ойноос харагдаж байна.')}
            </div>
          ) : !remoteOk && (
            <div className={s.addErr} role="alert">
              {tr('⚠️ ArcGIS хүснэгтээс уншиж чадсангүй — доорх жагсаалт энэ хөтчийн түр санах ойноос. Өөрчлөлт түр энэ хөтчид хадгалагдаж, холболт сэргэхэд автоматаар илгээгдэнэ.')}
            </div>
          )}
          {permsOwnerMismatch().length > 0 && (
            <div className={s.addErr} role="alert">
              {tr('🔴 Эрхийн хүснэгтийн эзэн «{0}» нь итгэмжлэгдсэн эзний жагсаалтад алга тул БҮХ хэрэглэгчийн эрх, хуваарилалт уншигдахгүй байна. Засвар: порталд хүснэгтийн эзнийг одоогийн админд шилжүүлэх (Change owner), эсвэл хөгжүүлэгчид мэдэгдэж энэ нэрийг итгэмжлэгдсэн эзний жагсаалтад нэмүүлнэ.', permsOwnerMismatch().join(', '))}
              <details>
                <summary>{tr('Дэлгэрэнгүй')}</summary>
                {'Selbe_Permissions · permsRemote.ts · FORMER_TABLE_OWNERS'}
              </details>
            </div>
          )}
          {permsTablePublic() && (
            <div className={s.addErr} role="alert">
              {tr('🔴 Эрхийн хүснэгт (Selbe_Permissions) НИЙТЭД нээлттэй байна — нэвтрээгүй хэн ч эрх засаж чадна. Порталд хүснэгтийн хуваалцах тохиргоог (Share) «Organization» болгоно уу.')}
            </div>
          )}
        </header>

        {cardRow ? (
          <>
            {addErr && <div className={s.addErr} role="alert">{addErr}</div>}
            <UserCard
              p={rowPropsOf(cardRow)}
              hasDraft={drafts.has(cardRow.username.toLowerCase())}
              onBack={() => setCard(null)}
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
                <button type="button" className={s.searchX} onClick={() => setQ('')} title={tr('Цэвэрлэх')} aria-label={tr('Цэвэрлэх')}>✕</button>
              )}
            </div>
            <input
              className={s.input}
              value={name}
              onChange={(e) => { setName(e.target.value); setAddErr(''); setAddNote(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
              placeholder={tr('ArcGIS хэрэглэгчийн нэр')}
              aria-label={tr('Шинэ хэрэглэгчийн нэр')}
            />
            <button type="button" className={s.addBtn} onClick={add} disabled={!name.trim()}>
              {tr('Нэмэх')}
            </button>
          </div>
          {addErr && <div className={s.addErr} role="alert">{addErr}</div>}
          {addNote && <div className={s.capNote} role="status">{addNote}</div>}

          {/* Бөөнөөр засах зурвас — сонголттой үед л */}
          {sel.size > 0 && (
            <div className={s.bulkBar}>
              <span className={s.bulkInfo}>{tr('{0} сонгосон', String(sel.size))}</span>
              {rolePresets().map((r) => (
                <button key={r.key} type="button" className={s.preset} onClick={() => { void bulkRole(r.key); }}>
                  {r.label}
                </button>
              ))}
              <button type="button" className={s.delBtn} onClick={bulkRemove}>{tr('Устгах')}</button>
              <button type="button" className={s.cancelBtn} onClick={() => setSel(new Set())}>
                {tr('Сонголт арилгах')}
              </button>
            </div>
          )}

          {/* Хэрэглэгчийн жагсаалт */}
          <div className={s.list}>
            {rows.length === 0 && (
              <div className={s.empty}>
                {q.trim()
                  ? tr('«{0}» хайлтад тохирох аккаунт алга — хайлтыг цэвэрлэх (✕) эсвэл хажуугийн талбараас шинэ аккаунт нэмнэ үү.', q.trim())
                  : tr('Тохирох аккаунт олдсонгүй.')}
              </div>
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
                    onClick={() => {
                      if (!remoteReady()) { setAddErr(LOCK_MSG); return; }
                      void askConfirm(tr('«{0}» аккаунтыг сэргээх үү? Өмнөх эрхийн төрөл ба түүний харагдац буцна (админ эрх буцахгүй); багц, засах эрхийг дахин олгоно.', k), { ok: tr('Сэргээх') }).then((yes) => {
                        if (!yes) return;
                        void restoreUser(k).then((okRes) => {
                          setUsers(listUsers());
                          if (!okRes) setAddErr(tr('«{0}» сэргээгдсэнгүй — ArcGIS-т бичигдээгүй, дахин оролдоно уу.', k));
                        });
                      });
                    }}
                    title={tr('Аккаунтыг сэргээж өмнөх эрхийн төрлийг нь буцаана')}
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
          {tr('Өөрчлөлт ArcGIS дээрх хуваалцсан хүснэгтэд хадгалагдаж, бүх хэрэглэгчид (өөр төхөөрөмжөөс нэвтэрсэн ч) үйлчилнэ. ArcGIS-т холбогдоогүй үед түр зуур энэ хөтчид хадгалагдана.')}
        </p>

        {/* ҮНДСЭН ХАДГАЛАХ ТОВЧ — ҮРГЭЛЖ доод талд наалдана.
          */}
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
              {syncing ? tr('Илгээж байна…') : tr('Дахин илгээх ({0})', String(dirtyRemote.size))}
            </button>
          )}
          {drafts.size > 0 && (
            <button
              type="button"
              className={s.cancelBtn}
              disabled={saving}
              onClick={() => {
                if (drafts.size === 0) return;
                void askConfirm(tr('{0} хэрэглэгчийн хадгалаагүй өөрчлөлтийг болих уу?', String(drafts.size)), { danger: true, ok: tr('Өөрчлөлтийг болих') })
                  .then((yes) => { if (yes) { setDrafts(new Map()); setSaved(null); setAddNote(''); } });
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
