/**
 * ХАДГАЛААГҮЙ АЖЛЫН ЕРӨНХИЙ ХАМГААЛАЛТ — харагдац бүр өөрийн «засвар дундаа» төлвийг
 * энд тэмдэглэж, `Portal.confirmLeave` (харагдац солих · лого · «Гарах») ба хөтчийн
 * `beforeunload` (F5 · таб хаах) НЭГ газраас асууна.
 *
 * ⚠️ 2026-09-30 (төслийн аудит): урьд нь зөвхөн «Хуваарь» (`planNavBusy`) ба «Санхүү»
 *    (`finNavDirty`) хамгаалагдсан байв — «Дэд бүтэц», «Газар», «Зөвшөөрөл»-ийн засварын
 *    маягт харагдац солиход, F5 дарахад асуултгүй алга болдог байлаа. Шинэ харагдац
 *    `Portal`-ийг хөндөлгүй `setNavDirty('түлхүүр', true, 'нэр')` дуудахад л хамгаалагдана.
 * ⚠️ ИМПОРТГҮЙ lib — харагдацууд `dynamic` ачаалалттай тул `Portal` тэднийг импортлохгүй
 *    (`finEdit.setFinNavDirty`-ийн ижил шалтгаан). Unmount болоход харагдац ЗААВАЛ
 *    `setNavDirty(key, false)` дуудна — эс бөгөөс хуучин туг «хадгалаагүй» гэж худал асууна.
 */

const dirty = new Map<string, string>();

function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (!dirty.size) return;
  e.preventDefault();
  /* Хуучин хөтчүүд `returnValue`-г шаарддаг — текст нь харагдахгүй (хөтөч өөрийнхийг гаргана) */
  e.returnValue = '';
}

function sync(): void {
  if (typeof window === 'undefined') return;
  window.removeEventListener('beforeunload', onBeforeUnload);
  if (dirty.size) window.addEventListener('beforeunload', onBeforeUnload);
}

/**
 * @param key   харагдац/маягтын түлхүүр (`butets` · `gazar` · `zovshoorol` …)
 * @param on    хадгалаагүй өөрчлөлт байгаа эсэх
 * @param label асуултад гарах нэр (жиш. «Инженерийн дэд бүтэц») — дуудагч `tr()`-ээр өгнө
 */
export function setNavDirty(key: string, on: boolean, label = key): void {
  const had = dirty.has(key);
  if (on) dirty.set(key, label); else dirty.delete(key);
  if (had !== on) sync();
}

/** Хадгалаагүй ажилтай хэсгүүдийн нэрс (хоосон = хамгаалах юм алга) */
export function navDirtyLabels(): string[] {
  return [...dirty.values()];
}

/** Тест/гарах үед — бүх тугийг цэвэрлэнэ */
export function _resetNavDirty(): void {
  dirty.clear();
  sync();
}
