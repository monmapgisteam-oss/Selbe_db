import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { PKGS, type Pkg, type Schema } from "../bagts.pkg";
import { loadRows, msToDay, type SheetRow } from "../bagtsSheet";
import { needsFrameOcc, overlaySubmission, withFrameOcc } from "../sheetFrame";
import { readSubmissionByOid } from "@/lib/submission";
import { OWNER, STATUS, F as HF } from "@/lib/hyanalt";
import { useHyanaltRows, returnInfoOf, type ReturnInfo } from "@/lib/hyanaltStore";
import { reviewLockState } from "@/lib/hyanaltSubmit";
import { nowFillMs, type SheetView } from "./util";

/**
 * Хяналтын урсгалын мөрүүд — энэ хуудасны өнөөдрийн/буцаагдсан мөр, өөр өдрүүдийн байдал.
 */
export function useFlow({ pkg, view, stagedOid }: { pkg: Pkg; view?: SheetView; stagedOid?: number | null }) {
  const { rows: hyRows, loading: hyLoading, error: hyErr, reload: reloadHy } = useHyanaltRows();
  /**
   * ӨНӨӨДРИЙН БӨГЛӨХ ӨДӨР (`Date.UTC(y,m,d)`) — ИЛГЭЭЛТИЙН ТҮЛХҮҮРИЙН ӨДӨР.
   */
  const [todayFillMs, setTodayFillMs] = useState(nowFillMs);
  /**
   * ЭНЭ ӨДРИЙН хяналтын мөрийг ЯЛГАХ шошго — `hyanaltSubmit.dayLabel`-тэй
   * ИЖИЛ хэлбэр (`YYYY.MM.DD`).
   */
  const todayAjilTag = useMemo(() => {
    const d = new Date(todayFillMs);
    const p = (n: number) => String(n).padStart(2, '0');
    return `Гүйцэтгэл · ${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}`;
  }, [todayFillMs]);
  const flow = useMemo(() => {
    const others = PKGS.filter((p) => p.group === pkg.group && p.key !== pkg.key);
    const mine = hyRows.filter((r) => {
      if (r[HF.bagts] !== pkg.group) return false;
      const ajil = String(r[HF.ajil] ?? '');
      if (ajil.includes(pkg.name)) return true;
      return !others.some((p) => ajil.includes(p.name));
    });
    if (!mine.length) return null;
    const mineToday = mine.filter((r) => String(r[HF.ajil] ?? '').startsWith(todayAjilTag));
    // Хамгийн сүүлийн тойрог — OBJECTID хамгийн их нь
    if (mineToday.length) return mineToday.reduce((a, b) => (b.__oid > a.__oid ? b : a));
    const lastRound = new Map<number, (typeof mine)[number]>();
    for (const r of mine) {
      const so = Number(r[HF.sheetOid]);
      const k = Number.isInteger(so) && so > 0 ? so : -r.__oid;
      const prev = lastRound.get(k);
      if (!prev || r.__oid > prev.__oid) lastRound.set(k, r);
    }
    const backed = [...lastRound.values()]
      .filter((r) => r[HF.status] !== STATUS.transferred && OWNER[r[HF.status]] === 'company');
    if (!backed.length) return null;
    return backed.reduce((a, b) => (b.__oid > a.__oid ? b : a));
  }, [hyRows, pkg.group, pkg.key, pkg.name, todayAjilTag]);
  /**
   * ӨӨР ӨДРИЙН хянагдаж буй урсгалууд — ЗӨВХӨН МЭДЭЭЛЭЛ, ХОРИГ БИШ.
   */
  const reviewLock = useMemo(() => {
    const others = PKGS.filter((p) => p.group === pkg.group && p.key !== pkg.key).map((p) => p.name);
    return reviewLockState(hyRows, pkg.group, pkg.name, others);
  }, [hyRows, pkg.group, pkg.key, pkg.name]);
  const otherDaysInReview = useMemo(() => {
    const m = /(\d{4}\.\d{2}\.\d{2})/.exec(todayAjilTag);
    return reviewLock.days.filter((d) => d !== m?.[1]);
  }, [reviewLock, todayAjilTag]);
  /**
   * ӨӨР ӨДРИЙН БУЦААГДСАН урсгалууд — зөвхөн МЭДЭЭЛЭЛ (2026-09-21-ний дахин аудит).
   */
  const flowIsStaged = !!flow && stagedOid != null && stagedOid > 0 && Number(flow[HF.sheetOid]) === stagedOid;
  const otherDaysReturned = useMemo(() => {
    const others = PKGS.filter((p) => p.group === pkg.group && p.key !== pkg.key);
    const lastRound = new Map<number, (typeof hyRows)[number]>();
    for (const r of hyRows) {
      if (r[HF.bagts] !== pkg.group) continue;
      const ajil = String(r[HF.ajil] ?? '');
      if (!ajil.includes(pkg.name) && others.some((p) => ajil.includes(p.name))) continue;
      const so = Number(r[HF.sheetOid]);
      const k = Number.isInteger(so) && so > 0 ? so : -r.__oid;
      const prev = lastRound.get(k);
      if (!prev || r.__oid > prev.__oid) lastRound.set(k, r);
    }
    const days = new Map<string, { soid: number; info: ReturnInfo | null }>();
    for (const r of lastRound.values()) {
      if (flowIsStaged && flow && r.__oid === flow.__oid) continue;
      if (r[HF.status] === STATUS.transferred || OWNER[r[HF.status]] !== 'company') continue;
      const m = /(\d{4}\.\d{2}\.\d{2})/.exec(String(r[HF.ajil] ?? ''));
      /* 2026-09-24: өдөр → илгээлтийн OBJECTID (`resumeReturned`-д) */
      if (m) days.set(m[1], { soid: Number(r[HF.sheetOid]), info: returnInfoOf(r) });
    }
    return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, soid: v.soid, info: v.info }));
  }, [hyRows, flow, flowIsStaged, pkg.group, pkg.key, pkg.name]);
  /**
   * ЭНЭ СЕШНД ГАРААР СОНГОСОН буцаагдсан илгээлтийн OBJECTID (2026-09-24).
   */
  const [resumedSt, setResumedSt] = useState<{ pkgKey: string; oid: number | null }>({ pkgKey: pkg.key, oid: null });
  const resumedOid = resumedSt.pkgKey === pkg.key ? resumedSt.oid : null;
  const setResumedOid = useCallback((oid: number | null) => setResumedSt({ pkgKey: pkg.key, oid }), [pkg.key]);
  const returned = flow ? OWNER[flow[HF.status]] === "company" : false;
  const returnedStaged = returned && flowIsStaged;
  const returnInfo = useMemo(() => (returnedStaged ? returnInfoOf(flow) : null), [returnedStaged, flow]);
  /** Урсгал ОДОО хэний гар дээр байна вэ (`null` = бүртгэлгүй) */
  const reviewStage = flow ? OWNER[flow[HF.status]] : null;
  /**
   * ЭНЭ ӨДРИЙН илгээлт хянагчийн гар дээр байна уу.
   */
  const inReview = !!flow
    && flow[HF.status] !== STATUS.transferred
    && reviewStage !== "company";
  /**
   * Урсгалын мөрийн ХАМГИЙН СҮҮЛИЙН утга — багц ачаалах эффектэд.
   */
  const flowRef = useRef(flow);
  useEffect(() => { flowRef.current = flow; }, [flow]);
  const today = useMemo(() => msToDay(todayFillMs), [todayFillMs]);

  const reviewSoids = useMemo(() => {
    if (view) return [] as number[];
    const others = PKGS.filter((p) => p.group === pkg.group && p.key !== pkg.key);
    const lastRound = new Map<number, (typeof hyRows)[number]>();
    for (const r of hyRows) {
      if (r[HF.bagts] !== pkg.group) continue;
      const ajil = String(r[HF.ajil] ?? '');
      if (!ajil.includes(pkg.name) && others.some((p) => ajil.includes(p.name))) continue;
      const so = Number(r[HF.sheetOid]);
      if (!Number.isInteger(so) || so <= 0) continue;
      const prev = lastRound.get(so);
      if (!prev || r.__oid > prev.__oid) lastRound.set(so, r);
    }
    const out: number[] = [];
    for (const [so, r] of lastRound) {
      if (String(r[HF.ajil] ?? '').startsWith(todayAjilTag)) continue;
      if (r[HF.status] === STATUS.transferred || OWNER[r[HF.status]] === 'company') continue;
      out.push(so);
    }
    return out.sort((a, b) => a - b);
  }, [view, hyRows, pkg.group, pkg.key, pkg.name, todayAjilTag]);
  const reviewSoidsKey = reviewSoids.join(',');
  return {
    hyRows, hyLoading, hyErr, reloadHy,
    todayFillMs, setTodayFillMs, todayAjilTag, flow, flowIsStaged, otherDaysInReview, otherDaysReturned, reviewLock,
    resumedOid, setResumedOid, returned, returnedStaged, returnInfo, reviewStage, inReview, flowRef, today, reviewSoidsKey,
  };
}

