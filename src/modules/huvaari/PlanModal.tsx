'use client';

import { Fragment, type KeyboardEvent as KEvt, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { fixCyr, num } from '@/lib/format';
import { msToDay } from '@/modules/sheet/bagtsSheet';
import { DAY, endOf, spanDays, type PlanRow, type Span } from '@/lib/plan';
import { formatDeps, sameDep, type Dep, type DepType } from '@/lib/deps';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { askConfirm, toastUndo } from '@/lib/confirm';
import { balanced, monthsOf, sumMonths, sumRes, type MonthRes } from '@/lib/huvaariObyem';
import { dayToMs, sameRes } from './util';
import { DateField } from './DateField';
import { HAM_MAX } from './savePrep';
import { MAX_DAYS } from './types';
import h from '../huvaari.module.css';

/* ══════════════════ POPUP ХУАНЛИ ══════════════════ */

/**
 * Ажлын нэр дээр дарахад нээгдэх ЦОНХ — огноог ТООГООР оруулна.
 */
/**
 * ХОЦРОЛТЫН (lag) ТАЛБАР — хоногоор, ±365.
 */
export function LagInput({ value, disabled, onCommit }: {
  value: number;
  disabled?: boolean;
  onCommit: (n: number) => void;
}) {
  const [txt, setTxt] = useState(String(value));
  /* Гаднаас (өөр замаар) өөрчлөгдвөл дагана — бичиж буй мөр ижил тоо бол хөндөхгүй. */
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

/**
 * УРЬДЧИЛАГЧ СОНГОХ COMBOBOX (2026-10-08). Урьд нь ~1,400 `<option>`-той `<select>` байсан тул
 * хэрэглэгч кодоо мэдэхгүй бол жагсаалтыг гүйлгэж хайдаг, мэдэж байсан ч эхний үсгээр л
 * үсэрдэг байв. Одоо: текст бичихэд `cands`-ыг КОД (угтвар) эсвэл НЭР (дэд мөр)-ээр шүүнэ;
 * ↑/↓ тодруулна, Enter сонгоно, Esc хаана; хулганаар ч сонгоно.
 */
function DepPicker({ value, cands, disabled, onPick }: {
  value: number;
  cands: { code: number; label: string }[];
  disabled: boolean;
  onPick: (code: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const lbId = useId();
  const optId = (i: number) => `${lbId}-o${i}`;
  const cur = cands.find((c) => c.code === value);
  /* Хуучин хадгалагдсан код нэр дэвшигчдэд байхгүй байж болно (жиш. одоо дугуй үүсгэх
     байрлалд) — сонголт алдагдахгүйн тулд ил бичнэ */
  const shown = cur ? cur.label : `${value} · ${tr('(жагсаалтад алга)')}`;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cands.slice(0, 80);
    const byCode = /^\d+$/.test(s);
    const out: { code: number; label: string }[] = [];
    for (const c of cands) {
      if (byCode ? String(c.code).startsWith(s) : c.label.toLowerCase().includes(s)) {
        out.push(c);
        if (out.length >= 80) break;
      }
    }
    /* Тоо бичсэн ч кодоор олдохгүй бол нэрээр (жиш. «2026» гэсэн нэр) */
    if (byCode && !out.length) for (const c of cands) { if (c.label.toLowerCase().includes(s)) { out.push(c); if (out.length >= 80) break; } }
    return out;
  }, [cands, q]);
  const pick = (code: number) => { onPick(code); setOpen(false); setQ(''); };
  return (
    <span className={`${h.cbox} ${h.mdDepWork}`}>
      <input
        className={`${h.select} ${h.cboxIn}`}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={open ? lbId : undefined}
        aria-activedescendant={open && list[hi] ? optId(hi) : undefined}
        aria-label={tr('Урд ажил — код эсвэл нэрээр хайх')}
        title={open ? tr('Код эсвэл нэрээр хайна · ↑↓ сонгоно · Enter тавина · Esc хаана') : shown}
        value={open ? q : shown}
        placeholder={open ? tr('код эсвэл нэр…') : undefined}
        disabled={disabled}
        onFocus={() => { setQ(''); setHi(0); setOpen(true); }}
        onChange={(e) => { setQ(e.target.value); setHi(0); setOpen(true); }}
        onBlur={() => { setOpen(false); setQ(''); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setHi((i) => Math.min(list.length - 1, i + 1)); return; }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); return; }
          if (e.key === 'Enter') {
            if (!open) return;
            e.preventDefault(); e.stopPropagation();
            const c = list[hi];
            if (c) { pick(c.code); e.currentTarget.blur(); }
            return;
          }
          if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setQ(''); e.currentTarget.blur(); }
        }}
      />
      {open && (
        <ul id={lbId} className={h.cboxList} role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {list.length === 0 ? (
            <li className={h.cboxEmpty}>{tr('Олдсонгүй')}</li>
          ) : list.map((c, i) => (
            <li key={c.code} id={optId(i)} role="option" aria-selected={i === hi}
              className={`${h.cboxItem}${i === hi ? ` ${h.cboxItemHi}` : ''}${c.code === value ? ` ${h.cboxItemOn}` : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(c.code); }}
              onMouseEnter={() => setHi(i)}>
              {c.label}
            </li>
          ))}
          {list.length >= 80 && <li className={h.cboxEmpty}>{tr('… шүүлтээ нарийсгана уу')}</li>}
        </ul>
      )}
    </span>
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
  /** `Hamaaral`-ийн ТАНИГДААГҮЙ токенууд (`residualDeps`) — хадгалахад угтаж залгагдана; уртын шалгалтад (2026-10-04) */
  hamKeep?: readonly string[];
  /** Бодит огноо · нөөцийн талбар үйлчилгээнд бий эсэх (2026-09-23) — үгүй бол хэсэг нуугдана */
  hasActual: boolean;
  hasRes?: boolean;
  /** Сарын обьём/нөөцийн хэсэг гарах уу — гэрээ табд `false` (2026-09-29): «Тавих» нийлбэр шаардахгүй, `ob` null */
  obyem?: boolean;
  /** ЭНЭ блокийн хадгалагдсан/ноорог сарын задаргаа */
  months: Map<string, number>;
  /**
   * САРЫН ЗАДАРГАА ТЭНЦЭЭГҮЙ блокууд (индекс) — чип улаан (2026-10-01, хэрэглэгч: бүгдийг
   * зас). Дуудагч `util.unbalancedBlocks`-ээр (илгээх хаалттай нэг дүрэм) бодно.
   */
  badBlks?: ReadonlySet<number>;
  /**
   * ИДЭВХТЭЙ блокийн ГЭРЭЭНИЙ муж (2026-10-05) — зөвхөн төлөвлөгөө табд; төлөвлөсөн огноо
   * түүнээс гарвал ЗӨӨЛӨН анхааруулна. ХЭЗЭЭ Ч хаахгүй, хавчихгүй.
   */
  geree?: Span | null;
  /** ЭНЭ блокийн хадгалагдсан/ноорог сарын НӨӨЦ (2026-09-24) */
  res: Map<string, MonthRes>;
  xLock?: string;
  /** Сарын хүснэгтэд нөөцийн талбар бий эсэх — `false` бол анхааруулна (`null` = мэдэхгүй) */
  resFields: { hun: boolean | null; mashin: boolean | null };
  onClose: () => void;
  dragged?: boolean;
  onKeep?: () => void;
  onShiftGroup?: (days: number, blks: number[]) => void;
  onUndo?: () => () => void;
  returnFocus?: () => HTMLElement | null;
  /**
   * «Тавих»/«Арилгах» — огноо · уялдаа · сарын обьём+нөөц · бодит огноо · нөөц
   * НЭГ алхамд (null = хөндөхгүй). `blks` — сонгосон блокууд (2026-09-24):
   * `spans` тэдгээрт аль хэдийн тавигдсан; `ob` тэдгээрт хуулагдана;
   * `actual` нь ЗӨВХӨН идэвхтэй `blk`-д (бүртгэл, 2026-09-24 аудит).
   */
  onApply: (
    spans: (Span | null)[] | null,
    deps: Dep[] | null,
    ob: { months: Map<string, number> | null; res: Map<string, MonthRes> | null; byBlk?: Map<number, Map<string, number>> } | null,
    actual: { start: number | null; end: number | null } | null,
    res: { hun: number | null; mashin: number | null } | null,
    blks: number[],
    /** Бодит огноо тавигдах блокууд (2026-09-29) — сонгосон бүгд */
    actBlks: number[],
  ) => void;
};

export function PlanModal(props: PlanModalProps) {
  return <PlanModalBody key={props.r.oid} {...props} />;
}

/** Төлөвлөгөөт огнооны талбарын АНХНЫ утга — мөр · эцэг · блокоос (2026-09-30: эффектээс initializer болов) */
function initPlanDates(r: PlanRow, par: PlanRow | null, blk: number): { a: string; z: string } {
  const own = r.spans[blk] ?? null;
  const p = par?.spans[blk] ?? null;
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
  r, par, blocks, blk, initSel, takt, canEdit, onBlk, onTakt, cands, hasHam, hamKeep, hasActual, obyem = true, months, res, resFields, onClose, onApply,
  badBlks, geree, returnFocus, xLock, dragged, onKeep, onShiftGroup, onUndo,
}: PlanModalProps) {
  const mdRef = useRef<HTMLDivElement>(null);
  useFocusTrap(mdRef, true, returnFocus);
  const applyBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!dragged) return;
    const b = applyBtn.current;
    if (b && !b.disabled) { b.focus(); return; }
    mdRef.current?.querySelector<HTMLElement>('[data-md-dates] input:not([disabled])')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ЗӨВХӨН нээлтийн агшинд (`dragged` нь нээлтийн шинж)
  }, []);
  const [shiftTxt, setShiftTxt] = useState('');

  const [a, setA] = useState(() => initPlanDates(r, par, blk).a);
  const [z, setZ] = useState(() => initPlanDates(r, par, blk).z);
  /**
   * СОНГОСОН БЛОКУУД (2026-09-24, хэрэглэгч: «блокийг олноор сонгож нэг
   * төлөвлөлтийг зэрэг тавина»). Идэвхтэй `blk` (огноо/сарын суурь эндээс)
   * ҮРГЭЛЖ дотор нь. Мөр солиход зөвхөн идэвхтэй блок үлдэнэ. «Бүх блокт»
   * checkbox-ыг орлоно.
   */
  const selInit = () => new Set([blk, ...(initSel ?? []).values()].filter((k) => k >= 0 && k < blocks.length));
  const [selB, setSelB] = useState<Set<number>>(selInit);
  /**
   * ИДЭВХТЭЙ БЛОКИЙГ ХАССАНААС үүдсэн блок солилт (2026-10-06 аудит).
   */
  const [keepOnBlk, setKeepOnBlk] = useState(false);
  const toggleB = (k: number) => {
    if (!dEdit) { onBlk(k); return; }
    if (!selB.has(k)) { setSelB(new Set([...selB, k])); return; }
    /* Сүүлчийнхийг хасахгүй — хоосон сонголтод «Тавих» утгагүй */
    if (selB.size === 1) return;
    const next = new Set(selB);
    next.delete(k);
    setSelB(next);
    if (k === blk) {
      setKeepOnBlk(mdDirtyRef.current);
      onBlk(Math.min(...next));
    }
  };
  /** Уялдааны түр жагсаалт — «Тавих» дартал эх мөрөө хөндөхгүй */
  const [dl, setDl] = useState<Dep[]>(r.deps);
  const depsTxt = formatDeps(r.deps);
  const [depsTxtPrev, setDepsTxtPrev] = useState(depsTxt);
  if (depsTxtPrev !== depsTxt) {
    setDepsTxtPrev(depsTxt);
    if (formatDeps(dl) === depsTxtPrev) setDl(r.deps);
  }

  /**
   * БОДИТ ЭХЭЛСЭН / ДУУССАН (энэ блок) ба ХҮН ХҮЧ / МАШИН (мөр) — 2026-09-23.
   */
  const [aa, setAa] = useState(() => initActual(r, blk).aa);
  const [az, setAz] = useState(() => initActual(r, blk).az);
  const [actTouched, setActTouched] = useState(false);
  const am1 = dayToMs(aa);
  const am2 = dayToMs(az);
  const aBad = am1 != null && am2 != null && am1 > am2;
  const actDirty = !xLock && actTouched && [...selB].some((b) => (am1 ?? null) !== (r.aStart?.[b] ?? null) || (am2 ?? null) !== (r.aEnd?.[b] ?? null));
  const extraDirty = actDirty && !aBad;
  /** Popup-аас `onApply`-д өгөх бодит огноо · нөөц — хөндөөгүй бол `null` */
  const actArg = actDirty && !aBad ? { start: am1, end: am2 } : null;
  const [badTxt, setBadTxt] = useState<ReadonlySet<string>>(() => new Set());
  const markBad = (k: string) => (b: boolean) => setBadTxt((s) => {
    if (s.has(k) === b) return s;
    const n = new Set(s);
    if (b) n.add(k); else n.delete(k);
    return n;
  });

  /**
   * Блок эсвэл мөр солигдвол талбарууд дагаж шинэчлэгдэнэ.
   */

  const mdDirtyRef = useRef(false);
  const tryClose = useCallback(() => {
    if (!mdDirtyRef.current) { onClose(); return; }
    void askConfirm(tr('Оруулсан өөрчлөлт хадгалагдаагүй — хаяж цонхыг хаах уу?'), { danger: true, ok: tr('Хаяж хаах') })
      .then((ok) => { if (ok) onClose(); });
  }, [onClose]);
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
  const [prevDays, setPrevDays] = useState(days);
  if (days !== prevDays) {
    setPrevDays(days);
    setDurTxt(days != null ? String(days) : '');
  }
  const durOk = (v: string): number | null => {
    const n = Number(v);
    return v.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= MAX_DAYS ? n : null;
  };
  const durBad = dEdit && ms1 != null && durTxt.trim() !== '' && durOk(durTxt) == null;
  const spanLong = dEdit && days != null && days > MAX_DAYS;
  const onDur = (v: string) => {
    setDurTxt(v);
    const n = durOk(v);
    if (n != null && ms1 != null) setZ(msToDay(endOf(ms1, n)));
  };
  const onStart = (v: string) => {
    setA(v);
    const s = dayToMs(v);
    if (s == null) return;
    if (ms2 != null && s <= ms2) return;
    const n = durOk(durTxt);
    if (n != null) setZ(msToDay(endOf(s, n)));
  };

  /**
   * ЭНЭ блокийн бүлгийн муж — ЗӨВХӨН МЭДЭЭЛЭЛ.
   */
  const pspan = par?.spans[blk] ?? null;

  /* ══════════ САРЫН ОБЬЁМ ══════════
   */
  const total = obyem && !r.group && r.vol != null && r.vol > 0 ? r.vol : null;
  const [mvAll, setMv] = useState<Map<string, number>>(months);
  /** Сарын НӨӨЦ (хүн хүч · машин) — `mv`-тэй зэрэгцээ (2026-09-24) */
  const [mrAll, setMr] = useState<Map<string, MonthRes>>(res);
  const [mvBadK, setMvBadK] = useState<string | null>(null);
  /**
   * Мөр/блок солигдоход ХАДГАЛАГДСАНАА суурь болгоно.
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
    if (keepOnBlk) {
      setKeepOnBlk(false);
    } else {
      const ai = initActual(r, blk);
      setAa(ai.aa); setAz(ai.az); setActTouched(false);
      const pi = initPlanDates(r, par, blk);
      setA(pi.a); setZ(pi.z);
      setMv(months); setMr(res);
      setMvBadK(null);
    }
  }
  if ((par?.oid ?? null) !== prevParOid) {
    setPrevParOid(par?.oid ?? null);
    if (blk === prevBlk) { const pi = initPlanDates(r, par, blk); setA(pi.a); setZ(pi.z); }
  }
  /**
   * ЭНЭ МУЖИД ХАМААРАХ САРУУД — жагсаалтын эх сурвалж.
   */
  const mKeys = useMemo(
    () => (ms1 == null || ms2 == null || bad ? [] : monthsOf({ start: ms1, end: ms2 })),
    [ms1, ms2, bad],
  );
  /* Мужаас ГАРСАН сарын утгыг хасна — эс бөгөөс нийлбэр хаанаас ч
     гараагүй тоогоор давна. */
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
  /** Нэг сарын нөөцийн нэг талбарыг бичнэ — хоосон = `null`; хоёулаа null болвол сар Map-аас хасагдана. */
  const setMrCell = (k: string, f: 'hun' | 'mashin', t: string) => {
    const s = t.trim();
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
  const resArg = null;

  const mvSum = sumMonths(mv);
  const mvEmpty = mKeys.filter((k) => mv.get(k) == null);
  const mvFull = mvEmpty.length === 0;
  const mvBal = total == null || balanced(mv, total);
  const mvOk = total == null || (mvFull && mvBal);
  const mvDiff = total == null ? 0 : mvSum - total;
  /**
   * БЛОКИЙН ЧИП УЛААН ЭСЭХ (2026-10-01, хэрэглэгч: бүгдийг зас).
   */
  const chipBad = (k: number): boolean => {
    if (k !== blk) return !!badBlks?.has(k);
    if (total == null) return false;
    return mvAll.size > 0 ? mKeys.length > 0 && !mvBal : !!badBlks?.has(k);
  };
  const [mFocus, setMFocus] = useState<string | null>(null);
  const mRest = total != null && mFocus != null
    ? (Math.round((total - (mvSum - (mv.get(mFocus) ?? 0))) * 100) / 100) || 0
    : null;

  /**
   * ОЛОН БЛОКТ УЯЛДАА ХУУЛАХ (2026-10-04, хэрэглэгч: «холбоос сонгож бусад блокуудыг
   * давхар сонгож оруулахад бусад блок дээр холбоос хуулагдахгүй — нэг ажлыг дахин
   * дахин хийх шаардлага үүсч байна»).
   */
  const dlOut = useMemo((): Dep[] => {
    if (r.group || selB.size <= 1 || blocks.length <= 1) return dl;
    const mine = dl.filter((d) => d.blk === blk && d.src == null);
    if (!mine.length) return dl;
    const allSel = [...Array(blocks.length).keys()].every((b) => selB.has(b));
    let out = [...dl];
    for (const d of mine) {
      const base = { code: d.code, type: d.type, lag: d.lag };
      if (allSel) {
        out = out.filter((x) => !(x.code === d.code && x.blk != null && x.src == null));
        const i = out.findIndex((x) => x.code === d.code && x.blk == null);
        if (i >= 0) out[i] = base; else out.push(base);
        continue;
      }
      if (out.some((x) => x.code === d.code && x.blk == null)) continue;
      for (const b of [...selB].sort((x, y) => x - y)) {
        if (b === blk) continue;
        const i = out.findIndex((x) => sameDep(x, { code: d.code, blk: b }));
        if (i >= 0) out[i] = { ...base, blk: b }; else out.push({ ...base, blk: b });
      }
    }
    return out;
  }, [dl, selB, blk, blocks.length, r.group]);
  /** Хуулах замаар нэмэгдэх/өөрчлөгдөх уялдаа бий эсэх — хэрэглэгчид ил хэлнэ */
  const depsCopied = formatDeps(dlOut) !== formatDeps(dl);
  /** Уялдаа өөрчлөгдсөн эсэх — бичиглэлээр нь харьцуулна (дараалал ч утгатай) */
  const depsDirty = formatDeps(dlOut) !== formatDeps(r.deps);
  const hamLen = [...(hamKeep ?? []), formatDeps(dlOut)].filter(Boolean).join(',').length;
  const depsTooLong = hasHam && depsDirty && hamLen > HAM_MAX;
  /** Сарын задаргаа хөндөгдсөн үү — хадгалагдсан `months`-той харьцуулна */
  const mvDirty = mv.size !== months.size || [...mv].some(([k, v]) => months.get(k) !== v);
  /** Огноо хөндөгдсөн үү — энэ блокийн хадгалагдсан зурвастай харьцуулна */
  const own = r.spans[blk];
  const spanDirty = (ms1 ?? null) !== (own?.start ?? null) || (ms2 ?? null) !== (own?.end ?? null);
  const pStale = !!(own && pspan && (own.end < pspan.start || own.start > pspan.end));
  const prefilled = !!pspan && (!own || pStale) && ms1 === pspan.start && ms2 === pspan.end;
  const depsOnly = (depsDirty || extraDirty) && (!spanDirty || (prefilled && !mvOk))
    && !mvDirty && !mrDirty && selB.size === 1;
  /** Сарын обьём + нөөц — «Тавих»-д өгөх багц; обьёмгүй мөрд обьём хөндөхгүй. */
  /** ЗӨВХӨН бодит огноо (ба уялдаа) хөндөгдсөн — олон блок сонгосон ч төлөвлөгөөг хуулахгүй (2026-09-29) */
  const extraOnly = extraDirty && (!spanDirty || prefilled) && !mvDirty && !mrDirty;
  const mdDirty = canEdit && (
    (dEdit && spanDirty && !prefilled)
    || depsDirty
    || actDirty
    || mvAll.size !== months.size || [...mvAll].some(([k, v]) => months.get(k) !== v)
    || !sameRes(mrAll, res)
  );
  useLayoutEffect(() => { mdDirtyRef.current = mdDirty; });
  const obArg = { months: total == null ? null : mv, res: obyem && !xLock && (mrDirty || mrHas) ? mr : null };
  const obBlks = takt > 0 ? [blk] : [...selB];
  /** Бодит огноо тавигдах блокууд (2026-09-29) — сонгосон бүгд, алхамаас үл хамаарна */
  const actBlks = [...selB];

  const apply = () => {
    if (depsTooLong) return;
    if (spanLong) return;
    if (r.group) { if (depsDirty) onApply(null, dl, null, null, null, [blk], [blk]); onClose(); return; }
    if (ms1 == null || ms2 == null || bad) {
      /* Огноо буруу ч УЯЛДАА · бодит огноо · нөөцийг дангаар нь тавьж болно —
         төлөвлөгөөт огноог хөндөхгүй */
      if (depsDirty || extraDirty) { onApply(null, depsDirty ? dlOut : null, null, actArg, resArg, obBlks, actBlks); onClose(); }
      return;
    }
    if (depsOnly) { onApply(null, depsDirty ? dlOut : null, null, actArg, resArg, obBlks, actBlks); onClose(); return; }
    if (extraOnly) {
      onApply(null, depsDirty ? dlOut : null, null, actArg, resArg, obBlks, actBlks); onClose(); return;
    }
    if (!mvOk) return;
    const next = r.spans.slice();
    const len = spanDays({ start: ms1, end: ms2 });
    for (const b of selB) {
      const shift = takt > 0 ? (b - blk) * takt * DAY : 0;
      next[b] = b === blk ? { start: ms1, end: ms2 } : { start: ms1 + shift, end: endOf(ms1 + shift, len) };
    }
    onApply(next, depsDirty ? dlOut : null, obArg, actArg, resArg, obBlks, actBlks);
    onClose();
  };

  /**
   * ИДЭВХТЭЙ БЛОКИЙН ЗАДАРГААГ СОНГОСОН БЛОКУУДАД АЛХМААР ШИЛЖҮҮЛЖ ХУУЛАХ (2026-10-08).
   * Алхам > 0 үед «Тавих» сарын задаргааг ЗӨВХӨН идэвхтэй блокт тавьдаг (`obBlks`) —
   * 22 блокт нэг ижил ажлын саруудыг гараар дахин бөглөх хэрэгтэй байв.
   */
  const copyTargets = takt > 0 ? [...selB].filter((b) => b !== blk).sort((x, y) => x - y) : [];
  const copyOff = !mvOk || ms1 == null || ms2 == null || bad || spanLong || mv.size === 0;
  const copyShifted = async () => {
    if (copyOff || r.group || !copyTargets.length || ms1 == null || ms2 == null) return;
    if (!(await askConfirm(tr('Идэвхтэй блокийн сарын задаргааг сонгосон {0} блокт алхмаар шилжүүлж хуулах уу? Тэдгээр блокийн одоогийн задаргаа дарагдана.', num(copyTargets.length)), { ok: tr('Хуулах') }))) return;
    const len = spanDays({ start: ms1, end: ms2 });
    const next = r.spans.slice();
    const jobs: { b: number; out: Map<string, number> }[] = [];
    for (const b of copyTargets) {
      const shift = (b - blk) * takt * DAY;
      const sp = { start: ms1 + shift, end: endOf(ms1 + shift, len) };
      const keys = monthsOf(sp);
      if (!keys.length) continue;
      next[b] = sp;
      const out = new Map<string, number>();
      mKeys.forEach((k, i) => {
        const v = mv.get(k);
        if (v == null) return;
        const tk = keys[Math.min(i, keys.length - 1)];
        out.set(tk, Math.round(((out.get(tk) ?? 0) + v) * 100) / 100);
      });
      jobs.push({ b, out });
    }
    if (!jobs.length) return;
    const blks = jobs.map((j) => j.b);
    onApply(next, null, { months: null, res: null, byBlk: new Map(jobs.map((j) => [j.b, j.out])) }, null, null, blks, blks);
  };

  const clear = async () => {
    const nB = selB.size;
    if (nB > 1 && !onUndo && !(await askConfirm(tr('{0} блокийн огноо ба сарын задаргаа арилна. Үргэлжлүүлэх үү?', num(nB)), { danger: true, ok: tr('Арилгах') }))) return;
    const next = r.spans.slice();
    for (const b of selB) next[b] = null;
    const undo = onUndo?.();
    onApply(next, null, { months: new Map(), res: new Map() }, null, null, [...selB], [...selB]);
    onClose();
    if (undo) void toastUndo(tr('{0} блокийн огноо ба сарын задаргаа арилгав.', num(nB)), undo);
  };

  const applyWhy: string | undefined = depsTooLong ? tr('Уялдааны бичиглэл талбарт багтахгүй ({0} > {1} тэмдэгт)', num(hamLen), num(HAM_MAX))
    : spanLong ? tr('Үргэлжлэх хугацаа {0} хоногоос урт байж болохгүй', num(MAX_DAYS))
    : mvOk || depsOnly || extraOnly || ms1 == null || ms2 == null || bad ? undefined
    : !mvBal ? tr('Сарын обьёмын нийлбэр нийт обьёмтой тэнцээгүй')
    : tr('Хоосон сар бий — ажил хийхгүй сард 0 бичнэ үү');

  const applyOff = depsTooLong ? true
    : r.group
    ? !depsDirty
    : aBad || badTxt.size > 0 || durBad || spanLong ? true
    : (depsOnly || extraOnly) ? false
    : (ms1 == null || ms2 == null || bad) ? (!depsDirty && !extraDirty)
    : !mvOk;
  const onEnter = (e: KEvt<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.defaultPrevented || e.nativeEvent.isComposing) return;
    const el = e.target as HTMLElement;
    if (el.closest('textarea, button, select, a')) return;
    if (el.closest('[role="dialog"]') !== mdRef.current) return;
    if (!canEdit || applyOff) return;
    e.preventDefault();
    apply();
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
        onKeyDown={onEnter}
        onClick={(e) => e.stopPropagation()}>
        <header className={h.mdHead}>
          <span className={h.mdNo}>{r.no}</span>
          <b className={h.mdWork}>{fixCyr(r.work) || tr('(нэргүй)')}</b>
          <button type="button" className={h.mdX} onClick={tryClose} aria-label={tr('Хаах')}>×</button>
        </header>

        {/* ── БЛОКУУД — ОЛНООР СОНГОНО (2026-09-24). Идэвхтэй (тод) блокийн
            огноо/сар суурь болно; сонгосон бүх блокт ижил тавигдана. */}
        <div className={h.mdBlks}>
          <span className={h.mdField}>{tr('Блокууд')}</span>
          {blocks.map((b, k) => {
            const bad = chipBad(k);
            return (
              <button type="button" key={b}
                className={`${h.mdChip} ${selB.has(k) ? h.mdChipOn : ''} ${k === blk ? h.mdChipAct : ''} ${bad ? h.mdChipBad : ''}`}
                aria-pressed={selB.has(k)}
                title={[
                  k === blk ? tr('Идэвхтэй блок — огноо, сарын суурь эндээс') : '',
                  bad ? tr('Энэ блокийн сарын задаргааны нийлбэр обьёмтой тэнцэхгүй') : '',
                ].filter(Boolean).join(' · ') || undefined}
                onClick={() => toggleB(k)}>
                {bad ? `⚠ ${b}` : b}
              </button>
            );
          })}
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

        {pspan && (
          <p className={h.mdPar}>
            {tr('Бүлгийн муж')}: <b className="num">{msToDay(pspan.start)}</b>
            {' → '}<b className="num">{msToDay(pspan.end)}</b>
            {par?.work ? <span className={h.mdParWork}> · {fixCyr(par.work)}</span> : null}
            {dEdit && (a !== msToDay(pspan.start) || z !== msToDay(pspan.end)) && (
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
        {dragged && canEdit && (
          <p className={h.mdWarn} role="status">
            {tr('Хаавал чирэлт буцна')}
            {onKeep && (
              <>
                {' · '}
                <button type="button" className={h.mdSnap} onClick={onKeep}
                  title={tr('Чирсэн огноог сарын задаргаа шаардалгүй үлдээж цонхыг хаана')}>
                  {tr('Огноог үлдээх')}
                </button>
              </>
            )}
          </p>
        )}
        <div className={h.mdCols} data-md-dates="">
          <div className={h.mdCol}>
            <div className={h.mdColHead}>{tr('Төлөвлөгөөт')}</div>
            <label className={h.mdField}>
              {tr('Эхлэх')}
              <DateField value={a} disabled={!dEdit} label={tr('Эхлэх')}
                onChange={onStart} onBad={markBad('a')} />
            </label>
            <label className={h.mdField}>
              {tr('Дуусах')}
              <DateField value={z} disabled={!dEdit} label={tr('Дуусах')}
                onChange={setZ} onBad={markBad('z')} />
            </label>
            <label className={h.mdField}>
              {tr('Үргэлжлэх')}
              <span className={h.mdDays}>
                <input type="number" min={1} max={MAX_DAYS} step={1}
                  className={`${h.numIn}${durBad ? ` ${h.dateBad}` : ''}`} value={durTxt}
                  aria-invalid={durBad}
                  disabled={!dEdit || ms1 == null}
                  placeholder={ms1 == null ? '—' : ''}
                  aria-label={tr('Үргэлжлэх хоног')}
                  title={ms1 == null ? tr('Эхлэх огноог эхлээд сонгоно') : tr('Хоног бичихэд дуусах огноо автоматаар бодогдоно')}
                  onChange={(e) => onDur(e.target.value)} />
                {' '}{tr('хоног')}
              </span>
            </label>
            {bad && <span className={h.mdDays}><b className={h.mdBad}>{tr('Дуусах нь эхлэхээс өмнө')}</b></span>}
            {durBad && <span className={h.mdDays}><b className={h.mdBad}>{tr('Үргэлжлэх хоног 1-ээс {0} хүртэлх бүхэл тоо байна', num(MAX_DAYS))}</b></span>}
            {spanLong && !durBad && <span className={h.mdDays}><b className={h.mdBad}>{tr('Үргэлжлэх хугацаа {0} хоногоос урт байж болохгүй', num(MAX_DAYS))}</b></span>}
            {!r.group && geree && ms1 != null && ms2 != null && !bad && (ms1 < geree.start || ms2 > geree.end) && (
              <span className={h.mdWarn} role="status">
                {tr('Гэрээний хугацаанаас ({0} — {1}) гарч байна', msToDay(geree.start), msToDay(geree.end))}
              </span>
            )}
          </div>
          {hasActual && (
            <div className={h.mdCol}>
              <div className={h.mdColHead}>{tr('Бодит')}</div>
              <label className={h.mdField}>
                {tr('Эхэлсэн')}
                <DateField value={aa} disabled={!dEdit || !!xLock} label={tr('Эхэлсэн')}
                  onChange={(v) => { setAa(v); setActTouched(true); }} onBad={markBad('aa')} />
              </label>
              <label className={h.mdField}>
                {tr('Дууссан')}
                <DateField value={az} disabled={!dEdit || !!xLock} label={tr('Дууссан')}
                  onChange={(v) => { setAz(v); setActTouched(true); }} onBad={markBad('az')} />
              </label>
              {aBad && <span className={h.mdDays}><b className={h.mdBad}>{tr('Бодит дууссан нь эхэлснээс өмнө')}</b></span>}
              {xLock && canEdit && <span className={h.mdWarn} role="status">{xLock}</span>}
            </div>
          )}
        </div>
        {badTxt.size > 0 && (
          <span className={h.mdDays}><b className={h.mdBad}>{tr('Огноо буруу — жишээ: 2026-10-04')}</b></span>
        )}


        {r.group && (
          <p className={h.mdPar}>
            {tr('Бүлгийн хугацаа нь доторх ажлуудынхаа хамгийн эрт эхлэх — хамгийн сүүл дуусахаар ӨӨРӨӨ бодогдоно. Гараар засахгүй: ажлуудаа зөөвөл бүлэг дагана.')}
          </p>
        )}
        {r.group && canEdit && onShiftGroup && (() => {
          const nv = Number(shiftTxt);
          const ok = /^[+-]?\d{1,4}$/.test(shiftTxt.trim()) && nv !== 0 && Math.abs(nv) <= MAX_DAYS;
          return (
            <p className={h.mdPar}>
              <label className={h.mdField}>
                {tr('Бүлгийг шилжүүлэх')}
                <input type="number" step={1} min={-MAX_DAYS} max={MAX_DAYS} className={h.numIn} value={shiftTxt}
                  aria-label={tr('Бүлгийг шилжүүлэх хоног')}
                  title={tr('Доторх бүх ажлын огноог сонгосон блокуудад N хоногоор зөөнө (сөрөг = урагш)')}
                  onChange={(e) => setShiftTxt(e.target.value)} />
                {' '}{tr('хоног')}
              </label>
              {' '}
              <button type="button" className={h.tlZoomB} disabled={!ok}
                onClick={() => { if (!ok) return; onShiftGroup(Math.trunc(nv), [...selB]); onClose(); }}>
                {tr('Шилжүүлэх')}
              </button>
              {selB.size > 1 && <span className={h.mdParWork}> {tr('{0} блокт', num(selB.size))}</span>}
            </p>
          );
        })()}
        {r.group && obyem && r.vol != null && r.vol > 0 && (
          <p className={h.mdPar}>
            {tr('Сарын обьём бүлэгт биш — доторх ажил тус бүрийн цонхонд сараар хуваана.')}
          </p>
        )}

        {/* ── САРЫН ОБЬЁМ ── */}
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
                          setMvBadK(t !== '' && (!Number.isFinite(Number(t)) || Number(t) < 0) ? k : null);
                          setMv((m) => {
                            const out = new Map(m);
                            if (t === '') out.delete(k);
                            else {
                              const v = Number(t);
                              if (!Number.isFinite(v) || v < 0) out.delete(k);
                              else out.set(k, v);
                            }
                            return out;
                          });
                        }}
                      />
                      <input type="number" className={`${h.numIn} ${h.mdMonthIn}`} min={0} step={1}
                        value={mr.get(k)?.hun ?? ''} disabled={!canEdit || !!xLock}
                        aria-label={tr('{0}-ны хүн хүч', k)}
                        onChange={(e) => setMrCell(k, 'hun', e.target.value)} />
                      <input type="number" className={`${h.numIn} ${h.mdMonthIn}`} min={0} step={1}
                        value={mr.get(k)?.mashin ?? ''} disabled={!canEdit || !!xLock}
                        aria-label={tr('{0}-ны машин механизм', k)}
                        onChange={(e) => setMrCell(k, 'mashin', e.target.value)} />
                    </Fragment>
                  ))}
                  <span className={h.mdMonthTot}>{tr('Нийлбэр')}</span>
                  <span className={`${h.mdMonthTot} num`}>{num(mFocus != null ? mvSum - (mv.get(mFocus) ?? 0) : mvSum, 2)}</span>
                  <span className={`${h.mdMonthTot} num`}>{mrSum.hun != null ? num(mrSum.hun) : '—'}</span>
                  <span className={`${h.mdMonthTot} num`}>{mrSum.mashin != null ? num(mrSum.mashin) : '—'}</span>
                </div>
                {mvBadK != null && mKeys.includes(mvBadK) && mv.get(mvBadK) == null && (
                  <p className={h.mdWarn} role="alert">
                    {tr('{0}: сөрөг эсвэл буруу утга — нүд хоосон үлдлээ. 0 эсвэл эерэг тоо бичнэ үү.', mvBadK)}
                  </p>
                )}
                {xLock && canEdit && !hasActual && <p className={h.mdWarn} role="status">{xLock}</p>}
                {(resFields.hun === false || resFields.mashin === false) && mrHas && (
                  <p className={h.mdWarn}>
                    {tr('Сарын хүснэгтэд хүн хүч/машин механизмын талбар алга — сарын нөөц хадгалагдахгүй. Админд мэдэгдэнэ үү.')}
                  </p>
                )}

                {mFocus != null && mRest != null && (
                  <p className={h.mdPar}>
                    {tr('{0}-ыг оруулахгүй нийлбэр', mFocus)}: <b className="num">{num(mvSum - (mv.get(mFocus) ?? 0), 2)}</b>
                    {' · '}{tr('үлдэгдэл')}: <b className="num">{num(mRest, 2)}</b>
                    {mRest > 0 && canEdit && (
                      <>
                        {' '}
                        <button type="button" className={h.mdSnap}
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
                      {mvBal ? tr('нийт обьёмтой тэнцэв') : (
                        <b className={h.mdBad}>
                          {mvDiff > 0 ? tr('{0}-аар илүү', num(mvDiff, 2)) : tr('{0} дутуу', num(-mvDiff, 2))}
                        </b>
                      )}
                      {!mvFull && (
                        <>
                          {' · '}
                          <b className={h.mdBad}>
                            {tr('хоосон сар: {0} — ажил хийхгүй сард 0 бичнэ үү', mvEmpty.join(', '))}
                          </b>
                        </>
                      )}
                    </>
                  )}
                </p>
                )}
                {dEdit && copyTargets.length > 0 && (
                  <p className={h.mdPar}>
                    <button type="button" className={h.tlZoomB} disabled={copyOff} onClick={() => void copyShifted()}
                      title={copyOff
                        ? tr('Эхлээд идэвхтэй блокийн сарын задаргааг бүрэн, нийлбэр тэнцүү бөглөнө')
                        : tr('Идэвхтэй блокийн саруудыг блок бүрийн алхмын шилжилтээр ({0} хоног × блокийн зөрүү) зөөж хуулна — дараа нь блок бүрийг шалгана уу', num(takt))}>
                      {tr('Идэвхтэй блокийн задаргааг сонгосон блокуудад алхмаар шилжүүлж хуулах')}
                    </button>
                    {' '}<span className={h.mdParWork}>{tr('{0} блокт', num(copyTargets.length))}</span>
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── УЯЛДАА ХОЛБООС ── */}
        {hasHam && (
          <div className={h.mdDeps}>
            <div className={h.mdDepsHead}>
              {tr('Уялдаа — урд ажлууд')}
              {dl.length > 0 && <span className={h.mdDepsN}>{num(dl.length)}</span>}
            </div>
            {dl.map((d, j) => (
              <div key={j} className={h.mdDepRow}>
                <DepPicker value={d.code} cands={cands} disabled={!canEdit}
                  onPick={(code) => setDl((v) => v.map((x, k) => (k === j ? { ...x, code } : x)))} />
                <select className={h.select} value={d.type} disabled={!canEdit}
                  title={tr('FS — урд ажил дуусмагц · SS — урд ажилтай зэрэг эхэлнэ')}
                  onChange={(e) => setDl((v) => v.map((x, k) => (k === j ? { ...x, type: e.target.value as DepType } : x)))}>
                  <option value="FS">{tr('дуусаад (FS)')}</option>
                  <option value="SS">{tr('зэрэг (SS)')}</option>
                </select>
                <LagInput value={d.lag} disabled={!canEdit}
                  onCommit={(n) => setDl((v) => v.map((x, k) => (k === j ? { ...x, lag: n } : x)))} />
                <span className={h.mdDepD}>{tr('хоног')}</span>
                {blocks.length > 1 && (
                  <select className={h.select} value={d.blk ?? ''} disabled={!canEdit}
                    title={tr('Аль блокт үйлчлэх — хоосон бол бүх блокт')}
                    onChange={(e) => setDl((v) => v.map((x, k) => {
                      if (k !== j) return x;
                      const { blk: _b, src: _s, ...rest } = x;
                      if (e.target.value === '') return rest;
                      const nb = Number(e.target.value);
                      return x.src != null && x.src !== nb ? { ...rest, blk: nb, src: x.src } : { ...rest, blk: nb };
                    }))}>
                    <option value="">{tr('бүх блок')}</option>
                    {blocks.map((name, b) => <option key={name} value={b}>{name}</option>)}
                    {d.blk != null && d.blk >= blocks.length && (
                      <option value={d.blk}>{tr('{0}-р блок алга', String(d.blk + 1))}</option>
                    )}
                  </select>
                )}
                {blocks.length > 1 && d.blk != null && (
                  <select className={h.select} value={d.src ?? ''} disabled={!canEdit}
                    aria-label={tr('Урд ажлын блок')}
                    title={tr('Урд ажлын аль блокийн огноогоор — хоосон бол ижил блок')}
                    onChange={(e) => setDl((v) => v.map((x, k) => {
                      if (k !== j) return x;
                      const { src: _s, ...rest } = x;
                      const sb = e.target.value === '' ? null : Number(e.target.value);
                      return sb == null || sb === x.blk ? rest : { ...rest, src: sb };
                    }))}>
                    <option value="">{tr('ижил блокоос')}</option>
                    {blocks.map((name, b) => <option key={name} value={b}>{tr('{0}-аас', name)}</option>)}
                  </select>
                )}
                {canEdit && (
                  <button type="button" className={h.mdDepX} aria-label={tr('Уялдаа устгах')}
                    onClick={() => setDl((v) => v.filter((_, k) => k !== j))}>×</button>
                )}
              </div>
            ))}
            {!!hamKeep?.length && (
              <span className={h.mdParWork} title={tr('Энд дэмжигдээгүй MS Project бичиглэл — засагдахгүй, устгагдахгүй')}>
                {tr('Танигдаагүй бичиглэл (хэвээр хадгалагдана): {0}', hamKeep.join(', '))}
              </span>
            )}
            {canEdit && depsCopied && (
              <span className={h.mdParWork}>{tr('«Тавих» дарахад энэ блокийн уялдаа сонгосон {0} блокт хуулагдана', num(selB.size))}</span>
            )}
            {canEdit && depsTooLong && (
              <span className={h.mdParWork} role="alert">{tr('Уялдааны бичиглэл {0} тэмдэгт — талбарт {1} хүртэл багтана. Блок цөөлөх эсвэл бүх блокийг сонгож нэг уялдаа болгоно уу.', num(hamLen), num(HAM_MAX))}</span>
            )}
            {canEdit && (
              <button type="button" className={h.tlZoomB} disabled={!cands.length}
                onClick={() => setDl((v) => [...v, { code: cands[0].code, type: 'FS', lag: 0 }])}>
                + {tr('Уялдаа нэмэх')}
              </button>
            )}
          </div>
        )}

        {dEdit && blocks.length > 1 && (
          <label className={h.mdField}>
            {tr('алхам (хоног)')}
            <input type="number" min={0} max={365} className={h.numIn} value={takt}
              aria-label={tr('Алхам')}
              title={tr('0 — сонгосон бүх блокт ижил огноо; N — идэвхтэй блокоос дараагийн блок бүр N хоногоор хойшилно')}
              onChange={(e) => onTakt(Math.min(365, Math.max(0, Math.trunc(Number(e.target.value)) || 0)))} />
            <span className={h.mdParWork}>{takt > 0 ? tr('блок бүр {0} хоногоор хойшилно', num(takt)) : tr('сонгосон блокт ижил огноо')}</span>
          </label>
        )}

        {canEdit && applyWhy && <p className={h.mdWarn} role="status">{tr('«Тавих» хаалттай')}: {applyWhy}</p>}
        <footer className={h.mdFoot}>
          {dEdit && (
            <button type="button" className={h.tlZoomB} onClick={() => void clear()}
              disabled={![...selB].some((b) => r.spans[b])}>
              {tr('Арилгах')}
            </button>
          )}
          <span className={h.spacer} />
          <button type="button" className={h.tlZoomB} onClick={tryClose}>{tr('Хаах')}</button>
          {canEdit && (
            <button type="button" className={h.save} onClick={apply} ref={applyBtn}
              disabled={applyOff}
              title={applyWhy}>
              {tr('Тавих')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
