'use client';

/**
 * ТӨСЛИЙН НЭГТГЭЛ ГҮЙЦЭТГЭЛ — ажлын задаргааны (WBS) модны хүснэгт.
 *
 * ⚠️⚠️ 2026-09-25: ХАРАГДАЦ нь эх Excel-ийн «Төсөл төлөвлөгөө биелэлт» хуудсыг
 * ДУУРАЙНА (хэрэглэгч `docs/Төсөл Гүйцэтгэл_…_260924 - V2_backup.xlsx`-ийг
 * загвар болгож өгсөн): ижил 13 багана, «ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ» мөр, мөрийн
 * өнгө (үе шат · бүлэг · барилга угсралтын дэд хэсэг), бүлэг бүрийг нээх/хаах
 * (Excel-ийн outline), зүүн 6 багана ба толгой царцсан (Excel-ийн freeze).
 * Баганыг нууж, чирж өргөсгөж болно (хэрэглэгчийн заавар, 2026-09-25).
 *
 * ⚠️ ЭХ: мод ба жин `Negtgel_guitsetgel/0`-оос; гүйцэтгэл/төлөвлөгөө нь
 * СИСТЕМЭЭС АВТОМАТААР бодогдож, хүснэгт рүү ч буцаж бичигдэнэ
 * (`negtgelAuto.ts`). Эх унавал хадгалсан утгаа харуулна.
 *
 * ⚠️⚠️ 2026-10-13 (хэрэглэгч: «Negtgel_guitsetgel_1013-ийг хуучин нэгтгэл гүйцэтгэлээр соль; харагдуулах ба
 *    томьёолол нь docs/…261007 - V3.xlsx-ийн «Төсөл төлөвлөгөө биелэлт» хуудас»): эх нь
 *    `Negtgel_guitsetgel_1013` (906 мөр, ЗӨВХӨН уншина). Багана нь тэр хуудасны B…W-ийн ЯГ дарааллаар (22):
 *    Д/Д · Багц · Нэр · Төсөв · Хэсэгт эзлэх · Төсөлд эзлэх · Гэрээ/Хавсралт 5 (эхлэх · дуусах) · Гүйцэтгэгч
 *    (эхлэх · дуусах) · Бодит (эхлэх · дуусах) · Төлөвлөгөөт хувь ×5 (Гэрээ · Гэрээ ГЧ · Гүйцэтгэгч · Next week ·
 *    Өмнө долоо хоног) · Гүйцэтгэлийн хувь · Биелэлт ×4 (Гэрээ · Гэрээ ГЧ · Гүйцэтгэгч · Weekly). Мод нь
 *    Excel-ийн томьёоноос (`negtgelTree.ts`); хүснэгт таарахгүй бол кодоор угсарч ИЛ анхааруулна. Синк `off`.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { t as tr } from '@/lib/i18nCore';
import { useAsync, type Async } from '@/lib/useAsync';
import { useSyncRef } from '@/lib/useSyncRef';
import { setNavDirty } from '@/lib/navGuard';
import { Data, userError } from '@/components/ui';
/* ⚠️ 2026-10-23 (UX аудит X1): `window.confirm` → аппын дотоод асуулт */
import { askConfirm } from '@/lib/confirm';
import { pct as fmtPct, num } from '@/lib/format';
import { loadNegtgelFull, dropNegtgelFull, negDisplay, negtgelTree, type NegtgelFull, type NegtgelRow, type NegtgelCalc } from '@/lib/negtgel';
import { computeNegAuto, syncNegtgel, type NegRaw, type NegSyncState } from '@/lib/negtgelAuto';
import {
  applyNegEdits, negDiffers, negEditable, negForm, negServiceCanUpdate, negTotals, parseNegInput, publishNegEdits, type NegEditKey,
} from '@/lib/negtgelEdit';
import { useAuth } from '@/components/AuthGate';
import { roleForUser } from '@/lib/services';
import n from './negtgel.module.css';
/* Баруун товшилтын цэс ба сонголтын тэмдэг — Санхүүжилтийн хүснэгттэй НЭГ загвар */
import f from './finance.module.css';

/** Гүн бүрийн нэмэлт догол (px) */
const INDENT = 12;
/* ⚠️ 2026-10-14: 6-р түвшин хүртэл догол — Excel-ийн задаргаа 6 түвшинтэй (`LEVELS`-ийн ⚠️) */
const indentOf = (depth: number) => Math.max(0, Math.min(depth, 6) - 1) * INDENT;
/** ArcGIS огноо (ms) → «YYYY-MM-DD» — ⚠️ UTC өдөр (Excel-ээс 00:00Z-ээр хадгалагдсан) */
const ymd = (ms: number | null | undefined) => (ms == null || !Number.isFinite(ms) ? '' : new Date(ms).toISOString().slice(0, 10));

/**
 * Outline товчнууд — Excel-ийн задаргаа 6 түвшинтэй.
 * ⚠️ 2026-09-25: 5 ба 6 НЭГТГЭГДСЭН байв (хуучин хүснэгтэд 6-р түвшин ердөө 20 мөр).
 * ⚠️ 2026-10-14 (хэрэглэгч: «түвшний задаргаа Excel дээр 6, манай систем дээр 5»): `Negtgel_guitsetgel_1013`-д
 *    6-р түвшин 141 мөр (барилга угсралтын блок/ажил) — 6 товч, Excel-тэй ижил. Сүүлийн товч = БҮХ түвшин.
 */
const LEVELS = [1, 2, 3, 4, 5, 6];
const ALL_DEPTH = 99;
const depthOf = (btn: number) => (btn === LEVELS[LEVELS.length - 1] ? ALL_DEPTH : btn);

