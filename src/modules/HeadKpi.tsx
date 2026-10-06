'use client';

/**
 * ТОЛГОЙН ҮЗҮҮЛЭЛТИЙН МӨР (`HeadKpi`) ба түүний «…/⚠/—» туслахууд.
 *
 * ⚠️ 2026-10-06 (аудит): `Dashboard.tsx`-ээс САЛГАСАН. «Иргэдэд хүрэх үр өгөөж»
 *    (`Irged.tsx`) энэ мөрийг ашиглахын тулд `@/modules/Dashboard`-ыг СТАТИК
 *    импортолдог байсан тул Dashboard-ын бүх граф (~1.8 МБ эх код —
 *    `viewRegistry.tsx`-ийн 2026-10-04-ний ⚠️) Irged-ийн chunk руу чирэгдэж,
 *    тэр өдрийн dynamic салгалтыг хэсэгчлэн буцаадаг байв. Одоо Irged ба Dashboard
 *    ХОЁУЛАА ЭНДЭЭС импортолно; `Dashboard` нь `HeadKpi`-г дахин экспортолдог
 *    (хуучин импортын зам эвдрэхгүй).
 * ⚠️ `loadFinData`/`physNow`-ийг `@/modules/Finance`-аас ШУУД авна (`PkgProg`-оор
 *    дамжихгүй) — `PkgProg`-ийн графыг дагуулахгүйн тулд. Finance-ийн өгөгдлийн
 *    давхаргыг тусад нь салгавал энэ импорт ч хөнгөрнө.
 * ⚠️ Агуулга нь ӨӨРЧЛӨГДӨӨГҮЙ — зөвхөн байршил солигдсон.
 */

