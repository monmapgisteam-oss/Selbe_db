import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Pkg, Schema } from "../bagts.pkg";
import { applyUpdates, loadRows, type SheetRow } from "../bagtsSheet";
import { buildOidMap, rowKeyOf } from "../sheetFrame";
import {
  claimObyem, clearObyemPartial, decideObyem, markObyemPartial, obyemApproveGuard, releaseObyemClaim, loadHistory as loadObyemHistory, loadPending as loadObyemPending, loadPayload as loadObyemPayload,
  loadHead as loadObyemHead,
  submitObyem, withdrawObyem, OBYEM_STATUS, type ObyemSubmission, type ObyemPayload,
  partialBy as obyemPartialBy, returnStuckObyem,
} from '@/lib/obyemBatlah';
import { isLostWrite } from '@/lib/lostWrite';
import { archivingBusy } from '@/lib/submission';
import { ajilApplyBusyFor } from '@/lib/ajilBatlah';
import { t as tr } from "@/lib/i18nCore";
import { userError } from '@/components/ui';
import { askConfirm } from '@/lib/confirm';
import { num } from '@/lib/format';

const SKIP_NOTE = 'Алгассан нүд';

/** Жаазын танигч — мөрүүдийн OID-ын дараалал + бөглөсөн огноо (утга БИШ — бид өөрсдөө бичсэн) */
const frameIdOf = (x: { rows: readonly { oid: number }[]; snapshot: number | null }): string =>
  `${x.snapshot ?? ''}|${x.rows.map((r) => r.oid).join(',')}`;

/**
 * ОБЬЁМЫН ТӨЛӨВ (зөвхөн `useState`) — 2026-10-01: `useObyem`-ээс САЛГАВ.
 */
export function useObyemState() {
  /**
   * Инженерийн обьёмын НООРОГ — `oid` → бичсэн текст ("" = цэвэрлэх).
   */
  const [pvPend, setPvPend] = useState<Record<number, string>>({});
  /** Хүлээгдэж буй илгээлт — байвал багана ТҮГЖИГДЭНЭ */
  const [pvSub, setPvSub] = useState<ObyemSubmission | null>(null);
  /**
   * СҮҮЛИЙН ШИЙДВЭР НЬ БУЦААЛТ бол тэр илгээлт (2026-10-01, хэрэглэгч: бүгдийг зас).
   */
  const [pvReturned, setPvReturned] = useState<ObyemSubmission | null>(null);
  const [pvApproved, setPvApproved] = useState<ObyemSubmission | null>(null);
  /** Батлагчийн урьдчилан харах агуулга (`oid` → утга) */
  const [pvPreview, setPvPreview] = useState<Map<number, number | null> | null>(null);
  const [pvBusy, setPvBusy] = useState(false);
  const [pvErr, setPvErr] = useState("");
  const [pvNote, setPvNote] = useState("");
  return {
    pvPend, setPvPend, pvSub, setPvSub, pvReturned, setPvReturned, pvPreview, setPvPreview,
    pvBusy, setPvBusy, pvErr, setPvErr, pvNote, setPvNote, pvApproved, setPvApproved,
  };
}
export type ObyemState = ReturnType<typeof useObyemState>;

