'use client';

import { t as tr } from '@/lib/i18nCore';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol';
import CIMSymbol from '@arcgis/core/symbols/CIMSymbol';
import { useMap } from '@/components/MapCanvas';
import { computeNeed, onNeedStep, NEED_TYPES, type NeedResult, type NeedType } from '@/lib/hesegNeed';
import { refreshEpoch, subscribeData } from '@/lib/dataBus';
import { selectNeedLinks, selectNeedSegments, selectNeedUnresolved, summarizeNeed, UNASSIGNED_ZONE } from '@/lib/hesegNeedSummary';
import { fmtLen, OVERLAP_TYPES } from '@/lib/planOverlap';
import { num } from '@/lib/format';
import { placeTip } from '@/components/PlanOverlap';
import { userError } from '@/components/ui';
import { useElapsed } from '@/components/HesegChange';
import { Segmented } from '@/components/Switch';
import s from './heseg.module.css';
import n from './hesegNeed.module.css';

/**
 * «ХЭСЭГЧИЛСЭН ЕТ» → 03 НЭМЭЛТ ХЭРЭГЦЭЭ — самбар (`NeedPanel`) ба зургийн давхарга (`NeedLayer`).
 * Тооцоо: `lib/hesegNeed.ts`.
 *
 * ⚠️ Самбар ба давхарга нь ӨӨР газар зурагддаг (Portal-ын самбар / зураг) — хоёулаа нэг жижиг
 *    store-оос (`maxM` — хүртээмжийн зай, `type` — төрлийн шүүлт) уншина; Portal-д төлөв нэмэхгүй.
 */

const TYPE_BY_KEY = new Map(OVERLAP_TYPES.map((x) => [x.key, x]));

/* ── Самбар ↔ зураг хоорондын жижиг store ── */
/**
 * `mode` — жагсаалтын хэлбэр: төрлөөр / БҮСЭЭР (хэрэглэгч: «Бүс гэсэн сонголт хийх»);
 * `zone` — бүсийн мөр сонгосон бол зураг дээр зөвхөн тэр бүсийн холболт.
 */
type NeedUi = { maxM: number; priorityOnly: boolean; type: NeedType | null; mode: 'type' | 'zone'; zone: string | null };
let ui: NeedUi = { maxM: 30, priorityOnly: false, type: null, mode: 'type', zone: null };
let needData: NeedResult | null = null;
const subs = new Set<() => void>();
const setUi = (p: Partial<NeedUi>) => { ui = { ...ui, ...p }; subs.forEach((f) => f()); };
export const resetNeedSelection = () => setUi({ type: null, zone: null, priorityOnly: false });
const useUi = () => useSyncExternalStore(
  (f) => { subs.add(f); return () => { subs.delete(f); }; },
  () => ui,
  () => ui,
);

/** Portal сонгосон төрөл/бүсээс бусад төлөвлөгөөний давхаргыг нуухад хэрэглэнэ. */
export const useNeedSelection = () => {
  const selection = useUi();
  const geometry = needData?.zones.find((zone) => zone.label === selection.zone)?.geometry ?? null;
  return { ...selection, geometry, ready: needData != null,
    existingGeometry: selection.zone === UNASSIGNED_ZONE ? needData?.existingOutsideGeometry ?? null : geometry };
};

export const NEED_COMPARE_LAYERS = { leading: [] as string[], trailing: ['need:buildings', 'need:links'] };
const zoneTitle = (label: string) => label === UNASSIGNED_ZONE ? tr('Бүсээс гадуур') : label;
const failureTitle = (reason: string) => ({
  'no-source': tr('Ижил төрлийн эх үүсвэргүй'),
  'no-corridor': tr('Замын коридоргүй'),
  'no-access': tr('Барилгаас коридорт хүрэх замгүй'),
  disconnected: tr('Эх үүсвэр хүртэл коридор тасарсан'),
}[reason] ?? tr('Трасс тодорхойгүй'));

