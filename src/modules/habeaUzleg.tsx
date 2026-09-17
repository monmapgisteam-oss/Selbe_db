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
import { tokenQs } from '@/lib/authToken';
import { t as tr } from '@/lib/i18nCore';
import { queryFeatures, queryGroup, count, sum, type Row } from '@/lib/query';
import { getAuth } from '@/lib/draftRemote';
import { HABEA, bagtsKey } from '@/lib/services';
import { cached } from '@/lib/live';
import { useAsync } from '@/lib/useAsync';
import { Section, Bars, Series, Loading, Empty } from '@/components/ui';
import { num, date, text, dayKey, pct } from '@/lib/format';
import h from './habea.module.css';

/* ═════════════════ Төрөл ═════════════════ */

/** Аль маягт вэ */
export type UzlegKind = 'v11' | 'guitsetgegch' | 'zahialagch';

const U = HABEA.uzleg.fields;

/* ═════════════════ Домэйн (код → нэр) ═════════════════ */

/** Талбар → (код → нэр) */
type Domains = Record<string, Map<string, string>>;
const domainCache = new Map<string, Promise<Domains>>();

/**
 * ДОМЭЙНЫ КОД → НЭР. Survey123 нь `site` · `company` · `shift` · `week`-ийг
 * codedValue домэйнтой хадгалдаг тул атрибутад «b1», «mcc2», «day» гэсэн КОД
 * ирнэ (2026-09-06-нд амьд метадатаар батлагдсан: site 13 · company 10–11 ·
 * shift 2 · week 11 утга). Хөрвүүлэлтгүй бол чарт кодоор шошгологдоно —
 * хоёр үйлчилгээ одоо хоосон тул анхны мөр ирэхэд л илрэх байсан.
 *
 * ⚠️ Унавал ХООСОН толь буцаана — код хэвээр харагдана, самбар унахгүй.
 * ⚠️ Метадата нь ӨГӨГДӨЛ биш тул автобусын тагт хамаарахгүй; url бүрд нэг
 *    л удаа татна (`domainCache`).
 */
function loadDomains(url: string): Promise<Domains> {
  let p = domainCache.get(url);
  if (!p) {
    type Meta = {
      fields?: { name?: string; domain?: { type?: string; codedValues?: { code?: unknown; name?: string }[] } | null }[];
    };
    p = fetch(`${url}?f=json${tokenQs()}`)
      .then((r) => r.json() as Promise<Meta>)
      .then((j) => {
        const out: Domains = {};
        for (const f of j.fields ?? []) {
          const cv = f.domain?.type === 'codedValue' ? f.domain.codedValues : null;
          if (!f.name || !cv?.length) continue;
          out[f.name] = new Map(cv.map((c) => [String(c.code), String(c.name ?? c.code)]));
        }
        return out;
      })
      .catch(() => ({} as Domains));
    domainCache.set(url, p);
  }
  return p;
}

