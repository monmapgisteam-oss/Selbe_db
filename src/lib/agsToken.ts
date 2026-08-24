'use client';

/**
 * ARCGIS-ИЙН НЭВТРЭЛТИЙН TOKEN — түүхий `fetch`-д хавсаргах ГАНЦ ЦЭГ.
 *
 * ⚠️ ЯАГААД ЭНЭ ФАЙЛ ХЭРЭГТЭЙ ВЭ (2026-08-24):
 * ArcGIS SDK-ийн `IdentityManager` нь SDK-гаар явсан хүсэлтэд (`FeatureLayer`,
 * `@arcgis/core/rest/query`) token-оо ӨӨРӨӨ хавсаргадаг. Гэтэл порталын
 * өгөгдлийн давхарга (`query.ts`, `ags.ts`, `hyanalt.ts`, `parcelOverlap.ts` …)
 * нь ХУРДНЫ учир түүхий `fetch` ашигладаг бөгөөд тэдгээрт token ОГТ явдаггүй
 * байв. Давхаргууд нийтэд нээлттэй байсан тул энэ нь мэдэгддэггүй байсан —
 * харин давхаргыг «Organization» болгомогц ЭДГЭЭР БҮХ ДУУДАЛТ 499/403 болж
 * портал бүхэлдээ унана. Энэ модуль тэр цоорхойг хаана.
 *
 * ⚠️ НЭВТРЭХ ЦОНХ ГАРГАХГҮЙ: `findCredential` нь БАЙГАА эрхийг л шалгана
 * (`getCredential` бол шаардвал popup нээдэг). Өгөгдлийн дуудалт нэвтрэлт
 * хүсэх ёсгүй — нэвтрэлтийг зөвхөн `AuthGate` эхлүүлнэ.
 *
 * ⚠️ НЭВТРЭЛТ УНТРААЛТТАЙ үед (`AUTH.appId` хоосон) SDK-г ачаалахгүйгээр шууд
 * `null` буцаана — токенгүй хүсэлт нь өнөөдрийнхтэй ЯГ ИЖИЛ ажиллана.
 *
 * ⚠️ ОЛОН БАЙГУУЛЛАГА: энэ token нь `AUTH.portalUrl`-ийн байгууллагынх
 * (`HJzgwvlNIXssnQar`). Тэр байгууллагын hosted үйлчилгээнд шууд үйлчилнэ.
 * Харин `services-ap1…/ACqsMOmNLi5wIdIh` (газар чөлөөлөлт, гүйцэтгэлийн
 * хяналт) ба `…/OgVoRiKUkHg9Iokz` (IoT мэдрэгч) нь ӨӨР байгууллага тул энэ
 * token тэдгээрийн «зөвхөн байгууллага» давхаргыг НЭЭХГҮЙ. Тэдгээрийг
 * хаахаасаа өмнө эхлээд нэг байгууллага руу нэгтгэх, эсвэл тэнд ч гишүүнчлэл
 * өгөх шаардлагатай.
 */

import { AUTH } from './services';

/** portalUrl-ийн сүүлийн '/'-г арилгаад /sharing нэмнэ (AuthGate-тэй ИЖИЛ дүрэм) */
const sharingUrl = () => `${AUTH.portalUrl.replace(/\/+$/, '')}/sharing`;

/** IdentityManager-ийн модуль — нэг л удаа ачаалж дахин ашиглана */
let idMod: Promise<typeof import('@arcgis/core/identity/IdentityManager')> | null = null;
/** Ачаалагдсан IdentityManager ба сүүлд мэдэгдэж байсан token — синхрон хандалтад */
let esriIdRef: __esri.IdentityManager | null = null;
let lastToken: string | null = null;

/**
 * Одоо нэвтэрсэн хэрэглэгчийн token. Нэвтрээгүй / унтраалттай бол `null`.
 *
 * ⚠️ Дуудагч нь `null`-ийг АЛДАА гэж үзэхгүй: нээлттэй давхарга token-гүй ч
 * ажиллана. Хаалттай давхарга дээр ArcGIS өөрөө 499 буцаана.
 */
export async function agsToken(): Promise<string | null> {
  // Сервер талд (build) DOM/credential байхгүй; нэвтрэлт унтраалттай бол ч мөн
  if (typeof window === 'undefined' || !AUTH.appId) return null;
  try {
    if (!idMod) idMod = import('@arcgis/core/identity/IdentityManager');
    const { default: esriId } = await idMod;
    esriIdRef = esriId;
    // ⚠️ findCredential — БАЙГАА эрхийг буцаана, popup гаргахгүй
    const cred = esriId.findCredential(sharingUrl());
    lastToken = cred?.token ?? null;
    return lastToken;
  } catch {
    // SDK ачаалагдаагүй / эрх байхгүй — токенгүй үргэлжилнэ
    return null;
  }
}

/**
 * СИНХРОН хувилбар — `<img src>` зэрэг мөр угсрахад (`await` хийх боломжгүй).
 *
 * ⚠️ SDK нэг ч удаа ачаалагдаагүй байвал `null` буцаана. Практикт `AuthGate`
 * эхлэхдээ IdentityManager-ийг ачаалдаг бөгөөд хавсралтын зураг нь өгөгдлийн
 * дуудалтын ДАРАА л зурагддаг тул кэш дулаан байна.
 */
export function agsTokenSync(): string | null {
  if (typeof window === 'undefined' || !AUTH.appId) return null;
  try {
    return esriIdRef?.findCredential(sharingUrl())?.token ?? lastToken;
  } catch {
    return lastToken;
  }
}

/**
 * URL-д token залгана (синхрон) — хавсралтын зураг татах хаягт.
 *
 * ⚠️ Token нь хэрэглэгчийн ӨӨРИЙНХ бөгөөд түүний л browser-т үлдэнэ; ArcGIS-ийн
 * өөрийн widget-ууд ч хавсралтыг яг ингэж татдаг.
 */
export function withTokenUrl(url: string): string {
  const t = agsTokenSync();
  return t ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(t)}` : url;
}

/**
 * ArcGIS-ийн хүсэлтийн параметрт token нэмнэ.
 *
 * Дуудагч бүр `await agsParams({...})` гэж бичихэд хангалттай — нэвтрээгүй үед
 * параметр өөрчлөгдөхгүй тул одоогийн ажиллагаа хэвээр.
 */
export async function agsParams(
  params: Record<string, string>,
): Promise<Record<string, string>> {
  const token = await agsToken();
  return token ? { ...params, token } : params;
}
