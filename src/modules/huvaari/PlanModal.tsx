'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { msToDay } from '@/modules/sheet/bagtsSheet';
import { DAY, endOf, spanDays, type PlanRow, type Span } from '@/lib/plan';
import { formatDeps, type Dep, type DepType } from '@/lib/deps';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { balanced, monthsOf, sumMonths, sumRes, type MonthRes } from '@/lib/huvaariObyem';
import { dayToMs, sameRes } from './util';
import h from '../huvaari.module.css';

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
/**
 * ХОЦРОЛТЫН (lag) ТАЛБАР — хоногоор, ±365.
 * ⚠️ 2026-09-30: Урьд нь `Number(v) || 0`-оор шууд хяналттай байсан тул «-»
 *    бичихэд (хөтөч түр `''` өгдөг) утга 0 болж, «-5» бичих боломжгүй/тэмдэг
 *    эргэдэг байв. Бичиж байхад ОРОН НУТГИЙН мөр хадгалж, хүчинтэй бүхэл тоо
 *    болмогц л дээш өгнө; хүчингүй үлдвэл blur-д сүүлийн утгаа сэргээнэ.
 */
export function LagInput({ value, disabled, onCommit }: {
  value: number;
  disabled?: boolean;
  onCommit: (n: number) => void;
}) {
  const [txt, setTxt] = useState(String(value));
  /* Гаднаас (өөр замаар) өөрчлөгдвөл дагана — бичиж буй мөр ижил тоо бол хөндөхгүй.
     ⚠️ 2026-09-30: эффект БИШ, зурагдалтын дунд «өмнөх prop»-той тулгаж тавина
        (React-ийн «adjust state on prop change» хэв маяг) — завсрын зурагдалтгүй, утга ижил. */
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (!(txt.trim() !== '' && Number(txt) === value)) setTxt(String(value));
  }
  return (
    <input type="number" className={h.numIn} value={txt} disabled={disabled}
      min={-365} max={365} step={1} aria-label={tr('Хоцролт (хоног)')}
      title={tr('Хоцролт: FS — дууссанаас, SS — эхэлснээс хойш хэд хоногийн дараа (сөрөг = давхцана)')}
      onChange={(e) => {
        const t = e.target.value;
        setTxt(t);
        const n = Number(t);
        if (t.trim() !== '' && Number.isFinite(n)) onCommit(Math.max(-365, Math.min(365, Math.trunc(n))));
      }}
      onBlur={() => setTxt(String(value))} />
  );
}

type PlanModalProps = {
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
  /** ЕРӨНХИЙ олон блокийн сонголт (2026-09-29) — цонх эдгээрийг урьдчилан сонгосон нээгдэнэ */
  initSel?: ReadonlySet<number>;
  /** Үйлчилгээнд `Hamaaral` талбар бий эсэх — үгүй бол уялдааны хэсэг нуугдана */
  hasHam: boolean;
  /** Бодит огноо · нөөцийн талбар үйлчилгээнд бий эсэх (2026-09-23) — үгүй бол хэсэг нуугдана */
  hasActual: boolean;
  /** ⚠️ Хадгалагдана — дуудагч дамжуулдаг; popup-д мөрийн нөөц засагдахгүй болсон (2026-09-24) */
  hasRes?: boolean;
  /** Сарын обьём/нөөцийн хэсэг гарах уу — гэрээ табд `false` (2026-09-29): «Тавих» нийлбэр шаардахгүй, `ob` null */
  obyem?: boolean;
  /** ЭНЭ блокийн хадгалагдсан/ноорог сарын задаргаа */
  months: Map<string, number>;
  /** ЭНЭ блокийн хадгалагдсан/ноорог сарын НӨӨЦ (2026-09-24) */
  res: Map<string, MonthRes>;
  /** Сарын хүснэгтэд нөөцийн талбар бий эсэх — `false` бол анхааруулна (`null` = мэдэхгүй) */
  resFields: { hun: boolean | null; mashin: boolean | null };
  onClose: () => void;
  /**
   * «Тавих»/«Арилгах» — огноо · уялдаа · сарын обьём+нөөц · бодит огноо · нөөц
   * НЭГ алхамд (null = хөндөхгүй). `blks` — сонгосон блокууд (2026-09-24):
   * `spans` тэдгээрт аль хэдийн тавигдсан; `ob` тэдгээрт хуулагдана;
   * `actual` нь ЗӨВХӨН идэвхтэй `blk`-д (бүртгэл, 2026-09-24 аудит).
   * ⚠️ `actual`/`res` (2026-09-23) нь гинжээс ГАДУУР — дуудагч `applyExtra`-д өгнө.
   */
  onApply: (
    spans: (Span | null)[] | null,
    deps: Dep[] | null,
    ob: { months: Map<string, number> | null; res: Map<string, MonthRes> | null } | null,
    actual: { start: number | null; end: number | null } | null,
    res: { hun: number | null; mashin: number | null } | null,
    blks: number[],
    /** Бодит огноо тавигдах блокууд (2026-09-29) — сонгосон бүгд */
    actBlks: number[],
  ) => void;
};

/**
 * ⚠️ 2026-09-30: МӨР (oid) солигдоход цонхны төлөв `key`-ээр ДАХИН ҮҮСНЭ — урьд нь
 *    `[r.oid]`-ээр түлхүүрлэсэн 4 эффект (сонгосон блок · уялдаа · бодит огноо ·
 *    сар/нөөц) талбаруудыг тэглэдэг байв (react-hooks/set-state-in-effect). Одоо тэр
 *    утгууд `useState`-ийн АНХНЫ утга; блок (`blk`) · эцэг бүлэг солигдох нь доорх
 *    «өмнөх prop»-той тулгах хэсэгт. Зан төлөв ижил: мөр солигдоход бүх талбар шинээр,
 *    блок солигдоход зөвхөн блокоос хамаарах талбар.
 */
