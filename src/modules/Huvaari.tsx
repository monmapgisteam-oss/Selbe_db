'use client';

/**
 * ХУВААРЬ — «Гүйцэтгэл бөглөх» хуудасны эхлэх/дуусах огноог ТӨЛӨВЛӨХ хэсэг.
 *
 * ⚠️ ЯАГААД ТУСДАА ХАРАГДАЦ (2026-08-28, хэрэглэгчийн шийдвэр): бөглөх хуудас
 * нь 1,400 мөр × 60 багана. Тэнд нэг ажлыг 12–22 блокт хуваарилахын тулд
 * 24–44 удаа календар нээж дарна. Амьд өгөгдөл үүнийг баталсан — 10 багцын
 * 6-д хуваарийн хамралт 6%-иас доогуур байв.
 *
 * ⚠️ НЭГ БҮТЭН ХҮСНЭГТ (2026-09-01, хэрэглэгчийн заавар). Урьд нь дээд талд
 * ЖАГСААЛТ, доод талд тусдаа ХУАНЛИ байсан: дээрээс бүлгээ сонгоод доор нь
 * төлөвлөнө. Хоёр тусдаа хэсэг байсан тул сонгосон мөр доод хуанлиас олдохгүй,
 * харц дээш доош үсэрдэг байв. Одоо ХОЁУЛАА НЭГ ХҮСНЭГТ: зүүн талд ажлын мод,
 * мөр БҮРИЙН АРД өөрийнх нь хуваарийн зурвас. Мөр нэгээс нэг эгнэнэ.
 *
 * ⚠️ ХОЁР ЗАМААР ТОХИРУУЛНА:
 *   1. ЗУРВАС ЧИРЭХ — хурдан, харьцангуй (мужийг нүдээр тааруулна).
 *   2. POPUP ХУАНЛИ — ажлын нэр дээр дарахад нээгдэнэ; огноог ТООГООР
 *      нарийн оруулна, бүх блокт нэг дор тараана. Чирэлт нь 1 пиксель = 1
 *      хоног тул яг тодорхой огноо тавихад тохиромжгүй.
 *
 * ⚠️ ХАДГАЛАЛТ нь БАЙГАА хуудсанд буцаж бичигдэнэ (`applyUpdates`) — шинэ
 * үйлчилгээ үүсгэхгүй тул төлөвлөгөөт хувь, график, тайлан бүгд өөрчлөлтгүй.
 * АРХИВТ ШИНЭ АГШИН ҮҮСГЭХГҮЙ: хуваарь нь хэмжилт биш, төлөвлөгөө.
 */

import {
  type PointerEvent as PEvt, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Section, Empty, Loading } from '@/components/ui';
import { useAuth } from '@/components/AuthGate';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { bagtsScope, stageOfUser, subscribeAcl } from '@/lib/guitsetgelAcl';
import { roleForUser } from '@/lib/services';
import { num } from '@/lib/format';
import {
  loadSchema, pkgFloors, PKG_GROUPS, PKGS, type Pkg, type Schema,
} from '@/modules/sheet/bagts.pkg';
import { applyUpdates, loadRows, msToDay, type SheetRow } from '@/modules/sheet/bagtsSheet';
import {
  DAY, MAX_DAYS, coverageOf, endOf, spanDays, statusOf,
  type PlanRow, type Span, type Status,
} from '@/lib/plan';
import h from './huvaari.module.css';

/* ══════════════════ Туслах ══════════════════ */

/** Богино огноо — «03-02». Жил нь хүрээний шошгонд бий. */
const short = (ms: number) => msToDay(ms).slice(5);

/** «2026-05-04» → UTC шөнө дунд. Буруу бол `null`. */
const dayToMs = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/** `SheetRow[]` → `PlanRow[]`. `i` нь ЭХ массивын индекс. */
function toPlanRows(rows: SheetRow[], n: number): PlanRow[] {
  return rows.map((r, i) => ({
    i,
    oid: r.oid,
    no: r.no,
    work: r.work,
    depth: r.depth,
    group: r.group,
    spans: Array.from({ length: n }, (_, b) => (
      r.start[b] != null && r.end[b] != null
        ? { start: r.start[b] as number, end: r.end[b] as number }
        : null
    )),
    act: r.act,
  }));
}

/**
 * Мөрийн НИЙТ муж — хамгийн эрт эхлэх → хамгийн сүүл дуусах. Хуваарьгүй бол `null`.
 * ⚠️ Шүүлт, мөрийн шошго, popup гурвуулаа үүнийг ашиглана — тус тусад нь
 *    бодвол «жагсаалтад орсон ч өөр огноо харуулах» зөрүү үүснэ.
 */
export function rowSpan(r: PlanRow): Span | null {
  let a: number | null = null;
  let z: number | null = null;
  for (const s of r.spans) {
    if (!s) continue;
    if (a == null || s.start < a) a = s.start;
    if (z == null || s.end > z) z = s.end;
  }
  return a == null || z == null ? null : { start: a, end: z };
}


/** Нийтлээгүй засвар: `oid` → блок бүрийн шинэ хуваарь */
type Draft = Map<number, (Span | null)[]>;

/**
 * Хүснэгтийн мөрийн өндөр (px).
 * ⚠️ Зүүн нэрийн багана ба баруун хуанли ЯГ ЭНЭ өндрөөр эгнэнэ. Аль нэгийг нь
 *    өөрчилвөл мөрүүд гулсаж, «энэ зурвас аль ажлынх нь вэ» гэдэг алдагдана.
 */
const PL_ROW = 30;

/**
 * Хоног тутмын өргөн (px) — томруулалт бүрд.
 *
 * ⚠️ 2026-09-01: 34/12/4 байсныг НАРИЙСГАВ (хэрэглэгч: «хугацааны интервалыг
 *    ойртуул, хэтэрхий хол байна»). 12px/хоног үед 7 хоногийн багана 84px
 *    зайтай тул нэг дэлгэцэнд ердөө ~4 сар багтаж, урт хуваарийг харах гэхэд
 *    тасралтгүй гүйлгэх шаардлагатай байв.
 * ⚠️ ДООД ХЯЗГААР нь 6px: түүнээс нарийсвал 1–2 хоногийн ажлын зурвас чирэх
 *    хоёр бариулаасаа нарийн болж, дундуур нь чирж ЗӨӨХ газар үлдэхгүй.
 */
const ZOOM: Record<'day' | 'week' | 'month', number> = { day: 20, week: 7, month: 2.6 };
type Zoom = keyof typeof ZOOM;

/**
 * ⚠️ ӨНГӨ нь ТӨЛӨВЛӨГӨӨ биш ГҮЙЦЭТГЭЛийг илэрхийлнэ: дууссан ногоон, явж
 * буй цэнхэр, хоцорсон улаан, эхлээгүй саарал, хэмжигдээгүй нь ЦАЙВАР
 * ЗУРААСТАЙ — «мэдэхгүй»-г «тэг»-ээс ялгана.
 */
const ST_CLASS: Record<Status, string> = {
  done: h.tlDone, run: h.tlRun, todo: h.tlTodo, late: h.tlLate, none: h.tlNone,
};
/* ⚠️ Утга бүр `tr()`-ээр. Энэ Record нь зөвхөн зураасны `title` дотор
   `${ST_TEXT[st]}` гэж ордог тул орчуулгын ямар ч зам дайрдаггүй байсан —
   `i18n-extract` ч статик `tr('…')` дуудлага олохгүй тул «ДУТУУ 0» гэж
   худал тайлагнаж, англи горимд ганц энэ tooltip монголоор үлддэг байв. */
const ST_TEXT: Record<Status, string> = {
  done: tr('дууссан'), run: tr('явж байгаа'), todo: tr('эхлээгүй'),
  late: tr('хоцорсон'), none: tr('хэмжигдээгүй'),
};

type DragMode = 'new' | 'move' | 'l' | 'r';
type Drag = { oid: number; mode: DragMode; anchor: number; orig: Span | null };

