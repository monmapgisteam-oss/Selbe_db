/**
 * НЭВТЭРСЭН ХЭРЭГЛЭГЧИЙН ArcGIS ТОКЕН — бүх REST хүсэлтэд.
 *
 * ⚠️ ЯАГААД (2026-09-17, хэрэглэгчийн шийдвэр: «нэвтрээгүй хүн системийг
 *    огт ашиглахгүй»): үйлчилгээнүүдийг Organization-only болгоход JS API-ийн
 *    давхаргууд (FeatureLayer) IdentityManager-ээс токеноо өөрөө авдаг ч
 *    шууд `fetch`-ээр явдаг 28 файл (`query.ts` · `ags.ts` · `tableWrite.ts` ·
 *    `hyanalt*.ts` · анализ …) токенгүй тул хоосон хариу/алдаа авна.
 *    Энэ модуль НЭГ эх сурвалж: `AuthGate` нэвтрэлт бүтмэгц IdentityManager-ээ
 *    бүртгэнэ, дараа нь `tokenParam()`/`tokenQs()` синхрон уншина.
 *
 * ⚠️ Токен POST-ын БИЕЭР явахыг эрхэмлэнэ (`tokenParam`); GET-д (`tokenQs`)
 *    зөвхөн бэлэн URL-тэй кэшлэгддэг хүсэлтүүдэд. Логд, алдааны мессежид
 *    URL бичихдээ токеныг оруулахгүй байхыг анхаар.
 *
 * ⚠️ Нэвтрэлт унтраалттай (`AUTH.appId` хоосон) эсвэл Node (тест/tools)
 *    орчинд хоосон буцаана — зан төлөв өөрчлөгдөхгүй.
 */

type Esri = { findCredential: (url: string) => { token?: string } | null | undefined };

let esri: Esri | null = null;
let sharing = '';

/** `AuthGate` нэвтрэлт бүтмэгц дуудна. */
export function registerIdentity(mgr: Esri, sharingUrl: string): void {
  esri = mgr;
  sharing = sharingUrl;
}

export function authToken(): string | null {
  if (!esri || !sharing) return null;
  try {
    return esri.findCredential(sharing)?.token ?? null;
  } catch {
    return null;
  }
}

/** POST-ын биед задлах: `{ token }` эсвэл `{}`. */
export function tokenParam(): Record<string, string> {
  const t = authToken();
  return t ? { token: t } : {};
}

/** GET URL-ийн төгсгөлд залгах: `&token=…` эсвэл `''`. */
export function tokenQs(): string {
  const t = authToken();
  return t ? `&token=${encodeURIComponent(t)}` : '';
}
