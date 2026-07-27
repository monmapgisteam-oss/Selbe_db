'use client';

import { useState, type CSSProperties } from 'react';
import { MAP_LAYERS, MAP_GROUPS } from '@/lib/analysis/config';
import { Icon } from '@/components/Icon';
import c from '@/components/catalog.module.css';

/**
 * ТОХИРОМЖТОЙ БАЙДЛЫН ҮНЭЛГЭЭ-ний давхаргын каталог — «Ерөнхий төлөвлөгөө»-ийн
 * `LayerCatalog`-той ИЖИЛ дүр төрх (бүлэг хумих/дэлгэх, swatch, чагт switch),
 * газрын зурган дээрх «Давхарга» товчоор нээгддэг.
 *
 * ⚠️ Анализ нь порталын `LAYERS`-аас ТУСДАА `MAP_LAYERS` (өнгө/төрлийн тусгай
 * тохиргоотой) ашигладаг тул `LayerCatalog` компонентыг шууд дахин ашиглаж
 * болохгүй — энэ нь ижил CSS (`catalog.module.css`)-ийг ашиглан тэр дүр төрхийг
 * `MAP_LAYERS` дээр давтана. Ил байдал нь `layerOn` тэмдэглэлээр удирдагдана.
 */

/** Бүлэг бүрийн өнгө — гарчгийн акцент (төлөөлөх давхаргын өнгөнөөс). */
const GROUP_HUE: Record<string, string> = {
  base: '#94a3b8',
  transit: '#f472b6',
  heat: '#fb923c',
  water: '#38bdf8',
  power: '#facc15',
  amenity: '#4ade80',
  monitor: '#ea580c',
};

/** Бүлгийн дүрс — «Барилгын хяналт» каталогтой ижил төрх. */
const GROUP_ICON: Record<string, string> = {
  base: 'building',
  transit: 'bus',
  heat: 'flame',
  water: 'droplet',
  power: 'bolt',
  amenity: 'grid',
  monitor: 'target',
};

export function SuitLayerCatalog({
  layerOn,
  setLayerOn,
  onClose,
}: {
  layerOn: Record<string, boolean>;
  setLayerOn: (v: Record<string, boolean>) => void;
  onClose: () => void;
}) {
  const groups = Object.keys(MAP_GROUPS)
    .map((key) => ({
      key,
      label: MAP_GROUPS[key],
      hue: GROUP_HUE[key] ?? '#94a3b8',
      items: MAP_LAYERS.filter((l) => l.group === key),
    }))
    .filter((g) => g.items.length > 0);

  /** Хураасан бүлгүүд — эхлэхэд бүгд дэлгэгдсэн (анализ дээр давхарга цөөн). */
  const [shut, setShut] = useState<Set<string>>(() => new Set());

  const all = groups.flatMap((g) => g.items);
  const onCount = all.filter((l) => layerOn[l.key]).length;

  const toggle = (key: string) => setLayerOn({ ...layerOn, [key]: !layerOn[key] });

  /** Бүлэг бүхэлдээ — нэг ч асаагүй бол бүгдийг асаана, эс бөгөөс унтраана. */
  const toggleGroup = (keys: string[]) => {
    const allOff = keys.every((k) => !layerOn[k]);
    const next = { ...layerOn };
    for (const k of keys) next[k] = allOff;
    setLayerOn(next);
  };

  const setOpenState = (key: string, open: boolean) =>
    setShut((prev) => {
      const nx = new Set(prev);
      if (open) nx.delete(key); else nx.add(key);
      return nx;
    });

  return (
    <aside className={`${c.drawer} ${c.embedded}`} aria-label="Давхаргын жагсаалт">
      <header className={c.head} style={{ '--hue': '#4fd1c5' } as CSSProperties}>
        <div className={c.headText}>
          <span className={c.title}>Давхарга</span>
          <span className={c.sub}>{all.length} нийт · {onCount} асаалттай</span>
        </div>
        <button
          type="button"
          className={c.close}
          onClick={() => setShut(shut.size ? new Set() : new Set(groups.map((g) => g.key)))}
          title={shut.size ? 'Бүгдийг дэлгэх' : 'Бүгдийг хураах'}
          aria-label={shut.size ? 'Бүгдийг дэлгэх' : 'Бүгдийг хураах'}
        >
          {shut.size ? '▸' : '▾'}
        </button>
        <button type="button" className={c.close} onClick={onClose} aria-label="Жагсаалтыг хаах">×</button>
      </header>

      <div className={c.body}>
        {groups.map((g) => {
          const keys = g.items.map((l) => l.key);
          const on = keys.filter((k) => layerOn[k]).length;
          const open = !shut.has(g.key);
          return (
            <section key={g.key} className={c.group} style={{ '--tone': g.hue } as CSSProperties}>
              <div className={c.groupHead}>
                <button
                  type="button"
                  aria-expanded={open}
                  className={c.groupToggle}
                  onClick={() => setOpenState(g.key, !open)}
                >
                  <span className={c.groupIcon}><Icon name={GROUP_ICON[g.key] ?? 'layers'} size={15} /></span>
                  <span className={c.groupTitle}>{g.label}</span>
                  <span className={`${c.groupCaret} ${open ? c.groupCaretOpen : ''}`} aria-hidden>▾</span>
                </button>
                <button
                  type="button"
                  className={c.groupBtn}
                  onClick={() => toggleGroup(keys)}
                  title={on === 0 ? 'Бүлгийг бүхэлд нь асаах' : 'Бүлгийг бүхэлд нь унтраах'}
                >
                  {on}/{keys.length}
                </button>
              </div>

              {open && (
                <div className={c.rows}>
                  {g.items.map((l) => {
                    const isOn = !!layerOn[l.key];
                    const rgb = `rgb(${l.color.join(',')})`;
                    return (
                      <div
                        key={l.key}
                        className={`${c.row} ${isOn ? c.rowOn : ''}`}
                        style={{ '--tone': rgb } as CSSProperties}
                      >
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isOn}
                          aria-label={`${l.title} — зурагт харуулах`}
                          className={c.check}
                          onClick={() => toggle(l.key)}
                        >
                          <svg viewBox="0 0 12 12" width="10" height="10">
                            <path d="M2 6.2 4.6 8.8 10 3.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>

                        {/* Симбол — шугам нь нимгэн зурвас, бусад нь цэг.
                            (`.chk :global(.swatch/.dot)` нь `.chk`-д scoped тул
                            энд inline хэмжээ өгнө.) */}
                        <span
                          aria-hidden
                          style={{
                            flex: 'none',
                            background: rgb,
                            ...(l.kind === 'line'
                              ? { width: 10, height: 3, borderRadius: 2 }
                              : { width: 9, height: 9, borderRadius: '50%' }),
                          }}
                        />

                        <button type="button" className={c.rowMain} onClick={() => toggle(l.key)}>
                          <span className={c.rowTitle}>{l.title}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
