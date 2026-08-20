'use client';

import {
  memo, useState,
  type CSSProperties, type Dispatch, type SetStateAction,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Icon } from './Icon';
import { t as tr } from '@/lib/i18nCore';
import { LayerSwatch } from './LayerSwatch';
import { useMap } from './MapCanvas';
import { useAsync, type Async } from '@/lib/useAsync';
import type { Totals } from '@/lib/totals';
import { qtyText, whereFor, layerStats } from '@/lib/totals';
import { useFilter } from '@/lib/filter';
import { queryGroup, groups, groupWhere } from '@/lib/query';
import { catalogGroups, INITIAL_MAP_LAYERS, LAYER_BY_ID, layerUrl, type LayerDef } from '@/lib/services';
import { num } from '@/lib/format';
import s from './catalog.module.css';

/**
 * ДАВХАРГЫН КАТАЛОГ — «Ерөнхий мэдээлэл» дарахад зүүн модны ХАЖУУД нээгдэх багана.
 *
 * ⚠️ Урьд нь модал popup байв. Popup нь зураг ба самбарыг бүрхдэг тул давхарга
 * асаах бүрд «юу өөрчлөгдсөнийг» харахын тулд хаах шаардлагатай болдог байлаа.
 * Багана болгосноор чагт дарах бүрд зурагт өөрчлөлт ШУУД харагдана.
 *
 * ⚠️ Тоо, өртгийг ЭНД дахин татахгүй: `totals`-ыг `Portal` нэг удаа дуудаж
 * дамжуулна — самбарын дүнтэй зөрөх боломжгүй байх ёстой.
 *
 * Мөр бүр ХОЁР үйлдэлтэй (2026-07-31, хэрэглэгчийн хүсэлт — чагт хасагдсан):
 *   · нэр — зурагт харуулах/нуух (багана нээлттэй хэвээр)
 *   · баруун захын жижиг диаграм товч — баруун самбарт тэр давхаргын дашбоард
 *
 * ⚠️ `memo` — Portal нь багана чирэх (pointermove бүрт setWidth), объект
 * сонгох зэрэг ЭНД хамаагүй төлөвөөр байнга дахин зурагддаг. Каталогийн
 * пропс тэр үед өөрчлөгддөггүй тул memo нь ~100 мөрийн дахин зуралтыг
 * бүрмөсөн алгасуулна (гацалтын гомдол, 2026-07-31).
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
  zone,
  embedded = false,
}: {
  /**
   * Аль харагдацын каталог вэ.
   * ⚠️ «Барилгын хяналт»-д хяналтын багц ЭХЭНД, дараа нь ЕТ-ийн багцууд —
   * тэнд гүйцэтгэлийн давхарга дээр контекст нэмэх нь ердийн хэрэглээ.
   * «ХАБЭА»-д аюулгүй байдлын багц ЭХЭНД, дараа нь хяналт + ЕТ (контекст).
   */
  view: 'plan' | 'monitor' | 'habea';
  totals: Async<Map<string, Totals>>;
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
  zone: string | null;
  /**
   * Порталын grid-ийн `cat` баганын оронд ХӨВӨГЧ панелийн дотор зурагдах уу.
   * ⚠️ Дашбоард/анализ дээр каталог нь газрын зургийг тойрсон хайрцагт хөвж
   * гарах тул баруун ирмэгийн зураас (`border-right`) илүүц болно.
   */
  embedded?: boolean;
}) {
  const groups = catalogGroups(view);
  /** Ортофото ил эсэх — газрын зурагтай нэг эх сурвалж (`MapProvider`) */
  const { ortho, setOrtho } = useMap();

  /**
   * Хураасан багцууд.
   *
   * ⚠️ Эхлэхэд БҮГД ХУРААГДСАН — БҮХ харагдацад (2026-07-31, хэрэглэгчийн
   * хүсэлт). 29 давхарга задгай байвал багана 2–3 дэлгэц болж, доод талын багц
   * гүйлгэхгүйгээр огт харагдахгүй — хэрэглэгч ямар САЛБАРУУД байгааг ерөөсөө
   * хараад амждаггүй. Хураангуй байдалд бүх багц нэг дэлгэцэд орж, «юу байгаа
   * вэ» гэдэг нь эхний хормын дотор мэдэгдэнэ; багцын нэр дарахад асч задарна.
   */
  const [shut, setShut] = useState<Set<string>>(
    () => new Set(groups.map((g) => g.key)),
  );

  /**
   * АНХНЫ (default) багц хэвээр байна уу — «Ерөнхий төлөвлөгөө»-ний нээлтийн
   * давхаргууд (`INITIAL_MAP_LAYERS`) яг тэр чигээрээ асаалттай төлөв.
   *
   * ⚠️ Хэрэглэгч анхны байдлаас ШИНЭ сонголт хийхэд default давхаргууд
   * УНТАРЧ, сонголт нь ОРЛОНО (2026-07-31, хэрэглэгчийн хүсэлт) — эс бөгөөс
   * барилга/зам/ногоон нь сонгосон давхаргыг дарж, «сонголт маань зурагт
   * нөлөөлсөнгүй» мэт харагдана. Portal-ын `untouched` (баруун самбарын
   * «сонгоогүй» төлөв) яг ижил харьцуулалт ашигладаг тул хоёул нэг мөч дээр
   * шилжинэ. Дараагийн сонголтууд ХЭВИЙН нэмэгдэнэ.
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

  const all = groups.flatMap((g) => g.ids);
  const onCount = visible.filter((id) => all.includes(id)).length;

  return (
    <aside className={`${s.drawer} ${embedded ? s.embedded : ''}`} aria-label={tr('Давхаргын жагсаалт')}>
      {/* Өргөн тохируулах бариул — баганын БАРУУН ирмэг дээр (зураг руу харсан) */}
      {onResizeStart && (
        <div
          className={`${s.grip} ${resizing ? s.gripOn : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label={tr('Жагсаалтын өргөн')}
          onPointerDown={onResizeStart}
          onDoubleClick={onResizeReset}
          title={tr('Чирж өргөсгөнө · давхар товшиж анхны хэмжээнд буцаана')}
        />
      )}

      <header className={s.head}>
        <div className={s.headText}>
          <span className={s.title}>{tr('Давхарга')}</span>
          <span className={s.sub}>
            {num(all.length)} {tr('нийт ·')} {num(onCount)} {tr('асаалттай')}
            {/* Тоо/хэмжээ хараахан татагдаж байгааг заана — ЖАГСААЛТ өөрөө хүлээхгүй */}
            {totals.state === 'loading' && <> {tr('· тоолж байна…')}</>}
            {/* ⚠️ Алдааг «—»-ээр нуухгүй (query.ts-ийн дүрэм) — юу болсныг хэлж,
                дахин оролдох гарц өгнө. Товч нь текстэн холбоос маягтай тул
                css модульд шинэ класс нэмэлгүй inline-аар зурав. */}
            {totals.state === 'error' && (
              <>
                {' · '}<em className={s.rowWarn}>{tr('тоо татагдсангүй')}</em>
                {totals.retry && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={totals.retry}
                      style={{ font: 'inherit', color: 'inherit', background: 'none', border: 0, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      {tr('дахин оролдох')}
                    </button>
                  </>
                )}
              </>
            )}
            {zone && <> · {zone}</>}
          </span>
        </div>
        <button
          type="button"
          className={s.close}
          onClick={() => setShut(shut.size ? new Set() : new Set(groups.map((g) => g.key)))}
          title={shut.size ? tr('Бүгдийг дэлгэх') : tr('Бүгдийг хураах')}
          aria-label={shut.size ? tr('Бүгдийг дэлгэх') : tr('Бүгдийг хураах')}
        >
          {shut.size ? '▸' : '▾'}
        </button>
        {!pinned && (
          <button type="button" className={s.close} onClick={onClose} aria-label={tr('Жагсаалтыг хаах')}>×</button>
        )}
      </header>

      <div className={s.body}>
        {/* БҮХ ДАВХАРГЫГ УНТРААХ — жагсаалтын хамгийн дээд, тусдаа том товч
            (хэрэглэгчийн хүсэлт: шууд нүдэнд харагдахуйц). Унтраах юмгүй үед
            бүдгэрнэ. */}
        <button
          type="button"
          className={s.allOff}
          disabled={onCount === 0}
          onClick={() => setVisible((prev) => prev.filter((id) => !all.includes(id)))}
        >
          <Icon name="layers" size={15} />
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

        {/**
         * ⚠️ ЖАГСААЛТЫГ `totals` хүлээлгэхгүй ШУУД зурна. Урьд нь бүх бие
         * `<Data q={totals}>`-д ороосон тул 29 давхаргын тоо БҮГД (6 зэрэгцээ =
         * хэдэн секунд) ирэх хүртэл каталог хоосон «тооцож байна…» гэж хүлээлгэдэг
         * байв. Нэр, симбол, бүлэг нь СТАТИК тул шууд харагдана; тоо/хэмжээ нь
         * мөр бүрд ирэх бүрд нь дүүрнэ (ачаалж байхад «…», алдвал «—»).
         */}
        {(() => {
          const map = totals.state === 'ready' ? totals.data : null;
          const loadingTotals = totals.state === 'loading';
          return (
            <>
              {groups.map((g) => {
                const ids = g.ids;
                const defs = ids.map((id) => LAYER_BY_ID[id]).filter(Boolean);
                const on = ids.filter((id) => visible.includes(id)).length;
                const open = !shut.has(g.key);

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
                        *
                        * ⚠️ Багц АЛЬ ХЭДИЙН бүрэн асаалттай бол унтраана — эс
                        * бөгөөс сонголтоо буцаах арга гарчгаас алга болно.
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
                          // (⚠️ toggleGroup: нэг ч асаагүй үед л асаана — түүнтэй ижил нөхцөл)
                          setOpenState(g.key, on === 0);
                        }}
                      >
                        <span className={s.groupIcon}><Icon name={g.icon} size={15} /></span>
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
                        ▾
                      </button>
                    </div>

                    {/* ⚠️ `hidden` атрибут БОЛОХГҮЙ: `.rows`-ын `display: flex`
                        нь UA-гийн `display: none`-ыг дардаг. Нөхцөлт рендер. */}
                    {open && (
                    <div className={s.rows}>
                      {defs.map((d) => {
                        const t = map?.get(d.id);
                        const isOn = visible.includes(d.id);
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
                              onClick={() => toggle(d.id)}
                            >
                              <span className={s.rowTitle}>{d.title}</span>
                              <span className={`${s.rowMeta} num`}>
                                {t ? tr('{0} ш', num(t.n)) : (loadingTotals ? '…' : '—')}
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
                              <Icon name="chart" size={13} />
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
      </div>

    </aside>
  );
});

/* ═════════════════ Ангиллын дэд мөрүүд ═════════════════ */

/**
 * Давхаргыг АНГИЛЛААРАА задалж каталогт дэд мөр болгоно.
 *
 * ⚠️ «Инженерийн бэлтгэл арга хэмжээ» гэдэг нэг мөр нь 180 объект, 18.4 км-ийг
 * нуудаг байв — дотор нь огт өөр арга хэмжээнүүд (хашаа, тэгшилгээ, далан…)
 * багтдаг ба нэгж үнэ нь 18–250 сая хүртэл ялгаатай. Каталогоос тэр задаргаа
 * харагдахгүй бол хэрэглэгч давхаргыг нээж, баруун самбар руу очиж байж л
 * мэднэ. Одоо зүүн баганаас шууд харагдаж, дарахад зурагт шүүгдэнэ.
 *
 * ⚠️ Дэд мөр нь ЧАГТ БИШ, ШҮҮЛТ: ArcGIS-д нэг давхаргын хэсгийг тусад нь
 * асаах/унтраах боломжгүй (давхарга бол нэгж). Тиймээс сонгосон төрөл нь
 * тодорч, бусад нь бүдгэрнэ — идэвхтэй шүүлт толгойн тэмдгээр харагдана.
 */
function FacetRows({
  d,
  zone,
  view,
  onNeedVisible,
}: {
  d: LayerDef;
  zone: string | null;
  view: 'plan' | 'monitor' | 'habea';
  /** Шүүхийн өмнө давхаргыг зурагт гаргана — унтарсан давхаргыг шүүх нь дэмий */
  onNeedVisible: () => void;
}) {
  const { toggle, isOn } = useFilter();
  const f = d.facets![0];
  const where = whereFor(d, zone);

  const q = useAsync(async () => {
    const rows = await queryGroup(layerUrl(d), f.field, layerStats(d), where);
    return groups(rows, f.field, tr('Бүртгэгдээгүй'), ['n', 'q'])
      .sort((a, b) => b.values.n - a.values.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id, where]);

  // ⚠️ Алдааг ЧИМЭЭГҮЙ null болгохгүй (query.ts-ийн дүрэм) — дэд мөрүүд дуугүй
  //    алга болбол хэрэглэгч задаргаа огт байхгүй гэж эндүүрнэ. Жижиг мөрөөр
  //    мэдэгдэж, дахин оролдох гарц өгнө.
  if (q.state === 'error') {
    return (
      <div className={s.facetRows}>
        <button type="button" className={s.facetRow} onClick={q.retry}>
          <span className={s.facetName}>{tr('Ангилал татагдсангүй — дахин оролдох')}</span>
        </button>
      </div>
    );
  }

  if (q.state !== 'ready' || q.data.length < 2) return null;

  return (
    <div className={s.facetRows}>
      {q.data.map((item) => {
        const key = `cat:${d.id}:${item.label}`;
        const on = isOn(key);
        const qty = qtyText(d, item.values.q);
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
                label: item.label,
                group: f.label,
                where: groupWhere(f.field, item),
                view,
                // ⚠️ ЗӨВХӨН энэ давхаргад — `Layer` талбар бусад давхаргад алга
                layerIds: d.id,
                color: d.hue,
              });
            }}
          >
            <span className={s.facetName}>{item.label}</span>
            <span className={`${s.facetMeta} num`}>
              {num(item.values.n)} ш{qty ? ` · ${qty}` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
