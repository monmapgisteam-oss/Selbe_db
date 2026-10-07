'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { msToDay } from '@/modules/sheet/bagtsSheet';
import { spanDays, type PlanRow, type Span } from '@/lib/plan';
import { formatDeps } from '@/lib/deps';
import { parseDayInput } from '@/lib/dateInput';
import { PL_ROW, type PlanKind } from './types';
import type { AddForm } from './adds';
import h from '../huvaari.module.css';

/* ══════════════════ Ажлын мөр (зүүн багана) ══════════════════ */

export function TaskRow({
  r, on, dirty, collapsed, onToggle, onPick, geree, tolov, canEdit, onHamText,
  hasActual, hasRes, aStart, aEnd, hun, mashin, added, onAdd, onDrop, onEditAdd, mark, onMark, children,
  onDate, onDays, edKind, onEditing,
}: {
  r: PlanRow; on: boolean; dirty: boolean;
  /**
   * БАТЛАГЧИЙН ЗӨВШӨӨРӨЛ (2026-09-25) — `ok` ногоон ✓, `bad` улаан ✕.
   * `onMark` байвал (батлагчийн хяналт) кодын нүд товч болж сэлгэнэ; үгүй бол
   * (гүйцэтгэгчид буцаасан шийдвэр) зөвхөн харагдана.
   * ⚠️ Мөрийн ӨНДӨР хөдлөхгүй — хүрээ/дэвсгэр л (`PL_ROW`-ийн ⚠️).
   */
  mark?: 'ok' | 'bad';
  onMark?: () => void;
  collapsed: boolean;
  onToggle: () => void; onPick: () => void;
  /**
   * НЭМЭЛТ АЖИЛ (2026-09-24). `added` — батлагдаагүй шинэ мөр (сөрөг oid):
   * улаан, popup нээгдэхгүй, уялдаа засагдахгүй, «×»-ээр хасагдана (`onDrop`).
   * `onAdd` — бүлгийн мөрөнд «+» (эрхтэй, түгжээгүй үед л дамжуулна).
   * `children` — бүлгийн доор нээгдэх маягт (`AddBox`), мөрийн дотор
   *   абсолют байрлалтай тул мөрийн ӨНДӨР (`PL_ROW`) хөдлөхгүй — зүүн жагсаалт
   *   ба баруун зурвас эгнээгээ алдахгүй.
   */
  added?: boolean;
  onAdd?: () => void;
  onDrop?: () => void;
  /** Нэмэлт мөрийг засах маягт нээх (2026-09-29) */
  onEditAdd?: () => void;
  children?: ReactNode;
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
   * ⚠️ 2026-10-05 (хэрэглэгч: «огноо дээр дарж бичиж төлөвлөх»): урьд нь
   *    хоёулаа ЗӨВХӨН уншдаг байв. Одоо ИДЭВХТЭЙ табын (`edKind`) эхлэх/дуусах
   *    нүдэнд дарж бичнэ (`onDate`) — нөгөө табынх уншина хэвээр. Засвар нь
   *    чирэлт · popup-тай НЭГ юүлүүрээр (`applyModal`) явдаг тул «аль нь үнэн»
   *    гэсэн хоёрдмол байдал үүсэхгүй.
   * ⚠️ `null` = тэр төрөлд хуваарь ОГТ байхгүй → «—» (0 БИШ).
   */
  geree: Span | null;
  tolov: Span | null;
  /** Огноо бичих (`YYYY-MM-DD`) — `undefined` бол уншина (бүлэг · нэмэлт мөр · эрхгүй) */
  onDate?: (which: 'start' | 'end', day: string) => void;
  /** ⚠️ 2026-10-06: үргэлжлэх ХОНОГИЙГ бичиж төлөвлөх — эхлэх хэвээр, дуусах = эхлэх + N − 1 */
  onDays?: (days: number) => void;
  /** Аль төрлийн огноо засагдах вэ — идэвхтэй таб */
  edKind?: PlanKind;
  /**
   * ⚠️ 2026-10-07: НҮДЭНД БИЧИЖ ЭХЛЭХ/ДУУСАХ (огноо · хоног · уялдаа). Эцэг мөрийг
   *    сонгож цонхлолтод ХҮЧЭЭР багтаана (`useCalendar` `pin`) — урьд нь бичиж байхад
   *    хүрдээр `PL_OVER`-оос цааш гүйлгэхэд мөр салж, бичсэн текст алга болдог байв.
   */
  onEditing?: (on: boolean) => void;
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
      className={`${h.row} ${on ? h.rowOn : ''} ${r.group ? h.rowGroup : ''} ${dirty ? h.rowDirty : ''} ${tolov && !r.group ? h.rowPlanned : ''} ${added ? h.rowAdded : ''} ${mark === 'ok' ? h.rowOk : mark === 'bad' ? h.rowBad : ''}`}
      style={{ height: PL_ROW }}
      /* ⚠️ 2026-10-07: нүднээс нээгдсэн цонх хаагдахад фокус энэ мөрийн нэрийн товч руу буцна (`PlanModal.returnFocus`) */
      data-oid={r.oid}
    >
      {/* ⚠️ АЖЛЫН КОД нь ДОГОЛ МӨРӨӨС ГАДНА — багана болох ёстой тул шатлалын
          зайд хөдөлж болохгүй. Тиймээс догол мөрийг `.row`-оос ЗАЙЛУУЛЖ доорх
          `.rowTree`-д шилжүүлэв: код нь бүх мөрд ЯГ нэг босоо шугамд эгнэнэ.
          ⚠️ Хоосон бол «—», 0 БИШ: код нь дүүргэгдээгүй гэдгийг ялгана. */}
      {onMark ? (
        <button type="button" className={`${h.rowDes} ${h.rowMark}`} onClick={onMark}
          aria-pressed={mark === 'ok'}
          title={mark === 'ok' ? tr('Зөвшөөрсөн — дарж болино') : tr('Зөвшөөрөөгүй — дарж зөвшөөрнө')}>
          <span aria-hidden>{mark === 'ok' ? '✓' : '✕'}</span> {r.des ?? '—'}
        </button>
      ) : (
        <span className={h.rowDes}
          title={mark === 'ok' ? tr('Батлагч зөвшөөрсөн') : mark === 'bad' ? tr('Батлагч зөвшөөрөөгүй — засна уу') : r.des != null ? tr('Ажлын код') : undefined}>
          {mark && <span aria-hidden>{mark === 'ok' ? '✓ ' : '✕ '}</span>}
          {r.des ?? '—'}
        </span>
      )}

      <div className={h.rowTree} style={{ paddingLeft: `${r.depth * 12}px` }}>
        {r.group ? (
          <button type="button" className={h.caret} onClick={onToggle}
            aria-label={collapsed ? tr('Дэлгэх') : tr('Эвхэх')}>
            {collapsed ? '▸' : '▾'}
          </button>
        ) : <span className={h.caretGap} />}

        {/* БҮЛЭГТ АЖИЛ НЭМЭХ «+» (2026-09-24) — caret-ийн хажууд */}
        {r.group && onAdd && (
          <button type="button" className={h.addBtn}
            title={tr('Энэ бүлэгт шинэ ажлын мөр нэмэх')}
            aria-label={tr('«{0}» бүлэгт ажил нэмэх', r.work)}
            onClick={(e) => { e.stopPropagation(); onAdd(); }}>
            +
          </button>
        )}

        {/* ⚠️ Нэр дээр дарахад POPUP ХУАНЛИ нээгдэнэ — огноог тоогоор нарийн
            оруулах ХОЁР ДАХЬ зам (чирэлт нь түргэн, харьцангуй зам).
            ⚠️ Батлагдаагүй нэмэлт мөрд popup ГАРАХГҮЙ — хуваарь нь батлагдсаны
            дараа серверийн мөрөнд тавигдана. */}
        {added ? (
          <span className={h.rowMain} title={tr('Батлагдаагүй шинэ ажил — батлагдсаны дараа хуваарь тавина')}>
            <span className={h.rowNo}>{r.no}</span>
            <span className={h.rowWork}>{r.work}</span>
          </span>
        ) : (
          <button type="button" className={h.rowMain} onClick={onPick}
            title={`${r.work}\n${tr('Хуанлиар оруулах')}`}>
            <span className={h.rowNo}>{r.no}</span>
            <span className={h.rowWork}>{r.work}</span>
          </button>
        )}
        {added && onEditAdd && (
          <button type="button" className={h.dropBtn}
            title={tr('Шинэ мөрийг засах (№ · нэр · обьём · нэгж өртөг)')}
            aria-label={tr('«{0}» мөрийг засах', r.work)}
            onClick={(e) => { e.stopPropagation(); onEditAdd(); }}>
            ✎
          </button>
        )}
        {added && onDrop && (
          <button type="button" className={h.dropBtn}
            title={tr('Илгээгээгүй шинэ мөрийг хасах')}
            aria-label={tr('«{0}» мөрийг хасах', r.work)}
            onClick={(e) => { e.stopPropagation(); onDrop(); }}>
            ×
          </button>
        )}
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
      <DateCell v={geree?.start ?? null} tip={tr('Гэрээний эхлэх огноо')} onEditing={onEditing}
        onSet={edKind === 'geree' && onDate ? (d) => onDate('start', d) : undefined} />
      <DateCell v={geree?.end ?? null} tip={tr('Гэрээний дуусах огноо')} onEditing={onEditing}
        onSet={edKind === 'geree' && onDate ? (d) => onDate('end', d) : undefined} />
      {/* ⚠️ ҮРГЭЛЖЛЭХ ХОНОГ — ТУСДАА багана (2026-09-15, хэрэглэгч).
          `spanDays` нь ХОЁР ҮЗҮҮРИЙГ ОРУУЛЖ тоолно (эхлэх ба дуусах өдөр
          хоёулаа ажлын өдөр) — хуанлийн зурвасын шошготой ЯГ ижил тоо. */}
      <DaysCell v={geree} tip={tr('Гэрээгээр үргэлжлэх хоног')} onEditing={onEditing}
        onSet={edKind === 'geree' && onDays ? onDays : undefined} />
      <DateCell v={tolov?.start ?? null} tip={tr('Төлөвлөгөөт эхлэх огноо')} onEditing={onEditing}
        onSet={edKind === 'plan' && onDate ? (d) => onDate('start', d) : undefined} />
      <DateCell v={tolov?.end ?? null} tip={tr('Төлөвлөгөөт дуусах огноо')} onEditing={onEditing}
        onSet={edKind === 'plan' && onDate ? (d) => onDate('end', d) : undefined} />
      <DaysCell v={tolov} tip={tr('Төлөвлөгөөгөөр үргэлжлэх хоног')} onEditing={onEditing}
        onSet={edKind === 'plan' && onDays ? onDays : undefined} />
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
      {/* ⚠️ Нэмэлт мөрд `onPick` ДАМЖУУЛАХГҮЙ (2026-09-25 аудит) — нэрийн товч хаалттай
          атлаа уялдааны нүдээр popup нээгдэж, сөрөг oid ноорогт ордог байв. */}
      <HamCell r={r} canEdit={canEdit && !added} onText={onHamText} onPick={added ? undefined : onPick} onEditing={onEditing} />
      {children}
    </div>
  );
}

