'use client';

/**
 * НЭМЭЛТ АЖИЛ БАТЛАХ — батлахыг хүлээж буй БҮХ саналын дараалал (2026-09-22).
 *
 * ⚠️ ЯАГААД ТУСДАА ХУУДАС БАЙХ ЁСТОЙ (хэрэглэгчийн шийдвэр: «batlah heseg
 *    tusda baih ystoi tged tuun deer orj irj batlana, guitsetgel bogloh
 *    hesegt hamtda baij bolohgui»): урьд нь батлах товч «Гүйцэтгэл бөглөх»
 *    хуудсан дээр байсан тул батлагч нь багц бүрийг ГАРААР нэг нэгээр нээж
 *    «энд хүлээгдэж буй нэмэлт ажил байна уу?» гэж шалгах цорын ганц
 *    замтай байв. Багц нь 18. Мөн бөглөх хуудас нь БӨГЛӨХ зориулалттай —
 *    хоёр огт өөр үүргийг нэг дэлгэцэд нийлүүлэх нь эргэлзээ төрүүлнэ.
 *
 * ⚠️ `HuvaariBatlah.tsx`-ИЙН ЗАГВАРААР — зохиомж, хэсгүүд (шийдвэрлэх ·
 *    өөрийн · бүртгэлгүй), fail-closed хамрах хүрээ, гурван хоосон
 *    мессеж бүгд түүнтэй ижил. Тэр хуудсыг өөрчилбөл энэ ч дагах ёстой.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ⚠️⚠️ ЭНЭ ХУУДАС ЭХ ӨГӨГДӨЛД ХЭЗЭЭ Ч БИЧИХГҮЙ ⚠️⚠️
 *
 * БАТЛАХ нь `decideAjil`-ээр урсгалын мөрийн ТӨЛВИЙГ л хөдөлгөнө. Мөр нь
 * «Гүйцэтгэл бөглөх» хуудсанд орох ажил нь ТЭНД болно: тэр хуудас
 * нээгдэхдээ `loadApproved`-оор батлагдсаныг ӨӨРӨӨ татаж `adds`-д
 * буулгаад `markApplied`-аар тэмдэглэнэ.
 *
 * ЯАГААД ИЙМ: `adds` нь `FillNew`-ийн React state бөгөөд гаднаас хүрэхгүй.
 * Мөн шинэ мөр архивт зөвхөн БҮТЭН жаазаар үүсдэг (`hyanaltStore` →
 * `applyAdds`) — ганц мөр нэмэх зам БАЙХГҮЙ. Энд бичихийг оролдвол тэр
 * бүх логикийг хуулбарлах шаардлагатай болж, хоёр зам сална.
 *
 * ЭНЭ НЬ `HuvaariBatlah`-ТАЙ ИЖИЛ АСИММЕТР: буцаах нь энд бүрэн
 * шийдэгдэнэ (эх өгөгдөлд хүрэхгүй), батлах нь нөгөө талд гүйцээгдэнэ.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useAuth } from '@/components/AuthGate';
import { ajilScope, hasAjilRole, subscribeAjilAcl } from '@/lib/ajilAcl';
import { roleForUser } from '@/lib/services';
import { dayKey, num } from '@/lib/format';
import { PKGS, type Pkg } from '@/modules/sheet/bagts.pkg';
import {
  ajilTableState, decideAjil, loadAllPending, loadPayload, withdrawAjil,
  type AjilPayload, type AjilSubmission,
} from '@/lib/ajilBatlah';
/**
 * ⚠️ `HuvaariBatlah` · `Guitsetgel` · `ErhOverview`-ТЭЙ ХУВААЛЦСАН CSS:
 *    батлах дарааллын зохиомж дөрвүүлэнгийнх ижил — нэг өөрчлөлт бүгдийг
 *    хөндөнө. Өөрийн хуулбар үүсгэвэл дөрөв салж, нэг нь чимээгүй хоцорно.
 */
import s from './guitsetgel.module.css';

/** Багцын түлхүүр → бүртгэл. Модулийн хүрээнд нэг л удаа боддог. */
const PKG_BY_KEY = new Map<string, Pkg>(PKGS.map((p) => [p.key, p]));

const ALL = '';

