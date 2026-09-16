'use client';

/**
 * СИСТЕМИЙН СХЕМ — порталын БҮХНИЙГ НЭГ зурагт.
 *
 * ⚠️ «Үйл ажиллагааны схем» (`Schem.tsx`)-ТЭЙ ХОЛИХГҮЙ. Тэр нь БАРИЛГЫН
 * ТӨСЛИЙН урсгал; энэ нь ПРОГРАМЫН бүтэц.
 *
 * ⚠️ ЗУРАХ ЛОГИКИЙГ `schem.ts`-ЭЭС АВНА (`layoutOf`, `edgePath`). Хоёр газар
 * бичвэл нэгийг зассан үед нөгөө нь чимээгүй зөрж, ирмэг зангилаанаасаа
 * тасарна — `schem.ts` дээр яг энэ шалтгаанаар нэг функц болгосон.
 *
 * ⚠️ КАРТ ДАРАХАД ХАРАГДАЦ РУУ ҮСРЭХГҮЙ (`Schem.tsx`-ийн 2026-09-01-ний
 * шийдвэртэй ижил): дарахад ДЭЛГЭРЭНГҮЙ самбар нээгдэнэ, шилжилт нь
 * самбар доторх ИЛ товч. Урьд нь дарах = шилжих байсан тул схем дээр байж
 * дэлгэрэнгүйг харах арга ОГТ байхгүй байв.
 *
 * ⚠️ МАСШТАБ нь контейнерийн ӨРГӨНӨӨС — схем нь тогтмол харьцаатай тул
 * өндрөөр бариулбал өргөний ихэнх нь хоосон үлдэнэ.
 */

import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Icon } from '@/components/Icon';
import { edgePath, layoutOf } from '@/lib/schem';
import { SYS_EDGES, SYS_GEO, SYS_LEGEND, SYS_NODES, type SysId, type SysNode } from '@/lib/sysSchem';
import type { ViewKey } from '@/lib/services';
import s from './sysSchem.module.css';

const L = layoutOf(SYS_NODES, SYS_GEO);
const BY_ID = Object.fromEntries(SYS_NODES.map((n) => [n.id, n])) as Record<SysId, SysNode>;

export function SysSchemView({
  setView,
  onDoc,
}: {
  /** Харагдац руу шилжих — самбарын ИЛ товчоор */
  setView?: (v: ViewKey) => void;
  /** Баримтын бүлэг нээх */
  onDoc?: (id: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const [sel, setSel] = useState<SysId | null>(null);

  /**
   * ⚠️ Масштабыг ResizeObserver-ээр — цонх солигдоход схем багтсан хэвээр
   * үлдэнэ. `1`-ээс ИХ болгохгүй: том дэлгэцэд картыг сунгавал бичиг
   * бүдгэрч, зурсан хэмжээнээсээ гажина.
   */
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth - 24;
      const h = el.clientHeight - 24;
      /* ⚠️ Доод хязгаар 0.55 (2026-09-16): 0.42-д карт 80×44px, гарчиг ~5px —
         уншигдахгүй. Түүнээс нарийн дэлгэцэд канвас ГҮЙЛГЭГДЭНЭ. */
      setK(Math.min(1, Math.max(0.55, Math.min(w / L.w, h / L.h))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const node = sel ? BY_ID[sel] : null;

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <div>
          <h2 className={s.title}>{tr('Системийн схем')}</h2>
          <p className={s.sub}>
            {tr('Өгөгдөл хаанаас ирж, хэрхэн боловсрогдож, хаашаа буцаж бичигддэг')}
          </p>
        </div>
        <ul className={s.legend}>
          {SYS_LEGEND.map((g) => (
            <li key={g.tone}>
              <span className={`${s.dot} ${s[`t_${g.tone}`]}`} aria-hidden />
              {g.label}
            </li>
          ))}
        </ul>
      </div>

      <div className={s.canvas} ref={wrap}>
        {/* ⚠️ Гадна боодол нь МАСШТАБЛАГДСАН хэмжээтэй — `transform` нь layout-д
            нөлөөлдөггүй тул түүнгүйгээр гүйлгэх талбай зурсан хэмжээгээрээ
            (1262×712) үлдэж, жижиг дэлгэцэд хоосон зай гүйлгэгддэг байв. */}
        <div style={{ width: L.w * k, height: L.h * k, flex: 'none' }}>
        <div className={s.stage} style={{ width: L.w, height: L.h, transform: `scale(${k})` }}>
          <svg
            className={s.edges}
            width={L.w}
            height={L.h}
            viewBox={`0 0 ${L.w} ${L.h}`}
            aria-hidden="true"
          >
            <defs>
              <marker id="sys-a" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
                orient="auto" markerUnits="strokeWidth">
                <path d="M0 0 L7 3.5 L0 7 z" fill="var(--line-strong)" />
              </marker>
              <marker id="sys-b" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
                orient="auto" markerUnits="strokeWidth">
                <path d="M0 0 L7 3.5 L0 7 z" fill="var(--bad)" />
              </marker>
            </defs>
            {SYS_EDGES.map((e) => {
              const d = edgePath(L.box[e.from], L.box[e.to], e.kind);
              const cls = e.kind === 'back' ? s.edgeBack : e.kind === 'feed' ? s.edgeFeed : s.edgeMain;
              return (
                <path
                  key={`${e.from}-${e.to}-${e.kind}`}
                  d={d}
                  className={cls}
                  markerEnd={`url(#${e.kind === 'back' ? 'sys-b' : 'sys-a'})`}
                />
              );
            })}
          </svg>

          {SYS_NODES.map((n) => {
            const b = L.box[n.id];
            return (
              <button
                key={n.id}
                type="button"
                aria-pressed={sel === n.id}
                className={`${s.card} ${s[`t_${n.tone}`]} ${sel === n.id ? s.cardOn : ''}`}
                style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
                onClick={() => setSel((p) => (p === n.id ? null : n.id))}
              >
                <span className={s.cardIcon}><Icon name={n.icon} /></span>
                <span className={s.cardTitle}>{n.title}</span>
                <span className={s.cardDesc}>{n.desc}</span>
              </button>
            );
          })}
        </div>
        </div>
      </div>

      {/* ⚠️ Самбар нь схемийн ДООР — хажууд тавибал схем хумигдаж, схемийн
          зорилго болох «бүхнийг нэг дор харах» алдагдана. */}
      {node && (
        <aside className={s.panel}>
          <div className={s.panelHead}>
            <span className={`${s.dot} ${s[`t_${node.tone}`]}`} aria-hidden />
            <strong>{node.title}</strong>
            <button
              type="button"
              className={s.close}
              aria-label={tr('Хаах')}
              onClick={() => setSel(null)}
            >
              ✕
            </button>
          </div>
          <p className={s.panelDesc}>{node.desc}</p>
          <div className={s.panelActs}>
            {node.view && setView && (
              <button type="button" className={s.act} onClick={() => setView(node.view as ViewKey)}>
                {tr('Харагдац нээх')}
              </button>
            )}
            {node.doc && onDoc && (
              <button type="button" className={s.actGhost} onClick={() => onDoc(node.doc as string)}>
                {tr('Дэлгэрэнгүй унших')}
              </button>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
