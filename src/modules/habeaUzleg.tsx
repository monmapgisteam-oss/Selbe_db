'use client';

/**
 * АЖЛЫН БАЙРНЫ ҮЗЛЭГ — ХАБЭА хуудасны шүүлтүүрээр нээгддэг хоёр самбар.
 *
 * `HABEA.uzleg`-ийн ХОЁР Survey123 маягт (V11 · Гүйцэтгэгчийн) бүтцээрээ ЯГ
 * ИЖИЛ тул нэг л дүрслэл хоёуланд үйлчилнэ — зөвхөн URL нь ялгаатай.
 *
 * ⚠️ ЯАГААД ТУСДАА ФАЙЛ ВЭ: `Habea.tsx` аль хэдийн 1,500 мөр. Үзлэгийн
 * ачаалалт, хэвийн болголт, дөрвөн чарт нь тэр файлын хөндлөн шүүлтийн логиктой
 * ОГТ огтлолцдоггүй (үзлэг нь багц ч, гүйцэтгэгчийн баганын бүлэг ч агуулдаггүй)
 * тул тэнд нэмбэл зөвхөн уншихад хүндрэл нэмнэ.
 *
 * ⚠️ ХОЁУЛАА ХООСОН эх сурвалж (0 мөр, 2026-09-06). Бүх чарт «Бүртгэл алга»
 * гэж гарна — энэ нь эвдрэл БИШ. Хоосныг нөхөх гэж ямар нэг тоо ЗОХИОЖ
 * болохгүй; өгөгдөл ирэхэд самбар өөрөө дүүрнэ.
 */

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { queryFeatures, type Row } from '@/lib/query';
import { HABEA } from '@/lib/services';
import { cached } from '@/lib/live';
import { Section, Bars, Donut, Series, Loading, Empty } from '@/components/ui';
import { num, date, text } from '@/lib/format';

/* ═════════════════ Төрөл ═════════════════ */

/** Аль маягт вэ */
export type UzlegKind = 'v11' | 'guitsetgegch';

const U = HABEA.uzleg.fields;

export type UzlegRow = {
  oid: number;
  site: string;
  company: string;
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

const norm = (r: Row): UzlegRow => ({
  oid: nn(r.objectid ?? r.OBJECTID),
  /* «Бусад» сонгосон үед жинхэнэ нэр нь `*_other` талбарт бичигдэнэ */
  site: clean(r[U.site] === 'other' ? r[U.siteOther] : r[U.site]),
  company: clean(r[U.company] === 'other' ? r[U.companyOther] : r[U.company]),
  block: clean(r[U.block]),
  shift: clean(r[U.shift]),
  d: nn(r[U.ognoo]),
  major: nn(r[U.major]),
  minor: nn(r[U.minor]),
  obs: nn(r[U.obs]),
  conf: nn(r[U.conf]),
  na: nn(r[U.na]),
});

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
const loaders: Record<UzlegKind, () => Promise<Row[]>> = {
  v11: cached(
    () => queryFeatures(HABEA.uzleg.v11.url, { outFields: ['*'] }),
    5 * 60_000,
    ['HABEA'],
  ),
  guitsetgegch: cached(
    () => queryFeatures(HABEA.uzleg.guitsetgegch.url, { outFields: ['*'] }),
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
export function useUzleg(kind: UzlegKind | null): State {
  const [st, setSt] = useState<State>({ state: 'idle' });

  useEffect(() => {
    if (!kind) { setSt({ state: 'idle' }); return undefined; }
    let alive = true;
    setSt({ state: 'loading' });
    loaders[kind]()
      .then((rows) => { if (alive) setSt({ state: 'ready', rows: rows.map(norm) }); })
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
 */
function byMonth(rows: UzlegRow[]) {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.d <= 0) continue;
    const ym = new Date(r.d).toISOString().slice(0, 7);
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
export function UzlegLeft({ st }: { st: State }) {
  if (st.state === 'loading') return <Section title={tr('Үзлэг')}><Loading /></Section>;
  if (st.state === 'error') {
    return (
      <Section title={tr('Үзлэг')}>
        <Empty label={tr('Татагдсангүй: {0}', st.message)} />
      </Section>
    );
  }
  if (st.state !== 'ready') return null;

  const sev = severity(st.rows);
  const shift = countBy(st.rows, (x) => x.shift);
  const total = sev.reduce((s, x) => s + x.value, 0);

  return (
    <>
      <Section title={tr('Үл нийцлийн зэрэг')} note={tr('{0} үзлэг', num(st.rows.length))} tone="primary">
        {sev.length
          ? (
            <Donut
              items={sev}
              stack
              size={110}
              center={num(total)}
              centerLabel={tr('заалт')}
            />
          )
          : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
      <Section title={tr('Ээлжээр')}>
        {shift.length ? <Bars items={shift} /> : <Empty label={tr('Бүртгэл алга')} />}
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
export function UzlegRight({ st }: { st: State }) {
  if (st.state !== 'ready') return null;

  const co = countBy(st.rows, (x) => x.company);
  const site = countBy(st.rows, (x) => x.site);

  return (
    <>
      <Section
        title={tr('Үзлэг — гүйцэтгэгчээр')}
        note={co.length ? tr('{0} компани', num(co.length)) : undefined}
      >
        {co.length ? <Bars items={co} /> : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
      <Section
        title={tr('Үзлэг — талбайгаар')}
        note={site.length ? tr('{0} талбай', num(site.length)) : undefined}
      >
        {site.length ? <Bars items={site} /> : <Empty label={tr('Бүртгэл алга')} />}
      </Section>
    </>
  );
}

/** ДООД зурвасын хэсэг — сарын цуваа. ГАНЦ карт, бүтэн өргөнөөр. */
export function UzlegFin({ st }: { st: State }) {
  if (st.state !== 'ready') return null;

  const mon = byMonth(st.rows);
  const recent = [...st.rows].filter((x) => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 1);

  return (
    <Section
      title={tr('Үзлэг — сараар')}
      note={recent.length ? tr('сүүлийнх: {0}', date(recent[0].d)) : undefined}
    >
      {mon.length
        ? <Series items={mon} height={110} unit={tr('үзлэг')} line showValues />
        : <Empty label={tr('Бүртгэл алга')} />}
    </Section>
  );
}
