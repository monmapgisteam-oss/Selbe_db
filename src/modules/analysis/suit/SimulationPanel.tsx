'use client';

import { useMemo, type CSSProperties } from 'react';
import { Card } from './Layout';
import { Icon } from '@/components/Icon';
import {
  SIM_KINDS, POP_BASES, TRANSIT_NORM_M, simDef, simMetric, simRange, simNorm,
  type SimKind, type PopBasis,
} from './simulation';
import { Timeline } from './Timeline';
import type { MapRow } from '../SuitMap';
import type { TrafficStats } from './TrafficOverlay';
import type { NetKind } from './netSources';
import type { SignalPlan } from './traffic';
import c from './simulation.module.css';

/** Харьцуулах замын сүлжээний сонголт (Бодит/Төлөвлөгөө/Шинэ зам) */
export type NetSel = {
  kind: NetKind;
  setKind: (k: NetKind) => void;
  options: {
    kind: NetKind;
    label: string;
    short: string;
    ready: boolean;
    /** Бэлэн биш үед tooltip-д харуулах заавар (юу хийвэл идэвхжих вэ) */
    note?: string;
  }[];
};

/** Замын сүлжээний ачаалалт ба амьд симуляцын хураангуй (эцгээс) */
export type RoadState = {
  /** Сүлжээний хэрчмийн тоо — `null` бол ачаалж байна, `0` бол хоосон сүлжээ */
  edges: number | null;
  /** Ачаалахад алдаа гарсан бол мессеж */
  error: string | null;
  /** `TrafficOverlay`-аас ~2 удаа/сек ирэх хураангуй */
  stats: TrafficStats | null;
  /** 3D горим — машины давхарга зурагдахгүй (хавтгай проекц нийцэхгүй) */
  flat: boolean;
  /**
   * Сонгосон сүлжээнд МАШИН ЯВАХГҮЙ («Шинэ зам») — зөвхөн газрын зурагт
   * харагдана. Ийм үед «сүлжээ ачаалж байна» гэж мөнхөд эргэлдэх ёсгүй.
   */
  carsOff?: boolean;
  /** Харьцуулах замын сүлжээ сонгогч */
  net?: NetSel;
  /** Гэрлэн дохионы зохицуулалтын сонголт */
  signal?: SignalSel;
};

/**
 * Гэрлэн дохионы зохицуулалт (эцгээс) — ЭЭЛЖ сонгоно.
 * ⚠️ `stage = null` бол хуваарь АВТОМАТААР эргэлдэнэ; тоо өгвөл тэр ээлжийг
 * газрын зураг дээр БАРЬЖ асаана (кодууд нь байнга ногоон, бусад нь улаан) —
 * ээлж бүрийн үйлчлэлийг нүдээр шалгах горим.
 */
export type SignalSel = {
  /** Идэвхтэй хөтөлбөр (ээлжүүдийн жагсаалтыг эндээс уншина) */
  plan: SignalPlan;
  /** Барьж асаасан ээлж (0-ээс эхлэнэ) — null бол авто эргэлт */
  stage: number | null;
  setStage: (i: number | null) => void;
};

/** Timeline-ийн удирдлагыг эцгээс (Suitability) дамжуулна */
export type ClockProps = {
  minute: number;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  speed: number;
  setSpeed: (v: number) => void;
  seek: (m: number) => void;
};

/** Эрэмбийн нэг мөр — түүхий утга, бичвэр, нормчилсон 0..1 */
type Ranked = { r: MapRow; value: number; text: string; t: number | null };

const nf0 = (v: number) => Math.round(v).toLocaleString('mn-MN');

/**
 * СИМУЛЯЦЫН ПАНЕЛЬ — «Үзүүлэлт»-ийн ард шинэ таб.
 *
 * Гурван симуляц (төвлөрөл · хүртээмж · ачаалал) НЭГ бүтцээр харагдана:
 *   сонгогч → гарчиг → тоон уншилт → [цагийн консол] → эрэмбэ.
 * Таб сэлгэхэд байрлал нь хэвээр, зөвхөн АГУУЛГА нь солигдоно — ингэснээр
 * хэрэглэгч бүр удаа шинээр уншихгүй.
 *
 * ⚠️ Газрын зургийн будалт нь эцэг компонент дахь `colorOf`-той НЭГ эх сурвалж
 * (`simulation.ts`) ашигладаг тул зураг ↔ жагсаалт ↔ легенд гурав ижил өнгөтэй.
 */
