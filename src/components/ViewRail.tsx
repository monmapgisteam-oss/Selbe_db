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
  header = false,
  onDocs,
  docsActive = false,
}: {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  /** Давхаргын каталогийн багана нээлттэй эсэх — сумны чиглэлээр заана */
  catalogOpen: boolean;
  /**
   * Толгойн ХЭВТЭЭ хувилбар — зүүн баганы оронд толгойд таб болж багтана.
   * ⚠️ Тайлбар текст (desc), гарчиг, доод тусламж хасагдаж, зөвхөн дүрс + нэр
   * үлдэнэ: 56px өндөр толгойд бүтэн босоо мод багтахгүй.
   */
  header?: boolean;
  /** «ТЭЗҮ-БОНУ» баримтын popup нээх — байвал табуудын ХАЖУУД нэг бүлэгт орно */
  onDocs?: () => void;
  /** Popup нээлттэй эсэх (идэвхтэй тэмдэг) */
  docsActive?: boolean;
}) {
  return (
    <nav className={header ? s.railRow : s.rail} aria-label="Харагдац">
      {!header && <div className={s.railHead}>Харагдац</div>}

      {VIEWS.map((v) => {
        const on = v.key === view;
        // Каталогтой харагдацууд — тусдаа бүрэн дэлгэцтэй (дашбоард, анализ) нь үгүй.
        // ⚠️ Толгойн хэвтээ горимд каталог нь зурган дээрх «Давхарга» товчоор
        //    нээгддэг тул таб задардаггүй — сум харуулахгүй. Босоо (зүүн) горимд
        //    л таб дээрх сумаар каталог дэлгэгдэнэ.
        const expandable = !v.standalone && !header;
        const expanded = expandable && on && catalogOpen;
        return (
          <button
            key={v.key}
            type="button"
            aria-current={on}
            aria-label={v.title}
            /* Нарийн дэлгэцэд шошго нуугдаж зөвхөн дүрс үлдэх тул нэрийг tooltip-д */
            title={v.title}
            {...(expandable ? { 'aria-expanded': expanded } : {})}
            className={`${s.item} ${on ? s.itemOn : ''}`}
            style={{ '--tone': v.hue } as CSSProperties}
            onClick={() => setView(v.key)}
          >
            <span className={s.icon}><Icon name={v.icon} /></span>
            <span className={s.text}>
              <span className={s.title}>{v.title}</span>
              {!header && <span className={s.desc}>{v.desc}</span>}
            </span>
            {expandable && (
              <span className={`${s.chev} ${expanded ? s.chevOn : ''}`} aria-hidden>›</span>
            )}
          </button>
        );
      })}

      {/* «ТЭЗҮ-БОНУ» баримт — харагдацын табуудтай НЭГ бүлэгт, ижил хэлбэрээр.
          Харагдац биш, popup нээдэг тул `aria-current` биш `aria-pressed`. */}
      {header && onDocs && (
        <button
          type="button"
          aria-pressed={docsActive}
          aria-label="ТЭЗҮ-БОНУ баримт бичиг"
          title="ТЭЗҮ ба судалгааны баримт бичиг"
          className={`${s.item} ${s.docItem} ${docsActive ? s.itemOn : ''}`}
          style={{ '--tone': '#16a34a' } as CSSProperties}
          onClick={onDocs}
        >
          <span className={s.icon}><Icon name="file" /></span>
          <span className={s.text}>
            <span className={s.title}>ТЭЗҮ-БОНУ</span>
          </span>
        </button>
      )}

      {!header && (
        <p className={s.foot}>
          Харагдац дарахад хажууд нь давхаргын жагсаалт дэлгэгдэнэ. Зураг дээр
          хулгана аваачихад товч мэдээлэл, дарахад дэлгэрэнгүй нь баруун талд гарна.
        </p>
      )}
    </nav>
  );
}
