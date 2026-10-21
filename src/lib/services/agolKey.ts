/**
 * AGOL ТҮЛХҮҮРИЙН СУУРЬ (2026-10-20, Enterprise руу БҮРЭН шилжилт) — СҮЛЖЭЭНИЙ ХАЯГ БИШ.
 *
 * ⚠️ Систем БҮХ өгөгдлийг Сэлбэ Enterprise-ээс (`gis.selbecity.mn`, env `NEXT_PUBLIC_ENT_DATA`) уншина. Гэвч кодод
 *    ~90 газар давхаргууд `${HJ}/<AGOL үйлчилгээ>/FeatureServer/<№>` хэлбэрээр бичигдсэн бөгөөд `entMap.data.ts`-ийн
 *    зураглал ЯГ ЭНЭ хэлбэрийг түлхүүр болгодог (`entMap.remapUrl` → Enterprise хаяг). Мөн webmap-загварын
 *    снапшот (`public/webmap-style.json`) энэ хаягаар түлхүүрлэгдсэн. Тиймээс суурь нь ТОГТМОЛ мөр.
 * ⚠️ Энэ хаяг руу хүсэлт ХЭЗЭЭ Ч явахгүй: `query.run` зураглагдаагүй AGOL хаягийг ил алдаагаар татгалзана,
 *    JS API-ийн давхарга `layerUrl` → `remapUrl`-аар Enterprise хаяг авна.
 * ⚠️ Урьд нь `NEXT_PUBLIC_ARCGIS_HJ` · `NEXT_PUBLIC_ARCGIS_GAZAR` хувьсагчаас уншдаг байв — хэрэглэгч AGOL-ыг бүрэн
 *    хаяж тэдгээр хувьсагчийг GitHub-аас устгасан (2026-10-20). Импортгүй модуль — ачаалалтын мөчлөг үүсгэхгүй.
 */
export const AGOL_KEY_BASE = 'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services';
