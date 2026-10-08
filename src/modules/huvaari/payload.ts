import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { normDayMs, type SheetRow } from '@/modules/sheet/bagtsSheet';
import type { PlanRow, Span } from '@/lib/plan';
import { formatDeps, parseDeps, rollUpGroups } from '@/lib/deps';
import type { MonthRes, PkgPlan, PkgRes } from '@/lib/huvaariObyem';
import { remapPayload, type PlanPayload } from '@/lib/huvaariBatlah';
import type { ADraft, Draft, PlanKind, ResDraft } from './types';
import { hasDatedLeaf, sameMonths, sameRes, sameSpan, toPlanRows } from './util';

/**
 * ИЛГЭЭЛТИЙН АГУУЛГА ↔ НООРОГ — цэвэр функцууд (2026-09-30: `Huvaari.tsx`-ээс
 * механикаар салгав; логик · тайлбар ХЭВЭЭР, зөвхөн state-гүй болсон).
 */

/**
 * ⚠️ 2026-10-08: ИЛГЭЭЛТИЙН ОГНООГ UTC ӨДӨРТ ТЭГШИТГЭНЭ (`normDayMs`). Мөрүүд (`rows`/`curRows`)
 *    одоо уншихдаа тэгшлэгддэг (`bagtsSheet.loadRows`), харин 2026-10-08-аас ӨМНӨ илгээгдсэн
 *    саналын `spans`/`base.spans`/`actual` нь ТҮҮХИЙ (УБ-ын шөнө дунд = 16:00Z) агшин — хатуу
 *    тулгалт (`sameSpan` · `===`) тэднийг «зэрэгцээ өөрчлөлт» гэж ХУДЛАА зогсоож, батлагдах ч,
 *    ноорогт буух ч боломжгүй болгодог байв. Хоёр талыг тэгшлээд тулгана; бичигдэх утга ч тэгшлэгдсэн.
 */
const nDay = (ms: number | null | undefined): number | null => normDayMs(ms ?? null);
const nSpan = (s: { start: number; end: number } | null | undefined): Span | null =>
  (s ? { start: nDay(s.start) ?? s.start, end: nDay(s.end) ?? s.end } : null);

/**
 * ЗӨВШӨӨРӨЛ ШААРДАХ МӨРҮҮД — өөрчлөгдсөн АЖЛЫН мөр + бүлгийн ЖИНХЭНЭ өөрчлөлт
 * (2026-09-30: `Huvaari.tsx`-ийн `reviewOids` memo-гоос механикаар салгав — цэвэр функц).
 * Дүрмийн ⚠️ тайлбарууд дуудагч дээр (`Huvaari.tsx`) хэвээр.
 */