/* ══════════════════ Үндсэн харагдац ══════════════════ */

export function Huvaari() {
  const { user, status } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  const [aclN, setAclN] = useState(0);
  useEffect(() => subscribeAcl(() => setAclN((x) => x + 1)), []);
  const [pkg, setPkg] = useState<Pkg>(PKGS[0]);
  /**
   * БАГЦЫН ХҮРЭЭ (2026-08-29): урсгалд томилогдсон хүн зөвхөн ӨӨРИЙН багцыг
   * төлөвлөнө — «Багц 2»-ын менежер «Багц 4»-ийн хуваарийг чирэх ёсгүй.
   * ⚠️ ТОМИЛОГДООГҮЙ эрхтэн (урсгалын гишүүн биш төлөвлөгч) → бүх багц: энэ бол
   *    нэрээр олгодог эрх. САНААТАЙ шийдвэр — `[]` болгож «засах» хэрэггүй.
   */
  const bagtsLimit = useMemo(
    () => (status === 'off' || roleForUser(user?.username) === 'super' || !stageOfUser(user?.username)
      ? null
      : bagtsScope(user?.username)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, status, aclN],
  );
  const groupOpts = useMemo(
    () => (bagtsLimit ? PKG_GROUPS.filter((g) => bagtsLimit.includes(g)) : PKG_GROUPS),
    [bagtsLimit],
  );
  /**
   * ЗАСАХ ЭРХ — тусад нь олгодог (`caps`) + багцын хүрээ.
   * ⚠️ Нэг огноо солиход БҮХ багцын төлөвлөгөөт хувь, тайлан, хоцрогдлын
   *    дохио дахин бодогдоно. Бөглөх эрхэд дагалдуулж болохгүй: бөглөгч
   *    өөрийн хоцрогдлыг арилгахын тулд хуваарийг хойш чирэх боломжтой болно.
   */
  const canEdit = useMemo(
    () => (status === 'off' || hasCap(user?.username, 'plan'))
      && (bagtsLimit == null || bagtsLimit.includes(pkg.group)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, status, capN, bagtsLimit, pkg.group],
  );

  const [sc, setSc] = useState<Schema | null>(null);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const [draft, setDraft] = useState<Draft>(new Map());
  const [sel, setSel] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [q, setQ] = useState('');
  /** Popup хуанли нээгдсэн мөр (`PlanRow.i`) */
  const [modal, setModal] = useState<number | null>(null);

  /**
   * ШҮҮЛТҮҮР. `filter` нь түргэн таб, бусад нь сонголт.
   * ⚠️ Тусдаа талбар болгосон шалтгаан: хэрэглэгч «хоцорсон, урт, 2026 онд
   *    эхлэх» гэж ХОСЛУУЛЖ шүүнэ. Нэг радио жагсаалт байсан бол зөвхөн нэгийг.
   */
  const [filter, setFilter] = useState<'all' | 'has' | 'none' | 'partial'>('all');
  const [fLv, setFLv] = useState<'all' | 'group' | 'task'>('all');
  const [fDur, setFDur] = useState<'all' | 'w' | 'm' | 'q' | 'long'>('all');
  const [fYear, setFYear] = useState('all');
  /**
   * БҮЛГЭЭР ШҮҮХ — сонгосон бүлэг ба ДОТОРХ бүх ажлыг л үлдээнэ.
   * ⚠️ Утга нь `PlanRow.i` (эх массивын индекс), `oid` БИШ: ижил нэртэй
   *    бүлэг олон байж болох ба индекс нь модны байрлалыг ч заана.
   */
  const [fGrp, setFGrp] = useState<'all' | number>('all');

  /* ── Хуанлийн төлөв ── */
  const [zoom, setZoom] = useState<Zoom>('week');
  const [blk, setBlk] = useState(0);
  const [takt, setTakt] = useState(7);
  const [drag, setDrag] = useState<Drag | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const jumped = useRef(false);
  /**
   * Чирэлт хамгийн сүүлд ЯМАР ХОНОГ дээр байсан.
   * ⚠️ `pointermove` секундэд ~60 удаа ирнэ, харин хоног нь зөвхөн багана
   *    (4–34px) давахад л солигдоно. Хоног солигдоогүй бол ажил хийхгүй —
   *    эс тэгвээс 1,266 мөрийн тооцоо кадр бүрд дахин бодогдоно.
   */
  const lastDay = useRef(-1);
  /** Товшилт vs чирэлт */
  const moved = useRef(false);

  /*
   * ⚠️ Сонгосон багц хүрээнээс ГАДУУР бол зөвшөөрөгдсөн эхнийх рүү шилжинэ
   *    — эс бөгөөс хэрэглэгч засах эрхгүй хуудас ширтэнэ. Хадгалаагүй
   *    ноорогтой үед хөндөхгүй (`askSwitch`-ийн дүрэм).
   */
  useEffect(() => {
    if (groupOpts.includes(pkg.group) || draft.size || !groupOpts.length) return;
    const first = pkgFloors(groupOpts[0])[0];
    if (first) setPkg(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupOpts]);

  useEffect(() => {
    let alive = true;
    setBusy(true); setErr(''); setRows([]); setSc(null);
    setDraft(new Map()); setSel(null); setCollapsed(new Set()); setQ(''); setModal(null);
    setBlk(0); jumped.current = false;
    loadSchema(pkg)
      .then(async (schema) => {
        const r = await loadRows(pkg, schema);
        if (!alive) return;
        setSc(schema);
        setRows(r.rows);
      })
      .catch((e) => alive && setErr(String((e as Error).message || e)))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [pkg]);

  const n = sc?.bld.length ?? 0;

  /** Ноорогийг эх мөрүүд дээр давхарлана — харагдац үргэлж ХАМГИЙН СҮҮЛИЙНХ */
  const base = useMemo(() => toPlanRows(rows, n), [rows, n]);
  const plan = useMemo(
    () => (draft.size
      ? base.map((r) => (draft.has(r.oid) ? { ...r, spans: draft.get(r.oid)! } : r))
      : base),
    [base, draft],
  );

  const now = useMemo(() => {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }, []);
  const cov = useMemo(() => coverageOf(plan), [plan]);

  /**
   * Мөр шүүлтүүрт нийцэж байна уу. Бүлгийн мөрд ЗӨВХӨН түвшний шүүлт
   * үйлчилнэ — бусад нь бүлгийн ӨӨРИЙН биш, хүүхдүүдийнх нь шинж.
   */
  const match = useCallback((r: PlanRow) => {
    if (fLv === 'group' && !r.group) return false;
    if (fLv === 'task' && r.group) return false;
    if (r.group) return true;
    const filled = r.spans.filter(Boolean).length;
    if (filter === 'has' && !filled) return false;
    if (filter === 'none' && filled) return false;
    if (filter === 'partial' && (!filled || filled === r.spans.length)) return false;
    const sp = rowSpan(r);
    if (fDur !== 'all') {
      if (!sp) return false;
      const d = spanDays(sp);
      if (fDur === 'w' && d > 7) return false;
      if (fDur === 'm' && (d <= 7 || d > 30)) return false;
      if (fDur === 'q' && (d <= 30 || d > MAX_DAYS)) return false;
      if (fDur === 'long' && d <= MAX_DAYS) return false;
    }
    if (fYear !== 'all' && (!sp || msToDay(sp.start).slice(0, 4) !== fYear)) return false;
    return true;
  }, [filter, fLv, fDur, fYear]);

  /** Бүлгийн сонголт — модны дарааллаар, гүнээр нь догол мөртэй */
  const groups = useMemo(
    () => plan.filter((r) => r.group).map((r) => ({
      i: r.i,
      label: `${'  '.repeat(r.depth)}${r.no} ${r.work}`.trimEnd(),
    })),
    [plan],
  );

  /**
   * Сонгосон бүлгийн ДЭД МОД (бүлэг өөрөө + доторх бүх мөр).
   * ⚠️ Гүнээр таслана, дараагийн ижил гүнтэй мөр хүртэл — модны дараалал нь
   *    хавтгай массив тул эцэг/хүүхдийн холбоо зөвхөн ЭНЭ дүрмээр гарна.
   */
  const scoped = useMemo(() => {
    if (fGrp === 'all') return plan;
    const at = plan.findIndex((r) => r.i === fGrp);
    if (at < 0) return plan;
    const out = [plan[at]];
    for (let k = at + 1; k < plan.length; k++) {
      if (plan[k].depth <= plan[at].depth) break;
      out.push(plan[k]);
    }
    return out;
  }, [plan, fGrp]);

  /**
   * ХАРАГДАХ МӨРҮҮД — эвхэлт · шүүлт · хайлт. Зүүн мод ба баруун хуанли
   * ЯГ ЭНЭ жагсаалтаар эгнэнэ.
   *
   * ⚠️ ХАЙЛТ нь эвхэлтийг ҮЛ ХЭРЭГСЭНЭ: хайж байгаа хүн модны бүтцийг биш,
   *    ажлаа хайж байна. Эвхэгдсэн бүлгийн дотор нуугдвал «олдохгүй» гэж
   *    дүгнэнэ. Хайлтын үед бүлгийн мөрүүд ч ХАСАГДАНА — тэдгээр нь
   *    засагддаггүй тул үр дүнг л шуугиулна.
   */
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle) {
      return scoped.filter((r) => !r.group
        && (r.work.toLowerCase().includes(needle) || r.no.toLowerCase().includes(needle))
        && match(r));
    }
    const out: PlanRow[] = [];
    let hideBelow = -1;
    for (const r of scoped) {
      if (hideBelow >= 0 && r.depth > hideBelow) continue;
      hideBelow = -1;
      if (r.group && collapsed.has(r.oid)) hideBelow = r.depth;
      if (!match(r)) continue;
      out.push(r);
    }
    return out;
  }, [scoped, collapsed, match, q]);


  /** Хуваарьт тааралдсан ЖИЛҮҮД — сонголтыг өгөгдлөөс угсарна */
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const r of plan) {
      const sp = rowSpan(r);
      if (sp) s.add(msToDay(sp.start).slice(0, 4));
    }
    return [...s].sort();
  }, [plan]);

  /** Блок бүрд хуваарьтай АЖЛЫН тоо — сонголтын жагсаалтад харуулна */
  const blockFill = useMemo(() => {
    const c = new Array<number>(n).fill(0);
    for (const r of plan) {
      if (r.group) continue;
      r.spans.forEach((sp, b) => { if (sp) c[b] += 1; });
    }
    return c;
  }, [plan, n]);

  /* ── ХУАНЛИЙН ХҮРЭЭ — доод тал нь 365 хоног ── */
  const range = useMemo(() => {
    const all: number[] = [];
    for (const r of plan) for (const sp of r.spans) if (sp) { all.push(sp.start, sp.end); }
    const lo = all.length ? Math.min(...all, now) : now;
    const hi = all.length ? Math.max(...all) : now;
    /* Сарын эхнээс эхлүүлнэ — сарын багана тэгш харагдана */
    const d = new Date(lo);
    const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    /* ⚠️ Хамгийн багадаа 365 хоног, шаардлагатай бол дараагийн жил рүү */
    const to = Math.max(hi, from + 364 * DAY);
    return { from, to };
  }, [plan, now]);

  const { from, to } = range;
  const px = ZOOM[zoom];
  const total = Math.round((to - from) / DAY) + 1;
  const W = Math.round(total * px);
  const xOf = useCallback((ms: number) => Math.round(((ms - from) / DAY) * px), [from, px]);
  const dayAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const k = Math.floor((clientX - el.getBoundingClientRect().left) / px);
    return Math.min(total - 1, Math.max(0, k));
  };
  const msAt = (k: number) => from + k * DAY;

  /* ⚠️ Эхэнд ӨНӨӨДӨР рүү гүйлгэнэ — 365 хоногийн эхэнд тултал өнгөрсөн
     жилийн сарууд харагдаж, «хоосон хуанли» гэж уншигдана. */
  useEffect(() => {
    if (jumped.current || !scrollRef.current || !visible.length) return;
    jumped.current = true;
    scrollRef.current.scrollLeft = Math.max(0, xOf(now) - 120);
  }, [now, xOf, visible.length]);

  /* ── Ноорог ── */

  const setSpans = useCallback((oid: number, spans: (Span | null)[]) => {
    setDraft((d) => {
      const m = new Map(d);
      m.set(oid, spans);
      return m;
    });
  }, []);
  /** Олон ажлыг НЭГ үйлдлээр — бүлгийн мужид хуваарилахад */
  const setMany = useCallback((list: { oid: number; spans: (Span | null)[] }[]) => {
    setDraft((d) => {
      const m = new Map(d);
      for (const x of list) m.set(x.oid, x.spans);
      return m;
    });
  }, []);

  /* ── Чирэлт ── */

  /**
   * Мужийг мөрд бичнэ. Дээд бүлэгт муж байвал хүүхдийг ТҮҮН РҮҮ ХАВЧУУЛНА —
   * «бүлгийн цонхны дотор» гэсэн дүрмийг чирэлтийн үедээ шууд сахина.
   */
  const commit = useCallback((oid: number, span: Span | null) => {
    const at = plan.findIndex((x) => x.oid === oid);
    if (at < 0) return;
    const r = plan[at];
    let sp = span;
    /* Хамгийн ойрын ДЭЭД бүлгийн муж */
    let par: Span | null = null;
    for (let k = at - 1; k >= 0; k--) {
      if (plan[k].depth < r.depth && plan[k].group) { par = plan[k].spans[blk]; break; }
    }
    if (sp && par) {
      const st = Math.max(sp.start, par.start);
      const en = Math.min(sp.end, par.end);
      sp = st <= en ? { start: st, end: en } : { start: par.start, end: par.start };
    }
    const next = r.spans.slice();
    next[blk] = sp;
    setSpans(oid, next);
  }, [plan, blk, setSpans]);

  /**
   * ⚠️ ДАРАХАД ШУУД БИЧИХГҮЙ. Урьд нь `pointerdown` дээр 1 хоногийн муж
   * бичдэг байсан тул хуваарьтай мөрийн ХООСОН хэсэгт санамсаргүй товшиход
   * 137 хоногийн хуваарь чимээгүй устаж, 1 хоног болдог байв. Одоо:
   *   · зөвхөн ТОВШИХ  → мөрийг сонгоно, хуваарь ХӨДЛӨХГҮЙ,
   *   · ЧИРЭХ         → эхний хөдөлгөөнөөс эхлэн муж татагдана,
   *   · хуваарьГҮЙ мөрд товшвол 1 хоногийн муж үүснэ (`onUp`).
   */
  const onDown = (e: PEvt<HTMLElement>, r: PlanRow, mode: DragMode) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const k = dayAt(e.clientX);
    lastDay.current = k;
    moved.current = false;
    setDrag({ oid: r.oid, mode, anchor: k, orig: r.spans[blk] });
    setSel(r.i);
  };

  const onMove = (e: PEvt<HTMLElement>) => {
    if (!drag) return;
    const k = dayAt(e.clientX);
    if (k === lastDay.current && moved.current) return;
    lastDay.current = k;
    moved.current = true;
    const o = drag.orig;
    if (drag.mode === 'new') {
      const a = Math.min(drag.anchor, k);
      const b = Math.max(drag.anchor, k);
      commit(drag.oid, { start: msAt(a), end: msAt(b) });
    } else if (o) {
      const d = (k - drag.anchor) * DAY;
      if (drag.mode === 'move') commit(drag.oid, { start: o.start + d, end: o.end + d });
      else if (drag.mode === 'l') commit(drag.oid, { start: Math.min(o.start + d, o.end), end: o.end });
      else commit(drag.oid, { start: o.start, end: Math.max(o.end + d, o.start) });
    }
  };

  const onUp = () => {
    /* Хөдөлгөөнгүй товшилт: хоосон мөрд 1 хоногийн муж, эсрэг тохиолдолд
       зөвхөн сонголт (дээрх тайлбар). */
    if (drag && !moved.current && drag.mode === 'new' && !drag.orig) {
      commit(drag.oid, { start: msAt(drag.anchor), end: msAt(drag.anchor) });
    }
    setDrag(null);
    moved.current = false;
  };

  /**
   * ИДЭВХТЭЙ БЛОКИЙН хуваарийг БУСАД блокт хэмнэлтэйгээр хуулна.
   * ⚠️ Блок бүрийг гараар чирэх нь 22 дахин их ажил. Барилгын давтагдах
   *    блокт хуваарь нь ижил, зөвхөн ЭХЛЭХ нь алхмаар хойшилдог (takt).
   */
  const spreadBlocks = () => {
    /**
     * ⚠️ ХАМГИЙН СҮЙТГЭГЧ ҮЙЛДЭЛ. Харагдаж буй мөр бүрийн БҮХ блокийн
     * хуваарийг дарж бичнэ — 12 ажил × 22 блок = 264 нүд нэг товшилтоор.
     * Бусад блокт гараар оруулсан хуваарь байвал бүгд алга болно.
     */
    const touch = visible.filter((r) => r.spans[blk]);
    if (!touch.length || !sc) return;
    if (!window.confirm(tr(
      '{0} мөрийн БҮХ {1} блокийн хуваарь «{2}» блокоос хуулагдана. Тэнд байсан хуваарь дарагдана. Үргэлжлүүлэх үү?',
      num(touch.length), num(n), sc.bld[blk],
    ))) return;
    const list: { oid: number; spans: (Span | null)[] }[] = [];
    for (const r of touch) {
      const b0 = r.spans[blk] as Span;
      const days = spanDays(b0);
      const next = r.spans.slice();
      for (let b = 0; b < n; b++) {
        const shift = (b - blk) * takt * DAY;
        next[b] = { start: b0.start + shift, end: endOf(b0.start + shift, days) };
      }
      list.push({ oid: r.oid, spans: next });
    }
    if (list.length) setMany(list);
  };

  /*
   * ⚠️ «Мужид жигд хуваарилах» ба «Хуваарь арилгах» товчнууд 2026-09-01-нд
   * ХАСАГДСАН (хэрэглэгчийн шийдвэр). Хоёулаа СОНГОСОН мөр дээр ажилладаг
   * байсан тул «аль мөр сонгогдсон бэ» гэдгийг санах шаардлагатай далд төлөв
   * үүсгэдэг байв. Арилгах нь одоо popup цонхонд («Арилгах») — тэнд ямар ажил,
   * ямар блокийг арилгаж байгаа нь ил харагдана.
   */

  /* ── Хадгалах ── */

  const save = useCallback(async () => {
    if (!sc || !draft.size || busy) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const byOid = new Map(rows.map((r) => [r.oid, r]));
      const upd: Record<string, unknown>[] = [];
      for (const [oid, spans] of draft) {
        const orig = byOid.get(oid);
        if (!orig) continue;
        const a: Record<string, unknown> = { [sc.f.oid]: oid };
        let changed = 0;
        spans.forEach((s, b) => {
          /* ⚠️ Талбар байхгүй блок бий (эх хуудасны толгой эвдэрсэн) — тэнд
             бичих газаргүй тул АЛГАСНА, унахгүй. */
          if (!sc.start[b] && !sc.end[b]) return;
          const ns = s ? s.start : null;
          const ne = s ? s.end : null;
          /**
           * ⚠️ ЗӨВХӨН ӨӨРЧЛӨГДСӨН БЛОКИЙГ бичнэ.
           *
           * Урьд нь ноорогтой мөрийн БҮХ блокийг бичдэг байв. `toPlanRows`-д
           * муж нь эхлэх БА дуусах хоёулаа байж л үүсдэг тул ЗӨВХӨН эхлэх
           * огноотой (эсвэл зөвхөн дуусахтай) хагас бөглөсөн блок нь `null`
           * муж болж, хадгалахад тэр огноо ЧИМЭЭГҮЙ УСТДАГ байлаа — өөр
           * блокт нэг зурвас чирсний төлөө.
           */
          if (ns === orig.start[b] && ne === orig.end[b]) return;
          if (sc.start[b]) a[sc.start[b]] = ns;
          if (sc.end[b]) a[sc.end[b]] = ne;
          changed += 1;
        });
        if (changed) upd.push(a);
      }
      if (!upd.length) {
        setDraft(new Map());
        setNote(tr('Өөрчлөлт олдсонгүй — хуваарь хэвээрээ.'));
        return;
      }
      /*
       * ⚠️ АГШИН СОЛИГДСОН ЭСЭХ (2026-08-29). «Гүйцэтгэл бөглөх» нийтлэх бүрд
       * хуудсыг БҮТНЭЭР шинэ хуулбар болгож нэмдэг тул энд ачаалсан OBJECTID-ууд
       * ХУУЧИН хуулбарынх болж болно. Тэр OID руу бичвэл огноо нь хаягдсан
       * хуулбарт чимээгүй үлдэж, дараагийн нийтлэлд ч алга болно — төлөвлөлтийн
       * бүхэл сесс алдагдана. Тиймээс хадгалахын өмнө СҮҮЛИЙН агшныг дахин
       * татаж, мөр бүрийг (№ + ажлын нэр)-ээр шинэ OID руу зөөнө.
       */
      const fresh = await loadRows(pkg, sc);
      let remapped = 0;
      let lost = 0;
      if (fresh.rows[0]?.oid !== rows[0]?.oid) {
        const key = (r: SheetRow) => `${r.no}¦${r.work}`;
        const freshBy = new Map<string, number[]>();
        fresh.rows.forEach((r, i) => {
          const k = key(r);
          if (!freshBy.has(k)) freshBy.set(k, []);
          freshBy.get(k)!.push(i);
        });
        const moved2: Record<string, unknown>[] = [];
        for (const a of upd) {
          const oldOid = a[sc.f.oid] as number;
          const orig = byOid.get(oldOid);
          const cands = orig ? freshBy.get(key(orig)) : undefined;
          if (!orig || !cands?.length) { lost += 1; continue; }
          const oldIdx = rows.findIndex((r) => r.oid === oldOid);
          let best = cands[0];
          for (const ci of cands) if (Math.abs(ci - oldIdx) < Math.abs(best - oldIdx)) best = ci;
          moved2.push({ ...a, [sc.f.oid]: fresh.rows[best].oid });
          remapped += 1;
        }
        upd.length = 0;
        upd.push(...moved2);
      }
      if (upd.length) await applyUpdates(pkg, upd);
      const r = await loadRows(pkg, sc);
      setRows(r.rows);
      setDraft(new Map());
      setNote(remapped
        ? tr('{0} ажлын хуваарь хадгалагдлаа — хуудас хооронд нь шинэчлэгдсэн тул шинэ агшинд зөөв', num(upd.length))
        : tr('{0} ажлын хуваарь хадгалагдлаа', num(upd.length)));
      if (lost) setErr(tr('{0} мөр шинэ агшинд олдсонгүй — тэдгээрийн хуваарь хадгалагдсангүй.', num(lost)));
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [sc, draft, busy, pkg, rows]);

  /**
   * ⚠️ ХАДГАЛААГҮЙ НООРОГ нь зөвхөн санах ойд байна. Таб хаах, дахин ачаалах,
   * багц солих гурвуулаа түүнийг чимээгүй устгана.
   */
  useEffect(() => {
    if (!draft.size) return undefined;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft.size]);

  const askSwitch = useCallback(
    () => draft.size === 0
      || window.confirm(tr('Хадгалаагүй {0} өөрчлөлт байна. Хаяад солих уу?', num(draft.size))),
    [draft.size],
  );

  const floors = pkgFloors(pkg.group);

  /* ── Хуанлийн шошго ── */
  const ticks: { at: number; lab: string; big: boolean }[] = [];
  const months: { at: number; lab: string }[] = [];
  for (let k = 0; k < total; k++) {
    const ms = from + k * DAY;
    const d = new Date(ms);
    const isFirst = d.getUTCDate() === 1;
    if (isFirst) months.push({ at: ms, lab: msToDay(ms).slice(0, 7) });
    /* ⚠️ Ганц тоо («21», «28») нь ямар сарынх нь тодорхойгүй. Сарын нэр
       ДЭЭД мөрөнд тусдаа, хоногийн шошго нь «сар-өдөр» хэлбэрээр доор. */
    if (zoom === 'day') ticks.push({ at: ms, lab: String(d.getUTCDate()), big: isFirst });
    else if (zoom === 'week') {
      if (d.getUTCDay() === 1 || isFirst) ticks.push({ at: ms, lab: msToDay(ms).slice(5), big: isFirst });
    } else if (d.getUTCDay() === 1 || isFirst) ticks.push({ at: ms, lab: '', big: isFirst });
  }
  /**
   * ⚠️ ОЙРХОН ШОШГЫГ ХООСЛОНО. Сарын 1 ба долоо хоногийн эхлэл 1–2 хоногийн
   * зайд таарвал «08-31» ба «09-01» хоёр бие бие рүүгээ орж, аль аль нь
   * уншигдахгүй болно (зурвас нарийсах тусам байнга тохиолдоно). Зураас нь
   * үлдэнэ — зөвхөн ТЕКСТИЙГ нь авна.
   */
  {
    const MIN = 40;
    let lastLab = -Infinity;
    for (const tk of ticks) {
      const x = ((tk.at - from) / DAY) * px;
      if (!tk.lab) continue;
      if (x - lastLab < MIN && !tk.big) tk.lab = '';
      else lastLab = x;
    }
  }

  const modalRow = modal == null ? null : plan.find((r) => r.i === modal) ?? null;
  /**
   * Popup-д зориулсан ЭЦЭГ БҮЛЭГ — хамгийн ойрын ДЭЭД бүлгийн мөр.
   *
   * ⚠️ Чирэлт нь `commit`-доо мужийг эцэгт нь ХАВЧУУЛДАГ байсан ч popup нь
   *    ШУУД бичдэг байв (2026-09-01-нд хэрэглэгч мэдэгдсэн: «том бүлэгт
   *    тавьсан хугацаанаас хамаарахгүй байна»). Нэг ажлыг хоёр өөр замаар
   *    оруулахад ӨӨР ӨӨР дүрэм үйлчлэх нь эвдрэл — одоо хоёулаа ижил.
   */
  const modalPar = useMemo(() => {
    if (!modalRow) return null;
    const at = plan.findIndex((x) => x.i === modalRow.i);
    for (let k = at - 1; k >= 0; k--) {
      if (plan[k].depth < modalRow.depth && plan[k].group) return plan[k];
    }
    return null;
  }, [plan, modalRow]);

  return (
    <div className={h.frame}>
      <header className={h.head}>
        <label className={h.field}>
          {tr('Багц')}{' '}
          <select className={h.select} value={pkg.group} disabled={busy}
            onChange={(e) => { if (askSwitch()) setPkg(pkgFloors(e.target.value)[0]); }}>
            {groupOpts.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        {floors.length > 1 && (
          <label className={h.field}>
            {tr('Хувилбар')}{' '}
            <select className={h.select} value={pkg.key} disabled={busy}
              onChange={(e) => {
                if (askSwitch()) setPkg(PKGS.find((x) => x.key === e.target.value) ?? pkg);
              }}>
              {floors.map((p) => <option key={p.key} value={p.key}>{p.floors}F</option>)}
            </select>
          </label>
        )}
        <span className={h.spacer} />
        <Coverage cov={cov} n={n} />
        {canEdit && draft.size > 0 && (
          /* ⚠️ БУЦААХ ЗАМ. Хуанли дээр чирэх нь маш хурдан үйлдэл тул санамсаргүй
             өөрчлөлт гарна — хадгалахаас өмнө бүгдийг нэг товчоор цуцлах
             боломжгүй бол хэрэглэгч хуудсаа дахин ачаалахаас өөр аргагүй. */
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Хадгалаагүй бүх өөрчлөлтийг хаяна')}
            onClick={() => { setDraft(new Map()); setNote(''); }}>
            {tr('Цуцлах')} ({num(draft.size)})
          </button>
        )}
        {canEdit && (
          <button type="button" className={h.save} disabled={busy || draft.size === 0} onClick={save}>
            {tr('Хадгалах')}{draft.size ? ` (${draft.size})` : ''}
          </button>
        )}
      </header>

      {err && <p className={h.err}>{err}</p>}
      {note && <p className={h.note} onClick={() => setNote('')}>{note}</p>}
      {!canEdit && (
        <p className={h.note}>
          {tr('Танд хуваарь засах эрх алга — зөвхөн харна. Эрхийг админ «Хуваарь төлөвлөх» гэж тусад нь олгоно.')}
        </p>
      )}

      {busy && !rows.length ? (
        <Loading label={tr('Хуваарь ачаалж байна…')} />
      ) : !sc || !rows.length ? (
        <Empty label={tr('Энэ багцад мөр олдсонгүй.')} />
      ) : (
        <Section
          fill
          title={tr('Ажлын хуваарь')}
          note={(
            <span className={h.flowNote}>
              {msToDay(from)} → {msToDay(to)} · {num(total)} {tr('хоног')}
              {draft.size ? <> · <b className={h.dirtyTag}>{tr('хадгалаагүй')} {num(draft.size)}</b></> : null}
            </span>
          )}
        >
          {/* ── ШҮҮЛТ ── */}
          <div className={h.tabs}>
            {/* ХАЙЛТ — 1,266 мөрөөс гүйлгэж олох нь өөрөө саад */}
            <input
              className={h.search}
              placeholder={tr('Ажлын нэрээр хайх…')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {([
              ['all', tr('Бүгд'), plan.filter((r) => !r.group).length],
              ['has', tr('Хуваарьтай'), cov.planned],
              ['none', tr('Хуваарьгүй'), cov.tasks - cov.planned],
              ['partial', tr('Дутуу'), plan.filter((r) => {
                if (r.group) return false;
                const f = r.spans.filter(Boolean).length;
                return f > 0 && f < r.spans.length;
              }).length],
            ] as const).map(([k, label, cnt]) => (
              <button key={k} type="button"
                className={`${h.tab} ${filter === k ? h.tabOn : ''}`}
                onClick={() => setFilter(k)}>
                {label} <b>{num(cnt)}</b>
              </button>
            ))}

            {/* ⚠️ Сонголтууд ХОСЛОНО — «хоцорсон · урт · 2026» гэж давхарлаж
                шүүнэ. Тиймээс таб биш, тус тусдаа талбар. */}
            {/* ⚠️ БҮЛГЭЭР ШҮҮХ нь бусад шүүлтээс ӨМНӨ ажиллана: эхлээд модны
                салбарыг таслаад, дараа нь түүн дотор төлөв/хугацаа/жилээр
                нарийсгана. Тиймээс жагсаалтын эхэнд, өргөн талбартай. */}
            <select className={`${h.sel} ${h.selWide}`} value={String(fGrp)} aria-label={tr('Бүлэг')}
              onChange={(e) => setFGrp(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              <option value="all">{tr('Бүлэг: бүгд')}</option>
              {groups.map((g) => <option key={g.i} value={g.i}>{g.label}</option>)}
            </select>

            <select className={h.sel} value={fLv} aria-label={tr('Түвшин')}
              onChange={(e) => setFLv(e.target.value as typeof fLv)}>
              <option value="all">{tr('Түвшин: бүгд')}</option>
              <option value="group">{tr('Зөвхөн бүлэг')}</option>
              <option value="task">{tr('Зөвхөн ажил')}</option>
            </select>

            <select className={h.sel} value={fDur} aria-label={tr('Хугацаа')}
              onChange={(e) => setFDur(e.target.value as typeof fDur)}>
              <option value="all">{tr('Хугацаа: бүгд')}</option>
              <option value="w">{tr('≤ 7 хоног')}</option>
              <option value="m">{tr('8–30 хоног')}</option>
              <option value="q">{tr('31–{0} хоног', num(MAX_DAYS))}</option>
              <option value="long">{tr('{0} хоногоос урт', num(MAX_DAYS))}</option>
            </select>

            <select className={h.sel} value={fYear} aria-label={tr('Эхлэх жил')}
              onChange={(e) => setFYear(e.target.value)}>
              <option value="all">{tr('Жил: бүгд')}</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>

            {(filter !== 'all' || fLv !== 'all' || fDur !== 'all' || fYear !== 'all' || fGrp !== 'all') && (
              <button type="button" className={h.tab}
                onClick={() => {
                  setFilter('all'); setFLv('all');
                  setFDur('all'); setFYear('all'); setFGrp('all');
                }}>
                {tr('Цэвэрлэх')}
              </button>
            )}
          </div>

          {/* ── ХУАНЛИЙН ХЭРЭГСЭЛ ── */}
          <div className={h.plTop}>
            <label className={h.plField}>
              {tr('Блок')}{' '}
              {/* ⚠️ Блокийн нэрний хажууд ХУВААРЬТАЙ мөрийн тоо. Үүнгүй бол аль
                  блок дээр ажил хийгдсэн, аль нь хоосныг мэдэхийн тулд 22 блокийг
                  нэг бүрчлэн сонгож үзэхээс өөр арга байхгүй. */}
              <select className={h.select} value={blk} onChange={(e) => setBlk(Number(e.target.value))}>
                {sc.bld.map((b, k) => (
                  <option key={b} value={k}>{b} · {num(blockFill[k])}</option>
                ))}
              </select>
            </label>

            <div className={h.tlZoom}>
              {(['day', 'week', 'month'] as Zoom[]).map((z) => (
                <button key={z} type="button"
                  className={`${h.tlZoomB} ${zoom === z ? h.tlZoomOn : ''}`}
                  onClick={() => setZoom(z)}>
                  {z === 'day' ? tr('хоног') : z === 'week' ? tr('7 хоног') : tr('сар')}
                </button>
              ))}
            </div>

            <button type="button" className={h.tlZoomB}
              onClick={() => { if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, xOf(now) - 120); }}>
              {tr('Өнөөдөр')}
            </button>

            {canEdit && (
              <>
                <label className={h.plField}>
                  {tr('Алхам')}{' '}
                  {/* ⚠️ 365-аар хязгаарлана: санамсаргүй нэмэлт тэг нь зурвасуудыг
                      хуанлиас хол гаргаж, буцааж олох аргагүй болгоно. */}
                  <input type="number" min={0} max={365} className={h.numIn} value={takt}
                    onChange={(e) => setTakt(Math.min(365, Math.max(0, Number(e.target.value) || 0)))} />
                </label>
                <button type="button" className={h.spreadBtn}
                  title={tr('Харагдаж буй мөрүүдийн идэвхтэй блокийн хуваарийг бусад блокт алхмаар хуулна')}
                  onClick={spreadBlocks}>
                  {tr('Бүх блокт алхмаар тараах')}
                </button>
              </>
            )}
          </div>

          {canEdit && (
            <p className={h.plHint}>
              {tr('Ажлын нэр дээр дарж хуанлиар оруулна · мөрийн ард чирж муж татна · зурвасын голоос чирж зөөнө · ирмэгээс татаж уртасгана')}
            </p>
          )}

          {/* ── НЭГ БҮТЭН ХҮСНЭГТ: зүүн мод + баруун хуанли ── */}
          {visible.length === 0 ? (
            <Empty label={q ? tr('«{0}» гэсэн ажил олдсонгүй.', q) : tr('Мөр алга.')} />
          ) : (
            <div className={h.gWrap} ref={scrollRef}>
              <div className={h.gSide}>
                <div className={h.gSideHead} style={{ height: PL_ROW }}>
                  <span className={h.gHeadWork}>{tr('Ажил')}</span>
                  <span className={h.gHeadPlan}>{tr('Хуваарь')}</span>
                  <span className={h.gHeadBlk}>{tr('блок')}</span>
                </div>
                {visible.map((r) => (
                  <TaskRow
                    key={r.oid}
                    r={r} n={n} blk={blk}
                    on={sel === r.i}
                    dirty={draft.has(r.oid)}
                    collapsed={collapsed.has(r.oid)}
                    onToggle={() => setCollapsed((s) => {
                      const m = new Set(s);
                      if (m.has(r.oid)) m.delete(r.oid); else m.add(r.oid);
                      return m;
                    })}
                    onPick={() => { setSel(r.i); setModal(r.i); }}
                  />
                ))}
              </div>

              <div className={h.gRight}>
                <div className={h.gTrack} style={{ width: W }} ref={trackRef}>
                  <div className={h.plHead}>
                    {months.map((m) => (
                      <span key={m.at} className={h.plMonth} style={{ left: xOf(m.at) }}>{m.lab}</span>
                    ))}
                    {ticks.map((tk) => (
                      <span key={tk.at} className={`${h.plDay} ${tk.big ? h.plDayBig : ''}`}
                        style={{ left: xOf(tk.at) }}>
                        {tk.lab}
                      </span>
                    ))}
                  </div>

                  <div className={h.plLanes}
                    style={{ height: visible.length * PL_ROW }}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                  >
                    {months.map((m) => (
                      <span key={m.at} className={`${h.tlGrid} ${h.tlGridBig}`} style={{ left: xOf(m.at) }} />
                    ))}
                    {zoom !== 'month' && ticks.filter((t2) => !t2.big).map((tk) => (
                      <span key={tk.at} className={h.tlGrid} style={{ left: xOf(tk.at) }} />
                    ))}
                    {now >= from && now <= to && (
                      <span className={h.tlNow} style={{ left: xOf(now) }} title={msToDay(now)} />
                    )}

                    {visible.map((r, k) => {
                      const sp = r.spans[blk];
                      const st = sp ? statusOf(sp, r.act?.[blk], now) : 'none';
                      return (
                        <div key={r.oid}
                          className={`${h.plLane} ${k % 2 ? h.plLaneAlt : ''} ${sel === r.i ? h.plLaneOn : ''}`}
                          style={{ top: k * PL_ROW, height: PL_ROW }}
                          onPointerDown={(e) => onDown(e, r, 'new')}
                        >
                          {sp && (
                            <div
                              className={`${h.plBar} ${r.group ? h.plBarG : ST_CLASS[st]} ${sel === r.i ? h.tlBarOn : ''}`}
                              style={{ left: xOf(sp.start), width: Math.max(10, spanDays(sp) * px - 1) }}
                              onPointerDown={(e) => onDown(e, r, 'move')}
                              aria-label={`${r.work || r.no} · ${sc.bld[blk]} · ${msToDay(sp.start)} → ${msToDay(sp.end)}`}
                              title={`${r.work}\n${sc.bld[blk]} · ${msToDay(sp.start)} → ${msToDay(sp.end)} (${tr('{0} хоног', spanDays(sp))}) · ${ST_TEXT[st]}`}
                            >
                              <span className={h.plGrip} onPointerDown={(e) => onDown(e, r, 'l')} />
                              {/* ⚠️ БҮТЭН ОГНОО (2026-09-01, хэрэглэгч): урьд нь «09-12→11-13»
                                  гэж жилгүй байв. Хуанли 2025–2028 оныг дамждаг тул жилгүй
                                  огноо аль жилийнх нь нь тодорхойгүй байсан. Гурван шат:
                                  бүтэн огноо → зөвхөн он-сар → зөвхөн хоног → юу ч үгүй. */}
                              {spanDays(sp) * px > 178 ? (
                                <span className={h.plBarLab}>
                                  {msToDay(sp.start)}→{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}
                                </span>
                              ) : spanDays(sp) * px > 118 ? (
                                <span className={h.plBarLab}>
                                  {short(sp.start)}→{short(sp.end)} · {spanDays(sp)}{tr('х')}
                                </span>
                              ) : spanDays(sp) * px > 40 ? (
                                <span className={h.plBarLab}>{spanDays(sp)}{tr('х')}</span>
                              ) : null}
                              <span className={`${h.plGrip} ${h.plGripR}`}
                                onPointerDown={(e) => onDown(e, r, 'r')} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      {modalRow && sc && (
        <PlanModal
          r={modalRow}
          par={modalPar}
          blocks={sc.bld}
          blk={blk}
          takt={takt}
          canEdit={canEdit}
          onBlk={setBlk}
          onClose={() => setModal(null)}
          onSet={(spans) => setSpans(modalRow.oid, spans)}
        />
      )}
    </div>
  );
}

/* ══════════════════ Хамралт ══════════════════ */

function Coverage({ cov, n }: { cov: ReturnType<typeof coverageOf>; n: number }) {
  const pctTasks = cov.tasks ? (cov.planned / cov.tasks) * 100 : 0;
  /**
   * ⚠️ ХОЁР ХУВЬ ЯЛГААТАЙ: «ажлын хамралт» нь ядаж нэг блокт төлөвлөгдсөн
   * ажил, «нүдний хамралт» нь ажил × блок бүрэн бөглөгдсөн эсэх. Эхнийх нь
   * үргэлж өндөр — хоёуланг үзүүлэхгүй бол бодит байдал далдлагдана.
   */
  const pctCells = cov.cells ? (cov.filled / cov.cells) * 100 : 0;
  const tone = pctTasks >= 80 ? 'var(--good-ink)' : pctTasks >= 40 ? 'var(--warn)' : 'var(--bad-ink)';
  return (
    <div className={h.cov}>
      <span className={h.covLabel}>{tr('Хуваарийн хамралт')}</span>
      <b className="num" style={{ color: tone }}>{pctTasks.toFixed(0)}%</b>
      <span className={h.covSub}>
        {num(cov.planned)}/{num(cov.tasks)} {tr('ажил')} · {pctCells.toFixed(0)}% {tr('нүд')}
        {cov.planned > 0 && <> · {num(cov.patterns)} {tr('өөр хуваарь')}</>}
      </span>
      <span className={h.covSub}>{num(n)} {tr('блок')}</span>
    </div>
  );
}

/* ══════════════════ Ажлын мөр (зүүн багана) ══════════════════ */

function TaskRow({
  r, n, blk, on, dirty, collapsed, onToggle, onPick,
}: {
  r: PlanRow; n: number; blk: number; on: boolean; dirty: boolean;
  collapsed: boolean;
  onToggle: () => void; onPick: () => void;
}) {
  /**
   * ⚠️ 2026-09-01: урьд нь энд «хугацаа жигд бус» / «193x +0» гэсэн ХЭМНЭЛИЙН
   *    тайлбар гардаг байв. Хэрэглэгчид тэр нь юу ч хэлэхгүй байсан — «энэ
   *    ажил хэзээ эхэлж, хэзээ дуусах вэ, нийт хэдэн хоног вэ» гэдэг л
   *    хэрэгтэй.
   */
  /**
   * ⚠️ ИДЭВХТЭЙ БЛОКИЙН муж, БҮХ блокийнх БИШ (2026-09-01). Урьд нь энд
   *    бүх блокийн нийлбэр муж (эрт эхлэх → сүүл дуусах) гардаг байсан тул
   *    ХАЖУУДАА байгаа зурвастайгаа зөрдөг байв: бүлгийн мөр «488х» гэж
   *    бичээд, зэргэлдээ зурвас нь «87х» гэж харуулна. Нэг мөрөнд хоёр өөр
   *    тоо байх нь эвдрэл — хоёулаа сонгосон блокийг заана. Бусад блокийн
   *    талаар хажуугийн «12/12» багана хэлнэ.
   */
  const span = r.spans[blk] ?? null;
  const filled = r.spans.filter(Boolean).length;

  return (
    <div
      className={`${h.row} ${on ? h.rowOn : ''} ${r.group ? h.rowGroup : ''} ${dirty ? h.rowDirty : ''}`}
      style={{ height: PL_ROW, paddingLeft: `${r.depth * 12 + 8}px` }}
    >
      {r.group ? (
        <button type="button" className={h.caret} onClick={onToggle}
          aria-label={collapsed ? tr('Дэлгэх') : tr('Эвхэх')}>
          {collapsed ? '▸' : '▾'}
        </button>
      ) : <span className={h.caretGap} />}

      {/* ⚠️ Нэр дээр дарахад POPUP ХУАНЛИ нээгдэнэ — огноог тоогоор нарийн
          оруулах ХОЁР ДАХЬ зам (чирэлт нь түргэн, харьцангуй зам). */}
      <button type="button" className={h.rowMain} onClick={onPick}
        title={`${r.work}\n${tr('Хуанлиар оруулах')}`}>
        <span className={h.rowNo}>{r.no}</span>
        <span className={h.rowWork}>{r.work}</span>
      </button>

      {/* ⚠️ ЗӨВХӨН ХОНОГ (2026-09-01, хэрэглэгч). Огноог ч энд бичдэг байсан
          боловч зурвас нь хажуудаа хуанлин дээр яг тэр огноон дээрээ зурагдаж
          байгаа тул давхардал болно — жагсаалтад «хэр удаан үргэлжлэх вэ»
          гэдэг л шинэ мэдээлэл. Огноог зурвасны tooltip ба popup-д харна. */}
      <span className={h.rowPlan} title={span ? `${msToDay(span.start)} → ${msToDay(span.end)}` : undefined}>
        {span == null ? (
          <span className={h.rowNone}>{tr('хуваарьгүй')}</span>
        ) : (
          <b className="num">{num(spanDays(span))}{tr('х')}</b>
        )}
      </span>

      <span className={`${h.rowBlocks} num`}>{filled}/{n}</span>
    </div>
  );
}

/* ══════════════════ POPUP ХУАНЛИ ══════════════════ */

/**
 * Ажлын нэр дээр дарахад нээгдэх ЦОНХ — огноог ТООГООР оруулна.
 *
 * ⚠️ ЯАГААД ЧИРЭЛТЭЭС ГАДНА (2026-09-01, хэрэглэгчийн заавар): чирэлт нь
 * харьцангуй бөгөөд «сар» томруулалт дээр 1 пиксель = 1 хоног тул «яг
 * 2026-05-04» гэж тавихад тохиромжгүй. Гэрээнд заасан огноог оруулах, эсвэл
 * блок бүрд нэг дор тараахад энэ цонх хэрэгтэй.
 *
 * ⚠️ ХОНОГ нь эхлэх/дуусахаас БОДОГДОНО (хоёр захыг оруулаад). Гурав дахь
 * талбар болгож оруулбал гурвуулаа зөрчилдөх боломжтой болно.
 */
function PlanModal({
  r, par, blocks, blk, takt, canEdit, onBlk, onClose, onSet,
}: {
  r: PlanRow;
  /** Хамгийн ойрын дээд БҮЛЭГ — түүний муж нь хатуу хязгаар */
  par: PlanRow | null;
  blocks: string[];
  blk: number;
  takt: number;
  canEdit: boolean;
  onBlk: (b: number) => void;
  onClose: () => void;
  onSet: (spans: (Span | null)[]) => void;
}) {
  const [a, setA] = useState('');
  const [z, setZ] = useState('');
  const [all, setAll] = useState(false);

  /**
   * Блок эсвэл мөр солигдвол талбарууд дагаж шинэчлэгдэнэ.
   *
   * ⚠️ ХУВААРЬГҮЙ АЖИЛД БҮЛГИЙН МУЖИЙГ УРЬДЧИЛЖ ТАВИНА (2026-09-01,
   *    хэрэглэгч: «том бүлгийнх нь он сарыг шууд авна, тэгээд түүн дээрээ
   *    өөрчилнө»). Хоосон талбараас эхлэх нь утгагүй ажил: бүлгийн муж
   *    аль хэдийн мэдэгдэж байгаа бөгөөд хүүхэд нь ямар ч тохиолдолд
   *    түүний дотор багтана. Одоо байгаа хуваарийг ХӨНДӨХГҮЙ — тэр нь
   *    бодит өгөгдөл, түүнийг «Бүлгийн мужаар» товчоор л дарж солино.
   */
  useEffect(() => {
    const own = r.spans[blk] ?? null;
    const p = par?.spans[blk] ?? null;
    /**
     * ⚠️ ХУУЧИРСАН ХУВААРИЙГ БАРЬЖ АВАХГҮЙ. Бүлгийн мужийг шинээр тавьсан
     *    үед хүүхдийн ХУУЧИН огноо тэр мужаас бүтнээ гадуур үлдэж болно
     *    (жиш. бүлэг 2026-09, хүүхэд 2025-08). Тэр хуучин утгыг талбарт
     *    буулгавал хэрэглэгч огт өөр жилийн огноо хараад эргэлзэнэ —
     *    хадгалахад ямар ч байсан мужид нь хавчуулагдана. Тиймээс мужаас
     *    ГАДУУР бол бүлгийн мужаар эхэлнэ.
     */
    const stale = !!(own && p && (own.end < p.start || own.start > p.end));
    const s = !own || stale ? p : own;
    setA(s ? msToDay(s.start) : '');
    setZ(s ? msToDay(s.end) : '');
  }, [r, par, blk]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const ms1 = dayToMs(a);
  const ms2 = dayToMs(z);
  const bad = ms1 != null && ms2 != null && ms1 > ms2;
  const days = ms1 != null && ms2 != null && !bad ? spanDays({ start: ms1, end: ms2 }) : null;

  /** ЭНЭ блокийн эцгийн муж — огнооны талбарын хатуу хязгаар */
  const pspan = par?.spans[blk] ?? null;
  /** Хязгаараас хальсан эсэх — товч дарахаас ӨМНӨ анхааруулна */
  const over = !!(pspan && ms1 != null && ms2 != null && !bad
    && (ms1 < pspan.start || ms2 > pspan.end));

  /**
   * Мужийг эцгийн цонхонд ХАВЧУУЛНА — `commit` (чирэлт)-тэй ЯГ ИЖИЛ дүрэм.
   * ⚠️ Хоёр зам ижил дүрэмтэй байх ёстой: popup-аар бүлгийн мужаас гадуур
   *    огноо тавиад дараа нь зурвасаа бага зэрэг чирэхэд огноо гэнэт үсэрч,
   *    «яагаад» гэдэг нь ойлгомжгүй болно.
   */
  const clamp = (s: Span, p: Span | null): Span => {
    if (!p) return s;
    const st = Math.max(s.start, p.start);
    const en = Math.min(s.end, p.end);
    return st <= en ? { start: st, end: en } : { start: p.start, end: p.start };
  };

  const apply = () => {
    if (ms1 == null || ms2 == null || bad) return;
    const next = r.spans.slice();
    if (all) {
      /* ⚠️ Блок бүр `takt` хоногоор хойшилно — давтагдах блокийн хэвийн хэлбэр.
         Хавчуулалт нь блок ТУС БҮРИЙН эцгийн мужаар — бүлгийн хуваарь блок
         бүрд өөр байж болно. */
      const len = spanDays({ start: ms1, end: ms2 });
      blocks.forEach((_, b) => {
        const shift = (b - blk) * takt * DAY;
        next[b] = clamp(
          { start: ms1 + shift, end: endOf(ms1 + shift, len) },
          par?.spans[b] ?? null,
        );
      });
    } else {
      next[blk] = clamp({ start: ms1, end: ms2 }, pspan);
    }
    onSet(next);
    onClose();
  };

  const clear = () => {
    const next = r.spans.slice();
    if (all) blocks.forEach((_, b) => { next[b] = null; });
    else next[blk] = null;
    onSet(next);
    onClose();
  };

  return (
    <div className={h.mdBack} role="presentation" onClick={onClose}>
      <div className={h.md} role="dialog" aria-modal="true"
        onClick={(e) => e.stopPropagation()}>
        <header className={h.mdHead}>
          <span className={h.mdNo}>{r.no}</span>
          <b className={h.mdWork}>{r.work || tr('(нэргүй)')}</b>
          <button type="button" className={h.mdX} onClick={onClose} aria-label={tr('Хаах')}>×</button>
        </header>

        <label className={h.mdField}>
          {tr('Блок')}
          <select className={h.select} value={blk} onChange={(e) => onBlk(Number(e.target.value))}>
            {blocks.map((b, k) => <option key={b} value={k}>{b}</option>)}
          </select>
        </label>

        {/* ⚠️ БҮЛГИЙН МУЖ нь хатуу хязгаар. Зөвхөн хавчуулаад дуугүй өнгөрвөл
            «яагаад миний оруулсан огноо өөрчлөгдчихөв» гэсэн асуулт үүснэ —
            хязгаарыг ИЛ бичиж, талбарын min/max-аар нь ч хаана. */}
        {pspan && (
          <p className={h.mdPar}>
            {tr('Бүлгийн муж')}: <b className="num">{msToDay(pspan.start)}</b>
            {' → '}<b className="num">{msToDay(pspan.end)}</b>
            {par?.work ? <span className={h.mdParWork}> · {par.work}</span> : null}
            {canEdit && (a !== msToDay(pspan.start) || z !== msToDay(pspan.end)) && (
              /* ⚠️ Байгаа хуваарийг АВТОМАТААР дарж бичихгүй — бодит өгөгдөл.
                 Бүлгийн мужийг бүтнээр нь авахыг ЭНД ил санал болгоно. */
              <button type="button" className={h.mdSnap}
                onClick={() => { setA(msToDay(pspan.start)); setZ(msToDay(pspan.end)); }}>
                {tr('мужаар нь авах')}
              </button>
            )}
          </p>
        )}

        <div className={h.mdDates}>
          <label className={h.mdField}>
            {tr('Эхлэх')}
            <input type="date" className={h.select} value={a} disabled={!canEdit}
              min={pspan ? msToDay(pspan.start) : undefined}
              max={pspan ? msToDay(pspan.end) : undefined}
              onChange={(e) => setA(e.target.value)} />
          </label>
          <label className={h.mdField}>
            {tr('Дуусах')}
            <input type="date" className={h.select} value={z} disabled={!canEdit}
              min={pspan ? msToDay(pspan.start) : undefined}
              max={pspan ? msToDay(pspan.end) : undefined}
              onChange={(e) => setZ(e.target.value)} />
          </label>
          <span className={h.mdDays}>
            {bad ? <b className={h.mdBad}>{tr('Дуусах нь эхлэхээс өмнө')}</b>
              : days != null ? <>{num(days)} {tr('хоног')}</> : '—'}
          </span>
        </div>

        {over && (
          <p className={h.mdWarn}>
            {tr('Бүлгийн мужаас хальсан — хадгалахад мужид нь багтаана.')}
          </p>
        )}

        {canEdit && (
          <label className={h.mdAll}>
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            {tr('Бүх {0} блокт {1} хоногийн алхмаар тараах', num(blocks.length), num(takt))}
          </label>
        )}

        <footer className={h.mdFoot}>
          {canEdit && (
            <button type="button" className={h.tlZoomB} onClick={clear}
              disabled={!r.spans.some(Boolean)}>
              {tr('Арилгах')}
            </button>
          )}
          <span className={h.spacer} />
          <button type="button" className={h.tlZoomB} onClick={onClose}>{tr('Хаах')}</button>
          {canEdit && (
            <button type="button" className={h.save} onClick={apply}
              disabled={ms1 == null || ms2 == null || bad}>
              {tr('Тавих')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
