'use client';

/**
 * ЧАНАР (QAQC) — Inspection Test Plan-ийн баримт бичиг бөглөх харагдац.
 *
 * ⚠️ 2026-09-03, хэрэглэгчийн ХОЁР шийдвэр:
 *    (1) «QAQC-ийг гүйцэтгэл бөглөхөөс БҮРЭН салгаж тусдаа дэд сэдэв болго» —
 *        өгөгдөл нь `QAQC`/`QAQC2` үйлчилгээнд, архивгүй, мөр нь БАЙРАНДАА
 *        засагдана; бөглөх хуудасны нийтлэх мөчлөгт харьяалагдахгүй.
 *    (2) «Ажиллагааны зарчим, загварыг гүйцэтгэл бөглөх хэсэгтэй БҮРЭН адилхан
 *        болго» — тиймээс ЯГ ижил хүснэгтийн загвар (`.xl.b32`), ижил
 *        багц/хувилбар/бүлэг сонгогч, ижил шатлал ба эвхэлт, ижил баганын
 *        өргөн чирэлт, ижил crosshair, ижил хөвөгч мэдэгдэл, ижил
 *        виртуалчлал, ижил ноорог (localStorage + ArcGIS).
 *
 * ⚠️ ЯГ НЭГ ЗӨРӨӨ — БИЧИЛТИЙН ЗАМ. Бөглөх хуудас «Нийтлэх» дарахад хуудсыг
 *    БҮХЭЛДЭЭ хуулбарлаж архивт шинэ агшин үүсгэдэг; энд «Хадгалах» нь
 *    `applyEdits`-ээр тухайн мөрийг ЗАСНА. Тиймээс огнооны сонгогч, «өдөрт нэг
 *    удаа» түгжээ, хяналтад илгээх урсгал ЭНД БАЙХГҮЙ — тэдгээр нь архивын
 *    агшны шинж, засварын шинж БИШ.
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSyncRef } from '@/lib/useSyncRef';
import { t as tr } from '@/lib/i18nCore';
import { useAuth } from '@/components/AuthGate';
import { Data, userError } from '@/components/ui';
import { capsRemoteReady, hasCap, subscribeCaps } from '@/lib/caps';
import { qaqcScope, subscribeQaqcAcl } from '@/lib/qaqcAcl';
import { roleForUser } from '@/lib/services';
import { PKG_GROUPS, PKGS, pkgFloors, loadSchema, type Pkg } from '@/modules/sheet/bagts.pkg';
import { loadRows } from '@/modules/sheet/bagtsSheet';
import { useColWidths } from '@/modules/sheet/colWidths';
import { parseGrid } from '@/modules/sheet/paste';
import {
  attachTree,
  fetchQaqcDocs,
  filledCount,
  loadQaqcSheet,
  QAQC_BAND,
  QAQC_COLS,
  QAQC_GROUPS,
  planQaqcPaste,
  qaqcConflicts,
  qaqcTableOf,
  qaqcTooLong,
  qaqcUpdates,
  saveQaqc,
  type QaqcRow,
} from '@/lib/qaqc';
import {
  qaqcClockNow,
  readQaqcDraft,
  saveQaqcDraft,
} from '@/lib/qaqcDraftRemote';
import {
  adoptQaqcDraft,
  applyPendDiff,
  draftFromState,
  draftIncludes,
  emptyQaqcDraftState,
  mergeQaqcDrafts,
  nextStamp,
  parseQaqcDraft,
  serializeQaqcDraft,
  type QaqcDraft,
  type QaqcDraftState,
} from '@/lib/qaqcDraft';
import { loadAllDocs } from '@/lib/chanarStore';
import { MS_STATUS, latest, type DocKind } from '@/lib/chanarMs';
import { register } from '@/lib/dataBus';
import st from '@/modules/sheet/sheet.module.css';

/** ⚠️ `FillNew`-тэй ИЖИЛ хэрэгсэл — нэг хүснэгтийн загвар хуваалцана. */
const cls = (names: string) =>
  names.split(/\s+/).filter(Boolean).map((n) => st[n] || n).join(' ');

/** ⚠️ 2026-09-30: хадгалах явцад засвар хаалттай — `FillNew`-ийн `RO.busy`-тэй ИЖИЛ бичвэр */
const RO_BUSY = () => tr('Илгээлт эсвэл ачаалалт явж байна — дуусахыг хүлээгээд дахин засна уу.');

/* ══════════════════ ЧАНАРЫН БАРИМТЫН ХОЛБООС ══════════════════
 * ⚠️ 2026-09-28: MA · MIR · FIC дугаарын нүд засахад тухайн багцын
 *    БАТЛАГДСАН чанарын баримтын дугаараас сонгуулна (`<datalist>`).
 *    Чөлөөт текст хэвээр зөвшөөрнө — QAQC хүснэгт нь excel-ийн хуулбар,
 *    порталаас гадуур батлагдсан баримт ч бичигдэнэ. Наалт (`pasteBlock`) энэ замд ОРОХГҮЙ.
 * ⚠️ 2026-09-25: жагсаалт харагдац НЭЭГДЭХЭД нэг удаа (`loadAllDocs`, бүх багц ·
 *    3 төрөл) татагдана — өмнө нь зөвхөн нүд АНХ засахад татдаг тул зөвхөн
 *    ХАРДАГ хэрэглэгч «✓ батлагдсан» тэмдгийг хэзээ ч хардаггүй, багц солиход
 *    дахин татдаг байв. Унавал кэшлэхгүй — нүд нээхэд дахин оролдоно.
 */
/** `QAQC_COLS[].name` → чанарын баримтын төрөл (зөвхөн дугаарын баганууд) */
const DOC_KIND_OF: Readonly<Record<string, DocKind>> = {
  MA_dugaar: 'MA', MIR_dugaar: 'MIR', FIC_dugaar: 'FIC',
};
const docKindAt = (di: number): DocKind | null => DOC_KIND_OF[QAQC_COLS[di]?.name ?? ''] ?? null;
/** Батлагдсан баримт — төрөл · багц · дугаар · нэр */
type ApprovedDoc = { kind: DocKind; bagts: string; no: string; title: string };
const normNo = (v: string) => v.trim().toUpperCase();
/**
 * ⚠️ 2026-10-09: БАТЛАГДСАН ЖАГСААЛТ ХУУЧИРНА — `chanarStore`-ийн бичих зам бүр
 *    `invalidate('CHANAR_BARIMT')` дууддаг. Урьд нь жагсаалт харагдац нээгдэхэд НЭГ
 *    удаа татагдаж, хооронд нь батлагдсан баримт «✓»/нэрийн автомат бөглөлтөд
 *    сешн дуустал орж ирдэггүй байв. Модулийн түвшинд НЭГ бүртгэл (`register`-т
 *    тайлах зам байхгүй — mount бүрд бүртгэвэл хуримтлагдана); харагдац дохиог сонсоно.
 */
const approvedStaleSubs = new Set<() => void>();
register(() => { for (const fn of approvedStaleSubs) fn(); }, ['CHANAR_BARIMT']);
/* ══════════════════════════ НООРОГ ══════════════════════════
 * ⚠️ Бөглөх хуудасны ноорогтой ИЖИЛ зарчим: localStorage нь ҮНДСЭН зам,
 *    ArcGIS дээрх хуулбар нь зөвхөн «өөр төхөөрөмж рүү шилжих» асуудлыг
 *    шийднэ. Сүлжээ унасан ч бөглөлт тасрахгүй.
 * ⚠️ Слот нь БАГЦ бүрд тусдаа. Локал слот `selbe-qaqc-draft:` угтвартай,
 *    алсынх нь ӨӨРИЙН хүснэгттэй (`Selbe_QAQC_Draft`) — 2026-09-03-нд
 *    гүйцэтгэлийн ноорогийн хүснэгтээс бүрэн салгав. Тиймээс түлхүүрт
 *    угтвар нэмэх ХЭРЭГГҮЙ: нэмбэл хоёр талын түлхүүр зөрж, хадгалсан
 *    ноорог эргэж ирэхгүй болно.
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ФОРМАТ ба НЭГТГЭЛ `lib/qaqcDraft.ts`-д
 *    шилжив — нүд бүр ӨӨРИЙН агшинтай, арилгасан нүд нь БУЛШ (агшинтай, утгагүй)
 *    болж хадгалагдана. Урьд нь (а) өөр төхөөрөмж дээр арилгасан нүд энэ
 *    төхөөрөмжийн хуучин ноорогоос буцаж амилдаг, (б) ноорогийн ерөнхий агшнаар
 *    бүхлээр нь «шинэ нь ялна» гэж шийддэг байв. Тэнд дэлгэрэнгүй.
 * ⚠️ QAQC-ийн ObjectID нь ТОГТВОРТОЙ (архив үүсдэггүй) тул бөглөх хуудсанд
 *    шаардлагатай «шинэ агшин руу зөөх» логик ЭНД ХЭРЭГГҮЙ. Мөрийн танигчийг
 *    (`rowKeys`) ердөө шалгахад л хэрэглэнэ: хүснэгт AGOL дээр дахин үүсгэгдвэл
 *    дугаарууд гулсах бөгөөд тэр үед ноорог ЧИМЭЭГҮЙ буруу мөрд буух ёсгүй.
 */
type Draft = QaqcDraft;

const DRAFT_PREFIX = 'selbe-qaqc-draft:';
/* ⚠️ Локал нооргийн түлхүүр ХЭРЭГЛЭГЧЭЭР (2026-09-17): нэг компьютер дээр А-гийн
   нүд Б-гийн нэрээр бичигдэхээс. Алсын ноорог (`qaqcDraftRemote`) аль хэдийн
   хэрэглэгчээр ялгадаг байсан — локал нь хоцорсон. */
const dk = (u: string | null | undefined, pkgKey: string) => `${(u ?? '').trim().toLowerCase()}:${pkgKey}`;
/**
 * НООРОГИЙН АМЬДРАХ ХУГАЦАА.
 *
 * ⚠️ 3 → 14 ХОНОГ (2026-09-07). 3 хоног нь ажлын долоо хоногийн хэмнэлд
 * ТААРАХГҮЙ байв: баасан 17:00-д хадгалсан ноорог даваа 17:00-д хугацаа
 * дуусч, мягмар өглөө нээхэд ЛОКАЛ ба АЛСЫН хуулбар ХОЁУЛАА чимээгүй
 * устдаг — `parseDraft` нь хоёуланд нь хэрэглэгддэг тул ArcGIS дээр БАЙГАА
 * ноорогийг ч хаяна. Гурван өдрийн амралт, өвчтэй, томилолт бүрд ижил;
 * хэрэглэгчид ямар ч мэдэгдэл очдоггүй.
 *
 * ⚠️ `FillNew.tsx`-д 2026-09-06-нд яг энэ шалтгаанаар 14 болгосон —
 * чанарын хуудас тэр засварыг аваагүй хоцорсон байв.
 *
 * ⚠️ TTL нь ЗӨВХӨН ЛОКАЛ хуулбарт (2026-09-15-ны аудит). Алсын (ArcGIS)
 * хуулбарыг ХУГАЦААГААР ХЭЗЭЭ Ч устгахгүй — зөвхөн бүтцээр эвдэрсэн үед.
 * Хоёр долоо хоног талбайд ажиллаад ирэхэд ArcGIS дээр БҮТНЭЭРЭЭ байгаа
 * ноорог `null` болж хаягдах ёсгүй; локал хуулбар нь тухайн БРАУЗЕРЫН түр
 * зуурын хадгалалт тул хуучрахад утгагүй болдог нь өөр хэрэг.
 * `FillNew.tsx` энэ ялгааг аль хэдийн хийсэн.
 */
const DRAFT_TTL_MS = 14 * 24 * 3600 * 1000;

/* ⚠️ 2026-10-01: ХУУЧИН (нүдний агшингүй) форматыг ч өгөгдөл алдалгүй уншина —
   нүд бүр ноорогийн ерөнхий агшныг авна (`parseQaqcDraft`). */
const parseDraft = (raw: string, src: 'local' | 'remote' = 'local'): Draft | null =>
  parseQaqcDraft(raw, { now: Date.now(), ttlMs: src === 'local' ? DRAFT_TTL_MS : null });
/**
 * ЛОКАЛ ба АЛСЫН ноорогийг НИЙЛҮҮЛНЭ — нэгийг нь сонгохгүй (2026-09-15).
 *
 * ⚠️ 2026-10-01: НҮД БҮРЭЭР — нүд бүрд ӨӨРИЙН агшин их нь ялна, булш (арилгасан
 *    нүд) ч адил оролцоно (`mergeQaqcDrafts`). Урьд нь ноорогийн ерөнхий `t`-ээр
 *    «шинэ ноорогийн утга ялж», нэг талд л байгаа нүд ҮРГЭЛЖ үлддэг байсан тул
 *    өөр төхөөрөмж дээр арилгасан нүд буцаж амилдаг байв.
 *
 * ⚠️ Нэг тал `null` бол нөгөөг ШУУД буцаана; хоёулаа `null` бол `null`.
 */
const mergeDraft = mergeQaqcDrafts;

const readDraft = (pkgKey: string): Draft | null => {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + pkgKey);
    return raw ? parseDraft(raw) : null;
  } catch {
    return null;
  }
};
/* ⚠️ 2026-10-01: ЗӨВХӨН шинэ формат бичигдэнэ (`serializeQaqcDraft`) */
/* ⚠️ 2026-10-05: үр дүнг БУЦААНА (`false` = бичигдсэнгүй). Урьд нь алдааг залгиж, самбар
   «ноорог хадгалагдав hh:mm» гэж ХУДАЛ харуулдаг байв (хувийн горим · дүүрсэн хадгалалт) —
   таб хаагдахад ажил алга. Дуудагч (`persistLocal`) байдлыг ил харуулна. */
const saveDraftLS = (pkgKey: string, d: Draft): boolean => {
  try {
    const s = serializeQaqcDraft(d, { now: Date.now() });
    if (s) localStorage.setItem(DRAFT_PREFIX + pkgKey, s);
    return true;
  } catch {
    /* хувийн горим / дүүрсэн хадгалалт — алсын хуулбар үлдэнэ */
    return false;
  }
};
const clearDraftLS = (pkgKey: string) => {
  try {
    localStorage.removeItem(DRAFT_PREFIX + pkgKey);
  } catch {
    /* уншихаас ч бичихээс ч хориглогдсон — тоох зүйл алга */
  }
};

/* ══════════════════════════ ХАРАГДАЦ ══════════════════════════ */

