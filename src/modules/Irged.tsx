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
import { Empty } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { HeadKpi, useBagtsTable } from '@/modules/Dashboard';
import { useAsync } from '@/lib/useAsync';
import { queryCount } from '@/lib/query';
import { SOCIAL } from '@/lib/brief';
import { loadGerBuilt } from '@/lib/irged';
import {
  COAL_T_PER_HH, N_KG_PER_PERSON, PERSONS_PER_HH, PM25_KG_PER_T_COAL,
  SLUDGE_M3_PER_PERSON, latrineLoad, stoveLoad,
} from '@/lib/bohirdol';
import {
  IRGED_BUILT, IRGED_BUILT_MAP_HUE, IRGED_ORTHO, IRGED_ROAD, IRGED_SCENE, IRGED_TOILET,
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
 * ХАВТАН — Ерөнхий дашбоардын `Panel`-тай ЯГ ИЖИЛ бүтэц (`Dashboard.tsx:159`).
 *
 * ⚠️ ХУУЛБАРЛАСАН нь САНААТАЙ: `Dashboard`-ынх нь `dashboardOv.module.css`-ийн
 * `o`-г хаалттай (module scope) барьдаг тул экспортлоод ч энэ харагдацын
 * стайлаар зурагдахгүй. `irgedOv.module.css` нь `.panel`/`.panelHead`/
 * `.panelTitle`/`.panelNote`/`.panelBody`/`.envGrow` бүгдийг АЛЬ ХЭДИЙН
 * агуулдаг (2026-08-25-ны салгалтаас үлдсэн) — тэдгээр нь энэ өдрийг хүртэл
 * ашиглагдаагүй байв.
 */
/**
 * ГИНЖ — «эх → шалтгаан → үр дагавар» гурван алхам, хооронд нь сум.
 *
 * ⚠️ Жүүр (трапец) БИШ: трапецийн өргөн нь хэмжээ заадаг мэт хуурмаг уншилт
 * өгдөг байв — гурван алхам нь ГУРВАН ӨӨР НЭГЖТЭЙ (ш · м³ · тн) тул хооронд
 * нь харьцуулах боломжгүй. Гинж нь зөвхөн ДАРААЛЛЫГ хэлнэ, хэмжээг огт
 * дүрслэхгүй — тоо нь өөрсдөө ярина.
 *
 * ⚠️ SVG биш, CSS flex: текст хөтчийн жинхэнэ рендерээр гарч, нарийн баганад
 * өөрөө мөр дамжина. SVG дотор текст масштаблагдахдаа бүдгэрдэг.
 */
function Chain({ steps }: {
  steps: { key: string; value: string; unit: string; label: string; icon: string; end?: true }[];
}) {
  return (
    <div className={i.chain}>
      {steps.map((s) => (
        <div key={s.key} className={`${i.chainStep} ${s.end ? i.chainEnd : ''}`}>
          {/* Дүрсний тэмдэг — гинжний зангилаа. Холбогч шугам нь эдгээрийн
              ТӨВӨӨР дамжина (`.chainStep::before`), тиймээс тусдаа сум
              хэрэггүй: шугам өөрөө дарааллыг хэлнэ. */}
          <span className={i.chainIcon} aria-hidden="true">
            <Icon name={s.icon} size={16} />
          </span>
          <span className={i.chainVal}>
            {s.value}
            <em className={i.chainUnit}>{s.unit}</em>
          </span>
          <span className={i.chainTag}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

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

  const is2d = dim === '2d';

  /**
   * ЭНЭ ЦОНХНЫ СУУРЬ — ортофото, зам, ба сэдвийн хоёр давхарга. Каталогийн
   * «Иргэдэд хүрэх үр өгөөж» бүлэг яг эдгээрийг удирдана (`IRGED_LAYER_IDS`).
   *
   * ⚠️ Суурьт байгаа нь «анхнаасаа асаалттай» гэсэн үг — `useLayerPicks` нь
   * каталогоос унтраасныг `off`-д бичдэг тул чагтаа авахад хэвийн унтарна.
   *
   * ⚠️ 2026-09-17: Нийгмийн барилга ба гэр хорооллын барилга 3D-д Ч асаалттай.
   * Урьд нь зөвхөн 2D-д байсан шалтгаан («меш газрыг бүрхэх тул полигон дотор
   * нь алга болно») арилсан: `MapCanvas` одоо 3D-д каталогийн давхаргыг
   * `relative-to-scene` өндрийн горимоор МЕШИЙН ГАДАРГУУ дээр байрлуулна.
   *
   * ⚠️ Ортофото нь 2D-д ҮЛДЭНЭ: `MapCanvas` нь сонголт ХООСОН үед
   * `BASE_MAP_IDS`-ийн 14 суурь давхаргыг бүгдийг асаадаг — бүх чагтыг авбал
   * ортофотогийн оронд тэдгээр гарч ирнэ. 3D-д тэр нь мешийн ДООР үлдэх тул
   * утгагүй (меш өөрөө газрын гадаргууг бүрэн орлоно).
   */
  const base = useMemo(() => {
    const own = [IRGED_TOILET.id, IRGED_BUILT.id, ...SOC_IDS];
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
  const qBuilt = useAsync(loadGerBuilt, []);


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
    /**
     * ⚠️ ГЭР ХОРООЛЛЫН БАРИЛГА нь ЗУРАГ ДЭЭР ХОЁР ӨНГӨТЭЙ (`Type` талбараар:
     * байшин · гэр) атлаа каталогид НЭГ `hue`-тэй тул тайлбарт «Одоогийн
     * барилга (гэр хороолол)» гэсэн ГАНЦ мөр, түүнд огт тохирохгүй ягаан
     * дөрвөлжинтэй гарч байв — зураг дээрх хоёр өнгө юу гэсэн үг нь
     * тайлбараас олдохгүй. Тиймээс энэ давхаргыг хоёр мөр болгож задална.
     */
    const out: { hue: string; title: string; n: number }[] = [];
    const rest: string[] = [];
    for (const id of visible) {
      if (id === IRGED_BUILT.id) {
        for (const t of [IRGED_BUILT.types.house, IRGED_BUILT.types.ger]) {
          out.push({ hue: IRGED_BUILT_MAP_HUE[t], title: tr(t), n: 1 });
        }
        continue;
      }
      rest.push(id);
    }

    const byHue = new Map<string, { hue: string; ids: string[] }>();
    for (const id of rest) {
      const L = LAYER_BY_ID[id];
      if (!L) continue;
      const cur = byHue.get(L.hue);
      if (cur) cur.ids.push(id);
      else byHue.set(L.hue, { hue: L.hue, ids: [id] });
    }
    return [...out, ...[...byHue.values()].map(({ hue, ids }) => {
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
    })];
  }, [visible]);
  const legendHidden = Math.max(0, legend.length - 8);

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

        {/**
          * ГЭРИЙН ЗУУХНЫ УТАА — PM2.5, тн/жил.
          *
          * ⚠️ ГУРВАН БАГАНА нь ГУРВАН ХУВИЛБАР: одоогийн уламжлалт зуух ·
          * сайжруулсан зуух (улсын батламжийн дээд хязгаараар) · төвлөрсөн
          * дулаан. Ингэснээр «зуух сольсон ч 48 тн үлдэнэ, төвлөрсөн дулаан л
          * тэгд хүргэнэ» гэдэг нь нэг харцаар уншигдана — тоон жагсаалт
          * (өмнөх хувилбар) үүнийг хэлж чаддаггүй байв.
          *
          * ⚠️ БҮГД НЭГ НЭГЖТЭЙ (тн/жил). Нүүрсний хэмжээ (42,875 тн) ба өрхөд
          * ногдох дүн (52 кг) нь өөр нэгжтэй тул чартад ОРОХГҮЙ — доорх
          * тайлбар мөрөнд үлдэнэ.
          */}
        <Panel title={tr('Гэрийн зуухны утаа')} note={tr('PM2.5 · тн/жил · тооцоолол')}>
          {(() => {
            /* ⚠️ ТӨЛӨВЛӨГӨӨТ өрхийн тоо (`loadHousing` → `AIL_TOO`, 8,575) ЭНД
               ХЭРЭГЛЭХГҮЙ — тэр нь шинэ орон сууцанд орох өрх. «Өмнө» талын
               суурь нь ОДОО байгаа зуухтай орон сууц: гэр + гэр хорооллын
               байшин (`Irgeded_hureh_ur_uguuj`, амьд `groupBy`). */
            const hh = qBuilt.state === 'ready'
              ? qBuilt.data.reduce((t, x) => t + x.n, 0)
              : null;
            const s = hh == null ? null : stoveLoad(hh);
            if (!s) return <Empty label={tr('Тооцоолж байна…')} />;
            return (
              <>
                <Chain
                  steps={[
                    { key: 'hh', value: num(hh), unit: tr('гэр, байшин'), label: tr('нүүрсний зуухаар халаана'), icon: 'building' },
                    { key: 'coal', value: num(s.coalT), unit: tr('тн'), label: tr('түүхий нүүрс жилд шатаана'), icon: 'flame' },
                    { key: 'pm', value: num(s.pm25T), unit: tr('тн'), label: tr('PM2.5 агаарт ялгарна'), icon: 'waves', end: true },
                  ]}
                />
                <p className={i.chartNote}>
                  {tr('өрх тутам 5 тн нүүрс · 650 мг PM2.5/МЖ (уламжлалт зуух, SEET лаб 2014) · нэг өрхөд {0} кг',
                    num(s.pm25KgPerHh))}
                </p>
              </>
            );
          })()}
        </Panel>

        {/**
          * НҮХЭН ЖОРЛОНГИЙН БОХИРДОЛ — хөрсөнд нэвчих АЗОТ, тн/жил.
          *
          * ⚠️ Азотыг сонгосон шалтгаан: эзэлхүүн (м³) нь «хэр их хуримтлагдав»
          * гэдгийг хэлдэг ч ХОР УРШИГ нь азот — битүүмжлэлгүй нүхнээс хөрсөнд,
          * улмаар гүний усанд НИТРАТ болж нэвчиж, худгийн ус бохирдуулдаг.
          * Эзэлхүүн ба жорлонгийн тоо нь доорх тайлбар мөрөнд.
          */}
        <Panel title={tr('Нүхэн жорлонгийн бохирдол')} note={tr('азот · тн/жил · тооцоолол')}>
          {(() => {
            /* ⚠️ Суурь нь БҮРТГЭГДСЭН ЖОРЛОНГИЙН ТОО — нэг жорлонг нэг өрх
               хэрэглэдэг тул хүн ам нь тэрхүү тоо × өрхийн дундаж хэмжээ.
               Орон сууцны нийт тоог өгвөл нэг нүхэнд 14 хүн ногдох бодит бус
               тоо гарна (6,627 × 3.6 ÷ 1,675). */
            const pits = qToilet.state === 'ready' ? qToilet.data : null;
            const l = pits == null ? null : latrineLoad(pits);
            if (!l) return <Empty label={tr('Тооцоолж байна…')} />;
            return (
              <>
                <Chain
                  steps={[
                    { key: 'pit', value: num(pits), unit: tr('ш'), label: tr('битүүмжлэлгүй нүхэн жорлон'), icon: 'pin' },
                    { key: 'sludge', value: num(l.sludgeM3), unit: tr('м³'), label: tr('ялгадас жилд хуримтлагдана'), icon: 'trash' },
                    { key: 'n', value: num(l.nitrogenT), unit: tr('тн'), label: tr('азот хөрс, гүний усанд'), icon: 'droplet', end: true },
                  ]}
                />
                <p className={i.chartNote}>
                  {tr('нэг жорлон = нэг өрх · {0} хүн (өрхийн дундаж 3.6, ҮСХ) × 4.5 кг N (Jönsson 2004)',
                    num(l.pop))}
                </p>
              </>
            );
          })()}
        </Panel>

        {/**
          * НЭГ ОРОН СУУЦАНД НОГДОХ — дээрх хоёр картын ижил коэффициентийг
          * НЭГЖ рүү буулгасан хувилбар.
          *
          * ⚠️ ШИНЭ таамаг НЭМЭХГҮЙ: 33,135 тн ба 345 тн-ыг 6,627-д, ялгадас ба
          * азотыг 1,675 жорлонд хуваасан утгууд. Нийт дүн нь «хот даяар хэр их
          * вэ» гэж хэлдэг ч «миний гэрт энэ хэр хамаатай вэ» гэдэгт хариулдаггүй
          * тул эрчмийн үзүүлэлт нэмэв.
          *
          * ⚠️ ЗӨВХӨН ӨМНӨХ байдал — төлөвлөгөөт барилга, хүн ам, өрхийн тоо
          * энэ баганад ОГТ орохгүй (хэрэглэгчийн шийдвэр, 2026-09-17).
          */}
        <Panel title={tr('Нэг өрхийн ялгаруулах бохирдол')} note={tr('жилд · тооцоолол')}>
          <div className={i.factList}>
            <div className={i.fact}>
              <p className={i.factHead}>
                <span className={i.factTag}>{tr('Түүхий нүүрс')}</span>
                <span className={i.factDash}>—</span>
                <span className={i.factVal}>
                  {num(COAL_T_PER_HH)}
                  <em className={i.factUnit}>{tr('тн')}</em>
                </span>
              </p>
              <p className={i.factTxt}>{tr('халаалт, хоолны зуухны жилийн хэрэглээ · Дэлхийн банк (ASTAE), 2012')}</p>
            </div>
            <div className={i.fact}>
              <p className={i.factHead}>
                <span className={i.factTag}>{tr('PM2.5 ялгарал')}</span>
                <span className={i.factDash}>—</span>
                <span className={i.factVal}>
                  {num(COAL_T_PER_HH * PM25_KG_PER_T_COAL)}
                  <em className={i.factUnit}>{tr('кг')}</em>
                </span>
              </p>
              <p className={i.factTxt}>{tr('уламжлалт зуух 650 мг/МЖ × 16 МЖ/кг · SEET лаб, 2014')}</p>
            </div>
            <div className={i.fact}>
              <p className={i.factHead}>
                <span className={i.factTag}>{tr('Ялгадас')}</span>
                <span className={i.factDash}>—</span>
                <span className={i.factVal}>
                  {num(PERSONS_PER_HH * SLUDGE_M3_PER_PERSON, 2)}
                  <em className={i.factUnit}>{tr('м³')}</em>
                </span>
              </p>
              <p className={i.factTxt}>{tr('3.6 хүн × 0.05 м³ · WHO/SuSanA норм (40–60 л/хүн/жил)')}</p>
            </div>
            <div className={i.fact}>
              <p className={i.factHead}>
                <span className={i.factTag}>{tr('Азот')}</span>
                <span className={i.factDash}>—</span>
                <span className={i.factVal}>
                  {num(PERSONS_PER_HH * N_KG_PER_PERSON, 1)}
                  <em className={i.factUnit}>{tr('кг')}</em>
                </span>
              </p>
              <p className={i.factTxt}>{tr('3.6 хүн × 4.5 кг N · Jönsson & Vinnerås, 2004')}</p>
            </div>
          </div>
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
          {/* ⚠️ Гурван нэмэлт нүд — гэр хорооллын БОДИТ тоо (`extra`).
              Зүүн баганад тусдаа карт байсныг 2026-09-17-нд ЭНД зөөв: тэдгээр
              нь зурвасын бусад үзүүлэлттэй ЯГ ижил төрлийн тоо тул нэг эгнээнд
              байх нь зөв (хэрэглэгчийн шийдвэр). Тоонууд АМЬД. */}
          <HeadKpi
            bagts={bagts}
            extra={[
              {
                v: qBuilt.state === 'ready'
                  ? num(qBuilt.data.find((x) => x.type === IRGED_BUILT.types.house)?.n ?? 0)
                  : '…',
                unit: tr('ш'),
                label: tr('Байшин'),
              },
              {
                v: qBuilt.state === 'ready'
                  ? num(qBuilt.data.find((x) => x.type === IRGED_BUILT.types.ger)?.n ?? 0)
                  : '…',
                unit: tr('ш'),
                label: tr('Гэр'),
              },
              {
                v: qToilet.state === 'ready' ? num(qToilet.data) : '…',
                unit: tr('ш'),
                label: tr('Нүхэн жорлон'),
              },
            ]}
          />
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
        {/* ⚠️ «Нийгмийн дэд бүтэц» Stats карт (Нийт болно 21 · Шинээр 12)
            ХАСАГДАВ: доорх чартын `note` нь «21 байгууламж» гэж хэлж,
            баганууд нь задаргааг нь харуулж байхад тэр хоёр тоо НЭМЭЛТ
            мэдээлэл өгөхгүй, зөвхөн нэг картад хоёр өөр үзүүлэлт нэмж байв. */}
        {/**
          * НИЙГМИЙН БАЙГУУЛАМЖ — ТӨСЛИЙН ӨӨРИЙН ИНФОГРАФИКИЙН БҮТЭЦ.
          *
          * ⚠️ Хэрэглэгчийн өгсөн эх загвар (2026-09-17): төрөл бүр нь
          *   · НИЙТ тоо — том, зүүн талд, доор нь багтаамж;
          *   · «Одоо байгаа» ба «шинээр» ХОЁР мөр, тус бүр 7 нүдтэй нэгжийн
          *     зурвас (дүүрсэн нүд = тоо), баруун талд нь бичвэр задаргаа.
          * Ингэснээр «хэд байснаа хэд болох» нь ХОЁР ТУСДАА мөрөөр харагдана —
          * урьдын нэг мөрт хольсон хувилбарт «одоо» ба «шинэ» нь нэг эгнээнд
          * нийлж, аль нь аль вэ гэдэг зөвхөн өнгөөр ялгарч байв.
          *
          * ⚠️ Нүдний тоо ТОГТМОЛ 7 — эх загвартай ижил. Бүх төрөл нэг хэмжүүрт
          * болж, мөрүүд босоо тэнхлэгээр эгнэнэ. 7-оос их утга гарвал (одоогоор
          * хамгийн их нь 5) илүүдлийг тоогоор нь хэлнэ.
          */}
        <Panel
          title={tr('Нийгмийн байгууламж')}
          note={tr('{0} → {1}', SOCIAL.totals.now, String(SOCIAL.totals.total))}
        >
          <div className={i.socList}>
            {SOCIAL.rows.map((r) => {
              const now = headCount(r.now);
              const add = headCount(r.add);
              /* «2 (1,440)» → «1,440». Хаалт доторх багтаамж байхгүй мөр бий. */
              const cap = (v: string) => /\(([^)]+)\)/.exec(v)?.[1] ?? null;
              const dots = (k: number) => Array.from({ length: 7 }, (_, n) => (
                <i key={n} className={n < k ? i.socOn : i.socOff} />
              ));
              return (
                <div key={r.label} className={i.socBlock}>
                  <div className={i.socHead}>
                    <b className={i.socTotal}>{r.total}</b>
                    <span className={i.socName}>{r.label}</span>
                  </div>
                  <div className={i.socLine}>
                    <span className={i.socWhen}>{tr('Одоо байгаа')}</span>
                    <span className={i.socDots}>{dots(now)}</span>
                    <span className={i.socFact}>
                      {now ? <b>{now}</b> : <em>—</em>}
                      {cap(r.now) && <em>{tr('{0} хүн', cap(r.now)!)}</em>}
                    </span>
                  </div>
                  <div className={i.socLine}>
                    <span className={i.socWhen}>{tr('шинээр')}</span>
                    <span className={i.socDots}>{dots(add)}</span>
                    <span className={i.socFact}>
                      {add ? <b>{add}</b> : <em>—</em>}
                      {cap(r.add) && <em>{tr('{0} хүн', cap(r.add)!)}</em>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/**
          * ХАМРАХ ХҮРЭЭ — ЯВГАН АЛХАХ ХУГАЦААНЫ ШУГАМ.
          *
          * ⚠️ Цагираг ба зурвас хоёулаа МЕТРийг дүрсэлдэг. Гэтэл төслийн
          * амлалт нь «20 минутын хот» — иргэний хувьд хэмжүүр нь МЕТР биш
          * ХУГАЦАА. Тиймээс нормативын радиусыг явган алхах минут болгож,
          * 20 минутын шугам дээр байрлуулав: гурвуулаа шугамын эхний
          * хагаст багтаж байгаа нь амлалтын биелэлтийг шууд харуулна.
          *
          * ⚠️ Хугацаа = радиус ÷ 83 м/мин (явган алхалтын дундаж 5 км/ц).
          * ⚠️ Байрлал нь ХУВИАР (`left: %`) тул ямар ч өргөнд шугам эвдрэхгүй.
          */}
        <Panel title={tr('Хамрах хүрээ')} note={tr('явган алхах хугацаа · БНбД 30.01.03')}>
          <div className={i.walkV}>
            {/* ⚠️ БОСОО шугам: хэвтээ хувилбарт гурван шошго («Цэцэрлэг»,
                «Сургууль», «Өрхийн эмнэлэг») 4, 6, 9 минутын ойрхон цэгүүд
                дээр зэрэгцэж, үсэг нь давхцаж уншигдахаа больсон байв. Босоо
                тэнхлэгт мөр бүр ӨӨРИЙН өндөрт суух тул хэчнээн урт нэр ч
                хөршөө халхлахгүй. */}
            <div className={i.walkLine}>
              <i className={i.walkFill} />
              {[
                { key: 'kinder', m: 300, label: tr('Цэцэрлэг') },
                { key: 'school', m: 500, label: tr('Сургууль') },
                { key: 'clinic', m: 750, label: tr('Өрхийн эмнэлэг') },
              ].map((r) => {
                const min = r.m / 83;
                return (
                  <span key={r.key} className={i.walkStop} style={{ top: `${(min / 20) * 100}%` }}>
                    <b>{Math.round(min)}</b>
                    <em>{tr('мин')}</em>
                    <span className={i.walkTag}>{r.label}</span>
                    <span className={i.walkM}>{tr('{0} м', String(r.m))}</span>
                  </span>
                );
              })}
            </div>
            <div className={i.walkEnd}>{tr('20 минутын хотын хязгаар')}</div>
          </div>
          <p className={i.chartNote}>
            {tr('Нормативын радиусыг (БНбД 30.01.03) явган алхах хугацаа болгов — 83 м/мин буюу 5 км/ц. Гурвуулаа «20 минутын хот»-ын амлалтын эхний хагаст багтана.')}
          </p>
        </Panel>


      </div>
    </div>
  );
}
