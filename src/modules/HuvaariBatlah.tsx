'use client';

/**
 * ХУВААРЬ БАТЛАХ — батлахыг хүлээж буй БҮХ саналын дараалал (2026-09-16).
 *
 * ⚠️ ЯАГААД ЭНЭ ХУУДАС БАЙХ ЁСТОЙ (хэрэглэгч: «аль аль багц ямар төлөвлөгөө
 *    ирүүлсэнийг харж батлах хэсэг огт алга», «ажилхад маш ойлгомжгүй»):
 *    урьд нь батлагч нь «Хуваарь» хуудсан дээрх ХОЁР сонгогчоор (багцын
 *    бүлэг → багц) багц бүрийг ГАРААР нэг нэгээр нээж «энд хүлээгдэж буй
 *    санал байна уу?» гэж шалгах цорын ганц замтай байв. Багц нь хэдэн арав.
 *
 * ⚠️ `loadAllPending` нь бүх pending-ийг НЭГ query-гээр татдаг байсан ч
 *    НЭГ Ч ДУУДАГЧГҮЙ байлаа — жагсаалтын харагдац зохиогдсон ч хэрэгжээгүй
 *    (`HEAD_FIELDS` нь хүнд `payload`-ыг санаатай хасдаг нь түүний шинж).
 *    Энэ файл түүнийг дуусгана.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ⚠️⚠️ ЭНЭ ХУУДАС ЭХ ӨГӨГДӨЛД ХЭЗЭЭ Ч БИЧИХГҮЙ ⚠️⚠️
 *
 * БАТЛАХ нь энд БИШ — товч дарахад тэр багцаар «Хуваарь» хуудас нээгдэж,
 * шийдвэрлэх цонх өөрөө гарна (`onApprove` → `Portal.planJump`).
 *
 * ЯАГААД: батлах нь `Huvaari.tsx`-д ГУРВАН шаттай гинж —
 *   `setApproving(oid)` → `useEffect` → `save()` → `applyUpdates()` →
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
import {
  decidePlan, loadAllPending, loadPayload, planTableState, withdrawPlan,
  type PlanPayload, type PlanSubmission,
} from '@/lib/huvaariBatlah';
/**
 * ⚠️ ГУРВАН ХЭРЭГЛЭГЧТЭЙ CSS (2026-09-16): `Guitsetgel.tsx` (гүйцэтгэлийн
 *    4 шатны дараалал), `ErhOverview.tsx` ба ЭНЭ файл. Батлах дарааллын
 *    зохиомж нь гурвуулангийнх ижил — нэг өөрчлөлт гурвыг хөндөнө.
 * ⚠️ `huvaari.module.css` (`h.*`) ДАХИН ХЭРЭГЛЭХГҮЙ: тэр нь зүүн багана
 *    царцсан Gantt хүрээнд зориулагдсан, жагсаалтад тохирохгүй.
 */
import s from './guitsetgel.module.css';

/** Багцын түлхүүр → бүртгэл. Модулийн хүрээнд нэг л удаа боддог. */
const PKG_BY_KEY = new Map<string, Pkg>(PKGS.map((p) => [p.key, p]));

const ALL = '';

