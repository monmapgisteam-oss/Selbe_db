'use client';

import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { LocaleToggle } from '@/components/LocaleToggle';
import { useAuth } from './AuthGate';
import dynamic from 'next/dynamic';
import { DocViewer } from './DocViewer';
/* ⚠️ dynamic (2026-08-21 гүйцэтгэлийн аудит): ExecKpi нь analysis стекээ дагуулж
   ирдэг тул статик импортоор нэвтрэх/нүүр хуудасны эхний chunk-д ордог байв.
   Зөвхөн супер хэрэглэгчид л харагддаг хэсэг — хэрэгтэй үед нь татна.
   ⚠️ 2026-08-24: ӨГӨГДЛИЙН ачаалагчид ч тийш нүүсэн (`loadHeadline`,
   `loadHousing`, `loadSocial`…). Ингэснээр нүүрийн эхний chunk улам хөнгөрч,
   супер БУС хэрэглэгч тэдгээр асуулгыг огт ажиллуулахгүй боллоо. */
const ExecKpi = dynamic(() => import('./ExecKpi').then((m) => m.ExecKpi), { ssr: false });
import type { ViewKey } from '@/lib/services';
import s from './home.module.css';

/** Нүүрт товч болж гарах харагдац — мета нь `VIEWS`-ээс ирнэ (`Root` шүүнэ) */
export type HomeView = {
  key: ViewKey;
  title: string;
  desc: string;
  /** ⚠️ Ашиглагдахаа больсон (нэг акцент) — `Root`-ийн дамжуулалттай нийцүүлж үлдээв */
  hue: string;
};

/** Сэдвийн бүлэг — `HOME_SECTIONS` + хамрагдаагүйг цуглуулсан «Бусад» */
export type HomeGroup = {
  id: string;
  title: string;
  views: HomeView[];
};

/**
 * ⚠️ 2026-08-24: `useHomeKpis()` ба түүний `Kpi` төрөл БҮРМӨСӨН УСТСАН
 * (CEO_KPI_PROMPT §6). Нүүр хуудсанд ХОЁР самбар зэрэгцэж байсан нь асуудал
 * байв: энд ангилалгүй 10 нүд, доор нь `ExecKpi`-ийн 9 карт. Газар чөлөөлөлт
 * ГУРВАН газар (`clear` · `cleared` · ExecKpi-ийн `clearance`), гүйцэтгэл ХОЁР
 * газар давхардаж, «158 га» гэх ХЭМЖЭЭНИЙ тоо статустай үзүүлэлттэй ижил
 * харагдаж «сайн уу муу юу» гэсэн утгагүй асуулт төрүүлж байлаа.
 *
 * Одоо БҮХ үзүүлэлт `ExecKpi`-ийн таван сэдэвчилсэн ангилалд амьдарна —
 * эдгээр нүд «Хамрах хүрээ» ангилалд `neutral` төлөвтэйгээр шингэсэн.
 * Ачаалагчид (`loadHeadline`, `loadHousing`, `loadSocial` г.м.) тийш нүүсэн
 * бөгөөд бүгд `cached` тул ХҮСЭЛТИЙН ТОО НЭМЭГДЭЭГҮЙ.
 */

/** Нэрнээс товч үсэг (avatar) — эхний хоёр үгийн эхний үсэг */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * НҮҮР ХУУДАС — ЕРӨНХИЙ KPI ДАШБОАРД.
 *
 * ⚠️ 2026-08-18 (хэрэглэгчийн шийдвэр): ДЭВСГЭР ЗУРАГ ХАСАГДАВ. Урьд нь 444KB
 * агаарын зураг + харанхуй scrim + тор дээр цагаан бичиг байсан — гоё ч
 * (а) 444KB нь эхний зурагтыг удаашруулдаг, (б) хагас тунгалаг бичиг нь
 * үзүүлэлтийн тоог уншихад муу, (в) порталын дотоод дүр төрхөөс ТЭС өөр тул
 * орох үед харагдац огцом үсэрдэг байв. Одоо порталтай ИЖИЛ гадаргуу, ижил
 * токен — нүүр нь порталын нэг хэсэг мэт үргэлжилнэ.
 */