/** Нэрийн харьцуулалт — зай, цэг, хаалтын ялгааг үл тоомсорлоно */
const nk = (v: string) => v.toLowerCase().replace(/[\s.,()/"'«»-]/g, '');

/**
 * АНХДАГЧ ХААЛТТАЙ БҮЛГҮҮД — эх Excel-ийн хадгалсан байдал: ТЭЗҮ, Зөвшөөрөл,
 * Сонгон шалгаруулалт, «5.1 Бэлтгэл ажил» хураалттай; бусад нь нээлттэй.
 * ⚠️ Нэрээр — «3» код хоёр мөрд давхардсан.
 */
const CLOSED_BY_DEFAULT = new Set(['ТЭЗҮ', 'Зөвшөөрөл', 'Сонгон шалгаруулалт', 'Бэлтгэл ажил'].map(nk));

/**
 * МӨРИЙН ӨНГӨ — эх Excel-ийн дүүргэлт (цайвар горимд бүдэг хувилбар нь,
 * `negtgel.module.css`):
 *   · үе шат (1-р түвшин), нийт мөр ........................ #215F9A
 *   · 2-р түвшин ............................................ #A6CAEC
 *   · «Барилга угсралт» → 5.1-ийн дэд хэсэг (5.1.1 …) ....... #C1E5F5
 *   · «Барилга угсралт» → 5.2-ын дэд хэсэг (5.2.1 …) ........ #0B3041
 *   · түүний доторх бүлэг (5.2.3.1 …) ....................... #D1D1D1
 *   · бусад бүлэг (3-аас доош) .............................. #DCEAF7
 *   · навч ................................................... цагаан
 */
type Tone = 'stage' | 'l2' | 'prep' | 'work' | 'workSub' | 'grp' | '';
function toneOf(
  i: number,
  rows: NegtgelRow[],
  parent: number[],
  isGroup: boolean,
): Tone {
  const d = rows[i].depth;
  if (d <= 1) return 'stage';
  if (d === 2) return 'l2';
  /* Үе шат ба 2-р түвшний өвөг */
  let k = i;
  const chain: number[] = [];
  while (k >= 0) { chain.push(k); k = parent[k]; }
  const stage = rows[chain[chain.length - 1]];
  const l2 = chain.length >= 2 ? rows[chain[chain.length - 2]] : null;
  if (nk(stage.name) === nk('Барилга угсралт') && l2) {
    if (nk(l2.name) === nk('Бэлтгэл ажил') && d === 3) return 'prep';
    if (nk(l2.name) === nk('Барилга угсралт ажил')) {
      if (d === 3) return 'work';
      if (d === 4 && isGroup) return 'workSub';
    }
  }
  return isGroup ? 'grp' : '';
}

/* ═══════════════ БАГАНА — нуух / өргөсгөх (2026-09-25) ═══════════════ */

type ColKey = 'code' | 'bagts' | 'name' | 'budget' | 'inSection' | 'inProject'
  | 'ctStart' | 'ctEnd' | 'exStart' | 'exEnd' | 'actStart' | 'actEnd'
  | 'planG' | 'planGch' | 'planGu' | 'planNw' | 'planPw' | 'act' | 'perfG' | 'perfGch' | 'perfGu' | 'perfWk';

/**
 * ТОЛГОЙН БҮЛЭГ — Excel-ийн 4-р мөрөнд ХЭВТЭЭ нэгтгэсэн нүд (H4:I4 · J4:K4 · L4:M4), 5-р мөрөнд дэд толгой.
 * ⚠️ 2026-10-14 (хэрэглэгч: «нэгтгэл гүйцэтгэл дээр харагдацыг Excel шиг болго — толгой хэсэг merge-тэй»):
 *    бусад багана 4–5-р мөрийг БОСООГООР нэгтгэсэн (`rowSpan=2`). Бүлгийн нүд нь багана БИШ — сонгох/нуух/
 *    өргөсгөх нь дэд толгой дээр; бүх дэд багана нуугдвал бүлэг ч алга болно.
 */
type GrpKey = 'ct' | 'ex' | 'act';
const GROUPS: { key: GrpKey; label: () => string }[] = [
  { key: 'ct', label: () => tr('Гэрээ/Хавсралт 5') },
  { key: 'ex', label: () => tr('Гүйцэтгэгч') },
  { key: 'act', label: () => tr('ОСНАУГ/Газар чөлөөлөлт/ хуулийн маргаан/Өндөржилт нөлөөлөл') },
];
const GROUP = new Map(GROUPS.map((g) => [g.key, g]));

/**
 * БАГАНУУД — эх Excel-ийн B…W дарааллаар (2026-10-13: огноо H…M, Q · R · W нэмэгдэв).
 * ⚠️ `grp` — толгойн бүлэг (дээрх ⚠️); `label` нь Excel-ийн 5-р мөрийн ДЭД нэр, бүтэн нэр `fullLabel`.
 * ⚠️ Царцаалт нь хэрэглэгчийн сонголт (`ColPrefs.freeze`), анхдагч нь Excel-ийн A…G.
 * ⚠️ Нэр нь функц: хэл солиход дахин орчуулагдана.
 */
const COLS: { key: ColKey; label: () => string; w: number; grp?: GrpKey }[] = [
  { key: 'code', label: () => tr('Д/Д'), w: 92 },
  { key: 'bagts', label: () => tr('Багцын дугаар'), w: 104 },
  { key: 'name', label: () => tr('Ажлын нэр'), w: 320 },
  { key: 'budget', label: () => tr('Урьдчилсан төсөвт өртөг'), w: 140 },
  { key: 'inSection', label: () => tr('Хэсэгт эзлэх'), w: 104 },
  { key: 'inProject', label: () => tr('Төсөлд эзлэх хувь'), w: 130 },
  { key: 'ctStart', label: () => tr('Төлөвлөгөөт эхлэх'), w: 110, grp: 'ct' },
  { key: 'ctEnd', label: () => tr('Төлөвлөгөөт дуусах'), w: 110, grp: 'ct' },
  { key: 'exStart', label: () => tr('Төлөвлөгөөт эхлэх'), w: 110, grp: 'ex' },
  { key: 'exEnd', label: () => tr('Төлөвлөгөөт дуусах'), w: 110, grp: 'ex' },
  { key: 'actStart', label: () => tr('Бодит Эхлэх'), w: 110, grp: 'act' },
  { key: 'actEnd', label: () => tr('Бодит дуусах'), w: 110, grp: 'act' },
  { key: 'planG', label: () => tr('Төлөвлөгөөт хувь Гэрээ Хавсралт 5'), w: 260 },
  { key: 'planGch', label: () => tr('Төлөвлөгөөт хувь Гэрээ-Газар чөлөөлөлт хуулийн маргаан хассан Хавсралт 5'), w: 220 },
  { key: 'planGu', label: () => tr('Төлөвлөгөөт хувь Гүйцэтгэгч'), w: 160 },
  { key: 'planNw', label: () => tr('Төлөвлөгөөт хувь Next week'), w: 150 },
  { key: 'planPw', label: () => tr('Төлөвлөгөөт хувь Өмнө долоо хоног'), w: 170 },
  { key: 'act', label: () => tr('Гүйцэтгэлийн хувь'), w: 150 },
  { key: 'perfG', label: () => tr('Төлөвлөгөө биелэлт Гэрээ'), w: 170 },
  { key: 'perfGch', label: () => tr('Төлөвлөгөө биелэлт Гэрээ-Газар чөлөөлөлт хуулийн маргаан хассан'), w: 220 },
  { key: 'perfGu', label: () => tr('Төлөвлөгөө биелэлт- Гүйцэтгэгч'), w: 170 },
  { key: 'perfWk', label: () => tr('Төлөвлөгөө биелэлт Weekly'), w: 150 },
];
const COL = new Map(COLS.map((c) => [c.key, c]));
/** Бүтэн нэр — «Бүлэг · дэд» (цэсний толгой, title) */
const fullLabel = (k: ColKey): string => {
  const c = COL.get(k)!;
  return c.grp ? `${GROUP.get(c.grp)!.label()} · ${c.label()}` : c.label();
};
/** ⚠️ «Ажлын нэр»-ийг нуухгүй — бүлгийг нээх/хаах нь тэр нүдэн дээр */
const LOCKED: ColKey = 'name';
const MIN_W = 40;
const LEAD: ColKey[] = ['code', 'bagts', 'name'];

/**
 * ⚠️ Тохиргоо нь ЗӨВХӨН тухайн хөтөчид (localStorage) — хүн бүр өөрийн
 * харагдацтай. Хувийн хөтөч/хаалттай хадгалалтад ч хуудас эвдрэхгүй (try).
 */
const LS_KEY = 'selbe.negtgel.cols.v1';
/**
 * `freeze` — энэ багана ХҮРТЭЛ (өөрийг нь оруулаад) царцаана; `''` = царцаахгүй.
 * ⚠️ Анхдагч нь Excel-ийнх: «Төсөлд эзлэх хувь» хүртэл (A…G).
 */
type ColPrefs = {
  hidden: ColKey[];
  w: Partial<Record<ColKey, number>>;
  freeze?: ColKey | '';
  /** Бичвэр мөр шилжүүлэх баганууд (Санхүүжилтийн «Wrap text») */
  wrap?: ColKey[];
};
const DEFAULT_FREEZE: ColKey = 'inProject';
function readPrefs(): ColPrefs {
  try {
    const j = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') as ColPrefs | null;
    if (j && Array.isArray(j.hidden) && j.w && typeof j.w === 'object') {
      const freeze = j.freeze === '' || (j.freeze && COL.has(j.freeze)) ? j.freeze : DEFAULT_FREEZE;
      const wrap = Array.isArray(j.wrap) ? j.wrap.filter((k) => COL.has(k)) : [];
      /* ⚠️ 2026-09-25: ЗӨВХӨН мэдэгдэх баганын хязгаартай тоон өргөн — эвдэрсэн
         (`null`, `"abc"`, 0, Infinity) утга багана алга болгож/хүснэгт тэлдэг байв. */
      const w: Partial<Record<ColKey, number>> = {};
      for (const [k, v] of Object.entries(j.w)) {
        if (COL.has(k as ColKey) && typeof v === 'number' && Number.isFinite(v) && v >= MIN_W) w[k as ColKey] = v;
      }
      return { hidden: j.hidden.filter((k) => COL.has(k) && k !== LOCKED), w, freeze, wrap };
    }
  } catch { /* хадгалалт хаалттай — анхдагч */ }
  return { hidden: [], w: {}, freeze: DEFAULT_FREEZE };
}

export function TusulNegtgel() {
  const q = useAsync(loadNegtgelFull, []);
  /**
   * ⚠️ 2026-10-19 (аудит): НИЙТЛЭЭГҮЙ ЗАСВАРТАЙ үед (`NegBody`-ийн `onDirty`) арын дахин уншилт (dataBus ·
   *    «Шинэчлэх» · синкийн `onDone`) уналт/ачаалалт руу шилжвэл `Data` нь `NegBody`-г САЛГАЖ засвар бүгд алга
   *    болдог байв. Одоо сүүлийн амжилттай өгөгдлийг (`last`) барьж `NegBody`-г ИЖИЛ модонд (`Data`-аар, бэлэн
   *    төлөвөөр) үлдээнэ; уналтыг тэр дотор нь ил хэлнэ (`reloadFailed`).
   */
  const [dirty, setDirty] = useState(false);
  const [last, setLast] = useState<NegtgelFull | null>(null);
  if (q.state === 'ready' && q.data !== last) setLast(q.data);
  const held = q.state !== 'ready' && dirty && last ? last : null;
  const qq: Async<NegtgelFull> = held ? { state: 'ready', data: held, error: null, retry: q.retry } : q;
  return (
    <Data q={qq} minH={320}>
      {(d) => (
        <>
          <SyncNotice
            live={d.live}
            failed={d.failed}
            sync={d.sync}
            onDone={() => { dropNegtgelFull(); q.retry?.(); }}
          />
          {/* ⚠️ 2026-10-13: хүснэгт Excel-ийн модтой таарахгүй (мөр нэмэгдсэн/хасагдсан) — кодоор угсарсан */}
          {d.tree === 'code' && (
            <p className={n.syncNote} role="status">
              {tr('Хүснэгтийн мөрүүд Excel-ийн модтой таарахгүй байна — модыг кодоор угсарлаа; эцэг-хүүхдийн холбоо Excel-ээс зөрж болно.')}
            </p>
          )}
          <NegBody d={d} onDirty={setDirty} reloadFailed={held != null && q.state === 'error'} />
        </>
      )}
    </Data>
  );
}

/* ═══════════════ ЗАСАХ · НИЙТЛЭХ (2026-10-15) ═══════════════
 *
 * ⚠️ Хэрэглэгч: «Cashflow шиг засах болон нийтлэх гэсэн хэсэг нэм, тэгээд тоог өөрчлөхөд томьёоны дагуу
 *    тооцоолол гарна». Санхүүжилтийн урсгалтай ИЖИЛ: «Засах» → Excel-ийн ОРОЛТ нүд засагдана (НОГООН) →
 *    томьёогоор шууд дахин бодогдоно (өөрчлөгдсөн томьёот нүд ЦЭНХЭР) → «Нийтлэх (n)» — НЭГ бичилтээр (`negtgelEdit.publishNegEdits`).
 *    Аль нүд оролт, аль нь томьёо вэ — `negtgelEdit.negForm` (хадгалсан утгаас танина).
 * ⚠️ Нийтлэхээс өмнө ЮУ Ч бичигдэхгүй; горимоос гарвал асууж байж хаяна.
 * ⚠️ Эрх: таб өөрөө super-т л харагдана (`Guitsetgel`); товч ч мөн super-т, бичих функц дахин шалгана.
 */

/** Багана → засварын түлхүүр (огноо, биелэлт — засагдахгүй) */
const EDIT_COL: Partial<Record<ColKey, NegEditKey>> = {
  budget: 'budget', inSection: 'w', inProject: 'p',
  planG: 'planG', planGch: 'planGch', planGu: 'planGu', planNw: 'planNw', planPw: 'planPw', act: 'act',
};
/** Багана → загварын талбар (томьёогоор өөрчлөгдсөнийг цэнхэрлэхэд) */
const MODEL_COL: Partial<Record<ColKey, keyof NegRaw>> = {
  ...EDIT_COL, perfG: 'perfG', perfGch: 'perfGch', perfGu: 'perfGu', perfWk: 'perfWk',
};

export type NegEditApi = {
  /** Энэ нүд засагдах уу (Excel-ийн оролт) */
  can: (oid: number, k: ColKey) => boolean;
  /** Загварын утга — хувь 0–1, төсөв ₮ */
  value: (oid: number, k: ColKey) => number | null;
  /** Оруулсан бичвэрийг хэрэгжүүлнэ — татгалзвал шалтгаан (⚠️ 2026-10-19: нүд буцааж тэмдэглэнэ), эс бөгөөс `null` */
  set: (oid: number, k: ColKey, text: string) => string | null;
  /** Гараар зассан нүд */
  edited: (oid: number, k: ColKey) => boolean;
  /** Томьёогоор өөрчлөгдсөн нүд */
  derived: (oid: number, k: ColKey) => boolean;
};

/**
 * ЗАСАХ ГОРИМЫН ЦАРЦААСАН СУУРЬ (2026-10-19, аудит).
 *
 * ⚠️ Урьд нь арын дахин уншилт (dataBus — өөр газрын бичилт, «Шинэчлэх», синк) `d.stored`-ийг НИЙТЛЭЭГҮЙ засварын
 *    дор сольдог байв: загвар шинэ суурин дээр дахин бодогдож, нийтлэлтийн зэрэг засварын шалгалт хэрэглэгчийн
 *    ХАРААГҮЙ суурьтай харьцуулдаг тул өөр нийтлэгчийн засварыг чимээгүй дарж болдог байлаа.
 *    Одоо: «Засах» дарах агшинд суурийг (`frozen`) царцаана; засвар БАЙХГҮЙ үед шинэ өгөгдлийг шууд авна, засвартай
 *    үед хуучин суурь хэвээр — «шинэ өгөгдөл бий» гэж хэлээд нийтэлсний/цуцалсны дараа л шинэчилнэ.
 * ⚠️ Нийтэлсний дараа (`posted`) шинэ уншилт иртэл загварыг (засвартай) харуулна — эс бөгөөс нэг агшин хуучин
 *    утга гарч «засвар алга болов» мэт харагдана.
 */
function NegBody({ d: live, onDirty, reloadFailed }: {
  d: NegtgelFull;
  /** Нийтлээгүй засвартай эсэх — эцэг `NegBody`-г уналтад салгахгүй (`TusulNegtgel`-ийн ⚠️) */
  onDirty: (v: boolean) => void;
  /** Засвартай үед арын дахин уншилт унасан */
  reloadFailed: boolean;
}) {
  const { role, user, status } = useAuth();
  /* ⚠️ 2026-10-19 (аудит): КОДЫН хатуу super — `negtgelEdit.canEditNegtgel`-тэй ИЖИЛ (панелийн хуучин super мөр биш) */
  const canEdit = status === 'off' ? role === 'super' : roleForUser(user?.username) === 'super';
  const [edit, setEdit] = useState(false);
  const [edits, setEdits] = useState<Map<number, Partial<Record<NegEditKey, number | null>>>>(() => new Map());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [frozen, setFrozen] = useState<NegtgelFull | null>(null);
  /** Нийтэлсэн агшны `live` — түүнээс ӨӨР уншилт ирэх хүртэл загварыг (засвартай) барина */
  const [posted, setPosted] = useState<NegtgelFull | null>(null);
  const liveRef = useRef(live);
  useSyncRef(liveRef, live);
  /* Зурах үеийн тохируулга (effect биш — нэг кадр ч хуучин суурь харагдахгүй) */
  if (posted) {
    if (posted !== live) { setFrozen(null); setEdits(new Map()); setPosted(null); }
  } else if (frozen && frozen !== live && !edits.size) {
    setFrozen(live);
  }
  const d = frozen ?? live;
  const dirty = edits.size > 0 && !posted;
  const newer = frozen != null && frozen !== live && !posted;

  /* ⚠️ 2026-10-19 (аудит): ХАДГАЛААГҮЙ ЗАСВАРЫН ХАМГААЛАЛТ — `Guitsetgel.goTab` · `Portal.confirmLeave` ·
     «Шинэчлэх» · `beforeunload` (`navGuard`). Урьд нь таб/харагдац солих, F5 дарахад засвар асуултгүй устдаг байв. */
  useEffect(() => {
    setNavDirty('negtgel', dirty, tr('Нэгтгэл гүйцэтгэлийн засвар'));
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => () => setNavDirty('negtgel', false), []);

  /* ⚠️ 2026-10-19 (аудит): үйлчилгээ «Query» л бол «Засах»-ыг ХААНА (шалтгаантай) — `negServiceCanUpdate`-ийн ⚠️ */
  const [svcCan, setSvcCan] = useState<boolean | null>(null);
  useEffect(() => {
    if (!canEdit) return undefined;
    let alive = true;
    void negServiceCanUpdate().then((v) => { if (alive) setSvcCan(v); });
    return () => { alive = false; };
  }, [canEdit]);
  const svcOff = svcCan === false;

  const form = useMemo(() => negForm(d.stored), [d.stored]);
  const at = useMemo(() => new Map(d.stored.map((r, i) => [r.oid, i])), [d.stored]);
  const model = useMemo(() => (edits.size ? applyNegEdits(d.stored, form, edits) : d.stored), [d.stored, form, edits]);
  /* Дэлгэц — засвартай бол загвар → системийн давхарга (`computeNegAuto`) → табын хэлбэр */
  const view = useMemo(() => {
    if (!edits.size) return { rows: d.rows, calc: d.calc };
    return negDisplay(d.src ? computeNegAuto(model, d.src) : model);
  }, [edits.size, d.rows, d.calc, d.src, model]);
  const count = useMemo(() => [...edits.values()].reduce((a, e) => a + Object.keys(e).length, 0), [edits]);

  const api = useMemo<NegEditApi>(() => ({
    can: (oid, k) => {
      const key = EDIT_COL[k];
      const i = at.get(oid);
      if (!key || i == null) return false;
      /* ⚠️ Системийн гүйцэтгэлтэй мөрийн S — засаад ч дэлгэцэд харагдахгүй (`negtgelEdit`-ийн толгой) */
      return negEditable(d.stored, form, i, key, d.calc.get(oid)?.auto === true);
    },
    value: (oid, k) => {
      const key = MODEL_COL[k];
      const i = at.get(oid);
      return key == null || i == null ? null : (model[i][key] as number | null);
    },
    set: (oid, k, text) => {
      const key = EDIT_COL[k];
      const i = at.get(oid);
      if (!key || i == null) return null;
      const budget = key === 'budget';
      /* ⚠️ 2026-10-19 (аудит): хүрээ (хувь 0–100, төсөв ≥ 0) ба таслалын тодорхой байдал — `parseNegInput` */
      const r = parseNegInput(text, key);
      if (!r.ok) { setMsg({ ok: false, text: r.err }); return r.err; }
      const v = r.v;
      setMsg(null);
      setEdits((prev) => {
        const next = new Map(prev);
        const cur = { ...(next.get(oid) ?? {}) };
        /* Анхны утга руугаа буцсан бол засвар биш */
        if (negDiffers(v, d.stored[i][key] as number | null, budget)) cur[key] = v; else delete cur[key];
        if (Object.keys(cur).length) next.set(oid, cur); else next.delete(oid);
        return next;
      });
      return null;
    },
    edited: (oid, k) => {
      const key = EDIT_COL[k];
      return key != null && edits.get(oid)?.[key] !== undefined;
    },
    derived: (oid, k) => {
      const key = MODEL_COL[k];
      const i = at.get(oid);
      if (!edits.size || key == null || i == null) return false;
      return negDiffers(model[i][key] as number | null, d.stored[i][key] as number | null, key === 'budget');
    },
  }), [at, d.stored, d.calc, form, model, edits]);

  /* ⚠️ 2026-10-19: нийтэлсний дараа шинэ уншилт ирэх хүртэл (`posted`) «Засах»-ыг ХААНА. Урьд нь энэ хооронд дахин
     дарахад суурь нь НИЙТЛЭЛТЭЭС ӨМНӨХ уншилтаар (`live`) царцаж, дараагийн нийтлэлт өөрийн бичилтээ «өөр газраас
     өөрчлөгдсөн» гэж зогсох эсвэл хуучин утга дээр бодож болдог байв. Уншилт ирмэгц (`posted !== live`) нээгдэнэ;
     унавал «Шинэчлэх» дахин уншина. */
  const awaiting = posted != null;
  /* ⚠️ 2026-10-23 (UX аудит X1/X7): async — `askConfirm`; «Нийтлэх» → «Хадгалах» (порталын нэг нэр томьёо) */
  const toggleEdit = async () => {
    if (awaiting) return;
    if (edit && count > 0 && !(await askConfirm(tr('Хадгалаагүй {0} засвар устах уу?', count), { danger: true, ok: tr('Засвар хаях') }))) return;
    /* ⚠️ Горимд орохдоо засварыг ч цэвэрлэнэ — нийтэлсний дараа шинэ уншилт хүлээж буй (`posted`) загвар үлдсэн байж болно */
    if (edit) { setEdits(new Map()); setFrozen(null); } else { setEdits(new Map()); setFrozen(live); setPosted(null); }
    setMsg(null);
    setEdit((v) => !v);
  };
  const publish = async () => {
    setSaving(true);
    setMsg(null);
    try {
      /* ⚠️ Суурь нь ЦАРЦААСАН (`d` = `frozen`) — хэрэглэгчийн харсан утга */
      const r = await publishNegEdits(d.stored, model);
      setEdit(false);
      /* ⚠️ `onReload` (retry → «ачаалж байна») ХАСАГДСАН: `publishNegEdits` нь `invalidate('TUSUL_NEGTGEL')` дууддаг тул
         `useAsync` хуучин утгыг барьж дахин уншина — амжилтын мэдэгдэл ч устахгүй. */
      /* ⚠️ ОДООГИЙН уншилтаас ӨӨР уншилт ирэх хүртэл барина: `invalidate`-ийн дараах шинэ уншилт үүнээс өөр байна.
         Нийтлэлтийн явцад өөр шинэчлэлт ирсэн бол тэр нь бичилтийн ДАРААХ уу, ӨМНӨХ үү — тодорхойгүй
         тул дахин нэг уншилт хүлээнэ (хүлээх хооронд харагдах нь яг нийтэлсэн загвар — зөв утга). */
      if (r.n > 0) setPosted(liveRef.current); else { setEdits(new Map()); setFrozen(null); }
      setMsg({ ok: true, text: r.warn ? `${tr('Хадгалагдлаа — {0} мөр', r.n)} · ${r.warn}` : tr('Хадгалагдлаа — {0} мөр', r.n) });
    } catch (e) {
      /* ⚠️ 2026-10-23 (UX аудит X3): түүхий алдааг `userError`-оор */
      setMsg({ ok: false, text: userError(e) });
    } finally {
      setSaving(false);
    }
  };

  const toolbar = canEdit ? (
    <span className={n.edBar}>
      {svcOff && !edit && (
        /* ⚠️ 2026-10-23 (UX аудит X2/X3): үйлчилгээний нэр/тохиргооны алхмыг хэрэглэгчид харуулахгүй — техник дэлгэрэнгүй `title`-д */
        <span className={n.edWhy} title="Negtgel_guitsetgel_1013 · Settings → Enable editing (Update)">{tr('Засах боломжгүй: энэ хүснэгтэд засвар хаалттай байна — админд мэдэгдэнэ үү.')}</span>
      )}
      {edit && (
        <button type="button" className={`${f.editBtn} ${f.pubBtn}`} disabled={!count || saving} onClick={() => { void publish(); }}>
          {saving ? tr('Хадгалж байна…') : tr('Хадгалах ({0})', count)}
        </button>
      )}
      <button
        type="button"
        className={`${f.editBtn} ${edit ? f.editBtnOn : ''}`}
        disabled={saving || awaiting || (svcOff && !edit)}
        aria-pressed={edit}
        title={awaiting ? tr('Хадгалсан өгөгдлийг дахин уншиж байна…') : svcOff && !edit ? tr('Энэ хүснэгтэд засвар хаалттай') : undefined}
        onClick={() => { void toggleEdit(); }}
      >
        {tr('Засах')}
      </button>
    </span>
  ) : null;

  return (
    <>
      {edit && (
        <p className={n.syncNote} role="status">
          {tr('Засах горим: тодруулсан нүд л засагдана (Excel-ийн томьёогүй нүд). Засварласан нүд НОГООН, томьёогоор дахин бодогдсон нүд ЦЭНХЭР. «Хадгалах» дарах хүртэл хадгалагдахгүй.')}
        </p>
      )}
      {newer && (
        <p className={n.syncNote} role="status">
          {tr('Шинэ өгөгдөл бий — хадгалсны/болисны дараа шинэчлэгдэнэ. Хадгалахад хүснэгтийг шинээр уншиж зөрчлийг шалгана.')}
        </p>
      )}
      {reloadFailed && (
        <p className={`${n.syncNote} ${n.msgErr}`} role="alert">
          {tr('Өгөгдлийг дахин уншиж чадсангүй — засвар тань хэвээр байна; хадгалахад хүснэгтийг шинээр уншиж шалгана.')}
        </p>
      )}
      {msg && <p className={`${n.syncNote} ${msg.ok ? n.msgOk : n.msgErr}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <Tree rows={view.rows} calc={view.calc} edit={edit ? api : undefined} toolbar={toolbar} />
    </>
  );
}

/**
 * Засварын нүдний оролт — Enter/blur хэрэгжүүлнэ, Esc буцаана.
 * ⚠️ 2026-10-19 (аудит): ТАТГАЛЗСАН оролт (`parseNegInput`) нүдэндээ ҮЛДЭЭД байдаг тул хэрэглэгч «хадгалагдсан» гэж
 *    ойлгодог байв (зөвхөн дээд мессеж). Одоо утга нь буцаж, нүд УЛААН хүрээтэй, шалтгаан нь `title`-д — дахин бичих
 *    хүртэл.
 */
function EditInput({ v, budget, onCommit }: { v: number | null; budget: boolean; onCommit: (text: string) => string | null }) {
  const shown = v == null ? '' : budget ? String(Math.round(v)) : String(Number((v * 100).toFixed(4)));
  const [bad, setBad] = useState<string | null>(null);
  return (
    <input
      key={shown}
      className={bad ? `${n.edIn} ${n.edBad}` : n.edIn}
      defaultValue={shown}
      inputMode="decimal"
      aria-label={tr('Утга засах')}
      aria-invalid={bad ? true : undefined}
      title={bad ?? undefined}
      onChange={() => { if (bad) setBad(null); }}
      onBlur={(e) => {
        const el = e.target;
        if (el.value === shown) return;
        const err = onCommit(el.value);
        if (err) { el.value = shown; setBad(err); }
      }}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (e.key === 'Enter') el.blur();
        if (e.key === 'Escape') { el.value = shown; setBad(null); el.blur(); }
      }}
    />
  );
}

/**
 * СИНКИЙН МЭДЭГДЭЛ (2026-09-25).
 *
 * ⚠️ Хамгаалалт (`negtgelAuto.planNegSync`) бичилтийг зогсоовол ЧИМЭЭГҮЙ
 *    үлдэхгүй: шалтгаан ба мөрүүдийг харуулж, super хэрэглэгч нэг удаа
 *    «Системийн утгаар шинэчлэх»-ээр баталгаажуулна (Excel-ээс тарьсан
 *    хүснэгтийн анхны синк г.м.). `guard` төлөв нь ЗӨВХӨН super-д ирнэ.
 */
function SyncNotice({ live, failed, sync, onDone }: {
  live: boolean;
  /** ⚠️ 2026-10-01: унасан/хэсэгчилсэн эхийн нэрс (`NegtgelFull.failed`) */
  failed: string[];
  sync: Promise<NegSyncState> | null;
  onDone: () => void;
}) {
  const [st, setSt] = useState<NegSyncState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void sync?.then((v) => { if (alive) setSt(v); });
    return () => { alive = false; };
  }, [sync]);

  if (!live) {
    /* ⚠️ 2026-10-01 («хэрэглэгч: бүгдийг зас»): АЛЬ эх унасныг нэрлэнэ; энэ үр дүн кэшлэгдэхгүй тул
       дараагийн нээлт дахин уншина. */
    return (
      <p className={n.syncNote} role="status">
        {failed.length
          ? tr('Системийн эх уншигдсангүй ({0}) — хүснэгтийн хадгалсан утгыг харуулж байна. Дараагийн нээлтэд дахин уншина.', failed.join(', '))
          : tr('Системийн эх уншигдсангүй — хүснэгтийн хадгалсан утгыг харуулж байна.')}
      </p>
    );
  }
  /* ⚠️ 2026-10-01: ХЭСЭГЧЛЭН уншигдсан эх (хуваарийн муруйн хуудас) — тоо бодогдсон ч дутуу байж болно */
  const partialNote = failed.length
    ? <p className={n.syncNote} role="status">{tr('Хэсэгчлэн уншигдсан: {0} — зарим төлөвлөгөөт хувь дутуу байж болно. Дараагийн нээлтэд дахин уншина.', failed.join(', '))}</p>
    : null;
  if (!st || st.kind === 'off' || st.kind === 'ok') return partialNote;
  /* ⚠️ 2026-09-29 (аудит 10): `force` ЗӨВХӨН `guard` төлөвт (super хамгаалалтыг
     нүдээр харж баталгаажуулсан). Урьд нь `error` төлөвийн цорын ганц товч ч
     мөн `force: true` дууддаг тул түр 429-ийн дараах «дахин оролдлого» ±20-ийн
     мөр/нийт хамгаалалтыг ДАВЖ бүх зөрүүг шалгалтгүй бичдэг байв. Алдааны
     дараа энгийн дуудлага дахин ажиллана (`syncNegtgel` уналтад `lastSync = 0`). */
  const force = async () => {
    setBusy(true);
    const r = await syncNegtgel({ force: st.kind === 'guard' });
    setBusy(false);
    if (r.kind === 'ok') onDone();
    else setSt(r);
  };
  const p1 = (v: number) => fmtPct(v * 100, 2);
  return (
    <>
    {partialNote}
    <div className={n.syncNote} role="status">
      {st.kind === 'error' ? (
        <span>{tr('Хүснэгтэд бичигдсэнгүй — {0}', st.reason)}</span>
      ) : st.totalBlocked && st.total ? (
        <span>{tr('Хүснэгтэд бичигдсэнгүй — төслийн нийт {0} → {1} болж 20-оос илүү нэгжээр өөрчлөгдөх байсан тул бичсэнгүй.', p1(st.total.from), p1(st.total.to))}</span>
      ) : (
        <span>{tr('Хүснэгтэд хэсэгчлэн бичигдсэнгүй — {0} мөр нэг дор 20-оос илүү нэгжээр өөрчлөгдөх байсан тул алгасав (бусад {1} мөр бичигдсэн).', num(new Set(st.blocked.map((b) => b.oid)).size), num(st.n))}</span>
      )}
      {st.kind === 'guard' && st.blocked.length > 0 && (
        <span className={n.syncRows}>
          {st.blocked.slice(0, 5).map((b) => `${b.code} ${b.name}: ${p1(b.from)} → ${p1(b.to)}`).join(' · ')}
          {st.blocked.length > 5 ? ` · +${st.blocked.length - 5}` : ''}
        </span>
      )}
      <button type="button" disabled={busy} onClick={() => { void force(); }}>
        {busy ? tr('Бичиж байна…') : st.kind === 'error' ? tr('Дахин оролдох') : tr('Системийн утгаар шинэчлэх')}
      </button>
    </div>
    </>
  );
}

/**
 * ⚠️ 2026-10-14: экспорт — `TusulNegtgel.ui.check.mjs` хүснэгтийг өгөгдөлтэй нь шууд зурж толгойн бүтэц
 *    (Excel-ийн нэгтгэсэн нүд) · 6 түвшин · нийт мөрийг шалгана (`TusulNegtgel` нь өгөгдлөө effect-ээр татдаг тул
 *    серверийн render-д «ачаалж байна» л гарна).
 */
export function Tree({ rows, calc, edit, toolbar }: {
  rows: NegtgelRow[];
  calc: Map<number, NegtgelCalc>;
  /** ⚠️ 2026-10-15: засах горим (`NegBody`) — өгөөгүй бол зөвхөн харна */
  edit?: NegEditApi;
  /** «Засах» · «Нийтлэх» товчнууд — хэрэгслийн мөрийн баруун талд */
  toolbar?: ReactNode;
}) {
  const { parent, kids } = useMemo(() => negtgelTree(rows), [rows]);

  /** Хураалттай бүлгүүд (oid) */
  const [closed, setClosed] = useState<Set<number>>(() => new Set(
    rows.filter((r, i) => kids[i].length > 0 && r.depth <= 2 && CLOSED_BY_DEFAULT.has(nk(r.name))).map((r) => r.oid),
  ));
  const [q1, setQ1] = useState('');
  const [level, setLevel] = useState<number | null>(null);

  /** Outline товч — тэр түвшнээс доош БҮХ бүлгийг хураана, дээшхийг нээнэ */
  const pickLevel = (btn: number) => {
    const lim = depthOf(btn);
    setLevel(lim);
    setClosed(new Set(rows.filter((r, i) => kids[i].length > 0 && r.depth >= lim).map((r) => r.oid)));
  };
  const toggle = (oid: number) => {
    setLevel(null);
    setClosed((prev) => {
      const s = new Set(prev);
      if (s.has(oid)) s.delete(oid); else s.add(oid);
      return s;
    });
  };

  /* ── Багана: нуух / өргөн ── */
  const [prefs, setPrefs] = useState<ColPrefs>(readPrefs);
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch { /* алгасна */ }
  }, [prefs]);
  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const W = (k: ColKey) => prefs.w[k] ?? COL.get(k)!.w;
  /**
   * ⚠️ 2026-09-25: өргөн нь CSS хувьсагчаар (`--nw-<key>`) — чирэх явцад
   *    ЗӨВХӨН хүснэгтийн элементийн style солигдоно (React дахин зурахгүй,
   *    localStorage бичихгүй). Урьд нь pointermove бүрд `setPrefs` → 352 мөр
   *    дахин зурагдаж, localStorage-д бичигддэг байв. Суллахад л хадгална.
   */
  const WV = (k: ColKey) => `var(--nw-${k}, ${W(k)}px)`;
  const tblRef = useRef<HTMLTableElement | null>(null);
  const vis = COLS.filter((c) => !hidden.has(c.key));
  /**
   * ⚠️ 2026-10-14: ГУРВАН толгойн мөр (гарчиг · бүлэг · дэд) ба «ТӨСЛИЙН НИЙТ» мөр ЦАРЦСАН (Excel: freeze
   *    ySplit=6). Мөр бүрийн `top` = дээрх мөрүүдийн нийлбэр өндөр — бичвэр мөр шилжих/өргөн өөрчлөгдөхөд
   *    өндөр хувьсдаг тул `ResizeObserver`-оор хэмжиж хүснэгтийн CSS хувьсагч (`--nh0 · --nh1 · --nhh`)-д
   *    өгнө; React state биш (мөр бүр дахин зурагдахгүй).
   */
  const hdRef = useRef<HTMLTableSectionElement | null>(null);
  useLayoutEffect(() => {
    const head = hdRef.current;
    const tbl = tblRef.current;
    if (!head || !tbl) return undefined;
    const apply = () => {
      const trs = Array.from(head.rows);
      const h = (i: number) => trs[i]?.getBoundingClientRect().height ?? 0;
      tbl.style.setProperty('--nh0', `${h(0)}px`);
      tbl.style.setProperty('--nh1', `${h(0) + h(1)}px`);
      tbl.style.setProperty('--nhh', `${head.getBoundingClientRect().height}px`);
    };
    const ro = new ResizeObserver(apply);
    for (const trEl of Array.from(head.rows)) ro.observe(trEl);
    ro.observe(head);
    return () => ro.disconnect();
  }, [vis.length]);
  /** Харагдах бүлгүүд — дэд багануудаараа (хоосон бүлэг зурагдахгүй) */
  const grpCols = GROUPS.map((g) => ({ g, cols: vis.filter((c) => c.grp === g.key) })).filter((x) => x.cols.length > 0);

  /**
   * ЦАРЦСАН БАГАНЫН `left` — ХАРАГДАЖ БУЙ царцсан баганууд, одоогийн өргөнөөр.
   * ⚠️ Өргөн өөрчлөгдөх, багана нуугдах бүрд дахин бодно — эс бөгөөс баганууд
   * бие биенийхээ дээр давхцана.
   */
  const freeze = prefs.freeze ?? DEFAULT_FREEZE;
  /** Царцсан баганууд — дарааллаар `freeze` хүртэл (хэрэглэгчийн сонголт) */
  const frozen = useMemo(() => {
    const out = new Set<ColKey>();
    if (!freeze) return out;
    for (const c of COLS) {
      out.add(c.key);
      if (c.key === freeze) break;
    }
    return out;
  }, [freeze]);
  const left: Partial<Record<ColKey, string>> = {};
  let edge: ColKey | null = null;
  {
    const acc: string[] = [];
    for (const c of vis) {
      if (!frozen.has(c.key)) continue;
      left[c.key] = acc.length ? `calc(${acc.join(' + ')})` : '0px';
      acc.push(WV(c.key));
      edge = c.key;
    }
  }
  const wrapSet = useMemo(() => new Set(prefs.wrap ?? []), [prefs.wrap]);
  const sty = (k: ColKey) => ({
    width: WV(k), minWidth: WV(k), maxWidth: WV(k), left: left[k],
    ...(wrapSet.has(k) ? { whiteSpace: 'normal' as const, wordBreak: 'break-word' as const } : {}),
  });

  /*
   * ── БАГАНЫН СОНГОЛТ ба БАРУУН ТОВШИЛТЫН ЦЭС — «Санхүүжилт» хүснэгттэй ИЖИЛ
   *    (2026-09-25, хэрэглэгчийн заавар: «mouse 2 click гээд санхүүжилттай
   *    ижилхэн ажиллагаатай болго»; `Finance.headMenu`-г үз).
   *    · толгой дарах  → ЗӨВХӨН энэ багана; Ctrl/⌘ → нэмж/хасах; Shift → муж
   *    · баруун товшилт → Hide column · Freeze up to here · Wrap text …
   *    ⚠️ Шошго нь АНГЛИАР, `tr()`-гүй — Санхүүжилтийн цэстэй ижил (тэнд
   *    хэрэглэгч Excel/ArcGIS-ийн англи нэрээр таньдаг гэж шийдсэн).
   */
  const [pick, setPick] = useState<ColKey[]>([]);
  const lastPick = useRef<ColKey | null>(null);
  const [hMenu, setHMenu] = useState<{ k: ColKey; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  /* ⚠️ 2026-09-25: Esc ба гүйлгэлтээр хаагдана — урьд нь цэс хүснэгтийг
     гүйлгэсэн ч хуучин байрандаа хөвж үлддэг байв. */
  useEffect(() => {
    if (!hMenu) return;
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setHMenu(null); };
    const scroll = (ev: Event) => {
      if (menuRef.current && ev.target instanceof Node && menuRef.current.contains(ev.target)) return;
      setHMenu(null);
    };
    window.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', scroll);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', scroll);
    };
  }, [hMenu]);
  /* ⚠️ Дэлгэцийн доод/баруун ирмэгээс ГАРАХГҮЙ — хэмжээг зурсны дараа хэмжиж шахна */
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!hMenu || !el) return;
    const b = el.getBoundingClientRect();
    if (b.bottom > window.innerHeight - 8) el.style.top = `${Math.max(8, window.innerHeight - b.height - 8)}px`;
    if (b.right > window.innerWidth - 8) el.style.left = `${Math.max(8, window.innerWidth - b.width - 8)}px`;
  }, [hMenu]);
  const clickTh = (k: ColKey, ev: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    const names = vis.map((c) => c.key);
    if (ev.shiftKey && lastPick.current) {
      const a = names.indexOf(lastPick.current);
      const b = names.indexOf(k);
      if (a >= 0 && b >= 0) {
        setPick(names.slice(Math.min(a, b), Math.max(a, b) + 1));
        return;
      }
    }
    lastPick.current = k;
    if (ev.ctrlKey || ev.metaKey) {
      setPick((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]));
      return;
    }
    setPick((v) => (v.length === 1 && v[0] === k ? [] : [k]));
  };
  const hideKeys = (ks: ColKey[]) => setPrefs((pp) => ({
    ...pp,
    hidden: [...new Set([...pp.hidden, ...ks.filter((k) => k !== LOCKED)])],
  }));
  const toggleWrap = (k: ColKey) => setPrefs((pp) => {
    const w = pp.wrap ?? [];
    return { ...pp, wrap: w.includes(k) ? w.filter((x) => x !== k) : [...w, k] };
  });
  const fzc = (k: ColKey) => (frozen.has(k) ? `${n.fz} ${k === edge ? n.fzEdge : ''}` : '');

  /**
   * ӨРГӨСГӨХ — толгойн баруун ирмэгийг чирнэ; давхар дарвал анхдагч өргөн.
   * ⚠️ Pointer capture — хулгана нүднээс гарсан ч чирэлт тасрахгүй.
   */
  const startResize = (k: ColKey) => (e: RPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const x0 = e.clientX;
    const w0 = W(k);
    const prop = `--nw-${k}`;
    let cur = w0;
    let raf = 0;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      cur = Math.max(MIN_W, Math.round(w0 + ev.clientX - x0));
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        tblRef.current?.style.setProperty(prop, `${cur}px`);
      });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (raf) cancelAnimationFrame(raf);
      /* ⚠️ Цуцалсан чирэлт (pointercancel) хадгалахгүй — анхны өргөндөө */
      const keep = ev.type === 'pointerup' && cur !== w0;
      /* ⚠️ `flushSync` — шинэ өргөн зурагдсаны ДАРАА хувьсагчийг авна, эс
         бөгөөс нэг кадр хуучин өргөнөөр анивчина. */
      if (keep) flushSync(() => setPrefs((pp) => ({ ...pp, w: { ...pp.w, [k]: cur } })));
      tblRef.current?.style.removeProperty(prop);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const resetW = (k: ColKey) => setPrefs((pp) => {
    const w = { ...pp.w };
    delete w[k];
    return { ...pp, w };
  });


  /**
   * ХАРАГДАХ МӨРҮҮД.
   * ⚠️ ХАЙЛТ нь хураалтыг ДАВЖ, тохирсон мөрийг БҮХ өвөг дээдэстэй нь гаргана
   * (модоор — код давхардсан тул кодоор өгсөхгүй).
   */
  const list = useMemo(() => {
    const s = q1.trim().toLowerCase();
    if (s === '') {
      const out: number[] = [];
      rows.forEach((_, i) => {
        for (let k = parent[i]; k >= 0; k = parent[k]) if (closed.has(rows[k].oid)) return;
        out.push(i);
      });
      return out;
    }
    const keep = new Set<number>();
    rows.forEach((r, i) => {
      const hit = r.name.toLowerCase().includes(s)
        || r.code.toLowerCase().includes(s)
        || (r.bagts ?? '').toLowerCase().includes(s);
      if (!hit) return;
      for (let k = i; k >= 0 && !keep.has(k); k = parent[k]) keep.add(k);
    });
    return rows.map((_, i) => i).filter((i) => keep.has(i));
  }, [rows, parent, q1, closed]);

  /**
   * «ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ» мөр — Excel-ийн 6-р мөр:
   *   G = Σ үе шатны жин; H…K = Σ жин × утга; L…N = K ÷ H…J (0 бол 0).
   */
  const head = useMemo(() => {
    /* ⚠️ 2026-09-25: жинтэй үе шатны гүйцэтгэл/төлөвлөгөө хэмжигдээгүй бол тэр баганын НИЙТ ХООСОН
       (`negtgelProjectPct`-тэй ижил, null ≠ 0) — 0 гэж нэмбэл доошилж, биелэлт нь «0 бол 0» дүрмээр 0% болдог байв.
       ⚠️ 2026-10-13: Excel Q · R (Next week · Өмнө долоо хоног) — ижил SUMPRODUCT.
       ⚠️ 2026-10-11 (аудит №7): Σ жин 100-аас зөрвөл жигнэсэн нийлбэрийг Σ жин-ээр НОРМЧИЛНО ([99.95, 100.05] дотор
       хөндөхгүй); Σ жин-ийг доор 1 оронтой харуулна — 99.6% нь «100%» гэж бөөрөнхийлөгдөж зөрүү нуугддаг байв.
       ⚠️ 2026-10-19 (аудит): томьёо нь `negtgelEdit.negTotals` — НИЙТЛЭЛТ хүснэгтийн «ТӨСЛИЙН НИЙТ» мөрийг ЯГ ҮҮГЭЭР
       бичнэ (урьд нь өөр томьёотой байсан тул хүснэгт дэлгэцээс зөрдөг байв). Энд 0–100 → 0–1 → 0–100. */
    const fr = (v: number | null | undefined) => (v == null ? null : v / 100);
    const top = rows.filter((r) => r.depth === 1).flatMap((r) => {
      const c = calc.get(r.oid);
      return c ? [{
        p: fr(c.inProject), planG: fr(c.planPct), planGch: fr(c.planGch), planGu: fr(c.planGuits),
        planNw: fr(c.planNextWk), planPw: fr(c.planPrevWk), act: fr(c.actPct),
      }] : [];
    });
    const T = negTotals(top);
    const pc = (v: number | null) => (v == null ? null : v * 100);
    return {
      p: T.p == null ? null : T.p * 100,
      planG: pc(T.planG), planGch: pc(T.planGch), planGu: pc(T.planGu), planNw: pc(T.planNw), planPw: pc(T.planPw),
      act: pc(T.act),
      perfG: pc(T.perfG),
      perfGch: pc(T.perfGch),
      perfGu: pc(T.perfGu),
      /* ⚠️ Excel W6 = S6 ÷ R6 (өмнөх долоо хоногийн төлөвлөгөө) */
      perfWk: pc(T.perfWk),
    };
  }, [rows, calc]);

  /**
   * ТООНЫ ХЭЛБЭР — Excel-ийн форматаар: гүйцэтгэл үргэлж 2 орон; үе шат ба
   * бүлгийн мөр 2 орон; навчны төлөвлөгөө/биелэлт бүхэл; төсөлд эзлэх хувь
   * навчинд 3 орон (0.002% мэт жижиг жин).
   */
  const p = (v: number | null | undefined, d: number) => (
    /* ⚠️ Хоосон нүд ХООСОН — «—» тэмдэг хасагдсан (2026-09-25, хэрэглэгчийн
       заавар). 0 гэж бичихгүй: «мэдээлэлгүй» ба «тэг» ялгаатай хэвээр. */
    v == null ? '' : fmtPct(v, d)
  );

  /* «ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ» мөрийн нүднүүд — эхний харагдах Д/Д · Багц ·
     Нэр баганыг нэгтгэнэ.
     ⚠️ 2026-09-25: ЦАРЦСАН ба ЦАРЦААГҮЙ хэсэг нь ТУСДАА нүд — урьд нь нэгтгэсэн
     нүд үргэлж sticky байсан тул зөвхөн «Д/Д» царцаахад бүтэн өргөнөөрөө
     хөдлөлгүй үлдэж, доорх «Ажлын нэр» баганыг дардаг байв. */
  const lead = vis.filter((c) => LEAD.includes(c.key));
  const leadFz = lead.filter((c) => frozen.has(c.key));
  const leadRest = lead.filter((c) => !frozen.has(c.key));
  const sumW = (cs: typeof lead) => (cs.length ? `calc(${cs.map((c) => WV(c.key)).join(' + ')})` : '0px');
  const total: Partial<Record<ColKey, string>> = {
    inProject: p(head.p, 1), // ⚠️ 2026-10-11 (аудит №7): 1 орон — Σ жин 100-аас зөрвөл ил (`head`-ийн ⚠️)
    planG: p(head.planG, 2),
    planGch: p(head.planGch, 2),
    planGu: p(head.planGu, 2),
    planNw: p(head.planNw, 2),
    planPw: p(head.planPw, 2),
    act: p(head.act, 2),
    perfG: p(head.perfG, 2),
    perfGch: p(head.perfGch, 2),
    perfGu: p(head.perfGu, 2),
    perfWk: p(head.perfWk, 2),
  };

  return (
    <div className={n.wrap}>
      {/* ⚠️ «ТӨСЛИЙН ГҮЙЦЭТГЭЛ» гарчиг, «ТЭЗҮ, зураг төсөл» ба «Барилга
          угсралт» хоёр үзүүлэлт ХАСАГДСАН (2026-09-25, хэрэглэгчийн заавар:
          «delete», «ТӨСЛИЙН ГҮЙЦЭТГЭЛ del»). */}

      <div className={n.bar}>
        <input
          className={n.search}
          placeholder={tr('Ажил, кодоор хайх…')}
          value={q1}
          onChange={(e) => setQ1(e.target.value)}
        />
        {/* Excel-ийн outline товчтой ижил — тэр түвшнээс доош хураана */}
        <span className={n.levels}>
          {LEVELS.map((d) => (
            <button
              key={d}
              type="button"
              className={level === depthOf(d) ? n.lvOn : ''}
              title={depthOf(d) === ALL_DEPTH ? tr('Бүх түвшинг харуулах') : tr('{0}-р түвшин хүртэл харуулах', d)}
              onClick={() => pickLevel(d)}
            >{d}</button>
          ))}
        </span>
        {/* ⚠️ «N / 352 мөр системээс автоматаар» бичиг ХАСАГДСАН (2026-09-25,
            хэрэглэгчийн заавар). Эх сурвалж нь мөрийн `title`-д хэвээр. */}
        {/* ⚠️ «Царцаах» сонголт ба «Багана ▾» цэс ХАСАГДСАН (2026-09-25,
            хэрэглэгчийн заавар: «del») — нуух, царцаах, өргөн сэргээх нь
            толгойн БАРУУН ТОВШИЛТЫН цэснээс (Санхүүжилттэй ижил). */}
        {toolbar}
      </div>

      {/* БАРУУН ТОВШИЛТЫН ЦЭС — `Finance.headMenu`-тэй ижил үйлдэл, ижил загвар */}
      {hMenu && (() => {
        const k = hMenu.k;
        const keys = pick.length > 0 ? pick : [k];
        const order = COLS.map((c) => c.key);
        const target = keys.reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a), keys[0]);
        /* ⚠️ 2026-09-25: товч нь ТОГГЛ — зорилтот багана аль хэдийн царцаалтын
           ирмэг бол «Unfreeze» гэж ИЛ бичнэ (урьд нь олон сонголтод «Freeze N
           columns» гэж бичээд чимээгүй царцаалтыг болиулдаг байв). */
        const isEdge = freeze === target;
        const close = () => setHMenu(null);
        return (
          <>
            <div
              className={f.thMenuVeil}
              onClick={close}
              onContextMenu={(ev) => {
                /* ⚠️ Нээлттэй үед өөр толгой дээр баруун товшвол ТЭНД дахин нээнэ —
                   хөшиг бүх хуудсыг бүрхдэг тул доорх элементийг цэгээр олно. */
                ev.preventDefault();
                const th = document.elementsFromPoint(ev.clientX, ev.clientY)
                  .find((el) => el instanceof HTMLElement && el.dataset.negCol) as HTMLElement | undefined;
                const nk2 = th?.dataset.negCol as ColKey | undefined;
                setHMenu(nk2 && COL.has(nk2) ? { k: nk2, x: ev.clientX, y: ev.clientY } : null);
              }}
            />
            <div
              ref={menuRef}
              className={f.thMenu}
              style={{ left: Math.max(8, Math.min(hMenu.x, window.innerWidth - 280)), top: Math.max(8, hMenu.y) }}
              onClick={(ev) => ev.stopPropagation()}
            >
              <div className={f.thMenuHead}>{fullLabel(k)}</div>
              <div className={f.thMenuCols}>
                {keys.some((x) => x !== LOCKED) && (
                  <button type="button" onClick={() => { hideKeys(keys); setPick([]); close(); }}>
                    {keys.length > 1 ? `Hide ${keys.length} columns` : 'Hide column'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPrefs((pp) => ({ ...pp, freeze: (pp.freeze ?? DEFAULT_FREEZE) === target ? '' : target }));
                    close();
                  }}
                >
                  {isEdge
                    ? 'Unfreeze'
                    : keys.length > 1 ? `Freeze ${keys.length} columns` : 'Freeze up to here'}
                </button>
                <button type="button" onClick={() => toggleWrap(k)}>
                  {wrapSet.has(k) ? 'No wrap' : 'Wrap text'}
                </button>
                {prefs.w[k] != null && (
                  <button type="button" onClick={() => { resetW(k); close(); }}>Reset width</button>
                )}
                {pick.length > 0 && (
                  <button type="button" onClick={() => { setPick([]); close(); }}>Clear selection</button>
                )}
                {hidden.size > 0 && (
                  <button type="button" onClick={() => { setPrefs((pp) => ({ ...pp, hidden: [] })); close(); }}>
                    {`Show ${hidden.size} hidden columns`}
                  </button>
                )}
              </div>
            </div>
          </>
        );
      })()}

      <div className={n.scroll}>
        <table className={n.tbl} ref={tblRef}>
          {/* ⚠️ БАГАНА нь эх Excel-ийнхээр (B…W) — нэр, дараалал хөндөхгүй.
              ⚠️ 2026-10-14: толгой Excel-ийн 2 · 4 · 5-р мөр шиг — «ТӨСЛИЙН ГҮЙЦЭТГЭЛ» гарчиг (B2:V2), бүлгийн
                 нэгтгэсэн нүд (H4:I4 · J4:K4 · L4:M4), бусад багана 4–5-р мөрийг босоогоор (`GROUPS`-ийн ⚠️). */}
          <thead ref={hdRef}>
            <tr>
              <th colSpan={vis.length} className={n.thTitle}><span className={n.thTitleTxt}>{tr('ТӨСЛИЙН ГҮЙЦЭТГЭЛ')}</span></th>
            </tr>
            <tr>
              {vis.map((c) => {
                if (c.grp) {
                  /* Бүлгийн нүд — бүлгийн ЭХНИЙ харагдах дэд баганад; бусад нь алгасна */
                  const gx = grpCols.find((x) => x.g.key === c.grp)!;
                  if (gx.cols[0].key !== c.key) return null;
                  const fzAll = gx.cols.every((x) => frozen.has(x.key));
                  return (
                    <th
                      key={`grp-${c.grp}`}
                      colSpan={gx.cols.length}
                      className={`${n.thGrp} ${fzAll ? n.fz : ''} ${fzAll && gx.cols.some((x) => x.key === edge) ? n.fzEdge : ''}`}
                      style={{ top: 'var(--nh0, 0px)', ...(fzAll ? { left: left[c.key] } : {}), width: sumW(gx.cols), minWidth: sumW(gx.cols), maxWidth: sumW(gx.cols) }}
                    >
                      {gx.g.label()}
                    </th>
                  );
                }
                return (
                  <th
                    key={c.key}
                    rowSpan={2}
                    className={`${fzc(c.key)} ${n.thSel} ${pick.includes(c.key) ? f.thPick : ''}`}
                    style={{ ...sty(c.key), top: 'var(--nh0, 0px)' }}
                    onClick={(ev) => clickTh(c.key, ev)}
                    data-neg-col={c.key}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      setHMenu((m) => (m?.k === c.key ? null : { k: c.key, x: ev.clientX, y: ev.clientY }));
                    }}
                  >
                    {c.label()}
                    {/* Өргөсгөх бариул — чирнэ; давхар дарвал анхдагч.
                        ⚠️ Товшилт нь толгойн СОНГОЛТ руу хүрэхгүй. */}
                    <span
                      className={n.rsz}
                      onPointerDown={startResize(c.key)}
                      onClick={(ev) => ev.stopPropagation()}
                      onDoubleClick={() => resetW(c.key)}
                      title={tr('Чирж өргөсгөнө · давхар дарвал анхдагч')}
                    />
                  </th>
                );
              })}
            </tr>
            <tr>
              {vis.filter((c) => c.grp).map((c) => (
                <th
                  key={c.key}
                  className={`${fzc(c.key)} ${n.thSel} ${n.thSub} ${pick.includes(c.key) ? f.thPick : ''}`}
                  style={{ ...sty(c.key), top: 'var(--nh1, 0px)' }}
                  onClick={(ev) => clickTh(c.key, ev)}
                  data-neg-col={c.key}
                  title={fullLabel(c.key)}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    setHMenu((m) => (m?.k === c.key ? null : { k: c.key, x: ev.clientX, y: ev.clientY }));
                  }}
                >
                  {c.label()}
                  <span
                    className={n.rsz}
                    onPointerDown={startResize(c.key)}
                    onClick={(ev) => ev.stopPropagation()}
                    onDoubleClick={() => resetW(c.key)}
                    title={tr('Чирж өргөсгөнө · давхар дарвал анхдагч')}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ — Excel-ийн 6-р мөр; ⚠️ 2026-10-14: ЦАРЦСАН (Excel ySplit=6), `--nhh` */}
            <tr className={`${n.stage} ${n.totalRow}`}>
              {leadFz.length > 0 && (
                <td
                  colSpan={leadFz.length}
                  className={`${n.fz} ${leadFz.some((c) => c.key === edge) ? n.fzEdge : ''}`}
                  style={{ width: sumW(leadFz), minWidth: sumW(leadFz), maxWidth: sumW(leadFz), left: left[leadFz[0].key] }}
                >
                  {leadRest.length === 0 ? tr('ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ') : ''}
                </td>
              )}
              {leadRest.length > 0 && (
                <td
                  colSpan={leadRest.length}
                  style={{ width: sumW(leadRest), minWidth: sumW(leadRest), maxWidth: sumW(leadRest) }}
                >
                  {/* ⚠️ Бичиг нь «Ажлын нэр» (`LOCKED`, үргэлж харагдана) агуулсан нүдэнд */}
                  {tr('ТӨСЛИЙН НИЙТ ГҮЙЦЭТГЭЛ')}
                </td>
              )}
              {vis.filter((c) => !LEAD.includes(c.key)).map((c) => (
                <td key={c.key} className={`${fzc(c.key)} ${n.num}`} style={sty(c.key)}>
                  {total[c.key] ?? ''}
                </td>
              ))}
            </tr>
            {list.map((i) => {
              const r = rows[i];
              const c = calc.get(r.oid);
              const isGroup = kids[i].length > 0;
              const tone = toneOf(i, rows, parent, isGroup);
              const leafDeep = !isGroup && r.depth >= 3;
              /* Төлөвлөгөө/биелэлтийн орон — навч бүхэл, бусад 2 */
              const dp = leafDeep ? 0 : 2;
              const body = (k: ColKey) => {
                switch (k) {
                  case 'code': return r.code;
                  case 'bagts': return r.bagts ?? '';
                  case 'name': return r.name;
                  case 'budget': return c?.budget ? num(c.budget) : '';
                  case 'inSection': return p(c?.inSection, 2);
                  case 'inProject': return p(c?.inProject, r.depth <= 1 ? 0 : leafDeep ? 3 : 2);
                  case 'planG': return p(c?.planPct, dp);
                  case 'planGch': return p(c?.planGch, dp);
                  case 'planGu': return p(c?.planGuits, dp);
                  case 'planNw': return p(c?.planNextWk, dp);
                  case 'planPw': return p(c?.planPrevWk, dp);
                  case 'act': return p(c?.actPct, 2);
                  case 'perfG': return p(c?.perf, dp);
                  case 'perfGch': return p(c?.perfGch, dp);
                  case 'perfGu': return p(c?.perfGuits, dp);
                  case 'perfWk': return p(c?.perfWk, dp);
                  /* ⚠️ 2026-10-13: огноо — Гэрээ (ms, UTC өдөр), Гүйцэтгэгч/Бодит («YYYY-MM-DD» бичвэр) */
                  case 'ctStart': return ymd(c?.ctStart);
                  case 'ctEnd': return ymd(c?.ctEnd);
                  case 'exStart': return c?.exStart ?? '';
                  case 'exEnd': return c?.exEnd ?? '';
                  case 'actStart': return c?.actStart ?? '';
                  case 'actEnd': return c?.actEnd ?? '';
                }
              };
              return (
                <tr
                  key={r.oid}
                  className={tone ? n[tone] : ''}
                  /* Тоо хаанаас гарсныг хулганаар */
                  title={[c?.how, c?.outside ? tr('Excel-ийн томьёонд эцгийнхээ нийлбэрт ороогүй мөр') : '']
                    .filter(Boolean).join(' · ')}
                >
                  {vis.map((col) => {
                    const k = col.key;
                    if (k === 'name') {
                      /* ⚠️ «+/−» нэрнээс ХАСАГДСАН (2026-09-25; 2026-10-14-өөс Д/Д-ийн ард) — бүлгийг НЭР
                         дээр нь дарж нээж/хаана, эсвэл 1–5 товчоор. */
                      return (
                        <td
                          key={k}
                          className={`${fzc(k)} ${n.name} ${isGroup ? n.nameTog : ''}`}
                          style={{ ...sty(k), paddingLeft: 6 + indentOf(r.depth) }}
                          onClick={isGroup ? () => toggle(r.oid) : undefined}
                          aria-expanded={isGroup ? !closed.has(r.oid) : undefined}
                        >
                          {r.name}
                        </td>
                      );
                    }
                    /* ⚠️ 2026-10-14 (хэрэглэгч: «1-7 тооны ард + оруул, дараад түвшнээрээ задалдаг бай»):
                       Д/Д-ийн ард «+/−» товч БУЦААЖ нэмэгдэв — 2026-09-25-нд хассан ч хэрэглэгч шууд хүссэн.
                       Нэр дээр дарж нээх зам ХЭВЭЭР; товч нь нэг шат л нээнэ/хаана (`toggle`). */
                    if (k === 'code' && isGroup) {
                      const isOpen = !closed.has(r.oid);
                      return (
                        <td key={k} className={`${fzc(k)} ${n.code}`} style={sty(k)}>
                          {r.code}
                          <button
                            type="button"
                            className={n.tog}
                            onClick={() => toggle(r.oid)}
                            aria-expanded={isOpen}
                            aria-label={isOpen ? tr('Хураах') : tr('Задлах')}
                            title={isOpen ? tr('Хураах') : tr('Задлах')}
                          >
                            {isOpen ? '−' : '+'}
                          </button>
                        </td>
                      );
                    }
                    const cls = k === 'code' || k === 'bagts' ? n.code : n.num;
                    /* ⚠️ 2026-10-15: засах горим — оролт нүд нь input; томьёогоор өөрчлөгдсөн нүд цэнхэр */
                    if (edit) {
                      /* ⚠️ 2026-10-19 (аудит): `n.dirty` — `f.cellDirty`-ийн тунгалаг дэвсгэрийг ЦАРЦСАН нүдэнд тунгалаг бус болгоно */
                      const mark = edit.edited(r.oid, k) ? `${f.cellDirty} ${n.dirty}` : edit.derived(r.oid, k) ? n.cellCalc : '';
                      if (edit.can(r.oid, k)) {
                        return (
                          <td key={k} className={`${fzc(k)} ${cls} ${n.edCell} ${mark}`} style={sty(k)}>
                            <EditInput v={edit.value(r.oid, k)} budget={k === 'budget'} onCommit={(t) => edit.set(r.oid, k, t)} />
                          </td>
                        );
                      }
                      return (
                        <td key={k} className={`${fzc(k)} ${cls} ${mark}`} style={sty(k)}>{body(k)}</td>
                      );
                    }
                    return (
                      <td key={k} className={`${fzc(k)} ${cls}`} style={sty(k)}>{body(k)}</td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