export function reviewOidsOf({
dirtyOids, plan, base, ham, draft, aDraft, resDraft, obDraft, obResDraft, obPlan, obRes, hasActual, hasRes, n,
}: {
dirtyOids: ReadonlySet<number>; plan: PlanRow[]; base: PlanRow[];
ham: Map<number, string>; draft: Draft; aDraft: ADraft; resDraft: ResDraft;
obDraft: Map<string, Map<string, number>>; obResDraft: Map<string, Map<string, MonthRes>>;
obPlan: PkgPlan; obRes: PkgRes; hasActual: boolean; hasRes: boolean; n: number;
}): number[] {
  const out: number[] = [];
  const arrDiff = (a: readonly (number | null)[] | undefined, b: readonly (number | null)[] | undefined) =>
    Array.from({ length: n }, (_, k) => k).some((k) => (a?.[k] ?? null) !== (b?.[k] ?? null));
  for (const o of dirtyOids) {
    const i = plan.findIndex((r) => r.oid === o);
    if (i < 0) continue;
    const r = plan[i];
    const b0 = base[i];
    if (!b0) continue;
    const depsDiff = ham.has(o) && formatDeps(r.deps) !== formatDeps(b0.deps);
    if (!r.group) {
      const spDiff = r.spans.some((sp, b) => !sameSpan(sp, b0.spans[b]));
      const aDiff = hasActual && aDraft.has(o) && (arrDiff(r.aStart, b0.aStart) || arrDiff(r.aEnd, b0.aEnd));
      const rDiff = hasRes && resDraft.has(o) && ((r.hun ?? null) !== (b0.hun ?? null) || (r.mashin ?? null) !== (b0.mashin ?? null));
      let obDiff = false;
      if (r.des != null) {
        const pre = `${r.des}|`;
        for (const [k, m] of obDraft) {
          if (k.startsWith(pre) && !sameMonths(m, obPlan.get(r.des)?.get(k.slice(pre.length)))) { obDiff = true; break; }
        }
        if (!obDiff) {
          for (const [k, m] of obResDraft) {
            if (k.startsWith(pre) && !sameRes(m, obRes.get(r.des)?.get(k.slice(pre.length)))) { obDiff = true; break; }
          }
        }
      }
      if (spDiff || depsDiff || aDiff || rDiff || obDiff) out.push(o);
      continue;
    }
    if (depsDiff) { out.push(o); continue; }
    const d = draft.get(o);
    if (d && d.some((sp, b) => !hasDatedLeaf(plan, i, b, (k) => plan[k].spans)
      && !sameSpan(sp, b0.spans[b]))) out.push(o);
  }
  return out;
}
/**
 * Ноорогийг илгээлтийн агуулга болгоно — гурван ноорог нэг дор
 * (2026-09-30: `Huvaari.tsx`-ийн `buildPayload`-оос механикаар салгав — цэвэр функц).
 */