type State = { res: NeedResult | null; step: string; err: string | null };
/** «Шинэчлэх»-ийн дараах дахин бодолтын саатал — дараалсан `invalidateAll`-ийг нэг тооцоо болгоно */
const REFRESH_DEBOUNCE_MS = 400;
function useNeed(): State {
  const [st, setSt] = useState<State>({ res: null, step: '', err: null });
  /* ⚠️ 2026-10-19 (аудит): толгойн «Шинэчлэх» (`invalidateAll`) кэшийг хаяна (`hesegNeed`) — дахин бодуулна;
     хуучин үр дүн шинэ нь иртэл үлдэнэ. */
  /* ⚠️ 2026-10-19 (review): `dataVersion` биш `refreshEpoch` (кэш зөвхөн `invalidateAll`-д хаягдана); дахин бодолтыг
     сааруулна; өмнөх үеийн хариу ба явцыг (`onNeedStep(fn, p)` — ЗӨВХӨН энэ тооцооных) үл тооно. */
  const epoch = useSyncExternalStore(subscribeData, refreshEpoch, () => 0);
  const mountEpoch = useRef(epoch);
  useEffect(() => {
    let alive = true;
    let off = () => {};
    const t = setTimeout(() => {
      const p = computeNeed();
      /* ⚠️ 2026-10-19 (аудит): явцын текст БҮХ хүлээгчид (`onNeedStep`) — урьд нь зөвхөн эхлүүлсэн дуудагчид (зургийн
         давхарга) очдог тул самбар явцгүй байв; unmount-д цуцална. */
      off = onNeedStep((step) => { if (alive) setSt((prev) => ({ ...prev, step })); }, p);
      p.then((res) => {
        if (!alive) return;
        if (needData !== res) { needData = res; setUi({}); }
        setSt({ res, step: '', err: null });
      })
        .catch((e: unknown) => {
          /* ⚠️ 2026-10-23 (UX аудит X3): түүхий серверийн мөр биш — `userError` */
          console.error('[selbe] хэсэгчилсэн ЕТ — хэрэгцээ:', e);
          if (alive) setSt({ res: null, step: '', err: userError(e) });
        });
    }, epoch === mountEpoch.current ? 0 : REFRESH_DEBOUNCE_MS);
    return () => { alive = false; clearTimeout(t); off(); };
  }, [epoch]);
  return st;
}

/* ═══════════════════ Самбар ═══════════════════ */

