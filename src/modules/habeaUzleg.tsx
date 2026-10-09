'use client';

/**
 * АЖЛЫН БАЙРНЫ ҮЗЛЭГ — ХАБЭА хуудасны шүүлтүүрээр нээгддэг хоёр самбар.
 *
 * `HABEA.uzleg`-ийн ХОЁР Survey123 маягт (V11 · Гүйцэтгэгчийн) бүтцээрээ
 * БАРАГ ижил тул нэг л дүрслэл хоёуланд үйлчилнэ — URL нь ялгаатай, мөн
 * `v11`-д `site_block`/`company_other` байхгүй (`services.ts`-ийн
 * `HABEA.uzleg`-ийн ⚠️). `block` нь одоогоор чартад ордоггүй.
 *
 * ⚠️ ЯАГААД ТУСДАА ФАЙЛ ВЭ: `Habea.tsx` аль хэдийн 1,500 мөр. Үзлэгийн
 * ачаалалт, хэвийн болголт, дөрвөн чарт нь тэр файлын хөндлөн шүүлтийн логиктой
 * ОГТ огтлолцдоггүй (үзлэг нь багц ч, гүйцэтгэгчийн баганын бүлэг ч агуулдаггүй)
 * тул тэнд нэмбэл зөвхөн уншихад хүндрэл нэмнэ.
 *
 * ⚠️ ХОЁР МАЯГТ НЭРГҮЙ ХЭРЭГЛЭГЧИД ХААЛТТАЙ (2026-09-15). Урьд нь токенгүй
 * асуудаг байсан тул дата оруулсан ч сервер 0 мөр буцааж, самбар «Бүртгэл
 * алга» гэж ХУДАЛ хэлдэг байв. Одоо нэвтэрсэн хэрэглэгчийн токеныг илгээнэ;
 * нэвтрээгүй бол хоосон биш ИЛ АЛДАА гаргана — «хандах эрхгүй» ба «бүртгэл
 * алга» хоёрыг нэгтгэвэл хэрэглэгч буруу дүгнэлт хийнэ (null ≠ 0-ийн ижил
 * зарчим). Хоосныг нөхөх гэж ямар нэг тоо ЗОХИОЖ болохгүй.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { queryFeatures, queryGroup, count, sum, arcgisPost, type Row } from '@/lib/query';
import { getAuth } from '@/lib/draftRemote';
import { attachmentFileName, fetchAttachment, rasterTypeOfBlob } from '@/lib/uzlegReport';
import { HABEA, bagtsKey } from '@/lib/services';
import { cached } from '@/lib/live';
import { useAsync } from '@/lib/useAsync';
import { Section, Bars, Donut, Series, Loading, Empty, friendlyError, useTip } from '@/components/ui';
import { CHART } from '@/lib/chartStyle';
import { num, date, text, pct } from '@/lib/format';
import { ubDayKey } from '@/lib/ceo/workforce';
import { markCurMonth, CUR_MONTH_MARK } from './habeaRate';
import { LEVEL_MARK, LEVEL_TONE, levelLabel, type Level } from '@/lib/kpiLevels';
import h from './habea.module.css';

/* ═════════════════ Төрөл ═════════════════ */

/** Аль маягт вэ */
export type UzlegKind = 'v11' | 'guitsetgegch' | 'zahialagch';

const U = HABEA.uzleg.fields;

/* ═════════════════ Домэйн (код → нэр) ═════════════════ */

/** Талбар → (код → нэр) */
type Domains = Record<string, Map<string, string>>;

/**
 * ДОМЭЙНЫ КОД → НЭР. Survey123 нь `site` · `company` · `shift` · `week`-ийг
 * codedValue домэйнтой хадгалдаг тул атрибутад «b1», «mcc2», «day» гэсэн КОД
 * ирнэ (2026-09-06-нд амьд метадатаар батлагдсан: site 13 · company 10–11 ·
 * shift 2 · week 11 утга). Хөрвүүлэлтгүй бол чарт кодоор шошгологдоно —
 * хоёр үйлчилгээ одоо хоосон тул анхны мөр ирэхэд л илрэх байсан.
 *
 * ⚠️ Унавал ХООСОН толь буцаана — код хэвээр харагдана, самбар унахгүй.
 * ⚠️ Метадата нь ӨГӨГДӨЛ биш тул автобусын тагт хамаарахгүй; url бүрд нэг
 *    л удаа татна (`metaCache`).
 */
/* ⚠️ 2026-10-06 (аудит): уналтын ТЭМДЭГ (лавлагаагаар танина) — урьд нь хоосон `{}` буцаад
   самбар түүхий кодыг («w3», «co_2») чимээгүй харуулдаг байв. Одоо `useUzleg` үүнийг
   `domFail` болгож, `UzlegLeft` «Кодын тайлбар уншигдсангүй» гэж хэлнэ. Хоосон толь
   хэвээр — самбар унахгүй. */
/**
 * ⚠️ 2026-10-09 (аудит): СХЕМИЙН ШАЛГАЛТ. Survey123 маягтыг дахин нийтлэхэд талбарын нэр
 *    солигдвол (`cnt_major` → …) `norm`-ийн `nn(...)` чимээгүй 0 болж KPI «N үзлэг · 0 заалт»
 *    гэж ХУДАЛ хэлдэг байв. Метадата ирсэн бол `U.*` нэр бүр байгаа эсэхийг шалгаж
 *    `missing`-д буцаана → `useUzleg` `schemaMissing`, `UzlegLeft` ил анхааруулга.
 *    Маягт бүрд байх албагүй талбарууд (`UZ_OPTIONAL`: V1.1-д `site_block`/`company_other`
 *    байхгүй, гүйцэтгэгчийн маягтад оноо байхгүй — `services`-ийн ⚠️) тооцогдохгүй.
 * ⚠️ 2026-10-09: `week` ба `shift` мөн ЗААВАЛ БИШ — долоо хоног огнооноос (`uzWeekKey`) тул
 *    `week` талбар тооцоонд ОРОХГҮЙ; ээлж зөвхөн газрын зургийн картад. Тэдгээр алга бол
 *    «Маягтын талбар олдсонгүй» гэж ХУДАЛ сануулдаг байв.
 */
type UzMeta = { dom: Domains; missing: readonly string[]; failed: boolean };
const UZ_OPTIONAL: ReadonlySet<string> = new Set<string>([
  U.siteOther, U.companyOther, U.block, U.scEarned, U.scAppl, U.week, U.shift,
]);
const UZ_FIELDS: readonly string[] = [...new Set(Object.values(U))];
const FAILED_DOMAINS: Domains = Object.freeze({}) as Domains;
const FAILED_META: UzMeta = Object.freeze({ dom: FAILED_DOMAINS, missing: [], failed: true });
const metaCache = new Map<string, Promise<UzMeta>>();
function loadDomains(url: string): Promise<UzMeta> {
  let p = metaCache.get(url);
  if (!p) {
    type Meta = {
      fields?: { name?: string; domain?: { type?: string; codedValues?: { code?: unknown; name?: string }[] } | null }[];
    };
    /* ⚠️ 2026-09-21: ArcGIS алдаа HTTP 200-аар `{error}` биетэй ирдэг тул
       ЗААВАЛ шалгана; урьд нь `{}` болж СЕШНИЙ ТУРШ кэшлэгдэж (`metaCache`),
       түр алдаа (токен хоцрох, 499) чартыг кодоор шошголсон хэвээр үлдээдэг
       байв. Одоо унавал кэшээс ХАСНА — дараагийн дуудалт дахин оролдоно;
       буцаах утга нь хэвээр хоосон толь (самбар унахгүй). Мөн слот —
       `query.ts`-ийн хязгаарлагчаар (бусад REST-тэй нэг дараалалд). */
    /* ⚠️ 2026-09-21: timeout — `query.ts` `request()`-тэй ижил; эс бөгөөс
       гацсан хүсэлт слотыг мөнхөд эзэлж, бусад REST дараалалд түгжигдэнэ.
       ⚠️ 2026-09-30: `arcgisPost` (POST, токен биеэр) — слот, 30с timeout
       (`timeoutMs`), 429 backoff, `{error}` → `ArcGISError` бүгд цөмд; гаднах
       `withSlot` хасагдав (цөм өөрөө слот авна — давхар авбал гацна). */
    p = arcgisPost<Meta>(url, { f: 'json' }, { timeoutMs: 30_000 })
      .then((j): UzMeta => {
        const out: Domains = {};
        const names = new Set<string>();
        for (const f of j.fields ?? []) {
          if (f.name) names.add(f.name);
          const cv = f.domain?.type === 'codedValue' ? f.domain.codedValues : null;
          if (!f.name || !cv?.length) continue;
          out[f.name] = new Map(cv.map((c) => [String(c.code), String(c.name ?? c.code)]));
        }
        /* Талбаргүй хариу (`fields` хоосон) — схемийг мэдэхгүй, «дутуу» гэж дүгнэхгүй */
        const missing = names.size ? UZ_FIELDS.filter((n) => !UZ_OPTIONAL.has(n) && !names.has(n)) : [];
        return { dom: out, missing, failed: false };
      })
      .catch(() => {
        metaCache.delete(url);
        return FAILED_META;
      });
    metaCache.set(url, p);
  }
  return p;
}

export type UzlegRow = {
  oid: number;
  site: string;
  /**
   * ДОЛОО ХОНОГИЙН ТҮЛХҮҮР — чарт ба шүүлтийн; шошгыг `weekLabel` гаргана.
   * ⚠️ 2026-10-09: ҮЗЛЭГИЙН ОГНООНООС (`insp_datetime`) ISO-8601 долоо хоног, Улаанбаатарын
   *    хуанлиар — «2026-W37». Урьд нь маягтын `week` кодыг (`w1`…, «37») шууд авдаг тул
   *    бөглөгч/маягтын тооцоо ISO долоо хоногоос зөрөхөд KPI (огнооны хил) ба чарт өөр
   *    долоо хоногт тоолдог байв.
   * ⚠️ 2026-10-09: ОГНООГҮЙ мөрөнд ХООСОН (''). Урьд нь маягтын жилгүй `week` код («37»)
   *    нөөц болж ISO түлхүүрүүдийн дунд ТУСДАА багана үүсгэж (жилгүй, ISO-оос зөрөх) байв.
   *    Одоо долоо хоногийн чарт ба KPI (`fetchWeekScores`) ХОЁУЛАА огноогүйг хасна —
   *    өдөр/сарын цуваатай ижил дүрэм.
   */
  week: string;
  /**
   * НИЙТ ОНОО — авсан / боломжит. `null` = маягтад онооны талбар БАЙХГҮЙ
   * (гүйцэтгэгчийн маягт) эсвэл бөглөөгүй. ⚠️ 0-ээр орлуулахгүй: «0 оноо»
   * ба «оноо байхгүй» өөр (`null ≠ 0`).
   */
  scE: number | null;
  scA: number | null;
  company: string;
  /** Талбайн багцын нормчилсон түлхүүр (`bagtsKey`) — «Бусад» бол хоосон */
  bagtsK: string;
  /** Хүн хүчний маягтын гүйцэтгэгчийн дагавар (`HABEA.labor.companies.sfx`) — танихгүй бол хоосон */
  coSfx: string;
  block: string;
  shift: string;
  /** Үзлэг хийсэн огноо (epoch ms) — байхгүй бол 0 */
  d: number;
  /**
   * ⚠️ 2026-10-09: ҮЛ НИЙЦЛИЙН ҮНДСЭН 4 тоо (ноцтой · бага · ажиглалт · нийцсэн) БҮГД бөглөгдсөн
   *    эсэх. `false` бол доорх тоонууд (0 нь орлуулга) МЭДЭГДЭХГҮЙ — `ceo/scorecardLoad`
   *    тэр мөрийг алгасна. Төрлийг `number | null` болгоогүй: `scorecardLoad` тоо хүлээдэг.
   *    `cnt_na` ОРОХГҮЙ — «Хамааралгүй» дутуу нь бусад 4 зэргийг хаяхгүй.
   */
  sevKnown: boolean;
  /**
   * ⚠️ 2026-10-09: ТАЛБАР БҮРИЙН мэдэгдэх эсэх (`r[f] != null && r[f] !== ''`). Урьд нь таван
   *    талбарыг НЭГ тугаар (`every(f in r)`) шалгадаг тул `cnt_na` алга бол бусад 4 зэргийн
   *    бодит тоо ч нийлбэрээс хаягддаг байв. `severity()` зэрэг бүрийг өөрийн тугаар нийлүүлнэ.
   */
  sevHas: Readonly<Record<SevKey, boolean>>;
  major: number;
  minor: number;
  obs: number;
  conf: number;
  na: number;
};

/** Үл нийцлийн зэргийн түлхүүр — `cnt_*` таван талбар */
type SevKey = 'major' | 'minor' | 'obs' | 'conf' | 'na';
const SEV_KEYS: readonly SevKey[] = ['major', 'minor', 'obs', 'conf', 'na'];

const nn = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Тоо эсвэл `null` — талбар байхгүй/хоосон бол 0 БИШ `null` (`nn`-ээс ялгаатай) */
const nnull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/**
 * Долоо хоногийн ДУГААР — `w37` ба `37` ХОЁУЛАНГ таньна.
 *
 * ⚠️ 2026-09-17-ны засвар: метадатын домэйн `w1`…`w10` гэж зарладаг ч АМЬД
 * өгөгдөлд календарийн долоо хоногийн ДУГААР («15»…«37») бичигддэг. Зөвхөн
 * `^w(\d+)$`-аар таньдаг байсан тул бүгд «танигдахгүй» болж эрэмбэ нь өгөгдлийн
 * дараалал руу унаж, «37» хамгийн ЭХЭНД харагдаж байв.
 */
const weekNum = (k: string): number | null => {
  /* ⚠️ 2026-10-09: огнооноос гаргасан «2026-W37» түлхүүрийг мөн таньна */
  const m = /^(?:\d{4}-)?w?(\d+)$/i.exec(k.trim());
  return m ? Number(m[1]) : null;
};

