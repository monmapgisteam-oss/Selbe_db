'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { VIEWS, ROLE_ACCESS, roleForUser, type Role, type ViewKey } from '@/lib/services';
import {
  listUsers,
  listRemoved,
  removeUser,
  setUser,
  clearOverride,
  subscribe,
  dirtyKeys,
  retryDirty,
  initRemote,
  type UserPerm,
} from '@/lib/permissions';
import { useAuth } from './AuthGate';
import { Icon } from './Icon';
import { CAPS, capsOf, subscribeCaps, toggleCap, type CapKey } from '@/lib/caps';
import { GuitsetgelAcl } from '@/modules/GuitsetgelAcl';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import {
  removeAssign, stageOfUser, subscribeAcl,
} from '@/lib/guitsetgelAcl';
import s from './userAdmin.module.css';

/** Toggle хийж болох бүх харагдац */
const ALL_KEYS: ViewKey[] = VIEWS.map((v) => v.key);

/** Үүргийн preset товчнууд */
const ROLE_PRESETS: { key: Role; label: string }[] = [
  { key: 'super', label: tr('Супер') },
  { key: 'beginner', label: tr('Энгийн') },
  { key: 'tolovlolt', label: tr('Төлөвлөлт') },
];

const hasView = (views: ViewKey[] | 'all', k: ViewKey) => views === 'all' || views.includes(k);

const toggled = (views: ViewKey[] | 'all', k: ViewKey): ViewKey[] => {
  const arr = views === 'all' ? [...ALL_KEYS] : [...views];
  return arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k];
};

/** 'all' ба бүрэн жагсаалтыг ИЖИЛ гэж үзэж харьцуулна */
/* ⚠️ Нэмэлт эрхийн текстийг ЗУРАГДАХ агшинд гаргана — `caps.ts`-д биш.
   Модулийн түвшинд `tr()` дуудвал хэл солиход шинэчлэгдэхгүй, мөн i18n
   гаргагч зөвхөн үсгэн дуудлагыг олдог тул толиноос хоцорно. */
const capLabel = (k: CapKey): string => {
  if (k === 'addRow') return tr('Мөр нэмэх');
  if (k === 'qaqc') return tr('QAQC — Inspection Test Plan');
  if (k === 'zovshoorol') return tr('Зөвшөөрөл засах');
  if (k === 'finEdit') return tr('Санхүүгийн бүртгэл — утга засах');
  if (k === 'finRow') return tr('Санхүүгийн бүртгэл — мөр нэмэх, устгах');
  return k;
};
const capHint = (k: CapKey): string => {
  if (k === 'addRow') {
    return tr('«Гүйцэтгэл бөглөх» хуудсанд бүлэг дотор шинэ ажлын мөр нэмэх. Хуудасны бүтэц өөрчлөгдөж, жин ба мөнгөн дүн бүхэлдээ дахин бодогдоно.');
  }
  if (k === 'qaqc') {
    return tr('«Гүйцэтгэл бөглөх» хуудасны Inspection Test Plan хэсгийг (М-акт, FIC, MA, MIR) бөглөх. Гүйцэтгэлийн хувь бөглөх эрхээс тусдаа.');
  }
  if (k === 'zovshoorol') {
    return tr('«Зөвшөөрөл» хуудсанд зөвшөөрөл нэмэх, засах, устгах. Эрхгүй хүн зөвхөн харна.');
  }
  if (k === 'finEdit') {
    return tr('«Санхүүжилт» харагдацын Cashflow (/106) ба IPC (/107) хүснэгтийн нүдний утга засах. Эдгээр нь дашбоардын санхүүгийн БҮХ тооны эх сурвалж тул нэг нүд засахад 02, 08 дашбоард, тайлан бүгд дагаж өөрчлөгдөнө.');
  }
  if (k === 'finRow') {
    return tr('Тэр хоёр хүснэгтэд шинэ мөр нэмэх, байгаа мөрийг устгах. ⚠️ Устгасан мөрийг порталаас буцаах арга БАЙХГҮЙ.');
  }
  return '';
};

