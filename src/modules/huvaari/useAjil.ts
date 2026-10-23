import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
/* ⚠️ 2026-10-06 аудит: алдааг ТҮҮХИЙГЭЭР нь («Token Required» г.м.) харуулахгүй — `userError` */
import { userError } from '@/components/ui';
/* ⚠️ 2026-10-23 (UX аудит X1/P2): аппын дотоод асуулт ба «↶ Буцаах» мэдэгдэл */
import { askConfirm, toastUndo } from '@/lib/confirm';
import type { SheetRow } from '@/modules/sheet/bagtsSheet';
import type { Pkg } from '@/modules/sheet/bagts.pkg';
import type { NewRow } from '@/modules/sheet/sheetFrame';
import type { PlanRow } from '@/lib/plan';
import type { PkgPlan, PkgRes } from '@/lib/huvaariObyem';
import {
  AJIL_STATUS, loadApproved as loadAjilApproved, loadHead as loadAjilHead, loadHistory as loadAjilHistory,
  loadPayload as loadAjilPayload, loadPending as loadAjilPending, markRestored as markAjilRestored,
  submitAjil, updateAjil, withdrawAjil, type AjilSubmission,
} from '@/lib/ajilBatlah';
/* ⚠️ 2026-10-22 (аудит №3): эцэг бүлгийн хайлт — `sheetFrame.insertAdds`/`ajilApply` буулгалттай ЯГ НЭГ дүрэм */
import { missingParents } from '@/lib/ajilApply';
import {
  EMPTY_FORM, ajBackHidden, hideAjBack, mergeIncoming, nextTmpOid, pushTmpOid, readAdds, readAjEdit, readWdMark, writeAdds, writeAjEdit, writeWdMark,
  type AddForm, type AjEdit,
} from './adds';
import type { ADraft, Draft, ResDraft } from './types';
import { remapRowsFull } from './savePrep';
import { normCell } from '@/modules/sheet/paste';

/** ⚠️ 2026-10-22 (аудит №3): эцэггүй мөртэй үед илгээх/засвар хадгалахыг хаах мессеж (`useAjil.ajOrphans`-ийн ⚠️) */
export const orphanAddsMsg = (n0: number): string =>
  tr('{0} нэмэлт мөрийн эцэг бүлэг хуудсанд олдсонгүй — доорх жагсаалтаас устгах эсвэл одоо байгаа бүлэгт харьяалуулаад дахин илгээнэ үү.', num(n0));

/**
 * НЭМЭЛТ АЖИЛ — локал ноорог (`adds`) · илгээх · засах · татах · буцаагдсаныг буулгах
 * (2026-09-30: `Huvaari.tsx`-ээс механикаар салгав; логик · тайлбар ХЭВЭЭР).
 *
 * ⚠️ Хуваарийн батлах урсгалаас ТУСДАА 2 шатат урсгал (`ajilBatlah.ts`-ийн ⚠️) —
 *    энд хуваарийн ноорог (draft · ham · aDraft · resDraft) зөвхөн шинэ жааз
 *    ирэхэд шинэ oid руу зөөх зорилгоор л хөндөгдөнө (`refreshAfterApplied`).
 *    ⚠️ 2026-10-09: тэр зөөлт `useSharedDraft`-д шилжсэн (мөр шинэ жааз болох бүрд) — энд ХӨНДӨХГҮЙ.
 */
