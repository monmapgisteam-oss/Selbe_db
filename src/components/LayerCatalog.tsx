'use client';

import {
  useState,
  type CSSProperties, type Dispatch, type SetStateAction,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Icon } from './Icon';
import { LayerSwatch } from './LayerSwatch';
import { Data } from './ui';
import { useAsync, type Async } from '@/lib/useAsync';
import type { Totals } from '@/lib/totals';
import { qtyText, whereFor, layerStats } from '@/lib/totals';
import { useFilter } from '@/lib/filter';
import { queryGroup, groups, groupWhere } from '@/lib/query';
import { catalogGroups, LAYER_BY_ID, layerUrl, type LayerDef } from '@/lib/services';
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
 * Мөр бүр ХОЁР үйлдэлтэй:
 *   · чагт — зурагт харуулах/нуух (багана нээлттэй хэвээр)
 *   · нэр  — баруун самбарт тэр давхаргын дашбоард нээгдэнэ
 */
export function LayerCatalog({
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
}: {
  /**
   * Аль харагдацын каталог вэ.
   * ⚠️ «Барилгын хяналт»-д хяналтын багц ЭХЭНД, дараа нь ЕТ-ийн багцууд —
   * тэнд гүйцэтгэлийн давхарга дээр контекст нэмэх нь ердийн хэрэглээ.
   */
  view: 'plan' | 'monitor';
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
}) {
  const groups = catalogGroups(view);

  /**
   * Хураасан багцууд.
   *
   * ⚠️ Эхлэхэд БҮГД ХУРААГДСАН. 29 давхарга задгай байвал багана 2–3 дэлгэц
   * болж, доод талын багц гүйлгэхгүйгээр огт харагдахгүй — хэрэглэгч ямар
   * САЛБАРУУД байгааг ерөөсөө хараад амждаггүй. Хураангуй байдалд 10 багц бүхэлдээ
   * (эсвэл багахан гүйлгэлтээр) нэг дэлгэцэд орж, «юу байгаа вэ» гэдэг нь эхний
   * хормын дотор мэдэгдэнэ; хэрэгтэй багцаа дараад л задална.
   */
  /**
   * ⚠️ Хураангуй эхлэл нь ЗӨВХӨН «Ерөнхий мэдээлэл»-д. «Барилгын хяналт» нь
   * өөр хүний хэсэг бөгөөд тэнд каталог нь товчоор түр нээгддэг туслах цонх —
   * нээгээд дахин задлах алхам нэмэх нь тэр урсгалыг удаашруулна.
   */
  const [shut, setShut] = useState<Set<string>>(
    () => (view === 'plan' ? new Set(groups.map((g) => g.key)) : new Set()),
  );

  const toggle = (id: string) =>
    setVisible((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /** Багц бүхэлдээ — нэг ч асаагүй бол бүгдийг асаана, эс бөгөөс бүгдийг унтраана */
  const toggleGroup = (ids: string[]) =>
    setVisible((prev) =>
      ids.every((id) => !prev.includes(id))
        ? [...prev, ...ids.filter((id) => !prev.includes(id))]
        : prev.filter((id) => !ids.includes(id)),
    );

  /** Багцыг задлах/хураах — нэг газарт */
  const setOpenState = (key: string, open: boolean) =>
    setShut((prev) => {
      const next = new Set(prev);
      if (open) next.delete(key); else next.add(key);
      return next;
    });

  /**
   * ⚠️ Шинэ зан үйл (гарчиг = багц сонгох, хураангуй эхлэл, тусдаа сум) нь
   * ЗӨВХӨН «Ерөнхий мэдээлэл»-д. «Барилгын хяналт» нь хуучнаараа: гарчиг
   * хураана, тоолуурын товч багцыг асаана.
   */
  const isPlan = view === 'plan';

  const all = groups.flatMap((g) => g.ids);
  const onCount = visible.filter((id) => all.includes(id)).length;

  return (
    <aside className={s.drawer} aria-label="Давхаргын жагсаалт">
      {/* Өргөн тохируулах бариул — баганын БАРУУН ирмэг дээр (зураг руу харсан) */}
      {onResizeStart && (
        <div
          className={`${s.grip} ${resizing ? s.gripOn : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="Жагсаалтын өргөн"
          onPointerDown={onResizeStart}
          onDoubleClick={onResizeReset}
          title="Чирж өргөсгөнө · давхар товшиж анхны хэмжээнд буцаана"
        />
      )}

      <header className={s.head}>
        <div className={s.headText}>
          <span className={s.title}>Давхарга</span>
          <span className={s.sub}>
            {num(all.length)} нийт · {num(onCount)} асаалттай
            {zone && <> · {zone}</>}
          </span>
        </div>
        <button
          type="button"
          className={s.close}
          onClick={() => setShut(shut.size ? new Set() : new Set(groups.map((g) => g.key)))}
          title={shut.size ? 'Бүгдийг дэлгэх' : 'Бүгдийг хураах'}
          aria-label={shut.size ? 'Бүгдийг дэлгэх' : 'Бүгдийг хураах'}
        >
          {shut.size ? '▸' : '▾'}
        </button>
        {!pinned && (
          <button type="button" className={s.close} onClick={onClose} aria-label="Жагсаалтыг хаах">×</button>
        )}
      </header>

      <div className={s.body}>
        <Data q={totals} loading="Үзүүлэлт тооцож байна…">
          {(map) => (
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
                        * Гарчиг дарахад багц БҮХЭЛДЭЭ сонгогдож, баруун самбарт
                        * түүний чартууд гарна. Мөн жагсаалт нь задарна.
                        *
                        * ⚠️ Урьд нь гарчиг ЗӨВХӨН хураадаг байв — багцын өгөгдлийг
                        * баруун талд гаргах цорын ганц арга нь баруун захын жижиг
                        * «0/6» товч байсан бөгөөд түүнийг тоолуур гэж уншсан хүн
                        * дарж үздэггүй байлаа. Одоо гол үйлдэл гол товчин дээр.
                        *
                        * ⚠️ Багц АЛЬ ХЭДИЙН бүрэн асаалттай бол унтраана — эс
                        * бөгөөс сонголтоо буцаах арга гарчгаас алга болно.
                        */}
                      <button
                        type="button"
                        aria-expanded={open}
                        className={s.groupToggle}
                        title={
                          !isPlan ? undefined
                            : on === ids.length ? 'Багцын сонголтыг цуцлах' : 'Багцыг бүхэлд нь сонгох'
                        }
                        onClick={() => {
                          if (!isPlan) { setOpenState(g.key, !open); return; }
                          toggleGroup(ids);
                          // Сонгосон багцын мөрүүд нүдэнд харагдах ёстой
                          if (on !== ids.length) setOpenState(g.key, true);
                        }}
                      >
                        <span className={s.groupIcon}><Icon name={g.icon} size={15} /></span>
                        <span className={s.groupTitle}>{g.title}</span>
                        {/* Хяналтын харагдацад сум нь гарчгийн ДОТОР — хуучин байдал */}
                        {!isPlan && (
                          <span className={`${s.groupCaret} ${open ? s.groupCaretOpen : ''}`} aria-hidden>▾</span>
                        )}
                      </button>

                      {/**
                        * Тоолуур. «Ерөнхий мэдээлэл»-д зөвхөн ТӨЛӨВ заана (сонголт
                        * нь гарчиг дээр шилжсэн); «Барилгын хяналт»-д ХУУЧНААР
                        * багцыг асаадаг товч хэвээр.
                        */}
                      {isPlan ? (
                        <span className={`${s.groupBtn} num`}>{on}/{ids.length}</span>
                      ) : (
                        <button
                          type="button"
                          className={s.groupBtn}
                          onClick={() => toggleGroup(ids)}
                          title={on === 0 ? 'Багцыг бүхэлд нь асаах' : 'Багцыг бүхэлд нь унтраах'}
                        >
                          {on}/{ids.length}
                        </button>
                      )}

                      {/* ⚠️ Хураах/дэлгэх нь ТУСДАА товч — зөвхөн «Ерөнхий мэдээлэл»-д,
                          учир нь тэнд гарчиг өөрөө багцыг сонгодог болсон. */}
                      {isPlan && (
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={open ? `${g.title} — жагсаалтыг хураах` : `${g.title} — жагсаалтыг дэлгэх`}
                          title={open ? 'Жагсаалтыг хураах' : 'Жагсаалтыг дэлгэх'}
                          className={`${s.groupCaret} ${open ? s.groupCaretOpen : ''}`}
                          onClick={() => setOpenState(g.key, !open)}
                        >
                          ▾
                        </button>
                      )}
                    </div>

                    {/* ⚠️ `hidden` атрибут БОЛОХГҮЙ: `.rows`-ын `display: flex`
                        нь UA-гийн `display: none`-ыг дардаг. Нөхцөлт рендер. */}
                    {open && (
                    <div className={s.rows}>
                      {defs.map((d) => {
                        const t = map.get(d.id);
                        const isOn = visible.includes(d.id);
                        const q = t ? qtyText(d, t.q) : null;
                        return (
                          <div
                            key={d.id}
                            className={`${s.row} ${d.catalogFacet ? s.rowFacet : ''} ${isOn ? s.rowOn : ''} ${selected === d.id ? s.rowSel : ''}`}
                            style={{ '--tone': d.hue } as CSSProperties}
                          >
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isOn}
                              aria-label={`${d.title} — зурагт харуулах`}
                              className={s.check}
                              onClick={() => toggle(d.id)}
                            >
                              <svg viewBox="0 0 12 12" width="10" height="10">
                                <path d="M2 6.2 4.6 8.8 10 3.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>

                            {/* Симбол — газрын зурагтай ижил. Тайлбарын хайрцаг
                                хассан тул өнгө↔давхаргын холбоо ЭНД байна. */}
                            <LayerSwatch d={d} />

                            <button
                              type="button"
                              aria-pressed={selected === d.id}
                              className={s.rowMain}
                              onClick={() => onSelect(d.id)}
                            >
                              <span className={s.rowTitle}>{d.title}</span>
                              <span className={`${s.rowMeta} num`}>
                                {t ? `${num(t.n)} ш` : '—'}
                                {q ? ` · ${q}` : ''}
                                {zone && d.noZone && <em className={s.rowWarn}> · бүсгүй</em>}
                              </span>
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
          )}
        </Data>
      </div>

    </aside>
  );
}

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
  view: 'plan' | 'monitor';
  /** Шүүхийн өмнө давхаргыг зурагт гаргана — унтарсан давхаргыг шүүх нь дэмий */
  onNeedVisible: () => void;
}) {
  const { toggle, isOn } = useFilter();
  const f = d.facets![0];
  const where = whereFor(d, zone);

  const q = useAsync(async () => {
    const rows = await queryGroup(layerUrl(d), f.field, layerStats(d), where);
    return groups(rows, f.field, 'Бүртгэгдээгүй', ['n', 'q'])
      .sort((a, b) => b.values.n - a.values.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id, where]);

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
