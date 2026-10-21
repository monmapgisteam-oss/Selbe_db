/**
 * ENTERPRISE — JS API ХҮСЭЛТИЙН ХӨРВҮҮЛЭГЧ (2026-10-20, `services/entMap.ts`-ийн ⚠️ «ТАЛБАРЫН НЭР»).
 *
 * ⚠️ ЯАГААД: газрын зургийн давхарга (FeatureLayer), ноорог/эрхийн хүснэгтийн `FeatureLayer.queryFeatures`/
 *    `applyEdits` нь `query.ts`-ийн цөмөөр БИШ, JS API-ийн өөрийн `esri/request`-ээр явдаг. Enterprise-ийн
 *    жижиг үсэгтэй талбар дээр `outFields: ['BAGTS']` → 500, хариултын `attributes.bagts` → код `attributes.BAGTS`
 *    гэж уншиж хоосон болно. `esriConfig.request.interceptors` нь JS API-ийн БҮХ хүсэлтэд (давхаргын мета ·
 *    асуулга · layerView-ийн worker-ийн татлага · applyEdits) ажилладаг (2026-10-20-нд puppeteer-оор батлав):
 *      · `before`: outFields · orderByFields · outStatistics · where (нэр өөрчлөгдсөн) · adds/updates → Enterprise нэр;
 *      · `after`:  давхаргын МЕТА (`fields[].name` · `objectIdField` · `editFieldsInfo`) ба асуулгын хариу
 *        (`features[].attributes` · `fields`) → эх нэр; метан дээр `supportedQueryFormats = 'JSON'` — эс бөгөөс
 *        JS API PBF-ээр асууж, хоёртын хариуг хөрвүүлэх боломжгүй (толь байхгүй давхаргад PBF хэвээр).
 *    Ингэснээр JS API-ийн давхарга (fields · fieldsIndex · popup · renderer · graphic.attributes) AGOL-ынхтай
 *    ЯГ ИЖИЛ, эх нэртэй харагдана — 23 модулийн кодыг хөндөхгүй.
 * ⚠️ Зөвхөн `NEXT_PUBLIC_ENT_DATA`-ийн дор буй хаягт (`urls` угтвар). Нэг л удаа суулгана (`installed`).
 * ⚠️ Дуудах цэг: `AuthGate` (аппын эхэнд, нэвтрэлтээс үл хамааран) · `MapCanvas`/`SuitMap` (view үүсгэхээс өмнө) ·
 *    FeatureLayer кэштэй lib-үүд (`draftRemote` · `permsRemote` · `qaqcDraftRemote`). Node-д (тест) JS API
 *    ачаалагдахгүй тул чимээгүй алгасна.
 */
import {
  ENT_DATA, entDict, entRequestWith, entResponseWith, isLayerMeta, requestedFields, type EntDict,
} from '@/lib/services/entMap';

type Query = Record<string, unknown>;
type Before = { url: string; requestOptions: { query?: Query } & Record<string, unknown> };
type After = { url: string; data?: unknown; requestOptions?: { query?: Query } & Record<string, unknown> };

/** Хүсэлтээс хариу руу дуудагчийн `outFields`-ийн үсгийг дамжуулах түлхүүр (requestOptions дээр) */
const REQ_KEY = '__selbeEntOut';

/** Массив параметрийг (JS API заримдаа массив өгдөг) мөр болгож, мөрүүдийг л хөрвүүлнэ (цэвэр — тест) */
export function entJsBefore(query: Query, d: EntDict | null): { query: Query; requested: string[] } {
  const strs: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (typeof v === 'string') strs[k] = v;
    else if (Array.isArray(v) && ['outFields', 'orderByFields', 'groupByFieldsForStatistics'].includes(k)) strs[k] = v.join(',');
  }
  const requested = requestedFields(strs);
  const mapped = entRequestWith(strs, d);
  return { query: { ...query, ...mapped }, requested };
}

/** Хариуг хөрвүүлнэ; мета бол PBF-ийг хаана (цэвэр — тест) */
export function entJsAfter(data: unknown, d: EntDict | null, requested: readonly string[]): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const body = data as Record<string, unknown>;
  entResponseWith(body, d, requested);
  if (d && isLayerMeta(body) && typeof body.supportedQueryFormats === 'string') body.supportedQueryFormats = 'JSON';
  return body;
}

let installed = false;
/** `esriConfig.request.interceptors`-т нэг удаа суулгана — JS API байхгүй (Node) бол юу ч хийхгүй */
export async function installEntInterceptor(): Promise<void> {
  if (installed || !ENT_DATA) return;
  installed = true;
  let esriConfig: { request: { interceptors: unknown[] } };
  try {
    esriConfig = (await import('@arcgis/core/config')).default as unknown as typeof esriConfig;
  } catch {
    installed = false;
    return;
  }
  esriConfig.request.interceptors.push({
    urls: ENT_DATA,
    before(p: Before) {
      const q = p.requestOptions?.query;
      if (!q) return;
      const d = entDict(p.url);
      const { query, requested } = entJsBefore(q, d);
      p.requestOptions.query = query;
      p.requestOptions[REQ_KEY] = requested;
    },
    after(r: After) {
      const requested = (r.requestOptions?.[REQ_KEY] as string[] | undefined) ?? [];
      r.data = entJsAfter(r.data, entDict(r.url), requested);
    },
  });
}
