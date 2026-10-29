'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { fixCyr, num } from '@/lib/format';
import { msToDay } from '@/modules/sheet/bagtsSheet';
import { spanDays, type PlanRow, type Span } from '@/lib/plan';
import { formatDeps } from '@/lib/deps';
import { parseDayInput } from '@/lib/dateInput';
import { MAX_DAYS, PL_ROW, type PlanKind } from './types';
import type { AddForm } from './adds';
import { workName } from './util';
import h from '../huvaari.module.css';

export type CellVia = 'enter' | 'blur' | 'nav';

/* ══════════════════ Ажлын мөр (зүүн багана) ══════════════════ */

export function TaskRow({
  r, on, dirty, collapsed, onToggle, onPick, geree, tolov, canEdit, onHamText,
  hasActual, hasRes, aStart, aEnd, hun, mashin, added, onAdd, onDrop, onEditAdd, mark, onMark, children,
  onDate, onDays, edKind, onEditing, hamKeep,
  onNextRow, onOtherTab, changedBlks, onPickBlk, blkOn, editedBy,
}: {
  r: PlanRow; on: boolean; dirty: boolean;
  /**
   * БАТЛАГЧИЙН ЗӨВШӨӨРӨЛ (2026-09-25) — `ok` ногоон ✓, `bad` улаан ✕.
   * `onMark` байвал (батлагчийн хяналт) кодын нүд товч болж сэлгэнэ; үгүй бол
   * (гүйцэтгэгчид буцаасан шийдвэр) зөвхөн харагдана.
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
   * popup-аас засагдана (дээрх дөрвөн огнооны -тэй ижил). Бүлгийн мөрд
   * дуудагч `aggExtra`-аар бодож өгнө. `null` = бүртгэлгүй → «—».
   * `hasActual`/`hasRes` худал бол багана ОГТ зурагдахгүй — толгойтой нийцнэ.
   */
  hasActual: boolean; hasRes: boolean;
  aStart: number | null; aEnd: number | null;
  hun: number | null; mashin: number | null;
  /**
   * ГЭРЭЭНИЙ ба ТӨЛӨВЛӨГӨӨНИЙ нийт муж — дөрвөн огнооны багана.
   */
  geree: Span | null;
  tolov: Span | null;
  /** Огноо бичих (`YYYY-MM-DD`) — `undefined` бол уншина (бүлэг · нэмэлт мөр · эрхгүй). */
  onDate?: (which: 'start' | 'end', day: string, via: CellVia) => string | void;
  onDays?: (days: number, via: CellVia) => string | void;
  /** Аль төрлийн огноо засагдах вэ — идэвхтэй таб */
  edKind?: PlanKind;
  onEditing?: (on: boolean) => void;
  /** Уялдааны нүд ЗАСАГДАХ уу — эрхгүй бол зөвхөн уншина */
  canEdit: boolean;
  /** Нүдэнд бичсэн текстийг хадгална. 2026-10-09: хэсэгчлэн/бүхэлд татгалзсан бол ШАЛТГААН буцаана */
  onHamText: (oid: number, text: string) => string | void;
  hamKeep?: readonly string[];
  onNextRow?: (oid: number, col: 'start' | 'end' | 'days' | 'ham', dir: 1 | -1) => void;
  onOtherTab?: () => void;
  changedBlks?: number[];
  onPickBlk?: (b: number) => void;
  blkOn?: number;
  editedBy?: { user: string; at: number } | null;
}) {
  const otherOk = !!onOtherTab;
  const otherTip = edKind === 'geree' ? tr('Төлөвлөгөө табд засна — дарж шилжинэ') : tr('Гэрээ табд засна — дарж шилжинэ');
  const onOtherG = otherOk && edKind === 'plan' ? onOtherTab : undefined;
  const onOtherP = otherOk && edKind === 'geree' ? onOtherTab : undefined;
  const next = onNextRow ? (col: 'start' | 'end' | 'days' | 'ham') => (dir: 1 | -1) => onNextRow(r.oid, col, dir) : undefined;
  return (
    <div
      className={`${h.row} ${on ? h.rowOn : ''} ${r.group ? h.rowGroup : ''} ${dirty ? h.rowDirty : ''} ${tolov && !r.group ? h.rowPlanned : ''} ${added ? h.rowAdded : ''} ${mark === 'ok' ? h.rowOk : mark === 'bad' ? h.rowBad : ''}`}
      style={{ height: PL_ROW }}
      data-oid={r.oid}
    >
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

      <div className={h.rowTree} style={{ paddingLeft: `${Math.min(r.depth, 2) * 12 + Math.max(0, r.depth - 2) * 6}px` }}>
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
            aria-label={tr('«{0}» бүлэгт ажил нэмэх', workName(r))}
            onClick={(e) => { e.stopPropagation(); onAdd(); }}>
            +
          </button>
        )}

        {added ? (
          <span className={h.rowMain} title={tr('Батлагдаагүй шинэ ажил — батлагдсаны дараа хуваарь тавина')}>
            <span className={h.rowNo}>{r.no}</span>
            <span className={h.rowWork}>{workName(r)}</span>
          </span>
        ) : (
          <button type="button" className={h.rowMain} onClick={onPick}
            title={`${fixCyr(r.work)}\n${tr('Хуанлиар оруулах')}`}>
            <span className={h.rowNo}>{r.no}</span>
            <span className={h.rowWork}>{workName(r)}</span>
          </button>
        )}
        {editedBy && (
          <span className={h.coDot} role="img"
            aria-label={tr('{0} засаж байна', editedBy.user)}
            title={`${editedBy.user} · ${new Date(editedBy.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`} />
        )}
        {!!changedBlks?.length && (
          <span className={h.blkChips} title={tr('Өөрчлөгдсөн блок: {0}', changedBlks.map((b) => String(b + 1)).join('·'))}>
            {changedBlks.map((b) => (
              onPickBlk ? (
                <button type="button" key={b}
                  className={`${h.blkChip}${b === blkOn ? ` ${h.blkChipOn}` : ''}`}
                  aria-pressed={b === blkOn}
                  title={tr('{0}-р блок руу үсрэх', String(b + 1))}
                  onClick={(e) => { e.stopPropagation(); onPickBlk(b); }}>
                  {b + 1}
                </button>
              ) : (
                <span key={b} className={`${h.blkChip}${b === blkOn ? ` ${h.blkChipOn}` : ''}`}>{b + 1}</span>
              )
            ))}
          </span>
        )}
        {added && onEditAdd && (
          <button type="button" className={h.dropBtn}
            title={tr('Шинэ мөрийг засах (№ · нэр · обьём · нэгж өртөг)')}
            aria-label={tr('«{0}» мөрийг засах', workName(r))}
            onClick={(e) => { e.stopPropagation(); onEditAdd(); }}>
            ✎
          </button>
        )}
        {added && onDrop && (
          <button type="button" className={h.dropBtn}
            title={tr('Илгээгээгүй шинэ мөрийг хасах — «↶ Буцаах»-аар сэргээнэ')}
            aria-label={tr('«{0}» мөрийг хасах', workName(r))}
            onClick={(e) => { e.stopPropagation(); onDrop(); }}>
            ×
          </button>
        )}
      </div>

      {/*
        * ДӨРВӨН ОГНООНЫ НҮД — гэрээ (эхлэх · дуусах) ба төлөвлөгөө
        * (эхлэх · дуусах). 2026-09-15-ны хэрэглэгчийн хүсэлт.
        */}
      <DateCell c={h.cGs} v={geree?.start ?? null} tip={tr('Гэрээний эхлэх огноо')} onEditing={onEditing} col="start"
        onSet={edKind === 'geree' && onDate ? (d, via) => onDate('start', d, via) : undefined}
        onNext={edKind === 'geree' ? next?.('start') : undefined} onOther={onOtherG} otherTip={otherTip} />
      <DateCell c={h.cGe} v={geree?.end ?? null} tip={tr('Гэрээний дуусах огноо')} onEditing={onEditing} col="end"
        onSet={edKind === 'geree' && onDate ? (d, via) => onDate('end', d, via) : undefined}
        onNext={edKind === 'geree' ? next?.('end') : undefined} onOther={onOtherG} otherTip={otherTip} />
      <DaysCell c={h.cGd} v={geree} tip={tr('Гэрээгээр үргэлжлэх хоног')} onEditing={onEditing}
        onSet={edKind === 'geree' && onDays ? onDays : undefined}
        onNext={edKind === 'geree' ? next?.('days') : undefined} onOther={onOtherG} otherTip={otherTip} />
      <DateCell c={h.cPs} v={tolov?.start ?? null} tip={tr('Төлөвлөгөөт эхлэх огноо')} onEditing={onEditing} col="start"
        onSet={edKind === 'plan' && onDate ? (d, via) => onDate('start', d, via) : undefined}
        onNext={edKind === 'plan' ? next?.('start') : undefined} onOther={onOtherP} otherTip={otherTip} />
      <DateCell c={h.cPe} v={tolov?.end ?? null} tip={tr('Төлөвлөгөөт дуусах огноо')} onEditing={onEditing} col="end"
        onSet={edKind === 'plan' && onDate ? (d, via) => onDate('end', d, via) : undefined}
        onNext={edKind === 'plan' ? next?.('end') : undefined} onOther={onOtherP} otherTip={otherTip} />
      <DaysCell c={h.cPd} v={tolov} tip={tr('Төлөвлөгөөгөөр үргэлжлэх хоног')} onEditing={onEditing}
        onSet={edKind === 'plan' && onDays ? onDays : undefined}
        onNext={edKind === 'plan' ? next?.('days') : undefined} onOther={onOtherP} otherTip={otherTip} />
      {/* БОДИТ ЭХЭЛСЭН · ДУУССАН (2026-09-23) — идэвхтэй блок; «—» = бүртгэлгүй */}
      {hasActual && (
        <span className={`${h.rowDate} ${h.cAs}`} title={aStart != null ? tr('Бодит эхэлсэн огноо') : undefined}>
          {aStart != null ? msToDay(aStart) : '—'}
        </span>
      )}
      {hasActual && (
        <span className={`${h.rowDate} ${h.cAe}`} title={aEnd != null ? tr('Бодит дууссан огноо') : undefined}>
          {aEnd != null ? msToDay(aEnd) : '—'}
        </span>
      )}
      {/* ХҮН ХҮЧ · МАШИН МЕХАНИЗМ (2026-09-23) — бүлэгт нийлбэр; `null` → «—», 0 БИШ */}
      {hasRes && (
        <span className={`${h.rowRes} ${h.cRh}`} title={hun != null ? tr('Хүн хүч') : undefined}>
          {hun != null ? num(hun) : '—'}
        </span>
      )}
      {hasRes && (
        <span className={`${h.rowRes} ${h.cRm}`} title={mashin != null ? tr('Машин механизм') : undefined}>
          {mashin != null ? num(mashin) : '—'}
        </span>
      )}

      {/* УЯЛДАА — MS Project-ийн Predecessors бичиглэлээр («18FS3,22SS»).
          Урт бол таслагдана — бүтнийг нь tooltip ба popup-д харна. */}
      <HamCell r={r} canEdit={canEdit && !added} onText={onHamText} onPick={added ? undefined : onPick} onEditing={onEditing} hamKeep={hamKeep}
        onNext={next?.('ham')} />
      {children}
    </div>
  );
}

