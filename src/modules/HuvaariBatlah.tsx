'use client';

/**
 * ХУВААРЬ БАТЛАХ — батлахыг хүлээж буй БҮХ саналын дараалал (2026-09-16).
 *
 * ═══════════════════════════════════════════════════════════════════════
 *
 * БАТЛАХ нь энд БИШ — товч дарахад тэр багцын хуваарь ЭНЭ хуудсан дээр бүтэн
 * дэлгэцээр нээгдэнэ (`<Huvaari review>`, 2026-09-25; урьд нь «Хуваарь» хуудас
 * руу шилждэг байв — `Portal.planJump`). Батлагч өөрчлөгдсөн мөр бүрийг
 * зөвшөөрч (ногоон) батална; буцаахад зөвшөөрсөн мөрүүд хадгалагдаж
 * гүйцэтгэгчид улаан/ногоон болж харагдана. Батлах гинж `Huvaari`-ийнх хэвээр.
 *
 * ЯАГААД: батлах нь `Huvaari.tsx`-д ГУРВАН шаттай гинж —
 *   `setApproving(oid)` → `useEffect` → `save` → `applyUpdates` →
 *   `decidePlan(approve: true)`
 * бөгөөд «бичих зүйлгүй» (эх хуудас аль хэдийн ижил) ба «бичилт унасан»
 * гэсэн хоёр нарийн салаа агуулна. Мөн схем, өөрчлөгдсөн блокийг ялгах,
 * агшин солигдвол мөрийг дахин зураглах бүх логик тэнд л байна.
 * Энд хуулбарлавал хоёр зам салж, нэг нь чимээгүй хоцорно.
 *
 * БУЦААХ нь харин ЭНД хийгдэнэ: `decidePlan(approve: false)` нь эх
 * өгөгдөлд ЮУ Ч бичдэггүй, зөвхөн урсгалын мөрийн төлвийг хөдөлгөнө.
 * Энэ асимметр нь бүх дизайны цөм.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useAuth } from '@/components/AuthGate';
import { hasPlanRole, huvaariScope, subscribeHuvaariAcl } from '@/lib/huvaariAcl';
import { roleForUser, type ViewKey } from '@/lib/services';
import { dayKey, num } from '@/lib/format';
import { PKGS, type Pkg } from '@/modules/sheet/bagts.pkg';
import { msToDay } from '@/modules/sheet/bagtsSheet';
import { Huvaari, showPlanReason } from '@/modules/Huvaari';
import {
  BLIND_NOTE_SRC, claimHolderOf, decidePlan, serverNow, loadAllPending, loadLastPerPkg, loadPayload, partialBy, planTableState, returnStuckPlan, withdrawPlan, PLAN_STATUS, REASON_MAX,
  type PlanPayload, type PlanSubmission,
} from '@/lib/huvaariBatlah';
import s from './guitsetgel.module.css';
import { Loading, userError } from '@/components/ui';
import { askConfirm } from '@/lib/confirm';

/** Багцын түлхүүр → бүртгэл. Модулийн хүрээнд нэг л удаа боддог. */
const PKG_BY_KEY = new Map<string, Pkg>(PKGS.map((p) => [p.key, p]));

const ALL = '';
/** Багц бүртгэлд бий юу (2026-10-08: модулийн түвшинд — `todo` memo-ийн тогтвортой хамаарал) */
const known = (x: PlanSubmission) => PKG_BY_KEY.has(x.pkgKey);
const blindNote = () => BLIND_NOTE_SRC;

/**
 * Татах төлөв.
 */
type State =
  | { k: 'loading' }
  | { k: 'blocked'; why: string }
  | { k: 'error'; msg: string }
  | { k: 'ready'; rows: PlanSubmission[] };

/** `payload` задарсан эсэх — мөр дэлгэхэд л татагдана */
type Detail =
  | { k: 'loading' }
  | { k: 'fail' }
  | { k: 'ok'; p: PlanPayload };

