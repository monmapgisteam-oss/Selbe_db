'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import { MapCanvas, MapProvider, type Dim } from '@/components/MapCanvas';
import { ViewRail } from '@/components/ViewRail';
import { Icon } from '@/components/Icon';
import { useTheme } from '@/lib/theme';
import { useAsync } from '@/lib/useAsync';
import { queryStats, count, sum, sqlStr } from '@/lib/query';
import {
  DEFAULT_VIEW, VIEW_BY_KEY, layerUrl, OID, ZONE_FIELD,
  ZONE_LAYER, ZONE_FIELDS, BUILT_LAYER, BUILT_FIELDS,
  type ViewKey,
} from '@/lib/services';
import { num, mntShort } from '@/lib/format';
import { ViewPanel } from '@/modules/ViewPanel';

import s from '@/app/shell.module.css';

export default function Portal() {
  /**
   * Газрын зураг ХОЁРХОН төрөлтэй: 2D = ортофото, 3D = меш. Суурийг энэ л шийднэ.
   */
  const [dim, setDim] = useState<Dim>('2d');

  /**
   * ХАРАГДАЦ — порталын гол удирдлага. Сонгоход зураг ба самбар ХОЁУЛАА солигдоно.
   * `visible` нь харагдацын давхаргуудаар дүүрнэ; хэрэглэгч самбараас нь тус
   * тусад нь унтрааж болно.
   */
  const [view, setViewState] = useState<ViewKey>(DEFAULT_VIEW);
  const [visible, setVisible] = useState<string[]>(VIEW_BY_KEY[DEFAULT_VIEW].layers);

  /** Сонгосон бүс — БҮХ давхарга, БҮХ тоо үүгээр шүүгдэнэ */
  const [zone, setZone] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, unknown> | null>(null);
  const [pickedLayer, setPickedLayer] = useState<string | null>(null);
  const { theme, toggle } = useTheme();

  const setView = useCallback((v: ViewKey) => {
    setViewState(v);
    // Харагдацын давхаргууд бүгд ил — эхлэх байдал үргэлж утга учиртай
    setVisible(VIEW_BY_KEY[v].layers);
    // ⚠️ Өмнөх харагдацын сонголт шинэ давхаргын талбарын нэрсээр уншигдвал
    //    бүх мөр «Бүртгэгдээгүй» болно
    setPicked(null);
    setPickedLayer(null);
  }, []);

  const pick = useCallback((attrs: Record<string, unknown> | null, layerId: string | null) => {
    setPicked(attrs);
    setPickedLayer(layerId);
  }, []);

  const active = VIEW_BY_KEY[view];

  return (
    <MapProvider>
      <div className={s.shell} style={{ '--hue': active.hue } as CSSProperties}>
        <header className={s.head}>
          <div className={s.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className={s.logo} />
            <span className={s.brandText}>
              <h1 className={s.brandName}>Сэлбэ 20 минутын хот</h1>
              <span className={s.brandSub}>Ерөнхий төлөвлөгөө ба төсвийн портал</span>
            </span>
          </div>

          <HeaderStats zone={zone} />

          <div className={s.dimSwitch} role="group" aria-label="Газрын зургийн харагдац">
            {(['2d', '3d'] as Dim[]).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={dim === d}
                className={`${s.dimBtn} ${dim === d ? s.dimOn : ''}`}
                onClick={() => setDim(d)}
              >
                {d.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={s.iconBtn}
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Цайвар горим' : 'Харанхуй горим'}
            title={theme === 'dark' ? 'Цайвар горим' : 'Харанхуй горим'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
          </button>
        </header>

        <div className={s.rail}>
          <ViewRail view={view} setView={setView} />
        </div>

        {/* ⚠️ Зурган дээрх «Давхарга нэмэх» удирдлагыг ХАССАН: зүүн харагдац ба
            баруун самбарын чагт хоёр аль хэдийн байгаа тул гурав дахь газраас
            ижил зүйл хийвэл хаанаас юу удирдагдаж байгаа нь ойлгомжгүй болно. */}
        <div className={s.map}>
          <MapCanvas dim={dim} visible={visible} zone={zone} onPick={pick} />
        </div>

        <aside className={s.panel} id="panel" aria-label={`${active.title} самбар`}>
          <header className={s.panelHead}>
            <span className={s.panelIcon}><Icon name={active.icon} /></span>
            <div>
              <h2 className={s.panelTitle}>{active.title}</h2>
              <p className={s.panelDesc}>{active.desc}</p>
            </div>
          </header>

          <div className={s.panelBody}>
            <ViewPanel
              view={view}
              visible={visible}
              setVisible={setVisible}
              zone={zone}
              setZone={setZone}
              picked={picked}
              pickedLayer={pickedLayer}
            />
          </div>
        </aside>
      </div>
    </MapProvider>
  );
}

/* ── Толгойн ерөнхий үзүүлэлт ── */

function HeaderStats({ zone }: { zone: string | null }) {
  const where = zone ? `${ZONE_FIELD} = ${sqlStr(zone)}` : '1=1';

  const q = useAsync(async () => {
    const Z = ZONE_FIELDS;
    const B = BUILT_FIELDS;
    const [zones, built] = await Promise.all([
      queryStats(layerUrl(ZONE_LAYER), [
        count(OID, 'n'), sum(Z.landHa, 'ga'), sum(Z.households, 'ail'), sum(Z.budget, 'tusuv'),
      ], where),
      queryStats(layerUrl(BUILT_LAYER), [count(OID, 'n'), sum(B.population, 'pop')], where),
    ]);
    return {
      zones: Number(zones.n ?? 0),
      ga: Number(zones.ga ?? 0),
      ail: Number(zones.ail ?? 0),
      budget: Number(zones.tusuv ?? 0),
      built: Number(built.n ?? 0),
      pop: Number(built.pop ?? 0),
    };
  }, [where]);

  if (q.state === 'error') {
    return (
      <div className={s.headStats} role="alert">
        <span className={s.headStatLabel}>Үзүүлэлт татагдсангүй</span>
      </div>
    );
  }
  if (q.state !== 'ready') return <div className={s.headStats} />;

  const items = [
    { v: num(q.data.ga, 1), l: 'га талбай' },
    { v: num(q.data.zones), l: 'бүс' },
    { v: num(q.data.built), l: 'барилга' },
    { v: num(q.data.ail), l: 'айл' },
    { v: num(q.data.pop), l: 'хүн ам' },
    { v: mntShort(q.data.budget), l: '₮ төсөв' },
  ];

  return (
    <div className={s.headStats}>
      {items.map((i) => (
        <div key={i.l} className={s.headStat}>
          <span className={`${s.headStatValue} num`}>{i.v}</span>
          <span className={s.headStatLabel}>{i.l}</span>
        </div>
      ))}
    </div>
  );
}
