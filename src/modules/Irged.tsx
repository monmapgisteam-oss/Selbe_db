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
 * ⚠️ 2026-09-06 — ЧАРТЫН ШИЛЖИЛТ. Урьд нь энэ харагдац порталын бусад
 * хэсгээс ЯЛГААТАЙ байв: «ӨМНӨ» тал зөвхөн ГУРВАН ТОО (`Stat`), «ДАРАА» тал
 * бүхэлдээ `brief.ts`-ийн ХАТУУ мөрүүд. Үйлчилгээнүүдийг хэмжихэд гурван
 * бүлэг өгөгдөл ОГТ ХАРАГДАХГҮЙ байсныг илрүүлэв (`@/lib/irged`-ийн толгойг
 * үз). Одоо дашбоардын хэлээр — `Panel` + `Bars` — бүгд чарт болов.
 *
 * ⚠️ 1 ЧАРТ = 1 КАРТ (`Dashboard.tsx:2581`-ийн дүрэм: «чарт бүр НЭГ карт»).
 * Энэ дүрмийг 2026-09-06-нд ХОЁР удаа зөрчсөн бөгөөд хоёуланг нь хэрэглэгч
 * буцаав:
 *   1. Эрсдэлийн хэмжүүр бүрийг ТУСДАА картад БҮТЭН зэрэглэлээр (18 мөр,
 *      дөрвүүлээ ижил хэлбэртэй) — зүүн багана нэг л чарт мэт болов.
 *   2. Түүнийг зассан гэж тоо + чарт + чартыг НЭГ картад давхарлав — аль нь
 *      юуг хэлж буй нь ялгарахгүй болов.
 *   3. Чартыг салгасны дараа ч `Stats` сүлжээнд ХОЁР-ГУРВАН ӨӨР үзүүлэлт
 *      (жорлонгийн тоо · бохирдлын индекс · өрхийн тоо — гурван өөр
 *      үйлчилгээнээс) нэг картад хамт үлдэж байв.
 * Зөв нь: карт бүрд ГАНЦ зүйл — ганц тоо (`Stat`), ганц чарт (`Bars`/`Rows`)
 * эсвэл тайлбарын мөр. `Stats` сүлжээ энэ файлаас БҮРМӨСӨН гарсан.
 *
 * ⚠️ БҮХ ЧАРТ ШҮҮНЭ. Дашбоард/«Барилгын хяналт»-тай ИЖИЛ хэв маяг:
 * `useFilter().toggle` → `setHighlight` → зурагт таарахгүй объект бүдгэрч,
 * сонгосон руу нисне. Мөрийг дахин дарахад цуцална.
 *
 * ⚠️ Нүхэн жорлон, гэр хорооллын барилга нь `MapCanvas.PASSIVE` хэвээр —
 * ЗУРАГ ДЭЭР ДАРАХАД атрибут ГАРАХГҮЙ (хувийн хашаанд холбогдох мэдээлэл).
 * Энд гарч буй нь зөвхөн НЭГТГЭСЭН тоо: нэг цэгийн утга хэзээ ч харагдахгүй.
 *
 * ⚠️ Хоёр талын НИЙГМИЙН мөрүүд `@/lib/brief`-ийн `SOCIAL`-аас: тэр нь
 * «одоо байгаа» талыг агуулдаг цорын ганц эх сурвалж (амьд давхарга байхгүй).
 * Харин «ДАРАА» талын ХҮЧИН ЧАДАЛ одоо АМЬД (`loadSocPlanned`).
 *
 * ⚠️ 2026-08-14: SWIPE-ЫГ ХАСАВ (хэрэглэгчийн шийдвэр). `imagery` GroupLayer-ийг
 * `leadingLayers`-т оруулахад газрын зураг бүхэлдээ хоосон болдог байв.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { OpacityPanel } from '@/components/OpacityPanel';