const viewsEq = (a: ViewKey[] | 'all', b: ViewKey[] | 'all'): boolean =>
  ALL_KEYS.every((k) => hasView(a, k) === hasView(b, k));

const countOn = (views: ViewKey[] | 'all'): number =>
  views === 'all' ? ALL_KEYS.length : ALL_KEYS.filter((k) => views.includes(k)).length;

/**
 * НЭГ хэрэглэгчийн ХАДГАЛААГҮЙ өөрчлөлт (ноорог).
 *
 * ⚠️ 2026-08-25 (хэрэглэгчийн хүсэлт): даралт бүр ArcGIS руу ШУУД бичдэг байсныг
 * болиулав — унтраалга дарахад зөвхөн ноорогт бичигдэж, доод талын ГАНЦ
 * «Хадгалах» товч бүгдийг нэг дор ArcGIS + localStorage руу буулгана. Ингэснээр
 * админ олон унтраалга дараад нэг удаа хадгалж, эсвэл «Болих»-оор бүгдийг
 * буцааж чадна.
 */
type Draft = {
  views: ViewKey[] | 'all';
  docs: boolean;
  role: Role | null;
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
};

/**
 * ХЭРЭГЛЭГЧИЙН ЭРХ УДИРДЛАГА — зөвхөн super admin-д.
 *
 * ⚠️ БҮХ өөрчлөлт (нэмэх, эрх солих, шат томилох, устгах) НООРОГТ хуримтлагдаж
 * ганц «Хадгалах» товчоор л ArcGIS + localStorage руу бууна. Хэсэгчилсэн бичилт
 * байхгүй тул «хагас тохируулсан» төлөв үүсэхгүй.
 */
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
  const [pane, setPane] = useState<'users' | 'guits'>('users');
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
  /** «Дахин синк» ажиллаж байгаа эсэх */
  const [syncing, setSyncing] = useState(false);
  /** username(жижиг үсгээр) → хадгалаагүй ноорог */
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  /** Нэмэлт эрхийн ArcGIS бичилт унасан хэрэглэгчид */
  const [capErr, setCapErr] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);
  /** Хамгийн сүүлийн хадгалалтын үр дүн — товчийн доор товч мэдэгдэл */
  const [saved, setSaved] = useState<{ ok: number; fail: number; failed: string[] } | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setUsers(listUsers());
    /*
     * ⚠️ Нээх бүрд remote-оос ДАХИН татна — өөр админы саяын засвар 5 минутын
     * poll хүлээлгүй харагдана. Уншилт унавал offline тэмдэг гарна (урьд нь
     * ямар ч дохиогүй, хуучин cache-ийг үнэн мэт харуулдаг байв).
     */
    void initRemote(false).then((ok) => { setRemoteOk(ok); setUsers(listUsers()); });
  }, [open]);

  /** F5/таб хаахад хадгалаагүй ноорог чимээгүй алдагдахаас сэргийлнэ */
  useEffect(() => {
    if (!open) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      if (draftsRef.current.size === 0) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [open]);

  /** Хадгалаагүй ноорогтой үед санамсаргүй хаагдахаас хамгаална */
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const requestClose = () => {
    if (saving) return; // хадгалалт дуустал хүлээнэ — дундуур гарвал төлөв төөрнө
    if (draftsRef.current.size > 0
      && !window.confirm(tr('Хадгалаагүй өөрчлөлт байна. Хадгалалгүй гарах уу?'))) return;
    setDrafts(new Map());
    onClose();
  };

  /*
   * ⚠️ Escape-ээр хаах · фоны гүйлгэлт түгжих · Ctrl/Cmd+S-ээр хадгалах ·
   *    Tab-ыг модал дотор БАРЬЖ үлдэх (focus trap). Модал нээлттэй байхад
   *    Tab нь ард байгаа порталын товчнууд руу гарвал гар/уншигчийн
   *    хэрэглэгч «хаана байгаагаа» алдана — WCAG 2.4.3.
   */
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { requestClose(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const f = [...root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Нээгдэхэд фокусыг хайлтын талбарт — гараар шууд ажиллаж эхэлнэ
    const t = setTimeout(() => searchRef.current?.focus(), 60);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  useEffect(() => subscribe(() => setUsers(listUsers())), []);
  // Нэмэлт эрх ArcGIS-аас шинэчлэгдэхэд унтраалгууд дагаж шинэчлэгдэнэ
  useEffect(() => subscribeCaps(() => setUsers(listUsers())), []);
  /*
   * ⚠️ Урсгалын томилгоо нь ӨӨР хадгалалттай тул түүнд ч захиалах ёстой.
   *    Эс бөгөөс шат хадгалсны дараа дэлгэц хуучин хэвээр үлдэнэ.
   */
  const [, setAclN] = useState(0);
  useEffect(() => subscribeAcl(() => setAclN((n) => n + 1)), []);

  /** Устгагдсан аккаунтууд — рендер бүрд ДАХИН биш, нэг л удаа */
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
  const dirtyRemote = new Set(dirtyKeys());
  const retrySync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const left = await retryDirty();
      setUsers(listUsers());
      setSaved(left === 0 ? null : saved);
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
    const key = u.username.toLowerCase();
    const next = { ...d };
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

  const applyRole = (u: UserPerm, role: Role) => {
    const a = ROLE_ACCESS[role];
    putDraft(u, { ...draftOf(u), clear: false, views: a.views, docs: a.docs, role });
  };
  const flipView = (u: UserPerm, k: ViewKey) => {
    const d = draftOf(u);
    // Урсгалын шатанд томилогдсон хүний «Гүйцэтгэлийн хяналт»-ыг унтраах нь
    // түүнийг ажилгүй болгоно — санамсаргүй даралтаас асууж хамгаална.
    if (k === 'guitsetgel' && hasView(d.views, k) && stageOfUser(u.username)
      && !window.confirm(tr('Энэ хэрэглэгч урсгалын шатанд томилогдсон. «Гүйцэтгэлийн хяналт»-ыг унтраавал ажлаа хянаж чадахгүй болно. Унтраах уу?'))) return;
    const touched = k === 'guitsetgel' ? { touchedGuits: true } : null;
    putDraft(u, { ...d, ...touched, clear: false, views: toggled(d.views, k) });
  };
  const setAllViews = (u: UserPerm, on: boolean) => {
    const d = draftOf(u);
    putDraft(u, { ...d, clear: false, views: on ? [...ALL_KEYS] : [], docs: on });
  };
  const flipDocs = (u: UserPerm) => {
    const d = draftOf(u);
    putDraft(u, { ...d, clear: false, docs: !d.docs });
  };
  /**
   * НЭМЭЛТ ЭРХ — ШУУД үйлчилнэ, «Хадгалах» хүлээхгүй.
   *
   * ⚠️ Яагаад бусад унтраалгын адил ноорогт биш вэ: 2026-08-28-нд эрхийг
   * асаасан ч ажиллаагүй гэсэн гомдол гарсан — унтраалга зөвхөн ноорогт
   * бичигдээд «Хадгалах» дарагдаагүй байв. Тусад нь олгодог эрх нь тусад нь
   * хадгалагдах нь ойлгомжтой; үр дүн нь тэр дороо харагдана.
   *
   * ⚠️ ArcGIS бичилт унавал ИЛ анхааруулна — эрх зөвхөн энэ browser-т үлдэж,
   * дараагийн синхрончлолоор чимээгүй арилах тул.
   */
  const flipCap = (u: UserPerm, c: CapKey) => {
    const on = capsOf(u.username).includes(c);
    void toggleCap(u.username, c, !on).then((r) => {
      setCapErr((prev) => {
        const m = new Map(prev);
        if (r) m.delete(u.username.toLowerCase());
        else m.set(u.username.toLowerCase(), true);
        return m;
      });
    });
  };
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
  const bulkRole = (role: Role) => { selRows.forEach((u) => applyRole(u, role)); setSel(new Set()); };
  const bulkRemove = () => {
    selRows
      .filter((u) => u.username.toLowerCase() !== myName && roleForUser(u.username) !== 'super')
      .forEach((u) => { if (!draftOf(u).remove) flipRemove(u); });
    setSel(new Set());
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
    const removing = [...drafts.values()].filter((d) => d.remove).length;
    if (removing > 0
      && !window.confirm(tr('{0} аккаунт хадгалахад УСТГАГДАНА. Үргэлжлүүлэх үү?', String(removing)))) return;
    setSaving(true);
    setSaved(null);
    /*
     * ⚠️ SNAPSHOT: энэ closure-ийн `drafts` нь товч дарах агшны Map. Хадгалалт
     * олон remote бичилттэй тул хэдэн секунд үргэлжилж болно — тэр хооронд
     * админы хийсэн ШИНЭ ноорог төгсгөлийн цэвэрлэгээнд арчигдах ёсгүй.
     */
    const snapshot = drafts;
    let ok = 0;
    let fail = 0;
    const failed: string[] = [];

    for (const [key, d] of snapshot) {
      const u = users.find((x) => x.username.toLowerCase() === key);
      const uname = u?.username ?? key;
      try {
        // УСТГАХ — урсгалын томилгоог нь цэвэрлээд tombstone/арилгалт хийнэ.
        // ⚠️ revoke:false — аккаунт бүхэлдээ устгагдах тул эрх буцаалтын
        //    бичилт tombstone-той уралдах ёсгүй.
        if (d.remove) {
          const cur = stageOfUser(uname);
          if (cur) removeAssign(uname, cur, false);
          const r = await removeUser(uname);
          if (r) ok += 1; else { fail += 1; failed.push(uname); }
          continue;
        }
        if (d.clear) {
          const r = await clearOverride(uname);
          if (r) ok += 1; else { fail += 1; failed.push(uname); }
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
         */
        let views = d.views;
        if (views !== 'all' && !d.touchedGuits && !views.includes('guitsetgel')
          && stageOfUser(uname) && u && hasView(u.views, 'guitsetgel')) {
          views = [...views, 'guitsetgel'];
        }
        const r = await setUser(uname, { views, docs: d.docs }, d.role);
        /* ⚠️ НЭМЭЛТ ЭРХ энд БИЧИГДЭХГҮЙ — `flipCap` дарах агшинд шууд
           хадгалагддаг (`__cap__:` тусдаа мөр). */
        if (r) ok += 1; else { fail += 1; failed.push(uname); }
      } catch {
        fail += 1;
        failed.push(uname);
      }
    }

    setUsers(listUsers());
    /*
     * ⚠️ ЗӨВХӨН хадгалагдсан ноорогуудыг хасна: хадгалалтын ДУНД үүссэн шинэ
     * ноорог (`putDraft` үргэлж шинэ объект үүсгэдэг тул reference зөрнө)
     * хэвээр үлдэнэ. Урьд нь `new Map()` бүгдийг болзолгүй арчиж, дундуур
     * хийсэн засвар анхааруулгагүй алга болдог байв.
     */
    setDrafts((prev) => {
      const m = new Map(prev);
      for (const [k, d] of snapshot) if (m.get(k) === d) m.delete(k);
      return m;
    });
    setSaving(false);
    setSaved({ ok, fail, failed });
  };
  saveRef.current = () => { void saveAll(); };

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
    const key = n.toLowerCase();
    if (users.some((u) => u.username.toLowerCase() === key) || drafts.has(key)) {
      setAddErr(tr('«{0}» аль хэдийн жагсаалтад байна.', n));
      return;
    }
    if (removed.includes(key)) {
      setAddErr(tr('«{0}» устгагдсан — доорх «Буцаах» товчоор сэргээнэ үү.', n));
      return;
    }
    const a = ROLE_ACCESS.tolovlolt;
    setDrafts((prev) => new Map(prev).set(key, {
      views: a.views, docs: a.docs, role: 'tolovlolt', isNew: true,
    }));
    setOpenRows((prev) => new Set(prev).add(key));
    setName('');
    setAddErr('');
    setSaved(null);
  };

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
            <small>{tr('Сэлбэ 20 минутын хот · тохиргоо')}</small>
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
          className={`${s.sideItem} ${pane === 'users' ? s.sideItemOn : ''}`}
          aria-current={pane === 'users'}
          onClick={() => setPane('users')}
        >
          <Icon name="users" size={14} />
          {tr('Хэрэглэгчдийн эрх удирдах')}
        </button>
        {/*
          * ⚠️ ТУСДАА БҮЛЭГ, нэг жагсаалтад ХОЛИОГҮЙ. Дээрх нь «ямар
          *    харагдац үзэх вэ», энэ нь «аль багцыг бөглөх/хянах вэ».
          */}
        <button
          type="button"
          className={`${s.sideItem} ${pane === 'guits' ? s.sideItemOn : ''}`}
          aria-current={pane === 'guits'}
          onClick={() => setPane('guits')}
        >
          <Icon name="pen" size={14} />
          {tr('Гүйцэтгэлийн урсгалын эрх')}
        </button>
      </aside>

      <div className={s.main}>
        {pane === 'guits' ? (
          <>
            <header className={s.head}>
              <h2 className={s.title}>{tr('Гүйцэтгэлийн урсгалын эрх')}</h2>
              <p className={s.subtitle}>
                {tr('Дөрвөн шат бүрд аккаунт томилж, аль багцыг хариуцахыг зааж өгнө.')}
              </p>
            </header>
            <GuitsetgelAcl />
          </>
        ) : (
          <>
        <header className={s.head}>
          <h2 className={s.title}>{tr('Хэрэглэгчдийн эрх удирдах')}</h2>
          <p className={s.subtitle}>
            {tr('Сэдэв бүрийг унтраалгаар нээж/хааж, доод талын «Хадгалах» товчоор нэг дор хадгална.')}
          </p>
          {!remoteOk && (
            <div className={s.addErr} role="alert">
              {tr('⚠️ ArcGIS хүснэгтээс уншиж чадсангүй — доорх жагсаалт энэ browser-ийн cache. Өөрчлөлт түр локалдоо хадгалагдаж, холболт сэргэхэд автоматаар илгээгдэнэ.')}
            </div>
          )}
        </header>

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
            {ROLE_PRESETS.map((r) => (
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
          {rows.map((u) => {
            const key = u.username.toLowerCase();
            const d = draftOf(u);
            const dirty = drafts.has(key);
            /* ⚠️ ЗӨВХӨН ХАРУУЛАХ тэмдэг. Шат томилох нь «Гүйцэтгэлийн урсгалын
                эрх» гэсэн ТУСДАА хуудсанд — тэнд аль багц хариуцахыг нь бас
                зааж өгдөг. Урьд нь энэ мөрөнд товчлол байсныг 2026-08-27-нд
                ХАСАВ: тэр товчлол багц сонгох чадваргүй тул үргэлж «бүх багц»
                гэж бичиж, тусдаа хуудсан дээр тавьсан хязгаарлалтыг ЧИМЭЭГҮЙ
                арилгадаг байлаа. */
            const st = stageOfUser(u.username);
            const expanded = openRows.has(key);
            const on = countOn(d.views);
            return (
            <div key={key} className={`${s.user} ${dirty ? s.userDirty : ''} ${d.remove ? s.userRemoving : ''}`}>
              <div className={s.userHead}>
                <input
                  type="checkbox"
                  className={s.pick}
                  checked={sel.has(key)}
                  onChange={(e) => setSel((prev) => {
                    const n = new Set(prev);
                    if (e.target.checked) n.add(key); else n.delete(key);
                    return n;
                  })}
                  aria-label={tr('{0} сонгох', u.username)}
                />
                <button
                  type="button"
                  className={s.expand}
                  aria-expanded={expanded}
                  onClick={() => setOpenRows((prev) => {
                    const n = new Set(prev);
                    if (n.has(key)) n.delete(key); else n.add(key);
                    return n;
                  })}
                >
                  <span className={`${s.caret} ${expanded ? s.caretOn : ''}`} aria-hidden>▸</span>
                  <span className={s.uname}>{u.username}</span>
                </button>
                <span className={s.badges}>
                  {d.isNew && <span className={s.newBadge}>{tr('шинэ')}</span>}
                  {d.remove && <span className={s.removeBadge}>{tr('хадгалахад устгагдана')}</span>}
                  {!d.remove && (
                    <span className={s.countBadge} title={tr('Нээлттэй харагдацын тоо')}>
                      {`${on}/${ALL_KEYS.length}`}
                    </span>
                  )}
                  {st && (
                    <button
                      type="button"
                      className={s.stageBadge}
                      onClick={() => setPane('guits')}
                      title={tr('Урсгалын томилгоог «Гүйцэтгэлийн урсгалын эрх» хуудсанд засна — дарж очно')}
                    >
                      {STAGE_LABEL[st]}
                    </button>
                  )}
                  {dirty && !d.remove && (
                    <span className={s.dirtyDot} title={tr('Хадгалаагүй өөрчлөлттэй')} />
                  )}
                  {dirtyRemote.has(key) && (
                    <span
                      className={s.unsynced}
                      title={tr('ArcGIS хүснэгтэд бичиж чадсангүй — өөрчлөлт бусад төхөөрөмжид үйлчлэхгүй. «Дахин синк» товчоор дахин илгээнэ.')}
                    >
                      {tr('ArcGIS-т хадгалагдсангүй — зөвхөн энэ browser-т')}
                    </span>
                  )}
                </span>
                <div className={s.presets}>
                  {ROLE_PRESETS.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      className={`${s.preset} ${d.role === r.key ? s.presetOn : ''}`}
                      onClick={() => applyRole(u, r.key)}
                      title={r.key === 'super'
                        ? tr('Бүх харагдац нээгдэнэ. ⚠️ Админ портал нээх эрх зөвхөн кодын хатуу тохиргооны супер админд бий.')
                        : tr('{0} эрхийн багц', r.label)}
                    >
                      {r.label}
                    </button>
                  ))}
                  {(u.overridden || dirty) && !d.remove && !d.isNew && (
                    <button
                      type="button"
                      className={s.reset}
                      onClick={() => markClear(u)}
                      title={tr('Хатуу тохиргоо руу сэргээх (хадгалахад үйлчилнэ)')}
                    >
                      {tr('Сэргээх')}
                    </button>
                  )}
                  {/* ⚠️ Хатуу тохиргооны super устгагдахгүй — хуваалцсан хүснэгтээр
                      бүх админыг түгжих замыг хаана; хасах цор ганц зам = код. */}
                  {key !== myName && roleForUser(u.username) !== 'super' && (
                    <button
                      type="button"
                      className={`${s.delBtn} ${d.remove ? s.delBtnOn : ''}`}
                      onClick={() => flipRemove(u)}
                      title={d.remove
                        ? tr('Устгалтыг болиулна')
                        : tr('Аккаунтыг устгана (хадгалахад үйлчилнэ)')}
                    >
                      {d.remove ? tr('Болиулах') : tr('Устгах')}
                    </button>
                  )}
                </div>
              </div>

              {expanded && !d.remove && (
                <>
                  {/*
                    * СЭДВҮҮД — жагсаалт хэлбэрээр, мөр бүрийн АРД унтраалга.
                    * ⚠️ 2026-08-25 (хэрэглэгчийн хүсэлт): chip-үүдийн үүл байсныг
                    * жагсаалт + switch болгов — аль сэдэв нээлттэйг нэг харцаар
                    * ялгахад унтраалгын байрлал тогтмол байх нь чухал.
                    */}
                  <div className={s.topicHead}>
                    <span className={s.topicHeadLabel}>{tr('Харагдац')}</span>
                    <button type="button" className={s.linkBtn} onClick={() => setAllViews(u, true)}>
                      {tr('Бүгдийг асаах')}
                    </button>
                    <button type="button" className={s.linkBtn} onClick={() => setAllViews(u, false)}>
                      {tr('Бүгдийг унтраах')}
                    </button>
                  </div>
                  <div className={s.topicList}>
                    {VIEWS.map((v) => {
                      const vOn = hasView(d.views, v.key);
                      return (
                        <div key={v.key} className={s.topicRow}>
                          <span className={s.topicName}>
                            <span className={s.topicIcon}><Icon name={v.icon} size={14} /></span>
                            {v.title}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={vOn}
                            aria-label={v.title}
                            className={`${s.sw} ${vOn ? s.swOn : ''}`}
                            onClick={() => flipView(u, v.key)}
                          >
                            <span className={s.swKnob} />
                          </button>
                        </div>
                      );
                    })}
                    <div className={s.topicRow}>
                      <span className={s.topicName}>
                        <span className={s.topicIcon}><Icon name="file" size={14} /></span>
                        {tr('ТЭЗҮ-БОНУ')}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={d.docs}
                        aria-label={tr('ТЭЗҮ-БОНУ')}
                        className={`${s.sw} ${d.docs ? s.swOn : ''}`}
                        onClick={() => flipDocs(u)}
                      >
                        <span className={s.swKnob} />
                      </button>
                    </div>
                    {/* ── НЭМЭЛТ ЭРХҮҮД — харагдацаас ТУСДАА олгоно ──
                        ⚠️ Үүрэг сонгоход өөрчлөгддөггүй: эрсдэлтэй үйлдлийг
                        урьдчилсан тохиргоогоор чимээгүй тараах ёсгүй. */}
                    {capErr.get(u.username.toLowerCase()) && (
                      <div className={s.capErr} role="alert">
                        {tr('⚠️ ArcGIS-т бичигдсэнгүй — эрх түр зөвхөн энэ browser-т. Холболтоо шалгаад дахин дарна уу.')}
                      </div>
                    )}
                    {CAPS.map((c) => (
                      <div key={c.key} className={s.topicRow}>
                        <span className={s.topicName} title={capHint(c.key)}>
                          <span className={s.topicIcon}><Icon name={c.icon} size={14} /></span>
                          {capLabel(c.key)}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={capsOf(u.username).includes(c.key)}
                          aria-label={capLabel(c.key)}
                          className={`${s.sw} ${capsOf(u.username).includes(c.key) ? s.swOn : ''}`}
                          onClick={() => flipCap(u, c.key)}
                        >
                          <span className={s.swKnob} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            );
          })}
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
                  onClick={() => { void clearOverride(k).then(() => setUsers(listUsers())); }}
                  title={tr('Аккаунтыг сэргээж хатуу тохиргооны эрхийг нь буцаана')}
                >
                  {tr('Буцаах')}
                </button>
              </div>
            ))}
          </div>
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
              onClick={() => { setDrafts(new Map()); setSaved(null); }}
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