/* ══════════════════ «БҮХ БЛОК»-ИЙН ДЭД МӨР (2026-10-04) ══════════════════ */

/**
 * Ажлын/бүлгийн мөрийн доорх НЭГ БЛОКИЙН мөр — зөвхөн харах.
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
          title={`${fixCyr(r.work)}\n${tr('Дарж «{0}» блок руу орж засна', name)}`}>
          <span className={h.rowWork}>{name}</span>
        </button>
      </div>
      {cell(`${h.rowDate} ${h.cGs}`, geree ? msToDay(geree.start) : null, tr('Гэрээний эхлэх огноо'))}
      {cell(`${h.rowDate} ${h.cGe}`, geree ? msToDay(geree.end) : null, tr('Гэрээний дуусах огноо'))}
      {cell(`${h.rowDays} ${h.cGd}`, geree ? spanDays(geree) : null, tr('Гэрээгээр үргэлжлэх хоног'))}
      {cell(`${h.rowDate} ${h.cPs}`, tolov ? msToDay(tolov.start) : null, tr('Төлөвлөгөөт эхлэх огноо'))}
      {cell(`${h.rowDate} ${h.cPe}`, tolov ? msToDay(tolov.end) : null, tr('Төлөвлөгөөт дуусах огноо'))}
      {cell(`${h.rowDays} ${h.cPd}`, tolov ? spanDays(tolov) : null, tr('Төлөвлөгөөгөөр үргэлжлэх хоног'))}
      {hasActual && cell(`${h.rowDate} ${h.cAs}`, aStart != null ? msToDay(aStart) : null, tr('Бодит эхэлсэн огноо'))}
      {hasActual && cell(`${h.rowDate} ${h.cAe}`, aEnd != null ? msToDay(aEnd) : null, tr('Бодит дууссан огноо'))}
      {hasRes && <span className={`${h.rowRes} ${h.cRh}`}>{' '}</span>}
      {hasRes && <span className={`${h.rowRes} ${h.cRm}`}>{' '}</span>}
      <span className={h.rowHam} style={{ cursor: 'default' }}>{' '}</span>
    </div>
  );
}

/* ══════════════════ ШИНЭ АЖЛЫН МАЯГТ (2026-09-24) ══════════════════ */

