'use client';

/**
 * ТӨСЛИЙН ҮЙЛ АЖИЛЛАГААНЫ СХЕМ.
 *
 * ⚠️ ХОЁР ТОПОЛОГИ (2026-09-01, хэрэглэгч: «схем хэт ерөнхий байна … үйл
 * ажиллагааг илүү нарийн, нэг бүрчлэн харуулдаг ОЛОН КАРТТАЙ схем болго»):
 *
 *   «Ерөнхий»     — `schem.ts`-ийн 10 карт. Төслийн мөчлөгийн товч зураг.
 *   «Дэлгэрэнгүй» — `schemFine.ts`-ийн 26 карт. АЖИЛЛАГАА БҮР өөрийн хайрцагтай:
 *                   зөвшөөрсөн · хүлээгдэж буй · татгалзсан · чөлөөлсөн ·
 *                   үлдсэн · тайлагнасан блок · тайлангүй блок · хяналтын 6
 *                   шат · шилжүүлсэн · төсөв · гэрээ · олголт …
 *
 * ⚠️ ЗУРАХ АРГА: карт нь HTML `<button>` (үнэмлэхүй байрлалтай), ирмэг нь
 * түүний АРД байрлах НЭГ `<svg>`. Хоёулаа `layoutOf()`-ийн НЭГ координатыг
 * хэрэглэнэ тул хэзээ ч зөрөхгүй. HTML карт сонгосон шалтгаан: focus ring,
 * tab дараалал, текстийн тайрал, сэдвийн token бүгд үнэгүй ирнэ.
 *
 * ⚠️ БҮХ ТООЦОО `schem.ts` · `schemFine.ts` · `schemDetail.ts`-д (React-гүй) —
 * `*.check.mjs` тэднийг шууд шалгана. Энд зөвхөн зурах ажил.
 *
 * ⚠️ КАРТ ДАРАХАД ХАРАГДАЦ РУУ ҮСРЭХГҮЙ. Дарахад дэлгэрэнгүй САМБАР нээгдэнэ;
 * шилжилт нь самбар доторх ИЛ товч. Урьд нь дарах = шилжих байсан тул схем
 * дээр байж дэлгэрэнгүйг харах арга ОГТ байхгүй байв.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr, getDictEpoch, getLocaleGeneration } from '@/lib/i18nCore';
import { Data } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useAsync } from '@/lib/useAsync';
import { num, pct, mnt } from '@/lib/format';
import { bagtsKey, type LayerDef, type ViewKey } from '@/lib/services';
import { qtyText } from '@/lib/totals';
import { readParam, writeParams } from '@/lib/urlState';
import { STAGE_LABEL } from '@/lib/hyanaltGroup';
import {
  NODES, NODE_BY_ID, EDGES, GEO, PROJECT_WIDE, buildSchem, edgeLabelAt, edgePath, layoutOf, pkgRow,
  stageRail, topoOrder,
  type Box, type EdgeKind, type Geo, type Health, type Metric, type SchemId,
  type SchemSources, type SchemState,
} from '@/lib/schem';
import {
  FINE_NODES, FINE_EDGES, FINE_BY_ID, GEO_FINE, fineOrder,
} from '@/lib/schemFine';
import {
  alertsByCard, cardStat, nodeDetail, worstTone,
  type CardStat, type Cell, type Issue,
} from '@/lib/schemDetail';
import { loadSchemSources } from '@/lib/schemData';
import c from './schem.module.css';

/* ══════════════════ Туслах ══════════════════ */

/**
 * ДАГАЛДАХ ТООЦООНЫ КЭШ — `src` × багц × нарийвчлал × хэл.
 *
 * ⚠️ 2026-10-09: `buildSchem` · `stageRail` · `alertsByCard` · 24 картын `cardStat` нь
 *    `Data`-гийн render prop ДОТОР дуудагддаг тул (hook хэрэглэх боломжгүй) карт сонгох,
 *    самбар нээх зэрэг ямар ч төлөвийн өөрчлөлтөд БҮГД дахин бодогддог байв. `src` нь
 *    ачаалал бүрд ШИНЭ объект тул `WeakMap`-ийн түлхүүр болж, хуучин нь өөрөө цэвэрлэгдэнэ.
 * ⚠️ Хэлний үе (`getLocaleGeneration` · `getDictEpoch`) түлхүүрт ОРНО — тооцоо нь `tr()`
 *    мөр үүсгэдэг тул хэл солиход хуучин хэлний мөр үлдэхгүй.
 */
type Derived = {
  state: ReturnType<typeof buildSchem> | null;
  rail: ReturnType<typeof stageRail>;
  alerts: Map<string, Issue[]>;
  alertN: number;
  stats: Map<string, CardStat>;
};
const DERIVED = new WeakMap<SchemSources, Map<string, Derived>>();

function derivedOf(src: SchemSources, pkg: string | null, fine: boolean): Derived {
  let per = DERIVED.get(src);
  if (!per) { per = new Map(); DERIVED.set(src, per); }
  const key = `${pkg ?? ''}|${fine ? 1 : 0}|${getLocaleGeneration()}|${getDictEpoch()}`;
  const hit = per.get(key);
  if (hit) return hit;
  /* ⚠️ Нарийвчилсан горимд амьд тоо ОГТ бодогдохгүй — карт дээр
     гарахгүй тул тооцох ч шаардлагагүй. */
  const state = fine ? null : buildSchem(src, pkg);
  const rail = stageRail(src, pkg);
  /* ⚠️ Горим солиход ДАХИН бодогдоно: ерөнхий схемд бүлгээр,
     нарийвчилсанд карт бүрээр түлхүүрлэгддэг (`alertsByCard`). */
  const alerts = alertsByCard(src, pkg, fine);
  const alertN = [...alerts.values()].reduce((a, l) => a + l.length, 0);
  /**
   * ⚠️ ЗӨВХӨН НАРИЙН схемд. Ерөнхийд `buildSchem` картад 3–6 метрик
   * аль хэдийн тавьдаг тул давхардуулбал нэг тоо хоёр удаа бичигдэнэ.
   */
  const stats = new Map<string, CardStat>();
  if (fine) {
    for (const n of FINE_NODES) {
      const s = cardStat(src, pkg, n.id);
      if (s) stats.set(n.id, s);
    }
  }
  const out: Derived = { state, rail, alerts, alertN, stats };
  per.set(key, out);
  return out;
}

