/**
 * ФОКУСЫН УРХИ — модал цонхны гарын навигацийг дотор нь түгжинэ.
 *
 * ⚠️ ЯАГААД ХЭРЭГТЭЙ ВЭ (2026-09-03-ны хэрэглэгч талын аудит): порталд
 * `role="dialog"` бүхий 9 модал байсан ч фокусын урхи НЭГ Ч ГАЗАР байгаагүй.
 * `aria-modal="true"` нь дэлгэц уншигчид «ард нь юу ч байхгүй» гэж хэлдэг ч
 * ХӨТЧИЙН Tab-д ямар ч нөлөөгүй: Tab дарсаар байхад фокус модалаас гарч,
 * ард байгаа хуудсанд (харагдахгүй товч, хүснэгтийн нүд) шилждэг байв.
 * Гар ашигладаг хүн «фокус хаана байгаа»-гаа алдаж, Escape дарахаас өөр
 * гарц үлддэггүй.
 *
 * ⚠️ НЭЭХЭД фокусыг модал руу оруулна, ХААХАД өмнөх элемент рүү нь БУЦААНА —
 * эс тэгвээс модал хаагдмагц фокус `<body>`-д унаж, Tab нь хуудасны ЭХНЭЭС
 * дахин эхэлдэг (гараар ажилладаг хүнд хамгийн ядаргаатай зан).
 *
 * ⚠️ Фокус авах чадвартай элементийг ЖАГСААЛТЫГ ТУС БҮР ДАХИН уншина
 * (кэшлэхгүй): модалын агуулга динамик — «Уялдаа нэмэх» дарахад шинэ сонгогч
 * үүсдэг тул нэг удаа тогтоосон жагсаалт хуучирна.
 */
import { useEffect, type RefObject } from 'react';

/** Фокус авах чадвартай, ИДЭВХТЭЙ (disabled/нуугдаагүй) элементүүд */
const SEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(SEL)].filter(
    // ⚠️ `offsetParent` нь `display:none`-ыг барина; `visibility:hidden`-ыг
    //    барихгүй ч манай модалуудад тийм тохиолдол алга.
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * @param ref     модалын гадна хүрээ (`role="dialog"` элемент)
 * @param active  урхи идэвхтэй эсэх — модал хаагдсан үед `false`
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return undefined;

    /* ⚠️ Өмнөх фокусыг ОДОО санана — эффект цэвэрлэгдэх үед `activeElement`
       нь аль хэдийн модал доторх (устаж буй) элемент болсон байдаг. */
    const prev = document.activeElement as HTMLElement | null;

    const first = focusable(root)[0];
    // ⚠️ Фокус авах юу ч байхгүй бол хүрээг өөрийг нь — эс тэгвээс фокус
    //    `<body>`-д үлдэж, Tab шууд ард руу гарна.
    if (first) first.focus();
    else {
      root.tabIndex = -1;
      root.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusable(root);
      if (!list.length) { e.preventDefault(); return; }
      const a = list[0];
      const z = list[list.length - 1];
      const cur = document.activeElement;
      /* ⚠️ Фокус модалаас ГАДУУР байвал (хулганаар ард нь дарсан) буцааж
         оруулна — эс тэгвээс урхи «нээлттэй» үлдэнэ. */
      if (!root.contains(cur)) { e.preventDefault(); a.focus(); return; }
      if (e.shiftKey && cur === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && cur === z) { e.preventDefault(); a.focus(); }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      // ⚠️ Элемент DOM-оос хасагдсан бол `focus()` чимээгүй бүтэлгүйтнэ —
      //    `isConnected`-оор шалгаж, эс бөгөөс фокус `<body>`-д унана.
      if (prev && prev.isConnected) prev.focus();
    };
  }, [ref, active]);
}
