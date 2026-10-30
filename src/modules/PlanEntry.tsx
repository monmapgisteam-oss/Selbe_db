'use client';

/**
 * «ТӨСӨЛ ТӨЛӨВЛӨГӨӨ БИЕЛЭЛТ» — МЭДЭЭЛЭЛ ОРУУЛАХ хэсгийн бүрэлдэхүүнүүд (2026-10-30): засах нүд, дэд мөр нэмэх самбар.
 * Дүрэм нь `lib/planEdit.ts`-д (цэвэр, тестлэгдэнэ) — энд зөвхөн оролт ба харагдац.
 */

import { useRef, useState, type KeyboardEvent } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { userError } from '@/components/ui';
import { editText, parseCell, type ParseMsg } from '@/lib/finEdit';
import { date, pct } from '@/lib/format';
import {
  PLAN_EDIT, addPlanRows, editWhy, isNewGroup, newRowsWhy,
  type NewPlanRow, type PlanEditKey,
} from '@/lib/planEdit';
import type { PlanNode, PlanTree } from '@/lib/projectPlan';
import f from './finance.module.css';

export const PARSE_MSG: ParseMsg = {
  dateFmt: (l, v) => tr('«{0}» — огноо ЖЖЖЖ-СС-ӨӨ хэлбэрээр байх ёстой: {1}', l, v),
  dateBad: (l, v) => tr('«{0}» — огноо буруу: {1}', l, v),
  numBad: (l, v) => tr('«{0}» — тоо буруу: {1}', l, v),
  numAmbig: (l, v) => tr('«{0}» — «{1}»: таслал мянгатын уу, аравтын уу тодорхойгүй. Таслалгүй (1250) эсвэл цэгтэй (1.25) бичнэ үү.', l, v),
  pctRange: (l, v) => tr('«{0}» — хувь 0–100 хооронд байх ёстой: {1}', l, v),
};

/** Баганын нэр — i18n-extract статик `tr()`-ийг л олдог тул нэг бүрчлэн */
export const EDIT_LABEL: Record<PlanEditKey, () => string> = {
  pct: () => tr('Гүйцэтгэлийн хувь'),
  contractDate: () => tr('Гэрээ байгуулсан огноо'),
  orderDate: () => tr('Захирамжийн огноо'),
  orderNo: () => tr('Захирамжийн дугаар'),
  handoverDate: () => tr('Ашиглалтад оруулах огноо'),
};

const ESRI_TYPE = { pct: 'esriFieldTypeDouble', date: 'esriFieldTypeDate', text: 'esriFieldTypeString' } as const;

/** Нүдэнд харагдах текст */
export function showVal(k: PlanEditKey, v: unknown): string {
  const kind = PLAN_EDIT[k].kind;
  if (v == null || String(v).trim() === '') return '—';
  if (kind === 'pct') return pct(Number(v), 1);
  if (kind === 'date') return date(Number(v));
  return String(v);
}

/**
 * ЗАСАХ НҮД — дарахад талбар; Enter/гарахад хадгална, Esc цуцална. Засах эрхгүй/боломжгүй бол энгийн утга
 * (шалтгаан нь `title`-д).
 */
export function PlanEditCell({
  n, k, value, canEdit, onSave, onError,
}: {
  n: PlanNode;
  k: PlanEditKey;
  /** Харагдах утга (гүйцэтгэлд — бодогдсон S) */
  value: unknown;
  canEdit: boolean;
  onSave: (n: PlanNode, k: PlanEditKey, v: unknown) => Promise<boolean>;
  onError: (msg: string) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const busy = useRef(false);
  const why = editWhy(n, k);
  const kind = PLAN_EDIT[k].kind;
  const cls = `${kind === 'text' ? '' : f.cellNum} ${kind === 'date' ? f.ppDate : ''}`;
  if (!canEdit || why) {
    return <td className={`${cls} ${why ? f.ppRo : ''}`} title={why ?? undefined}>{showVal(k, value)}</td>;
  }
  const stored = n.row?.[PLAN_EDIT[k].key] ?? null;
  const commit = async () => {
    if (busy.current || text == null) return;
    let v: unknown;
    try {
      v = parseCell(text, ESRI_TYPE[kind], EDIT_LABEL[k](), PARSE_MSG, kind === 'pct');
    } catch (e) {
      onError(userError(e));
      return;
    }
    if (v === stored || (v == null && stored == null)) { setText(null); return; }
    busy.current = true;
    const ok = await onSave(n, k, v);
    busy.current = false;
    if (ok) setText(null);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); setText(null); }
  };
  if (text == null) {
    return (
      <td className={cls}>
        <button
          type="button"
          className={f.ppCellBtn}
          aria-label={tr('{0} — засах', EDIT_LABEL[k]())}
          onClick={() => setText(editText(stored, ESRI_TYPE[kind]))}
        >
          {showVal(k, value)}
        </button>
      </td>
    );
  }
  return (
    <td className={cls}>
      <input
        className={f.ppCellIn}
        type={kind === 'date' ? 'date' : 'text'}
        inputMode={kind === 'pct' ? 'decimal' : undefined}
        aria-label={EDIT_LABEL[k]()}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => void commit()}
      />
    </td>
  );
}