import type { CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { friendlyError } from '@/components/ui';
import { useAsync, type Async } from '@/lib/useAsync';
import { loadFinData, physNow } from '@/modules/Finance';
import { num, monthKey } from '@/lib/format';
import { loadHeadline, type Headline } from '@/lib/live';
import type { BagtsRow } from '@/lib/execData';
import o from './dashboardOv.module.css';

/**
 * Утга хараахан алга үед юу харуулах вэ: ачаалж байвал «…», УНАСАН бол «—».
 *
 * ⚠️ 2026-09-29 (аудит 10): урьд нь `x == null ? '…'` байсан тул хүсэлт унахад
 *    (499 · rate-limit · сүлжээ) нүд «ачаалж байна» гэсээр МӨНХӨД үлддэг байв —
 *    хэрэглэгч хүлээгээд л байдаг. 09-25-нд `schedule`/`bagts`/`network`-д
 *    зассантай ижил ангилал; энд нүүр хэсгийн үлдсэн нүднүүдэд.
 */
/**
 * ⚠️ 2026-10-05: УНАСАН эх сурвалж «—» БИШ, «⚠». Урьд нь алдаа ба «мэдээлэлгүй» хоёулаа
 *    «—» болж, хэрэглэгч «өгөгдөл алга» гэж уншдаг байв (унасан ачаалалт ≠ хоосон утга).
 *    «—» одоо зөвхөн АЧААЛАГДСАН ч утгагүй үед. Тэмдгийг `FailVal` шалтгаан (title) ба
 *    «дахин оролдох»-той зурна.
 */
export const ERR_MARK = '⚠';
export type AsyncLike = { state: string; error?: Error | null; retry?: () => void };
export type Dots = (...qs: AsyncLike[]) => string;
export const dots: Dots = (...qs) =>
  qs.some((q) => q.state === 'loading') ? '…' : qs.some((q) => q.state === 'error') ? ERR_MARK : '—';
/**
 * `Headline`-ийн тоон талбар → бичвэр. ⚠️ 2026-10-05: ХЭСЭГЧИЛСЭН үр дүнгийн (`h.partial` — аль
 * нэг эх унасан) NaN нь «мэдээлэлгүй» БИШ «татагдсангүй» тул «⚠»; урьд нь `num(NaN)` → «—».
 */
export const hVal = (h: Headline, v: number, fmt: (n: number) => string): string =>
  h.partial && Number.isNaN(v) ? ERR_MARK : fmt(v);

/** «⚠» — шалтгаан нь title-д; `retry` байвал дарж ЗӨВХӨН тэр хүсэлтийг дахин явуулна */
export function FailVal({ q }: { q: AsyncLike }) {
  const why = friendlyError(q.error);
  const style: CSSProperties = { color: 'var(--bad-ink)', font: 'inherit', background: 'none', border: 0, padding: 0 };
  return q.retry ? (
    <button
      type="button"
      onClick={q.retry}
      title={`${why} · ${tr('Дахин оролдох')}`}
      aria-label={`${why} · ${tr('Дахин оролдох')}`}
      style={{ ...style, cursor: 'pointer' }}
    >
      {ERR_MARK}
    </button>
  ) : (
    <span role="img" title={why} aria-label={why} style={style}>{ERR_MARK}</span>
  );
}

/* ══════════════════ Толгойн үзүүлэлт ══════════════════ */

/**
 * ⚠️ EXPORT — «Иргэдэд хүрэх үр өгөөж» (`Irged.tsx`) энэ мөрийг ДАХИН
 * АШИГЛАНА. Хуулбарлавал таван үзүүлэлт хоёр цонхонд салангид амьдарна.
 *
 * ⚠️ Prop нь `DashData` БҮХЭЛДЭЭ БИШ, зөвхөн `bagts`: бусад талбар нь энд
 * хэрэггүй бөгөөд шаардвал дуудагч тал дашбоардын БҮХ өгөгдлийг татах
 * үүрэгтэй болно (эх үүсвэр, санхүү, үнэлгээ гэх мэт — 10 гаруй хүсэлт).
 */
export function HeadKpi({ bagts, extra }: {
  bagts: Async<BagtsRow[]>;
  /**
   * ⚠️ 2026-09-17: ХАРАГДАЦЫН ӨӨРИЙН нэмэлт нүднүүд (хэрэглэгчийн шийдвэр).
   *
   * «Иргэдэд хүрэх үр өгөөж» нь гэр хорооллын байшин/гэр/нүхэн жорлонгийн
   * тоог ЭНЭ зурваст залгуулна — тэдгээр нь тухайн харагдацын контекст бөгөөд
   * зүүн баганад тусдаа карт болгоход зурвастай ЯГ ижил үүрэгтэй хоёр зүйл
   * зэрэг харагддаг байв. Дашбоард `extra` дамжуулахгүй тул таван нүд хэвээр.
   */
  extra?: { v: string; unit?: string; label: string }[];
}) {
  const b = bagts.state === 'ready' ? bagts.data : null;
  /* ⚠️ `blocks` (блокийн тоо) 2026-09-06-нд хасагдав — зөвхөн доод дэд мөрөнд
     («113 блок») хэрэглэгддэг байсан бөгөөд тэр мөр бүхэлдээ устсан. */
  const ail = b ? b.reduce((a, x) => a + x.ail, 0) : null;
  // ⚠️ Толгой/явцыг ЭНД амьдаар ачаална (prop-оор БИШ) — «Иргэдэд хүрэх үр өгөөж»
  //    (Irged.tsx) энэ мөрийг зөвхөн `bagts`-аар дахин ашиглана. loadHeadline/
  //    loadProjectProgress нь cached тул давхар хүсэлт үүсэхгүй.
  const hq = useAsync(loadHeadline, []);
  const pq = useAsync(loadFinData, []);
  const h = hq.state === 'ready' ? hq.data : null;
  /* ⚠️ 2026-08-21: Төсөл_Гүйцэтгэл_ хасагдаж, эх нь TASK_SHEET болов */
  /* ⚠️ 2026-09-22: `pkgPhys().actual` → `physNow` — 05 (PkgProg TsKpi)-тай ЯГ нэг тоо */
  const p = { actual: pq.state === 'ready' ? physNow(pq.data, monthKey()) : null };

  /**
   * ⚠️ УТГА ба НЭГЖ нь ТУСДАА талбар — тоо том, нэгж жижиг.
   * 2026-08-13: бэхлэгдсэн ◆ (158 га · 44,518 · 36.35% · 2,339,000,000,000)
   * БҮГД амьд боллоо: хил [97] · барилгын Population нийлбэр · Төсөл_Гүйцэтгэл
   * жигнэсэн дундаж · INVEST нийлбэр.
   */
  /**
   * ⚠️ 2026-09-06: ДЭД МӨР (`sub`) БҮРМӨСӨН ХАСАГДАВ (хэрэглэгчийн шийдвэр).
   * «113 блок» · «7 багц тайлагнасан» · «гэрээ байгуулсан 2,073,074,430,035 ₮»
   * гэсэн гурван мөр нь таван нүдний ГУРАВД Л байсан тул нүднүүд өөр өндөртэй
   * болж, зурвасын доод ирмэг тасархай харагддаг байв. Мөн тэдгээр нь өөрсдөө
   * KPI биш ТАЙЛБАР — нүдний гол тоог сулруулж байлаа.
   */
  /* ⚠️ 2026-10-05: `q` — нүдний эх хүсэлт; унасан бол «⚠» (`FailVal`), «—» биш */
  const tiles: { v: string; unit?: string; label: string; lead?: true; title?: string; q?: AsyncLike }[] = [
    { v: h == null ? dots(hq) : hVal(h, h.areaHa, (n) => num(n, 1)), unit: tr('га'), label: tr('Төслийн талбай'), q: hq },
    { v: ail == null ? dots(bagts) : num(ail), unit: tr('өрх'), label: tr('Өрхийн орон сууц'), q: bagts },
    { v: h == null ? dots(hq) : hVal(h, h.population, (n) => num(n)), unit: tr('хүн'), label: tr('Хамрагдах хүн ам'), q: hq },
    /* ⚠️ 2026-09-06: `bar` (гүйцэтгэлийн зурвас) ХАСАГДАВ. Гүйцэтгэл 4.18%
       үед дүүргэлт нь 2px өндөр замын 4% буюу үл үзэгдэх богино байсан тул
       нүдэн дээр «санамсаргүй зураас» мэт харагдаж, бусад ДӨРВӨН нүдэнд
       байхгүй ГАНЦ элемент болж зурвасын тэгш байдлыг эвдэж байв. Хувийг тоо
       нь өөрөө хэлнэ. `lead` (дээд ирмэгийн акцент) хэвээр — тэр нь гол
       үзүүлэлтийг заана. */
    /* ⚠️ 2026-09-21: ШОШГО «Төслийн нийт гүйцэтгэл» → «Биет гүйцэтгэл (багцаар)».
       ТОО ӨӨРЧЛӨГДӨӨГҮЙ. Порталд «нийт гүйцэтгэл» гэсэн нэрээр ГУРВАН өөр
       тодорхойлолт зэрэг явдаг байв: энд `pkgPhys` (TASK_SHEET-ийн сарын
       цуваа, багцаар блок-жигнэсэн), Тайлан `overall.pct` (орон сууцны
       багцын төсвийн жинтэй), удирдлагын тайлан `gdash.progress` (2026-09-25-наас
       «Нэгтгэл гүйцэтгэл»-ийн төслийн нийт; унавал 6 шатны жигнэсэн —
       `progressSrc`). Нэг нэрээр гурван тоо гарахаар аль нь үнэн нь мэдэгдэхгүй тул
       нэр бүр ЮУ болохоо хэлнэ; `title` нь тодорхойлолтыг өгнө. */
    {
      /* ⚠️ 2026-09-29 (аудит 10): «…» ЗӨВХӨН ачаалж байхад; утгагүй/унасан бол «—»
         (мөнхийн «…» биш) — `ScheduleDetail`-ийн 09-25-ны засвартай ижил */
      /* ⚠️ 2026-10-04: 1 оронтой — IndStrip (`pct(overall, 1)`) · 02 · rail-тай НЭГ бичлэг */
      v: p.actual != null ? num(p.actual, 1) : dots(pq), unit: '%', q: pq,
      label: tr('Биет гүйцэтгэл (багцаар)'),
      title: tr('Барилга угсралтын биет гүйцэтгэл — багц бүрийн сүүлийн сарын хэмжилт, багцын ХО дүнгээр жигнэсэн (05. Багцын гүйцэтгэлтэй ижил)'),
      lead: true,
    },
    {
      v: h == null ? dots(hq) : hVal(h, h.investTotal, (n) => num(n)), unit: tr('₮'), label: tr('Төслийн нийт төсөв'), q: hq,
      /* ⚠️ 2026-09-21: `investTotal` = `finXlInTotal` хүрээ (Excel-ийн НИЙТ мөр, 2,493 тэрбум) */
      title: tr('Орон сууцны хороолол ба ГИШС-ийн хүрээний төсөвт өртөг (Excel-ийн НИЙТ мөр); нийгмийн дэд бүтэц, газар чөлөөлөлт, бондын хүү ОРОХГҮЙ'),
    },
    ...(extra ?? []),
  ];

  return (
    <div className={o.head}>
      {tiles.map((t) => (
        <div key={t.label} className={`${o.tile} ${t.lead ? o.tileLead : ''}`} title={t.title}>
          <span className={o.tileVal}>
            {/**
              * ⚠️ 2026-09-06: ФОНТЫГ ЗӨВХӨН УРТ УТГАД багасгана. Урьд нь
              * `.tileVal b` бүхэлдээ 13px байсан — «2,660,000,000,000» багтаах
              * гэж 2026-09-01-нд багасгасан нь ТАВУУЛАА нүдэнд хамаарч,
              * «159.6», «4.18» зэрэг богино тоо шошгоосоо арай том хэмжээтэй
              * үлдэж, KPI зурвас бүхэлдээ уншигдахаа больсон байв. `Stat`-ийн
              * `statValueLong`-той ЯГ ижил зарчим: хэмжээг УТГЫН УРТААР шийднэ.
              */}
            <b className={`${String(t.v).length >= 10 ? o.tileValLong : ''} num`}>
              {t.v === ERR_MARK && t.q ? <FailVal q={t.q} /> : t.v}
            </b>
            {t.unit && <i>{tr(t.unit)}</i>}
          </span>
          <span className={o.tileLabel}>{t.label}</span>
        </div>
      ))}
    </div>
  );
}