export function buildPayloadOf({
draft, ham, aDraft, resDraft, obDraft, obResDraft, kind, base, rows, obPlan, obRes,
}: {
draft: Draft; ham: Map<number, string>; aDraft: ADraft; resDraft: ResDraft;
obDraft: Map<string, Map<string, number>>; obResDraft: Map<string, Map<string, MonthRes>>;
kind: PlanKind; base: PlanRow[]; rows: SheetRow[]; obPlan: PkgPlan; obRes: PkgRes;
}): PlanPayload {
  const spans: PlanPayload['spans'] = {};
  for (const [oid, arr] of draft) {
    spans[String(oid)] = arr.map((s) => (s ? { start: s.start, end: s.end } : null));
  }
  const deps: PlanPayload['deps'] = {};
  for (const [oid, v] of ham) deps[String(oid)] = v;
  const obyem: PlanPayload['obyem'] = {};
  for (const [k, months] of obDraft) obyem[k] = Object.fromEntries(months);
  /* Сарын нөөц + суурь (2026-09-24) — обьёмын ижил зарчим */
  const obres: NonNullable<PlanPayload['obres']> = {};
  const bObRes: NonNullable<NonNullable<PlanPayload['base']>['obres']> = {};
  for (const [k, res] of obResDraft) {
    obres[k] = Object.fromEntries([...res].map(([sar, v]) => [sar, { hun: v.hun, mashin: v.mashin }]));
    const cut = k.indexOf('|');
    const prev = obRes.get(Number(k.slice(0, cut)))?.get(k.slice(cut + 1));
    bObRes[k] = prev ? Object.fromEntries([...prev].map(([sar, v]) => [sar, { hun: v.hun, mashin: v.mashin }])) : {};
  }
  /*
   * ⚠️ ИЛГЭЭХ ҮЕИЙН СУУРЬ (2026-09-21) — ноорогтой мөр бүрийн СЕРВЕР дээрх
   *    утга (`base` = `rows`, ноороггүй). Батлагч үүгээр (1) зохиогчийн
   *    ХӨНДӨӨГҮЙ блокийг серверийн одоогийн утгаар үлдээж, (2) илгээснээс
   *    хойш өөрчлөгдсөн блокийг «зэрэгцээ өөрчлөлт» гэж илрүүлнэ. Урьд нь
   *    22 блокийн бүтэн агшин бичигдэж, батлахад хооронд нь батлагдсан
   *    бусдын өөрчлөлт зохиогчийн хуучин утгаар чимээгүй буцдаг байв.
   */
  const baseByOid = new Map(base.map((r) => [r.oid, r]));
  const rowByOid = new Map(rows.map((r) => [r.oid, r]));
  const bSpans: NonNullable<PlanPayload['base']>['spans'] = {};
  for (const oid of draft.keys()) {
    const r = baseByOid.get(oid);
    if (r) bSpans[String(oid)] = r.spans.map((s) => (s ? { start: s.start, end: s.end } : null));
  }
  const bDeps: NonNullable<PlanPayload['base']>['deps'] = {};
  for (const oid of ham.keys()) bDeps[String(oid)] = rowByOid.get(oid)?.ham ?? null;
  const bObyem: NonNullable<PlanPayload['base']>['obyem'] = {};
  for (const k of obDraft.keys()) {
    const cut = k.indexOf('|');
    const prev = obPlan.get(Number(k.slice(0, cut)))?.get(k.slice(cut + 1));
    bObyem[k] = prev ? Object.fromEntries(prev) : {};
  }
  /* Бодит огноо · нөөц + илгээх үеийн суурь (2026-09-23) — ижил зарчим */
  const actual: PlanPayload['actual'] = {};
  const bActual: NonNullable<NonNullable<PlanPayload['base']>['actual']> = {};
  for (const [oid, ad] of aDraft) {
    actual[String(oid)] = { start: ad.start.slice(), end: ad.end.slice() };
    const r = rowByOid.get(oid);
    if (r) bActual[String(oid)] = { start: r.aStart.slice(), end: r.aEnd.slice() };
  }
  const res: PlanPayload['res'] = {};
  const bRes: NonNullable<NonNullable<PlanPayload['base']>['res']> = {};
  for (const [oid, rd] of resDraft) {
    res[String(oid)] = { hun: rd.hun, mashin: rd.mashin };
    const r = rowByOid.get(oid);
    if (r) bRes[String(oid)] = { hun: r.hun, mashin: r.mashin };
  }
  /* ⚠️ `kind` нь ЗААВАЛ — батлагч нь ӨӨРИЙН табаар бичих талбарыг дур
     мэдэн шийдэхээс сэргийлнэ (2026-09-11-ний аудитын S1). */
  /* ⚠️ МӨРИЙН ТОГТВОРТОЙ ТҮЛХҮҮР (2026-09-29) — `oid` → ажлын код. Илгээснээс хойш
     шинэ жааз нийтлэгдэж бүх `oid` солигдсон ч санал одоогийн мөр рүүгээ зөөгдөнө
     (`remapPayload`). Кодгүй мөр орохгүй. */
  const keys: NonNullable<PlanPayload['keys']> = {};
  for (const oid of new Set([...draft.keys(), ...ham.keys(), ...aDraft.keys(), ...resDraft.keys()])) {
    const des = rowByOid.get(oid)?.des;
    if (des != null) keys[String(oid)] = des;
  }
  return {
    kind, spans, deps, obyem, actual, res, obres,
    base: { spans: bSpans, deps: bDeps, obyem: bObyem, actual: bActual, res: bRes, obres: bObRes },
    keys,
  };
}
/** `payloadToDrafts`-ийн үр дүн — амжилттай бол буулгах 6 Map хамт (дуудагч state-д тавина) */
export type PayloadApply =
| { ok: true; conflicts: number; unknown: number; maps: { draft: Draft; ham: Map<number, string>; obDraft: Map<string, Map<string, number>>; obResDraft: Map<string, Map<string, MonthRes>>; aDraft: ADraft; resDraft: ResDraft } }
| { ok: false; why: 'kind' | 'conflict' | 'unknown'; conflicts: number; unknown: number };

/**
 * Илгээлтийн агуулгыг ноорогийн Map-ууд болгоно — БАТЛАХЫН ӨМНӨХ алхам
 * (2026-09-30: `Huvaari.tsx`-ийн `applyPayloadToDraft`-оос механикаар салгав — цэвэр
 * функц; state-д тавих нь дуудагчид). Дүрмийн ⚠️ тайлбарууд доор ХЭВЭЭР.
 */
