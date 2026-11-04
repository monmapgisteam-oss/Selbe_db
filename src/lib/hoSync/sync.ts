/**
 * HO ← CASHFLOW — АВТОМАТ ХОЛБОЛТ (2026-11-03): Cashflow-д бичилт хийгдэх бүрт (dataBus `CASHFLOW_NEW`) ба портал
 * нээгдэхэд HO-ийн гэрээний түвшний талбарыг Cashflow-ийн утгаар дарж бичнэ (`planHoSync`). Бичилт — нэвтэрсэн
 * хэрэглэгчийн токеноор; амжилттай бол `invalidate('HO_IPC')` (HO-г уншдаг кэшүүд шинэчлэгдэнэ; дараагийн давталт
 * зөрүүгүй тул дахин бичихгүй — гогцоогүй). 403 бол энэ сешнд дахин оролдохгүй.
 */
import { useEffect } from 'react';
import { subscribeData, invalidate } from '@/lib/dataBus';
import { queryFeatures } from '@/lib/query';
import { applyAll } from '@/lib/tableWrite';
import { HO_IPC, CASHFLOW_NEW, CF_MONTH } from '@/lib/services';
import { buildTree } from '@/lib/projectPlan';
import { sortPlanRows, toStoredRow } from '@/lib/projectPlanInputs';
import { planBlockBudgets, planHoSync, planPaidSync, type HoSyncPlan, type Row } from './compute';

export type HoSyncResult = { at: number; blocks: number; paid: number; unassigned: string[]; updated: number; added: number; unmatched: string[]; error: string | null };

const CF = CASHFLOW_NEW.fields;

/** Cashflow-ийн гэрээлсэн ажлын мөрүүд (сарын мөргүй) */
async function loadCfContractRows(): Promise<Row[]> {
  return queryFeatures(CASHFLOW_NEW.url, {
    where: `${CF_MONTH.start} IS NULL AND (${CF.amountNote} IS NOT NULL OR ${CF.paid} IS NOT NULL OR ${CF.advance} IS NOT NULL)`,
    outFields: [CASHFLOW_NEW.oid, CF.pkg, CF.phase, CF.detail, CF.amountNote, CF.budgetOrder, CF.contractAmount, CF.paid, CF.advance, CF.contractor, CF.contractNo,
      CF.orderDate, CF.orderNo, ...CASHFLOW_NEW.sources.map((s) => s.field)],
  });
}

/** Багцын дүнг дагах дэд мөрийн засвар — «Төсөл төлөвлөгөө биелэлт»-ийн мөрүүдээс (бичилтгүй) */
export async function computeBlockBudgets(): Promise<Row[]> {
  const rows = await queryFeatures(CASHFLOW_NEW.url, {
    where: `${CF.ddKod} IS NOT NULL AND ${CF_MONTH.start} IS NULL`,
    outFields: [CASHFLOW_NEW.oid, CF.ddKod, CF.parentKod, CF.level, CF.phase, CF.pkg, CF.block, CF.detail, CF.budget, CF_MONTH.id],
    orderBy: `${CF.ddKod} ASC, ${CASHFLOW_NEW.oid} ASC`,
  });
  return planBlockBudgets(buildTree(sortPlanRows(rows.map((r) => toStoredRow(r as Record<string, unknown>)).filter((r) => r.dd_kod))));
}

/** Тооцоолол л (бичилтгүй) — шалгалт/туршилтад */
export async function computeHoSync(): Promise<HoSyncPlan> {
  const [ho, cf] = await Promise.all([
    queryFeatures(HO_IPC.url, { outFields: ['*'], orderBy: `${HO_IPC.oid} ASC` }),
    loadCfContractRows(),
  ]);
  return planHoSync(ho, cf);
}

let inflight: Promise<HoSyncResult> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let disabled: string | null = null;
let last: HoSyncResult | null = null;
export const hoSyncLast = (): HoSyncResult | null => last;

const isForbidden = (e: unknown): boolean => /\b(403|499|498)\b|эрхгүй|permission|not authorized|token/i.test(e instanceof Error ? e.message : String(e));

export function runHoSync(): Promise<HoSyncResult> {
  if (inflight) { again = true; return inflight; }
  inflight = (async (): Promise<HoSyncResult> => {
    const res: HoSyncResult = { at: Date.now(), blocks: 0, paid: 0, unassigned: [], updated: 0, added: 0, unmatched: [], error: null };
    if (disabled) { res.error = `disabled: ${disabled}`; return res; }
    try {
      /* Багцын дүн → блокууд. Дараагийн тооцоонд зөрүүгүй тул дахин бичихгүй (гогцоогүй) */
      const blocks = await computeBlockBudgets();
      if (blocks.length) {
        await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: blocks });
        res.blocks = blocks.length;
        invalidate('CASHFLOW_NEW');
      }
      const p = await computeHoSync();
      res.unmatched = p.unmatched;
      if (p.updates.length || p.adds.length) {
        await applyAll(HO_IPC.url, HO_IPC.oid, { updates: p.updates, adds: p.adds });
        res.updated = p.updates.length;
        res.added = p.adds.length;
        invalidate('HO_IPC');
      }
      /* IPC → ТТБ: олгосон дүн, урьдчилгаа. Зөрүүгүй бол бичихгүй (гогцоогүй) */
      const [hoNow, cfNow] = await Promise.all([
        queryFeatures(HO_IPC.url, { outFields: ['*'], orderBy: `${HO_IPC.oid} ASC` }),
        loadCfContractRows(),
      ]);
      const ps = planPaidSync(hoNow, cfNow);
      res.unassigned = ps.unassigned;
      if (ps.updates.length) {
        await applyAll(CASHFLOW_NEW.url, CASHFLOW_NEW.oid, { updates: ps.updates });
        res.paid = ps.updates.length;
        invalidate('CASHFLOW_NEW');
      }
    } catch (e) {
      res.error = e instanceof Error ? e.message : String(e);
      if (isForbidden(e)) disabled = res.error;
      console.warn('[hoSync] HO ← Cashflow:', res.error);
    }
    last = res;
    return res;
  })().finally(() => {
    inflight = null;
    if (again) { again = false; scheduleHoSync(); }
  });
  return inflight;
}

const DEBOUNCE_MS = 15_000;
const BOOT_DELAY_MS = 6_000;
export function scheduleHoSync(delay = DEBOUNCE_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void runHoSync(); }, delay);
}

/** Портал нээгдэхэд нэг удаа + бичилт бүрийн дараа (dataBus) */
export function startHoSync(): () => void {
  if (typeof window === 'undefined') return () => {};
  const unsub = subscribeData(() => scheduleHoSync());
  scheduleHoSync(BOOT_DELAY_MS);
  return () => { unsub(); if (timer) { clearTimeout(timer); timer = null; } };
}

export function useHoSync(on: boolean): void {
  useEffect(() => (on ? startHoSync() : undefined), [on]);
}