/** ISO-8601 долоо хоног (жил, дугаар) — хуанлийн өдрөөс; Даваа гарагаас, 1-р долоо хоног нь Пүрэв агуулсан */
const isoWeekOf = (y: number, m0: number, d: number): { year: number; no: number } => {
  const t = new Date(Date.UTC(y, m0, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), no: Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7) };
};

/**
 * Үзлэгийн огноо → долоо хоногийн түлхүүр «2026-W37» (Улаанбаатарын хуанли — `ubDayKey`).
 * ⚠️ Жилтэй: он солигдоход «2026-W01» ба «2027-W01» нийлэхгүй.
 */
export const uzWeekKey = (ms: number): string => {
  const [y, m, d] = ubDayKey(ms).split('-').map(Number);
  const w = isoWeekOf(y, m - 1, d);
  return `${w.year}-W${String(w.no).padStart(2, '0')}`;
};

/** «2026-W37» → 2026; жилгүй түлхүүрт `null` */
const weekYear = (k: string): string | null => /^(\d{4})-/.exec(k.trim())?.[1] ?? null;

/**
 * Долоо хоногийн шошго — `37` / `w37` → «37-р долоо хоног».
 * ⚠️ 2026-10-09: `withYear` — цуваа ХОЁР ОН дамжвал «2026 оны 52-р долоо хоног»: урьд нь
 *    «52-р» ба «1-р» хоёр он нэг тэнхлэгт жилгүй гарч, аль оных нь мэдэгдэхгүй байв.
 */
export const weekLabel = (k: string, withYear = false): string => {
  const n = weekNum(k);
  const y = withYear ? weekYear(k) : null;
  if (n != null && y) return tr('{0} оны {1}-р долоо хоног', y, String(n));
  return n != null ? tr('{0}-р долоо хоног', String(n)) : k === 'other' ? tr('Бусад') : k;
};

/**
 * Survey123-ийн домэйны бичвэрийг цэвэрлэнэ.
 *
 * ⚠️ `Habea.tsx`-ийн ижил цэвэрлэгээтэй НЭГ дүрэм: домэйны утга 30 тэмдэгтэд
 * ТАСАРСАН ирдэг тул зах гэлтгүй БҮХ хашилтыг авна — эс бөгөөс хагас хашилт
 * үлдэж, ижил утга хоёр бүлэг болно.
 */