export function payloadToDrafts(
p0: PlanPayload,
curRows: SheetRow[],
strict: boolean,
curPlan: PkgPlan,
curRes: PkgRes,
{ kind, n }: { kind: PlanKind; n: number },
): PayloadApply {
  if (p0.kind !== kind) return { ok: false, why: 'kind', conflicts: 0, unknown: 0 };
  /* ⚠️ 2026-09-29: илгээснээс хойш жааз солигдсон бол саналын `oid`-ыг ажлын кодоор
     одоогийн мөр рүү зөөнө — эс бөгөөс бүх мөр «олдсонгүй» болж, буцаагдсан хуваарь
     ноорогт буухгүй, хүлээгдэж буй нь батлагдахгүй байв. `keys`-гүй хуучин илгээлт хэвээр. */
  const p = remapPayload(p0, curRows).pay;
  const curPlanRows = toPlanRows(curRows, n, kind);
  const cur = new Map(curPlanRows.map((r) => [r.oid, r]));
  const curSheet = new Map(curRows.map((r) => [r.oid, r]));
  let conflicts = 0;
  /*
   * ⚠️ МЭДЭГДЭХГҮЙ OID-ыг НООРОГТ ОРУУЛАХГҮЙ (2026-09-25 аудит). Илгээлт нь
   *    ИЛГЭЭСЭН ҮЕИЙН жаазын oid-оор түлхүүрлэгддэг; хооронд нь шинэ жааз
   *    нийтлэгдвэл тэдгээр нь одоогийн мөрөнд байхгүй. Урьд нь ноорогт шууд
   *    орж (`dirtyN > 0`), `save` `staleN`-д унаж, хуваалцсан ноорог тэднийг
   *    дахин дахин сэргээдэг «сүнс ноорог» давталт үүсгэдэг байв. Зөөх түлхүүр
   *    (№ ¦ нэр) payload-д БАЙХГҮЙ тул хасаж ТООЛНО — дуудагч шийднэ.
   */
  const unk = new Set<number>();
  const known = (oid: number): boolean => {
    if (curSheet.has(oid)) return true;
    unk.add(oid);
    return false;
  };
  const d: Draft = new Map();
  /** Навч мөрийн ноорог — индексээр; бүлгүүдийг үүнээс дахин нэгтгэнэ */
  const ch0 = new Map<number, (Span | null)[]>();
  /** Илгээлтэд орсон БҮЛГИЙН мөрүүд — навчгүй блокийн өөрийн мужийг доор авна */
  const gOwn: string[] = [];
  for (const [k, arr] of Object.entries(p.spans)) {
    const oid = Number(k);
    if (!known(oid)) continue;
    const bs = p.base?.spans[k];
    const now = cur.get(oid);
    /* ⚠️ БҮЛГИЙН МӨРИЙГ ТУЛГАХГҮЙ (2026-09-21). Бүлэг нь `rollUpGroups`-оор
       хүүхдүүдийнхээ MIN/MAX болж ноорогт (улмаар илгээлтэд) ордог тул өөр
       илгээлт нэг бүлгийн ӨӨР хүүхдийг баталсан бол бүлгийн серверийн утга
       зөрж, «зэрэгцээ өөрчлөлт» гэж ШААРДЛАГАГҮЙ зогсдог байв. Бүлгийг доор
       серверийн ОДООГИЙН хүүхдээс дахин нэгтгэнэ; «N нүд» тоонд оруулахгүй. */
    if (now?.group) { gOwn.push(k); continue; }
    const v = arr.map((s, b) => {
      /* ⚠️ 2026-10-08: хоёр тал тэгшлэгдсэн (`nSpan`) — дээрх ⚠️ */
      const v0 = nSpan(s);
      if (!bs || !now) return v0;
      const b0 = nSpan(bs[b]);
      /* Зохиогч хөндөөгүй → серверийн одоогийнх */
      if (sameSpan(v0, b0)) return now.spans[b] ?? null;
      /* ⚠️ Сервер аль хэдийн САНАЛТАЙ ИЖИЛ бол зөрчил БИШ (2026-09-24 аудит):
         хагас бичилт (огноо бичигдээд задаргаа унасан) дараа нь мөнхөд
         «зэрэгцээ өөрчлөлт» гэж зогсдог байв. Доорх бүх тулгалтад ижил. */
      if (!sameSpan(b0, now.spans[b] ?? null) && !sameSpan(v0, now.spans[b] ?? null)) conflicts += 1;
      return v0;
    });
    d.set(oid, v);
    if (now) ch0.set(now.i, v);
  }
  /* Бүлгүүд — серверийн одоогийн мөр дээр хүүхдийн ноорогоос дахин нэгтгэнэ.
     Хүүхэд нь серверийнхээс хөдлөөгүй бүлэг ноорогт орохгүй (бичигдэхгүй). */
  if (ch0.size) {
    for (const [i, spans] of rollUpGroups(curPlanRows, n, ch0)) {
      const g = curPlanRows[i];
      if (g?.group) d.set(g.oid, spans);
    }
  }
  /*
   * ⚠️ БҮЛГИЙН ӨӨРИЙН МУЖ (2026-09-25 аудит). Дээрх «тулгахгүй» дүрэм нь
   *    НЭГТГЭЛИЙН дагаварт л хамаарна. Огноотой навчгүй блокт бүлгийн муж нь
   *    ӨӨРИЙНХ (`effSpan`) бөгөөд уялдаатай бүлгийг `propagate` ТЭР мужаар
   *    шилжүүлдэг — алгасвал батлахад хамаарагчид нь бичигдэж, бүлэг өөрөө
   *    бичигдэхгүй байв. Тэр блокуудыг навчийн ижил суурь-тулгалтаар авна.
   */
  for (const k of gOwn) {
    const oid = Number(k);
    const now = cur.get(oid);
    const arr = p.spans[k];
    if (!now || !arr) continue;
    const bs = p.base?.spans[k];
    const next = (d.get(oid) ?? now.spans).slice();
    let own = false;
    arr.forEach((s, b) => {
      if (b >= n) return;
      if (hasDatedLeaf(curPlanRows, now.i, b, (kk) => ch0.get(kk) ?? curPlanRows[kk].spans)) return;
      const v0 = nSpan(s);
      const nb = now.spans[b] ?? null;
      if (bs) {
        const b0 = nSpan(bs[b]);
        /* Зохиогч хөндөөгүй → серверийн одоогийнх */
        if (sameSpan(v0, b0)) return;
        if (!sameSpan(b0, nb) && !sameSpan(v0, nb)) conflicts += 1;
      }
      if (sameSpan(v0, nb)) return;
      next[b] = v0;
      own = true;
    });
    if (own) d.set(oid, next);
  }
  const hm = new Map<number, string>();
  for (const [k, v] of Object.entries(p.deps)) {
    if (!known(Number(k))) continue;
    const bd = p.base?.deps;
    /* ⚠️ ЗОХИОГЧ ХӨНДӨӨГҮЙ уялдаа (санал = суурь) — серверийн одоогийнх үлдэнэ (2026-10-01).
       `spans`-ын «хөндөөгүй блок → сервер» дүрэмтэй ижил, `backMarkMapOf`-той нийцтэй.
       Урьд нь ноорогт орж: батлахад сервер хооронд нь өөрчлөгдсөн бол худал «зэрэгцээ
       өөрчлөлт», татах/буцаах (`strict: false`) замд хуучин утга серверийнхийг дарна. */
    if (bd && k in bd && (bd[k] ?? '') === (v ?? '')) continue;
    hm.set(Number(k), v);
    if (bd && k in bd) {
      const now = curSheet.get(Number(k));
      if (now && (now.ham ?? null) !== (bd[k] ?? null) && (now.ham ?? null) !== v) conflicts += 1;
    }
  }
  const ob = new Map<string, Map<string, number>>();
  for (const [k, months] of Object.entries(p.obyem)) {
    const mine = new Map(Object.entries(months));
    const bo = p.base?.obyem;
    if (bo && k in bo) {
      const was = new Map(Object.entries(bo[k]));
      /* ⚠️ Зохиогч хөндөөгүй (санал = суурь) — серверийнх үлдэнэ (2026-10-01, уялдаатай ижил) */
      if (sameMonths(mine, was)) continue;
      const cut = k.indexOf('|');
      const now = curPlan.get(Number(k.slice(0, cut)))?.get(k.slice(cut + 1));
      if (!sameMonths(now, was) && !sameMonths(now, mine)) conflicts += 1;
    }
    ob.set(k, mine);
  }
  /*
   * БОДИТ ОГНОО · НӨӨЦ (2026-09-23) — `spans`-ын ижил суурь-тулгалт:
   * зохиогч хөндөөгүй блок/талбар → серверийн одоогийнх; зохиогч зассан
   * атлаа суурь ≠ сервер → зэрэгцээ өөрчлөлт. Хуучин илгээлтэд `{}`.
   */
  const ad: ADraft = new Map();
  for (const [k, v] of Object.entries(p.actual)) {
    const oid = Number(k);
    if (!known(oid)) continue;
    const now = curSheet.get(oid);
    const bs = p.base?.actual?.[k];
    const pick = (arr: (number | null)[], baseArr: (number | null)[] | undefined, nowArr: (number | null)[] | undefined) =>
      Array.from({ length: n }, (_, b) => {
        /* ⚠️ 2026-10-08: бодит огноо ч тэгшлэгдсэн (`nDay`) — мөрийн `aStart`/`aEnd` одоо тэгшлэгддэг */
        const v0 = nDay(arr[b]);
        if (!bs || !now || !baseArr || !nowArr) return v0;
        const b0 = nDay(baseArr[b]);
        const n0 = nowArr[b] ?? null;
        if (v0 === b0) return n0;
        if (b0 !== n0 && v0 !== n0) conflicts += 1;
        return v0;
      });
    ad.set(oid, { start: pick(v.start, bs?.start, now?.aStart), end: pick(v.end, bs?.end, now?.aEnd) });
  }
  const rd: ResDraft = new Map();
  for (const [k, v] of Object.entries(p.res)) {
    const oid = Number(k);
    if (!known(oid)) continue;
    const now = curSheet.get(oid);
    const bs = p.base?.res?.[k];
    const pick = (v0: number | null, b0: number | null | undefined, n0: number | null | undefined) => {
      if (!bs || !now) return v0;
      if (v0 === (b0 ?? null)) return n0 ?? null;
      if ((b0 ?? null) !== (n0 ?? null) && v0 !== (n0 ?? null)) conflicts += 1;
      return v0;
    };
    rd.set(oid, { hun: pick(v.hun, bs?.hun, now?.hun), mashin: pick(v.mashin, bs?.mashin, now?.mashin) });
  }
  /* САРЫН НӨӨЦ (2026-09-24) — обьёмын ижил суурь-тулгалт; хуучин илгээлтэд `{}` */
  const or = new Map<string, Map<string, MonthRes>>();
  for (const [k, months] of Object.entries(p.obres ?? {})) {
    const mine = new Map(Object.entries(months).map(([sar, v]) => [sar, { hun: v.hun, mashin: v.mashin }]));
    const bo = p.base?.obres;
    if (bo && k in bo) {
      const was = new Map(Object.entries(bo[k]).map(([sar, v]) => [sar, { hun: v.hun, mashin: v.mashin }]));
      /* ⚠️ Зохиогч хөндөөгүй (санал = суурь) — серверийнх үлдэнэ (2026-10-01) */
      if (sameRes(mine, was)) continue;
      const cut = k.indexOf('|');
      const now = curRes.get(Number(k.slice(0, cut)))?.get(k.slice(cut + 1));
      if (!sameRes(now, was) && !sameRes(now, mine)) conflicts += 1;
    }
    or.set(k, mine);
  }
  const unknown = unk.size;
  if (strict && conflicts) return { ok: false, why: 'conflict', conflicts, unknown };
  /* ⚠️ Батлах/харах (`strict`) замд мэдэгдэхгүй мөртэй саналыг БУУЛГАХГҮЙ —
     хагас санал харагдаж/батлагдах ёсгүй. Дуудагч `unknown`-оор алдаа хэлнэ. */
  if (strict && unknown) return { ok: false, why: 'unknown', conflicts, unknown };
  return { ok: true, conflicts, unknown, maps: { draft: d, ham: hm, obDraft: ob, obResDraft: or, aDraft: ad, resDraft: rd } };
}

