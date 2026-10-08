import { type PointerEvent as PEvt, useCallback, useRef } from 'react';
import { DAY, type PlanRow, type Span } from '@/lib/plan';
import { propagate } from '@/lib/deps';
import type { MonthRes, PkgPlan, PkgRes } from '@/lib/huvaariObyem';
import type { Schema } from '@/modules/sheet/bagts.pkg';
import { kM, kN, kS } from '@/lib/huvaariDraft';
import type { Drag, DragMode } from './types';
import { obKey, sameMonths, sameRes, sameSpan } from './util';

/**
 * ЗУРВАС ЧИРЭХ ХӨДӨЛГҮҮР — pointer down/move/up · `commit` (гинжтэй) · цуцлах агшин
 * (2026-09-30: `Huvaari.tsx`-ээс механикаар салгав; логик · тайлбар ХЭВЭЭР).
 *
 * ⚠️ `drag` төлөв нь ЭЦЭГТ үлдсэн: `applyChanges` (чирэлтээс өмнөх задаргаа
 *    `drag.origMonths`) ба хуанлийн хүрээ (`useCalendar`, чирэлтийн үед тогтоно)
 *    хоёулаа түүнийг уншдаг — энд `drag`/`setDrag`-ийг параметрээр авна.
 */
/** ⚠️ Мэдрэгч дэлгэцийн «товшилт»-ын босго (px, 2026-10-01) — үүнээс хол бол гүйлгээ */
const TAP_PX = 8;