export function useAjil({
  pkg, user, status, canAddRow, rows, busy, setBusy, setErr, pkgKeyRef, refetchRef, dirtyNRef, uiOpenRef,
  adds, setAdds, setAddsSt, addsStRef,
  hdResetRestore, hdRetryRestore, hdMapsRef,
  setSel, setFGrp, setCollapsed, setModal, setLinkAsk, undoRef, setOkRows, setCellEdit,
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
  /** ⚠️ 2026-10-09 (аудит №2): `hdResetRestore`-ийн дараах татлага унавал сэргээлтийг дахин эхлүүлнэ (`useSharedDraft`-ийн ⚠️) */
  hdRetryRestore: () => void;
  hdMapsRef: React.RefObject<{ draft: Draft; ham: Map<number, string>; aDraft: ADraft; resDraft: ResDraft }>;
  /* ⚠️ 2026-10-09: ноорогийн Map-ыг энд ЗӨӨХӨӨ БОЛИВ (`refreshAfterApplied`-ийн ⚠️) — дуудагчийн нийцэлд сонголттой */
  setDraft?: (v: Draft) => void;
  setHam?: (v: Map<number, string>) => void;
  setADraft?: (v: ADraft) => void;
  setResDraft?: (v: ResDraft) => void;
  setSel: React.Dispatch<React.SetStateAction<number | null>>;
  setFGrp: React.Dispatch<React.SetStateAction<'all' | number>>;
  setCollapsed: React.Dispatch<React.SetStateAction<Set<number>>>;
  setModal: (v: number | null) => void;
  setLinkAsk: (v: null) => void;
  undoRef: React.RefObject<unknown>;
  /**
   * ⚠️ 2026-10-08: СОНГОЛТ (`sel` · `fGrp` · `collapsed`)-той адил oid-оор түлхүүрлэгдсэн ТӨЛӨВ —
   *    батлагчийн ногоон тэмдэглэгээ (`okRows`) ба бичиж буй нүдний мөр (`cellEdit`) ч шинэ жаазад
   *    зөөгдөнө. Сонголттой (өгөхгүй бол хөндөхгүй) — эцэг дамжуулна.
   */
  setOkRows?: React.Dispatch<React.SetStateAction<Set<number>>>;
  setCellEdit?: React.Dispatch<React.SetStateAction<number | null>>;
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
  /** Буцаагдсан — зохиогчид шалтгаантай нь (⚠️ 2026-10-23, P1: `oid` — хаасныг санахад, `at` — шийдвэрийн огноо) */
  const [ajBack, setAjBack] = useState<{ oid: number; n: number | null; by: string; reason: string; at: number | null } | null>(null);
  /** ⚠️ 2026-10-23 (UX аудит P1): буцаалтын мэдэгдлийг «×»-ээр хаавал энэ хөтөч санана (`adds.hideAjBack`) — дахин гарахгүй */
  const dismissAjBack = useCallback(() => {
    setAjBack((b) => { if (b) hideAjBack(pkg.key, b.oid); return null; });
  }, [pkg.key]);
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
      /*
       * ⚠️ 2026-10-22 (аудит №6): ТОДОРХОЙГҮЙ ТАТАЛТ (`adds.WdMark`) — `setAjSub`-ЭЭС ӨМНӨ шийднэ. Тэр илгээлт хүлээгдсэн
       *    хэвээр бол таталт буугаагүй (тэмдэг л арилна); «Татсан» бол мөрүүд энд `adds`-д буцна (засварын горимд засварын
       *    төлвийг цэвэрлэнэ — эс бөгөөс доорх «илгээлт шийдэгдсэн тул засвар хаагдлаа» эффект мөрүүдийг ХАСНА). Уншилт
       *    унавал тэмдэг үлдэж дараагийн удаа дахин оролдоно.
       */
      const wd = readWdMark(want);
      if (wd && sub?.oid === wd.oid) writeWdMark(want, null);
      else if (wd) {
        const head = await loadAjilHead(wd.oid).catch(() => undefined);
        if (!live()) return;
        if (head !== undefined) {
          if (head?.status === AJIL_STATUS.withdrawn) {
            if (wd.adds.length) {
              const cur = addsStRef.current;
              const merged = mergeIncoming(cur.key === want ? cur.list : readAdds(want), wd.adds);
              writeAdds(want, merged);
              setAddsSt({ key: want, list: merged });
              addsStRef.current = { key: want, list: merged };
            }
            if (wd.editing) { writeAjEdit(want, null); setAjEditSt(null); setEditAdd(null); }
            setAjNote(tr('Илгээлт татагдсан байна — мөрүүд хуудсанд буцаж орлоо.'));
          }
          writeWdMark(want, null);
        }
      }
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
      /** ⚠️ 2026-10-23 (P1): энэ удаад буцаалтыг буулгаж мэдэгдэл тавьсан эсэх */
      let backSet = false;
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
        setAjBack({ oid: h0.oid, n: pl?.adds.length ?? 0, by: h0.approver ?? '', reason: h0.reason ?? '', at: h0.approverAt });
        backSet = true;
      }
      if (!live()) return;
      /*
       * ⚠️ 2026-10-23 (UX аудит P1): БУЦААЛТЫН ШАЛТГААН ТҮҮХЭЭС — урьд нь мөрүүдийг буулгах агшинд НЭГ УДАА л гардаг тул хуудас
       *    шинэчлэхэд/багц солиход шалтгаан алга болж, зохиогч юуг засахаа мэдэхгүй үлддэг байв. Одоо зохиогчийн СҮҮЛИЙН
       *    шийдвэр нь буцаалт (`restored` — мөрүүд аль хэдийн буусан) бөгөөд шинэ илгээлт хүлээгдээгүй бол шалтгааныг дахин
       *    харуулна. «×»-ээр хаасан (`ajBackHidden`) бол үгүй. `hist` нь шинээс хуучин руу (`loadHistory`).
       */
      if (!backSet) {
        const last = hist.find((h0) => !authOn || h0.author === me);
        const show = !sub && last && last.status === AJIL_STATUS.restored && last.oid !== ajBackHidden(want);
        setAjBack(show && last ? { oid: last.oid, n: last.rowCount, by: last.approver ?? '', reason: last.reason ?? '', at: last.approverAt } : null);
      }
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
          /* ⚠️ 2026-10-09 (аудит №2): татлага унавал (`loadRows` — state хөдлөхөөс ӨМНӨ) сэргээлтийн эффектийн deps
             өөрчлөгдөхгүй тул хүснэгтийн хаалт мөнхөд хаалттай үлдэж, алдаа чимээгүй залгигддаг байв (доорх `catch`).
             Одоо сэргээлтийг ДАХИН эхлүүлж (`hdRetryRestore`), алдааг хэлж, «Шинэчлэх» товчоор (`ajApplied`) дахин оролдуулна. */
          try {
            await refetchRef.current();
          } catch (e) {
            hdRetryRestore();
            if (!live()) return;
            setAjApplied(true);
            setAjErr(tr('Нэмэлт ажил батлагдсан ч шинэ мөрүүдийг серверээс татаж чадсангүй: {0}', userError(e)));
            return;
          }
          if (!live()) return;
          setAjNote(tr('Нэмэлт ажил батлагдаж хуудсанд орлоо — мөрүүд серверээс шинэчлэгдэв.'));
        }
      }
    } catch {
      /* ⚠️ Уншиж чадсангүй ≠ илгээлт алга — хуучин төлөвийг ХЭВЭЭР үлдээнэ */
    }
  }, [pkg.key, user, status, canAddRow, addsStRef, dirtyNRef, hdResetRestore, hdRetryRestore, pkgKeyRef, refetchRef, setAddsSt, uiOpenRef]);
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
      /* ⚠️ Татахаас ӨМНӨ ноорогтой мөрийн oid — `refetch`-ийн завсарт `useSharedDraft` Map-уудыг зөөдөг */
      const cur0 = hdMapsRef.current;
      const dirtyOids = new Set<number>([...cur0.draft.keys(), ...cur0.ham.keys(), ...cur0.aDraft.keys(), ...cur0.resDraft.keys()]);
      hdResetRestore();
      /* ⚠️ 2026-10-09 (аудит №2): татлага унавал сэргээлтийг ДАХИН эхлүүлнэ (`hdRetryRestore`) — эс бөгөөс хүснэгтийн
         хаалт мөнхөд хаалттай; алдааг доорх `catch` (`setErr`) хэлнэ, «Шинэчлэх» товч үлдэнэ (`ajApplied`). */
      let srv: Awaited<ReturnType<typeof refetchRef.current>>;
      try {
        srv = await refetchRef.current();
      } catch (e) {
        hdRetryRestore();
        throw e;
      }
      /*
       * ⚠️ 2026-10-09: ЗУРАГЛАЛ — `savePrep.remapRowsFull` (хадгалахтай НЭГ дүрэм: эцэг бүлгийн зам › № ¦ нэр →
       *    ажлын код → № + нэр). Урьд нь зөвхөн `remapOids` тул бүлэг шилжсэн/нэр засагдсан мөрийн ноорог хаягддаг байв.
       * ⚠️ Map-уудыг ЭНД ЗӨӨХГҮЙ — `useSharedDraft` мөр шинэ жааз болмогц ИЖИЛ зураглалаар зөөнө (мета · дифф
       *    суурьтай хамт). Энд давхар зөөвөл аль хэдийн шинэ түлхүүртэй Map-ыг «олдсонгүй» гэж хаях байв.
       *    Энд зөвхөн oid-оор түлхүүрлэгдсэн БУСАД төлөв (сонголт · шүүлт · эвхэлт) ба мэдэгдэл.
       */
      const { map } = remapRowsFull(oldRows, srv.rows);
      const byOld = new Map(oldRows.map((r) => [r.oid, r]));
      const lostNames: string[] = [];
      for (const o of dirtyOids) {
        if (o < 0 || map.has(o)) continue;
        const r = byOld.get(o);
        lostNames.push(r ? `${r.no ?? '—'} · ${r.work ?? ''}` : String(o));
      }
      const lost = lostNames.length;
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
      /* ⚠️ 2026-10-08: батлагчийн тэмдэглэгээ · бичиж буй нүд ч шинэ oid руу (олдоогүй нь хаягдана) */
      setOkRows?.((st) => {
        const o = new Set<number>();
        for (const k of st) { const nk = map.get(k); if (nk != null) o.add(nk); }
        return o;
      });
      setCellEdit?.((o) => (o == null ? null : map.get(o) ?? null));
      setModal(null); setLinkAsk(null); undoRef.current = null;
      setAjApplied(false);
      /* ⚠️ 2026-10-09: олдоогүй мөрийг НЭРЭЭР — ноорог нь «өнчин» болж үлдэнэ (эцгийн мэдэгдэл · устгах товч) */
      setAjNote(lost
        ? tr('Хуудас шинэчлэгдлээ — {0} мөрийн хадгалаагүй ноорог шинэ мөрөнд олдсонгүй: {1}', num(lost),
          lostNames.slice(0, 5).join('; ') + (lost > 5 ? ` (+${num(lost - 5)})` : ''))
        : tr('Хуудас шинэчлэгдлээ — хадгалаагүй ноорог шинэ мөрүүд рүү зөөгдөв.'));
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  }, [busy, rows, hdMapsRef, hdResetRestore, hdRetryRestore, refetchRef, setBusy, setCollapsed, setErr, setFGrp, setLinkAsk, setModal, setSel, undoRef, setOkRows, setCellEdit]);
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
   * ЭЦЭГГҮЙ НЭМЭЛТ МӨРҮҮД (⚠️ 2026-10-22, аудит №3) — эцэг бүлэг нь одоогийн хуудсанд алга (`ajilApply.missingParents`).
   * ⚠️ Тэд хүснэгтэд ХАРАГДАХГҮЙ (`insertAdds` алгасдаг) тул «×»/«✎»-ээр хүрэх аргагүй атлаа илгээгдэж, батлагдвал
   *    буулгалт «эцэг олдсонгүй» гэж гацдаг байв. Эцэг (`Huvaari`) тэднийг баннерт жагсааж «Устгах» / «Бүлэг сонгох»
   *    үйлдэл өгнө; доорх илгээх/засвар хадгалах нь байхад ХААЛТТАЙ. Мөр ачаалагдаагүй (`rows` хоосон) үед тооцохгүй —
   *    ачаалалтын завсарт бүх мөр «эцэггүй» мэт гялсхийхгүй.
   */
  const ajOrphans = useMemo(() => (rows.length ? missingParents(rows, adds) : []), [rows, adds]);
  /** Эцэггүй мөрийг одоогийн бүлэгт харьяалуулна — `parentIdx` нь СЕРВЕРИЙН `rows`-ын индекс (`addRow`-ийн ⚠️) */
  const setAddParent = useCallback((oid: number, parentOid: number) => {
    const pi = rows.findIndex((r) => r.oid === parentOid);
    const p = pi >= 0 ? rows[pi] : null;
    if (!p || !p.group) return;
    setAdds((a) => a.map((x) => (x.oid === oid ? { ...x, parentNo: p.no, parentWork: p.work, parentIdx: pi } : x)));
    setAjErr('');
    setAjNote(tr('Мөрийг «{0}» бүлэгт харьяалууллаа.', `${p.no} ${p.work}`.trim()));
  }, [rows, setAdds]);

  /**
   * «Нэмэлт ажил батлуулах» — үндсэн өгөгдөлд ЮУ Ч бичихгүй.
   * ⚠️ Хуваарийн «Батлуулах»-аас ТУСДАА: тэр нь ОГНООГ хуваарийн батлах
   *    урсгалд, энэ нь ШИНЭ АЖЛЫГ гэрээнд оруулах эсэхийг 2 шатат урсгалд.
   * ⚠️ Илгээсний дараа `adds` + LS ЦЭВЭРЛЭНЭ: агуулга серверт хадгалагдсан;
   *    локалд үлдвэл дахин илгээгдэж давхар мөр үүснэ. Буцаагдвал/татвал
   *    `refreshAjil`/`withdrawAjilHere` буцааж авчирна.
   */
  /* ⚠️ 2026-10-23 (UX аудит P3): `note` — нэмэгчийн тайлбар (батлагчийн «Нэмэгчийн тайлбар»); урьд нь илгээх цонхгүй тул ҮРГЭЛЖ
     хоосон байв. Амжилттай бол `true` — дуудагч (`Huvaari`-ийн илгээх цонх) тэгэхэд л цонх/текстээ цэвэрлэнэ. */
  const sendAjil = useCallback(async (note?: string): Promise<boolean> => {
    if (!adds.length || ajBusy) return false;
    /* ⚠️ 2026-10-22 (аудит №3): эцэггүй мөртэй үед илгээхгүй — батлагдвал буулгалт гацна (`ajOrphans`-ийн ⚠️) */
    if (ajOrphans.length) { setAjErr(orphanAddsMsg(ajOrphans.length)); return false; }
    /* ⚠️ БАГЦЫГ ОДОО барина (2026-09-25 аудит): `setAdds` нь дарсан агшны `pkg.key`-ийг
       барьдаг тул хүсэлт явж байхад багц солиход Б-гийн мөрүүд харагдахаа больж,
       А-гийн LS илгээсэн мөрөө хадгалсаар буцаж ирдэг байв. Одоо А-г (`want`) шууд
       LS-д бичиж, төлөвийг ЗӨВХӨН тэр багцынх хэвээр бол шинэчилнэ. Зөвхөн
       ИЛГЭЭСЭН мөрүүдийг хасна — завсарт нэмсэн нь үлдэнэ. */
    const want = pkg.key;
    const sent = new Set(adds.map((a) => a.oid));
    /* ⚠️ 2026-10-21 (аудит №1): `await`-ийн ДАРАА багц солигдсон эсэхийг шалгана (`live`) — LS (`want`-аар) хэвээр
       бичигдэнэ, харин ДЭЛГЭЦИЙН төлөв (алдаа · мэдэгдэл · маягт · `refreshAjil`) зөвхөн тэр багц дээр хэвээр бол.
       Урьд нь Б багц руу шилжсэний дараа А-гийн «илгээгдлээ»/алдаа Б-д гарч, `refreshAjil` А-г дэмий татдаг байв.
       `editAjilHere` · `saveAjilEdit` · `withdrawAjilHere` ижил. */
    const live = () => pkgKeyRef.current === want;
    setAjBusy(true); setAjErr(''); setAjNote('');
    try {
      const r = await submitAjil({
        pkgKey: want, pkgGroup: pkg.group, author: user?.username ?? '',
        payload: { v: 1, pkgKey: want, adds },
        note: note?.trim() || undefined,
      });
      if (!r.ok) { if (live()) setAjErr(r.error ? userError(r.error) : tr('Илгээгдсэнгүй.')); return false; }
      const st = addsStRef.current;
      writeAdds(want, (st.key === want ? st.list : readAdds(want)).filter((a) => !sent.has(a.oid)));
      setAddsSt((s) => (s.key === want ? { key: want, list: s.list.filter((a) => !sent.has(a.oid)) } : s));
      if (!live()) return true;
      setAddFor(null);
      setAjNote(tr('Нэмэлт ажил батлуулахаар илгээгдлээ — батлагч шийдвэрлэнэ.'));
      await refreshAjil(null);
      return true;
    } catch (e) {
      if (live()) setAjErr(userError(e));
      return false;
    } finally {
      setAjBusy(false);
    }
  }, [adds, ajBusy, ajOrphans, pkg.key, pkg.group, user, refreshAjil, addsStRef, pkgKeyRef, setAddsSt]);

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
      /* ⚠️ 2026-10-21 (аудит №1): багц солигдсон бол алдааг ч Б-д харуулахгүй — `sendAjil`-ийн ⚠️ */
      if (pkgKeyRef.current !== want) return;
      if (!pl?.adds.length) { setAjErr(tr('Илгээлтийн агуулга уншигдсангүй.')); return; }
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
      if (pkgKeyRef.current === want) setAjErr(userError(e));
    } finally {
      setAjBusy(false);
    }
  }, [ajSub, ajBusy, ajEdit, pkg.key, setAjEdit, addsStRef, pkgKeyRef, setAddsSt]);

  /** Засварыг ИЖИЛ илгээлтэд хадгална — `adds` бүхэлдээ илгээлтийн шинэ агуулга болно */
  const saveAjilEdit = useCallback(async () => {
    if (!ajSub || !ajEdit || ajEdit.oid !== ajSub.oid || ajBusy) return;
    /* ⚠️ 2026-10-22 (аудит №3): засварын шинэ агуулгад эцэггүй мөр орохгүй — `sendAjil`-ийн ижил хаалт */
    if (ajOrphans.length) { setAjErr(orphanAddsMsg(ajOrphans.length)); return; }
    const want = pkg.key;
    const sent = new Set(adds.map((a) => a.oid));
    /* ⚠️ 2026-10-21 (аудит №1): багц солигдсон бол дэлгэцийн төлөвийг хөндөхгүй — `sendAjil`-ийн ⚠️ */
    const live = () => pkgKeyRef.current === want;
    setAjBusy(true); setAjErr(''); setAjNote('');
    try {
      const r = await updateAjil({ oid: ajSub.oid, me: user?.username ?? '', payload: { v: 1, pkgKey: want, adds } });
      if (!r.ok) { if (live()) setAjErr(r.error ? userError(r.error) : tr('Засвар хадгалагдсангүй.')); return; }
      const st = addsStRef.current;
      writeAdds(want, (st.key === want ? st.list : readAdds(want)).filter((a) => !sent.has(a.oid)));
      setAddsSt((s0) => (s0.key === want ? { key: want, list: s0.list.filter((a) => !sent.has(a.oid)) } : s0));
      writeAjEdit(want, null);
      if (!live()) return;
      setAjEditSt(null); setEditAdd(null); setAddFor(null);
      setAjNote(tr('Нэмэлт ажлын засвар хадгалагдлаа — батлагч шинэ хувилбарыг харна.'));
      await refreshAjil(null);
    } catch (e) {
      if (live()) setAjErr(userError(e));
    } finally {
      setAjBusy(false);
    }
  }, [ajSub, ajEdit, ajBusy, ajOrphans, adds, pkg.key, user, refreshAjil, addsStRef, pkgKeyRef, setAddsSt]);

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
    /* ⚠️ 2026-10-23 (UX аудит X1): аппын дотоод асуулт */
    if (!(await askConfirm(tr('Илгээлтээ татах уу? Батлагч шийдвэрлэхээ болино; мөрүүд хуудсанд буцаж орно.'), { ok: tr('Илгээлтээ татах') }))) return;
    /* ⚠️ Багцыг ОДОО барина (2026-09-25 аудит) — `sendAjil`-ийн ижил шалтгаан */
    const want = pkg.key;
    /* ⚠️ 2026-10-21 (аудит №1): багц солигдсон бол дэлгэцийн төлөвийг хөндөхгүй (LS хэвээр) — `sendAjil`-ийн ⚠️ */
    const live = () => pkgKeyRef.current === want;
    setAjBusy(true); setAjErr(''); setAjNote('');
    try {
      const pl = editing ? null : await loadAjilPayload(ajSub.oid);
      const r = await withdrawAjil({ oid: ajSub.oid, me: user?.username ?? '' });
      /* ⚠️ 2026-10-22 (аудит №6): хариу алдагдсан ба дахин уншилт ч унасан (`unsure`) — татагдсан байж болох тул
         мөрүүдийг ТЭМДЭГЛЭНЭ (`adds.WdMark`, LS — багц солигдсон ч); `refreshAjil` (30 с-ийн мөчлөг · хуудас шинэчлэх)
         серверийн төлвөөр шийдэж, «Татсан» бол буулгана. Урьд нь энэ үед мөрүүд бүрмөсөн алга болдог байв. */
      if (!r.ok && r.unsure) writeWdMark(want, { oid: ajSub.oid, adds: pl?.adds ?? [], editing });
      if (!r.ok) { if (live()) setAjErr(r.error ? userError(r.error) : tr('Татагдсангүй.')); return; }
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
      if (editing) { writeAjEdit(want, null); if (live()) setAjEditSt(null); }
      if (!live()) return;
      setAjNote(tr('Илгээлт татагдлаа — мөрүүд хуудсанд буцаж орлоо.'));
      await refreshAjil(null);
    } catch (e) {
      if (live()) setAjErr(userError(e));
    } finally {
      setAjBusy(false);
    }
  }, [ajSub, ajBusy, ajEdit, user, pkg.key, refreshAjil, addsStRef, pkgKeyRef, setAddsSt]);

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
    /* ⚠️ 2026-10-06 аудит: гүйцэтгэлийн нүд · `PvCell`-тэй ИЖИЛ задлагч (`paste.normCell`). Урьд нь
       `.replace(',', '.')` → `Number()` тул «1,250» ЧИМЭЭГҮЙ 1.25 болж (1000 дахин бага), сөрөг
       обьём/өртөг батлуулахаар илгээгддэг байв. Тодорхойгүй (`1,250`) · тоо биш · сөрөг → `NaN`
       (доор ИЛ мэдэгдэнэ); хоосон → `null` (мэдээлэлгүй, 0 биш). */
    const nn = (v: string) => {
      const t0 = v.trim();
      if (t0 === '') return null;
      const t = normCell(t0);
      return t === null || Number(t) < 0 ? NaN : Number(t);
    };
    const vol = nn(addForm.vol);
    const unit = nn(addForm.unit);
    if (!work) { setAjErr(tr('Ажлын нэрийг оруулна уу.')); return null; }
    if (!/^\d+$/.test(no)) {
      setAjErr(tr('№ нь бүхэл тоо байх ёстой (жишээ «12») — бутархай дугаар нь бүлгийн мөрийг заадаг тул ажлын тоололд орохгүй.'));
      return null;
    }
    if (Number.isNaN(vol) || Number.isNaN(unit)) {
      setAjErr(tr('Обьём ба Нэгж өртөг нь сөрөг биш тоо байх ёстой — «1,250» мэтийг тодорхойгүй тул 1250 эсвэл 1.25 гэж бичнэ үү.'));
      return null;
    }
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
  /**
   * Батлуулаагүй мөрийг хасах — зөвхөн локал (`adds` + LS).
   * ⚠️ 2026-10-23 (UX аудит P2): «×» нэг товшилтоор асуултгүй, БУЦААХ замгүй устгадаг байв — одоо «↶ Буцаах» мэдэгдэл (6 с)
   *    мөрийг ӨМНӨХ байрлалд нь сэргээнэ. Сэргээлт LS-ээр (`want`) — хооронд багц солигдсон бол тэр багцын төлөвийг хөндөхгүй
   *    (`setAdds` нь дарсан агшны багцыг барьдаг тул ашиглахгүй).
   */
  const dropAdd = useCallback((oid: number) => {
    const want = pkg.key;
    const st = addsStRef.current;
    const list = st.key === want ? st.list : readAdds(want);
    const i = list.findIndex((x) => x.oid === oid);
    if (i < 0) return;
    const removed = list[i];
    setAdds((a) => a.filter((x) => x.oid !== oid));
    void toastUndo(tr('«{0}» мөр хасагдлаа.', `${removed.no} ${removed.work}`.trim()), () => {
      const cur = addsStRef.current;
      const base = cur.key === want ? cur.list : readAdds(want);
      if (base.some((x) => x.oid === removed.oid)) return;
      const next = base.slice();
      next.splice(Math.min(i, next.length), 0, removed);
      writeAdds(want, next);
      if (cur.key === want) {
        setAddsSt({ key: want, list: next });
        addsStRef.current = { key: want, list: next };
      }
    });
  }, [pkg.key, addsStRef, setAdds, setAddsSt]);

  return {
    addFor, setAddFor, addForm, setAddForm, ajSub, ajEdit, editAdd, setEditAdd,
    ajBusy, ajErr, setAjErr, ajNote, setAjNote, ajBack, setAjBack, dismissAjBack, ajStuck, ajApplied,
    refreshAfterApplied, sendAjil, editAjilHere, saveAjilEdit, cancelAjilEdit,
    withdrawAjilHere, saveEditAdd, addRow, dropAdd,
    /* ⚠️ 2026-10-22 (аудит №3): эцэггүй нэмэлт мөр ба бүлэгт харьяалуулах (`ajOrphans`-ийн ⚠️) */
    ajOrphans, setAddParent,
  };
}
