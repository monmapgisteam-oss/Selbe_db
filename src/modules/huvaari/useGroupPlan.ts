'use client';

/**
 * БҮЛГЭЭР ТӨЛӨВЛӨХ · ЗАГВАР ХУУЛАХ (2026-10-29) — `Huvaari.tsx`-ээс механикаар салгав (логик ХЭВЭЭР). Мөрийн мөнгө
 * (`moneyOf`), бүлгийн тооцоо (`groupSchedule` — тараалт ба урьдчилан харалтын нэг эх), тараалт (`planGroup`), ижил
 * бүтэцтэй бүлгүүдэд хуулах (`copyGroup`). Ноорогт `applyChanges` ба `setObDraft`-аар л бичнэ.
 */
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { DAY, type PlanRow, type Span } from '@/lib/plan';
import { propagate } from '@/lib/deps';
import { orderByDeps, remapMonths, scheduleByMoney, splitByPct, type PkgPlan } from '@/lib/huvaariObyem';
import type { Schema } from '@/modules/sheet/bagts.pkg';
import type { SheetRow } from '@/modules/sheet/bagtsSheet';
import type { PlanKind } from './types';
import { directWorks, obKey, sameMonths } from './util';

export function useGroupPlan({
  plan, rowsAll, n, sc, kind, busy, locked, canEdit, obState, obPlan, obOf, obFullRef, applyChanges, setErr, setNote, setObDraft,
}: {
  plan: PlanRow[];
  rowsAll: SheetRow[];
  n: number;
  sc: Schema | null;
  kind: PlanKind;
  busy: boolean;
  locked: boolean;
  canEdit: boolean;
  obState: 'loading' | 'ok' | 'fail';
  obPlan: PkgPlan;
  obOf: (des: number | null, blok: string) => Map<string, number>;
  obFullRef: MutableRefObject<Map<string, Map<string, number>>>;
  applyChanges: (ch: Map<number, (Span | null)[]>, primary?: number, undoKeys?: string[]) => void;
  setErr: (t: string) => void;
  setNote: Dispatch<SetStateAction<string>>;
  setObDraft: Dispatch<SetStateAction<Map<string, Map<string, number>>>>;
}) {
  /** Мөрийн мөнгөн дүн — `мөнгөн_дүн`, байхгүй бол обьём × нэгж үнэ; `null` = мэдэгдэхгүй (бүлгээр төлөвлөх) */
  const moneyOf = useCallback((k: number): number | null => {
    const r = rowsAll[plan[k]?.i ?? -1];
    const m = r?.money ?? (r?.vol != null && r?.unit != null ? r.vol * r.unit : null);
    return m != null && Number.isFinite(m) ? m : null;
  }, [rowsAll, plan]);
  /**
   * БҮЛГИЙН ТӨЛӨВЛӨЛТИЙН ТООЦОО — тараалт (`planGroup`) ба цонхны урьдчилан харалт НЭГ эх. Бүлгийн доорх навч ажлууд
   * (батлагдаагүй нэмэлт мөр — сөрөг oid — алгасна) уялдаагаар (`orderByDeps`, уялдаагүй нь мөрийн дарааллаар) эрэмбэлэгдэж,
   * `scheduleByMoney`-ээр сарын мөнгөнд багтана. `null` = бүлэг биш.
   */
  const groupSchedule = useCallback((oid: number, sp: Span, pct: Map<string, number>) => {
    const at = plan.findIndex((x) => x.oid === oid);
    if (at < 0 || !plan[at].group) return null;
    /* Зөвхөн ШУУД ажлууд — дэд бүлгийн ажлууд өөрийн бүлгээсээ төлөвлөгдөнө (том бүлэг тэднийг дарахгүй) */
    const leaves = directWorks(plan, at);
    if (!leaves.length) return null;
    const order = orderByDeps(leaves.map((k) => ({ code: plan[k].des, deps: plan[k].deps.map((d) => d.code) }))).map((i) => leaves[i]);
    const sched = scheduleByMoney(sp, pct, order.map((k) => ({ money: moneyOf(k), vol: plan[k].vol })));
    return order.map((k, i) => ({ k, ...sched[i] }));
  }, [plan, moneyOf]);
  /**
   * БҮЛГЭЭР ТӨЛӨВЛӨХ (2026-10-29, хэрэглэгч: «ажил ажлаар биш агуулах бүлгээр төлөвлөөд сар бүрд 30% тавихад бүлгийн
   * мөнгөн дүнгээс бодож доторх ажлууд автомат төлөвлөлттэй болно»; 2026-10-29 дахин: сарын хувиар тэр сарын мөнгийг бодож
   * ажлуудыг дарааллаар нь багтаана, багтаагүй хэсэг дараагийн сард, обьём = мөнгө ÷ нэгж үнэ) — `groupSchedule`-ийн үр
   * дүнг сонгосон блокууд бүгдэд ижил тавина. Огноо нь сарын мөнгөөс тул уялдааны гинж (`propagate`) хэрэглэхгүй (дараалал
   * нь уялдаагаар аль хэдийн). Нэг `applyChanges` тул нэг Ctrl+Z-ээр буцна. Обьёмгүй ажилд зөвхөн огноо.
   */
  const planGroup = useCallback((oid: number, sp: Span, pct: Map<string, number>, blks: number[]) => {
    if (busy || locked || !canEdit || kind !== 'plan' || !sc) return;
    const sched = groupSchedule(oid, sp, pct);
    if (!sched) return;
    const bs = blks.filter((b) => b >= 0 && b < n);
    const ov = new Map<number, (Span | null)[]>();
    const jobs: { des: number; blok: string; months: Map<string, number>; sp: Span }[] = [];
    sched.forEach(({ k, span: wsp, months }) => {
      const r = plan[k];
      const next = r.spans.slice();
      while (next.length < n) next.push(null);
      for (const b of bs) next[b] = { start: wsp.start, end: wsp.end };
      ov.set(k, next);
      if (obState !== 'ok' || r.des == null || !months) return;
      for (const b of bs) {
        const blok = sc.bld[b];
        if (blok) jobs.push({ des: r.des!, blok, months, sp: wsp });
      }
    });
    if (!ov.size) { setNote(tr('Бүлэгт төлөвлөх ажил алга.')); return; }
    setErr('');
    const undoKeys = jobs.map((j) => obKey(j.des, j.blok));
    const ch = propagate(plan, n, ov);
    /* Гинж бүлгийн дэд модыг шилжүүлсэн бол (бүлгийн түвшний уялдаа) сарыг ЭЦСИЙН мужид буулгана */
    for (const j of jobs) {
      const k = plan.findIndex((x) => x.des === j.des && !x.group);
      const b = sc.bld.indexOf(j.blok);
      const fin = k >= 0 && b >= 0 ? ch.get(k)?.[b] ?? null : null;
      if (fin && (fin.start !== j.sp.start || fin.end !== j.sp.end)) {
        const tot = [...j.months.values()].reduce((a, v) => a + v, 0);
        const shape = remapMonths(j.months, j.sp, fin);
        j.months = splitByPct(tot, new Map([...shape].map(([mk, v]) => [mk, tot > 0 ? (v / tot) * 100 : 0])));
        j.sp = fin;
      }
    }
    applyChanges(ch, undefined, undoKeys);
    if (jobs.length) {
      setObDraft((m) => {
        const next = new Map(m);
        for (const j of jobs) {
          const key = obKey(j.des, j.blok);
          /* Шинэ задаргаа шинэ мужийг бүхэлд нь тодорхойлно — хуучин мужийн «бүтэн» хуулбар дараагийн засварт буцаж
             гарахгүйн тулд устгана; `applyChanges`-ийн тайралтын updater-ийн ДАРАА (энд) */
          obFullRef.current.delete(key);
          if (sameMonths(j.months, obPlan.get(j.des)?.get(j.blok))) next.delete(key);
          else next.set(key, new Map(j.months));
        }
        return next;
      });
    }
    setNote(tr('Бүлгийн {0} ажилд {1} блокт огноо ба сарын обьём тавигдлаа.', num(ov.size), num(bs.length)));
  }, [busy, locked, canEdit, kind, sc, plan, n, obState, obPlan, obFullRef, groupSchedule, applyChanges, setErr, setNote, setObDraft]);

  /**
   * ЗАГВАР ХУУЛАХ (2026-10-29) — төлөвлөсөн жижиг бүлгийн шууд ажлуудын огноо (сонгосон блокууд) ба сарын обьёмыг ижил
   * бүтэцтэй бусад бүлэгт (`sameShapeGroups` — шууд ажлуудын нэрийн дараалал ижил) хуулна; зорилтот бүлэг бүр өмнөхөөсөө
   * `step` хоногоор хойш. Сарын обьём шинэ мужид `remapMonths`-оор. Бүлгээс гадуурх хамаарагчид гинжээр түлхэгдэнэ.
   */
  const copyGroup = useCallback((srcOid: number, targets: number[], step: number, blks: number[]) => {
    if (busy || locked || !canEdit || kind !== 'plan' || !sc) return;
    const src = plan.findIndex((x) => x.oid === srcOid);
    if (src < 0) return;
    const sw = directWorks(plan, src);
    const bs = blks.filter((b) => b >= 0 && b < n);
    const ov = new Map<number, (Span | null)[]>();
    /* Сарын обьём — гинжийн (`propagate`) ДАРААХ эцсийн мужаар бодогдоно (доор) */
    const pairs: { m: number; b: number; s0: Span; sd: number; td: number; blok: string }[] = [];
    targets.forEach((tOid, ti) => {
      const t = plan.findIndex((x) => x.oid === tOid);
      if (t < 0) return;
      const tw = directWorks(plan, t);
      if (tw.length !== sw.length) return;
      const shift = step * (ti + 1) * DAY;
      sw.forEach((k, w) => {
        const m = tw[w];
        const next = plan[m].spans.slice();
        while (next.length < n) next.push(null);
        let any = false;
        for (const b of bs) {
          const s0 = plan[k].spans[b];
          if (!s0) continue;
          const ns = { start: s0.start + shift, end: s0.end + shift };
          next[b] = ns;
          any = true;
          const blok = sc.bld[b];
          const sd = plan[k].des;
          const td = plan[m].des;
          if (obState === 'ok' && blok && sd != null && td != null) pairs.push({ m, b, s0, sd, td, blok });
        }
        if (any) ov.set(m, next);
      });
    });
    if (!ov.size) { setNote(tr('Хуулах огноо алга — эх бүлгээ эхлээд төлөвлөнө үү.')); return; }
    setErr('');
    const ch = propagate(plan, n, ov);
    /* Эх ажлын сарын ХЭЛБЭРИЙГ (хувь) ЗОРИЛТОТ ажлын өөрийн обьёмд хэрэглэнэ — обьём нь өөр байж болно; обьёмгүй бол сар бичихгүй */
    const jobs: { key: string; des: number; blok: string; months: Map<string, number> }[] = [];
    for (const p of pairs) {
      const tvol = plan[p.m].vol;
      const fin = ch.get(p.m)?.[p.b] ?? null;
      const mo = obOf(p.sd, p.blok);
      const stot = [...mo.values()].reduce((a, v) => a + v, 0);
      if (!fin || tvol == null || !(tvol > 0) || !(stot > 0)) continue;
      const shape = remapMonths(mo, p.s0, fin);
      const pct = new Map([...shape].map(([k, v]) => [k, (v / stot) * 100]));
      jobs.push({ key: obKey(p.td, p.blok), des: p.td, blok: p.blok, months: splitByPct(tvol, pct) });
    }
    applyChanges(ch, undefined, jobs.map((j) => j.key));
    if (jobs.length) {
      setObDraft((mm) => {
        const next = new Map(mm);
        for (const j of jobs) {
          obFullRef.current.delete(j.key);
          if (sameMonths(j.months, obPlan.get(j.des)?.get(j.blok))) next.delete(j.key);
          else next.set(j.key, j.months);
        }
        return next;
      });
    }
    setNote(tr('{0} бүлэгт загвар хуулагдлаа ({1} ажил).', num(targets.length), num(ov.size)));
  }, [busy, locked, canEdit, kind, sc, plan, n, obState, obOf, obPlan, obFullRef, applyChanges, setErr, setNote, setObDraft]);

  return { moneyOf, groupSchedule, planGroup, copyGroup };
}