/* ══════════════════ «БҮХ БЛОК»-ИЙН ДЭД МӨР (2026-10-04) ══════════════════ */

/**
 * Ажлын/бүлгийн мөрийн доорх НЭГ БЛОКИЙН мөр — зөвхөн харах.
 * ⚠️ Нүднүүд `TaskRow`-тай ЯГ ижил дараалал/класстай (код · нэр · 6 огноо · бодит ·
 *    нөөц · хамаарал) — толгой ба эх мөртэй эгнэнэ; хураасан (`gSideNarrow`) ба
 *    нарийн дэлгэцийн CSS нуулт ч ижил үйлчилнэ. Өндөр `PL_ROW` хөдлөхгүй.
 * ⚠️ Нөөц (хүн · техник) ба хамаарал нь МӨРИЙН түвшний (блокгүй) тул хоосон —
 *    эх мөрд харагдана. `null` огноо → «—» (0 БИШ).
 * ⚠️ Нэр дээр дарахад тэр блок идэвхжиж горим унтарна (`onPick`) — popup БИШ.
 */
export function BlockRow({
  r, name, on, hasActual, hasRes, aStart, aEnd, geree, tolov, onPick,
}: {
  r: PlanRow; name: string; on: boolean;
  hasActual: boolean; hasRes: boolean;
  aStart: number | null; aEnd: number | null;
  geree: Span | null; tolov: Span | null;
  onPick: () => void;
}) {
  const cell = (cls: string, v: string | number | null, tip: string) => (
    <span className={cls} title={v != null ? tip : undefined}>{v ?? '—'}</span>
  );
  return (
    <div className={`${h.row} ${h.rowSub} ${on ? h.rowOn : ''}`} style={{ height: PL_ROW }}>
      <span className={h.rowDes} />
      <div className={h.rowTree} style={{ paddingLeft: `${(r.depth + 1) * 12}px` }}>
        <span className={h.caretGap} />
        <button type="button" className={h.rowMain} onClick={onPick}
          title={`${r.work}\n${tr('Дарж «{0}» блок руу орж засна', name)}`}>
          <span className={h.rowWork}>{name}</span>
        </button>
      </div>
      {cell(h.rowDate, geree ? msToDay(geree.start) : null, tr('Гэрээний эхлэх огноо'))}
      {cell(h.rowDate, geree ? msToDay(geree.end) : null, tr('Гэрээний дуусах огноо'))}
      {cell(h.rowDays, geree ? spanDays(geree) : null, tr('Гэрээгээр үргэлжлэх хоног'))}
      {cell(h.rowDate, tolov ? msToDay(tolov.start) : null, tr('Төлөвлөгөөт эхлэх огноо'))}
      {cell(h.rowDate, tolov ? msToDay(tolov.end) : null, tr('Төлөвлөгөөт дуусах огноо'))}
      {cell(h.rowDays, tolov ? spanDays(tolov) : null, tr('Төлөвлөгөөгөөр үргэлжлэх хоног'))}
      {hasActual && cell(h.rowDate, aStart != null ? msToDay(aStart) : null, tr('Бодит эхэлсэн огноо'))}
      {hasActual && cell(h.rowDate, aEnd != null ? msToDay(aEnd) : null, tr('Бодит дууссан огноо'))}
      {hasRes && <span className={h.rowRes}>{' '}</span>}
      {hasRes && <span className={h.rowRes}>{' '}</span>}
      <span className={h.rowHam} style={{ cursor: 'default' }}>{' '}</span>
    </div>
  );
}