const clean = (v: unknown): string => text(v, '—').replace(/["']/g, '').trim() || '—';

/**
 * ҮЗЛЭГИЙН КОМПАНИЙН КОД → ХҮН ХҮЧНИЙ ГҮЙЦЭТГЭГЧ (2026-09-15).
 *
 * Хоёр маягт ӨӨР бүртгэлтэй: үзлэг нь Survey123-ийн домэйн код (`mcc2`),
 * хүн хүч нь баганын дагавар (`HHDMGK`). Нэг шүүлтүүрээр хоёуланг шүүхийн
 * тулд энд холбоно.
 *
 * ⚠️ БҮТЭН НЭРЭЭР ТААРУУЛСАН (2026-09-15-ны амьд домэйн). Эхний долоо нь
 * нэрээрээ ЭРГЭЛЗЭЭГҮЙ. Сүүлийн гурав нь ТААМАГ, баталгаажуулах шаардлагатай:
 *   `mms` «Эм Эм Эс Инженеринг» ↔ `MMSE`
 *   `smart_craft` «Смарт крафт» ↔ `SC` «Smart craft»
 *   `osnaaug` «Нийслэлийн ОСНААУГ» ↔ `OSNAAG` «ОСНААГ»
 * Буруу бол тухайн компанийн үзлэг л шүүлтээс хасагдана — бусдад нөлөөгүй.
 *
 * ⚠️ Жагсаалтад БАЙХГҮЙ код (шинэ компани, «other») нь хоосон дагавар авч,
 * компаниар шүүхэд ОРОХГҮЙ. Чимээгүй өөр компанид наалдахаас дээр.
 */
const CO_SFX: Record<string, string> = {
  mcc2: 'HHDMGK',
  cceb6: 'HBZIT',
  cceb5: 'HBTIT',
  morin_suvd: 'MSK',
  nutgiin_buyan: 'NBG',
  monkon: 'MK',
  professionalstroi: 'P',
  mms: 'MMSE',
  smart_craft: 'SC',
  osnaaug: 'OSNAAG',
};

/* ═════════════════ БАГЦ 2-ЫН ДЭД ТАЛБАЙГ НЭГТГЭХ ═════════════════ */

/**
 * «Багц 2 · 2.1 · 2.2 · 2.3-1 · 2.3-2» — НЭГ талбайн дэд хэсгүүд тул ХАБЭА-д
 * НЭГ «Багц 2» болж харагдана (2026-09-16, хэрэглэгчийн хүсэлт).
 *
 * ⚠️ ЗӨВХӨН БАГЦ 2. «Багц 3.1/3.2/3.3» ба «Багц 4.1/4.2» нь ТУСДАА үлдэнэ —
 * хэрэглэгчийн шийдвэр (тэдгээр нь бие даасан талбайнууд).
 *
 * ⚠️ ЗӨВХӨН ХАБЭА. `bagtsKey`-г өөрийг нь хөндвөл санхүү, гүйцэтгэл, дашбоард
 * бүгд дагаж нэгдэх байв — тэнд «Багц 2.1» нь ӨӨР гэрээ, ӨӨР төсөв.
 *
 * ⚠️ ТҮҮХИЙ ШОШГООР таних (`bagtsKey`-ийн товчлолоор БИШ): `bagtsKey('Багц 2.1')`
 * нь «БАГЦ21» бөгөөд тэр нь бодит «Багц 21» (Төрийн үйлчилгээний барилга)-ийн
 * ЯГ түлхүүр — краны бүртгэлд тэр багц гарч ирвэл чимээгүй нийлэх байлаа.
 * Тиймээс тусгаарлагч (`.` `-`) ЗААВАЛ шаардана: «Багц 21» тохирохгүй.
 */
const PKG2_RE = /^\s*багц\s*-?\s*2(\s*[.\-–]\s*\d[\d.\-–\s]*)?\s*$/i;

/** ХАБЭА-гийн багцын ШОШГО — Багц 2-ын дэд талбай «Багц 2» болно */
export const habeaPkgLabel = (raw: string): string => (PKG2_RE.test(raw) ? tr('Багц 2') : raw);

/** ХАБЭА-гийн багцын ТҮЛХҮҮР — шүүлт, бүлэглэлт бүгд үүгээр */
export const habeaPkgKey = (raw: unknown): string =>
  (PKG2_RE.test(String(raw ?? '')) ? bagtsKey('Багц 2') : bagtsKey(raw));

const norm = (r: Row, dom: Domains): UzlegRow => {
  /**
   * Домэйны код → нэр; «Бусад» (`other`) сонгосон үед жинхэнэ нэр нь
   * `*_other` талбарт бичигдэнэ. Толинд байхгүй код нь өөрөө үлдэнэ.
   */
  const named = (field: string, other?: string): string => {
    const code = r[field];
    if (other && code === 'other') return clean(r[other]);
    const s = code == null ? '' : String(code);
    return clean(dom[field]?.get(s) ?? s);
  };
  const site = named(U.site, U.siteOther);
  const d = nn(r[U.ognoo]);
  /* ⚠️ 2026-10-09: ТАЛБАР БҮРЭЭР — утга бөглөгдсөн (`null`/'' биш) бол мэдэгдэнэ. Урьд нь
     `every(f in r)` нэг туг тул `cnt_na` алга/хоосон бол бусад 4 зэргийн тоо ч хаягддаг байв. */
  const known = (f: string) => r[f] != null && r[f] !== '';
  const sevHas: Record<SevKey, boolean> = {
    major: known(U.major), minor: known(U.minor), obs: known(U.obs), conf: known(U.conf), na: known(U.na),
  };
  const sevKnown = sevHas.major && sevHas.minor && sevHas.obs && sevHas.conf;
  return {
    oid: nn(r.objectid ?? r.OBJECTID),
    site,
    /* ⚠️ 2026-10-09: огнооноос (ISO, UB); огноогүй бол '' — чарт/KPI-д ОРОХГҮЙ (`UzlegRow.week`) */
    week: d > 0 ? uzWeekKey(d) : '',
    scE: nnull(r[U.scEarned]),
    scA: nnull(r[U.scAppl]),
    company: named(U.company, U.companyOther),
    /* ⚠️ «Бусад» талбай нь чөлөөт текст — багц гэж ТААМАГЛАХГҮЙ */
    bagtsK: r[U.site] === 'other' ? '' : habeaPkgKey(site),
    coSfx: CO_SFX[String(r[U.company] ?? '')] ?? '',
    block: clean(r[U.block]),
    shift: named(U.shift),
    d,
    sevKnown,
    sevHas,
    major: nn(r[U.major]),
    minor: nn(r[U.minor]),
    obs: nn(r[U.obs]),
    conf: nn(r[U.conf]),
    na: nn(r[U.na]),
  };
};

/* ═════════════════ Ачаалалт ═════════════════ */

/**
 * ⚠️ ЗАЛХУУ (lazy) ачаалалт — хуудас нээхэд ТАТАХГҮЙ. Эдгээр нь шүүлтүүр
 * дарж л нээгддэг самбарууд тул `loadHabea`-д нийлүүлбэл БҮХ хэрэглэгчийн
 * хуудас нээх хугацаанд хоёр нэмэлт хүсэлт орох ба тэдгээрийн 100+ талбар нь
 * `outFields: ['*']`-аар татагдана.
 *
 * ⚠️ Гурав дахь аргумент (`['HABEA']`) нь ЗААВАЛ — `dataBus.invariant.check`
 * нь таггүй кэшийг олж шалгалтыг унагана. Портал эдгээр хүснэгт рүү ОГТ
 * бичдэггүй (Survey123 маягт, талбар дээрээс бөглөгддөг) тул тагийн ажил нь
 * өнөөдөр хоосон — гэхдээ `Habea.tsx`-ийн `loadHabea` ЯГ ижил тагтай бөгөөд
 * ирээдүйд ХАБЭА-гийн өгөгдөлд бичих зам нэмэгдвэл ЭДГЭЭР кэш хамт
 * хүчингүй болох ёстой.
 *
 * ⚠️ Тайлбарт `cach` + `ed()` гэсэн үгийг БҮТНЭЭР нь бүү бич: шалгагч нь
 * тайлбарыг цэвэрлэдэг ч энэ мөрийг дуудлага гэж уншиж, хуурамч алдаа
 * өгч байв (2026-09-06).
 *
 * ⚠️ 5 минутын TTL нь тагийн ОРЛУУЛАГЧ: автобусаар мэдэгддэггүй эх сурвалж
 * тул сешн-кэш нь хуучин тоог хэдэн цагаар барих эрсдэлтэй.
 */
/**
 * НЭВТЭРСЭН ХЭРЭГЛЭГЧИЙН ТОКЕНТОЙ ачаалалт.
 *
 * ⚠️ Токенгүй бол ШИДНЭ, хоосон массив буцаахгүй: хоосон нь «бүртгэл алга»
 * гэж уншигдах бөгөөд энэ маягтад тэр нь ХУДАЛ. Алдаа кэшлэгддэггүй тул
 * нэвтэрсний дараа дахин оролдоход шууд ажиллана.
 */
const loadPrivate = async (url: string): Promise<Row[]> => {
  const auth = await getAuth();
  if (!auth) throw new Error(tr('Үзлэгийн маягтыг зөвхөн нэвтэрсэн хэрэглэгч харна — порталд нэвтэрнэ үү.'));
  /* ⚠️ 2026-09-30: `token: auth.token`-ийг ИЛГЭЭХГҮЙ — `getAuth()` нь зөвхөн нэвтэрсэн
     эсэхийн шалгалт. Ил токен өгвөл `query.run` ('org' горим) ТҮҮНИЙГ эрхэмлэж, таб
     унтсаны дараах хугацаа дууссан токеноор явж 498 авахад шинэчлээд ДАХИН
     оролдохгүй → «Invalid token». Үзлэгийн үйлчилгээ байгууллагын URL тул цөм
     ОДООГИЙН токеныг өөрөө залгаж, 498-д шинэчилнэ (`loadWeekScores`-той ижил). */
  return queryFeatures(url, { outFields: ['*'] });
};

const loaders: Record<UzlegKind, () => Promise<Row[]>> = {
  v11: cached(
    () => loadPrivate(HABEA.uzleg.v11.url),
    5 * 60_000,
    ['HABEA'],
  ),
  guitsetgegch: cached(
    () => loadPrivate(HABEA.uzleg.guitsetgegch.url),
    5 * 60_000,
    ['HABEA'],
  ),
  zahialagch: cached(
    () => loadPrivate(HABEA.uzleg.zahialagch.url),
    5 * 60_000,
    ['HABEA'],
  ),
};

/**
 * ЭХ СУРВАЛЖИЙН ГАРЧИГ — хоёр маягт зэрэгцэн харагдах үед (зүүн V1.1 ·
 * баруун захиалагчийн) аль тал аль маягтынх болохыг хэлнэ. Картуудын
 * гарчиг хоёр талд ИЖИЛ («Үл нийцлийн зэрэг») тул үүнгүйгээр ялгагдахгүй.
 * Өнгөт дөрвөлжин нь газрын зураг дээрх тэр маягтын цэгтэй ижил өнгө.
 */
export function UzSrcHead({ title, hue }: { title: string; hue: string }) {
  return (
    <div className={h.srcHead}>
      <i style={{ background: hue }} aria-hidden />
      <span>{title}</span>
    </div>
  );
}

/* ═════════════════ Өмнөх долоо хоногийн дундаж оноо (KPI) ═════════════════ */

/** Улаанбаатарын цагийн бүс (UTC+8, зуны цаггүй) — `ubDayKey`-ийн дүрэм */
const UB_OFFSET_MS = 8 * 3_600_000;
const DAY_MS = 86_400_000;

/**
 * ӨМНӨХ БҮТЭН ДОЛОО ХОНОГ — Даваа 00:00-оос Даваа 00:00 хүртэл, УЛААНБААТАРЫН цагаар.
 *
 * ⚠️ Хэрэглэгчийн дүрэм (2026-09-17): «37-р долоо хоног дуусаад мэдээлэл нь
 * 38 дахь долоо хоногтоо харагдана, 38 дуусахад 38-ийн дундажаар солигдоно».
 * Өөрөөр хэлбэл ЯВАГДАЖ БУЙ долоо хоногийг БИШ, хамгийн сүүлд ДУУССАНЫГ —
 * явагдаж буй долоо хоногийн дундаж Даваа гарагт ганц үзлэгээс бүрдэж,
 * өдөр бүр үсэрч савлана.
 *
 * ⚠️ Улаанбаатар UTC+8: `toISOString`-ийн UTC хил нь Даваа 00:00–08:00-ийн үзлэгийг
 * ӨМНӨХ долоо хоногт хийх байлаа.
 * ⚠️ 2026-10-09: хөтчийн ЛОКАЛ цаг БИШ, UB (`ubDayKey`) — урьд нь `getDay()`/`setDate()`
 *    локал байсан тул гадаадаас (эсвэл UTC-тэй машинаас) нээхэд KPI-ийн долоо хоногийн хил
 *    чартын (`uzWeekKey`, UB) хилээс 8 цагаар зөрдөг байв. `start`/`end` нь UB-ийн Даваа
 *    00:00-ийн ЖИНХЭНЭ агшин (UTC-ээр Ням 16:00).
 */
export function prevWeek(now = new Date()): { start: Date; end: Date; no: number } {
  const [y, m, d] = ubDayKey(now.getTime()).split('-').map(Number);
  /* UB-ийн хуанлийн өдрийг UTC-ийн «шошго» болгож гарагийг тооцно */
  const day = Date.UTC(y, m - 1, d);
  const mon = day - ((new Date(day).getUTCDay() + 6) % 7) * DAY_MS;
  const prevMon = new Date(mon - 7 * DAY_MS);
  return {
    start: new Date(mon - 7 * DAY_MS - UB_OFFSET_MS),
    end: new Date(mon - UB_OFFSET_MS),
    no: isoWeekOf(prevMon.getUTCFullYear(), prevMon.getUTCMonth(), prevMon.getUTCDate()).no,
  };
};

/** ArcGIS SQL-ийн огноо — сервер UTC-ээр хадгалдаг; `prevWeek`-ийн хил аль хэдийн ЖИНХЭНЭ агшин (UB) */
const sqlTs = (d: Date) => `timestamp '${d.toISOString().slice(0, 19).replace('T', ' ')}'`;

/**
 * ОНОО БҮРТГЭДЭГ ЗАХИАЛАГЧИЙН ХОЁР МАЯГТ — KPI ба «компаниар» чарт ХОЁУЛАНГ
 * нийлүүлнэ (2026-09-17, хэрэглэгчийн хүсэлт: «2 датаг 2 уулангийг нь ашигла»).
 * ⚠️ Нэг нь ТАТАГДАХГҮЙ бол бүхэлдээ АЛДАА — хагас дүн гаргахгүй.
 * ⚠️ Гүйцэтгэгчийн маягт ОРОХГҮЙ — түүнд онооны талбар байхгүй.
 */
const SCORE_URLS = [HABEA.uzleg.v11.url, HABEA.uzleg.zahialagch.url] as const;

/** Өмнөх долоо хоногийн оноо — (талбай × компани)-ийн нэг нүд */
export type ScoreRow = {
  /** Хуудасны «Багц» шүүлтийн түлхүүр (`habeaPkgKey`) — «Бусад» талбайд хоосон */
  pkgK: string;
  /** Хуудасны «Компани» шүүлтийн түлхүүр (`CO_SFX`) — холбогдоогүй бол хоосон */
  coSfx: string;
  coCode: string;
  coLabel: string;
  /** Багцын ШОШГО (`habeaPkgLabel`) — «Үл нийцэл — багцаар»-т */
  pkgLabel: string;
  e: number;
  a: number;
  n: number;
  /**
   * ОНООТОЙ үзлэгийн тоо — `e/a`-д орсон мөрүүд (`sc_all_earned` бөглөгдсөн, `sc_all_appl > 0`).
   * ⚠️ 2026-10-01: KPI-ийн «N үзлэг» (түүврийн хэмжээ) нь ЭНЭ — `n` нь оноогүй үзлэгийг ч тоолно.
   */
  ns: number;
  /** Үл нийцэл = ноцтой + бага зэргийн (`cnt_major + cnt_minor`) */
  nc: number;
};

export type WeekScores = { no: number; rows: ScoreRow[] };

/**
 * ӨМНӨХ БҮТЭН ДОЛОО ХОНОГИЙН ОНОО — (ТАЛБАЙ × КОМПАНИ)-ААР бүлэглэсэн, ХОЁР маягт.
 *
 * ⚠️ 2026-09-17: ДИНАМИК ШҮҮЛТ. Урьд нь бүх төслийн ГАНЦ нийлбэр татдаг тул
 * «Багц»/«Компани» сонгоход KPI «—» болж, компаниар чарт огт өөрчлөгддөггүй
 * байв (хэрэглэгч «бүх юм динамик шүүлтүүртэй юу» гэж шалгуулсан). Одоо
 * сервер (талбай, компани)-аар бүлэглэж өгнө — хэдхэн арван мөр — харин
 * шүүлт нь ЭНД, санах ойд (`weekScoreOf` · `weekScoreByCo`). Шүүлт солиход сүлжээ
 * хөндөхгүй.
 *
 * ⚠️ Талбайн кодыг домэйноор НЭРЛЭЖ, `habeaPkgKey`-ээр багцын түлхүүр болгоно —
 * үзлэгийн самбарын `bagtsK`-тэй ЯГ ижил (Багц 2-ын дэд талбайнууд нэгдэнэ).
 * ⚠️ Жигнэсэн: Σавсан / Σболомжит — нүд бүрийн хувийг дундажлахгүй.
 * ⚠️ Кэшийн TTL 5 минут — Даваа гараг дамжихад шинэ долоо хоногоор бодогдоно.
 */
/**
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ДОЛОО ХОНОГИЙГ `week` ТАЛБАРААР (чарттай НЭГ эх).
 *    Урьд нь KPI нь үзлэгийн ОГНООНЫ хилээр (`insp_datetime`), харин «Үзлэг — долоо
 *    хоногоор» чарт (`byWeek`) нь маягтын `week` кодоор бүлэглэдэг тул нэг долоо хоног
 *    хоёр газар өөр оноо харуулж болдог байв. Одоо хоёулаа `week` (`weekNum` таних
 *    дүрэм) ба ИЖИЛ онооны дүрэм (`sc_all_earned IS NOT NULL AND sc_all_appl > 0` —
 *    `byWeek`-ийн `scA > 0 && scE != null`).
 * ⚠️ 2026-10-09: ДОЛОО ХОНОГ ОДОО ОГНООНООС (ISO) — чарт (`UzlegRow.week` = `uzWeekKey`) ч
 *    мөн огнооноос тул «чарттай НЭГ эх» дүрэм хэвээр. Урьд нь маягтын `week` кодоор
 *    (бөглөгчийн/маягтын тооцоо) тааруулдаг тул ISO долоо хоногоос зөрсөн мөр буруу долоо
 *    хоногт ордог байв. Сервер: `[Даваа, дараа Даваа)` огнооны хил (UB).
 * ⚠️ 2026-10-09: ОГНООГҮЙ мөр ОРОХГҮЙ — урьд нь маягтын `week` кодоор (`OR … IS NULL AND
 *    week IN …`) нөөц болгодог байсан ч чарт тэр мөрүүдийг ISO долоо хоногт оруулдаггүй тул
 *    KPI ба чарт зөрдөг, мөн маягтад `week` талбар алга бол бүх хүсэлт SQL алдаагаар унадаг
 *    байв. Одоо хоёулаа ЗӨВХӨН огноотой мөрөөр — нэг эх.
 * ⚠️ 2026-10-09: метадата (`loadDomains`) УНАВАЛ ШИДНЭ — урьд нь хоосон толиор талбайн кодыг
 *    нэрлэж чадалгүй багцын түлхүүр хоосон болж, тэр БУРУУ дүн 5 минут кэшлэгддэг байв.
 *    `cached` алдааг кэшлэдэггүй тул дараагийн дуудалт дахин оролдоно.
 * ⚠️ КЭШ ДОЛОО ХОНОГООР (`prevWeek().start`) — Даваа гараг дамжихад шинэ түлхүүр тул
 *    хуучин долоо хоногийн дүн 5 минут ч үлдэхгүй (`Habea`-ийн цаг/visibility дэгээ).
 */
const weekScoreLoaders = new Map<number, () => Promise<WeekScores>>();
export function loadWeekScores(now: Date = new Date()): Promise<WeekScores> {
  const w = prevWeek(now);
  const k = w.start.getTime();
  let f = weekScoreLoaders.get(k);
  if (!f) {
    f = cached(() => fetchWeekScores(w), 5 * 60_000, ['HABEA']);
    weekScoreLoaders.set(k, f);
  }
  return f();
}

async function fetchWeekScores(w: { start: Date; end: Date; no: number }): Promise<WeekScores> {
  const auth = await getAuth();
  if (!auth) throw new Error(tr('Үзлэгийн маягтыг зөвхөн нэвтэрсэн хэрэглэгч харна — порталд нэвтэрнэ үү.'));
  const where = `(${U.ognoo} >= ${sqlTs(w.start)} AND ${U.ognoo} < ${sqlTs(w.end)})`;
  const groupBy = `${U.site},${U.company}`;
  /* ⚠️ 2026-10-09: метадата ЭХЛЭЭД — унавал шиднэ (дээрх ⚠️); кэштэй тул хурдан */
  const metas = await Promise.all(SCORE_URLS.map((url) => loadDomains(url)));
  if (metas.some((m) => m.failed)) throw new Error(tr('Маягтын кодын тайлбар уншигдсангүй — дахин оролдоно уу.'));
  const parts = await Promise.all(SCORE_URLS.map((url, ui) => Promise.all([
    queryGroup(
      url,
      groupBy,
      /* ⚠️ Үл нийцлийг ОНООТОЙ НЭГ хил (`where`)-ээр — долоо хоногийн хил, хоёр
         маягт, талбайн нэгтгэл нь «Үл нийцэл — багцаар» чартад ЯГ ижил байх ёстой. */
      [count('objectid', 'n'), sum(U.major, 'mj'), sum(U.minor, 'mn')],
      where,
    ),
    /* ⚠️ 2026-09-25: ОНОО нь «авсан оноо» БӨГЛӨГДСӨН мөрөөс л — урьд нь нэг
       хүсэлтэд `SUM(earned)` хоосныг 0 гэж, `SUM(applicable)` нь тэр мөрийг
       бүтнээр нь тоолж, долоо хоногийн оноог ХУДАЛ бууруулдаг байв (null ≠ 0;
       `byWeek`-ийн ижил дүрэм). Ижил долоо хоногийн хил + `IS NOT NULL`. */
    queryGroup(
      url,
      groupBy,
      [sum(U.scEarned, 'e'), sum(U.scAppl, 'a'), count('objectid', 'ns')],
      `(${where}) AND ${U.scEarned} IS NOT NULL AND ${U.scAppl} > 0`,
    ),
    metas[ui],
  ] as const)));
  /* ⚠️ (талбай × компани) нүдээр НИЙЛҮҮЛНЭ — `where` аль хэдийн тухайн долоо хоногийн
     мөрүүдийг л буцаана (2026-10-09). */
  type Acc = { site: string; coCode: string; n: number; nc: number; e: number; a: number; ns: number };
  const rows: ScoreRow[] = [];
  for (const [grpAll, scoreAll, { dom }] of parts) {
    const keyOf = (r: Record<string, unknown>) =>
      `${r[U.site] == null ? '' : String(r[U.site])}|${r[U.company] == null ? '' : String(r[U.company])}`;
    const acc = new Map<string, Acc>();
    const cell = (r: Record<string, unknown>): Acc => {
      const key = keyOf(r);
      let c = acc.get(key);
      if (!c) {
        c = {
          site: r[U.site] == null ? '' : String(r[U.site]),
          coCode: r[U.company] == null ? '' : String(r[U.company]),
          n: 0, nc: 0, e: 0, a: 0, ns: 0,
        };
        acc.set(key, c);
      }
      return c;
    };
    for (const r of grpAll) {
      const c = cell(r);
      c.n += Number(r.n ?? 0);
      c.nc += Number(r.mj ?? 0) + Number(r.mn ?? 0);
    }
    for (const r of scoreAll) {
      const c = cell(r);
      c.e += Number(r.e ?? 0);
      c.a += Number(r.a ?? 0);
      c.ns += Number(r.ns ?? 0);
    }
    for (const c of acc.values()) {
      const { site, coCode } = c;
      const siteName = clean(dom[U.site]?.get(site) ?? site);
      rows.push({
        pkgK: !site || site === 'other' ? '' : habeaPkgKey(siteName),
        pkgLabel: !site || site === 'other' ? '' : habeaPkgLabel(siteName),
        coSfx: CO_SFX[coCode] ?? '',
        coCode,
        coLabel: coCode === 'other' ? tr('Бусад') : clean(dom[U.company]?.get(coCode) ?? coCode),
        e: c.e, a: c.a, n: c.n, ns: c.ns, nc: c.nc,
      });
    }
  }
  return { no: w.no, rows };
}

/** Хуудасны шүүлтээр нүднүүдийг шүүнэ — `filterUzleg`-тэй ижил «ба» дүрэм */
const passScore = (r: ScoreRow, pkgs: readonly string[], cos: readonly string[]) =>
  (!pkgs.length || pkgs.includes(r.pkgK)) && (!cos.length || cos.includes(r.coSfx));

/** Долоо хоногийн ДУНДАЖ ОНОО — багц ба компанийн шүүлтийг ДАГАНА */
export function weekScoreOf(
  rows: readonly ScoreRow[], pkgs: readonly string[], cos: readonly string[],
): { pct: number | null; n: number; ns: number } {
  let e = 0, a = 0, n = 0, ns = 0;
  for (const r of rows) {
    if (!passScore(r, pkgs, cos)) continue;
    e += r.e; a += r.a; n += r.n; ns += r.ns;
  }
  /* ⚠️ `ns` — онооны ТҮҮВРИЙН хэмжээ (2026-10-01): KPI-д «N үзлэг» гэж ил гарна */
  return { pct: a > 0 ? (e / a) * 100 : null, n, ns };
}

/**
 * КОМПАНИАР ОНОО — багцын шүүлтийг ДАГАНА, компанийн шүүлтийг ҮЛ ТООМСОРЛОНО
 * (ArcGIS-ийн хөндлөн шүүлт: чарт ӨӨРИЙН хэмжээсээр шүүгдэхгүй — эс бөгөөс
 * нэг компани дармагц бусад нь алга болж дахин сонгох боломжгүй).
 * Нэг компани хоёр маягт/олон талбайд байвал КОДООР нийлнэ.
 */
/**
 * ӨМНӨХ ДОЛОО ХОНОГИЙН ҮЛ НИЙЦЭЛ — БАГЦААР (2026-09-17, хэрэглэгчийн хүсэлт:
 * «Үзлэгийн оноо — компаниар»-ын ДООР, түүн шиг долоо хоногоор солигддог, 2
 * маягтаас). Долоо хоногийн дүрэм нь `loadWeekScores`-тэй НЭГ.
 *
 * ⚠️ Компанийн шүүлтийг ДАГАНА, багцын шүүлтийг ҮЛ ТООМСОРЛОНО (өөрийн
 * хэмжээс — дарахад бусад багц алга болохгүй, ArcGIS зан).
 * ⚠️ «Бусад» талбай (`pkgK` хоосон) ОРОХГҮЙ — багц гэж таамаглахгүй.
 */
export function weekNcByPkg(rows: readonly ScoreRow[], cos: readonly string[]) {
  const acc = new Map<string, { label: string; value: number }>();
  for (const r of rows) {
    if (!r.pkgK || r.nc <= 0 || !passScore(r, [], cos)) continue;
    const cur = acc.get(r.pkgK) ?? { label: r.pkgLabel, value: 0 };
    cur.value += r.nc;
    acc.set(r.pkgK, cur);
  }
  return [...acc.entries()]
    /* ⚠️ 2026-10-09: hex #dc2626 → `var(--bad)` (dark горимд дагана) */
    .map(([key, v]) => ({ key, label: v.label, value: v.value, display: num(v.value), color: 'var(--bad)' }))
    .sort((x, y) => y.value - x.value);
}

/**
 * ОНООНЫ ӨНГӨ (2026-10-08, хэрэглэгчийн заасан босго):
 *   70%-иас доош — улаан · 70–90% — улбар шар · 90% ба түүнээс дээш — ногоон.
 * ⚠️ Оролт 0–100 (хувь), 0–1 БИШ. «Үзлэгийн оноо — компаниар» ба «Үзлэгийн оноо —
 * багцаар» хоёр ИЖИЛ дүрмээр будагдана — нэг газраас.
 * ⚠️ 2026-10-09: босгыг ДҮГНЭСЭН утгаар (`Math.round`) — шошго `pct(v, 0)`-тэй нэг: 89.6 нь «90%»
 *    гэж бичигдээд улбар шар байдаг байв. Өнгө нь `kpiLevels.LEVEL_TONE` (CSS хувьсагч — гэрэл/
 *    харанхуй горим), hex БИШ; өнгөний хажууд `LEVEL_MARK` тэмдэг (WCAG 1.4.1).
 * ⚠️ `UZLEG_` угтвартай — `kpiLevels.SCORE_GOOD` (65, багцын нийт оноо)-той андуурагдахгүй.
 */
export const UZLEG_SCORE_GOOD = 90;
export const UZLEG_SCORE_OK = 70;
export const uzScoreLevel = (p: number): Level => {
  const r = Math.round(p);
  return r >= UZLEG_SCORE_GOOD ? 'good' : r >= UZLEG_SCORE_OK ? 'warn' : 'bad';
};
export const scoreColor = (p: number): string => LEVEL_TONE[uzScoreLevel(p)];

/**
 * ӨМНӨХ ДОЛОО ХОНОГИЙН ОНОО — БАГЦААР (2026-10-08, хэрэглэгч: нүүрний «Үзлэгийн оноо —
 * компаниар»-ын ОРОНД «Ажлын байрны үзлэг» шиг босоо багана). Долоо хоногийн дүрэм нь
 * `loadWeekScores`-тэй НЭГ (KPI-тэй ижил), оноо = Σ авсан / Σ боломжит.
 * ⚠️ Компанийн шүүлтийг ДАГАНА, багцын шүүлтийг ҮЛ ТООМСОРЛОНО (өөрийн хэмжээс).
 * ⚠️ «Бусад» талбай (`pkgK` хоосон) ОРОХГҮЙ.
 */
export function weekScoreByPkg(rows: readonly ScoreRow[], cos: readonly string[]) {
  const acc = new Map<string, { label: string; e: number; a: number }>();
  for (const r of rows) {
    if (!r.pkgK || r.a <= 0 || !passScore(r, [], cos)) continue;
    const cur = acc.get(r.pkgK) ?? { label: r.pkgLabel, e: 0, a: 0 };
    cur.e += r.e;
    cur.a += r.a;
    acc.set(r.pkgK, cur);
  }
  return [...acc.entries()]
    .map(([key, v]) => ({ key, label: v.label, value: (v.e / v.a) * 100 }))
    .sort((x, y) => y.value - x.value);
}

export function weekScoreByCo(rows: readonly ScoreRow[], pkgs: readonly string[]) {
  const acc = new Map<string, { e: number; a: number; label: string; sfx: string }>();
  for (const r of rows) {
    if (!r.coCode || !passScore(r, pkgs, [])) continue;
    const cur = acc.get(r.coCode) ?? { e: 0, a: 0, label: r.coLabel, sfx: r.coSfx };
    cur.e += r.e;
    cur.a += r.a;
    acc.set(r.coCode, cur);
  }
  return [...acc.entries()]
    .flatMap(([code, v]) => {
      if (v.a <= 0) return [];
      const p = (v.e / v.a) * 100;
      return [{ key: v.sfx || `co:${code}`, label: v.label, value: p, display: pct(p, 0), color: scoreColor(p) }];
    })
    .sort((x, y) => y.value - x.value);
}

type State =
  | { state: 'idle' }
  | { state: 'loading' }
  /** `retry` — 2026-09-30: алдааны дараа ДАХИН татах (`cached` алдааг кэшлэдэггүй) */
  | { state: 'error'; message: string; retry?: () => void }
  /** `domFail` — 2026-10-06: кодын тайлбар (domain) уншигдсангүй, утга кодоор харагдана */
  | { state: 'ready'; rows: UzlegRow[]; domFail?: boolean; schemaMissing?: readonly string[] };

/**
 * Сонгосон маягтыг татна. `kind` нь `null` бол юу ч татахгүй.
 *
 * ⚠️ УРАГШИЛСАН ХАРИУГ ХАЯНА: хэрэглэгч хоёр шүүлтүүр хооронд хурдан сэлгэвэл
 * эхний хүсэлт нь ХОЙНО ирж, буруу самбарыг дүүргэж болно. `alive` тугаар
 * хамгаална.
 */
/**
 * БАГЦ ба КОМПАНИЙН ШҮҮЛТ — хуудасны олон сонголттой шүүлтүүрээс.
 *
 * ⚠️ Үзлэгт хоёр талбар ХОЁУЛАА бий тул ТУС ТУСДАА хэрэглэнэ: багц нь
 * талбайгаар, компани нь үзлэгт орсон компаниар. Хоёулаа сонгогдвол «ба».
 * Нөгөөгөөс нь ДАМЖУУЛЖ таамаглахгүй: нэг талбайд туслан гүйцэтгэгч үзлэгт
 * орж болох бөгөөд тэр мөрийг «багцын компани биш» гэж хасвал худал.
 */
/**
 * ЧАРТААС ШҮҮХ ХЭМЖЭЭСҮҮД — ArcGIS Dashboard-ын ОЛОН СОНГОЛТЫН горим
 * (2026-09-15, хэрэглэгчийн хүсэлт: «чарт шүүлтүүр нь ArcGIS-ийнх шиг,
 * бүх чартыг multi шүүлтүүртэй болго»).
 *
 * ⚠️ ДҮРЭМ: нэг хэмжээс доторх утгууд «ЭСВЭЛ», хэмжээс хооронд «БА».
 * Хоосон массив = шүүлтгүй.
 *
 * ⚠️ `company`/`site` нь ЧАРТЫН НЭРЭЭР (домэйны нэр) — хуудасны
 * `cos`/`pkgs`-ээс ТУСДАА: «Бусад» талбай, танигдахгүй компани
 * хүн хүчний бүртгэлд зураглагдаагүй тул зөвхөн чартаас сонгогдоно.
 * ⚠️ `day`/`month` нь ХУУДАСНЫ огнооны шүүлт — хүн хүч, осол,
 * үзлэг гурвуулаа дагана (`Habea.tsx`).
 */
export type UzDim = 'sev' | 'shift' | 'company' | 'week' | 'day' | 'month';
/* ⚠️ `string[]` (readonly БИШ): `Bars`/`Donut`-ийн `selected` нь өөрчлөгдөх массив
   хүлээдэг тул readonly дамжуулвал төрлийн алдаа гарна. Энд массивыг ОГТ
   мутацлахгүй — шинэчлэл нь `Habea.toggleDim`-д шинэ массиваар хийгдэнэ. */
export type UzSel = Record<UzDim, string[]>;

/** Зэргийн түлхүүр → хүний уншиж болох нэр (чипэнд) */
/**
 * ГАЗРЫН ЗУРАГ ДЭЭР ДАРСАН ҮЗЛЭГИЙН КАРТЫН МӨРҮҮД.
 * ⚠️ Хэвийн болгосон мөрөөс (домэйны нэр тайлагдсан) — газрын зургийн
 * `attrs` нь ТҮҮХИЙ код («b8», «mcc2») тул шууд харуулбал уншигдахгүй.
 * ⚠️ 0 заалттай зэргийг ХАСНА — «Ноцтой: 0» гэсэн мөр мэдээлэл нэмэхгүй.
 */
export function uzPickRows(r: UzlegRow): [string, string][] {
  const rows: [string, string][] = [
    [tr('Огноо'), r.d > 0 ? date(r.d) : '—'],
    [tr('Талбай'), r.site],
    [tr('Компани'), r.company],
    [tr('Ээлж'), r.shift],
  ];
  const sev: [string, number][] = [
    [tr('Ноцтой үл нийцэл'), r.major],
    [tr('Бага зэргийн үл нийцэл'), r.minor],
    [tr('Ажиглалт'), r.obs],
    [tr('Нийцсэн'), r.conf],
  ];
  for (const [k, v] of sev) if (v > 0) rows.push([k, num(v)]);
  return rows.filter(([, v]) => v !== '—');
}

export const uzValueLabel = (d: UzDim, v: string): string => {
  /* Долоо хоног нь КОДООР (`w3`) хадгалагдана — чипэнд хүний нэрээр.
     ⚠️ 2026-10-09: жилтэй («2026 оны 52-р долоо хоног») — он дамжсан сонголт андуурагдахгүй */
  if (d === 'week') return weekLabel(v, true);
  if (d !== 'sev') return v;
  const m: Record<string, string> = {
    major: tr('Ноцтой үл нийцэл'),
    minor: tr('Бага зэргийн үл нийцэл'),
    obs: tr('Ажиглалт'),
    conf: tr('Нийцсэн'),
    na: tr('Хамааралгүй'),
  };
  return m[v] ?? v;
};

/**
 * ⚠️ ЗЭРЭГ нь МӨРИЙН тоо биш, үзлэг ДОТОРХ заалтын тоо (`cnt_*`). Олон зэрэг
 * сонгоход тэдгээрийн АЛЬ НЭГ нь байгаа үзлэгүүд үлдэнэ («эсвэл»).
 */
const SEV_OF: Record<string, (x: UzlegRow) => number> = {
  major: (x) => x.major, minor: (x) => x.minor, obs: (x) => x.obs,
  conf: (x) => x.conf, na: (x) => x.na,
};

/**
 * Сонголтын гишүүнчлэл — хоосон = бүгд.
 * ⚠️ 2026-10-09: урт жагсаалтад (огнооны муж → 365+ өдөр) мөр бүрд `includes` нь хуудсыг гацаадаг
 *    байв (мөр × өдөр). Жагсаалт бүрийн Set-ийг лавлагаагаар нь (WeakMap) НЭГ удаа угсарна —
 *    `sel.day` өөрчлөгдөхөд л шинэ Set.
 */
const SEL_SETS = new WeakMap<readonly string[], ReadonlySet<string>>();
export const inSel = (arr: readonly string[], v: string): boolean => {
  if (arr.length === 0) return true;
  if (arr.length < 16) return arr.includes(v);
  let s = SEL_SETS.get(arr);
  if (!s) { s = new Set(arr); SEL_SETS.set(arr, s); }
  return s.has(v);
};
const inSet = inSel;

/**
 * НЭГ МӨР ШҮҮЛТЭЭР ГАРАХ УУ — `except` хэмжээсийг ТООЦОХГҮЙ.
 *
 * ⚠️ ЯАГААД `except` ВЭ: ArcGIS Dashboard-д сонгосон чарт ӨӨРИЙН сонголтоор
 * ШҮҮГДЭХГҮЙ — бүх ангиллаа харуулсаар, сонгосон нь тодорч бусад нь
 * бүдгэрнэ. Эс бөгөөс «Өглөө» дармагц ээлжийн чарт ганц баганатай болж,
 * хоёр дахь ээлжийг нэмж сонгох боломж алга болно — олон сонголт утгагүй.
 */
export function uzPass(x: UzlegRow, uz: UzSel, except?: UzDim): boolean {
  if (except !== 'sev' && uz.sev.length && !uz.sev.some((k) => (SEV_OF[k]?.(x) ?? 0) > 0)) return false;
  if (except !== 'shift' && !inSet(uz.shift, x.shift)) return false;
  if (except !== 'company' && !inSet(uz.company, x.company)) return false;
  if (except !== 'week' && !inSet(uz.week, x.week)) return false;
  /* ⚠️ Өдөр/сарыг цувааны түлхүүртэй ЯГ ижил дүрмээр.
     ⚠️ 2026-10-09: хөтчийн локал `dayKey` → Улаанбаатарын `ubDayKey` (`ceo/workforce`) —
     хүн хүчний өдрийн түлхүүртэй НЭГ; гадаадад нээхэд өдөр гулсахгүй. */
  if (except !== 'day' && uz.day.length && !(x.d > 0 && inSet(uz.day, ubDayKey(x.d)))) return false;
  if (except !== 'month' && uz.month.length && !(x.d > 0 && uz.month.includes(ubDayKey(x.d).slice(0, 7)))) return false;
  return true;
}

/**
 * ХУУДАСНЫ БАГЦ · КОМПАНИЙН шүүлт — чартын сонголтоос ӨМНӨХ суурь олонлог.
 * ⚠️ Чартын хэмжээсүүдийг ЭНД хэрэглэхгүй: самбар бүр `uzPass`-аар өөрөө
 * «өөрийгөө хассан» олонлогоо бодно.
 */
export function filterUzleg(st: State, pkgs: readonly string[], cos: readonly string[]): State {
  if (st.state !== 'ready' || (!pkgs.length && !cos.length)) return st;
  return {
    ...st,
    rows: st.rows.filter((x) =>
      (!pkgs.length || pkgs.includes(x.bagtsK))
      && (!cos.length || cos.includes(x.coSfx))),
  };
}
type Pick = { sel: UzSel; onPick: (d: UzDim, key: string) => void };

/**
 * Нэг маягтын хэвийн болгосон мөрүүд — React-гүй.
 * ⚠️ 2026-09-17: «Багц ажлын оноо»-ны ХАБЭА бүлэг ЗӨВХӨН ажлын байрны үзлэгээр
 *    дүгнэгдэнэ (`src/lib/ceo/scorecardLoad.ts`) — `useUzleg`-тэй ЯГ ижил
 *    ачаалагч, домэйн, хэвийн болголт; кэш хуваалцана.
 */
export async function loadUzlegRows(kind: UzlegKind): Promise<UzlegRow[]> {
  const [rows, meta] = await Promise.all([loaders[kind](), loadDomains(HABEA.uzleg[kind].url)]);
  return rows.map((r) => norm(r, meta.dom));
}

/**
 * ТҮҮХИЙ мөр + хэвийн болгосон мөр ИЖИЛ дараалалтай — үзлэгийн тайлан татахад
 * (`UzlegExport`). Түүхий мөрөнд асуулт бүрийн хариулт, хэвийн болгосонд огноо,
 * багц, компанийн нэр. ⚠️ Хуудастай НЭГ ачаалагч (кэш хуваалцана).
 */
export async function loadUzlegBoth(kind: UzlegKind): Promise<{ raw: Row[]; rows: UzlegRow[]; domFail: boolean }> {
  const [raw, meta] = await Promise.all([loaders[kind](), loadDomains(HABEA.uzleg[kind].url)]);
  /* ⚠️ 2026-10-09: `domFail` — тайлан татах цонх ч «Кодын тайлбар уншигдсангүй»-г хэлнэ */
  return { raw, rows: raw.map((r) => norm(r, meta.dom)), domFail: meta.failed };
}

/** Тогтмол лавлагаа — рендер бүрд шинэ объект үүсгэж deps-ийг хөдөлгөхгүй */
const UZ_IDLE: State = { state: 'idle' };
const UZ_LOADING: State = { state: 'loading' };

export function useUzleg(kind: UzlegKind | null): State {
  /* ⚠️ 2026-09-25: төлөвт `kind`-ийг хадгална — маягт солигдсон ЭХНИЙ рендерт
     (эффект `loading` тавихаас өмнө) ӨМНӨХ маягтын мөрүүд шинэ маягтын нэрээр
     нэг агшин зурагдаж, газрын зургийн шүүлт буруу давхаргад IN-жагсаалт
     тавьдаг байв. Төлөвийн `kind` зөрвөл «ачаалж байна» гэж үзнэ. */
  const [st, setSt] = useState<{ kind: UzlegKind | null; st: State }>({ kind: null, st: { state: 'idle' } });
  /* ⚠️ 2026-09-30: «Дахин оролдох» — урьд нь алдааны дараа хуудас дахин ачаалахаас
     өөр гарцгүй байв. Тоолуур өсөхөд эффект дахин ажиллана. */
  const [tries, setTries] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-09-30: татах эффект — түлхүүр солигдоход ачаалж буй/өмнөх төлөвийг синхрон тэглээд шинээр татна; render үед гаргавал бүтэц өөрчлөгдөнө
    if (!kind) { setSt({ kind: null, st: { state: 'idle' } }); return undefined; }
    let alive = true;
    setSt({ kind, st: { state: 'loading' } });
    Promise.all([loaders[kind](), loadDomains(HABEA.uzleg[kind].url)])
      .then(([rows, meta]) => {
        if (alive) {
          setSt({ kind, st: {
            state: 'ready', rows: rows.map((r) => norm(r, meta.dom)), domFail: meta.failed, schemaMissing: meta.missing,
          } });
        }
      })
      .catch((e: unknown) => {
        if (alive) {
          setSt({ kind, st: {
            state: 'error',
            message: friendlyError(e), // ⚠️ 2026-10-04: серверийн англи мөр монгол мессеж дотор гардаг байв
            retry: () => setTries((n) => n + 1),
          } });
        }
      });
    return () => { alive = false; };
  }, [kind, tries]);

  if (!kind) return UZ_IDLE;
  return st.kind === kind ? st.st : UZ_LOADING;
}