export function useDragPlan({
  plan, blk, n, applyChanges, canEdit, locked, busy, sc, obOf, obResOf, obDraft, obResDraft,
  setObDraft, setObResDraft, obPlan, obRes, drag, setDrag, setSel, setModal, dayAt, msAt, hdMeta, meRef, chain,
}: {
  plan: PlanRow[];
  blk: number;
  n: number;
  applyChanges: (ch: Map<number, (Span | null)[]>) => void;
  canEdit: boolean;
  locked: boolean;
  busy: boolean;
  sc: Schema | null;
  obOf: (des: number | null, blok: string) => Map<string, number>;
  obResOf: (des: number | null, blok: string) => Map<string, MonthRes>;
  obDraft: Map<string, Map<string, number>>;
  obResDraft: Map<string, Map<string, MonthRes>>;
  setObDraft: React.Dispatch<React.SetStateAction<Map<string, Map<string, number>>>>;
  setObResDraft: React.Dispatch<React.SetStateAction<Map<string, Map<string, MonthRes>>>>;
  obPlan: PkgPlan;
  obRes: PkgRes;
  drag: Drag | null;
  setDrag: (d: Drag | null) => void;
  setSel: (oid: number | null) => void;
  setModal: (oid: number | null) => void;
  dayAt: (clientX: number) => number;
  msAt: (k: number) => number;
  /** Хуваалцсан нооргийн нүд → хэн бичсэн (бусдын нүдийг агшнаар дарахгүй) */
  hdMeta: React.RefObject<Map<string, { at: number; user: string }>>;
  meRef: React.RefObject<string>;
  /** ⚠️ Уялдааны гинж (`propagate`) — ЗӨВХӨН төлөвлөгөө табд (`kind === 'plan'`, 2026-10-06) */
  chain: boolean;
}) {
  /**
   * ЧИРЭЛТИЙГ БУЦААХ мэдээлэл — popup-ыг ЦУЦЛАХАД сэргээнэ.
   *
   * ⚠️ `null` = цуцлахад буцаах зүйлгүй (мөрөөс товшиж нээсэн цонх). Чирэлтээр
   *    нээгдсэн үед л дүүрнэ; «Тавих», «Арилгах» хоёулаа үүнийг цэвэрлэнэ —
   *    тэдгээр нь ЗӨВШӨӨРӨГДСӨН өөрчлөлт тул буцаах ёсгүй.
   */
  const undoRef = useRef<{
    oid: number; blk: number; span: Span | null; months: Map<string, number> | null; snap: Map<number, Span | null> | null;
    /** чирэлтээс өмнөх сарын нөөц (2026-09-24) */
    res: Map<string, MonthRes> | null;
    /** ЭНЭ чирэлтийн хөдөлгөсөн мөрүүд — зөвхөн тэднийг буцаана (2026-09-24) */
    touched: Set<number> | null;
    /** Чирэлтээс өмнөх obDraft/obResDraft — гинжээр хөдөлсөн мөрийн задаргааг буцаана (2026-09-24 аудит) */
    obSnap: Map<string, Map<string, number>> | null;
    obResSnap: Map<string, Map<string, MonthRes>> | null;
    /** ⚠️ 2026-10-08: чирэлтээс өмнөх БҮХ мөрийн БҮХ блокийн муж (`snapAll`-ийн ⚠️) */
    snapAll: Map<number, (Span | null)[]> | null;
  } | null>(null);
  /**
   * ⚠️ 2026-10-08: ЧИРЭЛТЭЭС ӨМНӨХ БҮХ БЛОКИЙН АГШИН. `drag.snap` зөвхөн идэвхтэй блокийг
   *    хадгалдаг тул гинж (`propagate`) хамаарагчийн ӨӨР блокийг хөндвөл цуцлахад тэр нь
   *    ноорогт чимээгүй үлддэг байв. Гинжээр хөдөлсөн (`touched`) мөрийн бүх блокийг эндээс
   *    сэргээнэ; чирсэн мөр өөрөө урьдын адил зөвхөн `u.blk` (2026-09-21-ний ⚠️).
   */
  const snapAll = useRef<Map<number, (Span | null)[]> | null>(null);
  /**
   * Чирэлт хамгийн сүүлд ЯМАР ХОНОГ дээр байсан.
   * ⚠️ `pointermove` секундэд ~60 удаа ирнэ, харин хоног нь зөвхөн багана
   *    (4–34px) давахад л солигдоно. Хоног солигдоогүй бол ажил хийхгүй —
   *    эс тэгвээс 1,266 мөрийн тооцоо кадр бүрд дахин бодогдоно.
   */
  const lastDay = useRef(-1);
  /** Товшилт vs чирэлт */
  const moved = useRef(false);
  /**
   * ⚠️ МЭДРЭГЧ ДЭЛГЭЦИЙН ГҮЙЛГЭЭ ≠ ТОВШИЛТ (2026-10-01). Хоног зөвхөн `clientX`-ээр
   * бодогддог тул хуваарьгүй мөр дээр БОСОО шударвал `moved` худал үлдэж `onUp`
   * 1 хоногийн муж үүсгэдэг байв. Хурууны эхлэх цэг (`down`) — босго (`TAP_PX`)-оос
   * хол хөдөлсөн бол товшилт биш (`far`); хоног солигдохоос ӨМНӨ босоо давамгай
   * бол гүйлгээ гэж үзээд чирэлтийг үл тооно (`scroll`).
   * ⚠️ Зөвхөн `pointerType === 'touch'` — хулганы/үзгийн зан төлөв ХЭВЭЭР.
   */
  const down = useRef<{ x: number; y: number; touch: boolean }>({ x: 0, y: 0, touch: false });
  const far = useRef(false);
  const scroll = useRef(false);
  /**
   * ⚠️ ЧИРЭХГҮЙ ЗУРВАСЫН ДАРАЛТ (2026-10-06) — эрхгүй · түгжээтэй · бичиж байгаа ·
   * бүлгийн зурвас. Цонхыг `onUp`-д л (хөдөлгөөн ≤ `TAP_PX`) нээнэ (`onDown`-ийн ⚠️).
   * `ev` — эгнээ рүү дэвжсэн ИЖИЛ `pointerdown`-ийг таних.
   */
  const press = useRef<{ oid: number; x: number; y: number; ev: Event } | null>(null);
  /**
   * ЭНЭ ЧИРЭЛТИЙН ХӨДӨЛГӨСӨН мөрүүд (oid) — цуцлахад ЗӨВХӨН эдгээрийг буцаана
   * (2026-09-24). Урьд нь агшин (`snap`)-аас зөрсөн БҮХ мөрийг буцаадаг тул
   * чирэлт/цонхны хооронд хамт ажиллагчийн алсаас нийлсэн нүд ч «цуцлагдаж»
   * байв. `commit` бүрд `propagate`-ийн үр дүнгээс цуглуулна.
   */
  const dragTouched = useRef(new Set<number>());
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
       Хамаарал байхгүй бол `propagate` нь зөвхөн энэ мөрийг л буцаана.
       ⚠️ 2026-10-06: ГЭРЭЭ табд (`!chain`) гинж ҮГҮЙ — уялдаа нь зөвхөн
       төлөвлөгөөнд; урьд нь гэрээний зурвас чирэхэд хамаарагчдын ГЭРЭЭНИЙ огноо
       чимээгүй шилждэг байв. Зөвхөн чирсэн мөр. */
    const ov = new Map([[at, next]]);
    const ch = chain ? propagate(plan, n, ov) : ov;
    for (const i of ch.keys()) if (plan[i]) dragTouched.current.add(plan[i].oid);
    applyChanges(ch);
  }, [plan, blk, n, applyChanges, chain]);

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
    /* ⚠️ ЗУРВАС ДЭЭР ДАРАХАД ЦОНХ (2026-10-05, хэрэглэгч: «хэвтээ төлөвлөлтийн
       шугам дээр дарж засах»). Чирэх боломжгүй үед (эрхгүй · түгжээтэй · бичиж
       байгаа · бүлэг) зурвас (`mode !== 'new'`) дээр дарвал нэр дээр дарсантай
       (`onPick`) ИЖИЛ цонх нээгдэнэ — эрхгүй бол цонх нь зөвхөн харуулна.
       Батлагдаагүй нэмэлт мөрд (сөрөг oid) нэрийнх шиг цонх ГАРАХГҮЙ.
       ⚠️ 2026-10-06: `pointerdown` дээр НЭЭХГҮЙ — мэдрэгч дэлгэцэд хуанлийг
       гүйлгэх гэж шудрахад л цонх үсрэн гардаг байв. Одоо даралтыг (`press`)
       тэмдэглээд `onUp`-д хөдөлгөөн ≤ `TAP_PX` бол л нээнэ; гүйлгээ эхэлбэл хөтөч
       `pointercancel` илгээж `onCancel` даралтыг цэвэрлэнэ. */
    const openBar = () => {
      if (mode === 'new' || r.oid < 0) return;
      press.current = { oid: r.oid, x: e.clientX, y: e.clientY, ev: e.nativeEvent };
    };
    /* ⚠️ Зурвасын даралт эгнээ (`mode === 'new'`) рүү ДЭВЖИНЭ — тэр нь ИЖИЛ үйл
       явдал бол даралтыг арилгахгүй; шинэ даралт бол хуучин үлдэгдлийг цэвэрлэнэ. */
    if (press.current?.ev !== e.nativeEvent) press.current = null;
    if (!canEdit || locked || busy) { openBar(); return; }
    /* ⚠️ БҮЛГИЙН МУЖ ГАРААР ЗАСАГДАХГҮЙ (2026-09-06, хэрэглэгч: «бүлгийн
       range өөрчлөх боломжгүй, ажлын range-ээс хамаарч автоматаар»).
       Мөрийг СОНГОНО — чирэлт эхлэхгүй (зурвас дээр бол цонх, дээрх ⚠️). */
    /* ⚠️ Батлагдаагүй НЭМЭЛТ мөр (сөрөг oid, 2026-09-24) ЗАСАГДАХГҮЙ — ноорогт
       сөрөг oid орвол `save` серверээс мөрийг олохгүй. Батлагдсаны дараа
       серверийн oid-тай ирж ердийн мөр болно. */
    if (r.oid < 0) return;
    if (r.group) { setSel(r.oid); openBar(); return; }
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const k = dayAt(e.clientX);
    lastDay.current = k;
    moved.current = false;
    down.current = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
    far.current = false;
    scroll.current = false;
    /* ⚠️ Сарын задаргааг ЧИРЭЛТЭЭС ӨМНӨ хуулна (2026-09-17): чирэлт `applyChanges`-аар
       задаргааг хумьдаг тул буцаахад зөвхөн энэ хуулбар л бүтэн сэргээнэ. */
    const blokName = sc?.bld[blk] ?? '';
    const origMonths = r.des != null && blokName ? new Map(obOf(r.des, blokName)) : null;
    const origRes = r.des != null && blokName ? new Map(obResOf(r.des, blokName)) : null;
    dragTouched.current = new Set([r.oid]);
    /* ⚠️ 2026-10-08: бүх блокийн агшин — `spans` массивууд хөндөгддөггүй (`commit` хуулдаг) тул лавлагаа хангалттай */
    snapAll.current = new Map(plan.map((x) => [x.oid, x.spans] as const));
    setDrag({
      oid: r.oid, mode, anchor: k, orig: r.spans[blk], origMonths, origRes,
      snap: new Map(plan.map((x) => [x.oid, x.spans[blk]] as const)),
      obSnap: new Map(obDraft), obResSnap: new Map(obResDraft),
    });
    setSel(r.oid);
  };

  const onMove = (e: PEvt<HTMLElement>) => {
    if (!drag) return;
    /* ⚠️ Мэдрэгчийн гүйлгээ (дээрх `down`-ийн ⚠️) — илэрсэн бол чирэлт ҮГҮЙ */
    if (scroll.current) return;
    if (down.current.touch && !moved.current) {
      const dx = Math.abs(e.clientX - down.current.x);
      const dy = Math.abs(e.clientY - down.current.y);
      if (Math.max(dx, dy) > TAP_PX) far.current = true;
      if (dy > TAP_PX && dy > dx) { scroll.current = true; return; }
    }
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

  const onUp = (e?: PEvt<HTMLElement>) => {
    /* ⚠️ Чирэхгүй зурвасын ТОВШИЛТ → цонх (2026-10-06, `press`-ийн ⚠️) */
    const p = press.current;
    press.current = null;
    if (p && e && Math.max(Math.abs(e.clientX - p.x), Math.abs(e.clientY - p.y)) <= TAP_PX) {
      undoRef.current = null;
      setSel(p.oid);
      setModal(p.oid);
    }
    /* Хөдөлгөөнгүй товшилт: хоосон мөрд 1 хоногийн муж, эсрэг тохиолдолд
       зөвхөн сонголт (дээрх тайлбар). */
    const blank = !!drag && !moved.current && !far.current && !scroll.current && drag.mode === 'new' && !drag.orig;
    if (drag && blank) {
      commit(drag.oid, { start: msAt(drag.anchor), end: msAt(drag.anchor) });
    }
    /* ⚠️ ЗУРВАС ДЭЭРХ ХӨДӨЛГӨӨНГҮЙ ТОВШИЛТ → ЦОНХ (2026-10-05, хэрэглэгч; `onDown`-ийн ⚠️).
       Хуваарь ХӨДЛӨХГҮЙ, ноорогт юу ч бичигдэхгүй — «товшилт ≠ чирэлт» хэвээр.
       Буцаах чирэлт байхгүй тул `undoRef` хоосон (нэрээс нээсэнтэй ижил).
       Мөрийн ХООСОН хэсэгт (`mode === 'new'`) товшилт хуучнаараа — зөвхөн сонголт. */
    const barTap = !!drag && !moved.current && !far.current && !scroll.current && drag.mode !== 'new';
    if (drag && barTap) {
      undoRef.current = null;
      setModal(drag.oid);
    }
    /**
     * ЧИРЭЛТЭЭР ТӨЛӨВЛӨСНИЙ ДАРАА САРЫН ЗАДАРГААГ ИЛ ГАРГАНА (2026-09-06,
     * хэрэглэгч: «зураасаар төлөвлөхөд мөн адил гарах ёстой»).
     *
     * ⚠️ Тараалт нь `applyChanges` дотор аль хэдийн хийгдсэн бөгөөд нийлбэр нь
     *    үргэлж тэнцүү — цонх нь ЗАСАХ боломж, шаардлага БИШ.
     * ⚠️ ЗӨВХӨН хуваарь ӨӨРЧЛӨГДСӨН үед: хуваарьтай мөрийн ХООСОН хэсэгт
     *    товшиход цонх үсрэн гарвал «товшилт ≠ чирэлт» гэсэн дүрэм эвдэрнэ.
     *    (2026-10-05-наас ЗУРВАС дээрх товшилт цонх нээнэ — дээрх `barTap`,
     *    гэхдээ буцаах агшингүй, хуваарь хөдлөхгүй.)
     * ⚠️ ОБЬЁМГҮЙ МӨРД Ч НЭЭНЭ (2026-09-06-нд засав). Урьд нь зөвхөн
     *    обьёмтой мөрд нээдэг байсан тул «Талбайн түр хашаа барих» мэт
     *    обьёмгүй ажлын хуваарийг зөөхөд юу ч гарахгүй, хэрэглэгч «цонх
     *    гарахгүй байна» гэж мэдэгдсэн. Одоо цонх үргэлж гарч, обьёмгүй
     *    бол ШАЛТГААНЫГ нь бичнэ.
     */
    if (drag && (moved.current || blank)) {
      const r = plan.find((x) => x.oid === drag.oid);
      if (r) {
        setModal(r.oid);
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
        undoRef.current = {
          oid: drag.oid, blk, span: drag.orig, months: drag.origMonths ?? null, res: drag.origRes ?? null, snap: drag.snap ?? null,
          touched: new Set(dragTouched.current),
          obSnap: drag.obSnap ?? null, obResSnap: drag.obResSnap ?? null,
          snapAll: snapAll.current,
        };
      }
    }
    setDrag(null);
    moved.current = false;
  };

  /**
   * ⚠️ `pointercancel` = ЧИРЭЛТИЙГ ЦУЦЛАХ (2026-10-01). Урьд нь `onUp`-тай ижил
   * байсан тул хөтөч/систем дохиог тасалбал (гүйлгээ эхлэх, дуудлага ирэх, хуруу
   * дэлгэцээс гарах) ХАГАС чирэлт ноорогт бичигдэж, popup ч нээгддэг байв. Одоо
   * popup НЭЭХГҮЙ, «Хаах»-тай ижил агшнаар (`rollback`) буцаана.
   */
  const onCancel = () => {
    press.current = null; // ⚠️ гүйлгээ эхэлсэн — зурвасын цонх нээхгүй (2026-10-06)
    if (drag && moved.current && !busy && !locked) {
      rollback({
        oid: drag.oid, blk, span: drag.orig, months: drag.origMonths ?? null, res: drag.origRes ?? null, snap: drag.snap ?? null,
        touched: new Set(dragTouched.current),
        obSnap: drag.obSnap ?? null, obResSnap: drag.obResSnap ?? null,
        snapAll: snapAll.current,
      });
    }
    setDrag(null);
    moved.current = false;
    far.current = false;
    scroll.current = false;
  };

  /**
   * POPUP ХААГДАХАД ЧИРЭЛТИЙГ БУЦААНА (2026-09-30: `PlanModal`-ын `onClose`-оос
   * механикаар салгав — логик · тайлбар ХЭВЭЭР). Цонхыг хааж (`setModal(null)`),
   * чирэлтээр нээгдсэн бол `undoRef`-ийн агшнаар сэргээнэ.
   */
  const undoDragOnClose = () => {
    const u = undoRef.current;
    undoRef.current = null;
    setModal(null);
    if (u && !busy && !locked) rollback(u);
  };

  /**
   * ЧИРЭЛТЭЭС ӨМНӨХ АГШНААР БУЦААХ (2026-10-01: `undoDragOnClose`-оос салгав —
   * `onCancel` ч ашиглана; логик · тайлбар ХЭВЭЭР).
   */
  function rollback(u: NonNullable<typeof undoRef.current>) {
    /*
     * ⚠️ БҮХ ХӨДӨЛСӨН МӨРИЙГ буцаана (2026-09-23 аудит). Урьд нь
     *    `applyModal`-аар зөвхөн чирсэн мөрийг буцаадаг байв — тэгэхэд
     *    гинжээр хөдөлсөн хамааралтай мөрүүд (`propagate`) анхны
     *    огноондоо биш, чирсэн мөрийн ШИНЭ шаардлагад дахин тооцогдож
     *    «цуцалсан» засвар ноорогт үлддэг байв. Одоо чирэлтээс өмнөх
     *    агшин (`snap`)-аас ЗӨРСӨН мөр бүрийг `applyChanges`-аар ШУУД
     *    (тархалтгүй) сэргээнэ — өмнөх төлөв аль хэдийн нийцтэй байсан.
     * ⚠️ Зөвхөн `u.blk` блок — цонх нээлттэй байхад блок сольсон бол
     *    нөгөө блокт хийсэн ажил хөндөгдөхгүй (2026-09-21).
     * ⚠️ ЗӨВХӨН ЭНЭ ЧИРЭЛТИЙН ХӨДӨЛГӨСӨН мөр (`touched`, 2026-09-24):
     *    хамт ажиллагчийн алсаас нийлсэн нүд агшнаас зөрдөг ч энэ
     *    чирэлтийнх биш — буцаавал бусдын ажил цуцлагдана.
     */
    const ch = new Map<number, (Span | null)[]>();
    const put = (i: number, sp: Span | null) => {
      const next = plan[i].spans.slice();
      next[u.blk] = sp;
      ch.set(i, next);
    };
    const at = plan.findIndex((x) => x.oid === u.oid);
    if (at >= 0) put(at, u.span);
    if (u.snap) {
      plan.forEach((x, i) => {
        if (i === at) return;
        if (u.touched && !u.touched.has(x.oid)) return;
        /* ⚠️ 2026-10-08: гинжээр хөдөлсөн мөрийн БҮХ блокийг агшнаар (`snapAll`-ийн ⚠️) — зөрсөн блок л */
        const all = u.snapAll?.get(x.oid);
        if (all) {
          const next = x.spans.slice();
          let diff = false;
          for (let b = 0; b < next.length; b++) {
            const s0 = all[b] ?? null;
            if (sameSpan(next[b], s0)) continue;
            /* ⚠️ БУСДЫН нүдийг агшнаар дарахгүй — доорх `other()`-ийн ижил дүрэм (цонх нээлттэй байхад нийлсэн) */
            const mu = hdMeta.current.get(kS(x.oid, b))?.user;
            if (mu && mu !== meRef.current) continue;
            next[b] = s0; diff = true;
          }
          if (diff) ch.set(i, next);
          return;
        }
        const sp = u.snap!.get(x.oid);
        if (sp === undefined || sameSpan(x.spans[u.blk], sp)) return;
        put(i, sp);
      });
    }
    applyChanges(ch);
    /* ⚠️ Сарын задаргааг ЧИРЭЛТЭЭС ӨМНӨХ хуулбараар сэргээнэ (2026-09-17):
       чирэлт `applyChanges`-аар задаргааг хумьсан байж болох тул `null`
       (хөндөхгүй) хангалтгүй, `new Map()` (устгах) буруу байв. */
    const des = at >= 0 ? plan[at].des : null;
    const blok = sc?.bld[u.blk];
    if (u.months && des != null && blok) {
      const key = obKey(des, blok);
      const months = u.months;
      setObDraft((m) => {
        const next = new Map(m);
        if (sameMonths(months, obPlan.get(des)?.get(blok))) next.delete(key);
        else next.set(key, months);
        return next;
      });
    }
    /* Сарын нөөц ч чирэлтээс өмнөх хуулбараар (2026-09-24) */
    if (u.res && des != null && blok) {
      const key = obKey(des, blok);
      const res = u.res;
      setObResDraft((m) => {
        const next = new Map(m);
        if (sameRes(res, obRes.get(des)?.get(blok))) next.delete(key);
        else next.set(key, res);
        return next;
      });
    }
    /* ⚠️ ГИНЖЭЭР ХӨДӨЛСӨН мөрийн задаргаа/нөөц ч чирэлтээс өмнөх агшнаар
       (2026-09-24 аудит): муж нь дээр буцсан ч `applyChanges`-ийн
       `keepMonths`/`keepRes` тайралт ноорогт үлдэж «хадгалаагүй N» +
       тэнцээгүй нийлбэр гардаг байв. Зөвхөн `touched` мөр · `u.blk` блок. */
    if (blok && (u.obSnap || u.obResSnap)) {
      const keys: string[] = [];
      plan.forEach((x, i) => {
        if (i === at || x.des == null) return;
        if (u.touched && !u.touched.has(x.oid)) return;
        keys.push(obKey(x.des, blok));
      });
      /* ⚠️ БУСДЫН нүдийг агшнаар ДАРАХГҮЙ (2026-09-24 аудит): цонх нээлттэй
         байхад мөчлөг (`hdApply`) бусдын m:/n: нүдийг нийлүүлсэн бол
         чирэлтээс өмнөх агшин түүнийг арчдаг байв. Мета-д өөр хэрэглэгч
         бичсэн нүдийг алгасна. */
      const other = (hk: string) => {
        const mu = hdMeta.current.get(hk)?.user;
        return !!mu && mu !== meRef.current;
      };
      if (keys.length && u.obSnap) {
        const snap = u.obSnap;
        setObDraft((m) => {
          const next = new Map(m);
          for (const k of keys) {
            if (other(kM(k))) continue;
            const v = snap.get(k); if (v) next.set(k, v); else next.delete(k);
          }
          return next;
        });
      }
      if (keys.length && u.obResSnap) {
        const snap = u.obResSnap;
        setObResDraft((m) => {
          const next = new Map(m);
          for (const k of keys) {
            if (other(kN(k))) continue;
            const v = snap.get(k); if (v) next.set(k, v); else next.delete(k);
          }
          return next;
        });
      }
    }
  }

  return { undoRef, onDown, onMove, onUp, onCancel, undoDragOnClose };
}
