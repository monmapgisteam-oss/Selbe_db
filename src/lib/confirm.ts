/**
 * АППЫН ДОТООД АСУУЛТ ба «БУЦААХ» МЭДЭГДЭЛ — `window.confirm`-ийн оронд (⚠️ 2026-10-23, UX аудит X1).
 *
 * ```ts
 * import { askConfirm, toastUndo } from '@/lib/confirm';
 * if (!(await askConfirm(tr('Энэ мөрийг устгах уу?'), { danger: true, ok: tr('Устгах') }))) return;
 * void toastUndo(tr('Мөр устгагдлаа'), () => restore(row));
 * ```
 *
 * ⚠️ ЯАГААД: `window.confirm`-ийг хөтөч «энэ хуудас дахин харилцах цонх үүсгэхгүй» сонголтоор хаасан
 *    бол АСУУЛТГҮЙ `false` буцаадаг — «Батлах»/«Буцаах»/«Устгах» товч ЧИМЭЭГҮЙ юу ч хийхгүй болдог байв
 *    (`DedButets.confirmQ`-ийн ⚠️ 2026-09-23). Порталд ~70 ийм цэг байв.
 * ⚠️ React-гүй ЦЭВЭР модуль — lib-ийн гүн дуудлагууд ч (`ajilBatlah.ts` г.м.) импортолж болно; харагдах хэсэг нь
 *    `components/ConfirmHost.tsx` (`Root`-д НЭГ удаа суурилагдсан).
 * ⚠️ ХОСТ АЛГА бол (нэгж тест · Node · `Root`-оос гадуурх мод) `window.confirm` руу буцна, тэр ч алга бол `false` —
 *    шалгууруудын `window.confirm` стуб хэвээр ажиллана (`confirm.check.mjs`).
 * ⚠️ Асуултууд ДАРААЛЛААР (нэг зэрэг нэг л цонх) — хоёр дахь нь эхнийх шийдэгдтэл хүлээнэ.
 * ⚠️ `beforeunload` ХӨТЧИЙН ӨӨРИЙН цонх хэвээр — синхрон тул энэ API тэнд ажиллахгүй.
 */

export type ConfirmOpts = {
  /** Батлах товчны бичиг (анхдагч «Тийм») */
  ok?: string;
  /** Болих товчны бичиг (анхдагч «Болих») */
  cancel?: string;
  /** Устгал/буцаах боломжгүй үйлдэл — улаан товч, фокус «Болих» дээр */
  danger?: boolean;
  /** Цонхны гарчиг (сонголттой) */
  title?: string;
};

export type ConfirmReq = { id: number; message: string; opts: ConfirmOpts };
export type UndoToast = { id: number; message: string; ms: number };
export type ConfirmSnap = { req: ConfirmReq | null; toast: UndoToast | null };

type Pending = ConfirmReq & { resolve: (v: boolean) => void };
type ToastEntry = UndoToast & { onUndo: () => void; resolve: (undone: boolean) => void };

let hosts = 0;
let seq = 0;
const queue: Pending[] = [];
let toast: ToastEntry | null = null;
let snap: ConfirmSnap = { req: null, toast: null };
const listeners = new Set<() => void>();

const emit = (): void => {
  const head = queue[0];
  /* ⚠️ Агшин нь шинэ объект зөвхөн өөрчлөлтөд — `useSyncExternalStore` тогтвортой identity шаарддаг */
  snap = {
    req: head ? { id: head.id, message: head.message, opts: head.opts } : null,
    toast: toast ? { id: toast.id, message: toast.message, ms: toast.ms } : null,
  };
  for (const fn of [...listeners]) fn();
};