/* ══════════════════ ШИНЭ АЖЛЫН МАЯГТ (2026-09-24) ══════════════════ */

/**
 * Бүлгийн доор нээгдэх маягт — № · Ажлын нэр · Обьём · Нэгж өртөг (FillNew-ийн
 * 2026-09 маягтын хуулбар). ⚠️ Жин ба Мөнгөн дүн ЭНД БАЙХГҮЙ — Обьём×Нэгж
 * өртгөөс батлагдсаны дараа `computeAll` өөрөө бодно.
 * ⚠️ `role="dialog"` + Esc-д `stopPropagation`/`preventDefault` (2026-10-07): урьд нь зөвхөн
 *    `role`-д найдаж байсан ч React маягтыг `window`-д хүрэхээс ӨМНӨ салгадаг тул `wide`-ийн
 *    Esc сонсогч диалог олохгүй, нэг Esc маягтыг ч, бүтэн дэлгэц/хяналтыг ч хаадаг байв.
 *    Одоо Esc энд маягтыг л хаана.
 */
export function AddBox({ parent, form, onForm, onOk, onCancel, edit = false }: {
  /** `edit` үед ЗАСАЖ буй нэмэлт мөр өөрөө, эс бөгөөс эцэг бүлэг */
  parent: PlanRow;
  /** Байгаа нэмэлт мөрийг засах (2026-09-29) — гарчиг · товчны текст өөр */
  edit?: boolean;
  form: AddForm;
  onForm: (f: AddForm) => void;
  onOk: () => void;
  onCancel: () => void;
}) {
  const first = useRef<HTMLInputElement | null>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const key = (e: { key: string; preventDefault: () => void; stopPropagation: () => void }) => {
    if (e.key === 'Enter') { e.preventDefault(); onOk(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
  };
  const field = (k: keyof AddForm, cls: string, label: string, decimal = false, ref?: typeof first) => (
    <input ref={ref} className={cls} value={form[k]} placeholder={label} aria-label={label}
      inputMode={decimal ? 'decimal' : undefined}
      onChange={(e) => onForm({ ...form, [k]: e.target.value })} onKeyDown={key} />
  );
  return (
    <div className={h.addPop} role="dialog" aria-label={edit ? tr('«{0}» мөрийг засах', parent.work) : tr('«{0}» дотор шинэ ажил', parent.work)}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <span className={h.addTitle}>{edit ? tr('«{0}» мөрийг засах', parent.work) : tr('«{0}» дотор шинэ ажил', parent.work)}</span>
      {field('no', h.addNo, tr('№'), false, first)}
      {field('work', h.addWork, tr('Ажлын нэр'))}
      {field('vol', h.addNum, tr('Обьём'), true)}
      {field('unit', h.addNum, tr('Нэгж өртөг'), true)}
      <button type="button" className={h.addOk} onClick={onOk}>{edit ? tr('Хадгалах') : tr('Нэмэх')}</button>
      <button type="button" className={h.addNo2} onClick={onCancel}>{tr('Болих')}</button>
      <span className={h.addHint}>
        {tr('Обьём ба нэгж өртөг сонголттой — хоосон бол жин бодогдохгүй (—), бусад мөрийн жин хөдлөхгүй. Шинэ мөр бүлгийн эхэнд, улаанаар орно.')}
      </span>
    </div>
  );
}

/* ══════════════════ ОГНООНЫ НҮД (2026-10-05) ══════════════════ */

/**
 * ОГНООНЫ НҮД — дарж бичнэ (хэрэглэгч: «огноо дээр дарж бичиж төлөвлөх»).
 *
 * ⚠️ `onSet` байхгүй бол ӨМНӨХ шигээ зөвхөн `span` (уншина).
 * ⚠️ Бичих хэлбэр `parseDayInput` — 2026-10-04 · 2026.10.04 · 20261004 (`DateField`-тэй ижил).
 * ⚠️ ХАДГАЛАХ нь `Enter`/`blur`-д, тэмдэгт бүрд БИШ (`HamCell`-ийн ижил шалтгаан:
 *    `propagate` 1,400 мөрийн гинжийг дахин боддог). Хоосон/буруу текст → тавихгүй,
 *    хуучин утга руу буцна (арилгах нь popup-ын «Арилгах»).
 * ⚠️ `Escape` — цуцлах (`cancelRef`, `HamCell`-ийн 2026-09-17-ны занга).
 * ⚠️ Мөрийн ӨНДӨР (`PL_ROW`) хөдлөхгүй — оролт нь нүдний хэмжээнд.
 */
function DateCell({ v, tip, onSet, onEditing }: {
  v: number | null;
  tip: string;
  onSet?: (day: string) => void;
  /** ⚠️ 2026-10-07: бичиж эхлэх/дуусахыг эцэгт мэдэгдэнэ (`TaskRow.onEditing`) */
  onEditing?: (on: boolean) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [txt, setTxt] = useState('');
  const cancelRef = useRef(false);
  const shown = v != null ? msToDay(v) : '—';

  if (!onSet) {
    return <span className={h.rowDate} title={v != null ? tip : undefined}>{shown}</span>;
  }

  if (!edit) {
    return (
      <button type="button" className={`${h.rowDate} ${h.rowDateEd}`}
        title={`${tip}\n${tr('Дарж огноо бичнэ: 2026-10-04 · 20261004')}`}
        onClick={() => { setTxt(v != null ? msToDay(v) : ''); setEdit(true); onEditing?.(true); }}>
        {shown}
      </button>
    );
  }

  const bad = parseDayInput(txt) == null;
  return (
    <input
      className={`${h.rowDate} ${h.rowDateIn}${bad ? ` ${h.rowDateBad}` : ''}`}
      value={txt}
      autoFocus
      /* ⚠️ 2026-10-06 аудит: "text" — DateField-ийн ижил; iOS-ийн тоон гарт «-»/«.» байхгүй тул огноо бичих боломжгүй */
      inputMode="text"
      aria-label={tip}
      aria-invalid={bad}
      title={bad ? tr('Огноо буруу — жишээ: 2026-10-04') : tip}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        setEdit(false);
        onEditing?.(false);
        const cancel = cancelRef.current;
        cancelRef.current = false;
        if (cancel) return;
        const p = parseDayInput(txt);
        if (p && p !== (v != null ? msToDay(v) : '')) onSet(p);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.currentTarget.blur(); return; }
        if (e.key === 'Escape') { e.stopPropagation(); cancelRef.current = true; e.currentTarget.blur(); }
      }}
    />
  );
}

