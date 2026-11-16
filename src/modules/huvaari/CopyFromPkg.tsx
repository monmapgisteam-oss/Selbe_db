'use client';

/**
 * БАГЦ ХООРОНД ХУУЛАХ ЦОНХ (2026-11-16) — өөр хуудасны 3-р давхрын бүлгүүдийн төлөвлөлтийг энэ хуудасны ижил нэртэй
 * бүлгүүдэд хоногийн шилжилттэйгээр тавина (`copyPkg.sourceUnitPlans` → `useGroupPlan.planGroups`).
 */
import { useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useFocusTrap } from '@/lib/useFocusTrap';
import type { Pkg } from '@/modules/sheet/bagts.pkg';
import h from '../huvaari.module.css';

export function CopyFromPkg({ pkgs, blocks, blk, onClose, onCopy }: {
  /** Эх болох хуудсууд (энэ хуудаснаас бусад) */
  pkgs: readonly Pkg[];
  blocks: readonly string[];
  /** Идэвхтэй блок */
  blk: number;
  onClose: () => void;
  /** Хуулна — алдаа бол мессеж, амжилттай бол `null` */
  onCopy: (srcKey: string, shiftDays: number, allBlocks: boolean) => Promise<string | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  const [src, setSrc] = useState(pkgs[0]?.key ?? '');
  const [shift, setShift] = useState('0');
  const [all, setAll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const shiftN = Number(shift);
  const ok = !!src && /^-?\d{1,4}$/.test(shift.trim()) && !busy;
  const run = async () => {
    if (!ok) return;
    setBusy(true);
    setErr('');
    try {
      const e = await onCopy(src, Math.trunc(shiftN), all || blocks.length <= 1);
      if (e) setErr(e); else onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={h.mdBack} role="presentation" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={ref} className={h.md} role="dialog" aria-modal="true" aria-label={tr('Өөр багцаас хуулах')}
        onKeyDown={(e) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
        <header className={h.mdHead}>
          <b className={h.mdWork}>{tr('Өөр багцаас хуулах')}</b>
          <button type="button" className={h.mdX} onClick={onClose} disabled={busy} aria-label={tr('Хаах')}>×</button>
        </header>
        <p className={h.mdPar}>
          {tr('Сонгосон багцын 3-р давхрын бүлгүүдийн огноо ба сарын хувийг энэ хуудасны ижил нэртэй бүлгүүдэд тавина. Тэдгээр бүлгийн одоогийн төлөвлөлт дарагдана.')}
        </p>
        <div className={h.mdDepRow}>
          <label className={h.mdField}>
            {tr('Эх багц')}{' '}
            <select id="cp-src" className={h.select} value={src} disabled={busy} onChange={(e) => setSrc(e.target.value)}>
              {pkgs.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
        </div>
        <div className={h.mdDepRow}>
          <label className={h.mdField}>
            {tr('Шилжүүлэх')}{' '}
            <input id="cp-shift" type="number" step={1} className={h.numIn} value={shift} disabled={busy}
              onChange={(e) => setShift(e.target.value)} />{' '}
            {tr('хоног')}
          </label>
        </div>
        {blocks.length > 1 && (
          <div className={h.mdDepRow}>
            <label className={h.mdField}>
              <input type="radio" name="cp-blk" checked={all} disabled={busy} onChange={() => setAll(true)} /> {tr('бүх блок')}
            </label>
            <label className={h.mdField}>
              <input type="radio" name="cp-blk" checked={!all} disabled={busy} onChange={() => setAll(false)} /> {tr('зөвхөн {0}', blocks[blk] ?? '')}
            </label>
          </div>
        )}
        {err && <p className={h.mdWarn} role="alert">{err}</p>}
        <footer className={h.mdFoot}>
          <button type="button" className={h.save} disabled={!ok} onClick={() => void run()}>
            {busy ? tr('Хуулж байна…') : tr('Хуулах')}
          </button>
        </footer>
      </div>
    </div>
  );
}