/**
 * Төлөвийн ҮГ — өнгө ганцаараа хангалтгүй (өнгө сохор, хар цагаан хэвлэлт).
 *
 * ⚠️ ЭНЭ ЯАГААД ТОЛЬ БИШ, ФУНКЦ ВЭ. Урьд нь `Record<Health, string>` байж
 * дэлгэцэд толины утгыг `tr()` рүү ДИНАМИКААР дамжуулдаг байв. `i18n-extract`
 * нь зөвхөн СТАТИК мөрийн аргументыг цуглуулдаг тул эдгээр дөрвөн түлхүүрийг
 * «хэрэглэгдээгүй» гэж үзэж, «ДУТУУ 0» гэж ХУДАЛ ногоон гаргаж байсан.
 * ⚠️ Модулийн түвшинд `tr()` дуудахгүй — хэл солиход дахин бодогдох ёстой.
 */
const healthText = (h: Health): string => (
  h === 'good' ? tr('Хэвийн')
    : h === 'warn' ? tr('Анхаарах')
      : h === 'bad' ? tr('Эрсдэлтэй')
        : tr('Мэдээлэлгүй')
);
const HEALTH_TAG: Record<Health, string> = {
  good: c.hGood, warn: c.hWarn, bad: c.hBad, none: c.hNone,
};
const HEALTH_BORDER: Record<Health, string> = {
  good: c.bGood, warn: c.bWarn, bad: c.bBad, none: c.bNone,
};
const HEALTH_SWATCH: Record<Health, string> = {
  good: c.legGood, warn: c.legWarn, bad: c.legBad, none: c.legNone,
};

/**
 * `qtyText`-ийн нэгжийн тодорхойлолт — талбай м²-аар (1 га-аас бага бол «N м²»).
 * ⚠️ `qtyText` зөвхөн `d.qty`-г уншина; бусад талбар хэрэггүй.
 */
const AREA_QTY = { qty: { field: '', unit: 'м²' } } as LayerDef;

/**
 * Метрикийн бичиглэл.
 * ⚠️ `null` нь «—» болно, 0 БИШ. `pct()` нь 100-аар үржүүлдэггүй тул утга нь
 *    аль хэдийн 0–100 масштабтай ирсэн байх ёстой (`schem.ts`-ийн гэрээ).
 */
function show(m: Metric): string {
  if (m.value == null) return '—';
  switch (m.kind) {
    case 'pct': return pct(m.value, 0);
    case 'mnt': return mnt(m.value);
    /* ⚠️ Энд ирж буй утга (`areaHa`, `remainingHa`) АЛЬ ХЭДИЙН га — `format.ts::ha()`
       шууд өгвөл 10,000 дахин жижигрэнэ.
       ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): жижиг үлдэгдэл «0.0 га» гэж хэмжилтгүй мэт
       гардаг байв — `qtyText` (м² руу буцааж) 1 га-аас бага бол «N м²». */
    case 'ha': return qtyText(AREA_QTY, m.value * 10_000) ?? '—';
    case 'day': return tr('{0} хоног', num(m.value));
    /* ⚠️ 2026-09-25: БУТАРХАЙ тоог 2 оронтой — «1000 ажилтанд ногдох осол» нь
       `count` төрөлтэй бөгөөд 1 осол / 2,500 ажилтан = 0.4-ийг `num(v)` «0» гэж
       бүхэлчилж, осол БАЙХГҮЙ мэт уншуулдаг байв. Бүхэл тоо хэвээр 0 оронтой. */
    default: return num(m.value, Number.isInteger(m.value) ? 0 : 2);
  }
}

/**
 * Хүснэгтийн нүд.
 * ⚠️ Метриктэй ИЖИЛ дүрмээр — `null` нь «—». Тоон нүдэнд `kind` өгөгдсөн бол
 *    метрикийн хэлбэржүүлэлт дамжина, эс тэгвээс түүхий текст.
 */
function cellText(x: Cell): string {
  if (x.v == null) return '—';
  if (x.kind && typeof x.v === 'number') return show({ label: '', value: x.v, kind: x.kind });
  return String(x.v);
}

/* ══════════════════ Нэг карт ══════════════════ */

/**
 * Зурагдах карт — ХОЁУЛАНГ НЬ (ерөнхий 10, нарийн 24) нэг хэлбэрт оруулсан.
 * ⚠️ `group` нь ДЭЛГЭРЭНГҮЙ САМБАР аль бүлгийг нээхийг заана: «Хяналтын
 *    инженер» карт дарахад бүхэл хяналтын самбар нээгдэнэ. Карт бүрд тусдаа
 *    самбар бичвэл нэг дүрэм 24 газар давхардана.
 */
type Card = {
  id: string;
  group: SchemId;
  title: string;
  desc: string;
  icon: string;
  view: ViewKey | null;
  /** ⚠️ Торны байрлал — `layoutOf` энэ хоёроос координат гаргана */
  col: number;
  row: number;
};

/**
 * КАРТ ДЭЭР ХАРУУЛАХ АНХААРУУЛГЫН ДЭЭД ТОО.
 *
 * ⚠️ Хоёроор хязгаарлав: 24 картын зарим нь 40 хүртэл мөртэй байж болно
 * (жишээ нь «төлөв танигдсангүй» бүр өөрийн мөртэй). Бүгдийг картад бичвэл
 * зураг уншигдахаа болино. Үлдсэнийг НУУХГҮЙ — «… бас N» гэсэн мөр ил гарч,
 * бүтэн жагсаалт нь картыг дарахад нээгдэх самбарт байна.
 */
const CARD_ALERTS = 2;