/**
 * Татах төлөв.
 *
 * ⚠️ `blocked` ба `error` ХОЁР ӨӨР: эхнийх нь батлах ХҮСНЭГТ бэлэн биш
 *    (нэвтрэлт, эзэмшил, хүснэгт алга) — админы хийх зүйл; хоёрдугаарх нь
 *    query унасан — сүлжээний. Нэгтгэвэл админ юуг засахаа мэдэхгүй.
 */
type State =
  | { k: 'loading' }
  | { k: 'blocked'; why: string }
  | { k: 'error'; msg: string }
  | { k: 'ready'; rows: AjilSubmission[] };

/** `payload` задарсан эсэх — мөр дэлгэхэд л татагдана */
type Detail =
  | { k: 'loading' }
  | { k: 'fail' }
  | { k: 'ok'; p: AjilPayload };

export function AjilBatlah() {
  const { user, status } = useAuth();
  /* ⚠️ Нэмэлт ажлын ACL ӨӨРИЙН хадгалалттай — захиалахгүй бол админы
     хуваарилалт энэ хуудсанд хүрэхгүй. */
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeAjilAcl(() => setAclN((x) => x + 1)), []);

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
        /* ⚠️ ХҮСНЭГТИЙН БЭЛЭН БАЙДЛЫГ ЭХЛЭЭД — дөрвөн өөр шалтгаан, дөрвөн
           өөр зөвлөгөө. ⚠️ `none` нь ЭНД ӨӨР: бусад батлах хүснэгт super
           нэвтрэхэд автоматаар үүсдэг, энэ нь AGOL дээр ГАРААР нийтлэгдсэн
           тул үүсэх зам байхгүй (`ajilBatlah.AjilTableState`-ийн ⚠️). */
        const t = await ajilTableState();
        if (!alive) return;
        if (!t.ok) {
          setSt({ k: 'blocked', why:
            t.why === 'auth'
              ? tr('ArcGIS-д нэвтрээгүй байна — гарч ороод дахин оролдоно уу.')
              : t.why === 'owner'
                ? tr('Батлах хүснэгт БАЙНА, гэвч түүнийг үүсгэсэн хэрэглэгч танигдахгүй байна. AGOL дээр item-ийн эзнийг super админ руу шилжүүлнэ үү.')
                : t.why === 'error'
                  ? tr('Порталын хайлт амжилтгүй: {0}', t.detail ?? '')
                  : tr('Батлах хүснэгт олдсонгүй — AGOL дээр «Selbe_Ajil_Batlah_csv» үйлчилгээ нийтлэгдсэн эсэхийг админаас лавлана уу.') });
          return;
        }
        /* ⚠️ `HEAD_FIELDS`-ийн хөнгөн байдал нь ГЭРЭЭ: `payload` (1,048,576
           тэмдэгт) энд ТАТАГДАХГҮЙ, зөвхөн мөр дэлгэхэд `loadPayload`-оор
           нэгийг. Projection-д нэмбэл хэдэн арван саналын агуулга зэрэг
           татагдаж хуудас гацна. */
        const rows = await loadAllPending();
        if (!alive) return;
        setSt({ k: 'ready', rows });
      } catch (e) {
        if (alive) setSt({ k: 'error', msg: String((e as Error).message || e) });
      }
    })();
    return () => { alive = false; };
  }, [tick, status, isSuper, user?.username]);

  /* ══════════════════════ ХАМРАХ ХҮРЭЭ ══════════════════════ */
  /**
   * ⚠️ FAIL-CLOSED — `HuvaariBatlah`-тай ИЖИЛ дүрэм.
   *
   * Энэ бол ҮЙЛДЛИЙН ХАЙРЦАГ. Өөр батлагчийн дараалал энд харагдах нь
   * (1) шуугиан, (2) `decideAjil` татгалзах товч дарахыг урих, (3) бусдын
   * ажлын хэмжээг гоожуулах. Тиймээс:
   *     `null`     → бүх pending
   *     `[...]`    → зөвхөн тэр бүлгүүд
   *     `[]`       → ХООСОН + «админаас багц гуй»
   *
   * ⚠️ Хатуу `super` нь хамаагүй бүгдийг харна: хуваарилалтыг засах хүн
   *    өөрөө хуваарилалт байхгүйгээс болж харалгүй түгжигдэх ёсгүй.
   */
  const scope = useMemo(
    () => (status === 'off' || isSuper ? null : ajilScope(user?.username, 'approver')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.username, status, isSuper, aclN],
  );
  /** Нэг ч багц хуваарилагдаагүй — дараалал хоосон байгаагийн ШАЛТГААН */
  const noScope = Array.isArray(scope) && scope.length === 0;
  /** Батлагчийн үүрэг ОГТ байхгүй — өөр шалтгаан, өөр мессеж */
  const noRole = status !== 'off' && !isSuper && !hasAjilRole(user?.username, 'approver');

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
  const known = (x: AjilSubmission) => PKG_BY_KEY.has(x.pkgKey);
  const isOwn = useCallback(
    (x: AjilSubmission) => !!me && me === x.author.trim().toLowerCase(),
    [me],
  );
  const todo = filtered.filter((x) => known(x) && !isOwn(x));
  const own = filtered.filter((x) => known(x) && isOwn(x));
  const orphan = filtered.filter((x) => !known(x));

  const dirty = !!q || !!grp;

  /* ⚠️ Салсны дараа setState дуудахгүй — `toggle`-ийн async ачаалалт ба
     үйлдлүүдийн `finally` хоёулаа энэ тугийг шалгана. */
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  /* ══════════════════════ МӨР ДЭЛГЭХ ══════════════════════ */
  const toggle = useCallback((oid: number) => {
    setOpen((cur) => (cur === oid ? null : oid));
    /* ⚠️ Кэштэй бол ДАХИН ТАТАХГҮЙ: хумиж дэлгэх нь хүнд хүсэлт давтах
       шалтгаан биш. */
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

  /* ══════════════════════ БАТЛАХ ══════════════════════ */
  /**
   * ⚠️ ЗӨВХӨН ТӨЛӨВ — эх өгөгдөлд ЮУ Ч бичихгүй (файлын толгойг үз).
   *    Мөр нь «Гүйцэтгэл бөглөх» хуудас нээгдэхэд тэнд буулгагдана.
   * ⚠️ Агуулга уншигдаагүй бол товч ХААЛТТАЙ (`Row`-д) — батлагч юу
   *    батлахаа хараагүй байж батлах ёсгүй.
   */
  const approve = useCallback(async (x: AjilSubmission) => {
    if (busy) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await decideAjil({
        oid: x.oid,
        approve: true,
        approver: user?.username ?? '',
        /* ⚠️ `author` нь ЗӨВХӨН сүлжээнээс өмнөх хямд шалгалт (өөрийгөө
           батлахыг таслах). Жинхэнэ дүрэм нь СЕРВЕРИЙН мөрөөс уншигдана —
           UI-ийн утгыг хэзээ ч дүрэм гэж авч болохгүй. */
        author: x.author,
      });
      if (!r.ok) { setErr(r.error ?? tr('Шийдвэр хадгалагдсангүй.')); return; }
      setNote(tr('Батлагдлаа — мөрүүд «Гүйцэтгэл бөглөх» хуудсанд тэр багцыг нээхэд орж ирнэ.'));
      setOpen(null);
      /* ⚠️ БҮТЭН ДАХИН УНШИНА, локал хасалт БИШ: өөр батлагч зуур шийдсэн
         байж болно. Локал мутациар дараалал хүснэгтээсээ чимээгүй зөрнө. */
      reload();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, user, reload]);

  /* ══════════════════════ БУЦААХ ══════════════════════ */
  const reject = useCallback(async (x: AjilSubmission) => {
    const why = (reason.get(x.oid) ?? '').trim();
    /* ⚠️ Шалтгаан ЗААВАЛ — `decideAjil`-ийн домэйн дүрмийн UI тусгал.
       Жинхэнэ гэйт нь тэнд хэвээр; энэ нь зөвхөн урьдчилан хэлэх. */
    if (busy || !why) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await decideAjil({
        oid: x.oid,
        approve: false,
        approver: user?.username ?? '',
        author: x.author,
        reason: why,
      });
      if (!r.ok) { setErr(r.error ?? tr('Шийдвэр хадгалагдсангүй.')); return; }
      setNote(tr('Нэмэлт ажил буцаагдлаа — нэмэгч засаад дахин илгээнэ.'));
      setReason((m) => { const n = new Map(m); n.delete(x.oid); return n; });
      setOpen(null);
      reload();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [reason, busy, user, reload]);

  /* ══════════════════════ ИЛГЭЭЛТЭЭ ТАТАХ ══════════════════════
   * ⚠️ Зохиогчийн ӨӨРИЙН үйлдэл — «Өөрийн илгээсэн» хэсэгт л гарна.
   *    `decideAjil` нь зохиогч=батлагчийг татгалздаг тул үүнгүйгээр
   *    зохиогч алдаатай илгээлтээ буцаах замгүй болж, өөр батлагч
   *    шийдтэл багц түгжээтэй үлдэнэ.
   * ⚠️ Мөрүүдийг «Гүйцэтгэл бөглөх» хуудас руу ЭНДЭЭС буулгах боломжгүй
   *    (`adds` нь тэндхийн state) — зохиогч тэнд дахин нэмнэ. Тиймээс
   *    баталгаажуулах цонхонд түүнийг ИЛ хэлнэ. */
  const withdraw = useCallback(async (x: AjilSubmission) => {
    if (busy) return;
    if (!window.confirm(tr('Илгээлтээ татах уу? Батлагч шийдвэрлэхээ болино; мөрүүдээ «Гүйцэтгэл бөглөх» хуудсанд дахин нэмнэ.'))) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await withdrawAjil({ oid: x.oid, me: user?.username ?? '' });
      if (!r.ok) { setErr(r.error ?? tr('Илгээлт татагдсангүй.')); return; }
      setNote(tr('Илгээлт татагдлаа — «Гүйцэтгэл бөглөх» хуудсанд дахин нэмж илгээнэ үү.'));
      setOpen(null);
      reload();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, user, reload]);

  /* ══════════════════════ ЗУРАГДАЛТ ══════════════════════ */
  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <b className={s.title}>{tr('Нэмэлт ажил батлах')}</b>
        <span className={s.sub}>
          {tr('«Гүйцэтгэл бөглөх» хуудаснаас ирсэн, батлахыг хүлээж буй шинэ ажлын мөрүүд')}
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
                      батлагч «ажил алга» гэж ойлгоод хүлээсээр байна. */}
                  {noRole
                    ? tr('Танд нэмэлт ажил батлах үүрэг олгогдоогүй байна. Админ «Нэмэлт ажлын эрх» хэсэгт батлагчаар томилсны дараа саналууд энд харагдана.')
                    : noScope
                      ? tr('Танд нэг ч багц хуваарилагдаагүй байна. Админ «Нэмэлт ажлын эрх» хэсэгт багц зааж өгсний дараа батлах ажил харагдана.')
                      : outside
                        /* ⚠️ Хүрээнээс гадуурх ТООГ ХЭЛЭХГҮЙ — тэр нь өөр
                           батлагчийн ажлын хэмжээ. */
                        ? tr('Таны багцуудад батлах нэмэлт ажил алга.')
                        : dirty
                          ? tr('Шүүлтэнд тохирох илгээлт алга.')
                          : tr('Батлах нэмэлт ажил алга — «Гүйцэтгэл бөглөх» хуудаснаас илгээмэгц энд гарч ирнэ.')}
                </div>
              ) : todo.map((x) => (
                <Row
                  key={x.oid} sub={x} open={open === x.oid} onToggle={toggle}
                  detail={detail.get(x.oid)} busy={busy}
                  reason={reason.get(x.oid) ?? ''}
                  onReason={(v) => setReason((m) => new Map(m).set(x.oid, v))}
                  onReject={() => void reject(x)}
                  onApprove={() => void approve(x)}
                />
              ))}
            </div>

            {/* ⚠️ ӨӨРИЙН ИЛГЭЭЛТ — ТУСДАА ХЭСЭГ, нийлүүлж хаагаагүй.
                `decideAjil` нь өөрийгөө батлахыг ХОЁР давхаргад татгалздаг;
                UI нь товч дарахаас ӨМНӨ хэлэх ёстой. Хаагдсан товчийг
                бусад мөрийн дунд тавибал «эвдэрсэн» гэж ойлгогдоно. */}
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
                    ownWhy={tr('Өөрийн илгээсэн нэмэлт ажлыг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.')}
                    onWithdraw={() => void withdraw(x)}
                  />
                ))}
              </div>
            )}

            {/* ⚠️ БҮРТГЭЛГҮЙ БАГЦ — мөрийг ХАЯХГҮЙ. Хаявал гацсан санал
                мөнхөд харагдахгүй болж, тэр багцад шинэ илгээлт хийх
                боломжгүй болно (`submitAjil` нь pending байвал татгалздаг).
                Батлах хаалттай (`Pkg` объект байхгүй), БУЦААХ нээлттэй —
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
                    /* ⚠️ Өөрийн илгээлт бол товч ГАРАХГҮЙ — дарахад
                       `decideAjil` татгалзах л байсан, эвдэрсэн товч. */
                    onReject={isOwn(x) ? undefined : () => void reject(x)}
                    onWithdraw={isOwn(x) ? () => void withdraw(x) : undefined}
                    ownWhy={tr('Энэ багцын түлхүүр бүртгэлд алга — батлах боломжгүй. Буцаавал нэмэгч зөв багцаар дахин илгээнэ.')}
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
  sub: AjilSubmission;
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
  /** Зохиогч өөрийн илгээлтээ татна — зөвхөн «Өөрийн» хэсэгт */
  onWithdraw?: () => void;
}) {
  const pkg = PKG_BY_KEY.get(sub.pkgKey);
  const p = detail?.k === 'ok' ? detail.p : null;

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
            {/* ⚠️ `authorSent` нь `null` байж болно — «—» гэж бичнэ
                (null ≠ 0 дүрэм).
                ⚠️ `dayKey` (ОРОН НУТГИЙН), `msToDay` (UTC) БИШ: `authorSent`
                нь ЦАГТАЙ агшин тул UTC-ээр өдөр болгоход УБ-д 00:00–08:00-д
                илгээснийг өчигдөр гэж харуулна. */}
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
              <div className={s.reasonLabel}>{tr('Нэмэгчийн тайлбар')}</div>
              {sub.note}
            </div>
          )}

          {detail?.k === 'loading' && (
            <div className={s.empty}>{tr('Ачаалж байна…')}</div>
          )}
          {detail?.k === 'fail' && (
            /* ⚠️ Задарсангүй нь АЛДАА. Батлах хаагдана — юу батлахаа харж
               чадахгүй; буцаах нээлттэй. */
            <div className={s.error} role="alert">
              {tr('Илгээлтийн агуулга уншигдсангүй — батлах боломжгүй. Буцаавал нэмэгч дахин илгээнэ.')}
            </div>
          )}

          {/* ⚠️ МӨР БҮРИЙГ ИЛ ХАРУУЛНА — батлагч «юуг гэрээнд нэмэх гэж
              байна» гэдгийг нэрээр нь харах ёстой. Тоо ганцаараа (жишээ нь
              «3 мөр») хангалтгүй: шинэ ажлыг зөвшөөрөх нь гэрээний хамрах
              хүрээг өргөтгөх шийдвэр. */}
          {p && p.adds.length > 0 && (
            <div className={s.chWrap}>
              <div className={s.chHead}>
                <span>{tr('Нэмэгдэх ажил')}</span>
                <span className={s.chCount}>{num(p.adds.length)}</span>
              </div>
              <div className={s.chList}>
                {p.adds.map((a) => (
                  <div key={a.oid} className={s.chItem}>
                    <span className={s.chWork}>
                      {a.no ? `${a.no} · ` : ''}{a.work}
                    </span>
                    <span className={s.chBlk}>
                      {tr('Эцэг: {0}', a.parentWork || '—')}
                    </span>
                    {/* ⚠️ `null` нь «хэмжилтгүй» — 0 гэж БИЧИХГҮЙ. */}
                    <span className={s.chVal}>
                      {a.vol == null ? '—' : num(a.vol)}
                      {a.unit == null ? '' : ` × ${num(a.unit)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ownWhy && (
            /* ⚠️ ХАРАГДАХ мөр, `title` ганцаараа БИШ — хүрэлцэх төхөөрөмж
               дээр `title` хэзээ ч гарахгүй. */
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
                title={p
                  ? tr('Батлагдсан мөрүүд «Гүйцэтгэл бөглөх» хуудсанд тэр багцыг нээхэд орж ирнэ.')
                  : tr('Мөрийг дэлгэж агуулгыг харсны дараа батлана.')}
                onClick={onApprove}
              >
                {tr('Батлах')}
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
