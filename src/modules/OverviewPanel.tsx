'use client';

import { useEffect, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import {
  Section, Stats, Stat, Bars, Stack, Ring, Data, Split, Note, Col, SubHead, List, ListItem,
} from '@/components/ui';
import { useMap } from '@/components/MapCanvas';
import { useFilter } from '@/lib/filter';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures, sqlStr, type Row } from '@/lib/query';
import {
  BUILDING, PARCEL, PROGRESS_LEVELS, STAGE_NA, SURVEY, surveyBlock, MODULES,
} from '@/lib/services';
import { num, pct, text } from '@/lib/format';
import s from './overview.module.css';

const HUE = MODULES.find((m) => m.key === 'overview')!.hue;
const B = BUILDING.fields;
const P = PARCEL.fields;

/**
 * Чөлөөлөлтийг ЗОГСООЖ буй төлөвүүд.
 *
 * ⚠️ «зөвшилцөх», «үлдэх саналтай» нь энд ОРОХГҮЙ: тэдгээр нь хэвийн явцын үе
 * шатууд бөгөөд дохио болговол жагсаалт хэдэн зуу болж, жинхэнэ саатал нь дунд
 * нь алдагдана. Зөвхөн ГАДНЫ шийдвэргүйгээр урагшлахгүй болсныг оруулна.
 */
const BLOCKED_STATUS = ['маргаантай', 'үнийн дүн зөвшөөрөөгүй', 'татгалзсан'];

/**
 * Төлөвлөгөө ба талбайн хэмжилтийн зөрүүг «шалгах шаардлагатай» гэж үзэх босго.
 *
 * ⚠️ Хоёр тоо ӨӨР аргаар хэмжигддэг тул бага зөрүү нь хэвийн (`BuildingPanel`-ийн
 * тайлбарыг үз). 15 нэгжээс дээш зөрүү л анхаарал татна — үүнээс доогуур болговол
 * бараг бүх блок дохио өгч, дохио утгаа алдана.
 */
const GAP_LIMIT = 15;

/** «Хамгийн хоцорсон» жагсаалтад харуулах блокийн тоо */
const WORST = 8;

const DAY = 86_400_000;

