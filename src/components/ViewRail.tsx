'use client';

import { Fragment } from 'react';
import { Icon } from './Icon';
import { VIEWS, ALL_MODE_HIDE, type ViewKey } from '@/lib/services';
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
  collapsed = false,
  navScope = 'all',
  onDocs,
  docsActive = false,
}: {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  /** Давхаргын каталогийн багана нээлттэй эсэх — сумны чиглэлээр заана */
  catalogOpen: boolean;
  /**
   * Навигацийн ХҮРЭЭ. `'all'` = БҮХ харагдац; харагдацын жагсаалт бол зөвхөн
   * тэдгээр. ТЭЗҮ баримт нь аль ч тохиолдолд байнга (доор).
   *
   * ⚠️ 2026-08-13-аас хойш `Root` нь ҮРГЭЛЖ `'all'` дамжуулж, эрхээр л хайчилдаг
   * болсон — сэдвийн хязгаарлалт хасагдсан. Жагсаалтын горим нь эрх хязгаарлагдмал
   * хэрэглэгчид л ажиллана.
   */
  navScope?: 'all' | ViewKey[];
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
  /** ХУРААГДСАН босоо горим — зөвхөн дүрс үлдэнэ (нэр tooltip-д) */
  collapsed?: boolean;
}) {
  {/* «ТЭЗҮ-БОНУ» баримт — харагдацуудтай ИЖИЛ хэлбэрээр.
      Харагдац биш, popup нээдэг тул `aria-current` биш `aria-pressed`.
      ⚠️ 2026-08-17: Урьд нь `header &&` гэж хаагдсан байсан тул БОСОО (зүүн
      багана) горимд огт гардаггүй байв. Одоо хоёуланд. */}
  const docsButton = onDocs ? (
    <button
      type="button"
      aria-pressed={docsActive}
      aria-label="ТЭЗҮ-БОНУ баримт бичиг"
      title="ТЭЗҮ ба судалгааны баримт бичиг"
      className={`${s.item} ${s.docItem} ${docsActive ? s.itemOn : ''}`}
      onClick={onDocs}
    >
      {!header && <span className={s.no} aria-hidden />}
      <span className={s.icon}><Icon name="file" /></span>
      <span className={s.text}>
        <span className={s.title}>ТЭЗҮ-БОНУ</span>
      </span>
    </button>
  ) : null;

  /**
   * НАВИГАЦИД харагдах харагдацууд — `navScope`-ийг `Root` бүрэн бодож өгнө.
   * `'all'` = «Удирдлага» (бүгд, `ALL_MODE_HIDE`-аас бусад); эс бөгөөс тэр
   * сэдвийн жагсаалт. Сэдэв солихын тулд «Нүүр» рүү буцна.
   */
  const shown =
    navScope === 'all'
      ? VIEWS.filter((v) => !ALL_MODE_HIDE.includes(v.key))
      : VIEWS.filter((v) => navScope.includes(v.key));

  return (
    <nav className={header ? s.railRow : `${s.rail} ${collapsed ? s.railMin : ''}`} aria-label="Харагдац">
      {!header && <div className={s.railHead}>Харагдац</div>}

      {shown.map((v, i) => {
        const on = v.key === view;
        // Каталогтой харагдацууд — тусдаа бүрэн дэлгэцтэй (дашбоард, анализ) нь үгүй.
        // ⚠️ Толгойн хэвтээ горимд каталог нь зурган дээрх «Давхарга» товчоор
        //    нээгддэг тул таб задардаггүй — сум харуулахгүй. Босоо (зүүн) горимд
        //    л таб дээрх сумаар каталог дэлгэгдэнэ.
        const expandable = !v.standalone && !header;
        const expanded = expandable && on && catalogOpen;
        return (
          <Fragment key={v.key}>
          <button
            type="button"
            aria-current={on}
            aria-label={v.title}
            /* Нарийн дэлгэцэд шошго нуугдаж зөвхөн дүрс үлдэх тул нэрийг tooltip-д */
            title={v.title}
            {...(expandable ? { 'aria-expanded': expanded } : {})}
            className={`${s.item} ${on ? s.itemOn : ''}`}
            onClick={() => setView(v.key)}
          >
            {/* envhub-ийн хэлтсийн жагсаалт шиг дугаарлалт — зөвхөн БОСОО горимд.
                Дараалал нь мэдээлэл БИШ, зөвхөн нүдээр хөтлөх зүүн зангуу. */}
            {!header && <span className={`${s.no} num`} aria-hidden>{String(i + 1).padStart(2, '0')}</span>}
            <span className={s.icon}><Icon name={v.icon} /></span>
            <span className={s.text}>
              <span className={s.title}>{v.title}</span>
              {!header && <span className={s.desc}>{v.desc}</span>}
            </span>
            {expandable && (
              <span className={`${s.chev} ${expanded ? s.chevOn : ''}`} aria-hidden>›</span>
            )}
          </button>
          </Fragment>
        );
      })}

      {/* ТЭЗҮ-БОНУ товч — БҮХ сэдэвт харагдана (харагдацуудын ард, толгойн горимд).
          ⚠️ Урьд нь «Ерөнхий дашбоард»-ын ард байсан тул тэр харагдацгүй сэдэвт
             алга болдог байв; одоо сэдвээс үл хамааран төгсгөлд байнга. */}
      {/* envhub-ийн «СИСТЕМ» бүлэг шиг — баримт бичиг нь харагдацуудаас
          зураасаар тусгаарлагдсан ӨӨР төрлийн зүйл (popup, харагдац биш). */}
      {!header && docsButton && <div className={s.railHead}>Баримт</div>}
      {docsButton}
    </nav>
  );
}