export function NeedPanel() {
  const { res, step, err } = useNeed();
  const u = useUi();

  const stats = useMemo(() => res ? summarizeNeed(res, u) : null, [res, u]);
  /* ⚠️ 2026-10-23 (UX аудит E7): алхмын бичиг удаан нэг дээр зогсоход ч хөдөлгөөн харагдана — хүлээсэн секунд */
  const secs = useElapsed(!res && !err);

  if (err) return <p className={s.err}>{tr('Тооцоолж чадсангүй')}: {err}</p>;
  if (!res || !stats) {
    return (
      <p className={s.wait}>
        <span className={s.spin} aria-hidden />
        {step || tr('Тооцоолж байна…')}
        {secs >= 3 && <> {tr('({0} с)', num(secs))}</>}
      </p>
    );
  }
  const incomplete = res.failed.length > 0;
  const lengthText = (value: number, unknown = false) => (incomplete || unknown) && value === 0 ? tr('Тодорхойгүй') : fmtLen(value);

  return (
    <>
      {incomplete && <p className={s.err}>{tr('Өгөгдөл дутуу — тооцоо хэсэгчилсэн.')}{' '}{tr('Татагдаагүй давхарга')}: {res.failed.join(', ')}</p>}
      <label className={s.ctrl}>
        {tr('Урт холболтын босго')}
        <input
          type="number"
          min={0}
          step={5}
          value={u.maxM}
          onChange={(e) => setUi({ maxM: Math.max(0, Number(e.target.value) || 0) })}
        />
        {tr('м')}
      </label>
      <label className={n.check}>
        <input type="checkbox" checked={u.priorityOnly} onChange={(e) => setUi({ priorityOnly: e.target.checked })} />
        {tr('Зөвхөн босгоос урт холболт')}
      </label>
      <label className={`${s.ctrl} ${n.zoneControl}`}>
        {tr('Бүс')}
        <select value={u.zone ?? ''} onChange={(e) => setUi({ zone: e.target.value || null })}>
          <option value="">{tr('Бүх бүс')}</option>
          {stats.zones.map((zone) => <option key={zone.label} value={zone.label}>{zoneTitle(zone.label)}</option>)}
        </select>
      </label>
      {(u.type || u.zone || u.priorityOnly) && (
        <div className={n.selection}>
          <span>{[u.type && TYPE_BY_KEY.get(u.type)?.title(), u.zone && zoneTitle(u.zone)].filter(Boolean).join(' · ')}</span>
          <button type="button" onClick={resetNeedSelection}>{tr('Бүгдийг харах')}</button>
        </div>
      )}
      <div className={s.kpis}>
        <div className={s.kpi}>
          <span className={s.kpiVal}>{incomplete && stats.requiredBuildings === 0 ? '—' : num(stats.requiredBuildings)}</span>
          <span className={s.kpiLbl}>{tr('Нэмэлт холболт шаардлагатай барилга')}</span>
        </div>
        <div className={s.kpi}>
          <span className={s.kpiVal}>{lengthText(stats.connectionLengthM, stats.unresolvedConnections > 0)}</span>
          <span className={s.kpiLbl}>{tr('Эдгээр барилгад нэмэх шугамын урт')}</span>
        </div>
      </div>
      <div className={n.routeStatus}>
        <span>{tr('Трасс тооцоолсон: {0} барилга', num(stats.routedBuildings))}</span>
        {stats.unresolvedBuildings > 0 && <span className={n.unresolvedCount}>{tr('Урт тодорхойгүй: {0} барилга / {1} холболт', num(stats.unresolvedBuildings), num(stats.unresolvedConnections))}</span>}
        {u.zone && <span>{tr('Бүс доторх шинэ трасс: {0}', lengthText(stats.lengthM))}</span>}
        <span>{tr('Босгоос урт: {0} барилга', num(stats.priority))}</span>
        <span>{tr('Одоо байгаа шугамтай хүрэлцсэн: {0} холболт', num(stats.alreadyConnected))}</span>
      </div>
      {stats.unresolved.length > 0 && (
        <div className={n.unresolved} role="status">
          <b>{tr('{0} холболтын трасс тодорхойгүй', num(stats.unresolved.length))}</b>
          <span>{tr('Эдгээр шаардлагатай холболтын урт дүнд ороогүй. Улбар хүрээтэй барилгын эх үүсвэр, коридор эсвэл нэвтрэх замыг нягтална уу.')}</span>
          {u.priorityOnly && <span>{tr('Урт нь тодорхойгүй хэрэгцээг босгын шүүлтээр хасахгүй.')}</span>}
          {(['no-source', 'no-corridor', 'no-access', 'disconnected'] as const).map((reason) => {
            const count = stats.unresolved.filter((item) => item.reason === reason).length;
            return count > 0 ? <span key={reason}>{failureTitle(reason)}: {num(count)}</span> : null;
          })}
        </div>
      )}
      {/* Жагсаалтын хэлбэр — төрлөөр / бүсээр. ⚠️ 2026-10-26 (хэрэглэгч: «нэг загвар»): нийтлэг `Segmented` */}
      <div className={s.modes}>
        <Segmented value={u.mode} onChange={(m) => setUi({ mode: m })} label={tr('Харах хэлбэр')}
          options={[{ value: 'type', label: tr('Төрлөөр') }, { value: 'zone', label: tr('Бүсээр') }]} />
      </div>

      {u.mode === 'zone' ? (
        <>
        <p className={s.note}>{tr('Барилгын хэрэгцээ ба тэдгээрт үйлчлэх давхардалгүй шинэ шугамыг бүсээр харуулав. Бүс доторх физик трассын уртыг тусад нь үзүүлнэ.')}</p>
        <ul className={s.list}>
          {stats.zones.map((z, index) => {
            const on = u.zone === z.label;
            return (
              <li key={z.label} className={`${s.item} ${on ? s.itemOn : ''}`}>
                <button
                  type="button"
                  className={s.itemHead}
                  aria-pressed={on}
                  onClick={() => setUi({ zone: on ? null : z.label })}
                >
                  <span className={s.name}>
                    {zoneTitle(z.label)}
                    {index === 0 && z.addM > 0 && <small className={n.priority}>{tr('Хамгийн их шинэ трасс')}</small>}
                    <small className={n.subline}>{tr('Трасс тооцоолсон: {0} барилга', num(z.routedBuildings))}</small>
                  </span>
                  <span className={s.val}>
                    <span className={s.valMain}>{tr('{0} барилга', num(z.requiredBuildings))}</span>
                    <span className={n.connectionLength}>{tr('Нэмэгдэх: {0}', lengthText(z.connectionLengthM, z.unresolvedConnections > 0))}</span>
                    {z.unresolvedConnections > 0 && <span className={n.unresolvedCount}>{tr('Урт тодорхойгүй: {0} холболт', num(z.unresolvedConnections))}</span>}
                  </span>
                </button>
                <div className={n.zoneDetails}>
                  <span>{tr('Бүс доторх шинэ трасс: {0}', lengthText(z.addM))}</span>
                  {z.label !== UNASSIGNED_ZONE && <span>{tr('Одоо байгаа {0} · тооцоолсон нийт {1}', lengthText(z.existingM), lengthText(z.totalM))}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        </>
      ) : (
      <ul className={s.list}>
        {stats.rows.map((r) => {
          const ty = TYPE_BY_KEY.get(r.type);
          const on = u.type === r.type;
          return (
            <li key={r.type} className={`${s.item} ${on ? s.itemOn : ''}`}>
              <button
                type="button"
                className={s.itemHead}
                aria-pressed={on}
                onClick={() => setUi({ type: on ? null : r.type })}
              >
                <span className={s.swatch} style={{ background: ty?.hue }} aria-hidden />
                <span className={s.name}>
                  {ty?.title() ?? r.type}
                  <small className={n.subline}>{tr('Трасс тооцоолсон: {0} барилга', num(r.routedBuildings))}</small>
                </span>
                <span className={s.val}>
                  <span className={s.valMain}>{tr('{0} барилга', incomplete && r.requiredBuildings === 0 ? '—' : num(r.requiredBuildings))}</span>
                  <span className={n.connectionLength}>{tr('Нэмэгдэх: {0}', lengthText(r.connectionLengthM, r.unresolvedConnections > 0))}</span>
                  {r.unresolvedConnections > 0 && <span className={n.unresolvedCount}>{tr('Урт тодорхойгүй: {0} холболт', num(r.unresolvedConnections))}</span>}
                  {!r.available && <span className={n.unresolvedCount}>{tr('Шугамын өгөгдөлгүй')}</span>}
                  {u.zone && <span className={s.delta}>{tr('Бүс дотор: {0}', lengthText(r.lengthM))}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      )}
      {stats.lengthM === 0 && !incomplete && stats.requiredBuildings === 0 && <p className={s.note}>{tr('Энэ сонголтод нэмэлт холболтын хэрэгцээ тогтоогдоогүй.')}</p>}
      <div className={n.legend}>
        <span><i className={n.trunk} />{tr('Дундын шугам')}</span>
        <span><i className={n.branch} />{tr('Барилга / эх үүсвэрийн холболт')}</span>
      </div>
      <p className={s.note}>
        {tr('Барилга олон төрлийн холболт шаардсан ч нийт болон бүсийн тоонд нэг удаа орно. Нэмэгдэх урт нь эдгээр барилгад үйлчлэх дундын хэсгийг давхардуулаагүй бүтэн трасс; бүс доторх урт нь газрын зураг дээр хилээр тайрсан хэсэг юм.')}
      </p>
      <p className={s.note}>
        {tr('Урьдчилсан трасс: автозам, явган замын коридороор ижил төрлийн одоо байгаа сүлжээнд холбоно. Барилгын дундуур дайрахгүй; дундын шугамын уртыг нэг удаа тооцно. Энэ нь систем тус бүрийн трассын урт бөгөөд хос хоолой, кабелийн тоо хэмжээ биш. Хүчин чадал, диаметр, даралт, бохир усны хэвгий болон газар ашиглалтын эрхийг баталгаажуулаагүй.')}
      </p>
      <p className={s.note}>{tr('Коридорын нарийвчлал {0} м; барилгын салаа ≤{1} м, эх үүсвэрийн холболт ≤{2} м.', num(res.routing.resolutionM, 1), num(res.routing.maxAccessM), num(res.routing.maxTieM))}</p>
      {res.routing.warnings.length > 0 && <p className={s.err}>{tr('Коридорын зарим хэсэгт нарийвчлал хязгаарлагдсан. Тодорхойгүй трассыг нягтална уу.')}</p>}
    </>
  );
}

/* ═══════════════════ Газрын зураг ═══════════════════ */

const LAYER_ID = 'need:links';

type NeedMapLayers = { links: GraphicsLayer; buildings: GraphicsLayer };

/** Хамт явах системийг дэлгэцийн жижиг зайчлалаар ялгана; бодит геометр, уртыг өөрчлөхгүй. */
function proposedSymbol(type: NeedType, branch: boolean, allTypes: boolean): CIMSymbol {
  const hex = TYPE_BY_KEY.get(type)?.hue ?? '#64748b';
  const rgb = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  const effects: __esri.CIMGeometricEffect[] = [];
  if (allTypes) effects.push({ type: 'CIMGeometricEffectOffset', offset: (NEED_TYPES.indexOf(type) - 2.5) * 1.2, method: 'Rounded' });
  if (branch) effects.push({ type: 'CIMGeometricEffectDashes', dashTemplate: [4, 2], lineDashEnding: 'NoConstraint' });
  return new CIMSymbol({ data: {
    type: 'CIMSymbolReference',
    symbol: { type: 'CIMLineSymbol', symbolLayers: [{
      type: 'CIMSolidStroke', enable: true, width: branch ? 1.05 : 1.3,
      color: [...rgb, branch ? 80 : 100], capStyle: 'Round', joinStyle: 'Round', effects,
    }] },
  } });
}

export function NeedLayer() {
  const { view } = useMap();
  const { res } = useNeed();
  const u = useUi();
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [layers, setLayers] = useState<NeedMapLayers | null>(null);
  const gl = layers?.links;
  const links = useMemo(() => res ? selectNeedLinks(res, { maxM: u.maxM, priorityOnly: u.priorityOnly, type: u.type, zone: u.zone }) : [], [res, u.maxM, u.priorityOnly, u.type, u.zone]);
  const segments = useMemo(() => res ? selectNeedSegments(res,
    selectNeedLinks(res, { maxM: u.maxM, priorityOnly: u.priorityOnly, type: u.type, zone: null }), u.zone) : [],
  [res, u.maxM, u.priorityOnly, u.type, u.zone]);
  const unresolved = useMemo(() => res ? selectNeedUnresolved(res, { type: u.type, zone: u.zone }) : [], [res, u.type, u.zone]);
  const zoneGeometry = res?.zones.find((zone) => zone.label === u.zone)?.geometry ?? null;

  useEffect(() => {
    if (!view || view.type !== '2d' || !view.map) return;
    const map = view.map;
    const current: NeedMapLayers = {
      buildings: new GraphicsLayer({ id: 'need:buildings', listMode: 'hide' }),
      links: new GraphicsLayer({ id: LAYER_ID, listMode: 'hide' }),
    };
    map.addMany(Object.values(current));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ ArcGIS давхаргыг view-д НЭМСНИЙ дараа л график/hover эффектүүд ажиллах ёстой (гаднын Map-ийн төлөв)
    setLayers(current);
    return () => {
      for (const layer of Object.values(current)) { map.remove(layer); layer.destroy(); }
      setLayers(null);
    };
  }, [view]);

  useEffect(() => {
    if (!gl || !layers || !res) return;
    gl.removeAll();
    const symbols = new Map<string, CIMSymbol>();
    gl.addMany(segments
      .map((l) => {
        const key = `${l.type}:${l.kind === 'corridor'}`;
        const symbol = symbols.get(key) ?? proposedSymbol(l.type, l.kind !== 'corridor', !u.type);
        symbols.set(key, symbol);
        return new Graphic({
          geometry: l.geometry,
          attributes: { type: l.type, len: l.lengthM, buildings: l.buildings.length, kind: l.kind },
          symbol,
        });
      }));
    layers.buildings.removeAll();
    const unresolvedIds = new Set(unresolved.map((item) => item.building));
    const buildingIds = new Set([...links.map((link) => link.building), ...unresolvedIds]);
    layers.buildings.addMany([...buildingIds].map((building) => new Graphic({
      geometry: res.buildingGeometries[building],
      attributes: { building, unresolved: unresolvedIds.has(building), reasons: unresolved.filter((item) => item.building === building).map((item) => failureTitle(item.reason)).join(' · ') },
      symbol: new SimpleFillSymbol({
        color: unresolvedIds.has(building) ? [245, 158, 11, 0.06] : [14, 165, 233, 0.04],
        outline: { color: unresolvedIds.has(building) ? '#d97706' : '#0369a1', width: unresolvedIds.has(building) ? 1.25 : 0.6, style: unresolvedIds.has(building) ? 'dash' : 'solid' },
      }),
    })));
  }, [gl, layers, res, links, segments, unresolved, u.type]);

  /*
   * Сонголтоор хүрээг томруулна; шийдэгдээгүй барилгыг ч хамруулна.
   * ⚠️ 2026-10-19 (аудит): ЗӨВХӨН сонголт (төрөл · бүс) СОЛИГДОХОД — урьд нь босгын (`maxM`) талбарт товч дарах бүрд
   *    `segments` өөрчлөгдөж зураг дахин ойртдог тул хэрэглэгчийн гүйлгэсэн/томруулсан байдал алга болдог байв.
   */
  const zoomedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!u.type && !u.zone) { zoomedRef.current = null; return; }
    if (!view || view.type !== '2d' || !res) return;
    const key = `${u.type ?? ''}|${u.zone ?? ''}`;
    if (zoomedRef.current === key) return;
    zoomedRef.current = key;
    const targets = [...segments.map((segment) => segment.geometry), ...unresolved.map((item) => res.buildingGeometries[item.building])];
    const extent = zoneGeometry?.extent?.clone() ?? targets.reduce<__esri.Extent | null>((result, geometry) => {
      const current = geometry.extent;
      return current ? result ? result.union(current) : current.clone() : result;
    }, null);
    if (extent) void view.goTo(extent.expand(1.2), { duration: 500 }).catch(() => {});
  }, [view, res, segments, unresolved, u.type, u.zone, zoneGeometry]);

  /* HOVER — төрөл · урт */
  useEffect(() => {
    if (!view || view.type !== '2d' || !gl || !layers) return;
    const mv = view as __esri.MapView;
    const tip = tipRef.current;
    let seq = 0;
    const h = mv.on('pointer-move', (e: __esri.ViewPointerMoveEvent) => {
      const my = ++seq;
      mv.hitTest(e, { include: [gl, layers.buildings] }).then((r) => {
        if (my !== seq || !tip) return;
        const hit = r.results.find((x) => x.type === 'graphic') as __esri.MapViewGraphicHit | undefined;
        const g = hit?.graphic;
        if (!g) { tip.hidden = true; return; }
        const a = g.attributes as { type?: NeedType; len?: number; unresolved?: boolean; reasons?: string; buildings?: number; kind?: string };
        tip.hidden = false;
        tip.innerHTML = '';
        const t = document.createElement('b');
        t.textContent = a.type ? `${TYPE_BY_KEY.get(a.type)?.title() ?? a.type} — ${a.kind === 'corridor' ? tr('Дундын шугам') : tr('Барилга / эх үүсвэрийн холболт')}` : a.unresolved ? tr('Трасс тодорхойгүй') : tr('Холболт төлөвлөсөн барилга');
        const d = document.createElement('span');
        d.textContent = a.unresolved ? a.reasons ?? '' : a.type ? `${fmtLen(a.len ?? 0)} · ${tr('{0} барилга', num(a.buildings ?? 1))}` : tr('Урьдчилсан трасс');
        tip.append(t, d);
        /* ⚠️ 2026-10-19 (аудит): зургийн хүрээнд шахна (`PlanOverlap.placeTip`-ийн ⚠️) */
        placeTip(tip, mv, e.x, e.y);
      }).catch(() => {});
    });
    const out = mv.on('pointer-leave', () => { seq++; if (tip) tip.hidden = true; });
    return () => { h.remove(); out.remove(); };
  }, [view, gl, layers]);

  return <div ref={tipRef} className={s.tip} hidden role="tooltip" />;
}