export function Simulation({
  kind,
  setKind,
  kinds,
  title = 'Симуляц',
  muted = false,
  popBasis,
  setPopBasis,
  clock,
  road,
  rows,
}: {
  kind: SimKind;
  setKind: (k: SimKind) => void;
  /**
   * Энэ самбарт ХАРУУЛАХ симуляцын төрлүүд (сонгогчийн товчнууд). Өгөхгүй бол
   * бүгд. Идэвхтэй `kind` энэ жагсаалтад БАЙХГҮЙ бол зөвхөн товчнууд харагдаж,
   * дэлгэрэнгүй (тоон уншилт, эрэмбэ) нуугдана — өөр самбар идэвхтэй гэсэн үг.
   */
  kinds?: SimKind[];
  /** Картын гарчиг */
  title?: string;
  /**
   * ӨӨР самбар (тээвэр-идэвх) газрын зургийг эзэлж байна — идэвхтэй `kind`
   * энэ самбарынх байсан ч дэлгэрэнгүйг нуух. Эс бөгөөс хоёр самбар зэрэг
   * «би идэвхтэй» гэж харагдана.
   */
  muted?: boolean;
  /** «Хүн амын төвлөрөл»-д тоолох хүн амын төрөл */
  popBasis: PopBasis;
  setPopBasis: (p: PopBasis) => void;
  /** «Замын ачаалал» timeline-ийн удирдлага */
  clock: ClockProps;
  /** Замын сүлжээ + амьд машинуудын төлөв («Ачаалал» табд) */
  road?: RoadState;
  /** Газрын зурагт харагдаж буй бүсүүд (шүүлтийн дараах) */
  rows: MapRow[];
}) {
  const shownKinds = kinds ?? SIM_KINDS.map((k) => k.key);
  /** Идэвхтэй симуляц ЭНЭ самбарынх мөн үү (дэлгэрэнгүйг зөвхөн тэр үед харуулна) */
  const activeHere = !muted && shownKinds.includes(kind);
  const def = simDef(kind);

  const ranked = useMemo<Ranked[]>(() => {
    if (!def.ready) return [];
    const range = simRange(rows, kind, popBasis);
    return rows
      .map((r) => {
        const m = simMetric(r, kind, popBasis);
        return { r, value: m.value, text: m.text, t: simNorm(m.value, range) };
      })
      .filter((x): x is Ranked => x.value != null && x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [rows, kind, popBasis, def.ready]);

  const cells = readout(kind, ranked, road);

  // ⚠️ Картын гарчигт pill ТАВИХГҮЙ: доорх сегмент сонгогч нь идэвхтэй симуляцыг
  //    аль хэдийн тод харуулдаг тул давхардал болно.
  // `--sim` акцент: идэвхтэй бол идэвхтэй төрлийнх, эс бөгөөс энэ самбарын
  // эхний төрлийнх (идэвхгүй самбар өөр самбарын өнгөөр будагдахгүй).
  const localHue = activeHere ? def.hue : simDef(shownKinds[0]).hue;

  // ⚠️ Картын гарчигт pill ТАВИХГҮЙ: доорх сегмент сонгогч нь идэвхтэй симуляцыг
  //    аль хэдийн тод харуулдаг тул давхардал болно.
  return (
    <Card title={title}>
      {/* ⚠️ `--sim` нь ЭНД тавигдана — доорх бүх дүрэм (сонгогч, гулсуур,
          эрэмбийн баар) үүнээс уншина. Симуляц солиход бүхэл панелийн акцент
          нэг дор өөрчлөгдөнө. */}
      <div className={c.root} style={{ '--sim': localHue } as CSSProperties}>
        {/* ── Симуляц сонгох (энэ самбарт хамаарах төрлүүд) ── */}
        <div className={c.seg} role="tablist" aria-label="Симуляцын төрөл">
          {/* ⚠️ Табын ДАРААЛАЛ нь дуудагчийн `kinds`-ээс — `SIM_KINDS`-ийн
              бүртгэлийн дарааллаас БИШ. Самбар бүр өөрийн эрэмбээ тогтоох
              боломжтой (жиш. «Ачаалал» эхэнд). */}
          {shownKinds
            .map((key) => SIM_KINDS.find((k) => k.key === key))
            .filter((k): k is (typeof SIM_KINDS)[number] => !!k)
            .map((k) => (
              <button
                key={k.key}
                type="button"
                role="tab"
                aria-selected={!muted && kind === k.key}
                className={`${c.segBtn} ${!muted && kind === k.key ? c.segOn : ''}`}
                onClick={() => setKind(k.key)}
                title={k.label}
              >
                <Icon name={k.icon} size={17} />
                {k.short}
              </button>
            ))}
        </div>

        {/* Дэлгэрэнгүй нь ЗӨВХӨН идэвхтэй самбарт — нөгөө нь зөвхөн товчоо харуулна */}
        {!activeHere ? (
          <p className={c.desc} style={{ marginTop: 6 }}>
            Дэлгэрэнгүй харах бол дээрх төрлийг сонгоно уу.
          </p>
        ) : (
        <>
        {/* ── Гарчиг ──
            ⚠️ Тайлбарын догол мөр (`def.desc`) ЗОРИУДААР БАЙХГҮЙ: сонгогчийн
            товч ба доорх тоон уншилт нь юу харагдаж байгааг аль хэдийн хэлдэг
            тул 2-3 мөрийн давхардсан текст самбарыг л уртасгаж байв. */}
        <div className={c.head}>
          <span className={c.headTitle}>{def.label}</span>
          {def.unit && <span className={c.headUnit}>{def.unit}</span>}
        </div>

        {/* ── Хүн амын төрөл — зөвхөн «Төвлөрөл»-д ── */}
        {kind === 'density' && (
          <div className={c.pick}>
            <span className={c.pickLabel}>Хүн ам</span>
            <div className={c.segSm} role="group" aria-label="Хүн амын төрөл">
              {POP_BASES.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={popBasis === p.key}
                  className={popBasis === p.key ? c.segSmOn : undefined}
                  onClick={() => setPopBasis(p.key)}
                  title={p.label}
                >
                  {p.short}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Тоон уншилт ── */}
        {cells.length > 0 && (
          <div className={c.readout}>
            {cells.map((x) => (
              <div key={x.k} className={c.cell}>
                <div className={c.cellV} style={x.color ? { color: x.color } : undefined}>
                  {x.v}
                  {x.unit && <small>{x.unit}</small>}
                </div>
                <div className={c.cellK}>{x.k}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Цагийн консол ба трафикийн төлөв (зөвхөн «Ачаалал») ── */}
        {kind === 'road' && (
          <>
            <NetSelector net={road?.net} />
            <Timeline {...clock} hue={def.hue} />
            <RoadStatus road={road} />
            <SignalControl sig={road?.signal} />
          </>
        )}

        {/* ── Легенд ──
            ⚠️ Эрэмбийн ЖАГСААЛТ ЗОРИУДААР ХАСАГДСАН: 13 мөр бүсийн код бичсэн
            хүснэгт нь газрын зурагтай холбогдохгүй тул уншихад хүнд байсан.
            Бүс бүрийн утгыг ГАЗРЫН ЗУРАГ дээр хулганаа аваачиж уншина.
            ⚠️ «Ачаалал» табд ХАРАГДАХГҮЙ: тэр нь амьд трафикийн симуляц тул бүсийн
            аялалын эрэмбэ (аялал/ц) утгагүй — уншилт нь машин/хурд/урсгал дээр. */}
        {kind === 'road' ? null : !def.ready ? (
          <p className={c.empty}>Энэ симуляц удахгүй нэмэгдэнэ.</p>
        ) : ranked.length === 0 ? (
          <p className={c.empty}>Тооцоолох өгөгдөл алга.</p>
        ) : (
          <>
            <div className={c.secHead}>
              Шатлал
              <b>{ranked.length} бүс</b>
            </div>

            {/* Дулааны легенд — «бага/их» биш, БОДИТ хязгаараар */}
            <div className={c.legend}>
              <span className={c.legendEnd}>{nf0(ranked[ranked.length - 1].value)}</span>
              <span className={c.legendBar} />
              <span className={c.legendEnd}>{nf0(ranked[0].value)} {def.unit}</span>
            </div>

          </>
        )}
        </>
        )}
      </div>
    </Card>
  );
}

/* ══════════════════ Тоон уншилт ══════════════════ */

type Cell = { k: string; v: string; unit?: string; color?: string };

/**
 * Симуляц бүрийн ГУРВАН гол тоо.
 *
 * ⚠️ Гурвуулаа ижил бүтэцтэй байх нь санаатай: хамгийн онцлох утга → дундаж →
 * норм/чанарын үзүүлэлт. Ингэснээр таб сэлгэхэд нүд ижил байрлалаас уншина.
 */
function readout(kind: SimKind, ranked: Ranked[], road?: RoadState): Cell[] {
  if (kind === 'road') {
    const st = road?.stats;
    const flow = st ? Math.round(st.flow * 100) : null;
    return [
      { k: 'Машин', v: st ? nf0(st.cars) : '—' },
      { k: 'Дундаж хурд', v: st ? String(Math.round(st.kmh)) : '—', unit: st ? 'км/ц' : undefined },
      {
        k: 'Урсгал',
        v: flow == null ? '—' : `${flow}%`,
        // Утга заасан өнгө — статус токеноор (хоёр горимд уншигдана)
        color: flow == null ? undefined : flow > 70 ? 'var(--good-ink)' : flow > 40 ? 'var(--warn-ink)' : 'var(--bad-ink)',
      },
    ];
  }
  if (!ranked.length) return [];
  const avg = ranked.reduce((a, x) => a + x.value, 0) / ranked.length;

  if (kind === 'transit') {
    // ⚠️ Хүртээмжид БАГА нь сайн — тиймээс «хамгийн их» биш «хамгийн хол»,
    //    норм нь БНБД-ийн 500 м.
    const ok = ranked.filter((x) => x.value <= TRANSIT_NORM_M).length;
    const pct = Math.round((ok / ranked.length) * 100);
    return [
      { k: 'Дундаж зай', v: nf0(avg), unit: 'м' },
      { k: 'Хамгийн хол', v: nf0(ranked[0].value), unit: 'м' },
      {
        k: `${TRANSIT_NORM_M} м дотор`,
        v: `${pct}%`,
        // Утга заасан өнгө — статус токеноор (хоёр горимд уншигдана)
        color: pct > 70 ? 'var(--good-ink)' : pct > 40 ? 'var(--warn-ink)' : 'var(--bad-ink)',
      },
    ];
  }
  return [
    { k: 'Хамгийн өндөр', v: nf0(ranked[0].value), unit: 'хүн/га' },
    { k: 'Дундаж', v: nf0(avg), unit: 'хүн/га' },
    { k: 'Бүс', v: nf0(ranked.length) },
  ];
}

/* ══════════════════ Замын сүлжээ сонгогч ══════════════════ */

/**
 * ХАРЬЦУУЛАХ замын сүлжээ сонгох — Бодит / Төлөвлөгөө / Шинэ зам / Тест.
 * ⚠️ Line ирээгүй сүлжээ (`ready=false`) идэвхгүй харагдана; tooltip нь юу
 * хийвэл идэвхжихийг (`note`) хэлнэ.
 */
function NetSelector({ net }: { net?: NetSel }) {
  if (!net) return null;
  return (
    <div className={c.pick}>
      <span className={c.pickLabel}>Зам</span>
      <div className={c.segSm} role="group" aria-label="Харьцуулах замын сүлжээ">
        {net.options.map((o) => (
          <button
            key={o.kind}
            type="button"
            aria-pressed={net.kind === o.kind}
            className={net.kind === o.kind ? c.segSmOn : undefined}
            disabled={!o.ready}
            onClick={() => net.setKind(o.kind)}
            title={o.ready ? o.label : `${o.label} — ${o.note ?? 'line хараахан ирээгүй'}`}
          >
            {o.short}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════ Гэрлэн дохионы зохицуулалт ══════════════════ */

/**
 * ГЭРЛЭН ДОХИОНЫ ЗОХИЦУУЛАЛТ — ХУУЧИН сегмент товчлуурын UI, харин товч бүр
 * нэг ЭЭЛЖ. Товч дарахад тэр ээлж газрын зураг дээр БАРИГДАЖ асна: ээлжийн
 * кодууд байнга ногоон, бусад нь улаан — машид яг түүгээр явна. «Авто» нь
 * хуваарийн ердийн эргэлт.
 */
function SignalControl({ sig }: { sig?: SignalSel }) {
  if (!sig) return null;
  const green = Math.max(0, sig.plan.cycle / sig.plan.stages.length - sig.plan.yellow);
  return (
    <div className={c.console}>
      <div className={c.secHead}>
        Гэрлэн дохионы зохицуулалт
      </div>
      <div className={c.pick} style={{ marginTop: 8 }}>
        <span className={c.pickLabel}>Ээлж</span>
        <div className={c.segSm} role="group" aria-label="Гэрлэн дохионы ээлж">
          <button
            type="button"
            aria-pressed={sig.stage == null}
            className={sig.stage == null ? c.segSmOn : undefined}
            onClick={() => sig.setStage(null)}
            title={`Хуваарийн дагуу эргэлдэнэ (мөчлөг ${sig.plan.cycle}с, ээлж бүр ~${Math.round(green)}с ногоон)`}
          >
            Авто
          </button>
          {sig.plan.stages.map((codes, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={sig.stage === i}
              className={sig.stage === i ? c.segSmOn : undefined}
              onClick={() => sig.setStage(sig.stage === i ? null : i)}
              title={`${codes.join(', ')} кодын гэрэл НОГООН асна — бусад нь улаан`}
            >
              {i + 1} ээлж
            </button>
          ))}
        </div>
      </div>
      {/* ⚠️ «Авто» горимд тайлбар догол мөр ЗОРИУДААР БАЙХГҮЙ: товчны tooltip
          хуваарийг аль хэдийн хэлдэг тул самбарыг л уртасгаж байв. Ээлж
          БАРИГДСАН үед л юу болоод буйг нэг мөрөөр сануулна. */}
      {sig.stage != null && (
        <p className={c.desc} style={{ marginTop: 8 }}>
          {`${sig.stage + 1}-р ээлж баригдав: ${sig.plan.stages[sig.stage].join(', ')} кодын гэрэл ногоон, бусад нь улаан.`}
        </p>
      )}
    </div>
  );
}

/* ══════════════════ Замын сүлжээний төлөв ══════════════════ */

/**
 * Сүлжээ ачаалагдсан эсэх ба симуляцын таамгийн тайлбар.
 * ⚠️ Тоон уншилт (машин/хурд/урсгал) нь ДЭЭР `readout`-д гарсан тул энд
 * давтахгүй — зөвхөн контекст ба анхааруулга.
 */
function RoadStatus({ road }: { road?: RoadState }) {
  if (!road) return null;

  if (road.error) {
    return <p className={c.err}>Замын сүлжээ ачаалж чадсангүй: {road.error}</p>;
  }
  /* ⚠️ Машингүй сүлжээ: line нь одоогийн замтай холбогдоогүй тул хөдөлгөөн
     үүсгэхгүй — үүнийг ХЭЛЖ өгнө, эс бөгөөс «эвдэрсэн» гэж ойлгогдоно. */
  if (road.carsOff) {
    return (
      <p className={c.warn}>
        <Icon name="road" size={14} />
        <span>
          Шинэ замын санал <b>газрын зурагт</b> харагдана. Хөдөлгөөн зөвхөн
          <b> Бодит</b> ба <b>Төлөвлөгөө</b> сүлжээнд гүйнэ.
        </span>
      </p>
    );
  }
  /* ⚠️ null ба 0-ыг ЯЛГАНА: null = ачаалж байна, 0 = амжилттай татагдсан ч
     хоосон сүлжээ — falsy-гээр нэгтгэвэл хоосон үед loading үүрд эргэлдэнэ. */
  if (road.edges === null) {
    return (
      <p className={c.loading}>
        Замын сүлжээ ачаалж байна
        <span className={c.dots}><i /><i /><i /></span>
      </p>
    );
  }
  if (road.edges === 0) {
    return (
      <p className={c.err}>
        Сүлжээнд зам олдсонгүй — давхарга хоосон эсвэл талбайн гадна байна.
      </p>
    );
  }

  // ⚠️ Тайлбарын догол мөр ЗОРИУДААР БАЙХГҮЙ — зөвхөн 3D-ийн анхааруулга үлдэв.
  return (
    <>
      {road.flat && (
        <p className={c.warn}>
          <Icon name="road" size={14} />
          <span>Машины хөдөлгөөн зөвхөн <b>2D</b> харагдацад зурагдана.</span>
        </p>
      )}
    </>
  );
}
