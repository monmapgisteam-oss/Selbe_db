'use client';

/**
 * ИРГЭДЭД ХҮРЭХ ҮР ӨГӨӨЖ — ӨМНӨ / ДАРАА харьцуулалт, зураг нь дунд нь.
 *
 *   ┌─────────────┬──────────────────────────┬─────────────────┐
 *   │ ӨМНӨ        │ Толгойн үзүүлэлт (5)     │ ДАРАА           │
 *   │ одоо байгаа ├──────────────────────────┤ төлөвлөсөн      │
 *   │             │ Газрын зураг             │                 │
 *   │             │ Давхарга·2D/3D/BIM·Бүс   │                 │
 *   └─────────────┴──────────────────────────┴─────────────────┘
 *
 * ⚠️ Хоёр талын тоо БҮГД `@/lib/brief`-ийн НЭГ эх сурвалжаас: `SOCIAL` мөр бүр
 * `now`/`add`/`total` гэсэн бүтэцтэй тул «өмнө → дараа» гэдэг нь өгөгдөлдөө
 * аль хэдийн байгаа. Энд зөвхөн ХОЁР БАГАНАД ялган харуулж байна — тоог
 * дахин бичээгүй, тооцоолоогүй.
 *
 * ⚠️ Дашбоардын `BenefitDetail`-ыг бүтнээр нь дахин ашиглахаа больсон: тэр нь
 * өмнө/дараагаа НЭГ хавтанд нийлүүлж харуулдаг тул энэ хуваалтад таарахгүй.
 * Гэхдээ эх сурвалж нь ижил хэвээр (`brief.ts`) — тоо хоёр цонхонд салангид
 * амьдрахгүй.
 *
 * ⚠️ 2026-08-14: SWIPE-ЫГ ХАСАВ (хэрэглэгчийн шийдвэр). `imagery` GroupLayer-ийг
 * `leadingLayers`-т оруулахад газрын зураг бүхэлдээ хоосон болдог байв.
 */