export function HuvaariBatlah({
  onApprove: _onApprove, navScope: _navScope = 'all',
}: {
  onApprove?: (pkgKey: string, oid: number) => void;
  /**
   * Хэрэглэгчийн харж болох харагдацууд — `huvaari` дотор байх шаардлагатай.
   */
  navScope?: 'all' | ViewKey[];
}) {
  const { user, status } = useAuth();
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeHuvaariAcl(() => setAclN((x) => x + 1)), []);

  const [st, setSt] = useState<State>({ k: 'loading' });
  /**
   * ӨӨРИЙН БУЦААГДСАН илгээлтүүд (2026-09-29, хэрэглэгч: «буцаасан шалтгаан зохиогчид
   * харагдахгүй байна») — багцын СҮҮЛИЙН илгээлт нь буцаагдсан бөгөөд зохиогч нь би.
   */
  const [back, setBack] = useState<PlanSubmission[]>([]);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const [now, setNow] = useState(() => serverNow());

  const [open, setOpen] = useState<number | null>(null);
  const [detail, setDetail] = useState<Map<number, Detail>>(new Map());
  /** Буцаах шалтгаан — МӨР ТУТАМ, `oid`-оор түлхүүрлэгдэнэ */
  const [reason, setReason] = useState<Map<number, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const [q, setQ] = useState('');
  const [grp, setGrp] = useState(ALL);
  /**
   * БҮТЭН ДЭЛГЭЦИЙН ХЯНАЛТ (2026-09-25) — сонгосон илгээлтийн багцыг «Хуваарь»
   * хэсэгтэй ЯГ ижил харагдацаар (`Huvaari`-ийн `review` горим) харуулна.
   */
  const [review, setReview] = useState<{ pkgKey: string; oid: number; kind: PlanPayload['kind'] } | null>(null);

  const me = (user?.username ?? '').trim().toLowerCase();
  const isSuper = roleForUser(user?.username) === 'super';

  /* ══════════════════════ ТАТАХ ══════════════════════ */
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSt({ k: 'loading' });
    void (async () => {
      try {
        const t = await planTableState(status === 'off' || isSuper);
        if (!alive) return;
        if (!t.ok) {
          setSt({ k: 'blocked', why:
            t.why === 'auth'
              ? tr('Порталд нэвтрээгүй байна — гарч ороод дахин оролдоно уу.')
              : t.why === 'owner'
                ? tr('Батлах хүснэгт байгаа ч эзэмшигч нь танигдахгүй байна — админд мэдэгдэнэ үү.')
                : t.why === 'error'
                  ? tr('Порталын хайлт амжилтгүй: {0}', t.detail ? userError(t.detail) : '')
                  : tr('Батлах хүснэгт олдсонгүй — админ (super) нэг удаа нэвтрэхэд автоматаар үүснэ.') });
          return;
        }
        const rows = await loadAllPending();
        if (!alive) return;
        setSt({ k: 'ready', rows });
        /* Буцаагдсан — нэмэлт мэдээлэл; уншигдахгүй бол дараалал хэвээр ажиллана */
        try {
          const lastAll = await loadLastPerPkg();
          if (alive) setBack(lastAll.filter((x) => x.status === PLAN_STATUS.returned));
        } catch { if (alive) setBack([]); }
      } catch (e) {
        if (alive) setSt({ k: 'error', msg: userError(e) });
      }
    })();
    return () => { alive = false; };
  }, [tick, status, isSuper, user?.username]);

  /* ══════════════════════ ХАМРАХ ХҮРЭЭ ══════════════════════ */
  /**
   * Тэр модулийн дүрэм нь «хуваарилалт байхгүй → БҮХ багц харуул», учир нь
   * тэр нь ХАРАХ/ТӨЛӨВЛӨХ хуудас: хоосон сонгогч нь хуудсыг бүхэлдээ
   * утгагүй болгоно.
   *
   * Энэ бол ҮЙЛДЛИЙН ХАЙРЦАГ. Өөр батлагчийн дараалал энд харагдах нь
   * (1) шуугиан, (2) `decidePlan` татгалзах товч дарахыг урих, (3) бусдын
   * ажлын хэмжээг гоожуулах. Тиймээс:
   *     `null`     → бүх pending
   *     `[...]`    → зөвхөн тэр бүлгүүд
   *     `[]`       → ХООСОН + «админаас багц гуй»
   */
  const scope = useMemo(
    () => (status === 'off' || isSuper ? null : huvaariScope(user?.username, 'approver')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.username, status, isSuper, aclN],
  );
  /** Нэг ч багц хуваарилагдаагүй — дараалал хоосон байгаагийн ШАЛТГААН */
  const noScope = Array.isArray(scope) && scope.length === 0;
  /** Батлагчийн үүрэг ОГТ байхгүй — өөр шалтгаан, өөр мессеж */
  const noRole = status !== 'off' && !isSuper && !hasPlanRole(user?.username, 'approver');

  const all = useMemo(() => (st.k === 'ready' ? st.rows : []), [st]);
  const mine = useMemo(
    () => all.filter((x) => scope == null || scope.includes(x.pkgGroup)),
    [all, scope],
  );
  /** Хүрээнээс ГАДНА байгаа эсэх — хоосон төлвийг ялгахад л (ТООГ хэлэхгүй) */
  const outside = all.length > mine.length;

  const groupOpts = useMemo(
    () => [...new Set(mine.map((x) => x.pkgGroup))].sort((a, b) => a.localeCompare(b, 'mn')),
    [mine],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return mine.filter((x) => {
      const label = PKG_BY_KEY.get(x.pkgKey)?.label ?? x.pkgKey;
      return (!needle
          || label.toLowerCase().includes(needle)
          || x.author.toLowerCase().includes(needle)
          || (x.note ?? '').toLowerCase().includes(needle))
        && (!grp || x.pkgGroup === grp);
    });
  }, [mine, q, grp]);

  /* ── Гурван хэсэг: шийдвэрлэх · өөрийн · бүртгэлгүй багц ── */
  const isOwn = useCallback(
    (x: PlanSubmission) => !!me && me === x.author.trim().toLowerCase(),
    [me],
  );
  const todo = useMemo(
    () => filtered.filter((x) => known(x) && !isOwn(x)).sort((a, b) => a.oid - b.oid),
    [filtered, isOwn],
  );
  const lockedN = useMemo(
    () => mine.filter((x) => {
      if (isOwn(x)) return false;
      const h0 = claimHolderOf(x, now);
      return !!h0 && h0 !== me;
    }).length,
    [mine, isOwn, now, me],
  );
  const actionableN = mine.filter((x) => !isOwn(x)).length - lockedN;
  const own = filtered.filter((x) => known(x) && isOwn(x));
  const orphan = filtered.filter((x) => !known(x));

  const dirty = !!q || !!grp;

  const alive = useRef(true);
  const syncSubmitted = (pkgKey: string) => {
    void import('@/lib/draftRowsRemote').then((m) => m.planSyncSubmitted(pkgKey, { force: true })).catch(() => undefined);
  };
  const [migBusy, setMigBusy] = useState(false);
  const [migProg, setMigProg] = useState('');
  const [verified, setVerified] = useState<import('@/lib/draftRowsRemote').VerifyResult | null>(null);
  const migrateAll = async () => {
    if (migBusy || busy) return;
    if (!(await askConfirm(tr('Бүх хуучин JSON ноорог ба илгээлтийг эх хуудасны бүтцээр мөр рүү шилжүүлэх үү? JSON хэвээр үлдэнэ.'), { ok: tr('Шилжүүлэх') }))) return;
    setMigBusy(true); setErr(''); setNote(''); setVerified(null);
    try {
      const m = await import('@/lib/draftRowsRemote');
      const st0 = await m.rowsReady(true);
      if (st0.mode !== 'rows') { setErr(tr('Ноорогийн хүснэгтэд (191) мөрийн баганууд нэмэгдээгүй — notebook ажиллуулна уу')); return; }
      const r = await m.migrateAll((d, t) => { if (alive.current) setMigProg(`${num(d)}/${num(t)}`); });
      if (!alive.current) return;
      setNote(tr('Ноорог: {0}-аас {1} шилжив', num(r.total), num(r.migrated))
        + (r.failed.length ? ` · ${tr('{0} унав: {1}', num(r.failed.length), r.failed.slice(0, 3).join('; '))}` : ''));
    } catch (e) {
      if (alive.current) setErr(userError(e));
    } finally {
      if (alive.current) { setMigBusy(false); setMigProg(''); }
    }
  };
  const verifyAll = async () => {
    if (migBusy || busy) return;
    setMigBusy(true); setErr(''); setNote('');
    try {
      const m = await import('@/lib/draftRowsRemote');
      const r = await m.verifyAll();
      if (!alive.current) return;
      setVerified(r);
      setNote(tr('Тулгалт: {0}-аас {1} ижил · {2} зөрсөн · {3} шилжээгүй', num(r.total), num(r.same), num(r.diff.length), num(r.pending.length))
        + (r.diff.length ? ` (${r.diff.slice(0, 5).join(', ')})` : ''));
    } catch (e) {
      if (alive.current) setErr(userError(e));
    } finally {
      if (alive.current) setMigBusy(false);
    }
  };
  const cleanupLegacy = async () => {
    if (migBusy || busy || !verified || verified.diff.length || verified.pending.length) return;
    if (!(await askConfirm(tr('Тулгалт бүрэн зөв. Хуучин JSON ноорогийг устгаж, илгээлтийн payload-аас нүдийг хасах уу? БУЦААХ БОЛОМЖГҮЙ.'), { ok: tr('Цэвэрлэх'), danger: true }))) return;
    setMigBusy(true); setErr(''); setNote('');
    try {
      const m = await import('@/lib/draftRowsRemote');
      const r = await m.phaseB(verified);
      if (!alive.current) return;
      setVerified(null);
      setNote(tr('Хуучин JSON: {0} мөр устав · {1} илгээлтийн payload цэвэрлэгдэв', num(r.deleted), num(r.stripped))
        + (r.failed.length ? ` · ${tr('{0} унав: {1}', num(r.failed.length), r.failed.slice(0, 3).join('; '))}` : ''));
    } catch (e) {
      if (alive.current) setErr(userError(e));
    } finally {
      if (alive.current) setMigBusy(false);
    }
  };
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    if (st.k !== 'ready') return;
    let live = true;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setNow(serverNow());
      if (busy) return;
      void loadAllPending().then((rows) => {
        if (live && alive.current) setSt((cur) => (cur.k === 'ready' ? { k: 'ready', rows } : cur));
      }).catch(() => { /* дараагийн тикт */ });
    }, 45_000);
    return () => { live = false; window.clearInterval(id); };
  }, [st.k, busy]);


  /* ══════════════════════ МӨР ДЭЛГЭХ ══════════════════════ */
  /**
   * Агуулгыг татна (байхгүй/унасан бол) — дэлгэх, урьдчилан татах хоёулаа үүгээр (2026-10-08).
   */
  const ensureDetail = useCallback((oid: number) => {
    setDetail((m) => {
      const cur = m.get(oid);
      if (cur && cur.k !== 'fail') return m;
      const next = new Map(m);
      next.set(oid, { k: 'loading' });
      void (async () => {
        const p = await loadPayload(oid).catch(() => null);
        if (alive.current) setDetail((m2) => new Map(m2).set(oid, p ? { k: 'ok', p } : { k: 'fail' }));
      })();
      return next;
    });
  }, []);
  const toggle = useCallback((oid: number) => {
    setOpen((cur) => (cur === oid ? null : oid));
    ensureDetail(oid);
  }, [ensureDetail]);
  const first5 = todo.slice(0, 5).map((x) => x.oid).join(',');
  useEffect(() => {
    if (st.k !== 'ready' || !first5) return;
    for (const o of first5.split(',')) ensureDetail(Number(o));
  }, [st.k, first5, ensureDetail]);
  const autoOpened = useRef<number | null>(null);
  useEffect(() => {
    if (st.k !== 'ready' || todo.length !== 1 || review) return;
    const oid = todo[0].oid;
    if (autoOpened.current === oid) return;
    autoOpened.current = oid;
    setOpen((cur) => cur ?? oid);
    ensureDetail(oid);
  }, [st.k, todo, review, ensureDetail]);

  /* ══════════════════════ БУЦААХ ══════════════════════ */
  const reject = useCallback(async (x: PlanSubmission) => {
    const why = (reason.get(x.oid) ?? '').trim();
    if (busy || !why) return;
    if (!(await askConfirm(tr('Энэ илгээлтийг буцаах уу? Гүйцэтгэгч засаад дахин илгээх шаардлагатай болно.'), { ok: tr('Буцаах') }))) return;
    if (!alive.current) return;
    setBusy(true); setErr(''); setNote('');
    const blind = blindNote();
    try {
      const r = await decidePlan({
        oid: x.oid,
        approve: false,
        approver: user?.username ?? '',
        author: x.author,
        reason: `${why.slice(0, Math.max(0, REASON_MAX - blind.length - 1))}\n${blind}`, okRows: [],
      });
      if (!r.ok) { setErr(r.error ? userError(r.error) : tr('Шийдвэр хадгалагдсангүй.')); return; }
      syncSubmitted(x.pkgKey);
      setNote(tr('Хуваарь буцаагдлаа — гүйцэтгэгч засаад дахин илгээнэ.') + (r.warn ? ` ${r.warn}` : ''));
      setReason((m) => { const n = new Map(m); n.delete(x.oid); return n; });
      setOpen(null);
      reload();
    } catch (e) {
      setErr(userError(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [reason, busy, user, reload]);

  /* ══════════════════════ ГАЦСАНЫГ БУЦААХ (2026-10-08) ══════════════════════
   */
  const returnStuck = useCallback(async (x: PlanSubmission) => {
    const why = (reason.get(x.oid) ?? '').trim();
    if (busy || !why) return;
    if (!(await askConfirm(tr('Гацсан (хэсэгчлэн бичигдсэн) илгээлтийг буцаах уу? Эх хуудсанд аль хэдийн бичигдсэн огноо ХЭВЭЭР үлдэнэ — зохиогч тэдгээрийг мэдэж засаад дахин илгээнэ.'), { ok: tr('Буцаах') }))) return;
    if (!alive.current) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await returnStuckPlan({ oid: x.oid, approver: user?.username ?? '', reason: why });
      if (!r.ok) { setErr(r.error ? userError(r.error) : tr('Шийдвэр хадгалагдсангүй.')); return; }
      syncSubmitted(x.pkgKey);
      setNote(tr('Гацсан илгээлт буцаагдлаа — зохиогч бичигдсэн огноог харж засаад дахин илгээнэ.'));
      setReason((m) => { const n = new Map(m); n.delete(x.oid); return n; });
      setOpen(null);
      reload();
    } catch (e) {
      setErr(userError(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [reason, busy, user, reload]);

  /* ══════════════════════ ИЛГЭЭЛТЭЭ ТАТАХ (2026-09-21) ══════════════════════
   */
  const withdraw = useCallback(async (x: PlanSubmission) => {
    if (busy) return;
    if (!(await askConfirm(tr('Илгээлтээ татах уу? Батлагч шийдвэрлэхээ болино; агуулгыг «Хуваарь» хуудсанд «Ноорогт буцаах» товчоор сэргээж болно.'), { ok: tr('Илгээлтээ татах') }))) return;
    if (!alive.current) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await withdrawPlan({ oid: x.oid, me: user?.username ?? '' });
      if (!r.ok) { setErr(r.error ? userError(r.error) : tr('Илгээлт татагдсангүй.')); return; }
      syncSubmitted(x.pkgKey);
      setNote(tr('Илгээлт татагдлаа — «Хуваарь» хуудсанд «Ноорогт буцаах»-аар сэргээж, засаад дахин илгээж болно.'));
      setOpen(null);
      reload();
    } catch (e) {
      setErr(userError(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, user, reload]);

  /**
   * «Хуваарь» харагдац хаалттай бол батлах товч ОГТ гарахгүй.
   */
  const openReview = (x: PlanSubmission) => {
    const d = detail.get(x.oid);
    if (d?.k !== 'ok') return;
    setErr(''); setNote('');
    setReview({ pkgKey: x.pkgKey, oid: x.oid, kind: d.p.kind });
  };

  /* ══════════════════════ ЗУРАГДАЛТ ══════════════════════ */
  return (
    <div className={s.wrap}>
      {review && (
        <Huvaari
          review={{
            ...review,
            onClose: () => { setReview(null); reload(); },
            onDone: ({ msg, isErr }) => {
              setReview(null);
              if (msg) { if (isErr) setErr(msg); else setNote(msg); }
              reload();
            },
          }}
        />
      )}
      <div className={s.head}>
        <b className={s.title}>{tr('Хуваарь батлах')}</b>
        <span className={s.sub}>
          {tr('Гүйцэтгэгчээс ирсэн, батлахыг хүлээж буй хуваарийн саналууд')}
        </span>
      </div>

      <div className={s.bar}>
        <input
          className={s.search}
          placeholder={tr('Багц, илгээгч, тайлбараар хайх…')}
          aria-label={tr('Багц, илгээгч, тайлбараар хайх…')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className={s.select} value={grp} onChange={(e) => setGrp(e.target.value)} aria-label={tr('Бүх багц')}>
          <option value={ALL}>{tr('Бүх багц')}</option>
          {groupOpts.map((g) => <option key={g} value={g}>{tr(g)}</option>)}
        </select>
        {dirty && (
          <button className={s.clear} onClick={() => { setQ(''); setGrp(ALL); }}>
            {tr('Цэвэрлэх')}
          </button>
        )}
        <span className={s.spacer} />
        {st.k === 'ready' && (
          <button className={s.clear} disabled={busy} onClick={reload}>
            {tr('Шинэчлэх')}
          </button>
        )}
        {st.k === 'ready' && isSuper && (
          <>
            <button className={s.clear} disabled={busy || migBusy} onClick={() => { void migrateAll(); }}
              title={tr('191-ийн хуучин JSON ноорог ба илгээлтийг эх хуудасны бүтцээр мөр рүү шилжүүлнэ (JSON хэвээр)')}>
              {migBusy && migProg ? tr('Шилжүүлж байна… {0}', migProg) : tr('Бүх ноорогийг шилжүүлэх')}
            </button>
            <button className={s.clear} disabled={busy || migBusy} onClick={() => { void verifyAll(); }}
              title={tr('Мөрөөс сэргээсэн ноорог хуучин JSON-тэй ижил эсэхийг тулгана')}>
              {tr('Шилжүүлэлтийг тулгах')}
            </button>
            {verified && !verified.diff.length && !verified.pending.length && verified.total > 0 && (
              <button className={s.clear} disabled={busy || migBusy} onClick={() => { void cleanupLegacy(); }}
                title={tr('Тулгалт бүрэн зөв — хуучин JSON-ыг устгана (буцаах боломжгүй)')}>
                {tr('Хуучин JSON-ыг цэвэрлэх')}
              </button>
            )}
          </>
        )}
        <span className={s.total} title={tr('Шүүлтийн дараах бүх мөр — өөрийн илгээсэн ба бүртгэлгүй багцынх орно')}>
          {tr('жагсаалтад {0}', st.k === 'ready' ? num(filtered.length) : '—')}
        </span>
      </div>

      <div className={s.body}>
        {err && <div className={s.error} role="alert">{err}</div>}
        {note && <div className={s.note} role="status">{note}</div>}

        {st.k === 'blocked' && (
          <div className={s.note} role="alert">
            {st.why}
            <button className={s.clear} onClick={reload}>{tr('Дахин оролдох')}</button>
          </div>
        )}
        {st.k === 'error' && (
          <div className={s.note} role="alert">
            {tr('Үйлчилгээнээс өгөгдөл татаж чадсангүй: {0}', st.msg)}
            <button className={s.clear} onClick={reload}>{tr('Дахин оролдох')}</button>
          </div>
        )}

        {st.k === 'loading' ? (
          <Loading />
        ) : st.k !== 'ready' ? null : (
          <>
            <div className={s.list}>
              <div className={s.groupHead}>
                <span>{tr('Шийдвэрлэх')}</span>
                <span className={s.groupCount}
                  title={tr('Цэсний тэмдэгтэй ижил: таны багцуудад, өөрийн биш, өөр батлагч түгжээгүй илгээлт (хайлт/бүлгийн шүүлтээс үл хамаарна)')}>
                  {tr('шийдвэрлэх боломжтой {0}', num(actionableN))}
                  {lockedN > 0 && ` · ${tr('өөр батлагч батлаж буй {0}', num(lockedN))}`}
                </span>
              </div>
              {todo.length === 0 ? (
                <div className={s.empty}>
                  {noRole
                    ? tr('Танд хуваарь батлах үүрэг олгогдоогүй байна. Админ «Хуваарийн эрх» хэсэгт батлагчаар томилсны дараа саналууд энд харагдана.')
                    : noScope
                      ? tr('Танд нэг ч багц хуваарилагдаагүй байна. Админ «Хуваарийн эрх» хэсэгт багц зааж өгсний дараа батлах хуваарь харагдана.')
                      : outside
                        ? tr('Таны багцуудад батлах хуваарь алга.')
                        : dirty
                          ? tr('Шүүлтэнд тохирох илгээлт алга.')
                          : tr('Батлах хуваарь алга — гүйцэтгэгч илгээмэгц энд гарч ирнэ.')}
                </div>
              ) : todo.map((x) => (
                <Row
                  key={x.oid} sub={x} open={open === x.oid} onToggle={toggle}
                  onPrefetch={ensureDetail} now={now}
                  detail={detail.get(x.oid)} busy={busy}
                  reason={reason.get(x.oid) ?? ''}
                  onReason={(v) => setReason((m) => new Map(m).set(x.oid, v))}
                  onReject={() => void reject(x)}
                  onApprove={PKG_BY_KEY.has(x.pkgKey) ? () => openReview(x) : undefined}
                  holder={(() => { const h = claimHolderOf(x, now); return h && h !== me ? h : null; })()}
                  onReturnStuck={partialBy(x.status, x.reason) != null ? () => void returnStuck(x) : undefined}
                />
              ))}
            </div>

            {back.filter(isOwn).length > 0 && (
              <div className={s.list} style={{ marginTop: 18 }}>
                <div className={s.groupHead}>
                  <span>{tr('Буцаасан — засаад дахин илгээнэ')}</span>
                  <span className={s.groupCount}>{num(back.filter(isOwn).length)}</span>
                </div>
                {back.filter(isOwn).map((x) => (
                  <div key={x.oid} className={s.item}>
                    <div className={`${s.open} ${s.actions}`}>
                      <span className={s.who}>
                        <span className={s.ajil}>{PKG_BY_KEY.get(x.pkgKey)?.label ?? x.pkgKey}</span>
                        <span className={s.meta}>
                          {tr('буцаасан')}: {x.approver ?? '—'}
                          {' · '}
                          {x.approverAt == null ? '—' : dayKey(x.approverAt)}
                          {' · '}
                          {tr('{0} мөр', num(x.rowCount))}
                          {x.kind && <>{' · '}{x.kind === 'geree' ? tr('Төрөл: Гэрээ') : tr('Төрөл: Төлөвлөгөө')}</>}
                        </span>
                      </span>
                      <div className={s.reasonBox} style={{ whiteSpace: 'pre-line' }}>
                        <div className={s.reasonLabel}>{tr('Буцаасан шалтгаан')}</div>
                        {showPlanReason(x.reason?.trim() ?? '') || tr('шалтгаан бичигдээгүй')}
                      </div>
                      <p className={s.meta}>
                        {tr('«Хуваарь» хуудсанд энэ багцыг нээхэд илгээсэн хуваарь ноорог болж буцна — засаад дахин илгээнэ.')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {own.length > 0 && (
              <div className={s.list} style={{ marginTop: 18 }}>
                <div className={s.groupHead}>
                  <span>{tr('Өөрийн илгээсэн — өөр батлагч шийдвэрлэнэ')}</span>
                  <span className={s.groupCount}>{num(own.length)}</span>
                </div>
                {own.map((x) => (
                  <Row
                    key={x.oid} sub={x} open={open === x.oid} onToggle={toggle}
                    detail={detail.get(x.oid)} busy={busy}
                    reason="" onReason={() => {}}
                    ownWhy={tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.')}
                    onWithdraw={() => void withdraw(x)}
                  />
                ))}
              </div>
            )}

            {orphan.length > 0 && (
              <div className={s.list} style={{ marginTop: 18 }}>
                <div className={s.groupHead}>
                  <span>{tr('Бүртгэлгүй багц')}</span>
                  <span className={s.groupCount}>{num(orphan.length)}</span>
                </div>
                {orphan.map((x) => (
                  <Row
                    key={x.oid} sub={x} open={open === x.oid} onToggle={toggle}
                    detail={detail.get(x.oid)} busy={busy}
                    reason={reason.get(x.oid) ?? ''}
                    onReason={(v) => setReason((m) => new Map(m).set(x.oid, v))}
                    onReject={isOwn(x) ? undefined : () => void reject(x)}
                    onWithdraw={isOwn(x) ? () => void withdraw(x) : undefined}
                    ownWhy={tr('Энэ багцын түлхүүр бүртгэлд алга — «Хуваарь» хуудас руу шилжих боломжгүй. Буцаавал гүйцэтгэгч зөв багцаар дахин илгээнэ.')}
                    onReturnStuck={!isOwn(x) && partialBy(x.status, x.reason) != null ? () => void returnStuck(x) : undefined}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════ НЭГ ИЛГЭЭЛТИЙН МӨР ══════════════════════ */

function Row({
  sub, open, onToggle, detail, busy, reason: reasonIn, onReason, onReject, onApprove, ownWhy, onWithdraw, holder, onReturnStuck,
  onPrefetch, now,
}: {
  sub: PlanSubmission;
  onReturnStuck?: () => void;
  onPrefetch?: (oid: number) => void;
  now?: number;
  /** ӨӨР батлагч түгжсэн (эх хуудсанд бичиж буй) — нэр; товчнууд хаалттай (2026-09-29) */
  holder?: string | null;
  open: boolean;
  onToggle: (oid: number) => void;
  detail: Detail | undefined;
  busy: boolean;
  reason: string;
  onReason: (v: string) => void;
  onReject?: () => void;
  onApprove?: () => void;
  /** Үйлдэл хаалттай байгаагийн ИЛ шалтгаан (өөрийн илгээлт, бүртгэлгүй багц) */
  ownWhy?: string;
  /** Зохиогч өөрийн илгээлтээ татна (2026-09-21) — зөвхөн «Өөрийн» хэсэгт */
  onWithdraw?: () => void;
}) {
  const pkg = PKG_BY_KEY.get(sub.pkgKey);
  const p = detail?.k === 'ok' ? detail.p : null;
  const partial = partialBy(sub.status, sub.reason);
  const partialWhy = partial == null
    ? null
    : onReturnStuck
      ? tr('{0} хагас бичсэн — Батлах-аар гүйцээнэ, эсвэл шалтгаан бичээд «Гацсаныг буцаах»', partial || '—')
      : tr('{0} хагас бичсэн — Батлах-аар гүйцээнэ', partial || '—');
  const reason = partialWhy ? '' : reasonIn;
  const waitDays = now != null && sub.authorSent != null ? Math.floor((now - sub.authorSent) / 86_400_000) : null;

  /* ── `payload`-ийн тоонууд. `kind` нь payload ДОТОР байна (толгойд
     БИШ) тул мөр дэлгэтэл харагдахгүй: `parsePayload` нь байхгүй ба
     танигдахгүй `kind`-ыг хоёуланг `'plan'` болгодог (fail-closed), тиймээс
     UI дээр хоёр дахь анхдагч бодвол хоёр нь зөрч болно. Энэ нь lazy
     татах ГОЛ шалтгаан, зөвхөн гүйцэтгэлийн асуудал биш. ── */
  const fig = useMemo(() => {
    if (!p) return null;
    const entries = Object.entries(p.spans);
    const live = entries.flatMap(([, a]) => (Array.isArray(a) ? a : []).filter((x) => x != null));
    return {
      rowsN: entries.length,
      spansN: live.length,
      from: live.length ? Math.min(...live.map((x) => x!.start)) : null,
      to: live.length ? Math.max(...live.map((x) => x!.end)) : null,
      depsN: Object.keys(p.deps).length,
      obyemN: Object.values(p.obyem).reduce((n, m) => n + Object.keys(m).length, 0),
      otherN: Object.keys(p.actual).length + Object.keys(p.res).length + Object.keys(p.obres ?? {}).length,
    };
  }, [p]);

  return (
    <div className={s.item}>
      <button
        type="button"
        className={s.itemHead}
        onClick={() => onToggle(sub.oid)}
        onMouseEnter={onPrefetch ? () => onPrefetch(sub.oid) : undefined}
        aria-expanded={open}
      >
        <span className={s.chev}>{open ? '▾' : '▸'}</span>
        <span className={s.who}>
          <span className={s.ajil}>{pkg?.label ?? sub.pkgKey}</span>
          <span className={s.meta}>
            {sub.author}
            {' · '}
            {sub.authorSent == null ? '—' : dayKey(sub.authorSent)}
            {waitDays != null && waitDays >= 1 && (
              <>{' · '}<b style={waitDays > 3 ? { color: 'var(--bad-ink)' } : undefined}
                title={tr('Ойролцоо — илгээсэн компьютерын цагаар')}>
                {waitDays > 3 ? '⚠ ' : ''}{tr('≈{0} хоног хүлээж байна', num(waitDays))}
              </b></>
            )}
            {' · '}
            {tr('{0} мөр', num(sub.rowCount))}
          </span>
        </span>
        {partialWhy
          ? <span className={`${s.badge} ${s.bBack}`} title={partialWhy}>{tr('Хагас бичсэн')}</span>
          : <span className={`${s.badge} ${s.bWait}`}>{holder ? tr('{0} батлаж байна', holder) : tr('Хүлээгдэж буй')}</span>}
      </button>

      {open && (
        <div className={`${s.open} ${s.actions}`}>
          {sub.note && (
            <div className={s.reasonBox}>
              <div className={s.reasonLabel}>{tr('Гүйцэтгэгчийн тайлбар')}</div>
              {sub.note}
            </div>
          )}

          {detail?.k === 'loading' && (
            <Loading />
          )}
          {detail?.k === 'fail' && (
            <div className={s.error} role="alert">
              {tr('Илгээлтийн агуулга уншигдсангүй — батлах боломжгүй. Буцаавал гүйцэтгэгч дахин илгээнэ.')}
            </div>
          )}

          {fig && (
            <div className={s.row}>
              <span className={s.meta}>
                {p!.kind === 'geree' ? tr('Төрөл: Гэрээ') : tr('Төрөл: Төлөвлөгөө')}
              </span>
              {fig.spansN === 0 ? (
                <span className={s.meta}>
                  {fig.depsN || fig.obyemN || fig.otherN
                    ? tr('Огнооны өөрчлөлт алга')
                    : tr('Огнооны өөрчлөлт алга — эх хуудас аль хэдийн ижил байна.')}
                </span>
              ) : (
                <>
                  <span className={s.meta}>
                    {tr('Ажил {0} · зурвас {1}', num(fig.rowsN), num(fig.spansN))}
                  </span>
                  {fig.from != null && fig.to != null && (
                    <span className={s.meta}>{`${msToDay(fig.from)} → ${msToDay(fig.to)}`}</span>
                  )}
                </>
              )}
              {fig.depsN > 0 && (
                <span className={s.meta}>{tr('Уялдаа {0}', num(fig.depsN))}</span>
              )}
              {fig.obyemN > 0 && (
                <span className={s.meta}>{tr('Сарын обьём {0} нүд', num(fig.obyemN))}</span>
              )}
            </div>
          )}

          {ownWhy && (
            <div className={s.note} role="status">{ownWhy}</div>
          )}

          {onReject && (
            <>
              <label className={s.reasonLabel} htmlFor={`why-${sub.oid}`}>
                {onReturnStuck && partialWhy ? tr('Гацсаныг буцаах шалтгаан (заавал)') : tr('Буцаах шалтгаан (буцаахад заавал)')}
              </label>
              <textarea
                id={`why-${sub.oid}`}
                className={s.field}
                rows={2}
                value={onReturnStuck ? reasonIn : reason}
                onChange={(e) => onReason(e.target.value)}
                disabled={busy || (partialWhy != null && !onReturnStuck)}
                maxLength={REASON_MAX}
              />
            </>
          )}
          {partialWhy && (onReject || onWithdraw) && (
            <p className={s.reasonBox} role="status">{partialWhy}</p>
          )}
          {holder && (
            <p className={s.reasonBox} role="status">
              {tr('{0} энэ илгээлтийг яг одоо батлаж байна — хэсэг хугацааны дараа хуудсаа шинэчилнэ үү.', holder)}
            </p>
          )}

          <div className={s.row}>
            {onApprove && (
              <button
                type="button"
                className={`${s.btn} ${s.ok}`}
                disabled={busy || detail?.k !== 'ok' || !!holder}
                title={p
                  ? (p.kind === 'geree'
                      ? tr('Багцын ГЭРЭЭНИЙ хуваарь бүтэн дэлгэцээр нээгдэнэ — өөрчлөгдсөн мөр бүрийг зөвшөөрч батална.')
                      : tr('Багцын ТӨЛӨВЛӨГӨӨНИЙ хуваарь бүтэн дэлгэцээр нээгдэнэ — өөрчлөгдсөн мөр бүрийг зөвшөөрч батална.'))
                  : tr('Мөрийг дэлгэж агуулгыг харсны дараа батлана.')}
                onClick={onApprove}
              >
                {tr('Хуваарийг харж батлах')}
              </button>
            )}
            {onWithdraw && (
              <button
                type="button"
                className={`${s.btn} ${s.bad}`}
                disabled={busy || partialWhy != null}
                title={partialWhy ?? tr('Хүлээгдэж буй илгээлтээ буцааж авна — батлагч шийдвэрлэхээ болино')}
                onClick={onWithdraw}
              >
                {tr('Илгээлтээ татах')}
              </button>
            )}
            {onReject && (
              <button
                type="button"
                className={`${s.btn} ${s.bad}`}
                disabled={busy || !reason.trim() || !!holder}
                title={partialWhy
                  ? partialWhy
                  : holder
                    ? tr('{0} энэ илгээлтийг яг одоо батлаж байна.', holder)
                    : reason.trim() ? undefined : tr('Буцаах шалтгааныг бичнэ үү.')}
                onClick={onReject}
              >
                {tr('Буцаах')}
              </button>
            )}
            {onReturnStuck && partialWhy && (
              <button
                type="button"
                className={`${s.btn} ${s.bad}`}
                disabled={busy || !reasonIn.trim() || !!holder}
                title={holder
                  ? tr('{0} энэ илгээлтийг яг одоо батлаж байна.', holder)
                  : reasonIn.trim()
                    ? tr('Хэсэгчлэн бичигдсэн илгээлтийг буцаана — эх хуудсанд бичигдсэн огноо хэвээр үлдэнэ')
                    : tr('Буцаах шалтгааныг бичнэ үү.')}
                onClick={onReturnStuck}
              >
                {tr('Гацсаныг буцаах')}
              </button>
            )}
          </div>
          {onReject && !holder && !busy && !partialWhy && !reason.trim() && (
            <div className={s.meta} role="status">{tr('Буцаахын тулд дээрх талбарт шалтгаанаа бичнэ үү.')}</div>
          )}
        </div>
      )}
    </div>
  );
}