/** Өөр өдрийн ХЯНАЛТАД байгаа нэмэлт — зөвхөн харагдац (`prevHint` · `commit`-ийн сануулга). */
export function useReviewInc({ view, sc, pkg, reviewSoidsKey, rows, loadedPkgRef }: {
  view?: SheetView; sc: Schema | null; pkg: Pkg; reviewSoidsKey: string; rows: SheetRow[]; loadedPkgRef: RefObject<string>;
}) {
  /** `${oid}:${b}` → хяналтад байгаа нэмэлт: `n` обьём, `a` хувь (0–1) */
  const [reviewInc, setReviewInc] = useState<Map<string, { n: number | null; a: number | null }>>(new Map());
  const reviewIncKeyRef = useRef('');
  useEffect(() => {
    if (view || !sc) return;
    /* Багц солигдов — өмнөх багцын явж буй уншилтыг хүчингүй болгоно (`alive()` худал) */
    if (!reviewIncKeyRef.current.startsWith(`${pkg.key}|`)) reviewIncKeyRef.current = '';
    if (loadedPkgRef.current !== pkg.key) return;
    const k = `${pkg.key}|${reviewSoidsKey}`;
    if (reviewIncKeyRef.current === k) return;
    reviewIncKeyRef.current = k;
    setReviewInc(new Map());
    if (!reviewSoidsKey) return;
    const alive = () => reviewIncKeyRef.current === k;
    const soids = reviewSoidsKey.split(',').map(Number);
    const add = (x: number | null | undefined, y: number | null) =>
      (y == null ? (x ?? null) : (x ?? 0) + y);
    void (async () => {
      try {
        const base = await loadRows(pkg, sc);
        if (!alive()) return;
        const baseBy = new Map(base.rows.map((x) => [x.oid, x] as const));
        const acc = new Map<string, { n: number | null; a: number | null }>();
        for (const so of soids) {
          const rr = await readSubmissionByOid(so);
          if (!alive()) return;
          const sub = rr.ok ? rr.sub : null;
          if (!sub || sub.done || sub.payload.pkgKey !== pkg.key || sub.payload.mode !== 'inc') continue;
          let pl = sub.payload;
          if (pl.base != null && needsFrameOcc(pl, base.rows)) {
            try { pl = withFrameOcc(pl, (await loadRows(pkg, sc, msToDay(pl.base))).rows); } catch { /* хэвээр */ }
            if (!alive()) return;
          }
          const ov = overlaySubmission(base.rows, pl, sc, sc.bld.length);
          const ovBy = new Map(ov.rows.map((x) => [x.oid, x] as const));
          for (const ck of ov.cellKeys) {
            const cut = ck.indexOf(':');
            if (cut <= 0) continue;
            const oid = Number(ck.slice(0, cut));
            const b = Number(ck.slice(cut + 1));
            const o = ovBy.get(oid);
            const bs = baseBy.get(oid);
            if (!o || !bs || oid < 0) continue;
            const dn = o.obyem[b] != null ? o.obyem[b]! - (bs.obyem[b] ?? 0) : null;
            const da = o.act[b] != null ? o.act[b]! - (bs.act[b] ?? 0) : null;
            if (!dn && !da) continue;
            const prev = acc.get(ck);
            acc.set(ck, { n: add(prev?.n, dn || null), a: add(prev?.a, da || null) });
          }
        }
        if (alive()) setReviewInc(acc);
      } catch {
        /* Зөвхөн харагдац — уншилт унавал сануулгагүй үлдэнэ, дараагийн ачаалалтаар дахин */
        if (alive()) reviewIncKeyRef.current = '';
      }
    })();
  }, [view, sc, pkg, reviewSoidsKey, rows, loadedPkgRef]);
  return reviewInc;
}