/** Зэрэгцээ өөрчлөлтийн алдааны текст — preview ба decide хоёуланд нэг */
export const conflictMsg = (n0: number) => tr('{0} нүд илгээснээс хойш өөр замаар өөрчлөгдсөн байна (зэрэгцээ өөрчлөлт). Батлах боломжгүй — буцааж, зохиогч шинэ хуваарин дээр дахин илгээнэ.', num(n0));
/**
 * ХАГАС БИЧИГДСЭН БАТЛАЛТ (2026-10-01) — огноо эх хуудсанд орсон, сарын обьём унасан.
 * `prev` — `save`-ийн тавьсан техникийн шалтгаан (сүлжээ г.м.); байвал хойно нь залгана.
 */
export const partialMsg = (prev: string) => tr('Огноо эх хуудсанд бичигдсэн боловч сарын обьём бичигдсэнгүй — «Батлах»-ыг дахин дарж дуусгана уу (буцаах боломжгүй, бичигдсэн огноо үлдэнэ).')
  + (prev ? ` (${prev})` : '');
/** Илгээлтийн мөр одоогийн жаазад алга (2026-09-25 аудит) — preview ба decide хоёуланд нэг */
export const unknownMsg = (n0: number) => tr('Илгээлтийн {0} мөр одоогийн хуудаснаас олдсонгүй — хуудас хооронд нь шинэчлэгдсэн байна. Батлах боломжгүй — буцааж, зохиогч дахин илгээнэ.', num(n0));
/**
 * БУЦААСАН ТЭМДЭГ — мөр бүрд 'ok' | 'bad' (2026-09-30: `Huvaari.tsx`-ийн `backMarkMap`
 * memo-гоос механикаар салгав — цэвэр функц). Дүрмийн ⚠️ дуудагч дээр хэвээр.
 */
