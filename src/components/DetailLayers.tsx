'use client';

import { t as tr } from '@/lib/i18nCore';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from '@/components/MapCanvas';
import { Icon } from '@/components/Icon';
import { LAYER_BY_ID } from '@/lib/services';
import { useFocusTrap } from '@/lib/useFocusTrap';
import s from './planOverlap.module.css';
import compareStyle from './hesegCompare.module.css';

/**
 * «Ерөнхий төлөвлөгөө» → «Detail»: ДАВХАРГЫН ТОВЧ (2026-10-13, хэрэглэгчийн заавар:
 * «detail дээр basemap-ийн доор layer-ийн icon үүсгээд дотор нь одоо, detail гэж
 * ангилаад унтрааж асаадаг болго»).
 */

/**
 * Бүлэг → мөрүүд. Мөр нь НЭГ давхарга (`ids: [id]`) эсвэл ОЛОН давхаргыг нэг чагтаар
 * (жиш. инженерийн систем бүр — 74 давхаргыг 5 мөрөөр) удирдана.
 */
export type DetailItem = { key: string; title: string; hue?: string; ids: string[] };
export type DetailGroup = { key: string; title: string; items: DetailItem[] };

/**
 * ХАРЬЦУУЛАХ (SWIPE) ТОВЧ — «Хэсэгчилсэн ЕТ»-ийн зургийн баруун дээд буланд, FULLSCREEN-ий ДООР
 * (2026-10-13, хэрэглэгч: «Swipe button дарахад compare хийдэг байх, Fullscreen доор байршуул»).
 */
export function SwipeToggle({ on, setOn }: { on: boolean; setOn: (f: (v: boolean) => boolean) => void }) {
  const { view } = useMap();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!view) return;
    const el = document.createElement('div');
    const controls = view.ui.getComponents('top-right');
    const fullscreen = controls.findIndex((x) => x instanceof HTMLElement && x.dataset.mapControl === 'fullscreen');
    view.ui.add(el, { position: 'top-right', index: fullscreen < 0 ? 3 : fullscreen + 1 });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHost(el);
    return () => { view.ui.remove(el); setHost(null); };
  }, [view]);
  if (!host) return null;
  return createPortal(
    <button
      type="button"
      className={`esri-widget--button esri-widget ${on ? s.swOn : ''}`}
      aria-pressed={on}
      aria-label={tr('Харьцуулах (swipe)')}
      title={tr('Харьцуулах (swipe)')}
      onClick={() => setOn((v) => !v)}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1.6v12.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M5.1 8H2.9M4.1 6.9 2.9 8l1.2 1.1M10.9 8h2.2M11.9 6.9 13.1 8l-1.2 1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>,
    host,
  );
}

/** Keep the meaning of each side visible while the map is fullscreen. */
export function CompareLabels({ on, leading, trailing }: { on: boolean; leading: string; trailing: string }) {
  const { view } = useMap();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!view) return;
    const el = document.createElement('div');
    el.className = compareStyle.labels;
    view.ui.add(el, 'manual');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ArcGIS owns the portal container.
    setHost(el);
    return () => { view.ui.remove(el); setHost(null); };
  }, [view]);
  if (!host) return null;
  return createPortal(<>
    <span className={compareStyle.label}>{on ? `${tr('Зүүн')}: ${leading}` : tr('Хэсэгчилсэн ЕТ')}</span>
    {on && <span className={compareStyle.label}>{tr('Баруун')}: {trailing}</span>}
  </>, host);
}

/** Давхарга бүрийг нэг мөр болгоно (нэр/өнгө нь `LAYER_BY_ID`-ээс) */
export const layerItems = (ids: string[]): DetailItem[] =>
  ids.map((id) => ({ key: id, title: LAYER_BY_ID[id]?.title ?? id, hue: LAYER_BY_ID[id]?.hue, ids: [id] }));

export function DetailLayerMenu({
  groups, hidden, setHidden,
}: { groups: DetailGroup[]; hidden: string[]; setHidden: (f: (h: string[]) => string[]) => void }) {
  const { view } = useMap();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!view) return;
    const el = document.createElement('div');
    el.className = s.lyrHost;
    const controls = view.ui.getComponents('top-right');
    const bm = controls.findIndex((x) => (x as { expandIcon?: string }).expandIcon === 'basemap');
    view.ui.add(el, { position: 'top-right', index: bm < 0 ? controls.length : bm + 1 });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHost(el);
    return () => {
      view.ui.remove(el);
      setHost(null);
    };
  }, [view]);

  /* Гадна дарахад хаана */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  if (!host) return null;

  const toggle = (ids: string[], on: boolean) =>
    setHidden((h) => (on ? h.filter((x) => !ids.includes(x)) : [...new Set([...h, ...ids])]));

  return createPortal(
    <div ref={boxRef} className={s.lyrBox}>
      <button
        type="button"
        className="esri-widget--button esri-widget"
        aria-expanded={open}
        aria-label={tr('Давхарга')}
        title={tr('Давхарга')}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="layers" size={16} />
      </button>
      {open && (
        <div
          ref={panelRef}
          className={s.lyrPanel}
          role="dialog"
          aria-label={tr('Давхарга')}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}
        >
          {groups.map((g) => {
            const gIds = g.items.flatMap((x) => x.ids);
            const on = g.items.filter((x) => x.ids.some((id) => !hidden.includes(id))).length;
            return (
              <section key={g.key} className={s.lyrGroup}>
                <label className={s.lyrGroupHead}>
                  <input
                    type="checkbox"
                    checked={on === g.items.length}
                    ref={(el) => { if (el) el.indeterminate = on > 0 && on < g.items.length; }}
                    onChange={(e) => toggle(gIds, e.target.checked)}
                  />
                  <span>{g.title}</span>
                  <small>{on}/{g.items.length}</small>
                </label>
                <ul className={s.lyrList}>
                  {g.items.map((it) => (
                    <li key={it.key}>
                      <label className={s.lyrRow}>
                        <input
                          type="checkbox"
                          checked={it.ids.some((id) => !hidden.includes(id))}
                          onChange={(e) => toggle(it.ids, e.target.checked)}
                        />
                        <span className={s.lyrSwatch} style={{ background: it.hue }} aria-hidden />
                        <span className={s.lyrName}>{it.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>,
    host,
  );
}
