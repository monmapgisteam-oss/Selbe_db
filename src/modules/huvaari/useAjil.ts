import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { userError } from '@/components/ui';
import { askConfirm, toastUndo } from '@/lib/confirm';
import type { SheetRow } from '@/modules/sheet/bagtsSheet';
import type { Pkg } from '@/modules/sheet/bagts.pkg';
import type { NewRow } from '@/modules/sheet/sheetFrame';
import type { PlanRow } from '@/lib/plan';
import type { PkgPlan, PkgRes } from '@/lib/huvaariObyem';
import {
  AJIL_STATUS, loadApproved as loadAjilApproved, loadHead as loadAjilHead, loadHistory as loadAjilHistory,
  loadPayload as loadAjilPayload, loadPending as loadAjilPending, markRestored as markAjilRestored,
  submitAjil, updateAjil, withdrawAjil, displayAjilReason, type AjilSubmission,
} from '@/lib/ajilBatlah';
import { missingParents } from '@/lib/ajilApply';
import {
  EMPTY_FORM, ajBackHidden, hideAjBack, mergeIncoming, nextTmpOid, pushTmpOid, readAdds, readAjEdit, readWdMark, writeAdds, writeAjEdit, writeWdMark,
  type AddForm, type AjEdit,
} from './adds';
import type { ADraft, Draft, ResDraft } from './types';
import { remapRowsFull } from './savePrep';
import { normCell } from '@/modules/sheet/paste';

export const orphanAddsMsg = (n0: number): string =>
  tr('{0} нэмэлт мөрийн эцэг бүлэг хуудсанд олдсонгүй — доорх жагсаалтаас устгах эсвэл одоо байгаа бүлэгт харьяалуулаад дахин илгээнэ үү.', num(n0));

