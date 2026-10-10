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
import {
  HABEA, HABEA_LAYER_IDS, HABEA_UZLEG_LAYER_ID, LAYER_BY_ID, CATALOG_LAYER_IDS,
  laborCompanyFields, roleForUser,
} from '@/lib/services';
import { rasterTypeOf } from '@/lib/uzlegReport';
import { usePlanTotals } from '@/lib/totals';
/* ⚠️ 2026-10-09: ӨДРИЙН ТҮЛХҮҮР — Улаанбаатарын хуанли (`ubDayKey`), хөтчийн локал `dayKey` БИШ.
   CEO самбарын хүн хүч (`ceo/workforce`) UB-ээр огтолдог тул гадаад цагийн бүсэд нээхэд
   энэ хуудасны өдөр/сар (цуваа, `incPass`, `uzPass`) нэг өдрөөр гулсдаг байв. */
import { latestRowPerDay, companyReported, laborStaleness, ubDayKey } from '@/lib/ceo/workforce';
import { isBlankIncident } from '@/lib/ceo/safety';
import { hoursByDay, rateByMonth, rateByPkg, markCurMonth, CUR_MONTH_MARK, ltiFreeHours } from './habeaRate';
import { cached } from '@/lib/live';
import { register } from '@/lib/dataBus';
import { usePanes } from './habeaPanes';
import {
  useUzleg, filterUzleg, uzPass, uzPickRows, uzValueLabel, UzlegLeft, UzlegRight, UzlegFin,
  habeaPkgKey, habeaPkgLabel, loadWeekScores, prevWeek, weekScoreOf, weekScoreByPkg, ScoreColumns, scoreColor, weekNcByPkg, UzSrcHead, stepNote,
  UzlegPhotos, AttPhoto, inSel,
  SERIES_VISIBLE,
  type UzlegKind, type UzDim,
} from './habeaUzleg';
import { MultiSelect } from '@/components/MultiSelect';
import { DateRangePill } from '@/components/DateRangePill';
import { Section, Bars, Donut, Series, Stack, Loading, Empty, friendlyError, type SeriesLineDef } from '@/components/ui';
import { UzlegExportButton } from './UzlegExport';
import { loadHabeaRegisters, loadHabeaWaste, loadIsOrgAdmin, loadWasteCanCreate } from '@/lib/habeaRegisters';
import { HabeaCardGrips } from './HabeaCardGrips';
import { AddButton, RegisterAddDialog, WasteAddDialog } from './HabeaEntry';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { useAuth } from '@/components/AuthGate';
import { num, date, text, pct, cat } from '@/lib/format';
import { MapCanvas, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import h from './habea.module.css';
import o from './habeaOv.module.css';

const L = HABEA.labor.fields;
const I = HABEA.incident.fields;
const C = HABEA.crane.fields;

/** «Давхарга» каталогийн тоолуурт орох давхаргууд — ХАБЭА эхэнд, дараа нь контекст */
// ⚠️ 2026-08-20: Каталогийн БҮРЭН жагсаалт (`services.ts`).
const CATALOG_IDS = CATALOG_LAYER_IDS;

type HabeaData = { labor: Row[]; incident: Row[]; crane: Row[]; fetchedAt: number };

/* 5 мин кэш (2026-08-21 гүйцэтгэлийн аудит): харагдац сэлгэх бүрд 3 бүтэн
   хүснэгт дахин татагддаг байв */
const loadHabea = cached((): Promise<HabeaData> =>
  Promise.all([
    queryFeatures(HABEA.labor.url, { outFields: ['*'] }),
    queryFeatures(HABEA.incident.url, { outFields: ['*'] }),
    queryFeatures(HABEA.crane.url, { outFields: ['*'] }),
    // «Осолгүй хоног» render дотор Date.now() дуудаж болохгүй (react-hooks/purity)
    // тул лавлах цэг нь ӨГӨГДӨЛ ТАТСАН мөч — дахин ачаалахад шинэчлэгдэнэ.
  ]).then(([labor, incident, crane]) => ({ labor, incident, crane, fetchedAt: Date.now() })),
  /* ⚠️ `['HABEA']` таг — `reportData.loadHabeaSummary` мөн ЭНЭ хүснэгтээс
     уншиж `['HABEA']` зарладаг. Хоёр ах дүү ачаалагч ӨӨР тагтай байвал нэг
     нь шинэчлэгдээд нөгөө нь хоцорч, хоёр газар өөр тоо гарна. */
  5 * 60_000, ['HABEA']);

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
 *
 * ⚠️ envhub: ӨНГӨ = УТГА. Хүнд байдал нь төлөвийн ГУРАВХАН токенд буудаг —
 *    амь нас/гал = var(--bad), гэмтэл/хохирол/дөхсөн = var(--warn), бусад нь
 *    саарал бэх. Ижил шатлалын хоёр төрөл ИЖИЛ өнгөтэй байх нь зөв: ялгааг
 *    зүсмэгийн 1px зах, дараалал, тайлбар өгнө (өнгө биш).
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
// ⚠️ «Өгөгдөлгүй/бусад» нь ӨНГӨТ цуваа БИШ — саарал бэхийн токен (горим дагана).
const severityHue = (label: string) => SEVERITY.find(([re]) => re.test(label))?.[1] ?? 'var(--ink-3)';

/**
 * ТЭРГҮҮЛЭГЧИЙГ улаанаар (`--bad`), бусдыг өгөгдлийн ганц цэнхэр-теал өнгөөр
 * (`--data`). Улаан нь ЭНД «хамгийн их тохиолдсон» гэсэн ГАНЦ утга үүрнэ —
 * ослын хүнд байдалтай хамаагүй.
 *
 * ⚠️ Дээд утга ОЛОН мөрд давхацвал БҮГДИЙГ нь улаанаар: «эдгээр нь дээд тал»
 * гэдэг нь өгөгдлөөс шууд батлагдана. Харин БҮГД тэнцүү бол улаан хэрэглэхгүй —
 * юуг ч ялгахгүй тул өнгө ямар ч мэдээлэл дамжуулахаа болино.
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
 *
 * ⚠️ «Бусад» нь ангилал БИШ — үлдэгдлийн нийлбэр тул палитрын слот эзлэхгүй,
 * саарал бэх (`--ink-3`) хэвээр. Эс бөгөөс нэгтгэсэн бүлэг нь бодит ангилалтай
 * ижил жинтэй уншигдана.
 * ⚠️ Өнгө нь ЭНД хүнд байдлыг заахаа болив (захиалагчийн шийдвэр, 2026-08-20).
 * «Ослын дэлгэрэнгүй мэдээлэл»-ийн цэг нь `severityHue`-ээр хүнд байдлыг
 * заасаар байна.
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
 *
 * ⚠️ `categoryColors`-ийн ДАРАА дуудна: тэр нь эрэмбийн дугаараар өнгө өгдөг
 *    тул урьдчилж будсан ч дараа нь дарагдана.
 * ⚠️ «Бусад» нь ангилал БИШ, олон төрлийн НИЙЛБЭР тул түүнд улаан өгөхгүй —
 *    дотор нь амь насны эрсдэлтэй бүртгэл байсан ч бүхэл бүлгийг ноцтой гэж
 *    зарлах нь өгөгдөлд байхгүй мэдэгдэл болно.
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

const normIncident = (r: Row): Inc => ({
  oid: nn(r['objectid']),
  /* ⚠️ `CreationDate` нөөц ХАСАГДАВ (2026-09-17). Огноогүй маягт `d = 0`
     үлдэнэ: огнооны сонголт идэвхтэй үед л ХАСАГДАНА (`incPass`-ийн ⚠️),
     бусад үед тоологдоно. ⚠️ 2026-09-21: `date(0)` нь «1970.01.01» гэж
     ХУДАЛ огноо зурдаг байсан тул огноог ЗӨВХӨН `incDate`-ээр харуулна. */
  d: nn(r[I.ognoo]),
  bagtsRaw: text(r[I.bagts], '—'),
  bagtsK: habeaPkgKey(r[I.bagts]),
  company: clean(r[I.company]),
  type: text(r[I.turul], '—'),
  cause: text(r[I.shaltgaanTurul], '—'),
  info: text(r[I.medeelel], '—'),
  reason: text(r[I.shaltgaan], '—'),
  action: text(r[I.argaHemjee], '—'),
});

/* ─────────── Цамхагт кран ─────────── */

/* ⚠️ Краны төлөв нь сайн/муу заадаггүй АНГИЛАЛ — идэвхтэй хоёр төлөв нь
   өгөгдлийн ГАНЦ өнгө (var(--data)), буусан нь саарал бэх. Ялгааг өнгөөр биш —
   дараалал, тайлбар, зүсмэгийн 1px зах өгнө (envhub). */
const CRANE_HUE: Record<string, string> = {
  'Шинээр нэмэгдсэн': 'var(--data)', 'Одоо байгаа': 'var(--data)', 'Буусан': '#9ca3af',
};
/* ⚠️ 2026-10-08: «Буусан» = САРААЛ `#9ca3af` — газрын зургийн `habea:crane.paint`-тэй ЯГ ижил */

type Crane = {
  /** Цэг [50]-ийн OBJECTID — зураг · бүс · чартын ГАНЦ түлхүүр (`HABEA.crane.fields.oid`) */
  oid: number;
  dugaar: string; blok: string; bagtsRaw: string; bagtsK: string;
  undur: number; sunUrt: number; tuluv: string;
};

const normCrane = (r: Row): Crane => ({
  oid: nn(r[C.oid]),
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
 *
 * ⚠️ Шинэ маягт (2026-08) техникийг ЗӨВХӨН гүйцэтгэгчийн нийт тоогоор хөтөлдөг
 * (`Tehnik_<SFX>`) — цамхагт кран/экскаватор гэх ТӨРЛИЙН задаргаа БАЙХГҮЙ.
 */
/* ⚠️ 2026-10-09 (аудит №6): `hunTsag` · `cum.hunTsag` ХАСАГДСАН — хаана ч уншигддаггүй үхмэл талбар
   (хүн-цаг нь `habeaRate.hoursByDay` · `ltiFreeHours`-оос). */
function laborState(rows: Row[]): {
  rows: LaborRow[];
  asOf: number | null;
  cum: { ajiltan: number; tehnik: number };
} {
  const ZERO = { ajiltan: 0, tehnik: 0 };
  if (!rows.length) return { rows: [], asOf: null, cum: ZERO };
  const dOf = (r: Row) => nn(r[L.ognoo]) || nn(r['CreationDate']);
  /**
   * ⚠️ «Хамгийн сүүлийн тайлан»-г ЗӨВХӨН огноо БҮХИЙ мөрөөс сонгоно.
   *
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
   *
   * ⚠️ Гүйцэтгэгчээр ЗАДАРДАГГҮЙ: толгойн талбар нь дагаваргүй ганц утга тул
   * шүүлт идэвхтэй үед энэ тоог харуулбал ХУДАЛ болно — дүрслэл дээр «—» гарна.
   * ⚠️ Толгойн нийлбэр нь гүйцэтгэгчийн баганын нийлбэртэй ЯГ таардаггүй
   * (2026-08-20: 231,568 ба 231,926 — 0.15% зөрүү). Маягт бөглөгчид толгойн
   * тоог гараар засдагаас үүдэлтэй; ЭНД маягтын өөрийнх нь дүнг ЭХ гэж үзнэ.
   * ⚠️ Огноогүй/хоосон маягтууд (27 ширхэг) бүх талбар нь null тул `nn` дамжаад
   * 0 болж нийлбэрт нөлөөлөхгүй — тусад нь шүүх шаардлагагүй.
   */
  // ⚠️ Хуримтлагчийн төрлийг ЗААВАЛ бичнэ — эс бөгөөс TS нь массивын элементийн
  //    төрөл (`Row`) гэж таамаглаад `a.ajiltan` нь `string | number | null` болно.
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
 * нийлбэр. ⚠️ ХООСОН массив (`[]`) нь «бүгд» БИШ — шүүлт юу ч тааруулаагүй
 * гэсэн үг тул цуваа хоосон гарна.
 *
 * ⚠️ Огноогүй мөрийг (бөглөж дуусаагүй маягт) ХАСНА — `CreationDate`-аар
 * орлуулбал өнөөдрийн огноогоор олон хоосон багана нэмэгдэнэ.
 */
/**
 * Гүйцэтгэгч бүрийн БҮХ ХУГАЦААНЫ нийлбэр — шүүлтүүрийн сонголт ба
 * харьцуулалтын аль алинд.
 *
 * ⚠️ Хэмжих нэгж нь хүн-ӨДӨР / машин-ӨДӨР: нэг ажилтан ажилласан өдөр бүрдээ
 * дахин тоологдоно. Тухайн ӨДРИЙН тоог харах бол `byDaySeries`-ийг үзнэ.
 * ⚠️ Багц заагдаагүй гүйцэтгэгчид `bagtsK` нь хоосон — багцын шүүлт тэднийг
 * дуугүйхэн хасахгүйн тулд дуудагч тал дээр тусад нь шалгана.
 * ⚠️ Нийлбэр нь БҮХ бүртгэлээс: сүүлийн бүртгэлээс уншвал тэр өдөр тайлангаа
 * өгөөгүй гүйцэтгэгч бүтнээрээ алга болно (2026-08-19-нд 6-аас 3 нь л бөглөсөн).
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
      /* ⚠️ Задаргаа нь `niitAjiltan`-тай ТЭНЦЭХГҮЙ: маягтад монгол/гадаад
         багана өдөр бүр бөглөгддөггүй. Хоёрыг харьцуулж «дутуу» гэж бүү
         бод — энэ бол өөр бөглөлттэй ХОЁР өөр багана. */
      mongol: rows.reduce((s, r) => s + nn(r[f.mongol]), 0),
      gadaad: rows.reduce((s, r) => s + nn(r[f.gadaad]), 0),
    };
  });
}

/**
 * Өдөр тутмын цуваа — ажилтан эсвэл техник.
 *
 * `sfxs` өгвөл тэдгээр гүйцэтгэгчийн баганын нийлбэр, эс бөгөөс бүх гүйцэтгэгчийн
 * нийлбэр. ⚠️ ХООСОН массив (`[]`) нь «бүгд» БИШ — шүүлт юу ч тааруулаагүй
 * гэсэн үг тул цуваа хоосон гарна.
 *
 * ⚠️ Огноогүй мөрийг (бөглөж дуусаагүй маягт) ХАСНА — `CreationDate`-аар
 * орлуулбал өнөөдрийн огноогоор олон хоосон багана нэмэгдэнэ.
 */
