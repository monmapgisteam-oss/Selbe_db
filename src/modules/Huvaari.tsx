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
import { hasPlanRole, huvaariScope, subscribeHuvaariAcl } from '@/lib/huvaariAcl';
import { roleForUser } from '@/lib/services';
import { num } from '@/lib/format';
import {
  loadSchema, pkgFloors, PKG_GROUPS, PKGS, type Pkg, type Schema,
} from '@/modules/sheet/bagts.pkg';
import { applyUpdates, loadRows, msToDay, type SheetRow } from '@/modules/sheet/bagtsSheet';
import {
  DAY, coverageOf, endOf, spanDays, statusOf,
  type PlanRow, type Span, type Status,
} from '@/lib/plan';
import {
  codeIndex, downstreamCodes, effSpan, formatDeps, hierRelated, parseDeps,
  propagate, reaches, requiredStart, residualDeps, rollUpGroups,
  type Dep, type DepType,
} from '@/lib/deps';
import {
  balanced, buildEdits, loadPkgPlan, applyPlanEdits, keepMonths, monthsOf,
  sumMonths, type PkgPlan, type PlanEdits, type WorkMeta,
} from '@/lib/huvaariObyem';
import {
  decidePlan, loadHistory, loadPayload, loadPending, planTableState, PLAN_STATUS,
  submitPlan, withdrawPlan, type PlanPayloadKind,
  type PlanPayload, type PlanSubmission,
} from '@/lib/huvaariBatlah';
import { useFocusTrap } from '@/lib/useFocusTrap';
import h from './huvaari.module.css';

/* ══════════════════ Туслах ══════════════════ */

/** Богино огноо — «03-02». Жил нь хүрээний шошгонд бий. */
const short = (ms: number) => msToDay(ms).slice(5);

/** Хоёр муж (эсвэл хоёулаа хоосон) ижил үү — ноорог ба суурийн харьцуулалтад (2026-09-21) */
const sameSpan = (a: Span | null | undefined, b: Span | null | undefined): boolean => (
  (!a && !b) || (!!a && !!b && a.start === b.start && a.end === b.end)
);

/**
 * Хоёр сарын задаргаа ижил үү — хоёулаа хоосон (эсвэл байхгүй) ч ИЖИЛ (2026-09-21).
 * ⚠️ Ноорогийг серверийн задаргаатай тулгахад: ижил бол ноорогт үлдээх зүйлгүй —
 *    бичих зүйл ч, «хадгалаагүй» тэмдэг ч байх ёсгүй.
 */
const sameMonths = (
  a: ReadonlyMap<string, number> | null | undefined,
  b: ReadonlyMap<string, number> | null | undefined,
): boolean => {
  const x = a ?? new Map<string, number>();
  const y = b ?? new Map<string, number>();
  return x.size === y.size && [...x].every(([k, v]) => y.get(k) === v);
};

/** «2026-05-04» → UTC шөнө дунд. Буруу бол `null`. */
const dayToMs = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/**
 * ХУВААРИЙН ТӨРӨЛ — аль огноог засаж байна вэ (2026-09-11).
 *
 * ⚠️ `plan` = ТӨЛӨВЛӨСӨН (`F…_Эхлэх`/`…_Дуусах`) — ажлын явцад хөдөлдөг.
 *    `geree` = ГЭРЭЭНИЙ (`F…_geree_ehleh`/`…_geree_duusah`) — өөрчлөгдөшгүй
 *    лавлагаа. Хоёрын ЗӨРҮҮ нь «хуваарь гэрээнээс хэр хазайсан» гэдгийг
 *    хэмжих суурь тул НЭГ талбарт хийж болохгүй.
 * ⚠️ Уялдаа (`deps`) ба сарын обьём нь ЗӨВХӨН төлөвлөгөөнд хамаарна —
 *    гэрээ нь гинжээр хөдөлдөггүй, түүнээс обьём тараах ч утгагүй.
 */
/**
 * ⚠️ ЭХ тодорхойлолт нь `huvaariBatlah.ts`-д (`PlanPayloadKind`) — илгээлтийн
 *    агуулгад бичигддэг тул тэнд эзэмшигдэнэ. Энд зөвхөн ХОЧ: хоёр тусдаа
 *    union бичвэл нэг нь өөрчлөгдөхөд нөгөө нь чимээгүй зөрнө.
 */
type PlanKind = PlanPayloadKind;

/** `SheetRow[]` → `PlanRow[]`. `i` нь ЭХ массивын индекс. */
function toPlanRows(rows: SheetRow[], n: number, kind: PlanKind = 'plan'): PlanRow[] {
  const st = (r: SheetRow) => (kind === 'geree' ? r.gStart : r.start);
  const en = (r: SheetRow) => (kind === 'geree' ? r.gEnd : r.end);
  return rows.map((r, i) => ({
    i,
    oid: r.oid,
    no: r.no,
    des: r.des,
    deps: parseDeps(r.ham),
    work: r.work,
    depth: r.depth,
    group: r.group,
    vol: r.vol,
    spans: Array.from({ length: n }, (_, b) => (
      st(r)[b] != null && en(r)[b] != null
        ? { start: st(r)[b] as number, end: en(r)[b] as number }
        : null
    )),
    act: r.act,
    /* ⚠️ Бодит огноо · нөөц (2026-09-23) — `kind`-ээс ХАМААРАХГҮЙ: гэрээ ба
       төлөвлөгөө хоёр таб нэг бодит талбарыг харуулна (баримт нэг л байна). */
    aStart: r.aStart,
    aEnd: r.aEnd,
    hun: r.hun,
    mashin: r.mashin,
  }));
}

/**
 * БҮЛГИЙН БОДИТ ОГНОО ба НӨӨЦ — хүүхдүүдээс (2026-09-23).
 * Бодит эхэлсэн = навчдын MIN, бодит дууссан = навчдын MAX (аль нэг навч
 * дуусаагүй бол `null` — «бүлэг дууссан» гэж худал хэлэхгүй); хүн/техник =
 * навчдын НИЙЛБЭР (нэг ч навч бөглөөгүй бол `null`, 0 БИШ).
 * ⚠️ ЗӨВХӨН ДЭЛГЭЦ — бүлгийн мөрд бичигдэхгүй (`effRow` → popup/зүүн багана).
 */
function aggExtra(rows: readonly PlanRow[], i: number, n: number): {
  aStart: (number | null)[]; aEnd: (number | null)[]; hun: number | null; mashin: number | null;
} {
  const g = rows[i];
  const aStart: (number | null)[] = new Array(n).fill(null);
  const aEnd: (number | null)[] = new Array(n).fill(null);
  const open: boolean[] = new Array(n).fill(false);
  let hun: number | null = null;
  let mashin: number | null = null;
  for (let k = i + 1; k < rows.length && rows[k].depth > g.depth; k += 1) {
    const r = rows[k];
    if (r.group) continue;
    for (let b = 0; b < n; b += 1) {
      const s = r.aStart?.[b] ?? null;
      const e = r.aEnd?.[b] ?? null;
      if (s != null && (aStart[b] == null || s < aStart[b]!)) aStart[b] = s;
      if (s != null && e == null) open[b] = true;
      if (e != null && (aEnd[b] == null || e > aEnd[b]!)) aEnd[b] = e;
    }
    if (r.hun != null) hun = (hun ?? 0) + r.hun;
    if (r.mashin != null) mashin = (mashin ?? 0) + r.mashin;
  }
  for (let b = 0; b < n; b += 1) if (open[b]) aEnd[b] = null;
  return { aStart, aEnd, hun, mashin };
}

/**
 * Мөрийн НИЙТ муж — хамгийн эрт эхлэх → хамгийн сүүл дуусах. Хуваарьгүй бол `null`.
 * ⚠️ Шүүлт, мөрийн шошго, popup гурвуулаа үүнийг ашиглана — тус тусад нь
 *    бодвол «жагсаалтад орсон ч өөр огноо харуулах» зөрүү үүснэ.
 * ⚠️ ЭКСПОРТЛОГДОХГҮЙ (2026-09-06): энэ файлаас гадуур хэн ч импортлодоггүй.
 */
function rowSpan(r: PlanRow): Span | null {
  let a: number | null = null;
  let z: number | null = null;
  for (const s of r.spans) {
    if (!s) continue;
    if (a == null || s.start < a) a = s.start;
    if (z == null || s.end > z) z = s.end;
  }
  return a == null || z == null ? null : { start: a, end: z };
}

/**
 * ЛАВЛАГААНЫ мөрийн нийт муж — нөгөө төрлийн (гэрээ ↔ төлөвлөгөө) огноо.
 *
 * ⚠️ Мөр олдохгүй бол `null`: `refBase` нь идэвхтэй табтай ЯГ ижил мөрүүдээс
 *    бүтдэг тул ихэвчлэн олдоно, гэхдээ нэг тал нь хоосон блоктой байж болно.
 */
function spanOfRef(m: Map<number, PlanRow>, oid: number): Span | null {
  const r = m.get(oid);
  return r ? rowSpan(r) : null;
}


/** Нийтлээгүй засвар: `oid` → блок бүрийн шинэ хуваарь */
type Draft = Map<number, (Span | null)[]>;
/**
 * БОДИТ ОГНООНЫ НООРОГ: `oid` → блок бүрийн { эхэлсэн[], дууссан[] } (2026-09-23).
 * ⚠️ `Draft`-аас ТУСДАА: бодит огноо гинж/`rollUpGroups`/`propagate`-д орохгүй
 *    тул нэг Map-д хийвэл тэр хөдөлгүүрүүд түүнийг ч хөдөлгөнө. Мөрийн БҮХ
 *    блокийн массив (диффийг `save` хийнэ) — `Draft`-тай ижил хэлбэр.
 */
type ADraft = Map<number, { start: (number | null)[]; end: (number | null)[] }>;
/** НӨӨЦИЙН НООРОГ: `oid` → { хүн хүч, машин механизм } (2026-09-23). Мөрийн скаляр. */
type ResDraft = Map<number, { hun: number | null; mashin: number | null }>;

/**
 * Хүснэгтийн мөрийн өндөр (px).
 * ⚠️ Зүүн нэрийн багана ба баруун хуанли ЯГ ЭНЭ өндрөөр эгнэнэ. Аль нэгийг нь
 *    өөрчилвөл мөрүүд гулсаж, «энэ зурвас аль ажлынх нь вэ» гэдэг алдагдана.
 */
const PL_ROW = 30;

/**
 * ЦОНХЛОЛТЫН НӨӨЦ МӨР — харагдах хүрээний дээр/доор нэмж зурах тоо.
 *
 * ⚠️ 2026-09-03-ны хэрэглэгч талын аудит: энэ харагдац 1,266–1,675 мөрийг
 * БҮГДИЙГ нь зурдаг байв — мөр бүрд зүүн самбарын ~6 элемент + зурвас ⇒
 * ~20,000 DOM зангилаа. Чирэх бүрд React бүгдийг дахин тооцоолдог тул
 * «сар» томруулалт дээр зурвас чирэхэд мэдэгдэхүйц гацдаг байлаа.
 * `FillNew`-ийнхтэй ижил загвар: зөвхөн харагдах хүрээг зурна.
 *
 * ⚠️ Мөрийн өндөр ТОГТМОЛ (`PL_ROW`) тул хэмжилт хэрэггүй — `FillNew` дээр
 * мөр нь агуулгаараа сунадаг тул тэнд `rowHRef` хэмждэг.
 */
const PL_OVER = 8;

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
type Drag = { oid: number; mode: DragMode; anchor: number; orig: Span | null; /** чирэлтээс өмнөх сарын задаргаа — буцаахад (2026-09-17) */ origMonths?: Map<string, number> | null };

/* ══════════════════ Үндсэн харагдац ══════════════════ */

/**
 * Тухайн үүргийн хүрээнд энэ багц багтах уу.
 * `null` = хязгааргүй · `[]` = тэр үүргээр хуваарилагдаагүй.
 */
const inScope = (scope: string[] | null, group: string): boolean =>
  scope == null || scope.includes(group);