/**
 * Бүлгийн доор нээгдэх маягт — № · Ажлын нэр · Обьём · Нэгж өртөг (FillNew-ийн
 * 2026-09 маягтын хуулбар). Жин ба Мөнгөн дүн ЭНД БАЙХГҮЙ — Обьём×Нэгж
 * өртгөөс батлагдсаны дараа `computeAll` өөрөө бодно.
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
    <div className={h.addPop} role="dialog" aria-label={edit ? tr('«{0}» мөрийг засах', fixCyr(parent.work)) : tr('«{0}» дотор шинэ ажил', fixCyr(parent.work))}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <span className={h.addTitle}>{edit ? tr('«{0}» мөрийг засах', fixCyr(parent.work)) : tr('«{0}» дотор шинэ ажил', fixCyr(parent.work))}</span>
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
 */
const navDir = (key: string): 1 | -1 | 0 => (key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0);

function DateCell({ c, v, tip, onSet, onEditing, col, onNext, onOther, otherTip }: {
  c: string;
  v: number | null;
  tip: string;
  onSet?: (day: string, via: CellVia) => string | void;
  onEditing?: (on: boolean) => void;
  col: 'start' | 'end';
  onNext?: (dir: 1 | -1) => void;
  onOther?: () => void;
  otherTip?: string;
}) {
  const [edit, setEdit] = useState(false);
  const [txt, setTxt] = useState('');
  const cancelRef = useRef(false);
  const navRef = useRef<1 | -1 | 0>(0);
  const doneRef = useRef(false);
  const [why, setWhy] = useState<string | null>(null);
  const shown = v != null ? msToDay(v) : '—';

  if (!onSet) {
    if (onOther) {
      return (
        <button type="button" className={`${h.rowDate} ${c} ${h.rowDateOther}`} title={`${tip}\n${otherTip ?? ''}`.trim()}
          onClick={onOther}>
          {shown}
        </button>
      );
    }
    return <span className={`${h.rowDate} ${c}`} title={v != null ? tip : undefined}>{shown}</span>;
  }

  if (!edit) {
    return (
      <button type="button" className={`${h.rowDate} ${c} ${h.rowDateEd}`} data-col={col}
        title={`${tip}\n${tr('Дарж огноо бичнэ: 2026-10-04 · 20261004')}`}
        onClick={() => { setTxt(v != null ? msToDay(v) : ''); setEdit(true); onEditing?.(true); }}
        onKeyDown={(e) => { const d = navDir(e.key); if (d && onNext) { e.preventDefault(); onNext(d); } }}>
        {shown}
      </button>
    );
  }

  const bad = parseDayInput(txt) == null;
  const commitKey = (via: CellVia): string | null => {
    if (!txt.trim()) return null;
    const p = parseDayInput(txt);
    if (!p) return tr('Огноо буруу — жишээ: 2026-10-04');
    if (p === (v != null ? msToDay(v) : '')) return null;
    return onSet(p, via) || null;
  };
  return (
    <span className={h.cellWrap}>
      <input
        className={`${h.rowDate} ${c} ${h.rowDateIn}${bad || why ? ` ${h.rowDateBad}` : ''}`}
        data-col={col}
        value={txt}
        autoFocus
        inputMode="text"
        aria-label={tip}
        aria-invalid={bad || !!why}
        title={why ?? (bad ? tr('Огноо буруу — жишээ: 2026-10-04') : tip)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => { setTxt(e.target.value); setWhy(null); }}
        onBlur={() => {
          setEdit(false);
          setWhy(null);
          onEditing?.(false);
          const cancel = cancelRef.current;
          cancelRef.current = false;
          const nav = navRef.current;
          navRef.current = 0;
          const done = doneRef.current;
          doneRef.current = false;
          if (!cancel && !done) {
            const p = parseDayInput(txt);
            if (p && p !== (v != null ? msToDay(v) : '')) onSet(p, nav ? 'nav' : 'blur');
          }
          if (nav && onNext) onNext(nav);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); cancelRef.current = true; e.currentTarget.blur(); return; }
          const d = navDir(e.key);
          const via: CellVia | null = e.key === 'Enter' ? 'enter' : e.key === 'Tab' ? 'blur' : d && onNext ? 'nav' : null;
          if (!via) return;
          const w = commitKey(via);
          if (w) { e.preventDefault(); setWhy(w); return; }
          doneRef.current = true;
          if (e.key === 'Tab') return; // хөтөч фокусыг өөрөө шилжүүлнэ
          e.preventDefault();
          if (via === 'nav') navRef.current = d;
          e.currentTarget.blur();
        }}
      />
      {why && <span className={h.cellErr} role="alert">{why}</span>}
    </span>
  );
}

