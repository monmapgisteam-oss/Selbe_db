import { useCallback, useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import type { SheetRow } from '@/modules/sheet/bagtsSheet';
import type { Pkg } from '@/modules/sheet/bagts.pkg';
import type { NewRow } from '@/modules/sheet/sheetFrame';
import type { PlanRow } from '@/lib/plan';
import type { PkgPlan, PkgRes } from '@/lib/huvaariObyem';
import {
  AJIL_STATUS, loadApproved as loadAjilApproved, loadHistory as loadAjilHistory,
  loadPayload as loadAjilPayload, loadPending as loadAjilPending, markRestored as markAjilRestored,
  submitAjil, updateAjil, withdrawAjil, type AjilSubmission,
} from '@/lib/ajilBatlah';
import {
  EMPTY_FORM, mergeIncoming, nextTmpOid, pushTmpOid, readAdds, readAjEdit, writeAdds, writeAjEdit,
  type AddForm, type AjEdit,
} from './adds';
import type { ADraft, Draft, ResDraft } from './types';
import { remapOids } from './util';

/**
 * НЭМЭЛТ АЖИЛ — локал ноорог (`adds`) · илгээх · засах · татах · буцаагдсаныг буулгах
 * (2026-09-30: `Huvaari.tsx`-ээс механикаар салгав; логик · тайлбар ХЭВЭЭР).
 *
 * ⚠️ Хуваарийн батлах урсгалаас ТУСДАА 2 шатат урсгал (`ajilBatlah.ts`-ийн ⚠️) —
 *    энд хуваарийн ноорог (draft · ham · aDraft · resDraft) зөвхөн шинэ жааз
 *    ирэхэд шинэ oid руу зөөх зорилгоор л хөндөгдөнө (`refreshAfterApplied`).
 */
export function useAjil({
  pkg, user, status, canAddRow, rows, busy, setBusy, setErr, pkgKeyRef, refetchRef, dirtyNRef, uiOpenRef,
  adds, setAdds, setAddsSt, addsStRef,
  hdResetRestore, hdMapsRef, setDraft, setHam, setADraft, setResDraft,
  setSel, setFGrp, setCollapsed, setModal, setLinkAsk, undoRef,
}: {
  pkg: Pkg;
  user: { username?: string } | null | undefined;
  status: string;
  canAddRow: boolean;
  rows: SheetRow[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (v: string) => void;
  pkgKeyRef: React.RefObject<string>;
  refetchRef: React.RefObject<() => Promise<{ rows: SheetRow[]; plan: PkgPlan; res: PkgRes }>>;
  dirtyNRef: React.RefObject<number>;
  uiOpenRef: React.RefObject<boolean>;
  adds: NewRow[];
  setAdds: (fn: (prev: NewRow[]) => NewRow[]) => void;
  setAddsSt: React.Dispatch<React.SetStateAction<{ key: string; list: NewRow[] }>>;
  addsStRef: React.RefObject<{ key: string; list: NewRow[] }>;
  hdResetRestore: () => void;
  hdMapsRef: React.RefObject<{ draft: Draft; ham: Map<number, string>; aDraft: ADraft; resDraft: ResDraft }>;
  setDraft: (v: Draft) => void;
  setHam: (v: Map<number, string>) => void;
  setADraft: (v: ADraft) => void;
  setResDraft: (v: ResDraft) => void;
  setSel: React.Dispatch<React.SetStateAction<number | null>>;
  setFGrp: React.Dispatch<React.SetStateAction<'all' | number>>;
  setCollapsed: React.Dispatch<React.SetStateAction<Set<number>>>;
  setModal: (v: number | null) => void;
  setLinkAsk: (v: null) => void;
  undoRef: React.RefObject<unknown>;
}) {
  /* ── НЭМЭЛТ АЖИЛ (2026-09-24; `adds.ts`-ийн `tmpOid`-ийн ⚠️). `adds`/`addsSt` нь ЭЦЭГТ (`rowsAll`-д хэрэгтэй) — параметрээр. ── */
  /** Маягт нээлттэй байгаа БҮЛГИЙН oid */
  const [addFor, setAddFor] = useState<number | null>(null);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_FORM);
  /** Хүлээгдэж буй нэмэлт ажлын илгээлт — БҮХ хүнд харагдана */
  const [ajSub, setAjSub] = useState<AjilSubmission | null>(null);
  /** `ajSub` аль багцад АЧААЛАГДСАН — `null` = хараахан уншаагүй (засварын төлөвийг эрт арчихгүйн тулд) */
  const [ajSubFor, setAjSubFor] = useState<string | null>(null);
  /** Хүлээгдэж буй илгээлтээ ЗАСАЖ буй төлөв (2026-09-29) — `AjEdit`-ийн ⚠️ */
  const [ajEdit, setAjEditSt] = useState<AjEdit | null>(null);
  /** Засаж буй НЭМЭЛТ МӨР (түр oid) — маягт тэр мөрийн доор нээгдэнэ */
  const [editAdd, setEditAdd] = useState<number | null>(null);
  const [ajBusy, setAjBusy] = useState(false);
  const [ajErr, setAjErr] = useState('');
  const [ajNote, setAjNote] = useState('');
  /** Буцаагдсан — зохиогчид шалтгаантай нь */
  const [ajBack, setAjBack] = useState<{ n: number; by: string; reason: string } | null>(null);
  /** Батлагдсан ч үндсэн хүснэгтэд буугаагүй илгээлтийн тоо (буулгалт унасан) */
  const [ajStuck, setAjStuck] = useState(0);
  /**
   * Батлагдаж хуудсанд орсон ч ХАДГАЛААГҮЙ ноорогтой тул автоматаар
   * шинэчлээгүй — «Шинэчлэх» товч хүлээж байна (2026-09-24 аудит #1).
   */
  const [ajApplied, setAjApplied] = useState(false);
  /**
   * АЖИГЛАЖ БУЙ илгээлт — хүлээгдэхээ больсон ч «Буулгасан» болоогүй (2026-09-25 аудит).
   * ⚠️ `refreshAjil` илгээлт `pending`-ээс гармагц `ajSub`-ийг `null` болгодог тул
   *    `materializeAdds` 500-аар багцалж бичих хэдэн секундийн завсарт санал асуулга
   *    таарвал 30 с-ийн мөчлөг ЗОГСОЖ, «хараахан буугаагүй» мэдэгдэл мөнхөд үлдэж,
   *    шинэ мөрүүд хэзээ ч татагдахгүй байв. `approved` хэвээр байхад үргэлжлүүлнэ.
   */
  const [ajTrack, setAjTrack] = useState<number | null>(null);
  /**
   * БАГЦ СОЛИГДОХОД ТЭГЛЭНЭ (2026-09-30: урьд эцгийн `[pkg]` ачаалах эффектийн доторх мөрүүд —
   * механикаар энд зөөв; дараалал · утга ижил). Hook-ийн дараалалд эцгийн ачаалах эффектийн
   * ДАРАА, доорх `refreshAjil` эффектээс ӨМНӨ (нэг commit-д) ажиллана — урьдын дараалал.
   */
  useEffect(() => {
    const pkgKey = pkg.key;
    /* Нэмэлт ажил (2026-09-24): маягт хаана, баннер тэглэнэ, локал ноорогийг сэргээнэ */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: багц солигдоход нэмэлт ажлын төлөвийг тэглэж localStorage-оос сэргээх — гадаад эх сурвалжтай синк; эцгийн ачаалах эффекттэй ижил зарчим
    setAddFor(null); setAddForm(EMPTY_FORM);
    setAjSub(null); setAjErr(''); setAjNote(''); setAjBack(null); setAjStuck(0); setAjApplied(false);
    setAjTrack(null);
    setAjSubFor(null); setEditAdd(null); setAjEditSt(readAjEdit(pkgKey));
    const restored = readAdds(pkgKey);
    pushTmpOid(restored);
    setAddsSt({ key: pkgKey, list: restored });
  }, [pkg.key, setAddsSt]);
  /* ══════════════════ НЭМЭЛТ АЖИЛ — урсгал (2026-09-24) ══════════════════ */
  const ajSeq = useRef(0);
  /* ⚠️ `refetchServer` нь `rows`-оос хамаардаг тул шууд deps-д оруулбал мөр
     солигдох бүрд урсгал дахин татагдана — ref-ээр уншина. */
  /**
   * Хүлээгдэж буй илгээлт · буцаагдсан · батлагдсан-буугаагүй төлөв.
   *
   * ⚠️ Хоцорсон хариуг `ajSeq` + `pkgKeyRef`-ээр хаяна (`refreshFlow`-ийн дүрэм).
   * ⚠️ Буцаагдсан (`returned`) илгээлтийг ЗӨВХӨН ЗОХИОГЧ нь (нэвтрэлттэй үед)
   *    `adds`-д буцааж, ДАРАА нь `markRestored` — буулт унавал `returned`
   *    хэвээр, дараагийн нээлтэд дахин; өөр компьютер дээр давхар буухгүй
   *    (FillNew-ийн 2026-09-23 #13 дүрэм). `loadHistory(…, 500)`: анхдагч 20 нь
   *    сүүлийн шийдвэрүүд л — хуучин буцаалт хэзээ ч сэргэхгүй байв.
   * ⚠️ Хүлээгдэж байсан илгээлт (`prevOid`) АЛГА БОЛОХОД түүхээс төлвийг нь
   *    харна: `applied` → `refetchServer` (мөр серверээс гарч ирнэ, улаан
   *    тэмдэг «Гүйцэтгэл бөглөх»-д `loadAddedKeys`-ээр хэвээр); `returned` →
   *    дээрх зам; `approved` (буугаагүй) → `ajStuck` мэдэгдэл.
   */
  const refreshAjil = useCallback(async (prevOid: number | null) => {
    const want = pkg.key;
    const my = ++ajSeq.current;
    const live = () => my === ajSeq.current && pkgKeyRef.current === want;
    const me = (user?.username ?? '').trim().toLowerCase();
    const authOn = status !== 'off';
    try {
      const sub = await loadAjilPending(want);
      if (!live()) return;
      setAjSub(sub);
      setAjSubFor(want);
      const lookBack = prevOid != null && sub?.oid !== prevOid;
      const stuck = await loadAjilApproved(want);
      if (!live()) return;
      setAjStuck(stuck.length);
      const hist = await loadAjilHistory(want, 500);
      if (!live()) return;
      let applied = false;
      /** Батлагдсан ч хараахан буугаагүй — мөчлөгийг үргэлжлүүлнэ (`ajTrack`) */
      let midway = false;
      for (const h0 of hist) {
        if (lookBack && h0.oid === prevOid && h0.status === AJIL_STATUS.applied) applied = true;
        if (lookBack && h0.oid === prevOid && h0.status === AJIL_STATUS.approved) midway = true;
        if (h0.status !== AJIL_STATUS.returned) continue;
        if (authOn && h0.author !== me) continue;
        /* ⚠️ Мөр нэмэх эрхгүй хүнд буулгахгүй — тэр `adds`-аа илгээж ч чадахгүй */
        if (!canAddRow) continue;
        const pl = await loadAjilPayload(h0.oid);
        if (!live()) return;
        if (pl?.adds.length) {
          /* ⚠️ LS-д СИНХРОН бичнэ, ДАРАА нь тэмдэглэнэ (2026-09-24 аудит #5): React
             төлөвөөр дамжуулбал `markRestored` амжаад хуудас хаагдах/багц солигдоход
             мөрүүд LS-д хүрэлгүй БҮРМӨСӨН алга болдог байв. */
          const cur = addsStRef.current;
          const merged = mergeIncoming(cur.key === want ? cur.list : [], pl.adds);
          writeAdds(want, merged);
          setAddsSt({ key: want, list: merged });
          addsStRef.current = { key: want, list: merged };
        }
        if (!live()) return;
        await markAjilRestored(h0.oid);
        if (!live()) return;
        setAjBack({ n: pl?.adds.length ?? 0, by: h0.approver ?? '', reason: h0.reason ?? '' });
      }
      if (!live()) return;
      /* ⚠️ Зөвхөн ДАГАЖ БУЙ илгээлтийг шийдсэн үед цэвэрлэнэ (2026-09-25 review):
         урьд нь `refreshAjil(null)` (илгээх · татах · effect) бүр `ajTrack`-ийг
         арилгаж, батлагдсан-буугаагүй илгээлтийн `applied`-ийг хэзээ ч барихгүй
         болгодог байв. */
      setAjTrack((t) => (midway ? prevOid : prevOid != null && t === prevOid ? null : t));
      if (applied) {
        /*
         * ⚠️ ШИНЭ ЖААЗ = БҮХ OID ШИНЭ (2026-09-24 аудит #1). Ноорог (`draft` ·
         *    `ham` · `aDraft` · `resDraft`) хуучин oid-оор түлхүүрлэгдсэн тул
         *    шууд `refetchServer` хийвэл засвар «алга болж», `save` `staleN`-д
         *    унаж, хамгийн муу нь хуваалцсан ноорогийн дифф хуучин oid-той нүд
         *    бүрийг tombstone болгож БҮХ оролцогчийн ноорог устдаг байв.
         *    · Хадгалаагүй ноорог БАЙВАЛ автоматаар шинэчлэхгүй — `ajApplied`
         *      мэдэгдэл + «Шинэчлэх» товч (`refreshAfterApplied`: ноорогийг
         *      (№ ¦ нэр)-ээр шинэ oid руу зөөгөөд татна).
         *    · Ноороггүй бол `hdReady = null` тавьж ТАТНА: дифф `hdReady === key`
         *      биш үед ажиллахгүй тул tombstone гарахгүй; сэргээлтийн зам алсын
         *      ноорогийг дахин уншиж шинэ мөрөнд тулгана (хуучин oid-той нүд
         *      «хуучирсан» гэж хасагдана — өмнөх мэдэгдэж буй байдал, устгал биш).
         */
        /* ⚠️ Popup/холбох цонх НЭЭЛТТЭЙ бол ч хойшлуулна (2026-09-25 аудит) — шинэ
           жаазад бүх oid солигдох тул цонх хаагдаж бичсэн утга алдагдана. */
        if (dirtyNRef.current > 0 || uiOpenRef.current) {
          setAjApplied(true);
        } else {
          hdResetRestore();
          await refetchRef.current();
          if (!live()) return;
          setAjNote(tr('Нэмэлт ажил батлагдаж хуудсанд орлоо — мөрүүд серверээс шинэчлэгдэв.'));
        }
      }
    } catch {
      /* ⚠️ Уншиж чадсангүй ≠ илгээлт алга — хуучин төлөвийг ХЭВЭЭР үлдээнэ */
    }
  }, [pkg.key, user, status, canAddRow, addsStRef, dirtyNRef, hdResetRestore, pkgKeyRef, refetchRef, setAddsSt, uiOpenRef]);
  /**
   * «ШИНЭЧЛЭХ» — батлагдсан нэмэлт ажлын шинэ жаазыг татахдаа хадгалаагүй
   * ноорогийг ШИНЭ oid руу зөөнө (`remapOids`, № ¦ нэр). `obDraft`/`obResDraft`
   * нь `des|блок`-оор түлхүүрлэгддэг (код жаазаар солигддоггүй) тул хөндөхгүй.
   * Зөөгдөөгүй мөрийн ноорог хаягдана — тоог нь хэлнэ.
   */
  const refreshAfterApplied = useCallback(async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const oldRows = rows;
      hdResetRestore();
      const srv = await refetchRef.current();
      const map = remapOids(oldRows, srv.rows);
      /* ⚠️ СИНХРОН БОДНО (2026-09-25 аудит): урьд нь `lost`-ыг функц-шинэчлэгч
         дотор тоолж, дараалалд оруулсны ДАРАА шууд уншдаг байв — React тэдгээрийг
         хожим ажиллуулдаг тул тоо 0 хэвээр, ноорог хаягдсан атлаа «зөөгдөв» гэж
         мэдэгддэг байлаа. Одоогийн Map-уудыг (`hdMapsRef`) шууд хөрвүүлнэ; тоо нь
         давхардалгүй МӨР (oid). */
      const lostOids = new Set<number>();
      const mv = <V,>(m: ReadonlyMap<number, V>): Map<number, V> => {
        const o = new Map<number, V>();
        for (const [k, v] of m) {
          const nk = map.get(k);
          if (nk == null) { lostOids.add(k); continue; }
          o.set(nk, v);
        }
        return o;
      };
      const cur = hdMapsRef.current;
      setDraft(mv(cur.draft)); setHam(mv(cur.ham)); setADraft(mv(cur.aDraft)); setResDraft(mv(cur.resDraft));
      const lost = lostOids.size;
      /* ⚠️ Сонголт · бүлгийн шүүлт oid-оор (2026-09-25) — шинэ oid руу зөөнө; нээлттэй
         цонхыг хаана (буцаах мэдээлэл нь хуучин oid-той). */
      setSel((o) => (o == null ? null : map.get(o) ?? null));
      setFGrp((g) => (g === 'all' ? g : map.get(g) ?? 'all'));
      /* ⚠️ 2026-09-25: Хураасан бүлгүүд ч oid-оор — шинэ oid руу зөөнө, эс бөгөөс
         шинэчлэлтийн дараа бүх бүлэг дэлгэгдэнэ. Олдоогүй нь хаягдана. */
      setCollapsed((st) => {
        const o = new Set<number>();
        for (const k of st) { const nk = map.get(k); if (nk != null) o.add(nk); }
        return o;
      });
      setModal(null); setLinkAsk(null); undoRef.current = null;
      setAjApplied(false);
      setAjNote(lost
        ? tr('Хуудас шинэчлэгдлээ — {0} мөрийн хадгалаагүй ноорог шинэ мөрөнд олдсонгүй тул хаягдав.', num(lost))
        : tr('Хуудас шинэчлэгдлээ — хадгалаагүй ноорог шинэ мөрүүд рүү зөөгдөв.'));
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [busy, rows, hdMapsRef, hdResetRestore, refetchRef, setADraft, setBusy, setCollapsed, setDraft, setErr, setFGrp, setHam, setLinkAsk, setModal, setResDraft, setSel, undoRef]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: `refreshAjil` нь ArcGIS-ээс хүлээгдэж буй илгээлтийг уншиж төлөвт тавьдаг — гадаад эх сурвалжтай синк
  useEffect(() => { void refreshAjil(null); }, [refreshAjil]);
  /* ⚠️ Хүлээгдэж байхад 30 сек тутам — шийдвэр гарахад зохиогчийн нээлттэй
     хуудас өөрөө мэдэж мөрийг серверээс татна (`applied`). */
  /* ⚠️ `ajTrack` (2026-09-25 аудит) — батлагдсан ч буугаагүй илгээлтийг ч дагана */
  useEffect(() => {
    const oid = ajSub?.oid ?? ajTrack;
    if (oid == null) return;
    const t = window.setInterval(() => { void refreshAjil(oid); }, 30_000);
    return () => window.clearInterval(t);
  }, [ajSub, ajTrack, refreshAjil]);

  /**
   * «Нэмэлт ажил батлуулах» — үндсэн өгөгдөлд ЮУ Ч бичихгүй.
   * ⚠️ Хуваарийн «Батлуулах»-аас ТУСДАА: тэр нь ОГНООГ хуваарийн батлах
   *    урсгалд, энэ нь ШИНЭ АЖЛЫГ гэрээнд оруулах эсэхийг 2 шатат урсгалд.
   * ⚠️ Илгээсний дараа `adds` + LS ЦЭВЭРЛЭНЭ: агуулга серверт хадгалагдсан;
   *    локалд үлдвэл дахин илгээгдэж давхар мөр үүснэ. Буцаагдвал/татвал
   *    `refreshAjil`/`withdrawAjilHere` буцааж авчирна.
   */
  const sendAjil = useCallback(async () => {
    if (!adds.length || ajBusy) return;
    /* ⚠️ БАГЦЫГ ОДОО барина (2026-09-25 аудит): `setAdds` нь дарсан агшны `pkg.key`-ийг
       барьдаг тул хүсэлт явж байхад багц солиход Б-гийн мөрүүд харагдахаа больж,
       А-гийн LS илгээсэн мөрөө хадгалсаар буцаж ирдэг байв. Одоо А-г (`want`) шууд
       LS-д бичиж, төлөвийг ЗӨВХӨН тэр багцынх хэвээр бол шинэчилнэ. Зөвхөн
       ИЛГЭЭСЭН мөрүүдийг хасна — завсарт нэмсэн нь үлдэнэ. */
    const want = pkg.key;
    const sent = new Set(adds.map((a) => a.oid));
    setAjBusy(true); setAjErr(''); setAjNote('');
    try {
      const r = await submitAjil({
        pkgKey: want, pkgGroup: pkg.group, author: user?.username ?? '',
        payload: { v: 1, pkgKey: want, adds },
      });
      if (!r.ok) { setAjErr(r.error ?? tr('Илгээгдсэнгүй.')); return; }
      const st = addsStRef.current;
      writeAdds(want, (st.key === want ? st.list : readAdds(want)).filter((a) => !sent.has(a.oid)));
      setAddsSt((s) => (s.key === want ? { key: want, list: s.list.filter((a) => !sent.has(a.oid)) } : s));
      setAddFor(null);
      setAjNote(tr('Нэмэлт ажил батлуулахаар илгээгдлээ — батлагч шийдвэрлэнэ.'));
      await refreshAjil(null);
    } catch (e) {
      setAjErr(String((e as Error).message || e));
    } finally {
      setAjBusy(false);
    }
  }, [adds, ajBusy, pkg.key, pkg.group, user, refreshAjil, addsStRef, setAddsSt]);

  /**
   * ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТЭЭ ЗАСАХ (2026-09-29, хэрэглэгч: «ажил нэмэх хүсэлт явуулсны дараа
   * буцаагаагүй байхад өөрөө дахин засах боломжтой байх»).
   * ⚠️ ТАТАХГҮЙ: илгээлт `pending` хэвээр, мөрүүд нь `adds`-д ЗАСВАРЫН ХУУЛБАР болж бууна
   *    (улаан мөр — «✎» засах, «×» хасах, «+» нэмэх). «Засварыг хадгалах» нь ИЖИЛ илгээлтийн
   *    агуулгыг солино (`updateAjil`); «Болих» нь буулгасан мөрүүдийг л хасна.
   */
  const setAjEdit = useCallback((v: AjEdit | null) => { writeAjEdit(pkg.key, v); setAjEditSt(v); }, [pkg.key]);
  const editAjilHere = useCallback(async () => {
    if (!ajSub || ajBusy || ajEdit) return;
    const want = pkg.key;
    setAjBusy(true); setAjErr(''); setAjNote('');
    try {
      const pl = await loadAjilPayload(ajSub.oid);
      if (!pl?.adds.length) { setAjErr(tr('Илгээлтийн агуулга уншигдсангүй.')); return; }
      if (pkgKeyRef.current !== want) return;
      const st = addsStRef.current;
      const before = st.key === want ? st.list : readAdds(want);
      const had = new Set(before.map((a) => a.oid));
      const merged = mergeIncoming(before, pl.adds);
      writeAdds(want, merged);
      setAddsSt({ key: want, list: merged });
      addsStRef.current = { key: want, list: merged };
      setAjEdit({ oid: ajSub.oid, rows: merged.filter((a) => !had.has(a.oid)).map((a) => a.oid) });
      setAjNote(tr('Илгээсэн нэмэлт ажил засварт нээгдлээ — улаан мөрүүдийг засаад «Засварыг хадгалах» дарна уу. Батлагч шийдээгүй хэвээр.'));
    } catch (e) {
      setAjErr(String((e as Error).message || e));
    } finally {
      setAjBusy(false);
    }
  }, [ajSub, ajBusy, ajEdit, pkg.key, setAjEdit, addsStRef, pkgKeyRef, setAddsSt]);

  /** Засварыг ИЖИЛ илгээлтэд хадгална — `adds` бүхэлдээ илгээлтийн шинэ агуулга болно */
  const saveAjilEdit = useCallback(async () => {
    if (!ajSub || !ajEdit || ajEdit.oid !== ajSub.oid || ajBusy) return;
    const want = pkg.key;
    const sent = new Set(adds.map((a) => a.oid));
    setAjBusy(true); setAjErr(''); setAjNote('');
    try {
      const r = await updateAjil({ oid: ajSub.oid, me: user?.username ?? '', payload: { v: 1, pkgKey: want, adds } });
      if (!r.ok) { setAjErr(r.error ?? tr('Засвар хадгалагдсангүй.')); return; }
      const st = addsStRef.current;
      writeAdds(want, (st.key === want ? st.list : readAdds(want)).filter((a) => !sent.has(a.oid)));
      setAddsSt((s0) => (s0.key === want ? { key: want, list: s0.list.filter((a) => !sent.has(a.oid)) } : s0));
      writeAjEdit(want, null);
      if (pkgKeyRef.current === want) { setAjEditSt(null); setEditAdd(null); setAddFor(null); }
      setAjNote(tr('Нэмэлт ажлын засвар хадгалагдлаа — батлагч шинэ хувилбарыг харна.'));
      await refreshAjil(null);
    } catch (e) {
      setAjErr(String((e as Error).message || e));
    } finally {
      setAjBusy(false);
    }
  }, [ajSub, ajEdit, ajBusy, adds, pkg.key, user, refreshAjil, addsStRef, pkgKeyRef, setAddsSt]);

  /** Засварыг болих — илгээлтээс буулгасан мөрүүдийг хасна (илгээлт хөндөгдөхгүй) */
  const cancelAjilEdit = useCallback(() => {
    if (!ajEdit) return;
    const drop = new Set(ajEdit.rows);
    setAdds((a) => a.filter((x) => !drop.has(x.oid)));
    setAjEdit(null); setEditAdd(null);
    setAjErr(''); setAjNote(tr('Засвар хаягдлаа — илгээлт өмнөх хэвээрээ хүлээгдэж байна.'));
  }, [ajEdit, setAdds, setAjEdit]);

  /*
   * ⚠️ ИЛГЭЭЛТ ЗАСВАРЫН ДУНДУУР ШИЙДЭГДСЭН/СОЛИГДСОН бол буулгасан мөрүүдийг ХАСНА —
   *    эс бөгөөс тэд «илгээгээгүй шинэ мөр» болж дахин илгээгдэн ДАВХАР мөр үүсгэнэ.
   *    Зөвхөн энэ багцын `ajSub` АЧААЛАГДСАНЫ дараа (`ajSubFor`) — анхны `null`-д биш.
   */
  useEffect(() => {
    if (!ajEdit || ajSubFor !== pkg.key) return;
    if (ajSub && ajSub.oid === ajEdit.oid) return;
    const drop = new Set(ajEdit.rows);
    setAdds((a) => a.filter((x) => !drop.has(x.oid)));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: серверийн илгээлт (`ajSub`) солигдоход буулгасан засварын мөрүүдийг хасах — гадаад төлөвтэй синк (⚠️ дээр: давхар мөр үүсэхээс)
    setAjEdit(null); setEditAdd(null);
    setAjNote(tr('Засаж байсан илгээлт хооронд нь шийдвэрлэгдсэн тул засвар хаагдлаа.'));
  }, [ajEdit, ajSub, ajSubFor, pkg.key, setAdds, setAjEdit]);

  /** ИЛГЭЭЛТЭЭ ТАТАХ — зохиогч алдаатай илгээлтээ буцааж авна; мөрүүд `adds` руу */
  const withdrawAjilHere = useCallback(async () => {
    if (!ajSub || ajBusy) return;
    /* ⚠️ 2026-09-29: засварын дундуур татвал ЗАССАН хувилбар хуудсанд үлдэх ёстой — серверийн
       (хуучин) агуулгыг давхар буулгахгүй */
    const editing = !!ajEdit && ajEdit.oid === ajSub.oid;
    if (!window.confirm(tr('Илгээлтээ татах уу? Батлагч шийдвэрлэхээ болино; мөрүүд хуудсанд буцаж орно.'))) return;
    /* ⚠️ Багцыг ОДОО барина (2026-09-25 аудит) — `sendAjil`-ийн ижил шалтгаан */
    const want = pkg.key;
    setAjBusy(true); setAjErr(''); setAjNote('');
    try {
      const pl = editing ? null : await loadAjilPayload(ajSub.oid);
      const r = await withdrawAjil({ oid: ajSub.oid, me: user?.username ?? '' });
      if (!r.ok) { setAjErr(r.error ?? tr('Татагдсангүй.')); return; }
      /* ⚠️ Татсан мөрүүдийг `adds` руу БУЦААНА — эс бөгөөс хийсэн ажил чимээгүй алга болно */
      /* ⚠️ LS-д СИНХРОН (`refreshAjil`-ийн #5 дүрэм) — багц солигдсон ч А-д хадгалагдана */
      if (pl?.adds.length) {
        const st = addsStRef.current;
        const merged = mergeIncoming(st.key === want ? st.list : readAdds(want), pl.adds);
        writeAdds(want, merged);
        if (st.key === want) {
          setAddsSt((s) => (s.key === want ? { key: want, list: merged } : s));
          addsStRef.current = { key: want, list: merged };
        }
      }
      if (editing) { writeAjEdit(want, null); setAjEditSt(null); }
      setAjNote(tr('Илгээлт татагдлаа — мөрүүд хуудсанд буцаж орлоо.'));
      await refreshAjil(null);
    } catch (e) {
      setAjErr(String((e as Error).message || e));
    } finally {
      setAjBusy(false);
    }
  }, [ajSub, ajBusy, ajEdit, user, pkg.key, refreshAjil, addsStRef, setAddsSt]);

  /**
   * БҮЛЭГТ ШИНЭ АЖИЛ НЭМЭХ — шалгалт FillNew-ийн 2026-09 хувилбартай ҮГЧЛЭН ижил.
   * ⚠️ № нь БҮХЭЛ ТОО: `ags.levelFromNo` бутархай № («3.2»)-г «бүлэг» гэж
   *    уншдаг тул навч ажил тоололд орохгүй үлдэнэ.
   * ⚠️ `parentIdx` нь `rowsAll` дахь индекс (`PlanRow.i`) — `insertAdds.parentOf`
   *    нэр давхардсан эцгүүдээс байрлалаар ойрхныг сонгоно.
   */
  /** Маягтын шалгалт — нэмэх ба засах ХОЁУЛАА (нэг дүрэм) */
  const readForm = useCallback((): { no: string; work: string; vol: number | null; unit: number | null } | null => {
    const no = addForm.no.trim();
    const work = addForm.work.trim();
    const nn = (v: string) => {
      const t = v.trim().replace(',', '.');
      return t === '' ? null : Number.isFinite(Number(t)) ? Number(t) : NaN;
    };
    const vol = nn(addForm.vol);
    const unit = nn(addForm.unit);
    if (!work) { setAjErr(tr('Ажлын нэрийг оруулна уу.')); return null; }
    if (!/^\d+$/.test(no)) {
      setAjErr(tr('№ нь бүхэл тоо байх ёстой (жишээ «12») — бутархай дугаар нь бүлгийн мөрийг заадаг тул ажлын тоололд орохгүй.'));
      return null;
    }
    if (Number.isNaN(vol) || Number.isNaN(unit)) { setAjErr(tr('Обьём ба Нэгж өртөг нь тоон утга байх ёстой.')); return null; }
    setAjErr('');
    return { no, work, vol, unit };
  }, [addForm]);
  /** НЭМЭЛТ МӨРИЙГ ЗАСАХ (2026-09-29) — № · нэр · обьём · нэгж өртөг; бүлэг нь хэвээр (өөр бүлэгт бол хасаад тэнд нэмнэ) */
  const saveEditAdd = useCallback((oid: number) => {
    const v = readForm();
    if (!v) return;
    setAdds((a) => a.map((x) => (x.oid === oid ? { ...x, no: v.no, work: v.work, vol: v.vol, unit: v.unit } : x)));
    setEditAdd(null); setAddForm(EMPTY_FORM);
    setAjNote(tr('«{0}» засагдлаа.', v.work));
  }, [readForm, setAdds]);
  const addRow = useCallback((parent: PlanRow) => {
    const v = readForm();
    if (!v) return;
    const { no, work, vol, unit } = v;
    const oid = nextTmpOid();
    /* ⚠️ `parentIdx` нь СЕРВЕРИЙН `rows` дахь индекс (2026-09-24 аудит #7) —
       `parent.i` нь `rowsAll`-ынх (локал нэмэлт мөр орсон) тул батлахад
       `insertAdds.parentOf` серверийн мөрөнд буруу байрлалтай тулгах байв. */
    const parentIdx = rows.findIndex((r) => r.oid === parent.oid);
    setAdds((a) => [...a, { oid, parentNo: parent.no, parentWork: parent.work, parentIdx, no, work, vol, unit }]);
    /* Бүлэг ЭВХЭЭСТЭЙ бол шинэ мөр нуугдана — автоматаар дэлгэнэ */
    setCollapsed((st) => {
      if (!st.has(parent.oid)) return st;
      const m = new Set(st);
      m.delete(parent.oid);
      return m;
    });
    setAddFor(null); setAddForm(EMPTY_FORM);
    setAjNote(tr('«{0}» нэмэгдлээ — «Нэмэлт ажил батлуулах» товчоор батлуулна; батлагдмагц үндсэн хүснэгтэд бичигдэнэ.', work));
  }, [readForm, setAdds, rows, setCollapsed]);
  /** Батлуулаагүй мөрийг хасах — зөвхөн локал (`adds` + LS) */
  const dropAdd = useCallback((oid: number) => setAdds((a) => a.filter((x) => x.oid !== oid)), [setAdds]);

  return {
    addFor, setAddFor, addForm, setAddForm, ajSub, ajEdit, editAdd, setEditAdd,
    ajBusy, ajErr, setAjErr, ajNote, setAjNote, ajBack, setAjBack, ajStuck, ajApplied,
    refreshAfterApplied, sendAjil, editAjilHere, saveAjilEdit, cancelAjilEdit,
    withdrawAjilHere, saveEditAdd, addRow, dropAdd,
  };
}