/**
 * ҮРГЭЛЖЛЭХ ХОНОГИЙН НҮД — ШУУД БИЧНЭ (2026-10-06, хэрэглэгч: «үргэлжлэх хоногийг
 * мөн бичиж хугацаа төлөвлөх боломжтой болго»). `DateCell`-тэй ижил зан төлөв:
 * дарж бичнэ, `Enter`/`blur` хадгална, `Escape` цуцална.
 *
 * ⚠️ Хуваарьгүй (`v == null`) блокт бичих боломжгүй — эхлэх огноогүй бол хоног
 *    юунаас эхлэхээ мэдэхгүй. Эхлээд эхлэх огноог бичнэ (`applyDate`-ийн мэдэгдэл).
 * ⚠️ Зөвхөн ЭЕРЭГ БҮХЭЛ тоо (1 = эхлэх өдөр = дуусах өдөр — `spanDays` хоёр захыг
 *    оруулж тоолдог). 0, сөрөг, бутархай → улаан, тавихгүй.
 */
function DaysCell({ v, tip, onSet, onEditing }: {
  v: Span | null;
  tip: string;
  onSet?: (days: number) => void;
  /** ⚠️ 2026-10-07: бичиж эхлэх/дуусахыг эцэгт мэдэгдэнэ (`TaskRow.onEditing`) */
  onEditing?: (on: boolean) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [txt, setTxt] = useState('');
  const cancelRef = useRef(false);
  const cur = v ? spanDays(v) : null;
  const shown = cur != null ? String(cur) : '—';

  if (!onSet || !v) {
    return <span className={h.rowDays} title={v ? tip : undefined}>{shown}</span>;
  }

  if (!edit) {
    return (
      <button type="button" className={`${h.rowDays} ${h.rowDateEd}`}
        title={`${tip}\n${tr('Дарж хоногийн тоог бичнэ — дуусах огноо дагаж шилжинэ')}`}
        onClick={() => { setTxt(shown); setEdit(true); onEditing?.(true); }}>
        {shown}
      </button>
    );
  }

  const n = /^\d{1,4}$/.test(txt.trim()) ? Number(txt.trim()) : NaN;
  const bad = !(n >= 1);
  return (
    <input
      className={`${h.rowDays} ${h.rowDateIn}${bad ? ` ${h.rowDateBad}` : ''}`}
      value={txt}
      autoFocus
      inputMode="numeric"
      aria-label={tip}
      aria-invalid={bad}
      title={bad ? tr('Хоног буруу — 1-ээс их бүхэл тоо') : tip}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        setEdit(false);
        onEditing?.(false);
        const cancel = cancelRef.current;
        cancelRef.current = false;
        if (cancel || bad) return;
        if (n !== cur) onSet(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.currentTarget.blur(); return; }
        if (e.key === 'Escape') { e.stopPropagation(); cancelRef.current = true; e.currentTarget.blur(); }
      }}
    />
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
  r, canEdit, onText, onPick, onEditing,
}: {
  r: PlanRow;
  canEdit: boolean;
  onText: (oid: number, text: string) => void;
  /** `undefined` = popup нээгдэхгүй (батлагдаагүй нэмэлт мөр) */
  onPick?: () => void;
  /** ⚠️ 2026-10-07: бичиж эхлэх/дуусахыг эцэгт мэдэгдэнэ (`TaskRow.onEditing`) */
  onEditing?: (on: boolean) => void;
}) {
  const saved = r.deps.length ? formatDeps(r.deps) : '';
  const [txt, setTxt] = useState(saved);
  /* Escape-ээр цуцалсан бол `onBlur`-ийн хадгалалтыг алгасах туг (2026-09-17) */
  const cancelRef = useRef(false);
  const [edit, setEdit] = useState(false);

  /* ⚠️ Гаднаас өөрчлөгдвөл (popup, чирэлтийн гинж, ноорог сэргээх) оролтыг
     дагуулна — ЗӨВХӨН засаж БАЙХГҮЙ үед, эс бөгөөс бичиж байхад нь дарна.
     ⚠️ 2026-09-30: эффектээр `setTxt(saved)` хийдэг байсныг ХАРАГДАЦААР шийдэв —
        засаж байхгүй үед хадгалсан утгыг ШУУД харуулна (`shown`), фокус авахад
        оролтыг хадгалсан утгаас эхлүүлнэ. Үр дүн ижил, завсрын зурагдалтгүй. */
  const shown = edit ? txt : saved;

  if (!canEdit) {
    /* ⚠️ Popup-гүй мөр (2026-09-25 аудит) — товч БИШ; хоосон нүдэнд CSS-ийн «+»
       сануулга гарахгүйн тулд хоосон зай бичнэ. */
    if (!onPick) {
      return <span className={h.rowHam} style={{ cursor: 'default' }}>{saved || '\u00a0'}</span>;
    }
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
        value={shown}
        aria-label={tr('Хамаарал')}
        /* ⚠️ `placeholder` БАЙХГҮЙ (2026-09-15, хэрэглэгч: «бүгд 11FS14
           болчихлоо — энэ жишээ шүү дээ»). Хоосон нүд бүрд жишээ бичиглэл
           харагдвал бодит утга мэт уншигдаж, 1,400 мөр «11FS14»-ээр дүүрсэн
           дүр зураг гарна. Жишээг ЗӨВХӨН `title` (hover) ба толгойн зааварт. */
        title={tr('Жишээ: 11FS14 — 11-р ажил дууссанаас 14 хоногийн дараа. Олныг таслалаар: 11FS,22SS-5. @2 = зөвхөн 2-р блок (@-гүй = бүх блок)')}
        onChange={(e) => { setEdit(true); setTxt(e.target.value); }}
        onFocus={() => { setEdit(true); setTxt(saved); onEditing?.(true); }}
        onBlur={() => { setEdit(false); onEditing?.(false); if (!cancelRef.current) onText(r.oid, txt); cancelRef.current = false; }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.currentTarget.blur(); return; }
          /* ⚠️ Escape = ЦУЦЛАХ: `blur()` синхрон тул `onBlur` хуучин `txt`-ээр хадгалдаг
             байв (2026-09-17). Тугаар хаана.
             ⚠️ 2026-10-06: `stopPropagation` — `DateCell`-ийн адил; урьд нь Esc өргөн горимоос
             ч зэрэг гаргадаг байв. */
          if (e.key === 'Escape') { e.stopPropagation(); cancelRef.current = true; setTxt(saved); setEdit(false); e.currentTarget.blur(); }
        }}
      />
      {/* ⚠️ POPUP руу орох зам — кодоо мэдэхгүй хүнд жагсаалтаас нэрээр нь */}
      {onPick && (
        <button type="button" className={h.hamMore} onClick={onPick}
          title={tr('Жагсаалтаас сонгох')}>…</button>
      )}
    </span>
  );
}
