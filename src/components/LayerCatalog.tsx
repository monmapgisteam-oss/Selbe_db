'use client';

import {
  memo, useState,
  type CSSProperties, type Dispatch, type SetStateAction, type ReactNode,
  type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, EyeOff, Search, X } from 'lucide-react';
import { Icon } from './Icon';
import { t as tr } from '@/lib/i18nCore';
import { LayerSwatch } from './LayerSwatch';
import { zonesLabel } from '@/lib/zoneLabel';
import { useMap } from './MapCanvas';
import { useAsync, type Async } from '@/lib/useAsync';
import type { Totals } from '@/lib/totals';
import { qtyText, whereFor, layerStats, totalsFailedOf, retryTotals, useLazyTotals } from '@/lib/totals';
import { useFilter } from '@/lib/filter';
import { queryGroupEx, groups, groupWhere } from '@/lib/query';
import {
  catalogGroups, INITIAL_MAP_LAYERS, LAYER_BY_ID, layerUrl, ALWAYS_ON_IDS,
  type CatalogView, type LayerDef,
} from '@/lib/services';
import { num } from '@/lib/format';
import s from './catalog.module.css';

/**
 * ДАВХАРГЫН КАТАЛОГ — «Ерөнхий мэдээлэл» дарахад зүүн модны ХАЖУУД нээгдэх багана.
 *
 * Мөр бүр ХОЁР үйлдэлтэй (2026-07-31, хэрэглэгчийн хүсэлт — чагт хасагдсан):
 *   · нэр — зурагт харуулах/нуух (багана нээлттэй хэвээр)
 *   · баруун захын жижиг диаграм товч — баруун самбарт тэр давхаргын дашбоард
 */
