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
 */

import { useMemo, useState, type ReactNode } from 'react';
import { t as tr, perLocale } from '@/lib/i18nCore';
import { MapCanvas, type Dim } from '@/components/MapCanvas';
import { MapTools, MapToolBtn } from '@/components/MapTools';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { OpacityPanel } from '@/components/OpacityPanel';
import { LayerCatalog } from '@/components/LayerCatalog';
import { useLayerPicks } from '@/lib/useLayerPicks';

import { Data, Loading } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { HeadKpi } from '@/modules/HeadKpi';
import { useBagtsTable } from '@/lib/execData';
import { useAsync } from '@/lib/useAsync';
import { queryCount } from '@/lib/query';
import { SOCIAL } from '@/lib/brief';
import { loadSocial } from '@/lib/live';
import { loadGerBuilt } from '@/lib/irged';
import {
  COAL_MJ_PER_KG, COAL_T_PER_HH, N_KG_PER_PERSON, PERSONS_PER_HH, PM25_KG_PER_T_COAL, PM25_MG_PER_MJ,
  SLUDGE_M3_PER_PERSON, latrineLoad, stoveLoad,
} from '@/lib/bohirdol';
import {
  IRGED_BUILT, IRGED_BUILT_MAP_HUE, IRGED_ORTHO_PRE, IRGED_ROAD, IRGED_SCENE, IRGED_TOILET,
  LAYER_BY_ID, LAYER_GROUPS, PKG_BY_FAMILY, groupOf,
} from '@/lib/services';
import { num } from '@/lib/format';
import o from './irgedOv.module.css';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import i from './irged.module.css';

/**
 * НИЙГМИЙН ДЭД БҮТЦИЙН давхаргууд — сургууль, цэцэрлэг, соёл, спорт
 * (Багц 19–21). Дашбоардын 09-р хэсэгтэй ЯГ ижил эх сурвалж
 * (`PKG_BY_FAMILY.soc`) — гараар жагсаавал `PKG_TABLE` өөрчлөгдөхөд чимээгүй
 * хоцорно.
 */
const SOC_IDS = PKG_BY_FAMILY.soc ?? [];

/**
 * Бүлгийн түлхүүр → ХАРАГДАХ НЭР. Тайлбарын зурваст ижил өнгөтэй хэд хэдэн
 * давхаргыг нэг мөр болгоход хэрэглэнэ.
 */
const GROUP_TITLE = perLocale((): Record<string, string> => Object.fromEntries(
  LAYER_GROUPS.map((g) => [g.key, g.title]),
));


/**
 * Чагтаас үл хамааран ҮРГЭЛЖ ил давхарга — зам нь ортофототой адил СУУРЬ
 * (хэрэглэгчийн шийдвэр: унтраах утгагүй сонголт харуулахгүй).
 */
const ALWAYS = [IRGED_ROAD.id];

/**
 * «Одоо байгаа» тооны ТЕКСТЭЭС баганын уртыг гаргана: `"2 (1,440)"` → 2,
 * `"—"` → 0.
 */
const headCount = (s: string) => Number(/^\s*(\d+)/.exec(s)?.[1] ?? 0);


/**
 * ХАВТАН — Ерөнхий дашбоардын `Panel`-тай ЯГ ИЖИЛ бүтэц (`Dashboard.tsx:159`).
 */
