'use client';

/**
 * CASHFLOW ХУВИАРЛАХ — ажил бүрийн сарын гүйцэтгэлийн төлөвлөгөө.
 *
 * ЯАГААД ТУСДАА ХАРАГДАЦ ВЭ: гэрээний бүртгэл нь 33 багана, 78 мөр, гурван
 * түвшний зурвастай. Тэнд 681 сарын мөр нэмээд хувь бөглөх нь хэрэглэгчийг
 * хэвтээ гүйлгүүр дээр сарууд хайхад хүргэдэг. Энэ панель нь ЯГ ТЭР НЭГ
 * ажилдаа төвлөрнө: зүүн талд ажлаа сонгоно, баруун талд түүний сарууд
 * босоо жагсаалтаар — өөр юу ч байхгүй.
 *
 * ⚠️ ӨГӨГДЛИЙН ХЭЛБЭР: сарын мөрүүд нь `Cashflow_final` хүснэгтийн ДОТОРХ
 * нэмэлт мөрүүд (тусдаа хүснэгт БИШ) бөгөөд `Cashflow_start` бөглөгдсөнөөр
 * ажлын мөрөөс ялгагдана. Дэлгэрэнгүйг `services.ts` → `CF_WORK_WHERE`.
 *
 * ⚠️ `Cashflow_dun` ГАРААР БИЧИГДЭХГҮЙ — хувиас бодогдоно. Хоёуланг нь гараар
 * бөглөвөл хэзээ нэгэн цагт зөрөх нь тодорхой.
 *
 * ⚠️ 2026-10-26: САРЫН МӨНГӨНИЙ ЭХ (`sar_mongo_eh`, `monthlyMoney`-ийн толгой). 'huvaari' гэрээний сарууд нь
 *    Хуваарийн сарын обьём × нэгж өртгөөр ТООЦООЛОГДОНО — энд ЗӨВХӨН УНШИХ хүснэгтээр харагдана, засагдахгүй,
 *    «Цэвэрлэх» алга. 'garaar' гэрээний зам ӨӨРЧЛӨГДӨӨГҮЙ. «Хуваарь руу шилжүүлэх» товч (`canSwitch`, `cfSwitch` эрх)
 *    гараар сарын мөрийг УСТГАЖ эхийг солино — буцаахгүй, батлуулах цонхтой (`monthlyMoney.switchToHuvaari`).
 */

import { useEffect, useMemo, useState } from 'react';
import { useAsync } from '@/lib/useAsync';
import {
  loadMonthlyMoney, monthSourceOf, confirmAndSwitch, switchPhaseWhy,
  PKG_KEYS, SRC_HUVAARI, type MonthlyMoney, type ContractState,
} from '@/lib/monthlyMoney';
import { t as tr } from '@/lib/i18nCore';
import { mnt, num } from '@/lib/format';
import { applyAll } from '@/lib/tableWrite';
import { invalidate } from '@/lib/dataBus';
import { awaitingReload } from '@/lib/finEdit';
import { CASHFLOW_NEW, CF_MONTH, CF_MONTH_WHERE, CF_WORK_WHERE, pkgKeyOf } from '@/lib/services';
import { queryFeatures } from '@/lib/query';
import { loadFinancePublishInputs, publishFinanceBatch, recomputeFinanceAmounts } from '@/lib/financePublish';
import { cfStartKeyOf } from '@/lib/gdash';
import { FIN_XL_CODE, FIN_XL_SECTION, FIN_XL_GROUP_FIELD, FIN_XL_GROUP3_FIELD } from '@/lib/finExcelLayout';
import c from '@/modules/cfplan.module.css';
import { userError } from '@/components/ui';
import { askConfirm } from '@/lib/confirm';

type Row = Record<string, unknown>;

const sOf = (v: unknown) => String(v ?? '').trim();
const nOf = (v: unknown): number | null => {
  /* ⚠️ Аравтын таслал («12,5») зөвшөөрнө — Excel-ээс хуулсан утга */
  const t = String(v ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
};
/**
 * `Cashflow_ID` — хоосон бол `null`.
 * ⚠️ 2026-09-29 (аудит 10): `Number(null)` = 0 тул дугааргүй ажил `0` түлхүүртэй
 *    болж, ийм хоёр ажил нэг сарын жагсаалт ба нэг `w0` React түлхүүр
 *    хуваалцдаг байв (`Finance.cfIdOf`-тэй ижил дүрэм).
 */
const idOf = (v: unknown): number | null => {
  if (v == null || String(v).trim() === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** Сарын мөр → `monthlyMoney`-ийн оролт (`gdash.CfPlanRow`-ийн хэлбэр) */
const manualOf = (rows: readonly Row[]) => rows
  .map((r) => ({
    id: idOf(r[CF_MONTH.id]) ?? -1,
    start: idOf(r[CF_MONTH.start]),
    pct: nOf(r[CF_MONTH.pct]),
    amount: nOf(r[CF_MONTH.amount]),
  }))
  .filter((r) => r.id > 0 && r.start != null);

/** Хоосон биш атлаа тоо болохгүй оролт — хадгалахаас өмнө татгалзана */
const badNum = (v: unknown) => String(v ?? '').trim() !== '' && nOf(v) == null;

/**
 * ЗАДАРГААНЫ КОДООР ЭРЭМБЭЛЭХ — «4.2» нь «4.10»-аас ӨМНӨ.
 * ⚠️ Гэрээний бүртгэлийн эрэмбэтэй ЯГ ИЖИЛ дүрэм: хоёр газарт өөр дараалал
 * гарвал «хэддэх ажил» гэж ярихад ойлголцохгүй.
 */
const seg = (v: unknown): number[] => sOf(v).split('.').map((t) => {
  const n = Number(t);
  return Number.isFinite(n) && t !== '' ? n : Infinity;
});
const cmpSeg = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d !== 0) return Number.isNaN(d) ? 0 : d;
  }
  return 0;
};

