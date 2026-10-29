'use client';

import { useMemo, type CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Card } from './Layout';
import { Icon } from '@/components/Icon';
import { rovingTab, tabFocusNav } from '@/components/ui';
import {
  T_MODES, tModeDef, tItems, tReadout, tRange,
  BUS_BAND_COLOR, type TMode, type TransportCtx,
} from './transportModes';
import { BUS_GOOD_M, BUS_OK_M } from '@/lib/analysis/transport';
import { TRANSIT_NORM_M } from './simulation';
import { NetSelector, type NetSel } from './SimulationPanel';
import c from './simulation.module.css';

const nf0 = (v: number) => Math.round(v).toLocaleString('mn-MN');

/**
 * ТЭЭВЭР-ИДЭВХИЙН САМБАР — «Симуляц» табын ЗҮҮН баганад, «Хүн амын төвлөрөл»-ийн доор.
 */
export function TransportPanel({
  mode,
  setMode,
  active,
  ctx,
  loading,
  error,
  onRetry,
  net,
}: {
  net?: NetSel;
  mode: TMode;
  /** Дүрслэл сонгох — эцэг нь энэ самбарыг ИДЭВХТЭЙ болгоно (газрын зураг солигдоно) */
  setMode: (m: TMode) => void;
  /** Энэ самбар идэвхтэй эсэх — идэвхгүй бол зөвхөн сонгогч харагдана */
  active: boolean;
  /** Тооцооны үр дүн — ачаалж дуустал `null` */
  ctx: TransportCtx | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}) {
  const def = tModeDef(mode);

  /** Шатлалд орох объектын тоо — жагсаалт зурахгүй тул ЗӨВХӨН тоо хэрэгтэй */
  const itemCount = useMemo(() => (ctx ? tItems(mode, ctx).length : 0), [ctx, mode]);
  const cells = useMemo(() => (ctx ? tReadout(mode, ctx) : []), [ctx, mode]);
  const range = useMemo(() => (ctx ? tRange(mode, ctx) : { min: 0, max: 0 }), [ctx, mode]);

  return (
    <Card title={tr('Тээвэр-идэвхийн шинжилгээ')}>
      <div className={c.root} style={{ '--sim': def.hue } as CSSProperties}>
        {/* ── 7 дүрслэлийн сонгогч ── */}
        <div className={c.seg} role="tablist" aria-label={tr('Тээврийн дүрслэл')} onKeyDown={(e) => tabFocusNav(e)}>
          {T_MODES.map((m, i) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              tabIndex={rovingTab(active && mode === m.key, i, active)}
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

        {active && net && <NetSelector net={net} />}

        {!active ? (
          <p className={c.desc} style={{ marginTop: 6 }}>
            {tr('Дэлгэрэнгүй харах бол дээрх дүрслэлийг сонгоно уу.')}
          </p>
        ) : error ? (
          <p className={c.err}>
            {tr('Тээврийн өгөгдөл ачаалж чадсангүй:')} {error}
            {onRetry && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={onRetry}
                  style={{
                    border: 0, padding: 0, background: 'none', color: 'inherit',
                    font: 'inherit', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer',
                  }}
                >
                  {tr('Дахин оролдох')}
                </button>
              </>
            )}
          </p>
        ) : loading || !ctx ? (
          <p className={c.loading}>
            {tr('Барилга ба замын өгөгдөл ачаалж байна')}
            <span className={c.dots}><i /><i /><i /></span>
          </p>
        ) : (
          <>
            {/* ── Гарчиг ── */}
            <div className={c.head}>
              <span className={c.headTitle}>{def.label}</span>
              {def.unit && <span className={c.headUnit}>{def.unit}</span>}
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

            {/* ── Легенд ── */}
            {itemCount === 0 ? (
              <p className={c.empty}>{tr('Энэ дүрслэлд тохирох объект алга.')}</p>
            ) : (
              <>
                <div className={c.secHead}>
                  {tr('Шатлал')}
                  <b>{itemCount} {def.target === 'road' ? tr('хэрчим') : tr('барилга')}</b>
                </div>

                <Legend mode={mode} min={range.min} max={range.max} unit={def.unit} />
              </>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

/* ══════════════════ Легенд ══════════════════ */

function Legend({ mode, min, max, unit }: { mode: TMode; min: number; max: number; unit: string }) {
  if (mode === 'busAccess') {
    return (
      <>
        <div className={c.legend}>
          <span className={c.legendEnd}>{tr('0 м')}</span>
          <span
            className={c.legendBar}
            style={{
              background: `linear-gradient(90deg, ${BUS_BAND_COLOR.good}, ${BUS_BAND_COLOR.ok} 50%, ${BUS_BAND_COLOR.poor})`,
            }}
          />
          <span className={c.legendEnd}>{BUS_OK_M} {tr('м+')}</span>
        </div>
        <p className={c.desc} style={{ marginTop: -2 }}>
          {tr('Дунд цэг =')} <b>{tr('{0} м', BUS_GOOD_M)}</b> {tr('(шатлалын «сайн хүртээмж»-ийн зааг; БНБД 30-01-24, 10.22-ын норм {0} м). Ажиглагдсан хамгийн хол нь', TRANSIT_NORM_M)}{' '}<b>{tr('{0} м', nf0(max))}</b>.
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