export type UzlegRow = {
  oid: number;
  site: string;
  /**
   * ДОЛОО ХОНОГИЙН КОД (`w1`…`w10`, `other`) — маягт өөрөө автоматаар
   * бөглөдөг. Чарт ба шүүлтийн ТҮЛХҮҮР; шошгыг `weekLabel` гаргана.
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
  major: number;
  minor: number;
  obs: number;
  conf: number;
  na: number;
};

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
  const m = /^w?(\d+)$/i.exec(k.trim());
  return m ? Number(m[1]) : null;
};

/** Долоо хоногийн шошго — `37` / `w37` → «37-р долоо хоног» */
export const weekLabel = (k: string): string => {
  const n = weekNum(k);
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
  return {
    oid: nn(r.objectid ?? r.OBJECTID),
    site,
    week: r[U.week] == null ? '' : String(r[U.week]),
    scE: nnull(r[U.scEarned]),
    scA: nnull(r[U.scAppl]),
    company: named(U.company, U.companyOther),
    /* ⚠️ «Бусад» талбай нь чөлөөт текст — багц гэж ТААМАГЛАХГҮЙ */
    bagtsK: r[U.site] === 'other' ? '' : habeaPkgKey(site),
    coSfx: CO_SFX[String(r[U.company] ?? '')] ?? '',
    block: clean(r[U.block]),
    shift: named(U.shift),
    d: nn(r[U.ognoo]),
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
  return queryFeatures(url, { outFields: ['*'], token: auth.token });
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

/** ISO-8601 долоо хоногийн дугаар — Даваа гарагаас эхэлнэ, 1-р долоо хоног нь Пүрэв агуулсан */
const isoWeek = (d: Date): number => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7);
};

/**
 * ӨМНӨХ БҮТЭН ДОЛОО ХОНОГ — Даваа 00:00-оос Даваа 00:00 хүртэл, ЛОКАЛ цагаар.
 *
 * ⚠️ Хэрэглэгчийн дүрэм (2026-09-17): «37-р долоо хоног дуусаад мэдээлэл нь
 * 38 дахь долоо хоногтоо харагдана, 38 дуусахад 38-ийн дундажаар солигдоно».
 * Өөрөөр хэлбэл ЯВАГДАЖ БУЙ долоо хоногийг БИШ, хамгийн сүүлд ДУУССАНЫГ —
 * явагдаж буй долоо хоногийн дундаж Даваа гарагт ганц үзлэгээс бүрдэж,
 * өдөр бүр үсэрч савлана.
 *
 * ⚠️ ЛОКАЛ цаг (Улаанбаатар UTC+8): `toISOString`-ийн UTC хил нь Даваа
 * 00:00–08:00-ийн үзлэгийг ӨМНӨХ долоо хоногт хийх байлаа.
 */
export function prevWeek(now = new Date()): { start: Date; end: Date; no: number } {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  end.setDate(end.getDate() - ((end.getDay() + 6) % 7));
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start, end, no: isoWeek(start) };
};

/** ArcGIS SQL-ийн огноо — сервер UTC-ээр хадгалдаг тул локал хилийг UTC болгоно */
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
export const loadWeekScores = cached(async (): Promise<WeekScores> => {
  const auth = await getAuth();
  if (!auth) throw new Error(tr('Үзлэгийн маягтыг зөвхөн нэвтэрсэн хэрэглэгч харна — порталд нэвтэрнэ үү.'));
  const w = prevWeek();
  const where = `${U.ognoo} >= ${sqlTs(w.start)} AND ${U.ognoo} < ${sqlTs(w.end)}`;
  const parts = await Promise.all(SCORE_URLS.map((url) => Promise.all([
    queryGroup(
      url,
      `${U.site},${U.company}`,
      /* ⚠️ Үл нийцлийг ОНООТОЙ НЭГ хүсэлтээр — долоо хоногийн хил, хоёр маягт,
         талбайн нэгтгэл нь «Үл нийцэл — багцаар» чартад ЯГ ижил байх ёстой. */
      [
        sum(U.scEarned, 'e'), sum(U.scAppl, 'a'), count('objectid', 'n'),
        sum(U.major, 'mj'), sum(U.minor, 'mn'),
      ],
      where,
    ),
    loadDomains(url),
  ])));
  const rows: ScoreRow[] = [];
  for (const [grp, dom] of parts) {
    for (const r of grp) {
      const site = r[U.site] == null ? '' : String(r[U.site]);
      const coCode = r[U.company] == null ? '' : String(r[U.company]);
      const siteName = clean(dom[U.site]?.get(site) ?? site);
      rows.push({
        pkgK: !site || site === 'other' ? '' : habeaPkgKey(siteName),
        pkgLabel: !site || site === 'other' ? '' : habeaPkgLabel(siteName),
        coSfx: CO_SFX[coCode] ?? '',
        coCode,
        coLabel: coCode === 'other' ? tr('Бусад') : clean(dom[U.company]?.get(coCode) ?? coCode),
        e: Number(r.e ?? 0),
        a: Number(r.a ?? 0),
        n: Number(r.n ?? 0),
        nc: Number(r.mj ?? 0) + Number(r.mn ?? 0),
      });
    }
  }
  return { no: w.no, rows };
}, 5 * 60_000, ['HABEA']);