export const LayerCatalog = memo(function LayerCatalog({
  view,
  totals,
  visible,
  setVisible,
  selected,
  onSelect,
  onClose,
  pinned = false,
  resizing = false,
  onResizeStart,
  onResizeReset,
  onResizeKey,
  zone,
  embedded = false,
  extra,
  forced,
  allow,
}: {
  /**
   * Аль харагдацын каталог вэ.
   */
  view: CatalogView;
  /**
   * Бүх мөрийн тоо/хэмжээ (дуудагч татсан). 2026-10-22: ӨГӨӨГҮЙ бол нээлттэй бүлгийнхийг л өөрөө татна
   * (компонентын толгой).
   */
  totals?: Async<Map<string, Totals>>;
  visible: string[];
  setVisible: Dispatch<SetStateAction<string[]>>;
  selected: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  /**
   * Багана БЭХЛЭГДСЭН эсэх — «Ерөнхий мэдээлэл»-д жагсаалт зүүн талд байнга
   * үлдэх тул хаах товч далд болно. `onClose` нь бэхлэгдээгүй харагдацад
   * (Барилгын хяналт) хэвээр ажиллана.
   */
  pinned?: boolean;
  /** Багана яг одоо чирэгдэж байгаа эсэх — бариулыг тодруулна */
  resizing?: boolean;
  /**
   * Өргөн тохируулах бариулын үйлдлүүд. `Portal` нь өргөнийг `--catalog`
   * хувьсагчаар grid-д өгдөг тул төлөв нь ТЭНД амьдарна — энд зөвхөн бариул.
   * Дамжуулаагүй бол бариул огт зурагдахгүй (өргөн нь тогтмол).
   */
  onResizeStart?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeReset?: () => void;
  onResizeKey?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  zone: string | null;
  /**
   * Порталын grid-ийн `cat` баганын оронд ХӨВӨГЧ панелийн дотор зурагдах уу.
   */
  embedded?: boolean;
  /**
   * ХАРАГДАЦЫН ӨӨРИЙН НЭМЭЛТ ХЭСЭГ — жагсаалтын ХАМГИЙН ДООД талд
   * (2026-09-15, хэрэглэгчийн заавар: «давхаргын доор «Багц 74» гэж
   * шинээр үүсгэнэ, тэнд багцын ажлууд жагсаалтаар харагдана»).
   */
  extra?: ReactNode;
  /**
   * ЭНЭ ХАРАГДАЦАД ҮРГЭЛЖ АСААЛТТАЙ давхаргууд (2026-09-15) — мөр нь
   * «асаалттай» гэж харагдаж, унтраах товшилт ажиллахгүй.
   */
  forced?: readonly string[];
  /**
   * ДАВХАРГЫН ШҮҮЛТ (2026-09-23) — `false` буцаасан давхарга каталогт ОГТ
   * гарахгүй, хоосон болсон бүлэг ч гарахгүй. «Инженерийн дэд бүтэц»-ийн
   * багцын аккаунт бусад багцын давхаргыг харахгүй (`DedButets.hidden`).
   */
  allow?: (id: string) => boolean;
}) {
  const catGroups = allow
    ? catalogGroups(view)
      .map((g) => ({ ...g, ids: g.ids.filter(allow) }))
      .filter((g) => g.ids.length > 0)
    : catalogGroups(view);
  /** Ортофото ил эсэх — газрын зурагтай нэг эх сурвалж (`MapProvider`) */
  const { ortho, setOrtho } = useMap();

  /**
   * Хураасан багцууд.
   */
  const [shut, setShut] = useState<Set<string>>(
    () => new Set(catGroups.map((g) => g.key)),
  );

  /**
   * АНХНЫ (default) багц хэвээр байна уу — «Ерөнхий төлөвлөгөө»-ний нээлтийн
   * давхаргууд (`INITIAL_MAP_LAYERS`) яг тэр чигээрээ асаалттай төлөв.
   */
  const isDefault = (list: string[]) =>
    view === 'plan' &&
    list.length === INITIAL_MAP_LAYERS.length &&
    INITIAL_MAP_LAYERS.every((id) => list.includes(id));

  const toggle = (id: string) =>
    setVisible((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return isDefault(prev) ? [id] : [...prev, id];
    });

  /** Багц бүхэлдээ — нэг ч асаагүй бол бүгдийг асаана, эс бөгөөс бүгдийг унтраана */
  const toggleGroup = (ids: string[]) =>
    setVisible((prev) => {
      if (ids.every((id) => !prev.includes(id)))
        return isDefault(prev) ? [...ids] : [...prev, ...ids.filter((id) => !prev.includes(id))];
      return prev.filter((id) => !ids.includes(id));
    });

  /** Багцыг задлах/хураах — нэг газарт */
  const setOpenState = (key: string, open: boolean) =>
    setShut((prev) => {
      const next = new Set(prev);
      if (open) next.delete(key); else next.add(key);
      return next;
    });

  const all = catGroups.flatMap((g) => g.ids);
  const forcedIds = [...(ALWAYS_ON_IDS as readonly string[]), ...(forced ?? [])];
  const forcedAll = forcedIds.filter((id) => all.includes(id));

  /*
   * ХАЙЛТ (2026-09-15-ны хэрэглээний аудит).
   */
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  /** Давхарга хайлтад таарч байна уу — нэр ба бүлгийн нэрээр */
  const hit = (id: string, groupTitle: string): boolean => {
    if (!needle) return true;
    const d = LAYER_BY_ID[id];
    return `${d?.title ?? ''} ${groupTitle}`.toLowerCase().includes(needle);
  };

  /*
   * ТОЛГОЙН «N асаалттай» — ХАЙЛТААР шүүгдсэн мөрүүдийн тоо (2026-09-16).
   */
  const shown = catGroups.flatMap((g) => g.ids.filter((id) => hit(id, g.title)));
  const onCount = new Set([
    ...visible.filter((id) => shown.includes(id)),
    ...forcedAll.filter((id) => shown.includes(id)),
  ]).size;

  const lazyIds = totals ? [] : catGroups.flatMap((g) => (needle || !shut.has(g.key) ? g.ids.filter((id) => hit(id, g.title)) : []));
  const lazy = useLazyTotals(zone, lazyIds, !totals);
  const tot = totals
    ? {
      map: totals.state === 'ready' ? totals.data : null,
      loading: totals.state === 'loading',
      error: totals.state === 'error' ? totals : null,
      failed: totals.state === 'ready' ? totalsFailedOf(totals.data) : [],
      rowLoading: (_id: string) => totals.state === 'loading',
    }
    : {
      map: lazy.map,
      loading: lazy.pending > 0,
      error: null,
      failed: lazy.failed,
      rowLoading: (id: string) => !lazy.failed.includes(id),
    };

  return (
    <aside data-report-skip="" className={`${s.drawer} ${embedded ? s.embedded : ''} mapCatalog`} aria-label={tr('Давхаргын жагсаалт')}>
      {/* Өргөн тохируулах бариул — баганын БАРУУН ирмэг дээр (зураг руу харсан) */}
      {onResizeStart && (
        <div
          className={`${s.grip} ${resizing ? s.gripOn : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label={tr('Жагсаалтын өргөн')}
          tabIndex={onResizeKey ? 0 : undefined}
          onPointerDown={onResizeStart}
          onDoubleClick={onResizeReset}
          onKeyDown={onResizeKey}
          title={tr('Чирж өргөсгөнө · давхар товшиж анхны хэмжээнд буцаана')}
        />
      )}

      <header className={s.head}>
        <div className={s.headText}>
          <span className={s.title}>{tr('Давхарга')}</span>
          <span className={s.sub}>
            {num(shown.length)} {tr('нийт ·')} {num(onCount)} {tr('асаалттай')}
            {/* Тоо/хэмжээ хараахан татагдаж байгааг заана — ЖАГСААЛТ өөрөө хүлээхгүй */}
            {tot.loading && <> {tr('· тоолж байна…')}</>}
            {tot.error && (
              <>
                {' · '}<em className={s.rowWarn}>{tr('тоо татагдсангүй')}</em>
                {tot.error.retry && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={tot.error.retry}
                      style={{ font: 'inherit', color: 'inherit', background: 'none', border: 0, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      {tr('дахин оролдох')}
                    </button>
                  </>
                )}
              </>
            )}
            {(() => {
              if (!tot.failed.length) return null;
              const bad = new Set(tot.failed);
              const n = new Set(catGroups.flatMap((g) => g.ids).filter((id) => bad.has(id))).size;
              if (!n) return null;
              return (
                <>
                  {' · '}<em className={s.rowWarn}>{tr('{0} давхарга татагдсангүй', num(n))}</em>
                  {' '}
                  <button
                    type="button"
                    onClick={retryTotals}
                    style={{ font: 'inherit', color: 'inherit', background: 'none', border: 0, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {tr('дахин оролдох')}
                  </button>
                </>
              );
            })()}
            {zone && <> · {zonesLabel(zone.split(',').filter(Boolean))}</>}
          </span>
        </div>
        <button
          type="button"
          className={s.close}
          onClick={() => setShut(shut.size ? new Set() : new Set(catGroups.map((g) => g.key)))}
          title={shut.size ? tr('Бүгдийг дэлгэх') : tr('Бүгдийг хураах')}
          aria-label={shut.size ? tr('Бүгдийг дэлгэх') : tr('Бүгдийг хураах')}
        >
          {shut.size ? <ChevronsUpDown size={14} strokeWidth={1.6} aria-hidden /> : <ChevronsDownUp size={14} strokeWidth={1.6} aria-hidden />}
        </button>
        {!pinned && (
          <button type="button" className={s.close} onClick={onClose} aria-label={tr('Жагсаалтыг хаах')}>
            <X size={14} strokeWidth={1.6} aria-hidden />
          </button>
        )}
      </header>

      <div className={s.body}>
        {/* ХАЙЛТ — ~99 давхаргаас нэрээр нь олох цорын ганц зам (дээрх). */}
        <label className={s.searchBox}>
          <Search size={13} strokeWidth={1.75} aria-hidden />
          <input
            type="search"
            className={s.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr('Давхарга хайх…')}
            aria-label={tr('Давхарга хайх')}
          />
        </label>

        {/* БҮХ ДАВХАРГЫГ УНТРААХ — жагсаалтын хамгийн дээд, тусдаа том товч
            (хэрэглэгчийн хүсэлт: шууд нүдэнд харагдахуйц). Унтраах юмгүй үед
            бүдгэрнэ. */}
        <button
          type="button"
          className={s.allOff}
          disabled={visible.filter((id) => all.includes(id)).length === 0}
          onClick={() => setVisible((prev) => prev.filter((id) => !all.includes(id)))}
        >
          <EyeOff size={14} strokeWidth={1.6} aria-hidden />
          {tr('Бүх давхаргыг унтраах')}
          {onCount > 0 && <span className={`${s.allOffCount} num`}>{onCount}</span>}
        </button>

        {/* ОРТОФОТО — жагсаалтын ХАМГИЙН ДЭЭД мөр. Суурь зураг топографи, энэ
            чагтаар ортофотог асаана/унтраана (газрын зурагтай нэг эх сурвалж). */}
        <button
          type="button"
          role="switch"
          aria-checked={ortho}
          className={`${s.ortho} ${ortho ? s.orthoOn : ''}`}
          onClick={() => setOrtho(!ortho)}
        >
          <span className={s.orthoCheck}>
            <svg viewBox="0 0 12 12" width="10" height="10">
              <path d="M2 6.2 4.6 8.8 10 3.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <Icon name="layers" size={15} />
          <span className={s.orthoLabel}>{tr('Ортофото зураг')}</span>
          <span className={s.orthoState}>{ortho ? tr('ил') : tr('нуусан')}</span>
        </button>

        {(() => {
          const map = tot.map;
          return (
            <>
              {needle && shown.length === 0 && (
                <p style={{ margin: 0, padding: '14px 16px', fontSize: 12, color: 'var(--ink-3)' }}>
                  {tr('Олдсонгүй')}
                </p>
              )}
              {catGroups.map((g) => {
                const ids = g.ids.filter((id) => hit(id, g.title));
                if (!ids.length) return null;
                const defs = ids.map((id) => LAYER_BY_ID[id]).filter(Boolean);
                const on = ids.filter(
                  (id) => visible.includes(id) || forcedIds.includes(id),
                ).length;
                const open = needle ? true : !shut.has(g.key);

                return (
                  <section
                    key={g.key}
                    className={s.group}
                    style={{ '--tone': g.hue } as CSSProperties}
                  >
                    <div className={s.groupHead}>
                      {/**
                        * Гарчиг дарахад багцын давхаргууд БҮГД асна/унтарна
                        * (2026-07-31, хэрэглэгчийн хүсэлт). Урьд нь гарчиг зөвхөн
                        * жагсаалт нээж/хаадаг, асаахын тулд баруун захын жижиг
                        * «0/6» товч дарах шаардлагатай байсан — түүнийг тоолуур
                        * гэж уншсан хүн дарж үздэггүй байлаа.
                        */}
                      {/* Дарах талбай нь толгойн БҮТЭН өргөн (дүрс + нэр +
                          тоолуур) — нэр дээр онож дарах шаардлагагүй
                          (2026-07-31, хэрэглэгчийн хүсэлт). Зөвхөн ▾ сум тусдаа. */}
                      <button
                        type="button"
                        className={s.groupToggle}
                        title={on === 0 ? tr('Багцыг бүхэлд нь асаах') : tr('Багцыг бүхэлд нь унтраах')}
                        onClick={() => {
                          toggleGroup(ids);
                          // Асаахад мөрүүд нь задарч, унтраахад буцаж хураагдана
                          // (toggleGroup: нэг ч асаагүй үед л асаана — түүнтэй ижил нөхцөл)
                          setOpenState(g.key, on === 0);
                        }}
                      >
                        <span className={s.groupIcon}><Icon name={g.icon} size={16} /></span>
                        <span className={s.groupTitle}>{g.title}</span>
                        {/* Тоолуур — товч БИШ, зөвхөн төлөв заана */}
                        <span className={`${s.groupBtn} num`}>{on}/{ids.length}</span>
                      </button>

                      {/* Хураах/дэлгэх — ТУСДАА товч (гарчиг нь багцыг асаадаг болсон) */}
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-label={open ? tr('{0} — жагсаалтыг хураах', g.title) : tr('{0} — жагсаалтыг дэлгэх', g.title)}
                        title={open ? tr('Жагсаалтыг хураах') : tr('Жагсаалтыг дэлгэх')}
                        className={`${s.groupCaret} ${open ? s.groupCaretOpen : ''}`}
                        onClick={() => setOpenState(g.key, !open)}
                      >
                        <ChevronDown size={14} strokeWidth={1.6} aria-hidden />
                      </button>
                    </div>

                    {open && (
                    <div className={s.rows}>
                      {defs.map((d) => {
                        const t = map?.get(d.id);
                        const isForced = forcedIds.includes(d.id);
                        const isOn = isForced || visible.includes(d.id);
                        const q = t ? qtyText(d, t.q) : null;
                        return (
                          <div
                            key={d.id}
                            className={`${s.row} ${d.catalogFacet ? s.rowFacet : ''} ${isOn ? s.rowOn : ''} ${selected === d.id ? s.rowSel : ''}`}
                            style={{ '--tone': d.hue } as CSSProperties}
                          >
                            {/* Симбол — газрын зурагтай ижил. Тайлбарын хайрцаг
                                хассан тул өнгө↔давхаргын холбоо ЭНД байна. */}
                            <LayerSwatch d={d} />

                            {/* Нэр дарахад зурагт асна/унтарна (чагт хасагдсан —
                                2026-07-31, хэрэглэгчийн хүсэлт) */}
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isOn}
                              aria-label={tr('{0} — зурагт харуулах', d.title)}
                              className={s.rowMain}
                              title={isForced ? tr('Энэ давхарга үргэлж асаалттай') : undefined}
                              onClick={() => { if (!isForced) toggle(d.id); }}
                            >
                              <span className={s.rowTitle}>{d.title}</span>
                              <span className={`${s.rowMeta} num`}>
                                {t ? tr('{0} ш', num(t.n)) : (tot.rowLoading(d.id) ? '…' : '—')}
                                {q ? ` · ${q}` : ''}
                                {zone && d.noZone && <em className={s.rowWarn}> {tr('· бүсгүй')}</em>}
                              </span>
                            </button>

                            {/* Дэлгэрэнгүй дашбоард — баруун самбарт (нэрээс салгав) */}
                            <button
                              type="button"
                              aria-pressed={selected === d.id}
                              aria-label={tr('{0} — дэлгэрэнгүй самбар', d.title)}
                              title={tr('Дэлгэрэнгүй самбар')}
                              className={s.rowChart}
                              onClick={() => onSelect(d.id)}
                            >
                              <Icon name="chart" size={14} />
                            </button>

                            {/* Ангиллаараа задарсан давхарга — доор нь дэд мөрүүд */}
                            {d.catalogFacet && d.facets?.length && (
                              <FacetRows
                                d={d}
                                zone={zone}
                                view={view}
                                onNeedVisible={() => { if (!isOn) toggle(d.id); }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </section>
                );
              })}
            </>
          );
        })()}
        {extra}
      </div>

    </aside>
  );
});

/* ═════════════════ Ангиллын дэд мөрүүд ═════════════════ */

/**
 * Давхаргыг АНГИЛЛААРАА задалж каталогт дэд мөр болгоно.
 */
function FacetRows({
  d,
  zone,
  view,
  onNeedVisible,
}: {
  d: LayerDef;
  zone: string | null;
  view: CatalogView;
  /** Шүүхийн өмнө давхаргыг зурагт гаргана — унтарсан давхаргыг шүүх нь дэмий */
  onNeedVisible: () => void;
}) {
  const { toggle, isOn } = useFilter();
  const f = d.facets![0];
  const where = whereFor(d, zone);

  const q = useAsync(async () => {
    const { rows, truncated } = await queryGroupEx(layerUrl(d), f.field, layerStats(d), where);
    const items = groups(rows, f.field, tr('Бүртгэгдээгүй'), ['n', 'q'])
      .sort((a, b) => b.values.n - a.values.n);
    return { items, truncated };
  }, [d.id, where]);

  if (q.state === 'error') {
    return (
      <div className={s.facetRows}>
        <button type="button" className={s.facetRow} onClick={q.retry}>
          <span className={s.facetName}>{tr('Ангилал татагдсангүй — дахин оролдох')}</span>
        </button>
      </div>
    );
  }

  if (q.state !== 'ready' || q.data.items.length < 2) return null;

  const nameOf = (label: string): string => tr(f.canon
    ? f.canon(label)
    : f.field === d.paint?.field
      ? d.paint.labels?.[label] ?? label
      : label);

  return (
    <div className={s.facetRows}>
      {q.data.items.map((item) => {
        const key = `cat:${d.id}:${item.label}`;
        const on = isOn(key);
        const name = nameOf(item.label);
        const qty = qtyText(d, item.stats.q ?? null);
        return (
          <button
            key={item.label}
            type="button"
            aria-pressed={on}
            className={`${s.facetRow} ${on ? s.facetRowOn : ''}`}
            onClick={() => {
              onNeedVisible();
              toggle({
                key,
                label: name,
                group: f.label,
                where: groupWhere(f.field, item),
                view,
                layerIds: d.id,
                color: d.hue,
              });
            }}
          >
            <span className={s.facetName}>{name}</span>
            <span className={`${s.facetMeta} num`}>
              {num(item.values.n)} {tr('ш')}{qty ? ` · ${qty}` : ''}
            </span>
          </button>
        );
      })}
      {q.data.truncated && (
        <div className={s.facetRow} role="note" title={tr('Ангиллын тоо серверийн хязгаараас хэтэрсэн тул зарим ангилал харагдахгүй байна.')}>
          <span className={s.facetName}>{tr('⚠ Жагсаалт дутуу — зарим ангилал орхигдсон')}</span>
        </div>
      )}
    </div>
  );
}