/**
 * ГИНЖ — «эх → шалтгаан → үр дагавар» гурван алхам, хооронд нь сум.
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
  const { hostRef: sideHostRef, ...side } = useSideResize('irged');
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
   */


  /**
   * ЭНЭ ЦОНХНЫ СУУРЬ — ортофото, зам, ба сэдвийн хоёр давхарга. Каталогийн
   * «Иргэдэд хүрэх үр өгөөж» бүлэг яг эдгээрийг удирдана (`IRGED_LAYER_IDS`).
   */
  const base = useMemo(() => {
    const own = [IRGED_TOILET.id, IRGED_BUILT.id, ...SOC_IDS];
    return [...ALWAYS, ...own];
  }, []);

  const [visible, setVisible] = useLayerPicks(base);
  const [layerSel, setLayerSel] = useState<string | null>(null);

  /**
   * НҮХЭН ЖОРЛОНГИЙН ТОО — ЗӨВХӨН тоолно (`returnCountOnly`), нэг ч атрибут
   * татахгүй.
   */
  const qToilet = useAsync<number>(() => queryCount(IRGED_TOILET.url), []);

  /**
   * ГЭР ХОРООЛЛЫН БАРИЛГА — төрөл тус бүрийн тоо.
   */
  const qBuilt = useAsync(loadGerBuilt, []);
  const qSocial = useAsync(loadSocial, []);
  const socRows = useMemo(() => SOCIAL.rows.map((r) => {
    if (!r.live) return { ...r, pending: false, failed: false };
    if (qSocial.state !== 'ready') {
      const loading = qSocial.state === 'loading';
      return { ...r, add: loading ? '…' : '—', total: headCount(r.now), pending: loading, failed: !loading };
    }
    const g = qSocial.data.rows.find((x) => x.key === r.live);
    const n = g?.n ?? 0;
    const loaded = qSocial.data.loaded.includes(r.live);
    const add = !g ? (loaded ? '0' : '—') : !n ? '0' : g.capacity != null && !g.capPartial ? `${n} (${num(g.capacity)})` : String(n);
    const missing = !g && !loaded;
    return { ...r, add, total: missing ? null : headCount(r.now) + n, pending: false, failed: missing };
  }), [qSocial]);
  const socTotals = {
    now: socRows.reduce((s, r) => s + headCount(r.now), 0),
    add: socRows.some((r) => r.pending || r.failed) ? null : socRows.reduce((s, r) => s + headCount(r.add), 0),
    failed: socRows.some((r) => r.failed),
  };


  /** Толгойн үзүүлэлтэд — дашбоардтай ижил эх сурвалж */
  const bagts = useBagtsTable();

  /**
   * ТАЙЛБАРЫН ЗУРВАС — ИЖИЛ ӨНГӨТ давхаргуудыг НЭГ мөр болгоно.
   */
  const legend = (() => {
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
      const gs = new Set(ids.map((id) => groupOf(id)));
      const g = gs.size === 1 ? [...gs][0] : null;
      return {
        hue,
        title: (g && GROUP_TITLE()[g]) || LAYER_BY_ID[ids[0]].title,
        n: ids.length,
      };
    })];
  })();
  const legendHidden = Math.max(0, legend.length - 8);

  return (
    /* Талын багануудыг чирж өргөсгөх/нарийсгах бариулууд. */
    <div
      ref={sideHostRef}
      className={`${i.frame} ${side.hostClass}`}
      style={side.style}
    >
      <SplitGrip {...side.left} />
      <SplitGrip {...side.right} />
      {/* ══════════ ӨМНӨ — одоогийн байдал ══════════ */}
      <div className={i.left}>

        {/**
          * ГЭРИЙН ЗУУХНЫ УТАА — PM2.5, тн/жил.
          */}
        <Panel title={tr('Гэрийн зуухны утаа')} note={tr('PM2.5 · тн/жил · тооцоолол')}>
          {(() => {
            if (qBuilt.state === 'error') return <Data q={qBuilt}>{() => null}</Data>;
            const hh = qBuilt.state === 'ready'
              ? qBuilt.data.reduce((t, x) => t + x.n, 0)
              : null;
            const s = hh == null ? null : stoveLoad(hh);
            if (!s) return <Loading label={tr('Тооцоолж байна…')} />;
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
                  {tr('өрх тутам {0} тн нүүрс · {1} мг PM2.5/МЖ (уламжлалт зуух, SEET лаб 2014) · нэг өрхөд {2} кг',
                    num(COAL_T_PER_HH), num(PM25_MG_PER_MJ), num(s.pm25KgPerHh))}
                </p>
              </>
            );
          })()}
        </Panel>

        {/**
          * НҮХЭН ЖОРЛОНГИЙН БОХИРДОЛ — хөрсөнд нэвчих АЗОТ, тн/жил.
          */}
        <Panel title={tr('Нүхэн жорлонгийн бохирдол')} note={tr('азот · тн/жил · тооцоолол')}>
          {(() => {
            if (qToilet.state === 'error') return <Data q={qToilet}>{() => null}</Data>;
            const pits = qToilet.state === 'ready' ? qToilet.data : null;
            const l = pits == null ? null : latrineLoad(pits);
            if (!l) return <Loading label={tr('Тооцоолж байна…')} />;
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
                  {tr('нэг жорлон = нэг өрх · {0} хүн (өрхийн дундаж {1}, ҮСХ) × {2} кг N (Jönsson 2004)',
                    num(l.pop), num(PERSONS_PER_HH, 1), num(N_KG_PER_PERSON, 1))}
                </p>
              </>
            );
          })()}
        </Panel>

        {/**
          * НЭГ ОРОН СУУЦАНД НОГДОХ — дээрх хоёр картын ижил коэффициентийг
          * НЭГЖ рүү буулгасан хувилбар.
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
              <p className={i.factTxt}>{tr('уламжлалт зуух {0} мг/МЖ × {1} МЖ/кг · SEET лаб, 2014', num(PM25_MG_PER_MJ), num(COAL_MJ_PER_KG))}</p>
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
              <p className={i.factTxt}>{tr('{0} хүн × {1} м³ · WHO/SuSanA норм (40–60 л/хүн/жил)', num(PERSONS_PER_HH, 1), num(SLUDGE_M3_PER_PERSON, 2))}</p>
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
              <p className={i.factTxt}>{tr('{0} хүн × {1} кг N · Jönsson & Vinnerås, 2004', num(PERSONS_PER_HH, 1), num(N_KG_PER_PERSON, 1))}</p>
            </div>
          </div>
        </Panel>


      </div>

      {/* ══════════ ТӨВ — ҮЗҮҮЛЭЛТ + ГАЗРЫН ЗУРАГ (дашбоардын .center шиг) ══════════ */}
      <main className={i.mapCol}>
        {/* Толгойн таван үзүүлэлт — зургийн ДЭЭД зурваст, «Өмнө»/«Дараа»
            баганын толгойтой НЭГ шугамд зэрэгцэнэ. */}
        <div className={i.kpi}>
          <HeadKpi
            bagts={bagts}
            extra={[
              {
                v: qBuilt.state === 'ready'
                  ? num(qBuilt.data.find((x) => x.type === IRGED_BUILT.types.house)?.n ?? 0)
                  : qBuilt.state === 'error' ? '—' : '…',
                unit: tr('ш'),
                label: tr('Байшин'),
              },
              {
                v: qBuilt.state === 'ready'
                  ? num(qBuilt.data.find((x) => x.type === IRGED_BUILT.types.ger)?.n ?? 0)
                  : qBuilt.state === 'error' ? '—' : '…',
                unit: tr('ш'),
                label: tr('Гэр'),
              },
              {
                v: qToilet.state === 'ready' ? num(qToilet.data) : qToilet.state === 'error' ? '—' : '…',
                unit: tr('ш'),
                label: tr('Нүхэн жорлон'),
              },
            ]}
          />
        </div>

        {/**
          * ЗУРГИЙН ХҮРЭЭ — toolbar, каталог, тайлбар гурвуулаа ЭНД зангидна.
          */}
        <div className={i.mapBox}>
          <MapCanvas
            dim={dim}
            visible={visible}
            opacity={opacity}
            zone={zone}
            uniform
            scene={IRGED_SCENE.layers}
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
          >
            {IRGED_ORTHO_PRE.url && (
              <MapToolBtn
                icon="layers"
                on={visible.includes(IRGED_ORTHO_PRE.id)}
                title={IRGED_ORTHO_PRE.title}
                onClick={() => setVisible((v) => (v.includes(IRGED_ORTHO_PRE.id)
                  ? v.filter((x) => x !== IRGED_ORTHO_PRE.id) : [...v, IRGED_ORTHO_PRE.id]))}
              >
                {tr('Өмнөх ортофото')}
              </MapToolBtn>
            )}
          </MapTools>

          {layerOpen && (
            <div className={`${o.catPanel} ${i.catPanel}`}>
              <LayerCatalog
                view="irged"
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

          {/* Тайлбар — зурагт БОДИТ харагдаж буй давхаргууд (дашбоардтай ижил). */}
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
        {/**
          * НИЙГМИЙН БАЙГУУЛАМЖ — ТӨСЛИЙН ӨӨРИЙН ИНФОГРАФИКИЙН БҮТЭЦ.
          */}
        <Panel
          title={tr('Нийгмийн үйлчилгээ (одоо {0} + шинэ {1})', String(socTotals.now), socTotals.add == null ? (socTotals.failed ? '—' : '…') : String(socTotals.add))}
          note={socTotals.add == null ? undefined : tr('{0} → {1}', String(socTotals.now), String(socTotals.now + socTotals.add))}
        >
          {qSocial.state === 'error' && <Data q={qSocial}>{() => null}</Data>}
          <p className={i.socSrc}>
            {tr('«Шинээр» — сургууль, цэцэрлэгийнх газрын зургийн давхаргаас (амьд), бусад нь илтгэлээс; «Одоо байгаа» — илтгэлээс.')}
          </p>
          <div className={i.socList}>
            {socRows.map((r) => {
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
                    <b className={i.socTotal}>{r.pending ? '…' : r.failed || r.total == null ? '—' : r.total}</b>
                    <span className={i.socName}>{r.label}</span>
                  </div>
                  <div className={i.socLine}>
                    <span className={i.socWhen}>{tr('Одоо байгаа')}</span>
                    <span className={i.socDots} aria-hidden="true">{dots(now)}</span>
                    <span className={i.socFact}>
                      {now ? <b>{now}</b> : <em>—</em>}
                      {cap(r.now) && <em>{tr('{0} хүн', cap(r.now)!)}</em>}
                    </span>
                  </div>
                  <div className={i.socLine}>
                    <span className={i.socWhen}>{tr('шинээр')}</span>
                    <span className={i.socDots} aria-hidden="true">{dots(add)}</span>
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
          */}
        <Panel title={tr('Хамрах хүрээ')} note={tr('явган алхах хугацаа · БНбД 30.01.03')}>
          <div className={i.walkV}>
            <div className={i.walkLine}>
              <i className={i.walkFill} aria-hidden="true" />
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