export function Qaqc() {
  const { user, status: authStatus } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((n) => n + 1)), []);
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeQaqcAcl(() => setAclN((n) => n + 1)), []);

  /**
   * ⚠️ ХЯЗГААРГҮЙ = кодын хатуу `super` эсвэл нэвтрэлт унтраалттай дев.
   *
   * ⚠️ БАГЦЫН ХҮРЭЭ нь `qaqcAcl`-ААС гарна — «Гүйцэтгэл бөглөх»-ийн
   *    `bagtsScope`-оос БИШ (2026-09-07). Чанарын хяналтын ажилтан нь
   *    гүйцэтгэлийн урсгалын дөрвөн шатны аль нь ч биш тул урсгалын
   *    томилгоогоор хуваарилвал түүнд гүйцэтгэл ЗӨВШӨӨРӨХ эрх дагалдаж,
   *    мөн «нэг аккаунт нэг шатанд» дүрмээр өмнөх томилгоо нь чимээгүй
   *    хасагдана. Дэлгэрэнгүйг `qaqcAcl.ts`-ийн толгойгоос үз.
   */
  const unrestricted = authStatus === 'off' || roleForUser(user?.username) === 'super';
  /**
   * БҮХ БАГЦ ХАРАГДАНА — ХАРАХ нь ЗАСАХААС ТУСДАА (2026-09-09).
   *
   * ⚠️ Доорх `canEdit`-ийн тайлбар «Эрхгүй хүн хуудсыг ХАРНА, зөвхөн
   *    засахгүй» гэж 2026-09-04-нөөс бичигдсэн атлаа `groupOpts` нь
   *    хуваарилагдаагүй хүнд ХООСОН болж, хуудсыг БҮХЭЛД НЬ хаадаг байв
   *    (мөр 843). Өөрөөр хэлбэл тайлбар ба код зөрчилдөж байлаа.
   *
   * ⚠️ Порталын дүрэм: харагдацын эрх (`views`) нь «юуг ХАРАХ», ACL
   *    хуваарилалт нь «юуг ЗАСАХ». Газар · Санхүү · Дэд бүтэц · Зөвшөөрөл
   *    дөрвүүлээ ингэж ажилладаг.
   */
  const groupOpts = PKG_GROUPS;

  const [pkg, setPkg] = useState<Pkg>(PKGS[0]);

  /**
   * БӨГЛӨХ ЭРХ — `qaqc` эрх БА тухайн багц хуваарилалтад багтах эсэх.
   * ⚠️ Уншилтыг хаавал чанарын баримтыг хэн ч хянаж чадахгүй болно.
   * ⚠️ БАГЦЫН ХҮРЭЭ энд шалгагдана (сонгогчид биш): «Багц 2»-ын чанарын
   *    ажилтан «Багц 5»-ын актыг ХАРНА, гэхдээ ЗАСАХГҮЙ.
   * ⚠️ `pkg`-ЭЭС ХАМААРНА тул түүний ДАРАА тодорхойлогдоно — багц солиход
   *    дахин бодогдох ёстой.
   */
  /**
   * ⚠️ `null` = ХЯЗГААРГҮЙ, `[]` = ЮУ Ч БИШ (2026-09-16-ны аудит).
   *
   * Урьд нь `(qaqcScope(...) ?? []).includes(pkg.group)` байсан нь `null`-ыг
   * `[]` болгож, «бүх багц» хуваарилагдсан хүнд `.includes` нь ҮРГЭЛЖ `false`
   * буцаадаг байв — тэр хүн ямар ч багц дээр засаж чаддаггүй.
   *
   * ⚠️ ЭНЭ НЬ АНХДАГЧ ЗАМ байсан тул нөлөө нь бүрэн: эрх олгох ХОЁР
   *    стандарт зам хоёулаа `[ALL_BAGTS]` бичдэг —
   *      · `QaqcAcl.tsx` «нэмэх» → `setQaqcAssign(add, [ALL_BAGTS])`
   *      · `UserAdmin.tsx` эрхийн унтраалга → багцгүй хүнд `[QAQC_ALL_BAGTS]`
   *    улмаар `qaqcScope` нь `null` буцаана. Панелд эрх ОЛГОГДСОН гэж
   *    харагдаж, хуудас нээгдэж, гэвч ITP багана засагдахгүй байлаа.
   *
   * ⚠️ `unrestricted` нь ЗӨВХӨН `authStatus === 'off'` ба хатуу `super`-ыг
   *    хамардаг — «бүх багц» хуваарилагдсан ЖИРИЙН аккаунтыг хамардаггүй.
   *
   * ⚠️ Гурван хөрш модуль ЯГ зөв байсан (`Huvaari.tsx` `inScope`,
   *    `FillNew.tsx` `sc0 === null || …`, `chanarAcl.ts`) — QAQC л хоцорсон.
   *    Шинэ хэрэглэгч нэмэхдээ тэдгээрийн хэлбэрийг ДАГА.
   */
  const canEdit = useMemo(
    () => {
      if (!hasCap(user?.username, 'qaqc')) return false;
      if (unrestricted) return true;
      const sc = qaqcScope(user?.username);
      return sc === null || sc.includes(pkg.group);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, capN, aclN, unrestricted, pkg.group],
  );
  const floorOpts = useMemo(() => pkgFloors(pkg.group), [pkg.group]);
  /* Сонгосон багц хуваарилалтаас гадуур үлдвэл зөвшөөрөгдсөн эхнийх рүү.
     ⚠️ 2026-09-30: эффект биш, RENDER дунд (React-ийн «adjusting state when a prop
     changes» загвар) — `groupOpts` солигдсон (ба эхний) render-т л шалгана,
     `pkg.group`-ийг хамааралд оруулахгүй хэвээр. */
  const [clampedOpts, setClampedOpts] = useState<string[] | null>(null);
  if (clampedOpts !== groupOpts) {
    setClampedOpts(groupOpts);
    if (!groupOpts.includes(pkg.group)) {
      const first = PKGS.find((p) => p.group === groupOpts[0]);
      if (first) setPkg(first);
    }
  }

  const [rows, setRows] = useState<QaqcRow[]>([]);
  /** ⚠️ 2026-10-09: баганын тэмдэгтийн дээд урт (`QAQC_COLS` дарааллаар; `null` = мэдэгдэхгүй) — `fieldsOf`-ийн ⚠️ */
  const [maxLen, setMaxLen] = useState<(number | null)[]>([]);
  /** Шатлал холбогдсон эсэх — хавтгай зурагдвал шалтгааныг ил хэлнэ */
  const [flat, setFlat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /**
   * АЧААЛАХ АЛДАА — `err`-ээс ТУСДАА (⚠️ 2026-10-01, «хэрэглэгч: бүгдийг зас»).
   * ⚠️ Урьд нь түүхий `e.message` («Token Required») шууд гардаг байв — одоо `Data`-гийн
   *    алдааны блок: ойлгомжтой тайлбар · эвхмэл техникийн мөр · «Дахин оролдох».
   */
  const [loadErr, setLoadErr] = useState<Error | null>(null);
  /** Хадгалаагүй засвар — `${ObjectID}:${баганын индекс}` → текст */
  const [pend, setPend] = useState<Record<string, string>>({});
  /** Яг одоо засагдаж буй нүд — `${мөрийн индекс}:${багана}` */
  const [editCell, setEditCell] = useState<string | null>(null);

  const { style: colStyle, grip, resetAll, resized } = useColWidths('qaqc');

  /* ── Хөвөгч мэдэгдэл — `FillNew`-ийн `say`/`done`/`warn`-тай ижил ── */
  const [notice, setNotice] = useState<{ kind: 'ro' | 'ok' | 'warn'; msg: string } | null>(null);
  const noticeT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((kind: 'ro' | 'ok' | 'warn', msg: string) => {
    if (noticeT.current) clearTimeout(noticeT.current);
    setNotice({ kind, msg });
    noticeT.current = setTimeout(() => setNotice(null), 4000);
  }, []);
  const say = useCallback((m: string) => show('ro', m), [show]);
  const done = useCallback((m: string) => show('ok', m), [show]);
  useEffect(() => () => { if (noticeT.current) clearTimeout(noticeT.current); }, []);

  /** Засагдахгүй нүдний тайлбар — товшихад гарна */
  const RO_NO = tr('№ ба Ажлын нэр нь excel-ийн бүтэц — энэ хуудаснаас засагдахгүй.');
  /*
   * ⚠️ ХОЁР ӨӨР ШАЛТГААН, ХОЁР ӨӨР МЕССЕЖ (2026-09-09). Эрх огт байхгүй нь
   *    «админаас эрх аваарай», харин эрхтэй атлаа ЭНЭ багц хуваарилагдаагүй
   *    нь «өөр багцаа сонго» гэсэн ӨӨР үйлдэл шаардана. Нэг мессежээр
   *    хэлбэл эрхтэй хүн «эрх алга» гэж уншаад админ руу дэмий явна.
   */
  /*
   * ⚠️ ГУРАВ ДАХЬ ШАЛТГААН (2026-09-21, аудитын засвар): эрхийн хүснэгт энэ
   *    сешнд УНШИГДААГҮЙ (`capsRemoteReady()` false — remote унасан, fail-closed
   *    тул `hasCap` false). Тэр үед «эрх олгогдоогүй» гэвэл ХУДАЛ — хүн админ
   *    руу дэмий явна; «түр хүлээ» гэж ялгана (`AuthGate` 15 сек тутам дахин
   *    уншина). Нэвтрэлт унтраалттай орчинд `hasCap` үргэлж true тул энэ салаа
   *    хүрэхгүй.
   */
  const RO_CAP = hasCap(user?.username, 'qaqc')
    ? tr('«{0}» танд хуваарилагдаагүй тул зөвхөн харна. Хуваарилагдсан багцаа сонгоно уу.', pkg.group)
    : !capsRemoteReady()
      ? tr('Эрхийн мэдээлэл уншигдаагүй — түр хүлээнэ үү.')
      : tr('Чанарын баримт бөглөхөд «QAQC» эрх шаардлагатай — админ порталын «Чанарын (QAQC) эрх» хуудаснаас олгоно.');
  const ro = (msg: string) => ({ title: msg, onClick: () => say(msg) });

  /* ── Баганын crosshair — React state БИШ, O(1) overlay (FillNew-тэй ижил) ── */
  const colHlRef = useRef<HTMLDivElement | null>(null);
  const colHlBi = useRef<string | null>(null);
  const moveColHl = (e: React.MouseEvent<HTMLTableElement>) => {
    const hl = colHlRef.current;
    if (!hl) return;
    const td = (e.target as HTMLElement).closest?.('td[data-bi]') as HTMLElement | null;
    const bi = td?.dataset.bi ?? null;
    if (bi === colHlBi.current) return;
    colHlBi.current = bi;
    if (!td || bi == null) {
      hl.style.display = 'none';
      return;
    }
    hl.style.display = 'block';
    hl.style.left = `${td.offsetLeft}px`;
    hl.style.width = `${td.offsetWidth}px`;
  };
  const hideColHl = () => {
    colHlBi.current = null;
    if (colHlRef.current) colHlRef.current.style.display = 'none';
  };

  /* ══════════════ АЧААЛАЛТ ══════════════ */
  const loadedPkgRef = useRef('');
  const promptedPkgRef = useRef('');

  /**
   * ⚠️ ХУУЧИРСАН ХАРИУНААС ХАМГААЛАХ ДАРААЛАЛ (2026-09-25-ны аудит, HIGH):
   *    A багцын удаан ачаалалт B руу шилжсэний ДАРАА ирвэл A-гийн мөрүүд B-ийн
   *    дэлгэц дээр суугаад `loadedPkgRef = A` болж, хадгалахад B-ийн засвар
   *    A-гийн OBJECTID-ууд руу бичигдэх боломжтой байв. Зөвхөн хамгийн сүүлийн
   *    дуудлагын хариу төлөвт буна.
   */
  const loadSeq = useRef(0);
  const load = useCallback(async (key: string) => {
    const seq = ++loadSeq.current;
    const live = () => seq === loadSeq.current;
    setBusy(true);
    setErr('');
    setLoadErr(null);
    setRows([]);
    setFlat(false);
    loadedPkgRef.current = '';
    try {
      const { rows: qRows, maxLen: ml } = await loadQaqcSheet(key);
      if (!live()) return;
      /**
       * ШАТЛАЛЫГ бөглөх хуудаснаас холбоно — ЗӨВХӨН харагдацад.
       *
       * ⚠️ Мод татагдахгүй бол QAQC хуудас УНАХГҮЙ: `catch` нь хавтгай
       *    хүснэгт үлдээнэ. Бөглөх хуудасны үйлчилгээний доголдол чанарын
       *    бөглөлтийг бүхэлд нь хаах ёсгүй.
       */
      let withTree: QaqcRow[] | null = null;
      try {
        const p = PKGS.find((x) => x.key === key);
        if (p) {
          const sc = await loadSchema(p);
          const sheet = await loadRows(p, sc);
          withTree = attachTree(qRows, sheet.rows);
        }
      } catch {
        withTree = null;
      }
      if (!live()) return;
      setRows(withTree ?? qRows);
      setMaxLen(ml);
      setFlat(withTree == null);
      loadedPkgRef.current = key;
    } catch (e) {
      /* ⚠️ 2026-10-01: `loadErr` — ойлгомжтой тайлбар + дахин оролдох (дээрх ⚠️) */
      if (live()) setLoadErr(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (live()) setBusy(false);
    }
  }, []);

  const [grpA, setGrpA] = useState(0);
  const [grpB, setGrpB] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  /**
   * АЛСЫН ХУУЛБАРЫН БАЙДАЛ (2026-09-07, `FillNew`-ийн загвар).
   *
   * ⚠️ Урьд нь `saveQaqcDraft(...)`-ийн үр дүнг `void`-оор ХАЯДАГ байсан тул
   * сүлжээгүй, токен дууссан, хүснэгт олдоогүй — аль ч тохиолдолд дэлгэц
   * дээр «ноорог хадгалагдав» гэж ХЭВЭЭР гарч, бөглөгч алсад хуулагдсан гэж
   * итгээд өөр компьютер дээр хоосон хуудас хүлээж авдаг байв. Локал ноорог
   * бүрэн бүтэн тул бөглөлтийг ЗОГСООХГҮЙ — зөвхөн байдлыг ҮНЭН харуулна.
   *
   * ⚠️ `null` = хараахан илгээгээгүй — тэр үед юу ч хэлэхгүй, эс бөгөөс
   *    бичиж эхэлмэгц худал анхааруулга гарна.
   */
  const [remoteState, setRemoteState] = useState<
    null | { kind: 'ok'; at: number } | { kind: 'big' } | { kind: 'fail' }
  >(null);
  /* ⚠️ 2026-09-30: доорх ref-үүдийн зарлалтыг ЭНД зөөв (эхний хэрэглээ — доорх эффект —
     зарлалтаас өмнө байсан тул React Compiler тэдгээрийг ref гэж танихгүй, `save`-ийн
     memo-г хадгалж чадахгүй байв). Тайлбарууд хуучин байрандаа (§НООРОГ — ХАДГАЛАХ). */
  const remoteQueue = useRef<{ pkg: string; draft: Draft } | null>(null);
  const remoteVerifiedRef = useRef('');
  /** Хамгийн сүүлийн `flush` — салгах (unmount) ба багц солих үед дараалалд үлдсэнийг илгээнэ.
      ⚠️ 2026-10-09: зарлалтыг ЭНД зөөв — доорх багц солих эффект ашиглана. */
  const flushRef = useRef<(() => void) | null>(null);
  /**
   * ⚠️ 2026-10-01: НҮД БҮРИЙН АГШИН ба БУЛШ (`lib/qaqcDraft.ts`).
   *   `draftStRef` — энэ табын `pend`-ийн нүд бүрийн агшин + арилгасан нүдний булш;
   *   `prevPendRef` — хадгалах эффектийн СҮҮЛД харсан `pend` (устгалыг үүнээс тооцно);
   *   `clockRef` — Лампорт цаг: энэ табын ХАРСАН хамгийн их агшин.
   * ⚠️ Урьдын `restoreDoneRef` ХАСАГДАВ: хоосон `pend` дээр ноорогийг устгадаг
   *    салаа байхаа больсон (арилгалт = булш бичих, локал ба алсад НЭГТГЭЖ бичнэ)
   *    тул «сэргээлт дуусаагүй байхад устгах» эрсдэл үүсэхгүй.
   */
  const draftStRef = useRef<QaqcDraftState>(emptyQaqcDraftState());
  const prevPendRef = useRef<Record<string, string>>({});
  const clockRef = useRef(0);
  useEffect(() => {
    /* ⚠️ 2026-10-09: ДАРААЛАЛД ҮЛДСЭН алсын хуулбарыг ЭХЛЭЭД илгээнэ. Урьд нь доорх
       `remoteQueue.current = null` нь сүүлийн ≤12 секундын бөглөлтийг (локалд бий)
       ArcGIS руу хуулалгүй хаядаг байв — өөр компьютероос тэр багцыг нээхэд дутуу.
       `flush` нь ӨМНӨХ багцын closure (`q.pkg`-ээр шалгана), хариу нь `loadedPkgRef`-
       ээр шүүгдэж шинэ багцын төлөвт бичигдэхгүй. Анхны mount-д `flushRef` хоосон. */
    flushRef.current?.();
    /* ⚠️ Багц солиход хадгалаагүй засварыг ЗААВАЛ цэвэрлэнэ: түлхүүр нь
       ObjectID тул өөр хүснэгтийн ижил дугаартай мөрд наалдаж, ӨӨР БАГЦЫН
       ажилд акт бичих байлаа. */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: татах эффект — түлхүүр солигдоход ачаалж буй/өмнөх төлөвийг синхрон тэглээд шинээр татна; render үед гаргавал бүтэц өөрчлөгдөнө
    setPend({});
    setEditCell(null);
    setCollapsed(new Set());
    setGrpA(0);
    setGrpB(0);
    remoteQueue.current = null;
    /* ⚠️ АЛСЫН БАЙДАЛ БАГЦАД ХАРЬЯАЛАГДАНА (2026-09-07): үлдээвэл өмнөх
       багцын «ArcGIS 14:20» ногоон заалт эсвэл шар анхааруулга ШИНЭ багц
       дээр наалдаж, хэрэглэгч буруу багцын байдлыг хардаг. */
    setRemoteState(null);
    /* ⚠️ СЭРГЭЭХ ШАТЫГ ДАХИН НЭЭНЭ (2026-09-07). `promptedPkgRef` нь
       сешн дуустал тэгэлддэггүй байсан тул багц A→B→A буцахад: (1) сэргээх
       эффект ДАХИН ажиллахгүй, (2) хадгалах эффектийн `pend` хоосон салаа
       нь `promptedPkgRef.current === pkg.key` шалгуурыг давж A-гийн ноорогийг
       ЛОКАЛ ба АЛСАД ХОЁУЛАНГ нь УСТГАДАГ байв. Багц солих цонх нь эсрэгээр
       «Ноорог үлдэх» гэж амладаг тул тэр заалт ХУДАЛ байлаа. */
    promptedPkgRef.current = '';
    /* ⚠️ 2026-09-25: сэргээлт/алсын баталгаа нь БАГЦАД харьяалагдана */
    remoteVerifiedRef.current = '';
    /* ⚠️ 2026-10-01: нүдний агшин/булш ч БАГЦАД харьяалагдана — `pend`-ийн
       тэглэлтийг «бүх нүдийг арилгасан» гэж булшлахгүйн тулд `prevPendRef`-ийг
       ч хамт тэглэнэ (цаг нь `clockRef` нэг чиглэлд л өсөх тул хэвээр). */
    draftStRef.current = emptyQaqcDraftState();
    prevPendRef.current = {};
    void load(pkg.key);
  }, [pkg.key, load]);

  /* ══════════════ ШАТЛАЛЫН ШҮҮЛТ (FillNew-тэй ижил) ══════════════ */
  const toggle = (oid: number) =>
    setCollapsed((s0) => {
      const n = new Set(s0);
      if (n.has(oid)) n.delete(oid);
      else n.add(oid);
      return n;
    });

  /** Эцэг бүлгүүд — хамгийн бага гүнтэй бүлгийн мөрүүд */
  const grpAOpts = useMemo(() => {
    const min = Math.min(...rows.filter((r) => r.group).map((r) => r.depth), 99);
    return rows
      .filter((r) => r.group && r.depth === min)
      .map((r) => ({ oid: r.oid, label: `${r.no} ${r.work}`.trim() }));
  }, [rows]);

  /** Индекс → мөрийн эцэг бүлгийн ObjectID (гүнээр) */
  const parentOf = useMemo(() => {
    const out: (number | null)[] = [];
    const stack: { oid: number; depth: number }[] = [];
    rows.forEach((r) => {
      while (stack.length && stack[stack.length - 1].depth >= r.depth) stack.pop();
      out.push(stack.length ? stack[stack.length - 1].oid : null);
      if (r.group) stack.push({ oid: r.oid, depth: r.depth });
    });
    return out;
  }, [rows]);

  /**
   * `ObjectID → мөрийн индекс`.
   * ⚠️ Удам шалгах бүрд `findIndex` дуудвал 1,400 мөр × шатлалын гүн болж
   *    бүлэг сонгох үед хуудас мэдэгдэхүйц гацдаг — нэг удаа индекслэнэ.
   */
  const idxOf = useMemo(() => {
    const m = new Map<number, number>();
    rows.forEach((r, i) => m.set(r.oid, i));
    return m;
  }, [rows]);

  /** Мөр нь сонгосон бүлгийн удам эсэх (өөрөө ч тооцогдоно) */
  const inBranch = useCallback(
    (i: number, rootOid: number): boolean => {
      let j: number | undefined = i;
      /* ⚠️ Хүрээнээс гарсан индекс — `rows[-1]` нь unhandled throw болж
         бүтэн харагдацыг унагаана (ErrorBoundary «нээгдсэнгүй» гэж зурна). */
      while (j != null && j >= 0 && j < rows.length) {
        if (rows[j].oid === rootOid) return true;
        const par = parentOf[j];
        if (par == null) return false;
        j = idxOf.get(par);
      }
      return false;
    },
    [rows, parentOf, idxOf],
  );

  /**
   * ДЭД БҮЛГҮҮД — эцэг бүлгээс НЭГ доош түвшин.
   * ⚠️ Эцэг сонгогдсон бол зөвхөн ТҮҮНИЙ доторх дэд бүлэг жагсна
   *    (`FillNew`-тэй ижил зан) — эс бөгөөс сонголт нь харагдацыг хоосон
   *    болгож, хэрэглэгч «эвдэрсэн» гэж уншина.
   */
  const grpBOpts = useMemo(() => {
    const deeper = rows.filter((r) => r.group && r.depth > 0);
    const min = Math.min(...deeper.map((r) => r.depth), 99);
    return deeper
      .filter((r) => r.depth === min)
      .filter((r) => !grpA || inBranch(idxOf.get(r.oid) ?? -1, grpA))
      .map((r) => ({ oid: r.oid, label: `${r.no} ${r.work}`.trim() }));
  }, [rows, grpA, inBranch, idxOf]);
  const grpBEff = useMemo(
    () => (grpBOpts.some((g) => g.oid === grpB) ? grpB : 0),
    [grpBOpts, grpB],
  );

  /* ── Бөглөгдөөгүй шүүлт — `FillNew`-ийн «Хуваарийн дагуу»-тай ижил үүрэг ── */
  const [onlyEmpty, setOnlyEmpty] = useState(false);

  /** Нуугдсан мөрүүд — эвхэлт ба бүлгийн шүүлтээр */
  const hidden = useMemo(() => {
    const out = new Array<boolean>(rows.length).fill(false);
    /* (1) Эвхэгдсэн бүлгийн БҮХ удам */
    for (let i = 0; i < rows.length; i += 1) {
      if (!rows[i].group || !collapsed.has(rows[i].oid)) continue;
      const d = rows[i].depth;
      for (let j = i + 1; j < rows.length && rows[j].depth > d; j += 1) out[j] = true;
    }
    /* (2) Бүлгийн сонголт — сонгосон салбараас гадна бүх мөр */
    const root = grpBEff || grpA;
    if (root) {
      for (let i = 0; i < rows.length; i += 1) {
        if (!out[i] && !inBranch(i, root)) out[i] = true;
      }
    }
    /* (3) Зөвхөн бөглөөгүй — БҮЛГИЙН мөр хэвээр (мод тасрахгүй) */
    if (onlyEmpty) {
      for (let i = 0; i < rows.length; i += 1) {
        if (!out[i] && !rows[i].group && rows[i].docs.some((x) => x != null)) out[i] = true;
      }
    }
    return out;
  }, [rows, collapsed, grpA, grpBEff, onlyEmpty, inBranch]);

  const vis = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < rows.length; i += 1) if (!hidden[i]) out.push(i);
    return out;
  }, [rows, hidden]);

  const filled = useMemo(() => filledCount(rows), [rows]);
  const emptyCount = useMemo(
    () => rows.filter((r) => !r.group && r.docs.every((x) => x == null)).length,
    [rows],
  );
  /* ⚠️ 2026-09-30: «Зөвхөн бөглөөгүй N / M»-ийн M нь АЖЛЫН мөр — тоологч (`emptyCount`)
     бүлгийн мөрийг хасдаг атлаа хуваагч нь бүх мөр (бүлэгтэй) байсан тул харьцаа
     бодит бус (жиш. 120 / 1,400 — ажлын мөр ~1,200) гарч байв. */
  const leafCount = useMemo(() => rows.filter((r) => !r.group).length, [rows]);
  const dirtyCount = Object.keys(pend).length;

  /* ══════════════ ВИРТУАЛЧЛАЛ (FillNew-тэй ижил) ══════════════ */
  const scrollRef = useRef<HTMLDivElement>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const rowHRef = useRef(26);
  /* ⚠️ 2026-09-30: мөрийн өндрийг RENDER-т state-ээс уншина (ref-ийг render дунд
     уншиж болохгүй); ref нь `recalcWin`-ий тооцоонд хэвээр. Утга солигдоход л setState. */
  const [rowH, setRowH] = useState(26);
  const [win, setWin] = useState({ from: 0, to: 80 });
  const OVER = 20;
  const recalcWin = useCallback(() => {
    const el = scrollRef.current;
    const tb = tbodyRef.current;
    if (!el || !tb) return;
    const first = tb.querySelector('tr[data-r]') as HTMLElement | null;
    if (first?.offsetHeight) { rowHRef.current = first.offsetHeight; setRowH(first.offsetHeight); }
    const h = rowHRef.current;
    const top = Math.max(0, el.scrollTop - tb.offsetTop);
    const from = Math.max(0, Math.floor(top / h) - OVER);
    const to = Math.ceil((top + el.clientHeight) / h) + OVER;
    setWin((w) => (w.from === from && w.to === to ? w : { from, to }));
  }, []);
  const winTick = useRef(0);
  const onScroll = useCallback(() => {
    if (winTick.current) return;
    winTick.current = requestAnimationFrame(() => {
      winTick.current = 0;
      recalcWin();
    });
  }, [recalcWin]);
  useEffect(() => {
    recalcWin();
  }, [vis, recalcWin]);

  /**
   * «ХАДГАЛАХ»-ЫН ДАРАА ГҮЙЛГЭЛТИЙН БАЙРЛАЛ ХАДГАЛАГДАНА (2026-10-01, хэрэглэгч: бүгдийг зас).
   *
   * ⚠️ ЯАГААД ҮСЭРДЭГ БАЙВ: `save` нь серверээс дахин татахдаа `load`-ийг дууддаг,
   *    `load` нь эхлээд `setRows([])` хийдэг (өөр багцын мөр дэлгэцэнд үлдэхгүйн
   *    тулд — тэр ⚠️ хэвээр). `rows.length > 0` нөхцөлтэй гүйлгэх хайрцаг
   *    (`scrollRef`) тэр агшинд DOM-оос ХАСАГДАЖ, араг (skeleton) зурагдаад, мөр
   *    ирэхэд ШИНЭ хайрцаг `scrollTop = 0`-ээр үүсдэг — хэрэглэгч 900-р мөрөөс
   *    хүснэгтийн эхэнд шидэгддэг байв.
   * ⚠️ Дахин ачаалахын ӨМНӨ байрлалыг тэмдэглэж (`keepScroll`), мөр буцаж ирсэн
   *    render-ийн layout эффектэд (будахаас ӨМНӨ — анивчихгүй) сэргээгээд цонхыг
   *    (`recalcWin`) тэр байрлалаар дахин бодно. `win` төлөв ачаалалтын үеэр
   *    хуучнаараа үлддэг тул чигжээсүүд бүтэн өндрөөр зурагдаж, `scrollTop`
   *    хязгаарлагдахгүй.
   * ⚠️ Зөвхөн ИЖИЛ багцад — хооронд нь багц солигдвол хаяна.
   */
  const scrollKeepRef = useRef<{ pkg: string; top: number; left: number } | null>(null);
  const keepScroll = useCallback((key: string) => {
    const el = scrollRef.current;
    scrollKeepRef.current = el ? { pkg: key, top: el.scrollTop, left: el.scrollLeft } : null;
  }, []);
  useLayoutEffect(() => {
    const k = scrollKeepRef.current;
    if (!k || !rows.length) return;
    scrollKeepRef.current = null;
    const el = scrollRef.current;
    if (k.pkg !== pkg.key || !el) return;
    el.scrollTop = k.top;
    el.scrollLeft = k.left;
    recalcWin();
  }, [rows, pkg.key, recalcWin]);
  /* ⚠️ Засагдаж буй нүдний мөр цонхны ГАДНА байвал оролт таслагдана */
  const editVis = editCell ? vis.indexOf(Number(editCell.split(':')[0])) : -1;
  const winFrom = editVis >= 0 ? Math.min(win.from, editVis) : win.from;
  const winTo = editVis >= 0 ? Math.max(win.to, editVis + 1) : win.to;

  /* ══════════════ БАТЛАГДСАН ЧАНАРЫН БАРИМТ (толгойн ⚠️) ══════════════ */
  /** Бүх багцын батлагдсан MA · MIR · FIC (сүүлийн хувилбар); `null` = татаагүй */
  /* ⚠️ 2026-10-09: жагсаалт нь ТҮЛХҮҮРТЭЙ (`apKey` = багцын бүлэг + хүчингүйдлийн үе) —
     багц солигдох эсвэл `CHANAR_BARIMT` хүчингүй болоход ДАХИН татна (модулийн
     `approvedStaleSubs`-ийн ⚠️). Дахин татах хооронд ХУУЧИН жагсаалт харагдсаар —
     «✓» тэмдэг анивчихгүй. */
  const [apGen, setApGen] = useState(0);
  useEffect(() => {
    const fn = () => setApGen((n) => n + 1);
    approvedStaleSubs.add(fn);
    return () => { approvedStaleSubs.delete(fn); };
  }, []);
  const apKey = `${pkg.group}|${apGen}`;
  const apKeyRef = useRef(apKey);
  useSyncRef(apKeyRef, apKey);
  const [ap, setAp] = useState<{ key: string; list: ApprovedDoc[] } | null>(null);
  const approved = ap?.list ?? null;
  /** Татаж буй түлхүүр — ижил түлхүүрийг давхар татахгүй */
  const apLoading = useRef<string | null>(null);
  const ensureApproved = useCallback(() => {
    if (ap?.key === apKey || apLoading.current === apKey) return;
    const k = apKey;
    apLoading.current = k;
    /* ⚠️ Бүх хувилбараас ЗӨВХӨН сүүлийнх нь (`latest`), тэр нь approved байвал. */
    const kinds = new Set<DocKind>(Object.values(DOC_KIND_OF));
    loadAllDocs()
      .then((docs) => {
        /* Хуучирсан хариу — шинэ түлхүүрийн татац явж байгаа/явна */
        if (apKeyRef.current !== k) return;
        const list = latest(docs.filter((d) => kinds.has(d.kind)))
          .filter((d) => d.status === MS_STATUS.approved)
          .map((d) => ({ kind: d.kind, bagts: d.bagts, no: d.docNo, title: d.title }))
          .sort((a, b) => a.no.localeCompare(b.no, 'mn', { numeric: true }));
        setAp({ key: k, list });
      })
      .catch(() => { /* хуудсыг хаахгүй — жагсаалтгүйгээр чөлөөт текст хэвээр */ })
      .finally(() => { if (apLoading.current === k) apLoading.current = null; });
  }, [ap, apKey]);
  /* Харагдац нээгдэх · багц солих · хүчингүй болох бүрд; унасан бол дугаарын нүд нээхэд дахин */
  useEffect(() => { ensureApproved(); }, [ensureApproved]);
  useEffect(() => {
    if (editCell && docKindAt(Number(editCell.split(':')[1]))) ensureApproved();
  }, [editCell, ensureApproved]);
  /** Дугаар → баримт (энэ багц, тухайн төрөл); татаагүй бол `null` */
  const approvedHit = (di: number, v: string): ApprovedDoc | null => {
    const kind = docKindAt(di);
    if (!kind || !v || !approved) return null;
    const n = normNo(v);
    return approved.find((d) => d.kind === kind && d.bagts === pkg.group && normNo(d.no) === n) ?? null;
  };

  /* ══════════════ ЗАСВАР ══════════════ */
  const commit = (oid: number, di: number, raw: string) => {
    const v = raw.trim();
    const row = rows.find((r) => r.oid === oid);
    /* ⚠️ 2026-09-30: хадгалагдсан утгыг ч ЗАЙГҮЙГЭЭР жишнэ — оролт `trim` хийгддэг тул
       «MA-001 » гэж хадгалагдсан нүдийг зүгээр нээж хаахад «өөрчлөгдсөн» болж,
       «Хадгалах (N)» асаж, хадгалахад утга ЧИМЭЭГҮЙ дахин бичигддэг байв. */
    const cur = (row?.docs[di] ?? '').trim();
    const key = `${oid}:${di}`;
    /* ⚠️ 2026-09-28: дугаар нь батлагдсан баримттай таарч, хажуугийн `*_ner`
       нүд (дараагийн багана) ХООСОН бол нэрийг нь автоматаар бөглөнө — зөвхөн
       хадгалаагүй засварт, хэрэглэгч дараа нь өөрчилж болно. Бөглөгдсөн нэрийг
       ДАРАХГҮЙ.
       ⚠️ 2026-10-09: ЗӨВХӨН дугаар ӨӨРЧЛӨГДСӨН үед — урьд нь хадгалагдсан дугаартай
       нүдийг зүгээр нээж хаахад ч нэр автоматаар бөглөгдөж «Хадгалах (N)» асдаг байв. */
    const hit = v !== cur ? approvedHit(di, v) : null;
    const nameDi = hit && QAQC_COLS[di + 1]?.name.endsWith('_ner') ? di + 1 : -1;
    const nameKey = `${oid}:${nameDi}`;
    setPend((p) => {
      const n = { ...p };
      /* ⚠️ Хадгалагдсантай ИЖИЛ болж буцвал жагсаалтаас ХАСНА — эс бөгөөс
         «Хадгалах» товч огт өөрчлөлтгүй байхад идэвхжинэ. */
      if (v === cur) delete n[key];
      else n[key] = v;
      if (hit && nameDi >= 0) {
        const curName = nameKey in p ? p[nameKey] : (row?.docs[nameDi] ?? '');
        if (!curName.trim() && hit.title.trim()) n[nameKey] = hit.title.trim();
      }
      return n;
    });
  };

  /* ══════════════ НООРОГ — ХАДГАЛАХ ══════════════ */
  const [savedAt, setSavedAt] = useState<number | null>(null);
  /**
   * ⚠️ 2026-10-05: ЛОКАЛ ноорог бичигдсэнгүй (`saveDraftLS` → `false`). `true` үед
   *    «ноорог хадгалагдав hh:mm»-ийн ОРОНД анхааруулга гарна. Ref нь `persistLocal`-ийн
   *    сүүлийн үр дүн (эффект дотроос уншина), state нь зурагдах хувь.
   */
  const localOkRef = useRef(true);
  const [localFail, setLocalFail] = useState(false);
  /** Унасан алсын бичилтийг дахин оролдуулах цаг хэмжигч (flush-ийн ⚠️ 2026-10-05) */
  const remoteRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Сүүлийн алсын илгээлтийн агшин — дээд хүлээлтийн (60 сек) лавлах цэг */
  const lastRemoteRef = useRef(0);
  const [remoteTick, setRemoteTick] = useState(0);
  /** Явж буй алсын бичилт — устгахаас өмнө хүлээнэ (flush-ийн ⚠️) */
  const remoteInflight = useRef<Promise<unknown> | null>(null);
  /** `remoteVerifiedRef` — алсын ноорогийг АМЖИЛТТАЙ уншсан багц — зөвхөн тэр үед завсарлагатай
      flush алс руу бичнэ. (Зарлалт нь дээр, `remoteQueue`-ийн дэргэд.) */
  /** Алсын уншилтыг дахин оролдуулах тоолуур (сэргээх эффектийн deps) */
  const [restoreTry, setRestoreTry] = useState(0);
  /** Явж буй алсын бичилт дуусахыг хүлээнэ — алдааг үл тоох */
  const awaitRemoteInflight = useCallback(async () => {
    const p = remoteInflight.current;
    if (p) { try { await p; } catch { /* үл тоох */ } }
  }, []);

  /**
   * АЛСЫН ЭЭЛЖИЙГ ЗЭВСЭГГҮЙ БОЛГОНО — ноорог БАЙХГҮЙ болсны дараа дуудна.
   *
   * ⚠️ ЗОМБИ НООРОГ (2026-09-08): `save()` ба `dropDraft()` нь локал/алсын
   *    ноорогийг устгадаг ч `remoteQueue`-г цэвэрлэдэггүй, `remoteTick`-ийг ч
   *    хөндөггүй байсан тул доорх flush эффект ХУУЧИН тоолуураараа (12с/60с)
   *    армлагдсан хэвээр үлдэж, `q.pkg === pkg.key` шалгуурыг давж, устгасан
   *    ноорогийг 12 секундын дараа ArcGIS руу ДАХИН бичдэг байв. Дараагийн
   *    ачаалалтад тэр ноорог сэргээгдэж, хэрэглэгч хадгалсан ажлаа
   *    «хадгалагдаагүй» гэж дахин харах эсвэл санаатай хаясан засвараа
   *    устгаж чадахгүй болдог.
   * ⚠️ `setRemoteTick(0)` нь эффектийн cleanup-ыг ажиллуулж тоолуурыг
   *    салгана; `remoteTick === 0` үед эффект шинэ тоолуур ҮҮСГЭХГҮЙ.
   * ⚠️ `setRemoteState(null)` — ноорог байхгүй болсон тул НООРОГИЙН байдлын
   *    заалт (шар «ArcGIS-д хуулагдсангүй», «хэт том») харагдах ёсгүй. Тэр
   *    хоёр заалт `dirtyCount`-оор хаагддаггүй тул амжилттай хадгалсны дараа
   *    хоосон хуудсан дээр мөнхөд үлдэж, бичилтийг ХУДАЛ буруутгадаг байв.
   */
  const clearRemoteQueue = useCallback(() => {
    remoteQueue.current = null;
    setRemoteTick(0);
    setRemoteState(null);
  }, []);

  /**
   * УНАСАН алсын бичилтийг ~60 сек-ийн дараа дахин оролдуулна (48 сек + flush-ийн 12 сек
   * завсарлага) — flush-ийн ⚠️ 2026-10-05. Дараалал хоосон бол юу ч хийхгүй.
   * ⚠️ 2026-10-09: нэг газар — «алсыг уншиж чадаагүй» салаа ч ашиглана (flush-ийн ⚠️).
   */
  const armRemoteRetry = useCallback(() => {
    if (remoteRetryTimer.current) clearTimeout(remoteRetryTimer.current);
    remoteRetryTimer.current = setTimeout(() => {
      remoteRetryTimer.current = null;
      if (remoteQueue.current) setRemoteTick((n) => n + 1);
    }, 48_000);
  }, []);

  /** Одоогийн багц — асинхрон дуусгалт (булшны дахин дараалал) багц солигдсоныг мэдэх */
  const pkgKeyRef = useRef(pkg.key);
  useSyncRef(pkgKeyRef, pkg.key);
  /**
   * БУЛШНЫ БИЧИЛТ УНАВАЛ ДАРААЛАЛД БУЦААНА (⚠️ 2026-10-09).
   * ⚠️ Урьд нь «Хадгалах» ба «ноорог устгах»-ын дараах `saveQaqcDraft`-ийн үр дүнг
   *    ХАЯДАГ байв: сүлжээ түр тасарвал ArcGIS дээрх ноорог хадгалсан/хаясан нүдүүдээ
   *    АМЬД агуулсаар үлдэж, өөр компьютер дээр «хадгалаагүй засвар» болж буцаж
   *    амилдаг — дараа нь «Хадгалах» дарвал серверийн ШИНЭ утгыг ХУУЧНААР дарна.
   *    Одоо ердийн flush дарааллаар (12 сек завсарлага · 48 сек дахин оролдлого) явна.
   * ⚠️ Дараалалд ШИНЭ ноорог байвал ДАРАХГҮЙ — `persistLocal` нь табын төлөвийг (булш
   *    орно) локалтай нэгтгэдэг тул шинэ хуулбар эдгээр булшийг аль хэдийн агуулна.
   * ⚠️ Багц солигдсон бол дараалалд оруулахгүй (flush нь өөр багцынхыг хаядаг) —
   *    булш локалд бий; тэр багцыг дахин нээхэд сэргээлт (`draftIncludes`) илгээнэ.
   */
  const requeueRemote = useCallback((key: string, doc: Draft) => {
    if (pkgKeyRef.current !== key) return;
    if (!remoteQueue.current) remoteQueue.current = { pkg: key, draft: doc };
    setRemoteTick((n) => n + 1);
  }, []);

  /** ⚠️ 2026-10-01: ЛАМПОРТ агшин — `lib/qaqcDraft.ts`-ийн «ЦАГИЙН ЗӨРҮҮ» */
  const stamp = useCallback(() => {
    clockRef.current = nextStamp(clockRef.current, qaqcClockNow());
    return clockRef.current;
  }, []);

  /* ⚠️ 2026-09-30: `user?.username`-ийг урьдчилан авна — optional chain deps нь
     React Compiler-ийн memo-г эвддэг (доорх `save`-ийн ⚠️). 2026-10-01: зарлалтыг
     энд зөөв — `persistLocal` түүнийг ашиглана. */
  const uname = user?.username;
  /**
   * ТАБЫН ТӨЛӨВИЙГ ЛОКАЛ НООРОГТ НЭГТГЭЖ БИЧНЭ — ДАРАХГҮЙ (2026-10-01).
   *
   * ⚠️ Урьд нь `pend`-ээс шинэ ноорог үүсгээд localStorage-ийг ДАРДАГ байв.
   *    Тэгвэл (а) сэргээлт ArcGIS-ийн хариуг хүлээж байх хооронд бичсэн нүд
   *    локалын хараахан буулгаагүй ноорогийг устгадаг (таб тэр агшинд хаагдвал
   *    ажил алга), (б) ижил хөтчийн хоёр таб бие биенийхээ нүдийг дардаг. Одоо
   *    байгаа локал ноорогтой НҮД БҮРЭЭР нэгтгэнэ — арилгасан нүд нь булшаар
   *    ялна. Юу ч үлдээгүй бол слотыг цэвэрлэнэ.
   */
  const persistLocal = useCallback((pkgKey: string, rowsNow: QaqcRow[]): Draft | null => {
    const st = draftStRef.current;
    const need = new Set<number>();
    for (const k of st.cells.keys()) need.add(Number(k.slice(0, k.lastIndexOf(':'))));
    const rk = new Map<number, string>();
    for (const r of rowsNow) if (need.has(r.oid)) rk.set(r.oid, `${r.no} ¦ ${r.work}`);
    const mine = draftFromState(st, (o) => rk.get(o));
    const slot = dk(uname, pkgKey);
    const merged = mergeDraft(readDraft(slot), mine);
    /* ⚠️ 2026-10-05: бичилт унасан ч `merged`-ийг БУЦААНА — алсын хуулбар тэр үед цорын ганц */
    if (merged) localOkRef.current = saveDraftLS(slot, merged);
    else { clearDraftLS(slot); localOkRef.current = true; }
    return merged;
  }, [uname]);

  /**
   * «ноорог устгах» ба «Хадгалах»-ын дараа — `pend`-ийн БҮХ нүдийг ШУУД
   * булшилж локалд бичнэ, ArcGIS-д бичих баримтыг буцаана (2026-10-01).
   * ⚠️ Хадгалах эффектийг ХҮЛЭЭХГҮЙ: `save` дараа нь `load` дуудаж
   *    `loadedPkgRef`-ийг хоосолдог тул эффект тэр агшинд алгасна; мөн
   *    эффект хараахан хараагүй (дөнгөж commit хийсэн) нүдийг ч `pendNow`-оос
   *    булшилна. Дараа нь эффект ажиллахад `prevPendRef` аль хэдийн `{}` тул
   *    давхар булш үүсэхгүй.
   */
  /* ⚠️ 2026-10-09: `keep` — ЗӨРЧИЛТЭЙ (бичигдээгүй) нүд булшлагдахгүй, `pend`-д үлдэнэ
     (`save`-ийн «ЗЭРЭГ ЗАСВАР»). Дуудагч `setPend(keep)` хийнэ — `prevPendRef` түүнтэй тэнцүү. */
  const retirePend = useCallback((
    key: string,
    pendNow: Record<string, string>,
    rowsNow: QaqcRow[],
    keep: Record<string, string> = {},
  ): Draft | null => {
    const prev = { ...prevPendRef.current, ...pendNow };
    draftStRef.current = applyPendDiff(draftStRef.current, prev, keep, stamp).st;
    prevPendRef.current = keep;
    return persistLocal(key, rowsNow);
  }, [stamp, persistLocal]);

  useEffect(() => {
    /* ⚠️ ХУУЧИН БАГЦЫН ТӨЛӨВӨӨР ШИНЭ СЛОТ РУУ БИЧИХГҮЙ — багц солигдсон
       эхний render дээр `pkg.key` ШИНЭ, харин `pend` ХУУЧИН багцынх. */
    if (loadedPkgRef.current !== pkg.key) return;
    /*
     * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): АРИЛГАЛТ = БУЛШ, УСТГАЛ БИШ.
     *    Урьд нь `pend` хоосормогц локал ба ArcGIS-ийн ноорогийг УСТГАДАГ, нэг
     *    нүд арилгахад тэр нүдийг ноорогоос зүгээр л ХАСДАГ байв. Тэгвэл өөр
     *    төхөөрөмжийн (эсвэл энэ төхөөрөмжийн хуучин) ноорогт тэр нүд үлдсэн бол
     *    дараагийн нээлтэд «зөвхөн нэг талд байгаа нүд» болж БУЦАЖ амилдаг.
     *    Одоо `pend`-ийн шилжилтээс (`applyPendDiff`) нүд бүрийн агшин ба
     *    арилгасан нүдний БУЛШ тооцож, локалд нэгтгэж бичээд ArcGIS руу
     *    (бас нэгтгэж) илгээнэ. «Хадгалах» ба «ноорог устгах»-ын дараах
     *    хоосролт ч мөн булш — тэр хоёр зам өөрсдөө шууд бичнэ (доор).
     * ⚠️ 2026-09-06/09-30-ны «бүгдийг арилгасан → ноорог алга» зан ХЭВЭЭР:
     *    булш нь амьд нүдийг ялах тул ноорог ХООСОН харагдана; ArcGIS-ийн мөр
     *    нь булшнууд хуучрах хүртэл (30 хоног) үлдэнэ, эсвэл нэгтгэл хоосон
     *    болмогц `saveQaqcDraft` устгана.
     */
    const { st, changed } = applyPendDiff(draftStRef.current, prevPendRef.current, pend, stamp);
    draftStRef.current = st;
    prevPendRef.current = pend;
    const empty = !Object.keys(pend).length;
    if (empty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: ноорог хоосорсон тэр агшинд хадгалсан цагийг арилгана — localStorage/алсын бичилттэй нэг эффектэд
      setSavedAt(null);
    }
    if (!changed) return;
    /* Хоосорсон агшинд өмнөх ноорогийн «ArcGIS hh:mm» заалт шинэ засварт наалдахгүй */
    if (empty) setRemoteState(null);
    else setSavedAt(Date.now());
    const draft = persistLocal(pkg.key, rows);
    /* ⚠️ 2026-10-05: локал бичилт унасныг ИЛ харуулна (`localFail`-ийн ⚠️) */
    setLocalFail(!localOkRef.current);
    if (!draft) return;
    /* ⚠️ Алсад ЭНД ШУУД бичихгүй — нүд бүрийн товшилтод хүсэлт явбал
       сүлжээ дүүрч бөглөлт удаашрана. Доорх завсарлагатай эффект илгээнэ.
       ⚠️ Дараалалд ганцхан (хамгийн сүүлийн) хуулбар — хуучин нь солигдоно. */
    remoteQueue.current = { pkg: pkg.key, draft };
    setRemoteTick((n) => n + 1);
  }, [pend, pkg.key, rows, stamp, persistLocal]);

  /*
   * ── АЛСЫН ХУУЛБАР (2026-09-07-нд `FillNew`-тэй ТЭНЦҮҮЛЭВ) ──
   *
   * ⚠️ ЗАВСАРЛАГАА: бичихээ зогсоод 12 секунд өнгөрөхөд НЭГ удаа илгээнэ.
   *
   * ⚠️ ДЭЭД ХҮЛЭЭЛТ. 12 секунд нь ЗӨВХӨН debounce байсан тул тоолуур засвар
   * бүрд дахин эхэлдэг: 12 секундэд нэг нүд бөглөж 40 минут ажилласан хүний
   * ажил алсад ХЭЗЭЭ Ч хуулагдахгүй байв. Одоо сүүлийн илгээлтээс 60 секунд
   * өнгөрсөн бол завсарлагыг үл харгалзан илгээнэ.
   *
   * ⚠️ `pagehide` — iOS Safari ба bfcache-д `visibilitychange`-ээс ИЛҮҮ
   * найдвартай; таб хаагдах цорын ганц дохио байх тохиолдол бий.
   */
  useEffect(() => {
    if (!remoteTick) return undefined;
    const flush = () => {
      const q = remoteQueue.current;
      if (!q) return;
      /* ⚠️ ӨӨР БАГЦЫН ноорог бол ХАЯНА, бичихгүй: дараалалд үлдсэн хуучин
         багцын ноорогийг одоогийн багцын слотод бичих нь өгөгдөл СОЛИХ
         алдаа. Локалд аль хэдийн бүрэн хадгалагдсан тул алдагдал үүсэхгүй. */
      if (q.pkg !== pkg.key) { remoteQueue.current = null; return; }
      /* ⚠️ АЛСЫГ УНШИЖ ЧАДААГҮЙ бол БИЧИХГҮЙ (2026-09-25-ны аудит) — тэнд
         өөр компьютерийн ноорог байж болох тул дарвал алга болно. Уншилтыг
         дахин оролдуулна (`restoreTry`); амжилттай бол нийлүүлээд бичнэ. */
      if (remoteVerifiedRef.current !== q.pkg) {
        /* ⚠️ 2026-10-09: ДАХИН ОРОЛДЛОГЫГ ЭНД Ч АРМЛАНА (`armRemoteRetry`). Урьд нь энэ
           салаа зөвхөн уншилтыг дахин эхлүүлдэг байсан тул дараалалд үлдсэн хуулбар
           дараагийн нүдний засвар хүртэл ХЭЗЭЭ Ч явдаггүй байв (уншилт дахин унавал,
           эсвэл амжилттай ч сэргээлт шинэ дараалал үүсгээгүй бол) — заалтын tooltip
           «автоматаар үргэлжилнэ» гэж амладаг атал. Уншилт явж байх үед ч армлана:
           тэр уншилт унавал дахин flush хийх өөр дохио байхгүй. */
        armRemoteRetry();
        /* Уншилт явж байгаа бол (тэмдэг тавигдсан) зүгээр хүлээнэ — дараалал үлдэнэ */
        if (promptedPkgRef.current === q.pkg) return;
        setRemoteState({ kind: 'fail' });
        /* Дахин уншилтыг минутад нэгээс олон оролдохгүй (оффлайн үед toast-ын шуурга) */
        if (Date.now() - lastRemoteRef.current >= 60_000) {
          lastRemoteRef.current = Date.now();
          setRestoreTry((n) => n + 1);
        }
        return;
      }
      /* ⚠️ Дараалал ЦЭВЭРЛЭГДЭНЭ — эс бөгөөс нэг ноорог дахин дахин
         илгээгдэж, устгасны дараа ч ArcGIS-д буцаж амилна (зомби). */
      remoteQueue.current = null;
      lastRemoteRef.current = Date.now();
      /* ⚠️ ЯВЖ БУЙ БИЧИЛТИЙГ ХАДГАЛНА (2026-09-25-ны аудит): «Хадгалах»/«Ноорог
         устгах» нь алсад бичихээсээ ӨМНӨ үүнийг хүлээнэ.
         ⚠️ 2026-10-01: хэмжээг `saveQaqcDraft` өөрөө шалгана (`'big'`) — ArcGIS
         дээрхтэй НЭГТГЭСНИЙ дараах хэмжээ л үнэн; хуучирсан булш эхэлж хаягдана. */
      const inflight = saveQaqcDraft(q.pkg, q.draft).then((res) => {
        /* Багц солигдсон бол хуучин хариугаар шинэ багцын төлөвийг бичихгүй */
        if (loadedPkgRef.current !== q.pkg) return;
        setRemoteState(res === 'ok' ? { kind: 'ok', at: Date.now() } : res === 'big' ? { kind: 'big' } : { kind: 'fail' });
        /* ⚠️ 2026-10-05: УНАСАН бичилтийг ДАРААЛАЛД БУЦААНА. Урьд нь дараалал илгээхийн
           өмнө цэвэрлэгддэг тул унасан ноорог дараагийн нүдний засвар хүртэл ХЭЗЭЭ Ч дахин
           явдаггүй байв (заалтын tooltip «автоматаар үргэлжилнэ» гэдэг атал). Шинэ ноорог
           аль хэдийн дараалалд орсон бол түүнийг ДАРАХГҮЙ. ~60 сек-ийн дараа дахин
           (48 сек + эффектийн 12 сек завсарлага) — оффлайн үед хүсэлтийн шуурга үүсгэхгүй.
           ⚠️ Ноорогийн бичилт нь «уншаад нэгтгээд бичих» (`writeQaqcDraft`) тул давтахад
           аюулгүй; «big» давтагдахгүй (хэмжээ өөрөө багасахгүй). */
        if (res === 'fail') {
          if (!remoteQueue.current) remoteQueue.current = q;
          armRemoteRetry();
        }
      });
      remoteInflight.current = inflight;
      void inflight.finally(() => { if (remoteInflight.current === inflight) remoteInflight.current = null; });
    };
    flushRef.current = flush;
    const t = setTimeout(flush, 12_000);
    const since = Date.now() - lastRemoteRef.current;
    const cap = since >= 60_000
      ? setTimeout(flush, 0)
      : setTimeout(flush, Math.max(0, 60_000 - since));
    /* ⚠️ 2026-10-09: `pagehide` ДЭЭРХ flush ДУУСАХ БАТАЛГААГҮЙ — хүлээн зөвшөөрсөн хязгаар.
       `saveQaqcDraft` нь «уншаад → нэгтгээд → applyEdits» гэсэн ХЭД ХЭДЭН хүсэлт (arcgis
       SDK-гаар) бөгөөд `fetch keepalive`/`sendBeacon` ганц, жижиг (≤64KB) хүсэлтэд л
       зориулагдсан тул таб хаагдах агшинд эхэлсэн бичилт ихэвчлэн тасарна. Иймд ГОЛ зам
       нь `visibilitychange` → `hidden`: таб нуугдах (өөр таб, апп солих, хаахын өмнөх
       алхам) мөчид ДАРУЙ (12 сек хүлээхгүй) илгээж эхэлнэ — хуудас амьд хэвээр тул
       хүсэлт дуусах боломжтой. `pagehide` нь нөөц дохио (iOS/bfcache). Тасарсан ч ажил
       ЛОКАЛ ноорогт бүтэн; дараагийн нээлтэд сэргээлт (`draftIncludes`) алсад нөхөж бичнэ. */
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      clearTimeout(t); clearTimeout(cap);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [remoteTick, pkg.key, armRemoteRetry]);

  /* ⚠️ 2026-10-05: САЛГАХАД (харагдац солих) дараалалд үлдсэн ноорогийг ИЛГЭЭНЭ. Дээрх
     эффектийн цэвэрлэгээ зөвхөн цаг хэмжигчийг зогсоодог тул сүүлийн ≤12 секундын бөглөлт
     алсад хуулагдахгүй үлддэг байв (локалд бий, өөр компьютерт үгүй). Хоосон deps —
     ЗӨВХӨН unmount; `flushRef` нь хамгийн сүүлийн багцын `flush`. */
  useEffect(() => () => {
    if (remoteRetryTimer.current) { clearTimeout(remoteRetryTimer.current); remoteRetryTimer.current = null; }
    flushRef.current?.();
  }, []);

  /* ══════════════ НООРОГ — СЭРГЭЭХ ══════════════ */


  useEffect(() => {
    if (loadedPkgRef.current !== pkg.key || !rows.length) return;
    if (promptedPkgRef.current === pkg.key) return;
    const key = pkg.key;
    promptedPkgRef.current = key;
    let alive = true;
    /* ⚠️ ДУУССАН ЭСЭХ (2026-09-25-ны аудит): урьд нь уншилт дуусахаас өмнө
       deps (`canEdit` · `rows` · `show`) өөрчлөгдвөл шинэ ажиллагаа
       `promptedPkgRef`-ийг тавьсан хэвээр харж ШУУД буцаж, хуучин нь `!alive`
       дээр тэмдгийг хоослох ч дахин ажиллуулах юм үгүй — сэргээлт МӨНХӨД
       алгасагддаг байв. Одоо cleanup (дараагийн ажиллагааны ӨМНӨ ажилладаг)
       дуусаагүй бол тэмдгийг хоослоно. */
    let finished = false;

    const run = async () => {
      const local = readDraft(dk(user?.username, key));
      /* ⚠️ ЛОКАЛ ба АЛСЫН хоёрыг АГШНААР харьцуулж ШИНИЙГ нь сонгоно —
         хуучныг тавибал өөр машин дээрх шинэ ажил чимээгүй дарагдана.
         (2026-10-01: ноорог бүхлээр биш, НҮД БҮРИЙН агшнаар — доор.) */
      /*
       * ⚠️ УНШИЛТЫН АЛДААГ ЯЛГАНА (2026-09-07, `FillNew`-тэй ижил засвар).
       * «Ноорог БАЙХГҮЙ» ба «уншиж ЧАДСАНГҮЙ» хоёрыг `null`-аар нэгтгэвэл
       * сүлжээний түр саат нь бөглөсөн ажлыг АЛГА БОЛСОН мэт харуулна.
       * Унавал ИЛ хэлж, `promptedPkgRef`-ийг хоослон дахин оролдох замыг
       * нээнэ.
       */
      const rr = await readQaqcDraft(key);
      /* ⚠️ Багц солигдсон/deps өөрчлөгдсөн бол тэмдгийг cleanup аль хэдийн хоосолсон (дээрх `finished`) */
      if (!alive) return;
      /* ⚠️ АЛСЫН БИЧИЛТИЙН ЗӨВШӨӨРӨЛ (2026-09-25-ны аудит): алсын ноорогийг
         АМЖИЛТТАЙ уншсаны дараа л алс руу бичих/устгахыг зөвшөөрнө. Урьд нь
         уншилт унасан ч локал ноорог буугаад завсарлагатай эффект түүнийг
         алсад бичиж, өөр компьютерийн (уншиж чадаагүй) ноорогийг ДАРДАГ байв. */
      if (rr.ok) remoteVerifiedRef.current = key;
      if (!rr.ok) {
        promptedPkgRef.current = '';
        show('warn', tr(
          'Алсын ноорогийг уншиж чадсангүй ({0}). Энэ компьютерийн ноорог хэвээр — өөр газраас бөглөсөн ажил байвал сүлжээ сэргэсний дараа хуудсыг дахин ачаална уу.',
          rr.error,
        ));
      }
      const rem = rr.ok ? rr.draft : null;
      const remD = rem ? parseDraft(rem.payload, 'remote') : null;
      /*
       * ⚠️ НИЙЛҮҮЛНЭ, СОНГОХГҮЙ (2026-09-15-ны аудит) — урьд нь НЭГИЙГ нь
       *    бүхэлд нь авдаг байсан тул оффисын компьютер дээр 30 нүд бөглөөд
       *    (алсад хуулагдсан) гэртээ 5 нүд бөглөвөл гэрийнх шинэ тул оффисын
       *    30 нүд БҮХЭЛДЭЭ, ямар ч анхааруулгагүй хаягддаг байв.
       * ⚠️ 2026-10-01: ноорогийн ерөнхий агшнаар биш НҮД БҮРЭЭР (`mergeQaqcDrafts`)
       *    — нүд бүрийн өөрийн агшин их нь ялна, БУЛШ (өөр төхөөрөмж дээр
       *    арилгасан нүд) хуучин утгыг ялна.
       */
      const pick = mergeDraft(local, remD);
      /* ⚠️ 2026-09-30: СЭРГЭЭХ ЗҮЙЛГҮЙ — юу ч хийхгүй. 2026-10-01: урьдын
         `restoreDoneRef` тэмдэг хасагдсан (хадгалах эффект устгахаа больсон). */
      if (!pick) return;
      /*
       * ⚠️ ЭРХГҮЙ ҮЕД НООРОГ УСТГАХГҮЙ (2026-09-07). Эрх түр алдагдсан (эсвэл
       * `caps`/`acl` хараахан ачаалагдаагүй) агшинд ноорогийг ЛОКАЛ ба АЛСАД
       * бүрмөсөн устгадаг байв. Ноорог нь нийтлээгүй ажил тул эрх сэргэхэд
       * эргэж ирэх ЁСТОЙ — тиймээс хүлээн авалт (булш ч) эрхийн ДАРАА.
       */
      /* ⚠️ Эрх хараахан ирээгүй бол ДАХИН оролдох замыг нээнэ (2026-09-17): урьд нь
         `promptedPkgRef` тавигдчихсан тул caps хожуу ирэхэд сэргээлт дахин
         ажиллахгүй, нэг нүд бичмэгц ноорог бүхэлдээ дарагддаг байв. */
      if (!canEdit) { promptedPkgRef.current = ''; return; }

      /* ⚠️ Мөр нь БАЙГАА эсэхийг шалгана: хүснэгт AGOL дээр дахин үүсгэгдвэл
         ObjectID гулсах бөгөөд ноорог буруу ажилд буух ёсгүй. Танигч
         хадгалагдсан бол түүнийг ч тулгана. */
      const byOid = new Map(rows.map((r) => [r.oid, r]));
      const fits = (k: string, want: string | undefined) => {
        const cut = k.lastIndexOf(':');
        const r = byOid.get(Number(k.slice(0, cut)));
        const di = Number(k.slice(cut + 1));
        return !!r
          && Number.isInteger(di) && di >= 0 && di < QAQC_COLS.length
          && (want == null || want === `${r.no} ¦ ${r.work}`);
      };
      /* ⚠️ 2026-10-09: СЕРВЕРТ АЛЬ ХЭДИЙН БАЙГАА утгатай нүд — ноорогт орохгүй, булшлагдана
         (`adoptQaqcDraft`-ийн `isSaved`). Урьд нь өөр төхөөрөмж дээр хадгалагдсан ч булш нь
         энд хүрээгүй хуучин ноорог «Хадгалах (N)»-ийг хөөрөгддөг байв. Жишилт `commit`-ийн
         ижил (`trim`). Утга нь ӨӨР бол хадгалах үеийн зөрчлийн шалгалт (`qaqcConflicts`) хамгаална. */
      const saved = (k: string, v: string) => {
        const cut = k.lastIndexOf(':');
        const r = byOid.get(Number(k.slice(0, cut)));
        return !!r && v.trim() === (r.docs[Number(k.slice(cut + 1))] ?? '').trim();
      };
      /* ⚠️ 2026-10-01: Лампорт — ХАРСАН агшнаас хойш л шинэ агшин тавина (хэрэглэгч
         харсан утгаа засаж/арилгавал түүний үйлдэл ялна, цаг зөрсөн ч). */
      clockRef.current = Math.max(clockRef.current, pick.t);
      /* ⚠️ 2026-10-01: ТАБЫН ТӨЛӨВТ хүлээн авна — сэргээлтийг хүлээх хооронд энэ табад
         бичсэн/арилгасан нүд ялна; тохирохгүй нүд булшлагдана (`adoptQaqcDraft`). */
      const ad = adoptQaqcDraft(pick, draftStRef.current, fits, stamp, saved);
      draftStRef.current = ad.st;
      const { count, dropped, cells } = ad;
      /* ⚠️ 2026-10-01: нэгтгэлийг локалд бичиж, ArcGIS-д ДУТУУ зүйл (энэ төхөөрөмж
         дээр л байсан нүд/булш, орхигдсон нүдний булш) байвал илгээнэ — эс бөгөөс
         оффлайн үед арилгасан нүд ArcGIS дээр амьд үлдэж, өөр төхөөрөмжид буцаж ирнэ. */
      const stored = persistLocal(key, rows);
      if (rr.ok && stored && !draftIncludes(remD, stored)) {
        remoteQueue.current = { pkg: key, draft: stored };
        setRemoteTick((n) => n + 1);
      }
      /**
       * ⚠️ АСУУХГҮЙ, ШУУД БУУЛГАНА (2026-09-06, хэрэглэгчийн заавар:
       *    «ноорог асуухгүй шууд орж ирнэ»). Урьд нь «Хадгалаагүй засвар
       *    байна» цонх гарч, «Сэргээх» дарж байж ажил эргэж ирдэг байв —
       *    ноорог нь ХЭРЭГЛЭГЧИЙН ӨӨРИЙНХ нь бичсэн зүйл тул зөвшөөрөл
       *    асуух нь нэмэлт алхам болохоос хамгаалалт биш.
       * ⚠️ Үйлчилгээнд БИЧИГДЭХГҮЙ хэвээр: «Хадгалах» дарж байж бичигдэнэ.
       *    Тиймээс автоматаар буулгах нь өгөгдөлд эрсдэлгүй.
       */
      /* ⚠️ НИЙЛҮҮЛНЭ, солихгүй: алсын уншилтыг хүлээх хооронд бичсэн нүд үлдэнэ */
      if (count) setPend((cur) => ({ ...cells, ...cur }));
      /* ⚠️ Тохирохгүй нүд гарвал ЧИМЭЭГҮЙ орхихгүй — хэдэн нүд
         яагаад алга болсныг хэлнэ. */
      if (dropped) {
        show('warn', count
          ? tr('Ноорог сэргээв: {0} нүд. {1} нүд хуучирсан тул орхигдов.', count, dropped)
          : tr('QAQC хүснэгт дахин үүсгэгдсэн тул ноорогийн {0} нүд одоогийн мөрүүдэд тохирсонгүй.', dropped));
      } else if (count) {
        show('ok', tr('Хадгалаагүй {0} нүдийг ноорогоос сэргээв. «Хадгалах» дарж үйлчилгээнд бичнэ.', count));
      }
    };
    void run().finally(() => { finished = true; });

    return () => {
      alive = false;
      if (!finished && promptedPkgRef.current === key) promptedPkgRef.current = '';
    };
  }, [rows, pkg.key, canEdit, show, user?.username, restoreTry, stamp, persistLocal]);

  /**
   * ОЛОН НҮДЭНД БУУЛГАХ — Excel-ээс хуулсан блокийг нэг дор бичнэ.
   *
   * ⚠️ Бөглөх хуудасны `pasteBlock`-той ижил зарчим (2026-09-06): байрлал нь
   *    ХАРАГДАЖ БУЙ мөрүүдээр (`vis`) явна; хальсан ба хоосон нүд байрлалаа
   *    ЭЗЭЛНЭ — эс бөгөөс доорх утга гулсаж, акт өөр ажилд бичигдэнэ.
   * ⚠️ Ганц нүдний буулгалтыг хөтөчид нь үлдээнэ: нүд нээлттэй үеийн ердийн
   *    зан үйл илүү таатай.
   * ⚠️ ЭРХГҮЙ үед ЧИМЭЭГҮЙ бүтэлгүйтэхгүй — шалтгааныг хэлнэ.
   */
  const pasteBlock = (vi: number, di: number, text: string): boolean => {
    const grid = parseGrid(text);
    if (!grid.length) return false;
    if (grid.length === 1 && grid[0].length === 1) return false;
    if (!canEdit) { say(RO_CAP); return true; }
    /* ⚠️ 2026-09-30: хадгалах явцад буулгахгүй (нүдний `onClick`-ийн ⚠️) */
    if (busy) { say(RO_BUSY()); return true; }
    const { hits, skipped } = planQaqcPaste(rows, vis, vi, di, grid);
    if (!hits.length) {
      show('warn', tr('Буулгасан {0} нүдийн аль нь ч хүснэгтэд тохирсонгүй.', skipped));
      return true;
    }
    setPend((p) => {
      const n = { ...p };
      for (const hit of hits) {
        const key = `${hit.oid}:${hit.di}`;
        /* ⚠️ 2026-09-30: зайгүйгээр жишнэ — `commit`-ийн ижил засвар */
        const cur = (rows.find((r) => r.oid === hit.oid)?.docs[hit.di] ?? '').trim();
        /* ⚠️ Хадгалагдсантай ИЖИЛ утга ноорогт орохгүй — `commit`-ийн ижил дүрэм */
        if (hit.v === cur) delete n[key];
        else n[key] = hit.v;
      }
      return n;
    });
    setEditCell(null);
    show('ok', skipped
      ? tr('{0} нүд буулгав. {1} нүд хүснэгтэд багтсангүй.', hits.length, skipped)
      : tr('{0} нүд буулгав.', hits.length));
    return true;
  };

  /**
   * ENTER/TAB — БАГАНАДАА дараагийн мөр рүү (бөглөх хуудасны зан үйл).
   * ⚠️ Хулгана шаардахгүйгээр олон мөрийг дараалан бөглөх цорын ганц зам.
   * ⚠️ Shift дарвал ДЭЭШЭЭ; жагсаалтын зах дээр нүд хаагдана.
   */
  const stepCell = (vi: number, di: number, dir: 1 | -1) => {
    const nv = vi + dir;
    if (nv < 0 || nv >= vis.length) return setEditCell(null);
    setEditCell(`${vis[nv]}:${di}`);
  };

  /**
   * НООРОГ УСТГАХ — энэ хөтөч ба ArcGIS дээрх хуулбар хоёулаа.
   * ⚠️ Баталгаа асууна: ноорог бол хэрэглэгчийн БИЧСЭН ажил бөгөөд буцаах
   *    зам байхгүй (түүх хадгалагддаггүй).
   * ⚠️ Үйлчилгээнд бичигдсэн утга ХӨНДӨГДӨХГҮЙ — зөвхөн хадгалаагүй засвар.
   */
  const dropDraft = useCallback(() => {
    if (!dirtyCount) return;
    const q = tr(
      '{0} нүдийн хадгалаагүй засвар УСТАНА. Үйлчилгээнд бичигдсэн утга хөндөгдөхгүй. Үргэлжлүүлэх үү?',
      dirtyCount,
    );
    if (!window.confirm(q)) return;
    setPend({});
    setEditCell(null);
    /* ⚠️ 2026-10-01: УСТГАХГҮЙ — БУЛШЛАНА. Урьд нь локал ба ArcGIS-ийн ноорогийг
       устгадаг байсан тул өөр төхөөрөмжийн хуучин хуулбар хаясан нүдийг буцааж
       амилуулдаг байв. Одоо бүх нүд булш болж локалд, ArcGIS-д НЭГТГЭЖ бичигдэнэ. */
    const key = pkg.key;
    const doc = retirePend(key, pend, rows);
    clearRemoteQueue();
    /* ⚠️ Явж буй алсын бичилтийг хүлээгээд бичнэ (flush-ийн ⚠️, 2026-09-25).
       ⚠️ 2026-10-09: унавал ДАРААЛАЛД буцаана (`requeueRemote`-ийн ⚠️) — урьд нь үр дүн хаягддаг байв. */
    if (doc) {
      void awaitRemoteInflight()
        .then(() => saveQaqcDraft(key, doc))
        .then((res) => { if (res !== 'ok') requeueRemote(key, doc); });
    }
    show('ok', tr('Ноорог устгав.'));
  }, [dirtyCount, pkg.key, pend, rows, show, clearRemoteQueue, retirePend, awaitRemoteInflight, requeueRemote]);

  /* ══════════════ ХАДГАЛАХ ══════════════ */
  /* ⚠️ 2026-09-30: `RO_CAP` нь render бүрд `capsRemoteReady()` дууддаг (санаатай —
     эрхийн remote бэлэн эсэх) тул React Compiler түүнээс хамаарсан memo-г хадгалж
     чадахгүй байв — сүүлийн (дэлгэцэн дээрх) мессежийг ref-ээр уншина; `user?.username`
     мөн адил (optional chain deps) — урьдчилан `uname`-д авна (2026-10-01: зарлалт нь
     дээр, `persistLocal`-ийн дэргэд). Үйлдэл ижил. */
  const roCapRef = useRef(RO_CAP);
  useSyncRef(roCapRef, RO_CAP);
  const save = useCallback(async () => {
    if (busy || !dirtyCount) return;
    if (!canEdit) {
      setErr(roCapRef.current);
      return;
    }
    const byOid = new Map(rows.map((r) => [r.oid, r]));
    /** Нүдийг хэрэглэгчид нэрлэнэ — «№ · багана» (№ хоосон бол ажлын нэр) */
    const cellName = (oid: number, di: number) => {
      const r = byOid.get(oid);
      const at = r ? (r.no || r.work.slice(0, 40)) : `#${oid}`;
      return `${at} · ${QAQC_COLS[di]?.short ?? di}`;
    };
    /** Эхний 5-ыг нэрлээд үлдсэнийг тоогоор */
    const listOf = (items: string[]) =>
      items.slice(0, 5).join('; ') + (items.length > 5 ? ` ${tr('… бас {0}', items.length - 5)}` : '');
    /* ⚠️ 2026-10-09: ТАЛБАРЫН УРТ — сүлжээнд гарахаас ӨМНӨ, нүдээр нь нэрлэнэ (`qaqcTooLong`-ийн
       ⚠️). Урьд нь ArcGIS-ийн ерөнхий алдаагаар бүх хадгалалт унаж, аль нүд гэдэг нь
       тодорхойгүй байв. Засвар `pend`-д хэвээр — хэрэглэгч тэр нүдийг богиносгоод дахин дарна. */
    const long = qaqcTooLong(pend, maxLen);
    if (long.length) {
      setErr(tr(
        '{0} нүдний утга талбарын дээд уртаас хэтэрсэн тул юу ч хадгалсангүй: {1}. Богиносгоод дахин «Хадгалах» дарна уу.',
        long.length,
        listOf(long.map((x) => `${cellName(x.oid, x.di)} (${x.len}/${x.max})`)),
      ));
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const known = new Set(rows.map((r) => r.oid));
      const { skipped } = qaqcUpdates(pend, known);
      /* ⚠️ Нэг ч түлхүүр таарахгүй бол ЗОГСООНО. Чимээгүй алгасвал
         «хадгаллаа» гэж худал мэдээлж, бөглөсөн акт алга болно. */
      if (skipped.length) {
        throw new Error(
          tr('{0} нүд хуудасны мөрүүдэд таарсангүй (хүснэгт хооронд нь шинэчлэгдсэн байж магадгүй). Хуудсыг дахин ачаална уу — засвар хадгалагдаагүй.', skipped.length),
        );
      }
      /*
       * ⚠️ 2026-10-09: ЗЭРЭГ ЗАСВАРЫН ХАМГААЛАЛТ (`qaqcConflicts`-ийн ⚠️). Бичихийн ӨМНӨ
       *    хөндөх мөрүүдийн 9 баганыг серверээс дахин уншиж, ачаалах үед харсан утгаас
       *    (`rows[].docs`) ӨӨРЧЛӨГДСӨН нүдийг БИЧИХГҮЙ: тэд `pend`-д (ноорогт) үлдэж,
       *    мөр/баганаар нэрлэгдэнэ. Дахин ачаалалтын дараа суурь нь шинэ утга болох
       *    тул хэрэглэгч шалгаад ДАХИН «Хадгалах» дарвал өөрийн утгаар дарна — энэ нь
       *    санаатай сонголт (чимээгүй дарахаас ялгаатай).
       * ⚠️ Уншилт унавал (сүлжээ) юу ч бичихгүй — `catch` → `pend` хэвээр.
       * ⚠️ Уншилт ба бичилтийн хоорондох миллисекундын цонх үлдэнэ (ArcGIS-д нөхцөлт
       *    `applyEdits` байхгүй) — гэхдээ «ачаалснаас хойш минут/цаг» гэсэн гол эрсдэл хаагдана.
       */
      const touched = [...new Set(Object.keys(pend).map((k) => Number(k.slice(0, k.lastIndexOf(':')))))];
      const live = await fetchQaqcDocs(pkg.key, touched);
      const conflicts = qaqcConflicts(pend, new Map(rows.map((r) => [r.oid, r.docs])), live);
      const held = new Set(conflicts.map((c) => c.key));
      const keep: Record<string, string> = {};
      const write: Record<string, string> = {};
      for (const [k, v] of Object.entries(pend)) (held.has(k) ? keep : write)[k] = v;
      const { updates } = qaqcUpdates(write, known);
      const n = updates.length ? await saveQaqc(pkg.key, updates) : 0;
      setPend(keep);
      setEditCell(null);
      /* ⚠️ 2026-10-01: ХАДГАЛСАН НҮД → БУЛШ (устгал биш). Урьд нь ArcGIS-ийн ноорогийг
         устгадаг байсан тул (а) өөр төхөөрөмжийн хуучин локал ноорог хадгалсан нүдийг
         «хадгалаагүй засвар» болгож буцааж амилуулдаг — дараа нь «Хадгалах» дарвал
         ШИНЭ утгыг ХУУЧНААР дарна; (б) энэ төхөөрөмж хараахан хараагүй өөр
         төхөөрөмжийн нүд ч хамт устдаг байв. Одоо зөвхөн хадгалсан нүд булшлагдаж,
         ArcGIS-д НЭГТГЭЖ бичигдэнэ — бусад нь үлдэнэ. Нэгтгэл нь хамгаалалт тул
         урьдын «алсыг уншиж чадаагүй бол хөндөхгүй» нөхцөл ЭНД шаардлагагүй. */
      /* ⚠️ 2026-10-09: ЗӨРЧИЛТЭЙ нүд (`keep`) булшлагдахгүй — ноорогт амьд үлдэнэ */
      const doc = retirePend(pkg.key, pend, rows, keep);
      /* ⚠️ Эхлээд дараалал (2026-09-17) — хуучин хуулбар дараа нь бичигдэхгүй */
      clearRemoteQueue();
      /* ⚠️ Явж буй алсын бичилтийг ХҮЛЭЭНЭ (2026-09-25-ны аудит) */
      await awaitRemoteInflight();
      /* ⚠️ 2026-10-09: булшны бичилт унавал ДАРААЛАЛД буцаана (`requeueRemote`-ийн ⚠️) */
      if (doc) {
        const res = await saveQaqcDraft(pkg.key, doc);
        if (res !== 'ok') requeueRemote(pkg.key, doc);
      }
      /* ⚠️ Хадгалсны дараа ЗААВАЛ дахин татна: хооронд нь өөр хүн бөглөсөн
         байж болно. Дэлгэц ба өгөгдөл зөрвөл дараагийн засвар хуучин суурин
         дээр явна. ⚠️ 2026-10-01: гүйлгэлтийн байрлалыг хадгална (`keepScroll`). */
      keepScroll(pkg.key);
      await load(pkg.key);
      if (n) done(tr('{0} мөр хадгалагдлаа.', n));
      /* ⚠️ 2026-10-09: зөрчлийг `load`-ын ДАРАА тавина (`load` нь `err`-ийг арчдаг — catch-ийн ⚠️) */
      if (conflicts.length) {
        setErr(tr(
          '{0} нүдийг ачаалснаас хойш өөр хэрэглэгч өөрчилсөн тул бичсэнгүй — таны засвар хадгалаагүй хэвээр үлдэв: {1}. Шинэ утгыг шалгаад дахин «Хадгалах» дарвал таны утгаар солигдоно.',
          conflicts.length,
          listOf(conflicts.map((c) => `${cellName(c.oid, c.di)} (${
            c.gone ? tr('мөр устгагдсан') : tr('одоо: «{0}»', (c.live ?? '').trim() || '—')
          })`)),
        ));
      }
    } catch (e) {
      /* ⚠️ Хагас бичигдсэн байж болзошгүй тул дэлгэцийг СЕРВЕРЭЭС сэргээнэ.
         ⚠️ ЭХЛЭЭД ачаална, ДАРАА нь алдааг тавина (2026-09-25-ны аудит, HIGH):
         `load` эхэндээ `setErr('')` дууддаг тул урьд нь алдаа тэр дор нь
         арчигдаж, хадгалалт унасныг хэрэглэгч огт харахгүй байв. */
      const msg = userError(e);
      keepScroll(pkg.key);
      await load(pkg.key);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }, [busy, dirtyCount, canEdit, rows, pend, maxLen, pkg.key, load, done, clearRemoteQueue, retirePend, keepScroll, awaitRemoteInflight, requeueRemote]);

  /* Ctrl+S — бөглөх хуудастай ижил */
  /* ⚠️ НЭЭЛТТЭЙ НҮДИЙГ ЭХЛЭЭД COMMIT (2026-09-25 аудит): нүдний текст зөвхөн
     blur/Enter/Tab-аар `pend`-д ордог тул нүднээс гаралгүй Ctrl+S дарахад
     бичиж буй утга хадгалагдалгүй «N мөр хадгалагдлаа» гэж гарч, дахин
     ачаалалт оролтыг устгадаг байв. Одоо оролтыг blur хийж (`onBlur` → `commit`),
     `pend` шинэчлэгдсэний ДАРААХ render-ийн `save`-ийг доорх эффект дуудна. */
  const saveAfterCommit = useRef(false);
  useEffect(() => {
    if (!saveAfterCommit.current) return;
    saveAfterCommit.current = false;
    void save();
  }, [save]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && tbodyRef.current?.contains(el)) {
        /* `commit` нь `setPend`-ийг ҮРГЭЛЖ шинэ объектоор дууддаг тул `save`
           шинэчлэгдэж, дээрх эффект заавал ажиллана. */
        saveAfterCommit.current = true;
        el.blur();
        return;
      }
      void save();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [save]);

  /* ⚠️ Хадгалаагүй засвартай байхад таб хаагдвал ажил алга болно */
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (!Object.keys(pend).length) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [pend]);

  /** Багц солиход хадгалаагүй засвар байвал баталгаа авна */
  const confirmSwitch = () =>
    dirtyCount === 0
    || window.confirm(tr('{0} нүд хадгалагдаагүй байна. Ноорог үлдэх ч багц солиход дэлгэцээс арилна. Үргэлжлүүлэх үү?', dirtyCount));

  /* ══════════════ ЗУРАГДАЛТ ══════════════ */

  /*
   * ⚠️ ХУУДАС ХААХ ЗАМ 2026-09-09-нд ХАСАГДСАН. Урьд нь хуваарилагдаагүй
   *    хүнд `groupOpts` хоосон болж, ЭНД хуудас бүхэлдээ хаагддаг байв —
   *    гэтэл `canEdit`-ийн тайлбар «Эрхгүй хүн хуудсыг ХАРНА, зөвхөн
   *    засахгүй» гэж эсрэгээр бичигдсэн байлаа. Одоо бүх багц харагдаж,
   *    засах эрхийг `canEdit` тухайн БАГЦААР шийднэ (доорх `RO_CAP` мөр
   *    шалтгааныг ил хэлнэ).
   */

  const noTable = qaqcTableOf(pkg.key) == null;

  return (
    <div className={st.wrap}>
      <div className={st.toolbar}>
        <label className={st.field}>
          {tr('Багц')}{' '}
          <select
            className={st.select}
            value={pkg.group}
            disabled={busy}
            onChange={(e) => {
              if (!confirmSwitch()) return;
              setPkg(pkgFloors(e.target.value)[0]);
            }}
          >
            {groupOpts.map((g) => (
              <option key={g} value={g}>{tr(g)}</option>
            ))}
          </select>
        </label>

        {/* ⚠️ «Хувилбар» нь БАРИЛГЫН давхрын тоо (9F/12F) — модны гүнтэй
            андуурч «Давхар» гэж нэрлэхээс зайлсхийсэн. Хувилбар бүр ӨӨР
            QAQC хүснэгттэй тул нэгтгэж харуулбал акт буруу барилгад бичигдэнэ. */}
        {floorOpts.length > 1 && (
          <label className={st.field}>
            {tr('Хувилбар')}{' '}
            <select
              className={st.select}
              value={pkg.key}
              disabled={busy}
              onChange={(e) => {
                if (!confirmSwitch()) return;
                setPkg(PKGS.find((p) => p.key === e.target.value) ?? pkg);
              }}
            >
              {floorOpts.map((p) => (
                <option key={p.key} value={p.key}>{p.floors}F</option>
              ))}
            </select>
          </label>
        )}

        <label className={st.field}>
          {tr('Бүлэг')}{' '}
          <select
            className={cls('select selectWide')}
            value={grpA}
            disabled={busy}
            onChange={(e) => setGrpA(Number(e.target.value))}
            title={tr('Зөвхөн сонгосон бүлэг ба түүний доод ажлууд харагдана')}
          >
            <option value={0}>{tr('Бүгд')}</option>
            {grpAOpts.map((g) => (
              <option key={g.oid} value={g.oid}>{g.label}</option>
            ))}
          </select>
        </label>

        <label className={st.field}>
          {tr('Дэд бүлэг')}{' '}
          <select
            className={cls('select selectWide')}
            value={grpBEff}
            disabled={busy}
            onChange={(e) => setGrpB(Number(e.target.value))}
            title={tr('Тухайн бүлгийн доторх нэг дэд бүлгийг сонгоно')}
          >
            <option value={0}>{tr('Бүгд')}</option>
            {grpBOpts.map((g) => (
              <option key={g.oid} value={g.oid}>{g.label}</option>
            ))}
          </select>
        </label>

        {/* ⚠️ Тоо нь ИЛ: «212 / 1,370» гэж харуулахгүй бол цөөн мөр гарахад
            хүснэгт эвдэрсэн мэт уншигдана (FillNew-ийн «Хуваарийн дагуу»-тай
            ижил шийдэл). */}
        <button
          className={cls(onlyEmpty ? 'layerBtn layerBtnOn' : 'layerBtn')}
          disabled={busy}
          onClick={() => setOnlyEmpty((v) => !v)}
          title={tr('Нэг ч баримт бөглөгдөөгүй ажлын мөрүүдийг л харуулна. Бүлгийн мөр хэвээр үлдэнэ — эс бөгөөс шатлал тасарна.')}
        >
          {tr('Зөвхөн бөглөөгүй')}{' '}
          <span className={st.layerBtnN}>
            {emptyCount.toLocaleString()} / {leafCount.toLocaleString()}
          </span>
        </button>

        {resized && (
          <button
            className={st.layerBtn}
            onClick={resetAll}
            title={tr('Чирж өөрчилсөн бүх баганы өргөнийг анхны хэмжээнд нь буцаана')}
          >
            {tr('Өргөн сэргээх')}
          </button>
        )}

        <button
          className={st.publishBtn}
          onClick={() => void save()}
          disabled={busy || dirtyCount === 0 || !canEdit}
          title={canEdit
            ? tr('Өөрчилсөн нүдийг QAQC үйлчилгээнд бичнэ (Ctrl+S)')
            : RO_CAP}
        >
          {tr('Хадгалах')}{dirtyCount ? ` (${dirtyCount})` : ''}
        </button>

        {dirtyCount > 0 && canEdit && (
          <button
            type="button"
            className={st.linkBtn}
            onClick={dropDraft}
            disabled={busy}
            title={tr('Хадгалаагүй засварыг бүрэн хаяна — энэ хөтөч ба ArcGIS дээрх ноорог хоёулаа устана')}
          >
            {tr('ноорог устгах')}
          </button>
        )}

        {busy && <span className={st.muted}>{tr('ажиллаж байна…')}</span>}

        {/* ⚠️ ЭНЭ ЗААЛТ нь ЛОКАЛ хадгалалтыг л хэлнэ (2026-09-07-нд tooltip
            засагдав): урьд нь «мөн ArcGIS-д хадгалагдана» гэж БАТАЛГАА өгдөг
            байсан ч алсын бичилтийн үр дүн огт уншигддаггүй байв. Алсын
            байдал одоо ДООР тусдаа заалтаар гарна. */}
        {/* ⚠️ 2026-10-05: локал бичилт УНАСАН бол «хадгалагдав hh:mm» гэж ХУДАЛ хэлэхгүй */}
        {localFail && dirtyCount > 0 && (
          <span className={st.autosaveWarn} role="alert"
            title={tr('Хөтчийн хадгалалт дүүрсэн эсвэл хаалттай (хувийн горим) байна. Таб хаагдвал хадгалаагүй бөглөлт алдагдана — «Хадгалах» дарж үйлчилгээнд бичнэ үү.')}>
            {tr('⚠ ноорог хадгалагдсангүй')}
          </span>
        )}
        {savedAt != null && dirtyCount > 0 && !localFail && (
          <span
            className={st.autosave}
            title={tr('Ноорог ЭНЭ хөтөчид хадгалагдлаа. ArcGIS-д хуулагдсан эсэхийг хажуугийн заалт харуулна. Үйлчилгээнд бичихийн тулд «Хадгалах» дарна.')}
          >
            {tr('ноорог хадгалагдав {0}', new Date(savedAt).toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit' }))}
          </span>
        )}
        {/* ⚠️ ХЭТ ТОМ ноорог алсад ЯВААГҮЙГ ил хэлнэ — «хадгалагдсан» гэж
            бодоод өөр машин дээр хоосон хуудас хүлээж авах нь хамгийн муу. */}
        {/* ⚠️ 2026-10-01: «big»/«fail» хоёр ч ЗӨВХӨН хадгалаагүй засвартай үед — «Хадгалах»/
            «ноорог устгах»-ын дараа ArcGIS руу зөвхөн булш (арилгасан нүдний тэмдэглэл)
            явдаг; тэр бичилт унасан ч хэрэглэгчийн ажил алга болоогүй, локалд байгаа тул
            хоосон хуудсан дээр «ноорог зөвхөн энэ компьютерт» гэх нь ХУДАЛ сануулга. */}
        {remoteState?.kind === 'big' && dirtyCount > 0 && (
          <span className={st.autosaveWarn} role="status">
            {tr('Ноорог хэт том тул зөвхөн энэ компьютерт хадгалагдлаа.')}
          </span>
        )}
        {/* ⚠️ АЛСЫН ХУУЛБАР УНАСАН — сүлжээ, токен, эрх, хүснэгт аль нь ч
            болсон үр дүн НЭГ: ноорог ЗӨВХӨН энэ компьютерт байна. Бөглөлт
            зогсохгүй тул алдаа биш, харин БАЙДЛЫН мэдээлэл. */}
        {remoteState?.kind === 'fail' && dirtyCount > 0 && (
          <span className={st.autosaveWarn} role="status" title={tr('Дахин оролдлого автоматаар үргэлжилнэ. Өөр компьютероос үргэлжлүүлэх бол сүлжээ сэргэсний дараа хуудсыг нээлттэй үлдээнэ үү.')}>
            {tr('⚠ ArcGIS-д хуулагдсангүй — ноорог зөвхөн энэ компьютерт байна.')}
          </span>
        )}
        {/* ⚠️ АМЖИЛТТАЙГ ч ил хэлнэ: «хадгалагдав» гэдэг нь локалыг хэлдэг тул
            алсын хуулбар ХЭЗЭЭ хуулагдсаныг тусад нь харуулж байж л бөглөгч
            «өөр компьютероос үргэлжлүүлж болно» гэдэгт итгэнэ. */}
        {remoteState?.kind === 'ok' && dirtyCount > 0 && (
          <span className={st.autosave} title={tr('Энэ агшны байдлаар ArcGIS-д хуулагдсан — өөр компьютероос нэвтэрч үргэлжлүүлж болно.')}>
            {tr('ArcGIS {0}', new Date(remoteState.at).toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit' }))}
          </span>
        )}
        {rows.length > 0 && (
          <span className={st.muted}>
            {tr('{0} нүд бөглөгдсөн', filled.toLocaleString())}
          </span>
        )}
      </div>

      {!canEdit && (
        <p className={st.lockNote}>
          {tr('Зөвхөн харах горим — чанарын баримт бөглөхөд «QAQC» эрх шаардлагатай.')}
        </p>
      )}
      {/* ⚠️ ХАВТГАЙ ЗУРАГДСАНЫГ ил хэлнэ: эгнүүлэлтгүй 1,400 мөр нь «бүтэц
          эвдэрсэн» гэж уншигдана, шалтгааныг мэдэхгүй бол хэрэглэгч
          өгөгдөлдөө эргэлзэнэ. */}
      {flat && rows.length > 0 && (
        <p className={st.lockNote}>
          {tr('Ажлын шатлал татагдсангүй тул хүснэгт хавтгай харагдаж байна — бүлгийн шүүлт ба эвхэлт ажиллахгүй. Бөглөлт хэвийн хэвээр.')}
        </p>
      )}
      {err && <p className={st.error} role="alert">{err}</p>}
      {!busy && loadErr && (
        <Data q={{ state: 'error', data: null, error: loadErr, retry: () => { void load(pkg.key); } }}>{() => null}</Data>
      )}

      {busy && rows.length === 0 && (
        <div className={st.scroll}>
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className={st.skeletonRow}>
              <div className={st.skeletonCell} style={{ width: 40 }} />
              <div className={st.skeletonCell} style={{ width: 280 }} />
              <div className={st.skeletonCell} style={{ flex: 1 }} />
            </div>
          ))}
        </div>
      )}

      {!busy && !err && !loadErr && noTable && (
        <p className={st.muted}>
          {tr('Энэ багцын QAQC хүснэгт тодорхойлогдоогүй байна.')}
        </p>
      )}
      {!busy && !err && !loadErr && !noTable && rows.length === 0 && (
        <p className={st.muted}>{tr('Энэ багцад мөр олдсонгүй.')}</p>
      )}

      {rows.length > 0 && (
        <div className={st.scroll} ref={scrollRef} onScroll={onScroll}>
          <div className={st.tableWrap}>
            <div ref={colHlRef} className={st.colHl} aria-hidden="true" />
            <table
              className={cls('xl b32')}
              style={colStyle}
              onMouseOver={moveColHl}
              onMouseLeave={hideColHl}
            >
              {/* ТОЛГОЙ — excel-ийн эх загвараар 3 мөрт бүлэглэсэн:
                  банд → бүлэг → баганын нэр. `FillNew`-ийн 4 мөрт толгойтой
                  ижил механизм (`.b32` дэх наалдалтын шилжилт). */}
              <thead>
                <tr>
                  <th rowSpan={3} className={cls('fz c-no')}>№<i {...grip('no')} /></th>
                  <th rowSpan={3} className={cls('fz c-ajil')}>{tr('Ажил')}<i {...grip('ajil')} /></th>
                  <th colSpan={QAQC_COLS.length} className={cls('band')}>{tr(QAQC_BAND)}</th>
                </tr>
                <tr>
                  {QAQC_GROUPS.map((g) => (
                    <th key={g.label} colSpan={g.count} className={cls('band2')}>{tr(g.label)}</th>
                  ))}
                </tr>
                <tr>
                  {QAQC_COLS.map((c) => (
                    <th key={c.name} className={cls('c-doc')} title={tr(c.label)}>
                      {tr(c.short)}<i {...grip('doc')} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody ref={tbodyRef}>
                {vis.length === 0 && (
                  <tr>
                    <td colSpan={2 + QAQC_COLS.length} className={st.hint} style={{ padding: '14px 10px' }}>
                      {onlyEmpty
                        ? tr('Бүх ажилд баримт бөглөгдсөн байна. Бүгдийг харах бол «Зөвхөн бөглөөгүй»-г унтраа.')
                        : tr('Шүүлтэд тохирох мөр алга — «Бүлэг»-ийг «Бүгд» болгоно уу.')}
                    </td>
                  </tr>
                )}
                {/* Дээд ЧИГЖЭЭС — зурагдаагүй мөрүүдийн өндрийг орлоно */}
                {winFrom > 0 && (
                  <tr aria-hidden="true" style={{ height: winFrom * rowH }}>
                    <td colSpan={2 + QAQC_COLS.length} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
                {vis.slice(winFrom, winTo).map((i, k) => {
                  const r = rows[i];
                  /* ⚠️ `vis` доторх БАЙРЛАЛ — наалт ба Enter-ийн шилжилт
                     ХАРАГДАХ дараалалаар явдаг тул мөрийн индекс хангалтгүй. */
                  const vi = winFrom + k;
                  return (
                    <Fragment key={r.oid}>
                      <tr data-r={i} className={r.group ? st.cat : undefined}>
                        <td className={cls('num fz c-no')} {...ro(RO_NO)}>{r.no}</td>
                        <td
                          className={cls('fz c-ajil')}
                          style={{ paddingLeft: `${r.depth * 14 + 6}px` }}
                          {...ro(RO_NO)}
                          title={r.des ? `${r.work} · ${r.des}` : r.work}
                        >
                          {r.group && (
                            <button
                              type="button"
                              className={st.caret}
                              aria-expanded={!collapsed.has(r.oid)}
                              aria-label={collapsed.has(r.oid) ? tr('Дэлгэх') : tr('Эвхэх')}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(r.oid);
                              }}
                            >
                              {collapsed.has(r.oid) ? '▸' : '▾'}
                            </button>
                          )}
                          {r.work}
                        </td>
                        {/* ── БАРИМТ БИЧИГ — дарж текст бичнэ ──
                            ⚠️ Бүлгийн мөрд ч засагдана: М-акт, FIC зэрэг нь
                            ажлын БҮЛЭГТ олгогдож болох тул хориглосонгүй. */}
                        {QAQC_COLS.map((dc, di) => {
                          const key = `${r.oid}:${di}`;
                          const ekey = `${i}:${di}`;
                          const editing = editCell === ekey;
                          const val = key in pend ? pend[key] : (r.docs[di] ?? '');
                          const hit = editing ? null : approvedHit(di, val);
                          const openCell = () => {
                            if (!canEdit) return say(RO_CAP);
                            /* ⚠️ 2026-09-30: ХАДГАЛАЖ БАЙХ ҮЕД нүд нээхгүй — `save` дуусахдаа
                               `setPend({})`-ээр тэр хооронд бичсэн нүдийг (ноорогтой нь) арчдаг байв. */
                            if (busy) return say(RO_BUSY());
                            setEditCell(ekey);
                          };
                          return (
                            <td
                              key={dc.name}
                              data-bi={`d${di}`}
                              className={cls(
                                'c-doc docCell'
                                + (canEdit ? ' cursor-cell' : '')
                                + (key in pend ? ' dirty' : ''),
                              )}
                              title={canEdit ? tr('{0} — дарж бичнэ', tr(dc.label)) : RO_CAP}
                              /* ⚠️ 2026-10-06 аудит: ГАРААР хүрэх боломжтой (FillRows-ийн ижил) — урьд нь
                                 `tabIndex`-гүй тул нүд фокус авдаггүй: гарын хэрэглэгч хүрэхгүй, доорх
                                 «нүд сонгоод Ctrl+V» (`onPaste`) хэзээ ч ажилладаггүй байв. Enter/F2 → нээнэ. */
                              tabIndex={canEdit ? 0 : undefined}
                              onKeyDown={(e) => {
                                if (!editing && (e.key === 'Enter' || e.key === 'F2')) {
                                  e.preventDefault();
                                  openCell();
                                }
                              }}
                              /* ⚠️ Нүдийг НЭЭЛГҮЙГЭЭР буулгаж болно — Excel-ийн
                                 зуршил: нүд сонгоод шууд Ctrl+V. */
                              onPaste={(e) => {
                                if (pasteBlock(vi, di, e.clipboardData.getData('text/plain'))) {
                                  e.preventDefault();
                                }
                              }}
                              onClick={openCell}
                            >
                              {editing ? (
                                <input
                                  autoFocus
                                  type="text"
                                  /* ⚠️ 2026-10-09: талбарын БОДИТ урт (`fields[].length`) — урьд нь
                                     дурын 4000; мэдэгдэхгүй бол хязгааргүй, хадгалахад сервер шийднэ */
                                  maxLength={maxLen[di] ?? undefined}
                                  className={st.cellInputLine}
                                  defaultValue={val}
                                  /* ⚠️ Дугаарын нүд — батлагдсан баримтын жагсаалт (толгойн ⚠️) */
                                  list={docKindAt(di) ? `qaqc-dl-${docKindAt(di)}` : undefined}
                                  onBlur={(e) => {
                                    commit(r.oid, di, e.target.value);
                                    setEditCell(null);
                                  }}
                                  /* ⚠️ Нүд НЭЭЛТТЭЙ байхад буулгасан блок — оролт
                                     нь нэг мөр текст л авдаг тул таслан авна. */
                                  onPaste={(e) => {
                                    if (pasteBlock(vi, di, e.clipboardData.getData('text/plain'))) {
                                      e.preventDefault();
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') return setEditCell(null);
                                    if (e.key === 'Enter' || e.key === 'Tab') {
                                      e.preventDefault();
                                      commit(r.oid, di, e.currentTarget.value);
                                      /* Баганадаа дараагийн мөр рүү; Shift бол дээшээ */
                                      stepCell(vi, di, e.shiftKey ? -1 : 1);
                                    }
                                  }}
                                />
                              ) : (
                                <span className={st.docText}>
                                  {val}
                                  {/* ⚠️ Зөвхөн ХАРУУЛАХ — батлагдсан баримттай таарсан дугаар */}
                                  {hit && (
                                    <small
                                      style={{ marginLeft: 4, fontSize: '0.75em', color: 'var(--good-ink)', whiteSpace: 'nowrap' }}
                                      title={tr('Чанарын баримт: {0}', hit.title)}
                                    >
                                      {tr('✓ батлагдсан')}
                                    </small>
                                  )}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
                  );
                })}
                {winTo < vis.length && (
                  <tr aria-hidden="true" style={{ height: (vis.length - winTo) * rowH }}>
                    <td colSpan={2 + QAQC_COLS.length} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* БАТЛАГДСАН ЧАНАРЫН БАРИМТЫН ЖАГСААЛТ — дугаарын нүдний `list` (толгойн ⚠️) */}
      {(Object.values(DOC_KIND_OF) as DocKind[]).map((kind) => (
        <datalist key={kind} id={`qaqc-dl-${kind}`}>
          {(approved ?? []).filter((d) => d.kind === kind && d.bagts === pkg.group).map((d) => (
            <option key={d.no} value={d.no}>{d.title}</option>
          ))}
        </datalist>
      ))}

      {/* ХӨВӨГЧ МЭДЭГДЭЛ — засагдахгүй шалтгаан ба үр дүн (FillNew-тэй ижил) */}
      {notice && (
        <div
          className={`${st.notice} ${notice.kind === 'ok' ? st.noticeOk : notice.kind === 'warn' ? st.noticeWarn : ''}`}
          role={notice.kind === 'ro' ? 'status' : 'alert'}
          onClick={() => setNotice(null)}
        >
          <b>
            {notice.kind === 'ok' ? '✓ ' : notice.kind === 'warn' ? '⚠ ' : ''}
            {notice.kind === 'ro' ? tr('Энэ нүд засагдахгүй.') : ''}
          </b>
          {' '}{notice.msg}
        </div>
      )}

    </div>
  );
}