/** Огноог харьцуулж болох тоо болгоно. ArcGIS epoch (мс) ба ISO мөр хоёуланг авна. */
function asTime(v: unknown): number | null {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

/**
 * Тоймын өгөгдөл.
 *
 * ⚠️ Барилга (113) ба нэгж талбар (224)-ыг БҮТНЭЭР татаж, дүгнэлтийг клиент талд
 * бодно. `outStatistics`-аар хийж БОЛОХГҮЙ шалтгаанууд:
 *
 *   · `GUITS_OGN` нь огнооны талбар БИШ, `esriFieldTypeString` («2025-12-31»).
 *     SQL-ийн огнооны харьцуулалт түүн дээр найдваргүй — задлалтыг клиент талд
 *     хийх нь цорын ганц зөв арга.
 *   · Дохио/мөр дээр дарахад ЯГ ТЭР объектуудыг зурагт гэрэлтүүлэх ёстой. Түүнд
 *     id-ийн жагсаалт хэрэгтэй бөгөөд нийлбэр статистик түүнийг өгөхгүй.
 *   · Талбайн тайлантай холбохын тулд блокийн дугаарыг `surveyBlock()`-оор задлах
 *     шаардлагатай — үүнийг SQL-д хийх боломжгүй.
 *
 * ~340 мөр нь нэг хүсэлт тутамд хямд; гурван давхарга зэрэг асуугдана.
 */
function useOverview() {
  return useAsync(async () => {
    const [blocks, parcels, reports] = await Promise.all([
      queryFeatures(BUILDING.url, {
        outFields: [BUILDING.oid, B.block, B.bagts, B.progress, B.dueDate, B.contractor],
      }),
      queryFeatures(PARCEL.url, { outFields: [PARCEL.oid, P.status] }),
      queryFeatures(SURVEY.url, {
        outFields: [SURVEY.fields.building, SURVEY.fields.total],
        orderBy: `${SURVEY.fields.created} DESC`,
        limit: 200,
      }).catch(() => [] as Row[]),
    ]);

    const now = Date.now();

    /** Гүйцэтгэл бүртгэгдсэн блокууд. −1 = бүртгэгдээгүй, дундажид оруулж болохгүй. */
    const tracked = blocks.filter((r) => r[B.progress] != null && Number(r[B.progress]) > STAGE_NA);
    const untracked = blocks.filter((r) => r[B.progress] == null || Number(r[B.progress]) <= STAGE_NA);

    const overall = tracked.length
      ? tracked.reduce((a, r) => a + Number(r[B.progress]), 0) / tracked.length
      : null;

    /** Блок бүрийн хоцрогдол — хугацаа хэтэрсэн хоног ба гүйцэтгэл */
    const rated = tracked.map((r) => {
      const due = asTime(r[B.dueDate]);
      return {
        row: r,
        oid: Number(r[BUILDING.oid]),
        blok: text(r[B.block], '—'),
        bagts: text(r[B.bagts], 'Тодорхойгүй'),
        progress: Number(r[B.progress]),
        /** Хугацаа хэтэрсэн хоног. Сөрөг = хугацаа хараахан болоогүй. */
        late: due == null ? null : Math.floor((now - due) / DAY),
      };
    });

    const overdue = rated.filter((x) => x.late != null && x.late > 0 && x.progress < 100);
    const lateDays = overdue.map((x) => x.late!);

    /* ── Түвшний хуваарилалт ── */
    const levels = PROGRESS_LEVELS.map((l) => ({
      ...l,
      value: rated.filter((x) => x.progress >= l.min && x.progress < l.max).length,
    }));

    /* ── Багцаар: гүйцэтгэл ба хоцрогдол ── */
    const byBagts = new Map<string, typeof rated>();
    for (const x of rated) byBagts.set(x.bagts, [...(byBagts.get(x.bagts) ?? []), x]);

    const packages = [...byBagts.entries()]
      .map(([key, xs]) => {
        const late = xs.map((x) => x.late).filter((v): v is number => v != null);
        return {
          key,
          blocks: xs.length,
          progress: xs.reduce((a, x) => a + x.progress, 0) / xs.length,
          late: late.length ? Math.round(late.reduce((a, b) => a + b, 0) / late.length) : null,
        };
      })
      // Хамгийн МУУ нь дээрээ — эрэмбэ нь өөрөө мэдээлэл өгнө
      .sort((a, b) => a.progress - b.progress);

    /**
     * Хамгийн хоцорсон блокууд.
     *
     * ⚠️ Зөвхөн гүйцэтгэлээр эсвэл зөвхөн хоцрогдлоор эрэмбэлж болохгүй: бүх блок
     * хугацаа хэтэрсэн тул хоцрогдол дангаараа ялгахгүй, харин гүйцэтгэл дангаараа
     * саяхан эхэлсэн блокийг удаан хоцорсонтой адилтгана. Хоёуланг нь нэгтгэсэн
     * оноогоор эрэмбэлнэ: хоцорсон хоног тутамд гүйцэтгэлийн дутуу хувь.
     */
    const worst = [...overdue]
      .map((x) => ({ ...x, score: (100 - x.progress) * x.late! }))
      .sort((a, b) => b.score - a.score)
      .slice(0, WORST);

    /* ── Төлөвлөгөө ↔ талбайн хэмжилтийн зөрүү ──
       Блокийн код бүрийн ХАМГИЙН СҮҮЛИЙН тайланг авна (хүсэлт нь аль хэдийн буурах
       дарааллаар ирсэн тул эхлээд тааралдсан нь хамгийн сүүлийнх). */
    const latestByBlock = new Map<string, Row>();
    for (const r of reports) {
      const blk = surveyBlock(r[SURVEY.fields.building]);
      if (blk && !latestByBlock.has(blk)) latestByBlock.set(blk, r);
    }

    /**
     * ⚠️ `BLOK` нь ӨВӨРМӨЦ БИШ: 113 мөрөнд ердөө 38 ялгаатай утга байгааг хэмжсэн
     * («5/1» дангаараа 7 мөрөнд). Тиймээс:
     *
     *   · Тайлангийн хамрах хүрээг МӨРийн тоотой (113) харьцуулж болохгүй — нэг
     *     тайлан 7 мөртэй таарах тул «3 / 113» гэсэн худал зураг гарна. Зөвхөн
     *     КОДын тоотой (38) харьцуулна.
     *   · Зөрүү нь код хуваалцсан бүх мөрөнд давтагдана. Мөр бүр өөрийн
     *     төлөвлөгөөт хувьтай тул зөрүү нь өөр өөр гарах ба энэ нь зөв — гэхдээ
     *     нэг хэмжилт олон удаа жинлэгдэж байгааг тайлбарт заана.
     */
    const codes = new Set(rated.map((x) => x.blok).filter((v) => v !== '—'));

    const gaps = rated
      .map((x) => {
        const raw = latestByBlock.get(x.blok)?.[SURVEY.fields.total];
        // ⚠️ Хэмжилтгүйг 0 гэж үзвэл «талбар дээр 0% хийсэн» гэж ХУДЛАА батална
        if (raw == null) return null;
        return { ...x, gap: Number(raw) - x.progress };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    /* ── Чөлөөлөлт ──
       ⚠️ «гэрээлсэн» ба «гэрээлсэн.» нь бичгийн алдаанаас болсон ИЖИЛ төлөв тул
       эцсийн цэгийг хасаж жишнэ (`services.ts`-ийн PARCEL_STATUS-ыг үз). */
    const norm = (r: Row) => text(r[P.status], '').trim().replace(/\.$/, '').toLowerCase();
    const blocked = parcels.filter((r) => BLOCKED_STATUS.includes(norm(r)));
    const unregistered = parcels.filter((r) => norm(r) === '');

    return {
      blocks: blocks.length,
      tracked: tracked.length,
      untracked,
      overall,
      levels,
      packages,
      worst,
      overdue,
      avgLate: lateDays.length
        ? Math.round(lateDays.reduce((a, b) => a + b, 0) / lateDays.length)
        : null,
      maxLate: lateDays.length ? Math.max(...lateDays) : null,
      gaps,
      gapOutliers: gaps.filter((g) => Math.abs(g.gap) > GAP_LIMIT),
      blocked,
      unregistered,
      parcels: parcels.length,
      /** Тайлан ирсэн блокийн КОД (мөр биш — дээрх тайлбарыг үз) */
      reported: latestByBlock.size,
      /** Барилгын давхарга дахь ялгаатай блокийн кодын тоо */
      codes: codes.size,
    };
  }, []);
}

/* ── Дохио ── */

type Signal = {
  key: string;
  count: number;
  label: string;
  detail: string;
  tone: 'bad' | 'warn';
  ids: number[];
  layerId: string;
  sublayer: string;
  oidField: string;
};

const TONE = { bad: 'var(--bad)', warn: 'var(--warn)' } as const;

function SignalCard({ sig, onPick }: { sig: Signal; onPick: (sig: Signal) => void }) {
  const { isOn } = useFilter();
  const on = isOn(`overview:${sig.key}`);
  // Тэг = асуудал АЛГА. Бүдгэрүүлэхгүй, ногоон болгоод дарагдахгүй болгоно.
  const clear = sig.count === 0;

  return (
    <button
      type="button"
      className={`${s.signal} ${on ? s.signalOn : ''}`}
      style={{ '--tone': clear ? 'var(--good)' : TONE[sig.tone] } as CSSProperties}
      aria-pressed={on}
      disabled={clear}
      onClick={() => onPick(sig)}
    >
      <span className={`${s.signalCount} num`}>{num(sig.count)}</span>
      <span className={s.signalText}>
        <span className={s.signalLabel}>{sig.label}</span>
        <span className={s.signalDetail}>{sig.detail}</span>
      </span>
    </button>
  );
}

/**
 * Тойм — бүх модулийн өгөгдлийг хөндлөн уншиж дүгнэнэ.
 *
 * ⚠️ ЗОХИОМЖИЙН ГОЛ ШИЙДВЭР: «хугацаа хэтэрсэн» нь ДОХИО БИШ.
 * Өгөгдлийг хэмжихэд бүх блок (113/113) хугацаа хэтэрсэн, нэг нь ч 50% давaagүй
 * байв. Бүх мөрөнд асдаг дохио нь мэдээлэл өгөхгүй, зөвхөн бусад жинхэнэ дохиог
 * дарна. Тиймээс хуваарийн байдлыг БАРИМТ болгож нэг удаа хэлээд, удирдлагад
 * хэрэгтэй ЭРЭМБЭЛЭЛТ (багц, хамгийн хоцорсон блок) болгон хувиргав. Дохио гэдэгт
 * зөвхөн ОНЦГОЙ зүйл үлдэнэ: өгөгдлийн зөрчил, эрх зүйн саатал, дутуу бүртгэл.
 */
export function OverviewPanel({
  sublayers,
  setSublayers,
}: {
  sublayers: string[];
  setSublayers: Dispatch<SetStateAction<string[]>>;
}) {
  const q = useOverview();
  const { toggle, clear, isOn, active } = useFilter();
  const { zoomToWhere } = useMap();

  // Модулиас гарахад дохионы шүүлт үлдэхээс сэргийлнэ
  useEffect(() => () => clear(), [clear]);

  /** Давхаргыг ил болгоод шүүлт тавина. Цуцлах үед ойртохгүй. */
  const apply = (opts: {
    key: string;
    label: string;
    group: string;
    where: string;
    color: string;
    layerId: string;
    sublayer: string;
  }) => {
    // ⚠️ `toggle` дуудсаны ДАРАА уншвал шинэ төлөв гарна — өмнө нь уншина
    const wasOn = isOn(opts.key);

    if (!sublayers.includes(opts.sublayer)) {
      setSublayers((prev) => (prev.includes(opts.sublayer) ? prev : [...prev, opts.sublayer]));
    }

    toggle({
      key: opts.key,
      label: opts.label,
      group: opts.group,
      where: opts.where,
      module: 'overview',
      color: opts.color,
    });

    // Цуцлах нь «бүгдийг буцааж харуул» гэсэн үг — тэр агшинд ойртуулбал эсрэгээр
    if (!wasOn) zoomToWhere(opts.layerId, opts.where);
  };

  const pickSignal = (sig: Signal) => {
    if (sig.count === 0) return; // `IN ()` гэсэн бүтэхгүй SQL үүсэхээс сэргийлнэ
    apply({
      key: `overview:${sig.key}`,
      label: sig.label,
      group: 'Тойм',
      where: `${sig.oidField} IN (${sig.ids.join(', ')})`,
      color: TONE[sig.tone],
      layerId: sig.layerId,
      sublayer: sig.sublayer,
    });
  };

  return (
    <Data q={q} loading="Тойм бэлтгэж байна…">
      {(d) => {
        const oids = (rows: Row[], field: string) => rows.map((r) => Number(r[field]));

        const signals: Signal[] = [
          {
            key: 'gap',
            count: d.gapOutliers.length,
            label: 'Хэмжилт зөрүүтэй блок',
            detail: `Төлөвлөгөө ба талбайн тайлангийн зөрүү ${GAP_LIMIT} нэгжээс их`,
            tone: 'warn',
            ids: d.gapOutliers.map((g) => g.oid),
            layerId: 'building', sublayer: 'building', oidField: BUILDING.oid,
          },
          {
            key: 'blocked',
            count: d.blocked.length,
            label: 'Саатсан нэгж талбар',
            detail: 'Маргаантай, татгалзсан эсвэл үнийн дүн зөвшөөрөөгүй',
            tone: 'bad',
            ids: oids(d.blocked, PARCEL.oid),
            layerId: 'land:parcel', sublayer: 'parcel', oidField: PARCEL.oid,
          },
        ];

        const quality: Signal[] = [
          {
            key: 'untracked',
            count: d.untracked.length,
            label: 'Гүйцэтгэлгүй блок',
            detail: 'Гүйцэтгэлийн хувь бүртгэгдээгүй (утга −1) тул дундажид ороогүй',
            tone: 'warn',
            ids: oids(d.untracked, BUILDING.oid),
            layerId: 'building', sublayer: 'building', oidField: BUILDING.oid,
          },
          {
            key: 'unregistered',
            count: d.unregistered.length,
            label: 'Явцын мэдээгүй талбар',
            detail: 'Чөлөөлөлтийн явц огт бүртгэгдээгүй нэгж талбар',
            tone: 'warn',
            ids: oids(d.unregistered, PARCEL.oid),
            layerId: 'land:parcel', sublayer: 'parcel', oidField: PARCEL.oid,
          },
        ];

        return (
          <>
            {/* ── Хуваарийн бодит байдал ── */}
            <Section tone="primary" title="Хуваарийн байдал">
              <Col gap="md">
                <Split aside={<Ring value={d.overall} color={HUE} size={92} width={9} label="дундаж" />}>
                  <Note>
                    {d.tracked === 0 ? (
                      <>Гүйцэтгэл бүртгэгдсэн блок алга.</>
                    ) : d.overdue.length === d.tracked ? (
                      <>
                        Бүртгэгдсэн <b>{num(d.tracked)}</b> блок <b>БҮГД</b> ашиглалтад орох
                        хугацаагаа хэтэрсэн — дунджаар <b>{num(d.avgLate)}</b> хоног, хамгийн их{' '}
                        <b>{num(d.maxLate)}</b> хоног. Хоцрогдол нийтлэг тул доорх эрэмбэ нь
                        аль нь хамгийн эрсдэлтэйг заана.
                      </>
                    ) : (
                      <>
                        <b>{num(d.tracked)}</b> блокоос <b>{num(d.overdue.length)}</b> нь хугацаагаа
                        хэтэрсэн — дунджаар <b>{num(d.avgLate)}</b> хоног.
                      </>
                    )}
                  </Note>
                </Split>

                <Stack
                  total={d.tracked}
                  items={d.levels.map((l) => ({
                    key: l.key, label: `${l.label} · ${l.value}`, value: l.value, color: l.color,
                  }))}
                />
              </Col>
            </Section>

            {/* ── Багцын эрэмбэ ── */}
            <Section title="Багцын гүйцэтгэл" note="хамгийн сул нь дээрээ · дарж шүүнэ">
              <Bars
                color={HUE}
                max={100}
                selected={active?.key ?? null}
                onSelect={(k) => {
                  const p = d.packages.find((x) => `overview:bagts:${x.key}` === k);
                  if (!p) return;
                  apply({
                    key: k,
                    label: p.key,
                    group: 'Багц',
                    where: `${B.bagts} = ${sqlStr(p.key)}`,
                    color: HUE,
                    layerId: 'building',
                    sublayer: 'building',
                  });
                }}
                items={d.packages.map((p) => ({
                  key: `overview:bagts:${p.key}`,
                  label: `${p.key} · ${num(p.blocks)} блок`,
                  value: p.progress,
                  display:
                    p.late == null
                      ? pct(p.progress, 1)
                      : `${pct(p.progress, 1)} · ${num(p.late)} хоног`,
                }))}
              />
            </Section>

            {/* ── Хамгийн эрсдэлтэй блокууд ── */}
            <Section title="Хамгийн хоцорсон блок" note={`эхний ${Math.min(WORST, d.worst.length)}`}>
              <Col gap="sm">
                <Note>
                  Эрэмбэ нь <b>дутуу гүйцэтгэл × хэтэрсэн хоног</b>-оор бодогдоно — удаан хоцорсон
                  ба гүйцэтгэл сул хоёрыг зэрэг тооцно. Дарж газрын зурагт байрлалыг нь харна.
                </Note>
                <List>
                  {d.worst.map((x) => {
                    const key = `overview:block:${x.oid}`;
                    return (
                      <ListItem
                        key={x.oid}
                        color="var(--bad)"
                        active={isOn(key)}
                        title={`Блок ${x.blok}`}
                        sub={`${x.bagts} · ${num(x.late)} хоног хэтэрсэн`}
                        value={pct(x.progress, 1)}
                        onClick={() =>
                          apply({
                            key,
                            label: `Блок ${x.blok}`,
                            group: 'Хоцорсон блок',
                            where: `${BUILDING.oid} = ${x.oid}`,
                            color: 'var(--bad)',
                            layerId: 'building',
                            sublayer: 'building',
                          })
                        }
                      />
                    );
                  })}
                </List>
              </Col>
            </Section>

            {/* ── Онцгой дохио ── */}
            <Section title="Анхаарал шаардаж буй" note="дарж газрын зурагт харна">
              <div className={s.signals}>
                {signals.map((sig) => (
                  <SignalCard key={sig.key} sig={sig} onPick={pickSignal} />
                ))}
              </div>
            </Section>

            {/* ── Талбайн хяналт ── */}
            <Section title="Талбайн хяналтын хамрах хүрээ">
              <Col gap="sm">
                <Stats cols={3}>
                  <Stat
                    value={`${num(d.reported)} / ${num(d.codes)}`}
                    label="Тайлан ирсэн блокийн код"
                    color={d.reported < d.codes / 2 ? 'var(--warn)' : HUE}
                    accent
                  />
                  <Stat value={num(d.gapOutliers.length)} label={`Зөрүү ${GAP_LIMIT}%-иас их`} color="var(--warn)" />
                  <Stat
                    value={
                      d.gaps.length === 0
                        ? '—'
                        : pct(d.gaps.reduce((a, g) => a + g.gap, 0) / d.gaps.length, 1)
                    }
                    label="Дундаж зөрүү"
                    color={HUE}
                  />
                </Stats>
                <Note>
                  Зөрүү = талбайн тайлангийн хэмжилт − төлөвлөгөөний гүйцэтгэл. <b>Эерэг</b> нь
                  талбар дээр төлөвлөснөөс илүү хийгдсэн гэсэн үг. Хоёр тоо ӨӨР аргаар хэмжигддэг
                  тул зөрүү нь заавал алдаа гэсэн үг биш.
                </Note>
                <Note>
                  Хамрах хүрээг блокийн <b>кодоор</b> хэмжив: барилгын давхаргад{' '}
                  <b>{num(d.blocks)}</b> мөр байгаа ч блокийн код ердөө <b>{num(d.codes)}</b>{' '}
                  ялгаатай (нэг код 7 хүртэл мөрөнд давтагдана). Тайланг мөрийн тоотой
                  харьцуулбал хамрах хүрээ байгаагаас хамаагүй бага мэт харагдана.
                </Note>
              </Col>
            </Section>

            {/* ── Өгөгдлийн чанар ── */}
            <Section title="Өгөгдлийн чанар" note="бүртгэлийн дутуу байдал">
              <SubHead note={`${num(d.parcels)} нэгж талбар · ${num(d.blocks)} блок`}>
                Бүртгэгдээгүй утга
              </SubHead>
              <div className={s.signals}>
                {quality.map((sig) => (
                  <SignalCard key={sig.key} sig={sig} onPick={pickSignal} />
                ))}
              </div>
            </Section>
          </>
        );
      }}
    </Data>
  );
}