/* ═════════════════ Нэгтгэл ═════════════════ */

/** Түлхүүрээр тоолж, ихээс бага руу — «—» (бөглөөгүй) ХАСНА */
/**
 * ДОЛОО ХОНОГООР — оноо эсвэл тоо.
 *
 * ⚠️ ОНОО нь ЖИГНЭСЭН: `Σ авсан / Σ боломжит × 100`. Үзлэг бүрийн хувийг
 * ДУНДАЖЛАХГҮЙ — 5 заалттай үзлэг 60 заалттайтай ижил жинтэй болж,
 * долоо хоногийн бодит оноог гажуудуулна.
 *
 * ⚠️ Боломжит оноо 0 долоо хоног ГАРАХГҮЙ (`null ≠ 0`) — «0%» гэж зурвал
 * «муу» гэж уншигдах ч үнэндээ хэмжилт алга.
 *
 * ⚠️ `score` нь олонлогт ЯДАЖ НЭГ онооны мөр байвал `true` — гүйцэтгэгчийн
 * маягт (талбаргүй) бүхэлдээ ТООГООР гарна.
 */
function byWeek(rows: UzlegRow[]) {
  const score = rows.some((x) => (x.scA ?? 0) > 0);
  /* `d0` — тухайн долоо хоногийн ХАМГИЙН ЭРТ үзлэгийн огноо (эрэмбэд) */
  const m = new Map<string, { n: number; e: number; a: number; d0: number }>();
  for (const r of rows) {
    /* ⚠️ 2026-10-09: огноогүй мөр (`week` хоосон) ОРОХГҮЙ — KPI-тэй нэг дүрэм (`UzlegRow.week`) */
    if (!r.week || !(r.d > 0)) continue;
    const cur = m.get(r.week) ?? { n: 0, e: 0, a: 0, d0: Infinity };
    cur.n += 1;
    /* ⚠️ 2026-09-25: «авсан оноо» хоосон мөрийг ОНООНООС хасна — урьд нь
       `scE ?? 0` тул боломжит нь нэмэгдэж, авсан нь 0 болж оноо худал унадаг байв. */
    if (r.scA != null && r.scA > 0 && r.scE != null) { cur.a += r.scA; cur.e += r.scE; }
    if (r.d > 0 && r.d < cur.d0) cur.d0 = r.d;
    m.set(r.week, cur);
  }
  /* ⚠️ 2026-10-09: цуваа ХОЁР ОН дамжвал шошгонд он — «2026·52-р», «2027·1-р» */
  const multiYear = new Set([...m.keys()].map(weekYear).filter(Boolean)).size > 1;
  const items = [...m.entries()]
    /**
     * ⚠️ ЦАГ ХУГАЦААНЫ ДАРААЛЛААР — долоо хоногийн ЖИНХЭНЭ огноогоор, дугаараар
     * БИШ: он солигдоход «52» нь «1»-ээс ӨМНӨ байх ёстой, дугаараар эрэмбэлбэл
     * эсрэгээр. Огноогүй бол дугаараар, тэр ч үгүй бол («Бусад») хамгийн сүүлд.
     * Хамгийн шинэ долоо хоног БАРУУН захад — гүйлгэгч тийшээ нээгддэг.
     */
    /* ⚠️ 2026-10-09: ДАМЖИХ (transitive) түлхүүр — (огноотой эсэх, d0, дугаар). Урьд нь
       огноотой/огноогүй хосыг дугаараар, огноотой хосыг огноогоор харьцуулдаг тул гурван
       долоо хоногийн дараалал эрэмбэлэгчээс хамаарч өөр гарч болдог байв. */
    .sort((x, y) => {
      const dx = x[1].d0, dy = y[1].d0;
      const fx = Number.isFinite(dx) ? 0 : 1, fy = Number.isFinite(dy) ? 0 : 1;
      if (fx !== fy) return fx - fy;
      if (!fx && dx !== dy) return dx - dy;
      return (weekNum(x[0]) ?? 1e9) - (weekNum(y[0]) ?? 1e9);
    })
    .flatMap(([k, v]) => {
      /* Шошго нь ТОВЧ («37-р») — нарийн баганад багтах ёстой;
         бүтэн нэр нь hover-ийн гарчиг ба шүүлтийн чипэнд гарна. */
      const wn = weekNum(k);
      const yr = multiYear ? weekYear(k) : null;
      const short = wn != null ? `${yr ? `${yr}·` : ''}${tr('{0}-р', String(wn))}` : weekLabel(k);
      if (!score) return [{ key: k, label: short, value: v.n, display: num(v.n) }];
      if (v.a <= 0) return [];
      const p = (v.e / v.a) * 100;
      return [{ key: k, label: short, value: p, display: pct(p, 0) }];
    });
  return { items, score };
}

