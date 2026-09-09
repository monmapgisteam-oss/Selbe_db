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
import { permsTablePublic } from '@/lib/permsRemote';
import { useAuth } from './AuthGate';
import { Icon } from './Icon';
import { UserRow } from './UserRow';
import { capsOf, capViewsOf, dirtyCapKeys, retryCapsDirty, setCaps, subscribeCaps, toggleCap, type CapKey } from '@/lib/caps';
import { ErhOverview } from '@/modules/ErhOverview';
import { GuitsetgelAcl } from '@/modules/GuitsetgelAcl';
import { QaqcAcl } from '@/modules/QaqcAcl';
import { HuvaariAcl } from '@/modules/HuvaariAcl';
import { ObyemAcl } from '@/modules/ObyemAcl';
import {
  ALL_BAGTS as HUVAARI_ALL_BAGTS, listHuvaariAssigns, purgeHuvaariAssign, removeHuvaariAssign,
  setHuvaariGrants, subscribeHuvaariAcl, type PlanRole,
} from '@/lib/huvaariAcl';
import {
  ALL_BAGTS as OBYEM_ALL_BAGTS, listObyemAssigns, purgeObyemAssign, removeObyemAssign,
  setObyemGrants, subscribeObyemAcl, type ObyemRole,
} from '@/lib/obyemAcl';
import {
  ALL_BAGTS as QAQC_ALL_BAGTS, listQaqcAssigns, purgeQaqcAssign, removeQaqcAssign, setQaqcAssign,
  subscribeQaqcAcl,
} from '@/lib/qaqcAcl';
import {
  purgeAssign, regrantFlowAccess, stageOfUser, subscribeAcl,
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
  if (k === 'plan') return tr('Хуваарь төлөвлөх');
  if (k === 'planApprove') return tr('Хуваарь батлах');
  if (k === 'obyemEdit') return tr('Инженерийн обьём засах');
  if (k === 'obyemApprove') return tr('Инженерийн обьём батлах');
  if (k === 'gazar') return tr('Газрын төлөв засах');
  if (k === 'butets') return tr('Дэд бүтцийн атрибут засах');
  return k;
};
const capHint = (k: CapKey): string => {
  if (k === 'addRow') {
    return tr('«Гүйцэтгэл бөглөх» хуудсанд бүлэг дотор шинэ ажлын мөр нэмэх. Хуудасны бүтэц өөрчлөгдөж, жин ба мөнгөн дүн бүхэлдээ дахин бодогдоно.');
  }
  if (k === 'qaqc') {
    return tr('«Чанар (QAQC)» харагдац дээр Inspection Test Plan-ийг (М-акт, FIC, MA, MIR) бөглөх. Энд асаахад БҮХ багц хуваарилагдана — тодорхой багц зааж өгөх бол «Чанарын (QAQC) эрх» хуудсыг ашиглана уу. Гүйцэтгэлийн урсгалаас тусдаа: гүйцэтгэл зөвшөөрөх эрх дагалдахгүй.');
  }
  if (k === 'zovshoorol') {
    return tr('«Зөвшөөрөл» хуудсанд зөвшөөрөл нэмэх, засах, устгах. Эрхгүй хүн зөвхөн харна.');
  }
  if (k === 'finEdit') {
    return tr('«Санхүүжилт» харагдацын Cashflow (/173) ба IPC (/172) хүснэгтийн нүдний утга засах. Эдгээр нь дашбоардын санхүүгийн БҮХ тооны эх сурвалж тул нэг нүд засахад 02, 08 дашбоард, тайлан бүгд дагаж өөрчлөгдөнө.');
  }
  if (k === 'gazar') {
    return tr('«Газар чөлөөлөлт» дээр нэгж талбарын төлөв, явцын мэдээ, эзэмшигч, тайлбарыг засах. Нэг талбарын төлөв солиход чөлөөлөлтийн хувь, давхцлын тооцоо, дашбоард, тайлан бүгд дагаж өөрчлөгдөнө.');
  }
  if (k === 'butets') {
    return tr('«Дэд бүтэц» харагдац дээр инженерийн шугамын атрибутыг (урт, бүс, баримтын нэр, багц) засах. Уртын талбар нь каталогийн багана, «Дэд бүтэц»-ийн км, «Эрсдэлийн загвар»-ын хохирлын үнэлгээ гурвын эх сурвалж тул нэг тоо засахад тэр бүгд дагаж өөрчлөгдөнө.');
  }
  if (k === 'finRow') {
    return tr('Тэр хоёр хүснэгтэд шинэ мөр нэмэх, байгаа мөрийг устгах. ⚠️ Устгасан мөрийг порталаас буцаах арга БАЙХГҮЙ.');
  }
  if (k === 'plan') {
    return tr('«Хуваарь» харагдацад ажлын эхлэх/дуусах огноог ЗОХИОХ. Хадгалахад шууд бичигдэхээ болиод батлагчид илгээгдэнэ — батлагдтал эх хуваарь хөдлөхгүй. Энд асаахад БҮХ багц хуваарилагдана; тодорхой багц зааж өгөх бол «Хуваарийн эрх» хуудсыг ашиглана уу.');
  }
  if (k === 'planApprove') {
    return tr('Гүйцэтгэгчийн илгээсэн хуваарийг БАТЛАХ эсвэл буцаах. Батлагдсан үед л огноо эх хуудсанд бичигдэж, тайлан ба хоцрогдлын тооцоонд орно. Энд асаахад БҮХ багц хуваарилагдана; тодорхой багц зааж өгөх бол «Хуваарийн эрх» хуудсыг ашиглана уу. ⚠️ Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — хоёр эрхийг нэг хүнд олгосон ч.');
  }
  if (k === 'obyemEdit') {
    return tr('«Гүйцэтгэл бөглөх» хуудасны «Инженерийн төлөвлөсөн обьём» баганын нүднүүдийг ЗАСАХ. Засвар нь шууд бичигдэхгүй — батлагчид илгээгдэж, батлагдтал үндсэн өгөгдөл хөдлөхгүй. Энд асаахад БҮХ багц хуваарилагдана; тодорхой багц зааж өгөх бол «Инженерийн обьёмын эрх» хуудсыг ашиглана уу.');
  }
  if (k === 'obyemApprove') {
    return tr('Инженерийн илгээсэн төлөвлөсөн обьёмыг БАТЛАХ эсвэл буцаах. Батлагдсан үед л утга үндсэн өгөгдөлд бичигдэнэ. Энд асаахад БҮХ багц хуваарилагдана; тодорхой багц зааж өгөх бол «Инженерийн обьёмын эрх» хуудсыг ашиглана уу. ⚠️ Өөрийн илгээсэн засварыг өөрөө батлах боломжгүй — хоёр эрхийг нэг хүнд олгосон ч.');
  }
  return '';
};

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
/** ⚠️ `UserRow.tsx` импортлодог тул ЭКСПОРТ (2026-09-10) */
export type Draft = {
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
   */
  const [pane, setPane] = useState<'ovw' | 'users' | 'guits' | 'qaqc' | 'huvaari' | 'obyem'>('ovw');
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
    // trusted=true — панел зөвхөн кодын хатуу super-т нээгддэг (Root.isSuper):
    // өөрийнх нь dirty-set дахин илгээгдэж, давхарлагдана
    void initRemote(false, true).then((ok) => { setRemoteOk(ok); setUsers(listUsers()); });
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
    /*
     * ⚠️ САЛАНГИД ТӨЛӨВҮҮДИЙГ ч ЦЭВЭРЛЭНЭ (2026-09-08). Панел нь `open=false`
     * үед `return null` хийдэг ч UNMOUNT БОЛОХГҮЙ (эцэг нь prop-оор удирдана)
     * тул эдгээр нь дараагийн нээлт хүртэл үлддэг байв:
     *   · `capErr` — аль хэдийн засагдсан алдааны улаан тэмдэг дахин гарна;
     *   · `sel` — сонголт үлдэж, нээмэгц «N сонгосон» бөөнөөр устгах зурвас
     *     санамсаргүй идэвхтэй харагдана (АЮУЛТАЙ);
     *   · `saved`/`addErr`/`q` — хуучин мэдэгдэл, хайлт төөрөгдүүлнэ.
     * Ноорог нь дээр цэвэрлэгдсэн тул эрхийн алдагдал үүсэхгүй.
     */
    setSel(new Set());
    setCapErr(new Map());
    setSaved(null);
    setAddErr('');
    setQ('');
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
  /* ⚠️ Чанарын хуваарилалт ч бас ӨӨР хадгалалттай — QAQC унтраалга нь түүнийг
     дагуулдаг тул захиалахгүй бол дарсан унтраалга буцаж унтарсан харагдана. */
  useEffect(() => subscribeQaqcAcl(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribeHuvaariAcl(() => setAclN((n) => n + 1)), []);
  useEffect(() => subscribeObyemAcl(() => setAclN((n) => n + 1)), []);

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
  /* ⚠️ ХОЁР dirty-set-ийг нэгтгэнэ (2026-09-08): эрхийн (`caps`) бичилт унасныг
     урьд нь энд ХАРУУЛДАГГҮЙ байв — `capErr` нь зөвхөн тэр сешнд, refresh-ээр
     арилна, харин dirty-set localStorage-д үлдэж retry хийгддэг. Тэмдэг нь
     retry-тэй ИЖИЛ эх сурвалжаас гарах ёстой, эс бөгөөс худал «амжилттай». */
  const dirtyRemote = new Set([...dirtyKeys(), ...dirtyCapKeys()]);
  const retrySync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      /* Эрхийн (caps) dirty-г ч хамт дахин илгээнэ — нэг товч, хоёр dirty-set */
      const [leftPerms, leftCaps] = await Promise.all([retryDirty(), retryCapsDirty()]);
      const left = leftPerms + leftCaps;
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
    const a = ROLE_ACCESS[role];
    const d = draftOf(u);
    const drop = dropsGuits(u, d.views, a.views);
    if (drop && !confirmed && !confirmDropGuits()) return;
    putDraft(u, {
      ...d, clear: false, views: a.views, docs: a.docs, role, touchedRole: true,
      ...(drop ? { touchedGuits: true } : null),
    });
  };
  const flipView = (u: UserPerm, k: ViewKey) => {
    const d = draftOf(u);
    const next = toggled(d.views, k);
    if (dropsGuits(u, d.views, next) && !confirmDropGuits()) return;
    const touched = k === 'guitsetgel' ? { touchedGuits: true } : null;
    putDraft(u, { ...d, ...touched, clear: false, views: next });
  };
  const setAllViews = (u: UserPerm, on: boolean) => {
    const d = draftOf(u);
    const next: ViewKey[] = on ? [...ALL_KEYS] : [];
    const drop = dropsGuits(u, d.views, next);
    if (drop && !confirmDropGuits()) return;
    putDraft(u, { ...d, clear: false, views: next, docs: on, ...(drop ? { touchedGuits: true } : null) });
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
  /**
   * БАГЦААР ХУВААРИЛАГДДАГ ЭРХИЙН УНТРААЛГА — Чанар · Хуваарь · Обьём ГУРВЫГ
   * НЭГ ЗАМААР (2026-09-09).
   *
   * ⚠️ ЯАГААД НЭГТГЭВ: гурван салаа нь нэрээс бусад ижил байсан бөгөөд
   *    тэдгээрийн ялгаанаас ГУРВАН удаа дараалан алдаа гарсан —
   *    super-ийн шалгалт (09-07), `r.ok` (09-08), `.trim()` (09-09).
   *    Тэр бүрд засвар нь НЭГ салаанд хүрч, бусад руу хуулагдаагүй.
   *
   * @param cap  унтраалгын эрх
   * @param on   ОДООГИЙН төлөв (`true` = асаалттай, дарахад унтарна)
   * @param kind аль дэд систем
   */
  const flipScoped = (
    u: UserPerm, cap: CapKey, on: boolean, kind: 'qaqc' | 'huvaari' | 'obyem',
  ) => {
    /*
     * ⚠️ SUPER-Т ХУВААРИЛАЛТ ҮЙЛЧЛЭХГҮЙ (2026-09-07 · 08). `set*` нь super-д
     *    `{ok:false}` буцаадаг (тэдэнд `*Scope` угаас `null` = бүх багц) тул
     *    `r.sync` нь `undefined`. Түүнийг барихгүй бол `Promise.resolve(false)`
     *    руу унаж, унтраалга ХЭЗЭЭ Ч асахгүй атлаа «ArcGIS-т бичигдсэнгүй»
     *    гэсэн ХУДАЛ алдаа гарч, 7 super админ тэр хуудсыг зөвхөн уншдаг
     *    болж байлаа. Тэдэнд эрхийг ХУУЧИН замаар шууд олгоно.
     */
    const mark = (ok: boolean) => setCapErr((prev) => {
      const m = new Map(prev);
      if (ok) m.delete(u.username.toLowerCase());
      else m.set(u.username.toLowerCase(), true);
      return m;
    });

    if (roleForUser(u.username) === 'super') {
      void toggleCap(u.username, cap, !on).then(mark);
      return;
    }

    /* ⚠️ `.trim()` ЗААВАЛ — бичих тал (`set*`) `trim().toLowerCase()`
       хийдэг тул уншихдаа тааруулахгүй бол хуваарилалт «олдохгүй» болж,
       хүрээ нь бүх багц руу чимээгүй тэлнэ. */
    const key = u.username.trim().toLowerCase();

    let r: { ok: boolean; error?: string; sync?: Promise<boolean>; granted?: Promise<boolean> };

    if (kind === 'qaqc') {
      /*
       * ⚠️ АСААХАД ХҮРЭЭГ ТЭЛЭХГҮЙ (2026-09-07). Урьд нь болзолгүй
       *    `[ALL_BAGTS]` бичдэг байсан тул «Багц 2» гэж хуваарилагдсан хүний
       *    унтраалгыг унтрааж-асаахад хүрээ нь ЧИМЭЭГҮЙ бүх багц болж тэлдэг
       *    байв — хязгаарлах зорилготой товч эрхийг өргөжүүлэх нь fail-closed
       *    зарчигтай зөрчилдөнө (панел яг үүнийг хориглодог).
       */
      const cur = listQaqcAssigns().find((a) => a.user === key);
      r = on
        ? removeQaqcAssign(u.username)
        : setQaqcAssign(u.username, cur?.bagts.length ? cur.bagts : [QAQC_ALL_BAGTS]);
    } else {
      /*
       * ⚠️ ХУВААРЬ ба ОБЬЁМ — ИЖИЛ ЛОГИК, ЗӨВХӨН НЭР ӨӨР (2026-09-09). Урьд нь
       *    хоёр салаа тусад нь бичигдсэн байсан тул нэгэнд нь хийсэн засвар
       *    нөгөө рүү хуулагдахгүй байх эрсдэлтэй байв.
       *
       * ⚠️ ХӨНДЛӨН ҮРЖВЭРИЙН ХАМГААЛАЛТ ХЭРЭГГҮЙ. Хадгалалт нь одоо
       *    `grants[]` — үүрэг бүр ӨӨРИЙН багцтай тул шинэ үүрэг нэмэхэд тэр нь
       *    бусад багц руу ТАРАХГҮЙ. Урьд нь тарах учир панел «болохгүй» гэж
       *    татгалздаг байсан, одоо админ хүссэнээ шууд хийнэ.
       */
      const isHuvaari = kind === 'huvaari';
      const role = isHuvaari
        ? (cap === 'plan' ? 'author' : 'approver')
        : (cap === 'obyemEdit' ? 'editor' : 'approver');
      const ALL = isHuvaari ? HUVAARI_ALL_BAGTS : OBYEM_ALL_BAGTS;
      const cur = (isHuvaari ? listHuvaariAssigns() : listObyemAssigns())
        .find((a) => a.user === key);
      const grants = (cur?.grants ?? []).map((g) => ({ ...g }));

      let next: { role: string; bagts: string[] }[];
      if (on) {
        /* Унтраах — ЗӨВХӨН тэр үүргийн grant-ыг хасна, бусад нь хэвээр */
        next = grants.filter((g) => g.role !== role);
      } else {
        /*
         * Асаах — тэр үүрэг байхгүй бол нэмнэ. Хүрээг нь одоо байгаа НӨГӨӨ
         * үүргийнхээс өвлүүлнэ: тэр хүн аль хэдийн тодорхой багцуудад
         * ажилладаг бол шинэ үүргийг нь ч ТЭР багцуудад өгөх нь зөв
         * (болзолгүй `[ALL]` бичвэл хүрээ чимээгүй тэлнэ).
         */
        const inherit = [...new Set(grants.flatMap((g) => g.bagts))];
        next = grants.some((g) => g.role === role)
          ? grants
          : [...grants, { role, bagts: inherit.length ? inherit : [ALL] }];
      }

      if (!next.length) {
        r = isHuvaari ? removeHuvaariAssign(u.username) : removeObyemAssign(u.username);
      } else if (isHuvaari) {
        r = setHuvaariGrants(u.username, next as { role: PlanRole; bagts: string[] }[]);
      } else {
        r = setObyemGrants(u.username, next as { role: ObyemRole; bagts: string[] }[]);
      }
    }

    /*
     * ⚠️ `r.ok`-ЫГ ЗААВАЛ ШАЛГАНА. `set*` нь дөрвөн нөхцөлд `{ok:false}`
     *    буцаадаг (хоосон нэр · super · үүрэггүй · багцгүй) ба тэр үед ЛОКАЛД Ч
     *    БИЧИГДЭХГҮЙ, `sync`/`granted` нь `undefined`. Шалгахгүй бол
     *    `Promise.all` нь `false` өгч «ArcGIS-т бичигдсэнгүй» гэсэн
     *    ТӨӨРӨГДҮҮЛСЭН алдаа гарна: админ «дахин синк» дарна, гэтэл асуудал
     *    сүлжээнийх биш, няцаалтынх.
     */
    if (!r.ok) { mark(false); return; }

    /*
     * ⚠️ `sync` (хуваарилалтын мөр) ба `granted` (`__cap__:` эрхийн мөр)
     *    ХОЁУЛАНГ нь хүлээнэ. Урьд нь зөвхөн `sync`-ийг хардаг байсан тул
     *    эрхийн бичилт унасан ч унтраалга «асаалттай» харагдаж, дараагийн
     *    `initRemote` дээр чимээгүй унтардаг байв.
     */
    void Promise.all([
      r.sync ?? Promise.resolve(false),
      r.granted ?? Promise.resolve(true),
    ]).then(([a, b]) => mark(a && b));
  };

  const flipCap = (u: UserPerm, c: CapKey) => {
    // ⚠️ Хадгалаагүй ШИНЭ аккаунтад бичихгүй — ноорог цуцлагдвал remote дээр
    //    өнчин `__cap__:` мөр үлдэж, тэр нэрийг дараа нэмэхэд эрх нь өөрөө асна.
    if (draftOf(u).isNew) return;
    const on = capsOf(u.username).includes(c);
    /* Багцаар хуваарилагддаг ГУРВАН эрх — нэг зам */
    if (c === 'qaqc') { flipScoped(u, c, on, 'qaqc'); return; }
    if (c === 'plan' || c === 'planApprove') { flipScoped(u, c, on, 'huvaari'); return; }
    if (c === 'obyemEdit' || c === 'obyemApprove') { flipScoped(u, c, on, 'obyem'); return; }
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
  const bulkRole = (role: Role) => {
    // Томилогдсон хүмүүсийн «Гүйцэтгэлийн хяналт» хасагдах бол НЭГ удаа асууна
    const hit = selRows.filter((u) => dropsGuits(u, draftOf(u).views, ROLE_ACCESS[role].views));
    if (hit.length && !window.confirm(tr('{0} — урсгалын шатанд томилогдсон. «Гүйцэтгэлийн хяналт» нь хасагдвал ажлаа хянаж чадахгүй болно. Үргэлжлүүлэх үү?', hit.map((u) => u.username).join(', ')))) return;
    selRows.forEach((u) => applyRole(u, role, true));
    setSel(new Set());
  };
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
          const capOk = await setCaps(uname, []);
          const r = await removeUser(uname);
          if (r && flowOk && qaqcOk && hvOk && obOk && capOk) ok += 1; else { fail += 1; failed.push(uname); }
          continue;
        }
        if (d.clear) {
          let bad = false;
          if (!roleForUser(uname)) {
            // Суурьгүй (панелаас нэмсэн) аккаунт: сэргээх = устгах → бүгдийг цэвэрлэнэ
            if (!(await purgeAssign(uname))) bad = true;
            if (!(await purgeQaqcAssign(uname))) bad = true;
            if (!(await purgeHuvaariAssign(uname))) bad = true;
            if (!(await purgeObyemAssign(uname))) bad = true;
            if (!(await setCaps(uname, []))) bad = true;
          }
          const r = await clearOverride(uname);
          /*
           * ⚠️ Хатуу тохиргоотой, урсгалд томилогдсон хүн: суурь эрхэд нь
           * `guitsetgel` байхгүй бол (tolovlolt) хуудасгүй үлдэнэ — томилгоо
           * хэвээр тул урсгалын эрхийг нь дахин дагуулна.
           */
          if (r && stageOfUser(uname) && !(await regrantFlowAccess(uname))) bad = true;
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
         */
        let views = d.views;
        if (views !== 'all' && !d.touchedGuits && !views.includes('guitsetgel')
          && stageOfUser(uname) && u && hasView(u.views, 'guitsetgel')) {
          views = [...views, 'guitsetgel'];
        }
        // ⚠️ Хөндөөгүй үүргийг ХАДГАЛАГДСАН утгаас — ноорог үүссэний дараа
        //    урсгалын хуудаснаас олгогдсон үүргийг snapshot дарж бичихгүй.
        const role = d.touchedRole || !u ? d.role : u.role;
        const r = await setUser(uname, { views, docs: d.docs }, role);
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
    const orphan: [boolean, string][] = [
      [listQaqcAssigns().some((a) => a.user === key), tr('Чанарын (QAQC) эрх')],
      [listHuvaariAssigns().some((a) => a.user === key), tr('Хуваарийн эрх')],
      [listObyemAssigns().some((a) => a.user === key), tr('Инженерийн обьёмын эрх')],
    ];
    /*
     * ⚠️ НЭМЭЛТ ЭРХ (`__cap__:`) ч мөн ӨНЧИН ҮЛДЭНЭ (2026-09-08-ны хоёр дахь
     *    шалгалт). Дээрх дөрөв нь ЗӨВХӨН багцын хуваарилалтыг барьдаг ч эрх нь
     *    ТУСДАА мөрөнд байдаг: аккаунт устгахад `setCaps(u, [])` унавал тэр мөр
     *    ArcGIS дээр үлдэж, ижил нэрээр дахин нэмэхэд `finRow` (санхүүгийн мөр
     *    УСТГАХ — буцаах арга БАЙХГҮЙ), `zovshoorol`, `butets` зэрэг эрх
     *    чимээгүй наалддаг байв. Энэ нь бусад дөрвөөс ЭРСДЭЛТЭЙ: тэдгээр нь
     *    багцаар хязгаарлагддаг, энэ нь хязгааргүй.
     */
    const orphanCaps = capsOf(key);
    if (orphanCaps.length) {
      setAddErr(tr('«{0}» нэрээр хуучин нэмэлт эрх ({1}) үлдсэн байна — тэр аккаунтыг эхлээд «Буцаах»-аар сэргээж эрхийг нь арилгаад дахин нэмнэ үү.', n, String(orphanCaps.length)));
      return;
    }
    const stuck = orphan.find(([hit]) => hit);
    if (stuck) {
      setAddErr(tr('«{0}» нэрээр хуучин хуваарилалт үлдсэн байна — «{1}» хуудсанд ✕ дарж арилгаад дахин нэмнэ үү.', n, stuck[1]));
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
        {/*
          * ⚠️ ТОЙМ ЭХЭНД (2026-09-09). Гацаа (батлагчгүй багц, зохиогч=батлагч)
          *    нь ЗӨВХӨН ажил зогссоны дараа мэдэгддэг байсныг энд УРЬДЧИЛЖ хэлнэ.
          */}
        <button
          type="button"
          className={`${s.sideItem} ${pane === 'ovw' ? s.sideItemOn : ''}`}
          aria-current={pane === 'ovw'}
          onClick={() => setPane('ovw')}
        >
          <Icon name="target" size={14} />
          {tr('Тойм')}
        </button>
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
        {/* ⚠️ ЧАНАР нь урсгалын ШАТГҮЙ асуулт тул тусдаа бүлэг — урсгалын
            багананд байрлуулбал чанарын ажилтанд гүйцэтгэл зөвшөөрөх эрх
            дагалдана (`qaqcAcl.ts`). */}
        <button
          type="button"
          className={`${s.sideItem} ${pane === 'qaqc' ? s.sideItemOn : ''}`}
          aria-current={pane === 'qaqc'}
          onClick={() => setPane('qaqc')}
        >
          <Icon name="shield" size={14} />
          {tr('Чанарын (QAQC) эрх')}
        </button>
        {/* ⚠️ ХУВААРЬ нь ТӨЛӨВЛӨГӨӨНИЙ асуулт (зохиогч · батлагч) — гүйцэтгэлийн
            урсгал ба чанарын аль алинаас нь тусдаа (`huvaariAcl.ts`). */}
        <button
          type="button"
          className={`${s.sideItem} ${pane === 'huvaari' ? s.sideItemOn : ''}`}
          aria-current={pane === 'huvaari'}
          onClick={() => setPane('huvaari')}
        >
          <Icon name="calendar" size={14} />
          {tr('Хуваарийн эрх')}
        </button>
        <button
          type="button"
          className={`${s.sideItem} ${pane === 'obyem' ? s.sideItemOn : ''}`}
          aria-current={pane === 'obyem'}
          onClick={() => setPane('obyem')}
        >
          <Icon name="frame" size={14} />
          {tr('Инженерийн обьёмын эрх')}
        </button>
      </aside>

      <div className={s.main}>
        {pane === 'ovw' ? (
          <>
            <header className={s.head}>
              <h2 className={s.title}>{tr('Эрхийн тойм')}</h2>
              <p className={s.subtitle}>
                {tr('Багц бүрд хэн юу хариуцаж байгаа, хүн бүр юу хийж чадахыг нэг дэлгэцэнд. Ажил гацах эрсдэлийг урьдчилж хэлнэ.')}
              </p>
            </header>
            <ErhOverview onGo={(x) => setPane(x as typeof pane)} />
          </>
        ) : pane === 'obyem' ? (
          <>
            <header className={s.head}>
              <h2 className={s.title}>{tr('Инженерийн обьёмын эрх')}</h2>
              <p className={s.subtitle}>
                {tr('Инженерийн төлөвлөсөн обьёмыг засах ба батлах аккаунтад үүрэг, багц хуваарилна. Гүйцэтгэлийн урсгал ба хуваарийн эрхээс тусдаа.')}
              </p>
            </header>
            <ObyemAcl />
          </>
        ) : pane === 'huvaari' ? (
          <>
            <header className={s.head}>
              <h2 className={s.title}>{tr('Хуваарийн эрх')}</h2>
              <p className={s.subtitle}>
                {tr('Хуваарь зохиох ба батлах аккаунтад үүрэг, багц хуваарилна. Гүйцэтгэлийн урсгалаас тусдаа.')}
              </p>
            </header>
            <HuvaariAcl />
          </>
        ) : pane === 'qaqc' ? (
          <>
            <header className={s.head}>
              <h2 className={s.title}>{tr('Чанарын (QAQC) эрх')}</h2>
              <p className={s.subtitle}>
                {tr('Чанарын баримт (М-акт · FIC · MA · MIR) хөтлөх аккаунтад багц хуваарилна. Гүйцэтгэлийн урсгалаас тусдаа.')}
              </p>
            </header>
            <QaqcAcl />
          </>
        ) : pane === 'guits' ? (
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
          {/* ⚠️ 2026-09-08-ны амьд шалгалт: хүснэгт AGOL дээр гараар «Everyone»
              болгогдсон байв — нэвтрээгүй хэн ч бүх эрхийг засаж чадна. Кодоор
              засах боломжгүй тул админд ИЛ, УЛААНААР хэлнэ (`permsTablePublic`). */}
          {permsTablePublic() && (
            <div className={s.addErr} role="alert">
              {tr('🔴 Эрхийн хүснэгт (Selbe_Permissions) НИЙТЭД нээлттэй байна — нэвтрээгүй хэн ч эрх засаж чадна. AGOL дээр item-ийн Share-ийг «Organization» болгоно уу.')}
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
            /* ⚠️ ЗӨВХӨН ХАРУУЛАХ тэмдэг. Шат томилох нь «Гүйцэтгэлийн урсгалын
                эрх» гэсэн ТУСДАА хуудсанд — тэнд аль багц хариуцахыг нь бас
                зааж өгдөг. Урьд нь энэ мөрөнд товчлол байсныг 2026-08-27-нд
                ХАСАВ: тэр товчлол багц сонгох чадваргүй тул үргэлж «бүх багц»
                гэж бичиж, тусдаа хуудсан дээр тавьсан хязгаарлалтыг ЧИМЭЭГҮЙ
                арилгадаг байлаа. */
            /* Нэмэлт эрхийн гэр харагдац runtime дээр нээлттэй — тоолуур ба
               унтраалга үүнийг ч тусгана */
            const capViews = capViewsOf(u.username);
            return (
              <UserRow
                key={key}
                u={u}
                rowKey={key}
                d={d}
                dirty={drafts.has(key)}
                st={stageOfUser(u.username)}
                expanded={openRows.has(key)}
                on={ALL_KEYS.filter((k) => hasView(d.views, k) || capViews.includes(k)).length}
                capViews={capViews}
                caps={capsOf(u.username)}
                selected={sel.has(key)}
                capErr={!!capErr.get(key)}
                dirtyPerm={dirtyRemote.has(key)}
                myName={myName}
                allKeys={ALL_KEYS}
                rolePresets={ROLE_PRESETS}
                hasView={hasView}
                capLabel={capLabel}
                capHint={capHint}
                onPick={(checked) => setSel((prev) => {
                  const n = new Set(prev);
                  if (checked) n.add(key); else n.delete(key);
                  return n;
                })}
                onExpand={() => setOpenRows((prev) => {
                  const n = new Set(prev);
                  if (n.has(key)) n.delete(key); else n.add(key);
                  return n;
                })}
                onRole={(role) => applyRole(u, role)}
                onFlipView={(k) => flipView(u, k)}
                onAllViews={(v) => setAllViews(u, v)}
                onFlipDocs={() => flipDocs(u)}
                onFlipCap={(c) => flipCap(u, c)}
                onFlipRemove={() => flipRemove(u)}
                onClear={() => markClear(u)}
                onGoFlow={() => setPane('guits')}
              />
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