/** Хуудасны шүүлтээр нүднүүдийг шүүнэ — `filterUzleg`-тэй ижил «ба» дүрэм */
const passScore = (r: ScoreRow, pkgs: readonly string[], cos: readonly string[]) =>
  (!pkgs.length || pkgs.includes(r.pkgK)) && (!cos.length || cos.includes(r.coSfx));

/** Долоо хоногийн ДУНДАЖ ОНОО — багц ба компанийн шүүлтийг ДАГАНА */
export function weekScoreOf(
  rows: readonly ScoreRow[], pkgs: readonly string[], cos: readonly string[],
): { pct: number | null; n: number } {
  let e = 0, a = 0, n = 0;
  for (const r of rows) {
    if (!passScore(r, pkgs, cos)) continue;
    e += r.e; a += r.a; n += r.n;
  }
  return { pct: a > 0 ? (e / a) * 100 : null, n };
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
    .map(([key, v]) => ({ key, label: v.label, value: v.value, display: num(v.value), color: '#dc2626' }))
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
      return [{ key: v.sfx || `co:${code}`, label: v.label, value: p, display: pct(p, 0) }];
    })
    .sort((x, y) => y.value - x.value);
}

type State =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; rows: UzlegRow[] };

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
  /* Долоо хоног нь КОДООР (`w3`) хадгалагдана — чипэнд хүний нэрээр */
  if (d === 'week') return weekLabel(v);
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

const inSet = (arr: readonly string[], v: string) => arr.length === 0 || arr.includes(v);

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
  /* ⚠️ Өдөр/сарыг ЛОКАЛ огноогоор — цувааны түлхүүртэй ЯГ ижил `dayKey` */
  if (except !== 'day' && uz.day.length && !(x.d > 0 && uz.day.includes(dayKey(x.d)))) return false;
  if (except !== 'month' && uz.month.length && !(x.d > 0 && uz.month.includes(dayKey(x.d).slice(0, 7)))) return false;
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
  const [rows, dom] = await Promise.all([loaders[kind](), loadDomains(HABEA.uzleg[kind].url)]);
  return rows.map((r) => norm(r, dom));
}