function countBy(rows: UzlegRow[], of: (x: UzlegRow) => string) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = of(r);
    if (k === '—') continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([key, value]) => ({ key, label: key, value, display: num(value) }))
    .sort((a, b) => b.value - a.value);
}

/**
 * ҮЛ НИЙЦЛИЙН ЗЭРЭГ — маягтын өөрийн `cnt_*` нийлбэрүүд.
 *
 * ⚠️ Шалгах зүйл бүрийг (`s01…e07`) ГАРААР дахин тоолохгүй: маягт нь тоогоо
 * өөрөө бодож `cnt_*`-д бичдэг. Хоёр замаар бодвол домэйны утгыг хэрхэн
 * ангилахаас хамаарч ӨӨР тоо гарч, аль нь зөв нь мэдэгдэхгүй болно.
 *
 * ⚠️ Өнгө нь ХҮНДРЭЛИЙН дарааллаар: ноцтой → улаан, нийцсэн → ногоон.
 * «Хамааралгүй» нь саарал — тэр нь үнэлгээ БИШ.
 */
function severity(rows: UzlegRow[]) {
  /* ⚠️ 2026-10-09: зэрэг БҮРИЙГ өөрийн тугаар (`sevHas[k]`) — бөглөгдөөгүй талбар нийлбэрт
     ОРОХГҮЙ (0 биш мэдэгдэхгүй), гэхдээ бусад зэргийн бодит тоог хаяхгүй. */
  const sum = (k: SevKey) => rows.reduce((s, x) => (x.sevHas[k] ? s + x[k] : s), 0);
  return [
    /* ⚠️ 2026-10-09 («бүх графикийн загварыг жигдлэх»): hex → ДАРААЛСАН шатлалын токен
       `--score-1..5` (globals.css, dark-тай) — хүндрэлийн дараалал (улаан → ногоон) хэвээр. */
    { key: 'major', label: tr('Ноцтой үл нийцэл'), value: sum('major'), color: 'var(--score-1)' },
    { key: 'minor', label: tr('Бага зэргийн үл нийцэл'), value: sum('minor'), color: 'var(--score-2)' },
    { key: 'obs', label: tr('Ажиглалт'), value: sum('obs'), color: 'var(--score-3)' },
    { key: 'conf', label: tr('Нийцсэн'), value: sum('conf'), color: 'var(--score-5)' },
    { key: 'na', label: tr('Хамааралгүй'), value: sum('na'), color: 'var(--ink-3)' },
  ]
    .filter((x) => x.value > 0)
    .map((x) => ({ ...x, display: num(x.value) }));
}