/**
 * «2026-03» — ОРОН НУТГИЙН (УБ) сараар.
 * ⚠️ 2026-09-29 (аудит 10): `Finance.publish`-ийн сарын мужтай НЭГ дүрэм (тэндхийн
 *    `keyOf`-ийн ⚠️). УБ-ын шөнө дунд (өмнөх өдрийн 16:00Z) UTC-ээр өмнөх сар болдог байв.
 */
/* ⚠️ 2026-10-09: дүрэм `gdash.cfStartKeyOf`-д нэгтгэгдсэн (Finance.publish · gdash · tuhData ижил) —
   ХУУЧИН UTC шөнө дундын мөр UTC сараар, бусад нь орон нутгийн сараар. */
const monthKey = (ms: unknown): string => cfStartKeyOf(ms);

/** Бөглөлтийн төлөв — өнгө ба шошго нь эндээс */
type Fill = 'none' | 'part' | 'done' | 'over';

/**
 * ⚠️ ГУРВАН төлөв, хоёр биш. Даалгаварт «бөглөсөн ногоон, бөглөөгүй улаан»
 * гэсэн ч 30% бөглөсөн ажил «бөглөсөн» гэж ногоон болбол дутуу ажил дууссан
 * мэт харагдана. Тиймээс ДУНД төлөв (шар) нэмэв: ногоон = ЯГ 100%.
 */
const fillOf = (sum: number | null): Fill => {
  if (sum == null) return 'none';
  /* ⚠️ Хөвөгч таслалын алдааг тэвчинэ — 33.33×3 нь 99.99 гардаг */
  if (Math.abs(sum - 100) < 0.01) return 'done';
  /* ⚠️ 2026-09-25: 100%-иас ИЛҮҮ нь «дутуу» БИШ — тусдаа төлөв. Урьд нь 130%
     бөглөсөн ажил шар «дутуу» гэж харагдаж, хэрэглэгч улам нэмэх гэж оролддог байв.
     ⚠️ ИЛ БИЧСЭН 0 нь «хоосон» БИШ (null ≠ 0): `sum` нь зөвхөн бөглөсөн сартай
     үед тоо байна (`sumOf`) — 0% гэж бичсэн ажил «бөглөсөн боловч 100% биш». */
  if (sum > 100) return 'over';
  return 'part';
};
/**
 * Төлвийн CSS класс. ⚠️ `.over` класс `cfplan.module.css`-д хараахан
 * байхгүй бол шар (`.part`) өнгөөр — төлөв нь шошго/анхааруулгаараа ялгарна.
 */
const fillCls = (st: Fill): string => (st === 'over' ? (c.over || c.part) : c[st]);

/**
 * ГЭРЭЭНИЙ ДҮН — `ho_dun_geree`; байхгүй/0/NaN бол `null`.
 *
 * ⚠️ 2026-09-23: урьд нь `Number(...) || 0` тул гэрээний дүнгүй ажилд сар
 *    бүрийн ₮ «0 ₮» гэж бодогдож, хадгалахад `amount = 0` БИЧИГДДЭГ байв —
 *    «мэдээлэлгүй» нь «тэг» болж хувирдаг (null ≠ 0). Одоо `null` → дэлгэцэнд
 *    «—», хадгалахад дүн `null`.
 */