export function useObyem({ st, pkg, pkgKeyRef, rows, sc, user, locked, todayFillMs, setRows }: {
  st: ObyemState;
  pkg: Pkg;
  /** ОДОО сонгогдсон багцын түлхүүр — синхрон (FillNew-ийн `pkgKeyRef`) */
  pkgKeyRef: RefObject<string>;
  rows: SheetRow[];
  sc: Schema | null;
  user: { username: string } | null;
  locked: boolean;
  todayFillMs?: number;
  setRows?: (u: (rs: SheetRow[]) => SheetRow[]) => void;
}) {
  const {
    pvPend, setPvPend, pvSub, setPvSub, pvReturned, setPvReturned, pvPreview, setPvPreview,
    pvBusy, setPvBusy, pvErr, setPvErr, pvNote, setPvNote, pvApproved, setPvApproved,
  } = st;

  /* ══════════ ИНЖЕНЕРИЙН ОБЬЁМЫН УРСГАЛ ══════════ */

  /**
   * Хүлээгдэж буй илгээлтийг татах — багц солигдох ба шийдвэрийн дараа.
   */
  const refreshSeq = useRef(0);
  const refreshObyem = useCallback(async () => {
    const want = pkg.key;
    const seq = ++refreshSeq.current;
    const stale = () => pkgKeyRef.current !== want || refreshSeq.current !== seq;
    try {
      const sub = await loadObyemPending(want);
      if (stale()) return;
      setPvSub(sub);
      if (sub) { setPvReturned(null); setPvApproved(null); }
      else {
        const last = (await loadObyemHistory(want, 1))[0] ?? null;
        if (stale()) return;
        setPvReturned(last && last.status === OBYEM_STATUS.returned ? last : null);
        setPvApproved(last && last.status === OBYEM_STATUS.approved ? last : null);
      }
      /* Батлагч бол агуулгыг нь урьдчилан харуулна */
      if (sub) {
        const pl = await loadObyemPayload(sub.oid);
        if (stale()) return;
        setPvPreview(pl ? new Map(pl.cells) : null);
      } else {
        setPvPreview(null);
      }
    } catch
  }, [pkg.key, pkgKeyRef, setPvSub, setPvReturned, setPvPreview, setPvApproved]);

  useEffect(() => { void refreshObyem(); }, [refreshObyem, todayFillMs]);


  /** Ноорогт өөрчлөгдсөн нүд — тоо ба payload-ын эх */
  const pvCells = useMemo(() => {
    const out: [number, number | null][] = [];
    const byOid = new Map(rows.map((r) => [r.oid, r]));
    for (const [k, raw] of Object.entries(pvPend)) {
      const oid = Number(k);
      const r = byOid.get(oid);
      if (!r) continue;
      const t = raw.trim();
      const v = t === "" ? null : Number(t);
      if (v !== null && !Number.isFinite(v)) continue;
      /* Хадгалагдсантайгаа ижил бол өөрчлөлт БИШ */
      if ((r.plannedVol ?? null) === v) continue;
      out.push([oid, v]);
    }
    return out;
  }, [pvPend, rows]);

  /** «Обьём батлуулах» — үндсэн өгөгдөлд ЮУ Ч бичихгүй */
  const sendObyem = useCallback(async () => {
    if (!pvCells.length || pvBusy) return;
    setPvBusy(true); setPvErr(""); setPvNote("");
    try {
      const pvOids = new Set(pvCells.map(([o]) => o));
      const payload: ObyemPayload & { rowKeys: [number, string][] } = {
        v: 1,
        pkgKey: pkg.key,
        cells: pvCells,
        rowKeys: rows.filter((r) => pvOids.has(r.oid)).map((r): [number, string] => [r.oid, rowKeyOf(r)]),
      };
      const r = await submitObyem({
        pkgKey: pkg.key,
        pkgGroup: pkg.group,
        author: user?.username ?? '',
        payload,
      });
      if (pkgKeyRef.current !== payload.pkgKey) return;
      if (!r.ok) { setPvErr(r.error ? userError(r.error) : tr('Илгээгдсэнгүй.')); return; }
      setPvPend({});
      setPvNote(tr('Инженерийн обьём батлуулахаар илгээгдлээ — батлагч шийдвэрлэнэ.'));
      await refreshObyem();
    } catch (e) {
      if (pkgKeyRef.current === pkg.key) setPvErr(userError(e));
    } finally {
      setPvBusy(false);
    }
  }, [pvCells, pvBusy, pkg.key, pkg.group, user, refreshObyem, rows, pkgKeyRef, setPvBusy, setPvErr, setPvNote, setPvPend]);

  const wroteSomeRef = useRef(false);
  const wroteForRef = useRef<number | null>(null);

  /**
   * ШИЙДВЭР — батлах эсвэл буцаах.
   */
  const decideObyemHere = useCallback(async (approve: boolean, reason?: string) => {
    if (!pvSub || pvBusy || !sc || locked) return;
    const want = pkg.key;
    const here = () => pkgKeyRef.current === want;
    const pvErrHere = (s: string) => { if (here()) setPvErr(s); };
    setPvBusy(true); setPvErr(""); setPvNote("");
    /** Сүүлийн жаазад тулгагдаагүй тул бичигдээгүй нүдний тоо (доорх) */
    let pvSkipped = 0;
    let wroteMain = false;
    let holdClaim = false;
    let claimAt: number | undefined;
    if (wroteSomeRef.current && wroteForRef.current !== pvSub.oid) wroteSomeRef.current = false;
    wroteForRef.current = pvSub.oid;
    /** Бичигдсэний ДАРАА шийдвэр унасан үеийн тайлбар — юу болсон, яах вэ */
    const afterWrite = (why: string) => tr('Утгууд үндсэн өгөгдөлд АЛЬ ХЭДИЙН бичигдсэн, гэхдээ илгээлтийг «Батлагдсан» болгож чадсангүй ({0}). Хуудсаа шинэчлээд «Обьём батлах»-ыг дахин дарна уу — ижил утга дахин бичигдэх тул аюулгүй. Давтан унавал админд мэдэгдэнэ үү.', why);
    const doneByMe = async (): Promise<boolean> => {
      if (!approve) return false;
      try {
        const h = await loadObyemHead(pvSub.oid);
        const meLc = (user?.username ?? '').trim().toLowerCase();
        return !!h && !!meLc && h.status === OBYEM_STATUS.approved && h.approver === meLc;
      } catch {
        return false;
      }
    };
    /** Алгассан нүдний тэмдэглэл (`decideObyem.skipped`) — батлагч санаатайгаар зөвшөөрсөн үед л */
    let skipNote = '';
    try {
      if (approve) {
        const fld = sc.f.plannedVol;
        if (!fld) {
          setPvErr(tr('Энэ багцын үйлчилгээнд талбар байхгүй тул батлах боломжгүй.'));
          return;
        }
        const pre = await decideObyem({
          oid: pvSub.oid,
          approve: true,
          approver: user?.username ?? '',
          author: pvSub.author,
          dryRun: true,
        });
        if (!pre.ok) {
          if (await doneByMe()) {
            if (here()) setPvNote(tr('Энэ илгээлтийг та өөр цонхноос аль хэдийн баталсан байна — үндсэн өгөгдөлд бичигдсэн.'));
            await refreshObyem();
            return;
          }
          pvErrHere(pre.error ? userError(pre.error) : tr('Шийдвэр хадгалагдсангүй — холболтоо шалгаад дахин дарна уу.'));
          return;
        }
        const pl = await loadObyemPayload(pvSub.oid);
        if (!pl) { pvErrHere(tr('Илгээлтийн агуулга уншигдсангүй.')); return; }
        const base = await loadRows(pkg, sc, undefined, undefined, { strict: true });
        const freshOids = new Set(base.rows.map((r) => r.oid));
        const pageOids = new Set(rows.map((r) => r.oid));
        let map = new Map<number, number>();
        if (pl.cells.some(([oid]) => !freshOids.has(oid))) {
          if (pl.cells.every(([oid]) => pageOids.has(oid))) {
            map = buildOidMap(rows.filter((r) => r.oid >= 0).map((r): [number, string] => [r.oid, rowKeyOf(r)]), base.rows);
          } else {
            const rk0 = (pl as { rowKeys?: unknown }).rowKeys;
            const rk = Array.isArray(rk0)
              ? rk0.filter((e): e is [number, string] => Array.isArray(e) && Number.isInteger(e[0]) && typeof e[1] === 'string')
              : [];
            const cnt = new Map<string, number>();
            for (const r of base.rows) cnt.set(rowKeyOf(r), (cnt.get(rowKeyOf(r)) ?? 0) + 1);
            map = buildOidMap(rk.filter(([, k]) => cnt.get(k) === 1), base.rows);
          }
        }
        let skippedN = 0;
        const skippedLbl: string[] = [];
        const keyOf = new Map<number, string>(Array.isArray(pl.rowKeys) ? pl.rowKeys : []);
        const upd: Record<string, unknown>[] = [];
        for (const [oid, v] of pl.cells) {
          const to = freshOids.has(oid) ? oid : map.get(oid);
          if (to == null || !freshOids.has(to)) {
            skippedN++;
            skippedLbl.push(`${keyOf.get(oid) ?? `#${oid}`} = ${v ?? '∅'}`);
            continue;
          }
          upd.push({ [sc.f.oid]: to, [fld]: v });
        }
        if (!upd.length) {
          pvErrHere(tr('Илгээлтийн мөрүүд одоогийн хуудсанд олдсонгүй — хуудсаа шинэчилнэ үү.'));
          return;
        }
        if (skippedN > 0) {
          const list = skippedLbl.slice(0, 20).join('; ') + (skippedLbl.length > 20 ? ` … (+${skippedLbl.length - 20})` : '');
          if (!(await askConfirm(tr('{0} нүд архивын сүүлийн жаазад тулгагдсангүй — тэдгээр нь үндсэн өгөгдөлд БИЧИГДЭХГҮЙ: {1}. Үлдсэн {2} нүдийг батлах уу? Алгассан нүд илгээлтийн тайлбарт тэмдэглэгдэнэ.', skippedN, list, upd.length), { ok: tr('Үлдсэнийг батлах') }))) {
            pvErrHere(tr('Батлалт цуцлагдлаа — {0} нүд сүүлийн жаазад тулгагдсангүй: {1}. Буцааж, инженерээр дахин илгээлгэнэ үү.', skippedN, list));
            return;
          }
          skipNote = `${SKIP_NOTE} (${skippedN}): ${skippedLbl.join('; ')}`;
        }
        const me = user?.username ?? '';
        const alreadyMine = async (): Promise<boolean> => {
          if (!(await doneByMe())) return false;
          if (here()) setPvNote(tr('Энэ илгээлтийг та өөр цонхноос аль хэдийн баталсан байна — үндсэн өгөгдөлд бичигдсэн.'));
          await refreshObyem();
          return true;
        };
        const archBusy = async (): Promise<string | null> => {
          try {
            const a = await archivingBusy(pkg.key);
            if (a) return tr('{0} гүйцэтгэлийг яг одоо архивлаж байна — дуусахыг хүлээнэ үү', a.who || '—');
          } catch (e) {
            return tr('Энэ багцын гүйцэтгэлийн архивлалтын төлөв уншигдсангүй ({0}) — юу ч бичсэнгүй, дахин оролдоно уу.', userError(e));
          }
          try {
            const aj = await ajilApplyBusyFor(pkg.key);
            return aj ? tr('{0} энэ багцад нэмэлт ажлыг яг одоо хуудсанд буулгаж байна — дуусахыг хүлээнэ үү. Юу ч бичсэнгүй.', aj.who || '—') : null;
          } catch (e) {
            return tr('Нэмэлт ажлын буулгалтын төлөв шалгагдсангүй ({0}) — юу ч бичсэнгүй, дахин оролдоно уу.', userError(e));
          }
        };
        const ab0 = await archBusy();
        if (ab0) { pvErrHere(ab0); return; }
        const claim = await claimObyem({ oid: pvSub.oid, approver: me });
        if (!claim.ok) {
          if (await alreadyMine()) return;
          pvErrHere(claim.error ? userError(claim.error) : tr('Шийдвэр хадгалагдсангүй — холболтоо шалгаад дахин дарна уу.'));
          return;
        }
        holdClaim = true;
        claimAt = claim.at;
        const why = await obyemApproveGuard({ oid: pvSub.oid, approver: me, claimAt });
        if (why) {
          if (await alreadyMine()) return;
          pvErrHere(why);
          return;
        }
        try {
          const h0 = await loadObyemHead(pvSub.oid);
          if (h0 && obyemPartialBy(h0.status, h0.reason) != null) wroteSomeRef.current = true;
        } catch { /* тэмдэг эзэнтэй арилдаг — таамаглахгүй */ }
        const mk = await markObyemPartial({ oid: pvSub.oid, approver: me, claimAt });
        if (mk.existing) wroteSomeRef.current = true;
        if (!mk.ok) {
          pvErrHere(tr('Хагас бичилтийн хамгаалалтын тэмдэг хадгалагдсангүй ({0}) — үндсэн өгөгдөлд юу ч бичигдсэнгүй; дахин оролдоно уу.', mk.error ?? ''));
          return;
        }
        const ab1 = await archBusy();
        if (ab1) {
          if (!wroteSomeRef.current) await clearObyemPartial(pvSub.oid, me);
          pvErrHere(ab1);
          return;
        }
        try {
          await applyUpdates(pkg, upd);
        } catch (e) {
          if (((e as { written?: number })?.written ?? 0) > 0 || isLostWrite(e)) wroteSomeRef.current = true;
          if ((e as { written?: number })?.written === 0 && !isLostWrite(e) && !wroteSomeRef.current) await clearObyemPartial(pvSub.oid, me);
          else { holdClaim = false; wroteMain = true; }
          throw e;
        }
        wroteSomeRef.current = true;
        holdClaim = false;
        wroteMain = true;
        pvSkipped = skippedN;
        let moved: boolean | null = null;
        try {
          moved = frameIdOf(await loadRows(pkg, sc, undefined, undefined, { strict: true })) !== frameIdOf(base);
        } catch {
          moved = null;
        }
        if (moved !== false) {
          pvErrHere(moved
            ? tr('Бичих зуур хуудасны жааз солигдсон (өөр батлалт/илгээлт) — утга хуучин жаазад бичигдсэн байж болзошгүй. Илгээлт «Хүлээгдэж буй» хэвээр; хуудсаа шинэчлээд «Обьём батлах»-ыг дахин дарна уу.')
            : tr('Бичсэний дараах жаазын шалгалт унав — илгээлт «Хүлээгдэж буй» хэвээр; хуудсаа шинэчлээд «Обьём батлах»-ыг дахин дарна уу.'));
          return;
        }
        if (here() && setRows) {
          const wrote = new Map(upd.map((u) => [Number(u[sc.f.oid]), (u[fld] ?? null) as number | null]));
          setRows((rs) => rs.map((r) => (wrote.has(r.oid) ? { ...r, plannedVol: wrote.get(r.oid) ?? null } : r)));
        }
      }
      const r = await decideObyem({
        oid: pvSub.oid,
        approve,
        approver: user?.username ?? '',
        author: pvSub.author,
        reason,
        ...(skipNote ? { skipped: skipNote } : {}),
        ...(claimAt != null ? { claimAt } : {}),
      });
      const sameMe = !r.ok && (await doneByMe());
      if (r.ok || sameMe) wroteSomeRef.current = false;
      if (!here()) return;
      if (!r.ok && !sameMe) { setPvErr(wroteMain ? afterWrite(userError(r.error ?? '')) : (r.error ? userError(r.error) : tr('Шийдвэр хадгалагдсангүй — холболтоо шалгаад дахин дарна уу.'))); return; }
      setPvNote(approve
        ? tr('Инженерийн обьём батлагдаж, үндсэн өгөгдөлд бичигдлээ.')
          + (pvSkipped ? ' ' + tr('{0} мөр архивын сүүлийн жаазад тулгагдаагүй тул бичигдсэнгүй.', pvSkipped) : '')
        : tr('Буцаагдлаа — инженер засаад дахин илгээнэ.'));
      await refreshObyem();
    } catch (e) {
      const m = userError(e);
      pvErrHere(wroteMain ? afterWrite(m) : m);
    } finally {
      if (holdClaim) void releaseObyemClaim({ oid: pvSub.oid, approver: user?.username ?? '' });
      setPvBusy(false);
    }
  }, [pvSub, pvBusy, sc, rows, pkg, user, refreshObyem, locked, pkgKeyRef, setRows, setPvBusy, setPvErr, setPvNote]);

  /**
   * ТАТАН АВАХ — инженер өөрийн хүлээгдэж буй обьёмын илгээлтийг цуцална (2026-10-04).
   */
  const withdrawObyemHere = useCallback(async () => {
    if (!pvSub || pvBusy) return;
    if (!(await askConfirm(tr('Обьёмын илгээлтээ ({0} нүд) татаж авах уу? Батлагч үүнийг цаашид харахгүй; засаад дахин илгээж болно.', num(pvSub.cellCount)), { ok: tr('Илгээлтээ татаж авах') }))) return;
    const want = pkg.key;
    setPvBusy(true); setPvErr(""); setPvNote("");
    try {
      const r = await withdrawObyem({ oid: pvSub.oid, me: user?.username ?? '' });
      if (pkgKeyRef.current !== want) return;
      if (!r.ok) { setPvErr(r.error ? userError(r.error) : tr('Татаж авч чадсангүй.')); return; }
      setPvNote(tr('Обьёмын илгээлтийг татаж авлаа.'));
      await refreshObyem();
    } catch (e) {
      if (pkgKeyRef.current === want) setPvErr(userError(e));
    } finally {
      setPvBusy(false);
    }
  }, [pvSub, pvBusy, pkg.key, user, refreshObyem, pkgKeyRef, setPvBusy, setPvErr, setPvNote]);
  /**
   * ГАЦСАН (ХАГАС БИЧИГДСЭН) ИЛГЭЭЛТИЙГ БУЦААХ — 2026-10-09 (`obyemBatlah.returnStuckObyem`).
   * `PARTIAL_MARK`-тай илгээлтийг жирийн «Буцаах» татгалздаг тул батлагч бичилтийг гүйцээж чадахгүй бол
   * илгээлт мөнхөд `pending` үлдэж багц (обьём · нэмэлт ажил) түгжигддэг байв. Дүрэм (хүрээ · өөр
   * батлагчийн түгжээ · CAS) lib-д. Товч нь `partial != null` үед л.
   */
  const returnStuck = useCallback(async (reason: string) => {
    if (!pvSub || pvBusy || locked) return;
    const want = pkg.key;
    setPvBusy(true); setPvErr(""); setPvNote("");
    try {
      const r = await returnStuckObyem({ oid: pvSub.oid, approver: user?.username ?? '', reason });
      if (pkgKeyRef.current !== want) return;
      if (!r.ok) { setPvErr(r.error ? userError(r.error) : tr('Шийдвэр хадгалагдсангүй — холболтоо шалгаад дахин дарна уу.')); return; }
      setPvNote(tr('Буцаагдлаа — инженер засаад дахин илгээнэ.'));
      await refreshObyem();
    } catch (e) {
      if (pkgKeyRef.current === want) setPvErr(userError(e));
    } finally {
      setPvBusy(false);
    }
  }, [pvSub, pvBusy, locked, pkg.key, user, refreshObyem, pkgKeyRef, setPvBusy, setPvErr, setPvNote]);
  return {
    pvPend, setPvPend, pvSub, setPvSub, pvPreview, setPvPreview, pvBusy, pvErr, setPvErr, pvNote, setPvNote,
    pvCells, sendObyem, decideObyemHere, withdrawObyemHere, returnStuck,
    partial: pvSub ? obyemPartialBy(pvSub.status, pvSub.reason) : null,
    note: !pvSub && pvApproved && pvApproved.pkgKey === pkg.key ? pvApproved.note : null,
    /* 2026-10-01: ЗӨВХӨН энэ багцынх (уншилт унавал өмнөх багцын баннер наалдахгүй) */
    pvReturned: pvReturned && pvReturned.pkgKey === pkg.key ? pvReturned : null,
  };
}