/**
 * ҮРГЭЛЖЛЭХ ХОНОГИЙН НҮД — ШУУД БИЧНЭ (2026-10-06, хэрэглэгч: «үргэлжлэх хоногийг
 * мөн бичиж хугацаа төлөвлөх боломжтой болго»). `DateCell`-тэй ижил зан төлөв:
 * дарж бичнэ, `Enter`/`blur` хадгална, `Escape` цуцална.
 */
function DaysCell({ c, v, tip, onSet, onEditing, onNext, onOther, otherTip }: {
  c: string;
  v: Span | null;
  tip: string;
  onSet?: (days: number, via: CellVia) => string | void;
  onEditing?: (on: boolean) => void;
  onNext?: (dir: 1 | -1) => void;
  onOther?: () => void;
  otherTip?: string;
}) {
  const [edit, setEdit] = useState(false);
  const [txt, setTxt] = useState('');
  const cancelRef = useRef(false);
  const navRef = useRef<1 | -1 | 0>(0);
  const doneRef = useRef(false);
  const [why, setWhy] = useState<string | null>(null);
  const cur = v ? spanDays(v) : null;
  const shown = cur != null ? String(cur) : '—';

  if (!onSet || !v) {
    if (onOther && v) {
      return (
        <button type="button" className={`${h.rowDays} ${c} ${h.rowDateOther}`} title={`${tip}\n${otherTip ?? ''}`.trim()}
          onClick={onOther}>
          {shown}
        </button>
      );
    }
    return <span className={`${h.rowDays} ${c}`} title={v ? tip : undefined}>{shown}</span>;
  }

  if (!edit) {
    return (
      <button type="button" className={`${h.rowDays} ${c} ${h.rowDateEd}`} data-col="days"
        title={`${tip}\n${tr('Дарж хоногийн тоог бичнэ — дуусах огноо дагаж шилжинэ')}`}
        onClick={() => { setTxt(shown); setEdit(true); onEditing?.(true); }}
        onKeyDown={(e) => { const d = navDir(e.key); if (d && onNext) { e.preventDefault(); onNext(d); } }}>
        {shown}
      </button>
    );
  }

  const n = /^\d{1,4}$/.test(txt.trim()) ? Number(txt.trim()) : NaN;
  const bad = !(n >= 1 && n <= MAX_DAYS);
  const commitKey = (via: CellVia): string | null => {
    if (!txt.trim()) return null;
    if (bad) return tr('Хоног буруу — 1-ээс {0} хүртэлх бүхэл тоо', num(MAX_DAYS));
    if (n === cur) return null;
    return onSet(n, via) || null;
  };
  return (
    <span className={h.cellWrap}>
      <input
        className={`${h.rowDays} ${c} ${h.rowDateIn}${bad || why ? ` ${h.rowDateBad}` : ''}`}
        data-col="days"
        value={txt}
        autoFocus
        inputMode="numeric"
        aria-label={tip}
        aria-invalid={bad || !!why}
        title={why ?? (bad ? tr('Хоног буруу — 1-ээс {0} хүртэлх бүхэл тоо', num(MAX_DAYS)) : tip)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => { setTxt(e.target.value); setWhy(null); }}
        onBlur={() => {
          setEdit(false);
          setWhy(null);
          onEditing?.(false);
          const cancel = cancelRef.current;
          cancelRef.current = false;
          const nav = navRef.current;
          navRef.current = 0;
          const done = doneRef.current;
          doneRef.current = false;
          if (!cancel && !done && !bad && n !== cur) onSet(n, nav ? 'nav' : 'blur');
          if (nav && onNext) onNext(nav);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); cancelRef.current = true; e.currentTarget.blur(); return; }
          const d = navDir(e.key);
          const via: CellVia | null = e.key === 'Enter' ? 'enter' : e.key === 'Tab' ? 'blur' : d && onNext ? 'nav' : null;
          if (!via) return;
          const w = commitKey(via);
          if (w) { e.preventDefault(); setWhy(w); return; }
          doneRef.current = true;
          if (e.key === 'Tab') return;
          e.preventDefault();
          if (via === 'nav') navRef.current = d;
          e.currentTarget.blur();
        }}
      />
      {why && <span className={h.cellErr} role="alert">{why}</span>}
    </span>
  );
}