export function backMarkMapOf({
backOn, backMarks, rows, plan, byCode, reviewSet, n, obDraft, obPlan, obResDraft, obRes,
}: {
backOn: boolean; backMarks: { oid: number; ok: Set<number>; pay: PlanPayload } | null;
rows: SheetRow[]; plan: PlanRow[]; byCode: Map<number, number>; reviewSet: ReadonlySet<number>; n: number;
obDraft: Map<string, Map<string, number>>; obPlan: PkgPlan;
obResDraft: Map<string, Map<string, MonthRes>>; obRes: PkgRes;
}): Map<number, 'ok' | 'bad'> {
  const out = new Map<number, 'ok' | 'bad'>();
  if (!backOn || !backMarks) return out;
  /* ⚠️ 2026-09-29: тэмдэг ч одоогийн жаазын `oid`-оор — санал ба зөвшөөрсөн мөрийг зөөнө */
  const rm = remapPayload(backMarks.pay, rows);
  const p = rm.pay;
  const okSet = new Set([...backMarks.ok].map((o) => rm.map.get(o) ?? o));
  /* ⚠️ 2026-10-08: `okRows` нь ШИЙДВЭРИЙН үеийн жаазын `oid` (батлагчийн хуудас), `rm.map` нь
     ИЛГЭЭЛТИЙН жаазынхыг л зөөдөг — хоёр жааз зөрвөл ногоон тэмдэг алга болж бүх мөр улаан
     харагддаг байв. Ажлын КОДООР (`des`) давхар тулгана: илгээлтийн `keys` эсвэл одоогийн жааз. */
  const desOfOld = new Map<number, number>(Object.entries(backMarks.pay.keys ?? {}).map(([k, d]) => [Number(k), d]));
  const curDes = new Map(rows.map((r) => [r.oid, r.des]));
  const okDes = new Set<number>();
  for (const o of backMarks.ok) {
    const d = desOfOld.get(o) ?? curDes.get(o);
    if (d != null) okDes.add(d);
  }
  const pb = p.base;
  const idx = new Map(plan.map((r, i) => [r.oid, i]));
  const oids = new Set<number>();
  for (const k of [...Object.keys(p.spans), ...Object.keys(p.deps), ...Object.keys(p.actual), ...Object.keys(p.res)]) {
    oids.add(Number(k));
  }
  for (const k of [...Object.keys(p.obyem), ...Object.keys(p.obres ?? {})]) {
    const code = Number(k.slice(0, k.indexOf('|')));
    const i = Number.isFinite(code) ? byCode.get(code) : undefined;
    if (i != null && plan[i]) oids.add(plan[i].oid);
  }
  const resMap = (o: Record<string, { hun: number | null; mashin: number | null }> | undefined) =>
    new Map(Object.entries(o ?? {}).map(([s0, v]) => [s0, { hun: v.hun, mashin: v.mashin }]));
  const samePay = (r: PlanRow, i: number): boolean => {
    const k = String(r.oid);
    const arr = p.spans[k];
    if (arr) {
      const bs = pb?.spans[k];
      for (let b = 0; b < n; b++) {
        /* ⚠️ 2026-10-08: тэгшлэгдсэн тулгалт (`nSpan`) — `payloadToDrafts`-тай нэг дүрэм */
        const v0 = nSpan(arr[b]);
        if (bs && sameSpan(v0, nSpan(bs[b]))) continue;
        /* Бүлгийн хүүхдээс бодогдох блок — зохиогчийн утга биш */
        if (r.group && hasDatedLeaf(plan, i, b, (kk) => plan[kk].spans)) continue;
        if (!sameSpan(v0, r.spans[b] ?? null)) return false;
      }
    }
    if (k in p.deps) {
      const was = pb?.deps && k in pb.deps ? pb.deps[k] : undefined;
      if (!(was !== undefined && (was ?? '') === p.deps[k])
        && formatDeps(parseDeps(p.deps[k])) !== formatDeps(r.deps)) return false;
    }
    const ac = p.actual[k];
    if (ac) {
      const bs = pb?.actual?.[k];
      for (let b = 0; b < n; b++) {
        const s0 = nDay(ac.start[b]);
        const e0 = nDay(ac.end[b]);
        if (!(bs && s0 === nDay(bs.start[b])) && s0 !== (r.aStart?.[b] ?? null)) return false;
        if (!(bs && e0 === nDay(bs.end[b])) && e0 !== (r.aEnd?.[b] ?? null)) return false;
      }
    }
    const rs = p.res[k];
    if (rs) {
      const bs = pb?.res?.[k];
      if (!(bs && rs.hun === (bs.hun ?? null)) && rs.hun !== (r.hun ?? null)) return false;
      if (!(bs && rs.mashin === (bs.mashin ?? null)) && rs.mashin !== (r.mashin ?? null)) return false;
    }
    if (r.des != null) {
      const pre = `${r.des}|`;
      for (const [key, months] of Object.entries(p.obyem)) {
        if (!key.startsWith(pre)) continue;
        const want = new Map(Object.entries(months));
        if (pb?.obyem && key in pb.obyem && sameMonths(want, new Map(Object.entries(pb.obyem[key])))) continue;
        const now = obDraft.get(key) ?? obPlan.get(r.des)?.get(key.slice(pre.length));
        if (!sameMonths(now, want)) return false;
      }
      for (const [key, months] of Object.entries(p.obres ?? {})) {
        if (!key.startsWith(pre)) continue;
        const want = resMap(months);
        if (pb?.obres && key in pb.obres && sameRes(want, resMap(pb.obres[key]))) continue;
        const now = obResDraft.get(key) ?? obRes.get(r.des)?.get(key.slice(pre.length));
        if (!sameRes(now, want)) return false;
      }
    }
    return true;
  };
  for (const o of oids) {
    if (!reviewSet.has(o)) continue;
    const i = idx.get(o);
    if (i == null) continue;
    if (!samePay(plan[i], i)) continue;
    const des = plan[i].des;
    out.set(o, okSet.has(o) || (des != null && okDes.has(des)) ? 'ok' : 'bad');
  }
  return out;
}
