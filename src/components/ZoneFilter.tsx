'use client';

import { useState, type CSSProperties } from 'react';
import { useMap } from './MapCanvas';
import { Data } from './ui';
import { Icon } from './Icon';
import { useAsync, type Async } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import {
  layerUrl,
  ZONE_LAYER,
  ZONE_FIELDS,
  zoneCanon,
  zoneType,
  ZONE_TYPES,
  ZONE_TYPE_EMPTY,
  ZONE_TYPE_EMPTY_HUE,
} from '@/lib/services';
import s from '@/modules/dashboard.module.css';

/**
 * БҮСИЙН ШҮҮЛТ — ТУСДАА ХЭРЭГЛҮҮР (2026-08-10).
 *
 * Урьд нь ViewPanel-ийн дотоод `ZoneBar` байсныг бие даасан компонент болгож,
 * бүсүүдийг ТӨРЛӨӨР нь (`Angilal` → каноник `zoneType`) бүлэглэв. Төлөв нь
 * Portal-ын `zone: string | null` хэвээр (олон бүс таслалаар) тул URL (`z=`),
 * totals-ын кэш, zoneWhere бүгд өөрчлөгдөлгүй ажиллана.
 *
 * Хоёр хувилбар:
 *   · `bar`  — самбарын бүтэн мөр (Ерөнхий төлөвлөгөө/Барилгын хяналтын байрлал)
 *   · `tool` — газрын зургийн toolbar-т багтах КОМПАКТ товч + доош нээгдэх хавтан
 *              (Ерөнхий дашбоард)
 */

type ZoneGroups = { type: string; hue: string; zones: string[] }[];

/** Бүсүүдийг төрлөөр нь бүлэглэж татна — ZONE_TYPES-ийн дараалал, дотроо mn эрэмбэ */
function useZoneGroups(): Async<ZoneGroups> {
  return useAsync<ZoneGroups>(async () => {
    const rows = await queryFeatures(layerUrl(ZONE_LAYER), {
      outFields: [ZONE_FIELDS.id, ZONE_FIELDS.type],
    });
    const by = new Map<string, Set<string>>();
    for (const r of rows) {
      const id = zoneCanon(String(r[ZONE_FIELDS.id] ?? '').trim());
      if (!id) continue;
      const t = zoneType(r[ZONE_FIELDS.type]);
      if (!by.has(t)) by.set(t, new Set());
      by.get(t)!.add(id);
    }
    // ZONE_TYPES-ийн дараалал эхэнд, дараа нь танигдаагүй төрлүүд, «Тодорхойгүй» сүүлд
    const known = [...Object.keys(ZONE_TYPES), ZONE_TYPE_EMPTY];
    const extra = [...by.keys()].filter((t) => !known.includes(t)).sort();
    return [...known, ...extra]
      .filter((t) => by.has(t))
      .map((t) => ({
        type: t,
        hue: ZONE_TYPES[t] ?? ZONE_TYPE_EMPTY_HUE,
        zones: [...by.get(t)!].sort((a, b) => a.localeCompare(b, 'mn')),
      }));
  }, []);
}

/** Төрлөөр бүлэглэсэн чипүүд — хоёр хувилбарт нийтлэг */
function GroupedChips({
  q, sel, toggle,
}: {
  q: Async<ZoneGroups>;
  sel: string[];
  toggle: (label: string) => void;
}) {
  return (
    <Data q={q} loading="Бүсүүд…">
      {(gs) => (
        <>
          {gs.map((g) => (
            <div key={g.type} className={s.zoneTypeBlock} style={{ '--tone': g.hue } as CSSProperties}>
              <p className={s.zoneTypeHead}>
                <i className={s.zoneTypeDot} aria-hidden />
                {g.type}
                <span className={s.zoneTypeN}>{g.zones.length}</span>
              </p>
              <div className={s.zoneGrid}>
                {g.zones.map((z) => {
                  const on = sel.includes(z);
                  return (
                    <button
                      key={z}
                      type="button"
                      aria-pressed={on}
                      className={`${s.zoneChip} ${on ? s.zoneChipOn : ''}`}
                      onClick={() => toggle(z)}
                    >
                      {z}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </Data>
  );
}

export function ZoneFilter({
  zone, setZone, variant = 'bar',
}: {
  zone: string | null;
  setZone: (z: string | null) => void;
  variant?: 'bar' | 'tool';
}) {
  const { zoomToZone } = useMap();
  const [open, setOpen] = useState(false);
  const q = useZoneGroups();

  const sel = zone ? zone.split(',').filter(Boolean) : [];
  const toggle = (label: string) => {
    const next = sel.includes(label) ? sel.filter((x) => x !== label) : [...sel, label];
    setZone(next.length ? next.join(',') : null);
  };

  /* ── КОМПАКТ хувилбар — газрын зургийн toolbar-т ── */
  if (variant === 'tool') {
    return (
      <div className={s.zoneTool}>
        <button
          type="button"
          aria-expanded={open}
          className={`${s.zoneToolBtn} ${sel.length ? s.zoneToolOn : ''}`}
          onClick={() => setOpen((v) => !v)}
          title="Бүсээр шүүх"
        >
          <Icon name="frame" size={14} />
          Бүс{sel.length ? ` · ${sel.length}` : ''}
        </button>
        {open && (
          <div className={s.zoneToolDrop}>
            <div className={s.zoneToolHead}>
              <span className={s.zoneBarValue}>{sel.length ? sel.join(', ') : 'Бүх бүс'}</span>
              {sel.length > 0 && (
                <button type="button" className={s.zoneBarBtn} onClick={() => zoomToZone(zone!)}>Төвлөрөх</button>
              )}
              {sel.length > 0 && (
                <button type="button" className={s.zoneBarClear} onClick={() => setZone(null)}>Цуцлах</button>
              )}
            </div>
            <GroupedChips q={q} sel={sel} toggle={toggle} />
          </div>
        )}
      </div>
    );
  }

  /* ── БҮТЭН МӨР хувилбар — самбарын толгойн доор (өмнөх ZoneBar-ын байрлал) ── */
  return (
    <div className={s.zoneBar}>
      <span className={s.zoneBarLabel}>Бүс</span>
      <span className={s.zoneBarValue}>{sel.length ? sel.join(', ') : 'Бүгд'}</span>
      {sel.length > 0 && (
        <button type="button" className={s.zoneBarBtn} onClick={() => zoomToZone(zone!)}>Төвлөрөх</button>
      )}
      {sel.length > 0 && (
        <button type="button" className={s.zoneBarClear} onClick={() => setZone(null)}>Цуцлах</button>
      )}
      <button type="button" className={s.zoneBarBtn} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Хаах' : sel.length ? 'Бүс нэмэх' : 'Бүс сонгох'}
      </button>

      {open && (
        <div className={s.zoneDrop}>
          <GroupedChips q={q} sel={sel} toggle={toggle} />
        </div>
      )}
    </div>
  );
}
