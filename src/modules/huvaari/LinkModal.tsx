'use client';

import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { sameDep, type DepType } from '@/lib/deps';
import type { PlanRow } from '@/lib/plan';
import { LagInput } from './PlanModal';
import h from '../huvaari.module.css';

/**
 * ХОЛБОХ ЦОНХ — шугамаар чирж холбосны дараа гарна (2026-09-22, хэрэглэгч:
 * «чирээд холбосны дараа эхлээд дуусах / зэрэг эхлэх болон хоног заах цонх
 * гарах ёстой»). Зөвхөн ХОЁР сонголт: төрөл (FS — урд ажил дуусаад · SS —
 * урд ажилтай зэрэг эхэлнэ) ба хоцролтын хоног (±365). «Тавих» → `applyModal`
 * (дугуй/шатлалын шалгуур тэнд). Урд ажил аль хэдийн уялдаанд байвал утгыг
 * нь урьдчилан дүүргэж ЗАСНА.
 */
export function LinkModal({ src, dst, blks, blocks, onClose, onApply, onRemove }: {
  src: PlanRow;
  dst: PlanRow;
  /**
   * Уялдааны блокууд — `null` = бүх блок (2026-09-24).
   * ⚠️ 2026-10-01: ОЛОН блок — «олон блокт зэрэг төлөвлөх» сонголттой чирэхэд
   *    сонгосон блок бүрд ижил уялдаа тавигдана (`Huvaari.tsx` `linkAsk.dblks`).
   */
  blks: number[] | null;
  blocks: string[];
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
  /* ⚠️ (код, блок)-оор олно — ижил кодын СОНГООГҮЙ блокийн уялдаа энэ цонхных биш (2026-09-24).
     Олон блок (2026-10-01): сонгосон блокуудаас ЭХНИЙ олдсоныхоор урьдчилан дүүргэнэ. */
  const ids = blks ?? [undefined];
  const cur = src.des != null
    ? ids.map((b) => dst.deps.find((d) => sameDep(d, { code: src.des as number, blk: b }))).find((d) => d != null)
    : undefined;
  const blkName = (b: number) => blocks[b] ?? String(b + 1);
  const [type, setType] = useState<DepType>(cur?.type ?? 'FS');
  const [lag, setLag] = useState<number>(cur?.lag ?? 0);
  const name = (r: PlanRow) => `${r.des ?? '—'} · ${r.work || r.no}`;
  /* ⚠️ 2026-10-07: Дотор дараад (сонголт/чирэлт) АРД суллахад `click` нь дэвсгэр дээр
     буудаг тул цонх санамсаргүй хаагддаг байв — `PlanModal`-ийн адил дарах нь ч ард
     эхэлсэн үед л хаана. */
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
          /* ⚠️ 2026-10-07: `preventDefault`+`stopPropagation` — React цонхыг `window`-д
             хүрэхээс өмнө салгадаг тул хуудасны нийтлэг Esc (`Huvaari` — бүтэн дэлгэц/
             хяналт хаах) `[role=dialog]`-ийг олохгүй, нэг Esc хоёуланг хаадаг байв. */
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
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