/**
 * НЭМЭЛТ АЖИЛ — локал ноорог (`adds`) · илгээх · засах · татах · буцаагдсаныг буулгах
 * (2026-09-30: `Huvaari.tsx`-ээс механикаар салгав; логик · тайлбар ХЭВЭЭР).
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
  hdRetryRestore: () => void;
  hdMapsRef: React.RefObject<{ draft: Draft; ham: Map<number, string>; aDraft: ADraft; resDraft: ResDraft }>;
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
  setOkRows?: React.Dispatch<React.SetStateAction<Set<number>>>;
  setCellEdit?: React.Dispatch<React.SetStateAction<number | null>>;
}) {
  /* ── НЭМЭЛТ АЖИЛ (2026-09-24; `adds.ts`-ийн `tmpOid`). `adds`/`addsSt` нь ЭЦЭГТ (`rowsAll`-д хэрэгтэй) — параметрээр. ── */
  /** Маягт нээлттэй байгаа БҮЛГИЙН oid */
  const [addFor, setAddFor] = useState<number | null>(null);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_FORM);
  /** Хүлээгдэж буй нэмэлт ажлын илгээлт — БҮХ хүнд харагдана */
  const [ajSub, setAjSub] = useState<AjilSubmission | null>(null);
  /** `ajSub` аль багцад АЧААЛАГДСАН — `null` = хараахан уншаагүй (засварын төлөвийг эрт арчихгүйн тулд) */
  const [ajSubFor, setAjSubFor] = useState<string | null>(null);
  /** Хүлээгдэж буй илгээлтээ ЗАСАЖ буй төлөв (2026-09-29) — `AjEdit` */
  const [ajEdit, setAjEditSt] = useState<AjEdit | null>(null);
  /** Засаж буй НЭМЭЛТ МӨР (түр oid) — маягт тэр мөрийн доор нээгдэнэ */
  const [editAdd, setEditAdd] = useState<number | null>(null);
  const [ajBusy, setAjBusy] = useState(false);
  const [ajErr, setAjErr] = useState('');
  const [ajNote, setAjNote] = useState('');
  /** Буцаагдсан — зохиогчид шалтгаантай нь (2026-10-23, P1: `oid` — хаасныг санахад, `at` — шийдвэрийн огноо) */
  const [ajBack, setAjBack] = useState<{ oid: number; n: number | null; by: string; reason: string; at: number | null } | null>(null);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  /**
   * Хүлээгдэж буй илгээлт · буцаагдсан · батлагдсан-буугаагүй төлөв.
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
      let backSet = false;
      for (const h0 of hist) {
        if (lookBack && h0.oid === prevOid && h0.status === AJIL_STATUS.applied) applied = true;
        if (lookBack && h0.oid === prevOid && h0.status === AJIL_STATUS.approved) midway = true;
        if (h0.status !== AJIL_STATUS.returned) continue;
        if (authOn && h0.author !== me) continue;
        if (!canAddRow) continue;
        const pl = await loadAjilPayload(h0.oid);
        if (!live()) return;
        if (pl?.adds.length) {
          const cur = addsStRef.current;
          const merged = mergeIncoming(cur.key === want ? cur.list : [], pl.adds);
          writeAdds(want, merged);
          setAddsSt({ key: want, list: merged });
          addsStRef.current = { key: want, list: merged };
        }
        if (!live()) return;
        await markAjilRestored(h0.oid);
        if (!live()) return;
        setAjBack({ oid: h0.oid, n: pl?.adds.length ?? 0, by: h0.approver ?? '', reason: displayAjilReason(h0.reason), at: h0.approverAt });
        backSet = true;
      }
      if (!live()) return;
      if (!backSet) {
        const last = hist.find((h0) => !authOn || h0.author === me);
        const show = !sub && last && last.status === AJIL_STATUS.restored && last.oid !== ajBackHidden(want);
        setAjBack(show && last ? { oid: last.oid, n: last.rowCount, by: last.approver ?? '', reason: displayAjilReason(last.reason), at: last.approverAt } : null);
      }
      setAjTrack((t) => (midway ? prevOid : prevOid != null && t === prevOid ? null : t));
      if (applied) {
        if (dirtyNRef.current > 0 || uiOpenRef.current) {
          setAjApplied(true);
        } else {
          hdResetRestore();
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
    } catch
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
      const cur0 = hdMapsRef.current;
      const dirtyOids = new Set<number>([...cur0.draft.keys(), ...cur0.ham.keys(), ...cur0.aDraft.keys(), ...cur0.resDraft.keys()]);
      hdResetRestore();
      let srv: Awaited<ReturnType<typeof refetchRef.current>>;
      try {
        srv = await refetchRef.current();
      } catch (e) {
        hdRetryRestore();
        throw e;
      }
      const { map } = remapRowsFull(oldRows, srv.rows);
      const byOld = new Map(oldRows.map((r) => [r.oid, r]));
      const lostNames: string[] = [];
      for (const o of dirtyOids) {
        if (o < 0 || map.has(o)) continue;
        const r = byOld.get(o);
        lostNames.push(r ? `${r.no ?? '—'} · ${r.work ?? ''}` : String(o));
      }
      const lost = lostNames.length;
      setSel((o) => (o == null ? null : map.get(o) ?? null));
      setFGrp((g) => (g === 'all' ? g : map.get(g) ?? 'all'));
      setCollapsed((st) => {
        const o = new Set<number>();
        for (const k of st) { const nk = map.get(k); if (nk != null) o.add(nk); }
        return o;
      });
      setOkRows?.((st) => {
        const o = new Set<number>();
        for (const k of st) { const nk = map.get(k); if (nk != null) o.add(nk); }
        return o;
      });
      setCellEdit?.((o) => (o == null ? null : map.get(o) ?? null));
      setModal(null); setLinkAsk(null); undoRef.current = null;
      setAjApplied(false);
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
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refreshAjil(null); }, [refreshAjil]);
  useEffect(() => {
    const oid = ajSub?.oid ?? ajTrack;
    if (oid == null) return;
    const t = window.setInterval(() => { void refreshAjil(oid); }, 30_000);
    return () => window.clearInterval(t);
  }, [ajSub, ajTrack, refreshAjil]);

  /**
   * ЭЦЭГГҮЙ НЭМЭЛТ МӨРҮҮД (2026-10-22, аудит №3) — эцэг бүлэг нь одоогийн хуудсанд алга (`ajilApply.missingParents`).
   */
  const ajOrphans = useMemo(() => (rows.length ? missingParents(rows, adds) : []), [rows, adds]);
  /** Эцэггүй мөрийг одоогийн бүлэгт харьяалуулна — `parentIdx` нь СЕРВЕРИЙН `rows`-ын индекс (`addRow`) */
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
   */
  const sendAjil = useCallback(async (note?: string): Promise<boolean> => {
    if (!adds.length || ajBusy) return false;
    if (ajOrphans.length) { setAjErr(orphanAddsMsg(ajOrphans.length)); return false; }
    const want = pkg.key;
    const sent = new Set(adds.map((a) => a.oid));
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
   */
  const setAjEdit = useCallback((v: AjEdit | null) => { writeAjEdit(pkg.key, v); setAjEditSt(v); }, [pkg.key]);
  const editAjilHere = useCallback(async () => {
    if (!ajSub || ajBusy || ajEdit) return;
    const want = pkg.key;
    setAjBusy(true); setAjErr(''); setAjNote('');
    try {
      const pl = await loadAjilPayload(ajSub.oid);
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
    if (ajOrphans.length) { setAjErr(orphanAddsMsg(ajOrphans.length)); return; }
    const want = pkg.key;
    const sent = new Set(adds.map((a) => a.oid));
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

  useEffect(() => {
    if (!ajEdit || ajSubFor !== pkg.key) return;
    if (ajSub && ajSub.oid === ajEdit.oid) return;
    const drop = new Set(ajEdit.rows);
    setAdds((a) => a.filter((x) => !drop.has(x.oid)));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAjEdit(null); setEditAdd(null);
    setAjNote(tr('Засаж байсан илгээлт хооронд нь шийдвэрлэгдсэн тул засвар хаагдлаа.'));
  }, [ajEdit, ajSub, ajSubFor, pkg.key, setAdds, setAjEdit]);

  /** ИЛГЭЭЛТЭЭ ТАТАХ — зохиогч алдаатай илгээлтээ буцааж авна; мөрүүд `adds` руу */
  const withdrawAjilHere = useCallback(async () => {
    if (!ajSub || ajBusy) return;
    const editing = !!ajEdit && ajEdit.oid === ajSub.oid;
    if (!(await askConfirm(tr('Илгээлтээ татах уу? Батлагч шийдвэрлэхээ болино; мөрүүд хуудсанд буцаж орно.'), { ok: tr('Илгээлтээ татах') }))) return;
    const want = pkg.key;
    const live = () => pkgKeyRef.current === want;
    setAjBusy(true); setAjErr(''); setAjNote('');
    try {
      const pl = editing ? null : await loadAjilPayload(ajSub.oid);
      const r = await withdrawAjil({ oid: ajSub.oid, me: user?.username ?? '' });
      if (!r.ok && r.unsure) writeWdMark(want, { oid: ajSub.oid, adds: pl?.adds ?? [], editing });
      if (!r.ok) { if (live()) setAjErr(r.error ? userError(r.error) : tr('Татагдсангүй.')); return; }
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
   */
  /** Маягтын шалгалт — нэмэх ба засах ХОЁУЛАА (нэг дүрэм) */
  const readForm = useCallback((): { no: string; work: string; vol: number | null; unit: number | null } | null => {
    const no = addForm.no.trim();
    const work = addForm.work.trim();
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
    ajOrphans, setAddParent,
  };
}
