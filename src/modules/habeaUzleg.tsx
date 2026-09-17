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

import { useEffect, useRef, useState } from 'react';
import { tokenQs } from '@/lib/authToken';
import { t as tr } from '@/lib/i18nCore';
import { queryFeatures, type Row } from '@/lib/query';
import { getAuth } from '@/lib/draftRemote';
import { HABEA, bagtsKey } from '@/lib/services';
import { cached } from '@/lib/live';
import { useAsync } from '@/lib/useAsync';
import { Section, Bars, Donut, Series, Loading, Empty } from '@/components/ui';
import { num, date, text, dayKey } from '@/lib/format';
import h from './habea.module.css';

/* ═════════════════ Төрөл ═════════════════ */

/** Аль маягт вэ */
export type UzlegKind = 'v11' | 'guitsetgegch';

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
    company: named(U.company, U.companyOther),
    /* ⚠️ «Бусад» талбай нь чөлөөт текст — багц гэж ТААМАГЛАХГҮЙ */
    bagtsK: r[U.site] === 'other' ? '' : bagtsKey(site),
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
};

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
export type UzDim = 'sev' | 'shift' | 'company' | 'site' | 'day' | 'month';
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
  if (except !== 'site' && !inSet(uz.site, x.site)) return false;
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
 * ⚠️ Нэг дор харагдах өдрийн тоо — `Habea.tsx`-ийн `DAYS_VISIBLE`-тэй ИЖИЛ
 * утга. Доод зурваст хүн хүчний ба үзлэгийн өдрийн чарт ээлжлэн гардаг тул
 * баганын өргөн нь хоёуланд ижил байх ёстой.
 */
const DAYS_VISIBLE = 8;

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
export function UzlegLeft({ st, url, sel, onPick }: { st: State; url: string } & Pick) {
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

  return (
    <>
      <Section title={tr('Үл нийцлийн зэрэг')} note={tr('{0} үзлэг', num(all.length))} tone="primary">
        {sev.length
          ? (
            <Donut
              items={sev}
              stack
              size={110}
              center={num(total)}
              centerLabel={tr('заалт')}
              selected={sel.sev}
              onSelect={(k) => k !== '__other' && onPick('sev', k)}
            />
          )
          : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
      <Section title={tr('Ээлжээр')}>
        {shift.length
          ? <Bars items={shift} selected={sel.shift} onSelect={(k) => onPick('shift', k)} />
          : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
      <Section title={tr('Хавсаргасан зураг')} note={tr('шинэ нь эхэндээ · дарж томруулна')}>
        <UzPhotoSlider url={url} rows={all} />
      </Section>
    </>
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
  const site = countBy(st.rows.filter((x) => uzPass(x, sel, 'site')), (x) => x.site);

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
      <Section
        title={tr('Үзлэг — талбайгаар')}
        note={site.length ? tr('{0} талбай', num(site.length)) : undefined}
      >
        {site.length
          ? <Bars items={site} selected={sel.site} onSelect={(k) => onPick('site', k)} />
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
export function UzlegFin({ st, sel, onPick }: { st: State } & Pick) {
  /* ⚠️ Hook-ууд эрт буцахаас ӨМНӨ — дараа нь байвал дуудлагын дараалал
     төлөв бүрд өөр болж React алдаа өгнө. */
  const scroll = useRef<HTMLDivElement>(null);
  const days = st.state === 'ready' ? byDay(st.rows.filter((x) => uzPass(x, sel, 'day'))) : [];
  const dayCount = days.length;
  useEffect(() => {
    const el = scroll.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [dayCount]);

  if (st.state !== 'ready') return null;

  const mon = byMonth(st.rows.filter((x) => uzPass(x, sel, 'month')));
  const recent = st.rows.filter((x) => uzPass(x, sel) && x.d > 0).sort((a, b) => b.d - a.d).slice(0, 1);

  return (
    <>
      <Section
        title={tr('Үзлэг — өдрөөр')}
        note={days.length ? tr('{0} өдөр', num(days.length)) : undefined}
      >
        {days.length
          ? (
            <div className={h.dayScroll} ref={scroll}>
              <div style={{ minWidth: `${Math.max(100, (days.length / DAYS_VISIBLE) * 100)}%` }}>
                <Series
                  items={days} height={110} unit={tr('үзлэг')} line showValues
                  selected={sel.day} onSelect={(k) => onPick('day', k)}
                />
              </div>
            </div>
          )
          : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
      <Section
        title={tr('Үзлэг — сараар')}
        note={recent.length ? tr('сүүлийнх: {0}', date(recent[0].d)) : undefined}
      >
        {mon.length
          ? (
            <Series
              items={mon} height={110} unit={tr('үзлэг')} line showValues
              selected={sel.month} onSelect={(k) => onPick('month', k)}
            />
          )
          : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
    </>
  );
}