/**
 * САРААР — үзлэгийн ТОО.
 *
 * ⚠️ Огноогүй мөрийг ХАСНА (`d > 0`): 1970-01 гэсэн хиймэл багана гарахаас
 * сэргийлнэ. Шошгод ОН заавал — төсөл олон жил үргэлжилнэ.
 * ⚠️ САРЫГ ЛОКАЛ ЦАГААР авна (`toISOString` = UTC БИШ): Улаанбаатар UTC+8
 *    тул сарын 1-ний 00:00–08:00-ийн үзлэг UTC-ээр ӨМНӨХ сард орж, «сүүлийнх»
 *    гэж `date()`-аар (локал) харуулсан огноотой зөрдөг байв.
 */
/**
 * ӨДРИЙН ЦУВАА — нэг өдөрт хийгдсэн үзлэгийн тоо (2026-09-15, хэрэглэгчийн
 * хүсэлт: «Ажлын байрны үзлэг V1.1 өдрөөр чарт нэм»).
 *
 * ⚠️ 2026-10-09: Улаанбаатарын хуанлиар (`ubDayKey`) — урьд нь хөтчийн локал `dayKey`.
 * ⚠️ ОРОН НУТГИЙН огноогоор (UB). `toISOString` хэрэглэвэл +08
 * бүсэд 00:00–07:59-д хийсэн үзлэг ӨМНӨХ өдөрт тоологдоно — `Habea.tsx`-ийн
 * хүн хүчний өдрийн цуваанд гарсан ижил алдаа (2026-09-11 засагдсан).
 *
 * ⚠️ ЗӨВХӨН үзлэгтэй өдрүүд. Бүх хуанлийн өдрийг 0-ээр дүүргэвэл ~160
 * баганатай урт тэг шугам болж, цөөн бодит үзлэгийг харагдахгүй болгоно.
 * Хүн хүчний өдрийн цуваатай ижил дүрэм — хоёр карт нэг хэлээр уншигдана.
 * Огноогүй (`d <= 0`) мөрийг хасна.
 */
function byDay(rows: UzlegRow[]) {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.d <= 0) continue;
    const k = ubDayKey(r.d);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    /* ⚠️ 2026-10-06: шошго «MM.DD» — «Ажилтан — өдрөөр»-тэй ИЖИЛ. Бүтэн «2026-08-21» нь
       нарийн картад багтахгүй, тэнхлэгийн шошгыг цөөлж график шахагддаг байв. */
    .map(([k, value]) => ({ key: k, label: k.slice(5).replace('-', '.'), value, display: num(value) }));
}

/**
 * ЦАГ ХУГАЦААНЫ ЦУВААНД НЭГ ДОР ХАРАГДАХ ҮЕИЙН ТОО — ХАБЭА-гийн БҮХ
 * өдөр · сар · долоо хоногийн чартад НЭГ утга.
 *
 * ⚠️ 2026-09-17: 8 → 7 (хэрэглэгчийн хүсэлт: «эхний харагдац нь сүүлийн 7
 * утга, дараа нь гүйлгэнэ»). Өгөгдөл цаашид бөглөгдөж цуваа уртсах тул
 * бүх цуваа гүйлгэгчтэй; нээгдэхдээ СҮҮЛИЙН үе рүү очно.
 *
 * ⚠️ ЭНД НЭГ Л УДАА — `Habea.tsx` үүнийг импортолно. Урьд нь хоёр файлд тус
 * тусдаа тогтмол байж, «ИЖИЛ байх ёстой» гэсэн тайлбараар л холбогдож байв.
 * ⚠️ Цуваа `SERIES_VISIBLE`-ээс богино бол гүйлгэгч гарахгүй — бүтэн өргөнд.
 */
export const SERIES_VISIBLE = 7;

function byMonth(rows: UzlegRow[], curYm = '') {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.d <= 0) continue;
    /* ⚠️ 2026-10-09: Улаанбаатарын хуанлиар (`ubDayKey`) — өдрийн цуваа ба шүүлттэй НЭГ */
    const ym = ubDayKey(r.d).slice(0, 7);
    m.set(ym, (m.get(ym) ?? 0) + 1);
  }
  /* ⚠️ 2026-10-01: ЯВАГДАЖ БУЙ сар «*»-тай (`habeaRate.markCurMonth`) — сарын дунд тоо
     ДУТУУ тул «үзлэг буурсан» гэж уншигдахаас сэргийлнэ. */
  return markCurMonth([...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, value]) => ({ key: ym, label: ym.replace('-', '.'), value, display: num(value) })), curYm);
}

/* ═════════════════ Самбар ═════════════════ */

/**
 * ЗҮҮН баганын хэсэг — үл нийцлийн задаргаа ба ээлж.
 *
 * ⚠️ Ачаалж буй / алдаа / хоосон гурван төлөвийг ЗААВАЛ ялгана: хоосон
 * үйлчилгээ ба унасан хүсэлт хоёр нэг л «юу ч алга» болж харагдвал эвдрэлийг
 * хэн ч анзаарахгүй.
 */
/* ═════════════════ Хавсаргасан зураг ═════════════════ */

/**
 * ⚠️ 2026-09-30: `src` нь ТОКЕНГҮЙ хаяг — токеныг РЕНДЕРИЙН агшинд (`photoSrc`) залгана.
 *    Урьд нь ачаалах агшны токен хаягт «шатаж» үлддэг тул хуудас удаан нээлттэй
 *    байж токен шинэчлэгдсэний дараа ‹ › дарахад зураг 498-аар эвдэрдэг байв.
 */
/* ⚠️ 2026-10-09 (аудит №2): `name`/`type` — attachmentInfos-оос, зөвхөн татах файлын нэрэнд (`openAttachment`) */
type UzPhoto = { src: string; cap: string; tip: string; name?: string; type?: string };

/**
 * ХАВСРАЛТЫН ЗУРАГ — BLOB URL (2026-10-09, аюулгүй байдал).
 * ⚠️ Урьд нь `photoSrc` `<img src>`/`<a href>`-д `?token=` залгадаг байв — токен ArcGIS/
 *    прокси/CDN-ийн access log, хөтчийн түүх, Referer-ээр алдагддаг (CWE-598). Одоо зургийг
 *    `uzlegReport.fetchAttachment` (POST, токен БИЕЭР, ЗӨВХӨН байгууллагын хост — `isOrgUrl`,
 *    30с timeout) татаж `URL.createObjectURL` болгоно; солигдох/unmount үед revoke.
 *    Амьдаар баталсан: POST + токен биеэр → зураг; токенгүй GET → HTML нэвтрэх хуудас.
 * ⚠️ Жижиг LRU кэш (сүүлийн `BLOB_CACHE_MAX` Blob) — слайдерыг буцааж гүйлгэхэд дахин
 *    татахгүй; Blob санах ой эзэлдэг тул хязгаартай. Алдаа/`null` кэшлэгдэхгүй.
 * ⚠️ Таб дээр нээх (`openAttachment`) нь ӨӨРИЙН object URL үүсгэж 60с-ийн дараа revoke —
 *    слайдер солигдоход зурагны URL хүчингүй болсон ч нээгдсэн таб эвдрэхгүй.
 */
const BLOB_CACHE_MAX = 12;
const blobCache = new Map<string, Promise<Blob | null>>();
function attBlob(url: string): Promise<Blob | null> {
  const hit = blobCache.get(url);
  if (hit) { blobCache.delete(url); blobCache.set(url, hit); return hit; }
  const p = fetchAttachment(url);
  const drop = () => { if (blobCache.get(url) === p) blobCache.delete(url); };
  p.then((b) => { if (!b) drop(); }, drop);
  blobCache.set(url, p);
  while (blobCache.size > BLOB_CACHE_MAX) {
    const oldest = blobCache.keys().next().value;
    if (oldest == null) break;
    blobCache.delete(oldest);
  }
  return p;
}

/**
 * ⚠️ 2026-10-09 (аудит): растер зургийг ЗӨВШӨӨРӨГДСӨН төрлөөр ДАХИН төрөлжүүлсэн Blob; растер биш
 *    (svg · html · heic …) бол `null`. Серверийн `content-type`-тай Blob-ийг `<a href>`/шинэ табад
 *    өгвөл SVG доторх скрипт порталын origin-д ажиллана (blob URL origin-оо өвлөдөг).
 */
/* ⚠️ 2026-10-09 (аудит №2): `blob.type` хоосон / `application/octet-stream` бол байтын гарын үсгээр
   (`rasterTypeOfBlob` → `sniffRasterType`) — AGOL зургийг төрөлгүй өгөхөд «Зураг татагдсангүй» гардаг байв.
   svg/html ХЭЗЭЭ Ч растер болохгүй (тэдгээрт байтыг ч үзэхгүй). */
const rasterBlob = async (b: Blob): Promise<Blob | null> => {
  const t = await rasterTypeOfBlob(b);
  if (!t) return null;
  return b.type === t ? b : new Blob([b], { type: t });
};

