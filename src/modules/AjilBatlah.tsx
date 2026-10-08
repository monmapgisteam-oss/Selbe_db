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
 * ⚠️⚠️ БАТЛАНГУУТ ҮНДСЭН ХҮСНЭГТЭД БИЧИГДЭНЭ (2026-09-24, хэрэглэгчийн шийдвэр) ⚠️⚠️
 *
 * БАТЛАХ = `decideAjil` (урсгалын мөр `approved`) → `ajilApply.
 * materializeAdds` (сүүлийн жааз + шинэ мөр → бүтэн жааз `applyAdds` →
 * `applied`). Хоёр дахь алхам унавал мөр `approved` хэвээр үлдэж доорх
 * «Батлагдсан · буулгаагүй» хэсэгт гарна — «Дахин буулгах» товч
 * `materializeAdds`-ыг дахин дуудна (идемпотент: давхардлыг хаяна).
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): «Батлагдсан · буулгаагүй» хэсэг
 *    `ajilApply.classifyStuck`-ээр ангилагдана — `retry` (товчтой), `fresh`
 *    (саяхан батлагдсан, батлагчийн цонх бичиж байж магадгүй — хүлээлгийн
 *    дараа хуудас өөрөө шинэчлэгдэж товч нээгдэнэ), `orphan` (бүртгэлгүй багц —
 *    урьд нь ЧИМЭЭГҮЙ нуугддаг байв). Товч нь батлагч ЭСВЭЛ админд
 *    (`mayReapply`); унасан шалтгаан мөр дээрээ хадгалагдана.
 *
 * ⚠️ УРЬД НЬ (2026-09-22 … 09-24) энэ хуудас эх өгөгдөлд ОГТ бичдэггүй байв:
 *    батлагдсан мөр зохиогчийн «Гүйцэтгэл бөглөх» хуудасны `adds` ноорогт
 *    орж, гүйцэтгэлийн 6 шат батлагдтал хүлээдэг байлаа. Хэрэглэгч тэр
 *    хүлээлтийг болиулж, мөр нэмэх УРСГАЛЫГ «Хуваарь» руу шилжүүлсэн.
 *    `HuvaariBatlah`-ийн «батлах нь нөгөө талд гүйцээгдэнэ» асимметр ЭНД
 *    ҮЙЛЧЛЭХЭЭ БОЛЬСОН — бичих ажил `ajilApply.ts`-д (тэндхийн ⚠️-г үз).
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
  NO_PARENT_REASON, ajilClaimHolder, ajilTableState, decideAjil, loadAllApproved, loadAllPending, loadPayloadStamped, returnStuckAjil, withdrawAjil,
  type AjilPayload, type AjilSubmission,
} from '@/lib/ajilBatlah';
import { roleOf } from '@/lib/permissions';
import { classifyStuck, materializeAdds, mayReapply } from '@/lib/ajilApply';
import { hasCap, subscribeCaps } from '@/lib/caps';
/**
 * ⚠️ `HuvaariBatlah` · `Guitsetgel` · `ErhOverview`-ТЭЙ ХУВААЛЦСАН CSS:
 *    батлах дарааллын зохиомж дөрвүүлэнгийнх ижил — нэг өөрчлөлт бүгдийг
 *    хөндөнө. Өөрийн хуулбар үүсгэвэл дөрөв салж, нэг нь чимээгүй хоцорно.
 */
import s from './guitsetgel.module.css';
import { userError } from '@/components/ui';
import { setNavDirty } from '@/lib/navGuard';
import { REASON_MAX } from '@/lib/huvaariBatlah';

/** Багцын түлхүүр → бүртгэл. Модулийн хүрээнд нэг л удаа боддог. */
const PKG_BY_KEY = new Map<string, Pkg>(PKGS.map((p) => [p.key, p]));

/** ⚠️ 2026-09-30: обьём · нэгжийн үнэ — ≤3 бутархай орон, илүү тэггүй (0.4 → «0.4», 142.96 → «142.96») */
const num3 = (v: number): string => (Number.isFinite(v) ? Number(v.toFixed(3)).toLocaleString('en-US') : '—');

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
  | {
    k: 'ready'; rows: AjilSubmission[]; /** батлагдсан ч буугаагүй (2026-09-24) */ approved: AjilSubmission[];
    /** ⚠️ 2026-10-01: татсан агшин — `classifyStuck`-ийн «одоо» (render дотор `Date.now()` дуудахгүй) */
    at: number;
  };

/** `payload` задарсан эсэх — мөр дэлгэхэд л татагдана */
type Detail =
  | { k: 'loading' }
  | { k: 'fail' }
  /** `stamp` — харсан хувилбарын тэмдэг (2026-09-30); `decideAjil`-д дамжина */
  | { k: 'ok'; p: AjilPayload; stamp: string };

