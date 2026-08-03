'use client';

import { useMemo, type CSSProperties } from 'react';
import { Card } from './Layout';
import { Icon } from '@/components/Icon';
import {
  T_MODES, tModeDef, tItems, tReadout, tRange,
  BUS_BAND_COLOR, type TMode, type TransportCtx,
} from './transportModes';
import { BUS_GOOD_M, BUS_OK_M } from '@/lib/analysis/transport';
import c from './simulation.module.css';

const nf0 = (v: number) => Math.round(v).toLocaleString('mn-MN');

/**
 * ТЭЭВЭР-ИДЭВХИЙН САМБАР — «Симуляц» табын ЗҮҮН баганад, «Хүн амын төвлөрөл»-ийн доор.
 *
 * ⚠️ Бүтэц нь `SimulationPanel`-тэй ЯГ ижил (сонгогч → гарчиг → тоон уншилт →
 * эрэмбэ) бөгөөд ижил CSS модулийг хуваалцана — хэрэглэгч хоёр самбарыг нэг
 * зуршлаар уншина. Ялгаа нь: энэ нь БАРИЛГА/ЗАМ буддаг, тэр нь БҮС.
 *
 * ⚠️ «Замын ачаалал» (машин агентын симуляц) энэ самбарт ОРОХГҮЙ — тэр нь
 * баруун талын самбарт хэвээр үлдэнэ.
 */
export function TransportPanel({
  mode,
  setMode,
  active,
  ctx,
  loading,
  error,
}: {
  mode: TMode;
  /** Дүрслэл сонгох — эцэг нь энэ самбарыг ИДЭВХТЭЙ болгоно (газрын зураг солигдоно) */
  setMode: (m: TMode) => void;
  /** Энэ самбар идэвхтэй эсэх — идэвхгүй бол зөвхөн сонгогч харагдана */
  active: boolean;
  /** Тооцооны үр дүн — ачаалж дуустал `null` */
  ctx: TransportCtx | null;
  loading: boolean;
  error: string | null;
}) {
  const def = tModeDef(mode);

  /** Шатлалд орох объектын тоо — жагсаалт зурахгүй тул ЗӨВХӨН тоо хэрэгтэй */
  const itemCount = useMemo(() => (ctx ? tItems(mode, ctx).length : 0), [ctx, mode]);
  const cells = useMemo(() => (ctx ? tReadout(mode, ctx) : []), [ctx, mode]);
  const range = useMemo(() => (ctx ? tRange(mode, ctx) : { min: 0, max: 0 }), [ctx, mode]);

  return (
    <Card title="Тээвэр-идэвхийн шинжилгээ">
      <div className={c.root} style={{ '--sim': def.hue } as CSSProperties}>
        {/* ── 7 дүрслэлийн сонгогч ── */}
        <div className={c.seg} role="tablist" aria-label="Тээврийн дүрслэл">
          {T_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={active && mode === m.key}
              className={`${c.segBtn} ${active && mode === m.key ? c.segOn : ''}`}
              onClick={() => setMode(m.key)}
              title={m.label}
            >
              <Icon name={m.icon} size={17} />
              {m.short}
            </button>
          ))}
        </div>

        {!active ? (
          <p className={c.desc} style={{ marginTop: 6 }}>
            Дэлгэрэнгүй харах бол дээрх дүрслэлийг сонгоно уу.
          </p>
        ) : error ? (
          <p className={c.err}>Тээврийн өгөгдөл ачаалж чадсангүй: {error}</p>
        ) : loading || !ctx ? (
          <p className={c.loading}>
            Барилга ба замын өгөгдөл ачаалж байна
            <span className={c.dots}><i /><i /><i /></span>
          </p>
        ) : (
          <>
            {/* ── Гарчиг ба тайлбар ── */}
            <div>
              <div className={c.head}>
                <span className={c.headTitle}>{def.label}</span>
                {def.unit && <span className={c.headUnit}>{def.unit}</span>}
              </div>
              <p className={c.desc} style={{ marginTop: 5 }}>{def.desc}</p>
            </div>

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

            {/* ── Легенд ──
                ⚠️ Эрэмбийн ЖАГСААЛТ ЗОРИУДААР БАЙХГҮЙ (`SimulationPanel`-тэй ижил
                шийдвэр): 363 барилгын жагсаалт нь газрын зурагтай холбогдохгүй тул
                уншихад хүнд. Объект бүрийн утгыг ЗУРАГ дээр hover хийж уншина. */}
            {itemCount === 0 ? (
              <p className={c.empty}>Энэ дүрслэлд тохирох объект алга.</p>
            ) : (
              <>
                <div className={c.secHead}>
                  Шатлал
                  <b>{itemCount} {def.target === 'road' ? 'хэрчим' : 'барилга'}</b>
                </div>

                <Legend mode={mode} min={range.min} max={range.max} unit={def.unit} />

                <p className={c.desc}>
                  {def.target === 'road'
                    ? 'Замын хэрчим дээр хулганаа аваачихад эрэлт, эрэмбэ ба хэрчмийн урт гарч ирнэ.'
                    : 'Барилга дээр хулганаа аваачихад зориулалт, тооцоолсон утга ба эрэмбэ гарч ирнэ.'}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

/* ══════════════════ Легенд ══════════════════ */

/**
 * ⚠️ Хүртээмж нь бусдаас ӨӨР шатлалтай: бага зай = САЙН тул ногоон→шар→улаан.
 * Бусад бүгд YlOrRd дулааны шатлал (`simulation.module.css`-ийн анхдагч).
 */
function Legend({ mode, min, max, unit }: { mode: TMode; min: number; max: number; unit: string }) {
  if (mode === 'busAccess') {
    /**
     * ⚠️ Шатлалын хязгаар нь ӨГӨГДЛИЙН max БИШ, НОРМ (`BUS_OK_M` = 800 м).
     * Өгөгдлийн max-аар бэхэлбэл бүх барилга буудлын дэргэд байсан ч хамгийн
     * холыг нь улаанаар зурж, худал сэрэмжлүүлэг өгнө. Дунд тэмдэг = 400 м.
     */
    return (
      <>
        <div className={c.legend}>
          <span className={c.legendEnd}>0 м</span>
          <span
            className={c.legendBar}
            style={{
              background: `linear-gradient(90deg, ${BUS_BAND_COLOR.good}, ${BUS_BAND_COLOR.ok} 50%, ${BUS_BAND_COLOR.poor})`,
            }}
          />
          <span className={c.legendEnd}>{BUS_OK_M} м+</span>
        </div>
        <p className={c.desc} style={{ marginTop: -2 }}>
          Дунд цэг = <b>{BUS_GOOD_M} м</b> (БНБД-ийн сайн хүртээмжийн босго).
          Ажиглагдсан хамгийн хол нь <b>{nf0(max)} м</b>.
        </p>
      </>
    );
  }
  return (
    <div className={c.legend}>
      <span className={c.legendEnd}>{nf0(min)}</span>
      <span className={c.legendBar} />
      <span className={c.legendEnd}>{nf0(max)} {unit}</span>
    </div>
  );
}