/**
 * Татах төлөв.
 *
 * ⚠️ `blocked` ба `error` ХОЁР ӨӨР: эхнийх нь батлах ХҮСНЭГТ бэлэн биш
 *    (нэвтрэлт, эзэмшил, хүснэгт үүсээгүй) — админы хийх зүйл; хоёрдугаарх
 *    нь query унасан — сүлжээний. Нэгтгэвэл админ юуг засахаа мэдэхгүй.
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
  onApprove, navScope = 'all',
}: {
  /** Батлахаар «Хуваарь» хуудас руу шилжүүлнэ (`Portal` хэрэгжүүлнэ) */
  onApprove?: (pkgKey: string, oid: number) => void;
  /**
   * Хэрэглэгчийн харж болох харагдацууд — `huvaari` дотор байх шаардлагатай.
   * ⚠️ `'all'` нь ХЯЗГААРГҮЙ (`Schem.tsx:617`-тай ижил хэлбэр).
   */
  navScope?: 'all' | ViewKey[];
}) {
  const { user, status } = useAuth();
  /* ⚠️ Хуваарийн ACL ӨӨРИЙН хадгалалттай — захиалахгүй бол админы
     хуваарилалт энэ хуудсанд хүрэхгүй (`Huvaari.tsx`-тай ижил). */
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeHuvaariAcl(() => setAclN((x) => x + 1)), []);

  const [st, setSt] = useState<State>({ k: 'loading' });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  const [open, setOpen] = useState<number | null>(null);
  const [detail, setDetail] = useState<Map<number, Detail>>(new Map());
  /** Буцаах шалтгаан — МӨР ТУТАМ, `oid`-оор түлхүүрлэгдэнэ */
  const [reason, setReason] = useState<Map<number, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const [q, setQ] = useState('');
  const [grp, setGrp] = useState(ALL);

  const me = (user?.username ?? '').trim().toLowerCase();
  const isSuper = roleForUser(user?.username) === 'super';

  /* ══════════════════════ ТАТАХ ══════════════════════ */
  useEffect(() => {
    let alive = true;
    setSt({ k: 'loading' });
    void (async () => {
      try {
        /* ⚠️ ХҮСНЭГТИЙН БЭЛЭН БАЙДЛЫГ ЭХЛЭЭД — `Huvaari.refreshFlow`-той ЯГ
           ижил онош. Дөрвөн мессеж нь ч ЯГ ижил түлхүүр: админд нэг л
           адилхан тайлбар харагдах ёстой, хоёр өөр хэллэг нь «хоёр өөр
           асуудал» гэж ойлгогдоно. */
        const t = await planTableState(status === 'off' || isSuper);
        if (!alive) return;
        if (!t.ok) {
          setSt({ k: 'blocked', why:
            t.why === 'auth'
              ? tr('ArcGIS-д нэвтрээгүй байна — гарч ороод дахин оролдоно уу.')
              : t.why === 'owner'
                ? tr('Батлах хүснэгт БАЙНА, гэвч түүнийг үүсгэсэн хэрэглэгч танигдахгүй байна. AGOL дээр item-ийн эзнийг super админ руу шилжүүлнэ үү.')
                : t.why === 'error'
                  ? tr('Порталын хайлт амжилтгүй: {0}', t.detail ?? '')
                  : tr('Батлах хүснэгт олдсонгүй — админ (super) нэг удаа нэвтрэхэд автоматаар үүснэ.') });
          return;
        }
        /* ⚠️ `HEAD_FIELDS`-ийн хөнгөн байдал нь ГЭРЭЭ: `payload` (1,048,576
           тэмдэгт) энд ТАТАГДАХГҮЙ, зөвхөн мөр дэлгэхэд `loadPayload`-оор
           нэгийг. Projection-д `payload` нэмбэл хэдэн арван саналын хүнд
           агуулга зэрэг татагдаж хуудас гацна. */
        const rows = await loadAllPending();
        if (!alive) return;
        setSt({ k: 'ready', rows });
      } catch (e) {
        if (alive) setSt({ k: 'error', msg: String((e as Error).message || e) });
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, status, isSuper, user?.username]);

  /* ══════════════════════ ХАМРАХ ХҮРЭЭ ══════════════════════ */
  /**
   * ⚠️ `Huvaari.tsx:236-250`-аас САНААТАЙ ЗӨРНӨ — fail-closed.
   *
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
   *
   * ⚠️ Хатуу `super` нь хамаагүй бүгдийг харна: хуваарилалтыг засах хүн
   *    өөрөө хуваарилалт байхгүйгээс болж харалгүй түгжигдэх ёсгүй
   *    (`Guitsetgel.tsx:1078-1081`-ийн админ-гацлын хамгаалалттай ижил).
   *
   * ⚠️ Хожим «`Huvaari`-тай нэгтгэе» гэж засвал бусдын дараалал гоожно.
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

  const all = st.k === 'ready' ? st.rows : [];
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
  const known = (x: PlanSubmission) => PKG_BY_KEY.has(x.pkgKey);
  const isOwn = useCallback(
    (x: PlanSubmission) => !!me && me === x.author.trim().toLowerCase(),
    [me],
  );
  const todo = filtered.filter((x) => known(x) && !isOwn(x));
  const own = filtered.filter((x) => known(x) && isOwn(x));
  const orphan = filtered.filter((x) => !known(x));

  const dirty = !!q || !!grp;

  /* ⚠️ Салсны дараа setState дуудахгүй (2026-09-16 аудит) — `toggle`-ийн
     async ачаалалт ба `reject`-ийн `finally` хоёулаа энэ тугийг шалгана. */
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  /* ══════════════════════ МӨР ДЭЛГЭХ ══════════════════════ */
  const toggle = useCallback((oid: number) => {
    setOpen((cur) => (cur === oid ? null : oid));
    /* ⚠️ Кэштэй бол ДАХИН ТАТАХГҮЙ: хумиж дэлгэх нь 80KB-ийн хүсэлт
       давтах шалтгаан биш. */
    setDetail((m) => {
      if (m.has(oid)) return m;
      const next = new Map(m);
      next.set(oid, { k: 'loading' });
      void (async () => {
        /* ⚠️ `loadPayload` нь ӨӨРӨӨ `parsePayload`-оор задалж, эвдэрсэн бол
           `null` буцаана — энд дахин задлах шаардлагагүй. */
        const p = await loadPayload(oid).catch(() => null);
        if (alive.current) setDetail((m2) => new Map(m2).set(oid, p ? { k: 'ok', p } : { k: 'fail' }));
      })();
      return next;
    });
  }, []);

  /* ══════════════════════ БУЦААХ ══════════════════════ */
  const reject = useCallback(async (x: PlanSubmission) => {
    const why = (reason.get(x.oid) ?? '').trim();
    /* ⚠️ Шалтгаан ЗААВАЛ — `decidePlan`-ийн домэйн дүрмийн UI тусгал.
       Жинхэнэ гэйт нь тэнд хэвээр; энэ нь зөвхөн урьдчилан хэлэх. */
    if (busy || !why) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await decidePlan({
        oid: x.oid,
        approve: false,
        approver: user?.username ?? '',
        /* ⚠️ `author` нь ЗӨВХӨН сүлжээнээс өмнөх хямд шалгалт (өөрийгөө
           батлахыг таслах). Жинхэнэ дүрэм нь СЕРВЕРИЙН мөрөөс уншигдана —
           UI-ийн утгыг хэзээ ч дүрэм гэж авч болохгүй. */
        author: x.author,
        reason: why,
      });
      if (!r.ok) { setErr(r.error ?? tr('Шийдвэр хадгалагдсангүй.')); return; }
      setNote(tr('Хуваарь буцаагдлаа — гүйцэтгэгч засаад дахин илгээнэ.'));
      setReason((m) => { const n = new Map(m); n.delete(x.oid); return n; });
      setOpen(null);
      /* ⚠️ БҮТЭН ДАХИН УНШИНА, локал хасалт БИШ: өөр батлагч зуур
         шийдсэн байж болно (`decidePlan`-ийн хоцролын хамгаалалт). Локал
         мутациар дараалал хүснэгтээсээ чимээгүй зөрнө. */
      reload();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [reason, busy, user, reload]);

  /* ══════════════════════ ИЛГЭЭЛТЭЭ ТАТАХ (2026-09-21) ══════════════════════
   * ⚠️ Зохиогчийн ӨӨРИЙН үйлдэл — «Өөрийн илгээсэн» хэсэгт л гарна. Эх
   *    өгөгдөлд ЮУ Ч бичихгүй (`withdrawPlan` зөвхөн төлөв хөдөлгөнө) — энэ
   *    хуудасны цөм инвариант хэвээр. Ноорог руу буулгах нь энд БОЛОМЖГҮЙ
   *    (хуанли энд байхгүй) — «Хуваарь» хуудасны «Илгээлтээ татах» тэгдэг;
   *    энд татсан бол зохиогч тэнд шинээр зохионо. */
  const withdraw = useCallback(async (x: PlanSubmission) => {
    if (busy) return;
    if (!window.confirm(tr('Илгээлтээ татах уу? Батлагч шийдвэрлэхээ болино; агуулгыг «Хуваарь» хуудсанд дахин зохионо.'))) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await withdrawPlan({ oid: x.oid, me: user?.username ?? '' });
      if (!r.ok) { setErr(r.error ?? tr('Илгээлт татагдсангүй.')); return; }
      setNote(tr('Илгээлт татагдлаа — «Хуваарь» хуудсанд засаад дахин илгээж болно.'));
      setOpen(null);
      /* ⚠️ Бүтэн дахин уншина (`reject`-тэй ижил шалтгаан). */
      reload();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, user, reload]);

  /**
   * «Хуваарь» харагдац хаалттай бол батлах товч ОГТ гарахгүй.
   * ⚠️ Эрхийн загвар салбарлавал (`planApprove` нь ХОЁУЛАНГ нээдэг —
   *    `caps.ts` `CAP_HOST_VIEW`) энэ товч үхсэн байх ёсгүй.
   */
  const canJump = !!onApprove && (navScope === 'all' || navScope.includes('huvaari'));

  /* ══════════════════════ ЗУРАГДАЛТ ══════════════════════ */
  return (
    <div className={s.wrap}>
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
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className={s.select} value={grp} onChange={(e) => setGrp(e.target.value)}>
          <option value={ALL}>{tr('Бүх багц')}</option>
          {groupOpts.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        {dirty && (
          <button className={s.clear} onClick={() => { setQ(''); setGrp(ALL); }}>
            {tr('Цэвэрлэх')}
          </button>
        )}
        <span className={s.spacer} />
        <span className={s.total}>{tr('{0} илгээлт', num(filtered.length))}</span>
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
          <div className={s.empty}>{tr('Ачаалж байна…')}</div>
        ) : st.k !== 'ready' ? null : (
          <>
            <div className={s.list}>
              <div className={s.groupHead}>
                <span>{tr('Шийдвэрлэх')}</span>
                <span className={s.groupCount}>
                  {tr('хүлээгдэж буй {0}', num(todo.length))}
                </span>
              </div>
              {todo.length === 0 ? (
                <div className={s.empty}>
                  {/* ⚠️ ГУРВАН ӨӨР ШАЛТГААН, гурван өөр мессеж. Нэгтгэвэл
                      батлагч «ажил алга» гэж ойлгоод хүлээсээр байна —
                      `Guitsetgel.tsx:1274-1284`-ийн сургамж. */}
                  {noRole
                    ? tr('Танд хуваарь батлах үүрэг олгогдоогүй байна. Админ «Хуваарийн эрх» хэсэгт батлагчаар томилсны дараа саналууд энд харагдана.')
                    : noScope
                      ? tr('Танд нэг ч багц хуваарилагдаагүй байна. Админ «Хуваарийн эрх» хэсэгт багц зааж өгсний дараа батлах хуваарь харагдана.')
                      : outside
                        /* ⚠️ Хүрээнээс гадуурх ТООГ ХЭЛЭХГҮЙ — тэр нь өөр
                           батлагчийн ажлын хэмжээ. */
                        ? tr('Таны багцуудад батлах хуваарь алга.')
                        : dirty
                          ? tr('Шүүлтэнд тохирох илгээлт алга.')
                          : tr('Батлах хуваарь алга — гүйцэтгэгч илгээмэгц энд гарч ирнэ.')}
                </div>
              ) : todo.map((x) => (
                <Row
                  key={x.oid} sub={x} open={open === x.oid} onToggle={toggle}
                  detail={detail.get(x.oid)} busy={busy}
                  reason={reason.get(x.oid) ?? ''}
                  onReason={(v) => setReason((m) => new Map(m).set(x.oid, v))}
                  onReject={() => void reject(x)}
                  onApprove={canJump ? () => onApprove?.(x.pkgKey, x.oid) : undefined}
                />
              ))}
            </div>

            {/* ⚠️ ӨӨРИЙН ИЛГЭЭЛТ — ТУСДАА ХЭСЭГ, нийлүүлж хаагаагүй.
                `decidePlan` нь өөрийгөө батлахыг ХОЁР давхаргад татгалздаг;
                UI нь товч дарахаас ӨМНӨ хэлэх ёстой. Хаагдсан товчийг
                бусад мөрийн дунд тавибал «эвдэрсэн» гэж ойлгогдоно —
                тусад нь гаргавал шалтгаан нь нэг харцад ойлгогдоно. */}
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

            {/* ⚠️ БҮРТГЭЛГҮЙ БАГЦ — мөрийг ХАЯХГҮЙ. Хаявал гацсан санал
                мөнхөд харагдахгүй болж, тэр багцын хуваарь `Huvaari.locked`
                -оор бүрмөсөн түгжигдэнэ. Батлах хаалттай (`Pkg` объект
                байхгүй, хаашаа шилжихээ мэдэхгүй), БУЦААХ нээлттэй —
                гацлаас гарах цорын ганц зам. */}
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
                    /* ⚠️ Өөрийн илгээлт бол товч ГАРАХГҮЙ (2026-09-16 аудит) —
                       дарахад `decidePlan` татгалзах л байсан, эвдэрсэн товч. */
                    onReject={isOwn(x) ? undefined : () => void reject(x)}
                    /* ⚠️ ӨӨРИЙН илгээлт бол ТАТАХ товч (2026-09-21): буцаах
                       хаалттай (өөрийгөө буцаахгүй), «Хуваарь» руу шилжих ч
                       боломжгүй тул зохиогчид гацлаас гарах өөр зам байгаагүй. */
                    onWithdraw={isOwn(x) ? () => void withdraw(x) : undefined}
                    ownWhy={tr('Энэ багцын түлхүүр бүртгэлд алга — «Хуваарь» хуудас руу шилжих боломжгүй. Буцаавал гүйцэтгэгч зөв багцаар дахин илгээнэ.')}
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
  sub, open, onToggle, detail, busy, reason, onReason, onReject, onApprove, ownWhy, onWithdraw,
}: {
  sub: PlanSubmission;
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

  /* ── `payload`-ийн тоонууд. ⚠️ `kind` нь payload ДОТОР байна (толгойд
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
    };
  }, [p]);

  return (
    <div className={s.item}>
      <button
        type="button"
        className={s.itemHead}
        onClick={() => onToggle(sub.oid)}
        aria-expanded={open}
      >
        <span className={s.chev}>{open ? '▾' : '▸'}</span>
        <span className={s.who}>
          <span className={s.ajil}>{pkg?.label ?? sub.pkgKey}</span>
          <span className={s.meta}>
            {sub.author}
            {' · '}
            {/* ⚠️ `authorSent` нь `null` байж болно — `dayKey(null)` руу
                дамжуулахгүй, «—» гэж бичнэ (null ≠ 0 дүрэм).
                ⚠️ `dayKey` (ОРОН НУТГИЙН), `msToDay` (UTC) БИШ (2026-09-21):
                `authorSent = Date.now()` нь ЦАГТАЙ агшин тул UTC-ээр өдөр
                болгоход УБ-д 00:00–08:00-д илгээснийг өчигдөр гэж харуулдаг
                байв. Хадгалагдсан ms өөрчлөгдөхгүй — зөвхөн харуулалт.
                Хуанлийн огноо (`fig.from/to`) нь UTC шөнө дундаар түлхүүрлэгдсэн
                ЦАГГҮЙ өдөр тул тэнд `msToDay` зөв хэвээр. */}
            {sub.authorSent == null ? '—' : dayKey(sub.authorSent)}
            {' · '}
            {tr('{0} мөр', num(sub.rowCount))}
          </span>
        </span>
        <span className={`${s.badge} ${s.bWait}`}>{tr('Хүлээгдэж буй')}</span>
      </button>

      {open && (
        <div className={s.open}>
          {sub.note && (
            <div className={s.reasonBox}>
              <div className={s.reasonLabel}>{tr('Гүйцэтгэгчийн тайлбар')}</div>
              {sub.note}
            </div>
          )}

          {detail?.k === 'loading' && (
            <div className={s.empty}>{tr('Ачаалж байна…')}</div>
          )}
          {detail?.k === 'fail' && (
            /* ⚠️ Задарсангүй нь АЛДАА (хоосон `spans`-аас ЯЛГААТАЙ, доор).
               Батлах хаагдана — юу батлахаа харж чадахгүй; буцаах нээлттэй. */
            <div className={s.error} role="alert">
              {tr('Илгээлтийн агуулга уншигдсангүй — батлах боломжгүй. Буцаавал гүйцэтгэгч дахин илгээнэ.')}
            </div>
          )}

          {fig && (
            <div className={s.row}>
              <span className={s.meta}>
                {p!.kind === 'geree' ? tr('Төрөл: Гэрээ') : tr('Төрөл: Төлөвлөгөө')}
              </span>
              {/* ⚠️ ХООСОН `spans` нь ХҮЧИНТЭЙ, эвдрэл БИШ: эх хуудас өөр
                  замаар аль хэдийн ижил утгад хүрсэн байж болно. Алдаа
                  болговол илгээлт мөнхөд гацна — `Huvaari`-д ч «бичих
                  зүйлгүй» гэсэн салаа байдаг. Батлах НЭЭЛТТЭЙ хэвээр. */}
              {fig.spansN === 0 ? (
                <span className={s.meta}>
                  {tr('Огнооны өөрчлөлт алга — эх хуудас аль хэдийн ижил байна.')}
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
              {/* ⚠️ 0 бол ОГТ бичихгүй: уялдаагүй, обьёмгүй санал нь ХЭВИЙН
                  тул тэг эгнээ нь эвдрэл шиг харагдана. */}
              {fig.depsN > 0 && (
                <span className={s.meta}>{tr('Уялдаа {0}', num(fig.depsN))}</span>
              )}
              {fig.obyemN > 0 && (
                <span className={s.meta}>{tr('Сарын обьём {0} нүд', num(fig.obyemN))}</span>
              )}
            </div>
          )}

          {ownWhy && (
            /* ⚠️ ХАРАГДАХ мөр, `title` ганцаараа БИШ — хүрэлцэх төхөөрөмж
               дээр `title` хэзээ ч гарахгүй (`Huvaari.tsx:2166`-ийн сургамж). */
            <div className={s.note} role="status">{ownWhy}</div>
          )}

          {onReject && (
            <>
              <label className={s.reasonLabel} htmlFor={`why-${sub.oid}`}>
                {tr('Буцаах шалтгаан (буцаахад заавал)')}
              </label>
              <textarea
                id={`why-${sub.oid}`}
                className={s.field}
                rows={2}
                value={reason}
                onChange={(e) => onReason(e.target.value)}
                disabled={busy}
              />
            </>
          )}

          <div className={s.actions}>
            {onApprove && (
              <button
                type="button"
                className={`${s.btn} ${s.ok}`}
                /* ⚠️ Агуулга уншигдаагүй бол БАТЛАХГҮЙ — батлагч юу
                   батлахаа хараагүй байна. */
                disabled={busy || detail?.k !== 'ok'}
                /* ⚠️ Шошго нь «Хуваарь хуудсанд батлах» — зүгээр «Батлах»
                   гэвэл нэг товшилтоор батлагдана гэж ойлгогдоно. Тэнд
                   «урьдчилан хараагүй» сануулга САНААТАЙ бөгөөд үлдэнэ. */
                title={p
                  ? (p.kind === 'geree'
                      ? tr('«Хуваарь» хуудас «Гэрээ» таб дээр нээгдэж, шийдвэрлэх цонх гарна.')
                      : tr('«Хуваарь» хуудас «Төлөвлөгөө» таб дээр нээгдэж, шийдвэрлэх цонх гарна.'))
                  : tr('Мөрийг дэлгэж агуулгыг харсны дараа батлана.')}
                onClick={onApprove}
              >
                {tr('Хуваарь хуудсанд батлах')}
              </button>
            )}
            {onWithdraw && (
              <button
                type="button"
                className={`${s.btn} ${s.bad}`}
                disabled={busy}
                title={tr('Хүлээгдэж буй илгээлтээ буцааж авна — батлагч шийдвэрлэхээ болино')}
                onClick={onWithdraw}
              >
                {tr('Илгээлтээ татах')}
              </button>
            )}
            {onReject && (
              <button
                type="button"
                className={`${s.btn} ${s.bad}`}
                disabled={busy || !reason.trim()}
                title={reason.trim() ? undefined : tr('Буцаах шалтгааныг бичнэ үү.')}
                onClick={onReject}
              >
                {tr('Буцаах')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