/* ══════════════════ УЯЛДААНЫ НҮД ══════════════════ */

/**
 * ХАМААРЛЫН НҮД — MS Project-ийн Predecessors шиг ШУУД БИЧНЭ.
 */
function HamCell({
  r, canEdit, onText, onPick, onEditing, hamKeep, onNext,
}: {
  r: PlanRow;
  canEdit: boolean;
  onText: (oid: number, text: string) => string | void;
  /** `undefined` = popup нээгдэхгүй (батлагдаагүй нэмэлт мөр) */
  onPick?: () => void;
  onEditing?: (on: boolean) => void;
  hamKeep?: readonly string[];
  onNext?: (dir: 1 | -1) => void;
}) {
  const saved = r.deps.length ? formatDeps(r.deps) : '';
  const keepTip = hamKeep?.length ? `\n${tr('Танигдаагүй бичиглэл (хэвээр хадгалагдана): {0}', hamKeep.join(', '))}` : '';
  const [txt, setTxt] = useState(saved);
  /* Escape-ээр цуцалсан бол `onBlur`-ийн хадгалалтыг алгасах туг (2026-09-17) */
  const cancelRef = useRef(false);
  const navRef = useRef<1 | -1 | 0>(0);
  const [edit, setEdit] = useState(false);
  const [hamWhy, setHamWhy] = useState<string | null>(null);
  /** Enter-ээр аль хэдийн хадгалсан — `blur` дахин хадгалахгүй (2026-10-09) */
  const doneRef = useRef(false);

  const shown = edit ? txt : saved;

  if (!canEdit) {
    if (!onPick) {
      return <span className={h.rowHam} style={{ cursor: 'default' }} title={keepTip.trim() || undefined}>{saved || '\u00a0'}</span>;
    }
    return (
      <button type="button" className={h.rowHam} onClick={onPick}
        title={(saved ? `${saved}\n${tr('Уялдаа харах')}` : tr('Уялдаа харах')) + keepTip}>
        {saved}
      </button>
    );
  }

  return (
    <span className={h.hamWrap}>
      <input
        className={h.hamIn}
        data-col="ham"
        value={shown}
        aria-label={tr('Хамаарал')}
        title={tr('Жишээ: 11FS14 — 11-р ажил дууссанаас 14 хоногийн дараа. Олныг таслалаар: 11FS,22SS-5. @2 = зөвхөн 2-р блок (@-гүй = бүх блок)')
          + ` · ${tr('@1>2 = 2-р блокт 1-р блокийн урд ажлаас')}` + keepTip + (hamWhy ? `\n${hamWhy}` : '')}
        aria-invalid={!!hamWhy}
        onChange={(e) => { setEdit(true); setTxt(e.target.value); setHamWhy(null); }}
        onFocus={() => { setEdit(true); if (!hamWhy) setTxt(saved); onEditing?.(true); }}
        onBlur={() => {
          onEditing?.(false);
          const cancel = cancelRef.current;
          cancelRef.current = false;
          const done = doneRef.current;
          doneRef.current = false;
          const w = cancel || done ? null : onText(r.oid, txt) || null;
          if (w) setHamWhy(w);
          else { setEdit(false); setHamWhy(null); }
          const nav = navRef.current;
          navRef.current = 0;
          if (nav && onNext) onNext(nav);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const w = onText(r.oid, txt) || null;
            if (w) { e.preventDefault(); setHamWhy(w); return; }
            doneRef.current = true;
            setHamWhy(null);
            e.currentTarget.blur();
            return;
          }
          if (e.key === 'Escape') { e.stopPropagation(); cancelRef.current = true; setTxt(saved); setEdit(false); setHamWhy(null); e.currentTarget.blur(); return; }
          const d = navDir(e.key);
          if (d && onNext) { e.preventDefault(); navRef.current = d; e.currentTarget.blur(); }
        }}
      />
      {hamWhy ? <span className={h.cellErr} role="alert">{hamWhy}</span>
        : edit && <span className={h.cellHelp} aria-hidden>11FS14 · 22SS-5 · @2 · @1&gt;2</span>}
      {onPick && (
        <button type="button" className={h.hamMore} onClick={onPick}
          title={tr('Жагсаалтаас сонгох')} aria-label={tr('Жагсаалтаас сонгох')}>…</button>
      )}
    </span>
  );
}

