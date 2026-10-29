'use client';

/**
 * ХАБЭА — Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй.
 *
 * ГУРВАН эх сурвалж: ажилтан/техникийн өдрийн тайлан (Survey123 — ӨРГӨН схем,
 * гүйцэтгэгч бүр баганын бүлэгтэй), осол зөрчлийн бүртгэл (Survey123), цамхагт
 * кран (цэг, layer 50) + аюулгүйн бүс (полигон, layer 51).
 *
 * Бүтэц: ДЭЭР KPI зурвас (бүтэн өргөн), ЗҮҮНД осол зөрчлийн аналитик, ТӨВД
 * газрын зураг — бүтэц нь «Ерөнхий мэдээлэл»-тэй ЯГ ИЖИЛ (дээд-төвд Давхарга ·
 * Тунгалаг · 2D/3D/BIM нэг pill-д), БАРУУНД кран ба хүн хүч, ДООД зурваст
 * багц/компанийн харьцуулал.
 *
 * ХӨНДЛӨН ШҮҮЛТ (ArcGIS Dashboard-ын зарчим, хоёр чиглэлт):
 *   ЧАРТ → ЗУРАГ  Аль ч чартын хэсгийг дарахад тэр утга шүүлт болж, газрын
 *                 зургийн давхаргууд `layerWhere`-ээр, бусад чарт нь шүүгдсэн
 *                 олонлогоор ЗЭРЭГ шинэчлэгдэнэ.
 *   ЗУРАГ → ЧАРТ  Зурган дээрх объект дарахад ЗӨВХӨН ӨӨРИЙН эх сурвалжийн
 *                 чартууд шүүгдэнэ (осол дарвал ослынх, кран дарвал краных) —
 *                 өөр эх сурвалжид тухайн талбар байхгүй тул хөндөхгүй.
 * Хэмжээсүүд ба тэдгээрийн хамрах хүрээг `Dim2`-оос үзнэ. Идэвхтэй шүүлт бүр
 * зурган дээр өөрийн чиптэй гарч, тус тусад нь арилгагдана.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures, arcgisPost, type Row } from '@/lib/query';
import { loadCodedMaps, codedName, type CodedMaps } from '@/lib/codedDomain';
import {
  HABEA, HABEA_LAYER_IDS, HABEA_UZLEG_LAYER_ID, LAYER_BY_ID, CATALOG_LAYER_IDS, zoneWhere,
  laborCompanyFields, roleForUser,
} from '@/lib/services';
import { rasterTypeOf } from '@/lib/uzlegReport';
import { usePlanTotals } from '@/lib/totals';
import { latestRowPerDay, companyReported, ubDayKey } from '@/lib/ceo/workforce';
import { isBlankIncident } from '@/lib/ceo/safety';
import { hoursByDay, rateByMonth, rateByPkg, markCurMonth, CUR_MONTH_MARK, ltiFreeHours, incCompanySfx } from './habeaRate';
import { mixByDay, mixByMonth, mixLines } from './habeaMix';
import { cached } from '@/lib/live';
import { register } from '@/lib/dataBus';
import { usePanes } from './habeaPanes';
import {
  useUzleg, filterUzleg, uzPass, uzPickRows, uzValueLabel, UzlegLeft, UzlegRight, UzlegFin,
  habeaPkgKey, habeaPkgLabel, loadWeekScores, prevWeek, weekScoreOf, weekScoreByPkg, ScoreColumns, scoreColor, weekNcByPkg, UzSrcHead, stepNote,
  UzlegPhotos, AttPhoto, inSel,
  SERIES_VISIBLE,
  UZLEG_SHORT, type UzlegKind, type UzDim,
} from './habeaUzleg';
import { MultiSelect } from '@/components/MultiSelect';
import { DateRangePill } from '@/components/DateRangePill';
import { Section, Bars, Donut, Series, Stack, Loading, Empty, friendlyError, type SeriesLineDef } from '@/components/ui';
import { UzlegExportButton } from './UzlegExport';
import { loadHabeaRegisters, loadHabeaWaste, loadIsOrgAdmin, loadWasteCanCreate, HABEA_POLL_MS, HABEA_TTL_MS } from '@/lib/habeaRegisters';
import { HabeaCardGrips } from './HabeaCardGrips';
import { AddButton, RegisterAddDialog, WasteAddDialog } from './HabeaEntry';
import { HseActionPanel } from './HabeaAction';

/** «Хог хаягдал» донат — `HABEA.waste.kinds`-д байхгүй төрлийн нөөц өнгө (өгөгдлийн дарааллаар) */
const WASTE_EXTRA = ['#7c3aed', '#0ea5e9', '#14b8a6', '#f97316', '#a3e635', '#ec4899', '#64748b', '#eab308'];
import { hasCap, subscribeCaps } from '@/lib/caps';
import { useAuth } from '@/components/AuthGate';
import { num, date, text, pct, cat } from '@/lib/format';
import { MapCanvas, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { Segmented } from '@/components/Switch';
import h from './habea.module.css';
import o from './habeaOv.module.css';

const L = HABEA.labor.fields;
const I = HABEA.incident.fields;
const C = HABEA.crane.fields;

/** «Давхарга» каталогийн тоолуурт орох давхаргууд — ХАБЭА эхэнд, дараа нь контекст */
const CATALOG_IDS = CATALOG_LAYER_IDS;

type HabeaData = {
  labor: Row[]; incident: Row[]; crane: Row[]; fetchedAt: number; failed: string[];
  laborFailed: boolean; incFailed: boolean; craneFailed: boolean;
  /** Ослын давхаргын codedValue домэйн (төрөл · шалтгааны төрөл) — код → нэр; мета унавал `{}` (код хэвээр) */
  incDom: CodedMaps;
};

/* 5 мин кэш (2026-08-21 гүйцэтгэлийн аудит): харагдац сэлгэх бүрд 3 бүтэн
   хүснэгт дахин татагддаг байв */
const loadHabea = cached(async (): Promise<HabeaData> => {
  const names = [tr('Хүн хүч'), tr('Осол, зөрчил'), tr('Цамхагт кран')];
  const [res, incDom] = await Promise.all([Promise.allSettled([
    queryFeatures(HABEA.labor.url, { outFields: ['*'], orderBy: 'objectid ASC' }),
    queryFeatures(HABEA.incident.url, { outFields: ['*'], orderBy: 'objectid ASC' }),
    queryFeatures(HABEA.crane.url, { outFields: ['*'], orderBy: `${HABEA.crane.fields.oid} ASC` }),
  ]), loadCodedMaps(HABEA.incident.url, [I.turul, I.shaltgaanTurul, I.company])]);
  const bad = res.flatMap((r, i) => (r.status === 'rejected' ? [i] : []));
  if (bad.length === res.length) throw (res[0] as PromiseRejectedResult).reason;
  for (const i of bad) console.warn(`[selbe] ХАБЭА · «${names[i]}» татагдсангүй:`, (res[i] as PromiseRejectedResult).reason);
  const val = (i: number): Row[] => (res[i].status === 'fulfilled' ? (res[i] as PromiseFulfilledResult<Row[]>).value : []);
  // «Осолгүй хоног» render дотор Date.now() дуудаж болохгүй (react-hooks/purity)
  // тул лавлах цэг нь ӨГӨГДӨЛ ТАТСАН мөч — дахин ачаалахад шинэчлэгдэнэ.
  return { labor: val(0), incident: val(1), crane: val(2), fetchedAt: Date.now(), failed: bad.map((i) => names[i]), laborFailed: bad.includes(0), incFailed: bad.includes(1), craneFailed: bad.includes(2), incDom };
},
  HABEA_TTL_MS, ['HABEA']);

const nn = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Survey123-ийн бичвэрт ирдэг хашилтыг цэвэрлэнэ. Domain-ий утга 30 тэмдэгтэд
 * ТАСАРСАН байдаг (`"Нутгын буян` …) тул зах гэлтгүй БҮХ хашилтыг авна —
 * эс бөгөөс хагас хашилт үлдэнэ.
 */
const clean = (v: unknown): string => text(v, '—').replace(/["“”]/g, '').trim() || '—';

function countBy<T>(rows: T[], val: (r: T) => string) {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const k = val(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return [...m.entries()]
    .map(([label, value]) => ({ key: label, label, value }))
    .sort((a, b) => b.value - a.value);
}

/** Эхний N ангиллыг үлдээж, үлдсэнийг «Бусад» болгож нэгтгэнэ — легенд богино байх */
function topN<T extends { key: string; label: string; value: number }>(items: T[], n: number) {
  if (items.length <= n + 1) return items;
  const rest = items.slice(n);
  return [
    ...items.slice(0, n),
    { key: '__other', label: tr('Бусад'), value: rest.reduce((s, x) => s + x.value, 0) },
  ] as T[];
}

/* ─────────── Осол, зөрчил ─────────── */

/**
 * Ослын төрлийн ХҮНД байдлын өнгө — domain-ий утгууд чөлөөт бичвэртэй ирдэг
 * («Амь нас эрсдэж болзошгүй байсан», «Ноцтой осол»...) тул түлхүүр үгээр
 * тааруулна. Дараалал чухал: амь нас/ноцтой нь «болзошгүй»-ээс түрүүнд.
 */
/**
 * АМЬ НАСНЫ эрсдэлтэй төрөл. Тусад нь нэрлэсэн шалтгаан: энэ загварыг ХОЁР
 * газар хэрэглэнэ — дэлгэрэнгүй жагсаалтын цэг (`severityHue`) ба ослын
 * төрлийн пайн улаан зүсмэг (`riskRed`). Хоёр тийш хуулбарлавал нэгийг нь
 * засахад нөгөө нь чимээгүй хоцорч, ижил бүртгэл хоёр өөр өнгөтэй харагдана.
 */
const LIFE_RISK = /амь|ноцтой|үйлдвэрлэлийн/i;

const SEVERITY: [RegExp, string][] = [
  [LIFE_RISK, 'var(--bad)'],
  [/гал/i, 'var(--bad)'],
  [/эмнэлг|гэмтэл|тусламж/i, 'var(--warn)'],
  [/эд хөрөнг|өмч|хохирол/i, 'var(--warn)'],
  [/дөхсөн|болзошгүй/i, 'var(--warn)'],
];
const severityHue = (label: string) => SEVERITY.find(([re]) => re.test(label))?.[1] ?? 'var(--ink-3)';

/**
 * ТЭРГҮҮЛЭГЧИЙГ улаанаар (`--bad`), бусдыг өгөгдлийн ганц цэнхэр-теал өнгөөр
 * (`--data`). Улаан нь ЭНД «хамгийн их тохиолдсон» гэсэн ГАНЦ утга үүрнэ —
 * ослын хүнд байдалтай хамаагүй.
 */
function leadRed<T extends { value: number }>(items: T[]) {
  const top = Math.max(0, ...items.map((x) => x.value));
  const leaders = items.filter((x) => x.value === top).length;
  const mark = top > 0 && leaders < items.length;
  return items.map((x) => ({
    ...x,
    color: mark && x.value === top ? 'var(--bad)' : 'var(--data)',
  }));
}

/**
 * Ослын ТӨРЛИЙН пайд ангилал бүрд ӨӨР өнгө — төслийн ангиллын палитрын
 * `--c1`…`--c8` слотууд (globals.css). Эдгээр нь горим бүрт тусад нь
 * тохируулагдсан, зэргэлдээ хос нь өнгө ялгах бэрхшээлтэй хүнд ч ялгарна.
 */
function categoryColors<T extends { key: string; label: string }>(items: T[]) {
  return items.map((it, i) => ({
    ...it,
    color: it.key === '__other' ? 'var(--ink-3)' : `var(--c${(i % 8) + 1})`,
  }));
}

/**
 * АМЬ НАСНЫ эрсдэлтэй ангиллыг ангиллын палитрын слотоос ГАРГАЖ улаан
 * (`var(--bad)`) болгоно — захиалагчийн хүсэлт, 2026-08-21.
 */
function riskRed<T extends { key: string; label: string; color: string }>(items: T[]) {
  return items.map((it) =>
    it.key !== '__other' && LIFE_RISK.test(it.label) ? { ...it, color: 'var(--bad)' } : it,
  );
}

type Inc = {
  oid: number; d: number; bagtsRaw: string; bagtsK: string; company: string;
  type: string; cause: string; info: string; reason: string; action: string;
};

/** Ослын огноо — 0 (маягтад огноо алга) бол «1970.01.01» биш «огноогүй» */
const incDate = (d: number): string => (d > 0 ? date(d) : tr('огноогүй'));

/**
 * Кодлогдсон талбарын нэр — Survey123-ийн «Бусад» (`other`) сонголтод жинхэнэ бичвэр `<field>_other`-д.
 */
const incRaw = (r: Row, field: string): unknown => {
  const v = r[field];
  const o = r[`${field}_other`];
  return String(v ?? '').trim().toLowerCase() === 'other' && o != null && String(o).trim() ? String(o).trim() : v;
};
const incNamed = (dom: CodedMaps, r: Row, field: string): string => {
  const v = incRaw(r, field);
  return v === r[field] ? codedName(dom[field], v) : String(v);
};

const normIncident = (r: Row, dom: CodedMaps): Inc => ({
  oid: nn(r['objectid']),
  d: nn(r[I.ognoo]),
  bagtsRaw: text(incRaw(r, I.bagts), '—'),
  bagtsK: habeaPkgKey(incRaw(r, I.bagts)),
  company: clean(codedName(dom[I.company], r[I.company])),
  type: incNamed(dom, r, I.turul) || '—',
  cause: incNamed(dom, r, I.shaltgaanTurul) || '—',
  info: text(r[I.medeelel], '—'),
  reason: text(r[I.shaltgaan], '—'),
  action: text(r[I.argaHemjee], '—'),
});

/* ─────────── Цамхагт кран ─────────── */

const CRANE_HUE: Record<string, string> = {
  'Шинээр нэмэгдсэн': 'var(--data)', 'Одоо байгаа': 'var(--data)', 'Буусан': '#9ca3af',
};

type Crane = {
  /** Цэг [50]-ийн OBJECTID — зураг · бүс · чартын ГАНЦ түлхүүр (`HABEA.crane.fields.oid`) */
  oid: number;
  /** Бүсийн `ORIG_FID`-тэй тулгах түлхүүр — `orig_oid` (Enterprise), байхгүй бол `oid` (2026-10-21, `HABEA.crane.fields.link`) */
  link: number;
  dugaar: string; blok: string; bagtsRaw: string; bagtsK: string;
  undur: number; sunUrt: number; tuluv: string;
};

const normCrane = (r: Row): Crane => ({
  oid: nn(r[C.oid]),
  link: nn(r[C.link]) || nn(r[C.oid]),
  dugaar: text(r[C.dugaar], '—'),
  blok: text(r[C.blok], '—'),
  bagtsRaw: text(r[C.bagts], '—'),
  bagtsK: habeaPkgKey(r[C.bagts]),
  undur: nn(r[C.undur]),
  sunUrt: nn(r[C.sunUrt]),
  tuluv: text(r[C.tuluv], '—'),
});

/* ─────────── Ажилтан · техник (өргөн схем) ─────────── */

type LaborRow = {
  key: string; label: string; code: string; bagtsRaw: string; bagtsK: string;
  mongol: number; gadaad: number; ajiltan: number; tehnik: number;
};

/**
 * Хүн хүч, техникийн «одоогийн байдал».
 *
 * СҮҮЛИЙН бүртгэлээс (max огноо) гүйцэтгэгч бүрийн баганын бүлгийг задлана —
 * нэг бүртгэл өдрийн НЭГДСЭН тайлан тул нийлбэр нь тухайн өдрийн бүрэн зураг.
 */
function laborState(rows: Row[]): {
  rows: LaborRow[];
  asOf: number | null;
  cum: { ajiltan: number; tehnik: number };
} {
  const ZERO = { ajiltan: 0, tehnik: 0 };
  if (!rows.length) return { rows: [], asOf: null, cum: ZERO };
  const dOf = (r: Row) => nn(r[L.ognoo]) || nn(r['created_date']);
  /**
   * Survey123 дээр эхлүүлээд бөглөж дуусаагүй маягтууд `Ognoo` нь хоосон,
   * харин `CreationDate` нь ӨНӨӨДӨР байдаг. `CreationDate`-д найдвал тэдгээр
   * хоосон мөр бодит тайлангуудыг дарж «сүүлийнх» болох тул ажилтан, техник,
   * гүйцэтгэгчийн шүүлтүүр БҮГД хоосорно (2026-08-20: 240 бүртгэлийн 27 нь
   * ийм байж, самбар «Судалгаа бөглөгдөөгүй» гэж харуулж байв).
   *
   * `CreationDate`-ын нөөц зам нь огноо бүхий мөр огт байхгүй үед л үлдэнэ.
   */
  const dated = rows.filter((r) => nn(r[L.ognoo]) > 0);
  const pool = dated.length ? dated : rows;
  const latest = pool.reduce((a, b) => (dOf(b) >= dOf(a) ? b : a));
  const asOf = dOf(latest) || null;

  const comp: LaborRow[] = HABEA.labor.companies
    .map((c) => {
      const f = laborCompanyFields(c.sfx);
      const mongol = nn(latest[f.mongol]);
      const gadaad = nn(latest[f.gadaad]);
      const bagtsRaw = c.bagts ?? text(latest[f.bagts], '');
      return {
        key: c.sfx, label: c.label, code: c.code, bagtsRaw, bagtsK: habeaPkgKey(bagtsRaw),
        mongol, gadaad,
        ajiltan: nn(latest[f.niitAjiltan]) || mongol + gadaad,
        tehnik: nn(latest[f.niitTehnik]),
      };
    })
    .filter((x) => x.ajiltan > 0 || x.tehnik > 0);

  /**
   * ТӨСЛИЙН ЭХНЭЭС ХУРИМТЛАГДСАН нийлбэр — маягтын ТОЛГОЙН талбаруудаас
   * (`Niit_ajiltan`, `Hun_tsag`, `Niit_tehnik`) бүх бүртгэлээр.
   */
  const cum = rows.reduce<{ ajiltan: number; tehnik: number }>(
    (a, r) => ({
      ajiltan: a.ajiltan + nn(r[L.niitAjiltan]),
      tehnik: a.tehnik + nn(r[L.niitTehnik]),
    }),
    { ajiltan: 0, tehnik: 0 },
  );

  return { rows: comp, asOf, cum };
}


/**
 * Гүйцэтгэгч бүрийн өдөр тутмын ажилтны тоо — ОГНООГООР.
 *
 * `sfxs` өгвөл тэдгээр гүйцэтгэгчийн баганын нийлбэр, эс бөгөөс бүх гүйцэтгэгчийн
 * нийлбэр. ХООСОН массив (`[]`) нь «бүгд» БИШ — шүүлт юу ч тааруулаагүй
 * гэсэн үг тул цуваа хоосон гарна.
 */
/**
 * Гүйцэтгэгч бүрийн БҮХ ХУГАЦААНЫ нийлбэр — шүүлтүүрийн сонголт ба
 * харьцуулалтын аль алинд.
 */
function companyTotals(rows: Row[]) {
  return HABEA.labor.companies.map((c) => {
    const f = laborCompanyFields(c.sfx);
    return {
      key: c.sfx,
      code: c.code,
      label: c.label,
      bagtsK: c.bagts ? habeaPkgKey(c.bagts) : '',
      ajiltan: rows.reduce((s, r) => s + nn(r[f.niitAjiltan]), 0),
      tehnik: rows.reduce((s, r) => s + nn(r[f.niitTehnik]), 0),
      mongol: rows.reduce((s, r) => s + nn(r[f.mongol]), 0),
      gadaad: rows.reduce((s, r) => s + nn(r[f.gadaad]), 0),
    };
  });
}

/**
 * Өдөр тутмын цуваа — ажилтан эсвэл техник.
 *
 * `sfxs` өгвөл тэдгээр гүйцэтгэгчийн баганын нийлбэр, эс бөгөөс бүх гүйцэтгэгчийн
 * нийлбэр. ХООСОН массив (`[]`) нь «бүгд» БИШ — шүүлт юу ч тааруулаагүй
 * гэсэн үг тул цуваа хоосон гарна.
 */
function byDaySeries(rows: Row[], sfxs: readonly string[] | null, key: 'niitAjiltan' | 'niitTehnik') {
  const list = (sfxs ?? HABEA.labor.companies.map((c) => c.sfx)).map((sfx) => ({ sfx, f: laborCompanyFields(sfx) }));
  return rows
    .map((r) => {
      /**
       * `nn` нь `null`-ыг 0 болгодог тул нэг ч компани тайлангаа
       * өгөөгүй өдөр «0 ажилтан» гэсэн ЦЭГ болж графикт буудаг байв —
       * энэ файлын өөр («хэмжигдээгүйг 0%-иар зурвал ХУДАЛ
       * уншигдана») үүнийг хориглосон. Одоо БҮХ талбар хоосон бол мөр
       * `null` утгатай гарч, цувааны цоорхой хэвээр үлдэнэ.
       */
      let sum: number | null = null;
      for (const { sfx, f } of list) {
        if (!companyReported(r, sfx)) continue;
        const v = r[f[key]];
        if (v == null || v === '') continue;
        const x = Number(v);
        if (!Number.isFinite(x)) continue;
        sum = (sum ?? 0) + x;
      }
      return { d: nn(r[L.ognoo]), value: sum };
    })
    .filter((x) => x.d > 0 && x.value != null)
    .sort((a, b) => a.d - b.d)
    .reduce<{ key: string; label: string; value: number; display: string }[]>((acc, x) => {
      const iso = ubDayKey(x.d);
      const last = acc[acc.length - 1];
      const v = x.value as number;
      if (last?.key === iso) last.value += v;
      else acc.push({ key: iso, label: iso.slice(5).replace('-', '.'), value: v, display: '' });
      return acc;
    }, [])
    .map((x) => ({ ...x, display: num(x.value) }));
}

/**
 * БАГЦЫН НЭР → ЭРЭМБЭЛЭХ ТООН ЦУВАА. «Багц-4.1» → [4, 1].
 *
 * Одоо нэрнээс ТООГ нь сугалж, түвшин бүрээр харьцуулна: 1 < 2 < 3.2 <
 * 3.3 < 4.1 < 4.2. Тоогүй нэр (жишээ нь «Ерөнхий») эцэст нь үлдэнэ.
 */
const pkgOrder = (label: string): number[] => {
  const m = label.match(/\d+/g);
  return m ? m.map(Number) : [Number.MAX_SAFE_INTEGER];
};

/** Хоёр багцын нэрийг түвшин түвшнээр нь харьцуулна */
const cmpPkg = (a: string, b: string): number => {
  const x = pkgOrder(a);
  const y = pkgOrder(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d;
  }
  return a.localeCompare(b);
};

/**
 * САРЫН ЦУВАА — ӨДРИЙН цуваанаас нэгтгэнэ.
 */
function byMonthSeries(daily: { key: string; value: number }[], curYm = '') {
  const m = new Map<string, number>();
  for (const x of daily) {
    const ym = x.key.slice(0, 7);
    m.set(ym, (m.get(ym) ?? 0) + x.value);
  }
  return markCurMonth([...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, value]) => ({ key: ym, label: ym.replace('-', '.'), value, display: num(value) })), curYm);
}

/* ─────────── Туслах дүрслэл ─────────── */

/**
 * KPI НҮД — шошго · том тоо · (харьцааны зурвас) · (тайлбар).
 */
/**
 * KPI НҮДНИЙ ӨНГӨ (2026-10-08, хэрэглэгчийн жишээ зураг). Нүд бүр ӨӨРИЙН өнгөтэй (`--t`) —
 * харьцааны зурвас. Эффектүүд (уусгалт, гэрэлтэлт, бүдэг том дүрс) ба ДҮРСҮҮД хэрэглэгчийн
 * хүсэлтээр хасагдсан («icon-уудыг нь хас»).
 */
type KpiLook = { tone: string };
const KPI_LOOK: Record<'people' | 'hours' | 'tech' | 'crane' | 'inc' | 'score', KpiLook> = {
  people: { tone: cat(2) },
  hours: { tone: cat(1) },
  tech: { tone: cat(4) },
  crane: { tone: 'var(--data)' },
  inc: { tone: cat(6) },
  score: { tone: 'var(--good)' },
};

const kpiTile = (
  look: KpiLook,
  val: ReactNode, label: string, unit?: string, sub?: string, ratio?: number | null, subWarn = false,
  bigLabel = false,
) => (
  <div className={h.kt} style={{ '--t': look.tone } as React.CSSProperties}>
    <div className={h.ktHead}>
      <div className={`${h.ktLabel} ${bigLabel ? h.ktLabelBig : ""}`}>{label}</div>
    </div>
    <div className={h.ktFoot}>
      <div className={h.ktVal}><b>{val}</b>{unit && <i>{unit}</i>}</div>
      {ratio != null && Number.isFinite(ratio) && (
        <div className={h.ktBar} aria-hidden>
          <span style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
        </div>
      )}
      {sub && <div className={`${h.ktSub} ${subWarn ? h.ktSubWarn : ''}`} role={subWarn ? 'alert' : undefined} title={sub}>{sub}</div>}
    </div>
  </div>
);

/* ─────────── Ослын хавсаргасан зураг (attachment) ─────────── */

type Photo = { id: number; name: string; type?: string };

/** Бүртгэл бүрийн хавсралтын жагсаалт — нэг удаа татаад кэшлэнэ (задлах бүрд дахин татахгүй) */
const photoCache = new Map<number, Promise<Photo[]>>();
register(() => photoCache.clear(), ['HABEA']);
const loadPhotos = (oid: number): Promise<Photo[]> => {
  let p = photoCache.get(oid);
  if (!p) {
    p = arcgisPost<{
      attachmentInfos?: { id: number; contentType?: string; name?: string }[];
    }>(`${HABEA.incident.url}/${oid}/attachments`, { f: 'json' })
      .then((j) => {
        return (j.attachmentInfos ?? [])
          .filter((a) => rasterTypeOf(a.contentType) != null)
          .map((a) => ({ id: a.id, name: a.name ?? tr('Зураг {0}', a.id), type: a.contentType }));
      });
    p.catch(() => photoCache.delete(oid));
    photoCache.set(oid, p);
  }
  return p;
};

/**
 * Олон бүртгэлийн хавсралтыг ЦУВРАЛ багцаар татна — 17 зэрэг хүсэлт ArcGIS-ийн
 * rate limit-д өртөж бүх ханыг унагадаг байв (query.ts-ийн limiter энд үйлчлэхгүй).
 */
async function loadPhotoBatches<T>(list: Inc[], of: (i: Inc, p: Photo) => T): Promise<{ items: T[]; failed: number }> {
  const out: T[] = [];
  let failed = 0;
  let firstErr: unknown = null;
  for (let i = 0; i < list.length; i += 4) {
    const chunk = await Promise.allSettled(
      list.slice(i, i + 4).map((inc) => loadPhotos(inc.oid).then((ph) => ph.map((p) => of(inc, p)))),
    );
    for (const r of chunk) {
      if (r.status === 'fulfilled') out.push(...r.value);
      else { failed += 1; firstErr ??= r.reason; }
    }
  }
  if (list.length && failed === list.length) throw firstErr;
  return { items: out, failed };
}

/** Бүртгэлийн хавсаргасан зургууд — дарахад бүтэн хэмжээгээр шинэ цонхонд */
function IncPhotos({ oid }: { oid: number }) {
  const q = useAsync<Photo[]>(() => loadPhotos(oid), [oid]);
  if (q.state === 'loading') return <div className={h.photoNote}>{tr('Зураг шалгаж байна…')}</div>;
  if (q.state === 'error') {
    return (
      <div className={h.photoNote} role="alert">
        {tr('Зураг татагдсангүй')}
        {q.retry && (
          <button type="button" className={h.retry} onClick={q.retry}>{tr('Дахин оролдох')}</button>
        )}
      </div>
    );
  }
  if (!q.data.length) return null;
  return (
    <div className={h.photos}>
      {q.data.map((p) => (
        <AttPhoto key={p.id} url={`${HABEA.incident.url}/${oid}/attachments/${p.id}`} alt={p.name} title={p.name} name={p.name} type={p.type} />
      ))}
    </div>
  );
}

/**
 * Ослын хавсаргасан зургийн СЛАЙДЕР — тусдаа карт. Бүртгэл бүрийн хавсралтыг
 * (кэштэй `loadPhotos`) нэгтгэж, шинэ нь эхэндээ; НЭГ зураг харагдаж, ‹ ›
 * товчоор солино. Багцын шүүлтийг дагана.
 */
function PhotoWall({ list }: { list: Inc[] }) {
  const ids = list.map((x) => x.oid).join(',');
  const [idx, setIdx] = useState(0);
  const q = useAsync<{ items: { src: string; cap: string; tip: string; name: string; type?: string }[]; failed: number }>(
    () =>
      loadPhotoBatches(list, (i, p) => ({
        src: `${HABEA.incident.url}/${i.oid}/attachments/${p.id}`,
        cap: `${incDate(i.d)} · ${tr(i.bagtsRaw)}`,
        tip: `${tr(i.type)} — ${tr(i.company)}`,
        name: p.name,
        type: p.type,
      })),
    [ids],
  );
  if (q.state === 'loading') return <Loading label={tr('Зураг ачаалж байна…')} />;
  if (q.state === 'error') {
    return (
      <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
        <Empty label={tr('Зураг татагдсангүй')} />
        {q.retry && <button type="button" className={h.retry} onClick={q.retry}>{tr('Дахин оролдох')}</button>}
      </div>
    );
  }
  const n = q.data.items.length;
  const failNote = q.data.failed > 0 && (
    <div className={h.photoNote} role="alert">
      {tr('{0} бүртгэлийн зураг татагдсангүй', num(q.data.failed))}{' '}
      {q.retry && <button type="button" className={h.retry} onClick={q.retry}>{tr('Дахин оролдох')}</button>}
    </div>
  );
  if (!n) return failNote || <Empty label={tr('Хавсаргасан зураг алга')} />;
  const cur = Math.min(idx, n - 1);
  const p = q.data.items[cur];
  return (
    <div>
      <div className={h.slide}>
        <button
          type="button"
          className={h.slideNav}
          disabled={n < 2}
          onClick={() => setIdx((cur - 1 + n) % n)}
          aria-label={tr('Өмнөх зураг')}
        >
          ‹
        </button>
        {/* Хөндлөнгийн ArcGIS хавсралт тул next/image-ийн оновчлол хамаагүй. */}
        <AttPhoto url={p.src} alt={p.tip} title={p.tip} className={h.slideImg} name={p.name} type={p.type} />
        <button
          type="button"
          className={h.slideNav}
          disabled={n < 2}
          onClick={() => setIdx((cur + 1) % n)}
          aria-label={tr('Дараагийн зураг')}
        >
          ›
        </button>
      </div>
      <div className={h.slideCap}>
        <span className={h.slideCapText}>{p.cap} · {p.tip}</span>
        <b className="num">{cur + 1}/{n}</b>
      </div>
      {failNote}
    </div>
  );
}

/** Зурган дээрээс сонгосон объектын картын мөрүүд */
function pickRows(id: string, a: Record<string, unknown>, dom: CodedMaps): [string, string][] {
  if (id === 'habea:osol') {
    return ([
      [tr('Огноо'), date(a[I.ognoo] as number)],
      [tr('Төрөл'), tr(codedName(dom[I.turul], a[I.turul]) || '—')],
      [tr('Багц'), text(a[I.bagts], '—')],
      [tr('Компани'), clean(codedName(dom[I.company], a[I.company]))],
      [tr('Мэдээлэл'), text(a[I.medeelel], '—')],
      [tr('Шалтгаан'), text(a[I.shaltgaan], '—')],
      [tr('Арга хэмжээ'), text(a[I.argaHemjee], '—')],
    ] as [string, string][]).filter(([, v]) => v !== '—');
  }
  const meters = (v: unknown): string => {
    const x = v == null || v === '' ? NaN : Number(v);
    return Number.isFinite(x) ? tr('{0} м', num(x)) : '—';
  };
  const rows: [string, string][] = [
    [tr('Багц'), text(a[C.bagts], '—')],
    [tr('Блок'), text(a[C.blok], '—')],
    [tr('Төлөв'), tr(text(a[C.tuluv], '—'))],
    [tr('Өндөр'), meters(a[C.undur])],
    [tr('Сумны урт'), meters(a[C.sunUrt])],
  ];
  if (id === 'habea:buffer') rows.push([tr('Аюулгүйн радиус'), meters(a['buff_dist'])]);
  return rows.filter(([, v]) => v !== '—');
}

/**
 * ШҮҮЛТҮҮРИЙН ЧИПҮҮД — өгөгдлийн эх сурвалж бүрд НЭГ.
 */
const FOCUS_CHIPS: {
  key: 'inc' | 'labor' | Exclude<UzlegKind, 'zahialagch'>;
  label: () => string;
  count: (inc: number) => number | null;
}[] = [
  { key: 'inc', label: () => tr('Осол, зөрчил'), count: (n) => n },
  { key: 'labor', label: () => tr('Техник болон хүн цаг'), count: () => null },
  { key: 'v11', label: () => tr('Захиалагчийн ажлын байрны үзлэг'), count: () => null },
  { key: 'guitsetgegch', label: () => tr('Гүйцэтгэгчийн ажлын байрны үзлэг'), count: () => null },
  { key: 'env', label: UZLEG_SHORT.env, count: () => null },
  { key: 'cold', label: UZLEG_SHORT.cold, count: () => null },
  { key: 'fire', label: UZLEG_SHORT.fire, count: () => null },
  { key: 'hazard', label: UZLEG_SHORT.hazard, count: () => null },
  { key: 'autocrane', label: UZLEG_SHORT.autocrane, count: () => null },
  { key: 'pump', label: UZLEG_SHORT.pump, count: () => null },
  { key: 'gondola', label: UZLEG_SHORT.gondola, count: () => null },
  { key: 'tower', label: UZLEG_SHORT.tower, count: () => null },
];

/* ─────────── Хөндлөн шүүлтийн загвар ─────────── */

/**
 * ХӨНДЛӨН ШҮҮЛТИЙН ХЭМЖЭЭСҮҮД — ArcGIS Dashboard-ын зарчмаар: аль ч чартын
 * хэсгийг дарахад тэр утга шүүлт болж, ГАЗРЫН ЗУРАГ болон бусад чарт дагана.
 *
 *   pkg        → осол · кран · ажилтан · гурван давхарга   (бүх эх сурвалжид бий)
 *   co         → ажилтан (яг), багцаараа дамжин бусад
 *   incType    → ЗӨВХӨН осол
 *   cause      → ЗӨВХӨН осол
 *   incCompany → ЗӨВХӨН осол
 *   craneState → ЗӨВХӨН кран
 */
type Dim2 = 'pkg' | 'co' | 'incType' | 'cause' | 'incCompany' | 'craneState'
  | 'uzSev' | 'uzShift' | 'uzCompany' | 'uzWeek'
  | 'day' | 'month';
type SelDim = Exclude<Dim2, 'pkg' | 'co'>;
type Sel = Record<SelDim, string[]>;
/** Үзлэгийн хэмжээсүүд — маягт солиход ЭДГЭЭР л цуцлагдана */
/**
 * Үзлэгийн хэмжээсүүд — маягт солиход ЭДГЭЭР л цуцлагдана.
 */
const NO_UZ_SEL: Pick<Sel, 'uzSev' | 'uzShift' | 'uzCompany' | 'uzWeek'> = {
  uzSev: [], uzShift: [], uzCompany: [], uzWeek: [],
};

const NO_SEL: Sel = {
  incType: [], cause: [], incCompany: [], craneState: [],
  ...NO_UZ_SEL,
  day: [], month: [],
};

const inSet = inSel;

/** Үзлэгийн самбарын хэмжээс → хуудасны сонголтын түлхүүр */
const UZ_DIM: Record<UzDim, SelDim> = {
  sev: 'uzSev', shift: 'uzShift', company: 'uzCompany',
  week: 'uzWeek', day: 'day', month: 'month',
};

/**
 * ГҮЙЦЭТГЭГЧ → БАГЦ (1:1) — хүн хүчний бүртгэлээс. Багц заагаагүй
 * гүйцэтгэгч (ММСЕ, SC …) ЭНД ОРОХГҮЙ.
 */
const PKG_OF_CO: ReadonlyMap<string, string> = new Map<string, string>(
  HABEA.labor.companies
    .filter((x) => x.bagts)
    .map((x) => [x.sfx, habeaPkgKey(x.bagts as string)] as const),
);

/** Хүний уншиж болох нэр — идэвхтэй шүүлтийн чипэнд гарна */
const DIM_LABEL: Record<Dim2, string> = {
  get pkg() { return tr('Багц'); },
  get co() { return tr('Компани'); },
  get incType() { return tr('Ослын төрөл'); },
  get cause() { return tr('Шалтгаан'); },
  get incCompany() { return tr('Ослын компани'); },
  get craneState() { return tr('Краны төлөв'); },
  get uzSev() { return tr('Үл нийцлийн зэрэг'); },
  get uzShift() { return tr('Ээлж'); },
  get uzCompany() { return tr('Үзлэгийн компани'); },
  get uzWeek() { return tr('Үзлэгийн долоо хоног'); },
  get day() { return tr('Өдөр'); },
  get month() { return tr('Сар'); },
};

/* ═══════════════════════ Үндсэн компонент ═══════════════════════ */

export function Habea({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  /* Газрын зургийн төлөв — бүтэц «Ерөнхий мэдээлэл»-тэй ИЖИЛ */
  const [visible, setVisible] = useState<string[]>([...HABEA_LAYER_IDS]);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [catOpen, setCatOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [layerSel, setLayerSel] = useState<string | null>(null);
  /** Бүсийн шүүлт — бусад харагдацтай ижил (`MapTools`-ийн «Бүс» товч) */
  const [zone, setZone] = useState<string | null>(null);

  const totals = usePlanTotals(null, catOpen, CATALOG_IDS);
  /** Панелийн хэмжээ — чирж тохируулна, `localStorage`-д хадгалагдана */
  const panes = usePanes();
  /**
   * ЦАГ — «одоо» (минут тутам) ба ДАХИН ТАТАХ тоолуур (5 мин тутам, таб харагдах үед).
   */
  const [now, setNow] = useState(() => Date.now());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 60_000);
    const poll = setInterval(() => { if (!document.hidden) setTick((t) => t + 1); }, HABEA_POLL_MS);
    const onShow = () => {
      if (document.hidden) return;
      setNow(Date.now());
      setTick((t) => t + 1);
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, []);
  const q = useAsync<HabeaData>(loadHabea, [tick], { keepOn: [tick] });
  const weekKey = prevWeek(new Date(now)).start.getTime();
  /* Өмнөх долоо хоногийн оноо — (талбай × компани) нүд, шүүлт нь санах ойд. */
  const weekScores = useAsync(() => loadWeekScores(new Date(now)), [weekKey, tick], { keepOn: [tick] });
  /* «Бусад үзүүлэлт» — ХАБ-ын бүртгэлүүд (2026-10-08). Долоо хоног солигдоход (`weekKey` —
     Даваа гараг) шинээр, 5 минутын `tick`-д хуучин утга дэлгэцэд үлдэнэ. */
  const regs = useAsync(() => loadHabeaRegisters(new Date(now)), [weekKey, tick], { keepOn: [tick] });
  /* Бүртгэл оруулах (2026-10-08) — ЗӨВХӨН `habeaData` эрхтэйд «+ Нэмэх»; бусдад карт энгийн */
  const { user } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((n) => n + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- capN: эрх шинэчлэгдэхэд дахин бодно
  const canEnter = useMemo(() => hasCap(user?.username, 'habeaData'), [user, capN]);
  const [entry, setEntry] = useState<null | 'reg' | 'waste'>(null);
  /* «Хог хаягдал» (2026-10-08) — долоо хоногийн бүх төрөл, хуудасны «Багц» шүүлтийг дагана */
  const waste = useAsync(() => loadHabeaWaste(new Date(now)), [weekKey, tick], { keepOn: [tick] });
  const isSuperUser = roleForUser(user?.username) === 'super';
  const wasteCan = useAsync<{ create: boolean | null; admin: boolean }>(async () => {
    if (!canEnter) return { create: null, admin: false };
    const create = await loadWasteCanCreate();
    return { create, admin: create === false && !isSuperUser ? await loadIsOrgAdmin() : false };
  }, [canEnter, isSuperUser, tick], { keepOn: [tick] });
  /** Явагдаж буй сар («YYYY-MM», орон нутгийн) — сарын цуваанд «*» */
  const curYm = ubDayKey(now).slice(0, 7);

  /* Олон хэмжээст хөндлөн шүүлт + зурган дээрээс сонгосон объект */
  const [sel, setSel] = useState<Sel>(NO_SEL);
  /**
   * БАГЦ ба КОМПАНИ — ОЛОН СОНГОЛТ (2026-09-15, хэрэглэгчийн хүсэлт).
   * Хоосон массив = бүгд. Хүснэгтийн мөр, газрын зургийн давхаргын аль аль
   * нь эдгээрээс ДАМЖИН `pkgEff`/`coEff`-ээр шүүгдэнэ.
   */
  const [pkgs, setPkgs] = useState<string[]>([]);
  const { wasteSlices, wasteMeasured } = useMemo(() => {
    if (waste.state !== 'ready') return { wasteSlices: [], wasteMeasured: false };
    let measured = false;
    const K = HABEA.waste.kinds;
    const base = (m: string) => m.replace(/\s*\((рейс|kg|кг|m3|м3)\)\s*$/i, '').trim().toLowerCase();
    const kindOf = (m: string) => K.find((k) => base(k.metric) === base(m));
    const order = (m: string) => { const k = kindOf(m); return k ? K.indexOf(k) : K.length; };
    const rows = [...waste.data.rows].sort((a, b) => order(a.metric) - order(b.metric) || a.metric.localeCompare(b.metric));
    let extra = 0;
    const slices: { key: string; label: string; value: number; color: string }[] = [];
    const byKey = new Map<string, { key: string; label: string; value: number; color: string }>();
    for (const row of rows) {
      let value = 0;
      let has = false;
      for (const [name, v] of Object.entries(row.byPkg)) {
        if (pkgs.length && !pkgs.includes(habeaPkgKey(name))) continue;
        measured = true;
        has = true;
        value += v;
      }
      if (!has) continue;
      const k = kindOf(row.metric);
      const key = k ? k.metric : base(row.metric);
      const hit = byKey.get(key);
      if (hit) { hit.value += value; continue; }
      const sl = k
        ? { key, label: k.label, value, color: k.color }
        : { key, label: row.metric.trim(), value, color: WASTE_EXTRA[extra++ % WASTE_EXTRA.length] };
      byKey.set(key, sl);
      slices.push(sl);
    }
    return { wasteSlices: slices, wasteMeasured: measured };
  }, [waste, pkgs]);
  const wasteTotal = wasteSlices.reduce((acc, x) => acc + x.value, 0);
  const [cos, setCos] = useState<string[]>([]);
  const [picked, setPicked] = useState<{ id: string; attrs: Record<string, unknown> } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  /**
   * ОСЛЫН ЧАРТУУД НЭЭЛТТЭЙ ЭСЭХ — АНХНААСАА ХААЛТТАЙ (2026-09-06,
   * хэрэглэгчийн хүсэлт).
   */
  /**
   * ФОКУС — АЛЬ өгөгдлийн самбар нээлттэй вэ (2026-09-06, хэрэглэгчийн
   * хүсэлт). `null` = ХУУДАСНЫ АНХНЫ харагдац.
   */
  type Focus = 'inc' | 'labor' | Exclude<UzlegKind, 'zahialagch'> | null;
  const [focus, setFocus] = useState<Focus>(null);

  /** Ослын чартууд нээлттэй эсэх — олон газар шалгагддаг тул тусад нь */
  const incOpen = focus === 'inc';
  /** «Техник болон хүн цаг» фокус — сарын чарт хажуу талд, өдрийнх доор */
  const laborFocus = focus === 'labor';
  /**
   * ӨДРИЙН ЦУВАА доод зурваст гарах эсэх.
   */
  const laborOpen = focus === null || laborFocus;
  const uzlegKind: UzlegKind | null =
    focus === 'v11' ? 'zahialagch' : focus && focus !== 'inc' && focus !== 'labor' ? focus : null;
  /** Захиалагчийн үзлэгийн фокус — зүүнд маягтын чартууд, баруунд үл нийцлийн арилгалт (`HseActionPanel`) */
  const zFocus = focus === 'v11';
  const uz = useUzleg(uzlegKind);
  /**
   * ХОЁР МАЯГТ ЗЭРЭГЦЭЭ (2026-09-17, хэрэглэгчийн хүсэлт) — «Захиалагчийн
   * ажлын байрны үзлэг» фокуст зүүн талд V1.1, баруун талд захиалагчийн
   * маягт ИЖИЛ чартуудаар. Гүйцэтгэгчийн маягтын фокус ганц эх сурвалжтай
   * хэвээр.
   */
  const dual = false as boolean;
  const uz2 = useUzleg(dual ? 'zahialagch' : null);
  /** Зүүн багана агуулгатай эсэх — торны баганын тоог шийднэ */
  const listOpen = true;
  /**
   * БАРУУН багана агуулгатай эсэх.
   *
   *   анхны  → баруун: кран (3 карт — түүхэн зохиомж, хэвээр)
   *   осол   → зүүн: 2 донат · баруун: дэлгэрэнгүй жагсаалт · доод: 2
   *   үзлэг  → зүүн: 2 · баруун: 2 · доод: 1
   *   хүн хүч → зөвхөн доод: 2 (цуваа нь ӨРГӨН хэрэгтэй тул баганад орохгүй)
   */
  const rOpen = true;

  /**
   * ХҮН ХҮЧНИЙ ЦУВААНЫ АЛХАМ — өдөр эсвэл сар (2026-09-06, хэрэглэгчийн
   * хүсэлт). Сарын хоёр карт тусдаа байсныг ӨДРИЙНХӨӨ картад давхарлаж,
   * гарчгийн хажуугийн шилжүүлэгчээр сольдог болгов.
   */
  const [ajiltanStep, setAjiltanStep] = useState<'day' | 'month'>('day');
  const [tehnikStep, setTehnikStep] = useState<'day' | 'month'>('day');

  const aStep = ajiltanStep;
  const tStep = tehnikStep;
  /**
   * ХҮЧИНТЭЙ БАГЦУУД — ЗӨВХӨН багцтай эх сурвалжид (осол, кран, газрын
   * зургийн гурван давхарга). `null` = шүүлтгүй.
   */
  const pkgEff = useMemo<ReadonlySet<string> | null>(() => {
    const a = pkgs.length ? new Set(pkgs) : null;
    const viaCo = cos.map((k) => PKG_OF_CO.get(k)).filter((k): k is string => Boolean(k));
    const b = viaCo.length ? new Set(viaCo) : null;
    if (a && b) return new Set([...a].filter((k) => b.has(k)));
    return a ?? b;
  }, [pkgs, cos]);

  /**
   * ХҮЧИНТЭЙ ГҮЙЦЭТГЭГЧ — багцын шүүлтийг хүн хүчний өгөгдөлд ХОЛБОНО.
   */
  const coEff = useMemo<string[] | null>(() => {
    const c = cos.length ? cos : null;
    const viaPkg: string[] = HABEA.labor.companies
      .filter((x) => pkgs.includes(PKG_OF_CO.get(x.sfx) ?? ''))
      .map((x) => x.sfx);
    const d = viaPkg.length ? viaPkg : null;
    if (c && d) return c.filter((k) => d.includes(k));
    return c ?? d;
  }, [pkgs, cos]);

  const onPick = useCallback((attrs: Record<string, unknown> | null, layerId: string | null) => {
    setPicked(attrs && layerId?.startsWith('habea:') ? { id: layerId, attrs } : null);
  }, []);

  // Ортофотогийн анхдагч Portal-д харагдац бүрээр тогтоогддог (habea = асаалттай)

  /**
   * Аль ч чартын хэсгийг дарахад — тухайн хэмжээсийг тавьж/авна.
   */
  const rangeKeysRef = useRef<string[] | null>(null);
  const toggleDim = useCallback((d: SelDim, v: string) => {
    setSel((s) => {
      if (d === 'day' && rangeKeysRef.current != null && s.day === rangeKeysRef.current) return { ...s, day: [v] };
      return { ...s, [d]: s[d].includes(v) ? s[d].filter((x) => x !== v) : [...s[d], v] };
    });
    setPicked(null);
  }, []);

  /** Чартын багана дарахад — тухайн багцыг сонголтод нэмнэ/хасна («Үл нийцэл — багцаар») */
  const togglePkg = useCallback((k: string) => {
    setPkgs((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
    setPicked(null);
  }, []);

  /** Чартын багана дарахад — тухайн гүйцэтгэгчийг сонголтод нэмнэ/хасна */
  const toggleCo = useCallback((k: string) => {
    setCos((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
    setPicked(null);
  }, []);


  /** Бүх шүүлт + зургийн сонголтыг нэг дор арилгана */
  const clearAll = useCallback(() => {
    setSel(NO_SEL);
    setPkgs([]);
    setCos([]);
    setPicked(null);
  }, []);



  const all = q.state === 'ready' ? q.data : null;
  const laborFailed = !!all?.laborFailed;
  const incFailed = !!all?.incFailed;
  const craneFailed = !!all?.craneFailed;
  const inc = useMemo(
    () => (all ? all.incident.filter((r) => !isBlankIncident(r)).map((r) => normIncident(r, all.incDom)) : []),
    [all],
  );
  /** «Ослын дэлгэрэнгүй мэдээлэл» — бүгдийг харуулах эсэх (анхдагч: сүүлийн 6) */
  const [allInc, setAllInc] = useState(false);
  /** Ослын давтамжийн алхам — багцаар / сараар */
  const [rateStep, setRateStep] = useState<'pkg' | 'month'>('pkg');
  const cranes = useMemo(() => (all ? all.crane.map(normCrane) : []), [all]);
  const laborRows = useMemo(() => latestRowPerDay(all ? all.labor : [], ubDayKey), [all]);
  /**
   * ОГНООНЫ МУЖ (2026-10-08, хэрэглэгч: «огноогоор шүүх шүүлтүүр нэмье»).
   */
  const [range, setRange] = useState<{ from: string; to: string; keys: string[] | null }>({ from: '', to: '', keys: null });
  const dataMin = useMemo(() => {
    let m = Infinity;
    for (const r of laborRows) { const d = nn(r[L.ognoo]); if (d > 0 && d < m) m = d; }
    for (const x of inc) if (x.d > 0 && x.d < m) m = x.d;
    for (const st of [uz, uz2]) if (st.state === 'ready') for (const x of st.rows) if (x.d > 0 && x.d < m) m = x.d;
    return Number.isFinite(m) ? ubDayKey(m) : '';
  }, [laborRows, inc, uz, uz2]);
  const applyRange = useCallback((from: string, to: string) => {
    if (!from && !to) {
      rangeKeysRef.current = null;
      setRange({ from: '', to: '', keys: null });
      setSel((p) => ({ ...p, day: [], month: [] }));
      setPicked(null);
      return;
    }
    const today = ubDayKey(Date.now());
    const b = !to || to > today ? today : to;
    if (from && from > b) return;
    /* Эхлэл: өгсөн нь эсвэл өгөгдлийн эхлэл; өгөгдлөөс өмнөх өдрүүдийг тоолохгүй (мөр байхгүй) */
    const a = !from ? (dataMin || b) : dataMin && from < dataMin ? dataMin : from;
    const keys: string[] = [];
    const [y0, m0, d0] = a.split('-').map(Number);
    for (let t = Date.UTC(y0, m0 - 1, d0); keys.length < 3700; t += 86_400_000) {
      const k = new Date(t).toISOString().slice(0, 10);
      if (k > b) break;
      keys.push(k);
    }
    if (!keys.length) keys.push(b);
    rangeKeysRef.current = keys;
    setRange({ from, to: to && to > today ? today : to, keys });
    setSel((p) => ({ ...p, day: keys, month: [] }));
    setPicked(null);
  }, [dataMin]);
  const rangeOn = range.keys != null && sel.day === range.keys;
  /**
   * КАПСУЛЫН УТГА — `sel.day`-ээс (2026-10-09). Урьд нь массивын ИЖИЛ ЛАВЛАГАА (`rangeOn`) л
   * харуулдаг тул чартаас өдөр дармагц шүүлт идэвхтэй атлаа капсул «Бүх огноо», «Арилгах» хаалттай
   * байв. Одоо: муж → мужийн утга; чартын сонголт → хамгийн бага – их өдөр (Арилгах идэвхтэй).
   */
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const pill = useMemo(() => {
    if (draft) return draft;
    if (!sel.day.length) return { from: '', to: '' };
    if (rangeOn) return { from: range.from, to: range.to };
    let lo = sel.day[0];
    let hi = sel.day[0];
    for (const k of sel.day) { if (k < lo) lo = k; if (k > hi) hi = k; }
    return { from: lo, to: hi };
  }, [draft, sel.day, rangeOn, range.from, range.to]);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (draftTimer.current) clearTimeout(draftTimer.current); }, []);
  const onPill = useCallback((from: string, to: string) => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (!from && !to) { setDraft(null); applyRange('', ''); return; }
    setDraft({ from, to });
    /* Хагас он (< 2000) эсвэл эхлэл > төгсгөл — ХЭРЭГЛЭХГҮЙ, бичиж дуусахыг хүлээнэ */
    const yr = (v: string) => (v ? Number(v.slice(0, 4)) : 9999);
    if (yr(from) < 2000 || yr(to) < 2000 || (from && to && from > to)) return;
    draftTimer.current = setTimeout(() => { setDraft(null); applyRange(from, to); }, 400);
  }, [applyRange]);
  const labor = useMemo(() => laborState(laborRows), [laborRows]);
  const ltiFree = useMemo(() => ltiFreeHours(laborRows, inc, ubDayKey, now), [laborRows, inc, now]);
  /**
   * ОГНООНЫ ШҮҮЛТТЭЙ хүн хүчний мөрүүд — өдөр/сарын цувааг ЭС тооцвол бүх
   * хүн хүчний дүрслэл (монгол/гадаад, компаниар) эндээс.
   */
  const laborDated = useMemo(() => {
    const rows = laborRows;
    if (!sel.day.length && !sel.month.length) return rows;
    return rows.filter((r) => {
      const d = nn(r[L.ognoo]);
      if (d <= 0) return false;
      const k = ubDayKey(d);
      return inSet(sel.day, k) && inSet(sel.month, k.slice(0, 7));
    });
  }, [laborRows, sel.day, sel.month]);

  /**
   * Багц сонгоход давхарга бүрийн WHERE — график дээр тоолсон ЯГ тэр мөрүүдийг
   * зурагт үлдээнэ (багцын бичиглэл давхарга бүрт өөр тул түүхий утгуудаас нь
   * IN(...) угсарна). Тухайн багцад юу ч алга бол `1=0` — давхарга хоосорно.
   */
  /**
   * ЗУРАГ → ЧАРТ. Зурган дээр дарсан объект нь ЗӨВХӨН ӨӨРИЙН эх сурвалжийн
   * дүрслэлийг шүүнэ: осол дарвал ослын чартууд, кран дарвал краны чартууд.
   * Ажилтны самбар нь зурагт давхаргагүй тул хэзээ ч хөндөгдөхгүй.
   */
  const pickOsol = picked?.id === 'habea:osol' ? nn(picked.attrs['objectid']) : 0;
  const pickCraneOid = picked && (picked.id === 'habea:crane' || picked.id === 'habea:buffer')
    ? (picked.id === 'habea:buffer'
      ? (cranes.find((c) => c.link === nn(picked.attrs[C.bufferLink]))?.oid ?? 0)
      : nn(picked.attrs[C.oid]))
    : 0;
  const pickUzZ = dual && picked?.id === HABEA_UZLEG_LAYER_ID.zahialagch;
  const pickUzOid = picked && (Object.values(HABEA_UZLEG_LAYER_ID) as string[]).includes(picked.id)
    ? nn(picked.attrs['objectid'])
    : 0;
  const pickSrc = pickUzZ ? uz2 : uz;
  const pickUzRow = pickUzOid && pickSrc.state === 'ready'
    ? pickSrc.rows.find((x) => x.oid === pickUzOid) ?? null
    : null;

  const incOn = Boolean(
    pkgEff || sel.incType.length || sel.cause.length || sel.incCompany.length
    || sel.day.length || sel.month.length || pickOsol,
  );
  const craneOn = Boolean(pkgEff || sel.craneState.length || pickCraneOid);

  /* Шүүгдсэн олонлогууд — БҮХ дүрслэл эдгээрээс тоологдоно. */
  /**
   * ОСЛЫН МӨР ШҮҮЛТЭЭР ГАРАХ УУ — `except` хэмжээсийг ТООЦОХГҮЙ.
   */
  const incPass = useCallback((x: Inc, except?: SelDim | 'pkg') =>
    (except === 'pkg' || !pkgEff || pkgEff.has(x.bagtsK))
    && (except === 'incType' || inSet(sel.incType, x.type))
    && (except === 'cause' || inSet(sel.cause, x.cause))
    && (except === 'incCompany' || inSet(sel.incCompany, x.company))
    && ((!sel.day.length && !sel.month.length)
      || (x.d > 0 && inSet(sel.day, ubDayKey(x.d)) && inSet(sel.month, ubDayKey(x.d).slice(0, 7))))
    && (!pickOsol || x.oid === pickOsol),
  [pkgEff, sel.incType, sel.cause, sel.incCompany, sel.day, sel.month, pickOsol]);

  const fInc = useMemo(() => inc.filter((x) => incPass(x)), [inc, incPass]);

  /** Краны мөр — `incPass`-ийн ижил «өөрийгөө хасах» дүрэм. Кран огноогүй. */
  const cranePass = useCallback((x: (typeof cranes)[number], except?: SelDim | 'pkg') =>
    (except === 'pkg' || !pkgEff || pkgEff.has(x.bagtsK))
    && (except === 'craneState' || inSet(sel.craneState, x.tuluv))
    && (!pickCraneOid || x.oid === pickCraneOid),
  [pkgEff, sel.craneState, pickCraneOid]);

  const fCrane = useMemo(() => cranes.filter((x) => cranePass(x)), [cranes, cranePass]);

  /**
   * ЧАРТ → ЗУРАГ. Давхарга бүрт ӨӨРИЙН WHERE: график дээр тоологдсон ЯГ ТЭР
   * мөрүүдийг зурагт үлдээнэ. Шүүлт идэвхгүй давхаргад `null` — тэр давхарга
   * бүтнээрээ харагдана (жиш. зөвхөн ослын төрлөөр шүүхэд кран хэвээр).
   */
  /** Үзлэгийн чартын сонголт — ТОГТВОРТОЙ лавлагаа (газрын зургийн шүүлт дагана) */
  const uzSel = useMemo(() => ({
    sev: sel.uzSev, shift: sel.uzShift, company: sel.uzCompany,
    week: sel.uzWeek, day: sel.day, month: sel.month,
  }), [sel.uzSev, sel.uzShift, sel.uzCompany, sel.uzWeek, sel.day, sel.month]);

  /**
   * Үзлэгийн СУУРЬ олонлог — багц/компани ба газрын зургаас дарсан үзлэг.
   */
  const uzF = useMemo(() => {
    const base = filterUzleg(uz, pkgs, cos);
    if (!pickUzOid || pickUzZ || base.state !== 'ready') return base;
    return { ...base, rows: base.rows.filter((x) => x.oid === pickUzOid) };
  }, [uz, pkgs, cos, pickUzOid, pickUzZ]);
  /* «БАГЦ» ШҮҮЛТГҮЙ олонлог — «Үл нийцэл — багцаар» чартад (өөрийн хэмжээсээр
     шүүгдэхгүй, ArcGIS зан). Компани ба цэгийн сонголтыг ДАГАНА. */
  const uzNoPkg = useMemo(() => {
    const base = filterUzleg(uz, [], cos);
    if (!pickUzOid || pickUzZ || base.state !== 'ready') return base;
    return { ...base, rows: base.rows.filter((x) => x.oid === pickUzOid) };
  }, [uz, cos, pickUzOid, pickUzZ]);
  const uzNoPkg2 = useMemo(() => {
    const base = filterUzleg(uz2, [], cos);
    if (!pickUzOid || !pickUzZ || base.state !== 'ready') return base;
    return { ...base, rows: base.rows.filter((x) => x.oid === pickUzOid) };
  }, [uz2, cos, pickUzOid, pickUzZ]);
  /** Захиалагчийн маягт — `uzF`-тэй ИЖИЛ дүрэм, өөрийн цэгийн сонголтоор */
  const uzF2 = useMemo(() => {
    const base = filterUzleg(uz2, pkgs, cos);
    if (!pickUzOid || !pickUzZ || base.state !== 'ready') return base;
    return { ...base, rows: base.rows.filter((x) => x.oid === pickUzOid) };
  }, [uz2, pkgs, cos, pickUzOid, pickUzZ]);

  /** Фокусын маягтын газрын зургийн давхарга — фокус байхгүй бол `null` */
  const uzLayerId = uzlegKind ? HABEA_UZLEG_LAYER_ID[uzlegKind] : null;
  const uzLayerId2 = dual ? HABEA_UZLEG_LAYER_ID.zahialagch : null;

  /**
   * ҮЗЛЭГ → ГАЗРЫН ЗУРАГ. Үзлэгийн самбарт тоологдсон ЯГ тэр мөрүүдийг зурагт
   * үлдээнэ (осол, краны `layerWhere`-тэй ижил загвар).
   */
  const uzWhere = useMemo(() => {
    if (!uzLayerId) return null;
    const on = pkgs.length || cos.length || (pickUzOid && !pickUzZ)
      || Object.values(uzSel).some((v) => v.length);
    if (!on || uzF.state !== 'ready') return null;
    const ids = uzF.rows.filter((x) => uzPass(x, uzSel)).map((x) => x.oid).filter((o) => o > 0);
    return ids.length ? `objectid IN (${ids.join(',')})` : '1=0';
  }, [uzLayerId, pkgs.length, cos.length, pickUzOid, pickUzZ, uzSel, uzF]);
  /** Захиалагчийн маягтын давхаргын шүүлт — `uzWhere`-тэй ижил дүрэм */
  const uzWhere2 = useMemo(() => {
    if (!uzLayerId2) return null;
    const on = pkgs.length || cos.length || (pickUzOid && pickUzZ)
      || Object.values(uzSel).some((v) => v.length);
    if (!on || uzF2.state !== 'ready') return null;
    const ids = uzF2.rows.filter((x) => uzPass(x, uzSel)).map((x) => x.oid).filter((o) => o > 0);
    return ids.length ? `objectid IN (${ids.join(',')})` : '1=0';
  }, [uzLayerId2, pkgs.length, cos.length, pickUzOid, pickUzZ, uzSel, uzF2]);

  /** Газрын зурагт харагдах давхаргууд — каталогийн сонголт + фокусын үзлэг */
  /**
   * ГАЗРЫН ЗУРАГ ФОКУСЫГ ДАГАНА (2026-09-17, хэрэглэгчийн хүсэлт: «эндээс
   * сонгоод дарахад тухайн мэдээлэл map дээрээ шүүгдэж харагдах»).
   *
   *   осол, зөрчил            → зөвхөн ослын цэг
   *   захиалагчийн үзлэг       → зөвхөн V1.1 + захиалагчийн маягтын цэг
   *   гүйцэтгэгчийн үзлэг      → зөвхөн тэр маягтын цэг
   *   техник, хүн цаг · анхны → каталогийн сонголт хэвээр (хүн хүчний бүртгэл
   *                              газрын зурагт БАЙРШИЛГҮЙ — нуух юм алга)
   */
  const mapVisible = useMemo(() => {
    const uzIds = [...(uzLayerId ? [uzLayerId] : []), ...(uzLayerId2 ? [uzLayerId2] : [])];
    if (focus === 'inc') return ['habea:osol'];
    if (uzlegKind) return uzIds;
    return visible;
  }, [visible, focus, uzlegKind, uzLayerId, uzLayerId2]);

  const layerWhere = useMemo(() => {
    if (!incOn && !craneOn && !uzWhere && !uzWhere2) return undefined;
    const ids = fInc.map((x) => x.oid);
    const osol = incOn ? (ids.length ? `objectid IN (${ids.join(',')})` : '1=0') : null;
    const oids = fCrane.map((x) => x.oid).filter((o) => o > 0);
    const kran = craneOn
      ? (oids.length ? `${C.oid} IN (${oids.join(',')})` : '1=0')
      : null;
    const links = fCrane.map((x) => x.link).filter((o) => o > 0);
    const buff = craneOn
      ? (links.length ? `${C.bufferLink} IN (${links.join(',')})` : '1=0')
      : null;
    const out: Record<string, string | null> = { 'habea:osol': osol, 'habea:crane': kran, 'habea:buffer': buff };
    if (uzLayerId) out[uzLayerId] = uzWhere;
    if (uzLayerId2) out[uzLayerId2] = uzWhere2;
    if (zone) {
      for (const [id, w] of Object.entries(out)) {
        const d = LAYER_BY_ID[id];
        const zw = w && d ? zoneWhere(d, zone) : null;
        if (w && zw) out[id] = `(${w}) AND (${zw})`;
      }
    }
    return out;
  }, [incOn, craneOn, fInc, fCrane, uzLayerId, uzWhere, uzLayerId2, uzWhere2, zone]);

  const bufferStyle = useMemo(() => {
    const d = LAYER_BY_ID['habea:buffer'];
    if (!d?.paint || !cranes.length) return undefined;
    const off = cranes.filter((c) => c.tuluv === 'Буусан' && c.link > 0).map((c) => c.link);
    return {
      'habea:buffer': {
        fill: d.fill, width: d.width,
        classes: {
          expression: `var off = [${off.join(',')}];\nIIf(IndexOf(off, $feature.${C.bufferLink}) > -1, 'off', 'on')`,
          hues: { on: d.paint.defaultHue ?? d.hue, off: d.paint.values['Буусан'] ?? '#9ca3af' },
        },
      },
    };
  }, [cranes]);

  /* Өдөр тутмын цувааnууд — сонгосон гүйцэтгэгчийг дагана */
  const byDay = useMemo(() => byDaySeries(laborRows, coEff, 'niitAjiltan'), [laborRows, coEff]);
  const techDay = useMemo(() => byDaySeries(laborRows, coEff, 'niitTehnik'), [laborRows, coEff]);
  /**
   * Цуваа нь ХУУЧНААС шинэ рүү өснө. Гүйлгэгчийг ТӨГСГӨЛД нь тавьж хамгийн
   * сүүлийн өдрүүдийг шууд харуулна — хэрэглэгч эхлээд «одоо юу болж байна»-г
   * харах ёстой, хагас жилийн өмнөх мөрийг биш.
   */
  const dayScroll = useRef<HTMLDivElement>(null);
  /* Баганын карт хоорондын хэвтээ бариул (`HabeaCardGrips`) */
  const listRef = useRef<HTMLDivElement>(null);
  const rRef = useRef<HTMLDivElement>(null);
  const techScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const el of [dayScroll.current, techScroll.current]) {
      if (el) el.scrollLeft = el.scrollWidth;
    }
  }, [byDay.length, techDay.length, ajiltanStep, tehnikStep, laborFocus, laborOpen]);

  /**
   * Шүүлт солигдоход зураг тэр объектууд руу нисэнэ (irgediin-hurteemj).
   */
  const zoomTo: [string, string] | null = uzLayerId && uzWhere
    ? [uzLayerId, uzWhere]
    : uzLayerId2 && uzWhere2
      ? [uzLayerId2, uzWhere2]
    : layerWhere?.['habea:osol'] && incOn
      ? ['habea:osol', layerWhere['habea:osol']]
      : layerWhere?.['habea:crane'] && craneOn
        ? ['habea:crane', layerWhere['habea:crane']]
        : null;
  useZoomToFilter({
    zone,
    layerId: zoomTo ? zoomTo[0] : null,
    where: zoomTo ? zoomTo[1] : null,
  });

  /* Осол, зөрчил */
  const incTypeBase = inc.filter((x) => incPass(x, 'incType'));
  const incByType = riskRed(categoryColors(topN(countBy(incTypeBase, (x) => x.type), 4)));
  const incByCause = countBy(inc.filter((x) => incPass(x, 'cause') && x.cause !== '—'), (x) => x.cause);
  /**
   * Шалтгааны төрлийн пай — ТЭРГҮҮЛЭГЧ шалтгаан улаан (`--bad`), бусад нь БҮГД
   * нэг саарал бэх (`--ink-3`).
   */
  const causeSlices = leadRed(incByCause);
  const causeTotal = incByCause.reduce((s, x) => s + x.value, 0);
  /* Хамгийн олон осол бүртгүүлсэн гүйцэтгэгч(ид) улаанаар — анхаарал татах
     ёстой тал нь эгнээг гүйлгэн уншихгүйгээр шууд харагдана. */
  const incByCompany = leadRed(countBy(inc.filter((x) => incPass(x, 'incCompany')), (x) => x.company));
  const INC_LIST_N = 6;
  const recentAll = [...fInc].sort((a, b) => b.d - a.d);
  const recent = allInc ? recentAll : recentAll.slice(0, INC_LIST_N);

  /**
   * ОСЛЫН ДАВТАМЖ — 1 сая хүн-цагт (2026-10-01, `habeaRate`).
   */
  const hourDays = useMemo(() => hoursByDay(laborDated), [laborDated]);
  const incCoSfx = useMemo<ReadonlySet<string> | null>(
    () => (sel.incCompany.length ? incCompanySfx(sel.incCompany) : null),
    [sel.incCompany],
  );
  const ratePkg = useMemo(() => {
    /* Шошго нь гүйцэтгэгчийн бүртгэлийн багцаас («Багц -3.1» → «Багц 3.1», `pkgOptions`-ийн дүрэм) */
    const labelOf = (k: string) => {
      const raw = HABEA.labor.companies.find((c) => c.bagts && habeaPkgKey(c.bagts) === k)?.bagts;
      return raw ? tr(habeaPkgLabel(raw.replace(/\s*-\s*/, ' ').trim())) : k;
    };
    return rateByPkg(hourDays, inc.filter((x) => incPass(x, 'pkg')), PKG_OF_CO, labelOf, incCoSfx);
  }, [hourDays, inc, incPass, incCoSfx]);
  const rateMonth = useMemo(
    () => rateByMonth(hourDays, fInc, {
      ymOf: (ms) => ubDayKey(ms).slice(0, 7), pkgOfCo: PKG_OF_CO, pkgs: pkgEff, cos: incCoSfx,
    }),
    [hourDays, fInc, pkgEff, incCoSfx],
  );

  /* Кран */
  const craneStatusBase = cranes.filter((x) => cranePass(x, 'craneState'));
  const craneByStatus = countBy(craneStatusBase, (x) => x.tuluv)
    .map((x) => ({ ...x, color: CRANE_HUE[x.label] ?? 'var(--ink-3)', display: num(x.value) }));
  /**
   * ИДЭВХТЭЙ кран — `Tuluv` нь «Буусан» БИШ бүх кран.
   */
  const craneUp = fCrane.filter((x) => x.tuluv !== 'Буусан' && x.tuluv !== '—').length;
  /**
   * ГҮЙЦЭТГЭГЧИЙН ШҮҮЛТҮҮРИЙН сонголтууд — бүх хугацаанд ямар нэг тоо
   * бүртгүүлсэн гүйцэтгэгчид, ажилтны нийлбэрээр эрэмбэлсэн.
   */
  const coBase = useMemo(() => companyTotals(laborRows), [laborRows]);
  const coAll = useMemo(() => companyTotals(laborDated), [laborDated]);
  const coOptions = coBase
    .filter((x) => x.ajiltan > 0 || x.tehnik > 0)
    .sort((a, b) => b.ajiltan - a.ajiltan);
  /**
   * КОМПАНИАР ХҮНИЙ ТОО — «Техник болон хүн цаг» фокусын БАРУУН чарт.
   */
  /**
   * КОМПАНИ БҮРИЙН МОНГОЛ/ГАДААД задаргаа — зүүн баганын доод чарт.
   */
  const mixByCo = coAll
    .map((x) => ({ ...x, mix: x.mongol + x.gadaad }))
    .filter((x) => x.mix > 0)
    .map((x) => ({ ...x, share: (x.gadaad / x.mix) * 100 }))
    .sort((a, b) => b.share - a.share);

  const coBars = coAll
    .filter((x) => x.ajiltan > 0)
    .sort((a, b) => b.ajiltan - a.ajiltan)
    .map((x) => ({ key: x.key, label: x.label, value: x.ajiltan, display: num(x.ajiltan) }));

  /**
   * КОМПАНИАР ТЕХНИК — «Компаниар — хүн-өдөр»-ийн доорх хос чарт.
   */
  const coTechBars = coAll
    .filter((x) => x.tehnik > 0)
    .sort((a, b) => b.tehnik - a.tehnik)
    .map((x) => ({ key: x.key, label: x.label, value: x.tehnik, display: num(x.tehnik) }));

  /* Техникийн нийт — «Техник — өдрөөр»-ийн тайлбарт (шүүлт дагасан цуваанаас) */
  const totalTech = techDay.reduce((s, x) => s + x.value, 0);

  /* Сарын нийлбэр — өдрийн цуваанаас (шүүлтийг аль хэдийн дагасан) */
  const byMonth = useMemo(() => byMonthSeries(byDay, curYm), [byDay, curYm]);
  /* Монгол · Гадаад — задаргаа орж ирсэн үеэс хойш хоёр муруй (байхгүй бол null → нэг муруй) */
  const mixDay = useMemo(() => mixByDay(laborRows, coEff), [laborRows, coEff]);
  const dayMix = useMemo(() => mixLines(byDay, mixDay), [byDay, mixDay]);
  const monthMix = useMemo(() => mixLines(byMonth, mixByMonth(mixDay, byDay)), [byMonth, mixDay, byDay]);
  const ajLines = ajiltanStep === 'day' ? dayMix : monthMix;
  const ajItems = ajiltanStep === 'day' ? byDay : byMonth;
  const techMonth = useMemo(() => byMonthSeries(techDay, curYm), [techDay, curYm]);
  /** Сарын цуваанд явагдаж буй сар орсон уу — тайлбарт «* дутуу» */
  const monthNote = (items: { key: string }[]) =>
    (items.some((x) => x.key === curYm) ? ` · ${tr('{0} явагдаж буй сар (дутуу)', CUR_MONTH_MARK)}` : '');

  /**
   * БАГЦЫН СОНГОЛТУУД — гурван эх сурвалжийн НЭГДЭЛ, давхардалгүй.
   */
  const pkgOptions = useMemo(() => {
    const m = new Map<string, string>();
    /* ЭХЛЭЭД бодит өгөгдөл — шошго нь эх сурвалжийн ЯГ бичиглэлээр гарна */
    for (const x of [...inc, ...cranes, ...labor.rows]) {
      if (x.bagtsK && !m.has(x.bagtsK)) m.set(x.bagtsK, tr(habeaPkgLabel(x.bagtsRaw)) || x.bagtsK);
    }
    /**
     * ДАРАА нь ГҮЙЦЭТГЭГЧИЙН БҮРТГЭЛ — өгөгдөлд гараагүй багцыг нөхнө.
     */
    for (const co of HABEA.labor.companies) {
      if (!co.bagts) continue;
      const k = habeaPkgKey(co.bagts);
      if (k && !m.has(k)) m.set(k, tr(habeaPkgLabel(co.bagts.replace(/\s*-\s*/, ' ').trim())));
    }
    return [...m.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => cmpPkg(a.label, b.label));
  }, [inc, cranes, labor.rows]);

  /* Шүүлтийн чипийн нэр — аль ч эх сурвалжийн түүхий бичиглэлээс */
  const pkgLabels = pkgs.map((k) => pkgOptions.find((o) => o.key === k)?.label ?? k);
  /** Сонгосон гүйцэтгэгчийн бүтэн нэр — чипэнд богино кодын оронд гарна */
  const coName = (k: string) => HABEA.labor.companies.find((c) => c.sfx === k)?.label ?? k;
  const coLabel = coEff
    ? (coEff.length === 1 ? coName(coEff[0]) : tr('{0} компани', num(coEff.length)))
    : null;

  /**
   * ШҮҮЛТҮҮРИЙН МӨРИЙН ТАЙЛБАР — хамгийн чухлыг нь ганцыг.
   */
  const coNote = (pkgEff && pkgEff.size === 0) || (coEff && coEff.length === 0)
    ? tr('Сонгосон багц ба компани таарахгүй — үр дүн хоосон')
    : cos.length && cos.every((k) => !PKG_OF_CO.has(k))
      ? tr('багц заагаагүй — осол, кран шүүгдэхгүй')
      : cos.length
        ? tr('{0} хүн-өдөр', num(coAll.filter((x) => cos.includes(x.key)).reduce((s2, x) => s2 + x.ajiltan, 0)))
        : null;

  /**
   * Идэвхтэй шүүлт бүрийн чип. Гүйцэтгэгч сонгосон үед `pkg` нь автоматаар
   * тавигддаг тул ХОЁР чип гарган хэрэглэгчийг эргэлзүүлэхгүй — гүйцэтгэгчийн
   * ганц чипээр төлөөлүүлж, түүнийг арилгахад хоёулаа цуцлагдана.
   */
  const chips: { dim: Dim2 | null; label: string; value: string; clear: () => void }[] = [];
  if (pkgs.length) {
    chips.push({
      dim: 'pkg', label: DIM_LABEL.pkg, value: pkgLabels.join(', '),
      clear: () => setPkgs([]),
    });
  }
  if (cos.length) {
    chips.push({
      dim: 'co', label: DIM_LABEL.co, value: cos.map(coName).join(', '),
      clear: () => setCos([]),
    });
  }
  (['incType', 'cause', 'incCompany', 'craneState'] as const).forEach((d) => {
    const v = sel[d];
    if (v.length) chips.push({ dim: d, label: DIM_LABEL[d], value: v.join(', '), clear: () => setSel((s) => ({ ...s, [d]: [] })) });
  });
  /* Үзлэгийн чартын сонголтууд — зэргийн түлхүүрийг нэрээр нь харуулна */
  (Object.entries(UZ_DIM) as [UzDim, SelDim][]).forEach(([ud, d]) => {
    const v = sel[d];
    if (v.length) {
      chips.push({
        dim: d, label: DIM_LABEL[d], value: v.map((x) => uzValueLabel(ud, x)).join(', '),
        clear: () => setSel((s) => ({ ...s, [d]: [] })),
      });
    }
  });
  if (picked) {
    chips.push({
      dim: null,
      label: picked.id === 'habea:osol'
        ? tr('Сонгосон осол')
        : pickUzOid ? tr('Сонгосон үзлэг') : tr('Сонгосон кран'),
      value: picked.id === 'habea:osol'
        ? text(picked.attrs[I.turul], `#${pickOsol}`)
        : pickUzOid
          ? (pickUzRow ? `${incDate(pickUzRow.d)} · ${pickUzRow.site}` : `#${pickUzOid}`)
        : text(picked.attrs[C.dugaar], '') || `#${pickCraneOid}`,
      clear: () => setPicked(null),
    });
  }

  /**
   * БАГЦ · КОМПАНИ — ОЛОН СОНГОЛТТОЙ ХОЁР КАПСУЛ.
   */
  const filterPills = (<>
    <DateRangePill
      label={tr('Огноо')}
      from={pill.from}
      to={pill.to}
      min={dataMin || undefined}
      max={ubDayKey(now)}
      onChange={onPill}
    />
    {pkgOptions.length > 0 && (
      <MultiSelect
        label={tr("Багц")}
        ariaLabel={tr("Багцаар шүүх")}
        allLabel={tr("Бүх багц")}
        countLabel={(n) => tr('{0} багц', num(n))}
        options={pkgOptions}
        value={pkgs}
        onChange={(v) => { setPkgs(v); setPicked(null); }}
      />
    )}
    {coOptions.length > 0 && (
      <MultiSelect
        label={tr("Компани")}
        ariaLabel={tr("Компаниар шүүх")}
        allLabel={tr("Бүх компани")}
        countLabel={(n) => tr('{0} компани', num(n))}
        options={coOptions.map((x) => ({ key: x.key, label: x.label }))}
        value={cos}
        onChange={(v) => { setCos(v); setPicked(null); }}
      />
    )}
  </>);

  const onUzPick = (d: UzDim, k: string) => toggleDim(UZ_DIM[d], k);

  if (q.state === 'loading') {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <Loading label={tr('ХАБЭА ачаалж байна…')} />
      </div>
    );
  }
  if (q.state === 'error') {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }} data-boot-fail="" role="alert">
          <Empty label={tr('ХАБЭА ачаалахад алдаа гарлаа')} hint={friendlyError(q.error)} />
          {q.retry && (
            <button type="button" className={h.retry} onClick={q.retry}>{tr('Дахин оролдох')}</button>
          )}
        </div>
      </div>
    );
  }

  const surveyEmpty = <Empty label={tr('Судалгаа бөглөгдөөгүй')} />;
  const emptyHint = chips.length
    ? tr('Сонгосон шүүлтэд тохирох бүртгэл алга — дээрх шүүлтийн чипийг (×) арилгаж бүгдийг харна.')
    : tr('Шинэ бүртгэл орж ирэхэд энд автоматаар гарна.');
  const noRecords = <Empty label={tr('Бүртгэл алга')} hint={emptyHint} />;

  return (
    <div
      className={h.shell}
      data-list={listOpen ? '1' : '0'}
      data-r={rOpen ? '1' : '0'}

      style={panes.styleFor("l", "r", "fin")}
    >
      {/* ── KPI зурвас — бүтэн өргөн, зургаан үзүүлэлт ── */}
      <div className={h.kpi}>
        {q.data.failed.length > 0 && (
          <div className={h.photoNote} role="alert" style={{ gridColumn: '1 / -1' }}>
            {tr('Татагдаагүй эх: {0}', q.data.failed.join(' · '))}{' '}
            {q.retry && <button type="button" className={h.retry} onClick={q.retry}>{tr('Дахин оролдох')}</button>}
          </div>
        )}
        {/* ── Эхний ГУРВАН үзүүлэлт нь ТӨСЛИЙН ЭХНЭЭС хуримтлагдсан нийлбэр
            (маягтын толгойн `Niit_ajiltan` · `Hun_tsag` · `Niit_tehnik`) — бүх
            бүртгэлээр нийлүүлсэн.
            Толгойн талбар компаниар задардаггүй тул шүүлт идэвхтэй үед «—». */}
        {kpiTile(KPI_LOOK.people,
          laborFailed || pkgs.length || cos.length || sel.day.length || sel.month.length ? '—' : num(labor.cum.ajiltan),
          tr('Нийт ажилласан хүн хүч'),
        )}
        {kpiTile(KPI_LOOK.hours,
          laborFailed || incFailed || pkgs.length || cos.length || sel.day.length || sel.month.length || ltiFree.hours == null ? '—' : num(ltiFree.hours),
          tr('Хөдөлмөрийн чадвар түр алдсан осолгүй ажилласан цаг'),
          undefined,
          [
            ltiFree.undatedLti
              ? tr('Огноогүй ХЧТА осол бүртгэгдсэн — тооцох боломжгүй')
              : '',
            ltiFree.futureLti > 0 ? tr('{0} ХЧТА осол ирээдүйн огноотой — тооцоонд ороогүй', num(ltiFree.futureLti)) : '',
          ].filter(Boolean).join(' · ') || undefined,
          undefined,
          ltiFree.undatedLti,
        )}
        {kpiTile(KPI_LOOK.tech, laborFailed || pkgs.length || cos.length || sel.day.length || sel.month.length ? '—' : num(labor.cum.tehnik), tr('Нийт ажилласан техникийн тоо'))}
        {kpiTile(KPI_LOOK.crane,
          craneFailed ? '—' : craneUp === fCrane.length ? num(fCrane.length) : `${num(craneUp)}/${num(fCrane.length)}`,
          tr('Кран'),
          craneFailed || craneUp === fCrane.length ? undefined : tr('идэвхтэй'),
          undefined,
          craneFailed || craneUp === fCrane.length || !fCrane.length ? null : craneUp / fCrane.length,
        )}
        {kpiTile(KPI_LOOK.inc, incFailed ? '—' : num(fInc.length), tr('Осол, зөрчил'))}
        {/**
          * ӨМНӨХ БҮТЭН ДОЛОО ХОНОГИЙН ДУНДАЖ ОНОО (2026-09-17, хэрэглэгчийн хүсэлт).
          * Дүрэм, тооцоо: `habeaUzleg.prevWeek` ба `loadWeekScore`.
          */}
        {kpiTile(((v) => (v == null ? KPI_LOOK.score : { ...KPI_LOOK.score, tone: scoreColor(v) }))(
            weekScores.state === 'ready' ? weekScoreOf(weekScores.data.rows, pkgs, cos).pct : null),
          weekScores.state === 'loading'
            ? '…'
            : weekScores.state !== 'ready'
              ? '—'
              : ((v) => (v == null ? '—' : pct(v, 0)))(weekScoreOf(weekScores.data.rows, pkgs, cos).pct),
          tr('Захиалагчийн ажлын байрны үзлэг'),
          undefined,
          weekScores.state === 'ready'
            ? tr('{0}-р долоо хоногийн дундаж оноо', num(weekScores.data.no))
            : weekScores.state === 'error'
              ? `${tr('Долоо хоногийн дундаж оноо')} — ${tr('татагдсангүй')}`
              : tr('Долоо хоногийн дундаж оноо'),
          weekScores.state === 'ready'
            ? ((v) => (v == null ? null : v / 100))(weekScoreOf(weekScores.data.rows, pkgs, cos).pct)
            : null,
        )}

      </div>



      {/* ── ЗҮҮН багана: осол зөрчлийн аналитик ── */}
      {/* ── ЗҮҮН багана ── ХООСОН. */}
      <div className={h.list} ref={listRef}>
        <HabeaCardGrips target={listRef} id={`l-${focus ?? 'all'}`} />
        {/* ── ЗҮҮН БАГАНЫН ХҮН ХҮЧНИЙ ХОС — бүрэлдэхүүн ба түүний задаргаа ──

            АНХНЫ харагдац ба «Техник болон хүн цаг» фокус ХОЁУЛАНД гарна
            (2026-09-06, хэрэглэгчийн хүсэлт). Хоёр горимд ижил байх нь
            санаатай: шүүлтүүр дарахад зүүн тал ӨӨРЧЛӨГДӨХГҮЙ, зөвхөн
            баруун ба доод хэсэг л солигдоно. */}
        {(focus === null || laborFocus) && (<>
        {focus === null && (
        <Section
          title={tr('Бусад үзүүлэлт')}
          note={(
            <>
              {regs.state === 'ready' && tr('{0}-р долоо хоног', num(regs.data.weekNo))}
              {canEnter && <> <AddButton onClick={() => setEntry('reg')} /></>}
            </>
          )}
        >
          {regs.state === 'loading' && <Loading />}
          {regs.state === 'error' && <Empty label={tr('Татагдсангүй: {0}', friendlyError(regs.error))} onRetry={regs.retry} />}
          {regs.state === 'ready' && (() => {
            const max = Math.max(1, ...regs.data.rows.map((r) => r.week ?? 0));
            return (
              <div className={h.regs}>
                <div className={h.regHead}><span /><span>{tr('{0} хоног', num(7))}</span></div>
                <Bars
                  max={max}
                  items={regs.data.rows.map((r) => ({
                    key: r.key,
                    label: r.label,
                    value: r.week,
                    display: r.week == null ? '—' : num(r.week),
                    hint: r.week == null ? (r.hint ?? tr('Эх сурвалж холбогдоогүй')) : r.hint,
                  }))}
                />
              </div>
            );
          })()}
        </Section>
        )}
        {/* ── ХОГ ХАЯГДАЛ (2026-10-08) — «Бусад үзүүлэлт»-ийн ДООР, эхний харагдацад. */}
        {focus === null && (
        <Section
          title={tr('Хог хаягдал')}
          note={(
            <>
              {waste.state === 'ready' && (waste.data.multiYear
                ? (
                  <span title={tr('Хүснэгтэд он, огноо талбар байхгүй — өмнөх оны ижил дугаартай долоо хоногийн мөр нийлбэрт холилдож болзошгүй.')}>
                    {tr('{0}-р долоо хоног (он ялгагдаагүй)', num(waste.data.weekNo))}
                  </span>
                )
                : tr('{0}-р долоо хоног', num(waste.data.weekNo)))}
              {canEnter && (wasteCan.state !== 'ready' || wasteCan.data.create !== false
                ? <> <AddButton onClick={() => setEntry('waste')} /></>
                : isSuperUser || wasteCan.data.admin
                  ? <> <AddButton onClick={() => setEntry('waste')} note={tr('Үйлчилгээнд бичлэг нэмэх эрх хаалттай — зөвхөн үйлчилгээний эзэмшигч/админы эрхээр бичигдэнэ.')} /></>
                  : <> <AddButton disabled note={tr('Нэмэх боломжгүй: «Хог хаягдал» үйлчилгээнд засварлах эрх хаалттай — админд мэдэгдэнэ үү.')} /></>)}
            </>
          )}
        >
          {waste.state === 'loading' && <Loading />}
          {waste.state === 'error' && <Empty label={tr('Татагдсангүй: {0}', friendlyError(waste.error))} onRetry={waste.retry} />}
          {waste.state === 'ready' && (wasteTotal > 0
            ? <Donut items={wasteSlices} stack size="md" center={num(wasteTotal)} centerLabel={tr('нийт')} />
            : wasteMeasured
              ? <Empty label={tr('Бүртгэгдсэн {0} — {1}-р долоо хоног', num(0), num(waste.data.weekNo))} />
              : <Empty label={tr('Бүртгэл алга')} hint={canEnter ? tr('«+ Нэмэх» товчоор энэ долоо хоногийн хог хаягдлыг бүртгэнэ.') : undefined} />)}
        </Section>
        )}
        {entry === 'reg' && <RegisterAddDialog onClose={() => setEntry(null)} />}
        {entry === 'waste' && <WasteAddDialog onClose={() => setEntry(null)} />}
        <Section
          title={tr("Компаниар — монгол, гадаад")}
          note={mixByCo.length ? tr("гадаадын хувиар · дарж шүүнэ") : undefined}
          fill
        >
          {mixByCo.length
            ? (
              <div className={h.mixList}>
                <div className={h.mixLegend} aria-hidden>
                  <span><i style={{ background: 'var(--c1)' }} />{tr('Монгол')}</span>
                  <span><i style={{ background: 'var(--c2)' }} />{tr('Гадаад')}</span>
                </div>
                {mixByCo.map((x) => (
                  <div
                    key={x.key}
                    role="button"
                    tabIndex={0}
                    aria-pressed={cos.includes(x.key)}
                    className={`${h.mixRow} ${h.mixRowClick} ${cos.length && !cos.includes(x.key) ? h.mixRowDim : ''}`}
                    onClick={() => toggleCo(x.key)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCo(x.key); } }}
                  >
                    <span className={h.mixName} title={x.label}>{x.label}</span>
                    <span className={h.mixBar}>
                      <Stack
                        legend={false}
                        items={[
                          { key: `${x.key}-mn`, label: tr("Монгол"), value: x.mongol, color: 'var(--c1)' },
                          { key: `${x.key}-fr`, label: tr("Гадаад"), value: x.gadaad, color: 'var(--c2)' },
                        ]}
                      />
                    </span>
                    <b className={`${h.mixPct} num`}>{tr("{0}%", num(x.share, 0))}</b>
                  </div>
                ))}
              </div>
            )
            : <Empty label={tr("Задаргаа бүртгэгдээгүй")} />}
        </Section>
        </>)}

        {/* ── ЦАМХАГТ КРАН — ТӨЛӨВ — анхны харагдацад ЗҮҮН баганад, «Компаниар —
            монгол, гадаад»-ын ДООР (2026-09-17, хэрэглэгчийн хүсэлт). Урьд нь
            баруун баганад байв. ── */}
        {focus === null && (
        <Section title={tr('Цамхагт кран — төлөв')}>
          {craneByStatus.length
            ? <Donut items={craneByStatus} stack size="md" center={num(craneStatusBase.length)} centerLabel={tr('кран')}
                selected={sel.craneState} onSelect={(k) => toggleDim('craneState', k)} />
            : noRecords}
        </Section>
        )}

        {dual && <UzSrcHead title={HABEA.uzleg.v11.title} hue={LAYER_BY_ID[HABEA_UZLEG_LAYER_ID.v11].hue} />}
        {uzlegKind && (
          <UzlegLeft
            st={uzF} url={HABEA.uzleg[uzlegKind].url} sel={uzSel} onPick={onUzPick}
            pkgSt={uzNoPkg} pkgSel={pkgs} onPkg={togglePkg}
            photos={!dual}
          />
        )}
        {zFocus && <UzlegRight st={uzF} sel={uzSel} onPick={onUzPick} />}
        {dual && <UzlegRight st={uzF} sel={uzSel} onPick={onUzPick} />}
        {dual && <UzlegPhotos st={uzF} url={HABEA.uzleg.v11.url} sel={uzSel} />}
        {incOpen && (<>
        <Section
          title={tr('Осол, зөрчил — төрлөөр')}
          note={sel.incType.length
            ? tr('{0} / {1} бүртгэл', num(fInc.length), num(incTypeBase.length))
            : tr('{0} бүртгэл', num(fInc.length))}
          tone="primary"
        >
          {incByType.length
            ? <Donut items={incByType} stack size="md" center={num(incTypeBase.length)} centerLabel={tr('нийт')}
                selected={sel.incType} onSelect={(k) => k !== '__other' && toggleDim('incType', k)} />
            : noRecords}
        </Section>
        <Section title={tr('Шалтгааны төрөл')} note={tr('{0} бүртгэл', num(causeTotal))}>
          {causeSlices.length
            ? <Donut items={causeSlices} stack size="md" center={num(causeTotal)} centerLabel={tr('нийт')}
                selected={sel.cause} onSelect={(k) => toggleDim('cause', k)} />
            : <Empty label={tr('Шалтгаан тэмдэглэгдээгүй')} />}
        </Section>
        {/* ── ОСЛЫН ДАВТАМЖ — 1 сая хүн-цагт (2026-10-01, хэрэглэгч: бүгдийг зас) ── */}
        <Section
          title={tr('Ослын давтамж — 1 сая хүн-цагт')}
          note={(
            <span className={h.stepWrap}>
              <Segmented value={rateStep} onChange={setRateStep} label={tr('Давтамжийн задаргаа')}
                options={[{ value: 'pkg', label: tr('Багц') }, { value: 'month', label: tr('Сар') }]} />
              <span className={h.stepNote}>
                {rateStep === 'pkg'
                  ? tr('хүн-цаг нь ажилтны тоогоор хуваарилсан тооцоо')
                  : `${tr('осол / 1 сая хүн-цаг')}${monthNote(rateMonth.items)}`}
              </span>
            </span>
          )}
        >
          {(() => {
            const r = rateStep === 'pkg' ? ratePkg : rateMonth;
            if (!r.items.length) return <Empty label={tr('Хүн-цагийн бүртгэл алга')} />;
            const items = r.items.map((x) => ({
              key: x.key, label: x.label, value: x.rate ?? 0,
              display: x.rate == null ? '—' : num(x.rate, 1),
            }));
            const rateLines: SeriesLineDef[] = [{
              key: 'rate', label: tr('осол / 1 сая хүн-цаг'), color: 'var(--data)',
              values: rateMonth.items.map((x) => x.rate),
            }];
            return (
              <>
                {rateStep === 'pkg'
                  ? <Bars items={items} selected={pkgs} onSelect={togglePkg} />
                  : <Series items={markCurMonth(items, curYm)} height={96} line lines={rateLines} />}
                {r.unmatched > 0 && (
                  <p className={h.photoNote}>
                    {tr('{0} осол хүн-цагийн бүртгэлгүй багц/сард — давтамжид ороогүй', num(r.unmatched))}
                  </p>
                )}
              </>
            );
          })()}
        </Section>
        </>)}
      </div>

      {/* ── ТӨВ: газрын зураг — «Ерөнхий мэдээлэл»-ийн бүтэц ЯГ ХЭВЭЭРЭЭ ── */}
      <div className={h.map}>
        <MapCanvas
          dim={dim}
          visible={mapVisible}
          opacity={opacity}
          layerWhere={layerWhere}
          layerStyle={bufferStyle}
          zone={zone}
          onPick={onPick}
        />

        <MapTools
          dim={dim}
          setDim={setDim}
          layersOpen={catOpen}
          onLayers={() => setCatOpen((v) => !v)}
          opacityOpen={opOpen}
          onOpacity={() => setOpOpen((v) => !v)}
          zone={zone}
          setZone={setZone}
        />

        {catOpen && (
          <div className={o.catPanel}>
            <LayerCatalog
              view="habea"
              totals={totals}
              visible={visible}
              setVisible={setVisible}
              selected={layerSel}
              onSelect={setLayerSel}
              onClose={() => setCatOpen(false)}
              zone={null}
              embedded
            />
          </div>
        )}

        {opOpen && (
          <OpacityPanel
            visible={mapVisible}
            opacity={opacity}
            setOpacity={setOpacity}
            onClose={() => setOpOpen(false)}
          />
        )}

        {/* ── Идэвхтэй шүүлтийн чипүүд — зүүн дээд, давхарга бүрд НЭГ чип ──
            Дашбоардын хөндлөн шүүлт нь хэд хэдэн хэмжээсээр ЗЭРЭГ ажиллаж
            болдог тул аль нь идэвхтэйг ил жагсааж, тус бүрийг нь тусад нь
            арилгах боломжтой байх ёстой — эс бөгөөс хэрэглэгч яагаад хоосон
            байгааг олж чадахгүй. */}
        {chips.length > 0 && !catOpen && (
          <div className={o.chipBar}>
            {chips.map((c) => (
              <div key={c.dim ?? 'pick'} className={o.filterChip}>
                <span className={o.filterLabel}>{c.label}: {c.value}</span>
                <button
                  type="button"
                  className={o.filterClear}
                  onClick={c.clear}
                  aria-label={tr('{0} шүүлтийг арилгах', c.label)}
                >
                  ×
                </button>
              </div>
            ))}
            {chips.length > 1 && (
              <button type="button" className={h.clearAll} onClick={clearAll}>
                {tr('Бүгдийг арилгах')}
              </button>
            )}
          </div>
        )}

        {/* Зурган дээрээс сонгосон кран/ослын дэлгэрэнгүй карт */}
        {picked && (
          <div className={h.pick}>
            <header className={h.pickHead}>
              <b>{LAYER_BY_ID[picked.id]?.title ?? tr('Объект')}</b>
              <button type="button" onClick={() => setPicked(null)} aria-label={tr('Хаах')}>×</button>
            </header>
            <dl className={h.pickRows}>
              {(pickUzOid
                ? (pickUzRow ? uzPickRows(pickUzRow) : [])
                : pickRows(picked.id, picked.attrs, all?.incDom ?? {})).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            {picked.id === 'habea:osol' && <IncPhotos oid={nn(picked.attrs['objectid'])} />}
          </div>
        )}

        {/* ── ГАЗРЫН ЗУРГИЙН ШҮҮЛТҮҮР (2026-09-15, хэрэглэгчийн хүсэлт) ──
            Баруун ДЭЭД буланд: зүүн доод нь тайлбар, баруун доод нь сонгосон
            объектын карт, дээд төв нь 2D/3D, зүүн тал нь хэрэгслийн багана. */}
        {(pkgOptions.length > 0 || coOptions.length > 0) && (
          <div className={h.mapFilter} role="group" aria-label={tr('Газрын зургийн шүүлтүүр')}>
            {filterPills}
            {coNote && <span className={h.coNote}>{coNote}</span>}
          </div>
        )}

        <div className={o.legend}>
          {mapVisible.slice(0, 8).map((id) => {
            const Ld = LAYER_BY_ID[id];
            return Ld ? (
              <span key={id} className={o.legendItem} title={Ld.title}>
                <i style={{ background: Ld.hue }} />{Ld.title}
              </span>
            ) : null;
          })}
          {mapVisible.length > 8 && <span className={o.legendMore}>+{mapVisible.length - 8}</span>}
        </div>
      </div>

      {/* ── БАРУУН багана — АГУУЛГА нь ФОКУСААС хамаарна ──
          анхны  → кран (төлөв · монгол-гадаад · багцаар)
          осол   → ослын дэлгэрэнгүй жагсаалт
          үзлэг  → гүйцэтгэгчээр · талбайгаар
          хүн хүч → БАГАНА БАЙХГҮЙ (цуваа нь өргөн хэрэгтэй) */}
      {rOpen && (
      <div className={h.r} ref={rRef}>
        <HabeaCardGrips target={rRef} id={`r-${focus ?? 'all'}`} />
        {/* ── ГҮЙЦЭТГЭГЧИЙН ШҮҮЛТҮҮР — KPI-ийн ЯГ доор, зурагтай ижил өргөн ──
            Дашбоардын хөндлөн шүүлтийн НЭГ удирдлага: сонгоход ажилтан, техник,
            монгол/гадаад нь тухайн компанийн баганаас ЯГ, харин осол зөрчил,
            кран, газрын зургийн гурван давхарга нь түүний БАГЦААР шүүгдэнэ
            (ослын бүртгэлийн компанийн нэр чөлөөт текст, 31 тэмдэгтээр
            таслагдсан тул нэрээр тааруулах боломжгүй — багц бол цорын ганц
            найдвартай түлхүүр).

            Тоо нь БҮХ ХУГАЦААНЫ ажилтны нийлбэр (хүн-өдөр) — жагсаалт өдөр бүр
            өөрчлөгдөхгүй байх ёстой. */}
        <div className={h.filters}>
          <div className={h.fltGroup}>
          <span className={h.fltHead}>{tr('Мэдээлэл')}</span>
          <div className={h.focusGrid}>
          {/* ── ОСЛЫН ЧАРТЫН ШҮҮЛТҮҮР — «Төслийн дэлгэрэнгүй мэдээлэл»-ийн
              капсул чиптэй ЯГ ИЖИЛ загвар (`dashboardOv.module.css .railItem`):
              зүүн талд төлөвийн бөгж, дунд нь нэр, баруун талд утга; идэвхтэй
              үед дүүрэн будагдана. ── */}
          {FOCUS_CHIPS.map((f) => {
            const on = focus === f.key;
            return (
              <button
                key={f.key ?? 'all'}
                type="button"
                aria-pressed={on}
                className={`${h.incChip} ${on ? h.incChipOn : ''}`}
                /* Дахин дарвал анхны харагдац руу буцна */
                onClick={() => { setFocus(on ? null : f.key); setSel((s) => ({ ...s, ...NO_UZ_SEL })); setPicked(null); }}
              >
                <span className={h.incChipLabel}>{f.label()}</span>
                {f.count(fInc.length) != null && (
                  <b className={`${h.incChipVal} num`}>{num(f.count(fInc.length) as number)}</b>
                )}
              </button>
            );
          })}
          </div>
          {/* ҮЗЛЭГИЙН ТАЙЛАН ТАТАХ (2026-10-06) — асуумж · хугацаа · компани сонгоод PDF / Excel. */}
          {canEnter && <UzlegExportButton kind={uzlegKind} />}
          </div>

        </div>
        {/* ── ОСЛЫН ФОКУС: дэлгэрэнгүй жагсаалт ЭНД (зүүнээс зөөгдсөн) ── */}
        {incOpen && (
        <Section
          title={tr('Ослын дэлгэрэнгүй мэдээлэл')}
          note={recentAll.length > INC_LIST_N
            ? (
              <>
                {tr('{0}/{1}', num(recent.length), num(recentAll.length))}{' · '}
                <button type="button" className={h.linkBtn} onClick={() => setAllInc((v) => !v)}>
                  {allInc ? tr('цөөнийг харах') : tr('бүгдийг харах')}
                </button>
              </>
            )
            : tr('дарж дэлгэрэнгүй')}
        >
          {recent.length ? recent.map((x) => {
            const id = String(x.oid);
            const on = expanded === id;
            return (
              <div key={id} className={h.incident}>
                <button
                  type="button"
                  className={h.incHead}
                  aria-expanded={on}
                  onClick={() => setExpanded(on ? null : id)}
                >
                  <i className={h.incDot} style={{ background: severityHue(x.type) }} />
                  <span className={h.incType}>{tr(x.type)}</span>
                  <span className={h.incDate}>{incDate(x.d)}</span>
                </button>
                <div className={h.incSub}>{tr(x.bagtsRaw)} · {tr(x.company)}</div>
                {on && (
                  <div className={h.incBody}>
                    {x.info !== '—' && <p>{x.info}</p>}
                    {x.reason !== '—' && <p><b>{tr('Шалтгаан:')}</b> {x.reason}</p>}
                    {x.action !== '—' && <p><b>{tr('Арга хэмжээ:')}</b> {x.action}</p>}
                    <IncPhotos oid={x.oid} />
                  </div>
                )}
              </div>
            );
          }) : noRecords}
        </Section>
        )}

        {uzlegKind && !dual && !zFocus && <UzlegRight st={uzF} sel={uzSel} onPick={onUzPick} />}
        {zFocus && <HseActionPanel pkgs={pkgs} onPkg={togglePkg} now={now} tick={tick} />}
        {dual && (<>
          <UzSrcHead title={HABEA.uzleg.zahialagch.title} hue={LAYER_BY_ID[HABEA_UZLEG_LAYER_ID.zahialagch].hue} />
          <UzlegLeft
            st={uzF2} url={HABEA.uzleg.zahialagch.url} sel={uzSel} onPick={onUzPick}
            pkgSt={uzNoPkg2} pkgSel={pkgs} onPkg={togglePkg} photos={false}
          />
          <UzlegRight st={uzF2} sel={uzSel} onPick={onUzPick} />
          <UzlegPhotos st={uzF2} url={HABEA.uzleg.zahialagch.url} sel={uzSel} />
        </>)}

        {/* ── ХҮН ХҮЧНИЙ ФОКУС — БАРУУНД КОМПАНИАР хүний тоо ── */}
        {laborFocus && (<>
        <Section
          title={tr("Компаниар — хүн-өдөр")}
          note={coBars.length ? tr("дарж шүүнэ") : undefined}
          fill
        >
          {coBars.length
            ? (
              <Bars
                items={coBars}
                selected={coEff}
                onSelect={toggleCo}
              />
            )
            : surveyEmpty}
        </Section>
        <Section
          title={tr("Компаниар — техник")}
          note={coTechBars.length ? tr("нэгж-өдөр · дарж шүүнэ") : undefined}
          fill
        >
          {coTechBars.length
            ? (
              <Bars
                items={coTechBars}
                selected={coEff}
                onSelect={toggleCo}
              />
            )
            : surveyEmpty}
        </Section>
        </>)}

        {focus === null && (<>
        {/* ── КРАН — БОСОО хоёр карт ── */}
        {/**
          * ӨМНӨХ БҮТЭН ДОЛОО ХОНОГИЙН ОНОО — КОМПАНИАР (2026-09-17, хэрэглэгчийн
          * хүсэлт: «Цамхагт кран — төлөв»-ийн ДЭЭР). V1.1 маягтаас, дээд KPI-тэй
          * ИЖИЛ дүрмээр (`habeaUzleg.loadWeekScoreByCo`).
          */}
        <Section
          title={tr('Ажлын байрны үзлэг')}
          fill
          note={weekScores.state === 'ready' ? tr('{0}-р долоо хоног · оноо — багцаар', num(weekScores.data.no)) : undefined}
        >
          {weekScores.state === 'loading'
            ? <Loading />
            : weekScores.state === 'error'
              ? <Empty label={tr('Татагдсангүй: {0}', friendlyError(weekScores.error))} onRetry={weekScores.retry} />
              : weekScoreByPkg(weekScores.data.rows, cos).length
                ? <ScoreColumns items={weekScoreByPkg(weekScores.data.rows, cos)} selected={pkgs} onSelect={togglePkg} />
                : <Empty label={tr('Энэ долоо хоногт оноо бүртгэгдээгүй')} />}
        </Section>
        {/**
          * ӨМНӨХ ДОЛОО ХОНОГИЙН ҮЛ НИЙЦЭЛ — БАГЦААР (2026-09-17, хэрэглэгчийн хүсэлт).
          * «Үзлэгийн оноо — компаниар»-ын ДООР, ижил долоо хоног, ижил хоёр маягт
          * (`habeaUzleg.weekNcByPkg`). Дарахад хуудасны «Багц» шүүлт тавигдана.
          */}
        <Section
          title={tr('Нийт үл нийцэл — багцаар')}
          note={weekScores.state === 'ready' ? tr('{0}-р долоо хоногийн ноцтой ба бага зэргийн үл нийцэл', num(weekScores.data.no)) : undefined}
        >
          {weekScores.state === 'loading'
            ? <Loading />
            : weekScores.state === 'error'
              ? <Empty label={tr('Татагдсангүй: {0}', friendlyError(weekScores.error))} onRetry={weekScores.retry} />
              : weekNcByPkg(weekScores.data.rows, cos).length
                ? (
                  <Bars
                    items={weekNcByPkg(weekScores.data.rows, cos)}
                    selected={pkgs}
                    onSelect={togglePkg}
                  />
                )
                : <Empty label={tr('Энэ долоо хоногт үл нийцэл бүртгэгдээгүй')} />}
        </Section>
        </>)}
      </div>
      )}

      {/* ── ДООД зурвас — бүтэн өргөн, хумилтгүй. Агуулга нь ФОКУСААС
          хамаарна (2026-09-06): анхны харагдац ба «Техник болон хүн цаг»
          үед ажилтан/техникийн цуваа, ослын фокуст зураг + компаниар,
          үзлэгийн фокуст гүйцэтгэгч + талбай + сараар. «Осол, зөрчил —
          багцаар» ба «Кран — багцаар» хасагдсан; багцаар шүүх нь дээд талын
          «Багц» шүүлтүүрт. ── */}
      <div className={h.fin} data-cols="2"
        style={panes.styleFor('fin1', 'fin2')}>
        {incOpen && (<>
        <Section title={tr('Осол, зөрчлийн зураг')} note={tr('хавсаргасан зургууд · дарж томруулна')}>
          <PhotoWall list={[...fInc].sort((a, b) => b.d - a.d)} />
        </Section>
        <Section title={tr('Осол, зөрчил — компаниар')}>
          {incByCompany.length
            ? <Bars items={incByCompany} selected={sel.incCompany} onSelect={(k) => toggleDim('incCompany', k)} />
            : noRecords}
        </Section>
        </>)}

        {uzlegKind && !dual && <UzlegFin st={uzF} sel={uzSel} onPick={onUzPick} curYm={curYm} />}
        {dual && (<>
          <div className={h.finHalf}>
            <UzSrcHead title={HABEA.uzleg.v11.title} hue={LAYER_BY_ID[HABEA_UZLEG_LAYER_ID.v11].hue} />
            <div className={h.finHalfGrid} style={panes.styleFor('fhL')}>
              <UzlegFin st={uzF} sel={uzSel} onPick={onUzPick} curYm={curYm} />
              <div className={h.gripCol} style={{ gridColumn: '1 / 2', gridRow: '1 / 2', right: -8 }} {...panes.grip('fhL')} />
            </div>
          </div>
          <div className={h.finHalf}>
            <UzSrcHead title={HABEA.uzleg.zahialagch.title} hue={LAYER_BY_ID[HABEA_UZLEG_LAYER_ID.zahialagch].hue} />
            <div className={h.finHalfGrid} style={panes.styleFor('fhR')}>
              <UzlegFin st={uzF2} sel={uzSel} onPick={onUzPick} curYm={curYm} />
              <div className={h.gripCol} style={{ gridColumn: '1 / 2', gridRow: '1 / 2', right: -8 }} {...panes.grip('fhR')} />
            </div>
          </div>
        </>)}

        {laborOpen && (<>
        {/* Ажилтны тоо ӨДРӨӨР. Багана 213 хүртэл болох тул хэвтээ гүйлгэгчид
            хийж, СҮҮЛИЙН өдрүүд рүү өөрөө гүйлгэнэ (`dayScroll`) — хамгийн
            сүүлийн байдал нь хамгийн чухал. Хуучин өдрийг зүүн тийш гүйлгэнэ. */}
        <Section
          title={aStep === 'day' ? tr("Ажилтан — өдрөөр") : tr("Ажилтан — сараар")}
          note={stepNote(aStep, setAjiltanStep,
            aStep === 'day'
              ? (byDay.length ? tr("{0} · {1} өдөр", coLabel ?? tr("бүх компани"), num(byDay.length)) : null)
              : (byMonth.length ? `${tr("{0} · {1} сар", coLabel ?? tr("бүх компани"), num(byMonth.length))}${monthNote(byMonth)}` : null))}
          fill
        >
          {(aStep === 'day' ? byDay : byMonth).length
            ? (
              <div className={`${h.dayScroll} ${h.dayScrollFill}`} ref={dayScroll}>
                <div style={{ minWidth: `${Math.max(100, (ajItems.length / SERIES_VISIBLE) * 100)}%` }}>
                  <Series
                    items={ajItems}
                    lines={ajLines}
                    height={110}
                    unit={aStep === 'day' ? tr("ажилтан") : tr("хүн-өдөр")}
                    line
                    showValues
                    grow
                    selected={aStep === 'day' ? sel.day : sel.month}
                    onSelect={(k) => toggleDim(aStep === 'day' ? 'day' : 'month', k)}
                  />
                </div>
              </div>
            )
            : surveyEmpty}
        </Section>
        {/* Техник ӨДРӨӨР — ажилтны цувааны ХАЖУУД, ижил хэлээр, ижил өргөнд.
            Хоёулаа `SERIES_VISIBLE` өдөр зэрэг харуулна. */}
        <Section
          title={tStep === 'day' ? tr("Техник — өдрөөр") : tr("Техник — сараар")}
          note={stepNote(tStep, setTehnikStep,
            tStep === 'day'
              ? (techDay.length ? tr("{0} · {1} нэгж-өдөр", coLabel ?? tr("бүх компани"), num(totalTech)) : null)
              : (techMonth.length ? `${tr("{0} · {1} сар", coLabel ?? tr("бүх компани"), num(techMonth.length))}${monthNote(techMonth)}` : null))}
          fill
        >
          {(tStep === 'day' ? techDay : techMonth).length
            ? (
              <div className={`${h.dayScroll} ${h.dayScrollFill}`} ref={techScroll}>
                <div style={{ minWidth: `${Math.max(100, ((tStep === 'day' ? techDay : techMonth).length / SERIES_VISIBLE) * 100)}%` }}>
                  <Series
                    items={tStep === 'day' ? techDay : techMonth}
                    height={110}
                    unit={tStep === 'day' ? tr("нэгж") : tr("нэгж-өдөр")}
                    line
                    showValues
                    grow
                    selected={tStep === 'day' ? sel.day : sel.month}
                    onSelect={(k) => toggleDim(tStep === 'day' ? 'day' : 'month', k)}
                  />
                </div>
              </div>
            )
            : surveyEmpty}
        </Section>
        </>)}

        {/* ── Доод зурвасын КАРТ ХООРОНДЫН бариулууд ──
            Бариул бүр ЗАСАХ трекийнхээ баруун ирмэгт, 8px завсрын дунд. */}
        <div className={h.gripCol} style={{ gridColumn: '1 / 2', gridRow: '1 / 2', right: -8 }} {...panes.grip('fin1')} />
      </div>

      {/* ── Панелийн хэмжээ тохируулах бариулууд ──
          Тус бүр нь ӨӨРИЙН панелийн grid-нүдэнд суугаад тэр нүдний ирмэг рүү
          8px завсрын дунд шилжинэ. Панелиуд өөрсдөө overflow-той тул бариулыг
          тэдний ДОТОР тавьж болохгүй — таслагдана. Давхар товшвол анхны хэмжээ. */}
      {listOpen && (
        <div className={h.gripCol} style={{ gridArea: 'list', right: -8 }} {...panes.grip('l')} />
      )}
      <div className={h.gripCol} style={{ gridArea: 'r', left: -8 }} {...panes.grip('r')} />
      <div className={h.gripRow} style={{ gridArea: 'fin', top: -8 }} {...panes.grip('fin')} />
    </div>
  );
}