/** Хавсралтын blob URL — `null` = ачаалж буй, `''` = татагдсангүй (эсвэл растер биш) */
function useAttachmentUrl(url: string): string | null {
  const [st, setSt] = useState<{ url: string; obj: string }>({ url: '', obj: '' });
  useEffect(() => {
    let alive = true;
    let obj = '';
    attBlob(url).then((b) => (b ? rasterBlob(b) : null)).then(
      (safe) => {
        if (!alive) return;
        /* ⚠️ 2026-10-09 (аудит): ЗӨВХӨН растер, дахин төрөлжүүлсэн Blob — `<a href>`-ийг дунд товч/
           «шинэ табад нээх»-ээр нээсэн ч SVG/HTML скрипт ажиллахгүй */
        obj = safe ? URL.createObjectURL(safe) : '';
        setSt({ url, obj });
      },
      () => { if (alive) setSt({ url, obj: '' }); },
    );
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [url]);
  return st.url === url ? st.obj : null;
}

/**
 * Хавсралтыг шинэ табад — токенгүй, blob URL-аар (60с-ийн дараа revoke).
 * ⚠️ 2026-10-09 (аудит): ЗӨВХӨН растерыг (jpeg · png · gif · webp · bmp) ДАХИН төрөлжүүлж табад
 *    нээнэ. Бусад (svg · html …) нь `application/octet-stream`-ээр ТАТАГДАНА — урьд нь серверийн
 *    `content-type`-тайгаар нээдэг тул хорлонтой SVG хавсралтын скрипт порталын origin-д ажиллана.
 */
/* ⚠️ 2026-10-09 (аудит №2): `name`/`type` — attachmentInfos-ийн нэр ба зарласан төрөл (заавал биш).
   Урьд нь татах файл үргэлж `attachment-<id>` (өргөтгөлгүй) байв — одоо `attachmentFileName`:
   хавсралтын нэр, өргөтгөлгүй бол зарласан/хариуны төрлөөс. Харуулах шийдвэрт `type`-д ИТГЭХГҮЙ. */
export async function openAttachment(url: string, name?: string, type?: string): Promise<void> {
  const b = await attBlob(url).catch(() => null);
  if (!b) return;
  const safe = await rasterBlob(b);
  const obj = URL.createObjectURL(safe ?? new Blob([b], { type: 'application/octet-stream' }));
  if (safe) window.open(obj, '_blank', 'noopener');
  else {
    const link = document.createElement('a');
    link.href = obj;
    link.download = attachmentFileName(url.split('/').pop() ?? '', name, type || b.type);
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  setTimeout(() => URL.revokeObjectURL(obj), 60_000);
}

/**
 * ХАВСРАЛТЫН ЗУРАГ + ХОЛБООС — `<a><img/></a>` бүтэц (CSS хэвээр), хаяг нь blob URL.
 * ⚠️ `url` нь ТОКЕНГҮЙ ArcGIS хавсралтын хаяг (`…/attachments/<id>`).
 * ⚠️ 2026-10-09 (аудит №2): «Зураг татагдсангүй» (`src === ''` — растер биш эсвэл унасан) үед ч дарахад
 *    `openAttachment` → растер биш бол нэр/өргөтгөлтэй ТАТАГДАНА (heic г.м. алдагдахгүй); унасан бол юу ч болохгүй.
 */
export function AttPhoto({ url, alt, title, className, name, type }: {
  url: string; alt: string; title?: string; className?: string;
  /** ⚠️ 2026-10-09 (аудит №2): attachmentInfos-ийн нэр/төрөл — зөвхөн татах файлын нэрэнд */
  name?: string; type?: string;
}) {
  const src = useAttachmentUrl(url);
  return (
    <a
      href={src || undefined}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={className}
      onClick={(e) => { e.preventDefault(); if (src != null) void openAttachment(url, name, type); }}
    >
      {/* ⚠️ loading="lazy" ХЭРЭГЛЭХГҮЙ — слайдер доод зурваст, lazy-loader асахгүй үлддэг */}
      {src
        ? <img src={src} alt={alt} />
        : <span className={h.photoNote}>{src === '' ? tr('Зураг татагдсангүй') : tr('Зураг ачаалж байна…')}</span>}
    </a>
  );
}

/**
 * ҮЗЛЭГИЙН ХАВСРАЛТ ЗУРГУУД — НЭГ хүсэлтээр (2026-09-15, хэрэглэгчийн
 * хүсэлт: «Ээлжээр чартын доор attach хийсэн зургийг оруул»).
 *
 * ⚠️ `queryAttachments` — МӨР БҮРЭЭР БИШ. Ослын зургийн хана
 * (`Habea.tsx` `loadPhotoBatches`) бүртгэл бүрд тусдаа хүсэлт явуулж
 * 4-4-өөр цувруулдаг; тэр нь 17 осолд тохирно. Үзлэг 100 гаруй тул мөр
 * бүрээр асуувал 25+ дараалсан хүсэлт болно. Давхарга бөөнөөр асуухыг
 * дэмждэг (`supportsQueryAttachments: true`, 2026-09-15 шалгасан).
 *
 * ⚠️ ТОКЕН ХОЁР ГАЗАР ХЭРЭГТЭЙ. Маягтууд нэргүй хэрэглэгчид хаалттай тул
 * (1) жагсаалтын хүсэлт нь токенгүй бол алдаа БИШ ХООСОН хариу өгнө,
 * (2) `<img src>` ч токенгүй бол зураг ачаалагдахгүй. Жагсаалтыг POST
 * биеэр асууна. ⚠️ 2026-10-09: зургийг `?token=`-тэй хаягаар БИШ — `AttPhoto`
 * POST биеэр татаж blob URL-аар харуулна (токен түүх/лог/Referer-т үлдэхгүй).
 *
 * ⚠️ КЭШГҮЙ. Шүүлтүүр солигдоход ганц хүсэлт дахин явна — модулийн кэш
 * нэмбэл өгөгдлийн автобусад бүртгэх шаардлага гарч, хуучирсан зураг
 * үлдэх эрсдэл үүснэ; ганц хүсэлтийн өртөг түүнээс бага.
 *
 * ⚠️ ЭРЭМБЭ: үзлэгийн огноогоор ШИНЭ нь эхэндээ. Хавсралтын өөрийн
 * огноо биш — хэрэглэгч «сүүлийн үзлэгийн зураг»-г хайдаг.
 */
/**
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): ХЭСЭГЧИЛСЭН УНАЛТ — нэг багц (100 үзлэг)-ын
 *    хүсэлт унавал БҮХ зураг алга болж «Зураг татагдсангүй» гардаг байв. Одоо унасан
 *    багцыг алгасаж, хэдэн үзлэгийн зураг татагдсангүйг `failed`-д буцаана (самбарт
 *    «N үзлэгийн зураг татагдсангүй» + «Дахин оролдох»). БҮГД унасан үед л шиднэ.
 */
type UzPhotoSet = { items: UzPhoto[]; failed: number };
async function loadUzPhotos(url: string, rows: UzlegRow[]): Promise<UzPhotoSet> {
  if (!rows.length) return { items: [], failed: 0 };
  const auth = await getAuth();
  if (!auth) throw new Error(tr('Үзлэгийн маягтыг зөвхөн нэвтэрсэн хэрэглэгч харна — порталд нэвтэрнэ үү.'));
  /* ⚠️ БАГЦЛАН асууна (2026-09-16). Урьд нь БҮХ oid нэг хүсэлтэд орж байв:
     ArcGIS нь `attachmentGroups`-ыг `maxRecordCount`-оор ЧИМЭЭГҮЙ тасалдаг тул
     үзлэг олон болоход слайдер «12 зураг» гэж харуулж, бодит 40-ийн 28 нь алга
     болдог — тайралтыг заасан туг Ч БАЙХГҮЙ. 100-гийн багц нь серверийн
     анхдагч хязгаараас доогуур. */
  const OID_BATCH = 100;
  const groups: {
    parentObjectId: number;
    attachmentInfos?: { id: number; name?: string; contentType?: string }[];
  }[] = [];
  let failed = 0;
  let firstErr: unknown = null;
  for (let i = 0; i < rows.length; i += OID_BATCH) {
    const chunk = rows.slice(i, i + OID_BATCH);
    try {
      /* ⚠️ ArcGIS алдааг HTTP 200-аар буцаадаг — биеийг ЗААВАЛ шалгана: `arcgisPost`
         (2026-09-30) үүнийг цөмдөө хийж `ArcGISError` шиднэ; timeout · слот · 429
         backoff · `res.ok` нэмэгдэв.
         ⚠️ 2026-10-09 (хуучирсан тайлбар засав): `token: 'org'` — `params`-д ил токен
         ӨГӨХГҮЙ (`getAuth()` нь зөвхөн нэвтэрсэн эсэхийн шалгалт, `loadPrivate`-ийн ⚠️);
         цөм байгууллагын URL-д ОДООГИЙН токеныг POST биед залгаж, 498-д шинэчлээд нэг удаа давтана. */
      const j = await arcgisPost<{ attachmentGroups?: typeof groups }>(`${url}/queryAttachments`, {
        f: 'json',
        objectIds: chunk.map((x) => x.oid).join(','),
        attachmentTypes: 'image/jpeg,image/png,image/gif,image/webp,image/heic',
      }, { token: 'org' });
      groups.push(...(j.attachmentGroups ?? []));
    } catch (e) {
      failed += chunk.length;
      firstErr ??= e;
    }
  }
  if (failed === rows.length) throw firstErr;
  const byOid = new Map(rows.map((x) => [x.oid, x]));
  const out: (UzPhoto & { d: number })[] = [];
  for (const g of groups) {
    const r = byOid.get(g.parentObjectId);
    if (!r) continue;
    for (const a of g.attachmentInfos ?? []) {
      if (!String(a.contentType ?? 'image/').startsWith('image/')) continue;
      out.push({
        d: r.d,
        src: `${url}/${g.parentObjectId}/attachments/${a.id}`,
        cap: `${r.d > 0 ? date(r.d) : '—'} · ${r.site}`,
        tip: r.company,
        name: a.name,
        type: a.contentType,
      });
    }
  }
  return { items: out.sort((a, b) => b.d - a.d).map(({ src, cap, tip, name, type }) => ({ src, cap, tip, name, type })), failed };
}

/**
 * ХАВСРАЛТЫН СЛАЙДЕР — нэг зураг, ‹ › товч, доор нь огноо · талбай · компани.
 * ⚠️ Ослын зургийн слайдертай (`Habea.tsx` `PhotoWall`) ЯГ ижил загвар ба CSS
 * ангиуд — нэг хуудсан дээр хоёр өөр хэлээр зураг харуулахгүй.
 * ⚠️ Индексийг эффектээр тэглэхгүй: шүүлтээр жагсаалт богиносоход
 * `Math.min`-ээр хязгаарт буцаана (setState-in-effect-ээс зайлсхийнэ).
 */
function UzPhotoSlider({ url, rows }: { url: string; rows: UzlegRow[] }) {
  const ids = rows.map((x) => x.oid).join(',');
  const [idx, setIdx] = useState(0);
  const q = useAsync<UzPhotoSet>(() => loadUzPhotos(url, rows), [url, ids]);
  if (q.state === 'loading') return <Loading label={tr('Зураг ачаалж байна…')} />;
  if (q.state === 'error') {
    return (
      <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
        <Empty label={tr('Зураг татагдсангүй: {0}', friendlyError(q.error))} />
        {q.retry && <button type="button" className={h.retry} onClick={q.retry}>{tr('Дахин оролдох')}</button>}
      </div>
    );
  }
  const n = q.data.items.length;
  /* ⚠️ Хэсэгчилсэн уналтын мөр — зураг байсан ч, үгүй ч ил (`loadUzPhotos`-ийн ⚠️) */
  const failNote = q.data.failed > 0 && (
    <div className={h.photoNote} role="alert">
      {tr('{0} үзлэгийн зураг татагдсангүй', num(q.data.failed))}{' '}
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
          onClick={() => setIdx((i) => (Math.min(i, n - 1) - 1 + n) % n)}
          aria-label={tr('Өмнөх зураг')}
        >
          ‹
        </button>
        {/* ⚠️ 2026-10-09: blob URL (`AttPhoto`) — токен URL-д ОРОХГҮЙ */}
        <AttPhoto url={p.src} alt={`${p.cap} · ${p.tip}`} title={p.tip} className={h.slideImg} name={p.name} type={p.type} />
        <button
          type="button"
          className={h.slideNav}
          disabled={n < 2}
          onClick={() => setIdx((i) => (Math.min(i, n - 1) + 1) % n)}
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

/**
 * ⚠️ 2026-09-15: ГУРАВ ДАХЬ карт («Хавсаргасан зураг») нэмэгдсэн — хэрэглэгч
 * «Ээлжээр чартын доор» гэж шууд заасан. Баруун баганын «хоёроос илүү
 * карт тавихгүй» дүрэм нь ЗҮҮН баганад хамаарахгүй: зүүн багана бүхэлдээ
 * гүйлгэгддэг (2026-09-06-ны хэрэглэгчийн хүсэлт).
 */
/**
 * ҮЛ НИЙЦЭЛ — БАГЦААР (2026-09-17, хэрэглэгчийн хүсэлт: «аль багц дээр хамгийн
 * их үл нийцэл гарч байгааг харуул», «Үл нийцлийн зэрэг»-ийн ДООР).
 *
 * ⚠️ «Үл нийцэл» = НОЦТОЙ + БАГА ЗЭРГИЙН. Ажиглалт ба нийцсэн ОРОХГҮЙ —
 * тэдгээрийг нэмбэл олон үзлэгтэй багц «муу» мэт харагдана.
 * ⚠️ Мөрүүд нь хуудасны «Багц» шүүлтгүй олонлог (`pkgSt`) — дарахад тэр шүүлт
 * тавигддаг тул өөрийн хэмжээсээр шүүгдвэл бусад багц алга болно (ArcGIS зан).
 */
function byPkgNc(rows: UzlegRow[]) {
  const m = new Map<string, { label: string; value: number }>();
  for (const r of rows) {
    if (!r.bagtsK) continue;
    const v = r.major + r.minor;
    if (v <= 0) continue;
    const cur = m.get(r.bagtsK) ?? { label: habeaPkgLabel(r.site), value: 0 };
    cur.value += v;
    m.set(r.bagtsK, cur);
  }
  return [...m.entries()]
    /* ⚠️ 2026-10-09: hex #dc2626 → `var(--bad)` (dark горимд дагана) */
    .map(([key, v]) => ({ key, label: v.label, value: v.value, display: num(v.value), color: 'var(--bad)' }))
    .sort((a, b) => b.value - a.value);
}

/**
 * ОНОО — БАГЦААР (2026-10-08, хэрэглэгчийн хүсэлт: жишээ зурагтай ижил БОСОО багана,
 * өнгө нь `scoreColor`-ийн босгоор, 90%-ийн тасархай зураас).
 * Оноо = Σ авсан / Σ боломжит (үзлэг бүрийн хувийн дундаж БИШ — жинтэй).
 * ⚠️ Оноогүй маягт (гүйцэтгэгчийнх, `scE` null) — мөр үүсэхгүй тул карт зурагдахгүй.
 * ⚠️ `pkgSt` — «Багц» шүүлтгүй олонлог: дарахад шүүлт тавигдана, бусад багц алга болохгүй.
 */
function byPkgScore(rows: UzlegRow[]) {
  const m = new Map<string, { label: string; e: number; a: number }>();
  for (const r of rows) {
    if (!r.bagtsK || r.scE == null || r.scA == null || r.scA <= 0) continue;
    const cur = m.get(r.bagtsK) ?? { label: habeaPkgLabel(r.site), e: 0, a: 0 };
    cur.e += r.scE;
    cur.a += r.scA;
    m.set(r.bagtsK, cur);
  }
  return [...m.entries()]
    .map(([key, v]) => ({ key, label: v.label, value: (v.e / v.a) * 100 }))
    .sort((a, b) => b.value - a.value);
}

/* ⚠️ 2026-10-08 (хэрэглэгч: «чартыг хөндлөн болго, хэвтээ»): БОСОО багана → ХЭВТЭЭ зурвас.
   Өнгө `scoreColor` хэвээр.
   ⚠️ 2026-10-09 («бүх графикийн загварыг жигдлэх»): порталын `Bars`-ийн КАНОН мөр — дээр
   нэр + утга (`--ink-2`, `.num`), доор 2px зам (`--chart-track`). Урьд нь 12px, 50%
   дүүргэлт + хүрээтэй, нэр|зурвас|утга нэг эгнээ байв. 90%-ийн тасархай зорилт ба ✓▲!
   тэмдэг ХЭВЭЭР; `title`-ийн оронд `useTip`; бүдгэрэлт `CHART.dim`. */
export function ScoreColumns({ items, selected, onSelect }: {
  items: { key: string; label: string; value: number }[];
  selected: string[];
  onSelect?: (key: string) => void;
}) {
  const tip = useTip();
  return (
    <div className={h.scoreCols}>
      {items.map((it) => {
        const on = selected.includes(it.key);
        const dim = selected.length > 0 && !on;
        const lv = uzScoreLevel(it.value);
        return (
          <button
            key={it.key} type="button" aria-pressed={on}
            className={h.scoreCol} style={{ opacity: dim ? CHART.dim : 1 }}
            onClick={onSelect ? () => onSelect(it.key) : undefined}
            {...tip.bind({
              label: it.label,
              value: pct(it.value, 0),
              color: LEVEL_TONE[lv],
              hint: [levelLabel(lv), `${tr('Зорилт')}: ${pct(UZLEG_SCORE_GOOD, 0)}`],
            })}
          >
            <span className={h.scoreTop}>
              <span className={h.scoreName}>{it.label}</span>
              {/* ⚠️ 2026-10-09: өнгөний хажууд тэмдэг (✓ ▲ !) — өнгө ганцаараа утга дамжуулахгүй */}
              <b className={`${h.scoreVal} num`}>
                <span className={h.scoreMark} style={{ color: LEVEL_TONE[lv] }}>{LEVEL_MARK[lv]}</span>
                {pct(it.value, 0)}
              </b>
            </span>
            <span className={h.scoreTrack}>
              <span className={h.scoreBar} style={{ width: `${Math.max(0, Math.min(100, it.value))}%`, ["--c" as string]: LEVEL_TONE[lv] } as React.CSSProperties} />
              {/* Зорилтот 90% — тасархай тэмдэг */}
              <i className={h.scoreTarget} style={{ left: `${UZLEG_SCORE_GOOD}%` }} aria-hidden />
            </span>
          </button>
        );
      })}
      {tip.node}
    </div>
  );
}

export function UzlegLeft({
  st, url, sel, onPick, pkgSt, pkgSel, onPkg, photos = true,
}: {
  st: State;
  url: string;
  /** «Багц» шүүлтгүй олонлог — «Үл нийцэл — багцаар» чартад (`byPkgNc`) */
  pkgSt?: State;
  pkgSel?: string[];
  onPkg?: (key: string) => void;
  /** `false` — зургийг дуудагч өөрөө өөр газар (`UzlegPhotos`) байршуулна */
  photos?: boolean;
} & Pick) {
  if (st.state === 'loading') return <Section title={tr('Үзлэг')}><Loading /></Section>;
  if (st.state === 'error') {
    return (
      <Section title={tr('Үзлэг')}>
        <Empty label={tr('Татагдсангүй: {0}', st.message)} />
        {st.retry && <button type="button" className={h.retry} onClick={st.retry}>{tr('Дахин оролдох')}</button>}
      </Section>
    );
  }
  if (st.state !== 'ready') return null;

  /* ⚠️ Чарт бүр ӨӨРИЙН сонголтгүй олонлогоос (ArcGIS зан — `uzPass`); тоо,
     зураг нь БҮХ шүүлттэй олонлогоос. */
  const all = st.rows.filter((x) => uzPass(x, sel));
  const sevRows = st.rows.filter((x) => uzPass(x, sel, 'sev'));
  const sev = severity(sevRows);
  const total = sev.reduce((s, x) => s + x.value, 0);
  /* ⚠️ 2026-10-09: `cnt_*` тоогүй үзлэг — БҮГД тоогүй бол «Заалтын тоо мэдэгдэхгүй», ХОЛИМОГ бол
     «(N үзлэг тоогүй)». Урьд нь ганц мөр тоотой бол бусдыг чимээгүй 0 гэж нийлүүлдэг байв. */
  const noCnt = sevRows.filter((x) => !SEV_KEYS.some((k) => x.sevHas[k])).length;
  const cntUnknown = sevRows.length > 0 && noCnt === sevRows.length;
  const sevNote = cntUnknown
    ? `${tr('{0} үзлэг', num(all.length))} · ${tr('Заалтын тоо мэдэгдэхгүй')}`
    : `${tr('{0} үзлэг · {1} заалт', num(all.length), num(total))}${noCnt ? ` ${tr('({0} үзлэг тоогүй)', num(noCnt))}` : ''}`;
  const byPkg = pkgSt?.state === 'ready' ? byPkgNc(pkgSt.rows.filter((x) => uzPass(x, sel))) : [];
  const byScore = pkgSt?.state === 'ready' ? byPkgScore(pkgSt.rows.filter((x) => uzPass(x, sel))) : [];

  return (
    <>
      {st.domFail && (
        <p className={h.photoNote} role="status">
          ⚠ {tr('Кодын тайлбар уншигдсангүй — зарим утга кодоор харагдана.')}
        </p>
      )}
      {!!st.schemaMissing?.length && (
        <p className={h.photoNote} role="alert">
          ⚠ {tr('Маягтын талбар олдсонгүй: {0} — холбогдох тоо «—» гэж харагдана.', st.schemaMissing.join(', '))}
        </p>
      )}
      {/*
        * ⚠️ ДУГУЙ ДИАГРАМ → SERIAL (баганан) ЧАРТ (2026-09-17, хэрэглэгчийн
        * хүсэлт; өнгө ХЭВЭЭР — `severity()`-ийн `color`).
        *
        * ⚠️ ХЭВТЭЭ (`Bars`), босоо (`Series`) БИШ: зэргийн нэр урт («Бага
        * зэргийн үл нийцэл») тул босоо баганын тэнхлэгт тасарч, `Series`-ийн
        * шошго цөөлөх дүрэм нь заримыг нь бүр НУУДАГ. Хэвтээ мөрөнд нэр бүтэн
        * уншигдана — ArcGIS-ийн serial chart-ын «эргүүлсэн» хувилбартай ижил.
        *
        * ⚠️ Дугуйн төвийн нийт заалтын тоо тэмдэглэлд шилжсэн — баганан чартад
        * «төв» гэж байхгүй ч тэр тоо хэрэгтэй хэвээр.
        */}
      {/* ⚠️ 2026-10-08 (хэрэглэгч): «Үл нийцлийн зэрэг»-ийн ДЭЭР */}
      {byScore.length > 0 && (
        <Section title={tr('Ажлын байрны үзлэг')} note={tr('оноо — багцаар')} fill>
          <ScoreColumns items={byScore} selected={pkgSel ?? []} onSelect={onPkg} />
        </Section>
      )}
      <Section
        title={tr('Үл нийцлийн зэрэг')}
        note={sevNote}
        tone="primary"
      >
        {/* ⚠️ 2026-10-08 (хэрэглэгч): баганан → ДОНАТ, тайлбарт ХУВИАР (`display`-гүй үед
            Donut хувийг өөрөө бодно). Заалтын тоо hover-т ба гарчгийн тэмдэглэлд хэвээр. */}
        {sev.length
          ? (
            <Donut
              items={sev.map(({ display: _d, ...x }) => x)}
              stack size="md" center={num(total)} centerLabel={tr('заалт')}
              selected={sel.sev} onSelect={(k) => onPick('sev', k)}
            />
          )
          : <Empty label={cntUnknown ? tr('Заалтын тоо мэдэгдэхгүй') : tr('Бүртгэл алга')} />}
      </Section>
      {pkgSt && (
        <Section
          title={tr('Нийт үл нийцэл — багцаар')}
          note={byPkg.length ? tr('ноцтой ба бага зэргийн үл нийцэл') : undefined}
        >
          {byPkg.length
            ? <Bars items={byPkg} selected={pkgSel ?? null} onSelect={onPkg} />
            : <Empty label={tr('Үл нийцэл бүртгэгдээгүй')} />}
        </Section>
      )}
      {/* ⚠️ «Ээлжээр» чарт 2026-10-07-нд ХАСАГДАВ (хэрэглэгчийн хүсэлт) — бараг бүх үзлэг өдрийн ээлжинд */}
      {photos && <UzlegPhotos st={st} url={url} sel={sel} />}
    </>
  );
}

/**
 * ХАВСАРГАСАН ЗУРАГ — тусдаа карт (2026-09-17): захиалагчийн хоёр маягтын
 * горимд «Үзлэг — гүйцэтгэгчээр»-ийн ДООР байрлуулахын тулд салгав.
 */
export function UzlegPhotos({ st, url, sel }: { st: State; url: string; sel: UzSel }) {
  if (st.state !== 'ready') return null;
  return (
    <Section title={tr('Хавсаргасан зураг')} note={tr('шинэ нь эхэндээ · дарж томруулна')}>
      <UzPhotoSlider url={url} rows={st.rows.filter((x) => uzPass(x, sel))} />
    </Section>
  );
}

/**
 * БАРУУН баганын хэсэг — гүйцэтгэгч ба талбай. ХОЁР карт.
 *
 * ⚠️ Багана бүрд ХАМГИЙН ИХДЭЭ ХОЁР карт (2026-09-06, хэрэглэгчийн
 * хүсэлт: «нэг дэлгэцээр»). Гурав дахийг нэмбэл багана нь дотроо
 * гүйлгэгддэг болж, доод карт нь дэлгэцээс гарна.
 */
export function UzlegRight({ st, sel, onPick }: { st: State } & Pick) {
  if (st.state !== 'ready') return null;

  const co = countBy(st.rows.filter((x) => uzPass(x, sel, 'company')), (x) => x.company);

  return (
    <>
      <Section
        title={tr('Нийт үзлэг — гүйцэтгэгчээр')}
        note={co.length ? tr('{0} компани', num(co.length)) : undefined}
      >
        {co.length
          ? <Bars items={co} selected={sel.company} onSelect={(k) => onPick('company', k)} />
          : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
    </>
  );
}

/**
 * ДООД зурвасын хэсэг — ӨДРӨӨР ба САРААР, хоёр карт зэрэгцэн.
 *
 * ⚠️ 2026-09-15: урьд нь сарын ГАНЦ карт бүтэн өргөнөөр байв. Өдрийн
 * цуваа ЗҮҮН талд: хэрэглэгч эхлээд «сүүлийн өдрүүдэд юу болсон» гэж
 * хардаг, сарынх нь ерөнхий хандлагыг баруунаас нь өгнө.
 *
 * ⚠️ ГҮЙЛГЭГЧ нээгдмэгц ТӨГСГӨЛ рүү: цуваа хуучнаас шинэ рүү өсдөг тул
 * эхлэлд үлдвэл хамгийн хуучин өдрүүд харагдана.
 */
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
export const stepNote = (
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

/**
 * ⚠️ 2026-10-01: `curYm` — явагдаж буй сар («YYYY-MM», `Habea`-ийн цагаас). Өгвөл сарын
 *    цуваанд тэр сар «*»-тай, тайлбарт «дутуу» гэж гарна.
 */
export function UzlegFin({ st, sel, onPick, curYm = '' }: { st: State; curYm?: string } & Pick) {
  /* ⚠️ Hook-ууд эрт буцахаас ӨМНӨ — дараа нь байвал дуудлагын дараалал
     төлөв бүрд өөр болж React алдаа өгнө. */
  const scroll = useRef<HTMLDivElement>(null);
  /**
   * ӨДӨР ↔ САР — НЭГ КАРТ, гарчгийн шилжүүлэгчтэй (2026-09-17, хэрэглэгчийн
   * хүсэлт: «Техник болон хүн цаг» дээрх хугацааны чарт шиг). Урьд нь өдөр
   * ба сар ХОЁР тусдаа карт байв.
   *
   * ⚠️ Төлөв нь ЭНЭ бүрэлдэхүүнд — хоёр маягт зэрэгцэх горимд (`dual`) хагас
   * бүр ӨӨРИЙН алхамтай: нэгийг сараар, нөгөөг өдрөөр харах нь хүчинтэй
   * (хүн хүчний хоёр картын ижил зарчим).
   */
  const [step, setStep] = useState<'day' | 'month'>('day');
  const days = st.state === 'ready' ? byDay(st.rows.filter((x) => uzPass(x, sel, 'day'))) : [];
  const mon = st.state === 'ready' ? byMonth(st.rows.filter((x) => uzPass(x, sel, 'month')), curYm) : [];
  const monPartial = mon.some((x) => x.key === curYm);
  const series = step === 'day' ? days : mon;
  const seriesLen = series.length;
  /* ⚠️ Алхам солиход ч СҮҮЛИЙН үе рүү гүйлгэнэ — сарын цуваа өөр урттай тул
     өмнөх гүйлгэлтийн байрлал утгагүй болно (`Habea`-ийн техникийн картын дүрэм). */
  useEffect(() => {
    const el = scroll.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [seriesLen, step]);

  /* ДОЛОО ХОНОГИЙН ЦУВАА — мөн сүүлийн `SERIES_VISIBLE` үе, гүйлгэгчтэй.
     ⚠️ Hook тул эрт буцахаас ӨМНӨ бодно (дээрх өдөр/сарын ижил шалтгаан). */
  const wkScroll = useRef<HTMLDivElement>(null);
  const wk = st.state === 'ready'
    ? byWeek(st.rows.filter((x) => uzPass(x, sel, 'week')))
    : { items: [], score: false };
  const wkLen = wk.items.length;
  useEffect(() => {
    const el = wkScroll.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [wkLen]);

  if (st.state !== 'ready') return null;

  const recent = st.rows.filter((x) => uzPass(x, sel) && x.d > 0).sort((a, b) => b.d - a.d).slice(0, 1);

  return (
    <>
      <Section
        title={step === 'day' ? tr('Үзлэг — өдрөөр') : tr('Үзлэг — сараар')}
        note={stepNote(step, setStep,
          step === 'day'
            ? (days.length ? tr('{0} өдөр', num(days.length)) : null)
            : (recent.length
              ? `${tr('сүүлийнх: {0}', date(recent[0].d))}${monPartial ? ` · ${tr('{0} явагдаж буй сар (дутуу)', CUR_MONTH_MARK)}` : ''}`
              : null))}
      >
        {series.length
          ? (
            <div className={h.dayScroll} ref={scroll}>
              <div style={{ minWidth: `${Math.max(100, (series.length / SERIES_VISIBLE) * 100)}%` }}>
                <Series
                  items={series} height={110} unit={tr('үзлэг')} line showValues
                  selected={step === 'day' ? sel.day : sel.month}
                  onSelect={(k) => onPick(step === 'day' ? 'day' : 'month', k)}
                />
              </div>
            </div>
          )
          : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
      {/*
        * ДОЛОО ХОНОГООР — ОНОО. ⚠️ 2026-09-17-нд ХОЁР УДАА өөрчлөгдсөн:
        * «Үзлэг — талбайгаар»-ын оронд баруун баганад багана болж орсон,
        * дараа нь хэрэглэгчийн хүсэлтээр («доошоо цуваул, smooth line
        * болго») ЭНД, өдөр ба сарын цуваатай НЭГ ЗУРВАСТ, ижил муруйгаар.
        * Гурвуулаа ЦАГ ХУГАЦААНЫ цуваа тул зэрэгцэн харагдах нь зөв.
        *
        * ⚠️ ГҮЙЦЭТГЭГЧИЙН МАЯГТАД ОНОО БАЙХГҮЙ — тэр үед ҮЗЛЭГИЙН ТОО гарна,
        * гарчиг нь үүнийг ил хэлнэ. Оноог 0 гэж зурахгүй (`null ≠ 0`).
        */}
      <Section
        title={wk.score ? tr('Үзлэг — долоо хоногоор, оноо') : tr('Үзлэг — долоо хоногоор')}
        note={wk.items.length
          ? (wk.score ? tr('авсан / боломжит оноо') : tr('оноо бүртгэгддэггүй · үзлэгийн тоо'))
          : undefined}
      >
        {wk.items.length
          ? (
            <div className={h.dayScroll} ref={wkScroll}>
              <div style={{ minWidth: `${Math.max(100, (wk.items.length / SERIES_VISIBLE) * 100)}%` }}>
                <Series
                  items={wk.items} height={110} line showValues
                  color={wk.score ? 'var(--good)' : undefined}
                  selected={sel.week} onSelect={(k) => onPick('week', k)}
                />
              </div>
            </div>
          )
          : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
    </>
  );
}
