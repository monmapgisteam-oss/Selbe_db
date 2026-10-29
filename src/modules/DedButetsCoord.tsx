'use client';

/**
 * КООРДИНАТААР ЦЭГ ТАВИХ (2026-10-14, хэрэглэгчийн хүсэлт: «зурж нэмэхдээ баруун товшиход WGS
 * болон UTM 48-аар буюу координатаар цэг тавьдаг болго»).
 *
 *   · Баруун товшсон цэгийн координатаар УРЬДЧИЛАН бөглөгдөнө — засаад «Тавих».
 *   · Хоёр систем: WGS84 (өргөрөг, уртраг · градус) ба UTM 48N (зүүн E, хойд N · метр).
 *     Систем солиход оруулсан утга нөгөөд ХӨРВҮҮЛЭГДЭЖ үлдэнэ.
 *   · Монголын хүрээнээс гадуурх утга (өргөрөг/уртраг сольсон г.м.) — анхааруулж, тавихгүй.
 */

import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { fromUtm48, inMongolia, toUtm48 } from '@/lib/utm48';
import d from './dedButets.module.css';

export type CoordSys = 'wgs' | 'utm';
const SYS_KEY = 'selbe.butets.coordSys';

/** Сүүлд сонгосон систем — хэрэглэгч бүрийн дэлгэцийн тохиргоо */
export function loadCoordSys(): CoordSys {
  try { return localStorage.getItem(SYS_KEY) === 'utm' ? 'utm' : 'wgs'; } catch { return 'wgs'; }
}

const fmt = (v: number, digits: number) => (Number.isFinite(v) ? v.toFixed(digits) : '');
const parse = (s: string) => {
  const v = Number(s.trim().replace(/\s+/g, '').replace(',', '.'));
  return s.trim() && Number.isFinite(v) ? v : null;
};

export function CoordPopup({ at, start, title, onPut, onClose }: {
  /** Дэлгэцийн байрлал (баруун товшилт) — `null` бол дэлгэцийн голд */
  at: { x: number; y: number } | null;
  /** Урьдчилан бөглөх цэг (WGS84) */
  start: { lat: number; lon: number } | null;
  title: string;
  onPut: (p: { lat: number; lon: number }) => void;
  onClose: () => void;
}) {
  const [sys, setSys] = useState<CoordSys>(loadCoordSys);
  const init = (s: CoordSys): [string, string] => {
    if (!start) return ['', ''];
    if (s === 'wgs') return [fmt(start.lat, 7), fmt(start.lon, 7)];
    const u = toUtm48(start.lat, start.lon);
    return [fmt(u.e, 3), fmt(u.n, 3)];
  };
  const [[a, b], setAB] = useState<[string, string]>(() => init(loadCoordSys()));
  const [err, setErr] = useState('');
  const first = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { first.current?.focus(); first.current?.select(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);

  /** Одоогийн оролтыг WGS84 болгоно — алдаатай бол `null` */
  const toWgs = (s: CoordSys, x: string, y: string): { lat: number; lon: number } | null => {
    const p = parse(x);
    const q = parse(y);
    if (p == null || q == null) return null;
    return s === 'wgs' ? { lat: p, lon: q } : fromUtm48(p, q);
  };

  const switchSys = (next: CoordSys) => {
    if (next === sys) return;
    const g = toWgs(sys, a, b);
    if (g) {
      if (next === 'wgs') setAB([fmt(g.lat, 7), fmt(g.lon, 7)]);
      else { const u = toUtm48(g.lat, g.lon); setAB([fmt(u.e, 3), fmt(u.n, 3)]); }
    }
    setSys(next);
    setErr('');
    try { localStorage.setItem(SYS_KEY, next); } catch { /* хувийн горим */ }
  };

  const put = () => {
    const g = toWgs(sys, a, b);
    if (!g) { setErr(tr('Хоёр утгыг тоогоор бөглөнө үү.')); return; }
    if (!inMongolia(g.lat, g.lon)) {
      setErr(sys === 'wgs'
        ? tr('Цэг Монголын нутгаас гадна гарч байна — өргөрөг, уртрагийг сольж бичсэн эсэхээ шалгана уу.')
        : tr('Цэг Монголын нутгаас гадна гарч байна — зүүн (E), хойд (N) утгыг шалгана уу.'));
      return;
    }
    onPut(g);
  };

  /* Дэлгэцийн ирмэгээс хальж гарахгүй байрлал */
  const W = 280;
  const style: React.CSSProperties = at
    ? {
      left: Math.max(8, Math.min(at.x + 8, (typeof window !== 'undefined' ? window.innerWidth : 1200) - W - 8)),
      top: Math.max(8, Math.min(at.y + 8, (typeof window !== 'undefined' ? window.innerHeight : 800) - 250)),
      width: W,
    }
    : { left: '50%', top: '30%', transform: 'translateX(-50%)', width: W };

  const labels = sys === 'wgs'
    ? [tr('Өргөрөг (°)'), tr('Уртраг (°)')]
    : [tr('Зүүн E (м)'), tr('Хойд N (м)')];

  return (
    <div ref={box} className={d.coordPop} style={style} role="dialog" aria-label={title}
      onContextMenu={(e) => e.preventDefault()}>
      <div className={d.coordHead}>
        <span>{title}</span>
        <button type="button" className={d.close} onClick={onClose} aria-label={tr('Хаах')}>✕</button>
      </div>
      <div className={d.coordSys} role="radiogroup" aria-label={tr('Координатын систем')}>
        {([['wgs', 'WGS84'], ['utm', 'UTM 48N']] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={sys === k}
            className={`${d.coordSysBtn} ${sys === k ? d.coordSysOn : ''}`} onClick={() => switchSys(k)}>
            {l}
          </button>
        ))}
      </div>
      <form className={d.coordForm} onSubmit={(e) => { e.preventDefault(); put(); }}>
        <label>
          <span>{labels[0]}</span>
          <input ref={first} className={d.input} inputMode="decimal" value={a}
            onChange={(e) => { setAB([e.target.value, b]); setErr(''); }} />
        </label>
        <label>
          <span>{labels[1]}</span>
          <input className={d.input} inputMode="decimal" value={b}
            onChange={(e) => { setAB([a, e.target.value]); setErr(''); }} />
        </label>
        {err && <p className={d.coordErr} role="alert">{err}</p>}
        <div className={d.actions}>
          <span className={d.spacer} />
          <button type="button" className={d.btn} onClick={onClose}>{tr('Болих')}</button>
          <button type="submit" className={`${d.btn} ${d.primary}`}>{tr('Цэг тавих')}</button>
        </div>
      </form>
    </div>
  );
}
