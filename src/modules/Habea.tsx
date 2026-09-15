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
import { queryFeatures, type Row } from '@/lib/query';
import {
  HABEA, HABEA_LAYER_IDS, LAYER_BY_ID, CATALOG_LAYER_IDS,
  bagtsKey, laborCompanyFields,
} from '@/lib/services';
import { usePlanTotals } from '@/lib/totals';
import { cached } from '@/lib/live';
import { usePanes } from './habeaPanes';
import { useUzleg, UzlegLeft, UzlegRight, UzlegFin, type UzlegKind } from './habeaUzleg';
import { Section, Bars, Donut, Select, Series, Stack, Loading, Empty } from '@/components/ui';
import { num, date, text, dayKey } from '@/lib/format';
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

const normIncident = (r: Row): Inc => ({
  oid: nn(r['objectid']),
  d: nn(r[I.ognoo]) || nn(r['CreationDate']),
  bagtsRaw: text(r[I.bagts], '—'),
  bagtsK: bagtsKey(r[I.bagts]),
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
  'Шинээр нэмэгдсэн': 'var(--data)', 'Одоо байгаа': 'var(--data)', 'Буусан': 'var(--ink-3)',
};

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
  bagtsK: bagtsKey(r[C.bagts]),
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
function laborState(rows: Row[]): {
  rows: LaborRow[];
  asOf: number | null;
  hunTsag: number;
  cum: { ajiltan: number; hunTsag: number; tehnik: number };
} {
  const ZERO = { ajiltan: 0, hunTsag: 0, tehnik: 0 };
  if (!rows.length) return { rows: [], asOf: null, hunTsag: 0, cum: ZERO };
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
        key: c.sfx, label: c.label, code: c.code, bagtsRaw, bagtsK: bagtsKey(bagtsRaw),
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
  const cum = rows.reduce<{ ajiltan: number; hunTsag: number; tehnik: number }>(
    (a, r) => ({
      ajiltan: a.ajiltan + nn(r[L.niitAjiltan]),
      hunTsag: a.hunTsag + nn(r[L.hunTsag]),
      tehnik: a.tehnik + nn(r[L.niitTehnik]),
    }),
    { ajiltan: 0, hunTsag: 0, tehnik: 0 },
  );

  return { rows: comp, asOf, hunTsag: nn(latest[L.hunTsag]), cum };
}

/**
 * Монгол/гадаад харьцааны хандлага — өдрийн бүртгэл БҮРЭЭС.
 *
 * ⚠️ ХАМРАХ ХҮРЭЭ: маягтад монгол/гадаадын задаргаа 2026-08-06-наас ХОЙШ л
 * бөглөгдөж эхэлсэн. Өмнөх бүртгэлүүд `Niit_ajiltan`-тай ч задаргаагүй тул
 * цуваа нь БҮХ түүхийг биш, ЗАДАРГАА БҮХИЙ өдрүүдийг л хамарна (одоогоор ~12
 * өдөр) — шинэ тайлан ирэх бүрд өөрөө уртсана. Задаргаагүй өдрийг 0%-иар
 * зурвал «монгол ажилтан байгаагүй» гэж ХУДАЛ уншигдана тул хасна.
 *
 * `sfx` өгвөл ЗӨВХӨН тэр гүйцэтгэгчийн баганын бүлгээс, эс бөгөөс бүгдийн
 * нийлбэрээс тооцно.
 */
function mixTotals(rows: Row[], sfx: string | null): { mongol: number; gadaad: number } {
  const fields = (sfx ? [{ sfx }] : HABEA.labor.companies).map((c) => laborCompanyFields(c.sfx));
  return rows.reduce<{ mongol: number; gadaad: number }>(
    (a, r) => ({
      mongol: a.mongol + fields.reduce((s, f) => s + nn(r[f.mongol]), 0),
      gadaad: a.gadaad + fields.reduce((s, f) => s + nn(r[f.gadaad]), 0),
    }),
    { mongol: 0, gadaad: 0 },
  );
}

/**
 * Гүйцэтгэгч бүрийн өдөр тутмын ажилтны тоо — ОГНООГООР.
 *
 * `sfx` өгвөл тэр гүйцэтгэгчийн багана, эс бөгөөс бүх гүйцэтгэгчийн нийлбэр.
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
      bagtsK: c.bagts ? bagtsKey(c.bagts) : '',
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
 * `sfx` өгвөл тэр гүйцэтгэгчийн багана, эс бөгөөс бүх гүйцэтгэгчийн нийлбэр.
 *
 * ⚠️ Огноогүй мөрийг (бөглөж дуусаагүй маягт) ХАСНА — `CreationDate`-аар
 * орлуулбал өнөөдрийн огноогоор олон хоосон багана нэмэгдэнэ.
 */
function byDaySeries(rows: Row[], sfx: string | null, key: 'niitAjiltan' | 'niitTehnik') {
  const fields = (sfx ? [{ sfx }] : HABEA.labor.companies).map((c) => laborCompanyFields(c.sfx));
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
      let sum: number | null = null;
      for (const f of fields) {
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
     * ⚠️ НЭГ ӨДӨРТ ОЛОН БҮРТГЭЛ байж болно (компани тус бүр өөрөө илгээх,
     *    эсвэл засвар). Мөр тус бүрийг ЦЭГ болговол нэг өдөр хэд хэдэн
     *    багана болж, графикийн х тэнхлэг худал уртсаад зогсохгүй React-д
     *    ижил түлхүүр давхардана. Тиймээс өдрөөр НЭГТГЭЖ нийлбэрийг авна.
     */
    .reduce<{ key: string; label: string; value: number; display: string }[]>((acc, x) => {
      /* ⚠️ ОРОН НУТГИЙН огноогоор бүлэглэнэ (`dayKey`). Урьд нь
         `toISOString().slice(0, 10)` байсан тул +08 бүсэд орон нутгийн
         00:00–07:59-д илгээсэн тайлан ӨМНӨХ өдрийн баганад нийлдэг байв;
         `byMonthSeries` нь энэ түлхүүрийн эхний 7 тэмдэгтээр сар авдаг тул
         сарын эхний шөнийн бүртгэл бүтэн сараар ч гулсдаг байлаа. */
      const iso = dayKey(x.d);
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
function byMonthSeries(daily: { key: string; value: number }[]) {
  const m = new Map<string, number>();
  for (const x of daily) {
    const ym = x.key.slice(0, 7);
    m.set(ym, (m.get(ym) ?? 0) + x.value);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, value]) => ({ key: ym, label: ym.replace('-', '.'), value, display: num(value) }));
}

/* ─────────── Туслах дүрслэл ─────────── */

/**
 * ЦУВААНЫ АЛХМЫН ШИЛЖҮҮЛЭГЧ — картын ГАРЧГИЙН мөрөнд.
 *
 * ⚠️ `Section`-д үйлдлийн слот БАЙХГҮЙ тул `note`-оор дамжуулна —
 * тэр нь толгойн БАРУУН талд, тайлбар бичиг байдаг байрлал. Ингэснээр
 * шилжүүлэгч нь картын дотоод агуулгыг ХӨНДӨХГҮЙ: чартын өндөр, гүйлгэгч
 * бүгд хэвээр.
 */
/**
 * ⚠️ `set` нь `null` байж БОЛНО — тэр үед шилжүүлэгч ЗУРАГДАХГҮЙ,
 * зөвхөн тайлбар үлдэнэ. «Техник болон хүн цаг» фокуст сарын өгөгдөл нь
 * ХАЖУУГИЙН баганад тусдаа чарт болж гардаг тул доод зурваст сэлгэх зүйл
 * үлдэхгүй; товчийг үлдээвэл дарахад ижил чарт хоёр газар давхарлана.
 */
const stepNote = (
  step: 'day' | 'month',
  set: ((v: 'day' | 'month') => void) | null,
  note: ReactNode,
) => (
  <span className={h.stepWrap}>
    {set && (
    <span className={h.seg} role="group" aria-label={tr("Цувааны алхам")}>
      <button
        type="button"
        className={`${h.segBtn} ${step === 'day' ? h.segOn : ''}`}
        aria-pressed={step === 'day'}
        onClick={() => set('day')}
      >
        {tr("Өдөр")}
      </button>
      <button
        type="button"
        className={`${h.segBtn} ${step === 'month' ? h.segOn : ''}`}
        aria-pressed={step === 'month'}
        onClick={() => set('month')}
      >
        {tr("Сар")}
      </button>
    </span>
    )}
    {note != null && <span className={h.stepNote}>{note}</span>}
  </span>
);

const kpiTile = (val: ReactNode, label: string, unit?: string) => (
  // `h.kpiCenter` — шошго/утгыг голлуулах ХАБЭА-гийн нэмэлт (`overview`-ийн
  // `.tile` нь зүүн зэрэгцүүлдэг бөгөөд түүнийг өөр модулиуд ч хэрэглэдэг).
  <div className={`${o.tile} ${h.kpiCenter}`}>
    <div className={o.tileVal}><b>{val}</b>{unit && <i>{unit}</i>}</div>
    <div className={o.tileLabel}>{label}</div>
  </div>
);

/** Багцаар бүлэглэсэн нийлбэр — бар бүр bagtsKey түлхүүртэй (хөндлөн шүүлтэд) */
function byPkg<T extends { bagtsK: string; bagtsRaw: string }>(items: T[], val: (x: T) => number) {
  const m = new Map<string, { label: string; value: number }>();
  items.forEach((x) => {
    if (!x.bagtsK) return;
    const cur = m.get(x.bagtsK);
    if (cur) cur.value += val(x);
    else m.set(x.bagtsK, { label: tr(x.bagtsRaw) || '—', value: val(x) });
  });
  return [...m.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

/* ─────────── Ослын хавсаргасан зураг (attachment) ─────────── */

type Photo = { id: number; name: string };

/** Бүртгэл бүрийн хавсралтын жагсаалт — нэг удаа татаад кэшлэнэ (задлах бүрд дахин татахгүй) */
const photoCache = new Map<number, Promise<Photo[]>>();
const loadPhotos = (oid: number): Promise<Photo[]> => {
  let p = photoCache.get(oid);
  if (!p) {
    p = fetch(`${HABEA.incident.url}/${oid}/attachments?f=json`)
      .then((r) => r.json())
      .then((j: { attachmentInfos?: { id: number; contentType?: string; name?: string }[] }) =>
        (j.attachmentInfos ?? [])
          .filter((a) => String(a.contentType ?? '').startsWith('image/'))
          .map((a) => ({ id: a.id, name: a.name ?? tr('Зураг {0}', a.id) })));
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
async function loadPhotoBatches<T>(list: Inc[], of: (i: Inc, p: Photo) => T): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < list.length; i += 4) {
    const chunk = await Promise.all(
      list.slice(i, i + 4).map((inc) => loadPhotos(inc.oid).then((ph) => ph.map((p) => of(inc, p)))),
    );
    out.push(...chunk.flat());
  }
  return out;
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
      {q.data.map((p) => {
        const src = `${HABEA.incident.url}/${oid}/attachments/${p.id}`;
        return (
          <a key={p.id} href={src} target="_blank" rel="noreferrer" title={p.name}>
            {/* Хөндлөнгийн ArcGIS хавсралт тул next/image-ийн оновчлол хамаагүй */}
            <img src={src} alt={p.name} />
          </a>
        );
      })}
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
  const q = useAsync<{ src: string; cap: string; tip: string }[]>(
    () =>
      loadPhotoBatches(list, (i, p) => ({
        src: `${HABEA.incident.url}/${i.oid}/attachments/${p.id}`,
        cap: `${date(i.d)} · ${tr(i.bagtsRaw)}`,
        tip: `${tr(i.type)} — ${tr(i.company)}`,
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
  const n = q.data.length;
  if (!n) return <Empty label={tr('Хавсаргасан зураг алга')} />;
  const cur = Math.min(idx, n - 1);
  const p = q.data[cur];
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
        <a href={p.src} target="_blank" rel="noreferrer" title={p.tip} className={h.slideImg}>
          {/* Хөндлөнгийн ArcGIS хавсралт тул next/image-ийн оновчлол хамаагүй.
              ⚠️ loading="lazy" ХЭРЭГЛЭХГҮЙ — карт нь доод зурваст, viewport-аас
              гадуур тул lazy-loader асалгүй зураг хоосон үлддэг. */}
          <img src={p.src} alt={p.tip} />
        </a>
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
    </div>
  );
}

/** Зурган дээрээс сонгосон объектын картын мөрүүд */
function pickRows(id: string, a: Record<string, unknown>): [string, string][] {
  if (id === 'habea:osol') {
    return ([
      [tr('Огноо'), date((a[I.ognoo] ?? a['CreationDate']) as number)],
      [tr('Төрөл'), text(a[I.turul], '—')],
      [tr('Багц'), text(a[I.bagts], '—')],
      [tr('Компани'), clean(a[I.company])],
      [tr('Мэдээлэл'), text(a[I.medeelel], '—')],
      [tr('Шалтгаан'), text(a[I.shaltgaan], '—')],
      [tr('Арга хэмжээ'), text(a[I.argaHemjee], '—')],
    ] as [string, string][]).filter(([, v]) => v !== '—');
  }
  const rows: [string, string][] = [
    [tr('Багц'), text(a[C.bagts], '—')],
    [tr('Блок'), text(a[C.blok], '—')],
    [tr('Төлөв'), text(a[C.tuluv], '—')],
    [tr('Өндөр'), tr('{0} м', num(nn(a[C.undur])))],
    /* ⚠️ Хоёр бичиглэл уншдаг байсан зам ХАСАГДЛАА (2026-09-04): эх
       үйлчилгээнд цэг [50] ба бүс [51] ХОЁУЛАА «суны» гэж бичдэг. Хоёр нэр нь
       зөвхөн test_data-гийн хуулбарын үлдэгдэл байв. */
    [tr('Сумны урт'), tr('{0} м', num(nn(a[C.sunUrt])))],
  ];
  if (id === 'habea:buffer') rows.push([tr('Аюулгүйн радиус'), tr('{0} м', num(nn(a['BUFF_DIST'])))]);
  return rows;
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
  { key: 'v11', label: () => tr('Ажлын байрны үзлэг V11'), count: () => null },
  { key: 'guitsetgegch', label: () => tr('Гүйцэтгэгчийн ажлын байрны үзлэг'), count: () => null },
];

/** «Техник — өдрөөр» цуваанд НЭГ ДОР харагдах өдрийн тоо — үлдсэн нь гүйлгэлтээр */
const DAYS_VISIBLE = 8;
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
type Dim2 = 'pkg' | 'co' | 'incType' | 'cause' | 'incCompany' | 'craneState';
type Sel = Record<Dim2, string | null>;
const NO_SEL: Sel = {
  pkg: null, co: null, incType: null, cause: null, incCompany: null, craneState: null,
};

/** Хүний уншиж болох нэр — идэвхтэй шүүлтийн чипэнд гарна */
const DIM_LABEL: Record<Dim2, string> = {
  pkg: tr('Багц'),
  co: tr('Компани'),
  incType: tr('Ослын төрөл'),
  cause: tr('Шалтгаан'),
  // ⚠️ `co`-той ялгаж нэрлэнэ: хоёулаа компанийг заадаг ч ӨӨР эх сурвалжаас
  //    (`co` = ажилтны маягтын багана, энэ нь ослын бүртгэлийн чөлөөт текст).
  //    Хоёулаа зэрэг идэвхтэй байж болох тул чип дээр ялгарах ёстой.
  incCompany: tr('Ослын компани'),
  craneState: tr('Краны төлөв'),
};

/* ═══════════════════════ Үндсэн компонент ═══════════════════════ */

export function Habea({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  const q = useAsync<HabeaData>(loadHabea, []);

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

  /* Олон хэмжээст хөндлөн шүүлт + зурган дээрээс сонгосон объект */
  const [sel, setSel] = useState<Sel>(NO_SEL);
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
  const { pkg, co } = sel;

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
  const coEff = useMemo(() => {
    if (co) return co;
    if (!pkg) return null;
    const hit = HABEA.labor.companies.find((x) => x.bagts && bagtsKey(x.bagts) === pkg);
    return hit ? hit.sfx : null;
  }, [co, pkg]);

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
  const toggleDim = useCallback((d: Dim2, v: string) => {
    setSel((s) => ({ ...s, [d]: s[d] === v ? null : v }));
    setPicked(null);
  }, []);

  const togglePkg = useCallback((k: string) => {
    // Багцаар шүүхэд гүйцэтгэгчийн нарийвчлал утгагүй болно — хамт цуцална
    setSel((s) => ({ ...s, pkg: s.pkg === k ? null : k, co: null }));
    setPicked(null);
  }, []);

  /**
   * Багцыг ЯГ тавих (`null` = бүх багц) — унжих жагсаалтын зам.
   *
   * ⚠️ `togglePkg`-оос ТУСДАА: тэр нь ижил утгыг дахин өгөхөд ЦУЦАЛДАГ
   * (чартын бар дарах зан). Унжих жагсаалтад тэр зан нь буруу — хэрэглэгч
   * аль хэдийн сонгосон багцаа дахин сонгоход шүүлт чимээгүй арилна.
   *
   * ⚠️ `co`-г МӨН цуцална: гүйцэтгэгч ↔ багц нь 1:1 тул өөр багц
   * сонгосон хойно хуучин гүйцэтгэгчийн шүүлт үлдвэл хоёр нөхцөл
   * зөрчилдөж ажилтны самбар үргэлж хоосон гарна.
   */
  const setPkg = useCallback((k: string | null) => {
    setSel((s) => ({ ...s, pkg: k, co: null }));
    setPicked(null);
  }, []);

  /** Бүх шүүлт + зургийн сонголтыг нэг дор арилгана */
  const clearAll = useCallback(() => {
    setSel(NO_SEL);
    setPicked(null);
  }, []);

  /**
   * Гүйцэтгэгч сонгох. Ажилтан/техникийг тухайн компанийн баганын бүлгээс ЯГ
   * шүүнэ; осол зөрчил, кран, газрын зураг нь компанийн нэрээр БИШ — компанийн
   * БАГЦААР шүүгдэнэ (ослын бүртгэлийн компанийн нэр нь чөлөөт текст, 31
   * тэмдэгтээр таслагдсан тул найдвартай тааруулах боломжгүй).
   *
   * ⚠️ Багц заагдаагүй гүйцэтгэгч (ММСЕ, SC, ОСНААГ, ГУББ, ЧХО) сонгоход
   * `pkg` нь null хэвээр — ажилтан/техник шүүгдэнэ, осол/кран ШҮҮГДЭХГҮЙ.
   * Үүнийг шүүлтийн мөрөнд ил бичнэ.
   */
  /**
   * Гүйцэтгэгчийг ЯГ тавих (`null` = бүгд). Унжих жагсаалт нь энийг шууд,
   * чартын багана/бар нь `toggleCo`-гоор дамжуулан дуудна.
   *
   * Гүйцэтгэгч ↔ багц нь 1:1 тул хоёуланг ЗЭРЭГ тавина: ажилтан/техникийг
   * компанийн баганаас ЯГ, осол/кран/газрын зургийг түүний БАГЦААР шүүнэ.
   */
  const setCompany = useCallback((sfx: string | null) => {
    const bagts = sfx ? HABEA.labor.companies.find((c) => c.sfx === sfx)?.bagts ?? null : null;
    setSel((s) => ({ ...s, co: sfx, pkg: bagts ? bagtsKey(bagts) : null }));
    setPicked(null);
  }, []);


  const all = q.state === 'ready' ? q.data : null;
  const inc = useMemo(() => (all ? all.incident.map(normIncident) : []), [all]);
  const cranes = useMemo(() => (all ? all.crane.map(normCrane) : []), [all]);
  const labor = useMemo(() => laborState(all ? all.labor : []), [all]);

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
  const pickCraneOid = picked && picked.id !== 'habea:osol'
    ? nn(picked.id === 'habea:buffer' ? picked.attrs[C.bufferLink] : picked.attrs[C.oid])
    : 0;

  const incOn = Boolean(pkg || sel.incType || sel.cause || sel.incCompany || pickOsol);
  const craneOn = Boolean(pkg || sel.craneState || pickCraneOid);

  /* Шүүгдсэн олонлогууд — БҮХ дүрслэл эдгээрээс тоологдоно.
     ⚠️ `useMemo` нь дүрслэлийн хурдны төлөө БИШ, ЛАВЛАГААНЫ ТОГТВОРТОЙ БАЙДЛЫН
     төлөө: доорх `layerWhere` эдгээрээс хамаардаг бөгөөд рендер бүрт шинэ
     массив үүсвэл газрын зураг `definitionExpression`-оо дахин дахин тавина. */
  const fInc = useMemo(() => inc.filter((x) =>
    (!pkg || x.bagtsK === pkg)
    && (!sel.incType || x.type === sel.incType)
    && (!sel.cause || x.cause === sel.cause)
    && (!sel.incCompany || x.company === sel.incCompany)
    && (!pickOsol || x.oid === pickOsol)),
  [inc, pkg, sel.incType, sel.cause, sel.incCompany, pickOsol]);

  const fCrane = useMemo(() => cranes.filter((x) =>
    (!pkg || x.bagtsK === pkg)
    && (!sel.craneState || x.tuluv === sel.craneState)
    && (!pickCraneOid || x.oid === pickCraneOid)),
  [cranes, pkg, sel.craneState, pickCraneOid]);

  /**
   * ЧАРТ → ЗУРАГ. Давхарга бүрт ӨӨРИЙН WHERE: график дээр тоологдсон ЯГ ТЭР
   * мөрүүдийг зурагт үлдээнэ. Шүүлт идэвхгүй давхаргад `null` — тэр давхарга
   * бүтнээрээ харагдана (жиш. зөвхөн ослын төрлөөр шүүхэд кран хэвээр).
   */
  const layerWhere = useMemo(() => {
    if (!incOn && !craneOn) return undefined;
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
    return { 'habea:osol': osol, 'habea:crane': kran, 'habea:buffer': buff };
  }, [incOn, craneOn, fInc, fCrane]);

  /**
   * Монгол/гадаад — БҮХ бүртгэлийн нийлбэр (сонгосон гүйцэтгэгчийг дагана).
   * ⚠️ Задаргаа бөглөгдсөн өдрүүдээс Л хуримтлагдана (маягтад өдөр бүр
   * бөглөгддөггүй) тул нийт нь «Нийт ажилтан» KPI-тай тэнцэхгүй.
   */
  const mixSum = useMemo(() => mixTotals(all ? all.labor : [], coEff), [all, coEff]);
  /* ⚠️ Шошгыг `tr()`-ээр боож бичнэ. `Donut` нь `tr(sl.label)` гэж
     ДИНАМИКААР орчуулдаг тул түүхий мөр ч ажиллах МЭТ санагддаг — гэвч
     `i18n-extract` нь ЗӨВХӨН статик `tr('…')` дуудлагыг олдог тул толинд
     түлхүүр нь ороогүй үлдэж, англи хувилбарт «Монгол / Foreign» гэсэн холимог
     тайлбар гардаг байв. */
  const mixSlices = [
    { key: 'mn', label: tr('Монгол'), value: mixSum.mongol, color: 'var(--c1)' },
    { key: 'fr', label: tr('Гадаад'), value: mixSum.gadaad, color: 'var(--c2)' },
  ].filter((x) => x.value > 0);

  /* Өдөр тутмын цувааnууд — сонгосон гүйцэтгэгчийг дагана */
  const byDay = useMemo(() => byDaySeries(all ? all.labor : [], coEff, 'niitAjiltan'), [all, coEff]);
  const techDay = useMemo(() => byDaySeries(all ? all.labor : [], coEff, 'niitTehnik'), [all, coEff]);
  /**
   * Цуваа нь ХУУЧНААС шинэ рүү өснө. Гүйлгэгчийг ТӨГСГӨЛД нь тавьж хамгийн
   * сүүлийн өдрүүдийг шууд харуулна — хэрэглэгч эхлээд «одоо юу болж байна»-г
   * харах ёстой, хагас жилийн өмнөх мөрийг биш.
   *
   * ⚠️ Энэ нь төлөв БИШ, DOM-ын гүйлгэлт тул `useEffect`-д бичихэд зөв.
   * Гүйцэтгэгч солиход цувааны урт өөрчлөгддөг тул хамаарал нь түүний урт.
   */
  const dayScroll = useRef<HTMLDivElement>(null);
  const techScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const el of [dayScroll.current, techScroll.current]) {
      if (el) el.scrollLeft = el.scrollWidth;
    }
    /* ⚠️ Алхам солиход ч дахин ажиллана: сарын цуваа өөр урттай тул
       өмнөх гүйлгэлтийн байрлал утгагүй болно. */
  }, [byDay.length, techDay.length, ajiltanStep, tehnikStep, laborFocus]);

  /**
   * Шүүлт солигдоход зураг тэр объектууд руу нисэнэ (irgediin-hurteemj).
   * ⚠️ Хөндлөн шүүлтийн `layerWhere`-ээс ослын WHERE-ийг өгнө — шүүлтгүй бол
   * бүсээр, тэр ч байхгүй бол бүтэн хүрээ.
   */
  useZoomToFilter({
    zone,
    layerId: layerWhere?.['habea:osol'] ? 'habea:osol' : null,
    where: layerWhere?.['habea:osol'] ?? null,
  });

  /* Осол, зөрчил */
  const incByType = riskRed(categoryColors(topN(countBy(fInc, (x) => x.type), 4)));
  const incByCause = countBy(fInc.filter((x) => x.cause !== '—'), (x) => x.cause);
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
  const incByCompany = leadRed(countBy(fInc, (x) => x.company));
  const incByPkg = byPkg(inc, () => 1);
  const recent = [...fInc].sort((a, b) => b.d - a.d).slice(0, 6);
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
  const craneByStatus = countBy(fCrane, (x) => x.tuluv)
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
  const craneByPkg = byPkg(cranes, () => 1);
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
  const coAll = useMemo(() => companyTotals(all ? all.labor : []), [all]);
  const coOptions = coAll
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
  const byMonth = useMemo(() => byMonthSeries(byDay), [byDay]);
  const techMonth = useMemo(() => byMonthSeries(techDay), [techDay]);

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
      if (x.bagtsK && !m.has(x.bagtsK)) m.set(x.bagtsK, tr(x.bagtsRaw) || x.bagtsK);
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
      const k = bagtsKey(co.bagts);
      if (k && !m.has(k)) m.set(k, tr(co.bagts.replace(/\s*-\s*/, ' ').trim()));
    }
    return [...m.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => cmpPkg(a.label, b.label));
  }, [inc, cranes, labor.rows]);

  /* Шүүлтийн чипийн нэр — аль ч эх сурвалжийн түүхий бичиглэлээс */
  const pkgLabel = pkg
    ? [...incByPkg, ...craneByPkg, ...byPkg(labor.rows, (x) => x.ajiltan)]
        .find((x) => x.key === pkg)?.label ?? pkg
    : null;
  /** Сонгосон гүйцэтгэгчийн бүтэн нэр — чипэнд богино кодын оронд гарна */
  /* ⚠️ `coEff`-ээр: багцаар шүүсэн үед ч цувааны толгойд «бүх компани»
     гэж бичигдэхгүй, тухайн гүйцэтгэгчийн нэр гарна. */
  const coLabel = coEff
    ? HABEA.labor.companies.find((c) => c.sfx === coEff)?.label ?? coEff
    : null;

  /**
   * Идэвхтэй шүүлт бүрийн чип. Гүйцэтгэгч сонгосон үед `pkg` нь автоматаар
   * тавигддаг тул ХОЁР чип гарган хэрэглэгчийг эргэлзүүлэхгүй — гүйцэтгэгчийн
   * ганц чипээр төлөөлүүлж, түүнийг арилгахад хоёулаа цуцлагдана.
   */
  const chips: { dim: Dim2 | null; label: string; value: string; clear: () => void }[] = [];
  if (co) {
    chips.push({
      dim: 'co',
      label: DIM_LABEL.co,
      value: coLabel ?? co,
      clear: () => setSel((s) => ({ ...s, co: null, pkg: null })),
    });
  } else if (pkg) {
    chips.push({
      dim: 'pkg', label: DIM_LABEL.pkg, value: pkgLabel ?? pkg,
      clear: () => setSel((s) => ({ ...s, pkg: null })),
    });
  }
  (['incType', 'cause', 'incCompany', 'craneState'] as const).forEach((d) => {
    const v = sel[d];
    if (v) chips.push({ dim: d, label: DIM_LABEL[d], value: v, clear: () => setSel((s) => ({ ...s, [d]: null })) });
  });
  if (picked) {
    chips.push({
      dim: null,
      label: picked.id === 'habea:osol' ? tr('Сонгосон осол') : tr('Сонгосон кран'),
      value: picked.id === 'habea:osol'
        ? text(picked.attrs[I.turul], `#${pickOsol}`)
        /* ⚠️ Дугааргүй кран (21/50) — «—» биш `#OBJECTID` гэж нэрлэнэ */
        : text(picked.attrs[C.dugaar], '') || `#${pickCraneOid}`,
      clear: () => setPicked(null),
    });
  }

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
        <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
          <Empty label={tr('ХАБЭА ачаалахад алдаа гарлаа')} />
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
        {kpiTile(pkg || co ? '—' : num(labor.cum.ajiltan), tr('Нийт ажилтан'))}
        {kpiTile(pkg || co ? '—' : num(labor.cum.hunTsag), tr('Хүн цаг'))}
        {kpiTile(pkg || co ? '—' : num(labor.cum.tehnik), tr('Нийт ажилласан техник'))}
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
        {kpiTile(
          craneUp === fCrane.length ? num(fCrane.length) : `${num(craneUp)}/${num(fCrane.length)}`,
          tr('Кран'),
          craneUp === fCrane.length ? undefined : tr('идэвхтэй'),
        )}
        {kpiTile(num(fInc.length), tr('Осол, зөрчил'))}

      </div>

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
              onClick={() => setFocus(on ? null : f.key)}
            >
              <span className={h.incChipLabel}>{f.label()}</span>
              {f.count(fInc.length) != null && (
                <b className={`${h.incChipVal} num`}>{num(f.count(fInc.length) as number)}</b>
              )}
            </button>
          );
        })}

        {/* ── БАГЦААР ШҮҮХ ──
            ⚠️ Гурван эх сурвалж ЦӨМ багцтай тул энэ нь хамгийн ӨРГӨН хамрах
            хүрээтэй шүүлт: осол · кран · ажилтан · газрын зургийн гурван
            давхарга бүгд дагана. Тиймээс компаниас ӨМНӨ байрлана. ── */}
        {pkgOptions.length > 0 && (
          <label className={`${h.pill} ${pkg ? h.pillOn : ''}`}>
            <span className={h.pillLabel}>{tr("Багц")}</span>
            <Select
              label={tr("Багцаар шүүх")}
              value={pkg ?? ''}
              onChange={(v) => setPkg(v || null)}
              options={[
                { key: '', label: tr("Бүх багц") },
                ...pkgOptions,
              ]}
            />
          </label>
        )}

        {coOptions.length > 0 && (<>
          {/* ⚠️ Богино кодын (ХХДМГК…) оронд БҮТЭН нэр. 11 бүтэн нэр чипээр
              ~1,340px эзлэх тул унжих жагсаалт болгов — нэг удирдлага, гүйлгэх
              шаардлагагүй. Хоосон утга = бүх компани (шүүлт цуцлах). */}
          <label className={`${h.pill} ${co ? h.pillOn : ''}`}>
            <span className={h.pillLabel}>{tr("Компани")}</span>
            <Select
              label={tr("Компаниар шүүх")}
              value={co ?? ''}
              onChange={(v) => setCompany(v || null)}
              options={[
                { key: '', label: tr("Бүх компани") },
                ...coOptions.map((c) => ({ key: c.key, label: c.label })),
              ]}
            />
          </label>
          {co && (
            <span className={h.coNote}>
              {coAll.find((c) => c.key === co)?.bagtsK
                ? tr('{0} хүн-өдөр', num(coAll.find((c) => c.key === co)?.ajiltan ?? 0))
                : tr('багц заагаагүй — осол, кран шүүгдэхгүй')}
            </span>
          )}
        </>)}
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
      <div className={h.list}>
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
        <Section
          title={tr("Монгол, гадаад")}
          note={tr("{0} ажилтан", num(mixSum.mongol + mixSum.gadaad))}
          fill
        >
          {mixSlices.length
            ? (
              <Donut
                items={mixSlices}
                stack
                size={132}
                center={num(mixSum.mongol + mixSum.gadaad)}
                centerLabel={tr("ажилтан")}
              />
            )
            : <Empty label={tr("Задаргаа бүртгэгдээгүй")} />}
        </Section>
        <Section
          title={tr("Компаниар — монгол, гадаад")}
          note={mixByCo.length ? tr("гадаадын хувиар") : undefined}
          fill
        >
          {mixByCo.length
            ? (
              <div className={h.mixList}>
                {mixByCo.map((x) => (
                  <div key={x.key} className={h.mixRow}>
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

        {uzlegKind && <UzlegLeft st={uz} />}
        {incOpen && (<>
        <Section title={tr('Осол, зөрчил — төрлөөр')} note={tr('{0} бүртгэл', num(fInc.length))} tone="primary">
          {incByType.length
            ? <Donut items={incByType} stack size={110} center={num(fInc.length)} centerLabel={tr('нийт')}
                selected={sel.incType} onSelect={(k) => k !== '__other' && toggleDim('incType', k)} />
            : <Empty label={tr('Бүртгэл алга')} />}
        </Section>
        <Section title={tr('Шалтгааны төрөл')} note={tr('{0} бүртгэл', num(causeTotal))}>
          {causeSlices.length
            ? <Donut items={causeSlices} stack size={110} center={num(causeTotal)} centerLabel={tr('нийт')}
                selected={sel.cause} onSelect={(k) => toggleDim('cause', k)} />
            : <Empty label={tr('Шалтгаан тэмдэглэгдээгүй')} />}
        </Section>
        </>)}
      </div>

      {/* ── ТӨВ: газрын зураг — «Ерөнхий мэдээлэл»-ийн бүтэц ЯГ ХЭВЭЭРЭЭ ── */}
      <div className={h.map}>
        <MapCanvas
          dim={dim}
          visible={visible}
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
            visible={visible}
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
              {pickRows(picked.id, picked.attrs).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            {picked.id === 'habea:osol' && <IncPhotos oid={nn(picked.attrs['objectid'])} />}
          </div>
        )}

        <div className={o.legend}>
          {visible.slice(0, 8).map((id) => {
            const Ld = LAYER_BY_ID[id];
            return Ld ? (
              <span key={id} className={o.legendItem} title={Ld.title}>
                <i style={{ background: Ld.hue }} />{Ld.title}
              </span>
            ) : null;
          })}
          {visible.length > 8 && <span className={o.legendMore}>+{visible.length - 8}</span>}
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
      <div className={h.r}>
        {/* ── ОСЛЫН ФОКУС: дэлгэрэнгүй жагсаалт ЭНД (зүүнээс зөөгдсөн) ──
            ⚠️ Жагсаалт нь дотроо гүйлгэгддэг тул баганын ЦОРЫН ГАНЦ карт
            байх ёстой: хажууд нь өөр карт тавибал хоёулаа хагасхан өндөртэй
            болж, аль нь ч уншигдахгүй. ── */}
        {incOpen && (
        <Section title={tr('Ослын дэлгэрэнгүй мэдээлэл')} note={tr('дарж дэлгэрэнгүй')}>
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
                  <span className={h.incDate}>{date(x.d)}</span>
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

        {uzlegKind && <UzlegRight st={uz} />}

        {/* ── ХҮН ХҮЧНИЙ ФОКУС — БАРУУНД КОМПАНИАР хүний тоо ──
            ⚠️ Дарахад тухайн гүйцэтгэгчээр БҮХ хуудас шүүгдэнэ
            (`setCompany`) — доорх өдрийн цуваа, зүүн талын
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
                onSelect={(k) => setCompany(coEff === k ? null : k)}
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
                onSelect={(k) => setCompany(coEff === k ? null : k)}
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
        <Section title={tr('Цамхагт кран — төлөв')}>
          {craneByStatus.length
            ? <Donut items={craneByStatus} stack size={110} center={num(fCrane.length)} centerLabel={tr('кран')}
                selected={sel.craneState} onSelect={(k) => toggleDim('craneState', k)} />
            : <Empty label={tr('Бүртгэл алга')} />}
        </Section>
        <Section title={tr('Кран — багцаар')} note={tr('дарж бүгдийг шүүнэ')}>
          {craneByPkg.length
            ? <Bars items={craneByPkg} selected={pkg} onSelect={togglePkg} />
            : <Empty label={tr('Бүртгэл алга')} />}
        </Section>
        </>)}
      </div>
      )}

      {/* ── ДООД зурвас — бүтэн өргөн, хумилтгүй. Агуулга нь ФОКУСААС
          хамаарна (2026-09-06): анхны харагдац ба «Техник болон хүн цаг»
          үед ажилтан/техникийн цуваа, ослын фокуст зураг + компаниар,
          үзлэгийн фокуст гүйцэтгэгч + талбай + сараар. «Осол, зөрчил —
          багцаар» хасагдсан; багцаар шүүх нь «Кран — багцаар»-т үлдсэн. ── */}
      {/* ⚠️ `data-cols` нь БАГАНЫН ТООГ сольдог. Тогтмол 4 багана
          үлдээвэл 2 картын горимд тэдгээр нь зүүн хагаст шахагдаж, баруун
          тал хоосон үлдэнэ. Горим бүрд:
            осол   → 2 (зураг · компаниар)
            хүн хүч → 2 (ажилтан · техник)
            үзлэг  → 1 (сараар, бүтэн өргөн; гүйцэтгэгч · талбай нь
                        баруун баганад — `UzlegRight`) */}
      <div className={h.fin} data-cols={uzlegKind ? '1' : '2'}
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

        {uzlegKind && <UzlegFin st={uz} />}

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
              : (byMonth.length ? tr("{0} · {1} сар", coLabel ?? tr("бүх компани"), num(byMonth.length)) : null))}
        >
          {(aStep === 'day' ? byDay : byMonth).length
            ? (
              <div className={h.dayScroll} ref={dayScroll}>
                <div style={{ minWidth: `${Math.max(100, ((aStep === 'day' ? byDay : byMonth).length / DAYS_VISIBLE) * 100)}%` }}>
                  <Series
                    items={aStep === 'day' ? byDay : byMonth}
                    height={110}
                    unit={aStep === 'day' ? tr("ажилтан") : tr("хүн-өдөр")}
                    line
                    showValues
                  />
                </div>
              </div>
            )
            : surveyEmpty}
        </Section>
        {/* Техник ӨДРӨӨР — ажилтны цувааны ХАЖУУД, ижил хэлээр, ижил өргөнд.
            Хоёулаа `DAYS_VISIBLE` өдөр зэрэг харуулна. */}
        <Section
          title={tStep === 'day' ? tr("Техник — өдрөөр") : tr("Техник — сараар")}
          note={stepNote(tStep, setTehnikStep,
            tStep === 'day'
              ? (techDay.length ? tr("{0} · {1}", coLabel ?? tr("бүх компани"), num(totalTech)) : null)
              : (techMonth.length ? tr("{0} · {1} сар", coLabel ?? tr("бүх компани"), num(techMonth.length)) : null))}
        >
          {(tStep === 'day' ? techDay : techMonth).length
            ? (
              <div className={h.dayScroll} ref={techScroll}>
                <div style={{ minWidth: `${Math.max(100, ((tStep === 'day' ? techDay : techMonth).length / DAYS_VISIBLE) * 100)}%` }}>
                  <Series
                    items={tStep === 'day' ? techDay : techMonth}
                    height={110}
                    unit={tStep === 'day' ? tr("нэгж") : tr("нэгж-өдөр")}
                    line
                    showValues
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
        {/* ⚠️ Үзлэгийн горимд ГАНЦ карт тул ЗААГ байхгүй — бариул ч байхгүй */}
        {!uzlegKind && (
          <div className={h.gripCol} style={{ gridColumn: 1, gridRow: 1, right: -8 }} {...panes.grip('fin1')} />
        )}
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
      {focus === null && (
        <div className={h.gripCol} style={{ gridArea: 'r', left: -8 }} {...panes.grip('r')} />
      )}
      <div className={h.gripRow} style={{ gridArea: 'fin', top: -8 }} {...panes.grip('fin')} />
    </div>
  );
}