const costOf = (r: Row | null | undefined): number | null => {
  const v = Number(r?.ho_dun_geree);
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** 'huvaari' гэрээний тооцоолсон цуваа ГАРААГҮЙ шалтгаан — хүнд ойлгомжтой (null ≠ 0: «0 ₮» гэж харуулахгүй) */
const huvStateText = (s: ContractState): string => {
  if (s === 'noKey') return tr('Багцын дугааргүй (эсвэл олон багцын) гэрээ — Хуваарь-аас сарын мөнгө бодогдохгүй.');
  if (s === 'noSheet') return tr('Энэ багцад Хуваарийн бөглөх хуудас алга — сарын мөнгө бодогдохгүй.');
  if (s === 'failed') return tr('Бөглөх хуудас уншигдсангүй — тооцоолсон сарын мөнгө гарсангүй. Хуудсыг дахин ачаална уу.');
  if (s === 'sharedNoCost') return tr('Багцын Хуваарийг өөр гэрээтэй хуваалцдаг ч ХО дүнгүй тул хувь оноогдсонгүй.');
  return tr('Хуваарьт сарын обьём (нэгж өртөгтэй) хараахан алга — «Хуваарь» хэсэгт сарын обьём оруулахад энд гарна.');
};

export function CashflowPlan({
  works, months, onSaved, canEdit = true, onDirty, monthsError = false, canSwitch = false, money,
}: {
  /**
   * «Гараар → Хуваарь» шилжүүлэх эрх (`cfSwitch`, 2026-10-26) — дуудагч `hasCap(user, 'cfSwitch')` өгнө.
   * Анхдагч `false` — товч харагдахгүй.
   */
  canSwitch?: boolean;
  /**
   * Тооцоолсон сарын мөнгө (`monthlyMoney.loadMonthlyMoney`) — дуудагч аль хэдийн ачаалсан бол. `undefined` бол
   * 'huvaari' гэрээ байвал энд өөрөө ачаална; 'huvaari' гэрээгүй бол ОГТ ачаалахгүй.
   */
  money?: MonthlyMoney | null;
  /**
   * Сарын задаргаа УНШИГДСАНГҮЙ (2026-09-29 аудит 10) — «сар үүсээгүй» гэж
   * худал зөвлөхгүй, «уншигдсангүй» гэж хэлнэ.
   */
  monthsError?: boolean;
  /** `finEdit` эрх — үгүй бол нүд засагдахгүй, «Хадгалах» хаалттай (2026-09-17) */
  canEdit?: boolean;
  /** Ажлын мөрүүд (78) — `Cashflow_start IS NULL` */
  works: Row[];
  /** Сарын мөрүүд (681) — `Cashflow_start IS NOT NULL` */
  months: Row[];
  onSaved: () => void;
  /**
   * Хадгалаагүй засвартай эсэхийг эцэг рүү мэдэгдэнэ (2026-09-23) — `Finance`
   * таб солиход баталгаажуулалт асуухад хэрэглэнэ. Unmount-д `false`.
   */
  onDirty?: (dirty: boolean) => void;
}) {
  const oidField = CASHFLOW_NEW.oid;
  /** Засварласан хувь — `oid` → бичсэн текст */
  const [pend, setPend] = useState<Record<number, string>>({});
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  /**
   * ⚠️ 2026-10-21: ХАДГАЛСНЫ АГШИН ДАХЬ `months` — шинэ мөрүүд (өөр лавлагаа) ирэх хүртэл `pend`-ийг
   *    ХАДГАЛНА (`finEdit.awaitingReload`, «Гэрээний бүртгэл»-ийн загвар). Урьд нь `setPend({})` тэр
   *    дороо ажиллаж, `months` хуучин хэвээр тул нүд хуучин утга руу үсэрч, хэрэглэгч тэр хуучин утгыг
   *    дахин бичихэд «өөрчлөгдөөгүй» гэж хаягддаг байв. Дахин ачаалалт унавал `Data` алдаанд орж энэ
   *    бүрэлдэхүүн unmount болно — хаалт мөнхөд үлдэхгүй.
   */
  const [pubFrom, setPubFrom] = useState<Row[] | null>(null);
  const reloading = awaitingReload(pubFrom, months);
  /* Шинэ мөрүүд ирэв — хадгалсан засварыг одоо л арилгана (render үеийн төлөв тохируулалт) */
  if (pubFrom != null && !reloading) {
    setPubFrom(null);
    setPend({});
  }

  /** Ажил бүрийн сарууд — огноогоор эрэмбэлсэн */
  const byWork = useMemo(() => {
    const m = new Map<number, Row[]>();
    for (const r of months) {
      const id = idOf(r[CF_MONTH.id]); // ⚠️ 2026-09-29 (аудит 10): хоосон → 0 БИШ
      if (id == null) continue;
      const arr = m.get(id) ?? [];
      arr.push(r);
      m.set(id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => Number(a[CF_MONTH.start] ?? 0) - Number(b[CF_MONTH.start] ?? 0));
    }
    return m;
  }, [months]);

  /* ⚠️ 2026-10-26: САРЫН МӨНГӨНИЙ ЭХ — 'huvaari' гэрээ (толгойн ⚠️). Тийм гэрээ НЭГ Ч БАЙХГҮЙ бол юу ч ачаалахгүй. */
  const srcField = CASHFLOW_NEW.fields.monthSource;
  const huvIds = useMemo(() => {
    const s = new Set<number>();
    for (const w of works) {
      const id = idOf(w[CF_MONTH.id]);
      if (id != null && monthSourceOf(w[srcField]) === SRC_HUVAARI) s.add(id);
    }
    return s;
  }, [works, srcField]);
  const hasHuv = huvIds.size > 0;
  const moneyQ = useAsync<MonthlyMoney | null>(
    () => (money !== undefined || !hasHuv ? Promise.resolve(null) : loadMonthlyMoney(manualOf(months))),
    [money, hasHuv, months],
  );
  const mm = money !== undefined ? money : moneyQ.state === 'ready' ? moneyQ.data : null;
  /** 'huvaari' гэрээний тооцоолсон хувийн нийлбэр (0–100; ХО дүнгүй/сар алга бол null) */
  const huvSum = (id: number): number | null => {
    const cm = mm?.contracts.get(id);
    if (!cm || cm.cost == null || !cm.months.size) return null;
    let s = 0;
    for (const v of cm.months.values()) s += v;
    return (s / cm.cost) * 100;
  };

  /** Кодоор эрэмбэлсэн ажлууд — 4-р түвшний бүтэн жагсаалт */
  const sorted = useMemo(() => works.slice().sort((x, y) => {
    for (const f of FIN_XL_CODE) {
      const d = cmpSeg(seg(x[f]), seg(y[f]));
      if (d !== 0) return d;
    }
    return Number(x[oidField] ?? 0) - Number(y[oidField] ?? 0);
  }), [works, oidField]);

  /** Одоогийн (засвар оруулсан) хувийн нийлбэр — ажлаар */
  const sumOf = (id: number): number | null => {
    const arr = byWork.get(id);
    if (!arr || arr.length === 0) return null;
    let any = false;
    let s = 0;
    for (const r of arr) {
      const oid = Number(r[oidField]);
      const raw = oid in pend ? pend[oid] : r[CF_MONTH.pct];
      const v = nOf(raw);
      /* ⚠️ `null` ≠ 0: бөглөөгүй сар нийлбэрт ОРОХГҮЙ, гэхдээ ажил өөрөө
         «бөглөөгүй» эсэхийг тодорхойлоход хэрэгтэй. */
      if (v != null) { any = true; s += v; }
    }
    return any ? s : null;
  };

  /** Зүүн жагсаалтын мөрүүд — зурвас ба ажил хольсон */
  const listRows = useMemo(() => {
    const out: (
      { kind: 'band'; depth: number; code: string; label: string }
      | { kind: 'work'; row: Row; id: number }
    )[] = [];
    const NF = [FIN_XL_SECTION, FIN_XL_GROUP_FIELD, FIN_XL_GROUP3_FIELD];
    let prev: string[] = [];
    for (const r of sorted) {
      /* ⚠️ 2026-09-29 (аудит 10): дугааргүй ажил жагсаалтад ОРОХГҮЙ — сарын мөр
         түүнд холбогдох түлхүүргүй; `0` гэж оруулбал давхар `w0` түлхүүр үүснэ. */
      const wid = idOf(r[CF_MONTH.id]);
      if (wid == null) continue;
      const chain: string[] = [];
      for (let d = 0; d < NF.length; d += 1) {
        const n = sOf(r[NF[d]]);
        if (d > 0 && n === '') break;
        chain.push(n);
      }
      let d = 0;
      while (d < chain.length && d < prev.length && chain[d] === prev[d]) d += 1;
      for (; d < chain.length; d += 1) {
        out.push({ kind: 'band', depth: d, code: sOf(r[FIN_XL_CODE[d]]), label: chain[d] });
      }
      prev = chain;
      out.push({ kind: 'work', row: r, id: wid });
    }
    return out;
  }, [sorted]);

  const cur = sel == null ? null : sorted.find((r) => idOf(r[CF_MONTH.id]) === sel) ?? null;
  const curMonths = sel == null ? [] : byWork.get(sel) ?? [];
  const curCost = costOf(cur);
  const curSum = sel == null ? null : sumOf(sel);
  /** 'huvaari' эхтэй гэрээ — сарууд тооцоолсон, засагдахгүй */
  const curHuv = sel != null && huvIds.has(sel);
  const curMoney = curHuv && sel != null ? mm?.contracts.get(sel) ?? null : null;
  const [switching, setSwitching] = useState(false);
  /** Шилжүүлж болох уу — багц нь Хуваарийн хуудастай (`PKG_KEYS`); эс бөгөөс сарын мөнгө тооцоологдохгүй */
  const curPkgOk = cur != null && PKG_KEYS.has(pkgKeyOf(cur[CASHFLOW_NEW.fields.pkg]));
  /* ⚠️ 2026-10-26 (хяналт): зөвхөн «Барилга угсралт» үе шатын гэрээ (`monthlyMoney.SWITCH_PHASE`-ийн ⚠️).
     ⚠️ 2026-10-26 (хяналт №2): `uy_shat` ХООСОН бол ч хаалттай (`switchPhaseWhy`). Хуудасны тооцоо хоосон/дутуу
     эсэхийг товч дарахад ШИНЭЭР уншина. */
  const curPhaseWhy = cur == null ? null : switchPhaseWhy(cur[CASHFLOW_NEW.fields.phase]);
  const curPhaseOk = cur != null && curPhaseWhy == null;
  const curSwitchable = cur != null && !curHuv && curPkgOk && curPhaseOk;
  /** Гараар сарын мөрийн нийт ₮ (`Cashflow_dun`) — устах дүн; дүнтэй мөр алга бол null (0 БИШ) */
  const curManualTotal = (() => {
    let any = false;
    let t = 0;
    for (const r of curMonths) { const v = nOf(r[CF_MONTH.amount]); if (v != null) { any = true; t += v; } }
    return any ? t : null;
  })();
  /* ⚠️ 2026-10-21: дахин ачаалалт хүлээж буй `pend` нь ХАДГАЛАГДСАН — засвар биш */
  const dirty = reloading ? 0 : Object.keys(pend).length;
  /** Хадгалж буй эсвэл хадгалсны дараах дахин ачаалалт — нүд/товч хаалттай */
  const locked = busy || reloading || switching;

  /* ⚠️ Хадгалаагүй засвартай байхад таб хаахад хөтөч анхааруулна — `Finance`-ийн
     IPC бөглөлттэй ижил зан (2026-09-23). Мөн эцэгт `onDirty` мэдэгдэнэ. */
  useEffect(() => {
    onDirty?.(dirty > 0);
    if (!dirty) return undefined;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);

  const save = async () => {
    if (locked || !dirty) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      /* Хувь → эцгийн ХО дүнгээр үржүүлж мөнгөн дүн — ⚠️ 2026-10-23: доор ШИНЭ уншилтаар (`recomputeFinanceAmounts`;
         дугааргүй эцэг `Cashflow_ID`-гүй тул ХО дүн бичигдэхгүй — 2026-09-29-ний дүрэм хэвээр) */
      const mById = new Map<number, Row>();
      for (const r of months) mById.set(Number(r[oidField]), r);

      /* ⚠️ 2026-09-24: тоо биш оролт («abc») урьд нь `null` болж ЧИМЭЭГҮЙ
         арилдаг байв — хадгалахгүй, саруудыг нэрлэж алдаа заана. */
      const bad = Object.entries(pend)
        .filter(([, v]) => badNum(v))
        .map(([k]) => monthKey(mById.get(Number(k))?.[CF_MONTH.start]));
      if (bad.length) {
        setErr(tr('Тоо биш утга: {0}. Зөвхөн тоо (жишээ нь 12.5) оруулна уу.', bad.join(', ')));
        return;
      }

      /* ⚠️ 2026-10-05: СӨРӨГ эсвэл 100-аас ИХ сарын хувь хадгалагдахгүй — урьд нь «-20» /
         «250» шууд бичигдэж, `Cashflow_dun` сөрөг эсвэл гэрээний дүнгээс их болон S-муруйд
         ордог байв. (ХО дүн `costOf`-оор > 0 тул хувь ≥ 0 бол дүн сөрөг гарахгүй.) */
      const outOfRange = Object.entries(pend)
        .filter(([, v]) => { const x = nOf(v); return x != null && (x < 0 || x > 100); })
        .map(([k]) => monthKey(mById.get(Number(k))?.[CF_MONTH.start]));
      if (outOfRange.length) {
        setErr(tr('Сарын хувь 0–100 хооронд байх ёстой: {0}.', outOfRange.join(', ')));
        return;
      }

      /* ⚠️ 2026-10-05: засагдсан ажлын нийлбэр 100% БИШ бол хадгалахын өмнө АСУУНА.
         Дэлгэцийн анхааруулга (доорх `c.warn`) ХЭВЭЭР — гэхдээ тэр нь зөвхөн СОНГОСОН
         ажлынхыг харуулдаг тул өөр ажлын дутуу/илүү нийлбэр чимээгүй хадгалагддаг байв.
         Бүх сарыг цэвэрлэсэн (нийлбэр `null`) ажил асуухгүй — «бөглөөгүй» нь зөв төлөв. */
      const offIds = new Set<number>();
      for (const k of Object.keys(pend)) {
        const wid = idOf(mById.get(Number(k))?.[CF_MONTH.id]);
        if (wid == null) continue;
        const s = sumOf(wid);
        if (s != null && fillOf(s) !== 'done') offIds.add(wid);
      }
      if (offIds.size) {
        const names = [...offIds].slice(0, 5).map((wid) => {
          const w = works.find((r) => idOf(r[CF_MONTH.id]) === wid);
          return `${sOf(w?.ajil_uilchilgee) || wid} — ${num(sumOf(wid) ?? 0, 2)}%`;
        });
        if (offIds.size > names.length) names.push('…');
        /* ⚠️ 2026-10-23 (UX аудит X1): апп доторх `askConfirm` — `window.confirm` «дахин бүү асуу»-гийн дараа
           чимээгүй false буцааж «Хадгалах» юу ч хийхгүй болдог байв. */
        if (!(await askConfirm(
          tr('Сарын хувийн нийлбэр 100% биш ажил: {0}. Ийм хэвээр хадгалах уу?', names.join('; ')),
          { ok: tr('Ийм хэвээр хадгалах') },
        ))) return;
      }

      /*
       * ⚠️ 2026-10-23: «Cashflow» хүснэгтийн нийтлэлтэй (`Finance` FullTable) НЭГ зам — эцэг ба сарыг серверээс ШИНЭЭР
       *    уншиж (`loadFinancePublishInputs`), өөр хэрэглэгчийн засвартай зөрвөл татгалзана (`FinancePublishConflict`),
       *    `Cashflow_dun`-г ШИНЭ `ho_dun_geree`-ээр бодно (`recomputeFinanceAmounts`), бичихийн өмнө дахин шалгана
       *    (`publishFinanceBatch`). Урьд нь хуудас нээх үеийн `works`/`months`-оор шууд `applyAll` хийдэг тул нөгөө
       *    хэрэглэгчийн хувийг чимээгүй дарж, хуучин ХО дүнгээр мөнгөн дүн бичдэг байв.
       * ⚠️ Хувийг АРИЛГАВАЛ дүн ч арилна (`null`), 0 болохгүй; гэрээний дүнгүй бол ч `null` — `amountOf`-ийн дүрэм.
       */
      const upd = new Map<number, Row>(Object.entries(pend).map(([k, v]) => {
        const oid = Number(k);
        return [oid, { [oidField]: oid, [CF_MONTH.pct]: nOf(v) }];
      }));
      const financeInputs = await loadFinancePublishInputs({
        updates: upd, parents: works, months, oidField,
        read: async ({ parentOids, monthOids, ids }) => {
          const parentWhere = [
            ...(parentOids.length ? [`${oidField} IN (${parentOids.join(',')})`] : []),
            ...(ids.length ? [`cashflow_id IN (${ids.join(',')})`] : []),
          ];
          const monthWhere = [
            ...(monthOids.length ? [`${oidField} IN (${monthOids.join(',')})`] : []),
            ...(ids.length ? [`cashflow_id IN (${ids.join(',')})`] : []),
          ];
          const [parents, freshMonths] = await Promise.all([
            parentWhere.length ? queryFeatures(CASHFLOW_NEW.url, {
              where: `(${CF_WORK_WHERE}) AND (${parentWhere.join(' OR ')})`, orderBy: `${oidField} ASC`,
            }) : Promise.resolve([]),
            monthWhere.length ? queryFeatures(CASHFLOW_NEW.url, {
              where: `(${CF_MONTH_WHERE}) AND (${monthWhere.join(' OR ')})`, orderBy: `${oidField} ASC`,
            }) : Promise.resolve([]),
          ]);
          return { parents, months: freshMonths };
        },
      });
      recomputeFinanceAmounts({
        updates: upd, parents: financeInputs?.parents ?? works, months: financeInputs?.months ?? months, oidField, deletes: [],
      });
      /* Гэрээний дүнгүй ажлын сарууд — хувь бичигдэнэ, дүн `null` (0 БИШ) */
      let noCost = 0;
      for (const u of upd.values()) if (u[CF_MONTH.pct] != null && u[CF_MONTH.amount] == null) noCost += 1;
      const { n } = await publishFinanceBatch(financeInputs, () =>
        applyAll(CASHFLOW_NEW.url, oidField, { updates: [...upd.values()] }, { cap: 'finEdit' }));
      invalidate('CASHFLOW_NEW');
      /* ⚠️ 2026-10-21: `setPend({})` БИШ — шинэ `months` ирэх хүртэл бичсэн утга харагдана (`pubFrom`) */
      setPubFrom(months);
      setMsg(noCost
        ? tr('{0} сар хадгалагдав · {1} сар гэрээний дүнгүй тул ₮ бичигдсэнгүй', n, noCost)
        : tr('{0} сар хадгалагдав', n));
      onSaved();
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * «ГАРААР → ХУВААРЬ» ШИЛЖҮҮЛЭХ (2026-10-26) — гараар сарын мөрүүд УСТАНА, буцаахгүй → `askConfirm` (danger).
   * ⚠️ Хадгалаагүй засвартай үед хаалттай: устгах мөрийн засвар илгээгдэлгүй алга болно.
   * ⚠️ Хариу алдагдсан бол `switchToHuvaari` дахин уншиж баталдаг; батлагдаагүй бол алдаа нь «дахин ачаалж шалга».
   */
  /*
   * ⚠️ 2026-10-26 (хяналт): ШИЛЖҮҮЛЭХИЙН ӨМНӨ багцын тооцоог ШИНЭЭР уншина (`previewSwitch`) — батлуулах цонх устах
   *    гараар нийт ба гарах тооцоолсон нийтийг ХОЁУЛАНГ нь нэрлэнэ. Уншигдаагүй бол татгалзана; хоосон/дутуу бол ХОЁР
   *    ДАХЬ тусгай анхааруулга асууж, зөвшөөрвөл л `allowIncomplete`. Урьд нь задаргаа 0 мөртэй үед гараар мөр
   *    устаж, оронд нь юу ч гарахгүй байсан ч цонх энэ тухай хэлдэггүй байв.
   */
  const doSwitch = async () => {
    /* ⚠️ 2026-10-26: сарын задаргаа уншигдаагүй (`monthsError`) бол ШИЛЖҮҮЛЭХГҮЙ — `curMonths` хоосон тул цонх «0 мөр (нийт —)
       устана» гэж худал асууж, `switchToHuvaari` серверээс дахин уншаад БҮХ гараар мөрийг буцаалтгүй устгадаг байв
       («Төсөл төлөвлөгөө биелэлт»-ийн ижил товч `ProjectPlanTable` үүгээр аль хэдийн хаагддаг) */
    if (!cur || sel == null || locked || dirty || !canSwitch || !curSwitchable || monthsError) return;
    const name = sOf(cur.ajil_uilchilgee) || String(sel);
    setErr(null);
    setMsg(null);
    /* ⚠️ 2026-10-26 (хяналт №2): урсгал нь `monthlyMoney.confirmAndSwitch`-д — «Төсөл төлөвлөгөө биелэлт»-ийн товчтой НЭГ */
    try {
      const fl = await confirmAndSwitch({
        cashflowId: sel, name, pkg: pkgKeyOf(cur[CASHFLOW_NEW.fields.pkg]), phase: cur[CASHFLOW_NEW.fields.phase],
        manualRows: curMonths.length, manualTotal: curManualTotal, money: mnt, ask: askConfirm, onBusy: setSwitching,
      });
      if (fl.kind === 'refused') { setErr(fl.msg); return; }
      if (fl.kind === 'cancel') return;
      const r = fl.result;
      setMsg(r.already ? tr('Аль хэдийн Хуваарь эхтэй') : tr('Хуваарь руу шилжүүлэв · {0} сарын мөр устгав', r.deleted));
      onSaved();
    } catch (e) {
      setErr(userError(e));
    } finally {
      setSwitching(false);
    }
  };

  /** Ажлын мөрийн бөглөлтийн цэг */
  const dot = (id: number) => {
    const s = huvIds.has(id) ? huvSum(id) : sumOf(id);
    const st = fillOf(s);
    const title = s == null
      ? tr('Бөглөөгүй')
      : tr('Нийт {0}%', num(s, 2));
    return <i className={`${c.dot} ${fillCls(st)}`} title={title} aria-label={title} />;
  };

  return (
    <div className={c.wrap}>
      <div className={c.side}>
        <div className={c.sideHd}>
          {tr('Ажлууд')}
          <span className={c.legend}>
            <i className={`${c.dot} ${c.done}`} />{tr('100%')}
            <i className={`${c.dot} ${c.part}`} />{tr('дутуу')}
            <i className={`${c.dot} ${c.none}`} />{tr('хоосон')}
          </span>
        </div>
        <ul className={c.list}>
          {listRows.map((it, i) => (it.kind === 'band' ? (
            <li
              key={`b${i}`}
              className={c.band}
              style={{ paddingLeft: 10 + it.depth * 12 }}
            >{it.code ? `${it.code} · ${it.label}` : it.label}</li>
          ) : (
            <li key={`w${it.id}`}>
              <button
                type="button"
                className={`${c.work} ${sel === it.id ? c.workOn : ''}`}
                onClick={() => setSel(it.id)}
              >
                {dot(it.id)}
                <span className={c.pkg}>{sOf(it.row.bagts) || '—'}</span>
                <span className={c.nm}>{sOf(it.row.ajil_uilchilgee)}</span>
                {/* ⚠️ 2026-10-26: тооцоолсон эхтэй гэрээ — сарууд засагдахгүй */}
                {huvIds.has(it.id) && <span className={c.pkg} title={tr('Сарын мөнгө Хуваарь-аас тооцоологдоно')}>{tr('Хуваарь')}</span>}
              </button>
            </li>
          )))}
        </ul>
      </div>

      <div className={c.main}>
        {cur == null ? (
          <p className={c.hint}>{tr('Зүүн талаас ажил сонгоно уу.')}</p>
        ) : (
          <>
            <div className={c.hd}>
              <h3>{sOf(cur.ajil_uilchilgee)}</h3>
              <p className={c.sub}>
                {sOf(cur.bagts) || '—'}
                {' · '}
                {tr('ХО дүн: {0}', mnt(curCost))}
                {' · '}
                {curHuv ? tr('Эх: Хуваарь (тооцоолсон)') : tr('{0} сар', curMonths.length)}
              </p>
              {curCost == null && (
                <p className={c.warn}>{tr('Гэрээний дүнгүй — ₮ бодогдохгүй')}</p>
              )}
            </div>

            {curHuv ? (
              /* ⚠️ 2026-10-26: ТООЦООЛСОН сарууд — ЗӨВХӨН УНШИНА (толгойн ⚠️). Гараар мөр (үлдсэн бол ч) харагдахгүй,
                 засагдахгүй. Хувь = дүн ÷ ХО дүн × 100 (`monthlyMoney`-ийн ⚠️); null ≠ 0 — сар алга бол шалтгааныг хэлнэ. */
              mm == null ? (
                moneyQ.state === 'error'
                  ? <p className={c.warn}>{tr('Тооцоолсон сарын мөнгө уншигдсангүй. Хуудсыг дахин ачаална уу.')}</p>
                  : <p className={c.hint}>{tr('Хуваарь-аас сарын мөнгө тооцоолж байна…')}</p>
              ) : !curMoney || !curMoney.months.size ? (
                <p className={c.hint}>{huvStateText(curMoney?.state ?? 'empty')}</p>
              ) : (
                <>
                  <table className={c.tbl}>
                    <thead>
                      <tr>
                        <th>{tr('Сар')}</th>
                        <th className={c.r}>{tr('Хувь, %')}</th>
                        <th className={c.r}>{tr('Дүн')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...curMoney.months.keys()].sort().map((k) => {
                        const v = curMoney.months.get(k)!;
                        return (
                          <tr key={k} className={c.rowDone}>
                            <td>{k}</td>
                            <td className={c.r}>{curCost == null ? '—' : `${num((v / curCost) * 100, 2)}%`}</td>
                            <td className={c.r}>{mnt(v)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>{tr('НИЙТ')}</td>
                        <td className={c.r}>{(() => { const s = huvSum(sel!); return s == null ? '—' : `${num(s, 2)}%`; })()}</td>
                        <td className={c.r}>{mnt([...curMoney.months.values()].reduce((a, x) => a + x, 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {/* ⚠️ 2026-10-26 (хяналт): нэгжгүй/олдоогүй нүдтэй бол НИЙТ ДУТУУ — «ok» хүснэгт дутууг нуухгүй (null ≠ 0) */}
                  {(curMoney.noUnit > 0 || curMoney.noRow > 0) && (
                    <p className={c.warn}>
                      {tr('⚠ НИЙТ дутуу: багцын Хуваарийн {0} нүд нэгж өртөггүй, {1} нүд бөглөх хуудсанд олдоогүй тул ₮-д тооцогдсонгүй.', curMoney.noUnit, curMoney.noRow)}
                    </p>
                  )}
                  <p className={c.hint}>
                    {tr('Сарын мөнгө = Хуваарийн сарын обьём × бөглөх хуудасны нэгж өртөг — энд засагдахгүй.')}
                    {curMoney.share != null && curMoney.share < 1 && ` ${tr('Багцын Хуваарийн {0}% (ХО дүнгийн харьцаа).', num(curMoney.share * 100, 1))}`}
                  </p>
                </>
              )
            ) : curMonths.length === 0 ? (
              /* ⚠️ Огноогүй ажилд сарын мөр үүсдэггүй — шалтгааныг ХЭЛНЭ,
                 эс бөгөөс хүн хоосон дэлгэц хараад алдаа гэж бодно.
                 ⚠️ 2026-09-29 (аудит 10): ГУРВАН шалтгаан ялгана. Урьд нь үргэлж
                 «хугацаа бөглөгдөөгүй» гэдэг байв — (1) сарын задаргаа УНШИГДААГҮЙ
                 (`monthsError`) үед ч, (2) огноо БӨГЛӨГДСӨН атлаа сар үүсээгүй
                 (огноотой нэмсэн мөр / порталаас огноо засаагүй) үед ч. */
              monthsError ? (
                <p className={c.warn}>
                  {tr('Сарын задаргаа уншигдсангүй. Хуудсыг дахин ачаална уу.')}
                </p>
              ) : cur.ehleh_ognoo != null && cur.duusah_ognoo != null ? (
                <p className={c.hint}>
                  {tr('Төлөвлөгөөт хугацаа бөглөгдсөн боловч сарын мөр үүсээгүй байна. Гэрээний бүртгэлд эхлэх/дуусах огноог засаж нийтлэхэд сарууд үүснэ.')}
                </p>
              ) : (
                <p className={c.hint}>
                  {tr('Төлөвлөгөөт хугацаа бөглөгдөөгүй тул сар үүсээгүй. Эхлэх/дуусах огноог гэрээний бүртгэлээс оруулна уу.')}
                </p>
              )
            ) : (
              <>
                <table className={c.tbl}>
                  <thead>
                    <tr>
                      <th>{tr('Сар')}</th>
                      <th className={c.r}>{tr('Хувь, %')}</th>
                      <th className={c.r}>{tr('Дүн')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {curMonths.map((r) => {
                      const oid = Number(r[oidField]);
                      const raw = oid in pend ? pend[oid] : (r[CF_MONTH.pct] == null ? '' : String(r[CF_MONTH.pct]));
                      const pct = nOf(raw);
                      return (
                        <tr key={oid} className={pct == null ? c.rowNone : c.rowDone}>
                          <td>{monthKey(r[CF_MONTH.start])}</td>
                          <td className={c.r}>
                            {/* ⚠️ 2026-09-25: `finEdit`-гүй хүнд `readOnly` — урьд нь зөвхөн
                                «Хадгалах» хаалттай байж, нүд засагдан `pend` өсөж, хэзээ ч
                                хадгалж чадахгүй засварт beforeunload/таб солих баталгаа гардаг байв. */}
                            <input
                              className={c.inp}
                              value={raw}
                              inputMode="decimal"
                              /* ⚠️ 2026-09-29 (аудит 10): хадгалж байх үед (`busy`) ч `readOnly` —
                                 `save` нь `await applyAll`-ийн дараа `pend`-ийг бүхэлд нь
                                 цэвэрлэдэг тул тэр хооронд бичсэн хувь илгээгдэлгүй арилж,
                                 «хадгалагдав» гэж худал мэдэгддэг байв. */
                              /* ⚠️ 2026-10-21: дахин ачаалалт хүлээх үед ч (`locked`) */
                              readOnly={!canEdit || locked}
                              aria-label={tr('{0}-ны хувь', monthKey(r[CF_MONTH.start]))}
                              onChange={(e) => {
                                if (!canEdit || locked) return;
                                const v = e.target.value;
                                /* ⚠️ 2026-09-25: анхны утга руугаа БУЦВАЛ засвар биш — `pend`-ээс
                                   хасна. Урьд нь үлдэж, «Хадгалах (N)» ба таб солих баталгаа
                                   өөрчлөлтгүй ажилд ч гардаг байв (Finance-ийн `onEdit`-тэй ижил). */
                                const orig = r[CF_MONTH.pct] == null ? '' : String(r[CF_MONTH.pct]);
                                setPend((p) => {
                                  const nx = { ...p };
                                  if (v === orig) delete nx[oid];
                                  else nx[oid] = v;
                                  return nx;
                                });
                              }}
                            />
                          </td>
                          {/* ⚠️ Дүн нь ЗӨВХӨН харагдац — хадгалахдаа дахин бодогдоно */}
                          <td className={c.r}>{pct == null ? '' : curCost == null ? '—' : mnt((curCost * pct) / 100)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={fillCls(fillOf(curSum))}>
                      <td>{tr('НИЙТ')}</td>
                      <td className={c.r}>{curSum == null ? '—' : `${num(curSum, 2)}%`}</td>
                      <td className={c.r}>
                        {curSum == null ? '' : curCost == null ? '—' : mnt((curCost * curSum) / 100)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                {/* ⚠️ 100%-иас зөрсөн бол ЗААВАЛ хэлнэ: дутуу төлөвлөгөө нь
                    S-муруйг чимээгүй тэгшитгэдэг. */}
                {curSum != null && fillOf(curSum) === 'part' && (
                  <p className={c.warn}>
                    {tr('⚠ Нийлбэр 100% биш ({0}%) — үлдэгдэл нь S-муруйд орохгүй.', num(curSum, 2))}
                  </p>
                )}
                {curSum != null && fillOf(curSum) === 'over' && (
                  <p className={c.warn}>
                    {tr('⚠ Нийлбэр 100%-иас их ({0}%) — S-муруй гэрээний дүнгээс давна.', num(curSum, 2))}
                  </p>
                )}
              </>
            )}
          </>
        )}

        {/* ⚠️ 2026-10-26 (хяналт): `MonthlyMoney.issues` (нэгжгүй/олдоогүй нүд, хуваалцсан багц, уншигдаагүй хуудас) — урьд
            нь хаана ч харагддаггүй байв. 'huvaari' гэрээ сонгосон үед л (гараар замын дэлгэц ӨӨРЧЛӨГДӨХГҮЙ). */}
        {curHuv && mm != null && mm.issues.length > 0 && (
          <details className={c.warn}>
            <summary>{tr('Тооцоолсон сарын мөнгөний анхааруулга: {0}', mm.issues.length)}</summary>
            <ul>{mm.issues.slice(0, 100).map((s, i) => <li key={i}>{s}</li>)}</ul>
          </details>
        )}

        <div className={c.bar}>
          {err && <span className={c.err}>{err}</span>}
          {msg && <span className={c.ok}>{msg}</span>}
          {/*
            * ЦЭВЭРЛЭХ — сонгосон ажлын БҮХ сарын хувийг хоослоно.
            *
            * ⚠️ ШУУД БИЧИХГҮЙ: «Хадгалах» дармагц л үйлчилнэ. Ингэснээр буруу
            * дарсан хүн зүгээр л табаа солиод буцаж чадна — нэг товшилтоор
            * 28 сарын ажил алга болохгүй.
            * ⚠️ `null` бичнэ, 0 БИШ: «бөглөөгүй» ба «энэ сард гүйцэтгэл
            * байхгүй» хоёр ӨӨР мэдэгдэл.
            */}
          {/* ⚠️ 2026-10-26: «Хуваарь руу шилжүүлэх» — `cfSwitch` эрхтэй, 'garaar' гэрээ, багц нь хуудастай үед л */}
          {canSwitch && cur != null && !curHuv && (
            <button
              type="button"
              className={c.clear}
              disabled={locked || dirty > 0 || !curSwitchable || monthsError}
              title={monthsError
                ? tr('Сарын задаргаа уншигдсангүй — хуудсыг дахин ачаална уу')
                : !curPkgOk
                ? tr('Энэ гэрээний багцад Хуваарийн бөглөх хуудас алга')
                : curPhaseWhy != null ? curPhaseWhy
                : dirty > 0 ? tr('Эхлээд засвараа хадгална уу') : tr('Гараар сарын мөрийг устгаж, сарын мөнгийг Хуваарь-аас тооцоолно')}
              onClick={() => { void doSwitch(); }}
            >
              {switching ? tr('Шилжүүлж байна…') : tr('Хуваарь руу шилжүүлэх')}
            </button>
          )}
          {canEdit && cur != null && !curHuv && curMonths.length > 0 && (
            <button
              type="button"
              className={c.clear}
              disabled={locked || curSum == null}
              title={tr('Энэ ажлын бүх сарын хувийг хоослоно')}
              onClick={() => setPend((p) => {
                const nx = { ...p };
                /* ⚠️ 2026-09-25: АЛЬ ХЭДИЙН хоосон сарыг «засвар» гэж тэмдэглэхгүй —
                   урьд нь бүгдийг `''` болгож, өөрчлөгдөөгүй сарууд ч «Хадгалах (N)»-д
                   тоологдож, илгээгддэг байв. */
                for (const r of curMonths) {
                  const oid = Number(r[oidField]);
                  const orig = r[CF_MONTH.pct] == null ? '' : String(r[CF_MONTH.pct]);
                  if (orig === '') delete nx[oid];
                  else nx[oid] = '';
                }
                return nx;
              })}
            >
              {tr('Цэвэрлэх')}
            </button>
          )}
          <button
            type="button"
            className={c.save}
            disabled={locked || !dirty || !canEdit}
            onClick={save}
          >
            {locked ? tr('Хадгалж байна…') : tr('Хадгалах ({0})', dirty)}
          </button>
        </div>
      </div>
    </div>
  );
}
