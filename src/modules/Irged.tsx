'use client';

/**
 * ИРГЭДЭД ХҮРЭХ ҮР ӨГӨӨЖ — хоёр зураг ЗЭРЭГЦЭЭ, дэлгэцийг тэн хуваана:
 *
 *   ┌───────────────────────┬────────────────────────────┐
 *   │  2D · Ортофото        │  3D · Өмнөх бодит загвар   │
 *   │  (MapView)            │  (SceneView + меш)         │
 *   └───────────────────────┴────────────────────────────┘
 *
 * ⚠️ BIM горим энэ харагдацад БАЙХГҮЙ (хэрэглэгчийн шийдвэр) — хоёр зураг нь
 * тогтмол 2D ба 3D тул горим сонгох товч ч хэрэггүй.
 *
 * ⚠️ ЭРСДЭЛ — ХОЁР ArcGIS VIEW ЗЭРЭГ: `Portal.tsx` нь «хоёр view зэрэг
 * ажиллавал WebGL контекст үрэгдэнэ» гэж анхааруулдаг бөгөөд өмнөх swipe
 * оролдлого дээр browser гацсан. Тиймээс энд эрсдэлийг БУУРУУЛАХ гурван
 * арга хэмжээ авсан:
 *
 *   1. `mapId` — тал бүр ӨӨРИЙН Map-тай. Хуваалцвал `dim`-ээс хамаарсан
 *      эффектүүд бие биенийхээ мешийг тасралтгүй нэмж/хасна.
 *   2. Камерын синк нь ЖОЛООДОГЧИЙН зарчимтай (доор тайлбарлав) — эргэх
 *      холбоогүй тул хязгааргүй гогцоо үүсэхгүй.
 *   3. Синк нь `requestAnimationFrame`-ээр НЭГ фрэймд нэг удаа бичнэ —
 *      viewpoint солигдох бүрд шууд бичвэл фрэйм бүрт хэдэн удаа дуудагдана.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import type Viewpoint from '@arcgis/core/Viewpoint';
import { MapCanvas, type AnyView } from '@/components/MapCanvas';
import { Data, Stat } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { queryCount } from '@/lib/query';
import { IRGED_ORTHO, IRGED_ROAD, IRGED_SCENE, IRGED_TOILET } from '@/lib/services';
import { num } from '@/lib/format';
import i from './irged.module.css';

/**
 * Унтрааж асаах давхаргууд — жагсаалтаас чагтын мөрүүд үүснэ.
 *
 * ⚠️ Зам нь ЭНД БАЙХГҮЙ: тэр нь ортофототой адил СУУРЬ давхарга бөгөөд үргэлж
 * асаалттай (хэрэглэгчийн шийдвэр). Чагт нэмбэл унтраах утгагүй сонголт
 * харагдана.
 */
const TOGGLES = [
  { id: IRGED_TOILET.id, label: IRGED_TOILET.title },
] as const;

/** Чагтаас үл хамааран ҮРГЭЛЖ ил давхаргууд (хоёр талд) */
const ALWAYS = [IRGED_ROAD.id];

