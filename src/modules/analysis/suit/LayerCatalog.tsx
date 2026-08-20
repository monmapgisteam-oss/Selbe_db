'use client';

import { useState, type CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MAP_LAYERS, BUILDING_STATUS_COLORS, type MapLayerDef } from '@/lib/analysis/config';
import { LAYER_GROUPS, MONITOR_GROUP, LAYER_BY_ID, type LayerDef } from '@/lib/services';
import { Icon } from '@/components/Icon';
import { LayerSwatch } from '@/components/LayerSwatch';
import c from '@/components/catalog.module.css';

/**
 * ТОХИРОМЖТОЙ БАЙДЛЫН ҮНЭЛГЭЭ-ний давхаргын каталог — «Ерөнхий төлөвлөгөө»-ийн
 * `LayerCatalog`-той ИЖИЛ дүр төрх ба ИЖИЛ бүлгүүд (гарчиг, дүрс, өнгө нь
 * порталын `LAYER_GROUPS`-аас), газрын зурган дээрх «Давхарга» товчоор нээгддэг.
 *
 * ⚠️ Анализ нь өнгө/тунгалагшилтын тусгай рендертэй тул `LayerCatalog`
 * компонентыг шууд дахин ашиглахгүй — ижил CSS (`catalog.module.css`)-ийг
 * ашиглан `MAP_LAYERS` дээр давтана. Давхарга нь plan-тай ижил (~84) бөгөөд
 * бүлэг нь plan-ийн бүлгээр. Ил байдал `layerOn` тэмдэглэлээр удирдагдана.
 */

/** Каталогийн бүлгүүд — plan-тай ЯГ ИЖИЛ (гарчиг · дүрс · өнгө). */
const GROUP_META = [...LAYER_GROUPS, MONITOR_GROUP];

/**
 * Мөрийн СИМБОЛ — газрын зурагтай ижил. plan-ий давхарга бол түүний бодит
 * `LayerDef`-ийг (геометр төрөл · өнгө · шугамын хээ) авна; эс бөгөөс (тусгай
 * `zone`/`label`) `MapLayerDef`-ийн kind/color-оос энгийн симбол угсарна.
 */
function swatchDef(l: MapLayerDef): LayerDef {
  const real = l.layerId ? LAYER_BY_ID[l.layerId] : undefined;
  if (real) return real;
  const geom: LayerDef['geom'] =
    l.kind === 'line' ? 'line' : (l.kind === 'point' || l.kind === 'point-lg') ? 'point' : 'area';
  return { geom, hue: `rgb(${l.color.join(',')})`, fill: 0.45 } as LayerDef;
}

export function SuitLayerCatalog({
  layerOn,
  setLayerOn,
  onClose,
}: {
  layerOn: Record<string, boolean>;
  setLayerOn: (v: Record<string, boolean>) => void;
  onClose: () => void;
}) {
  const groups = GROUP_META
    .map((g) => ({
      key: g.key,
      label: g.title,
      hue: g.hue,
      icon: g.icon,
      items: MAP_LAYERS.filter((l) => l.group === g.key),
    }))
    .filter((g) => g.items.length > 0);

  /**
   * Хураасан бүлгүүд — эхлэхэд БҮГД ХУРААГДСАН (plan-тай ижил). ~84 давхарга
   * задгай байвал жагсаалт хэдэн дэлгэц болно; хэрэгтэй бүлгээ дараад л задална.
   */
  const [shut, setShut] = useState<Set<string>>(() => new Set(GROUP_META.map((g) => g.key)));

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
    <aside className={`${c.drawer} ${c.embedded}`} aria-label={tr('Давхаргын жагсаалт')}>
      {/* ⚠️ Урьд нь энд '--hue': '#4fd1c5' гэж дардаг байв — одоо глобал --hue
          нь var(--data) тул хоёр горимд өөрөө тохирно (override хэрэггүй). */}
      <header className={c.head}>
        <div className={c.headText}>
          <span className={c.title}>{tr('Давхарга')}</span>
          <span className={c.sub}>{all.length} {tr('нийт ·')} {onCount} {tr('асаалттай')}</span>
        </div>
        <button
          type="button"
          className={c.close}
          onClick={() => setShut(shut.size ? new Set() : new Set(groups.map((g) => g.key)))}
          title={shut.size ? tr('Бүгдийг дэлгэх') : tr('Бүгдийг хураах')}
          aria-label={shut.size ? tr('Бүгдийг дэлгэх') : tr('Бүгдийг хураах')}
        >
          {shut.size ? '▸' : '▾'}
        </button>
        <button type="button" className={c.close} onClick={onClose} aria-label={tr('Жагсаалтыг хаах')}>×</button>
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
                  <span className={c.groupIcon}><Icon name={g.icon} size={15} /></span>
                  <span className={c.groupTitle}>{g.label}</span>
                  <span className={`${c.groupCaret} ${open ? c.groupCaretOpen : ''}`} aria-hidden>▾</span>
                </button>
                <button
                  type="button"
                  className={c.groupBtn}
                  onClick={() => toggleGroup(keys)}
                  title={on === 0 ? tr('Бүлгийг бүхэлд нь асаах') : tr('Бүлгийг бүхэлд нь унтраах')}
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
                        className={`${c.row} ${isOn ? c.rowOn : ''} ${l.kind === 'building' ? c.rowFacet : ''}`}
                        style={{ '--tone': rgb } as CSSProperties}
                      >
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isOn}
                          aria-label={tr('{0} — зурагт харуулах', l.title)}
                          className={c.check}
                          onClick={() => toggle(l.key)}
                        >
                          <svg viewBox="0 0 12 12" width="10" height="10">
                            <path d="M2 6.2 4.6 8.8 10 3.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>

                        {/* Симбол — газрын зурагтай ИЖИЛ (геометр · өнгө · шугамын хээ) */}
                        <LayerSwatch d={swatchDef(l)} />

                        <button type="button" className={c.rowMain} onClick={() => toggle(l.key)}>
                          <span className={c.rowTitle}>{l.title}</span>
                        </button>

                        {/* Барилга — төлөв бүрийн (`Barilga_ty`) өнгийг газрын зурагтай
                            ижлээр задалж харуулна (шүүлт биш, зөвхөн legend). */}
                        {l.kind === 'building' && (
                          <div className={c.facetRows}>
                            {Object.entries(BUILDING_STATUS_COLORS).map(([label, col]) => (
                              <div
                                key={label}
                                className={c.legendRow}
                                style={{ '--tone': `rgb(${col.join(',')})` } as CSSProperties}
                              >
                                <span className={c.legendDot} aria-hidden />
                                <span className={c.facetName}>{label}</span>
                              </div>
                            ))}
                          </div>
                        )}
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