/**
 * ⚠️ ЕРӨНХИЙ схемд ЗӨВХӨН НЭГ мөр. Тэнд карт нь 3–6 метрик, хяналтын зурвас,
 * тэмдэглэл, шошготой бөгөөд торны өндөр (`GEO.h` = 140) нь тэднээр аль хэдийн
 * дүүрсэн байдаг. Хоёр мөр нэмэхэд «Барилга угсралт» карт торноосоо хальж
 * доорх «ХАБЭА»-тай ДАВХЦАЖ байсан (2026-09-02-нд нүдээр барив).
 */
const CARD_ALERTS_COARSE = 1;

function Node({
  card, st, alerts, stat, box, rail, fine, wide, allowed, selected, onOpen,
}: {
  card: Card;
  /**
   * Энэ картын тоо ТӨСЛИЙН НИЙТ (багцаар задардаггүй) эсэх.
   * ⚠️ 2026-09-25: `st.projectWide` зөвхөн ерөнхий схемд байдаг — нарийн схемд
   *    `st` нь `null` тул багц сонгосон ч «Чөлөөлсөн талбар» зэрэг төслийн тоо
   *    тэмдэггүй, багцынх мэт харагддаг байв (`PROJECT_WIDE`).
   */
  wide: boolean;
  /**
   * ЭНЭ картад хамаарах анхааруулгууд (`alertsByCard`).
   * ⚠️ Хоосон массив нь «асуудалгүй», `null` БИШ — тиймээс шошго огт гарахгүй.
   */
  alerts: Issue[];
  /**
   * КАРТЫН ҮР ДҮН — «энэ ажиллагаа хаана хүрсэн бэ» (`cardStat`).
   * ⚠️ Зөвхөн НАРИЙН схемд. Ерөнхийд `st.metrics` аль хэдийн 3–6 тоо үзүүлдэг
   *    тул давхардуулбал нэг карт нэг тоог хоёр удаа бичнэ.
   */
  stat: CardStat | null;
  /**
   * Амьд төлөв. `null` бол ПРОЦЕССЫН карт — зөвхөн юу хийгддэг нь бичигдэнэ.
   * ⚠️ Нарийвчилсан схемд ЗОРИУДААР `null`: 24 карт тус бүр 2 тоо, төлвийн
   * шошготой байхад зураг уншигдахаа больж, «ямар ажиллагаа явдаг вэ» гэсэн
   * үндсэн асуулт тоонуудын дунд алдагдаж байв.
   */
  st: SchemState | null;
  /** `null` бол БОСОО жагсаалтын горим — байрлал нь урсгалаар тодорхойлогдоно */
  box: Box | null;
  rail: { stage: string; n: number }[] | null;
  /** Нарийн схемийн карт — жижиг үсэг, нягт зай */
  fine: boolean;
  allowed: boolean;
  selected: boolean;
  onOpen: (cardId: string, g: SchemId) => void;
}) {
  const stacked = box == null;
  /**
   * ⚠️ АНХААРУУЛГЫН ӨНГӨ нь метрикийн төлөвөөс ДАВАМГАЙЛАХГҮЙ. Ерөнхий горимд
   * `st.health` нь тоонуудаас бодогдсон бөгөөд хоёуланг нь зэрэг будвал нэг
   * карт хоёр өөр өнгө заана. Тиймээс хүрээг зөвхөн `st` БАЙХГҮЙ үед
   * (нарийвчилсан горим) анхааруулга тодорхойлно.
   */
  const tone = alerts.length ? worstTone(alerts) : null;
  /**
   * ⚠️ ХҮРЭЭНИЙ ӨНГӨ — эрэмбэ: метрикийн төлөв → анхааруулга → ҮР ДҮНГИЙН
   * төлөв. Сүүлийнх нь ЗААВАЛ: анхааруулгагүй карт ч «хэвийн» (ногоон) ба
   * «тооцоологдоогүй» (саарал) хоёрын алийг нь ч хэлэх ёстой — эс бөгөөс
   * хоёулаа ижилхэн өнгөгүй харагдана.
   */
  const border = st ? HEALTH_BORDER[st.health]
    : tone ? HEALTH_BORDER[tone]
      : stat ? HEALTH_BORDER[stat.tone] : '';
  /**
   * ⚠️ АНХААРУУЛГАТАЙ КАРТ БҮХЭЛДЭЭ ЯЛГАРНА (2026-09-02, хэрэглэгч:
   * «анхааруулгатай нь ялгагдахгүй байна»). Карт бүр үр дүнгийн өнгөтэй
   * болсноор зүүн ирмэгийн 2px зураас ганцаараа анхааруулгыг ялгахаа больсон.
   * Тиймээс warn/bad анхааруулгатай картад бүтэн өнгөт хүрээ + бүдэг өнгөт
   * дэвсгэр + толгойд «⚠ N» шошго. `none` (эх сурвалж унасан) нь ялгарахгүй —
   * «мэдээлэлгүй» бол дуудлага биш, саарал байх нь зөв.
   */
  const alarm = tone === 'bad' ? c.aBad : tone === 'warn' ? c.aWarn : '';
  /* ⚠️ Товч бичээст (tooltip) БҮГД орно — картад хоёр л мөр багтана */
  const tip = [
    card.desc,
    ...(stat ? [`${stat.label}: ${show(stat)}${stat.why ? ` (${stat.why})` : ''}`] : []),
    ...(wide ? [tr('төслийн нийт')] : []),
    ...alerts.map((a) => `⚠ ${a.text}`),
    tr('Дарж дэлгэрэнгүйг харна'),
  ].join('\n');

  return (
    <button
      type="button"
      className={[
        c.node,
        fine ? c.fineNode : '',
        border,
        alarm,
        wide ? c.wide : '',
        stacked ? c.stackNode : '',
        selected ? c.sel : '',
      ].filter(Boolean).join(' ')}
      /* ⚠️ `height` БИШ `minHeight`: тэмдэглэлтэй карт агуулгаараа тэлнэ,
         торны утга нь зөвхөн ДООД хязгаар. */
      style={box ? { left: box.x, top: box.y, width: box.w, minHeight: box.h } : undefined}
      /* ⚠️ ЭРХГҮЙ ХЭРЭГЛЭГЧИД Ч ДАРАГДАНА. Самбар нь ЗӨВХӨН уншина — эрх нь
         зөвхөн ХАРАГДАЦ РУУ ШИЛЖИХИЙГ хаана (самбар доторх товч). */
      aria-expanded={selected}
      /* ⚠️ 2026-10-06 (аудит): самбар хаагдахад фокусыг ЭНЭ карт руу буцаана (`Schem`-ийн `pick` эффект) */
      data-schem-card={card.id}
      title={tip}
      onClick={() => onOpen(card.id, card.group)}
    >
      <span className={c.nodeHead}>
        <span className={c.nodeIcon}><Icon name={card.icon} size={fine ? 11 : 13} /></span>
        <span className={c.nodeTitle}>{card.title}</span>
        {/* ⚠️ ТОО нь ЗААВАЛ — «энэ карт дээр ХЭДЭН асуудал вэ» гэдгийг хүрээний
            өнгө хэлдэггүй; ⚠ тэмдэг нь өнгө сохор хараанд ч ялгаж өгнө. */}
        {alarm && (
          <span className={`${c.aBadge} ${tone === 'bad' ? c.hBad : c.hWarn}`}>
            ⚠ {alerts.length}
          </span>
        )}
      </span>

      {/**
        * КАРТЫН ТОДОРХОЙЛОЛТ — «тайлагнасан блок гэж юу вэ» гэсэн асуулт
        * зурган дээрээс шууд хариулагдана.
        * ⚠️ ЗӨВХӨН нарийвчилсан горимд. «Ерөнхий» картад гурван үзүүлэлт,
        * зурвас, тэмдэглэл аль хэдийн багтсан тул нэмбэл доод мөр тасарна —
        * тэнд тайлбар нь hover-ийн бичээс хэвээр.
        */}
      {fine && <span className={c.nodeDesc}>{card.desc}</span>}

      {/**
        * КАРТЫН ҮР ДҮН (2026-09-02, хэрэглэгч: «карт болгон дээр үр дүнгийн
        * alert харагдана»).
        *
        * ⚠️ КАРТ БҮРД ГАРНА — асуудалгүй ч гэсэн. Урьд нь зөвхөн асуудалтай 6
        * картад дохио гардаг байсан тул үлдсэн 18 нь «шалгаад хэвийн гарсан»
        * уу, «огт тооцоологдоогүй» юу гэдэг нь ялгагдахгүй байв.
        *
        * ⚠️ ЯГ НЭГ ТОО. 2026-09-01-нд картуудаас метрик хасагдсан шалтгаан
        * (24 карт × 3 тоо = зураг уншигдахаа болих) хүчинтэй хэвээр — тиймээс
        * тухайн ажиллагааны ГОЛ үр дүнг л сонгоно, бусад нь самбарт.
        */}
      {stat && (
        <span className={`${c.stat} ${HEALTH_TAG[stat.tone]}`}>
          <span className={c.statLabel}>{stat.label}</span>
          <span className={`${c.statValue} ${stat.value == null ? c.mNone : ''}`}>
            {show(stat)}
          </span>
        </span>
      )}

      {/* ХЯНАЛТЫН ЗУРГААН ЦЭГ — «Ерөнхий» горимд төлөвийн машиныг ил үлдээнэ.
          ⚠️ «Дэлгэрэнгүй» горимд ХЭРЭГГҮЙ: тэнд зургаан шат нь бие даасан карт. */}
      {st && rail && (
        <span className={c.rail}>
          {rail.map((r, i) => (
            <span key={r.stage} className={`${c.railDot} ${r.n > 0 ? c.railOn : ''}`}
              title={`${STAGE_LABEL[r.stage as keyof typeof STAGE_LABEL]}: ${num(r.n)}`}>
              {i > 0 && <span className={c.railSep}>›</span>}
              <i aria-hidden />
              {num(r.n)}
            </span>
          ))}
        </span>
      )}

      {st && (
      <span className={c.metrics}>
        {st.metrics.map((m) => (
          <span key={m.label} className={c.metric} title={m.why ?? undefined}>
            <span className={c.mLabel}>{m.label}</span>
            <span className={`${c.mValue} ${m.value == null ? c.mNone : ''}`}>{show(m)}</span>
          </span>
        ))}
      </span>
      )}

      {st?.note && <span className={c.note} title={st.note}>{st.note}</span>}

      {/**
        * ПРОЦЕССЫН АНХААРУУЛГА (2026-09-02, хэрэглэгч: «процессын үед ямар
        * alert байгааг харуулна»).
        *
        * ⚠️ ЗӨВХӨН ӨНГӨ ХАНГАЛТГҮЙ — ҮГ нь заавал гарна. Хүрээний өнгө нь «энд
        * ямар нэг юм болж байна» гэдгийг л хэлдэг; «юу болж байгааг» уншихын
        * тулд картыг дарах шаардлагатай байв.
        *
        * ⚠️ МЕТРИКИЙН ДАРАА — картын гол агуулга нь ТОО. Урьд нь тодорхойлолтын
        * доор байсан тул анхааруулга нь тоог доош түлхэж, «Барилга угсралт»
        * карт торны өндрөөс хальж доорх «ХАБЭА»-тай ДАВХЦАЖ байв.
        *
        * ⚠️ ТАСАЛСАН ТООГ НУУХГҮЙ: «… бас N» мөр нь энэ карт дээр илүү олон
        * асуудал байгааг хэлнэ — эс бөгөөс хэрэглэгч эхний мөрийг «бүгд» гэж
        * уншина. Бүтэн жагсаалт нь картыг дарахад нээгдэх самбарт.
        */}
      {alerts.length > 0 && (
        <span className={c.alerts}>
          {alerts.slice(0, fine ? CARD_ALERTS : CARD_ALERTS_COARSE).map((a, i) => (
            <span key={`${a.tone}-${i}`} className={`${c.alert} ${HEALTH_TAG[a.tone]}`}>
              <i className={c.alertDot} aria-hidden />
              <span className={c.alertText}>{a.text}</span>
            </span>
          ))}
          {alerts.length > (fine ? CARD_ALERTS : CARD_ALERTS_COARSE) && (
            <span className={c.alertMore}>
              {tr('… бас {0} анхааруулга', alerts.length - (fine ? CARD_ALERTS : CARD_ALERTS_COARSE))}
            </span>
          )}
        </span>
      )}

      {/* ⚠️ ПРОЦЕССЫН КАРТАД ЗӨВХӨН «эрхгүй» шошго. Төлвийн өнгө нь тоогүйгээр
          утгагүй — өнгө ганцаараа юу ч хэлэхгүй гэдэг нь энэ репогийн дүрэм. */}
      {(st || wide || (!allowed && card.view)) && (
      <span className={c.tags}>
        {st && <span className={`${c.tag} ${HEALTH_TAG[st.health]}`}>{healthText(st.health)}</span>}
        {wide && <span className={c.tag}>{tr('төслийн нийт')}</span>}
        {!allowed && card.view && <span className={c.tag}>{tr('эрхгүй')}</span>}
      </span>
      )}
    </button>
  );
}