function byDaySeries(rows: Row[], sfxs: readonly string[] | null, key: 'niitAjiltan' | 'niitTehnik') {
  const list = (sfxs ?? HABEA.labor.companies.map((c) => c.sfx)).map((sfx) => ({ sfx, f: laborCompanyFields(sfx) }));
  return rows
    .map((r) => {
      /**
       * ⚠️ ТАЙЛАГНААГҮЙ ӨДРИЙГ 0 ГЭЖ ЗУРАХГҮЙ (2026-09-03-ны аудит).
       *
       * `nn()` нь `null`-ыг 0 болгодог тул нэг ч компани тайлангаа
       * өгөөгүй өдөр «0 ажилтан» гэсэн ЦЭГ болж графикт буудаг байв —
       * энэ файлын өөрийн ⚠️ («хэмжигдээгүйг 0%-иар зурвал ХУДАЛ
       * уншигдана») үүнийг хориглосон. Одоо БҮХ талбар хоосон бол мөр
       * `null` утгатай гарч, цувааны цоорхой хэвээр үлдэнэ.
       */
      /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ТАЙЛАН ӨГӨӨГҮЙ гүйцэтгэгч АЛГАСНА.
         `Niit_ajiltan_<SFX>` нь репитэд ороогүй үед ч 0 (null БИШ) бичигддэг тул нэг
         гүйцэтгэгч сонгоход тэр тайлан өгөөгүй өдөр «0 ажилтан» гэсэн ХУДАЛ цэг
         зурагддаг байв. «Тайлан өгсөн» = ажилтан эсвэл техник > 0
         (`ceo/workforce.isReported` — CEO самбарын «тайлангүй» дүрэмтэй НЭГ). */
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
    /*
     * ⚠️ НЭГ ӨДӨРТ ОЛОН БҮРТГЭЛ байж болно (засвар, давхар илгээлт). Мөр тус
     *    бүрийг ЦЭГ болговол нэг өдөр хэд хэдэн багана болж, React-д ижил
     *    түлхүүр давхардана. ⚠️ 2026-09-30: давхар мөрийг НИЙЛБЭРЛЭХ нь буруу —
     *    нэг маягт = өдрийн НЭГДСЭН тайлан (бүх гүйцэтгэгч), давхар мөр нь
     *    засвар/дахин илгээлт (2026-08-21: 247 ба засварласан 389 → 636 гэж
     *    зурагддаг байв). Дуудагч `latestRowPerDay`-ээр өдөрт НЭГ мөр өгнө;
     *    доорх нэгтгэл нь зөвхөн түлхүүр давхардахаас сэргийлэх нөөц хамгаалалт.
     */
    .reduce<{ key: string; label: string; value: number; display: string }[]>((acc, x) => {
      /* ⚠️ ОРОН НУТГИЙН огноогоор бүлэглэнэ (`ubDayKey` — 2026-10-09: Улаанбаатарын хуанли). Урьд нь
         `toISOString().slice(0, 10)` байсан тул +08 бүсэд орон нутгийн
         00:00–07:59-д илгээсэн тайлан ӨМНӨХ өдрийн баганад нийлдэг байв;
         `byMonthSeries` нь энэ түлхүүрийн эхний 7 тэмдэгтээр сар авдаг тул
         сарын эхний шөнийн бүртгэл бүтэн сараар ч гулсдаг байлаа. */
      const iso = ubDayKey(x.d);
      const last = acc[acc.length - 1];
      /* ⚠️ Дээрх шүүлт `value != null`-ыг баталсан — энд утга ҮРГЭЛЖ тоо */
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
 * ⚠️ МӨРӨӨР эрэмбэлж БОЛОХГҮЙ (2026-09-06-нд илэрсэн алдаа). Эх өгөгдөлд
 * тусгаарлагч нь ЖИГД БИШ: зарим нь «Багц-1» (зураас), зарим нь «Багц 3.2»
 * (зай). Юникодод зай (U+0020) нь зураасаас (U+002D) ӨМНӨ ордог тул
 * `localeCompare` нь `numeric: true`-тэй ч «Багц 3.2 · Багц 3.3 ·
 * Багц-1 · Багц-2 · Багц-4.1» гэж эвдэрсэн дараалал өгч байв — тоон
 * харьцуулалт нь ЭХНИЙ ялгаатай тэмдэгтэд (зай ↔ зураас) зогсдог.
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
    /* ⚠️ Богино нь ЭХЭНД: «Багц-4» нь «Багц-4.1»-ээс өмнө байх ёстой */
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d;
  }
  return a.localeCompare(b);
};

/**
 * САРЫН ЦУВАА — ӨДРИЙН цуваанаас нэгтгэнэ.
 *
⚠️ `byDaySeries`-ийн ГАРАЛТААС бодно, түүхий мөрөөс БИШ. Тэр функц нь
 * тайлагнаагүй өдрийг хасах, нэг өдрийн олон бүртгэлийг нэгтгэх гэсэн хоёр
 * дүрмийг аль хэдийн хэрэгжүүлсэн; дахин бичвэл хоёр зам салж, нэг өдөр
 * хоёр тоо гарна.
 *
 * ⚠️ ЭНЭ НЬ «САРД АЖИЛЛАСАН ХҮНИЙ ТОО» БИШ — ХҮН-ӨДӨР. Өдрийн утга нь
 * тухайн өдрийн ТОО ТОЛГОЙ тул сараар нийлбэл нэг хүн ажилласан өдрийнхөө
 * тоогоор дахин дахин тоологдоно. Гарчигт нэгжийг ЗААВАЛ бичнэ — эс бөгөөс
 * «8 сард 32,000 ажилтан» гэж ХУДАЛ уншигдана.
 *
 * ⚠️ Шошгод ОН нь заавал: төсөл олон жил үргэлжлэх тул зөвхөн «08» гэвэл
 * өөр жилийн нэг сар нийлж, эсвэл дараалал эвдэрсэн мэт харагдана.
 */
/* ⚠️ 2026-10-01: `curYm` — ЯВАГДАЖ БУЙ сар «*»-тай (`habeaRate.markCurMonth`): сарын дунд
   хүн-өдрийн нийлбэр ДУТУУ тул сүүлийн багана «унасан» мэт уншигддаг байв. */
/**
 * МОНГОЛ · ГАДААД — ӨДӨР БҮРИЙН задаргаа (2026-10-06, хэрэглэгчийн хүсэлт:
 * «Ажилтан — өдрөөр»-ийг задаргаа орж ирсэн өдрөөс хойш хоёр муруйгаар).
 *
 * ⚠️ `byDaySeries`-ийн ИЖИЛ дүрэм: тайлан өгөөгүй гүйцэтгэгчийг алгасна
 *    (`companyReported`), орон нутгийн өдрийн түлхүүр (`ubDayKey`). Хоёул 0 бол
 *    тэр өдөр задаргаагүй — Map-д ОРОХГҮЙ (0 гэж зурахгүй, цоорхой).
 */
function mixByDay(rows: Row[], sfxs: readonly string[] | null): Map<string, { mongol: number; gadaad: number }> {
  const list = (sfxs ?? HABEA.labor.companies.map((c) => c.sfx)).map((sfx) => ({ sfx, f: laborCompanyFields(sfx) }));
  const out = new Map<string, { mongol: number; gadaad: number }>();
  for (const r of rows) {
    const d = nn(r[L.ognoo]);
    if (!(d > 0)) continue;
    let mongol = 0;
    let gadaad = 0;
    for (const { sfx, f } of list) {
      if (!companyReported(r, sfx)) continue;
      mongol += nn(r[f.mongol]);
      gadaad += nn(r[f.gadaad]);
    }
    if (mongol + gadaad <= 0) continue;
    const k = ubDayKey(d);
    const cur = out.get(k);
    if (cur) { cur.mongol += mongol; cur.gadaad += gadaad; } else out.set(k, { mongol, gadaad });
  }
  return out;
}

/**
 * Өдрийн задаргааг САР руу нэгтгэнэ (хүн-өдөр — `byMonthSeries`-ийн ижил нэгж).
 * ⚠️ Сарын ЗАРИМ өдөр задаргаагүй бол тэр сарыг задаргаатай гэж ҮЗЭХГҮЙ — Монгол +
 *    Гадаадын нийлбэр нь сарын нийт хүн-өдрөөс ДУТУУ болж, худал бууралт харагдана.
 *    Тэр сар «Нийт» муруйгаар гарна.
 */
function mixByMonth(mix: Map<string, { mongol: number; gadaad: number }>, days: { key: string }[]) {
  const partial = new Set(days.filter((x) => !mix.has(x.key)).map((x) => x.key.slice(0, 7)));
  const out = new Map<string, { mongol: number; gadaad: number }>();
  for (const [k, v] of mix) {
    if (partial.has(k.slice(0, 7))) continue;
    const ym = k.slice(0, 7);
    const cur = out.get(ym);
    if (cur) { cur.mongol += v.mongol; cur.gadaad += v.gadaad; } else out.set(ym, { ...v });
  }
  return out;
}

/**
 * Монгол · Гадаад хоёр муруй + задаргаагүй үед НИЙТ муруй (2026-10-06).
 *
 * ⚠️ Хэрэглэгч: «монгол гадаад төрөл байхгүй бол нийтээр нь харуул». Тиймээс
 *    цувааг ТАЙРАХГҮЙ: задаргаатай өдөр Монгол · Гадаад, задаргаагүй өдөр
 *    Нийт (одоогийн утга). Шугам бүр өөрт хамаарахгүй өдөр `null` (цоорхой).
 * ⚠️ Задаргаа огт байхгүй бол `null` — дуудагч ОДООГИЙН нэг муруйгаар зурна.
 * ⚠️ Өнгө нь «Компаниар — монгол, гадаад»-тай ИЖИЛ (`--c1` · `--c2`); Нийт нь
 *    анхдагч өгөгдлийн өнгө (`--data`) — өмнөх нэг муруйтай ижил.
 */
function mixLines<T extends { key: string; value: number }>(
  items: T[], mix: Map<string, { mongol: number; gadaad: number }>,
): SeriesLineDef[] | null {
  if (!mix.size || !items.some((x) => mix.has(x.key))) return null;
  const pick = (k: 'mongol' | 'gadaad') => items.map((x) => mix.get(x.key)?.[k] ?? null);
  const total = items.map((x) => (mix.has(x.key) ? null : x.value));
  const out: SeriesLineDef[] = [];
  if (total.some((v) => v != null)) {
    out.push({ key: 'all', label: tr('Нийт'), color: 'var(--data)', values: total });
  }
  out.push(
    { key: 'mn', label: tr('Монгол'), color: 'var(--c1)', values: pick('mongol') },
    { key: 'fr', label: tr('Гадаад'), color: 'var(--c2)', values: pick('gadaad') },
  );
  return out;
}

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
 *
 * ⚠️ 2026-09-17 ШИНЭ ЗОХИОМЖ (хэрэглэгчийн хүсэлт: «энэ хэсгийг гоё харуулмаар»).
 * Урьд нь `habeaOv .tile` (13px тоо, `space-between`) байсан тул тоо нүдний ёроолд
 * жижгээр наалдаж, дээр нь их хоосон зай үлдэж, урт шошготой нүд (захиалагчийн
 * үзлэг) бусдаасаа өөр өндөрт тоогоо харуулдаг байв. Одоо ӨӨРИЙН ангиуд
 * (`h.kt*`) — `habeaOv`-ийг хөндөхгүй.
 *
 * ⚠️ ШОШГО нь ХОЁР МӨРИЙН ТОГТМОЛ өндөртэй, ДООД ирмэгтээ зэрэгцэнэ — нэг мөр ба
 * хоёр мөр шошготой нүднүүдийн ТОО нэг хэвтээ шугам дээр гарна.
 * ⚠️ `ratio` (0–1) — хувь/харьцаа утгатай нүдэнд (оноо, идэвхтэй кран) нимгэн
 * зурвас. Бусад нь (нийлбэр тоо) зурвасгүй: харьцуулах суурь байхгүй.
 */
/* ⚠️ 2026-10-01: `subWarn` — доод мөрийг анхааруулгын өнгөөр (хуучирсан тайлан) */
/**
 * KPI НҮДНИЙ ӨНГӨ (2026-10-08, хэрэглэгчийн жишээ зураг). Нүд бүр ӨӨРИЙН өнгөтэй (`--t`) —
 * харьцааны зурвас. Эффектүүд (уусгалт, гэрэлтэлт, бүдэг том дүрс) ба ДҮРСҮҮД хэрэглэгчийн
 * хүсэлтээр хасагдсан («icon-уудыг нь хас»).
 * ⚠️ Жишээ зурагт байсан жижиг муруй/багана нь ЧИМЭГЛЭЛ байсан — бодит өгөгдөлгүй
 * «хандлага» зурвал худал мэдээлэл болно.
 */
/* ⚠️ 2026-10-09 («бүх графикийн загварыг жигдлэх»): hex (#3b82f6/#14b8a6/#0ea5e9/#8b5cf6/
   #22c55e) → зэрэглэлийн слот `cat(i)` ба статус токен — dark горимд дагана. Оноо нь
   «сайн» утгатай тул слот биш `--good` (оноотой үед `scoreColor` дарна). */
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
  /* ⚠️ 2026-10-06: товчлол шошго (LTI) — том үсгээр (хэрэглэгчийн хүсэлт) */
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

/* ⚠️ 2026-10-09 (аудит №2): `type` — attachmentInfos-ийн зарласан төрөл, ЗӨВХӨН татах файлын нэр/өргөтгөлд */
type Photo = { id: number; name: string; type?: string };

/** Бүртгэл бүрийн хавсралтын жагсаалт — нэг удаа татаад кэшлэнэ (задлах бүрд дахин татахгүй) */
const photoCache = new Map<number, Promise<Photo[]>>();
/* ⚠️ 2026-10-09 (аудит №6): `invalidate('HABEA')` (бүртгэл нэмэх · «Шинэчлэх» · таб буцаж ирэх)-д
   хаягдана — урьд нь модулийн кэш өгөгдлийн автобусад бүртгэлгүй тул шинэ хавсралт сешн дуустал
   харагдахгүй байв (`live.cached`-тэй ижил `register`). */
register(() => photoCache.clear(), ['HABEA']);
const loadPhotos = (oid: number): Promise<Photo[]> => {
  let p = photoCache.get(oid);
  if (!p) {
    /* ⚠️ ArcGIS алдааг HTTP 200-аар буцаадаг — биеийг ЗААВАЛ шалгана. Урьд нь
       `{error:{…}}` ирэхэд `?? []` дамжиж «зураг алга» гэсэн ХУДАЛ хариу
       болдог байв (2026-09-16). `habeaUzleg`-ийн зам үүнийг зөв хийдэг.
       ⚠️ 2026-09-30: `arcgisPost` (POST, токен биеэр) — `{error}`-ыг цөм өөрөө
       `ArcGISError` болгож шиднэ; timeout · слот · 429 backoff нэмэгдэв. */
    p = arcgisPost<{
      attachmentInfos?: { id: number; contentType?: string; name?: string }[];
    }>(`${HABEA.incident.url}/${oid}/attachments`, { f: 'json' })
      .then((j) => {
        /* ⚠️ 2026-10-09 (аудит): `image/*` БИШ — зөвхөн растер (`rasterTypeOf`: jpeg · png · gif ·
           webp · bmp). `image/svg+xml` хавсралт скрипт агуулж болох тул хана/табад орохгүй. */
        return (j.attachmentInfos ?? [])
          .filter((a) => rasterTypeOf(a.contentType) != null)
          .map((a) => ({ id: a.id, name: a.name ?? tr('Зураг {0}', a.id), type: a.contentType }));
      });
    // ⚠️ АМЖИЛТГҮЙ амлалтыг кэшлэхгүй — үлдээвэл «дахин оролдох» хэзээ ч сэргэхгүй
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
  /* ⚠️ 2026-09-25: `allSettled` — урьд нь `Promise.all` тул НЭГ бүртгэлийн
     хавсралт унахад бусад бүх зураг хаягдаж хана бүхэлдээ алдаа болдог байв.
     Унасныг алгасна; БҮГД унасан үед л алдаа шиднэ (дахин оролдох гарц).
     ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): унасан тоог `failed`-ээр БУЦААНА — урьд нь
     ЧИМЭЭГҮЙ алгасдаг тул «17 ослын 3-ынх нь зураг татагдаагүй» гэдгийг хэн ч мэддэггүй
     байв. Хана «N бүртгэлийн зураг татагдсангүй» + «Дахин оролдох» гаргана (унасан
     амлалт `photoCache`-ээс хасагддаг тул дахин оролдлого зөвхөн тэднийг татна). */
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
  /* ⚠️ 2026-09-02: retry нэмэв. Энэ файлын доод талын зургийн хэсэгт (`Photos`)
     retry аль хэдийн байсан атлаа энд алга байсан — нэг харагдац дотроо зөрж,
     хэрэглэгч аль нь дахин оролдож болохыг таамаглах хэрэгтэй болдог байв. */
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
      {/* ⚠️ 2026-10-09 (аюулгүй байдал): `?token=`-тэй `<img src>`/`<a href>` → blob URL
          (`habeaUzleg.AttPhoto`: POST, токен БИЕЭР, зөвхөн байгууллагын хост). Урьд нь токен
          access log, хөтчийн түүх, Referer-ээр алдагддаг байв (CWE-598). */}
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
 *
 * ⚠️ Индексийг эффектээр тэглэхгүй — шүүлтээр жагсаалт богиноссон үед
 * `Math.min`-ээр хязгаарт нь буцаана (setState-in-effect-ээс зайлсхийнэ).
 */
function PhotoWall({ list }: { list: Inc[] }) {
  const ids = list.map((x) => x.oid).join(',');
  const [idx, setIdx] = useState(0);
  const q = useAsync<{ items: { src: string; cap: string; tip: string; name: string; type?: string }[]; failed: number }>(
    () =>
      loadPhotoBatches(list, (i, p) => ({
        /* ⚠️ 2026-09-30: ТОКЕНГҮЙ хаяг. ⚠️ 2026-10-09: токен URL-д ОГТ орохгүй — `AttPhoto`
           татах агшинд POST биеэр (одоогийн токен) илгээж blob URL-аар харуулна. */
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
  /* ⚠️ 2026-10-01: хэсэгчилсэн уналтын мөр — зураг байсан ч, үгүй ч ил */
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
        {/* Хөндлөнгийн ArcGIS хавсралт тул next/image-ийн оновчлол хамаагүй.
            ⚠️ loading="lazy" ХЭРЭГЛЭХГҮЙ — карт нь доод зурваст (`AttPhoto`-д ч хэрэглээгүй). */}
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
function pickRows(id: string, a: Record<string, unknown>): [string, string][] {
  if (id === 'habea:osol') {
    return ([
      [tr('Огноо'), date(a[I.ognoo] as number)],
      [tr('Төрөл'), text(a[I.turul], '—')],
      [tr('Багц'), text(a[I.bagts], '—')],
      [tr('Компани'), clean(a[I.company])],
      [tr('Мэдээлэл'), text(a[I.medeelel], '—')],
      [tr('Шалтгаан'), text(a[I.shaltgaan], '—')],
      [tr('Арга хэмжээ'), text(a[I.argaHemjee], '—')],
    ] as [string, string][]).filter(([, v]) => v !== '—');
  }
  /* ⚠️ 2026-09-21: null/хоосон хэмжээг «0 м» гэж БҮҮ зур (`nn` нь 0 буцаадаг) —
     мэдээлэлгүй ба тэг хоёр өөр. Хэмжээгүй мөр ослын салбартай ижил
     `.filter(v !== '—')`-ээр алга болно. */
  const meters = (v: unknown): string => {
    const x = v == null || v === '' ? NaN : Number(v);
    return Number.isFinite(x) ? tr('{0} м', num(x)) : '—';
  };
  const rows: [string, string][] = [
    [tr('Багц'), text(a[C.bagts], '—')],
    [tr('Блок'), text(a[C.blok], '—')],
    [tr('Төлөв'), text(a[C.tuluv], '—')],
    [tr('Өндөр'), meters(a[C.undur])],
    /* ⚠️ Хоёр бичиглэл уншдаг байсан зам ХАСАГДЛАА (2026-09-04): эх
       үйлчилгээнд цэг [50] ба бүс [51] ХОЁУЛАА «суны» гэж бичдэг. Хоёр нэр нь
       зөвхөн test_data-гийн хуулбарын үлдэгдэл байв. */
    [tr('Сумны урт'), meters(a[C.sunUrt])],
  ];
  if (id === 'habea:buffer') rows.push([tr('Аюулгүйн радиус'), meters(a['BUFF_DIST'])]);
  return rows.filter(([, v]) => v !== '—');
}

/**
 * ШҮҮЛТҮҮРИЙН ЧИПҮҮД — өгөгдлийн эх сурвалж бүрд НЭГ.
 *
 * ⚠️ Дараалал нь ЧУХАЛ: осол (хамгийн ойр анхаарал татдаг) → хүн хүч
 * (өдөр бүр шинэчлэгддэг) → хоёр үзлэг (долоо хоног тутам). Хэрэглэгч
 * зүүнээс баруун тийш «яаралтайгаас тогтмол руу» уншина.
 *
 * ⚠️ ТОО нь зөвхөн ослынд: бусад нь эсвэл олон хэмжигдэхүүнтэй (`labor`)
 * эсвэл залхуу ачаалалттай (үзлэг) тул чип дээр тоо бичвэл хуудас нээхэд
 * тэдгээрийг ЗААВАЛ татах хэрэгтэй болно — залхуу ачаалалтын утга алдагдана.
 */
const FOCUS_CHIPS: {
  key: 'inc' | 'labor' | 'v11' | 'guitsetgegch';
  label: () => string;
  count: (inc: number) => number | null;
}[] = [
  { key: 'inc', label: () => tr('Осол, зөрчил'), count: (n) => n },
  { key: 'labor', label: () => tr('Техник болон хүн цаг'), count: () => null },
  /* ⚠️ 2026-09-17: «Ажлын байрны үзлэг V1.1» → «Захиалагчийн ажлын байрны үзлэг».
     Түлхүүр нь `v11` хэвээр: энэ фокус одоо ХОЁР маягтыг зэрэгцүүлнэ —
     зүүн талд V1.1, баруун талд захиалагчийн шинэ маягт (`dual`). */
  { key: 'v11', label: () => tr('Захиалагчийн ажлын байрны үзлэг'), count: () => null },
  { key: 'guitsetgegch', label: () => tr('Гүйцэтгэгчийн ажлын байрны үзлэг'), count: () => null },
];

/* ⚠️ Цувааны харагдах үеийн тоо `SERIES_VISIBLE` (=7) — `habeaUzleg`-ээс, НЭГ эх сурвалж. */
/* ─────────── Хөндлөн шүүлтийн загвар ─────────── */

/**
 * ХӨНДЛӨН ШҮҮЛТИЙН ХЭМЖЭЭСҮҮД — ArcGIS Dashboard-ын зарчмаар: аль ч чартын
 * хэсгийг дарахад тэр утга шүүлт болж, ГАЗРЫН ЗУРАГ болон бусад чарт дагана.
 *
 * ⚠️ ХАМРАХ ХҮРЭЭ нь хэмжээс бүрд ӨӨР. Ослын бүртгэлд «краны төлөв» гэсэн
 * талбар байхгүй, кранд «ослын төрөл» байхгүй. Тиймээс хэмжээс бүр ЗӨВХӨН
 * өөрийн эх сурвалжийг шүүнэ — эс бөгөөс «ослын төрөл» сонгоход краны самбар
 * хоосорч «кран алга» гэж ХУДАЛ уншигдана.
 *
 *   pkg        → осол · кран · ажилтан · гурван давхарга   (бүх эх сурвалжид бий)
 *   co         → ажилтан (яг), багцаараа дамжин бусад
 *   incType    → ЗӨВХӨН осол
 *   cause      → ЗӨВХӨН осол
 *   incCompany → ЗӨВХӨН осол
 *   craneState → ЗӨВХӨН кран
 */
type Dim2 = 'pkg' | 'co' | 'incType' | 'cause' | 'incCompany' | 'craneState'
  /* ⚠️ 2026-09-15: ҮЗЛЭГИЙН чартын хэмжээсүүд — ЗӨВХӨН үзлэгийн самбарыг
     шүүнэ (ослын `incType` нь зөвхөн ослыг шүүдэгтэй ижил хамрах хүрээ). */
  | 'uzSev' | 'uzShift' | 'uzCompany' | 'uzWeek'
  /* ⚠️ ХУУДАСНЫ ОГНОО — хүн хүч, осол, үзлэг гурвуулаа дагана (кран огноогүй).
     Хүн хүчний ба үзлэгийн өдөр/сарын цуваа ИЖИЛ хэмжээсийг тавина. */
  | 'day' | 'month';
/**
 * ⚠️ 2026-09-15: `pkg` ба `co` НЭГ УТГАТАЙ `Sel`-ээс ГАРЧ, тусдаа МАССИВ
 * төлөв болов (олон сонголт). Бусад дөрвөн хэмжээс чартын нэг хэсгийг
 * дарж сонгодог тул нэг утгатай хэвээр.
 */
type SelDim = Exclude<Dim2, 'pkg' | 'co'>;
/**
 * ⚠️ 2026-09-15: БҮХ хэмжээс МАССИВ — ArcGIS Dashboard-ын олон сонголт.
 * Нэг хэмжээс доторх утгууд «эсвэл», хэмжээс хооронд «ба». Хоосон = бүгд.
 */
type Sel = Record<SelDim, string[]>;
/** Үзлэгийн хэмжээсүүд — маягт солиход ЭДГЭЭР л цуцлагдана */
/**
 * Үзлэгийн хэмжээсүүд — маягт солиход ЭДГЭЭР л цуцлагдана.
 * ⚠️ Огноо (`day`/`month`) ЭНД ОРОХГҮЙ: тэр нь хуудасны шүүлт тул
 * маягт солиход ч хүн хүч, ослын шүүлт хэвээр үлдэх ёстой.
 */
const NO_UZ_SEL: Pick<Sel, 'uzSev' | 'uzShift' | 'uzCompany' | 'uzWeek'> = {
  uzSev: [], uzShift: [], uzCompany: [], uzWeek: [],
};

const NO_SEL: Sel = {
  incType: [], cause: [], incCompany: [], craneState: [],
  ...NO_UZ_SEL,
  day: [], month: [],
};

/* ⚠️ 2026-10-09: `habeaUzleg.inSel` — урт жагсаалтад (огнооны муж → 365+ өдөр) Set-ээр (мөр бүрд
   `includes` нь урт мужид хуудсыг гацаадаг байв). Хоосон = бүгд. */
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
/* ⚠️ 2026-09-30: getter — хэл солиход дахин ачаалалгүй орчуулагдана (i18nLazy.check) */
const DIM_LABEL: Record<Dim2, string> = {
  get pkg() { return tr('Багц'); },
  get co() { return tr('Компани'); },
  get incType() { return tr('Ослын төрөл'); },
  get cause() { return tr('Шалтгаан'); },
  // ⚠️ `co`-той ялгаж нэрлэнэ: хоёулаа компанийг заадаг ч ӨӨР эх сурвалжаас
  //    (`co` = ажилтны маягтын багана, энэ нь ослын бүртгэлийн чөлөөт текст).
  //    Хоёулаа зэрэг идэвхтэй байж болох тул чип дээр ялгарах ёстой.
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
   *
   * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): долоо хоногийн KPI нь хуудас нээгдэх
   *    агшинд НЭГ удаа бодогддог тул Даваа гараг дамжсан ч таб нээлттэй бол ӨМНӨХ
   *    долоо хоногийн оноо хэвээр үлддэг байв. Одоо `weekKey` (`prevWeek().start`)
   *    солигдмогц шинэ долоо хоногийг татна; таб буцаж харагдахад шууд шалгана.
   *    «Сүүлийн тайлан»-ы хуучирсан хоног, явагдаж буй сар ч энэ цагаас.
   * ⚠️ `Date.now()` render дотор БИШ — зөвхөн анхны утга (lazy) ба эффект дотор
   *    (react-hooks/purity; `Iot.tsx`-ийн ижил загвар).
   */
  const [now, setNow] = useState(() => Date.now());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 60_000);
    const poll = setInterval(() => { if (!document.hidden) setTick((t) => t + 1); }, 5 * 60_000);
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
  /* ⚠️ 2026-10-06 (аудит): үндсэн 3 хүснэгт мөн `tick`-ээр ДАХИН татагдана — урьд нь
     `useAsync(loadHabea, [])` хуудас нээгдэх агшинд НЭГ л удаа ажилладаг байсан тул
     дээрх «5 мин тутам дахин татна» гэсэн тайлбартай зөрж, нээлттэй таб өдөржин хуучин
     осол/ажиллах хүчийг харуулдаг байв. `loadHabea`-ийн кэшийн TTL (5 мин) нь poll-той
     ижил тул 5 минутын tick бүр сүлжээнд хүрнэ; таб буцаж харагдах үеийн tick нь TTL
     дотор бол кэшээс шууд (дэмий хүсэлтгүй). `keepOn: [tick]` — хуучин утга дэлгэцэд
     үлдэж анивчихгүй, алдвал `error` руу шилжинэ. */
  const q = useAsync<HabeaData>(loadHabea, [tick], { keepOn: [tick] });
  const weekKey = prevWeek(new Date(now)).start.getTime();
  /* Өмнөх долоо хоногийн оноо — (талбай × компани) нүд, шүүлт нь санах ойд.
     ⚠️ `keepOn: [tick]` — 5 минутын дахин таталтад хуучин оноо дэлгэцэд үлдэнэ
     (анивчихгүй); долоо хоног солигдоход (`weekKey`) «…» гарч шинээр татна. */
  const weekScores = useAsync(() => loadWeekScores(new Date(now)), [weekKey, tick], { keepOn: [tick] });
  /* «Бусад үзүүлэлт» — ХАБ-ын бүртгэлүүд (2026-10-08). Долоо хоног солигдоход (`weekKey` —
     Даваа гараг) шинээр, 5 минутын `tick`-д хуучин утга дэлгэцэд үлдэнэ. */
  /* ⚠️ 2026-10-09: `now`-оор (UB долоо хоног) — кэш нь долоо хоногийн эхлэлээр түлхүүрлэгдэнэ */
  const regs = useAsync(() => loadHabeaRegisters(new Date(now)), [weekKey, tick], { keepOn: [tick] });
  /* Бүртгэл оруулах (2026-10-08) — ЗӨВХӨН `habeaData` эрхтэйд «+ Нэмэх»; бусдад карт энгийн */
  const { user } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((n) => n + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- capN: эрх шинэчлэгдэхэд дахин бодно
  const canEnter = useMemo(() => hasCap(user?.username, 'habeaData'), [user, capN]);
  const [entry, setEntry] = useState<null | 'reg' | 'waste'>(null);
  /* «Хог хаягдал» (2026-10-08) — рейстэй төрлүүд, хуудасны «Багц» шүүлтийг дагана */
  /* ⚠️ 2026-10-09: ЗӨВХӨН өмнөх бүтэн долоо хоног («Бусад үзүүлэлт»-тэй ижил) — долоо хоног солигдоход шинээр */
  const waste = useAsync(() => loadHabeaWaste(new Date(now)), [weekKey, tick], { keepOn: [tick] });
  /* ⚠️ 2026-10-09 (аудит): «Хог хаягдал» давхарга мөр нэмэхийг зөвшөөрдөг эсэх (метадатын `Create`) */
  const isSuperUser = roleForUser(user?.username) === 'super';
  /* ⚠️ 2026-10-09 (аудит №2): `Create`-гүй үед л (super биш) AGOL-ийн байгууллагын админ эсэхийг асууна
     (`loadIsOrgAdmin` — `community/self`.role) — админ «Enable editing» унтраалттай ч бичдэг тул товч идэвхтэй */
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
  /* ⚠️ 2026-10-09: `measured` — шүүлтэд орсон ХЭМЖИЛТТЭЙ нүд байгаа эсэх. Хэмжилтгүй бол «0 рейс» биш
     «бүртгэл алга» (`null ≠ 0`; `byPkg`-д хоосон нүд орохгүй — `habeaRegisters.fetchWaste`). */
  const { wasteSlices, wasteMeasured } = useMemo(() => {
    if (waste.state !== 'ready') return { wasteSlices: [], wasteMeasured: false };
    let measured = false;
    const slices = HABEA.waste.kinds.map((k) => {
      const row = waste.data.rows.find((r) => r.metric === k.metric);
      let value = 0;
      for (const [name, v] of Object.entries(row?.byPkg ?? {})) {
        if (pkgs.length && !pkgs.includes(habeaPkgKey(name))) continue;
        measured = true;
        value += v;
      }
      return { key: k.metric, label: k.label, value, color: k.color };
    });
    return { wasteSlices: slices, wasteMeasured: measured };
  }, [waste, pkgs]);
  const wasteTotal = wasteSlices.reduce((acc, x) => acc + x.value, 0);
  const [cos, setCos] = useState<string[]>([]);
  const [picked, setPicked] = useState<{ id: string; attrs: Record<string, unknown> } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  /**
   * ОСЛЫН ЧАРТУУД НЭЭЛТТЭЙ ЭСЭХ — АНХНААСАА ХААЛТТАЙ (2026-09-06,
   * хэрэглэгчийн хүсэлт).
   *
   * ⚠️ Зүүн багана нь БҮХЭЛДЭЭ ослын аналитик байсан тул хуудас нээхэд
   * хамгийн түрүүнд осол харагддаг байв. Хэрэглэгч тэр байрлалд ӨӨР ХОЁР
   * эх сурвалж нэмэхээр төлөвлөж байгаа тул багана нь ХООСОН эхэлж,
   * ослыг зөвхөн товч дарж нээнэ.
   *
   * ⚠️ Чартуудыг БҮРМӨСӨН УСТГААГҮЙ — хөндлөн шүүлтийн хэмжээсүүд
   * (`sel.incType`, `sel.cause`) тэдгээрээр дамжин ажилладаг хэвээр.
   * Хаалттай үед ч газрын зураг дээрх ослын давхарга, KPI-ийн «Осол,
   * зөрчил» тоо, доод зурвасын ослын хоёр карт ХЭВЭЭР харагдана.
   */
  /**
   * ФОКУС — АЛЬ өгөгдлийн самбар нээлттэй вэ (2026-09-06, хэрэглэгчийн
   * хүсэлт). `null` = ХУУДАСНЫ АНХНЫ харагдац.
   *
   * ⚠️ Нэг л сонголт: шүүлтүүр дарахад ТУХАЙН өгөгдлийн чартууд үлдэж,
   * бусад нь БҮГД нуугдана (баруун талын краны багана ч мөн). Хоёрыг зэрэг
   * нээвэл «зөвхөн тухайн мэдээлэл» гэсэн шаардлага утгаа алдана.
   *
   * ⚠️ `'labor'` нь анхны харагдацтай ИЖИЛ чарт харуулна — ялгаа нь
   * краны багана нуугдахад. Энэ нь давхардал БИШ: анхны харагдац бол
   * «бүх зүйлийн тойм», фокус бол «зөвхөн хүн хүч».
   */
  type Focus = 'inc' | 'labor' | 'v11' | 'guitsetgegch' | null;
  const [focus, setFocus] = useState<Focus>(null);

  /** Ослын чартууд нээлттэй эсэх — олон газар шалгагддаг тул тусад нь */
  const incOpen = focus === 'inc';
  /** «Техник болон хүн цаг» фокус — сарын чарт хажуу талд, өдрийнх доор */
  const laborFocus = focus === 'labor';
  /**
   * ӨДРИЙН ЦУВАА доод зурваст гарах эсэх.
   *
   * ⚠️ Анхны харагдац ба хүн хүчний фокус ХОЁУЛАНД гарна. Ялгаа нь зөвхөн
   * алхмын шилжүүлэгчид: анхны харагдацад тэр картууд өдөр↔сар сэлгэдэг,
   * фокуст сарын өгөгдөл ХАЖУУГИЙН баганад тусдаа чарт болж гарсан тул
   * сэлгэх зүйл үлдэхгүй.
   */
  const laborOpen = focus === null || laborFocus;
  const uzlegKind: UzlegKind | null =
    focus === 'v11' || focus === 'guitsetgegch' ? focus : null;
  /* ⚠️ Залхуу ачаалалт: фокус үзлэг рүү орсон үед л татна */
  const uz = useUzleg(uzlegKind);
  /**
   * ХОЁР МАЯГТ ЗЭРЭГЦЭЭ (2026-09-17, хэрэглэгчийн хүсэлт) — «Захиалагчийн
   * ажлын байрны үзлэг» фокуст зүүн талд V1.1, баруун талд захиалагчийн
   * маягт ИЖИЛ чартуудаар. Гүйцэтгэгчийн маягтын фокус ганц эх сурвалжтай
   * хэвээр.
   *
   * ⚠️ Чартын СОНГОЛТ (`uzSel`) хоёр талд НЭГ: зэрэг, ээлж, долоо хоног дарахад
   * хоёр маягт ИЖИЛ нөхцлөөр шүүгдэж шууд харьцуулагдана.
   */
  const dual = focus === 'v11';
  const uz2 = useUzleg(dual ? 'zahialagch' : null);
  /** Зүүн багана агуулгатай эсэх — торны баганын тоог шийднэ */
  /**
   * ⚠️ АНХНЫ ХАРАГДАЦАД ч ҮНЭН (2026-09-06): «Монгол, гадаад» донат тийш
   * зөөгдсөн тул зүүн багана хоосон байхаа больсон. Өөрөөр хэлбэл одоо
   * БҮХ горимд агуулгатай — хувьсагчийг үлдээв, ирээдүйд хоосон горим
   * нэмэгдэж болно.
   */
  const listOpen = true;
  /**
   * БАРУУН багана агуулгатай эсэх.
   *
   * ⚠️ Чартуудыг ЗУРГИЙН ЭРГЭН ТОЙРОНД тараана (2026-09-06, хэрэглэгчийн
   * хүсэлт: «нэг дэлгэцээр»). Бүгдийг зүүн баганад овоолвол тэр нь дотроо
   * гүйлгэгддэг болж, доод картууд дэлгэцээс гарна. Тиймээс горим бүрд
   * багана бүрд ХАМГИЙН ИХДЭЭ ХОЁР карт:
   *
   *   анхны  → баруун: кран (3 карт — түүхэн зохиомж, хэвээр)
   *   осол   → зүүн: 2 донат · баруун: дэлгэрэнгүй жагсаалт · доод: 2
   *   үзлэг  → зүүн: 2 · баруун: 2 · доод: 1
   *   хүн хүч → зөвхөн доод: 2 (цуваа нь ӨРГӨН хэрэгтэй тул баганад орохгүй)
   */
  /**
   * ⚠️ Одоо БҮХ горимд баруун багана агуулгатай:
   *   анхны  → кран · осол → дэлгэрэнгүй жагсаалт
   *   үзлэг  → гүйцэтгэгч/талбай · хүн хүч → САРЫН хоёр цуваа
   * Хувьсагчийг үлдээв: ирээдүйд агуулгагүй горим нэмэгдэж болно.
   */
  const rOpen = true;
  /* ⚠️ `finOpen` ХАСАГДЛАА: горим бүрд доод зурваст ядаж нэг карт
     байдаг болсон (үзлэг 1, бусад 2) тул нөхцөл нь ҮРГЭЛЖ үнэн байв. */

  /**
   * ХҮН ХҮЧНИЙ ЦУВААНЫ АЛХАМ — өдөр эсвэл сар (2026-09-06, хэрэглэгчийн
   * хүсэлт). Сарын хоёр карт тусдаа байсныг ӨДРИЙНХӨӨ картад давхарлаж,
   * гарчгийн хажуугийн шилжүүлэгчээр сольдог болгов.
   *
   * ⚠️ Хоёр карт ТУСДАА төлөвтэй, нийтлэг БИШ: нэгийг дархад нөгөө нь
   * хамт үсрэх нь хэрэглэгчийн хүсээгүй өөрчлөлт болно. Ажилтныг сараар,
   * техникийг өдрөөр зэрэг харах нь бүрэн хүчинтэй хослол.
   */
  const [ajiltanStep, setAjiltanStep] = useState<'day' | 'month'>('day');
  const [tehnikStep, setTehnikStep] = useState<'day' | 'month'>('day');

  /* ⚠️ Алхмын шилжүүлэгч БҮХ горимд ажиллана: 2026-09-06-нд хажуугийн
     баганууд сарын цуваанаас бүрэлдэхүүн/компани руу солигдсон тул доод
     зурваст өдөр↔сар сэлгэх нь давхардал үүсгэхээ больсон. */
  const aStep = ajiltanStep;
  const tStep = tehnikStep;
  /**
   * ХҮЧИНТЭЙ БАГЦУУД — ЗӨВХӨН багцтай эх сурвалжид (осол, кран, газрын
   * зургийн гурван давхарга). `null` = шүүлтгүй.
   *
   * ⚠️ Компани сонгосон бол ТҮҮНИЙ багцаар дамжина (гүйцэтгэгч ↔ багц 1:1).
   * Багц ба компани ХОЁУЛАА сонгогдвол ОГТЛОЛЦОЛ («ба») — нэгдлийг авбал
   * «Багц 1» + «Монкон» гэж сонгоход Монконы бус Багц 1-ийн осол ч орж,
   * хэрэглэгчийн хүссэнээс илүү мөр гарна. Огтлолцол хоосон бол ХООСОН
   * олонлог (`size 0`) — шүүлтүүрийн мөрөнд ил анхааруулна.
   *
   * ⚠️ Сонгосон компаниудын АЛЬ Ч багцгүй бол компанийн шүүлт эдгээр эх
   * сурвалжид үйлчлэхгүй (өмнөх нэг сонголттой хувилбарын ижил дүрэм).
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
   *
   * ⚠️ 2026-09-06-нд илэрсэн цоорхой: багц сонгоход осол, кран, газрын
   * зургийн давхаргууд шүүгддэг байсан ч АЖИЛТАН/ТЕХНИКИЙН цуваа
   * ХӨНДӨГДӨХГҮЙ байв — тэдгээр нь ЗӨВХӨН `co`-г уншдаг. Үр дүнд
   * «Багц-2» сонгоход дээр нь тэр багцын 4 осол, доор нь БҮХ багцын
   * 228 өдрийн ажилтан зэрэг харагдаж, нэг дэлгэц дээр хоёр өөр
   * олонлогийн тоо гарч байлаа.
   *
   * ⚠️ Гүйцэтгэгч ↔ багц нь 1:1 тул буулгалт ЭРГЭЛЗЭЭГҮЙ. Багц нь аль ч
   * компанид тохирохгүй бол `null` — тэр үед хүн хүч шүүгдэхгүй нь ЗӨВ
   * (тэр багцад ажилтны багана байхгүй гэсэн үг).
   */
  /* ⚠️ 2026-09-15: ОЛОН утга. Багцаар дамжсан гүйцэтгэгчид ба шууд сонгосон
     гүйцэтгэгчдийн ОГТЛОЛЦОЛ (`pkgEff`-ийн ижил «ба» дүрэм). Сонгосон
     багцуудын аль нь ч гүйцэтгэгчгүй бол хүн хүч шүүгдэхгүй. */
  const coEff = useMemo<string[] | null>(() => {
    const c = cos.length ? cos : null;
    /* ⚠️ `string[]` ИЛ: эс бөгөөс гүйцэтгэгчийн кодын нарийн төрлөөр таамаглагдаж
       `d.includes(k)` энгийн мөрийг хүлээж авахгүй. */
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
   *
   * ⚠️ Зурган дээрх сонголтыг ЦУЦАЛНА: чартаас шүүхэд өмнөх нэг объектын
   * сонголт хүчинтэй үлдвэл хоёр шүүлт зөрчилдөж үр дүн үргэлж хоосон гарна.
   */
  /**
   * ⚠️ 2026-10-09: огнооны МУЖ идэвхтэй (`sel.day` нь мужийн өөрийн жагсаалт) үед өдрийн багана
   *    дарвал СОНГОЛТЫГ ОРЛУУЛНА (тэр өдөр л) — урьд нь мужаас нэг өдрийг ХАСЧ (шинэ массив),
   *    капсул «Бүх огноо» гэж харуулсаар 364 өдрийн шүүлт идэвхтэй үлддэг байв.
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

  /* ⚠️ `setPkg` ХАСАГДСАН (2026-09-15): унжих жагсаалт олон сонголттой болсон
     тул багцыг `MultiSelect`-ийн `onChange` шууд тавина. */

  /** Бүх шүүлт + зургийн сонголтыг нэг дор арилгана */
  const clearAll = useCallback(() => {
    setSel(NO_SEL);
    setPkgs([]);
    setCos([]);
    setPicked(null);
  }, []);

  /* ⚠️ `setCompany` ХАСАГДСАН (2026-09-15). Урьд нь гүйцэтгэгч сонгоход
     `pkg`-ийг ДАРЖ бичдэг байв (1:1 холбоо). Олон сонголтод дарж бичих нь
     хэрэглэгчийн сонгосон багцыг чимээгүй устгана — одоо хоёр жагсаалт
     ТУСДАА хадгалагдаж, холбоо нь `pkgEff`/`coEff`-д «ба» дүрмээр бодогдоно. */


  const all = q.state === 'ready' ? q.data : null;
  /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ХООСОН НООРОГ (төрөл · багц · огноо гурвуулаа
     хоосон — Survey123-д эхлүүлээд бөглөөгүй) ОСОЛД ТООЛОГДОХГҮЙ (`ceo/safety.isBlankIncident`
     — CEO самбартай НЭГ дүрэм). Урьд нь «—» төрөлтэй, огноогүй «осол» болж KPI-д ордог байв. */
  const inc = useMemo(
    () => (all ? all.incident.filter((r) => !isBlankIncident(r)).map(normIncident) : []),
    [all],
  );
  /** «Ослын дэлгэрэнгүй мэдээлэл» — бүгдийг харуулах эсэх (анхдагч: сүүлийн 6) */
  const [allInc, setAllInc] = useState(false);
  /** Ослын давтамжийн алхам — багцаар / сараар */
  const [rateStep, setRateStep] = useState<'pkg' | 'month'>('pkg');
  const cranes = useMemo(() => (all ? all.crane.map(normCrane) : []), [all]);
  /**
   * ⚠️ 2026-09-30: ӨДӨР БҮРЭЭС НЭГ ТАЙЛАН (`ceo/workforce.latestRowPerDay`). Нэг өдөрт
   *    давхар илгээсэн/засварласан мөрүүд (амьдаар 228 өдрийн 3) урьд НИЙЛБЭРЛЭГДЭЖ
   *    өдрийн цуваа, компанийн хүн-өдөр, «Нийт ажилтан/Хүн цаг/Техник» KPI давхар
   *    тоолдог байв (2026-08-21: 247 + 389 = 636; CEO самбар ба «Тайлан» 389).
   *    Хүн хүчний БҮХ дүрслэл ЭНЭ олонлогоос — `all.labor`-ийг шууд бүү хэрэглэ.
   */
  const laborRows = useMemo(() => latestRowPerDay(all ? all.labor : [], ubDayKey), [all]);
  /**
   * ОГНООНЫ МУЖ (2026-10-08, хэрэглэгч: «огноогоор шүүх шүүлтүүр нэмье»).
   * ⚠️ Шинэ шүүлтийн зам НЭМЭХГҮЙ: муж нь `sel.day`-ийг тухайн өдрүүдээр дүүргэнэ —
   * хүн хүч, осол, үзлэг, газрын зураг аль хэдийн `sel.day`-ийг дагадаг тул бүгд нэг дүрмээр.
   * ⚠️ Капсул мужийг ЗӨВХӨН өөрийн бичсэн жагсаалт `sel.day`-д хэвээр байхад харуулна —
   * чартаас өдөр дарвал (шинэ массив) муж «Бүх огноо» болж, сонголт чартынх болно.
   * ⚠️ Нэг тал хоосон: эхлэл = өгөгдлийн хамгийн эртний өдөр, төгсгөл = өнөөдөр.
   * ⚠️ 2026-10-09: эхлэл = хүн хүч · осол · (ачаалагдсан) үзлэгийн ХАМГИЙН эртний өдөр (урьд нь зөвхөн
   *    хүн хүч — хүн хүч ачаалагдаагүй үед «… хүртэл» муж ГАНЦ өдөр болж хумигддаг байв). Төгсгөл
   *    өнөөдрөөс хойш бол өнөөдөр; эхлэл > төгсгөл бол ТАТГАЛЗАНА. Өгөгдлөөс өмнөх эхлэлийг
   *    тоолохдоо `dataMin`-ээс эхэлнэ — 3700 өдрийн хязгаар СҮҮЛИЙН өдрүүдийг тайрахгүй.
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
    /* ⚠️ Түлхүүр нь UB хуанлийн өдөр (`ubDayKey`) — мужийг ХУАНЛИЙН өдрөөр, цагийн бүсгүй
       UTC арифметикаар угсарна (локал `setDate` нь DST/бүсийн зөрүүд өдөр алгасаж болно). */
    for (let t = Date.UTC(y0, m0 - 1, d0); keys.length < 3700; t += 86_400_000) {
      const k = new Date(t).toISOString().slice(0, 10);
      if (k > b) break;
      keys.push(k);
    }
    /* ⚠️ Хоосон жагсаалт = «бүгд» (`inSet`) — муж бүхэлдээ өгөгдлөөс хойш бол төгсгөлийн өдөр (мөр 0) */
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
   * ⚠️ `draft` — бичиж буй (хараахан хэрэглээгүй) утга: огнооны талбар товчлуур бүрд `onChange`
   *    өгдөг тул («0002-…» → «2026-…») хагас онтой утгыг шүүлтэд хэрэглэхгүй, 400 мс хүлээнэ.
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
  /* ⚠️ 2026-10-09 (аудит): «…осолгүй ажилласан цаг» — СҮҮЛИЙН LTI-ээс хойших хүн-цаг
     (`habeaRate.ltiFreeHours`). Урьд нь Σ `Hun_tsag` (LTI-д тэглэгддэггүй). Ослын БҮХ
     бүртгэлээс (шүүлтгүй) — KPI нь төслийн түвшний, шүүлт идэвхтэй үед «—». */
  /* ⚠️ 2026-10-09 (аудит №6): `now` төлвөөс — урьд нь 4 дэх аргумент өгөөгүй тул useMemo дотор
     `Date.now()` (react-hooks/purity; ирээдүйн LTI-ийн шалгалт минут тутмын цагтай уялдахгүй) */
  const ltiFree = useMemo(() => ltiFreeHours(laborRows, inc, ubDayKey, now), [laborRows, inc, now]);
  /**
   * ОГНООНЫ ШҮҮЛТТЭЙ хүн хүчний мөрүүд — өдөр/сарын цувааг ЭС тооцвол бүх
   * хүн хүчний дүрслэл (монгол/гадаад, компаниар) эндээс.
   * ⚠️ Өдөр/сарын цуваа нь ӨӨРӨӨ огнооны сонгогч тул ШҮҮГДЭЭГҮЙ `all.labor`-
   * оос бодогдоно (ArcGIS зан: сонгосон чарт өөрийн сонголтоор хумигдахгүй).
   * ⚠️ `laborState` ба сонголтын жагсаалтууд мөн шүүгдээгүйгээс — удирдлага
   * тогтвортой байх ёстой.
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
   *
   * ⚠️ Кранг цэг [50]-ийн OBJECTID-аар танина (2026-09-06). Урьд нь
   * `Краны_дугаар`-аар холбодог байсан нь ХОЁР талаараа эвдэрдэг байв:
   *   · 50 краны 21-д дугаар NULL → «—» болж `IN ('—', …)`-д орж, Double
   *     талбарт ArcGIS 400 → шүүлт асаамагц кран + бүс давхарга зурагнаас
   *     бүхэлдээ алга болдог;
   *   · 1–7 дугаар гурван багцад давтагддаг → «Багц 2» шүүхэд зураг дээр
   *     3.2 ба 3.3-ын кран ч үлдэж, KPI-тай зөрдөг; нэг кран дарахад 3 кран
   *     сонгогддог.
   * Бүс [51] нь `ORIG_FID` = цэгийн OBJECTID (амьдаар 50/50 таарсан) тул бүс
   * дарахад ч цэгийн түлхүүрт хөрвүүлнэ — аюулгүйн бүс кранаа ЯГ дагана.
   */
  const pickOsol = picked?.id === 'habea:osol' ? nn(picked.attrs['objectid']) : 0;
  /* ⚠️ 2026-09-15: «осол БИШ бол кран» гэж ҮЗЭХГҮЙ — үзлэгийн давхарга нэмэгдсэн
     тул үзлэг дарахад краны шүүлт андуурч асах байв. Төрөл бүрийг ИЛ шалгана. */
  const pickCraneOid = picked && (picked.id === 'habea:crane' || picked.id === 'habea:buffer')
    ? nn(picked.id === 'habea:buffer' ? picked.attrs[C.bufferLink] : picked.attrs[C.oid])
    : 0;
  /* ⚠️ OBJECTID нь маягт БҮРТ 1-ээс эхэлдэг — хоёр маягт зэрэг байхад
     «oid 5» аль маягтынх болохыг ДАВХАРГААР нь ялгана, эс бөгөөс V1.1-ийн
     цэг дарахад захиалагчийн маягтын 5-р үзлэг шүүгдэнэ. */
  const pickUzZ = picked?.id === HABEA_UZLEG_LAYER_ID.zahialagch;
  const pickUzOid = picked
    && (picked.id === HABEA_UZLEG_LAYER_ID.v11 || picked.id === HABEA_UZLEG_LAYER_ID.guitsetgegch
      || pickUzZ)
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

  /* Шүүгдсэн олонлогууд — БҮХ дүрслэл эдгээрээс тоологдоно.
     ⚠️ `useMemo` нь дүрслэлийн хурдны төлөө БИШ, ЛАВЛАГААНЫ ТОГТВОРТОЙ БАЙДЛЫН
     төлөө: доорх `layerWhere` эдгээрээс хамаардаг бөгөөд рендер бүрт шинэ
     массив үүсвэл газрын зураг `definitionExpression`-оо дахин дахин тавина. */
  /**
   * ОСЛЫН МӨР ШҮҮЛТЭЭР ГАРАХ УУ — `except` хэмжээсийг ТООЦОХГҮЙ.
   * ⚠️ ArcGIS Dashboard-ын зан: сонголт хийсэн чарт ӨӨРӨӨ шүүгдэхгүй, бүх
   * ангиллаа харуулсаар сонгосон нь тодорно. Урьд нь «Унах» дармагц төрлийн
   * донат ганц зүсмэг болж хумигддаг тул хоёр дахь төрөл нэмэх боломжгүй байв.
   */
  const incPass = useCallback((x: Inc, except?: SelDim | 'pkg') =>
    (except === 'pkg' || !pkgEff || pkgEff.has(x.bagtsK))
    && (except === 'incType' || inSet(sel.incType, x.type))
    && (except === 'cause' || inSet(sel.cause, x.cause))
    && (except === 'incCompany' || inSet(sel.incCompany, x.company))
    /* ⚠️ Огнооны сонголт идэвхтэй бол огноогүй осол ГАРАХГҮЙ — «аль өдрийнх
       нь мэдэгдэхгүй»-г сонгосон өдөрт хамааруулж болохгүй. */
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
   * ⚠️ Чартын сонголтыг ЭНД хэрэглэхгүй: самбар бүр `uzPass`-аар «өөрийгөө
   * хассан» олонлогоо бодно (ArcGIS зан).
   * ⚠️ Дарсан үзлэг нь ЗӨВХӨН үзлэгийн самбарыг шүүнэ — осол, кран
   * хөндөгдөхгүй (ослын цэг дарахтай ижил хамрах хүрээ).
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
   * ⚠️ Шүүлт идэвхгүй бол `null` — давхарга бүтнээрээ. Идэвхтэй боловч юу ч
   * тохирохгүй бол `1=0` — давхаргыг ХООСЛОНО, бүтнээр нь үлдээхгүй.
   */
  /* ⚠️ 2026-09-25: цэгийн сонголт (`pickUzOid`) нь АЛЬ маягтынх вэ гэдгийг
     `pickUzZ` заана (`uzF`/`uzF2`-ийн дүрэм). Урьд нь хоёр шүүлт хоёулаа
     `pickUzOid`-ыг «идэвхтэй» гэж үзэж, нэг маягтын цэг дарахад нөгөө
     маягтын давхарга ч IN-жагсаалтаар шүүгдэж, зураг буруу муж руу
     ойртдог байв. */
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
   *
   * ⚠️ `visible`-ийг ӨӨРЧЛӨХГҮЙ, зөвхөн ГАРАЛТ дээр давхарлана: фокусаас гармагц
   * хэрэглэгчийн каталогийн сонголт бүтнээрээ сэргэнэ (`DedButets.mapVisible`-ийн ижил).
   */
  const mapVisible = useMemo(() => {
    const uzIds = [...(uzLayerId ? [uzLayerId] : []), ...(uzLayerId2 ? [uzLayerId2] : [])];
    /* ⚠️ 2026-09-21: ослын фокуст `habea:osol`-ыг ЗААВАЛ харуулна (үзлэгтэй
       ижил дүрэм) — урьд нь каталогт унтраасан бол фокус ХООСОН зурагтай гардаг байв. */
    if (focus === 'inc') return ['habea:osol'];
    if (uzlegKind) return uzIds;
    return visible;
  }, [visible, focus, uzlegKind, uzLayerId, uzLayerId2]);

  const layerWhere = useMemo(() => {
    /* ⚠️ 2026-09-21: `uzWhere2` (захиалагчийн 2 дахь маягт) мөн нөхцөлд —
       урьд нь зөвхөн тэр шүүлт идэвхтэй үед `undefined` буцаж, зураг шүүгдэхгүй байв. */
    if (!incOn && !craneOn && !uzWhere && !uzWhere2) return undefined;
    // ⚠️ Хоосон жагсаалт = `1=0`: тухайн шүүлтэд юу ч тохирохгүй бол давхаргыг
    //    БҮТНЭЭР нь харуулах биш, ХООСЛОНО.
    const ids = fInc.map((x) => x.oid);
    const osol = incOn ? (ids.length ? `objectid IN (${ids.join(',')})` : '1=0') : null;
    /* ⚠️ Тоон OBJECTID — `sqlStr`-ээр хашилтлахгүй (Double/OID талбарт
       мөрөн утга 400 өгдөг). `oid === 0` (талбар алга) мөрийг хасна. */
    const oids = fCrane.map((x) => x.oid).filter((o) => o > 0);
    const kran = craneOn
      ? (oids.length ? `${C.oid} IN (${oids.join(',')})` : '1=0')
      : null;
    const buff = craneOn
      ? (oids.length ? `${C.bufferLink} IN (${oids.join(',')})` : '1=0')
      : null;
    const out: Record<string, string | null> = { 'habea:osol': osol, 'habea:crane': kran, 'habea:buffer': buff };
    if (uzLayerId) out[uzLayerId] = uzWhere;
    if (uzLayerId2) out[uzLayerId2] = uzWhere2;
    return out;
  }, [incOn, craneOn, fInc, fCrane, uzLayerId, uzWhere, uzLayerId2, uzWhere2]);

  /* Өдөр тутмын цувааnууд — сонгосон гүйцэтгэгчийг дагана */
  const byDay = useMemo(() => byDaySeries(laborRows, coEff, 'niitAjiltan'), [laborRows, coEff]);
  const techDay = useMemo(() => byDaySeries(laborRows, coEff, 'niitTehnik'), [laborRows, coEff]);
  /**
   * Цуваа нь ХУУЧНААС шинэ рүү өснө. Гүйлгэгчийг ТӨГСГӨЛД нь тавьж хамгийн
   * сүүлийн өдрүүдийг шууд харуулна — хэрэглэгч эхлээд «одоо юу болж байна»-г
   * харах ёстой, хагас жилийн өмнөх мөрийг биш.
   *
   * ⚠️ Энэ нь төлөв БИШ, DOM-ын гүйлгэлт тул `useEffect`-д бичихэд зөв.
   * Гүйцэтгэгч солиход цувааны урт өөрчлөгддөг тул хамаарал нь түүний урт.
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
    /* ⚠️ Алхам солиход ч дахин ажиллана: сарын цуваа өөр урттай тул
       өмнөх гүйлгэлтийн байрлал утгагүй болно. */
    /* ⚠️ 2026-09-21: `laborOpen` мөн хамаарал — ослын/үзлэгийн фокусаас
       буцахад доод зурвас ДАХИН mount болж (`{laborOpen && …}`) ref шинэ
       элемент авдаг ч урт/алхам өөрчлөгдөөгүй тул эффект ажиллахгүй, цуваа
       хамгийн ЭРТНИЙ өдрүүд рүү гүйлгэгдсэн харагддаг байв. */
  }, [byDay.length, techDay.length, ajiltanStep, tehnikStep, laborFocus, laborOpen]);

  /**
   * Шүүлт солигдоход зураг тэр объектууд руу нисэнэ (irgediin-hurteemj).
   * ⚠️ Хөндлөн шүүлтийн `layerWhere`-ээс ослын WHERE-ийг өгнө — шүүлтгүй бол
   * бүсээр, тэр ч байхгүй бол бүтэн хүрээ.
   */
  /* ⚠️ 2026-09-15: урьд нь ЗӨВХӨН ослын шүүлт рүү нисдэг байв — краны төлөв
     эсвэл үзлэгээр шүүхэд зураг хөдлөхгүй. Одоо идэвхтэй шүүлтийн давхарга
     руу: үзлэг (фокус нээлттэй үед) → осол → кран. */
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
   *
   * ⚠️ Улаан нь «хамгийн олон давтагдсан» гэсэн ГАНЦ утгыг үүрнэ. Тиймээс
   * тэргүүлэгч нь хоёр дахьтайгаа ТЭНЦВЭЛ улаан хэрэглэхгүй — тэнцүү зүйлийн
   * нэгийг онцолвол өгөгдөлд байхгүй ялгааг зохиосон болно.
   * ⚠️ `incByCause` нь шалтгаан тэмдэглэгдсэн бүртгэлийг Л тоолдог тул төв дэх
   * дүн нь нийт ослын тооноос (17) БАГА байж болно — гарчигт ил бичнэ.
   */
  const causeSlices = leadRed(incByCause);
  const causeTotal = incByCause.reduce((s, x) => s + x.value, 0);
  /* Хамгийн олон осол бүртгүүлсэн гүйцэтгэгч(ид) улаанаар — анхаарал татах
     ёстой тал нь эгнээг гүйлгэн уншихгүйгээр шууд харагдана. */
  const incByCompany = leadRed(countBy(inc.filter((x) => incPass(x, 'incCompany')), (x) => x.company));
  /* ⚠️ 2026-10-01: «6/17 · бүгдийг харах» — урьд нь сүүлийн 6-г л харуулж, бусад нь
     хаана байгааг хэлдэггүй байв. */
  const INC_LIST_N = 6;
  const recentAll = [...fInc].sort((a, b) => b.d - a.d);
  const recent = allInc ? recentAll : recentAll.slice(0, INC_LIST_N);

  /**
   * ОСЛЫН ДАВТАМЖ — 1 сая хүн-цагт (2026-10-01, `habeaRate`).
   * ⚠️ Хүртвэр нь `fInc` (бүх шүүлт); хуваарь нь ИЖИЛ огнооны шүүлттэй хүн хүч
   *    (`laborDated`). Багцаар нь «Багц» шүүлтгүй (өөрийн хэмжээс — ArcGIS зан).
   */
  const hourDays = useMemo(() => hoursByDay(laborDated), [laborDated]);
  const ratePkg = useMemo(() => {
    /* Шошго нь гүйцэтгэгчийн бүртгэлийн багцаас («Багц -3.1» → «Багц 3.1», `pkgOptions`-ийн дүрэм) */
    const labelOf = (k: string) => {
      const raw = HABEA.labor.companies.find((c) => c.bagts && habeaPkgKey(c.bagts) === k)?.bagts;
      return raw ? tr(habeaPkgLabel(raw.replace(/\s*-\s*/, ' ').trim())) : k;
    };
    return rateByPkg(hourDays, inc.filter((x) => incPass(x, 'pkg')), PKG_OF_CO, labelOf);
  }, [hourDays, inc, incPass]);
  const rateMonth = useMemo(
    () => rateByMonth(hourDays, fInc, {
      ymOf: (ms) => ubDayKey(ms).slice(0, 7), pkgOfCo: PKG_OF_CO, pkgs: pkgEff,
    }),
    [hourDays, fInc, pkgEff],
  );
  /* ⚠️ `lastInc` нь «Сүүлийн ослоос хойш» KPI-д хэрэглэгдэж байсныг
     2026-09-06-нд хэрэглэгчийн хүсэлтээр ХАСАВ. Сүүлийн ослын огноо нь
     ослын жагсаалтад хэвээр (эрэмбэ нь шинэ→хуучин) тул мэдээлэл
     алдагдаагүй. */

  /* Кран */
  /**
   * ⚠️ `display` нь ТООГ (хувийг БИШ) харуулна — 2026-09-06,
   * хэрэглэгчийн хүсэлт. `Donut` нь `display` өгөөгүй үед
   * зүсмэгийн эзлэх ХУВИЙГ бичдэг. 50 краны 48/2 задаргаанд «96% / 4%»
   * гэдэг нь «хэдэн кран буусан бэ» гэсэн ганц асуултад хариулахгүй —
   * хэрэглэгч тоог нь эргүүлж бодох шаардлагатай болно.
   */
  const craneStatusBase = cranes.filter((x) => cranePass(x, 'craneState'));
  const craneByStatus = countBy(craneStatusBase, (x) => x.tuluv)
    .map((x) => ({ ...x, color: CRANE_HUE[x.label] ?? 'var(--ink-3)', display: num(x.value) }));
  /**
   * ИДЭВХТЭЙ кран — `Tuluv` нь «Буусан» БИШ бүх кран.
   *
   * ⚠️ «Одоо байгаа»-г ЯГ тулгахгүй, «Буусан»-ыг ХАСНА: эх үйлчилгээнд
   * «Шинээр нэмэгдсэн» гэсэн гурав дахь утга ч гарч болзошгүй
   * (`CRANE_HUE`-д бүртгэлтэй) бөгөөд тэр нь ажиллаж байгаа кран.
   * ⚠️ ТӨЛӨВГҮЙ («—», `Tuluv` NULL) кранг ИДЭВХТЭЙД ТООЛОХГҮЙ (`null ≠ 0`):
   *    мэдээлэлгүйг «ажиллаж байгаа» гэж бичвэл харьцаа худал өснө. Тэр нь
   *    бөгжинд «—» зүсмэгээр тусдаа харагдана. Өнөөдөр 0 ийм кран.
   */
  const craneUp = fCrane.filter((x) => x.tuluv !== 'Буусан' && x.tuluv !== '—').length;
  /* ⚠️ `avgUndur` / `avgSum` (дундаж өндөр ба сумны урт) ХАСАГДАВ
     (2026-09-06, хэрэглэгчийн хүсэлт): краны төлөвийн доор гарч байсан
     «Өндөр 38.0 м · сум 47.9 м» мөр нь төлөвийн задаргаатай ямар ч
     холбоогүй хоёр дундаж байв. Тухайн краны хэмжээ нь зурган дээр
     объектыг дарахад дэлгэрэнгүйгээр гарсаар байгаа. */
  /**
   * ГҮЙЦЭТГЭГЧИЙН ШҮҮЛТҮҮРИЙН сонголтууд — бүх хугацаанд ямар нэг тоо
   * бүртгүүлсэн гүйцэтгэгчид, ажилтны нийлбэрээр эрэмбэлсэн.
   *
   * ⚠️ Сүүлийн бүртгэлээс жагсаавал тэр өдөр тайлангаа өгөөгүй компани
   * шүүлтүүрээс алга болж, өдөр бүр өөр жагсаалт харагдана — шүүлтийн
   * удирдлага ТОГТВОРТОЙ байх ёстой.
   */
  /* ⚠️ Сонголтын жагсаалт ШҮҮГДЭЭГҮЙгээс (тогтвортой), чарт нь огноотойгоос */
  const coBase = useMemo(() => companyTotals(laborRows), [laborRows]);
  const coAll = useMemo(() => companyTotals(laborDated), [laborDated]);
  const coOptions = coBase
    .filter((x) => x.ajiltan > 0 || x.tehnik > 0)
    .sort((a, b) => b.ajiltan - a.ajiltan);
  /**
   * КОМПАНИАР ХҮНИЙ ТОО — «Техник болон хүн цаг» фокусын БАРУУН чарт.
   *
   * ⚠️ НЭГЖ нь ХҮН-ӨДӨР, ажиллагсдын ТОО БИШ. `companyTotals` нь
   * компанийн баганыг БҮХ бүртгэлээр нийлбэрлэдэг тул нэг ажилтан
   * ажилласан өдөр бүрдээ дахин тоологдоно. Гарчигт «хүн-өдөр» гэж ЗААВАЛ
   * бичнэ — «Moncon 62,441 хүн» гэж уншигдвал бодит тооноос 200 дахин их.
   *
   * ⚠️ ШҮҮГДЭЭГҮЙ өгөгдлөөс: гүйцэтгэгч сонгосон үед ганц бар үлдэж чарт
   * утгаа алдана. Сонгосон нь `selected`-ээр тодорно, бусад нь бүдгэрнэ.
   */
  /**
   * КОМПАНИ БҮРИЙН МОНГОЛ/ГАДААД задаргаа — зүүн баганын доод чарт.
   *
   * ⚠️ Задаргаагүй (`mongol + gadaad === 0`) компанийг ХАСНА: 100%
   * хоосон зурвас нь «бүгд монгол» гэж ХУДАЛ уншигдана.
   *
   * ⚠️ ГАДААДЫН ХУВИАР эрэмбэлнэ, нийт тоогоор БИШ. Энэ чартын цорын ганц
   * асуулт нь «хаана гадаад ажилтан олон вэ» — том компани дээшээ гарвал
   * тэр асуулт харагдахаа болино.
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
   *
   * ⚠️ НЭГЖ нь `НЭГЖ-ӨДӨР`: маягтын `Tehnik_<SFX>` багана нь тухайн
   * ӨДӨР ажилласан техникийн тоо тул бүх бүртгэлээр нийлбэрлэхэд нэг
   * машин ажилласан өдөр бүрдээ дахин тоологдоно. «МК-д 3,192 машин байна»
   * гэж уншигдвал парк нь бодит хэмжээнээсээ хэдэн зуу дахин том болно.
   *
   * ⚠️ ЭРЭМБЭ нь ТЕХНИКЭЭР — дээрх чартын (ажилтны) дараалалтай ТААРАХГҮЙ
   * байж болно. Энэ нь санаатай: хос чарт нь «хүн олонтой нь техник ч
   * олонтой юу» гэдгийг ХАРЬЦУУЛАХ зорилготой, ижил эрэмбээр давхарлах
   * зорилгогүй.
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
   *
   * ⚠️ ШҮҮГДЭЭГҮЙ өгөгдлөөс бодно: шүүгдсэнээс бодвол багц сонгомогц
   * жагсаалт нэг мөр болж хураагдаж, өөр багц руу шилжих боломжгүй
   * болно. `coOptions`-той ижил зарчим — удирдлага ТОГТВОРТОЙ байна.
   *
   * ⚠️ Гурван эх сурвалж (осол · кран · ажилтан) бүгд өөр өөр багц
   * агуулж болно; `bagtsKey` нь бичиглэлийн ялгааг (Багц-4.1 ↔
   * «Багц 4-1») нэг түлхүүрт буулгадаг тул НЭГДЭЛ нь зөв ажиллана.
   */
  const pkgOptions = useMemo(() => {
    const m = new Map<string, string>();
    /* ЭХЛЭЭД бодит өгөгдөл — шошго нь эх сурвалжийн ЯГ бичиглэлээр гарна */
    for (const x of [...inc, ...cranes, ...labor.rows]) {
      if (x.bagtsK && !m.has(x.bagtsK)) m.set(x.bagtsK, tr(habeaPkgLabel(x.bagtsRaw)) || x.bagtsK);
    }
    /**
     * ДАРАА нь ГҮЙЦЭТГЭГЧИЙН БҮРТГЭЛ — өгөгдөлд гараагүй багцыг нөхнө.
     *
     * ⚠️ 2026-09-06-нд илэрсэн алдаа: «Багц 3.1» жагсаалтад ОГТ гардаггүй
     * байв. Тэр нь ХБТИТ-ийн багц; `laborState` нь СҮҮЛИЙН нэг
     * тайлангаас `ajiltan > 0 || tehnik > 0` гэж шүүдэг тул тэр компани
     * тухайн өдөр тоо өгөөгүй бол мөр нь бүхэлдээ унана — багц нь хамт
     * алга болно. Осол ч, кран ч тэр багцад байхгүй байсан тул нөхөх зам
     * үлдээгүй. Одоо бүртгэл нь ЖАГСААЛТЫГ баталгаажуулна: өдрийн тайлангийн
     * хэлбэлзлээс ҮЛ ХАМААРЧ бүх багц сонгогдоно.
     *
     * ⚠️ Бүртгэлийн бичиглэл нь «Багц -3.1» гэж ЗУРААСТАЙ. Шошгонд гаргахдаа
     * цэвэрлэнэ — эс бөгөөс унжих жагсаалтад ганцаараа өөр хэлбэртэй гарна.
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
  /* ⚠️ Олон сонголт: `pkgOptions` нь бүх эх сурвалжийн шошгыг аль хэдийн
     нэгтгэсэн тул тэндээс уншина. */
  const pkgLabels = pkgs.map((k) => pkgOptions.find((o) => o.key === k)?.label ?? k);
  /** Сонгосон гүйцэтгэгчийн бүтэн нэр — чипэнд богино кодын оронд гарна */
  /* ⚠️ `coEff`-ээр: багцаар шүүсэн үед ч цувааны толгойд «бүх компани»
     гэж бичигдэхгүй, тухайн гүйцэтгэгчийн нэр гарна. */
  const coName = (k: string) => HABEA.labor.companies.find((c) => c.sfx === k)?.label ?? k;
  const coLabel = coEff
    ? (coEff.length === 1 ? coName(coEff[0]) : tr('{0} компани', num(coEff.length)))
    : null;

  /**
   * ШҮҮЛТҮҮРИЙН МӨРИЙН ТАЙЛБАР — хамгийн чухлыг нь ганцыг.
   *
   * ⚠️ Огтлолцол хоосон бол ЭХЭНД: бүх чарт «Бүртгэл алга» болох бөгөөд
   * шалтгааныг нь хэлэхгүй бол хэрэглэгч «өгөгдөл алга» гэж дүгнэнэ.
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
  /* ⚠️ 2026-09-15: багц ба компани ТУСДАА чип — олон сонголтод нэгийг нь
     нөгөөгөөр төлөөлүүлж болохгүй (тусдаа жагсаалтууд). */
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
          /* ⚠️ 2026-09-21: огноогүй үзлэг (`d: 0`) — «1970.01.01» биш «огноогүй» */
          ? (pickUzRow ? `${incDate(pickUzRow.d)} · ${pickUzRow.site}` : `#${pickUzOid}`)
        /* ⚠️ Дугааргүй кран (21/50) — «—» биш `#OBJECTID` гэж нэрлэнэ */
        : text(picked.attrs[C.dugaar], '') || `#${pickCraneOid}`,
      clear: () => setPicked(null),
    });
  }

  /**
   * БАГЦ · КОМПАНИ — ОЛОН СОНГОЛТТОЙ ХОЁР КАПСУЛ.
   *
   * ⚠️ НЭГ ЭЛЕМЕНТ, ХОЁР БАЙРЛАЛ: шүүлтүүрийн мөр ба газрын зургийн
   * давхарласан самбар. Хоёр газарт тусад нь бичвэл аль нэгийн сонголтын
   * жагсаалт, шошго нь нөгөөгөөсөө хоцорно. Төлөв нь нэг (`pkgs`, `cos`)
   * тул аль газраас сонгосон нь нөгөөд шууд тусна.
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

  /* ⚠️ `uzSel`/`uzF` нь `layerWhere`-ийн ӨМНӨ memo болж шилжсэн (2026-09-15) —
     газрын зургийн шүүлт тэднээс хамаардаг бөгөөд memo-гүй бол рендер бүрт
     шинэ объект үүсч `definitionExpression` дахин дахин тавигдана. */
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
        {/* ⚠️ 2026-10-04: ШАЛТГААНЫГ хэлнэ (`friendlyError` — эрх/сүлжээ/хугацаа)
            ба `data-boot-fail` нь порталын ачаалалтын дэлгэцийг (Booting) шууд
            хаана — урьд нь энэ алдаа 12с эргэлдэгчийн АРД нуугддаг байв. */}
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

  return (
    /**
     * ⚠️ `data-list` — ЗҮҮН БАГАНА ХООСОН эсэх (2026-09-06, хэрэглэгчийн
     * хүсэлт). Ослын чартууд чипний ард нуугдсан үед тэр багана юу ч
     * агуулахгүй тул 316px-ийг дэмий эзэлж, зураг нарийсдаг байв. `0` үед
     * тор нь ХОЁР баганатай болж, зураг зүүн ирмэг рүү ТЭЛНЭ.
     *
     * ⚠️ Чип нээхэд буцаад ГУРВАН багана болно — ослын чартууд зурган дээр
     * давхарлахгүй, өөрийн баганадаа буцаж орно.
     */
    <div
      className={h.shell}
      data-list={listOpen ? '1' : '0'}
      data-r={rOpen ? '1' : '0'}

      style={panes.styleFor("l", "r", "fin")}
    >
      {/* ── KPI зурвас — бүтэн өргөн, зургаан үзүүлэлт ── */}
      <div className={h.kpi}>
        {/* ── Эхний ГУРВАН үзүүлэлт нь ТӨСЛИЙН ЭХНЭЭС хуримтлагдсан нийлбэр
            (маягтын толгойн `Niit_ajiltan` · `Hun_tsag` · `Niit_tehnik`) — бүх
            бүртгэлээр нийлүүлсэн.

            ⚠️ ЭДГЭЭР НЬ ӨДРИЙН ТОО БИШ. «Нийт ажилтан» нь 213 өдрийн ажилтны
            тооны НИЙЛБЭР тул нэг ажилтан ажилласан өдөр бүрдээ дахин тоологдсон
            (хэмжих нэгж нь үнэндээ хүн-өдөр). Тухайн ӨДРИЙН бодит ажилтны тоог
            «Ажилтан — өдрөөр» цуваанаас харна. Шошгыг ийнхүү нэрлэхээр
            захиалагч шийдсэн — тоог өөрчлөхөөс өмнө үүнийг мэд.

            Толгойн талбар компаниар задардаггүй тул шүүлт идэвхтэй үед «—». */}
        {/* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): «Сүүлийн тайлан: {огноо}» + хуучирсан
            анхааруулга (`ceo/workforce.laborStaleness` — CEO самбарын `WORKFORCE_STALE_DAYS`
            босготой НЭГ). Урьд нь тайлан хэдэн өдөр зогссон ч KPI хэвээр «шинэ» харагддаг байв. */}
        {((st) => kpiTile(KPI_LOOK.people,
          pkgs.length || cos.length || sel.day.length || sel.month.length ? '—' : num(labor.cum.ajiltan),
          tr('Нийт ажилласан хүн хүч'),
          undefined,
          /* ⚠️ 2026-10-08 (хэрэглэгч): ердийн «Сүүлийн тайлан: огноо» мөр ХАСАГДАВ. Тайлан
             ХУУЧИРСАН үед л анхааруулга гарна — эс бөгөөс зогссон тайланг «шинэ» гэж уншина. */
          labor.asOf == null || !st.stale
            ? undefined
            : tr('Сүүлийн тайлан: {0} · {1} хоног шинэчлэгдээгүй', date(labor.asOf), num(st.days ?? 0)),
          undefined,
          st.stale,
        ))(laborStaleness(labor.asOf, now))}
        {kpiTile(KPI_LOOK.hours,
          pkgs.length || cos.length || sel.day.length || sel.month.length || ltiFree.hours == null ? '—' : num(ltiFree.hours),
          tr('Хөдөлмөрийн чадвар түр алдсан осолгүй ажилласан цаг'),
          undefined,
          /* ⚠️ 2026-10-09: ирээдүйн огноотой ХЧТА (`futureLti`) тооцоонд ороогүйг ил хэлнэ */
          [
            ltiFree.undatedLti
              ? tr('Огноогүй ХЧТА осол бүртгэгдсэн — тооцох боломжгүй')
              /* ⚠️ 2026-10-08 (хэрэглэгч): ердийн «Сүүлийн ХЧТА осол: огноо» мөр ХАСАГДАВ — анхааруулга (огноогүй / ирээдүйн) л үлдэнэ */
              : '',
            ltiFree.futureLti > 0 ? tr('{0} ХЧТА осол ирээдүйн огноотой — тооцоонд ороогүй', num(ltiFree.futureLti)) : '',
          ].filter(Boolean).join(' · ') || undefined,
          undefined,
          ltiFree.undatedLti,
        )}
        {kpiTile(KPI_LOOK.tech, pkgs.length || cos.length || sel.day.length || sel.month.length ? '—' : num(labor.cum.tehnik), tr('Нийт ажилласан техникийн тоо'))}
        {/**
          * ⚠️ «ИДЭВХТЭЙ/НИЙТ» СЭРГЭВ (2026-09-04). Урьд нь ганц тоо болгож
          * хураасан шалтгаан нь ЭХ СУРВАЛЖИД байсан: test_data-гийн хуулбар
          * `Tuluv`-д бүх 50 кранг «Одоо байгаа» гэж бичсэн тул харьцаа
          * үргэлж 50/50 гарч утгагүй байв. Эх үйлчилгээ рүү шилжсэнээр
          * «Буусан» кран ялгарах болсон тул харьцаа дахин утгатай.
          *
          * ⚠️ ЯЛГАА БАЙХГҮЙ бол ГАНЦ тоо хэвээр: ирээдүйд эх сурвалж дахин
          * жигд болвол «50/50» гэсэн утгагүй заалт өөрөө арилна.
          */}
        {kpiTile(KPI_LOOK.crane,
          craneUp === fCrane.length ? num(fCrane.length) : `${num(craneUp)}/${num(fCrane.length)}`,
          tr('Кран'),
          craneUp === fCrane.length ? undefined : tr('идэвхтэй'),
          undefined,
          craneUp === fCrane.length || !fCrane.length ? null : craneUp / fCrane.length,
        )}
        {kpiTile(KPI_LOOK.inc, num(fInc.length), tr('Осол, зөрчил'))}
        {/**
          * ӨМНӨХ БҮТЭН ДОЛОО ХОНОГИЙН ДУНДАЖ ОНОО (2026-09-17, хэрэглэгчийн хүсэлт).
          * Дүрэм, тооцоо: `habeaUzleg.prevWeek` ба `loadWeekScore`.
          *
          * ⚠️ 2026-09-17: «Багц» ба «Компани» шүүлтийг ДАГАНА (урьд нь «—» болдог
          * байв) — `weekScoreOf` нь (талбай × компани) нүдээр шүүнэ.
          * ⚠️ Оноо бүртгэгдээгүй бол «—» (`null`), 0% БИШ.
          */}
        {/* ⚠️ 2026-09-25: АЛДАА ≠ ХООСОН — урьд нь ачаалж буй, унасан, оноо
            бүртгэгдээгүй гурвуулаа «—» байсан тул үйлчилгээ унахад «оноо алга»
            гэж уншигддаг байв. Ачаалалт «…», алдаа нь доод мөрөнд ил. */}
        {/* ⚠️ 2026-10-08 (хэрэглэгч): өнгө нь ОНООГООР — <70 улаан · 70–90 улбар шар · ≥90 ногоон
            (`scoreColor`, «Ажлын байрны үзлэг» чарттай НЭГ дүрэм). Оноогүй үед анхдагч ногоон. */}
        {kpiTile(((v) => (v == null ? KPI_LOOK.score : { ...KPI_LOOK.score, tone: scoreColor(v) }))(
            weekScores.state === 'ready' ? weekScoreOf(weekScores.data.rows, pkgs, cos).pct : null),
          weekScores.state === 'loading'
            ? '…'
            : weekScores.state !== 'ready'
              ? '—'
              : ((v) => (v == null ? '—' : pct(v, 0)))(weekScoreOf(weekScores.data.rows, pkgs, cos).pct),
          /* ⚠️ ДЭЭД мөр = эх сурвалж, ДООД мөр = хугацаа (2026-09-17, хэрэглэгчийн
             хүсэлт). V1.1 бол ЗАХИАЛАГЧИЙН маягт — гүйцэтгэгчийнхөөс ялгах нь
             чухал, учир нь гүйцэтгэгчийн маягтад оноо огт бүртгэгддэггүй. */
          tr('Захиалагчийн ажлын байрны үзлэг'),
          undefined,
          /* ⚠️ 2026-10-08 (хэрэглэгч): «· N үзлэг» (түүврийн хэмжээ, 2026-10-01) ХАСАГДАВ. */
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



      {/* ── ЗҮҮН багана: осол зөрчлийн аналитик ──
          ⚠️ АНХНААСАА ХООСОН. Дээд талын товч дарж ослын чартуудыг нээнэ;
          үлдсэн зай нь ирэх ХОЁР эх сурвалжид ЗОРИУЛЖ хоосон үлдээгдсэн
          (2026-09-06, хэрэглэгчийн хүсэлт) — энд түр дүүргэлт БҮҮ нэм. ── */}
      {/* ── ЗҮҮН багана ── ХООСОН.
          ⚠️ Сарын хоёр карт эндээс ХАСАГДАВ (2026-09-06): одоо өдрийн
          картуудынхаа дотор алхмын шилжүүлэгчээр гардаг. Энэ зай нь
          хэрэглэгчийн өгөх ХОЁР шинэ эх сурвалжид зориулж ХООСОН
          үлдээгдсэн — түр дүүргэлт БҮҮ нэм. ── */}
      <div className={h.list} ref={listRef}>
        {/* ⚠️ 2026-10-07: карт хоорондын хэвтээ бариул — дээд картын өндрийг томруулна, байгалийнхаас
            доош жижигрэхгүй (чарт бүтэн). Горим (`focus`) бүр өөрийн хадгалалттай. */}
        <HabeaCardGrips target={listRef} id={`l-${focus ?? 'all'}`} />
        {/* ── ЗҮҮН БАГАНЫН ХҮН ХҮЧНИЙ ХОС — бүрэлдэхүүн ба түүний задаргаа ──

            АНХНЫ харагдац ба «Техник болон хүн цаг» фокус ХОЁУЛАНД гарна
            (2026-09-06, хэрэглэгчийн хүсэлт). Хоёр горимд ижил байх нь
            санаатай: шүүлтүүр дарахад зүүн тал ӨӨРЧЛӨГДӨХГҮЙ, зөвхөн
            баруун ба доод хэсэг л солигдоно.

            ⚠️ Задаргаа нь маягтад ӨДӨР БҮР бөглөгддөггүй тул нийлбэр нь
            «Нийт ажилтан» KPI-тай ТЭНЦЭХГҮЙ — тэмдэглэлийн тоо нь ЭНЭ
            донатын өөрийн нийлбэр, KPI-гийнх биш.

            ⚠️ Донат урьд нь баруун талын краны баганад байсныг 2026-09-06-нд
            ЭНД зөөв; тэнд одоо БАЙХГҮЙ тул давхардал үүсэхгүй. ── */}
        {(focus === null || laborFocus) && (<>
        {/* ⚠️ «Монгол, гадаад» донат 2026-10-07-нд ХАСАГДАВ (хэрэглэгчийн хүсэлт) — задаргаа нь
            «Компаниар — монгол, гадаад» ба «Ажилтан — өдрөөр»-ийн муруйд бий. */}
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
            /* ⚠️ 2026-10-09 («бүх графикийн загварыг жигдлэх»): гар хийцийн мөр → порталын
               `Bars` (2px, `--chart-track`, hover `useTip`). Эх сурвалжгүй мөр (`week` null)
               дүүргэлтгүй + «—»; тайлбар нь `title`-ийн оронд hover-ийн мөрөнд. */
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
                    hint: r.week == null ? tr('Эх сурвалж холбогдоогүй') : undefined,
                  }))}
                />
              </div>
            );
          })()}
        </Section>
        )}
        {/* ── ХОГ ХАЯГДАЛ (2026-10-08) — «Бусад үзүүлэлт»-ийн ДООР, эхний харагдацад.
            ⚠️ Зөвхөн «рейс» нэгжтэй төрлүүд: kg, m3 нэгжтэйг нэмбэл утгагүй нийлбэр болно. ── */}
        {focus === null && (
        <Section
          title={tr('Хог хаягдал')}
          note={(
            <>
              {/* ⚠️ 2026-10-08 (хэрэглэгч): «нийт N рейс» тэмдэглэл ХАСАГДАВ — нийт нь донатын төвд бий */}
              {/* ⚠️ 2026-10-09 (хэрэглэгч): «N-р долоо хоногийн нийлбэр» шошго ХАСАГДАВ; оронд нь
                  «Бусад үзүүлэлт»-тэй ИЖИЛ «N-р долоо хоног» */}
              {/* ⚠️ 2026-10-09 (аудит): хүснэгтэд ОН талбар алга — олон оны мөр илэрвэл (`multiYear`)
                  долоо хоногийн дугаар он ялгахгүйг ИЛ хэлнэ («…нийлбэр» шошгыг дахин нэмэхгүй) */}
              {waste.state === 'ready' && (waste.data.multiYear
                ? (
                  <span title={tr('Хүснэгтэд он, огноо талбар байхгүй — өмнөх оны ижил дугаартай долоо хоногийн мөр нийлбэрт холилдож болзошгүй.')}>
                    {tr('{0}-р долоо хоног (он ялгагдаагүй)', num(waste.data.weekNo))}
                  </span>
                )
                : tr('{0}-р долоо хоног', num(waste.data.weekNo)))}
              {/* ⚠️ 2026-10-09 (аудит): давхарга `Create`-гүй (`capabilities: "Query"`) бол эрхтэй
                  хэрэглэгчийн бичилт ч унана — товчийг хааж шалтгааныг хэлнэ. Super (ихэвчлэн
                  AGOL-ийн эзэмшигч/админ) товчтой хэвээр, анхааруулгатай.
                  ⚠️ 2026-10-09 (аудит №2): super биш ч AGOL-ийн байгууллагын админ (`wasteCan.data.admin`)
                  мөн адил — урьд нь тэдэнд товч хаалттай гардаг байв. Эзэмшигчийг шалгахгүй (нэмэлт хүсэлт). */}
              {canEnter && (wasteCan.state !== 'ready' || wasteCan.data.create !== false
                ? <> <AddButton onClick={() => setEntry('waste')} /></>
                : isSuperUser || wasteCan.data.admin
                  ? <> <AddButton onClick={() => setEntry('waste')} note={tr('Үйлчилгээнд засварлах (Create) эрх хаалттай — зөвхөн AGOL-ийн эзэмшигч/админы эрхээр бичигдэнэ.')} /></>
                  : <> <AddButton disabled note={tr('Нэмэх боломжгүй: «Хог хаягдал» үйлчилгээнд засварлах эрх хаалттай. AGOL дээр үйлчилгээний тохиргооноос «Enable editing»-ийг асаах шаардлагатай.')} /></>)}
            </>
          )}
        >
          {waste.state === 'loading' && <Loading />}
          {waste.state === 'error' && <Empty label={tr('Татагдсангүй: {0}', friendlyError(waste.error))} onRetry={waste.retry} />}
          {waste.state === 'ready' && (wasteTotal > 0
            ? <Donut items={wasteSlices} stack size="md" center={num(wasteTotal)} centerLabel={tr('нийт')} />
            /* ⚠️ Бүгд 0 үед донат зурахгүй (хоосон цагираг «алдаа» мэт) — гэхдээ «өгөгдөл алга» биш,
               бүртгэл БАЙГАА ч тэг гэдгийг ил хэлнэ (`null ≠ 0`). Хэмжилтгүй бол «Бүртгэл алга». */
            : wasteMeasured
              ? <Empty label={tr('Бүртгэгдсэн рейс {0} — {1}-р долоо хоног', num(0), num(waste.data.weekNo))} />
              : <Empty label={tr('Бүртгэл алга')} />)}
        </Section>
        )}
        {/* ⚠️ 2026-10-09: `onSaved → retry` ХАСАГДАВ — бичилт `invalidate('HABEA')` хийдэг тул автобус
            картыг өөрөө дахин татна (урьд нь ХОЁР удаа татдаг байв). */}
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
                {/* ⚠️ 2026-10-07: тайлбар (хэрэглэгчийн хүсэлт) — мөрийн зурвасын өнгө ДОНАТТАЙ ижил */}
                <div className={h.mixLegend} aria-hidden>
                  <span><i style={{ background: 'var(--c1)' }} />{tr('Монгол')}</span>
                  <span><i style={{ background: 'var(--c2)' }} />{tr('Гадаад')}</span>
                </div>
                {mixByCo.map((x) => (
                  /* ⚠️ `<button>` БИШ, `role="button"`: дотор нь `Stack`-ийн блок
                     элементүүд суудаг бөгөөд товч нь зөвхөн phrasing агуулга
                     зөвшөөрдөг. Гарын Enter/Space-ийг ИЛ холбоно. */
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
                    {/* ⚠️ `legend={false}` — мөр бүрд «Монгол · Гадаад» гэсэн
                        тайлбар давтагдвал жагсаалт уншигдахаа болино. Өнгө нь
                        дээрх донаттай ИЖИЛ тул тэр нь тайлбарын үүрэг гүйцэтгэнэ. */}
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
            : <Empty label={tr('Бүртгэл алга')} />}
        </Section>
        )}

        {/* ⚠️ Хоёр маягтын горимд ЗҮҮН багана = V1.1-ийн БҮХ чарт (гүйцэтгэгчээр
            ч энд — баруун багана захиалагчийн маягтад зориулагдсан). */}
        {dual && <UzSrcHead title={HABEA.uzleg.v11.title} hue={LAYER_BY_ID[HABEA_UZLEG_LAYER_ID.v11].hue} />}
        {uzlegKind && (
          <UzlegLeft
            st={uzF} url={HABEA.uzleg[uzlegKind].url} sel={uzSel} onPick={onUzPick}
            pkgSt={uzNoPkg} pkgSel={pkgs} onPkg={togglePkg}
            /* ⚠️ Хоёр маягтын горимд зураг «гүйцэтгэгчээр»-ийн ДООР (хэрэглэгчийн хүсэлт) */
            photos={!dual}
          />
        )}
        {dual && <UzlegRight st={uzF} sel={uzSel} onPick={onUzPick} />}
        {dual && <UzlegPhotos st={uzF} url={HABEA.uzleg.v11.url} sel={uzSel} />}
        {incOpen && (<>
        {/* ⚠️ 2026-10-09: төрөл сонгосон үед тайлбар «N / M» — төв нь БҮХ төрлийн нийт (M,
            чарт өөрийн сонголтоор хумигдахгүй), тайлбар нь сонгосон төрлийн (N); урьд нь
            хоёр өөр тоо тайлбаргүй зөрдөг байв. */}
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
            : <Empty label={tr('Бүртгэл алга')} />}
        </Section>
        <Section title={tr('Шалтгааны төрөл')} note={tr('{0} бүртгэл', num(causeTotal))}>
          {causeSlices.length
            ? <Donut items={causeSlices} stack size="md" center={num(causeTotal)} centerLabel={tr('нийт')}
                selected={sel.cause} onSelect={(k) => toggleDim('cause', k)} />
            : <Empty label={tr('Шалтгаан тэмдэглэгдээгүй')} />}
        </Section>
        {/* ── ОСЛЫН ДАВТАМЖ — 1 сая хүн-цагт (2026-10-01, хэрэглэгч: бүгдийг зас) ──
            ⚠️ Багцын хүн-цаг нь ТООЦОО (толгойн хүн-цагийг ажилтны тоогоор хуваарилсан —
            `habeaRate`-ийн ⚠️) — тайлбарт ил. Хүн-цаггүй багц/сар ЗУРАГДАХГҮЙ (null ≠ 0). */}
        <Section
          title={tr('Ослын давтамж — 1 сая хүн-цагт')}
          note={(
            <span className={h.stepWrap}>
              <span className={h.seg} role="group" aria-label={tr('Давтамжийн задаргаа')}>
                <button type="button" className={`${h.segBtn} ${rateStep === 'pkg' ? h.segOn : ''}`}
                  aria-pressed={rateStep === 'pkg'} onClick={() => setRateStep('pkg')}>{tr('Багц')}</button>
                <button type="button" className={`${h.segBtn} ${rateStep === 'month' ? h.segOn : ''}`}
                  aria-pressed={rateStep === 'month'} onClick={() => setRateStep('month')}>{tr('Сар')}</button>
              </span>
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
            /* ⚠️ 2026-10-09: сарын тэнхлэг ТАСРАЛТГҮЙ (`rateByMonth`) — хүн-цаггүй сар `rate: null`.
               `lines`-аар дамжуулж ЦООРХОЙ болгоно (`items[].value` нь зөвхөн тэнхлэг/шошго —
               null-ийг 0 гэж зурахгүй, null ≠ 0). */
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
          zone={null}
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
            /* ⚠️ 2026-09-29 (аудит 10): `mapVisible` — зурагт БОДИТ зурагдаж буй
               давхаргууд (`DedButets`-ийн 09-23-ны ижил засвар). `visible` (каталогийн
               сонголт) өгөхөд фокус/үзлэгийн горимд зурагт байхгүй давхаргын
               гулсуур гарч, зурагт байгаа нь гардаггүй байв. */
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
                : pickRows(picked.id, picked.attrs)).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            {picked.id === 'habea:osol' && <IncPhotos oid={nn(picked.attrs['objectid'])} />}
          </div>
        )}

        {/* ── ГАЗРЫН ЗУРГИЙН ШҮҮЛТҮҮР (2026-09-15, хэрэглэгчийн хүсэлт) ──
            Баруун ДЭЭД буланд: зүүн доод нь тайлбар, баруун доод нь сонгосон
            объектын карт, дээд төв нь 2D/3D, зүүн тал нь хэрэгслийн багана.
            ⚠️ `backdrop-filter` БҮҮ нэм — `MultiSelect`-ийн `fixed` жагсаалтыг
            тайрна (бүрэлдэхүүний толгойн тайлбарыг үз). */}
        {(pkgOptions.length > 0 || coOptions.length > 0) && (
          <div className={h.mapFilter} role="group" aria-label={tr('Газрын зургийн шүүлтүүр')}>
            {filterPills}
            {/* ⚠️ Сонголт тохирохгүй үеийн тайлбар — картаас энд шилжсэн (шүүлттэйгээ хамт) */}
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
          хүн хүч → БАГАНА БАЙХГҮЙ (цуваа нь өргөн хэрэгтэй)

          ⚠️ Краны гурван карт нь ЗӨВХӨН анхны харагдацад — тэр нь ӨӨР эх
          сурвалж тул шүүлтүүр сонгосон үед үлдэх ёсгүй (2026-09-06). ── */}
      {rOpen && (
      <div className={h.r} ref={rRef}>
        <HabeaCardGrips target={rRef} id={`r-${focus ?? 'all'}`} />
        {/* ⚠️ ШҮҮЛТҮҮРИЙН МӨР — БАРУУН БАГАНЫН ОРОЙД (2026-09-17, хэрэглэгчийн
            хүсэлт: «Үзлэг — гүйцэтгэгчээр» чартын ДЭЭР). Урьд нь зургийн
            дээгүүр бүтэн өргөнөөр (`flt` мөр) байв. Одоо баганын эхний хүүхэд
            тул харагдац бүрд тухайн баганын картуудын ЯГ дээр суудаг —
            үзлэгийн фокуст энэ нь «Үзлэг — гүйцэтгэгчээр».

            ⚠️ `rOpen` ҮРГЭЛЖ үнэн байх ЁСТОЙ: баруун багана нуугдвал
            (`data-r='0'`) шүүлтүүр хамт алга болж, хуудас бүхэлдээ
            удирдлагагүй үлдэнэ. */}
        {/* ── ГҮЙЦЭТГЭГЧИЙН ШҮҮЛТҮҮР — KPI-ийн ЯГ доор, зурагтай ижил өргөн ──
            Дашбоардын хөндлөн шүүлтийн НЭГ удирдлага: сонгоход ажилтан, техник,
            монгол/гадаад нь тухайн компанийн баганаас ЯГ, харин осол зөрчил,
            кран, газрын зургийн гурван давхарга нь түүний БАГЦААР шүүгдэнэ
            (ослын бүртгэлийн компанийн нэр чөлөөт текст, 31 тэмдэгтээр
            таслагдсан тул нэрээр тааруулах боломжгүй — багц бол цорын ганц
            найдвартай түлхүүр).

            Тоо нь БҮХ ХУГАЦААНЫ ажилтны нийлбэр (хүн-өдөр) — жагсаалт өдөр бүр
            өөрчлөгдөхгүй байх ёстой. */}
        {/* ⚠️ Зурвас нь ҮРГЭЛЖ гарна (2026-09-06): урьд нь зөвхөн компанийн
            сонголт байсан тул `coOptions` хоосон үед бүхэлдээ алга болдог
            байв. Одоо ослын шүүлтүүр мөн энд суудаг — тэр нь компанийн
            өгөгдлөөс ҮЛ ХАМААРНА. */}
        <div className={h.filters}>
          {/* ⚠️ ХОЁР БҮЛЭГТЭЙ КАРТ (2026-09-17, хэрэглэгчийн хүсэлт «гоё
              харагдуул, доошоо зөөж»). Нарийн баганад зургаан капсул нэг
              мөрөнд урсахад өргөн нь тэгш бус тасарч эмх замбараагүй
              харагдаж байв. Одоо: (1) МЭДЭЭЛЭЛ — дөрвөн эх сурвалж 2×2
              ТЭНЦҮҮ хавтан, (2) ШҮҮЛТ — багц ба компани тус бүр бүтэн
              өргөнтэй мөр. Хоёр бүлэг нь үүргээрээ ялгаатай: эхнийх нь АЛЬ
              мэдээллийг харах, хоёр дахь нь ТҮҮНИЙГ хэрхэн шүүх. */}
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
                /* ⚠️ Үзлэгийн чартын сонголтыг ЦУЦАЛНА: V1.1 ба гүйцэтгэгчийн маягт
                   ӨӨР компани, талбайн жагсаалттай тул нэгийнх нь сонголт нөгөөд
                   хуучирч үлдвэл самбар «Бүртгэл алга» гэж шалтгаангүй хоосорно. */
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
          {/* ҮЗЛЭГИЙН ТАЙЛАН ТАТАХ (2026-10-06) — асуумж · хугацаа · компани сонгоод PDF / Excel.
              ⚠️ 2026-10-08: ЗӨВХӨН `habeaData` эрхтэйд (хэрэглэгчийн хүсэлт) — бусдад товч харагдахгүй. */}
          {canEnter && <UzlegExportButton kind={uzlegKind} />}
          </div>

          {/* ⚠️ «ШҮҮЛТ» БҮЛЭГ (Багц · Компани) ЭНДЭЭС ХАСАГДАВ (2026-09-17,
              хэрэглэгчийн хүсэлт): газрын зураг дээрх шүүлтүүртэй ЯГ ижил
              (`filterPills` — нэг бүрэлдэхүүн, нэг төлөв) тул давхардал байв.
              Шүүлт одоо ЗӨВХӨН газрын зургийн баруун дээд буланд. */}
        </div>
        {/* ── ОСЛЫН ФОКУС: дэлгэрэнгүй жагсаалт ЭНД (зүүнээс зөөгдсөн) ──
            ⚠️ Жагсаалт нь дотроо гүйлгэгддэг тул баганын ЦОРЫН ГАНЦ карт
            байх ёстой: хажууд нь өөр карт тавибал хоёулаа хагасхан өндөртэй
            болж, аль нь ч уншигдахгүй. ── */}
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
            // ⚠️ Давхцахгүй ОБЪЕКТ ИД-ээр таних — өмнө нь `огноо|төрөл` байсан тул
            //    нэг өдрийн ижил төрлийн 2 бүртгэл мөргөлдөж, нэгийг дарахад хоёул
            //    задардаг байв (React key давхардал бас).
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
          }) : <Empty label={tr('Бүртгэл алга')} />}
        </Section>
        )}

        {uzlegKind && !dual && <UzlegRight st={uzF} sel={uzSel} onPick={onUzPick} />}
        {/* ⚠️ Хоёр маягтын горимд БАРУУН багана = захиалагчийн маягтын, зүүнтэй
            ЯГ ИЖИЛ чартууд (зэрэг · ээлж · зураг · гүйцэтгэгчээр). */}
        {dual && (<>
          <UzSrcHead title={HABEA.uzleg.zahialagch.title} hue={LAYER_BY_ID[HABEA_UZLEG_LAYER_ID.zahialagch].hue} />
          <UzlegLeft
            st={uzF2} url={HABEA.uzleg.zahialagch.url} sel={uzSel} onPick={onUzPick}
            pkgSt={uzNoPkg2} pkgSel={pkgs} onPkg={togglePkg} photos={false}
          />
          <UzlegRight st={uzF2} sel={uzSel} onPick={onUzPick} />
          <UzlegPhotos st={uzF2} url={HABEA.uzleg.zahialagch.url} sel={uzSel} />
        </>)}

        {/* ── ХҮН ХҮЧНИЙ ФОКУС — БАРУУНД КОМПАНИАР хүний тоо ──
            ⚠️ Дарахад тухайн гүйцэтгэгчээр БҮХ хуудас шүүгдэнэ
            (`toggleCo`) — доорх өдрийн цуваа, зүүн талын
            бүрэлдэхүүн, газрын зураг бүгд дагана. Дахин дарвал цуцална.

            ⚠️ Гарчигт «хүн-өдөр» гэж бичсэн нь ЗАЙЛШГҮЙ: утга нь ажилласан
            өдрөөр нь нийлсэн дүн, ажиллагсдын тоо БИШ. ── */}
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
        {/* ── КРАН — БОСОО хоёр карт ──
        ⚠️ `.rPair` (хоёр донат ЗЭРЭГЦЭЭ) ба түүний бариул ХАСАГДЛАА
        (2026-09-06): «Монгол, гадаад» донат зургийн ЗҮҮН талд гарсан тул
        хосын хоёр дахь нүд хоосон үлдэж, краны донат хагас өргөнд шахагдаж
        байв. Одоо баруун багана нь энгийн босоо өрлөг — краны хоёр карт
        бүтэн өргөнөө эзэлнэ. ── */}
        {/* ⚠️ «N/N идэвхтэй» тайлбарыг хассан: `Tuluv` талбарт бүх кран «Одоо
            байгаа» тул `craneActive` нь ҮРГЭЛЖ нийт тоотой тэнцэж «50/50» гэж
            утгагүй давхардаж байв. Өгөгдөлд «Буусан» гарч эхэлбэл эргүүлж
            тавихад утгатай болно. */}
        {/**
          * ӨМНӨХ БҮТЭН ДОЛОО ХОНОГИЙН ОНОО — КОМПАНИАР (2026-09-17, хэрэглэгчийн
          * хүсэлт: «Цамхагт кран — төлөв»-ийн ДЭЭР). V1.1 маягтаас, дээд KPI-тэй
          * ИЖИЛ дүрмээр (`habeaUzleg.loadWeekScoreByCo`).
          *
          * ⚠️ Дарахад хуудасны «Компани» шүүлт тавигдана — зөвхөн хүн хүчний
          * бүртгэлтэй холбогдсон компани (`co:` угтвартай түлхүүр дарахад юу ч
          * болохгүй). ⚠️ 2026-09-17: «Багц» шүүлтийг ДАГАНА (`weekScoreByCo` — 2026-10-09 хасагдсан).
          */}
        {/* ⚠️ 2026-10-08 (хэрэглэгч): «Үзлэгийн оноо — компаниар» (хэвтээ, компаниар) ОРОНД
            «Ажлын байрны үзлэг» — ижил босоо багана (`ScoreColumns`), өмнөх долоо хоногийн
            оноо БАГЦААР. Дарахад «Багц» шүүлт тавигдана. */}
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
          *
          * ⚠️ «Цамхагт кран — төлөв» ЭНДЭЭС зүүн баганад («Компаниар — монгол,
          * гадаад»-ын доор) шилжсэн — баруун багана үзлэгийн хоёр чарттай болов.
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
        {/* ⚠️ «Кран — багцаар» 2026-09-17-нд ХАСАГДАВ (хэрэглэгчийн хүсэлт) —
            багцаар шүүх нь дээд талын «Багц» шүүлтүүрт бий. */}
        </>)}
      </div>
      )}

      {/* ── ДООД зурвас — бүтэн өргөн, хумилтгүй. Агуулга нь ФОКУСААС
          хамаарна (2026-09-06): анхны харагдац ба «Техник болон хүн цаг»
          үед ажилтан/техникийн цуваа, ослын фокуст зураг + компаниар,
          үзлэгийн фокуст гүйцэтгэгч + талбай + сараар. «Осол, зөрчил —
          багцаар» ба «Кран — багцаар» хасагдсан; багцаар шүүх нь дээд талын
          «Багц» шүүлтүүрт. ── */}
      {/* ⚠️ `data-cols` нь БАГАНЫН ТООГ сольдог. Тогтмол 4 багана
          үлдээвэл 2 картын горимд тэдгээр нь зүүн хагаст шахагдаж, баруун
          тал хоосон үлдэнэ. Горим бүрд:
            осол   → 2 (зураг · компаниар)
            хүн хүч → 2 (ажилтан · техник)
            үзлэг  → 2 (өдрөөр · сараар — 2026-09-15, урьд нь 1)
            (гүйцэтгэгч ба талбайн задаргаа нь баруун баганад — `UzlegRight`) */}
      {/* ⚠️ Хоёр маягтын горимд ХОЁР хагас (зүүн V1.1 · баруун захиалагч), хагас
          бүрд өдөр · сар · долоо хоногийн гурван цуваа (`.finHalf`). */}
      <div className={h.fin} data-cols="2"
        style={panes.styleFor('fin1', 'fin2')}>
        {incOpen && (<>
        <Section title={tr('Осол, зөрчлийн зураг')} note={tr('хавсаргасан зургууд · дарж томруулна')}>
          <PhotoWall list={[...fInc].sort((a, b) => b.d - a.d)} />
        </Section>
        <Section title={tr('Осол, зөрчил — компаниар')}>
          {incByCompany.length
            ? <Bars items={incByCompany} selected={sel.incCompany} onSelect={(k) => toggleDim('incCompany', k)} />
            : <Empty label={tr('Бүртгэл алга')} />}
        </Section>
        </>)}

        {uzlegKind && !dual && <UzlegFin st={uzF} sel={uzSel} onPick={onUzPick} curYm={curYm} />}
        {dual && (<>
          <div className={h.finHalf}>
            <UzSrcHead title={HABEA.uzleg.v11.title} hue={LAYER_BY_ID[HABEA_UZLEG_LAYER_ID.v11].hue} />
            <div className={h.finHalfGrid} style={panes.styleFor('fhL')}>
              <UzlegFin st={uzF} sel={uzSel} onPick={onUzPick} curYm={curYm} />
              {/* ⚠️ Хоёр картын зааг — `grip` нь ЭЭЖИЙНХЭЭ (`.finHalfGrid`) трекийг хэмждэг тул ШУУД хүүхэд */}
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
        {/* ⚠️ ГАРЧИГ нь алхмаа дагана: «Ажилтан — өдрөөр» ↔ «— сараар».
            Нэг гарчиг үлдээвэл сар руу сэлгэсэн хойно карт нь өдрийн тоо
            харуулж байгаа мэт уншигдана. НЭГЖ мөн адил солигдоно:
            өдрийн утга нь тоо толгой, сарынх нь ХҮН-ӨДӨР. */}
        <Section
          title={aStep === 'day' ? tr("Ажилтан — өдрөөр") : tr("Ажилтан — сараар")}
          note={stepNote(aStep, setAjiltanStep,
            aStep === 'day'
              ? (byDay.length ? tr("{0} · {1} өдөр", coLabel ?? tr("бүх компани"), num(byDay.length)) : null)
              : (byMonth.length ? `${tr("{0} · {1} сар", coLabel ?? tr("бүх компани"), num(byMonth.length))}${monthNote(byMonth)}` : null))}
        >
          {(aStep === 'day' ? byDay : byMonth).length
            ? (
              <div className={h.dayScroll} ref={dayScroll}>
                <div style={{ minWidth: `${Math.max(100, (ajItems.length / SERIES_VISIBLE) * 100)}%` }}>
                  <Series
                    items={ajItems}
                    lines={ajLines}
                    height={110}
                    unit={aStep === 'day' ? tr("ажилтан") : tr("хүн-өдөр")}
                    line
                    showValues
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
              /* ⚠️ 2026-09-30: `totalTech` нь өдрүүдийн НИЙЛБЭР = нэгж-ӨДӨР (техникийн тоо биш);
                 нэгжгүй бичвэл «12,000 техник» гэж уншигддаг байв. */
              ? (techDay.length ? tr("{0} · {1} нэгж-өдөр", coLabel ?? tr("бүх компани"), num(totalTech)) : null)
              : (techMonth.length ? `${tr("{0} · {1} сар", coLabel ?? tr("бүх компани"), num(techMonth.length))}${monthNote(techMonth)}` : null))}
        >
          {(tStep === 'day' ? techDay : techMonth).length
            ? (
              <div className={h.dayScroll} ref={techScroll}>
                <div style={{ minWidth: `${Math.max(100, ((tStep === 'day' ? techDay : techMonth).length / SERIES_VISIBLE) * 100)}%` }}>
                  <Series
                    items={tStep === 'day' ? techDay : techMonth}
                    height={110}
                    unit={tStep === 'day' ? tr("нэгж") : tr("нэгж-өдөр")}
                    line
                    showValues
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
            Бариул бүр ЗАСАХ трекийнхээ баруун ирмэгт, 8px завсрын дунд.
            ⚠️ `grip` нь ээжийнхээ (`.fin`) grid-ийг уншиж/бичдэг тул ЭНЭ
            элементийн ШУУД хүүхэд байх ёстой.

            ⚠️ Бариул нь баганын ЗААГ бүрд — тоо нь ҮРГЭЛЖ (багана − 1).
            Илүү бариул зурвал хоосон баганы ирмэгийг чирч, юу ч хөдлөхгүй
            байдалд хүргэнэ. */}
        {/* ⚠️ Бариулын тоо = багана − 1 — бүх горим ХОЁР багана. */}
        {/* ⚠️ 2026-10-07: `gridColumn: '1 / 2'` — ЗААВАЛ ТӨГСГӨЛТЭЙ. Абсолют байрлалтай хүүхдэд `1` гэвэл
            төгсгөл нь `auto` = контейнерийн ирмэг болж, бариул картын завсар биш ЗУРВАСЫН БАРУУН
            ЗАХАД очиж харагдахгүй байв (хэрэглэгч: «чартуудын голд бариул нэм»). */}
        <div className={h.gripCol} style={{ gridColumn: '1 / 2', gridRow: '1 / 2', right: -8 }} {...panes.grip('fin1')} />
        {/* ⚠️ Үзлэгийн горим ч 2 карттай болсон (2026-09-17: өдөр ба сар НЭГ
            картад шилжүүлэгчтэй нэгдсэн) тул хоёр дахь бариул хэрэггүй. */}
      </div>

      {/* ── Панелийн хэмжээ тохируулах бариулууд ──
          Тус бүр нь ӨӨРИЙН панелийн grid-нүдэнд суугаад тэр нүдний ирмэг рүү
          8px завсрын дунд шилжинэ. Панелиуд өөрсдөө overflow-той тул бариулыг
          тэдний ДОТОР тавьж болохгүй — таслагдана. Давхар товшвол анхны хэмжээ. */}
      {/* ⚠️ Зүүн бариул нь ЗӨВХӨН багана байгаа үед: хоосон үед тор нь хоёр
          баганатай тул `gridArea: 'list'` нь ор үгүй нэр болж, бариул нь
          зургийн зүүн ирмэг дээр хөвж, чирэхэд юу ч хөдлөхгүй байв. */}
      {listOpen && (
        <div className={h.gripCol} style={{ gridArea: 'list', right: -8 }} {...panes.grip('l')} />
      )}
      {/* ⚠️ 2026-10-07: `.r` багана бүх focus горимд зурагддаг тул баруун бариулыг
          `focus === null`-ээр хязгаарлахгүй — урьд нь товлосон горимд өргөн тохируулагдахгүй байв. */}
      <div className={h.gripCol} style={{ gridArea: 'r', left: -8 }} {...panes.grip('r')} />
      <div className={h.gripRow} style={{ gridArea: 'fin', top: -8 }} {...panes.grip('fin')} />
    </div>
  );
}