export function PlanModal(props: PlanModalProps) {
  return <PlanModalBody key={props.r.oid} {...props} />;
}

/** Төлөвлөгөөт огнооны талбарын АНХНЫ утга — мөр · эцэг · блокоос (2026-09-30: эффектээс initializer болов) */
function initPlanDates(r: PlanRow, par: PlanRow | null, blk: number): { a: string; z: string } {
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
  return { a: s ? msToDay(s.start) : '', z: s ? msToDay(s.end) : '' };
}
/** Бодит огнооны талбарын АНХНЫ утга — мөр · блокоос */
function initActual(r: PlanRow, blk: number): { aa: string; az: string } {
  const s = r.aStart?.[blk] ?? null;
  const e = r.aEnd?.[blk] ?? null;
  return { aa: s != null ? msToDay(s) : '', az: e != null ? msToDay(e) : '' };
}

function PlanModalBody({
  r, par, blocks, blk, initSel, takt, canEdit, onBlk, onTakt, cands, hasHam, hasActual, obyem = true, months, res, resFields, onClose, onApply,
}: PlanModalProps) {
  /* ⚠️ ФОКУСЫН УРХИ (2026-09-03-ны аудит): `aria-modal` нь дэлгэц уншигчид л
     хэлдэг, хөтчийн Tab-д нөлөөгүй — урхигүй үед Tab дарсаар байхад фокус
     цонхноос гарч ард байгаа 1,400 мөрт төөрдөг байв. */
  const mdRef = useRef<HTMLDivElement>(null);
  useFocusTrap(mdRef);

  /* ⚠️ ТАЛБАР ТАВИХ ЭФФЕКТҮҮД `r.oid`/`blk`-ЭЭР (2026-09-24): хуваалцсан ноорогийн
     3 с мөчлөг `setDraft(new Map)` хийхэд `r` объект дахин үүсч, бичиж байх
     үед талбарууд тэглэгдэж байв. Мөр (oid) ба блок солигдоход л тавина.
     ⚠️ 2026-09-30: `r.oid` нь `key` (дээрх `PlanModal`), `blk`/эцэг нь доорх
        «өмнөх prop» тулгалт — эффект байхгүй, дүрэм ижил. */
  const [a, setA] = useState(() => initPlanDates(r, par, blk).a);
  const [z, setZ] = useState(() => initPlanDates(r, par, blk).z);
  /**
   * СОНГОСОН БЛОКУУД (2026-09-24, хэрэглэгч: «блокийг олноор сонгож нэг
   * төлөвлөлтийг зэрэг тавина»). Идэвхтэй `blk` (огноо/сарын суурь эндээс)
   * ҮРГЭЛЖ дотор нь. Мөр солиход зөвхөн идэвхтэй блок үлдэнэ. «Бүх блокт»
   * checkbox-ыг орлоно.
   * ⚠️ Чип НЭМЭХЭД идэвхтэй блок СОЛИГДОХГҮЙ (2026-09-24 аудит): урьд нь сүүлд
   *    сонгосон нь идэвхтэй болдог тул `blk`-ээр түлхүүрлэсэн эффектүүд
   *    (огноо, бодит огноо, сар/нөөц) бичсэн утгыг тэглэж байв. Зөвхөн
   *    идэвхтэйг нь хасахад л хамгийн доод үлдсэн блок руу шилжинэ.
   */
  /* ⚠️ 2026-09-29: ерөнхий сонголт (`initSel`) + идэвхтэй блок; бүлгийн мөрд хамаарахгүй */
  const selInit = () => new Set([blk, ...(initSel ?? []).values()].filter((k) => k >= 0 && k < blocks.length));
  const [selB, setSelB] = useState<Set<number>>(selInit);
  const toggleB = (k: number) => {
    if (!dEdit) { onBlk(k); return; }
    setSelB((s) => {
      const next = new Set(s);
      if (next.has(k)) {
        /* Сүүлчийнхийг хасахгүй — хоосон сонголтод «Тавих» утгагүй */
        if (next.size === 1) return s;
        next.delete(k);
        if (k === blk) onBlk(Math.min(...next));
      } else {
        next.add(k);
      }
      return next;
    });
  };
  /** Уялдааны түр жагсаалт — «Тавих» дартал эх мөрөө хөндөхгүй */
  const [dl, setDl] = useState<Dep[]>(r.deps);
  /* ⚠️ Эх мөрийн уялдаа ЦОНХ НЭЭЛТТЭЙ байхад солигдвол (хуваалцсан нооргоос
     ирсэн г.м.) хэрэглэгч хөндөөгүй л бол дагуулна (2026-09-24 аудит) —
     урьд нь хуучин жагсаалт «Тавих»-аар буцаж бичигддэг байв.
     ⚠️ 2026-09-30: эффект + ref-ийн оронд «өмнөх prop» state — ижил дүрэм. */
  const depsTxt = formatDeps(r.deps);
  const [depsTxtPrev, setDepsTxtPrev] = useState(depsTxt);
  if (depsTxtPrev !== depsTxt) {
    setDepsTxtPrev(depsTxt);
    if (formatDeps(dl) === depsTxtPrev) setDl(r.deps);
  }

  /**
   * БОДИТ ЭХЭЛСЭН / ДУУССАН (энэ блок) ба ХҮН ХҮЧ / МАШИН (мөр) — 2026-09-23.
   * ⚠️ Төлөвлөгөөт огнооноос ТУСДАА төлөв: бүлгийн мужаар урьдчилан
   *    бөглөхгүй, «мужаар нь авах» нөлөөлөхгүй, `all` (бүх блокт тараах)
   *    хамаарахгүй — бодит нь бүртгэл, таамаглахгүй. Хоосон = `null`.
   */
  const [aa, setAa] = useState(() => initActual(r, blk).aa);
  const [az, setAz] = useState(() => initActual(r, blk).az);
  /* ⚠️ 2026-09-29 (аудит 10): хэрэглэгч бодит огнооны талбарыг ӨӨРӨӨ хөндсөн үү —
     хөндөөгүй бол «Тавих» бодит огноог огт бичихгүй (доорх `actDirty`). Мөр/блок
     солигдоход талбар дахин бөглөгддөг тул тэглэнэ (доорх `blk` тулгалт). */
  const [actTouched, setActTouched] = useState(false);
  const am1 = dayToMs(aa);
  const am2 = dayToMs(az);
  const aBad = am1 != null && am2 != null && am1 > am2;
  /* ⚠️ 2026-09-29: СОНГОСОН блок бүртэй тулгана — идэвхтэй блок аль хэдийн ижил утгатай
     ч бусад сонгосон блокт тавигдах ёстой (урьд нь зөвхөн идэвхтэй блокоор шийддэг тул
     олон блокт «Тавих» юу ч хийдэггүй байв). */
  /* ⚠️ 2026-09-29 (аудит 10): ЗӨВХӨН талбарыг хөндсөн үед (`actTouched`). Урьд нь идэвхтэй
     блокийн бодит огноо хоосон, сонгосон өөр блок бүртгэлтэй бол төлөвлөсөн огноог олон
     блокт тавихад `actArg = {null, null}` болж тэр блокийн БҮРТГЭГДСЭН бодит огноо
     чимээгүй арчигддаг байв (`applyExtra` → `save`). Бодит нь бүртгэл — таамаглаж хуулахгүй. */
  const actDirty = actTouched && [...selB].some((b) => (am1 ?? null) !== (r.aStart?.[b] ?? null) || (am2 ?? null) !== (r.aEnd?.[b] ?? null));
  /* ⚠️ МӨРИЙН хүн/машин popup-аас ЗАСАГДАХГҮЙ (2026-09-24, хэрэглэгч: «дээд талын
     үндсэн хүн хүч машин механизм бөглөлт хэрэггүй, сар сард төлөвлөнө») — мөрийн
     утга нь хадгалахад саруудын нийлбэрээр бичигдэнэ (`save`). */
  const extraDirty = actDirty && !aBad;
  /** Popup-аас `onApply`-д өгөх бодит огноо · нөөц — хөндөөгүй бол `null` */
  const actArg = actDirty && !aBad ? { start: am1, end: am2 } : null;

  /**
   * Блок эсвэл мөр солигдвол талбарууд дагаж шинэчлэгдэнэ.
   *
   * ⚠️ ХУВААРЬГҮЙ АЖИЛД БҮЛГИЙН МУЖИЙГ УРЬДЧИЛЖ ТАВИНА (2026-09-01,
   *    хэрэглэгч: «том бүлгийнх нь он сарыг шууд авна, тэгээд түүн дээрээ
   *    өөрчилнө»). Хоосон талбараас эхлэх нь утгагүй ажил: бүлгийн муж
   *    аль хэдийн мэдэгдэж байгаа бөгөөд хүүхэд нь ямар ч тохиолдолд
   *    түүний дотор багтана. Одоо байгаа хуваарийг ХӨНДӨХГҮЙ — тэр нь
   *    бодит өгөгдөл, түүнийг «Бүлгийн мужаар» товчоор л дарж солино.
   * ⚠️ 2026-09-30: дүрэм нь `initPlanDates` (дээр); мөр солигдоход `key`,
   *    эцэг бүлэг солигдоход доорх «өмнөх prop» тулгалт (блокийнхтой хамт).
   */

  /* ⚠️ 2026-09-30: Esc/ард товшиход бичсэн огноо, сарын хүснэгт ЧИМЭЭГҮЙ алдагддаг
     байв — оруулсан зүйл байвал асууна. `mdDirtyRef` нь доор (бүх dirty бодогдсоны
     дараа) зурагдалт бүрд шинэчлэгдэнэ; эффект дахин бүртгэгдэхгүйн тулд ref. */
  const mdDirtyRef = useRef(false);
  const tryClose = useCallback(() => {
    if (mdDirtyRef.current && !window.confirm(tr('Оруулсан өөрчлөлт хадгалагдаагүй — хаяж цонхыг хаах уу?'))) return;
    onClose();
  }, [onClose]);
  /* ⚠️ 2026-09-30: Талбар дотор дараад (сонголт/чирэлт) АРД суллахад `click` нь
     арын элемент дээр буудаг тул цонх санамсаргүй хаагддаг байв — дарах нь ч
     ард эхэлсэн үед л хаана. */
  const downOnBack = useRef(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') tryClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [tryClose]);

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
  const [durTxt, setDurTxt] = useState(() => (days != null ? String(days) : ''));
  /* ⚠️ 2026-09-30: `days` солигдоход дагах — эффект биш, «өмнөх утга» тулгалт (утга ижил) */
  const [prevDays, setPrevDays] = useState(days);
  if (days !== prevDays) {
    setPrevDays(days);
    setDurTxt(days != null ? String(days) : '');
  }
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
  /* ⚠️ `obyem=false` (гэрээ таб) — сарын хэсэг огт гарахгүй, `mvOk` үргэлж үнэн */
  const total = obyem && r.vol != null && r.vol > 0 ? r.vol : null;
  /* ⚠️ 2026-09-30: `mvAll`/`mrAll` нь мужаас ГАДУУРХ сарыг ч ХАДГАЛНА — доорх
     `mv`/`mr` нь одоогийн мужаар шүүсэн ХАРАГДАЦ. Огноог бичиж байхад (завсрын
     утга) сарын утга устахгүй; «Тавих» нь зөвхөн шүүсэн `mv`/`mr`-ийг өгнө. */
  const [mvAll, setMv] = useState<Map<string, number>>(months);
  /** Сарын НӨӨЦ (хүн хүч · машин) — `mv`-тэй зэрэгцээ (2026-09-24) */
  const [mrAll, setMr] = useState<Map<string, MonthRes>>(res);
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
   * ⚠️ 2026-09-30: мөр солигдоход `key` (анхны утга `months`/`res`), блок
   *    солигдоход доорх тулгалт — эффект байхгүй.
   */
  /*
   * БЛОК · ЭЦЭГ БҮЛЭГ СОЛИГДОХОД ТАЛБАРУУД ДАГАНА (2026-09-30: урьд `[blk]`/`[r.oid, blk]`/
   * `[r.oid, par?.oid, blk]`-ээр түлхүүрлэсэн 5 эффект). React-ийн «өмнөх prop-той
   * тулгаж зурагдалтын дунд setState» хэв маяг — дараагийн зурагдалт шууд, завсрын
   * зурагдалтгүй. Дүрэм бүр урьдынхтай ИЖИЛ:
   *   · сонгосон блокт идэвхтэйг нэмнэ (2026-09-24-ний «чип нэмэхэд идэвхтэй солигдохгүй»);
   *   · бодит огноо · `actTouched` тэглэнэ; төлөвлөгөөт огноо `initPlanDates`;
   *   · сар/нөөцийн суурь хадгалагдсанаараа.
   * Эцэг бүлэг (`par?.oid`) солигдоход зөвхөн төлөвлөгөөт огноо (урьдын deps-ийн дагуу).
   */
  const [prevBlk, setPrevBlk] = useState(blk);
  const [prevParOid, setPrevParOid] = useState(par?.oid ?? null);
  if (blk !== prevBlk) {
    setPrevBlk(blk);
    setSelB((s) => (s.has(blk) ? s : new Set([...s, blk])));
    const ai = initActual(r, blk);
    setAa(ai.aa); setAz(ai.az); setActTouched(false);
    const pi = initPlanDates(r, par, blk);
    setA(pi.a); setZ(pi.z);
    setMv(months); setMr(res);
  }
  if ((par?.oid ?? null) !== prevParOid) {
    setPrevParOid(par?.oid ?? null);
    if (blk === prevBlk) { const pi = initPlanDates(r, par, blk); setA(pi.a); setZ(pi.z); }
  }
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
  /* ⚠️ МУЖ ХООСОН бол ТАЙРАХГҮЙ (2026-09-25 аудит). Эхний зурагдалтад `a`/`z`
     нь '' (урьдчилан бөглөх эффект ДАРАА нь тавина) тул `mKeys = []` бөгөөд энэ
     эффект нэг flush-д `setMv(months)`-ийн ард ажиллаж хадгалагдсан БҮХ сарыг
     «мужаас гадуур» гэж арчдаг байв — цонх нээх бүрд сарын обьём/нөөц хоосорч,
     «Тавих» дарахад сарын хүн/машин устдаг байлаа. Огноо түр хоосон (засаж буй)
     үед ч сарын утга хадгалагдана; хүчинтэй муж тавигдмагц энэ эффект тайрна. */
  /* ⚠️ 2026-09-30: ЭФФЕКТЭЭР ТАЙРАХАА БОЛИВ — огноог гараар бичих үеийн завсрын
     утга (жиш. он «2» гэж эхлэх) мужийг богиносгож, бичсэн сарын обьём/нөөцийг
     шууд УСТГАДАГ байв. Одоо төлөвт хадгалж, зөвхөн ХАРАГДАЦ/нийлбэр/«Тавих»-д
     шүүнэ; муж буцаж өргөсөхөд утга эргэж гарна. Муж хоосон бол шүүхгүй (дээрх
     2026-09-25-ны дүрэм хэвээр). */
  const mv = useMemo(() => {
    if (!mKeys.length) return mvAll;
    let extra = false;
    for (const k of mvAll.keys()) if (!mKeys.includes(k)) { extra = true; break; }
    if (!extra) return mvAll;
    const out = new Map<string, number>();
    for (const k of mKeys) { const v = mvAll.get(k); if (v != null) out.set(k, v); }
    return out;
  }, [mvAll, mKeys]);
  const mr = useMemo(() => {
    if (!mKeys.length) return mrAll;
    let extra = false;
    for (const k of mrAll.keys()) if (!mKeys.includes(k)) { extra = true; break; }
    if (!extra) return mrAll;
    const out = new Map<string, MonthRes>();
    for (const k of mKeys) { const v = mrAll.get(k); if (v) out.set(k, v); }
    return out;
  }, [mrAll, mKeys]);
  /** Нэг сарын нөөцийн нэг талбарыг бичнэ — хоосон = `null`; хоёулаа null болвол сар Map-аас хасагдана.
      ⚠️ Тоо биш («abc») ч `null` (2026-09-24 аудит) — урьд нь 0 болж «тэг нөөц» гэж бичигддэг байв. */
  const setMrCell = (k: string, f: 'hun' | 'mashin', t: string) => {
    const s = t.trim();
    /* ⚠️ Сөрөг тоо ч `null` (2026-09-24 аудит) — урьд нь 0 болж «тэг нөөц» бичигддэг байв. */
    const nv = Number(s);
    const v = s === '' || !Number.isFinite(nv) || nv < 0 ? null : Math.floor(nv);
    setMr((m) => {
      const out = new Map(m);
      const cur = out.get(k) ?? { hun: null, mashin: null };
      const next = { ...cur, [f]: v };
      if (next.hun == null && next.mashin == null) out.delete(k); else out.set(k, next);
      return out;
    });
  };
  const mrSum = sumRes(mr);
  /** Сарын нөөц БАЙНА — мөрийн хүн/машин талбар зөвхөн харагдана (нийлбэр) */
  const mrHas = mrSum.hun != null || mrSum.mashin != null;
  const mrDirty = !sameRes(mr, res);
  /* ⚠️ Сарын нөөц байвал мөрийн талбарыг ХАДГАЛАХ ЗАМ өөрөө нийлбэрээр бичнэ (2026-09-24) */
  const resArg = null;

  const mvSum = sumMonths(mv);
  /* ⚠️ БҮХ сар бөглөгдсөн байх ёстой: нэг сар хоосон атлаа нийлбэр таарвал
     тэр сарын төлөвлөгөө өгөгдөлд ОГТ үүсэхгүй. */
  const mvFull = mKeys.every((k) => mv.get(k) != null);
  const mvOk = total == null || (mvFull && balanced(mv, total));
  const mvDiff = total == null ? 0 : mvSum - total;
  /*
   * ⚠️ ФОКУСТАЙ САРЫГ ОРУУЛАХГҮЙ ҮЛДЭГДЭЛ (2026-09-24, хэрэглэгч: «сүүлийн сард 5
   *    гэж бичихэд тэр нь хасагдаад жинхэнэ үлдэгдэл харагдахгүй»). «Нийлбэр /
   *    дутуу» мөр нь бичиж буй сарыг ч тоолдог тул бичих тусам үлдэгдэл хөдөлж,
   *    ЯГ хэд бичихээ мэдэх аргагүй байв. Одоо бичиж буй сарын өмнөх төлөвөөс
   *    (бусад бүх сар) үлдэгдлийг тусад нь харуулж, нэг товшилтоор бөглөнө.
   */
  const [mFocus, setMFocus] = useState<string | null>(null);
  /* ⚠️ `balanced`-ын алхам 0.01 тул 2 орноор бөөрөнхийлнө; `-0` → `0` (2026-09-24
     аудит: «-0» гэж харагдаж, `>= 0` нь ч тохиолдлоор зөрдөг байв). */
  const mRest = total != null && mFocus != null
    ? (Math.round((total - (mvSum - (mv.get(mFocus) ?? 0))) * 100) / 100) || 0
    : null;

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
  /* ⚠️ ОЛОН БЛОК сонгосон бол ХӨНГӨН БИШ (2026-09-24): муж хөндөгдөөгүй ч бусад
     сонгосон блокт хуулагдах ёстой. Сарын нөөц (`mrDirty`) ч бүтэн замаар. */
  /* ⚠️ УРЬДЧИЛАН БӨГЛӨСӨН МУЖ (2026-09-25 аудит): хуваарьгүй (эсвэл мужаас гадуур
     хуучирсан) ажилд талбарууд бүлгийн мужаар бөглөгддөг тул `spanDirty` үргэлж
     үнэн — обьёмтой ч задаргаагүй ажилд ганц уялдаа тавихад «Тавих» бүх сарыг
     бөглөхийг шаардаж, дээрх 2026-09-17-ны дүрэм ажилладаггүй байв. Хэрэглэгч
     бөглөсөн мужийг хөндөөгүй БӨГӨӨД сарын нийлбэр таараагүй (өөрөөр хуваарь
     тавих боломжгүй) бол «хөнгөн» замаар зөвхөн уялдаа/бодит огноог тавина.
     Обьёмгүй мөрд (`mvOk`) хуучин зан хэвээр — муж нь хуваарь болж тавигдана. */
  const pStale = !!(own && pspan && (own.end < pspan.start || own.start > pspan.end));
  const prefilled = !!pspan && (!own || pStale) && ms1 === pspan.start && ms2 === pspan.end;
  const depsOnly = (depsDirty || extraDirty) && (!spanDirty || (prefilled && !mvOk))
    && !mvDirty && !mrDirty && selB.size === 1;
  /** Сарын обьём + нөөц — «Тавих»-д өгөх багц; обьёмгүй мөрд обьём хөндөхгүй.
      ⚠️ Нөөц хөндөгдөөгүй, хоосон бол `null` (2026-09-24 аудит) — урьд нь үргэлж
         `mr` өгч, олон блокт тавихад бусад блокийн серверийн нөөц арчигддаг байв. */
  /** ЗӨВХӨН бодит огноо (ба уялдаа) хөндөгдсөн — олон блок сонгосон ч төлөвлөгөөг хуулахгүй (2026-09-29) */
  const extraOnly = extraDirty && (!spanDirty || prefilled) && !mvDirty && !mrDirty;
  /* ⚠️ 2026-09-30: Хаахаас өмнө асуух «оруулсан зүйл бий» — ТАЙРААГҮЙ төлөвийг
     (`mvAll`/`mrAll`) харьцуулна: шүүсэн `mv` нь хуучирсан мужийн сарыг хасдаг тул
     хэрэглэгч юу ч бичээгүй атлаа «өөрчлөгдсөн» гэж асуухгүй. Урьдчилан бөглөсөн
     бүлгийн муж (`prefilled`) ч хэрэглэгчийн оролт биш. */
  const mdDirty = canEdit && (
    (dEdit && spanDirty && !prefilled)
    || depsDirty
    || actDirty
    || mvAll.size !== months.size || [...mvAll].some(([k, v]) => months.get(k) !== v)
    || !sameRes(mrAll, res)
  );
  /* ⚠️ 2026-09-30: зурагдалтын дунд биш, commit-ийн дараа (`useLayoutEffect`) — `tryClose`
     үйл явдлын хариулагч тул ижил утгыг харна (react-hooks/refs). */
  useLayoutEffect(() => { mdDirtyRef.current = mdDirty; });
  /* ⚠️ 2026-09-29 (аудит 10): гэрээ табд (`obyem=false`) сарын нөөцийг ХЭЗЭЭ Ч өгөхгүй —
     сарын хэсэг харагдахгүй атлаа `mr` нь төлөвлөгөөний нөөцөөр бөглөгддөг тул гэрээний
     огноо тавихад бусад сонгосон блокийн төлөвлөсөн хүн/машин дарагддаг байв. */
  const obArg = { months: total == null ? null : mv, res: obyem && (mrDirty || mrHas) ? mr : null };
  /* ⚠️ Алхам 0 → сар/нөөц/бодит огноо СОНГОСОН БҮХ блокт (мужууд ижил);
     алхам >0 → зөвхөн идэвхтэй блокт (бусдын муж шилжсэн тул сарууд зөрнө,
     `applyChanges` тэднийг `keepMonths`/`keepRes`-ээр өөрөө бэлтгэнэ). */
  const obBlks = takt > 0 ? [blk] : [...selB];
  /** Бодит огноо тавигдах блокууд (2026-09-29) — сонгосон бүгд, алхамаас үл хамаарна */
  const actBlks = [...selB];

  const apply = () => {
    /* ⚠️ Бүлэгт огноо ОГТ бичихгүй — зөвхөн уялдаа (бодит огноо · нөөц ч бүлэгт
       хаалттай: `aggExtra`-аар бодогдоно). */
    if (r.group) { if (depsDirty) onApply(null, dl, null, null, null, [blk], [blk]); onClose(); return; }
    if (ms1 == null || ms2 == null || bad) {
      /* Огноо буруу ч УЯЛДАА · бодит огноо · нөөцийг дангаар нь тавьж болно —
         төлөвлөгөөт огноог хөндөхгүй */
      if (depsDirty || extraDirty) { onApply(null, depsDirty ? dl : null, null, actArg, resArg, obBlks, actBlks); onClose(); }
      return;
    }
    if (depsOnly) { onApply(null, depsDirty ? dl : null, null, actArg, resArg, obBlks, actBlks); onClose(); return; }
    /* ⚠️ ЗӨВХӨН БОДИТ ОГНОО, ОЛОН БЛОК (2026-09-29): төлөвлөсөн муж · сар · нөөц хөндөгдөөгүй
       бол бодит огноог (ба уялдааг) л сонгосон блокуудад тавина. Урьд нь олон блок
       сонгосон үед бүтэн зам руу орж, (1) сарын нийлбэр таараагүй бол «Тавих» хаагдаж,
       (2) идэвхтэй блокийн ТӨЛӨВЛӨСӨН мужийг бусад блокт хуулдаг байв — хэрэглэгч
       зөвхөн бодит огноо бүртгэх гэсэн. Төлөвлөгөөг хуулах бол бодит огноог хөндөлгүй тавина. */
    if (extraOnly) {
      onApply(null, depsDirty ? dl : null, null, actArg, resArg, obBlks, actBlks); onClose(); return;
    }
    /* ⚠️ НИЙЛБЭР ТААРААГҮЙ бол хуваарийг ОРУУЛАХГҮЙ (хэрэглэгчийн дүрэм №3).
       Товч нь аль хэдийн хаалттай ч Enter/гар хандалтаар энд ирж болно. */
    if (!mvOk) return;
    const next = r.spans.slice();
    /* ⚠️ СОНГОСОН блок бүрд (2026-09-24): алхам 0 → ИЖИЛ огноо (хэрэглэгчийн
       сонголт); алхам >0 → идэвхтэй блокоос `(b - blk) × алхам` хоногоор
       хойшилно (давтагдах блокийн хуучин хэлбэр). Сонгоогүй блок хөндөгдөхгүй. */
    const len = spanDays({ start: ms1, end: ms2 });
    for (const b of selB) {
      const shift = takt > 0 ? (b - blk) * takt * DAY : 0;
      next[b] = b === blk ? { start: ms1, end: ms2 } : { start: ms1 + shift, end: endOf(ms1 + shift, len) };
    }
    onApply(next, depsDirty ? dl : null, obArg, actArg, resArg, obBlks, actBlks);
    onClose();
  };

  const clear = () => {
    const next = r.spans.slice();
    for (const b of selB) next[b] = null;
    /* ⚠️ Зөвхөн ОГНООГ арилгана — уялдаа нь хэвээр: хуваариа дахин тавихад
       гинж нь буцаад ажиллана. Уялдааг устгах бол жагсаалтаас ×-ээр.
       ⚠️ Сарын задаргаа ч цэвэрлэгдэнэ: хуваарьгүй ажилд төлөвлөсөн обьём
       үлдвэл нийлбэрийн шалгуур мөнхөд зөрчилтэй болно.
       ⚠️ Бодит огноо · нөөц ХӨНДӨХГҮЙ (2026-09-23): төлөвлөгөөг арилгах нь
       баримтыг устгах шалтгаан биш — талбарыг хоослоод «Тавих». */
    onApply(next, null, { months: new Map(), res: new Map() }, null, null, [...selB], [...selB]);
    onClose();
  };

  return (
    <div className={h.mdBack} role="presentation"
      onPointerDown={(e) => { downOnBack.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        const ok = downOnBack.current && e.target === e.currentTarget;
        downOnBack.current = false;
        if (ok) tryClose();
      }}>
      <div ref={mdRef} className={h.md} role="dialog" aria-modal="true"
        onClick={(e) => e.stopPropagation()}>
        <header className={h.mdHead}>
          <span className={h.mdNo}>{r.no}</span>
          <b className={h.mdWork}>{r.work || tr('(нэргүй)')}</b>
          <button type="button" className={h.mdX} onClick={onClose} aria-label={tr('Хаах')}>×</button>
        </header>

        {/* ── БЛОКУУД — ОЛНООР СОНГОНО (2026-09-24). Идэвхтэй (тод) блокийн
            огноо/сар суурь болно; сонгосон бүх блокт ижил тавигдана. */}
        <div className={h.mdBlks}>
          <span className={h.mdField}>{tr('Блокууд')}</span>
          {blocks.map((b, k) => (
            <button type="button" key={b}
              className={`${h.mdChip} ${selB.has(k) ? h.mdChipOn : ''} ${k === blk ? h.mdChipAct : ''}`}
              aria-pressed={selB.has(k)}
              title={k === blk ? tr('Идэвхтэй блок — огноо, сарын суурь эндээс') : undefined}
              onClick={() => toggleB(k)}>
              {b}
            </button>
          ))}
          {dEdit && blocks.length > 1 && (
            <>
              <button type="button" className={h.tlZoomB}
                onClick={() => setSelB(new Set(blocks.map((_, k) => k)))}>{tr('Бүгд')}</button>
              <button type="button" className={h.tlZoomB}
                onClick={() => setSelB(new Set([blk]))}>{tr('Цэвэрлэх')}</button>
            </>
          )}
          {selB.size > 1 && <span className={h.mdParWork}>{tr('{0} блокт тавина', num(selB.size))}</span>}
        </div>

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

        {/* ── ОГНОО — ХОЁР БАГАНА (2026-09-24, хэрэглэгч): «Төлөвлөгөөт» (эхлэх ·
            дуусах · үргэлжлэх — засагдана) ба «Бодит» (эхэлсэн · дууссан ·
            үргэлжлэх — бодогдоно). Бодит нь БҮРТГЭЛ: гинж, бүлгийн муж, сарын
            задаргаанд нөлөөлөхгүй; хагас (эхэлсэн, дуусаагүй) хэвийн; бүлэгт зөвхөн
            харагдана (хүүхдийн MIN/MAX); талбаргүй үйлчилгээнд багана гарахгүй. */}
        <div className={h.mdCols}>
          <div className={h.mdCol}>
            <div className={h.mdColHead}>{tr('Төлөвлөгөөт')}</div>
            <label className={h.mdField}>
              {tr('Эхлэх')}
              <input type="date" className={h.select} value={a} disabled={!dEdit}
                onChange={(e) => onStart(e.target.value)} />
            </label>
            <label className={h.mdField}>
              {tr('Дуусах')}
              <input type="date" className={h.select} value={z} disabled={!dEdit}
                onChange={(e) => setZ(e.target.value)} />
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
            {bad && <span className={h.mdDays}><b className={h.mdBad}>{tr('Дуусах нь эхлэхээс өмнө')}</b></span>}
          </div>
          {hasActual && (
            <div className={h.mdCol}>
              <div className={h.mdColHead}>{tr('Бодит')}</div>
              <label className={h.mdField}>
                {tr('Эхэлсэн')}
                <input type="date" className={h.select} value={aa} disabled={!dEdit}
                  onChange={(e) => { setAa(e.target.value); setActTouched(true); }} />
              </label>
              <label className={h.mdField}>
                {tr('Дууссан')}
                <input type="date" className={h.select} value={az} disabled={!dEdit}
                  onChange={(e) => { setAz(e.target.value); setActTouched(true); }} />
              </label>
              {/* ⚠️ Бодит «үргэлжлэх хоног» ХАСАГДСАН (2026-09-24, хэрэглэгч) */}
              {aBad && <span className={h.mdDays}><b className={h.mdBad}>{tr('Бодит дууссан нь эхэлснээс өмнө')}</b></span>}
            </div>
          )}
        </div>

        {/* ⚠️ Мөрийн хүн/машин input ХАСАГДСАН (2026-09-24) — сар бүрийн сүлжээнд л
            төлөвлөнө; мөрийн талбар хадгалахад саруудын нийлбэрээр бичигдэнэ. */}

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
                {/* ── САРЫН СҮЛЖЭЭ (2026-09-24): сар · обьём · хүн хүч · машин механизм.
                    12–32 мөр, дотроо гүйнэ (`mdMonthGrid`). Нөөцийн багана
                    хүснэгтийн талбар байхгүй ч БӨГЛӨГДӨНӨ (ноорог/илгээлтэд явна),
                    хадгалахад л алгасаж анхааруулна. */}
                <div className={h.mdMonthGrid}>
                  <span className={h.mdMonthHead}>{tr('Сар')}</span>
                  <span className={h.mdMonthHead}>{tr('Обьём')}</span>
                  <span className={h.mdMonthHead}>{tr('Хүн хүч')}</span>
                  <span className={h.mdMonthHead}>{tr('Машин механизм')}</span>
                  {mKeys.map((k) => (
                    <Fragment key={k}>
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
                        placeholder={mFocus === k && mRest != null && mRest >= 0 ? num(mRest, 2) : undefined}
                        onFocus={() => setMFocus(k)}
                        onBlur={() => setMFocus((f) => (f === k ? null : f))}
                        onChange={(e) => {
                          const t = e.target.value.trim();
                          setMv((m) => {
                            const out = new Map(m);
                            if (t === '') out.delete(k);
                            else {
                              /* ⚠️ 2026-09-29 аудит: сөрөг/буруу утга → нүд ХООСОН (`setMrCell`-тэй ижил),
                                 0 БИШ — 0 нь «тэр сард ажил хийхгүй» гэсэн бодит төлөвлөгөө. */
                              const v = Number(t);
                              if (!Number.isFinite(v) || v < 0) out.delete(k);
                              else out.set(k, v);
                            }
                            return out;
                          });
                        }}
                      />
                      <input type="number" className={`${h.numIn} ${h.mdMonthIn}`} min={0} step={1}
                        value={mr.get(k)?.hun ?? ''} disabled={!canEdit}
                        aria-label={tr('{0}-ны хүн хүч', k)}
                        onChange={(e) => setMrCell(k, 'hun', e.target.value)} />
                      <input type="number" className={`${h.numIn} ${h.mdMonthIn}`} min={0} step={1}
                        value={mr.get(k)?.mashin ?? ''} disabled={!canEdit}
                        aria-label={tr('{0}-ны машин механизм', k)}
                        onChange={(e) => setMrCell(k, 'mashin', e.target.value)} />
                    </Fragment>
                  ))}
                  <span className={h.mdMonthTot}>{tr('Нийлбэр')}</span>
                  <span className={`${h.mdMonthTot} num`}>{num(mFocus != null ? mvSum - (mv.get(mFocus) ?? 0) : mvSum, 2)}</span>
                  <span className={`${h.mdMonthTot} num`}>{mrSum.hun != null ? num(mrSum.hun) : '—'}</span>
                  <span className={`${h.mdMonthTot} num`}>{mrSum.mashin != null ? num(mrSum.mashin) : '—'}</span>
                </div>
                {(resFields.hun === false || resFields.mashin === false) && mrHas && (
                  <p className={h.mdWarn}>
                    {tr('Сарын хүснэгтэд хүн хүч/машин механизмын талбар алга — сарын нөөц хадгалагдахгүй, админ AGOL дээр нэмнэ.')}
                  </p>
                )}

                {/* ⚠️ НИЙЛБЭР ба ЗӨРҮҮ нь ҮРГЭЛЖ ил: хэрэглэгч «Тавих» дарж
                    чадахгүй болсныг ШАЛТГААНТАЙ нь хамт харах ёстой. */}
                {/* ⚠️ БИЧИЖ БАЙХАД ХӨДЛӨХГҮЙ МӨР (2026-09-24, хэрэглэгч: «эхний тоог
                    тавихад л хэд гэж бичих нь тодорхойгүй болчихно»). Сарын нүдэнд
                    фокустай үед ХӨДЛӨДӨГ «Нийлбэр · дутуу» мөрийг НУУЖ, зөвхөн тэр
                    сарыг оруулахгүй тогтмол нийлбэр · үлдэгдлийг харуулна. */}
                {mFocus != null && mRest != null && (
                  <p className={h.mdPar}>
                    {tr('{0}-ыг оруулахгүй нийлбэр', mFocus)}: <b className="num">{num(mvSum - (mv.get(mFocus) ?? 0), 2)}</b>
                    {' · '}{tr('үлдэгдэл')}: <b className="num">{num(mRest, 2)}</b>
                    {mRest > 0 && canEdit && (
                      <>
                        {' '}
                        <button type="button" className={h.mdSnap}
                          /* ⚠️ onMouseDown — товч дарахад input-ийн blur нь mFocus-ыг
                             арилгахаас ӨМНӨ утгыг тавина */
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const k = mFocus;
                            setMv((m) => new Map(m).set(k, mRest));
                          }}>
                          {tr('Үлдэгдлээр бөглөх')}
                        </button>
                      </>
                    )}
                  </p>
                )}
                {(mFocus == null || mRest == null) && (
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
                )}
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
                <LagInput value={d.lag} disabled={!canEdit}
                  onCommit={(n) => setDl((v) => v.map((x, k) => (k === j ? { ...x, lag: n } : x)))} />
                <span className={h.mdDepD}>{tr('хоног')}</span>
                {/* ⚠️ БЛОК (2026-09-24): хоосон = бүх блокт (блокгүй бичиглэл), эс бөгөөс
                    зөвхөн тэр блокт (`@N`). Ганц блоктой (синтетик) багцад нуугдана. */}
                {blocks.length > 1 && (
                  <select className={h.select} value={d.blk ?? ''} disabled={!canEdit}
                    title={tr('Аль блокт үйлчлэх — хоосон бол бүх блокт')}
                    onChange={(e) => setDl((v) => v.map((x, k) => {
                      if (k !== j) return x;
                      const { blk: _b, ...rest } = x;
                      return e.target.value === '' ? rest : { ...rest, blk: Number(e.target.value) };
                    }))}>
                    <option value="">{tr('бүх блок')}</option>
                    {blocks.map((name, b) => <option key={name} value={b}>{name}</option>)}
                    {/* ⚠️ Блокийн тооноос давсан `@N` — сонголтод харагдана, «Тавих»-д хасагдана (2026-09-24) */}
                    {d.blk != null && d.blk >= blocks.length && (
                      <option value={d.blk}>{tr('{0}-р блок алга', String(d.blk + 1))}</option>
                    )}
                  </select>
                )}
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
        {/* ⚠️ АЛХАМ (2026-09-24): 0 = сонгосон блокт ИЖИЛ огноо (анхдагч, хэрэглэгчийн
            сонголт); >0 = идэвхтэй блокоос блок бүр алхмаар хойшилно (давтагдах
            блокийн хуучин хэлбэр — «Бүх блокт» checkbox чипээр солигдов). */}
        {dEdit && blocks.length > 1 && (
          <label className={h.mdField}>
            {tr('алхам (хоног)')}
            <input type="number" min={0} max={365} className={h.numIn} value={takt}
              aria-label={tr('Алхам')}
              title={tr('0 — сонгосон бүх блокт ижил огноо; N — идэвхтэй блокоос дараагийн блок бүр N хоногоор хойшилно')}
              onChange={(e) => onTakt(Math.min(365, Math.max(0, Number(e.target.value) || 0)))} />
            <span className={h.mdParWork}>{takt > 0 ? tr('блок бүр {0} хоногоор хойшилно', num(takt)) : tr('сонгосон блокт ижил огноо')}</span>
          </label>
        )}

        <footer className={h.mdFoot}>
          {dEdit && (
            <button type="button" className={h.tlZoomB} onClick={clear}
              disabled={![...selB].some((b) => r.spans[b])}>
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
                : (depsOnly || extraOnly) ? false
                /* ⚠️ Огноо хоосон/буруу бол `apply` зөвхөн уялдаа · бодит огноог тавина —
                   сарын нийлбэр тэр замд хамаарахгүй (2026-09-25 аудит) */
                : (ms1 == null || ms2 == null || bad) ? (!depsDirty && !extraDirty)
                : !mvOk}
              title={mvOk || depsOnly || extraOnly || ms1 == null || ms2 == null || bad ? undefined : tr('Сарын обьёмын нийлбэр нийт обьёмтой тэнцээгүй')}>
              {tr('Тавих')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
