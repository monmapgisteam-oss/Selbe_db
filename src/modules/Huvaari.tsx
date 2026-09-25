'use client';

/**
 * ХУВААРЬ — «Гүйцэтгэл бөглөх» хуудасны эхлэх/дуусах огноог ТӨЛӨВЛӨХ хэсэг.
 *
 * ⚠️ ЯАГААД ТУСДАА ХАРАГДАЦ (2026-08-28, хэрэглэгчийн шийдвэр): бөглөх хуудас
 * нь 1,400 мөр × 60 багана. Тэнд нэг ажлыг 12–22 блокт хуваарилахын тулд
 * 24–44 удаа календар нээж дарна. Амьд өгөгдөл үүнийг баталсан — 10 багцын
 * 6-д хуваарийн хамралт 6%-иас доогуур байв.
 *
 * ⚠️ НЭГ БҮТЭН ХҮСНЭГТ (2026-09-01, хэрэглэгчийн заавар). Урьд нь дээд талд
 * ЖАГСААЛТ, доод талд тусдаа ХУАНЛИ байсан: дээрээс бүлгээ сонгоод доор нь
 * төлөвлөнө. Хоёр тусдаа хэсэг байсан тул сонгосон мөр доод хуанлиас олдохгүй,
 * харц дээш доош үсэрдэг байв. Одоо ХОЁУЛАА НЭГ ХҮСНЭГТ: зүүн талд ажлын мод,
 * мөр БҮРИЙН АРД өөрийнх нь хуваарийн зурвас. Мөр нэгээс нэг эгнэнэ.
 *
 * ⚠️ ХОЁР ЗАМААР ТОХИРУУЛНА:
 *   1. ЗУРВАС ЧИРЭХ — хурдан, харьцангуй (мужийг нүдээр тааруулна).
 *   2. POPUP ХУАНЛИ — ажлын нэр дээр дарахад нээгдэнэ; огноог ТООГООР
 *      нарийн оруулна, бүх блокт нэг дор тараана. Чирэлт нь 1 пиксель = 1
 *      хоног тул яг тодорхой огноо тавихад тохиромжгүй.
 *
 * ⚠️ ХАДГАЛАЛТ нь БАЙГАА хуудсанд буцаж бичигдэнэ (`applyUpdates`) — шинэ
 * үйлчилгээ үүсгэхгүй тул төлөвлөгөөт хувь, график, тайлан бүгд өөрчлөлтгүй.
 * АРХИВТ ШИНЭ АГШИН ҮҮСГЭХГҮЙ: хуваарь нь хэмжилт биш, төлөвлөгөө.
 */

import {
  Fragment, type PointerEvent as PEvt, type ReactNode, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Section, Empty, Loading } from '@/components/ui';
import { useAuth } from '@/components/AuthGate';
import { hasPlanRole, huvaariScope, subscribeHuvaariAcl } from '@/lib/huvaariAcl';
import { roleForUser } from '@/lib/services';
import { num } from '@/lib/format';
import {
  loadSchema, pkgFloors, PKG_GROUPS, PKGS, type Pkg, type Schema,
} from '@/modules/sheet/bagts.pkg';
import { applyUpdates, loadRows, msToDay, type SheetRow } from '@/modules/sheet/bagtsSheet';
import { insertAdds, type NewRow } from '@/modules/sheet/sheetFrame';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { ajilScope, subscribeAjilAcl } from '@/lib/ajilAcl';
import {
  AJIL_STATUS, loadApproved as loadAjilApproved, loadHistory as loadAjilHistory,
  loadPayload as loadAjilPayload, loadPending as loadAjilPending, markRestored as markAjilRestored,
  submitAjil, withdrawAjil, type AjilSubmission,
} from '@/lib/ajilBatlah';
import {
  DAY, coverageOf, endOf, spanDays, statusOf,
  type PlanRow, type Span, type Status,
} from '@/lib/plan';
import {
  codeIndex, downstreamCodes, effSpan, formatDeps, hierRelated, parseDeps,
  propagate, reaches, requiredStart, residualDeps, rollUpGroups, sameDep,
  type Dep, type DepType,
} from '@/lib/deps';
import {
  balanced, buildEdits, loadPkgPlan, applyPlanEdits, keepMonths, keepRes, monthsOf,
  obyemResFields, sumMonths, sumRes, type MonthRes, type PkgPlan, type PkgRes, type PlanEdits, type WorkMeta,
} from '@/lib/huvaariObyem';
import {
  claimPlan, decidePlan, loadHistory, loadPayload, loadPending, planTableState, PLAN_STATUS,
  releasePlanClaim, setPlanNavBusy, submitPlan, withdrawPlan, type PlanPayloadKind,
  type PlanPayload, type PlanSubmission,
} from '@/lib/huvaariBatlah';
import { useFocusTrap } from '@/lib/useFocusTrap';
import {
  readRemoteDraft, readRemoteDraftAt, saveRemoteDraft, REMOTE_MAX,
} from '@/lib/draftRemote';
import {
  cellsToMaps, hdKey, hdLocalKey, isEmpty as hdIsEmpty, kM, kN, mapsToCells, merge as hdMerge,
  parse as hdParse, sameVal, serialize as hdSerialize, sig as hdSig, users as hdUsersOf,
  type HDApply, type HDCell, type HDCtx, type HDDraft, type HDEntries, type HDEntry, type HDRowBase,
} from '@/lib/huvaariDraft';
import h from './huvaari.module.css';

/* ══════════════════ Туслах ══════════════════ */

/** Богино огноо — «03-02». Жил нь хүрээний шошгонд бий. */
const short = (ms: number) => msToDay(ms).slice(5);
/** Локал «өнөөдөр» — UTC шөнө дундын ms (хуанлийн түлхүүртэй ижил хэлбэр) */
const todayUtc = (): number => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };

/** Хоёр муж (эсвэл хоёулаа хоосон) ижил үү — ноорог ба суурийн харьцуулалтад (2026-09-21) */
const sameSpan = (a: Span | null | undefined, b: Span | null | undefined): boolean => (
  (!a && !b) || (!!a && !!b && a.start === b.start && a.end === b.end)
);

/**
 * Хоёр сарын задаргаа ижил үү — хоёулаа хоосон (эсвэл байхгүй) ч ИЖИЛ (2026-09-21).
 * ⚠️ Ноорогийг серверийн задаргаатай тулгахад: ижил бол ноорогт үлдээх зүйлгүй —
 *    бичих зүйл ч, «хадгалаагүй» тэмдэг ч байх ёсгүй.
 */
const sameMonths = (
  a: ReadonlyMap<string, number> | null | undefined,
  b: ReadonlyMap<string, number> | null | undefined,
): boolean => {
  const x = a ?? new Map<string, number>();
  const y = b ?? new Map<string, number>();
  return x.size === y.size && [...x].every(([k, v]) => y.get(k) === v);
};

/** Хоёр сарын НӨӨЦИЙН задаргаа ижил үү — `sameMonths`-ийн адил (2026-09-24); утгагүй сар тоологдохгүй */
const sameRes = (
  a: ReadonlyMap<string, MonthRes> | null | undefined,
  b: ReadonlyMap<string, MonthRes> | null | undefined,
): boolean => {
  const norm = (m: ReadonlyMap<string, MonthRes> | null | undefined) => {
    const o = new Map<string, MonthRes>();
    for (const [k, v] of m ?? []) if (v.hun != null || v.mashin != null) o.set(k, v);
    return o;
  };
  const x = norm(a);
  const y = norm(b);
  return x.size === y.size && [...x].every(([k, v]) => {
    const w = y.get(k);
    return !!w && (w.hun ?? null) === (v.hun ?? null) && (w.mashin ?? null) === (v.mashin ?? null);
  });
};

/**
 * `gi` бүлгийн доор `b` блокт огноотой НАВЧ байна уу (2026-09-25 аудит).
 * ⚠️ Байхгүй бол бүлгийн үр дүнтэй муж нь ӨӨРИЙНХ (`effSpan`) — тэр блок дахь
 *    ноорог нь `rollUpGroups`-ын дагавар БИШ, `propagate`-ийн шилжүүлсэн
 *    бүлгийн ӨӨРИЙН муж тул хасаж/алгасаж болохгүй.
 */
function hasDatedLeaf(
  rows: readonly PlanRow[], gi: number, b: number,
  spansOf: (k: number) => readonly (Span | null)[],
): boolean {
  const d0 = rows[gi].depth;
  for (let k = gi + 1; k < rows.length && rows[k].depth > d0; k++) {
    if (!rows[k].group && spansOf(k)[b]) return true;
  }
  return false;
}

/** «2026-05-04» → UTC шөнө дунд. Буруу бол `null`. */
const dayToMs = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/**
 * ХУВААРИЙН ТӨРӨЛ — аль огноог засаж байна вэ (2026-09-11).
 *
 * ⚠️ `plan` = ТӨЛӨВЛӨСӨН (`F…_Эхлэх`/`…_Дуусах`) — ажлын явцад хөдөлдөг.
 *    `geree` = ГЭРЭЭНИЙ (`F…_geree_ehleh`/`…_geree_duusah`) — өөрчлөгдөшгүй
 *    лавлагаа. Хоёрын ЗӨРҮҮ нь «хуваарь гэрээнээс хэр хазайсан» гэдгийг
 *    хэмжих суурь тул НЭГ талбарт хийж болохгүй.
 * ⚠️ Уялдаа (`deps`) ба сарын обьём нь ЗӨВХӨН төлөвлөгөөнд хамаарна —
 *    гэрээ нь гинжээр хөдөлдөггүй, түүнээс обьём тараах ч утгагүй.
 */
/**
 * ⚠️ ЭХ тодорхойлолт нь `huvaariBatlah.ts`-д (`PlanPayloadKind`) — илгээлтийн
 *    агуулгад бичигддэг тул тэнд эзэмшигдэнэ. Энд зөвхөн ХОЧ: хоёр тусдаа
 *    union бичвэл нэг нь өөрчлөгдөхөд нөгөө нь чимээгүй зөрнө.
 */
type PlanKind = PlanPayloadKind;

/* ══════════════════ НЭМЭЛТ АЖИЛ — түр ObjectID ба локал ноорог (2026-09-24) ══════════════════ */
/**
 * ⚠️ 2026-09-24 (хэрэглэгчийн шийдвэр): шинэ ажлын мөр НЭМЭХ нь «Гүйцэтгэл
 *    бөглөх»-өөс ЭНД шилжив. Бүлгийн мөрөн дээрх «+» → маягт (№ · Ажлын нэр ·
 *    Обьём · Нэгж өртөг) → `adds` → «Нэмэлт ажил батлуулах» (`submitAjil`) →
 *    батлагч `AjilBatlah`-д батлангуут `ajilApply.materializeAdds` үндсэн
 *    хүснэгтэд бүтэн жааз бичнэ → энэ хуудас `refetchServer`-ээр мөрийг
 *    серверээс авна. Батлагдтал мөр нь энд УЛААНААР, хуваарь тавигдахгүй.
 * ⚠️ `adds` нь ЗӨВХӨН энэ хөтчийн localStorage-д (`selbe-ajil-adds|<багц>`) —
 *    хуваалцсан ноорог (hd*) ба хуваарийн илгээлт (`PlanPayload`)-д ОРОХГҮЙ:
 *    тэд огноо/уялдааны тухай, энэ нь гэрээний хамрах хүрээний тухай (тусдаа
 *    2 шатат урсгал, `ajilBatlah.ts`-ийн ⚠️). Нийлүүлбэл «огноо батлагдсан»
 *    нь «шинэ ажил батлагдсан» гэж уншигдана.
 * ⚠️ `tmpOid`/`nextTmpOid`/`pushTmpOid` нь FillNew-ийн 2026-09-21-ний
 *    хувилбарын ХУУЛБАР (тэндхийнх хасагдсан): сөрөг, цагаас эхэлсэн тоолуур —
 *    ачаалалт бүр өөр цэгээс эхэлж, сэргээсэн мөрөөс доош түлхэгдэнэ; серверийн
 *    эерэг OID-тай хэзээ ч мөргөлдөхгүй (`ajilBatlah.parsePayload` сөрөг
 *    бүхэл тоог шаарддаг).
 */
let tmpOid = -(Date.now() % 1e9) * 100 - 1;
/** Дараагийн түр ObjectID — дуудагч бүр ЭНЭ функцээр (шууд `tmpOid--` биш) */
function nextTmpOid(): number { return tmpOid--; }
/** Тоолуурыг сэргээсэн/ирсэн мөрүүдээс ЦААШ түлхэнэ — эс бөгөөс дараа нэмсэн мөр ижил дугаар авна */
function pushTmpOid(adds: readonly NewRow[]): void {
  for (const a of adds) if (a.oid <= tmpOid) tmpOid = a.oid - 1;
}
const EMPTY_ADDS: NewRow[] = [];
const ADDS_LS = (pkgKey: string) => `selbe-ajil-adds|${pkgKey}`;
/**
 * localStorage-оос сэргээх — `{ v: 1, adds }`. Эвдэрсэн БИЧЛЭГИЙГ л хаяна
 * (FillNew.parseDraft-ийн дүрэм): түр oid САЛАНГИД СӨРӨГ БҮХЭЛ, нэрс мөр,
 * `vol`/`unit` тоо эсвэл `null` (`null ≠ 0`).
 */
function readAdds(pkgKey: string): NewRow[] {
  try {
    const raw = localStorage.getItem(ADDS_LS(pkgKey));
    if (!raw) return [];
    const j = JSON.parse(raw) as { v?: number; adds?: unknown };
    if (!j || j.v !== 1 || !Array.isArray(j.adds)) return [];
    const seen = new Set<number>();
    const out: NewRow[] = [];
    const isStr = (v: unknown): v is string => typeof v === 'string';
    const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    for (const a of j.adds as unknown[]) {
      if (!a || typeof a !== 'object') continue;
      const r = a as Record<string, unknown>;
      const o = Number(r.oid);
      if (!Number.isInteger(o) || o >= 0 || seen.has(o)) continue;
      if (!isStr(r.no) || !isStr(r.work) || !isStr(r.parentNo) || !isStr(r.parentWork)) continue;
      seen.add(o);
      out.push({
        oid: o, parentNo: r.parentNo, parentWork: r.parentWork,
        parentIdx: Number.isInteger(r.parentIdx) ? (r.parentIdx as number) : -1,
        no: r.no, work: r.work, vol: numOrNull(r.vol), unit: numOrNull(r.unit),
      });
    }
    return out;
  } catch { return []; }
}
function writeAdds(pkgKey: string, adds: readonly NewRow[]): void {
  try {
    if (!adds.length) localStorage.removeItem(ADDS_LS(pkgKey));
    else localStorage.setItem(ADDS_LS(pkgKey), JSON.stringify({ v: 1, adds }));
  } catch { /* хаалттай орчин */ }
}
/**
 * Ирсэн мөрүүдийг (татсан · буцаагдсан) `adds`-д НИЙЛҮҮЛНЭ — FillNew-ийн
 * `mergeIncomingAdds`-ийн хуулбар: ижил мөр байвал алгасна, oid мөргөлдвөл
 * шинэ сул дугаар, тоолуурыг түлхэнэ.
 * ⚠️ `parentIdx`-ийг ч харьцуулна (2026-09-25 аудит): блок бүрд ижил нэртэй
 * эцэг бүлэг («10 · БУСАД АЖИЛ») байхад өөр бүлгийн доорх ижил №·нэртэй
 * хоёр мөрийн нэг нь татах/буцаахад чимээгүй алга болдог байв.
 */
function mergeIncoming(prev: readonly NewRow[], incoming: readonly NewRow[]): NewRow[] {
  const used = new Set(prev.map((a) => a.oid));
  const fresh: NewRow[] = [];
  for (const a of incoming) {
    if (prev.some((x) => x.no === a.no && x.work === a.work && x.parentNo === a.parentNo && x.parentWork === a.parentWork && x.parentIdx === a.parentIdx)) continue;
    const oid = used.has(a.oid) ? nextTmpOid() : a.oid;
    used.add(oid);
    fresh.push({ ...a, oid });
  }
  if (!fresh.length) return prev.slice();
  pushTmpOid(fresh);
  return [...prev, ...fresh];
}
/**
 * ХУУЧИН OID → ШИНЭ OID зураглал — (№ ¦ нэр) түлхүүрээр, давхардсан түлхүүрт
 * ДАРААЛЛААР (n дэх хуучин ↔ n дэх шинэ). Нэмэлт ажил батлагдахад архивт
 * БҮТЭН ШИНЭ жааз орж бүх OID солигддог (2026-09-24 аудит #1) — хадгалаагүй
 * ноорогийг хаяхгүйн тулд шинэ мөр рүү нь зөөнө (`hyanaltStore`-ийн
 * `rowKeys`/`buildOidMap`-ийн ижил санаа). Олдохгүй мөр зураглалд ОРОХГҮЙ.
 */
/*
 * ⚠️ ТҮЛХҮҮР = ӨВӨГ БҮЛГҮҮДИЙН ЗАМ + (№ ¦ нэр) (2026-09-25 аудит). Урьд нь зөвхөн
 *    (№ ¦ нэр) тул Bagts_1_9f-ийн ~60% давхардсан түлхүүрт А блокийн бүлэгт
 *    шинээр батлагдсан «3 · Хашаа» Б блокийн ижил нэртэй мөрийн ӨМНӨ орж, Б-гийн
 *    хадгалаагүй ноорог А-гийн шинэ мөр рүү зөөгддөг байв.
 * ⚠️ ИЖИЛ ЗАМ дотор шинэ мөр нэмэгдсэн бол (`insertAdds` бүлгийн ЭХЭНД оруулдаг)
 *    илүүдлийг ЭХНЭЭС нь алгасна — хуучин мөрүүд СҮҮЛИЙН хэсэгтэйгээ хосолно.
 */
function remapOids(oldRows: readonly SheetRow[], newRows: readonly SheetRow[]): Map<number, number> {
  const keysOf = (rs: readonly SheetRow[]): string[] => {
    const stack: { d: number; k: string }[] = [];
    return rs.map((r) => {
      while (stack.length && stack[stack.length - 1].d >= r.depth) stack.pop();
      const own = `${r.no.trim()} ¦ ${r.work.trim()}`;
      const k = [...stack.map((s) => s.k), own].join(' › ');
      if (r.group) stack.push({ d: r.depth, k: own });
      return k;
    });
  };
  const oldK = keysOf(oldRows);
  const newK = keysOf(newRows);
  const byKey = new Map<string, number[]>();
  newRows.forEach((r, i) => {
    const l = byKey.get(newK[i]);
    if (l) l.push(r.oid); else byKey.set(newK[i], [r.oid]);
  });
  const oldCnt = new Map<string, number>();
  for (const k of oldK) oldCnt.set(k, (oldCnt.get(k) ?? 0) + 1);
  const used = new Map<string, number>();
  const out = new Map<number, number>();
  oldRows.forEach((r, i) => {
    const k = oldK[i];
    const l = byKey.get(k);
    if (!l) return;
    const skip = Math.max(0, l.length - (oldCnt.get(k) ?? 0));
    const n = used.get(k) ?? 0;
    if (skip + n < l.length) { out.set(r.oid, l[skip + n]); used.set(k, n + 1); }
  });
  return out;
}
type AddForm = { no: string; work: string; vol: string; unit: string };
const EMPTY_FORM: AddForm = { no: '', work: '', vol: '', unit: '' };

/** `SheetRow[]` → `PlanRow[]`. `i` нь ЭХ массивын индекс. */
function toPlanRows(rows: SheetRow[], n: number, kind: PlanKind = 'plan'): PlanRow[] {
  const st = (r: SheetRow) => (kind === 'geree' ? r.gStart : r.start);
  const en = (r: SheetRow) => (kind === 'geree' ? r.gEnd : r.end);
  return rows.map((r, i) => ({
    i,
    oid: r.oid,
    no: r.no,
    des: r.des,
    deps: parseDeps(r.ham),
    work: r.work,
    depth: r.depth,
    group: r.group,
    vol: r.vol,
    spans: Array.from({ length: n }, (_, b) => (
      st(r)[b] != null && en(r)[b] != null
        ? { start: st(r)[b] as number, end: en(r)[b] as number }
        : null
    )),
    act: r.act,
    /* ⚠️ Бодит огноо · нөөц (2026-09-23) — `kind`-ээс ХАМААРАХГҮЙ: гэрээ ба
       төлөвлөгөө хоёр таб нэг бодит талбарыг харуулна (баримт нэг л байна). */
    aStart: r.aStart,
    aEnd: r.aEnd,
    hun: r.hun,
    mashin: r.mashin,
  }));
}

/**
 * БҮЛГИЙН БОДИТ ОГНОО ба НӨӨЦ — хүүхдүүдээс (2026-09-23).
 * Бодит эхэлсэн = навчдын MIN, бодит дууссан = навчдын MAX (аль нэг навч
 * дуусаагүй бол `null` — «бүлэг дууссан» гэж худал хэлэхгүй); хүн/техник =
 * навчдын НИЙЛБЭР (нэг ч навч бөглөөгүй бол `null`, 0 БИШ).
 * ⚠️ ЗӨВХӨН ДЭЛГЭЦ — бүлгийн мөрд бичигдэхгүй (`effRow` → popup/зүүн багана).
 */
function aggExtra(rows: readonly PlanRow[], i: number, n: number): {
  aStart: (number | null)[]; aEnd: (number | null)[]; hun: number | null; mashin: number | null;
} {
  const g = rows[i];
  const aStart: (number | null)[] = new Array(n).fill(null);
  const aEnd: (number | null)[] = new Array(n).fill(null);
  const open: boolean[] = new Array(n).fill(false);
  let hun: number | null = null;
  let mashin: number | null = null;
  for (let k = i + 1; k < rows.length && rows[k].depth > g.depth; k += 1) {
    const r = rows[k];
    if (r.group) continue;
    for (let b = 0; b < n; b += 1) {
      const s = r.aStart?.[b] ?? null;
      const e = r.aEnd?.[b] ?? null;
      if (s != null && (aStart[b] == null || s < aStart[b]!)) aStart[b] = s;
      /* ⚠️ Бүртгэлгүй (`s == null`) навч ч бүлгийг НЭЭЛТТЭЙ үлдээнэ (2026-09-23
         аудит) — 10 навчны 1 нь дууссан бол «бүлэг дууссан» гэж гарч байв. */
      if (e == null) open[b] = true;
      if (e != null && (aEnd[b] == null || e > aEnd[b]!)) aEnd[b] = e;
    }
    if (r.hun != null) hun = (hun ?? 0) + r.hun;
    if (r.mashin != null) mashin = (mashin ?? 0) + r.mashin;
  }
  for (let b = 0; b < n; b += 1) if (open[b]) aEnd[b] = null;
  return { aStart, aEnd, hun, mashin };
}

/**
 * Мөрийн НИЙТ муж — хамгийн эрт эхлэх → хамгийн сүүл дуусах. Хуваарьгүй бол `null`.
 * ⚠️ Шүүлт, мөрийн шошго, popup гурвуулаа үүнийг ашиглана — тус тусад нь
 *    бодвол «жагсаалтад орсон ч өөр огноо харуулах» зөрүү үүснэ.
 * ⚠️ ЭКСПОРТЛОГДОХГҮЙ (2026-09-06): энэ файлаас гадуур хэн ч импортлодоггүй.
 */
function rowSpan(r: PlanRow): Span | null {
  let a: number | null = null;
  let z: number | null = null;
  for (const s of r.spans) {
    if (!s) continue;
    if (a == null || s.start < a) a = s.start;
    if (z == null || s.end > z) z = s.end;
  }
  return a == null || z == null ? null : { start: a, end: z };
}

/* ⚠️ `spanOfRef` (бүх блокийн MIN/MAX) 2026-09-23-нд ХАСАГДСАН — зүүн самбарын
   огноо одоо идэвхтэй блокийнх (`refSpanAt`, бүрэлдэхүүн дотор). */


/** Нийтлээгүй засвар: `oid` → блок бүрийн шинэ хуваарь */
type Draft = Map<number, (Span | null)[]>;
/**
 * БОДИТ ОГНООНЫ НООРОГ: `oid` → блок бүрийн { эхэлсэн[], дууссан[] } (2026-09-23).
 * ⚠️ `Draft`-аас ТУСДАА: бодит огноо гинж/`rollUpGroups`/`propagate`-д орохгүй
 *    тул нэг Map-д хийвэл тэр хөдөлгүүрүүд түүнийг ч хөдөлгөнө. Мөрийн БҮХ
 *    блокийн массив (диффийг `save` хийнэ) — `Draft`-тай ижил хэлбэр.
 */
type ADraft = Map<number, { start: (number | null)[]; end: (number | null)[] }>;
/** НӨӨЦИЙН НООРОГ: `oid` → { хүн хүч, машин механизм } (2026-09-23). Мөрийн скаляр. */
type ResDraft = Map<number, { hun: number | null; mashin: number | null }>;

/**
 * Хүснэгтийн мөрийн өндөр (px).
 * ⚠️ Зүүн нэрийн багана ба баруун хуанли ЯГ ЭНЭ өндрөөр эгнэнэ. Аль нэгийг нь
 *    өөрчилвөл мөрүүд гулсаж, «энэ зурвас аль ажлынх нь вэ» гэдэг алдагдана.
 */
const PL_ROW = 30;

/**
 * ЦОНХЛОЛТЫН НӨӨЦ МӨР — харагдах хүрээний дээр/доор нэмж зурах тоо.
 *
 * ⚠️ 2026-09-03-ны хэрэглэгч талын аудит: энэ харагдац 1,266–1,675 мөрийг
 * БҮГДИЙГ нь зурдаг байв — мөр бүрд зүүн самбарын ~6 элемент + зурвас ⇒
 * ~20,000 DOM зангилаа. Чирэх бүрд React бүгдийг дахин тооцоолдог тул
 * «сар» томруулалт дээр зурвас чирэхэд мэдэгдэхүйц гацдаг байлаа.
 * `FillNew`-ийнхтэй ижил загвар: зөвхөн харагдах хүрээг зурна.
 *
 * ⚠️ Мөрийн өндөр ТОГТМОЛ (`PL_ROW`) тул хэмжилт хэрэггүй — `FillNew` дээр
 * мөр нь агуулгаараа сунадаг тул тэнд `rowHRef` хэмждэг.
 */
const PL_OVER = 8;

/**
 * Хоног тутмын өргөн (px) — томруулалт бүрд.
 *
 * ⚠️ 2026-09-01: 34/12/4 байсныг НАРИЙСГАВ (хэрэглэгч: «хугацааны интервалыг
 *    ойртуул, хэтэрхий хол байна»). 12px/хоног үед 7 хоногийн багана 84px
 *    зайтай тул нэг дэлгэцэнд ердөө ~4 сар багтаж, урт хуваарийг харах гэхэд
 *    тасралтгүй гүйлгэх шаардлагатай байв.
 * ⚠️ ДООД ХЯЗГААР нь 6px: түүнээс нарийсвал 1–2 хоногийн ажлын зурвас чирэх
 *    хоёр бариулаасаа нарийн болж, дундуур нь чирж ЗӨӨХ газар үлдэхгүй.
 */
const ZOOM: Record<'day' | 'week' | 'month', number> = { day: 20, week: 7, month: 2.6 };
type Zoom = keyof typeof ZOOM;

/**
 * ⚠️ ӨНГӨ нь ТӨЛӨВЛӨГӨӨ биш ГҮЙЦЭТГЭЛийг илэрхийлнэ: дууссан ногоон, явж
 * буй цэнхэр, хоцорсон улаан, эхлээгүй саарал, хэмжигдээгүй нь ЦАЙВАР
 * ЗУРААСТАЙ — «мэдэхгүй»-г «тэг»-ээс ялгана.
 */
const ST_CLASS: Record<Status, string> = {
  done: h.tlDone, run: h.tlRun, todo: h.tlTodo, late: h.tlLate, none: h.tlNone,
};
/* ⚠️ Утга бүр `tr()`-ээр. Энэ Record нь зөвхөн зураасны `title` дотор
   `${stText(st)}` гэж ордог тул орчуулгын ямар ч зам дайрдаггүй байсан —
   `i18n-extract` ч статик `tr('…')` дуудлага олохгүй тул «ДУТУУ 0» гэж
   худал тайлагнаж, англи горимд ганц энэ tooltip монголоор үлддэг байв. */
/* ⚠️ ФУНКЦ, модуль ачаалахад бодогдох Record БИШ (2026-09-24 аудит): `tr()`
   модуль ачаалах агшинд дуудагдвал хэл солиход орчуулагдахгүй хэвээр үлддэг
   байв — зурагдах бүрд дуудна. */
const stText = (st: Status): string => {
  switch (st) {
    case 'done': return tr('дууссан');
    case 'run': return tr('явж байгаа');
    case 'todo': return tr('эхлээгүй');
    case 'late': return tr('хоцорсон');
    default: return tr('хэмжигдээгүй');
  }
};

type DragMode = 'new' | 'move' | 'l' | 'r';
type Drag = {
  oid: number; mode: DragMode; anchor: number; orig: Span | null;
  /** чирэлтээс өмнөх сарын задаргаа — буцаахад (2026-09-17) */
  origMonths?: Map<string, number> | null;
  /** чирэлтээс өмнөх сарын НӨӨЦ (2026-09-24) — `origMonths`-тай зэрэгцээ */
  origRes?: Map<string, MonthRes> | null;
  /** ⚠️ Чирэлтээс ӨМНӨХ БҮХ мөрийн муж (энэ блок) — цуцлахад гинжээр хөдөлсөн
      хамааралтай мөрүүд ч буцах ёстой (2026-09-23 аудит). */
  snap?: Map<number, Span | null> | null;
  /** ⚠️ Чирэлтээс ӨМНӨХ obDraft/obResDraft (гүехэн хуулбар, 2026-09-24 аудит):
      гинжээр хөдөлсөн мөрийн задаргааг `applyChanges` тайрдаг — цуцлахад муж
      буцдаг ч задаргаа нь буцдаггүй байв. Дотоод Map-ууд солигддог, засагддаггүй
      тул гүехэн хуулбар хангалттай. */
  obSnap?: Map<string, Map<string, number>> | null;
  obResSnap?: Map<string, Map<string, MonthRes>> | null;
};

/* ══════════════════ Үндсэн харагдац ══════════════════ */

/**
 * Тухайн үүргийн хүрээнд энэ багц багтах уу.
 * `null` = хязгааргүй · `[]` = тэр үүргээр хуваарилагдаагүй.
 */
const inScope = (scope: string[] | null, group: string): boolean =>
  scope == null || scope.includes(group);

/**
 * БАТЛАГЧИЙН ХЯНАЛТЫН ГОРИМ (2026-09-25, хэрэглэгч: «илгээсний дараа батлах
 * хэсэг тухайн багцын хуваарийг бүхэлд нь, яг Хуваарь хэсэгт харж байгаа шиг
 * харж батална; гүйцэтгэлтэй адил алийг нь зөвшөөрсөн, алийг нь зөвшөөрөөгүйг
 * гүйцэтгэгч харна»).
 *
 * ⚠️ ТУСДАА ХАРАГДАЦ БИЧЭЭГҮЙ — ЭНЭ бүрэлдэхүүнийг «зөвхөн харах» горимоор
 *    ДАХИН ашиглана. Батлах гинж (`setApproving` → `save()` → `applyUpdates`
 *    → `decidePlan`) болон түүний «бичих зүйлгүй» · «бичилт унасан» салаанууд
 *    ЗӨВХӨН энд байдаг (`HuvaariBatlah.tsx`-ийн толгойн ⚠️) — хуулбарлавал
 *    нэг нь чимээгүй хоцорно.
 * ⚠️ `kind` нь агуулгаас (дараалал `loadPayload`-оор аль хэдийн мэднэ) —
 *    хэрэглэгч энэ илгээлтийг ИЛ сонгосон тул таб зөрөх алдаа утгагүй.
 */
export type HuvaariReview = {
  pkgKey: string;
  oid: number;
  kind: PlanKind;
  /** Шийдвэргүй хаах */
  onClose: () => void;
  /**
   * Шийдвэр (батлах/буцаах) хадгалагдсаны дараа — дараалал дахин уншина.
   * ⚠️ `isErr` (2026-09-25 аудит #5) — алдааг алдаа болж харуулна, мэдээ болж биш.
   */
  onDone: (r: { msg: string; isErr: boolean }) => void;
};

export function Huvaari({
  jump, onJumpDone, review,
}: {
  /** Батлагчийн хяналтын горим — байвал засвар хаалттай, бүтэн дэлгэц */
  review?: HuvaariReview;
  /**
   * «ХУВААРЬ БАТЛАХ» ДАРААЛАЛААС ШИЛЖИЖ ИРСЭН БАТЛАХ ХҮСЭЛТ (2026-09-16).
   *
   * ⚠️ Дараалал нь эх өгөгдөлд БИЧИХГҮЙ (`HuvaariBatlah.tsx`-ийн толгой):
   *    батлах гинж (`save` → `applyUpdates` → `decidePlan`) ЗӨВХӨН энд
   *    байдаг тул товч дарахад тэр багцаар энэ хуудас нээгдэж, шийдвэрлэх
   *    цонх өөрөө гарна.
   * ⚠️ `Portal`-ийн САНАХ ОЙН төлөв — URL ч, `sessionStorage` ч БИШ: тэр
   *    хоёр нь F5-ыг давж, шийдвэрлэгдсэн саналын цонхыг дахин нээх байлаа.
   */
  jump?: { pkgKey: string; oid: number } | null;
  /** Хүсэлтийг НЭГ л удаа хэрэглэсний дараа цэвэрлэнэ */
  onJumpDone?: () => void;
} = {}) {
  const { user, status } = useAuth();
  /* ⚠️ Хуваарийн хуваарилалт ӨӨРИЙН хадгалалттай — түүнд захиалахгүй бол
     админы өөрчлөлт энэ хуудсанд хүрэхгүй. */
  const [hvN, setHvN] = useState(0);
  useEffect(() => subscribeHuvaariAcl(() => setHvN((x) => x + 1)), []);
  const [pkg, setPkg] = useState<Pkg>(
    () => (review ? PKGS.find((p) => p.key === review.pkgKey) : undefined) ?? PKGS[0],
  );
  /**
   * БҮХ БАГЦ ХАРАГДАНА — ХАРАХ нь ЗАСАХААС ТУСДАА (2026-09-09).
   *
   * ⚠️ ХАРАГДАЦЫН ЭРХ (`views`) нь «юуг ХАРАХ», ACL хуваарилалт нь «юуг
   *    ЗАСАХ» гэсэн ХОЁР ӨӨР асуулт. Порталын бусад бүх модуль (Газар ·
   *    Санхүү · Дэд бүтэц · Зөвшөөрөл) яг ийм: `hasCap` нь ЗӨВХӨН товч
   *    идэвхжүүлэхэд хэрэглэгддэг, өгөгдөл нь бүгд харагдана.
   *
   * ⚠️ УРЬД НЬ багцын сонгогчийг хуваарилалтаар ШҮҮДЭГ байв. 2026-09-07-нд
   *    би `guitsetgelAcl.bagtsScope` → `huvaariScope` болгож зассан — тэр нь
   *    зөв (урсгалын томилгоо хуваарийн эрх өгөх ёсгүй) ГЭВЧ хажуугийн үр
   *    дагаврыг анзаараагүй: хуучин `bagtsScope` нь томилогдоогүй хүнд `null`
   *    (=бүх багц) буцаадаг байсан бол `huvaariScope` нь fail-closed `[]`.
   *    Үр дүнд хуваарилагдаагүй хүнд сонгогч ХООСОН болж, доорх «зөвхөн
   *    харна» гэсэн баннер ХУДАЛ амлалт болов — харах зүйл үлдээгүй.
   *
   * ⚠️ Хүрээ нь `canEdit`/`canApprove` дээр ХЭВЭЭР үйлчилнэ (доор) — өөрийн
   *    багцаас гадуур зөвхөн УНШИНА. Аюулгүй байдал сулраагүй: бичих зам
   *    бүр (`onDown` · `applyModal` · `save` · `decidePlan`) тэдгээрээр
   *    хаагдсан хэвээр.
   *
   * ⚠️ 2026-09-15 (хэрэглэгчийн шууд шаардлага): ЭНЭ ШИЙДВЭР ХУМИГДАВ.
   *    «Багц хуваарилсан аккаунт өөрийн багцаас БУСДЫГ харж байна» — тэр нь
   *    буруу. Дээрх 2026-09-09-ний засвар нь `huvaariScope` fail-closed
   *    болсноос үүдсэн ХАЖУУГИЙН үр дагаврыг (хуваарилагдаагүй хүнд сонгогч
   *    хоосон болох) нөхөх түр шийдэл байсан бөгөөд хэт өргөн болсон байв.
   *
   *    ОДООГИЙН ДҮРЭМ:
   *      · хуваарилалт БАЙХГҮЙ (`[]`, аль ч үүрэгт)  → БҮХ багц (харах эрх
   *        нь `views`-ээр аль хэдийн шийдэгдсэн; сонгогч хоосон болохгүй)
   *      · хуваарилалт БАЙГАА                        → ЗӨВХӨН өөрийн багц
   *      · `null` (хязгааргүй)                       → БҮХ багц
   *
   *    Хоёр үүргийн НЭГДЭЛ: зохиогч Багц 3-т, батлагч Багц 5-д томилогдсон
   *    хүн хоёуланг нь харна — эс бөгөөс батлах ажлаа хийж чадахгүй.
   */
  const groupOpts = useMemo(() => {
    if (status === 'off') return PKG_GROUPS;
    const a = huvaariScope(user?.username, 'author');
    const b = huvaariScope(user?.username, 'approver');
    /* ⚠️ `null` нь ХЯЗГААРГҮЙ — аль нэг үүрэг нь хязгааргүй бол бүгд */
    if (a == null || b == null) return PKG_GROUPS;
    const mine = new Set([...a, ...b]);
    /* ⚠️ Хоёр үүрэгт ч томилогдоогүй бол ХУМИХГҮЙ (дээрх ⚠️) */
    if (mine.size === 0) return PKG_GROUPS;
    const list = PKG_GROUPS.filter((g) => mine.has(g));
    /* ⚠️ Томилгоо нь одоо байхгүй багцыг заасан (нэр солигдсон) бол сонгогч
       хоосорно — тэр үед бүгдийг үзүүлнэ, эс бөгөөс хуудас ашиглагдахгүй. */
    return list.length ? list : PKG_GROUPS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, status, hvN]);
  /**
   * ЗАСАХ ЭРХ — тусад нь олгодог (`caps`) + багцын хүрээ.
   * ⚠️ Нэг огноо солиход БҮХ багцын төлөвлөгөөт хувь, тайлан, хоцрогдлын
   *    дохио дахин бодогдоно. Бөглөх эрхэд дагалдуулж болохгүй: бөглөгч
   *    өөрийн хоцрогдлыг арилгахын тулд хуваарийг хойш чирэх боломжтой болно.
   */
  /**
   * ⚠️ `pending` нь ЭНД ОРОХГҮЙ — түгжээ нь `canEdit`-д БИШ (доорх `locked`).
   *    Учир нь БАТЛАХ явцад агуулгыг ноорогт буулгаад `save`-ээр бичдэг тул
   *    тэр агшинд түгжээ асуулаа бол батлагдсан хуваарь өөрөө бичигдэхгүй.
   */
  /* ⚠️ ХЯНАЛТЫН ГОРИМД (`review`) ЗАСВАР ХААЛТТАЙ — батлагч саналыг ХАРНА,
     өөрчлөхгүй. `save()` нь `canEdit`-ийг шалгадаггүй тул батлах гинж хэвээр
     ажиллана (агуулга ноорогт буугаад бичигдэнэ). */
  const canEdit = useMemo(
    () => !review && (status === 'off' || inScope(huvaariScope(user?.username, 'author'), pkg.group)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, status, hvN, pkg.group, review],
  );

  /**
   * БАТЛАХ ЭРХ — `plan`-аас ТУСДАА (2026-09-07).
   * ⚠️ Зохиогч өөрийгөө батлахаас хамгаалах ганц шалгуур нь UI БИШ,
   *    `decidePlan` дотор — хоёр эрхийг нэг хүнд олговол товч идэвхтэй болно.
   */
  const canApprove = useMemo(
    () => status === 'off' || inScope(huvaariScope(user?.username, 'approver'), pkg.group),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, status, hvN, pkg.group],
  );

  /**
   * МӨР НЭМЭХ ЭРХ (2026-09-24, FillNew-ээс шилжсэн) — `addRow` эрх + нэмэлт
   * ажлын ЗАСВАРЛАГЧИЙН хүрээ (`ajilAcl`, `null` = хязгааргүй).
   * ⚠️ Хуваарийн `canEdit`-ээс ТУСДАА: огноо тавих ба гэрээнд ажил нэмэх нь
   *    өөр өөр хариуцлага. Админ (`super`) ч `addRow` эрхээ панелаас ил асаана
   *    (FillNew-ийн 2026-09 дүрэм) — хүрээ л түүнд үл хамаарна.
   */
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  const [ajN, setAjN] = useState(0);
  useEffect(() => subscribeAjilAcl(() => setAjN((x) => x + 1)), []);
  const canAddRow = useMemo(() => {
    if (review) return false;
    if (!hasCap(user?.username, 'addRow')) return false;
    if (status === 'off' || roleForUser(user?.username) === 'super') return true;
    const sc0 = ajilScope(user?.username, 'editor');
    return sc0 === null || sc0.includes(pkg.group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, status, capN, ajN, pkg.group, review]);

  /**
   * ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТ — байвал хуваарь ТҮГЖИГДЭНЭ.
   * ⚠️ Хоёр санал зэрэг хүлээвэл батлагч алийг нь батлахаа мэдэхгүй, мөн
   *    хоёулаа батлагдвал сүүлийнх нь өмнөхийг чимээгүй дарна.
   */
  const [pending, setPending] = useState<PlanSubmission | null>(null);
  /** Батлах хүснэгт бэлэн эсэх — үгүй бол шалтгааныг ИЛ хэлнэ, чимээгүй нуухгүй */
  const [flowReady, setFlowReady] = useState<boolean | null>(null);
  /**
   * БЭЛЭН БИШ БОЛ ЯАГААД — баннерт ЯГ энэ шалтгааныг бичнэ (2026-09-11).
   * ⚠️ Урьд нь гурван огт өөр шалтгаан нэг мессеж болж нийлдэг байсан тул
   *    админ юу засахаа мэдэхгүй байв.
   */
  const [flowWhy, setFlowWhy] = useState<string>('');
  /**
   * СҮҮЛИЙН ШИЙДВЭР — хүлээгдэж буй илгээлт байхгүй үед харуулна.
   *
   * ⚠️ БУЦААСАН ШАЛТГААНЫГ гүйцэтгэгчид ХҮРГЭХ цорын ганц зам. Үүнгүй бол
   *    буцаалт нь чимээгүй алга болж, гүйцэтгэгч юуг засахаа мэдэхгүй хэвээр
   *    дахин ижил хуваарь илгээнэ — «шалтгаан заавал» гэсэн дүрэм утгагүй
   *    болно (2026-09-07-ны шалгалтаар илэрсэн).
   */
  const [lastDecision, setLastDecision] = useState<PlanSubmission | null>(null);
  /** Илгээх/шийдвэрлэх цонх */
  /* `reject` — хяналтын горимын буцаах цонх (2026-09-25) */
  const [flowBox, setFlowBox] = useState<'send' | 'decide' | 'reject' | null>(null);
  /**
   * Цонхны ТАЙЛБАР/ШАЛТГААНЫ текст — ЭЦЭГТ (2026-09-23). ⚠️ `FlowBox` дотор
   *    байсан тул ард нь дарж/Esc-ээр хаахад бичсэн шалтгаан устдаг байв.
   *    Зөвхөн илгээлт/шийдвэр АМЖИЛТТАЙ болоход л цэвэрлэнэ.
   */
  const [flowTxt, setFlowTxt] = useState('');
  /**
   * БАТЛАХ ЯВЦАД — батлагдаж буй илгээлтийн `oid`.
   * ⚠️ `save` нь ноорогийг React төлөвөөс уншдаг тул агуулгыг буулгасны ДАРАА,
   *    дараагийн зурагдалтад бичилтийг гүйцэтгэнэ (`useEffect` доор).
   */
  const [approving, setApproving] = useState<number | null>(null);
  /**
   * УРЬДЧИЛАН ХАРАХ — илгээгдсэн хуваарийг хуанли дээр НООРОГ болгон буулгав уу.
   *
   * ⚠️ Үүнгүй бол батлагч «14 мөр» гэсэн тоо л хараад ХАРААГҮЙ зүйлээ батлана.
   *    Санал нь ноорог болж буусан үед хуанли дээр өөрчлөлт нь ЯГ адилхан
   *    (`h.rowDirty`) тодорно — батлагч юуг зөвшөөрч буйгаа нүдээр харна.
   *
   * ⚠️ Урьдчилан харах нь ЭХ ХУУДСАНД ЮУ Ч БИЧИХГҮЙ: ноорог нь зөвхөн санах
   *    ойд. Батлахгүйгээр хуудсаа сэргээвэл ул мөргүй арилна.
   */
  const [previewing, setPreviewing] = useState(false);
  /** `previewing`-ийн одоогийн утга — async урсгалд уншихад (2026-09-25) */
  const previewingRef = useRef(previewing);
  useEffect(() => { previewingRef.current = previewing; }, [previewing]);
  /**
   * ЗЭРЭГЦЭЭ ӨӨРЧЛӨЛТӨӨР урьдчилан харалт УНАСАН илгээлтийн `oid` (2026-09-25 аудит #1).
   * ⚠️ Тэр үед `previewing` худал хэвээр тул хяналтын «Буцаах» ч хаалттай болж
   *    илгээлт мөнхөд гацдаг байв — ийм илгээлтийг БУЦААХ ёстой (`conflictMsg`).
   */
  const [previewBad, setPreviewBad] = useState<number | null>(null);
  /**
   * БАТЛАГЧИЙН ЗӨВШӨӨРСӨН мөр (хяналтын горим) — `Guitsetgel.okKeys`-ийн загвар.
   * ⚠️ Бүгд ногоон болтол «Батлах» ХААЛТТАЙ (гүйцэтгэлийн дүрэм); буцаахад
   *    энэ жагсаалт хадгалагдаж гүйцэтгэгчид улаан/ногоон болж харагдана.
   */
  const [okRows, setOkRows] = useState<Set<number>>(new Set());
  /**
   * ГҮЙЦЭТГЭГЧИЙН ТАЛ — буцаагдсан саналыг ноорогт буулгасны дараах тэмдэглэгээ.
   * `oid` = тэр илгээлт; `ok` = батлагчийн зөвшөөрсөн мөрүүд. Бусад өөрчлөгдсөн
   * мөр улаан (засах ёстой). Дахин илгээх, багц/төрөл солиход арилна.
   */
  /* ⚠️ `pay` — БУЦААГДСАН САНАЛЫН агуулга (2026-09-25 аудит #3): тэмдгийг зөвхөн
     саналд байсан мөрд, утга нь саналтайгаа ИЖИЛ хэвээр байхад л тавина.
     Гүйцэтгэгч засмагц (эсвэл шинэ мөр хөндмөгц) мөр саармаг болно. */
  const [backMarks, setBackMarks] = useState<{ oid: number; ok: Set<number>; pay: PlanPayload } | null>(null);

  /**
   * ЗАСВАР ТҮГЖИГДСЭН ҮҮ — хүлээгдэж буй илгээлт байхад ГАРААР засахгүй.
   *
   * ⚠️ ЯАГААД ЗААВАЛ ТҮГЖИХ ЁСТОЙ ВЭ: түгжихгүй бол гүйцэтгэгч чирж засаад
   *    ноорог хуримтлуулна, гэтэл «Батлуулах» товч нь `!pending` нөхцөлтэй
   *    тул ХАРАГДАХГҮЙ — хийсэн ажил нь ГАРАХ ЗАМГҮЙ үлдэж, багц солиход
   *    чимээгүй устана. Мөн батлагдсан агшинд серверийн хуваарь солигдох тул
   *    тэр ноорог хуучин мөрийн дугаарт наалдана.
   *
   * ⚠️ БАТЛАХ ЯВЦАД (`approving`) түгжээг ТАВИНА — тэр үед агуулгыг ноорогт
   *    буулгаж `save`-ээр бичих ёстой.
   */
  const locked = pending != null && approving == null;

  /**
   * ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТ нь ӨӨРИЙНХ ҮҮ (2026-09-08).
   * ⚠️ Зөвхөн ХАРАГДАЦЫН тэмдэглэгээ — жинхэнэ хаалт нь `decide`-д (бичихээс
   *    өмнө) ба `decidePlan`-д. Гурвуулаа НЭГ дүрэм: нэр нь жижиг үсгээр,
   *    цэвэрлэгдсэн байдлаар харьцуулагдана.
   */
  const isOwnSubmission = useMemo(() => {
    const me = (user?.username ?? '').trim().toLowerCase();
    return !!pending && !!me && me === pending.author.trim().toLowerCase();
  }, [pending, user]);

  const [sc, setSc] = useState<Schema | null>(null);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [busy, setBusy] = useState(false);

  /* ── НЭМЭЛТ АЖИЛ (2026-09-24; модулийн `tmpOid`-ийн ⚠️) ── */
  /**
   * Нэмсэн мөр — БАГЦЫН ТҮЛХҮҮРТЭЙ ХАМТ хадгална.
   * ⚠️ ЯАГААД: `[adds, pkg.key]`-д хадгалах эффект нь багц солигдох агшинд
   *    ӨМНӨХ багцын мөрийг ШИНЭ багцын LS түлхүүрт бичих байсан (эффектүүд нэг
   *    commit-д, төлөв хоцорно). Түлхүүр нь мөртэй хамт явбал тэр зөрүү үүсэхгүй.
   */
  const [addsSt, setAddsSt] = useState<{ key: string; list: NewRow[] }>({ key: '', list: [] });
  const adds = addsSt.key === pkg.key ? addsSt.list : EMPTY_ADDS;
  const setAdds = useCallback((fn: (prev: NewRow[]) => NewRow[]) => {
    setAddsSt((st) => ({ key: pkg.key, list: fn(st.key === pkg.key ? st.list : []) }));
  }, [pkg.key]);
  useEffect(() => { if (addsSt.key === pkg.key) writeAdds(pkg.key, addsSt.list); }, [addsSt, pkg.key]);
  /** Маягт нээлттэй байгаа БҮЛГИЙН oid */
  const [addFor, setAddFor] = useState<number | null>(null);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_FORM);
  /** Хүлээгдэж буй нэмэлт ажлын илгээлт — БҮХ хүнд харагдана */
  const [ajSub, setAjSub] = useState<AjilSubmission | null>(null);
  const [ajBusy, setAjBusy] = useState(false);
  const [ajErr, setAjErr] = useState('');
  const [ajNote, setAjNote] = useState('');
  /** Буцаагдсан — зохиогчид шалтгаантай нь */
  const [ajBack, setAjBack] = useState<{ n: number; by: string; reason: string } | null>(null);
  /** Батлагдсан ч үндсэн хүснэгтэд буугаагүй илгээлтийн тоо (буулгалт унасан) */
  const [ajStuck, setAjStuck] = useState(0);
  /**
   * Батлагдаж хуудсанд орсон ч ХАДГАЛААГҮЙ ноорогтой тул автоматаар
   * шинэчлээгүй — «Шинэчлэх» товч хүлээж байна (2026-09-24 аудит #1).
   */
  const [ajApplied, setAjApplied] = useState(false);
  /**
   * АЖИГЛАЖ БУЙ илгээлт — хүлээгдэхээ больсон ч «Буулгасан» болоогүй (2026-09-25 аудит).
   * ⚠️ `refreshAjil` илгээлт `pending`-ээс гармагц `ajSub`-ийг `null` болгодог тул
   *    `materializeAdds` 500-аар багцалж бичих хэдэн секундийн завсарт санал асуулга
   *    таарвал 30 с-ийн мөчлөг ЗОГСОЖ, «хараахан буугаагүй» мэдэгдэл мөнхөд үлдэж,
   *    шинэ мөрүүд хэзээ ч татагдахгүй байв. `approved` хэвээр байхад үргэлжлүүлнэ.
   */
  const [ajTrack, setAjTrack] = useState<number | null>(null);
  /** `adds`-ын одоогийн утга — async урсгалд синхрон уншихад (LS-д шууд бичих) */
  const addsStRef = useRef(addsSt);
  useEffect(() => { addsStRef.current = addsSt; }, [addsSt]);
  /**
   * БҮТЭН ДЭЛГЭЦ — ЗӨВХӨН хуваарийн хүснэгт (2026-09-17, хэрэглэгч: «Гүйцэтгэл
   * бөглөх»-ийнхтэй адил). `FillNew`-ийн `wide`-тай ИЖИЛ загвар: хөтчийн
   * `requestFullscreen` БИШ, `position: fixed` давхарга — дотоод цонх (popup
   * хуанли, батлах асуулт) хэвээр ажиллана. Сешн хооронд санагдана.
   */
  const [wide, setWide] = useState(() => {
    try { return localStorage.getItem('selbe-huvaari-wide') === '1'; } catch { return false; }
  });
  /*
   * ОГНОО · НӨӨЦИЙН БАГАНЫГ ХУРААХ (2026-09-23, хэрэглэгч: «энэ хэсгийг хурааж
   * нээдэг байж болох уу»). Хураахад «Гэрээ эхлэх … Техник» 10 багана нуугдаж,
   * зүүн самбар нарийсч хуанлид зай өгнө; код · нэр · хамаарал үлдэнэ.
   * ⚠️ Анхдагч нь НЭЭЛТТЭЙ — хэрэглэгч багануудыг шаардаж нэмүүлсэн тул
   *    анх удаа нээхэд нуугдсан байж болохгүй. Сешн хооронд санагдана.
   */
  const [cols, setCols] = useState(() => {
    try { return localStorage.getItem('selbe-huvaari-cols') !== '0'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('selbe-huvaari-cols', cols ? '1' : '0'); } catch { /* хаалттай орчин */ }
  }, [cols]);
  useEffect(() => {
    try { localStorage.setItem('selbe-huvaari-wide', wide ? '1' : '0'); } catch { /* хаалттай орчин */ }
  }, [wide]);
  /* ⚠️ ХЯНАЛТЫН ГОРИМ ҮРГЭЛЖ БҮТЭН ДЭЛГЭЦ (хэрэглэгчийн сонголт) — хэрэглэгчийн
     `wide` тохиргоог ХӨНДӨХГҮЙ (LS-д бичихгүй), зөвхөн зурагдалтад. */
  const isWide = !!review || wide;
  const isReview = !!review;
  const reviewCloseRef = useRef(review?.onClose);
  reviewCloseRef.current = review?.onClose;
  /* ⚠️ БАТЛАХ ЯВЦАД Esc ХААХГҮЙ (2026-09-25 аудит): «Хаах» товч `busy`/`approving`
     үед хаалттай ч Esc нь хаадаг байсан — `save()` эх хуудсанд бичиж дуусаад
     `decidePlan` дуудах эффект салгагдсан бүрэлдэхүүнд ажиллахгүй тул хуваарь
     бичигдсэн атлаа илгээлт `pending` хэвээр үлдэнэ. Ref-ээр — эс бөгөөс
     сонсогч `busy` хөдлөх бүрд дахин бүртгэгдэж диалогийнхаас ХОЙНО орно. */
  const escBlockRef = useRef(false);
  escBlockRef.current = busy || approving != null;
  useEffect(() => {
    if (!isWide) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      if (isReview) { if (!escBlockRef.current) reviewCloseRef.current?.(); } else setWide(false);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [isWide, isReview]);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const [draft, setDraft] = useState<Draft>(new Map());
  /**
   * УЯЛДААНЫ НООРОГ: `oid` → «18FS3,…» текст. Огнооны ноорогтой (`draft`)
   * ЗЭРЭГЦЭЭ тусдаа — уялдаа нь огноо хөндөлгүй өөрчлөгдөж болно (мөн эсрэгээр).
   * Хадгалахад хоёулаа нэг `applyUpdates`-д нийлнэ.
   */
  const [ham, setHam] = useState<Map<number, string>>(new Map());
  /**
   * БОДИТ ОГНОО ба НӨӨЦИЙН ноорог (2026-09-23) — `draft`/`ham`-тай ЗЭРЭГЦЭЭ,
   * тусдаа. Хадгалахад бүгд нэг `applyUpdates`-д, батлуулахад нэг payload-д
   * нийлнэ (`actual`/`res`). Popup-аас л засагдана (зүүн багана зөвхөн харуулна).
   */
  const [aDraft, setADraft] = useState<ADraft>(new Map());
  const [resDraft, setResDraft] = useState<ResDraft>(new Map());
  /* ⚠️ Сонгосон мөрийн OID (2026-09-25 аудит) — `PlanRow.i` БИШ: нэмэлт мөр орох/гарах,
     шинэ жааз татагдахад индекс шилжиж өөр мөр тодордог байв. */
  const [sel, setSel] = useState<number | null>(null);

  /* ══════ САРЫН ОБЬЁМ (тусдаа үйлчилгээ, `huvaariObyem.ts`) ══════ */
  /** Хадгалагдсан задаргаа — ажлын код → блок → сар → обьём */
  const [obPlan, setObPlan] = useState<PkgPlan>(new Map());
  /**
   * Задаргааны АЧААЛЛЫН ТӨЛӨВ (2026-09-24) — хуваалцсан ноорогийн суурьт.
   * ⚠️ `loadPkgPlan` нь мөрүүдээс ТУСДАА promise тул `rows` ирсэн атлаа
   *    `obPlan` хоосон агшин бий; тэр үед сарын нүдийг тулгавал бүгд
   *    «хуучирсан» болно. `loading` үед ноорогийн сэргээлт ба дифф зогсоно;
   *    `fail` = задаргаагүй үргэлжилнэ (сарын суурь мэдэгдэхгүй).
   */
  const [obState, setObState] = useState<'loading' | 'ok' | 'fail'>('loading');
  /** `dkey → ObjectID` — бичихэд аль мөрийг шинэчлэхийг мэдэхэд */
  const [obOids, setObOids] = useState<Map<string, number>>(new Map());
  /**
   * ДАВХАРДСАН мөрийн ИЛҮҮДЭЛ OID-ууд (2026-09-08).
   * ⚠️ `dkey`-д сангийн unique индекс АЛГА тул зэрэг хадгалалт ижил
   *    түлхүүртэй хоёр мөр үүсгэж чадна. Апп дотор нь ганц утга харагддаг
   *    учир нүдээр илрэхгүй ч Excel/ArcGIS Pro-д обьём давхар тоологдоно.
   *    Дараагийн бичилтэд `deletes`-т нийлүүлж чимээгүй арилгана.
   */
  const [obDups, setObDups] = useState<number[]>([]);
  /**
   * ХАДГАЛААГҮЙ задаргаа — `${ажлын код}|${блок}` → сар → обьём.
   * ⚠️ Огнооны ноорог (`draft`) ба уялдааны ноорог (`ham`)-той ЗЭРЭГЦЭЭ,
   *    тусдаа: обьём нь огноо хөндөлгүй өөрчлөгдөж болно (мөн эсрэгээр).
   *    Гурвуулаа нэг «Хадгалах»-д нийлнэ.
   */
  const [obDraft, setObDraft] = useState<Map<string, Map<string, number>>>(new Map());
  /**
   * САРЫН НӨӨЦ — хүн хүч · машин механизм (2026-09-24, хэрэглэгч: «сар бүрд
   * обьём · хүн хүч · машин механизм»). `obPlan`/`obDraft`-тай ЗЭРЭГЦЭЭ, тусдаа
   * Map (`${код}|${блок}` → сар → {hun, mashin}) — обьёмын утгын хэлбэр
   * хөндөгдөхгүй (`huvaariObyem.ts`-ийн `MonthRes` тайлбар). Хадгалахад
   * мөрийн `hun_huch`/`mashin_mehanizm` = бүх блок · сарын НИЙЛБЭР.
   */
  const [obRes, setObRes] = useState<PkgRes>(new Map());
  const [obResDraft, setObResDraft] = useState<Map<string, Map<string, MonthRes>>>(new Map());
  /** Сарын хүснэгтэд нөөцийн талбар БАЙНА УУ — `null` = мэдэхгүй (бичихийг оролдоно) */
  const [obResFields, setObResFields] = useState<{ hun: boolean | null; mashin: boolean | null }>({ hun: null, mashin: null });
  useEffect(() => { void obyemResFields().then(setObResFields); }, []);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  /**
   * ХАРАГДАХ ТҮВШИН — «Түвшин 1 2 3 4 5» зурвасын идэвхтэй товч.
   *
   * ⚠️ `Finance`-ийн «Гэрээний бүртгэл» хуудасны ЯГ ИЖИЛ загвар (хэрэглэгчийн
   *    шаардлага, 2026-09-15): нэг порталд нэг үүрэгтэй хоёр өөр хэлбэр
   *    байх ёсгүй. Тэнд `lvl` нь 1–5, `setLevel` нь эвхэлтийг бөөнөөр тавьдаг.
   *
   * ⚠️ `0` = «холимог»: хэрэглэгч ГАРААР нэг бүлэг эвхсэн бол аль ч товч
   *    тодрохгүй — дэлгэц дээрх байдалтай зөрчилдсөн тодруулга үлдэх ёсгүй
   *    (`Finance.lvOn`-ийн ижил ⚠️).
   *
   * ⚠️ АНХДАГЧ нь ХАМГИЙН ГҮН (бүх мөр дэлгээтэй) — хуваарь нь ажил тус бүрийн
   *    огноог ЗАСАХ хуудас тул хаалттай эхлэх нь ажлыг нэмэгдүүлнэ.
   */
  const [lvl, setLvl] = useState(0);
  /**
   * Popup хуанли нээгдсэн мөрийн OID.
   * ⚠️ 2026-09-25 аудит: урьд нь `PlanRow.i` (индекс) байсан тул 30 с-ийн мөчлөг
   *    батлагдсан нэмэлт мөрийг оруулахад индекс шилжиж, «Тавих» ӨӨР ажилд бичдэг байв.
   */
  const [modal, setModal] = useState<number | null>(null);

  /**
   * ШҮҮЛТҮҮР. `filter` нь түргэн таб, бусад нь сонголт.
   * ⚠️ Тусдаа талбар болгосон шалтгаан: хэрэглэгч «хоцорсон, урт, 2026 онд
   *    эхлэх» гэж ХОСЛУУЛЖ шүүнэ. Нэг радио жагсаалт байсан бол зөвхөн нэгийг.
   */
  const [filter, setFilter] = useState<'all' | 'has' | 'none' | 'partial'>('all');
  const [fYear, setFYear] = useState('all');
  /**
   * БҮЛГЭЭР ШҮҮХ — сонгосон бүлэг ба ДОТОРХ бүх ажлыг л үлдээнэ.
   * ⚠️ Утга нь `PlanRow.i` (эх массивын индекс), `oid` БИШ: ижил нэртэй
   *    бүлэг олон байж болох ба индекс нь модны байрлалыг ч заана.
   * ⚠️ 2026-09-25-нд ЭРГҮҮЛСЭН — утга нь бүлгийн OID. OID ч мөр бүрд давтагдашгүй
   *    (ижил нэртэй бүлгийг ялгана), харин индекс нь нэмэлт мөр бүлгийн эхэнд
   *    орох/хасагдахад шилжиж, багц солиход ч үлдэж ӨӨР салбарыг шүүдэг байв.
   */
  const [fGrp, setFGrp] = useState<'all' | number>('all');

  /* ── Хуанлийн төлөв ── */
  /* ⚠️ АНХДАГЧ нь «сар» (2026-09-02, хэрэглэгч). Хуваарь 2025–2028 оныг
     дамждаг тул «7 хоног» (7px/хоног) дээр нээхэд ~1,035 хоног нь 7,000px
     болж, нэг дэлгэцэнд ердөө 3–4 сар багтана — хүн эхлээд БҮТЭН зургийг
     хармаар байдаг. «сар» (2.6px/хоног) дээр бүхэл төсөл нэг дэлгэцэнд
     ойролцоогоор багтана; нарийвчлах бол товчоор томруулна. */
  /**
   * ХУВААРИЙН ТӨРӨЛ — «Төлөвлөгөө» эсвэл «Гэрээ» (2026-09-11).
   *
   * ⚠️ Солиход НООРОГ ЦЭВЭРЛЭГДЭНЭ (доорх эффект): ноорог нь `oid` →
   *    блокийн муж гэсэн хэлбэртэй бөгөөд аль төрлийнх болох нь тэмдэглэгдэх
   *    газаргүй. Цэвэрлэхгүй бол төлөвлөгөөнд зассан огноо гэрээний талбарт
   *    бичигдэнэ — чимээгүй, эргүүлэх аргагүй.
   */
  const [kind, setKind] = useState<PlanKind>(review?.kind ?? 'plan');

  /**
   * ЛАВЛАГАА ХАРАГДАХ ЭСЭХ — нөгөө төрлийн зурвас (2026-09-11, хэрэглэгч:
   * «дангаар нь харах бол гэрээ төлөвлөгөө дээр дарж идэвхжүүлдэг болго»).
   *
   * ⚠️ `kind` нь ЗАСАХ төрөл, энэ нь ХАРАХ асаалт — хоёр өөр зүйл. Засвар,
   *    ноорог, хадгалалт, батлалт бүгд `kind`-ээс л хамаарна; энэ асаалт
   *    юу ч бичдэггүй. Эс бөгөөс нэг ноорогт хоёр төрөл холилдоно.
   * ⚠️ Анхдагчаар УНТРААЛТТАЙ: дангаар нь харах нь үндсэн байдал, зэрэг
   *    харахыг «Зэрэг» товчоор ил асаана.
   */
  const [showRef, setShowRef] = useState(false);
  const [zoom, setZoom] = useState<Zoom>('month');
  const [blk, setBlk] = useState(0);
  /* ⚠️ АНХДАГЧ 0 (2026-09-24): олон блок сонгоход бүгдэд ИЖИЛ огноо тавина —
     хэрэглэгчийн сонголт; >0 бол блок бүр алхмаар хойшилно (хуучин зан). */
  const [takt, setTakt] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  /**
   * ХАМААРЛЫГ ШУГАМААР ХОЛБОХ (2026-09-22, хэрэглэгч: «бар хооронд шугам чирж
   * хамаарал шууд холбоно»). Зурвасын баруун захын бариулаас чирж эхлээд нөгөө
   * АЖЛЫН мөр дээр тавихад тэр мөр энэ ажлаас FS (лаг 0) хамаардаг болно.
   * ⚠️ Шалгуур (дугуй, өвөг/удам, түгжээ) — `applyModal`-д ганц газар; энд
   *    зөвхөн зорилтыг олж дамжуулна. `i` = урд ажлын `plan` индекс, `x/y` =
   *    `.plLanes`-ийн дотоод координат (түр шугамын үзүүр).
   */
  const [link, setLink] = useState<{ i: number; x: number; y: number } | null>(null);
  const lanesRef = useRef<HTMLDivElement | null>(null);
  /** Холбосны дараах цонх — төрөл (FS/SS) ба хоног асууна (2026-09-22, хэрэглэгч). `si` урд, `ti` хамаарагч. */
  /**
   * ⚠️ `dblk` (2026-09-24) — уялдааны БЛОК: `number` = зөвхөн тэр блок, `null` =
   *    бүх блок (блокгүй бичиглэл). Чирж холбоход ИДЭВХТЭЙ блок (синтетик ганц
   *    блоктой багцад `null` — `@` гарахгүй); сум дээр дарахад тэр сумны уялдааных.
   */
  /* ⚠️ `so`/`to` — урд · хамаарагч мөрийн OID (2026-09-25 аудит, индекс шилжихээс) */
  const [linkAsk, setLinkAsk] = useState<{ so: number; to: number; dblk: number | null } | null>(null);
  /** Popup/холбох цонх нээлттэй эсэх — async урсгалд (`refreshAjil`, 2026-09-25) */
  const uiOpenRef = useRef(false);
  useEffect(() => { uiOpenRef.current = modal != null || linkAsk != null; }, [modal, linkAsk]);
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
  } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const jumped = useRef(false);
  /**
   * Чирэлт хамгийн сүүлд ЯМАР ХОНОГ дээр байсан.
   * ⚠️ `pointermove` секундэд ~60 удаа ирнэ, харин хоног нь зөвхөн багана
   *    (4–34px) давахад л солигдоно. Хоног солигдоогүй бол ажил хийхгүй —
   *    эс тэгвээс 1,266 мөрийн тооцоо кадр бүрд дахин бодогдоно.
   */
  const lastDay = useRef(-1);
  /** Товшилт vs чирэлт */
  const moved = useRef(false);

  /*
   * ⚠️ Сонгосон багц хүрээнээс ГАДУУР бол зөвшөөрөгдсөн эхнийх рүү шилжинэ
   *    — эс бөгөөс хэрэглэгч засах эрхгүй хуудас ширтэнэ. Хадгалаагүй
   *    ноорогтой үед хөндөхгүй (`askSwitch`-ийн дүрэм).
   */
  useEffect(() => {
    /* ⚠️ `obDraft` ч ноорог (2026-09-24) — түүнгүйгээр сарын задаргаа л зассан үед асуулгүй солигдож байв */
    /* ⚠️ Хяналтын горимд багц ТОГТМОЛ — дарааллаас сонгосон илгээлтийнх. */
    if (review) return;
    if (groupOpts.includes(pkg.group) || draft.size || ham.size || aDraft.size || resDraft.size || obDraft.size || obResDraft.size || !groupOpts.length) return;
    const first = pkgFloors(groupOpts[0])[0];
    if (first) setPkg(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupOpts]);

  useEffect(() => {
    let alive = true;
    setBusy(true); setErr(''); setRows([]); setSc(null);
    setDraft(new Map()); setHam(new Map()); setSel(null); setCollapsed(new Set()); setModal(null);
    /* ⚠️ Бүлгийн шүүлт · холбох цонх ч багцынх (2026-09-25 аудит) */
    setFGrp('all'); setLinkAsk(null);
    setADraft(new Map()); setResDraft(new Map());
    /* ⚠️ Түвшний товчийг ч тэглэнэ — багц бүр ӨӨР гүнтэй тул өмнөх багцын
       сонголт шинэ модонд утгагүй (эвхэлт нь дээр цэвэрлэгдсэн). */
    setLvl(0);
    setObPlan(new Map()); setObOids(new Map()); setObDraft(new Map()); setObDups([]);
    setObRes(new Map()); setObResDraft(new Map());
    setObState('loading');
    /* ⚠️ Урьдчилан харах ба батлах урсгалын төлөв нь БАГЦЫНХ — ноорог
       цэвэрлэгдэхэд эдгээр ч дагаж тэглэгдэхгүй бол өмнөх багцын санал
       харагдсаар байгаа мэт товч, баннер үлдэнэ. */
    setPreviewing(false); setApproving(null); setFlowBox(null); setFlowTxt('');
    setOkRows(new Set()); setBackMarks(null);
    /* ⚠️ Батлах урсгалын АЛХАМЫН тэмдэглэгээг ч тэглэнэ (2026-09-15-ны
       аудит): savedRef нь useRef тул багц/төрөл солиход үлддэг байв. Бичилт
       унаад true үлдсэн бол дараагийн батлалтад save() ОГТ дуудагдалгүй
       шууд decidePlan руу орж, хуваарь эх хуудсанд бичигдэлгүй «батлагдсан»
       болж, гүйцэтгэгчийн санал ул мөргүй алга болно. */
    savedRef.current = false;
    setBlk(0); jumped.current = false;
    /* Нэмэлт ажил (2026-09-24): маягт хаана, баннер тэглэнэ, локал ноорогийг сэргээнэ */
    setAddFor(null); setAddForm(EMPTY_FORM);
    setAjSub(null); setAjErr(''); setAjNote(''); setAjBack(null); setAjStuck(0); setAjApplied(false);
    setAjTrack(null);
    const restored = readAdds(pkg.key);
    pushTmpOid(restored);
    setAddsSt({ key: pkg.key, list: restored });
    /* ⚠️ Сарын обьёмыг ТУСАД НЬ татна: тэр үйлчилгээ унасан ч хуваарийн
       хуудас нээгдэх ЁСТОЙ. Алдааг `setErr` рүү хийхгүй — улаан баннер нь
       огноо төлөвлөхөд саад болно; задаргаа нь зүгээр л хоосон харагдана. */
    loadPkgPlan(pkg.key)
      .then((r) => { if (alive) { setObPlan(r.plan); setObRes(r.res); setObOids(r.oids); setObDups(r.dups); setObState('ok'); } })
      .catch(() => { if (alive) setObState('fail'); /* задаргаагүйгээр үргэлжилнэ */ });
    /* ⚠️ СИНТЕТИК БЛОК (2026-09-23): блокгүй 8 багцад (5.x · 6.x · 10) мөрийн
       түвшний огноо (`Төлөвлөгөөт_хуваарь__Эхлэх/Дуусах` · `geree_*` · `bodit_*`)
       нэг блок болж орно — хуваарь барилгын багцтай ИЖИЛ ажиллана, доорх
       `save` нь `sc.start[b]`/`sc.gStart[b]`/`sc.aStart[b]` нэрээр бичдэг тул
       мөрийн баганад шууд бичигдэнэ. ЗӨВХӨН ЭНД опт-ин — FillNew/дашбоард/
       нэгтгэл `loadSchema(pkg)`-ээр хоосон блок хэвээр (`Schema.synthetic`). */
    loadSchema(pkg, { synthetic: true })
      .then(async (schema) => {
        const r = await loadRows(pkg, schema);
        if (!alive) return;
        setSc(schema);
        setRows(r.rows);
      })
      .catch((e) => alive && setErr(String((e as Error).message || e)))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [pkg]);

  /**
   * ТӨРӨЛ СОЛИГДОХОД НООРОГ ЦЭВЭРЛЭГДЭНЭ (2026-09-11).
   *
   * ⚠️ ЗААВАЛ: ноорог нь `oid → блокийн муж` хэлбэртэй бөгөөд аль төрлийнх
   *    болохыг тэмдэглэх газаргүй. Цэвэрлэхгүй бол ТӨЛӨВЛӨГӨӨНД зассан
   *    огноо ГЭРЭЭНИЙ талбарт бичигдэнэ — чимээгүй, эргүүлэх аргагүй.
   * ⚠️ Уялдаа (`ham`) ба сарын обьём (`obDraft`) нь ЗӨВХӨН төлөвлөгөөнд
   *    хамаарах тул тэднийг ч цэвэрлэнэ.
   * ⚠️ Хадгалаагүй ажил байвал товч дарахаас ӨМНӨ асууна (`askSwitch`) —
   *    энэ эффект нь зөвхөн БОДИТ солилтын дараах цэвэрлэгээ.
   * ⚠️ БАТЛАХ УРСГАЛЫН төлвийг Ч цэвэрлэнэ (2026-09-11-ний аудитын S1).
   *    Урьд нь `previewing`/`approving`/`pending`/`flowBox` үлддэг байсан тул:
   *    батлагч урьдчилан хараад таб солиход ноорог цэвэрлэгдэн `dirtyN` 0
   *    болж, «бичих зүйлгүй» салаа ажиллан илгээлтийг `approved` болгоно —
   *    гүйцэтгэгчийн санал УЛ МӨРГҮЙ алга болж «батлагдлаа» гэж мэдээлнэ.
   *    Багц солих эффект (`[pkg]`) яг ижил шалтгаанаар эдгээрийг тэглэдэг.
   */
  useEffect(() => {
    setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
    /* ⚠️ Бодит огноо · нөөц (2026-09-23) нь `kind`-ээс хамаардаггүй ч ЦЭВЭРЛЭНЭ:
       нэг илгээлт нэг `kind` авч явдаг тул таб солиход хагас ноорог үлдвэл
       дараагийн илгээлт хоёр төрлийн хольц болно. `askSwitch` урьдчилан асуудаг. */
    setADraft(new Map()); setResDraft(new Map());
    setSel(null); setModal(null); setNote(''); setErr('');
    setPreviewing(false); setApproving(null); setFlowBox(null); setFlowTxt('');
    setOkRows(new Set()); setBackMarks(null);
    /* ⚠️ Батлах урсгалын АЛХАМЫН тэмдэглэгээг ч тэглэнэ (2026-09-15-ны
       аудит): savedRef нь useRef тул багц/төрөл солиход үлддэг байв. Бичилт
       унаад true үлдсэн бол дараагийн батлалтад save() ОГТ дуудагдалгүй
       шууд decidePlan руу орж, хуваарь эх хуудсанд бичигдэлгүй «батлагдсан»
       болж, гүйцэтгэгчийн санал ул мөргүй алга болно. */
    savedRef.current = false;
  }, [kind]);

  const n = sc?.bld.length ?? 0;
  /**
   * Бодит огноо · нөөцийн багана ХАРАГДАХ ЭСЭХ (2026-09-23) — талбар байгаа
   * үйлчилгээнд л. Блокгүй 8 багцад `aStart` хоосон тул бодит огноо нуугдана;
   * `hun_huch`/`mashin_mehanizm` 18/18-д бий ч схемээс шалгана (null = нуух).
   * ⚠️ 2026-09-23: блокгүй багцад синтетик блок (`Schema.synthetic`) мөрийн
   *    `bodit_ehleh/duusah`-ыг `aStart[0]`-д авчирдаг тул тэнд ч бодит огноо
   *    харагдана (багана байвал).
   */
  const hasActual = !!sc && sc.aStart.some(Boolean);
  const hasRes = !!sc && !!(sc.f.hunHuch || sc.f.mashin);

  /**
   * ХУУДАСНЫ БҮХ МӨР — серверийнх + хараахан батлагдаагүй нэмэлт (2026-09-24).
   * ⚠️ ЗӨВХӨН `base`/`refBase` (харагдац) үүнээс; `rows` нь `save`/`byOid`/
   *    `hdCtx`/`refetchServer`-ийн эх ХЭВЭЭР — нэмсэн мөр сөрөг oid-тай тул
   *    ноорог/илгээлтэд орж болохгүй (`onDown` · `TaskRow` · холбоос суллах
   *    гурвуулаа `oid < 0`-г хаана). `insertAdds` нь `sheetFrame`-ийн ЦОРЫН
   *    ГАНЦ хэрэгжилт — батлахад `ajilApply` ЯГ үүгээр оруулна, байрлал ижил.
   */
  /* ⚠️ ХЯНАЛТЫН ГОРИМД (`review`) НЭМЭЛТ МӨР ОРУУЛАХГҮЙ (2026-09-25 аудит #7):
     `adds` нь БАТЛАГЧИЙН ӨӨРИЙН хөтчийн localStorage — зохиогчийн саналд хамааралгүй
     мөр хяналтын хуанлид гарч, мөрийн индекс/гүйлгэлтийг хөдөлгөдөг байв. */
  const rowsAll = useMemo(
    () => (sc && !isReview ? insertAdds(rows, adds, sc, n) : rows),
    [rows, adds, sc, n, isReview],
  );
  /** Ноорогийг эх мөрүүд дээр давхарлана — харагдац үргэлж ХАМГИЙН СҮҮЛИЙНХ */
  const base = useMemo(() => toPlanRows(rowsAll, n, kind), [rowsAll, n, kind]);

  /**
   * ЛАВЛАГААНЫ хуваарь — НӨГӨӨ төрлийн огноо (2026-09-11, хэрэглэгчийн хүсэлт:
   * «төлөвлөгөө гэрээ 2-ийг зэрэг харах»).
   *
   * ⚠️ Засах боломжгүй, зөвхөн ХАРУУЛНА: зурвасын ард нимгэн судлаар гарч,
   *    «гэрээнээс хэр хазайсан» гэдгийг НЭГ дэлгэцээс уншина. Хоёр төрлийг
   *    зэрэг ЗАСВАЛ аль нь ноорогт хамаарахыг ялгах газаргүй болно.
   * ⚠️ НООРОГ давхарлахгүй (`rows`-оос шууд): лавлагаа нь ХАДГАЛАГДСАН
   *    утга байх ёстой — эс бөгөөс өөрийн зассан зурвасаа өөртэйгөө жишнэ.
   * ⚠️ Бүлгийн мөрд ХҮҮХДЭЭСЭЭ бодогдоно (`effSpan`) — зурах үед хийгдэнэ.
   */
  /*
   * ⚠️ 2026-09-15: `showRef`-ЭЭС САЛГАВ. Урьд нь «Зэрэг» унтраалттай үед огт
   *    бодохгүй байсан (2026-09-11-ний аудит, ачаалал хэмнэх) — гэвч одоо
   *    зүүн самбарын ДӨРВӨН ШИНЭ БАГАНА (гэрээний ба инженерийн огноо) нь
   *    үүнийг ҮРГЭЛЖ шаардана. Нэг хөрвүүлэлт нэмэгдэх нь тэр багануудыг
   *    хоосон үлдээхээс дээр: хоёр төрлийн огноог зэрэгцүүлж харах нь
   *    хуудасны ГОЛ зорилго.
   */
  const refBase = useMemo(
    () => toPlanRows(rowsAll, n, kind === 'geree' ? 'plan' : 'geree'),
    [rowsAll, n, kind],
  );
  const refByOid = useMemo(() => {
    const m = new Map<number, PlanRow>();
    for (const r of refBase) m.set(r.oid, r);
    return m;
  }, [refBase]);
  const plan = useMemo(() => {
    if (!draft.size && !ham.size && !aDraft.size && !resDraft.size) return base;
    return base.map((r) => {
      const s = draft.get(r.oid);
      const t = ham.get(r.oid);
      const ad = aDraft.get(r.oid);
      const rd = resDraft.get(r.oid);
      if (s === undefined && t === undefined && ad === undefined && rd === undefined) return r;
      return {
        ...r,
        spans: s ?? r.spans,
        deps: t !== undefined ? parseDeps(t) : r.deps,
        /* Бодит огноо · нөөцийн ноорог давхарлана (2026-09-23) */
        aStart: ad ? ad.start : r.aStart,
        aEnd: ad ? ad.end : r.aEnd,
        hun: rd ? rd.hun : r.hun,
        mashin: rd ? rd.mashin : r.mashin,
      };
    });
  }, [base, draft, ham, aDraft, resDraft]);

  /** Ажлын код → мөрийн индекс — уялдааны бодолт, сум, зөрчилд нэг эх сурвалж */
  const byCode = useMemo(() => codeIndex(plan), [plan]);

  /**
   * Нийт ноорог — огноо · уялдаа · сарын обьёмын аль нэгийг нь хөндсөн.
   * ⚠️ Обьёмын ноорог нь `${код}|${блок}` түлхүүртэй тул мөрийн тоотой
   *    шууд нийлэхгүй; хоёрын НИЙЛБЭРийг «хадгалах зүйл байна уу» гэсэн
   *    ганц тоо болгож харуулна.
   */
  /* ⚠️ `dirtyN`-ийг async урсгалд (`refreshAjil`) ref-ээр уншина — deps-д
     оруулбал чирэлт бүрд урсгал дахин татагдана. */
  const dirtyNRef = useRef(0);
  const dirtyN = useMemo(
    () => new Set([...draft.keys(), ...ham.keys(), ...aDraft.keys(), ...resDraft.keys()]).size
      + new Set([...obDraft.keys(), ...obResDraft.keys()]).size,
    [draft, ham, aDraft, resDraft, obDraft, obResDraft],
  );
  /**
   * ӨӨРЧЛӨГДСӨН ЯЛГААТАЙ МӨРИЙН тоо — илгээлтийн `rowCount` (2026-09-23).
   * ⚠️ `dirtyN` нь сарын нүд бүрийг тоолдог тул «14 мөр» гэж харуулбал
   *    батлагчийн дарааллын тоо мөрийн тоотой зөрдөг байв. Обьёмын ноорог
   *    (`${код}|${блок}`) нь код → мөр болж нэгтгэгдэнэ.
   */
  const dirtyOids = useMemo(() => {
    const s = new Set<number>([...draft.keys(), ...ham.keys(), ...aDraft.keys(), ...resDraft.keys()]);
    for (const k of new Set([...obDraft.keys(), ...obResDraft.keys()])) {
      const code = Number(k.split('|')[0]);
      const i = Number.isFinite(code) ? byCode.get(code) : undefined;
      if (i != null && plan[i]) s.add(plan[i].oid);
    }
    return s;
  }, [draft, ham, aDraft, resDraft, obDraft, obResDraft, byCode, plan]);
  const dirtyRows = dirtyOids.size;

  /**
   * ЗӨВШӨӨРӨЛ ШААРДАХ МӨРҮҮД — өөрчлөгдсөн АЖЛЫН мөр + бүлгийн ЖИНХЭНЭ өөрчлөлт.
   * ⚠️ Хүүхдээс БОДОГДСОН бүлгийн муж (`rollUpGroups`) хасагдана — хүүхдүүд нь
   *    ногоон бол тэр нь ч зөв.
   */
  /* ⚠️ БҮЛГИЙН ЖИНХЭНЭ ӨӨРЧЛӨЛТ ОРНО (2026-09-25 аудит): бүлгийн УЯЛДАА (`ham`)
     ба НАВЧГҮЙ блокийн өөрийн муж (`applyPayloadToDraft`-ийн `gOwn`) нь хүүхдээс
     бодогддоггүй, санал өөрөө агуулдаг — хасвал зөвшөөрөлгүйгээр батлагдана.
     Хүүхдээс бодогдсон (`rollUpGroups`) бүлгийн муж л хасагдана. */
  /* ⚠️ СЕРВЕРТЭЙ ИЖИЛ / ХАРАГДАХ ЯЛГААГҮЙ МӨР ОРОХГҮЙ (2026-09-25 аудит #8):
     `applyPayloadToDraft` нь зохиогч хөндөөгүй блокт серверийн ОДООГИЙН утгыг
     ноорогт тавьдаг, хуваалцсан ноорог ч серверт хүрсэн утгыг агуулж болно —
     тэр мөрүүд «өөрчлөгдсөн» гэж тоологдож, батлагч ЯЛГААГҮЙ мөрийг хайж
     ногоон болгох шаардлагатай болдог байв. Одоо мөр бүрийг суурьтай (`base`)
     тал бүрээр нь тулгана: огноо · уялдаа · бодит огноо (багана байвал) · нөөц
     (багана байвал) · сарын обьём/нөөц. Ялгаагүй мөр тэмдэггүй (саармаг). */
  const reviewOids = useMemo(() => {
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
  }, [dirtyOids, plan, base, ham, draft, aDraft, resDraft, obDraft, obResDraft, obPlan, obRes, hasActual, hasRes, n]);
  /* ⚠️ 2026-09-25 аудит #2: буцаасан тэмдэглэгээг ноорог хоосроход АРЧИХГҮЙ —
     `lastDecision`-оос дахин үүсдэг (`backMarks`-ийн эффект); ноороггүй үед
     `backOn` худал тул харагдахгүй. Урьд нь энд арчдаг байсан тул «Цуцлах»/
     дахин ачаалсны дараа тэмдэг мөнхөд алга болдог байв. */
  const reviewOk = reviewOids.filter((o) => okRows.has(o)).length;
  const allOk = reviewOids.length > 0 && reviewOk === reviewOids.length;
  /** Сарын обьём/нөөцийн ноорогтой ажлын КОДУУД — мөрийн «хадгалаагүй» тэмдэгт (2026-09-24 аудит) */
  useEffect(() => { dirtyNRef.current = dirtyN; }, [dirtyN]);
  const obDirtyDes = useMemo(() => {
    const s = new Set<number>();
    for (const k of [...obDraft.keys(), ...obResDraft.keys()]) s.add(Number(k.slice(0, k.indexOf('|'))));
    return s;
  }, [obDraft, obResDraft]);

  /* ⚠️ ЛОКАЛ өдөр (2026-09-17): UTC-ээр авбал УБ-д 00:00–08:00 хооронд «өнөөдөр»
     өчигдөр болж, хоцрогдлын төлөв ба өнөөдрийн шугам нэг хоног хоцордог байв.
     Хуанлийн өдрүүд өөрсдөө UTC шөнө дундаар түлхүүрлэгддэг тул ижил хэлбэрээр.
     ⚠️ 2026-09-25: `useMemo([])` байсан тул шөнө дунд өнгөрсөн нээлттэй хуудас
     «өнөөдөр»-ийг хуучин өдрөөр үлдээдэг байв — дараагийн шөнө дунд таймераар шинэчилнэ. */
  const [now, setNow] = useState(todayUtc);
  useEffect(() => {
    const d = new Date();
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const t = window.setTimeout(() => setNow(todayUtc()), Math.max(1000, next - d.getTime() + 1000));
    return () => window.clearTimeout(t);
  }, [now]);
  const cov = useMemo(() => coverageOf(plan), [plan]);

  /**
   * САРЫН ХУВАARЬ ХУВЬ — тэр сард төлөвлөсөн обьём нь БАГЦЫН НИЙТ обьёмын
   * хэдэн хувь (2026-09-22, хэрэглэгчийн хүсэлт: «дээд талын огнооны нүдэнд
   * огнооны доод тал хуваарьт төлөвлөсөн обьём нийт багц обьёмын хэдэн хувь»).
   *
   * ⚠️ ЗӨВХӨН НАВЧ МӨР (`r.group` биш). Бүлгийн мөрд `vol` уншигддаг
   *    (`bagtsSheet.ts:752`) тул шүүхгүй бол хүүхдүүдээ ДАХИН тоолж хоёр
   *    дахин хөөрөгдөнө — `ipcLink.ts:81-83`-ийн ижил ⚠️. Хуваарь ба хуваагч
   *    ХОЁУЛАА ижил шүүлттэй байх ёстой, эс бөгөөс харьцаа гажна.
   *
   * ⚠️ `plannedVol` ба `unit` ХЭРЭГЛЭХГҮЙ — `bagtsSheet.ts:44-52` нь
   *    хоёуланг «ЯМАР Ч ТООЦООНД ОРОХГҮЙ, зөвхөн харуулна» гэж бэхэлсэн.
   *    Мөнгөн жин (`vol × unit`) ч хориотой (`bagtsSheet.ts:1075-1077`:
   *    «үнэ өндөртэй ажил руу хазайлгадаг»).
   *
   * ⚠️ Энэ нь БИЕТ ГҮЙЦЭТГЭЛИЙН ЖИН БИШ — нэгж хольсон нийлбэр (м³+м²+ш)
   *    тул зөвхөн төлөвлөгөөний ЦАГ ХУГАЦААНЫ хуваарилалтыг илэрхийлнэ.
   *
   * ⚠️ Ноорог ЗААВАЛ орно (`obDraft` нь `obPlan`-ыг дарна — `obOf`-ийн
   *    дүрэм) — эс бөгөөс зурвасыг чирэхэд тоо хөдөлдөггүй.
   *
   * ⚠️ ХУУРАМЧ ХУВЬ ХЭЗЭЭ Ч ГАРГАХГҮЙ (2026-09-22, хэрэглэгчийн шаардлага:
   *    «сарын задаргаа байхгүй байхад хуурамч хувь битгий гаргаад бай»).
   *    Урьд нь задаргаагүй зурваст мөрийн обьёмыг ХОНОГООР шугаман хуваадаг
   *    байв — тэр нь ТААМАГЛАЛ бөгөөд төлөвлөгчийн хийгээгүй шийдвэрийг
   *    түүний хийсэн юм шиг харуулна. Одоо ЗӨВХӨН бодит задаргаа: задаргаа
   *    нэг ч мөрд байхгүй бол сарын нүдэнд ЮУ Ч гарахгүй.
   *
   * ⚠️ ХУВААГЧ нь БАГЦЫН НИЙТ ОБЬЁМ (2026-09-22, хэрэглэгч: «тухайн сард
   *    төлөвлөсөн бүх ажил багц нийт обьём эзлэх хувь»). Задаргаа оруулсан
   *    хүрээ БИШ — багцын БҮХ навч ажлын `vol` бүх блокоор.
   *
   *    Тиймээс тоо нь «БАГЦЫН хэдэн хувийг тэр сард төлөвлөсөн» гэсэн утга
   *    өгнө: сар бүрийн нийлбэр = төлөвлөлтийн ХАМРАЛТ. Задаргаа хагас
   *    бөглөгдсөн бол нийлбэр 100%-д хүрэхгүй — тэр нь ЗӨВ дохио, дутууг
   *    нуухгүй.
   *
   *    `vol` нь БЛОК ТУС БҮРИЙН нийт обьём — блокуудын нийлбэр БИШ. Үүнийг
   *    цонх өөрөө баталдаг: `balanced(mv, total)`, `total = r.vol` буюу НЭГ
   *    блокийн сарын задаргаа `r.vol`-тай тэнцэхийг шаардана
   *    (`PlanModal`). Тиймээс хуваагч нь `Σ r.vol × (хуваарьтай блокийн тоо)`.
   *
   * ⚠️ ХУВААРЬГҮЙ блок хуваагчид ОРОХГҮЙ: 22 блокоос 3-д л хуваарь байхад
   *    22-оор үржүүлбэл хувь 7 дахин багасч, бүрэн төлөвлөсөн багц ч 14%
   *    гэж харагдана. Хуваарьтай блок нь «төлөвлөх ёстой хүрээ».
   */
  const monPct = useMemo(() => {
    const per = new Map<string, number>();
    let tot = 0;
    for (const r of plan) {
      if (r.group || r.des == null) continue;
      if (r.vol == null || !(r.vol > 0)) continue;
      for (let b = 0; b < n; b += 1) {
        const blok = sc?.bld[b];
        if (!blok) continue;
        /* ⚠️ ХУВААГЧ нь БҮХ хуваарьтай блокоор — задаргаатай эсэхээс
           ҮЛ ХАМААРНА. Эс бөгөөс бөглөөгүй ажил хуваагчаас ч хасагдаж,
           нэг ажил бөглөхөд шууд 100% болж, дутуу нь нуугдана. */
        if (!r.spans[b]) continue;
        tot += r.vol;
        const md = obDraft.get(`${r.des}|${blok}`) ?? obPlan.get(r.des)?.get(blok);
        if (!md || !md.size) continue;
        for (const [k, v] of md) {
          if (v == null) continue;
          per.set(k, (per.get(k) ?? 0) + v);
        }
      }
    }
    return { per, tot };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [plan, n, sc, obDraft, obPlan]);

  /**
   * Сарын шошгын доорх хувийн ТЕКСТ. `null` = ОГТ зурахгүй.
   * ⚠️ `null ≠ 0`: багцад обьём бүртгэгдээгүй (`tot === 0`, ж: `4.2·12F`
   *    мэт `bld` хоосон багц) эсвэл тэр сард хуваарь байхгүй бол хоосон —
   *    «0» гэж зурвал 30px-ийн зурвас бүхэлдээ тэгээр дүүрч шуугиан болно.
   * ⚠️ `pct()` 100-аар ҮРЖҮҮЛДЭГГҮЙ тул энд хэрэглэхгүй; 73px-д «12.4%»
   *    багтахгүй учир БҮХЭЛ хувь, % тэмдэггүй. Бүтэн утга `title`-д.
   */
  const monLab = useCallback((mk: string): { txt: string; tip: string } | null => {
    /* ⚠️ (2026-09-23) ГЭРЭЭ табд ЗУРАХГҮЙ: `monPct` нь `plan`-ын (төлөвлөгөөний)
       мужаар бодогддог тул гэрээний огнооны толгой дор тавибал хоёр эх холилдоно.
       Сарын обьём нь зөвхөн төлөвлөгөөнд хамаарна (`PlanKind` тайлбар). */
    if (kind !== 'plan') return null;
    if (!(monPct.tot > 0)) return null;
    const v = monPct.per.get(mk);
    if (v == null || !(v > 0)) return null;
    const p = (v / monPct.tot) * 100;
    return {
      txt: p < 0.5 ? '·' : String(Math.round(p)),
      tip: tr('{0} — багцын нийт обьёмын {1}%', mk, num(p, 1)),
    };
  }, [monPct, kind]);

  /**
   * Мөр шүүлтүүрт нийцэж байна уу.
   *
   * ⚠️ БҮЛГИЙН мөр ҮРГЭЛЖ гарна: хамралт, огноо бүгд түүний ХҮҮХДҮҮДИЙН
   *    шинж болохоос бүлгийн өөрийнх биш. Бүлгийг шүүж хаявал доорх ажлууд
   *    эцэггүй үлдэж, чирэлтийн хавчилт («хүүхэд эцгийнхээ дотор») суурьгүй
   *    болно.
   *
   * ⚠️ «Түвшин» ба «Хугацаа» сонголт ХАСАГДСАН (2026-09-02, хэрэглэгч).
   */
  const match = useCallback((r: PlanRow) => {
    if (r.group) return true;
    const filled = r.spans.filter(Boolean).length;
    if (filter === 'has' && !filled) return false;
    if (filter === 'none' && filled) return false;
    if (filter === 'partial' && (!filled || filled === r.spans.length)) return false;
    const sp = rowSpan(r);
    if (fYear !== 'all' && (!sp || msToDay(sp.start).slice(0, 4) !== fYear)) return false;
    return true;
  }, [filter, fYear]);

  /** Бүлгийн сонголт — модны дарааллаар, гүнээр нь догол мөртэй */
  const groups = useMemo(
    () => plan.filter((r) => r.group).map((r) => ({
      oid: r.oid,
      label: `${'  '.repeat(r.depth)}${r.no} ${r.work}`.trimEnd(),
    })),
    [plan],
  );

  /**
   * Сонгосон бүлгийн ДЭД МОД (бүлэг өөрөө + доторх бүх мөр).
   * ⚠️ Гүнээр таслана, дараагийн ижил гүнтэй мөр хүртэл — модны дараалал нь
   *    хавтгай массив тул эцэг/хүүхдийн холбоо зөвхөн ЭНЭ дүрмээр гарна.
   */
  const scoped = useMemo(() => {
    if (fGrp === 'all') return plan;
    const at = plan.findIndex((r) => r.oid === fGrp);
    if (at < 0) return plan;
    const out = [plan[at]];
    for (let k = at + 1; k < plan.length; k++) {
      if (plan[k].depth <= plan[at].depth) break;
      out.push(plan[k]);
    }
    return out;
  }, [plan, fGrp]);

  /**
   * ХАРАГДАХ МӨРҮҮД — эвхэлт · шүүлт. Зүүн мод ба баруун хуанли ЯГ ЭНЭ
   * жагсаалтаар эгнэнэ.
   *
   * ⚠️ ТЕКСТ ХАЙЛТ ХАСАГДСАН (2026-09-02, хэрэглэгч). Хайлт нь модыг ХАВТГАЙ
   *    жагсаалт болгож, бүлгийн мөрүүдийг хасдаг тул эцгийн муж алдагдаж,
   *    чирэлтийн хавчилт («хүүхэд эцгийнхээ дотор») ажиллах суурьгүй болдог
   *    байв. «Бүлэг» сонголт нь модыг бүтнээр нь үлдээж, тэр үүргийг гүйцэтгэнэ.
   */
  const visible = useMemo(() => {
    const out: PlanRow[] = [];
    let hideBelow = -1;
    for (const r of scoped) {
      if (hideBelow >= 0 && r.depth > hideBelow) continue;
      hideBelow = -1;
      if (r.group && collapsed.has(r.oid)) hideBelow = r.depth;
      if (!match(r)) continue;
      out.push(r);
    }
    return out;
  }, [scoped, collapsed, match]);

  /**
   * ХҮСНЭГТЭД БОДИТООР БАЙГАА ТҮВШНҮҮД — товчийг өгөгдлөөс угсарна.
   *
   * ⚠️ Хатуу 1·2·3·4·5 гэж бичихгүй (`Finance`-ээс ЭНД ЯЛГААТАЙ): санхүүгийн
   *    бүртгэл нь ТОГТМОЛ таван түвшинтэй Excel загвар, харин хуваарийн модны
   *    гүн БАГЦ БҮРД өөр. Багц 1 нь дөрвөн түвшинтэй, зарим багц хоёр л
   *    түвшинтэй — байхгүй түвшний товч гарвал дарахад юу ч болохгүй.
   *
   * ⚠️ Гүн 0-ээс эхэлдэг тул товчны дугаар нь `depth + 1`.
   */
  const lvls = useMemo(() => {
    const s = new Set<number>();
    for (const r of scoped) if (r.group) s.add(r.depth);
    return [...s].sort((a, b) => a - b);
  }, [scoped]);

  /**
   * ТҮВШИН СОНГОХ — `Finance.setLevel`-ийн ижил үүрэг.
   *
   * ⚠️ `n` нь ТОВЧНЫ дугаар (1-ээс эхэлнэ), гүн нь `n - 1`. «Энэ түвшний
   *    гарчгууд ХАРАГДАНА, доорх нь эвхэгдэнэ» гэсэн утгатай: гүн ≥ `n - 1`
   *    бүх БҮЛЭГ мөрийг `collapsed`-д хийнэ.
   *
   * ⚠️ ХАМГИЙН ГҮН түвшин нь бүх мөрийг ДЭЛГЭНЭ (`Finance`-ийн 4·5-тай ижил
   *    зарчим): тэр түвшний бүлгүүд нь навчтай тул эвхэх юм үлдэхгүй.
   *
   * ⚠️ Зөвхөн БҮЛЭГ мөрийг (`r.group`) хийнэ — навч мөрийг эвхэх утгагүй
   *    бөгөөд `visible`-ийн `hideBelow` логик нь тэднийг хардаггүй.
   */
  const setLevel = useCallback((n: number) => {
    setLvl(n);
    const deepest = lvls.length ? lvls[lvls.length - 1] : 0;
    /* Хамгийн гүн түвшин = бүгдийг дэлгэх */
    if (n - 1 >= deepest) { setCollapsed(new Set()); return; }
    const s = new Set<number>();
    for (const r of scoped) if (r.group && r.depth >= n - 1) s.add(r.oid);
    setCollapsed(s);
  }, [scoped, lvls]);

  /** Хуваарьт тааралдсан ЖИЛҮҮД — сонголтыг өгөгдлөөс угсарна */
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const r of plan) {
      const sp = rowSpan(r);
      if (sp) s.add(msToDay(sp.start).slice(0, 4));
    }
    return [...s].sort();
  }, [plan]);

  /** Блок бүрд хуваарьтай АЖЛЫН тоо — сонголтын жагсаалтад харуулна */
  const blockFill = useMemo(() => {
    const c = new Array<number>(n).fill(0);
    for (const r of plan) {
      if (r.group) continue;
      r.spans.forEach((sp, b) => { if (sp) c[b] += 1; });
    }
    return c;
  }, [plan, n]);

  /* ── ХУАНЛИЙН ХҮРЭЭ — доод тал нь 365 хоног, хоёр талдаа СУЛ ЗАЙТАЙ ── */
  const range = useMemo(() => {
    const all: number[] = [];
    for (const r of plan) for (const sp of r.spans) if (sp) { all.push(sp.start, sp.end); }
    const lo = all.length ? Math.min(...all, now) : now;
    const hi = all.length ? Math.max(...all) : now;
    /**
     * ⚠️ СУЛ ЗАЙ (2026-09-02, хэрэглэгч). Урьд нь `from`/`to` нь өгөгдлийн ЯГ
     * захууд байв: хамгийн сүүлийн зурвас хуанлийн баруун ирмэгт наалдаж,
     * түүнийг цааш чирэх, хугацааг нь сунгах, шинэ ажлыг хойшлуулах ЗАЙ огт
     * үлддэггүй байлаа. Одоо урд нь 1 сар, ард нь 3 сар нэмнэ.
     *
     * ⚠️ Сар бүрээр тэгшилнэ: `Date.UTC` нь сарын халилтыг өөрөө зөв бодно
     * (12-р сар + 4 → дараа жилийн 4-р сар). Ард талын `0` дахь өдөр нь
     * «өмнөх сарын сүүлчийн өдөр» тул сарын багана бүтнээрээ дуусна.
     */
    const d = new Date(lo);
    const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
    const e = new Date(hi);
    const padded = Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 4, 0);
    /* ⚠️ Хамгийн багадаа 365 хоног, шаардлагатай бол дараагийн жил рүү */
    const to = Math.max(padded, from + 364 * DAY);
    return { from, to };
  }, [plan, now]);
  /* ⚠️ ЧИРЭЛТИЙН ҮЕД хүрээг ТОГТООНО (2026-09-17): `range` нь ноорогтой `plan`-аас
     бодогддог тул зурвасыг `lo`-оос өмнө татмагц `from` бүтэн сараар эрт болж,
     чирэлтийн `anchor` (ИНДЕКС) нэг сараар зөрж муж сар сараар ухардаг байв. */
  const rangeRef = useRef(range);
  useEffect(() => { if (!drag) rangeRef.current = range; }, [drag, range]);
  const { from, to } = drag ? rangeRef.current : range;
  const px = ZOOM[zoom];
  const total = Math.round((to - from) / DAY) + 1;
  const W = Math.round(total * px);
  const xOf = useCallback((ms: number) => Math.round(((ms - from) / DAY) * px), [from, px]);
  const dayAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const k = Math.floor((clientX - el.getBoundingClientRect().left) / px);
    return Math.min(total - 1, Math.max(0, k));
  };
  const msAt = (k: number) => from + k * DAY;

  /* ⚠️ Эхэнд ӨНӨӨДӨР рүү гүйлгэнэ — 365 хоногийн эхэнд тултал өнгөрсөн
     жилийн сарууд харагдаж, «хоосон хуанли» гэж уншигдана. */
  useEffect(() => {
    if (jumped.current || !scrollRef.current || !visible.length) return;
    jumped.current = true;
    scrollRef.current.scrollLeft = Math.max(0, xOf(now) - 120);
  }, [now, xOf, visible.length]);

  /* ── ЦОНХЛОЛТ (виртуалчлал) ── */
  const [win, setWin] = useState({ from: 0, to: 60 });
  const recalcWin = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    /* ⚠️ Эхний `PL_ROW` нь НААЛДМАЛ толгой (`gSideHead`/`plHead`) — тэр нь
       урсгалд байдаг тул мөр 0-ийн эхлэл нь `PL_ROW` дээр байна. */
    const top = Math.max(0, el.scrollTop - PL_ROW);
    const a = Math.max(0, Math.floor(top / PL_ROW) - PL_OVER);
    const b = Math.ceil((top + el.clientHeight) / PL_ROW) + PL_OVER;
    setWin((w) => (w.from === a && w.to === b ? w : { from: a, to: b }));
  }, []);
  /* Гүйлгэх бүрд биш, кадр тутам НЭГ удаа — гүйлгээ жигд байна. */
  const winTick = useRef(0);
  const onScroll = useCallback(() => {
    if (winTick.current) return;
    winTick.current = requestAnimationFrame(() => {
      winTick.current = 0;
      recalcWin();
    });
  }, [recalcWin]);
  useEffect(() => () => { if (winTick.current) cancelAnimationFrame(winTick.current); }, []);
  /* Мөр/шүүлт/эвхэлт солигдоход цонхыг шинэчилнэ */
  useEffect(() => { recalcWin(); }, [visible.length, recalcWin]);

  /**
   * ⚠️ ЗАСВАРЛАЖ буй мөр цонхны ГАДНА үлдэж болохгүй: чирэлт нь мөрийн DOM
   * дээрх pointer capture-д тулгуурладаг тул зурагдахаа больвол `pointermove`
   * тасарч, чирэлт дундуураа «өлгөгдөнө». Тиймээс сонгосон/чирж буй мөрийг
   * цонхонд хүчээр багтаана.
   */
  const selVis = useMemo(
    () => (sel == null ? -1 : visible.findIndex((r) => r.oid === sel)),
    [visible, sel],
  );
  const winFrom = selVis >= 0 ? Math.min(win.from, selVis) : win.from;
  const winTo = selVis >= 0 ? Math.max(win.to, selVis + 1) : win.to;
  const slice = useMemo(
    () => visible.slice(winFrom, winTo).map((r, k) => ({ r, k: winFrom + k })),
    [visible, winFrom, winTo],
  );

  /* ── Ноорог ── */

  /**
   * ГИНЖНИЙ ҮР ДҮНГ НООРОГТ БУУЛГАНА — `propagate` олон мөрийг зэрэг
   * өөрчилдөг тул НЭГ setState дотор бөөнөөр нь бичнэ; мөр бүрд тусдаа
   * бичвэл чирэлтийн кадр бүрд олон рендер гарна.
   * ⚠️ Түлхүүр нь `plan`-ы индекс — `PlanRow.i` нь эх массивын индекстэй
   *    тэнцүү тул `plan[i].oid` үргэлж зөв мөрийг заана.
   */
  /** Ажил+блокийн ноорогийн түлхүүр */
  const obKey = (des: number, blok: string) => `${des}|${blok}`;

  /**
   * Тухайн (ажил · блок)-ийн ХҮЧИНТЭЙ задаргаа — ноорог нь хадгалагдсаныг
   * дарна. Задаргаагүй бол хоосон Map.
   */
  const obOf = useCallback((des: number | null, blok: string): Map<string, number> => {
    if (des == null) return new Map();
    const d = obDraft.get(obKey(des, blok));
    if (d) return d;
    return obPlan.get(des)?.get(blok) ?? new Map();
  }, [obDraft, obPlan]);
  /** Тухайн (ажил · блок)-ийн ХҮЧИНТЭЙ сарын нөөц — `obOf`-ийн адил (2026-09-24) */
  const obResOf = useCallback((des: number | null, blok: string): Map<string, MonthRes> => {
    if (des == null) return new Map();
    const d = obResDraft.get(obKey(des, blok));
    if (d) return d;
    return obRes.get(des)?.get(blok) ?? new Map();
  }, [obResDraft, obRes]);

  const applyChanges = useCallback((ch0: Map<number, (Span | null)[]>) => {
    if (!ch0.size) return;
    /**
     * ⚠️ БҮЛЭГ НЬ АЖЛААСАА ХАМААРНА (2026-09-06, хэрэглэгчийн заавар).
     *    Ажлын муж өөрчлөгдмөгц өвөг бүлгүүд нь хүүхдүүдийнхээ MIN/MAX-аар
     *    ӨӨРСДӨӨ шинэчлэгдэж, ноорогт орж, хадгалахад бичигдэнэ. Урьд нь
     *    эсрэгээр — бүлгийн муж хүүхдийг хавчдаг байв.
     */
    const ch = rollUpGroups(plan, n, ch0);
    setDraft((d) => {
      const m = new Map(d);
      for (const [i, spans] of ch) {
        /* ⚠️ Батлагдаагүй НЭМЭЛТ мөр (сөрөг oid) ноорогт ОРОХГҮЙ (2026-09-25 аудит) —
           `save` серверээс олохгүй тул илгээлт батлахад `staleN`-д мөнхөд гацна. */
        if (plan[i].oid < 0) continue;
        /* ⚠️ СЕРВЕРИЙН УТГАТАЙ ИЖИЛ бол ноорогт ОРУУЛАХГҮЙ, байсан бол ХАСНА
           (2026-09-21): урьд нь 1px гулссан товшилт (`onMove` d=0) мөрийг ижил
           утгаар ноорогт оруулж «хадгалаагүй 1» гэж худал тэмдэглэдэг байв;
           мөн чирээд буцаахад ч ноорог үлддэг байв. */
        const orig = base[i]?.spans;
        const same = !!orig && spans.length === orig.length
          && spans.every((sp, b) => sameSpan(sp, orig[b]));
        if (same) m.delete(plan[i].oid);
        else m.set(plan[i].oid, spans);
      }
      /* ⚠️ БҮЛГИЙН МӨР ХҮҮХЭДГҮЙ ҮЛДЭХГҮЙ (2026-09-21). Бүлэг ноорогт ЗӨВХӨН
         `rollUpGroups`-оор ордог (гараар чирэгдэхгүй, popup нь бүлэгт огноо
         тавьдаггүй). Хүүхдээ буцаахад серверийн бүлгийн ӨӨРИЙН огноо
         MIN/MAX-аас зөрдөг бол `rollUpGroups` `moved=false` болж дээрх
         `same` салбарт хүрэхгүй — бүлэг ноорогт «хадгалаагүй 1» гэж үлддэг
         байв. Навч хүүхэд нь нэг ч ноорогт үлдээгүй бүлгийг хасна. */
      for (const [i] of ch) {
        const g = plan[i];
        if (!g.group || !m.has(g.oid)) continue;
        let kid = false;
        for (let k = i + 1; k < plan.length && plan[k].depth > g.depth; k += 1) {
          if (!plan[k].group && m.has(plan[k].oid)) { kid = true; break; }
        }
        if (kid) continue;
        /* ⚠️ ӨӨРИЙН МУЖ НЬ ШИЛЖСЭН БҮЛЭГ ҮЛДЭНЭ (2026-09-25 аудит). Бүлэг ноорогт
           `rollUpGroups`-оос ГАДНА `propagate`-оор ч ордог: уялдаатай бүлгийн тухайн
           блокт огноотой навч байхгүй бол `effSpan` нь ӨӨРИЙН мужийг ашигладаг тул
           гинж ТЭР мужийг шилжүүлнэ. Урьд нь энд хасагдаж, хамаарагчид нь шинэ
           огноогоор хөдөлсөн атлаа бүлэг өөрөө хуучиндаа үлддэг байв. Навчгүй
           блокт серверээс зөрсөн утга = өөрийн шилжилт → үлдээнэ; навчтай блокийн
           зөрүү нь дээрх нэгтгэлийн дагавар тул хэвээр хасна. Навч нь ноорогт
           байхгүй (`kid` худал) тул тэдний утга = `base`. */
        const gs = m.get(g.oid)!;
        const bs = base[i]?.spans ?? [];
        const ownShift = gs.some((sp, b) => !sameSpan(sp, bs[b])
          && !hasDatedLeaf(plan, i, b, (k) => base[k]?.spans ?? []));
        if (!ownShift) m.delete(g.oid);
      }
      return m;
    });
    /**
     * ⚠️ ХУВААРЬ ХӨДӨЛБӨЛ САРЫН БҮРДЭЛ ДАГАНА. ЭНЭ нь огноо өөрчлөгдөх
     * ЦОРЫН ГАНЦ цэг — чирэлт, popup, уялдааны гинж гурвуулаа эндүүр
     * дамждаг тул өөр газарт давтах шаардлагагүй.
     *
     * ⚠️ АВТОМАТ ТАРААЛТ БАЙХГҮЙ (2026-09-06, хэрэглэгч: «автомат обьём
     * тараалт хийж болохгүй, бүгд хоосон байх ёстой»). Шинэ сарууд ХООСОН
     * үлдэж, хүн өөрөө бөглөнө; хэвээр үлдсэн сарын гарын утга хадгалагдана.
     *
     * ⚠️ Обьёмгүй эсвэл кодгүй мөрд юу ч хийхгүй: хадгалах холбоос байхгүй.
     */
    setObDraft((prev) => {
      const next = new Map(prev);
      let touched = false;
      for (const [i, spans] of ch) {
        const r = plan[i];
        if (r.des == null || !(r.vol != null && r.vol > 0)) continue;
        spans.forEach((sp, b) => {
          const was = r.spans[b];
          const same = (!sp && !was)
            || (!!sp && !!was && sp.start === was.start && sp.end === was.end);
          if (same) return;
          const blok = sc?.bld[b];
          if (!blok) return;
          const key = obKey(r.des!, blok);
          const srv = obPlan.get(r.des!)?.get(blok);
          /* Ноорог > хадгалагдсан — хамгийн шинийг суурь болгоно */
          const cur = next.get(key) ?? srv ?? new Map<string, number>();
          /* ⚠️ СЕРВЕРИЙН МУЖ РУУ БУЦСАН БОЛ ЧИРЭЛТИЙН ӨМНӨХ ЗАДАРГААГ СЭРГЭЭНЭ
             (2026-09-21). Урьд нь чирээд буцаахад огнооны ноорог устдаг ч
             (дээрх `same` салбар) `keepMonths`-оор ТАЙРАГДСАН задаргаа
             obDraft-д үлдэж «хадгалаагүй 1» + тэнцээгүй нийлбэр гардаг байв.
             Чирж буй мөр·блок бол `Drag.origMonths` (чирэлтээс өмнөх бүтэн
             хуулбар) — гинжээр буцсан бусад мөрд `keepMonths` хэвээр. */
          const back = sameSpan(sp, base[i]?.spans[b]);
          const orig = drag && drag.oid === r.oid && b === blk ? drag.origMonths : null;
          const val = sp
            ? (back && orig ? new Map(orig) : keepMonths(sp, cur))
            : new Map<string, number>();
          /* ⚠️ СЕРВЕРТЭЙ ИЖИЛ (эсвэл хоёулаа хоосон) задаргааг НООРОГТ
             ҮЛДЭЭХГҮЙ (2026-09-21): задаргаагүй ажлыг чирэхэд
             `keepMonths(sp, ∅) = ∅` obDraft-д орж, «Батлуулах» нь «задаргаа
             тэнцэхгүй» гэж илгээх замыг ТҮГЖДЭГ байв. Бичих зүйлгүй бол
             ноорог ч биш. */
          if (sameMonths(val, srv)) next.delete(key);
          else next.set(key, val);
          touched = true;
        });
      }
      return touched ? next : prev;
    });
    /* САРЫН НӨӨЦ — обьёмын ИЖИЛ дүрмээр дагана (2026-09-24): `keepRes`, чирэлт
       буцахад `Drag.origRes`, сервертэй ижил бол ноорогоос хасна. */
    setObResDraft((prev) => {
      const next = new Map(prev);
      let touched = false;
      for (const [i, spans] of ch) {
        const r = plan[i];
        if (r.des == null || !(r.vol != null && r.vol > 0)) continue;
        spans.forEach((sp, b) => {
          const was = r.spans[b];
          if (sameSpan(sp, was)) return;
          const blok = sc?.bld[b];
          if (!blok) return;
          const key = obKey(r.des!, blok);
          const srv = obRes.get(r.des!)?.get(blok);
          const cur = next.get(key) ?? srv ?? new Map<string, MonthRes>();
          const back = sameSpan(sp, base[i]?.spans[b]);
          const orig = drag && drag.oid === r.oid && b === blk ? drag.origRes : null;
          const val = sp
            ? (back && orig ? new Map(orig) : keepRes(sp, cur))
            : new Map<string, MonthRes>();
          if (sameRes(val, srv)) next.delete(key);
          else next.set(key, val);
          touched = true;
        });
      }
      return touched ? next : prev;
    });
  }, [plan, base, n, sc, obPlan, obRes, drag, blk]);

  /**
   * Popup-ын «Тавих» — огноо ба/эсвэл уялдааг НЭГ алхамд.
   *
   * ⚠️ Хоёр тусдаа setState хийвэл хоёр дахь нь ХУУЧИН `plan`-ыг харна
   * (React нэг тик дотор batch хийдэг) — уялдаа нь шинэ огноог, огноо нь
   * шинэ уялдааг үл мэдэлцэнэ. Тиймээс нэг газар: уялдааг түр давхарлаад
   * `propagate`-д өгч, огноог ЭНЭ мөрөөс (шинэ уялдаагаар нь дахин бодуулж)
   * гинжээр нь тархаана.
   */
  const applyModal = useCallback((
    oid: number,
    spans: (Span | null)[] | null,
    deps: Dep[] | null,
    /** Сарын обьём + нөөц (2026-09-24) — `null` = хөндөхгүй; дотоод `null` = тэр хэсгийг хөндөхгүй */
    ob: { months: Map<string, number> | null; res: Map<string, MonthRes> | null } | null,
    /**
     * ⚠️ САРЫН ЗАДАРГААГ АЛЬ БЛОКТ тавих (2026-09-21). Урьд нь үргэлж ОДООГИЙН
     *    `blk` байсан тул чирэлтийг цуцлахад (`onClose` → `u.months`) цонх
     *    нээлттэй байхад блок сольсон бол задаргаа БУРУУ блокт сэргээгддэг
     *    байв. Дуудагч заагаагүй бол одоогийнх — popup-ын «Тавих» хэвээр.
     * ⚠️ ОЛОН БЛОК (2026-09-24, хэрэглэгч: «блокийг олноор сонгож нэг төлөвлөлтийг
     *    зэрэг тавина»): popup сонгосон блок бүрд ИЖИЛ задаргаа/нөөцийн ХУУЛБАР.
     */
    blks: number[] = [blk],
  ) => {
    /* ⚠️ `locked` — popup-ийн товчнууд аль хэдийн идэвхгүй ч ЭНЭ нь огноо
       өөрчлөгдөх ЦОРЫН ГАНЦ юүлүүр тул түгжээг энд ч барина. */
    if (busy || locked) return;
    /* ⚠️ Батлагдаагүй НЭМЭЛТ мөр (сөрөг oid, 2026-09-25 аудит) — огноо · уялдаа
       ТАВИХГҮЙ: ноорогт орвол «Батлуулах» түүнийг илгээж, батлахад `save`
       мөрийг олохгүй (`staleN`) тул илгээлт хэзээ ч батлагдахгүй. */
    if (oid < 0) return;
    const at = plan.findIndex((x) => x.oid === oid);
    if (at < 0) return;
    let deps2 = deps;
    if (deps2) {
      /* ⚠️ БЛОКИЙН ТООНООС ДАВСАН `@N` (2026-09-24 аудит): багц цөөн блоктой
         болсон эсвэл гараар «@9» бичсэн бол тэр уялдаа ХЭЗЭЭ Ч үйлчлэхгүй —
         чимээгүй хадгалахгүй, хасаж ил хэлнэ. Бусад уялдаа хэвээр. */
      const over = deps2.filter((d) => d.blk != null && d.blk >= n);
      if (over.length) {
        setErr(tr('{0}-р блок алга — уялдаа хадгалагдсангүй', over.map((d) => String(d.blk! + 1)).join(', ')));
        deps2 = deps2.filter((d) => d.blk == null || d.blk < n);
      }
    }
    if (deps2) {
      /* ⚠️ Дугуй/шатлалын хамаарлын СҮҮЛЧИЙН хаалт: нэр дэвшигчдийг UI шүүдэг
         ч энд дахин шалгана — modal нээлттэй байх зуур өөр мөрөнд уялдаа
         нэмэгдсэн байж болно. Няцаах нь: (1) дугуй (reaches), (2) өвөг/удам
         бүлэг (hierRelated) — сүүлийнх нь гинжин эргэлт үүсгэдэг байсныг
         2026-09-03-ны review илрүүлсэн. Чимээгүй хасахгүй, бүхэлд нь няцаана. */
      const me = plan[at].des;
      /* ⚠️ Зөвхөн ШИНЭ уялдааг шалгана (2026-09-25 review): `reaches` нь бүлгийн
         гишүүнчлэлээр консерватив (`affectedCodes`-ийн ⚠️) тул хуучин, аль
         хэдийн хадгалагдсан уялдаа ч «дугуй» гэж унаж, тэр мөрийн уялдааг
         ХАСАХ/өөрчлөх засвар бүр няцаагддаг байв. Байгаа уялдааг үлдээх/хасах нь
         шинэ эргэлт үүсгэхгүй. Төрөл/хоцрогдол солих нь ирмэгийг өөрчлөхгүй тул
         зөвхөн КОДООР тулгана.
         ⚠️ Блокийг (@N) харгалзахгүй (2026-09-25): `reaches`/`hierRelated` нь
         блок үл тоодог тул X@1-ийг X@2 болгож зөөхөд шинэ эргэлт үүсэхгүй —
         (код, блок)-оор тулгавал хуучин уялдааг блокийг нь солиход л няцаадаг
         байв. */
      const had = new Set(plan[at].deps.map((d) => d.code));
      const badDep = deps2.filter((d) => !had.has(d.code)).some((d) => {
        const pi = byCode.get(d.code);
        if (pi != null && hierRelated(plan, at, pi)) return true;
        return me != null && reaches(plan, byCode, me, d.code);
      });
      if (badDep) {
        setErr(tr('Дугуй хамаарал үүсэх тул уялдаа хадгалагдсангүй.'));
        deps2 = null;
      } else {
        /* ⚠️ Танигдаагүй токеныг (гараар зассан «5FF2» г.м.) хэвээр угтуулж
           залгана — харагдахгүй ч ХАДГАЛАЛТАД УСТАХГҮЙ (review-ийн олдвор). */
        /* ⚠️ `rowsAll` (2026-09-24): `at` нь `plan`-ы индекс = `rowsAll`-ынх, `rows`-ынх БИШ */
        const keep = residualDeps(ham.get(oid) ?? rowsAll[at]?.ham ?? null);
        const text = [...keep, formatDeps(deps2)].filter(Boolean).join(',');
        setHam((m) => new Map(m).set(oid, text));
      }
    }
    const rows2 = deps2 ? plan.map((r, i) => (i === at ? { ...r, deps: deps2! } : r)) : plan;
    const overrides = new Map<number, (Span | null)[]>();
    if (spans) overrides.set(at, spans);
    applyChanges(propagate(rows2, n, overrides, deps2 ? [at] : []));
    /**
     * ⚠️ САРЫН ЗАДАРГАА нь `applyChanges`-ийн ДАРАА — тэр нь огноо
     * өөрчлөгдсөн блокуудыг АВТОМАТААР дахин тараадаг тул урьд нь тавьбал
     * гараар оруулсан утга шууд дарагдана. «Бүх блокт» тохиолдолд бусад
     * блок автомат тараалтаа авч, ЭНЭ блок нь гарын утгаа хадгална.
     */
    const des = plan[at].des;
    if (ob && des != null) {
      const { months, res } = ob;
      for (const bAt of blks) {
        const blok = sc?.bld[bAt];
        if (!blok) continue;
        const key = obKey(des, blok);
        /* ⚠️ СЕРВЕРТЭЙ ИЖИЛ задаргааг ноорогт ҮЛДЭЭХГҮЙ (2026-09-21): чирэлтийг
           цуцлахад (`onClose` → `u.months`) задаргаагүй ажилд ХООСОН Map буцаж
           ирдэг байсан нь obDraft-д үлдэж, «Батлуулах»-ыг «1 ажлын задаргаа
           тэнцэхгүй» гэж түгждэг байв. Ижил бол хасна — бичих зүйлгүй.
           ⚠️ Блок бүрд ШИНЭ Map (хуулбар) — нэг Map-ыг хуваалцвал нэг блокийн
              засвар нөгөөд «чимээгүй» орно. */
        if (months) {
          const mine = new Map(months);
          setObDraft((m) => {
            const next = new Map(m);
            if (sameMonths(mine, obPlan.get(des)?.get(blok))) next.delete(key);
            else next.set(key, mine);
            return next;
          });
        }
        if (res) {
          const mine = new Map(res);
          setObResDraft((m) => {
            const next = new Map(m);
            if (sameRes(mine, obRes.get(des)?.get(blok))) next.delete(key);
            else next.set(key, mine);
            return next;
          });
        }
      }
    }
  }, [plan, byCode, n, busy, locked, ham, rowsAll, applyChanges, sc, blk, obPlan, obRes]);

  /**
   * POPUP-ЫН «Тавих» — БОДИТ ОГНОО (энэ блок) ба НӨӨЦ (мөр) (2026-09-23).
   *
   * ⚠️ `applyModal`-аас ТУСДАА: тэр нь `propagate` (гинж) ба `rollUpGroups`
   *    (бүлэг) руу явдаг; бодит огноо/нөөц тэдгээрт ОРОХГҮЙ — зөвхөн ноорог.
   * ⚠️ СЕРВЕРТЭЙ ИЖИЛ болвол ноорогоос ХАСНА (`applyChanges`-ийн 2026-09-21-ний
   *    дүрэм) — эс бөгөөс буцаасан засвар «хадгалаагүй 1» гэж үлдэнэ.
   * ⚠️ Бүлгийн мөрд ХЭЗЭЭ Ч бичихгүй (`aggExtra`-аар бодогддог); popup нь
   *    бүлэгт талбарыг хаадаг ч энд давхар хаана.
   */
  const applyExtra = useCallback((
    oid: number,
    /** Бодит огноог тавих блокууд (2026-09-24 — popup олон блок сонгодог болсон) */
    blks: number[],
    actual: { start: number | null; end: number | null } | null,
    res: { hun: number | null; mashin: number | null } | null,
  ) => {
    if (busy || locked) return;
    const orig = rows.find((r) => r.oid === oid);
    if (!orig || orig.group) return;
    const ok = blks.filter((b) => b >= 0 && b < n);
    if (actual && ok.length) {
      setADraft((m) => {
        const next = new Map(m);
        const cur = next.get(oid);
        const start = (cur ? cur.start : orig.aStart).slice();
        const end = (cur ? cur.end : orig.aEnd).slice();
        for (const bAt of ok) { start[bAt] = actual.start; end[bAt] = actual.end; }
        const same = start.every((v, b) => v === (orig.aStart[b] ?? null))
          && end.every((v, b) => v === (orig.aEnd[b] ?? null));
        if (same) next.delete(oid); else next.set(oid, { start, end });
        return next;
      });
    }
    if (res) {
      setResDraft((m) => {
        const next = new Map(m);
        if ((res.hun ?? null) === (orig.hun ?? null) && (res.mashin ?? null) === (orig.mashin ?? null)) next.delete(oid);
        else next.set(oid, { hun: res.hun, mashin: res.mashin });
        return next;
      });
    }
  }, [busy, locked, rows, n]);

  /**
   * ХАМААРЛЫГ НҮДЭНД ШУУД БИЧИХ (2026-09-15, хэрэглэгчийн хүсэлт:
   * «11FS14 гэж шууд бичиж холбоос хийх боломжтой болгох»).
   *
   * ⚠️ POPUP-ЫГ ОРЛОХГҮЙ, ХАЖУУД НЬ. Popup нь ажлын НЭРЭЭР сонгуулдаг тул
   *    кодоо мэдэхгүй хүнд зайлшгүй; энэ нь кодоо мэддэг хүнд ХУРДАН зам.
   *    MS Project-ийн Predecessors нүд яг ийм ажилладаг.
   *
   * ⚠️ БҮХ ШАЛГУУР `applyModal`-д (дугуй хамаарал, шатлалын зөрчил, танигдаагүй
   *    токен хадгалах) — энд ДАВХАРДУУЛАХГҮЙ. Зөвхөн текстийг `Dep[]` болгож
   *    дамжуулна; буруу бичсэн токеныг `parseDeps` өөрөө алгасана.
   *
   * ⚠️ Хоосон болговол уялдааг ЦЭВЭРЛЭНЭ (`[]`) — `null` нь «бүү хөндөөрэй»
   *    гэсэн утгатай тул ялгах ёстой.
   */
  /**
   * ШУГАМААР ХОЛБОХ ЧИРЭЛТ — бариулаас эхлээд `window` дээр дуусна (2026-09-22).
   *
   * ⚠️ Pointer capture АВАХГҮЙ: зорилтыг `elementFromPoint`-оор олдог тул хулгана
   *    доорх элемент нь ЖИНХЭНЭ мөр байх ёстой (capture авбал үргэлж бариул).
   * ⚠️ Хамаарал нь ЗОРИЛТ мөрд бичигдэнэ (зорилт нь урд ажлаас хамаарна) — сумны
   *    чиглэлтэй ижил: урд ажлын баруун зах → хамаарагчийн зүүн зах.
   * ⚠️ Урд ажилд код (`des`) алга бол холбож болохгүй — уялдаа кодоор бичигддэг.
   * ⚠️ БҮЛЭГ ↔ БҮЛЭГ, БҮЛЭГ ↔ АЖИЛ БҮГД ХОЛБОГДОНО (2026-09-22, хэрэглэгч:
   *    «бүлэг хооронд уялдаа хийх боломжтой, бүгд өөр хоорондоо холбогдох
   *    ёстой»). Хөдөлгүүр аль хэдийн дэмждэг: бүлэг урд ажил бол `effSpan`
   *    (хүүхдийн MIN/MAX), бүлэг хамаарагч бол `propagate` дэд модыг бүхэлд нь
   *    шилжүүлнэ. ЗӨВХӨН өвөг ↔ удам (өөрийн дотоод) холбоос хориотой хэвээр —
   *    `applyModal`-ын `hierRelated` шалгуур (гинжин эргэлт).
   */
  const startLink = (e: PEvt<HTMLElement>, r: PlanRow) => {
    /* ⚠️ (2026-09-23) Уялдаа ЗӨВХӨН төлөвлөгөөнд — гэрээ табд (`kind !== 'plan'`)
       холбохгүй (дээрх `PlanKind` тайлбар: «гэрээ нь гинжээр хөдөлдөггүй»). */
    if (!canEdit || locked || busy || kind !== 'plan') return;
    e.preventDefault();
    e.stopPropagation();
    if (r.des == null) {
      setErr(tr('Энэ ажилд код алга — хамаарлын урд ажил болж чадахгүй.'));
      return;
    }
    const lanes = lanesRef.current;
    if (!lanes) return;
    const pos = (ev: { clientX: number; clientY: number }) => {
      const b = lanes.getBoundingClientRect();
      return { x: ev.clientX - b.left, y: ev.clientY - b.top };
    };
    setSel(r.oid);
    setErr('');
    setLink({ i: r.i, ...pos(e) });
    const mv = (ev: PointerEvent) => setLink({ i: r.i, ...pos(ev) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setLink(null);
      if (ev.type === 'pointercancel') return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-row]') as HTMLElement | null;
      let ti = el ? Number(el.dataset.row) : NaN;
      /* ⚠️ (2026-09-23) `elementFromPoint` нь сум (`depHit`), түр шугам, огнооны
         толгой мэт `[data-row]`-гүй элемент дээр тусвал `null` болж чимээгүй
         унадаг байв. Нөөц зам: мөрийн өндөр ТОГТМОЛ (`PL_ROW`) тул Y координатаас
         `visible[k]`-г шууд олно — зурвасын эгнээний дотор л байхад хангалттай. */
      if (!Number.isInteger(ti)) {
        const b = lanes.getBoundingClientRect();
        const x = ev.clientX - b.left;
        const k = Math.floor((ev.clientY - b.top) / PL_ROW);
        if (x >= 0 && x <= b.width && k >= 0 && k < visible.length) ti = visible[k].i;
      }
      /* ⚠️ (2026-09-23) Өөр дээрээ тавибал ЧИМЭЭГҮЙ (санамсаргүй суллалт);
         мөр олдохгүй бол дохио — урьд нь юу ч болоогүй мэт байв. */
      if (ti === r.i) return;
      const t = Number.isInteger(ti) ? plan[ti] : undefined;
      if (!t) { setErr(tr('Хамаарал холбогдсонгүй — хуанлийн мөр (зурвасын эгнээ) дээр тавина уу.')); return; }
      /* ⚠️ Батлагдаагүй нэмэлт мөр (2026-09-24) — кодгүй, серверт байхгүй; уялдаа тавихгүй */
      if (t.oid < 0) { setErr(tr('Энэ мөр батлагдаагүй нэмэлт ажил — батлагдсаны дараа уялдаа тавина.')); return; }
      if (hierRelated(plan, ti, r.i)) { setErr(tr('Өөрийн бүлэг/дэд ажилтайгаа холбож болохгүй — гинжин эргэлт үүснэ.')); return; }
      /* ⚠️ ДУГУЙ ХАМААРЛЫГ ЭНД (2026-09-23): урьд нь зөвхөн `applyModal`-д
         шалгагддаг тул хэрэглэгч цонхонд төрөл/хоногоо бөглөж «Тавих» дарсны
         ДАРАА л «дугуй» гэж няцаагддаг байв. Одоо суллахад шууд — цонх нээгдэхгүй.
         Чиглэл `applyModal`-тай ижил: хамаарагч (`t`) → урд ажил (`r`). */
      if (t.des != null && reaches(plan, byCode, t.des, r.des as number /* дээр `r.des == null` таслагдсан */)) {
        setErr(tr('Дугуй хамаарал үүсэх тул холбож болохгүй.'));
        return;
      }
      /* ⚠️ Шууд тавихгүй — цонх нээж төрөл (дуусаад / зэрэг эхлэх) ба хоногийг
         асууна (2026-09-22, хэрэглэгч: «чирээд холбосны дараа … цонх гарах ёстой»).
         Аль хэдийн холбогдсон бол цонх нь тэр уялдааг ЗАСНА (давхардуулахгүй). */
      /* ⚠️ БЛОК ТУС БҮРИЙН уялдаа (2026-09-24): чирж холбосон хамаарал зөвхөн
         ИДЭВХТЭЙ блокт (`@N`). Синтетик ганц блоктой багцад блокгүй — `@` гарахгүй. */
      /* ⚠️ 2026-09-25 аудит: энэ хосод БЛОКГҮЙ (бүх блок) уялдаа аль хэдийн байгаа
         бөгөөд `@N` уялдаа байхгүй бол ТЭРИЙГ засна — урьд нь `@N` нэмэгдэж, тэр
         блокт хоёр уялдаа (давхар шилжилт) үүсдэг байв. */
      const dblk0 = sc?.synthetic || n === 1 ? null : blk;
      const rd = r.des as number;
      const hasExact = dblk0 != null && t.deps.some((d) => sameDep(d, { code: rd, blk: dblk0 }));
      const hasAll = t.deps.some((d) => sameDep(d, { code: rd, blk: undefined }));
      setLinkAsk({ so: r.oid, to: t.oid, dblk: dblk0 != null && !hasExact && hasAll ? null : dblk0 });
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /**
   * Мөрийн ИДЭВХТЭЙ БЛОКИЙН муж — бүлэгт хүүхдээс (`effSpan`), ажилд өөрийнх.
   * ⚠️ (2026-09-23) Урьд нь бүх блокийн MIN/MAX (`rowSpan`) байсан тул зүүн
   *    самбарын огноо нь зурвас ба «Бодит» баганаас (идэвхтэй `blk`) зөрдөг байв.
   *    Хуваарьгүй блок → `null` → «—» (0 БИШ) хэвээр.
   */
  const rowSpanAt = useCallback((r: PlanRow): Span | null => (
    r.group ? effSpan(plan, r.i, blk) : (r.spans[blk] ?? null)
  ), [plan, blk]);
  /** Нөгөө төрлийн (гэрээ ↔ төлөвлөгөө) мөрийн идэвхтэй блокийн муж — дээрхтэй ижил дүрэм */
  const refSpanAt = useCallback((oid: number): Span | null => {
    const rr = refByOid.get(oid);
    if (!rr) return null;
    return rr.group ? effSpan(refBase, rr.i, blk) : (rr.spans[blk] ?? null);
  }, [refByOid, refBase, blk]);

  const applyHamText = useCallback((oid: number, text: string) => {
    /* ⚠️ Хадгалалт явж байхад бичсэн уялдаа чимээгүй алга болдог байв (2026-09-23
       аудит) — одоо мэдэгдэнэ; нүд нь хадгалсан утга руугаа буцна. */
    if (busy) { setErr(tr('Хадгалж байна — түр хүлээгээд уялдааг дахин оруулна уу.')); return; }
    if (locked || !canEdit) return;
    const cur = plan.find((x) => x.oid === oid);
    if (!cur) return;
    const next = parseDeps(text);
    /* Өөрчлөгдөөгүй бол дэмий тархалт хийхгүй — 1,400 мөрийн `propagate`
       нь хямд биш, мөн «хадгалаагүй» тэмдэг худал асахгүй. */
    if (formatDeps(next) === formatDeps(cur.deps)) return;
    setErr('');
    applyModal(oid, null, next, null);
  }, [busy, locked, canEdit, plan, applyModal]);

  /* ── Чирэлт ── */

  /**
   * ЭНЭ ЧИРЭЛТИЙН ХӨДӨЛГӨСӨН мөрүүд (oid) — цуцлахад ЗӨВХӨН эдгээрийг буцаана
   * (2026-09-24). Урьд нь агшин (`snap`)-аас зөрсөн БҮХ мөрийг буцаадаг тул
   * чирэлт/цонхны хооронд хамт ажиллагчийн алсаас нийлсэн нүд ч «цуцлагдаж»
   * байв. `commit` бүрд `propagate`-ийн үр дүнгээс цуглуулна.
   */
  const dragTouched = useRef(new Set<number>());
  /*
   * ХУВААЛЦСАН НООРОГИЙН ЭРТ ЗАРЛАГДАХ ref-үүд (2026-09-24) — доорх блокоос
   * ӨМНӨ тодорхойлогддог `sendForApproval` · `withdraw` · `clearPreview`
   * тэдгээрт хүрэх ёстой. Утгыг блок дотор л бичнэ.
   */
  const hdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hdFlushRef = useRef<() => Promise<void>>(async () => {});
  const hdClearRef = useRef<(key: string) => Promise<void>>(async () => {});
  /**
   * АЛСЫН `at`-ын СҮҮЛД ХАРСАН УТГА — нийлүүлсэн эсвэл өөрөө бичсэн.
   * ⚠️ `>`-ээр ХАРЬЦУУЛАХГҮЙ (2026-09-24): `at` нь бичигчийн цаг тул цагийн
   *    зөрүүтэй клиент бусдын бичилтийг «хуучин» гэж алгасаж дарж бичдэг
   *    байв. Одоо `at0 !== hdLastSeenAt` бол ЯМАР Ч тохиолдолд дахин уншина;
   *    өөрийн бичилтийн дараа бичсэн `t`-г тавина (сервер яг тэр утгыг
   *    хадгалдаг) — өөр хэн нэг завсарт бичсэн бол утга зөрж, дахин уншина.
   */
  const hdLastSeenAt = useRef(0);
  /**
   * БИЧИЛТИЙН ҮЕ (generation) — цэвэрлэлт/түлхүүр солигдох бүрд +1 (2026-09-24).
   * ⚠️ Явж буй `saveRemoteDraft` цэвэрлэлтийн ДАРАА буувал хаясан ноорог алсад
   *    амилдаг байв; үе зөрсөн бол бууж ирмэгц дахин цэвэрлэнэ.
   */
  const hdGen = useRef(0);
  /**
   * ТҮГЖЭЭ ТАЙЛАГДАХ дараагийн удаад Map-уудыг ХООСЛОХГҮЙ (2026-09-24):
   * `withdraw` нь илгээлтийг ноорогт буулгадаг — тэр агуулга «илгээхээс
   * өмнөх хуучин нүд» биш, зохиогчийн буцааж авсан ажил.
   */
  const hdSkipUnlockOnce = useRef(false);

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
       Хамаарал байхгүй бол `propagate` нь зөвхөн энэ мөрийг л буцаана. */
    const ch = propagate(plan, n, new Map([[at, next]]));
    for (const i of ch.keys()) if (plan[i]) dragTouched.current.add(plan[i].oid);
    applyChanges(ch);
  }, [plan, blk, n, applyChanges]);

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
    if (!canEdit || locked || busy) return;
    /* ⚠️ БҮЛГИЙН МУЖ ГАРААР ЗАСАГДАХГҮЙ (2026-09-06, хэрэглэгч: «бүлгийн
       range өөрчлөх боломжгүй, ажлын range-ээс хамаарч автоматаар»).
       Мөрийг СОНГОНО — чирэлт эхлэхгүй. */
    /* ⚠️ Батлагдаагүй НЭМЭЛТ мөр (сөрөг oid, 2026-09-24) ЗАСАГДАХГҮЙ — ноорогт
       сөрөг oid орвол `save` серверээс мөрийг олохгүй. Батлагдсаны дараа
       серверийн oid-тай ирж ердийн мөр болно. */
    if (r.oid < 0) return;
    if (r.group) { setSel(r.oid); return; }
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const k = dayAt(e.clientX);
    lastDay.current = k;
    moved.current = false;
    /* ⚠️ Сарын задаргааг ЧИРЭЛТЭЭС ӨМНӨ хуулна (2026-09-17): чирэлт `applyChanges`-аар
       задаргааг хумьдаг тул буцаахад зөвхөн энэ хуулбар л бүтэн сэргээнэ. */
    const blokName = sc?.bld[blk] ?? '';
    const origMonths = r.des != null && blokName ? new Map(obOf(r.des, blokName)) : null;
    const origRes = r.des != null && blokName ? new Map(obResOf(r.des, blokName)) : null;
    dragTouched.current = new Set([r.oid]);
    setDrag({
      oid: r.oid, mode, anchor: k, orig: r.spans[blk], origMonths, origRes,
      snap: new Map(plan.map((x) => [x.oid, x.spans[blk]] as const)),
      obSnap: new Map(obDraft), obResSnap: new Map(obResDraft),
    });
    setSel(r.oid);
  };

  const onMove = (e: PEvt<HTMLElement>) => {
    if (!drag) return;
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

  const onUp = () => {
    /* Хөдөлгөөнгүй товшилт: хоосон мөрд 1 хоногийн муж, эсрэг тохиолдолд
       зөвхөн сонголт (дээрх тайлбар). */
    const blank = !!drag && !moved.current && drag.mode === 'new' && !drag.orig;
    if (drag && blank) {
      commit(drag.oid, { start: msAt(drag.anchor), end: msAt(drag.anchor) });
    }
    /**
     * ЧИРЭЛТЭЭР ТӨЛӨВЛӨСНИЙ ДАРАА САРЫН ЗАДАРГААГ ИЛ ГАРГАНА (2026-09-06,
     * хэрэглэгч: «зураасаар төлөвлөхөд мөн адил гарах ёстой»).
     *
     * ⚠️ Тараалт нь `applyChanges` дотор аль хэдийн хийгдсэн бөгөөд нийлбэр нь
     *    үргэлж тэнцүү — цонх нь ЗАСАХ боломж, шаардлага БИШ.
     * ⚠️ ЗӨВХӨН хуваарь ӨӨРЧЛӨГДСӨН үед: хуваарьтай мөрд ЗҮГЭЭР товшиход
     *    цонх үсрэн гарвал «товшилт ≠ чирэлт» гэсэн дүрэм эвдэрнэ.
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
        };
      }
    }
    setDrag(null);
    moved.current = false;
  };

  /*
   * ⚠️ «Мужид жигд хуваарилах» ба «Хуваарь арилгах» товчнууд 2026-09-01-нд
   * ХАСАГДСАН (хэрэглэгчийн шийдвэр). Хоёулаа СОНГОСОН мөр дээр ажилладаг
   * байсан тул «аль мөр сонгогдсон бэ» гэдгийг санах шаардлагатай далд төлөв
   * үүсгэдэг байв. Арилгах нь одоо popup цонхонд («Арилгах») — тэнд ямар ажил,
   * ямар блокийг арилгаж байгаа нь ил харагдана.
   *
   * ⚠️ «Бүх блокт алхмаар тараах» товч 2026-09-02-нд ХАСАГДСАН (хэрэглэгч).
   * Тэр нь ХАРАГДАЖ БУЙ БҮХ мөрийн бүх блокийг нэг товшилтоор дарж бичдэг
   * байсан — шүүлт буруу тавьсан үед 264+ нүд чимээгүй устдаг эрсдэлтэй.
   * Тархаалт нь одоо popup хуанлид ҮЛДСЭН: тэнд НЭГ ажлын хүрээнд, ямар блок,
   * ямар алхмаар тархаж байгаа нь ил бөгөөд баталгаажуулалттай.
   */

  /* ── Хадгалах ── */

  /* ⚠️ БУЦААХ УТГА (2026-09-25 аудит): `true` = бичих алхам дууслаа (ноорог
     цэвэрлэгдсэн/тэнцээгүйг үлдээсэн), `false` = ЭХЛЭЭГҮЙ эсвэл УНАСАН (ноорог
     бүтнээрээ үлдэв). Батлах эффект `busy`-ийн хөдөлгөөнөөс биш, үүнээс мэднэ. */
  const save = useCallback(async (): Promise<boolean> => {
    if (!sc || !dirtyN || busy) return false;
    setBusy(true); setErr(''); setNote('');
    /* ⚠️ Ноорогоо ОДОО барьж авна: async явцад орсон (онолын хувьд —
       оролтууд busy-д хаалттай ч) шинэ засварыг төгсгөлд нь УСТГАХГҮЙН тулд
       зөвхөн эдгээр түлхүүрийг цэвэрлэнэ. */
    const tookD = [...draft.keys()];
    const tookH = [...ham.keys()];
    const tookA = [...aDraft.keys()];
    const tookR = [...resDraft.keys()];
    try {
      const byOid = new Map(rows.map((r) => [r.oid, r]));
      /**
       * ⚠️ НООРОГИЙН OID нь ОДООГИЙН агшинд ОЛДОХГҮЙ БАЙВАЛ (2026-09-08).
       *
       * Батлах урсгалд илгээлтийн `payload` нь ИЛГЭЭСЭН ҮЕИЙН OBJECTID-аар
       * түлхүүрлэгддэг. Хооронд нь «Гүйцэтгэл бөглөх» нийтлэгдвэл архивт
       * бүтэн шинэ хуулбар нэмэгдэж БҮХ OID солигдоно. Тэр үед батлагчийн
       * `rows` ба доорх `fresh` ХОЁУЛАА ШИНЭ агшных тул доорх `rows[0].oid`-ийн
       * харьцуулалт ХУДАЛ гарч, зөөлт огт ажиллахгүй байв: мөр бүр чимээгүй
       * алгасагдаж, `upd` хоосон болж, «Өөрчлөлт олдсонгүй» гэж АМЖИЛТ мэт
       * харагдаад дээрх `useEffect` илгээлтийг `approved` болгодог байв —
       * гүйцэтгэгчийн олон зуун мөр ул мөргүй алга болно.
       *
       * ⚠️ ХУУЧИН OID-оос ажлын мөрийг СЭРГЭЭХ БОЛОМЖГҮЙ: `payload` нь
       *    зөвхөн OID агуулна, (№ + ажлын нэр) нь `rows`-оос л гардаг тул
       *    OID нь тэнд байхгүй бол зөөх түлхүүр алга. Тиймээс ЧИМЭЭГҮЙ
       *    алгасахын оронд ИЛ ТАТГАЛЗАНА — ноорог хэвээр үлдэж, `dirtyN`
       *    тэглэгдэхгүй тул илгээлт `approved` болохгүй.
       */
      const staleN = [...new Set([...draft.keys(), ...ham.keys(), ...aDraft.keys(), ...resDraft.keys()])]
        .filter((oid) => !byOid.has(oid)).length;
      if (staleN) {
        setErr(tr('{0} мөр энэ хуудаснаас олдсонгүй — хуудас хооронд нь шинэчлэгдсэн байна. Хуваарь бичигдсэнгүй; хуудсаа сэргээгээд дахин илгээнэ үү.', num(staleN)));
        return false;
      }
      const upd: Record<string, unknown>[] = [];
      for (const [oid, spans] of draft) {
        const orig = byOid.get(oid);
        if (!orig) continue;
        const a: Record<string, unknown> = { [sc.f.oid]: oid };
        let changed = 0;
        spans.forEach((s, b) => {
          /* ⚠️ Талбар байхгүй блок бий (эх хуудасны толгой эвдэрсэн) — тэнд
             бичих газаргүй тул АЛГАСНА, унахгүй. */
          /* ⚠️ ТӨРӨЛ бүрд ӨӨР талбар (2026-09-11). `kind` нь хадгалах
             агшинд уншигдана — ноорог нь солигдоход цэвэрлэгддэг тул
             өөр төрлийн ноорог энд хүрэх боломжгүй. */
          const fStart = kind === 'geree' ? sc.gStart[b] : sc.start[b];
          const fEnd = kind === 'geree' ? sc.gEnd[b] : sc.end[b];
          if (!fStart && !fEnd) return;
          const ns = s ? s.start : null;
          const ne = s ? s.end : null;
          /**
           * ⚠️ ЗӨВХӨН ӨӨРЧЛӨГДСӨН БЛОКИЙГ бичнэ.
           *
           * Урьд нь ноорогтой мөрийн БҮХ блокийг бичдэг байв. `toPlanRows`-д
           * муж нь эхлэх БА дуусах хоёулаа байж л үүсдэг тул ЗӨВХӨН эхлэх
           * огноотой (эсвэл зөвхөн дуусахтай) хагас бөглөсөн блок нь `null`
           * муж болж, хадгалахад тэр огноо ЧИМЭЭГҮЙ УСТДАГ байлаа — өөр
           * блокт нэг зурвас чирсний төлөө.
           */
          const os = kind === 'geree' ? orig.gStart[b] : orig.start[b];
          const oe = kind === 'geree' ? orig.gEnd[b] : orig.end[b];
          if (ns === os && ne === oe) return;
          /*
           * ⚠️ ХАГАС БӨГЛӨСӨН БЛОКИЙГ ХӨНДӨХГҮЙ (2026-09-11-ний аудит, хэмжсэн).
           *    Дээрх тайлбар «зөвхөн өөрчлөгдсөн блокийг» гэж бичсэн ч эх мөрд
           *    ЗӨВХӨН эхлэх (эсвэл зөвхөн дуусах) огноотой блок нь `toPlanRows`-д
           *    `null` муж болдог тул ноорогт `null` хэвээр орж, диффд `null ≠
           *    огноо` гарч, тэр огноо `null` болж БИЧИГДДЭГ байв — хэрэглэгч
           *    өөр блокт зурвас чирсний төлөө. Ноорог `null` БА эх мөр хагас
           *    бол хэрэглэгч ЭНЭ блокийг хөндөөгүй гэсэн үг: алгасна.
           *    Хэрэглэгч блокийг ЗОРИУД цэвэрлэвэл `commit(oid, null)` явдаг ч
           *    тэр нь эх нь БҮТЭН (`os && oe`) байсан үед л ялгаатай — хагас
           *    эхийг цэвэрлэх боломж алдагдана, гэхдээ огноо устахаас дээр.
           */
          if (s === null && (os != null) !== (oe != null)) return;
          if (fStart) a[fStart] = ns;
          if (fEnd) a[fEnd] = ne;
          changed += 1;
        });
        if (changed) upd.push(a);
      }
      /* УЯЛДААНЫ НООРОГ — огнооны бичилттэй нэг мөрөнд нийлүүлнэ. Хоосон
         текст нь `null` болж талбарыг цэвэрлэнэ (хоосон мөр хадгалахгүй). */
      if (sc.f.ham) {
        for (const [oid, text] of ham) {
          const orig = byOid.get(oid);
          if (!orig) continue;
          const v = text.trim() || null;
          if ((orig.ham ?? null) === v) continue;
          const ex = upd.find((u) => u[sc.f.oid] === oid);
          if (ex) ex[sc.f.ham] = v;
          else upd.push({ [sc.f.oid]: oid, [sc.f.ham]: v });
        }
      }
      /**
       * БОДИТ ОГНООНЫ НООРОГ (2026-09-23) — огнооны бичилттэй нэг мөрөнд.
       * ⚠️ ЗӨВХӨН ӨӨРЧЛӨГДСӨН БЛОКИЙГ — `draft`-ын ижил дүрэм; талбаргүй
       *    блокийг алгасна (унахгүй). `kind`-ээс ХАМААРАХГҮЙ: бодит талбар
       *    нэг л байна.
       * ⚠️ Хагас бүртгэл (эхэлсэн, дуусаагүй) ХЭВИЙН — `null`-г ч бичнэ
       *    (цэвэрлэх = «бүртгэлгүй» болгох), гэхдээ зөвхөн зөрсөн үед.
       */
      const upsert = (oid: number): Record<string, unknown> => {
        const ex = upd.find((u) => u[sc.f.oid] === oid);
        if (ex) return ex;
        const a: Record<string, unknown> = { [sc.f.oid]: oid };
        upd.push(a);
        return a;
      };
      for (const [oid, ad] of aDraft) {
        const orig = byOid.get(oid);
        if (!orig) continue;
        let changed = 0;
        const a: Record<string, unknown> = {};
        ad.start.forEach((ns, b) => {
          const ne = ad.end[b] ?? null;
          const os = orig.aStart[b] ?? null;
          const oe = orig.aEnd[b] ?? null;
          if (ns === os && ne === oe) return;
          if (sc.aStart[b]) { a[sc.aStart[b]!] = ns; changed += 1; }
          if (sc.aEnd[b]) { a[sc.aEnd[b]!] = ne; changed += 1; }
        });
        if (changed) Object.assign(upsert(oid), a);
      }
      /* ХҮН ХҮЧ · МАШИН МЕХАНИЗМ — талбар байвал, зөрсөн үед л (2026-09-23) */
      for (const [oid, rd] of resDraft) {
        const orig = byOid.get(oid);
        if (!orig) continue;
        const a: Record<string, unknown> = {};
        if (sc.f.hunHuch && (rd.hun ?? null) !== (orig.hun ?? null)) a[sc.f.hunHuch] = rd.hun;
        if (sc.f.mashin && (rd.mashin ?? null) !== (orig.mashin ?? null)) a[sc.f.mashin] = rd.mashin;
        if (Object.keys(a).length) Object.assign(upsert(oid), a);
      }
      /**
       * ⚠️ ЭРТ БУЦАЛТ нь ЗӨВХӨН огноо·уялдаа·ОБЬЁМ ГУРВУУЛАА хоосон үед
       *    (2026-09-08). Урьд нь зөвхөн `upd.length`-ыг шалгадаг байсан тул
       *    ЗӨВХӨН сарын обьёмоо зассан тохиолдолд («Тавих» дээр огноо
       *    хөндөөгүй) энд буцаж, обьём ХЭЗЭЭ Ч бичигддэггүй байв. Батлах
       *    урсгалд бүр ноцтой: `obDraft` цэвэрлэгдэхгүй тул `dirtyN > 0`
       *    үлдэж, «эх хуудсанд бичигдсэнгүй» гэж алдаа өгөөд илгээлт
       *    `pending` хэвээр гацдаг байлаа.
       * ⚠️ Ноорогийг `tookD`/`tookH`-ээр л цэвэрлэнэ — `new Map()` нь энэ
       *    async явцад орсон ШИНЭ засварыг ч хамт устгана.
       */
      /*
       * ── САРЫН ОБЬЁМ — засварыг ЭНД БЭЛТГЭНЭ, доор (огнооны дараа) БИЧНЭ ──
       * ⚠️ Бэлтгэл нь мөрийн нийлбэрээс ӨМНӨ (2026-09-24 аудит): тэнцээгүй
       *    (`unbalKeys`) буюу талбаргүй тул бичигдэхгүй блокийн нөөц мөрийн
       *    хүн/машинд орж, мөр нь сарын хүснэгттэй зөрдөг байв. Бичилт нь
       *    хуваарийн огноо бичигдсэний ДАРАА хэвээр (доорх `obEdits`).
       * ⚠️ Холбоос нь `Des_dugaar` — `ObjectID` БИШ. Тиймээс доорх агшин
       *    солигдох (`oidMap`) асуудал ЭНД хамаарахгүй: ажлын код нийтлэл
       *    бүрд тогтвортой.
       * ⚠️ Кодгүй мөрд задаргаа хадгалахгүй — холбох зүйлгүй.
       */
      let obN = 0;
      /** Нийлбэр нь нийт обьёмтой тэнцээгүй тул бичигдээгүй (ажил·блок) */
      let unbal = 0;
      const unbalKeys = new Set<string>();
      /** Сарын нөөцийн талбар үйлчилгээнд АЛГА — бичигдээгүй (ажил·блок) (2026-09-24) */
      let resSkipped = 0;
      /* ⚠️ Бичигдээгүй нөөцийн түлхүүрүүд (2026-09-24 аудит) — `unbalKeys`-тэй адил
         ноорогт ҮЛДЭЭНЭ; урьд нь цэвэрлэгдэж, батлалт «бичигдлээ» гэж үргэлжилдэг байв. */
      const resSkippedKeys = new Set<string>();
      /** Мужаас ГАДУУРХ (обьёмгүй) сарын нөөц хаягдсан (ажил·блок) (2026-09-24 аудит) */
      let resDropped = 0;
      /** Талбарын шалгалт 2 удаа ч бүтсэнгүй → нөөц бичигдэхгүй (2026-09-24 аудит) */
      let rfUnknown = false;
      const fields = { hun: false, mashin: false };
      let obEdits: PlanEdits | null = null;
      if (obDraft.size || obResDraft.size) {
        const byDes = new Map(base.map((r) => [r.des, r]));
        const all: PlanEdits = { adds: [], updates: [], deletes: [] };
        /* ⚠️ Талбарын шалгалт: `null` (мэдэхгүй) бол НЭГ удаа дахин оролдоно; мөн л
           мэдэхгүй бол БАЙХГҮЙ гэж үзнэ (2026-09-24 аудит) — урьд нь `null`-д
           бичихийг оролдож, талбаргүй үйлчилгээнд бүх мөр унадаг байв. */
        let rf = await obyemResFields();
        if (rf.hun == null || rf.mashin == null) rf = await obyemResFields();
        rfUnknown = rf.hun == null || rf.mashin == null;
        fields.hun = rf.hun === true; fields.mashin = rf.mashin === true;
        for (const key of new Set([...obDraft.keys(), ...obResDraft.keys()])) {
          const cut = key.indexOf("|");
          const des = Number(key.slice(0, cut));
          const blok = key.slice(cut + 1);
          const r = byDes.get(des);
          if (!r || !blok) continue;
          /* Обьёмын ноорог байхгүй бол СЕРВЕРИЙН задаргаан дээр нөөц л өөрчлөгдсөн */
          const months = obDraft.get(key) ?? obPlan.get(des)?.get(blok) ?? new Map<string, number>();
          /**
           * ⚠️ ТЭНЦЭЭГҮЙ ЗАДАРГААГ БИЧИХГҮЙ (2026-09-08).
           *
           * Popup-аар бөглөхөд `mvOk` шалгуур нийлбэрийг барьдаг ч ГИНЖЭЭР
           * (уялдаа, чирэлт) хуваарь шилжихэд popup нээгддэггүй: `keepMonths`
           * нь шинэ мужид ОРООГҮЙ саруудыг хаядаг тул нийлбэр чимээгүй
           * ЗАДАРНА (1000 → 500). Тэр задаргаа бичигдвэл `planPctFromMonths`
           * нь `done / sumMonths(m)` гэж САРУУДЫН НИЙЛБЭРТ хуваадаг учир
           * тайрагдсан задаргаа өөрийгөө 100% болгож нормчилно — S-муруй,
           * хоцрогдлын дохио бүгд ЧИМЭЭГҮЙ худал болно.
           *
           * ⚠️ ХАГАС задаргаа бичихээс ТАТГАЛЗАНА (`null ≠ 0`): бичихгүй
           *    орхивол хуучин бүтэн задаргаа хэвээр үлдэж, хүн дахин бөглөнө.
           *    Хоосон (бүх сар нь хоосон) задаргаа нь «арилгах» гэсэн
           *    санаатай үйлдэл тул үүнд хамаарахгүй.
           * ⚠️ Обьёмгүй мөрд (`vol` нь null/0) шалгах суурь алга — хэвээр.
           */
          if (months.size && r.vol != null && r.vol > 0 && !balanced(months, r.vol)) {
            unbal += 1;
            unbalKeys.add(key);
            continue;
          }
          /* ⚠️ Мужаас ГАДУУРХ сарын нөөцийг `buildEdits` чимээгүй хаядаг (обьёмгүй
             сард мөр байхгүй) — ЭНД хасаж тоолно, доор анхааруулна (2026-09-24 аудит). */
          let resCur = obResDraft.get(key);
          if (resCur) {
            const t = new Map<string, MonthRes>();
            let drop = 0;
            for (const [sar, v] of resCur) { if (months.has(sar)) t.set(sar, v); else drop += 1; }
            if (drop) { resDropped += 1; resCur = t; }
          }
          /* ⚠️ Талбар тус бүрээр (2026-09-24 аудит): байхгүй талбарт ноорог УТГАТАЙ
             байвал л тоолно — хоосон талбарт анхааруулдаг байв. */
          if (resCur) {
            let need = false;
            for (const v of resCur.values()) {
              if ((!fields.hun && v.hun != null) || (!fields.mashin && v.mashin != null)) { need = true; break; }
            }
            if (need) { resSkipped += 1; resSkippedKeys.add(key); }
          }
          const meta: WorkMeta = {
            bagts: pkg.key,
            bagtsNer: pkg.label,
            des,
            ajilNo: r.no,
            ajilNer: r.work,
            /* ⚠️ Нэгж нь ЭХ ӨГӨГДӨЛД БАЙХГҮЙ (`negj.ts` нь ажлын нэрнээс
               ТААМАГЛАДАГ бөгөөд «ямар ч тооцоонд хэрэглэхгүй» гэж
               баримтжуулсан). Таамгийг хүлээлгэж өгөх датад бичихгүй —
               жинхэнэ нэгж эх төсвөөс ирэх хүртэл хоосон. */
            negj: '',
            niit: r.vol,
          };
          const prev = obPlan.get(des)?.get(blok) ?? new Map<string, number>();
          const e = buildEdits(meta, blok, months, prev, obOids, resCur
            ? { cur: resCur, prev: obRes.get(des)?.get(blok) ?? new Map<string, MonthRes>(), fields }
            : undefined);
          all.adds.push(...e.adds);
          all.updates.push(...e.updates);
          all.deletes.push(...e.deletes);
        }
        obEdits = all;
      }
      /**
       * МӨРИЙН ХҮН/МАШИН = САРЫН НӨӨЦИЙН НИЙЛБЭР (2026-09-24, хэрэглэгчийн шийдвэр).
       * ⚠️ Сарын нөөцийг ХӨНДСӨН ажил бүрд бүх блок · бүх сарын `sumRes` — нэг ч
       *    сард утга байвал мөрийн талбарыг ДАРНА (`resDraft`-аас давамгайлна);
       *    сарын утга огт байхгүй бол дээрх мөрийн зам хэвээр. Нийлбэр нь
       *    хүн-сар/машин-сар гэсэн утгатай — хэрэглэгчид хэлсэн.
       * ⚠️ Дээрх бэлтгэлийн ДАРАА (2026-09-24 аудит): бичигдэхгүй блок
       *    (`unbalKeys`) серверийн утгаараа тоологдоно; байхгүй талбар
       *    (`fields`) мөрд ч бичигдэхгүй; мужаас гадуурх сар тоологдохгүй.
       *    Серверт нөөц байсан атлаа бүгд хоосорсон бол мөрийг `null` болгоно
       *    (арилгах санаатай) — урьд нь алгасаж хуучин нийлбэр үлддэг байв.
       */
      if (obResDraft.size) {
        const byDes = new Map(base.map((r) => [r.des, r]));
        const desSet = new Set<number>();
        for (const k of obResDraft.keys()) desSet.add(Number(k.slice(0, k.indexOf('|'))));
        for (const des of desSet) {
          const pr = byDes.get(des);
          const orig = pr ? byOid.get(pr.oid) : undefined;
          if (!pr || !orig || pr.group) continue;
          const all = new Map<string, MonthRes>();
          let written = 0;
          let hadSrv = false;
          for (const blok of sc.bld) {
            const key = obKey(des, blok);
            const srv = obRes.get(des)?.get(blok);
            if (srv?.size) hadSrv = true;
            const d = obResDraft.get(key);
            const use = d && !unbalKeys.has(key) ? d : srv;
            if (d && use === d) written += 1;
            if (!use) continue;
            /* ⚠️ Тэнцээгүй блок серверийн нөөцөөр тоологдох тул сар нь ч СЕРВЕРИЙН
               задаргаагаар (2026-09-24 аудит) — нооргийн саруудаар шүүвэл зөрнө. */
            const months = unbalKeys.has(key)
              ? obPlan.get(des)?.get(blok)
              : obDraft.get(key) ?? obPlan.get(des)?.get(blok);
            for (const [sar, v] of use) if (months?.has(sar)) all.set(`${blok}|${sar}`, v);
          }
          if (!written) continue;
          const sum = sumRes(all);
          if (sum.hun == null && sum.mashin == null && !hadSrv) continue;
          const a: Record<string, unknown> = {};
          if (sc.f.hunHuch && fields.hun && (sum.hun ?? null) !== (orig.hun ?? null)) a[sc.f.hunHuch] = sum.hun;
          if (sc.f.mashin && fields.mashin && (sum.mashin ?? null) !== (orig.mashin ?? null)) a[sc.f.mashin] = sum.mashin;
          if (Object.keys(a).length) Object.assign(upsert(pr.oid), a);
        }
      }
      /*
       * ⚠️ БАТЛАХ ГОРИМД БҮХ ШАЛГУУР БИЧИХЭЭС ӨМНӨ (2026-09-25 аудит). Урьд нь огноо
       *    (`applyUpdates`) бичигдсэний ДАРАА л тэнцээгүй задаргаа (`unbal`) ба
       *    талбаргүй нөөц (`resSkipped`/`rfUnknown`) илэрч, санал ХАГАС бичигдээд
       *    `pending` хэвээр үлддэг байв — дараагийн оролдлого «зэрэгцээ өөрчлөлт»-д
       *    унана. Батлалт = бүгд эсвэл юу ч үгүй; энгийн хадгалалт хуучин зан төлөвтэй.
       */
      const approvalMode = approving != null;
      if (approvalMode && (unbal || resSkipped || (rfUnknown && obResDraft.size > 0))) {
        const why: string[] = [];
        if (unbal) why.push(tr('{0} ажлын сарын задаргааны нийлбэр нийт обьёмтой тэнцэхгүй', num(unbal)));
        if (resSkipped || rfUnknown) why.push(tr('сарын хүн хүч/машины талбар шалгагдсангүй эсвэл алга'));
        setErr(tr('Батлах боломжгүй — {0}. Эх хуудсанд юу ч бичигдсэнгүй; илгээлт хүлээгдэж буй хэвээр.', why.join(' · ')));
        return false;
      }
      if (!upd.length && !obDraft.size && !obResDraft.size) {
        setDraft((m0) => { const m = new Map(m0); for (const k of tookD) m.delete(k); return m; });
        setHam((m0) => { const m = new Map(m0); for (const k of tookH) m.delete(k); return m; });
        setADraft((m0) => { const m = new Map(m0); for (const k of tookA) m.delete(k); return m; });
        setResDraft((m0) => { const m = new Map(m0); for (const k of tookR) m.delete(k); return m; });
        setNote(tr('Өөрчлөлт олдсонгүй — хуваарь хэвээрээ.'));
        return true;
      }
      /*
       * ⚠️ АГШИН СОЛИГДСОН ЭСЭХ (2026-08-29). «Гүйцэтгэл бөглөх» нийтлэх бүрд
       * хуудсыг БҮТНЭЭР шинэ хуулбар болгож нэмдэг тул энд ачаалсан OBJECTID-ууд
       * ХУУЧИН хуулбарынх болж болно. Тэр OID руу бичвэл огноо нь хаягдсан
       * хуулбарт чимээгүй үлдэж, дараагийн нийтлэлд ч алга болно — төлөвлөлтийн
       * бүхэл сесс алдагдана. Тиймээс хадгалахын өмнө СҮҮЛИЙН агшныг дахин
       * татаж, мөр бүрийг (№ + ажлын нэр)-ээр шинэ OID руу зөөнө.
       */
      const fresh = await loadRows(pkg, sc);
      let remapped = 0;
      let lost = 0;
      /* ⚠️ Жааз солигдсоныг ЭХНИЙ мөрөөр ЭСВЭЛ бичих oid-ын аль нэг нь шинэ агшинд
         алга болсноор мэднэ (2026-09-25 аудит). */
      const freshOids = new Set(fresh.rows.map((r) => r.oid));
      if (fresh.rows[0]?.oid !== rows[0]?.oid || upd.some((a) => !freshOids.has(a[sc.f.oid] as number))) {
        /* ⚠️ `remapOids` (эцэг бүлгийн зам › № ¦ нэр, давхардлыг дарааллаар) — 2026-09-25
           аудит: урьд нь (№ ¦ нэр) + ОЙРЫН ИНДЕКС гэсэн сул түлхүүр ижил нэртэй өөр
           блокийн мөр рүү огноо зөөдөг байв. «Шинэчлэх» замтай НЭГ дүрэм. */
        const map = remapOids(rows, fresh.rows);
        const moved2: Record<string, unknown>[] = [];
        for (const a of upd) {
          const nk = map.get(a[sc.f.oid] as number);
          if (nk == null) { lost += 1; continue; }
          moved2.push({ ...a, [sc.f.oid]: nk });
          remapped += 1;
        }
        /* ⚠️ БАТЛАХ ГОРИМД алдагдсан мөртэй бол ЮУ Ч БИЧИХГҮЙ (2026-09-25 аудит) — урьд нь
           үлдсэнийг бичээд «батлагдлаа» гэж үргэлжилж, алдагдсан мөрийн санал ор мөргүй
           алга болдог байв. */
        if (lost && approvalMode) {
          setErr(tr('{0} мөр шинэ агшинд олдсонгүй — хуудас хооронд нь шинэчлэгдсэн байна. Эх хуудсанд юу ч бичигдсэнгүй; буцааж, зохиогч дахин илгээнэ.', num(lost)));
          return false;
        }
        upd.length = 0;
        upd.push(...moved2);
      }
      if (upd.length) await applyUpdates(pkg, upd);

      /*
       * ── САРЫН ОБЬЁМ — ТУСДАА ҮЙЛЧИЛГЭЭ (бичилт; бэлтгэл нь дээр) ─────
       * ⚠️ Хуваарийн огноо бичигдсэний ДАРАА: задаргаа нь огноон дээр
       *    тогтдог тул огноо нь бичигдээгүй байхад задаргаа үлдвэл хоёр
       *    эх сурвалж зөрнө.
       */
      if (obEdits) {
        /* ⚠️ ДАВХАРДСАН мөрийн ИЛҮҮДЛИЙГ хамт арилгана (2026-09-08): `dkey`-д
           сангийн unique индекс байхгүй тул зэрэг хадгалалт ижил түлхүүртэй
           хоёр мөр үлдээж чадна. `buildEdits` нь `obOids`-оос ЗӨВХӨН нэг OID
           авдаг тул илүүдэл нь өөрөө хэзээ ч устахгүй. */
        for (const d of obDups) if (!obEdits.deletes.includes(d)) obEdits.deletes.push(d);
        const [a2, u2, d2] = await applyPlanEdits(obEdits);
        obN = a2 + u2 + d2;
      }

      const r = await loadRows(pkg, sc);
      setRows(r.rows);
      setDraft((m0) => { const m = new Map(m0); for (const k of tookD) m.delete(k); return m; });
      setHam((m0) => { const m = new Map(m0); for (const k of tookH) m.delete(k); return m; });
      setADraft((m0) => { const m = new Map(m0); for (const k of tookA) m.delete(k); return m; });
      setResDraft((m0) => { const m = new Map(m0); for (const k of tookR) m.delete(k); return m; });
      /* ⚠️ Обьёмын ноорогийг ЦЭВЭРЛЭЖ, задаргааг СЕРВЕРЭЭС дахин татна —
         бичилтийн дараа ObjectID шинээр үүссэн тул хуучин `obOids` хуучирсан.
         ⚠️ ТЭНЦЭЭГҮЙ задаргааг ҮЛДЭЭНЭ (2026-09-08): бичигдээгүй атлаа
            ноорогоос устгавал хүн юуг дахин бөглөхөө мэдэхгүй үлдэнэ. */
      if (unbal) {
        setObDraft((m0) => {
          const m = new Map<string, Map<string, number>>();
          const byDes = new Map(base.map((r) => [r.des, r]));
          for (const [k, months] of m0) {
            const des = Number(k.slice(0, k.indexOf('|')));
            const v = byDes.get(des)?.vol;
            if (months.size && v != null && v > 0 && !balanced(months, v)) m.set(k, months);
          }
          return m;
        });
      } else {
        setObDraft(new Map());
      }
      /* Сарын нөөцийн ноорог — тэнцээгүй (бичигдээгүй) ба талбаргүй тул алгассан
         блокийнхыг үлдээнэ (2026-09-24) — батлалт `dirtyN > 0`-д зогсоно. */
      setObResDraft((m0) => {
        const m = new Map<string, Map<string, MonthRes>>();
        for (const [k, v] of m0) if (unbalKeys.has(k) || resSkippedKeys.has(k)) m.set(k, v);
        return m;
      });
      try {
        const fresh2 = await loadPkgPlan(pkg.key);
        setObPlan(fresh2.plan);
        setObRes(fresh2.res);
        setObOids(fresh2.oids);
        setObDups(fresh2.dups);
        setObState('ok');
      } catch { /* задаргаагүйгээр үргэлжилнэ */ }
      setNote(remapped
        ? tr('{0} ажлын хуваарь хадгалагдлаа — хуудас хооронд нь шинэчлэгдсэн тул шинэ агшинд зөөв', num(upd.length))
        : obN
          ? tr('{0} ажлын хуваарь · {1} сарын обьём хадгалагдлаа', num(upd.length), num(obN))
          : tr('{0} ажлын хуваарь хадгалагдлаа', num(upd.length)));
      /* ⚠️ Алдаануудыг НЭГТГЭЖ нэг удаа (2026-09-24 аудит) — дараалсан `setErr`-д
         сүүлийнх л үлдэж, өмнөх (алдагдсан мөр, тэнцээгүй задаргаа) далдлагддаг байв. */
      const errs: string[] = [];
      if (lost) errs.push(tr('{0} мөр шинэ агшинд олдсонгүй — тэдгээрийн хуваарь хадгалагдсангүй.', num(lost)));
      /* ⚠️ Тэнцээгүй задаргааг ИЛ хэлнэ — эс бөгөөс «хадгалагдлаа» гэсэн
         мэдэгдэл нь бичигдээгүй обьёмыг далдална. */
      if (unbal) {
        errs.push(tr('{0} ажлын сарын задаргааны нийлбэр нийт обьёмтой тэнцэхгүй тул хадгалагдсангүй — хуваарь шилжихэд мужаас гарсан сарууд хасагдсан байна. Тухайн ажлын цонхыг нээж дахин бөглөнө үү.', num(unbal)));
      }
      /* ⚠️ Талбар байхгүй бол ЧИМЭЭГҮЙ алгасахгүй — админ AGOL дээр нэмнэ (2026-09-24) */
      if (resSkipped && rfUnknown) {
        errs.push(tr('Сарын хүснэгтийн хүн хүч/машин талбарыг шалгаж чадсангүй — {0} ажил·блокийн сарын нөөц хадгалагдсангүй. Дахин оролдоно уу.', num(resSkipped)));
      } else if (resSkipped) {
        errs.push(tr('{0} ажил·блокийн сарын хүн хүч/машин механизм хадгалагдсангүй — сарын хүснэгтэд «hun_huch»/«mashin_mehanizm» талбар алга. Админ AGOL дээр нэмнэ үү.', num(resSkipped)));
      }
      /* ⚠️ Мужаас гадуурх сарын нөөц хаягдсаныг ил хэлнэ (2026-09-24 аудит) */
      if (resDropped) {
        errs.push(tr('{0} ажил·блокийн мужаас гадуурх сарын хүн хүч/машин хаягдлаа — обьёмгүй сард мөр байхгүй.', num(resDropped)));
      }
      if (errs.length) setErr(errs.join(' · '));
      return true;
    } catch (e) {
      setErr(String((e as Error).message || e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [sc, draft, ham, aDraft, resDraft, obDraft, obResDraft, obPlan, obRes, obOids, obDups, base, dirtyN, busy, pkg, rows, kind, approving]);

  /* ══════════════ БАТЛАХ УРСГАЛ ══════════════
   * ⚠️ Гүйцэтгэгч ЗОХИОНО → «Батлуулах» → батлагч БАТАЛНА → тэр үед л эх
   *    хуудсанд бичигдэнэ. Батлагдтал эх хуваарь ХӨДЛӨХГҮЙ тул тайлан,
   *    хоцрогдлын дохио тогтвортой (2026-09-07, хэрэглэгчийн шийдвэр).
   */

  /**
   * ⚠️ ХОЦОРСОН ХАРИУГ ХАЯНА (2026-09-16 аудит). Урьд нь багц солигдоход
   *    хуучин багцын хүсэлт `pending`-ийг ДАРЖ бичдэг байв: дараалалаас
   *    үсрэхэд эхний багцын хариу зорилтот багцынхыг түрүүлж ирж, jump
   *    эффект «аль хэдийн шийдвэрлэгдсэн» гэсэн ХУДАЛ алдаа өгдөг байлаа.
   *    Одоо хүсэлт бүр дугаартай — сүүлийнхээс бусдын хариу үл тоомсорлогдоно.
   *    Мөн эхлэхэд `flowReady`/`pending`-ийг ЦЭВЭРЛЭНЭ — jump эффект `null`-ийг
   *    «хараахан ачаалаагүй» гэж уншдаг тул зөв хүлээнэ.
   *
   * ⚠️ tezu-bonu салбар ЯГ ИЖИЛ согогийг зэрэг зассан (багцын түлхүүрээр
   *    хаах). Тэндхийн нэмэлт ойлголт: хоцорсон хариу нь зөвхөн худал алдаа
   *    биш — хуанли Б-г, шийдвэрлэх цонх А-г харуулж, «Батлах» дарахад БУРУУ
   *    илгээлт батлагддаг байв. Дугаараар хаах нь түлхүүрээс өргөн (ижил
   *    багцын давхар дуудлагыг ч барина) тул ганц механизм үлдээв.
   */
  const flowSeq = useRef(0);
  /** Сүүлд ачаалсан хүлээгдэж буй илгээлт (багцын түлхүүртэй) — алга болсныг илрүүлэхэд (2026-09-25) */
  const flowPendRef = useRef<{ key: string; oid: number | null }>({ key: '', oid: null });
  /* ⚠️ ОДООГИЙН багц (2026-09-21): батлах гинжний сүүлийн алхам ХУУЧИН
     closure-ийн `refreshFlow`-ыг дууддаг тул багц солигдсоны ДАРАА ч дугаар
     нь хамгийн сүүлийнх болж, өмнөх багцын pending шинэ багцад наалддаг байв.
     Дугаараас гадна түлхүүрийг ч тулгана. */
  const pkgKeyRef = useRef(pkg.key);
  pkgKeyRef.current = pkg.key;
  /** Хүлээгдэж буй илгээлт ба хүснэгтийн бэлэн байдлыг татна */
  /* ⚠️ `noRefetch` — дуудагч мөрийг дөнгөж серверээс татсан/татах бол (батлах гинж,
     татах) давхар ачаалахгүй (2026-09-25). */
  const refreshFlow = useCallback(async (opt?: { noRefetch?: boolean }) => {
    const my = ++flowSeq.current;
    const key = pkg.key;
    const live = () => my === flowSeq.current && key === pkgKeyRef.current;
    /* ⚠️ 2026-09-25 аудит: ИЖИЛ багцын `pending`-ийг ачаалалт дуустал ҮЛДЭЭНЭ —
       урьд нь `null` болгож, завсарт `locked`/хуваалцсан нооргийн хаалт түр
       тайлагдаж (засвар · сэргээлт · «Батлуулах» идэвхждэг) байв. Өөр багцынхыг арилгана. */
    setFlowReady(null); setPending((p0) => (p0 && p0.pkgKey === key ? p0 : null)); setLastDecision(null);
    try {
      const st = await planTableState(status === 'off' || roleForUser(user?.username) === 'super');
      if (!live()) return;
      const ready = st.ok;
      /* ⚠️ `flowReady=true`-г `pending`-тэй НЭГ зурагдалтад тавина (2026-09-25,
         хөтчийн туршилтаар илэрсэн): урьд нь `loadPending`-ээс ӨМНӨ тавьдаг тул
         `flowReady=true, pending=null` гэсэн завсрын зурагдалт гарч, хяналтын
         горим (ба `jump`) хүлээгдэж буй илгээлтийг «аль хэдийн шийдвэрлэгдсэн»
         гэж андуурдаг байв. Бэлэн бус үед л шууд. */
      if (!ready) setFlowReady(false);
      setFlowWhy(ready ? '' : (
        st.why === 'auth'
          ? tr('ArcGIS-д нэвтрээгүй байна — гарч ороод дахин оролдоно уу.')
          : st.why === 'owner'
            ? tr('Батлах хүснэгт БАЙНА, гэвч түүнийг үүсгэсэн хэрэглэгч танигдахгүй байна. AGOL дээр item-ийн эзнийг super админ руу шилжүүлнэ үү.')
            : st.why === 'error'
              ? tr('Порталын хайлт амжилтгүй: {0}', st.detail ?? '')
              : tr('Батлах хүснэгт олдсонгүй — админ (super) нэг удаа нэвтрэхэд автоматаар үүснэ.')
      ));
      const p = ready ? await loadPending(pkg.key) : null;
      if (!live()) return;
      setPending(p);
      if (ready) setFlowReady(true);
      /*
       * ⚠️ ХҮЛЭЭГДЭЖ БАЙСАН ИЛГЭЭЛТ АЛГА БОЛОВ (2026-09-25 аудит) — өөр хүн
       *    шийдсэн/татсан. Урьд нь зөвхөн урсгалын төлөв шинэчлэгддэг байв:
       *    (1) батлагчийн УРЬДЧИЛАН ХАРСАН агуулга «хадгалаагүй N» болж үлдэж,
       *    «Батлуулах» идэвхжин БУЦААГДСАН саналыг өөрийн нэрээр дахин илгээх
       *    боломжтой байв — харалтыг цэвэрлэнэ; (2) зохиогчийн хуудсанд
       *    «батлагдсан» гарсан атлаа хуанли хуучин огноотой үлддэг байв —
       *    серверээс мөр · задаргааг дахин татна.
       */
      if (ready) {
        const was = flowPendRef.current;
        flowPendRef.current = { key, oid: p?.oid ?? null };
        if (was.key === key && was.oid != null && was.oid !== (p?.oid ?? null)) {
          if (previewingRef.current) {
            setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
            setADraft(new Map()); setResDraft(new Map());
            setPreviewing(false);
          }
          if (!opt?.noRefetch) void refetchRef.current().catch(() => { /* дараагийн ачаалалтаар */ });
        }
      }
      /* ⚠️ Хүлээгдэж буй илгээлт БАЙХГҮЙ үед л сүүлийн шийдвэрийг үзүүлнэ —
         хоёуланг зэрэг харуулбал аль нь одоогийн байдал болох нь ойлгомжгүй. */
      const last = ready && !p ? ((await loadHistory(pkg.key, 1))[0] ?? null) : null;
      if (!live()) return;
      setLastDecision(last);
    } catch {
      if (!live()) return;
      setFlowReady(false);
      setFlowWhy(tr('Батлах урсгал уншигдсангүй — сүлжээгээ шалгана уу.'));
      setPending(null);
      setLastDecision(null);
    }
  }, [pkg.key, user, status]);

  useEffect(() => { void refreshFlow(); }, [refreshFlow]);

  /**
   * БАТЛАХ ДАРААЛААЛААС ШИЛЖИЖ ИРСЭН ХҮСЭЛТИЙГ ХЭРЭГЛЭНЭ (2026-09-16).
   *
   * ⚠️ ХОЁР ШАТТАЙ: эхлээд БАГЦЫГ солино, `refreshFlow` (дээрх эффект)
   *    `pending`-ийг хүргэтэл ХҮЛЭЭНЭ, дараа л цонхыг нээнэ. Шууд нээвэл
   *    зурагдалтын `flowBox === 'decide' && pending` хамгаалалт юу ч
   *    зурахгүй — товч дарсан атлаа ЮУ Ч болоогүй мэт харагдана.
   *
   * ⚠️ ХОЦОРСОН ШИЙДВЭР ӨӨРӨӨ ИЛЭРНЭ: `pending` нь өөр `oid`-тай (эсвэл
   *    `null`) бол зуур өөр батлагч шийдсэн гэсэн үг. Дуугүй өнгөрвөл
   *    батлагч хоосон хуудас хараад гайхна.
   *
   * ⚠️ `kind` (Төлөвлөгөө ↔ Гэрээ) табыг АВТОМАТААР СОЛИХГҮЙ — доорх
   *    `decide`-ийн дүрэм: «батлагч юу батлахаа ӨӨРӨӨ мэдэж байх ёстой».
   *    Табын зөрүүний алдаа зориулалтаараа гарна; дараалал нь `kind`-ыг
   *    мөр ба товчны `title`-д бичсэнээр түүнийг гайхалтай биш болгоно.
   */
  useEffect(() => {
    if (!jump) return;
    const target = PKGS.find((p) => p.key === jump.pkgKey);
    /* 1-р шат: багц соль — дараагийн тойрогт `pending` ирнэ */
    if (target && target.key !== pkg.key) { setPkg(target); return; }
    /* ⚠️ Багц СОЛИГДОЖ амжаагүй байж болно (`loadedPkg` биш, `pkg.key`-ээр
       шалгав) — `refreshFlow` ажиллаж дуустал `flowReady` нь `null` хэвээр. */
    if (flowReady === null) return;
    if (pending?.oid === jump.oid) {
      setFlowBox('decide');
      onJumpDone?.();
      return;
    }
    if (!target) {
      setErr(tr('Багцын түлхүүр бүртгэлд алга — «{0}».', jump.pkgKey));
      onJumpDone?.();
      return;
    }
    setErr(tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'));
    onJumpDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, pkg.key, pending, flowReady]);

  /** Ноорогийг илгээлтийн агуулга болгоно — гурван ноорог нэг дор */
  const buildPayload = useCallback((): PlanPayload => {
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
    return {
      kind, spans, deps, obyem, actual, res, obres,
      base: { spans: bSpans, deps: bDeps, obyem: bObyem, actual: bActual, res: bRes, obres: bObRes },
    };
  }, [draft, ham, aDraft, resDraft, obDraft, obResDraft, kind, base, rows, obPlan, obRes]);

  /** «Батлуулах» — эх хуудсанд ЮУ Ч бичихгүй, зөвхөн хүснэгтэд хүлээнэ */
  const sendForApproval = useCallback(async (userNote: string) => {
    /* ⚠️ Урьдчилан харж байхад ИЛГЭЭХГҮЙ (2026-09-25 аудит) — ноорог нь бусдын санал */
    if (!dirtyN || busy || previewing) return;
    /* ⚠️ ТЭНЦЭЭГҮЙ сарын задаргаатай илгээхийг ХОРИГЛОНО (2026-09-17): батлах
       үеийн `save` тэдгээрийг алгасдаг (`unbal`) тул ноорог үлдэж батлах гинж
       «эх хуудсанд бичигдсэнгүй» гэж мөнхөд гацдаг байв. */
    {
      let bad = 0;
      /* ⚠️ Ажлын НЭРИЙГ нэрлэнэ (2026-09-21) — «1 ажлын…» гэсэн тоо л хараад
         1,400 мөрөөс алийг нь нээхээ мэдэхгүй байв. */
      const names = new Set<string>();
      for (const r of plan) {
        for (let b = 0; b < (sc?.bld.length ?? 0); b += 1) {
          const blok = sc?.bld[b];
          if (r.des == null || !blok) continue;
          const months = obDraft.get(obKey(r.des, blok));
          if (!months || r.vol == null || !(r.vol > 0)) continue;
          if (months.size && !balanced(months, r.vol)) { bad += 1; names.add(`${r.no} ${r.work}`.trim()); }
          /* ⚠️ ХООСОН ЗАДАРГАА + ХУВААРЬТАЙ блок = 0 ≠ обьём (2026-09-21).
             Гинжээр (уялдаа, чирэлт) ажил БҮТЭН шинэ саруудад шилжвэл
             `keepMonths` бүх сарыг хаяж Map хоосон болдог; урьд нь `months.size
             &&` нөхцөл үүнийг өнгөрөөж, батлахад `buildEdits` тэр ажлын БҮХ
             сарын мөрийг устгадаг байв — задаргаа ул мөргүй алга. Хоосон Map нь
             зөвхөн хуваарь ч ХООСОН (`clear`) үед л хүчинтэй «арилгах» санаа.
             Цонх автоматаар нээхгүй — гинж олон мөр хөндөж болно; алдаанд
             тоог нэрлэнэ.
             ⚠️ ЗӨВХӨН СЕРВЕРТ ЗАДАРГАА БАЙСАН үед (2026-09-21): «buildEdits бүх
             сарыг устгана» гэсэн үндэслэл серверт задаргаа БАЙХГҮЙ ажилд
             хамаарахгүй — устгах зүйл алга. Задаргаагүй обьёмтой ажлыг чирээд
             цонхыг X-ээр хаахад хоосон Map үлдэж, илгээх зам мөнхөд түгжигдэж
             байв (одоо `applyChanges`/`applyModal` ийм ноорогийг хасдаг ч
             хуучин ноорог/өөр замаар орсныг энд давхар хамгаална). */
          else if (!months.size && r.spans[b] && (obPlan.get(r.des)?.get(blok)?.size ?? 0) > 0) {
            bad += 1; names.add(`${r.no} ${r.work}`.trim());
          }
        }
      }
      if (bad > 0) {
        const list = [...names];
        const shown = list.slice(0, 3).join(', ') + (list.length > 3 ? ` (+${num(list.length - 3)})` : '');
        setErr(tr('{0} ажлын сарын задаргаа обьёмтойгоо тэнцэхгүй байна (хоосон задаргаа = 0): {1}. Тухайн ажлын цонхыг нээж сараар тэнцүүлнэ үү.', num(bad), shown));
        return;
      }
    }
    /* ⚠️ ОДООГИЙН ХУУДАСТ БАЙХГҮЙ мөрийн ноороготой ИЛГЭЭХГҮЙ (2026-09-25 аудит):
       хуучин жаазын oid-той санал батлахад `save`-ийн `staleN`-д мөнхөд гацна.
       Нэмэлт ажлын түр мөр (`oid < 0`) ноорогт ордоггүй. */
    {
      const have = new Set(rows.map((r) => r.oid));
      const stale = new Set([...draft.keys(), ...ham.keys(), ...aDraft.keys(), ...resDraft.keys()].filter((o) => !have.has(o)));
      if (stale.size) {
        setErr(tr('{0} мөрийн ноорог одоогийн хуудаснаас олдсонгүй — хуудас хооронд нь шинэчлэгдсэн байна. Илгээгдсэнгүй; хуудсаа сэргээгээд дахин илгээнэ үү.', num(stale.size)));
        return;
      }
    }
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await submitPlan({
        pkgKey: pkg.key,
        pkgGroup: pkg.group,
        author: user?.username ?? '',
        /* ⚠️ ЯЛГААТАЙ МӨР (`dirtyRows`), `dirtyN` БИШ — дараалал «N мөр» гэж
           харуулдаг тул сарын нүд тоолсон тоо түүнтэй зөрдөг байв (2026-09-23). */
        rowCount: dirtyRows,
        note: userNote,
        payload: buildPayload(),
      });
      if (!r.ok) { setErr(r.error ?? tr('Илгээгдсэнгүй.')); return; }
      /* ⚠️ Ноорогийг ЦЭВЭРЛЭНЭ: агуулга нь одоо серверт хадгалагдсан тул
         локалд үлдээвэл гүйцэтгэгч дахин илгээх, эсвэл батлагдсаны дараа
         хуучин ноорог дахин бичигдэх эрсдэлтэй. */
      setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
      setADraft(new Map()); setResDraft(new Map());
      setFlowBox(null); setFlowTxt('');
      setBackMarks(null);
      setNote(tr('Хуваарь батлуулахаар илгээгдлээ — батлагч шийдвэрлэнэ.'));
      /* ⚠️ ХУВААЛЦСАН НООРОГИЙГ ШУУД ЦЭВЭРЛЭНЭ (2026-09-24) — `refreshFlow`-оос
         ӨМНӨ: тэр `pending`-ийг тавьмагц бичих боломж хаагдаж, дифф→flush
         зам «цэвэрлэсэн» тэмдгийг хэзээ ч бичихгүй байв. */
      await hdClearRef.current(hdKey(kind, pkg.key));
      await refreshFlow();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [dirtyN, dirtyRows, busy, previewing, pkg, user, buildPayload, refreshFlow, plan, sc, obDraft, obPlan, rows, draft, ham, aDraft, resDraft]);

  /**
   * ИЛГЭЭГДСЭН АГУУЛГЫГ НООРОГТ БУУЛГАХ — урьдчилан харах ба батлах ХОЁУЛАА
   * үүнийг хэрэглэнэ (нэг зам — хоёр салаа бичвэл нэг нь чимээгүй хоцорно).
   */
  /**
   * Илгээлтийн агуулгыг ноорогт буулгана — БАТЛАХЫН ӨМНӨХ алхам.
   *
   * ⚠️ ТӨРӨЛ ЗӨРВӨЛ ТАТГАЛЗАНА (2026-09-11-ний аудитын S1). Илгээлт нь
   *    `kind`-ээ өөртөө агуулдаг; батлагчийн ХАРЖ БУЙ таб түүнээс өөр бол
   *    буулгахгүй, `false` буцаана. Эс бөгөөс `save` нь батлагчийн табаар
   *    талбар сонгодог тул ТӨЛӨВЛӨГӨӨНИЙ санал `…_geree_*` талбарт бичигдэж,
   *    гэрээний лавлагаа чимээгүй эвдэрнэ (эргүүлэх аргагүй).
   * ⚠️ Автоматаар таб СОЛИХГҮЙ: батлагч юу батлахаа ӨӨРӨӨ мэдэж байх ёстой.
   *    Дуудагч тал алдааг ил хэлж, зөв табыг нэрлэнэ.
   */
  /**
   * ⚠️ СУУРЬТАЙ ХАРЬЦУУЛНА (2026-09-21). Илгээлтэд `base` (илгээх үеийн
   *    серверийн утга) байвал:
   *      · зохиогчийн ХӨНДӨӨГҮЙ блок (`spans[b] === base[b]`) → ноорогт
   *        `curRows`-ын ОДООГИЙН утгыг тавина → `save` диффд орохгүй, хооронд
   *        нь батлагдсан бусдын өөрчлөлт хэвээр үлдэнэ;
   *      · зохиогчийн ЗАССАН блок дээр `base[b] !== сервер` → ЗЭРЭГЦЭЭ
   *        ӨӨРЧЛӨЛТ. Сонголт: ЗОГСООНО (`strict`), алгасахгүй — уялдаа ба
   *        сарын обьём нь тэр блокийн огноонд уягдсан тул хагас батлалт нь
   *        задаргааг огноогүй үлдээж, `planPctFromMonths` худал болно.
   *        Батлагч буцааж, зохиогч шинэ суурин дээр дахин илгээнэ.
   *    Суурьгүй (2026-09-21-ээс өмнөх) илгээлт → бүх блок «зассан», хуучин
   *    зан үйл. `strict: false` (зохиогч илгээлтээ ТАТАЖ ноорогт буулгах) —
   *    зөрчилтэй ч буулгана, тоог нь буцаана.
   * ⚠️ `curRows` параметрээр — дуудагч (`decide`) серверээс дөнгөж татсан
   *    мөрийг өгнө; state-ийн `rows` энэ тикт хуучин хэвээр.
   */
  /**
   * ⚠️ `curPlan` параметрээр (2026-09-21) — сарын задаргааны тулгалт ч мөн
   *    СЕРВЕРЭЭС дөнгөж татсан `loadPkgPlan`-тай; state-ийн `obPlan` энэ тикт
   *    хуучин. Дуудагч өгөөгүй бол state-ийнх (татах зам).
   */
  const applyPayloadToDraft = useCallback((
    p: PlanPayload,
    curRows: SheetRow[],
    strict = true,
    curPlan: PkgPlan = obPlan,
    curRes: PkgRes = obRes,
  ): { ok: true; conflicts: number; unknown: number } | { ok: false; why: 'kind' | 'conflict' | 'unknown'; conflicts: number; unknown: number } => {
    if (p.kind !== kind) return { ok: false, why: 'kind', conflicts: 0, unknown: 0 };
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
        const v0 = s ? { start: s.start, end: s.end } : null;
        if (!bs || !now) return v0;
        const b0 = bs[b] ?? null;
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
        const v0 = s ? { start: s.start, end: s.end } : null;
        const nb = now.spans[b] ?? null;
        if (bs) {
          const b0 = bs[b] ?? null;
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
      hm.set(Number(k), v);
      const bd = p.base?.deps;
      if (bd && k in bd) {
        const now = curSheet.get(Number(k));
        if (now && (now.ham ?? null) !== (bd[k] ?? null) && (now.ham ?? null) !== v) conflicts += 1;
      }
    }
    const ob = new Map<string, Map<string, number>>();
    for (const [k, months] of Object.entries(p.obyem)) {
      ob.set(k, new Map(Object.entries(months)));
      const bo = p.base?.obyem;
      if (bo && k in bo) {
        const cut = k.indexOf('|');
        const now = curPlan.get(Number(k.slice(0, cut)))?.get(k.slice(cut + 1));
        const was = new Map(Object.entries(bo[k]));
        if (!sameMonths(now, was) && !sameMonths(now, ob.get(k))) conflicts += 1;
      }
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
          const v0 = arr[b] ?? null;
          if (!bs || !now || !baseArr || !nowArr) return v0;
          const b0 = baseArr[b] ?? null;
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
      or.set(k, new Map(Object.entries(months).map(([sar, v]) => [sar, { hun: v.hun, mashin: v.mashin }])));
      const bo = p.base?.obres;
      if (bo && k in bo) {
        const cut = k.indexOf('|');
        const now = curRes.get(Number(k.slice(0, cut)))?.get(k.slice(cut + 1));
        const was = new Map(Object.entries(bo[k]).map(([sar, v]) => [sar, { hun: v.hun, mashin: v.mashin }]));
        if (!sameRes(now, was) && !sameRes(now, or.get(k))) conflicts += 1;
      }
    }
    const unknown = unk.size;
    if (strict && conflicts) return { ok: false, why: 'conflict', conflicts, unknown };
    /* ⚠️ Батлах/харах (`strict`) замд мэдэгдэхгүй мөртэй саналыг БУУЛГАХГҮЙ —
       хагас санал харагдаж/батлагдах ёсгүй. Дуудагч `unknown`-оор алдаа хэлнэ. */
    if (strict && unknown) return { ok: false, why: 'unknown', conflicts, unknown };
    setDraft(d); setHam(hm); setObDraft(ob); setObResDraft(or);
    setADraft(ad); setResDraft(rd);
    return { ok: true, conflicts, unknown };
  }, [kind, n, obPlan, obRes]);

  /** Зэрэгцээ өөрчлөлтийн алдааны текст — preview ба decide хоёуланд нэг */
  const conflictMsg = (n0: number) => tr('{0} нүд илгээснээс хойш өөр замаар өөрчлөгдсөн байна (зэрэгцээ өөрчлөлт). Батлах боломжгүй — буцааж, зохиогч шинэ хуваарин дээр дахин илгээнэ.', num(n0));
  /** Илгээлтийн мөр одоогийн жаазад алга (2026-09-25 аудит) — preview ба decide хоёуланд нэг */
  const unknownMsg = (n0: number) => tr('Илгээлтийн {0} мөр одоогийн хуудаснаас олдсонгүй — хуудас хооронд нь шинэчлэгдсэн байна. Батлах боломжгүй — буцааж, зохиогч дахин илгээнэ.', num(n0));

  /**
   * СЕРВЕРИЙН ОДООГИЙН мөр ба сарын задаргааг татаж state-д тавина (2026-09-21).
   *
   * ⚠️ Урьдчилан харах · батлах · татах ГУРВУУЛАА үүгээр: илгээлтийг state-ийн
   *    ХУУЧИРСАН `rows`/`obPlan`-той биш, дөнгөж татсантай тулгана. Урьд нь
   *    зөвхөн батлах (урьдчилан ХАРААГҮЙ үед) шинээр татдаг байсан тул
   *    `preview` → `decide` замд тулгалт бүхэлдээ АЛГАСАГДАЖ, харснаас
   *    батлах хүртэлх завсрын зэрэгцээ өөрчлөлт чимээгүй дарагддаг байв.
   * ⚠️ Задаргаа татагдахгүй бол state-ийнхаар үргэлжилнэ (мөр нь заавал).
   */
  const refetchServer = useCallback(async (): Promise<{ rows: SheetRow[]; plan: PkgPlan; res: PkgRes }> => {
    const freshRows = sc ? (await loadRows(pkg, sc)).rows : rows;
    /* ⚠️ `loading`-ийг мөртэй НЭГ багцад тавина (2026-09-24): шинэ мөр + хуучин
       задаргаа гэсэн завсрын зурагдалтад хуваалцсан ноорогийн дифф ажиллаж
       сарын нүдийг tombstone болгож байв. Задаргаа ирмэгц `ok`. */
    if (sc) { setObState('loading'); setRows(freshRows); }
    try {
      const fp = await loadPkgPlan(pkg.key);
      setObPlan(fp.plan); setObRes(fp.res); setObOids(fp.oids); setObDups(fp.dups); setObState('ok');
      return { rows: freshRows, plan: fp.plan, res: fp.res };
    } catch {
      setObState('ok');
      return { rows: freshRows, plan: obPlan, res: obRes };
    }
  }, [sc, pkg, rows, obPlan, obRes]);

  /** Урьдчилан харах — саналыг хуанли дээр НООРОГ болгон буулгана */
  const preview = useCallback(async () => {
    if (!pending || busy) return;
    setBusy(true); setErr(''); setPreviewBad(null);
    try {
      const p = await loadPayload(pending.oid);
      if (!p) { setErr(tr('Илгээлтийн агуулга уншигдсангүй.')); return; }
      /* ⚠️ СЕРВЕРЭЭС ШИНЭЭР (2026-09-21) — `decide`-тэй нэг зам. */
      const srv = await refetchServer();
      /* ⚠️ ТӨРӨЛ ЗӨРВӨЛ буулгахгүй — батлагч өөр табаар харж байна. */
      const ap = applyPayloadToDraft(p, srv.rows, true, srv.plan, srv.res);
      if (!ap.ok) {
        /* ⚠️ Мэдэгдэхгүй мөр ч зөрчилтэй адил — зөвхөн «Буцаах» (2026-09-25 аудит) */
        if (ap.why === 'conflict' || ap.why === 'unknown') setPreviewBad(pending.oid);
        setErr(ap.why === 'conflict'
          ? conflictMsg(ap.conflicts)
          : ap.why === 'unknown'
            ? unknownMsg(ap.unknown)
            : p.kind === 'geree'
            ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд дахин үзнэ үү.')
            : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд дахин үзнэ үү.'));
        return;
      }
      setPreviewing(true);
      setFlowBox(null);
      setNote(tr('Санал хуанли дээр урьдчилан харагдаж байна — батлах хүртэл эх хуудсанд бичигдэхгүй.'));
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, busy, applyPayloadToDraft, refetchServer]);

  /* ══════════════════ НЭМЭЛТ АЖИЛ — урсгал (2026-09-24) ══════════════════ */
  const ajSeq = useRef(0);
  /* ⚠️ `refetchServer` нь `rows`-оос хамаардаг тул шууд deps-д оруулбал мөр
     солигдох бүрд урсгал дахин татагдана — ref-ээр уншина. */
  const refetchRef = useRef(refetchServer);
  useEffect(() => { refetchRef.current = refetchServer; }, [refetchServer]);
  /**
   * Хүлээгдэж буй илгээлт · буцаагдсан · батлагдсан-буугаагүй төлөв.
   *
   * ⚠️ Хоцорсон хариуг `ajSeq` + `pkgKeyRef`-ээр хаяна (`refreshFlow`-ийн дүрэм).
   * ⚠️ Буцаагдсан (`returned`) илгээлтийг ЗӨВХӨН ЗОХИОГЧ нь (нэвтрэлттэй үед)
   *    `adds`-д буцааж, ДАРАА нь `markRestored` — буулт унавал `returned`
   *    хэвээр, дараагийн нээлтэд дахин; өөр компьютер дээр давхар буухгүй
   *    (FillNew-ийн 2026-09-23 #13 дүрэм). `loadHistory(…, 500)`: анхдагч 20 нь
   *    сүүлийн шийдвэрүүд л — хуучин буцаалт хэзээ ч сэргэхгүй байв.
   * ⚠️ Хүлээгдэж байсан илгээлт (`prevOid`) АЛГА БОЛОХОД түүхээс төлвийг нь
   *    харна: `applied` → `refetchServer` (мөр серверээс гарч ирнэ, улаан
   *    тэмдэг «Гүйцэтгэл бөглөх»-д `loadAddedKeys`-ээр хэвээр); `returned` →
   *    дээрх зам; `approved` (буугаагүй) → `ajStuck` мэдэгдэл.
   */
  const refreshAjil = useCallback(async (prevOid: number | null) => {
    const want = pkg.key;
    const my = ++ajSeq.current;
    const live = () => my === ajSeq.current && pkgKeyRef.current === want;
    const me = (user?.username ?? '').trim().toLowerCase();
    const authOn = status !== 'off';
    try {
      const sub = await loadAjilPending(want);
      if (!live()) return;
      setAjSub(sub);
      const lookBack = prevOid != null && sub?.oid !== prevOid;
      const stuck = await loadAjilApproved(want);
      if (!live()) return;
      setAjStuck(stuck.length);
      const hist = await loadAjilHistory(want, 500);
      if (!live()) return;
      let applied = false;
      /** Батлагдсан ч хараахан буугаагүй — мөчлөгийг үргэлжлүүлнэ (`ajTrack`) */
      let midway = false;
      for (const h0 of hist) {
        if (lookBack && h0.oid === prevOid && h0.status === AJIL_STATUS.applied) applied = true;
        if (lookBack && h0.oid === prevOid && h0.status === AJIL_STATUS.approved) midway = true;
        if (h0.status !== AJIL_STATUS.returned) continue;
        if (authOn && h0.author !== me) continue;
        /* ⚠️ Мөр нэмэх эрхгүй хүнд буулгахгүй — тэр `adds`-аа илгээж ч чадахгүй */
        if (!canAddRow) continue;
        const pl = await loadAjilPayload(h0.oid);
        if (!live()) return;
        if (pl?.adds.length) {
          /* ⚠️ LS-д СИНХРОН бичнэ, ДАРАА нь тэмдэглэнэ (2026-09-24 аудит #5): React
             төлөвөөр дамжуулбал `markRestored` амжаад хуудас хаагдах/багц солигдоход
             мөрүүд LS-д хүрэлгүй БҮРМӨСӨН алга болдог байв. */
          const cur = addsStRef.current;
          const merged = mergeIncoming(cur.key === want ? cur.list : [], pl.adds);
          writeAdds(want, merged);
          setAddsSt({ key: want, list: merged });
          addsStRef.current = { key: want, list: merged };
        }
        if (!live()) return;
        await markAjilRestored(h0.oid);
        if (!live()) return;
        setAjBack({ n: pl?.adds.length ?? 0, by: h0.approver ?? '', reason: h0.reason ?? '' });
      }
      if (!live()) return;
      /* ⚠️ Зөвхөн ДАГАЖ БУЙ илгээлтийг шийдсэн үед цэвэрлэнэ (2026-09-25 review):
         урьд нь `refreshAjil(null)` (илгээх · татах · effect) бүр `ajTrack`-ийг
         арилгаж, батлагдсан-буугаагүй илгээлтийн `applied`-ийг хэзээ ч барихгүй
         болгодог байв. */
      setAjTrack((t) => (midway ? prevOid : prevOid != null && t === prevOid ? null : t));
      if (applied) {
        /*
         * ⚠️ ШИНЭ ЖААЗ = БҮХ OID ШИНЭ (2026-09-24 аудит #1). Ноорог (`draft` ·
         *    `ham` · `aDraft` · `resDraft`) хуучин oid-оор түлхүүрлэгдсэн тул
         *    шууд `refetchServer` хийвэл засвар «алга болж», `save` `staleN`-д
         *    унаж, хамгийн муу нь хуваалцсан ноорогийн дифф хуучин oid-той нүд
         *    бүрийг tombstone болгож БҮХ оролцогчийн ноорог устдаг байв.
         *    · Хадгалаагүй ноорог БАЙВАЛ автоматаар шинэчлэхгүй — `ajApplied`
         *      мэдэгдэл + «Шинэчлэх» товч (`refreshAfterApplied`: ноорогийг
         *      (№ ¦ нэр)-ээр шинэ oid руу зөөгөөд татна).
         *    · Ноороггүй бол `hdReady = null` тавьж ТАТНА: дифф `hdReady === key`
         *      биш үед ажиллахгүй тул tombstone гарахгүй; сэргээлтийн зам алсын
         *      ноорогийг дахин уншиж шинэ мөрөнд тулгана (хуучин oid-той нүд
         *      «хуучирсан» гэж хасагдана — өмнөх мэдэгдэж буй байдал, устгал биш).
         */
        /* ⚠️ Popup/холбох цонх НЭЭЛТТЭЙ бол ч хойшлуулна (2026-09-25 аудит) — шинэ
           жаазад бүх oid солигдох тул цонх хаагдаж бичсэн утга алдагдана. */
        if (dirtyNRef.current > 0 || uiOpenRef.current) {
          setAjApplied(true);
        } else {
          hdReady.current = null; hdLastSeenAt.current = 0;
          await refetchRef.current();
          if (!live()) return;
          setAjNote(tr('Нэмэлт ажил батлагдаж хуудсанд орлоо — мөрүүд серверээс шинэчлэгдэв.'));
        }
      }
    } catch {
      /* ⚠️ Уншиж чадсангүй ≠ илгээлт алга — хуучин төлөвийг ХЭВЭЭР үлдээнэ */
    }
  }, [pkg.key, user, status, canAddRow]);
  /**
   * «ШИНЭЧЛЭХ» — батлагдсан нэмэлт ажлын шинэ жаазыг татахдаа хадгалаагүй
   * ноорогийг ШИНЭ oid руу зөөнө (`remapOids`, № ¦ нэр). `obDraft`/`obResDraft`
   * нь `des|блок`-оор түлхүүрлэгддэг (код жаазаар солигддоггүй) тул хөндөхгүй.
   * Зөөгдөөгүй мөрийн ноорог хаягдана — тоог нь хэлнэ.
   */
  const refreshAfterApplied = useCallback(async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const oldRows = rows;
      hdReady.current = null; hdLastSeenAt.current = 0;
      const srv = await refetchRef.current();
      const map = remapOids(oldRows, srv.rows);
      /* ⚠️ СИНХРОН БОДНО (2026-09-25 аудит): урьд нь `lost`-ыг функц-шинэчлэгч
         дотор тоолж, дараалалд оруулсны ДАРАА шууд уншдаг байв — React тэдгээрийг
         хожим ажиллуулдаг тул тоо 0 хэвээр, ноорог хаягдсан атлаа «зөөгдөв» гэж
         мэдэгддэг байлаа. Одоогийн Map-уудыг (`hdMapsRef`) шууд хөрвүүлнэ; тоо нь
         давхардалгүй МӨР (oid). */
      const lostOids = new Set<number>();
      const mv = <V,>(m: ReadonlyMap<number, V>): Map<number, V> => {
        const o = new Map<number, V>();
        for (const [k, v] of m) {
          const nk = map.get(k);
          if (nk == null) { lostOids.add(k); continue; }
          o.set(nk, v);
        }
        return o;
      };
      const cur = hdMapsRef.current;
      setDraft(mv(cur.draft)); setHam(mv(cur.ham)); setADraft(mv(cur.aDraft)); setResDraft(mv(cur.resDraft));
      const lost = lostOids.size;
      /* ⚠️ Сонголт · бүлгийн шүүлт oid-оор (2026-09-25) — шинэ oid руу зөөнө; нээлттэй
         цонхыг хаана (буцаах мэдээлэл нь хуучин oid-той). */
      setSel((o) => (o == null ? null : map.get(o) ?? null));
      setFGrp((g) => (g === 'all' ? g : map.get(g) ?? 'all'));
      /* ⚠️ 2026-09-25: Хураасан бүлгүүд ч oid-оор — шинэ oid руу зөөнө, эс бөгөөс
         шинэчлэлтийн дараа бүх бүлэг дэлгэгдэнэ. Олдоогүй нь хаягдана. */
      setCollapsed((st) => {
        const o = new Set<number>();
        for (const k of st) { const nk = map.get(k); if (nk != null) o.add(nk); }
        return o;
      });
      setModal(null); setLinkAsk(null); undoRef.current = null;
      setAjApplied(false);
      setAjNote(lost
        ? tr('Хуудас шинэчлэгдлээ — {0} мөрийн хадгалаагүй ноорог шинэ мөрөнд олдсонгүй тул хаягдав.', num(lost))
        : tr('Хуудас шинэчлэгдлээ — хадгалаагүй ноорог шинэ мөрүүд рүү зөөгдөв.'));
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [busy, rows]);
  useEffect(() => { void refreshAjil(null); }, [refreshAjil]);
  /* ⚠️ Хүлээгдэж байхад 30 сек тутам — шийдвэр гарахад зохиогчийн нээлттэй
     хуудас өөрөө мэдэж мөрийг серверээс татна (`applied`). */
  /* ⚠️ `ajTrack` (2026-09-25 аудит) — батлагдсан ч буугаагүй илгээлтийг ч дагана */
  useEffect(() => {
    const oid = ajSub?.oid ?? ajTrack;
    if (oid == null) return;
    const t = window.setInterval(() => { void refreshAjil(oid); }, 30_000);
    return () => window.clearInterval(t);
  }, [ajSub, ajTrack, refreshAjil]);

  /**
   * «Нэмэлт ажил батлуулах» — үндсэн өгөгдөлд ЮУ Ч бичихгүй.
   * ⚠️ Хуваарийн «Батлуулах»-аас ТУСДАА: тэр нь ОГНООГ хуваарийн батлах
   *    урсгалд, энэ нь ШИНЭ АЖЛЫГ гэрээнд оруулах эсэхийг 2 шатат урсгалд.
   * ⚠️ Илгээсний дараа `adds` + LS ЦЭВЭРЛЭНЭ: агуулга серверт хадгалагдсан;
   *    локалд үлдвэл дахин илгээгдэж давхар мөр үүснэ. Буцаагдвал/татвал
   *    `refreshAjil`/`withdrawAjilHere` буцааж авчирна.
   */
  const sendAjil = useCallback(async () => {
    if (!adds.length || ajBusy) return;
    /* ⚠️ БАГЦЫГ ОДОО барина (2026-09-25 аудит): `setAdds` нь дарсан агшны `pkg.key`-ийг
       барьдаг тул хүсэлт явж байхад багц солиход Б-гийн мөрүүд харагдахаа больж,
       А-гийн LS илгээсэн мөрөө хадгалсаар буцаж ирдэг байв. Одоо А-г (`want`) шууд
       LS-д бичиж, төлөвийг ЗӨВХӨН тэр багцынх хэвээр бол шинэчилнэ. Зөвхөн
       ИЛГЭЭСЭН мөрүүдийг хасна — завсарт нэмсэн нь үлдэнэ. */
    const want = pkg.key;
    const sent = new Set(adds.map((a) => a.oid));
    setAjBusy(true); setAjErr(''); setAjNote('');
    try {
      const r = await submitAjil({
        pkgKey: want, pkgGroup: pkg.group, author: user?.username ?? '',
        payload: { v: 1, pkgKey: want, adds },
      });
      if (!r.ok) { setAjErr(r.error ?? tr('Илгээгдсэнгүй.')); return; }
      const st = addsStRef.current;
      writeAdds(want, (st.key === want ? st.list : readAdds(want)).filter((a) => !sent.has(a.oid)));
      setAddsSt((s) => (s.key === want ? { key: want, list: s.list.filter((a) => !sent.has(a.oid)) } : s));
      setAddFor(null);
      setAjNote(tr('Нэмэлт ажил батлуулахаар илгээгдлээ — батлагч шийдвэрлэнэ.'));
      await refreshAjil(null);
    } catch (e) {
      setAjErr(String((e as Error).message || e));
    } finally {
      setAjBusy(false);
    }
  }, [adds, ajBusy, pkg.key, pkg.group, user, refreshAjil]);

  /** ИЛГЭЭЛТЭЭ ТАТАХ — зохиогч алдаатай илгээлтээ буцааж авна; мөрүүд `adds` руу */
  const withdrawAjilHere = useCallback(async () => {
    if (!ajSub || ajBusy) return;
    if (!window.confirm(tr('Илгээлтээ татах уу? Батлагч шийдвэрлэхээ болино; мөрүүд хуудсанд буцаж орно.'))) return;
    /* ⚠️ Багцыг ОДОО барина (2026-09-25 аудит) — `sendAjil`-ийн ижил шалтгаан */
    const want = pkg.key;
    setAjBusy(true); setAjErr(''); setAjNote('');
    try {
      const pl = await loadAjilPayload(ajSub.oid);
      const r = await withdrawAjil({ oid: ajSub.oid, me: user?.username ?? '' });
      if (!r.ok) { setAjErr(r.error ?? tr('Татагдсангүй.')); return; }
      /* ⚠️ Татсан мөрүүдийг `adds` руу БУЦААНА — эс бөгөөс хийсэн ажил чимээгүй алга болно */
      /* ⚠️ LS-д СИНХРОН (`refreshAjil`-ийн #5 дүрэм) — багц солигдсон ч А-д хадгалагдана */
      if (pl?.adds.length) {
        const st = addsStRef.current;
        const merged = mergeIncoming(st.key === want ? st.list : readAdds(want), pl.adds);
        writeAdds(want, merged);
        if (st.key === want) {
          setAddsSt((s) => (s.key === want ? { key: want, list: merged } : s));
          addsStRef.current = { key: want, list: merged };
        }
      }
      setAjNote(tr('Илгээлт татагдлаа — мөрүүд хуудсанд буцаж орлоо.'));
      await refreshAjil(null);
    } catch (e) {
      setAjErr(String((e as Error).message || e));
    } finally {
      setAjBusy(false);
    }
  }, [ajSub, ajBusy, user, pkg.key, refreshAjil]);

  /**
   * БҮЛЭГТ ШИНЭ АЖИЛ НЭМЭХ — шалгалт FillNew-ийн 2026-09 хувилбартай ҮГЧЛЭН ижил.
   * ⚠️ № нь БҮХЭЛ ТОО: `ags.levelFromNo` бутархай № («3.2»)-г «бүлэг» гэж
   *    уншдаг тул навч ажил тоололд орохгүй үлдэнэ.
   * ⚠️ `parentIdx` нь `rowsAll` дахь индекс (`PlanRow.i`) — `insertAdds.parentOf`
   *    нэр давхардсан эцгүүдээс байрлалаар ойрхныг сонгоно.
   */
  const addRow = useCallback((parent: PlanRow) => {
    const no = addForm.no.trim();
    const work = addForm.work.trim();
    const nn = (v: string) => {
      const t = v.trim().replace(',', '.');
      return t === '' ? null : Number.isFinite(Number(t)) ? Number(t) : NaN;
    };
    const vol = nn(addForm.vol);
    const unit = nn(addForm.unit);
    if (!work) { setAjErr(tr('Ажлын нэрийг оруулна уу.')); return; }
    if (!/^\d+$/.test(no)) {
      setAjErr(tr('№ нь бүхэл тоо байх ёстой (жишээ «12») — бутархай дугаар нь бүлгийн мөрийг заадаг тул ажлын тоололд орохгүй.'));
      return;
    }
    if (Number.isNaN(vol) || Number.isNaN(unit)) { setAjErr(tr('Обьём ба Нэгж өртөг нь тоон утга байх ёстой.')); return; }
    setAjErr('');
    const oid = nextTmpOid();
    /* ⚠️ `parentIdx` нь СЕРВЕРИЙН `rows` дахь индекс (2026-09-24 аудит #7) —
       `parent.i` нь `rowsAll`-ынх (локал нэмэлт мөр орсон) тул батлахад
       `insertAdds.parentOf` серверийн мөрөнд буруу байрлалтай тулгах байв. */
    const parentIdx = rows.findIndex((r) => r.oid === parent.oid);
    setAdds((a) => [...a, { oid, parentNo: parent.no, parentWork: parent.work, parentIdx, no, work, vol, unit }]);
    /* Бүлэг ЭВХЭЭСТЭЙ бол шинэ мөр нуугдана — автоматаар дэлгэнэ */
    setCollapsed((st) => {
      if (!st.has(parent.oid)) return st;
      const m = new Set(st);
      m.delete(parent.oid);
      return m;
    });
    setAddFor(null); setAddForm(EMPTY_FORM);
    setAjNote(tr('«{0}» нэмэгдлээ — «Нэмэлт ажил батлуулах» товчоор батлуулна; батлагдмагц үндсэн хүснэгтэд бичигдэнэ.', work));
  }, [addForm, setAdds, rows]);
  /** Батлуулаагүй мөрийг хасах — зөвхөн локал (`adds` + LS) */
  const dropAdd = useCallback((oid: number) => setAdds((a) => a.filter((x) => x.oid !== oid)), [setAdds]);

  /**
   * ИЛГЭЭЛТЭЭ ТАТАХ — зохиогч өөрийн хүлээгдэж буй илгээлтийг буцааж авна
   * (2026-09-21). Урьд нь зохиогчид зам байгаагүй: `decidePlan` зохиогч=батлагч
   * буцаалтыг татгалздаг тул алдаатай илгээлт өөр батлагч буцаатал багцыг
   * түгжинэ.
   *
   * ⚠️ Эх хуудсанд ЮУ Ч бичихгүй (`withdrawPlan` зөвхөн төлөв хөдөлгөнө).
   * ⚠️ АГУУЛГЫГ НООРОГТ БУЦААНА: илгээхэд ноорог цэвэрлэгддэг тул татаад
   *    хоосон үлдвэл зохиогч бүх ажлаа дахин хийнэ. Зэрэгцээ өөрчлөлттэй ч
   *    буулгана (`strict: false`) — зохиогч засаж, ШИНЭ суурьтай дахин илгээнэ;
   *    тоог нь мэдэгдэнэ. Төрөл зөрвөл буулгахгүй, зөвхөн хэлнэ.
   */
  const withdraw = useCallback(async () => {
    if (!pending || busy || !isOwnSubmission) return;
    if (!window.confirm(tr('Илгээлтээ татах уу? Батлагч шийдвэрлэхээ болино; агуулга нь ноорог болж буцна.'))) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const oid = pending.oid;
      /* ⚠️ ДАРААЛАЛ (2026-09-21): ЭХЛЭЭД агуулгыг уншиж, төрлийг тулгана, ДАРАА
         нь татна. Урьд нь эхлээд татаад дараа нь уншдаг байсан тул агуулга
         уншигдахгүй эсвэл төрөл зөрвөл илгээлт ТАТАГДЧИХСАН атлаа ноорог хоосон
         үлдэж — зохиогчийн ажил серверээс ч, дэлгэцээс ч алга болдог байв.
         Одоо уншигдахгүй/зөрвөл ТАТАХГҮЙ, илгээлт хүлээгдсэн хэвээр. */
      const p = await loadPayload(oid).catch(() => null);
      if (!p) { setErr(tr('Илгээлтийн агуулга уншигдсангүй — татсангүй, дахин оролдоно уу.')); return; }
      if (p.kind !== kind) {
        setErr(p.kind === 'geree'
          ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд татна уу.')
          : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд татна уу.'));
        return;
      }
      const r = await withdrawPlan({ oid, me: user?.username ?? '' });
      if (!r.ok) { setErr(r.error ?? tr('Илгээлт татагдсангүй.')); return; }
      /* ⚠️ УРСГАЛЫГ ЭХЛЭЭД шинэчилнэ (2026-09-24): `pending` → null болоход
         хуваалцсан ноорогийн «түгжээ тайлагдав» зам Map-уудыг хоосолдог тул
         буулгасны ДАРАА дуудвал буцаасан агуулга тэр даруй арчигдаж байв.
         Мөн энэ нэг удаад хоослохгүй (`hdSkipUnlockOnce`) — агуулга нь
         зохиогчийн буцааж авсан ажил. */
      hdSkipUnlockOnce.current = true;
      await refreshFlow({ noRefetch: true });
      /* Серверийн одоогийн мөртэй тулгаж буулгана — зөрчлийн тоо бодит байна */
      const srv = await refetchServer();
      const ap = applyPayloadToDraft(p, srv.rows, false, srv.plan, srv.res);
      /* Буулгасан нүд «миний» болж (дифф мета тавина) алсад нэг удаа бичигдэнэ */
      if (ap.ok) {
        if (hdTimer.current) clearTimeout(hdTimer.current);
        hdTimer.current = setTimeout(() => { hdTimer.current = null; void hdFlushRef.current(); }, 1500);
      }
      const restored = ap.ok;
      const conflicts = ap.conflicts;
      setPreviewing(false);
      /* ⚠️ Шинэ жаазад олдоогүй мөрийг НУУХГҮЙ (2026-09-25 аудит) — ноорогт буугаагүй */
      const lostTxt = ap.unknown ? ` ${tr('{0} мөр одоогийн хуудаснаас олдсонгүй тул ноорогт буусангүй.', num(ap.unknown))}` : '';
      setNote((restored
        ? (conflicts
          ? tr('Илгээлт татагдлаа — агуулга ноорог болж буцлаа; {0} нүд хооронд нь өөр замаар өөрчлөгдсөн тул шалгаад дахин илгээнэ үү.', num(conflicts))
          : tr('Илгээлт татагдлаа — агуулга ноорог болж буцлаа, засаад дахин илгээж болно.'))
        : tr('Илгээлт татагдлаа. Агуулга нь ноорогт буусангүй (төрөл зөрсөн эсвэл уншигдсангүй).')) + lostTxt);
      await refreshFlow();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [pending, busy, isOwnSubmission, user, kind, applyPayloadToDraft, refetchServer, refreshFlow]);

  /**
   * ТАТСАН ИЛГЭЭЛТИЙГ НООРОГТ БУЦААХ (2026-09-23) — сүүлийн шийдвэр `withdrawn`
   * бөгөөд ноорог хоосон үед. «Хуваарь батлах» дарааллаас татахад агуулга
   * зөвхөн серверт үлддэг; энд `withdraw`-тай ИЖИЛ замаар (`strict: false`)
   * буулгана. Эх хуудсанд ЮУ Ч бичихгүй.
   */
  const restoreWithdrawn = useCallback(async () => {
    /* ⚠️ БУЦААГДСАН саналыг ч (2026-09-25): гүйцэтгэгч батлагчийн зөвшөөрөөгүй
       мөрүүдийг (улаан) засаад дахин илгээнэ — гүйцэтгэлийн «буцаагдсан илгээлт
       ноорог болж ачаалагдана» загвар. */
    const back = lastDecision?.status === PLAN_STATUS.returned;
    if (!lastDecision || (lastDecision.status !== PLAN_STATUS.withdrawn && !back) || busy || dirtyN > 0 || !canEdit) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const p = await loadPayload(lastDecision.oid).catch(() => null);
      if (!p) { setErr(tr('Илгээлтийн агуулга уншигдсангүй.')); return; }
      if (p.kind !== kind) {
        setErr(p.kind === 'geree'
          ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд дахин үзнэ үү.')
          : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд дахин үзнэ үү.'));
        return;
      }
      const srv = await refetchServer();
      const ap = applyPayloadToDraft(p, srv.rows, false, srv.plan, srv.res);
      setPreviewing(false);
      /* ⚠️ Шинэ жаазад олдоогүй мөрийг НУУХГҮЙ (2026-09-25 аудит) — ноорогт буугаагүй */
      const lostTxt = ap.unknown ? ` ${tr('{0} мөр одоогийн хуудаснаас олдсонгүй тул ноорогт буусангүй.', num(ap.unknown))}` : '';
      /* Батлагчийн тэмдэглэгээ — зөвхөн тэмдэглэсэн (талбартай) буцаалтад.
         ⚠️ Эффект ч (`lastDecision`-оос) ижлийг тавина — энд шууд тавих нь
         дахин татахгүйн тулд л (2026-09-25 аудит #2). */
      if (back && ap.ok && lastDecision.okRows) {
        setBackMarks({ oid: lastDecision.oid, ok: new Set(lastDecision.okRows), pay: p });
      }
      if (back && ap.ok) {
        setNote((lastDecision.okRows
          ? tr('Буцаагдсан санал ноорог болж буцлаа — УЛААН мөрүүдийг засаад дахин илгээнэ үү (ногоон нь зөвшөөрөгдсөн).')
          : tr('Буцаагдсан санал ноорог болж буцлаа — засаад дахин илгээнэ үү.'))
          /* ⚠️ Зэрэгцээ өөрчлөлтийн тоог НУУХГҮЙ (татсан замтай ижил) */
          + (ap.conflicts ? ` ${tr('{0} нүд хооронд нь өөр замаар өөрчлөгдсөн тул шалгана уу.', num(ap.conflicts))}` : '') + lostTxt);
        return;
      }
      setNote((ap.ok
        ? (ap.conflicts
          ? tr('Татсан илгээлтийн агуулга ноорог болж буцлаа; {0} нүд хооронд нь өөр замаар өөрчлөгдсөн тул шалгаад дахин илгээнэ үү.', num(ap.conflicts))
          : tr('Татсан илгээлтийн агуулга ноорог болж буцлаа — засаад дахин илгээж болно.'))
        : tr('Агуулга ноорогт буусангүй (төрөл зөрсөн эсвэл уншигдсангүй).')) + lostTxt);
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [lastDecision, busy, dirtyN, canEdit, kind, applyPayloadToDraft, refetchServer]);

  /** Урьдчилан харахыг болих — ноорог зүгээр л хаягдана */
  const clearPreview = useCallback(() => {
    setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
    setADraft(new Map()); setResDraft(new Map());
    /* Мөрийн ногоон тэмдэглэгээ нь харсан саналынх — харалттай хамт арилна (2026-09-25) */
    setOkRows(new Set());
    setPreviewing(false); setNote('');
    /* ⚠️ Хуваалцсан нооргийг ДАХИН сэргээнэ (2026-09-24): харалт Map-уудыг
       дарсан тул алсад шинэ бичилт ирэх хүртэл ноорог харагдахгүй байв. */
    hdReady.current = null; hdLastSeenAt.current = 0;
  }, []);

  /**
   * ШИЙДВЭР — батлах эсвэл буцаах.
   *
   * ⚠️ ДАРААЛАЛ ЧУХАЛ: батлахад эхлээд агуулгыг ноорог болгон буулгаж эх
   *    хуудсанд бичнэ, ЗӨВХӨН амжилттай бичигдсэний дараа мөрийг
   *    `approved` болгоно. Эсрэгээр хийвэл бичилт унасан үед «батлагдсан»
   *    гэж харагдах атлаа хуваарь хуучин хэвээр үлдэнэ.
   */
  const decide = useCallback(async (approve: boolean, reason: string, okList?: number[]) => {
    if (!pending || busy) return;
    setBusy(true); setErr(''); setNote('');
    try {
      if (approve) {
        /*
         * ⚠️ БАТЛАХААС ӨМНӨ илгээлт ХЭВЭЭР ХҮЛЭЭГДЭЖ БАЙГААГ баталгаажуулна.
         *    Батлах зам нь эх хуудсанд ЭХЛЭЭД бичээд ДАРАА нь төлөвийг
         *    шинэчилдэг тул `decidePlan`-ийн хамгаалалт хэтэрхий оройтоно:
         *    хоёр дахь батлагч хуваарийг бичсэний ДАРАА л татгалзах байлаа.
         */
        /* ⚠️ ЭРХИЙГ ЭХ ХУУДСАНД БИЧИХЭЭС ӨМНӨ (2026-09-17): батлах зам нь `save()`
           → `applyUpdates`-ыг `decidePlan`-ийн хүрээний шалгуураас ӨМНӨ ажиллуулдаг
           тул эрхгүй хүн (товч нуугдсан ч консолоос) эх хуудсанд бичиж чадах байв. */
        if (!canApprove) { setErr(tr('Энэ багцын хуваарийг батлах эрхгүй.')); return; }
        const fresh = await loadPending(pkg.key);
        if (!fresh || fresh.oid !== pending.oid) {
          setErr(tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'));
          setFlowBox(null);
          await refreshFlow();
          return;
        }
        /*
         * ⚠️ ЗОХИОГЧ ӨӨРИЙГӨӨ БАТЛАХГҮЙ — ЭНД, бичихээс ӨМНӨ (2026-09-08).
         *    `decidePlan` дотор ижил дүрэм бий ч тэр нь БИЧИЛТИЙН ДАРАА л
         *    ажилладаг: `setApproving` → `useEffect` → `save()` нь огноо,
         *    уялдаа, сарын обьёмыг эх хуудсанд аль хэдийн бичсэн байна.
         *    Тэгвэл хуваарь батлагдалгүйгээр хөдөлж, илгээлт нь `pending`
         *    хэвээр үлдэж хуудас мөнхөд түгжигдэнэ. `plan` + `planApprove`
         *    хоёр эрхийг нэг хүнд олгосон үед энэ нь цорын ганц хаалт.
         * ⚠️ Харьцуулалт нь СЕРВЕРИЙН `fresh.author`-оор — локал `pending`
         *    хуучирсан байж болно.
         */
        const me = (user?.username ?? '').trim().toLowerCase();
        if (me && me === fresh.author.trim().toLowerCase()) {
          setErr(tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.'));
          setFlowBox(null);
          return;
        }
        /* ⚠️ МӨР БҮР НОГООН (2026-09-25 аудит): хяналтын горимоос гадуурх «Шийдвэрлэх»
           цонх ч `Guitsetgel.allOk` дүрмийг дагана — урьдчилан харсан саналын
           өөрчлөгдсөн мөр бүрийг батлагч ногоон болгосон байх ёстой. Хараагүй бол
           доор буулгаад батлах эффект улаан мөрөнд зогсоож харалт руу буцаана. */
        if (reviewOids.some((o) => !okRows.has(o))) {
          setErr(tr('Өөрчлөгдсөн мөр бүрийг ногоон болгосны дараа батална.'));
          setFlowBox(null);
          return;
        }
        /*
         * ⚠️ ТҮГЖЭЭ (claim) — ЭХ ХУУДСАНД БИЧИХЭЭС ӨМНӨ (2026-09-25 аудит). Урьд нь
         *    бичих явцад зохиогч татах, эсвэл хоёр дахь батлагч буцаах/батлах
         *    боломжтой байсан тул «татсан/буцаагдсан» санал хуваарьт суудаг байв.
         *    Түгжсэний дараа `withdrawPlan`/бусдын `decidePlan` татгалзана. Доорх
         *    бүх эрт буцалт (агуулга уншигдсангүй, зөрчил) түгжээг ТАЙЛНА; батлах
         *    эффект руу шилжвэл тэр нь бичилт унасан үед тайлна.
         */
        const cl = await claimPlan({ oid: pending.oid, approver: user?.username ?? '', author: fresh.author });
        if (!cl.ok) {
          setErr(cl.error ?? tr('Шийдвэр хадгалагдсангүй.'));
          setFlowBox(null);
          await refreshFlow();
          return;
        }
        const release = () => releasePlanClaim({ oid: pending.oid, approver: user?.username ?? '' });
        let handed = false;
        try {
        /* ⚠️ Урьдчилан харж байгаа бол агуулга аль хэдийн ноорогт байна —
           дахин татвал сүлжээний дэмий дуудлага, мөн батлагчийн харсан
           зурагтай зөрөх (хооронд нь илгээлт солигдвол) эрсдэлтэй. */
        /* ⚠️ 2026-09-21-нд ЭРГҮҮЛСЭН — урьдчилан харсан ч ДАХИН ТАТАЖ ТУЛГАНА.
           Дээрх айдас (илгээлт солигдох) нь `fresh.oid !== pending.oid`-оор
           аль хэдийн баригдсан. Харин `preview` нь ТЭР ҮЕИЙН мөртэй тулгасан
           тул харснаас батлах хүртэлх завсарт өөр замаар орсон өөрчлөлт
           (зэрэгцээ өөрчлөлт, зохиогч хөндөөгүй блокийн шинэ утга) тулгалтыг
           бүхэлд нь АЛГАСДАГ байв — `previewing` нь тулгалтыг тойрох хаалга
           болж байсан. Одоо хоёр зам нэг: сервер → тулгах → зөрвөл зогсох. */
        {
          const p = await loadPayload(pending.oid);
          if (!p) {
            setErr(tr('Илгээлтийн агуулга уншигдсангүй — батлах боломжгүй.'));
            return;
          }
          /* ⚠️ СЕРВЕРИЙН ОДООГИЙН мөрөөр (2026-09-21): зэрэгцээ өөрчлөлтийг
             state-ийн хуучирсан `rows`-той биш, дөнгөж татсантай тулгана.
             Сарын задаргаа ч мөн адил (`refetchServer`). */
          const srv = await refetchServer();
          /* ⚠️ ТӨРӨЛ ЗӨРВӨЛ ЭНД ЗОГСОНО (2026-09-11-ний аудитын S1).
             Ноорогт буулгахгүй тул `save` нь буруу талбарт бичих зам
             бүрмөсөн хаагдана; илгээлт `pending` хэвээр үлдэнэ.
             ⚠️ ЗЭРЭГЦЭЭ ӨӨРЧЛӨЛТ ч мөн ЭНД зогсоно (2026-09-21). */
          const ap = applyPayloadToDraft(p, srv.rows, true, srv.plan, srv.res);
          if (!ap.ok) {
            /* ⚠️ Мэдэгдэхгүй мөр (шинэ жааз) — хагас батлалт хийхгүй (2026-09-25 аудит) */
            setErr(ap.why === 'conflict'
              ? conflictMsg(ap.conflicts)
              : ap.why === 'unknown'
                ? unknownMsg(ap.unknown)
                : p.kind === 'geree'
                  ? tr('Энэ илгээлт ГЭРЭЭНИЙ огноонд хамаарна — «Гэрээ» таб руу шилжээд батална уу.')
                  : tr('Энэ илгээлт ТӨЛӨВЛӨГӨӨНИЙ огноонд хамаарна — «Төлөвлөгөө» таб руу шилжээд батална уу.'));
            return;
          }
        }
        /* ⚠️ `save` нь ноорогийг state-ээс уншдаг тул ЭНД шууд дуудаж
           болохгүй — React төлөв энэ дуудлагын дараа шинэчлэгдэнэ. Батлах
           тэмдгийг тавьж, доорх `useEffect` бичилтийг гүйцэтгэнэ. */
        setApproving(pending.oid);
        handed = true;
        setFlowBox(null); setFlowTxt('');
        return;
        } finally {
          if (!handed) void release();
        }
      }
      const r = await decidePlan({
        oid: pending.oid, approve: false,
        approver: user?.username ?? '', author: pending.author, reason,
        /* ⚠️ Зөвшөөрсөн мөрүүд (2026-09-25) — гүйцэтгэгч улаан/ногоон харна */
        okRows: okList,
      });
      if (!r.ok) { setErr(r.error ?? tr('Шийдвэр хадгалагдсангүй.')); return; }
      /* ⚠️ Урьдчилан харсан ноорогийг ЗААВАЛ цэвэрлэнэ: буцаасан саналын
         агуулга дэлгэц дээр үлдвэл дараагийн «Хадгалах» түүнийг эх хуудсанд
         бичиж, БУЦААСАН хуваарь батлагдсан мэт болно. */
      setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map());
      setADraft(new Map()); setResDraft(new Map());
      setPreviewing(false);
      setFlowBox(null); setFlowTxt('');
      /* ⚠️ Талбаргүй үед тэмдэглэгээ хадгалагдаагүйг НУУХГҮЙ — хяналтын горимд
         цонх хаагдаж мессеж нь дараалал руу дамждаг тул `note`-д нийлүүлнэ. */
      setNote(tr('Хуваарь буцаагдлаа — гүйцэтгэгч засаад дахин илгээнэ.') + (r.warn ? ` ${r.warn}` : ''));
      await refreshFlow({ noRefetch: true });
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, busy, pkg, user, canApprove, applyPayloadToDraft, refetchServer, refreshFlow, reviewOids, okRows]);

  /**
   * БАТЛАХЫГ ГҮЙЦЭЭХ — агуулга ноорогт буусны ДАРААХ зурагдалт.
   *
   * ⚠️ Эх хуудсанд бичих ажлыг `save` хийнэ: тэр нь схем, өөрчлөгдсөн блокийг
   *    ялгах, агшин солигдвол мөрийг дахин зураглах бүх нарийн ширийнийг
   *    мэднэ. Энд давхардуулбал хоёр зам салж, нэг нь чимээгүй хоцорно.
   *
   * ⚠️ `save` амжилттай болсныг `dirtyN === 0` -оор мэднэ. Бичилт уначихвал
   *    ноорог үлдэх тул мөрийг `approved` болгохгүй — «батлагдсан» гэж
   *    харагдаад хуваарь нь хуучин хэвээр үлдэхээс сэргийлнэ.
   */
  const savedRef = useRef(false);
  useEffect(() => {
    if (approving == null || busy) return;
    if (!savedRef.current) {
      /*
       * ⚠️ ШИНЭЭР БУУЛГАСАН САНАЛЫГ ДАХИН ТУЛГАНА (2026-09-25 аудит #8). `decide(true)`
       *    нь серверээс дахин татаж ноорогт буулгадаг — хооронд нь серверт орсон
       *    өөрчлөлтөөр хяналтын мөрийн жагсаалт (`reviewOids`) өөрчлөгдөж, батлагчийн
       *    ХАРААГҮЙ мөр ногоонгүйгээр батлагдах байв. Энэ зурагдалт шинэ ноорогтой.
       */
      /* ⚠️ 2026-09-25 аудит: хяналтын горимоос ГАДУУР ч (урьдчилан хараагүй
         «Шийдвэрлэх») мөр бүрийн ногоон дүрэм — харалт руу буцааж тэмдэглүүлнэ.
         Түгжээг ТАЙЛНА: эх хуудсанд юу ч бичигдээгүй. */
      if (reviewOids.some((o) => !okRows.has(o))) {
        void releasePlanClaim({ oid: approving, approver: user?.username ?? '' });
        setApproving(null);
        setPreviewing(true);
        setErr(review
          ? tr('Санал хооронд нь дахин буулгахад өөрчлөгдсөн мөр нэмэгдсэн — шинэ улаан мөрүүдийг шалгаж ногоон болгоод дахин батална уу.')
          : tr('Өөрчлөгдсөн мөр бүрийг ногоон болгосны дараа батална.'));
        return;
      }
      /*
       * ⚠️ БИЧИХ ЗҮЙЛГҮЙ ИЛГЭЭЛТ — БАТЛАГДСАН гэж хаана (2026-09-08-ны аудит).
       *
       * Урьд нь энд ЗҮГЭЭР Л ГАРДАГ байсан: `save` дуудагдахгүй, `decidePlan`
       * ч дуудагдахгүй, ямар ч мессеж гарахгүй — батлагч товч дарсан атлаа
       * ЮУ Ч болоогүй мэт харагдаж, илгээлт МӨНХӨД «хүлээгдэж буй» хэвээр
       * үлдэнэ. Тэр багцын хуваарь бүхэлдээ түгжигдэнэ (`locked`).
       *
       * Ноорог хоосон байх нь ХҮЧИНТЭЙ тохиолдол: илгээснээс хойш эх хуваарь
       * өөр замаар (өөр батлагдсан илгээлт) ижил утгад хүрсэн бол ялгаа
       * үлдэхгүй. Бичих зүйл байхгүй ч ШИЙДВЭР нь бүртгэгдэх ёстой.
       */
      if (!dirtyN) {
        setApproving(null);
        setPreviewing(false);
        /* ⚠️ `busy` гинж ДУУСТАЛ (2026-09-21): урьд нь энэ алхам busy-гүй тул
           `decidePlan` явж байхад багц солиход өөр багцын pending/шийдвэр
           наалддаг байв. Сонгогчууд `busy`-д түгжигдэнэ. */
        setBusy(true);
        void (async () => {
          try {
            const r = await decidePlan({
              oid: approving, approve: true,
              approver: user?.username ?? '', author: pending?.author ?? '',
            });
            setNote(r.ok
              ? tr('Хуваарь батлагдлаа — эх хуудас аль хэдийн ижил байсан тул өөрчлөлт бичигдсэнгүй.')
              : '');
            if (!r.ok) setErr(r.error ?? tr('Шийдвэр хадгалагдсангүй.'));
            await refreshFlow({ noRefetch: true });
          } finally {
            setBusy(false);
          }
        })();
        return;
      }
      savedRef.current = true;
      /*
       * ⚠️ УНАЛТЫГ `save`-ИЙН БУЦААХ УТГААР (2026-09-25 аудит). Урьд нь энэ эффект
       *    `busy` хөдлөхөд дахин ажиллана гэж найддаг байв. Гэтэл `staleN` зам
       *    `setBusy(true)` → `false`-ийг НЭГ синхрон тикт хийдэг тул React нэгтгэж
       *    `busy` өөрчлөгдөөгүй мэт болно: эффект дахин ажиллахгүй, `approving` ба
       *    `savedRef` гацаж, `locked` тайлагдана. Дараа нь «Харахыг болих»/«Цуцлах»
       *    дарахад `dirtyN` 0 болж энэ эффект `savedRef = true`-гээр `decidePlan`
       *    руу орж, ЮУ Ч бичигдээгүй илгээлтийг «батлагдсан» болгодог байв.
       *    Одоо унавал доорх «БИЧИЛТ УНАСАН» салаатай ИЖИЛ төлөвт шууд оруулна;
       *    эффект өөрөө тэр салаанд түрүүлж орсон бол (`savedRef` худал) алгасна.
       */
      const claimOid = approving;
      void save().then((ok) => {
        if (ok || !savedRef.current) return;
        savedRef.current = false;
        /* ⚠️ Бичилт эхлээгүй/унасан — түгжээг тайлна (2026-09-25 аудит) */
        void releasePlanClaim({ oid: claimOid, approver: user?.username ?? '' });
        setApproving(null);
        setPreviewing(true);
        setErr((cur) => cur || tr('Хуваарь эх хуудсанд бичигдсэнгүй — илгээлт хүлээгдэж буй хэвээр.'));
      });
      return;
    }
    savedRef.current = false;
    const oid = approving;
    setApproving(null);
    if (dirtyN) {
      /*
       * ⚠️ БИЧИЛТ УНАСАН. Ноорог хэвээр үлдсэн тул `previewing`-ийг
       *    ТАВИХГҮЙ: тавьчихвал энэ агуулга батлагчийн ӨӨРИЙН засвар мэт
       *    болж, `locked` тайлагдаж, дараа нь батлалгүйгээр эх хуудсанд
       *    бичигдэх зам нээгдэнэ. Урьдчилан харах төлөвт үлдээж, «Харахыг
       *    болих»-оор л цэвэрлүүлнэ.
       *
       * ⚠️ 2026-09-21-нд ЭРГҮҮЛСЭН — `previewing`-ийг ТАВИНА. Дээрх айдас
       *    үндэсгүй: `locked` нь `pending && !approving`-оос л хамаардаг,
       *    `previewing`-ээс биш; «Батлуулах» ч `!pending`-д нуугддаг тул
       *    батлалгүй бичих зам нээгдэхгүй. Харин урьдчилан ХАРАЛГҮЙ баталсан
       *    үед `previewing = false` тул «Цуцлах» (`!locked`) ч, «Харахыг
       *    болих» (`previewing`) ч гарахгүй — ноорог ГАЦДАГ байв. Одоо
       *    «Харахыг болих» гарна; дахин «Шийдвэрлэх» дарвал `decide` нь
       *    `previewing` тул агуулгыг дахин татахгүй, энэ ноорогоо бичнэ.
       */
      setPreviewing(true);
      /* ⚠️ Түгжээг тайлна (2026-09-25 аудит) — зохиогч татах/өөр батлагч шийдэх боломжтой болно */
      void releasePlanClaim({ oid, approver: user?.username ?? '' });
      /* ⚠️ `save()` өөрөө тодорхой шалтгаан (staleN г.м.) бичсэн бол ДАРАХГҮЙ (2026-09-17) */
      setErr((cur) => cur || tr('Хуваарь эх хуудсанд бичигдсэнгүй — илгээлт хүлээгдэж буй хэвээр.'));
      return;
    }
    setPreviewing(false);
    /* ⚠️ `busy` гинж ДУУСТАЛ (2026-09-21) — дээрх салаатай ижил шалтгаан. */
    setBusy(true);
    void (async () => {
      try {
        const r = await decidePlan({
          oid, approve: true,
          approver: user?.username ?? '', author: pending?.author ?? '',
        });
        if (!r.ok) {
          setErr(r.error ?? tr('Хуваарь бичигдсэн ч төлөв шинэчлэгдсэнгүй — дахин оролдоно уу.'));
        } else {
          setNote(tr('Хуваарь батлагдаж эх хуудсанд бичигдлээ.'));
        }
        await refreshFlow({ noRefetch: true });
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approving, busy, dirtyN]);

  /* ══════════════════ ХЯНАЛТЫН ГОРИМ (`review`, 2026-09-25) ══════════════════ */
  /**
   * НЭЭГДЭНГҮҮТ САНАЛЫГ ХУАНЛИ ДЭЭР БУУЛГАНА — `preview`-ийн ЯГ ижил замаар
   * (сервер → тулгах → зөрвөл зогсох).
   * ⚠️ Мөр · задаргаа ачаалагдаж дуустал ХҮЛЭЭНЭ: `refetchServer` нь `sc`-гүй
   *    үед хоосон `rows`-оор тулгаж санал огт буухгүй байх байв.
   * ⚠️ НЭГ Л УДАА: алдаа гарвал (зэрэгцээ өөрчлөлт г.м.) давтан оролдохгүй —
   *    мессеж нь батлагчид үлдэнэ.
   * ⚠️ Энэ эффект `preview`-ийн ДАРАА зарлагдах ёстой — deps массив зурагдалтын
   *    үед уншигддаг тул өмнө нь бол TDZ (`Cannot access before initialization`).
   */
  const reviewStarted = useRef(false);
  /** Эхлэлийн эффект «аль хэдийн шийдвэрлэгдсэн» алдаа тавьсан (#5) — `onDone`-ийг алгасна */
  const reviewStartErr = useRef(false);
  useEffect(() => {
    if (!review || reviewStarted.current) return;
    if (pkg.key !== review.pkgKey || flowReady === null || busy || !sc || !rows.length || obState === 'loading') return;
    reviewStarted.current = true;
    /* ⚠️ Урсгал уншигдаагүй (сүлжээ/эрх) ≠ «шийдвэрлэгдсэн» — шалтгааныг ЯГ хэлнэ */
    if (flowReady === false) {
      setErr(flowWhy || tr('Батлах урсгал уншигдсангүй — сүлжээгээ шалгана уу.'));
      return;
    }
    if (pending?.oid !== review.oid) {
      /* ⚠️ Доорх «шийдвэр хадгалагдсан» эффект ИЖИЛ commit-д `lastDecision`-ийг
         (өөр хүний шийдвэр) хараад цонхыг ХООСОН мессежтэй хаадаг байв —
         `err` дараагийн зурагдалтад л `noteRef`-д ордог (2026-09-25 аудит #5).
         Цонх нээлттэй үлдэж алдаагаа харуулна; «Хаах»-аар гарна. */
      reviewStartErr.current = true;
      setErr(tr('Энэ илгээлт аль хэдийн шийдвэрлэгдсэн байна. Хуудсаа шинэчилнэ үү.'));
      return;
    }
    void preview();
  }, [review, pkg.key, flowReady, flowWhy, busy, sc, rows.length, obState, pending, preview]);
  /** Хяналтын ИЛГЭЭЛТ ЯГ ЭНЭ ҮҮ — өөр/шинэ илгээлт дээр шийдвэр гаргуулахгүй */
  const reviewLive = !!review && pending?.oid === review.oid && previewing;
  /* ⚠️ ЗӨРЧЛӨӨР УНАСАН хяналт (2026-09-25 аудит #1) — зөвхөн «Буцаах» нээлттэй,
     тэмдэглэгээгүй (`okRows` undefined): мөр харагдаагүй тул «зөвшөөрсөн» гэх зүйлгүй. */
  const reviewConflict = !!review && pending?.oid === review.oid && !previewing && previewBad === review.oid;

  /**
   * ШИЙДВЭР ХАДГАЛАГДСАН — дараалал руу буцна.
   * ⚠️ `lastDecision` нь `refreshFlow` хүлээгдэж буй илгээлт АЛГА үед л тавьдаг
   *    тул ЭНЭ илгээлт шийдэгдсэн гэдгийн найдвартай дохио (батлах гинжний
   *    «бичилт унасан» салаанд илгээлт хүлээгдсэн хэвээр → цонх хаагдахгүй).
   */
  /* ⚠️ АЛДААГ ч дамжуулна (2026-09-25 аудит): өөр батлагч зуур шийдсэн үед
     `decidePlan` алдаа өгч, `lastDecision` нь энэ илгээлт болж цонх хаагдана —
     зөвхөн `note` дамжуулбал тэр алдаа ор мөргүй алга болно. */
  /* ⚠️ АЛДАА/МЭДЭЭГ ЯЛГАЖ дамжуулна (2026-09-25 аудит #5) — дараалал алдааг
     `note` (ногоон) болгож харуулдаг байв. */
  const noteRef = useRef<{ msg: string; isErr: boolean }>({ msg: '', isErr: false });
  noteRef.current = err ? { msg: err, isErr: true } : { msg: note, isErr: false };
  const reviewDoneRef = useRef(review?.onDone);
  reviewDoneRef.current = review?.onDone;
  const reviewOid = review?.oid;
  useEffect(() => {
    if (reviewOid == null || !lastDecision || lastDecision.oid !== reviewOid) return;
    if (lastDecision.status === PLAN_STATUS.pending) return;
    if (reviewStartErr.current) return;
    reviewDoneRef.current?.(noteRef.current);
  }, [reviewOid, lastDecision]);

  /**
   * БУЦААХ (хяналтын горим) — зөвшөөрөөгүй мөрүүдийг шалтгаанд ЖАГСААНА
   * (`Guitsetgel.badText`-ийн загвар), зөвшөөрсөнийг `okRows`-оор хадгална.
   * ⚠️ `butsaasan_shaltgaan` нь 2048 тэмдэгт — эхний 12 мөр, нийт 2000-аар тасална.
   */
  const rejectReview = (txt: string) => {
    if (!txt.trim()) { setErr(tr('Буцаах шалтгааныг бичнэ үү.')); return; }
    const byOid = new Map(plan.map((r) => [r.oid, r]));
    const bad = !reviewLive ? [] : reviewOids.filter((o) => !okRows.has(o))
      .map((o) => byOid.get(o)).filter((r): r is PlanRow => !!r);
    const list = bad.slice(0, 12).map((r) => `${r.no} ${r.work}`.trim()).join('; ')
      + (bad.length > 12 ? ` … (+${bad.length - 12})` : '');
    const why = bad.length
      ? `${txt.trim()}\n${tr('Зөвшөөрөгдөөгүй {0} мөр: {1}', num(bad.length), list)}`
      : txt.trim();
    /* ⚠️ Зөрчлөөр унасан үед (`reviewConflict`) тэмдэглэгээ ИЛГЭЭХГҮЙ — `[]` бол
       гүйцэтгэгчид бүх мөр «зөвшөөрөөгүй» улаан болж ХУДАЛ харагдана. */
    void decide(false, why.slice(0, 2000), reviewLive ? reviewOids.filter((o) => okRows.has(o)) : undefined);
  };
  /**
   * ДАРААГИЙН ЗӨВШӨӨРӨӨГҮЙ МӨР (2026-09-25 аудит, UX): ~1,400 мөрийн виртуал
   * жагсаалтад улаан мөрийг гүйлгэж хайх шаардлагагүй — сонгоод гүйлгэнэ.
   * ⚠️ Өөрчлөлт нь ИДЭВХГҮЙ блокт байвал тэр блок руу шилжинэ — эс бөгөөс
   *    одоогийн блок дээр ялгаа харагдахгүй.
   * ⚠️ Шүүлт/эвхэлтэд нуугдсан бол шүүлтийг цэвэрлэж модыг дэлгэнэ.
   */
  const scrollToOid = useRef<number | null>(null);
  const jumpNextBad = () => {
    const idxs = reviewOids.filter((o) => !okRows.has(o))
      .map((o) => plan.findIndex((r) => r.oid === o)).filter((i) => i >= 0).sort((a, b) => a - b);
    if (!idxs.length) return;
    const cur = sel != null ? plan.findIndex((r) => r.oid === sel) : -1;
    const i = idxs.find((x) => x > cur) ?? idxs[0];
    const r = plan[i];
    const b0 = base[i];
    const bch = r.spans.findIndex((sp, b) => !sameSpan(sp, b0?.spans[b]));
    if (bch >= 0 && bch !== blk) setBlk(bch);
    if (!visible.some((v) => v.oid === r.oid)) {
      setFilter('all'); setFYear('all'); setFGrp('all'); setCollapsed(new Set()); setLvl(0);
    }
    setSel(r.oid);
    scrollToOid.current = r.oid;
  };
  /* Хяналт нээгдмэгц ЭХНИЙ өөрчлөлт рүү гүйлгэнэ — эхний гүйлгэлт «өнөөдөр» рүү
     явдаг тул өөрчлөгдсөн зурвас дэлгэцээс гадуур үлдэж, «юу өөрчлөгдсөн бэ» гэж
     хайлгадаг байв (хөтчийн туршилт, 2026-09-25). */
  const reviewJumped = useRef(false);
  useEffect(() => {
    if (!review || !previewing || !reviewOids.length || reviewJumped.current) return;
    reviewJumped.current = true;
    jumpNextBad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, previewing, reviewOids.length]);
  useEffect(() => {
    const o = scrollToOid.current;
    const el = scrollRef.current;
    if (o == null || !el) return;
    const k = visible.findIndex((v) => v.oid === o);
    if (k < 0) return;
    scrollToOid.current = null;
    el.scrollTop = Math.max(0, (k - 3) * PL_ROW);
    const sp = visible[k].spans[blk];
    if (sp) el.scrollLeft = Math.max(0, xOf(sp.start) - 240);
  }, [visible, sel, blk, xOf]);
  /** Мөрийн зөвшөөрлийг сэлгэнэ — зөвхөн өөрчлөгдсөн ажлын мөрд */
  const toggleOk = (oid: number) => {
    if (busy || approving != null) return;
    setOkRows((s0) => {
      const m = new Set(s0);
      if (m.has(oid)) m.delete(oid); else m.add(oid);
      return m;
    });
  };
  /** Мөрийн тэмдэг: хяналтад — батлагчийн сонголт; гүйцэтгэгчид — буцаасан шийдвэр */
  const reviewSet = useMemo(() => new Set(reviewOids), [reviewOids]);

  /*
   * ⚠️ БУЦААСАН ТЭМДЭГЛЭГЭЭГ `lastDecision`-ООС ҮҮСГЭНЭ (2026-09-25 аудит #2).
   *    Урьд нь зөвхөн «Ноорогт буцааж засах» дарсан агшинд санах ойд тавьдаг тул
   *    хуудас дахин ачаалах, хамт ажиллагч өөр компьютерээс (хуваалцсан ноорог)
   *    нээхэд улаан/ногоон тэмдэг огт харагддаггүй байв. Одоо сүүлийн шийдвэр
   *    «буцаасан» бөгөөд тэмдэглэгээтэй (`okRows != null`) бол саналыг нэг удаа
   *    татаж хадгална; харагдах эсэхийг `backOn` шийднэ (ноорогтой үед л).
   * ⚠️ `refreshFlow` нь `lastDecision`-ийг түр `null` болгодог тул энд АРЧИХГҮЙ —
   *    ижил илгээлт/төрөлд дахин татахгүй (`backRef`).
   */
  const backRef = useRef(backMarks);
  backRef.current = backMarks;
  useEffect(() => {
    const d = lastDecision;
    if (review || !d || d.status !== PLAN_STATUS.returned || !d.okRows) return undefined;
    const cur = backRef.current;
    if (cur && cur.oid === d.oid && cur.pay.kind === kind) return undefined;
    let dead = false;
    const ok = new Set(d.okRows);
    void loadPayload(d.oid).then((p) => {
      if (dead || !p || p.kind !== kind) return;
      setBackMarks({ oid: d.oid, ok, pay: p });
    }).catch(() => { /* тэмдэглэгээ нэмэлт — уншигдахгүй бол тэмдэггүй */ });
    return () => { dead = true; };
  }, [review, lastDecision, kind]);
  /** Буцаасан тэмдэг ИДЭВХТЭЙ юу — яг тэр шийдвэр сүүлийнх, ноорог байгаа */
  const backOn = !review && !!backMarks && dirtyN > 0 && lastDecision?.oid === backMarks.oid;
  /*
   * ⚠️ ТЭМДЭГ ЗӨВХӨН САНАЛД БАЙСАН, УТГА НЬ ХЭВЭЭР МӨРД (2026-09-25 аудит #3).
   *    Урьд нь гүйцэтгэгчийн ОДООГИЙН ноорогтой тулгадаг тул засаж эхэлсэн
   *    улаан мөр улаан хэвээр, саналд огт байгаагүй ШИНЭ засвар «зөвшөөрөөгүй»
   *    улаан болж харагддаг байв. Одоо: мөр саналд байх + утга нь саналынхтай
   *    ИЖИЛ (зохиогч хөндөөгүй блок/талбар — `base`-тэй ижил — тооцохгүй) бол
   *    л тэмдэглэнэ; өөрчлөгдмөгц саармаг.
   */
  const backMarkMap = useMemo(() => {
    const out = new Map<number, 'ok' | 'bad'>();
    if (!backOn || !backMarks) return out;
    const p = backMarks.pay;
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
          const s0 = arr[b];
          const v0 = s0 ? { start: s0.start, end: s0.end } : null;
          if (bs && sameSpan(v0, bs[b] ?? null)) continue;
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
          const s0 = ac.start[b] ?? null;
          const e0 = ac.end[b] ?? null;
          if (!(bs && s0 === (bs.start[b] ?? null)) && s0 !== (r.aStart?.[b] ?? null)) return false;
          if (!(bs && e0 === (bs.end[b] ?? null)) && e0 !== (r.aEnd?.[b] ?? null)) return false;
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
      out.set(o, backMarks.ok.has(o) ? 'ok' : 'bad');
    }
    return out;
  }, [backOn, backMarks, plan, byCode, reviewSet, n, obDraft, obPlan, obResDraft, obRes]);
  /* ⚠️ 2026-09-25 аудит: батлагч ЭНГИЙН хуудсанд урьдчилан харж байхад ч мөр бүрийг
     ногоон болгоно — «Шийдвэрлэх»-ийн батлалт тэр дүрмээр хаалттай (`decide`). */
  const marking = !!review || (previewing && pending != null && canApprove && !isOwnSubmission);
  const markOf = (r: PlanRow): 'ok' | 'bad' | undefined => {
    if (!reviewSet.has(r.oid)) return undefined;
    if (marking) return okRows.has(r.oid) ? 'ok' : 'bad';
    if (backOn) return backMarkMap.get(r.oid);
    return undefined;
  };

  /**
   * ⚠️ ХАДГАЛААГҮЙ НООРОГ нь зөвхөн санах ойд байна. Таб хаах, дахин ачаалах,
   * багц солих гурвуулаа түүнийг чимээгүй устгана.
   */
  /* ⚠️ ТАБ ХААХАД анхааруулахгүй: урьдчилан харалтын агуулга нь серверт
     аюулгүй хадгалагдсан илгээлт бөгөөд хуанли дээр зөвхөн үзүүлж байгаа —
     хуудсыг хаахад алдагдах зүйлгүй.
     ⚠️ БАГЦ/ТӨРӨЛ СОЛИХ нь ӨӨР зүйл: тэнд `askSwitch` асуудаг (2026-09-11).
     Хаах нь урьдчилан харалтыг үлдээнэ, солих нь ТАСАЛНА — батлагч юу харж
     байснаа алдаж, илгээлт нь хүлээгдсэн хэвээр үлдэнэ. */
  useEffect(() => {
    if (!dirtyN || previewing) return undefined;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyN, previewing]);
  /*
   * ⚠️ ГИНЖ ЯВЖ БАЙХАД ГАРАХГҮЙ (2026-09-25 аудит #4): батлах явцад (`approving`)
   *    эсвэл бичилт/шийдвэр явж байхад (`busy`) өөр харагдац руу шилжих, таб
   *    хаах нь гинжийг `save`-ийн ДАРАА, `decidePlan`-ийн ӨМНӨ тасалж болно.
   *    `Portal.setView` нь `planNavBusy()`-г асууж баталгаажуулна; таб хаахад
   *    хөтчийн анхааруулга. Дээрх «урьдчилан харалтад анхааруулахгүй» дүрэмтэй
   *    зөрчилдөхгүй — энэ нь зөвхөн гинж ЯВЖ БАЙХ хооронд.
   */
  const [navId] = useState(() => Symbol('huvaari'));
  const chainBusy = approving != null || busy;
  useEffect(() => {
    if (!chainBusy) return undefined;
    setPlanNavBusy(navId, true);
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => {
      setPlanNavBusy(navId, false);
      window.removeEventListener('beforeunload', warn);
    };
  }, [chainBusy, navId]);

  /* ══════════════ ХУВААЛЦСАН НООРОГ — ArcGIS дээр (2026-09-23) ══════════════ */
  /**
   * ⚠️ ЯАГААД (хэрэглэгч: «бөглөх хуудасныхтай адил — хэн ч, аль ч төхөөрөмжөөс
   *    явж буй нооргийг харна»): ноорог зөвхөн санах ойд байсан тул таб хаах,
   *    багц солиход устаж, хамт ажиллагчид огт харагддаггүй байв. Одоо
   *    `Selbe_Guitsetgel_Draft` хүснэгтийн (`draftRemote.ts`) ТУСДАА мөрөнд
   *    (`plan:<төрөл>:<багц>` — `|`-гүй, `huvaariDraft.ts`-ийн толгой) 1.5 с
   *    завсарлагатай бичигдэж, нээхэд сэргэж, 3 с тутам бусдын нүдтэй нийлнэ.
   *    Цэвэр логик (нүд ↔ Map, нийлүүлэлт, tombstone) — `huvaariDraft.ts`.
   *
   * ⚠️ БИЧИХГҮЙ ҮЕҮҮД (fail-closed): `canEdit` биш · ArcGIS унтраалттай ·
   *    түгжээтэй (`locked`) · урьдчилан харж байгаа (санал нь өөрийн ноорог
   *    БИШ) · батлах явцад (`approving` — `save` Map-уудыг хоослоход «цуцлалт»
   *    гэж андуурч алсын нооргийг устгах байв) · тухайн түлхүүрийн сэргээлт
   *    дуусаагүй (`hdReady` — эс бөгөөс багц/төрөл солих эффектүүд Map-уудыг
   *    хоослоход ШИНЭ түлхүүрийн алсын ноорог «хоосорлоо» гэж устгагдана).
   *
   * ⚠️ ДИФФ нь МЕТА-г хөтөлнө: 5 Map өөрчлөгдөх бүрд нүдийг өмнөхтэй тулгаж,
   *    шинэ/өөрчлөгдсөн нүдэнд «би · одоо», хасагдсанд tombstone тавина.
   *    Бичих боломжгүй үед (урьдчилан харалт г.м.) дифф ХИЙХГҮЙ, дараа нь
   *    эргэж ирэхэд суурийг ДАХИН тавина — эс бөгөөс саналын нүд бүр
   *    «миний нүд» болж, харахаа болиход бүгд tombstone болно.
   *
   * ⚠️ READ-MERGE-WRITE: бичихийн өмнө хямд `at` шалгаж, алс шинэ бол уншиж
   *    нийлүүлээд бичнэ — эс бөгөөс хоёр хүн ээлжлэн бие биенийхээ нүдийг
   *    дардаг. Өөрийн бичилтийн `t`-г `hdLastMerged` болгож, тойрог өөрийгөө
   *    дахин уншихгүй. Гарын үсэг (`sig`) ижил бол бичихгүй.
   */
  type HdStatus = { st: 'idle' | 'saving' | 'saved' | 'err' | 'big'; at?: number; err?: string };
  const [hdSt, setHdSt] = useState<HdStatus>({ st: 'idle' });
  /** Ноорогт нүд бичсэн БУСАД хүмүүс — толгойн «ноорогт: …» */
  const [hdUsers, setHdUsers] = useState<string[]>([]);
  const hdKeyCur = hdKey(kind, pkg.key);
  const hdKeyRef = useRef(hdKeyCur);
  hdKeyRef.current = hdKeyCur;
  const kindRef = useRef(kind);
  kindRef.current = kind;
  const meRef = useRef('');
  meRef.current = (user?.username ?? '').trim().toLowerCase();
  /**
   * Серверийн суурь — `base` (төрлийн муж) + `rows` (уялдаа · бодит · нөөц) + `obPlan`.
   * ⚠️ `months()` нь задаргаа АЧААЛАГДААГҮЙ/УНАСАН (`obState !== 'ok'`) үед
   *    `undefined` = «мэдэгдэхгүй» (тулгахгүй), ачаалагдсан бол задаргаагүй
   *    ажилд ХООСОН Map = «мэдэгдэж буй хоосон». Хоёрыг ялгахгүй бол
   *    ачаалалтын завсарт алсын бүх сарын нүд «хуучирсан» болдог (2026-09-24).
   */
  const hdCtx = useMemo<HDCtx>(() => {
    const m = new Map<number, HDRowBase>();
    const byOid = new Map(rows.map((r) => [r.oid, r]));
    for (const r of base) {
      const sr = byOid.get(r.oid);
      if (!sr) continue;
      m.set(r.oid, { spans: r.spans, ham: sr.ham, aStart: sr.aStart, aEnd: sr.aEnd, hun: sr.hun, mashin: sr.mashin });
    }
    const known = obState === 'ok';
    return {
      n,
      rows: m,
      months: (k) => {
        if (!known) return undefined;
        const cut = k.indexOf('|');
        return obPlan.get(Number(k.slice(0, cut)))?.get(k.slice(cut + 1)) ?? new Map<string, number>();
      },
      monthsRes: (k) => {
        if (!known) return undefined;
        const cut = k.indexOf('|');
        return obRes.get(Number(k.slice(0, cut)))?.get(k.slice(cut + 1)) ?? new Map<string, MonthRes>();
      },
    };
  }, [base, rows, n, obPlan, obRes, obState]);
  const hdCtxRef = useRef(hdCtx);
  hdCtxRef.current = hdCtx;
  const hdMapsRef = useRef({ draft, ham, aDraft, resDraft, obDraft, obRes: obResDraft });
  hdMapsRef.current = { draft, ham, aDraft, resDraft, obDraft, obRes: obResDraft };
  /** Нүд → хэн хэзээ (локал мета) */
  const hdMeta = useRef(new Map<string, { at: number; user: string }>());
  /** Хассан нүд → агшин (tombstone, 7 хоног) */
  const hdDel = useRef(new Map<string, number>());
  /** Сүүлд тулгасан нүдүүд — диффийн суурь ба `hdLocal`-ийн эх */
  const hdPrev = useRef(new Map<string, HDCell>());
  /**
   * ХУУЧИРСАН (`staleKeys`) нүдүүд — Map-д ч, `hdPrev`-д ч ордоггүй атлаа алсад
   * ҮЛДЭХ ёстой (2026-09-24 аудит): `hdLocal` зөвхөн `hdPrev`-ийг бичдэг,
   * `saveRemoteDraft` мөрийг БҮХЛЭЭР нь солидог тул бусдын хуучирсан нүд
   * энэ клиентийн бичилтээр алга болдог байв. Эх `at`/`user`-тайгаа хэвээр
   * (хэзээ ч «миний» биш) буцааж нийлүүлнэ; `hdPrev` давамгайлна.
   */
  const hdStale = useRef(new Map<string, HDEntry>());
  /** Сэргээлт ДУУССАН түлхүүр — үүнээс өөр үед дифф ч, бичилт ч үгүй */
  const hdReady = useRef<string | null>(null);
  /**
   * АЛСЫН `at`-ын СҮҮЛД ХАРСАН УТГА — нийлүүлсэн эсвэл өөрөө бичсэн.
   * ⚠️ `>`-ээр ХАРЬЦУУЛАХГҮЙ (2026-09-24): `at` нь бичигчийн цаг тул цагийн
   *    зөрүүтэй клиент бусдын бичилтийг «хуучин» гэж алгасаж дарж бичдэг
   *    байв. Одоо `at0 !== hdLastSeenAt` бол ЯМАР Ч тохиолдолд дахин уншина;
   *    өөрийн бичилтийн дараа бичсэн `t`-г тавина (сервер яг тэр утгыг
   *    хадгалдаг) — өөр хэн нэг завсарт бичсэн бол утга зөрж, дахин уншина.
   */
  const hdLastSig = useRef('');
  const hdBusy = useRef(false);
  const hdAgain = useRef(false);
  const hdBaseAt = useRef(0);
  /**
   * МӨР · ЗАДАРГАА СЕРВЕРЭЭС ИРСЭН АГШИН (2026-09-25 аудит) — хуучирсан нүдийг
   * устгаж болох эсэхийг шийднэ (`hdApply`). `hdBaseAt` нь сэргээлт эхэлсэн
   * агшин тул түгжээ тайлагдсаны дараах сэргээлтэд мөр нь үүнээс хуучин байж болно.
   */
  const hdRowsAt = useRef(0);
  const hdObAt = useRef(0);
  useEffect(() => { hdRowsAt.current = rows.length ? Date.now() : 0; }, [rows]);
  useEffect(() => { hdObAt.current = obState === 'ok' ? Date.now() : 0; }, [obPlan, obRes, obState]);
  const hdPrevW = useRef(false);
  /**
   * ⚠️ `pending`-ЭЭР, `locked`-ООР БИШ (2026-09-24): `locked` нь батлах явцад
   *    (`approving`) түр тайлагддаг тул «түгжээ тайлагдав» зам `save()` явж
   *    байхад Map-уудыг хоослож, батлалт «эх хуудсанд бичигдсэнгүй» гэж унадаг байв.
   */
  const hdPending = pending != null;
  const hdPrevPending = useRef(hdPending);
  /** Сэргээлт/нийлүүлэлт хориотой — илгээлт хүлээгдэж, батлагдаж эсвэл урьдчилан харагдаж байхад */
  const hdBlocked = hdPending || approving != null || previewing;
  /** Экспоненциал дахин оролдлого: 3 → 6 → 12 → … → 60 с; амжилт/шинэ дифф тэглэнэ */
  const hdBackoff = useRef(3000);
  const hdWritable = canEdit && status !== 'off' && !locked && !previewing && approving == null;
  const hdWritableRef = useRef(hdWritable);
  hdWritableRef.current = hdWritable;
  /** Уншиж нийлүүлж болох уу — засах эрхгүй ч харж болно; түгжээ/харалт/батлалтад үгүй */
  const hdPollOk = !hdBlocked;
  const hdPollOkRef = useRef(hdPollOk);
  hdPollOkRef.current = hdPollOk;
  const obStateRef = useRef(obState);
  obStateRef.current = obState;

  const hdSchedule = useCallback((ms: number) => {
    if (hdTimer.current) clearTimeout(hdTimer.current);
    hdTimer.current = setTimeout(() => { hdTimer.current = null; void hdFlushRef.current(); }, ms);
  }, []);
  /** Алдааны дараах дахин оролдлого — backoff-той */
  const hdRetry = useCallback(() => {
    hdSchedule(hdBackoff.current);
    hdBackoff.current = Math.min(60_000, hdBackoff.current * 2);
  }, [hdSchedule]);

  /**
   * Одоогийн нүдүүд (`hdPrev`) + мета → ноорог.
   * ⚠️ Метагүй нүдийн «одоо»-г МЕТА-д ХАДГАЛНА (2026-09-24) — урьд нь дуудлага
   *    бүрд шинэ `at` авдаг тул түгжээтэй үед орсон нүд (татсан илгээлт г.м.)
   *    үргэлж «дөнгөж бичигдсэн» болж бусдын шинэ нүдийг ч дарах байв.
   */
  const hdLocal = useCallback((): HDDraft => {
    const now = Date.now();
    const entries: HDEntries = new Map();
    /* Хуучирсан нүд — эх мета-тайгаа; доорх `hdPrev` ижил түлхүүрт дарна */
    for (const [k, e] of hdStale.current) entries.set(k, { val: e.val, bv: e.bv, at: e.at, user: e.user });
    for (const [k, c] of hdPrev.current) {
      let m = hdMeta.current.get(k);
      if (!m) { m = { at: now, user: meRef.current }; hdMeta.current.set(k, m); }
      entries.set(k, { val: c.val, bv: c.bv, at: m.at, user: m.user });
    }
    return {
      t: now, kind: kindRef.current, pkg: pkgKeyRef.current, by: { user: meRef.current, at: now },
      entries, del: new Map(hdDel.current), base: { at: hdBaseAt.current, n: hdCtxRef.current.n },
    };
  }, []);

  /**
   * Нооргийг 5 Map болгож state-д тавина; мета · tombstone · дифф-суурийг
   * ЗЭРЭГ шинэчилнэ — дараагийн дифф «өөрчлөлтгүй» гэж үзнэ.
   * ⚠️ Tombstone ЗӨВХӨН «серверийнхтэй ижил болсон» нүдэнд (2026-09-24).
   *    ХУУЧИРСАН (`staleKeys`) нүдэнд ТАВИХГҮЙ: хуучин суурьтай клиент бусдын
   *    хүчинтэй нүдийг бүгдэд нь устгадаг байв. Хуучирсан нүд зөвхөн энд
   *    орохгүй — алсад хэвээр, мөрөө шинэчилсэн клиент шийднэ.
   */
  const hdApply = useCallback((d: HDDraft): HDApply => {
    const ap = cellsToMaps(d.entries, hdCtxRef.current);
    const now = Date.now();
    const dropped = new Set(ap.dropped);
    const stale = new Set(ap.staleKeys);
    const meta = new Map<string, { at: number; user: string }>();
    for (const [k, e] of d.entries) if (!dropped.has(k)) meta.set(k, { at: e.at, user: e.user });
    const del = new Map(d.del);
    for (const k of dropped) if (!stale.has(k)) del.set(k, now);
    /*
     * ⚠️ МАШ ХУУЧИН «ХУУЧИРСАН» НҮДИЙГ УСТГАНА (2026-09-25 аудит). Дээрх дүрэм
     *    (хуучирсныг мөрөө шинэчилсэн клиент шийднэ) хэрэгжих зам БАЙГААГҮЙ: мөр нь
     *    шинэ клиент ч түүнийг `hdStale`-д хадгалж `hdLocal`-аар дахин бичдэг тул
     *    FillNew нийтлэл (бүх OID солигдоно) бүрийн дараа нүд мөнхөд амилж, «ноорогт:
     *    …» сүнс зохиогч харуулж, ачаалал `REMOTE_MAX` руу өсдөг байв.
     *    ШИЙДЭХ ЭРХ = ЭНЭ клиентийн суурь нүднээс ШИНЭ: нүд нь манай мөр (`s/h/a/r`)
     *    эсвэл задаргаа (`m/n`) серверээс ирэхээс `MARGIN`-аас өмнө бичигдсэн бол
     *    бичигчийн суурь манайхаас хуучин нь гарцаагүй → tombstone. Шинэ нүд (манай
     *    суурь хуучин байж болох) хэвээр — 2026-09-24-ний хамгаалалт хадгалагдана.
     *    Цагийн зөрүүнд `MARGIN` (10 мин). Бичих эрхгүй бол хөндөхгүй.
     */
    /*
     * ⚠️ 2026-09-25 аудит: «мөр алга» (шинэ жааз — бүх OID солигдсон) нүд БУСДЫН
     *    бол tombstone ХИЙХГҮЙ: хуучин жаазтай, хуудсаа шинэчлээгүй хамтрагчийн
     *    хүчинтэй ажлыг устгадаг байв. Tombstone зөвхөн (а) МИНИЙ нүд — би шинэ
     *    жаазад шилжсэн тул хуучин oid-той нүд маань гарцаагүй хуучирсан, эсвэл
     *    (б) `bv` ЗӨРСӨН нүд — мөр байгаа ч сервер бичигчийн суурийг өөрчилсөн.
     *    Бусдын «мөр алга» нүдийг эзэн нь өөрөө шинэчлэхдээ (а)-аар цэвэрлэнэ.
     */
    const bvStale = new Set(ap.bvKeys);
    const MARGIN = 10 * 60_000;
    let tomb = 0;
    const st = new Map<string, HDEntry>();
    for (const k of stale) {
      const e = d.entries.get(k);
      if (!e) continue;
      const fresh = k[0] === 'm' || k[0] === 'n' ? hdObAt.current : hdRowsAt.current;
      const mayKill = e.user === meRef.current || bvStale.has(k);
      if (mayKill && hdWritableRef.current && fresh > 0 && e.at < fresh - MARGIN) { del.set(k, now); tomb += 1; continue; }
      st.set(k, e);
    }
    hdMeta.current = meta;
    hdDel.current = del;
    hdStale.current = st;
    hdPrev.current = mapsToCells(ap.maps, hdCtxRef.current);
    setDraft(ap.maps.draft); setHam(ap.maps.ham); setADraft(ap.maps.aDraft);
    setResDraft(ap.maps.resDraft); setObDraft(ap.maps.obDraft); setObResDraft(ap.maps.obRes);
    setHdUsers(hdUsersOf(d).filter((u) => u !== meRef.current));
    /* Устгасан хуучирсан нүдийг алсад хүргэнэ — дуудагчийн товлолтоос үл хамааран */
    if (tomb) hdSchedule(1500);
    return ap;
  }, [hdSchedule]);

  /**
   * ЦЭВЭРЛЭЛТ — илгээсэн · цуцалсан · хоосорсон. Мөрийг УСТГАХГҮЙ: хоосон
   * ноорог + бүх нүдний tombstone + `cleared` агшныг бичнэ (2026-09-24).
   * ⚠️ `clearRemoteDraft`-аар устгавал tombstone ч устаж, өөр төхөөрөмжийн
   *    localStorage хуулбар илгээгдсэн нооргийг дахин амилуулдаг байв.
   *    Локал хуулбарт ч ижил хоосон ноорог бичнэ (`t < cleared` дүрэм).
   */
  const hdClear = useCallback(async (key: string, extraKeys: Iterable<string> = []) => {
    if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; }
    hdGen.current += 1;
    const now = Date.now();
    const del = new Map(hdDel.current);
    for (const k of hdPrev.current.keys()) del.set(k, now);
    for (const k of extraKeys) del.set(k, now);
    hdLastSig.current = '';
    hdMeta.current = new Map(); hdDel.current = del; hdPrev.current = new Map(); hdStale.current = new Map();
    const d: HDDraft = {
      t: now, kind: kindRef.current, pkg: pkgKeyRef.current, by: { user: meRef.current, at: now },
      entries: new Map(), del, base: { at: hdBaseAt.current, n: hdCtxRef.current.n }, cleared: now,
    };
    const body = hdSerialize(d);
    try { localStorage.setItem(hdLocalKey(key), body); } catch { /* хаалттай орчин */ }
    setHdSt({ st: 'idle' }); setHdUsers([]);
    if (status === 'off') return;
    const r = await saveRemoteDraft(key, now, body);
    if (key !== hdKeyRef.current) return;
    if (r.ok) { hdLastSeenAt.current = now; hdLastSig.current = hdSig(d); } else {
      setHdSt({ st: 'err', err: tr('алсын ноорог цэвэрлэгдсэнгүй — {0}', r.error) });
    }
  }, [status]);

  /**
   * Хадгалалтын үндсэн зам — read-merge-write, дараа нь `sig` ижил бол алгасна.
   * ⚠️ Локалыг НИЙЛҮҮЛЭХИЙН ӨМНӨ дахин уншина (2026-09-24): уншилтын завсарт
   *    хийсэн засвар урьд нь `hdApply(merged)`-ээр дэлгэцээс арилж, алсад ч
   *    очдоггүй байв.
   * ⚠️ Хоосорсон ноорог ЭНД л цэвэрлэгдэнэ — алсыг нийлүүлсний ДАРАА: дифф
   *    шууд устгавал сүүлийн 3 с-д бусдын нэмсэн нүд алдагдана.
   */
  const hdFlush = useCallback(async () => {
    if (hdBusy.current) { hdAgain.current = true; return; }
    const key = hdKeyRef.current;
    if (hdReady.current !== key || !hdWritableRef.current) return;
    const live = () => key === hdKeyRef.current && hdReady.current === key;
    hdBusy.current = true;
    try {
      const at0 = await readRemoteDraftAt(key);
      if (!live()) return;
      if (at0 === undefined) {
        setHdSt({ st: 'err', err: tr('алсын ноорогийг шалгаж чадсангүй') });
        hdRetry();
        return;
      }
      if ((at0 ?? 0) !== hdLastSeenAt.current) {
        const rr = await readRemoteDraft(key);
        if (!live()) return;
        if (!rr.ok) { setHdSt({ st: 'err', err: rr.error }); hdRetry(); return; }
        const local0 = hdLocal();
        const merged = hdMerge(rr.draft ? hdParse(rr.draft.payload) : null, local0) ?? local0;
        hdApply(merged);
        hdLastSeenAt.current = at0 ?? 0;
      }
      const local = hdLocal();
      /* Хоосон — цэвэрлэлт (нэг удаа: tombstone-ууд аль хэдийн бичигдсэн бол алгасна) */
      if (hdIsEmpty(local)) { if (hdSig(local) !== hdLastSig.current) await hdClear(key); return; }
      const body = hdSerialize(local);
      const s = hdSig(local);
      /* ⚠️ Локал хуулбар БҮХ оролдлогод — алс унасан ч энэ компьютерт үлдэнэ */
      try { localStorage.setItem(hdLocalKey(key), body); } catch { /* хаалттай орчин */ }
      if (s === hdLastSig.current) return;
      if (body.length > REMOTE_MAX) { setHdSt({ st: 'big' }); return; }
      setHdSt({ st: 'saving' });
      const gen = hdGen.current;
      const r = await saveRemoteDraft(key, local.t, body);
      /* ⚠️ Бичилт явж байхад цэвэрлэсэн/түлхүүр солигдсон бол (2026-09-24) энэ
         бичилт хаясан нооргийг амилуулсан — тэр даруй дахин цэвэрлэнэ. */
      if (r.ok && gen !== hdGen.current) {
        const t2 = Date.now();
        const del = new Map<string, number>();
        for (const k of local.entries.keys()) del.set(k, t2);
        for (const [k, a] of local.del) del.set(k, a);
        void saveRemoteDraft(key, t2, hdSerialize({ ...local, t: t2, entries: new Map(), del, cleared: t2 }));
        return;
      }
      if (!live()) return;
      if (r.ok) {
        hdLastSig.current = s;
        /* ⚠️ Бичсэн `t`-г тавина — сервер яг тэр утгыг хадгалдаг; завсарт өөр
           хүн бичсэн бол `at0` зөрж дараагийн шалгалтад дахин уншина */
        hdLastSeenAt.current = local.t;
        hdBackoff.current = 3000;
        setHdSt({ st: 'saved', at: local.t });
      } else {
        setHdSt({ st: 'err', err: r.error });
        hdRetry();
      }
    } finally {
      hdBusy.current = false;
      if (hdAgain.current) { hdAgain.current = false; hdSchedule(300); }
    }
  }, [hdLocal, hdApply, hdClear, hdSchedule, hdRetry]);
  hdFlushRef.current = hdFlush;
  hdClearRef.current = hdClear;

  /**
   * СЭРГЭЭЛТ — багц/төрөл солигдоход (мөр · задаргаа ачаалагдаж, урсгал
   * мэдэгдсэний дараа). Алс → эс бөгөөс локал хуулбар; уншилтын завсарт хийсэн
   * засвар (Map-д байгаа) нийлнэ. Түгжээтэй бол хойшилно (`locked` deps).
   * ⚠️ ТҮГЖЭЭ ТАЙЛАГДАХАД (батлагдсан/буцаагдсан) ДАХИН СЭРГЭЭНЭ (2026-09-24):
   *    урьд нь `hdReady === key` тул алгасаж, илгээхээс өмнөх хуучин нүд шинэ
   *    хуваалцсан ноорог болж бичигддэг байв. Map · мета бүгд хаягдана.
   */
  useEffect(() => {
    const key = hdKeyCur;
    const wasPending = hdPrevPending.current;
    hdPrevPending.current = hdPending;
    if (wasPending && !hdPending && hdReady.current === key) {
      if (hdSkipUnlockOnce.current) {
        /* `withdraw` — буулгасан агуулгыг хадгална; мета-г дифф тавина */
        hdSkipUnlockOnce.current = false;
      } else {
        hdReady.current = null;
        setDraft(new Map()); setHam(new Map()); setADraft(new Map()); setResDraft(new Map()); setObDraft(new Map()); setObResDraft(new Map());
      }
    }
    if (hdReady.current === key) return undefined;
    /* ⚠️ `null` (хуучин түлхүүр БИШ): b32→b33→b32 хурдан солиход хуучин утга
       «бэлэн» гэж уншигдаж сэргээлт алгасагддаг байв (2026-09-24). */
    hdReady.current = null;
    hdMeta.current = new Map(); hdDel.current = new Map(); hdPrev.current = new Map(); hdStale.current = new Map();
    hdLastSeenAt.current = 0; hdLastSig.current = ''; hdAgain.current = false; hdBackoff.current = 3000;
    hdGen.current += 1;
    hdSkipUnlockOnce.current = false;
    if (hdTimer.current) { clearTimeout(hdTimer.current); hdTimer.current = null; }
    setHdSt({ st: 'idle' }); setHdUsers([]);
    /* ⚠️ Батлах явцад · урьдчилан харахад · илгээлт хүлээгдэж байхад ЭХЛЭХГҮЙ */
    if (!sc || !rows.length || obState === 'loading' || flowReady === null || hdBlocked) return undefined;
    hdBaseAt.current = Date.now();
    let alive = true;
    void (async () => {
      let remote: HDDraft | null = null;
      let readErr = '';
      let fromLocal = false;
      if (status !== 'off') {
        const rr = await readRemoteDraft(key);
        if (!alive) return;
        if (rr.ok) {
          remote = rr.draft ? hdParse(rr.draft.payload) : null;
          if (rr.draft) hdLastSeenAt.current = rr.draft.at;
        } else readErr = rr.error;
      }
      /* ⚠️ Локал хуулбарыг ҮРГЭЛЖ нийлүүлнэ (2026-09-24) — урьд нь зөвхөн алс
         хоосон үед; алсад ямар нэг ноорог байхад оффлайн засвар алдагддаг байв.
         Цэвэрлэлтээс (`cleared`) хуучин хуулбар ҮГҮЙ. */
      try {
        const l = hdParse(localStorage.getItem(hdLocalKey(key)));
        const clearedAt = Math.max(remote?.cleared ?? 0, l?.cleared ?? 0);
        if (l && !hdIsEmpty(l) && l.t >= clearedAt) {
          remote = remote ? hdMerge(remote, l) : l;
          fromLocal = true;
        }
      } catch { /* хаалттай орчин */ }
      /* Уншилтын завсарт хийсэн засвар — «би · одоо» гэж нийлнэ */
      const cells = mapsToCells(hdMapsRef.current, hdCtxRef.current);
      const now = Date.now();
      const localD: HDDraft | null = cells.size ? {
        t: now, kind: kindRef.current, pkg: pkgKeyRef.current, by: { user: meRef.current, at: now },
        entries: new Map([...cells].map(([k, c]) => [k, { ...c, at: now, user: meRef.current }])),
        del: new Map(), base: { at: hdBaseAt.current, n: hdCtxRef.current.n },
      } : null;
      const merged = hdMerge(remote, localD);
      hdReady.current = key;
      hdPrevW.current = hdWritableRef.current;
      if (readErr && !fromLocal) setHdSt({ st: 'err', err: readErr });
      if (!merged || hdIsEmpty(merged)) return;
      const ap = hdApply(merged);
      const parts: string[] = [];
      if (ap.applied) parts.push(tr('Ноорог сэргээв: {0} мөр', num(ap.rows)));
      if (ap.stale) parts.push(tr('{0} мөр хуучирсан тул хасав', num(ap.stale)));
      if (fromLocal && readErr) parts.push(tr('алсын ноорог уншигдсангүй — энэ компьютерийн хуулбар'));
      if (parts.length) setNote(parts.join(' · '));
      /* Локалоос сэргэсэн эсвэл ижил болсон нүд арилгах бол алсыг шинэчилнэ */
      /* ⚠️ Уншилтын завсрын засвар (`localD`, ж: татсан илгээлт) ч алсад очих ёстой */
      if ((fromLocal || localD || ap.dropped.length > ap.staleKeys.length) && hdWritableRef.current) hdSchedule(1500);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hdKeyCur, sc, rows.length > 0, obState, flowReady, hdBlocked, hdPending, status]);

  /**
   * ДИФФ — 5 Map өөрчлөгдөх бүрд мета/tombstone хөтөлж, 1.5 с дараа бичнэ.
   * ⚠️ Задаргаа ачаалагдаж байхад (`obState === 'loading'` — багц солих,
   *    `refetchServer`-ийн завсрын зурагдалт) ОГТ ажиллахгүй: суурь дутуу тул
   *    сарын нүд «алга болж» tombstone авах байв (2026-09-24).
   * ⚠️ Ноорог ХООСОРВОЛ шууд устгахгүй — `hdFlush` алсыг нийлүүлээд шийднэ.
   */
  useEffect(() => {
    const key = hdKeyCur;
    if (hdReady.current !== key || obState === 'loading') return;
    const cur = mapsToCells({ draft, ham, aDraft, resDraft, obDraft, obRes: obResDraft }, hdCtx);
    const wasW = hdPrevW.current;
    hdPrevW.current = hdWritable;
    const now = Date.now();
    /* ⚠️ Бичих боломжгүй үед (эсвэл дөнгөж боломжтой болоход) зөвхөн СУУРИЙГ
       тавина — саналын нүдэнд tombstone тавихгүй; метагүй шинэ нүдэнд «би ·
       одоо»-г нэг удаа тавина (`at` тогтвортой байхын тулд, 2026-09-24). */
    if (!hdWritable || !wasW) {
      for (const k of cur.keys()) if (!hdMeta.current.has(k)) hdMeta.current.set(k, { at: now, user: meRef.current });
      hdPrev.current = cur;
      return;
    }
    const prev = hdPrev.current;
    let changed = false;
    for (const [k, c] of cur) {
      const p = prev.get(k);
      if (!p || !sameVal(p.val, c.val)) {
        hdMeta.current.set(k, { at: now, user: meRef.current });
        hdDel.current.delete(k);
        changed = true;
      }
    }
    for (const k of prev.keys()) {
      if (!cur.has(k)) { hdMeta.current.delete(k); hdDel.current.set(k, now); changed = true; }
    }
    hdPrev.current = cur;
    if (!changed) return;
    hdBackoff.current = 3000;
    hdSchedule(!cur.size && prev.size ? 300 : 1500);
  }, [draft, ham, aDraft, resDraft, obDraft, obResDraft, hdCtx, hdKeyCur, hdWritable, obState, hdSchedule]);

  /**
   * МӨЧЛӨГ — 3 с тутам (таб харагдаж байхад) алсын `at`-ыг хямдаар шалгаж,
   * өөр бол уншиж нийлүүлнэ. Мэдэгдэлгүй — зөвхөн толгойн «ноорогт: …».
   * ⚠️ Нийлүүлсний дараа гарын үсэг өөрчлөгдсөн бол (өөрийн нүд алсад дутуу)
   *    бичилт товлоно — `sig` эрэмбэ/`by`-аас хамаардаггүй тул тойрог үүсэхгүй.
   * ⚠️ Таб нуугдах / хуудас хаагдахад хүлээгдэж буй бичилтийг ШУУД гүйцэтгэнэ
   *    (`FillNew`-тэй ижил) — 1.5 с завсарлага таб хаахад алдагдахгүй.
   */
  useEffect(() => {
    if (status === 'off') return undefined;
    const tick = async () => {
      const key = hdKeyRef.current;
      if (document.hidden || hdBusy.current || hdReady.current !== key || !hdPollOkRef.current) return;
      /* ⚠️ Мөргүй/задаргаагүй суурьтай (багц солигдож, мөр шинэчлэгдэж байгаа)
         тулгавал нүд хуучирна эсвэл суурьгүй орно */
      if (hdCtxRef.current.rows.size === 0 || obStateRef.current === 'loading') return;
      hdBusy.current = true;
      try {
        const at0 = await readRemoteDraftAt(key);
        /* ⚠️ `await` бүрийн дараа ДАХИН шалгана (2026-09-24 аудит): уншилтын завсарт
           батлалт/урьдчилан харалт эхэлсэн бол `hdApply` Map-уудыг дарж, харж
           буй санал эсвэл бичигдэж буй ноорог солигддог байв. */
        if (!hdPollOkRef.current) return;
        if (at0 === undefined || (at0 ?? 0) === hdLastSeenAt.current || key !== hdKeyRef.current) return;
        const rr = await readRemoteDraft(key);
        if (!hdPollOkRef.current) return;
        if (key !== hdKeyRef.current || hdReady.current !== key || !rr.ok) return;
        const merged = hdMerge(rr.draft ? hdParse(rr.draft.payload) : null, hdLocal());
        hdLastSeenAt.current = at0 ?? 0;
        if (!merged) return;
        hdApply(merged);
        if (hdWritableRef.current && hdSig(merged) !== hdLastSig.current) hdAgain.current = true;
      } finally {
        hdBusy.current = false;
        if (hdAgain.current) { hdAgain.current = false; hdSchedule(1500); }
      }
    };
    const id = setInterval(() => { void tick(); }, 3000);
    /* ⚠️ Таб хаагдахад урьдчилсан уншилт (`readRemoteDraftAt`) дуусдаггүй тул
       (2026-09-24) ЭХЛЭЭД локал хуулбарыг синхрон бичиж, дараа нь алсад
       уншилтгүйгээр ШУУД бичнэ — «best effort». */
    const flushNow = () => {
      if (!hdTimer.current) return;
      clearTimeout(hdTimer.current); hdTimer.current = null;
      const key = hdKeyRef.current;
      if (hdReady.current !== key || !hdWritableRef.current) return;
      const local = hdLocal();
      if (hdIsEmpty(local)) { void hdFlushRef.current(); return; }
      const body = hdSerialize(local);
      try { localStorage.setItem(hdLocalKey(key), body); } catch { /* хаалттай орчин */ }
      if (body.length > REMOTE_MAX || hdSig(local) === hdLastSig.current) return;
      const gen = hdGen.current;
      void saveRemoteDraft(key, local.t, body).then((r) => {
        if (r.ok && gen === hdGen.current && key === hdKeyRef.current) {
          hdLastSig.current = hdSig(local); hdLastSeenAt.current = local.t;
        }
      });
    };
    const vis = () => { if (document.hidden) flushNow(); else void tick(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', flushNow);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('pagehide', flushNow);
    };
  }, [status, hdLocal, hdApply, hdSchedule]);

  /** Хадгалалтын төлөвийн богино текст — толгойд */
  const hdLabel = hdSt.st === 'saving' ? tr('Ноорог хадгалж байна…')
    : hdSt.st === 'saved' ? tr('Ноорог хадгалагдсан {0}', (() => {
      const d = new Date(hdSt.at ?? 0);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    })())
      : hdSt.st === 'big' ? tr('ноорог хэт том — зөвхөн энэ компьютерт')
        : hdSt.st === 'err' ? tr('Ноорог алсад хадгалагдсангүй — {0}', hdSt.err ?? '')
          : '';

  /**
   * БАГЦ/ТӨРӨЛ СОЛИХ зөвшөөрөл асууна.
   *
   * ⚠️ УРЬДЧИЛАН ХАРЖ БАЙХАД ТУСДАА АСУУЛТ (2026-09-11-ний аудитын S1).
   *    Урьд нь `previewing` үед ШУУД `true` буцаадаг байв — «ноорог нь
   *    батлагчийнх тул хаяхад эвгүй зүйлгүй» гэсэн үндэслэлээр. Гэвч солих
   *    нь урьдчилан харалтыг ТАСАЛДАГ: батлагч юу харж байснаа алдаж,
   *    илгээлт хүлээгдсэн хэвээр үлдэнэ. Тиймээс чимээгүй зөвшөөрөхгүй.
   * ⚠️ Хоёр тохиолдолд ӨӨР асуулт: урьдчилан харалт нь өгөгдөл алдахгүй
   *    (сервер дээр хэвээр), ноорог нь АЛДАГДАНА.
   */
  const askSwitch = useCallback(
    () => {
      if (previewing) {
        return window.confirm(tr('Батлах урьдчилан харалт хаагдана. Илгээлт хүлээгдсэн хэвээр үлдэнэ. Үргэлжлүүлэх үү?'));
      }
      if (dirtyN === 0) return true;
      const ok = window.confirm(tr('Хадгалаагүй {0} өөрчлөлт байна. Хаяад солих уу? Хуваалцсан ноорог бүх оролцогчид устна.', num(dirtyN)));
      /* ⚠️ Хаяхыг зөвшөөрвөл ХУВААЛЦСАН нооргийг ч цэвэрлэнэ (2026-09-23) — эс
         бөгөөс буцаж ирэхэд «хаясан» ноорог алсаас дахин сэргэнэ.
         ⚠️ ЗӨВХӨН бичих эрхтэй үед (2026-09-24): зөвхөн харагч ч ноорогийг
            дэлгэцэндээ авдаг тул түүнгүйгээр бусдын ажлыг устгах байв. */
      if (ok && hdWritableRef.current) void hdClear(hdKeyRef.current);
      return ok;
    },
    [dirtyN, previewing, hdClear],
  );

  const floors = pkgFloors(pkg.group);

  /* ── Хуанлийн шошго ── */
  const ticks: { at: number; lab: string; big: boolean }[] = [];
  const months: { at: number; lab: string }[] = [];
  for (let k = 0; k < total; k++) {
    const ms = from + k * DAY;
    const d = new Date(ms);
    const isFirst = d.getUTCDate() === 1;
    if (isFirst) months.push({ at: ms, lab: msToDay(ms).slice(0, 7) });
    /* ⚠️ Ганц тоо («21», «28») нь ямар сарынх нь тодорхойгүй. Сарын нэр
       ДЭЭД мөрөнд тусдаа, хоногийн шошго нь «сар-өдөр» хэлбэрээр доор. */
    if (zoom === 'day') ticks.push({ at: ms, lab: String(d.getUTCDate()), big: isFirst });
    else if (zoom === 'week') {
      if (d.getUTCDay() === 1 || isFirst) ticks.push({ at: ms, lab: msToDay(ms).slice(5), big: isFirst });
    } else if (d.getUTCDay() === 1 || isFirst) ticks.push({ at: ms, lab: '', big: isFirst });
  }
  /**
   * ⚠️ ОЙРХОН ШОШГЫГ ХООСЛОНО. Сарын 1 ба долоо хоногийн эхлэл 1–2 хоногийн
   * зайд таарвал «08-31» ба «09-01» хоёр бие бие рүүгээ орж, аль аль нь
   * уншигдахгүй болно (зурвас нарийсах тусам байнга тохиолдоно). Зураас нь
   * үлдэнэ — зөвхөн ТЕКСТИЙГ нь авна.
   */
  {
    const MIN = 40;
    let lastLab = -Infinity;
    for (const tk of ticks) {
      const x = ((tk.at - from) / DAY) * px;
      if (!tk.lab) continue;
      if (x - lastLab < MIN && !tk.big) tk.lab = '';
      else lastLab = x;
    }
  }

  /**
   * ⚠️ БҮЛГИЙН МӨРИЙГ БОДОГДСОН мужаар нь өгнө (2026-09-06). Цонх нь
   *    «Эхлэх/Дуусах» талбар ба «Бүлгийн муж» мөрөндөө `spans`-ыг шууд
   *    уншдаг тул хадгалагдсан ХУУЧИН огноог үзүүлбэл зурвас ба цонх хоёр
   *    өөр тоо хэлнэ. Бичихгүй — бүлэгт огноо засах хаалттай.
   */
  const effRow = useCallback((r: PlanRow): PlanRow => (
    /* ⚠️ Бодит огноо · нөөц ч хүүхдээс (2026-09-23, `aggExtra`) — бичигдэхгүй. */
    r.group ? { ...r, spans: r.spans.map((_, b) => effSpan(plan, r.i, b)), ...aggExtra(plan, r.i, n) } : r
  ), [plan, n]);

  /** Холбох цонхны хоёр мөр — OID-оор (2026-09-25); аль нэг нь алга бол цонх гарахгүй */
  const linkRows = useMemo(() => {
    if (!linkAsk) return null;
    const s = plan.find((x) => x.oid === linkAsk.so);
    const t = plan.find((x) => x.oid === linkAsk.to);
    return s && t ? { s, t } : null;
  }, [linkAsk, plan]);
  const modalRow = useMemo(() => {
    if (modal == null) return null;
    const r = plan.find((x) => x.oid === modal);
    return r ? effRow(r) : null;
  }, [modal, plan, effRow]);
  /**
   * Popup-д зориулсан ЭЦЭГ БҮЛЭГ — хамгийн ойрын ДЭЭД бүлгийн мөр.
   *
   * ⚠️ Чирэлт нь `commit`-доо мужийг эцэгт нь ХАВЧУУЛДАГ байсан ч popup нь
   *    ШУУД бичдэг байв (2026-09-01-нд хэрэглэгч мэдэгдсэн: «том бүлэгт
   *    тавьсан хугацаанаас хамаарахгүй байна»). Нэг ажлыг хоёр өөр замаар
   *    оруулахад ӨӨР ӨӨР дүрэм үйлчлэх нь эвдрэл — одоо хоёулаа ижил.
   */
  const modalPar = useMemo(() => {
    if (!modalRow) return null;
    const at = plan.findIndex((x) => x.i === modalRow.i);
    for (let k = at - 1; k >= 0; k--) {
      if (plan[k].depth < modalRow.depth && plan[k].group) return effRow(plan[k]);
    }
    return null;
  }, [plan, modalRow, effRow]);

  /**
   * УРЬДЧИЛАГЧИЙН НЭР ДЭВШИГЧИД — кодтой бүх мөр, ХАСАХ нь: (1) өөрөө,
   * (2) энэ ажлаас дам хамаардаг бүх ажил — тэднийг сонговол дугуй хамаарал
   * үүснэ. Урьдчилан шүүснээр хэрэглэгч буруу сонголт хийх БОЛОМЖГҮЙ.
   */
  const depCands = useMemo(() => {
    if (!modalRow) return [];
    const blocked = modalRow.des != null
      ? downstreamCodes(plan, modalRow.des)
      : new Set<number>();
    const out: { code: number; label: string }[] = [];
    for (const r of plan) {
      /* ⚠️ hierRelated нь өөрийг нь БА өвөг/удам бүлгийг хоёуланг таслана —
         тэднээс «хамаарвал» бүлгийн муж өөрөөсөө бодогдож гинжин эргэлт үүснэ */
      if (r.des == null || blocked.has(r.des) || hierRelated(plan, modalRow.i, r.i)) continue;
      out.push({
        code: r.des,
        label: `${r.des} · ${'· '.repeat(r.depth)}${r.work || r.no}`,
      });
    }
    return out;
  }, [plan, modalRow]);

  /* ── УЯЛДААНЫ СУМУУД — идэвхтэй блок дээр, харагдаж буй мөрүүдийн хооронд ──
     ⚠️ Memo БИШ: `visible`, `sel`, `blk`, `xOf` дөрвүүл байнга хөдөлдөг тул
     кэш бараг онохгүй; тооцоо нь уялдаатай мөрийн тоогоор шугаман — хямд. */
  const arrows: { d: string; cls: string; mk: string; key: string; si: number; ti: number; dblk: number | null }[] = [];
  /* ⚠️ (2026-09-23) Сум ЗӨВХӨН төлөвлөгөө табд — уялдаа гэрээнд хамаарахгүй
     (`startLink`-ийн ижил дүрэм), гэрээ табд сум/зөрчил зурвал төөрөгдүүлнэ. */
  if (kind === 'plan') {
    const visK = new Map<number, number>();
    visible.forEach((r, k) => visK.set(r.i, k));
    for (let k = 0; k < visible.length; k++) {
      const r = visible[k];
      if (!r.deps.length) continue;
      const ts = effSpan(plan, r.i, blk);
      if (!ts) continue;
      const ty = k * PL_ROW + PL_ROW / 2;
      const tx = xOf(ts.start);
      r.deps.forEach((dep, j) => {
        /* ⚠️ Зөвхөн ИДЭВХТЭЙ блокийн (эсвэл блокгүй) уялдааны сум (2026-09-24) */
        if (dep.blk != null && dep.blk !== blk) return;
        const pi = byCode.get(dep.code);
        if (pi == null || pi === r.i) return;
        const pk = visK.get(pi);
        if (pk == null) return;
        const ps = effSpan(plan, pi, blk);
        if (!ps) return;
        const sy = pk * PL_ROW + PL_ROW / 2;
        let d: string;
        if (dep.type === 'FS') {
          /* Урд ажлын БАРУУН захаас гарч хамаарагчийн ЗҮҮН зах руу — ортогональ.
             Хамаарагч нь урд ажлаасаа ЗҮҮНД байвал (зөрчил/сөрөг хоцролт)
             буцах замаар тойруулна, эс бөгөөс сум зурвасын дундуур шургана. */
          const sx = xOf(ps.end + DAY);
          d = tx >= sx + 10
            ? `M ${sx} ${sy} h 6 V ${ty} H ${tx}`
            : `M ${sx} ${sy} h 8 v ${ty > sy ? 12 : -12} H ${tx - 8} V ${ty} H ${tx}`;
        } else {
          /* SS: хоёулангийн ЗҮҮН захыг холбоно */
          const sx = xOf(ps.start);
          d = `M ${sx} ${sy} H ${Math.min(sx, tx) - 8} V ${ty} H ${tx}`;
        }
        /* ⚠️ ЗӨРЧИЛ = хамаарагч шаардлагаас ӨМНӨ эхэлсэн. ХОЖУУ эхлэх нь
           зөрчил БИШ — хэрэглэгч санаатай хойшлуулсан байж болно (дүрэм биш,
           чадвар). Зөрчлийг ХОРИГЛОХГҮЙ, зөвхөн улаанаар тэмдэглэнэ. */
        const need = dep.type === 'FS' ? ps.end + (1 + dep.lag) * DAY : ps.start + dep.lag * DAY;
        const viol = ts.start < need;
        const hot = sel === r.oid || sel === plan[pi]?.oid;
        /* ⚠️ Хошууны marker нь шугамын `stroke`-оос өнгө АВДАГГҮЙ (SVG-ийн
           marker нь referencing path-аас currentColor өвлөдөггүй) тул ангилал
           бүрд ТУСДАА marker хэрэглэнэ. */
        /* ⚠️ Нэр нь `arrKind` — гадна талын `kind` (хуваарийн ТӨРӨЛ) нь
           огт өөр зүйл; ижил нэр нь уншигчийг төөрөгдүүлнэ. */
        const arrKind = viol ? 2 : hot ? 1 : 0;
        arrows.push({
          d,
          cls: viol ? h.depBad : hot ? h.depHot : h.depLine,
          mk: `url(#hvDepArr${arrKind})`,
          key: `${r.oid}·${j}`,
          si: pi,
          ti: r.i,
          dblk: dep.blk ?? null,
        });
      });
    }
  }

  return (
    <div className={`${h.frame} ${isWide ? h.frameWide : ''}`}>
      {/* ── БҮХ ХЭРЭГСЭЛ НЭГ МӨРӨНД ──
          ⚠️ 2026-09-02 (хэрэглэгч): урьд нь ГУРВАН зурвас байв — (1) багц
          сонгох толгой, (2) `Section`-ийн «Ажлын хуваарь» гарчиг, (3) шүүлт ба
          хуанлийн хэрэгсэл. Гурвуулаа хүснэгтээс дээш зай иддэг байсан тул
          нэгтгэв. `Section`-д `title`/`note` өгөхөө больсноор түүний толгойн
          мөр огт зурагдахгүй болно.

          ⚠️ Багц сонголт нь `Section`-ЭЭС ГАДНА байх ЁСТОЙ: ачаалж байх ба мөр
          олдоогүй үед `Section` огт зурагддаггүй тул дотор нь байрлуулбал
          хэрэглэгч өөр багц руу шилжих ЗАМГҮЙ гацна. Тиймээс өгөгдлөөс
          хамаарах хэсгүүд нь `sc && rows.length` хамгаалалттай. */}
      <header className={h.head}>
        <label className={h.field}>
          {tr('Багц')}{' '}
          {/* ⚠️ Хяналтын горимд багц ТОГТМОЛ (дарааллаас сонгосон илгээлтийнх) */}
          <select className={h.select} value={pkg.group} disabled={busy || !!review}
            onChange={(e) => { if (askSwitch()) setPkg(pkgFloors(e.target.value)[0]); }}>
            {groupOpts.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        {floors.length > 1 && (
          <label className={h.field}>
            {tr('Хувилбар')}{' '}
            <select className={h.select} value={pkg.key} disabled={busy || !!review}
              onChange={(e) => {
                if (askSwitch()) setPkg(PKGS.find((x) => x.key === e.target.value) ?? pkg);
              }}>
              {floors.map((p) => <option key={p.key} value={p.key}>{p.floors}F</option>)}
            </select>
          </label>
        )}

        {sc && rows.length > 0 && (
          <>
            <span className={h.tbSep} aria-hidden />

            {/*
              * ТҮВШНИЙ ЗУРВАС — «Гэрээний бүртгэл» хуудасны ЯГ ИЖИЛ загвар
              * (2026-09-15, хэрэглэгчийн шаардлага). Товч нь «энэ түвшин
              * хүртэл дэлгэ» гэсэн утгатай: 1 дарвал зөвхөн дээд бүлгүүд,
              * хамгийн гүн нь дарвал бүх ажлын мөр харагдана.
              *
              * ⚠️ Товчны ТОО нь БАГЦААС хамаарна (`lvls`) — санхүүгийн
              *    бүртгэл нь тогтмол таван түвшинтэй Excel загвар, харин
              *    хуваарийн мод багц бүрд өөр гүнтэй.
              * ⚠️ Бүлэг огт байхгүй (бүгд навч) бол зурвас гарахгүй.
              */}
            {lvls.length > 1 && (
              <span className={h.lvBar}>
                <span className={h.lvLbl}>{tr('Түвшин')}</span>
                {lvls.map((d) => {
                  const nn = d + 1;
                  const deepest = d === lvls[lvls.length - 1];
                  return (
                    <button
                      key={d}
                      type="button"
                      className={lvl === nn ? h.lvOn : ''}
                      title={deepest
                        ? tr('Бүх ажлын мөрийг дэлгэнэ')
                        : tr('{0}-р түвшин хүртэл дэлгэх', nn)}
                      onClick={() => setLevel(nn)}
                    >{nn}</button>
                  );
                })}
              </span>
            )}

            <span className={h.tbSep} aria-hidden />

            {([
              ['all', tr('Бүгд'), plan.filter((r) => !r.group).length],
              ['has', tr('Хуваарьтай'), cov.planned],
              ['none', tr('Хуваарьгүй'), cov.tasks - cov.planned],
              ['partial', tr('Дутуу'), plan.filter((r) => {
                if (r.group) return false;
                const f = r.spans.filter(Boolean).length;
                return f > 0 && f < r.spans.length;
              }).length],
            ] as const).map(([k, label, cnt]) => (
              <button key={k} type="button"
                className={`${h.tab} ${filter === k ? h.tabOn : ''}`}
                onClick={() => setFilter(k)}>
                {label} <b>{num(cnt)}</b>
              </button>
            ))}

            {/* ⚠️ Сонголтууд ХОСЛОНО — «бүлэг · 2026» гэж давхарлаж шүүнэ.
                Тиймээс таб биш, тус тусдаа талбар. */}
            {/* ⚠️ БҮЛГЭЭР ШҮҮХ нь бусад шүүлтээс ӨМНӨ ажиллана: эхлээд модны
                салбарыг таслаад, дараа нь түүн дотор жилээр нарийсгана.
                Тиймээс жагсаалтын эхэнд, өргөн талбартай. */}
            <select className={`${h.sel} ${h.selWide}`} value={String(fGrp)} aria-label={tr('Бүлэг')}
              onChange={(e) => setFGrp(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              <option value="all">{tr('Бүлэг: бүгд')}</option>
              {groups.map((g) => <option key={g.oid} value={g.oid}>{g.label}</option>)}
            </select>

            <select className={h.sel} value={fYear} aria-label={tr('Эхлэх жил')}
              onChange={(e) => setFYear(e.target.value)}>
              <option value="all">{tr('Жил: бүгд')}</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>

            {(filter !== 'all' || fYear !== 'all' || fGrp !== 'all') && (
              <button type="button" className={h.tab}
                onClick={() => { setFilter('all'); setFYear('all'); setFGrp('all'); }}>
                {tr('Цэвэрлэх')}
              </button>
            )}

            {/* ⚠️ `tbSep`-ийн ЗҮҮН тал нь ЖАГСААЛТЫГ (аль мөр гарах вэ), БАРУУН
                тал нь ХАРАГДАЦЫГ (аль блок, ямар масштаб) өөрчилнө. */}
            <span className={h.tbSep} aria-hidden />

            <label className={h.plField}>
              {tr('Блок')}{' '}
              {/* ⚠️ Блокийн нэрний хажууд ХУВААРЬТАЙ мөрийн тоо. Үүнгүй бол аль
                  блок дээр ажил хийгдсэн, аль нь хоосныг мэдэхийн тулд 22 блокийг
                  нэг бүрчлэн сонгож үзэхээс өөр арга байхгүй. */}
              <select className={h.select} value={blk} onChange={(e) => setBlk(Number(e.target.value))}>
                {sc.bld.map((b, k) => (
                  <option key={b} value={k}>{b} · {num(blockFill[k])}</option>
                ))}
              </select>
            </label>

            {/*
              * ХУВААРИЙН ТӨРӨЛ — «Төлөвлөгөө» / «Гэрээ» (2026-09-11).
              *
              * ⚠️ ЗӨВХӨН ШИЛЖИНЭ (хэрэглэгчийн хүсэлт): эдгээр хоёр товч нь
              *    аль огноог ЗАСАХ вэ гэдгийг л сонгоно — нэг нь идэвхтэй.
              *    Хоёуланг зэрэг харах нь ТУСДАА товч (`Зэрэг`, доор).
              * ⚠️ Хадгалаагүй ноорогтой үед асууна (`askSwitch`) — солиход
              *    ноорог цэвэрлэгддэг тул.
              */}
            <div className={h.tlZoom}>
              {([
                ['plan', tr('Төлөвлөгөө')],
                ['geree', tr('Гэрээ')],
              ] as [PlanKind, string][]).map(([k, label]) => (
                <button key={k} type="button"
                  className={`${h.tlZoomB} ${kind === k ? h.tlZoomOn : ''}`}
                  aria-pressed={kind === k}
                  title={k === 'geree'
                    ? tr('Гэрээнд заасан огноог засна.')
                    : tr('Ажлын төлөвлөсөн огноог засна.')}
                  /* ⚠️ `busy` үед ТҮГЖИНЭ (2026-09-11-ний аудит): `save`-ийн
                     таван await-ийн зуур төрөл солигдвол `[kind]` эффект
                     ноорогийг цэвэрлэж, «хадгалагдлаа» гэсэн мэдэгдэл ӨӨР
                     төрлийн хуанли дээр гарна. Багцын сонгогч аль хэдийн
                     ингэж түгжигддэг. */
                  /* ⚠️ Хяналтын горимд төрөл нь илгээлтийнх — солиход санал цэвэрлэгдэнэ */
                  disabled={busy || !!review}
                  onClick={() => { if (kind !== k && askSwitch()) setKind(k); }}>
                  {label}
                </button>
              ))}
            </div>

            {/*
              * ЗЭРЭГ ХАРАХ — нөгөө төрлийн огноог мөр бүрийн ДООД зурвасаар
              * нэмж харуулна (2026-09-11, хэрэглэгч: «тусдаа зэрэг харах гэдэг
              * button нэм»).
              *
              * ⚠️ ЗӨВХӨН ХАРУУЛНА — ноорог, хадгалалт, батлалтад ОГТ хүрэхгүй.
              *    Засагдах нь ҮРГЭЛЖ дээрх сонголт (`kind`). Эс бөгөөс нэг
              *    ноорогт хоёр төрөл холилдоно (2026-09-11-ний аудитын S1).
              * ⚠️ Анхдагчаар УНТРААЛТТАЙ: дангаар нь харах нь үндсэн байдал.
              */}
            <button type="button"
              className={`${h.tlZoomB} ${showRef ? h.tlZoomRef : ''}`}
              aria-pressed={showRef}
              title={showRef
                ? tr('Нөгөө огноог нуана.')
                : (kind === 'geree'
                  ? tr('Төлөвлөсөн огноог мөр бүрийн доор нэмж харуулна.')
                  : tr('Гэрээний огноог мөр бүрийн доор нэмж харуулна.'))}
              onClick={() => setShowRef((v) => !v)}>
              {tr('Зэрэг')}
            </button>

            {/*
              * ТАЙЛБАР — зөвхөн лавлагаа АСААЛТТАЙ үед.
              *
              * ⚠️ Унтраалттай үед тайлбар үлдвэл байхгүй зурвасыг тайлбарлана.
              */}
            {showRef && (
              <span className={h.plRefKey}
                title={kind === 'geree'
                  ? tr('Мөр бүрийн ДООД зурвас нь ТӨЛӨВЛӨСӨН огноо — зөвхөн харуулна, засагдахгүй.')
                  : tr('Мөр бүрийн ДООД зурвас нь ГЭРЭЭНИЙ огноо — зөвхөн харуулна, засагдахгүй.')}>
                <span className={h.plRefSwatch} />
                {kind === 'geree' ? tr('Төлөвлөгөө') : tr('Гэрээ')}
              </span>
            )}
            {/* Бодит мужийн тайлбар (2026-09-23) — талбартай багцад л */}
            {hasActual && (
              <span className={h.plRefKey}
                title={tr('Мөр бүрийн доод захын нарийн зурвас нь БОДИТ эхэлсэн → дууссан огноо (дуусаагүй бол өнөөдөр хүртэл, тасархай). Popup-аас бүртгэнэ; гинж, төлөвлөгөөнд нөлөөлөхгүй.')}>
                <span className={h.plActSwatch} />
                {tr('Бодит')}
              </span>
            )}

            <div className={h.tlZoom}>
              {(['day', 'week', 'month'] as Zoom[]).map((z) => (
                <button key={z} type="button"
                  className={`${h.tlZoomB} ${zoom === z ? h.tlZoomOn : ''}`}
                  onClick={() => setZoom(z)}>
                  {z === 'day' ? tr('хоног') : z === 'week' ? tr('7 хоног') : tr('сар')}
                </button>
              ))}
            </div>
          </>
        )}

        <span className={h.spacer} />


        {sc && rows.length > 0 && (
          <span className={h.flowNote}>
            {msToDay(from)} → {msToDay(to)} · {num(total)} {tr('хоног')}
            {dirtyN ? <> · <b className={h.dirtyTag}>{tr('хадгалаагүй')} {num(dirtyN)}</b></> : null}
          </span>
        )}
        {/* Хуваалцсан ноорогийн төлөв (2026-09-23) — хадгалагдсан цаг · алдаа · хамт бичигчид */}
        {(hdLabel || hdUsers.length > 0) && (
          <span className={`${h.flowNote} ${hdSt.st === 'err' || hdSt.st === 'big' ? h.hdWarn : ''}`} role="status">
            {hdLabel}
            {hdLabel && hdUsers.length > 0 ? ' · ' : ''}
            {hdUsers.length > 0 ? tr('ноорогт: {0}', hdUsers.join(', ')) : ''}
          </span>
        )}

        {/* ⚠️ Урьдчилан харж байхад ЭНЭ товч гарахгүй — ноорог нь батлагчийн
            ӨӨРИЙН засвар БИШ, илгээгдсэн санал. Түүнийг «Харахыг болих»-оор
            хаяна, эс бөгөөс хоёр товч ижил зүйл хийж будлиантана. */}
        {canEdit && !previewing && !locked && dirtyN > 0 && (
          /* ⚠️ БУЦААХ ЗАМ. Хуанли дээр чирэх нь маш хурдан үйлдэл тул санамсаргүй
             өөрчлөлт гарна — хадгалахаас өмнө бүгдийг нэг товчоор цуцлах
             боломжгүй бол хэрэглэгч хуудсаа дахин ачаалахаас өөр аргагүй. */
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Хадгалаагүй бүх өөрчлөлтийг хаяна')}
            onClick={() => {
              /* ⚠️ Олон өөрчлөлтийг нэг товшилтоор алдахгүй (2026-09-23): 3-аас
                 дээш бол баталгаажуулна; цөөнд нь асуулт саад болно. */
              /* ⚠️ Хуваалцсан ноорог (2026-09-24): хоосорсныг дифф → `hdFlush` алсыг
                 нийлүүлээд цэвэрлэнэ — зөвхөн бичих эрхтэй үед (энэ товч `canEdit`). */
              if (dirtyN > 3 && !window.confirm(tr('Хадгалаагүй {0} өөрчлөлтийг хаях уу? Хуваалцсан ноорог бүх оролцогчид устна.', num(dirtyN)))) return;
              setDraft(new Map()); setHam(new Map()); setObDraft(new Map()); setObResDraft(new Map()); setADraft(new Map()); setResDraft(new Map()); setNote('');
              /* ⚠️ Буцаасан тэмдэглэгээ ноорогтой хамт (2026-09-25 аудит) — үлдвэл дараагийн
                 ШИНЭ засвар бүр «батлагч зөвшөөрөөгүй» улаан болж ХУДАЛ харагдана.
                 2026-09-25 #2/#3: шинэ засвар одоо саармаг (`backMarkMap`); «Ноорогт
                 буцааж засах» эсвэл дахин ачаалалт тэмдгийг дахин тавина. */
              setBackMarks(null);
            }}>
            {tr('Цуцлах')} ({num(dirtyN)})
          </button>
        )}
        {/* ⚠️ «Хадгалах» → «Батлуулах» (2026-09-07). Гүйцэтгэгч эх хуудсанд
            ШУУД бичихээ болив: огноо нь батлагдтал хяналтын хүснэгтэд
            хүлээнэ. Батлагдаагүй санал тайлан, хоцрогдлын дохиог хөндөхгүй. */}
        {/* ⚠️ ИЛГЭЭЛТЭЭ ТАТАХ (2026-09-21) — зөвхөн ЗОХИОГЧ, зөвхөн `pending`.
            «Батлуулах» товчны байранд: тэр товч `pending` үед нуугддаг тул
            зохиогч энд өөрийн илгээлтийн хувь заяаг удирдана. */}
        {canEdit && pending && isOwnSubmission && approving == null && (
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Хүлээгдэж буй илгээлтээ буцааж авна — агуулга нь ноорог болж буцна')}
            onClick={() => void withdraw()}>
            {tr('Илгээлтээ татах')}
          </button>
        )}
        {/* ⚠️ НЭМЭЛТ АЖИЛ БАТЛУУЛАХ (2026-09-24) — хуваарийн «Батлуулах»-аас ТУСДАА
            товч: тэр нь огноог, энэ нь ШИНЭ АЖЛЫГ гэрээнд оруулах эсэхийг 2 шатат
            урсгалд. Хүлээгдэж буй илгээлт байхад (`ajSub`) гарахгүй — `submitAjil`
            хоёр дахийг татгалзана. */}
        {canAddRow && !ajSub && adds.length > 0 && (
          <button type="button" className={h.save} disabled={ajBusy}
            title={tr('Нэмсэн шинэ ажлын мөрийг батлуулахаар илгээнэ — батлагдтал үндсэн өгөгдөлд бичигдэхгүй')}
            onClick={() => void sendAjil()}>
            {tr('Нэмэлт ажил батлуулах')} ({num(adds.length)})
          </button>
        )}
        {canEdit && !pending && (
          <button
            type="button"
            className={h.save}
            disabled={busy || dirtyN === 0 || flowReady === false}
            title={flowReady === false
              ? (flowWhy || tr('Батлах хүснэгт бэлэн болоогүй — админ нэг удаа нэвтэрч үүсгэнэ.'))
              : tr('Өөрчлөлтийг батлуулахаар илгээнэ — батлагдтал эх хуваарь хөдлөхгүй')}
            /* ⚠️ Цонх нээхэд `err` ЦЭВЭРЛЭНЭ (2026-09-21): FlowBox нь `err`-ийг
               зурдаг тул өмнөх (өөр үйлдлийн) алдаа цонхны дотор «энэ илгээлтийн
               алдаа» мэт гарч байв. */
            onClick={() => { setErr(''); setFlowBox('send'); }}
          >
            {tr('Батлуулах')}{dirtyN ? ` (${dirtyN})` : ''}
          </button>
        )}
        {/* ⚠️ УРЬДЧИЛАН ХАРАХ — батлагч саналыг ХУАНЛИ ДЭЭР харна. Үүнгүй бол
            «14 мөр» гэсэн тоо л хараад хараагүй зүйлээ баталж байна гэсэн үг. */}
        {!review && pending && canApprove && !previewing && (
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Саналыг хуанли дээр буулгаж харна — эх хуудсанд бичигдэхгүй')}
            onClick={() => void preview()}>
            {tr('Урьдчилан харах')}
          </button>
        )}
        {!review && pending && canApprove && previewing && (
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Урьдчилан харахыг болино')}
            onClick={clearPreview}>
            {tr('Харахыг болих')}
          </button>
        )}
        {/* ⚠️ ЗОХИОГЧИД ТОВЧ ИДЭВХГҮЙ (2026-09-08). Дүрэм нь `decide`-д
            (бичихээс өмнө) баригдана; энд идэвхгүй болгох нь ЯАГААД гэдгийг
            ИЛ болгож, батлагдахгүй мэдэж байж дарахаас сэргийлнэ. */}
        {!review && pending && canApprove && (
          <button type="button" className={h.save} disabled={busy || isOwnSubmission}
            title={isOwnSubmission
              ? tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.')
              : undefined}
            /* ⚠️ Нээхэд `err` цэвэрлэнэ (2026-09-21) — «Батлуулах»-тай ижил шалтгаан. */
            onClick={() => { setErr(''); setFlowBox('decide'); }}>
            {tr('Шийдвэрлэх')} ({num(pending.rowCount)})
          </button>
        )}
        {/*
          * ⚠️ ӨӨРИЙН ИЛГЭЭЛТ — товч идэвхгүй болсон ШАЛТГААНЫГ ил хэлнэ
          *    (2026-09-15). Урьд нь зөвхөн `title` (hover) байсан тул
          *    мэдрэгч дэлгэцэд ОГТ хүрэхгүй, хулганатай ч гэсэн саарал
          *    товч ширтсэн хүн «эвдэрсэн» гэж үзнэ. Багц гацсан гэдгийг
          *    ба гарцыг нь хамт хэлнэ.
          */}
        {pending && canApprove && isOwnSubmission && (
          <span className={h.muted} role="status">
            {tr('Энэ илгээлтийг та өөрөө хийсэн тул өөрөө батлах боломжгүй. Өөр батлагч шийдвэрлэнэ — багцад батлагч томилоогүй бол админ «Хуваарийн эрх» хэсгээс нэмнэ.')}
          </span>
        )}
        {/*
          * ⚠️ БАТЛАХ ЭРХГҮЙ бол ШАЛТГААНЫГ ил хэлнэ (2026-09-15, хэрэглэгч:
          *    «төлөвлөөд батлахад батлах идэвхжихгүй байна»).
          *
          *    Урьд нь `canApprove` худал үед «Шийдвэрлэх» товч ОГТ
          *    зурагддаггүй байв — хэрэглэгч «товч идэвхгүй» гэж хардаг ч
          *    үнэндээ товч байхгүй, шалтгаан нь хаана ч бичигдэхгүй.
          *    Одоо хэнд хандахыг нэрлэнэ.
          *
          * ⚠️ `locked` үед «Батлуулах» товч ч алга болдог (дээрх `!pending`)
          *    тул энэ мөр нь тэр хоосон зайг ч тайлбарлана.
          */}
        {!review && pending && !canApprove && (
          <span className={h.muted} role="status">
            {/* ⚠️ ХОЁР ӨӨР шалтгааныг ЯЛГАНА (2026-09-15): «эрх огт байхгүй»
                ба «эрх бий ч ЭНЭ багцад биш» хоёр нь өөр гарцтай. Хоёуланг
                нь «эрхгүй» гэж нэгтгэвэл тусдаа эрх тохируулсан хүн юу дутуу
                байгааг олохгүй. `hasPlanRole` нь багцаас ҮЛ ХАМААРНА. */}
            {hasPlanRole(user?.username, 'approver')
              ? tr('Танд батлах эрх бий, гэхдээ ЭНЭ багцад томилогдоогүй байна. Админ «Хуваарийн эрх» → {0} → «Батлагч» хэсэгт таныг нэмнэ.', pkg.group)
              : tr('Батлах эрхгүй — энэ багцад батлагчаар томилогдсон хүн шийдвэрлэнэ. Админ «Хуваарийн эрх» хэсгээс томилно.')}
          </span>
        )}
        {/*
          * ХЯНАЛТЫН ЗУРВАС (2026-09-25) — зөвшөөрлийн тоолуур · батлах · буцаах · хаах.
          * ⚠️ «Батлах» нь БҮХ өөрчлөгдсөн мөр ногоон болтол ХААЛТТАЙ — гүйцэтгэлийн
          *    дүрэм (`Guitsetgel.allOk`): батлагч мөр бүрийг харсан байх ёстой.
          * ⚠️ Өөрийн илгээлтийг батлахгүй — `decide` ба `decidePlan` ч татгалзана,
          *    энд товч дарахаас ӨМНӨ хэлнэ.
          */}
        {review && (
          <>
            <span className={`${h.flowNote} ${allOk ? h.revAllOk : ''}`} role="status">
              {pending ? `${pending.author} · ` : ''}
              {tr('Зөвшөөрсөн {0}/{1} мөр', num(reviewOk), num(reviewOids.length))}
            </span>
            <button type="button" className={h.discard}
              disabled={!reviewLive || allOk || !reviewOids.length}
              title={tr('Дараагийн зөвшөөрөөгүй мөр рүү гүйлгэнэ (өөрчлөгдсөн блокийг нь сонгоно)')}
              onClick={jumpNextBad}>
              {tr('Дараагийн ✕')}
            </button>
            {/* ⚠️ ЗӨВХӨН super (`Guitsetgel`-ийн «✓ бүгдийг ногоон» дүрэм): батлагч мөр
                бүрийг харах ёстой — нэг товчоор бүгдийг ногоон болговол хяналт утгаа алдана. */}
            {(status === 'off' || roleForUser(user?.username) === 'super') && (
              <button type="button" className={h.discard}
                disabled={busy || approving != null || !reviewLive || !reviewOids.length}
                title={tr('Өөрчлөгдсөн бүх мөрийг ногоон/улаан болгоно')}
                onClick={() => setOkRows(allOk ? new Set() : new Set(reviewOids))}>
                {allOk ? tr('Бүгдийг болих') : tr('Бүгдийг зөвшөөрөх')}
              </button>
            )}
            <button type="button" className={h.discard}
              /* ⚠️ ЯГ ЭНЭ илгээлт, урьдчилан харсны ДАРАА л (2026-09-25 аудит): урьд нь
                 зуур солигдсон ШИНЭ илгээлтийг хараагүй байж буцааж, `okRows=[]` бичдэг байв. */
              disabled={busy || approving != null || !(reviewLive || reviewConflict) || !canApprove || isOwnSubmission}
              onClick={() => { setErr(''); setFlowBox('reject'); }}>
              {tr('Буцаах')}
            </button>
            <button type="button" className={h.save}
              disabled={busy || approving != null || !reviewLive || !canApprove || isOwnSubmission || (reviewOids.length > 0 && !allOk)}
              title={isOwnSubmission
                ? tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.')
                : !canApprove
                  ? tr('Энэ багцын хуваарийг батлах эрхгүй.')
                  : reviewOids.length > 0 && !allOk
                    ? tr('Өөрчлөгдсөн мөр бүрийг ногоон болгосны дараа батална.')
                    : tr('Батлахад хуваарь эх хуудсанд бичигдэнэ.')}
              onClick={() => { if (window.confirm(tr('Хуваарийг батлах уу? Эх хуудсанд бичигдэнэ.'))) void decide(true, ''); }}>
              {tr('Батлах')}
            </button>
            <button type="button" className={h.discard} disabled={busy || approving != null}
              title={tr('Шийдвэргүй хаана (Esc)')}
              onClick={() => review.onClose()}>
              ✕ {tr('Хаах')}
            </button>
          </>
        )}
      </header>

      {/* ⚠️ ХААХ товч (2026-09-23): алдааны баннер хаагдахгүй, тэмдэглэлийнх нь
          «дарахад хаагдана» гэдэг нь харагддаггүй байв. */}
      {err && (
        <p className={h.err} role="alert">
          {err}
          <button type="button" className={h.noteX} onClick={() => setErr('')} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {note && (
        <p className={`${h.note} ${h.noteDismiss}`} role="status" aria-live="polite" onClick={() => setNote('')}>
          {note}
          <button type="button" className={h.noteX} onClick={() => setNote('')} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {/* ── НЭМЭЛТ АЖЛЫН баннерууд (2026-09-24) — хуваарийн урсгалынхаас тусдаа ── */}
      {ajErr && (
        <p className={h.err} role="alert">
          {ajErr}
          <button type="button" className={h.noteX} onClick={() => setAjErr('')} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {ajNote && (
        <p className={`${h.note} ${h.noteDismiss}`} role="status" aria-live="polite" onClick={() => setAjNote('')}>
          {ajNote}
          <button type="button" className={h.noteX} onClick={() => setAjNote('')} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {/* Хүлээгдэж буй илгээлт — БҮХ хүнд (ил тод); «татах» ЗӨВХӨН зохиогчид
          (`decideAjil` зохиогч=батлагчийг татгалздаг тул үүнгүйгээр багц түгжинэ) */}
      {ajSub && (
        <p className={h.note} role="status">
          {tr('Нэмэлт ажил батлуулахаар илгээгдсэн: {0} мөр · {1}', String(ajSub.rowCount), ajSub.author)}
          {(status === 'off' || (user?.username ?? '').trim().toLowerCase() === ajSub.author) && (
            <button type="button" className={h.noteBtn} disabled={ajBusy}
              title={tr('Илгээлтээ буцааж авна — мөрүүд хуудсанд эргэж орно')}
              onClick={() => void withdrawAjilHere()}>
              {tr('Илгээлтээ татах')}
            </button>
          )}
        </p>
      )}
      {ajBack && (
        <p className={h.err} role="alert">
          {tr('Нэмэлт ажил буцаагдсан ({0} мөр, {1}): {2} — мөрүүд хуудсанд буцаж орлоо, засаад дахин батлуулна уу.', String(ajBack.n), ajBack.by || '—', ajBack.reason || '—')}
          <button type="button" className={h.noteX} onClick={() => setAjBack(null)} aria-label={tr('Хаах')}>×</button>
        </p>
      )}
      {!review && ajApplied && (
        <p className={h.note} role="status">
          {tr('Нэмэлт ажил батлагдлаа — хадгалаагүй өөрчлөлтөө хадгалаад/илгээгээд хуудсыг шинэчилнэ үү.')}
          <button type="button" className={h.noteBtn} disabled={busy}
            title={tr('Хуудсыг серверээс татна; хадгалаагүй ноорог шинэ мөрүүд рүү (№ · нэрээр) зөөгдөнө')}
            onClick={() => void refreshAfterApplied()}>
            {tr('Шинэчлэх')}
          </button>
        </p>
      )}
      {ajStuck > 0 && (
        <p className={h.note} role="status">
          {tr('Батлагдсан нэмэлт ажлын {0} илгээлт үндсэн хүснэгтэд хараахан буугаагүй — батлагч «Нэмэлт ажил батлах» хуудаснаас «Дахин буулгах» дарна.', num(ajStuck))}
        </p>
      )}
      {!review && !canEdit && !canApprove && (
        <p className={h.note}>
          {tr('Танд хуваарь засах эрх алга — зөвхөн харна. Эрхийг админ «Хуваарь төлөвлөх» гэж тусад нь олгоно.')}
        </p>
      )}
      {/* ⚠️ Зөвхөн БАТЛАГЧ эрхтэй хүн шийдвэрлэх зүйлгүй үед ХООСОН хуудас
          хараад «эвдэрсэн юм болов уу» гэж бодохоос сэргийлнэ. */}
      {!review && !canEdit && canApprove && !pending && (
        <p className={h.note}>
          {tr('Танд батлах хуваарь алга — гүйцэтгэгч илгээмэгц энд гарч ирнэ. Хуваарийг та зөвхөн харна, засахгүй.')}
        </p>
      )}
      {/* ⚠️ ХҮЛЭЭГДЭЖ БУЙ ИЛГЭЭЛТ — засварыг ТҮГЖИНЭ. Хоёр санал зэрэг
          хүлээвэл батлагч алийг нь батлахаа мэдэхгүй болно. */}
      {!review && pending && (
        <p className={h.note} role="status">
          {tr('{0} мөрийн хуваарь батлагдахыг хүлээж байна ({1} илгээв). Шийдвэр гартал эх хуваарь хөдлөхгүй.',
            num(pending.rowCount), pending.author)}
          {!canApprove && ` ${tr('Батлагч шийдвэрлэсний дараа энэ хуудас дахин нээгдэнэ.')}`}
          {/* ⚠️ Хоёр эрхтэй хүнд ЯАГААД товч идэвхгүйг тайлбарлана (2026-09-08) */}
          {canApprove && isOwnSubmission
            && ` ${tr('Өөрийн илгээсэн хуваарийг өөрөө батлах боломжгүй — өөр батлагч шийдвэрлэнэ.')}`}
          {/* ⚠️ ШИНЭЧЛЭХ (2026-09-23): батлагч шийдсэнийг мэдэхийн тулд хуудсаа
              бүхэлд нь дахин ачаалах шаардлагагүй — зөвхөн урсгалыг татна. */}
          {' '}
          <button type="button" className={h.noteBtn} disabled={busy} onClick={() => void refreshFlow()}>
            {tr('Шинэчлэх')}
          </button>
        </p>
      )}
      {/* ⚠️ БУЦААСАН ШАЛТГААН — гүйцэтгэгчид хүрэх цорын ганц зам. Үүнгүй бол
          «шалтгаан заавал» гэсэн дүрэм утгагүй болно. */}
      {!review && lastDecision && lastDecision.status === PLAN_STATUS.returned && (
        /* `pre-line` — шалтгааны «Зөвшөөрөгдөөгүй N мөр: …» жагсаалт тусдаа мөрөнд */
        <p className={h.err} role="status" style={{ whiteSpace: 'pre-line' }}>
          {tr('Өмнөх хуваарь буцаагдсан ({0}): {1}',
            lastDecision.approver ?? '', lastDecision.reason ?? '')}
          {' '}
          {tr('Засаад дахин илгээнэ үү.')}
          {/* ⚠️ БАТЛАГЧИЙН ТЭМДЭГЛЭГЭЭ (2026-09-25) — гүйцэтгэлийн «буцаагдсан
              илгээлт ноорог болж ачаалагдана, улаан/ногоон нүдтэй» загвар.
              Ноорог ХООСОН үед л — байгаа ажлын дээр давхарлахгүй. */}
          {lastDecision.okRows && ` ${tr('Батлагч {0} мөрийг зөвшөөрсөн.', num(lastDecision.okRows.length))}`}
          {canEdit && dirtyN === 0 && (
            <>
              {' '}
              <button type="button" className={h.noteBtn} disabled={busy} onClick={() => void restoreWithdrawn()}
                title={tr('Буцаагдсан саналыг ноорогт буулгана — зөвшөөрөгдөөгүй мөр УЛААН, зөвшөөрсөн нь НОГООН')}>
                {tr('Ноорогт буцааж засах')}
              </button>
            </>
          )}
        </p>
      )}
      {backOn && (
        <p className={h.note} role="status">
          {tr('Улаан тэмдэгтэй мөрийг батлагч зөвшөөрөөгүй — засаад дахин илгээнэ үү. Ногоон нь зөвшөөрөгдсөн.')}
        </p>
      )}
      {/* ⚠️ Зохиогч өөрөө татсан (2026-09-21) — буцаалтаас ялгаатай, шалтгаангүй. */}
      {!review && lastDecision && lastDecision.status === PLAN_STATUS.withdrawn && (
        <p className={h.note} role="status">
          {tr('Өмнөх илгээлтийг зохиогч ({0}) өөрөө татсан — засаад дахин илгээнэ.', lastDecision.author)}
          {/* ⚠️ НООРОГТ БУЦААХ (2026-09-23): «Хуваарь батлах» дарааллаас татахад
              зөвхөн төлөв хөдөлдөг (хуанли тэнд байхгүй) тул агуулга энд
              сэргээгдэнэ. Ноорог ХООСОН үед л — байгаа ажлын дээр давхарлахгүй. */}
          {canEdit && dirtyN === 0 && (
            <>
              {' '}
              <button type="button" className={h.noteBtn} disabled={busy} onClick={() => void restoreWithdrawn()}>
                {tr('Ноорогт буцаах')}
              </button>
            </>
          )}
        </p>
      )}
      {!review && lastDecision && lastDecision.status === PLAN_STATUS.approved && (
        <p className={h.note} role="status">
          {tr('Сүүлийн хуваарь батлагдсан ({0}, {1} мөр).',
            lastDecision.approver ?? '', num(lastDecision.rowCount))}
        </p>
      )}
      {/* ⚠️ ЯГ ШАЛТГААНЫГ бичнэ (2026-09-11). Урьд нь гурван огт өөр
          шалтгаан (нэвтрээгүй · эзэн танигдахгүй · порталын алдаа) нэг л
          «олдсонгүй» мессеж болж нийлдэг тул админ юу засахаа мэдэхгүй байв. */}
      {flowReady === false && canEdit && (
        <p className={h.err} role="alert">
          {flowWhy || tr('Батлах хүснэгт олдсонгүй — админ (super) нэг удаа нэвтрэхэд автоматаар үүснэ.')}
          {' '}
          {tr('Түүнийг хүртэл хуваарь илгээх боломжгүй.')}
        </p>
      )}

      {busy && !rows.length ? (
        <Loading label={tr('Хуваарь ачаалж байна…')} />
      ) : !sc || !rows.length ? (
        <Empty label={tr('Энэ багцад мөр олдсонгүй.')} />
      ) : (
        /* ⚠️ `title`/`note` ӨГӨХГҮЙ — толгойн мөр нь дээрх нэгтгэсэн зурваст
           уусав. `Section` нь `title`-гүй үед header-ээ огт зурдаггүй. */
        <Section fill>
          <div className={h.fullBar}>
            {!review && (
            <button
              type="button"
              className={wide ? h.fullBtnOn : h.fullBtn}
              onClick={() => setWide((v) => !v)}
              aria-pressed={wide}
              title={wide ? tr('Бүтэн дэлгэцээс гарах (Esc)') : tr('Хуваарийг бүтэн дэлгэцээр')}
            >
              <span aria-hidden>{wide ? '✕' : '⛶'}</span>
              {wide ? tr('Багасгах') : tr('Бүтэн дэлгэц')}
            </button>
            )}
            {isWide && (
              <span className={h.fullBarNote}>
                {review
                  ? `${tr('Хуваарь шийдвэрлэх')} · ${pkg.label} · ${kind === 'geree' ? tr('Гэрээ') : tr('Төлөвлөгөө')}`
                  : `${pkg.label}${dirtyN ? ` · ${tr('өөрчлөлт')} ${dirtyN}` : ''}`}
              </span>
            )}
          </div>
          {/* ⚠️ Хяналтын заавар — «Батлах» яагаад хаалттайг ИЛ хэлнэ */}
          {review && (
            <p className={h.plHint}>
              {tr('Өөрчлөгдсөн мөр улаан хүрээтэй · хуучин огноо нь зурвасын доор бүдгээр · ажлын кодын ✕ дээр дарж зөвшөөрнө (ногоон ✓) · нэр дээр дарж дэлгэрэнгүйг харна · бүгд ногоон болсны дараа «Батлах» идэвхжинэ')}
            </p>
          )}
          {canEdit && (
            <p className={h.plHint}>
              {tr('Ажлын нэр дээр дарж хуанлиар оруулна · мөрийн ард чирж муж татна · зурвасын голоос чирж зөөнө · ирмэгээс татаж уртасгана')}
              {kind === 'plan' && ` · ${tr('баруун цэгээс чирж холбоно · сум дээр дарж засна')}`}
            </p>
          )}

          {/* ── НЭГ БҮТЭН ХҮСНЭГТ: зүүн мод + баруун хуанли ── */}
          {visible.length === 0 ? (
            <Empty label={tr('Мөр алга.')} />
          ) : (
            <div className={h.gWrap} ref={scrollRef} onScroll={onScroll}>
              <div className={`${h.gSide} ${cols ? '' : h.gSideNarrow}`}>
                <div className={h.gSideHead} style={{ height: PL_ROW }}>
                  <span className={h.gHeadDes}>{tr('Ажлын код')}</span>
                  <span className={h.gHeadWork}>
                    {tr('Ажил')}
                    {/* ⚠️ Хураах товч нь НЭРИЙН толгойд — нуугдах багануудын өмнө,
                        тэдгээр нуугдсан ч товч байрандаа үлдэнэ (нуугдсан
                        багана дотор байсан бол буцааж нээх аргагүй болно). */}
                    <button type="button" className={h.colsBtn}
                      onClick={() => setCols((v) => !v)}
                      title={cols ? tr('Огноо · нөөцийн баганыг хураах') : tr('Огноо · нөөцийн баганыг нээх')}
                      aria-label={tr('Огноо · нөөцийн багана')}
                      aria-expanded={cols}>
                      {cols ? '◂' : '▸'}
                    </button>
                  </span>
                  {/*
                    * ДӨРВӨН ОГНООНЫ БАГАНА (2026-09-15, хэрэглэгчийн хүсэлт:
                    * «ажилбар бүрийн ард 4 багана нэмнэ — гэрээний эхлэх,
                    * дуусах, инженерийн эхлэх, дуусах огноо»).
                    *
                    * ⚠️ ХОЁР ТӨРЛИЙГ ЗЭРЭГ: хуанли нь ЗӨВХӨН идэвхтэй табын
                    *    огноог зурдаг тул гэрээ ба төлөвлөгөөг зэрэгцүүлж
                    *    харахын тулд табаа солих шаардлагатай байв. Эдгээр
                    *    багана нь хоёуланг нь НЭГ мөрөнд гаргана.
                    *
                    * ⚠️ ЗАСАГДАХГҮЙ — зөвхөн УНШИНА. Огноо засах цорын ганц
                    *    зам нь хуанли дээр чирэх (`onDown`) ба popup хэвээр:
                    *    хоёр өөр засварын зам үүсвэл аль нь үнэн болох нь
                    *    бүрхэг болно.
                    */}
                  <span className={h.gHeadDate}>{tr('Гэрээ эхлэх')}</span>
                  <span className={h.gHeadDate}>{tr('Гэрээ дуусах')}</span>
                  {/* ⚠️ ХОНОГ нь ТУСДАА БАГАНА (2026-09-15, хэрэглэгч).
                      Огнооны нүдэнд шигтгэвэл тэр нүд хоёр утга агуулж,
                      эрэмбэлэх · хуулах · нүдээр гүйлгэх бүгд хүндэрнэ. */}
                  <span className={h.gHeadDays}>{tr('Хоног')}</span>
                  {/* ⚠️ «Төлөвлөгөөт» (2026-09-23, хэрэглэгч) — хажууд «Бодит» багана
                      нэмэгдсэн тул «Төлөвлөгөө эхлэх» гэвэл аль нь төлөвлөгөө, аль нь
                      баримт болох нь бүрхэг. */}
                  <span className={h.gHeadDate}>{tr('Төлөвлөгөөт эхлэх')}</span>
                  <span className={h.gHeadDate}>{tr('Төлөвлөгөөт дуусах')}</span>
                  <span className={h.gHeadDays}>{tr('Хоног')}</span>
                  {/*
                    * БОДИТ ЭХЭЛСЭН / ДУУССАН (2026-09-23) — идэвхтэй блокийн (`blk`)
                    * утга; popup-аас засагдана, энд зөвхөн харуулна (дээрх ⚠️-тэй
                    * ижил: засварын нэг л зам). Бүлгийн мөрд хүүхдийн MIN/MAX.
                    * ⚠️ Талбар байхгүй багцад багана ОГТ гарахгүй (`hasActual`).
                    */}
                  {hasActual && <span className={h.gHeadDate}>{tr('Бодит эхэлсэн')}</span>}
                  {hasActual && <span className={h.gHeadDate}>{tr('Бодит дууссан')}</span>}
                  {/* ХҮН ХҮЧ · МАШИН МЕХАНИЗМ (2026-09-23) — мөрийн нөөц; бүлэгт нийлбэр. */}
                  {hasRes && <span className={h.gHeadRes} title={tr('Хүн хүч')}>{tr('Хүн')}</span>}
                  {hasRes && <span className={h.gHeadRes} title={tr('Машин механизм')}>{tr('Техник')}</span>}
                  {/* ⚠️ ЖИШЭЭГ ТОЛГОЙД (2026-09-15): нүдний `placeholder`-т
                      тавьбал 1,400 хоосон мөр бүгд «11FS14» гэж харагдаж,
                      бодит утга мэт уншигдана. Толгойд нэг удаа бичих нь
                      бичиглэлийг заах ба хүснэгтийг цэвэр үлдээнэ. */}
                  <span className={h.gHeadHam} title={tr('Жишээ: 11FS14 — 11-р ажил дууссанаас 14 хоногийн дараа. Олныг таслалаар: 11FS,22SS-5. @2 = зөвхөн 2-р блок (@-гүй = бүх блок)')}>
                    {tr('Хамаарал')} <i className={h.gHeadHint}>11FS14</i>
                  </span>
                </div>
                {/* ⚠️ ЗАЙ БАРИГЧ: зүүн мөрүүд УРСГАЛД байдаг тул зурагдаагүй
                    мөрүүдийн өндрийг орлуулахгүй бол гүйлтийн урт агшиж, зүүн
                    жагсаалт ба баруун зурвас хоорондоо гулсана. */}
                {winFrom > 0 && <div aria-hidden style={{ height: winFrom * PL_ROW }} />}
                {slice.map(({ r }) => {
                  /* Бүлгийн бодит огноо · нөөц хүүхдээс (2026-09-23, `aggExtra`) */
                  const x = r.group ? effRow(r) : r;
                  return (
                  <TaskRow
                    key={r.oid}
                    r={r}
                    on={sel === r.oid}
                    /* ⚠️ УЯЛДААНЫ ноорог ч «хадгалаагүй» тэмдэг авна — эс
                       бөгөөс зөвхөн уялдаа нь өөрчлөгдсөн мөр цэвэр мэт
                       харагдаж, юу хадгалагдахыг тоолж болохгүй байв.
                       Бодит огноо · нөөцийн ноорог мөн адил (2026-09-23).
                       Сарын обьём/нөөцийн ноорог (`des|блок`) ч мөн (2026-09-24 аудит). */
                    dirty={draft.has(r.oid) || ham.has(r.oid) || aDraft.has(r.oid) || resDraft.has(r.oid)
                      || (r.des != null && obDirtyDes.has(r.des))}
                    hasActual={hasActual}
                    hasRes={hasRes}
                    aStart={x.aStart?.[blk] ?? null}
                    aEnd={x.aEnd?.[blk] ?? null}
                    hun={x.hun ?? null}
                    mashin={x.mashin ?? null}
                    collapsed={collapsed.has(r.oid)}
                    onToggle={() => {
                      /* ⚠️ ГАРААР эвхэхэд түвшний товч ТОДРОХГҮЙ болно
                         (`lvl = 0`) — дэлгэц дээрх байдалтай зөрчилдсөн
                         тодруулга үлдэх ёсгүй (`Finance.lvOn`-ийн ижил дүрэм). */
                      setLvl(0);
                      setCollapsed((s) => {
                        const m = new Set(s);
                        if (m.has(r.oid)) m.delete(r.oid); else m.add(r.oid);
                        return m;
                      });
                    }}
                    onPick={() => { setSel(r.oid); setModal(r.oid); }}
                    /* ⚠️ ХОЁР ТӨРЛИЙН огноог зэрэг өгнө. `r` нь ИДЭВХТЭЙ
                       табынх, `refByOid` нь НӨГӨӨ табынх — аль нь гэрээ, аль
                       нь төлөвлөгөө болохыг `kind`-ээр шийднэ. */
                    /* ⚠️ БҮЛГИЙН мөрд `effSpan` (хүүхдийн MIN/MAX) — зурвас ба popup-тай
                       ИЖИЛ эх (2026-09-23 аудит). Урьд нь `rowSpan` (өөрийн хадгалсан
                       муж) байсан тул блокгүй багцын бүлэгт «—», хажууд нь бүтэн
                       зурвас гардаг байв. */
                    geree={kind === 'geree' ? rowSpanAt(r) : refSpanAt(r.oid)}
                    tolov={kind === 'geree' ? refSpanAt(r.oid) : rowSpanAt(r)}
                    /* ⚠️ Уялдааг нүдэнд ШУУД бичих зам (`HamCell`). Түгжээтэй
                       (батлагдахыг хүлээж буй илгээлт) үед ч засагдахгүй —
                       `applyHamText` дотор `locked` шалгагдана. */
                    canEdit={canEdit && !locked}
                    onHamText={applyHamText}
                    /* НЭМЭЛТ АЖИЛ (2026-09-24): бүлэгт «+», батлагдаагүй мөрд улаан + «×» */
                    added={r.oid < 0}
                    onAdd={r.group && canAddRow && !locked
                      ? () => { setAddFor((x) => (x === r.oid ? null : r.oid)); setAddForm(EMPTY_FORM); setAjErr(''); }
                      : undefined}
                    onDrop={r.oid < 0 ? () => dropAdd(r.oid) : undefined}
                    /* ЗӨВШӨӨРӨЛ (2026-09-25): хяналтад — батлагч сэлгэнэ; гүйцэтгэгчид —
                       буцаасан шийдвэрийн улаан/ногоон (зөвхөн харуулна). */
                    mark={markOf(r)}
                    onMark={marking && markOf(r) ? () => toggleOk(r.oid) : undefined}
                  >
                    {addFor === r.oid && (
                      <AddBox parent={r} form={addForm} onForm={setAddForm}
                        onOk={() => addRow(r)} onCancel={() => setAddFor(null)} />
                    )}
                  </TaskRow>
                  );
                })}
                {winTo < visible.length && (
                  <div aria-hidden style={{ height: (visible.length - winTo) * PL_ROW }} />
                )}
              </div>

              <div className={h.gRight}>
                <div className={h.gTrack} style={{ width: W }} ref={trackRef}>
                  {/* ⚠️ ЧИРЖ ГҮЙЛГЭХ (2026-09-17, хэрэглэгч: «зүүн баруун гүйлт ажиллахгүй»):
                      сарын толгойн зурвас дээр чирвэл хуанли хэвтээ гүйнэ — гүйлтийн
                      зурвас нарийн, харагдахгүй байсан. Ажлын мөр дээр чирэх нь
                      урьдын адил зурвас үүсгэнэ/зөөнө. */}
                  <div className={h.plHead}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      const el = scrollRef.current; if (!el) return;
                      const x0 = e.clientX, s0 = el.scrollLeft;
                      const t = e.currentTarget;
                      t.setPointerCapture?.(e.pointerId);
                      const mv = (ev: PointerEvent) => { el.scrollLeft = s0 - (ev.clientX - x0); };
                      const up = () => { t.removeEventListener('pointermove', mv); t.removeEventListener('pointerup', up); t.removeEventListener('pointercancel', up); };
                      t.addEventListener('pointermove', mv); t.addEventListener('pointerup', up); t.addEventListener('pointercancel', up);
                    }}>
                    {months.map((m) => {
                      const pc = monLab(m.lab);
                      return (
                        <span key={m.at} className={h.plMonth} style={{ left: xOf(m.at) }}
                          title={pc?.tip}>
                          {m.lab}
                          {pc && <b className={h.plMonPct}>{pc.txt}</b>}
                        </span>
                      );
                    })}
                    {ticks.map((tk) => (
                      <span key={tk.at} className={`${h.plDay} ${tk.big ? h.plDayBig : ''}`}
                        style={{ left: xOf(tk.at) }}>
                        {tk.lab}
                      </span>
                    ))}
                  </div>

                  <div className={h.plLanes}
                    ref={lanesRef}
                    style={{ height: visible.length * PL_ROW }}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                  >
                    {months.map((m) => (
                      <span key={m.at} className={`${h.tlGrid} ${h.tlGridBig}`} style={{ left: xOf(m.at) }} />
                    ))}
                    {zoom !== 'month' && ticks.filter((t2) => !t2.big).map((tk) => (
                      <span key={tk.at} className={h.tlGrid} style={{ left: xOf(tk.at) }} />
                    ))}
                    {now >= from && now <= to && (
                      <span className={h.tlNow} style={{ left: xOf(now) }} title={msToDay(now)} />
                    )}

                    {slice.map(({ r, k }) => {
                      /* ⚠️ БҮЛГИЙН ЗУРВАС нь ХҮҮХДҮҮДЭЭСЭЭ бодогдоно
                         (`effSpan`) — хадгалагдсан хуучин огноо нь
                         тэдэнтэй зөрж байсан ч ЗӨВ мужийг харуулна. */
                      const sp = r.group ? effSpan(plan, r.i, blk) : r.spans[blk];
                      const st = sp ? statusOf(sp, r.act?.[blk], now) : 'none';
                      /* Уялдааны зөрчил — шаардлагаас ӨМНӨ эхэлсэн зурвасыг
                         улаан хүрээгээр тэмдэглэнэ (хориглохгүй) */
                      /* ⚠️ Гэрээ табд зөрчил ТООЦОХГҮЙ (2026-09-23) — сумтай ижил. */
                      const need = sp && r.deps.length && kind === 'plan'
                        ? requiredStart(plan, byCode, r.i, blk) : null;
                      const viol = !!(sp && need != null && sp.start < need);
                      /*
                       * ХУУЧИН (СЕРВЕРИЙН) ЗУРВАС (2026-09-25) — батлагчийн хяналтад
                       * ба буцаасан саналыг засахад: өөрчлөгдсөн мөрийн ОДООГИЙН
                       * батлагдсан огноо доод хагаст бүдгээр («юу байсан → юу болох»).
                       * ⚠️ `base` нь серверийн мөр, `plan`-тай ИЖИЛ индекстэй.
                       * ⚠️ Огноо ижил бол ЗУРАХГҮЙ — зөвхөн уялдаа/обьём өөрчлөгдсөн мөрд
                       *    давхар зурвас «огноо өөрчлөгдсөн» мэт андуурагдана.
                       * ⚠️ Хуучин огноогүй бол зурахгүй (`null ≠ 0`) — шинэ муж л харагдана.
                       */
                      const oldSp = (review || backOn) && !r.group && reviewSet.has(r.oid)
                        ? base[r.i]?.spans[blk] ?? null : null;
                      const showOld = !!(oldSp && !showRef && (!sp || oldSp.start !== sp.start || oldSp.end !== sp.end));
                      const half = showRef || showOld;
                      return (
                        <div key={r.oid}
                          className={`${h.plLane} ${k % 2 ? h.plLaneAlt : ''} ${sel === r.oid ? h.plLaneOn : ''} ${link && !hierRelated(plan, r.i, link.i) ? h.plLaneDrop : ''}`}
                          style={{ top: k * PL_ROW, height: PL_ROW }}
                          data-row={r.i}
                          onPointerDown={(e) => onDown(e, r, 'new')}
                        >
                          {/*
                            * ЛАВЛАГААНЫ ЗУРВАС — нөгөө төрлийн огноо (2026-09-11).
                            *
                            * ⚠️ Мөрийн ДООД хагаст, сонгосон төрлийн зурвасын ДООР
                            *    зэрэгцэнэ (ард нь биш) — хэрэглэгчийн хүсэлт. Хоёр
                            *    огнооны зөрүү нь хэвтээ шилжилтээр шууд уншигдана.
                            * ⚠️ Огноо ИЖИЛ байсан ч ЗУРНА: зэрэгцсэн хоёр зурвас нь
                            *    давхцахгүй тул «ижил байна» гэдэг нь өөрөө мэдээлэл.
                            * ⚠️ Зөвхөн нөгөө төрөлд огноо БАЙГАА үед — байхгүйг
                            *    «тэг» гэж зурахгүй (`null ≠ 0`).
                            */}
                          {(() => {
                            if (!showRef) return null;
                            const rr = refByOid.get(r.oid);
                            if (!rr) return null;
                            const rsp = r.group ? effSpan(refBase, rr.i, blk) : rr.spans[blk];
                            if (!rsp) return null;
                            const other = kind === 'geree' ? tr('Төлөвлөгөө') : tr('Гэрээ');
                            return (
                              <div
                                className={h.plRef}
                                style={{ left: xOf(rsp.start), width: Math.max(6, spanDays(rsp) * px - 1) }}
                                title={`${other}: ${msToDay(rsp.start)} → ${msToDay(rsp.end)} (${tr('{0} хоног', spanDays(rsp))})`}
                              />
                            );
                          })()}
                          {/*
                            * БОДИТ МУЖ (2026-09-23) — мөрийн ХАМГИЙН ДООД захад 3px нарийн
                            * зурвас: бодит эхэлсэн → бодит дууссан (дуусаагүй бол → өнөөдөр,
                            * тасархай хэлбэрээр — «үргэлжилж байна»). `plRef`-ийн ижил ёс:
                            * `pointer-events: none`, чирэгдэхгүй, засагдахгүй (popup-аас).
                            * ⚠️ Төлөвлөгөөт зурвастай ЗЭРЭГЦЭНЭ — зөрүү нь хэвтээ шилжилтээр
                            *    уншигдана. Бодит огноогүй бол ЮУ Ч зурахгүй (`null ≠ 0`).
                            * ⚠️ Бүлгийн мөрд хүүхдийн MIN/MAX (`aggExtra`).
                            */}
                          {hasActual && (() => {
                            const x = r.group ? effRow(r) : r;
                            const as0 = x.aStart?.[blk] ?? null;
                            if (as0 == null) return null;
                            const ae0 = x.aEnd?.[blk] ?? null;
                            const to2 = ae0 ?? Math.max(as0, now);
                            return (
                              <div
                                className={`${h.plAct} ${ae0 == null ? h.plActOpen : ''}`}
                                style={{ left: xOf(as0), width: Math.max(4, spanDays({ start: as0, end: to2 }) * px - 1) }}
                                title={`${tr('Бодит')}: ${msToDay(as0)} → ${ae0 != null ? msToDay(ae0) : tr('үргэлжилж байна')}`}
                              />
                            );
                          })()}
                          {showOld && oldSp && (
                            <div
                              className={`${h.plRef} ${h.plOld}`}
                              style={{ left: xOf(oldSp.start), width: Math.max(6, spanDays(oldSp) * px - 1) }}
                              title={`${tr('Одоогийн (батлагдсан)')}: ${msToDay(oldSp.start)} → ${msToDay(oldSp.end)} (${tr('{0} хоног', spanDays(oldSp))})`}
                            />
                          )}
                          {sp && (
                            <div
                              className={`${h.plBar} ${half ? h.plBarHalf : ''} ${r.group ? h.plBarG : ST_CLASS[st]} ${sel === r.oid ? h.tlBarOn : ''} ${viol ? h.plBarViol : ''}`}
                              style={{ left: xOf(sp.start), width: Math.max(10, spanDays(sp) * px - 1) }}
                              onPointerDown={(e) => onDown(e, r, 'move')}
                              aria-label={`${r.work || r.no} · ${sc.bld[blk]} · ${msToDay(sp.start)} → ${msToDay(sp.end)}`}
                              title={`${r.work}\n${sc.bld[blk]} · ${msToDay(sp.start)} → ${msToDay(sp.end)} (${tr('{0} хоног', spanDays(sp))}) · ${stText(st)}`}
                            >
                              {/* ⚠️ Бариул нь зөвхөн АЖЛЫН зурваст: бүлгийнх
                                  бодогдох тул сунгах утгагүй. */}
                              {!r.group && (
                                <span className={h.plGrip} onPointerDown={(e) => onDown(e, r, 'l')} />
                              )}
                              {/* ⚠️ БҮТЭН ОГНОО (2026-09-01, хэрэглэгч): урьд нь «09-12→11-13»
                                  гэж жилгүй байв. Хуанли 2025–2028 оныг дамждаг тул жилгүй
                                  огноо аль жилийнх нь нь тодорхойгүй байсан. Дөрвөн шат:
                                  нэр+бүтэн огноо → бүтэн огноо → он-сар → хоног → юу ч үгүй.

                                  ⚠️ АЖЛЫН НЭР зөвхөн ХАМГИЙН ӨРГӨН зурваст (2026-09-02,
                                  хэрэглэгч). Огноо нь ~120px эзэлдэг тул нэрийг доогуур
                                  шатанд нэмбэл гурав дөрвөн үсэг + «…» л үлдэж, мэдээлэл
                                  өгөхийн оронд огноог л түлхэж гаргана. Нэр нь агшиж
                                  (`plBarName` ellipsis), огноо нь агшихгүй. */}
                              {/*
                                * ⚠️ ОГНОО ДЭЭР ДООР (2026-09-11, хэрэглэгч): эхлэх огноо
                                *    ДЭЭД мөрөнд, дуусах огноо ба хоног ДООД мөрөнд. Зурвас
                                *    22px тул 9.5px үсэг хоёр мөр багтана; нэг мөрт «→»-өөр
                                *    бичихэд 178px шаарддаг байсныг богиносгож, дунд урттай
                                *    зурвас ч бүтэн огноотой болов. Чирэхэд `sp` шинэчлэгдэх
                                *    тул огноо шууд дагана.
                                * ⚠️ «Зэрэг» асаалттай (`showRef`) үед зурвас 11px — хоёр
                                *    мөр багтахгүй тул хуучин нэг мөрийн шатлал үлдэнэ.
                                *
                                * ⚠️ БОСГО 100px (2026-09-15-ны аудит). Урьд нь 66px байсан
                                *    нь ДООД мөрийн бодит өргөнөөс бага: «2026-04-18 · 187х»
                                *    нь 9.5px tabular-nums дээр ~94px, дээр нь `.plBar`-ын
                                *    хоёр `plGrip` ба хүрээ ~6px иднэ. `white-space: nowrap`
                                *    + `overflow: hidden` тул илүү нь ellipsis-гүй ТАСАРЧ,
                                *    «2026-04-1» гэж хагас огноо гардаг байв. Доод шат
                                *    (118px `short()`) -аас бага байх ёстой тул 100px.
                                */}
                              {!half && spanDays(sp) * px > 100 ? (
                                <span className={`${h.plBarLab} ${h.plBarTwo}`}>
                                  {spanDays(sp) * px > 250 && (
                                    <span className={h.plBarName}>{r.work || r.no}</span>
                                  )}
                                  <span className={h.plBarWhen}>
                                    <span>{msToDay(sp.start)}</span>
                                    <span>{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}</span>
                                  </span>
                                </span>
                              ) : spanDays(sp) * px > 250 ? (
                                <span className={h.plBarLab}>
                                  <span className={h.plBarName}>{r.work || r.no}</span>
                                  <span className={h.plBarWhen}>
                                    {msToDay(sp.start)}→{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}
                                  </span>
                                </span>
                              ) : spanDays(sp) * px > 178 ? (
                                <span className={h.plBarLab}>
                                  {msToDay(sp.start)}→{msToDay(sp.end)} · {spanDays(sp)}{tr('х')}
                                </span>
                              ) : spanDays(sp) * px > 118 ? (
                                <span className={h.plBarLab}>
                                  {short(sp.start)}→{short(sp.end)} · {spanDays(sp)}{tr('х')}
                                </span>
                              ) : spanDays(sp) * px > 40 ? (
                                <span className={h.plBarLab}>{spanDays(sp)}{tr('х')}</span>
                              ) : null}
                              {!r.group && (
                                <span className={`${h.plGrip} ${h.plGripR}`}
                                  onPointerDown={(e) => onDown(e, r, 'r')} />
                              )}
                              {/* ХОЛБОХ БАРИУЛ — баруун захын дугуй; чирээд нөгөө мөр дээр тавина (2026-09-22).
                                  ⚠️ Бүлгийн зурваст ч бий — бүлэг урд ажил болж чадна (`effSpan`).
                                  ⚠️ (2026-09-23) ЗӨВХӨН төлөвлөгөө табд — гэрээ гинжээр хөдөлдөггүй. */}
                              {canEdit && !locked && kind === 'plan' && (
                                <span className={h.plLink}
                                  onPointerDown={(e) => startLink(e, r)}
                                  title={tr('Хамаарал холбох — чирээд дараагийн ажлын мөр дээр тавина (FS)')} />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* ── УЯЛДААНЫ СУМУУД ──
                        ⚠️ Зурвасуудын ДЭЭР давхарласан SVG, `pointer-events:
                        none` — чирэлт, товшилтод огт саад болохгүй. Сум нь
                        зөвхөн ХОЁУЛАА харагдаж буй мөрүүдийн хооронд зурагдана:
                        шүүлт/эвхэлтэд нуугдсан үзүүр рүү зурвал агаарт дүүжлэгдэнэ. */}
                    {(arrows.length > 0 || link) && (
                      /* ⚠️ (2026-09-23) `depSvgLink` — холбох чирэлтийн үед `depHit`-ийн
                         pointer-events унтарна: эс бөгөөс сумны зурвас дээр суллахад
                         `elementFromPoint` сумыг онож, мөр олдохгүй. */
                      <svg className={`${h.depSvg} ${link ? h.depSvgLink : ''}`} width={W} height={visible.length * PL_ROW} aria-hidden>
                        <defs>
                          {[h.depArrN, h.depArrH, h.depArrB].map((c, k) => (
                            <marker key={c} id={`hvDepArr${k}`} viewBox="0 0 6 6" refX="5" refY="3"
                              markerWidth="5.5" markerHeight="5.5" orient="auto">
                              <path d="M0 0 L6 3 L0 6 z" className={c} />
                            </marker>
                          ))}
                        </defs>
                        {arrows.map((a2) => (
                          <g key={a2.key}>
                            <path d={a2.d} className={a2.cls} markerEnd={a2.mk} />
                            {/* ⚠️ ХОЛБООС ДЭЭР ДАРЖ ЗАСАХ/УСТГАХ (2026-09-22, хэрэглэгч: «хамаарлыг
                                устгаж чадахгүй байна»). SVG нь pointer-events: none (чирэлтэд саад
                                болохгүй) тул ЗӨВХӨН энэ тунгалаг өргөн зурвас (`depHit`) дарагдана —
                                нарийн шугамыг онох шаардлагагүй. Цонх нь ижил LinkModal, «Уялдаа
                                устгах» товчтой.
                                ⚠️ (2026-09-23) ЗӨВХӨН төлөвлөгөө табд (`kind === 'plan'`) — гэрээнд
                                уялдаа засахгүй. Зурвас (`.plBar`) нь CSS-ээр SVG-ээс ДЭЭШ тул
                                зурвасын дээрх даралт зурвасд очно; сум зөвхөн хоосон талбайд дарагдана. */}
                            {canEdit && !locked && kind === 'plan' && (
                              <path d={a2.d} className={h.depHit}
                                onClick={(e) => { e.stopPropagation(); setLinkAsk({ so: plan[a2.si].oid, to: plan[a2.ti].oid, dblk: a2.dblk }); }}>
                                <title>{tr('Дарж засах / устгах')}</title>
                              </path>
                            )}
                          </g>
                        ))}
                        {/* ТҮР ШУГАМ — холбох чирэлтийн үед урд ажлын баруун захаас курсор хүртэл */}
                        {link && (() => {
                          const k = visible.findIndex((v) => v.i === link.i);
                          const ps = k >= 0 ? effSpan(plan, link.i, blk) : null;
                          if (!ps) return null;
                          const sx = xOf(ps.end + DAY);
                          const sy = k * PL_ROW + PL_ROW / 2;
                          return <path d={`M ${sx} ${sy} L ${link.x} ${link.y}`} className={h.depDraft} markerEnd="url(#hvDepArr1)" />;
                        })()}
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      {linkAsk && linkRows && (
        <LinkModal
          src={linkRows.s}
          dst={linkRows.t}
          blk={linkAsk.dblk}
          blocks={sc?.bld ?? []}
          onClose={() => setLinkAsk(null)}
          onRemove={() => {
            const { s, t } = linkRows;
            setLinkAsk(null);
            if (s.des == null) return;
            /* ⚠️ Ялгах тэмдэг (код, блок) — 2026-09-24: ижил кодын өөр блокийн уялдаа хэвээр.
               Хоосон болвол `[]` — «цэвэрлэ» гэсэн утга (`null` = хөндөхгүй). */
            const id = { code: s.des, blk: linkAsk.dblk ?? undefined };
            applyModal(t.oid, null, t.deps.filter((d) => !sameDep(d, id)), null);
          }}
          onApply={(type, lag) => {
            const { s, t } = linkRows;
            setLinkAsk(null);
            if (s.des == null) return;
            /* Ижил (код, блок)-ийн хуучин уялдааг сольж бичнэ — нэг хос нэг удаа. */
            const id = { code: s.des, blk: linkAsk.dblk ?? undefined };
            const dep: Dep = { code: s.des, type, lag, ...(linkAsk.dblk != null ? { blk: linkAsk.dblk } : {}) };
            applyModal(t.oid, null, [...t.deps.filter((d) => !sameDep(d, id)), dep], null);
          }}
        />
      )}

      {modalRow && sc && (
        <PlanModal
          r={modalRow}
          par={modalPar}
          blocks={sc.bld}
          blk={blk}
          takt={takt}
          /* ⚠️ `locked` — хүлээгдэж буй илгээлт байхад popup-аас ч засахгүй.
             Зөвхөн `onDown`-г түгжвэл хуанлийн цонх нээлттэй хэвээр үлдэнэ. */
          canEdit={canEdit && !locked}
          onBlk={setBlk}
          onTakt={setTakt}
          cands={depCands}
          hasHam={!!sc.f.ham}
          hasActual={hasActual}
          hasRes={hasRes}
          months={obOf(modalRow.des, sc.bld[blk] ?? "")}
          res={obResOf(modalRow.des, sc.bld[blk] ?? "")}
          resFields={obResFields}
          /*
           * ⚠️ ЦУЦЛАХАД ЧИРЭЛТ БУЦНА (2026-09-08). Цонх нь чирэлтийн ДАРАА
           *    нээгддэг тул хуваарь аль хэдийн ноорогт бичигдсэн байдаг;
           *    «Хаах»/X/Esc/дэвсгэр дарахад түүнийг сэргээнэ. Эс бөгөөс
           *    хэрэглэгч цуцалсан гэж бодоод хуваарь нь үлдэнэ.
           */
          onClose={() => {
            const u = undoRef.current;
            undoRef.current = null;
            setModal(null);
            if (u && !busy && !locked) {
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
          }}
          onApply={(spans, deps, ob, actual, res, blks) => {
            /* ⚠️ ЗӨВШӨӨРӨГДСӨН өөрчлөлт — буцаах мэдээллийг цэвэрлэнэ,
               эс бөгөөс дараагийн `onClose` түүнийг эргүүлж хаяна. */
            undoRef.current = null;
            applyModal(modalRow.oid, spans, deps, ob, blks);
            /* Бодит огноо · нөөц — гинжээс гадуур, ноорогт л (2026-09-23).
               ⚠️ Бодит огноо ЗӨВХӨН идэвхтэй блокт (2026-09-24 аудит): энэ нь
                  БҮРТГЭЛ, төлөвлөгөө биш — сонгосон бүх блокт хуулбал хараахан
                  эхлээгүй блок «эхэлсэн» болно. `blks` нь муж/сар/нөөцийнх. */
            applyExtra(modalRow.oid, [blk], actual, res);
          }}
        />
      )}

      {flowBox === 'send' && (
        <FlowBox
          title={tr('Хуваарь батлуулах')}
          desc={tr('{0} мөрийн өөрчлөлт батлагчид илгээгдэнэ. Батлагдтал эх хуваарь хөдлөхгүй.', num(dirtyN))}
          label={tr('Тайлбар (сонголтоор)')}
          okText={tr('Илгээх')}
          busy={busy}
          err={err}
          text={flowTxt}
          onText={setFlowTxt}
          onClose={() => setFlowBox(null)}
          onOk={(txt) => void sendForApproval(txt)}
        />
      )}
      {flowBox === 'decide' && pending && (
        <FlowBox
          title={tr('Хуваарь шийдвэрлэх')}
          desc={tr('{0} мөрийн хуваарийг {1} илгээв.', num(pending.rowCount), pending.author)
            + (pending.note ? ` — «${pending.note}»` : '')
            + (previewing
              ? ` ${tr('Санал хуанли дээр харагдаж байна.')}`
                /* ⚠️ Мөр бүрийн ногоон дүрэм (2026-09-25 аудит) — тоог харуулна */
                + (reviewOids.length ? ` ${tr('Зөвшөөрсөн {0}/{1} мөр', num(reviewOk), num(reviewOids.length))}` : '')
              : ` ${tr('⚠️ Хараахан урьдчилан хараагүй байна — «Урьдчилан харах»-аар шалгаж болно.')}`)}
          label={tr('Буцаах шалтгаан (буцаахад заавал)')}
          okText={tr('Батлах')}
          /* ⚠️ Буцаахад шалтгаан ЗААВАЛ — `decidePlan` ч мөн шалгана. Шалтгаангүй
             буцаалт нь гүйцэтгэгчид юуг засахыг хэлэхгүй тул давталт үүсгэнэ. */
          rejectText={tr('Буцаах')}
          busy={busy}
          err={err}
          text={flowTxt}
          onText={setFlowTxt}
          /* ⚠️ Цонхон дотроос УРЬДЧИЛАН ХАРАХ (2026-09-23): «хараагүй» гэж
             сануулаад цонхыг хааж товч хайлгадаг байв. `preview` амжилттай бол
             цонхыг өөрөө хаана. */
          onPreview={previewing ? undefined : () => void preview()}
          onClose={() => setFlowBox(null)}
          onOk={() => void decide(true, '')}
          onReject={(txt) => void decide(false, txt)}
        />
      )}
      {flowBox === 'reject' && pending && (
        <FlowBox
          title={tr('Хуваарь буцаах')}
          desc={reviewOids.length
            ? tr('Зөвшөөрсөн {0}/{1} мөр. Зөвшөөрөөгүй мөрүүд шалтгаанд автоматаар жагсагдаж, гүйцэтгэгчид УЛААН болж харагдана.', num(reviewOk), num(reviewOids.length))
            : tr('{0} мөрийн хуваарийг {1} илгээв.', num(pending.rowCount), pending.author)}
          label={tr('Буцаах шалтгаан (заавал)')}
          okText={tr('Буцаах')}
          busy={busy}
          err={err}
          text={flowTxt}
          onText={setFlowTxt}
          onClose={() => setFlowBox(null)}
          onOk={(txt) => rejectReview(txt)}
        />
      )}
    </div>
  );
}

/* ══════════════════ Батлах урсгалын цонх ══════════════════ */

/**
 * ИЛГЭЭХ / ШИЙДВЭРЛЭХ цонх — нэг бүрэлдэхүүн хоёуланд.
 *
 * ⚠️ `PlanModal`-ийн CSS ангиудыг ДАХИН ашиглана: хоёр өөр загвартай цонх нь
 *    нэг хуудсанд танигдахгүй болно.
 */
function FlowBox({
  title, desc, label, okText, rejectText, busy, err, text, onText, onPreview, onClose, onOk, onReject,
}: {
  title: string; desc: string; label: string; okText: string;
  rejectText?: string; busy: boolean;
  /** ⚠️ Текст ЭЦЭГТ хадгалагдана — ард нь дарж/Esc-ээр хаахад устахгүй (2026-09-23) */
  text: string;
  onText: (v: string) => void;
  /** Шийдвэрлэх цонхны «Урьдчилан харах» — өгөгдсөн үед л товч гарна */
  onPreview?: () => void;
  /**
   * ⚠️ АЛДААГ ЦОНХ ДОТОР (2026-09-21). Урсгалын алдаанууд (`setErr`: тэнцээгүй
   *    задаргаа, эрхгүй, агуулга уншигдсангүй, төрөл зөрсөн, зэрэгцээ өөрчлөлт)
   *    цонхыг хаадаггүй тул хуудасны баннер модалын АРД гарч, хэрэглэгч товч
   *    дарсан атлаа юу ч болоогүй мэт хардаг байв. Хуудасны баннер хэвээр —
   *    цонх хаагдсаны дараа ч уншигдана.
   */
  err?: string;
  onClose: () => void;
  onOk: (text: string) => void;
  onReject?: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  const txt = text;
  const setTxt = onText;
  /* ⚠️ Esc → хаах (2026-09-23), `PlanModal`-тай ижил. Хуудасны нийтлэг Esc нь
     `[role=dialog]` нээлттэй үед юу ч хийдэггүй тул энд өөрөө барина. */
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className={h.mdBack} role="presentation" onClick={onClose}>
      <div ref={ref} className={h.md} role="dialog" aria-modal="true"
        onClick={(e) => e.stopPropagation()}>
        <header className={h.mdHead}>
          <b className={h.mdWork}>{title}</b>
          <button type="button" className={h.mdX} onClick={onClose} aria-label={tr('Хаах')}>×</button>
        </header>
        <p className={h.note}>{desc}</p>
        {err && <p className={h.err} role="alert">{err}</p>}
        <label className={h.mdField}>
          {label}
          <textarea
            className={h.flowText}
            rows={3}
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            disabled={busy}
          />
        </label>
        <div className={h.mdFoot}>
          {onPreview && (
            <button type="button" className={h.discard} disabled={busy} onClick={onPreview}>
              {tr('Урьдчилан харах')}
            </button>
          )}
          <span className={h.spacer} />
          {onReject && (
            <button
              type="button"
              className={h.discard}
              disabled={busy || !txt.trim()}
              title={txt.trim() ? undefined : tr('Буцаах шалтгааныг бичнэ үү.')}
              onClick={() => onReject(txt)}
            >
              {rejectText}
            </button>
          )}
          <button type="button" className={h.save} disabled={busy} onClick={() => onOk(txt)}>
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ⚠️ «ХУВААРИЙН ХАМРАЛТ» самбар 2026-09-02-нд ХАСАГДСАН (хэрэглэгч).
   `coverageOf()` нь ХЭВЭЭР — шүүлтийн «Хуваарьтай / Хуваарьгүй» табууд
   түүний тоог уншсаар байна, зөвхөн толгойн үзүүлэлт л алга болов. */

/* ══════════════════ Ажлын мөр (зүүн багана) ══════════════════ */

function TaskRow({
  r, on, dirty, collapsed, onToggle, onPick, geree, tolov, canEdit, onHamText,
  hasActual, hasRes, aStart, aEnd, hun, mashin, added, onAdd, onDrop, mark, onMark, children,
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
   * ⚠️ Хоёулаа ЗАСАГДАХГҮЙ, зөвхөн уншина. Огноо засах зам нь хуанли дээр
   *    чирэх ба popup хэвээр — хоёр өөр засварын зам үүсвэл аль нь үнэн
   *    болох нь бүрхэг болно.
   * ⚠️ `null` = тэр төрөлд хуваарь ОГТ байхгүй → «—» (0 БИШ).
   */
  geree: Span | null;
  tolov: Span | null;
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
      <span className={h.rowDate} title={geree ? tr('Гэрээний эхлэх огноо') : undefined}>
        {geree ? msToDay(geree.start) : '—'}
      </span>
      <span className={h.rowDate} title={geree ? tr('Гэрээний дуусах огноо') : undefined}>
        {geree ? msToDay(geree.end) : '—'}
      </span>
      {/* ⚠️ ҮРГЭЛЖЛЭХ ХОНОГ — ТУСДАА багана (2026-09-15, хэрэглэгч).
          `spanDays` нь ХОЁР ҮЗҮҮРИЙГ ОРУУЛЖ тоолно (эхлэх ба дуусах өдөр
          хоёулаа ажлын өдөр) — хуанлийн зурвасын шошготой ЯГ ижил тоо. */}
      <span className={h.rowDays} title={geree ? tr('Гэрээгээр үргэлжлэх хоног') : undefined}>
        {geree ? spanDays(geree) : '—'}
      </span>
      <span className={h.rowDate} title={tolov ? tr('Төлөвлөгөөт эхлэх огноо') : undefined}>
        {tolov ? msToDay(tolov.start) : '—'}
      </span>
      <span className={h.rowDate} title={tolov ? tr('Төлөвлөгөөт дуусах огноо') : undefined}>
        {tolov ? msToDay(tolov.end) : '—'}
      </span>
      <span className={h.rowDays} title={tolov ? tr('Төлөвлөгөөгөөр үргэлжлэх хоног') : undefined}>
        {tolov ? spanDays(tolov) : '—'}
      </span>
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
      <HamCell r={r} canEdit={canEdit && !added} onText={onHamText} onPick={added ? undefined : onPick} />
      {children}
    </div>
  );
}

/* ══════════════════ ШИНЭ АЖЛЫН МАЯГТ (2026-09-24) ══════════════════ */

/**
 * Бүлгийн доор нээгдэх маягт — № · Ажлын нэр · Обьём · Нэгж өртөг (FillNew-ийн
 * 2026-09 маягтын хуулбар). ⚠️ Жин ба Мөнгөн дүн ЭНД БАЙХГҮЙ — Обьём×Нэгж
 * өртгөөс батлагдсаны дараа `computeAll` өөрөө бодно.
 * ⚠️ `role="dialog"`: `wide`-ийн Esc сонсогч диалог нээлттэй үед бүтэн дэлгэцийг
 *    хаадаггүй — Esc энд маягтыг л хаана.
 */
function AddBox({ parent, form, onForm, onOk, onCancel }: {
  parent: PlanRow;
  form: AddForm;
  onForm: (f: AddForm) => void;
  onOk: () => void;
  onCancel: () => void;
}) {
  const first = useRef<HTMLInputElement | null>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const key = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'Enter') { e.preventDefault(); onOk(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };
  const field = (k: keyof AddForm, cls: string, label: string, decimal = false, ref?: typeof first) => (
    <input ref={ref} className={cls} value={form[k]} placeholder={label} aria-label={label}
      inputMode={decimal ? 'decimal' : undefined}
      onChange={(e) => onForm({ ...form, [k]: e.target.value })} onKeyDown={key} />
  );
  return (
    <div className={h.addPop} role="dialog" aria-label={tr('«{0}» дотор шинэ ажил', parent.work)}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <span className={h.addTitle}>{tr('«{0}» дотор шинэ ажил', parent.work)}</span>
      {field('no', h.addNo, tr('№'), false, first)}
      {field('work', h.addWork, tr('Ажлын нэр'))}
      {field('vol', h.addNum, tr('Обьём'), true)}
      {field('unit', h.addNum, tr('Нэгж өртөг'), true)}
      <button type="button" className={h.addOk} onClick={onOk}>{tr('Нэмэх')}</button>
      <button type="button" className={h.addNo2} onClick={onCancel}>{tr('Болих')}</button>
      <span className={h.addHint}>
        {tr('Обьём ба нэгж өртөг сонголттой — хоосон бол жин бодогдохгүй (—), бусад мөрийн жин хөдлөхгүй. Шинэ мөр бүлгийн эхэнд, улаанаар орно.')}
      </span>
    </div>
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
  r, canEdit, onText, onPick,
}: {
  r: PlanRow;
  canEdit: boolean;
  onText: (oid: number, text: string) => void;
  /** `undefined` = popup нээгдэхгүй (батлагдаагүй нэмэлт мөр) */
  onPick?: () => void;
}) {
  const saved = r.deps.length ? formatDeps(r.deps) : '';
  const [txt, setTxt] = useState(saved);
  /* Escape-ээр цуцалсан бол `onBlur`-ийн хадгалалтыг алгасах туг (2026-09-17) */
  const cancelRef = useRef(false);
  const [edit, setEdit] = useState(false);

  /* ⚠️ Гаднаас өөрчлөгдвөл (popup, чирэлтийн гинж, ноорог сэргээх) оролтыг
     дагуулна — ЗӨВХӨН засаж БАЙХГҮЙ үед, эс бөгөөс бичиж байхад нь дарна. */
  useEffect(() => { if (!edit) setTxt(saved); }, [saved, edit]);

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
        value={txt}
        aria-label={tr('Хамаарал')}
        /* ⚠️ `placeholder` БАЙХГҮЙ (2026-09-15, хэрэглэгч: «бүгд 11FS14
           болчихлоо — энэ жишээ шүү дээ»). Хоосон нүд бүрд жишээ бичиглэл
           харагдвал бодит утга мэт уншигдаж, 1,400 мөр «11FS14»-ээр дүүрсэн
           дүр зураг гарна. Жишээг ЗӨВХӨН `title` (hover) ба толгойн зааварт. */
        title={tr('Жишээ: 11FS14 — 11-р ажил дууссанаас 14 хоногийн дараа. Олныг таслалаар: 11FS,22SS-5. @2 = зөвхөн 2-р блок (@-гүй = бүх блок)')}
        onChange={(e) => { setEdit(true); setTxt(e.target.value); }}
        onFocus={() => setEdit(true)}
        onBlur={() => { setEdit(false); if (!cancelRef.current) onText(r.oid, txt); cancelRef.current = false; }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.currentTarget.blur(); return; }
          /* ⚠️ Escape = ЦУЦЛАХ: `blur()` синхрон тул `onBlur` хуучин `txt`-ээр хадгалдаг
             байв (2026-09-17). Тугаар хаана. */
          if (e.key === 'Escape') { cancelRef.current = true; setTxt(saved); setEdit(false); e.currentTarget.blur(); }
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

/* ══════════════════ POPUP ХУАНЛИ ══════════════════ */

/**
 * Ажлын нэр дээр дарахад нээгдэх ЦОНХ — огноог ТООГООР оруулна.
 *
 * ⚠️ ЯАГААД ЧИРЭЛТЭЭС ГАДНА (2026-09-01, хэрэглэгчийн заавар): чирэлт нь
 * харьцангуй бөгөөд «сар» томруулалт дээр 1 пиксель = 1 хоног тул «яг
 * 2026-05-04» гэж тавихад тохиромжгүй. Гэрээнд заасан огноог оруулах, эсвэл
 * блок бүрд нэг дор тараахад энэ цонх хэрэгтэй.
 *
 * ⚠️ ХОНОГ нь эхлэх/дуусахаас БОДОГДОНО (хоёр захыг оруулаад). Гурав дахь
 * талбар болгож оруулбал гурвуулаа зөрчилдөх боломжтой болно.
 */
function PlanModal({
  r, par, blocks, blk, takt, canEdit, onBlk, onTakt, cands, hasHam, hasActual, months, res, resFields, onClose, onApply,
}: {
  r: PlanRow;
  /** Хамгийн ойрын дээд БҮЛЭГ — түүний муж нь хатуу хязгаар */
  par: PlanRow | null;
  blocks: string[];
  blk: number;
  takt: number;
  canEdit: boolean;
  onBlk: (b: number) => void;
  onTakt: (v: number) => void;
  /** Урьдчилагчийн нэр дэвшигчид — дугуй хамаарал үүсгэгчид ХАСАГДСАН */
  cands: { code: number; label: string }[];
  /** Үйлчилгээнд `Hamaaral` талбар бий эсэх — үгүй бол уялдааны хэсэг нуугдана */
  hasHam: boolean;
  /** Бодит огноо · нөөцийн талбар үйлчилгээнд бий эсэх (2026-09-23) — үгүй бол хэсэг нуугдана */
  hasActual: boolean;
  /** ⚠️ Хадгалагдана — дуудагч дамжуулдаг; popup-д мөрийн нөөц засагдахгүй болсон (2026-09-24) */
  hasRes?: boolean;
  /** ЭНЭ блокийн хадгалагдсан/ноорог сарын задаргаа */
  months: Map<string, number>;
  /** ЭНЭ блокийн хадгалагдсан/ноорог сарын НӨӨЦ (2026-09-24) */
  res: Map<string, MonthRes>;
  /** Сарын хүснэгтэд нөөцийн талбар бий эсэх — `false` бол анхааруулна (`null` = мэдэхгүй) */
  resFields: { hun: boolean | null; mashin: boolean | null };
  onClose: () => void;
  /**
   * «Тавих»/«Арилгах» — огноо · уялдаа · сарын обьём+нөөц · бодит огноо · нөөц
   * НЭГ алхамд (null = хөндөхгүй). `blks` — сонгосон блокууд (2026-09-24):
   * `spans` тэдгээрт аль хэдийн тавигдсан; `ob` тэдгээрт хуулагдана;
   * `actual` нь ЗӨВХӨН идэвхтэй `blk`-д (бүртгэл, 2026-09-24 аудит).
   * ⚠️ `actual`/`res` (2026-09-23) нь гинжээс ГАДУУР — дуудагч `applyExtra`-д өгнө.
   */
  onApply: (
    spans: (Span | null)[] | null,
    deps: Dep[] | null,
    ob: { months: Map<string, number> | null; res: Map<string, MonthRes> | null } | null,
    actual: { start: number | null; end: number | null } | null,
    res: { hun: number | null; mashin: number | null } | null,
    blks: number[],
  ) => void;
}) {
  /* ⚠️ ФОКУСЫН УРХИ (2026-09-03-ны аудит): `aria-modal` нь дэлгэц уншигчид л
     хэлдэг, хөтчийн Tab-д нөлөөгүй — урхигүй үед Tab дарсаар байхад фокус
     цонхноос гарч ард байгаа 1,400 мөрт төөрдөг байв. */
  const mdRef = useRef<HTMLDivElement>(null);
  useFocusTrap(mdRef);

  /* ⚠️ ТАЛБАР ТАВИХ ЭФФЕКТҮҮД `r.oid`/`blk`-ЭЭР (2026-09-24): хуваалцсан ноорогийн
     3 с мөчлөг `setDraft(new Map)` хийхэд `r` объект дахин үүсч, бичиж байх
     үед талбарууд тэглэгдэж байв. Мөр (oid) ба блок солигдоход л тавина. */
  const [a, setA] = useState('');
  const [z, setZ] = useState('');
  /**
   * СОНГОСОН БЛОКУУД (2026-09-24, хэрэглэгч: «блокийг олноор сонгож нэг
   * төлөвлөлтийг зэрэг тавина»). Идэвхтэй `blk` (огноо/сарын суурь эндээс)
   * ҮРГЭЛЖ дотор нь. Мөр солиход зөвхөн идэвхтэй блок үлдэнэ. «Бүх блокт»
   * checkbox-ыг орлоно.
   * ⚠️ Чип НЭМЭХЭД идэвхтэй блок СОЛИГДОХГҮЙ (2026-09-24 аудит): урьд нь сүүлд
   *    сонгосон нь идэвхтэй болдог тул `blk`-ээр түлхүүрлэсэн эффектүүд
   *    (огноо, бодит огноо, сар/нөөц) бичсэн утгыг тэглэж байв. Зөвхөн
   *    идэвхтэйг нь хасахад л хамгийн доод үлдсэн блок руу шилжинэ.
   */
  const [selB, setSelB] = useState<Set<number>>(() => new Set([blk]));
  useEffect(() => { setSelB(new Set([blk])); }, [r.oid]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSelB((s) => (s.has(blk) ? s : new Set([...s, blk]))); }, [blk]);
  const toggleB = (k: number) => {
    if (!dEdit) { onBlk(k); return; }
    setSelB((s) => {
      const next = new Set(s);
      if (next.has(k)) {
        /* Сүүлчийнхийг хасахгүй — хоосон сонголтод «Тавих» утгагүй */
        if (next.size === 1) return s;
        next.delete(k);
        if (k === blk) onBlk(Math.min(...next));
      } else {
        next.add(k);
      }
      return next;
    });
  };
  /** Уялдааны түр жагсаалт — «Тавих» дартал эх мөрөө хөндөхгүй */
  const [dl, setDl] = useState<Dep[]>(r.deps);
  useEffect(() => { setDl(r.deps); }, [r.oid]);   // eslint-disable-line react-hooks/exhaustive-deps
  /* ⚠️ Эх мөрийн уялдаа ЦОНХ НЭЭЛТТЭЙ байхад солигдвол (хуваалцсан нооргоос
     ирсэн г.м.) хэрэглэгч хөндөөгүй л бол дагуулна (2026-09-24 аудит) —
     урьд нь хуучин жагсаалт «Тавих»-аар буцаж бичигддэг байв. */
  const depsTxt = formatDeps(r.deps);
  const depsTxtPrev = useRef(depsTxt);
  useEffect(() => {
    if (depsTxtPrev.current === depsTxt) return;
    if (formatDeps(dl) === depsTxtPrev.current) setDl(r.deps);
    depsTxtPrev.current = depsTxt;
  }, [depsTxt]);   // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * БОДИТ ЭХЭЛСЭН / ДУУССАН (энэ блок) ба ХҮН ХҮЧ / МАШИН (мөр) — 2026-09-23.
   * ⚠️ Төлөвлөгөөт огнооноос ТУСДАА төлөв: бүлгийн мужаар урьдчилан
   *    бөглөхгүй, «мужаар нь авах» нөлөөлөхгүй, `all` (бүх блокт тараах)
   *    хамаарахгүй — бодит нь бүртгэл, таамаглахгүй. Хоосон = `null`.
   */
  const [aa, setAa] = useState('');
  const [az, setAz] = useState('');
  useEffect(() => {
    const s = r.aStart?.[blk] ?? null;
    const e = r.aEnd?.[blk] ?? null;
    setAa(s != null ? msToDay(s) : '');
    setAz(e != null ? msToDay(e) : '');
  }, [r.oid, blk]);   // eslint-disable-line react-hooks/exhaustive-deps
  const am1 = dayToMs(aa);
  const am2 = dayToMs(az);
  const aBad = am1 != null && am2 != null && am1 > am2;
  const actDirty = (am1 ?? null) !== (r.aStart?.[blk] ?? null) || (am2 ?? null) !== (r.aEnd?.[blk] ?? null);
  /* ⚠️ МӨРИЙН хүн/машин popup-аас ЗАСАГДАХГҮЙ (2026-09-24, хэрэглэгч: «дээд талын
     үндсэн хүн хүч машин механизм бөглөлт хэрэггүй, сар сард төлөвлөнө») — мөрийн
     утга нь хадгалахад саруудын нийлбэрээр бичигдэнэ (`save`). */
  const extraDirty = actDirty && !aBad;
  /** Popup-аас `onApply`-д өгөх бодит огноо · нөөц — хөндөөгүй бол `null` */
  const actArg = actDirty && !aBad ? { start: am1, end: am2 } : null;

  /**
   * Блок эсвэл мөр солигдвол талбарууд дагаж шинэчлэгдэнэ.
   *
   * ⚠️ ХУВААРЬГҮЙ АЖИЛД БҮЛГИЙН МУЖИЙГ УРЬДЧИЛЖ ТАВИНА (2026-09-01,
   *    хэрэглэгч: «том бүлгийнх нь он сарыг шууд авна, тэгээд түүн дээрээ
   *    өөрчилнө»). Хоосон талбараас эхлэх нь утгагүй ажил: бүлгийн муж
   *    аль хэдийн мэдэгдэж байгаа бөгөөд хүүхэд нь ямар ч тохиолдолд
   *    түүний дотор багтана. Одоо байгаа хуваарийг ХӨНДӨХГҮЙ — тэр нь
   *    бодит өгөгдөл, түүнийг «Бүлгийн мужаар» товчоор л дарж солино.
   */
  useEffect(() => {
    const own = r.spans[blk] ?? null;
    const p = par?.spans[blk] ?? null;
    /**
     * ⚠️ ХУУЧИРСАН ХУВААРИЙГ БАРЬЖ АВАХГҮЙ. Бүлгийн мужийг шинээр тавьсан
     *    үед хүүхдийн ХУУЧИН огноо тэр мужаас бүтнээ гадуур үлдэж болно
     *    (жиш. бүлэг 2026-09, хүүхэд 2025-08). Тэр хуучин утгыг талбарт
     *    буулгавал хэрэглэгч огт өөр жилийн огноо хараад эргэлзэнэ —
     *    хадгалахад ямар ч байсан мужид нь хавчуулагдана. Тиймээс мужаас
     *    ГАДУУР бол бүлгийн мужаар эхэлнэ.
     */
    const stale = !!(own && p && (own.end < p.start || own.start > p.end));
    const s = !own || stale ? p : own;
    setA(s ? msToDay(s.start) : '');
    setZ(s ? msToDay(s.end) : '');
  }, [r.oid, par?.oid, blk]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  /**
   * ОГНОО ЗАСАХ ЭРХ. Бүлгийн муж нь дэд ажлуудаасаа бодогддог
   * (2026-09-06) тул гараар засагдахгүй — уялдаа нь харин засагдана.
   */
  const dEdit = canEdit && !r.group;

  const ms1 = dayToMs(a);
  const ms2 = dayToMs(z);
  const bad = ms1 != null && ms2 != null && ms1 > ms2;
  const days = ms1 != null && ms2 != null && !bad ? spanDays({ start: ms1, end: ms2 }) : null;

  /**
   * ҮРГЭЛЖЛЭХ ХОНОГ — засварлагддаг талбар (2026-09-17, хэрэглэгчийн хүсэлт:
   * «эхлэх огноо сонгоод хоногоо бичихэд дуусах огноо автоматаар гарна»).
   * Текст төлөв `durTxt` нь a/z-ээс гарсан `days`-тай хоёр талдаа синк:
   *   · хоног бичихэд → `z = endOf(ms1, n)` (хоёр тал орсон, `plan.endOf`);
   *   · эхлэхийг өөрчлөхөд хоног хадгалагдсан бол дуусах дагаж хөдөлнө;
   *   · дуусахыг гараар өөрчлөхөд хоног дагаж шинэчлэгдэнэ (effect).
   */
  const [durTxt, setDurTxt] = useState('');
  useEffect(() => { setDurTxt(days != null ? String(days) : ''); }, [days]);
  const onDur = (v: string) => {
    setDurTxt(v);
    const n = Math.floor(Number(v));
    if (n >= 1 && ms1 != null) setZ(msToDay(endOf(ms1, n)));
  };
  const onStart = (v: string) => {
    setA(v);
    const s = dayToMs(v);
    const n = Math.floor(Number(durTxt));
    if (s != null && n >= 1) setZ(msToDay(endOf(s, n)));
  };

  /**
   * ЭНЭ блокийн бүлгийн муж — ЗӨВХӨН МЭДЭЭЛЭЛ.
   * ⚠️ 2026-09-06-нд ХЯЗГААР БАЙХАА БОЛИВ (хэрэглэгч: «бүлгийн range
   *    ажлын range-ээс хамаардаг болго»). Хавчилт (`clamp`), «хальсан»
   *    анхааруулга, огнооны талбарын `min`/`max` гурвуулаа ХАСАГДСАН —
   *    ажил чөлөөтэй тавигдаж, бүлэг нь дагаж сунана.
   */
  const pspan = par?.spans[blk] ?? null;

  /* ══════════ САРЫН ОБЬЁМ ══════════
   * ⚠️ Сарууд нь ТАЛБАРТ БИЧИГДСЭН огноогоор тодорхойлогдоно, хадгалагдсан
   *    мужаар БИШ: хэрэглэгч огноогоо засаж байхад сарын жагсаалт нь тэр
   *    даруй дагах ёстой. Эс бөгөөс «Тавих» дарах хүртэл өөр саруудыг
   *    бөглөж, дараа нь бүгд дахин тарааж хаягдана.
   */
  const total = r.vol != null && r.vol > 0 ? r.vol : null;
  const [mv, setMv] = useState<Map<string, number>>(months);
  /** Сарын НӨӨЦ (хүн хүч · машин) — `mv`-тэй зэрэгцээ (2026-09-24) */
  const [mr, setMr] = useState<Map<string, MonthRes>>(res);
  /**
   * Мөр/блок солигдоход ХАДГАЛАГДСАНАА суурь болгоно.
   *
   * ⚠️ ЭНЭ ЭФФЕКТ ДООХНООС ДЭЭГҮҮР БАЙХ ЁСТОЙ (2026-09-06-ны алдаа). React нь
   *    эффектүүдийг ЗАРЛАСАН дарааллаар ажиллуулдаг: тараах эффект түрүүлж
   *    ажиллавал энэ нь түүний үр дүнг тэр даруй ХООСОН `months`-оор дарж,
   *    цонх «Огноо оруулмагц сарууд өөрөө гарч ирнэ» дээр гацдаг байв —
   *    шинээр хуваарь татсан ажилд сарын хэсэг ХЭЗЭЭ Ч гарахгүй (огноо нь
   *    аль хэдийн бөглөгдсөн тул тараах эффект дахин ажиллах шалтгаангүй).
   *    Одоо: эхлээд суурь тавигдаж, дараа нь тараалт ФУНКЦЭЭР (`setMv(cur =>`)
   *    тэр суурин дээр ажиллана.
   */
  useEffect(() => { setMv(months); setMr(res); }, [r.oid, blk]);   // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * ЭНЭ МУЖИД ХАМААРАХ САРУУД — жагсаалтын эх сурвалж.
   * ⚠️ Утгыг АВТОМАТААР ТАРААХГҮЙ (2026-09-06, хэрэглэгчийн заавар): сар
   *    бүр ХООСОН гарч, хүн өөрөө бөглөнө. Тараасан тоо нь төлөвлөгөө мэт
   *    харагдах ч үнэндээ таамаг бөгөөд шалгалгүй хадгалагддаг.
   */
  const mKeys = useMemo(
    () => (ms1 == null || ms2 == null || bad ? [] : monthsOf({ start: ms1, end: ms2 })),
    [ms1, ms2, bad],
  );
  /* Мужаас ГАРСАН сарын утгыг хасна — эс бөгөөс нийлбэр хаанаас ч
     гараагүй тоогоор давна. */
  /* ⚠️ МУЖ ХООСОН бол ТАЙРАХГҮЙ (2026-09-25 аудит). Эхний зурагдалтад `a`/`z`
     нь '' (урьдчилан бөглөх эффект ДАРАА нь тавина) тул `mKeys = []` бөгөөд энэ
     эффект нэг flush-д `setMv(months)`-ийн ард ажиллаж хадгалагдсан БҮХ сарыг
     «мужаас гадуур» гэж арчдаг байв — цонх нээх бүрд сарын обьём/нөөц хоосорч,
     «Тавих» дарахад сарын хүн/машин устдаг байлаа. Огноо түр хоосон (засаж буй)
     үед ч сарын утга хадгалагдана; хүчинтэй муж тавигдмагц энэ эффект тайрна. */
  useEffect(() => {
    if (!mKeys.length) return;
    setMv((cur) => {
      let extra = false;
      for (const k of cur.keys()) if (!mKeys.includes(k)) { extra = true; break; }
      if (!extra) return cur;
      const out = new Map<string, number>();
      for (const k of mKeys) { const v = cur.get(k); if (v != null) out.set(k, v); }
      return out;
    });
    setMr((cur) => {
      let extra = false;
      for (const k of cur.keys()) if (!mKeys.includes(k)) { extra = true; break; }
      if (!extra) return cur;
      const out = new Map<string, MonthRes>();
      for (const k of mKeys) { const v = cur.get(k); if (v) out.set(k, v); }
      return out;
    });
  }, [mKeys]);
  /** Нэг сарын нөөцийн нэг талбарыг бичнэ — хоосон = `null`; хоёулаа null болвол сар Map-аас хасагдана.
      ⚠️ Тоо биш («abc») ч `null` (2026-09-24 аудит) — урьд нь 0 болж «тэг нөөц» гэж бичигддэг байв. */
  const setMrCell = (k: string, f: 'hun' | 'mashin', t: string) => {
    const s = t.trim();
    /* ⚠️ Сөрөг тоо ч `null` (2026-09-24 аудит) — урьд нь 0 болж «тэг нөөц» бичигддэг байв. */
    const nv = Number(s);
    const v = s === '' || !Number.isFinite(nv) || nv < 0 ? null : Math.floor(nv);
    setMr((m) => {
      const out = new Map(m);
      const cur = out.get(k) ?? { hun: null, mashin: null };
      const next = { ...cur, [f]: v };
      if (next.hun == null && next.mashin == null) out.delete(k); else out.set(k, next);
      return out;
    });
  };
  const mrSum = sumRes(mr);
  /** Сарын нөөц БАЙНА — мөрийн хүн/машин талбар зөвхөн харагдана (нийлбэр) */
  const mrHas = mrSum.hun != null || mrSum.mashin != null;
  const mrDirty = !sameRes(mr, res);
  /* ⚠️ Сарын нөөц байвал мөрийн талбарыг ХАДГАЛАХ ЗАМ өөрөө нийлбэрээр бичнэ (2026-09-24) */
  const resArg = null;

  const mvSum = sumMonths(mv);
  /* ⚠️ БҮХ сар бөглөгдсөн байх ёстой: нэг сар хоосон атлаа нийлбэр таарвал
     тэр сарын төлөвлөгөө өгөгдөлд ОГТ үүсэхгүй. */
  const mvFull = mKeys.every((k) => mv.get(k) != null);
  const mvOk = total == null || (mvFull && balanced(mv, total));
  const mvDiff = total == null ? 0 : mvSum - total;
  /*
   * ⚠️ ФОКУСТАЙ САРЫГ ОРУУЛАХГҮЙ ҮЛДЭГДЭЛ (2026-09-24, хэрэглэгч: «сүүлийн сард 5
   *    гэж бичихэд тэр нь хасагдаад жинхэнэ үлдэгдэл харагдахгүй»). «Нийлбэр /
   *    дутуу» мөр нь бичиж буй сарыг ч тоолдог тул бичих тусам үлдэгдэл хөдөлж,
   *    ЯГ хэд бичихээ мэдэх аргагүй байв. Одоо бичиж буй сарын өмнөх төлөвөөс
   *    (бусад бүх сар) үлдэгдлийг тусад нь харуулж, нэг товшилтоор бөглөнө.
   */
  const [mFocus, setMFocus] = useState<string | null>(null);
  /* ⚠️ `balanced`-ын алхам 0.01 тул 2 орноор бөөрөнхийлнө; `-0` → `0` (2026-09-24
     аудит: «-0» гэж харагдаж, `>= 0` нь ч тохиолдлоор зөрдөг байв). */
  const mRest = total != null && mFocus != null
    ? (Math.round((total - (mvSum - (mv.get(mFocus) ?? 0))) * 100) / 100) || 0
    : null;

  /** Уялдаа өөрчлөгдсөн эсэх — бичиглэлээр нь харьцуулна (дараалал ч утгатай) */
  const depsDirty = formatDeps(dl) !== formatDeps(r.deps);
  /** Сарын задаргаа хөндөгдсөн үү — хадгалагдсан `months`-той харьцуулна */
  const mvDirty = mv.size !== months.size || [...mv].some(([k, v]) => months.get(k) !== v);
  /** Огноо хөндөгдсөн үү — энэ блокийн хадгалагдсан зурвастай харьцуулна */
  const own = r.spans[blk];
  const spanDirty = (ms1 ?? null) !== (own?.start ?? null) || (ms2 ?? null) !== (own?.end ?? null);
  /* ⚠️ ЗӨВХӨН УЯЛДАА өөрчлөгдсөн (огноо, сар хөндөгдөөгүй) бол сарын нийлбэрийн
     дүрэм хаахгүй (2026-09-17): обьёмтой ч задаргаагүй ажилд уялдаа тавихад
     «Тавих» бүх сар бөглөхийг шаарддаг байв. Огноо/сар хөндсөн бол дүрэм хэвээр. */
  /* ⚠️ Бодит огноо · нөөц ч «хөнгөн» өөрчлөлт (2026-09-23) — сарын дүрэм хаахгүй.
     `all` (бүх блокт тараах) асаалттай бол ХӨНГӨН БИШ: муж хөндөгдөөгүй ч тараалт
     хийгдэх ёстой (урьд нь энэ тохиолдол доод бүтэн замаар явдаг байсан). */
  /* ⚠️ ОЛОН БЛОК сонгосон бол ХӨНГӨН БИШ (2026-09-24): муж хөндөгдөөгүй ч бусад
     сонгосон блокт хуулагдах ёстой. Сарын нөөц (`mrDirty`) ч бүтэн замаар. */
  /* ⚠️ УРЬДЧИЛАН БӨГЛӨСӨН МУЖ (2026-09-25 аудит): хуваарьгүй (эсвэл мужаас гадуур
     хуучирсан) ажилд талбарууд бүлгийн мужаар бөглөгддөг тул `spanDirty` үргэлж
     үнэн — обьёмтой ч задаргаагүй ажилд ганц уялдаа тавихад «Тавих» бүх сарыг
     бөглөхийг шаардаж, дээрх 2026-09-17-ны дүрэм ажилладаггүй байв. Хэрэглэгч
     бөглөсөн мужийг хөндөөгүй БӨГӨӨД сарын нийлбэр таараагүй (өөрөөр хуваарь
     тавих боломжгүй) бол «хөнгөн» замаар зөвхөн уялдаа/бодит огноог тавина.
     Обьёмгүй мөрд (`mvOk`) хуучин зан хэвээр — муж нь хуваарь болж тавигдана. */
  const pStale = !!(own && pspan && (own.end < pspan.start || own.start > pspan.end));
  const prefilled = !!pspan && (!own || pStale) && ms1 === pspan.start && ms2 === pspan.end;
  const depsOnly = (depsDirty || extraDirty) && (!spanDirty || (prefilled && !mvOk))
    && !mvDirty && !mrDirty && selB.size === 1;
  /** Сарын обьём + нөөц — «Тавих»-д өгөх багц; обьёмгүй мөрд обьём хөндөхгүй.
      ⚠️ Нөөц хөндөгдөөгүй, хоосон бол `null` (2026-09-24 аудит) — урьд нь үргэлж
         `mr` өгч, олон блокт тавихад бусад блокийн серверийн нөөц арчигддаг байв. */
  const obArg = { months: total == null ? null : mv, res: mrDirty || mrHas ? mr : null };
  /* ⚠️ Алхам 0 → сар/нөөц/бодит огноо СОНГОСОН БҮХ блокт (мужууд ижил);
     алхам >0 → зөвхөн идэвхтэй блокт (бусдын муж шилжсэн тул сарууд зөрнө,
     `applyChanges` тэднийг `keepMonths`/`keepRes`-ээр өөрөө бэлтгэнэ). */
  const obBlks = takt > 0 ? [blk] : [...selB];

  const apply = () => {
    /* ⚠️ Бүлэгт огноо ОГТ бичихгүй — зөвхөн уялдаа (бодит огноо · нөөц ч бүлэгт
       хаалттай: `aggExtra`-аар бодогдоно). */
    if (r.group) { if (depsDirty) onApply(null, dl, null, null, null, [blk]); onClose(); return; }
    if (ms1 == null || ms2 == null || bad) {
      /* Огноо буруу ч УЯЛДАА · бодит огноо · нөөцийг дангаар нь тавьж болно —
         төлөвлөгөөт огноог хөндөхгүй */
      if (depsDirty || extraDirty) { onApply(null, depsDirty ? dl : null, null, actArg, resArg, obBlks); onClose(); }
      return;
    }
    if (depsOnly) { onApply(null, depsDirty ? dl : null, null, actArg, resArg, obBlks); onClose(); return; }
    /* ⚠️ НИЙЛБЭР ТААРААГҮЙ бол хуваарийг ОРУУЛАХГҮЙ (хэрэглэгчийн дүрэм №3).
       Товч нь аль хэдийн хаалттай ч Enter/гар хандалтаар энд ирж болно. */
    if (!mvOk) return;
    const next = r.spans.slice();
    /* ⚠️ СОНГОСОН блок бүрд (2026-09-24): алхам 0 → ИЖИЛ огноо (хэрэглэгчийн
       сонголт); алхам >0 → идэвхтэй блокоос `(b - blk) × алхам` хоногоор
       хойшилно (давтагдах блокийн хуучин хэлбэр). Сонгоогүй блок хөндөгдөхгүй. */
    const len = spanDays({ start: ms1, end: ms2 });
    for (const b of selB) {
      const shift = takt > 0 ? (b - blk) * takt * DAY : 0;
      next[b] = b === blk ? { start: ms1, end: ms2 } : { start: ms1 + shift, end: endOf(ms1 + shift, len) };
    }
    onApply(next, depsDirty ? dl : null, obArg, actArg, resArg, obBlks);
    onClose();
  };

  const clear = () => {
    const next = r.spans.slice();
    for (const b of selB) next[b] = null;
    /* ⚠️ Зөвхөн ОГНООГ арилгана — уялдаа нь хэвээр: хуваариа дахин тавихад
       гинж нь буцаад ажиллана. Уялдааг устгах бол жагсаалтаас ×-ээр.
       ⚠️ Сарын задаргаа ч цэвэрлэгдэнэ: хуваарьгүй ажилд төлөвлөсөн обьём
       үлдвэл нийлбэрийн шалгуур мөнхөд зөрчилтэй болно.
       ⚠️ Бодит огноо · нөөц ХӨНДӨХГҮЙ (2026-09-23): төлөвлөгөөг арилгах нь
       баримтыг устгах шалтгаан биш — талбарыг хоослоод «Тавих». */
    onApply(next, null, { months: new Map(), res: new Map() }, null, null, [...selB]);
    onClose();
  };

  return (
    <div className={h.mdBack} role="presentation" onClick={onClose}>
      <div ref={mdRef} className={h.md} role="dialog" aria-modal="true"
        onClick={(e) => e.stopPropagation()}>
        <header className={h.mdHead}>
          <span className={h.mdNo}>{r.no}</span>
          <b className={h.mdWork}>{r.work || tr('(нэргүй)')}</b>
          <button type="button" className={h.mdX} onClick={onClose} aria-label={tr('Хаах')}>×</button>
        </header>

        {/* ── БЛОКУУД — ОЛНООР СОНГОНО (2026-09-24). Идэвхтэй (тод) блокийн
            огноо/сар суурь болно; сонгосон бүх блокт ижил тавигдана. */}
        <div className={h.mdBlks}>
          <span className={h.mdField}>{tr('Блокууд')}</span>
          {blocks.map((b, k) => (
            <button type="button" key={b}
              className={`${h.mdChip} ${selB.has(k) ? h.mdChipOn : ''} ${k === blk ? h.mdChipAct : ''}`}
              aria-pressed={selB.has(k)}
              title={k === blk ? tr('Идэвхтэй блок — огноо, сарын суурь эндээс') : undefined}
              onClick={() => toggleB(k)}>
              {b}
            </button>
          ))}
          {dEdit && blocks.length > 1 && (
            <>
              <button type="button" className={h.tlZoomB}
                onClick={() => setSelB(new Set(blocks.map((_, k) => k)))}>{tr('Бүгд')}</button>
              <button type="button" className={h.tlZoomB}
                onClick={() => setSelB(new Set([blk]))}>{tr('Цэвэрлэх')}</button>
            </>
          )}
          {selB.size > 1 && <span className={h.mdParWork}>{tr('{0} блокт тавина', num(selB.size))}</span>}
        </div>

        {/* ⚠️ БҮЛГИЙН МУЖ нь ХЯЗГААР БИШ, ЛАВЛАХ (2026-09-06). Бүлэг нь
            хүүхдүүдийнхээ MIN/MAX-аар бодогддог болсон тул энэ мөр нь
            «одоогоор бүлэг хаана байна» гэдгийг л хэлнэ; «мужаар нь авах»
            нь хурдан бөглөх туслах хэвээр. */}
        {pspan && (
          <p className={h.mdPar}>
            {tr('Бүлгийн муж')}: <b className="num">{msToDay(pspan.start)}</b>
            {' → '}<b className="num">{msToDay(pspan.end)}</b>
            {par?.work ? <span className={h.mdParWork}> · {par.work}</span> : null}
            {dEdit && (a !== msToDay(pspan.start) || z !== msToDay(pspan.end)) && (
              /* ⚠️ Байгаа хуваарийг АВТОМАТААР дарж бичихгүй — бодит өгөгдөл.
                 Бүлгийн мужийг бүтнээр нь авахыг ЭНД ил санал болгоно. */
              <button type="button" className={h.mdSnap}
                onClick={() => { setA(msToDay(pspan.start)); setZ(msToDay(pspan.end)); }}>
                {tr('мужаар нь авах')}
              </button>
            )}
          </p>
        )}

        {/* ── ОГНОО — ХОЁР БАГАНА (2026-09-24, хэрэглэгч): «Төлөвлөгөөт» (эхлэх ·
            дуусах · үргэлжлэх — засагдана) ба «Бодит» (эхэлсэн · дууссан ·
            үргэлжлэх — бодогдоно). Бодит нь БҮРТГЭЛ: гинж, бүлгийн муж, сарын
            задаргаанд нөлөөлөхгүй; хагас (эхэлсэн, дуусаагүй) хэвийн; бүлэгт зөвхөн
            харагдана (хүүхдийн MIN/MAX); талбаргүй үйлчилгээнд багана гарахгүй. */}
        <div className={h.mdCols}>
          <div className={h.mdCol}>
            <div className={h.mdColHead}>{tr('Төлөвлөгөөт')}</div>
            <label className={h.mdField}>
              {tr('Эхлэх')}
              <input type="date" className={h.select} value={a} disabled={!dEdit}
                onChange={(e) => onStart(e.target.value)} />
            </label>
            <label className={h.mdField}>
              {tr('Дуусах')}
              <input type="date" className={h.select} value={z} disabled={!dEdit}
                onChange={(e) => setZ(e.target.value)} />
            </label>
            {/* ⚠️ Үргэлжлэх хоног — бичихэд дуусах огноо автоматаар (2026-09-17) */}
            <label className={h.mdField}>
              {tr('Үргэлжлэх')}
              <span className={h.mdDays}>
                <input type="number" min={1} max={3650} className={h.numIn} value={durTxt}
                  disabled={!dEdit || ms1 == null}
                  placeholder={ms1 == null ? '—' : ''}
                  aria-label={tr('Үргэлжлэх хоног')}
                  title={ms1 == null ? tr('Эхлэх огноог эхлээд сонгоно') : tr('Хоног бичихэд дуусах огноо автоматаар бодогдоно')}
                  onChange={(e) => onDur(e.target.value)} />
                {' '}{tr('хоног')}
              </span>
            </label>
            {bad && <span className={h.mdDays}><b className={h.mdBad}>{tr('Дуусах нь эхлэхээс өмнө')}</b></span>}
          </div>
          {hasActual && (
            <div className={h.mdCol}>
              <div className={h.mdColHead}>{tr('Бодит')}</div>
              <label className={h.mdField}>
                {tr('Эхэлсэн')}
                <input type="date" className={h.select} value={aa} disabled={!dEdit}
                  onChange={(e) => setAa(e.target.value)} />
              </label>
              <label className={h.mdField}>
                {tr('Дууссан')}
                <input type="date" className={h.select} value={az} disabled={!dEdit}
                  onChange={(e) => setAz(e.target.value)} />
              </label>
              {/* ⚠️ Бодит «үргэлжлэх хоног» ХАСАГДСАН (2026-09-24, хэрэглэгч) */}
              {aBad && <span className={h.mdDays}><b className={h.mdBad}>{tr('Бодит дууссан нь эхэлснээс өмнө')}</b></span>}
            </div>
          )}
        </div>

        {/* ⚠️ Мөрийн хүн/машин input ХАСАГДСАН (2026-09-24) — сар бүрийн сүлжээнд л
            төлөвлөнө; мөрийн талбар хадгалахад саруудын нийлбэрээр бичигдэнэ. */}

        {r.group && (
          <p className={h.mdPar}>
            {tr('Бүлгийн хугацаа нь доторх ажлуудынхаа хамгийн эрт эхлэх — хамгийн сүүл дуусахаар ӨӨРӨӨ бодогдоно. Гараар засахгүй: ажлуудаа зөөвөл бүлэг дагана.')}
          </p>
        )}

        {/* ── САРЫН ОБЬЁМ ──
            ⚠️ Хэрэглэгчийн шаардлага (2026-09-06): хуваарь татахад нийт
            обьёмыг хамарсан саруудад тараана; сар бүрд ӨӨР тоо бичиж болно;
            НИЙЛБЭР нь нийт обьёмтой ТЭНЦҮҮ байх ёстой — эс бөгөөс хуваарь
            оруулахыг ХААНА («Тавих» унтарна).
            ⚠️ Обьёмгүй мөрд ОРОЛТ ГАРАХГҮЙ: тараах нийт тоо байхгүй. Гэхдээ
            ШАЛТГААНЫГ нь бичнэ — эс бөгөөс «сарын хэсэг гарч ирэхгүй байна»
            гэсэн эргэлзээ үүснэ (2026-09-06-нд хэрэглэгч асуусан). */}
        {total == null && !r.group && (
          <p className={h.mdPar}>
            {tr('«Обьём» хоосон тул сарын задаргаа хийгдэхгүй.')}
          </p>
        )}
        {total != null && (
          <div className={h.mdDeps}>
            <div className={h.mdDepsHead}>
              {tr('Сарын обьём')}
              <span className={h.mdDepsN}>
                {/* ⚠️ 2 орны нарийвчлал (2026-09-17): обьём бутархай (900.35) байхад «900»
                    гэж харагдаж, нийлбэр 900 «0 дутуу» гэсэн ойлгомжгүй шалтгаанаар
                    «Тавих» хаагддаг байв. */}
                {tr('нийт')} {num(total, 2)}
              </span>
            </div>

            {mKeys.length === 0 ? (
              <p className={h.mdPar}>
                {tr('Огноо оруулмагц сарууд өөрөө гарч ирнэ.')}
              </p>
            ) : (
              <>
                {/* ── САРЫН СҮЛЖЭЭ (2026-09-24): сар · обьём · хүн хүч · машин механизм.
                    12–32 мөр, дотроо гүйнэ (`mdMonthGrid`). Нөөцийн багана
                    хүснэгтийн талбар байхгүй ч БӨГЛӨГДӨНӨ (ноорог/илгээлтэд явна),
                    хадгалахад л алгасаж анхааруулна. */}
                <div className={h.mdMonthGrid}>
                  <span className={h.mdMonthHead}>{tr('Сар')}</span>
                  <span className={h.mdMonthHead}>{tr('Обьём')}</span>
                  <span className={h.mdMonthHead}>{tr('Хүн хүч')}</span>
                  <span className={h.mdMonthHead}>{tr('Машин механизм')}</span>
                  {mKeys.map((k) => (
                    <Fragment key={k}>
                      <span className={h.mdMonth}>{k}</span>
                      <input
                        type="number"
                        className={`${h.numIn} ${h.mdMonthIn}`}
                        /* ⚠️ ХООСОН нь `0` БИШ: 0 бол «тэр сард ажил хийхгүй»
                           гэсэн БОДИТ төлөвлөгөө. Хоосон талбар нь Map-д ОГТ
                           БАЙХГҮЙ гэсэн үг. */
                        value={mv.get(k) ?? ''}
                        disabled={!canEdit}
                        min={0}
                        step="0.01"
                        aria-label={tr('{0}-ны обьём', k)}
                        placeholder={mFocus === k && mRest != null && mRest >= 0 ? num(mRest, 2) : undefined}
                        onFocus={() => setMFocus(k)}
                        onBlur={() => setMFocus((f) => (f === k ? null : f))}
                        onChange={(e) => {
                          const t = e.target.value.trim();
                          setMv((m) => {
                            const out = new Map(m);
                            if (t === '') out.delete(k);
                            else out.set(k, Math.max(0, Number(t) || 0));
                            return out;
                          });
                        }}
                      />
                      <input type="number" className={`${h.numIn} ${h.mdMonthIn}`} min={0} step={1}
                        value={mr.get(k)?.hun ?? ''} disabled={!canEdit}
                        aria-label={tr('{0}-ны хүн хүч', k)}
                        onChange={(e) => setMrCell(k, 'hun', e.target.value)} />
                      <input type="number" className={`${h.numIn} ${h.mdMonthIn}`} min={0} step={1}
                        value={mr.get(k)?.mashin ?? ''} disabled={!canEdit}
                        aria-label={tr('{0}-ны машин механизм', k)}
                        onChange={(e) => setMrCell(k, 'mashin', e.target.value)} />
                    </Fragment>
                  ))}
                  <span className={h.mdMonthTot}>{tr('Нийлбэр')}</span>
                  <span className={`${h.mdMonthTot} num`}>{num(mFocus != null ? mvSum - (mv.get(mFocus) ?? 0) : mvSum, 2)}</span>
                  <span className={`${h.mdMonthTot} num`}>{mrSum.hun != null ? num(mrSum.hun) : '—'}</span>
                  <span className={`${h.mdMonthTot} num`}>{mrSum.mashin != null ? num(mrSum.mashin) : '—'}</span>
                </div>
                {(resFields.hun === false || resFields.mashin === false) && mrHas && (
                  <p className={h.mdWarn}>
                    {tr('Сарын хүснэгтэд хүн хүч/машин механизмын талбар алга — сарын нөөц хадгалагдахгүй, админ AGOL дээр нэмнэ.')}
                  </p>
                )}

                {/* ⚠️ НИЙЛБЭР ба ЗӨРҮҮ нь ҮРГЭЛЖ ил: хэрэглэгч «Тавих» дарж
                    чадахгүй болсныг ШАЛТГААНТАЙ нь хамт харах ёстой. */}
                {/* ⚠️ БИЧИЖ БАЙХАД ХӨДЛӨХГҮЙ МӨР (2026-09-24, хэрэглэгч: «эхний тоог
                    тавихад л хэд гэж бичих нь тодорхойгүй болчихно»). Сарын нүдэнд
                    фокустай үед ХӨДЛӨДӨГ «Нийлбэр · дутуу» мөрийг НУУЖ, зөвхөн тэр
                    сарыг оруулахгүй тогтмол нийлбэр · үлдэгдлийг харуулна. */}
                {mFocus != null && mRest != null && (
                  <p className={h.mdPar}>
                    {tr('{0}-ыг оруулахгүй нийлбэр', mFocus)}: <b className="num">{num(mvSum - (mv.get(mFocus) ?? 0), 2)}</b>
                    {' · '}{tr('үлдэгдэл')}: <b className="num">{num(mRest, 2)}</b>
                    {mRest > 0 && canEdit && (
                      <>
                        {' '}
                        <button type="button" className={h.mdSnap}
                          /* ⚠️ onMouseDown — товч дарахад input-ийн blur нь mFocus-ыг
                             арилгахаас ӨМНӨ утгыг тавина */
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const k = mFocus;
                            setMv((m) => new Map(m).set(k, mRest));
                          }}>
                          {tr('Үлдэгдлээр бөглөх')}
                        </button>
                      </>
                    )}
                  </p>
                )}
                {(mFocus == null || mRest == null) && (
                <p className={mvOk ? h.mdPar : h.mdWarn}>
                  {tr('Нийлбэр')}: <b className="num">{num(mvSum, 2)}</b>
                  {mvOk ? (
                    <> · {tr('нийт обьёмтой тэнцэв')}</>
                  ) : (
                    <>
                      {' · '}
                      <b className={h.mdBad}>
                        {mvDiff > 0 ? tr('{0}-аар илүү', num(mvDiff, 2)) : tr('{0} дутуу', num(-mvDiff, 2))}
                      </b>
                      {/* ⚠️ «ТЭНЦҮҮЛЭХ» ТОВЧ ХАСАГДСАН (2026-09-06): автомат
                          тараалт хийхгүй гэсэн шийдвэрийн дагуу. */}
                    </>
                  )}
                </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── УЯЛДАА ХОЛБООС ──
            ⚠️ ДҮРЭМ БИШ, ЧАДВАР: уялдаа тавих нь бүрэн сонголт. Тавьсан үед
            урд ажил хөдлөхөд энэ ажил (болон түүнээс хамаарагчид) гинжээр
            дагана. Код бичихгүй — жагсаалтаас СОНГОНО, дугуй хамаарал үүсгэх
            ажлууд жагсаалтад ОРДОГГҮЙ (`depCands`). */}
        {hasHam && (
          <div className={h.mdDeps}>
            <div className={h.mdDepsHead}>
              {tr('Уялдаа — урд ажлууд')}
              {dl.length > 0 && <span className={h.mdDepsN}>{num(dl.length)}</span>}
            </div>
            {/* ⚠️ Түлхүүр нь ИНДЕКС — уялдаанд байгалийн ID алга (нэг кодыг
                хоёр мөрөнд сонгож болно), жагсаалт нь богино, зөвхөн locally
                засагддаг тул индекс аюулгүй. */}
            {dl.map((d, j) => (
              <div key={j} className={h.mdDepRow}>
                <select className={`${h.select} ${h.mdDepWork}`} value={d.code} disabled={!canEdit}
                  onChange={(e) => setDl((v) => v.map((x, k) => (k === j ? { ...x, code: Number(e.target.value) } : x)))}>
                  {/* Хуучин хадгалагдсан код нэр дэвшигчдэд байхгүй байж болно
                      (жиш. одоо дугуй үүсгэх байрлалд) — сонголт алдагдахгүйн
                      тулд тусдаа мөрөөр үлдээнэ */}
                  {!cands.some((c) => c.code === d.code) && (
                    <option value={d.code}>{d.code} · {tr('(жагсаалтад алга)')}</option>
                  )}
                  {cands.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
                <select className={h.select} value={d.type} disabled={!canEdit}
                  title={tr('FS — урд ажил дуусмагц · SS — урд ажилтай зэрэг эхэлнэ')}
                  onChange={(e) => setDl((v) => v.map((x, k) => (k === j ? { ...x, type: e.target.value as DepType } : x)))}>
                  <option value="FS">{tr('дуусаад (FS)')}</option>
                  <option value="SS">{tr('зэрэг (SS)')}</option>
                </select>
                {/* ⚠️ ±365-аар хязгаарлана: илүү том хоцролт нь бараг үргэлж
                    бичилтийн алдаа бөгөөд гинжийг хуанлиас хол шидНЭ */}
                <input type="number" className={h.numIn} value={d.lag} disabled={!canEdit}
                  min={-365} max={365} aria-label={tr('Хоцролт (хоног)')}
                  title={tr('Хоцролт: FS — дууссанаас, SS — эхэлснээс хойш хэд хоногийн дараа (сөрөг = давхцана)')}
                  onChange={(e) => setDl((v) => v.map((x, k) => (
                    k === j ? { ...x, lag: Math.max(-365, Math.min(365, Number(e.target.value) || 0)) } : x
                  )))} />
                <span className={h.mdDepD}>{tr('хоног')}</span>
                {/* ⚠️ БЛОК (2026-09-24): хоосон = бүх блокт (блокгүй бичиглэл), эс бөгөөс
                    зөвхөн тэр блокт (`@N`). Ганц блоктой (синтетик) багцад нуугдана. */}
                {blocks.length > 1 && (
                  <select className={h.select} value={d.blk ?? ''} disabled={!canEdit}
                    title={tr('Аль блокт үйлчлэх — хоосон бол бүх блокт')}
                    onChange={(e) => setDl((v) => v.map((x, k) => {
                      if (k !== j) return x;
                      const { blk: _b, ...rest } = x;
                      return e.target.value === '' ? rest : { ...rest, blk: Number(e.target.value) };
                    }))}>
                    <option value="">{tr('бүх блок')}</option>
                    {blocks.map((name, b) => <option key={name} value={b}>{name}</option>)}
                    {/* ⚠️ Блокийн тооноос давсан `@N` — сонголтод харагдана, «Тавих»-д хасагдана (2026-09-24) */}
                    {d.blk != null && d.blk >= blocks.length && (
                      <option value={d.blk}>{tr('{0}-р блок алга', String(d.blk + 1))}</option>
                    )}
                  </select>
                )}
                {canEdit && (
                  <button type="button" className={h.mdDepX} aria-label={tr('Уялдаа устгах')}
                    onClick={() => setDl((v) => v.filter((_, k) => k !== j))}>×</button>
                )}
              </div>
            ))}
            {canEdit && (
              <button type="button" className={h.tlZoomB} disabled={!cands.length}
                onClick={() => setDl((v) => [...v, { code: cands[0].code, type: 'FS', lag: 0 }])}>
                + {tr('Уялдаа нэмэх')}
              </button>
            )}
          </div>
        )}

        {/* ⚠️ АЛХМЫН ТАЛБАР ЭНД (2026-09-02): урьд нь дээд зурваст байсан ч
            зөвхөн ЭНЭ тэмдэглэгээнд үйлчилдэг байв — хэрэглэгч тэмдэглэгээг
            уншаад алхмаа өөрчлөхийн тулд popup хааж, зурвас руу гарч, буцаж
            нээх шаардлагатай байлаа. Утга нь Huvaari-д (`takt`) хадгалагдана
            тул дараагийн ажилд дахин бичихгүй.
            ⚠️ 365-аар хязгаарлана: санамсаргүй нэмэлт тэг нь зурвасуудыг
            хуанлиас хол гаргаж, буцааж олох аргагүй болгоно. */}
        {/* ⚠️ ТООН ТАЛБАР нь `label`-ААС ГАДНА. Дотор нь оруулбал зарим хөтөч
            дээр талбар дээр товшихад тэмдэглэгээ солигдож, «бүх блокт тараах»
            санамсаргүй асаж 22 блокийн хуваарь дарагдах эрсдэлтэй. */}
        {/* ⚠️ АЛХАМ (2026-09-24): 0 = сонгосон блокт ИЖИЛ огноо (анхдагч, хэрэглэгчийн
            сонголт); >0 = идэвхтэй блокоос блок бүр алхмаар хойшилно (давтагдах
            блокийн хуучин хэлбэр — «Бүх блокт» checkbox чипээр солигдов). */}
        {dEdit && blocks.length > 1 && (
          <label className={h.mdField}>
            {tr('алхам (хоног)')}
            <input type="number" min={0} max={365} className={h.numIn} value={takt}
              aria-label={tr('Алхам')}
              title={tr('0 — сонгосон бүх блокт ижил огноо; N — идэвхтэй блокоос дараагийн блок бүр N хоногоор хойшилно')}
              onChange={(e) => onTakt(Math.min(365, Math.max(0, Number(e.target.value) || 0)))} />
            <span className={h.mdParWork}>{takt > 0 ? tr('блок бүр {0} хоногоор хойшилно', num(takt)) : tr('сонгосон блокт ижил огноо')}</span>
          </label>
        )}

        <footer className={h.mdFoot}>
          {dEdit && (
            <button type="button" className={h.tlZoomB} onClick={clear}
              disabled={![...selB].some((b) => r.spans[b])}>
              {tr('Арилгах')}
            </button>
          )}
          <span className={h.spacer} />
          <button type="button" className={h.tlZoomB} onClick={onClose}>{tr('Хаах')}</button>
          {canEdit && (
            <button type="button" className={h.save} onClick={apply}
              disabled={r.group
                ? !depsDirty
                : aBad ? true
                : depsOnly ? false
                /* ⚠️ Огноо хоосон/буруу бол `apply` зөвхөн уялдаа · бодит огноог тавина —
                   сарын нийлбэр тэр замд хамаарахгүй (2026-09-25 аудит) */
                : (ms1 == null || ms2 == null || bad) ? (!depsDirty && !extraDirty)
                : !mvOk}
              title={mvOk || depsOnly || ms1 == null || ms2 == null || bad ? undefined : tr('Сарын обьёмын нийлбэр нийт обьёмтой тэнцээгүй')}>
              {tr('Тавих')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

/**
 * ХОЛБОХ ЦОНХ — шугамаар чирж холбосны дараа гарна (2026-09-22, хэрэглэгч:
 * «чирээд холбосны дараа эхлээд дуусах / зэрэг эхлэх болон хоног заах цонх
 * гарах ёстой»). Зөвхөн ХОЁР сонголт: төрөл (FS — урд ажил дуусаад · SS —
 * урд ажилтай зэрэг эхэлнэ) ба хоцролтын хоног (±365). «Тавих» → `applyModal`
 * (дугуй/шатлалын шалгуур тэнд). Урд ажил аль хэдийн уялдаанд байвал утгыг
 * нь урьдчилан дүүргэж ЗАСНА.
 */
function LinkModal({ src, dst, blk, blocks, onClose, onApply, onRemove }: {
  src: PlanRow;
  dst: PlanRow;
  /** Уялдааны блок — `null` = бүх блок (2026-09-24) */
  blk: number | null;
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
  /* ⚠️ (код, блок)-оор олно — ижил кодын өөр блокийн уялдаа энэ цонхных биш (2026-09-24) */
  const cur = src.des != null ? dst.deps.find((d) => sameDep(d, { code: src.des as number, blk: blk ?? undefined })) : undefined;
  const [type, setType] = useState<DepType>(cur?.type ?? 'FS');
  const [lag, setLag] = useState<number>(cur?.lag ?? 0);
  const name = (r: PlanRow) => `${r.des ?? '—'} · ${r.work || r.no}`;
  return (
    <div className={h.mdBack} role="presentation" onClick={onClose}>
      <div ref={ref} className={h.md} role="dialog" aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { onClose(); return; }
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
              <span>{tr('Блок:')} <b>{blk != null ? (blocks[blk] ?? String(blk + 1)) : tr('бүх блок')}</b></span>
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
          <input type="number" className={h.numIn} value={lag} min={-365} max={365}
            aria-label={tr('Хоцролт (хоног)')}
            title={tr('Хоцролт: FS — дууссанаас, SS — эхэлснээс хойш хэд хоногийн дараа (сөрөг = давхцана)')}
            onChange={(e) => setLag(Math.max(-365, Math.min(365, Number(e.target.value) || 0)))} />
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
