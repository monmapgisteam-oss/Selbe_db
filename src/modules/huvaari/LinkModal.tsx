'use client';

import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { sameDep, type Dep, type DepType } from '@/lib/deps';
import type { PlanRow } from '@/lib/plan';
import { LagInput } from './PlanModal';
import h from '../huvaari.module.css';

/**
 * «Тавих» / «Уялдаа устгах» дарахад солигдох ОДООГИЙН уялдаанууд. `collapse` (бүх блок сонгосон) — энэ урд ажлын блок тус бүрийн
 * уялдаа ч нэг болж нийлнэ; бусад үед сонгосон блокуудын уялдаа. Цонх ба `Huvaari` нэг дүрмээр.
 */
export function linksReplaced(deps: readonly Dep[], code: number, blks: number[] | null, collapse?: boolean): Dep[] {
  const ids = blks ?? [undefined];
  return deps.filter((d) => (collapse ? d.code === code : ids.some((b) => sameDep(d, { code, blk: b }))));
}

/**
 * ХОЛБОХ ЦОНХ — шугамаар чирж холбосны дараа гарна (2026-09-22, хэрэглэгч:
 * «чирээд холбосны дараа эхлээд дуусах / зэрэг эхлэх болон хоног заах цонх
 * гарах ёстой»). Зөвхөн ХОЁР сонголт: төрөл (FS — урд ажил дуусаад · SS —
 * урд ажилтай зэрэг эхэлнэ) ба хоцролтын хоног (±365). «Тавих» → `applyModal`
 * (дугуй/шатлалын шалгуур тэнд). Урд ажил аль хэдийн уялдаанд байвал утгыг
 * нь урьдчилан дүүргэж ЗАСНА.
 */
export function LinkModal({ src, dst, blks, collapse, blocks, onClose, onApply, onRemove }: {
  src: PlanRow;
  dst: PlanRow;
  /**
   * Уялдааны блокууд — `null` = бүх блок (2026-09-24).
   */
  blks: number[] | null;
  /** Бүх блок сонгосон — блок тус бүрийн уялдаа нэг болж нийлнэ (`linksReplaced`) */
  collapse?: boolean;
  blocks: string[];
  onClose: () => void;
  onApply: (type: DepType, lag: number) => void;
  /** Байгаа уялдааг устгах — зөвхөн `cur` байвал товч гарна */
  onRemove?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  const selRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { selRef.current?.focus(); }, []);
  const ids = blks ?? [undefined];
  const cur = src.des != null
    ? ids.map((b) => dst.deps.find((d) => sameDep(d, { code: src.des as number, blk: b }))).find((d) => d != null)
    : undefined;
  const blkName = (b: number) => blocks[b] ?? String(b + 1);
  const replaced = src.des != null ? linksReplaced(dst.deps, src.des, blks, collapse) : [];
  /* Цонхонд урьдчилан дүүргэсэн утгаас өөр уялдаа дарагдах гэж байвал — хэрэглэгчид ил хэлнэ */
  const hidden = replaced.some((d) => d.type !== cur?.type || d.lag !== cur?.lag);
  const [type, setType] = useState<DepType>(cur?.type ?? 'FS');
  const [lag, setLag] = useState<number>(cur?.lag ?? 0);
  const name = (r: PlanRow) => `${r.des ?? '—'} · ${r.work || r.no}`;
  const downOnBack = useRef(false);
  return (
    <div className={h.mdBack} role="presentation"
      onPointerDown={(e) => { downOnBack.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        const ok = downOnBack.current && e.target === e.currentTarget;
        downOnBack.current = false;
        if (ok) onClose();
      }}>
      <div ref={ref} className={h.md} role="dialog" aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
          if (e.key !== 'Enter') return;
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
          {blocks.length > 1 && (
            <>
              <br />
              <span>
                {blks != null && blks.length > 1 ? tr('Блок ({0}):', String(blks.length)) : tr('Блок:')}{' '}
                <b>{blks != null ? blks.map(blkName).join(', ') : tr('бүх блок')}</b>
              </span>
            </>
          )}
        </div>
        <div className={h.mdDepRow}>
          <select className={h.select} value={type} ref={selRef}
            title={tr('FS — урд ажил дуусмагц · SS — урд ажилтай зэрэг эхэлнэ')}
            onChange={(e) => setType(e.target.value as DepType)}>
            <option value="FS">{tr('дуусаад эхэлнэ (FS)')}</option>
            <option value="SS">{tr('зэрэг эхэлнэ (SS)')}</option>
          </select>
          <LagInput value={lag} onCommit={setLag} />
          <span className={h.mdDepD}>{tr('хоног')}</span>
        </div>
        {hidden && (
          <p className={h.muted} role="note">
            {tr('Одоогийн уялдаа «Тавих» дарахад солигдоно: {0}', replaced.map((d) => `${d.blk != null ? blkName(d.blk) : tr('бүх блок')} — ${d.type} ${d.lag}`).join('; '))}
          </p>
        )}
        <footer className={h.mdFoot}>
          {replaced.length > 0 && onRemove && (
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