/* ══════════════════ «ХЭРХЭН» ЗААВАР (2026-10-08) ══════════════════ */

const HOWTO_LS = 'selbe-huvaari-howto';

/**
 * Хүснэгтийн НЭГ УДААГИЙН «Хэрхэн» заавар — жижиг «?» товч + popover. 2026-10-23 (UX аудит P5): өөрөө НЭЭГДЭХГҮЙ (урьд нь анх удаа нээгдэж хуваарийг таглаж байв),
 * «Ойлголоо» дарахад `localStorage`-д тэмдэглэгдэж дахин өөрөө гарахгүй; «?»-ээр хүссэн үедээ.
 */
export function HowtoHint() {
  const [open, setOpen] = useState(false);
  const [right, setRight] = useState(false);
  const dismiss = () => {
    setOpen(false);
    try { localStorage.setItem(HOWTO_LS, '1'); } catch { /* хаалттай орчин */ }
  };
  return (
    <span className={h.howto}>
      <button type="button" className={`${h.howtoBtn}${open ? ` ${h.howtoBtnOn}` : ''}`}
        aria-expanded={open} aria-label={tr('Хэрхэн ашиглах')} title={tr('Хэрхэн ашиглах')}
        onClick={(e) => {
          if (open) { dismiss(); return; }
          const rc = e.currentTarget.getBoundingClientRect();
          setRight(rc.left + Math.min(360, window.innerWidth - 32) > window.innerWidth - 16);
          setOpen(true);
        }}>?</button>
      {open && (
        <div className={`${h.howtoPop}${right ? ` ${h.howtoPopR}` : ''}`} role="note" aria-label={tr('Хэрхэн')}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dismiss(); } }}>
          <b>{tr('Хэрхэн')}</b>
          <ul className={h.howtoList}>
            <li>{tr('Огноо · хоног · уялдааны нүдэнд дарж бичнэ; Enter хадгалаад цонх нээнэ, Esc цуцална.')}</li>
            <li>{tr('↓ / ↑ — дараагийн/өмнөх мөрийн ижил нүд рүү.')}</li>
            <li>{tr('Уялдаа: 11FS14 (11-р ажил дууссанаас 14 хоногийн дараа) · 22SS-5 · @2 (зөвхөн 2-р блок).')}</li>
            <li>{tr('Хуанли дээр чирж зөөнө, ирмэгээс уртасгана; нэр дээр дарж цонхоор нарийн тавина.')}</li>
            <li>{tr('Толгойн баганын ирмэгийг чирж өргөнийг өөрчилнө, давхар дарвал анхны өргөн.')}</li>
          </ul>
          <button type="button" className={h.tlZoomB} onClick={dismiss}>{tr('Ойлголоо')}</button>
        </div>
      )}
    </span>
  );
}