import { useCallback, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { OpacityPanel } from '@/components/OpacityPanel';
import { LayerCatalog } from '@/components/LayerCatalog';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { usePlanTotals } from '@/lib/totals';
import { Bars, Data, Stat, Stats } from '@/components/ui';
import { HeadKpi, useBagtsTable } from '@/modules/Dashboard';
import { useAsync } from '@/lib/useAsync';
import { queryCount } from '@/lib/query';
import { BENEFITS, HEADLINE, SOCIAL } from '@/lib/brief';
import {
  IRGED_ORTHO, IRGED_ROAD, IRGED_SCENE, IRGED_TOILET, LAYER_BY_ID, PKG_BY_FAMILY,
} from '@/lib/services';
import { num } from '@/lib/format';
/**
 * ⚠️ 2026-08-18: envhub хэл рүү шилжив. Хавтан нь Ерөнхий дашбоардын envhub
 * Box (`overview.module.css` → `panel`/`panelHead`/`panelTitle`/`panelNote`/
 * `panelBody`) — surface + hairline, сүүдэргүй. Урьд нь «Газар чөлөөлөлт»-ийн
 * ӨНГӨТ хавтанг (gazar.module.css) авдаг байсныг болив: «Өмнө» улбар шар,
 * «Дараа» цэнхэр гэсэн өнгөт identity бүрмөсөн устаж, хоёр багана одоо ЯГ ИЖИЛ
 * карт болов — ялгаа нь зөвхөн ГАРЧГИЙН ҮГЭНД.
 */
import o from './overview.module.css';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import i from './irged.module.css';

/**
 * НИЙГМИЙН ДЭД БҮТЦИЙН давхаргууд — сургууль, цэцэрлэг, соёл, спорт
 * (Багц 19–21). Дашбоардын 09-р хэсэгтэй ЯГ ижил эх сурвалж
 * (`PKG_BY_FAMILY.soc`) — гараар жагсаавал `PKG_TABLE` өөрчлөгдөхөд чимээгүй
 * хоцорно.
 *
 * ⚠️ ЗӨВХӨН 2D-д. 3D нь IntegratedMesh буюу ӨМНӨХ бодит байдал бөгөөд
 * төлөвлөсөн барилгыг тэнд буулгавал «юу нь байгаа, юу нь төлөвлөгөө» гэдэг
 * ялгаа алдагдана.
 */
const SOC_IDS = PKG_BY_FAMILY.soc ?? [];

/* ⚠️ 2026-08-23: Урьд нь энд `TOGGLES` гэсэн ХОЁР чагтын жагсаалт байв (жорлон,
   нийгмийн дэд бүтэц) бөгөөд каталогийн ДЭЭР гараар зурагддаг байлаа. Тэр нь
   нэг цонхонд давхаргын ХОЁР ӨӨР удирдлага (энгийн `<input type=checkbox>` vs
   каталогийн мөр/симбол/тоо) зэрэгцүүлж, замбараагүй болгож байсан тул
   каталогт «Иргэдэд хүрэх үр өгөөж» бүлэг (`IRGED_GROUP`) болж НЭГТГЭГДСЭН.
   Эдгээр давхарга одоо доорх `base`-д орж, анхнаасаа АСААЛТТАЙ хэвээр байна. */

/**
 * Чагтаас үл хамааран ҮРГЭЛЖ ил давхарга — зам нь ортофототой адил СУУРЬ
 * (хэрэглэгчийн шийдвэр: унтраах утгагүй сонголт харуулахгүй).
 */
const ALWAYS = [IRGED_ROAD.id];

/**
 * «Одоо байгаа» тооны ТЕКСТЭЭС баганын уртыг гаргана: `"2 (1,440)"` → 2,
 * `"—"` → 0.
 *
 * ⚠️ `SOCIAL.rows.now` нь ТООН талбар БИШ — «2 (1,440)» гэж байгууламжийн тоо
 * ба хүчин чадлыг ХАМТ агуулсан текст (`brief.ts`). Баганын урт нь тоо
 * шаарддаг тул эхний бүхэл тоог нь салгаж авна; ХАРУУЛАХДАА эх текстийг нь
 * бүтнээр нь үлдээнэ — хүчин чадлын мэдээлэл хаягдахгүй.
 */
const headCount = (s: string) => Number(/^\s*(\d+)/.exec(s)?.[1] ?? 0);

/**
 * Хоёр чартын НИЙТЛЭГ дээд хязгаар.
 *
 * ⚠️ ЗААВАЛ хуваалцана: тус тусдаа бодуулбал зүүн талын «2» баруун талын «5»-тай
 * ижил урттай зурагдаж, өсөлт огт мэдэгдэхгүй болно. Нэг хэмжүүр байж л
 * «өмнө → дараа» харьцуулалт үнэн болно.
 */
const SOC_MAX = Math.max(...SOCIAL.rows.map((r) => r.total));

export function Irged({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  /** Талын багануудын өргөн — чирж тохируулна, хөтөчид хадгалагдана. */
  const side = useSideResize('irged');
  /** «Давхарга» жагсаалт нээлттэй эсэх (бусад цонхтой ижил зан төлөв) */
  const [layerOpen, setLayerOpen] = useState(false);
  /** Бүсийн шүүлт — toolbar-ын «Бүс» хэрэглүүр */
  const [zone, setZone] = useState<string | null>(null);
  /** Тунгалагийн хавтан ба давхарга тус бүрийн opacity (`MapTools`-ийн «Тунгалаг») */
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  useZoomToFilter({ zone });

  const is2d = dim === '2d';

  /**
   * ЭНЭ ЦОНХНЫ СУУРЬ — ортофото, зам, ба сэдвийн хоёр давхарга. Каталогийн
   * «Иргэдэд хүрэх үр өгөөж» бүлэг яг эдгээрийг удирдана (`IRGED_LAYER_IDS`).
   *
   * ⚠️ Суурьт байгаа нь «анхнаасаа асаалттай» гэсэн үг — `useLayerPicks` нь
   * каталогоос унтраасныг `off`-д бичдэг тул чагтаа авахад хэвийн унтарна.
   *
   * ⚠️ Нийгмийн барилга ЗӨВХӨН 2D-д — 3D-д меш газрыг бүрхэх тул полигон нь
   * дотор нь алга болно (урьдын зан төлөв хэвээр).
   *
   * ⚠️ 2D-д ортофото ҮРГЭЛЖ жагсаалтад: `MapCanvas` нь сонголт ХООСОН үед
   * `BASE_MAP_IDS`-ийн 14 суурь давхаргыг бүгдийг асаадаг — бүх чагтыг авбал
   * ортофотогийн оронд тэдгээр гарч ирнэ.
   */
  const base = useMemo(() => {
    const own = is2d ? [IRGED_TOILET.id, ...SOC_IDS] : [IRGED_TOILET.id];
    return is2d ? [IRGED_ORTHO.id, ...ALWAYS, ...own] : [...ALWAYS, ...own];
  }, [is2d]);

  /**
   * ⚠️ 2026-08-20: Дээрх нь СУУРЬ (энэ цонхны түүх — ортофото, зам, чагтууд);
   * дээр нь порталын БҮХ давхаргаас каталогоор нэмнэ (`useLayerPicks`).
   */
  const [visible, setVisible] = useLayerPicks(base);
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const catTotals = usePlanTotals(zone, layerOpen);

  /**
   * НҮХЭН ЖОРЛОНГИЙН ТОО — ЗӨВХӨН тоолно (`returnCountOnly`), нэг ч атрибут
   * татахгүй. Энэ нь «ӨМНӨ» талын цорын ганц АМЬД тоо.
   */
  const qToilet = useAsync<number>(() => queryCount(IRGED_TOILET.url), []);

  /** Толгойн үзүүлэлтэд — дашбоардтай ижил эх сурвалж */
  const bagts = useBagtsTable();

  /** Тайлбарт багтаагүй давхаргын тоо («+N») */
  const legendHidden = useMemo(
    () => Math.max(0, visible.filter((id) => LAYER_BY_ID[id]).length - 8),
    [visible],
  );

  const noop = useCallback(() => {}, []);

  return (
    /* Талын багануудыг чирж өргөсгөх/нарийсгах бариулууд. */
    <div
      ref={side.hostRef}
      className={`${i.frame} ${side.hostClass}`}
      style={side.style}
    >
      <SplitGrip {...side.left} />
      <SplitGrip {...side.right} />
      {/* ══════════ ӨМНӨ — одоогийн байдал ══════════ */}
      <div className={i.left}>
        {/* Баганын толгой — хоёр баганад ЯГ ИЖИЛ eyebrow, ялгаа нь зөвхөн ҮГ */}
        <h3 className={`eyebrow ${i.colHd}`}>{tr('Өмнө')}</h3>

        <section className={`${o.panel} ${i.card}`} aria-label={tr('Нүхэн жорлон')}>
          <header className={o.panelHead}>
            <h3 className={o.panelTitle}>{IRGED_TOILET.title}</h3>
          </header>
          <div className={o.panelBody}>
            <Data q={qToilet} loading={tr('Тоолж байна…')}>
              {(n) => (
                <Stats cols={2}>
                  {/* ⚠️ envhub: индикаторын тоо var(--ink) — акцент өнгө байхгүй */}
                  <Stat value={num(n)} unit={tr('ш')} label={tr('Бүртгэгдсэн')} />
                  {/* ⚠️ Тоог ЭНД бичихгүй — `HEADLINE.households` нь толгойн
                      үзүүлэлт, нүүр хуудас, тайлан гурвын ижил эх сурвалж. */}
                  <Stat
                    value={num(HEADLINE.households)}
                    unit={tr('өрх')}
                    label={tr('Гэрийн зуух, жорлонтой')}
                  />
                </Stats>
              )}
            </Data>
          </div>
        </section>

        <section className={`${o.panel} ${i.card}`} aria-label={tr('Одоо байгаа нийгмийн байгууламж')}>
          <header className={o.panelHead}>
            <h3 className={o.panelTitle}>{tr('Нийгмийн дэд бүтэц')}</h3>
            <span className={o.panelNote}>{SOCIAL.totals.now} {tr('байгууламж')}</span>
          </header>
          <div className={o.panelBody}>
            {/* «Дараа» талтай ЯГ ИЖИЛ загвар — ялгаа нь зөвхөн утга.
                Шошгод эх текстийг нь бүтнээр («2 (1,440)») үлдээв.
                ⚠️ Мөр бүрийн өнгө заахгүй — envhub-д өгөгдлийн ГАНЦ өнгө
                (`Bars`-ын анхдагч var(--data)); ангиллыг дараалал нь ялгана. */}
            <Bars
              inline
              max={SOC_MAX}
              items={SOCIAL.rows.map((r) => ({
                key: r.label,
                label: r.label,
                value: headCount(r.now),
                display: r.now,
              }))}
            />
            <p className={i.note}>{SOCIAL.note}</p>
          </div>
        </section>
      </div>

      {/* ══════════ ТӨВ — ҮЗҮҮЛЭЛТ + ГАЗРЫН ЗУРАГ (дашбоардын .center шиг) ══════════ */}
      <main className={i.mapCol}>
        {/* Толгойн таван үзүүлэлт — зургийн ДЭЭД зурваст, «Өмнө»/«Дараа»
            баганын толгойтой НЭГ шугамд зэрэгцэнэ. */}
        <div className={i.kpi}>
          <HeadKpi bagts={bagts} />
        </div>

        {/**
          * ЗУРГИЙН ХҮРЭЭ — toolbar, каталог, тайлбар гурвуулаа ЭНД зангидна.
          *
          * ⚠️ Эдгээр нь `position: absolute` (overview.module.css) тул хамгийн
          * ойрын `relative` эцгээсээ хэмжигдэнэ. Энэ хүрээгүй бол тэд БҮХ
          * баганаас (үзүүлэлтийн зурвас оруулаад) хэмжигдэж, toolbar нь
          * үзүүлэлтийн дээр гарч бүрхдэг байв.
          */}
        <div className={i.mapBox}>
          <MapCanvas
            dim={dim}
            visible={visible}
            zone={zone}
            uniform
            scene={IRGED_SCENE.layers}
            onPick={noop}
          />

          {/* Toolbar — бусад цонхтой ЯГ ИЖИЛ (нэгдсэн `MapTools`) */}
          <MapTools
            dim={dim}
            setDim={setDim}
            layersOpen={layerOpen}
            onLayers={() => setLayerOpen((v) => !v)}
            opacityOpen={opOpen}
            onOpacity={() => setOpOpen((v) => !v)}
            zone={zone}
            setZone={setZone}
          />

          {layerOpen && (
            <div className={`${o.catPanel} ${i.catPanel}`}>
              {/**
                * ⚠️ 2026-08-23: Энэ цонхны өөрийн давхаргууд (`irged:toilet`,
                * Багц 19–21) одоо каталогийн ХАМГИЙН ДЭЭД бүлэг болж орсон тул
                * дээр байсан гараар зурсан хоёр чагт ХАСАГДСАН — давхаргын
                * удирдлага НЭГ л газар, бусад цонхтой ижил хэлбэртэй боллоо.
                */}
              <LayerCatalog
                view="irged"
                totals={catTotals}
                visible={visible}
                setVisible={setVisible}
                selected={layerSel}
                onSelect={setLayerSel}
                onClose={() => setLayerOpen(false)}
                zone={zone}
                embedded
              />
            </div>
          )}

          {opOpen && (
            <OpacityPanel
              visible={visible}
              opacity={opacity}
              setOpacity={setOpacity}
              onClose={() => setOpOpen(false)}
            />
          )}

          {/* Тайлбар — зурагт БОДИТ харагдаж буй давхаргууд (дашбоардтай ижил).
              ⚠️ Эхний 8-ыг л жагсаана: Багц 19–21 нь 10 гаруй давхарга бөгөөд
                 бүгдийг бичвэл тайлбар нь зургийг иднэ. */}
          <div className={o.legend}>
            {visible
              .map((id) => LAYER_BY_ID[id])
              .filter((L) => L != null)
              .slice(0, 8)
              .map((L) => (
                <span key={L.id} className={o.legendItem} title={L.title}>
                  <i style={{ background: L.hue }} />{L.title}
                </span>
              ))}
            {legendHidden > 0 && <span className={o.legendMore}>+{legendHidden}</span>}
          </div>
        </div>
      </main>

      {/* ══════════ ДАРАА — төлөвлөсөн ══════════ */}
      <div className={i.right}>
        {/* Баганын толгой — зүүнтэй ЯГ ИЖИЛ eyebrow, ялгаа нь зөвхөн ҮГ */}
        <h3 className={`eyebrow ${i.colHd}`}>{tr('Дараа')}</h3>

        <section className={`${o.panel} ${i.card}`} aria-label={tr('Нийгмийн дэд бүтэц')}>
          <header className={o.panelHead}>
            <h3 className={o.panelTitle}>{tr('Нийгмийн дэд бүтэц')}</h3>
            <span className={o.panelNote}>{SOCIAL.totals.total} {tr('байгууламж')}</span>
          </header>
          <div className={o.panelBody}>
            <Stats cols={2}>
              <Stat value={num(SOCIAL.totals.total)} unit={tr('ш')} label={tr('Нийт болно')} />
              <Stat value={SOCIAL.totals.add} unit={tr('ш')} label={tr('Шинээр нэмэгдэнэ')} />
            </Stats>
            {/* «Өмнө» талтай ЯГ ИЖИЛ загвар, НЭГ хэмжүүр (`SOC_MAX`) — хоёр
                чартын баганыг зэрэгцүүлэн харахад өсөлт шууд уншигдана. */}
            <Bars
              inline
              max={SOC_MAX}
              items={SOCIAL.rows.map((r) => ({
                key: r.label,
                label: r.label,
                value: r.total,
                display: String(r.total),
              }))}
            />
          </div>
        </section>

        <section className={`${o.panel} ${i.card}`} aria-label={tr('Иргэдийн амьдралын чанар')}>
          <header className={o.panelHead}>
            <h3 className={o.panelTitle}>{tr('Иргэдийн амьдралын чанар')}</h3>
          </header>
          <div className={o.panelBody}>
            {/* ⚠️ `Stats` нь 2/3/4 багана л дэмжинэ — нарийн баганад 2 тохирно */}
            <Stats cols={2}>
              {BENEFITS.map((b) => (
                <Stat
                  key={b.value + b.text}
                  value={b.value}
                  unit={b.unit}
                  label={b.text}
                />
              ))}
            </Stats>
          </div>
        </section>
      </div>
    </div>
  );
}
