/**
 * ГАРАХЫН ЦЭВЭРЛЭГЭЭ — итгэмжлэл устгах, кэш цэвэрлэхийг хуудас БОДИТООР гарах агшинд (`pagehide`) хийнэ.
 *
 * Хөтчийн «Хуудаснаас гарах уу?» асуултад «Үлдэх» сонговол `pagehide` гарахгүй тул сешн хэвээр үлдэнэ.
 * Гэхдээ бүртгэл үлдвэл хожмын F5 хэрэглэгчийг санамсаргүй гаргана. Иймд «Үлдсэн» нотолгоо ирэхэд бүртгэлийг цуцална.
 *
 * НОТОЛГОО = асуулт ГАРСАН (бодит `beforeunload`-ыг хамгаалалт `preventDefault` хийсэн) БА дараа нь хуудсан дээрх бодит оролт
 * (`pointerdown` · `keydown`), цаг хугацаа БИШ: асуулт хөтчийн урсгалыг зогсоодог тул таймер асуулт хаагдмагц «Гарах» ба
 * «Үлдэх» хоёуланд нь шууд дуусна. Таймераар цуцалбал «Гарах» сонгосон хэрэглэгчийн итгэмжлэл устахгүй үлдэнэ.
 * Асуултгүй бол «Үлдэх» гэж байхгүй — удаан сүлжээнд дарсан товч гаралтыг цуцлахгүй (дундын компьютерт нэвтэрсэн хэвээр үлдэхгүй).
 * `quietMs` — гарах хүсэлт явж байх эхний хугацаа: энэ үеийн оролт сешнийг хамгаалах шалтгаан болохгүй.
 *
 * @returns бүртгэлийг гараар цуцлах функц
 */
const INPUTS = ['pointerdown', 'keydown'] as const;

export function armSignOutCleanup(cleanup: () => void, quietMs = 2_000): () => void {
  let prompted = false;
  /* Бусад хамгаалалтаас ХОЙШ бүртгэгддэг тул тэдний шийдвэрийг харна */
  const onBefore = (e: Event): void => { if (e.defaultPrevented) prompted = true; };
  const onInput = (): void => { if (prompted) stop(); };
  const stop = (): void => {
    clearTimeout(arm);
    window.removeEventListener('pagehide', onHide);
    window.removeEventListener('beforeunload', onBefore);
    for (const ev of INPUTS) window.removeEventListener(ev, onInput, true);
  };
  const onHide = (): void => {
    stop();
    cleanup();
  };
  const arm = setTimeout(() => {
    for (const ev of INPUTS) window.addEventListener(ev, onInput, true);
  }, quietMs);
  window.addEventListener('pagehide', onHide);
  window.addEventListener('beforeunload', onBefore);
  return stop;
}