export function AjilBatlah() {
  const { user, status } = useAuth();
  /* ⚠️ Нэмэлт ажлын ACL ӨӨРИЙН хадгалалттай — захиалахгүй бол админы
     хуваарилалт энэ хуудсанд хүрэхгүй. */
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeAjilAcl(() => setAclN((x) => x + 1)), []);
  /* ⚠️ 2026-10-01: «Дахин буулгах» товч `ajilApprove` эрхээс хамаарна — эрх
     ачаалагдмагц дахин зурна (эс бөгөөс анх `[]` үед нуугдсан хэвээр үлдэнэ). */
  useEffect(() => subscribeCaps(() => setAclN((x) => x + 1)), []);

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
  /**
   * ⚠️ 2026-10-01: энэ цонхонд буулгах оролдлого ДУУССАН илгээлтүүд — `fresh`
   *    хүлээлгийг алгасна (батлагч алдааг хармагц шууд дахин буулгана).
   */
  const [settled, setSettled] = useState<ReadonlySet<number>>(new Set());
  /** ⚠️ 2026-10-01: илгээлт бүрийн СҮҮЛИЙН буулгалтын алдаа — мөр дээрээ үлдэнэ (дээрх баннер дараагийн үйлдэлд арилдаг) */
  const [applyErr, setApplyErr] = useState<ReadonlyMap<number, string>>(new Map());
  /** ⚠️ 2026-10-04: «эцэг бүлэг олдсонгүй»-ээр унасан илгээлтүүд → `classifyStuck` `orphan` (буцаах товчтой) */
  const [noParent, setNoParent] = useState<ReadonlySet<number>>(new Set());
  const afterApply = useCallback((oid: number, error: string | null, code?: string) => {
    setSettled((x) => new Set(x).add(oid));
    setNoParent((x) => {
      if ((code === 'no-parent') === x.has(oid)) return x;
      const n = new Set(x);
      if (code === 'no-parent') n.add(oid); else n.delete(oid);
      return n;
    });
    setApplyErr((m) => {
      const n = new Map(m);
      if (error) n.set(oid, error); else n.delete(oid);
      return n;
    });
  }, []);

  const [q, setQ] = useState('');
  const [grp, setGrp] = useState(ALL);

  const me = (user?.username ?? '').trim().toLowerCase();
  const isSuper = roleForUser(user?.username) === 'super';

  /* ⚠️ Салсны дараа setState дуудахгүй — `fetchDetail`-ийн async ачаалалт ба
     үйлдлүүдийн `finally` хоёулаа энэ тугийг шалгана. */
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  /**
   * ⚠️ 2026-10-09: ТҮГЖЭЭНИЙ ЦАГИЙН ТИК (`HuvaariBatlah`-ийн загвар, 45 с) — урьд нь түгжигчийг татсан
   *    агшнаар (`st.at`) бодож, `AJIL_CLAIM_TTL` (10 мин) дууссан түгжээ хуудас сэргээтэл «X ажиллаж
   *    байна» гэж үлддэг байв. `Date.now()` render-ийн гадна (react-hooks/purity).
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 45_000);
    return () => window.clearInterval(id);
  }, []);
  /** Түгжигч — ӨӨРӨӨ биш (`h !== me`); өөрийн өөр табын түгжээг «ажиллаж байна» гэж харуулахгүй */
  const holderOf = (x: AjilSubmission, at: number): string | null => {
    const h = ajilClaimHolder(x, Math.max(now, at));
    return h && h !== me ? h : null;
  };
  /** Одоо дэлгэгдсэн мөр — дараалал дахин уншигдахад түүний агуулгыг шинэчилнэ */
  const openRef = useRef<number | null>(null);
  useEffect(() => { openRef.current = open; }, [open]);
  /**
   * Кэшийн ҮЕ — `resetDetail` бүрд өснө (2026-09-30). Өмнөх үеийн хоцорсон
   * хариу шинэ кэшийг ХУУЧИН агуулгаар дарахгүй.
   */
  const gen = useRef(0);

  /** Нэг мөрийн агуулгыг (дахин) татна — кэшийг үл харгалзан */
  const fetchDetail = useCallback((oid: number) => {
    const g = gen.current;
    setDetail((m) => new Map(m).set(oid, { k: 'loading' }));
    void (async () => {
      /* ⚠️ `loadPayloadStamped` нь ӨӨРӨӨ `parsePayload`-оор задалж, эвдэрсэн бол
         `null` буцаана — энд дахин задлах шаардлагагүй. */
      const r = await loadPayloadStamped(oid).catch(() => null);
      if (!alive.current || g !== gen.current) return;
      setDetail((m2) => new Map(m2).set(oid, r ? { k: 'ok', p: r.p, stamp: r.stamp } : { k: 'fail' }));
    })();
  }, []);

  /**
   * ⚠️ 2026-09-30: ДАРААЛАЛ ДАХИН УНШИГДАХАД КЭШИЙГ ЦЭВЭРЛЭНЭ. Урьд нь мөр
   *    анх дэлгэхэд татсан агуулга хуудас refresh хийтэл хэвээр үлддэг байв —
   *    зохиогч `updateAjil`-аар зассан ч батлагч ХУУЧИН мөрүүдийг харж батлах
   *    боломжтой. Дэлгэгдсэн мөрийг шууд дахин татна, бусад нь дэлгэхэд.
   */
  const resetDetail = useCallback(() => {
    gen.current += 1;
    setDetail(new Map());
    if (openRef.current != null) fetchDetail(openRef.current);
  }, [fetchDetail]);

  /* ══════════════════════ ТАТАХ ══════════════════════ */
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: татах эффект — түлхүүр солигдоход ачаалж буй/өмнөх төлөвийг синхрон тэглээд шинээр татна; render үед гаргавал бүтэц өөрчлөгдөнө
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
        /* ⚠️ «Батлагдсан · буулгаагүй» (2026-09-24) — `materializeAdds` унасан
           илгээлтүүд; хэвийн урсгалд хоосон. Хоёр query зэрэг. */
        const [rows, approved] = await Promise.all([loadAllPending(), loadAllApproved()]);
        if (!alive) return;
        setSt({ k: 'ready', rows, approved, at: Date.now() });
        resetDetail();
      } catch (e) {
        if (alive) setSt({ k: 'error', msg: userError(e) });
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  /**
   * ⚠️ 2026-10-06: ПАНЕЛИЙН «super» (override) — харагдац нээлттэй ч БАТЛАХ ХҮРЭЭ нь
   *    хуваарилалтаас (`permissions.roleOf`-ийн ⚠️). Урьд нь тийм хүн хоосон дараалал /
   *    хаалттай товчийг тайлбаргүй хардаг байв — доор ИЛ хэлнэ. Хүрээг энд ӨРГӨТГӨХГҮЙ.
   */
  const panelSuper = status !== 'off' && !isSuper && roleOf(user?.username) === 'super';

  const all = useMemo(() => (st.k === 'ready' ? st.rows : []), [st]);
  const mine = useMemo(
    () => all.filter((x) => scope == null || scope.includes(x.pkgGroup)),
    [all, scope],
  );
  /**
   * Батлагдсан ч буугаагүй — ХҮРЭЭГЭЭР шүүж ангилсан (`classifyStuck`).
   * ⚠️ 2026-10-01: бүртгэлгүй багцыг ХАЯХГҮЙ (`orphan` — тайлбартай, товчгүй);
   *    урьд нь шүүгдэж батлагдсан ажил чимээгүй алга болдог байв.
   */
  const stuck = useMemo(
    () => (st.k === 'ready'
      ? classifyStuck(st.approved, { now: st.at, scope, knownPkg: (k) => PKG_BY_KEY.has(k), settled, noParent })
      : []),
    [st, scope, settled, noParent],
  );
  /**
   * «Дахин буулгах» эрх — батлагч ЭСВЭЛ админ (`mayReapply`; lib-д ч ижил шалгуур).
   * ⚠️ `aclN` — эрх ачаалагдахад дахин бодно (`subscribeCaps`).
   */
  const canReapply = useMemo(
    () => mayReapply({ authOff: status === 'off', isSuper, hasApprove: hasCap(user?.username, 'ajilApprove') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, isSuper, user?.username, aclN],
  );
  /**
   * ⚠️ 2026-10-01: `fresh` мөрийн хүлээлэг дуусахад дарааллыг ӨӨРӨӨ дахин уншина —
   *    тэр хооронд батлагчийн цонх буулгасан бол мөр алга болно, эс бөгөөс товч
   *    нээгдэнэ. Хэрэглэгч хуудсаа гараар шинэчлэх шаардлагагүй.
   */
  const nextReady = useMemo(
    () => stuck.reduce((t, x) => (x.kind === 'fresh' && x.readyAt != null && x.readyAt < t ? x.readyAt : t), Infinity),
    [stuck],
  );
  const loadedAt = st.k === 'ready' ? st.at : null;
  useEffect(() => {
    if (loadedAt == null || !Number.isFinite(nextReady)) return;
    const id = window.setTimeout(reload, Math.max(1_000, nextReady - loadedAt + 1_000));
    return () => window.clearTimeout(id);
  }, [nextReady, loadedAt, reload]);
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

  /* ══════════════════════ МӨР ДЭЛГЭХ ══════════════════════ */
  const toggle = useCallback((oid: number) => {
    setOpen((cur) => (cur === oid ? null : oid));
    /* ⚠️ Кэштэй бол ДАХИН ТАТАХГҮЙ: хумиж дэлгэх нь хүнд хүсэлт давтах
       шалтгаан биш.
       ⚠️ `fail`-ийг КЭШЛЭХГҮЙ (2026-09-25 аудит): түр сүлжээний алдаа
       мөнхөд кэшлэгдэж, хуудас refresh хийтэл «Батлах» хаалттай үлддэг байв
       (`reload` нь `detail`-ийг цэвэрлэдэггүй) — дахин дарахад дахин татна. */
    const cur = detail.get(oid);
    if (!cur || cur.k === 'fail') fetchDetail(oid);
  }, [detail, fetchDetail]);

  /* ══════════════════════ БАТЛАХ ══════════════════════ */
  /**
   * ⚠️ ХОЁР АЛХАМ (2026-09-24): `decideAjil` (төлөв `approved`) → `materializeAdds`
   *    (үндсэн хүснэгтэд бүтэн жааз, төлөв `applied`). Хоёр дахь нь унавал
   *    мөр `approved` хэвээр — «Батлагдсан · буулгаагүй» хэсэгт гарч, «Дахин
   *    буулгах»-аар дахин оролдоно. Батлалтыг буцаахгүй: шийдвэр гарсан,
   *    зөвхөн бичилт хоцорсон.
   * ⚠️ Агуулга уншигдаагүй бол товч ХААЛТТАЙ (`Row`-д) — батлагч юу
   *    батлахаа хараагүй байж батлах ёсгүй.
   */
  const approve = useCallback(async (x: AjilSubmission) => {
    if (busy) return;
    /* ⚠️ БАТАЛГААЖУУЛНА (2026-09-23): батлах нь эх хуудсанд шууд мөр нэмдэг,
       буцаах товчгүй тул мөрийн тоог нэрлээд асууна. Товч нь агуулга
       уншигдсан үед л идэвхтэй тул `detail` энд бэлэн. */
    const d = detail.get(x.oid);
    if (d?.k !== 'ok') return;
    const n = d.p.adds.length;
    if (!window.confirm(tr('{0} мөрийг батлах уу? Батлагдмагц мөрүүд үндсэн хүснэгтэд шууд бичигдэнэ — «Хуваарь» ба «Гүйцэтгэл бөглөх» хоёуланд гарна.', num(n)))) return;
    setBusy(true); setErr(''); setNote('');
    /* ⚠️ Шийдвэр СЕРВЕРТ гарсан эсэх — `catch`-д дараалал дахин уншихад
       (2026-09-25 аудит): шийдвэрийн дараа юу ч шидсэн мөр `approved` болсон
       тул «Шийдвэрлэх»-д хуучирсан хэвээр үлдэж, дахин «Батлах» нь «аль хэдийн
       шийдвэрлэсэн» гэж гацдаг байв. */
    let decided = false;
    try {
      const r = await decideAjil({
        oid: x.oid,
        approve: true,
        approver: user?.username ?? '',
        /* ⚠️ `author` нь ЗӨВХӨН сүлжээнээс өмнөх хямд шалгалт (өөрийгөө
           батлахыг таслах). Жинхэнэ дүрэм нь СЕРВЕРИЙН мөрөөс уншигдана —
           UI-ийн утгыг хэзээ ч дүрэм гэж авч болохгүй. */
        author: x.author,
        /* ⚠️ 2026-09-30: ХАРСАН хувилбарын тэмдэг — зохиогч энэ хооронд
           `updateAjil`-аар зассан бол `decideAjil` татгалзана (`stale`). */
        stamp: d.stamp,
      });
      if (!r.ok) {
        /* ⚠️ 2026-10-06 аудит: түүхий серверийн мөрийг `userError`-оор */
        setErr(r.error ? userError(r.error) : tr('Шийдвэр хадгалагдсангүй.'));
        /* ⚠️ Хуучирсан бол дараалал + агуулгыг дахин уншиж ШИНЭ хувилбарыг харуулна */
        if (r.stale) reload();
        return;
      }
      decided = true;
      /* ⚠️ Бичилт — `pkgKey`-г серверийнхтэй тулгуулна (`materializeAdds`).
         ⚠️ 2026-09-30: `stamp` — шийдвэр ба бичилтийн завсарт агуулга
         солигдвол батлагчийн хараагүй мөрийг бичихгүй. */
      /* ⚠️ 2026-10-06 аудит: БҮТЭН ЖААЗ бичиж байхад (≈1,400 мөр, 500-аар багцлан `applyAdds`)
         F5/таб хаах/харагдац солихыг АСУУНА (`navGuard` → `beforeunload` · Portal) — FillNew-ийн
         'fillnew-send'-ийн ижил. Урьд нь хамгаалалтгүй тул дунд нь тасарвал хагас жааз үлдэж
         багцыг түгжинэ. `finally`-д ЗААВАЛ цэвэрлэнэ. */
      setNavDirty('ajil-apply', true, tr('Нэмэлт ажлыг хуудсанд буулгаж байна'));
      let m: Awaited<ReturnType<typeof materializeAdds>>;
      try {
        m = await materializeAdds({ pkgKey: x.pkgKey, ajilOid: x.oid, stamp: d.stamp });
      } finally {
        setNavDirty('ajil-apply', false);
      }
      if (!alive.current) return;
      /* ⚠️ 2026-10-01: оролдлого ДУУССАН — «Батлагдсан · буулгаагүй»-д хүлээлэггүй
         шууд «Дахин буулгах» гарна, шалтгаан мөр дээрээ үлдэнэ. */
      afterApply(x.oid, m.ok ? null : m.error, m.ok ? undefined : m.code);
      /* ⚠️ 2026-10-08: `materializeAdds`-ийн `warn` (хуваарийн илгээлт хүлээгдэж байна) — мэдэгдлийн ард залгана */
      /* ⚠️ 2026-10-09: `already` (мөрүүд аль хэдийн хуудсанд / өөр таб буулгасан) бол «0 мөр бичигдэв» биш —
         `reapply`-ийн ижил салаалалт */
      if (m.ok) setNote((m.already ? tr('Мөрүүд аль хэдийн хуудсанд байна — «буулгасан» гэж тэмдэглэв.') : tr('Батлагдаж хуудсанд орлоо — {0} мөр үндсэн хүснэгтэд бичигдэв.', num(m.added))) + (m.warn ? ' ' + m.warn : ''));
      else setErr(tr('Батлагдсан, гэвч хуудсанд буулгаж чадсангүй: {0} — «Батлагдсан · буулгаагүй» хэсгээс дахин буулгана уу.', m.error));
      setOpen(null);
      /* ⚠️ БҮТЭН ДАХИН УНШИНА, локал хасалт БИШ: өөр батлагч зуур шийдсэн
         байж болно. Локал мутациар дараалал хүснэгтээсээ чимээгүй зөрнө. */
      reload();
    } catch (e) {
      if (!alive.current) return;
      const msg = userError(e);
      if (decided) {
        afterApply(x.oid, msg);
        setErr(tr('Батлагдсан, гэвч хуудсанд буулгаж чадсангүй: {0} — «Батлагдсан · буулгаагүй» хэсгээс дахин буулгана уу.', msg));
        setOpen(null);
        reload();
      } else setErr(msg);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, user, reload, detail, afterApply]);

  /* ══════════════════════ ДАХИН БУУЛГАХ ══════════════════════
   * ⚠️ Зөвхөн `approved` (батлагдсан ч буугаагүй) мөрд. `materializeAdds` нь
   *    идемпотент — өмнөх оролдлого мөрийг бичээд тэмдэглэж амжаагүй бол
   *    давхардлыг хаяж зөвхөн тэмдэглэнэ.
   * ⚠️ 2026-10-01: давхар дарах / өөр табын зэрэгцээ оролдлогыг lib өөрөө барина
   *    (`inflight` + түгжээ → дараагийнх нь `applied`-ийг уншаад юу ч бичихгүй).
   *    Алдаа мөр дээрээ үлдэнэ (`applyErr`). */
  const reapply = useCallback(async (x: AjilSubmission) => {
    if (busy) return;
    setBusy(true); setErr(''); setNote('');
    /* ⚠️ 2026-10-06 аудит: бичилт явж байхад гарахыг асууна (`approve`-ийн ⚠️) */
    setNavDirty('ajil-apply', true, tr('Нэмэлт ажлыг хуудсанд буулгаж байна'));
    try {
      const m = await materializeAdds({ pkgKey: x.pkgKey, ajilOid: x.oid });
      if (!alive.current) return;
      afterApply(x.oid, m.ok ? null : m.error, m.ok ? undefined : m.code);
      /* ⚠️ 2026-10-09: `warn` нь `already` замд ч ирдэг (`materializeInner`) — урьд нь зөвхөн бичсэн замд залгагддаг байв */
      if (m.ok) setNote((m.already ? tr('Мөрүүд аль хэдийн хуудсанд байна — «буулгасан» гэж тэмдэглэв.') : tr('Хуудсанд орлоо — {0} мөр үндсэн хүснэгтэд бичигдэв.', num(m.added))) + (m.warn ? ' ' + m.warn : ''));
      else setErr(tr('Хуудсанд буулгаж чадсангүй: {0}', m.error));
      reload();
    } catch (e) {
      /* ⚠️ Эрхгүй (`requireCap`) зэрэг шидсэн алдаа — мөн мөр дээр */
      if (!alive.current) return;
      const msg = userError(e);
      afterApply(x.oid, msg);
      setErr(msg);
    } finally {
      setNavDirty('ajil-apply', false);
      if (alive.current) setBusy(false);
    }
  }, [busy, reload, afterApply]);

  /* ══════════════════════ ГАЦСАН БАТЛАЛТЫГ БУЦААХ (2026-10-04) ══════════════════════
   * ⚠️ `orphan` (эцэг бүлэг алга / бүртгэлгүй багц) — дахин буулгах нь хэзээ ч бүтэхгүй тул
   *    батлагч/админ илгээлтийг шалтгаантай нь нэмэгчид буцаана (`ajilBatlah.returnStuckAjil`). */
  const returnStuck = useCallback(async (x: AjilSubmission, why: string) => {
    if (busy) return;
    if (!window.confirm(tr('Батлагдсан ч хуудсанд буулгах боломжгүй илгээлтийг нэмэгчид буцаах уу? Шалтгаан: {0}', why))) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await returnStuckAjil({ oid: x.oid, me: user?.username ?? '', reason: why });
      if (!alive.current) return;
      if (r.ok) setNote(tr('Илгээлт нэмэгчид буцаагдлаа.'));
      else setErr(r.error ? userError(r.error) : tr('Буцааж чадсангүй.'));
      reload();
    } catch (e) {
      if (alive.current) setErr(userError(e));
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
    /* ⚠️ 2026-09-30: БАТАЛГААЖУУЛНА — буцаалт нь буцаах замгүй бөгөөд шалтгаан
       нэмэгчид шууд харагдана (`Huvaari` буцаагдсан илгээлтийг шалтгаантай нь
       нооргонд буулгана). */
    if (!window.confirm(tr('Илгээлтийг буцаах уу? Бичсэн шалтгаан нэмэгчид илгээгдэнэ — нэмэгч засаад дахин илгээнэ.'))) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const d = detail.get(x.oid);
      const r = await decideAjil({
        oid: x.oid,
        approve: false,
        approver: user?.username ?? '',
        author: x.author,
        reason: why,
        /* ⚠️ 2026-09-30: агуулга уншигдсан бол ХАРСАН хувилбарыг тулгана;
           уншигдаагүй (эвдэрсэн агуулга) бол буцаалт нээлттэй хэвээр. */
        stamp: d?.k === 'ok' ? d.stamp : undefined,
      });
      if (!r.ok) {
        setErr(r.error ? userError(r.error) : tr('Шийдвэр хадгалагдсангүй.'));
        if (r.stale) reload();
        return;
      }
      setNote(tr('Нэмэлт ажил буцаагдлаа — нэмэгч засаад дахин илгээнэ.'));
      setReason((m) => { const n = new Map(m); n.delete(x.oid); return n; });
      setOpen(null);
      reload();
    } catch (e) {
      setErr(userError(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [reason, busy, user, reload, detail]);

  /* ══════════════════════ ИЛГЭЭЛТЭЭ ТАТАХ ══════════════════════
   * ⚠️ Зохиогчийн ӨӨРИЙН үйлдэл — «Өөрийн илгээсэн» хэсэгт л гарна.
   *    `decideAjil` нь зохиогч=батлагчийг татгалздаг тул үүнгүйгээр
   *    зохиогч алдаатай илгээлтээ буцаах замгүй болж, өөр батлагч
   *    шийдтэл багц түгжээтэй үлдэнэ.
   * ⚠️ Мөрүүдийг «Хуваарь» хуудас руу ЭНДЭЭС буулгах боломжгүй (`adds` нь
   *    тэндхийн state) — зохиогч тэнд «Илгээлтээ татах»-аар буцааж авах эсвэл
   *    дахин нэмнэ. Тиймээс баталгаажуулах цонхонд түүнийг ИЛ хэлнэ. */
  const withdraw = useCallback(async (x: AjilSubmission) => {
    if (busy) return;
    if (!window.confirm(tr('Илгээлтээ татах уу? Батлагч шийдвэрлэхээ болино; мөрүүдээ «Хуваарь» хуудсанд дахин нэмнэ.'))) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await withdrawAjil({ oid: x.oid, me: user?.username ?? '' });
      if (!r.ok) { setErr(r.error ? userError(r.error) : tr('Илгээлт татагдсангүй.')); return; }
      setNote(tr('Илгээлт татагдлаа — «Хуваарь» хуудсанд дахин нэмж илгээнэ үү.'));
      setOpen(null);
      reload();
    } catch (e) {
      setErr(userError(e));
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
          {tr('«Хуваарь» хуудаснаас ирсэн, батлахыг хүлээж буй шинэ ажлын мөрүүд — батлагдмагц үндсэн хүснэгтэд бичигдэнэ')}
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
        <span className={s.total}>{tr('{0} илгээлт', num(filtered.length))}</span>
      </div>

      <div className={s.body}>
        {err && <div className={s.error} role="alert">{err}</div>}
        {note && <div className={s.note} role="status">{note}</div>}
        {/* ⚠️ 2026-10-06: панелийн super-т хүрээ хуваарилалтаас гэдгийг ИЛ хэлнэ (`panelSuper`) */}
        {st.k === 'ready' && panelSuper && (noRole || noScope || outside) && (
          <div className={s.note} role="note">
            {tr('Хүрээ нь хуваарилалтаас — танд энэ багц хуваарилагдаагүй. Панелийн «super» үүрэг зөвхөн харагдацыг нээнэ; батлахын тулд «Нэмэлт ажлын эрх» хэсэгт багц хуваарилна уу.')}
          </div>
        )}

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
                          : tr('Батлах нэмэлт ажил алга — «Хуваарь» хуудаснаас илгээмэгц энд гарч ирнэ.')}
                </div>
              ) : todo.map((x) => (
                <Row
                  key={x.oid} sub={x} open={open === x.oid} onToggle={toggle}
                  detail={detail.get(x.oid)} busy={busy} holder={holderOf(x, st.at)}
                  reason={reason.get(x.oid) ?? ''}
                  onReason={(v) => setReason((m) => new Map(m).set(x.oid, v))}
                  onReject={() => void reject(x)}
                  onApprove={() => void approve(x)}
                />
              ))}
            </div>

            {/* ⚠️ БАТЛАГДСАН · БУУЛГААГҮЙ (2026-09-24) — `materializeAdds` унасан
                илгээлтүүд. Хэвийн урсгалд ХООСОН тул хэсэг нь зөвхөн байхад
                гарна. Зохиогч=батлагч дүрэм ЭНД ҮЙЛЧЛЭХГҮЙ: шийдвэр аль
                хэдийн гарсан, зөвхөн бичилт хоцорсон — хүрээндээ байгаа ямар
                ч батлагч дахин буулгаж болно. */}
            {stuck.length > 0 && (
              <div className={s.list} style={{ marginTop: 18 }}>
                <div className={s.groupHead}>
                  <span>{tr('Батлагдсан · буулгаагүй')}</span>
                  <span className={s.groupCount}>{num(stuck.length)}</span>
                </div>
                <div className={s.note} role="status">
                  {tr('Эдгээр илгээлт батлагдсан боловч үндсэн хүснэгтэд бичигдээгүй (сүлжээ, зэрэгцээ батлалт). «Дахин буулгах» дарна уу — давхар мөр үүсэхгүй.')}
                </div>
                {/* ⚠️ 2026-10-01: ангилал бүрд ӨӨР тайлбар — товч зөвхөн `retry` ба
                    эрхтэй (батлагч/админ) үед. `fresh` нь товчгүй: өөр компьютер
                    дээрх батлагчийн цонх яг одоо бичиж байж магадгүй. */}
                {stuck.map(({ sub: x, kind, readyAt }) => (
                  <Row
                    key={x.oid} sub={x} open={open === x.oid} onToggle={toggle}
                    detail={detail.get(x.oid)} busy={busy} holder={holderOf(x, st.at)}
                    reason="" onReason={() => {}}
                    badge={tr('Батлагдсан')}
                    lastError={applyErr.get(x.oid)}
                    onReapply={kind === 'retry' && canReapply ? () => void reapply(x) : undefined}
                    onReturnStuck={kind === 'orphan' && canReapply
                      ? () => void returnStuck(x, noParent.has(x.oid) ? NO_PARENT_REASON() : tr('Багцын түлхүүр бүртгэлд алга — хуудсанд буулгах боломжгүй.'))
                      : undefined}
                    ownWhy={kind === 'orphan'
                      ? (noParent.has(x.oid)
                        ? tr('Эцэг бүлэг хуудсанд олдсонгүй — дахин буулгах боломжгүй. Нэмэгчид буцаана уу.')
                        : tr('Энэ багцын түлхүүр бүртгэлд алга — хуудсанд буулгах боломжгүй. Админд хандана уу.'))
                      : kind === 'fresh'
                        ? tr('Саяхан батлагдсан — батлагчийн цонх яг одоо хуудсанд бичиж байж магадгүй. Давхар бичилтээс сэргийлж «Дахин буулгах» {0} минутын дараа нээгдэнэ (хуудас өөрөө шинэчлэгдэнэ).',
                          num(Math.max(1, Math.ceil(((readyAt ?? st.at) - st.at) / 60_000))))
                        : canReapply
                          ? undefined
                          : tr('Дахин буулгах эрхгүй — нэмэлт ажлын батлагч эсвэл админ буулгана.')}
                  />
                ))}
              </div>
            )}

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
                    detail={detail.get(x.oid)} busy={busy} holder={holderOf(x, st.at)}
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
                    detail={detail.get(x.oid)} busy={busy} holder={holderOf(x, st.at)}
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
  sub, open, onToggle, detail, busy, reason, onReason, onReject, onApprove, ownWhy, onWithdraw, onReapply, onReturnStuck, badge, lastError, holder,
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
  /** Батлагдсан ч буугаагүй мөрийг дахин буулгана (2026-09-24) — зөвхөн «Батлагдсан · буулгаагүй» хэсэгт */
  onReapply?: () => void;
  /** ⚠️ 2026-10-04: буулгах боломжгүй (`orphan`) батлагдсан илгээлтийг нэмэгчид буцаана */
  onReturnStuck?: () => void;
  /** Төлвийн тэмдэг — анхдагч «Хүлээгдэж буй» */
  badge?: string;
  /** ⚠️ 2026-10-01: энэ цонхны СҮҮЛИЙН буулгалтын алдаа — «Батлагдсан · буулгаагүй»-д */
  lastError?: string;
  /**
   * ⚠️ 2026-10-09: илгээлтийг СЕРВЕР дээр түгжсэн хүн (`ajilBatlah.ajilClaimHolder` — өөр батлагч
   *    яг одоо шийдвэрлэж/буулгаж байна). Урьд нь харагддаггүй тул дарахад л «яг одоо…» алдаа гардаг байв.
   */
  holder?: string | null;
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
            {/* ⚠️ 2026-10-09: түгжигч — хумисан мөрөнд ч харагдана (`holder`-ийн ⚠️) */}
            {holder && !busy ? ` · ${tr('{0} ажиллаж байна', holder)}` : ''}
          </span>
        </span>
        <span className={`${s.badge} ${s.bWait}`}>{badge ?? tr('Хүлээгдэж буй')}</span>
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
                    {/* ⚠️ 2026-09-30: БУТАРХАЙГ ХАДГАЛНА (≤3 орон, бөглөх хуудасны `qty`-тэй ижил) —
                        `num` анхдагчаар 0 оронтой тул 0.4 → «0», 142.96 → «143» гэж
                        батлагчид БУРУУ тоо харагддаг байв. */}
                    <span className={s.chVal}>
                      {a.vol == null ? '—' : num3(a.vol)}
                      {a.unit == null ? '' : ` × ${num3(a.unit)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {holder && !busy && (
            <div className={s.note} role="status">
              {tr('{0} энэ илгээлтийг яг одоо шийдвэрлэж/буулгаж байна — дуусахыг хүлээгээд хуудсаа шинэчилнэ үү.', holder)}
            </div>
          )}

          {ownWhy && (
            /* ⚠️ ХАРАГДАХ мөр, `title` ганцаараа БИШ — хүрэлцэх төхөөрөмж
               дээр `title` хэзээ ч гарахгүй. */
            <div className={s.note} role="status">{ownWhy}</div>
          )}

          {lastError && (
            /* ⚠️ 2026-10-01: дээд баннер дараагийн үйлдэлд арилдаг — шалтгаан
               мөр дээрээ үлдэж, батлагч/админ юуг засахаа харна. */
            <div className={s.error} role="alert">{tr('Сүүлийн буулгалт унав: {0}', lastError)}</div>
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
                /* ⚠️ 2026-10-06 аудит: HuvaariBatlah-ийн ижил дээд хязгаар — `decideAjil` мөн тайрна */
                maxLength={REASON_MAX}
                onChange={(e) => onReason(e.target.value)}
                disabled={busy}
              />
            </>
          )}

          {/* ⚠️ 2026-09-30: ХААЛТТАЙ ТОВЧНЫ ШАЛТГААН ИЛ МӨРӨӨР — `title` хүрэлцэх
              төхөөрөмж дээр гарахгүй тул товч яагаад дарагдахгүйг хэлэх ганц зам.
              Агуулга уншигдаагүй (`fail`) бол дээрх алдааны мөр аль хэдийн хэлсэн. */}
          {(() => {
            const why: string[] = [];
            if (busy) why.push(tr('Өөр үйлдэл хийгдэж байна — дуусахыг хүлээнэ үү.'));
            else {
              if (onApprove && detail?.k !== 'ok' && detail?.k !== 'fail')
                why.push(tr('Агуулга ачаалагдсаны дараа батлах боломжтой.'));
              if (onReject && !reason.trim())
                why.push(tr('Буцаахын тулд дээр шалтгаанаа бичнэ үү.'));
            }
            return why.length ? <div className={s.reasonLabel} role="note">{why.join(' ')}</div> : null;
          })()}

          <div className={s.actions}>
            {onApprove && (
              <button
                type="button"
                className={`${s.btn} ${s.ok}`}
                /* ⚠️ Агуулга уншигдаагүй бол БАТЛАХГҮЙ — батлагч юу
                   батлахаа хараагүй байна. */
                disabled={busy || detail?.k !== 'ok'}
                title={p
                  ? tr('Батлагдмагц мөрүүд үндсэн хүснэгтэд шууд бичигдэнэ.')
                  : tr('Мөрийг дэлгэж агуулгыг харсны дараа батлана.')}
                onClick={onApprove}
              >
                {tr('Батлах')}
              </button>
            )}
            {onReapply && (
              <button
                type="button"
                className={`${s.btn} ${s.ok}`}
                disabled={busy}
                title={tr('Батлагдсан мөрүүдийг үндсэн хүснэгтэд дахин бичнэ — аль хэдийн байгаа мөр давхардахгүй')}
                onClick={onReapply}
              >
                {tr('Дахин буулгах')}
              </button>
            )}
            {onReturnStuck && (
              <button
                type="button"
                className={`${s.btn} ${s.bad}`}
                disabled={busy}
                title={tr('Илгээлтийг шалтгаантай нь нэмэгчид буцаана — тэр засаад дахин илгээнэ')}
                onClick={onReturnStuck}
              >
                {tr('Нэмэгчид буцаах')}
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