/** `useSyncExternalStore`-ийн subscribe */
export function subscribeConfirm(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** `useSyncExternalStore`-ийн getSnapshot */
export const getConfirmSnapshot = (): ConfirmSnap => snap;

const EMPTY: ConfirmSnap = { req: null, toast: null };
/** Prerender/сервер — үргэлж хоосон */
export const getConfirmServerSnapshot = (): ConfirmSnap => EMPTY;

/**
 * Хост бүртгэнэ (`ConfirmHost`-ын эффект). Буцаах функц нь бүртгэлийг хасна — СҮҮЛИЙН хост салвал хүлээгдэж буй
 * асуулт бүр `false` (Болих), «Буцаах» мэдэгдэл `false` (буцаагаагүй) болж шийдэгдэнэ: хариулах хүнгүй Promise үүрд
 * өлгөөтэй үлдэхгүй.
 */
export function registerConfirmHost(): () => void {
  hosts += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    hosts -= 1;
    if (hosts > 0) return;
    const left = queue.splice(0);
    const t = toast;
    toast = null;
    for (const p of left) p.resolve(false);
    t?.resolve(false);
    emit();
  };
}

/** Хост суурилагдсан эсэх */
export const hasConfirmHost = (): boolean => hosts > 0;

type WinLike = { confirm?: (m: string) => boolean };
const win = (): WinLike | undefined => (globalThis as { window?: WinLike }).window;

/**
 * Асуулт асууна — `true` = батлав, `false` = болив (Esc · «Болих» · ард нь дарсан).
 * ⚠️ ҮРГЭЛЖ асинхрон — дуудагч `await` хийнэ (хандлагч функцээ `async` болгоно).
 */
export function askConfirm(message: string, opts: ConfirmOpts = {}): Promise<boolean> {
  if (hosts <= 0) {
    const w = win();
    if (w && typeof w.confirm === 'function') {
      try {
        return Promise.resolve(!!w.confirm(opts.title ? `${opts.title}\n\n${message}` : message));
      } catch {
        return Promise.resolve(false);
      }
    }
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    queue.push({ id: ++seq, message, opts, resolve });
    emit();
  });
}

/** Хост: одоогийн асуултыг шийднэ (`id` зөрвөл — аль хэдийн шийдэгдсэн — юу ч хийхгүй) */
export function settleConfirm(id: number, value: boolean): void {
  const head = queue[0];
  if (!head || head.id !== id) return;
  queue.shift();
  emit();
  head.resolve(value);
}

/**
 * «БУЦААХ» МЭДЭГДЭЛ — устгах мэт үйлдлийн ДАРАА. `true` = хэрэглэгч «Буцаах» дарав (`onUndo` аль хэдийн дуудагдсан),
 * `false` = хугацаа дуусав / хаав / өөр мэдэгдлээр солигдов / хост алга.
 *
 * Хоёр хэв:
 * 1) Шууд хийгээд буцаана: `doDelete(); void toastUndo(msg, () => restore());`
 * 2) Хугацаа дуустал хойшлуулна: `if (await toastUndo(msg, () => {})) return; await doDelete();`
 *
 * ⚠️ Нэг зэрэг НЭГ мэдэгдэл — шинэ нь хуучныг `false`-оор хаана (2-р хэвийн хойшлогдсон устгал тэр агшинд хийгдэнэ).
 * ⚠️ Хост алга бол шууд `false` (буцаах хүн алга — 2-р хэвд устгал шууд явна).
 * ⚠️ Хулгана/фокус дээр нь байхад хугацаа зогсоно (WCAG 2.2.1) — `ConfirmHost`.
 */
export function toastUndo(message: string, onUndo: () => void, ms = 6000): Promise<boolean> {
  if (hosts <= 0) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const prev = toast;
    toast = { id: ++seq, message, ms: Math.max(1000, ms), onUndo, resolve };
    emit();
    prev?.resolve(false);
  });
}

/** Хост: мэдэгдлийг хаана — `undo` бол `onUndo`-г дуудна. `id` зөрвөл юу ч хийхгүй. */
export function settleToast(id: number, undo: boolean): void {
  const t = toast;
  if (!t || t.id !== id) return;
  toast = null;
  emit();
  if (undo) {
    try { t.onUndo(); } catch (e) { console.error('[selbe] toastUndo onUndo:', e); }
  }
  t.resolve(undo);
}