export function Home({
  onEnterAll,
  groups,
  onEnterView,
  docsAllowed = true,
  isSuper = false,
}: {
  /** «Нэвтрэх» / «Орох» — эрхийн дагуу орох цэгт хүргэнэ */
  onEnterAll: () => void;
  groups: HomeGroup[];
  onEnterView: (key: ViewKey) => void;
  /**
   * «Баримт бичиг» цэс харагдах эсэх — хэрэглэгчийн `docs` эрх.
   *
   * ⚠️ 2026-08-21: Урьд нь энэ товч ЭРХ ШАЛГАЛГҮЙ гардаг байв. Порталын
   * хажуугийн цэс нь `docsAllowed`-оор зөв хаадаг байсан тул `docs: false`
   * эрхтэй хэрэглэгч дотор нь орвол баримт бичгийг олохгүй ч, НҮҮР хуудсанд
   * нь товч нь бүрэн ажиллаж байлаа — эрхийн хязгаарлалт тал хувьдаа л
   * үйлчилж байсан гэсэн үг.
   */
  docsAllowed?: boolean;
  /**
   * «Сэлбэ ухаалаг хот» самбар ЗӨВХӨН супер хэрэглэгчид (2026-08-21,
   * хэрэглэгчийн хүсэлт) — нүүр нь дэд самбар болж, энгийн хэрэглэгчид зөвхөн
   * платформын хэсгүүдийн навигаци үлдэнэ.
   */
  isSuper?: boolean;
}) {
  const { status, user, signOut } = useAuth();

  /** Нээлттэй сэдвийн id — нэг зэрэг ГАНЦ dropdown */
  const [open, setOpen] = useState<string | null>(null);
  /** Баримт үзэгч нээлттэй эсэх */
  const [docs, setDocs] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  /**
   * Гадуур дарах ба Escape — dropdown хаана.
   *
   * ⚠️ `pointerdown` (click БИШ): доторх товчны `click` ажиллахаас ӨМНӨ гадуурх
   * даралт бүртгэгдэх ёстой. `click`-ээр сонсвол сонголт хийх агшинд эхлээд
   * хаагдаад, зарим browser-т дарагдалт алдагддаг.
   */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={s.home}>
      {/* ── Дээд навигацийн зурвас — лого · цэс · нэвтрэлт ── */}
      <header className={s.navbar}>
        <div className={s.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className={s.logo} />
          <span className={s.brandDivider} aria-hidden />
          <span className={s.brandText}>
            {/* ⚠️ 2026-08-24, хэрэглэгчийн шийдвэр: «20 минутын хот» → «Ухаалаг
                хот». `Landing.tsx`-ийн дэд гарчиг ЭНЭ мөртэй ижил байх ёстой —
                хоёрыг зэрэг л өөрчилнө.
                ⚠️ ЛОГОНЫ дотор бичигдсэн «20 МИНУТЫН ХОТ» нь `public/logo.svg`
                дахь ЗУРСАН зам (path) тул кодоос өөрчлөгдөхгүй — тэр файлыг
                дизайнераар шинэчлэх шаардлагатай. */}
            <b>{tr('СЭЛБЭ')}</b> {tr('Ухаалаг хот')}
            <small className={s.brandTag}>Digital Twin Platform</small>
          </span>
        </div>

        <div className={s.spacer} aria-hidden />

        {/* ── Сэдвийн цэс — дарахад доош dropdown нээгдэнэ ── */}
        {groups.length > 0 && (
          <nav
            className={s.menuRow}
            ref={bar}
            aria-label={tr('Платформын хэсгүүд')}
            /**
             * ⚠️ Зөвхөн ХУЛГАНА. Хүрэлтэнд (`touch`) hover гэж байхгүй — хуруу
             * хүрэхэд `pointerenter` мөн буудаг тул шүүхгүй бол цэс нээгдээд,
             * араас нь `click` ирж шууд хаагдана.
             */
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(null); }}
          >
            {groups.map((g) => {
              const on = open === g.id;
              return (
                <div
                  key={g.id}
                  className={s.menuItem}
                  onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(g.id); }}
                >
                  <button
                    type="button"
                    className={`${s.menuBtn} ${on ? s.menuBtnOn : ''}`}
                    aria-expanded={on}
                    aria-haspopup="true"
                    /* Хүрэлт ба ГАР (Enter/Space)-т — hover байхгүй тул товшилт хэвээр */
                    onClick={() => setOpen(on ? null : g.id)}
                  >
                    {g.title}
                    <span className={`${s.caret} ${on ? s.caretOn : ''}`} aria-hidden>▾</span>
                  </button>

                  {on && (
                    <div className={s.dropdown} role="menu">
                      {g.views.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          role="menuitem"
                          className={s.viewBtn}
                          onClick={() => { setOpen(null); onEnterView(v.key); }}
                          title={v.desc}
                        >
                          <span className={s.viewText}>
                            <span className={s.viewTitle}>{v.title}</span>
                            <span className={s.viewDesc}>{v.desc}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* «Баримт бичиг» — задрахгүй, ГАНЦ товч. `docs` эрхгүй бол ОГТ
                зурагдахгүй (идэвхгүй болгохгүй): байхгүй эрхийг саарал товчоор
                сануулах нь хэрэглэгчид ямар ч тус болохгүй. */}
            {docsAllowed && (
              <button
                type="button"
                className={s.menuBtn}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(null); }}
                onClick={() => { setOpen(null); setDocs(true); }}
              >
                {tr('Баримт бичиг')}
              </button>
            )}
          </nav>
        )}

        <div className={s.spacer} aria-hidden />

        <div className={s.auth}>
          <LocaleToggle />
          {status === 'signed-in' && user ? (
            <>
              <span className={s.userChip}>
                {user.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.thumbnail} alt="" className={s.avatar} />
                ) : (
                  <span className={s.avatarFallback} aria-hidden>{initials(user.fullName)}</span>
                )}
                <span className={s.userName}>{user.fullName}</span>
              </span>
              {/* Нэвтэрсэн хэрэглэгч порталд ОРОХ — эс бөгөөс нүүр хуудсанд гацна */}
              <button type="button" className={`${s.signBtn} ${s.signIn}`} onClick={onEnterAll}>
                {tr('Порталд орох')}
                <span className={s.signInArrow} aria-hidden>→</span>
              </button>
              <button type="button" className={s.signBtn} onClick={signOut}>{tr('Гарах')}</button>
            </>
          ) : (
            <button type="button" className={`${s.signBtn} ${s.signIn}`} onClick={onEnterAll}>
              {tr('Нэвтрэх')}
              <span className={s.signInArrow} aria-hidden>→</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Дашбоард — ЗӨВХӨН СУПЕР (дэд самбар, 2026-08-21) ── */}
      {isSuper && (
      <main className={s.board}>
        <header className={s.boardHead}>
          <div>
            {/* ⚠️ Эх текст нь ЕРДИЙН бичиглэлтэй — `.title` нь
                `text-transform: uppercase` тул дэлгэцэд «СЭЛБЭ УХААЛАГ ХОТ»
                болж гарна. Түлхүүрийг том үсгээр бичвэл толь бусад мөрүүдээсээ
                салж, дараа нь хайхад хэцүү болно. */}
            <h1 className={s.title}>{tr('Сэлбэ ухаалаг хот')}</h1>
            {/* ⚠️ Албан ёсны үг хэллэг — бүтэн өгүүлбэр, үйл үгээр төгсөнө */}
            <p className={s.lede}>
              {tr('Төслийн үндсэн үзүүлэлтийг ArcGIS мэдээллийн сангаас шууд нэгтгэн харуулав.')}
            </p>
          </div>
          {/* ⚠️ 2026-08-24: «Нийт гүйцэтгэл» зурвас ЭНДЭЭС ХАСАГДАВ. Тэр нь
              `loadProjectProgress().actual`-ыг харуулдаг байсан бөгөөд доорх
              «Хугацаа» ангиллын гүйцэтгэлтэй ХОЁР ӨӨР тоо болж зэрэгцэж байлаа —
              яг тэр зөрүү нь §7-A асуултын шалтгаан. Гүйцэтгэл одоо ГАНЦ
              газар: «Хугацаа» ангиллын «Барилга угсралтын гүйцэтгэл». */}
        </header>

        {/* Удирдлагын НЭГ самбар — таван сэдэвчилсэн ангилал, гурван түвшний өнгө */}
        <ExecKpi onView={onEnterView} />
      </main>
      )}

      {/* Баримт үзэгч — порталынхтай ИЖИЛ компонент, нэвтрэх шаардлагагүй */}
      {/* ⚠️ `docsAllowed`-ыг ЭНД дахин шалгана — эрх нь ажиллаж байх үед (super
          admin панелаас) буурвал нээлттэй байсан цонх өөрөө хаагдана. */}
      <DocViewer open={docsAllowed && docs} onClose={() => setDocs(false)} />
    </div>
  );
}