export function Huvaari({
  jump, onJumpDone,
}: {
  /**
   * «ХУВААРЬ БАТЛАХ» ДАРААЛАЛААС ШИЛЖИЖ ИРСЭН БАТЛАХ ХҮСЭЛТ (2026-09-16).
   *
   * ⚠️ Дараалал нь эх өгөгдөлд БИЧИХГҮЙ (`HuvaariBatlah.tsx`-ийн толгой):
   *    батлах гинж (`save` → `applyUpdates` → `decidePlan`) ЗӨВХӨН энд
   *    байдаг тул товч дарахад тэр багцаар энэ хуудас нээгдэж, шийдвэрлэх
   *    цонх өөрөө гарна.
   * ⚠️ `Portal`-ийн САНАХ ОЙН төлөв — URL ч, `sessionStorage` ч БИШ: тэр
   *    хоёр нь F5-ыг давж, шийдвэрлэгдсэн саналын цонхыг дахин нээх байлаа.
   */
  jump?: { pkgKey: string; oid: number } | null;
  /** Хүсэлтийг НЭГ л удаа хэрэглэсний дараа цэвэрлэнэ */
  onJumpDone?: () => void;
} = {}) {
  const { user, status } = useAuth();
  /* ⚠️ Хуваарийн хуваарилалт ӨӨРИЙН хадгалалттай — түүнд захиалахгүй бол
     админы өөрчлөлт энэ хуудсанд хүрэхгүй. */
  const [hvN, setHvN] = useState(0);
  useEffect(() => subscribeHuvaariAcl(() => setHvN((x) => x + 1)), []);
  const [pkg, setPkg] = useState<Pkg>(PKGS[0]);
  /**
   * БҮХ БАГЦ ХАРАГДАНА — ХАРАХ нь ЗАСАХААС ТУСДАА (2026-09-09).
   *
   * ⚠️ ХАРАГДАЦЫН ЭРХ (`views`) нь «юуг ХАРАХ», ACL хуваарилалт нь «юуг
   *    ЗАСАХ» гэсэн ХОЁР ӨӨР асуулт. Порталын бусад бүх модуль (Газар ·
   *    Санхүү · Дэд бүтэц · Зөвшөөрөл) яг ийм: `hasCap` нь ЗӨВХӨН товч
   *    идэвхжүүлэхэд хэрэглэгддэг, өгөгдөл нь бүгд харагдана.
   *
   * ⚠️ УРЬД НЬ багцын сонгогчийг хуваарилалтаар ШҮҮДЭГ байв. 2026-09-07-нд
   *    би `guitsetgelAcl.bagtsScope` → `huvaariScope` болгож зассан — тэр нь
   *    зөв (урсгалын томилгоо хуваарийн эрх өгөх ёсгүй) ГЭВЧ хажуугийн үр
   *    дагаврыг анзаараагүй: хуучин `bagtsScope` нь томилогдоогүй хүнд `null`
   *    (=бүх багц) буцаадаг байсан бол `huvaariScope` нь fail-closed `[]`.
   *    Үр дүнд хуваарилагдаагүй хүнд сонгогч ХООСОН болж, доорх «зөвхөн
   *    харна» гэсэн баннер ХУДАЛ амлалт болов — харах зүйл үлдээгүй.
   *
   * ⚠️ Хүрээ нь `canEdit`/`canApprove` дээр ХЭВЭЭР үйлчилнэ (доор) — өөрийн
   *    багцаас гадуур зөвхөн УНШИНА. Аюулгүй байдал сулраагүй: бичих зам
   *    бүр (`onDown` · `applyModal` · `save` · `decidePlan`) тэдгээрээр
   *    хаагдсан хэвээр.
   *
   * ⚠️ 2026-09-15 (хэрэглэгчийн шууд шаардлага): ЭНЭ ШИЙДВЭР ХУМИГДАВ.
   *    «Багц хуваарилсан аккаунт өөрийн багцаас БУСДЫГ харж байна» — тэр нь
   *    буруу. Дээрх 2026-09-09-ний засвар нь `huvaariScope` fail-closed
   *    болсноос үүдсэн ХАЖУУГИЙН үр дагаврыг (хуваарилагдаагүй хүнд сонгогч
   *    хоосон болох) нөхөх түр шийдэл байсан бөгөөд хэт өргөн болсон байв.
   *
   *    ОДООГИЙН ДҮРЭМ:
   *      · хуваарилалт БАЙХГҮЙ (`[]`, аль ч үүрэгт)  → БҮХ багц (харах эрх
   *        нь `views`-ээр аль хэдийн шийдэгдсэн; сонгогч хоосон болохгүй)
   *      · хуваарилалт БАЙГАА                        → ЗӨВХӨН өөрийн багц
   *      · `null` (хязгааргүй)                       → БҮХ багц
   *
   *    Хоёр үүргийн НЭГДЭЛ: зохиогч Багц 3-т, батлагч Багц 5-д томилогдсон
   *    хүн хоёуланг нь харна — эс бөгөөс батлах ажлаа хийж чадахгүй.
   */
  const groupOpts = useMemo(() => {
    if (status === 'off') return PKG_GROUPS;
    const a = huvaariScope(user?.username, 'author');
    const b = huvaariScope(user?.username, 'approver');
    /* ⚠️ `null` нь ХЯЗГААРГҮЙ — аль нэг үүрэг нь хязгааргүй бол бүгд */
    if (a == null || b == null) return PKG_GROUPS;
    const mine = new Set([...a, ...b]);
    /* ⚠️ Хоёр үүрэгт ч томилогдоогүй бол ХУМИХГҮЙ (дээрх ⚠️) */
    if (mine.size === 0) return PKG_GROUPS;
    const list = PKG_GROUPS.filter((g) => mine.has(g));
    /* ⚠️ Томилгоо нь одоо байхгүй багцыг заасан (нэр солигдсон) бол сонгогч
       хоосорно — тэр үед бүгдийг үзүүлнэ, эс бөгөөс хуудас ашиглагдахгүй. */
    return list.length ? list : PKG_GROUPS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, status, hvN]);
  /**
   * ЗАСАХ ЭРХ — тусад нь олгодог (`caps`) + багцын хүрээ.
   * ⚠️ Нэг огноо солиход БҮХ багцын төлөвлөгөөт хувь, тайлан, хоцрогдлын
   *    дохио дахин бодогдоно. Бөглөх эрхэд дагалдуулж болохгүй: бөглөгч
   *    өөрийн хоцрогдлыг арилгахын тулд хуваарийг хойш чирэх боломжтой болно.
   */
  /**
   * ⚠️ `pending` нь ЭНД ОРОХГҮЙ — түгжээ нь `canEdit`-д БИШ (доорх `locked`).
   *    Учир нь БАТЛАХ явцад агуулгыг ноорогт буулгаад `save`-ээр бичдэг тул
   *    тэр агшинд түгжээ асуулаа бол батлагдсан хуваарь өөрөө бичигдэхгүй.
   */
  const canEdit = useMemo(
    () => status === 'off' || inScope(huvaariScope(user?.username, 'author'), pkg.group),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, status, hvN, pkg.group],
  );

  /**
   * БАТЛАХ ЭРХ — `plan`-аас ТУСДАА (2026-09-07).
   * ⚠️ Зохиогч өөрийгөө батлахаас хамгаалах ганц шалгуур нь UI БИШ,
   *    `decidePlan` дотор — хоёр эрхийг нэг хүнд олговол товч идэвхтэй болно.
   */
  const canApprove = useMemo(
    () => status === 'off' || inScope(huvaariScope(user?.username, 'approver'), pkg.group),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, status, hvN, pkg.group],
  );

  /**
   * ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТ — байвал хуваарь ТҮГЖИГДЭНЭ.
   * ⚠️ Хоёр санал зэрэг хүлээвэл батлагч алийг нь батлахаа мэдэхгүй, мөн
   *    хоёулаа батлагдвал сүүлийнх нь өмнөхийг чимээгүй дарна.
   */
  const [pending, setPending] = useState<PlanSubmission | null>(null);
  /** Батлах хүснэгт бэлэн эсэх — үгүй бол шалтгааныг ИЛ хэлнэ, чимээгүй нуухгүй */
  const [flowReady, setFlowReady] = useState<boolean | null>(null);
  /**
   * БЭЛЭН БИШ БОЛ ЯАГААД — баннерт ЯГ энэ шалтгааныг бичнэ (2026-09-11).
   * ⚠️ Урьд нь гурван огт өөр шалтгаан нэг мессеж болж нийлдэг байсан тул
   *    админ юу засахаа мэдэхгүй байв.
   */
  const [flowWhy, setFlowWhy] = useState<string>('');
  /**
   * СҮҮЛИЙН ШИЙДВЭР — хүлээгдэж буй илгээлт байхгүй үед харуулна.
   *
   * ⚠️ БУЦААСАН ШАЛТГААНЫГ гүйцэтгэгчид ХҮРГЭХ цорын ганц зам. Үүнгүй бол
   *    буцаалт нь чимээгүй алга болж, гүйцэтгэгч юуг засахаа мэдэхгүй хэвээр
   *    дахин ижил хуваарь илгээнэ — «шалтгаан заавал» гэсэн дүрэм утгагүй
   *    болно (2026-09-07-ны шалгалтаар илэрсэн).
   */
  const [lastDecision, setLastDecision] = useState<PlanSubmission | null>(null);
  /** Илгээх/шийдвэрлэх цонх */
  const [flowBox, setFlowBox] = useState<'send' | 'decide' | null>(null);
  /**
   * БАТЛАХ ЯВЦАД — батлагдаж буй илгээлтийн `oid`.
   * ⚠️ `save` нь ноорогийг React төлөвөөс уншдаг тул агуулгыг буулгасны ДАРАА,
   *    дараагийн зурагдалтад бичилтийг гүйцэтгэнэ (`useEffect` доор).
   */
  const [approving, setApproving] = useState<number | null>(null);
  /**
   * УРЬДЧИЛАН ХАРАХ — илгээгдсэн хуваарийг хуанли дээр НООРОГ болгон буулгав уу.
   *
   * ⚠️ Үүнгүй бол батлагч «14 мөр» гэсэн тоо л хараад ХАРААГҮЙ зүйлээ батлана.
   *    Санал нь ноорог болж буусан үед хуанли дээр өөрчлөлт нь ЯГ адилхан
   *    (`h.rowDirty`) тодорно — батлагч юуг зөвшөөрч буйгаа нүдээр харна.
   *
   * ⚠️ Урьдчилан харах нь ЭХ ХУУДСАНД ЮУ Ч БИЧИХГҮЙ: ноорог нь зөвхөн санах
   *    ойд. Батлахгүйгээр хуудсаа сэргээвэл ул мөргүй арилна.
   */
  const [previewing, setPreviewing] = useState(false);

  /**
   * ЗАСВАР ТҮГЖИГДСЭН ҮҮ — хүлээгдэж буй илгээлт байхад ГАРААР засахгүй.
   *
   * ⚠️ ЯАГААД ЗААВАЛ ТҮГЖИХ ЁСТОЙ ВЭ: түгжихгүй бол гүйцэтгэгч чирж засаад
   *    ноорог хуримтлуулна, гэтэл «Батлуулах» товч нь `!pending` нөхцөлтэй
   *    тул ХАРАГДАХГҮЙ — хийсэн ажил нь ГАРАХ ЗАМГҮЙ үлдэж, багц солиход
   *    чимээгүй устана. Мөн батлагдсан агшинд серверийн хуваарь солигдох тул
   *    тэр ноорог хуучин мөрийн дугаарт наалдана.
   *
   * ⚠️ БАТЛАХ ЯВЦАД (`approving`) түгжээг ТАВИНА — тэр үед агуулгыг ноорогт
   *    буулгаж `save`-ээр бичих ёстой.
   */
  const locked = pending != null && approving == null;

  /**
   * ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТ нь ӨӨРИЙНХ ҮҮ (2026-09-08).
   * ⚠️ Зөвхөн ХАРАГДАЦЫН тэмдэглэгээ — жинхэнэ хаалт нь `decide`-д (бичихээс
   *    өмнө) ба `decidePlan`-д. Гурвуулаа НЭГ дүрэм: нэр нь жижиг үсгээр,
   *    цэвэрлэгдсэн байдлаар харьцуулагдана.
   */
  const isOwnSubmission = useMemo(() => {
    const me = (user?.username ?? '').trim().toLowerCase();
    return !!pending && !!me && me === pending.author.trim().toLowerCase();
  }, [pending, user]);

  const [sc, setSc] = useState<Schema | null>(null);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [busy, setBusy] = useState(false);
  /**
   * БҮТЭН ДЭЛГЭЦ — ЗӨВХӨН хуваарийн хүснэгт (2026-09-17, хэрэглэгч: «Гүйцэтгэл
   * бөглөх»-ийнхтэй адил). `FillNew`-ийн `wide`-тай ИЖИЛ загвар: хөтчийн
   * `requestFullscreen` БИШ, `position: fixed` давхарга — дотоод цонх (popup
   * хуанли, батлах асуулт) хэвээр ажиллана. Сешн хооронд санагдана.
   */
  const [wide, setWide] = useState(() => {
    try { return localStorage.getItem('selbe-huvaari-wide') === '1'; } catch { return false; }
  });
  /*
   * ОГНОО · НӨӨЦИЙН БАГАНЫГ ХУРААХ (2026-09-23, хэрэглэгч: «энэ хэсгийг хурааж
   * нээдэг байж болох уу»). Хураахад «Гэрээ эхлэх … Техник» 10 багана нуугдаж,
   * зүүн самбар нарийсч хуанлид зай өгнө; код · нэр · хамаарал үлдэнэ.
   * ⚠️ Анхдагч нь НЭЭЛТТЭЙ — хэрэглэгч багануудыг шаардаж нэмүүлсэн тул
   *    анх удаа нээхэд нуугдсан байж болохгүй. Сешн хооронд санагдана.
   */
  const [cols, setCols] = useState(() => {
    try { return localStorage.getItem('selbe-huvaari-cols') !== '0'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('selbe-huvaari-cols', cols ? '1' : '0'); } catch { /* хаалттай орчин */ }
  }, [cols]);
  useEffect(() => {
    try { localStorage.setItem('selbe-huvaari-wide', wide ? '1' : '0'); } catch { /* хаалттай орчин */ }
  }, [wide]);
  useEffect(() => {
    if (!wide) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) setWide(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [wide]);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const [draft, setDraft] = useState<Draft>(new Map());
  /**
   * УЯЛДААНЫ НООРОГ: `oid` → «18FS3,…» текст. Огнооны ноорогтой (`draft`)
   * ЗЭРЭГЦЭЭ тусдаа — уялдаа нь огноо хөндөлгүй өөрчлөгдөж болно (мөн эсрэгээр).
   * Хадгалахад хоёулаа нэг `applyUpdates`-д нийлнэ.
   */
  const [ham, setHam] = useState<Map<number, string>>(new Map());
  /**
   * БОДИТ ОГНОО ба НӨӨЦИЙН ноорог (2026-09-23) — `draft`/`ham`-тай ЗЭРЭГЦЭЭ,
   * тусдаа. Хадгалахад бүгд нэг `applyUpdates`-д, батлуулахад нэг payload-д
   * нийлнэ (`actual`/`res`). Popup-аас л засагдана (зүүн багана зөвхөн харуулна).
   */
  const [aDraft, setADraft] = useState<ADraft>(new Map());
  const [resDraft, setResDraft] = useState<ResDraft>(new Map());
  const [sel, setSel] = useState<number | null>(null);

  /* ══════ САРЫН ОБЬЁМ (тусдаа үйлчилгээ, `huvaariObyem.ts`) ══════ */
  /** Хадгалагдсан задаргаа — ажлын код → блок → сар → обьём */
  const [obPlan, setObPlan] = useState<PkgPlan>(new Map());
  /** `dkey → ObjectID` — бичихэд аль мөрийг шинэчлэхийг мэдэхэд */
  const [obOids, setObOids] = useState<Map<string, number>>(new Map());
  /**
   * ДАВХАРДСАН мөрийн ИЛҮҮДЭЛ OID-ууд (2026-09-08).
   * ⚠️ `dkey`-д сангийн unique индекс АЛГА тул зэрэг хадгалалт ижил
   *    түлхүүртэй хоёр мөр үүсгэж чадна. Апп дотор нь ганц утга харагддаг
   *    учир нүдээр илрэхгүй ч Excel/ArcGIS Pro-д обьём давхар тоологдоно.
   *    Дараагийн бичилтэд `deletes`-т нийлүүлж чимээгүй арилгана.
   */
  const [obDups, setObDups] = useState<number[]>([]);
  /**
   * ХАДГАЛААГҮЙ задаргаа — `${ажлын код}|${блок}` → сар → обьём.
   * ⚠️ Огнооны ноорог (`draft`) ба уялдааны ноорог (`ham`)-той ЗЭРЭГЦЭЭ,
   *    тусдаа: обьём нь огноо хөндөлгүй өөрчлөгдөж болно (мөн эсрэгээр).
   *    Гурвуулаа нэг «Хадгалах»-д нийлнэ.
   */
  const [obDraft, setObDraft] = useState<Map<string, Map<string, number>>>(new Map());
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  /**
   * ХАРАГДАХ ТҮВШИН — «Түвшин 1 2 3 4 5» зурвасын идэвхтэй товч.
   *
   * ⚠️ `Finance`-ийн «Гэрээний бүртгэл» хуудасны ЯГ ИЖИЛ загвар (хэрэглэгчийн
   *    шаардлага, 2026-09-15): нэг порталд нэг үүрэгтэй хоёр өөр хэлбэр
   *    байх ёсгүй. Тэнд `lvl` нь 1–5, `setLevel` нь эвхэлтийг бөөнөөр тавьдаг.
   *
   * ⚠️ `0` = «холимог»: хэрэглэгч ГАРААР нэг бүлэг эвхсэн бол аль ч товч
   *    тодрохгүй — дэлгэц дээрх байдалтай зөрчилдсөн тодруулга үлдэх ёсгүй
   *    (`Finance.lvOn`-ийн ижил ⚠️).
   *
   * ⚠️ АНХДАГЧ нь ХАМГИЙН ГҮН (бүх мөр дэлгээтэй) — хуваарь нь ажил тус бүрийн
   *    огноог ЗАСАХ хуудас тул хаалттай эхлэх нь ажлыг нэмэгдүүлнэ.
   */
  const [lvl, setLvl] = useState(0);
  /** Popup хуанли нээгдсэн мөр (`PlanRow.i`) */
  const [modal, setModal] = useState<number | null>(null);

  /**
   * ШҮҮЛТҮҮР. `filter` нь түргэн таб, бусад нь сонголт.
   * ⚠️ Тусдаа талбар болгосон шалтгаан: хэрэглэгч «хоцорсон, урт, 2026 онд
   *    эхлэх» гэж ХОСЛУУЛЖ шүүнэ. Нэг радио жагсаалт байсан бол зөвхөн нэгийг.
   */
  const [filter, setFilter] = useState<'all' | 'has' | 'none' | 'partial'>('all');
  const [fYear, setFYear] = useState('all');
  /**
   * БҮЛГЭЭР ШҮҮХ — сонгосон бүлэг ба ДОТОРХ бүх ажлыг л үлдээнэ.
   * ⚠️ Утга нь `PlanRow.i` (эх массивын индекс), `oid` БИШ: ижил нэртэй
   *    бүлэг олон байж болох ба индекс нь модны байрлалыг ч заана.
   */
  const [fGrp, setFGrp] = useState<'all' | number>('all');

  /* ── Хуанлийн төлөв ── */
  /* ⚠️ АНХДАГЧ нь «сар» (2026-09-02, хэрэглэгч). Хуваарь 2025–2028 оныг
     дамждаг тул «7 хоног» (7px/хоног) дээр нээхэд ~1,035 хоног нь 7,000px
     болж, нэг дэлгэцэнд ердөө 3–4 сар багтана — хүн эхлээд БҮТЭН зургийг
     хармаар байдаг. «сар» (2.6px/хоног) дээр бүхэл төсөл нэг дэлгэцэнд
     ойролцоогоор багтана; нарийвчлах бол товчоор томруулна. */
  /**
   * ХУВААРИЙН ТӨРӨЛ — «Төлөвлөгөө» эсвэл «Гэрээ» (2026-09-11).
   *
   * ⚠️ Солиход НООРОГ ЦЭВЭРЛЭГДЭНЭ (доорх эффект): ноорог нь `oid` →
   *    блокийн муж гэсэн хэлбэртэй бөгөөд аль төрлийнх болох нь тэмдэглэгдэх
   *    газаргүй. Цэвэрлэхгүй бол төлөвлөгөөнд зассан огноо гэрээний талбарт
   *    бичигдэнэ — чимээгүй, эргүүлэх аргагүй.
   */
  const [kind, setKind] = useState<PlanKind>('plan');

  /**
   * ЛАВЛАГАА ХАРАГДАХ ЭСЭХ — нөгөө төрлийн зурвас (2026-09-11, хэрэглэгч:
   * «дангаар нь харах бол гэрээ төлөвлөгөө дээр дарж идэвхжүүлдэг болго»).
   *
   * ⚠️ `kind` нь ЗАСАХ төрөл, энэ нь ХАРАХ асаалт — хоёр өөр зүйл. Засвар,
   *    ноорог, хадгалалт, батлалт бүгд `kind`-ээс л хамаарна; энэ асаалт
   *    юу ч бичдэггүй. Эс бөгөөс нэг ноорогт хоёр төрөл холилдоно.
   * ⚠️ Анхдагчаар УНТРААЛТТАЙ: дангаар нь харах нь үндсэн байдал, зэрэг
   *    харахыг «Зэрэг» товчоор ил асаана.
   */
  const [showRef, setShowRef] = useState(false);
  const [zoom, setZoom] = useState<Zoom>('month');
  const [blk, setBlk] = useState(0);
  const [takt, setTakt] = useState(7);
  const [drag, setDrag] = useState<Drag | null>(null);
  /**
   * ХАМААРЛЫГ ШУГАМААР ХОЛБОХ (2026-09-22, хэрэглэгч: «бар хооронд шугам чирж
   * хамаарал шууд холбоно»). Зурвасын баруун захын бариулаас чирж эхлээд нөгөө
   * АЖЛЫН мөр дээр тавихад тэр мөр энэ ажлаас FS (лаг 0) хамаардаг болно.
   * ⚠️ Шалгуур (дугуй, өвөг/удам, түгжээ) — `applyModal`-д ганц газар; энд
   *    зөвхөн зорилтыг олж дамжуулна. `i` = урд ажлын `plan` индекс, `x/y` =
   *    `.plLanes`-ийн дотоод координат (түр шугамын үзүүр).
   */
  const [link, setLink] = useState<{ i: number; x: number; y: number } | null>(null);
  const lanesRef = useRef<HTMLDivElement | null>(null);
  /** Холбосны дараах цонх — төрөл (FS/SS) ба хоног асууна (2026-09-22, хэрэглэгч). `si` урд, `ti` хамаарагч. */
  const [linkAsk, setLinkAsk] = useState<{ si: number; ti: number } | null>(null);
  /**
   * ЧИРЭЛТИЙГ БУЦААХ мэдээлэл — popup-ыг ЦУЦЛАХАД сэргээнэ.
   *
   * ⚠️ `null` = цуцлахад буцаах зүйлгүй (мөрөөс товшиж нээсэн цонх). Чирэлтээр
   *    нээгдсэн үед л дүүрнэ; «Тавих», «Арилгах» хоёулаа үүнийг цэвэрлэнэ —
   *    тэдгээр нь ЗӨВШӨӨРӨГДСӨН өөрчлөлт тул буцаах ёсгүй.
   */
  const undoRef = useRef<{ oid: number; blk: number; span: Span | null; months: Map<string, number> | null } | null>(null);
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
    if (groupOpts.includes(pkg.group) || draft.size || ham.size || aDraft.size || resDraft.size || !groupOpts.length) return;
    const first = pkgFloors(groupOpts[0])[0];
    if (first) setPkg(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupOpts]);

  useEffect(() => {
    let alive = true;
    setBusy(true); setErr(''); setRows([]); setSc(null);
    setDraft(new Map()); setHam(new Map()); setSel(null); setCollapsed(new Set()); setModal(null);
    setADraft(new Map()); setResDraft(new Map());
    /* ⚠️ Түвшний товчийг ч тэглэнэ — багц бүр ӨӨР гүнтэй тул өмнөх багцын
       сонголт шинэ модонд утгагүй (эвхэлт нь дээр цэвэрлэгдсэн). */
    setLvl(0);
    setObPlan(new Map()); setObOids(new Map()); setObDraft(new Map()); setObDups([]);
    /* ⚠️ Урьдчилан харах ба батлах урсгалын төлөв нь БАГЦЫНХ — ноорог
       цэвэрлэгдэхэд эдгээр ч дагаж тэглэгдэхгүй бол өмнөх багцын санал
       харагдсаар байгаа мэт товч, баннер үлдэнэ. */
    setPreviewing(false); setApproving(null); setFlowBox(null);
    /* ⚠️ Батлах урсгалын АЛХАМЫН тэмдэглэгээг ч тэглэнэ (2026-09-15-ны
       аудит): savedRef нь useRef тул багц/төрөл солиход үлддэг байв. Бичилт
       унаад true үлдсэн бол дараагийн батлалтад save() ОГТ дуудагдалгүй
       шууд decidePlan руу орж, хуваарь эх хуудсанд бичигдэлгүй «батлагдсан»
       болж, гүйцэтгэгчийн санал ул мөргүй алга болно. */
    savedRef.current = false;
    setBlk(0); jumped.current = false;
    /* ⚠️ Сарын обьёмыг ТУСАД НЬ татна: тэр үйлчилгээ унасан ч хуваарийн
       хуудас нээгдэх ЁСТОЙ. Алдааг `setErr` рүү хийхгүй — улаан баннер нь
       огноо төлөвлөхөд саад болно; задаргаа нь зүгээр л хоосон харагдана. */
    loadPkgPlan(pkg.key)
      .then((r) => { if (alive) { setObPlan(r.plan); setObOids(r.oids); setObDups(r.dups); } })
      .catch(() => { /* задаргаагүйгээр үргэлжилнэ */ });
    /* ⚠️ СИНТЕТИК БЛОК (2026-09-23): блокгүй 8 багцад (5.x · 6.x · 10) мөрийн
       түвшний огноо (`Төлөвлөгөөт_хуваарь__Эхлэх/Дуусах` · `geree_*` · `bodit_*`)
       нэг блок болж орно — хуваарь барилгын багцтай ИЖИЛ ажиллана, доорх
       `save` нь `sc.start[b]`/`sc.gStart[b]`/`sc.aStart[b]` нэрээр бичдэг тул
       мөрийн баганад шууд бичигдэнэ. ЗӨВХӨН ЭНД опт-ин — FillNew/дашбоард/
       нэгтгэл `loadSchema(pkg)`-ээр хоосон блок хэвээр (`Schema.synthetic`). */
    loadSchema(pkg, { synthetic: true })
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

  /**
   * ТӨРӨЛ СОЛИГДОХОД НООРОГ ЦЭВЭРЛЭГДЭНЭ (2026-09-11).
   *
   * ⚠️ ЗААВАЛ: ноорог нь `oid → блокийн муж` хэлбэртэй бөгөөд аль төрлийнх
   *    болохыг тэмдэглэх газаргүй. Цэвэрлэхгүй бол ТӨЛӨВЛӨГӨӨНД зассан
   *    огноо ГЭРЭЭНИЙ талбарт бичигдэнэ — чимээгүй, эргүүлэх аргагүй.
   * ⚠️ Уялдаа (`ham`) ба сарын обьём (`obDraft`) нь ЗӨВХӨН төлөвлөгөөнд
   *    хамаарах тул тэднийг ч цэвэрлэнэ.
   * ⚠️ Хадгалаагүй ажил байвал товч дарахаас ӨМНӨ асууна (`askSwitch`) —
   *    энэ эффект нь зөвхөн БОДИТ солилтын дараах цэвэрлэгээ.
   * ⚠️ БАТЛАХ УРСГАЛЫН төлвийг Ч цэвэрлэнэ (2026-09-11-ний аудитын S1).
   *    Урьд нь `previewing`/`approving`/`pending`/`flowBox` үлддэг байсан тул:
   *    батлагч урьдчилан хараад таб солиход ноорог цэвэрлэгдэн `dirtyN` 0
   *    болж, «бичих зүйлгүй» салаа ажиллан илгээлтийг `approved` болгоно —
   *    гүйцэтгэгчийн санал УЛ МӨРГҮЙ алга болж «батлагдлаа» гэж мэдээлнэ.
   *    Багц солих эффект (`[pkg]`) яг ижил шалтгаанаар эдгээрийг тэглэдэг.
   */
  useEffect(() => {
    setDraft(new Map()); setHam(new Map()); setObDraft(new Map());
    /* ⚠️ Бодит огноо · нөөц (2026-09-23) нь `kind`-ээс хамаардаггүй ч ЦЭВЭРЛЭНЭ:
       нэг илгээлт нэг `kind` авч явдаг тул таб солиход хагас ноорог үлдвэл
       дараагийн илгээлт хоёр төрлийн хольц болно. `askSwitch` урьдчилан асуудаг. */
    setADraft(new Map()); setResDraft(new Map());
    setSel(null); setModal(null); setNote(''); setErr('');
    setPreviewing(false); setApproving(null); setFlowBox(null);
    /* ⚠️ Батлах урсгалын АЛХАМЫН тэмдэглэгээг ч тэглэнэ (2026-09-15-ны
       аудит): savedRef нь useRef тул багц/төрөл солиход үлддэг байв. Бичилт
       унаад true үлдсэн бол дараагийн батлалтад save() ОГТ дуудагдалгүй
       шууд decidePlan руу орж, хуваарь эх хуудсанд бичигдэлгүй «батлагдсан»
       болж, гүйцэтгэгчийн санал ул мөргүй алга болно. */
    savedRef.current = false;
  }, [kind]);

  const n = sc?.bld.length ?? 0;
  /**
   * Бодит огноо · нөөцийн багана ХАРАГДАХ ЭСЭХ (2026-09-23) — талбар байгаа
   * үйлчилгээнд л. Блокгүй 8 багцад `aStart` хоосон тул бодит огноо нуугдана;
   * `hun_huch`/`mashin_mehanizm` 18/18-д бий ч схемээс шалгана (null = нуух).
   * ⚠️ 2026-09-23: блокгүй багцад синтетик блок (`Schema.synthetic`) мөрийн
   *    `bodit_ehleh/duusah`-ыг `aStart[0]`-д авчирдаг тул тэнд ч бодит огноо
   *    харагдана (багана байвал).
   */
  const hasActual = !!sc && sc.aStart.some(Boolean);
  const hasRes = !!sc && !!(sc.f.hunHuch || sc.f.mashin);

  /** Ноорогийг эх мөрүүд дээр давхарлана — харагдац үргэлж ХАМГИЙН СҮҮЛИЙНХ */
  const base = useMemo(() => toPlanRows(rows, n, kind), [rows, n, kind]);

  /**
   * ЛАВЛАГААНЫ хуваарь — НӨГӨӨ төрлийн огноо (2026-09-11, хэрэглэгчийн хүсэлт:
   * «төлөвлөгөө гэрээ 2-ийг зэрэг харах»).
   *
   * ⚠️ Засах боломжгүй, зөвхөн ХАРУУЛНА: зурвасын ард нимгэн судлаар гарч,
   *    «гэрээнээс хэр хазайсан» гэдгийг НЭГ дэлгэцээс уншина. Хоёр төрлийг
   *    зэрэг ЗАСВАЛ аль нь ноорогт хамаарахыг ялгах газаргүй болно.
   * ⚠️ НООРОГ давхарлахгүй (`rows`-оос шууд): лавлагаа нь ХАДГАЛАГДСАН
   *    утга байх ёстой — эс бөгөөс өөрийн зассан зурвасаа өөртэйгөө жишнэ.
   * ⚠️ Бүлгийн мөрд ХҮҮХДЭЭСЭЭ бодогдоно (`effSpan`) — зурах үед хийгдэнэ.
   */
  /*
   * ⚠️ 2026-09-15: `showRef`-ЭЭС САЛГАВ. Урьд нь «Зэрэг» унтраалттай үед огт
   *    бодохгүй байсан (2026-09-11-ний аудит, ачаалал хэмнэх) — гэвч одоо
   *    зүүн самбарын ДӨРВӨН ШИНЭ БАГАНА (гэрээний ба инженерийн огноо) нь
   *    үүнийг ҮРГЭЛЖ шаардана. Нэг хөрвүүлэлт нэмэгдэх нь тэр багануудыг
   *    хоосон үлдээхээс дээр: хоёр төрлийн огноог зэрэгцүүлж харах нь
   *    хуудасны ГОЛ зорилго.
   */
  const refBase = useMemo(
    () => toPlanRows(rows, n, kind === 'geree' ? 'plan' : 'geree'),
    [rows, n, kind],
  );
  const refByOid = useMemo(() => {
    const m = new Map<number, PlanRow>();
    for (const r of refBase) m.set(r.oid, r);
    return m;
  }, [refBase]);
  const plan = useMemo(() => {
    if (!draft.size && !ham.size && !aDraft.size && !resDraft.size) return base;
    return base.map((r) => {
      const s = draft.get(r.oid);
      const t = ham.get(r.oid);
      const ad = aDraft.get(r.oid);
      const rd = resDraft.get(r.oid);
      if (s === undefined && t === undefined && ad === undefined && rd === undefined) return r;
      return {
        ...r,
        spans: s ?? r.spans,
        deps: t !== undefined ? parseDeps(t) : r.deps,
        /* Бодит огноо · нөөцийн ноорог давхарлана (2026-09-23) */
        aStart: ad ? ad.start : r.aStart,
        aEnd: ad ? ad.end : r.aEnd,
        hun: rd ? rd.hun : r.hun,
        mashin: rd ? rd.mashin : r.mashin,
      };
    });
  }, [base, draft, ham, aDraft, resDraft]);

  /** Ажлын код → мөрийн индекс — уялдааны бодолт, сум, зөрчилд нэг эх сурвалж */
  const byCode = useMemo(() => codeIndex(plan), [plan]);

  /**
   * Нийт ноорог — огноо · уялдаа · сарын обьёмын аль нэгийг нь хөндсөн.
   * ⚠️ Обьёмын ноорог нь `${код}|${блок}` түлхүүртэй тул мөрийн тоотой
   *    шууд нийлэхгүй; хоёрын НИЙЛБЭРийг «хадгалах зүйл байна уу» гэсэн
   *    ганц тоо болгож харуулна.
   */
  const dirtyN = useMemo(
    () => new Set([...draft.keys(), ...ham.keys(), ...aDraft.keys(), ...resDraft.keys()]).size + obDraft.size,
    [draft, ham, aDraft, resDraft, obDraft],
  );

  const now = useMemo(() => {
    const d = new Date();
    /* ⚠️ ЛОКАЛ өдөр (2026-09-17): UTC-ээр авбал УБ-д 00:00–08:00 хооронд «өнөөдөр»
       өчигдөр болж, хоцрогдлын төлөв ба өнөөдрийн шугам нэг хоног хоцордог байв.
       Хуанлийн өдрүүд өөрсдөө UTC шөнө дундаар түлхүүрлэгддэг тул ижил хэлбэрээр. */
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);
  const cov = useMemo(() => coverageOf(plan), [plan]);

  /**
   * САРЫН ХУВАARЬ ХУВЬ — тэр сард төлөвлөсөн обьём нь БАГЦЫН НИЙТ обьёмын
   * хэдэн хувь (2026-09-22, хэрэглэгчийн хүсэлт: «дээд талын огнооны нүдэнд
   * огнооны доод тал хуваарьт төлөвлөсөн обьём нийт багц обьёмын хэдэн хувь»).
   *
   * ⚠️ ЗӨВХӨН НАВЧ МӨР (`r.group` биш). Бүлгийн мөрд `vol` уншигддаг
   *    (`bagtsSheet.ts:752`) тул шүүхгүй бол хүүхдүүдээ ДАХИН тоолж хоёр
   *    дахин хөөрөгдөнө — `ipcLink.ts:81-83`-ийн ижил ⚠️. Хуваарь ба хуваагч
   *    ХОЁУЛАА ижил шүүлттэй байх ёстой, эс бөгөөс харьцаа гажна.
   *
   * ⚠️ `plannedVol` ба `unit` ХЭРЭГЛЭХГҮЙ — `bagtsSheet.ts:44-52` нь
   *    хоёуланг «ЯМАР Ч ТООЦООНД ОРОХГҮЙ, зөвхөн харуулна» гэж бэхэлсэн.
   *    Мөнгөн жин (`vol × unit`) ч хориотой (`bagtsSheet.ts:1075-1077`:
   *    «үнэ өндөртэй ажил руу хазайлгадаг»).
   *
   * ⚠️ Энэ нь БИЕТ ГҮЙЦЭТГЭЛИЙН ЖИН БИШ — нэгж хольсон нийлбэр (м³+м²+ш)
   *    тул зөвхөн төлөвлөгөөний ЦАГ ХУГАЦААНЫ хуваарилалтыг илэрхийлнэ.
   *
   * ⚠️ Ноорог ЗААВАЛ орно (`obDraft` нь `obPlan`-ыг дарна — `obOf`-ийн
   *    дүрэм) — эс бөгөөс зурвасыг чирэхэд тоо хөдөлдөггүй.
   *
   * ⚠️ ХУУРАМЧ ХУВЬ ХЭЗЭЭ Ч ГАРГАХГҮЙ (2026-09-22, хэрэглэгчийн шаардлага:
   *    «сарын задаргаа байхгүй байхад хуурамч хувь битгий гаргаад бай»).
   *    Урьд нь задаргаагүй зурваст мөрийн обьёмыг ХОНОГООР шугаман хуваадаг
   *    байв — тэр нь ТААМАГЛАЛ бөгөөд төлөвлөгчийн хийгээгүй шийдвэрийг
   *    түүний хийсэн юм шиг харуулна. Одоо ЗӨВХӨН бодит задаргаа: задаргаа
   *    нэг ч мөрд байхгүй бол сарын нүдэнд ЮУ Ч гарахгүй.
   *
   * ⚠️ ХУВААГЧ нь БАГЦЫН НИЙТ ОБЬЁМ (2026-09-22, хэрэглэгч: «тухайн сард
   *    төлөвлөсөн бүх ажил багц нийт обьём эзлэх хувь»). Задаргаа оруулсан
   *    хүрээ БИШ — багцын БҮХ навч ажлын `vol` бүх блокоор.
   *
   *    Тиймээс тоо нь «БАГЦЫН хэдэн хувийг тэр сард төлөвлөсөн» гэсэн утга
   *    өгнө: сар бүрийн нийлбэр = төлөвлөлтийн ХАМРАЛТ. Задаргаа хагас
   *    бөглөгдсөн бол нийлбэр 100%-д хүрэхгүй — тэр нь ЗӨВ дохио, дутууг
   *    нуухгүй.
   *
   *    `vol` нь БЛОК ТУС БҮРИЙН нийт обьём — блокуудын нийлбэр БИШ. Үүнийг
   *    цонх өөрөө баталдаг: `balanced(mv, total)`, `total = r.vol` буюу НЭГ
   *    блокийн сарын задаргаа `r.vol`-тай тэнцэхийг шаардана
   *    (`PlanModal`). Тиймээс хуваагч нь `Σ r.vol × (хуваарьтай блокийн тоо)`.
   *
   * ⚠️ ХУВААРЬГҮЙ блок хуваагчид ОРОХГҮЙ: 22 блокоос 3-д л хуваарь байхад
   *    22-оор үржүүлбэл хувь 7 дахин багасч, бүрэн төлөвлөсөн багц ч 14%
   *    гэж харагдана. Хуваарьтай блок нь «төлөвлөх ёстой хүрээ».
   */
  const monPct = useMemo(() => {
    const per = new Map<string, number>();
    let tot = 0;
    for (const r of plan) {
      if (r.group || r.des == null) continue;
      if (r.vol == null || !(r.vol > 0)) continue;
      for (let b = 0; b < n; b += 1) {
        const blok = sc?.bld[b];
        if (!blok) continue;
        /* ⚠️ ХУВААГЧ нь БҮХ хуваарьтай блокоор — задаргаатай эсэхээс
           ҮЛ ХАМААРНА. Эс бөгөөс бөглөөгүй ажил хуваагчаас ч хасагдаж,
           нэг ажил бөглөхөд шууд 100% болж, дутуу нь нуугдана. */
        if (!r.spans[b]) continue;
        tot += r.vol;
        const md = obDraft.get(`${r.des}|${blok}`) ?? obPlan.get(r.des)?.get(blok);
        if (!md || !md.size) continue;
        for (const [k, v] of md) {
          if (v == null) continue;
          per.set(k, (per.get(k) ?? 0) + v);
        }
      }
    }
    return { per, tot };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [plan, n, sc, obDraft, obPlan]);

  /**
   * Сарын шошгын доорх хувийн ТЕКСТ. `null` = ОГТ зурахгүй.
   * ⚠️ `null ≠ 0`: багцад обьём бүртгэгдээгүй (`tot === 0`, ж: `4.2·12F`
   *    мэт `bld` хоосон багц) эсвэл тэр сард хуваарь байхгүй бол хоосон —
   *    «0» гэж зурвал 30px-ийн зурвас бүхэлдээ тэгээр дүүрч шуугиан болно.
   * ⚠️ `pct()` 100-аар ҮРЖҮҮЛДЭГГҮЙ тул энд хэрэглэхгүй; 73px-д «12.4%»
   *    багтахгүй учир БҮХЭЛ хувь, % тэмдэггүй. Бүтэн утга `title`-д.
   */
  const monLab = useCallback((mk: string): { txt: string; tip: string } | null => {
    /* ⚠️ (2026-09-23) ГЭРЭЭ табд ЗУРАХГҮЙ: `monPct` нь `plan`-ын (төлөвлөгөөний)
       мужаар бодогддог тул гэрээний огнооны толгой дор тавибал хоёр эх холилдоно.
       Сарын обьём нь зөвхөн төлөвлөгөөнд хамаарна (`PlanKind` тайлбар). */
    if (kind !== 'plan') return null;
    if (!(monPct.tot > 0)) return null;
    const v = monPct.per.get(mk);
    if (v == null || !(v > 0)) return null;
    const p = (v / monPct.tot) * 100;
    return {
      txt: p < 0.5 ? '·' : String(Math.round(p)),
      tip: tr('{0} — багцын нийт обьёмын {1}%', mk, num(p, 1)),
    };
  }, [monPct, kind]);

  /**
   * Мөр шүүлтүүрт нийцэж байна уу.
   *
   * ⚠️ БҮЛГИЙН мөр ҮРГЭЛЖ гарна: хамралт, огноо бүгд түүний ХҮҮХДҮҮДИЙН
   *    шинж болохоос бүлгийн өөрийнх биш. Бүлгийг шүүж хаявал доорх ажлууд
   *    эцэггүй үлдэж, чирэлтийн хавчилт («хүүхэд эцгийнхээ дотор») суурьгүй
   *    болно.
   *
   * ⚠️ «Түвшин» ба «Хугацаа» сонголт ХАСАГДСАН (2026-09-02, хэрэглэгч).
   */
  const match = useCallback((r: PlanRow) => {
    if (r.group) return true;
    const filled = r.spans.filter(Boolean).length;
    if (filter === 'has' && !filled) return false;
    if (filter === 'none' && filled) return false;
    if (filter === 'partial' && (!filled || filled === r.spans.length)) return false;
    const sp = rowSpan(r);
    if (fYear !== 'all' && (!sp || msToDay(sp.start).slice(0, 4) !== fYear)) return false;
    return true;
  }, [filter, fYear]);

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
   * ХАРАГДАХ МӨРҮҮД — эвхэлт · шүүлт. Зүүн мод ба баруун хуанли ЯГ ЭНЭ
   * жагсаалтаар эгнэнэ.
   *
   * ⚠️ ТЕКСТ ХАЙЛТ ХАСАГДСАН (2026-09-02, хэрэглэгч). Хайлт нь модыг ХАВТГАЙ
   *    жагсаалт болгож, бүлгийн мөрүүдийг хасдаг тул эцгийн муж алдагдаж,
   *    чирэлтийн хавчилт («хүүхэд эцгийнхээ дотор») ажиллах суурьгүй болдог
   *    байв. «Бүлэг» сонголт нь модыг бүтнээр нь үлдээж, тэр үүргийг гүйцэтгэнэ.
   */
  const visible = useMemo(() => {
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
  }, [scoped, collapsed, match]);

  /**
   * ХҮСНЭГТЭД БОДИТООР БАЙГАА ТҮВШНҮҮД — товчийг өгөгдлөөс угсарна.
   *
   * ⚠️ Хатуу 1·2·3·4·5 гэж бичихгүй (`Finance`-ээс ЭНД ЯЛГААТАЙ): санхүүгийн
   *    бүртгэл нь ТОГТМОЛ таван түвшинтэй Excel загвар, харин хуваарийн модны
   *    гүн БАГЦ БҮРД өөр. Багц 1 нь дөрвөн түвшинтэй, зарим багц хоёр л
   *    түвшинтэй — байхгүй түвшний товч гарвал дарахад юу ч болохгүй.
   *
   * ⚠️ Гүн 0-ээс эхэлдэг тул товчны дугаар нь `depth + 1`.
   */
  const lvls = useMemo(() => {
    const s = new Set<number>();
    for (const r of scoped) if (r.group) s.add(r.depth);
    return [...s].sort((a, b) => a - b);
  }, [scoped]);

  /**
   * ТҮВШИН СОНГОХ — `Finance.setLevel`-ийн ижил үүрэг.
   *
   * ⚠️ `n` нь ТОВЧНЫ дугаар (1-ээс эхэлнэ), гүн нь `n - 1`. «Энэ түвшний
   *    гарчгууд ХАРАГДАНА, доорх нь эвхэгдэнэ» гэсэн утгатай: гүн ≥ `n - 1`
   *    бүх БҮЛЭГ мөрийг `collapsed`-д хийнэ.
   *
   * ⚠️ ХАМГИЙН ГҮН түвшин нь бүх мөрийг ДЭЛГЭНЭ (`Finance`-ийн 4·5-тай ижил
   *    зарчим): тэр түвшний бүлгүүд нь навчтай тул эвхэх юм үлдэхгүй.
   *
   * ⚠️ Зөвхөн БҮЛЭГ мөрийг (`r.group`) хийнэ — навч мөрийг эвхэх утгагүй
   *    бөгөөд `visible`-ийн `hideBelow` логик нь тэднийг хардаггүй.
   */
  const setLevel = useCallback((n: number) => {
    setLvl(n);
    const deepest = lvls.length ? lvls[lvls.length - 1] : 0;
    /* Хамгийн гүн түвшин = бүгдийг дэлгэх */
    if (n - 1 >= deepest) { setCollapsed(new Set()); return; }
    const s = new Set<number>();
    for (const r of scoped) if (r.group && r.depth >= n - 1) s.add(r.oid);
    setCollapsed(s);
  }, [scoped, lvls]);

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

  /* ── ХУАНЛИЙН ХҮРЭЭ — доод тал нь 365 хоног, хоёр талдаа СУЛ ЗАЙТАЙ ── */
  const range = useMemo(() => {
    const all: number[] = [];
    for (const r of plan) for (const sp of r.spans) if (sp) { all.push(sp.start, sp.end); }
    const lo = all.length ? Math.min(...all, now) : now;
    const hi = all.length ? Math.max(...all) : now;
    /**
     * ⚠️ СУЛ ЗАЙ (2026-09-02, хэрэглэгч). Урьд нь `from`/`to` нь өгөгдлийн ЯГ
     * захууд байв: хамгийн сүүлийн зурвас хуанлийн баруун ирмэгт наалдаж,
     * түүнийг цааш чирэх, хугацааг нь сунгах, шинэ ажлыг хойшлуулах ЗАЙ огт
     * үлддэггүй байлаа. Одоо урд нь 1 сар, ард нь 3 сар нэмнэ.
     *
     * ⚠️ Сар бүрээр тэгшилнэ: `Date.UTC` нь сарын халилтыг өөрөө зөв бодно
     * (12-р сар + 4 → дараа жилийн 4-р сар). Ард талын `0` дахь өдөр нь
     * «өмнөх сарын сүүлчийн өдөр» тул сарын багана бүтнээрээ дуусна.
     */
    const d = new Date(lo);
    const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
    const e = new Date(hi);
    const padded = Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 4, 0);
    /* ⚠️ Хамгийн багадаа 365 хоног, шаардлагатай бол дараагийн жил рүү */
    const to = Math.max(padded, from + 364 * DAY);
    return { from, to };
  }, [plan, now]);
  /* ⚠️ ЧИРЭЛТИЙН ҮЕД хүрээг ТОГТООНО (2026-09-17): `range` нь ноорогтой `plan`-аас
     бодогддог тул зурвасыг `lo`-оос өмнө татмагц `from` бүтэн сараар эрт болж,
     чирэлтийн `anchor` (ИНДЕКС) нэг сараар зөрж муж сар сараар ухардаг байв. */
  const rangeRef = useRef(range);
  useEffect(() => { if (!drag) rangeRef.current = range; }, [drag, range]);
  const { from, to } = drag ? rangeRef.current : range;
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

  /* ── ЦОНХЛОЛТ (виртуалчлал) ── */
  const [win, setWin] = useState({ from: 0, to: 60 });
  const recalcWin = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    /* ⚠️ Эхний `PL_ROW` нь НААЛДМАЛ толгой (`gSideHead`/`plHead`) — тэр нь
       урсгалд байдаг тул мөр 0-ийн эхлэл нь `PL_ROW` дээр байна. */
    const top = Math.max(0, el.scrollTop - PL_ROW);
    const a = Math.max(0, Math.floor(top / PL_ROW) - PL_OVER);
    const b = Math.ceil((top + el.clientHeight) / PL_ROW) + PL_OVER;
    setWin((w) => (w.from === a && w.to === b ? w : { from: a, to: b }));
  }, []);
  /* Гүйлгэх бүрд биш, кадр тутам НЭГ удаа — гүйлгээ жигд байна. */
  const winTick = useRef(0);
  const onScroll = useCallback(() => {
    if (winTick.current) return;
    winTick.current = requestAnimationFrame(() => {
      winTick.current = 0;
      recalcWin();
    });
  }, [recalcWin]);
  useEffect(() => () => { if (winTick.current) cancelAnimationFrame(winTick.current); }, []);
  /* Мөр/шүүлт/эвхэлт солигдоход цонхыг шинэчилнэ */
  useEffect(() => { recalcWin(); }, [visible.length, recalcWin]);

  /**
   * ⚠️ ЗАСВАРЛАЖ буй мөр цонхны ГАДНА үлдэж болохгүй: чирэлт нь мөрийн DOM
   * дээрх pointer capture-д тулгуурладаг тул зурагдахаа больвол `pointermove`
   * тасарч, чирэлт дундуураа «өлгөгдөнө». Тиймээс сонгосон/чирж буй мөрийг
   * цонхонд хүчээр багтаана.
   */
  const selVis = useMemo(
    () => (sel == null ? -1 : visible.findIndex((r) => r.i === sel)),
    [visible, sel],
  );
  const winFrom = selVis >= 0 ? Math.min(win.from, selVis) : win.from;
  const winTo = selVis >= 0 ? Math.max(win.to, selVis + 1) : win.to;
  const slice = useMemo(
    () => visible.slice(winFrom, winTo).map((r, k) => ({ r, k: winFrom + k })),
    [visible, winFrom, winTo],
  );

  /* ── Ноорог ── */

  /**
   * ГИНЖНИЙ ҮР ДҮНГ НООРОГТ БУУЛГАНА — `propagate` олон мөрийг зэрэг
   * өөрчилдөг тул НЭГ setState дотор бөөнөөр нь бичнэ; мөр бүрд тусдаа
   * бичвэл чирэлтийн кадр бүрд олон рендер гарна.
   * ⚠️ Түлхүүр нь `plan`-ы индекс — `PlanRow.i` нь эх массивын индекстэй
   *    тэнцүү тул `plan[i].oid` үргэлж зөв мөрийг заана.
   */
  /** Ажил+блокийн ноорогийн түлхүүр */
  const obKey = (des: number, blok: string) => `${des}|${blok}`;

  /**
   * Тухайн (ажил · блок)-ийн ХҮЧИНТЭЙ задаргаа — ноорог нь хадгалагдсаныг
   * дарна. Задаргаагүй бол хоосон Map.
   */
  const obOf = useCallback((des: number | null, blok: string): Map<string, number> => {
    if (des == null) return new Map();
    const d = obDraft.get(obKey(des, blok));
    if (d) return d;
    return obPlan.get(des)?.get(blok) ?? new Map();
  }, [obDraft, obPlan]);

  const applyChanges = useCallback((ch0: Map<number, (Span | null)[]>) => {
    if (!ch0.size) return;
    /**
     * ⚠️ БҮЛЭГ НЬ АЖЛААСАА ХАМААРНА (2026-09-06, хэрэглэгчийн заавар).
     *    Ажлын муж өөрчлөгдмөгц өвөг бүлгүүд нь хүүхдүүдийнхээ MIN/MAX-аар
     *    ӨӨРСДӨӨ шинэчлэгдэж, ноорогт орж, хадгалахад бичигдэнэ. Урьд нь
     *    эсрэгээр — бүлгийн муж хүүхдийг хавчдаг байв.
     */
    const ch = rollUpGroups(plan, n, ch0);
    setDraft((d) => {
      const m = new Map(d);
      for (const [i, spans] of ch) {
        /* ⚠️ СЕРВЕРИЙН УТГАТАЙ ИЖИЛ бол ноорогт ОРУУЛАХГҮЙ, байсан бол ХАСНА
           (2026-09-21): урьд нь 1px гулссан товшилт (`onMove` d=0) мөрийг ижил
           утгаар ноорогт оруулж «хадгалаагүй 1» гэж худал тэмдэглэдэг байв;
           мөн чирээд буцаахад ч ноорог үлддэг байв. */
        const orig = base[i]?.spans;
        const same = !!orig && spans.length === orig.length
          && spans.every((sp, b) => sameSpan(sp, orig[b]));
        if (same) m.delete(plan[i].oid);
        else m.set(plan[i].oid, spans);
      }
      /* ⚠️ БҮЛГИЙН МӨР ХҮҮХЭДГҮЙ ҮЛДЭХГҮЙ (2026-09-21). Бүлэг ноорогт ЗӨВХӨН
         `rollUpGroups`-оор ордог (гараар чирэгдэхгүй, popup нь бүлэгт огноо
         тавьдаггүй). Хүүхдээ буцаахад серверийн бүлгийн ӨӨРИЙН огноо
         MIN/MAX-аас зөрдөг бол `rollUpGroups` `moved=false` болж дээрх
         `same` салбарт хүрэхгүй — бүлэг ноорогт «хадгалаагүй 1» гэж үлддэг
         байв. Навч хүүхэд нь нэг ч ноорогт үлдээгүй бүлгийг хасна. */
      for (const [i] of ch) {
        const g = plan[i];
        if (!g.group || !m.has(g.oid)) continue;
        let kid = false;
        for (let k = i + 1; k < plan.length && plan[k].depth > g.depth; k += 1) {
          if (!plan[k].group && m.has(plan[k].oid)) { kid = true; break; }
        }
        if (!kid) m.delete(g.oid);
      }
      return m;
    });
    /**
     * ⚠️ ХУВААРЬ ХӨДӨЛБӨЛ САРЫН БҮРДЭЛ ДАГАНА. ЭНЭ нь огноо өөрчлөгдөх
     * ЦОРЫН ГАНЦ цэг — чирэлт, popup, уялдааны гинж гурвуулаа эндүүр
     * дамждаг тул өөр газарт давтах шаардлагагүй.
     *
     * ⚠️ АВТОМАТ ТАРААЛТ БАЙХГҮЙ (2026-09-06, хэрэглэгч: «автомат обьём
     * тараалт хийж болохгүй, бүгд хоосон байх ёстой»). Шинэ сарууд ХООСОН
     * үлдэж, хүн өөрөө бөглөнө; хэвээр үлдсэн сарын гарын утга хадгалагдана.
     *
     * ⚠️ Обьёмгүй эсвэл кодгүй мөрд юу ч хийхгүй: хадгалах холбоос байхгүй.
     */
    setObDraft((prev) => {
      const next = new Map(prev);
      let touched = false;
      for (const [i, spans] of ch) {
        const r = plan[i];
        if (r.des == null || !(r.vol != null && r.vol > 0)) continue;
        spans.forEach((sp, b) => {
          const was = r.spans[b];
          const same = (!sp && !was)
            || (!!sp && !!was && sp.start === was.start && sp.end === was.end);
          if (same) return;
          const blok = sc?.bld[b];
          if (!blok) return;
          const key = obKey(r.des!, blok);
          const srv = obPlan.get(r.des!)?.get(blok);
          /* Ноорог > хадгалагдсан — хамгийн шинийг суурь болгоно */
          const cur = next.get(key) ?? srv ?? new Map<string, number>();
          /* ⚠️ СЕРВЕРИЙН МУЖ РУУ БУЦСАН БОЛ ЧИРЭЛТИЙН ӨМНӨХ ЗАДАРГААГ СЭРГЭЭНЭ
             (2026-09-21). Урьд нь чирээд буцаахад огнооны ноорог устдаг ч
             (дээрх `same` салбар) `keepMonths`-оор ТАЙРАГДСАН задаргаа
             obDraft-д үлдэж «хадгалаагүй 1» + тэнцээгүй нийлбэр гардаг байв.
             Чирж буй мөр·блок бол `Drag.origMonths` (чирэлтээс өмнөх бүтэн
             хуулбар) — гинжээр буцсан бусад мөрд `keepMonths` хэвээр. */
          const back = sameSpan(sp, base[i]?.spans[b]);
          const orig = drag && drag.oid === r.oid && b === blk ? drag.origMonths : null;
          const val = sp
            ? (back && orig ? new Map(orig) : keepMonths(sp, cur))
            : new Map<string, number>();
          /* ⚠️ СЕРВЕРТЭЙ ИЖИЛ (эсвэл хоёулаа хоосон) задаргааг НООРОГТ
             ҮЛДЭЭХГҮЙ (2026-09-21): задаргаагүй ажлыг чирэхэд
             `keepMonths(sp, ∅) = ∅` obDraft-д орж, «Батлуулах» нь «задаргаа
             тэнцэхгүй» гэж илгээх замыг ТҮГЖДЭГ байв. Бичих зүйлгүй бол
             ноорог ч биш. */
          if (sameMonths(val, srv)) next.delete(key);
          else next.set(key, val);
          touched = true;
        });
      }
      return touched ? next : prev;
    });
  }, [plan, base, n, sc, obPlan, drag, blk]);

  /**
   * Popup-ын «Тавих» — огноо ба/эсвэл уялдааг НЭГ алхамд.
   *
   * ⚠️ Хоёр тусдаа setState хийвэл хоёр дахь нь ХУУЧИН `plan`-ыг харна
   * (React нэг тик дотор batch хийдэг) — уялдаа нь шинэ огноог, огноо нь
   * шинэ уялдааг үл мэдэлцэнэ. Тиймээс нэг газар: уялдааг түр давхарлаад
   * `propagate`-д өгч, огноог ЭНЭ мөрөөс (шинэ уялдаагаар нь дахин бодуулж)
   * гинжээр нь тархаана.
   */
  const applyModal = useCallback((
    oid: number,
    spans: (Span | null)[] | null,
    deps: Dep[] | null,
    months: Map<string, number> | null,
    /**
     * ⚠️ САРЫН ЗАДАРГААГ АЛЬ БЛОКТ тавих (2026-09-21). Урьд нь үргэлж ОДООГИЙН
     *    `blk` байсан тул чирэлтийг цуцлахад (`onClose` → `u.months`) цонх
     *    нээлттэй байхад блок сольсон бол задаргаа БУРУУ блокт сэргээгддэг
     *    байв. Дуудагч заагаагүй бол одоогийнх — popup-ын «Тавих» хэвээр.
     */
    blkAt: number = blk,
  ) => {
    /* ⚠️ `locked` — popup-ийн товчнууд аль хэдийн идэвхгүй ч ЭНЭ нь огноо
       өөрчлөгдөх ЦОРЫН ГАНЦ юүлүүр тул түгжээг энд ч барина. */
    if (busy || locked) return;
    const at = plan.findIndex((x) => x.oid === oid);
    if (at < 0) return;
    let deps2 = deps;
    if (deps2) {
      /* ⚠️ Дугуй/шатлалын хамаарлын СҮҮЛЧИЙН хаалт: нэр дэвшигчдийг UI шүүдэг
         ч энд дахин шалгана — modal нээлттэй байх зуур өөр мөрөнд уялдаа
         нэмэгдсэн байж болно. Няцаах нь: (1) дугуй (reaches), (2) өвөг/удам
         бүлэг (hierRelated) — сүүлийнх нь гинжин эргэлт үүсгэдэг байсныг
         2026-09-03-ны review илрүүлсэн. Чимээгүй хасахгүй, бүхэлд нь няцаана. */
      const me = plan[at].des;
      const badDep = deps2.some((d) => {
        const pi = byCode.get(d.code);
        if (pi != null && hierRelated(plan, at, pi)) return true;
        return me != null && reaches(plan, byCode, me, d.code);
      });
      if (badDep) {
        setErr(tr('Дугуй хамаарал үүсэх тул уялдаа хадгалагдсангүй.'));
        deps2 = null;
      } else {
        /* ⚠️ Танигдаагүй токеныг (гараар зассан «5FF2» г.м.) хэвээр угтуулж
           залгана — харагдахгүй ч ХАДГАЛАЛТАД УСТАХГҮЙ (review-ийн олдвор). */
        const keep = residualDeps(ham.get(oid) ?? rows[at]?.ham ?? null);
        const text = [...keep, formatDeps(deps2)].filter(Boolean).join(',');
        setHam((m) => new Map(m).set(oid, text));
      }
    }
    const rows2 = deps2 ? plan.map((r, i) => (i === at ? { ...r, deps: deps2! } : r)) : plan;
    const overrides = new Map<number, (Span | null)[]>();
    if (spans) overrides.set(at, spans);
    applyChanges(propagate(rows2, n, overrides, deps2 ? [at] : []));
    /**
     * ⚠️ САРЫН ЗАДАРГАА нь `applyChanges`-ийн ДАРАА — тэр нь огноо
     * өөрчлөгдсөн блокуудыг АВТОМАТААР дахин тараадаг тул урьд нь тавьбал
     * гараар оруулсан утга шууд дарагдана. «Бүх блокт» тохиолдолд бусад
     * блок автомат тараалтаа авч, ЭНЭ блок нь гарын утгаа хадгална.
     */
    const des = plan[at].des;
    const blok = sc?.bld[blkAt];
    if (months && des != null && blok) {
      const key = obKey(des, blok);
      /* ⚠️ СЕРВЕРТЭЙ ИЖИЛ задаргааг ноорогт ҮЛДЭЭХГҮЙ (2026-09-21): чирэлтийг
         цуцлахад (`onClose` → `u.months`) задаргаагүй ажилд ХООСОН Map буцаж
         ирдэг байсан нь obDraft-д үлдэж, «Батлуулах»-ыг «1 ажлын задаргаа
         тэнцэхгүй» гэж түгждэг байв. Ижил бол хасна — бичих зүйлгүй. */
      setObDraft((m) => {
        const next = new Map(m);
        if (sameMonths(months, obPlan.get(des)?.get(blok))) next.delete(key);
        else next.set(key, months);
        return next;
      });
    }
  }, [plan, byCode, n, busy, locked, ham, rows, applyChanges, sc, blk, obPlan]);

  /**
   * POPUP-ЫН «Тавих» — БОДИТ ОГНОО (энэ блок) ба НӨӨЦ (мөр) (2026-09-23).
   *
   * ⚠️ `applyModal`-аас ТУСДАА: тэр нь `propagate` (гинж) ба `rollUpGroups`
   *    (бүлэг) руу явдаг; бодит огноо/нөөц тэдгээрт ОРОХГҮЙ — зөвхөн ноорог.
   * ⚠️ СЕРВЕРТЭЙ ИЖИЛ болвол ноорогоос ХАСНА (`applyChanges`-ийн 2026-09-21-ний
   *    дүрэм) — эс бөгөөс буцаасан засвар «хадгалаагүй 1» гэж үлдэнэ.
   * ⚠️ Бүлгийн мөрд ХЭЗЭЭ Ч бичихгүй (`aggExtra`-аар бодогддог); popup нь
   *    бүлэгт талбарыг хаадаг ч энд давхар хаана.
   */
  const applyExtra = useCallback((
    oid: number,
    blkAt: number,
    actual: { start: number | null; end: number | null } | null,
    res: { hun: number | null; mashin: number | null } | null,
  ) => {
    if (busy || locked) return;
    const orig = rows.find((r) => r.oid === oid);
    if (!orig || orig.group) return;
    if (actual && blkAt >= 0 && blkAt < n) {
      setADraft((m) => {
        const next = new Map(m);
        const cur = next.get(oid);
        const start = (cur ? cur.start : orig.aStart).slice();
        const end = (cur ? cur.end : orig.aEnd).slice();
        start[blkAt] = actual.start;
        end[blkAt] = actual.end;
        const same = start.every((v, b) => v === (orig.aStart[b] ?? null))
          && end.every((v, b) => v === (orig.aEnd[b] ?? null));
        if (same) next.delete(oid); else next.set(oid, { start, end });
        return next;
      });
    }
    if (res) {
      setResDraft((m) => {
        const next = new Map(m);
        if ((res.hun ?? null) === (orig.hun ?? null) && (res.mashin ?? null) === (orig.mashin ?? null)) next.delete(oid);
        else next.set(oid, { hun: res.hun, mashin: res.mashin });
        return next;
      });
    }
  }, [busy, locked, rows, n]);

  /**
   * ХАМААРЛЫГ НҮДЭНД ШУУД БИЧИХ (2026-09-15, хэрэглэгчийн хүсэлт:
   * «11FS14 гэж шууд бичиж холбоос хийх боломжтой болгох»).
   *
   * ⚠️ POPUP-ЫГ ОРЛОХГҮЙ, ХАЖУУД НЬ. Popup нь ажлын НЭРЭЭР сонгуулдаг тул
   *    кодоо мэдэхгүй хүнд зайлшгүй; энэ нь кодоо мэддэг хүнд ХУРДАН зам.
   *    MS Project-ийн Predecessors нүд яг ийм ажилладаг.
   *
   * ⚠️ БҮХ ШАЛГУУР `applyModal`-д (дугуй хамаарал, шатлалын зөрчил, танигдаагүй
   *    токен хадгалах) — энд ДАВХАРДУУЛАХГҮЙ. Зөвхөн текстийг `Dep[]` болгож
   *    дамжуулна; буруу бичсэн токеныг `parseDeps` өөрөө алгасана.
   *
   * ⚠️ Хоосон болговол уялдааг ЦЭВЭРЛЭНЭ (`[]`) — `null` нь «бүү хөндөөрэй»
   *    гэсэн утгатай тул ялгах ёстой.
   */
  /**
   * ШУГАМААР ХОЛБОХ ЧИРЭЛТ — бариулаас эхлээд `window` дээр дуусна (2026-09-22).
   *
   * ⚠️ Pointer capture АВАХГҮЙ: зорилтыг `elementFromPoint`-оор олдог тул хулгана
   *    доорх элемент нь ЖИНХЭНЭ мөр байх ёстой (capture авбал үргэлж бариул).
   * ⚠️ Хамаарал нь ЗОРИЛТ мөрд бичигдэнэ (зорилт нь урд ажлаас хамаарна) — сумны
   *    чиглэлтэй ижил: урд ажлын баруун зах → хамаарагчийн зүүн зах.
   * ⚠️ Урд ажилд код (`des`) алга бол холбож болохгүй — уялдаа кодоор бичигддэг.
   * ⚠️ БҮЛЭГ ↔ БҮЛЭГ, БҮЛЭГ ↔ АЖИЛ БҮГД ХОЛБОГДОНО (2026-09-22, хэрэглэгч:
   *    «бүлэг хооронд уялдаа хийх боломжтой, бүгд өөр хоорондоо холбогдох
   *    ёстой»). Хөдөлгүүр аль хэдийн дэмждэг: бүлэг урд ажил бол `effSpan`
   *    (хүүхдийн MIN/MAX), бүлэг хамаарагч бол `propagate` дэд модыг бүхэлд нь
   *    шилжүүлнэ. ЗӨВХӨН өвөг ↔ удам (өөрийн дотоод) холбоос хориотой хэвээр —
   *    `applyModal`-ын `hierRelated` шалгуур (гинжин эргэлт).
   */
  const startLink = (e: PEvt<HTMLElement>, r: PlanRow) => {
    /* ⚠️ (2026-09-23) Уялдаа ЗӨВХӨН төлөвлөгөөнд — гэрээ табд (`kind !== 'plan'`)
       холбохгүй (дээрх `PlanKind` тайлбар: «гэрээ нь гинжээр хөдөлдөггүй»). */
    if (!canEdit || locked || busy || kind !== 'plan') return;
    e.preventDefault();
    e.stopPropagation();
    if (r.des == null) {
      setErr(tr('Энэ ажилд код алга — хамаарлын урд ажил болж чадахгүй.'));
      return;
    }
    const lanes = lanesRef.current;
    if (!lanes) return;
    const pos = (ev: { clientX: number; clientY: number }) => {
      const b = lanes.getBoundingClientRect();
      return { x: ev.clientX - b.left, y: ev.clientY - b.top };
    };
    setSel(r.i);
    setErr('');
    setLink({ i: r.i, ...pos(e) });
    const mv = (ev: PointerEvent) => setLink({ i: r.i, ...pos(ev) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setLink(null);
      if (ev.type === 'pointercancel') return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-row]') as HTMLElement | null;
      let ti = el ? Number(el.dataset.row) : NaN;
      /* ⚠️ (2026-09-23) `elementFromPoint` нь сум (`depHit`), түр шугам, огнооны
         толгой мэт `[data-row]`-гүй элемент дээр тусвал `null` болж чимээгүй
         унадаг байв. Нөөц зам: мөрийн өндөр ТОГТМОЛ (`PL_ROW`) тул Y координатаас
         `visible[k]`-г шууд олно — зурвасын эгнээний дотор л байхад хангалттай. */
      if (!Number.isInteger(ti)) {
        const b = lanes.getBoundingClientRect();
        const x = ev.clientX - b.left;
        const k = Math.floor((ev.clientY - b.top) / PL_ROW);
        if (x >= 0 && x <= b.width && k >= 0 && k < visible.length) ti = visible[k].i;
      }
      /* ⚠️ (2026-09-23) Өөр дээрээ тавибал ЧИМЭЭГҮЙ (санамсаргүй суллалт);
         мөр олдохгүй бол дохио — урьд нь юу ч болоогүй мэт байв. */
      if (ti === r.i) return;
      const t = Number.isInteger(ti) ? plan[ti] : undefined;
      if (!t) { setErr(tr('Хамаарал холбогдсонгүй — хуанлийн мөр (зурвасын эгнээ) дээр тавина уу.')); return; }
      if (hierRelated(plan, ti, r.i)) { setErr(tr('Өөрийн бүлэг/дэд ажилтайгаа холбож болохгүй — гинжин эргэлт үүснэ.')); return; }
      /* ⚠️ Шууд тавихгүй — цонх нээж төрөл (дуусаад / зэрэг эхлэх) ба хоногийг
         асууна (2026-09-22, хэрэглэгч: «чирээд холбосны дараа … цонх гарах ёстой»).
         Аль хэдийн холбогдсон бол цонх нь тэр уялдааг ЗАСНА (давхардуулахгүй). */
      setLinkAsk({ si: r.i, ti });
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const applyHamText = useCallback((oid: number, text: string) => {
    if (busy || locked || !canEdit) return;
    const cur = plan.find((x) => x.oid === oid);
    if (!cur) return;
    const next = parseDeps(text);
    /* Өөрчлөгдөөгүй бол дэмий тархалт хийхгүй — 1,400 мөрийн `propagate`
       нь хямд биш, мөн «хадгалаагүй» тэмдэг худал асахгүй. */
    if (formatDeps(next) === formatDeps(cur.deps)) return;
    setErr('');
    applyModal(oid, null, next, null);
  }, [busy, locked, canEdit, plan, applyModal]);

  /* ── Чирэлт ── */

  /**
   * Мужийг мөрд бичнэ. Дээд бүлэгт муж байвал хүүхдийг ТҮҮН РҮҮ ХАВЧУУЛНА —
   * «бүлгийн цонхны дотор» гэсэн дүрмийг чирэлтийн үедээ шууд сахина.
   */
  const commit = useCallback((oid: number, span: Span | null) => {
    const at = plan.findIndex((x) => x.oid === oid);
    if (at < 0) return;
    const r = plan[at];
    /* ⚠️ ЭЦГИЙН МУЖ РУУ ХАВЧУУЛАХГҮЙ (2026-09-06-нд ЭРГҮҮЛСЭН): ажлын муж
       эрх чөлөөтэй, бүлэг нь `applyChanges` дотор хүүхдүүдээсээ
       (`rollUpGroups`) дагаж сунана. Урьд нь эсрэгээр хавчдаг байв. */
    const next = r.spans.slice();
    next[blk] = span;
    /* ⚠️ ГИНЖ: чирсэн мөрөөс хамаарах бүх ажил (урагш ч, хойш ч) дагана.
       Хамаарал байхгүй бол `propagate` нь зөвхөн энэ мөрийг л буцаана. */
    applyChanges(propagate(plan, n, new Map([[at, next]])));
  }, [plan, blk, n, applyChanges]);

  /**
   * ⚠️ ДАРАХАД ШУУД БИЧИХГҮЙ. Урьд нь `pointerdown` дээр 1 хоногийн муж
   * бичдэг байсан тул хуваарьтай мөрийн ХООСОН хэсэгт санамсаргүй товшиход
   * 137 хоногийн хуваарь чимээгүй устаж, 1 хоног болдог байв. Одоо:
   *   · зөвхөн ТОВШИХ  → мөрийг сонгоно, хуваарь ХӨДЛӨХГҮЙ,
   *   · ЧИРЭХ         → эхний хөдөлгөөнөөс эхлэн муж татагдана,
   *   · хуваарьГҮЙ мөрд товшвол 1 хоногийн муж үүснэ (`onUp`).
   */
  const onDown = (e: PEvt<HTMLElement>, r: PlanRow, mode: DragMode) => {
    /* ⚠️ БИЧИЛТ ЯВЖ БАЙХАД засвар эхлүүлэхгүй (2026-09-03-ны review):
       save() нь ноорогоо түр хугацаанд барьж явдаг тул дундуур нь орсон
       засвар бичигдэлгүйгээр цэвэрлэгдэх байв. */
    /* ⚠️ `locked` — батлагдахыг хүлээж буй илгээлт байхад засвар эхлүүлэхгүй
       (эс бөгөөс хийсэн ажил нь гарах замгүй үлдэнэ). */
    if (!canEdit || locked || busy) return;
    /* ⚠️ БҮЛГИЙН МУЖ ГАРААР ЗАСАГДАХГҮЙ (2026-09-06, хэрэглэгч: «бүлгийн
       range өөрчлөх боломжгүй, ажлын range-ээс хамаарч автоматаар»).
       Мөрийг СОНГОНО — чирэлт эхлэхгүй. */
    if (r.group) { setSel(r.i); return; }
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const k = dayAt(e.clientX);
    lastDay.current = k;
    moved.current = false;
    /* ⚠️ Сарын задаргааг ЧИРЭЛТЭЭС ӨМНӨ хуулна (2026-09-17): чирэлт `applyChanges`-аар
       задаргааг хумьдаг тул буцаахад зөвхөн энэ хуулбар л бүтэн сэргээнэ. */
    const blokName = sc?.bld[blk] ?? '';
    const origMonths = r.des != null && blokName ? new Map(obOf(r.des, blokName)) : null;
    setDrag({ oid: r.oid, mode, anchor: k, orig: r.spans[blk], origMonths });
    setSel(r.i);
  };

  const onMove = (e: PEvt<HTMLElement>) => {
    if (!drag) return;
    const k = dayAt(e.clientX);
    /* ⚠️ ХОНОГ СОЛИГДООГҮЙ бол ЮУ Ч ХИЙХГҮЙ (2026-09-21). Урьд нь
       `&& moved.current` нөхцөлтэй байсан тул ЭХНИЙ `pointermove` (1px
       гулсалт, `k === anchor`) ч `commit`-д хүрч, ижил утгыг ноорогт бичээд
       «товшилт ≠ чирэлт» дүрмийг эвддэг байв: хуваарьтай мөрд зүгээр товшиход
       `moved = true` болж цонх нээгдэж, «хадгалаагүй» тэмдэг асна. Одоо
       `moved` нь ЗӨВХӨН хоног бодитоор солигдоход л `true`. */
    if (k === lastDay.current) return;
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
    const blank = !!drag && !moved.current && drag.mode === 'new' && !drag.orig;
    if (drag && blank) {
      commit(drag.oid, { start: msAt(drag.anchor), end: msAt(drag.anchor) });
    }
    /**
     * ЧИРЭЛТЭЭР ТӨЛӨВЛӨСНИЙ ДАРАА САРЫН ЗАДАРГААГ ИЛ ГАРГАНА (2026-09-06,
     * хэрэглэгч: «зураасаар төлөвлөхөд мөн адил гарах ёстой»).
     *
     * ⚠️ Тараалт нь `applyChanges` дотор аль хэдийн хийгдсэн бөгөөд нийлбэр нь
     *    үргэлж тэнцүү — цонх нь ЗАСАХ боломж, шаардлага БИШ.
     * ⚠️ ЗӨВХӨН хуваарь ӨӨРЧЛӨГДСӨН үед: хуваарьтай мөрд ЗҮГЭЭР товшиход
     *    цонх үсрэн гарвал «товшилт ≠ чирэлт» гэсэн дүрэм эвдэрнэ.
     * ⚠️ ОБЬЁМГҮЙ МӨРД Ч НЭЭНЭ (2026-09-06-нд засав). Урьд нь зөвхөн
     *    обьёмтой мөрд нээдэг байсан тул «Талбайн түр хашаа барих» мэт
     *    обьёмгүй ажлын хуваарийг зөөхөд юу ч гарахгүй, хэрэглэгч «цонх
     *    гарахгүй байна» гэж мэдэгдсэн. Одоо цонх үргэлж гарч, обьёмгүй
     *    бол ШАЛТГААНЫГ нь бичнэ.
     */
    if (drag && (moved.current || blank)) {
      const r = plan.find((x) => x.oid === drag.oid);
      if (r) {
        setModal(r.i);
        /*
         * ⚠️ ЧИРЭЛТЭЭС ӨМНӨХ БАЙДЛЫГ ХАДГАЛНА — цонхыг ЦУЦЛАХАД буцаана
         * (2026-09-08, хэрэглэгчийн мэдээлсэн алдаа: «X дарж цуцлахад
         * хуваарь устахгүй байна»).
         *
         * Чирэлт нь `commit`-оор хуваарийг НООРОГТ АЛЬ ХЭДИЙН бичсэн байдаг
         * бөгөөд цонх нь түүний ДАРАА нээгддэг. Гэтэл цонх нь «Тавих /
         * Хаах» гэсэн баталгааны хэлбэртэй тул хэрэглэгч «Хаах» дарахад
         * чирэлт нь ч цуцлагдана гэж ойлгоно. Одоо яг тэгнэ.
         *
         * ⚠️ Зөвхөн ЭНЭ чирэлтийн блокийг буцаана — цонх нээлттэй байхад
         *    хэрэглэгч блок сольж болох тул бүх мужийг сэргээвэл өөр блокт
         *    хийсэн ажил алга болно.
         */
        undoRef.current = { oid: drag.oid, blk, span: drag.orig, months: drag.origMonths ?? null };
      }
    }
    setDrag(null);
    moved.current = false;
  };

  /*
   * ⚠️ «Мужид жигд хуваарилах» ба «Хуваарь арилгах» товчнууд 2026-09-01-нд
   * ХАСАГДСАН (хэрэглэгчийн шийдвэр). Хоёулаа СОНГОСОН мөр дээр ажилладаг
   * байсан тул «аль мөр сонгогдсон бэ» гэдгийг санах шаардлагатай далд төлөв
   * үүсгэдэг байв. Арилгах нь одоо popup цонхонд («Арилгах») — тэнд ямар ажил,
   * ямар блокийг арилгаж байгаа нь ил харагдана.
   *
   * ⚠️ «Бүх блокт алхмаар тараах» товч 2026-09-02-нд ХАСАГДСАН (хэрэглэгч).
   * Тэр нь ХАРАГДАЖ БУЙ БҮХ мөрийн бүх блокийг нэг товшилтоор дарж бичдэг
   * байсан — шүүлт буруу тавьсан үед 264+ нүд чимээгүй устдаг эрсдэлтэй.
   * Тархаалт нь одоо popup хуанлид ҮЛДСЭН: тэнд НЭГ ажлын хүрээнд, ямар блок,
   * ямар алхмаар тархаж байгаа нь ил бөгөөд баталгаажуулалттай.
   */

  /* ── Хадгалах ── */

  const save = useCallback(async () => {
    if (!sc || !dirtyN || busy) return;
    setBusy(true); setErr(''); setNote('');
    /* ⚠️ Ноорогоо ОДОО барьж авна: async явцад орсон (онолын хувьд —
       оролтууд busy-д хаалттай ч) шинэ засварыг төгсгөлд нь УСТГАХГҮЙН тулд
       зөвхөн эдгээр түлхүүрийг цэвэрлэнэ. */
    const tookD = [...draft.keys()];
    const tookH = [...ham.keys()];
    const tookA = [...aDraft.keys()];
    const tookR = [...resDraft.keys()];
    try {
      const byOid = new Map(rows.map((r) => [r.oid, r]));
      /**
       * ⚠️ НООРОГИЙН OID нь ОДООГИЙН агшинд ОЛДОХГҮЙ БАЙВАЛ (2026-09-08).
       *
       * Батлах урсгалд илгээлтийн `payload` нь ИЛГЭЭСЭН ҮЕИЙН OBJECTID-аар
       * түлхүүрлэгддэг. Хооронд нь «Гүйцэтгэл бөглөх» нийтлэгдвэл архивт
       * бүтэн шинэ хуулбар нэмэгдэж БҮХ OID солигдоно. Тэр үед батлагчийн
       * `rows` ба доорх `fresh` ХОЁУЛАА ШИНЭ агшных тул доорх `rows[0].oid`-ийн
       * харьцуулалт ХУДАЛ гарч, зөөлт огт ажиллахгүй байв: мөр бүр чимээгүй
       * алгасагдаж, `upd` хоосон болж, «Өөрчлөлт олдсонгүй» гэж АМЖИЛТ мэт
       * харагдаад дээрх `useEffect` илгээлтийг `approved` болгодог байв —
       * гүйцэтгэгчийн олон зуун мөр ул мөргүй алга болно.
       *
       * ⚠️ ХУУЧИН OID-оос ажлын мөрийг СЭРГЭЭХ БОЛОМЖГҮЙ: `payload` нь
       *    зөвхөн OID агуулна, (№ + ажлын нэр) нь `rows`-оос л гардаг тул
       *    OID нь тэнд байхгүй бол зөөх түлхүүр алга. Тиймээс ЧИМЭЭГҮЙ
       *    алгасахын оронд ИЛ ТАТГАЛЗАНА — ноорог хэвээр үлдэж, `dirtyN`
       *    тэглэгдэхгүй тул илгээлт `approved` болохгүй.
       */
      const staleN = [...new Set([...draft.keys(), ...ham.keys(), ...aDraft.keys(), ...resDraft.keys()])]
        .filter((oid) => !byOid.has(oid)).length;
      if (staleN) {
        setErr(tr('{0} мөр энэ хуудаснаас олдсонгүй — хуудас хооронд нь шинэчлэгдсэн байна. Хуваарь бичигдсэнгүй; хуудсаа сэргээгээд дахин илгээнэ үү.', num(staleN)));
        return;
      }
      const upd: Record<string, unknown>[] = [];
      for (const [oid, spans] of draft) {
        const orig = byOid.get(oid);
        if (!orig) continue;
        const a: Record<string, unknown> = { [sc.f.oid]: oid };
        let changed = 0;
        spans.forEach((s, b) => {
          /* ⚠️ Талбар байхгүй блок бий (эх хуудасны толгой эвдэрсэн) — тэнд
             бичих газаргүй тул АЛГАСНА, унахгүй. */
          /* ⚠️ ТӨРӨЛ бүрд ӨӨР талбар (2026-09-11). `kind` нь хадгалах
             агшинд уншигдана — ноорог нь солигдоход цэвэрлэгддэг тул
             өөр төрлийн ноорог энд хүрэх боломжгүй. */
          const fStart = kind === 'geree' ? sc.gStart[b] : sc.start[b];
          const fEnd = kind === 'geree' ? sc.gEnd[b] : sc.end[b];
          if (!fStart && !fEnd) return;
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
          const os = kind === 'geree' ? orig.gStart[b] : orig.start[b];
          const oe = kind === 'geree' ? orig.gEnd[b] : orig.end[b];
          if (ns === os && ne === oe) return;
          /*
           * ⚠️ ХАГАС БӨГЛӨСӨН БЛОКИЙГ ХӨНДӨХГҮЙ (2026-09-11-ний аудит, хэмжсэн).
           *    Дээрх тайлбар «зөвхөн өөрчлөгдсөн блокийг» гэж бичсэн ч эх мөрд
           *    ЗӨВХӨН эхлэх (эсвэл зөвхөн дуусах) огноотой блок нь `toPlanRows`-д
           *    `null` муж болдог тул ноорогт `null` хэвээр орж, диффд `null ≠
           *    огноо` гарч, тэр огноо `null` болж БИЧИГДДЭГ байв — хэрэглэгч
           *    өөр блокт зурвас чирсний төлөө. Ноорог `null` БА эх мөр хагас
           *    бол хэрэглэгч ЭНЭ блокийг хөндөөгүй гэсэн үг: алгасна.
           *    Хэрэглэгч блокийг ЗОРИУД цэвэрлэвэл `commit(oid, null)` явдаг ч
           *    тэр нь эх нь БҮТЭН (`os && oe`) байсан үед л ялгаатай — хагас
           *    эхийг цэвэрлэх боломж алдагдана, гэхдээ огноо устахаас дээр.
           */
          if (s === null && (os != null) !== (oe != null)) return;
          if (fStart) a[fStart] = ns;
          if (fEnd) a[fEnd] = ne;
          changed += 1;
        });
        if (changed) upd.push(a);
      }
      /* УЯЛДААНЫ НООРОГ — огнооны бичилттэй нэг мөрөнд нийлүүлнэ. Хоосон
         текст нь `null` болж талбарыг цэвэрлэнэ (хоосон мөр хадгалахгүй). */
      if (sc.f.ham) {
        for (const [oid, text] of ham) {
          const orig = byOid.get(oid);
          if (!orig) continue;
          const v = text.trim() || null;
          if ((orig.ham ?? null) === v) continue;
          const ex = upd.find((u) => u[sc.f.oid] === oid);
          if (ex) ex[sc.f.ham] = v;
          else upd.push({ [sc.f.oid]: oid, [sc.f.ham]: v });
        }
      }
      /**
       * БОДИТ ОГНООНЫ НООРОГ (2026-09-23) — огнооны бичилттэй нэг мөрөнд.
       * ⚠️ ЗӨВХӨН ӨӨРЧЛӨГДСӨН БЛОКИЙГ — `draft`-ын ижил дүрэм; талбаргүй
       *    блокийг алгасна (унахгүй). `kind`-ээс ХАМААРАХГҮЙ: бодит талбар
       *    нэг л байна.
       * ⚠️ Хагас бүртгэл (эхэлсэн, дуусаагүй) ХЭВИЙН — `null`-г ч бичнэ
       *    (цэвэрлэх = «бүртгэлгүй» болгох), гэхдээ зөвхөн зөрсөн үед.
       */
      const upsert = (oid: number): Record<string, unknown> => {
        const ex = upd.find((u) => u[sc.f.oid] === oid);
        if (ex) return ex;
        const a: Record<string, unknown> = { [sc.f.oid]: oid };
        upd.push(a);
        return a;
      };
      for (const [oid, ad] of aDraft) {
        const orig = byOid.get(oid);
        if (!orig) continue;
        let changed = 0;
        const a: Record<string, unknown> = {};
        ad.start.forEach((ns, b) => {
          const ne = ad.end[b] ?? null;
          const os = orig.aStart[b] ?? null;
          const oe = orig.aEnd[b] ?? null;
          if (ns === os && ne === oe) return;
          if (sc.aStart[b]) { a[sc.aStart[b]!] = ns; changed += 1; }
          if (sc.aEnd[b]) { a[sc.aEnd[b]!] = ne; changed += 1; }
        });
        if (changed) Object.assign(upsert(oid), a);
      }
      /* ХҮН ХҮЧ · МАШИН МЕХАНИЗМ — талбар байвал, зөрсөн үед л (2026-09-23) */
      for (const [oid, rd] of resDraft) {
        const orig = byOid.get(oid);
        if (!orig) continue;
        const a: Record<string, unknown> = {};
        if (sc.f.hunHuch && (rd.hun ?? null) !== (orig.hun ?? null)) a[sc.f.hunHuch] = rd.hun;
        if (sc.f.mashin && (rd.mashin ?? null) !== (orig.mashin ?? null)) a[sc.f.mashin] = rd.mashin;
        if (Object.keys(a).length) Object.assign(upsert(oid), a);
      }
      /**
       * ⚠️ ЭРТ БУЦАЛТ нь ЗӨВХӨН огноо·уялдаа·ОБЬЁМ ГУРВУУЛАА хоосон үед
       *    (2026-09-08). Урьд нь зөвхөн `upd.length`-ыг шалгадаг байсан тул
       *    ЗӨВХӨН сарын обьёмоо зассан тохиолдолд («Тавих» дээр огноо
       *    хөндөөгүй) энд буцаж, обьём ХЭЗЭЭ Ч бичигддэггүй байв. Батлах
       *    урсгалд бүр ноцтой: `obDraft` цэвэрлэгдэхгүй тул `dirtyN > 0`
       *    үлдэж, «эх хуудсанд бичигдсэнгүй» гэж алдаа өгөөд илгээлт
       *    `pending` хэвээр гацдаг байлаа.
       * ⚠️ Ноорогийг `tookD`/`tookH`-ээр л цэвэрлэнэ — `new Map()` нь энэ
       *    async явцад орсон ШИНЭ засварыг ч хамт устгана.
       */
      if (!upd.length && !obDraft.size) {
        setDraft((m0) => { const m = new Map(m0); for (const k of tookD) m.delete(k); return m; });
        setHam((m0) => { const m = new Map(m0); for (const k of tookH) m.delete(k); return m; });
        setADraft((m0) => { const m = new Map(m0); for (const k of tookA) m.delete(k); return m; });
        setResDraft((m0) => { const m = new Map(m0); for (const k of tookR) m.delete(k); return m; });
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

      /*
       * ── САРЫН ОБЬЁМ — ТУСДАА ҮЙЛЧИЛГЭЭ ─────────────────────────────
       * ⚠️ Хуваарийн огноо бичигдсэний ДАРАА: задаргаа нь огноон дээр
       *    тогтдог тул огноо нь бичигдээгүй байхад задаргаа үлдвэл хоёр
       *    эх сурвалж зөрнө.
       * ⚠️ Холбоос нь `Des_dugaar` — `ObjectID` БИШ. Тиймээс дээрх агшин
       *    солигдох (`oidMap`) асуудал ЭНД хамаарахгүй: ажлын код нийтлэл
       *    бүрд тогтвортой.
       * ⚠️ Кодгүй мөрд задаргаа хадгалахгүй — холбох зүйлгүй.
       */
      let obN = 0;
      /** Нийлбэр нь нийт обьёмтой тэнцээгүй тул бичигдээгүй (ажил·блок) */
      let unbal = 0;
      if (obDraft.size) {
        const byDes = new Map(base.map((r) => [r.des, r]));
        const all: PlanEdits = { adds: [], updates: [], deletes: [] };
        for (const [key, months] of obDraft) {
          const cut = key.indexOf("|");
          const des = Number(key.slice(0, cut));
          const blok = key.slice(cut + 1);
          const r = byDes.get(des);
          if (!r || !blok) continue;
          /**
           * ⚠️ ТЭНЦЭЭГҮЙ ЗАДАРГААГ БИЧИХГҮЙ (2026-09-08).
           *
           * Popup-аар бөглөхөд `mvOk` шалгуур нийлбэрийг барьдаг ч ГИНЖЭЭР
           * (уялдаа, чирэлт) хуваарь шилжихэд popup нээгддэггүй: `keepMonths`
           * нь шинэ мужид ОРООГҮЙ саруудыг хаядаг тул нийлбэр чимээгүй
           * ЗАДАРНА (1000 → 500). Тэр задаргаа бичигдвэл `planPctFromMonths`
           * нь `done / sumMonths(m)` гэж САРУУДЫН НИЙЛБЭРТ хуваадаг учир
           * тайрагдсан задаргаа өөрийгөө 100% болгож нормчилно — S-муруй,
           * хоцрогдлын дохио бүгд ЧИМЭЭГҮЙ худал болно.
           *
           * ⚠️ ХАГАС задаргаа бичихээс ТАТГАЛЗАНА (`null ≠ 0`): бичихгүй
           *    орхивол хуучин бүтэн задаргаа хэвээр үлдэж, хүн дахин бөглөнө.
           *    Хоосон (бүх сар нь хоосон) задаргаа нь «арилгах» гэсэн
           *    санаатай үйлдэл тул үүнд хамаарахгүй.
           * ⚠️ Обьёмгүй мөрд (`vol` нь null/0) шалгах суурь алга — хэвээр.
           */
          if (months.size && r.vol != null && r.vol > 0 && !balanced(months, r.vol)) {
            unbal += 1;
            continue;
          }
          const meta: WorkMeta = {
            bagts: pkg.key,
            bagtsNer: pkg.label,
            des,
            ajilNo: r.no,
            ajilNer: r.work,
            /* ⚠️ Нэгж нь ЭХ ӨГӨГДӨЛД БАЙХГҮЙ (`negj.ts` нь ажлын нэрнээс
               ТААМАГЛАДАГ бөгөөд «ямар ч тооцоонд хэрэглэхгүй» гэж
               баримтжуулсан). Таамгийг хүлээлгэж өгөх датад бичихгүй —
               жинхэнэ нэгж эх төсвөөс ирэх хүртэл хоосон. */
            negj: '',
            niit: r.vol,
          };
          const prev = obPlan.get(des)?.get(blok) ?? new Map<string, number>();
          const e = buildEdits(meta, blok, months, prev, obOids);
          all.adds.push(...e.adds);
          all.updates.push(...e.updates);
          all.deletes.push(...e.deletes);
        }
        /* ⚠️ ДАВХАРДСАН мөрийн ИЛҮҮДЛИЙГ хамт арилгана (2026-09-08): `dkey`-д
           сангийн unique индекс байхгүй тул зэрэг хадгалалт ижил түлхүүртэй
           хоёр мөр үлдээж чадна. `buildEdits` нь `obOids`-оос ЗӨВХӨН нэг OID
           авдаг тул илүүдэл нь өөрөө хэзээ ч устахгүй. */
        for (const d of obDups) if (!all.deletes.includes(d)) all.deletes.push(d);
        const [a2, u2, d2] = await applyPlanEdits(all);
        obN = a2 + u2 + d2;
      }

      const r = await loadRows(pkg, sc);
      setRows(r.rows);
      setDraft((m0) => { const m = new Map(m0); for (const k of tookD) m.delete(k); return m; });
      setHam((m0) => { const m = new Map(m0); for (const k of tookH) m.delete(k); return m; });
      setADraft((m0) => { const m = new Map(m0); for (const k of tookA) m.delete(k); return m; });
      setResDraft((m0) => { const m = new Map(m0); for (const k of tookR) m.delete(k); return m; });
      /* ⚠️ Обьёмын ноорогийг ЦЭВЭРЛЭЖ, задаргааг СЕРВЕРЭЭС дахин татна —
         бичилтийн дараа ObjectID шинээр үүссэн тул хуучин `obOids` хуучирсан.
         ⚠️ ТЭНЦЭЭГҮЙ задаргааг ҮЛДЭЭНЭ (2026-09-08): бичигдээгүй атлаа
            ноорогоос устгавал хүн юуг дахин бөглөхөө мэдэхгүй үлдэнэ. */
      if (unbal) {
        setObDraft((m0) => {
          const m = new Map<string, Map<string, number>>();
          const byDes = new Map(base.map((r) => [r.des, r]));
          for (const [k, months] of m0) {
            const des = Number(k.slice(0, k.indexOf('|')));
            const v = byDes.get(des)?.vol;
            if (months.size && v != null && v > 0 && !balanced(months, v)) m.set(k, months);
          }
          return m;
        });
      } else {
        setObDraft(new Map());
      }
      try {
        const fresh2 = await loadPkgPlan(pkg.key);
        setObPlan(fresh2.plan);
        setObOids(fresh2.oids);
        setObDups(fresh2.dups);
      } catch { /* задаргаагүйгээр үргэлжилнэ */ }
      setNote(remapped
        ? tr('{0} ажлын хуваарь хадгалагдлаа — хуудас хооронд нь шинэчлэгдсэн тул шинэ агшинд зөөв', num(upd.length))
        : obN
          ? tr('{0} ажлын хуваарь · {1} сарын обьём хадгалагдлаа', num(upd.length), num(obN))
          : tr('{0} ажлын хуваарь хадгалагдлаа', num(upd.length)));
      if (lost) setErr(tr('{0} мөр шинэ агшинд олдсонгүй — тэдгээрийн хуваарь хадгалагдсангүй.', num(lost)));
      /* ⚠️ Тэнцээгүй задаргааг ИЛ хэлнэ — эс бөгөөс «хадгалагдлаа» гэсэн
         мэдэгдэл нь бичигдээгүй обьёмыг далдална. */
      if (unbal) {
        setErr(tr('{0} ажлын сарын задаргааны нийлбэр нийт обьёмтой тэнцэхгүй тул хадгалагдсангүй — хуваарь шилжихэд мужаас гарсан сарууд хасагдсан байна. Тухайн ажлын цонхыг нээж дахин бөглөнө үү.', num(unbal)));
      }
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [sc, draft, ham, aDraft, resDraft, obDraft, obPlan, obOids, obDups, base, dirtyN, busy, pkg, rows, kind]);

  /* ══════════════ БАТЛАХ УРСГАЛ ══════════════
   * ⚠️ Гүйцэтгэгч ЗОХИОНО → «Батлуулах» → батлагч БАТАЛНА → тэр үед л эх
   *    хуудсанд бичигдэнэ. Батлагдтал эх хуваарь ХӨДЛӨХГҮЙ тул тайлан,
   *    хоцрогдлын дохио тогтвортой (2026-09-07, хэрэглэгчийн шийдвэр).
   */

  /**
   * ⚠️ ХОЦОРСОН ХАРИУГ ХАЯНА (2026-09-16 аудит). Урьд нь багц солигдоход
   *    хуучин багцын хүсэлт `pending`-ийг ДАРЖ бичдэг байв: дараалалаас
   *    үсрэхэд эхний багцын хариу зорилтот багцынхыг түрүүлж ирж, jump
   *    эффект «аль хэдийн шийдвэрлэгдсэн» гэсэн ХУДАЛ алдаа өгдөг байлаа.
   *    Одоо хүсэлт бүр дугаартай — сүүлийнхээс бусдын хариу үл тоомсорлогдоно.
   *    Мөн эхлэхэд `flowReady`/`pending`-ийг ЦЭВЭРЛЭНЭ — jump эффект `null`-ийг
   *    «хараахан ачаалаагүй» гэж уншдаг тул зөв хүлээнэ.
   *
   * ⚠️ tezu-bonu салбар ЯГ ИЖИЛ согогийг зэрэг зассан (багцын түлхүүрээр
   *    хаах). Тэндхийн нэмэлт ойлголт: хоцорсон хариу нь зөвхөн худал алдаа
   *    биш — хуанли Б-г, шийдвэрлэх цонх А-г харуулж, «Батлах» дарахад БУРУУ
   *    илгээлт батлагддаг байв. Дугаараар хаах нь түлхүүрээс өргөн (ижил
   *    багцын давхар дуудлагыг ч барина) тул ганц механизм үлдээв.
   */
  const flowSeq = useRef(0);
  /* ⚠️ ОДООГИЙН багц (2026-09-21): батлах гинжний сүүлийн алхам ХУУЧИН
     closure-ийн `refreshFlow`-ыг дууддаг тул багц солигдсоны ДАРАА ч дугаар
     нь хамгийн сүүлийнх болж, өмнөх багцын pending шинэ багцад наалддаг байв.
     Дугаараас гадна түлхүүрийг ч тулгана. */
  const pkgKeyRef = useRef(pkg.key);
  pkgKeyRef.current = pkg.key;
  /** Хүлээгдэж буй илгээлт ба хүснэгтийн бэлэн байдлыг татна */
  const refreshFlow = useCallback(async () => {
    const my = ++flowSeq.current;
    const key = pkg.key;
    const live = () => my === flowSeq.current && key === pkgKeyRef.current;
    setFlowReady(null); setPending(null); setLastDecision(null);
    try {
      const st = await planTableState(status === 'off' || roleForUser(user?.username) === 'super');
      if (!live()) return;
      const ready = st.ok;
      setFlowReady(ready);
      setFlowWhy(ready ? '' : (
        st.why === 'auth'
          ? tr('ArcGIS-д нэвтрээгүй байна — гарч ороод дахин оролдоно уу.')
          : st.why === 'owner'
            ? tr('Батлах хүснэгт БАЙНА, гэвч түүнийг үүсгэсэн хэрэглэгч танигдахгүй байна. AGOL дээр item-ийн эзнийг super админ руу шилжүүлнэ үү.')
            : st.why === 'error'
              ? tr('Порталын хайлт амжилтгүй: {0}', st.detail ?? '')
              : tr('Батлах хүснэгт олдсонгүй — админ (super) нэг удаа нэвтрэхэд автоматаар үүснэ.')
      ));
      const p = ready ? await loadPending(pkg.key) : null;
      if (!live()) return;
      setPending(p);
      /* ⚠️ Хүлээгдэж буй илгээлт БАЙХГҮЙ үед л сүүлийн шийдвэрийг үзүүлнэ —
         хоёуланг зэрэг харуулбал аль нь одоогийн байдал болох нь ойлгомжгүй. */
      const last = ready && !p ? ((await loadHistory(pkg.key, 1))[0] ?? null) : null;
      if (!live()) return;
      setLastDecision(last);
    } catch {
      if (!live()) return;
      setFlowReady(false);
      setFlowWhy(tr('Батлах урсгал уншигдсангүй — сүлжээгээ шалгана уу.'));
      setPending(null);
      setLastDecision(null);
    }
  }, [pkg.key, user, status]);

  useEffect(() => { void refreshFlow(); }, [refreshFlow]);

  /**
   * БАТЛАХ ДАРААЛААЛААС ШИЛЖИЖ ИРСЭН ХҮСЭЛТИЙГ ХЭРЭГЛЭНЭ (2026-09-16).
   *
   * ⚠️ ХОЁР ШАТТАЙ: эхлээд БАГЦЫГ солино, `refreshFlow` (дээрх эффект)
   *    `pending`-ийг хүргэтэл ХҮЛЭЭНЭ, дараа л цонхыг нээнэ. Шууд нээвэл
   *    зурагдалтын `flowBox === 'decide' && pending` хамгаалалт юу ч
   *    зурахгүй — товч дарсан атлаа ЮУ Ч болоогүй мэт харагдана.
   *
   * ⚠️ ХОЦОРСОН ШИЙДВЭР ӨӨРӨӨ ИЛЭРНЭ: `pending` нь өөр `oid`-тай (эсвэл
   *    `null`) бол зуур өөр батлагч шийдсэн гэсэн үг. Дуугүй өнгөрвөл
   *    батлагч хоосон хуудас хараад гайхна.
   *
   * ⚠️ `kind` (Төлөвлөгөө ↔ Гэрээ) табыг АВТОМАТААР СОЛИХГҮЙ — доорх
   *    `decide`-ийн дүрэм: «батлагч юу батлахаа ӨӨРӨӨ мэдэж байх ёстой».
   *    Табын зөрүүний алдаа зориулалтаараа гарна; дараалал нь `kind`-ыг
   *    мөр ба товчны `title`-д бичсэнээр түүнийг гайхалтай биш болгоно.
   */
  useEffect(() => {
    if (!jump) return;
    const target = PKGS.find((p) => p.key === jump.pkgKey);
    /* 1-р шат: багц соль — дараагийн тойрогт `pending` ирнэ */
    if (target && target.key !== pkg.key) { setPkg(target); return; }
    /* ⚠️ Багц СОЛИГДОЖ амжаагүй байж болно (`loadedPkg` биш, `pkg.key`-ээр
       шалгав) — `refreshFlow` ажиллаж дуустал `flowReady` нь `null` хэвээр. */
    if (flowReady === null) return;
    if (pending?.oid === jump.oid) {
      setFlowBox('decide');
      onJumpDone?.();
      return;
    }
    if (!target) {
      setErr(tr('Багцын түлхүүр бүртгэлд алга — «{0}».', jump.pkgKey));
      onJumpDone?.();
      return;
    }
    setErr(tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'));
    onJumpDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, pkg.key, pending, flowReady]);

  /** Ноорогийг илгээлтийн агуулга болгоно — гурван ноорог нэг дор */
  const buildPayload = useCallback((): PlanPayload => {
    const spans: PlanPayload['spans'] = {};
    for (const [oid, arr] of draft) {
      spans[String(oid)] = arr.map((s) => (s ? { start: s.start, end: s.end } : null));
    }
    const deps: PlanPayload['deps'] = {};
    for (const [oid, v] of ham) deps[String(oid)] = v;
    const obyem: PlanPayload['obyem'] = {};
    for (const [k, months] of obDraft) obyem[k] = Object.fromEntries(months);
    /*
     * ⚠️ ИЛГЭЭХ ҮЕИЙН СУУРЬ (2026-09-21) — ноорогтой мөр бүрийн СЕРВЕР дээрх
     *    утга (`base` = `rows`, ноороггүй). Батлагч үүгээр (1) зохиогчийн
     *    ХӨНДӨӨГҮЙ блокийг серверийн одоогийн утгаар үлдээж, (2) илгээснээс
     *    хойш өөрчлөгдсөн блокийг «зэрэгцээ өөрчлөлт» гэж илрүүлнэ. Урьд нь
     *    22 блокийн бүтэн агшин бичигдэж, батлахад хооронд нь батлагдсан
     *    бусдын өөрчлөлт зохиогчийн хуучин утгаар чимээгүй буцдаг байв.
     */
    const baseByOid = new Map(base.map((r) => [r.oid, r]));
    const rowByOid = new Map(rows.map((r) => [r.oid, r]));
    const bSpans: NonNullable<PlanPayload['base']>['spans'] = {};
    for (const oid of draft.keys()) {
      const r = baseByOid.get(oid);
      if (r) bSpans[String(oid)] = r.spans.map((s) => (s ? { start: s.start, end: s.end } : null));
    }
    const bDeps: NonNullable<PlanPayload['base']>['deps'] = {};
    for (const oid of ham.keys()) bDeps[String(oid)] = rowByOid.get(oid)?.ham ?? null;
    const bObyem: NonNullable<PlanPayload['base']>['obyem'] = {};
    for (const k of obDraft.keys()) {
      const cut = k.indexOf('|');
      const prev = obPlan.get(Number(k.slice(0, cut)))?.get(k.slice(cut + 1));
      bObyem[k] = prev ? Object.fromEntries(prev) : {};
    }
    /* Бодит огноо · нөөц + илгээх үеийн суурь (2026-09-23) — ижил зарчим */
    const actual: PlanPayload['actual'] = {};
    const bActual: NonNullable<NonNullable<PlanPayload['base']>['actual']> = {};
    for (const [oid, ad] of aDraft) {
      actual[String(oid)] = { start: ad.start.slice(), end: ad.end.slice() };
      const r = rowByOid.get(oid);
      if (r) bActual[String(oid)] = { start: r.aStart.slice(), end: r.aEnd.slice() };
    }
    const res: PlanPayload['res'] = {};
    const bRes: NonNullable<NonNullable<PlanPayload['base']>['res']> = {};
    for (const [oid, rd] of resDraft) {
      res[String(oid)] = { hun: rd.hun, mashin: rd.mashin };
      const r = rowByOid.get(oid);
      if (r) bRes[String(oid)] = { hun: r.hun, mashin: r.mashin };
    }
    /* ⚠️ `kind` нь ЗААВАЛ — батлагч нь ӨӨРИЙН табаар бичих талбарыг дур
       мэдэн шийдэхээс сэргийлнэ (2026-09-11-ний аудитын S1). */
    return {
      kind, spans, deps, obyem, actual, res,
      base: { spans: bSpans, deps: bDeps, obyem: bObyem, actual: bActual, res: bRes },
    };
  }, [draft, ham, aDraft, resDraft, obDraft, kind, base, rows, obPlan]);

  /** «Батлуулах» — эх хуудсанд ЮУ Ч бичихгүй, зөвхөн хүснэгтэд хүлээнэ */
  const sendForApproval = useCallback(async (userNote: string) => {
    if (!dirtyN || busy) return;
    /* ⚠️ ТЭНЦЭЭГҮЙ сарын задаргаатай илгээхийг ХОРИГЛОНО (2026-09-17): батлах
       үеийн `save` тэдгээрийг алгасдаг (`unbal`) тул ноорог үлдэж батлах гинж
       «эх хуудсанд бичигдсэнгүй» гэж мөнхөд гацдаг байв. */
    {
      let bad = 0;
      /* ⚠️ Ажлын НЭРИЙГ нэрлэнэ (2026-09-21) — «1 ажлын…» гэсэн тоо л хараад
         1,400 мөрөөс алийг нь нээхээ мэдэхгүй байв. */
      const names = new Set<string>();
      for (const r of plan) {
        for (let b = 0; b < (sc?.bld.length ?? 0); b += 1) {
          const blok = sc?.bld[b];
          if (r.des == null || !blok) continue;
          const months = obDraft.get(obKey(r.des, blok));
          if (!months || r.vol == null || !(r.vol > 0)) continue;
          if (months.size && !balanced(months, r.vol)) { bad += 1; names.add(`${r.no} ${r.work}`.trim()); }
          /* ⚠️ ХООСОН ЗАДАРГАА + ХУВААРЬТАЙ блок = 0 ≠ обьём (2026-09-21).
             Гинжээр (уялдаа, чирэлт) ажил БҮТЭН шинэ саруудад шилжвэл
             `keepMonths` бүх сарыг хаяж Map хоосон болдог; урьд нь `months.size
             &&` нөхцөл үүнийг өнгөрөөж, батлахад `buildEdits` тэр ажлын БҮХ
             сарын мөрийг устгадаг байв — задаргаа ул мөргүй алга. Хоосон Map нь
             зөвхөн хуваарь ч ХООСОН (`clear`) үед л хүчинтэй «арилгах» санаа.
             Цонх автоматаар нээхгүй — гинж олон мөр хөндөж болно; алдаанд
             тоог нэрлэнэ.
             ⚠️ ЗӨВХӨН СЕРВЕРТ ЗАДАРГАА БАЙСАН үед (2026-09-21): «buildEdits бүх
             сарыг устгана» гэсэн үндэслэл серверт задаргаа БАЙХГҮЙ ажилд
             хамаарахгүй — устгах зүйл алга. Задаргаагүй обьёмтой ажлыг чирээд
             цонхыг X-ээр хаахад хоосон Map үлдэж, илгээх зам мөнхөд түгжигдэж
             байв (одоо `applyChanges`/`applyModal` ийм ноорогийг хасдаг ч
             хуучин ноорог/өөр замаар орсныг энд давхар хамгаална). */
          else if (!months.size && r.spans[b] && (obPlan.get(r.des)?.get(blok)?.size ?? 0) > 0) {
            bad += 1; names.add(`${r.no} ${r.work}`.trim());
          }
        }
      }
      if (bad > 0) {
        const list = [...names];
        const shown = list.slice(0, 3).join(', ') + (list.length > 3 ? ` (+${num(list.length - 3)})` : '');
        setErr(tr('{0} ажлын сарын задаргаа обьёмтойгоо тэнцэхгүй байна (хоосон задаргаа = 0): {1}. Тухайн ажлын цонхыг нээж сараар тэнцүүлнэ үү.', num(bad), shown));
        return;
      }
    }
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await submitPlan({
        pkgKey: pkg.key,
        pkgGroup: pkg.group,
        author: user?.username ?? '',
        rowCount: dirtyN,
        note: userNote,
        payload: buildPayload(),
      });
      if (!r.ok) { setErr(r.error ?? tr('Илгээгдсэнгүй.')); return; }
      /* ⚠️ Ноорогийг ЦЭВЭРЛЭНЭ: агуулга нь одоо серверт хадгалагдсан тул
         локалд үлдээвэл гүйцэтгэгч дахин илгээх, эсвэл батлагдсаны дараа
         хуучин ноорог дахин бичигдэх эрсдэлтэй. */
      setDraft(new Map()); setHam(new Map()); setObDraft(new Map());
      setADraft(new Map()); setResDraft(new Map());
      setFlowBox(null);
      setNote(tr('Хуваарь батлуулахаар илгээгдлээ — батлагч шийдвэрлэнэ.'));
      await refreshFlow();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [dirtyN, busy, pkg, user, buildPayload, refreshFlow, plan, sc, obDraft, obPlan]);

  /**
   * ИЛГЭЭГДСЭН АГУУЛГЫГ НООРОГТ БУУЛГАХ — урьдчилан харах ба батлах ХОЁУЛАА
   * үүнийг хэрэглэнэ (нэг зам — хоёр салаа бичвэл нэг нь чимээгүй хоцорно).
   */
  /**
   * Илгээлтийн агуулгыг ноорогт буулгана — БАТЛАХЫН ӨМНӨХ алхам.
   *
   * ⚠️ ТӨРӨЛ ЗӨРВӨЛ ТАТГАЛЗАНА (2026-09-11-ний аудитын S1). Илгээлт нь
   *    `kind`-ээ өөртөө агуулдаг; батлагчийн ХАРЖ БУЙ таб түүнээс өөр бол
   *    буулгахгүй, `false` буцаана. Эс бөгөөс `save` нь батлагчийн табаар
   *    талбар сонгодог тул ТӨЛӨВЛӨГӨӨНИЙ санал `…_geree_*` талбарт бичигдэж,
   *    гэрээний лавлагаа чимээгүй эвдэрнэ (эргүүлэх аргагүй).
   * ⚠️ Автоматаар таб СОЛИХГҮЙ: батлагч юу батлахаа ӨӨРӨӨ мэдэж байх ёстой.
   *    Дуудагч тал алдааг ил хэлж, зөв табыг нэрлэнэ.
   */
  /**
   * ⚠️ СУУРЬТАЙ ХАРЬЦУУЛНА (2026-09-21). Илгээлтэд `base` (илгээх үеийн
   *    серверийн утга) байвал:
   *      · зохиогчийн ХӨНДӨӨГҮЙ блок (`spans[b] === base[b]`) → ноорогт
   *        `curRows`-ын ОДООГИЙН утгыг тавина → `save` диффд орохгүй, хооронд
   *        нь батлагдсан бусдын өөрчлөлт хэвээр үлдэнэ;
   *      · зохиогчийн ЗАССАН блок дээр `base[b] !== сервер` → ЗЭРЭГЦЭЭ
   *        ӨӨРЧЛӨЛТ. Сонголт: ЗОГСООНО (`strict`), алгасахгүй — уялдаа ба
   *        сарын обьём нь тэр блокийн огноонд уягдсан тул хагас батлалт нь
   *        задаргааг огноогүй үлдээж, `planPctFromMonths` худал болно.
   *        Батлагч буцааж, зохиогч шинэ суурин дээр дахин илгээнэ.
   *    Суурьгүй (2026-09-21-ээс өмнөх) илгээлт → бүх блок «зассан», хуучин
   *    зан үйл. `strict: false` (зохиогч илгээлтээ ТАТАЖ ноорогт буулгах) —
   *    зөрчилтэй ч буулгана, тоог нь буцаана.
   * ⚠️ `curRows` параметрээр — дуудагч (`decide`) серверээс дөнгөж татсан
   *    мөрийг өгнө; state-ийн `rows` энэ тикт хуучин хэвээр.
   */
  /**
   * ⚠️ `curPlan` параметрээр (2026-09-21) — сарын задаргааны тулгалт ч мөн
   *    СЕРВЕРЭЭС дөнгөж татсан `loadPkgPlan`-тай; state-ийн `obPlan` энэ тикт
   *    хуучин. Дуудагч өгөөгүй бол state-ийнх (татах зам).
   */
  const applyPayloadToDraft = useCallback((
    p: PlanPayload,
    curRows: SheetRow[],
    strict = true,
    curPlan: PkgPlan = obPlan,
  ): { ok: true; conflicts: number } | { ok: false; why: 'kind' | 'conflict'; conflicts: number } => {
    if (p.kind !== kind) return { ok: false, why: 'kind', conflicts: 0 };
    const curPlanRows = toPlanRows(curRows, n, kind);
    const cur = new Map(curPlanRows.map((r) => [r.oid, r]));
    const curSheet = new Map(curRows.map((r) => [r.oid, r]));
    let conflicts = 0;
    const d: Draft = new Map();
    /** Навч мөрийн ноорог — индексээр; бүлгүүдийг үүнээс дахин нэгтгэнэ */
    const ch0 = new Map<number, (Span | null)[]>();
    for (const [k, arr] of Object.entries(p.spans)) {
      const oid = Number(k);
      const bs = p.base?.spans[k];
      const now = cur.get(oid);
      /* ⚠️ БҮЛГИЙН МӨРИЙГ ТУЛГАХГҮЙ (2026-09-21). Бүлэг нь `rollUpGroups`-оор
         хүүхдүүдийнхээ MIN/MAX болж ноорогт (улмаар илгээлтэд) ордог тул өөр
         илгээлт нэг бүлгийн ӨӨР хүүхдийг баталсан бол бүлгийн серверийн утга
         зөрж, «зэрэгцээ өөрчлөлт» гэж ШААРДЛАГАГҮЙ зогсдог байв. Бүлгийг доор
         серверийн ОДООГИЙН хүүхдээс дахин нэгтгэнэ; «N нүд» тоонд оруулахгүй. */
      if (now?.group) continue;
      const v = arr.map((s, b) => {
        const v0 = s ? { start: s.start, end: s.end } : null;
        if (!bs || !now) return v0;
        const b0 = bs[b] ?? null;
        /* Зохиогч хөндөөгүй → серверийн одоогийнх */
        if (sameSpan(v0, b0)) return now.spans[b] ?? null;
        if (!sameSpan(b0, now.spans[b] ?? null)) conflicts += 1;
        return v0;
      });
      d.set(oid, v);
      if (now) ch0.set(now.i, v);
    }
    /* Бүлгүүд — серверийн одоогийн мөр дээр хүүхдийн ноорогоос дахин нэгтгэнэ.
       Хүүхэд нь серверийнхээс хөдлөөгүй бүлэг ноорогт орохгүй (бичигдэхгүй). */
    if (ch0.size) {
      for (const [i, spans] of rollUpGroups(curPlanRows, n, ch0)) {
        const g = curPlanRows[i];
        if (g?.group) d.set(g.oid, spans);
      }
    }
    const hm = new Map<number, string>();
    for (const [k, v] of Object.entries(p.deps)) {
      hm.set(Number(k), v);
      const bd = p.base?.deps;
      if (bd && k in bd) {
        const now = curSheet.get(Number(k));
        if (now && (now.ham ?? null) !== (bd[k] ?? null)) conflicts += 1;
      }
    }
    const ob = new Map<string, Map<string, number>>();
    for (const [k, months] of Object.entries(p.obyem)) {
      ob.set(k, new Map(Object.entries(months)));
      const bo = p.base?.obyem;
      if (bo && k in bo) {
        const cut = k.indexOf('|');
        const now = curPlan.get(Number(k.slice(0, cut)))?.get(k.slice(cut + 1));
        const was = new Map(Object.entries(bo[k]));
        if (!sameMonths(now, was)) conflicts += 1;
      }
    }
    /*
     * БОДИТ ОГНОО · НӨӨЦ (2026-09-23) — `spans`-ын ижил суурь-тулгалт:
     * зохиогч хөндөөгүй блок/талбар → серверийн одоогийнх; зохиогч зассан
     * атлаа суурь ≠ сервер → зэрэгцээ өөрчлөлт. Хуучин илгээлтэд `{}`.
     */
    const ad: ADraft = new Map();
    for (const [k, v] of Object.entries(p.actual)) {
      const oid = Number(k);
      const now = curSheet.get(oid);
      const bs = p.base?.actual?.[k];
      const pick = (arr: (number | null)[], baseArr: (number | null)[] | undefined, nowArr: (number | null)[] | undefined) =>
        Array.from({ length: n }, (_, b) => {
          const v0 = arr[b] ?? null;
          if (!bs || !now || !baseArr || !nowArr) return v0;
          const b0 = baseArr[b] ?? null;
          const n0 = nowArr[b] ?? null;
          if (v0 === b0) return n0;
          if (b0 !== n0) conflicts += 1;
          return v0;
        });
      ad.set(oid, { start: pick(v.start, bs?.start, now?.aStart), end: pick(v.end, bs?.end, now?.aEnd) });
    }
    const rd: ResDraft = new Map();
    for (const [k, v] of Object.entries(p.res)) {
      const oid = Number(k);
      const now = curSheet.get(oid);
      const bs = p.base?.res?.[k];
      const pick = (v0: number | null, b0: number | null | undefined, n0: number | null | undefined) => {
        if (!bs || !now) return v0;
        if (v0 === (b0 ?? null)) return n0 ?? null;
        if ((b0 ?? null) !== (n0 ?? null)) conflicts += 1;
        return v0;
      };
      rd.set(oid, { hun: pick(v.hun, bs?.hun, now?.hun), mashin: pick(v.mashin, bs?.mashin, now?.mashin) });
    }
    if (strict && conflicts) return { ok: false, why: 'conflict', conflicts };
    setDraft(d); setHam(hm); setObDraft(ob);
    setADraft(ad); setResDraft(rd);
    return { ok: true, conflicts };
  }, [kind, n, obPlan]);

  /** Зэрэгцээ өөрчлөлтийн алдааны текст — preview ба decide хоёуланд нэг */
  const conflictMsg = (n0: number) => tr('{0} нүд илгээснээс хойш өөр замаар өөрчлөгдсөн байна (зэрэгцээ өөрчлөлт). Батлах боломжгүй — буцааж, зохиогч шинэ хуваарин дээр дахин илгээнэ.', num(n0));

  /**
   * СЕРВЕРИЙН ОДООГИЙН мөр ба сарын задаргааг татаж state-д тавина (2026-09-21).
   *
   * ⚠️ Урьдчилан харах · батлах · татах ГУРВУУЛАА үүгээр: илгээлтийг state-ийн
   *    ХУУЧИРСАН `rows`/`obPlan`-той биш, дөнгөж татсантай тулгана. Урьд нь
   *    зөвхөн батлах (урьдчилан ХАРААГҮЙ үед) шинээр татдаг байсан тул
   *    `preview` → `decide` замд тулгалт бүхэлдээ АЛГАСАГДАЖ, харснаас
   *    батлах хүртэлх завсрын зэрэгцээ өөрчлөлт чимээгүй дарагддаг байв.
   * ⚠️ Задаргаа татагдахгүй бол state-ийнхаар үргэлжилнэ (мөр нь заавал).
   */
  const refetchServer = useCallback(async (): Promise<{ rows: SheetRow[]; plan: PkgPlan }> => {
    const freshRows = sc ? (await loadRows(pkg, sc)).rows : rows;
    if (sc) setRows(freshRows);
    try {
      const fp = await loadPkgPlan(pkg.key);
      setObPlan(fp.plan); setObOids(fp.oids); setObDups(fp.dups);
      return { rows: freshRows, plan: fp.plan };
    } catch {
      return { rows: freshRows, plan: obPlan };
    }
  }, [sc, pkg, rows, obPlan]);

  /** Урьдчилан харах — саналыг хуанли дээр НООРОГ болгон буулгана */
  const preview = useCallback(async () => {
    if (!pending || busy) return;
    setBusy(true); setErr('');
    try {
      const p = await loadPayload(pending.oid);
      if (!p) { setErr(tr('Илгээлтийн агуулга уншигдсангүй.')); return; }
      /* ⚠️ СЕРВЕРЭЭС ШИНЭЭР (2026-09-21) — `decide`-тэй нэг зам. */
      const srv = await refetchServer();
      /* ⚠️ ТӨРӨЛ ЗӨРВӨЛ буулгахгүй — батлагч өөр табаар харж байна. */
      const ap = applyPayloadToDraft(p, srv.rows, true, srv.plan);
      if (!ap.ok) {
        setErr(ap.why === 'conflict'
          ? conflictMsg(ap.conflicts)
          : p.kind === 'geree'
            ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд дахин үзнэ үү.')
            : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд дахин үзнэ үү.'));
        return;
      }
      setPreviewing(true);
      setFlowBox(null);
      setNote(tr('Санал хуанли дээр урьдчилан харагдаж байна — батлах хүртэл эх хуудсанд бичигдэхгүй.'));
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, busy, applyPayloadToDraft, refetchServer]);

  /**
   * ИЛГЭЭЛТЭЭ ТАТАХ — зохиогч өөрийн хүлээгдэж буй илгээлтийг буцааж авна
   * (2026-09-21). Урьд нь зохиогчид зам байгаагүй: `decidePlan` зохиогч=батлагч
   * буцаалтыг татгалздаг тул алдаатай илгээлт өөр батлагч буцаатал багцыг
   * түгжинэ.
   *
   * ⚠️ Эх хуудсанд ЮУ Ч бичихгүй (`withdrawPlan` зөвхөн төлөв хөдөлгөнө).
   * ⚠️ АГУУЛГЫГ НООРОГТ БУЦААНА: илгээхэд ноорог цэвэрлэгддэг тул татаад
   *    хоосон үлдвэл зохиогч бүх ажлаа дахин хийнэ. Зэрэгцээ өөрчлөлттэй ч
   *    буулгана (`strict: false`) — зохиогч засаж, ШИНЭ суурьтай дахин илгээнэ;
   *    тоог нь мэдэгдэнэ. Төрөл зөрвөл буулгахгүй, зөвхөн хэлнэ.
   */
  const withdraw = useCallback(async () => {
    if (!pending || busy || !isOwnSubmission) return;
    if (!window.confirm(tr('Илгээлтээ татах уу? Батлагч шийдвэрлэхээ болино; агуулга нь ноорог болж буцна.'))) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const oid = pending.oid;
      /* ⚠️ ДАРААЛАЛ (2026-09-21): ЭХЛЭЭД агуулгыг уншиж, төрлийг тулгана, ДАРАА
         нь татна. Урьд нь эхлээд татаад дараа нь уншдаг байсан тул агуулга
         уншигдахгүй эсвэл төрөл зөрвөл илгээлт ТАТАГДЧИХСАН атлаа ноорог хоосон
         үлдэж — зохиогчийн ажил серверээс ч, дэлгэцээс ч алга болдог байв.
         Одоо уншигдахгүй/зөрвөл ТАТАХГҮЙ, илгээлт хүлээгдсэн хэвээр. */
      const p = await loadPayload(oid).catch(() => null);
      if (!p) { setErr(tr('Илгээлтийн агуулга уншигдсангүй — татсангүй, дахин оролдоно уу.')); return; }
      if (p.kind !== kind) {
        setErr(p.kind === 'geree'
          ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд татна уу.')
          : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд татна уу.'));
        return;
      }
      const r = await withdrawPlan({ oid, me: user?.username ?? '' });
      if (!r.ok) { setErr(r.error ?? tr('Илгээлт татагдсангүй.')); return; }
      /* Серверийн одоогийн мөртэй тулгаж буулгана — зөрчлийн тоо бодит байна */
      const srv = await refetchServer();
      const ap = applyPayloadToDraft(p, srv.rows, false, srv.plan);
      const restored = ap.ok;
      const conflicts = ap.conflicts;
      setPreviewing(false);
      setNote(restored
        ? (conflicts
          ? tr('Илгээлт татагдлаа — агуулга ноорог болж буцлаа; {0} нүд хооронд нь өөр замаар өөрчлөгдсөн тул шалгаад дахин илгээнэ үү.', num(conflicts))
          : tr('Илгээлт татагдлаа — агуулга ноорог болж буцлаа, засаад дахин илгээж болно.'))
        : tr('Илгээлт татагдлаа. Агуулга нь ноорогт буусангүй (төрөл зөрсөн эсвэл уншигдсангүй).'));
      await refreshFlow();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [pending, busy, isOwnSubmission, user, kind, applyPayloadToDraft, refetchServer, refreshFlow]);

  /** Урьдчилан харахыг болих — ноорог зүгээр л хаягдана */
  const clearPreview = useCallback(() => {
    setDraft(new Map()); setHam(new Map()); setObDraft(new Map());
    setADraft(new Map()); setResDraft(new Map());
    setPreviewing(false); setNote('');
  }, []);

  /**
   * ШИЙДВЭР — батлах эсвэл буцаах.
   *
   * ⚠️ ДАРААЛАЛ ЧУХАЛ: батлахад эхлээд агуулгыг ноорог болгон буулгаж эх
   *    хуудсанд бичнэ, ЗӨВХӨН амжилттай бичигдсэний дараа мөрийг
   *    `approved` болгоно. Эсрэгээр хийвэл бичилт унасан үед «батлагдсан»
   *    гэж харагдах атлаа хуваарь хуучин хэвээр үлдэнэ.
   */
  const decide = useCallback(async (approve: boolean, reason: string) => {
    if (!pending || busy) return;
    setBusy(true); setErr(''); setNote('');
    try {
      if (approve) {
        /*
         * ⚠️ БАТЛАХААС ӨМНӨ илгээлт ХЭВЭЭР ХҮЛЭЭГДЭЖ БАЙГААГ баталгаажуулна.
         *    Батлах зам нь эх хуудсанд ЭХЛЭЭД бичээд ДАРАА нь төлөвийг
         *    шинэчилдэг тул `decidePlan`-ийн хамгаалалт хэтэрхий оройтоно:
         *    хоёр дахь батлагч хуваарийг бичсэний ДАРАА л татгалзах байлаа.
         */
        /* ⚠️ ЭРХИЙГ ЭХ ХУУДСАНД БИЧИХЭЭС ӨМНӨ (2026-09-17): батлах зам нь `save()`
           → `applyUpdates`-ыг `decidePlan`-ийн хүрээний шалгуураас ӨМНӨ ажиллуулдаг
           тул эрхгүй хүн (товч нуугдсан ч консолоос) эх хуудсанд бичиж чадах байв. */
        if (!canApprove) { setErr(tr('Энэ багцын хуваарийг батлах эрхгүй.')); return; }
        const fresh = await loadPending(pkg.key);
        if (!fresh || fresh.oid !== pending.oid) {
          setErr(tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'));
          setFlowBox(null);
          await refreshFlow();
          return;
        }
        /*
         * ⚠️ ЗОХИОГЧ ӨӨРИЙГӨӨ БАТЛАХГҮЙ — ЭНД, бичихээс ӨМНӨ (2026-09-08).
         *    `decidePlan` дотор ижил дүрэм бий ч тэр нь БИЧИЛТИЙН ДАРАА л
         *    ажилладаг: `setApproving` → `useEffect` → `save()` нь огноо,
         *    уялдаа, сарын обьёмыг эх хуудсанд аль хэдийн бичсэн байна.
         *    Тэгвэл хуваарь батлагдалгүйгээр хөдөлж, илгээлт нь `pending`
         *    хэвээр үлдэж хуудас мөнхөд түгжигдэнэ. `plan` + `planApprove`
         *    хоёр эрхийг нэг хүнд олгосон үед энэ нь цорын ганц хаалт.
         * ⚠️ Харьцуулалт нь СЕРВЕРИЙН `fresh.author`-оор — локал `pending`
         *    хуучирсан байж болно.
         */
        const me = (user?.username ?? '').trim().toLowerCase();
        if (me && me === fresh.author.trim().toLowerCase()) {
          setErr(tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.'));
          setFlowBox(null);
          return;
        }
        /* ⚠️ Урьдчилан харж байгаа бол агуулга аль хэдийн ноорогт байна —
           дахин татвал сүлжээний дэмий дуудлага, мөн батлагчийн харсан
           зурагтай зөрөх (хооронд нь илгээлт солигдвол) эрсдэлтэй. */
        /* ⚠️ 2026-09-21-нд ЭРГҮҮЛСЭН — урьдчилан харсан ч ДАХИН ТАТАЖ ТУЛГАНА.
           Дээрх айдас (илгээлт солигдох) нь `fresh.oid !== pending.oid`-оор
           аль хэдийн баригдсан. Харин `preview` нь ТЭР ҮЕИЙН мөртэй тулгасан
           тул харснаас батлах хүртэлх завсарт өөр замаар орсон өөрчлөлт
           (зэрэгцээ өөрчлөлт, зохиогч хөндөөгүй блокийн шинэ утга) тулгалтыг
           бүхэлд нь АЛГАСДАГ байв — `previewing` нь тулгалтыг тойрох хаалга
           болж байсан. Одоо хоёр зам нэг: сервер → тулгах → зөрвөл зогсох. */
        {
          const p = await loadPayload(pending.oid);
          if (!p) {
            setErr(tr('Илгээлтийн агуулга уншигдсангүй — батлах боломжгүй.'));
            return;
          }
          /* ⚠️ СЕРВЕРИЙН ОДООГИЙН мөрөөр (2026-09-21): зэрэгцээ өөрчлөлтийг
             state-ийн хуучирсан `rows`-той биш, дөнгөж татсантай тулгана.
             Сарын задаргаа ч мөн адил (`refetchServer`). */
          const srv = await refetchServer();
          /* ⚠️ ТӨРӨЛ ЗӨРВӨЛ ЭНД ЗОГСОНО (2026-09-11-ний аудитын S1).
             Ноорогт буулгахгүй тул `save` нь буруу талбарт бичих зам
             бүрмөсөн хаагдана; илгээлт `pending` хэвээр үлдэнэ.
             ⚠️ ЗЭРЭГЦЭЭ ӨӨРЧЛӨЛТ ч мөн ЭНД зогсоно (2026-09-21). */
          const ap = applyPayloadToDraft(p, srv.rows, true, srv.plan);
          if (!ap.ok) {
            setErr(ap.why === 'conflict'
              ? conflictMsg(ap.conflicts)
              : p.kind === 'geree'
                ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд батална уу.')
                : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд батална уу.'));
            return;
          }
        }
        /* ⚠️ `save` нь ноорогийг state-ээс уншдаг тул ЭНД шууд дуудаж
           болохгүй — React төлөв энэ дуудлагын дараа шинэчлэгдэнэ. Батлах
           тэмдгийг тавьж, доорх `useEffect` бичилтийг гүйцэтгэнэ. */
        setApproving(pending.oid);
        setFlowBox(null);
        return;
      }
      const r = await decidePlan({
        oid: pending.oid, approve: false,
        approver: user?.username ?? '', author: pending.author, reason,
      });
      if (!r.ok) { setErr(r.error ?? tr('Шийдвэр хадгалагдсангүй.')); return; }
      /* ⚠️ Урьдчилан харсан ноорогийг ЗААВАЛ цэвэрлэнэ: буцаасан саналын
         агуулга дэлгэц дээр үлдвэл дараагийн «Хадгалах» түүнийг эх хуудсанд
         бичиж, БУЦААСАН хуваарь батлагдсан мэт болно. */
      setDraft(new Map()); setHam(new Map()); setObDraft(new Map());
      setADraft(new Map()); setResDraft(new Map());
      setPreviewing(false);
      setFlowBox(null);
      setNote(tr('Хуваарь буцаагдлаа — гүйцэтгэгч засаад дахин илгээнэ.'));
      await refreshFlow();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, busy, pkg, user, canApprove, applyPayloadToDraft, refetchServer, refreshFlow]);

  /**
   * БАТЛАХЫГ ГҮЙЦЭЭХ — агуулга ноорогт буусны ДАРААХ зурагдалт.
   *
   * ⚠️ Эх хуудсанд бичих ажлыг `save` хийнэ: тэр нь схем, өөрчлөгдсөн блокийг
   *    ялгах, агшин солигдвол мөрийг дахин зураглах бүх нарийн ширийнийг
   *    мэднэ. Энд давхардуулбал хоёр зам салж, нэг нь чимээгүй хоцорно.
   *
   * ⚠️ `save` амжилттай болсныг `dirtyN === 0` -оор мэднэ. Бичилт уначихвал
   *    ноорог үлдэх тул мөрийг `approved` болгохгүй — «батлагдсан» гэж
   *    харагдаад хуваарь нь хуучин хэвээр үлдэхээс сэргийлнэ.
   */
  const savedRef = useRef(false);
  useEffect(() => {
    if (approving == null || busy) return;
    if (!savedRef.current) {
      /*
       * ⚠️ БИЧИХ ЗҮЙЛГҮЙ ИЛГЭЭЛТ — БАТЛАГДСАН гэж хаана (2026-09-08-ны аудит).
       *
       * Урьд нь энд ЗҮГЭЭР Л ГАРДАГ байсан: `save` дуудагдахгүй, `decidePlan`
       * ч дуудагдахгүй, ямар ч мессеж гарахгүй — батлагч товч дарсан атлаа
       * ЮУ Ч болоогүй мэт харагдаж, илгээлт МӨНХӨД «хүлээгдэж буй» хэвээр
       * үлдэнэ. Тэр багцын хуваарь бүхэлдээ түгжигдэнэ (`locked`).
       *
       * Ноорог хоосон байх нь ХҮЧИНТЭЙ тохиолдол: илгээснээс хойш эх хуваарь
       * өөр замаар (өөр батлагдсан илгээлт) ижил утгад хүрсэн бол ялгаа
       * үлдэхгүй. Бичих зүйл байхгүй ч ШИЙДВЭР нь бүртгэгдэх ёстой.
       */
      if (!dirtyN) {
        setApproving(null);
        setPreviewing(false);
        /* ⚠️ `busy` гинж ДУУСТАЛ (2026-09-21): урьд нь энэ алхам busy-гүй тул
           `decidePlan` явж байхад багц солиход өөр багцын pending/шийдвэр
           наалддаг байв. Сонгогчууд `busy`-д түгжигдэнэ. */
        setBusy(true);
        void (async () => {
          try {
            const r = await decidePlan({
              oid: approving, approve: true,
              approver: user?.username ?? '', author: pending?.author ?? '',
            });
            setNote(r.ok
              ? tr('Хуваарь батлагдлаа — эх хуудас аль хэдийн ижил байсан тул өөрчлөлт бичигдсэнгүй.')
              : '');
            if (!r.ok) setErr(r.error ?? tr('Шийдвэр хадгалагдсангүй.'));
            await refreshFlow();
          } finally {
            setBusy(false);
          }
        })();
        return;
      }
      savedRef.current = true;
      void save();
      return;
    }
    savedRef.current = false;
    const oid = approving;
    setApproving(null);
    if (dirtyN) {
      /*
       * ⚠️ БИЧИЛТ УНАСАН. Ноорог хэвээр үлдсэн тул `previewing`-ийг
       *    ТАВИХГҮЙ: тавьчихвал энэ агуулга батлагчийн ӨӨРИЙН засвар мэт
       *    болж, `locked` тайлагдаж, дараа нь батлалгүйгээр эх хуудсанд
       *    бичигдэх зам нээгдэнэ. Урьдчилан харах төлөвт үлдээж, «Харахыг
       *    болих»-оор л цэвэрлүүлнэ.
       *
       * ⚠️ 2026-09-21-нд ЭРГҮҮЛСЭН — `previewing`-ийг ТАВИНА. Дээрх айдас
       *    үндэсгүй: `locked` нь `pending && !approving`-оос л хамаардаг,
       *    `previewing`-ээс биш; «Батлуулах» ч `!pending`-д нуугддаг тул
       *    батлалгүй бичих зам нээгдэхгүй. Харин урьдчилан ХАРАЛГҮЙ баталсан
       *    үед `previewing = false` тул «Цуцлах» (`!locked`) ч, «Харахыг
       *    болих» (`previewing`) ч гарахгүй — ноорог ГАЦДАГ байв. Одоо
       *    «Харахыг болих» гарна; дахин «Шийдвэрлэх» дарвал `decide` нь
       *    `previewing` тул агуулгыг дахин татахгүй, энэ ноорогоо бичнэ.
       */
      setPreviewing(true);
      /* ⚠️ `save()` өөрөө тодорхой шалтгаан (staleN г.м.) бичсэн бол ДАРАХГҮЙ (2026-09-17) */
      setErr((cur) => cur || tr('Хуваарь эх хуудсанд бичигдсэнгүй — илгээлт хүлээгдэж буй хэвээр.'));
      return;
    }
    setPreviewing(false);
    /* ⚠️ `busy` гинж ДУУСТАЛ (2026-09-21) — дээрх салаатай ижил шалтгаан. */
    setBusy(true);
    void (async () => {
      try {
        const r = await decidePlan({
          oid, approve: true,
          approver: user?.username ?? '', author: pending?.author ?? '',
        });
        if (!r.ok) {
          setErr(r.error ?? tr('Хуваарь бичигдсэн ч төлөв шинэчлэгдсэнгүй — дахин оролдоно уу.'));
        } else {
          setNote(tr('Хуваарь батлагдаж эх хуудсанд бичигдлээ.'));
        }
        await refreshFlow();
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approving, busy, dirtyN]);

  /**
   * ⚠️ ХАДГАЛААГҮЙ НООРОГ нь зөвхөн санах ойд байна. Таб хаах, дахин ачаалах,
   * багц солих гурвуулаа түүнийг чимээгүй устгана.
   */
  /* ⚠️ ТАБ ХААХАД анхааруулахгүй: урьдчилан харалтын агуулга нь серверт
     аюулгүй хадгалагдсан илгээлт бөгөөд хуанли дээр зөвхөн үзүүлж байгаа —
     хуудсыг хаахад алдагдах зүйлгүй.
     ⚠️ БАГЦ/ТӨРӨЛ СОЛИХ нь ӨӨР зүйл: тэнд `askSwitch` асуудаг (2026-09-11).
     Хаах нь урьдчилан харалтыг үлдээнэ, солих нь ТАСАЛНА — батлагч юу харж
     байснаа алдаж, илгээлт нь хүлээгдсэн хэвээр үлдэнэ. */
  useEffect(() => {
    if (!dirtyN || previewing) return undefined;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyN, previewing]);

  /**
   * БАГЦ/ТӨРӨЛ СОЛИХ зөвшөөрөл асууна.
   *
   * ⚠️ УРЬДЧИЛАН ХАРЖ БАЙХАД ТУСДАА АСУУЛТ (2026-09-11-ний аудитын S1).
   *    Урьд нь `previewing` үед ШУУД `true` буцаадаг байв — «ноорог нь
   *    батлагчийнх тул хаяхад эвгүй зүйлгүй» гэсэн үндэслэлээр. Гэвч солих
   *    нь урьдчилан харалтыг ТАСАЛДАГ: батлагч юу харж байснаа алдаж,
   *    илгээлт хүлээгдсэн хэвээр үлдэнэ. Тиймээс чимээгүй зөвшөөрөхгүй.
   * ⚠️ Хоёр тохиолдолд ӨӨР асуулт: урьдчилан харалт нь өгөгдөл алдахгүй
   *    (сервер дээр хэвээр), ноорог нь АЛДАГДАНА.
   */
  const askSwitch = useCallback(
    () => {
      if (previewing) {
        return window.confirm(tr('Батлах урьдчилан харалт хаагдана. Илгээлт хүлээгдсэн хэвээр үлдэнэ. Үргэлжлүүлэх үү?'));
      }
      return dirtyN === 0
        || window.confirm(tr('Хадгалаагүй {0} өөрчлөлт байна. Хаяад солих уу?', num(dirtyN)));
    },
    [dirtyN, previewing],
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

  /**
   * ⚠️ БҮЛГИЙН МӨРИЙГ БОДОГДСОН мужаар нь өгнө (2026-09-06). Цонх нь
   *    «Эхлэх/Дуусах» талбар ба «Бүлгийн муж» мөрөндөө `spans`-ыг шууд
   *    уншдаг тул хадгалагдсан ХУУЧИН огноог үзүүлбэл зурвас ба цонх хоёр
   *    өөр тоо хэлнэ. Бичихгүй — бүлэгт огноо засах хаалттай.
   */
  const effRow = useCallback((r: PlanRow): PlanRow => (
    /* ⚠️ Бодит огноо · нөөц ч хүүхдээс (2026-09-23, `aggExtra`) — бичигдэхгүй. */
    r.group ? { ...r, spans: r.spans.map((_, b) => effSpan(plan, r.i, b)), ...aggExtra(plan, r.i, n) } : r
  ), [plan, n]);

  const modalRow = useMemo(() => {
    if (modal == null) return null;
    const r = plan.find((x) => x.i === modal);
    return r ? effRow(r) : null;
  }, [modal, plan, effRow]);
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
      if (plan[k].depth < modalRow.depth && plan[k].group) return effRow(plan[k]);
    }
    return null;
  }, [plan, modalRow, effRow]);

  /**
   * УРЬДЧИЛАГЧИЙН НЭР ДЭВШИГЧИД — кодтой бүх мөр, ХАСАХ нь: (1) өөрөө,
   * (2) энэ ажлаас дам хамаардаг бүх ажил — тэднийг сонговол дугуй хамаарал
   * үүснэ. Урьдчилан шүүснээр хэрэглэгч буруу сонголт хийх БОЛОМЖГҮЙ.
   */
  const depCands = useMemo(() => {
    if (!modalRow) return [];
    const blocked = modalRow.des != null
      ? downstreamCodes(plan, modalRow.des)
      : new Set<number>();
    const out: { code: number; label: string }[] = [];
    for (const r of plan) {
      /* ⚠️ hierRelated нь өөрийг нь БА өвөг/удам бүлгийг хоёуланг таслана —
         тэднээс «хамаарвал» бүлгийн муж өөрөөсөө бодогдож гинжин эргэлт үүснэ */
      if (r.des == null || blocked.has(r.des) || hierRelated(plan, modalRow.i, r.i)) continue;
      out.push({
        code: r.des,
        label: `${r.des} · ${'· '.repeat(r.depth)}${r.work || r.no}`,
      });
    }
    return out;
  }, [plan, modalRow]);

  /* ── УЯЛДААНЫ СУМУУД — идэвхтэй блок дээр, харагдаж буй мөрүүдийн хооронд ──
     ⚠️ Memo БИШ: `visible`, `sel`, `blk`, `xOf` дөрвүүл байнга хөдөлдөг тул
     кэш бараг онохгүй; тооцоо нь уялдаатай мөрийн тоогоор шугаман — хямд. */
  const arrows: { d: string; cls: string; mk: string; key: string; si: number; ti: number }[] = [];
  {
    const visK = new Map<number, number>();
    visible.forEach((r, k) => visK.set(r.i, k));
    for (let k = 0; k < visible.length; k++) {
      const r = visible[k];
      if (!r.deps.length) continue;
      const ts = effSpan(plan, r.i, blk);
      if (!ts) continue;
      const ty = k * PL_ROW + PL_ROW / 2;
      const tx = xOf(ts.start);
      r.deps.forEach((dep, j) => {
        const pi = byCode.get(dep.code);
        if (pi == null || pi === r.i) return;
        const pk = visK.get(pi);
        if (pk == null) return;
        const ps = effSpan(plan, pi, blk);
        if (!ps) return;
        const sy = pk * PL_ROW + PL_ROW / 2;
        let d: string;
        if (dep.type === 'FS') {
          /* Урд ажлын БАРУУН захаас гарч хамаарагчийн ЗҮҮН зах руу — ортогональ.
             Хамаарагч нь урд ажлаасаа ЗҮҮНД байвал (зөрчил/сөрөг хоцролт)
             буцах замаар тойруулна, эс бөгөөс сум зурвасын дундуур шургана. */
          const sx = xOf(ps.end + DAY);
          d = tx >= sx + 10
            ? `M ${sx} ${sy} h 6 V ${ty} H ${tx}`
            : `M ${sx} ${sy} h 8 v ${ty > sy ? 12 : -12} H ${tx - 8} V ${ty} H ${tx}`;
        } else {
          /* SS: хоёулангийн ЗҮҮН захыг холбоно */
          const sx = xOf(ps.start);
          d = `M ${sx} ${sy} H ${Math.min(sx, tx) - 8} V ${ty} H ${tx}`;
        }
        /* ⚠️ ЗӨРЧИЛ = хамаарагч шаардлагаас ӨМНӨ эхэлсэн. ХОЖУУ эхлэх нь
           зөрчил БИШ — хэрэглэгч санаатай хойшлуулсан байж болно (дүрэм биш,
           чадвар). Зөрчлийг ХОРИГЛОХГҮЙ, зөвхөн улаанаар тэмдэглэнэ. */
        const need = dep.type === 'FS' ? ps.end + (1 + dep.lag) * DAY : ps.start + dep.lag * DAY;
        const viol = ts.start < need;
        const hot = sel === r.i || sel === pi;
        /* ⚠️ Хошууны marker нь шугамын `stroke`-оос өнгө АВДАГГҮЙ (SVG-ийн
           marker нь referencing path-аас currentColor өвлөдөггүй) тул ангилал
           бүрд ТУСДАА marker хэрэглэнэ. */
        /* ⚠️ Нэр нь `arrKind` — гадна талын `kind` (хуваарийн ТӨРӨЛ) нь
           огт өөр зүйл; ижил нэр нь уншигчийг төөрөгдүүлнэ. */
        const arrKind = viol ? 2 : hot ? 1 : 0;
        arrows.push({
          d,
          cls: viol ? h.depBad : hot ? h.depHot : h.depLine,
          mk: `url(#hvDepArr${arrKind})`,
          key: `${r.oid}·${j}`,
          si: pi,
          ti: r.i,
        });
      });
    }
  }

  return (
    <div className={`${h.frame} ${wide ? h.frameWide : ''}`}>
      {/* ── БҮХ ХЭРЭГСЭЛ НЭГ МӨРӨНД ──
          ⚠️ 2026-09-02 (хэрэглэгч): урьд нь ГУРВАН зурвас байв — (1) багц
          сонгох толгой, (2) `Section`-ийн «Ажлын хуваарь» гарчиг, (3) шүүлт ба
          хуанлийн хэрэгсэл. Гурвуулаа хүснэгтээс дээш зай иддэг байсан тул
          нэгтгэв. `Section`-д `title`/`note` өгөхөө больсноор түүний толгойн
          мөр огт зурагдахгүй болно.

          ⚠️ Багц сонголт нь `Section`-ЭЭС ГАДНА байх ЁСТОЙ: ачаалж байх ба мөр
          олдоогүй үед `Section` огт зурагддаггүй тул дотор нь байрлуулбал
          хэрэглэгч өөр багц руу шилжих ЗАМГҮЙ гацна. Тиймээс өгөгдлөөс
          хамаарах хэсгүүд нь `sc && rows.length` хамгаалалттай. */}
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

        {sc && rows.length > 0 && (
          <>
            <span className={h.tbSep} aria-hidden />

            {/*
              * ТҮВШНИЙ ЗУРВАС — «Гэрээний бүртгэл» хуудасны ЯГ ИЖИЛ загвар
              * (2026-09-15, хэрэглэгчийн шаардлага). Товч нь «энэ түвшин
              * хүртэл дэлгэ» гэсэн утгатай: 1 дарвал зөвхөн дээд бүлгүүд,
              * хамгийн гүн нь дарвал бүх ажлын мөр харагдана.
              *
              * ⚠️ Товчны ТОО нь БАГЦААС хамаарна (`lvls`) — санхүүгийн
              *    бүртгэл нь тогтмол таван түвшинтэй Excel загвар, харин
              *    хуваарийн мод багц бүрд өөр гүнтэй.
              * ⚠️ Бүлэг огт байхгүй (бүгд навч) бол зурвас гарахгүй.
              */}
            {lvls.length > 1 && (
              <span className={h.lvBar}>
                <span className={h.lvLbl}>{tr('Түвшин')}</span>
                {lvls.map((d) => {
                  const nn = d + 1;
                  const deepest = d === lvls[lvls.length - 1];
                  return (
                    <button
                      key={d}
                      type="button"
                      className={lvl === nn ? h.lvOn : ''}
                      title={deepest
                        ? tr('Бүх ажлын мөрийг дэлгэнэ')
                        : tr('{0}-р түвшин хүртэл дэлгэх', nn)}
                      onClick={() => setLevel(nn)}
                    >{nn}</button>
                  );
                })}
              </span>
            )}

            <span className={h.tbSep} aria-hidden />

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

            {/* ⚠️ Сонголтууд ХОСЛОНО — «бүлэг · 2026» гэж давхарлаж шүүнэ.
                Тиймээс таб биш, тус тусдаа талбар. */}
            {/* ⚠️ БҮЛГЭЭР ШҮҮХ нь бусад шүүлтээс ӨМНӨ ажиллана: эхлээд модны
                салбарыг таслаад, дараа нь түүн дотор жилээр нарийсгана.
                Тиймээс жагсаалтын эхэнд, өргөн талбартай. */}
            <select className={`${h.sel} ${h.selWide}`} value={String(fGrp)} aria-label={tr('Бүлэг')}
              onChange={(e) => setFGrp(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              <option value="all">{tr('Бүлэг: бүгд')}</option>
              {groups.map((g) => <option key={g.i} value={g.i}>{g.label}</option>)}
            </select>

            <select className={h.sel} value={fYear} aria-label={tr('Эхлэх жил')}
              onChange={(e) => setFYear(e.target.value)}>
              <option value="all">{tr('Жил: бүгд')}</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>

            {(filter !== 'all' || fYear !== 'all' || fGrp !== 'all') && (
              <button type="button" className={h.tab}
                onClick={() => { setFilter('all'); setFYear('all'); setFGrp('all'); }}>
                {tr('Цэвэрлэх')}
              </button>
            )}

            {/* ⚠️ `tbSep`-ийн ЗҮҮН тал нь ЖАГСААЛТЫГ (аль мөр гарах вэ), БАРУУН
                тал нь ХАРАГДАЦЫГ (аль блок, ямар масштаб) өөрчилнө. */}
            <span className={h.tbSep} aria-hidden />

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

            {/*
              * ХУВААРИЙН ТӨРӨЛ — «Төлөвлөгөө» / «Гэрээ» (2026-09-11).
              *
              * ⚠️ ЗӨВХӨН ШИЛЖИНЭ (хэрэглэгчийн хүсэлт): эдгээр хоёр товч нь
              *    аль огноог ЗАСАХ вэ гэдгийг л сонгоно — нэг нь идэвхтэй.
              *    Хоёуланг зэрэг харах нь ТУСДАА товч (`Зэрэг`, доор).
              * ⚠️ Хадгалаагүй ноорогтой үед асууна (`askSwitch`) — солиход
              *    ноорог цэвэрлэгддэг тул.
              */}
            <div className={h.tlZoom}>
              {([
                ['plan', tr('Төлөвлөгөө')],
                ['geree', tr('Гэрээ')],
              ] as [PlanKind, string][]).map(([k, label]) => (
                <button key={k} type="button"
                  className={`${h.tlZoomB} ${kind === k ? h.tlZoomOn : ''}`}
                  aria-pressed={kind === k}
                  title={k === 'geree'
                    ? tr('Гэрээнд заасан огноог засна.')
                    : tr('Ажлын төлөвлөсөн огноог засна.')}
                  /* ⚠️ `busy` үед ТҮГЖИНЭ (2026-09-11-ний аудит): `save`-ийн
                     таван await-ийн зуур төрөл солигдвол `[kind]` эффект
                     ноорогийг цэвэрлэж, «хадгалагдлаа» гэсэн мэдэгдэл ӨӨР
                     төрлийн хуанли дээр гарна. Багцын сонгогч аль хэдийн
                     ингэж түгжигддэг. */
                  disabled={busy}
                  onClick={() => { if (kind !== k && askSwitch()) setKind(k); }}>
                  {label}
                </button>
              ))}
            </div>

            {/*
              * ЗЭРЭГ ХАРАХ — нөгөө төрлийн огноог мөр бүрийн ДООД зурвасаар
              * нэмж харуулна (2026-09-11, хэрэглэгч: «тусдаа зэрэг харах гэдэг
              * button нэм»).
              *
              * ⚠️ ЗӨВХӨН ХАРУУЛНА — ноорог, хадгалалт, батлалтад ОГТ хүрэхгүй.
              *    Засагдах нь ҮРГЭЛЖ дээрх сонголт (`kind`). Эс бөгөөс нэг
              *    ноорогт хоёр төрөл холилдоно (2026-09-11-ний аудитын S1).
              * ⚠️ Анхдагчаар УНТРААЛТТАЙ: дангаар нь харах нь үндсэн байдал.
              */}
            <button type="button"
              className={`${h.tlZoomB} ${showRef ? h.tlZoomRef : ''}`}
              aria-pressed={showRef}
              title={showRef
                ? tr('Нөгөө огноог нуана.')
                : (kind === 'geree'
                  ? tr('Төлөвлөсөн огноог мөр бүрийн доор нэмж харуулна.')
                  : tr('Гэрээний огноог мөр бүрийн доор нэмж харуулна.'))}
              onClick={() => setShowRef((v) => !v)}>
              {tr('Зэрэг')}
            </button>

            {/*
              * ТАЙЛБАР — зөвхөн лавлагаа АСААЛТТАЙ үед.
              *
              * ⚠️ Унтраалттай үед тайлбар үлдвэл байхгүй зурвасыг тайлбарлана.
              */}
            {showRef && (
              <span className={h.plRefKey}
                title={kind === 'geree'
                  ? tr('Мөр бүрийн ДООД зурвас нь ТӨЛӨВЛӨСӨН огноо — зөвхөн харуулна, засагдахгүй.')
                  : tr('Мөр бүрийн ДООД зурвас нь ГЭРЭЭНИЙ огноо — зөвхөн харуулна, засагдахгүй.')}>
                <span className={h.plRefSwatch} />
                {kind === 'geree' ? tr('Төлөвлөгөө') : tr('Гэрээ')}
              </span>
            )}
            {/* Бодит мужийн тайлбар (2026-09-23) — талбартай багцад л */}
            {hasActual && (
              <span className={h.plRefKey}
                title={tr('Мөр бүрийн доод захын нарийн зурвас нь БОДИТ эхэлсэн → дууссан огноо (дуусаагүй бол өнөөдөр хүртэл, тасархай). Popup-аас бүртгэнэ; гинж, төлөвлөгөөнд нөлөөлөхгүй.')}>
                <span className={h.plActSwatch} />
                {tr('Бодит')}
              </span>
            )}

            <div className={h.tlZoom}>
              {(['day', 'week', 'month'] as Zoom[]).map((z) => (
                <button key={z} type="button"
                  className={`${h.tlZoomB} ${zoom === z ? h.tlZoomOn : ''}`}
                  onClick={() => setZoom(z)}>
                  {z === 'day' ? tr('хоног') : z === 'week' ? tr('7 хоног') : tr('сар')}
                </button>
              ))}
            </div>
          </>
        )}

        <span className={h.spacer} />


        {sc && rows.length > 0 && (
          <span className={h.flowNote}>
            {msToDay(from)} → {msToDay(to)} · {num(total)} {tr('хоног')}
            {dirtyN ? <> · <b className={h.dirtyTag}>{tr('хадгалаагүй')} {num(dirtyN)}</b></> : null}
          </span>
        )}

        {/* ⚠️ Урьдчилан харж байхад ЭНЭ товч гарахгүй — ноорог нь батлагчийн
            ӨӨРИЙН засвар БИШ, илгээгдсэн санал. Түүнийг «Харахыг болих»-оор
            хаяна, эс бөгөөс хоёр товч ижил зүйл хийж будлиантана. */}
        {canEdit && !previewing && !locked && dirtyN > 0 && (
          /* ⚠️ БУЦААХ ЗАМ. Хуанли дээр чирэх нь маш хурдан үйлдэл тул санамсаргүй
             өөрчлөлт гарна — хадгалахаас өмнө бүгдийг нэг товчоор цуцлах
             боломжгүй бол хэрэглэгч хуудсаа дахин ачаалахаас өөр аргагүй. */
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Хадгалаагүй бүх өөрчлөлтийг хаяна')}
            onClick={() => { setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setADraft(new Map()); setResDraft(new Map()); setNote(''); }}>
            {tr('Цуцлах')} ({num(dirtyN)})
          </button>
        )}
        {/* ⚠️ «Хадгалах» → «Батлуулах» (2026-09-07). Гүйцэтгэгч эх хуудсанд
            ШУУД бичихээ болив: огноо нь батлагдтал хяналтын хүснэгтэд
            хүлээнэ. Батлагдаагүй санал тайлан, хоцрогдлын дохиог хөндөхгүй. */}
        {/* ⚠️ ИЛГЭЭЛТЭЭ ТАТАХ (2026-09-21) — зөвхөн ЗОХИОГЧ, зөвхөн `pending`.
            «Батлуулах» товчны байранд: тэр товч `pending` үед нуугддаг тул
            зохиогч энд өөрийн илгээлтийн хувь заяаг удирдана. */}
        {canEdit && pending && isOwnSubmission && approving == null && (
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Хүлээгдэж буй илгээлтээ буцааж авна — агуулга нь ноорог болж буцна')}
            onClick={() => void withdraw()}>
            {tr('Илгээлтээ татах')}
          </button>
        )}
        {canEdit && !pending && (
          <button
            type="button"
            className={h.save}
            disabled={busy || dirtyN === 0 || flowReady === false}
            title={flowReady === false
              ? (flowWhy || tr('Батлах хүснэгт бэлэн болоогүй — админ нэг удаа нэвтэрч үүсгэнэ.'))
              : tr('Өөрчлөлтийг батлуулахаар илгээнэ — батлагдтал эх хуваарь хөдлөхгүй')}
            /* ⚠️ Цонх нээхэд `err` ЦЭВЭРЛЭНЭ (2026-09-21): FlowBox нь `err`-ийг
               зурдаг тул өмнөх (өөр үйлдлийн) алдаа цонхны дотор «энэ илгээлтийн
               алдаа» мэт гарч байв. */
            onClick={() => { setErr(''); setFlowBox('send'); }}
          >
            {tr('Батлуулах')}{dirtyN ? ` (${dirtyN})` : ''}
          </button>
        )}
        {/* ⚠️ УРЬДЧИЛАН ХАРАХ — батлагч саналыг ХУАНЛИ ДЭЭР харна. Үүнгүй бол
            «14 мөр» гэсэн тоо л хараад хараагүй зүйлээ баталж байна гэсэн үг. */}
        {pending && canApprove && !previewing && (
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Саналыг хуанли дээр буулгаж харна — эх хуудсанд бичигдэхгүй')}
            onClick={() => void preview()}>
            {tr('Урьдчилан харах')}
          </button>
        )}
        {pending && canApprove && previewing && (
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Урьдчилан харахыг болино')}
            onClick={clearPreview}>
            {tr('Харахыг болих')}
          </button>
        )}
        {/* ⚠️ ЗОХИОГЧИД ТОВЧ ИДЭВХГҮЙ (2026-09-08). Дүрэм нь `decide`-д
            (бичихээс өмнө) баригдана; энд идэвхгүй болгох нь ЯАГААД гэдгийг
            ИЛ болгож, батлагдахгүй мэдэж байж дарахаас сэргийлнэ. */}
        {pending && canApprove && (
          <button type="button" className={h.save} disabled={busy || isOwnSubmission}
            title={isOwnSubmission
              ? tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.')
              : undefined}
            /* ⚠️ Нээхэд `err` цэвэрлэнэ (2026-09-21) — «Батлуулах»-тай ижил шалтгаан. */
            onClick={() => { setErr(''); setFlowBox('decide'); }}>
            {tr('Шийдвэрлэх')} ({num(pending.rowCount)})
          </button>
        )}
        {/*
          * ⚠️ ӨӨРИЙН ИЛГЭЭЛТ — товч идэвхгүй болсон ШАЛТГААНЫГ ил хэлнэ
          *    (2026-09-15). Урьд нь зөвхөн `title` (hover) байсан тул
          *    мэдрэгч дэлгэцэд ОГТ хүрэхгүй, хулганатай ч гэсэн саарал
          *    товч ширтсэн хүн «эвдэрсэн» гэж үзнэ. Багц гацсан гэдгийг
          *    ба гарцыг нь хамт хэлнэ.
          */}
        {pending && canApprove && isOwnSubmission && (
          <span className={h.muted} role="status">
            {tr('Энэ илгээлтийг та өөрөө хийсэн тул өөрөө батлах боломжгүй. Өөр батлагч шийдвэрлэнэ — багцад батлагч томилоогүй бол админ «Хуваарийн эрх» хэсгээс нэмнэ.')}
          </span>
        )}
        {/*
          * ⚠️ БАТЛАХ ЭРХГҮЙ бол ШАЛТГААНЫГ ил хэлнэ (2026-09-15, хэрэглэгч:
          *    «төлөвлөөд батлахад батлах идэвхжихгүй байна»).
          *
          *    Урьд нь `canApprove` худал үед «Шийдвэрлэх» товч ОГТ
          *    зурагддаггүй байв — хэрэглэгч «товч идэвхгүй» гэж хардаг ч
          *    үнэндээ товч байхгүй, шалтгаан нь хаана ч бичигдэхгүй.
          *    Одоо хэнд хандахыг нэрлэнэ.
          *
          * ⚠️ `locked` үед «Батлуулах» товч ч алга болдог (дээрх `!pending`)
          *    тул энэ мөр нь тэр хоосон зайг ч тайлбарлана.
          */}
        {pending && !canApprove && (
          <span className={h.muted} role="status">
            {/* ⚠️ ХОЁР ӨӨР шалтгааныг ЯЛГАНА (2026-09-15): «эрх огт байхгүй»
                ба «эрх бий ч ЭНЭ багцад биш» хоёр нь өөр гарцтай. Хоёуланг
                нь «эрхгүй» гэж нэгтгэвэл тусдаа эрх тохируулсан хүн юу дутуу
                байгааг олохгүй. `hasPlanRole` нь багцаас ҮЛ ХАМААРНА. */}
            {hasPlanRole(user?.username, 'approver')
              ? tr('Танд батлах эрх бий, гэхдээ ЭНЭ багцад томилогдоогүй байна. Админ «Хуваарийн эрх» → {0} → «Батлагч» хэсэгт таныг нэмнэ.', pkg.group)
              : tr('Батлах эрхгүй — энэ багцад батлагчаар томилогдсон хүн шийдвэрлэнэ. Админ «Хуваарийн эрх» хэсгээс томилно.')}
          </span>
        )}
      </header>

      {err && <p className={h.err} role="alert">{err}</p>}
      {note && <p className={h.note} role="status" aria-live="polite" onClick={() => setNote('')}>{note}</p>}
      {!canEdit && !canApprove && (
        <p className={h.note}>
          {tr('Танд хуваарь засах эрх алга — зөвхөн харна. Эрхийг админ «Хуваарь төлөвлөх» гэж тусад нь олгоно.')}
        </p>
      )}
      {/* ⚠️ Зөвхөн БАТЛАГЧ эрхтэй хүн шийдвэрлэх зүйлгүй үед ХООСОН хуудас
          хараад «эвдэрсэн юм болов уу» гэж бодохоос сэргийлнэ. */}
      {!canEdit && canApprove && !pending && (
        <p className={h.note}>
          {tr('Танд батлах хуваарь алга — гүйцэтгэгч илгээмэгц энд гарч ирнэ. Хуваарийг та зөвхөн харна, засахгүй.')}
        </p>
      )}
      {/* ⚠️ ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТ — засварыг ТҮГЖИНЭ. Хоёр санал зэрэг
          хүлээвэл батлагч алийг нь батлахаа мэдэхгүй болно. */}
      {pending && (
        <p className={h.note} role="status">
          {tr('{0} мөрийн хуваарь батлагдахыг хүлээж байна ({1} илгээв). Шийдвэр гартал эх хуваарь хөдлөхгүй.',
            num(pending.rowCount), pending.author)}
          {!canApprove && ` ${tr('Батлагч шийдвэрлэсний дараа энэ хуудас дахин нээгдэнэ.')}`}
          {/* ⚠️ Хоёр эрхтэй хүнд ЯАГААД товч идэвхгүйг тайлбарлана (2026-09-08) */}
          {canApprove && isOwnSubmission
            && ` ${tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.')}`}
        </p>
      )}
      {/* ⚠️ БУЦААСАН ШАЛТГААН — гүйцэтгэгчид хүрэх цорын ганц зам. Үүнгүй бол
          «шалтгаан заавал» гэсэн дүрэм утгагүй болно. */}
      {lastDecision && lastDecision.status === PLAN_STATUS.returned && (
        <p className={h.err} role="status">
          {tr('Өмнөх хуваарь буцаагдсан ({0}): {1}',
            lastDecision.approver ?? '', lastDecision.reason ?? '')}
          {' '}
          {tr('Засаад дахин илгээнэ үү.')}
        </p>
      )}
      {/* ⚠️ Зохиогч өөрөө татсан (2026-09-21) — буцаалтаас ялгаатай, шалтгаангүй. */}
      {lastDecision && lastDecision.status === PLAN_STATUS.withdrawn && (
        <p className={h.note} role="status">
          {tr('Өмнөх илгээлтийг зохиогч ({0}) өөрөө татсан — засаад дахин илгээнэ.', lastDecision.author)}
        </p>
      )}
      {lastDecision && lastDecision.status === PLAN_STATUS.approved && (
        <p className={h.note} role="status">
          {tr('Сүүлийн хуваарь батлагдсан ({0}, {1} мөр).',
            lastDecision.approver ?? '', num(lastDecision.rowCount))}
        </p>
      )}
      {/* ⚠️ ЯГ ШАЛТГААНЫГ бичнэ (2026-09-11). Урьд нь гурван огт өөр
          шалтгаан (нэвтрээгүй · эзэн танигдахгүй · порталын алдаа) нэг л
          «олдсонгүй» мессеж болж нийлдэг тул админ юу засахаа мэдэхгүй байв. */}
      {flowReady === false && canEdit && (
        <p className={h.err} role="alert">
          {flowWhy || tr('Батлах хүснэгт олдсонгүй — админ (super) нэг удаа нэвтрэхэд автоматаар үүснэ.')}
          {' '}
          {tr('Түүнийг хүртэл хуваарь илгээх боломжгүй.')}
        </p>
      )}

      {busy && !rows.length ? (
        <Loading label={tr('Хуваарь ачаалж байна…')} />
      ) : !sc || !rows.length ? (
        <Empty label={tr('Энэ багцад мөр олдсонгүй.')} />
      ) : (
        /* ⚠️ `title`/`note` ӨГӨХГҮЙ — толгойн мөр нь дээрх нэгтгэсэн зурваст
           уусав. `Section` нь `title`-гүй үед header-ээ огт зурдаггүй. */
        <Section fill>
          <div className={h.fullBar}>
            <button
              type="button"
              className={wide ? h.fullBtnOn : h.fullBtn}
              onClick={() => setWide((v) => !v)}
              aria-pressed={wide}
              title={wide ? tr('Бүтэн дэлгэцээс гарах (Esc)') : tr('Хуваарийг бүтэн дэлгэцээр')}
            >
              <span aria-hidden>{wide ? '✕' : '⛶'}</span>
              {wide ? tr('Багасгах') : tr('Бүтэн дэлгэц')}
            </button>
            {wide && <span className={h.fullBarNote}>{pkg.label}{dirtyN ? ` · ${tr('өөрчлөлт')} ${dirtyN}` : ''}</span>}
          </div>
          {canEdit && (
            <p className={h.plHint}>
              {tr('Ажлын нэр дээр дарж хуанлиар оруулна · мөрийн ард чирж муж татна · зурвасын голоос чирж зөөнө · ирмэгээс татаж уртасгана')}
            </p>
          )}

          {/* ── НЭГ БҮТЭН ХҮСНЭГТ: зүүн мод + баруун хуанли ── */}
          {visible.length === 0 ? (
            <Empty label={tr('Мөр алга.')} />
          ) : (
            <div className={h.gWrap} ref={scrollRef} onScroll={onScroll}>
              <div className={`${h.gSide} ${cols ? '' : h.gSideNarrow}`}>
                <div className={h.gSideHead} style={{ height: PL_ROW }}>
                  <span className={h.gHeadDes}>{tr('Ажлын код')}</span>
                  <span className={h.gHeadWork}>
                    {tr('Ажил')}
                    {/* ⚠️ Хураах товч нь НЭРИЙН толгойд — нуугдах багануудын өмнө,
                        тэдгээр нуугдсан ч товч байрандаа үлдэнэ (нуугдсан
                        багана дотор байсан бол буцааж нээх аргагүй болно). */}
                    <button type="button" className={h.colsBtn}
                      onClick={() => setCols((v) => !v)}
                      title={cols ? tr('Огноо · нөөцийн баганыг хураах') : tr('Огноо · нөөцийн баганыг нээх')}
                      aria-expanded={cols}>
                      {cols ? '◂' : '▸'}
                    </button>
                  </span>
                  {/*
                    * ДӨРВӨН ОГНООНЫ БАГАНА (2026-09-15, хэрэглэгчийн хүсэлт:
                    * «ажилбар бүрийн ард 4 багана нэмнэ — гэрээний эхлэх,
                    * дуусах, инженерийн эхлэх, дуусах огноо»).
                    *
                    * ⚠️ ХОЁР ТӨРЛИЙГ ЗЭРЭГ: хуанли нь ЗӨВХӨН идэвхтэй табын
                    *    огноог зурдаг тул гэрээ ба төлөвлөгөөг зэрэгцүүлж
                    *    харахын тулд табаа солих шаардлагатай байв. Эдгээр
                    *    багана нь хоёуланг нь НЭГ мөрөнд гаргана.
                    *
                    * ⚠️ ЗАСАГДАХГҮЙ — зөвхөн УНШИНА. Огноо засах цорын ганц
                    *    зам нь хуанли дээр чирэх (`onDown`) ба popup хэвээр:
                    *    хоёр өөр засварын зам үүсвэл аль нь үнэн болох нь
                    *    бүрхэг болно.
                    */}
                  <span className={h.gHeadDate}>{tr('Гэрээ эхлэх')}</span>
                  <span className={h.gHeadDate}>{tr('Гэрээ дуусах')}</span>
                  {/* ⚠️ ХОНОГ нь ТУСДАА БАГАНА (2026-09-15, хэрэглэгч).
                      Огнооны нүдэнд шигтгэвэл тэр нүд хоёр утга агуулж,
                      эрэмбэлэх · хуулах · нүдээр гүйлгэх бүгд хүндэрнэ. */}
                  <span className={h.gHeadDays}>{tr('Хоног')}</span>
                  {/* ⚠️ «Төлөвлөгөөт» (2026-09-23, хэрэглэгч) — хажууд «Бодит» багана
                      нэмэгдсэн тул «Төлөвлөгөө эхлэх» гэвэл аль нь төлөвлөгөө, аль нь
                      баримт болох нь бүрхэг. */}
                  <span className={h.gHeadDate}>{tr('Төлөвлөгөөт эхлэх')}</span>
                  <span className={h.gHeadDate}>{tr('Төлөвлөгөөт дуусах')}</span>
                  <span className={h.gHeadDays}>{tr('Хоног')}</span>
                  {/*
                    * БОДИТ ЭХЭЛСЭН / ДУУССАН (2026-09-23) — идэвхтэй блокийн (`blk`)
                    * утга; popup-аас засагдана, энд зөвхөн харуулна (дээрх ⚠️-тэй
                    * ижил: засварын нэг л зам). Бүлгийн мөрд хүүхдийн MIN/MAX.
                    * ⚠️ Талбар байхгүй багцад багана ОГТ гарахгүй (`hasActual`).
                    */}
                  {hasActual && <span className={h.gHeadDate}>{tr('Бодит эхэлсэн')}</span>}
                  {hasActual && <span className={h.gHeadDate}>{tr('Бодит дууссан')}</span>}
                  {/* ХҮН ХҮЧ · МАШИН МЕХАНИЗМ (2026-09-23) — мөрийн нөөц; бүлэгт нийлбэр. */}
                  {hasRes && <span className={h.gHeadRes} title={tr('Хүн хүч')}>{tr('Хүн')}</span>}
                  {hasRes && <span className={h.gHeadRes} title={tr('Машин механизм')}>{tr('Техник')}</span>}
                  {/* ⚠️ ЖИШЭЭГ ТОЛГОЙД (2026-09-15): нүдний `placeholder`-т
                      тавьбал 1,400 хоосон мөр бүгд «11FS14» гэж харагдаж,
                      бодит утга мэт уншигдана. Толгойд нэг удаа бичих нь
                      бичиглэлийг заах ба хүснэгтийг цэвэр үлдээнэ. */}
                  <span className={h.gHeadHam} title={tr('Жишээ: 11FS14 — 11-р ажил дууссанаас 14 хоногийн дараа. Олныг таслалаар: 11FS,22SS-5')}>
                    {tr('Хамаарал')} <i className={h.gHeadHint}>11FS14</i>
                  </span>
                </div>
                {/* ⚠️ ЗАЙ БАРИГЧ: зүүн мөрүүд УРСГАЛД байдаг тул зурагдаагүй
                    мөрүүдийн өндрийг орлуулахгүй бол гүйлтийн урт агшиж, зүүн
                    жагсаалт ба баруун зурвас хоорондоо гулсана. */}
                {winFrom > 0 && <div aria-hidden style={{ height: winFrom * PL_ROW }} />}
                {slice.map(({ r }) => {
                  /* Бүлгийн бодит огноо · нөөц хүүхдээс (2026-09-23, `aggExtra`) */
                  const x = r.group ? effRow(r) : r;
                  return (
                  <TaskRow
                    key={r.oid}
                    r={r}
                    on={sel === r.i}
                    /* ⚠️ УЯЛДААНЫ ноорог ч «хадгалаагүй» тэмдэг авна — эс
                       бөгөөс зөвхөн уялдаа нь өөрчлөгдсөн мөр цэвэр мэт
                       харагдаж, юу хадгалагдахыг тоолж болохгүй байв.
                       Бодит огноо · нөөцийн ноорог мөн адил (2026-09-23). */
                    dirty={draft.has(r.oid) || ham.has(r.oid) || aDraft.has(r.oid) || resDraft.has(r.oid)}
                    hasActual={hasActual}
                    hasRes={hasRes}
                    aStart={x.aStart?.[blk] ?? null}
                    aEnd={x.aEnd?.[blk] ?? null}
                    hun={x.hun ?? null}
                    mashin={x.mashin ?? null}
                    collapsed={collapsed.has(r.oid)}
                    onToggle={() => {
                      /* ⚠️ ГАРААР эвхэхэд түвшний товч ТОДРОХГҮЙ болно
                         (`lvl = 0`) — дэлгэц дээрх байдалтай зөрчилдсөн
                         тодруулга үлдэх ёсгүй (`Finance.lvOn`-ийн ижил дүрэм). */
                      setLvl(0);
                      setCollapsed((s) => {
                        const m = new Set(s);
                        if (m.has(r.oid)) m.delete(r.oid); else m.add(r.oid);
                        return m;
                      });
                    }}
                    onPick={() => { setSel(r.i); setModal(r.i); }}
                    /* ⚠️ ХОЁР ТӨРЛИЙН огноог зэрэг өгнө. `r` нь ИДЭВХТЭЙ
                       табынх, `refByOid` нь НӨГӨӨ табынх — аль нь гэрээ, аль
                       нь төлөвлөгөө болохыг `kind`-ээр шийднэ. */
                    geree={kind === 'geree' ? rowSpan(r) : spanOfRef(refByOid, r.oid)}
                    tolov={kind === 'geree' ? spanOfRef(refByOid, r.oid) : rowSpan(r)}
                    /* ⚠️ Уялдааг нүдэнд ШУУД бичих зам (`HamCell`). Түгжээтэй
                       (батлагдахыг хүлээж буй илгээлт) үед ч засагдахгүй —
                       `applyHamText` дотор `locked` шалгагдана. */
                    canEdit={canEdit && !locked}
                    onHamText={applyHamText}
                  />
                  );
                })}
                {winTo < visible.length && (
                  <div aria-hidden style={{ height: (visible.length - winTo) * PL_ROW }} />
                )}
              </div>

              <div className={h.gRight}>
                <div className={h.gTrack} style={{ width: W }} ref={trackRef}>
                  {/* ⚠️ ЧИРЖ ГҮЙЛГЭХ (2026-09-17, хэрэглэгч: «зүүн баруун гүйлт ажиллахгүй»):
                      сарын толгойн зурвас дээр чирвэл хуанли хэвтээ гүйнэ — гүйлтийн
                      зурвас нарийн, харагдахгүй байсан. Ажлын мөр дээр чирэх нь
                      урьдын адил зурвас үүсгэнэ/зөөнө. */}
                  <div className={h.plHead}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      const el = scrollRef.current; if (!el) return;
                      const x0 = e.clientX, s0 = el.scrollLeft;
                      const t = e.currentTarget;
                      t.setPointerCapture?.(e.pointerId);
                      const mv = (ev: PointerEvent) => { el.scrollLeft = s0 - (ev.clientX - x0); };
                      const up = () => { t.removeEventListener('pointermove', mv); t.removeEventListener('pointerup', up); t.removeEventListener('pointercancel', up); };
                      t.addEventListener('pointermove', mv); t.addEventListener('pointerup', up); t.addEventListener('pointercancel', up);
                    }}>
                    {months.map((m) => {
                      const pc = monLab(m.lab);
                      return (
                        <span key={m.at} className={h.plMonth} style={{ left: xOf(m.at) }}
                          title={pc?.tip}>
                          {m.lab}
                          {pc && <b className={h.plMonPct}>{pc.txt}</b>}
                        </span>
                      );
                    })}
                    {ticks.map((tk) => (
                      <span key={tk.at} className={`${h.plDay} ${tk.big ? h.plDayBig : ''}`}
                        style={{ left: xOf(tk.at) }}>
                        {tk.lab}
                      </span>
                    ))}
                  </div>

                  <div className={h.plLanes}
                    ref={lanesRef}
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

                    {slice.map(({ r, k }) => {
                      /* ⚠️ БҮЛГИЙН ЗУРВАС нь ХҮҮХДҮҮДЭЭСЭЭ бодогдоно
                         (`effSpan`) — хадгалагдсан хуучин огноо нь
                         тэдэнтэй зөрж байсан ч ЗӨВ мужийг харуулна. */
                      const sp = r.group ? effSpan(plan, r.i, blk) : r.spans[blk];
                      const st = sp ? statusOf(sp, r.act?.[blk], now) : 'none';
                      /* Уялдааны зөрчил — шаардлагаас ӨМНӨ эхэлсэн зурвасыг
                         улаан хүрээгээр тэмдэглэнэ (хориглохгүй) */
                      const need = sp && r.deps.length
                        ? requiredStart(plan, byCode, r.i, blk) : null;
                      const viol = !!(sp && need != null && sp.start < need);
                      return (
                        <div key={r.oid}
                          className={`${h.plLane} ${k % 2 ? h.plLaneAlt : ''} ${sel === r.i ? h.plLaneOn : ''} ${link && !hierRelated(plan, r.i, link.i) ? h.plLaneDrop : ''}`}
                          style={{ top: k * PL_ROW, height: PL_ROW }}
                          data-row={r.i}
                          onPointerDown={(e) => onDown(e, r, 'new')}
                        >
                          {/*
                            * ЛАВЛАГААНЫ ЗУРВАС — нөгөө төрлийн огноо (2026-09-11).
                            *
                            * ⚠️ Мөрийн ДООД хагаст, сонгосон төрлийн зурвасын ДООР
                            *    зэрэгцэнэ (ард нь биш) — хэрэглэгчийн хүсэлт. Хоёр
                            *    огнооны зөрүү нь хэвтээ шилжилтээр шууд уншигдана.
                            * ⚠️ Огноо ИЖИЛ байсан ч ЗУРНА: зэрэгцсэн хоёр зурвас нь
                            *    давхцахгүй тул «ижил байна» гэдэг нь өөрөө мэдээлэл.
                            * ⚠️ Зөвхөн нөгөө төрөлд огноо БАЙГАА үед — байхгүйг
                            *    «тэг» гэж зурахгүй (`null ≠ 0`).
                            */}
                          {(() => {
                            if (!showRef) return null;
                            const rr = refByOid.get(r.oid);
                            if (!rr) return null;
                            const rsp = r.group ? effSpan(refBase, rr.i, blk) : rr.spans[blk];
                            if (!rsp) return null;
                            const other = kind === 'geree' ? tr('Төлөвлөгөө') : tr('Гэрээ');
                            return (
                              <div
                                className={h.plRef}
                                style={{ left: xOf(rsp.start), width: Math.max(6, spanDays(rsp) * px - 1) }}
                                title={`${other}: ${msToDay(rsp.start)} → ${msToDay(rsp.end)} (${tr('{0} хоног', spanDays(rsp))})`}
                              />
                            );
                          })()}
                          {/*
                            * БОДИТ МУЖ (2026-09-23) — мөрийн ХАМГИЙН ДООД захад 3px нарийн
                            * зурвас: бодит эхэлсэн → бодит дууссан (дуусаагүй бол → өнөөдөр,
                            * тасархай хэлбэрээр — «үргэлжилж байна»). `plRef`-ийн ижил ёс:
                            * `pointer-events: none`, чирэгдэхгүй, засагдахгүй (popup-аас).
                            * ⚠️ Төлөвлөгөөт зурвастай ЗЭРЭГЦЭНЭ — зөрүү нь хэвтээ шилжилтээр
                            *    уншигдана. Бодит огноогүй бол ЮУ Ч зурахгүй (`null ≠ 0`).
                            * ⚠️ Бүлгийн мөрд хүүхдийн MIN/MAX (`aggExtra`).
                            */}
                          {hasActual && (() => {
                            const x = r.group ? effRow(r) : r;
                            const as0 = x.aStart?.[blk] ?? null;
                            if (as0 == null) return null;
                            const ae0 = x.aEnd?.[blk] ?? null;
                            const to2 = ae0 ?? Math.max(as0, now);
                            return (
                              <div
                                className={`${h.plAct} ${ae0 == null ? h.plActOpen : ''}`}
                                style={{ left: xOf(as0), width: Math.max(4, spanDays({ start: as0, end: to2 }) * px - 1) }}
                                title={`${tr('Бодит')}: ${msToDay(as0)} → ${ae0 != null ? msToDay(ae0) : tr('үргэлжилж байна')}`}
                              />
                            );
                          })()}
                          {sp && (
                            <div
                              className={`${h.plBar} ${showRef ? h.plBarHalf : ''} ${r.group ? h.plBarG : ST_CLASS[st]} ${sel === r.i ? h.tlBarOn : ''} ${viol ? h.plBarViol : ''}`}
                              style={{ left: xOf(sp.start), width: Math.max(10, spanDays(sp) * px - 1) }}
                              onPointerDown={(e) => onDown(e, r, 'move')}
                              aria-label={`${r.work || r.no} · ${sc.bld[blk]} · ${msToDay(sp.start)} → ${msToDay(sp.end)}`}
                              title={`${r.work}\n${sc.bld[blk]} · ${msToDay(sp.start)} → ${msToDay(sp.end)} (${tr('{0} хоног', spanDays(sp))}) · ${ST_TEXT[st]}`}
                            >
                              {/* ⚠️ Бариул нь зөвхөн АЖЛЫН зурваст: бүлгийнх
                                  бодогдох тул сунгах утгагүй. */}
                              {!r.group && (
                                <span className={h.plGrip} onPointerDown={(e) => onDown(e, r, 'l')} />
                              )}
                              {/* ⚠️ БҮТЭН ОГНОО (2026-09-01, хэрэглэгч): урьд нь «09-12→11-13»
                                  гэж жилгүй байв. Хуанли 2025–2028 оныг дамждаг тул жилгүй
                                  огноо аль жилийнх нь нь тодорхойгүй байсан. Дөрвөн шат:
                                  нэр+бүтэн огноо → бүтэн огноо → он-сар → хоног → юу ч үгүй.

                                  ⚠️ АЖЛЫН НЭР зөвхөн ХАМГИЙН ӨРГӨН зурваст (2026-09-02,
                                  хэрэглэгч). Огноо нь ~120px эзэлдэг тул нэрийг доогуур
                                  шатанд нэмбэл гурав дөрвөн үсэг + «…» л үлдэж, мэдээлэл
                                  өгөхийн оронд огноог л түлхэж гаргана. Нэр нь агшиж
                                  (`plBarName` ellipsis), огноо нь агшихгүй. */}
                              {/*
                                * ⚠️ ОГНОО ДЭЭР ДООР (2026-09-11, хэрэглэгч): эхлэх огноо
                                *    ДЭЭД мөрөнд, дуусах огноо ба хоног ДООД мөрөнд. Зурвас
                                *    22px тул 9.5px үсэг хоёр мөр багтана; нэг мөрт «→»-өөр
                                *    бичихэд 178px шаарддаг байсныг богиносгож, дунд урттай
                                *    зурвас ч бүтэн огноотой болов. Чирэхэд `sp` шинэчлэгдэх
                                *    тул огноо шууд дагана.
                                * ⚠️ «Зэрэг» асаалттай (`showRef`) үед зурвас 11px — хоёр
                                *    мөр багтахгүй тул хуучин нэг мөрийн шатлал үлдэнэ.
                                *
                                * ⚠️ БОСГО 100px (2026-09-15-ны аудит). Урьд нь 66px байсан
                                *    нь ДООД мөрийн бодит өргөнөөс бага: «2026-04-18 · 187х»
                                *    нь 9.5px tabular-nums дээр ~94px, дээр нь `.plBar`-ын
                                *    хоёр `plGrip` ба хүрээ ~6px иднэ. `white-space: nowrap`
                                *    + `overflow: hidden` тул илүү нь ellipsis-гүй ТАСАРЧ,
                                *    «2026-04-1» гэж хагас огноо гардаг байв. Доод шат
                                *    (118px `short()`) -аас бага байх ёстой тул 100px.
                                */}
                              {!showRef && spanDays(sp) * px > 100 ? (
                                <span className={`${h.plBarLab} ${h.plBarTwo}`}>
                                  {spanDays(sp) * px > 250 && (
                                    <span className={h.plBarName}>{r.work || r.no}</span>
                                  )}
                                  <span className={h.plBarWhen}>
                                    <span>{msToDay(sp.start)}</span>
                                    <span>{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}</span>
                                  </span>
                                </span>
                              ) : spanDays(sp) * px > 250 ? (
                                <span className={h.plBarLab}>
                                  <span className={h.plBarName}>{r.work || r.no}</span>
                                  <span className={h.plBarWhen}>
                                    {msToDay(sp.start)}→{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}
                                  </span>
                                </span>
                              ) : spanDays(sp) * px > 178 ? (
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
                              {!r.group && (
                                <span className={`${h.plGrip} ${h.plGripR}`}
                                  onPointerDown={(e) => onDown(e, r, 'r')} />
                              )}
                              {/* ХОЛБОХ БАРИУЛ — баруун захын дугуй; чирээд нөгөө мөр дээр тавина (2026-09-22).
                                  ⚠️ Бүлгийн зурваст ч бий — бүлэг урд ажил болж чадна (`effSpan`).
                                  ⚠️ (2026-09-23) ЗӨВХӨН төлөвлөгөө табд — гэрээ гинжээр хөдөлдөггүй. */}
                              {canEdit && !locked && kind === 'plan' && (
                                <span className={h.plLink}
                                  onPointerDown={(e) => startLink(e, r)}
                                  title={tr('Хамаарал холбох — чирээд дараагийн ажлын мөр дээр тавина (FS)')} />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* ── УЯЛДААНЫ СУМУУД ──
                        ⚠️ Зурвасуудын ДЭЭР давхарласан SVG, `pointer-events:
                        none` — чирэлт, товшилтод огт саад болохгүй. Сум нь
                        зөвхөн ХОЁУЛАА харагдаж буй мөрүүдийн хооронд зурагдана:
                        шүүлт/эвхэлтэд нуугдсан үзүүр рүү зурвал агаарт дүүжлэгдэнэ. */}
                    {(arrows.length > 0 || link) && (
                      /* ⚠️ (2026-09-23) `depSvgLink` — холбох чирэлтийн үед `depHit`-ийн
                         pointer-events унтарна: эс бөгөөс сумны зурвас дээр суллахад
                         `elementFromPoint` сумыг онож, мөр олдохгүй. */
                      <svg className={`${h.depSvg} ${link ? h.depSvgLink : ''}`} width={W} height={visible.length * PL_ROW} aria-hidden>
                        <defs>
                          {[h.depArrN, h.depArrH, h.depArrB].map((c, k) => (
                            <marker key={c} id={`hvDepArr${k}`} viewBox="0 0 6 6" refX="5" refY="3"
                              markerWidth="5.5" markerHeight="5.5" orient="auto">
                              <path d="M0 0 L6 3 L0 6 z" className={c} />
                            </marker>
                          ))}
                        </defs>
                        {arrows.map((a2) => (
                          <g key={a2.key}>
                            <path d={a2.d} className={a2.cls} markerEnd={a2.mk} />
                            {/* ⚠️ ХОЛБООС ДЭЭР ДАРЖ ЗАСАХ/УСТГАХ (2026-09-22, хэрэглэгч: «хамаарлыг
                                устгаж чадахгүй байна»). SVG нь pointer-events: none (чирэлтэд саад
                                болохгүй) тул ЗӨВХӨН энэ тунгалаг өргөн зурвас (`depHit`) дарагдана —
                                нарийн шугамыг онох шаардлагагүй. Цонх нь ижил LinkModal, «Уялдаа
                                устгах» товчтой.
                                ⚠️ (2026-09-23) ЗӨВХӨН төлөвлөгөө табд (`kind === 'plan'`) — гэрээнд
                                уялдаа засахгүй. Зурвас (`.plBar`) нь CSS-ээр SVG-ээс ДЭЭШ тул
                                зурвасын дээрх даралт зурвасд очно; сум зөвхөн хоосон талбайд дарагдана. */}
                            {canEdit && !locked && kind === 'plan' && (
                              <path d={a2.d} className={h.depHit}
                                onClick={(e) => { e.stopPropagation(); setLinkAsk({ si: a2.si, ti: a2.ti }); }}>
                                <title>{tr('Дарж засах / устгах')}</title>
                              </path>
                            )}
                          </g>
                        ))}
                        {/* ТҮР ШУГАМ — холбох чирэлтийн үед урд ажлын баруун захаас курсор хүртэл */}
                        {link && (() => {
                          const k = visible.findIndex((v) => v.i === link.i);
                          const ps = k >= 0 ? effSpan(plan, link.i, blk) : null;
                          if (!ps) return null;
                          const sx = xOf(ps.end + DAY);
                          const sy = k * PL_ROW + PL_ROW / 2;
                          return <path d={`M ${sx} ${sy} L ${link.x} ${link.y}`} className={h.depDraft} markerEnd="url(#hvDepArr1)" />;
                        })()}
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      {linkAsk && plan[linkAsk.si] && plan[linkAsk.ti] && (
        <LinkModal
          src={plan[linkAsk.si]}
          dst={plan[linkAsk.ti]}
          onClose={() => setLinkAsk(null)}
          onRemove={() => {
            const s = plan[linkAsk.si];
            const t = plan[linkAsk.ti];
            setLinkAsk(null);
            if (s.des == null) return;
            /* ⚠️ Хоосон болвол `[]` — «цэвэрлэ» гэсэн утга (`null` = хөндөхгүй). */
            applyModal(t.oid, null, t.deps.filter((d) => d.code !== s.des), null);
          }}
          onApply={(type, lag) => {
            const s = plan[linkAsk.si];
            const t = plan[linkAsk.ti];
            setLinkAsk(null);
            if (s.des == null) return;
            /* Ижил урд ажлын хуучин уялдааг сольж бичнэ — нэг код нэг удаа. */
            applyModal(t.oid, null, [...t.deps.filter((d) => d.code !== s.des), { code: s.des, type, lag }], null);
          }}
        />
      )}

      {modalRow && sc && (
        <PlanModal
          r={modalRow}
          par={modalPar}
          blocks={sc.bld}
          blk={blk}
          takt={takt}
          /* ⚠️ `locked` — хүлээгдэж буй илгээлт байхад popup-аас ч засахгүй.
             Зөвхөн `onDown`-г түгжвэл хуанлийн цонх нээлттэй хэвээр үлдэнэ. */
          canEdit={canEdit && !locked}
          onBlk={setBlk}
          onTakt={setTakt}
          cands={depCands}
          hasHam={!!sc.f.ham}
          hasActual={hasActual}
          hasRes={hasRes}
          months={obOf(modalRow.des, sc.bld[blk] ?? "")}
          /*
           * ⚠️ ЦУЦЛАХАД ЧИРЭЛТ БУЦНА (2026-09-08). Цонх нь чирэлтийн ДАРАА
           *    нээгддэг тул хуваарь аль хэдийн ноорогт бичигдсэн байдаг;
           *    «Хаах»/X/Esc/дэвсгэр дарахад түүнийг сэргээнэ. Эс бөгөөс
           *    хэрэглэгч цуцалсан гэж бодоод хуваарь нь үлдэнэ.
           */
          onClose={() => {
            const u = undoRef.current;
            undoRef.current = null;
            setModal(null);
            if (u) {
              const row = plan.find((x) => x.oid === u.oid);
              if (row) {
                const next = row.spans.slice();
                next[u.blk] = u.span;
                /* ⚠️ Сарын задаргааг ЧИРЭЛТЭЭС ӨМНӨХ хуулбараар сэргээнэ (2026-09-17):
                   чирэлт `applyChanges`-аар задаргааг хумьсан байж болох тул `null`
                   (хөндөхгүй) хангалтгүй, `new Map()` (устгах) буруу байв. */
                /* ⚠️ Блокийг `u.blk`-ээр (2026-09-21): цонх нээлттэй байхад блок
                   сольсон бол одоогийн `blk` нь чирсэн блок биш. */
                applyModal(u.oid, next, null, u.months ?? null, u.blk);
              }
            }
          }}
          onApply={(spans, deps, months, actual, res) => {
            /* ⚠️ ЗӨВШӨӨРӨГДСӨН өөрчлөлт — буцаах мэдээллийг цэвэрлэнэ,
               эс бөгөөс дараагийн `onClose` түүнийг эргүүлж хаяна. */
            undoRef.current = null;
            applyModal(modalRow.oid, spans, deps, months);
            /* Бодит огноо (энэ блок) · нөөц — гинжээс гадуур, ноорогт л (2026-09-23) */
            applyExtra(modalRow.oid, blk, actual, res);
          }}
        />
      )}

      {flowBox === 'send' && (
        <FlowBox
          title={tr('Хуваарь батлуулах')}
          desc={tr('{0} мөрийн өөрчлөлт батлагчид илгээгдэнэ. Батлагдтал эх хуваарь хөдлөхгүй.', num(dirtyN))}
          label={tr('Тайлбар (сонголтоор)')}
          okText={tr('Илгээх')}
          busy={busy}
          err={err}
          onClose={() => setFlowBox(null)}
          onOk={(txt) => void sendForApproval(txt)}
        />
      )}
      {flowBox === 'decide' && pending && (
        <FlowBox
          title={tr('Хуваарь шийдвэрлэх')}
          desc={tr('{0} мөрийн хуваарийг {1} илгээв.', num(pending.rowCount), pending.author)
            + (pending.note ? ` — «${pending.note}»` : '')
            + (previewing
              ? ` ${tr('Санал хуанли дээр харагдаж байна.')}`
              : ` ${tr('⚠️ Хараахан урьдчилан хараагүй байна — «Урьдчилан харах»-аар шалгаж болно.')}`)}
          label={tr('Буцаах шалтгаан (буцаахад заавал)')}
          okText={tr('Батлах')}
          /* ⚠️ Буцаахад шалтгаан ЗААВАЛ — `decidePlan` ч мөн шалгана. Шалтгаангүй
             буцаалт нь гүйцэтгэгчид юуг засахыг хэлэхгүй тул давталт үүсгэнэ. */
          rejectText={tr('Буцаах')}
          busy={busy}
          err={err}
          onClose={() => setFlowBox(null)}
          onOk={() => void decide(true, '')}
          onReject={(txt) => void decide(false, txt)}
        />
      )}
    </div>
  );
}

/* ══════════════════ Батлах урсгалын цонх ══════════════════ */

/**
 * ИЛГЭЭХ / ШИЙДВЭРЛЭХ цонх — нэг бүрэлдэхүүн хоёуланд.
 *
 * ⚠️ `PlanModal`-ийн CSS ангиудыг ДАХИН ашиглана: хоёр өөр загвартай цонх нь
 *    нэг хуудсанд танигдахгүй болно.
 */
function FlowBox({
  title, desc, label, okText, rejectText, busy, err, onClose, onOk, onReject,
}: {
  title: string; desc: string; label: string; okText: string;
  rejectText?: string; busy: boolean;
  /**
   * ⚠️ АЛДААГ ЦОНХ ДОТОР (2026-09-21). Урсгалын алдаанууд (`setErr`: тэнцээгүй
   *    задаргаа, эрхгүй, агуулга уншигдсангүй, төрөл зөрсөн, зэрэгцээ өөрчлөлт)
   *    цонхыг хаадаггүй тул хуудасны баннер модалын АРД гарч, хэрэглэгч товч
   *    дарсан атлаа юу ч болоогүй мэт хардаг байв. Хуудасны баннер хэвээр —
   *    цонх хаагдсаны дараа ч уншигдана.
   */
  err?: string;
  onClose: () => void;
  onOk: (text: string) => void;
  onReject?: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  const [txt, setTxt] = useState('');
  return (
    <div className={h.mdBack} role="presentation" onClick={onClose}>
      <div ref={ref} className={h.md} role="dialog" aria-modal="true"
        onClick={(e) => e.stopPropagation()}>
        <header className={h.mdHead}>
          <b className={h.mdWork}>{title}</b>
          <button type="button" className={h.mdX} onClick={onClose} aria-label={tr('Хаах')}>×</button>
        </header>
        <p className={h.note}>{desc}</p>
        {err && <p className={h.err} role="alert">{err}</p>}
        <label className={h.mdField}>
          {label}
          <textarea
            className={h.flowText}
            rows={3}
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            disabled={busy}
          />
        </label>
        <div className={h.mdFoot}>
          <span className={h.spacer} />
          {onReject && (
            <button
              type="button"
              className={h.discard}
              disabled={busy || !txt.trim()}
              title={txt.trim() ? undefined : tr('Буцаах шалтгааныг бичнэ үү.')}
              onClick={() => onReject(txt)}
            >
              {rejectText}
            </button>
          )}
          <button type="button" className={h.save} disabled={busy} onClick={() => onOk(txt)}>
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ⚠️ «ХУВААРИЙН ХАМРАЛТ» самбар 2026-09-02-нд ХАСАГДСАН (хэрэглэгч).
   `coverageOf()` нь ХЭВЭЭР — шүүлтийн «Хуваарьтай / Хуваарьгүй» табууд
   түүний тоог уншсаар байна, зөвхөн толгойн үзүүлэлт л алга болов. */

/* ══════════════════ Ажлын мөр (зүүн багана) ══════════════════ */

function TaskRow({
  r, on, dirty, collapsed, onToggle, onPick, geree, tolov, canEdit, onHamText,
  hasActual, hasRes, aStart, aEnd, hun, mashin,
}: {
  r: PlanRow; on: boolean; dirty: boolean;
  collapsed: boolean;
  onToggle: () => void; onPick: () => void;
  /**
   * БОДИТ огноо (идэвхтэй блокийн) ба НӨӨЦ (2026-09-23) — зөвхөн харуулна,
   * popup-аас засагдана (дээрх дөрвөн огнооны ⚠️-тэй ижил). Бүлгийн мөрд
   * дуудагч `aggExtra`-аар бодож өгнө. `null` = бүртгэлгүй → «—».
   * `hasActual`/`hasRes` худал бол багана ОГТ зурагдахгүй — толгойтой нийцнэ.
   */
  hasActual: boolean; hasRes: boolean;
  aStart: number | null; aEnd: number | null;
  hun: number | null; mashin: number | null;
  /**
   * ГЭРЭЭНИЙ ба ТӨЛӨВЛӨГӨӨНИЙ нийт муж — дөрвөн огнооны багана.
   *
   * ⚠️ Хоёулаа ЗАСАГДАХГҮЙ, зөвхөн уншина. Огноо засах зам нь хуанли дээр
   *    чирэх ба popup хэвээр — хоёр өөр засварын зам үүсвэл аль нь үнэн
   *    болох нь бүрхэг болно.
   * ⚠️ `null` = тэр төрөлд хуваарь ОГТ байхгүй → «—» (0 БИШ).
   */
  geree: Span | null;
  tolov: Span | null;
  /** Уялдааны нүд ЗАСАГДАХ уу — эрхгүй бол зөвхөн уншина */
  canEdit: boolean;
  /** Нүдэнд бичсэн текстийг хадгална () */
  onHamText: (oid: number, text: string) => void;
}) {
  /* ⚠️ «Хуваарь» (хоногийн тоо) ба «блок» (12/12) багана 2026-09-03-нд
     ХАСАГДСАН (хэрэглэгч) — тоо нь зурвасны шошго ба tooltip-д давхардаж
     байв. Зүүн самбарт: код · нэр · хамаарал гурав л үлдэв. */
  return (
    <div
      className={`${h.row} ${on ? h.rowOn : ''} ${r.group ? h.rowGroup : ''} ${dirty ? h.rowDirty : ''} ${tolov && !r.group ? h.rowPlanned : ''}`}
      style={{ height: PL_ROW }}
    >
      {/* ⚠️ АЖЛЫН КОД нь ДОГОЛ МӨРӨӨС ГАДНА — багана болох ёстой тул шатлалын
          зайд хөдөлж болохгүй. Тиймээс догол мөрийг `.row`-оос ЗАЙЛУУЛЖ доорх
          `.rowTree`-д шилжүүлэв: код нь бүх мөрд ЯГ нэг босоо шугамд эгнэнэ.
          ⚠️ Хоосон бол «—», 0 БИШ: код нь дүүргэгдээгүй гэдгийг ялгана. */}
      <span className={h.rowDes} title={r.des != null ? tr('Ажлын код') : undefined}>
        {r.des ?? '—'}
      </span>

      <div className={h.rowTree} style={{ paddingLeft: `${r.depth * 12}px` }}>
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
      </div>

      {/*
        * ДӨРВӨН ОГНООНЫ НҮД — гэрээ (эхлэх · дуусах) ба төлөвлөгөө
        * (эхлэх · дуусах). 2026-09-15-ны хэрэглэгчийн хүсэлт.
        *
        * ⚠️ БҮЛГИЙН мөрд ч гарна: `rowSpan` нь хүүхдүүдийн MIN/MAX-ыг
        *    нэгтгэдэг тул бүлгийн мөр нь дэд ажлуудынхаа нийт мужийг
        *    харуулна — эвхээстэй байхад ч хугацаа нь мэдэгдэнэ.
        * ⚠️ `msToDay` — ЯГ хуанлийн шошготой ижил формат (`YYYY-MM-DD`).
        *    Өөр формат хэрэглэвэл нэг огноо хоёр газарт өөр харагдана.
        * ⚠️ Хуваарьгүй бол «—», 0 огноо БИШ.
        */}
      <span className={h.rowDate} title={geree ? tr('Гэрээний эхлэх огноо') : undefined}>
        {geree ? msToDay(geree.start) : '—'}
      </span>
      <span className={h.rowDate} title={geree ? tr('Гэрээний дуусах огноо') : undefined}>
        {geree ? msToDay(geree.end) : '—'}
      </span>
      {/* ⚠️ ҮРГЭЛЖЛЭХ ХОНОГ — ТУСДАА багана (2026-09-15, хэрэглэгч).
          `spanDays` нь ХОЁР ҮЗҮҮРИЙГ ОРУУЛЖ тоолно (эхлэх ба дуусах өдөр
          хоёулаа ажлын өдөр) — хуанлийн зурвасын шошготой ЯГ ижил тоо. */}
      <span className={h.rowDays} title={geree ? tr('Гэрээгээр үргэлжлэх хоног') : undefined}>
        {geree ? spanDays(geree) : '—'}
      </span>
      <span className={h.rowDate} title={tolov ? tr('Төлөвлөгөөт эхлэх огноо') : undefined}>
        {tolov ? msToDay(tolov.start) : '—'}
      </span>
      <span className={h.rowDate} title={tolov ? tr('Төлөвлөгөөт дуусах огноо') : undefined}>
        {tolov ? msToDay(tolov.end) : '—'}
      </span>
      <span className={h.rowDays} title={tolov ? tr('Төлөвлөгөөгөөр үргэлжлэх хоног') : undefined}>
        {tolov ? spanDays(tolov) : '—'}
      </span>
      {/* БОДИТ ЭХЭЛСЭН · ДУУССАН (2026-09-23) — идэвхтэй блок; «—» = бүртгэлгүй */}
      {hasActual && (
        <span className={h.rowDate} title={aStart != null ? tr('Бодит эхэлсэн огноо') : undefined}>
          {aStart != null ? msToDay(aStart) : '—'}
        </span>
      )}
      {hasActual && (
        <span className={h.rowDate} title={aEnd != null ? tr('Бодит дууссан огноо') : undefined}>
          {aEnd != null ? msToDay(aEnd) : '—'}
        </span>
      )}
      {/* ХҮН ХҮЧ · МАШИН МЕХАНИЗМ (2026-09-23) — бүлэгт нийлбэр; `null` → «—», 0 БИШ */}
      {hasRes && (
        <span className={h.rowRes} title={hun != null ? tr('Хүн хүч') : undefined}>
          {hun != null ? num(hun) : '—'}
        </span>
      )}
      {hasRes && (
        <span className={h.rowRes} title={mashin != null ? tr('Машин механизм') : undefined}>
          {mashin != null ? num(mashin) : '—'}
        </span>
      )}

      {/* УЯЛДАА — MS Project-ийн Predecessors бичиглэлээр («18FS3,22SS»).
          Урт бол таслагдана — бүтнийг нь tooltip ба popup-д харна.
          ⚠️ ТОВЧ (2026-09-03, хэрэглэгч): нүдэн дээр дарахад мөн л popup
          нээгдэж уялдааг нь тохируулна. Хоосон нүд агаар мэт харагдах тул
          мөр дээр хулгана очиход «+» гарч дарагдахыг нь сануулна (CSS). */}
      <HamCell r={r} canEdit={canEdit} onText={onHamText} onPick={onPick} />
    </div>
  );
}

/* ══════════════════ УЯЛДААНЫ НҮД ══════════════════ */

/**
 * ХАМААРЛЫН НҮД — MS Project-ийн Predecessors шиг ШУУД БИЧНЭ.
 *
 * ⚠️ 2026-09-15, хэрэглэгчийн хүсэлт: «11FS14 гэж шууд бичиж холбоос хийх».
 *    Урьд нь нүд нь ЗӨВХӨН popup нээдэг товч байсан: кодоо мэддэг хүн ч
 *    цонх нээж, жагсаалтаас ажил хайж, төрөл сонгож байж нэг уялдаа нэмдэг.
 *
 * ⚠️ POPUP ХЭВЭЭР — энэ нь түүнийг ОРЛОХГҮЙ. Кодоо мэдэхгүй хүнд жагсаалтаас
 *    нэрээр нь сонгох зам зайлшгүй. Тиймээс: нүдэнд бичнэ, «…» товчоор
 *    popup нээнэ.
 *
 * ⚠️ ХАДГАЛАХ нь `blur` ба `Enter`-д — тэмдэгт бүрд БИШ. Бичиж байх зуур
 *    `propagate` дуудвал 1,400 мөрийн гинж тэмдэгт тутамд дахин бодогдож,
 *    хагас бичсэн токен («11F») уялдаагаа алдана.
 * ⚠️ `Escape` — засварыг хаяж, хадгалсан утга руу буцна.
 */
function HamCell({
  r, canEdit, onText, onPick,
}: {
  r: PlanRow;
  canEdit: boolean;
  onText: (oid: number, text: string) => void;
  onPick: () => void;
}) {
  const saved = r.deps.length ? formatDeps(r.deps) : '';
  const [txt, setTxt] = useState(saved);
  /* Escape-ээр цуцалсан бол `onBlur`-ийн хадгалалтыг алгасах туг (2026-09-17) */
  const cancelRef = useRef(false);
  const [edit, setEdit] = useState(false);

  /* ⚠️ Гаднаас өөрчлөгдвөл (popup, чирэлтийн гинж, ноорог сэргээх) оролтыг
     дагуулна — ЗӨВХӨН засаж БАЙХГҮЙ үед, эс бөгөөс бичиж байхад нь дарна. */
  useEffect(() => { if (!edit) setTxt(saved); }, [saved, edit]);

  if (!canEdit) {
    /* ⚠️ Эрхгүй бол УНШИХ горим — товч хэвээр (popup нь зөвхөн харуулна) */
    return (
      <button type="button" className={h.rowHam} onClick={onPick}
        title={saved ? `${saved}\n${tr('Уялдаа харах')}` : tr('Уялдаа харах')}>
        {saved}
      </button>
    );
  }

  return (
    <span className={h.hamWrap}>
      <input
        className={h.hamIn}
        value={txt}
        /* ⚠️ `placeholder` БАЙХГҮЙ (2026-09-15, хэрэглэгч: «бүгд 11FS14
           болчихлоо — энэ жишээ шүү дээ»). Хоосон нүд бүрд жишээ бичиглэл
           харагдвал бодит утга мэт уншигдаж, 1,400 мөр «11FS14»-ээр дүүрсэн
           дүр зураг гарна. Жишээг ЗӨВХӨН `title` (hover) ба толгойн зааварт. */
        title={tr('Жишээ: 11FS14 — 11-р ажил дууссанаас 14 хоногийн дараа. Олныг таслалаар: 11FS,22SS-5')}
        onChange={(e) => { setEdit(true); setTxt(e.target.value); }}
        onFocus={() => setEdit(true)}
        onBlur={() => { setEdit(false); if (!cancelRef.current) onText(r.oid, txt); cancelRef.current = false; }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.currentTarget.blur(); return; }
          /* ⚠️ Escape = ЦУЦЛАХ: `blur()` синхрон тул `onBlur` хуучин `txt`-ээр хадгалдаг
             байв (2026-09-17). Тугаар хаана. */
          if (e.key === 'Escape') { cancelRef.current = true; setTxt(saved); setEdit(false); e.currentTarget.blur(); }
        }}
      />
      {/* ⚠️ POPUP руу орох зам — кодоо мэдэхгүй хүнд жагсаалтаас нэрээр нь */}
      <button type="button" className={h.hamMore} onClick={onPick}
        title={tr('Жагсаалтаас сонгох')}>…</button>
    </span>
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
  r, par, blocks, blk, takt, canEdit, onBlk, onTakt, cands, hasHam, hasActual, hasRes, months, onClose, onApply,
}: {
  r: PlanRow;
  /** Хамгийн ойрын дээд БҮЛЭГ — түүний муж нь хатуу хязгаар */
  par: PlanRow | null;
  blocks: string[];
  blk: number;
  takt: number;
  canEdit: boolean;
  onBlk: (b: number) => void;
  onTakt: (v: number) => void;
  /** Урьдчилагчийн нэр дэвшигчид — дугуй хамаарал үүсгэгчид ХАСАГДСАН */
  cands: { code: number; label: string }[];
  /** Үйлчилгээнд `Hamaaral` талбар бий эсэх — үгүй бол уялдааны хэсэг нуугдана */
  hasHam: boolean;
  /** Бодит огноо · нөөцийн талбар үйлчилгээнд бий эсэх (2026-09-23) — үгүй бол хэсэг нуугдана */
  hasActual: boolean;
  hasRes: boolean;
  /** ЭНЭ блокийн хадгалагдсан/ноорог сарын задаргаа */
  months: Map<string, number>;
  onClose: () => void;
  /**
   * «Тавих»/«Арилгах» — огноо · уялдаа · сарын обьём · бодит огноо (энэ блок) ·
   * нөөц НЭГ алхамд (null = хөндөхгүй).
   * ⚠️ `actual`/`res` (2026-09-23) нь гинжээс ГАДУУР — дуудагч `applyExtra`-д өгнө.
   */
  onApply: (
    spans: (Span | null)[] | null,
    deps: Dep[] | null,
    months: Map<string, number> | null,
    actual: { start: number | null; end: number | null } | null,
    res: { hun: number | null; mashin: number | null } | null,
  ) => void;
}) {
  /* ⚠️ ФОКУСЫН УРХИ (2026-09-03-ны аудит): `aria-modal` нь дэлгэц уншигчид л
     хэлдэг, хөтчийн Tab-д нөлөөгүй — урхигүй үед Tab дарсаар байхад фокус
     цонхноос гарч ард байгаа 1,400 мөрт төөрдөг байв. */
  const mdRef = useRef<HTMLDivElement>(null);
  useFocusTrap(mdRef);

  const [a, setA] = useState('');
  const [z, setZ] = useState('');
  const [all, setAll] = useState(false);
  /** Уялдааны түр жагсаалт — «Тавих» дартал эх мөрөө хөндөхгүй */
  const [dl, setDl] = useState<Dep[]>(r.deps);
  useEffect(() => { setDl(r.deps); }, [r]);

  /**
   * БОДИТ ЭХЭЛСЭН / ДУУССАН (энэ блок) ба ХҮН ХҮЧ / МАШИН (мөр) — 2026-09-23.
   * ⚠️ Төлөвлөгөөт огнооноос ТУСДАА төлөв: бүлгийн мужаар урьдчилан
   *    бөглөхгүй, «мужаар нь авах» нөлөөлөхгүй, `all` (бүх блокт тараах)
   *    хамаарахгүй — бодит нь бүртгэл, таамаглахгүй. Хоосон = `null`.
   */
  const [aa, setAa] = useState('');
  const [az, setAz] = useState('');
  useEffect(() => {
    const s = r.aStart?.[blk] ?? null;
    const e = r.aEnd?.[blk] ?? null;
    setAa(s != null ? msToDay(s) : '');
    setAz(e != null ? msToDay(e) : '');
  }, [r, blk]);
  const [hunTxt, setHunTxt] = useState('');
  const [mashTxt, setMashTxt] = useState('');
  useEffect(() => {
    setHunTxt(r.hun != null ? String(r.hun) : '');
    setMashTxt(r.mashin != null ? String(r.mashin) : '');
  }, [r]);
  const am1 = dayToMs(aa);
  const am2 = dayToMs(az);
  const aBad = am1 != null && am2 != null && am1 > am2;
  const actDirty = (am1 ?? null) !== (r.aStart?.[blk] ?? null) || (am2 ?? null) !== (r.aEnd?.[blk] ?? null);
  /* ⚠️ Хоосон → `null` (0 БИШ); сөрөг/тоо биш → `null` — Integer талбар */
  const intOrNull = (s: string): number | null => {
    const t = s.trim();
    if (!t) return null;
    const v = Math.floor(Number(t));
    return Number.isFinite(v) && v >= 0 ? v : null;
  };
  const hunN = intOrNull(hunTxt);
  const mashN = intOrNull(mashTxt);
  const resDirty = hunN !== (r.hun ?? null) || mashN !== (r.mashin ?? null);
  const extraDirty = (actDirty && !aBad) || resDirty;
  /** Popup-аас `onApply`-д өгөх бодит огноо · нөөц — хөндөөгүй бол `null` */
  const actArg = actDirty && !aBad ? { start: am1, end: am2 } : null;
  const resArg = resDirty ? { hun: hunN, mashin: mashN } : null;

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

  /**
   * ОГНОО ЗАСАХ ЭРХ. Бүлгийн муж нь дэд ажлуудаасаа бодогддог
   * (2026-09-06) тул гараар засагдахгүй — уялдаа нь харин засагдана.
   */
  const dEdit = canEdit && !r.group;

  const ms1 = dayToMs(a);
  const ms2 = dayToMs(z);
  const bad = ms1 != null && ms2 != null && ms1 > ms2;
  const days = ms1 != null && ms2 != null && !bad ? spanDays({ start: ms1, end: ms2 }) : null;

  /**
   * ҮРГЭЛЖЛЭХ ХОНОГ — засварлагддаг талбар (2026-09-17, хэрэглэгчийн хүсэлт:
   * «эхлэх огноо сонгоод хоногоо бичихэд дуусах огноо автоматаар гарна»).
   * Текст төлөв `durTxt` нь a/z-ээс гарсан `days`-тай хоёр талдаа синк:
   *   · хоног бичихэд → `z = endOf(ms1, n)` (хоёр тал орсон, `plan.endOf`);
   *   · эхлэхийг өөрчлөхөд хоног хадгалагдсан бол дуусах дагаж хөдөлнө;
   *   · дуусахыг гараар өөрчлөхөд хоног дагаж шинэчлэгдэнэ (effect).
   */
  const [durTxt, setDurTxt] = useState('');
  useEffect(() => { setDurTxt(days != null ? String(days) : ''); }, [days]);
  const onDur = (v: string) => {
    setDurTxt(v);
    const n = Math.floor(Number(v));
    if (n >= 1 && ms1 != null) setZ(msToDay(endOf(ms1, n)));
  };
  const onStart = (v: string) => {
    setA(v);
    const s = dayToMs(v);
    const n = Math.floor(Number(durTxt));
    if (s != null && n >= 1) setZ(msToDay(endOf(s, n)));
  };

  /**
   * ЭНЭ блокийн бүлгийн муж — ЗӨВХӨН МЭДЭЭЛЭЛ.
   * ⚠️ 2026-09-06-нд ХЯЗГААР БАЙХАА БОЛИВ (хэрэглэгч: «бүлгийн range
   *    ажлын range-ээс хамаардаг болго»). Хавчилт (`clamp`), «хальсан»
   *    анхааруулга, огнооны талбарын `min`/`max` гурвуулаа ХАСАГДСАН —
   *    ажил чөлөөтэй тавигдаж, бүлэг нь дагаж сунана.
   */
  const pspan = par?.spans[blk] ?? null;

  /* ══════════ САРЫН ОБЬЁМ ══════════
   * ⚠️ Сарууд нь ТАЛБАРТ БИЧИГДСЭН огноогоор тодорхойлогдоно, хадгалагдсан
   *    мужаар БИШ: хэрэглэгч огноогоо засаж байхад сарын жагсаалт нь тэр
   *    даруй дагах ёстой. Эс бөгөөс «Тавих» дарах хүртэл өөр саруудыг
   *    бөглөж, дараа нь бүгд дахин тарааж хаягдана.
   */
  const total = r.vol != null && r.vol > 0 ? r.vol : null;
  const [mv, setMv] = useState<Map<string, number>>(months);
  /**
   * Мөр/блок солигдоход ХАДГАЛАГДСАНАА суурь болгоно.
   *
   * ⚠️ ЭНЭ ЭФФЕКТ ДООХНООС ДЭЭГҮҮР БАЙХ ЁСТОЙ (2026-09-06-ны алдаа). React нь
   *    эффектүүдийг ЗАРЛАСАН дарааллаар ажиллуулдаг: тараах эффект түрүүлж
   *    ажиллавал энэ нь түүний үр дүнг тэр даруй ХООСОН `months`-оор дарж,
   *    цонх «Огноо оруулмагц сарууд өөрөө гарч ирнэ» дээр гацдаг байв —
   *    шинээр хуваарь татсан ажилд сарын хэсэг ХЭЗЭЭ Ч гарахгүй (огноо нь
   *    аль хэдийн бөглөгдсөн тул тараах эффект дахин ажиллах шалтгаангүй).
   *    Одоо: эхлээд суурь тавигдаж, дараа нь тараалт ФУНКЦЭЭР (`setMv(cur =>`)
   *    тэр суурин дээр ажиллана.
   */
  useEffect(() => { setMv(months); }, [r, blk]);   // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * ЭНЭ МУЖИД ХАМААРАХ САРУУД — жагсаалтын эх сурвалж.
   * ⚠️ Утгыг АВТОМАТААР ТАРААХГҮЙ (2026-09-06, хэрэглэгчийн заавар): сар
   *    бүр ХООСОН гарч, хүн өөрөө бөглөнө. Тараасан тоо нь төлөвлөгөө мэт
   *    харагдах ч үнэндээ таамаг бөгөөд шалгалгүй хадгалагддаг.
   */
  const mKeys = useMemo(
    () => (ms1 == null || ms2 == null || bad ? [] : monthsOf({ start: ms1, end: ms2 })),
    [ms1, ms2, bad],
  );
  /* Мужаас ГАРСАН сарын утгыг хасна — эс бөгөөс нийлбэр хаанаас ч
     гараагүй тоогоор давна. */
  useEffect(() => {
    setMv((cur) => {
      let extra = false;
      for (const k of cur.keys()) if (!mKeys.includes(k)) { extra = true; break; }
      if (!extra) return cur;
      const out = new Map<string, number>();
      for (const k of mKeys) { const v = cur.get(k); if (v != null) out.set(k, v); }
      return out;
    });
  }, [mKeys]);

  const mvSum = sumMonths(mv);
  /* ⚠️ БҮХ сар бөглөгдсөн байх ёстой: нэг сар хоосон атлаа нийлбэр таарвал
     тэр сарын төлөвлөгөө өгөгдөлд ОГТ үүсэхгүй. */
  const mvFull = mKeys.every((k) => mv.get(k) != null);
  const mvOk = total == null || (mvFull && balanced(mv, total));
  const mvDiff = total == null ? 0 : mvSum - total;

  /** Уялдаа өөрчлөгдсөн эсэх — бичиглэлээр нь харьцуулна (дараалал ч утгатай) */
  const depsDirty = formatDeps(dl) !== formatDeps(r.deps);
  /** Сарын задаргаа хөндөгдсөн үү — хадгалагдсан `months`-той харьцуулна */
  const mvDirty = mv.size !== months.size || [...mv].some(([k, v]) => months.get(k) !== v);
  /** Огноо хөндөгдсөн үү — энэ блокийн хадгалагдсан зурвастай харьцуулна */
  const own = r.spans[blk];
  const spanDirty = (ms1 ?? null) !== (own?.start ?? null) || (ms2 ?? null) !== (own?.end ?? null);
  /* ⚠️ ЗӨВХӨН УЯЛДАА өөрчлөгдсөн (огноо, сар хөндөгдөөгүй) бол сарын нийлбэрийн
     дүрэм хаахгүй (2026-09-17): обьёмтой ч задаргаагүй ажилд уялдаа тавихад
     «Тавих» бүх сар бөглөхийг шаарддаг байв. Огноо/сар хөндсөн бол дүрэм хэвээр. */
  /* ⚠️ Бодит огноо · нөөц ч «хөнгөн» өөрчлөлт (2026-09-23) — сарын дүрэм хаахгүй.
     `all` (бүх блокт тараах) асаалттай бол ХӨНГӨН БИШ: муж хөндөгдөөгүй ч тараалт
     хийгдэх ёстой (урьд нь энэ тохиолдол доод бүтэн замаар явдаг байсан). */
  const depsOnly = (depsDirty || extraDirty) && !spanDirty && !mvDirty && !all;

  const apply = () => {
    /* ⚠️ Бүлэгт огноо ОГТ бичихгүй — зөвхөн уялдаа (бодит огноо · нөөц ч бүлэгт
       хаалттай: `aggExtra`-аар бодогдоно). */
    if (r.group) { if (depsDirty) onApply(null, dl, null, null, null); onClose(); return; }
    if (ms1 == null || ms2 == null || bad) {
      /* Огноо буруу ч УЯЛДАА · бодит огноо · нөөцийг дангаар нь тавьж болно —
         төлөвлөгөөт огноог хөндөхгүй */
      if (depsDirty || extraDirty) { onApply(null, depsDirty ? dl : null, null, actArg, resArg); onClose(); }
      return;
    }
    if (depsOnly) { onApply(null, depsDirty ? dl : null, null, actArg, resArg); onClose(); return; }
    /* ⚠️ НИЙЛБЭР ТААРААГҮЙ бол хуваарийг ОРУУЛАХГҮЙ (хэрэглэгчийн дүрэм №3).
       Товч нь аль хэдийн хаалттай ч Enter/гар хандалтаар энд ирж болно. */
    if (!mvOk) return;
    const next = r.spans.slice();
    if (all) {
      /* ⚠️ Блок бүр `takt` хоногоор хойшилно — давтагдах блокийн хэвийн хэлбэр.
         Хавчуулалт нь блок ТУС БҮРИЙН эцгийн мужаар — бүлгийн хуваарь блок
         бүрд өөр байж болно. */
      const len = spanDays({ start: ms1, end: ms2 });
      blocks.forEach((_, b) => {
        const shift = (b - blk) * takt * DAY;
        next[b] = { start: ms1 + shift, end: endOf(ms1 + shift, len) };
      });
    } else {
      next[blk] = { start: ms1, end: ms2 };
    }
    onApply(next, depsDirty ? dl : null, total == null ? null : mv, actArg, resArg);
    onClose();
  };

  const clear = () => {
    const next = r.spans.slice();
    if (all) blocks.forEach((_, b) => { next[b] = null; });
    else next[blk] = null;
    /* ⚠️ Зөвхөн ОГНООГ арилгана — уялдаа нь хэвээр: хуваариа дахин тавихад
       гинж нь буцаад ажиллана. Уялдааг устгах бол жагсаалтаас ×-ээр.
       ⚠️ Сарын задаргаа ч цэвэрлэгдэнэ: хуваарьгүй ажилд төлөвлөсөн обьём
       үлдвэл нийлбэрийн шалгуур мөнхөд зөрчилтэй болно.
       ⚠️ Бодит огноо · нөөц ХӨНДӨХГҮЙ (2026-09-23): төлөвлөгөөг арилгах нь
       баримтыг устгах шалтгаан биш — талбарыг хоослоод «Тавих». */
    onApply(next, null, new Map(), null, null);
    onClose();
  };

  return (
    <div className={h.mdBack} role="presentation" onClick={onClose}>
      <div ref={mdRef} className={h.md} role="dialog" aria-modal="true"
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

        {/* ⚠️ БҮЛГИЙН МУЖ нь ХЯЗГААР БИШ, ЛАВЛАХ (2026-09-06). Бүлэг нь
            хүүхдүүдийнхээ MIN/MAX-аар бодогддог болсон тул энэ мөр нь
            «одоогоор бүлэг хаана байна» гэдгийг л хэлнэ; «мужаар нь авах»
            нь хурдан бөглөх туслах хэвээр. */}
        {pspan && (
          <p className={h.mdPar}>
            {tr('Бүлгийн муж')}: <b className="num">{msToDay(pspan.start)}</b>
            {' → '}<b className="num">{msToDay(pspan.end)}</b>
            {par?.work ? <span className={h.mdParWork}> · {par.work}</span> : null}
            {dEdit && (a !== msToDay(pspan.start) || z !== msToDay(pspan.end)) && (
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
            <input type="date" className={h.select} value={a} disabled={!dEdit}
              onChange={(e) => onStart(e.target.value)} />
          </label>
          {/* ⚠️ Үргэлжлэх хоног — бичихэд дуусах огноо автоматаар (2026-09-17) */}
          <label className={h.mdField}>
            {tr('Үргэлжлэх')}
            <span className={h.mdDays}>
              <input type="number" min={1} max={3650} className={h.numIn} value={durTxt}
                disabled={!dEdit || ms1 == null}
                placeholder={ms1 == null ? '—' : ''}
                aria-label={tr('Үргэлжлэх хоног')}
                title={ms1 == null ? tr('Эхлэх огноог эхлээд сонгоно') : tr('Хоног бичихэд дуусах огноо автоматаар бодогдоно')}
                onChange={(e) => onDur(e.target.value)} />
              {' '}{tr('хоног')}
            </span>
          </label>
          <label className={h.mdField}>
            {tr('Дуусах')}
            <input type="date" className={h.select} value={z} disabled={!dEdit}
              onChange={(e) => setZ(e.target.value)} />
          </label>
          {bad && <span className={h.mdDays}><b className={h.mdBad}>{tr('Дуусах нь эхлэхээс өмнө')}</b></span>}
        </div>

        {/* ── БОДИТ ОГНОО · НӨӨЦ (2026-09-23) ──
            ⚠️ Төлөвлөгөөт огнооноос ТУСДАА мөр: бодит нь БҮРТГЭЛ — гинж, бүлгийн
               муж, сарын задаргаанд нөлөөлөхгүй; хагас (эхэлсэн, дуусаагүй) хэвийн.
            ⚠️ Бүлэгт ЗӨВХӨН харуулна (хүүхдийн MIN/MAX · нийлбэр) — засагдахгүй.
            ⚠️ Талбаргүй үйлчилгээнд хэсэг ОГТ гарахгүй. */}
        {(hasActual || hasRes) && (
          <div className={h.mdDates}>
            {hasActual && (
              <label className={h.mdField}>
                {tr('Бодит эхэлсэн')}
                <input type="date" className={h.select} value={aa} disabled={!dEdit}
                  onChange={(e) => setAa(e.target.value)} />
              </label>
            )}
            {hasActual && (
              <label className={h.mdField}>
                {tr('Бодит дууссан')}
                <input type="date" className={h.select} value={az} disabled={!dEdit}
                  onChange={(e) => setAz(e.target.value)} />
              </label>
            )}
            {hasRes && (
              <label className={h.mdField}>
                {tr('Хүн хүч')}
                <input type="number" min={0} step={1} className={h.numIn} value={hunTxt} disabled={!dEdit}
                  aria-label={tr('Хүн хүч')} onChange={(e) => setHunTxt(e.target.value)} />
              </label>
            )}
            {hasRes && (
              <label className={h.mdField}>
                {tr('Машин механизм')}
                <input type="number" min={0} step={1} className={h.numIn} value={mashTxt} disabled={!dEdit}
                  aria-label={tr('Машин механизм')} onChange={(e) => setMashTxt(e.target.value)} />
              </label>
            )}
            {aBad && <span className={h.mdDays}><b className={h.mdBad}>{tr('Бодит дууссан нь эхэлснээс өмнө')}</b></span>}
          </div>
        )}


        {r.group && (
          <p className={h.mdPar}>
            {tr('Бүлгийн хугацаа нь доторх ажлуудынхаа хамгийн эрт эхлэх — хамгийн сүүл дуусахаар ӨӨРӨӨ бодогдоно. Гараар засахгүй: ажлуудаа зөөвөл бүлэг дагана.')}
          </p>
        )}

        {/* ── САРЫН ОБЬЁМ ──
            ⚠️ Хэрэглэгчийн шаардлага (2026-09-06): хуваарь татахад нийт
            обьёмыг хамарсан саруудад тараана; сар бүрд ӨӨР тоо бичиж болно;
            НИЙЛБЭР нь нийт обьёмтой ТЭНЦҮҮ байх ёстой — эс бөгөөс хуваарь
            оруулахыг ХААНА («Тавих» унтарна).
            ⚠️ Обьёмгүй мөрд ОРОЛТ ГАРАХГҮЙ: тараах нийт тоо байхгүй. Гэхдээ
            ШАЛТГААНЫГ нь бичнэ — эс бөгөөс «сарын хэсэг гарч ирэхгүй байна»
            гэсэн эргэлзээ үүснэ (2026-09-06-нд хэрэглэгч асуусан). */}
        {total == null && !r.group && (
          <p className={h.mdPar}>
            {tr('«Обьём» хоосон тул сарын задаргаа хийгдэхгүй.')}
          </p>
        )}
        {total != null && (
          <div className={h.mdDeps}>
            <div className={h.mdDepsHead}>
              {tr('Сарын обьём')}
              <span className={h.mdDepsN}>
                {/* ⚠️ 2 орны нарийвчлал (2026-09-17): обьём бутархай (900.35) байхад «900»
                    гэж харагдаж, нийлбэр 900 «0 дутуу» гэсэн ойлгомжгүй шалтгаанаар
                    «Тавих» хаагддаг байв. */}
                {tr('нийт')} {num(total, 2)}
              </span>
            </div>

            {mKeys.length === 0 ? (
              <p className={h.mdPar}>
                {tr('Огноо оруулмагц сарууд өөрөө гарч ирнэ.')}
              </p>
            ) : (
              <>
                {/* ⚠️ 12–32 сарын жагсаалт — ХОЁР БАГАНА болж эвхэгдэж,
                    дотроо гүйнэ (`mdMonths`). */}
                <div className={h.mdMonths}>
                {mKeys.map((k) => (
                  <div key={k} className={h.mdDepRow}>
                    <span className={h.mdMonth}>{k}</span>
                    <input
                      type="number"
                      className={`${h.numIn} ${h.mdMonthIn}`}
                      /* ⚠️ ХООСОН нь `0` БИШ: 0 бол «тэр сард ажил хийхгүй»
                         гэсэн БОДИТ төлөвлөгөө. Хоосон талбар нь Map-д ОГТ
                         БАЙХГҮЙ гэсэн үг. */
                      value={mv.get(k) ?? ''}
                      disabled={!canEdit}
                      min={0}
                      step="0.01"
                      aria-label={tr('{0}-ны обьём', k)}
                      onChange={(e) => {
                        const t = e.target.value.trim();
                        setMv((m) => {
                          const out = new Map(m);
                          if (t === '') out.delete(k);
                          else out.set(k, Math.max(0, Number(t) || 0));
                          return out;
                        });
                      }}
                    />
                  </div>
                ))}
                </div>

                {/* ⚠️ НИЙЛБЭР ба ЗӨРҮҮ нь ҮРГЭЛЖ ил: хэрэглэгч «Тавих» дарж
                    чадахгүй болсныг ШАЛТГААНТАЙ нь хамт харах ёстой. */}
                <p className={mvOk ? h.mdPar : h.mdWarn}>
                  {tr('Нийлбэр')}: <b className="num">{num(mvSum, 2)}</b>
                  {mvOk ? (
                    <> · {tr('нийт обьёмтой тэнцэв')}</>
                  ) : (
                    <>
                      {' · '}
                      <b className={h.mdBad}>
                        {mvDiff > 0 ? tr('{0}-аар илүү', num(mvDiff, 2)) : tr('{0} дутуу', num(-mvDiff, 2))}
                      </b>
                      {/* ⚠️ «ТЭНЦҮҮЛЭХ» ТОВЧ ХАСАГДСАН (2026-09-06): автомат
                          тараалт хийхгүй гэсэн шийдвэрийн дагуу. */}
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        )}

        {/* ── УЯЛДАА ХОЛБООС ──
            ⚠️ ДҮРЭМ БИШ, ЧАДВАР: уялдаа тавих нь бүрэн сонголт. Тавьсан үед
            урд ажил хөдлөхөд энэ ажил (болон түүнээс хамаарагчид) гинжээр
            дагана. Код бичихгүй — жагсаалтаас СОНГОНО, дугуй хамаарал үүсгэх
            ажлууд жагсаалтад ОРДОГГҮЙ (`depCands`). */}
        {hasHam && (
          <div className={h.mdDeps}>
            <div className={h.mdDepsHead}>
              {tr('Уялдаа — урд ажлууд')}
              {dl.length > 0 && <span className={h.mdDepsN}>{num(dl.length)}</span>}
            </div>
            {/* ⚠️ Түлхүүр нь ИНДЕКС — уялдаанд байгалийн ID алга (нэг кодыг
                хоёр мөрөнд сонгож болно), жагсаалт нь богино, зөвхөн locally
                засагддаг тул индекс аюулгүй. */}
            {dl.map((d, j) => (
              <div key={j} className={h.mdDepRow}>
                <select className={`${h.select} ${h.mdDepWork}`} value={d.code} disabled={!canEdit}
                  onChange={(e) => setDl((v) => v.map((x, k) => (k === j ? { ...x, code: Number(e.target.value) } : x)))}>
                  {/* Хуучин хадгалагдсан код нэр дэвшигчдэд байхгүй байж болно
                      (жиш. одоо дугуй үүсгэх байрлалд) — сонголт алдагдахгүйн
                      тулд тусдаа мөрөөр үлдээнэ */}
                  {!cands.some((c) => c.code === d.code) && (
                    <option value={d.code}>{d.code} · {tr('(жагсаалтад алга)')}</option>
                  )}
                  {cands.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
                <select className={h.select} value={d.type} disabled={!canEdit}
                  title={tr('FS — урд ажил дуусмагц · SS — урд ажилтай зэрэг эхэлнэ')}
                  onChange={(e) => setDl((v) => v.map((x, k) => (k === j ? { ...x, type: e.target.value as DepType } : x)))}>
                  <option value="FS">{tr('дуусаад (FS)')}</option>
                  <option value="SS">{tr('зэрэг (SS)')}</option>
                </select>
                {/* ⚠️ ±365-аар хязгаарлана: илүү том хоцролт нь бараг үргэлж
                    бичилтийн алдаа бөгөөд гинжийг хуанлиас хол шидНЭ */}
                <input type="number" className={h.numIn} value={d.lag} disabled={!canEdit}
                  min={-365} max={365} aria-label={tr('Хоцролт (хоног)')}
                  title={tr('Хоцролт: FS — дууссанаас, SS — эхэлснээс хойш хэд хоногийн дараа (сөрөг = давхцана)')}
                  onChange={(e) => setDl((v) => v.map((x, k) => (
                    k === j ? { ...x, lag: Math.max(-365, Math.min(365, Number(e.target.value) || 0)) } : x
                  )))} />
                <span className={h.mdDepD}>{tr('хоног')}</span>
                {canEdit && (
                  <button type="button" className={h.mdDepX} aria-label={tr('Уялдаа устгах')}
                    onClick={() => setDl((v) => v.filter((_, k) => k !== j))}>×</button>
                )}
              </div>
            ))}
            {canEdit && (
              <button type="button" className={h.tlZoomB} disabled={!cands.length}
                onClick={() => setDl((v) => [...v, { code: cands[0].code, type: 'FS', lag: 0 }])}>
                + {tr('Уялдаа нэмэх')}
              </button>
            )}
          </div>
        )}

        {/* ⚠️ АЛХМЫН ТАЛБАР ЭНД (2026-09-02): урьд нь дээд зурваст байсан ч
            зөвхөн ЭНЭ тэмдэглэгээнд үйлчилдэг байв — хэрэглэгч тэмдэглэгээг
            уншаад алхмаа өөрчлөхийн тулд popup хааж, зурвас руу гарч, буцаж
            нээх шаардлагатай байлаа. Утга нь Huvaari-д (`takt`) хадгалагдана
            тул дараагийн ажилд дахин бичихгүй.
            ⚠️ 365-аар хязгаарлана: санамсаргүй нэмэлт тэг нь зурвасуудыг
            хуанлиас хол гаргаж, буцааж олох аргагүй болгоно. */}
        {/* ⚠️ ТООН ТАЛБАР нь `label`-ААС ГАДНА. Дотор нь оруулбал зарим хөтөч
            дээр талбар дээр товшихад тэмдэглэгээ солигдож, «бүх блокт тараах»
            санамсаргүй асаж 22 блокийн хуваарь дарагдах эрсдэлтэй. */}
        {dEdit && (
          <div className={h.mdAll}>
            <label className={h.mdAllChk}>
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
              {tr('Бүх {0} блокт', num(blocks.length))}
            </label>
            <input type="number" min={0} max={365} className={h.numIn} value={takt}
              aria-label={tr('Алхам')}
              onChange={(e) => onTakt(Math.min(365, Math.max(0, Number(e.target.value) || 0)))} />
            <span>{tr('хоногийн алхмаар тараах')}</span>
          </div>
        )}

        <footer className={h.mdFoot}>
          {dEdit && (
            <button type="button" className={h.tlZoomB} onClick={clear}
              disabled={!r.spans.some(Boolean)}>
              {tr('Арилгах')}
            </button>
          )}
          <span className={h.spacer} />
          <button type="button" className={h.tlZoomB} onClick={onClose}>{tr('Хаах')}</button>
          {canEdit && (
            <button type="button" className={h.save} onClick={apply}
              disabled={r.group
                ? !depsDirty
                : aBad ? true
                : depsOnly ? false
                : ((ms1 == null || ms2 == null || bad) && !depsDirty && !extraDirty) || !mvOk}
              title={mvOk || depsOnly ? undefined : tr('Сарын обьёмын нийлбэр нийт обьёмтой тэнцээгүй')}>
              {tr('Тавих')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

/**
 * ХОЛБОХ ЦОНХ — шугамаар чирж холбосны дараа гарна (2026-09-22, хэрэглэгч:
 * «чирээд холбосны дараа эхлээд дуусах / зэрэг эхлэх болон хоног заах цонх
 * гарах ёстой»). Зөвхөн ХОЁР сонголт: төрөл (FS — урд ажил дуусаад · SS —
 * урд ажилтай зэрэг эхэлнэ) ба хоцролтын хоног (±365). «Тавих» → `applyModal`
 * (дугуй/шатлалын шалгуур тэнд). Урд ажил аль хэдийн уялдаанд байвал утгыг
 * нь урьдчилан дүүргэж ЗАСНА.
 */
function LinkModal({ src, dst, onClose, onApply, onRemove }: {
  src: PlanRow;
  dst: PlanRow;
  onClose: () => void;
  onApply: (type: DepType, lag: number) => void;
  /** Байгаа уялдааг устгах — зөвхөн `cur` байвал товч гарна */
  onRemove?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  /* ⚠️ (2026-09-23) `autoFocus` ажилладаггүй байв — `useFocusTrap` эхний фокус
     авагч (`×`) руу фокуслодог. Энэ эффект урхийн ДАРАА (мөрийн дарааллаар)
     ажиллаж, төрлийн сонгогч руу шилжүүлнэ. */
  const selRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { selRef.current?.focus(); }, []);
  const cur = dst.deps.find((d) => d.code === src.des);
  const [type, setType] = useState<DepType>(cur?.type ?? 'FS');
  const [lag, setLag] = useState<number>(cur?.lag ?? 0);
  const name = (r: PlanRow) => `${r.des ?? '—'} · ${r.work || r.no}`;
  return (
    <div className={h.mdBack} role="presentation" onClick={onClose}>
      <div ref={ref} className={h.md} role="dialog" aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { onClose(); return; }
          if (e.key !== 'Enter') return;
          /* ⚠️ (2026-09-23) Enter нь ЗӨВХӨН сонгогч/тоон талбар дээр «Тавих» —
             товч дээр (Болих · × · Уялдаа устгах) байхад товчны өөрийн click
             ажиллана, эс бөгөөс «Болих» дээр Enter дарахад уялдаа тавигддаг байв. */
          const tag = (e.target as HTMLElement).tagName;
          if (tag === 'SELECT' || tag === 'INPUT') { e.preventDefault(); onApply(type, lag); }
        }}>
        <header className={h.mdHead}>
          <b className={h.mdWork}>{tr('Хамаарал холбох')}</b>
          <button type="button" className={h.mdX} onClick={onClose} aria-label={tr('Хаах')}>×</button>
        </header>
        <div className={h.mdPar}>
          <span>{tr('Урд ажил:')} <b>{name(src)}</b></span>
          <br />
          <span>{tr('Хамаарагч:')} <b>{name(dst)}</b></span>
        </div>
        <div className={h.mdDepRow}>
          <select className={h.select} value={type} ref={selRef}
            title={tr('FS — урд ажил дуусмагц · SS — урд ажилтай зэрэг эхэлнэ')}
            onChange={(e) => setType(e.target.value as DepType)}>
            <option value="FS">{tr('дуусаад эхэлнэ (FS)')}</option>
            <option value="SS">{tr('зэрэг эхэлнэ (SS)')}</option>
          </select>
          <input type="number" className={h.numIn} value={lag} min={-365} max={365}
            aria-label={tr('Хоцролт (хоног)')}
            title={tr('Хоцролт: FS — дууссанаас, SS — эхэлснээс хойш хэд хоногийн дараа (сөрөг = давхцана)')}
            onChange={(e) => setLag(Math.max(-365, Math.min(365, Number(e.target.value) || 0)))} />
          <span className={h.mdDepD}>{tr('хоног')}</span>
        </div>
        <footer className={h.mdFoot}>
          {cur && onRemove && (
            <button type="button" className={h.discard} onClick={onRemove}>{tr('Уялдаа устгах')}</button>
          )}
          <span className={h.spacer} />
          <button type="button" className={h.tlZoomB} onClick={onClose}>{tr('Болих')}</button>
          <button type="button" className={h.save} onClick={() => onApply(type, lag)}>{tr('Тавих')}</button>
        </footer>
      </div>
    </div>
  );
}