export function Irged() {
  /** Асаалттай давхаргууд — хоёр тал ЖАГСААЛТАА хуваалцана */
  const [on, setOn] = useState<Record<string, boolean>>(
    () => Object.fromEntries(TOGGLES.map((t) => [t.id, true])),
  );

  /**
   * ⚠️ 2D-д ортофото нь ҮРГЭЛЖ жагсаалтад байна: `MapCanvas` нь сонголт ХООСОН
   * үед 2D-д `BASE_MAP_IDS`-ийн 14 суурь давхаргыг бүгдийг асаадаг — бүх чагтыг
   * авбал ортофотогийн оронд тэдгээр гарч ирнэ.
   */
  const vis2d = useMemo(
    () => [IRGED_ORTHO.id, ...ALWAYS, ...TOGGLES.filter((t) => on[t.id]).map((t) => t.id)],
    [on],
  );
  /** 3D талд меш нь `scene` prop-оор ирэх тул зөвхөн зам + чагтууд */
  const vis3d = useMemo(
    () => [...ALWAYS, ...TOGGLES.filter((t) => on[t.id]).map((t) => t.id)],
    [on],
  );

  const v2 = useRef<AnyView | null>(null);
  const v3 = useRef<AnyView | null>(null);

  /**
   * АЛЬ ТАЛЫГ ЖОЛООДОЖ БАЙНА — хулгана аль зурган дээр байна, тэр нь ЭХ,
   * нөгөө нь дагана.
   *
   * ⚠️ Энгийн «синк хийж байна» ТУГ АЖИЛЛАХГҮЙ: ArcGIS-ийн `watch` нь
   * callback-аа АСИНХРОН дууддаг. Тугийг тавиад шууд буцаахад нөгөө талын
   * watcher хожим асч, түүнийг зогсоох зүйл үлдэхгүй → 2D→3D→2D гэж эргэлдэж,
   * хөрвүүлэлт бүрт масштаб гажин камер хөөрөн одно. Жолоодогчийн зарчим нь
   * эргэх холбоог БҮРМӨСӨН таслана: дагагч талын watcher хэзээ ч бичихгүй.
   */
  const driver = useRef<'2d' | '3d' | null>(null);

  const on2 = useCallback((v: AnyView | null) => { v2.current = v; }, []);
  const on3 = useCallback((v: AnyView | null) => { v3.current = v; }, []);

  /** КАМЕРЫН СИНК — нэг талыг гүйлгэхэд нөгөө нь дагана */
  useEffect(() => {
    let handles: __esri.Handle[] = [];
    let alive = true;
    let raf = 0;

    const link = (a: AnyView, b: AnyView, side: '2d' | '3d') =>
      reactiveUtils.watch(
        () => a.viewpoint,
        (vp: Viewpoint | null) => {
          if (!vp || b.destroyed || driver.current !== side) return;
          // Нэг фрэймд НЭГ л бичилт — viewpoint нь гүйлгэх үед олон удаа өөрчлөгдөнө
          if (raf) return;
          raf = requestAnimationFrame(() => {
            raf = 0;
            if (!alive || b.destroyed || driver.current !== side) return;
            b.viewpoint = a.viewpoint;
          });
        },
      );

    /** Хоёр view хоёулаа бэлэн болтол хүлээнэ (тус тусдаа ачаалагдана) */
    const tick = window.setInterval(() => {
      if (!alive) return;
      const a = v2.current;
      const b = v3.current;
      if (!a || !b || a.destroyed || b.destroyed) return;
      window.clearInterval(tick);
      // Эхлээд 2D-гийн байрлалыг 3D-д НЭГ УДАА тавина — хоёр тал таарна
      b.viewpoint = a.viewpoint;
      handles = [link(a, b, '2d'), link(b, a, '3d')];
    }, 300);

    return () => {
      alive = false;
      window.clearInterval(tick);
      if (raf) cancelAnimationFrame(raf);
      handles.forEach((h) => h.remove());
    };
  }, []);

  /**
   * НҮХЭН ЖОРЛОНГИЙН ТОО — ЗӨВХӨН тоолно (`returnCountOnly`), нэг ч атрибут
   * татахгүй.
   */
  const qToilet = useAsync<number>(() => queryCount(IRGED_TOILET.url), []);

  const noop = useCallback(() => {}, []);

  return (
    <div className={i.frame}>
      {/* ── ЗҮҮН: 2D ортофото ── */}
      <section
        className={i.pane}
        onPointerEnter={() => { driver.current = '2d'; }}
      >
        <MapCanvas
          dim="2d"
          mapId="irged-2d"
          visible={vis2d}
          zone={null}
          uniform
          onView={on2}
          onPick={noop}
        />
        <span className={i.tag}>2D · Ортофото</span>

        {/* Үзүүлэлт — зургийн ДЭЭР хөвөгч карт.
            ⚠️ `top: 100px` — ArcGIS-ийн zoom товч зүүн дээд буланд (≈80px)
               сууна; дээгүүр тавибал товч дарагдана. */}
        <div className={i.overlay}>
          <Data q={qToilet} loading="Тоолж байна…">
            {(n) => (
              <Stat
                value={num(n)}
                unit="ш"
                label={IRGED_TOILET.title}
                color={IRGED_TOILET.hue}
                accent
              />
            )}
          </Data>

          {/* Давхаргын чагтууд — ХОЁР талд зэрэг үйлчилнэ (нэг `on` төлөв).
              ⚠️ `pointer-events: auto` — эцэг карт нь `none` (зураг чирэхэд саад
                 болохгүйн тулд) тул чагтад ЗААВАЛ буцааж өгнө. */}
          <div className={i.toggles}>
            {TOGGLES.map((t) => (
              <label key={t.id} className={i.toggle}>
                <input
                  type="checkbox"
                  checked={on[t.id]}
                  onChange={(e) => setOn((p) => ({ ...p, [t.id]: e.target.checked }))}
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* ── БАРУУН: 3D бодит загвар ── */}
      <section
        className={i.pane}
        onPointerEnter={() => { driver.current = '3d'; }}
      >
        <MapCanvas
          dim="3d"
          mapId="irged-3d"
          visible={vis3d}
          zone={null}
          uniform
          scene={IRGED_SCENE.layers}
          onView={on3}
          onPick={noop}
        />
        <span className={i.tag}>3D · Өмнөх бодит загвар</span>
      </section>
    </div>
  );
}