type Draft = { name: string; weight: string; pct: string };
const EMPTY: Draft = { name: '', weight: '', pct: '' };

/**
 * ДЭД МӨР НЭМЭХ самбар. Дэд мөргүй мөрийн доор — ШИНЭ БҮЛЭГ (жин оруулна, нийлбэр 100%); байгаа мөрүүдийн дунд —
 * жин 0% (нийт хувьд нөлөөлөхгүй).
 */
export function AddRowsPanel({
  tree, parent, onClose, onDone,
}: {
  tree: PlanTree;
  parent: PlanNode;
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const group = isNewGroup(parent);
  const [items, setItems] = useState<Draft[]>([{ ...EMPTY }]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = String(parent.row?.ajil_uilchilgee ?? '').trim() || parent.code;
  const ownPct = parent.row?.guitsetgel_huvi;
  const set = (i: number, k: keyof Draft, v: string) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const num = (s: string, label: string, isPct: boolean) =>
    parseCell(s, 'esriFieldTypeDouble', label, PARSE_MSG, isPct) as number | null;
  const sum = group
    ? items.reduce((s, x) => { const v = Number(x.weight.replace(',', '.')); return s + (Number.isFinite(v) ? v : 0); }, 0)
    : null;

  const save = async () => {
    setErr(null);
    let rows: NewPlanRow[];
    try {
      rows = items.map((x) => ({
        name: x.name,
        weight: group ? num(x.weight, tr('Жин'), true) : 0,
        pct: num(x.pct, tr('Гүйцэтгэлийн хувь'), true),
      }));
    } catch (e) {
      setErr(userError(e));
      return;
    }
    const why = newRowsWhy(parent, rows);
    if (why) { setErr(why); return; }
    setBusy(true);
    try {
      const r = await addPlanRows(tree, parent, rows);
      onDone(r.oids.length);
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={f.ppAdd} role="group" aria-label={tr('Дэд мөр нэмэх')}>
      <div className={f.ppAddHd}>
        <strong>{tr('Дэд мөр нэмэх: {0} {1}', parent.code, name)}</strong>
        <span>
          {group
            ? tr('Шинэ бүлэг — мөр бүрийн жинг оруулна, нийлбэр нь 100% байх ёстой.')
            : tr('Байгаа мөрүүдийн дунд нэмэгдэх тул жин 0% — нийт хувьд нөлөөлөхгүй.')}
        </span>
        {group && ownPct != null && ownPct !== 0 && (
          <span className={f.ppAddWarn}>
            {tr('Анхааруулга: «{0}»-ийн гүйцэтгэлийн хувь ({1}) цаашид дэд мөрүүдээс бодогдоно.', name, pct(ownPct, 1))}
          </span>
        )}
      </div>
      <table className={f.ppAddTbl}>
        <thead>
          <tr>
            <th>{tr('Ажлын нэр')}</th>
            {group && <th>{tr('Жин %')}</th>}
            <th>{tr('Гүйцэтгэлийн хувь')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((x, i) => (
            <tr key={i}>
              <td><input className={f.ppCellIn} value={x.name} aria-label={tr('Ажлын нэр')} onChange={(e) => set(i, 'name', e.target.value)} /></td>
              {group && (
                <td><input className={f.ppCellIn} inputMode="decimal" value={x.weight} aria-label={tr('Жин %')} onChange={(e) => set(i, 'weight', e.target.value)} /></td>
              )}
              <td><input className={f.ppCellIn} inputMode="decimal" value={x.pct} aria-label={tr('Гүйцэтгэлийн хувь')} onChange={(e) => set(i, 'pct', e.target.value)} /></td>
              <td>
                {items.length > 1 && (
                  <button type="button" className={f.ppMini} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                    {tr('Хасах')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={f.ppAddFt}>
        <button type="button" className={f.ppMini} onClick={() => setItems((xs) => [...xs, { ...EMPTY }])}>{tr('Мөр нэмэх')}</button>
        {sum != null && (
          <span className={Math.abs(sum - 100) > 0.01 ? f.ppAddWarn : undefined}>
            {tr('Жингийн нийлбэр: {0}%', Math.round(sum * 100) / 100)}
          </span>
        )}
        {err && <span role="alert" className={f.editErr}>{err}</span>}
        <span style={{ marginLeft: 'auto' }} />
        <button type="button" className={f.ppMini} onClick={onClose} disabled={busy}>{tr('Болих')}</button>
        <button type="button" className={`${f.ppMini} ${f.ppMiniOn}`} onClick={() => void save()} disabled={busy}>
          {busy ? tr('Хадгалж байна…') : tr('Хадгалах')}
        </button>
      </div>
    </div>
  );
}