import { LayerCatalog } from '@/components/LayerCatalog';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { usePlanTotals } from '@/lib/totals';
import { Bars, Data, Donut, Empty, Rows, Stat } from '@/components/ui';
import { HeadKpi, useBagtsTable } from '@/modules/Dashboard';
import { useAsync } from '@/lib/useAsync';
import { useFilter } from '@/lib/filter';
import { queryCount } from '@/lib/query';
import { BENEFITS, SOCIAL } from '@/lib/brief';
import { loadHeadline, loadHousing } from '@/lib/live';
import { loadGerBuilt, loadSocPlanned } from '@/lib/irged';
import {
  IRGED_BUILT, IRGED_BUILT_DEF, IRGED_ORTHO, IRGED_ROAD, IRGED_SCENE, IRGED_TOILET,
  LAYER_BY_ID, LAYER_GROUPS, PKG_BY_FAMILY, groupOf,
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
import o from './irgedOv.module.css';
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

/**
 * Бүлгийн түлхүүр → ХАРАГДАХ НЭР. Тайлбарын зурваст ижил өнгөтэй хэд хэдэн
 * давхаргыг нэг мөр болгоход хэрэглэнэ.
 *
 * ⚠️ `LAYER_GROUPS`-аас БОДОГДОНО, гараар жагсаахгүй — бүлэг нэмэгдэх/нэр
 * солигдоход энэ файл чимээгүй хоцрохгүй.
 */
const GROUP_TITLE: Record<string, string> = Object.fromEntries(
  LAYER_GROUPS.map((g) => [g.key, g.title]),
);

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

/** SQL string literal — дан хашилтыг давхарлана */
const sq = (v: string) => v.replace(/'/g, "''");

/**
 * ХАВТАН — Ерөнхий дашбоардын `Panel`-тай ЯГ ИЖИЛ бүтэц (`Dashboard.tsx:159`).
 *
 * ⚠️ ХУУЛБАРЛАСАН нь САНААТАЙ: `Dashboard`-ынх нь `dashboardOv.module.css`-ийн
 * `o`-г хаалттай (module scope) барьдаг тул экспортлоод ч энэ харагдацын
 * стайлаар зурагдахгүй. `irgedOv.module.css` нь `.panel`/`.panelHead`/
 * `.panelTitle`/`.panelNote`/`.panelBody`/`.envGrow` бүгдийг АЛЬ ХЭДИЙН
 * агуулдаг (2026-08-25-ны салгалтаас үлдсэн) — тэдгээр нь энэ өдрийг хүртэл
 * ашиглагдаагүй байв.
 */
function Panel({ title, note, grow, children }: {
  title?: string;
  note?: ReactNode;
  /** envhub баганад: үлдсэн зайг эзэлж, бие нь дотроо гүйнэ (`.envGrow`) */
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`${o.panel} ${i.card} ${grow ? o.envGrow : ''}`}>
      {title && (
        <header className={o.panelHead}>
          <h3 className={o.panelTitle}>{title}</h3>
          {note && <span className={o.panelNote}>{note}</span>}
        </header>
      )}
      <div className={o.panelBody}>{children}</div>
    </section>
  );
}

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

  /**
   * ЧАРТААС ЗУРАГ РУУ — порталын НЭГДСЭН шүүлт (`FilterProvider`).
   * ⚠️ Самбар өөрийн сонголтыг ХАДГАЛАХГҮЙ: идэвхтэй түлхүүрээс уншина
   * (`filter.tsx`-ийн тайлбар). Хоёр карт зэрэг «сонгогдсон» харагдахгүй.
   */
  const { toggle, active } = useFilter();
  const selOf = (prefix: string) =>
    active?.key.startsWith(prefix) ? active.key.slice(prefix.length) : null;

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
    /* ⚠️ Гэр хорооллын барилга нь ПОЛИГОН — 3D-д меш газрыг бүрхэх тул
       дотор нь алга болно (нийгмийн барилгатай ЯГ ижил шалтгаан). */
    const own = is2d ? [IRGED_TOILET.id, IRGED_BUILT.id, ...SOC_IDS] : [IRGED_TOILET.id];
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
   * татахгүй.
   *
   * ⚠️ 2026-09-06: Энд түр зуур ЭРСДЭЛИЙН ЗАГВАРЫН ачаалагч байсныг ХАСАВ.
   * `toilet/115` давхаргын `PLI_zone` · `Toilet_zon` · `Ground_wat` ·
   * `UB_Flood_r` талбаруудыг чарт болгосон боловч тэдгээрийн 1–5 зэрэглэл
   * ЮУ ГЭСЭН ҮГ болох нь ХААНА Ч БИЧЭЭГҮЙ: үйлчилгээний `description`,
   * талбарын `alias`, `domain` гурвуулаа хоосон, репод ч нэг мөр баримт алга.
   * «Бага/Дунд/Их/Маш их» гэсэн шошго, «дээд 2 зэрэглэл = эрсдэлтэй» гэсэн
   * тайлбар бүгд ТААМАГ байв — зэрэглэл өсөх тусам эрсдэл ихсэнэ гэдэг ч
   * батлагдаагүй. Утга нь тодорхойгүй тоог зурснаас зурахгүй нь дээр
   * (хэрэглэгчийн шийдвэр). Загварын тайлбар олдвол `git` түүхээс сэргээнэ.
   */
  const qToilet = useAsync<number>(() => queryCount(IRGED_TOILET.url), []);

  /**
   * ГЭР ХОРООЛЛЫН БАРИЛГА — төрөл тус бүрийн тоо БА ул мөрийн талбай.
   * ⚠️ Урьд нь ХОЁР `queryCount` явдаг байсныг НЭГ `groupBy` болгов: хүсэлт
   *    цөөрөөд талбайн мэдээлэл нэмэгдэв.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const qBuilt = useAsync(loadGerBuilt, []);

  /**
   * ТӨЛӨВЛӨСӨН НИЙГМИЙН БАЙГУУЛАМЖ — АМЬД хүчин чадал (`Huchin_chadal`).
   * ⚠️ Урьд нь «Дараа» талын БҮХ тоо `brief.ts`-ийн хатуу мөрөөс гардаг байв.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const qSoc = useAsync(loadSocPlanned, []);

  /**
   * АМЬД ХҮН АМ ба ӨРХ — `BENEFITS`-ийн `live` заалтыг гүйцэлдүүлнэ.
   *
   * ⚠️ 2026-09-06-ны ЗАСВАР: `BENEFITS`-ийн эхний мөр «44,518 иргэн» гэсэн
   * ХАТУУ тоо байсан бол ЯГ ДЭЭР НЬ буй `HeadKpi` зурвас амьд 43,287-г
   * харуулдаг байв — нэг дэлгэц дээр ХОЁР өөр хүн ам.
   *
   * ⚠️ Хоёулаа `cached` тул НЭМЭЛТ хүсэлт үүсэхгүй: `loadHeadline`-ыг
   * `HeadKpi` аль хэдийн дуудсан, `loadHousing` нь нүүр/тайлантай дундаа.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const qHead = useAsync(loadHeadline, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const qHousing = useAsync(loadHousing, []);

  /** `BENEFITS[].live` → амьд тоо. Хараахан ирээгүй бол `null` (хатуу утга үлдэнэ). */
  const liveBenefit = (k: 'population' | 'households'): number | null => {
    if (k === 'population') return qHead.state === 'ready' ? qHead.data.population : null;
    return qHousing.state === 'ready' ? qHousing.data.ail : null;
  };

  /** Толгойн үзүүлэлтэд — дашбоардтай ижил эх сурвалж */
  const bagts = useBagtsTable();

  /**
   * ТАЙЛБАРЫН ЗУРВАС — ИЖИЛ ӨНГӨТ давхаргуудыг НЭГ мөр болгоно.
   *
   * ⚠️ 2026-09-06: урьд нь ил давхарга бүр өөрийн мөртэй байв. Нийгмийн 10
   * багц (`PKG_HUE.soc`) БҮГД ИЖИЛ ногооноор зурагддаг тул зурвас дээр
   * ялгагдашгүй ЗУРГААН ногоон нүд «Багц 19.1 · Багц 19.2 · Багц 20.1 …» гэж
   * зэрэгцээд, өнгө нь юу ч заахаа больж, зургийн доод ирмэгийг иддэг байв.
   * Одоо ижил өнгөтэй бүлгийг «Нийгмийн барилга ×10» гэж НЭГ нүдээр өгнө —
   * тайлбар нь ЗУРАГ ДЭЭР ЯЛГАГДАХ зүйлийг л жагсаана.
   *
   * ⚠️ Нэрийг бүлгийн ЭХНИЙ давхаргын гарчгаас БИШ, `groupOf`-ийн бүлгийн
   * нэрээс авна: «Багц 19.1 · 960 хүүхдийн сургууль ×10» гэвэл үлдсэн есийг
   * нь тэр нэр буруу төлөөлнө.
   */
  const legend = useMemo(() => {
    const byHue = new Map<string, { hue: string; ids: string[] }>();
    for (const id of visible) {
      const L = LAYER_BY_ID[id];
      if (!L) continue;
      const cur = byHue.get(L.hue);
      if (cur) cur.ids.push(id);
      else byHue.set(L.hue, { hue: L.hue, ids: [id] });
    }
    return [...byHue.values()].map(({ hue, ids }) => {
      if (ids.length === 1) {
        return { hue, title: LAYER_BY_ID[ids[0]].title, n: 1 };
      }
      /**
       * ⚠️ Бүлгийн нэрийг ЗӨВХӨН ЭНЭ ӨНГӨНИЙ давхаргуудаас гаргана — бүх ил
       * давхаргаас эхний олдсоныг авбал (анхны хувилбарын алдаа) огт өөр
       * бүлгийн нэр наалдана.
       * ⚠️ Бүх гишүүн НЭГ бүлэгт харьяалагдаж байж л бүлгийн нэр өгнө; эс
       * бөгөөс өнгө нь санамсаргүй давхцсан гэсэн үг тул эхний давхаргын
       * гарчгийг үлдээнэ (худал ерөнхийлөхгүй).
       */
      const gs = new Set(ids.map((id) => groupOf(id)));
      const g = gs.size === 1 ? [...gs][0] : null;
      return {
        hue,
        title: (g && GROUP_TITLE[g]) || LAYER_BY_ID[ids[0]].title,
        n: ids.length,
      };
    });
  }, [visible]);
  const legendHidden = Math.max(0, legend.length - 8);

  const noop = useCallback(() => {}, []);

  const paint = IRGED_BUILT_DEF.paint?.values ?? {};

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

        {/**
          * ⚠️ 1 КАРТ = 1 ЗҮЙЛ. Энэ дүрмийг 2026-09-06-нд ГУРВАН удаа зөрчсөн:
          *   1. Эрсдэлийн хэмжүүр бүрийг ТУСДАА картад бүтэн зэрэглэлээр
          *      (18 мөр, дөрвүүлээ ижил хэлбэртэй) — багана нэг л чарт мэт.
          *   2. Түүнийг «зассан» гэж тоо + чартыг НЭГ картад давхарлав.
          *   3. Чартыг салгасны дараа ч Stats картад ХОЁР-ГУРВАН ӨӨР
          *      үзүүлэлт (жорлонгийн тоо · бохирдлын индекс · өрхийн тоо —
          *      гурван өөр үйлчилгээнээс) хамт үлдэж байв.
          * Одоо: карт бүрд ГАНЦ үзүүлэлт эсвэл ГАНЦ чарт.
          *
          * ⚠️ «Ашиглаж буй 8,575 өрх» нүд БҮРМӨСӨН ХАСАГДАВ — тэр тоо
          * зургийн ДЭЭД зурваст (`HeadKpi` → «Өрхийн орон сууц») аль хэдийн
          * байдаг. Нэг дэлгэц дээр хоёр удаа гарах шалтгаангүй.
          */}
        <Panel title={IRGED_TOILET.title} note={tr('гэр хороолол')}>
          <Data q={qToilet} loading={tr('Тоолж байна…')} minH={54}>
            {(n) => (
              <div className={i.solo}>
                <Stat value={num(n)} unit={tr('ш')} label={tr('Бүртгэгдсэн цэг')} />
              </div>
            )}
          </Data>
        </Panel>

        {/**
          * ⚠️ `Bars` БИШ `Donut` (хэрэглэгчийн хүсэлт, 2026-09-06). Хоёулаа
          * ХЭСЭГ↔БҮХЭЛ харьцаа: 6,627 барилгын хэдэн хувь нь гэр вэ гэдгийг
          * баганаас илүү бөгжөөр шууд уншина (тоо нь 11%, талбай нь 21% —
          * зөрүү нь бөгж дээр нүдэнд шууд харагдана).
          *
          * ⚠️ `leaders` — тайлбарыг зүсмэг тус бүрээс ЗУРААС татаж ГАДНА бичнэ
          * (дашбоардын «Ус хангамжийн эх үүсвэрийн чадал»-тай ЯГ ИЖИЛ хэлбэр,
          * `Dashboard.tsx:3274`). Зүсмэг ХОЁРХОН тул шошго хоорондоо
          * мөргөлдөхгүй; доод жагсаалт (`stack`) нь бөгжийг дэмий намхан
          * болгоод, картыг уртасгадаг байв.
          *
          * ⚠️ Хоёр төрлийг ТУСАД НЬ. Нийлбэрийг ганц тоо болговол «6,627
          * барилга» гэдэг нь гэр ба байшинг ялгахгүй — чөлөөлөлт, нүүлгэн
          * шилжүүлэлтийн зардал хоёрт нь ЭРС өөр.
          */}
        <Panel title={tr('Одоогийн барилга')} note={tr('ш · төрлөөр')}>
          <Data q={qBuilt} loading={tr('Тоолж байна…')} minH={220}>
            {(rows) => (
              <Donut
                size={140}
                width={22}
                leaders
                center={num(rows.reduce((t, b) => t + b.n, 0))}
                centerLabel={tr('барилга')}
                selected={selOf('irged:builtN:')}
                onSelect={(k) => {
                  const b = rows.find((x) => x.type === k);
                  if (!b) return;
                  toggle({
                    key: `irged:builtN:${k}`,
                    label: tr('Одоогийн барилга: {0}', tr(k)),
                    group: tr('Гэр хороолол'),
                    where: `${IRGED_BUILT.typeField} = N'${sq(k)}'`,
                    view: 'irged',
                    layerIds: IRGED_BUILT.id,
                    color: paint[k],
                  });
                }}
                items={rows.map((b) => ({
                  key: b.type,
                  label: tr(b.type),
                  value: b.n,
                  /* ⚠️ Өнгө нь ЗААВАЛ (`Donut` нь `color` шаардана) — давхаргын
                     `paint`-аас, зурагтай яг ижил. Утга олдохгүй бол давхаргын
                     үндсэн өнгө. */
                  color: paint[b.type] ?? IRGED_BUILT_DEF.hue,
                  display: tr('{0} ш', num(b.n)),
                }))}
              />
            )}
          </Data>
        </Panel>

        {/* ⚠️ ТАЛБАЙН бөгж — `Shape__Area` нь үйлчилгээнд байсаар атал огт
            харагддаггүй байв. Тоо ба талбай ХОЁР ӨӨР зураг өгнө: гэр нь
            тоогоороо 11% ч талбайгаараа 21%. Хоёр бөгжийг зэрэгцүүлэн харахад
            тэр зөрүү шууд уншигдана — тиймээс ХОЁУЛАА бөгж.
            ⚠️ Дундаж ул мөрийг шошгонд үлдээв: «Гэр 77.2 м²» нь «Байшин
            38.3 м²»-ээс хоёр дахин том гэдэг нь эх өгөгдлийн сануулга
            (гэрийн полигон нь гэр биш, хашаа/тавцан бололтой). */}
        <Panel title={tr('Барилгажсан талбай')} note={tr('м² · төрлөөр')}>
          <Data q={qBuilt} loading={tr('Тоолж байна…')} minH={220}>
            {(rows) => (
              <Donut
                size={140}
                width={22}
                leaders
                /**
                  * ⚠️ ЗҮСМЭГ БҮРИЙГ ДУГУЙРУУЛСНЫ ДАРАА нэмнэ — түүхий нийлбэрийг
                  * дугуйруулбал БИШ. Түүхий утга нь 225,150.585 + 58,307.789 =
                  * 283,458.374 → «283,458», гэтэл дэлгэц дээрх хоёр зүсмэг нь
                  * «225,151» ба «58,308» буюу нийлээд 283,459 гэж уншигдана.
                  * Нэг эсийн зөрүү ч гэсэн «голын тоо мөрүүдийнхээ нийлбэр биш»
                  * гэсэн уншилт өгнө. Тиймээс ХАРАГДАХ утгуудаас нь бодно.
                  */
                center={num(rows.reduce((t, b) => t + Math.round(b.areaM2), 0))}
                centerLabel={tr('м²')}
                selected={selOf('irged:built:')}
                onSelect={(k) => {
                  const b = rows.find((x) => x.type === k);
                  if (!b) return;
                  toggle({
                    key: `irged:built:${k}`,
                    label: tr('Барилгажсан талбай: {0}', tr(k)),
                    group: tr('Гэр хороолол'),
                    where: `${IRGED_BUILT.typeField} = N'${sq(k)}'`,
                    view: 'irged',
                    layerIds: IRGED_BUILT.id,
                    color: paint[k],
                  });
                }}
                items={rows.map((b) => ({
                  key: b.type,
                  label: b.avgM2 == null
                    ? tr(b.type)
                    : tr('{0} · дундаж {1} м²', tr(b.type), num(b.avgM2, 1)),
                  value: b.areaM2,
                  color: paint[b.type] ?? IRGED_BUILT_DEF.hue,
                  display: tr('{0} м²', num(b.areaM2)),
                }))}
              />
            )}
          </Data>
        </Panel>

        {/* «Дараа» талын «Байгууламж — дараа» карттай ЯГ ИЖИЛ загвар, НЭГ
            хэмжүүр (`SOC_MAX`) — хоёр багананы баганыг зэрэгцүүлэн харахад
            өсөлт шууд уншигдана. Шошгод эх текстийг нь бүтнээр («2 (1,440)»)
            үлдээв: хүчин чадлын мэдээлэл хаягдахгүй.
            ⚠️ Мөр бүрийн өнгө заахгүй — envhub-д өгөгдлийн ГАНЦ өнгө
            (`Bars`-ын анхдагч var(--data)); ангиллыг дараалал нь ялгана.
            ⚠️ ШҮҮЛТГҮЙ: эдгээр нь ОДОО БАЙГАА байгууламж бөгөөд порталын ямар ч
            давхаргад зурагддаггүй (`brief.ts` мета). Шүүх товч өгвөл дарахад
            зурагт юу ч болохгүй — худал амлалт. */}
        <Panel title={tr('Байгууламж — өмнө')} note={`${SOCIAL.totals.now} ${tr('байгууламж')}`}>
          <Bars
            max={SOC_MAX}
            items={SOCIAL.rows.map((r) => ({
              key: r.label,
              label: r.label,
              value: headCount(r.now),
              display: r.now,
            }))}
          />
        </Panel>

        {/* ⚠️ 2026-09-06: Хамрах хүрээ/хүчин чадлын ТАЙЛБАРЫН карт УСТГАВ
            (хэрэглэгчийн шийдвэр). «5,220 сурагч, 1,840 хүүхэд · 39,635 м² ·
            цэцэрлэг 300 м …» гэсэн зургаан мөр бичвэр нь чарт биш, KPI ч биш —
            зүүн багананы төгсгөлд уншигдахгүй хэвтэж байв. Хүчин чадлын тоо
            «Төлөвлөсөн хүчин чадал» чартад амьдаар задарсан хэвээр. */}
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
          {/* ⚠️ `opacity` ЗААВАЛ энд ч дамжина. `MapCanvas` нь тунгалагийг
              ЗӨВХӨН энэ prop-оор дардаг (MapCanvas.tsx: `const over = opacity ?? {}`)
              тул урьд нь гулсуурын утга зөвхөн `OpacityPanel`-ийн төлөвт хадгалагдаж,
              зураг дээр ОГТ нөлөөлдөггүй байв — хэрэглэгч давхарга ачаалагдаагүй
              гэж боддог. Бусад 9 харагдац хоёуланд нь дамжуулдаг. */}
          <MapCanvas
            dim={dim}
            visible={visible}
            opacity={opacity}
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
            {legend.slice(0, 8).map((e) => (
              <span key={e.hue} className={o.legendItem} title={e.title}>
                <i style={{ background: e.hue }} />
                {e.n > 1 ? tr('{0} ×{1}', e.title, String(e.n)) : e.title}
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

        {/* ⚠️ «Нийгмийн дэд бүтэц» Stats карт (Нийт болно 21 · Шинээр 12)
            ХАСАГДАВ: доорх чартын `note` нь «21 байгууламж» гэж хэлж,
            баганууд нь задаргааг нь харуулж байхад тэр хоёр тоо НЭМЭЛТ
            мэдээлэл өгөхгүй, зөвхөн нэг картад хоёр өөр үзүүлэлт нэмж байв. */}
        {/* «Өмнө» талын ижил нэртэй карттай ЯГ ИЖИЛ загвар, НЭГ хэмжүүр
            (`SOC_MAX`) — хоёр чартын баганыг зэрэгцүүлэн харахад өсөлт шууд
            уншигдана. */}
        <Panel title={tr('Байгууламж — дараа')} note={`${SOCIAL.totals.total} ${tr('байгууламж')}`}>
          <Bars
            max={SOC_MAX}
            items={SOCIAL.rows.map((r) => ({
              key: r.label,
              label: r.label,
              value: r.total,
              display: String(r.total),
            }))}
          />
        </Panel>

        {/**
          * ТӨЛӨВЛӨСӨН БАЙГУУЛАМЖИЙН АМЬД ХҮЧИН ЧАДАЛ.
          *
          * ⚠️ Дээрх карттай ДАВХАРДАХГҮЙ: тэр нь `brief.ts`-ийн ӨМНӨ↔ДАРАА
          * ТООН харьцуулалт (одоо байгааг агуулдаг цорын ганц эх сурвалж), энэ
          * нь төлөвлөсөн барилгын АМЬД атрибут (хүчин чадал, талбай, давхар).
          * Хоёр нь бие биенээ шалгана: сургууль 3,780 · цэцэрлэг 1,200 гэсэн
          * `Huchin_chadal`-ийн нийлбэр нь `SOCIAL.rows.add`-тай ЯГ таарч байгаа
          * нь хатуу мөрүүд хараахан хуучраагүйн баталгаа.
          */}
        <Panel title={tr('Төлөвлөсөн хүчин чадал')} note={tr('зориулалтаар')}>
          <Data q={qSoc} loading={tr('Татаж байна…')} minH={120}>
            {(rows) => (rows.length ? (
              <Bars
                selected={selOf('irged:soc:')}
                onSelect={(k) => {
                  const r = rows.find((x) => x.purpose === k);
                  if (!r) return;
                  /* ⚠️ `where` нь `1=1`: бүлгийн БҮХ объект хэрэгтэй бөгөөд
                     давхарга бүр 1–2 мөртэй тул атрибутаар шүүх утгагүй.
                     Ашиг нь `FilterProvider`-ийн НИСЛЭГ — сонгосон
                     байгууламжууд руу зураг ойртоно (`zoomToWhere`). */
                  toggle({
                    key: `irged:soc:${k}`,
                    label: tr('Төлөвлөсөн: {0}', tr(k)),
                    group: tr('Нийгмийн дэд бүтэц'),
                    where: '1=1',
                    view: 'irged',
                    layerIds: r.layerIds,
                  });
                }}
                items={rows.map((r) => ({
                  key: r.purpose,
                  /* ⚠️ 2026-09-06: ТАЛБАЙН чарт ТУСДАА карт байсныг энд уусгав —
                     хоёр чарт ЯГ ижил мөртэй, ижил дараалалтай, зөвхөн хэмжүүр нь
                     өөр байсан тул баруун багана хоёр дахин урсаж, шинэ мэдээлэл
                     нэмэгддэггүй байв. Одоо талбай/давхар нь шошгонд орно. */
                  label: r.floors == null
                    ? tr('{0} · {1} ш', tr(r.purpose), num(r.n))
                    : tr('{0} · {1} ш · {2} давхар', tr(r.purpose), num(r.n), num(r.floors)),
                  /* ⚠️ Чадалгүй мөрийг 0 гэж зурахгүй — багана нь хоосон
                     үлдэж, утга нь талбайгаа л хэлнэ (`null ≠ 0`). */
                  value: r.capacity ?? 0,
                  display: r.capacity == null
                    ? tr('{0} м²', num(r.floorArea))
                    : tr('{0} · {1} м²', num(r.capacity), num(r.floorArea)),
                }))}
              />
            ) : <Empty label={tr('Төлөвлөсөн байгууламж олдсонгүй')} />)}
          </Data>
        </Panel>

        {/**
          * ⚠️ `Stats` БИШ `Rows` (2026-09-06). `Stat` нь БОГИНО шошгонд
          * зориулагдсан: шошго нь uppercase eyebrow, тооноос ДЭЭР, 26px
          * нөөцөлсөн (`ui.module.css` → `.statLabel`). `BENEFITS`-ийн мөрүүд
          * нь шошго БИШ, БҮТЭН ӨГҮҮЛБЭР («иргэн орчин үеийн орон сууц,
          * төвлөрсөн инженерийн хангамжтай болно») тул тэнд 4–5 мөр болж
          * дэлгэрч, тоо нь өөрийн тайлбарын доор жижигхэн үлдэж байв —
          * унших дараалал урвуу. `Rows` нь эсрэгээрээ: өгүүлбэр зүүн талдаа
          * хумигдаж мөр дамжина, ТОО баруун талдаа бүтнээр үлдэнэ.
          */}
        <Panel title={tr('Иргэдийн амьдралын чанар')}>
          <Rows
            items={BENEFITS.map((b) => {
              /* ⚠️ `live` заалттай мөр АМЬД утгаар солигдоно. Тэр туг
                 2026-08-13-наас хойш зарлагдсан атлаа ХЭН Ч уншдаггүй байсан
                 тул мөрүүд хатуу хэвээр үлдэж, ЯГ дээрх `HeadKpi` зурвастай
                 зөрдөг байв (44,518 ↔ амьд 43,287).
                 ⚠️ Амьд утга ирээгүй байхад ХАТУУ утгыг харуулна — «…» гэж
                 хоослох нь энэ карт бүхэлдээ анивчихад хүргэнэ. */
              const v = b.live ? liveBenefit(b.live) : null;
              return {
                key: b.text,
                value: <>{v == null ? b.value : num(v)}{b.unit ? ' ' + b.unit : ''}</>,
              };
            })}
          />
        </Panel>
      </div>
    </div>
  );
}