export function useUzleg(kind: UzlegKind | null): State {
  const [st, setSt] = useState<State>({ state: 'idle' });

  useEffect(() => {
    if (!kind) { setSt({ state: 'idle' }); return undefined; }
    let alive = true;
    setSt({ state: 'loading' });
    Promise.all([loaders[kind](), loadDomains(HABEA.uzleg[kind].url)])
      .then(([rows, dom]) => { if (alive) setSt({ state: 'ready', rows: rows.map((r) => norm(r, dom)) }); })
      .catch((e: unknown) => {
        if (alive) setSt({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => { alive = false; };
  }, [kind]);

  return st;
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
    if (!r.week) continue;
    const cur = m.get(r.week) ?? { n: 0, e: 0, a: 0, d0: Infinity };
    cur.n += 1;
    if (r.scA != null && r.scA > 0) { cur.a += r.scA; cur.e += r.scE ?? 0; }
    if (r.d > 0 && r.d < cur.d0) cur.d0 = r.d;
    m.set(r.week, cur);
  }
  const items = [...m.entries()]
    /**
     * ⚠️ ЦАГ ХУГАЦААНЫ ДАРААЛЛААР — долоо хоногийн ЖИНХЭНЭ огноогоор, дугаараар
     * БИШ: он солигдоход «52» нь «1»-ээс ӨМНӨ байх ёстой, дугаараар эрэмбэлбэл
     * эсрэгээр. Огноогүй бол дугаараар, тэр ч үгүй бол («Бусад») хамгийн сүүлд.
     * Хамгийн шинэ долоо хоног БАРУУН захад — гүйлгэгч тийшээ нээгддэг.
     */
    .sort((x, y) => {
      const dx = x[1].d0, dy = y[1].d0;
      if (dx !== dy && Number.isFinite(dx) && Number.isFinite(dy)) return dx - dy;
      return (weekNum(x[0]) ?? 1e9) - (weekNum(y[0]) ?? 1e9);
    })
    .flatMap(([k, v]) => {
      /* Шошго нь ТОВЧ («37-р») — нарийн баганад багтах ёстой;
         бүтэн нэр нь hover-ийн гарчиг ба шүүлтийн чипэнд гарна. */
      const wn = weekNum(k);
      const short = wn != null ? tr('{0}-р', String(wn)) : weekLabel(k);
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
  const sum = (of: (x: UzlegRow) => number) => rows.reduce((s, x) => s + of(x), 0);
  return [
    { key: 'major', label: tr('Ноцтой үл нийцэл'), value: sum((x) => x.major), color: '#dc2626' },
    { key: 'minor', label: tr('Бага зэргийн үл нийцэл'), value: sum((x) => x.minor), color: '#f97316' },
    { key: 'obs', label: tr('Ажиглалт'), value: sum((x) => x.obs), color: '#eab308' },
    { key: 'conf', label: tr('Нийцсэн'), value: sum((x) => x.conf), color: '#16a34a' },
    { key: 'na', label: tr('Хамааралгүй'), value: sum((x) => x.na), color: 'var(--ink-3)' },
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
 * ⚠️ ОРОН НУТГИЙН огноогоор (`dayKey`). `toISOString` хэрэглэвэл +08
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
    const k = dayKey(r.d);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, value]) => ({ key: k, label: k, value, display: num(value) }));
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

function byMonth(rows: UzlegRow[]) {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.d <= 0) continue;
    const dt = new Date(r.d);
    const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    m.set(ym, (m.get(ym) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, value]) => ({ key: ym, label: ym.replace('-', '.'), value, display: num(value) }));
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

type UzPhoto = { src: string; cap: string; tip: string };

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
 * биеэр, зургийн хаягийг `?token=`-тэй угсарна — ArcGIS JS SDK хаалттай
 * хавсралтад ЯГ ингэдэг. ⚠️ Токен нь тухайн хэрэглэгчийн өөрийн богино
 * хугацаат OAuth токен; зургийг шинэ цонхонд нээхэд хөтчийн түүхэнд
 * үлдэнэ — хугацаа нь дуусахаар хүчингүй болно.
 *
 * ⚠️ КЭШГҮЙ. Шүүлтүүр солигдоход ганц хүсэлт дахин явна — модулийн кэш
 * нэмбэл өгөгдлийн автобусад бүртгэх шаардлага гарч, хуучирсан зураг
 * үлдэх эрсдэл үүснэ; ганц хүсэлтийн өртөг түүнээс бага.
 *
 * ⚠️ ЭРЭМБЭ: үзлэгийн огноогоор ШИНЭ нь эхэндээ. Хавсралтын өөрийн
 * огноо биш — хэрэглэгч «сүүлийн үзлэгийн зураг»-г хайдаг.
 */
async function loadUzPhotos(url: string, rows: UzlegRow[]): Promise<UzPhoto[]> {
  if (!rows.length) return [];
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
  for (let i = 0; i < rows.length; i += OID_BATCH) {
    const chunk = rows.slice(i, i + OID_BATCH);
    const res = await fetch(`${url}/queryAttachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        f: 'json',
        objectIds: chunk.map((x) => x.oid).join(','),
        attachmentTypes: 'image/jpeg,image/png,image/gif,image/webp,image/heic',
        token: auth.token,
      }),
    });
    /* ⚠️ ArcGIS алдааг HTTP 200-аар буцаадаг — биеийг ЗААВАЛ шалгана */
    const j = await res.json() as {
      error?: { message?: string };
      attachmentGroups?: typeof groups;
    };
    if (j.error) throw new Error(j.error.message || tr('ArcGIS алдаа'));
    groups.push(...(j.attachmentGroups ?? []));
  }
  const byOid = new Map(rows.map((x) => [x.oid, x]));
  const out: (UzPhoto & { d: number })[] = [];
  for (const g of groups) {
    const r = byOid.get(g.parentObjectId);
    if (!r) continue;
    for (const a of g.attachmentInfos ?? []) {
      if (!String(a.contentType ?? 'image/').startsWith('image/')) continue;
      out.push({
        d: r.d,
        src: `${url}/${g.parentObjectId}/attachments/${a.id}?token=${encodeURIComponent(auth.token)}`,
        cap: `${r.d > 0 ? date(r.d) : '—'} · ${r.site}`,
        tip: r.company,
      });
    }
  }
  return out.sort((a, b) => b.d - a.d).map(({ src, cap, tip }) => ({ src, cap, tip }));
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
  const q = useAsync<UzPhoto[]>(() => loadUzPhotos(url, rows), [url, ids]);
  if (q.state === 'loading') return <Loading label={tr('Зураг ачаалж байна…')} />;
  if (q.state === 'error') {
    return (
      <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
        <Empty label={tr('Зураг татагдсангүй: {0}', q.error.message)} />
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
          onClick={() => setIdx((i) => (Math.min(i, n - 1) - 1 + n) % n)}
          aria-label={tr('Өмнөх зураг')}
        >
          ‹
        </button>
        <a href={p.src} target="_blank" rel="noreferrer" title={p.tip} className={h.slideImg}>
          {/* ⚠️ loading="lazy" ХЭРЭГЛЭХГҮЙ — ослын слайдерын ижил шалтгаан:
              багана гүйлгэгдэж харагдах хүртэл lazy-loader асахгүй. */}
          <img src={p.src} alt={`${p.cap} · ${p.tip}`} />
        </a>
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
    .map(([key, v]) => ({ key, label: v.label, value: v.value, display: num(v.value), color: '#dc2626' }))
    .sort((a, b) => b.value - a.value);
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
      </Section>
    );
  }
  if (st.state !== 'ready') return null;

  /* ⚠️ Чарт бүр ӨӨРИЙН сонголтгүй олонлогоос (ArcGIS зан — `uzPass`); тоо,
     зураг нь БҮХ шүүлттэй олонлогоос. */
  const all = st.rows.filter((x) => uzPass(x, sel));
  const sev = severity(st.rows.filter((x) => uzPass(x, sel, 'sev')));
  const shift = countBy(st.rows.filter((x) => uzPass(x, sel, 'shift')), (x) => x.shift);
  const total = sev.reduce((s, x) => s + x.value, 0);
  const byPkg = pkgSt?.state === 'ready' ? byPkgNc(pkgSt.rows.filter((x) => uzPass(x, sel))) : [];

  return (
    <>
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
      <Section
        title={tr('Үл нийцлийн зэрэг')}
        note={tr('{0} үзлэг · {1} заалт', num(all.length), num(total))}
        tone="primary"
      >
        {sev.length
          ? <Bars items={sev} selected={sel.sev} onSelect={(k) => onPick('sev', k)} />
          : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
      {pkgSt && (
        <Section
          title={tr('Үл нийцэл — багцаар')}
          note={byPkg.length ? tr('ноцтой ба бага зэргийн үл нийцэл') : undefined}
        >
          {byPkg.length
            ? <Bars items={byPkg} selected={pkgSel ?? null} onSelect={onPkg} />
            : <Empty label={tr('Үл нийцэл бүртгэгдээгүй')} />}
        </Section>
      )}
      <Section title={tr('Ээлжээр')}>
        {shift.length
          ? <Bars items={shift} selected={sel.shift} onSelect={(k) => onPick('shift', k)} />
          : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
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
        title={tr('Үзлэг — гүйцэтгэгчээр')}
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

export function UzlegFin({ st, sel, onPick }: { st: State } & Pick) {
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
  const mon = st.state === 'ready' ? byMonth(st.rows.filter((x) => uzPass(x, sel, 'month'))) : [];
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
            : (recent.length ? tr('сүүлийнх: {0}', date(recent[0].d)) : null))}
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
                  color={wk.score ? '#16a34a' : undefined}
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
