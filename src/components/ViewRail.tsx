'use client';

import { type CSSProperties } from 'react';
import { Icon } from './Icon';
import { VIEWS, type ViewKey } from '@/lib/services';
import s from './tree.module.css';

/**
 * Зүүн багана — ХОЁР харагдац.
 *
 * ⚠️ Урьд нь энд 6 товч байв (бүс, барилга, инженер, зам, ногоон, хяналт).
 * Тэдгээрийн эхний тав нь БҮГД нэг үйлчилгээ, нэг ерөнхий төлөвлөгөөний хэсэг
 * тул хиймэл хуваалт болж, хэрэглэгч давхаргаа хайхад таван товч нээх
 * шаардлагатай болдог байлаа. Одоо «Ерөнхий мэдээлэл» дарахад БҮХ давхарга нэг
 * жагсаалтад багцалж гарна.
 *
 * ⚠️ Идэвхтэй харагдац дээр ДАХИН дарахад жагсаалт хумигдана/дэлгэгдэнэ — эс
 * бөгөөс жагсаалтыг хаачихсан хэрэглэгч дахин нээх арга олохгүй.
 */
export function ViewRail({
  view,
  setView,
  catalogOpen,
}: {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  /** Давхаргын каталогийн багана нээлттэй эсэх — сумны чиглэлээр заана */
  catalogOpen: boolean;
}) {
  return (
    <nav className={s.rail} aria-label="Харагдац">
      <div className={s.railHead}>Харагдац</div>

      {VIEWS.map((v) => {
        const on = v.key === view;
        // Каталогтой харагдацууд — тусдаа бүрэн дэлгэцтэй (дашбоард, анализ) нь үгүй
        const expandable = !v.standalone;
        const expanded = expandable && on && catalogOpen;
        return (
          <button
            key={v.key}
            type="button"
            aria-current={on}
            {...(expandable ? { 'aria-expanded': expanded } : {})}
            className={`${s.item} ${on ? s.itemOn : ''}`}
            style={{ '--tone': v.hue } as CSSProperties}
            onClick={() => setView(v.key)}
          >
            <span className={s.icon}><Icon name={v.icon} /></span>
            <span className={s.text}>
              <span className={s.title}>{v.title}</span>
              <span className={s.desc}>{v.desc}</span>
            </span>
            {expandable && (
              <span className={`${s.chev} ${expanded ? s.chevOn : ''}`} aria-hidden>›</span>
            )}
          </button>
        );
      })}

      <p className={s.foot}>
        Харагдац дарахад хажууд нь давхаргын жагсаалт дэлгэгдэнэ. Зураг дээр
        хулгана аваачихад товч мэдээлэл, дарахад дэлгэрэнгүй нь баруун талд гарна.
      </p>
    </nav>
  );
}