/* ══════════════════ Дэлгэрэнгүй самбар ══════════════════ */

function Panel({
  id, src, pkg, allowed, onGo, onClose,
}: {
  id: SchemId;
  src: SchemSources;
  pkg: string;
  allowed: boolean;
  onGo: (v: ViewKey) => void;
  onClose: () => void;
}) {
  const n = NODE_BY_ID[id];
  const d = useMemo(() => nodeDetail(src, id, pkg || null), [src, id, pkg]);
  /* ⚠️ 2026-09-25: багцаар задардаггүй зангилаа (`PROJECT_WIDE`) багц сонгосон ч
     ТӨСЛИЙН тоо харуулдаг (`nodeDetail`) — гарчигт багцын нэр бичвэл «Багц 3.2»
     дор төслийн 2,088 талбарын чөлөөлөлтийг тэр багцынх мэт уншуулна. */
  const wide = PROJECT_WIDE.has(id);
  /* ⚠️ 2026-10-06 (аудит): самбар DOM-д 26 картын ДАРАА тул нээгдэхэд фокус картад үлдэж,
     гарын хэрэглэгч/дэлгэц уншигч самбарыг олохын тулд бүх картыг Tab-аар туулдаг байв. Нээгдэх
     (эсвэл өөр карт сонгох — `key`) агшинд гарчиг руу фокус шилжинэ. */
  const headRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { headRef.current?.focus(); }, []);

  return (
    <aside className={c.panel} role="complementary" aria-label={n.title}>
      <div className={c.panelHead}>
        <span className={c.nodeIcon}><Icon name={n.icon} size={14} /></span>
        <h3 ref={headRef} tabIndex={-1} className={c.panelTitle}>{n.title}</h3>
        <span className={c.spacer} />
        <button type="button" className={c.xBtn} onClick={onClose}
          title={tr('Хаах')} aria-label={tr('Хаах')}>✕</button>
      </div>

      <p className={c.panelDesc}>{n.desc}</p>
      <p className={c.panelScope}>
        {!pkg ? tr('Төслийн нийт')
          : wide ? `${tr('Төслийн нийт')} · ${tr('багцаар задардаггүй')}` : pkg}
      </p>

      {/**
        * ⚠️ ЭХ СУРВАЛЖИЙН ТӨЛӨВ — «—» гэсэн тоо ЯАГААД хоосон байгааг хэлнэ.
        * Үүнгүйгээр «үйлчилгээ унасан» ба «үнэхээр өгөгдөл байхгүй» хоёр
        * дэлгэц дээр ЯГ адилхан харагдана.
        */}
      {d.sources.length > 0 && (
        <div className={c.pSrc}>
          {d.sources.map((s) => (
            <span key={s.name} className={`${c.srcTag} ${s.ok ? c.srcOk : c.srcBad}`}>
              {s.ok ? `${s.name} ✓` : `${s.name} — ${tr('татагдсангүй')}`}
            </span>
          ))}
        </div>
      )}

      <section className={c.pSec}>
        <h4 className={c.pSecTitle}>{tr('Үзүүлэлт')}</h4>
        <div className={c.pMetrics}>
          {d.metrics.map((m) => (
            <div key={m.label} className={c.pMetric} title={m.why ?? undefined}>
              <span className={c.mLabel}>{m.label}</span>
              <span className={`${c.mValue} ${m.value == null ? c.mNone : ''}`}>{show(m)}</span>
            </div>
          ))}
        </div>
      </section>

      {d.tables.map((t) => (
        <section key={t.title} className={c.pSec}>
          <h4 className={c.pSecTitle}>{t.title}</h4>
          {t.rows.length === 0 ? (
            <p className={c.pEmpty}>{tr('Мөр алга')}</p>
          ) : (
            /* ⚠️ Хүснэгт бүр ӨӨРИЙН гүйлтийн савтай — эс тэгвээс өргөн хүснэгт
               самбарыг тэлж, БҮХ хуудсанд хэвтээ гүйлт үүсгэнэ. */
            <div className={c.pTableWrap}>
              <table className={c.pTable}>
                <thead>
                  <tr>{t.cols.map((col) => <th key={col}>{col}</th>)}</tr>
                </thead>
                <tbody>
                  {t.rows.map((r, i) => (
                    <tr key={`${t.title}-${i}`}>
                      {r.map((x, k) => (
                        <td key={`${t.cols[k] ?? k}`} className={x.v == null ? c.mNone : undefined}>
                          {cellText(x)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {d.issues.length > 0 && (
        <section className={c.pSec}>
          <h4 className={c.pSecTitle}>{tr('Анхаарах')}</h4>
          <ul className={c.pIssues}>
            {d.issues.map((is, i) => (
              <li key={`${is.tone}-${i}`} className={`${c.pIssue} ${HEALTH_TAG[is.tone]}`}>
                {is.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {n.view && (
        /**
         * ⚠️ ЭРХГҮЙ ҮЕД ИДЭВХГҮЙ, НУУГДАХГҮЙ. Дарахад чимээгүй өөр хуудас руу
         * шидвэл хэрэглэгч алдаа гарлаа гэж бодно; идэвхгүй товч нь «энэ хэсэг
         * байгаа ч танд нээлттэй биш» гэдгийг шууд хэлнэ.
         */
        <button type="button" className={c.goBtn} disabled={!allowed}
          onClick={() => n.view && onGo(n.view)}>
          {allowed ? tr('Харагдац руу очих') : tr('Энэ харагдац танд нээлттэй биш')}
        </button>
      )}
    </aside>
  );
}

/* ══════════════════ Зураг ══════════════════ */

type Wire = { from: string; to: string; kind: EdgeKind; label?: string };

function Diagram({
  cards, state, alerts, stats, edges, geo, rail, fine, pkgOn, allowed, openCard, onOpen,
}: {
  /** ⚠️ ТОПОЛОГИЙН дараалалтай — DOM-ийн дараалал = Tab-ийн дараалал */
  cards: Card[];
  /** `null` бол процессын зураг — картууд тоогүй */
  state: Record<string, SchemState> | null;
  /** Картын id → түүнд хамаарах анхааруулгууд (`alertsByCard`) */
  alerts: Map<string, Issue[]>;
  /** Картын id → үр дүн (`cardStat`). Ерөнхий схемд ХООСОН — тэнд метрик бий. */
  stats: Map<string, CardStat>;
  edges: readonly Wire[];
  geo: Geo;
  rail: { stage: string; n: number }[] | null;
  fine: boolean;
  /** Багц сонгогдсон эсэх — нарийн картын «төслийн нийт» тэмдэг зөвхөн тэр үед */
  pkgOn: boolean;
  allowed: (v: ViewKey | null) => boolean;
  /** Сонгогдсон КАРТЫН id — самбар нээсэн карт */
  openCard: string | null;
  onOpen: (cardId: string, g: SchemId) => void;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [k, setK] = useState(1);
  const [stacked, setStacked] = useState(false);

  const L = useMemo(() => layoutOf(cards, geo), [cards, geo]);

  /**
   * ⚠️ БҮХЭЛД НЬ МАСШТАБЛАНА, дахин байрлуулахгүй. Картуудын харьцангуй
   * байрлал нь хэрэглэгчийн ой санамжийн хэсэг — нарийн цонхонд өөр зураг
   * үзүүлбэл өмнө сурсан зүйл нь ажиллахаа болино.
   *
   * ⚠️ 1-ЭЭС ДЭЭШ Ч ТОМРУУЛНА. Урьд нь `Math.min(1, …)` байсан тул том дэлгэц
   * дээр схем нь зүүн дээд буланд жижигхэн үлдэж, доод 60% нь хоосон байв.
   * ⚠️ 1.9-өөс дээш ТОМРУУЛАХГҮЙ · 0.62-оос доош БУУРАХГҮЙ (тэрнээс жижиг бол
   * текст уншигдахаа больдог тул оронд нь БОСОО ЖАГСААЛТ болно).
   */
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth - 16;
      const h = el.clientHeight - 16;
      const raw = Math.min(w / L.w, h / L.h);
      setStacked(el.clientWidth < 760 || raw < 0.62);
      setK(Math.min(1.9, Math.max(0.62, raw)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [L.w, L.h]);

  /**
   * Дэлгэц уншигчид зориулсан урсгалын өгүүлбэр.
   * ⚠️ ИРМЭГЭЭС ҮҮСНЭ, гараар бичигдэхгүй — эс тэгвээс зураг өөрчлөгдөхөд
   *    тайлбар нь хуучраад дэлгэц уншигчид ХУДАЛ зураг өгнө.
   */
  const byId = useMemo(
    () => Object.fromEntries(cards.map((x) => [x.id, x])) as Record<string, Card>,
    [cards],
  );
  const prose = useMemo(
    () => edges.filter((e) => e.kind !== 'back')
      .map((e) => `${byId[e.from].title} → ${byId[e.to].title}`)
      .join('; '),
    [edges, byId],
  );

  const nodeOf = (card: Card, box: Box | null) => {
    const st = state ? state[card.id] ?? null : null;
    /* ⚠️ Ерөнхийд `st.projectWide` (урьдынх шиг үргэлж). Нарийнд ЗӨВХӨН багц
       сонгосон үед — тэмдэг нь «энэ тоо тэр багцынх биш» гэдгийг л хэлэх ёстой;
       нягт зурагт 8 картад үргэлж нэмбэл дэмий мөр болно. */
    const wide = st ? !!st.projectWide : pkgOn && PROJECT_WIDE.has(card.group);
    return (
      <Node key={card.id} card={card} st={st}
        alerts={alerts.get(card.id) ?? []} stat={stats.get(card.id) ?? null}
        box={box} fine={fine} wide={wide}
        /* ⚠️ Зурвас зөвхөн ЕРӨНХИЙ горимын хяналтын карт дээр */
        rail={!fine && card.id === 'hyanalt' ? rail : null}
        allowed={allowed(card.view)} selected={openCard === card.id} onOpen={onOpen} />
    );
  };

  if (stacked) {
    return (
      <div className={c.canvas} ref={wrap}>
        <div className={c.stack}>
          {cards.map((card, i) => (
            <div key={card.id}>
              {i > 0 && <div className={c.stackArrow} aria-hidden>↓</div>}
              {nodeOf(card, null)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={c.canvas} ref={wrap}>
      <p className={c.sr}>{tr('Урсгал')}: {prose}</p>
      <div className={c.stage} style={{ width: L.w, height: L.h, transform: `scale(${k})` }}>
        <svg className={c.edges} width={L.w} height={L.h} viewBox={`0 0 ${L.w} ${L.h}`} aria-hidden="true">
          <defs>
            <marker id="schem-a" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
              orient="auto" markerUnits="strokeWidth">
              <path d="M0 0 L7 3.5 L0 7 z" fill="var(--line-strong)" />
            </marker>
            <marker id="schem-b" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
              orient="auto" markerUnits="strokeWidth">
              <path d="M0 0 L7 3.5 L0 7 z" fill="var(--bad)" />
            </marker>
          </defs>
          {edges.map((e) => {
            const d = edgePath(L.box[e.from], L.box[e.to], e.kind);
            const cls = e.kind === 'back' ? c.edgeBack : e.kind === 'feed' ? c.edgeFeed : c.edgeMain;
            /* ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): шошго нь ӨӨРИЙН замынхаа орой/тохойд
               (`edgeLabelAt`) — урьд нь хоёр картын доод ирмэгээс 34px доор тавьдаг тул
               «Ерөнхий»-д сумнаасаа хол, «Дэлгэрэнгүй»-д доорх картын ард нуугддаг байв. */
            const at = e.label ? edgeLabelAt(L.box[e.from], L.box[e.to], e.kind) : null;
            return (
              <g key={`${e.from}-${e.to}-${e.kind}`}>
                <path d={d} className={cls}
                  markerEnd={`url(#${e.kind === 'back' ? 'schem-b' : 'schem-a'})`} />
                {at && (
                  /* ⚠️ `textAnchor`-ыг style-оор — CSS класс (`.edgeLab`) атрибутыг дардаг */
                  <text className={c.edgeLab} x={at.x} y={at.y} style={{ textAnchor: at.anchor }}>
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {cards.map((card) => nodeOf(card, L.box[card.id]))}
      </div>
    </div>
  );
}

/* ══════════════════ Үндсэн харагдац ══════════════════ */

/** «Ерөнхий» схемийн картууд — топологийн дараалалтай */
const COARSE_CARDS: Card[] = topoOrder().map((id) => {
  const n = NODE_BY_ID[id];
  return { id, group: id, get title() { return n.title; }, get desc() { return n.desc; }, icon: n.icon, view: n.view, col: n.col, row: n.row };
});
/** «Дэлгэрэнгүй» схемийн 26 карт */
const FINE_CARDS: Card[] = fineOrder().map((id) => {
  const n = FINE_BY_ID[id];
  return { id, group: n.group, get title() { return n.title; }, get desc() { return n.desc; }, icon: n.icon, view: n.view, col: n.col, row: n.row };
});

/* ⚠️ Топологи бүрэн зурагдаж байгаа эсэх — карт мартвал ажиллах үед биш ЭНД */
if (COARSE_CARDS.length !== NODES.length || FINE_CARDS.length !== FINE_NODES.length) {
  throw new Error('[selbe] схемийн топологи бүрэн биш — карт мөчлөгт орсон байж магадгүй');
}

export function Schem({
  setView, navScope = 'all',
}: {
  setView: (v: ViewKey) => void;
  /** Хэрэглэгчийн эрхэд байгаа харагдацууд; `'all'` бол хязгааргүй */
  navScope?: 'all' | ViewKey[];
}) {
  const q = useAsync<SchemSources>(loadSchemSources, []);
  /**
   * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): БАГЦ ба НАРИЙВЧЛАЛ URL-д (`?pkg=БАГЦ31&fine=0`) —
   *    F5/холбоос хуваалцахад сонголт алдагдахгүй. `pkg` нь `Bagts`/`PkgProg`/`PkgFin`-тэй
   *    НЭГ параметр, `bagtsKey` хэлбэрээр (тэдгээрийн уламжлал); бүх шүүлт `samePkg`-ээр тул
   *    түлхүүр ч, шошго ч адил ажиллана — дэлгэцэнд шошгыг `pkgRow`-оор сэргээнэ.
   *    `fine` нь анхдагч (дэлгэрэнгүй) үед URL-д бичигдэхгүй.
   */
  const [pkg, setPkg] = useState<string>(() => readParam('pkg') ?? '');
  /**
   * СОНГОГДСОН КАРТ ба түүний БҮЛЭГ — НЭГ төлөвт.
   *
   * ⚠️ ХОЁР ТУСДАА `useState` БОЛГОХГҮЙ. Нарийвчилсан схемд нэг бүлэгт 3–5
   * карт байдаг тул «энэ карт дахин дарагдсан уу» гэдгийг мэдэхийн тулд
   * хоёулаа зэрэг шинэчлэгдэх ёстой; тусад нь байвал нэг нь нөгөөгийнхөө
   * хуучин утгыг уншиж, «Зөвшөөрсөн»-өөс «Хүлээгдэж буй» рүү шилжихэд
   * самбар чимээгүй ХААГДАНА.
   */
  const [pick, setPick] = useState<{ card: string; group: SchemId } | null>(null);
  /**
   * ⚠️ АНХДАГЧААР «ДЭЛГЭРЭНГҮЙ» (2026-09-01, хэрэглэгчийн шаардлага).
   * «Ерөнхий» нь танилцуулга, хэвлэлтэд зориулсан хураангуй хувилбар болж
   * үлдэнэ — устгаагүй, учир нь түүний тор ба шалтгаанууд баримтжуулагдсан.
   */
  const [fine, setFine] = useState(() => readParam('fine') !== '0');

  /* Сонголтыг URL-д тусгана (replace — түүх урсгахгүй) */
  useEffect(() => {
    writeParams({ pkg: pkg ? bagtsKey(pkg) : null, fine: fine ? null : '0' });
  }, [pkg, fine]);

  const allowed = useCallback(
    (v: ViewKey | null) => !!v && (navScope === 'all' || navScope.includes(v)),
    [navScope],
  );

  /**
   * ⚠️ ШИЛЖИХДЭЭ ЗААВАЛ `setView`. URL-аар (`writeParams`) тойрч гарвал өмнөх
   * харагдацын SQL шүүлт үлдэж, шинэ харагдацын зураг чимээгүй хоосорно.
   */
  const go = useCallback((v: ViewKey) => setView(v), [setView]);

  /**
   * САМБАР ХААГДАХАД ФОКУС КАРТ РУУ БУЦНА (2026-10-06, аудит).
   * ⚠️ Урьд нь Esc/✕-ийн дараа фокус устсан самбартай хамт алга болж (body руу унаж) Tab
   *    хуудасны эхнээс эхэлдэг байв. Сүүлд нээсэн картын `data-schem-card`-ыг фокуслана.
   */
  const lastCard = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastCard.current;
    lastCard.current = pick?.card ?? null;
    if (pick || !prev) return;
    const el = Array.from(document.querySelectorAll<HTMLElement>('[data-schem-card]'))
      .find((x) => x.dataset.schemCard === prev);
    el?.focus();
  }, [pick]);

  /** Esc — самбар хаана. Хулганагүй хэрэглэгч зөвхөн ✕ хайх шаардлагагүй. */
  useEffect(() => {
    if (pick == null) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPick(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pick]);

  const toggle = useCallback((cardId: string, g: SchemId) => {
    /* ЯГ ТЭР картыг дахин дарвал хаана; өөр картыг дарвал самбар СОЛИГДОНО */
    setPick((cur) => (cur?.card === cardId ? null : { card: cardId, group: g }));
  }, []);

  /* ⚠️ 2026-10-01: URL-ын `bagtsKey` («БАГЦ31») → жагсаалтын шошго («Багц 3.1»). Жагсаалтад
     алга (хэсэгчилсэн ачаалал — «багцын жагсаалт» унасан) бол сонголт ИЛ хэвээр үлдэж,
     тоонууд «—» болно (`buildSchem`-ийн `lost`) — «Төслийн нийт» мэт харагдахгүй. */
  const bagtsList = q.state === 'ready' ? q.data.bagts ?? [] : [];
  const pkgHit = pkgRow(bagtsList, pkg);
  const pkgSel = pkg ? pkgHit?.label ?? pkg : '';

  return (
    <div className={c.frame}>
      <header className={c.head}>
        <div>
          <h2 className={c.title}>{tr('Үйл ажиллагааны схем')}</h2>
          <p className={c.sub}>{tr('Төлөвлөхөөс тайлагнах хүртэлх урсгал — амьд тоогоор')}</p>
        </div>
        <span className={c.spacer} />
        {/* ⚠️ Хоёр товчны бүлэг — checkbox биш: горим ХОЁУЛАА нэр төрөлтэй */}
        <span className={c.modes} role="group" aria-label={tr('Нарийвчлал')}>
          {([true, false] as const).map((d) => (
            <button key={String(d)} type="button"
              className={`${c.mode} ${fine === d ? c.modeOn : ''}`}
              aria-pressed={fine === d}
              onClick={() => setFine(d)}>
              {d ? tr('Дэлгэрэнгүй') : tr('Ерөнхий')}
            </button>
          ))}
        </span>
        <label className={c.field}>
          {tr('Багц')}{' '}
          <select className={c.select} value={pkgSel} onChange={(e) => setPkg(e.target.value)}>
            <option value="">{tr('Төслийн нийт')}</option>
            {bagtsList.map((b) => (
              <option key={b.key} value={b.label}>{b.label}</option>
            ))}
            {pkg && !pkgHit && <option value={pkg}>{pkg}</option>}
          </select>
        </label>
      </header>

      <div className={c.legend}>
        <span className={c.leg}><i className={c.legLine} />{tr('үе шатны хамаарал')}</span>
        <span className={c.leg}><i className={`${c.legLine} ${c.legDash}`} />{tr('тэжээх холбоо')}</span>
        <span className={c.leg}><i className={`${c.legLine} ${c.legBack}`} />{tr('буцаах шилжилт')}</span>
        {(['good', 'warn', 'bad', 'none'] as Health[]).map((h) => (
          <span key={h} className={c.leg}>
            <i className={`${c.legDot} ${HEALTH_SWATCH[h]}`} />
            {healthText(h)}
          </span>
        ))}
        <span className={c.spacer} />
        <span className={c.leg}>{tr('Карт дээр дарж дэлгэрэнгүйг харна')}</span>
      </div>

      <Data q={q} minH={420} loading={tr('Схем бэлтгэж байна…')}>
        {(src) => {
          /* ⚠️ 2026-10-09: `derivedOf` — render бүрд дахин бодохгүй (дээрх ⚠️) */
          const { state, rail, alerts, alertN, stats } = derivedOf(src, pkg || null, fine);
          return (
            <>
              {src.failed.length > 0 && (
                <p className={c.warnBar} role="status">
                  {tr('{0} эх сурвалж татагдсангүй — тэдгээрийн тоо «—» байна.', src.failed.join(', '))}
                  {/* ⚠️ 2026-09-25: хэсэгчилсэн үр дүн кэшлэгдэхгүй тул дахин оролдох нь бодитоор дахин татна. */}
                  {q.retry && (
                    <>
                      {' '}
                      <button type="button" className={c.goBtn} onClick={q.retry}>{tr('Дахин оролдох')}</button>
                    </>
                  )}
                </p>
              )}
              {/**
                * ⚠️ НИЙТ ТОО — «схем дээр анхаарах зүйл байна уу» гэдэгт нэг
                * харцаар хариулна. 24 картыг гүйж үзэхээс өмнө мэдэх ёстой
                * ганц зүйл нь энэ. Тэг бол мөр ОГТ гарахгүй (хоосон зурвас
                * нь «бүх зүйл сайн» гэдгийг давтаж хэлэх шаардлагагүй).
                */}
              {alertN > 0 && (
                <p className={c.alertBar} role="status">
                  {tr('Процессуудад {0} анхааруулга — картан дээр тэмдэглэв.', alertN)}
                </p>
              )}
              <div className={c.body}>
                <Diagram
                  cards={fine ? FINE_CARDS : COARSE_CARDS}
                  state={state}
                  alerts={alerts}
                  stats={stats}
                  edges={fine ? FINE_EDGES : EDGES}
                  geo={fine ? GEO_FINE : GEO}
                  rail={rail} fine={fine} pkgOn={!!pkg} allowed={allowed}
                  openCard={pick?.card ?? null} onOpen={toggle} />
                {pick && (
                  <Panel key={pick.card} id={pick.group} src={src} pkg={pkgSel}
                    allowed={allowed(NODE_BY_ID[pick.group].view)}
                    onGo={go} onClose={() => setPick(null)} />
                )}
              </div>
            </>
          );
        }}
      </Data>
    </div>
  );
}
